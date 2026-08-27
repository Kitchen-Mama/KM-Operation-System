// =============================================================================================================
// F1-7N-FB-3B — Send Request server orchestration, frozen scope authority, station scope.
// -------------------------------------------------------------------------------------------------------------
// WHAT THIS SUITE IS FOR. FB-3A closed observability and explicitly left §G (the server orchestration)
// unimplemented, so the browser still owned a business transaction that a display filter could truncate and a
// closed tab could abandon. FB-3B implements it. This suite proves the seventeen §I claims by EXECUTING the
// shipped functions — the real workset builder, the real quantity barrier, the real Series grouper, the real
// orchestration handler against an injected io — never a mirrored copy of them.
//
// Where a claim can only be established structurally (a control that must not be consulted, a writer that must
// not exist), the assertion runs against the source with COMMENTS STRIPPED, so it can never be satisfied by
// prose that merely describes the guarantee.
// =============================================================================================================
// NOTE: deliberately NOT strict mode. This suite EXECUTES the shipped functions via eval(); in strict mode
// an eval-scoped function declaration would not reach this module scope, so the suite could only inspect text.
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
// Strip block comments, line comments and (optionally) string literals, so an "absence" assertion tests CODE.
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
// Bracket-matched, so it works whether the array literal closes on its own line or inline.
function extractVar(src, decl) {
  let i = src.indexOf(decl);
  if (i < 0) throw new Error('var not found: ' + decl);
  const start = i;
  let depth = 0, seen = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[' || ch === '{') { depth++; seen = true; }
    else if (ch === ']' || ch === '}') { depth--; if (seen && depth === 0) return src.slice(start, i + 2); }
  }
  throw new Error('unbalanced var: ' + decl);
}
function slice(src, a, b) { const i = src.indexOf(a); const j = src.indexOf(b, i + 1); return src.slice(i, j); }

const G66 = read('specs/active/apps-script/66_api_v1_request_order_send.gs');
const G16 = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
const G13 = read('specs/active/apps-script/13_procurement_handlers.gs');
const G39 = read('specs/active/apps-script/39_document_runtime_service.gs');
const G56 = read('specs/active/apps-script/56_api_v1_ai_plan_first_layer.gs');
const G63 = read('specs/active/apps-script/63_api_v1_system_health.gs');
const ROUTER = read('specs/active/apps-script/01_router.gs');
const RO = read('js/pages/request-order.js');
const IR = read('js/pages/inventory-replenishment.js');
const DBAPI = read('js/api/operation-system-db-api.js');
const PO = read('js/pages/purchase-order-overview.js');

// The Send handler body, isolated once and reused.
const SEND = RO.slice(RO.indexOf('async function handleSendRequest()'), RO.indexOf('function _roSendPlanningCycle_'));

// ---- load the REAL pure core of 66_ (marker-delimited) + the helpers the handler needs -----------------------
// the module constants block (declarations + comments only) and then the marker-delimited pure core
eval(slice(G66, 'var ROS_BUILD_VERSION_ =', '// __ROS_PURE_START__'));
eval(slice(G66, '// __ROS_PURE_START__', '// __ROS_PURE_END__'));
eval(extractFn(G66, 'rosBuildEnvelope_'));
eval(extractFn(G66, 'rosSeriesIndex_'));
eval(extractFn(G66, 'rosUnwrap_'));
// F1-7N-FB-3C §E: the journal became a chunked Script-Property store and ownership became an atomic
// compare-and-set, so the orchestration now depends on these impure helpers too.
eval(extractFn(G66, 'rosJournalWrite_'));
eval(extractFn(G66, 'rosJournalRead_'));
eval(extractFn(G66, 'rosOwnershipTransact_'));
eval(extractFn(G66, 'rosOwnershipRelease_'));
eval(extractFn(G66, 'rosCountsOf_'));
eval(extractVar(G66, 'var ROS_SLIM_DRAFT_PROJECTION_ = ['));
eval(extractVar(G66, 'var ROS_SLIM_FORBIDDEN_INCLUDES_ = ['));
eval(extractFn(G66, 'rosResolveIncludes_'));
eval(extractFn(G66, 'rosProjectSlimDraft_'));
eval(extractFn(G66, 'rosCurrentRunAuthority_'));
eval(extractFn(G66, 'handleRequestOrderSendWorksetGet_'));
eval(extractFn(G66, 'handleRequestOrderSendOrchestrate_'));

// ---- a flat-V2 draft row factory matching the LIVE 53-column schema ------------------------------------------
function draftRow(o) {
  o = o || {};
  const r = {
    request_allocation_draft_id: o.id || 'RD::MONTHLY_ORDER::2026-08::company=KM|country=US|draft_purpose=regular|marketplace=Amazon|sku=' + (o.sku || 'S1'),
    planning_cycle: o.cycle === undefined ? '2026-08' : o.cycle,
    company: o.company === undefined ? 'KM' : o.company,
    country: o.country === undefined ? 'US' : o.country,
    marketplace: o.marketplace === undefined ? 'Amazon' : o.marketplace,
    sku: o.sku || 'S1',
    status: o.status === undefined ? 'site_confirmed' : o.status,
    draft_version: 1, units_per_carton: o.upc === undefined ? 12 : o.upc, updated_at: '2026-08-20 10:00'
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
  { sku: 'S4', series: '', units_per_carton: 6 }
];
const IDX = rosSeriesIndex_(SKU_DETAILS);
function buildWs(rows, scope, cycle) {
  return rosBuildWorkset_(rows, { planning_cycle: cycle || '2026-08', tier_scope: scope || 'ALL',
    series_by_sku: IDX.series, units_per_carton_by_sku: IDX.upc });
}

// =============================================================================================================
section('1. Country / Marketplace and EVERY display filter never truncate Send Request');

// STRUCTURAL: the workset builder accepts no site or display parameter at all. Absence beats a disabled flag.
const wsFn = extractFn(G66, 'rosBuildWorkset_');
const wsCode = noStrings(wsFn);
['country', 'marketplace', 'category', 'risk', 'sku_search', 'showMode', 'show_mode', 'page', 'pagination',
 'visible', 'expanded'].forEach(function (k) {
  // opts.<k> would be the only way a caller could pass one in
  ok(wsCode.indexOf('opts.' + k) === -1, '1. the workset builder never reads opts.' + k);
});
ok(/opts\.planning_cycle/.test(wsCode) && /opts\.tier_scope/.test(wsCode),
  '1. its ONLY business inputs are planning_cycle and tier_scope');

// EXECUTED: four drafts across four DIFFERENT country/marketplace stations all survive one ALL Send.
const multiStation = [
  draftRow({ sku: 'S1', country: 'US', marketplace: 'Amazon', tiers: { T1: { qty: 100 } } }),
  draftRow({ sku: 'S2', country: 'CA', marketplace: 'Amazon', tiers: { T1: { qty: 200 } } }),
  draftRow({ sku: 'S3', country: 'DE', marketplace: 'Amazon', tiers: { T2: { qty: 300 } } }),
  draftRow({ sku: 'S4', country: 'JP', marketplace: 'Rakuten', tiers: { T3: { qty: 400 } } })
];
const wsAll = buildWs(multiStation, 'ALL');
eq(wsAll.drafts_with_positive_selected_tier, 4, '1. all four STATIONS are in one ALL Send (nothing scoped away)');
eq(wsAll.positive_selected_tier_allocations, 4, '1. and all four tier allocations survive');
eq(wsAll.total_units, 1000, '1. with the full unit total');
eq(wsAll.excluded.wrong_planning_cycle, 0, '1. and no station was excluded for its site');

// STRUCTURAL, client side: the Send row universe is the UNFILTERED page data.
const scopeRowsFn = extractFn(RO, '_roSendScopeRows_');
ok(/requestOrderState\.data \|\| \[\]/.test(scopeRowsFn), '1. the page Send universe is requestOrderState.data, unfiltered');
['_applyRequestOrderFilters', 'categoryTab', 'showMode', 'filters.risk', 'filters.sku', 'filters.country',
 'filters.marketplace'].forEach(function (k) {
  ok(code(scopeRowsFn).indexOf(k) === -1, '1. and never consults ' + k);
});
ok(code(SEND).indexOf('_applyRequestOrderFilters') === -1,
  '1. handleSendRequest itself no longer calls the DISPLAY filter authority at all');
ok(/removed_by_display_filters: 0,/.test(SEND), '1. display-filter removal is 0 BY CONSTRUCTION, and is reported');

// =============================================================================================================
section('2. ALL / T1 / T2 / T3 are the ONLY Send scope controls');

eq(rosNormalizeTierScope_('all'), 'ALL', '2. ALL normalizes');
['T1', 't2', 'T3'].forEach(function (v) { ok(!!rosNormalizeTierScope_(v), '2. ' + v + ' normalizes'); });
['US', 'Amazon', 'ALPHA', 'T4', '', null, undefined, 'ALL,T1', 'country'].forEach(function (v) {
  eq(rosNormalizeTierScope_(v), null, '2. a non-tier value is REFUSED as a scope: ' + JSON.stringify(v));
});
eq(rosTiersForScope_('T2'), ['T2'], '2. T2 selects exactly one tier');
eq(rosTiersForScope_('ALL'), ['T1', 'T2', 'T3'], '2. ALL selects all three');

// the frozen DISPLAY_ONLY list is declared as a contract, and the orchestration reports it
eq(ROS_DISPLAY_ONLY_CONTROLS_.slice().sort(),
  ['category', 'country', 'expanded_state', 'marketplace', 'pagination', 'risk', 'show_mode', 'sku_search', 'visible_page'],
  '2. the DISPLAY_ONLY control list is declared and complete');
const orch = extractFn(G66, 'handleRequestOrderSendOrchestrate_');
ok(/INVALID_TIER_SCOPE/.test(orch) && /display_only_controls/.test(orch),
  '2. an invalid scope is refused BY NAME and the refusal lists the display-only controls');
// EXECUTED: a T2 Send excludes the T1/T3 cells and COUNTS them
const wsT2 = buildWs(multiStation, 'T2');
eq(wsT2.positive_selected_tier_allocations, 1, '2. a T2 Send sends only T2 allocations');
eq(wsT2.excluded.tier_out_of_scope, 8, '2. and the out-of-scope tier cells are COUNTED, not silently dropped');
// but a T2 Send still spans every station
eq(buildWs([
  draftRow({ sku: 'S1', country: 'US', tiers: { T2: { qty: 5 } } }),
  draftRow({ sku: 'S3', country: 'DE', tiers: { T2: { qty: 7 } } })
], 'T2').distinct_skus, 2, '2. a tier-scoped Send is still comprehensive ACROSS stations');

// =============================================================================================================
section('3. a raw AI Plan row cannot be sent without a persisted draft identity');

const noId = draftRow({ sku: 'S1', tiers: { T1: { qty: 10 } } });
noId.request_allocation_draft_id = '';
const wsNoId = buildWs([noId], 'ALL');
eq(wsNoId.rows.length, 0, '3. a row with no persisted draft id produces NO sendable line');
eq(wsNoId.excluded.draft_id_missing, 1, '3. and is counted as draft_id_missing');
// duplicate identity is refused, not merged
const dupA = draftRow({ sku: 'S1', tiers: { T1: { qty: 10 } } });
const dupB = draftRow({ sku: 'S1', tiers: { T1: { qty: 99 } } });
const wsDup = buildWs([dupA, dupB], 'ALL');
eq(wsDup.excluded.duplicate_draft_id, 1, '3. a duplicated draft identity is refused and counted');
eq(wsDup.rows.length, 1, '3. and never doubles the workset');
// an intent naming a SKU with no persisted draft is a BLOCKING failure, by its own code
const vNoDraft = rosVerifyQuantities_(buildWs([], 'ALL'), [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'S9', tiers: { T1: { order_qty: 50 } } }]);
ok(vNoDraft.blocked, '3. an intent with no persisted draft BLOCKS the Send');
eq(vNoDraft.failures[0].code, 'UNSAVED_NO_PERSISTED_DRAFT', '3. named UNSAVED_NO_PERSISTED_DRAFT');
// the orchestration writes no allocation draft, so it cannot create-then-send
ok(code(orch).indexOf('upsertRequestOrderAllocationDraft') === -1,
  '3. the orchestration never creates or confirms an allocation draft (no create-then-send in one transition)');
ok(code(SEND).indexOf('_roManualDraftId_') === -1, '3. and the client Send no longer mints a manual draft id');
ok(/RETIRED FROM THE SEND TRANSITION/.test(RO), '3. the retired path is documented rather than silently deleted');

// =============================================================================================================
section('4. the latest user-edited DB quantity overrides the recommendation quantity');

const edited = draftRow({ sku: 'S1', tiers: { T1: { qty: 800, rec: 1000, userEdited: true } } });
const wsEdit = buildWs([edited], 'ALL');
eq(wsEdit.rows[0].order_qty, 800, '4. the workset carries the PERSISTED order_qty (800), not the recommendation');
eq(wsEdit.rows[0].recommended_qty, 1000, '4. the recommendation snapshot is carried separately, never merged');
eq(wsEdit.rows[0].user_edited, true, '4. and the user-edit provenance is preserved');
eq(wsEdit.total_units, 800, '4. the unit total uses the user-edited quantity');
// a recommendation with NO order_qty is not an order commitment
const recOnly = draftRow({ sku: 'S1', tiers: { T1: { rec: 1000 } } });
eq(buildWs([recOnly], 'ALL').rows.length, 0, '4. a recommendation with no order_qty is NOT sendable');
eq(buildWs([recOnly], 'ALL').excluded.tier_zero_or_blank_qty, 1, '4. and is counted as zero/blank');
// blank vs zero are different facts
eq(rosQty_(''), null, '4. a BLANK quantity is null (absent), never 0');
eq(rosQty_(0), 0, '4. and a real 0 is 0');
// the page asserts the same authority it always did
ok(/const eff = _roSendOrderQty_\(item, idx, b, e\)/.test(SEND),
  '4. the page still derives its asserted quantity from the unchanged _roSendOrderQty_ authority');

// =============================================================================================================
section('5. a dirty / read-back failure blocks the WHOLE Send');

const wsFive = buildWs([
  draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } }),
  draftRow({ sku: 'S2', tiers: { T1: { qty: 200 } } }),
  draftRow({ sku: 'S3', tiers: { T1: { qty: 300 } } })
], 'ALL');
eq(wsFive.rows.length, 3, '5. three sendable allocations to begin with');
const drift = rosVerifyQuantities_(wsFive, [
  { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'S1', tiers: { T1: { order_qty: 100 } } },
  { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'S2', tiers: { T1: { order_qty: 250 } } }   // drifted
]);
ok(drift.blocked, '5. a single drifted quantity blocks');
eq(drift.failures.length, 1, '5. and the drift is reported precisely');
eq(drift.failures[0].code, 'QUANTITY_DRIFT', '5. named QUANTITY_DRIFT');
eq(drift.failures[0].intended_qty, 250, '5. carrying the value the user sees');
eq(drift.failures[0].persisted_qty, 200, '5. and the value the database holds — the DB value is never substituted');
// a persisted row with NO assertion is legitimate (AI defaults the user never touched)
const clean = rosVerifyQuantities_(wsFive, [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'S1', tiers: { T1: { order_qty: 100 } } }]);
ok(!clean.blocked, '5. a persisted row with no asserted quantity is NOT a failure');
eq(clean.workset_rows_without_intent, 2, '5. and unasserted rows are counted so the dialog can show them');
// the orchestration blocks the ENTIRE run before any writer is reached
const iVerify = orch.indexOf('QUANTITY_VERIFICATION_FAILED'), iWrite = orch.indexOf('io.createRequestOrderDraft');
ok(iVerify > -1 && iWrite > iVerify, '5. the barrier precedes the first Request Order write');
ok(/The ENTIRE Send was blocked/.test(orch), '5. and the whole run is blocked, not the offending row');
// the page refuses to send over an edit that failed to flush
ok(/if \(flush\.failed\) \{/.test(SEND) && /Nothing was sent and nothing was written/.test(SEND),
  '5. the page blocks the Send when a pending edit failed to save');
const flushFn = extractFn(RO, '_roFlushDirtyEditsForSend_');
ok(/await Promise\.all/.test(flushFn), '5. and the flush is AWAITED, not fire-and-forget');

// =============================================================================================================
section('6. 495 / 234 / 468 cannot be mislabelled');

// the exact reported shape, EXECUTED through the shipped builder: 234 drafts x 2 positive tiers = 468 cells
const shape = [];
for (let i = 0; i < 234; i++) {
  shape.push(draftRow({ id: 'RD-' + i, sku: 'SK' + i, tiers: { T1: { qty: 10 }, T2: { qty: 5 } } }));
}
const wsShape = rosBuildWorkset_(shape, { planning_cycle: '2026-08', tier_scope: 'ALL', series_by_sku: {}, units_per_carton_by_sku: {} });
eq(wsShape.drafts_with_positive_selected_tier, 234, '6. 234 = DRAFTS carrying a positive selected tier');
eq(wsShape.positive_selected_tier_allocations, 468, '6. 468 = positive TIER ALLOCATIONS (a different unit)');
eq(wsShape.expected_request_order_lines, 468, '6. expected Request Order LINES = tier allocations');
eq(wsShape.distinct_skus, 234, '6. distinct SKUs is its own count');
ok(wsShape.expected_request_order_lines !== wsShape.drafts_with_positive_selected_tier,
  '6. so a line count can never be printed as a draft count');
// every count name states its unit, and the two families are separated in the dialog
eval(extractFn(RO, '_roSendConfirmSummary_'));
const dlg = _roSendConfirmSummary_({ all_page_rows_loaded: 495, sku_rows_with_positive_tier: 234, tier_cells_with_positive_qty: 468 },
  { tier_scope: 'ALL', planning_cycle: '2026-08', workset_checksum: 'ROSCHK-X', counts: rosCountsOf_(wsShape),
    excluded: wsShape.excluded, quantity_verification: { asserted: 0, verified: 0, persisted_without_assertion: 468 } },
  'All Request (T1+T2+T3)');
ok(dlg.indexOf('ON THIS PAGE (candidate counts — NOT persisted allocation drafts)') !== -1,
  '6. the dialog labels the page numbers as CANDIDATES, not drafts');
ok(dlg.indexOf('WILL BE SENT (server authority — PERSISTED allocation drafts') !== -1,
  '6. and labels the server numbers as the send authority');
ok(dlg.indexOf('frozen') !== -1 && /SEND_WORKSET_DRIFT/.test(dlg),
  '6. and states that EXACTLY the frozen set executes, or the Send is refused as drift (FB-3C §F)');
ok(dlg.indexOf('495') !== -1 && dlg.indexOf('234') !== -1 && dlg.indexOf('468') !== -1,
  '6. all three reported numbers appear, each under the correct heading');
ok(dlg.indexOf('Page rows with NO persisted draft') !== -1,
  '6. and the page-vs-database difference is named explicitly');
ok(!/allocation drafts *: *495/.test(dlg), '6. an AI Plan row count is never labelled "allocation drafts"');

// =============================================================================================================
section('7. one client click invokes ONE orchestration request');

// F1-7N-FB-3C §D: one click = ONE zero-write preview from the page, then a SERVER-DRIVEN continuation loop with
// a single call site. The page never issues an execute call itself, so it cannot own business ordering.
const LOOP = RO.slice(RO.indexOf('async function _roSendRunToCompletion_'), RO.indexOf('async function handleSendRequest()'));
eq((code(SEND).match(/DB\.sendRequestOrderOrchestration\(/g) || []).length, 1,
  '7. the page issues exactly ONE orchestration call — the zero-write preview');
ok(/mode: 'preview'/.test(SEND), '7. and it is explicitly a preview');
ok(code(SEND).indexOf("mode: 'execute'") === -1, '7. the page never issues an execute call itself');
eq((code(LOOP).match(/DB\.sendRequestOrderOrchestration\(/g) || []).length, 1,
  '7. the continuation loop has ONE call site, reused for every slice');
ok(/confirmed_checksum: checksum/.test(LOOP) && /continuation: continuation/.test(LOOP),
  '7. every slice carries the same confirmed checksum and a counted continuation');
ok(SEND.indexOf("mode: 'preview'") < SEND.indexOf('_roSendConfirmSummary_'),
  '7. the preview runs BEFORE the confirmation');
ok(SEND.indexOf('_roSendConfirmSummary_') < SEND.indexOf('_roSendRunToCompletion_('),
  '7. the user confirms the SERVER numbers before the committing run begins');
// no per-SKU or per-series write loop remains in the browser
['DB.upsertRequestOrderAllocationDraft(', 'DB.upsertRequestOrderAllocationDraftLines(', 'DB.createRequestOrderDraft(',
 'DB.submitRequestOrderAllocationDrafts('].forEach(function (w) {
  ok(code(SEND).indexOf(w) === -1, '7. the browser no longer calls ' + w + ' during a Send');
});
ok(!/for \(var di = 0/.test(SEND) && !/for \(var si = 0/.test(SEND), '7. and no write loop remains at all');
// a second click is refused
ok(/if \(_roSendState\.busy\) \{/.test(SEND), '7. a second click while running is refused (single-flight)');
// the dry run really performs zero writes: EXECUTE it
let writeCalls = 0;
function fixtureIo(rows, opts) {
  opts = opts || {};
  const journal = opts.journal || {};
  // Deep-clone so each io owns its own rows: the submit seam MUTATES status (like the canonical writer), and a
  // shared fixture array would let one scenario silently pre-consume the next one's drafts.
  rows = JSON.parse(JSON.stringify(rows));
  return {
    now: (function () { let t = 1000; return function () { t += 10; return t; }; })(),
    openDb: function () { return {}; },
    readTable: function (ss, name) {
      if (name === 'request_order_allocation_drafts') return opts.afterRows || rows;
      if (name === 'sku_details') return SKU_DETAILS;
      if (name === 'request_orders') return opts.orders || [];
      if (name === 'request_order_lines') return opts.orderLines || [];
      if (name === 'request_order_line_sources') return opts.orderSources || [];
      return [];
    },
    // Emulates 13_ roCreateRequestOrderCore_: one request_order_lines row and one request_order_line_sources row
    // per input line, with the header totals derived from them. opts.corrupt lets a test make the writer lie in
    // one specific way so the §G verifier can be proven to catch it.
    createRequestOrderDraft: function (body) {
      writeCalls++;
      if (opts.createFails) return { success: false, error: 'BOOM', stage: 'lines' };
      const n = 'REQ-' + writeCalls;
      const id = 'RO-' + writeCalls;
      let totalQty = 0; const skus = {};
      (body.lines || []).forEach(function (l, li) {
        const lineId = 'ROL-' + writeCalls + '-' + li;
        let q = Number(l.requested_qty);
        if (opts.corrupt === 'QTY' && li === 0) q = q + 1;                       // wrong quantity
        (opts.orderLines = opts.orderLines || []).push({
          request_order_line_id: (opts.corrupt === 'NO_LINE_ID' && li === 0) ? '' : lineId,
          request_order_id: id, sku: l.sku, series: l.series, company: l.company,
          request_bucket: l.request_bucket, request_month: l.request_month,
          requested_qty: q, approved_qty: q, units_per_carton: l.units_per_carton
        });
        if (opts.corrupt === 'DUPLICATE_LINE' && li === 0) {
          (opts.orderLines = opts.orderLines || []).push({
            request_order_line_id: lineId + 'X', request_order_id: id, sku: l.sku, series: l.series,
            company: l.company, request_bucket: l.request_bucket, request_month: l.request_month,
            requested_qty: q, approved_qty: q, units_per_carton: l.units_per_carton
          });
        }
        (opts.orderSources = opts.orderSources || []).push({
          request_order_line_source_id: 'ROLS-' + writeCalls + '-' + li,
          request_order_line_id: lineId, request_order_id: id, sku: l.sku, company: l.company,
          country: (opts.corrupt === 'STATION' && li === 0) ? 'ZZ' : l.country,
          marketplace: l.marketplace, tier_type: l.request_bucket, source_month: l.request_month,
          request_allocation_draft_id: (opts.corrupt === 'LINEAGE' && li === 0) ? 'RD::MONTHLY_ORDER::2026-08::wrong' : l.request_allocation_draft_id,
          requested_qty: q, approved_qty: q
        });
        totalQty += q;
        skus[String(l.sku).toUpperCase()] = 1;
      });
      if (opts.corrupt === 'EXTRA_LINE') {
        (opts.orderLines = opts.orderLines || []).push({ request_order_line_id: 'ROL-EXTRA', request_order_id: id,
          sku: 'GHOST', series: '', company: '', request_bucket: 'T2', request_month: '2026-10', requested_qty: 7 });
      }
      (opts.orders = opts.orders || []).push({ request_order_id: id, request_order_no: n,
        total_qty: (opts.corrupt === 'HEADER_TOTAL' ? totalQty + 5 : totalQty),
        total_sku: Object.keys(skus).length });
      return { success: true, data: { request_order_id: id, request_order_no: n, reused: false, execution_key: 'ROEXEC-' + writeCalls } };
    },
    submitAllocationDrafts: function (body) {
      opts.submitted = (body || {}).draft_ids || [];
      opts.submitBuckets = (body || {}).submit_buckets;
      // Behave like the CANONICAL writer (15_): advance the header status, so the orchestration's reconcile
      // phase has something real to verify. Without this the run would honestly report an unverified transition.
      if (!opts.skipStatusAdvance) {
        (opts.afterRows || rows).forEach(function (r) {
          if ((opts.submitted || []).indexOf(r.request_allocation_draft_id) !== -1) r.status = 'submitted';
        });
      }
      return { success: true, data: { submitted: (opts.submitted || []).length } };
    },
    executionKey: function () { return 'ROEXEC-TEST'; },
    // F1-7N-FB-3C §E — the journal is now a chunked Script-Property store plus a compare-and-set lock, because a
    // journalGet -> decide -> journalPut seam cannot be made atomic. The fake lock SERIALIZES its callback and
    // records how deep it nested, so the suite can prove the lock is never held across a canonical writer call.
    propGet: function (n) { return Object.prototype.hasOwnProperty.call(journal, n) ? journal[n] : null; },
    propSet: function (n, v) { journal[n] = String(v); return true; },
    propDelete: function (n) { delete journal[n]; return true; },
    withCasLock: function (fn) {
      opts._casDepth = (opts._casDepth || 0) + 1;
      opts._casMaxDepth = Math.max(opts._casMaxDepth || 0, opts._casDepth);
      opts._casCalls = (opts._casCalls || 0) + 1;
      try { return { locked: true, value: fn() }; }
      finally { opts._casDepth--; }
    },
    _journal: journal, _opts: opts
  };
}
// F1-7N-FB-3C §F — an execute call MUST carry the checksum a preview froze. This driver performs the real
// handshake (preview, then execute with the returned checksum) so no test can accidentally bypass it.
function runSend(io, payload, extra) {
  const pv = handleRequestOrderSendOrchestrate_({ payload: Object.assign({ mode: 'preview' }, payload) }, io);
  if (!pv.success) return pv;
  const ck = pv.data.confirm_with_checksum || pv.data.workset_checksum;
  return handleRequestOrderSendOrchestrate_({ payload: Object.assign({ mode: 'execute', confirmed_checksum: ck }, payload, extra || {}) }, io);
}
const dryRows = [draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } }), draftRow({ sku: 'S3', tiers: { T1: { qty: 50 } } })];
writeCalls = 0;
const previewIo = fixtureIo(dryRows);
const dry = handleRequestOrderSendOrchestrate_({ payload: { tier_scope: 'ALL', planning_cycle: '2026-08', mode: 'preview' } }, previewIo);
ok(dry.success === true, '7. the preview succeeds');
eq(dry.data.status, 'PREVIEW', '7. and identifies itself as a frozen plan');
eq(writeCalls, 0, '7. performing ZERO business writes');
eq(dry.data.writes_performed, 0, '7. and reporting zero business writes');
eq(dry.data.counts.expected_request_order_headers, 2, '7. while still computing the real header count');
eq(dry.data.journal_persisted, true, '7. the preview PERSISTS the frozen plan (FB-3C §F)');
ok(!!dry.data.confirm_with_checksum, '7. and returns the checksum the execute call must present back');

// =============================================================================================================
section('8. the orchestration reuses the canonical writers (no second writer)');

ok(/createRequestOrderDraft: function \(body\) \{ return rosUnwrap_\(handleCreateRequestOrderDraft_\(body\)\); \}/.test(G66),
  '8. Request Orders go through 13_ handleCreateRequestOrderDraft_');
ok(/submitAllocationDrafts: function \(body\) \{ return rosUnwrap_\(handleSubmitRequestOrderAllocationDrafts_\(body\)\); \}/.test(G66),
  '8. the lifecycle advance goes through 15_ handleSubmitRequestOrderAllocationDrafts_');
const code66 = noStrings(G66);
['appendRow', '.setValue(', '.setValues(', 'insertSheet', 'deleteRow', 'procurementEnsureSheet_',
 'sheetEnsureColumns_', 'DriveApp', 'MailApp', 'GmailApp'].forEach(function (w) {
  ok(code66.indexOf(w) === -1, '8. 66_ never executes ' + w + ' — it owns no write of its own');
});
// F1-7N-FB-3C §E: 66_ now DOES take a ScriptLock, because a journal read-modify-write could not otherwise be
// atomic. §E authorises exactly that, and only around the compare-and-set. The contract is therefore no longer
// "no lock" but "one lock, in one place, never held across a canonical writer" — which is strictly stronger
// than the old absence, because it also rules out the race the absence permitted.
eq((code66.match(/LockService\.getScriptLock\(\)/g) || []).length, 1,
  '8. exactly ONE ScriptLock acquisition exists in 66_');
const casFn = extractFn(G66, 'rosDefaultIo_');
ok(/withCasLock: function \(fn\) \{[\s\S]{0,400}LockService\.getScriptLock\(\)/.test(casFn),
  '8. and it lives inside withCasLock — the compare-and-set seam');
ok(/releaseLock/.test(casFn), '8. which always releases it in a finally');
const ownFn = extractFn(G66, 'rosOwnershipTransact_');
['createRequestOrderDraft', 'submitAllocationDrafts', 'readTable', 'openDb'].forEach(function (w) {
  ok(code(ownFn).indexOf('io.' + w) === -1,
    '8. the CAS transaction never calls io.' + w + ' — the lock is never held across a canonical writer or a table read');
});
eq((G66.match(/handleCreateRequestOrderDraft_\(/g) || []).length, 1, '8. exactly ONE seam to the Request Order writer');
eq((G66.match(/handleSubmitRequestOrderAllocationDrafts_\(/g) || []).length, 1, '8. exactly ONE seam to the submit writer');
// output PROOF sits between creation and the lifecycle advance
const iC = orch.indexOf('io.createRequestOrderDraft'), iP = orch.indexOf('REQUEST_ORDER_OUTPUT_VERIFICATION_FAILED'), iS = orch.indexOf('io.submitAllocationDrafts');
ok(iC < iP && iP < iS, '8. create → PROVE the output → only then advance the lifecycle');
ok(/rosVerifyRequestOrderOutput_\(/.test(orch),
  '8. and the proof is the FIELD-BY-FIELD verifier, not a line count (FB-3C §G)');
// EXECUTED end to end
writeCalls = 0;
const runIo = fixtureIo(dryRows);
const run = runSend(runIo, { tier_scope: 'ALL', planning_cycle: '2026-08' });
ok(run.success === true, '8. a full run succeeds');
eq(run.data.status, 'COMPLETED', '8. reaching COMPLETED');
eq(writeCalls, 2, '8. with exactly one canonical writer call per Series group');
eq(run.data.request_order_count, 2, '8. two Request Orders for two Series');
eq(run.data.allocation_drafts_advanced, 2, '8. and both allocation drafts advanced');
eq(runIo._opts.submitBuckets, null, '8. an ALL Send advances every tier (submit_buckets = null)');
eq(run.data.unverified_transitions, [], '8. and the reconcile phase verifies every advanced draft');
// and the reconcile is not decorative: a writer that reports success without advancing is CAUGHT
const silentIo = fixtureIo([draftRow({ sku: 'S1', tiers: { T1: { qty: 100 } } })], { skipStatusAdvance: true });
const silent = runSend(silentIo, { tier_scope: 'ALL', planning_cycle: '2026-08' });
eq(silent.data.status, 'COMPLETED_WITH_UNVERIFIED_TRANSITIONS',
  '8. a lifecycle row that did NOT actually advance is reported, never assumed');
ok(silent.data.unverified_transitions.length === 1 && silent.data.unverified_transitions[0].reason === 'STATUS_NOT_ADVANCED',
  '8. naming the exact row and reason');
// a tier-scoped Send advances ONLY that tier
const t1Io = fixtureIo([draftRow({ sku: 'S1', tiers: { T1: { qty: 100 }, T2: { qty: 7 } } })]);
runSend(t1Io, { tier_scope: 'T1', planning_cycle: '2026-08' });
eq(t1Io._opts.submitBuckets, ['T1'], '8. a T1 Send advances ONLY T1 (submit_buckets = [T1])');
// output failure blocks the lifecycle
const unprovenIo = fixtureIo(dryRows);
unprovenIo.createRequestOrderDraft = function () { writeCalls++; return { success: true, data: { request_order_id: 'GHOST', request_order_no: 'REQ-GHOST', reused: false } }; };
const unproven = runSend(unprovenIo, { tier_scope: 'ALL', planning_cycle: '2026-08' });
ok(unproven.success === false, '8. an unverifiable Request Order fails the run');
eq(unproven.errors[0].code, 'REQUEST_ORDER_OUTPUT_VERIFICATION_FAILED',
  '8. named REQUEST_ORDER_OUTPUT_VERIFICATION_FAILED (FB-3C: field by field, not a line count)');
ok(!unprovenIo._opts.submitted, '8. and NO allocation draft was advanced');

// =============================================================================================================
section('9. Series aggregation preserves SKU / tier / station lineage');

const lineage = [
  draftRow({ id: 'RD-A', sku: 'S1', country: 'US', tiers: { T1: { qty: 10, month: '2026-09' }, T3: { qty: 30, month: '2026-11' } } }),
  draftRow({ id: 'RD-B', sku: 'S2', country: 'CA', tiers: { T2: { qty: 20, month: '2026-10' } } }),
  draftRow({ id: 'RD-C', sku: 'S3', country: 'DE', tiers: { T1: { qty: 40, month: '2026-09' } } })
];
const groups = rosGroupBySeries_(buildWs(lineage, 'ALL'));
eq(groups.length, 2, '9. two Series groups (ALPHA, BETA)');
eq(groups.map(function (g) { return g.series; }), ['ALPHA', 'BETA'], '9. deterministically sorted by Series');
eq(groups[0].line_count, 3, '9. ALPHA keeps ONE LINE PER TIER CELL — tiers are never merged');
eq(groups[0].lines.map(function (l) { return l.sku + '/' + l.request_bucket; }), ['S1/T1', 'S1/T3', 'S2/T2'],
  '9. SKU + tier lineage preserved on every line, sorted deterministically');
eq(groups[0].lines.map(function (l) { return l.request_month; }), ['2026-09', '2026-11', '2026-10'],
  '9. each line keeps its own request month');
eq(groups[0].lines.map(function (l) { return l.country; }), ['US', 'US', 'CA'],
  '9. and its own station, so a Series group may legitimately span countries');
eq(groups[0].allocation_draft_ids, ['RD-A', 'RD-B'], '9. the lineage FK set is deduped and sorted');
eq(groups[0].total_units, 60, '9. units aggregate without losing the per-line detail');
// determinism: the same workset, rows shuffled, produces identical grouping and the identical checksum
const shuffled = [lineage[2], lineage[0], lineage[1]];
eq(JSON.stringify(rosGroupBySeries_(buildWs(shuffled, 'ALL'))), JSON.stringify(groups),
  '9. row order does not change the grouping');
eq(rosWorksetChecksum_(buildWs(shuffled, 'ALL')), rosWorksetChecksum_(buildWs(lineage, 'ALL')),
  '9. nor the frozen source checksum');
// a changed quantity DOES change it
const changed = JSON.parse(JSON.stringify(lineage)); changed[0].t1_order_qty = 11;
ok(rosWorksetChecksum_(buildWs(changed, 'ALL')) !== rosWorksetChecksum_(buildWs(lineage, 'ALL')),
  '9. a changed quantity changes the checksum (it is a real fingerprint)');
// and the writer body carries the lineage FK per line
ok(/request_allocation_draft_id: l\.request_allocation_draft_id/.test(orch),
  '9. every Request Order line carries its allocation-draft lineage FK');
ok(/country: l\.country, marketplace: l\.marketplace/.test(orch),
  '9. and its station, which flows into request_order_line_sources');

// =============================================================================================================
section('10. page navigation cannot own or cancel business progress');

ok(/_sendMount !== _roSendState\.mountSeq/.test(SEND), '10. a stale mount is detected');
ok(/success_discarded_stale_mount/.test(SEND), '10. and recorded');
ok(/Navigation cannot own or cancel business progress/.test(SEND),
  '10. with the reason stated: the orchestration already completed on the SERVER');
// nothing in the Send path aborts, cancels or reverses a server-side run
['AbortController', '.abort(', 'cancelOrchestration', 'clearInterval'].forEach(function (k) {
  ok(code(SEND).indexOf(k) === -1, '10. the page has no way to cancel the server run (' + k + ' absent)');
});
ok(/\} finally \{/.test(SEND) && /_roSendState\.busy = false;/.test(SEND),
  '10. the latch is always released, so the page never stays stuck');
// the durable record lives on the SERVER, journaled before the first write
ok(orch.indexOf('io.journalPut(orchestrationKey, journal)') < iC,
  '10. the frozen plan is journaled BEFORE the first write, so a killed execution leaves durable evidence');
// FB-3C: the per-Series journal write became an ATOMIC ownership transaction (lease renew + journal write under
// the CAS lock), which is strictly stronger than the plain put it replaced.
const iWriteLoop = orch.indexOf('for (var gi = 0');
const iAfterSeries = orch.indexOf('rosOwnershipTransact_(io, cycle, key, io.now(), function () { return journal; })');
ok(iAfterSeries > iWriteLoop && iAfterSeries < orch.indexOf('phase(\'write_orders_done\''),
  '10. the journal + lease are renewed INSIDE the write loop after every Series, so a kill loses no proven work');

// =============================================================================================================
section('11. a timeout RESUMES by execution key without duplication');

// the key is a PURE function of the request body → a resume computes the same key
const payloadA = { tier_scope: 'ALL', planning_cycle: '2026-08', intents: [
  { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'S1', tiers: { T1: { order_qty: 100 } } },
  { company: 'KM', country: 'CA', marketplace: 'Amazon', sku: 'S2', tiers: { T2: { order_qty: 200 } } }] };
const payloadB = { tier_scope: 'ALL', planning_cycle: '2026-08', intents: [payloadA.intents[1], payloadA.intents[0]] };
eq(rosOrchestrationKey_(payloadA), rosOrchestrationKey_(payloadB),
  '11. the orchestration key ignores intent ORDER (same request → same key)');
ok(rosOrchestrationKey_(payloadA) !== rosOrchestrationKey_({ tier_scope: 'T1', planning_cycle: '2026-08', intents: payloadA.intents }),
  '11. a different tier scope is a different execution');
ok(rosOrchestrationKey_(payloadA) !== rosOrchestrationKey_({ tier_scope: 'ALL', planning_cycle: '2026-09', intents: payloadA.intents }),
  '11. so is a different planning cycle');
const changedQty = JSON.parse(JSON.stringify(payloadA)); changedQty.intents[0].tiers.T1.order_qty = 101;
ok(rosOrchestrationKey_(payloadA) !== rosOrchestrationKey_(changedQty),
  '11. and so is a different asserted quantity');
// a completed journal REPLAYS without writing again
const doneJournal = {};
doneJournal['ROSEND_JOURNAL_' + rosOrchestrationKey_({ tier_scope: 'ALL', planning_cycle: '2026-08' })] = null;
const replayIo = fixtureIo(dryRows);
const first = runSend(replayIo, { tier_scope: 'ALL', planning_cycle: '2026-08' });
eq(first.data.status, 'COMPLETED', '11. first run completes');
const beforeReplay = writeCalls;
const replay = runSend(replayIo, { tier_scope: 'ALL', planning_cycle: '2026-08' });
eq(replay.data.status, 'ALREADY_COMPLETED', '11. an identical re-invocation REPLAYS the recorded result');
eq(replay.data.replayed, true, '11. and says so');
eq(writeCalls, beforeReplay, '11. writing nothing a second time — no duplicate Request Order');
// resume semantics are gated on the frozen source
eq(rosJournalResumable_(null, 'C1', 1000).reason, 'NO_JOURNAL', '11. no journal → nothing to resume');
eq(rosJournalResumable_({ orchestration_key: 'K', status: 'COMPLETED', workset_checksum: 'C1', started_at: 1 }, 'C1', 1000).reason,
  'ALREADY_COMPLETED', '11. a completed journal is not resumed, it is replayed');
eq(rosJournalResumable_({ orchestration_key: 'K', status: 'PARTIAL', workset_checksum: 'C1', started_at: 1 }, 'C2', 1000).reason,
  'SOURCE_CHANGED_SINCE_INTERRUPTION', '11. a journal whose source moved is REFUSED, never continued blindly');
ok(rosJournalResumable_({ orchestration_key: 'K', status: 'PARTIAL', workset_checksum: 'C1', started_at: 1 }, 'C1', 1000).resumable,
  '11. an unchanged source is resumable');
eq(rosJournalResumable_({ orchestration_key: 'K', status: 'PARTIAL', workset_checksum: 'C1', started_at: 1 }, 'C1', 1 + 86400001).reason,
  'JOURNAL_EXPIRED', '11. and an expired journal is refused');
// a concurrent execution under the same key is refused rather than run twice
ok(rosLeaseHeld_({ status: 'RUNNING', lease_at: 1000 }, 2000), '11. a fresh lease is held');
ok(!rosLeaseHeld_({ status: 'RUNNING', lease_at: 1000 }, 1000 + 360001), '11. an abandoned lease is not');
ok(!rosLeaseHeld_({ status: 'COMPLETED', lease_at: 1000 }, 1100), '11. a completed run holds nothing');
// FB-3C §E: refusal is now per PLANNING CYCLE, not per key — a key-scoped lease could not stop two DIFFERENT
// keys from writing overlapping drafts, which is the case this suite must cover.
ok(/SEND_WORKSET_OWNED_BY_ANOTHER_EXECUTION/.test(orch) && /Do NOT retry/.test(orch),
  '11. a concurrent Send over the same planning cycle is refused with an explicit do-not-retry');
eq(rosOwnershipDecision_({ execution_key: 'K1', lease_at: 1000, status: 'RUNNING' }, 'K2', 1100).verdict, 'REFUSE',
  '11. a DIFFERENT key cannot take a live cycle lease');
eq(rosOwnershipDecision_({ execution_key: 'K1', lease_at: 1000, status: 'RUNNING' }, 'K1', 1100).verdict, 'GRANT',
  '11. the owning key renews its own lease');
// PARTIAL_RESUMABLE is an honest intermediate state, never presented as failure or as complete
ok(/PARTIAL_RESUMABLE/.test(orch) && /lifecycle_advanced: false/.test(orch),
  '11. a voluntary stop reports PARTIAL_RESUMABLE with the lifecycle explicitly NOT advanced');
ok(/Do NOT start a new Send/.test(orch), '11. and tells the operator to resume, not to start again');
// FB-3C §D — THE 90 s / 240 s CONTRADICTION. The budget is now DERIVED from the real client bound, and the
// relationship is arithmetic rather than a claim: budget + worst single write + reserve <= the client timeout.
const CW = Number((G66.match(/var ROS_CLIENT_WRITE_TIMEOUT_MS_ = (\d+);/) || [])[1]);
const MW = Number((G66.match(/var ROS_MAX_SINGLE_WRITE_MS_ = (\d+);/) || [])[1]);
const RV = Number((G66.match(/var ROS_RESERVE_MS_ = (\d+);/) || [])[1]);
const clientWrite = Number((DBAPI.match(/var KM_WRITE_TIMEOUT_MS_ = (\d+);/) || [])[1]);
eq(CW, clientWrite, '11. the server restates the REAL client write timeout (' + clientWrite + ' ms) — they cannot drift');
eq(ROS_SLICE_BUDGET_MS_, CW - MW - RV, '11. the slice budget is DERIVED, not a magic number');
ok(ROS_SLICE_BUDGET_MS_ + MW + RV <= CW,
  '11. budget + worst single write + reserve <= the client bound, so a slice ALWAYS answers before the browser aborts');
ok(ROS_SLICE_BUDGET_MS_ > 0 && ROS_SLICE_BUDGET_MS_ < CW, '11. and the budget is a real positive margin');
ok(!/ROS_TIME_BUDGET_MS_/.test(G66), '11. the old 240 000 ms budget that outlived the client bound is gone');
ok(ROS_LEASE_MS_ > ROS_SLICE_BUDGET_MS_ + MW,
  '11. the lease outlives the worst-case slice, so a live slice is never treated as abandoned');
// the client says the same thing
const errMsgFn = extractFn(RO, '_roSendOrchestrationErrorMessage_');
ok(/RESUMABLE BY EXECUTION KEY/.test(errMsgFn) && /do NOT press Send again/.test(errMsgFn),
  '11. the page tells the user to resume by execution key, never to retry blindly');
ok(!/setTimeout|setInterval/.test(code(SEND)), '11. and the page schedules no automatic retry');
// the transport annotates a timeout the same way
ok(/resumable_by_execution_key: true, retryable: false/.test(DBAPI),
  '11. the transport marks an expired orchestration resumable and NOT retryable');

// =============================================================================================================
section('12. Site Inventory Submit stays Country + Marketplace scoped');

const appliedFn = extractFn(IR, '_irAppliedSubmitScope_');
ok(/_irSearch\.applied/.test(appliedFn),
  '12. the declared station comes from the APPLIED search scope, not the live selects');
ok(code(appliedFn).indexOf('_replenSelectedScope') === -1,
  '12. and never from _replenSelectedScope (which reads the possibly-stale <select> values)');
ok(/applied_scope: _appliedScope \|\| undefined/.test(IR), '12. Submit declares the applied station to the server');
ok(/await _irFlushPendingRouteWritesForSubmit_\(\)/.test(IR), '12. dirty routes are flushed and AWAITED before Submit');
ok(/_irHasUnsavedRoutes_\(\)/.test(IR), '12. unsaved routes still block Submit (fail closed)');
ok(/_qv\.verdict === 'DRIFTED'/.test(IR), '12. a PROVEN quantity drift blocks Submit');
const qvFn = extractFn(IR, '_irVerifyPersistedRouteQuantities_');
ok(/verdict: 'UNVERIFIABLE'/.test(qvFn) && /out\.reason = 'READBACK_/.test(qvFn),
  '12. an inconclusive read-back returns UNVERIFIABLE with a named reason, never a verification');
ok(/out\.verdict = out\.drifted\.length \? 'DRIFTED' : \(out\.checked \? 'VERIFIED' : 'UNVERIFIABLE'\)/.test(qvFn),
  '12. VERIFIED is claimed ONLY when rows were actually compared');
ok(/an inconclusive read is NOT a verification/.test(IR),
  '12. and the rule is stated at the function, so a later edit cannot quietly widen it');
ok(code(qvFn).indexOf('recommended_qty') === -1 && code(qvFn).indexOf('suggestedQty') === -1,
  '12. and AI Suggested Qty is never a source — only the user-owned planned_qty is compared');
ok(/getShippingAllocationDraftWorkspace/.test(qvFn) && code(qvFn).indexOf('loadOperationDb') === -1,
  '12. the read-back uses the TARGETED workspace read, never a whole-DB reload');

// =============================================================================================================
section('13. a mixed-site Shipping Plan payload fails closed');

const core16 = extractFn(G16, 'sadSubmitToShippingPlansCore_');
ok(/MIXED_SITE_PAYLOAD/.test(core16), '13. the server refuses a multi-station payload by name');
ok(/APPLIED_SCOPE_MISMATCH/.test(core16), '13. and a stale-selector payload by name');
['MIXED_SITE_PAYLOAD', 'APPLIED_SCOPE_MISMATCH'].forEach(function (c) {
  const at = core16.indexOf("code: '" + c + "'");
  ok(at > -1 && /zero_write: true/.test(core16.slice(at, at + 200)), '13. ' + c + ' is a proven zero-write');
  ok(/stage: 'validation'/.test(core16.slice(at, at + 200)), '13. ' + c + ' is refused at the validation stage');
});
const iMixed = core16.indexOf('MIXED_SITE_PAYLOAD');
const iCommit = core16.indexOf('shippingPlanCommitFromLines_');
ok(iMixed > -1 && iCommit > iMixed, '13. and they run BEFORE the shipping_plans write authority is reached');
ok(/var sadStationOf_ = function \(h\) \{/.test(core16),
  '13. station identity has ONE resolver');
ok(/drafts\.forEach\(function \(d\) \{ var s = sadStationOf_\(d\.header\);/.test(core16),
  '13. and it reads the PERSISTED header (d.header), never a payload-asserted station');
ok(/var want = sadStationOf_\(appliedScope\);/.test(core16) && /want !== stationList\[0\]/.test(core16),
  '13. the declared applied scope is COMPARED against the persisted station, not trusted as one');
// the gate does not weaken the single-station case
ok(/if \(stationList\.length > 1\)/.test(core16), '13. one station passes; two or more is the refusal');
// the page names both refusals for the operator
ok(/code === 'MIXED_SITE_PAYLOAD'/.test(IR) && /code === 'APPLIED_SCOPE_MISMATCH'/.test(IR),
  '13. and the page explains each one with the corrective action');
// Send Request is deliberately the OPPOSITE: comprehensive across stations
ok(/comprehensive across stations by frozen business rule/.test(G16),
  '13. the asymmetry with Send Request is documented at the gate, not left implicit');

// =============================================================================================================
section('14. Send PO stays blocked on a document failure, with the full operator contract');

const poDiag = extractFn(G39, 'handlePoDocumentDiagnostic_');
['purchase_order_id', 'template', 'field_completeness', 'drive_readiness', 'folder_preview',
 'generated_documents', 'blocking_stage', 'reason_code', 'safe_retry_verdict', 'next_action',
 'required_document_manifest', 'expected_registry_identity'].forEach(function (f) {
  ok(new RegExp('(out\\.' + f + '|\\b' + f + ':)').test(poDiag), '14. the PO diagnostic reports ' + f);
});
ok(/writes_performed: 0, folders_created: 0, files_created: 0/.test(poDiag),
  '14. and proves it created nothing');
const splitFn = extractFn(G39, 'dgsPoGeneratedSplit_');
ok(/attempt_count/.test(splitFn) && /current_count/.test(splitFn) && /superseded/.test(splitFn),
  '14. generated_documents distinguishes ATTEMPT rows from CURRENT rows');
const blkFn = extractFn(G39, 'dgsPoBlockingContract_');
ok(/dgsFailureClass_\(first\) === 'PRE_DISPATCH_BLOCKING'/.test(blkFn),
  '14. retry safety is derived from the EXISTING failure-class authority, not re-invented');
ok(/RETRY_CANNOT_HELP_CONFIGURATION_REQUIRED/.test(blkFn),
  '14. a configuration blocker says plainly that retrying cannot help');
ok(/eligibility|template_selection|field_contract|file_name|drive_readiness/.test(blkFn),
  '14. the blocking stage is one of the stages Send PO actually executes');
ok(!/Configure exactly ONE active Purchase Order template matching factory ".*" \+ series ".*", then re-run this diagnostic\.'\s*\+/.test(blkFn),
  '14. and no configuration value is invented in the guidance');
// the hard gate itself is unchanged
ok(/blocks_transition: true/.test(poDiag), '14. the PO document remains a BLOCKING document');
ok(/document_stage/.test(PO) && /The PO remains Draft/.test(PO),
  '14. and the page still states that the PO remains Draft');
ok(/e\.envelope/.test(PO), '14. rendering the structured cause from the rejection path (the FB-3A fix, intact)');

// =============================================================================================================
section('15. no local / sessionStorage business success anywhere in the Send path');

['sessionStorage.setItem', 'localStorage.setItem', 'sessionStorage.getItem', 'localStorage.getItem'].forEach(function (k) {
  ok(code(SEND).indexOf(k) === -1, '15. the Send path never touches ' + k);
});
ok(/_roUseDb\(\)/.test(SEND), '15. the Demo branch is gated by the explicit eligibility predicate');
ok(/DEMO \(in-memory only, NOT written to DB\)/.test(SEND), '15. and labels itself as writing nothing');
ok(/typeof DB\.sendRequestOrderOrchestration !== 'function'/.test(SEND),
  '15. a missing transport FAILS CLOSED rather than falling back to a local success');
ok(/Nothing was sent/.test(SEND), '15. saying so explicitly');
// success is only ever claimed from a server verdict
const LOOP15 = RO.slice(RO.indexOf('async function _roSendRunToCompletion_'), RO.indexOf('async function handleSendRequest()'));
ok(/res\.success !== true/.test(LOOP15) && /d\.status !== 'PARTIAL_RESUMABLE'/.test(LOOP15),
  '15. success requires the server verdict, and PARTIAL is explicitly not success');
ok(/run\.done/.test(SEND) && /run\.exhausted/.test(SEND),
  '15. and the page only claims success on the loop\u2019s terminal done verdict');
ok(code66.indexOf('PropertiesService') !== -1,
  '15. the durable record is a SERVER journal (Script Properties), not browser storage');

// =============================================================================================================
section('16. no Demo mutation, no email, and the deployment identity moved');

const DEMO = read('specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs');
ok(DEMO.length > 0, '16. the Demo seed file is present');
[G66, code(RO).slice(RO.indexOf('async function handleSendRequest')), code66].forEach(function (src, i) {
  ['MailApp', 'GmailApp', 'sendEmail', 'TEMP_demo_', 'DEMO_SEED'].forEach(function (k) {
    ok(noStrings(src).indexOf(k) === -1, '16. no email / Demo touch in source ' + i + ' (' + k + ')');
  });
});
// the version-bump rule was followed for a sync-visible backend change that also added actions
// The bump RULE, not a frozen literal: a suite that pins the exact string fails on every legitimate future
// bump, which is the opposite of guarding the deployment identity.
const buildNow = (G63.match(/var SYS_BUILD_VERSION_ = '([^']+)';/) || [])[1];
const rosBuild = (G66.match(/var ROS_BUILD_VERSION_ = '([^']+)';/) || [])[1];
// The rule must not pin the MINOR either: F1-7N-FB-4A is a legitimate later build and pinning 'FB-3' rejected it.
// F1-7N-FB-4E-R2 — the pattern admits a REVISION suffix. This project already stamps revisions
// (59_ declares F1-7N-FB-4C-R1 and the manifest expects exactly that), so a rule that accepted only
// F1-7N-FB-<n><A-Z> rejected a legitimate build the moment one was made. It still requires the canonical
// shape; it no longer requires the round to have been a first cut.
ok(/^F1-7N-FB-\d+[A-Z](-R\d+)?$/.test(buildNow || '') && buildNow !== 'F1-7N-FB-3A',
  '16. SYS_BUILD_VERSION_ names a current build at or after FB-3B (' + buildNow + ')');
// F1-7N-FB-4E — RESTATED AT THE INVARIANT IT NAMES. Requiring 66_ to declare the same build as 63_ makes a
// partial sync visible only by accident, and it forces an unnecessary edit to 66_ in every round that touches
// 63_ — which is the opposite of what a per-file build stamp is for. The thing that actually makes a partial
// sync visible is the MANIFEST: SYS_MODULE_BUILD_STAMPS_ declares an EXPECTED build per file, and a file whose
// declared build disagrees with its manifest entry is reported as STALE. So that is what is asserted.
var _rosExpected = (G63.match(/'66_api_v1_request_order_send\.gs', symbol: 'ROS_BUILD_VERSION_', expected: '([^']+)'/) || [])[1];
ok(!!_rosExpected, '16. the manifest declares an expected build for the Send owner (' + _rosExpected + ')');
eq(rosBuild, _rosExpected, '16. and the Send owner declares exactly that, so a partial sync is visible');
const acv = Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
const pinned = Number((DBAPI.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
ok(acv >= 4, '16. the action-contract version advanced because router actions were added (v' + acv + ')');
eq(pinned, acv, '16. and the frontend pins exactly that minimum, so a stale deployment is NAMED rather than guessed at');
['requestOrder.send.orchestrate', 'requestOrder.sendWorkset.get'].forEach(function (a) {
  ok(new RegExp("action === '" + a.replace(/\./g, '\\.') + "'").test(ROUTER), '16. the router registers ' + a);
  ok(new RegExp("action: '" + a.replace(/\./g, '\\.') + "'").test(G63), '16. and health probes ' + a);
});

// =============================================================================================================
section('17. §F — the slim workset read, the instrumented AI-Plan read, and the >45 s cause');

// the slim projection carries ONLY Send fields
eq(ROS_SLIM_DRAFT_PROJECTION_.filter(function (f) { return /forecast|gap|risk|category|lead|inventory|sales|recommend/.test(f); }), [],
  '17. the slim projection carries no forecast / gap / risk / category / lead-time / inventory / recommendation field');
ok(ROS_SLIM_DRAFT_PROJECTION_.indexOf('t1_order_qty') !== -1 && ROS_SLIM_DRAFT_PROJECTION_.indexOf('series') !== -1
  && ROS_SLIM_DRAFT_PROJECTION_.indexOf('status') !== -1 && ROS_SLIM_DRAFT_PROJECTION_.indexOf('planning_cycle') !== -1,
  '17. but does carry tier selection, Series grouping, status and the current-run authority');
// the include gate REFUSES a forbidden include by name instead of ignoring it
const inc = rosResolveIncludes_(['counts', 'forecast', 'nonsense']);
eq(inc.includes, { counts: true }, '17. only allow-listed includes are honoured');
eq(inc.rejected, [{ include: 'forecast', reason: 'FORBIDDEN_NOT_A_SEND_FIELD' }, { include: 'nonsense', reason: 'UNKNOWN_INCLUDE' }],
  '17. a forbidden include is refused BY NAME (a silently-ignored include is how a slim API grows fat again)');
// EXECUTED: the read touches exactly two tables and reports per-phase timings + response bytes
const tablesRead = [];
const slimIo = fixtureIo(dryRows);
const origRead = slimIo.readTable;
slimIo.readTable = function (ss, name) { tablesRead.push(name); return origRead(ss, name); };
const slim = handleRequestOrderSendWorksetGet_({ payload: { tier_scope: 'ALL', planning_cycle: '2026-08', include: ['counts', 'groups'] } }, slimIo);
ok(slim.success === true, '17. the slim read succeeds');
eq(tablesRead, ['request_order_allocation_drafts', 'sku_details'], '17. reading exactly TWO tables');
eq(slim.meta.writes_performed, 0, '17. and writing nothing');
eq(slim.meta.phases.map(function (p) { return p.phase; }),
  ['sheet_open', 'row_read_drafts', 'row_read_sku_details', 'header_resolution', 'current_run_filtering', 'mapping', 'serialization'],
  '17. every server phase is timed separately, so a slow live run names WHICH phase is slow');
ok(slim.meta.response_bytes > 0, '17. and the response byte size is measured');
eq(slim.data.business_send_scope_controls, ['tier_scope'], '17. the read declares tier_scope as the only send scope');
ok(/planning_cycle=2026-08 AND header status IN \(draft, site_confirmed, partially_submitted\)/.test(slim.data.current_run_authority),
  '17. and states the current-run authority explicitly');
// the AI-Plan read: the quadratic scans are gone and the timeout was NOT raised
const aplBuildFn = extractFn(G56, 'aplBuild_');
ok(/overseasBySku\[aplUpper_\(sku\)\]/.test(aplBuildFn) && /eventsBySku\[aplUpper_\(sku\)\]/.test(aplBuildFn),
  '17. the AI-Plan composer now uses per-SKU indexes instead of scanning whole tables per row');
ok(!/for \(var e = 0; e < eventRows\.length; e\+\+\)/.test(aplBuildFn),
  '17. the per-row full scan of fc_special_events is gone');
ok(!/aplOverseasHasMatch_\(overseasRows,/.test(aplBuildFn) && !/rivOverseasStock_\(overseasRows,/.test(aplBuildFn),
  '17. and the two per-row full scans of overseas_inventory_snapshot are gone');
ok(/scope_type/.test(aplBuildFn) && /scope_id/.test(aplBuildFn),
  '17. the event index registers BOTH sku and scope_id keys, so no matchable row is lost');
ok(/var KM_READ_TIMEOUT_MS_ = 45000;/.test(DBAPI), '17. the 45 s read bound was NOT raised to hide latency');
const aplHandler = extractFn(G56, 'handleAiPlanFirstLayerGet_');
ok(/phases\.push\(\{ phase: 'sheet_open'/.test(aplHandler) && /response_bytes/.test(aplHandler),
  '17. and the AI-Plan read is now instrumented per phase, with its payload size measured');

// =============================================================================================================
console.log('\n----------------------------------------');
if (failures.length) {
  console.log('SEND ORCHESTRATION + STATION SCOPE (F1-7N-FB-3B): ' + pass + ' passed, ' + failures.length + ' failed');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('ALL PASS  (' + pass + ' assertions)');
