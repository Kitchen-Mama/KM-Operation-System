// Kitchen Mama Operation System — Replenishment Outlook FROZEN primary + layout containment (F1-4B-FM6).
// Run: node assets/tests/inventory-outlook-containment-f1-4b-fm6.test.js
// -----------------------------------------------------------------------------
// UI LAYOUT HARD RULE: the recommendation result must ALWAYS stay inside the expanded-SKU card. Proves the PRIMARY
// surface is the FROZEN compact table Window | Gap | Suggested Qty | Note ONLY (no Destination/Mode/Demand/Covered/
// Stock/Incoming/Status/Reason columns — those live under collapsed Diagnostics), that every wide table sits inside
// an overflow-x containment wrapper, that long Note/Reason/Error and very large numbers cannot widen/overflow the
// card (structure + CSS containment rules), and the A–H result states render contained. IRCTX+IRRECO eval'd; CSS scanned.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function slice(m1, m2) { var a = JS.indexOf(m1), b = JS.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return JS.slice(a, b); }
var IRCTX = slice('// __IRCTX_START__', '// __IRCTX_END__');
var IRRECO = slice('// __IRRECO_START__', '// __IRRECO_END__');

global.window = { IRCountry: { matches: function (a, b) { return String(a).trim().toUpperCase() === String(b).trim().toUpperCase(); } } };
global.document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; } };
global.AbortController = function () { this.signal = {}; this.abort = function () { this._aborted = true; }; };
var _irctxLastContext = null;
function escapeReplenHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function getReplenishmentData() { return []; }
function _recSummaryRows() { return '<tr><td>legacy</td></tr>'; }
function updateReplenRecoContext() { return _irctxLastContext; }
eval(IRCTX); eval(IRRECO);

var READY = { status: 'READY', company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP1', calculationMonth: '2026-08', planningCycle: '2026-W40', missing: [], issues: [] };
function setCtx(m) { _irctxLastContext = m; }
function tick() { return Promise.resolve().then(function () {}).then(function () {}); }
function makeApi(env) { return { workspaceApiActive: function (n) { return n === 'recommendation'; }, getWorkspace: function () { return Promise.resolve(env); } }; }
function envOk(lines) { return { success: true, data: { lines: lines, pagination: { page: 1 }, dataVersion: { formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01' } }, meta: { requestId: 'REQ-H1', calculationMonth: '2026-08' }, errors: [] }; }
function envFail(code, msg) { return { success: false, data: null, meta: { requestId: 'REQ-E1' }, errors: [{ code: code, message: msg || code, details: null }] }; }
function freshLoad(env, ctx) { if (typeof invalidateRecommendationSessionCache === 'function') invalidateRecommendationSessionCache(); _irRecoInvalidate('CONTEXT_NOT_READY'); global.window.KM = { api: makeApi(env) }; setCtx(ctx || READY); return Promise.resolve(loadRecommendationWorkspace_()).then(tick); }
function hz(wc, gap, sug, req) { return { windowCode: wc, requiredByDate: req || '2026-08-25', demandQty: (gap || 0) + 10, coveredQty: 10, gapQty: gap, suggestedOrderQty: sug }; }
function mkt(over) { var L = { recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: 'CO1100-R', destinationType: 'MARKETPLACE', destinationKey: 'MK1', destinationLabel: 'Amazon US', marketplaceId: 'MP1', calculatedGap: 500, currentStockQty: 7374, qualifiedIncomingQty: 0, incomingCompleteness: 'COMPLETE', recommendedQty: 520, blocked: false, blockedReason: null, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] }, horizons: [hz('D18', 0, 0), hz('D30', 200, 240), hz('D45', 500, 520), hz('D90', 0, 0)] }; if (over) for (var k in over) L[k] = over[k]; return L; }
function primaryOf(body) { var i = body.indexOf('<details'); return i < 0 ? body : body.slice(0, i); }

(async function main() {

  section('A/F · normal + all four windows populated → FROZEN 4-column primary');
  await freshLoad(envOk([mkt()]));
  var body = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  var primary = primaryOf(body);
  ok(/replen-horizon-table--outlook/.test(primary), 'A1 primary uses the outlook table');
  ok(/>Window<\/th>/.test(primary) && /Gap<\/th>/.test(primary) && /Suggested Qty<\/th>/.test(primary) && />Note<\/th>/.test(primary), 'A2 primary headers = Window | Gap | Suggested Qty | Note');
  ok(/18 Days/.test(primary) && /30 Days/.test(primary) && /45 Days/.test(primary) && /90 Days/.test(primary), 'F1 all four windows present');

  section('5 · NO technical columns in the primary surface');
  ['Destination', 'Mode', 'Demand', 'Covered', 'Stock', 'Incoming', 'Status', 'Reason', 'Required By'].forEach(function (col) {
    ok(primary.indexOf('>' + col + '<') < 0, '5-no-' + col + ': "' + col + '" is NOT a primary column');
  });
  ok(/No shortage/.test(primary) && /Replenishment required/.test(primary), 'NOTE1 truthful per-window Note rendered (No shortage / Replenishment required)');

  section('Containment · every wide table sits inside an overflow-x wrapper');
  ok(/replen-horizon-tablewrap/.test(primary), 'C1 primary outlook table wrapped in overflow-x container');
  // the primary region must not contain a bare <table that is not preceded by a wrap/scroll container
  ok(primary.indexOf('<table') < 0 || primary.lastIndexOf('replen-horizon-tablewrap', primary.indexOf('<table')) >= 0, 'C2 no un-contained table in the primary surface');

  section('B · very large quantities render verbatim, right-aligned nowrap (scroll, not card-widen)');
  await freshLoad(envOk([mkt({ horizons: [hz('D18', 1234567, 1234880), hz('D30', 0, 0), hz('D45', 0, 0), hz('D90', 0, 0)] })]));
  var pBig = primaryOf(_irRecoSummaryCardBody({ sku: 'CO1100-R' }));
  ok(/1234567/.test(pBig) && /1234880/.test(pBig), 'B1 large Gap/Suggested rendered verbatim');
  ok(/replen-horizon-tablewrap/.test(pBig), 'B2 large numbers scroll inside the wrap (card cannot widen)');

  section('C · long Note/Reason wraps inside its own container');
  var longReason = 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED_WITH_A_VERY_LONG_CANONICAL_TOKEN_THAT_MUST_WRAP_INSIDE_ITS_OWN_CELL_AND_NEVER_WIDEN_THE_CARD_0123456789';
  await freshLoad(envOk([mkt({ blocked: true, blockedReason: longReason, horizons: null })]));
  var pLong = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(pLong.indexOf(longReason) >= 0 && /replen-horizon-dest__blocked/.test(pLong), 'C3 long reason shown inside the blocked container (CSS word-breaks it)');

  section('D · MARKETPLACE_STOCK_MISSING → blocked, contained, no fabricated table');
  await freshLoad(envOk([mkt({ blocked: true, blockedReason: 'MARKETPLACE_STOCK_MISSING', horizons: null, recommendedQty: null })]));
  var pD = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/MARKETPLACE_STOCK_MISSING/.test(pD) && /replen-horizon-dest__blocked/.test(pD), 'D1 MARKETPLACE_STOCK_MISSING shown truthfully in blocked container');
  ok(primaryOf(pD).indexOf('replen-horizon-table--outlook') < 0, 'D2 no fabricated outlook table for a blocked destination');

  section('E · HORIZONS_NOT_AVAILABLE → na container, contained');
  await freshLoad(envOk([mkt({ horizons: [] })]));
  var pE = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/HORIZONS_NOT_AVAILABLE/.test(pE) && /replen-horizon-dest__na/.test(pE), 'E1 HORIZONS_NOT_AVAILABLE shown in the na container');

  section('G · Diagnostics holds the technical detail, each wide table in a scroll container');
  await freshLoad(envOk([mkt()]));
  var full = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  var diag = full.slice(full.indexOf('<details'));
  ok(/<summary>Diagnostics<\/summary>/.test(diag), 'G1 Diagnostics is a collapsed <details>');
  ok(/replen-horizon-table--detail/.test(diag) && /Demand<\/th>/.test(diag) && /Covered<\/th>/.test(diag), 'G2 full horizon detail (Demand/Covered/Required By) lives under Diagnostics');
  ok((diag.match(/replen-recsum-ws__scroll/g) || []).length >= 2, 'G3 legacy + horizon-detail tables each wrapped in an overflow-x scroll container');
  ok(diag.indexOf('Demand / Gap') >= 0, 'G4 legacy technical table retained under Diagnostics');

  section('H · long API error stays inside the contained result surface');
  await freshLoad(envFail('API_ERROR', 'a very long recommendation transport error message '.repeat(6)));
  var pErr = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/replen-recsum-ws--error/.test(pErr) && /request failed/.test(pErr), 'H1 long error rendered inside the contained .replen-recsum-ws surface');

  section('CSS · containment rules present (no outer overflow; internal wrap/scroll)');
  ok(/\.replen-recsum-ws\s*\{[^}]*max-width:\s*100%/.test(CSS), 'CSS1 .replen-recsum-ws max-width:100% (never exceeds the card)');
  ok(/\.replen-horizon-tablewrap\s*\{[^}]*overflow-x:\s*auto/.test(CSS), 'CSS2 outlook table wrapper scrolls internally');
  ok(/\.replen-horizon-table__note\s*\{[^}]*(overflow-wrap:\s*anywhere|word-break:\s*break-word)/.test(CSS), 'CSS3 Note cell wraps (bounded, word-break)');
  ok(/\.replen-horizon-table__note\s*\{[^}]*max-width/.test(CSS), 'CSS4 Note cell has a bounded max-width (never determines table width)');
  ok(/\.replen-horizon-table\s+\.replen-recsum-table__num\s*\{[^}]*white-space:\s*nowrap/.test(CSS), 'CSS5 numeric cells nowrap (readable alignment; large values scroll)');
  ok(/\.replen-recsum-ws__scroll\s*\{[^}]*overflow-x:\s*auto/.test(CSS), 'CSS6 diagnostics wide tables scroll internally');
  ok(/(\.replen-horizon-dest__blocked[\s\S]{0,120}overflow-wrap:\s*anywhere|overflow-wrap:\s*anywhere[\s\S]{0,120}\.replen-horizon-dest__na)/.test(CSS) || /\.replen-horizon-dest__blocked,\s*\n#ops-section \.replen-horizon-dest__na\s*\{[^}]*overflow-wrap:\s*anywhere/.test(CSS), 'CSS7 blocked/na reason containers word-break long text');

  console.log('\n----------------------------------------');
  console.log('OUTLOOK CONTAINMENT (F1-4B-FM6): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
