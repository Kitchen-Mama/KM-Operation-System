// Kitchen Mama Operation System - S8-B3-R3-CP2U-R2
// THE STATES EXISTED AND THE SCREEN NEVER HEARD ABOUT THEM
//
// Run: node assets/tests/read-state-delivery-s8-b3-r3-cp2u-r2.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. Every fixture is synthetic.
//
// CP2U-R1 gave Avg Sales and Suggested Qty a vocabulary for every way an answer can be absent - still
// reading, READ FAILED, nothing published, a basis withheld, a named refusal - and verified that vocabulary
// against the authorities directly. THAT IS NOT THE SAME AS VERIFYING THE SCREEN. The async arrival path
// repaints the velocity cells through exactly one gate:
//
//     if (_irRecoState.status === 'READY' && _irRecoHasCanonicalBasis_()) _irRecoUpdateVelocityCells_();
//
// so a failed read, an empty answer and a withheld basis repaint NOTHING, and the `.catch` arm never called
// the cell updaters at all. Every word CP2U-R1 added for those states was unreachable on the live path. A
// test that asks the authority what it would say, and never asks the cell what it shows, cannot see that.
//
// SO THIS SUITE DRIVES THE REAL LOADERS. `loadRecommendationWorkspace_` and `loadInventoryGap_` are the
// functions under test; the fixtures are what `window.KM.api.getWorkspace` and
// `window.KM.DB.getInventoryReplenishmentGap` return, in the shape the REAL adapters return them. Nothing
// here calls `_irRecoApplyEnvelope` or an updater by hand, because doing so would skip the gate that is the
// defect.
//
// THE ADAPTER SHAPE IS THE POINT OF SECTION F. `_kmGapRead_` returns
// `{ success: true, data: ..., envelope: json }` - the server meta is under `envelope`, and there is NO
// top-level `meta`. CP2U-R1 read `res.meta.gapMaterializationHandlerVersion`, which against the real adapter
// is `undefined` forever. A fixture hand-filled with `meta` at the top level would have passed and would
// have proved nothing.
//
// NOTE: no 'use strict' - the shipped IRRECO region is eval'd into MODULE scope.
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var IRSRC = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');
var SKU = 'CO1200-B';
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon' };
var SCOPE_KEY = JSON.stringify(SCOPE);
var OTHER_KEY = JSON.stringify({ company: 'KM', country: 'CA', marketplace: 'Amazon.ca' });

// ---------------------------------------------------------------------------------------------------
// The sandbox. A fake DOM with real cell nodes, so "did the cell change" is answerable, and so NODE
// IDENTITY can be checked - an in-place update must not replace the row or the cell objects.
// ---------------------------------------------------------------------------------------------------
var APPLIED_KEY = SCOPE_KEY;
var WS_ACTIVE = true;
var DOMROWS = [];
var ASSEMBLIES = 0;          // every _getCloudReplenishmentData() stands for one whole-site recomposition
var FULL_RENDERS = 0;        // every renderReplenishment() stands for one full table rebuild

function el(tag, cls) {
  return { tag: tag, className: cls || '', innerHTML: '', textContent: '', _attrs: {}, children: [],
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    removeAttribute: function (k) { delete this._attrs[k]; },
    getAttribute: function (k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
    querySelector: function (sel) {
      var want = sel.replace('.', '');
      for (var i = 0; i < this.children.length; i++) {
        if ((' ' + this.children[i].className + ' ').indexOf(' ' + want + ' ') !== -1) return this.children[i];
      } return null;
    } };
}
function makeRow(sku) {
  var row = el('div', 'scroll-row'); row.setAttribute('data-sku', sku);
  var avg = el('div', 'scroll-cell replen-avg-cell'); avg.innerHTML = '--';
  var dos = el('div', 'scroll-cell replen-dos-cell'); dos.textContent = '--';
  var sug = el('div', 'scroll-cell replen-suggested-cell'); sug.innerHTML = '';
  row.children.push(avg, dos, sug);
  return { row: row, avg: avg, dos: dos, sug: sug };
}
var R = makeRow(SKU);
DOMROWS = [R.row];

global.window = { KM_FLAGS: {}, KM: { api: { workspaceApiActive: function () { return WS_ACTIVE; } }, DB: {} },
  IRContext: { toScopeRequest: function () { return { company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace }; } } };
global.document = {
  querySelectorAll: function (sel) { return /scroll-row/.test(sel) ? DOMROWS : []; },
  getElementById: function () { return null; }
};
global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
global.sessionStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
function escapeReplenHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _irAppliedScopeKey_() { return APPLIED_KEY; }
function _irResultMatchesAppliedScope_(st) {
  if (!st || typeof st.appliedScopeKey !== 'string') return false;
  return st.appliedScopeKey === _irAppliedScopeKey_();
}
function _irSearchApplied_() { return true; }
function _replenDemoOn() { return false; }
function renderReplenishment() { FULL_RENDERS++; }
// THE FAKE ASSEMBLY RUNS THE REAL PROJECTION. A stub returning fixed strings would have reported the cell as
// broken on the READY path, where the shipped code is fine - the CP2T-R1 harness defect, repeated. The slice
// below is the shipped projection block, so what this returns is what renderReplenishment would have built.
var PROJ = IRSRC.slice(IRSRC.indexOf("var _avgDisplay = '--';"),
  IRSRC.indexOf('// Forecast breakdown (next 3 months, Target Rule applied)'));
var PROJECT = new Function('_irCanonicalSalesBasis_', '_irAvgSalesCellState_', 'IR', 'mp', 'currentStock', 'Math',
  'IR_AVG_PENDING_MARK',
  PROJ + ' return { avgDailySales: _avgDisplay, daysOfSupply: _dosDisplay, avgSalesQualityError: _avgQualityError,'
  + ' avgSalesWarning: _avgWarning, avgSalesCellState: _avgCellState, avgSalesCellReason: _avgCellReason,'
  + ' avgSalesCellDetail: _avgCellDetail };');
function _getCloudReplenishmentData() {
  ASSEMBLIES++;
  var it = PROJECT(_irCanonicalSalesBasis_, _irAvgSalesCellState_, IR, { sku: SKU }, 500, Math, IR_AVG_PENDING_MARK);
  it.sku = SKU; it.currentInventory = 500;
  return [it];
}
function getReplenishmentData() { return _getCloudReplenishmentData(); }
function _irRecoActionHtml() { return ''; }
function _irRecoHorizonOutlookTableHtml() { return ''; }
function _irRecoRecordDiag() {}
function updateReplenRecoContext() { return {}; }
function _legacyRecSummaryTableHtml() { return ''; }
function _recSummaryRows() { return ''; }
var IR = { daysOfSupply: function (stock, rate) { return (rate == null || rate <= 0) ? null : Math.floor(stock / rate); } };
global.IR = IR;

eval(IRSRC.slice(IRSRC.indexOf('var IR_AVG_QUALITY_TEXT'), IRSRC.indexOf('function _irScrollRowHtml_')));
eval(IRSRC.slice(IRSRC.indexOf('// __IRRECO_START__'), IRSRC.indexOf('// __IRRECO_END__')));
eval(IRSRC.slice(IRSRC.indexOf('function _irSuggestedQtyState_'), IRSRC.indexOf('// Recommendation Summary table body')));

// ---- fixtures in the shape the REAL server and the REAL adapters produce -------------------------
function wsLine(basis) { return { sku: SKU, destinationType: 'MARKETPLACE', destinationLabel: 'US/Amazon', horizonBasis: basis }; }
function basisRate(r) { return { demandMode: 'sales_driven', avgSalesPerDay: r, source: 'normalized_30d', warning: null, normalDayCount: 30, basisQualityError: null }; }
function basisErr(code) { return { demandMode: 'sales_driven', avgSalesPerDay: null, source: null, warning: null, normalDayCount: null, basisQualityError: code }; }
function wsOk(lines, meta) {
  return { success: true, data: { lines: lines, pagination: null, dataVersion: null },
    meta: Object.assign({ requestId: 'rq', recommendationWorkspaceHandlerVersion: 'fm5-r4ui-r5e' }, meta || {}), errors: [] };
}
function wsFail(code) { return { success: false, data: null, meta: { requestId: 'rq' }, errors: [{ code: code, message: code, details: null }] }; }

// The REAL gap adapter shape: { success, data, envelope } on success - NO top-level meta - and
// { success:false, error } on failure, which carries no envelope at all.
function gapOk(rows, handler) {
  return { success: true, data: { rows: rows },
    envelope: { success: true, data: { rows: rows }, meta: { gapMaterializationHandlerVersion: handler || 'fm5-r4ui-r5c' }, errors: [] } };
}
function gapFail(code) { return { success: false, error: { code: code, message: code } }; }
function gapRow(o) {
  o = o || {};
  return { sku: SKU, calculation_status: o.status === undefined ? 'READY' : o.status,
    note: o.note === undefined ? null : o.note, calculation_date: '2026-10-15', calculated_at: '2026-10-15 03:00:00',
    d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 0,
    d45_gap_qty: 0, d45_suggested_qty: 0,
    d90_gap_qty: o.gap === undefined ? 40 : o.gap, d90_suggested_qty: o.qty === undefined ? 40 : o.qty };
}

var WS_NEXT = null, GAP_NEXT = null;
window.KM.api.getWorkspace = function () {
  var n = WS_NEXT;
  return (n && n.reject) ? Promise.reject(n.reject) : Promise.resolve(n);
};
window.KM.DB.getInventoryReplenishmentGap = function () {
  var n = GAP_NEXT;
  return (n && n.reject) ? Promise.reject(n.reject) : Promise.resolve(n);
};

function resetCells() {
  R.avg.innerHTML = 'STALE'; R.avg.className = 'scroll-cell replen-avg-cell'; R.avg._attrs = {};
  R.dos.textContent = 'STALE'; R.sug.innerHTML = 'STALE';
  ASSEMBLIES = 0; FULL_RENDERS = 0;
}
// Drive the REAL loader and settle the microtask queue.
function runWs(env) {
  WS_NEXT = env;
  // The loader DEDUPES an identical scope that is already loaded, and caches a successful envelope for the
  // session. Neither is under test here, and both would stop the second read in a sequence from happening at
  // all - so the state is invalidated and the cache cleared between runs. The loader still owns the sequence
  // number, the abort and every state transition; nothing about the arrival path is faked.
  if (typeof invalidateRecommendationSessionCache === 'function') invalidateRecommendationSessionCache();
  _irRecoInvalidate('CONTEXT_NOT_READY');
  return Promise.resolve(loadRecommendationWorkspace_());
}
function runGap(res) {
  GAP_NEXT = res;
  _irMatState.loadedOk = false; _irMatState.scopeKey = null;   // force the read (the dedupe is not under test)
  return Promise.resolve(loadInventoryGap_(true));
}
function avgText() { return String(R.avg.innerHTML); }
function avgTitle() { return String(R.avg.getAttribute('title') || ''); }
function sugText() { return String(R.sug.innerHTML); }

var T = [];
function test(name, fn) { T.push({ name: name, fn: fn }); }

// ===================================================================================================
test('A  the gate itself, read out of the shipped source', function () {
  section('A  THE GATE - what the async arrival is allowed to repaint');
  var FN = IRSRC.slice(IRSRC.indexOf('function _irRecoRefreshVelocityCells_'), IRSRC.indexOf('// __IRRECO_END__'));
  // The READY test is KEPT - a resolved rate is a number and belongs to the row assembly that built it.
  // What must not exist any more is a path where every OTHER state repaints nothing, so the branch is
  // what is asserted, not the absence of the condition.
  ok(FN.indexOf('else _irRecoPaintReadStateCells_();') !== -1
    && FN.indexOf('_irRecoHasCanonicalBasis_()) _irRecoUpdateVelocityCells_();') !== -1,
    'A1  THE REPAINT IS NO LONGER GATED: READY takes the numeric path and EVERY other state takes the '
    + 'state painter. The old one-armed `if` is why a failed read, an empty answer and a withheld basis '
    + 'repainted nothing at all, and every state CP2U-R1 added was unreachable.');
  var LOADER = IRSRC.slice(IRSRC.indexOf('function loadRecommendationWorkspace_'),
    IRSRC.indexOf('function _irRecoPaintReadStateCells_'));
  var cat = LOADER.slice(LOADER.indexOf('.catch(function (err)'));
  ok(cat.length > 0 && /_irRecoRefreshVelocityCells_\(\)/.test(cat) && /_irRecoUpdateSuggestedCells\(\)/.test(cat),
    'A2  and the THROWN arm repaints BOTH columns - it used to call only the summary re-render, so a '
    + 'rejected read left both of them showing whatever they happened to hold', cat.slice(-260));
  return Promise.resolve();
});

test('B  Avg / DOS across the real transitions', function () {
  section('B  AVG + DAYS OF SUPPLY - driven through the real loader');
  // 1. a successful read with a real rate
  resetCells();
  return runWs(wsOk([wsLine(basisRate(10))])).then(function () {
    ok(avgText().indexOf('10.0') === 0, 'B1  a resolved rate reaches the cell', avgText());
    eq(R.dos.textContent, '50', 'B1a and Days of Supply with it (500 / 10)');

    // 2. server ANSWERED with success:false
    resetCells();
    return runWs(wsFail('WORKSPACE_ERROR'));
  }).then(function () {
    ok(/read failed/.test(avgText()),
      'B2  A SERVER-ANSWERED FAILURE REACHES THE CELL. This is the state the old gate could never paint.', avgText());
    ok(/could not be READ/.test(avgTitle()), 'B2a with the words that say it is a failed read');
    ok(/WORKSPACE_ERROR/.test(avgTitle()), 'B2b and the code it failed with');
    ok(avgText().indexOf('STALE') === -1, 'B2c and the stale content is gone');

    // 3. a REJECTED promise
    resetCells();
    return runWs({ reject: Object.assign(new Error('socket hang up'), { apiCode: 'PAGE_READ_FAILED' }) });
  }).then(function () {
    ok(/read failed/.test(avgText()), 'B3  A REJECTED READ reaches the cell too', avgText());
    ok(/PAGE_READ_FAILED/.test(avgTitle()), 'B3a carrying the thrown code');

    // 4. EMPTY - the read answered with no lines at all
    resetCells();
    return runWs(wsOk([]));
  }).then(function () {
    eq(avgText(), '--', 'B4  an EMPTY answer prints the dash');
    ok(/no destination line for any SKU/.test(avgTitle()),
      'B4a and SAYS the read completed with nothing in it, rather than leaving a bare dash', avgTitle());

    // 5. BASIS_WITHHELD - a line exists carrying no basis at all (the D-S8-B3-98 shape)
    resetCells();
    return runWs(wsOk([wsLine(null)]));
  }).then(function () {
    eq(avgText(), '--', 'B5  a WITHHELD basis prints the dash');
    ok(/withheld/.test(avgTitle()),
      'B5a and says the basis was withheld - not that the site has no sales', avgTitle());

    // 6. a NAMED refusal still wins and still says its own words
    resetCells();
    return runWs(wsOk([wsLine(basisErr('SALES_BASIS_WEEKLY_UNAVAILABLE'))]));
  }).then(function () {
    ok(/unavailable/.test(avgText()), 'B6  a NAMED refusal keeps its own flag', avgText());
    ok(/no weekly sales figure could be read/.test(avgTitle()), 'B6a and CP2T-R2 wording, unchanged');

    // 7. a legitimate zero is a measurement
    resetCells();
    return runWs(wsOk([wsLine(basisRate(0))]));
  }).then(function () {
    ok(avgText().indexOf('0.0') === 0, 'B7  A CONFIRMED ZERO still prints 0.0', avgText());
    ok(avgText().indexOf('read failed') === -1, 'B7a and is never dressed as a failure');

    // 8. RECOVERY - a good read after a bad one must clear the failure
    resetCells();
    return runWs(wsFail('WORKSPACE_ERROR'));
  }).then(function () {
    ok(/read failed/.test(avgText()), 'B8  (failure first)');
    return runWs(wsOk([wsLine(basisRate(4))]));
  }).then(function () {
    ok(avgText().indexOf('4.0') === 0, 'B8a RECOVERY: the next good read replaces the failure with the rate', avgText());
    eq(avgTitle(), '', 'B8b and the failure tooltip is REMOVED, not left behind on a healthy cell');
  });
});

test('C  no recomposition, no rebuild, node identity kept', function () {
  section('C  AND IT COSTS WHAT AN IN-PLACE UPDATE SHOULD COST');
  var avgNode = R.avg, dosNode = R.dos, rowNode = R.row;
  resetCells();
  return runWs(wsFail('WORKSPACE_ERROR')).then(function () {
    eq(FULL_RENDERS, 0, 'C1  a FAILED read triggers no full table rebuild');
    eq(ASSEMBLIES, 0,
      'C2  and no whole-site data recomposition. The failure text depends only on the read state, so paying '
      + 'for a full row assembly to print it would be a new cost on the slowest path there is.');
    resetCells();
    return runWs(wsOk([]));
  }).then(function () {
    eq([FULL_RENDERS, ASSEMBLIES], [0, 0], 'C3  nor does an EMPTY answer');
    resetCells();
    return runWs(wsOk([wsLine(null)]));
  }).then(function () {
    eq([FULL_RENDERS, ASSEMBLIES], [0, 0], 'C4  nor a withheld basis');
    ok(R.avg === avgNode && R.dos === dosNode && R.row === rowNode,
      'C5  and the row and both cells are the SAME NODES throughout - the update is in place, so a half-typed '
      + 'quantity and the caret in the expanded panel below survive it');
  });
});

test('D  Suggested Qty across the real gap loader', function () {
  section('D  SUGGESTED QTY - driven through the real gap loader');
  resetCells();
  return runGap(gapOk([gapRow({ qty: 120 })])).then(function () {
    ok(/120/.test(sugText()), 'D1  a stored quantity reaches the cell', sugText());

    resetCells();
    return runGap(gapFail('READ_FAILED'));
  }).then(function () {
    ok(/failed read, not a refused calculation/.test(sugText()),
      'D2  A FAILED GAP READ REACHES THE CELL - the arm that sets READ_ERROR never called the cell updater', sugText());
    ok(/--read-failed/.test(sugText()), 'D2a with its own modifier class');

    resetCells();
    return runGap({ reject: new Error('boom') });
  }).then(function () {
    ok(/failed read/.test(sugText()), 'D3  and so does a REJECTED gap read', sugText());

    resetCells();
    return runGap(gapOk([]));
  }).then(function () {
    ok(/no stored gap rows at all/.test(sugText()), 'D4  an EMPTY gap read says what was empty', sugText());

    resetCells();
    return runGap(gapOk([gapRow({ status: 'BLOCKED', note: 'No marketplace SKU mapping', qty: '' })]));
  }).then(function () {
    ok(/declined this SKU \[BLOCKED\]/.test(sugText()), 'D5  a refusal names the status', sugText());
    ok(/No marketplace SKU mapping/.test(sugText()), 'D5a and carries the stored note');

    resetCells();
    return runGap(gapOk([gapRow({ qty: 0 })]));
  }).then(function () {
    ok(/>0</.test(sugText()), 'D6  A STORED ZERO is published as 0, not as an absence', sugText());

    resetCells();
    return runGap(gapOk([gapRow({ qty: 77 })]));
  }).then(function () {
    ok(/77/.test(sugText()), 'D7  RECOVERY: a good read after a failed one shows the number again', sugText());
    eq([FULL_RENDERS, ASSEMBLIES], [0, 0], 'D7a and none of these rebuilt the table or re-assembled the site');
  });
});

test('E  cross-site, late responses and the Search guard', function () {
  section('E  WHAT MUST STILL BE REFUSED');
  // A failure that belongs to ANOTHER site must not be shown as this site failing.
  resetCells();
  APPLIED_KEY = SCOPE_KEY;
  return runWs(wsOk([wsLine(basisRate(9))])).then(function () {
    ok(avgText().indexOf('9.0') === 0, 'E1  (a good result for the displayed site)');
    // THE REAL SEQUENCE: the read is ISSUED while this site is displayed, the operator switches away, and
    // only THEN does it fail. Switching before the dispatch would have made the failure genuinely belong to
    // the new site, which is not the case under test - the first version of this test did exactly that and
    // was measuring nothing.
    resetCells();
    var gate, held = new Promise(function (res) { gate = res; });
    WS_NEXT = { reject: Object.assign(new Error('late'), { apiCode: 'WORKSPACE_ERROR' }) };
    if (typeof invalidateRecommendationSessionCache === 'function') invalidateRecommendationSessionCache();
    _irRecoInvalidate('CONTEXT_NOT_READY');
    var prevGet = window.KM.api.getWorkspace;
    window.KM.api.getWorkspace = function () { return held.then(function () { return Promise.reject(WS_NEXT.reject); }); };
    var inflight = loadRecommendationWorkspace_();
    APPLIED_KEY = OTHER_KEY;        // the operator moves on while the read is open
    gate();
    return Promise.resolve(inflight).then(function () { window.KM.api.getWorkspace = prevGet; });
  }).then(function () {
    ok(!/read failed/.test(avgText()),
      'E2  A FAILURE FOR ANOTHER SITE IS NOT THIS SITE FAILING. The state is attributable to the scope it was '
      + 'issued for, so the displayed site shows pending, never a red error it did not cause.', avgText());
    ok(/…/.test(avgText()) || avgText() === '--', 'E2a it shows a pending or neutral cell', avgText());
    APPLIED_KEY = SCOPE_KEY;

    // The Search guard: nothing repaints before a confirmed Search.
    var GATE = IRSRC.slice(IRSRC.indexOf('function _irRecoPaintReadStateCells_'),
      IRSRC.indexOf('function _irRecoPaintReadStateCells_') + 1400);
    ok(/_irSearchApplied_/.test(GATE),
      'E3  the new painter honours the confirmed-Search guard, exactly as the velocity refresh does');
    ok(/document/.test(GATE) || /querySelectorAll/.test(GATE),
      'E3a and it reads the live rows rather than assuming any are present');
    return Promise.resolve();
  });
});

test('F  the gap handler marker, from the REAL adapter envelope', function () {
  section('F  THE MARKER - read where the adapter actually puts it');
  var ADAPTER = fs.readFileSync(path.join(ROOT, 'assets/js/api/operation-system-db-api.js'), 'utf8');
  ok(/return \{ success: true, data: json\.data \|\| \{ rows: \[\] \}, envelope: json \};/.test(ADAPTER),
    'F1  THE ADAPTER RETURNS `{ success, data, envelope }` AND NO TOP-LEVEL META. This is the fact the fixture '
    + 'is built from, read out of the shipped adapter rather than assumed.');
  resetCells();
  return runGap(gapOk([gapRow({})], 'fm5-r4ui-r5c')).then(function () {
    var probe = _irMatAnswerSource_(SKU);
    eq(probe.gapMaterializationHandlerVersion, 'fm5-r4ui-r5c',
      'F2  and the probe FINDS the marker under envelope.meta. CP2U-R1 read res.meta, which the real adapter '
      + 'never sets, so this reported null forever against every real response.');
    eq(probe.status, 'READY', 'F2a with the state the loader actually reached');
    ok(/NOT compared against the 42_/.test(probe.handler_marker_note),
      'F3  still reported independently of the 42_ accept list');
    eq(probe.issued_request, false, 'F3a and the probe still issues nothing');

    // A failure carries no envelope at all, and that is reported as unknown rather than invented.
    resetCells();
    return runGap(gapFail('READ_FAILED'));
  }).then(function () {
    var p2 = _irMatAnswerSource_(SKU);
    eq(p2.gapMaterializationHandlerVersion, null,
      'F4  a failed read reports the marker as NULL - the adapter drops the envelope on its failure branch, '
      + 'so the marker is genuinely unavailable and is not guessed from the previous answer');
    eq(p2.status, 'READ_ERROR', 'F4a while the failure itself is reported');
    eq(p2.error && p2.error.code, 'READ_FAILED', 'F4b with its code');
  });
});

test('G  server_answered and marks_source keep their three values', function () {
  section('G  THE TIMING REPORT - what must not be flattened');
  var TIMEFN = IRSRC.slice(IRSRC.indexOf('function _irReadTimingReport_'), IRSRC.indexOf('window._irReadTimingReport_'));
  ok(!/server_answered: r\.server_answered === true/.test(TIMEFN),
    'G1  server_answered IS NOT COLLAPSED TO A BOOLEAN. CP2U-R1 wrote `=== true`, which turns "the transport '
    + 'never recorded whether the server answered" into "the server did not answer" - a different claim.');
  var TL = { peak_concurrent_requests: 1, request_timeline: [
    { seq: 1, action: 'inventoryReplenishment.workspace.get', dispatch_ms: 0, settled_ms: 10, elapsed_ms: 10,
      server_ms: 5, server_answered: true, code: null, phase: 'ok', http_status: 200, request_id: 'a',
      attempts: 1, marks_source: 'OBSERVED', concurrent_at_dispatch: 0, overlapped_with: [] },
    { seq: 2, action: 'recommendation.workspace.get', dispatch_ms: 1, settled_ms: 9, elapsed_ms: 8,
      server_ms: null, server_answered: false, code: 'REQUEST_TIMEOUT', phase: 'timeout', http_status: null,
      request_id: 'b', attempts: 1, marks_source: 'OBSERVED', concurrent_at_dispatch: 1, overlapped_with: [] },
    { seq: 3, action: 'inventoryReplenishmentGap.get', dispatch_ms: 2, settled_ms: 8, elapsed_ms: 6,
      server_ms: null, server_answered: null, code: null, phase: 'ok', http_status: null, request_id: 'c',
      attempts: 1, marks_source: 'EXTERNAL_RECONSTRUCTED', concurrent_at_dispatch: 2, overlapped_with: [] } ] };
  window.KM.transport = { timeline: function () { return TL; } };
  eval(IRSRC.slice(IRSRC.indexOf('var IR_TIMED_READS_'), IRSRC.indexOf('window._irReadTimingReport_')));
  var rep = _irReadTimingReport_();
  var by = {}; rep.reads.forEach(function (r) { by[r.read] = r; });
  eq(by.inventory_workspace.server_answered, true, 'G2  a server that ANSWERED reports true');
  eq(by.recommendation.server_answered, false, 'G2a one that did NOT reports false');
  eq(by.materialized_gap.server_answered, null,
    'G2b and one the transport never recorded reports NULL - three values, three meanings');
  eq(by.gap_job_status.server_answered, null, 'G2c an unobserved read reports null, never false');
  eq(by.materialized_gap.marks_source, 'EXTERNAL_RECONSTRUCTED', 'G3  marks_source still travels');
  eq(rep.classification, 'OBSERVED_WITH_RECONSTRUCTED_ROWS', 'G3a and still downgrades the whole report');
  // "no record" is not "never dispatched".
  ok(/evicted|bounded|not the same as|does not mean/i.test(TIMEFN),
    'G4  AND `not_observed` NO LONGER CLAIMS THE READ NEVER HAPPENED. The sample buffer is bounded, so an '
    + 'absent record means the report cannot see it - not that nothing was dispatched and nothing arrived.');
  eq(by.gap_job_status.not_observed, true, 'G4a the flag is still raised');
  ok(Object.prototype.hasOwnProperty.call(by.gap_job_status, 'dispatched'),
    'G4b beside an explicit `dispatched` field, which is null rather than false for a read nobody recorded');
  eq(by.gap_job_status.dispatched, null, 'G4c reported as UNKNOWN');
  return Promise.resolve();
});

// ---------------------------------------------------------------------------------------------------
(function runAll(i) {
  if (i >= T.length) {
    console.log('\n' + passed + ' passed / ' + failed + ' failed');
    if (failed) process.exitCode = 1;
    return;
  }
  var r;
  try { r = T[i].fn(); } catch (e) {
    failed++; console.log('FAIL ' + T[i].name + ' THREW: ' + (e && e.message || e));
    return runAll(i + 1);
  }
  Promise.resolve(r).then(function () { runAll(i + 1); }, function (e) {
    failed++; console.log('FAIL ' + T[i].name + ' REJECTED: ' + (e && e.message || e));
    runAll(i + 1);
  });
})(0);
