// Kitchen Mama Operation System — F1-7M-B2-HOTFIX-ORDER-PLANNING-FILTER-COUNTS-AND-SHIPMENT-DRAFT-COLD-START-R1
// (A) Order Planning Category chip counts now derive from the CURRENT Country+Marketplace scope (was the unscoped
//     requestOrderState.data) and recompute when Country/Marketplace changes. Pure view-scoping — no formula change.
// (B) Shipment Draft cold-start: _shUseDb() no longer requires isCloudWriteEnabled()/google-sheet (broad cache primed);
//     it uses the shared cache-independent KM.DB.isScopedReadEligible() so a cold canonical session fires the scoped
//     `shipment` workspace instead of the false "Connect the Operation DB" banner.
// (C) Residual audit: no ACTIVE cache-dependent READ eligibility gate remains.
// Run: node assets/tests/api-order-planning-category-scope-and-shipment-draft-cold-start-f1-7m-b2-r1.test.js

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
function stripComments(s) { return s.replace(/\/\/[^\n]*/g, ''); }

var RO = read('js/pages/request-order.js');
var SH = read('js/pages/shipping-history.js');

// ===================================================================================================================
console.log('\n== (A) Order Planning — Category count source scoped to Country + Marketplace ==');
var scopedFnSrc = extractFn(RO, '_roCountryMarketplaceScopedRows');
function runScoped(rows, filters, idset) {
  var requestOrderState = { data: rows, filters: filters };
  function _roSelectedMarketplaceIdSet() { return idset || null; }
  function _roMarketplaceKey(i) { return String(i.marketplaceId || i.marketplace || ''); }
  var _roCountryMarketplaceScopedRows;
  eval(scopedFnSrc + '\n_roCountryMarketplaceScopedRows = _roCountryMarketplaceScopedRows;');
  return _roCountryMarketplaceScopedRows();
}
function countsByCategory(rows) { var m = {}; rows.forEach(function (r) { m[r.category] = (m[r.category] || 0) + 1; }); return m; }

var DATA = [
  { sku: 'A1', country: 'US', marketplace: 'AMZ', category: 'Kitchen' },
  { sku: 'A2', country: 'US', marketplace: 'AMZ', category: 'Home' },
  { sku: 'A3', country: 'CA', marketplace: 'AMZ', category: 'Kitchen' },
  { sku: 'A4', country: 'CA', marketplace: 'WMT', category: 'Garden' }
];
// No scope → whole universe.
var all = runScoped(DATA, {});
ok(all.length === 4, 'no Country/Marketplace filter → full universe (4 rows)');
ok(JSON.stringify(countsByCategory(all)) === JSON.stringify({ Kitchen: 2, Home: 1, Garden: 1 }), 'All-scope category counts = whole set');
// Country = US → counts recompute to US-scoped set.
var us = runScoped(DATA, { country: ['US'] });
ok(us.length === 2 && JSON.stringify(countsByCategory(us)) === JSON.stringify({ Kitchen: 1, Home: 1 }), 'Country=US → category counts scoped (Kitchen 1, Home 1; Garden absent)');
// Country = CA → different scoped counts (proves counts respond to Country).
var ca = runScoped(DATA, { country: ['CA'] });
ok(ca.length === 2 && JSON.stringify(countsByCategory(ca)) === JSON.stringify({ Kitchen: 1, Garden: 1 }), 'Country=CA → category counts scoped (Kitchen 1, Garden 1)');
// Country=CA + Marketplace=WMT (display-string path, idset null) → single scoped row.
var caWmt = runScoped(DATA, { country: ['CA'], marketplace: ['WMT'] }, null);
ok(caWmt.length === 1 && JSON.stringify(countsByCategory(caWmt)) === JSON.stringify({ Garden: 1 }), 'Country=CA + Marketplace=WMT → counts scoped to the combination (Garden 1)');
// Marketplace identity via marketplace_id set (canonical) when available.
var idData = [{ sku: 'X', country: 'US', marketplace: 'AMZ', marketplaceId: 'M1', category: 'Kitchen' }, { sku: 'Y', country: 'US', marketplace: 'AMZ', marketplaceId: 'M2', category: 'Home' }];
var byId = runScoped(idData, { marketplace: ['Amazon'] }, { M1: 1 });
ok(byId.length === 1 && byId[0].sku === 'X', 'Marketplace scope resolves via marketplace_id set (identity), not the display string');

// source wiring
ok(/var data = _roCountryMarketplaceScopedRows\(\);/.test(RO), '_populateRequestOrderCategoryTabs sources the scoped rows (not unscoped requestOrderState.data)');
var upd = extractFn(RO, 'updateRequestOrderFilter');
// The recompute lives inside the country||marketplace branch (F1-7M-UX inserted a searched=false line between the
// guard and the recompute — order-independent; assert both the guard and the recompute call are present in it).
ok(/if \(filterType === 'country' \|\| filterType === 'marketplace'\) \{/.test(upd) && /_populateRequestOrderCategoryTabs\(\);/.test(upd), 'Country/Marketplace change recomputes the Category tabs (counts respond to scope)');
var catIdx = upd.indexOf('_populateRequestOrderCategoryTabs()'), renderIdx = upd.indexOf('renderRequestOrderTable()');
ok(catIdx !== -1 && renderIdx !== -1 && catIdx < renderIdx, 'category recompute runs BEFORE the row render');
// No business-formula surface touched: the composer/gap/recommendation reads are unchanged.
ok(/getAiPlanFirstLayer/.test(RO) && /_buildRequestOrderRowsFromDb/.test(RO), 'AI-Plan composer + Layer-1 builder still present (untouched)');

// ===================================================================================================================
console.log('\n== (B) Shipment Draft cold-start gate cache-independent ==');
var shUseDb = extractFn(SH, '_shUseDb');
function runShUseDb(win) { var window = win; var _shUseDb; eval(shUseDb + '\n_shUseDb = _shUseDb;'); return _shUseDb(); }
function shWin(over) { var db = { isScopedReadEligible: function () { return true; }, getShipments: function () { return []; } }; if (over) over(db); return { KM: { DB: db } }; }
ok(runShUseDb(shWin()) === true, 'cold cloud (isScopedReadEligible true) → ELIGIBLE (fires scoped shipment workspace)');
ok(runShUseDb(shWin(function (db) { db.isScopedReadEligible = function () { return false; }; })) === false, 'explicit mock → NOT eligible (disconnected banner preserved)');
ok(runShUseDb(shWin(function (db) { db.isScopedReadEligible = undefined; })) === false, 'no isScopedReadEligible → NOT eligible (safe)');
ok(stripComments(shUseDb).indexOf('isCloudWriteEnabled()') === -1, '_shUseDb no longer keys on isCloudWriteEnabled() (the cache-dependent trap)');
ok(/isScopedReadEligible\(\)/.test(shUseDb), '_shUseDb uses isScopedReadEligible()');
// genuine EMPTY is a distinct state from the disconnected banner.
ok(/No shipment drafts\. Approve a Weekly Shipping Plan/.test(SH), 'genuine empty renders a distinct EMPTY state ("No shipment drafts …"), not the disconnected banner');
ok(/_shEffectiveWorkspace\(\)/.test(SH) && /workspaceApiActive\('shipment'\)/.test(SH), 'canonical read = cache-independent workspaceApiActive(shipment) / getWorkspace');
ok(SH.indexOf('getOperationDbFromSheet') === -1, 'shipment page never calls getOperationDbFromSheet (broad load only via legacy kill-switch)');

// ===================================================================================================================
console.log('\n== (C) residual audit — no ACTIVE cache-dependent READ eligibility gate remains ==');
var PAGES = fs.readdirSync(path.join(__dirname, '..', 'js', 'pages')).filter(function (f) { return /\.js$/.test(f); });
var residual = [];
PAGES.forEach(function (f) {
  var code = stripComments(read('js/pages/' + f));
  if (code.indexOf("getDataSourceMode() === 'google-sheet'") !== -1) residual.push(f + ' :: getDataSourceMode()===google-sheet');
});
ok(residual.length === 0, 'ACTIVE_CACHE_DEPENDENT_READ_ELIGIBILITY_COUNT = 0' + (residual.length ? (' — ' + residual.join('; ')) : ''));
// The intentional WRITE posture stays strict in the db-api (not a page read gate).
ok(/isCloudWriteEnabled = function\(\) \{[\s\S]{0,120}getOperationDbDataSourceMode\(\) === 'google-sheet'/.test(read('js/api/operation-system-db-api.js')), 'isCloudWriteEnabled WRITE posture unchanged (strict, db-api only)');

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
