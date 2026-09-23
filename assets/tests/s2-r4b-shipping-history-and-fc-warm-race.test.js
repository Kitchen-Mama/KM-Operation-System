// Kitchen Mama Operation System — S2-R4B SHIPPING HISTORY + FC POST-WRITE WARM RACE.
// Run: node assets/tests/s2-r4b-shipping-history-and-fc-warm-race.test.js
// ---------------------------------------------------------------------------------------------------------
// TWO UNRELATED THINGS SHARE THIS SUITE BECAUSE ONE ROUND SHIPPED THEM, and each is asserted against its own
// rule rather than against the other.
//
// A–D  SHIPPING HISTORY. SHIPMENT_CENTER_SPEC says Shipment Overview is a status-filtered VIEW over
//      shipments / shipment_lines, and no shipping_history table exists anywhere in the repository. The
//      canonical read was already built and already fail-closed; what was still wrong was that the LOAD of
//      the legacy sessionStorage/mock shadow was unconditional while only its RENDER was gated. An authority
//      that is merely unrendered is still an authority.
//
// E–H  FC POST-WRITE WARM RACE (§10). The Builder prerequisite loader is single-flight per PATH; the
//      post-write warm-up had no path and registered nothing, so a reopen during the warm-up window bought
//      the same scoped read a second time. Efficiency only — no business semantics are touched, and the
//      suite pins that too.
//
// Both halves drive the REAL shipped source, lifted function-by-function in the pattern the other fc-*
// suites use. Every mutant injects a fault a person could plausibly write.

var fs = require('fs');
var path = require('path');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var FCS = read('js/pages/fc-summary.js');
var SH = read('js/pages/shipping-history.js');
var SP = read('js/pages/shipping-plan.js');
var SPEC = read('../docs/planning/SHIPMENT_CENTER_SPEC.md');

var pass = 0, fail = 0;
function ok(c, label, detail) {
  if (c) { pass++; console.log('ok   ' + label); }
  else { fail++; console.error('FAIL ' + label + (detail === undefined ? '' : '\n  got ' + JSON.stringify(detail))); }
}
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('ok   ' + label); }
  else { fail++; console.error('FAIL ' + label + '\n  exp ' + JSON.stringify(b) + '\n  got ' + JSON.stringify(a)); }
}
function section(n) { console.log('\n== ' + n + ' =='); }

// Lift ONE function's source, brace-balanced, so the sandbox runs the shipped body rather than a copy.
function fnSrc(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('no function ' + name);
  var depth = 0, seen = false;
  for (var i = src.indexOf('{', start); i < src.length; i++) {
    var c = src[i];
    if (c === '{') { depth++; seen = true; }
    else if (c === '}') { depth--; if (seen && depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced ' + name);
}
// A mutant whose anchor has drifted injects NOTHING, and a mutant that injects nothing cannot fail —
// so this REFUSES rather than scoring it. The shipped sources are CRLF, so every anchor is first
// converted to the newline the source actually uses; that conversion is the difference between a
// mutant that tests something and a mutant that silently tests the unmutated file.
function nl(src, text) { return src.indexOf('\r\n') !== -1 ? text.split('\n').join('\r\n') : text; }
function faulted(src, from, to, tag) {
  var a = nl(src, from), b = nl(src, to);
  if (src.indexOf(a) === -1) throw new Error(tag + ' anchor drifted — the mutant would inject nothing');
  return src.split(a).join(b);
}

// =========================================================================================================
section('A · SHIPMENT_CENTER_SPEC — Shipping History is a projection, and there is no history table');
// =========================================================================================================
{
  ok(/Shipment Overview[\s\S]{0,400}?views over `shipments` \/ `shipment_lines`/.test(SPEC)
     || /two status-filtered views over `shipments` \/ `shipment_lines`/.test(SPEC),
    'A1  the spec calls Overview a status-filtered view over shipments / shipment_lines');
  ok(/must read from the \*\*same shipment data source\*\*, not create a parallel DB/.test(SPEC),
    'A2  and forbids a parallel shipment database outright');

  // The negative that makes PROJECTION the only available answer: no such table is declared anywhere.
  var declared = [];
  ['specs/active/apps-script', '../docs/planning'].forEach(function (dir) {
    var base = path.join(__dirname, '..', dir);
    if (!fs.existsSync(base)) return;
    fs.readdirSync(base).forEach(function (f) {
      if (!/\.(gs|md)$/.test(f)) return;
      var s = fs.readFileSync(path.join(base, f), 'utf8');
      if (/\bshipping_history\b|\bshipment_history\b/.test(s)) declared.push(dir + '/' + f);
    });
  });
  eq(declared, [], 'A3  no shipping_history / shipment_history table is declared in any spec or handler', declared);
}

// =========================================================================================================
section('B · the legacy Shipping History shadow cannot reach business state in canonical mode');
// =========================================================================================================
function shWorld(opts) {
  var store = {};
  if (opts.stored !== undefined) store.shippingHistory = JSON.stringify(opts.stored);
  var sandbox = [
    'var shippingHistoryMockData = ' + JSON.stringify(opts.mock || [{ id: 'DEMO-1', country: 'US' }]) + ';',
    'var historyState = { data: null, hasSearched: false };',
    fnSrc(SH, '_shUseDb'),
    fnSrc(SH, 'loadHistoryData'),
    'return { load: loadHistoryData, state: historyState, useDb: _shUseDb };'
  ].join('\n');
  var sessionStorage = {
    reads: 0,
    getItem: function (k) { this.reads++; return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); }
  };
  var window = { KM: { DB: opts.canonical
    ? { isScopedReadEligible: function () { return true; }, getShipments: function () { return []; } }
    : {} } };
  var api = new Function('window', 'sessionStorage', sandbox)(window, sessionStorage);
  return { api: api, sessionStorage: sessionStorage, store: store };
}
{
  // Canonical (production) posture, with a full stale key AND the demo fixture both available.
  var W = shWorld({ canonical: true, stored: [{ id: 'GHOST-SP-1', country: 'CA', totalCost: 9999 }],
    mock: [{ id: 'DEMO-1', country: 'US' }] });
  eq(W.api.useDb(), true, 'B1  the canonical posture is active');
  W.api.load();
  eq(W.api.state.data, [], 'B2  historyState holds NOTHING — not the stale rows, not the demo fixture');
  eq(W.sessionStorage.reads, 0, 'B3  and the browser store is not even read on this path');
  ok(W.store.shippingHistory !== undefined,
    'B4  the key itself survives — retirement ignores residue, it does not destroy it');

  // Demo mode is a real mode and is deliberately unchanged.
  var D = shWorld({ canonical: false, stored: [{ id: 'SP-1' }] });
  eq(D.api.useDb(), false, 'B5  demo posture');
  D.api.load();
  eq(D.api.state.data, [{ id: 'SP-1' }], 'B6  demo mode still reads the store, exactly as before');
  var D2 = shWorld({ canonical: false, mock: [{ id: 'DEMO-9' }] });
  D2.api.load();
  eq(D2.api.state.data, [{ id: 'DEMO-9' }], 'B7  and still falls back to the demo fixture when the store is empty');
}

// =========================================================================================================
section('C · the writer that fills that key is a demo flow, and fabricates money');
// =========================================================================================================
{
  var md = SP.slice(SP.indexOf('function markAsDone('));
  md = md.slice(0, md.indexOf('\nfunction '));
  ok(/sessionStorage\.setItem\('shippingHistory'/.test(md),
    'C1  markAsDone is the only writer of the shippingHistory key');
  ok(/unitCost\s*=\s*2\.5/.test(md) && /totalCost\s*=\s*totalPcs\s*\*\s*unitCost/.test(md),
    'C2  and it invents totalCost from a hardcoded unit cost — these rows were never real');
  ok(/replenishmentMockData/.test(md),
    'C3  taking cartons out of a demo fixture as well');
  // Reachability: the legacy renderer that draws its button returns early in canonical mode.
  ok(/if \(_spUseDb\(\) \|\| _spEffectiveWorkspace\(\)\) \{ renderShippingPlanFromDb\(\); return; \}/.test(SP),
    'C4  the legacy renderer that hosts its Done button is unreachable whenever DB or Workspace is on');
}

// =========================================================================================================
section('D · the canonical read stays fail-closed, and no canonical path moved');
// =========================================================================================================
{
  ok(/_shReadModel = window\.KM\.DB\.adaptShipmentWorkspace\(env\.data\)/.test(SH),
    'D1  the canonical read is still getWorkspace(shipment) -> adaptShipmentWorkspace');
  var re = SH.slice(SH.indexOf('function _shRenderError_('));
  re = re.slice(0, re.indexOf('\n}') + 2);
  ok(/_shReadModel = null;/.test(re),
    'D2  a read failure still NULLS the read model rather than keeping a half-truth');
  ok(!/historyState\.data/.test(re) && !/shippingHistoryMockData/.test(re),
    'D3  and does not fall back to browser business state or the demo fixture');
  // The render gate is unchanged: demo data is still only drawable in demo mode.
  ok(/if \(!_shUseDb\(\)\) \{[\s\S]{0,400}?filterHistoryData\(historyState\.data/.test(SH),
    'D4  historyState.data is still reachable ONLY behind the demo gate');
  // Lifecycle / identity untouched by this round.
  ok(/SH_OVERVIEW_STATUSES\[s\.status\]/.test(SH), 'D5  Overview still filters on canonical shipment status');
  ok(/linesByShipment\[l\.shipmentId\]/.test(SH) || /linesByShipment\[s\.shipmentId\]/.test(SH),
    'D6  and still keys lines by the physical shipment_id');
}

// =========================================================================================================
section('E · FC §10 — the post-write warm-up publishes what it is fetching');
// =========================================================================================================
// A sandbox holding the REAL prerequisite loader and the REAL warm-up over a counting refreshCacheTables.
function fcWorld(mutations) {
  var lift = [
    'var _fcSecondaryLoaded = false;',
    'var _fcPrereqLoadedPaths_ = {};',
    'var _fcPrereqLoadedTables_ = {};',
    'var _fcPrereqFlightByPath_ = {};',
    'var _fcPrereqInflightTables_ = {};',
    'var _fcPrereqState_ = "IDLE";',
    'var _fcPrereqLoads_ = 0;',
    'var _fcPrereqLastError_ = null;',
    'var _fcMeta_ = {};',
    'var FC_PREREQ_ = { IDLE:"IDLE", LOADING:"LOADING_PREREQUISITES", READY:"READY", REFUSED:"REFUSED", FAILED_PERMANENT:"FAILED_PERMANENT" };',
    'var _FC_PREREQ_TABLES_ = { special: ["campaigns","campaign_sku_lines","fc_special_events"] };',
    'function _fcPrereqPath_(m) { return "special"; }',
    'function _fcSliceTables_(s) { return s === "events" ? ["campaigns","campaign_sku_lines","fc_special_events"] : null; }',
    'function _fcPrereqRetryable_(e) { return true; }',
    'function _fcReconcileFromReceipts_(scope) { return []; }',
    fnSrc(FCS, '_fcPrereqMissing_'),
    fnSrc(FCS, '_fcMarkTablesInflight_'),
    fnSrc(FCS, '_fcReleaseTablesInflight_'),
    fnSrc(FCS, '_fcInflightFor_'),
    fnSrc(FCS, '_fcSettlePrereqPath_'),
    fnSrc(FCS, '_fcPostWriteWarm_'),
    fnSrc(FCS, '_fcLoadPrerequisites_'),
    'return { warm: _fcPostWriteWarm_, prereq: _fcLoadPrerequisites_,'
      + ' tablesLoaded: function () { return _fcPrereqLoadedTables_; },'
      + ' inflight: function () { return _fcPrereqInflightTables_; },'
      + ' state: function () { return _fcPrereqState_; } };'
  ].join('\n');
  (mutations || []).forEach(function (m) { lift = faulted(lift, m[0], m[1], m[2]); });

  var calls = [];          // every refreshCacheTables invocation, in order
  var gate = null;         // resolve/reject the in-flight request by hand
  var window = { KM: { DB: { refreshCacheTables: function (tables) {
    calls.push(tables.slice().sort());
    return new Promise(function (res, rej) { gate = { res: res, rej: rej }; });
  } } } };
  var api = new Function('window', lift)(window);
  return { api: api, calls: calls,
    gate: function () { var g = gate; gate = null; return g; },
    settle: function (okness) { var g = gate; gate = null;
      if (okness) g.res([]); else g.rej(new Error('read failed')); } };
}

{
  var WE = fcWorld();   // uniquely named: var is function-scoped, and sections G and I declare their own worlds
  var warmP = WE.api.warm({ slice: 'events' });
  eq(WE.calls.length, 1, 'E1  the post-write warm-up issues exactly one scoped read');
  eq(WE.calls[0], ['campaign_sku_lines', 'campaigns', 'fc_special_events'], 'E1a for the invalidated tables');
  eq(Object.keys(WE.api.inflight()).sort(), ['campaign_sku_lines', 'campaigns', 'fc_special_events'],
    'E2  and PUBLISHES them as in flight before awaiting');

  // The reopen, while the warm-up is still in the air.
  var reopenP = WE.api.prereq('special');
  eq(WE.calls.length, 1, 'E3  a Builder reopen during the warm-up issues NO second read — it joins');

  WE.settle(true);
  // The questions below are about the state the JOINED reopen leaves behind, so they are asked after
  // it has settled AND after the microtask queue has drained — waiting on warmP alone can observe the
  // moment between the warm-up resolving and the joiner finishing its own bookkeeping, which is a
  // property of this harness rather than of the code under test.
  var done = Promise.all([warmP, reopenP]).then(function () {
    return new Promise(function (r) { setTimeout(r, 0); });
  }).then(function () {
    eq(WE.calls.length, 1, 'E4  and still exactly one read after both settle');
    eq(Object.keys(WE.api.inflight()), [], 'E5  the in-flight index is empty again — no leaked entry');
    eq(WE.api.state(), 'READY', 'E6  the joined reopen ends READY, not stuck LOADING');
    eq(Object.keys(WE.api.tablesLoaded()).sort(), ['campaign_sku_lines', 'campaigns', 'fc_special_events'],
      'E7  with every table latched warm exactly once');
  });
}

// =========================================================================================================
section('F · a warm-up that FAILS must not strand the reopen');
// =========================================================================================================
var fPromise = (function () {
  var W = fcWorld();
  var warmP = W.api.warm({ slice: 'events' });
  var reopenP = W.api.prereq('special');
  eq(W.calls.length, 1, 'F1  one read in flight, joined by the reopen');
  W.settle(false);                       // the warm-up request dies
  return Promise.resolve(warmP).then(function () {
    return Promise.resolve(reopenP).then(function () { return 'resolved'; }, function () { return 'rejected'; });
  }).then(function (outcome) {
    // The join released the index, saw the tables still missing, and asked properly on its own behalf.
    eq(W.calls.length, 2, 'F2  the reopen then issues its OWN request rather than inheriting a dead one');
    ok(outcome === 'resolved' || outcome === 'rejected', 'F3  and it settles — never a permanent Loading', outcome);
    eq(Object.keys(W.api.inflight()).length === 0 || W.calls.length === 2, true,
      'F4  no table is left pointing at a promise that has already died');
  });
})();

// =========================================================================================================
section('G · the join is an INDEX, not a cache — it holds no data and latches nothing by itself');
// =========================================================================================================
{
  var W = fcWorld();
  W.api.warm({ slice: 'events' });
  eq(Object.keys(W.api.tablesLoaded()), [],
    'G1  publishing a table as in-flight does NOT mark it warm — only arrival does');
  var idx = W.api.inflight();
  var vals = Object.keys(idx).map(function (k) { return typeof idx[k].then; });
  eq(vals, ['function', 'function', 'function'], 'G2  every entry is a promise, never a row set');
  // Source rule: the index must never be consulted as a data source.
  var body = FCS.slice(FCS.indexOf('function _fcInflightFor_('));
  body = body.slice(0, body.indexOf('\n}') + 2);
  ok(!/_fcPrereqLoadedTables_/.test(body),
    'G3  and the join helper does not latch anything on its own authority');
}

// =========================================================================================================
section('H · nothing business-bearing moved');
// =========================================================================================================
{
  // §9's invariant: a confirmed write whose readback failed is still reported as a SUCCESSFUL write.
  ok(/SAVED_STALE:\s*'Saved successfully, but the view could not refresh\.'/.test(FCS),
    'H1  SAVED_STALE still says the write SUCCEEDED');
  ok(/_fcViewState_ = _fcReadModel \? FC_VIEW_\.STALE : FC_VIEW_\.REFUSED;/.test(FCS),
    'H2  a failed readback marks the view stale rather than claiming current data');
  ok(/if \(_sc\.merged\) \{[\s\S]{0,200}?_fcViewState_ = FC_VIEW_\.CURRENT;[\s\S]{0,60}?return;/.test(FCS),
    'H3  receipt reconciliation still short-circuits the readback — zero requests when the receipt is complete');
  ok(/_fcReadbackFlight_\) return;/.test(FCS),
    'H4  the Refresh-view control is still single-flight — extra clicks issue nothing');
  // §11 — the R20 large-batch writer is untouched by this round.
  ok(/campaignLineKeyLookup_/.test(read('specs/active/apps-script/20_campaign_write_handlers.gs')),
    'H5  the R20 stage-2 batch resolver is still in place');
  // §12 — pricing is a different task and this round did not enter it.
  ok(!/auto_regular_price|base_regular_price/.test(SH), 'H6  Shipping History touches no pricing field');
}

// =========================================================================================================
section('I · driven mutants');
// =========================================================================================================
var caught = 0, survived = 0;
function mutant(label, mutations, detect) {
  var W;
  try { W = fcWorld(mutations); }
  catch (e) { console.error('FAIL     ' + label + ' — ' + e.message); fail++; return; }
  var died = false;
  try { died = detect(W); } catch (e) { died = true; }
  // Some faults are only observable once a request has settled, so a detector may answer with a
  // promise. It is scored when it resolves, and the suite waits for it before printing the tally.
  if (died && typeof died.then === 'function') { _mutantWaits.push(died.then(function (v) { score(v, label); })); return; }
  score(died, label);
}
var _mutantWaits = [];
function score(died, label) {
  if (died) { caught++; pass++; console.log('ok       ' + label + ' (caught)'); }
  else { survived++; fail++; console.error('FAIL     ' + label + ' SURVIVED'); }
}

mutant('M1 the warm-up stops publishing its tables',
  [['  _fcMarkTablesInflight_(need, warm);\n  return warm;', '  return warm;', 'M1']],
  function (W) {
    W.api.warm({ slice: 'events' });
    W.api.prereq('special');
    return W.calls.length !== 1;        // the reopen bought a duplicate read
  });

mutant('M2 the loader stops joining and always asks',
  [['  var joined = _fcInflightFor_(need);', '  var joined = [];', 'M2']],
  function (W) {
    W.api.warm({ slice: 'events' });
    W.api.prereq('special');
    return W.calls.length !== 1;
  });

mutant('M3 a settled flight is left in the index for ever',
  [['    _fcReleaseTablesInflight_(need, warm);\n    _fcMeta_.postWriteWarmEnd = Date.now();\n    need.forEach',
    '    _fcMeta_.postWriteWarmEnd = Date.now();\n    need.forEach', 'M3']],
  function (W) {
    W.api.warm({ slice: 'events' });
    W.settle(true);
    return new Promise(function (res) { setTimeout(function () {
      res(Object.keys(W.api.inflight()).length !== 0);
    }, 0); });
  });

mutant('M4 publishing a table also marks it warm',
  [['function _fcMarkTablesInflight_(tables, flight) {\n  (tables || []).forEach(function (t) { _fcPrereqInflightTables_[t] = flight; });',
    'function _fcMarkTablesInflight_(tables, flight) {\n  (tables || []).forEach(function (t) { _fcPrereqInflightTables_[t] = flight; _fcPrereqLoadedTables_[t] = true; });', 'M4']],
  function (W) {
    W.api.warm({ slice: 'events' });
    return Object.keys(W.api.tablesLoaded()).length !== 0;   // warm before the data arrived
  });

mutant('M5 the release clears entries it does not own',
  [['    if (_fcPrereqInflightTables_[t] === flight) delete _fcPrereqInflightTables_[t];',
    '    delete _fcPrereqInflightTables_[t];', 'M5']],
  function (W) {
    // Two flights for the same tables: the SECOND owns the index. When the FIRST settles, an
    // ownership-blind release erases the second's entry and the next reopen buys a duplicate read.
    W.api.warm({ slice: 'events' });
    var firstGate = W.gate();
    W.api.warm({ slice: 'events' });          // second flight takes ownership of the same tables
    var second = W.api.inflight()['campaigns'];
    firstGate.res([]);                        // the FIRST request lands
    return new Promise(function (r) { setTimeout(function () {
      // Correct code: the second flight still owns the entry. Mutant: the entry is gone.
      r(W.api.inflight()['campaigns'] !== second);
    }, 0); });
  });

// The Shipping History half gets its own mutants, against its own world.
function shMutant(label, from, to, detect) {
  var src;
  try { src = faulted(SH, from, to, label); }
  catch (e) { console.error('FAIL     ' + label + ' — ' + e.message); fail++; return; }
  var store = { shippingHistory: JSON.stringify([{ id: 'GHOST-1' }]) };
  var sandbox = [
    'var shippingHistoryMockData = [{ id: "DEMO-1" }];',
    'var historyState = { data: null };',
    fnSrc(src, '_shUseDb'),
    fnSrc(src, 'loadHistoryData'),
    'return { load: loadHistoryData, state: historyState };'
  ].join('\n');
  var sessionStorage = { getItem: function (k) { return store[k] === undefined ? null : store[k]; } };
  var window = { KM: { DB: { isScopedReadEligible: function () { return true; },
    getShipments: function () { return []; } } } };
  var api = new Function('window', 'sessionStorage', sandbox)(window, sessionStorage);
  var died = false;
  try { api.load(); died = detect(api.state.data); } catch (e) { died = true; }
  if (died) { caught++; pass++; console.log('ok       ' + label + ' (caught)'); }
  else { survived++; fail++; console.error('FAIL     ' + label + ' SURVIVED'); }
}

shMutant('M6 the canonical guard is removed',
  '    if (_shUseDb()) { historyState.data = []; return; }', '',
  function (data) { return JSON.stringify(data) !== '[]'; });

shMutant('M7 the guard loads the stale rows instead of nothing',
  '    if (_shUseDb()) { historyState.data = []; return; }',
  '    if (_shUseDb()) { historyState.data = JSON.parse(sessionStorage.getItem("shippingHistory") || "[]"); return; }',
  function (data) { return JSON.stringify(data) !== '[]'; });

shMutant('M8 the guard falls back to the demo fixture',
  '    if (_shUseDb()) { historyState.data = []; return; }',
  '    if (_shUseDb()) { historyState.data = shippingHistoryMockData; return; }',
  function (data) { return JSON.stringify(data) !== '[]'; });

// =========================================================================================================
Promise.all([done, fPromise].concat(_mutantWaits)).then(function () {
  console.log('\n' + new Array(101).join('-'));
  console.log('S2-R4B SHIPPING HISTORY + FC WARM RACE: ' + pass + ' passed, ' + fail + ' failed'
    + '  ·  mutants ' + (caught + survived) + ', survived ' + survived);
  console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
  console.log(new Array(101).join('-'));
  if (fail > 0) process.exitCode = 1;
});
