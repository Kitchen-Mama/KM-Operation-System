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

// S8-R48-L1 — structural, fail-closed, and spelling-agnostic.
function fnOf(src, name) {
  var at = src.indexOf('function ' + name + '(');
  if (at === -1) throw new Error('FAIL-CLOSED: fn not found: ' + name);
  if (src.indexOf('function ' + name + '(', at + 1) !== -1) throw new Error('FAIL-CLOSED: ambiguous fn: ' + name);
  var depth = 0, started = false;
  for (var i = at; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('FAIL-CLOSED: unbalanced fn: ' + name);
}
function paramsOf(fnText) {
  var m = /^function\s+[A-Za-z0-9_$]+\s*\(([^)]*)\)/.exec(fnText);
  if (!m) throw new Error('FAIL-CLOSED: no signature');
  return m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}
/** Does `body` call `callee` with the consumer's OWN parameters, at the given positions? */
function delegatesWithOwnParams(body, callee, params, picks) {
  var args = picks.map(function (i) { return params[i]; });
  if (args.some(function (a) { return !a; })) return false;
  return new RegExp(callee + '\\s*\\(\\s*' + args.join('\\s*,\\s*') + '\\s*\\)').test(body);
}

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
  // ---- K/W — the frozen manual Order Qty default, asserted by BEHAVIOUR and SHAPE -----------------
  // S8-R48-L1 — this pinned the literal `_roEffectiveOrderQty(item, i, e);   // Order Qty default
  // UNCHANGED` — one inline call site, its local parameter SPELLINGS, and its trailing comment. All
  // three moved in F1-4B-FM6-R4E3-PRE: the inline call was extracted into two named consumers
  // (_roRowOrderQtyDisplay_ / _roSendOrderQty_) and the locals became (item, idx, edit). The claim
  // the assertion was making — the manual default and the Send path are unchanged — remained true
  // the whole time; the function's BODY is byte-identical to its original form. Only the spelling
  // broke, which is the one thing that does not matter.
  //
  // So the claim is now checked where it lives: the behaviour of the function, and the SHAPE of the
  // consumers' delegation — read from each consumer's OWN signature, so renaming a local moves the
  // assertion with it instead of breaking it.
  var EFF_FN = fnOf(JS, '_roEffectiveOrderQty');
  var EFF_P = paramsOf(EFF_FN);
  ok(EFF_P.length === 3, 'K/W1 _roEffectiveOrderQty still takes (item, index, edit) — three positional inputs');

  // BEHAVIOUR: a manual edit wins; otherwise the tier suggestion; a persisted 0 is a real decision.
  var effStub = new Function('_roTierSuggested',
    EFF_FN + '; return _roEffectiveOrderQty;')(function (item, idx) { return idx === 'T9' ? null : 42; });
  ok(effStub(ITEM, 'T1', { orderQty: 7 }) === 7, 'K/W2 a manual edit is the default');
  ok(effStub(ITEM, 'T1', { orderQty: 0 }) === 0, 'K/W2a a manual ZERO is a real decision, not a blank');
  ok(effStub(ITEM, 'T1', { orderQty: '' }) === 42, 'K/W2b a blank edit falls through to the tier suggestion');
  ok(effStub(ITEM, 'T1', null) === 42, 'K/W2c no edit → the tier suggestion');
  ok(effStub(ITEM, 'T9', null) === null, 'K/W2d no suggestion → null, never a fabricated quantity');

  // SHAPE: both consumers delegate, passing their own (item, index, edit) through positionally.
  [['_roRowOrderQtyDisplay_', [0, 1, 3]], ['_roSendOrderQty_', [0, 1, 3]]].forEach(function (c) {
    var body = fnOf(JS, c[0]);
    var p = paramsOf(body);
    ok(delegatesWithOwnParams(body, '_roEffectiveOrderQty', p, c[1]),
      'K/W3 ' + c[0] + ' falls back to _roEffectiveOrderQty with its own (' + c[1].map(function (i) { return p[i]; }).join(', ') + ')');
    // FAIL CLOSED: the canonical-draft guard must come BEFORE the fallback, or a SKU with a
    // persisted draft can assert a recomputed quantity — the live 400-against-360 defect.
    ok(body.indexOf('_roHasCanonicalDraft_') !== -1
      && body.indexOf('_roHasCanonicalDraft_') < body.indexOf('_roEffectiveOrderQty'),
      'K/W4 ' + c[0] + ' guards the fallback with _roHasCanonicalDraft_ FIRST (no ephemeral quantity)');
  });

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

  // ================================================================================================
  section('negative mutants — the consumer wiring must be able to fail');
  // The assertion these replace could only fail by being out-spelled, which is how it failed while
  // the contract held. Each mutant edits the page source in memory and re-runs the check it breaks.
  var mutants = 0, survived = 0;
  function mutant(label, probe) {
    mutants++;
    var detected = false, crashed = null;
    try { detected = probe(); } catch (e) { crashed = e; }
    if (crashed) { survived++; fail++; console.error('FAIL M' + mutants + ' CRASHED (not a kill) — ' + label + ' — ' + crashed.message); return; }
    if (!detected) { survived++; fail++; console.error('FAIL M' + mutants + ' SURVIVED — ' + label); }
    else { pass++; console.log('ok   M' + mutants + ' killed — ' + label); }
  }
  function delegationHolds(src, name) {
    var b = fnOf(src, name);
    return delegatesWithOwnParams(b, '_roEffectiveOrderQty', paramsOf(b), [0, 1, 3]);
  }
  function guardHolds(src, name) {
    var b = fnOf(src, name);
    return b.indexOf('_roHasCanonicalDraft_') !== -1
      && b.indexOf('_roHasCanonicalDraft_') < b.indexOf('_roEffectiveOrderQty');
  }
  function swapIn(name, find, repl) {
    var b = fnOf(JS, name);
    if (b.indexOf(find) === -1) throw new Error('FAIL-CLOSED: mutation anchor absent in ' + name);
    return JS.replace(b, b.replace(find, repl));
  }
  function effWith(mutateFn) {
    var f = mutateFn(fnOf(JS, '_roEffectiveOrderQty'));
    return new Function('_roTierSuggested', f + '; return _roEffectiveOrderQty;')(function () { return 42; });
  }

  mutant('the Send consumer stops calling _roEffectiveOrderQty', function () {
    return !delegationHolds(swapIn('_roSendOrderQty_', 'return _roEffectiveOrderQty(item, idx, edit);', 'return null;'), '_roSendOrderQty_');
  });
  mutant('the display consumer stops calling _roEffectiveOrderQty', function () {
    return !delegationHolds(swapIn('_roRowOrderQtyDisplay_', 'return _roEffectiveOrderQty(item, idx, edit);', 'return null;'), '_roRowOrderQtyDisplay_');
  });
  mutant('scope propagation broken — the tier index is not passed through', function () {
    return !delegationHolds(swapIn('_roSendOrderQty_', '_roEffectiveOrderQty(item, idx, edit)', "_roEffectiveOrderQty(item, 'T1', edit)"), '_roSendOrderQty_');
  });
  mutant('the canonical-draft guard is bypassed — an ephemeral qty can be asserted again', function () {
    return !guardHolds(swapIn('_roSendOrderQty_', 'if (_roHasCanonicalDraft_(item)) return null;', ''), '_roSendOrderQty_');
  });
  mutant('the consumed projection field is changed', function () {
    var anchor = 'monthlyProjection: Array.isArray(L.monthlyProjection)';
    if (JS.indexOf(anchor) === -1) throw new Error('FAIL-CLOSED: projection anchor absent');
    return !/monthlyProjection: Array\.isArray\(L\.monthlyProjection\)/.test(
      JS.replace(anchor, 'monthlyProjection: Array.isArray(L.monthlyProjectionX)'));
  });
  mutant('the default ladder is inverted — a tier suggestion outranks a manual edit', function () {
    return effWith(function (f) { return f.replace("if (edit && edit.orderQty != null && edit.orderQty !== '') return Number(edit.orderQty);", ''); })(ITEM, 'T1', { orderQty: 7 }) !== 7;
  });
  mutant('a persisted manual ZERO is swallowed as a blank', function () {
    return effWith(function (f) { return f.replace("edit.orderQty != null && edit.orderQty !== ''", 'edit.orderQty'); })(ITEM, 'T1', { orderQty: 0 }) !== 0;
  });
  mutant('(inverted) locals renamed with NO behaviour change — the suite must STILL pass', function () {
    // The exact failure this round repaired: (item, i, e) → (item, idx, edit) broke a correct page.
    var b = fnOf(JS, '_roSendOrderQty_');
    var src = JS.replace(b, b.replace(/\bidx\b/g, 'tierIx').replace(/\bedit\b/g, 'userEdit'));
    return delegationHolds(src, '_roSendOrderQty_') && guardHolds(src, '_roSendOrderQty_');
  });

  console.log('\n----------------------------------------');
  console.log('OP MONTHLY PROJECTION CONSUMER (F1-4B-FM3d): ' + pass + ' passed, ' + fail + ' failed, '
    + mutants + ' mutants, ' + survived + ' survived, ' + (mutants >= 8 ? 'vacuity clean' : 'VACUOUS'));
  if (fail > 0) { process.exitCode = 1; }
})();
