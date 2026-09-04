// ================================================================================================================
// F1-7N-FC-1B-E3-R4 — INVENTORY FIRST-LOAD TIMEOUT + EXECUTION DEMAND SNAPSHOT FREEZE
// ----------------------------------------------------------------------------------------------------------------
// THE FAILURE SCREEN NAMED THE WRONG CAUSE, AND THREE ROUNDS FOLLOWED IT.
//
// Site Inventory's first entry timed out at the 60 s client bound; the second Search succeeded. The screen at
// the moment of failure read "Select Country" / "Select Marketplace", which made the obvious reading "it fired
// an unscoped read before a scope was chosen". Executed through the shipped page, that reading is FALSE:
//
//   • a blank or partial scope issues ZERO inventory requests and is refused before dispatch;
//   • a COMPLETE US/Amazon Search sends the BYTE-IDENTICAL request a blank page would;
//   • the request after a timeout is BYTE-IDENTICAL to the one that timed out.
//
// The blank selectors are an ARTIFACT of the failure, not its cause: the bootstrap set them only on its
// success path, so a failed restore painted a red error over two empty dropdowns.
//
// THE REAL CAUSE IS THAT THIS READ HAS NO BOUND. The request carries no scope, the handler has no scope
// parameter, and every primary read returns twenty-one whole tables. Two of them — the daily and weekly sales
// snapshots — grow every day forever, and their consumers read seven days and one week. That is
// UNSCOPED_FULL_WORKSPACE_READ, and the fix is a per-key recent-period projection whose equivalence is proved
// against the real consumers rather than assumed.
//
// AND ONE FACT WAS STILL BEING READ TWICE. The screen's Suggested Qty is a MATERIALIZED row; the AI Plan read
// the recommendation workspace, which RECOMPUTES live. Same engine, two moments, nothing comparing them. The
// materialized row is now the authority for every quantity, with typed refusals and lineage.
//
// Run: node assets/tests/first-load-timeout-and-demand-snapshot-freeze-f1-7n-fc-1b-e3-r4.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
// Comments AND string literals removed. A keyword sweep that cannot tell a CALL from a SENTENCE has produced a
// false answer repeatedly in this feature's history, so anything asking "does the code DO x" runs on this.
function ops(src) {
  return code(src).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function swap(src, find, repl) {
  var re = new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));
  if (!re.test(src)) throw new Error('swap anchor not found: ' + String(find).slice(0, 90));
  return String(src).replace(re, repl);
}

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var G60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G42 = read('assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var G43 = read('assets/specs/active/apps-script/43_api_v1_gap_materialization.gs');
var HLTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var KMWHA_SRC = read('assets/js/core/supply-planning-weekly-harvest-adapter.js');
var MREG = read('assets/js/core/method-registry.js');
var BUNDLE = read('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var INDEX = read('index.html');
var NL = PAGE.indexOf('\r\n') !== -1 ? '\r\n' : '\n';

// ---- a sandbox carrying 60_ (pure parts) --------------------------------------------------------------------
function gsCtx(files) {
  var sb = { console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object,
    Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, Error: Error,
    RegExp: RegExp, Boolean: Boolean, TypeError: TypeError };
  sb.global = sb;
  var c = vm.createContext(sb);
  files.forEach(function (f) {
    try { vm.runInContext(read('assets/specs/active/apps-script/' + f), c, { filename: f }); }
    catch (e) { console.log('LOAD ' + f + ': ' + e.message); }
  });
  return c;
}
var C60 = gsCtx(['60_api_v1_inventory_replenishment_workspace.gs']);
var C61 = gsCtx(['90_generated_supply_planning_bundle.gs', '61_api_v1_weekly_ai_plan.gs']);

// ================================================================================================================
section('§C — THE ROOT CAUSE, MEASURED. The read has no scope, and never had one.');
// ================================================================================================================
var handler60 = vm.runInContext('handleInventoryReplenishmentWorkspaceGet_', C60);
function io60(sizes, reads) {
  return { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { return {}; },
    readTable: function (ss, name) {
      if (reads) reads.push(name);
      var n = sizes[name] || 0, a = [];
      for (var i = 0; i < n; i++) a.push({ sku: 'S' + i, country: 'US', marketplace: 'Amazon', marketplace_id: 'M' + i, warehouse_id: 'W' + i });
      return a;
    } };
}
var SIZES = { marketplaces: 40, marketplace_skus: 495, sku_details: 300, warehouses: 25,
  amazon_inventory_snapshot: 4000, amazon_inventory_health_snapshot: 4000, amazon_daily_sales_snapshot: 52000,
  amazon_weekly_sales_snapshot: 9000, fc_regular_forecast: 829, fc_target_rules: 120, fc_special_events: 60,
  overseas_inventory_snapshot: 1500, factory_stock: 900, shipments: 2200, shipment_lines: 8800,
  shipping_plans: 1400, shipping_plan_lines: 5600, shipping_allocation_drafts: 1900,
  shipping_allocation_draft_lines: 7400, carrier_lead_times: 300, carrier_rate_cards: 450 };
var readsA = [], readsB = [];
var envA = handler60({ payload: { include: { carrierPlanning: true } } }, io60(SIZES, readsA));
var envB = handler60({ payload: { include: { carrierPlanning: true }, company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' } }, io60(SIZES, readsB));
eq(envA.meta.tablesRead, 21, 'C1  the primary read touches TWENTY-ONE whole tables');
eq(readsA.join(','), readsB.join(','), 'C2  naming a company/country/marketplace/sku reads the SAME tables...');
eq(envA.meta.rowsReturned, envB.meta.rowsReturned, 'C2a ...and returns the SAME row count — the payload has no scope parameter');
ok(envA.meta.rowsReturned > 100000, 'C2b which here is over 100 000 rows for one page load (' + envA.meta.rowsReturned + ')');
ok(!/payload\.(company|country|marketplace|sku)\b/.test(ops(G60)),
  'C3  and 60_ never reads a scope field off the payload — this is not a bug in one caller, it is the contract');
// The transport bound the failure message names.
ok(/_readTimeoutMs\s*=\s*\(deps\.readTimeoutMs > 0\)/.test(read('assets/js/api/km-transport.js')),
  'C4  the 60 000 ms read bound the failure message quotes is the transport default');

// ================================================================================================================
section('§B/§C — the CLIENT, executed. Blank scope costs nothing; a complete scope costs the same read.');
// ================================================================================================================
function buildClient(opt) {
  opt = opt || {};
  var calls = [], alerts = [], state = { fail: !!opt.fail };
  var sel = { replenCountry: opt.country || '', replenMarketplace: opt.mkt || '' };
  var win = { KM: { api: { getWorkspace: function (name, payload) {
        calls.push({ name: name, payload: JSON.parse(JSON.stringify(payload || {})) });
        return Promise.resolve(state.fail
          ? { success: false, errors: [{ code: 'REQUEST_TIMEOUT', message: 'read timeout after 60000 ms' }] }
          : { success: true, data: { marketplace_skus: [{ sku: 'CO1100-R' }] },
              meta: { serverDurationMs: 41230, tablesRead: 21, rowsReturned: 6120,
                recentWindow: { amazon_daily_sales_snapshot: { before: 52000, after: 1900, dropped: 50100, keep: 14 } } } });
      } },
      DB: { adaptInventoryReplenishmentWorkspace: function (d) { return { getMarketplaceSkus: (d.marketplace_skus || []) }; } },
      loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR', INITIAL_LOADING: 'IL' } } } };
  var doc = { getElementById: function (id) { return Object.prototype.hasOwnProperty.call(sel, id) ? { value: sel[id] } : null; } };
  var src = [extractFn(PAGE, '_irWorkspaceRefresh_'), extractFn(PAGE, 'searchReplenishment'), extractFn(PAGE, '_irPendingFilters_')].join(NL);
  var f = new Function('window', 'document', 'alert', '_irSearch', '_irRegion_', '_irRenderSearchGate_', '_irApplySearch_',
    '_irEffectiveWorkspace', '_replenDemoOn', '_irNowMs_', 'renderReplenishment', '_irRenderError_',
    'var _irReadModel=null,_irReadSeq=0,_irReadModelAt=0,_irReadModelHasCarrier=false,_irLastReadMeta=null,replenCategoryTab="All";'
    + src + NL + 'return { refresh:_irWorkspaceRefresh_, search:searchReplenishment, model:function(){return _irReadModel;}, meta:function(){return _irLastReadMeta;} };');
  var st = { applied: null, seq: 0, inFlight: false, status: 'PRE_SEARCH', error: null };
  var api = f(win, doc, function (m) { alerts.push(m); }, st, function () { return null; }, function () {},
    function (p) { st.applied = p; }, function () { return true; }, function () { return false; },
    function () { return 1; }, function () {}, function (e) { st.err = e; });
  return { api: api, calls: calls, alerts: alerts, st: st, state: state, sel: sel };
}
var done = [];
function later(fn) { return new Promise(function (r) { setTimeout(function () { fn(); r(); }, 5); }); }

var IMATRIX = [];
var h1 = buildClient({ country: '', mkt: '' });
h1.api.search();
IMATRIX.push(later(function () {
  eq(h1.calls.length, 0, 'I1  blank scope + Search -> ZERO inventory requests');
  ok(/select country and marketplace/i.test(String(h1.alerts[0] || '')), 'I1a and it says which two are missing');
}));
var h2 = buildClient({ country: 'US', mkt: '' });
h2.api.search();
IMATRIX.push(later(function () { eq(h2.calls.length, 0, 'I2  only Country selected -> ZERO inventory requests'); }));
var h3 = buildClient({ country: '', mkt: 'MKT-AMZ-US' });
h3.api.search();
IMATRIX.push(later(function () { eq(h3.calls.length, 0, 'I3  only Marketplace selected -> ZERO inventory requests'); }));

var h4 = buildClient({ country: 'US', mkt: 'MKT-AMZ-US' });
h4.api.search();
IMATRIX.push(later(function () {
  eq(h4.calls.length, 1, 'I4  complete scope + Search -> exactly ONE request');
  ok(!/"(company|country|marketplace|sku)"/.test(JSON.stringify(h4.calls[0].payload)),
    'I4a and THE REQUEST STILL CARRIES NO SCOPE — this is the finding, not a leftover');
  eq(h4.calls[0].payload.recentWindow, true, 'I4b what it DOES carry is the recentWindow opt-in');
  h4.calls.length = 0;
  h4.api.search();
  return later(function () {
    eq(h4.calls.length, 0, 'I7  a repeated Search for the same scope costs ZERO further requests (client-side filtering)');
    var m = h4.api.meta();
    eq(m && m.server_execution_ms, 41230, 'B1  the SERVER\'s own execution time is captured from the envelope meta');
    eq(m && m.tables_read, 21, 'B1a with the table count it reported');
    ok(m && m.recent_window && m.recent_window.amazon_daily_sales_snapshot.dropped === 50100,
      'B1b and what the projection dropped, so the reduction is visible rather than assumed');
  });
}));

var h8 = buildClient({ country: 'US', mkt: 'MKT-AMZ-US', fail: true });
h8.api.search();
IMATRIX.push(later(function () {
  eq(h8.st.status, 'ERROR', 'I8  a first-attempt timeout is a TYPED error state');
  eq(h8.st.error.code, 'REQUEST_TIMEOUT', 'I8a named REQUEST_TIMEOUT, not a generic failure');
  eq(h8.api.model(), null, 'I8b and NOTHING is retained — a failed read never becomes a stale result');
  var first = JSON.stringify(h8.calls[0].payload);
  h8.state.fail = false; h8.calls.length = 0;
  h8.api.search();
  return later(function () {
    eq(h8.calls.length, 1, 'I9  the retry issues a fresh read...');
    eq(JSON.stringify(h8.calls[0].payload), first,
      'I9a ...and it is BYTE-IDENTICAL to the one that timed out. Nothing about the REQUEST changed between');
    ok(h8.api.model() !== null, 'I9b the retry produces a real result');
  });
}));

// I10/I11 — an older in-flight response must never overwrite a newer one. The guard is a monotonic sequence.
var refreshSrc = extractFn(PAGE, '_irWorkspaceRefresh_');
ok(/var mySeq = \+\+_irReadSeq;/.test(refreshSrc) && /if \(mySeq !== _irReadSeq\) return _irReadModel;/.test(refreshSrc),
  'I10 a late FIRST response cannot overwrite a newer read (monotonic read sequence, checked on resolve)');
var searchSrc = extractFn(PAGE, 'searchReplenishment');
ok(/if \(mySeq !== _irSearch\.seq\) return;\s*\/\/ a newer Search superseded this response/.test(searchSrc),
  'I11 a scope changed while a request is pending discards the old result');
ok(/if \(mySeq !== _irSearch\.seq\) return;\s*\/\/ stale failure/.test(searchSrc),
  'I11a and a stale FAILURE cannot overwrite a newer Search either');
ok(/if \(_irSearch\.inFlight\) return;/.test(searchSrc), 'I7a repeated clicks share the in-flight read (single-flight)');
ok(/_irReadModel = null;/.test(extractFn(PAGE, '_irRenderError_')),
  'I12 no stale cache is ever presented as fresh — the error path drops the model, fail-closed');

// ================================================================================================================
section('§D — the blank selectors were an ARTIFACT of the failure, and are no longer painted as one');
// ================================================================================================================
var bootSrc = extractFn(PAGE, '_irBootstrapScope_');
// The failure BRANCH, isolated by its own braces rather than by a character budget. A budget is a guess about
// how long a comment is, and mine was wrong twice: the probe passed or failed on prose length, not on code.
var failBranch = (function () {
  var i = bootSrc.indexOf('if (!ws || !ws.ok) {');
  if (i < 0) return '';
  var j = bootSrc.indexOf('{', i), d = 0;
  for (; j < bootSrc.length; j++) { var c = bootSrc[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return bootSrc.slice(i, j + 1); } }
  return '';
})();
ok(failBranch.length > 0, 'D1z the bootstrap has a read-failure branch to inspect');
ok(/_irSetSelectors_\(remembered\);/.test(failBranch),
  'D1  a FAILED bootstrap read now shows the remembered scope it had already validated');
ok(/_irSearch\.status = 'ERROR';/.test(failBranch),
  'D1a and reports ERROR rather than leaving the page claiming it is pre-search under a red line');
ok(/_irRenderSearchGate_\(\);/.test(failBranch), 'D1b painted through the gate that offers a Retry');
ok(/_irRenderError_\(/.test(failBranch), 'D1c after failing closed, so no broad cache can be substituted');
ok(failBranch.indexOf('_irRenderError_(') < failBranch.indexOf('_irRenderSearchGate_()'),
  'D1d and in that ORDER — fail closed first, then paint');
ok(!/_irApplySearch_|_irRememberScope_/.test(ops(failBranch)),
  'D1e the scope is SHOWN but never APPLIED, and a failed read never becomes a remembered one');
// The neutral pre-search sentence §D asks for is already the shipped one.
ok(PAGE.indexOf('Select Country and Marketplace, then press Search.') !== -1,
  'D2  the pre-search state is the exact neutral sentence, not an error');
var gateSrc = extractFn(PAGE, '_irRenderSearchGate_');
ok(/replen-pre-search/.test(gateSrc) && !/replen-search-retry[\s\S]{0,200}replen-pre-search/.test(gateSrc),
  'D2a and it carries no Retry — there is nothing to retry before a scope is chosen');
ok(/role="alert"/.test(gateSrc.slice(gateSrc.indexOf('ERROR'))), 'D2b only the ERROR branch is an alert');
// The mount itself.
ok(/REGISTRY_ONLY[\s\S]{0,200}registryRequests = 1;/.test(bootSrc),
  'D3  with no remembered scope the mount asks ONLY for the slim scope registry');
// My first version of this split the OPS-STRIPPED source on the literal 'COALESCED' — but ops() blanks string
// literals, so the split never happened and the probe silently read the whole function. Split the RAW source,
// then strip.
// CORRECTED. My first version claimed "no path before COALESCED reads the workspace", and that is FALSE: the
// RESTORED branch paints a still-valid cached result and then QUIETLY revalidates, which is a real workspace
// read. It is deliberate and it does not block the screen, but it is a read, and a probe that denied it would
// have been asserting something the code does not do. What §D actually requires is narrower and true: the
// FIRST-USE path — no remembered scope at all — issues none.
var firstUse = ops(bootSrc.split('var restorable = _irRestorableResult_(remembered);')[0]);
ok(bootSrc.indexOf('var restorable = _irRestorableResult_(remembered);') > 0, 'D3z there is a first-use path to isolate');
ok(!/_irWorkspaceRefresh_|getWorkspace/.test(firstUse),
  'D3a with NO remembered scope the mount issues zero inventory workspace reads');
ok(/_irWorkspaceRefresh_\(\{ quiet: true/.test(bootSrc),
  'D3b a RESTORED scope does revalidate — quietly, so a failure leaves the painted result exactly where it is');
ok(/if \(qSeq !== _irSearch\.seq\) return;/.test(bootSrc),
  'D3c and that quiet read cannot overwrite a real Search that superseded it');
ok(!/ALL_SITES/.test(ops(PAGE)), 'D4  there is no ALL_SITES fallback anywhere in the page');

// ================================================================================================================
section('§C/§D — THE FIX: a per-key recent window, and it changes no rendered number');
// ================================================================================================================
var windowFn = vm.runInContext('sirWsRecentWindow_', C60);
var SPEC = vm.runInContext('SIR_WS_RECENT_WINDOW_', C60);
eq(Object.keys(SPEC).sort(), ['amazon_daily_sales_snapshot', 'amazon_weekly_sales_snapshot'],
  'W1  exactly the two tables that grow without limit are windowed');
ok(SPEC.amazon_daily_sales_snapshot.keep >= 7,
  'W1a the daily window (' + SPEC.amazon_daily_sales_snapshot.keep + ') is at least the 7 dates salesTrend7d reads');
ok(SPEC.amazon_weekly_sales_snapshot.keep >= 1,
  'W1b the weekly window (' + SPEC.amazon_weekly_sales_snapshot.keep + ') is at least the 1 week avgSalesPerDay reads');
eq(SPEC.amazon_daily_sales_snapshot.keyCols, ['company', 'country', 'marketplace', 'sku'],
  'W1c and the window is PER SCOPE KEY, not an absolute date cut');

// The real consumers, lifted from the shipped page + the shipped compat module.
var winGlobal = {};
vm.runInNewContext(read('assets/js/utils/inventory-compat.js'), { window: winGlobal, module: {}, console: console });
var helperSrc = ['eq', 'num', 'ymd'].map(function (n) { try { return extractFn(PAGE, n); } catch (e) { return ''; } }).join(NL);
var IR = new Function('window', helperSrc + NL + extractFn(PAGE, 'salesTrend7d') + NL + extractFn(PAGE, 'avgSalesPerDay')
  + NL + 'return { salesTrend7d: salesTrend7d, avgSalesPerDay: avgSalesPerDay };')(winGlobal);
function pad(n) { return ('0' + n).slice(-2); }
function dstr(minus) { var d = new Date(Date.UTC(2026, 8, 1)); d.setUTCDate(d.getUTCDate() - minus);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
var SCOPES = [
  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', days: 400, stale: 0 },
  { company: 'ResUS', country: 'US', marketplace: 'Walmart', sku: 'CO1100-R', days: 200, stale: 0 },
  { company: 'ResUS', country: 'CA', marketplace: 'Amazon', sku: 'CO1100-R', days: 90, stale: 180 },  // STALE site
  { company: 'ResEU', country: 'DE', marketplace: 'Amazon', sku: 'CO1100-R', days: 300, stale: 0 },
  { company: 'ResEU', country: 'FR', marketplace: 'Amazon', sku: 'CO1100-R', days: 300, stale: 3 },
  { company: 'ResEU', country: 'IT', marketplace: 'Amazon', sku: 'CO1100-R', days: 300, stale: 9 },
  { company: 'ResEU', country: 'ES', marketplace: 'Amazon', sku: 'CO1100-R', days: 300, stale: 40 },
  { company: 'ResUK', country: 'GB', marketplace: 'Amazon', sku: 'CO1100-R', days: 300, stale: 0 },
  { company: 'ResUK', country: 'UK', marketplace: 'Amazon', sku: 'CO1100-R', days: 300, stale: 2 }
];
var daily = [], weekly = [], seq = 0;
SCOPES.forEach(function (s) {
  for (var d = 0; d < s.days; d++) { seq++; daily.push({ snapshot_date: dstr(s.stale + d), company: s.company,
    country: s.country, marketplace: s.marketplace, sku: s.sku, sales_units: (seq % 37) + 1 }); }
  for (var w = 0; w < Math.ceil(s.days / 7); w++) { seq++; weekly.push({ week_end_date: dstr(s.stale + w * 7),
    snapshot_week: '2026-W' + pad(52 - (w % 52)), company: s.company, country: s.country,
    marketplace: s.marketplace, sku: s.sku, sales_units_7d: (seq % 91) + 1 }); }
});
daily.push({ snapshot_date: '', company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', sales_units: 5 });
daily.push({ snapshot_date: dstr(1), company: 'ResUS', country: '', marketplace: 'Amazon', sku: 'CO1100-R', sales_units: 7 });
daily.push({ snapshot_date: new Date(Date.UTC(2026, 8, 1)), company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', sales_units: 11 });
weekly.push({ week_end_date: '', snapshot_week: '', company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', sales_units_7d: 3 });
var dw = windowFn(daily, SPEC.amazon_daily_sales_snapshot);
var ww = windowFn(weekly, SPEC.amazon_weekly_sales_snapshot);
ok(dw.dropped / dw.before > 0.8, 'W2  the daily snapshot loses ' + Math.round(100 * dw.dropped / dw.before) + '% of its rows');
ok(ww.dropped / ww.before > 0.8, 'W2a the weekly snapshot loses ' + Math.round(100 * ww.dropped / ww.before) + '%');
function nd(r) { return { snapshotDate: (r.snapshot_date instanceof Date)
    ? (r.snapshot_date.getUTCFullYear() + '-' + pad(r.snapshot_date.getUTCMonth() + 1) + '-' + pad(r.snapshot_date.getUTCDate()))
    : String(r.snapshot_date || '').trim(), country: String(r.country || '').trim(),
  marketplace: String(r.marketplace || 'Amazon').trim(), company: String(r.company || '').trim(),
  sku: String(r.sku || '').trim(), salesUnits: parseFloat(r.sales_units) || 0 }; }
function nw(r) { return { weekEndDate: String(r.week_end_date || '').trim(), snapshotWeek: String(r.snapshot_week || '').trim(),
  country: String(r.country || '').trim(), marketplace: String(r.marketplace || 'Amazon').trim(),
  company: String(r.company || '').trim(), sku: String(r.sku || '').trim(), salesUnits7d: parseFloat(r.sales_units_7d) || 0 }; }
var dFull = daily.map(nd), dWin = dw.rows.map(nd), wFull = weekly.map(nw), wWin = ww.rows.map(nw);
var probes = SCOPES.map(function (s) { return { company: s.company, country: s.country, marketplace: s.marketplace, sku: s.sku }; })
  .concat([{ company: 'ResEU', country: 'EU', marketplace: 'Amazon', sku: 'CO1100-R' },
           { company: 'ResUK', country: 'UK', marketplace: 'Amazon', sku: 'CO1100-R' },
           { company: '', country: '', marketplace: '', sku: 'CO1100-R' },
           { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'NO-SUCH-SKU' }]);
var diffT = 0, diffA = 0;
probes.forEach(function (sc) {
  if (JSON.stringify(IR.salesTrend7d(dFull, sc)) !== JSON.stringify(IR.salesTrend7d(dWin, sc))) diffT++;
  if (IR.avgSalesPerDay(wFull, sc) !== IR.avgSalesPerDay(wWin, sc)) diffA++;
});
eq(diffT, 0, 'W3  salesTrend7d is IDENTICAL across all ' + probes.length + ' probed scopes (incl. a stale site, the EU roll-up, the UK/GB alias)');
eq(diffA, 0, 'W3a avgSalesPerDay is IDENTICAL across all ' + probes.length);
// The properties that make W3 true rather than lucky.
var noDate = dw.rows.filter(function (r) { return r.snapshot_date === ''; });
eq(noDate.length, 1, 'W4  a row that cannot be placed in time is ALWAYS kept — dropping what we cannot order is a guess');
ok(dw.rows.some(function (r) { return r.snapshot_date instanceof Date; }),
  'W4a a Date-typed cell is placed in time correctly (Sheets returns real Dates for date columns)');
var caStale = dw.rows.filter(function (r) { return r.country === 'CA'; });
ok(caStale.length > 0, 'W4b a site whose data stopped six months ago KEEPS its own last dates — an absolute cut would have emptied it');
// Opt-in: an unchanged default.
var noWin = handler60({ payload: { include: { carrierPlanning: true } } }, io60({ amazon_daily_sales_snapshot: 10 }));
var yesWin = handler60({ payload: { include: { carrierPlanning: true }, recentWindow: true } }, io60({ amazon_daily_sales_snapshot: 10 }));
eq(noWin.meta.recentWindow, null, 'W5  a caller that does NOT ask gets no projection and today\'s payload exactly');
ok(yesWin.meta.recentWindow !== null, 'W5a a caller that DOES ask is told what was dropped, per table');
ok(/recentWindow: true/.test(extractFn(PAGE, '_irWorkspaceRefresh_')), 'W6  the page asks for it on the primary read');
ok(/recentWindow: true/.test(MREG), 'W6a and so does the lazy carrier fallback, which pays for the same tables');

// ================================================================================================================
section('§E — THE EXECUTION DEMAND SNAPSHOT. The screen and the plan now read ONE row.');
// ================================================================================================================
// The seam, stated as a fact about the two files rather than as a claim.
ok(/d90_suggested_qty/.test(PAGE), 'E0  the SCREEN reads d90_suggested_qty...');
ok(/INV_GAP_TABLE_ = 'inventory_replenishment_gap'/.test(G43), 'E0a ...which 43_ MATERIALIZES into inventory_replenishment_gap');
ok(!/inventory_replenishment_gap/.test(G42),
  'E0b while 42_ never reads that table at all — it RECOMPUTES, which is the divergence this closes');
ok(/handleRecommendationWorkspaceGet_/.test(G61), 'E0c and 61_ calls 42_, so the AI Plan was on the recomputing side');

var CD = vm.runInContext('weeklyAiPlanCanonicalDemand_', C61);
var AC = vm.runInContext('weeklyAiPlanAcceptCanonicalDemand_', C61);
vm.runInContext('var gapReadObjects_ = function (ss, name) { return (ss.__rows && ss.__rows[name]) || []; };', C61);
var GH = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date',
  'd18_gap_qty', 'd18_suggested_qty', 'd30_gap_qty', 'd30_suggested_qty', 'd45_gap_qty', 'd45_suggested_qty',
  'd90_gap_qty', 'd90_suggested_qty', 'note', 'calculated_at', 'updated_at'];
var CALC = '2026-09-01';
var ESCOPE = { company: 'ResUS', country: 'US', planningCycle: 'RECO-2026-09' };
function grow(over) {
  return Object.assign({ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R',
    calculation_status: 'READY', calculation_date: CALC, d18_gap_qty: 0, d18_suggested_qty: 0,
    d30_gap_qty: 0, d30_suggested_qty: 120, d45_gap_qty: 0, d45_suggested_qty: 300,
    d90_gap_qty: 520, d90_suggested_qty: 520, note: '', calculated_at: '2026-09-01T02:00:00Z',
    updated_at: '2026-09-01T02:00:00Z' }, over || {});
}
function gss(rows, headers, present) {
  headers = headers || GH;
  var sh = (present === false) ? null : {
    getLastRow: function () { return rows.length + 1; }, getLastColumn: function () { return headers.length; },
    getRange: function () { return { getValues: function () { return [headers]; } }; } };
  var ss = { getSheetByName: function (n) { return n === 'inventory_replenishment_gap' ? sh : null; } };
  ss.__rows = { inventory_replenishment_gap: rows };
  return ss;
}
var ESITE = { marketplace: 'Amazon', sku: 'CO1100-R', cumulativeGapByWindow: { D30: 999, D90: 999 } };
function accept(rows, headers, present, expected, site) {
  var snap = CD(gss(rows, headers, present), ESCOPE, CALC);
  if (!snap.ok) return { read: snap.reason };
  return AC(snap, site || ESITE, ESCOPE, CALC, expected || null);
}
var okAcc = accept([grow()]);
eq(okAcc.ok, true, 'E1  a READY row for THIS planning date is accepted');
eq(okAcc.suggestedByWindow, { D30: 120, D90: 520 },
  'E1a and THE QUANTITY IS THE SNAPSHOT\'S (520), not the live workspace\'s (999) — the whole point');
eq(okAcc.lineage.source_table, 'inventory_replenishment_gap', 'E1b the lineage names the source table...');
eq(okAcc.lineage.source_reason, 'MATERIALIZED_SNAPSHOT', 'E1c ...and the source reason');
['company', 'country', 'marketplace', 'sku', 'planning_cycle', 'calculation_status', 'calculation_date',
 'calculated_at', 'updated_at'].forEach(function (f, i) {
  ok(Object.prototype.hasOwnProperty.call(okAcc.lineage, f), 'E1d.' + (i + 1) + ' lineage carries ' + f);
});
eq(accept([grow()], null, false).read, 'CANONICAL_DEMAND_TABLE_MISSING',
  'E2  a MISSING table blocks — it never reads as "every site needs nothing"');
eq(accept([], GH.filter(function (h) { return h !== 'd90_suggested_qty'; })).read,
  'CANONICAL_DEMAND_HEADER_MISSING:d90_suggested_qty', 'E2a a missing required header blocks, and names the column');
eq(accept([grow({ sku: 'OTHER' })]).code, 'CANONICAL_DEMAND_ROW_MISSING', 'E3  no row for this site blocks');
eq(accept([grow({ calculation_status: 'BLOCKED' })]).code, 'CANONICAL_DEMAND_NOT_READY', 'E4  a BLOCKED calculation blocks');
eq(accept([grow({ calculation_status: '' })]).code, 'CANONICAL_DEMAND_NOT_READY', 'E4a so does a blank status');
eq(accept([grow({ calculation_date: '2026-08-01' })]).code, 'CANONICAL_DEMAND_STALE',
  'E5  a snapshot computed for ANOTHER planning date is STALE, not usable');
eq(accept([grow({ calculation_date: '' })]).code, 'CANONICAL_DEMAND_LINEAGE_MISSING',
  'E5a a row with no lineage at all blocks — provenance is not optional');
eq(accept([grow(), grow({ d90_suggested_qty: 777 })]).code, 'CANONICAL_DEMAND_DUPLICATE_ROWS',
  'E6  two rows for one site is a CONFLICT, never last-one-wins');
eq(accept([grow({ d30_suggested_qty: '' })]).code, 'CANONICAL_DEMAND_WINDOW_UNRESOLVED',
  'E7  a blank quantity for a window this site has blocks — blank is not zero HERE (it is a gap, not a forecast month)');
eq(accept([grow({ d90_suggested_qty: -5 })]).code, 'CANONICAL_DEMAND_INVALID', 'E7a a negative quantity blocks');
eq(accept([grow()], null, true, { 'ResUS|US|Amazon|CO1100-R': { D90: 520 } }).ok, true,
  'E8  a client expectation that AGREES proceeds');
var conf = accept([grow()], null, true, { 'ResUS|US|Amazon|CO1100-R': { D90: 999 } });
eq(conf.code, 'EXPECTED_DEMAND_CONFLICT', 'E8a a client expectation that DISAGREES is a conflict...');
eq([conf.expected, conf.canonical], [999, 520], 'E8b ...naming BOTH numbers, choosing neither');
eq(accept([grow()], null, true, { 'ResUS|US|Amazon|CO1100-R': { D90: 'lots' } }).code, 'EXPECTED_DEMAND_INVALID',
  'E8c a non-numeric expectation blocks rather than being ignored');
var zeroAcc = accept([grow({ d18_suggested_qty: 0, d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 })]);
eq([zeroAcc.ok, zeroAcc.suggestedByWindow], [true, { D30: 0, D90: 0 }],
  'E9  an all-zero READY snapshot RESOLVES to zero — it is an answer, and it feeds §G');
// The client declares identity + lineage, never a quantity as truth.
var expSrc = extractFn(PAGE, '_irExpectedDemandFromSnapshot_');
ok(/_irMatState\.bySku/.test(expSrc), 'E10 the client expectation is built from the MATERIALIZED rows the cells render');
ok(!/document\.|innerHTML|textContent|getElementById/.test(expSrc),
  'E10a and never from the DOM — the screen is not a source of truth');
ok(/calculation_status\) !== 'READY'\) continue;/.test(expSrc), 'E10b only a READY row has a declarable expectation');
ok(/expectedDemand/.test(extractFn(PAGE, '_irRunInventoryAiPlanGeneration_')), 'E10c and it rides on the generate payload');
ok(/demandLineage/.test(G61), 'E11 the lineage travels with the quantity into the horizon rows');
// §E.11 — Submit does not re-read raw forecast.
ok(!/fc_regular_forecast/.test(read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs')),
  'E12 §E.11 Submit never reads the raw forecast, so it cannot recompute a frozen quantity');

// ================================================================================================================
section('§G — a scope with nothing to replenish is an ANSWER, and it cannot swallow a real error');
// ================================================================================================================
var verdict = vm.runInContext('weeklyAiPlanNoDemandVerdict_', C61);
var KMWHA = vm.runInContext('KMWHA', C61);
function rcv(over) {
  return Object.assign({ demandRef: 'Amazon|CO1100-R|MKT-AMZ-US', marketplace: 'Amazon', sku: 'CO1100-R',
    company: 'ResUS', country: 'US', destinationWarehouseId: 'MKT-AMZ-US', demandDriver: 'FORECAST_DRIVEN',
    forecastBasis: { forecastShareQty: 0 } }, over || {});
}
function hv(over) {
  return Object.assign({ ok: true, errors: [], site_count: 2, receiver_count: 2,
    builtReceivers: [rcv(), rcv({ demandRef: 'Walmart|CO1100-R|MKT-WMT-US', marketplace: 'Walmart' })],
    horizonsByDemandRef: { 'Amazon|CO1100-R|MKT-AMZ-US': { cumulativeGapByWindow: { D30: 0, D90: 0 } },
      'Walmart|CO1100-R|MKT-WMT-US': { cumulativeGapByWindow: { D30: 0, D90: 0 } } },
    kmaf: { ready: false, receiverFacts: [], issues: [{ code: 'DEMAND_WEIGHT_UNRESOLVED', ref: 'Amazon|CO1100-R|MKT-AMZ-US' },
      { code: 'DEMAND_WEIGHT_UNRESOLVED', ref: 'Walmart|CO1100-R|MKT-WMT-US' }] },
    sourceDataAsOf: '2026-09-01' }, over || {});
}
function mapOf(h) {
  return KMWHA.mapWeeklyHarvestToBatchRequest({ planningCycle: 'RECO-2026-09',
    businessScope: { company: 'ResUS', country: 'US', source_page: 'INVENTORY' }, mode: 'MANUAL_REGENERATE',
    actor: 't', now: '2026-09-04T00:00:00Z', sourceDataAsOf: h.sourceDataAsOf, formulaVersion: 'WEEKLY_AI_PLAN_V1',
    errors: h.errors || [], factoryIdentityConfig: {}, warehousesById: {}, kmaf: h.kmaf,
    horizonsByDemandRef: h.horizonsByDemandRef, poolsBySku: {} });
}
function vd(h) { return verdict(h, mapOf(h)); }
var gOk = vd(hv());
eq([gOk.noDemand, gOk.reason], [true, 'NO_REPLENISHMENT_REQUIRED'],
  'G1  every basis 0 AND every canonical gap 0 -> a typed SUCCESS');
eq([gOk.basisTotal, gOk.gapTotal], [0, 0], 'G1a with both totals reported, so the claim is checkable');
eq(vd(hv({ horizonsByDemandRef: { 'Amazon|CO1100-R|MKT-AMZ-US': { cumulativeGapByWindow: { D90: 520 } },
  'Walmart|CO1100-R|MKT-WMT-US': { cumulativeGapByWindow: { D90: 0 } } } })).reason,
  'POSITIVE_CANONICAL_DEMAND_WITH_UNRESOLVED_WEIGHT',
  'G2  positive canonical demand with an unresolvable weight is STILL AN ERROR — the case §G names');
eq(vd(hv({ builtReceivers: [rcv({ forecastBasis: { forecastShareQty: 520 } }), rcv()] })).reason, 'BASIS_TOTAL_NONZERO',
  'G3  a positive basis is not a no-demand group');
eq(vd(hv({ builtReceivers: [rcv({ forecastBasis: { forecastShareQty: null } }), rcv()] })).reason, 'BASIS_UNRESOLVED',
  'G4  an UNRESOLVED basis is unknown, and unknown is never zero');
eq(vd(hv({ builtReceivers: [rcv({ forecastBasis: { forecastShareQty: '0' } }), rcv()] })).reason, 'BASIS_UNRESOLVED',
  'G4a a STRING "0" is not a resolved number');
eq(vd(hv({ errors: [{ code: 'FORECAST_BASIS_UNRESOLVED', message: 'timeout' }] })).reason, 'HARVEST_DROPPED_SITES',
  'G5  a site the harvest could not read is not a site that needs nothing');
eq(vd(hv({ kmaf: { ready: false, receiverFacts: [], issues: [{ code: 'MISSING_DESTINATION_WAREHOUSE', ref: 'a' },
  { code: 'DEMAND_WEIGHT_UNRESOLVED', ref: 'b' }] } })).reason, 'OTHER_BLOCKING_ISSUE:MISSING_DESTINATION_WAREHOUSE',
  'G6  a DIFFERENT blocking issue is never absorbed');
eq(vd(hv({ horizonsByDemandRef: { 'Amazon|CO1100-R|MKT-AMZ-US': { cumulativeGapByWindow: { D90: 'abc' } },
  'Walmart|CO1100-R|MKT-WMT-US': { cumulativeGapByWindow: { D90: 0 } } } })).reason, 'CANONICAL_DEMAND_UNRESOLVED',
  'G7  an unreadable canonical quantity blocks');
eq(vd(hv({ builtReceivers: [] })).reason, 'NO_RECEIVERS_BUILT', 'G8  no receivers is a different answer, handled elsewhere');
// THE ENGINE CODE, not the mapped one — the swallow this would otherwise permit.
var vdSrc = extractFn(G61, 'weeklyAiPlanNoDemandVerdict_');
ok(/engine_code/.test(vdSrc),
  'G9  the verdict matches on the ENGINE code, because KMWHA maps FIVE different faults to SUGGESTED_QTY_UNRESOLVED');
eq(KMWHA.mapWeeklyHarvestToBatchRequest ? [
  'DEMAND_WEIGHT_UNRESOLVED', 'DAILY_DEMAND_UNRESOLVED', 'WEIGHT_BASIS_UNRESOLVED',
  'MISSING_FORECAST_WEIGHT_SOURCE', 'FORECAST_BASIS_UNRESOLVED'
].filter(function (c) { return new RegExp(c + ': READINESS_CODES\\.SUGGESTED_QTY_UNRESOLVED').test(KMWHA_SRC); }).length : 0,
  5, 'G9a and there really are five of them');
// The server answer, and the page's reading of it.
ok(/code: 'NO_REPLENISHMENT_REQUIRED'/.test(G61), 'G10 the success envelope is typed NO_REPLENISHMENT_REQUIRED');
ok(/requested_qty: 0, allocated_qty: 0, route_count: 0, routes: \[\]/.test(G61), 'G10a with 0 requested, 0 allocated, 0 routes');
ok(/header_created: false, line_created: false, db_writes: 0/.test(G61), 'G10b no empty header, no empty line, zero writes');
ok(/zero_result: true/.test(G61), 'G10c and it speaks the page\'s existing zero-result vocabulary');
var clsSrc = extractFn(PAGE, '_irClassifyGenerationResult_');
ok(/noReplenishmentRequired/.test(clsSrc), 'G11 the page distinguishes it from "no eligible route found"...');
ok(PAGE.indexOf("'No replenishment is required for this scope.'") !== -1, 'G11a ...with §G\'s exact neutral sentence');
ok(/cls\.noReplenishmentRequired\) \{[\s\S]{0,200}_irAiPlanTerminal_\('ok'/.test(PAGE),
  'G11b reported as ok, not warn and not red');

// ================================================================================================================
section('§J — the AI Plan boundary this round must not have moved');
// ================================================================================================================
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false/.test(read('assets/specs/active/apps-script/00_config.gs')),
  'J16 the production AI Plan flag is still FALSE');
ok(!/COMMIT_FC_2027_ROLLOVER_AFTER_REVIEW/.test(ops(G61)) && !/TEMP_FCROLL_runOneBatch_/.test(ops(G61)),
  'J15 the forecast rollover migration is not called from any runtime path');
var ROLL = read('assets/tools/apps-script-diagnostics/TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER_2027.gs');
ok(/TEMP_FCROLL_DRY_RUN\s*=\s*true/.test(ROLL), 'J15a and its runner is still DRY_RUN = true');
ok(/KMFCN\.normalizeWindow/.test(G61), 'J13 the R3-R1 forecast normalization is still the basis authority');
ok(/DEFAULT_ZERO_MISSING_YEAR/.test(read('assets/js/core/supply-planning-forecast-normalization.js')),
  'J13a a missing forecast year is still zero');
ok(/REQUEST_TIMEOUT/.test(read('assets/js/core/supply-planning-forecast-normalization.js')),
  'J14 and a forecast read TIMEOUT still blocks');
// No production write reaches this round's new code.
['weeklyAiPlanCanonicalDemand_', 'weeklyAiPlanAcceptCanonicalDemand_', 'weeklyAiPlanNoDemandVerdict_',
 'weeklyAiPlanExpectedDemand_'].forEach(function (fn, i) {
  var body = ops(extractFn(G61, fn));
  ok(!/(appendRow|setValue|setValues|deleteRow|insertRow|getRange\([^)]*\)\.set)/.test(body),
    'J17.' + (i + 1) + ' ' + fn + ' performs NO write');
});
ok(!/(appendRow|setValue|setValues)/.test(ops(extractFn(G60, 'sirWsRecentWindow_'))),
  'J17.5 and the projection is pure — it reads rows and returns rows');

// ================================================================================================================
section('§A — deployment identity');
// ================================================================================================================
var wap = (G61.match(/WAP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var sys = (HLTH.match(/SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var wapExp = (HLTH.match(/\{ file: '61_api_v1_weekly_ai_plan\.gs',[^}]*expected: '([^']+)'/) || [])[1];
var sysExp = (HLTH.match(/\{ file: '63_api_v1_system_health\.gs',[^}]*expected: '([^']+)'/) || [])[1];
eq(wap, wapExp, 'A1  61_ declares exactly the build its manifest entry expects (' + wap + ')');
eq(sys, sysExp, 'A1a and 63_ does the same (' + sys + ')');
eq([wap, sys], ['F1-7N-FC-1B-E3-R4', 'F1-7N-FC-1B-E3-R4'], 'A1b both moved this round, because both changed');
var kmwhaVer = (KMWHA_SRC.match(/_version:\s*'([^']+)'/) || [])[1];
ok(BUNDLE.indexOf(kmwhaVer) !== -1, 'A2  the bundle was rebuilt at the adapter\'s current version (' + kmwhaVer + ')');
['CANONICAL_DEMAND_ROW_MISSING', 'CANONICAL_DEMAND_NOT_READY', 'CANONICAL_DEMAND_STALE',
 'CANONICAL_DEMAND_DUPLICATE_ROWS', 'EXPECTED_DEMAND_CONFLICT'].forEach(function (c, i) {
  ok(BUNDLE.indexOf(c) !== -1, 'A2.' + (i + 1) + ' the bundle carries the readiness mapping for ' + c);
});

// ================================================================================================================
section('§K — release identity');
// ================================================================================================================
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
eq(RO.currentAppToken(), 'fc1b-e3r4-scopedread-20260904', 'K1  this round mints a NEW application token');
ok(RO.tokenIndex(RO.currentAppToken()) > RO.tokenIndex('fc1b-e3r3r1-forecastzero-20260904'),
  'K1a strictly after R3-R1\'s, which was PUBLISHED (origin/main carries 6c9594f)');
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '', 'K2  nothing is left behind on any superseded token');
var IX = RO.parseIndexTokens(INDEX);
eq(IX['assets/js/pages/inventory-replenishment.js'], RO.currentAppToken(), 'K3  the page carries it');
eq(IX[RO.IR_CSS_FILE], RO.currentIrCssToken(), 'K4  the stylesheet stays on its own family token: it did NOT change');
eq(RO.currentIrCssToken(), 'irroutehint-20260903', 'K4a which is still R2\'s');
ok(RO.stampAtOrAfter('F1-7N-FC-1B-E3-R4', 'F1-7N-FC-1B-E3-R3-R1'), 'K5  the owner stamp is recorded, after R3-R1\'s');

// ================================================================================================================
section('MUTATIONS');
// ================================================================================================================
Promise.all(IMATRIX).then(function () {
  mut('N1  the recent window is applied WITHOUT the caller asking (silently changes every other caller)', function () {
    var m = swap(G60, 'var windowOn = (payload.recentWindow === true);', 'var windowOn = true;');
    return /windowOn = \(payload\.recentWindow === true\)/.test(G60) && !/windowOn = \(payload/.test(m);
  });
  mut('N2  the daily window is cut BELOW the seven days salesTrend7d reads', function () {
    var m = swap(G60, "periodCols: ['snapshot_date'], keep: 14", "periodCols: ['snapshot_date'], keep: 3");
    var c = gsCtx([]);
    vm.runInContext(m, c, { filename: '60m' });
    var w = vm.runInContext('sirWsRecentWindow_', c)(daily, vm.runInContext('SIR_WS_RECENT_WINDOW_', c).amazon_daily_sales_snapshot);
    var bad = 0;
    probes.forEach(function (sc) {
      if (JSON.stringify(IR.salesTrend7d(dFull, sc)) !== JSON.stringify(IR.salesTrend7d(w.rows.map(nd), sc))) bad++;
    });
    return bad > 0;   // the equivalence check MUST notice
  });
  mut('N3  a row with no readable period is DROPPED instead of kept', function () {
    var m = swap(G60, "if (!pj) { out.push(rows[j]); continue; }", "if (!pj) { continue; }");
    var c = gsCtx([]); vm.runInContext(m, c, { filename: '60m' });
    var w = vm.runInContext('sirWsRecentWindow_', c)(daily, SPEC.amazon_daily_sales_snapshot);
    return w.rows.filter(function (r) { return r.snapshot_date === ''; }).length === 0;
  });
  mut('N4  the window becomes an ABSOLUTE date cut instead of per-key (empties every stale site)', function () {
    var m = swap(G60, "    var k = keyOf(rows[i]);\n    if (!seen[k]) seen[k] = {};", "    var k = '';\n    if (!seen[k]) seen[k] = {};");
    var c = gsCtx([]); vm.runInContext(m, c, { filename: '60m' });
    var w = vm.runInContext('sirWsRecentWindow_', c)(daily, SPEC.amazon_daily_sales_snapshot);
    var rows = w.rows.map(nd);
    return JSON.stringify(IR.salesTrend7d(dFull, { company: 'ResUS', country: 'CA', marketplace: 'Amazon', sku: 'CO1100-R' }))
        !== JSON.stringify(IR.salesTrend7d(rows, { company: 'ResUS', country: 'CA', marketplace: 'Amazon', sku: 'CO1100-R' }));
  });
  mut('N5  the failed bootstrap goes back to hiding the scope it had validated', function () {
    var m = swap(PAGE, '            _irSetSelectors_(remembered);\r\n            _irSearch.status = \'ERROR\';', '            _irSearch.status = \'ERROR\';');
    return /_irSetSelectors_\(remembered\);[\r\n]+\s+_irSearch\.status = 'ERROR'/.test(PAGE)
      && !/_irSetSelectors_\(remembered\);[\r\n]+\s+_irSearch\.status = 'ERROR'/.test(m);
  });
  mut('N6  Search stops validating the scope, so a blank Search issues a request', function () {
    var m = swap(PAGE, "if (!pending.country) { alert('Please select a Country.'); return; }", "if (!pending.country) { }");
    return /!pending\.country\) \{ alert/.test(PAGE) && !/!pending\.country\) \{ alert/.test(m);
  });
  mut('N7  the read-sequence guard is removed, so a late first response overwrites a newer one', function () {
    var m = swap(PAGE, 'if (mySeq !== _irReadSeq) return _irReadModel;', 'if (false) return _irReadModel;');
    return /if \(mySeq !== _irReadSeq\)/.test(PAGE) && !/if \(mySeq !== _irReadSeq\)/.test(m);
  });
  mut('N8  the error path RETAINS the read model, so a stale result is shown as fresh', function () {
    var m = swap(PAGE, "function _irRenderError_(err) {\r\n    _irReadModel = null;", "function _irRenderError_(err) {\r\n    ");
    return /_irRenderError_\(err\) \{[\r\n]+\s+_irReadModel = null;/.test(PAGE)
      && !/_irRenderError_\(err\) \{[\r\n]+\s+_irReadModel = null;/.test(m);
  });
  mut('N9  the canonical snapshot is bypassed and the LIVE recomputation allocates again', function () {
    var m = swap(G61, '_site.cumulativeGapByWindow = _acc.suggestedByWindow;', '_site.cumulativeGapByWindow = cum;');
    return /_site\.cumulativeGapByWindow = _acc\.suggestedByWindow;/.test(G61)
      && !/_acc\.suggestedByWindow;/.test(m.split('_site.liveGapByWindow')[1] || '');
  });
  mut('N10 a NOT-READY calculation is accepted as demand', function () {
    var m = swap(G61, "if (rec.calculation_status !== 'READY') {", "if (false) {");
    var c = gsCtx(['90_generated_supply_planning_bundle.gs']);
    vm.runInContext(m, c, { filename: '61m' });
    vm.runInContext('var gapReadObjects_ = function (ss, name) { return (ss.__rows && ss.__rows[name]) || []; };', c);
    var snap = vm.runInContext('weeklyAiPlanCanonicalDemand_', c)(gss([grow({ calculation_status: 'BLOCKED' })]), ESCOPE, CALC);
    return vm.runInContext('weeklyAiPlanAcceptCanonicalDemand_', c)(snap, ESITE, ESCOPE, CALC, null).ok === true;
  });
  mut('N11 a STALE snapshot is accepted', function () {
    var m = swap(G61, 'if (calcDate && rec.calculation_date && rec.calculation_date !== calcDate) {', 'if (false) {');
    var c = gsCtx(['90_generated_supply_planning_bundle.gs']);
    vm.runInContext(m, c, { filename: '61m' });
    vm.runInContext('var gapReadObjects_ = function (ss, name) { return (ss.__rows && ss.__rows[name]) || []; };', c);
    var snap = vm.runInContext('weeklyAiPlanCanonicalDemand_', c)(gss([grow({ calculation_date: '2026-08-01' })]), ESCOPE, CALC);
    return vm.runInContext('weeklyAiPlanAcceptCanonicalDemand_', c)(snap, ESITE, ESCOPE, CALC, null).ok === true;
  });
  mut('N12 a client/server quantity mismatch is silently resolved in the client\'s favour', function () {
    var m = swap(G61, "return { ok: false, code: 'EXPECTED_DEMAND_CONFLICT', key: key, window: w2, expected: e, canonical: out[w2] };",
      "out[w2] = e;");
    var c = gsCtx(['90_generated_supply_planning_bundle.gs']);
    vm.runInContext(m, c, { filename: '61m' });
    vm.runInContext('var gapReadObjects_ = function (ss, name) { return (ss.__rows && ss.__rows[name]) || []; };', c);
    var snap = vm.runInContext('weeklyAiPlanCanonicalDemand_', c)(gss([grow()]), ESCOPE, CALC);
    var a = vm.runInContext('weeklyAiPlanAcceptCanonicalDemand_', c)(snap, ESITE, ESCOPE, CALC,
      { 'ResUS|US|Amazon|CO1100-R': { D90: 999 } });
    return a.ok === true && a.suggestedByWindow.D90 === 999;
  });
  mut('N13 a duplicate snapshot row becomes last-one-wins', function () {
    var m = swap(G61, "if (rec.duplicate) return { ok: false, code: 'CANONICAL_DEMAND_DUPLICATE_ROWS', key: key };", "");
    var c = gsCtx(['90_generated_supply_planning_bundle.gs']);
    vm.runInContext(m, c, { filename: '61m' });
    vm.runInContext('var gapReadObjects_ = function (ss, name) { return (ss.__rows && ss.__rows[name]) || []; };', c);
    var snap = vm.runInContext('weeklyAiPlanCanonicalDemand_', c)(gss([grow(), grow({ d90_suggested_qty: 777 })]), ESCOPE, CALC);
    return vm.runInContext('weeklyAiPlanAcceptCanonicalDemand_', c)(snap, ESITE, ESCOPE, CALC, null).ok === true;
  });
  mut('N14 positive canonical demand is reported as a no-demand success', function () {
    var m = swap(G61, "if (out.positiveGapRefs.length) { out.reason = 'POSITIVE_CANONICAL_DEMAND_WITH_UNRESOLVED_WEIGHT'; return out; }", "");
    var c = gsCtx(['90_generated_supply_planning_bundle.gs']);
    vm.runInContext(m, c, { filename: '61m' });
    var h = hv({ horizonsByDemandRef: { 'Amazon|CO1100-R|MKT-AMZ-US': { cumulativeGapByWindow: { D90: 520 } },
      'Walmart|CO1100-R|MKT-WMT-US': { cumulativeGapByWindow: { D90: 0 } } } });
    return vm.runInContext('weeklyAiPlanNoDemandVerdict_', c)(h, mapOf(h)).noDemand === true;
  });
  // N15/N16 REPLACED. My first two attempts here mutated the ENGINE-CODE match and the DROPPED-SITES check, and
  // both mutants survived — correctly. The verdict reads kmaf.issues AND mapped.issues concatenated, so the RAW
  // engine code is always present in the list and a second guard rejected the fault either way. Those two lines
  // are defence in depth, not single points of failure, and a mutation that claims otherwise is asserting a
  // defect that cannot occur. G5/G6/G9 already cover the behaviour. These two mutate what IS load-bearing:
  // the only places where an UNRESOLVED or POSITIVE basis is distinguished from a resolved zero.
  mut('N15 an UNRESOLVED basis is accepted as a resolved zero (unknown becomes no-demand)', function () {
    var m = swap(G61, "if (typeof b !== 'number' || !isFinite(b) || b < 0) { out.reason = 'BASIS_UNRESOLVED'; return out; }", "");
    var c = gsCtx(['90_generated_supply_planning_bundle.gs']);
    vm.runInContext(m, c, { filename: '61m' });
    var h = hv({ builtReceivers: [rcv({ forecastBasis: { forecastShareQty: null } }), rcv()] });
    return vm.runInContext('weeklyAiPlanNoDemandVerdict_', c)(h, mapOf(h)).noDemand === true;
  });
  mut('N16 the zero-total check is dropped, so a group with POSITIVE demand reports no-demand', function () {
    var m = swap(G61, "if (out.basisTotal !== 0) { out.reason = 'BASIS_TOTAL_NONZERO'; return out; }", "");
    var c = gsCtx(['90_generated_supply_planning_bundle.gs']);
    vm.runInContext(m, c, { filename: '61m' });
    var h = hv({ builtReceivers: [rcv({ forecastBasis: { forecastShareQty: 520 } }), rcv()] });
    return vm.runInContext('weeklyAiPlanNoDemandVerdict_', c)(h, mapOf(h)).noDemand === true;
  });
  mut('N17 a MISSING gap table reads as an empty snapshot instead of blocking', function () {
    var m = swap(G61, "if (!sh) { out.reason = 'CANONICAL_DEMAND_TABLE_MISSING'; return out; }", "if (!sh) { out.ok = true; return out; }");
    var c = gsCtx(['90_generated_supply_planning_bundle.gs']);
    vm.runInContext(m, c, { filename: '61m' });
    vm.runInContext('var gapReadObjects_ = function (ss, name) { return []; };', c);
    return vm.runInContext('weeklyAiPlanCanonicalDemand_', c)(gss([], null, false), ESCOPE, CALC).ok === true;
  });
  mut('N18 the AI Plan flag is turned on', function () {
    var CFG = read('assets/specs/active/apps-script/00_config.gs');
    var m = swap(CFG, 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false', 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true');
    return /ENABLED_ = false/.test(CFG) && /ENABLED_ = true/.test(m);
  });
  mut('N19 the page stops asking for the bounded payload (a cached page keeps timing out)', function () {
    var m = swap(PAGE, 'include: { carrierPlanning: true }, recentWindow: true }', 'include: { carrierPlanning: true } }');
    return /carrierPlanning: true \}, recentWindow: true \}/.test(PAGE) && !/carrierPlanning: true \}, recentWindow: true \}/.test(m);
  });
  mut('N20 an asset is left behind on a superseded token', function () {
    var cur = RO.currentAppToken(), prev = 'fc1b-e3r3r1-forecastzero-20260904';
    var m = swap(INDEX, 'inventory-replenishment.js?v=' + cur, 'inventory-replenishment.js?v=' + prev);
    return RO.staleAppTokenRefs(INDEX).length === 0 && RO.staleAppTokenRefs(m).length > 0;
  });
  mut('N21 61_ ships at a build its manifest does not expect', function () {
    var m = swap(HLTH, "expected: '" + wapExp + "', owns: 'weekly AI Plan harvest", "expected: 'F1-7N-FC-1B-E3-R1', owns: 'weekly AI Plan harvest");
    var e = (m.match(/\{ file: '61_api_v1_weekly_ai_plan\.gs',[^}]*expected: '([^']+)'/) || [])[1];
    return e !== wap;
  });

  console.log('\n----------------------------------------');
  console.log('FIRST-LOAD TIMEOUT + DEMAND SNAPSHOT FREEZE (F1-7N-FC-1B-E3-R4): ' + pass + ' passed, ' + fail + ' failed');
  console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
  process.exit(fail ? 1 : 0);
});
