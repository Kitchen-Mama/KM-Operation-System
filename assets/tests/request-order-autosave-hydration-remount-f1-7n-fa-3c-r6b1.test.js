// Kitchen Mama Operation System — R6B1 autosave live-wiring + fast hydration + remount recovery — F1-7N-FA-3C-R6B1.
// Run: node assets/tests/request-order-autosave-hydration-remount-f1-7n-fa-3c-r6b1.test.js
// Extracts the REAL request-order.js hydration/autosave/state functions into a fake DB/DOM/timer harness and drives
// them through the actual event-handler path (_roAllocEditNote / _roAllocNoteFlush = the inline oninput/onblur). No
// 'use strict' (top-level eval declares into module scope). D3 mount/empty-message wiring is asserted at source.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6B1 AUTOSAVE + HYDRATION + REMOUNT (F1-7N-FA-3C-R6B1): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }

var RO = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');
var TARGET = 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1100-R';
function extract(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), depth = 0; for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

// ---- harness state ----
var requestOrderState = { data: [], filters: {}, allocEdits: {} };
var window = {}, renderCount = 0;
function renderRequestOrderTable() { renderCount++; }
function _roEffectiveOrderQty() { return ''; }
var _roCanonicalDraftBySku = {}, _roNoDraftSkus = {}, _roSubmittedSkus = {}, _roHydrateSeq = 0, _roHydrateReqCount = 0, _roLastAutosaveOutcome = null, _roLastEmptyReason = null;
var _roHydrationStatus = 'IDLE', _roDraftDtoCache = {}, _roMountEpoch = 0, _roBaseDataStatus = 'IDLE', _roDraftEditQueue_ = {}, _roAutosaveTimers_ = {}, _roAutosavePending_ = {};
var _timers = [];
function setTimeout(fn) { _timers.push(fn); return _timers.length; }
function clearTimeout(id) { if (id) _timers[id - 1] = null; }
function flushTimers() { var t = _timers.slice(); _timers = []; t.forEach(function (fn) { if (fn) fn(); }); }
// drain: fire any pending debounce timers + settle the multi-await save chain (token fetch → update → then + the
// per-draft queue hop). Re-flush timers each turn in case a save schedules one.
function tick() { flushTimers(); var p = Promise.resolve(); for (var k = 0; k < 20; k++) p = p.then(function () { flushTimers(); }); return p; }
var lastCmd = null, dbWrites = { count: 0 }, tokenFetches = { count: 0 }, activeCalls = { count: 0 }, draftLineCalls = { count: 0 };
var getActiveResponse = null, updateResponse = null;
var db = {
  getActiveRequestOrderDrafts: function () { activeCalls.count++; return Promise.resolve(getActiveResponse); },
  getRecommendationDraftToken: function () { tokenFetches.count++; return Promise.resolve({ success: true, data: { expectedToken: { draft_version: 3, userEditFingerprint: 'fp' + tokenFetches.count } } }); },
  updateRecommendationDecisionLocked: function (cmd) { lastCmd = cmd; dbWrites.count++; return Promise.resolve(updateResponse); },
  getShippingAllocationDraftLines: function () { draftLineCalls.count++; return []; }
};
window.KM = { DB: db };
var _r6bFns = ['_roScopeStr_', '_roScopesFromLoadedData_', '_roScopeKey3_', '_roCanonicalScope_', '_roCanonKey_', '_roCanonicalRowFor_',
  '_roIsCanonicalDraftSku_', '_roDraftUiState_', '_roRowOrderQtyDisplay_', '_roRowNoteDisplay_', '_roV2IsFlatDraft_', '_roV2NormalizeFlatDraft_',
  '_roReadActiveDraftsForScope_', '_roHydratePersistedDraftsForLoadedScopes_', '_roLoadCanonicalDraftsForScope_', '_roBuildTierEditCommand_',
  '_roSetFieldState_', '_roClassifyEditResult_', '_roSaveTierEditToCanonicalDraft_', '_roSaveTierEditCore_', '_roEnsureDraftToken_', '_roAutosaveKey_', '_roAutosaveDebounce_',
  '_roAutosaveFlush_', '_roAllocEnsure', '_roAllocEditNote', '_roAllocNoteFlush', '_roNotify_', '_roDebugSnapshot_'].map(function (n) { return extract(RO, n); }).join('\n');
eval(_r6bFns);

function flatDto(scopeSku, over) {
  over = over || {};
  return { draftId: 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=' + scopeSku, draftVersion: 3, status: 'draft',
    scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: scopeSku }, unitsPerCarton: 40,
    tiers: [ { tier: 'T1', month: '2026-08', orderQty: 0, recommendedQty: 0, cartonQty: 0, status: 'draft', note: '' },
      { tier: 'T2', month: '2026-09', orderQty: over.t2q != null ? over.t2q : 320, recommendedQty: 300, cartonQty: 8, status: 'draft', note: over.t2note || '' },
      { tier: 'T3', month: '2026-10', orderQty: 7520, recommendedQty: 7520, cartonQty: 188, status: 'draft', note: '' } ] };
}
function fakeInput(field, sku, bucket, value) { var cls = {}; return { value: value, title: '', dataset: { sku: sku, bucket: bucket, field: field, country: 'US', marketplace: 'Amazon', month: '2026-09' }, classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } } }; }

(function run() {
  section('B. per-SKU allocation UI state (fixes D2 misleading blank)');
  _roHydrationStatus = 'LOADING'; _roCanonicalDraftBySku = {}; _roNoDraftSkus = {};
  eq(_roDraftUiState_('CO1100-R'), 'DRAFT_LOADING', '11/12. during LOADING the SKU is DRAFT_LOADING (inputs disabled, never blank-editable)');
  _roHydrationStatus = 'LOADED'; _roNoDraftSkus = { 'CO1100-R': true };
  eq(_roDraftUiState_('CO1100-R'), 'NO_SAVED_DRAFT', '14. explicit no-saved-draft state (never a Suggested→Order Qty fallback)');
  _roNoDraftSkus = {}; _roCanonicalDraftBySku = { 'CO1100-R': { conflict: true } };
  eq(_roDraftUiState_('CO1100-R'), 'DRAFT_CONFLICT', 'duplicate → DRAFT_CONFLICT (fail closed)');
  _roCanonicalDraftBySku = { 'CO1100-R': { draftId: TARGET, lines: {} } };
  eq(_roDraftUiState_('CO1100-R'), 'DRAFT_LOADED', '13. resolved draft → DRAFT_LOADED (DB values shown together)');
  _roCanonicalDraftBySku = {}; _roNoDraftSkus = {}; _roHydrationStatus = 'IDLE';
  eq(_roDraftUiState_('MANUAL-SKU'), 'MANUAL', 'a SKU outside any AI read-back keeps the ordinary MANUAL flow (unchanged)');

  section('B. hydration is scope-based, deduped, cached, atomic');
  requestOrderState.data = []; for (var i = 0; i < 10; i++) requestOrderState.data.push({ sku: 'S' + i, company: 'ResUS', country: 'US', marketplace: 'Amazon' });
  getActiveResponse = { data: { drafts: [flatDto('S0'), flatDto('S1')], noDraftSkus: [], submittedSkus: [], conflicts: [] } };
  activeCalls.count = 0; _roDraftDtoCache = {}; _roHydrateSeq = 0;
  _roHydratePersistedDraftsForLoadedScopes_().then(function () {
    eq(activeCalls.count, 1, '22. 10 SKUs in ONE scope → exactly ONE getActive (scope-based, NOT per-SKU)');
    eq(_roHydrationStatus, 'LOADED', 'hydration status → LOADED');
    ok(_roDraftDtoCache['RESUS|US|AMAZON'], 'confirmed DTOs cached per scope for the session');
    // second call served from cache immediately (LOADED synchronously before the refresh read)
    activeCalls.count = 0; var p = _roHydratePersistedDraftsForLoadedScopes_();
    eq(_roHydrationStatus, 'LOADED', 'cached re-entry shows LOADED immediately (no blank/loading flash)');
    return p;
  }).then(function () {
    eq(activeCalls.count, 1, 'cached re-entry still refreshes ONCE in the background');

    section('A. NOTE autosave through the REAL handler path (input→debounce→one write)');
    _roCanonicalDraftBySku = {}; var a = {}, n = {}, s = {};
    getActiveResponse = { data: { drafts: [flatDto('CO1100-R')], noDraftSkus: [], submittedSkus: [], conflicts: [] } };
    return _roReadActiveDraftsForScope_({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }, a, n, s).then(function () { _roCanonicalDraftBySku = a; });
  }).then(function () {
    _timers = []; dbWrites.count = 0; updateResponse = { success: true, data: { status: 'COMPLETED', draftVersion: 4 } };
    var inp = fakeInput('note', 'CO1100-R', 'T2', '1'); _roAllocEditNote(inp); inp.value = '12'; _roAllocEditNote(inp); inp.value = '123'; _roAllocEditNote(inp);
    eq(_timers.filter(Boolean).length, 1, '1. rendered Note input → debounce collapses 3 keystrokes to ONE pending write');
    eq(dbWrites.count, 0, '1. no write before debounce fires');
    flushTimers(); return tick();
  }).then(function () {
    eq([dbWrites.count, lastCmd.edits[0].fields.note], [1, '123'], '1. exactly ONE API edit with the latest value "123" (D1 fixed — reaches updateRecommendationDecisionLocked)');
    // blur flush
    _timers = []; dbWrites.count = 0; var inp2 = fakeInput('note', 'CO1100-R', 'T2', 'x'); _roAllocEditNote(inp2); _roAllocNoteFlush(inp2); return tick();
  }).then(function () {
    eq(dbWrites.count, 1, '2. blur flushes the pending Note write immediately');
    // Enter path = keydown Enter → this.blur() → onblur → _roAllocNoteFlush ONCE. A pending debounce is CLEARED by the
    // flush (not fired again), so a debounce+Enter yields exactly ONE write.
    _timers = []; dbWrites.count = 0; var inp3 = fakeInput('note', 'CO1100-R', 'T2', 'ent'); _roAllocEditNote(inp3); _roAllocNoteFlush(inp3); return tick();
  }).then(function () {
    eq(dbWrites.count, 1, '3. Enter (→blur→flush) fires exactly ONCE — the pending debounce is cleared, never a second write');
    _timers = []; dbWrites.count = 0; var inp4 = fakeInput('note', 'CO1100-R', 'T2', ''); _roAllocEditNote(inp4); _roAllocNoteFlush(inp4); return tick();
  }).then(function () {
    eq([dbWrites.count, lastCmd.edits[0].fields.note], [1, ''], '7. empty Note clears the DB value (note:"" sent)');

    section('A. confirmation states — Saved only after server confirm; failure never Saved');
    dbWrites.count = 0; updateResponse = { success: true, data: { status: 'COMPLETED', draftVersion: 6 } };
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = null; var okInp = fakeInput('note', 'CO1100-R', 'T2', 'done');
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'done' }, okInp).then(function () {
      ok(okInp.classList.contains('is-saved'), '5/10. Saved appears ONLY after the confirmed server response');
      eq([_roCanonicalDraftBySku['CO1100-R'].lines.T2.note, _roCanonicalDraftBySku['CO1100-R'].draftVersion], ['done', 6], '5. DB-confirmed note updates local DTO + version/token');
    });
  }).then(function () {
    updateResponse = { success: false, error: { code: 'SERVER_ERROR' }, data: {} }; var failInp = fakeInput('note', 'CO1100-R', 'T2', 'z');
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = null;
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'z' }, failInp).then(function () {
      ok(!failInp.classList.contains('is-saved') && failInp.classList.contains('is-invalid'), '8. a failed request NEVER shows Saved (Retry state)');
      eq(failInp.value, 'z', '8/11. the typed value is retained on failure');
    });
  }).then(function () {
    updateResponse = { success: false, error: { code: 'CONCURRENCY_TOKEN_MISMATCH' }, data: {} };
    getActiveResponse = { data: { drafts: [flatDto('CO1100-R')], noDraftSkus: [], submittedSkus: [], conflicts: [] } };
    var cf = fakeInput('note', 'CO1100-R', 'T2', 'typed'); _roCanonicalDraftBySku['CO1100-R'].expectedToken = null;
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'typed' }, cf).then(function () {
      ok(cf.classList.contains('is-conflict') && cf.value === 'typed', '9. conflict → retains typed value + Retry (no silent overwrite)');
    });
  }).then(function () {
    section('A12. concurrent same-draft edits are serialized (no self-conflict)');
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = null; tokenFetches.count = 0; dbWrites.count = 0; _roDraftEditQueue_ = {};
    updateResponse = { success: true, data: { status: 'COMPLETED', draftVersion: 7 } };
    var i1 = fakeInput('qty', 'CO1100-R', 'T2', '360'), i2 = fakeInput('note', 'CO1100-R', 'T2', 'serial');
    var p1 = _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { order_qty: 360 }, i1);
    var p2 = _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'serial' }, i2);
    return Promise.all([p1, p2, tick().then(tick).then(tick)]).then(function () {
      eq(dbWrites.count, 2, 'A12. both edits wrote (serialized, both COMPLETED)');
      ok(tokenFetches.count >= 2, 'A12. the second edit re-fetched a fresh token after the first advanced it (no stale self-conflict)');
    });
  }).then(function () {
    section('A. Order Qty carton is backend-derived (frontend never authors carton_qty)');
    eq(_roBuildTierEditCommand_(TARGET, '2026-09', 'T2', { order_qty: 360 }, {}).edits[0].fields, { order_qty: 360 }, '10. Order Qty edit sends order_qty only — carton_qty is backend-derived');

    section('observability + no Draft-Line');
    var snap = _roDebugSnapshot_();
    ok(snap && typeof snap.hydrationRequestCount === 'number' && 'lastAutosaveOutcome' in snap && !('token' in snap), 'debug snapshot has counts + outcome, no raw token/secret');
    eq(draftLineCalls.count, 0, '25. zero request_order_allocation_draft_lines read/write across hydration + autosave');

    section('D3 (source) — remount recovery + state-aware empty message');
    ok(/_roMountEpoch\+\+;\s*\n\s*_opFirstLayerRegion = null;/.test(RO), 'D3: each mount bumps epoch AND rebinds the composer region to the current DOM');
    ok(/_roBaseDataStatus === 'LOADING'[\s\S]{0,120}Loading Request Order data/.test(RO), 'D3: LOADING shows a loading message (not a disconnect)');
    ok(/else if \(!_roUseDb\(\)\)[\s\S]{0,900}Connect the Operation DB/.test(RO), 'D3: the "Connect Operation DB" message ONLY when the DB is genuinely unavailable (R6C: now provider-ERROR-gated)');
    ok(/No results for the current scope/.test(RO), 'D3: legitimate empty result has a distinct message');
    ok(/_roUseDb\(\) && \(!requestOrderState\.data[\s\S]{0,120}initRequestOrderSection\(\);/.test(RO), 'D3/D6: Search recovers a remount-empty page by re-running the base load (no hard refresh)');
    ok(/_roBaseDataStatus = 'ERROR'/.test(RO) && /ro-error-state/.test(RO), 'D3: a real API error is distinct from an empty result');

    section('D — preserved contracts (source)');
    ok(!/_roSetAiPlanResult_|_roAiPlanManualToken/.test(extract(RO, '_roHydratePersistedDraftsForLoadedScopes_') + extract(RO, '_roReadActiveDraftsForScope_')), '24. hydration never opens the AI Plan Result popup / touches the manual token');
    ok(!/request_order_allocation_draft_lines/.test(extract(RO, '_roHydratePersistedDraftsForLoadedScopes_') + extract(RO, '_roSaveTierEditCore_')), '25. hydration/autosave source never names the Draft-Line table');

    done();
  }).catch(function (e) { console.error('ASYNC ERROR', e && e.stack || e); fail++; done(); });
})();
