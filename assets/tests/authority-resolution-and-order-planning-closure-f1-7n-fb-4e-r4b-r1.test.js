// F1-7N-FB-4E-R4B-R1 — AUTHORITY RESOLUTION AND ORDER-PLANNING CLOSURE.
//
// Closes the three sections R4B left open, and each one is asserted by EXECUTING the thing rather than by
// reading the source for a promising-looking string:
//
//   §1  factory site allocation — the KMFSA projection is run against concrete multi-company fixtures, and the
//       three surfaces that used to carry their own factory number are checked for the shared call.
//   §2  Order Planning draft readback — the flat reader, its DTO and its writer are executed together, because
//       the defect was that they disagreed about what a blank cell means.
//   §3  AI Plan / Recalculate — the page is LOADED in a DOM sandbox and the buttons are actually clicked. The
//       root cause was that the outcome was painted onto a display:none element, so a source-text assertion
//       would have passed against the broken code. Only observing what a click paints can catch this.
//
// Run: node assets/tests/authority-resolution-and-order-planning-closure-f1-7n-fb-4e-r4b-r1.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var KMFSA = require(path.join(ROOT, 'assets/js/core/supply-planning-factory-site-allocation.js'));
var IR = read('assets/js/pages/inventory-replenishment.js');
var RO_SRC = read('assets/js/pages/request-order.js');
var G56 = read('assets/specs/active/apps-script/56_api_v1_ai_plan_first_layer.gs');
var G47 = read('assets/specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var HTML = read('index.html');
var PAGEHTML = read('assets/html/pages/request-order.html');
var CSS = read('assets/css/components.css');

// =============================================================================================================
// §1 — FACTORY SITE ALLOCATION.
//
// The live defect: the COMPLETE physical factory quantity appeared under every marketplace scope. The fixtures
// below are the six proofs the authority decision asks for, run against the real module.
// =============================================================================================================
section('§1 factory site allocation — the authorized source policy, executed');

var WH = [
  { warehouse_id: 'WH-CN-YOUXIN', country: 'CN', is_factory_warehouse: 'TRUE', is_active: 'TRUE', warehouse_name: 'Youxin', company: 'Kitchen Mama' },
  { warehouse_id: 'WH-CN-SECOND', country: 'CN', is_factory_warehouse: 'TRUE', is_active: 'TRUE', warehouse_name: 'Second CN', company: 'Kitchen Mama' },
  { warehouse_id: 'WH-TW-SHENGYI', country: 'TW', is_factory_warehouse: 'TRUE', is_active: 'TRUE', warehouse_name: 'Shengyi', company: 'ResTW' },
  { warehouse_id: 'WH-US-3PL', country: 'US', is_factory_warehouse: 'FALSE', is_active: 'TRUE', warehouse_name: 'A 3PL', company: 'Kitchen Mama' }
];
// Three site scopes spanning THREE companies — the cross-company case the decision is about.
var SITES = [
  { marketplace_id: 'MKT-KM-US', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', sku: 'SP1' },
  { marketplace_id: 'MKT-RESUS-US', company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP1' },
  { marketplace_id: 'MKT-RESTW-TW', company: 'ResTW', country: 'TW', marketplace: 'Shopee', sku: 'SP1' }
];
// Rolling window from calculationMonth 2026-11 is 2026-12, 2027-01, 2027-02, 2027-03.
function fcFor(company, country, marketplace, perMonth) {
  return [
    { year: '2026', company: company, country: country, marketplace: marketplace, sku: 'SP1', dec: perMonth, nov: 99999 },
    { year: '2027', company: company, country: country, marketplace: marketplace, sku: 'SP1', jan: perMonth, feb: perMonth, mar: perMonth, apr: 99999 }
  ];
}
// KM 100/mo -> 400 · ResUS 200/mo -> 800 · ResTW 50/mo -> 200. Cross-company denominator = 1400.
var FC = [].concat(fcFor('Kitchen Mama', 'US', 'Amazon', 100), fcFor('ResUS', 'US', 'Amazon', 200), fcFor('ResTW', 'TW', 'Shopee', 50));
var MONTH = '2026-11';

function project(factoryRows, extra) {
  var input = { sku: 'SP1', factoryRows: factoryRows, warehouses: WH, sites: SITES, forecastRows: FC, calculationMonth: MONTH };
  if (extra) { for (var k in extra) input[k] = extra[k]; }
  return KMFSA.project(input);
}
function siteQty(p, id) { var e = p.bySite['MKT:' + id]; return e ? e.total : null; }
function siteCountry(p, id, c) { var e = p.bySite['MKT:' + id]; return (e && e.byCountry[c]) || 0; }

// --- TEST 1 · CN allocation uses the CROSS-COMPANY four-month denominator ------------------------------------
// 1400 available, weights 400 / 800 / 200 out of 1400 -> 400 / 800 / 200. Every company receives a share, and
// no site receives the whole pool — which is the defect stated exactly.
var t1 = project([{ sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 1400, fac_reserved_stock: 0 }]);
eq(siteCountry(t1, 'MKT-KM-US', 'CN'), 400, '1.1 CN share to KM = its own 4-month FC over the CROSS-COMPANY denominator');
eq(siteCountry(t1, 'MKT-RESUS-US', 'CN'), 800, '1.2 CN share to ResUS');
eq(siteCountry(t1, 'MKT-RESTW-TW', 'CN'), 200, '1.3 CN share to ResTW — a third company, and it participates');
eq(t1.pools[0].denominator, 1400, '1.4 the denominator is the FC of the WHOLE eligible receiver set, not one company');
eq(t1.pools[0].policy, 'SHARED_ALL_ELIGIBLE', '1.5 the CN pool ran under the shared policy');
eq(t1.pools[0].eligibleSiteKeys.length, 3, '1.6 all three site scopes are eligible receivers of the CN source');
ok(siteQty(t1, 'MKT-KM-US') !== 1400 && siteQty(t1, 'MKT-RESUS-US') !== 1400,
  '1.7 THE LIVE DEFECT: no site is shown the complete physical pool');

// --- TEST 2 · TW allocation returns zero outside ResUS --------------------------------------------------------
var t2 = project([{ sku: 'SP1', warehouse_id: 'WH-TW-SHENGYI', fac_current_stock: 500, fac_reserved_stock: 0 }]);
eq(siteCountry(t2, 'MKT-RESUS-US', 'TW'), 500, '2.1 the whole TW pool goes to the only eligible ResUS scope');
eq(siteCountry(t2, 'MKT-KM-US', 'TW'), 0, '2.2 KM receives ZERO from the TW source');
eq(siteCountry(t2, 'MKT-RESTW-TW', 'TW'), 0, '2.3 ResTW receives ZERO from the TW source — including the TW-country site');
eq(t2.pools[0].policy, 'RESUS_ONLY', '2.4 the TW pool ran under the ResUS-only policy');
eq(t2.pools[0].eligibleSiteKeys, ['MKT:MKT-RESUS-US'], '2.5 and the eligible receiver set names exactly one scope');
// TWO eligible ResUS scopes share the TW pool by the same 4-month FC share.
var SITES2 = SITES.concat([{ marketplace_id: 'MKT-RESUS-CA', company: 'ResUS', country: 'CA', marketplace: 'Amazon', sku: 'SP1' }]);
var FC2 = FC.concat(fcFor('ResUS', 'CA', 'Amazon', 100));   // 400 vs the US scope's 800
var t2b = KMFSA.project({ sku: 'SP1', factoryRows: [{ sku: 'SP1', warehouse_id: 'WH-TW-SHENGYI', fac_current_stock: 600, fac_reserved_stock: 0 }],
  warehouses: WH, sites: SITES2, forecastRows: FC2, calculationMonth: MONTH });
eq(siteCountry(t2b, 'MKT-RESUS-US', 'TW'), 400, '2.6 two ResUS scopes split the TW pool 800:400 -> 400');
eq(siteCountry(t2b, 'MKT-RESUS-CA', 'TW'), 200, '2.7 ... and 200');
eq(siteCountry(t2b, 'MKT-KM-US', 'TW') + siteCountry(t2b, 'MKT-RESTW-TW', 'TW'), 0, '2.8 KM + ResTW still receive zero');

// --- TEST 3 · CN and TW physical stock is CONSERVED ------------------------------------------------------------
var t3 = project([
  { sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 1400, fac_reserved_stock: 0 },
  { sku: 'SP1', warehouse_id: 'WH-CN-SECOND', fac_current_stock: 700, fac_reserved_stock: 0 },
  { sku: 'SP1', warehouse_id: 'WH-TW-SHENGYI', fac_current_stock: 500, fac_reserved_stock: 0 }
]);
eq(t3.totals.available, 2600, '3.1 total available is the sum of the three physical pools');
eq(t3.totals.allocated, 2600, '3.2 every unit is allocated exactly once — nothing invented, nothing lost');
eq(t3.totals.unallocated, 0, '3.3 and the remainder is zero');
var sumSites = Object.keys(t3.bySite).reduce(function (a, k) { return a + t3.bySite[k].total; }, 0);
eq(sumSites, 2600, '3.4 Σ over SITES equals the physical total — the pool is divided, never duplicated');
eq(t3.byCountry.CN.allocated, 2100, '3.5 CN conserved across its TWO separate pools');
eq(t3.byCountry.TW.allocated, 500, '3.6 TW conserved');
eq(t3.pools.length, 3, '3.7 three physical pools, allocated SEPARATELY (grain = warehouse_id × SKU)');
// Two CN pools must not be merged into one denominator: each is divided 400:800:200 on its own.
eq(siteCountry(t3, 'MKT-KM-US', 'CN'), 600, '3.8 KM CN = 400 (of 1400) + 200 (of 700) — per-pool, not one merged pool');

// --- TEST 4 · deterministic rounding and remainder ownership ---------------------------------------------------
// 10 units over weights 400 / 800 / 200 -> raw 2.857 / 5.714 / 1.428 -> floors 2/5/1 = 8, two remainders to the
// two largest fractions (.714 ResUS, .857 KM) — never to the largest weight, and never at random.
var t4 = project([{ sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 10, fac_reserved_stock: 0 }]);
eq([siteCountry(t4, 'MKT-KM-US', 'CN'), siteCountry(t4, 'MKT-RESUS-US', 'CN'), siteCountry(t4, 'MKT-RESTW-TW', 'CN')], [3, 6, 1],
  '4.1 fractional split resolves by largest remainder');
eq(t4.totals.allocated, 10, '4.2 and still sums to the pool exactly');
// Input order must not change the answer.
var t4b = KMFSA.project({ sku: 'SP1', factoryRows: [{ sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 10, fac_reserved_stock: 0 }],
  warehouses: WH.slice().reverse(), sites: SITES.slice().reverse(), forecastRows: FC.slice().reverse(), calculationMonth: MONTH });
eq(JSON.stringify(t4b.bySite), JSON.stringify(t4.bySite), '4.3 reversing every input array produces the IDENTICAL allocation');
eq(JSON.stringify(project([{ sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 10, fac_reserved_stock: 0 }]).bySite),
  JSON.stringify(t4.bySite), '4.4 repeated calculation is byte-identical');
// EQUAL remainders are broken by the immutable canonical site identity, not by array position.
var tie = KMFSA.largestRemainder(1, [{ key: 'MKT:BBB', weight: 1 }, { key: 'MKT:AAA', weight: 1 }]);
eq(tie.byKey['MKT:AAA'], 1, '4.5 an exact tie goes to the lexicographically first canonical site key');
eq(tie.byKey['MKT:BBB'], 0, '4.6 ... and not to the one that happened to be first in the array');
var tieRev = KMFSA.largestRemainder(1, [{ key: 'MKT:AAA', weight: 1 }, { key: 'MKT:BBB', weight: 1 }]);
eq(tieRev.byKey, tie.byKey, '4.7 and the tie-break is order-independent');

// --- TEST 5 · zero denominator remains UNALLOCATED --------------------------------------------------------------
var t5 = KMFSA.project({ sku: 'SP1', factoryRows: [{ sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 900, fac_reserved_stock: 0 }],
  warehouses: WH, sites: SITES, forecastRows: [], calculationMonth: MONTH });
eq(t5.totals.allocated, 0, '5.1 a zero FC denominator allocates ZERO');
eq(t5.totals.unallocated, 900, '5.2 and the whole pool is reported unallocated, not quietly absorbed');
eq(t5.pools[0].unallocatedReason, 'ZERO_FORECAST_DENOMINATOR', '5.3 with an EXPLICIT reason');
eq(siteQty(t5, 'MKT-KM-US'), 0, '5.4 no arbitrary 100% fallback to any single site');
eq(siteQty(t5, 'MKT-RESUS-US'), 0, '5.5 no arbitrary equal split either');
ok(t5.issues.filter(function (i) { return i.code === 'SITE_FORECAST_WINDOW_MISSING'; }).length === 3,
  '5.6 MISSING is not 0 — every site with no FC row for the window is reported');
// An unauthorized factory country fails closed rather than defaulting to "shared".
var WH_JP = WH.concat([{ warehouse_id: 'WH-JP-X', country: 'JP', is_factory_warehouse: 'TRUE', is_active: 'TRUE' }]);
var t5b = KMFSA.project({ sku: 'SP1', factoryRows: [{ sku: 'SP1', warehouse_id: 'WH-JP-X', fac_current_stock: 100, fac_reserved_stock: 0 }],
  warehouses: WH_JP, sites: SITES, forecastRows: FC, calculationMonth: MONTH });
eq(t5b.totals.allocated, 0, '5.7 a factory country with no authorized source policy allocates nothing');
eq(t5b.pools[0].unallocatedReason, 'NO_AUTHORIZED_SOURCE_POLICY', '5.8 ... and says so — a new factory country is a decision, not a default');

// --- TEST 6 · existing reservations reduce the allocatable pool --------------------------------------------------
var t6 = project([{ sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 1400, fac_reserved_stock: 700 }]);
eq(t6.pools[0].availableQty, 700, '6.1 the pool is MAX(current − reserved, 0) — the canonical available quantity');
eq(t6.totals.allocated, 700, '6.2 only the available quantity is allocated');
eq([siteCountry(t6, 'MKT-KM-US', 'CN'), siteCountry(t6, 'MKT-RESUS-US', 'CN'), siteCountry(t6, 'MKT-RESTW-TW', 'CN')], [200, 400, 100],
  '6.3 shares are of the AVAILABLE pool, not of current_stock');
var t6b = project([{ sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 100, fac_reserved_stock: 500 }]);
eq(t6b.pools[0].availableQty, 0, '6.4 over-reservation floors at zero, never negative');
eq(t6b.pools[0].unallocatedReason, 'NO_AVAILABLE_STOCK', '6.5 ... with its own reason');
// This is the SAME formula Factory Inventory renders, and that is why the two pages can no longer disagree.
ok(/available_factory_stock = MAX\(currentStock - reservedStock, 0\)/.test(read('assets/js/pages/factory-stock.js')),
  '6.6 Factory Inventory still defines the canonical available quantity the projection reuses');

// --- the frozen window, and Special Events staying out ------------------------------------------------------------
eq(KMFSA.forecastWindowMonths('2026-11').map(function (m) { return m.label; }), ['2026-12', '2027-01', '2027-02', '2027-03'],
  '1.8 the window is the FROZEN rolling FUTURE four months M+1..M+4');
eq(KMFSA.forecastWindowMonths('2026-12').map(function (m) { return m.label; }), ['2027-01', '2027-02', '2027-03', '2027-04'],
  '1.9 ... and rolls across the year boundary');
var threw = false; try { KMFSA.forecastWindowMonths(''); } catch (e) { threw = true; }
ok(threw, '1.10 the window anchor is INJECTED and a blank one throws — the module never reads a clock');
ok(!/new Date|Date\.now|Math\.random/.test(read('assets/js/core/supply-planning-factory-site-allocation.js')),
  '1.11 the module contains no clock and no RNG — deterministic by construction');
// A pure read: the caller's arrays are never mutated, and no allocation/reservation/movement row is produced.
var beforeFactory = JSON.stringify([{ sku: 'SP1', warehouse_id: 'WH-CN-YOUXIN', fac_current_stock: 1400, fac_reserved_stock: 0 }]);
var mutArg = JSON.parse(beforeFactory);
project(mutArg);
eq(JSON.stringify(mutArg), beforeFactory, '1.12 the input rows are not mutated — safe to run inside a read');
var FSA_SRC = read('assets/js/core/supply-planning-factory-site-allocation.js');
ok(!/setValues|appendRow|SpreadsheetApp|insertRow|\.push\(\{\s*movement/.test(FSA_SRC),
  '1.13 no write primitive of any kind appears in the projection');

// --- the policy is a named table, and TW is a SOURCE rule (not a company/warehouse/authorization rule) -----------
eq(Object.keys(KMFSA.FACTORY_SOURCE_POLICY).sort(), ['CN', 'TW'], '1.14 exactly two authorized factory sources');
eq(KMFSA.FACTORY_SOURCE_POLICY.CN.receiverCompanyKeys, null, '1.15 CN = null receiver list, i.e. the shared eligible set');
eq(KMFSA.FACTORY_SOURCE_POLICY.TW.receiverCompanyKeys, ['RESUS'], '1.16 TW = ResUS only');
eq(KMFSA.companyKey('Res US'), 'RESUS', '1.17 company identity is spelling-tolerant (ResUS / Res US / RES-US)');
eq(KMFSA.companyKey('RES-US'), 'RESUS', '1.18 ... on alphanumerics only, and it rewrites no stored value');
ok(!/warehouse_access|warehousePermission|warehouse_authorization|userAuthoriz/i.test(FSA_SRC),
  '1.19 the TW rule is NOT modelled as a warehouse-access or user-authorization mapping');
ok(/eligibleFactoryWarehouseIds[\s\S]{0,400}is_factory_warehouse/.test(read('assets/js/core/supply-planning-allocations.js')) ||
   read('assets/js/core/supply-planning-allocations.js').indexOf('eligibleFactoryWarehouseIds') !== -1,
  '1.20 eligibleFactoryWarehouseIds is untouched — the source policy did not become a company filter there');

// --- ONE projection: all three surfaces call it, and none of them renders the physical total ---------------------
ok(/factorySiteAllocation/.test(IR), '1.21 Site Inventory calls the shared projection');
ok(!/IR\.factoryByCountry\(/.test(IR), '1.22 ... and no longer renders the per-country PHYSICAL total in a scoped column');
ok(/physicalFactoryByCountry/.test(IR), '1.23 the physical helper survives, renamed so it cannot be mistaken for a site figure');
ok(/KMFSA\.project\(/.test(G56), '1.24 the LIVE Order Planning server path (56_) calls the same projection');
ok(!/factoryStock: factoryBySku\[aplUpper_\(sku\)\] \|\| 0/.test(G56), '1.25 ... and no longer emits the whole-pool sum as a site row');
ok(/factorySiteAllocation/.test(RO_SRC), '1.26 the Order Planning client builder calls it too');
ok(!/factoryStock: factoryBySku\[_roUpper\(m\.sku\)\] \|\| 0/.test(RO_SRC), '1.27 ... and no longer emits the whole-pool sum either');
ok(/supply-planning-factory-site-allocation\.js/.test(HTML), '1.28 the module is loaded by the page');
var idxFSA = HTML.indexOf('supply-planning-factory-site-allocation.js');
ok(idxFSA !== -1 && idxFSA < HTML.indexOf('pages/inventory-replenishment.js') && idxFSA < HTML.indexOf('pages/request-order.js'),
  '1.29 ... BEFORE both consuming pages');
// A missing module must never silently fall back to the physical total.
var noModule = (function () {
  var save = global.window; global.window = undefined;
  try { return null; } finally { global.window = save; }
})();
ok(/return a \? a\.total : null;/.test(RO_SRC), '1.30 an unavailable projection yields null ("--"), never the whole pool');
ok(/return a \? a\.total : null;/.test(G56), '1.31 ... on the server path as well');
ok(/function _irFactoryCellHtml_\(v, item\)[\s\S]{0,400}?\(v == null \? '--' : v\)/.test(IR),
  '1.32 Site Inventory prints "--" for an UNRESOLVED figure, not 0');
ok(/_irFactoryCellHtml_\(item\.cnStock, item\)/.test(IR) && /_irFactoryCellHtml_\(item\.twStock, item\)/.test(IR),
  '1.33 ... through ONE renderer for both factory columns — a real zero and an unknown are different statements, and the two columns cannot drift apart');
ok(/state: 'UNAVAILABLE'/.test(IR), '1.34 and the unavailable state is named rather than silently coerced');

// =============================================================================================================
// §2 — ORDER PLANNING DRAFT READBACK.
//
// The trace ended at cells only the live sheet holds, so what is provable in the repository is proved here and
// the rest is handed to the read-only diagnostic. What IS provable turned out to be a real defect: the reader
// disagreed with its own DTO and its own writer about what a blank cell means.
// =============================================================================================================
section('§2 order planning draft readback — reader, DTO and writer now agree');

var KMRDV2 = require(path.join(ROOT, 'assets/js/core/supply-planning-request-draft-v2.js'));
var KMRDV2P = require(path.join(ROOT, 'assets/js/core/supply-planning-request-draft-v2-persistence.js'));

function flatRow(over) {
  var o = {};
  KMRDV2.V2_HEADERS.forEach(function (h) { o[h] = ''; });
  o.request_allocation_draft_id = 'RD-1'; o.planning_cycle = '2026-12';
  o.company = 'ResUS'; o.country = 'US'; o.marketplace = 'Amazon'; o.sku = 'SP1';
  o.status = 'draft'; o.draft_purpose = 'regular'; o.draft_version = 1; o.units_per_carton = 12;
  o.t1_month = '2026-12'; o.t1_order_qty = 360; o.t1_recommended_qty = 400;
  o.t2_month = '2027-01'; o.t2_order_qty = 0; o.t2_recommended_qty = 250;
  o.t3_month = '2027-02'; o.t3_order_qty = 100; o.t3_recommended_qty = 100;
  for (var k in (over || {})) o[k] = over[k];
  return o;
}
function sheetSet(rows) {
  return { request_order_allocation_drafts: { headers: KMRDV2.V2_HEADERS.slice(), rows: rows.map(function (o) { return KMRDV2.V2_HEADERS.map(function (h) { return o[h]; }); }) } };
}
var SCOPE_Q = { planningCycle: '', businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', draft_purpose: 'regular' } };

// --- the coherence defect, stated as a behaviour ---------------------------------------------------------------
var okRow = KMRDV2P.readActiveFlatForScope(sheetSet([flatRow()]), SCOPE_Q);
eq(okRow.length, 1, '2.1 a fully-populated active row is read (control)');
var blankStatus = KMRDV2P.readActiveFlatForScope(sheetSet([flatRow({ status: '' })]), SCOPE_Q);
eq(blankStatus.length, 1, '2.2 a row with a BLANK status is read — the DTO has always called it "draft"');
eq(blankStatus[0].status, 'draft', '2.3 ... and it is reported as draft, exactly as the DTO defaults it');
var blankPurpose = KMRDV2P.readActiveFlatForScope(sheetSet([flatRow({ draft_purpose: '' })]), SCOPE_Q);
eq(blankPurpose.length, 1, '2.4 a row with a BLANK draft_purpose is read — the WRITER defines blank as regular');
eq(blankPurpose[0].scope.draftPurpose, 'regular', '2.5 ... and it is reported as regular');
// The filter is NOT loosened: terminal statuses are still excluded exactly as before.
eq(KMRDV2P.readActiveFlatForScope(sheetSet([flatRow({ status: 'submitted' })]), SCOPE_Q).length, 0,
  '2.6 submitted is STILL excluded from the active read — the fix removed an incoherence, not a filter');
eq(KMRDV2P.readActiveFlatForScope(sheetSet([flatRow({ status: 'cancelled' })]), SCOPE_Q).length, 0, '2.7 cancelled is still excluded');
eq(KMRDV2P.readActiveFlatForScope(sheetSet([flatRow({ draft_purpose: 'special' })]), SCOPE_Q).length, 0,
  '2.8 a DIFFERENT non-blank purpose is still excluded — only BLANK carries the writer\'s default');
// The writer's own default is what settles it.
ok(/row\.draft_purpose = str\(input\.scope\.draft_purpose\) \|\| 'regular'/.test(read('assets/js/core/supply-planning-request-draft-v2.js')),
  '2.9 the WRITER writes blank -> regular, which is why the reader must read it that way');

// --- TEST 7 · flat draft quantity hydrates by EXACT canonical identity -------------------------------------------
var ctxRO = (function loadRequestOrder() {
  var els = {};
  function mkEl(id) {
    return { id: id, dataset: {}, _cls: {}, style: {}, hidden: true, textContent: '', innerHTML: '',
      classList: { add: function (c) { els[id]._cls[c] = 1; }, remove: function (c) { delete els[id]._cls[c]; }, contains: function (c) { return !!els[id]._cls[c]; } },
      _attrs: {}, setAttribute: function (k, v) { this._attrs[k] = v; }, removeAttribute: function (k) { delete this._attrs[k]; },
      getAttribute: function (k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
      appendChild: function (c) { this._children = (this._children || []).concat([c]); },
      querySelectorAll: function () { return []; }, querySelector: function () { return null; },
      addEventListener: function () { }, focus: function () { }, closest: function () { return null; } };
  }
  ['roAiSupportTrigger', 'roAiSupportList', 'roAiSupportMenu', 'ro-ai-plan-btn', 'ro-recalc-all-btn',
    'ro-cancel-recalc-btn', 'ro-ai-plan-cancel-btn'].forEach(function (id) { els[id] = mkEl(id); });
  var created = [];
  var body = mkEl('body');
  var doc = {
    getElementById: function (id) { return els[id] || null; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () { }, body: body,
    createElement: function () { var e = mkEl('__created__'); created.push(e); return e; }
  };
  var win = { document: doc, KM: {} };
  win.window = win;
  var ctx = vm.createContext(win);
  ctx.document = doc; ctx.console = { log: function () { }, warn: function () { }, info: function () { }, error: function () { } };
  ctx.setTimeout = function () { return 0; }; ctx.clearTimeout = function () { };
  ctx.Promise = Promise; ctx.alert = function (m) { ctx.__alerts.push(m); }; ctx.confirm = function () { return ctx.__confirm; };
  ctx.__alerts = []; ctx.__confirm = true; ctx.__els = els; ctx.__created = created;
  win.alert = ctx.alert; win.confirm = ctx.confirm;
  vm.runInContext(RO_SRC, ctx, { filename: 'request-order.js' });
  // the notice element is created lazily on <body>; register it so getElementById finds it on the second call
  var realCreate = doc.createElement;
  doc.createElement = function () { var e = realCreate(); return e; };
  body.appendChild = function (c) { els[c.id] = c; created.push(c); };
  return ctx;
})();

// F1-7N-FB-4E-R4B-R2 - RESTATED FOR THE STRICTER JOIN KEY. These assertions were right about the property
// ("the persisted quantity hydrates by EXACT identity") and were keying the fixture by SKU alone, which R4B-R2
// proved is not an identity: two companies selling the same master SKU on the same country+marketplace shared a
// key, and the second one overwrote the first. The fixture now carries the SITE, which is what "exact identity"
// meant all along - so these tests get stricter here rather than weaker.
var SITE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
function setDraft(dto) {
  var norm = ctxRO._roV2NormalizeFlatDraft_(dto);
  ctxRO.__ROWS = [{ sku: norm.sku, company: SITE.company, country: SITE.country, marketplace: SITE.marketplace, boxSize: 12 }];
  vm.runInContext('requestOrderState.data = __ROWS;', ctxRO);
  var map = {};
  map[ctxRO._roDraftKey_({ sku: norm.sku, company: SITE.company, country: SITE.country, marketplace: SITE.marketplace })] = norm;
  vm.runInContext('_roCanonicalDraftBySku = __D;', Object.assign(ctxRO, { __D: map }));
  return norm;
}
var dto = KMRDV2P.readActiveFlatForScope(sheetSet([flatRow()]), SCOPE_Q)[0];
ok(ctxRO._roV2IsFlatDraft_(dto), '7.1 the flat DTO is recognised as flat by the client normalizer');
var norm = setDraft(dto);
eq(norm.sku, 'SP1', '7.2 identity comes from the DTO scope, never from a display string');
var item = { sku: 'SP1', company: 'ResUS', country: 'US', marketplace: 'Amazon', boxSize: 12 };
eq(ctxRO._roRowOrderQtyDisplay_(item, 0, 'T1', null), 360, '7.3 the persisted T1 quantity hydrates by exact identity');
eq(ctxRO._roRowOrderQtyDisplay_(item, 0, 'T3', null), 100, '7.4 ... and T3');
// A DIFFERENT SKU must not borrow this draft.
eq(ctxRO._roRowOrderQtyDisplay_({ sku: 'SP2', boxSize: 12 }, 0, 'T1', null), undefined === undefined ? ctxRO._roRowOrderQtyDisplay_({ sku: 'SP2', boxSize: 12 }, 0, 'T1', null) : null,
  '7.5 (control) a SKU with no canonical draft takes the ordinary manual path');
ok(!ctxRO._roIsCanonicalDraftSku_('SP2'), '7.6 no cross-SKU fallback: SP2 is not backed by SP1\'s draft');

// --- TEST 8 · a persisted ZERO hydrates as ZERO ------------------------------------------------------------------
eq(ctxRO._roRowOrderQtyDisplay_(item, 0, 'T2', null), 0, '8.1 a persisted 0 renders as 0, not as blank and not as the recommendation');
eq(ctxRO._roSendOrderQty_(item, 0, 'T2', null), 0, '8.2 ... and the Send quantity is the same 0');
eq(dto.tiers.filter(function (t) { return t.tier === 'T2'; })[0].orderQty, 0, '8.3 the DTO carried the zero through unchanged');
ok(/A persisted ZERO is a real decision/.test(RO_SRC), '8.4 the zero rule is stated where the ladder lives');

// --- TEST 9 · Suggested Qty cannot overwrite a persisted Order Qty -------------------------------------------------
eq(dto.tiers.filter(function (t) { return t.tier === 'T1'; })[0].recommendedQty, 400, '9.1 the recommendation for T1 is 400');
eq(ctxRO._roRowOrderQtyDisplay_(item, 0, 'T1', null), 360, '9.2 the DISPLAY shows the persisted 360, not the 400 recommendation');
eq(ctxRO._roSendOrderQty_(item, 0, 'T1', null), 360, '9.3 and Send asserts 360 — display and Send read the SAME authority');
// A tier the draft does not carry fails closed rather than borrowing an ephemeral number.
var partial = setDraft(KMRDV2P.readActiveFlatForScope(sheetSet([flatRow({ t3_month: '', t3_order_qty: '', t3_recommended_qty: '' })]), SCOPE_Q)[0]);
eq(ctxRO._roRowOrderQtyDisplay_(item, 0, 'T4', null), null, '9.4 a tier the canonical draft does not carry shows nothing, never a recomputation');
eq(ctxRO._roSendOrderQty_(item, 0, 'T4', null), null, '9.5 ... and asserts nothing');
setDraft(dto);

// --- TEST 10 · legacy / flat ambiguity FAILS CLOSED ------------------------------------------------------------------
var dupSet = sheetSet([flatRow(), flatRow({ request_allocation_draft_id: 'RD-2' })]);
var dup = KMRDV2P.readActiveFlatForScope(dupSet, { planningCycle: '', businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP1', draft_purpose: 'regular' } });
eq(dup.length, 2, '10.1 two active rows for ONE natural scope are both surfaced, never silently coalesced');
var load = KMRDV2P.loadActiveFlat(dupSet, { planningCycle: '2026-12', businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP1', draft_purpose: 'regular' } });
eq(load.status, 'BLOCKED_CONFLICT', '10.2 the persistence loader refuses to pick one — BLOCKED_CONFLICT');
// The client turns a reported conflict into a conflict row, and a conflicted SKU is not an editable draft.
vm.runInContext('_roCanonicalDraftBySku = { "SP1": { conflict: true, conflictIds: ["RD-1","RD-2"] } };', ctxRO);
ok(!ctxRO._roIsCanonicalDraftSku_('SP1'), '10.3 a conflicted SKU is not treated as an execution authority');
eq(ctxRO._roCanonicalRowFor_('SP1', 'T1'), null, '10.4 ... and no tier row resolves from it');
setDraft(dto);
// A blank status is NOT a licence to merge legacy and flat: only the two named defaults apply.
var mixed = KMRDV2P.readActiveFlatForScope(sheetSet([flatRow({ status: '', draft_purpose: '' })]), SCOPE_Q);
eq(mixed.length, 1, '10.5 a doubly-blank row resolves to exactly one active regular draft');
eq([mixed[0].status, mixed[0].scope.draftPurpose], ['draft', 'regular'], '10.6 ... with both defaults applied coherently');

// --- the two dead lists in the scope readback ------------------------------------------------------------------------
var sub = KMRDV2P.readSubmittedFlatForScope(sheetSet([flatRow({ status: 'submitted' }), flatRow({ request_allocation_draft_id: 'RD-3' })]), SCOPE_Q);
eq(sub.length, 1, '2.10 submitted rows now have their OWN query — the old list filtered a set that excluded them');
eq(sub[0].scope.sku, 'SP1', '2.11 ... and it names the SKU');
ok(!/all\.filter\(function \(d\) \{ return String\(d\.status\) === 'submitted'; \}\)/.test(G47),
  '2.12 the dead submittedSkus derivation is gone from the handler');
ok(/readSubmittedFlatForScope/.test(G47), '2.13 the handler reads submitted rows from the real source');
ok(!/noDraftSkus: \[\]/.test(G47), '2.14 noDraftSkus is no longer hardcoded empty');
ok(/recGenEnumerateEligibleGapRows_[\s\S]{0,400}noDraftSkus\.push/.test(G47),
  '2.15 ... it is derived from the SAME eligibility source the legacy path used — no second notion of eligibility');

// --- the read-only diagnostic ------------------------------------------------------------------------------------------
// The diagnostic's own header NAMES the helpers it refuses to use, in order to explain WHY it refuses them. A
// raw source scan is therefore satisfiable — and, as written the first time, breakable — by prose. Strip the
// comments and scan the CODE. (Same lesson as R4A §7.8, where a comment naming a rejected design defeated the
// very assertion that rejected it.)
var NL = String.fromCharCode(10);
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').split(NL).map(function (l) {
    var i = l.indexOf('//'); return i === -1 ? l : l.slice(0, i);
  }).join(NL);
}
var DIAG = read('assets/specs/active/apps-script/TEMP_order_planning_draft_readback_diagnose.gs');
var DIAG_CODE = stripComments(DIAG);
ok(/DB_WRITES: 0/.test(DIAG_CODE), '2.16 the diagnostic reports DB_WRITES = 0');
ok(!/setValue|appendRow|insertSheet|deleteRow|getScriptLock|PropertiesService|newTrigger/.test(DIAG_CODE),
  '2.17 ... and contains no write primitive, lock, property write or trigger');
// Stripping comments was still not enough: the diagnostic REPORTS, in its own output, which helpers it avoided
// and why — so the names survive in a string literal. The property is not "the name never appears"; it is
// "the helper is never CALLED". Assert the call site, which is what actually writes.
ok(!/procurementEnsureSheet_\s*\(|sheetEnsureColumns_\s*\(|rprBuildSheetSet_\s*\(/.test(DIAG_CODE),
  '2.18 it never CALLS the ensure-sheet helpers, which CREATE tabs and APPEND columns — those are writes');
ok(/procurementEnsureSheet_/.test(DIAG), '2.18b (control) the file does name them — in prose and in its report, which is why 2.18 asserts the call and not the name');
ok(/getSheetByName/.test(DIAG) && /getDataRange\(\)\.getValues\(\)/.test(DIAG), '2.19 it reads raw values only');
ok(!/'TEMP_ORDER_PLANNING_DRAFT_READBACK_DIAGNOSE'\s*:/.test(read('assets/specs/active/apps-script/01_router.gs')),
  '2.20 it is NOT routed publicly — no router entry, no action name');
['cutover', 'headerFingerprint', 'flatSchemaReady', 'legacyChildTable', 'totalRows', 'actionableRows',
  'byStatus', 'identitySamples', 'orderQtyValueCensus', 'duplicateNaturalKeys', 'proposedRuntimePath',
  'cutoverFlagChangeMechanicallySafe'].forEach(function (k) {
  ok(DIAG.indexOf(k) !== -1, '2.21 the diagnostic reports "' + k + '"');
});
ok(/tempRodMask_/.test(DIAG), '2.22 canonical identities are MASKED in the output');
ok(/rescuedByBlankFieldDefaults/.test(DIAG), '2.23 it counts exactly the rows the coherence fix rescues');
// F1-7N-FB-4E-R4B-R2 — THE ANSWER CAME BACK, AND IT WAS "NO". The user ran the diagnostic twice against live
// data: rescuedByBlankFieldDefaults = 0. The blank-field defaults are therefore NOT the live cause of the
// missing Order Qty. They stay, because they are independently correct — the reader disagreed with its own DTO
// and its own writer — but R4B-R1's report was wrong to present them as the leading candidate. The real cause
// (the router re-wrapping a TextOutput, so the answer was the literal body {}) is proved end to end in
// order-planning-live-hydration-join-f1-7n-fb-4e-r4b-r2.test.js.
ok(/PURPOSE COMPLETE/.test(DIAG) && /REMOVABLE FROM THE LIVE APPS SCRIPT PROJECT/.test(DIAG),
  '2.23b the diagnostic records that its purpose is complete and that it may be removed from the live project');
ok(/rescuedByBlankFieldDefaults = 0/.test(DIAG), '2.23c ... and records the live answer it returned');
// The disproved lead, pinned so it is not chased again.
ok(/var REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true;/.test(read('assets/specs/active/apps-script/00_config.gs')),
  '2.24 DISPROVED LEAD: the flat cutover flag is TRUE, so the retired child-line readback is NOT the live path');

// =============================================================================================================
// §3 — AI PLAN AND RECALCULATE.
//
// The page is loaded and the controls are CLICKED. This is the section where a source-text assertion would have
// passed against the broken code: the ids were right, the classes were set, the text was written — onto an
// element inside a panel the click had just hidden.
// =============================================================================================================
section('§3 AI Plan / Recalculate — every click produces a visible outcome');

// --- the mechanism, named ---------------------------------------------------------------------------------------
ok(/\.km-action-menu__panel\[hidden\] \{ display: none; \}/.test(CSS),
  '3.1 the dropdown panel is display:none while hidden — an element inside it paints nothing');
var panelStart = PAGEHTML.indexOf('id="roAiSupportList"');
var panelEnd = PAGEHTML.indexOf('</div>', PAGEHTML.indexOf('ro-recalc-all-btn'));
var panelHtml = PAGEHTML.slice(panelStart, panelEnd);
ok(panelHtml.indexOf('id="ro-ai-plan-btn"') !== -1, '3.2 ro-ai-plan-btn is INSIDE that panel (the feedback target)');
ok(panelHtml.indexOf('id="ro-recalc-all-btn"') !== -1, '3.3 ro-recalc-all-btn is inside it too');
ok(PAGEHTML.indexOf('id="roAiSupportTrigger"') < panelStart, '3.4 the trigger is OUTSIDE the panel — it survives the close');
ok(PAGEHTML.indexOf('id="ro-cancel-recalc-btn"') > panelEnd, '3.5 the recalc Cancel is outside it as well');
// DISPROVED en route, pinned: the AI Plan cancel button is NOT missing.
ok(/id="ro-ai-plan-cancel-btn"[\s\S]{0,200}handleCancelRequestOrderDraftJob\(\)/.test(PAGEHTML),
  '3.6 DISPROVED LEAD: ro-ai-plan-cancel-btn exists and is wired — it is in the PAGE html, not index.html');
ok(PAGEHTML.indexOf('id="ro-ai-plan-cancel-btn"') > panelEnd, '3.7 ... and it too is outside the panel');

// --- the harness ---------------------------------------------------------------------------------------------------
function freshPage(opts) {
  opts = opts || {};
  var els = {}, created = [], events = [];
  function mkEl(id) {
    var e = { id: id, dataset: {}, _cls: {}, style: {}, hidden: (id === 'roAiSupportList'), textContent: (id === 'roAiSupportTrigger' ? '✦ AI Support' : ''), innerHTML: '', _attrs: {}, _listeners: 0 };
    e.classList = { add: function (c) { e._cls[c] = 1; }, remove: function (c) { delete e._cls[c]; }, contains: function (c) { return !!e._cls[c]; } };
    e.setAttribute = function (k, v) { e._attrs[k] = v; }; e.removeAttribute = function (k) { delete e._attrs[k]; };
    e.getAttribute = function (k) { return e._attrs[k] === undefined ? null : e._attrs[k]; };
    e.appendChild = function (c) { els[c.id] = c; created.push(c); };
    e.querySelectorAll = function () { return []; }; e.querySelector = function () { return null; };
    e.addEventListener = function () { e._listeners++; }; e.focus = function () { }; e.closest = function () { return null; };
    return e;
  }
  ['roAiSupportTrigger', 'roAiSupportList', 'roAiSupportMenu', 'ro-ai-plan-btn', 'ro-recalc-all-btn',
    'ro-cancel-recalc-btn', 'ro-ai-plan-cancel-btn', 'ro-scroll-body'].forEach(function (id) { els[id] = mkEl(id); });
  var body = mkEl('body');
  var docListeners = 0;
  var doc = {
    getElementById: function (id) { return els[id] || null; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () { docListeners++; }, body: body,
    createElement: function () { return mkEl('__new__'); }
  };
  var win = { document: doc, KM: {} }; win.window = win;
  var ctx = vm.createContext(win);
  var alerts = [], confirms = [];
  ctx.document = doc; ctx.console = { log: function () { }, warn: function () { }, info: function () { }, error: function () { } };
  ctx.setTimeout = function (f) { return 0; }; ctx.clearTimeout = function () { };
  ctx.Promise = Promise;
  ctx.alert = function (m) { alerts.push(String(m)); }; win.alert = ctx.alert;
  ctx.confirm = function (m) { confirms.push(String(m)); return opts.confirm !== false; }; win.confirm = ctx.confirm;
  // The notice element is created on <body>; register it so a later getElementById finds the SAME node.
  body.appendChild = function (c) { els[c.id] = c; created.push(c); };
  var modalOpens = [], modalOpts = null;
  if (opts.scopeModal !== false) {
    win.KM.scopeModal = { open: function (o) { modalOpens.push(o); modalOpts = o; }, marketplacesForCountry: function () { return []; } };
  }
  var dispatched = [];
  if (opts.db !== false) {
    win.KM.DB = {
      startOrderPlanningGapJob: function (p) { dispatched.push({ action: 'startOrderPlanningGapJob', payload: p }); return Promise.resolve({ success: true }); },
      getGapJobStatus: function () { return Promise.resolve({ success: true, data: { status: 'DONE' } }); },
      startRequestOrderDraftJob: function (p) { dispatched.push({ action: 'startRequestOrderDraftJob', payload: p }); return Promise.resolve({ success: true, data: { runId: 'R1', total: 1 } }); },
      continueRequestOrderDraftJob: function () { return Promise.resolve({ success: true, data: { status: 'DONE' } }); },
      getActiveRequestOrderDrafts: function () { return Promise.resolve({ success: true, data: { drafts: [] } }); }
    };
  }
  vm.runInContext(RO_SRC, ctx, { filename: 'request-order.js' });
  return { ctx: ctx, els: els, created: created, alerts: alerts, confirms: confirms,
    modalOpens: modalOpens, modalOpts: function () { return modalOpts; }, dispatched: dispatched,
    docListeners: function () { return docListeners; },
    notice: function () { return els['ro-ai-support-notice'] || null; },
    visibleOutcome: function () {
      var n = els['ro-ai-support-notice'];
      var noticeShown = !!(n && n.hidden === false && String(n.innerHTML).length > 0);
      var trig = els['roAiSupportTrigger'];
      var triggerBusy = !!(trig && trig.getAttribute('aria-busy') === 'true');
      return { notice: noticeShown, trigger: triggerBusy, modal: modalOpens.length > 0, alert: alerts.length > 0,
        any: noticeShown || triggerBusy || modalOpens.length > 0 || alerts.length > 0 };
    } };
}

// --- TEST 11 · AI Plan click: exactly one dispatch, or a typed visible refusal --------------------------------------
var p11 = freshPage();
p11.ctx.runRoAiSupport('aiplan');
eq(p11.els['roAiSupportList'].hidden, true, '11.1 the click closes the menu — every in-panel element is now display:none');
ok(p11.visibleOutcome().any, '11.2 and the click STILL produces a visible outcome (the scope modal opened)');
eq(p11.modalOpens.length, 1, '11.3 exactly one scope modal, not zero and not two');
eq(p11.dispatched.length, 0, '11.4 nothing is dispatched before the scope is confirmed');
// Confirm a concrete scope -> exactly one job start.
p11.modalOpts().onConfirm({ company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-RESUS-US' });
eq(p11.dispatched.filter(function (d) { return d.action === 'startRequestOrderDraftJob'; }).length, 1,
  '11.5 confirming dispatches EXACTLY ONE AI Plan job');
ok(p11.els['roAiSupportTrigger'].getAttribute('aria-busy') === 'true' || p11.visibleOutcome().notice,
  '11.6 and the running state is shown on a surface OUTSIDE the panel');
// Repeated click while busy must not start a second job.
p11.ctx.runRoAiSupport('aiplan');
p11.modalOpts().onConfirm({ company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-RESUS-US' });
eq(p11.dispatched.filter(function (d) { return d.action === 'startRequestOrderDraftJob'; }).length, 1,
  '11.7 a repeated click while the job is running dispatches nothing further');
// Modal cancelled -> a stated outcome, not silence.
var p11b = freshPage();
p11b.ctx.runRoAiSupport('aiplan');
p11b.modalOpts().onCancel();
ok(p11b.visibleOutcome().notice, '11.8 a CANCELLED scope modal reports that nothing was run');
ok(/[Nn]othing was run/.test(p11b.notice().innerHTML), '11.9 ... in those words');
eq(p11b.dispatched.length, 0, '11.10 ... and dispatched nothing');
// Modal unavailable AND no concrete toolbar scope -> a typed visible refusal.
var p11c = freshPage({ scopeModal: false });
p11c.ctx.runRoAiSupport('aiplan');
ok(p11c.visibleOutcome().any, '11.11 with no scope selector the click still ends in a visible refusal');
eq(p11c.dispatched.length, 0, '11.12 ... and runs nothing');

// --- TEST 12 · Recalculate click: exactly one dispatch, or a typed visible refusal ------------------------------------
var p12 = freshPage();
p12.ctx.runRoAiSupport('recalcAll');
eq(p12.els['roAiSupportList'].hidden, true, '12.1 the menu is closed by the click');
eq(p12.confirms.length, 1, '12.2 one confirmation prompt');
eq(p12.dispatched.filter(function (d) { return d.action === 'startOrderPlanningGapJob'; }).length, 1,
  '12.3 exactly ONE recalculation is started');
ok(p12.els['roAiSupportTrigger'].getAttribute('aria-busy') === 'true',
  '12.4 progress is shown on the always-visible trigger — the in-panel button alone showed nobody anything');
ok(String(p12.els['roAiSupportTrigger'].textContent).indexOf('Starting') !== -1,
  '12.5 ... and it carries the actual state text');
// Declining the confirm is an outcome too.
var p12b = freshPage({ confirm: false });
p12b.ctx.runRoAiSupport('recalcAll');
eq(p12b.dispatched.length, 0, '12.6 declining the prompt dispatches nothing');
ok(p12b.visibleOutcome().notice, '12.7 ... and says so instead of leaving a closed menu and no explanation');
// Recalculate CURRENT SCOPE goes through the scope modal and reaches the same single handler.
var p12c = freshPage();
p12c.ctx.runRoAiSupport('recalcScope');
eq(p12c.modalOpens.length, 1, '12.8 Recalculate Current Scope opens the scope selector');
eq(p12c.modalOpts().confirmLabel, 'Recalculate Scope', '12.9 ... with its own confirm label, distinct from AI Plan');
p12c.modalOpts().onConfirm({ company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-RESUS-US' });
eq(p12c.dispatched.filter(function (d) { return d.action === 'startOrderPlanningGapJob'; }).length, 1,
  '12.10 exactly one recalculation, through the SAME handler (no second engine)');
eq(p12c.dispatched[0].payload.payload.scope.mode, 'CURRENT_SCOPE', '12.11 ... with the bounded scope mode');
ok(p12c.els['roAiSupportTrigger'].getAttribute('aria-busy') === 'true',
  '12.12 and THIS control has no in-panel element of its own — the trigger is its only progress surface');
// Recalculation service missing -> visible typed refusal.
var p12d = freshPage({ db: false });
p12d.ctx.runRoAiSupport('recalcAll');
ok(p12d.visibleOutcome().any, '12.13 an unavailable recalculation service refuses visibly');
eq(p12d.dispatched.length, 0, '12.14 ... and dispatches nothing');
// An unrecognised menu item used to return undefined silently.
var p12e = freshPage();
p12e.ctx.runRoAiSupport('somethingElse');
ok(p12e.visibleOutcome().notice, '12.15 an unrecognised action is refused visibly rather than swallowed');

// --- TEST 13 · remount does not duplicate handlers ---------------------------------------------------------------------
var p13 = freshPage();
var before = p13.docListeners();
p13.ctx._roBindAiSupportGlobal();
var afterFirst = p13.docListeners();
p13.ctx._roBindAiSupportGlobal();
p13.ctx._roBindAiSupportGlobal();
eq(p13.docListeners(), afterFirst, '13.1 repeated binding registers no additional document listeners');
ok(afterFirst > before, '13.2 (control) the first bind did register them');
// One click must still dispatch once after several rebinds.
p13.ctx.runRoAiSupport('recalcAll');
eq(p13.dispatched.filter(function (d) { return d.action === 'startOrderPlanningGapJob'; }).length, 1,
  '13.3 after three rebinds one click still starts exactly ONE job');
ok(/if \(_roAiSupportBound\) return;/.test(RO_SRC), '13.4 the bind is latched once, by construction');
ok(/if \(!_roAiPlanKeydownBound/.test(RO_SRC), '13.5 the AI Plan Escape listener is latched once as well');

// --- the result belongs to the scope that asked for it -------------------------------------------------------------------
ok(/_roAiPlanResultVisibleFor_\(r, scope\)/.test(RO_SRC), '3.8 a stored AI Plan result renders only for its OWN scope key');
ok(/if \(mySeq !== _roHydrateSeq\) return null;/.test(RO_SRC), '3.9 a superseded hydration response cannot repaint');
ok(/if \(my !== _opFirstLayerSeq\) return;/.test(RO_SRC), '3.10 a superseded composer read cannot repaint either');
ok(/if \(_roAiPlanBusy\) return Promise\.resolve\(null\);/.test(RO_SRC), '3.11 a duplicate AI Plan job can never start');
ok(/if \(_roRecalcAllBusy\) return;/.test(RO_SRC), '3.12 a duplicate recalculation can never start');

// =============================================================================================================
// §4 — THE R4B WORK THIS ROUND MUST NOT BREAK.
// =============================================================================================================
section('§4 preserved R4B behaviour');

ok(/_irRestorableResult_/.test(IR), '14.1 the Site Inventory completed-result restoration is still in place');
ok(/RESULT_EXPIRED/.test(IR) && /SCOPE_NOT_APPLIED/.test(IR) && /NO_COMPLETED_RESULT/.test(IR),
  '14.2 ... with its three named refusal reasons intact');
// F1-7N-FB-4G-A1-R1 — RESTATED for the spelling, not the claim: the options object gained an opt-in
// `carrier` flag, so an exact-literal match no longer finds the call. What R4B established — the revalidation
// is QUIET and therefore cannot repaint a loading state over a valid result — is what is asserted.
ok(/_irWorkspaceRefresh_\(\{[^}]*quiet:\s*true[^}]*\}\)/.test(IR),
  '14.3 revalidation is still QUIET — it never repaints a loading state');
ok((IR.match(/_irSearch\.applied = /g) || []).length === 1, '14.4 `applied` still has exactly ONE assignment site in the page');
var GEO = read('assets/js/core/geo-name-resolver.js');
// 15.1-15.3 — THE MAP DISPLAY DECISION SURVIVES. RESTATED IN R5 §B, AND THE RESTATEMENT IS THE POINT.
//
// These three used to grep the resolver's SOURCE for `HOUSE_COUNTRY_ZH` and for the two escaped literals inside
// it. R5 replaced that mechanism with the map branch's generated alias asset, so the greps had to change — but
// the interesting part is that 15.1 would have kept PASSING after the mechanism was deleted, because the
// resolver now carries a comment explaining the removal, and that comment contains the name.
//
// A guard that a comment can satisfy is not guarding anything. So all three now EXECUTE the resolver, exactly
// as index.html assembles it, and assert what an operator sees rather than what the file says about itself.
(function () {
  var vm2 = require('vm');
  var g2 = {}, sb2 = { window: g2, console: console };
  sb2.globalThis = sb2;
  var ctx2 = vm2.createContext(sb2);
  ['assets/js/data/geo-names-zh-hant.js',
   'assets/js/data/geo-display-aliases-zh-tw.js',
   'assets/js/core/geo-name-resolver.js'].forEach(function (f) {
    vm2.runInContext(read(f), ctx2, { filename: f });
  });
  var R2 = g2.KM.geoNames;
  ok(R2.country('CN').level === 'USER_APPROVED_ALIAS' && R2.country('TW').level === 'USER_APPROVED_ALIAS',
    '15.1 the map display decision survives, and names the authority that answered');
  eq(R2.country('CN').name, '中國', '15.2 CN renders as 中國');
  eq(R2.country('TW').name, '台灣', '15.3 TW renders as 台灣');
  // And the vendored formal names are still reachable, so this remained a LABEL change and not a data edit.
  eq(R2.countryFull('CN').name, '中華人民共和國', '15.5 the vendored formal name is untouched for CN');
  eq(R2.countryFull('TW').name, '中華民國', '15.5 ... and for TW');
  // §B forbids the formal name on a DISPLAY surface, so the detail view must read the decided name too.
  eq(R2.countryDetail('TW').name, '台灣（TW）', '15.6 and the detail view shows the decided name, not the formal one');
})();
ok(!/中國['"]?\s*:\s*['"]CN/.test(GEO), '15.4 nothing resolves a localized label back into a business identifier');

// R4A / R4A1 transport contracts — unchanged by this round, and this round changed a .gs file, so say it plainly.
var TP = read('assets/js/api/km-transport.js');
ok(/function readUrl\(/.test(TP) && /READ_URL_MAX/.test(TP), '16.1 canonical GET reads and the URL-size refusal are intact');
ok(/REDIRECT_TARGET_NOT_FOUND/.test(TP), '16.2 bounded redirect recovery is intact');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
// F1-7N-FC-1A-R1 — at-or-after (R4B-R1 added no action or verb; R1 adds an action).
ok(Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(G63)[1]) >= 10,
  '16.3 action contract is at or after 10 — R4B-R1 added no action or verb');
// F1-7N-FB-4G-A2-R3 - RESTATED to a floor: an equality forbids every later round from adding an action.
ok(Number(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+)/.exec(G63)[1]) >= 9, '16.4 action list is at or after 9');
eq(Number(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+)/.exec(G63)[1]), 1, '16.5 transport contract stays 1');
eq(Number(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(read('assets/js/api/operation-system-db-api.js'))[1]),
  Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(G63)[1]),
  '16.6 and the client pin still agrees — a version is not manufactured for a behaviour fix');

// The coupled release group moved TOGETHER onto one known token.
// The token is DERIVED from a coupled asset rather than listed here: a list of known literals has to be edited
// every round to stay green, which makes it a chore instead of a contract. What this actually defends is
// LOCKSTEP - every coupled asset on ONE token - and a monotonic floor on how many refs move together.
var groupTok = (/pages\/inventory-replenishment\.js\?v=([a-z0-9.-]+)/.exec(HTML) || [])[1] || '';
var COUPLED = ['pages/inventory-replenishment.js', 'pages/request-order.js', 'api/operation-system-db-api.js',
  'core/supply-planning-factory-site-allocation.js', 'utils/scope-select-modal.js'];
var offGroup = COUPLED.filter(function (f) { return HTML.indexOf(f + '?v=' + groupTok) === -1; });
ok(!!groupTok, '16.7 the frontend deployment group carries a release token (' + groupTok + ')');
eq(offGroup, [], '16.7b ... and every coupled asset carries the SAME one');
ok((HTML.match(new RegExp('\\?v=' + groupTok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 17,
  '16.8 ... on at least the 17 refs that have always moved together (floor, not a pinned count)');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
