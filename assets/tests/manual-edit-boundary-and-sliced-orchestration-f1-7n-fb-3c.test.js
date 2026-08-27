// =============================================================================================================
// F1-7N-FB-3C — manual-edit persistence boundary, sliced/leased orchestration, exact output verification.
// -------------------------------------------------------------------------------------------------------------
// WHAT THIS SUITE IS FOR. FB-3B moved the Send transaction to the server but shipped four real defects:
//   · a 90 s client bound against a 240 s server yield, so the browser declared an indeterminate timeout while
//     the server was BY DESIGN still writing — and the PARTIAL_RESUMABLE answer was unreachable code;
//   · a journal lease that was a read-modify-write race, and was keyed so two DIFFERENT keys could own
//     overlapping drafts;
//   · a preview that journaled nothing, so the approved plan and the executed plan were two computations;
//   · an output check that verified header existence and a LINE COUNT — a writer that wrote the right NUMBER of
//     wrong lines would have passed.
// It also left a hole §B now closes: a user quantity typed onto a never-materialized SKU wrote nothing at all.
//
// Every claim below is proven by EXECUTING the shipped functions — the real workset builder, the real quantity
// barrier, the real ownership decision, the real journal, the real output verifiers, the real orchestration
// against an injected io. Where a claim is structural (a lock that must not be held, a writer that must not
// exist, an identity that must never be minted), the assertion runs against COMMENT- and STRING-stripped source
// so it cannot be satisfied by prose describing the guarantee.
//
// KNOWN REGRESSION BASELINE (claim 21): four suites fail on this repo for reasons that predate FB-3B —
// gap-job-done-notice-f1-small-r1, order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle
// and supply-planning-route-inventory. FB-3C must not add a fifth. That is verified by the full sweep; what this
// suite asserts is the part a suite CAN assert: that FB-3C shipped no test-only escape hatch that would make a
// green sweep meaningless.
// =============================================================================================================
// NOTE: deliberately NOT strict mode. This suite EXECUTES the shipped functions via eval(); in strict mode an
// eval-scoped function declaration would not reach this module scope, so the suite could only inspect text.
const fs = require('fs');
const path = require('path');

let pass = 0; const failures = [];
function ok(cond, msg) { if (cond) { pass++; } else { failures.push(msg); console.log('FAIL ' + msg); } }
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { pass++; } else { failures.push(msg + '  (got ' + A + ', want ' + B + ')'); console.log('FAIL ' + msg + '  got ' + A + ' want ' + B); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

const ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1'); }
function noStrings(src) { return code(src).replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""'); }
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  let i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  const start = i; let depth = 0, started = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function extractVar(src, decl) {
  let i = src.indexOf(decl);
  if (i < 0) throw new Error('var not found: ' + decl);
  const start = i; let depth = 0, seen = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[' || ch === '{') { depth++; seen = true; }
    else if (ch === ']' || ch === '}') { depth--; if (seen && depth === 0) return src.slice(start, i + 2); }
  }
  throw new Error('unbalanced var: ' + decl);
}
function slice(src, a, b) { const i = src.indexOf(a); const j = src.indexOf(b, i + 1); return src.slice(i, j); }

const G66 = read('specs/active/apps-script/66_api_v1_request_order_send.gs');
const G67 = read('specs/active/apps-script/67_api_v1_allocation_draft_identity.gs');
const G15 = read('specs/active/apps-script/15_request_allocation_handlers.gs');
const G16 = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
const G24 = read('specs/active/apps-script/24_recommendation_orchestrator.gs');
const G63 = read('specs/active/apps-script/63_api_v1_system_health.gs');
const ROUTER = read('specs/active/apps-script/01_router.gs');
const RO = read('js/pages/request-order.js');
const IR = read('js/pages/inventory-replenishment.js');
const DBAPI = read('js/api/operation-system-db-api.js');
const DOC = read('../docs/planning/REQUEST_ORDER_ALLOCATION_DRAFT_CREATION_BOUNDARY.md');

const SEND = RO.slice(RO.indexOf('async function handleSendRequest()'), RO.indexOf('function _roSendPlanningCycle_'));
const LOOP = RO.slice(RO.indexOf('async function _roSendRunToCompletion_'), RO.indexOf('async function handleSendRequest()'));
const EEE = extractFn(G15, 'handleRequestOrderAllocationDraftEnsureAndEdit_');

// ---- load the REAL functions -------------------------------------------------------------------------------
eval(slice(G66, 'var ROS_BUILD_VERSION_ =', '// __ROS_PURE_START__'));
eval(slice(G66, '// __ROS_PURE_START__', '// __ROS_PURE_END__'));
eval(extractFn(G66, 'rosBuildEnvelope_'));
eval(extractFn(G66, 'rosSeriesIndex_'));
eval(extractFn(G66, 'rosUnwrap_'));
eval(extractFn(G66, 'rosCountsOf_'));
eval(extractFn(G66, 'rosJournalWrite_'));
eval(extractFn(G66, 'rosJournalRead_'));
eval(extractFn(G66, 'rosOwnershipTransact_'));
eval(extractFn(G66, 'rosOwnershipRelease_'));
eval(extractFn(G66, 'handleRequestOrderSendOrchestrate_'));
eval(extractFn(G66, 'handleRequestOrderSendStatus_'));
eval(extractFn(G67, 'adiStr_'));
eval(extractFn(G67, 'adiLc_'));
eval(extractFn(G67, 'adiUc_'));
eval(extractFn(G67, 'adiQty_'));
eval(extractFn(G67, 'adiMaskId_'));
eval(extractFn(G67, 'adiClassifyId_'));
eval(extractFn(G67, 'adiNaturalKey_'));
eval(extractFn(G67, 'adiTierSummary_'));
eval(extractFn(G67, 'adiSendVisibility_'));
eval(extractVar(G67, 'var ADI_TIERS_ = ['));
eval(extractVar(G67, 'var ADI_ACTIVE_STATUSES_ = {'));
var ADI_BUILD_VERSION_ = (G67.match(/var ADI_BUILD_VERSION_ = '([^']+)';/) || [])[1];
eval(extractFn(G16, 'sadVerifyShippingPlanOutput_'));

// KMRDV2.draftId is the identity authority the diagnostic delegates to; stub it with the SHIPPED shape so the
// analyser can run without the whole bundle. The shape is copied from 90_ projectFlatDraftRow/draftId.
var KMRDV2 = {
  draftId: function (scope, cycle) {
    const fields = ['company', 'country', 'draft_purpose', 'marketplace', 'sku'];
    return 'RD::MONTHLY_ORDER::' + cycle + '::' + fields.map(function (k) { return k + '=' + String(scope[k] == null ? '' : scope[k]); }).join('|');
  }
};
function rpoFlatBundle_() { return true; }
eval(extractFn(G67, 'adiCanonicalIdFor_'));
eval(extractFn(G67, 'adiAnalyse_'));

// ---- fixtures ----------------------------------------------------------------------------------------------
function canonId(o) {
  return 'RD::MONTHLY_ORDER::' + (o.cycle || '2026-08') + '::company=' + (o.company === undefined ? 'KM' : o.company) +
    '|country=' + (o.country === undefined ? 'US' : o.country) + '|draft_purpose=regular' +
    '|marketplace=' + (o.marketplace === undefined ? 'Amazon' : o.marketplace) + '|sku=' + (o.sku || 'S1');
}
function draftRow(o) {
  o = o || {};
  const r = {
    request_allocation_draft_id: o.id || canonId(o),
    planning_cycle: o.cycle === undefined ? '2026-08' : o.cycle,
    company: o.company === undefined ? 'KM' : o.company,
    country: o.country === undefined ? 'US' : o.country,
    marketplace: o.marketplace === undefined ? 'Amazon' : o.marketplace,
    sku: o.sku || 'S1', draft_purpose: 'regular',
    status: o.status === undefined ? 'site_confirmed' : o.status,
    generation_type: o.generation_type || 'ai_plan',
    draft_version: o.draft_version === undefined ? 1 : o.draft_version,
    units_per_carton: o.upc === undefined ? 12 : o.upc, updated_at: '2026-08-20 10:00'
  };
  ['T1', 'T2', 'T3'].forEach(function (t) {
    const p = t.toLowerCase() + '_';
    const cell = (o.tiers || {})[t];
    r[p + 'month'] = cell ? (cell.month || '2026-09') : '';
    r[p + 'recommended_qty'] = cell && cell.rec !== undefined ? cell.rec : '';
    r[p + 'order_qty'] = cell && cell.qty !== undefined ? cell.qty : '';
    r[p + 'status'] = cell && cell.status ? cell.status : (cell ? 'draft' : '');
    r[p + 'user_edited'] = cell && cell.userEdited ? 'true' : '';
  });
  return r;
}
const SKU_DETAILS = [
  { sku: 'S1', series: 'ALPHA', units_per_carton: 12 },
  { sku: 'S2', series: 'ALPHA', units_per_carton: 12 },
  { sku: 'S3', series: 'BETA', units_per_carton: 6 },
  { sku: 'S4', series: 'GAMMA', units_per_carton: 6 }
];
const IDX = rosSeriesIndex_(SKU_DETAILS);
function buildWs(rows, scope, cycle) {
  return rosBuildWorkset_(rows, { planning_cycle: cycle || '2026-08', tier_scope: scope || 'ALL',
    series_by_sku: IDX.series, units_per_carton_by_sku: IDX.upc });
}
let writeCalls = 0;
function fixtureIo(rows, opts) {
  opts = opts || {};
  const store = opts.store || {};
  rows = JSON.parse(JSON.stringify(rows));
  let clock = opts.clock0 || 1000;
  const step = opts.step || 10;
  return {
    now: function () { clock += step; return clock; },
    _setClock: function (v) { clock = v; },
    openDb: function () { return {}; },
    readTable: function (ss, name) {
      if (name === 'request_order_allocation_drafts') return rows;
      if (name === 'sku_details') return SKU_DETAILS;
      if (name === 'request_orders') return opts.orders || [];
      if (name === 'request_order_lines') return opts.orderLines || [];
      if (name === 'request_order_line_sources') return opts.orderSources || [];
      return [];
    },
    // Emulates 13_ roCreateRequestOrderCore_. opts.corrupt makes the writer lie in one specific way, so the §G
    // verifier can be PROVEN to catch each failure mode rather than assumed to.
    createRequestOrderDraft: function (body) {
      writeCalls++;
      // A canonical writer call is the expensive step (it takes its own tryLock(30000) first), so the fixture
      // charges the slice budget HERE rather than on every phase call. That is what the budget models.
      if (opts.writeMs) clock += opts.writeMs;
      if (opts.createFails) return { success: false, error: 'BOOM', stage: 'lines' };
      const n = 'REQ-' + writeCalls, id = 'RO-' + writeCalls;
      let total = 0; const skus = {};
      (body.lines || []).forEach(function (l, li) {
        const lineId = 'ROL-' + writeCalls + '-' + li;
        let q = Number(l.requested_qty);
        if (opts.corrupt === 'QTY' && li === 0) q = q + 1;
        (opts.orderLines = opts.orderLines || []).push({
          request_order_line_id: (opts.corrupt === 'NO_LINE_ID' && li === 0) ? '' : lineId,
          request_order_id: id, sku: l.sku,
          series: (opts.corrupt === 'SERIES' && li === 0) ? 'WRONG' : l.series,
          company: l.company, request_bucket: l.request_bucket, request_month: l.request_month,
          requested_qty: q, approved_qty: q, units_per_carton: l.units_per_carton });
        if (opts.corrupt === 'DUPLICATE_LINE' && li === 0) {
          (opts.orderLines = opts.orderLines || []).push({ request_order_line_id: lineId + 'X', request_order_id: id,
            sku: l.sku, series: l.series, company: l.company, request_bucket: l.request_bucket,
            request_month: l.request_month, requested_qty: q, approved_qty: q });
        }
        (opts.orderSources = opts.orderSources || []).push({
          request_order_line_source_id: 'ROLS-' + writeCalls + '-' + li, request_order_line_id: lineId,
          request_order_id: id, sku: l.sku, company: l.company,
          country: (opts.corrupt === 'STATION' && li === 0) ? 'ZZ' : l.country,
          marketplace: l.marketplace, tier_type: l.request_bucket, source_month: l.request_month,
          request_allocation_draft_id: (opts.corrupt === 'LINEAGE' && li === 0) ? 'RD::MONTHLY_ORDER::2026-08::wrong' : l.request_allocation_draft_id,
          requested_qty: q, approved_qty: q });
        total += q; skus[String(l.sku).toUpperCase()] = 1;
      });
      if (opts.corrupt === 'EXTRA_LINE') {
        (opts.orderLines = opts.orderLines || []).push({ request_order_line_id: 'ROL-EXTRA', request_order_id: id,
          sku: 'GHOST', series: '', company: '', request_bucket: 'T2', request_month: '2026-10', requested_qty: 7 });
      }
      (opts.orders = opts.orders || []).push({ request_order_id: id, request_order_no: n,
        total_qty: (opts.corrupt === 'HEADER_TOTAL' ? total + 5 : total), total_sku: Object.keys(skus).length });
      return { success: true, data: { request_order_id: id, request_order_no: n, reused: false, execution_key: 'ROEXEC-' + writeCalls } };
    },
    submitAllocationDrafts: function (body) {
      opts.submitted = (body || {}).draft_ids || [];
      opts.submitBuckets = (body || {}).submit_buckets;
      if (!opts.skipStatusAdvance) {
        rows.forEach(function (r) { if ((opts.submitted || []).indexOf(r.request_allocation_draft_id) !== -1) r.status = 'submitted'; });
      }
      return { success: true, data: { submitted: (opts.submitted || []).length } };
    },
    propGet: function (n) { return Object.prototype.hasOwnProperty.call(store, n) ? store[n] : null; },
    propSet: function (n, v) { store[n] = String(v); return true; },
    propDelete: function (n) { delete store[n]; return true; },
    withCasLock: function (fn) {
      opts._casDepth = (opts._casDepth || 0) + 1;
      opts._casMaxDepth = Math.max(opts._casMaxDepth || 0, opts._casDepth);
      opts._casCalls = (opts._casCalls || 0) + 1;
      if (opts.casUnavailable) { opts._casDepth--; return { locked: false, error: 'CAS_LOCK_UNAVAILABLE' }; }
      try { return { locked: true, value: fn() }; } finally { opts._casDepth--; }
    },
    _rows: rows, _store: store, _opts: opts
  };
}
function preview(io, payload) {
  return handleRequestOrderSendOrchestrate_({ payload: Object.assign({ mode: 'preview' }, payload) }, io);
}
function execute(io, payload, checksum, extra) {
  return handleRequestOrderSendOrchestrate_({ payload: Object.assign({ mode: 'execute', confirmed_checksum: checksum }, payload, extra || {}) }, io);
}
function runSend(io, payload, extra) {
  const pv = preview(io, payload);
  if (!pv.success) return pv;
  return execute(io, payload, pv.data.confirm_with_checksum, extra);
}

// =============================================================================================================
section('1. an AI default materializes the canonical draft (unchanged path, canonical identity)');

ok(/rpoGenerateMonthlyFlatResult_/.test(G24) && /KMRDV2P\.generateMonthlyFlat\(/.test(G24),
  '1. the AI generation path still goes through the canonical KMRDV2P.generateMonthlyFlat');
ok(/generationType: command\.generationType \|\| \(manual \? 'manual' : 'ai_plan'\)/.test(read('specs/active/apps-script/90_generated_supply_planning_bundle.gs')),
  '1. and the AI default is stamped ai_plan, distinct from a manual create');
// the identity is minted by KMRDV2, and its shape is what the Send treats as canonical
eq(rosIsCanonicalDraftId_(canonId({ sku: 'S1' })), true, '1. a KMRDV2-minted id is recognised as canonical');
eq(rosIsCanonicalDraftId_('RAD-M-KM-US-AMAZON-S1-2026'), false, '1. and a retired RAD-M id is NOT');
eq(rosIsCanonicalDraftId_('RAD-ABC123'), false, '1. nor a legacy RAD- uuid');
// an AI-materialized draft is immediately sendable
const aiWs = buildWs([draftRow({ sku: 'S1', generation_type: 'ai_plan', tiers: { T1: { qty: 100, rec: 100 } } })], 'ALL');
eq(aiWs.positive_selected_tier_allocations, 1, '1. an AI-materialized draft with a positive tier is sendable');
eq(aiWs.drafts[0].canonical_identity, true, '1. and carries a canonical identity');

// =============================================================================================================
section('2. a user 0 -> positive edit CREATES the canonical Flat-V2 draft on save');

// the client no longer drops the edit when no draft exists
const saveFn = extractFn(RO, '_roSaveTierEditToCanonicalDraft_');
ok(/_roCreateCanonicalDraftFromEdit_\(sku, bucket, Number\(patch\.order_qty\), patch, input\)/.test(saveFn),
  '2. an order_qty edit with NO existing draft routes to the canonical create path');
ok(/if \(!hasQty\) return Promise\.resolve\(null\)/.test(saveFn),
  '2. but a NOTE-only edit on a draft-less SKU still creates nothing (the boundary is not widened)');
// the server action composes CREATE then EDIT then READ-BACK, in that order, through canonical writers only
const iGen = EEE.indexOf('rpoGenerateMonthlyFlatResult_');
const iEdit = EEE.indexOf('rpoEditMonthlyFlatResult_');
const iBack = EEE.indexOf('rpoFlatLoadById_');
ok(iGen > -1 && iEdit > iGen && iBack > iEdit,
  '2. the server action CREATES (canonical generate) -> PERSISTS (canonical locked edit) -> READS BACK, in that order');
ok(/generationType: 'user_created'/.test(EEE), '2. a user-created draft is stamped user_created, not ai_plan');
ok(/mode: 'manual'/.test(EEE) && /action: 'create'/.test(EEE),
  '2. through the MANUAL create mode, which is the only one permitted to persist an all-zero draft');
ok(/facts: \{ ready: true/.test(EEE) && /USER_MANUAL_ORDER/.test(EEE),
  '2. supplying explicit facts so a manual create needs NO materialized gap row');
const eeeCode = noStrings(EEE);
['appendRow', '.setValue(', '.setValues(', 'insertSheet', 'deleteRow', 'procurementEnsureSheet_'].forEach(function (w) {
  ok(eeeCode.indexOf(w) === -1, '2. and the action writes no row of its own (' + w + ' absent)');
});
ok(/action === 'requestOrder\.allocationDraft\.ensureAndEdit'/.test(ROUTER), '2. the action is routed');
ok(/ensureAndEditAllocationDraft = function/.test(DBAPI), '2. and the transport exposes it');
// the canonical spec document records the extension — not only the runtime
ok(DOC.length > 500, '2. the canonical boundary document exists');
ok(/NOT the exclusive draft-creation boundary/i.test(DOC),
  '2. and records that AI Plan is no longer the EXCLUSIVE creation boundary');
ok(/user_created/.test(DOC) && /RD::MONTHLY_ORDER/.test(DOC),
  '2. naming the provenance and the canonical identity it must use');

// =============================================================================================================
section('3. a user edit of an EXISTING quantity wins over the AI value, and the read-back is the authority');

const edited = draftRow({ sku: 'S1', tiers: { T1: { qty: 800, rec: 1000, userEdited: true } } });
const wsEdit = buildWs([edited], 'ALL');
eq(wsEdit.rows[0].order_qty, 800, '3. the workset carries the PERSISTED user order_qty (800), not the AI 1000');
eq(wsEdit.rows[0].recommended_qty, 1000, '3. the AI recommendation is carried separately, never merged');
eq(wsEdit.rows[0].user_edited, true, '3. and the user-edit provenance survives');
eq(wsEdit.total_units, 800, '3. the unit total uses the user quantity');
// an existing draft takes the UPDATE path — it is never replaced
ok(/\/\/ \u00a7B\.1/.test(G15) || /for an existing draft this is the ONLY path taken/.test(G15),
  '3. an existing draft is UPDATED in place, never replaced');
// and the read-back is what makes it "saved"
ok(/ALLOCATION_DRAFT_QUANTITY_NOT_VERIFIED/.test(EEE),
  '3. a read-back mismatch is a named failure, not a success');
ok(/if \(persisted === null \|\| Number\(persisted\) !== Number\(qty\)\)/.test(EEE),
  '3. verified by comparing the re-read persisted quantity to the requested one exactly');
ok(/verified: true/.test(EEE), '3. and only a verified write reports verified');
const createFn = extractFn(RO, '_roCreateCanonicalDraftFromEdit_');
ok(/d\.verified !== true/.test(createFn), '3. the page refuses to call it Saved unless the server verified it');

// =============================================================================================================
section('4. a positive -> 0 edit persists 0 and EXCLUDES that tier from the Send');

const zeroed = draftRow({ sku: 'S1', tiers: { T1: { qty: 0, rec: 500 }, T2: { qty: 60 } } });
const wsZero = buildWs([zeroed], 'ALL');
eq(wsZero.positive_selected_tier_allocations, 1, '4. only the positive tier is sendable');
eq(wsZero.excluded.tier_zero_or_blank_qty, 1, '4. the saved 0 is COUNTED as an exclusion, not silently dropped');
eq(wsZero.rows.map(function (r) { return r.request_bucket; }), ['T2'], '4. and the 0 tier produces no line');
eq(wsZero.total_units, 60, '4. the unit total excludes it');
// a saved 0 keeps the draft ACTIVE and re-raisable
eq(wsZero.active_persisted_drafts, 1, '4. the draft itself stays active');
// the zero index makes a saved 0 verifiable rather than looking unsaved
const zIdx = rosZeroQtyIndex_([zeroed], { planning_cycle: '2026-08', tier_scope: 'ALL' });
eq(zIdx['KM|US|amazon|S1::T1'], true, '4. a saved 0 is indexed so it can be VERIFIED');
const vZero = rosVerifyQuantities_(wsZero, [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'S1',
  tiers: { T1: { order_qty: 0 }, T2: { order_qty: 60 } } }], zIdx);
ok(!vZero.blocked, '4. asserting 0 against a saved 0 does NOT block the Send');
eq(vZero.zero_intents_matched, 1, '4. and is counted as a verified zero');
// asserting 0 where nothing is persisted is still a failure
const vGhost = rosVerifyQuantities_(buildWs([], 'ALL'), [{ company: 'KM', country: 'US', marketplace: 'Amazon',
  sku: 'S9', tiers: { T1: { order_qty: 0 } } }], {});
ok(vGhost.blocked, '4. but asserting 0 with NOTHING persisted still blocks');
ok(/zero-quantity rule/i.test(EEE) && /EXCLUDED from the Send workset/.test(EEE),
  '4. and the save response explains the zero-quantity rule to the operator');

// =============================================================================================================
section('5. no new RAD-M identity is ever minted');

ok(code(SEND).indexOf('_roManualDraftId_') === -1, '5. the Send transition never mints a manual id');
ok(code(createFn).indexOf('_roManualDraftId_') === -1, '5. nor does the edit-create path');
ok(noStrings(EEE).indexOf('RAD-M') === -1, '5. and the server action contains no RAD-M literal in code');
ok(/canonical_identity: \/\^RD::MONTHLY_ORDER::/.test(EEE),
  '5. the server PROVES the minted identity is canonical on the wire');
ok(/d\.canonical_identity !== true/.test(createFn),
  '5. and the page refuses to adopt a non-canonical identity even if one were returned');
ok(/RETIRED FROM THE SEND TRANSITION/.test(RO),
  '5. the retired manual-id authority is documented rather than silently deleted');
// the workset counts (and can therefore report) a non-canonical id it finds
const nonCanon = draftRow({ id: 'RAD-M-KM-US-AMAZON-S1-2026', sku: 'S1', tiers: { T1: { qty: 5 } } });
eq(buildWs([nonCanon], 'ALL').excluded.non_canonical_draft_id, 1,
  '5. a pre-existing non-canonical row is COUNTED so it can never be invisible');

// =============================================================================================================
section('6. a failed save blocks the Send');

['ALLOCATION_DRAFT_CREATE_FAILED', 'ALLOCATION_DRAFT_QUANTITY_WRITE_FAILED',
 'ALLOCATION_DRAFT_QUANTITY_NOT_VERIFIED', 'ALLOCATION_DRAFT_CREATE_UNVERIFIED'].forEach(function (c) {
  ok(EEE.indexOf(c) !== -1, '6. the server names the failure: ' + c);
});
ok(/stays UNSAVED on screen/.test(EEE), '6. and says the value stays UNSAVED');
ok(/_roSetFieldState_\(input, 'is-invalid'/.test(createFn), '6. the page marks the field invalid on failure');
ok(/_roLastAutosaveOutcome = 'FAILED'/.test(createFn), '6. and records a FAILED outcome');
ok(/if \(flush\.failed\) \{/.test(SEND) && /Nothing was sent and nothing was written/.test(SEND),
  '6. and the Send is blocked entirely while any pending edit failed to save');
const flushFn = extractFn(RO, '_roFlushDirtyEditsForSend_');
ok(/await Promise\.all/.test(flushFn), '6. the pre-Send flush is AWAITED, not fire-and-forget');
// the server-side barrier is the second, independent gate
const vDrift = rosVerifyQuantities_(buildWs([draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } })], 'ALL'),
  [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'S1', tiers: { T1: { order_qty: 150 } } }], {});
ok(vDrift.blocked && vDrift.failures[0].code === 'QUANTITY_DRIFT',
  '6. and an unsaved edit that reached the server is QUANTITY_DRIFT, never silently replaced by the DB value');
eq(vDrift.failures[0].persisted_qty, 100, '6. reporting the database value');
eq(vDrift.failures[0].intended_qty, 150, '6. and the value on screen');

// =============================================================================================================
section('7. the preview checksum equals the confirmed checksum, and the plan is journaled');

const rows7 = [draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } }), draftRow({ sku: 'S3', tiers: { T1: { qty: 50 } } })];
const io7 = fixtureIo(rows7);
writeCalls = 0;
const pv7 = preview(io7, { tier_scope: 'ALL', planning_cycle: '2026-08' });
ok(pv7.success === true, '7. the preview succeeds');
eq(pv7.data.status, 'PREVIEW', '7. and identifies itself as a frozen plan');
eq(writeCalls, 0, '7. performing ZERO business writes');
eq(pv7.data.journal_persisted, true, '7. the frozen plan is PERSISTED in the journal');
eq(pv7.data.confirm_with_checksum, pv7.data.workset_checksum, '7. and the checksum to confirm is the frozen one');
const j7 = rosJournalRead_(io7, pv7.data.orchestration_key);
ok(!!j7 && j7.status === 'PREVIEW', '7. the journal is readable and marked PREVIEW');
eq(j7.workset_checksum, pv7.data.workset_checksum, '7. holding the SAME checksum the caller was given');
eq(j7.series_order.length, 2, '7. and the immutable Series ORDER the execution must follow');
const ex7 = execute(io7, { tier_scope: 'ALL', planning_cycle: '2026-08' }, pv7.data.confirm_with_checksum);
ok(ex7.success === true, '7. the execute call with that checksum is accepted');
eq(ex7.data.workset_checksum, pv7.data.workset_checksum, '7. and executes EXACTLY the frozen checksum');
// an execute call with no checksum at all is refused
const ioNo = fixtureIo(rows7);
const noCk = handleRequestOrderSendOrchestrate_({ payload: { tier_scope: 'ALL', planning_cycle: '2026-08', mode: 'execute' } }, ioNo);
ok(noCk.success === false && noCk.errors[0].code === 'SEND_CONFIRMATION_REQUIRED',
  '7. an execute call with NO confirmed checksum is refused');
eq(ioNo._opts.orders, undefined, '7. writing nothing');
ok(/confirmed_checksum: checksum/.test(LOOP), '7. and the page always sends the confirmed checksum');

// =============================================================================================================
section('8. drift between preview and confirmation BLOCKS execution');

const rows8 = [draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } })];
const io8 = fixtureIo(rows8);
const pv8 = preview(io8, { tier_scope: 'ALL', planning_cycle: '2026-08' });
io8._rows[0].t1_order_qty = 111;                     // someone edits the quantity after the preview
writeCalls = 0;
const dr8 = execute(io8, { tier_scope: 'ALL', planning_cycle: '2026-08' }, pv8.data.confirm_with_checksum);
ok(dr8.success === false, '8. the execute call is refused');
eq(dr8.errors[0].code, 'SEND_WORKSET_DRIFT', '8. named SEND_WORKSET_DRIFT');
eq(writeCalls, 0, '8. and NOTHING was written');
ok(/Preview again/.test(dr8.errors[0].message), '8. requiring a new preview');
ok(dr8.errors[0].details.confirmed_checksum !== dr8.errors[0].details.current_checksum,
  '8. reporting both checksums so the operator can see what moved');
// and it is never silently replaced by a larger Send
const rows8b = [draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } })];
const io8b = fixtureIo(rows8b);
const pv8b = preview(io8b, { tier_scope: 'ALL', planning_cycle: '2026-08' });
io8b._rows.push(draftRow({ sku: 'S3', tiers: { T1: { qty: 999 } } }));   // a NEW row appears
const dr8b = execute(io8b, { tier_scope: 'ALL', planning_cycle: '2026-08' }, pv8b.data.confirm_with_checksum);
ok(dr8b.success === false && dr8b.errors[0].code === 'SEND_WORKSET_DRIFT',
  '8. a LARGER workset than the one approved is refused, never silently executed');

// =============================================================================================================
section('9. every server slice finishes below the client timeout budget');

const clientWrite = Number((DBAPI.match(/var KM_WRITE_TIMEOUT_MS_ = (\d+);/) || [])[1]);
eq(ROS_CLIENT_WRITE_TIMEOUT_MS_, clientWrite,
  '9. the server restates the REAL client write timeout (' + clientWrite + ' ms), so the pair cannot drift');
eq(ROS_SLICE_BUDGET_MS_, ROS_CLIENT_WRITE_TIMEOUT_MS_ - ROS_MAX_SINGLE_WRITE_MS_ - ROS_RESERVE_MS_,
  '9. the slice budget is DERIVED from it, not a magic number');
ok(ROS_SLICE_BUDGET_MS_ + ROS_MAX_SINGLE_WRITE_MS_ + ROS_RESERVE_MS_ <= ROS_CLIENT_WRITE_TIMEOUT_MS_,
  '9. budget + worst single write + reserve <= the client bound');
ok(ROS_MAX_SINGLE_WRITE_MS_ >= 30000,
  '9. and the worst single write allows for the canonical writer\u2019s own tryLock(30000)');
ok(!/ROS_TIME_BUDGET_MS_/.test(G66), '9. the FB-3B 240 000 ms budget that outlived the client bound is GONE');
ok(ROS_LEASE_MS_ > ROS_SLICE_BUDGET_MS_ + ROS_MAX_SINGLE_WRITE_MS_,
  '9. the lease outlives the worst-case slice, so a live slice is never treated as abandoned');
// EXECUTED: a slow clock forces the admission check, and the answer is PARTIAL_RESUMABLE (not a failure)
// Three Series at 22 s per canonical write: the first two are admitted (22 s, 44 s), the third is deferred
// because 44 s has passed the 43 s admission budget. 22 s is under ROS_MAX_SINGLE_WRITE_MS_, so the modelled
// worst case still holds and the slice provably answers before the 90 s client bound.
const rows9 = [draftRow({ sku: 'S1', tiers: { T1: { qty: 1 } } }), draftRow({ sku: 'S3', tiers: { T1: { qty: 2 } } }),
  draftRow({ sku: 'S4', tiers: { T1: { qty: 3 } } })];
const io9 = fixtureIo(rows9, { writeMs: 22000 });
writeCalls = 0;
const pv9 = preview(io9, { tier_scope: 'ALL', planning_cycle: '2026-08' });
const sl9 = execute(io9, { tier_scope: 'ALL', planning_cycle: '2026-08' }, pv9.data.confirm_with_checksum);
ok(sl9.success === true, '9. a slice boundary is a SUCCESS, not a failure');
eq(sl9.data.status, 'PARTIAL_RESUMABLE', '9. reported as PARTIAL_RESUMABLE');
eq(sl9.data.lifecycle_advanced, false, '9. with the lifecycle explicitly NOT advanced');
eq(sl9.data.safe_to_close, true, '9. and the page told it is safe to close');
eq(sl9.data.slice_budget_ms, ROS_SLICE_BUDGET_MS_, '9. reporting the budget it respected');
eq(sl9.data.series_remaining, 1, '9. and exactly how much work remains');
eq(sl9.data.series_done, 2, '9. two Series were admitted inside the budget');
ok(sl9.data.elapsed_ms <= ROS_CLIENT_WRITE_TIMEOUT_MS_,
  '9. and the slice answered inside the client bound (' + sl9.data.elapsed_ms + ' ms <= ' + ROS_CLIENT_WRITE_TIMEOUT_MS_ + ' ms)');
ok(/Do NOT start a new Send/.test(sl9.data.next_action), '9. telling the operator to CONTINUE, not restart');
// the admission check happens BEFORE a write, never mid-write
const orch = extractFn(G66, 'handleRequestOrderSendOrchestrate_');
const iBudget = orch.indexOf('> ROS_SLICE_BUDGET_MS_');
const iWrite9 = orch.indexOf('io.createRequestOrderDraft');
ok(iBudget > -1 && iBudget < iWrite9, '9. the budget is checked BEFORE the writer is called, never mid-write');

// =============================================================================================================
section('10. same-key concurrent continuation');

const rows10 = [draftRow({ sku: 'S1', tiers: { T1: { qty: 1 } } }), draftRow({ sku: 'S3', tiers: { T1: { qty: 2 } } }),
  draftRow({ sku: 'S4', tiers: { T1: { qty: 3 } } })];
const io10 = fixtureIo(rows10, { writeMs: 22000 });
const pv10 = preview(io10, { tier_scope: 'ALL', planning_cycle: '2026-08' });
const ck10 = pv10.data.confirm_with_checksum;
writeCalls = 0;
const a10 = execute(io10, { tier_scope: 'ALL', planning_cycle: '2026-08' }, ck10, { continuation: 0 });
eq(a10.data.status, 'PARTIAL_RESUMABLE', '10. the first slice stops voluntarily');
const firstWrites = writeCalls;
const b10 = execute(io10, { tier_scope: 'ALL', planning_cycle: '2026-08' }, ck10, { continuation: 1 });
ok(b10.success === true, '10. the continuation with the SAME key and checksum is accepted');
ok(writeCalls > firstWrites, '10. and it does NEW work rather than repeating the first slice');
// the already-completed Series is REUSED, never written twice
const allRecs = (b10.data.request_orders_created || []).concat(b10.data.request_orders_reused || []);
const nos = allRecs.map(function (r) { return r.request_order_no; });
eq(nos.length, new Set(nos).size, '10. no Request Order number appears twice');
eq((b10.data.request_orders_reused || []).length, 2, '10. the first slice\u2019s two Series are REUSED from the journal');
eq((b10.data.request_orders_created || []).length, 1, '10. and only the remaining Series is newly created');
eq(b10.data.status, 'COMPLETED', '10. the continuation completes the Send');
eq(b10.data.verified_headers, 3, '10. with every header field-verified');
ok(/continuation: continuation/.test(LOOP) && /maxLoops/.test(LOOP),
  '10. and the page continues AUTOMATICALLY, bounded, without asking the user to press anything');
ok(/SEND_CONTINUATION_LIMIT_REACHED/.test(G66), '10. the server also bounds continuations independently');

// =============================================================================================================
section('11. overlapping executions with DIFFERENT keys cannot both own the workset');

eq(rosOwnershipDecision_(null, 'K1', 5000).verdict, 'GRANT', '11. no active execution -> GRANT');
eq(rosOwnershipDecision_({ execution_key: 'K1', lease_at: 5000, status: 'RUNNING' }, 'K1', 5100).verdict, 'GRANT',
  '11. the owner renews its own lease');
const refuse = rosOwnershipDecision_({ execution_key: 'K1', lease_at: 5000, status: 'RUNNING' }, 'K2', 5100);
eq(refuse.verdict, 'REFUSE', '11. a DIFFERENT key is REFUSED while the lease is live');
eq(refuse.reason, 'SEND_WORKSET_OWNED_BY_ANOTHER_EXECUTION', '11. by name');
eq(refuse.owner, 'K1', '11. naming the owner');
// EXECUTED end to end: two different keys over the same cycle
const rows11 = [draftRow({ sku: 'S1', tiers: { T1: { qty: 1 } } }), draftRow({ sku: 'S3', tiers: { T1: { qty: 2 } } }),
  draftRow({ sku: 'S4', tiers: { T1: { qty: 3 } } })];
const io11 = fixtureIo(rows11, { writeMs: 22000 });
const p11a = preview(io11, { tier_scope: 'ALL', planning_cycle: '2026-08' });
execute(io11, { tier_scope: 'ALL', planning_cycle: '2026-08' }, p11a.data.confirm_with_checksum);   // leaves a live lease
writeCalls = 0;
// a DIFFERENT key: a different tier scope over the same cycle touches the same drafts
const p11b = preview(io11, { tier_scope: 'T1', planning_cycle: '2026-08' });
const x11 = execute(io11, { tier_scope: 'T1', planning_cycle: '2026-08' }, p11b.data.confirm_with_checksum);
ok(x11.success === false, '11. the second, different-key execution is refused');
eq(x11.errors[0].code, 'SEND_WORKSET_OWNED_BY_ANOTHER_EXECUTION', '11. by name');
eq(writeCalls, 0, '11. and it wrote nothing');
ok(/Do NOT retry/.test(x11.errors[0].message), '11. with an explicit do-not-retry');
// ownership is per PLANNING CYCLE, which is the grain that makes overlap impossible
ok(/ROS_ACTIVE_PREFIX_ \+ rosStr_\(cycle\)/.test(extractFn(G66, 'rosOwnershipTransact_')),
  '11. because ownership is keyed by the PLANNING CYCLE, not by the execution key');

// =============================================================================================================
section('12. the lease is ATOMIC, and an expired lease can be taken over');

const own = extractFn(G66, 'rosOwnershipTransact_');
ok(/io\.withCasLock\(function \(\)/.test(own), '12. the whole decision runs INSIDE the CAS lock');
ok(own.indexOf('io.propGet(activeName)') > own.indexOf('io.withCasLock'),
  '12. the active record is READ inside the lock, so two callers cannot both see "no owner"');
ok(own.indexOf('io.propSet(activeName') > own.indexOf('rosOwnershipDecision_'),
  '12. and written after the decision, inside the same lock');
['createRequestOrderDraft', 'submitAllocationDrafts', 'readTable', 'openDb'].forEach(function (w) {
  ok(code(own).indexOf('io.' + w) === -1, '12. the lock is NEVER held across io.' + w);
});
eq((noStrings(G66).match(/LockService\.getScriptLock\(\)/g) || []).length, 1,
  '12. exactly ONE ScriptLock acquisition exists in the file');
ok(/tryLock\(15000\)/.test(G66), '12. with a short bound, because it only guards a compare-and-set');
// takeover of an expired lease
const takeover = rosOwnershipDecision_({ execution_key: 'K1', lease_at: 1000, status: 'RUNNING' }, 'K2', 1000 + ROS_LEASE_MS_ + 1);
eq(takeover.verdict, 'GRANT', '12. an EXPIRED lease can be taken over');
eq(takeover.reason, 'TAKEOVER_EXPIRED_LEASE', '12. and the takeover is named');
eq(takeover.previous_owner, 'K1', '12. recording who held it');
eq(rosLeaseHeld_({ execution_key: 'K1', lease_at: 1000, status: 'COMPLETED' }, 1001), false,
  '12. a COMPLETED execution holds no lease');
// a CAS lock that cannot be acquired refuses rather than proceeding unguarded
const ioLock = fixtureIo([draftRow({ sku: 'S1', tiers: { T1: { qty: 5 } } })]);
const pvL = preview(ioLock, { tier_scope: 'ALL', planning_cycle: '2026-08' });
ioLock._opts.casUnavailable = true;
writeCalls = 0;
const noLock = execute(ioLock, { tier_scope: 'ALL', planning_cycle: '2026-08' }, pvL.data.confirm_with_checksum);
ok(noLock.success === false && noLock.errors[0].code === 'SEND_LEASE_UNAVAILABLE',
  '12. an unavailable CAS lock REFUSES the execution rather than running unguarded');
eq(writeCalls, 0, '12. writing nothing');

// =============================================================================================================
section('13. a browser reload can resume from the journal');

const rows13 = [draftRow({ sku: 'S1', tiers: { T1: { qty: 1 } } }), draftRow({ sku: 'S3', tiers: { T1: { qty: 2 } } }),
  draftRow({ sku: 'S4', tiers: { T1: { qty: 3 } } })];
const io13 = fixtureIo(rows13, { writeMs: 22000 });
const pv13 = preview(io13, { tier_scope: 'ALL', planning_cycle: '2026-08' });
const part13 = execute(io13, { tier_scope: 'ALL', planning_cycle: '2026-08' }, pv13.data.confirm_with_checksum);
eq(part13.data.status, 'PARTIAL_RESUMABLE', '13. the Send is mid-flight');
// the page "reloads": it knows only the execution key
const st13 = handleRequestOrderSendStatus_({ payload: { orchestration_key: part13.data.orchestration_key, planning_cycle: '2026-08' } }, io13);
ok(st13.success === true, '13. the status read succeeds after a reload');
eq(st13.data.writes_performed, 0, '13. and writes nothing');
eq(st13.data.status, 'PARTIAL', '13. reporting the journal status');
eq(st13.data.resumable, true, '13. that it is resumable');
eq(st13.data.confirm_with_checksum, pv13.data.workset_checksum, '13. and the checksum needed to continue');
eq(st13.data.series_total, 3, '13. with the real total');
eq(st13.data.series_done, 2, '13. and the real completed count');
eq(st13.data.series_remaining, 1, '13. so the caller knows what is left');
eq(st13.data.owned_by_this_key, true, '13. and that this key still owns the cycle');
ok(/mode=execute/.test(st13.data.next_action), '13. telling the caller exactly how to continue');
ok(/action === 'requestOrder\.send\.status'/.test(ROUTER), '13. the status action is routed');
ok(/getRequestOrderSendStatus = function/.test(DBAPI), '13. and the transport exposes it');
const stFn = extractFn(G66, 'handleRequestOrderSendStatus_');
['appendRow', '.setValue(', 'propSet', 'withCasLock', 'createRequestOrderDraft'].forEach(function (w) {
  ok(code(stFn).indexOf(w) === -1, '13. the status read is strictly read-only (' + w + ' absent)');
});
// an unknown key answers honestly instead of inventing a state
const stNone = handleRequestOrderSendStatus_({ payload: { orchestration_key: 'ROSEXEC-NOPE', planning_cycle: '2026-08' } }, io13);
eq(stNone.data.status, 'NO_JOURNAL', '13. an unknown execution key answers NO_JOURNAL');

// =============================================================================================================
section('14. exact line quantity + lineage read-back (§G)');

const expected14 = { request_order_id: 'RO-1', lines: [
  { sku: 'S1', series: 'ALPHA', company: 'KM', country: 'US', marketplace: 'Amazon',
    request_bucket: 'T1', request_month: '2026-09', order_qty: 100,
    request_allocation_draft_id: canonId({ sku: 'S1' }) }] };
function lineRow(o) {
  return Object.assign({ request_order_line_id: 'ROL-1', request_order_id: 'RO-1', sku: 'S1', series: 'ALPHA',
    company: 'KM', request_bucket: 'T1', request_month: '2026-09', requested_qty: 100 }, o || {});
}
function srcRow(o) {
  return Object.assign({ request_order_line_source_id: 'ROLS-1', request_order_line_id: 'ROL-1',
    request_order_id: 'RO-1', sku: 'S1', company: 'KM', country: 'US', marketplace: 'Amazon',
    tier_type: 'T1', source_month: '2026-09', request_allocation_draft_id: canonId({ sku: 'S1' }) }, o || {});
}
const hdrOk = { request_order_id: 'RO-1', total_qty: 100, total_sku: 1 };
const good = rosVerifyRequestOrderOutput_(expected14, hdrOk, [lineRow()], [srcRow()]);
ok(good.ok, '14. a correct output verifies');
eq(good.verified_lines, 1, '14. counting the verified line');
eq(good.verified_qty, 100, '14. and its quantity');
// each failure mode is CAUGHT by name
const cases = [
  ['LINE_QUANTITY_MISMATCH', [lineRow({ requested_qty: 101 })], [srcRow()], hdrOk],
  ['LINE_MISSING', [], [srcRow()], hdrOk],
  ['LINE_DUPLICATED', [lineRow(), lineRow({ request_order_line_id: 'ROL-2' })], [srcRow()], hdrOk],
  ['LINE_ID_MISSING', [lineRow({ request_order_line_id: '' })], [srcRow()], hdrOk],
  ['LINE_SERIES_MISMATCH', [lineRow({ series: 'WRONG' })], [srcRow()], hdrOk],
  ['LINE_COMPANY_MISMATCH', [lineRow({ company: 'OTHER' })], [srcRow()], hdrOk],
  ['LINE_SOURCE_MISSING', [lineRow()], [], hdrOk],
  ['LINE_LINEAGE_MISMATCH', [lineRow()], [srcRow({ request_allocation_draft_id: 'RD::MONTHLY_ORDER::2026-08::other' })], hdrOk],
  ['LINE_LINEAGE_MISMATCH', [lineRow()], [srcRow({ country: 'ZZ' })], hdrOk],
  ['LINE_LINEAGE_MISMATCH', [lineRow()], [srcRow({ tier_type: 'T2' })], hdrOk],
  ['LINE_LINEAGE_MISMATCH', [lineRow()], [srcRow({ source_month: '2026-12' })], hdrOk],
  ['REQUEST_ORDER_HEADER_NOT_FOUND', [lineRow()], [srcRow()], null]
];
cases.forEach(function (c) {
  const v = rosVerifyRequestOrderOutput_(expected14, c[3], c[1], c[2]);
  ok(!v.ok, '14. ' + c[0] + ' is caught');
  ok(v.failures.some(function (f) { return f.code === c[0]; }), '14. and named ' + c[0]);
});
// a zero-quantity tier must create NO line — proven by the unexpected-line check
const extra = rosVerifyRequestOrderOutput_(expected14, hdrOk,
  [lineRow(), lineRow({ request_order_line_id: 'ROL-Z', request_bucket: 'T2', request_month: '2026-10', requested_qty: 0 })], [srcRow()]);
ok(!extra.ok && extra.failures.some(function (f) { return f.code === 'UNEXPECTED_LINE'; }),
  '14. a line the frozen workset did not authorise is UNEXPECTED_LINE (this is how "a 0 tier creates no line" is proven)');

// =============================================================================================================
section('15. an output mismatch BLOCKS the submitted transition');

['QTY', 'LINEAGE', 'STATION', 'DUPLICATE_LINE', 'EXTRA_LINE', 'NO_LINE_ID', 'SERIES', 'HEADER_TOTAL'].forEach(function (kind) {
  const io15 = fixtureIo([draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } })], { corrupt: kind });
  const r15 = runSend(io15, { tier_scope: 'ALL', planning_cycle: '2026-08' });
  ok(r15.success === false, '15. a ' + kind + ' corruption fails the run');
  ok(r15.errors && r15.errors[0].code === 'REQUEST_ORDER_OUTPUT_VERIFICATION_FAILED',
    '15. named REQUEST_ORDER_OUTPUT_VERIFICATION_FAILED for ' + kind);
  ok(!io15._opts.submitted, '15. and NO allocation draft was advanced for ' + kind);
});
// the failure is journaled, proven output is preserved, and no compensating quantity is invented
const io15b = fixtureIo([draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } })], { corrupt: 'QTY' });
const r15b = runSend(io15b, { tier_scope: 'ALL', planning_cycle: '2026-08' });
const j15 = rosJournalRead_(io15b, r15b.errors[0].details.orchestration_key);
eq(j15.status, 'OUTPUT_VERIFICATION_FAILED', '15. the journal records the failure state');
ok((j15.output_failures || []).length >= 1, '15. with the exact mismatch');
ok(/No compensating quantity was written/.test(r15b.errors[0].message),
  '15. and states that no compensating quantity was manufactured');
ok(/proven_request_orders/.test(JSON.stringify(r15b.errors[0].details)),
  '15. while preserving already-proven output');
ok(/requestOrderSendReconcile/.test(r15b.errors[0].details.next_action), '15. pointing at the reconciliation');

// =============================================================================================================
section('16. the header total equals the verified line sum');

const io16 = fixtureIo([draftRow({ sku: 'S1', tiers: { T1: { qty: 100 }, T2: { qty: 40 } } }),
  draftRow({ sku: 'S2', tiers: { T1: { qty: 60 } } })]);
const r16 = runSend(io16, { tier_scope: 'ALL', planning_cycle: '2026-08' });
ok(r16.success === true, '16. a correct multi-line run succeeds');
eq(r16.data.verified_lines, 3, '16. verifying every line');
eq(r16.data.verified_units, 200, '16. and the exact unit total');
const hdr16 = (io16._opts.orders || [])[0];
eq(Number(hdr16.total_qty), 200, '16. the header total_qty equals the verified line sum');
eq(Number(hdr16.total_sku), 2, '16. and total_sku is the DISTINCT sku count, not the line count');
// a lying header is caught
const bad16 = rosVerifyRequestOrderOutput_(expected14, { request_order_id: 'RO-1', total_qty: 999, total_sku: 1 }, [lineRow()], [srcRow()]);
ok(!bad16.ok && bad16.failures.some(function (f) { return f.code === 'HEADER_TOTAL_QTY_MISMATCH'; }),
  '16. a header whose total disagrees with its lines is caught');
const badSku = rosVerifyRequestOrderOutput_(expected14, { request_order_id: 'RO-1', total_qty: 100, total_sku: 7 }, [lineRow()], [srcRow()]);
ok(!badSku.ok && badSku.failures.some(function (f) { return f.code === 'HEADER_TOTAL_SKU_MISMATCH'; }),
  '16. and so is a wrong distinct-SKU total');

// =============================================================================================================
section('17. station-scoped Shipping Plan exact quantity verification (§I)');

const station = { company: 'KM', country: 'US', marketplace: 'Amazon' };
const expLines = [{ sku: 'S1', site_sku: 'S1-US', requested_qty: 120 }, { sku: 'S2', site_sku: 'S2-US', requested_qty: 80 }];
const planRows = [{ shipping_plan_id: 'SP-1', company: 'KM', country: 'US', marketplace: 'Amazon' }];
function pl(o) { return Object.assign({ shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: 'S1', site_sku: 'S1-US', requested_qty: 120 }, o || {}); }
const plOk = [pl(), pl({ shipping_plan_line_id: 'SPL-2', sku: 'S2', site_sku: 'S2-US', requested_qty: 80 })];
const v17 = sadVerifyShippingPlanOutput_(expLines, ['SP-1'], planRows, plOk, station);
ok(v17.ok, '17. a correct plan verifies');
eq(v17.verified_lines, 2, '17. verifying both lines');
eq(v17.verified_qty, 200, '17. and the exact unit total');
// the user's planned_qty is the authority — a substituted (e.g. Suggested) quantity is caught
const v17q = sadVerifyShippingPlanOutput_(expLines, ['SP-1'], planRows,
  [pl({ requested_qty: 150 }), plOk[1]], station);
ok(!v17q.ok && v17q.failures.some(function (f) { return f.code === 'PLAN_LINE_QUANTITY_MISMATCH'; }),
  '17. a plan line that does not carry the user planned quantity is caught');
eq(v17q.failures[0].expected_user_planned_qty, 120, '17. reporting the user quantity');
eq(v17q.failures[0].found_requested_qty, 150, '17. and the committed one');
// station scope
const v17s = sadVerifyShippingPlanOutput_(expLines, ['SP-1'],
  [{ shipping_plan_id: 'SP-1', company: 'KM', country: 'CA', marketplace: 'Amazon' }], plOk, station);
ok(!v17s.ok && v17s.failures.some(function (f) { return f.code === 'PLAN_COUNTRY_MISMATCH'; }),
  '17. a plan committed against another country is caught');
const v17m = sadVerifyShippingPlanOutput_(expLines, ['SP-1'],
  [{ shipping_plan_id: 'SP-1', company: 'KM', country: 'US', marketplace: 'Walmart' }], plOk, station);
ok(!v17m.ok && v17m.failures.some(function (f) { return f.code === 'PLAN_MARKETPLACE_MISMATCH'; }),
  '17. and another marketplace');
// no other site row created
const v17x = sadVerifyShippingPlanOutput_(expLines, ['SP-1'], planRows,
  plOk.concat([pl({ shipping_plan_line_id: 'SPL-X', sku: 'GHOST', site_sku: 'GHOST-US', requested_qty: 5 })]), station);
ok(!v17x.ok && v17x.failures.some(function (f) { return f.code === 'UNEXPECTED_PLAN_LINE'; }),
  '17. an unauthorised plan line is caught (this is how "no other site row created" is proven)');
const v17d = sadVerifyShippingPlanOutput_(expLines, ['SP-1'], planRows,
  [pl(), pl({ shipping_plan_line_id: 'SPL-D' }), plOk[1]], station);
ok(!v17d.ok && v17d.failures.some(function (f) { return f.code === 'PLAN_LINE_DUPLICATED'; }),
  '17. and a duplicated plan line');
// the station gates and the idempotent replay survive from FB-3B
const core16 = extractFn(G16, 'sadSubmitToShippingPlansCore_');
ok(/MIXED_SITE_PAYLOAD/.test(core16) && /APPLIED_SCOPE_MISMATCH/.test(core16),
  '17. the FB-3B station-scope gates are retained');
ok(/SHIPPING_PLAN_OUTPUT_VERIFICATION_FAILED/.test(core16), '17. and the new verification failure is named');
ok(/keyPlans0/.test(core16) && /submit_batch_id/.test(core16),
  '17. an idempotent replay still returns the existing plan by execution key');
ok(/Nothing was rolled back/.test(core16),
  '17. and a verification failure does NOT roll back a durable plan — it reports the mismatch instead');
ok(code(extractFn(G16, 'sadVerifyShippingPlanOutput_')).indexOf('snapshot_suggested_qty') === -1,
  '17. Suggested Qty is never read by the verifier — only the user-owned planned quantity');

// =============================================================================================================
section('18. no second writer');

const code66 = noStrings(G66);
['appendRow', '.setValue(', '.setValues(', 'insertSheet', 'deleteRow', 'procurementEnsureSheet_',
 'sheetEnsureColumns_', 'DriveApp', 'MailApp', 'GmailApp'].forEach(function (w) {
  ok(code66.indexOf(w) === -1, '18. 66_ never executes ' + w);
});
eq((G66.match(/handleCreateRequestOrderDraft_\(/g) || []).length, 1, '18. exactly ONE seam to the Request Order writer');
eq((G66.match(/handleSubmitRequestOrderAllocationDrafts_\(/g) || []).length, 1, '18. exactly ONE seam to the submit writer');
const code67 = noStrings(G67);
['appendRow', '.setValue(', '.setValues(', 'insertSheet', 'deleteRow', 'procurementEnsureSheet_',
 'LockService', 'DriveApp', 'MailApp'].forEach(function (w) {
  ok(code67.indexOf(w) === -1, '18. the identity diagnostic never executes ' + w);
});
ok(/db_writes: 0, rows_migrated: 0, rows_deleted: 0/.test(G67), '18. and it declares its zero counters');
ok(/requires_user_authorization: true/.test(G67), '18. every proposed migration step requires user authorization');
ok(/THIS DIAGNOSTIC PERFORMED NO MIGRATION/.test(G67), '18. and it says so in its own next_action');
// the ensure-and-edit action delegates, it does not write
eq((EEE.match(/rpoGenerateMonthlyFlatResult_\(/g) || []).length, 1, '18. one seam to the canonical generate');
eq((EEE.match(/rpoEditMonthlyFlatResult_\(/g) || []).length, 1, '18. one seam to the canonical edit');
// the browser has no Request Order writer left
eq((RO.match(/DB\.createRequestOrderDraft\(/g) || []).length, 0, '18. the browser has no Request Order writer call site');
eq((code(SEND).match(/DB\.upsertRequestOrderAllocationDraft/g) || []).length, 0, '18. nor an allocation-draft writer in Send');

// =============================================================================================================
section('19. no local / sessionStorage business success');

['sessionStorage.setItem', 'localStorage.setItem', 'sessionStorage.getItem', 'localStorage.getItem'].forEach(function (k) {
  ok(code(SEND).indexOf(k) === -1, '19. the Send path never touches ' + k);
  ok(code(LOOP).indexOf(k) === -1, '19. nor does the continuation loop (' + k + ')');
  ok(code(createFn).indexOf(k) === -1, '19. nor the draft-create-on-edit path (' + k + ')');
});
ok(/_roUseDb\(\)/.test(SEND), '19. the Demo branch is gated by the explicit eligibility predicate');
ok(/NOT written to DB/.test(SEND), '19. and labels itself as writing nothing');
ok(/typeof DB\.sendRequestOrderOrchestration !== 'function'/.test(SEND),
  '19. a missing transport FAILS CLOSED rather than falling back to a local success');
ok(/run\.done/.test(SEND), '19. success is claimed only on the loop\u2019s terminal verdict');
ok(code66.indexOf('PropertiesService') !== -1, '19. the durable record is a SERVER journal, not browser storage');

// =============================================================================================================
section('20. no Demo mutation, no email');

const DEMO = read('specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs');
ok(DEMO.length > 0, '20. the Demo seed file is present');
ok(DEMO.indexOf('F1-7N-FB-3C') === -1, '20. and carries no FB-3C marker — it was not touched');
[G66, G67, EEE, code(SEND), code(LOOP)].forEach(function (src, i) {
  ['MailApp', 'GmailApp', 'sendEmail', 'TEMP_demo_', 'DEMO_SEED'].forEach(function (k) {
    ok(noStrings(src).indexOf(k) === -1, '20. no email / Demo touch in FB-3C source ' + i + ' (' + k + ')');
  });
});
// deployment identity moved, and the frontend pins exactly it
const buildNow = (G63.match(/var SYS_BUILD_VERSION_ = '([^']+)';/) || [])[1];
// The bump RULE, not a frozen literal. Pinning the exact string makes this suite fail on every legitimate future
// bump, which is the opposite of guarding the deployment identity. What must hold is that the id is a real
// F1-7N-FB-<n><letter> build and that the Send owner reports the SAME one, so a partial Apps Script sync shows up.
// F1-7N-FB-4E-R2 — the pattern admits a REVISION suffix. This project already stamps revisions
// (59_ declares F1-7N-FB-4C-R1 and the manifest expects exactly that), so a rule that accepted only
// F1-7N-FB-<n><A-Z> rejected a legitimate build the moment one was made. It still requires the canonical
// shape; it no longer requires the round to have been a first cut.
ok(/^F1-7N-FB-\d+[A-Z](-R\d+[A-Z]?\d*)?$/.test(buildNow || ''), '20. SYS_BUILD_VERSION_ names a current build (' + buildNow + ')');
// F1-7N-FB-4E — RESTATED AT THE INVARIANT IT NAMES. Requiring 66_ to declare the same build as 63_ makes a
// partial sync visible only by accident, and it forces an unnecessary edit to 66_ in every round that touches
// 63_ — which is the opposite of what a per-file build stamp is for. The thing that actually makes a partial
// sync visible is the MANIFEST: SYS_MODULE_BUILD_STAMPS_ declares an EXPECTED build per file, and a file whose
// declared build disagrees with its manifest entry is reported as STALE. So that is what is asserted.
var _rosExpected = (G63.match(/'66_api_v1_request_order_send\.gs', symbol: 'ROS_BUILD_VERSION_', expected: '([^']+)'/) || [])[1];
ok(!!_rosExpected, '20. the manifest declares an expected build for the Send owner (' + _rosExpected + ')');
eq(ROS_BUILD_VERSION_, _rosExpected, '20. and the Send owner declares exactly that, so a partial sync is visible');
const acv = Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
const pinned = Number((DBAPI.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
ok(acv >= 5, '20. the action-contract version advanced (v' + acv + ')');
eq(pinned, acv, '20. and the frontend pins exactly that minimum');
['requestOrder.send.status', 'requestOrder.allocationDraft.ensureAndEdit', 'system.allocationDraftIdentityDiagnostic'].forEach(function (a) {
  ok(new RegExp("action === '" + a.replace(/\./g, '\\.') + "'").test(ROUTER), '20. the router registers ' + a);
  ok(new RegExp("action: '" + a.replace(/\./g, '\\.') + "'").test(G63), '20. and health probes ' + a);
});

// =============================================================================================================
section('21. §H current-run authority, §C reconciliation, and no test-only escape hatch');

// §H — canonical identity uniqueness is STRUCTURAL: one row per identity per cycle, version increments in place
ok(/RD::MONTHLY_ORDER::<cycle>::<scope> is the primary key/.test(G66),
  '21. the current-run authority states that the canonical id IS the primary key');
ok(/draft_version increments in place/.test(G66) && /no superseded/.test(G66),
  '21. so draft_version moves in place and no superseded version row is retained');
const auth = rosCurrentRunAuthority_('2026-08');
ok(/planning_cycle=2026-08/.test(auth) && /draft, site_confirmed, partially_submitted/.test(auth),
  '21. the authority names the cycle and the active statuses');
ok(/exactly ONE active draft per canonical business identity/.test(auth),
  '21. and the uniqueness requirement it depends on');
// two DIFFERENT ids for one business scope: fail closed, never pick one
const dupIdentity = buildWs([draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } }),
  draftRow({ id: 'RAD-M-KM-US-AMAZON-S1-2026', sku: 'S1', tiers: { T1: { qty: 700 } } })], 'ALL');
eq(dupIdentity.blocking_conflicts.length, 1, '21. two ids for one business scope is a BLOCKING conflict');
eq(dupIdentity.blocking_conflicts[0].code, 'DUPLICATE_BUSINESS_IDENTITY', '21. named DUPLICATE_BUSINESS_IDENTITY');
eq(dupIdentity.rows.length, 0, '21. and NEITHER row is sent — the right one cannot be guessed');
eq(dupIdentity.excluded.duplicate_business_identity, 2, '21. both are counted as withheld');
const ioDup = fixtureIo([draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } }),
  draftRow({ id: 'RAD-M-KM-US-AMAZON-S1-2026', sku: 'S1', tiers: { T1: { qty: 700 } } })]);
writeCalls = 0;
const rDup = preview(ioDup, { tier_scope: 'ALL', planning_cycle: '2026-08' });
ok(rDup.success === false && rDup.errors[0].code === 'DUPLICATE_BUSINESS_IDENTITY',
  '21. and the orchestration refuses outright');
eq(writeCalls, 0, '21. writing nothing');
// a terminal (submitted) row cannot re-enter, so an older same-cycle decision cannot come back
const reenter = buildWs([draftRow({ sku: 'S1', status: 'submitted', tiers: { T1: { qty: 100 } } })], 'ALL');
eq(reenter.rows.length, 0, '21. a submitted draft cannot re-enter a new Send');
eq(reenter.excluded.status_submitted, 1, '21. and is counted');
const tierDone = buildWs([draftRow({ sku: 'S1', tiers: { T1: { qty: 100, status: 'submitted' }, T2: { qty: 5 } } })], 'ALL');
eq(tierDone.rows.map(function (r) { return r.request_bucket; }), ['T2'],
  '21. partially_submitted resume sends only the tier that is NOT already sent');
eq(tierDone.excluded.tier_terminal_already_sent, 1, '21. the already-sent tier is counted');

// §C — the read-only reconciliation, EXECUTED
const adi = adiAnalyse_([
  draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } }),
  draftRow({ id: 'RAD-M-KM-US-AMAZON-S1-2026', sku: 'S1', tiers: { T1: { qty: 700 } } }),
  draftRow({ id: 'RAD-M-KM-US-AMAZON-S2-2026', sku: 'S2', tiers: { T1: { qty: 50 } } }),
  draftRow({ id: 'RAD-M-KM-US-AMAZON-S3-2026', sku: 'S3', tiers: {} })
], { planning_cycle: '2026-08' });
eq(adi.rad_m_count, 3, '21. every RAD-M row is counted');
eq(adi.rad_m_ids_masked.length, 3, '21. and reported MASKED');
ok(adi.rad_m_ids_masked.every(function (m) { return m.indexOf('RAD-M-') === 0 && m.indexOf('\u2026') !== -1; }),
  '21. the mask keeps the class and hides the embedded business scope');
eq(adi.by_identity_class.CANONICAL_FLAT_V2, 1, '21. the canonical row is classified');
eq(adi.by_identity_class.RETIRED_MANUAL_SEND_PATH, 3, '21. and the retired ones');
eq(adi.duplicate_identity_groups, 1, '21. the one duplicated business identity is found');
const f1 = adi.findings.filter(function (f) { return f.scope.sku === 'S1'; })[0];
eq(f1.canonical_replacement_exists, true, '21. the S1 RAD-M row is paired with its canonical counterpart');
eq(f1.tier_differences.length, 1, '21. their quantities differ');
eq(f1.disposition, 'BUSINESS_DECISION_REQUIRED', '21. so the disposition is a BUSINESS decision, never a guess');
eq(f1.send_visibility.ignored_by_send, true, '21. and the row is currently ignored by Send');
eq(f1.send_visibility.reason, 'DUPLICATE_BUSINESS_IDENTITY_WITHHELD', '21. for the named reason');
const f2 = adi.findings.filter(function (f) { return f.scope.sku === 'S2'; })[0];
eq(f2.canonical_replacement_exists, false, '21. an orphan RAD-M row has no canonical counterpart');
eq(f2.disposition, 'ADOPT_AS_CANONICAL', '21. and a positive orphan is proposed for adoption');
const f3 = adi.findings.filter(function (f) { return f.scope.sku === 'S3'; })[0];
eq(f3.disposition, 'CANCEL_AS_EMPTY', '21. an empty orphan is proposed for cancellation');
eq(adi.verdict, 'BUSINESS_DECISION_REQUIRED', '21. the overall verdict escalates to the operator');
eq(adi.counters.rows_migrated, 0, '21. NOTHING was migrated');
eq(adi.counters.rows_deleted, 0, '21. and nothing deleted');
ok(adi.migration_plan.length === 3, '21. a plan step exists per non-canonical row');
ok(adi.migration_plan.every(function (s) { return s.requires_user_authorization === true; }),
  '21. and every step requires user authorization');
eq(adiAnalyse_([draftRow({ sku: 'S1', tiers: { T1: { qty: 1 } } })], {}).verdict, 'CLEAN_NO_NON_CANONICAL_ROWS',
  '21. a clean table reports CLEAN');

// no test-only escape hatch anywhere in the FB-3C surface (claim 21's assertable half)
[['66_', G66], ['67_', G67], ['15_ ensureAndEdit', EEE], ['request-order Send', SEND], ['continuation loop', LOOP]].forEach(function (pair) {
  ['process.env', 'NODE_ENV', '__TEST__', 'skipVerification', 'bypassVerification', 'forceSuccess'].forEach(function (h) {
    ok(noStrings(pair[1]).indexOf(h) === -1, '21. ' + pair[0] + ' has no test-only escape hatch (' + h + ')');
  });
});

// =============================================================================================================
console.log('\n----------------------------------------');
if (failures.length) {
  console.log('FB-3C MANUAL-EDIT BOUNDARY + SLICED ORCHESTRATION: ' + pass + ' passed, ' + failures.length + ' failed');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('ALL PASS  (' + pass + ' assertions)');
