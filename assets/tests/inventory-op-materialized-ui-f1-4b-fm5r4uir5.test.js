// Kitchen Mama Operation System — R5 header geometry + materialized Suggested surfaces + fulfillment/green (R5).
// Run: node assets/tests/inventory-op-materialized-ui-f1-4b-fm5r4uir5.test.js
// -----------------------------------------------------------------------------
// F1-4B-FM5-R4UI-R5 structure regressions (deterministic; no live DOM/network):
//   §1 the compacted header re-derives --km-sticky-header-total from the two 34px rows (kills the 96px gray band;
//      also corrects the §2 sticky `top` offset — both keyed off the same total).
//   §3 the Recommendation Summary green container + green left border are removed (title-gray / body-white).
//   §5 the Inventory top Suggested Qty reads the MATERIALIZED d90_suggested_qty (furthest cumulative checkpoint),
//      never a D18+D30+D45+D90 sum; READY → value, BLOCKED/missing → —, loading → ….
//   §6A Order Planning top Suggest Order = materialized t1+t2+t3 suggested (T4 excluded); §6B Demand Summary gains a
//      Suggested column mapping t1..t4_suggested_qty with T4 visible-but-non-writable (read-only cell).
//   §8 the platform_fulfilled / self_fulfilled badge is hidden in the normal Inventory UI (data attr preserved).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');
var RO = read('js/pages/request-order.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

section('§1 header total token re-derived from the compacted rows (no 96px gray band)');
ok(/#ops-section\s*\{[\s\S]*?--km-sticky-header-total:\s*calc\(var\(--km-sticky-row-1-height\)\s*\+\s*var\(--km-sticky-row-2-height\)/.test(CSS), 'H1 #ops-section overrides --km-sticky-header-total = row1 + row2 (68px), not the inherited 96px');
ok(/--km-sticky-row-1-height:\s*34px/.test(CSS) && /--km-sticky-row-2-height:\s*34px/.test(CSS), 'H2 the two header rows are 34px each (total now 68px, matching the rowspan cells)');

section('§2 active-row pin removed (FM5-R4UI-R7 §2: master row + detail scroll as one natural unit — no float)');
ok(!/\.ir-sticky-overlay\s*\{[\s\S]*?position:\s*fixed/.test(CSS) && !/is-active-sticky[\s\S]*?position:\s*sticky/.test(CSS), 'S1 NO pin — the real row is never position:sticky AND there is no fixed overlay (any pin floats over / occluded the second-level detail)');

section('§3 Recommendation Summary — green container + green left border removed');
ok(/\.replen-recsum-ws\s*\{[^}]*border-left:\s*0/.test(CSS), 'G1 base .replen-recsum-ws left border removed');
ok(/\.replen-recsum-ws--ready\s*\{[^}]*background:\s*#fff/.test(CSS) && /\.replen-recsum-ws--ready\s*\{[^}]*border-left-color:\s*transparent/.test(CSS), 'G2 the ready state is white (no green background, no green left border)');

section('§5 Inventory top Suggested Qty = materialized d90_suggested_qty (not a cumulative sum)');
var sc = JS.slice(JS.indexOf('function _irSuggestedCellHtml'), JS.indexOf('function _irSuggestedCellHtml') + 1600);
ok(/_irUseMaterializedGapRead\(\)/.test(sc) && /_irMatState\.bySku\[String\(item\.sku\)\]/.test(sc), 'F1 the top cell reads the materialized gap state (not the live workspace)');
ok(/d90_suggested_qty/.test(sc) && !/d18_suggested_qty\s*\+/.test(sc), 'F2 uses the D90 (furthest cumulative checkpoint) stored suggested — never a D18+D30+D45+D90 sum');
ok(/'READY'/.test(sc) && /--pending[^>]*>…|>…</.test(sc) && />—</.test(sc), 'F3 READY→value, loading→…, BLOCKED/missing→— (truthful states, no fake 0)');

section('§6A Order Planning top Suggest Order = materialized t1+t2+t3 (T4 excluded)');
ok(/function _opMatSuggestedTotal_/.test(RO), 'O1 _opMatSuggestedTotal_ helper exists');
var ot = RO.slice(RO.indexOf('function _opMatSuggestedTotal_'), RO.indexOf('function _opMatSuggestedTotal_') + 600);
ok(/t1_suggested_qty[\s\S]*t2_suggested_qty[\s\S]*t3_suggested_qty/.test(ot) && !/t4_suggested_qty/.test(ot), 'O2 sums t1+t2+t3 suggested ONLY (T4 is visibility-only, excluded from the actionable total)');
ok(/calculation_status.*!==.*'READY'/.test(ot) && /return null/.test(ot), 'O3 non-READY → null (caller keeps its placeholder; never a fabricated total)');
ok(/_opMatSuggestedTotal_\(item\.sku\)/.test(RO), 'O4 the top Suggest Order cell prefers the materialized total when it exists');

section('§6B Demand Summary gains a Suggested column (T1–T4 visible; T4 non-writable read-only cell)');
ok(/<th>Tier · Month<\/th><th>Demand<\/th><th>Gap<\/th><th>Suggested<\/th>/.test(RO), 'B1 Demand Summary header adds a Suggested column');
ok(/data-ro-suggested-tier="'\s*\+\s*t/.test(RO) && /ct\.suggestedOrderQty/.test(RO), 'B2 per-tier Suggested cell maps the canonical tier suggestedOrderQty (t{1..4}_suggested_qty)');
ok(/'T1', 'T2', 'T3', 'T4'/.test(RO), 'B3 all four tiers rendered (T4 visible)');
// T4 non-writable: the Suggested column is a read-only <td> (no <input>); the writable Manual Order Qty owner is separate.
ok(/data-ro-suggested-tier[\s\S]{0,80}<\/td>/.test(RO) && !/data-ro-suggested-tier="[^"]*"[^>]*><input/.test(RO), 'B4 Suggested cells are read-only <td> (T4 stays non-writable — no input in the demand-summary suggested column)');

section('§8 fulfillment badge hidden in the normal Inventory UI (data preserved)');
ok(/#ops-section \.ir-ff-badge\s*\{[^}]*display:\s*none/.test(CSS), 'FF1 .ir-ff-badge is display:none in the normal UI');
ok(/data-fulfillment="\$\{skuData\?\.fulfillmentModel/.test(JS) || /data-fulfillment=/.test(JS), 'FF2 the data-fulfillment attribute + ir-fulfillment--* class remain (internal authority + card ordering untouched)');

console.log('\n----------------------------------------');
console.log('R5 MATERIALIZED UI + GEOMETRY (F1-4B-FM5-R4UI-R5): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
