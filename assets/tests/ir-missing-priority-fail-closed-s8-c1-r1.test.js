// S8-C1-R1 — Inventory Replenishment: group-level fail-closed on an unresolved allocation_priority.
//
// §45.B.1 recorded the IR page as the last place in the browser where a MISSING priority silently became a
// real one: `(reg && reg.allocationPriority) || 0`. Under §24.7 the value is a WEIGHT
// (`MAX(priority, 1) x minNeed`) and a largest-remainder TIE-BREAK, so the fabricated 0 took a share of the
// pool and shrank every sibling's share, and the result was reported as a complete SHORTAGE_ALLOCATION.
//
// D-S8-C1-1 Option B: fail closed at the INDEPENDENT ALLOCATION GROUP — company + country + Master SKU,
// which is the same boundary as the pool. One unresolved receiver blocks its own group and nothing else.
// D-S8-C1-2: the priority lookup resolves country through KMCID, so a `UK` scope finds a `GB` row.
//
// The page is loaded as real source into a DOM-less window shim; IRMap is the shipped module, not a copy.
// Run: node assets/tests/ir-missing-priority-fail-closed-s8-c1-r1.test.js

'use strict';
var fs = require('fs'), path = require('path');
var pass = 0, fail = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }

var IR_SRC = read('assets/js/pages/inventory-replenishment.js');
var APP_SRC = read('assets/js/app.js');
var INDEX_SRC = read('index.html');
var CSS_SRC = read('assets/css/pages/inventory-replenishment.css');
var KMCID = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-country-identity.js'));

// ---------------------------------------------------------------------------
// Load the SHIPPED page module. It is a browser file that assigns window.IRMap; only the IRMap IIFE is
// needed here, so it is extracted by its own assignment rather than by executing 14k lines of page code.
// ---------------------------------------------------------------------------
var startAt = IR_SRC.indexOf('window.IRMap = (function () {');
if (startAt < 0) throw new Error('window.IRMap assignment not found — the page shape changed');
var endMark = '\n})();';
var endAt = IR_SRC.indexOf(endMark, startAt);
if (endAt < 0) throw new Error('IRMap IIFE terminator not found');
var IRMAP_SRC = IR_SRC.slice(startAt, endAt + endMark.length);

var windowShim = { KMCID: KMCID, KM: { countryIdentity: KMCID } };
(new Function('window', IRMAP_SRC + '\nreturn window.IRMap;'))(windowShim);
var IR = windowShim.IRMap;
ok(IR && typeof IR.sitePlanningAllocation === 'function',
  'L1 the SHIPPED IRMap module loaded and exposes sitePlanningAllocation');

// ---------------------------------------------------------------------------
// Fixture builder. Demand is driven through weeklyRows so `avgSalesPerDay` (the §22 canonical owner) is the
// real one: minNeed = CEILING(daily x 18) is never hand-written here.
// ---------------------------------------------------------------------------
var WH = 'WH-3PL-1';
function weeklyFor(sites) {
  // The SHIPPED avgSalesPerDay reads `salesUnits7d` keyed by `weekEndDate`, and divides by 7. Feeding it
  // daily*7 makes the per-day figure exact, so minNeed = CEILING(daily x 18) is produced by the real §22
  // owner rather than written here.
  var rows = [];
  sites.forEach(function (s) {
    if (!s.daily) return;
    rows.push({ company: s.company, country: s.country, marketplace: s.marketplace, sku: s.sku || 'SKU-A',
      weekEndDate: '2026-10-04', salesUnits7d: s.daily * 7 });
  });
  return rows;
}
function ctxFor(opts) {
  var sites = opts.sites;
  var scope = opts.scope || { company: sites[0].company, country: sites[0].country,
    marketplace: sites[0].marketplace, sku: sites[0].sku || 'SKU-A' };
  var warehouses = (opts.warehouses !== undefined) ? opts.warehouses : [
    { warehouseId: WH, warehouseName: '3PL One', company: scope.company, country: scope.country,
      warehouseType: '3PL', isActive: true }
  ];
  var overseasRows = (opts.pool === null) ? [] : [
    { warehouseId: WH, sku: scope.sku, availableStock: opts.pool, snapshotDate: '2026-10-09' }
  ];
  return {
    scope: scope,
    overseasRows: overseasRows,
    warehouses: warehouses,
    mpSkus: sites.map(function (s) {
      return { company: s.company, country: s.country, marketplace: s.marketplace, sku: s.sku || 'SKU-A',
        marketplaceId: s.marketplaceId, replenishmentModel: 'sales_driven' };
    }),
    marketplacesReg: sites.filter(function (s) { return !s.noReg; }).map(function (s) {
      return { company: s.company, country: s.regCountry || s.country, marketplace: s.marketplace,
        marketplaceId: s.marketplaceId, allocationPriority: s.priority };
    }),
    weeklyRows: weeklyFor(sites), fcRows: [], targetRules: []
  };
}
function run(opts) { return IR.sitePlanningAllocation(ctxFor(opts)); }

// Two sites, 7/day each => minNeed 126 each, sumNeed 252. A pool below 252 forces SHORTAGE.
function twoSites(p1, p2, over) {
  var a = { company: 'KM', country: 'US', marketplace: 'amazon', daily: 7, priority: p1 };
  var b = { company: 'KM', country: 'US', marketplace: 'walmart', daily: 7, priority: p2 };
  if (over) Object.keys(over).forEach(function (k) { if (k === 'a') Object.assign(a, over.a); if (k === 'b') Object.assign(b, over.b); });
  return [a, b];
}

// ===========================================================================
section('A — priority validation (required cases 1–5)');
// ===========================================================================
eq(run({ sites: twoSites(0, 5), pool: 100 }).state, 'OK',
  'A1 case 1 — an explicit numeric 0 is VALID: it is the lowest priority, not a missing one (§45.A.1)');
eq(run({ sites: twoSites(3, 5), pool: 100 }).state, 'OK',
  'A2 case 2 — a positive priority is valid');
[['null', null], ['undefined', undefined], ['blank', ''], ['whitespace', '   ']].forEach(function (c, i) {
  eq(run({ sites: twoSites(c[1], 5), pool: 100 }).state, 'PRIORITY_UNRESOLVED',
    'A3.' + (i + 1) + ' case 3 — ' + c[0] + ' is UNRESOLVED, never coerced to 0');
});
[['negative', -1], ['non-numeric text', 'high'], ['non-finite', Infinity], ['NaN', NaN],
 ['boolean', true], ['object', {}]].forEach(function (c, i) {
  eq(run({ sites: twoSites(c[1], 5), pool: 100 }).state, 'PRIORITY_UNRESOLVED',
    'A4.' + (i + 1) + ' case 4 — ' + c[0] + ' is UNRESOLVED');
});
eq(run({ sites: twoSites(0, 5, { a: { noReg: true } }), pool: 100 }).state, 'PRIORITY_UNRESOLVED',
  'A5 case 5 — a marketplace LOOKUP MISS is unresolved: no registration is not a priority of 0');
eq(run({ sites: twoSites('4', 5), pool: 100 }).state, 'OK',
  'A6 a NUMERIC STRING resolves — the transport delivers sheet cells as text, and "4" is a set priority');
eq(run({ sites: twoSites('0', 5), pool: 100 }).state, 'OK',
  'A7 and the string "0" resolves as the valid lowest priority — the blank guard runs before Number()');

// ===========================================================================
section('B — canonical country identity (required cases 6, 7, 10)');
// ===========================================================================
(function () {
  // The marketplace_skus row says UK; the marketplaces registration says GB. Raw matching made this a
  // lookup miss, which the old `|| 0` then turned into a real priority of 0.
  var sites = [
    { company: 'KM', country: 'UK', marketplace: 'amazon', daily: 7, priority: 3, regCountry: 'GB' },
    { company: 'KM', country: 'UK', marketplace: 'walmart', daily: 7, priority: 5, regCountry: 'GB' }
  ];
  var r = run({ sites: sites, pool: 100,
    warehouses: [{ warehouseId: WH, warehouseName: '3PL UK', company: 'KM', country: 'UK', warehouseType: '3PL', isActive: true }] });
  eq(r.state, 'OK', 'B1 case 6 — a UK scope resolves a GB-spelled registration: UK and GB are one identity');
  eq(KMCID.canonicalCountryCode('uk'), 'GB', 'B2 and the canonical code comes from KMCID, not a local table');
})();
(function () {
  var sites = [
    { company: 'KM', country: 'EU', marketplace: 'amazon', daily: 7, priority: 3, regCountry: 'DE' },
    { company: 'KM', country: 'EU', marketplace: 'walmart', daily: 7, priority: 5, regCountry: 'DE' }
  ];
  var r = run({ sites: sites, pool: 100,
    warehouses: [{ warehouseId: WH, warehouseName: '3PL EU', company: 'KM', country: 'EU', warehouseType: '3PL', isActive: true }] });
  eq(r.state, 'PRIORITY_UNRESOLVED',
    'B3 case 7 — EU stays DISTINCT: a DE registration does NOT satisfy an EU receiver, so it fails closed');
  eq(KMCID.canonicalCountryCode('EU'), 'EU', 'B4 EU is its own identity in KMCID — never expanded to members');
})();
(function () {
  var sites = [
    { company: 'KM', country: 'US', marketplace: 'amazon', daily: 7, priority: 3, regCountry: 'CA' },
    { company: 'KM', country: 'US', marketplace: 'walmart', daily: 7, priority: 5 }
  ];
  eq(run({ sites: sites, pool: 100 }).state, 'PRIORITY_UNRESOLVED',
    'B5 case 10 — country isolation: a CA registration does not answer for a US receiver');
})();
ok(/_irCountryIdentityEq\(m\.country, scope\.country\)/.test(IR_SRC),
  'B6 the lookup compares country through the canonical helper');
ok(/eq\(m\.marketplace, scope\.marketplace\) && \(!scope\.company \|\| eq\(m\.company, scope\.company\)\)/.test(IR_SRC),
  'B7 and company + marketplace keep their EXISTING comparison — country only, as the decision says');
['US', 'DE', 'CA', 'JP', 'AU'].forEach(function (c) {
  eq(KMCID.canonicalCountryCode(c), c, 'B8.' + c + ' no alias is invented for ' + c);
});
// The page's own frozen alias owner and the runtime owner must agree, or the page would hold two tables.
var IRCOMPAT = read('assets/js/utils/inventory-compat.js');
ok(/SAME_MARKET_ALIAS\s*=\s*\{\s*UK:\s*\['UK',\s*'GB'\],\s*GB:\s*\['UK',\s*'GB'\]\s*\}/.test(IRCOMPAT.replace(/\s+/g, ' '))
  || /UK[^\n]*GB/.test(IRCOMPAT),
  'B9 IRCountry still carries the UK/GB same-market alias KMCID declares it mirrors');
eq([KMCID.SAME_MARKET_ALIAS.UK, KMCID.SAME_MARKET_ALIAS.GB], [['UK', 'GB'], ['UK', 'GB']],
  'B10 and KMCID exposes exactly that pair — one table, mirrored, not two tables maintained apart');

// ===========================================================================
section('C — the mode contract gate (required cases 18, 19, 20)');
// ===========================================================================
// Only SHORTAGE reads a priority in this implementation. §24.5 step 3 (distributing the surplus above the
// 18-day floor, where §24.8 does give priority a role) has never been implemented here — the surplus stays
// unallocated — so NORMAL consults no priority, and §45.A.5 class D forbids blocking a calculation that
// does not read one.
eq(run({ sites: twoSites(null, null), pool: 1000 }).state, 'OK',
  'C1 case 19 — NORMAL (pool 1000 >= sumNeed 252) is NOT blocked by unresolved priorities: it never reads them');
eq(run({ sites: twoSites(null, null), pool: 1000 }).allocationMode, 'NORMAL_ALLOCATION',
  'C2 and it really is the NORMAL branch that ran');
eq(run({ sites: [{ company: 'KM', country: 'US', marketplace: 'amazon', daily: 0, priority: null }], pool: 100 }).allocationMode,
  'NO_DEMAND', 'C3 case 18 — NO_DEMAND (sumNeed 0) is likewise not blocked; priority is unused there');
eq(run({ sites: twoSites(null, 5), pool: 100 }).state, 'PRIORITY_UNRESOLVED',
  'C4 case 20 — SHORTAGE (pool 100 < sumNeed 252) IS blocked: this is the one mode that weighs the priority');
eq(run({ sites: twoSites(2, 5), pool: 100 }).allocationMode, 'SHORTAGE_ALLOCATION',
  'C5 and with every priority resolved the same fixture allocates normally — the gate is the priority, not the mode');
// The predicate is a restatement of the allocator's own two early returns. Pinned at the boundaries so the
// two cannot drift: equality must be NORMAL (not shortage), one unit less must be SHORTAGE.
eq(run({ sites: twoSites(2, 5), pool: 252 }).allocationMode, 'NORMAL_ALLOCATION',
  'C6 boundary — pool === sumNeed is NORMAL');
eq(run({ sites: twoSites(null, 5), pool: 252 }).state, 'OK',
  'C7 and at that exact boundary an unresolved priority does NOT block, because NORMAL never reads it');
eq(run({ sites: twoSites(2, 5), pool: 251 }).allocationMode, 'SHORTAGE_ALLOCATION',
  'C8 boundary — one unit below sumNeed is SHORTAGE');
eq(run({ sites: twoSites(null, 5), pool: 251 }).state, 'PRIORITY_UNRESOLVED',
  'C9 and there it DOES block — the predicate agrees with the allocator on both sides of the boundary');

// ===========================================================================
section('D — the fail-closed result shape (required cases 11, 12, 13, 14)');
// ===========================================================================
(function () {
  var r = run({ sites: twoSites(null, 5), pool: 100 });
  eq(r.state, 'PRIORITY_UNRESOLVED', 'D1 state is PRIORITY_UNRESOLVED');
  eq(r.sitePlanningAvailable, null, 'D2 case 14 — sitePlanningAvailable is null, NEVER 0');
  eq(r.allocatedToCurrent, null, 'D3 allocatedToCurrent is null');
  eq([r.allocatedToOthers, r.unallocatedPool, r.coverageRate, r.allocationMode], [null, null, null, null],
    'D4 case 13 — every allocation-derived figure is null: no partial result is dressed up as complete');
  ok(!Object.prototype.hasOwnProperty.call(r, 'byKey'), 'D5 no byKey allocation result is emitted');
  eq(r.unresolvedReceivers, [{ company: 'KM', country: 'US', marketplace: 'amazon' }],
    'D6 case 11 — the unresolved receiver is NAMED, not silently excluded');
  eq(r.priorityRequired, true, 'D7 and the result records that this mode required a priority');
})();
(function () {
  // Case 12 — NO REDISTRIBUTION. If the unresolved receiver had merely been dropped, the survivor would
  // have taken the whole pool. Blocking and dropping are different answers, and this proves which one ran.
  var blocked = run({ sites: twoSites(null, 5), pool: 100 });
  var dropped = run({ sites: [{ company: 'KM', country: 'US', marketplace: 'walmart', daily: 7, priority: 5 }], pool: 100 });
  eq(blocked.sitePlanningAvailable, null, 'D8 the blocked group yields no number for the current site');
  ok(dropped.sitePlanningAvailable !== null && dropped.sitePlanningAvailable > 0,
    'D9 whereas dropping the receiver WOULD have produced one (' + dropped.sitePlanningAvailable + ')');
  ok(blocked.sitePlanningAvailable !== dropped.sitePlanningAvailable,
    'D10 case 12 — so the unresolved receiver\'s share was not handed to its competitor');
})();
ok(/if \(state === 'OK' && priorityRequired && unresolvedReceivers\.length\)/.test(IR_SRC),
  'D11 the guard runs BEFORE the allocator call in the source');
ok(IR_SRC.indexOf("state: 'PRIORITY_UNRESOLVED'") < IR_SRC.indexOf('var alloc = _allocateShared(pool.poolQty, sites);'),
  'D12 and the blocked return precedes it textually — _allocateShared is never called for a blocked group');

// ===========================================================================
section('E — isolation: one group blocked, the others untouched (cases 8, 9, 10)');
// ===========================================================================
(function () {
  // Case 8 — COMPANY isolation. ResUS's own group has every priority set and must allocate normally even
  // though a KM group in the same country and SKU is blocked.
  var km = run({ sites: twoSites(null, 5), pool: 100 });
  var resus = run({ sites: [
    { company: 'ResUS', country: 'US', marketplace: 'amazon', daily: 7, priority: 2 },
    { company: 'ResUS', country: 'US', marketplace: 'walmart', daily: 7, priority: 5 }
  ], pool: 100, warehouses: [{ warehouseId: WH, warehouseName: '3PL US', company: 'ResUS', country: 'US', warehouseType: '3PL', isActive: true }] });
  eq([km.state, resus.state], ['PRIORITY_UNRESOLVED', 'OK'],
    'E1 case 8 — KM is blocked and ResUS is not: company is part of the group boundary');
  ok(resus.sitePlanningAvailable !== null, 'E2 and ResUS still gets a real allocation number');
})();
(function () {
  // Case 9 — MASTER SKU isolation, same company and country.
  var bad = run({ sites: twoSites(null, 5), pool: 100 });
  var good = run({ sites: [
    { company: 'KM', country: 'US', marketplace: 'amazon', sku: 'SKU-B', daily: 7, priority: 1 },
    { company: 'KM', country: 'US', marketplace: 'walmart', sku: 'SKU-B', daily: 7, priority: 4 }
  ], pool: 100 });
  eq([bad.state, good.state], ['PRIORITY_UNRESOLVED', 'OK'],
    'E3 case 9 — SKU-A is blocked while SKU-B allocates: Master SKU is part of the group boundary');
})();
(function () {
  var bad = run({ sites: twoSites(null, 5), pool: 100 });
  var ca = run({ sites: [
    { company: 'KM', country: 'CA', marketplace: 'amazon', daily: 7, priority: 1 },
    { company: 'KM', country: 'CA', marketplace: 'walmart', daily: 7, priority: 4 }
  ], pool: 100, warehouses: [{ warehouseId: WH, warehouseName: '3PL CA', company: 'KM', country: 'CA', warehouseType: '3PL', isActive: true }] });
  eq([bad.state, ca.state], ['PRIORITY_UNRESOLVED', 'OK'],
    'E4 case 10 — US is blocked while CA allocates: country is part of the group boundary');
})();

// ===========================================================================
section('F — preserved facts (required cases 15, 16)');
// ===========================================================================
(function () {
  var blocked = run({ sites: twoSites(null, 5), pool: 100 });
  var allowed = run({ sites: twoSites(2, 5), pool: 100 });
  eq(blocked.physicalPool, 100, 'F1 case 15 — the physical pool is preserved on a blocked group');
  eq(blocked.contributions, allowed.contributions,
    'F2 and the 3PL contributions are byte-identical to the unblocked run — withheld allocation, not withheld stock');
  eq(blocked.eligibleCount, allowed.eligibleCount, 'F3 eligible warehouse count preserved');
  eq(blocked.snapshotAt, allowed.snapshotAt, 'F4 snapshot timestamp preserved');
  eq([blocked.minNeed, blocked.siteCount], [allowed.minNeed, allowed.siteCount],
    'F5 case 16 — the non-priority figures (18-day need, site count) are preserved');
  eq(blocked.participates, allowed.participates, 'F6 and pool participation is unchanged');
})();
(function () {
  // The pool-availability states are a more basic diagnosis and keep precedence, exactly as before.
  var noWh = run({ sites: twoSites(null, 5), pool: 100, warehouses: [] });
  eq(noWh.state, 'NO_ELIGIBLE_3PL', 'F7 NO_ELIGIBLE_3PL still wins over the priority state (unchanged precedence)');
  var noSnap = run({ sites: twoSites(null, 5), pool: null });
  eq(noSnap.state, 'MISSING_SNAPSHOT', 'F8 and so does MISSING_SNAPSHOT');
})();

// ===========================================================================
section('G — valid-priority numerical parity (required case 17)');
// ===========================================================================
// The single most important guard in this suite: for inputs that were ALREADY valid, every number must be
// what it was before the change. The expected values are LITERALS, computed by hand from §24.7, never read
// back from the runtime that is under test.
//
//   two sites, minNeed 126 each, priorities 2 and 5, pool 100
//   w     = 126x2 = 252 ; 126x5 = 630 ; sumW = 882
//   raw   = 100x252/882 = 28.571… ; 100x630/882 = 71.428…
//   floor = 28 ; 71  => assigned 99, remainder 1
//   largest remainder: .571 > .428 => amazon takes it => 29 / 71
(function () {
  var r = run({ sites: twoSites(2, 5), pool: 100 });
  eq(r.allocationMode, 'SHORTAGE_ALLOCATION', 'G1 the parity fixture really is the SHORTAGE branch');
  eq([r.allocatedToCurrent, r.allocatedToOthers], [29, 71],
    'G2 case 17 — 29 / 71, the exact §24.7 weighted largest-remainder split, unchanged by this round');
  eq(r.allocatedToCurrent + r.allocatedToOthers, 100, 'G3 and Σ allocations === pool (conservation holds)');
  eq(r.coverageRate, 100 / 252, 'G4 coverage_rate = pool ÷ Σ18-day-need, unchanged');
})();
(function () {
  // An explicit 0 still earns its §24.7 share through MAX(priority,1) — the clamp was NOT touched.
  //   w = 126x1 = 126 ; 126x5 = 630 ; sumW = 756
  //   raw = 100x126/756 = 16.666… ; 100x630/756 = 83.333…  => floor 16 / 83, remainder 1
  //   .666 > .333 => amazon takes it => 17 / 83
  var r = run({ sites: twoSites(0, 5), pool: 100 });
  eq([r.allocatedToCurrent, r.allocatedToOthers], [17, 83],
    'G5 a priority of 0 is weighted as MAX(0,1)=1 and still receives 17 units — §45.A.1, never excluded');
})();
ok(/Math\.max\(s\.minNeed, 0\) \* Math\.max\(s\.allocationPriority, 1\)/.test(IR_SRC),
  'G6 the §24.7 weighting line is untouched');
ok(/if \(b\.s\.allocationPriority !== a\.s\.allocationPriority\) return b\.s\.allocationPriority - a\.s\.allocationPriority;/.test(IR_SRC),
  'G7 and so is the largest-remainder tie-break');

// ===========================================================================
section('H — UI diagnostic, Save/Submit safety and route consistency (cases 21–24)');
// ===========================================================================
ok(/replen-tp-unresolved/.test(IR_SRC) && /Priority unresolved — planning allocation withheld/.test(IR_SRC),
  'H1 the expand card renders an explicit diagnostic state');
ok(/Administration → Site Priority/.test(IR_SRC),
  'H2 naming the one place the operator can fix it');
ok(/onclick="showSection\(\\'site-priority\\'\); return false;"/.test(IR_SRC)
  || /showSection\('site-priority'\)/.test(IR_SRC),
  'H3 case 23 — navigation uses the shell\'s EXISTING showSection, so no listener is attached and repeated '
  + 'navigation cannot duplicate one');
ok(/#ops-section \.replen-tp-unresolved \{/.test(CSS_SRC),
  'H4 and the state has real styling — not a class with no rules');
ok(/return html \+ diag;/.test(IR_SRC),
  'H5 the diagnostic is APPENDED to the physical rows, never substituted for them (case 15 in the UI)');
// Case 21/22 — the Save/Submit payload is untouched and no writer was added.
ok(!/sitePlanningAvailable/.test(IR_SRC.slice(IR_SRC.indexOf('source_page: \'inventory_replenishment\'') - 3000,
   IR_SRC.indexOf('source_page: \'inventory_replenishment\'') + 1500)),
  'H6 case 21 — no allocation-derived value appears anywhere in the submit payload block');
ok(/snapshot_suggested_qty: sd\.suggestedQty != null \? sd\.suggestedQty : ''/.test(IR_SRC),
  'H7 the persisted suggested-qty snapshot is still the need calculation, unchanged');
ok(!/PRIORITY_UNRESOLVED/.test(read('assets/js/core/supply-planning-allocations.js')),
  'H8 case 22 — the frozen §40 allocator gained nothing: this round is frontend-only');
// Case 24 — route asset + token consistency.
// S8-B3-R3-CP2I - H9 AND H12 WERE PINNED TO A LITERAL TOKEN, WHICH MADE THEM CLAIMS ABOUT EVERY FUTURE
// ROUND RATHER THAN ABOUT THIS ONE. H9's subject is LOAD ORDER - KMCID must be declared before the page
// that depends on it - and H12's is that the shipped hosts carry the REGISTERED current token rather than
// one somebody typed. Neither subject mentions a particular token, and both would fail the first time a
// later round legitimately rotated. R52 is that round. The token is now DERIVED from the series that owns
// it, exactly as _release-order.js's own currentAppToken() comment prescribes and as s7-r4's H2b was
// repaired to do. H10/H11 are untouched: a named STALE token must still be absent, which is a different
// claim and still a true one.
var RO = require(path.join(__dirname, '_release-order.js'));
var CUR_TOKEN = RO.ROUND_TOKENS[RO.ROUND_TOKENS.length - 1];
ok(new RegExp("'assets/js/core/supply-planning-country-identity\\.js\\?v=" + CUR_TOKEN
    + "',\\s*\\n\\s*'assets/js/pages/inventory-replenishment\\.js\\?v=" + CUR_TOKEN + "'").test(APP_SRC),
  'H9 case 24 — KMCID is declared on the ops route BEFORE the page that depends on it');
eq(APP_SRC.indexOf('r50-sitepriority-20261010'), -1, 'H10 app.js carries no stale token');
eq(INDEX_SRC.indexOf('r50-sitepriority-20261010'), -1, 'H11 index.html carries no stale token');
ok(!!CUR_TOKEN && APP_SRC.indexOf(CUR_TOKEN) !== -1 && INDEX_SRC.indexOf(CUR_TOKEN) !== -1,
  'H12 and BOTH hosts serve the registered current round token (' + CUR_TOKEN + ')');
eq(RO.ROUND_TOKENS.filter(function (t) { return t === CUR_TOKEN; }).length, 1,
  'H12a which appears exactly once in the series - a token is minted, never re-used');

console.log('\n' + (fail ? 'FAIL ' : 'PASS ') + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
