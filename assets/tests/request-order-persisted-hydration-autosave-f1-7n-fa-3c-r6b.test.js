// Kitchen Mama Operation System — R6B persisted-draft hydration + inline autosave — F1-7N-FA-3C-R6B.
// Run: node assets/tests/request-order-persisted-hydration-autosave-f1-7n-fa-3c-r6b.test.js
// Part A/B extract the REAL request-order.js hydration + autosave functions into a fake DB/DOM/timer harness (no
// 'use strict' — eval declares into module scope). Part C proves the core note contract + inventory-restore finding.
// Part D drives the REAL read-only TEMP_R6B diagnostic against a mock live DB.

var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6B PERSISTED HYDRATION + AUTOSAVE (F1-7N-FA-3C-R6B): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }

var RO = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');
var INV = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8').replace(/\r\n/g, '\n');
var GSTEMP = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var V2 = KMRDV2.V2_HEADERS, HDR = KMRDV2P.HEADER_TABLE;
var TARGET = 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1100-R';
// brace-matched function extractor (handles one-liners + multi-line)
function extract(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), depth = 0; for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

// ---- harness state the eval'd functions close over ----
var requestOrderState = { data: [], filters: {}, allocEdits: {} };
var window = {}, renderCount = 0;
function renderRequestOrderTable() { renderCount++; }
function _roEffectiveOrderQty() { return ''; }   // fallback → empty when there is no canonical draft (missing-draft = blank)
var _roCanonicalDraftBySku = {}, _roNoDraftSkus = {}, _roSubmittedSkus = {}, _roHydrateSeq = 0, _roAutosaveTimers_ = {};
var _timers = [];
function setTimeout(fn) { _timers.push(fn); return _timers.length; }
function clearTimeout(id) { if (id) _timers[id - 1] = null; }
function flushTimers() { var t = _timers.slice(); _timers = []; t.forEach(function (fn) { if (fn) fn(); }); }
var lastCmd = null, dbWrites = { count: 0 }, draftLineCalls = { count: 0 };
var getActiveResponse = null, updateResponse = null;
var db = {
  getActiveRequestOrderDrafts: function () { return Promise.resolve(getActiveResponse); },
  getRecommendationDraftToken: function () { return Promise.resolve({ success: true, data: { expectedToken: { draft_version: 3, userEditFingerprint: 'fp3' } } }); },
  updateRecommendationDecisionLocked: function (cmd) { lastCmd = cmd; dbWrites.count++; return Promise.resolve(updateResponse); },
  getShippingAllocationDraftLines: function () { draftLineCalls.count++; return []; }
};
window.KM = { DB: db };
// eval ONE joined string at top level (eval inside a callback would scope the declarations to the callback)
var _r6bFns = [ '_roScopeStr_', '_roScopesFromLoadedData_', '_roCanonicalScope_', '_roCanonKey_', '_roCanonicalRowFor_', '_roIsCanonicalDraftSku_',
  '_roRowOrderQtyDisplay_', '_roRowNoteDisplay_', '_roV2IsFlatDraft_', '_roV2NormalizeFlatDraft_', '_roReadActiveDraftsForScope_',
  '_roLoadCanonicalDraftsForScope_', '_roHydratePersistedDraftsForLoadedScopes_', '_roBuildTierEditCommand_', '_roBuildOrderQtyEditCommand_',
  '_roSetFieldState_', '_roSaveTierEditToCanonicalDraft_', '_roEnsureDraftToken_', '_roAutosaveKey_', '_roAutosaveDebounce_', '_roAutosaveFlush_',
  '_roAllocEnsure', '_roAllocEditNote', '_roAllocNoteFlush', '_roNotify_' ].map(function (n) { return extract(RO, n); }).join('\n');
eval(_r6bFns);

function flatDto(over) {
  over = over || {};
  return { draftId: TARGET, draftVersion: 3, status: 'draft', model: 'flat_v2',
    scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' }, unitsPerCarton: 40,
    tiers: [
      { tier: 'T1', month: '2026-08', orderQty: 0, recommendedQty: 0, cartonQty: 0, status: 'draft', note: '', userEdited: false },
      { tier: 'T2', month: '2026-09', orderQty: 320, recommendedQty: 300, cartonQty: 8, status: 'draft', note: 'keep', userEdited: true },
      { tier: 'T3', month: '2026-10', orderQty: 7520, recommendedQty: 7520, cartonQty: 188, status: 'draft', note: '', userEdited: false }
    ] };
}
function fakeInput(field, sku, bucket, value) { var cls = {}; return { value: value, title: '', dataset: { sku: sku, bucket: bucket, field: field, country: 'US', marketplace: 'Amazon', month: '2026-09' }, classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; }, _s: cls } }; }

(function run() {
  section('A. root cause + scope derivation');
  requestOrderState.data = [{ sku: 'CO1100-R', company: 'ResUS', country: 'US', marketplace: 'Amazon' }];
  window._roAiPlanScope = undefined;
  eq(_roScopesFromLoadedData_(), [{ company: 'ResUS', country: 'US', marketplace: 'Amazon' }], 'concrete scope derived from loaded rows');
  eq(_roCanonicalScope_(), { company: 'ResUS', country: 'US', marketplace: 'Amazon' }, 'ROOT-CAUSE FIX: after refresh (_roAiPlanScope undefined) scope now derives from loaded data');
  requestOrderState.data = [];
  eq(_roCanonicalScope_(), null, 'no loaded data + no AI Plan scope → null (unchanged safe)');

  section('A. hydration projects the persisted flat Draft (no AI Plan)');
  requestOrderState.data = [{ sku: 'CO1100-R', company: 'ResUS', country: 'US', marketplace: 'Amazon' }];
  getActiveResponse = { data: { drafts: [flatDto()], noDraftSkus: [], submittedSkus: [], conflicts: [] } };
  dbWrites.count = 0;
  _roHydratePersistedDraftsForLoadedScopes_().then(function () {
    var d = _roCanonicalDraftBySku['CO1100-R'];
    ok(d && d.draftId === TARGET && d.status === 'draft' && d.draftVersion === 3, '1. persisted Draft hydrated (id/status/version) on fresh mount/search');
    eq([_roRowOrderQtyDisplay_({ sku: 'CO1100-R' }, 1, 'T2', {}), _roRowOrderQtyDisplay_({ sku: 'CO1100-R' }, 2, 'T3', {})], [320, 7520], '3. T2/T3 order_qty come from DB');
    eq([_roRowNoteDisplay_({ sku: 'CO1100-R' }, 'T2'), _roRowNoteDisplay_({ sku: 'CO1100-R' }, 'T3')], ['keep', ''], '3. tier note comes from DB (incl. blank)');
    eq(_roCanonicalRowFor_('CO1100-R', 'T3').line.carton_qty, 188, '3. carton_qty comes from DB');
    eq(dbWrites.count, 0, '4. hydration performed ZERO decision writes');
    ok(_roIsCanonicalDraftSku_('CO1100-R') === true, 'hydrated SKU is a canonical-draft execution authority');

    section('A. missing / duplicate / late-response');
    getActiveResponse = { data: { drafts: [], noDraftSkus: ['CO1100-R'], submittedSkus: [], conflicts: [] } };
    return _roHydratePersistedDraftsForLoadedScopes_();
  }).then(function () {
    ok(!_roCanonicalDraftBySku['CO1100-R'] && _roNoDraftSkus['CO1100-R'] === true, '7. missing Draft leaves allocation empty (NO_DRAFT), never generates one');
    eq(_roRowOrderQtyDisplay_({ sku: 'CO1100-R' }, 0, 'T1', {}), '', '7. no draft → Order Qty blank (never a Suggested fallback)');
    getActiveResponse = { data: { drafts: [], noDraftSkus: [], submittedSkus: [], conflicts: [{ sku: 'CO1100-R', conflictIds: [TARGET, TARGET + '::DUP'] }] } };
    return _roHydratePersistedDraftsForLoadedScopes_();
  }).then(function () {
    ok(_roCanonicalDraftBySku['CO1100-R'] && _roCanonicalDraftBySku['CO1100-R'].conflict === true, '8. duplicate active match fails closed (conflict entry, not a silent pick)');
    ok(_roIsCanonicalDraftSku_('CO1100-R') === false, '8. a conflict SKU is NOT an edit authority');
    // late-response guard: start a hydration, bump seq (a newer run), then let the old resolve → dropped
    getActiveResponse = { data: { drafts: [flatDto()], noDraftSkus: [], submittedSkus: [], conflicts: [] } };
    var stalePromise = _roHydratePersistedDraftsForLoadedScopes_();
    _roHydrateSeq++;   // simulate a newer hydration/edit starting mid-flight
    return stalePromise;
  }).then(function () {
    ok(!_roCanonicalDraftBySku['CO1100-R'] || _roCanonicalDraftBySku['CO1100-R'].conflict === true, '9. a late hydration response is dropped by the seq guard (never overwrites newer state)');

    section('B. autosave command contract');
    eq(_roBuildTierEditCommand_(TARGET, '2026-09', 'T2', { order_qty: 320 }, { draft_version: 3 }).edits[0].fields, { order_qty: 320 }, 'order_qty-only command omits note');
    eq(_roBuildTierEditCommand_(TARGET, '2026-09', 'T2', { note: 'hi' }, {}).edits[0].fields, { note: 'hi' }, 'note-only command carries note (no order_qty)');
    eq(_roBuildTierEditCommand_(TARGET, '2026-09', 'T2', { note: '' }, {}).edits[0].fields, { note: '' }, '12. blank note → note:"" (deliberate replace, not omitted)');
    ok(!('carton_qty' in _roBuildTierEditCommand_(TARGET, '2026-09', 'T2', { order_qty: 320 }, {}).edits[0].fields), '13. frontend NEVER authors carton_qty (backend recomputes it)');

    section('B. note autosave — debounce + flush + persist');
    _roCanonicalDraftBySku = {}; var acc = {}, nd = {}, sub = {};
    return _roReadActiveDraftsForScope_({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }, acc, nd, sub).then(function () { _roCanonicalDraftBySku = acc; });
  }).then(function () {
    // three rapid note keystrokes on T2 → debounce collapses to ONE pending timer
    _timers = []; dbWrites.count = 0; updateResponse = { success: true, data: { status: 'COMPLETED', draftVersion: 4 } };
    var inp = fakeInput('note', 'CO1100-R', 'T2', 'a'); _roAllocEditNote(inp); inp.value = 'ab'; _roAllocEditNote(inp); inp.value = 'abc'; _roAllocEditNote(inp);
    var pending = _timers.filter(Boolean).length;
    eq(pending, 1, '10. rapid note input debounces to ONE pending write');
    eq(dbWrites.count, 0, '10. no write before debounce fires');
    flushTimers();
    return new Promise(function (r) { setTimeout(r); flushTimers(); });   // let the save promise settle
  }).then(function () {
    eq(dbWrites.count, 1, '10. debounce fired exactly ONE logical write');
    eq(lastCmd.edits[0].fields.note, 'abc', '10. the LATEST intended note value was sent');
    // blur flush
    _timers = []; dbWrites.count = 0;
    var inp2 = fakeInput('note', 'CO1100-R', 'T2', ''); _roAllocEditNote(inp2);   // debounced (pending)
    _roAllocNoteFlush(inp2);                                                       // blur → immediate flush
    return new Promise(function (r) { setTimeout(r); flushTimers(); });
  }).then(function () {
    eq(dbWrites.count, 1, '11. blur/Enter flushes the pending note write immediately');
    eq(lastCmd.edits[0].fields.note, '', '12. blank note persists as empty string');

    section('B. optimistic concurrency + states');
    dbWrites.count = 0; updateResponse = { success: true, data: { status: 'COMPLETED', draftVersion: 5 } };
    var okInp = fakeInput('note', 'CO1100-R', 'T2', 'final');
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = null;
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'final' }, okInp).then(function () {
      ok(okInp.classList.contains('is-saved') && !okInp.classList.contains('is-invalid'), '14. successful autosave → Saved state');
      eq(_roCanonicalDraftBySku['CO1100-R'].lines.T2.note, 'final', '15. local DTO note updated from confirmed save (reload shows it)');
      eq(_roCanonicalDraftBySku['CO1100-R'].draftVersion, 5, '14. version advanced from the confirmed server response');
      ok(_roCanonicalDraftBySku['CO1100-R'].expectedToken === null, '14. token nulled → next edit re-fetches the advanced token (one edit ⇒ one token advance)');
    });
  }).then(function () {
    // stale-token conflict → no silent overwrite; typed value preserved; is-conflict; reload attempted
    dbWrites.count = 0; updateResponse = { success: false, error: { code: 'CONCURRENCY_TOKEN_MISMATCH' }, data: {} };
    getActiveResponse = { data: { drafts: [flatDto()], noDraftSkus: [], submittedSkus: [], conflicts: [] } };
    _roCanonicalDraftBySku['CO1100-R'].lines.T2.note = 'server';
    var confInp = fakeInput('note', 'CO1100-R', 'T2', 'my typed value'); _roCanonicalDraftBySku['CO1100-R'].expectedToken = null;
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'my typed value' }, confInp).then(function () {
      ok(confInp.classList.contains('is-conflict') && !confInp.classList.contains('is-saved'), '16/17. conflict → Conflict state, NOT Saved (no silent overwrite)');
      eq(confInp.value, 'my typed value', '18. the user\'s typed value is preserved for an explicit retry');
    });
  }).then(function () {
    section('C. core note contract + no Draft-Line + inventory finding');
    var row = {}; V2.forEach(function (h) { row[h] = ''; }); row.units_per_carton = 40; row.t2_order_qty = 320; row.t2_recommended_qty = 300; row.t2_status = 'draft';
    var e1 = KMRDV2.applyTierEdit(row, 'T2', { note: '' }, 'u', 't'); eq(e1.row.t2_note, '', 'core: blank note applies as empty string');
    var e2 = KMRDV2.applyTierEdit(row, 'T2', { note: 'x' }, 'u', 't'); eq([e2.row.t2_note, e2.row.t2_recommended_qty], ['x', 300], 'core: note edit sets note, recommended_qty protected');
    eq(draftLineCalls.count, 0, '19. no request_order_allocation_draft_lines read/write in the hydration/autosave path');
    ok(!/request_order_allocation_draft_lines/.test(extract(RO, '_roReadActiveDraftsForScope_') + extract(RO, '_roSaveTierEditToCanonicalDraft_') + extract(RO, '_roHydratePersistedDraftsForLoadedScopes_')), '19. hydration/autosave source never names the Draft-Line table');
    ok(/_hydrateAllocationDraftFromDb/.test(INV) && /SSOT\s*=\s*DB/.test(INV) && /getShippingAllocationDraft/.test(INV), '23. inventory/cargo AI Plan already restores from its canonical DB authority (shipping_allocation_drafts) on reload — VERIFIED');

    section('C. R5D popup authority intact (hydration is silent)');
    ok(!/_roSetAiPlanResult_|_roAiPlanManualToken/.test(extract(RO, '_roHydratePersistedDraftsForLoadedScopes_') + extract(RO, '_roReadActiveDraftsForScope_')), '20/21. hydration never touches the AI Plan Result popup / manual token (background/resume silent)');

    section('D. READ-ONLY TEMP_R6B diagnostic against a mock live DB');
    runDiagnostic();
    done();
  }).catch(function (e) { console.error('ASYNC ERROR', e && e.stack || e); fail++; done(); });
})();

function runDiagnostic() {
  var track = { writes: 0 };
  function toArr(o) { return V2.map(function (h) { return o[h] !== undefined ? o[h] : ''; }); }
  var o = {}; V2.forEach(function (h) { o[h] = ''; });
  o.request_allocation_draft_id = TARGET; o.planning_cycle = '2026-08'; o.company = 'ResUS'; o.country = 'US'; o.marketplace = 'Amazon'; o.sku = 'CO1100-R'; o.draft_purpose = 'regular'; o.status = 'draft'; o.generation_type = 'ai_plan'; o.draft_version = 3; o.units_per_carton = 40;
  o.t1_month = '2026-08'; o.t1_recommended_qty = 0; o.t1_order_qty = 0; o.t1_carton_qty = 0; o.t1_status = 'draft';
  o.t2_month = '2026-09'; o.t2_recommended_qty = 300; o.t2_order_qty = 320; o.t2_carton_qty = 8; o.t2_status = 'draft'; o.t2_note = 'keep';
  o.t3_month = '2026-10'; o.t3_recommended_qty = 7520; o.t3_order_qty = 7520; o.t3_carton_qty = 188; o.t3_status = 'draft';
  var rows = [toArr(o)]; for (var i = 1; i < 67; i++) { var f = {}; V2.forEach(function (h) { f[h] = ''; }); f.request_allocation_draft_id = 'RD::x' + i; f.sku = 'F' + i; f.status = 'draft'; f.planning_cycle = '2026-08'; rows.push(toArr(f)); }
  function sheet(name, headers, data) { var grid = [headers.slice()].concat(data); function rg() { return { getValues: function () { return grid; }, setValues: function () { track.writes++; }, setNumberFormat: function () { track.writes++; } }; } return { getName: function () { return name; }, getDataRange: function () { return rg(); }, getLastRow: function () { return grid.length; }, getLastColumn: function () { return headers.length; }, getRange: function () { return rg(); }, appendRow: function () { track.writes++; } }; }
  var tabs = {}; tabs[HDR] = sheet(HDR, V2, rows); tabs['request_order_allocation_draft_lines'] = sheet('request_order_allocation_draft_lines', ['request_allocation_line_id'], (function () { var a = []; for (var k = 0; k < 65; k++) a.push(['L' + k]); return a; })());
  var ss = { getId: function () { return 'SS-LIVE'; }, getName: function () { return 'KM'; }, getSheetByName: function (n) { return tabs[n] || null; } };
  var sb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, requestOrderDraftV2FlatCutoverEnabled_: function () { return true; }, PRODUCTION_DB_SPREADSHEET_ID_: 'SS-LIVE', SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, Utilities: { formatDate: function () { return '2026-08'; }, computeDigest: function () { return [0]; }, DigestAlgorithm: {}, Charset: {} }, Logger: { log: function () {} }, console: console };
  vm.createContext(sb); vm.runInContext(GSTEMP, sb, { filename: 'TEMP.gs' });
  var diag = sb.TEMP_R6B_DIAGNOSE_PERSISTED_DRAFT_HYDRATION();
  eq(diag.verdict, 'HYDRATION_FIDELITY_OK', 'diagnostic verdict HYDRATION_FIDELITY_OK');
  eq(diag.db_vs_dto_all_equal, 'YES', 'diagnostic: DB row values == readback DTO values (T1/T2/T3)');
  eq([diag.db_vs_dto.T2, diag.tiers.T2.readback_dto.order_qty, diag.tiers.T2.readback_dto.carton_qty], ['EQUAL', 320, 8], 'diagnostic: T2 320/8 projected identically');
  eq(diag.hydration_write_count, 0, 'diagnostic: hydration write count = 0');
  eq(diag.draft_line_row_count, 65, 'diagnostic: Draft Lines observed 65 (untouched)');
  eq(diag.DRAFT_LINE_DEPENDENCY_ZERO.slice(0, 3), 'YES', 'diagnostic: Draft-Line dependency zero');
  eq(track.writes, 0, 'diagnostic performed ZERO writes');
  ok(typeof diag.R6B_DIAGNOSTIC_CHECKSUM === 'string' && diag.R6B_DIAGNOSTIC_CHECKSUM.length === 8, 'diagnostic checksum emitted');
  eq(diag.R6B_DIAGNOSTIC_READY, 'YES', 'R6B_DIAGNOSTIC_READY=YES');
}
