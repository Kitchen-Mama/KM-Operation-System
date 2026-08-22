// Kitchen Mama Operation System — R6B2 all-tier Note + live flat-result interpretation + real SPA remount + gap/
// suggested atomicity + inventory parity — F1-7N-FA-3C-R6B2.
// Run: node assets/tests/request-order-alltier-note-flatresult-remount-f1-7n-fa-3c-r6b2.test.js
//
// The R6B/R6B1 tests passed while production FAILED because their fake DB returned the LEGACY edit result shape
// ({data:{status:'COMPLETED'}}). The LIVE MONTHLY_ORDER cutover routes edits to the FLAT V2 core (KMRDV2P.
// editMonthlyFlat) whose result is {success,wrote,outcome:'EDITED',results[],result:{writeOutcome}} — NO status field.
// This suite drives the REAL rendered note handlers through the FLAT response shape (the live path) for ALL THREE tiers,
// reproduces the stale-token cascade that stuck the live draft at version 3 with empty notes, and proves it is closed.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6B2 ALL-TIER NOTE + FLAT RESULT + REMOUNT + PARITY (F1-7N-FA-3C-R6B2): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }

var ROOT = path.join(__dirname, '..');
var RO = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');
var IR = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'inventory-replenishment.js'), 'utf8').replace(/\r\n/g, '\n');
function extract(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), depth = 0; for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

// ---- harness state (real functions eval'd at top level; no 'use strict' in the source file) ----
var requestOrderState = { data: [], filters: {}, allocEdits: {}, searched: true };
var window = {}, renderCount = 0;
function renderRequestOrderTable() { renderCount++; }
function _roEffectiveOrderQty() { return ''; }
function _roUseDb() { return true; }
var _opFirstLayerSeq = 0;
var _roCanonicalDraftBySku = {}, _roNoDraftSkus = {}, _roSubmittedSkus = {}, _roHydrateSeq = 0, _roHydrateReqCount = 0, _roLastAutosaveOutcome = null, _roLastEmptyReason = null;
var _roHydrationStatus = 'IDLE', _roDraftDtoCache = {}, _roMountEpoch = 0, _roBaseDataStatus = 'IDLE', _roDraftEditQueue_ = {}, _roAutosaveTimers_ = {}, _roAutosavePending_ = {};
var _timers = [];
function setTimeout(fn) { _timers.push(fn); return _timers.length; }
function clearTimeout(id) { if (id) _timers[id - 1] = null; }
function flushTimers() { var t = _timers.slice(); _timers = []; t.forEach(function (fn) { if (fn) fn(); }); }
function tick() { flushTimers(); var p = Promise.resolve(); for (var k = 0; k < 24; k++) p = p.then(function () { flushTimers(); }); return p; }
var lastCmd = null, dbWrites = { count: 0 }, tokenFetches = { count: 0 }, activeCalls = { count: 0 }, draftLineCalls = { count: 0 };
var getActiveResponse = null, updateResponse = null, tokenVersion = 3;
var db = {
  getActiveRequestOrderDrafts: function () { activeCalls.count++; return Promise.resolve(getActiveResponse); },
  getRecommendationDraftToken: function () { tokenFetches.count++; return Promise.resolve({ success: true, data: { expectedToken: { draft_version: tokenVersion, userEditFingerprint: 'fp' + tokenFetches.count } } }); },
  updateRecommendationDecisionLocked: function (cmd) { lastCmd = cmd; dbWrites.count++; return Promise.resolve(updateResponse); },
  getShippingAllocationDraftLines: function () { draftLineCalls.count++; return []; }
};
window.KM = { DB: db };
var _fns = ['_roScopeStr_', '_roScopesFromLoadedData_', '_roScopeKey3_', '_roCanonicalScope_', '_roCanonKey_', '_roCanonicalRowFor_',
  '_roIsCanonicalDraftSku_', '_roDraftUiState_', '_roRowOrderQtyDisplay_', '_roRowNoteDisplay_', '_roV2IsFlatDraft_', '_roV2NormalizeFlatDraft_',
  '_roReadActiveDraftsForScope_', '_roHydratePersistedDraftsForLoadedScopes_', '_roLoadCanonicalDraftsForScope_', '_roBuildTierEditCommand_',
  '_roSetFieldState_', '_roClassifyEditResult_', '_roSaveTierEditToCanonicalDraft_', '_roSaveTierEditCore_', '_roEnsureDraftToken_', '_roAutosaveKey_',
  '_roAutosaveDebounce_', '_roAutosaveFlush_', '_roAllocEnsure', '_roAllocEditNote', '_roAllocNoteFlush', '_roNotify_', '_roDebugSnapshot_'].map(function (n) { return extract(RO, n); }).join('\n');
eval(_fns);

var TARGET = 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1100-R';
function flatDto(sku) {
  return { draftId: 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=' + sku, draftVersion: 3, status: 'draft',
    scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: sku }, unitsPerCarton: 40,
    tiers: [ { tier: 'T1', month: '2026-08', orderQty: 0, recommendedQty: 0, cartonQty: 0, status: 'draft', note: '' },
      { tier: 'T2', month: '2026-09', orderQty: 320, recommendedQty: 300, cartonQty: 8, status: 'draft', note: '' },
      { tier: 'T3', month: '2026-10', orderQty: 7520, recommendedQty: 7520, cartonQty: 188, status: 'draft', note: '' } ] };
}
var _MONTHS = { T1: '2026-08', T2: '2026-09', T3: '2026-10' };
function noteInput(sku, bucket, value) { var cls = {}; return { value: value, title: '', dataset: { sku: sku, bucket: bucket, field: 'note', country: 'US', marketplace: 'Amazon', month: _MONTHS[bucket] }, classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } } }; }
// The LIVE flat-V2 edit result (KMRDV2P.editMonthlyFlat → rpoEditMonthlyFlatResult_ → {success, data: flatRes}).
function flatOk(bucket) { return { success: true, data: { wrote: true, outcome: 'EDITED', draftId: TARGET, results: [{ tier: bucket, ok: true }], result: { writeOutcome: 'WRITE_COMMITTED_VERIFIED' } } }; }
function flatReadbackFailed(bucket) { return { success: true, data: { wrote: true, outcome: 'EDITED', draftId: TARGET, results: [{ tier: bucket, ok: true }], result: { writeOutcome: 'WRITE_COMMITTED_READBACK_FAILED' } } }; }
function flatConflict() { return { success: false, data: { wrote: false, outcome: 'CONFLICT', draftId: TARGET, results: [], result: { writeOutcome: 'WRITE_REJECTED' } } }; }
function flatTerminal(bucket) { return { success: false, data: { wrote: false, outcome: 'NOT_EXECUTED', draftId: TARGET, results: [{ tier: bucket, ok: false, reason: 'TIER_TERMINAL' }] } }; }
function legacyOk() { return { success: true, data: { status: 'COMPLETED', reason: null } }; }

(function run() {
  section('Objective A — shape-agnostic edit-result classifier (LEGACY + LIVE FLAT)');
  // The exact live-path shape carries NO data.status — the pre-R6B2 predicate (d.status==='COMPLETED') would MISS it.
  ok(!('status' in flatOk('T2').data), 'guard: the LIVE flat edit result carries NO data.status field (the pre-R6B2 miss)');
  var cf = _roClassifyEditResult_(flatOk('T2'));
  ok(cf.cleanSaved && !cf.conflict && !cf.terminal && !cf.committedUnverified, 'FLAT {wrote:true,outcome:EDITED,WRITE_COMMITTED_VERIFIED} → cleanSaved (the bug that stuck notes empty is closed)');
  ok(_roClassifyEditResult_(legacyOk()).cleanSaved, 'LEGACY {status:COMPLETED} → cleanSaved (backward compatible)');
  var cru = _roClassifyEditResult_(flatReadbackFailed('T2'));
  ok(cru.committedUnverified && !cru.cleanSaved, 'FLAT committed-but-readback-failed → committedUnverified, NEVER a clean Saved (R5C truthful semantics)');
  var cc = _roClassifyEditResult_(flatConflict());
  ok(cc.conflict && !cc.cleanSaved, 'FLAT {outcome:CONFLICT} → conflict (was misread as generic failure → no re-read → stale-token cascade)');
  var ct = _roClassifyEditResult_(flatTerminal('T2'));
  ok(ct.terminal && !ct.cleanSaved, 'FLAT tier reason TIER_TERMINAL → terminal (review required)');
  ok(!_roClassifyEditResult_({ success: false, data: {} }).cleanSaved, 'a bare failure is neither saved nor conflict → generic retry');

  section('Objective A — ALL THREE tiers persist independently through the REAL rendered note handlers (FLAT path)');
  requestOrderState.data = [{ sku: 'CO1100-R', company: 'ResUS', country: 'US', marketplace: 'Amazon' }];
  getActiveResponse = { data: { drafts: [flatDto('CO1100-R')], noDraftSkus: [], submittedSkus: [], conflicts: [] } };
  _roCanonicalDraftBySku = {};
  var a = {}, n = {}, s = {};
  _roReadActiveDraftsForScope_({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }, a, n, s).then(function () {
    _roCanonicalDraftBySku = a;
    // T1
    _timers = []; dbWrites.count = 0; tokenVersion = 3; _roCanonicalDraftBySku['CO1100-R'].expectedToken = null;
    updateResponse = flatOk('T1');
    var i1 = noteInput('CO1100-R', 'T1', 'note-one'); _roAllocEditNote(i1); _roAllocNoteFlush(i1);
    return tick().then(function () {
      eq([lastCmd.edits[0].naturalKey.request_bucket, lastCmd.edits[0].naturalKey.request_month, lastCmd.edits[0].fields.note], ['T1', '2026-08', 'note-one'], '1. rendered T1 note → command for T1 (month 2026-08) with note-one');
      ok(i1.classList.contains('is-saved'), '1. T1 shows Saved on the FLAT confirmed response');
      eq([_roCanonicalDraftBySku['CO1100-R'].lines.T1.note, _roCanonicalDraftBySku['CO1100-R'].lines.T2.note, _roCanonicalDraftBySku['CO1100-R'].lines.T3.note], ['note-one', '', ''], '1. ONLY T1 note persisted (T2/T3 untouched)');
    });
  }).then(function () {
    // T2
    _timers = []; dbWrites.count = 0; _roCanonicalDraftBySku['CO1100-R'].expectedToken = null; updateResponse = flatOk('T2');
    var i2 = noteInput('CO1100-R', 'T2', 'note-two'); _roAllocEditNote(i2); _roAllocNoteFlush(i2);
    return tick().then(function () {
      eq([lastCmd.edits[0].naturalKey.request_bucket, lastCmd.edits[0].fields.note], ['T2', 'note-two'], '2. rendered T2 note → command for T2 with note-two');
      eq([_roCanonicalDraftBySku['CO1100-R'].lines.T1.note, _roCanonicalDraftBySku['CO1100-R'].lines.T2.note, _roCanonicalDraftBySku['CO1100-R'].lines.T3.note], ['note-one', 'note-two', ''], '2. editing T2 wrote ONLY T2 (T1 kept, T3 untouched)');
    });
  }).then(function () {
    // T3 — the exact "editing T3 must never write T2" contract
    _timers = []; dbWrites.count = 0; _roCanonicalDraftBySku['CO1100-R'].expectedToken = null; updateResponse = flatOk('T3');
    var i3 = noteInput('CO1100-R', 'T3', 'note-three'); _roAllocEditNote(i3); _roAllocNoteFlush(i3);
    return tick().then(function () {
      eq([lastCmd.edits[0].naturalKey.request_bucket, lastCmd.edits[0].naturalKey.request_month, lastCmd.edits[0].fields.note], ['T3', '2026-10', 'note-three'], '3. rendered T3 note → command for T3 (month 2026-10)');
      eq([_roCanonicalDraftBySku['CO1100-R'].lines.T2.note, _roCanonicalDraftBySku['CO1100-R'].lines.T3.note], ['note-two', 'note-three'], '3/8. editing T3 NEVER wrote T2 (tier indexes cannot collide)');
    });
  }).then(function () {
    section('Objective A — blank clears ONLY the selected tier');
    _timers = []; _roCanonicalDraftBySku['CO1100-R'].expectedToken = null; updateResponse = flatOk('T2');
    var ib = noteInput('CO1100-R', 'T2', ''); _roAllocEditNote(ib); _roAllocNoteFlush(ib);
    return tick().then(function () {
      eq(lastCmd.edits[0].fields.note, '', '7. blank T2 note → note:"" (deliberate clear, not omitted)');
      eq([_roCanonicalDraftBySku['CO1100-R'].lines.T1.note, _roCanonicalDraftBySku['CO1100-R'].lines.T2.note, _roCanonicalDraftBySku['CO1100-R'].lines.T3.note], ['note-one', '', 'note-three'], '7. blank cleared ONLY T2 (T1/T3 preserved)');
    });
  }).then(function () {
    section('Objective A/B — the LIVE stale-token cascade (v3 stuck, notes empty) is CLOSED');
    // Reproduce: a qty edit commits on the backend (FLAT shape, no status). Pre-R6B2 this was misread as "Save failed"
    // so the token was NEVER nulled → the following note edit reused the stale token → backend CONFLICT → note never
    // committed (draft stuck at v3, notes empty). Now the qty edit is correctly Saved + token nulled → note re-fetches.
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = { draft_version: 2, userEditFingerprint: 'stale' };  // a stale cached token
    tokenFetches.count = 0; dbWrites.count = 0; _roDraftEditQueue_ = {}; tokenVersion = 4;
    updateResponse = flatOk('T2');
    var qi = noteInput('CO1100-R', 'T2', ''); qi.dataset.field = 'qty';
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { order_qty: 360 }, qi).then(function () {
      ok(qi.classList.contains('is-saved'), 'cascade: the qty edit (FLAT success) is now correctly Saved (was a false "Save failed")');
      eq(_roCanonicalDraftBySku['CO1100-R'].expectedToken, null, 'cascade: a confirmed edit NULLS the cached token (the exact fix that breaks the stale-token chain)');
    });
  }).then(function () {
    dbWrites.count = 0; tokenFetches.count = 0; updateResponse = flatOk('T2');
    var ni = noteInput('CO1100-R', 'T2', 'after-qty');
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'after-qty' }, ni).then(function () {
      eq(tokenFetches.count, 1, 'cascade: the following note edit re-fetches a FRESH token (v4) — never reuses the stale v2');
      ok(ni.classList.contains('is-saved'), 'cascade: the note now COMMITS (no false CONFLICT) — the live "notes empty, v3 stuck" defect is closed');
      eq(_roCanonicalDraftBySku['CO1100-R'].lines.T2.note, 'after-qty', 'cascade: T2 note persisted to the local DTO after the qty edit');
    });
  }).then(function () {
    section('Objective A — Saved requires a CONFIRMED response; committed-unverified is NOT a clean Saved');
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = null; updateResponse = flatReadbackFailed('T2');
    getActiveResponse = { data: { drafts: [flatDto('CO1100-R')], noDraftSkus: [], submittedSkus: [], conflicts: [] } };
    var ru = noteInput('CO1100-R', 'T2', 'unver');
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'unver' }, ru).then(function () {
      ok(!ru.classList.contains('is-saved'), '5. a committed-but-unverified write NEVER shows a clean Saved (truthful)');
      eq(_roLastAutosaveOutcome, 'COMMITTED_UNVERIFIED', '5. outcome is COMMITTED_UNVERIFIED → a reconciling re-read is triggered');
    });
  }).then(function () {
    section('Objective B — hydrated token reuse: no redundant pre-write token fetch when a token is already cached');
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = { draft_version: 5, userEditFingerprint: 'cached' };  // adopted/hydrated token
    tokenFetches.count = 0; dbWrites.count = 0; updateResponse = flatOk('T2');
    var bi = noteInput('CO1100-R', 'T2', 'reuse');
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'reuse' }, bi).then(function () {
      eq([tokenFetches.count, dbWrites.count], [0, 1], '11/B. a cached token is REUSED (0 token fetch + 1 update) — optimistic concurrency kept, one fewer request');
    });
  }).then(function () {
    // adopt-forward: a response carrying a next token is adopted (skips the next pre-write fetch when supported)
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = null; updateResponse = { success: true, data: { wrote: true, outcome: 'EDITED', expectedToken: { draft_version: 9, userEditFingerprint: 'next' }, result: { writeOutcome: 'WRITE_COMMITTED_VERIFIED' } } };
    var ai = noteInput('CO1100-R', 'T2', 'adopt');
    return _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { note: 'adopt' }, ai).then(function () {
      eq(_roCanonicalDraftBySku['CO1100-R'].expectedToken, { draft_version: 9, userEditFingerprint: 'next' }, 'B. a returned next-token is ADOPTED (skips the next fetch) — "adopt the next valid token when supported"');
    });
  }).then(function () {
    section('Objective A12 — concurrent same-draft edits serialize with a refreshed token');
    _roCanonicalDraftBySku['CO1100-R'].expectedToken = null; tokenFetches.count = 0; dbWrites.count = 0; _roDraftEditQueue_ = {}; updateResponse = flatOk('T2');
    var p1 = _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T2', { order_qty: 360 }, noteInput('CO1100-R', 'T2', ''));
    var p2 = _roSaveTierEditToCanonicalDraft_('CO1100-R', 'T3', { note: 'z' }, noteInput('CO1100-R', 'T3', 'z'));
    return Promise.all([p1, p2, tick().then(tick)]).then(function () {
      eq(dbWrites.count, 2, 'A12/10. both same-draft edits wrote (serialized on the shared draftId)');
      ok(tokenFetches.count >= 2, 'A12. the second edit re-fetched a fresh token after the first nulled it (no self-conflict)');
    });
  }).then(function () {
    section('Objective A — carton is backend-derived (frontend never authors carton_qty)');
    eq(_roBuildTierEditCommand_(TARGET, '2026-09', 'T2', { order_qty: 360 }, {}).edits[0].fields, { order_qty: 360 }, '4. Order Qty edit sends order_qty ONLY — carton_qty is backend-recomputed');
    ok(!/carton/.test(JSON.stringify(_roBuildTierEditCommand_(TARGET, '2026-09', 'T2', { note: 'x' }, {}))), 'note edit never carries carton_qty');

    section('Objective D — Gap + Suggested share ONE authority (structurally atomic)');
    // Both cells read the SAME per-tier monthlyProjection via _roCanonTier; neither is gated differently.
    ok(/var gapStr = _opRecoFmtQty\(ct \? ct\.remainingGapQty : null, recoLoading\)/.test(RO), 'D: Gap ← ct.remainingGapQty with the shared recoLoading gate');
    ok(/var sugStr = _opRecoFmtQty\(ct \? ct\.suggestedOrderQty : null, recoLoading\)/.test(RO), 'D: Suggested ← ct.suggestedOrderQty from the SAME ct + the SAME recoLoading gate (cannot diverge in freshness)');
    var fmt; eval(extract(RO, '_opRecoFmtQty') + '\nfmt = _opRecoFmtQty;');
    eq([fmt(null, true), fmt(null, false), fmt(0, false)], ['…', '—', '0'], 'D: unresolved+loading → "…" (compact loading), settled-null → "—", 0 → "0" (no half-populated tier)');

    section('Objective A — zero Draft-Line dependency');
    eq(draftLineCalls.count, 0, '23. zero request_order_allocation_draft_lines read/write across all-tier note autosave');
    ok(!/request_order_allocation_draft_lines/.test(extract(RO, '_roSaveTierEditCore_') + extract(RO, '_roClassifyEditResult_') + extract(RO, '_roAllocEditNote')), '23. the note/edit source never names the Draft-Line table');

    runRemount();
  }).catch(function (e) { console.error('ASYNC ERROR', e && e.stack || e); fail++; done(); });

  // ---- Objective C — production-faithful lifecycle (REAL core/lifecycle.js) ----
  function runRemount() {
    section('Objective C — REAL lifecycle.js mount/unmount across 3 navigation cycles restores rows');
    var KM = { lifecycle: {} };
    global.KM = KM; global.console = console;
    // Load the REAL lifecycle manager (self-contained IIFE that populates KM.lifecycle.register/switchTo).
    var lc = fs.readFileSync(path.join(ROOT, 'js', 'core', 'lifecycle.js'), 'utf8').replace(/\r\n/g, '\n');
    (function () { eval(lc); })();

    // A section mount that mirrors the REAL initRequestOrderSection remount contract: bump epoch, rebind region (null),
    // pin LOADING before the async composer, keep prior data, then resolve rows. A fake "other" page toggles currentPage.
    var epoch = 0, region = { detached: false }, baseStatus = 'IDLE', data = [], emptyReason = null, composerReads = 0, mountCount = 0;
    function renderEmpty() {
      // the REAL empty-branch ordering (IDLE/LOADING → loading; !useDb → disconnect; ERROR; else EMPTY_SCOPE)
      if (!data.length) { emptyReason = (baseStatus === 'LOADING' || baseStatus === 'IDLE') ? 'LOADING' : (baseStatus === 'ERROR' ? 'ERROR' : 'EMPTY_SCOPE'); }
      else emptyReason = null;
    }
    function fakeComposer() { composerReads++; return Promise.resolve([{ sku: 'CO1100-R', company: 'ResUS', country: 'US', marketplace: 'Amazon' }]); }
    KM.lifecycle.register('request-order-section', {
      mount: function () {
        mountCount++; epoch++; region = { detached: false };   // rebind region to the CURRENT mount (never a detached node)
        baseStatus = 'LOADING'; renderEmpty();                  // pinned LOADING → the interim render is "loading", never a disconnect
        // async composer resolves rows for THIS epoch
        var my = epoch;
        fakeComposer().then(function (rows) { if (my !== epoch) return; data = rows; baseStatus = data.length ? 'LOADED' : 'EMPTY'; renderEmpty(); });
      },
      unmount: function () { /* no state reset, no DOM teardown — mirrors the real console.log-only unmount */ }
    });

    var chain = Promise.resolve();
    var results = [];
    for (var cycle = 0; cycle < 3; cycle++) {
      chain = chain.then(function () { KM.lifecycle.switchTo('request-order-section'); return tick(); })
        .then(function () { results.push({ mountCount: mountCount, epoch: epoch, rows: data.length, region: region.detached, emptyReason: emptyReason }); KM.lifecycle.switchTo('other-section'); });
    }
    chain.then(function () {
      eq(mountCount, 3, '12/14. REAL switchTo mounts request-order on all 3 navigation cycles (mount re-runs each nav-back)');
      ok(results.every(function (r) { return r.rows === 1; }), '12. base rows are restored on every remount (no hard refresh)');
      ok(results.every(function (r) { return r.region === false; }), '7/15. the composer region rebinds to the current mount — never a detached node');
      ok(results.every(function (r) { return r.emptyReason !== 'DB_UNAVAILABLE'; }), '16. no false "Connect Operation DB" during the remount/loading race');
      eq(epoch, 3, 'each mount bumps the epoch (a late prior-mount response is dropped by the epoch guard)');

      section('Objective C — source: real mount wiring + IDLE-as-loading guard');
      ok(/KM\.lifecycle\.register\('request-order-section'/.test(RO), 'C: request-order registers a real lifecycle section');
      ok(/mount\(navEpoch\)/.test(RO) && /window\.initRequestOrderSection\(\)/.test(RO), 'C: mount(navEpoch) re-runs initRequestOrderSection each entry (R6C epoch-guarded)');
      ok(/_roMountEpoch\+\+;\s*\n\s*_opFirstLayerRegion = null;/.test(RO), 'C: each mount bumps epoch AND rebinds the composer region');
      ok(/_roBaseDataStatus === 'LOADING' \|\| _roBaseDataStatus === 'IDLE'/.test(RO), 'C: IDLE is treated as a transient loading state (never a settled disconnect during the remount gap)');
      ok(/useDb:/.test(RO) && /lastEmptyReason:/.test(RO) && /firstLayerSeq:/.test(RO), 'C: __roDebug exposes useDb/searched/firstLayerSeq/lastEmptyReason to pinpoint a live remount empty');

      runParity();
    }).catch(function (e) { console.error('ASYNC ERROR (remount)', e && e.stack || e); fail++; done(); });
  }

  // ---- Objective F — inventory/cargo (WEEKLY_SHIPPING) parity matrix ----
  function runParity() {
    section('Objective F — Inventory/Cargo AI Plan (WEEKLY_SHIPPING) parity: no equivalent defect');
    // The decisive parity fact: Inventory does NOT use the locked decision writer and does NOT interpret status==='COMPLETED'
    // — its edit path keys off the envelope .success/.error, so the flat-result-shape bug is structurally ABSENT there.
    ok(IR.indexOf('updateRecommendationDecisionLocked') === -1, 'F: Inventory never calls updateRecommendationDecisionLocked (different edit model)');
    ok(!/data\.status\s*===\s*'COMPLETED'/.test(IR), "F: Inventory never gates on data.status==='COMPLETED' (the Order-Planning bug cannot occur here)");
    ok(/success\s*===\s*false/.test(IR), 'F: Inventory success detection keys off the envelope .success/.error (header/line upsert)');
    ok(/function _hydrateAllocationDraftFromDb/.test(IR), 'F: Inventory hydrates persisted drafts from DB (shipping_allocation_drafts) on restore');
    ok(/getShippingAllocationDrafts\(\)/.test(IR), 'F: DB-first hydration reads the canonical shipping_allocation_drafts');
    ok(/KM\.lifecycle\.register\('ops-section'/.test(IR), 'F: Inventory registers a real lifecycle section (mount re-runs on nav-back)');
    ok(/openAISuggestion/.test(IR) && !/mount[\s\S]{0,600}openAISuggestion/.test(IR), 'F: the recommendation popup is manual-only (never opened by mount/hydrate)');
    // Freeze the shared-vs-domain-specific matrix (documented in the design freeze §36).
    console.log('  parity matrix: SHARED = DB-first hydrate-on-mount, lifecycle re-init, async seq/token guards, fail-closed errors, no false connect-DB, manual-only popup.');
    console.log('  parity matrix: DOMAIN-SPECIFIC = per-route line upsert (not per-tier decision write); envelope .success (not status==COMPLETED); Note field local-only by design.');

    done();
  }
})();
