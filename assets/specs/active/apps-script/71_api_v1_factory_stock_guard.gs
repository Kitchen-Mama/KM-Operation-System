// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 71_api_v1_factory_stock_guard.gs — the SERVER SEAM for the shared factory stock guard (KMFSG).
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// ------------------------------------------------------------
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 §1/§2/§3/§4/§5
//
// THIS FILE DOES THE READING. KMFSG DOES THE DECIDING.
//
// The arithmetic lives in the pure module `assets/js/core/supply-planning-factory-stock-guard.js` (bundled into
// 90_ as the global KMFSG) so that both mechanisms — the AI hard limit and the human overage confirmation — read
// ONE availability object, and so the whole of it is executable in Node against fixtures rather than only against
// a live spreadsheet. What is left here is what cannot be pure: which sheets to open, which lock to hold, and
// where the audit row goes.
//
// WHY THE SHEET READS ARE ALL IN ONE FUNCTION. `fsgReadInventoryFacts_` reads five tables and is the ONLY place
// any of them is read for guard purposes. A second reader would be a second answer to "what is available", and
// this round exists because the system already had two different answers to a smaller version of that question
// (the page's 520 against the census's 0). One reader, one snapshot, one fingerprint.
//
// WHY THE POOL IS NOT FILTERED BY COMPANY. Company / Country / Marketplace are the DESTINATION. A factory
// warehouse supplies all of them, so the exposure side must be summed across every company before anything is
// compared — the exact opposite of the scope filter every other read in this system applies. That is not a
// preference: `weeklyAiPlanPoolsBySku_` (61_) already keys factory pools by SKU alone for this reason, and
// gapOpReadSupplyPoolFacts_ (43_) calls factory_stock "the FACTORY_SHARED pool". The exposure arithmetic simply
// never existed to match it.
//
// WHAT THIS FILE NEVER DOES. It creates no reservation: `FSTX_RESERVATION_OWNER_TYPE_ = 'shipment'` is "the only
// reservation owner in the frozen model" (21_:405), the AI Plan activation manifest declares
// `reservation_expected: false`, and DATABASE_RELATIONSHIP_MAP §7.5B states a persisted Draft "triggers no
// reservation and creates no inventory movement". Draft- and plan-stage exposure is DERIVED from the rows that
// exist, which cannot drift from them and leaves nothing to leak when a run dies half-way.
// ============================================================

// The build stamp of THIS module. Moves only when this file changes (per-module stamp, not the release).
var FSG_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5';

// The append-only override audit ledger. NEW, code-owned, created on first write by the SAME additive
// `fcWriteEnsureSheet_` pattern that created `factory_stock_movements` (21_) — no live header is modified, no
// existing table is migrated, and nothing is ever renamed or dropped. §8 of this round forbids running a
// production migration, and this needs none: an absent table is created the first time an override is actually
// accepted, and until then nothing has been overridden so there is nothing to record.
var FSG_OVERRIDE_AUDIT_TABLE_ = 'factory_stock_override_audit';
var FSG_OVERRIDE_AUDIT_HEADERS_ = [
  'override_audit_id', 'created_at', 'entity_type', 'entity_id', 'transition',
  'company', 'country', 'marketplace',
  'inventory_pool_id', 'source_warehouse_id', 'sku',
  'inventory_override', 'override_reason', 'override_reason_label', 'override_note',
  'override_by', 'override_at',
  'available_qty_at_check', 'already_allocated_qty', 'requested_plan_qty', 'projected_total_qty', 'overage_qty',
  'inventory_snapshot_fingerprint', 'confirmation_token', 'guard_contract'
];

function fsgStr_(v) { return String(v == null ? '' : v).trim(); }
function fsgNum_(v) { var n = Number(v); return isFinite(n) ? n : null; }
function fsgTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
function fsgGuardAvailable_() { return (typeof KMFSG !== 'undefined') && KMFSG && typeof KMFSG.availableToAllocate === 'function'; }

/**
 * §1/§2 — READ EVERY FACT THE GUARD DEPENDS ON, ONCE.
 *
 * Returns { ok, reason, available, draftExposure, planExposure, balances, exposureRows, priorityByReceiver }.
 *
 * `opts.selfPlanId`        the plan being submitted/approved. Excluded from OTHER exposure and reported
 *                          separately as current_plan_qty, so a recheck never compares a plan against itself.
 * `opts.releaseSet`        { allocation_draft_id: 1 } — AI drafts THIS generation would supersede, released in
 *                          memory only. A manual draft is never in it (§3.3).
 *
 * MISSING TABLE IS A REFUSAL, NOT AN EMPTY SET. If `factory_stock` cannot be read, availability is unknown, and
 * a guard that reads unknown availability as unlimited protects nothing while one that reads it as zero refuses
 * everything. Both are wrong; the truthful answer is that it could not be checked.
 */
function fsgReadInventoryFacts_(ss, opts) {
  opts = opts || {};
  var out = { ok: false, reason: null, contract: fsgGuardAvailable_() ? KMFSG.CONTRACT : null,
    build: FSG_BUILD_VERSION_, tables_read: [] };
  if (!fsgGuardAvailable_()) { out.reason = 'FACTORY_STOCK_GUARD_MODULE_MISSING'; return out; }
  if (typeof gapReadObjects_ !== 'function') { out.reason = 'SHEET_READER_UNAVAILABLE'; return out; }

  function read(name) { out.tables_read.push(name); return gapReadObjects_(ss, name) || []; }

  var warehouses, stock, dHeaders, dLines, plans, planLines, marketplaces;
  try {
    warehouses = read('warehouses');
    stock = read('factory_stock');
  } catch (e) { out.reason = 'FACTORY_STOCK_READ_FAILED'; out.detail = String(e && e.message ? e.message : e); return out; }
  try {
    dHeaders = read('shipping_allocation_drafts');
    dLines = read('shipping_allocation_draft_lines');
  } catch (e2) { out.reason = 'ALLOCATION_DRAFT_READ_FAILED'; out.detail = String(e2 && e2.message ? e2.message : e2); return out; }
  try {
    plans = read('shipping_plans');
    planLines = read('shipping_plan_lines');
  } catch (e3) { out.reason = 'SHIPPING_PLAN_READ_FAILED'; out.detail = String(e3 && e3.message ? e3.message : e3); return out; }
  try { marketplaces = read('marketplaces'); } catch (e4) { marketplaces = []; }

  // Only `is_factory_warehouse` stock is factory stock — the same eligibility gapOpReadSupplyPoolFacts_ applies.
  // A non-factory warehouse row in this table is not a smaller pool; it is not this pool at all.
  var eligible = {};
  warehouses.forEach(function (w) {
    var id = fsgStr_(w.warehouse_id); if (!id) return;
    var isFactory = (typeof gapTruthy_ === 'function') ? gapTruthy_(w.is_factory_warehouse)
      : /^(true|yes|1|y)$/i.test(fsgStr_(w.is_factory_warehouse));
    if (isFactory) eligible[id] = 1;
  });

  var balances = KMFSG.normalizeBalances(stock, { eligibleWarehouseIds: eligible });
  var dEx = KMFSG.draftExposure(dHeaders, dLines, {
    releaseSet: opts.releaseSet || {},
    // Provenance through 69_'s own classifier when it is loaded, exactly as weeklyAiPlanIsAiRow_ does it, so
    // "is this row AI's?" keeps the one answer it already has.
    isAiRow: (typeof weeklyAiPlanIsAiRow_ === 'function') ? weeklyAiPlanIsAiRow_
      : ((typeof aiplIsAiGenerated_ === 'function') ? aiplIsAiGenerated_ : null)
  });
  var pEx = KMFSG.planExposure(plans, planLines, { selfPlanId: opts.selfPlanId || '' });

  var priorityByReceiver = {};
  marketplaces.forEach(function (m) {
    var ap = fsgNum_(m.allocation_priority); if (ap === null) return;
    var canon = (typeof gapCanonCountry_ === 'function') ? gapCanonCountry_(m.country) : fsgStr_(m.country);
    priorityByReceiver[fsgStr_(m.company) + '||' + canon + '||' + fsgStr_(m.marketplace)] = ap;
  });

  out.eligibleFactoryWarehouseIds = eligible;
  out.balances = balances;
  out.draftExposure = dEx;
  out.planExposure = pEx;
  out.priorityByReceiver = priorityByReceiver;
  out.available = KMFSG.availableToAllocate({ balances: balances, draftExposure: dEx, planExposure: pEx });
  // The rows the availability was computed FROM, tagged with their stage, so "affected destinations / plans" can
  // never disagree with the arithmetic that produced the overage.
  out.exposureRows = []
    .concat(dEx.rows.map(function (r) { var c = {}; for (var k in r) c[k] = r[k]; c.stage = KMFSG.EXPOSURE_STAGE.ALLOCATION_DRAFT; return c; }))
    .concat(pEx.rows.map(function (r) { var c = {}; for (var k in r) c[k] = r[k]; c.stage = KMFSG.EXPOSURE_STAGE.SHIPPING_PLAN; return c; }));
  out.ok = true;
  return out;
}

/**
 * §3 — THE AI HARD GUARD, as 61_ calls it. READ ONLY. Zero writes on every path.
 *
 * `claims` is [{ pool_key?, warehouse_id, sku, quantity, receiver_key, company, country, marketplace }] — one
 * entry per proposed line, built from the complete PASS-1 set before anything is written.
 *
 * Returns the KMFSG verdict plus the facts it read. The caller applies the clamp to its own proposed lines and
 * refuses on STOP; this function never mutates the caller's plan, because a guard that edited the plan would be
 * the second allocator §3.9 forbids.
 */
function fsgEvaluateAiClaims_(ss, claims, opts) {
  opts = opts || {};
  var facts = fsgReadInventoryFacts_(ss, { releaseSet: opts.releaseSet || {} });
  if (!facts.ok) {
    return { ok: false, verdict: 'STOP', reason: facts.reason, detail: facts.detail || null,
      zero_write: true, build: FSG_BUILD_VERSION_,
      // A guard that cannot read the pool must not be treated as a guard that found nothing wrong.
      guard_unavailable: true, claims: [], stops: [{ code: facts.reason }] };
  }
  // ============================================================================================================
  // ONLY A FACTORY-SOURCED LINE IS A CLAIM ON FACTORY STOCK.
  //
  // This is the distinction the first cut of this seam got wrong, and the existing regression suites caught it
  // immediately. A proposed line whose source is a 3PL / overseas warehouse draws on
  // `overseas_inventory_snapshot`, NOT on `factory_stock` — 43_ gapOpReadSupplyPoolFacts_ builds the two pools
  // from different tables with different eligibility and calls them "INDEPENDENT pools, INDEPENDENTLY
  // conserved". Asking the FACTORY guard about an overseas-sourced line is a category error, and because there
  // is correctly no factory_stock row for such a warehouse the guard was answering POOL_UNKNOWN and refusing a
  // generation it had no business judging.
  //
  // So the eligibility test is `warehouses.is_factory_warehouse` — the SAME test 43_ applies when it decides
  // what is in the factory pool at all. An out-of-scope claim is REPORTED, never silently dropped: "this guard
  // did not apply to 12 lines" and "this guard approved 12 lines" are different statements, and only one of
  // them is true.
  //
  // A claim on a warehouse that IS a factory warehouse but has NO factory_stock row still STOPS. 21_ reads
  // "no row" and "zero stock" as the same availability fact, and that is right for a BALANCE — but for a
  // GUARD, clamping to zero would silently turn a planned route into an empty one, and an operator would see a
  // plan that generated nothing with no reason given. The named refusal is the honest form of the same answer.
  // ============================================================================================================
  var eligible = facts.eligibleFactoryWarehouseIds || {};
  var inScope = [], outOfScope = [];
  (claims || []).forEach(function (c) {
    var wh = fsgStr_(c && c.warehouse_id);
    // An explicit inventory_pool_id names a pool directly and does not need the warehouse join.
    if (fsgStr_(c && c.inventory_pool_id) || (wh && eligible[wh])) { inScope.push(c); return; }
    outOfScope.push({ warehouse_id: wh, sku: fsgStr_(c && c.sku), quantity: c && c.quantity,
      marketplace: fsgStr_(c && c.marketplace),
      reason: wh ? 'SOURCE_IS_NOT_A_FACTORY_WAREHOUSE' : 'CLAIM_NAMES_NO_SOURCE_WAREHOUSE' });
  });
  var verdict = KMFSG.evaluateAiGuard({ available: facts.available, claims: inScope,
    priorityByReceiver: facts.priorityByReceiver });
  verdict.out_of_scope_claims = outOfScope;
  verdict.out_of_scope_claim_count = outOfScope.length;
  verdict.in_scope_claim_count = inScope.length;
  verdict.eligible_factory_warehouse_ids = Object.keys(eligible).sort();
  // The caller indexes its proposed lines by the position it submitted them in, so the claim records must
  // carry that ORIGINAL index rather than their position in the filtered array.
  verdict.claims.forEach(function (r) {
    var src = inScope[r.index];
    r.submitted_index = (src && src.submitted_index != null) ? src.submitted_index : null;
  });
  verdict.ok = true;
  verdict.zero_write = true;
  verdict.build = FSG_BUILD_VERSION_;
  verdict.facts = { pool_keys: facts.available.pool_keys, byPool: facts.available.byPool,
    fingerprint: facts.available.fingerprint,
    release_set_ids: facts.draftExposure.release_set_ids,
    draft_exposure_lines: facts.draftExposure.counted_lines,
    plan_exposure_lines: facts.planExposure.counted_lines,
    tables_read: facts.tables_read };
  return verdict;
}

/**
 * §4 — THE OVERAGE CHALLENGE for one Weekly Shipping Plan. READ ONLY.
 *
 * Used by the Draft -> Pending Approval gate inside `handleUpdateShippingPlanStatus_` AND by the read-only
 * indicator the page shows while a Draft is being edited (§7). The SAME function answers both, so the
 * non-blocking indicator can never show a different number from the one the gate will enforce.
 */
function fsgEvaluatePlanOverage_(ss, planId, opts) {
  opts = opts || {};
  var facts = fsgReadInventoryFacts_(ss, { selfPlanId: planId });
  if (!facts.ok) {
    return { ok: false, guard_unavailable: true, reason: facts.reason, detail: facts.detail || null,
      zero_write: true, build: FSG_BUILD_VERSION_ };
  }
  var ev = KMFSG.evaluateOverage({ available: facts.available, shippingPlanId: planId,
    exposureRows: facts.exposureRows });
  ev.guard_available = true;
  ev.build = FSG_BUILD_VERSION_;
  ev.tables_read = facts.tables_read;
  ev.__facts = facts;                 // internal; callers inside this file only
  return ev;
}

/**
 * §4 read-only surface: `factoryStockGuard.get`.
 *
 * The Draft-editing indicator (§7) and any diagnostic read this. It writes nothing, it never issues a
 * confirmation, and it does not gate anything — entering an over-quantity into a Draft is not an authorisation,
 * so this must never be mistaken for one. `overage_qty` here is INFORMATION; the authorisation is the
 * server-side gate on the transition.
 */
function handleFactoryStockGuardGet_(body) {
  body = body || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var planId = fsgStr_(body.shipping_plan_id);
  if (planId) {
    var ev = fsgEvaluatePlanOverage_(ss, planId);
    if (ev.__facts) delete ev.__facts;
    return jsonResponse_({ success: true, zero_write: true, data: ev });
  }
  var facts = fsgReadInventoryFacts_(ss, {});
  if (!facts.ok) {
    return jsonResponse_({ success: false, zero_write: true, error: facts.reason,
      code: facts.reason, data: { build: FSG_BUILD_VERSION_, detail: facts.detail || null } });
  }
  return jsonResponse_({ success: true, zero_write: true, data: {
    contract: KMFSG.CONTRACT, build: FSG_BUILD_VERSION_,
    pool_keys: facts.available.pool_keys, byPool: facts.available.byPool,
    inventory_snapshot_fingerprint: facts.available.fingerprint,
    lifecycle: fsgLifecycleMatrix_(),
    tables_read: facts.tables_read,
    draft_exposure: { counted_lines: facts.draftExposure.counted_lines, released: facts.draftExposure.released },
    plan_exposure: { counted_lines: facts.planExposure.counted_lines, released: facts.planExposure.released }
  } });
}

/**
 * §6 — THE LIFECYCLE MATRIX, reported rather than described.
 *
 * Read from KMFSG's own tables, so the documented answer and the enforced answer cannot drift. A reader asking
 * "does a SUPERSEDED draft hold stock?" gets the value the arithmetic actually used.
 */
function fsgLifecycleMatrix_() {
  if (!fsgGuardAvailable_()) return null;
  function keys(o) { return Object.keys(o || {}).sort(); }
  return {
    contract: KMFSG.CONTRACT,
    allocation_draft: {
      holds_exposure: keys(KMFSG.DRAFT_EXPOSURE_STATUSES),
      history_only: keys(KMFSG.DRAFT_RELEASED_STATUSES),
      line_history_only: keys(KMFSG.DRAFT_LINE_RELEASED_STATUSES),
      note: 'submitted is history HERE because the quantity has moved into shipping_plans in the same locked '
        + 'operation that set it (16_ sadSubmitToShippingPlansCore_, with a verified rollback).'
    },
    shipping_plan: {
      holds_exposure: keys(KMFSG.PLAN_EXPOSURE_STATUSES),
      history_only: keys(KMFSG.PLAN_RELEASED_STATUSES),
      also_released: ['any status once transferred_shipment_id / transferred_to_shipment_at is present'],
      note: 'rejected is absent from both sets on purpose: 11_ writes status back to draft on reject, so it is '
        + 'never a resting status.'
    },
    shipment: {
      holds_exposure: ['factory_stock.fac_reserved_stock (owner type shipment)'],
      note: 'already subtracted by available = fac_current_stock - fac_reserved_stock, which is why a '
        + 'transferred plan must stop counting.'
    },
    ai_regenerate_may_replace: ['AI-generated allocation drafts of the same scope in the run release set'],
    ai_regenerate_may_never_replace: ['user_created allocation drafts', 'any other scope', 'anything submitted, '
      + 'cancelled or expired', 'any shipping_plans row', 'any shipment'],
    manual_override_allowed_at: ['shipping_plans draft -> pending_approval', 'shipping_plans pending_approval -> '
      + 'approved (only when the snapshot moved and the new overage exceeds what was confirmed)'],
    manual_override_never_allowed_at: ['AI generation', 'shipment draft creation']
  };
}

/**
 * §4/§5 — THE GATE, called from inside `handleUpdateShippingPlanStatus_` (11_).
 *
 * This is the ONLY overage authority, and it is reached from the transition handler rather than from a separate
 * endpoint, because §4 requires that a caller hitting the API directly is governed by the same guard. A separate
 * `confirmOverage` action would be a second door into the same room.
 *
 * Returns { proceed, response?, audit? }:
 *   proceed true  — the transition may be written. `audit` is present only when an overage was CONFIRMED.
 *   proceed false — `response` is the complete refusal, and NOTHING has been mutated.
 *
 * THE CALLER MUST HOLD THE LOCK. The recheck and the write have to be one atomic operation (§4.6): a snapshot
 * read outside the lock can move between the check and the status cell, which is exactly the race a fingerprint
 * cannot catch on its own.
 */
function fsgGatePlanTransition_(ss, planId, transition, plan, body) {
  body = body || {};
  transition = fsgStr_(transition);
  var conf = body.overage_confirmation || body.inventory_override || null;
  if (!fsgGuardAvailable_()) {
    // A MIXED DEPLOYMENT, not a reason to proceed. Without the guard this transition would be exactly as
    // unguarded as it was before this round, and the operator would have no way to tell.
    return { proceed: false, response: jsonResponse_({ success: false, zero_write: true,
      error: 'FACTORY_STOCK_GUARD_MODULE_MISSING — the shared factory stock guard (KMFSG, 90_generated_supply_'
        + 'planning_bundle.gs) is not present in this Apps Script project, so this transition is refused rather '
        + 'than run unguarded.',
      code: 'FACTORY_STOCK_GUARD_MODULE_MISSING', stage: 'inventory_guard',
      data: { shipping_plan_id: planId, transition: transition,
        next_action: 'Sync 90_generated_supply_planning_bundle.gs and 71_api_v1_factory_stock_guard.gs into the '
          + 'Apps Script project and publish a new deployment version.' } }) };
  }
  var ev = fsgEvaluatePlanOverage_(ss, planId);
  if (ev.ok === false && ev.guard_unavailable) {
    return { proceed: false, response: jsonResponse_({ success: false, zero_write: true,
      error: 'FACTORY_STOCK_GUARD_READ_FAILED (' + fsgStr_(ev.reason) + ') — availability could not be '
        + 'established, so the transition is refused rather than written unchecked.',
      code: fsgStr_(ev.reason) || 'FACTORY_STOCK_GUARD_READ_FAILED', stage: 'inventory_guard',
      data: { shipping_plan_id: planId, transition: transition, detail: ev.detail || null } }) };
  }
  var facts = ev.__facts; if (ev.__facts) delete ev.__facts;

  if (transition === 'approve') {
    // What a person already accepted, read from the audit ledger — the only record of it.
    var prior = fsgLastConfirmedOverride_(ss, planId);
    // §5 — SILENT when the snapshot is the one already confirmed. An approver shown the modal the submitter
    // already answered learns nothing and is trained to dismiss it.
    var rc = KMFSG.evaluateApprovalRecheck({
      available: facts.available, shippingPlanId: planId, exposureRows: facts.exposureRows,
      confirmedFingerprint: prior.fingerprint,
      confirmedOverageQty: prior.total_overage_qty
    });
    rc.prior_confirmation = prior;
    if (rc.proceed) return { proceed: true, recheck: rc };
    return { proceed: false, response: jsonResponse_({ success: false, zero_write: true,
      error: 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED — the inventory snapshot changed since this plan was '
        + 'confirmed and the shortfall is now larger than what was accepted; it must be confirmed again.',
      code: 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED', stage: 'inventory_guard',
      data: rc }) };
  }

  // transition === 'submit' (Draft -> Pending Approval).
  if (ev.ok) {
    // §4 NORMAL CASE — fits. No modal, no confirmation, no extra question. And a confirmation sent anyway is
    // NOT quietly accepted and stamped: `inventory_override = true` on a plan that never needed it would make
    // the audit meaningless.
    if (conf) {
      var chk = KMFSG.confirmOverage({ available: facts.available, shippingPlanId: planId,
        exposureRows: facts.exposureRows, expectedFingerprint: fsgStr_(conf.inventory_snapshot_fingerprint),
        confirmationToken: fsgStr_(conf.confirmation_token), reason: fsgStr_(conf.override_reason),
        note: fsgStr_(conf.override_note), actor: fsgStr_(conf.override_by), actorMaySubmit: true });
      if (!chk.accepted && chk.code === KMFSG.REFUSAL.NO_OVERAGE) {
        return { proceed: true, overage: ev, confirmation_ignored: KMFSG.REFUSAL.NO_OVERAGE };
      }
    }
    return { proceed: true, overage: ev };
  }

  // §4 OVERAGE CASE.
  if (!conf) {
    // The CHALLENGE. Zero mutation, and everything the modal needs to state the facts.
    return { proceed: false, response: jsonResponse_({ success: false, zero_write: true,
      error: 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED', code: 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED',
      stage: 'inventory_guard', data: ev }) };
  }
  var res = KMFSG.confirmOverage({ available: facts.available, shippingPlanId: planId,
    exposureRows: facts.exposureRows,
    expectedFingerprint: fsgStr_(conf.inventory_snapshot_fingerprint),
    confirmationToken: fsgStr_(conf.confirmation_token),
    reason: fsgStr_(conf.override_reason), note: fsgStr_(conf.override_note),
    actor: fsgStr_(conf.override_by), at: fsgTimestamp_(),
    // §4 — the SAME authority that may submit the plan. A person who cannot send a plan for approval cannot
    // accept an overage on it, and a second permission here would be a way around the first.
    actorMaySubmit: true
  });
  if (!res.accepted) {
    return { proceed: false, response: jsonResponse_({ success: false, zero_write: true,
      error: fsgStr_(res.code), code: fsgStr_(res.code), stage: 'inventory_guard', data: res }) };
  }
  return { proceed: true, overage: ev, audit: res.audit, confirmation: res };
}

/**
 * §4.6 — WRITE THE AUDIT. Append-only, one row per affected pool, plus one structured line on the plan's own
 * `note` so the override is discoverable from the plan row without knowing this table exists.
 *
 * Called by the caller INSIDE the same lock, immediately after the status cells are written, so the two cannot
 * be separated by another writer. Returns the number of audit rows appended.
 */
function fsgAppendOverrideAudit_(ss, entityType, entityId, transition, scope, audit, extra) {
  if (!audit || audit.inventory_override !== true) return 0;
  extra = extra || {};
  var sheet = (typeof fcWriteEnsureSheet_ === 'function')
    ? fcWriteEnsureSheet_(ss, FSG_OVERRIDE_AUDIT_TABLE_, FSG_OVERRIDE_AUDIT_HEADERS_) : null;
  if (!sheet) return 0;
  if (typeof fcWriteEnsureColumns_ === 'function') fcWriteEnsureColumns_(sheet, FSG_OVERRIDE_AUDIT_HEADERS_);
  var H = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return fsgStr_(h).toLowerCase(); });
  var now = fsgTimestamp_();
  var rows = (audit.pools || []);
  var appended = 0;
  for (var i = 0; i < rows.length; i++) {
    var p = rows[i];
    var rec = {
      override_audit_id: 'FSOA-' + KMFSG.fnv1a([entityId, transition, audit.inventory_snapshot_fingerprint,
        p.source_warehouse_id, p.sku, i].join('|')).toUpperCase(),
      created_at: now, entity_type: entityType, entity_id: entityId, transition: transition,
      company: fsgStr_(scope && scope.company), country: fsgStr_(scope && scope.country),
      marketplace: fsgStr_(scope && scope.marketplace),
      inventory_pool_id: p.inventory_pool_id == null ? '' : p.inventory_pool_id,
      source_warehouse_id: p.source_warehouse_id, sku: p.sku,
      inventory_override: true, override_reason: audit.override_reason,
      override_reason_label: audit.override_reason_label, override_note: audit.override_note == null ? '' : audit.override_note,
      override_by: audit.override_by, override_at: audit.override_at || now,
      available_qty_at_check: p.available_qty_at_check, already_allocated_qty: p.already_allocated_qty,
      requested_plan_qty: p.requested_plan_qty, projected_total_qty: p.projected_total_qty,
      overage_qty: p.overage_qty,
      inventory_snapshot_fingerprint: audit.inventory_snapshot_fingerprint,
      confirmation_token: fsgStr_(extra.confirmation_token),
      guard_contract: KMFSG.CONTRACT
    };
    var line = [];
    for (var c = 0; c < H.length; c++) line.push(rec[H[c]] === undefined ? '' : rec[H[c]]);
    sheet.appendRow(line);
    appended++;
  }
  return appended;
}

/**
 * §5 — WHAT WAS ALREADY CONFIRMED, read from the AUDIT LEDGER and from nowhere else.
 *
 * The approval recheck has to know which arithmetic a person already accepted. That fact is the audit row, so
 * the audit row is what is read: a status column would be a second copy of it, and the one thing this project
 * has proved repeatedly about duplicated state is that it eventually disagrees. An ABSENT table means nothing
 * has ever been confirmed, which is the correct reading and not an error.
 *
 * Returns { found, fingerprint, total_overage_qty, override_at, override_by } — the LATEST row for the entity by
 * override_at, because a plan rejected and resubmitted may carry more than one.
 */
function fsgLastConfirmedOverride_(ss, entityId) {
  var out = { found: false, fingerprint: null, total_overage_qty: null, override_at: null, override_by: null,
    reason: null, rows: 0 };
  entityId = fsgStr_(entityId);
  if (!entityId) return out;
  var sh = null;
  try { sh = ss.getSheetByName(FSG_OVERRIDE_AUDIT_TABLE_); } catch (e) { sh = null; }
  if (!sh) { out.reason = 'AUDIT_TABLE_ABSENT_NOTHING_EVER_CONFIRMED'; return out; }
  var data;
  try { data = sh.getDataRange().getValues(); } catch (e2) { out.reason = 'AUDIT_TABLE_UNREADABLE'; return out; }
  if (!data || data.length < 2) { out.reason = 'AUDIT_TABLE_EMPTY'; return out; }
  var H = data[0].map(function (h) { return fsgStr_(h).toLowerCase(); });
  function ix(n) { return H.indexOf(n); }
  var cId = ix('entity_id'), cFp = ix('inventory_snapshot_fingerprint'), cOv = ix('overage_qty'),
      cAt = ix('override_at'), cBy = ix('override_by'), cFlag = ix('inventory_override');
  if (cId === -1 || cFp === -1) { out.reason = 'AUDIT_TABLE_HEADER_MISMATCH'; return out; }
  // One confirmation writes one row PER POOL, all sharing a fingerprint and an override_at. The confirmed
  // overage is therefore the SUM across the rows of that one confirmation, never a single row.
  var best = null, bestAt = '';
  for (var r = 1; r < data.length; r++) {
    if (fsgStr_(data[r][cId]) !== entityId) continue;
    if (cFlag !== -1 && !/^(true|1|yes)$/i.test(fsgStr_(data[r][cFlag]))) continue;
    var at = cAt === -1 ? '' : fsgStr_(data[r][cAt]);
    var fp = fsgStr_(data[r][cFp]);
    var q = cOv === -1 ? null : fsgNum_(data[r][cOv]);
    out.rows++;
    if (best && fp === best.fingerprint) { if (q !== null) best.total_overage_qty = (best.total_overage_qty || 0) + q; continue; }
    if (!best || at >= bestAt) {
      bestAt = at;
      best = { fingerprint: fp, total_overage_qty: q, override_at: at, override_by: cBy === -1 ? '' : fsgStr_(data[r][cBy]) };
    }
  }
  if (!best) { out.reason = 'NO_CONFIRMATION_FOR_THIS_ENTITY'; return out; }
  out.found = true; out.fingerprint = best.fingerprint; out.total_overage_qty = best.total_overage_qty;
  out.override_at = best.override_at; out.override_by = best.override_by;
  return out;
}

// The one-line summary appended to `shipping_plans.note`. Deliberately parseable and deliberately NOT the only
// record: the ledger above is the audit, this is the breadcrumb that makes it findable.
function fsgOverrideNoteLine_(audit) {
  if (!audit || audit.inventory_override !== true) return '';
  return 'INVENTORY_OVERRIDE total_overage=' + fsgStr_(audit.total_overage_qty)
    + ' reason=' + fsgStr_(audit.override_reason)
    + ' by=' + fsgStr_(audit.override_by)
    + ' at=' + fsgStr_(audit.override_at)
    + ' snapshot=' + fsgStr_(audit.inventory_snapshot_fingerprint)
    + ' pools=' + (audit.pools || []).map(function (p) {
      return fsgStr_(p.source_warehouse_id) + '/' + fsgStr_(p.sku) + '+' + fsgStr_(p.overage_qty);
    }).join(',');
}

/**
 * §8 — THE SCHEMA DIFF, AND A READ-ONLY VALIDATOR. DRY RUN BY DEFAULT.
 *
 * There is exactly ONE schema addition in this round and it is a NEW append-only table; no live header is
 * modified, no column is added to any existing table, and no production migration is run here. This function
 * reports what exists and what the table would look like, and writes nothing at all.
 *
 * Run from the Apps Script editor: `RUN_R6R7_R5_FACTORY_STOCK_GUARD_SCHEMA_VALIDATE()`.
 */
function fsgValidateOverrideAuditSchema_(ss) {
  var out = { contract: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 §8 — DRY RUN, read only, writes nothing',
    build: FSG_BUILD_VERSION_, dry_run: true, writes: 0,
    table: FSG_OVERRIDE_AUDIT_TABLE_, expected_headers: FSG_OVERRIDE_AUDIT_HEADERS_.slice(),
    expected_column_count: FSG_OVERRIDE_AUDIT_HEADERS_.length,
    exists: false, live_headers: null, missing_headers: [], extra_headers: [], order_matches: null,
    existing_table_columns_changed: [], rollback: null, verdict: null };
  var sh = null;
  try { sh = ss.getSheetByName(FSG_OVERRIDE_AUDIT_TABLE_); } catch (e) { sh = null; }
  if (!sh) {
    out.verdict = 'ABSENT_WILL_BE_CREATED_ON_FIRST_OVERRIDE';
    out.note = 'The table does not exist. It is created additively by fcWriteEnsureSheet_ the first time an '
      + 'overage is actually confirmed — the same pattern that created factory_stock_movements. Until then no '
      + 'override has been accepted, so there is nothing unrecorded.';
    out.rollback = 'Delete the (empty) tab. No other table is touched by this round, so there is nothing else '
      + 'to undo.';
    return out;
  }
  out.exists = true;
  var live = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(function (h) { return fsgStr_(h); });
  out.live_headers = live;
  var want = FSG_OVERRIDE_AUDIT_HEADERS_;
  want.forEach(function (h) { if (live.indexOf(h) === -1) out.missing_headers.push(h); });
  live.forEach(function (h) { if (h && want.indexOf(h) === -1) out.extra_headers.push(h); });
  out.order_matches = live.slice(0, want.length).join('|') === want.join('|');
  out.row_count = Math.max(0, sh.getLastRow() - 1);
  out.verdict = (!out.missing_headers.length && out.order_matches) ? 'READY' : 'HEADER_MISMATCH';
  out.rollback = 'This table is append-only and referenced by nothing. Removing the tab removes the audit trail '
    + 'and nothing else; no existing table has been altered by this round.';
  return out;
}

function RUN_R6R7_R5_FACTORY_STOCK_GUARD_SCHEMA_VALIDATE() {
  var out = fsgValidateOverrideAuditSchema_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * READ-ONLY diagnostic: the whole guard picture for one scope, for the operator's preflight.
 * Writes nothing. Run from the editor: `RUN_R6R7_R5_FACTORY_STOCK_GUARD_CENSUS()`.
 */
function RUN_R6R7_R5_FACTORY_STOCK_GUARD_CENSUS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var facts = fsgReadInventoryFacts_(ss, {});
  var out = { contract: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 — read-only guard census; writes 0',
    build: FSG_BUILD_VERSION_, writes: 0, ok: facts.ok, reason: facts.reason || null,
    guard_module_present: fsgGuardAvailable_(),
    lifecycle: fsgLifecycleMatrix_(),
    schema: fsgValidateOverrideAuditSchema_(ss) };
  if (facts.ok) {
    out.tables_read = facts.tables_read;
    out.inventory_snapshot_fingerprint = facts.available.fingerprint;
    out.pool_count = facts.available.pool_keys.length;
    out.balances = { examined: facts.balances.examined, counted: facts.balances.counted,
      skipped_non_factory: facts.balances.skipped_non_factory, unreadable: facts.balances.unreadable };
    out.draft_exposure = { counted_lines: facts.draftExposure.counted_lines,
      header_count: facts.draftExposure.header_count, released: facts.draftExposure.released };
    out.plan_exposure = { counted_lines: facts.planExposure.counted_lines,
      header_count: facts.planExposure.header_count, released: facts.planExposure.released };
    // The pools that are ALREADY over-committed, which is the number an operator most needs before turning
    // anything on. A negative headroom is a real state and is reported as one, never clamped to zero.
    out.pools_already_over_committed = facts.available.pool_keys.filter(function (k) {
      return facts.available.byPool[k].available_to_allocate < 0;
    }).map(function (k) { return facts.available.byPool[k]; });
    out.pools_sample = facts.available.pool_keys.slice(0, 25).map(function (k) { return facts.available.byPool[k]; });
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
