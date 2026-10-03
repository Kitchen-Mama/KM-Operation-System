// S8-R2 — PRODUCTION DATA SAFETY BOUNDARY + NAMESPACE CENSUS + HARNESS SKELETON.
//
// THIS SUITE IS THE SAFETY PROOF, SO IT IS WRITTEN AS AN ADVERSARY RATHER THAN AS A DEMONSTRATION.
// Every section asks "what would have to be true for this harness to damage Production", and then shows that
// the thing is refused. The mutation block then breaks each guard on purpose and requires the suite to notice —
// because a safety assertion that still passes when its guard is removed was never protecting anything.
//
// WHAT IT PROVES
//   A  the protected Production data set is frozen and is refused at the write gate
//   B  an unregistered table is UNAUTHORIZED_UNKNOWN and is a STOP, not a default-allow
//   C  factory_stock / overseas_inventory_snapshot are REBUILDABLE, writable only through runtime owners
//   D  the movement ledgers are permanent — MOVEMENT_DELETE_ALLOWED = false, enforced at the delete gate
//   E  gap write fatigue is excluded, and the §6 finding says WHY rather than merely saying no
//   F  the census is read-only by construction (source-level, not by trusting its own comment)
//   G  cleanup candidates come from the manifest and from nothing else
//   H  prefix-only and time-only selection are unreachable
//   I  cross-run isolation, including the deterministic-draft-id hole that no id guard can close
//   J  the §5 approval gate produces a complete request and never widens the surface by itself
//   K  R2 added no router action, no schema change, no destructive executor
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. NO DELETION.
// TEST_DATA_CLASSIFICATION = FIXTURES_AND_SOURCE_TEXT   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s8-r2-fatigue-harness-safety.test.js

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var TOOLS = 'tools/s8-fatigue/';
var CLS_F = TOOLS + 's8-data-classification.js';
var RUN_F = TOOLS + 's8-run-identity.js';
var CLN_F = TOOLS + 's8-cleanup-planner.js';
var CENSUS_F = 'tools/apps-script-diagnostics/TEMP_S8T_NAMESPACE_COLLISION_CENSUS.gs';

var CLS = require(path.join(ROOT, CLS_F));
var RUN = require(path.join(ROOT, RUN_F));
var CLEAN = require(path.join(ROOT, CLN_F));

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function throws(fn, re, l) {
  var threw = false, msg = '';
  try { fn(); } catch (e) { threw = true; msg = String(e && e.message); }
  if (threw && re.test(msg)) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  threw=' + threw + ' msg=' + msg); }
}
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- mutation harness -------------------------------------------------------------------------------------
// Load a module from PATCHED source and hand it to a probe. The probe returns true when it NOTICES the defect.
// A mutant that nobody notices is reported as SURVIVED and fails the suite.
var MODCACHE = {};
function loadMutated(rel, from, to) {
  var src = MODCACHE[rel] || (MODCACHE[rel] = read(rel));
  if (src.indexOf(from) === -1) throw new Error('mutation anchor not found in ' + rel + ': ' + from);
  var mutated = src.replace(from, to);
  var mod = { exports: {} };
  var shim = function (p) {
    if (/s8-run-identity/.test(p)) return require(path.join(ROOT, RUN_F));
    if (/s8-data-classification/.test(p)) return require(path.join(ROOT, CLS_F));
    throw new Error('unexpected require ' + p);
  };
  new Function('module', 'exports', 'require', mutated)(mod, mod.exports, shim);
  return mod.exports;
}
function mut(label, rel, from, to, probe) {
  mutants++;
  var caught = false;
  try { caught = probe(loadMutated(rel, from, to)) === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// ============================================================================================================
section('A. THE PROTECTED PRODUCTION DATA SET IS FROZEN, AND THE WRITE GATE REFUSES IT');
// ============================================================================================================
// Every table the operator named in §1 must be PROTECTED_MASTER. Named explicitly, so that removing one from
// the registry breaks a test rather than quietly widening the write surface.
var OPERATOR_NAMED = ['sku_details', 'sku_regional_details', 'marketplaces', 'pricing_list',
  'fc_regular_forecast', 'fc_special_events', 'campaigns', 'campaign_sku_lines', 'warehouses',
  'marketplace_skus', 'tax_rate_components', 'tax_referral_rates'];
OPERATOR_NAMED.forEach(function (t) {
  eq(CLS.classify(t).cls, CLS.CLASS.PROTECTED_MASTER, 'A1  §1 names ' + t + ' → PROTECTED_MASTER');
});

// "Also classify as protected unless separately authorized."
['amazon_inventory_snapshot', 'amazon_daily_sales_snapshot', 'amazon_weekly_sales_snapshot',
 'company_legal_entities', 'carriers', 'carrier_rate_cards', 'carrier_lead_times',
 'document_templates', 'document_template_fields', 'pricing_change_log', 'fc_target_rules',
 'shipment_route_templates', 'shipment_route_template_nodes', 'logistics_locations',
 'import_sync_runs', 'import_sync_issues', 'replenishment_demand_allocation_rules'].forEach(function (t) {
  eq(CLS.classify(t).cls, CLS.CLASS.PROTECTED_MASTER, 'A2  also protected: ' + t);
});

OPERATOR_NAMED.forEach(function (t) {
  var r = CLS.authorizeWrite(t, 'RUNTIME_OWNER');
  ok(r.ok === false && r.code === 'PROTECTED_MASTER_WRITE_FORBIDDEN', 'A3  write refused for ' + t, r);
});
ok(CLS.authorizeDelete('sku_details').ok === false, 'A4  and delete is refused for a protected table');
// READ is allowed — the gate is about writes, and saying so matters: a round that could not read master data
// could not test anything at all.
ok(CLS.classify('sku_details').policy === CLS.POLICY.NEVER_TOUCH, 'A5  protected policy is NEVER_TOUCH (write/delete), read is unconstrained');

eq(CLS.counts().protected_master, 29, 'A6  29 protected tables');
eq(CLS.counts().total_registered, 58, 'A7  58 physical tables registered in total');

// ============================================================================================================
section('B. AN UNREGISTERED TABLE IS A STOP — FAIL CLOSED, NOT FAIL OPEN');
// ============================================================================================================
eq(CLS.classify('some_table_nobody_classified').cls, CLS.CLASS.UNAUTHORIZED_UNKNOWN, 'B1  unknown → UNAUTHORIZED_UNKNOWN');
eq(CLS.classify('').cls, CLS.CLASS.UNAUTHORIZED_UNKNOWN, 'B2  blank → UNAUTHORIZED_UNKNOWN');
var bw = CLS.authorizeWrite('some_table_nobody_classified', 'RUNTIME_OWNER');
ok(bw.ok === false && bw.code === 'UNAUTHORIZED_UNKNOWN_TABLE', 'B3  and its write is refused with a STOP', bw);
ok(/STOP/.test(bw.message) && /§5/.test(bw.message), 'B4  the refusal points at the approval gate rather than dead-ending');
ok(CLS.authorizeDelete('some_table_nobody_classified').ok === false, 'B5  and its delete is refused');

// ============================================================================================================
section('C. INVENTORY IS REBUILDABLE — AUTHORIZED, BUT ONLY THROUGH CANONICAL RUNTIME OWNERS');
// ============================================================================================================
['factory_stock', 'overseas_inventory_snapshot'].forEach(function (t) {
  eq(CLS.classify(t).cls, CLS.CLASS.REBUILDABLE_OPERATIONAL_STATE, 'C1  ' + t + ' → REBUILDABLE_OPERATIONAL_STATE');
  eq(CLS.classify(t).policy, CLS.POLICY.RECONCILE, 'C2  ' + t + ' policy = RECONCILE (never deleted, never cell-restored)');
  ok(CLS.authorizeWrite(t, 'RUNTIME_OWNER').ok === true, 'C3  ' + t + ' write authorized via RUNTIME_OWNER');
  var direct = CLS.authorizeWrite(t, 'HARNESS');
  ok(direct.ok === false && direct.code === 'DIRECT_WRITE_FORBIDDEN', 'C4  ' + t + ' direct harness write refused', direct);
  ok(CLS.authorizeDelete(t).ok === false, 'C5  ' + t + ' delete refused — the canonical row is never removed');
  ok(CLS.directCellWriteAuthorized(t) === false, 'C6  ' + t + ' no direct cell write');
});
// The strong form: NO table may be cell-written, including the authorized ones.
ok(CLS.REGISTRY.every(function (e) { return CLS.directCellWriteAuthorized(e.table) === false; }),
  'C7  there is no table in the registry the harness may poke a cell in');
eq(CLS.INVENTORY_RECOVERY_MODEL, 'RUNTIME RECONCILIATION + OPERATOR CANONICAL RE-IMPORT', 'C8  §2 recovery model frozen');

// §2: every touched inventory identity must be recorded, and an unrecorded one is a throw, not a shrug —
// an identity nobody wrote down cannot be reconciled and cannot be handed to the operator re-import.
var mf = RUN.newManifest({ runId: 'S8T-20261006-R001', tier: 'T1' });
throws(function () { RUN.recordInventoryTouch(mf, { table: 'factory_stock', sku: 'SKU-1', axis: 'current' }); },
  /warehouse_id required/, 'C9  an inventory touch with no warehouse identity is refused');
RUN.recordInventoryTouch(mf, { table: 'factory_stock', warehouse_id: 'WH-1', sku: 'SKU-1', axis: 'current',
  before: 100, after: 80, evidence_movement_id: 'FSMV-abc' });
eq(mf.touched_inventory_identities.length, 1, 'C10 a complete inventory touch is recorded with before/after evidence');

// ============================================================================================================
section('D. THE MOVEMENT LEDGERS ARE PERMANENT');
// ============================================================================================================
eq(CLS.MOVEMENT_DELETE_ALLOWED, false, 'D1  MOVEMENT_DELETE_ALLOWED = false');
['factory_stock_movements', 'overseas_inventory_movements', 'factory_stock_override_audit'].forEach(function (t) {
  eq(CLS.classify(t).policy, CLS.POLICY.RETAIN, 'D2  ' + t + ' policy = RETAIN');
  var d = CLS.authorizeDelete(t);
  ok(d.ok === false && d.code === 'DELETE_FORBIDDEN_BY_POLICY', 'D3  ' + t + ' delete refused by policy', d);
});
// And the ledgers appear in the cleanup order only under RETAIN — never as a DELETE step.
var deleteTables = CLEAN.SAFE_CLEANUP_ORDER.filter(function (s) { return s.kind === 'DELETE'; })
  .map(function (s) { return s.table; });
ok(deleteTables.indexOf('factory_stock_movements') === -1 && deleteTables.indexOf('overseas_inventory_movements') === -1,
  'D4  no movement ledger is a DELETE step in SAFE_CLEANUP_ORDER');
ok(deleteTables.indexOf('factory_stock') === -1 && deleteTables.indexOf('overseas_inventory_snapshot') === -1,
  'D5  nor is either inventory balance table');
// The ordering fact that cannot be got wrong: release reservations BEFORE shipments are removed.
var relStep = CLEAN.SAFE_CLEANUP_ORDER.filter(function (s) { return s.action === 'cancelShipmentDraft'; })[0];
var shipStep = CLEAN.SAFE_CLEANUP_ORDER.filter(function (s) { return s.table === 'shipments'; })[0];
ok(relStep && shipStep && relStep.step < shipStep.step,
  'D6  reservation release is ordered BEFORE the shipment row is deleted (orphaned reservations are unrecoverable)');
var reconStep = CLEAN.SAFE_CLEANUP_ORDER.filter(function (s) { return s.action === 'reconcileInventory'; })[0];
ok(reconStep && reconStep.step > shipStep.step, 'D7  and inventory reconciliation comes after every transaction row is gone');

// ============================================================================================================
section('E. GAP WRITE FATIGUE IS EXCLUDED — AND THE FINDING SAYS WHY');
// ============================================================================================================
['inventory_replenishment_gap', 'order_planning_gap'].forEach(function (t) {
  eq(CLS.classify(t).cls, CLS.CLASS.READ_ONLY_DERIVED, 'E1  ' + t + ' → READ_ONLY_DERIVED');
  var w = CLS.authorizeWrite(t, 'RUNTIME_OWNER');
  ok(w.ok === false && w.code === 'DERIVED_TABLE_WRITE_FORBIDDEN', 'E2  ' + t + ' write refused', w);
});
var G = CLS.GAP_FINDING;
eq(G.canonical_rebuild_supported, true, 'E3  §6.3 canonical rebuild IS supported');
ok(/job\.start/.test(G.rebuild_owner) && /46_/.test(G.rebuild_owner), 'E4  §6.2 the rebuild owner is named');
eq(G.rebuild_scope_modes, ['ALL_SITES', 'CURRENT_COUNTRY', 'CURRENT_SCOPE'], 'E5  §6.4 the scope modes are the real ones');
eq(G.rebuild_completeness_provable, true, 'E6  §6.6 completeness is provable');
ok(/scopesProcessed === scopesTotal/.test(G.rebuild_completeness_proof), 'E7  and the proof is the job state, not a promise');
eq(G.canonical_input_count, 21, 'E8  §6.1 21 canonical inputs');
eq(G.canonical_inputs_mutated_by_fatigue.length, 8, 'E9  8 of those 21 are themselves mutated by mainline fatigue');
eq(G.write_fatigue_safe, false, 'E10 §6 GAP_WRITE_FATIGUE_SAFE = NO');
eq(G.write_fatigue_blockers.length, 4, 'E11 four named blockers, not a vague reservation');
eq(G.write_fatigue_blockers.map(function (b) { return b.code; }),
  ['NO_TEST_OWNED_KEY_SPACE', 'NO_OBSERVATION_ISOLATION', 'REBUILD_ORDERING_DEPENDENCY', 'REBUILD_DURATION'],
  'E12 and each blocker is a distinct, checkable condition');
// R2 adds no lineage column — the thing S8-R2 §6 explicitly forbids doing "merely for identification".
ok(read(CLS_F).indexOf('fatigue_run_id') === -1 || /adds no fatigue_run_id/.test(read(CLS_F)),
  'E13 no fatigue_run_id column is introduced anywhere in the registry');
// The gap step exists in the order but is SKIP, so a future round has to deliberately change it.
var gapStep = CLEAN.SAFE_CLEANUP_ORDER.filter(function (s) { return s.table === 'inventory_replenishment_gap'; })[0];
eq(gapStep.kind, 'SKIP', 'E14 the gap step in SAFE_CLEANUP_ORDER is SKIP, not DELETE');

// ============================================================================================================
section('F. THE CENSUS IS READ-ONLY BY CONSTRUCTION');
// ============================================================================================================
var census = read(CENSUS_F);
// Strip comments first: a census that merely TALKS about appendRow must not fail, and one that CALLS it must.
var censusCode = census.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
['setValue', 'setValues', 'appendRow', 'insertSheet', 'deleteRow', 'clearContent', 'clearContents',
 'LockService', 'DriveApp', 'setProperty', 'deleteProperty', 'UrlFetchApp'].forEach(function (bad) {
  ok(censusCode.indexOf(bad) === -1, 'F1  census contains no ' + bad);
});
ok(/getRange\(2, colIndex, lastRow - 1, 1\)/.test(censusCode), 'F2  it reads ONE bounded column at a time');
ok(censusCode.indexOf('getDataRange') === -1, 'F3  and never getDataRange — the unbounded read it exists to avoid');
ok(/S8T_CENSUS_MAX_EXAMPLES_/.test(censusCode), 'F4  examples are bounded');
ok(/CENSUS_COMPLETE/.test(censusCode) && /resume_with_S8T_CENSUS_START_INDEX_/.test(censusCode),
  'F5  an incomplete slice is visibly incomplete and says where to resume');
ok(/is not evidence that the namespace is clean/.test(census),
  'F6  a zero from an incomplete census is explicitly NOT reported as clean');
// The census file must NOT be in the deployed runtime set.
var deployed = fs.readdirSync(path.join(ROOT, 'specs/active/apps-script'));
ok(deployed.indexOf('TEMP_S8T_NAMESPACE_COLLISION_CENSUS.gs') === -1,
  'F7  the census is NOT in the deployed apps-script set');
eq(deployed.filter(function (f) { return /\.gs$/.test(f); }).length, 77, 'F8  the deployed set is still 77 .gs files');
// The 58 census tables must be exactly the 58 registered tables — one list, two files, no drift.
var censusTables = (census.match(/S8T_CENSUS_TABLES_ = \[([\s\S]*?)\]/) || [])[1] || '';
var censusList = (censusTables.match(/'[a-z0-9_]+'/g) || []).map(function (s) { return s.replace(/'/g, ''); }).sort();
eq(censusList, CLS.REGISTRY.map(function (e) { return e.table; }).sort(),
  'F9  the census table list is EXACTLY the KMS8CLASS registry');

// ============================================================================================================
section('G. CLEANUP CANDIDATES COME FROM THE MANIFEST AND FROM NOTHING ELSE');
// ============================================================================================================
function makeRun(runId, ids) {
  var m = RUN.newManifest({ runId: runId, tier: 'T1' });
  m.status = RUN.STATUS.READY_FOR_CLEANUP;
  m.started_at = '2026-10-06 09:00:00';
  m.finished_at = '2026-10-06 10:00:00';
  Object.keys(ids || {}).forEach(function (t) { (ids[t] || []).forEach(function (i) { RUN.recordCreated(m, t, i); }); });
  return m;
}
function roRow(runId, id) {
  return { request_order_id: id, created_by: RUN.TEST_ACTOR, source_ref_id: runId, created_at: '2026-10-06 09:30:00' };
}
var A = makeRun('S8T-20261006-R001', { request_orders: ['RO-AAA', 'RO-BBB'] });
var WORLD = {
  'RO-AAA': roRow('S8T-20261006-R001', 'RO-AAA'),
  'RO-BBB': roRow('S8T-20261006-R001', 'RO-BBB'),
  'RO-GHOST': roRow('S8T-20261006-R001', 'RO-GHOST')          // namespaced, but A never recorded it
};
var planOpts = { readRow: function (t, id) { return WORLD[id] || null; }, idFieldFor: function () { return 'request_order_id'; } };

var plan = CLEAN.planCandidates(A, planOpts);
ok(plan.ok === true, 'G1  a well-formed run produces a dry-run plan', plan.code);
eq(plan.mode, 'DRY_RUN', 'G2  the plan is a DRY RUN');
eq(plan.candidate_count, 2, 'G3  exactly the 2 rows the manifest recorded');
eq(plan.candidates_by_table.request_orders, 2, 'G4  and RO-GHOST is not among them even though it is in the world');
ok(/PROPOSAL ONLY/.test(plan.statement) && /Nothing was deleted/.test(plan.statement), 'G5  the plan says it deleted nothing');
ok(/^[0-9A-F]{8}$/.test(plan.confirmation_checksum), 'G6  it carries a confirmation checksum');

// The checksum covers the exact set. Change the set, change the checksum.
var A2 = makeRun('S8T-20261006-R001', { request_orders: ['RO-AAA'] });
ok(CLEAN.planCandidates(A2, planOpts).confirmation_checksum !== plan.confirmation_checksum,
  'G7  a different candidate set produces a different checksum');

// A row the manifest names but that is already gone converges instead of aborting — a replayed cleanup after a
// partial run must finish, not deadlock.
var A3 = makeRun('S8T-20261006-R001', { request_orders: ['RO-AAA', 'RO-VANISHED'] });
var p3 = CLEAN.planCandidates(A3, planOpts);
ok(p3.ok === true && p3.candidate_count === 1, 'G8  an already-absent manifest row is skipped, not a refusal', p3.code);

// A manifest row whose live actor is NOT the test actor aborts the WHOLE plan.
WORLD['RO-BBB'].created_by = 'vic.zhou@shopkitchenmama.com';
var p4 = CLEAN.planCandidates(A, planOpts);
ok(p4.ok === false && p4.code === 'GUARD_REFUSED', 'G9  a non-test actor on a manifest row refuses the plan', p4.code);
eq(p4.candidate_count, 0, 'G10 and the refusal abandons the ENTIRE plan, not just that row');
ok(/abandoned rather than partially applied/.test(p4.detail), 'G11 because a partial cleanup reports the same thing as a complete one');
WORLD['RO-BBB'].created_by = RUN.TEST_ACTOR;

// FAILED_RETAINED is a refusal state.
var failed = makeRun('S8T-20261006-R002', { request_orders: ['RO-AAA'] });
failed.status = RUN.STATUS.FAILED_RETAINED;
var pf = CLEAN.planCandidates(failed, planOpts);
ok(pf.ok === false && pf.code === 'RUN_STATUS_NOT_ELIGIBLE', 'G12 a FAILED_RETAINED run cannot be cleaned', pf.code);
ok(/released only by an explicit operator decision/.test(pf.detail), 'G13 and the reason is recorded, not assumed');

// G6 is corroboration only: an implausible timestamp can REFUSE a manifest row, never produce one.
WORLD['RO-AAA'].created_at = '2025-01-01 00:00:00';
var p6 = CLEAN.planCandidates(A, planOpts);
ok(p6.ok === false && JSON.stringify(p6.refusals).indexOf('CREATION_WINDOW_IMPLAUSIBLE') !== -1,
  'G14 an out-of-window created_at refuses a manifest row (G6 corroborates)');
WORLD['RO-AAA'].created_at = '2026-10-06 09:30:00';
// ...but a BLANK timestamp is not a refusal: the manifest is the authority, not the clock.
delete WORLD['RO-AAA'].created_at;
ok(CLEAN.planCandidates(A, planOpts).ok === true, 'G15 a missing created_at is NOT a refusal — time never decides');
WORLD['RO-AAA'].created_at = '2026-10-06 09:30:00';

// ============================================================================================================
section('H. PREFIX-ONLY AND TIME-ONLY SELECTION ARE UNREACHABLE');
// ============================================================================================================
throws(function () { CLEAN.selectByPrefix('S8T'); }, /PREFIX_ONLY_SELECTION_FORBIDDEN/, 'H1  selectByPrefix always throws');
throws(function () { CLEAN.selectByTime('2026-10-06', '2026-10-07'); }, /TIME_ONLY_SELECTION_FORBIDDEN/, 'H2  selectByTime always throws');
throws(function () { CLEAN.execute(); }, /DESTRUCTIVE_EXECUTOR_NOT_IMPLEMENTED/, 'H3  execute always throws');
eq(CLEAN.DESTRUCTIVE_EXECUTOR_IMPLEMENTED, false, 'H4  DESTRUCTIVE_EXECUTOR_IMPLEMENTED = false');
eq(CLEAN.CLEANUP_DEFAULT_EXECUTE, false, 'H5  CLEANUP_DEFAULT_EXECUTE = false');
eq(CLEAN.CLEANUP_REQUIRES_DRY_RUN, true, 'H6  CLEANUP_REQUIRES_DRY_RUN = true');
// planCandidates has no parameter through which a pattern could enter.
var plannerSrc = read(CLN_F);
ok(/function planCandidates\(manifest, opts\)/.test(plannerSrc), 'H7  planCandidates takes a manifest, not a query');
ok(/RUN\.manifestIds\(manifest, s\.table\)/.test(plannerSrc), 'H8  and its only candidate source is manifestIds');

// A namespace-matching row absent from the manifest is a LEAK, never a candidate.
var leaks = CLEAN.detectLeaks([
  { table: 'request_orders', id: 'RO-AAA', lineageValue: 'S8T-20261006-R001' },
  { table: 'request_orders', id: 'RO-GHOST', lineageValue: 'S8T-20261006-R001' },
  { table: 'request_orders', id: 'RO-OTHER', lineageValue: 'S8T-20261006-R002' },
  { table: 'request_orders', id: 'RO-REAL', lineageValue: 'REQ-20261006-ABCD' }
], A);
eq(leaks.leak_count, 1, 'H9  RO-GHOST is the one leak');
eq(leaks.leaked_rows[0].classification, 'LEAK_INVESTIGATION', 'H10 classified for INVESTIGATION');
eq(leaks.foreign_run_count, 1, 'H11 RO-OTHER is attributed to its own run, not to this one');
ok(/do not delete/.test(leaks.action), 'H12 and the action is explicitly not deletion');

// Execution guards: every one of G7..G10 must be satisfied, and the default is a refusal.
var eg = CLEAN.evaluateExecutionGuards(plan, {});
ok(eg.ok === false, 'H13 an empty execution context is refused');
eq(eg.refusals.map(function (r) { return r.guard; }).sort().filter(function (v, i, a) { return a.indexOf(v) === i; }),
  ['G10', 'G7', 'G8', 'G9'], 'H14 and all four execution guards fire');
var egOk = CLEAN.evaluateExecutionGuards(plan, { mode: 'COMMIT', liveChecksum: plan.confirmation_checksum,
  confirmation: plan.confirmation_checksum, journalWritten: true, liveCandidateCount: plan.candidate_count,
  manifestCreatedCount: 2 });
ok(egOk.ok === true, 'H15 a complete context passes all four', egOk.refusals);
var egStale = CLEAN.evaluateExecutionGuards(plan, { mode: 'COMMIT', liveChecksum: 'DEADBEEF',
  confirmation: plan.confirmation_checksum, journalWritten: true, liveCandidateCount: plan.candidate_count });
ok(egStale.ok === false && JSON.stringify(egStale.refusals).indexOf('CONFIRMATION_STALE') !== -1,
  'H16 a table that changed since the dry run is refused');
var egMore = CLEAN.evaluateExecutionGuards(plan, { mode: 'COMMIT', liveChecksum: plan.confirmation_checksum,
  confirmation: plan.confirmation_checksum, journalWritten: true, liveCandidateCount: 2, manifestCreatedCount: 1 });
ok(JSON.stringify(egMore.refusals).indexOf('CANDIDATES_EXCEED_MANIFEST') !== -1,
  'H17 more candidates than the run recorded creating is refused');

// ============================================================================================================
section('I. CROSS-RUN ISOLATION');
// ============================================================================================================
var B = makeRun('S8T-20261006-R002', { request_orders: ['RO-OTHER'] });
WORLD['RO-OTHER'] = roRow('S8T-20261006-R002', 'RO-OTHER');

// (1) Run A cannot delete Run B's row — it is not in A's manifest, so it is never a candidate at all.
var pA = CLEAN.planCandidates(A, planOpts);
var aIds = pA.steps.filter(function (s) { return s.table === 'request_orders'; })[0].candidates.map(function (c) { return c.id; });
ok(aIds.indexOf('RO-OTHER') === -1, 'I1  run A\'s plan does not contain run B\'s row');
// And even if it were forced in, the guards refuse it on lineage.
var g = CLEAN.evaluateRowGuards(WORLD['RO-OTHER'], { manifest: A, table: 'request_orders', idField: 'request_order_id' });
ok(g.ok === false, 'I2  and forcing it through evaluateRowGuards is refused');
var codes = g.refusals.map(function (r) { return r.code; });
ok(codes.indexOf('LINEAGE_UNRESOLVED') !== -1 && codes.indexOf('ROW_NOT_IN_RUN_MANIFEST') !== -1,
  'I3  on TWO independent grounds — lineage and manifest membership', codes);

// (2) Run A cannot adopt run B's child. The child's parent resolves to B, so inheritance refuses.
var childOfB = { request_order_line_id: 'ROL-1', request_order_id: 'RO-OTHER', created_at: '2026-10-06 09:30:00' };
var inh = RUN.resolveLineage(childOfB, {
  runId: A.run_id, parentKey: 'request_order_id',
  lookupParents: function (k, v) { return WORLD[v] ? [WORLD[v]] : []; }
});
ok(inh.ok === false && inh.code === 'PARENT_NOT_THIS_RUN', 'I4  a child of run B does not inherit run A', inh);
// ...while a child of A's own parent does inherit.
var childOfA = { request_order_line_id: 'ROL-2', request_order_id: 'RO-AAA', created_at: '2026-10-06 09:30:00' };
var inhA = RUN.resolveLineage(childOfA, {
  runId: A.run_id, parentKey: 'request_order_id',
  lookupParents: function (k, v) { return WORLD[v] ? [WORLD[v]] : []; }
});
ok(inhA.ok === true && inhA.mode === 'INHERITED', 'I5  a child of run A\'s own parent DOES inherit (vacuity check)', inhA);
// Two candidate parents is a refusal, never a tie-break.
var amb = RUN.resolveLineage(childOfA, {
  runId: A.run_id, parentKey: 'request_order_id',
  lookupParents: function () { return [WORLD['RO-AAA'], WORLD['RO-OTHER']]; }
});
ok(amb.ok === false && amb.code === 'LINEAGE_AMBIGUOUS', 'I6  two candidate parents aborts rather than picking one', amb);

// (3) Run A cannot classify run B's inventory mutation as its own. The movement carries B's reference_id.
var movB = { factory_stock_movement_id: 'FSMV-b1', reference_id: 'S8T-20261006-R002-ADJ01',
  created_by: RUN.TEST_ACTOR, created_at: '2026-10-06 09:30:00' };
var movLin = RUN.resolveLineage(movB, { runId: A.run_id });
ok(movLin.ok === false, 'I7  run B\'s movement does not resolve to run A', movLin);
eq(RUN.runIdOf(movB.reference_id), 'S8T-20261006-R002', 'I8  and it is correctly attributed to run B');

// (4) THE HOLE NO ID GUARD CAN CLOSE — deterministic draft ids are a function of the business key alone.
var dimA = { scope: { dimensions: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1' }] } };
var dimB = { scope: { dimensions: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1' }] } };
var dimC = { scope: { dimensions: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-2' }] } };
var conflict = RUN.dimensionConflict(dimA, dimB);
ok(conflict.conflict === true && conflict.code === 'OVERLAPPING_BUSINESS_DIMENSIONS',
  'I9  two runs on the same business dimensions CONFLICT and must not overlap');
ok(/SADH-K2/.test(conflict.detail) && /REUSE/.test(conflict.detail),
  'I10 and the reason names the deterministic id and the REUSE it would cause');
ok(RUN.dimensionConflict(dimA, dimC).conflict === false, 'I11 different SKUs do not conflict (vacuity check)');

// canAdopt requires BOTH lineage and manifest membership.
var adoptGhost = RUN.canAdopt(A, WORLD['RO-GHOST'], { table: 'request_orders', idField: 'request_order_id' });
ok(adoptGhost.ok === false && adoptGhost.code === 'ROW_NOT_IN_RUN_MANIFEST',
  'I12 a row whose lineage resolves but which the run never recorded is still NOT adoptable', adoptGhost);

// ============================================================================================================
section('J. THE §5 APPROVAL GATE');
// ============================================================================================================
var incomplete = CLS.approvalRequest({ table: 'sales_orders', operation: 'INSERT' });
eq(incomplete.status, 'STOP_OPERATOR_APPROVAL_REQUIRED', 'J1  an approval request is a STOP');
ok(incomplete.complete === false, 'J2  and an incomplete one is flagged');
eq(incomplete.missing_fields.sort(), ['expectedRowCount', 'recoveryModel', 'testScenario', 'trigger', 'whyRequired'],
  'J3  naming every field §5 requires');
var complete = CLS.approvalRequest({ trigger: 'WRITE_UNAPPROVED_TABLE', table: 'sales_orders', operation: 'INSERT',
  whyRequired: 'the ERP mainline needs an order', testScenario: 'T2 ordering cycle', expectedRowCount: 20,
  recoveryModel: 'delete by manifest' });
ok(complete.complete === true, 'J4  a complete request validates', complete.missing_fields);
eq(complete.current_classification.cls, CLS.CLASS.UNAUTHORIZED_UNKNOWN, 'J5  and it carries the current classification');
ok(/NOT expanded by this request/.test(complete.statement), 'J6  filling in the form does not itself widen the surface');
eq(CLS.APPROVAL_TRIGGERS.sort(), ['ADD_COLUMN', 'ADD_TABLE', 'BACKFILL', 'DELETE_FROM_NEW_TABLE',
  'INSERT_INTO_PROTECTED_TABLE', 'SCHEMA_MIGRATION', 'WRITE_UNAPPROVED_TABLE'].sort(), 'J7  all seven §5 triggers');
// An unrecognised trigger does not quietly pass.
ok(CLS.approvalRequest({ trigger: 'JUST_DO_IT', table: 'x', operation: 'y', whyRequired: 'z',
  testScenario: 'a', expectedRowCount: 1, recoveryModel: 'b' }).complete === false, 'J8  an invented trigger is incomplete');

// ============================================================================================================
section('K. R2 ADDED NO ROUTER ACTION, NO SCHEMA CHANGE, NO DEPLOYED FILE');
// ============================================================================================================
var router = read('specs/active/apps-script/01_router.gs');
['S8T', 'S8_FATIGUE', 'fatigue', 'cleanup.execute', 'testData'].forEach(function (tok) {
  ok(router.indexOf(tok) === -1, 'K1  the router contains no ' + tok);
});
// No header contract changed: R2 touched no file under specs/active/apps-script.
ok(fs.readdirSync(path.join(ROOT, 'specs/active/apps-script')).every(function (f) {
  return f.indexOf('S8') === -1 && f.indexOf('s8') === -1;
}), 'K2  no S8 file was added to the deployed apps-script set');
// The harness is NOT shipped to the browser: nothing under assets/js references it, and index.html does not load it.
var indexHtml = read('../index.html');
ok(indexHtml.indexOf('s8-fatigue') === -1, 'K3  index.html does not load the fatigue harness');
var jsRefs = [];
['js/core', 'js/api', 'js/utils', 'js/pages'].forEach(function (d) {
  fs.readdirSync(path.join(ROOT, d)).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    if (read(d + '/' + f).indexOf('s8-fatigue') !== -1) jsRefs.push(d + '/' + f);
  });
});
eq(jsRefs, [], 'K4  no shipped module references the fatigue harness');
// The three modules write nothing, anywhere.
[CLS_F, RUN_F, CLN_F].forEach(function (f) {
  var code = read(f).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  ['writeFileSync', 'appendFileSync', 'UrlFetchApp', 'SpreadsheetApp', 'DriveApp', 'fetch('].forEach(function (bad) {
    ok(code.indexOf(bad) === -1, 'K5  ' + f.split('/').pop() + ' contains no ' + bad);
  });
});
eq(CLEAN.GUARD_COUNT, 10, 'K6  the guard count is 10 (6 per-row + 4 per-execution)');
eq(RUN.TIER_MAX_CONCURRENT.T4, 2, 'K7  §14 T4 is capped at 2 concurrent (one global ScriptLock)');
eq(RUN.TIERS.T2, 20, 'K8  §14 T2 = 20 cycles');

// ============================================================================================================
section('L. RUN IDENTITY — THE FORMAT IS DERIVED, NOT CHOSEN');
// ============================================================================================================
eq(RUN.mintRunId('2026-10-06', 1), 'S8T-20261006-R001', 'L1  canonical form');
eq(RUN.mintRunId('20261006', 42), 'S8T-20261006-R042', 'L2  accepts YYYYMMDD too');
eq(RUN.compact('S8T-20261006-R001'), 'S8T20261006R001', 'L3  compact form');
eq(RUN.compact('S8T-20261006-R001').length, 15, 'L4  15 chars — one under the 16-char limit at 21_:857');
eq(RUN.expand('S8T20261006R001'), 'S8T-20261006-R001', 'L5  and it round-trips');
var fii = RUN.factoryImportBatchId('S8T-20261006-R001', '20261006');
eq(fii, 'FII-20261006-S8T20261006R001', 'L6  it fits the factory import batch id');
ok(/^FII-\d{8}-[A-Za-z0-9]{1,16}$/.test(fii), 'L7  and satisfies the LIVE pattern at 21_:857 verbatim');
// The underscore form the task originally proposed would NOT have fitted. This is why the format changed.
ok(!/^FII-\d{8}-[A-Za-z0-9]{1,16}$/.test('FII-20261006-S8TEST_20261006_R001'),
  'L8  the underscore form is REJECTED by that pattern — which is why hyphens are canonical');
ok(RUN.isRunId('S8T-20261006-R001') && !RUN.isRunId('S8T-2026106-R1') && !RUN.isRunId('s8t-20261006-r001'),
  'L9  the run id regex is strict');
throws(function () { RUN.mintRunId('2026-10-06', 1000); }, /1\.\.999/, 'L10 the serial is bounded');
eq(RUN.scopedId('S8T-20261006-R001', 'SH', 3), 'S8T-20261006-R001-SH03', 'L11 scoped ids carry the run id');
eq(RUN.TEST_ACTOR, 'S8_FATIGUE_TEST', 'L12 one actor value');
// The manifest refuses a non-canonical run id at birth.
throws(function () { RUN.newManifest({ runId: 'QA_RUN_1', tier: 'T1' }); }, /runId must match/, 'L13 a foreign namespace cannot open a manifest');
eq(RUN.validateManifest(makeRun('S8T-20261006-R001', {})).ok, true, 'L14 a fresh manifest validates');
var badM = makeRun('S8T-20261006-R001', {}); badM.test_actor = 'someone';
ok(RUN.validateManifest(badM).ok === false, 'L15 a manifest with a foreign actor does not');

// ============================================================================================================
section('M. MUTATION — BREAK EACH GUARD AND REQUIRE THE SUITE TO NOTICE');
// ============================================================================================================
mut('the write gate defaulting to allow instead of failing closed', CLS_F,
  "if (c.cls === CLASS.UNAUTHORIZED_UNKNOWN) {",
  "if (false) {",
  function (M) { return M.authorizeWrite('some_table_nobody_classified', 'RUNTIME_OWNER').ok === true; });

mut('the protected-master refusal being dropped', CLS_F,
  "if (c.cls === CLASS.PROTECTED_MASTER) {",
  "if (false) {",
  function (M) { return M.authorizeWrite('sku_details', 'RUNTIME_OWNER').ok === true; });

mut('the direct-cell-write bar being lifted', CLS_F,
  "if (v !== 'RUNTIME_OWNER') {",
  "if (false) {",
  function (M) { return M.authorizeWrite('factory_stock', 'HARNESS_CELL_WRITE').ok === true; });

mut('the movement ledger becoming a delete candidate', CLS_F,
  "T('factory_stock_movements', X, RET,",
  "T('factory_stock_movements', X, DEL,",
  function (M) { return M.authorizeDelete('factory_stock_movements').ok === true; });

mut('the gap tables being reclassified as writable', CLS_F,
  "T('order_planning_gap', D, NEV,",
  "T('order_planning_gap', X, DEL,",
  function (M) { return M.authorizeWrite('order_planning_gap', 'RUNTIME_OWNER').ok === true; });

mut('GAP_WRITE_FATIGUE_SAFE being flipped to true without removing a blocker', CLS_F,
  'write_fatigue_safe: false,',
  'write_fatigue_safe: true,',
  function (M) { return M.GAP_FINDING.write_fatigue_safe === true && M.GAP_FINDING.write_fatigue_blockers.length > 0; });

mut('cleanup selecting by prefix instead of by manifest', CLN_F,
  'var ids = RUN.manifestIds(manifest, s.table);',
  "var ids = ['RO-GHOST'].concat(RUN.manifestIds(manifest, s.table));",
  function (M) {
    var p = M.planCandidates(A, planOpts);
    // Either it now proposes a row the manifest never recorded, or the G4 guard refuses the whole plan.
    // Both are "the suite noticed"; silently producing the correct 2 would not be.
    if (p.ok === false) return true;
    return p.candidate_count !== 2;
  });

mut('the manifest-membership guard G4 being removed', CLN_F,
  'if (!RUN.manifestHas(manifest, table, id)) {',
  'if (false) {',
  function (M) {
    var g = M.evaluateRowGuards(WORLD['RO-OTHER'], { manifest: A, table: 'request_orders', idField: 'request_order_id' });
    return g.refusals.map(function (r) { return r.code; }).indexOf('ROW_NOT_IN_RUN_MANIFEST') === -1;
  });

mut('a guard refusal skipping the row instead of abandoning the plan', CLN_F,
  'if (refusals.length) {',
  'if (false) {',
  function (M) {
    WORLD['RO-BBB'].created_by = 'a.real.person@example.com';
    var p = M.planCandidates(A, planOpts);
    WORLD['RO-BBB'].created_by = RUN.TEST_ACTOR;
    return p.ok === true;                                  // it "succeeded" while silently dropping a row
  });

mut('the row guards being ORed instead of ANDed', CLN_F,
  'return { ok: refusals.length === 0,',
  'return { ok: refusals.length < 3,',
  function (M) {
    var g = M.evaluateRowGuards(WORLD['RO-OTHER'], { manifest: A, table: 'request_orders', idField: 'request_order_id' });
    return g.ok === true;
  });

mut('selectByPrefix quietly returning a list instead of throwing', CLN_F,
  "throw new Error('PREFIX_ONLY_SELECTION_FORBIDDEN",
  "return []; throw new Error('PREFIX_ONLY_SELECTION_FORBIDDEN",
  function (M) { var threw = false; try { M.selectByPrefix('S8T'); } catch (e) { threw = true; } return threw === false; });

mut('the destructive executor being implemented', CLN_F,
  "throw new Error('DESTRUCTIVE_EXECUTOR_NOT_IMPLEMENTED",
  "return { deleted: 1 }; throw new Error('DESTRUCTIVE_EXECUTOR_NOT_IMPLEMENTED",
  function (M) { var threw = false; try { M.execute(); } catch (e) { threw = true; } return threw === false; });

mut('COMMIT mode no longer being required', CLN_F,
  "if (str(ctx.mode) !== 'COMMIT') {",
  'if (false) {',
  function (M) {
    var r = M.evaluateExecutionGuards(plan, { liveChecksum: plan.confirmation_checksum,
      confirmation: plan.confirmation_checksum, journalWritten: true, liveCandidateCount: plan.candidate_count });
    return r.refusals.map(function (x) { return x.guard; }).indexOf('G7') === -1;
  });

mut('the rollback journal no longer being required before deletion', CLN_F,
  'if (!ctx.journalWritten) {',
  'if (false) {',
  function (M) {
    var r = M.evaluateExecutionGuards(plan, { mode: 'COMMIT', liveChecksum: plan.confirmation_checksum,
      confirmation: plan.confirmation_checksum, liveCandidateCount: plan.candidate_count });
    return r.refusals.map(function (x) { return x.guard; }).indexOf('G9') === -1;
  });

mut('reservation release being ordered AFTER the shipment delete', CLN_F,
  "{ step: 0, kind: 'RUNTIME', action: 'cancelShipmentDraft'",
  "{ step: 99, kind: 'RUNTIME', action: 'cancelShipmentDraft'",
  function (M) {
    var rel = M.SAFE_CLEANUP_ORDER.filter(function (s) { return s.action === 'cancelShipmentDraft'; })[0];
    var sh = M.SAFE_CLEANUP_ORDER.filter(function (s) { return s.table === 'shipments'; })[0];
    return rel.step > sh.step;
  });

mut('ambiguous parent lineage being resolved by picking the first', RUN_F,
  'if (parents.length > 1) {',
  'if (false) {',
  function (M) {
    var r = M.resolveLineage({ request_order_id: 'RO-AAA' }, {
      runId: 'S8T-20261006-R001', parentKey: 'request_order_id',
      lookupParents: function () { return [WORLD['RO-OTHER'], WORLD['RO-AAA']]; }
    });
    return r.ok === true || r.code !== 'LINEAGE_AMBIGUOUS';
  });

mut('the actor check being dropped from DIRECT lineage', RUN_F,
  'if (!actorOk) {',
  'if (false) {',
  function (M) {
    var r = M.resolveLineage({ source_ref_id: 'S8T-20261006-R001', created_by: 'a.real.person@example.com' },
      { runId: 'S8T-20261006-R001' });
    return r.ok === true;
  });

mut('FAILED_RETAINED becoming cleanup-eligible', RUN_F,
  'var CLEANUP_ELIGIBLE_STATUS = [STATUS.READY_FOR_CLEANUP];',
  'var CLEANUP_ELIGIBLE_STATUS = [STATUS.READY_FOR_CLEANUP, STATUS.FAILED_RETAINED];',
  function (M) {
    var f = M.newManifest({ runId: 'S8T-20261006-R002', tier: 'T1' });
    f.status = M.STATUS.FAILED_RETAINED;
    return M.cleanupEligible(f).ok === true;
  });

mut('the dimension-overlap rule being disabled', RUN_F,
  'if (!hits.length) return { conflict: false, overlapping: [] };',
  'return { conflict: false, overlapping: [] };',
  function (M) { return M.dimensionConflict(dimA, dimB).conflict === false; });

mut('canAdopt accepting a row absent from the manifest', RUN_F,
  'if (!manifestHas(manifestA, table, id)) {',
  'if (false) {',
  function (M) {
    return M.canAdopt(A, WORLD['RO-GHOST'], { table: 'request_orders', idField: 'request_order_id' }).ok === true;
  });

mut('an unrecorded inventory touch being accepted silently', RUN_F,
  "if (!str(touch[k])) throw new Error('recordInventoryTouch: ' + k + ' required",
  "if (false) throw new Error('recordInventoryTouch: ' + k + ' required",
  function (M) {
    var m = M.newManifest({ runId: 'S8T-20261006-R001', tier: 'T1' });
    M.recordInventoryTouch(m, { table: 'factory_stock' });
    return m.touched_inventory_identities.length === 1;
  });

// ============================================================================================================
section('N. VACUITY — the unmutated tree really does behave as the mutants assume');
// ============================================================================================================
ok(CLS.authorizeWrite('some_table_nobody_classified', 'RUNTIME_OWNER').ok === false, 'N1  the real write gate really does refuse an unknown table');
ok(CLS.authorizeDelete('factory_stock_movements').ok === false, 'N2  the real delete gate really does refuse a movement ledger');
ok(CLEAN.planCandidates(A, planOpts).candidate_count === 2, 'N3  the real planner really does produce exactly the manifest rows');
ok(RUN.dimensionConflict(dimA, dimB).conflict === true, 'N4  the real overlap rule really does fire');
ok(RUN.cleanupEligible(failed).ok === false, 'N5  the real eligibility check really does refuse FAILED_RETAINED');

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 ? 'PASS  ' : 'FAIL  ') + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived');
console.log(new Array(101).join('='));
if (fail !== 0) process.exitCode = 1;
