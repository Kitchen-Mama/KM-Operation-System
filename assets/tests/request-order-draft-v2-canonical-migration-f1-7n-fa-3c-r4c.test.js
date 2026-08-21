// Kitchen Mama Operation System — R4C migration normalization + validator closure — F1-7N-FA-3C-DRAFT-MODEL-R4C.
// Run: node assets/tests/request-order-draft-v2-canonical-migration-f1-7n-fa-3c-r4c.test.js
// Pure tests over KMRDV2.migrateLegacyToCanonical + KMRDV2P.planMigration/validateStaging: the explicit per-ID
// authority map, the frozen field maps (cycle→2026-08, site_confirmed→draft, blank→regular, KM Walmart→Walmart),
// fail-closed halts, and the 14 validator gates. No Sheets, no live DB, no mutation.

'use strict';
var K = require('../js/core/supply-planning-request-draft-v2.js');
var P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

function hdr(o) { return { request_allocation_draft_id: o.id, planning_cycle: o.cyc, company: o.company, country: o.country, marketplace: o.mkt, sku: o.sku, status: o.status, draft_purpose: (o.purpose === undefined ? 'regular' : o.purpose), calculation_run_id: (o.run === undefined ? 'RUN-' + o.id : o.run), draft_version: 1 }; }
function line(id, b, m, rec, ord, st) { return { request_allocation_draft_id: id, request_bucket: b, request_month: m, recommended_qty: rec, order_qty: ord, carton_qty: '', units_per_carton: '10', line_status: st, user_edited: 'FALSE' }; }
function tiers(id, st) { return [line(id, 'T1', '2026-08', 100, 100, st || 'active'), line(id, 'T2', '2026-09', 50, 50, st || 'active'), line(id, 'T3', '2026-10', 0, 0, 'draft')]; }

// ==========================================================================
section('KMRDV2.migrateLegacyToCanonical — frozen field maps');
var m1 = K.migrateLegacyToCanonical(hdr({ id: 'RAD-1', cyc: 'Sat Aug 01 2026', company: 'KM', country: 'US', mkt: 'KM Walmart', sku: 'CO1200-O', status: 'site_confirmed', purpose: '' }), tiers('RAD-1'), { cycle: '2026-08' });
ok(m1.ok === true, 'valid row migrates ok');
eq([m1.row.planning_cycle, m1.row.status, m1.row.draft_purpose, m1.row.marketplace], ['2026-08', 'draft', 'regular', 'Walmart'], 'cycle→2026-08, site_confirmed→draft, blank→regular, KM Walmart→Walmart');
eq([m1.row.request_allocation_draft_id, m1.row.calculation_run_id], ['RAD-1', 'RUN-RAD-1'], 'id + calculation_run_id preserved verbatim');
eq([m1.row.t1_order_qty, m1.row.t2_order_qty, m1.row.t3_order_qty], [100, 50, 0], 'tiers preserved verbatim');
ok(m1.normalized.cycle_changed === true && m1.normalized.status_changed === true && m1.normalized.purpose_changed === true && m1.normalized.marketplace_changed === true, 'normalization flags set');
// Amazon/Shopify unchanged; regular unchanged; submitted/cancelled verbatim
eq(K.migrateLegacyToCanonical(hdr({ id: 'RAD-2', company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'X', status: 'submitted', purpose: 'regular' }), tiers('RAD-2', 'submitted'), { cycle: '2026-08' }).row.marketplace, 'Amazon', 'Amazon unchanged');
eq(K.migrateLegacyToCanonical(hdr({ id: 'RAD-3', company: 'ResUS', country: 'US', mkt: 'Shopify', sku: 'X', status: 'draft' }), tiers('RAD-3'), { cycle: '2026-08' }).row.marketplace, 'Shopify', 'Shopify unchanged');
// fail-closed field halts
eq(K.migrateLegacyToCanonical(hdr({ id: 'RAD-4', mkt: 'Amazon', status: 'weird_status' }), tiers('RAD-4'), { cycle: '2026-08' }).halt, 'MIGRATION_STATUS_UNSUPPORTED', 'unknown status → HALT');
eq(K.migrateLegacyToCanonical(hdr({ id: 'RAD-5', mkt: 'Amazon', status: 'draft', purpose: 'monthly' }), tiers('RAD-5'), { cycle: '2026-08' }).halt, 'MIGRATION_DRAFT_PURPOSE_UNSUPPORTED', 'unknown nonblank purpose (monthly) → HALT (KMPA off-path)');
eq(K.migrateLegacyToCanonical(hdr({ id: 'RAD-6', mkt: 'eBay', status: 'draft' }), tiers('RAD-6'), { cycle: '2026-08' }).halt, 'MIGRATION_MARKETPLACE_UNSUPPORTED', 'unknown marketplace → HALT');
eq(K.migrateLegacyToCanonical(hdr({ id: 'RAD-7', mkt: 'Amazon', status: 'draft' }), tiers('RAD-7'), {}).halt, 'MIGRATION_CYCLE_MAPPING_MISSING', 'absent cycle → HALT');
eq(K.migrateLegacyToCanonical(hdr({ id: 'RAD-8', mkt: 'Amazon', status: 'draft' }), tiers('RAD-8'), { cycle: '2026' }).halt, 'MIGRATION_CYCLE_MAPPING_INVALID', 'non-canonical cycle mapping → HALT');
// source not mutated
var srcH = hdr({ id: 'RAD-9', cyc: '2026', company: 'KM', country: 'US', mkt: 'KM Walmart', sku: 'S', status: 'site_confirmed', purpose: '' }), srcL = tiers('RAD-9');
var beforeH = JSON.stringify(srcH), beforeL = JSON.stringify(srcL);
K.migrateLegacyToCanonical(srcH, srcL, { cycle: '2026-08' });
ok(JSON.stringify(srcH) === beforeH && JSON.stringify(srcL) === beforeL, 'migrateLegacyToCanonical never mutates the source header/lines');

// ==========================================================================
section('KMRDV2P.planMigration — explicit per-ID authority (no prefix logic)');
// small canonical cohort: 2 active + 1 submitted actionable + 1 all-zero non-actionable
function cohort() {
  var H = [
    hdr({ id: 'RAD-A', cyc: '2026-07', company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'CO1200-O', status: 'draft' }),
    hdr({ id: 'RAD-B', cyc: 'Sat Aug 01 2026', company: 'KM', country: 'US', mkt: 'KM Walmart', sku: 'CO1200-O', status: 'site_confirmed', purpose: '' }),
    hdr({ id: 'RAD-S', cyc: '2026-07', company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'X', status: 'submitted' }),
    hdr({ id: 'RAD-Z', cyc: '2026-09', company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'Z', status: 'draft' })   // no lines → non-actionable
  ];
  var lbd = { 'RAD-A': tiers('RAD-A'), 'RAD-B': tiers('RAD-B'), 'RAD-S': tiers('RAD-S', 'submitted') };
  return { H: H, lbd: lbd };
}
var EXPECT = { TOTAL_HEADERS: 4, ACTIONABLE: 3, ALL_ZERO: 1, NEEDS_MANUAL_REVIEW: 0, BLOCKED_CONFLICT: 0, ORPHAN_LINES: 0, DUPLICATE_T1: 0, DUPLICATE_T2: 0, DUPLICATE_T3: 0, T4_PRESENT: 0, SUBMITTED: 1 };
var AUTH = { 'RAD-A': '2026-08', 'RAD-B': '2026-08', 'RAD-S': '2026-08' };
var c = cohort();
var plan = P.planMigration(c.H, c.lbd, { expect: EXPECT, authorizedCycleById: AUTH });
ok(plan.ok === true, 'exact authority set (3 ids) → plan ok');
eq(plan.report.NORMALIZED_DISTRIBUTIONS.cycle, { '2026-08': 3 }, 'all actionable cycles → 2026-08');
eq(plan.report.NORMALIZED_DISTRIBUTIONS.marketplace, { 'Amazon': 2, 'Walmart': 1 }, 'marketplace dist: 2 Amazon + 1 Walmart');
eq(plan.report.NORMALIZED_DISTRIBUTIONS.status, { 'draft': 2, 'submitted': 1 }, 'status dist: 2 draft (incl site_confirmed→draft) + 1 submitted');
eq([plan.report.PRESERVED_IDS, plan.report.CONVERTED_IDS], [3, 0], 'ids preserved verbatim');
ok(plan.report.NORMALIZATION_COUNTS.CYCLE_NORMALIZED === 3 && plan.report.NORMALIZATION_COUNTS.STATUS_NORMALIZED === 1 && plan.report.NORMALIZATION_COUNTS.MARKETPLACE_NORMALIZED === 1, 'normalization counts: 3 cycle / 1 status / 1 marketplace');

section('planMigration — id-set + value halts (fail closed before any staging)');
// missing authorized id (authority names an id not actionable in source)
eq(P.planMigration(c.H, c.lbd, { expect: EXPECT, authorizedCycleById: { 'RAD-A': '2026-08', 'RAD-B': '2026-08', 'RAD-S': '2026-08', 'RAD-MISSING': '2026-08' } }).halt, 'MIGRATION_AUTHORIZED_ID_SET_MISMATCH', 'authority has an id absent from the actionable source → HALT');
// extra actionable id (source actionable id not authorized) — also covers unknown RAD-like id + no-prefix-mapping
eq(P.planMigration(c.H, c.lbd, { expect: EXPECT, authorizedCycleById: { 'RAD-A': '2026-08', 'RAD-B': '2026-08' } }).halt, 'MIGRATION_AUTHORIZED_ID_SET_MISMATCH', 'a source actionable id not in the authority (e.g. RAD-S) → HALT (no RAD-* prefix shortcut)');
// unknown status in an authorized row → status halt
var cs = cohort(); cs.H[0].status = 'weird';
eq(P.planMigration(cs.H, cs.lbd, { expect: EXPECT, authorizedCycleById: AUTH }).halt, 'MIGRATION_STATUS_UNSUPPORTED', 'unknown status in cohort → HALT');
// unknown marketplace → marketplace halt
var cm = cohort(); cm.H[0].marketplace = 'eBay';
eq(P.planMigration(cm.H, cm.lbd, { expect: EXPECT, authorizedCycleById: AUTH }).halt, 'MIGRATION_MARKETPLACE_UNSUPPORTED', 'unknown marketplace in cohort → HALT');
// unknown purpose → purpose halt
var cp = cohort(); cp.H[0].draft_purpose = 'monthly';
eq(P.planMigration(cp.H, cp.lbd, { expect: EXPECT, authorizedCycleById: AUTH }).halt, 'MIGRATION_DRAFT_PURPOSE_UNSUPPORTED', 'unknown purpose in cohort → HALT');
// source not mutated by planMigration
var c2 = cohort(); var bH = JSON.stringify(c2.H), bL = JSON.stringify(c2.lbd);
P.planMigration(c2.H, c2.lbd, { expect: EXPECT, authorizedCycleById: AUTH });
ok(JSON.stringify(c2.H) === bH && JSON.stringify(c2.lbd) === bL, 'planMigration never mutates the source');

// ==========================================================================
section('KMRDV2P.validateStaging — 14 gates on a canonical staging set');
var IDENT = [
  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1200-O', draft_purpose: 'regular', planning_cycle: '2026-08' },
  { company: 'KM', country: 'US', marketplace: 'Walmart', sku: 'CO1200-O', draft_purpose: 'regular', planning_cycle: '2026-08' }
];
var vopts = { expectRows: 3, authorizedCycleById: AUTH, canonicalActiveIdentities: IDENT, oldLineWriteCount: 0 };
var good = P.validateStaging(plan.stagingHeaders, plan.stagingRows, c.H, c.lbd, vopts);
eq(good.READY_FOR_SWAP, 'YES', 'canonical staging → READY_FOR_SWAP=YES');
['SCHEMA_OK', 'ROW_COUNT_OK', 'PLANNING_CYCLE_FORMAT_OK', 'PLANNING_CYCLE_AUTHORITY_OK', 'HEADER_STATUS_OK', 'DRAFT_PURPOSE_OK', 'CANONICAL_MARKETPLACE_OK', 'ID_PRESERVATION_OK', 'ID_SET_OK', 'SUBMITTED_SET_OK', 'TIER_VALUES_OK', 'NATURAL_SCOPE_OK', 'ACTIVE_SCOPE_REUSABLE', 'OLD_LINE_TABLE_UNTOUCHED'].forEach(function (g) { ok(good[g] === true, 'gate ' + g + ' = true'); });
// different marketplace, SAME sku (the two active rows share CO1200-O) does NOT fail natural scope
ok(good.NATURAL_SCOPE_OK === true, 'two active rows with the same SKU but different marketplace are NOT a duplicate');

section('validateStaging — negative cases (each forces READY_FOR_SWAP=NO)');
function clone(rows) { return rows.map(function (r) { return Object.assign({}, r); }); }
// malformed cycle → PLANNING_CYCLE_FORMAT_OK false
var bad1 = clone(plan.stagingRows); bad1[0].planning_cycle = '2026/08';
ok(P.validateStaging(plan.stagingHeaders, bad1, c.H, c.lbd, vopts).PLANNING_CYCLE_FORMAT_OK === false, 'malformed cycle fails format');
// 2026-07 is format-valid but FAILS authority (map says 2026-08)
var bad2 = clone(plan.stagingRows); bad2[0].planning_cycle = '2026-07';
var r2 = P.validateStaging(plan.stagingHeaders, bad2, c.H, c.lbd, vopts);
ok(r2.PLANNING_CYCLE_FORMAT_OK === true && r2.PLANNING_CYCLE_AUTHORITY_OK === false && r2.READY_FOR_SWAP === 'NO', '2026-07 passes format but fails authority → NO');
// site_confirmed status in staging → HEADER_STATUS_OK false
var bad3 = clone(plan.stagingRows); bad3[0].status = 'site_confirmed';
ok(P.validateStaging(plan.stagingHeaders, bad3, c.H, c.lbd, vopts).HEADER_STATUS_OK === false, 'site_confirmed in staging fails header-status vocab');
// blank/monthly purpose → DRAFT_PURPOSE_OK false
var bad4 = clone(plan.stagingRows); bad4[0].draft_purpose = 'monthly';
ok(P.validateStaging(plan.stagingHeaders, bad4, c.H, c.lbd, vopts).DRAFT_PURPOSE_OK === false, 'non-regular purpose fails');
// KM Walmart survives in staging → CANONICAL_MARKETPLACE_OK false
var bad5 = clone(plan.stagingRows); var kmRow = bad5.filter(function (r) { return r.company === 'KM'; })[0]; kmRow.marketplace = 'KM Walmart';
ok(P.validateStaging(plan.stagingHeaders, bad5, c.H, c.lbd, vopts).CANONICAL_MARKETPLACE_OK === false, 'KM Walmart in staging fails canonical marketplace');
// duplicate COMPLETE active scope → NATURAL_SCOPE_OK false
var dupRow = Object.assign({}, plan.stagingRows.filter(function (r) { return r.status === 'draft' && r.company === 'ResUS'; })[0]); dupRow.request_allocation_draft_id = 'RAD-A-dupe';
var bad6 = plan.stagingRows.concat([dupRow]);
ok(P.validateStaging(plan.stagingHeaders, bad6, c.H.concat([hdr({ id: 'RAD-A-dupe', company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'CO1200-O', status: 'draft' })]), c.lbd, { expectRows: 4, authorizedCycleById: AUTH, canonicalActiveIdentities: IDENT }).NATURAL_SCOPE_OK === false, 'duplicate complete active scope fails');
// converted/missing id → ID_PRESERVATION_OK false
var bad7 = clone(plan.stagingRows); bad7[0].request_allocation_draft_id = 'RAD-NOT-IN-SOURCE';
ok(P.validateStaging(plan.stagingHeaders, bad7, c.H, c.lbd, vopts).ID_PRESERVATION_OK === false, 'a staging id absent from source fails id-preservation');
// submitted-set mismatch → SUBMITTED_SET_OK false
var bad8 = plan.stagingRows.filter(function (r) { return r.status !== 'submitted'; });
ok(P.validateStaging(plan.stagingHeaders, bad8, c.H, c.lbd, vopts).SUBMITTED_SET_OK === false, 'dropping the submitted row fails submitted-set');
// tier mutation → TIER_VALUES_OK false
var bad9 = clone(plan.stagingRows); bad9[0].t1_order_qty = 999999;
ok(P.validateStaging(plan.stagingHeaders, bad9, c.H, c.lbd, vopts).TIER_VALUES_OK === false, 'tier mutation fails tier-values');
// legacy line write count > 0 → OLD_LINE_TABLE_UNTOUCHED false
ok(P.validateStaging(plan.stagingHeaders, plan.stagingRows, c.H, c.lbd, { expectRows: 3, authorizedCycleById: AUTH, canonicalActiveIdentities: IDENT, oldLineWriteCount: 1 }).OLD_LINE_TABLE_UNTOUCHED === false, 'a legacy-line write flips OLD_LINE_TABLE_UNTOUCHED');
// active scope not in frozen identities → ACTIVE_SCOPE_REUSABLE false
ok(P.validateStaging(plan.stagingHeaders, plan.stagingRows, c.H, c.lbd, { expectRows: 3, authorizedCycleById: AUTH, canonicalActiveIdentities: [{ company: 'Other', country: 'US', marketplace: 'Amazon', sku: 'X', draft_purpose: 'regular', planning_cycle: '2026-08' }] }).ACTIVE_SCOPE_REUSABLE === false, 'active scope outside the frozen identities fails ACTIVE_SCOPE_REUSABLE');
// each negative case forces READY=NO
ok(P.validateStaging(plan.stagingHeaders, bad1, c.H, c.lbd, vopts).READY_FOR_SWAP === 'NO', 'any failed gate → READY_FOR_SWAP=NO');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4C CANONICAL MIGRATION + VALIDATOR (F1-7N-FA-3C-R4C): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
