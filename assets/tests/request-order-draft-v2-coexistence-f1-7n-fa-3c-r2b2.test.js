// Kitchen Mama Operation System — MONTHLY flat V2 / WEEKLY line COEXISTENCE — F1-7N-FA-3C-DRAFT-MODEL-R2b-2.
// Run: node assets/tests/request-order-draft-v2-coexistence-f1-7n-fa-3c-r2b2.test.js
// Proves the frozen coexistence contract (docs/planning/REQUEST_ORDER_ALLOCATION_DRAFT_V2_FLATTEN_DESIGN_FREEZE.md
// §17-18): MONTHLY_ORDER persists ONE flat 53-col request_order_allocation_drafts row (no child lines) through the
// KMRDV2/KMRDV2P SHAPE ADAPTER, reusing the SHARED governance (recommendation_calculation_runs journal + optimistic
// token) — while WEEKLY_SHIPPING keeps the existing shared LINE engine unchanged and never touches KMRDV2. Pure /
// tests-only: no Sheets, no live DB, no deploy, no business-math change.
//
// PREMISE CORRECTION (code-verified this round): the WEEKLY_SHIPPING draft planning_cycle is RECO-YYYY-MM (month-
// grained; the week granularity lives in the window_code line key), NOT "YYYY-Www". The coexistence invariant that
// matters is therefore: MONTHLY normalizes to a BARE YYYY-MM via KMRDV2 and REJECTS the RECO- prefix, so the WEEKLY
// cycle can never be (and must never be) routed through KMRDV2.

'use strict';
var P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');
var KMPW = require('../js/core/supply-planning-production-writer.js');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function threws(fn, re, l) { var t = false; try { fn(); } catch (e) { t = re.test(e.message); } ok(t, l); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'GA0450', draft_purpose: 'regular' };

// in-memory MONTHLY flat sheet-set (flat drafts + shared run journal ONLY) + a deps set over it.
function freshSet() {
  var s = KMPR.createSheetSet();
  s.request_order_allocation_drafts.headers = KMRDV2.V2_HEADERS.slice();
  s.recommendation_calculation_runs.headers = KMPR.RUN_JOURNAL_HEADERS.slice();
  return s;
}
function facts(t1, t2, t3, upc) {
  return { ready: true, lines: [
    { request_bucket: 'T1', request_month: '2026-09', recommended_qty: t1, units_per_carton: upc },
    { request_bucket: 'T2', request_month: '2026-10', recommended_qty: t2 },
    { request_bucket: 'T3', request_month: '2026-11', recommended_qty: t3 }
  ], provenance: { calculationRunId: 'RUN-A', formulaVersion: 'ORDER_PLANNING_GAP', calculatedAt: '2026-08-21', sourceDataAsOf: '2026-08-20' } };
}
function deps(s, f) { return {
  loadActiveContext: function (q) { return P.loadActiveFlat(s, q); },
  computeFacts: function () { return f; },
  lockedApply: function (plan, tok, o) { return P.applyFlat(s, plan, tok, o); }
}; }
function cmd(over) { return Object.assign({ recommendationType: 'MONTHLY_ORDER', mode: 'ai_plan', planningCycle: '2026-09', businessScope: SCOPE, actor: 'sys', now: 'T1' }, over || {}); }
function headerRow(s) { var t = s.request_order_allocation_drafts; return t.rows.length ? (function () { var o = {}; t.headers.forEach(function (h, i) { o[h] = t.rows[0][i]; }); return o; })() : null; }
function runRow(s) { var t = s.recommendation_calculation_runs; return t.rows.length ? (function () { var o = {}; t.headers.forEach(function (h, i) { o[h] = t.rows[0][i]; }); return o; })() : null; }

// light KMSAFE-compatible spreadsheet fake: {name: [[headers...],[row...]]}
function fakeSS(id, sheets) {
  return { getId: function () { return id; },
    getSheetByName: function (n) { var v = sheets[n]; if (!v) return null; return { getDataRange: function () { return { getValues: function () { return v; } }; } }; } };
}
var DB_ID = 'DB-TEST-ID';

// ==========================================================================
section('1-2 dispatch: MONTHLY→flat adapter, WEEKLY→existing line adapter (shared TABLES map unchanged)');
ok(P.RECOMMENDATION_TYPE === 'MONTHLY_ORDER', '1 KMRDV2P is the MONTHLY_ORDER flat adapter');
eq(P.generateMonthlyFlat(cmd({ recommendationType: 'WEEKLY_SHIPPING' }), deps(freshSet(), facts(1, 0, 0))).success, false, '2 flat adapter refuses non-MONTHLY (WEEKLY never routes here)');
ok(KMPR.TABLES.WEEKLY_SHIPPING.header === 'shipping_allocation_drafts' && KMPR.TABLES.WEEKLY_SHIPPING.lines === 'shipping_allocation_draft_lines', '2 WEEKLY still maps to the shipping line tables');
eq(KMPR.TABLES.WEEKLY_SHIPPING.lineKey, ['sku', 'site_sku', 'window_code', 'source_warehouse_id', 'route_no'], '2 WEEKLY variable per-source line key unchanged');
ok(KMPR.TABLES.MONTHLY_ORDER.header === 'request_order_allocation_drafts', '1 MONTHLY header table name unchanged (shape flips, table name stable)');

section('3-6 planning_cycle coexistence (MONTHLY YYYY-MM vs WEEKLY RECO-YYYY-MM)');
eq(KMRDV2.normalizePlanningCycleMonthly('2026-9'), '2026-09', '3 MONTHLY accepts + zero-pads YYYY-MM');
threws(function () { KMRDV2.normalizePlanningCycleMonthly('2026-W37'); }, /INVALID_PLANNING_CYCLE/, '4 MONTHLY rejects a Www cycle');
threws(function () { KMRDV2.normalizePlanningCycleMonthly('RECO-2026-09'); }, /INVALID_PLANNING_CYCLE/, '4 MONTHLY rejects the WEEKLY RECO- prefix');
// WEEKLY cycle is an opaque string to the shared engine (accepted verbatim by buildBusinessScopeKey) — NOT normalized.
ok(/RECO-2026-08/.test(KMPR.buildBusinessScopeKey('WEEKLY_SHIPPING', { planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'inventory_replenishment' })), '5 WEEKLY RECO-YYYY-MM accepted verbatim by the shared engine');
ok(typeof KMRDV2.normalizePlanningCycleMonthly === 'function' && (function () { try { KMRDV2.normalizePlanningCycleMonthly('RECO-2026-08'); return false; } catch (e) { return true; } })(), '6 WEEKLY cycle is never (and can never be) routed through KMRDV2 normalization');

section('7-10 schema set: MONTHLY V2 = flat drafts + journal only; excludes lines + shipping; WEEKLY unchanged; 53 cols');
var specs = P.v2TableSpecs();
var specNames = specs.map(function (x) { return x.sheetName; });
eq(specNames, ['request_order_allocation_drafts', 'recommendation_calculation_runs'], '7/8 MONTHLY V2 authorized set is exactly [flat drafts, run journal]');
ok(specNames.indexOf('request_order_allocation_draft_lines') === -1, '7 MONTHLY V2 set EXCLUDES the retired child-line table');
ok(specNames.indexOf('shipping_allocation_drafts') === -1 && specNames.indexOf('shipping_allocation_draft_lines') === -1, '8 MONTHLY V2 set EXCLUDES both shipping tables');
var weeklySpecNames = KMPW.authorizedTableSpecs('WEEKLY_SHIPPING').map(function (x) { return x.sheetName; });
eq(weeklySpecNames, ['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'recommendation_calculation_runs'], '9 WEEKLY authorized schema set UNCHANGED');
ok(specs[0].expectedHeaders.length === 53 && specs[0].expectedHeaders.join('|') === KMRDV2.V2_HEADERS.join('|'), '10 MONTHLY flat header spec = exactly the 53-col KMRDV2.V2_HEADERS (drift-proof)');
ok(P.v2ExpectedHeaderCount() === 53, '10 flat header count is 53');

section('schema gate integration: flat V2 ready even when the child-line + shipping schemas are stale/missing');
var ssReady = fakeSS(DB_ID, { request_order_allocation_drafts: [KMRDV2.V2_HEADERS.slice()], recommendation_calculation_runs: [KMPR.RUN_JOURNAL_HEADERS.slice()] });
var vr = KMPW.validateAuthorizedRecommendationSchemas(ssReady, { expectedSpreadsheetId: DB_ID, tableSpecsOverride: P.v2TableSpecs() });
ok(vr.ready === true, 'G1 MONTHLY V2 gate READY on flat drafts + journal (no line table, no shipping table present)');
ok(vr.tables['request_order_allocation_draft_lines'] === undefined && vr.tables['shipping_allocation_drafts'] === undefined, 'G2 gate never even inspects the excluded tables');
var ssBadFlat = fakeSS(DB_ID, { request_order_allocation_drafts: [['request_allocation_draft_id', 'planning_cycle']], recommendation_calculation_runs: [KMPR.RUN_JOURNAL_HEADERS.slice()] });
ok(KMPW.validateAuthorizedRecommendationSchemas(ssBadFlat, { expectedSpreadsheetId: DB_ID, tableSpecsOverride: P.v2TableSpecs() }).ready === false, 'G3 a MONTHLY V2 flat-schema mismatch still FAILS CLOSED (not silently accepted)');

section('11-12 deterministic RD identity; never a RAD-uuid');
var s1 = freshSet(); var r = P.generateMonthlyFlat(cmd(), deps(s1, facts(120, 0, 60, 12)));
ok(r.draftId === 'RD::MONTHLY_ORDER::2026-09::company=KM|country=US|draft_purpose=regular|marketplace=AMAZON_US|sku=GA0450', '11 deterministic RD::MONTHLY_ORDER::<YYYY-MM>::<sorted scopeKey>');
ok(!/^RAD-/.test(r.draftId) && !/RAD-/.test(JSON.stringify(headerRow(s1))), '12 no RAD-uuid written anywhere on the flat row');

section('13-16 AI all-zero gate / manual all-zero / one scope→one row / zero child-line writes');
var sZ = freshSet(); var rz = P.generateMonthlyFlat(cmd(), deps(sZ, facts(0, 0, 0)));
ok(rz.wrote === false && rz.outcome === 'NON_ACTIONABLE' && rz.reason === 'NON_ACTIONABLE_ZERO_RECOMMENDATION' && sZ.request_order_allocation_drafts.rows.length === 0, '13 AI all-zero → NOT persisted');
var sM = freshSet(); var rm = P.generateMonthlyFlat(cmd({ mode: 'manual' }), deps(sM, facts(0, 0, 0)));
ok(rm.wrote === true && sM.request_order_allocation_drafts.rows.length === 1, '14 manual all-zero → persisted (one flat row)');
ok(s1.request_order_allocation_drafts.rows.length === 1, '15 one SKU scope → exactly one flat row');
ok(s1.request_order_allocation_draft_lines.rows.length === 0, '16 MONTHLY child-line writes = 0');
// idempotent re-run keeps it at one row / zero lines
P.generateMonthlyFlat(cmd(), deps(s1, facts(120, 0, 60, 12)));
ok(s1.request_order_allocation_drafts.rows.length === 1 && s1.request_order_allocation_draft_lines.rows.length === 0, '15/16 re-run stays one flat row, zero child lines');

section('17 flat readback reads the header table ONLY (no child-line join)');
var dto = P.readActiveFlatForScope(s1, { planningCycle: '2026-09', businessScope: SCOPE });
ok(dto.length === 1 && dto[0].draftId === r.draftId && dto[0].tiers.length === 3 && dto[0].tiers[0].orderQty === 120 && dto[0].tiers[2].orderQty === 60, '17 flat DTO built from the header row alone (tiers inlined)');
ok(dto[0].unitsPerCarton === 12 && dto[0].planningCycle === '2026-09', '17 DTO carries units_per_carton + normalized cycle');
// prove the readback ignores any child-line table content entirely
s1.request_order_allocation_draft_lines.headers = ['request_allocation_line_id']; s1.request_order_allocation_draft_lines.rows = [['SHOULD-NEVER-READ']];
ok(P.readActiveFlatForScope(s1, { planningCycle: '2026-09', businessScope: SCOPE })[0].tiers[0].orderQty === 120, '17 readback unaffected by any child-line rows (no join)');

section('18-23 lifecycle: REFRESH preserves created_at / advances updated_at / protects edited+terminal; REGENERATE bumps version');
var sL = freshSet(); P.generateMonthlyFlat(cmd({ now: 'C0' }), deps(sL, facts(100, 200, 0, 10)));
var created = headerRow(sL).created_at;
// user-edit T1, submit T2, then a refresh pass
var base = headerRow(sL);
var edited = KMRDV2.applyTierEdit(base, 'T1', { order_qty: 999 }, 'user', 'E1').row;
var submitted = KMRDV2.applySubmit(edited, ['T2'], 'user', 'S1').row;
sL.request_order_allocation_drafts.rows[0] = KMRDV2.V2_HEADERS.map(function (h) { return submitted[h] !== undefined ? submitted[h] : ''; });
// REFRESH with new recommendations
var rf = P.planFlat({ existingRow: submitted, scope: SCOPE, planningCycle: '2026-09', action: 'refresh',
  tiers: { T1: { recommendedQty: 111 }, T2: { recommendedQty: 222 }, T3: { recommendedQty: 333 } }, now: 'U1', actor: 'sys' });
ok(rf.row.created_at === created, '18 REFRESH preserves created_at');
ok(rf.row.updated_at === 'U1' && rf.row.updated_at !== created, '19 REFRESH advances updated_at');
ok(rf.row.t1_order_qty === 999 && rf.row.t1_user_edited === true, '20 REFRESH preserves the user-edited tier decision');
ok(rf.row.t2_status === 'submitted' && rf.row.t2_order_qty === 200, '21 submitted tier protected by REFRESH');
ok(rf.row.t3_order_qty === 333, '20 non-edited non-terminal tier refreshed to the new recommendation');
ok(rf.row.draft_version === base.draft_version, '18 REFRESH keeps draft_version');
// cancel protection + regenerate version bump
var cancelled = KMRDV2.applyCancel(base, 'user', 'X1', 'test');
var rc = P.planFlat({ existingRow: cancelled, scope: SCOPE, planningCycle: '2026-09', action: 'refresh', tiers: { T1: { recommendedQty: 5 } }, now: 'U2', actor: 'sys' });
ok(rc.row.status === 'cancelled', '22 cancelled draft stays cancelled through REFRESH');
var rg = P.planFlat({ existingRow: base, scope: SCOPE, planningCycle: '2026-09', action: 'regenerate', tiers: { T1: { recommendedQty: 7 } }, now: 'U3', actor: 'sys' });
ok(rg.row.draft_version === (base.draft_version || 1) + 1 && rg.row.created_at === created, '23 REGENERATE increments draft_version + preserves created_at');

section('24-27 run journal reuse + provenance preservation (SHARED recommendation_calculation_runs)');
var jr = runRow(s1);
ok(jr && jr.recommendation_type === 'MONTHLY_ORDER' && jr.run_status === 'COMPLETED' && jr.current_stage === 'COMPLETED', '24 MONTHLY reuses the shared recommendation_calculation_runs journal');
ok(jr.calculation_run_id === 'RUN-A', '25 calculation_run_id preserved verbatim from provenance');
ok(headerRow(s1).formula_version === 'ORDER_PLANNING_GAP', '26 formula_version preserved on the flat row');
ok(headerRow(s1).source_data_as_of === '2026-08-20', '27 source_data_as_of preserved on the flat row');
ok(KMPR.RUN_JOURNAL_HEADERS.length === P.v2TableSpecs()[1].expectedHeaders.length, '24 journal schema is the shared KMPR.RUN_JOURNAL_HEADERS (not a MONTHLY fork)');

section('28 optimistic concurrency retained (flat fingerprint over per-tier (order_qty,user_edited) via shared token)');
var sc = freshSet(); P.generateMonthlyFlat(cmd(), deps(sc, facts(50, 0, 0, 5)));
var live = headerRow(sc);
var goodTok = P.expectedTokenForExisting(live, live.draft_version);
var goodPlan = P.planFlat({ existingRow: live, scope: SCOPE, planningCycle: '2026-09', action: 'refresh', tiers: { T1: { recommendedQty: 60 } }, now: 'T2', actor: 'sys' });
ok(P.applyFlat(sc, goodPlan, goodPlan.expectedToken, { now: 'T2', actor: 'sys' }).runStatus === 'COMPLETED', '28 matching token → apply succeeds');
var staleTok = { draft_version: live.draft_version, userEditFingerprint: 'deadbeef' };
ok(P.applyFlat(sc, goodPlan, staleTok, { now: 'T3', actor: 'sys' }).runStatus === 'CONFLICT', '28 stale token → CONFLICT, no write');
ok(typeof KMPR.tokensMatch === 'function' && typeof KMPR.computeExpectedToken === 'function', '28 token comparison uses the shared KMPR primitives');
// a genuine concurrent edit changes the fingerprint (protection not weakened)
var t0 = P.expectedTokenForExisting(live, live.draft_version);
var edited2 = KMRDV2.applyTierEdit(live, 'T1', { order_qty: 7 }, 'user', 'E').row;
var t1 = P.expectedTokenForExisting(edited2, edited2.draft_version);
ok(t0.userEditFingerprint !== t1.userEditFingerprint, '28 a per-tier order/edit change moves the fingerprint (protection intact)');

section('29-30 WEEKLY line engine untouched by the flat module');
var flatSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'core', 'supply-planning-request-draft-v2-persistence.js'), 'utf8');
ok(!/shipping_allocation_draft/.test(flatSrc), '29 flat module references NO shipping table');
// every write the flat module performs targets ONLY the flat drafts + shared journal (never a shipping/line table)
ok(r.writtenTables.length === 2 && r.writtenTables.indexOf('request_order_allocation_drafts') !== -1 && r.writtenTables.indexOf('recommendation_calculation_runs') !== -1 && r.writtenTables.every(function (n) { return !/shipping|_lines/.test(n); }), '29 flat writes touch only [flat drafts, run journal] — no shipping / line write path');
ok(P.v2TableSpecs().every(function (s) { return !/shipping/.test(s.sheetName); }), '30 WEEKLY readback tables never appear in the MONTHLY V2 authorized set');
ok(KMPR.TABLES.WEEKLY_SHIPPING.userQty === 'planned_qty' && KMPR.TABLES.MONTHLY_ORDER.userQty === 'order_qty', '30 per-type userQty columns unchanged');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('MONTHLY/WEEKLY COEXISTENCE (F1-7N-FA-3C-R2b-2): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
