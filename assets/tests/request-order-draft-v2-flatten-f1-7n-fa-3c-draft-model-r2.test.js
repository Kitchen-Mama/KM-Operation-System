// Kitchen Mama Operation System — Request Order Allocation Draft V2 FLATTEN pure core — F1-7N-FA-3C-DRAFT-MODEL-R2.
// Run: node assets/tests/request-order-draft-v2-flatten-f1-7n-fa-3c-draft-model-r2.test.js
// Proves the frozen flat-draft contract (docs/planning/REQUEST_ORDER_ALLOCATION_DRAFT_V2_FLATTEN_DESIGN_FREEZE.md)
// against the PURE core (supply-planning-request-draft-v2.js). No Sheets, no shared engine, no live DB, no business
// math. Covers the R1 28-item test contract.

'use strict';
var V2 = require('../js/core/supply-planning-request-draft-v2.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function threws(fn, re, l) { var t = false; try { fn(); } catch (e) { t = re.test(e.message); } ok(t, l); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', draft_purpose: 'regular' };
function gen(overrides) {
  return V2.projectFlatDraftRow(Object.assign({
    scope: SCOPE, planningCycle: '2026-08', unitsPerCarton: 40,
    tiers: { T1: { month: '2026-08', recommendedQty: 0 }, T2: { month: '2026-09', recommendedQty: 320 }, T3: { month: '2026-10', recommendedQty: 7520 } },
    provenance: { calculationRunId: 'RUN::x::v1', formulaVersion: 'ORDER_PLANNING_GAP', calculatedAt: '2026-08-19T00:00:00Z', sourceDataAsOf: '2026-08-19' },
    generationType: 'ai_plan', draftVersion: 1, actor: 'system', now: '2026-08-19T10:00:00Z'
  }, overrides || {}));
}

// ==========================================================================
section('schema — exactly 53 columns, canonical order, tN_status naming');
ok(V2.V2_HEADERS.length === 53, '00 V2 schema has exactly 53 columns (' + V2.V2_HEADERS.length + ')');
ok(V2.V2_HEADERS.indexOf('t1_status') !== -1 && V2.V2_HEADERS.indexOf('t1_line_status') === -1, '00 uses tN_status (not tN_line_status)');
['t1_month', 't2_recommended_qty', 't3_order_qty', 't1_carton_qty', 't2_submitted_by', 't3_user_edited', 't1_note'].forEach(function (h) { ok(V2.V2_HEADERS.indexOf(h) !== -1, '00 has ' + h); });
['category_snapshot', 'series_snapshot', 'request_allocation_line_id', 'allocation_method', 'net_order_need_snapshot', 'factory_available_qty_snapshot', 'recommendation_reason', 'recommendation_flags'].forEach(function (h) { ok(V2.V2_HEADERS.indexOf(h) === -1, '00 does NOT carry retired field ' + h); });

section('01 one Draft row per SKU scope · 16 deterministic ID · 17 planning_cycle YYYY-MM');
var r = gen();
ok(r.request_allocation_draft_id === 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1100-R', '16 deterministic RD id, sorted scopeKey, no Date/UUID');
ok(V2.draftId(SCOPE, '2026-08') === V2.draftId(SCOPE, '2026-08'), '16 same scope+cycle → same id');
ok(V2.draftId(SCOPE, '2026-08') !== V2.draftId(Object.assign({}, SCOPE, { sku: 'CO2300-Y' }), '2026-08'), '16 different scope → different id');
ok(V2.normalizePlanningCycleMonthly('2026-8') === '2026-08', '17 single-digit month zero-padded (unambiguous)');
ok(V2.normalizePlanningCycleMonthly('2026-08') === '2026-08', '17 YYYY-MM accepted');
threws(function () { V2.normalizePlanningCycleMonthly('2026-08-19T00:00:00Z'); }, /INVALID_PLANNING_CYCLE/, '17 full datetime REJECTED (never enters identity)');
threws(function () { V2.normalizePlanningCycleMonthly('2026/08'); }, /INVALID_PLANNING_CYCLE/, '17 slash form REJECTED (no locale conversion)');
threws(function () { V2.normalizePlanningCycleMonthly('2026-13'); }, /INVALID_PLANNING_CYCLE/, '17 month out of range REJECTED');
threws(function () { V2.normalizePlanningCycleMonthly('2026-W40'); }, /INVALID_PLANNING_CYCLE/, '17 weekly cycle REJECTED for MONTHLY id');

section('02 fixed T1/T2/T3 fields · 03 no T4 · 06 recommended snapshot · 08 carton derive');
V2.TIERS.forEach(function (t) { var p = t.toLowerCase() + '_'; ['month', 'recommended_qty', 'order_qty', 'carton_qty', 'status'].forEach(function (s) { ok(Object.prototype.hasOwnProperty.call(r, p + s), '02 has ' + p + s); }); });
ok(V2.V2_HEADERS.filter(function (h) { return /^t4_/.test(h); }).length === 0, '03 no t4_ column exists');
ok(r.t2_recommended_qty === 320 && r.t3_recommended_qty === 7520 && r.t1_recommended_qty === 0, '06 recommended_qty = Suggested snapshot (T1=0 valid)');
ok(r.t2_carton_qty === 8 && r.t3_carton_qty === 188, '08 carton_qty = ceil(order/upc) default (320/40=8, 7520/40=188)');
ok(r.t1_order_qty === 0 && r.t2_order_qty === 320, '07 order_qty defaults to suggested at generation');

section('04 all-zero AI → no persist · 05 manual all-zero allowed');
var zero = gen({ tiers: { T1: { month: '2026-08', recommendedQty: 0 }, T2: { month: '2026-09', recommendedQty: 0 }, T3: { month: '2026-10', recommendedQty: 0 } } });
eq(V2.nonActionableGate(zero, { manual: false }), { persist: false, reason: 'NON_ACTIONABLE_ZERO_RECOMMENDATION' }, '04 all-zero AI recommendation → NOT persisted');
ok(V2.nonActionableGate(zero, { manual: true }).persist === true, '05 manual all-zero draft allowed');
ok(V2.nonActionableGate(r, { manual: false }).persist === true, '04 actionable draft persists');

section('26 no request_allocation_line_id anywhere · 18/19 Send explosion, zero skipped, no line id');
ok(V2.V2_HEADERS.indexOf('request_allocation_line_id') === -1, '26 schema carries no request_allocation_line_id');
var sr = V2.explodeSendRequestLines(r);
ok(sr.length === 2, '19 zero-qty T1 skipped → 2 lines (T2,T3)');
eq(sr.map(function (l) { return l.request_bucket; }), ['T2', 'T3'], '18 explode preserves tier buckets');
eq(sr[0], { sku: 'CO1100-R', company: 'ResUS', country: 'US', marketplace: 'Amazon', request_bucket: 'T2', request_month: '2026-09', requested_qty: 320, units_per_carton: 40, carton_qty: 8, request_allocation_draft_id: r.request_allocation_draft_id }, '18 explode maps flat→VALUE line');
ok(sr.every(function (l) { return !('request_allocation_line_id' in l); }), '26 Send lines carry NO request_allocation_line_id');

section('09 per-tier edit · 10 recommended never rewritten by edit');
var e1 = V2.applyTierEdit(r, 'T2', { order_qty: 400 }, 'vic', '2026-08-20T00:00:00Z');
ok(e1.ok && e1.row.t2_order_qty === 400 && e1.row.t2_carton_qty === 10, '09 T2 order edit updates order+carton');
ok(e1.row.t2_user_edited === true && e1.row.t2_user_edited_by === 'vic', '09 stamps user_edited on the edited tier');
ok(e1.row.t3_user_edited === false && e1.row.t1_user_edited === false, '09 other tiers NOT marked edited');
ok(e1.row.t2_recommended_qty === 320, '10 edit does NOT rewrite recommended_qty');
ok(r.t2_order_qty === 320, '10 input row not mutated (pure)');

section('10 submit · 11 partial submit · 12 full submit · 15 submitted terminal · zero-qty never forced');
var s1 = V2.applySubmit(r, ['T2'], 'vic', '2026-08-20T01:00:00Z');
ok(s1.results.T2 === 'SUBMITTED' && s1.row.t2_status === 'submitted' && s1.row.t2_submitted_by === 'vic', '10 per-tier submit stamps status/by/at');
ok(s1.row.t3_status === 'draft', '10 unrelated tier untouched');
ok(V2.deriveHeaderStatus(s1.row) === 'partially_submitted', '11 T2 submitted, T3 draft → partially_submitted');
var s2 = V2.applySubmit(s1.row, ['T3'], 'vic', '2026-08-20T02:00:00Z');
ok(V2.deriveHeaderStatus(s2.row) === 'submitted', '12 all submittable tiers submitted → submitted (T1=0 ignored)');
ok(V2.applySubmit(s2.row, ['T2'], 'vic', 'now').results.T2 === 'ALREADY_SUBMITTED', '15 submitted tier is terminal');
ok(V2.applySubmit(r, ['T1'], 'vic', 'now').results.T1 === 'NOT_SUBMITTABLE_ZERO_QTY', 'zero-qty tier never forced to submit');
ok(V2.applyTierEdit(s2.row, 'T2', { order_qty: 1 }, 'vic', 'now').ok === false, '15 cannot edit a submitted tier (terminal)');

section('08/28 header status vocab + derivation are pure/deterministic');
ok(V2.deriveHeaderStatus(zero) === 'draft', '28 all-zero → draft (no submittable tiers)');
ok(V2.deriveHeaderStatus(V2.applyCancel(r, 'vic', 'now', 'x')) === 'cancelled', '28 cancelled terminal');
Object.keys(V2.HEADER_STATUS).forEach(function (s) { ok(['draft', 'partially_submitted', 'submitted', 'cancelled'].indexOf(s) !== -1, '28 header status vocab minimal: ' + s); });
Object.keys(V2.TIER_STATUS).forEach(function (s) { ok(['draft', 'submitted', 'cancelled'].indexOf(s) !== -1, '26 tier status vocab = draft|submitted|cancelled: ' + s); });

section('13 untouched-tier refresh · 14 edited-tier protection · 15 submitted protection · created_at immutable');
var fresh = { T1: { month: '2026-08', recommendedQty: 5 }, T2: { month: '2026-09', recommendedQty: 999 }, T3: { month: '2026-10', recommendedQty: 8000 } };
var edited = V2.applyTierEdit(r, 'T2', { order_qty: 400 }, 'vic', 't1').row;
var refreshed = V2.refresh(edited, fresh, '2026-08-21T00:00:00Z');
ok(refreshed.t3_recommended_qty === 8000 && refreshed.t3_order_qty === 8000, '13 untouched non-terminal tier refreshed');
ok(refreshed.t2_order_qty === 400 && refreshed.t2_recommended_qty === 320, '14 user-edited tier preserved on REFRESH');
ok(refreshed.created_at === edited.created_at && refreshed.updated_at === '2026-08-21T00:00:00Z', 'created_at immutable; updated_at advances (REFRESH)');
var subd = V2.applySubmit(r, ['T2'], 'vic', 't').row;
var refreshed2 = V2.refresh(subd, fresh, 't2');
ok(refreshed2.t2_order_qty === 320 && refreshed2.t2_status === 'submitted', '15 submitted tier protected on REFRESH');

section('23/regenerate — version bump, edited protected unless confirmed, submitted terminal');
var reg = V2.regenerate(edited, fresh, {}, 'r1');
ok(reg.draft_version === 2, 'REGENERATE bumps draft_version');
ok(reg.t2_order_qty === 400 && reg.t2_user_edited === true, 'REGENERATE preserves edited tier without confirmation');
ok(reg.t3_order_qty === 8000, 'REGENERATE refreshes non-edited tier');
var regC = V2.regenerate(edited, fresh, { confirmRegenerateOverUserEdits: true }, 'r2');
ok(regC.t2_order_qty === 999 && regC.t2_user_edited === false, 'REGENERATE with confirm overwrites edited tier + clears flag');
ok(V2.regenerate(subd, fresh, { confirmRegenerateOverUserEdits: true }, 'r3').t2_status === 'submitted', '15 submitted tier terminal-protected even under confirmed REGENERATE');
ok(V2.reuse(r).request_allocation_draft_id === r.request_allocation_draft_id, 'REUSE returns same identity');

section('22 migration safe · 23 duplicate-tier review · 24 orphan · 25 legacy RAD · T4 review');
function line(b, o, ls) { return { request_bucket: b, request_month: '2026-0' + (b === 'T1' ? '8' : b === 'T2' ? '9' : '9'), recommended_qty: o, order_qty: o, units_per_carton: 40, line_status: ls || 'active' }; }
var hdrRD = { request_allocation_draft_id: 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1100-R', status: 'draft', planning_cycle: '2026-08', company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', draft_purpose: 'regular' };
ok(V2.classifyLegacyDraft(hdrRD, [line('T1', 0), line('T2', 320), line('T3', 7520)]).classification === 'MIGRATION_SAFE', '22 clean 3-line RD header → MIGRATION_SAFE');
ok(V2.classifyLegacyDraft(hdrRD, [line('T2', 320), line('T2', 9)]).reasons.indexOf('DUPLICATE_T2') !== -1, '23 duplicate T2 → NEEDS_MANUAL_REVIEW');
ok(V2.classifyLegacyDraft(hdrRD, [line('T4', 100)]).reasons.indexOf('T4_PRESENT') !== -1, 'T4 line → NEEDS_MANUAL_REVIEW');
ok(V2.classifyLegacyDraft(null, [line('T2', 320)]).reasons.indexOf('ORPHAN_LINE_NO_HEADER') !== -1, '24 orphan line (no header) → review');
var hdrRAD = Object.assign({}, hdrRD, { request_allocation_draft_id: 'RAD-ABCDEF1234' });
ok(V2.classifyLegacyDraft(hdrRAD, [line('T1', 0), line('T2', 320), line('T3', 7520)]).classification === 'MIGRATION_SAFE', '25 legacy RAD header migratable (recognized shape)');
ok(V2.classifyLegacyDraft(Object.assign({}, hdrRD, { request_allocation_draft_id: 'RAL-OLDTEST' }), [line('T2', 320)]).classification === 'NEEDS_MANUAL_REVIEW', 'RAL test id → review (never silently safe)');

section('migration flatten mapping + BLOCKED_CONFLICT + summary');
var flat = V2.flattenLegacy(hdrRD, [line('T1', 0), line('T2', 320, 'submitted'), line('T3', 7520)]);
ok(flat.t2_status === 'submitted' && flat.t3_order_qty === 7520 && flat.t1_order_qty === 0, 'flattenLegacy maps tier lines → tN_* incl per-tier status');
ok(flat.request_allocation_draft_id === hdrRD.request_allocation_draft_id, 'flattenLegacy preserves draft id');
var conf = V2.detectActiveConflicts([hdrRD, Object.assign({}, hdrRD, { request_allocation_draft_id: 'RD::dup' })]);
ok(conf.length === 1 && conf[0].draftIds.length === 2, 'BLOCKED_CONFLICT: >1 active header per natural scope');
var summ = V2.summarizeMigration([hdrRD], { });
ok(summ.TOTAL_HEADERS === 1 && summ.RD_HEADERS === 1 && summ.HEADERS_WITH_0_LINES === 1, 'summarizeMigration aggregates (read-only pure)');

section('20/21/34/35 formal model contract — Send lines carry only VALUE fields (grain unchanged)');
var lineKeys = Object.keys(sr[0]).sort();
eq(lineKeys, ['carton_qty', 'company', 'country', 'marketplace', 'request_allocation_draft_id', 'request_bucket', 'request_month', 'requested_qty', 'sku', 'units_per_carton'], '20/21 Send line = flat VALUE fields only (draft-level FK, no line id) → formal request_order_lines/_line_sources grain unchanged');

// ==========================================================================
console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
