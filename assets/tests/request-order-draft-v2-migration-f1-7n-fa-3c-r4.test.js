// Kitchen Mama Operation System — MONTHLY flat V2 R4 MIGRATION planner + staging validator — F1-7N-FA-3C-DRAFT-MODEL-R4.
// Run: node assets/tests/request-order-draft-v2-migration-f1-7n-fa-3c-r4.test.js
// Proves the one-time migration tooling (KMRDV2P.planMigration / validateStaging, orchestrating the frozen KMRDV2
// authority) against a 124-shape fixture matching the accepted R3 live data. Pure / no Sheets / no live DB / no mutation.

'use strict';
var P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var K = require('../js/core/supply-planning-request-draft-v2.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var EXPECT = { TOTAL_HEADERS: 124, ACTIONABLE: 26, ALL_ZERO: 98, NEEDS_MANUAL_REVIEW: 0, BLOCKED_CONFLICT: 0, ORPHAN_LINES: 0, DUPLICATE_T1: 0, DUPLICATE_T2: 0, DUPLICATE_T3: 0, T4_PRESENT: 0, SUBMITTED: 20 };

function mkH(id, status, cyc, sku) { return { request_allocation_draft_id: id, planning_cycle: cyc, company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: sku, draft_purpose: 'regular', status: status, generation_type: 'ai_plan', draft_version: 1, calculation_run_id: 'RUN-' + id, formula_version: 'ORDER_PLANNING_GAP', created_by: 'sys', created_at: 'C', updated_by: 'sys', updated_at: 'U' }; }
function mkL(id, b, m, rec, ord, st) { return { request_allocation_draft_id: id, request_bucket: b, request_month: m, recommended_qty: rec, order_qty: ord, carton_qty: '', units_per_carton: '10', line_status: st, submitted_by: st === 'submitted' ? 'u' : '', submitted_at: st === 'submitted' ? 't' : '', user_edited: 'FALSE' }; }
// Build the canonical 124-shape live fixture: 98 all-zero zero-line ACTIVE (10 RAD + 88 RD), 6 active-with-lines RD,
// 20 submitted-with-lines (15 RAD + 5 RD). => RD=99, RAD=25, actionable=26, all-zero=98, submitted=20.
function fixture() {
  var headers = [], lbd = {}, i;
  for (i = 0; i < 98; i++) { var zid = (i < 10 ? 'RAD-z' + i : 'RD::MONTHLY_ORDER::2026-09::z' + i); headers.push(mkH(zid, 'draft', '2026-09', 'Z' + i)); }
  for (i = 0; i < 6; i++) { var aid = 'RD::MONTHLY_ORDER::2026-09::a' + i; headers.push(mkH(aid, 'draft', '2026-09', 'A' + i)); lbd[aid] = [mkL(aid, 'T1', '2026-09', 100, 100, 'active'), mkL(aid, 'T2', '2026-10', 50, 50, 'active'), mkL(aid, 'T3', '2026-11', 0, 0, 'draft')]; }
  for (i = 0; i < 20; i++) { var sid = (i < 15 ? 'RAD-s' + i : 'RD::MONTHLY_ORDER::2026-08::s' + i); headers.push(mkH(sid, 'submitted', '2026-08', 'S' + i)); lbd[sid] = [mkL(sid, 'T1', '2026-08', 200, 200, 'submitted'), mkL(sid, 'T2', '2026-09', 100, 100, 'submitted')]; }
  return { headers: headers, lbd: lbd };
}

// ==========================================================================
var f = fixture();
var plan = P.planMigration(f.headers, f.lbd, { expect: EXPECT });

section('shape / drift gate');
ok(plan.ok === true && !plan.halt, 'plan ok on the accepted 124-shape');
eq([plan.summary.TOTAL_HEADERS, plan.summary.ACTIONABLE, plan.summary.ALL_ZERO], [124, 26, 98], 'summary 124/26/98');
eq([plan.summary.RD_HEADERS, plan.summary.RAD_HEADERS], [99, 25], 'RD 99 / RAD 25');

section('selection: 26 migrated, 98 dropped, submitted preserved');
eq(plan.report.MIGRATE_ROWS, 26, '26 migrate rows');
eq(plan.report.NON_ACTIONABLE_DROPPED_FROM_V2, 98, '98 non-actionable dropped from V2');
eq(plan.stagingRows.length, 26, 'staging has exactly 26 rows');
eq([plan.report.SUBMITTED_SOURCE, plan.report.SUBMITTED_MIGRATED], [20, 20], 'all 20 submitted migrated');
eq([plan.report.RD_MIGRATED, plan.report.RAD_MIGRATED], [11, 15], '11 RD + 15 RAD migrated (6 active RD + 5 submitted RD; 15 submitted RAD)');

section('ID preservation — verbatim, 0 conversions, RD + RAD both kept');
eq([plan.report.PRESERVED_IDS, plan.report.CONVERTED_IDS], [26, 0], 'PRESERVED=26 CONVERTED=0');
var srcIds = {}; f.headers.forEach(function (h) { srcIds[h.request_allocation_draft_id] = 1; });
ok(plan.stagingRows.every(function (r) { return srcIds[r.request_allocation_draft_id] === 1; }), 'every staging id exists verbatim in the source');
ok(plan.stagingRows.some(function (r) { return /^RAD-/.test(r.request_allocation_draft_id); }), 'a RAD id is preserved as RAD (never re-keyed to RD)');
ok(plan.stagingRows.some(function (r) { return /^RD::/.test(r.request_allocation_draft_id); }), 'an RD id preserved as RD');

section('flatten mapping (via KMRDV2.flattenLegacy) + missing-tier canonical init');
var aRow = plan.stagingRows.filter(function (r) { return r.status === 'draft'; })[0];
eq([aRow.t1_order_qty, aRow.t2_order_qty, aRow.t3_order_qty], [100, 50, 0], 'active tiers flattened T1/T2 + zero T3');
eq([aRow.t1_recommended_qty, aRow.t2_recommended_qty], [100, 50], 'recommended snapshot carried');
ok(aRow.t3_status === 'draft' && aRow.t3_user_edited === false, 'zero/missing-value tier canonical init (draft / not edited)');
ok(aRow.units_per_carton === '10' || aRow.units_per_carton === 10, 'units_per_carton from the lines');
var sRow = plan.stagingRows.filter(function (r) { return r.status === 'submitted'; })[0];
eq([sRow.t1_status, sRow.t1_submitted_by, sRow.t2_order_qty], ['submitted', 'u', 100], 'submitted tier status/by/qty preserved');

section('schema: exactly 53 V2 headers; no retired columns');
eq(plan.stagingHeaders.length, 53, '53 staging headers');
eq(plan.stagingHeaders.join('|'), K.V2_HEADERS.join('|'), 'staging headers == KMRDV2.V2_HEADERS');
['request_allocation_line_id', 'category_snapshot', 'series_snapshot', 't4_month', 'net_order_need_snapshot'].forEach(function (c) { ok(plan.stagingHeaders.indexOf(c) === -1, 'no retired column ' + c); });
ok(plan.stagingRows.every(function (r) { return !('request_allocation_line_id' in r) && !('category_snapshot' in r); }), 'no retired field on any flat row');

section('no source mutation (planner is pure)');
var beforeH = JSON.stringify(f.headers), beforeL = JSON.stringify(f.lbd);
P.planMigration(f.headers, f.lbd, { expect: EXPECT });
ok(JSON.stringify(f.headers) === beforeH && JSON.stringify(f.lbd) === beforeL, 'planMigration never mutates the source header/line inputs');

section('staging validator READY_FOR_SWAP');
var v = P.validateStaging(plan.stagingHeaders, plan.stagingRows, f.headers, f.lbd, { expectRows: 26 });
eq(v, { SCHEMA_OK: true, ROW_COUNT_OK: true, ID_SET_OK: true, SUBMITTED_SET_OK: true, TIER_VALUES_OK: true, NATURAL_SCOPE_OK: true, READY_FOR_SWAP: 'YES' }, 'validator: all OK, READY_FOR_SWAP=YES');
// tamper: drop a submitted id -> SUBMITTED_SET_OK false
var missingSubmitted = plan.stagingRows.filter(function (r) { return r.status !== 'submitted' || r.request_allocation_draft_id !== 'RAD-s0'; });
ok(P.validateStaging(plan.stagingHeaders, missingSubmitted, f.headers, f.lbd, {}).SUBMITTED_SET_OK === false, 'validator flags a missing submitted id');
// tamper: wrong tier value -> TIER_VALUES_OK false
var tampered = plan.stagingRows.map(function (r) { return Object.assign({}, r); }); tampered[0].t1_order_qty = 999999;
ok(P.validateStaging(plan.stagingHeaders, tampered, f.headers, f.lbd, {}).TIER_VALUES_OK === false, 'validator flags a wrong tier value');
// tamper: wrong schema -> SCHEMA_OK false
ok(P.validateStaging(['x', 'y'], plan.stagingRows, f.headers, f.lbd, {}).SCHEMA_OK === false, 'validator flags a bad schema');

section('drift + safety halts');
ok(P.planMigration(f.headers.slice(0, 120), f.lbd, { expect: EXPECT }).halt === 'R4_LIVE_DATA_DRIFT_FROM_R3', 'removed headers → drift halt');
// inject a NEEDS_MANUAL_REVIEW (duplicate T1) → drift halt (unsafe rows)
var f2 = fixture(); var dupId = 'RD::MONTHLY_ORDER::2026-09::a0'; f2.lbd[dupId].push(mkL(dupId, 'T1', '2026-09', 5, 5, 'active'));
ok(P.planMigration(f2.headers, f2.lbd, { expect: EXPECT }).ok === false, 'duplicate-tier (NEEDS_MANUAL_REVIEW) → halt');
// inject an active-duplicate scope (BLOCKED_CONFLICT) → halt
var f3 = fixture(); f3.headers.push(mkH('RD::MONTHLY_ORDER::2026-09::a0-dupe', 'draft', '2026-09', 'A0')); f3.lbd['RD::MONTHLY_ORDER::2026-09::a0-dupe'] = [mkL('RD::MONTHLY_ORDER::2026-09::a0-dupe', 'T1', '2026-09', 1, 1, 'active')];
ok(P.planMigration(f3.headers, f3.lbd, { expect: EXPECT }).ok === false, 'active-duplicate scope (BLOCKED_CONFLICT) → halt');

section('business-math invariance');
ok(aRow.t1_recommended_qty === 100 && aRow.t1_order_qty === 100, 'migration copies values verbatim — no recompute');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('MONTHLY V2 R4 MIGRATION (F1-7N-FA-3C-R4): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
