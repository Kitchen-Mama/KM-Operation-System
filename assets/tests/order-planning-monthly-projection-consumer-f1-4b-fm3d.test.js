// Kitchen Mama Operation System — Order Planning Monthly Projection Consumer Cutover (F1-4B-FM3d).
// Run: node assets/tests/order-planning-monthly-projection-consumer-f1-4b-fm3d.test.js
// -----------------------------------------------------------------------------
// Proves the Order Planning business surface now CONSUMES the server line.monthlyProjection (FM3c-2):
// Demand Summary shows Demand + Gap (Gap ← remainingGapQty), Order Allocation Suggested ← suggestedOrderQty,
// with NO page-side gap/carton/suggested math (all server/KMTPP/KMCALC owned). Valid 0 stays 0; null → "—";
// loading → "…". The standalone "Recommendation — Order Need" decision table is retired to a COLLAPSED
// diagnostics <details>. Manual Order Qty + the Send Request write path are UNTOUCHED. One request per expand;
// no writes. The __OPRECO__ block is extracted + eval'd; the panel markup is source-scanned. No live DB.
// NOTE: intentionally NOT strict — extracted top-level declarations must bind into this module scope.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/request-order.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function slice(m1, m2) { var a = JS.indexOf(m1), b = JS.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return JS.slice(a, b); }

var OPRECO = slice('// __OPRECO_START__', '// __OPRECO_END__');

// ---- host-page stubs (a recording DOM so the canonical cell patch can be asserted) ----------------
var ITEM = { sku: 'CO1100', company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
function _roEsc(s) { return String(s == null ? '' : s); }
function _roRowKey(item) { return [item.sku || '', item.company != null ? item.company : '', item.country || '', item.marketplace || ''].join('|'); }
function _roPanelId(k) { return 'ro-expand-' + String(k == null ? '' : k).replace(/[^A-Za-z0-9_-]/g, '-'); }
var PANEL_ID = _roPanelId(_roRowKey(ITEM));
var cellStore = {};
function resetCells(withSuggestedT4) {
  cellStore = {};
  ['T1', 'T2', 'T3', 'T4'].forEach(function (t) { cellStore['gap:' + t] = { innerHTML: '' }; cellStore['demand:' + t] = { innerHTML: '' }; });
  ['T1', 'T2', 'T3'].concat(withSuggestedT4 ? ['T4'] : []).forEach(function (t) { cellStore['suggested:' + t] = { innerHTML: '' }; });
}
var fakePanel = { querySelector: function (sel) {
  var m = /\[data-ro-(gap|suggested|demand)-tier="(T[1-4])"\]/.exec(sel);
  return m ? (cellStore[m[1] + ':' + m[2]] || null) : null;
} };
global.window = {};
global.document = { getElementById: function (id) { return id === PANEL_ID ? fakePanel : null; } };
global.AbortController = function () { this.signal = {}; this.abort = function () { this._aborted = true; }; };
var requestOrderState = { expandedRowKey: null, data: [] };
eval(OPRECO);

function makeApi(active, env) {
  var calls = { getWorkspace: 0, lastParams: null };
  return { _calls: calls,
    workspaceApiActive: function (n) { return active && n === 'recommendation'; },
    getWorkspace: function (name, params) { calls.getWorkspace++; calls.lastParams = params; return Promise.resolve(env); } };
}
function proj() {
  return [
    { tier: 'T1', month: '2026-09', openingSupplyQty: 120, incomingAddedQty: 0, demandQty: 7000, coveredQty: 120, remainingSupplyQty: 0, remainingGapQty: 0, suggestedOrderQty: 0 },
    { tier: 'T2', month: '2026-10', openingSupplyQty: 0, incomingAddedQty: 0, demandQty: 4282, coveredQty: 0, remainingSupplyQty: 0, remainingGapQty: 1500, suggestedOrderQty: 1500 },
    { tier: 'T3', month: '2026-11', openingSupplyQty: 0, incomingAddedQty: 0, demandQty: 7500, coveredQty: 0, remainingSupplyQty: 0, remainingGapQty: 7500, suggestedOrderQty: 7500 },
    { tier: 'T4', month: '2026-12', openingSupplyQty: 0, incomingAddedQty: 0, demandQty: 0, coveredQty: 0, remainingSupplyQty: 0, remainingGapQty: 0, suggestedOrderQty: 0 }
  ];
}
function mktLine(over) {
  var L = { recommendationLineId: 'M1', recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: 'CO1100', siteSku: null, destinationType: 'MARKETPLACE', destinationKey: 'MARKETPLACE||KM||US||AMAZON_US||MP1', destinationLabel: 'Amazon US', warehouseId: null, marketplaceId: 'MP1', allocatedForecastQty: 1000, currentStockQty: 120, qualifiedIncomingQty: 0, incomingCompleteness: 'COMPLETE', calculatedGap: 880, recommendedQty: 888, provisionalOrderNeed: 888, residualShortageQty: null, blocked: false, blockedReason: null, formulaVersion: 'v', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] }, monthlyProjection: proj() };
  if (over) for (var k in over) L[k] = over[k];
  return L;
}
function whLine(wh, over) {
  var L = { recommendationLineId: 'W-' + wh, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: 'CO1100', siteSku: null, destinationType: 'WAREHOUSE', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||' + wh, destinationLabel: wh, warehouseId: wh, marketplaceId: null, allocatedForecastQty: 300, currentStockQty: null, qualifiedIncomingQty: null, incomingCompleteness: null, calculatedGap: null, recommendedQty: null, provisionalOrderNeed: null, residualShortageQty: null, blocked: true, blockedReason: 'ALLOCATION_FACTS_NOT_READY', formulaVersion: 'v', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] }, monthlyProjection: null };
  if (over) for (var k in over) L[k] = over[k];
  return L;
}
function envOk(lines) { return { success: true, data: { lines: lines }, meta: { requestId: 'REQ-1', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08', conflicts: 0 }, errors: [] }; }
function tick() { return Promise.resolve().then(function () {}).then(function () {}); }

// =============================================================================
section('map + primary-projection selection');
var mapped = _opRecoMapLine(mktLine());
ok(Array.isArray(mapped.monthlyProjection) && mapped.monthlyProjection.length === 4, 'map1 _opRecoMapLine carries monthlyProjection (4 tiers)');
ok(mapped.monthlyProjection[0].remainingGapQty === 0 && mapped.monthlyProjection[1].remainingGapQty === 1500, 'map2 valid 0 gap preserved (not dropped)');
ok(_opRecoMapLine({ monthlyProjection: undefined }).monthlyProjection === null, 'map3 absent monthlyProjection → null (never fabricated)');

_opRecoState = { status: 'READY', scopeKey: null, lines: [mapped] };
ok(_opRecoPrimaryProjection() && _opRecoPrimaryProjection().length === 4, 'pp1 single line with projection → primary projection');
_opRecoState = { status: 'READY', scopeKey: null, lines: [_opRecoMapLine(whLine('WH-A')), _opRecoMapLine(whLine('WH-B'))] };
ok(_opRecoPrimaryProjection() === null, 'pp2 multiple warehouse lines (blocked, no projection) → null (no page-side merge)');
_opRecoState = { status: 'LOADING', scopeKey: null, lines: [] };
ok(_opRecoPrimaryProjection() === null, 'pp3 not READY → null');

section('canonical qty formatter — valid zero vs null vs loading (§10)');
ok(_opRecoFmtQty(0, false) === '0', 'fmt1 valid 0 → "0" (never a dash)');
ok(_opRecoFmtQty(1500, false) === (1500).toLocaleString(), 'fmt2 positive → localized number');
ok(_opRecoFmtQty(null, false) === '—', 'fmt3 null settled → "—" (unavailable, never fabricated 0)');
ok(_opRecoFmtQty(null, true) === '…', 'fmt4 null while loading → "…"');

section('DOM patch — Demand Summary Gap + Order Allocation Suggested from monthlyProjection (READY marketplace)');
global.window.KM = { api: makeApi(true, envOk([mktLine()])) };
resetCells(false);
var scope = _opRecoScopeFor(ITEM);
_opRecoState = { status: 'READY', scopeKey: _opRecoKey(scope), sku: 'CO1100', lines: [_opRecoMapLine(mktLine())] };
_opRecoPatchCanonicalCells(ITEM);
ok(cellStore['gap:T1'].innerHTML === '0' && cellStore['gap:T2'].innerHTML === (1500).toLocaleString() && cellStore['gap:T3'].innerHTML === (7500).toLocaleString() && cellStore['gap:T4'].innerHTML === '0', 'C/D Gap column = remainingGapQty (T1 0, T2 1500, T3 7500, T4 0) — valid 0 rendered 0');
ok(cellStore['suggested:T1'].innerHTML === '0' && cellStore['suggested:T2'].innerHTML === (1500).toLocaleString() && cellStore['suggested:T3'].innerHTML === (7500).toLocaleString(), 'F/G Order Allocation Suggested = suggestedOrderQty (T1 0, T2 1500, T3 7500)');
ok(cellStore['demand:T1'].innerHTML === (7000).toLocaleString() && cellStore['demand:T2'].innerHTML === (4282).toLocaleString(), 'B Demand column = demandQty');

section('E/H unavailable tier → "—" (null suggested/gap, never fabricated)');
resetCells(false);
_opRecoState = { status: 'READY', scopeKey: _opRecoKey(scope), sku: 'CO1100', lines: [_opRecoMapLine(mktLine({ monthlyProjection: [{ tier: 'T1', month: '2026-09', demandQty: 7000, remainingGapQty: null, suggestedOrderQty: null }] }))] };
_opRecoPatchCanonicalCells(ITEM);
ok(cellStore['gap:T1'].innerHTML === '—' && cellStore['suggested:T1'].innerHTML === '—', 'E/H null gap/suggested → "—"');

section('O WAREHOUSE blocked → NO fabricated projection values ("—", not 0)');
resetCells(false);
_opRecoState = { status: 'READY', scopeKey: _opRecoKey(scope), sku: 'CO1100', lines: [_opRecoMapLine(whLine('WH-A')), _opRecoMapLine(whLine('WH-B'))] };
_opRecoPatchCanonicalCells(ITEM);
ok(cellStore['gap:T1'].innerHTML === '—' && cellStore['suggested:T2'].innerHTML === '—', 'O blocked warehouse (no projection) → gap/suggested "—" (never a fake 0)');

section('loading → "…" placeholder');
resetCells(false);
_opRecoState = { status: 'LOADING', scopeKey: _opRecoKey(scope), sku: 'CO1100', lines: [] };
_opRecoPatchCanonicalCells(ITEM);
ok(cellStore['gap:T1'].innerHTML === '…' && cellStore['suggested:T1'].innerHTML === '…', 'loading → "…" (transient, not "—", not 0)');

section('R/S/P end-to-end load — ONE request, patch applied, no writes, projection survives');
(async function () {
  _opRecoInvalidate('DISABLED');
  var api = makeApi(true, envOk([mktLine()]));
  global.window.KM = { api: api };
  requestOrderState.expandedRowKey = _roRowKey(ITEM); requestOrderState.data = [ITEM];
  resetCells(false);
  await Promise.resolve(_opLoadRecommendation(ITEM)).then(tick);
  ok(api._calls.getWorkspace === 1, 'R exactly ONE recommendation.workspace.get per expand (no per-tier/per-month loop)');
  ok(typeof api.getWorkspace === 'function' && typeof api.executeCommand === 'undefined', 'S no write API used (getWorkspace only; no executeCommand)');
  ok(_opRecoState.lines[0].monthlyProjection && _opRecoState.lines[0].monthlyProjection.length === 4, 'P monthlyProjection present on state (survives envelope map; cache stores env.data verbatim)');
  ok(cellStore['gap:T2'].innerHTML === (1500).toLocaleString() && cellStore['suggested:T3'].innerHTML === (7500).toLocaleString(), 'R2 async rerender patched Gap + Suggested from the canonical response');

  // ---- source-scans of the panel markup + FM3d mapping block --------------------------------------
  section('panel markup + ownership (source scans)');
  ok(/demandHead = recoOn \? '<th>Tier · Month<\/th><th>Demand<\/th><th>Gap<\/th><th>Suggested<\/th>'/.test(JS), 'U1 Demand Summary has Gap + (FM5-R4UI-R5 §6B) Suggested columns on the recommendation path');
  ok(/data-ro-gap-tier/.test(JS) && /data-ro-suggested-tier/.test(JS) && /data-ro-demand-tier/.test(JS), 'Q tier-identity cells (data-ro-*-tier), not row-index-only');
  ok(/\['T1', 'T2', 'T3', 'T4'\][\s\S]{0,400}data-ro-gap-tier/.test(JS), 'U2 Demand Summary maps T1–T4');
  ok(/data-ro-suggested-tier="' \+ t \+ '">' \+ _opRecoFmtQty/.test(JS) || /data-ro-suggested-tier[\s\S]{0,80}_opRecoFmtQty/.test(JS), 'F2 Suggested cell renders canonical suggestedOrderQty via the formatter (no page math)');
  ok(/Order Allocation \(T1–T3/.test(JS) && /var allocRows = \['T1', 'T2', 'T3'\]/.test(JS), 'V Order Allocation stays T1–T3 actionable (no writable T4 added)');
  ok(/_roEffectiveOrderQty\(item, i, e\);\s*\/\/ Order Qty default UNCHANGED/.test(JS), 'K/W manual Order Qty default + Send Request path UNCHANGED (frozen write path)');

  // FM3d canonical mapping region contains NO page-side gap/carton/suggested arithmetic
  var region = JS.slice(JS.indexOf('function _opRecoPrimaryProjection()'), JS.indexOf('function _opRecoSubsectionHtml'));
  ok(!/Math\.(ceil|floor|round)/.test(region), 'I/J no Math.ceil/floor/round in the FM3d consumer mapping (server-owned)');
  ok(!/-\s*(stock|currentStock|incoming|demandQty|coveredQty)/i.test(region) && /remainingGapQty/.test(region) && /suggestedOrderQty/.test(region), 'J Gap/Suggested come from canonical fields (remainingGapQty/suggestedOrderQty) — no page-side subtraction formula');

  // standalone technical table retired → collapsed diagnostics; diagnostics preserved
  ok(!/<div class="ro-subtitle">Recommendation — Order Need<\/div>/.test(JS), 'M standalone "Recommendation — Order Need" subtitle removed');
  ok(/<details class="ro-block-sub op-reco-block op-reco-diag">/.test(JS) && /Recommendation diagnostics/.test(JS), 'M2 retired table demoted to a collapsed diagnostics <details>');
  ok(/op-reco-host/.test(JS) && /blockedReason/.test(JS), 'N diagnostics still carry runtime detail (host + blockedReason preserved)');

  // feature-flag fallback: workspace OFF → subsection omitted + legacy demand-only branch preserved
  global.window.KM = { api: makeApi(false, envOk([mktLine()])) };
  ok(_opRecoSubsectionHtml(ITEM) === '', 'T workspace OFF → diagnostics omitted (legacy panel preserved)');
  ok(/if \(!recoOn\) return '<tr><td>' \+ t \+ ' · ' \+ mo\.label/.test(JS), 'T2 legacy demand-only Demand Summary row preserved on the OFF path');

  console.log('\n----------------------------------------');
  console.log('OP MONTHLY PROJECTION CONSUMER (F1-4B-FM3d): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
