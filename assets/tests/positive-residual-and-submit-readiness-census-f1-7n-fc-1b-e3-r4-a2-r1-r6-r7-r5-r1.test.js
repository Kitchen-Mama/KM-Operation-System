// BATCH S1 — POSITIVE-RESIDUAL AND SUBMIT READINESS CENSUS.
//
// The R6-R7-R5-R1 activation proved the class of correct no-action where the recommendation is already
// FULLY_COVERED_BY_ACTIVE_PLAN and the right answer is that nothing is written. This suite covers the other
// half of the vertical slice: a POSITIVE RESIDUAL, where the right answer is that rows ARE written, and the
// Submit that carries such a draft into a Weekly Shipping Plan.
//
// WHAT THIS SUITE IS FOR, AND WHAT IT DELIBERATELY IS NOT.
//
// It does NOT re-test the runtime lifecycle. That coverage exists and is named in the S1 report:
// shared-factory-stock-guard-and-overage-approval (the guard, the clamp, the shared pool, 210 assertions),
// inventory-ai-plan-submit-authority-f1-7n-fa-4b (the Submit gates), controlled-ai-plan-production-readiness
// (the recommendation authority and the residual), controlled-ai-plan-production-parity (the decision path),
// override-audit-provisioning-and-transaction-rollback (the transaction and its rollback). Adding a second
// copy of any of those would be the parallel model this batch is forbidden to build.
//
// It covers what has no coverage: the READ-ONLY READINESS CENSUS, and the binding between what the two
// activation manifests CLAIM and what the runtime actually does. A manifest that describes a rollback the
// runtime does not have is worse than no manifest, because it is authorised against.
//
// Run: node assets/tests/positive-residual-and-submit-readiness-census-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r5-r1.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l, d) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var NL = String.fromCharCode(10);

// ================================================================================================================
// THE WORLD IS THE READINESS SUITE'S, EXTENDED — NOT COPIED. It already wires 61_ (the harvest, the
// recommendation authority, the qualifying plan, the residual and the decision), the bundle, 69_, 16_'s
// terminal sets, 43_'s gap constants and 00_'s flag and allowlist. This suite adds the five FACTORY EXPOSURE
// tables and the shipped 71_ seam on top, because the S1 census reads tables no existing world models.
// ================================================================================================================
var BASE_OF = 'assets/tests/controlled-ai-plan-production-readiness-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7.test.js';
var BASE_SRC = read(BASE_OF).split(String.fromCharCode(13) + String.fromCharCode(10)).join(NL);
var CUT = BASE_SRC.indexOf(NL + "section('A ");
if (CUT < 0) throw new Error('the readiness suite no longer opens its assertions with section()');
var SHARED = (new Function('require', '__dirname', '__filename', 'module', 'exports', 'console',
  BASE_SRC.slice(0, CUT)
  + NL + 'return { World: World, FakeSheet: FakeSheet, extractFn: extractFn, extractVar: extractVar,'
  + ' failed: failed, GAP_DATE: GAP_DATE, GAP_CYCLE: GAP_CYCLE, gapRow: gapRow, GAP_HDR: GAP_HDR,'
  + ' HDR_FULL: HDR_FULL, LINE_FULL: LINE_FULL, G16: G16, G71: (typeof G71 === "undefined" ? null : G71) };'
))(function (m) { return require(m.indexOf('./') === 0 ? path.join(ROOT, 'assets/tests', m) : m); },
  path.join(ROOT, 'assets/tests'), __filename, module, exports,
  { log: function () {}, error: function () {} });

var World = SHARED.World, FakeSheet = SHARED.FakeSheet;
var extractFn = SHARED.extractFn, extractVar = SHARED.extractVar, failed = SHARED.failed;
var GAP_DATE = SHARED.GAP_DATE, GAP_CYCLE = SHARED.GAP_CYCLE;
var GS = 'assets/specs/active/apps-script/';
var G71 = read(GS + '71_api_v1_factory_stock_guard.gs');
var G16 = read(GS + '16_shipping_allocation_handlers.gs');
var G69 = read(GS + '69_api_v1_ai_plan_lifecycle.gs');
var S1_REL = 'assets/tools/apps-script-diagnostics/TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs';
var S1 = read(S1_REL).split(String.fromCharCode(13) + String.fromCharCode(10)).join(NL);

// ---- THE CLOCK, PINNED TO A STATED HOUR. Same reason as the family it borrows from: the freshness resolver
// is a state machine over the Taipei hour (accepting below 17:45, REFRESH_OVERDUE above it), so a census
// verdict asserted without stating the hour is an equality with now. Today's DATE is kept because the gap
// fixtures derive theirs from the same clock; only the time of day is fixed, through 43_'s own single seam.
function pinTaipeiHourSrc_(hour) {
  var d = new Date();
  var t = new Date(d.getTime() + 8 * 3600 * 1000);
  var ms = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hour - 8, 0, 0);
  return 'gapCalcNowMs_ = function () { return ' + ms + '; };';
}
var PIN_HOUR_ = 15;   // inside the refresh window: the accepted run is current

var FACTORY_TABLES_ = {
  warehouses: ['warehouse_id', 'warehouse_code', 'warehouse_type', 'company', 'country', 'is_active', 'is_factory_warehouse'],
  factory_stock: ['warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock'],
  shipping_plans: ['shipping_plan_id', 'parent_shipping_plan_id', 'company', 'country', 'marketplace',
    'source_warehouse_id', 'status', 'plan_version', 'transferred_to_shipment_at', 'transferred_shipment_id'],
  shipping_plan_lines: ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty', 'approved_qty'],
  marketplaces: ['company', 'country', 'marketplace', 'allocation_priority']
};
// The factory warehouse the readiness fixture's own drafts already source from. Inventing an id here would
// build a pool that no fixture row belongs to, and the exposure would read zero for the wrong reason —
// which is exactly what the first run of this suite measured.
var WHF = 'WH-TW-CN-FACTORY-YOUXIN';
var DEFAULT_WAREHOUSES_ = [
  { warehouse_id: WHF, warehouse_type: 'FACTORY', company: 'ResUS', country: 'CN', is_active: true, is_factory_warehouse: true },
  { warehouse_id: 'FW-TW', warehouse_type: 'FACTORY', company: 'ResUS', country: 'TW', is_active: true, is_factory_warehouse: true },
  { warehouse_id: 'WH-3PL', warehouse_type: '3PL', company: 'ResUS', country: 'US', is_active: true, is_factory_warehouse: false }
];

/**
 * The S1 world. `spec` is the readiness suite's `over` plus the factory-side rows.
 * `writes` is counted on EVERY sheet, including the ones added here, so "zero writes" is measured rather
 * than asserted from the absence of a call.
 */
function S1World(spec) {
  spec = spec || {};
  var over = {};
  Object.keys(spec).forEach(function (k) {
    if (['warehouses', 'factory_stock', 'plans', 'plan_lines', 'marketplaces', 'pinHour', 'after'].indexOf(k) === -1) over[k] = spec[k];
  });
  var w = new World(over);
  function add(name, rows) {
    var H = FACTORY_TABLES_[name];
    var sh = new FakeSheet(H);
    (rows || []).forEach(function (r) { sh.rows.push(H.map(function (h) { return r[h] === undefined ? '' : r[h]; })); });
    sh.writes = 0;
    w.sheets[name] = sh;
    return sh;
  }
  add('warehouses', spec.warehouses || DEFAULT_WAREHOUSES_);
  add('factory_stock', spec.factory_stock || []);
  add('shipping_plans', spec.plans || []);
  add('shipping_plan_lines', spec.plan_lines || []);
  add('marketplaces', spec.marketplaces || []);

  // The two normalizers 71_ reaches for, and the shipped 71_ seam itself.
  vm.runInContext([
    'function gapTruthy_(v) { return /^(true|yes|1|y)$/i.test(String(v == null ? "" : v).trim()); }',
    'function gapCanonCountry_(c) { return String(c == null ? "" : c).trim().toUpperCase(); }'
  ].join(NL), w.ctx);
  vm.runInContext(G71, w.ctx, { filename: '71_' });
  // 69_'s real expiration selector — the SAME one a generation uses to expire, so the set the census reports
  // and the set a run would expire cannot differ.
  vm.runInContext([extractFn(G69, 'aiplStr_'), extractFn(G69, 'aiplLo_'),
    extractFn(G69, 'aiplIsAiGenerated_'), extractFn(G69, 'aiplSameScope_'),
    extractFn(G69, 'aiplExpirationCandidates_')].join(NL), w.ctx);
  // The four Submit-authority names, as PRESENCE STUBS. The census asks only whether they exist; every claim
  // about their BEHAVIOUR is bound to the real 16_ source in section G, so a stub cannot make one true.
  vm.runInContext([
    'function handleSubmitAllocationDraftsToShippingPlans_() { throw new Error("S1_SUITE_PRESENCE_STUB_ONLY"); }',
    'function sadSubmitToShippingPlansCore_() { throw new Error("S1_SUITE_PRESENCE_STUB_ONLY"); }',
    'function shippingPlanCommitFromLines_() { throw new Error("S1_SUITE_PRESENCE_STUB_ONLY"); }',
    'function sadVerifyShippingPlanOutput_() { throw new Error("S1_SUITE_PRESENCE_STUB_ONLY"); }'
  ].join(NL), w.ctx);
  // 63_'s deployment contract, stubbed UNIFORM: this suite is not testing the deployment probe.
  vm.runInContext('function sysModuleBuildStamps_() { return { available: true, verdict: "UNIFORM",'
    + ' deployment_build: "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1", modules: [], stale_modules: [],'
    + ' absent_modules: [], mixed_deployment: false }; }', w.ctx);
  vm.runInContext(pinTaipeiHourSrc_(spec.pinHour === undefined ? PIN_HOUR_ : spec.pinHour), w.ctx);
  if (spec.after) vm.runInContext(spec.after, w.ctx);
  vm.runInContext(spec.s1 || S1, w.ctx, { filename: 'S1' });
  w.allWrites = function () {
    var n = 0;
    Object.keys(w.sheets).forEach(function (k) { n += (w.sheets[k].writes || 0); });
    return n;
  };
  return w;
}
function census(spec) {
  var w = S1World(spec);
  var r = w.run('RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS');
  r.world = w;
  return r;
}
function submitCensus(spec, id) {
  var w = S1World(spec);
  var out, threw = null;
  try { out = vm.runInContext('RUN_S1_SUBMIT_READINESS_CENSUS(' + JSON.stringify(id === undefined ? null : id) + ')', w.ctx); }
  catch (e) { threw = e; }
  return { res: out || {}, threw: threw, world: w };
}
function scopeOf(r, sku) {
  var all = (r.res.candidates || []).concat(r.res.rejected || []);
  var hit = null;
  all.forEach(function (c) { if (c.scope && c.scope.sku === sku) hit = c; });
  return hit;
}
function proofOf(row, name) {
  return ((row && row.proofs) || []).filter(function (p) { return p.predicate === name; })[0] || null;
}

// ================================================================================================================
// THE POSITIVE-RESIDUAL WORLD. The readiness suite's default fixture is Route A + Route B MANUAL drafts for
// CO1100-R totalling 520, against a gap. A POSITIVE residual is simply a recommendation LARGER than that.
// ================================================================================================================
var SKU = 'CO1100-R';
var POS = {
  // recommended 900 (furthest window), already planned 520 manually -> residual 380
  gap: { d18_gap_qty: 900, d18_suggested_qty: 900, d30_suggested_qty: 900,
    d45_suggested_qty: 900, d90_gap_qty: 900, d90_suggested_qty: 900 },
  factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 100 }]
};
function pos(over) {
  var d = {};
  Object.keys(POS).forEach(function (k) { d[k] = POS[k]; });
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return d;
}

// ================================================================================================================
section('A — the census runs read-only, and says so in numbers it measured');
// ================================================================================================================

var A = census(pos());
eq(A.threw, null, 'A0  the census does not throw against a positive-residual world');
eq([A.res.dry_run, A.res.writes, A.res.writer_calls], [true, 0, 0],
  'A1  it reports dry_run, zero writes and zero writer calls');
eq([A.res.generate_called, A.res.submit_called, A.res.migration_called], [false, false, false],
  'A1a and that it called neither Generate, nor Submit, nor a migration');
eq(A.world.allWrites(), 0,
  'A1b MEASURED ON THE SHEETS — every table in the world, including the five added here, has zero writes');
eq(A.res.environment.flag_value, false, 'A2  the generation flag is false');
eq(failed(A.res), [], 'A3  no census-level predicate failed', failed(A.res));
ok(A.res.scopes_examined > 0, 'A4  at least one scope was examined', A.res.scopes_examined);
eq(A.res.selected, null, 'A5  NO candidate is selected — that is a person\'s act, not a diagnostic\'s');
eq(A.res.proposal_only, true, 'A5a and the whole result is marked proposal_only');
ok(String(A.res.exposure_equation).indexOf('factory_current_stock - factory_reserved_stock') > 0
  && String(A.res.exposure_equation).indexOf('active_allocation_draft_qty') > 0
  && String(A.res.exposure_equation).indexOf('active_shipping_plan_qty_not_yet_transferred') > 0,
  'A6  the exposure equation is stated in full, all three subtrahends', A.res.exposure_equation);

// THE SOURCE ITSELF CARRIES NO WRITE API. Comments AND string literals are stripped first, because this file
// NAMES writers in prose and in its manifests — a naive scan would find them there and prove nothing.
function bareCode(src) {
  var noBlock = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  var noLine = noBlock.split(NL).map(function (l) {
    var i = -1, q = null;
    for (var k = 0; k < l.length; k++) {
      var ch = l[k];
      if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') { q = ch; continue; }
      if (ch === '/' && l[k + 1] === '/') { i = k; break; }
    }
    return i < 0 ? l : l.slice(0, i);
  }).join(NL);
  return noLine.replace(/'(\\.|[^'\\])*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""');
}
var S1_BARE = bareCode(S1);
['setValue', 'setValues', 'appendRow', 'deleteRow', 'insertSheet', 'deleteSheet', 'setFormula',
 'removeSheet', 'setName', 'LockService'].forEach(function (api, i) {
  ok(S1_BARE.indexOf(api) === -1,
    'A7.' + (i + 1) + ' the census source contains no ' + api + ' (comments and string literals stripped)');
});
ok(S1_BARE.indexOf('inventoryAiPlanDbGenerationEnabled_') > 0,
  'A7a it READS the flag …');
ok(!/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=/.test(S1_BARE),
  'A7b … and never assigns it');
ok(!/INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_\s*=/.test(S1_BARE),
  'A7c nor the activation allowlist');
['handleGenerateWeeklyAiPlanDraft_(', 'weeklyAiPlanGenerateK2_(', 'sadSubmitToShippingPlansCore_(',
 'handleSubmitAllocationDraftsToShippingPlans_(', 'shippingPlanCommitFromLines_(',
 'WeeklyAiPlanControlledAuthority_'].forEach(function (c, i) {
  ok(S1_BARE.indexOf(c) === -1,
    'A8.' + (i + 1) + ' and it never CALLS ' + c.replace('(', '') + ' — it is named in prose only');
});

// ================================================================================================================
section('B — a positive residual is found, and every number comes from the shipped authority');
// ================================================================================================================

var BR = scopeOf(A, SKU);
ok(!!BR, 'B0  the frozen SKU appears in the census output');
eq(BR.scope, { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: SKU },
  'B1  under the exact four-axis identity');
eq(BR.scope_axes, ['company', 'country', 'marketplace', 'sku'],
  'B1a and the axes are all four, never three');
eq(BR.recommendation_state, 'NONZERO_RECOMMENDATION', 'B2  the recommendation state is NONZERO');
eq(BR.recommended_qty, 900, 'B2a recommended 900, from the furthest cumulative window');
eq(BR.qualifying_manual_planned_qty, 520, 'B2b qualifying MANUAL planned 520');
eq(BR.residual_qty, 380, 'B2c residual 380 = 900 - 520, from weeklyAiPlanNoActionDecision_');
eq(BR.no_action_reason, 'RESIDUAL_REMAINS',
  'B2d and production classifies it as RESIDUAL_REMAINS — not a no-action at all');
eq(BR.production_would_no_action, false, 'B2e so production would NOT answer no-action');
eq(BR.qualifying_ai_planned_qty, 0, 'B3  no AI has planned anything for this scope yet');
ok(String(BR.qualifying_ai_planned_authority).indexOf('KMFSG.draftExposure') === 0,
  'B3a and the AI quantity comes from the exposure authority, not a second traversal',
  BR.qualifying_ai_planned_authority);
eq([BR.calculation_date, BR.accepted_date], [GAP_DATE, GAP_DATE],
  'B4  the row belongs to the accepted run\'s date');
ok(/^CURRENT/.test(String(BR.freshness_state)),
  'B4a and the freshness is in the accepting set at the pinned hour', BR.freshness_state);
eq(BR.windows, { D18: 900, D30: 900, D45: 900, D90: 900 },
  'B5  all four cumulative windows are reported as stored');

// THE POOL, AND THE WHOLE EQUATION.
eq([BR.pool.warehouse_id, BR.pool.sku], [WHF, SKU], 'B6  the factory pool is warehouse_id||sku');
eq([BR.pool.factory_current_stock, BR.pool.factory_reserved_stock, BR.pool.factory_available_stock],
  [2000, 100, 1900], 'B6a current 2000 - reserved 100 = physically available 1900');
eq([BR.pool.active_allocation_draft_qty, BR.pool.active_allocation_draft_manual_qty,
  BR.pool.active_allocation_draft_ai_qty], [520, 520, 0],
  'B6b the active draft exposure is 520, ALL of it manual — manual and AI are told apart');
eq(BR.pool.active_shipping_plan_qty, 0, 'B6c no shipping-plan exposure yet');
eq(BR.pool.available_to_allocate, 1380,
  'B6d available_to_allocate = 1900 - 520 - 0 = 1380');
eq(BR.shipment_reservation_exposure.counted_as, 'factory_reserved_stock',
  'B6e the shipment stage is the RESERVED side of the balance, named rather than omitted');

eq(BR.proposed_ai_allocation_qty, 380,
  'B7  the proposal is min(residual 380, available 1380) = 380 — the residual, not the recommendation');
eq(BR.would_clamp, false, 'B7a and nothing is clamped, because the pool covers it');
eq(BR.would_write, true, 'B7b so a controlled Generate WOULD write');
eq(BR.is_candidate, true, 'B8  it is a candidate …');
eq(BR.refusal_reasons, [], 'B8a … with no refusal reason', BR.refusal_reasons);
ok(BR.proofs.length >= 11, 'B8b and it carries its own proofs, individually', BR.proofs.length);
eq(BR.proofs.filter(function (p) { return !p.pass; }), [], 'B8c every one of which passed');

// THE RANKING IS EVIDENCE, NOT A CHOICE.
ok(A.res.ranked.length >= 1, 'B9  a ranked list is returned');
eq(A.res.ranked[0].proposal_only, true, 'B9a and every entry in it is marked proposal_only');
eq(A.res.verdict, 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED',
  'B9b the verdict says candidates exist AND that authorization is still required');

// ================================================================================================================
section('C — the manual rows are protected, and the census can prove which ones');
// ================================================================================================================

eq(BR.protected_manual_identities.length, 2,
  'C1  both manual Route A and Route B lines are listed as protected', BR.protected_manual_identities);
eq(BR.protected_manual_identities.map(function (m) { return m.provenance; }), ['MANUAL', 'MANUAL'],
  'C1a each under MANUAL provenance, from 69_\'s classifier');
ok(BR.protected_manual_identities.every(function (m) { return !!m.allocation_draft_id && !!m.allocation_draft_line_id; }),
  'C1b and each names the exact header AND line identity it is protecting');
eq(BR.ai_exposure_rows, [], 'C2  no AI exposure row exists for this scope yet');
eq(BR.existing_affected_ai_identities, [],
  'C2a so a generation would supersede nothing — an empty list, not an unavailable one');
ok(proofOf(BR, 'no_manual_identity_would_be_overwritten').pass === true,
  'C3  the manual-protection proof holds');

// AND THE RESIDUAL ACCOUNTS FOR THE MANUAL EXPOSURE. If it did not, the proposal would be the whole
// recommendation and the operator would plan 900 units against a standing 520.
eq(BR.recommended_qty - BR.qualifying_manual_planned_qty, BR.residual_qty,
  'C4  residual = recommended - qualifying manual, exactly');
ok(BR.proposed_ai_allocation_qty < BR.recommended_qty,
  'C4a and the proposal is strictly less than the recommendation, because 520 is already planned');

// ================================================================================================================
section('D — an existing AI draft is netted as EXPOSURE and named as a supersede candidate');
// ================================================================================================================

// An AI draft for the SAME scope, from an earlier run. It is NOT counted in the residual (a run supersedes
// its own drafts) but it IS counted in the factory exposure (the cartons are claimed until it is expired).
var AI_HDR = { allocation_draft_id: 'AI-OLD-1', planning_cycle: GAP_CYCLE, company: 'ResUS', country: 'US',
  marketplace: 'Amazon', status: 'draft', generation_type: 'system_generated',
  generation_run_id: 'GEN-OLD', recommended_source_warehouse_id: WHF };
var AI_LN = { allocation_draft_line_id: 'AI-OLD-1-L1', allocation_draft_id: 'AI-OLD-1', sku: SKU,
  source_warehouse_id: WHF, planned_qty: 100, line_status: 'draft' };
var D = census(pos({ extraHeaders: [AI_HDR], extraLines: [AI_LN] }));
var DR = scopeOf(D, SKU);
eq(DR.qualifying_manual_planned_qty, 520,
  'D1  the qualifying MANUAL quantity is UNCHANGED by the AI draft — a run does not net against itself');
eq(DR.residual_qty, 380, 'D1a so the residual is unchanged at 380');
eq(DR.qualifying_ai_planned_qty, 100,
  'D2  while the AI quantity is reported SEPARATELY as 100 — excluded from the residual, never hidden');
eq([DR.pool.active_allocation_draft_manual_qty, DR.pool.active_allocation_draft_ai_qty], [520, 100],
  'D2a and the pool splits the exposure 520 manual / 100 AI');
eq(DR.pool.available_to_allocate, 1280,
  'D2b available falls to 1900 - 620 = 1280, because the AI draft claims real cartons');
eq(DR.proposed_ai_allocation_qty, 380,
  'D3  the proposal is still the residual, since 1280 still covers it');
ok((DR.existing_affected_ai_identities || []).length >= 1,
  'D4  the existing AI identity is named as a supersede candidate', DR.existing_affected_ai_identities);
eq((DR.existing_affected_ai_identities || []).map(function (x) { return x.allocation_draft_id; }), ['AI-OLD-1'],
  'D4a by exact allocation_draft_id');
eq(DR.protected_manual_identities.length, 2, 'D5  and both manual identities are still protected');

// A TERMINAL AI ROW IS HISTORY. It must not be exposure and must not be a supersede candidate.
var DT = census(pos({ extraHeaders: [(function () { var h = {}; Object.keys(AI_HDR).forEach(function (k) { h[k] = AI_HDR[k]; }); h.status = 'submitted'; return h; })()],
  extraLines: [AI_LN] }));
var DTR = scopeOf(DT, SKU);
eq(DTR.qualifying_ai_planned_qty, 0,
  'D6  a SUBMITTED AI draft contributes no AI exposure — it is history');
eq(DTR.pool.available_to_allocate, 1380, 'D6a and the pool is back to 1380');
eq((DTR.existing_affected_ai_identities || []).map(function (x) { return x.allocation_draft_id; }), [],
  'D6b nor is it a supersede candidate');

// ANOTHER SCOPE'S AI DRAFT IS NOT THIS SCOPE'S — but it IS the same factory pool.
var DX = census(pos({ extraHeaders: [(function () { var h = {}; Object.keys(AI_HDR).forEach(function (k) { h[k] = AI_HDR[k]; }); h.allocation_draft_id = 'AI-OTHER'; h.marketplace = 'Walmart'; return h; })()],
  extraLines: [(function () { var l = {}; Object.keys(AI_LN).forEach(function (k) { l[k] = AI_LN[k]; }); l.allocation_draft_line_id = 'AI-OTHER-L1'; l.allocation_draft_id = 'AI-OTHER'; l.planned_qty = 300; return l; })()] }));
var DXR = scopeOf(DX, SKU);
eq(DXR.qualifying_ai_planned_qty, 0,
  'D7  another marketplace\'s AI draft is NOT this scope\'s planned quantity');
eq(DXR.pool.available_to_allocate, 1080,
  'D7a but it IS the same shared factory pool: 1900 - 520 - 300 = 1080');
eq(DXR.pool.active_allocation_draft_ai_qty, 300,
  'D7b the pool counts it, because a carton does not care which marketplace claimed it');
eq(DXR.proposed_ai_allocation_qty, 380, 'D7c the residual still fits, so the proposal is unchanged');

// ================================================================================================================
section('E — the factory pool decides the proposal, and an unreadable pool is never a zero');
// ================================================================================================================

// (1) THE CLAMP. Available below the residual: the proposal follows AVAILABLE, and says it clamped.
var E1 = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 700, fac_reserved_stock: 0 }] })), SKU);
eq([E1.residual_qty, E1.pool.available_to_allocate], [380, 180],
  'E1  residual 380 against available 700 - 520 = 180');
eq([E1.proposed_ai_allocation_qty, E1.would_clamp], [180, true],
  'E1a the proposal is 180 and it declares that it clamped');
eq(E1.is_candidate, true, 'E1b it is still a candidate — a clamp is a legitimate outcome, not a refusal');
ok(proofOf(E1, 'the_proposed_quantity_does_not_exceed_available_to_allocate').pass === true,
  'E1c and the proposal is within availability');

// (2) EXHAUSTED. Available zero or negative: no candidate, and the reason is named.
var E2 = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 520, fac_reserved_stock: 0 }] })), SKU);
eq(E2.pool.available_to_allocate, 0, 'E2  the standing manual plan consumes the whole pool');
eq(E2.is_candidate, false, 'E2a so it is NOT a candidate …');
ok(E2.refusal_reasons.indexOf('available_to_allocate_is_finite_and_greater_than_zero') >= 0,
  'E2b … and the availability condition is named', E2.refusal_reasons);
eq(E2.would_write, false, 'E2c nothing would be written');

// (3) AN EXISTING BREACH IS REPORTED AS THE NEGATIVE NUMBER IT IS, never clamped to zero.
var E3 = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 300, fac_reserved_stock: 0 }] })), SKU);
eq(E3.pool.available_to_allocate, -220,
  'E3  520 already planned against 300 physical is MINUS 220 — the size of the breach is visible');
eq(E3.is_candidate, false, 'E3a and it is refused');
eq(E3.proposed_ai_allocation_qty, 0, 'E3b with a proposal of zero, never a negative allocation');

// (4) NO POOL ROW AT ALL. Not a zero pool — no pool.
var E4 = scopeOf(census(pos({ factory_stock: [] })), SKU);
eq(E4.pool, null, 'E4  an absent factory_stock row yields NO pool object …');
ok(E4.refusal_reasons.indexOf('a_factory_pool_exists_for_this_exact_warehouse_and_sku') >= 0,
  'E4a … and the missing-pool condition is named', E4.refusal_reasons);
eq([E4.proposed_ai_allocation_qty, E4.would_write], [null, false],
  'E4b the proposal is NULL — an unknown pool is never read as an unlimited one, nor as an empty one');

// (5) BLANK / NULL / NON-FINITE STOCK is refused, not coerced.
[['a blank current stock', ''], ['a non-numeric current stock', 'plenty'], ['a null current stock', null]]
  .forEach(function (c, i) {
    var r = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: c[1], fac_reserved_stock: 0 }] })), SKU);
    eq([r.is_candidate, r.would_write], [false, false],
      'E5.' + (i + 1) + ' ' + c[0] + ' → not a candidate, nothing would be written');
  });

// (6) THE POOL IS NOT PARTITIONED BY COMPANY. Another COMPANY's active draft on the same warehouse+SKU
//     reduces what this company may allocate, and that is the whole point of a shared pool.
var E6 = scopeOf(census(pos({
  extraHeaders: [{ allocation_draft_id: 'MAN-OTHERCO', planning_cycle: GAP_CYCLE, company: 'ResEU',
    country: 'DE', marketplace: 'Amazon', status: 'draft', generation_type: 'user_created',
    recommended_source_warehouse_id: WHF }],
  extraLines: [{ allocation_draft_line_id: 'MAN-OTHERCO-L1', allocation_draft_id: 'MAN-OTHERCO', sku: SKU,
    source_warehouse_id: WHF, planned_qty: 900, line_status: 'draft' }] })), SKU);
eq(E6.qualifying_manual_planned_qty, 520,
  'E6  another COMPANY\'s plan is not this scope\'s qualifying plan …');
eq(E6.pool.available_to_allocate, 480,
  'E6a … but it IS the same pool: 1900 - (520 + 900) = 480');
eq(E6.proposed_ai_allocation_qty, 380, 'E6b the residual still fits inside 480');
var E6b = scopeOf(census(pos({
  factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 1000, fac_reserved_stock: 0 }],
  extraHeaders: [{ allocation_draft_id: 'MAN-OTHERCO', planning_cycle: GAP_CYCLE, company: 'ResEU',
    country: 'DE', marketplace: 'Amazon', status: 'draft', generation_type: 'user_created',
    recommended_source_warehouse_id: WHF }],
  extraLines: [{ allocation_draft_line_id: 'MAN-OTHERCO-L1', allocation_draft_id: 'MAN-OTHERCO', sku: SKU,
    source_warehouse_id: WHF, planned_qty: 400, line_status: 'draft' }] })), SKU);
eq(E6b.pool.available_to_allocate, 80, 'E6c 1000 - 520 - 400 = 80 …');
eq([E6b.proposed_ai_allocation_qty, E6b.would_clamp], [80, true],
  'E6d … so the other company\'s claim CLAMPS this one — no ownership partition anywhere');

// (7) A SHIPPING PLAN holds exposure until it is transferred to a shipment, and then stops.
var PLAN_ROW = { shipping_plan_id: 'SP-1', company: 'ResUS', country: 'US', marketplace: 'Amazon',
  source_warehouse_id: WHF, status: 'pending_approval' };
var E7 = scopeOf(census(pos({ plans: [PLAN_ROW],
  plan_lines: [{ shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: SKU, requested_qty: 300 }] })), SKU);
eq(E7.pool.active_shipping_plan_qty, 300, 'E7  a pending-approval plan holds 300 of exposure');
eq(E7.pool.available_to_allocate, 1080, 'E7a so available is 1900 - 520 - 300 = 1080');
var E7b = scopeOf(census(pos({
  plans: [(function () { var p = {}; Object.keys(PLAN_ROW).forEach(function (k) { p[k] = PLAN_ROW[k]; });
    p.transferred_shipment_id = 'SHP-9'; p.transferred_to_shipment_at = '2026-09-08 10:00:00'; return p; })()],
  plan_lines: [{ shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: SKU, requested_qty: 300 }] })), SKU);
eq(E7b.pool.active_shipping_plan_qty, 0,
  'E7b once transferred_shipment_id is stamped the plan STOPS counting …');
eq(E7b.pool.available_to_allocate, 1380,
  'E7c … because those units are inside fac_reserved_stock and already subtracted. No double count.');

// ================================================================================================================
section('F — a scope with no residual, or a recommendation that is not current, is not a candidate');
// ================================================================================================================

// The R6-R7-R5-R1 world itself: recommended 160 against a planned 520. Fully covered, residual zero.
var F1 = scopeOf(census(pos({ gap: { d18_gap_qty: 0, d18_suggested_qty: 0, d30_suggested_qty: 0,
  d45_suggested_qty: 0, d90_gap_qty: 160, d90_suggested_qty: 160 } })), SKU);
eq(F1.residual_qty, 0, 'F1  the proved FULLY_COVERED world has residual 0 …');
eq(F1.is_candidate, false, 'F1a … so it is not a positive-residual candidate');
ok(F1.refusal_reasons.indexOf('residual_qty_is_finite_and_greater_than_zero') >= 0,
  'F1b and the residual condition names itself', F1.refusal_reasons);
eq(F1.no_action_reason, 'FULLY_COVERED_BY_ACTIVE_PLAN',
  'F1c production still classifies it as the proved no-action class — the two rounds agree');

// A BLANK window is MISSING, and MISSING is not zero and not a residual.
var F2 = scopeOf(census(pos({ gap: { d90_suggested_qty: '' } })), SKU);
eq(F2.recommendation_state, 'MISSING_RECOMMENDATION', 'F2  a blank furthest window is MISSING');
eq([F2.residual_qty, F2.is_candidate], [null, false],
  'F2a the residual is NULL and it is not a candidate — a blank is never read as a zero');
ok(F2.refusal_reasons.indexOf('the_recommendation_is_current_and_ready') >= 0,
  'F2b the readiness condition is named', F2.refusal_reasons);

// A non-READY calculation status, TWO WAYS, because they are two different situations and the census answers
// them differently. Measured before being asserted.
//
// (1) THE ONLY ROW IS NOT READY. There is then no complete snapshot at all, so the ACCEPTED RUN is unusable
//     and the whole census STOPs. It does NOT report a per-scope rejection, and it must not: a candidate list
//     measured against a snapshot that does not exist would be a list of nothing dressed as evidence.
[['PENDING', 'PENDING'], ['NONE', 'NONE'], ['BLOCKED', 'BLOCKED']].forEach(function (c, i) {
  var r = census(pos({ gap: { calculation_status: c[1] } }));
  ok(r.res.verdict === 'STOP'
    && failed(r.res).indexOf('the_accepted_run_freshness_is_in_the_accepting_set') >= 0,
    'F3.' + (i + 1) + ' calculation_status ' + c[0] + ' as the ONLY row → the whole census STOPs on the run',
    failed(r.res));
  eq(r.res.candidates, [], 'F3.' + (i + 1) + 'a and it reports no candidate at all');
});

// (2) THE RUN IS USABLE AND THIS ONE SCOPE IS NOT. Another SKU materialized READY makes the snapshot
//     complete, so the run is accepted and the non-READY identity must be REPORTED as a rejection. This is
//     the case that used to vanish: the recommendation authority does not return it, and a census that
//     iterated only what the authority returned never mentioned it.
var READY_OTHER = { sku: 'OTHER-SKU', calculation_status: 'READY', d18_suggested_qty: 0,
  d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 };
[['PENDING', 'PENDING'], ['NONE', 'NONE'], ['BLOCKED', 'BLOCKED']].forEach(function (c, i) {
  var full = census(pos({ gap: { calculation_status: c[1] }, extraGap: [READY_OTHER] }));
  var r = scopeOf(full, SKU);
  ok(!!r, 'F3b.' + (i + 1) + ' a ' + c[0] + ' scope beside a READY one is still REPORTED, not dropped');
  ok(!!r && r.is_candidate === false
    && r.refusal_reasons.indexOf('the_recommendation_is_current_and_ready') >= 0,
    'F3b.' + (i + 1) + 'a and it is refused, naming readiness', r && r.refusal_reasons);
  ok(!!r && r.recommendation_state === 'MISSING_RECOMMENDATION' && r.residual_qty === null,
    'F3b.' + (i + 1) + 'b as MISSING_RECOMMENDATION with a NULL residual — never a zero',
    r && [r.recommendation_state, r.residual_qty]);
  ok(full.res.scopes_examined >= 2,
    'F3b.' + (i + 1) + 'c and the examined count includes it', full.res.scopes_examined);
});

// A MIXED-DATE SNAPSHOT IS CAUGHT EARLIER AND HARDER. Two rows for one (company, country) at two dates is a
// PARTIAL snapshot, and the freshness authority blocks the whole pair — measured. So the census STOPs on the
// ACCEPTED RUN and never forms a per-scope opinion, which is the stricter of the two possible answers.
var Y_DATE = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
var F3c = census(pos({ gap: { calculation_date: Y_DATE },
  extraGap: [{ sku: 'OTHER-SKU', calculation_status: 'READY', d18_suggested_qty: 0, d30_suggested_qty: 0,
    d45_suggested_qty: 0, d90_suggested_qty: 0 }] }));
eq(F3c.res.verdict, 'STOP', 'F3c a mixed-date snapshot STOPS the census …');
eq(F3c.res.accepted_run.freshness_state, 'PARTIAL_SNAPSHOT_BLOCKED',
  'F3c1 … under the freshness authority\'s own PARTIAL_SNAPSHOT_BLOCKED state');
eq([F3c.res.candidates, F3c.res.ranked], [[], []],
  'F3c2 with no candidate and no ranking — an incomplete snapshot yields no evidence, not weak evidence');
eq(F3c.res.selected, null, 'F3c3 and nothing selected');

// THE UNIVERSE ACCOUNTING IS A NET BEHIND THAT GATE, and this says so rather than implying a probe exists.
// It exists so that if the authority ever returns a narrower set than the table holds — a widened allowlist,
// a new exclusion rule — the identities it drops are REPORTED instead of vanishing.
var S1_SRC_TXT = S1;
ok(S1_SRC_TXT.indexOf('NOTHING DISAPPEARS') > 0,
  'F3d the census carries an explicit accounting for identities the authority does not return');
ok(S1_SRC_TXT.indexOf('excluded_by_the_recommendation_authority: true') > 0,
  'F3d1 which marks them, rather than omitting them');
ok(S1_SRC_TXT.indexOf('out.scopes_examined = out.candidates.length + out.rejected.length;') > 0,
  'F3d2 and the examined count is the sum of both lists, so it cannot exceed what is reported');
// THE TWO MALFORMED-IDENTITY PATHS THAT ARE REACHABLE.
var F3e = census(pos({ extraGap: [{ sku: '', calculation_status: 'READY', d18_suggested_qty: 0,
  d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 }] }));
ok(F3e.res.scope_universe.malformed_identity_rows >= 1,
  'F3e a gap row with no SKU is COUNTED as a malformed identity, not skipped',
  F3e.res.scope_universe.malformed_identity_rows);
ok(F3e.res.verdict === 'STOP'
  && failed(F3e.res).indexOf('every_gap_row_carries_a_complete_four_axis_identity') >= 0,
  'F3e1 and it STOPS the census, because a row nobody can identify is not a row nobody needs',
  failed(F3e.res));

// AN OVERDUE SNAPSHOT. Same rows, later hour: the whole census refuses rather than reporting candidates
// against a run the freshness authority no longer accepts.
var F4 = census(pos({ gap: { calculation_date: new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10) },
  pinHour: 20 }));
eq(F4.res.verdict, 'STOP', 'F4  past the completion window, a yesterday-only snapshot STOPS the census');
ok(failed(F4.res).indexOf('the_accepted_run_freshness_is_in_the_accepting_set') >= 0,
  'F4a naming the freshness gate', failed(F4.res));
eq(F4.res.candidates, [], 'F4b and no candidate is reported at all');
// THE OTHER SIDE OF THE SAME BOUNDARY, so neither half becomes the whole rule.
var F4b = census(pos({ gap: { calculation_date: new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10) },
  pinHour: 15 }));
ok(/^CURRENT/.test(String(F4b.res.accepted_run.freshness_state)),
  'F4c while INSIDE the refresh window the same snapshot is accepted — R4-A2-R1 §4 stays fixed',
  F4b.res.accepted_run.freshness_state);

// THE FLAG MUST BE FALSE. A census run with generation already on is not evidence for authorizing it.
var F5 = census(pos({ flag: true }));
eq(F5.res.verdict, 'STOP', 'F5  a census run with the flag already TRUE refuses');
ok(failed(F5.res).indexOf('the_generation_flag_is_false') >= 0,
  'F5a naming the flag', failed(F5.res));

// ================================================================================================================
section('G — Submit readiness is a SEPARATE census with a SEPARATE verdict');
// ================================================================================================================

var G0 = submitCensus(pos());
eq(G0.threw, null, 'G0  the submit census does not throw with no draft named');
eq(G0.res.verdict, 'CONTRACT_ONLY_NO_DRAFT_NAMED',
  'G1  with no allocation_draft_id it reports the CONTRACT and says so — not a readiness verdict');
eq([G0.res.writes, G0.res.writer_calls, G0.res.submit_called], [0, 0, false],
  'G1a zero writes, zero writer calls, Submit not called');
eq(G0.world.allWrites(), 0, 'G1b measured on the sheets');
ok(String(G0.res.stop_reason).indexOf('authorizes nothing') > 0,
  'G1c and it states that it authorizes nothing', G0.res.stop_reason);

// THE AUTHORITY IS NAMED, AND IT EXISTS.
eq(G0.res.submit_authority.router_action, 'submitAllocationDraftsToShippingPlans',
  'G2  the router action is named');
ok(String(G0.res.submit_authority.core).indexOf('sadSubmitToShippingPlansCore_') === 0,
  'G2a the core is named');
ok(String(G0.res.submit_authority.plan_writer).indexOf('shippingPlanCommitFromLines_') === 0,
  'G2b and the ONE shipping_plans authority is named');

// EVERY REFUSAL CODE THE CENSUS ADVERTISES MUST EXIST IN THE SHIPPED SUBMIT AUTHORITY. A manifest that
// listed a refusal the runtime cannot produce would be describing a safety net that is not there.
var G16_SRC = G16;
G0.res.submit_authority.refusals.forEach(function (code, i) {
  ok(G16_SRC.indexOf(code) >= 0,
    'G3.' + (i + 1) + ' the refusal ' + code + ' exists in 16_\'s source');
});

// THE EXPOSURE INVARIANT, IN THE CENSUS'S OWN WORDS AND BOUND TO THE RUNTIME.
var GE = G0.res.exposure_equation;
ok(String(GE.before_submit).indexOf('active_allocation_draft_qty') > 0
  && String(GE.before_submit).indexOf('does not include it') > 0,
  'G4  before Submit: the draft counts and the plan does not');
ok(String(GE.during_submit).indexOf('ONE ScriptLock') === 0
  && String(GE.during_submit).indexOf('ONLY THEN') > 0,
  'G4a during: one lock, plan committed and read back BEFORE the draft transitions');
ok(String(GE.after_submit).indexOf('TERMINAL') > 0
  && String(GE.after_submit).indexOf('disjoint BY STATUS') > 0,
  'G4b after: `submitted` is terminal, and the two sets are disjoint by status');
ok(String(GE.after_transfer_to_shipment).indexOf('transferred_shipment_id') > 0
  && String(GE.after_transfer_to_shipment).indexOf('factory_reserved_stock') > 0,
  'G4c after transfer: the plan stops counting and the reservation becomes the authority');
eq(GE.reservation_owner.indexOf('shipment ONLY'), 0,
  'G4d and the ONLY reservation owner is a shipment');
// Bound to the runtime rather than asserted: 16_ really does transition AFTER the commit, and `submitted`
// really is in its terminal set.
ok(G16_SRC.indexOf('SAD_TERMINAL_STATUSES_') >= 0, 'G5  16_ defines a terminal-status set …');
var SADT = vm.runInNewContext(extractVar(G16_SRC, 'SAD_TERMINAL_STATUSES_') + ' SAD_TERMINAL_STATUSES_');
eq(SADT.submitted, 1, 'G5a … and `submitted` is in it, which is what makes the two sets disjoint');
ok(G16_SRC.indexOf('TRANSITION not-yet-submitted drafts') > 0
  && G16_SRC.indexOf('ONLY after durable plan commit') > 0,
  'G5b and 16_ states the order the census claims');

// ---- A NAMED DRAFT, measured against the gates. ---------------------------------------------------------
// The lineage and the destination are REQUIRED by the shipped Submit core for a system-generated draft, so a
// fixture without them is refused for the right reason. Supplied, so the negatives below isolate one gate.
var SUB_HDR = { allocation_draft_id: 'AI-NEW-1', planning_cycle: GAP_CYCLE, company: 'ResUS', country: 'US',
  marketplace: 'Amazon', status: 'draft', generation_type: 'system_generated', generation_run_id: 'GEN-NEW',
  recommended_source_warehouse_id: WHF, recommended_source_warehouse_code_snapshot: 'CNYOUXIN',
  calculation_run_id: 'GAP-INV-20260905-0300', formula_version: 'WEEKLY_AI_PLAN_V1',
  destination_marketplace: 'Amazon', destination_warehouse_id: '', shipping_method: 'SEA',
  last_mile_delivery: 'PARTNER_CARRIER', created_by: 'system', created_at: '2026-09-08 10:00:00' };
var SUB_LN = { allocation_draft_line_id: 'AI-NEW-1-L1', allocation_draft_id: 'AI-NEW-1', sku: SKU,
  source_warehouse_id: WHF, planned_qty: 380, line_status: 'draft' };
function subWorld(hOver, lOver) {
  var h = {}; Object.keys(SUB_HDR).forEach(function (k) { h[k] = SUB_HDR[k]; });
  Object.keys(hOver || {}).forEach(function (k) { h[k] = hOver[k]; });
  var l = {}; Object.keys(SUB_LN).forEach(function (k) { l[k] = SUB_LN[k]; });
  Object.keys(lOver || {}).forEach(function (k) { l[k] = lOver[k]; });
  return pos({ extraHeaders: [h], extraLines: [l] });
}
var G6 = submitCensus(subWorld({ draft_version: '1' }), 'AI-NEW-1');
eq(G6.threw, null, 'G6  the submit census runs against a named draft');
eq(G6.res.allocation_draft_id, 'AI-NEW-1', 'G6a and echoes the identity it was asked about');
eq([G6.res.draft.status, G6.res.draft.provenance], ['draft', 'AI'],
  'G6b reading the status and the provenance from the row');
eq([G6.res.draft.shippable_line_count, G6.res.draft.total_planned_qty], [1, 380],
  'G6c one shippable line totalling 380');
eq(G6.res.expected_shipping_plan.expected_total_requested_qty, 380,
  'G7  the expected plan total equals the draft total, exactly');
eq(G6.res.expected_shipping_plan.expected_source_rows_transitioned,
  [{ allocation_draft_id: 'AI-NEW-1', from_status: 'draft', to_status: 'submitted', is_terminal_after: true }],
  'G7a and exactly ONE source row transitions, to a terminal status');
eq(G6.res.expected_shipping_plan.before_after_exposure.delta_total_exposure, 0,
  'G7b with a total exposure delta of ZERO — the quantity moves stage, it is not created');
eq([G6.res.expected_shipping_plan.before_after_exposure.before.active_allocation_draft_qty_includes_this_draft,
  G6.res.expected_shipping_plan.before_after_exposure.after.active_allocation_draft_qty_includes_this_draft],
  [true, false], 'G7c the draft counts before and not after');
eq([G6.res.expected_shipping_plan.before_after_exposure.before.active_shipping_plan_qty_includes_this,
  G6.res.expected_shipping_plan.before_after_exposure.after.active_shipping_plan_qty_includes_this],
  [false, true], 'G7d and the plan counts after and not before');
ok(G6.res.expected_shipping_plan.natural_key_dimensions.length === 9,
  'G8  the plan natural key is the nine dimensions 11_ groups on', G6.res.expected_shipping_plan.natural_key_dimensions);
ok(String(G6.res.expected_shipping_plan.natural_key_authority).indexOf('does NOT compute a plan id') > 0,
  'G8a and the census refuses to predict a plan id, because the writer mints it');
eq(G6.res.verdict, 'SUBMIT_READY_AUTHORIZATION_REQUIRED',
  'G9  the verdict says ready AND that authorization is still required');
eq(failed(G6.res), [], 'G9a with no failed predicate', failed(G6.res));

// ---- THE SUBMIT NEGATIVES. ------------------------------------------------------------------------------
[['a CANCELLED draft', { status: 'cancelled', draft_version: '1' }, {}, 'the_draft_is_not_terminal'],
 ['an EXPIRED draft', { status: 'expired', draft_version: '1' }, {}, 'the_draft_is_not_terminal'],
 ['an ALREADY SUBMITTED draft', { status: 'submitted', draft_version: '1' }, {}, 'the_draft_is_not_terminal'],
 ['an unknown status', { status: 'weird_state', draft_version: '1' }, {}, 'the_draft_status_is_submittable'],
 ['no draft_version at all', { draft_version: '' }, {}, 'the_expected_draft_version_is_known'],
 ['a zero planned quantity', { draft_version: '1' }, { planned_qty: 0 },
  'the_draft_has_at_least_one_positive_shippable_line'],
 ['a blank planned quantity', { draft_version: '1' }, { planned_qty: '' },
  'the_draft_has_at_least_one_positive_shippable_line'],
 ['a terminal line status', { draft_version: '1' }, { line_status: 'cancelled' },
  'the_draft_has_at_least_one_positive_shippable_line'],
 ['a line with no id', { draft_version: '1' }, { allocation_draft_line_id: '' },
  'every_shippable_line_carries_an_id'],
 ['a system draft with no calculation lineage', { draft_version: '1', calculation_run_id: '', formula_version: '' }, {},
  'the_provenance_the_core_demands_is_present']
].forEach(function (c, i) {
  var r = submitCensus(subWorld(c[1], c[2]), 'AI-NEW-1');
  ok(r.res.verdict === 'STOP' && failed(r.res).indexOf(c[3]) >= 0,
    'G10.' + (i + 1) + ' ' + c[0] + ' → STOP, naming ' + c[3], failed(r.res));
  eq(r.world.allWrites(), 0, 'G10.' + (i + 1) + 'a and still zero writes');
});
var G11 = submitCensus(pos(), 'NO-SUCH-DRAFT');
ok(G11.res.verdict === 'STOP' && failed(G11.res).indexOf('the_named_allocation_draft_exists') >= 0,
  'G11 a draft that does not exist is a named refusal, not an empty success', failed(G11.res));

// ================================================================================================================
section('H — two manifests, two authorizations, and neither implies the other');
// ================================================================================================================

var W0 = S1World(pos());
var MP = vm.runInContext('RUN_S1_MANIFEST_P()', W0.ctx);
var MS = vm.runInContext('RUN_S1_MANIFEST_S()', W0.ctx);
eq([MP.dry_run, MP.writes, MS.dry_run, MS.writes], [true, 0, true, 0],
  'H1  both manifests are dry-run with zero writes');
eq(W0.allWrites(), 0, 'H1a and producing them wrote nothing');
ok(String(MP.manifest).indexOf('MANIFEST P') === 0 && String(MS.manifest).indexOf('MANIFEST S') === 0,
  'H2  they are separately named');
ok(String(MP.boundary_note).indexOf('does NOT authorize MANIFEST S') > 0,
  'H3  P states in its own text that it does not authorize S', MP.boundary_note);
ok(String(MS.boundary_note).indexOf('INDEPENDENT of MANIFEST P') > 0,
  'H3a and S states that it is independent of P');
ok(MP.does_not_authorize.filter(function (x) { return /MANIFEST S/.test(x); }).length === 1,
  'H3b P lists Submit among the things it does not authorize', MP.does_not_authorize);
['Pending Approval', 'Confirm Overage'].forEach(function (x, i) {
  ok(MP.does_not_authorize.filter(function (y) { return y.indexOf(x) >= 0; }).length === 1,
    'H3c.' + (i + 1) + ' and so is ' + x);
  ok(MS.does_not_authorize.filter(function (y) { return y.indexOf(x) >= 0; }).length === 1,
    'H3d.' + (i + 1) + ' in S as well');
});
ok(MS.does_not_authorize.filter(function (x) { return /Shipment/.test(x); }).length >= 1,
  'H3e S does not authorize any Shipment');
ok(String(MS.boundary_note).indexOf('separate approval before any Shipment') > 0,
  'H3f and it says the resulting plan still needs its own approval');

// THE EXPECTED OUTCOMES ARE NUMBERS, so a readback can disagree with them.
eq([MP.expected_outcome.reservations, MP.expected_outcome.factory_stock_change,
  MP.expected_outcome.manual_rows_changed, MP.expected_outcome.other_scope_rows_changed,
  MP.expected_outcome.shipping_plans_changed, MP.expected_outcome.shipments_changed],
  [0, 0, 0, 0, 0, 0], 'H4  MANIFEST P expects zero of every side effect it must not have');
eq([MS.expected_outcome.total_exposure_delta, MS.expected_outcome.reservations,
  MS.expected_outcome.factory_stock_change, MS.expected_outcome.shipments_created],
  [0, 0, 0, 0], 'H4a MANIFEST S expects an exposure delta of zero and no reservation or shipment');
ok(String(MP.refusal_is_success_too).indexOf('zero writes is a') > 0,
  'H5  P states that a guard STOP with zero writes is a CORRECT outcome, not a failure');

// THE ROLLBACKS ARE COMPLETE, AND THEY NAME REAL MECHANISMS.
eq([MP.rollback.complete, MS.rollback.complete], [true, true], 'H6  both rollbacks are marked complete');
[['generate', MP.rollback, ['aiplExpirationCandidates_', 'PASS 1', 'ACK_UNKNOWN']],
 ['submit', MS.rollback, ['shippingPlanCommitFromLines_', 'execution_key', 'POSTCHECK_FAILED_ROLLBACK_UNVERIFIED']]]
  .forEach(function (c) {
    var blob = JSON.stringify(c[1]);
    c[2].forEach(function (needle, i) {
      ok(blob.indexOf(needle) >= 0,
        'H6.' + c[0] + '.' + (i + 1) + ' the ' + c[0] + ' rollback names ' + needle);
    });
  });
// And those mechanisms exist in the shipped source, so the rollback is not a description of a wish.
ok(read(GS + '69_api_v1_ai_plan_lifecycle.gs').indexOf('function aiplExpirationCandidates_') > 0,
  'H7  aiplExpirationCandidates_ exists in 69_');
ok(G16_SRC.indexOf('journalExtra') > 0 && G16_SRC.indexOf('draft_before') > 0,
  'H7a 16_ really does bind a journal with the draft before-state');
ok(G16_SRC.indexOf('POSTCHECK_FAILED_ROLLBACK_UNVERIFIED') > 0,
  'H7b and it really does have an INDETERMINATE outcome that is not reported as success');
ok(read('assets/js/pages/inventory-replenishment.js').indexOf('ACK_UNKNOWN') > 0,
  'H7c the browser really does hold an ACK_UNKNOWN outcome');

// THE OPERATOR WORDING. It must name the scope, the numbers, and what it does NOT authorize.
['<company>', '<country>', '<marketplace>', '<sku>', '<residual_qty>', '<available_to_allocate>',
 'IT DOES NOT AUTHORIZE SUBMIT'].forEach(function (t, i) {
  ok(MP.operator_authorization_wording.indexOf(t) >= 0,
    'H8.' + (i + 1) + ' P\'s wording contains ' + t);
});
['<allocation_draft_id>', '<draft_version>', '<execution_key>', '<total_planned_qty>',
 'ACK_UNKNOWN', 'IT DOES NOT ' + 'AUTHORIZE APPROVAL'].forEach(function (t, i) {
  ok(MS.operator_authorization_wording.indexOf(t) >= 0,
    'H9.' + (i + 1) + ' S\'s wording contains ' + t);
});
ok(MP.operator_authorization_wording.indexOf('exactly this one scope') > 0,
  'H8a P\'s wording pins the allowlist to one scope');
ok(MS.operator_authorization_wording.indexOf('never by') > 0
  && MS.operator_authorization_wording.indexOf('retrying') > 0,
  'H9a and S\'s wording forbids retrying a timeout');

// ================================================================================================================
section('R — S1-R1: the eligible pair universe, and evidence that fits in its own log');
// ================================================================================================================
//
// PRODUCTION SAID STOP, AND IT WAS THIS FILE'S FAULT — with the reason unreadable, which made it worse.
//
//   failed = ["the_accepted_inventory_gap_run_is_readable_for_every_pair"]   ← the ONLY one
//   Logger  = "Logging output too large. Truncating output."
//
// The two predicates either side of it PASSED, and that combination is diagnostic on its own: at least one
// pair was readable AND accepting, and at least one other pair was not readable. A census that requires
// EVERY (company, country) pair in inventory_replenishment_gap to be readable is asking for something
// production has never required and cannot require — handleGenerateWeeklyAiPlanDraft_ demands a company AND
// a country and refuses without them, and weeklyAiPlanCanonicalDemand_ narrows to that pair BEFORE it
// resolves which snapshot date is accepted. Another company's stale rows in the same table were vetoing a
// scope they can never affect.
//
// AND THE LOG. S1_CHUNK_MAX_BYTES_ was 45000 against a sibling census that has shipped 3000 for rounds, with
// the whole per-module deployment manifest inside the same payload. The pair-level reasons existed and could
// not be read, which is the same as not having produced them.

function gapDiag(spec) {
  var w = S1World(spec);
  var out, threw = null;
  try { out = vm.runInContext('RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC()', w.ctx); }
  catch (e) { threw = e; }
  return { res: out || {}, threw: threw, world: w };
}
function logTags(w) {
  return (w.log || []).map(function (l) {
    var t = String(l).replace(/^\[S1\] /, '');
    var sp = t.indexOf(' ');
    return sp < 0 ? t : t.slice(0, sp);
  });
}
function maxLogBytes(w) {
  return (w.log || []).reduce(function (m, l) { return Math.max(m, String(l).length); }, 0);
}

// A pair no allowlist entry names, whose rows belong to an OLDER planning cycle. This is the production
// shape: readable for the eligible pair, unreadable for a foreign one.
var FOREIGN_PAIR = { company: 'ResEU', country: 'DE', marketplace: 'Amazon', sku: 'OTHER-SKU',
  calculation_status: 'READY', calculation_date: '2026-08-01',
  d18_suggested_qty: 0, d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 };

// ---- R1  THE DIAGNOSTIC IS READ ONLY, AND MEASURED SO. --------------------------------------------------
var R1 = gapDiag(pos({ extraGap: [FOREIGN_PAIR] }));
eq(R1.threw, null, 'R1  the readability diagnostic does not throw');
eq([R1.res.dry_run, R1.res.writes, R1.res.writer_calls], [true, 0, 0],
  'R1a dry_run, zero writes, zero writer calls');
eq([R1.res.generate_called, R1.res.submit_called, R1.res.migration_called, R1.res.refresh_started],
  [false, false, false, false],
  'R1b Generate, Submit, migration and refresh were all NOT called');
eq(R1.world.allWrites(), 0, 'R1c measured on every sheet in the world');

// ---- R2  THE LOG FITS. Four segments, one line per pair, and nothing near a limit. ---------------------
var R2tags = logTags(R1.world);
eq(R2tags, ['s1_gap_readability_summary', 's1_gap_pair_1_of_2', 's1_gap_pair_2_of_2',
  's1_gap_scope_1_of_1', 's1_gap_readability_verdict'],
  'R2  the four required segments, with ONE line per pair and one per eligible scope', R2tags);
ok(maxLogBytes(R1.world) < 3000,
  'R2a and the largest entry is under the chunk bound the sibling census proved', maxLogBytes(R1.world));
ok(R2tags.indexOf('s1_gap_failed') === -1,
  'R2b s1_gap_failed is emitted only when something failed — an empty failure line is noise');
// THE MANIFEST IS NOT IN THERE. That is what truncated the evidence the first time.
ok((R1.world.log || []).every(function (l) { return String(l).indexOf('WAP_BUILD_VERSION_') === -1; }),
  'R2c no per-module deployment row appears in any log entry');
eq(vm.runInContext('S1_CHUNK_MAX_BYTES_', R1.world.ctx), 3000,
  'R2d and the payload chunk bound is 3000, not the unmeasured 45000');

// ---- R3  THE ELIGIBLE UNIVERSE IS THE ALLOWLIST'S, AND IT AGREES WITH PRODUCTION'S OWN ANSWER. ----------
eq(R1.res.eligible.eligible_pairs, ['ResUS|US'],
  'R3  the eligible pair universe is exactly the allowlist\'s distinct (company, country)');
eq(R1.res.eligible.eligible_scopes, [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: SKU }],
  'R3a with the four-axis scopes it came from');
ok(String(R1.res.eligible.authority).indexOf('inventoryAiPlanActivationAllowlist_') === 0,
  'R3b named as the allowlist authority, re-gated per entry', R1.res.eligible.authority);
// BOUND TO PRODUCTION: weeklyAiPlanTargetScopes_ must answer with the same scopes for that pair.
var R3prod = vm.runInContext('weeklyAiPlanTargetScopes_({ company: "ResUS", country: "US", planningCycle: gapCalcResolveContext_().planningCycle }, "")', R1.world.ctx);
eq([R3prod.ok, R3prod.scopes], [true, [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: SKU }]],
  'R3c and PRODUCTION\'s own weeklyAiPlanTargetScopes_ returns the same scope set');
var R3other = vm.runInContext('weeklyAiPlanTargetScopes_({ company: "ResEU", country: "DE", planningCycle: gapCalcResolveContext_().planningCycle }, "")', R1.world.ctx);
eq([R3other.ok, R3other.reason], [false, 'AI_PLAN_SCOPE_NOT_ENABLED'],
  'R3d while the foreign pair is NOT a scope production would write — so its readability cannot gate this');

// ---- R4  THE REPRODUCTION, CLASSIFIED. ------------------------------------------------------------------
var R4 = R1.res.pairs.filter(function (p) { return p.pair === 'ResEU|DE'; })[0];
var R4e = R1.res.pairs.filter(function (p) { return p.pair === 'ResUS|US'; })[0];
eq([R4.eligible, R4.readable], [false, false], 'R4  the foreign pair is NOT eligible and NOT readable');
eq(R4.unreadable_reason, 'LINEAGE_MISMATCH', 'R4a its reason is named, not inferred');
ok(String(R4.freshness_reason).indexOf('RECO-2026-08') >= 0,
  'R4b with the freshness authority\'s OWN sentence, which is the useful part', R4.freshness_reason);
eq([R4.gap_row_count, R4.distinct_dates, R4.calculation_statuses], [1, ['2026-08-01'], ['READY']],
  'R4c and its row count, dates and statuses are on the same line');
eq([R4e.eligible, R4e.readable, R4e.freshness_state], [true, true, 'CURRENT_AFTER_REFRESH'],
  'R4d while the ELIGIBLE pair is readable and current');
eq([R1.res.verdict, R1.res.root_cause_class],
  ['ELIGIBLE_PAIRS_READABLE', 'DIAGNOSTIC_UNIVERSE_TOO_WIDE'],
  'R4e so the root cause is classified as this census\'s own too-wide universe');
ok(String(R1.res.next_action).indexOf('outside the activation allowlist') > 0,
  'R4f and the next action says why, naming the pair', R1.res.next_action);
eq(R1.res.failed_predicates, [], 'R4g with no failed predicate — nothing about the data is blocking');

// ---- R5  FAIL-CLOSED IS PRESERVED. An ELIGIBLE pair that cannot be read still STOPS. --------------------
var R5 = gapDiag(pos({ gap: { calculation_date: '2026-08-01' } }));
eq([R5.res.verdict, R5.res.root_cause_class], ['STOP', 'DATA_NOT_READY'],
  'R5  an ELIGIBLE pair the authority cannot read is DATA_NOT_READY and a STOP');
ok(R5.res.failed_predicates.indexOf('the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair') >= 0,
  'R5a naming the eligible-pair readability gate', R5.res.failed_predicates);
eq(R5.res.eligible_unreadable, ['ResUS|US'], 'R5b and naming WHICH eligible pair');
ok(String(R5.res.next_action).indexOf('not this file') > 0
  && String(R5.res.next_action).indexOf('Do not start it from here') > 0,
  'R5c the next action sends it to the Gap Job and forbids starting one here', R5.res.next_action);
ok(logTags(R5.world).indexOf('s1_gap_failed') >= 0,
  'R5d and NOW the failure segment is emitted');

// AN ELIGIBLE PAIR WITH NO ROW AT ALL is a different fact, and it is also DATA_NOT_READY.
var R6 = gapDiag(pos({ dropGap: true, extraGap: [FOREIGN_PAIR] }));
eq([R6.res.verdict, R6.res.root_cause_class], ['STOP', 'DATA_NOT_READY'],
  'R6  an eligible pair with NO gap row is DATA_NOT_READY, not an empty scope');
ok(R6.res.failed_predicates.indexOf('every_eligible_pair_has_rows_in_the_inventory_gap_table') >= 0,
  'R6a under its own predicate', R6.res.failed_predicates);

// ---- R7  ELIGIBILITY UNKNOWN MEANS NOTHING IS ASSUMED. -------------------------------------------------
var R7 = gapDiag(pos({ allowlist: [], extraGap: [FOREIGN_PAIR] }));
eq([R7.res.verdict, R7.res.root_cause_class], ['STOP', 'SCOPE_GUARD_UNAVAILABLE'],
  'R7  an empty allowlist cannot decide eligibility, so the diagnostic refuses');
ok(R7.res.failed_predicates.indexOf('the_eligible_pair_universe_is_derived_from_the_activation_allowlist') >= 0,
  'R7a naming the universe gate', R7.res.failed_predicates);
ok(String(R7.res.next_action).indexOf('Nothing is') >= 0
  || String(R7.res.next_action).indexOf('nothing is') >= 0,
  'R7b and stating that nothing is assumed while eligibility is unknown', R7.res.next_action);
eq(R7.res.pairs, [], 'R7c with no pair verdict at all — an unknown universe yields no pair opinions');

// ---- R8  THE FOUR WINDOWS, PER ELIGIBLE SCOPE, STORED OR NOT. ------------------------------------------
var R8 = R1.res.scopes[0];
eq(R8.scope, 'ResUS|US|Amazon|' + SKU, 'R8  the eligible scope is reported at four-axis identity');
eq(R8.windows_stored, { D18: 900, D30: 900, D45: 900, D90: 900 },
  'R8a with all four cumulative windows as STORED');
eq([R8.windows_missing, R8.windows_non_finite, R8.windows_negative], [[], [], []],
  'R8b none missing, none non-finite, none negative');
eq([R8.all_four_stored_finite_nonnegative, R8.calculation_status, R8.recommendation_state],
  [true, 'READY', 'NONZERO_RECOMMENDATION'], 'R8c and the summary flag, status and state agree');
// A BLANK WINDOW IS REPORTED AS NON-FINITE, never as a zero.
var R8b = gapDiag(pos({ gap: { d45_suggested_qty: '' } })).res.scopes[0];
eq([R8b.windows_non_finite, R8b.all_four_stored_finite_nonnegative], [['D45'], false],
  'R8d a blank window is NON-FINITE and the flag falls — a blank is never a zero', R8b && R8b.windows_stored);
var R8c = gapDiag(pos({ gap: { d30_suggested_qty: -5 } })).res.scopes[0];
eq([R8c.windows_negative, R8c.all_four_stored_finite_nonnegative], [['D30'], false],
  'R8e and a negative window is reported as negative');

// ---- R9  THE CENSUS ITSELF: a foreign unreadable pair no longer vetoes, and is still REPORTED. ----------
var R9 = census(pos({ extraGap: [FOREIGN_PAIR] }));
eq(R9.res.verdict, 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED',
  'R9  the production shape now reaches a candidate verdict');
eq(failed(R9.res), [], 'R9a with no failed predicate', failed(R9.res));
eq(R9.res.eligible_universe.eligible_pairs, ['ResUS|US'], 'R9b eligible universe = the allowlist pair');
eq(R9.res.eligible_universe.gap_table_pairs, ['ResEU|DE', 'ResUS|US'],
  'R9c while BOTH table pairs are still enumerated — nothing is hidden');
eq(R9.res.non_eligible_unreadable_pairs, ['ResEU|DE'],
  'R9d and the unreadable foreign pair is REPORTED, just not allowed to veto');
eq(R9.res.pair_readability.map(function (p) { return [p.pair, p.eligible, p.readable]; }),
  [['ResEU|DE', false, false], ['ResUS|US', true, true]],
  'R9e per-pair readability is carried for every pair in the table');
var R9c = scopeOf(R9, SKU);
eq([R9c.is_candidate, R9c.residual_qty, R9c.proposed_ai_allocation_qty], [true, 380, 380],
  'R9f and the eligible scope is a candidate with the same numbers as before');
// A NON-ELIGIBLE identity is never a candidate and never a rejection in these lists — it is reported at
// PAIR grain instead, because per-identity candidacy for a scope nobody authorized is a meaningless claim.
eq(R9.res.candidates.concat(R9.res.rejected).filter(function (r) {
  return r.scope && r.scope.company === 'ResEU'; }), [],
  'R9g no foreign identity enters the candidate or rejection lists');

// ---- R10 AND THE FAIL-CLOSED HALF OF THE SAME CHANGE. --------------------------------------------------
var R10 = census(pos({ gap: { calculation_date: '2026-08-01' } }));
eq(R10.res.verdict, 'STOP',
  'R10 an ELIGIBLE pair the authority cannot read still STOPS the census');
ok(failed(R10.res).indexOf('the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair') >= 0,
  'R10a naming the eligible-pair gate', failed(R10.res));
eq([R10.res.candidates, R10.res.scopes_examined], [[], 0],
  'R10b with no candidate and nothing examined');
var R10c = census(pos({ allowlist: [], extraGap: [FOREIGN_PAIR] }));
eq(R10c.res.verdict, 'STOP', 'R10c an empty allowlist STOPS the census too');
ok(failed(R10c.res).indexOf('the_eligible_pair_universe_is_derived_from_the_activation_allowlist') >= 0,
  'R10d naming the universe gate rather than proceeding on the whole table', failed(R10c.res));

// ---- R11 THE RUN ID COMES FROM ITS OWN AUTHORITY. ------------------------------------------------------
// inventory_replenishment_gap has NO calculation_run_id column (43_ INV_GAP_HEADERS_), so reading it off the
// row reported null for everything and made a resolvable run id look unknown.
var R11cols = vm.runInNewContext(extractVar(read(GS + '43_api_v1_gap_materialization.gs'), 'INV_GAP_HEADERS_')
  + ' INV_GAP_HEADERS_');
eq(R11cols.indexOf('calculation_run_id'), -1,
  'R11 the gap table genuinely has no calculation_run_id column');
eq(R9.res.accepted_run.lineage.run_id, 'GAP-INV-20260905-0300',
  'R11a and the census reports the run id from weeklyAiPlanResolveGapRunLineage_');
ok(String(R9.res.accepted_run.lineage.authority).indexOf('GAP_JOB_INVENTORY') > 0,
  'R11b naming the script property it actually came from', R9.res.accepted_run.lineage.authority);
eq(R9c.calculation_run_id, 'GAP-INV-20260905-0300',
  'R11c so a candidate row carries a real run id instead of a null');
eq(R1.res.lineage.run_id, 'GAP-INV-20260905-0300',
  'R11d and the readability diagnostic reports the same one');

// ---- R12 THE DEPLOYMENT MANIFEST IS A SUMMARY IN THE PAYLOAD. ------------------------------------------
var R12 = R9.res.environment.deployment;
eq([typeof R12.module_count, R12.modules === undefined], ['number', true],
  'R12 the deployment is carried as COUNTS, with no per-module row array');
ok(String(R12.note).indexOf('SUMMARY ONLY') === 0,
  'R12a and it says so, naming what it caused', R12.note);

// ================================================================================================================
section('N — mutants');
// ================================================================================================================

function withS1(src, spec) {
  var s = {};
  Object.keys(spec || {}).forEach(function (k) { s[k] = spec[k]; });
  s.s1 = src;
  var w = S1World(s);
  var r = w.run('RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS');
  r.world = w;
  return r;
}
function swapS1(a, b) {
  var n = S1.split(a).length - 1;
  if (n !== 1) throw new Error('swap anchor count ' + n + ' :: ' + a.slice(0, 90));
  return S1.split(a).join(b);
}

mut('N1 the proposal is sized from the RECOMMENDATION instead of the residual', function () {
  var m = swapS1('        prop = Math.min(row.residual_qty, a);',
    '        prop = Math.min(row.recommended_qty, a);');
  var clean = scopeOf(census(pos()), SKU);
  var bad = scopeOf(withS1(m, pos()), SKU);
  return clean.proposed_ai_allocation_qty === 380 && bad.proposed_ai_allocation_qty === 900;
});

mut('N2 the proposal ignores available_to_allocate, so a clamp is never reported', function () {
  var m = swapS1('        prop = Math.min(row.residual_qty, a);', '        prop = row.residual_qty;');
  var spec = pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 700, fac_reserved_stock: 0 }] });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  return clean.proposed_ai_allocation_qty === 180 && clean.would_clamp === true
    && bad.proposed_ai_allocation_qty === 380
    && bad.refusal_reasons.indexOf('the_proposed_quantity_does_not_exceed_available_to_allocate') >= 0;
});

mut('N3 an unknown pool is coerced to a zero-availability pool instead of refusing', function () {
  // The exact fail-open this class of census must never have: `null` becoming a number.
  var m = swapS1('      if (row.residual_qty !== null && pool && S1_qty_(pool.available_to_allocate) !== null) {',
    '      if (row.residual_qty !== null) {' + NL
    + '        if (!pool) pool = { available_to_allocate: 0, pool_row_found: false };');
  var spec = pos({ factory_stock: [] });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  return clean.proposed_ai_allocation_qty === null && bad.proposed_ai_allocation_qty === 0;
});

mut('N4 the residual is netted by the AI quantity as well as the manual one', function () {
  // Netting a run against its own previous output is the defect that makes regeneration impossible for ever.
  // The census must report the AI quantity WITHOUT subtracting it.
  var m = swapS1('      row.residual_qty = dScope ? S1_qty_(dScope.residual_qty) : null;',
    '      row.residual_qty = dScope ? S1_qty_(dScope.residual_qty) : null;' + NL
    + '      if (row.residual_qty !== null) row.residual_qty = Math.max(0, row.residual_qty'
    + '        - ((aiPlanned.byKey[key] === undefined) ? 0 : aiPlanned.byKey[key]));');
  var spec = pos({ extraHeaders: [AI_HDR], extraLines: [AI_LN] });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  return clean.residual_qty === 380 && bad.residual_qty === 280;
});

mut('N5 the census SELECTS a candidate instead of ranking them', function () {
  var m = swapS1("    L.P('at_least_one_scope_was_examined', 'more than zero', out.scopes_examined, out.scopes_examined > 0);",
    '    out.selected = out.ranked.length ? out.ranked[0] : null;' + NL
    + "    L.P('at_least_one_scope_was_examined', 'more than zero', out.scopes_examined, out.scopes_examined > 0);");
  var clean = census(pos()), bad = withS1(m, pos());
  return clean.res.selected === null
    && failed(clean.res).indexOf('no_candidate_was_silently_selected') < 0
    && bad.res.selected !== null
    && failed(bad.res).indexOf('no_candidate_was_silently_selected') >= 0;
});

mut('N6 the residual proof is dropped, so a fully-covered scope becomes a positive-residual candidate',
function () {
  // `the_row_belongs_to_the_accepted_run` is deliberately NOT mutated here: bySite only ever holds rows at
  // the accepted date, so that proof cannot be made to fail through any world this harness can build. It is
  // defence in depth against that set widening, and it is asserted to EXIST (F3d) rather than probed.
  var m = swapS1("      C.P('residual_qty_is_finite_and_greater_than_zero', 'a finite number > 0', row.residual_qty,",
    "      C.P('residual_qty_is_finite_and_greater_than_zero', 'a finite number > 0', row.residual_qty," + NL
    + '        true ||');
  // The proved R6-R7-R5-R1 world: recommended 160 against 520 already planned. Residual zero.
  var spec = pos({ gap: { d18_gap_qty: 0, d18_suggested_qty: 0, d30_suggested_qty: 0,
    d45_suggested_qty: 0, d90_gap_qty: 160, d90_suggested_qty: 160 } });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  var NM = 'residual_qty_is_finite_and_greater_than_zero';
  return clean.residual_qty === 0 && clean.is_candidate === false
    && clean.refusal_reasons.indexOf(NM) >= 0
    && bad.refusal_reasons.indexOf(NM) === -1;
});

mut('N7b the pool is filtered to the requesting company, partitioning a shared factory', function () {
  // The single defect KMFSG exists to prevent, injected into the CENSUS's pool lookup: only pools whose
  // warehouse belongs to this company are considered. Two companies then each plan the same cartons.
  var m = swapS1('        if (S1_str_(p.sku).toUpperCase() === sku.toUpperCase()) poolCandidates.push(p);',
    '        if (S1_str_(p.sku).toUpperCase() === sku.toUpperCase()' + NL
    + '          && S1_str_(p.warehouse_id).indexOf("FW-XX") === 0) poolCandidates.push(p);');
  var spec = pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 100 }] });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  // The clean run finds the pool by the recommendation's named warehouse; the mutant loses the candidate
  // list, so the ambiguity proof and the pool proof can no longer both hold.
  return clean.is_candidate === true
    && (bad.is_candidate === false || bad.pool === null || bad.pool_candidates.length === 0);
});

mut('N8 MISSING is coerced to zero by the census\'s own numeric reader', function () {
  // Measured first: KMFSG parses factory_stock itself, so this reader never gated that number and mutating
  // it could not change the pool. What it DOES gate is every quantity the census reads back from an
  // authority, so the claim is aimed at its own contract — blank, null and undefined are UNKNOWN, not zero.
  var m = swapS1('function S1_qty_(v) {' + NL + "  if (v === '' || v === null || v === undefined) return null;",
    'function S1_qty_(v) {' + NL + "  if (v === '' || v === null || v === undefined) return 0;");
  var w = S1World(pos()), w2 = S1World({ s1: m });
  function probe(ctx) {
    return vm.runInContext('[S1_qty_(""), S1_qty_(null), S1_qty_(undefined), S1_qty_(0), S1_qty_(7)]', ctx);
  }
  var clean = probe(w.ctx), bad = probe(w2.ctx);
  return JSON.stringify(clean) === JSON.stringify([null, null, null, 0, 7])
    && JSON.stringify(bad) === JSON.stringify([0, 0, 0, 0, 7]);
});

mut('N9 the manifests stop declaring that one does not authorize the other', function () {
  var m = swapS1("    boundary_note: 'MANIFEST P succeeding does NOT authorize MANIFEST S. They are separate because a Generate'",
    "    boundary_note: 'MANIFEST P and MANIFEST S may be authorized together. A Generate'");
  var w = S1World(pos()); var w2 = S1World({ s1: m });
  var clean = vm.runInContext('RUN_S1_MANIFEST_P()', w.ctx);
  var bad = vm.runInContext('RUN_S1_MANIFEST_P()', w2.ctx);
  return String(clean.boundary_note).indexOf('does NOT authorize MANIFEST S') > 0
    && String(bad.boundary_note).indexOf('does NOT authorize MANIFEST S') === -1;
});

mut('N10 the submit census reports a readiness verdict when no draft was named', function () {
  var m = swapS1("      out.verdict = L.failed.length ? 'STOP' : 'CONTRACT_ONLY_NO_DRAFT_NAMED';",
    "      out.verdict = L.failed.length ? 'STOP' : 'SUBMIT_READY_AUTHORIZATION_REQUIRED';");
  var clean = submitCensus(pos());
  var w2 = S1World({ s1: m });
  var bad = vm.runInContext('RUN_S1_SUBMIT_READINESS_CENSUS(null)', w2.ctx);
  return clean.res.verdict === 'CONTRACT_ONLY_NO_DRAFT_NAMED'
    && bad.verdict === 'SUBMIT_READY_AUTHORIZATION_REQUIRED';
});

mut('N11 a terminal draft passes the submit gate', function () {
  var m = swapS1("      st !== 'submitted' && st !== 'cancelled' && st !== 'expired');",
    '      true);');
  var spec = subWorld({ status: 'cancelled', draft_version: '1' });
  var clean = submitCensus(spec, 'AI-NEW-1');
  var w2 = S1World((function () { var s = {}; Object.keys(spec).forEach(function (k) { s[k] = spec[k]; }); s.s1 = m; return s; })());
  var bad = vm.runInContext('RUN_S1_SUBMIT_READINESS_CENSUS("AI-NEW-1")', w2.ctx);
  var NM = 'the_draft_is_not_terminal';
  return failed(clean.res).indexOf(NM) >= 0 && failed(bad).indexOf(NM) === -1;
});

mut('N12 the exposure delta is declared non-zero, so Submit would look like it creates exposure', function () {
  var m = swapS1('        delta_total_exposure: 0,', '        delta_total_exposure: 380,');
  var clean = submitCensus(subWorld({ draft_version: '1' }), 'AI-NEW-1');
  var spec = subWorld({ draft_version: '1' });
  var w2 = S1World((function () { var s = {}; Object.keys(spec).forEach(function (k) { s[k] = spec[k]; }); s.s1 = m; return s; })());
  var bad = vm.runInContext('RUN_S1_SUBMIT_READINESS_CENSUS("AI-NEW-1")', w2.ctx);
  return clean.res.expected_shipping_plan.before_after_exposure.delta_total_exposure === 0
    && bad.expected_shipping_plan.before_after_exposure.delta_total_exposure !== 0;
});

// ---- N13-N18  S1-R1: the universe, the fail-closed half, and the log. ----------------------------------

function gapDiagWith(src, spec) {
  var sp = {}; Object.keys(spec || {}).forEach(function (k) { sp[k] = spec[k]; });
  sp.s1 = src;
  var w = S1World(sp);
  return { res: vm.runInContext('RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC()', w.ctx), world: w };
}

mut('N13 the census requires EVERY table pair to be readable again — the exact production STOP', function () {
  var m = swapS1('    var notOk = eligiblePairKeys.filter(function (pk) { return !(canByPair[pk] && canByPair[pk].ok === true); });',
    '    var notOk = pairKeys.filter(function (pk) { return !(canByPair[pk] && canByPair[pk].ok === true); });');
  var spec = pos({ extraGap: [FOREIGN_PAIR] });
  var clean = census(spec), bad = withS1(m, spec);
  var NM = 'the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair';
  return clean.res.verdict === 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED'
    && failed(clean.res).indexOf(NM) === -1
    && bad.res.verdict === 'STOP' && failed(bad.res).indexOf(NM) >= 0
    && bad.res.scopes_examined === 0;
});

mut('N14 an UNREADABLE eligible pair is accepted, so the fail-closed half is lost', function () {
  // The predicate NAME now appears in BOTH entry points, so the anchor carries the pass expression from the
  // census's own copy to stay unique.
  var m = swapS1('      !!(out.accepted_run && out.accepted_run.ok) && notOk.length === 0);',
    '      true);');
  var spec = pos({ gap: { calculation_date: '2026-08-01' } });
  var NM = 'the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair';
  var clean = census(spec), bad = withS1(m, spec);
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N15 the eligible universe falls back to the whole gap table when the allowlist is empty', function () {
  var m = swapS1('  out.ok = out.scopes.length > 0;' + NL + "  if (!out.ok) out.reason = 'AI_PLAN_SCOPE_NOT_ENABLED';",
    '  out.ok = true;');
  var spec = pos({ allowlist: [], extraGap: [FOREIGN_PAIR] });
  var NM = 'the_eligible_pair_universe_is_derived_from_the_activation_allowlist';
  var clean = census(spec), bad = withS1(m, spec);
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N16 the eligibility gate stops being re-asked, so a blank allowlist entry becomes eligible', function () {
  // 61_ re-asks inventoryAiPlanScopeEnabled_ per entry rather than trusting the list, precisely so a blank
  // or ALL entry can never pass. This census must do the same or it would report a scope production refuses.
  var m = swapS1('    if (!inventoryAiPlanScopeEnabled_(c, k, m, sk)) return;',
    '    if (false) return;');
  var spec = pos({ allowlist: [{ company: 'ResEU', country: 'DE', marketplace: 'ALL_SITES', sku: 'ALL' }],
    extraGap: [FOREIGN_PAIR] });
  var clean = gapDiag(spec), bad = gapDiagWith(m, spec);
  return clean.res.root_cause_class === 'SCOPE_GUARD_UNAVAILABLE'
    && bad.res.eligible.eligible_pairs.indexOf('ResEU|DE') >= 0;
});

mut('N17 the chunk bound goes back to 45000, which is what truncated the evidence', function () {
  var m = swapS1('var S1_CHUNK_MAX_BYTES_ = 3000;', 'var S1_CHUNK_MAX_BYTES_ = 45000;');
  var w = S1World(pos()), w2 = S1World({ s1: m });
  return vm.runInContext('S1_CHUNK_MAX_BYTES_', w.ctx) === 3000
    && vm.runInContext('S1_CHUNK_MAX_BYTES_', w2.ctx) === 45000;
});

mut('N18 the whole per-module deployment manifest goes back into the payload', function () {
  var m = swapS1('    out.deployment = _dep ? {', '    out.deployment = _dep ? _dep && {' + NL
    + '      modules: _dep.modules,');
  var clean = census(pos()), bad = withS1(m, pos());
  return clean.res.environment.deployment.modules === undefined
    && bad.res.environment.deployment.modules !== undefined;
});

mut('N19 a DATA_NOT_READY eligible pair is misreported as this census\'s own defect', function () {
  // The two root causes have opposite next actions — one is a Gap Job question and one is a code question —
  // so mixing them up sends the operator to the wrong place with a confident answer.
  var m = swapS1('    } else if (eligUnreadable.length) {' + NL
    + "      out.verdict = 'STOP';" + NL
    + "      out.root_cause_class = 'DATA_NOT_READY';",
    '    } else if (eligUnreadable.length) {' + NL
    + "      out.verdict = 'ELIGIBLE_PAIRS_READABLE';" + NL
    + "      out.root_cause_class = 'DIAGNOSTIC_UNIVERSE_TOO_WIDE';");
  var spec = pos({ gap: { calculation_date: '2026-08-01' } });
  var clean = gapDiag(spec), bad = gapDiagWith(m, spec);
  return clean.res.root_cause_class === 'DATA_NOT_READY' && clean.res.verdict === 'STOP'
    && bad.res.root_cause_class === 'DIAGNOSTIC_UNIVERSE_TOO_WIDE';
});

mut('N20 the run id is read off the gap row again, so a resolvable one reports null', function () {
  var m = swapS1("      row.calculation_run_id = (out.accepted_run.lineage && out.accepted_run.lineage.run_id) || null;",
    '      row.calculation_run_id = mine ? (S1_str_(mine.calculation_run_id) || null) : null;');
  var clean = scopeOf(census(pos()), SKU), bad = scopeOf(withS1(m, pos()), SKU);
  return clean.calculation_run_id === 'GAP-INV-20260905-0300' && bad.calculation_run_id === null;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
process.exit(fail ? 1 : 0);
