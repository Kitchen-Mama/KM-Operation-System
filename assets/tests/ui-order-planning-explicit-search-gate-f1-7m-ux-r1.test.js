// Kitchen Mama Operation System — F1-7M-UX-ORDER-PLANNING-EXPLICIT-SEARCH-GATE-R1
// Order Planning normal result rows are EXPLICIT-SEARCH only. A single centralized gate in renderRequestOrderTable
// renders a neutral PRE_SEARCH state until requestOrderState.searched is set true by handleRequestOrderSearch; a
// Country/Marketplace/Clear scope change resets searched=false (no stale rows). PRE_SEARCH is distinct from EMPTY.
// The fb30b20 Country+Marketplace scoped Category counts are preserved. Filters/counts/alert hooks are NOT gated.
// Run: node assets/tests/ui-order-planning-explicit-search-gate-f1-7m-ux-r1.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
var RO = read('js/pages/request-order.js');

// Minimal DOM stub — only #ro-fixed-body / #ro-scroll-body are touched on the early-return branches under test.
function makeDoc() {
  var els = { 'ro-fixed-body': { innerHTML: 'X' }, 'ro-scroll-body': { innerHTML: 'X' } };
  return { getElementById: function (id) { return els[id] || null; }, _els: els };
}
// Run renderRequestOrderTable against a stubbed document + requestOrderState (early-return branches only).
function runRender(state) {
  var document = makeDoc();
  var requestOrderState = state;
  function _roRenderPagination() {}
  var renderRequestOrderTable;
  eval(extractFn(RO, 'renderRequestOrderTable') + '\nrenderRequestOrderTable = renderRequestOrderTable;');
  renderRequestOrderTable();
  return document._els['ro-scroll-body'].innerHTML;
}

// ===================================================================================================================
console.log('\n== PRE_SEARCH gate (centralized in renderRequestOrderTable) ==');
var preHtml = runRender({ searched: false, data: [{ sku: 'A', category: 'K', country: 'US' }], filters: {} });
ok(/Select filters and press Search/.test(preHtml), 'searched=false → PRE_SEARCH placeholder (even when data is present)');
ok(!/No Request Order data/.test(preHtml), 'PRE_SEARCH does NOT reuse the "No Request Order data" message');
ok(/ro-presearch-state/.test(preHtml), 'PRE_SEARCH uses a distinct state class (ro-presearch-state)');

// EMPTY (searched=true, zero rows) is distinct from PRE_SEARCH.
var emptyHtml = runRender({ searched: true, data: [], filters: {} });
ok(!/Select filters and press Search/.test(emptyHtml), 'searched=true + zero rows → NOT the PRE_SEARCH message');
ok(/No Request Order data|No matching/.test(emptyHtml), 'searched=true + zero rows → a distinct EMPTY/data state');

// ===================================================================================================================
console.log('\n== state + transitions ==');
ok(/searched: false,/.test(RO), 'requestOrderState.searched initial = false');
// gate precedes the data-null check.
var render = extractFn(RO, 'renderRequestOrderTable');
var gateIdx = render.indexOf('!requestOrderState.searched');
var dataNullIdx = render.indexOf('!requestOrderState.data');
ok(gateIdx !== -1 && dataNullIdx !== -1 && gateIdx < dataNullIdx, 'PRE_SEARCH gate is the FIRST check (before the data-null / results logic)');
// Search flips searched=true.
var search = extractFn(RO, 'handleRequestOrderSearch');
ok(/requestOrderState\.searched = true;/.test(search), 'handleRequestOrderSearch sets searched = true');
// Country/Marketplace reset searched=false; other filters do not (audited classification).
var upd = extractFn(RO, 'updateRequestOrderFilter');
ok(/if \(filterType === 'country' \|\| filterType === 'marketplace'\) \{\s*\n\s*requestOrderState\.searched = false;/.test(upd), 'Country/Marketplace change → searched=false (PRE_SEARCH, no stale rows)');
ok((upd.match(/searched = false/g) || []).length === 1, 'updateRequestOrderFilter resets searched ONLY for Country/Marketplace (Risk/SKU refine the current query, not reset)');
// Clear resets to PRE_SEARCH.
var clr = extractFn(RO, 'clearRequestOrderFilters');
ok(/requestOrderState\.searched = false;/.test(clr), 'clearRequestOrderFilters → searched=false (PRE_SEARCH)');
ok(/_populateRequestOrderCategoryTabs\(\);/.test(clr), 'Clear recomputes Category counts (scope reset to full universe)');

// ===================================================================================================================
console.log('\n== centralized gate ⇒ async callbacks cannot expose rows before Search ==');
// The ONLY searched=true assignment is in handleRequestOrderSearch — no callback sprinkles it.
ok((RO.match(/\.searched = true/g) || []).length === 1, 'searched=true is set in exactly ONE place (handleRequestOrderSearch) — composer/gap/reco/post-write callbacks never force it true');
// Async render entry points funnel through the single gated renderRequestOrderTable (not a parallel row renderer).
ok(/function _opLoadFirstLayerComposer_/.test(RO) && /_roRenderAll\(\)/.test(RO), 'first-layer composer arrival routes through _roRenderAll → renderRequestOrderTable (the gated path)');

// ===================================================================================================================
console.log('\n== fb30b20 scoped Category counts preserved + no authority/transport change ==');
ok(/function _roCountryMarketplaceScopedRows\(\)/.test(RO), 'fb30b20 _roCountryMarketplaceScopedRows preserved');
ok(/var data = _roCountryMarketplaceScopedRows\(\);/.test(RO), 'Category tabs still source the Country+Marketplace-scoped rows (fb30b20)');
ok(/getAiPlanFirstLayer/.test(RO), 'AI-Plan composer untouched');
ok(RO.indexOf('getOperationDbFromSheet') === -1, 'no canonical getOperationDb (broad load only via legacy kill-switch loadOperationDb)');

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
