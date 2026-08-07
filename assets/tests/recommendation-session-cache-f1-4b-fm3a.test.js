// Kitchen Mama Operation System — Recommendation session cache + Suggested-Qty aggregation (F1-4B-FM3a).
// Run: node assets/tests/recommendation-session-cache-f1-4b-fm3a.test.js
// -----------------------------------------------------------------------------
// Owner-independent slice authorized by the F1-4B-FM3 audit. Proves: (1) a bounded browser-SESSION cache
// (sessionStorage) for SUCCESSFUL Recommendation READ results so repeated navigation / re-expand of the same
// scope issues ZERO extra recommendation.workspace.get; scope changes fetch anew; stale/aborted/failed
// responses are never cached; blocked + valid-zero canonical results ARE cached. (2) the main-table
// Suggested Qty is a NUMERIC presentation aggregation of non-blocked canonical recommendedQty (no
// "breakdown" placeholder, no page-side gap/stock/forecast/carton math). Extracts the __IRRECO__ block
// (+ _irSuggestedCellHtml) from the page source and drives it against stubs. NOT strict (extracted top-level
// decls bind into this module scope).

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var IRSRC = read('js/pages/inventory-replenishment.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function tick() { return Promise.resolve().then(function () {}).then(function () {}).then(function () {}); }

// ---- extract the READ block + the (outside-block) Suggested-cell helper ----------------------------
var IR = IRSRC.slice(IRSRC.indexOf('// __IRRECO_START__'), IRSRC.indexOf('// __IRRECO_END__'));
ok(IR.length > 0, 'X0 __IRRECO__ block extracted');
var IRSUG = IRSRC.slice(IRSRC.indexOf('function _irSuggestedCellHtml'), IRSRC.indexOf('// Recommendation Summary table body'));

// ---- host-page stubs the block depends on ----------------------------------------------------------
var CURRENT_SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
var _ss = {};
global.sessionStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_ss, k) ? _ss[k] : null; },
  setItem: function (k, v) { _ss[k] = String(v); },
  removeItem: function (k) { delete _ss[k]; }
};
global.document = { querySelectorAll: function () { return []; }, getElementById: function () { return null; } };
global.AbortController = function () { this.signal = {}; this.abort = function () { this._aborted = true; }; };
function escapeReplenHtml(s) { return String(s == null ? '' : s); }
function getReplenishmentData() { return []; }
function _recSummaryRows() { return ''; }
var _irctxLastContext = { ready: true };
function updateReplenRecoContext() { return _irctxLastContext; }
global.window = { IRContext: { toScopeRequest: function () { return CURRENT_SCOPE; } } };
eval(IR);
eval(IRSUG);
ok(typeof loadRecommendationWorkspace_ === 'function' && typeof _irAggregateActionableRecommendedQty === 'function' && typeof invalidateRecommendationSessionCache === 'function', 'X1 cache + aggregation functions eval OK');

// ---- fakes -----------------------------------------------------------------------------------------
function envOk(lines, meta) {
  return { success: true, data: { lines: lines, pagination: { page: 1, size: 100, total: lines.length }, dataVersion: { formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01' } },
    meta: Object.assign({ requestId: 'REQ-P1', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }, meta || {}), errors: [] };
}
function envFail(code) { return { success: false, data: null, meta: { requestId: 'REQ-E1' }, errors: [{ code: code, message: code, details: null }] }; }
function line(over) { var L = { sku: 'CO1100-R', destinationType: 'MARKETPLACE', destinationKey: 'MARKETPLACE||KM||US||AMAZON_US||MP1', recommendationMode: 'MARKETPLACE_ORDER_NEED', recommendedQty: 120, provisionalOrderNeed: null, residualShortageQty: null, blocked: false, blockedReason: null }; if (over) for (var k in over) L[k] = over[k]; return L; }
function makeApi(env) { var calls = { n: 0 }; return { _calls: calls, workspaceApiActive: function (n) { return n === 'recommendation'; }, getWorkspace: function () { calls.n++; return Promise.resolve(env); } }; }
function makeDeferredApi() { var calls = { n: 0 }, pending = []; return { _calls: calls, _pending: pending, workspaceApiActive: function (n) { return n === 'recommendation'; }, getWorkspace: function () { calls.n++; var d = {}; d.promise = new Promise(function (res, rej) { d.resolve = res; d.reject = rej; }); pending.push(d); return d.promise; } }; }
function resetSession() { _ss = {}; global.sessionStorage.getItem = function (k) { return Object.prototype.hasOwnProperty.call(_ss, k) ? _ss[k] : null; }; global.sessionStorage.setItem = function (k, v) { _ss[k] = String(v); }; _irRecoCacheMem = null; }
function navAway() { _irRecoInvalidate('DISABLED'); }   // simulate leaving the page (in-memory state cleared)

(async function main() {
  section('A. first load → CACHE MISS → one request → cached');
  resetSession(); invalidateRecommendationSessionCache();
  var api = makeApi(envOk([line()])); global.window.KM = { api: api };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(api._calls.n === 1, 'A1 first load issues exactly ONE workspace request');
  ok(_irRecoState.status === 'READY', 'A2 successful canonical result applied');
  ok(_irRecoCacheGet(CURRENT_SCOPE) !== null, 'A3 successful result stored in the session cache');

  section('B. navigate away and back → CACHE HIT → zero new requests');
  navAway();
  var api2 = makeApi(envOk([line()])); global.window.KM = { api: api2 };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(api2._calls.n === 0, 'B1 same-scope revisit served from cache (ZERO new requests)');
  ok(_irRecoState.status === 'READY' && _irRecoState.fromCache === true, 'B2 state restored from cache');

  section('C. collapse / re-expand same scope → CACHE HIT (dedupe or cache) → zero new requests');
  var api3 = makeApi(envOk([line()])); global.window.KM = { api: api3 };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);   // already loaded → dedupe
  navAway();
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);   // state cleared → cache hit
  ok(api3._calls.n === 0, 'C1 re-expand issues no new request');

  section('D/E/F. scope change → new key → CACHE MISS');
  navAway(); CURRENT_SCOPE = { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA' };
  var apiD = makeApi(envOk([line({ sku: 'CO1100-R' })])); global.window.KM = { api: apiD };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(apiD._calls.n === 1, 'D1 Country/Marketplace change → new key → one fresh request');
  ok(_irRecoCacheGet({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' }) !== null && _irRecoCacheGet(CURRENT_SCOPE) !== null, 'E1 both scopes cached independently (no cross-scope reuse)');
  navAway(); CURRENT_SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
  var apiBack = makeApi(envOk([line()])); global.window.KM = { api: apiBack };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(apiBack._calls.n === 0, 'F1 returning to the first scope is still a cache hit (key is scope-safe)');

  section('G/H. stale / aborted response is NEVER cached');
  resetSession(); invalidateRecommendationSessionCache(); navAway();
  CURRENT_SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
  var dapi = makeDeferredApi(); global.window.KM = { api: dapi };
  loadRecommendationWorkspace_();                        // scope A in-flight (deferred)
  navAway(); CURRENT_SCOPE = { company: 'KM', country: 'GB', marketplace: 'AMAZON_UK' };
  loadRecommendationWorkspace_();                        // scope B supersedes A (bumps seq)
  dapi._pending[0].resolve(envOk([line()]));             // A resolves LATE → must be stale-ignored + not cached
  dapi._pending[1].resolve(envOk([line({ sku: 'CO1100-R' })]));
  await tick();
  ok(_irRecoCacheGet({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' }) === null, 'G1 stale (superseded) response NOT cached');
  ok(_irRecoCacheGet({ company: 'KM', country: 'GB', marketplace: 'AMAZON_UK' }) !== null, 'H1 the winning (latest) scope IS cached');

  section('I. API failure / rejection is NEVER stored as a successful cache entry');
  resetSession(); invalidateRecommendationSessionCache(); navAway();
  CURRENT_SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
  var apiFail = makeApi(envFail('WORKSPACE_ERROR')); global.window.KM = { api: apiFail };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(_irRecoState.status === 'API_ERROR' && _irRecoCacheGet(CURRENT_SCOPE) === null, 'I1 failure envelope surfaces + is NOT cached');
  navAway();
  var apiCfg = makeApi(envFail('RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED')); global.window.KM = { api: apiCfg };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(_irRecoState.status === 'CONFIG_NOT_READY' && _irRecoCacheGet(CURRENT_SCOPE) === null, 'I2 CONFIG_NOT_READY is NOT cached');

  section('J/K. blocked canonical result + valid zero ARE cacheable (valid runtime successes)');
  resetSession(); invalidateRecommendationSessionCache(); navAway();
  var apiBlk = makeApi(envOk([line({ blocked: true, blockedReason: 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', recommendedQty: null })])); global.window.KM = { api: apiBlk };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(_irRecoCacheGet(CURRENT_SCOPE) !== null, 'J1 a successful envelope with a blocked line IS cached');
  resetSession(); invalidateRecommendationSessionCache(); navAway();
  var apiZero = makeApi(envOk([line({ recommendedQty: 0, blocked: false })])); global.window.KM = { api: apiZero };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(_irRecoCacheGet(CURRENT_SCOPE) !== null, 'K1 a valid canonical zero IS cached');

  section('L–P. Suggested Qty = numeric presentation aggregation (non-blocked canonical recommendedQty)');
  ok((function () { var a = _irAggregateActionableRecommendedQty([line({ recommendedQty: 120 })]); return a.total === 120 && a.actionableCount === 1; })(), 'L one MARKETPLACE canonical 120 → total 120');
  ok((function () { var a = _irAggregateActionableRecommendedQty([line({ destinationType: 'WAREHOUSE', recommendedQty: 120 }), line({ destinationType: 'WAREHOUSE', recommendedQty: 240 })]); return a.total === 360 && a.actionableCount === 2; })(), 'M two WAREHOUSE canonical 120+240 → total 360');
  ok((function () { var a = _irAggregateActionableRecommendedQty([line({ blocked: true, provisionalOrderNeed: 100, recommendedQty: null }), line({ recommendedQty: 240 })]); return a.total === 240 && a.actionableCount === 1; })(), 'N blocked provisional 100 + canonical 240 → total 240 (provisional/blocked excluded)');
  ok((function () { var a = _irAggregateActionableRecommendedQty([line({ blocked: true, recommendedQty: null })]); return a.actionableCount === 0; })(), 'O all blocked → actionableCount 0 (caller shows "—", never fake 0)');
  ok((function () { var a = _irAggregateActionableRecommendedQty([line({ recommendedQty: 0 })]); return a.total === 0 && a.actionableCount === 1; })(), 'P legitimate canonical zero → total 0, actionableCount 1');

  section('Q. cell output — numeric total, honest dash, no "breakdown"');
  resetSession(); navAway(); global.window.KM = { api: makeApi(envOk([line({ recommendedQty: 120 })])) };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  var cell = _irSuggestedCellHtml({ sku: 'CO1100-R' });
  ok(/>120<|>120 |120</.test(cell) && !/breakdown/.test(cell), 'Q1 enabled + canonical 120 → cell shows "120", never "breakdown"');
  resetSession(); invalidateRecommendationSessionCache(); navAway();
  global.window.KM = { api: makeApi(envOk([line({ blocked: true, recommendedQty: null })])) };
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(/—/.test(_irSuggestedCellHtml({ sku: 'CO1100-R' })) && !/\b0\b/.test(_irSuggestedCellHtml({ sku: 'CO1100-R' })), 'Q2 all-blocked → honest "—" (no fake 0)');
  ok(_irSuggestedCellHtml({ sku: 'ZZZ', suggestedQty: 7 }).indexOf('—') >= 0 || _irSuggestedCellHtml({ sku: 'ZZZ' }).length > 0, 'Q3 SKU with no line renders an honest state (not a crash)');

  section('R. source safety — presentation only, no page-side recommendation math / no localStorage / no write');
  var CODE = IR.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');   // strip comments
  var AGG = CODE.slice(CODE.indexOf('function _irAggregateActionableRecommendedQty'), CODE.indexOf('function _irAggregateActionableRecommendedQty') + 400);
  ok(!/Math\.(ceil|floor)|calculateGap|calculateSuggested/.test(AGG), 'R1 aggregation helper has NO carton/gap formula');
  ok(!/forecast|currentStock|qualifiedIncoming/i.test(AGG), 'R2 aggregation helper has NO forecast/stock/incoming math');
  ok(/sessionStorage/.test(CODE) && !/localStorage|indexedDB/i.test(CODE), 'R3 cache uses sessionStorage only (no localStorage / IndexedDB)');
  ok(!/appendRow|setValues|executeCommand|createRequestOrder|submitRequestOrder|persistDraft|saveDraft|\.command\(/i.test(CODE), 'R4 no DB/API write in the READ block (cache session-persist excluded — sessionStorage only)');
  ok(/pagination:\s*\{\s*page:\s*1,\s*size:\s*100\s*\}/.test(IR), 'R5 still one bounded page per request (no per-SKU HTTP loop)');

  console.log('\n----------------------------------------');
  console.log('RECOMMENDATION SESSION CACHE + SUGGESTED AGG (F1-4B-FM3a): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
