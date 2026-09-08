/* ================================================================================================================
 * KMFSG — SHARED FACTORY STOCK GUARD  (F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 §2/§3/§4/§6)
 * ----------------------------------------------------------------------------------------------------------------
 * THE SAME PHYSICAL CARTON WAS PLANNABLE AN UNLIMITED NUMBER OF TIMES, BECAUSE NOTHING EVER ADDED THE PLANS UP.
 *
 * The census of this round measured the whole of it. `gapOpReadSupplyPoolFacts_` (43_) builds the FACTORY pool from
 * `factory_stock.fac_current_stock` and NOTHING ELSE: it does not subtract `fac_reserved_stock`, and it does not
 * look at a single persisted plan. Within ONE generation run KMMSA/KMALLOC conserves that pool correctly across
 * competing receivers — so one run cannot over-allocate itself. But a SECOND run, a manual Execution Plan, another
 * marketplace, another COMPANY, or a Weekly Shipping Plan already sitting in Pending Approval are all invisible to
 * it. Every one of those is a live claim on the same physical units at the same factory warehouse, and the arithmetic
 * that would have noticed did not exist anywhere in the system.
 *
 * THIS MODULE IS THAT ARITHMETIC, AND IT IS DELIBERATELY THE ONLY COPY. Two mechanisms consume it — an AI hard limit
 * that can never be overridden, and a human overage confirmation that can. They MUST agree about what is available,
 * or the human is confirming an overage against a different number than the one the AI refused. So availability is
 * computed HERE, once, and both callers are handed the same object.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * WHAT A POOL IS, AND WHY IT IS NOT A COMPANY.
 *
 * Company / Country / Marketplace are where goods are GOING. They say nothing about which physical stock can be
 * drawn on. One factory warehouse supplies every company, country and marketplace, so filtering the pool by the
 * requesting company before doing the arithmetic is precisely how two companies each come to plan the same units.
 * That is not a hypothetical: `weeklyAiPlanPoolsBySku_` (61_) already keys factory pools by SKU ALONE, exactly
 * because they are shared, while keying overseas pools by company||country. The exposure side never caught up.
 *
 * The pool identity is therefore `warehouse_id || sku`, and `inventory_pool_id` is accepted as an OVERRIDE for the
 * day it exists so that a future migration needs no code change here. `warehouse_id` is NOT optional and two
 * different warehouse_ids are NEVER summed: stock at two physical factories is not interchangeable, and adding it
 * up would manufacture availability that no one can ship (§2).
 *
 * ---------------------------------------------------------------------------------------------------------------
 * THE DEDUP RULE, DERIVED FROM THE LINEAGE THAT ACTUALLY EXISTS (§1.6).
 *
 * A quantity travels Allocation Draft -> Weekly Shipping Plan -> Shipment. It must be counted in exactly ONE of
 * them at any instant. It is, and the reason is a property of the writers rather than a rule anyone must remember:
 *
 *   DRAFT -> PLAN.  `sadSubmitToShippingPlansCore_` (16_) commits the plan, reads it back, and ONLY THEN sets the
 *     draft's status to `submitted` — all inside one ScriptLock, with a captured before-state and a verified
 *     rollback if the transition cannot be confirmed. `submitted` is TERMINAL (16_ SAD_TERMINAL_STATUSES_, KMARC
 *     TERMINAL_STATUSES), so the draft leaves the active set in the same operation that creates the plan. There is
 *     no FK from `shipping_plans` back to `allocation_draft_id` — and none is needed for THIS arithmetic, because
 *     the two sets are disjoint by status, not by join.
 *
 *   PLAN -> SHIPMENT. `createShipmentFromApprovedPlan_` (12_) acquires the factory reservation (12_:660,
 *     factoryStockAcquireReservationTx_, owner type `shipment`) and stamps `transferred_shipment_id` /
 *     `transferred_to_shipment_at` onto the plan (12_:690) in ONE journalled operation that rolls the whole draft
 *     back if the acquire fails. So `transferred_shipment_id` present <=> the units are now inside
 *     `fac_reserved_stock`. THAT is the FK, it is real, and it is why a transferred plan must stop counting: its
 *     units are already subtracted by `available = current - reserved`. Counting both is the one double-count this
 *     model can actually commit, and it is excluded by name.
 *
 * A reservation is NEVER created by this guard. `FSTX_RESERVATION_OWNER_TYPE_ = 'shipment'` is documented in 21_:405
 * as "the only reservation owner in the frozen model", the AI Plan activation manifest (61_:615) declares
 * `reservation_expected: false` with `reservations` in `tables_guaranteed_zero_mutation`, and
 * DATABASE_RELATIONSHIP_MAP §7.5B:810 states that a persisted Draft "triggers no reservation and creates no
 * inventory movement". Exposure at the draft and plan stages is therefore DERIVED — read from the rows that exist —
 * and not a stored counter. That is a stronger property, not a weaker one: a derived exposure cannot drift from the
 * rows it summarises, and there is no ledger to leak when a run dies half-way.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * THE TWO MECHANISMS ARE NOT ONE OVERRIDE WITH TWO CALLERS.
 *
 *   evaluateAiGuard   — a HARD limit. It takes no token, no reason and no actor, and there is no argument that
 *                       makes it pass. It either fits, or it is clamped to what fits, or it refuses. An automated
 *                       generation cannot know that a shortfall is covered by an arrangement outside this database,
 *                       so it is never allowed to assume one.
 *   evaluateOverage   — a CHALLENGE. It returns the complete picture and a fingerprint of the facts it read, so a
 *                       person with existing submit authority can state a reason and accept the overage. The
 *                       fingerprint is what makes that acceptance specific: it authorises ONE arithmetic, and the
 *                       moment the stock or another plan moves, the same confirmation is stale and is refused.
 *
 * Both are computed from `availableToAllocate`. Neither can see the other's inputs.
 *
 * PURE. This module reads no sheet, holds no clock, mutates no input, and never decides a route, a carrier or a
 * priority order of its own. When the frozen allocation authority cannot settle a shortfall it says so and STOPS
 * (§3.9) rather than inventing a station order — inventing one is how a guard becomes a silent allocator.
 * ================================================================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KMFSG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONTRACT = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 - one shared factory pool (warehouse_id||sku, never filtered '
    + 'by company), availability = (fac_current_stock - fac_reserved_stock) - active allocation-draft exposure - '
    + 'active shipping-plan exposure not yet transferred to a shipment. AI is hard-limited and can never override; '
    + 'a human with submit authority may confirm an overage against a fingerprinted snapshot.';

  // ==============================================================================================================
  // §6 — THE LIFECYCLE MATRIX, AS DATA.
  //
  // Written as tables rather than as conditions inside the arithmetic, because "which statuses hold exposure" is a
  // question a reader and a test both need to ask directly, and because the answer differs per TABLE. A status name
  // that means one thing on an allocation draft means another on a shipping plan, and conflating them is how a
  // terminal row comes back to life in a total.
  // ==============================================================================================================

  // Allocation draft HEADER. Byte-for-byte the server's own ACTIVE literal (16_ sadK2ResolveActiveDraft_ /
  // sadK4ResolveActiveDraft_, mirrored by KMARC.ACTIVE_STATUSES). `partially_submitted` is not in SAD_STATUSES_ and
  // is kept anyway, exactly as the server keeps it: a partially submitted header still owns the quantity it holds.
  var DRAFT_EXPOSURE_STATUSES = { draft: 1, site_confirmed: 1, partially_submitted: 1 };
  // `submitted` is here and NOT in the exposure set: at that instant the quantity lives in shipping_plans.
  var DRAFT_RELEASED_STATUSES = { submitted: 1, cancelled: 1, expired: 1 };
  // A LINE is terminal on its own axis. `submitted` is deliberately NOT terminal (KMARC.TERMINAL_LINE_STATUSES):
  // 16_ keeps a submitted line in its active set. `superseded` / `superseded_user_review` hold nothing.
  var DRAFT_LINE_RELEASED_STATUSES = { cancelled: 1, expired: 1, superseded: 1, superseded_user_review: 1 };

  // Shipping PLAN header (11_ handleUpdateShippingPlanStatus_ transitions: submit/approve/reject/cancel).
  // `rejected` is NOT a resting status — reject writes status back to `draft` and records rejected_* — so it is
  // absent from both sets on purpose rather than by omission.
  var PLAN_EXPOSURE_STATUSES = { draft: 1, pending_approval: 1, approved: 1 };
  var PLAN_RELEASED_STATUSES = { cancelled: 1, completed: 1 };

  var EXPOSURE_STAGE = {
    ALLOCATION_DRAFT: 'ALLOCATION_DRAFT',
    SHIPPING_PLAN: 'SHIPPING_PLAN',
    SHIPMENT_RESERVATION: 'SHIPMENT_RESERVATION'
  };

  var RELEASE_REASON = {
    STATUS_RELEASED: 'STATUS_RELEASED',
    LINE_STATUS_RELEASED: 'LINE_STATUS_RELEASED',
    STATUS_UNRECOGNISED: 'STATUS_UNRECOGNISED',
    TRANSFERRED_TO_SHIPMENT: 'TRANSFERRED_TO_SHIPMENT',
    NO_HEADER: 'NO_HEADER',
    NO_POOL: 'NO_POOL',
    BLANK_QTY: 'BLANK_QTY',
    SELF_EXCLUDED: 'SELF_EXCLUDED',
    IN_RELEASE_SET: 'IN_RELEASE_SET'
  };

  var VERDICT = {
    PASS: 'PASS',
    CLAMPED: 'CLAMPED',
    STOP: 'STOP',
    OVERAGE_CONFIRMATION_REQUIRED: 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED'
  };

  var STOP_CODE = {
    PRIORITY_UNRESOLVED: 'FACTORY_STOCK_ALLOCATION_PRIORITY_UNRESOLVED',
    POOL_UNKNOWN: 'FACTORY_STOCK_POOL_UNKNOWN',
    BALANCE_UNREADABLE: 'FACTORY_STOCK_BALANCE_UNREADABLE'
  };

  var REFUSAL = {
    STALE_SNAPSHOT: 'FACTORY_STOCK_OVERAGE_SNAPSHOT_STALE',
    MISSING_REASON: 'FACTORY_STOCK_OVERAGE_REASON_REQUIRED',
    MISSING_ACTOR: 'FACTORY_STOCK_OVERAGE_ACTOR_REQUIRED',
    MISSING_FINGERPRINT: 'FACTORY_STOCK_OVERAGE_FINGERPRINT_REQUIRED',
    UNKNOWN_REASON: 'FACTORY_STOCK_OVERAGE_REASON_NOT_RECOGNISED',
    NOT_AUTHORISED: 'FACTORY_STOCK_OVERAGE_ACTOR_NOT_AUTHORISED',
    NO_OVERAGE: 'FACTORY_STOCK_OVERAGE_NOT_PRESENT'
  };

  // §4 — the four reasons the modal offers, and nothing else. A free-text-only reason would make the audit
  // unsearchable; `other` is present precisely so that "something else" is still a CHOICE with a note beside it
  // rather than an empty string that means nothing.
  var OVERRIDE_REASONS = {
    cross_site_reallocation: 'Cross-site reallocation',
    incoming_production_confirmed: 'Incoming production confirmed',
    physical_stock_pending_system_update: 'Physical stock pending system update',
    other: 'Other'
  };

  function str(v) { return String(v == null ? '' : v).trim(); }
  function lo(v) { return str(v).toLowerCase(); }

  // A blank is NEVER a zero. `qty` returns null for anything that is not a finite number, and every caller below
  // decides explicitly what an unreadable quantity means for IT — which is the distinction this project has had to
  // repair more than once (MISSING IS NEVER ZERO).
  function qty(v) {
    if (v === null || v === undefined || str(v) === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function int(v) { var n = qty(v); return n === null ? null : Math.round(n); }

  // FNV-1a, 8 hex chars. Byte-identical to 16_ `sadFnv1a_` so the system has ONE fingerprint algorithm; the
  // regression suite asserts that equality against the shipped handler source rather than trusting this comment.
  function fnv1a(s) {
    var h = 0x811c9dc5; s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  /**
   * §2 — THE POOL KEY. `warehouse_id || sku`, with `inventory_pool_id` honoured when it exists.
   *
   * Returns '' when either axis is blank, and every caller treats '' as NOT COUNTABLE rather than as a catch-all
   * bucket. A row whose warehouse is unknown is not stock at some default factory; it is a row whose pool nobody
   * can name, and silently pooling those together is exactly the "different physical stock added up" error §2
   * forbids.
   */
  function poolKey(warehouseId, sku, inventoryPoolId) {
    var p = str(inventoryPoolId);
    var s = str(sku);
    if (!s) return '';
    if (p) return 'POOL:' + p + '||' + s;
    var w = str(warehouseId);
    if (!w) return '';
    return 'WH:' + w + '||' + s;
  }

  function poolKeyOf(row, opts) {
    row = row || {}; opts = opts || {};
    var wh = row.warehouse_id != null ? row.warehouse_id : row.warehouseId;
    if (str(wh) === '' && opts.warehouseFallback) wh = opts.warehouseFallback;
    return poolKey(wh, row.sku != null ? row.sku : row.SKU, row.inventory_pool_id != null ? row.inventory_pool_id : row.inventoryPoolId);
  }

  // ==============================================================================================================
  // §2 — THE PHYSICAL SIDE.
  //
  // `available = fac_current_stock - fac_reserved_stock`, which is 21_ factoryStockReadBalanceTx_'s own definition
  // and 21_'s documented derived quantity ("available_factory_stock = fac_current_stock - fac_reserved_stock
  // (derived; NOT a stored column)"). The reserved side is where every SHIPMENT's claim already lives, so shipment
  // exposure needs no separate term and must not be given one.
  //
  // A missing row is all-zero rather than an error, for 21_'s stated reason: "no row" and "zero stock" are the same
  // availability fact. An UNREADABLE balance is a different thing and is reported, because a guard that treats an
  // unreadable number as zero refuses everything, and a guard that treats it as infinity protects nothing.
  // ==============================================================================================================
  function normalizeBalances(rows, opts) {
    opts = opts || {};
    var out = { byPool: {}, unreadable: [], examined: 0, counted: 0, skipped_non_factory: 0, skipped_no_pool: 0 };
    var eligible = opts.eligibleWarehouseIds || null;   // null = caller has already filtered
    (rows || []).forEach(function (r) {
      out.examined++;
      var wh = str(r && (r.warehouse_id != null ? r.warehouse_id : r.warehouseId));
      var sku = str(r && r.sku);
      if (eligible && wh && !eligible[wh]) { out.skipped_non_factory++; return; }
      var key = poolKey(wh, sku, r && r.inventory_pool_id);
      if (!key) { out.skipped_no_pool++; return; }
      var cur = int(r.fac_current_stock != null ? r.fac_current_stock : r.current_stock);
      var res = int(r.fac_reserved_stock != null ? r.fac_reserved_stock : r.reserved_stock);
      if (cur === null) { out.unreadable.push({ pool_key: key, field: 'fac_current_stock', warehouse_id: wh, sku: sku }); return; }
      if (res === null) res = 0;                    // a blank reserved cell is a real zero: 21_ writes it only on change
      var e = out.byPool[key] = out.byPool[key] || { pool_key: key, warehouse_id: wh, sku: sku, current: 0, reserved: 0, available: 0, row_count: 0 };
      e.current += cur; e.reserved += res; e.available = e.current - e.reserved; e.row_count++;
      out.counted++;
    });
    return out;
  }

  // ==============================================================================================================
  // §3.2 / §6 — ALLOCATION-DRAFT EXPOSURE, POOL-KEYED, NEVER COMPANY-FILTERED.
  //
  // The pool source for a draft line is the LINE's `source_warehouse_id` (the denormalized per-line source snapshot
  // 16_ keeps for the natural key), falling back to the header's `recommended_source_warehouse_id` when the line
  // carries none. Header first would be wrong: the header's value is the recommendation snapshot for the group's
  // single route, and a line that names its own source names the stock it will actually draw on.
  //
  // `releaseSet` (§3.3) is the set of AI drafts THIS generation would supersede. They are released IN MEMORY, for
  // the arithmetic only, so a regeneration nets against its own previous output instead of competing with it — the
  // exact defect weeklyAiPlanQualifyingPlannedQty_'s AI exclusion exists to prevent, applied here to the pool. It
  // releases NOTHING ELSE: a manual draft, another scope's draft, and anything already submitted are all untouched,
  // and `provenance` records which side of that line every counted unit fell on.
  // ==============================================================================================================
  function draftExposure(headers, lines, opts) {
    opts = opts || {};
    var releaseSet = opts.releaseSet || {};
    var isAiRow = typeof opts.isAiRow === 'function' ? opts.isAiRow : null;
    var out = { stage: EXPOSURE_STAGE.ALLOCATION_DRAFT, byPool: {}, counted_lines: 0, header_count: 0,
      released: { STATUS_RELEASED: 0, STATUS_UNRECOGNISED: 0, IN_RELEASE_SET: 0, LINE_STATUS_RELEASED: 0,
        NO_HEADER: 0, NO_POOL: 0, BLANK_QTY: 0, SELF_EXCLUDED: 0 },
      release_set_ids: Object.keys(releaseSet).sort(),
      // Named in the release set and NOT released, with the reason. §3.3 forbids releasing a manual draft,
      // and a refusal nobody can see is indistinguishable from a rule nobody applied.
      release_refused: [],
      rows: [] };
    var keep = {};
    (headers || []).forEach(function (h) {
      var id = str(h && (h.allocation_draft_id != null ? h.allocation_draft_id : h.allocationDraftId));
      var st = lo(h && h.status);
      if (DRAFT_RELEASED_STATUSES[st]) { out.released.STATUS_RELEASED++; return; }
      if (!DRAFT_EXPOSURE_STATUSES[st]) { out.released.STATUS_UNRECOGNISED++; return; }
      if (id && releaseSet[id]) {
        // A release requires POSITIVE AI provenance. A manual row named in the set is kept and COUNTED, and
        // the refusal is recorded rather than silently ignored, so a caller that passes one can see that it
        // had no effect instead of assuming it did.
        var relAi = isAiRow ? isAiRow(h) : null;
        if (relAi === true) { out.released.IN_RELEASE_SET++; return; }
        out.release_refused.push({ allocation_draft_id: id,
          reason: relAi === false ? 'MANUAL_SOURCE_NEVER_RELEASED' : 'PROVENANCE_UNKNOWN_NEVER_RELEASED' });
      }
      keep[id] = h; out.header_count++;
    });
    (lines || []).forEach(function (l) {
      var hid = str(l && (l.allocation_draft_id != null ? l.allocation_draft_id : l.allocationDraftId));
      var h = keep[hid];
      if (!h) { out.released.NO_HEADER++; return; }
      if (DRAFT_LINE_RELEASED_STATUSES[lo(l && (l.line_status != null ? l.line_status : l.lineStatus))]) { out.released.LINE_STATUS_RELEASED++; return; }
      var wh = str(l.source_warehouse_id != null ? l.source_warehouse_id : l.sourceWarehouseId)
        || str(h.recommended_source_warehouse_id != null ? h.recommended_source_warehouse_id : h.recommendedSourceWarehouseId);
      var key = poolKey(wh, l.sku, l.inventory_pool_id);
      if (!key) { out.released.NO_POOL++; return; }
      // The operator's decision outranks the recommendation, and a blank planned_qty is NOT a zero-unit plan —
      // it is a line whose quantity nobody has stated. KMARC.lineQuantity settles this the same way.
      var q = qty(l.planned_qty != null ? l.planned_qty : l.plannedQty);
      if (q === null) q = qty(l.recommended_qty != null ? l.recommended_qty : l.recommendedQty);
      if (q === null) { out.released.BLANK_QTY++; return; }
      var ai = isAiRow ? !!isAiRow(h) : null;
      var e = out.byPool[key] = out.byPool[key] || { pool_key: key, qty: 0, manual_qty: 0, ai_qty: 0, unknown_provenance_qty: 0, line_count: 0 };
      e.qty += q; e.line_count++;
      if (ai === true) e.ai_qty += q; else if (ai === false) e.manual_qty += q; else e.unknown_provenance_qty += q;
      out.counted_lines++;
      if (out.rows.length < 200) {
        out.rows.push({ pool_key: key, allocation_draft_id: hid,
          allocation_draft_line_id: str(l.allocation_draft_line_id || l.allocationDraftLineId),
          company: str(h.company), country: str(h.country), marketplace: str(h.marketplace),
          sku: str(l.sku), warehouse_id: str(wh), status: str(h.status), line_status: str(l.line_status),
          quantity: q, ai_generated: ai });
      }
    });
    return out;
  }

  // ==============================================================================================================
  // §2 / §5 / §6 — SHIPPING-PLAN EXPOSURE, AND THE ONE FK THAT STOPS IT DOUBLE-COUNTING.
  //
  // A plan counts while its status is draft / pending_approval / approved AND it has NOT been transferred to a
  // shipment. `transferred_shipment_id` (or `transferred_to_shipment_at`) is stamped by 12_ in the same journalled
  // operation that acquires the factory reservation, so a transferred plan's units are ALREADY inside
  // `fac_reserved_stock` and are already subtracted by `available = current - reserved`. Counting the plan too is
  // the same carton twice.
  //
  // `selfPlanId` (§4.18 / §6.5) is the plan being rechecked. It is excluded from OTHER exposure and supplied
  // separately as `current_plan_qty`, because a recheck that leaves the plan inside the "already allocated" term is
  // comparing the plan against itself and will report an overage for a plan that fits perfectly.
  //
  // The plan's source warehouse is a HEADER field (`shipping_plans.source_warehouse_id`); `shipping_plan_lines`
  // carries no source axis at all, which is why the header fallback is mandatory here and merely a fallback above.
  // ==============================================================================================================
  function planExposure(plans, planLines, opts) {
    opts = opts || {};
    var selfId = str(opts.selfPlanId);
    var out = { stage: EXPOSURE_STAGE.SHIPPING_PLAN, byPool: {}, selfByPool: {}, counted_lines: 0, header_count: 0,
      released: { STATUS_RELEASED: 0, STATUS_UNRECOGNISED: 0, TRANSFERRED_TO_SHIPMENT: 0, NO_HEADER: 0,
        NO_POOL: 0, BLANK_QTY: 0, SELF_EXCLUDED: 0 },
      self_plan_id: selfId || null, rows: [] };
    var keep = {}, selfKeep = {};
    (plans || []).forEach(function (p) {
      var id = str(p && (p.shipping_plan_id != null ? p.shipping_plan_id : p.shippingPlanId));
      var st = lo(p && p.status);
      var transferred = str(p && (p.transferred_shipment_id != null ? p.transferred_shipment_id : p.transferredShipmentId))
        || str(p && (p.transferred_to_shipment_at != null ? p.transferred_to_shipment_at : p.transferredToShipmentAt));
      if (PLAN_RELEASED_STATUSES[st]) { out.released.STATUS_RELEASED++; return; }
      if (!PLAN_EXPOSURE_STATUSES[st]) { out.released.STATUS_UNRECOGNISED++; return; }
      if (transferred) { out.released.TRANSFERRED_TO_SHIPMENT++; return; }
      if (selfId && id === selfId) { selfKeep[id] = p; out.released.SELF_EXCLUDED++; return; }
      keep[id] = p; out.header_count++;
    });
    (planLines || []).forEach(function (l) {
      var pid = str(l && (l.shipping_plan_id != null ? l.shipping_plan_id : l.shippingPlanId));
      var mine = selfKeep[pid] ? selfKeep[pid] : keep[pid];
      if (!mine) { out.released.NO_HEADER++; return; }
      var key = poolKey(str(mine.source_warehouse_id != null ? mine.source_warehouse_id : mine.sourceWarehouseId), l.sku, l.inventory_pool_id);
      if (!key) { out.released.NO_POOL++; return; }
      // `requested_qty` is what the plan asks the factory for. `approved_qty` is only meaningful once an approver
      // has reduced it, and a blank approved_qty on a Draft plan is not a zero request.
      var q = qty(l.approved_qty != null && str(l.approved_qty) !== '' ? l.approved_qty : l.requested_qty);
      if (q === null) { out.released.BLANK_QTY++; return; }
      var bucket = selfKeep[pid] ? out.selfByPool : out.byPool;
      var e = bucket[key] = bucket[key] || { pool_key: key, qty: 0, line_count: 0 };
      e.qty += q; e.line_count++;
      if (!selfKeep[pid]) out.counted_lines++;
      if (out.rows.length < 200) {
        out.rows.push({ pool_key: key, shipping_plan_id: pid, is_self: !!selfKeep[pid],
          company: str(mine.company), country: str(mine.country), marketplace: str(mine.marketplace),
          sku: str(l.sku), warehouse_id: str(mine.source_warehouse_id), status: str(mine.status), quantity: q });
      }
    });
    return out;
  }

  // ==============================================================================================================
  // §2 — available_to_allocate, per pool. THE one arithmetic both mechanisms read.
  // ==============================================================================================================
  function availableToAllocate(input) {
    input = input || {};
    var bal = input.balances || { byPool: {}, unreadable: [] };
    var dEx = input.draftExposure || { byPool: {} };
    var pEx = input.planExposure || { byPool: {}, selfByPool: {} };
    var keys = {}, out = { contract: CONTRACT, byPool: {}, pool_keys: [], unreadable: (bal.unreadable || []).slice() };
    [bal.byPool, dEx.byPool, pEx.byPool, pEx.selfByPool].forEach(function (m) {
      for (var k in (m || {})) if (Object.prototype.hasOwnProperty.call(m || {}, k)) keys[k] = 1;
    });
    out.pool_keys = Object.keys(keys).sort();
    out.pool_keys.forEach(function (k) {
      var b = bal.byPool[k] || null;
      var d = dEx.byPool[k] || null;
      var p = pEx.byPool[k] || null;
      var s = (pEx.selfByPool || {})[k] || null;
      var current = b ? b.current : 0;
      var reserved = b ? b.reserved : 0;
      var physicalAvailable = current - reserved;                 // 21_'s derived available
      var draftQty = d ? d.qty : 0;
      var planQty = p ? p.qty : 0;
      var otherExposure = draftQty + planQty;
      out.byPool[k] = {
        pool_key: k,
        warehouse_id: b ? b.warehouse_id : (d ? '' : ''),
        sku: b ? b.sku : '',
        pool_row_found: !!b,
        factory_current_stock: current,
        factory_reserved_stock: reserved,
        factory_available_stock: physicalAvailable,
        active_allocation_draft_qty: draftQty,
        active_allocation_draft_manual_qty: d ? d.manual_qty : 0,
        active_allocation_draft_ai_qty: d ? d.ai_qty : 0,
        active_shipping_plan_qty: planQty,
        current_plan_qty: s ? s.qty : 0,
        already_allocated_qty: otherExposure,
        // Headroom for a NEW claim. Negative when what is already committed exceeds the physical stock, which is a
        // real state (a confirmed overage, or stock adjusted down after the fact) and is reported as the negative
        // number it is rather than clamped to zero — clamping it here would hide the size of an existing breach.
        available_to_allocate: physicalAvailable - otherExposure,
        projected_total_qty: otherExposure + (s ? s.qty : 0),
        exposure_stages: [EXPOSURE_STAGE.ALLOCATION_DRAFT, EXPOSURE_STAGE.SHIPPING_PLAN, EXPOSURE_STAGE.SHIPMENT_RESERVATION]
      };
    });
    out.fingerprint = snapshotFingerprint(out);
    return out;
  }

  /**
   * §4 — THE SNAPSHOT FINGERPRINT.
   *
   * Over EVERY number the decision depended on, per pool, in sorted key order. Not over the verdict: a fingerprint
   * of the answer would still match after the inputs moved in ways that happened to produce the same answer, and
   * the point of the challenge is that the operator confirmed against THESE FACTS. Physical stock, reservation,
   * draft exposure and plan exposure each enter separately, so a unit moving from a draft into a plan — which
   * leaves `already_allocated_qty` identical — still invalidates the confirmation.
   */
  function snapshotFingerprint(avail) {
    var parts = [];
    ((avail && avail.pool_keys) || []).forEach(function (k) {
      var e = avail.byPool[k];
      parts.push([k, e.factory_current_stock, e.factory_reserved_stock, e.active_allocation_draft_qty,
        e.active_shipping_plan_qty, e.current_plan_qty].join(':'));
    });
    return fnv1a(parts.join('|'));
  }

  // ==============================================================================================================
  // §3 — MECHANISM A. THE AI HARD GUARD.
  //
  // Takes `claims` — every quantity the generation proposes, each naming its pool and its receiver — and returns
  // one of three verdicts per pool. There is NO override parameter, and adding one would be the defect: an
  // automated run cannot know about an arrangement that exists outside this database, so it must never be able to
  // assume one. A shortfall it cannot settle with the FROZEN priority is a STOP, and the operator resolves it
  // through Mechanism B, as a person, with a reason.
  //
  // WHY A SHORTFALL IS SOMETIMES A CLAMP AND SOMETIMES A STOP (§3.9).
  //
  // With ONE claimant on a pool the answer needs no allocation policy at all: the single claim is reduced to the
  // headroom, and there is nothing to choose between. With SEVERAL claimants, deciding who gets cut IS an
  // allocation decision, and this module is forbidden to make one up. So it uses the frozen authority — the
  // `allocation_priority` on `marketplaces` that `gapOpReadSupplyPoolFacts_` already reads and KMMSA already
  // consumes — and serves in that order. If ANY competing claimant has no priority, or if a tie has to be split
  // (two claimants at the same priority and not enough headroom for both), it STOPS. A tie that fits entirely is
  // not a decision and does not stop anything.
  // ==============================================================================================================
  function evaluateAiGuard(input) {
    input = input || {};
    var avail = input.available || { byPool: {}, pool_keys: [] };
    var claims = input.claims || [];
    var priorityByReceiver = input.priorityByReceiver || {};
    var out = { contract: CONTRACT, mechanism: 'AI_HARD_GUARD', verdict: VERDICT.PASS,
      overridable: false,
      override_note: 'An AI generation has no overage channel. A shortfall it cannot settle with the frozen '
        + 'allocation priority is refused, and only a human with submit authority may accept an overage.',
      byPool: {}, claims: [], stops: [], clamped_total: 0, requested_total: 0, granted_total: 0,
      fingerprint: avail.fingerprint || null };

    var byPoolClaims = {};
    claims.forEach(function (c, i) {
      var key = str(c && c.pool_key) || poolKey(c && c.warehouse_id, c && c.sku, c && c.inventory_pool_id);
      var q = qty(c && c.quantity);
      var rec = { index: i, pool_key: key, receiver_key: str(c && c.receiver_key),
        company: str(c && c.company), country: str(c && c.country), marketplace: str(c && c.marketplace),
        sku: str(c && c.sku), warehouse_id: str(c && c.warehouse_id),
        requested_qty: q, granted_qty: null, clamped_by: 0, verdict: null, reason: null };
      out.claims.push(rec);
      if (!key) { rec.verdict = VERDICT.STOP; rec.reason = STOP_CODE.POOL_UNKNOWN;
        out.stops.push({ code: STOP_CODE.POOL_UNKNOWN, claim_index: i, sku: rec.sku, warehouse_id: rec.warehouse_id }); return; }
      // A claim whose quantity is unreadable cannot be checked against anything, and letting it through unchecked
      // is the one outcome a guard may not produce.
      if (q === null) { rec.verdict = VERDICT.STOP; rec.reason = STOP_CODE.BALANCE_UNREADABLE;
        out.stops.push({ code: STOP_CODE.BALANCE_UNREADABLE, claim_index: i, pool_key: key, field: 'quantity' }); return; }
      if (q <= 0) { rec.verdict = VERDICT.PASS; rec.granted_qty = q; return; }   // nothing claimed, nothing to guard
      (byPoolClaims[key] = byPoolClaims[key] || []).push(rec);
    });

    Object.keys(byPoolClaims).sort().forEach(function (key) {
      var rows = byPoolClaims[key];
      var a = avail.byPool[key] || null;
      var headroom = a ? a.available_to_allocate : null;
      var requested = rows.reduce(function (s, r) { return s + r.requested_qty; }, 0);
      var pool = out.byPool[key] = {
        pool_key: key, claimant_count: rows.length, requested_qty: requested,
        pool_row_found: !!a,
        factory_available_stock: a ? a.factory_available_stock : null,
        already_allocated_qty: a ? a.already_allocated_qty : null,
        available_to_allocate: headroom,
        granted_qty: 0, clamped_qty: 0, verdict: VERDICT.PASS, stop_code: null
      };
      // No pool row at all. That is not "zero available" for a guard's purposes: it is a claim on stock this
      // system has never seen, and it must be looked at by a person rather than silently clamped to nothing.
      if (!a || !a.pool_row_found) {
        pool.verdict = VERDICT.STOP; pool.stop_code = STOP_CODE.POOL_UNKNOWN;
        rows.forEach(function (r) { r.verdict = VERDICT.STOP; r.reason = STOP_CODE.POOL_UNKNOWN; });
        out.stops.push({ code: STOP_CODE.POOL_UNKNOWN, pool_key: key, requested_qty: requested });
        return;
      }
      if (requested <= headroom) {
        rows.forEach(function (r) { r.verdict = VERDICT.PASS; r.granted_qty = r.requested_qty; });
        pool.granted_qty = requested;
        return;
      }
      var budget = headroom > 0 ? headroom : 0;
      if (rows.length === 1) {
        var r0 = rows[0];
        r0.granted_qty = budget; r0.clamped_by = r0.requested_qty - budget;
        r0.verdict = budget > 0 ? VERDICT.CLAMPED : VERDICT.CLAMPED;
        pool.granted_qty = budget; pool.clamped_qty = requested - budget; pool.verdict = VERDICT.CLAMPED;
        return;
      }
      // Several claimants and not enough for all of them. Order by the FROZEN priority or stop.
      var missing = rows.filter(function (r) { return qty(priorityByReceiver[r.receiver_key]) === null; });
      if (missing.length) {
        pool.verdict = VERDICT.STOP; pool.stop_code = STOP_CODE.PRIORITY_UNRESOLVED;
        rows.forEach(function (r) { r.verdict = VERDICT.STOP; r.reason = STOP_CODE.PRIORITY_UNRESOLVED; });
        out.stops.push({ code: STOP_CODE.PRIORITY_UNRESOLVED, pool_key: key, requested_qty: requested,
          available_to_allocate: headroom, claimant_count: rows.length,
          receivers_without_priority: missing.map(function (r) { return r.receiver_key; }).sort(),
          detail: 'the frozen allocation priority (marketplaces.allocation_priority) does not cover every '
            + 'competing receiver on this pool, so no order exists that this guard is permitted to apply' });
        return;
      }
      // Higher allocation_priority is served first (KMMSA's own reading of the column).
      var ordered = rows.slice().sort(function (x, y) {
        var px = Number(priorityByReceiver[x.receiver_key]), py = Number(priorityByReceiver[y.receiver_key]);
        if (px !== py) return py - px;
        return x.receiver_key < y.receiver_key ? -1 : (x.receiver_key > y.receiver_key ? 1 : 0);
      });
      var left = budget, stopped = false;
      for (var i = 0; i < ordered.length && !stopped; i++) {
        var grp = [ordered[i]];
        var pi = Number(priorityByReceiver[ordered[i].receiver_key]);
        while (i + 1 < ordered.length && Number(priorityByReceiver[ordered[i + 1].receiver_key]) === pi) { grp.push(ordered[++i]); }
        var need = grp.reduce(function (s, r) { return s + r.requested_qty; }, 0);
        if (need <= left) { grp.forEach(function (r) { r.verdict = VERDICT.PASS; r.granted_qty = r.requested_qty; }); left -= need; continue; }
        if (grp.length > 1) {
          // A TIE THAT HAS TO BE SPLIT. There is no rule in this system for that, and inventing one here would be
          // inventing a station order — exactly what §3.9 forbids.
          pool.verdict = VERDICT.STOP; pool.stop_code = STOP_CODE.PRIORITY_UNRESOLVED;
          rows.forEach(function (r) { r.verdict = VERDICT.STOP; r.reason = STOP_CODE.PRIORITY_UNRESOLVED; r.granted_qty = null; r.clamped_by = 0; });
          out.stops.push({ code: STOP_CODE.PRIORITY_UNRESOLVED, pool_key: key, requested_qty: requested,
            available_to_allocate: headroom, claimant_count: rows.length,
            tied_receivers: grp.map(function (r) { return r.receiver_key; }).sort(), tied_priority: pi,
            detail: 'two or more competing receivers share an allocation_priority and the remaining headroom '
              + 'cannot serve all of them; splitting a tie is an allocation decision this guard may not make' });
          stopped = true; break;
        }
        grp[0].granted_qty = left; grp[0].clamped_by = grp[0].requested_qty - left;
        grp[0].verdict = VERDICT.CLAMPED; left = 0;
      }
      if (stopped) return;
      for (var j = 0; j < ordered.length; j++) {
        if (ordered[j].verdict === null) { ordered[j].verdict = VERDICT.CLAMPED; ordered[j].granted_qty = 0; ordered[j].clamped_by = ordered[j].requested_qty; }
      }
      pool.granted_qty = ordered.reduce(function (s, r) { return s + (r.granted_qty || 0); }, 0);
      pool.clamped_qty = requested - pool.granted_qty;
      pool.verdict = VERDICT.CLAMPED;
    });

    out.claims.forEach(function (r) {
      if (r.requested_qty !== null) out.requested_total += r.requested_qty;
      if (r.granted_qty !== null) out.granted_total += r.granted_qty;
      out.clamped_total += r.clamped_by || 0;
    });
    if (out.stops.length) out.verdict = VERDICT.STOP;
    else if (out.clamped_total > 0) out.verdict = VERDICT.CLAMPED;
    else out.verdict = VERDICT.PASS;
    return out;
  }

  // ==============================================================================================================
  // §4 — MECHANISM B. THE MANUAL OVERAGE CHALLENGE.
  //
  // Called on Draft -> Pending Approval. When the plan fits, it returns OK and the caller proceeds with NO modal
  // and no extra confirmation — a guard that asks a question it already knows the answer to trains people to click
  // through it. When it does not fit, it returns the complete picture plus a fingerprint of the facts that produced
  // it, and NOTHING IS MUTATED.
  // ==============================================================================================================
  function evaluateOverage(input) {
    input = input || {};
    var avail = input.available || { byPool: {}, pool_keys: [] };
    var out = { contract: CONTRACT, mechanism: 'MANUAL_OVERAGE_CONFIRMATION',
      shipping_plan_id: str(input.shippingPlanId) || null,
      ok: true, verdict: 'OK', code: null, overridable: true,
      inventory_snapshot_fingerprint: avail.fingerprint || null,
      pools: [], overage_pools: [], total_overage_qty: 0,
      reason_options: overrideReasonOptions(),
      affected: [] };
    (avail.pool_keys || []).forEach(function (k) {
      var e = avail.byPool[k];
      var currentPlanQty = e.current_plan_qty || 0;
      if (!currentPlanQty) return;                       // this plan does not touch this pool
      var projected = e.already_allocated_qty + currentPlanQty;
      var overage = projected - e.factory_available_stock;
      var row = {
        pool_key: k, inventory_pool_id: null, source_warehouse_id: e.warehouse_id, sku: e.sku,
        factory_current_stock: e.factory_current_stock,
        factory_reserved_stock: e.factory_reserved_stock,
        factory_available_stock: e.factory_available_stock,
        already_allocated_qty: e.already_allocated_qty,
        current_plan_qty: currentPlanQty,
        projected_total_qty: projected,
        overage_qty: overage > 0 ? overage : 0,
        pool_row_found: e.pool_row_found
      };
      out.pools.push(row);
      if (overage > 0) { out.overage_pools.push(row); out.total_overage_qty += overage; }
    });
    if (out.overage_pools.length) {
      out.ok = false; out.verdict = VERDICT.OVERAGE_CONFIRMATION_REQUIRED;
      out.code = VERDICT.OVERAGE_CONFIRMATION_REQUIRED;
      out.confirmation_token = confirmationToken(out.shipping_plan_id, avail.fingerprint);
      out.affected = affectedDestinations(input.exposureRows || [], out.overage_pools);
      out.title = 'Planned Quantity Exceeds Available Factory Stock';
      out.message = 'This plan exceeds the currently available factory stock. Please confirm the total physical '
        + 'inventory and review allocations to other companies and marketplaces. Continue only if the additional '
        + 'quantity can be covered through inventory reallocation, incoming production, or another confirmed '
        + 'arrangement.';
      out.buttons = { cancel: 'Cancel', confirm: 'Confirm Overage' };
      out.zero_write = true;
    }
    return out;
  }

  function overrideReasonOptions() {
    return Object.keys(OVERRIDE_REASONS).map(function (k) { return { value: k, label: OVERRIDE_REASONS[k] }; });
  }

  // The challenge is bound to BOTH the plan and the facts. Bound to the facts alone, a token issued for one plan
  // would confirm an overage on another plan in the same unchanged snapshot.
  function confirmationToken(planId, fingerprint) {
    return 'FSOC-' + fnv1a(str(planId) + '|' + str(fingerprint)).toUpperCase();
  }

  // §4 — "affected destinations / plans": WHO ELSE is holding the units this plan is short of. Read from the
  // exposure rows the availability was computed from, so it can never disagree with the arithmetic.
  function affectedDestinations(rows, overagePools) {
    var want = {};
    (overagePools || []).forEach(function (p) { want[p.pool_key] = 1; });
    var byKey = {};
    (rows || []).forEach(function (r) {
      if (!want[r.pool_key]) return;
      if (r.is_self) return;
      var k = [r.pool_key, str(r.company), str(r.country), str(r.marketplace), str(r.stage)].join('|');
      var e = byKey[k] = byKey[k] || { pool_key: r.pool_key, company: str(r.company), country: str(r.country),
        marketplace: str(r.marketplace), stage: str(r.stage), sku: str(r.sku), quantity: 0, references: [] };
      e.quantity += Number(r.quantity) || 0;
      var ref = str(r.shipping_plan_id) || str(r.allocation_draft_id);
      if (ref && e.references.indexOf(ref) === -1 && e.references.length < 20) e.references.push(ref);
    });
    return Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
  }

  /**
   * §4 / §5 — CONFIRM. The server-side half, and the only place an overage may be accepted.
   *
   * Every refusal here is a refusal to MUTATE, so the caller's contract is simply "write nothing unless this says
   * accepted". The stale check is the load-bearing one: `expected_fingerprint` was computed when the operator was
   * shown the numbers, `available.fingerprint` is computed inside the write lock, and if they differ the operator
   * confirmed an arithmetic that no longer exists. The refusal carries the NEW overage so the modal can be
   * re-shown with the truth rather than an error.
   *
   * §4 also requires that an overage cannot be confirmed when there is no overage — otherwise a token plus a reason
   * becomes a way to stamp `inventory_override = true` onto a plan that never needed it, and the audit stops
   * meaning anything.
   */
  function confirmOverage(input) {
    input = input || {};
    var avail = input.available || {};
    var reason = lo(input.reason);
    var actor = str(input.actor);
    var expected = str(input.expectedFingerprint);
    var current = str(avail.fingerprint);
    var evaluated = evaluateOverage({ available: avail, shippingPlanId: input.shippingPlanId,
      exposureRows: input.exposureRows || [] });
    var out = { contract: CONTRACT, mechanism: 'MANUAL_OVERAGE_CONFIRMATION', accepted: false, code: null,
      shipping_plan_id: str(input.shippingPlanId) || null, zero_write: true,
      inventory_snapshot_fingerprint: current || null, evaluation: evaluated };
    if (!expected) { out.code = REFUSAL.MISSING_FINGERPRINT; return out; }
    if (!actor) { out.code = REFUSAL.MISSING_ACTOR; return out; }
    if (!reason) { out.code = REFUSAL.MISSING_REASON; return out; }
    if (!OVERRIDE_REASONS[reason]) { out.code = REFUSAL.UNKNOWN_REASON;
      out.reason_options = overrideReasonOptions(); return out; }
    // §4 — the SAME authority that may submit a plan, and no separate permission. A person who cannot send a plan
    // for approval cannot accept an overage on it either, and inventing a second authority here would create a way
    // around the first.
    if (input.actorMaySubmit === false) { out.code = REFUSAL.NOT_AUTHORISED; return out; }
    if (expected !== current) {
      out.code = REFUSAL.STALE_SNAPSHOT;
      out.stale = { expected_fingerprint: expected, current_fingerprint: current || null };
      out.latest = evaluated;                     // the NEW difference, so the operator re-decides on facts
      return out;
    }
    if (evaluated.ok) { out.code = REFUSAL.NO_OVERAGE; return out; }
    var tok = str(input.confirmationToken);
    if (tok && tok !== evaluated.confirmation_token) {
      out.code = REFUSAL.STALE_SNAPSHOT;
      out.stale = { expected_token: evaluated.confirmation_token, presented_token: tok };
      out.latest = evaluated;
      return out;
    }
    out.accepted = true; out.zero_write = false; out.code = 'FACTORY_STOCK_OVERAGE_CONFIRMED';
    // §4.6 — the audit metadata, assembled HERE so the writer copies rather than recomputes. A writer that
    // recomputed these would be free to record a different arithmetic than the one that was accepted.
    out.audit = {
      inventory_override: true,
      override_reason: reason,
      override_reason_label: OVERRIDE_REASONS[reason],
      override_note: str(input.note) || null,
      override_by: actor,
      override_at: str(input.at) || null,
      inventory_snapshot_fingerprint: current || null,
      pools: evaluated.overage_pools.map(function (p) {
        return { inventory_pool_id: p.inventory_pool_id, source_warehouse_id: p.source_warehouse_id, sku: p.sku,
          available_qty_at_check: p.factory_available_stock, already_allocated_qty: p.already_allocated_qty,
          requested_plan_qty: p.current_plan_qty, projected_total_qty: p.projected_total_qty,
          overage_qty: p.overage_qty };
      }),
      total_overage_qty: evaluated.total_overage_qty
    };
    return out;
  }

  /**
   * §5 — THE APPROVAL RECHECK. Pending Approval -> Approved.
   *
   * SILENT when the snapshot is unchanged: an approver who is shown the same modal the submitter already answered
   * learns nothing and is trained to dismiss it. A NEW overage — or a larger one — is a different fact and must be
   * confirmed again, and a previously accepted fingerprint may never be reused for it.
   */
  function evaluateApprovalRecheck(input) {
    input = input || {};
    var avail = input.available || {};
    var confirmed = str(input.confirmedFingerprint);
    var ev = evaluateOverage({ available: avail, shippingPlanId: input.shippingPlanId,
      exposureRows: input.exposureRows || [] });
    var out = { contract: CONTRACT, mechanism: 'APPROVAL_RECHECK', shipping_plan_id: ev.shipping_plan_id,
      snapshot_unchanged: !!confirmed && confirmed === str(avail.fingerprint),
      inventory_snapshot_fingerprint: str(avail.fingerprint) || null,
      confirmed_fingerprint: confirmed || null,
      previously_confirmed_overage_qty: qty(input.confirmedOverageQty),
      current_overage_qty: ev.total_overage_qty, evaluation: ev,
      proceed: true, reconfirmation_required: false, code: null, silent: false };
    if (ev.ok) { out.proceed = true; out.silent = true; return out; }          // no overage now: nothing to ask
    if (out.snapshot_unchanged) { out.proceed = true; out.silent = true; return out; }
    var prior = out.previously_confirmed_overage_qty;
    // The snapshot moved. An overage no larger than the one already accepted is covered by that acceptance; a
    // larger one is not, and an overage never confirmed at all certainly is not.
    if (prior !== null && ev.total_overage_qty <= prior) { out.proceed = true; out.silent = true;
      out.code = 'COVERED_BY_EARLIER_CONFIRMATION'; return out; }
    out.proceed = false; out.reconfirmation_required = true;
    out.code = VERDICT.OVERAGE_CONFIRMATION_REQUIRED;
    return out;
  }

  /**
   * §5 — THE SHIPMENT DRAFT BOUNDARY.
   *
   * Shipment Draft allocates NOTHING and overrides NOTHING. It accepts an immutable quantity snapshot from an
   * APPROVED plan, and its only inventory question is whether that snapshot is still the one it was approved with.
   * If it is not, it refuses to be created rather than repairing the numbers itself — a second override channel
   * here would be a way around every gate above it.
   */
  function evaluateShipmentDraftAdmission(input) {
    input = input || {};
    var planStatus = lo(input.planStatus);
    var out = { contract: CONTRACT, mechanism: 'SHIPMENT_DRAFT_ADMISSION', admit: false, code: null,
      reallocates: false, overridable: false,
      note: 'Shipment Draft receives an immutable approved snapshot. It never re-allocates, never re-prices the '
        + 'pool and has no override channel of its own.' };
    if (planStatus !== 'approved') { out.code = 'SHIPMENT_DRAFT_REQUIRES_APPROVED_PLAN'; return out; }
    if (str(input.transferredShipmentId)) { out.code = 'SHIPMENT_ALREADY_EXISTS'; return out; }
    var snap = qty(input.approvedSnapshotQty), req = qty(input.planRequestedQty);
    if (snap === null || req === null) { out.code = 'UPSTREAM_SNAPSHOT_INVALID'; return out; }
    if (snap !== req) { out.code = 'UPSTREAM_SNAPSHOT_INVALID';
      out.detail = { approved_snapshot_qty: snap, plan_requested_qty: req }; return out; }
    out.admit = true; out.code = 'ADMITTED';
    return out;
  }

  return {
    CONTRACT: CONTRACT,
    DRAFT_EXPOSURE_STATUSES: DRAFT_EXPOSURE_STATUSES,
    DRAFT_RELEASED_STATUSES: DRAFT_RELEASED_STATUSES,
    DRAFT_LINE_RELEASED_STATUSES: DRAFT_LINE_RELEASED_STATUSES,
    PLAN_EXPOSURE_STATUSES: PLAN_EXPOSURE_STATUSES,
    PLAN_RELEASED_STATUSES: PLAN_RELEASED_STATUSES,
    EXPOSURE_STAGE: EXPOSURE_STAGE,
    RELEASE_REASON: RELEASE_REASON,
    VERDICT: VERDICT,
    STOP_CODE: STOP_CODE,
    REFUSAL: REFUSAL,
    OVERRIDE_REASONS: OVERRIDE_REASONS,
    fnv1a: fnv1a,
    poolKey: poolKey,
    poolKeyOf: poolKeyOf,
    normalizeBalances: normalizeBalances,
    draftExposure: draftExposure,
    planExposure: planExposure,
    availableToAllocate: availableToAllocate,
    snapshotFingerprint: snapshotFingerprint,
    evaluateAiGuard: evaluateAiGuard,
    evaluateOverage: evaluateOverage,
    overrideReasonOptions: overrideReasonOptions,
    confirmationToken: confirmationToken,
    affectedDestinations: affectedDestinations,
    confirmOverage: confirmOverage,
    evaluateApprovalRecheck: evaluateApprovalRecheck,
    evaluateShipmentDraftAdmission: evaluateShipmentDraftAdmission,
    _version: 'f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r5-factory-stock-guard'
  };
});
