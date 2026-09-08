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
var FSG_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';

// ==============================================================================================================
// THE APPEND-ONLY OVERRIDE AUDIT LEDGER — PROVISIONED BY MIGRATION, NEVER BY THE RUNTIME.
//
// R5 described this table as "created additively by fcWriteEnsureSheet_ the first time an override is actually
// accepted". That sentence was wrong in BOTH of its halves, and the second half is the one that mattered.
//
//   1. `fcWriteEnsureSheet_` DOES NOT CREATE ANYTHING. It is `prodRequireSheet_` (29_), which THROWS
//      SCHEMA_NOT_PROVISIONED on an absent sheet — Production Safety RULE S0-3 moved creation out of the
//      runtime and behind an authorized migration DTO, and a suite already asserts that no ensure-helper
//      contains insertSheet. So no lazy create was ever going to happen.
//   2. WHAT ACTUALLY HAPPENED WAS WORSE THAN A LAZY CREATE. The throw landed in the caller's try/catch, which
//      recorded `auditRows = -1` and CARRIED ON: the plan moved to Pending Approval with an accepted overage
//      and no audit row anywhere. An override whose justification was never written is exactly the thing the
//      ledger exists to make impossible.
//
// So the runtime now REQUIRES the table, with all 25 columns in order, BEFORE it accepts a confirmation — and
// refuses the transition with FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING and zero writes when it cannot be
// satisfied. The first real submit of an operator's week must not also be a schema migration. Provisioning is
// TEMP_migrate_factory_stock_override_audit_r5.gs, which is DRY RUN by default and writes only under an
// explicit execute + reviewed checksum.
// ==============================================================================================================
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

// The one refusal code a runtime that cannot RECORD an override must give instead of recording nothing.
var FSG_AUDIT_SCHEMA_REFUSAL_ = 'FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING';

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
  // ============================================================================================================
  // THE LEDGER IS REQUIRED BEFORE THE CONFIRMATION IS HONOURED, NOT AFTER.
  //
  // This check is here and not next to the append for one reason: at this point NOTHING has been written, so
  // a missing ledger is a clean refusal with the plan still in Draft. Discovering it after the status cell has
  // moved leaves a plan in Pending Approval carrying an accepted overage that no record justifies — which is
  // what R5 actually did, because the throw was swallowed into `auditRows = -1` and the transition continued.
  // ============================================================================================================
  var auditReq = fsgRequireOverrideAuditSheet_(ss);
  if (!auditReq.ok) {
    return { proceed: false, response: jsonResponse_({ success: false, zero_write: true,
      error: FSG_AUDIT_SCHEMA_REFUSAL_ + ' — an overage was confirmed, but the append-only override audit '
        + 'ledger `' + FSG_OVERRIDE_AUDIT_TABLE_ + '` is ' + fsgStr_(auditReq.reason).toLowerCase().split('_').join(' ')
        + '. The transition is refused with zero writes: an override that cannot be recorded must not be '
        + 'granted. Provision the table with TEMP_migrate_factory_stock_override_audit_r5.gs (DRY RUN first).',
      code: FSG_AUDIT_SCHEMA_REFUSAL_, stage: 'inventory_guard',
      data: { shipping_plan_id: planId, transition: transition, schema: auditReq,
        overage_confirmed_but_unrecordable: true,
        next_action: 'Run TEMP_FSOA_R5_MIGRATE_DRY_RUN(), review, then TEMP_FSOA_R5_MIGRATE_COMMIT().' } }) };
  }
  return { proceed: true, overage: ev, audit: res.audit, confirmation: res, audit_schema: auditReq.reason };
}

/**
 * §4.6 — WRITE THE AUDIT. Append-only, one row per affected pool, plus one structured line on the plan's own
 * `note` so the override is discoverable from the plan row without knowing this table exists.
 *
 * Called by the caller INSIDE the same lock, immediately after the status cells are written, so the two cannot
 * be separated by another writer. Returns the number of audit rows appended.
 */
function fsgRequireOverrideAuditSheet_(ss) {
  var out = { ok: false, code: FSG_AUDIT_SCHEMA_REFUSAL_, table: FSG_OVERRIDE_AUDIT_TABLE_,
    expected_headers: FSG_OVERRIDE_AUDIT_HEADERS_.slice(), expected_column_count: FSG_OVERRIDE_AUDIT_HEADERS_.length,
    exists: false, live_headers: null, missing_headers: [], extra_headers: [], order_matches: null,
    sheet: null, reason: null };
  var sh = null;
  try { sh = ss.getSheetByName(FSG_OVERRIDE_AUDIT_TABLE_); } catch (e) { sh = null; }
  if (!sh) { out.reason = 'TABLE_ABSENT'; return out; }
  out.exists = true;
  var lastCol = 0;
  try { lastCol = sh.getLastColumn(); } catch (e2) { lastCol = 0; }
  if (!lastCol) { out.reason = 'HEADER_ROW_EMPTY'; return out; }
  var live;
  try { live = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return fsgStr_(h); }); }
  catch (e3) { out.reason = 'HEADER_ROW_UNREADABLE'; return out; }
  out.live_headers = live;
  var want = FSG_OVERRIDE_AUDIT_HEADERS_;
  want.forEach(function (h) { if (live.indexOf(h) === -1) out.missing_headers.push(h); });
  live.forEach(function (h) { if (h && want.indexOf(h) === -1) out.extra_headers.push(h); });
  // EXACT AND POSITIONAL for the 25 leading columns. A column present but in the wrong place is not a
  // cosmetic difference here: the row is written BY POSITION from the live header row, so a reordered
  // header writes an override_reason into an override_by cell and the ledger becomes evidence of nothing.
  out.order_matches = live.slice(0, want.length).join('|') === want.join('|');
  if (out.missing_headers.length) { out.reason = 'MISSING_COLUMNS'; return out; }
  if (!out.order_matches) { out.reason = 'COLUMN_ORDER_MISMATCH'; return out; }
  out.ok = true; out.code = null; out.reason = 'READY'; out.sheet = sh;
  return out;
}

/**
 * §B — THE JOURNAL, IN THE SHAPE THIS PROJECT ALREADY USES.
 *
 * `{ kind: 'cell', sheet, row, col, prev }` and `{ kind: 'row', sheet, row, verify_key }` are exactly the
 * entries `factoryStockRollbackJournal_` (21_) replays for 12_ and 13_, so a plan transition rolls back through
 * the same vocabulary as a reservation. What is added here is VERIFICATION: 21_'s replay swallows every error
 * and returns nothing, which is fine when its caller reports COMMIT_FAILED regardless, and NOT fine when the
 * question being asked is "did the rollback actually happen". A rollback nobody checked is a claim, and this
 * round exists because a claim was printed where a check belonged.
 */
function fsgJournalSetCell_(journal, sheet, row, col1, prev, value) {
  // The journal entry is pushed BEFORE the write. If setValue throws, the entry is already there and the
  // rollback restores a cell that may or may not have changed — which is harmless, and the opposite ordering
  // loses the only record of a write that DID land.
  if (journal) journal.push({ kind: 'cell', sheet: sheet, row: row, col: col1 - 1, prev: prev });
  sheet.getRange(row, col1).setValue(value);
}

/**
 * REPLAY IN REVERSE, THEN PROVE IT. Returns { ok, entries, restored, deleted, unverified[] }.
 *
 * ok:false is an INDETERMINATE state and must never be reported as a success or as a clean refusal. The caller
 * says so in those words, names the cells it could not restore, and stops.
 */
function fsgRollbackVerified_(journal) {
  var out = { ok: false, entries: (journal || []).length, restored: 0, deleted: 0, unverified: [] };
  var rows = [];
  for (var i = (journal || []).length - 1; i >= 0; i--) {
    var j = journal[i];
    try {
      if (j.kind === 'cell') { j.sheet.getRange(j.row, j.col + 1).setValue(j.prev); out.restored++; }
      else if (j.kind === 'row') rows.push(j);
    } catch (e) {
      out.unverified.push({ kind: j.kind, row: j.row, col: j.col == null ? null : j.col,
        error: String(e && e.message ? e.message : e) });
    }
  }
  // Appended rows are deleted highest-first so an earlier deletion cannot shift a later row number.
  rows.sort(function (a, b) { return b.row - a.row; });
  rows.forEach(function (j) {
    try { j.sheet.deleteRow(j.row); out.deleted++; }
    catch (e2) { out.unverified.push({ kind: 'row', row: j.row, error: String(e2 && e2.message ? e2.message : e2) }); }
  });
  try { if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.flush) SpreadsheetApp.flush(); } catch (e3) {}
  // ---- VERIFY. Every restored cell is READ BACK, and every deleted row's identity is searched for.
  for (var k = 0; k < (journal || []).length; k++) {
    var e0 = journal[k];
    try {
      if (e0.kind === 'cell') {
        var now = e0.sheet.getRange(e0.row, e0.col + 1).getValue();
        // Compared as strings: a sheet hands back 3 for '3' and '' for a blank, and a rollback that restored
        // the value is not a failure because the cell's type round-tripped.
        if (fsgStr_(now) !== fsgStr_(e0.prev)) {
          out.unverified.push({ kind: 'cell', row: e0.row, col: e0.col, expected: e0.prev, actual: now,
            error: 'CELL_NOT_RESTORED' });
        }
      } else if (e0.kind === 'row' && e0.verify_key) {
        if (fsgFindRowByColumnValue_(e0.sheet, e0.verify_key.column, e0.verify_key.value) !== -1) {
          out.unverified.push({ kind: 'row', row: e0.row, key: e0.verify_key, error: 'APPENDED_ROW_STILL_PRESENT' });
        }
      }
    } catch (e4) {
      out.unverified.push({ kind: e0.kind, row: e0.row, error: 'VERIFY_READ_FAILED: '
        + String(e4 && e4.message ? e4.message : e4) });
    }
  }
  out.ok = out.unverified.length === 0;
  return out;
}

// Row index (1-based) of the first row whose `column` equals `value`, or -1. Used to make an append idempotent
// and to prove a rollback deletion.
function fsgFindRowByColumnValue_(sheet, column, value) {
  var data;
  try { data = sheet.getDataRange().getValues(); } catch (e) { return -1; }
  if (!data || data.length < 2) return -1;
  var H = data[0].map(function (h) { return fsgStr_(h).toLowerCase(); });
  var c = H.indexOf(fsgStr_(column).toLowerCase());
  if (c === -1) return -1;
  var want = fsgStr_(value);
  for (var r = 1; r < data.length; r++) { if (fsgStr_(data[r][c]) === want) return r + 1; }
  return -1;
}

// The deterministic identity of ONE audit row. Same confirmation, same pools, same id — which is what makes a
// replayed confirmation unable to write a second row rather than merely unlikely to.
function fsgOverrideAuditRowId_(entityId, transition, fingerprint, warehouseId, sku, index) {
  return 'FSOA-' + KMFSG.fnv1a([entityId, transition, fingerprint, warehouseId, sku, index].join('|')).toUpperCase();
}

/**
 * §4.6 — WRITE THE AUDIT. Append-only, one row per affected pool, INSIDE THE CALLER'S JOURNAL.
 *
 * The schema is REQUIRED, not ensured: an absent or mismatched ledger is a typed refusal that the caller turns
 * into a refused transition, and this function creates nothing.
 *
 * Returns { ok, code, appended, skipped_existing, expected, rows, schema } — a typed result rather than a
 * count, because "0 rows appended" was previously the same value for "nothing needed writing" and "the ledger
 * does not exist", and those two must never again be the same answer.
 */
function fsgAppendOverrideAudit_(ss, entityType, entityId, transition, scope, audit, extra) {
  extra = extra || {};
  var out = { ok: false, code: null, appended: 0, skipped_existing: 0, expected: 0, rows: [], schema: null };
  if (!audit || audit.inventory_override !== true) { out.code = 'NO_OVERRIDE_TO_RECORD'; out.ok = true; return out; }
  var req = fsgRequireOverrideAuditSheet_(ss);
  out.schema = { exists: req.exists, reason: req.reason, missing_headers: req.missing_headers,
    extra_headers: req.extra_headers, order_matches: req.order_matches };
  if (!req.ok) { out.code = req.code; return out; }
  var sheet = req.sheet;
  var H = req.live_headers.map(function (h) { return fsgStr_(h).toLowerCase(); });
  var journal = extra.journal || null;
  var now = fsgTimestamp_();
  var pools = (audit.pools || []);
  out.expected = pools.length;
  for (var i = 0; i < pools.length; i++) {
    var p = pools[i];
    var rowId = fsgOverrideAuditRowId_(entityId, transition, audit.inventory_snapshot_fingerprint,
      p.source_warehouse_id, p.sku, i);
    // IDEMPOTENT BY IDENTITY. A replayed confirmation carries the same fingerprint and the same pools, so it
    // computes the same row id — and a row that is already there is not written twice.
    if (fsgFindRowByColumnValue_(sheet, 'override_audit_id', rowId) !== -1) {
      out.skipped_existing++; out.rows.push({ override_audit_id: rowId, written: false, reason: 'ALREADY_PRESENT' });
      continue;
    }
    var rec = {
      override_audit_id: rowId,
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
    // Journalled AFTER the append, because the row number is only knowable once it exists. The verify_key is
    // the row's own identity rather than its position, so a rollback proves the ROW is gone and not merely
    // that the sheet got shorter.
    if (journal) journal.push({ kind: 'row', sheet: sheet, row: sheet.getLastRow(),
      verify_key: { column: 'override_audit_id', value: rowId } });
    out.appended++;
    out.rows.push({ override_audit_id: rowId, written: true });
  }
  out.ok = true;
  return out;
}

/**
 * §B — READ THE COMMIT BACK. The status cell and every audit row this confirmation should have written.
 *
 * A write that was accepted by the API and is not in the sheet is the failure mode this project has been
 * bitten by more than once, and it is invisible to a writer that only checks for thrown exceptions.
 */
function fsgVerifyOverrideCommit_(ss, planSheet, row, statusCol1, expectedStatus, entityId, transition, audit) {
  var out = { ok: false, code: null, status_read_back: null,
    audit_rows_expected: (audit && audit.pools ? audit.pools.length : 0), audit_rows_found: 0, missing_rows: [] };
  if (statusCol1 > 0) {
    try { out.status_read_back = fsgStr_(planSheet.getRange(row, statusCol1).getValue()); }
    catch (e) { out.code = 'STATUS_READBACK_FAILED'; out.detail = String(e && e.message ? e.message : e); return out; }
    if (out.status_read_back !== fsgStr_(expectedStatus)) { out.code = 'STATUS_READBACK_MISMATCH'; return out; }
  }
  var req = fsgRequireOverrideAuditSheet_(ss);
  if (!req.ok) { out.code = req.code; return out; }
  var pools = (audit && audit.pools) || [];
  for (var i = 0; i < pools.length; i++) {
    var rowId = fsgOverrideAuditRowId_(entityId, transition, audit.inventory_snapshot_fingerprint,
      pools[i].source_warehouse_id, pools[i].sku, i);
    if (fsgFindRowByColumnValue_(req.sheet, 'override_audit_id', rowId) === -1) out.missing_rows.push(rowId);
    else out.audit_rows_found++;
  }
  if (out.missing_rows.length) { out.code = 'AUDIT_ROWS_NOT_READ_BACK'; return out; }
  out.ok = true;
  return out;
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
    out.verdict = 'ABSENT_MIGRATION_REQUIRED';
    out.missing_headers = FSG_OVERRIDE_AUDIT_HEADERS_.slice();
    out.order_matches = false;
    out.note = 'The table does not exist and the RUNTIME WILL NOT CREATE IT. Until it is provisioned, a '
      + 'confirmed overage is REFUSED with ' + FSG_AUDIT_SCHEMA_REFUSAL_ + ' and zero writes — the plan stays '
      + 'in Draft. Provision it with TEMP_migrate_factory_stock_override_audit_r5.gs: '
      + 'TEMP_FSOA_R5_MIGRATE_DRY_RUN() first, then TEMP_FSOA_R5_MIGRATE_COMMIT() after review.';
    out.rollback = 'Delete the (empty) tab. No other table is touched by this round, so there is nothing else '
      + 'to undo, and the runtime returns to refusing overage confirmations rather than to writing unrecorded '
      + 'ones.';
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
  // The SAME predicate the runtime uses, run here so the validator's verdict and the gate's decision cannot
  // disagree. An extra trailing column is allowed on both sides; a missing or reordered one is not.
  out.runtime_would_accept = fsgRequireOverrideAuditSheet_(ss).ok;
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
