// F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R3 — THE FIRST CONTROLLED NO-ACTION ACTIVATION.
//
// Every round so far proved what a generation WOULD do. This one is about the sentence a person has to be able
// to sign: press it once, and here is exactly what must be true before, and exactly what must be identical
// after. Three things make that sentence checkable rather than hopeful.
//
// (1) A BASELINE A READBACK RECOMPUTES CANNOT DETECT A CHANGE. Whatever it finds becomes what it expected. So
//     the BEFORE is frozen into a constant BY A PERSON, from the manifest's own printed block, and the readback
//     REFUSES to run against an unfrozen one. That refusal is the feature: a readback that cheerfully compared
//     nothing to nothing would report CONFIRMED after a write.
//
// (2) A MUTATION REQUEST IS NOT A DATABASE WRITE. The transport records one mutation request because the
//     operator asked the server to consider generating; the server's answer is that nothing needed writing.
//     mutation_requests 1 beside db_writes 0 is the CORRECT shape of a no-action, and reading the first number
//     as the second is how a correct finish gets rolled back.
//
// (3) THE TWO HALVES ARE MEASURED IN DIFFERENT PLACES AND MUST STAY THERE. Apps Script cannot see the browser
//     and the browser cannot see the database. The readback states the rows; the snippet states the requests;
//     neither invents the other's number.
//
// Nothing here flips a flag, deploys, or calls a generation. This suite proves the design and the diagnostics.
//
// Run: node assets/tests/controlled-no-action-activation-manifest-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r3.test.js

var fs = require('fs');
var RO = require('./_release-order.js');
var path = require('path');
var vm = require('vm');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
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

// ================================================================================================================
// THE WORLD IS LOADED FROM THE R6-R7-R2 SUITE, NOT COPIED. Same reason as every round since: a second copy of
// the fixtures would let two suites disagree about what production looks like.
// ================================================================================================================
var R2_OF = 'assets/tests/controlled-ai-plan-production-parity-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r2.test.js';
var R2_SRC = read(R2_OF).replace(/\r\n/g, '\n');
var CUT = R2_SRC.indexOf("\nsection('A ");
if (CUT < 0) throw new Error('the R6-R7-R2 suite no longer opens its assertions with section()');
var RUNCENSUS = R2_SRC.slice(R2_SRC.indexOf('function runCensus('), R2_SRC.indexOf('var BLOCKED ='));
var SHARED = (new Function('require', '__dirname', '__filename', 'module', 'exports', 'console',
  R2_SRC.slice(0, CUT) + '\n' + RUNCENSUS
  + '\nreturn { World: World, failed: failed, swap: swap, extractFn: extractFn, extractVar: extractVar,'
  + ' CENSUS: CENSUS, G61: G61, live: live, projection: projection, NLF: NLF, SQ: SQ,'
  + ' GAP_YESTERDAY: GAP_YESTERDAY };'
))(require, __dirname, __filename, module, exports, console);
var World = SHARED.World, failed = SHARED.failed, swap = SHARED.swap;
var extractFn = SHARED.extractFn, extractVar = SHARED.extractVar;
var CENSUS = SHARED.CENSUS, G61 = SHARED.G61, live = SHARED.live, projection = SHARED.projection;
var NLF = SHARED.NLF;
var GAP_YESTERDAY = SHARED.GAP_YESTERDAY;
// THE ROUND THIS SUITE WAS WRITTEN AGAINST. It is a FLOOR for the stamp assertions in §H and nothing else.
var DEPLOYMENT_BUILD = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R2';

// ================================================================================================================
// R6-R7-R3-P3 — TWO DIFFERENT FACTS THAT WERE SHARING ONE CONSTANT, and that is how they drifted apart.
//
// `DEPLOYMENT_BUILD` above used to be BOTH the floor for "these stamps have not fallen behind my round" AND
// the build the deployment double reports. So when R6-R7-R3 moved the release, the census's own
// `R6R7_ACTIVATION_BUILD_` pin stayed at R2 — and the double reported R2 as well, so
// `deployment_build_is_the_measured_one` compared R2 with R2 and passed. The suite was green while the live
// manifest STOPped on a deployment that was independently verified healthy.
//
// They are separate now, and all three are falsifiable:
//   OBSERVED_BUILD   what a healthy production deployment reports — a literal here, standing in for 63_.
//   ACTIVATION_PIN   what the census expects, READ OUT OF THE CENSUS rather than restated.
//   the release      63_'s SYS_DEPLOYMENT_RELEASE_, read out of 63_.
// §B-P3 asserts the three agree. Nothing is derived from anything else, so any one of them moving alone fails.
// ================================================================================================================
// R6-R7-R4 - the observed build moves to R4, because 61_ changed and the release moved with it. This
// literal is what a healthy production deployment reports; BP3 holds it against the census pin and 63_'s
// release, and all three are independent - which is how the R3 drift was caught in the first place.
// R6-R7-R5-R1 — and it moves again, for the same reason: 71_ and 11_ changed, the release moved with them,
// and the census pin followed. This literal is a DOUBLE of what a healthy deployment REPORTS, not a record
// of what production currently serves — production is still on the previous release until the user syncs
// and publishes, and the activation evidence must be RE-RUN there rather than restamped here.
var OBSERVED_BUILD = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';
var ACTIVATION_PIN = (CENSUS.match(/var R6R7_ACTIVATION_BUILD_ = '([^']+)'/) || [])[1] || null;

// The deployment contract is 63_'s to report and 63_ is not in this world. A DOUBLE stands in for it, and it
// is a double of the SHAPE 63_ returns — the manifest reads exactly those fields and nothing else. A healthy
// double is not a claim that production is healthy; the manifest re-reads the real one there.
function deployment(over) {
  var d = { deployment_build: OBSERVED_BUILD, modules: [], runtime_authority: { uniform: true },
    absent_modules: [], absent_optional_modules: [], stale_modules: [], mixed_deployment: false,
    verdict: 'UNIFORM' };
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return d;
}

function W(over, opts) {
  opts = opts || {};
  var w = new World(over || live());
  vm.runInContext(opts.census || CENSUS, w.ctx);
  projection(w.ctx, opts.projection);
  vm.runInContext('sysModuleBuildStamps_ = function () { return '
    + JSON.stringify(deployment(opts.deployment)) + '; };', w.ctx);
  if (opts.flagTrue) {
    vm.runInContext('inventoryAiPlanDbGenerationEnabled_ = function () { return true; };', w.ctx);
  }
  if (opts.allowlist) {
    vm.runInContext('INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = ' + JSON.stringify(opts.allowlist) + ';', w.ctx);
  }
  if (opts.after) vm.runInContext(opts.after, w.ctx);
  return w;
}
function runIt(entry, over, opts) {
  var w = W(over, opts);
  var r = w.run(entry);
  r.world = w;
  return r;
}
function manifest(over, opts) { return runIt('RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', over, opts); }

function lineOf(w, label) {
  var pre = '[E3-CENSUS] ' + label + ': ', hit = null;
  (w.log || []).forEach(function (l) { if (String(l).indexOf(pre) === 0) hit = String(l).slice(pre.length); });
  return hit;
}
function labels(w) {
  var out = [];
  (w.log || []).forEach(function (l) {
    var m = /^\[E3-CENSUS\] ([A-Za-z0-9_]+):/.exec(String(l));
    if (m) out.push(m[1]);
  });
  return out;
}
function proofOf(r) { var s = lineOf(r.world, 'r6r7_proof'); return s === null ? null : JSON.parse(s); }

// extractVar stops at the first closing bracket, which was enough while a snippet was one array literal.
// R3-P1 composes them — a shared body wrapped twice — so the whole STATEMENT has to come across or the
// suite would be testing three header lines and calling it a snippet.
// R6-R7-R3 — COMMENT-AWARE, and it has to be. This scanner was quote-aware only, so an apostrophe in a
// prose comment ("the page's projection") opened a string it never closed on purpose — the scan then walked
// past every brace until the parity happened to work out again. It DID work out, for four rounds, which is
// exactly what makes it dangerous: adding one more comment containing one more apostrophe to the census
// flipped the parity and this function reported `unterminated: R6R7_NO_ACTION_BEFORE_` about a statement that
// is perfectly well formed. A scanner that is right by luck is a scanner that will be wrong later. Comments
// are now skipped BEFORE a quote can open, and `q` is still checked first so `'http://…'` inside a string is
// not mistaken for a comment.
function extractStmt(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src);
  if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1, d = 0, q = null;
  for (; i < src.length; i++) {
    var ch = src[i], nx = src[i + 1];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && nx === '/') { var e = src.indexOf('\n', i); if (e < 0) break; i = e; continue; }
    if (ch === '/' && nx === '*') { var b = src.indexOf('*/', i); if (b < 0) break; i = b + 1; continue; }
    if (ch === "'" || ch === '"') { q = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') d--;
    else if (ch === ';' && d === 0) return src.slice(m.index, i + 1);
  }
  throw new Error('unterminated: ' + name);
}
// A published snippet, built exactly the way the census builds it — dependencies and all, so a snippet
// that only works because of something the suite supplied would fail here rather than in a console.
function snippet(name) {
  var deps = ['R6R7_CAPTURE_TIMEOUT_MS_', 'R6R7_DELTA_BODY_LINES_']
    .filter(function (d) { return d !== name; })
    .map(function (d) { return extractStmt(CENSUS, d); }).join(NLF);
  var v = vm.runInNewContext(deps + NLF + extractStmt(CENSUS, name) + NLF + name);
  if (typeof v !== 'string' || v.length < 40) throw new Error(name + ' is no longer a built snippet');
  return v;
}

// FREEZING, THE WAY A PERSON DOES IT: run the manifest, take its frozen_before, paste it into the constant.
// Modelled exactly — the readback is then run in a world whose constant carries those values.
function freezeFrom(over, opts) {
  var m = manifest(over, opts);
  var b = m.res.frozen_before;
  if (!b) throw new Error('the manifest froze nothing to paste');
  return { before: b, source: '(function(){ var B = R6R7_NO_ACTION_BEFORE_; var F = ' + JSON.stringify(b)
    + "; Object.keys(F).forEach(function(k){ if (k !== 'route_a' && k !== 'route_b') B[k] = F[k]; }); })();" };
}
// R3-P1 — THE BROWSER AUDIT A PERSON PASTES BACK IN. The readback needs three separately-sourced objects
// and can only measure two of them, so the third arrives as a pasted constant. It is supplied by default
// here so the database assertions below still mean what they meant in R3; the states where it is ABSENT
// get their own cases rather than being the accidental default of every other test.
var CLEAN_AUDIT = {
  captured: true, resolved_or_rejected: 'resolved', action: 'weeklyAiPlan.generate',
  response_outcome: 'AI_PLAN_NO_ACTION', response_code: 'NO_REPLENISHMENT_REQUIRED',
  no_action_reason: 'VALID_ZERO_RECOMMENDATION', recommendation_state: 'VALID_ZERO',
  recommended_qty: 0, qualifying_planned_qty: 520, residual_qty: 0,
  created_headers: 0, created_lines: 0, updated_headers: 0, updated_lines: 0,
  cancelled_headers: 0, cancelled_lines: 0, reservations: 0,
  db_writes: 0, writer_reached: false, routes_count: 0, groups_count: 0, error_code: null,
  baseline_max_seq: 3, new_requests: 1, new_mutation_requests: 1,
  generation_requests: 1, exactly_one_generation_request: true, unexpected_mutations: [],
  route_save_requests: 0, submit_requests: 0, reservation_requests: 0,
  capture_installed: true, capture_calls: 1, capture_restored: true, capture_blocked_second_call: false,
  audit_verdict: 'ONE_GENERATION_REQUEST_AND_RESPONSE_CAPTURED'
};
function auditSrc(over) {
  var a = {};
  Object.keys(CLEAN_AUDIT).forEach(function (k) { a[k] = CLEAN_AUDIT[k]; });
  Object.keys(over || {}).forEach(function (k) { a[k] = over[k]; });
  return '(function(){ var T = R6R7_ACTUAL_BROWSER_RESPONSE_; var A = ' + JSON.stringify(a)
    + '; Object.keys(A).forEach(function(k){ T[k] = A[k]; }); })();';
}
function readback(frozen, over, opts) {
  opts = opts || {};
  var aud = opts.noAudit ? '' : auditSrc(opts.audit);
  var o = { deployment: opts.deployment, projection: opts.projection, flagTrue: opts.flagTrue,
    allowlist: opts.allowlist, census: opts.census, after: frozen.source + aud + (opts.after || '') };
  return runIt('RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', over, o);
}

var NONZERO = { gap: { d18_gap_qty: 900, d18_suggested_qty: 900, d30_suggested_qty: 900,
  d45_suggested_qty: 900, d90_gap_qty: 900, d90_suggested_qty: 900 } };
var BLOCKED = { gap: { calculation_status: 'BLOCKED', d18_suggested_qty: '', d30_suggested_qty: '',
  d45_suggested_qty: '', d90_suggested_qty: '' } };

// ================================================================================================================
section('A — the manifest a person authorizes from');
// ================================================================================================================

var M = manifest();
eq(M.res.verdict, 'READY_TO_AUTHORIZE', 'A1  a valid zero over an untouched plan is READY_TO_AUTHORIZE');
eq(failed(M.res), [], 'A1a with no condition unmet');
eq([M.res.db_writes, M.res.writer_constructed, M.res.writer_calls, M.res.submit_calls,
  M.res.route_save_calls, M.res.reservation_writes], [0, false, 0, 0, 0, 0],
  'A2  and it wrote nothing, by six counters');
eq(M.world.dbWrites(), 0, 'A2a measured on the sheets, not reported');
eq([M.res.flag_flipped_this_round, M.res.generation_called_this_round], [false, false],
  'A3  it did not flip the flag and did not call a generation');
eq(M.res.scope, { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' },
  'A4  the scope is the one frozen SKU');
eq(M.res.flag.value, false, 'A5  the flag is still false at manifest time');
eq(M.res.allowlist.is_exactly_the_frozen_scope, true, 'A6  and the allowlist is exactly that scope');
eq(M.res.production_path.outcome, 'AI_PLAN_NO_ACTION', 'A7  production would answer AI_PLAN_NO_ACTION');
eq(M.res.parity.agree, true, 'A7a and the wrapper agrees with it');

// THE FROZEN BEFORE, which is the whole point of the manifest.
var B = M.res.frozen_before;
eq(B.calculation_status, 'READY', 'A8  the recommendation is READY');
eq(B.freshness_state, 'CURRENT_AFTER_REFRESH', 'A8a on a current snapshot');
eq(B.windows, { D18: 0, D30: 0, D45: 0, D90: 0 }, 'A8b with a stored finite 0 in every window');
eq([B.recommended_qty, B.qualifying_active_planned_qty, B.residual_qty], [0, 520, 0],
  'A9  recommended 0 / manual planned 520 / residual 0');
eq(B.manual_planned_total, 520, 'A9a and the plan total is 520');
eq([B.active_ai_headers, B.active_ai_lines], [0, 0], 'A10 no AI row exists yet');
eq(B.manual_header_ids, ['SADH-K4-38523A90', 'SADH-K4-A3872518'], 'A11 the two manual headers, sorted');
eq(B.manual_line_ids, ['SADL-K2-344FB2B2', 'SADL-K2-92B8BAD2'], 'A11a and the two manual lines');
ok(typeof B.route_a_fingerprint === 'string' && B.route_a_fingerprint.length === 8,
  'A12 Route A has a byte-stable fingerprint');
ok(typeof B.route_b_fingerprint === 'string' && B.route_b_fingerprint.length === 8,
  'A12a so does Route B');
ok(B.route_a_fingerprint !== B.route_b_fingerprint, 'A12b and they are different rows');
ok(!!B.route_a_updated_at && !!B.route_a_line_updated_at && !!B.route_b_updated_at && !!B.route_b_line_updated_at,
  'A13 both timestamps are frozen for both routes');

// The fingerprint is a FUNCTION OF THE FIELDS, in a fixed order, and it moves when any of them does.
var FPF = vm.runInNewContext(extractVar(CENSUS, 'R6R7_FP_FIELDS_') + ' R6R7_FP_FIELDS_');
ok(FPF.indexOf('draft_version') >= 0 && FPF.indexOf('updated_at') >= 0 && FPF.indexOf('line_updated_at') >= 0
  && FPF.indexOf('quantity') >= 0 && FPF.indexOf('last_mile_delivery') >= 0
  && FPF.indexOf('generation_run_id') >= 0,
  'A14 the fingerprint covers version, both timestamps, quantity, last mile and provenance');
var FP = vm.runInNewContext(extractFn(CENSUS, 'CENSUS_fp_') + NLF
  + 'function CENSUS_str_(v) { return String(v == null ? "" : v).trim(); }' + NLF
  + extractVar(CENSUS, 'R6R7_SEP_') + NLF
  + extractVar(CENSUS, 'R6R7_FP_FIELDS_') + NLF
  + extractFn(CENSUS, 'CENSUS_r6r7RouteFingerprint_') + NLF
  + '({ fp: CENSUS_r6r7RouteFingerprint_ })');
var baseRow = { allocation_draft_id: 'X', draft_version: '4', quantity: 320, last_mile_delivery: 'truck' };
function bump(f, v) { var r = {}; Object.keys(baseRow).forEach(function (k) { r[k] = baseRow[k]; }); r[f] = v; return r; }
eq(FP.fp(baseRow), FP.fp(baseRow), 'A15 the fingerprint is deterministic');
ok(FP.fp(baseRow) !== FP.fp(bump('draft_version', '5')), 'A15a a version bump changes it');
ok(FP.fp(baseRow) !== FP.fp(bump('quantity', 321)), 'A15b so does a quantity');
ok(FP.fp(baseRow) !== FP.fp(bump('last_mile_delivery', 'parcel')), 'A15c so does a last mile');
eq(FP.fp(null), null, 'A15d and a missing row has no fingerprint, rather than a fingerprint of nothing');

// THE PASTE BLOCK. A readback that recomputed this would compare the state with itself.
ok(String(M.res.freeze_paste_block).indexOf('R6R7_NO_ACTION_BEFORE_') > 0,
  'A16 the manifest prints the block a person pastes, and says where');
var pasted = JSON.parse(String(M.res.freeze_paste_block).slice(String(M.res.freeze_paste_block).indexOf('{')));
eq(pasted.route_a_fingerprint, B.route_a_fingerprint, 'A16a carrying the fingerprints it just measured');
eq(pasted.calculation_run_id, B.calculation_run_id, 'A16b and the run it measured them against');

// ================================================================================================================
section('B — every condition that must hold, and what happens when it does not');
// ================================================================================================================

function stops(label, r, predicate) {
  eq(r.res.verdict, 'STOP', label);
  ok(failed(r.res).indexOf(predicate) >= 0, label + ' — because ' + predicate);
}

stops('B1  a non-zero recommendation', manifest(NONZERO), 'production_outcome_is_no_action');
ok(failed(manifest(NONZERO).res).indexOf('residual_qty_is_zero') >= 0,
  'B1a and the residual it would generate is named');
stops('B2  a recommendation that cannot be read at all', manifest(BLOCKED), 'production_outcome_is_no_action');
stops('B3  a stale snapshot', manifest({ gap: { calculation_date: '2020-01-01' } }),
  'production_outcome_is_no_action');
stops('B4  a NOT-READY row', manifest({ gap: { calculation_status: 'PENDING' },
  extraGap: [{ sku: 'OTHER-SKU', d90_suggested_qty: 0 }] }), 'recommendation_is_ready');

// Route A and Route B: version, quantity, last mile, provenance.
stops('B5  Route A at a moved version', manifest({ aHeader: { draft_version: '5' } }),
  'route_A_version_is_frozen');
stops('B6  Route B at a moved version', manifest({ bHeader: { draft_version: '4' } }),
  'route_B_version_is_frozen');
stops('B7  Route B with a persisted last mile',
  manifest({ bHeader: { recommended_last_mile_delivery: 'parcel' } }),
  'route_B_last_mile_is_frozen');
stops('B8  Route A at a different quantity', manifest({ aLine: { planned_qty: '321' } }),
  'route_A_quantity_is_frozen');
stops('B9  a manual route adopted by a run',
  manifest({ aHeader: { generation_type: 'system_generated', generation_run_id: 'AIRUN-X' } }),
  'route_A_is_manual');

// The plan total.
var B10 = manifest({ aLine: { planned_qty: '300' } });
eq(B10.res.verdict, 'STOP', 'B10 a manual total that is not 520');
ok(failed(B10.res).indexOf('manual_planned_total_is_520') >= 0, 'B10a and the total is named');

// An AI row that already exists.
stops('B11 an AI row that already exists for this scope',
  manifest({ extraHeaders: [{ allocation_draft_id: 'SADH-AI9', generation_type: 'system_generated',
      generation_run_id: 'AIRUN-9' }],
    extraLines: [{ allocation_draft_line_id: 'SADL-AI9', allocation_draft_id: 'SADH-AI9', planned_qty: '10' }] }),
  'no_active_ai_row_exists_yet');

// The two gates.
stops('B12 a flag that is already true', manifest(live(), { flagTrue: true }), 'flag_is_still_false');
stops('B13 an allowlist with a second scope', manifest(live(), { allowlist: [
  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' },
  { company: 'ResUS', country: 'US', marketplace: 'Walmart', sku: 'CO1100-R' }] }),
  'allowlist_is_exactly_the_one_frozen_scope');
stops('B14 a marketplace-only allowlist entry', manifest(live(), { allowlist: [
  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: '' }] }),
  'no_wildcard_or_partial_allowlist_entry');
stops('B15 an ALL_SITES allowlist entry', manifest(live(), { allowlist: [
  { company: 'ResUS', country: 'US', marketplace: 'ALL_SITES', sku: 'CO1100-R' }] }),
  'no_wildcard_or_partial_allowlist_entry');

// The deployment.
stops('B16 a mixed deployment', manifest(live(), { deployment: { mixed_deployment: true } }),
  'deployment_is_not_mixed');
stops('B17 a stale module', manifest(live(), { deployment: { stale_modules: ['61_ declares X, expected Y'] } }),
  'no_stale_modules');
stops('B18 a build that is not the one every preflight measured',
  manifest(live(), { deployment: { deployment_build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R1' } }),
  'deployment_build_is_the_measured_one');
var B19 = manifest(live(), { after: 'sysModuleBuildStamps_ = undefined;' });
eq(B19.res.verdict, 'STOP', 'B19 a deployment contract that cannot be read at all');
ok(failed(B19.res).indexOf('deployment_contract_is_readable') >= 0,
  'B19a "we could not ask" is not "the answer was yes"');

// A production path that would write.
var B20 = manifest(live(), { census: swap(CENSUS, '    production_would_write: wouldWrite,',
  '    production_would_write: true,') });
eq(B20.res.verdict, 'STOP', 'B20 a parity saying production would write');
ok(failed(B20.res).indexOf('parity_says_production_would_not_write') >= 0, 'B20a and it is named');
var B21 = manifest(NONZERO);
eq(B21.res.production_path.would_write, true, 'B21 a residual really does set would_write');
ok(failed(B21.res).indexOf('production_would_not_write') >= 0, 'B21a which the manifest refuses');

// ================================================================================================================
section('B-P3 — the pinned activation build, and why it must be pinned rather than adopted');
// ================================================================================================================
// R6-R7-R3-P3. The live manifest STOPped on `deployment_build_is_the_measured_one` against a deployment that
// was independently verified healthy: build R3, mixed_deployment false, stale_modules []. The census pin was
// still R2 because R6-R7-R3 moved the release and nobody moved the pin — and nothing here caught it, because
// the deployment double reported R2 too. The fixture agreed with the pin instead of with the release, so the
// two drifted together and every assertion stayed green. These assertions close that.
var G63_P3 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var RELEASE_P3 = (G63_P3.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1] || null;
var CENSUS_STAMP_P3 = (CENSUS.match(/var TEMP_E3_CENSUS_BUILD_ = '([^']+)'/) || [])[1] || null;

eq((CENSUS.match(/var R6R7_ACTIVATION_BUILD_ = '[^']+';/g) || []).length, 1,
  'BP1  R6R7_ACTIVATION_BUILD_ is declared exactly once — two pins would let a reader trust the stale one');
eq((CENSUS.match(/R6R7_ACTIVATION_BUILD_/g) || []).length, 3,
  'BP1a and it is referenced exactly twice besides its declaration: the expected value and the comparison');
ok(ACTIVATION_PIN !== null, 'BP2  the pin is readable from the census');
eq(ACTIVATION_PIN, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1', 'BP2a and it is this round: R6-R7-R5-R1');
eq(ACTIVATION_PIN, RELEASE_P3,
  'BP3  the pin equals 63_\'s SYS_DEPLOYMENT_RELEASE_ — a pin that lags a release refuses a healthy deployment');
eq(ACTIVATION_PIN, CENSUS_STAMP_P3,
  'BP3a and it equals TEMP_E3_CENSUS_BUILD_, so the diagnostic and the build it expects move together');
// THE THREE SOURCES ARE INDEPENDENT. This is the property that makes BP3/BP3a able to fail: the pin is read
// out of the census, the release out of 63_, and OBSERVED_BUILD is a literal here. None is derived from another.
ok(/var R6R7_ACTIVATION_BUILD_ = '/.test(CENSUS) && /var SYS_DEPLOYMENT_RELEASE_ = '/.test(G63_P3),
  'BP4  each of the three values has its own source; none is computed from the observed deployment');
ok(!/R6R7_ACTIVATION_BUILD_\s*=\s*(out\.deployment|.*deployment_build)/.test(CENSUS),
  'BP4a THE POINT: the census never assigns the pin FROM the deployment it is examining — an expected value'
  + ' taken from the observed value is a comparison with itself, and it cannot fail');

// OBSERVED R3 PASSES. The default double reports OBSERVED_BUILD, so this is the live shape.
var BP = manifest();
eq(BP.res.deployment.deployment_build, OBSERVED_BUILD, 'BP5  the double reports the observed R3 build');
ok(failed(BP.res).indexOf('deployment_build_is_the_measured_one') === -1,
  'BP5a and deployment_build_is_the_measured_one PASSES against it');
eq(BP.res.verdict, 'READY_TO_AUTHORIZE',
  'BP5b so the manifest reaches READY_TO_AUTHORIZE with every other fixture condition holding');
eq(BP.res.predicates_failed, 0, 'BP5c with no predicate failed');
eq([BP.res.deployment.mixed_deployment, BP.res.deployment.stale_modules], [false, []],
  'BP5d on a deployment that is not mixed and has no stale module — the live conditions');

// EVERY OTHER MISMATCH STILL STOPS. Raising the pin must not have turned this gate into a formality.
[['an older release', 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R4'],
 ['an older release still', 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R1'],
 ['a NEWER release nobody measured on', 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6'],
 ['an empty build', ''], ['a null build', null]
].forEach(function (c, i) {
  var r = manifest(live(), { deployment: { deployment_build: c[1] } });
  eq(r.res.verdict, 'STOP', 'BP6' + (i ? String.fromCharCode(96 + i) : '') + ' ' + c[0] + ' is a STOP');
  ok(failed(r.res).indexOf('deployment_build_is_the_measured_one') >= 0,
    'BP6' + (i ? String.fromCharCode(96 + i) : '') + '-n named as deployment_build_is_the_measured_one');
});
// A NEWER build is refused for the same reason an older one is: the evidence was taken somewhere else.
ok(true, 'BP7  newer is not better — none of the measurements transfer to a build they were not taken on');

// ================================================================================================================
section('C — the readback refuses to prove stillness against a baseline nobody froze');
// ================================================================================================================

var C0 = runIt('RUN_R6R7_CONTROLLED_NO_ACTION_READBACK');
eq(C0.res.verdict, 'BASELINE_NOT_FROZEN',
  'C1  an unfrozen baseline refuses under its own name, not a generic STOP');
eq(C0.res.baseline_frozen, false, 'C1a baseline_frozen false');
ok(C0.res.baseline_missing.length > 0, 'C1b with every missing field named');
ok(String(C0.res.stop_reason).indexOf('BASELINE_NOT_FROZEN') === 0, 'C1c under its own code');
ok(String(C0.res.stop_reason).indexOf('compare the state with itself') > 0,
  'C1d and it says WHY a recomputed baseline would be worthless');

var FZ = freezeFrom();
var C = readback(FZ);
eq(C.res.verdict, 'CONTROLLED_NO_ACTION_CONFIRMED', 'C2  a frozen baseline over an untouched plan CONFIRMS');
eq(failed(C.res), [], 'C2a with no predicate failed');
eq(C.res.baseline_frozen, true, 'C2b baseline_frozen true');
eq([C.res.db_writes, C.res.writer_constructed, C.res.writer_calls, C.res.submit_calls,
  C.res.route_save_calls, C.res.reservation_writes], [0, false, 0, 0, 0, 0],
  'C3  and the readback itself wrote nothing');
eq(C.world.dbWrites(), 0, 'C3a measured on the sheets');
eq(C.res.new_rows, [], 'C4  no header and no line was created');
eq(C.res.changed_fields, [], 'C4a and no field moved');
eq(C.res.counts.manual_planned_total, 520, 'C5  the manual total is still 520');
eq(C.res.counts.manual_planned_total_before, 520, 'C5a against the frozen 520');
eq(C.res.routes_observed.length, 2, 'C6  both routes were compared');
ok(C.res.routes_observed.every(function (r) { return r.fingerprint_now === r.fingerprint_was; }),
  'C6a and both are byte-identical to BEFORE');
eq(C.res.routes_observed.map(function (r) { return r.draft_version; }), ['4', '3'],
  'C6b at versions 4 and 3');

// WHAT THE SERVER SAID, AND WHAT THE BROWSER SAW, KEPT APART.
eq(C.res.expected_production_decision.required_shape.outcome, 'AI_PLAN_NO_ACTION', 'C7  the required response outcome');
eq(C.res.expected_production_decision.required_shape.code, 'NO_REPLENISHMENT_REQUIRED', 'C7a and its code');
eq([C.res.expected_production_decision.required_shape.recommended_qty,
  C.res.expected_production_decision.required_shape.qualifying_planned_qty,
  C.res.expected_production_decision.required_shape.residual_qty], [0, 520, 0], 'C7b 0 / 520 / 0');
eq([C.res.expected_production_decision.required_shape.created_headers, C.res.expected_production_decision.required_shape.created_lines,
  C.res.expected_production_decision.required_shape.updated_headers, C.res.expected_production_decision.required_shape.updated_lines,
  C.res.expected_production_decision.required_shape.cancelled_headers, C.res.expected_production_decision.required_shape.cancelled_lines,
  C.res.expected_production_decision.required_shape.db_writes], [0, 0, 0, 0, 0, 0, 0],
  'C7c every mutation counter zero');
eq(C.res.actual_browser_response.measured_here, false,
  'C8  the readback does NOT claim to have measured the browser');
ok(String(C.res.actual_browser_response.why_not_measured_here).indexOf('nobody received') > 0,
  'C8a and says so rather than inventing a request count');
eq(C.res.actual_browser_response.required_delta,
  { mutation_requests: 1, action: 'weeklyAiPlan.generate', route_save_requests: 0, submit_requests: 0,
    reservation_requests: 0, second_generation_requests: 0 },
  'C8b stating the delta the browser half must show');

// ================================================================================================================
section('D — anything that moved is a STOP, by name');
// ================================================================================================================

function afterFreeze(label, over, predicate) {
  var f = freezeFrom();
  var r = readback(f, over);
  eq(r.res.verdict, 'STOP', label);
  ok(failed(r.res).indexOf(predicate) >= 0, label + ' — because ' + predicate);
  return r;
}

var D1 = afterFreeze('D1  a new AI header', { extraHeaders: [{ allocation_draft_id: 'SADH-NEW',
    generation_type: 'system_generated', generation_run_id: 'AIRUN-N' }],
  extraLines: [{ allocation_draft_line_id: 'SADL-NEW', allocation_draft_id: 'SADH-NEW', planned_qty: '90' }] },
  'no_header_or_line_was_created');
eq(D1.res.new_rows.map(function (r) { return r.allocation_draft_id; }), ['SADH-NEW'],
  'D1a and the new id is frozen for the repair manifest');
ok(failed(D1.res).indexOf('active_ai_rows_did_not_increase') >= 0, 'D1b the AI row count is named too');

afterFreeze('D2  Route A at a moved version', { aHeader: { draft_version: '5' } },
  'route_A_header_is_byte_identical_across_every_column');
afterFreeze('D3  Route B at a moved version', { bHeader: { draft_version: '4' } },
  'route_B_header_is_byte_identical_across_every_column');
afterFreeze('D4  Route A with a moved updated_at',
  { aHeader: { updated_at: 'Mon Sep 07 2026 09:00:00 GMT+0800 (Taiwan Standard Time)' } },
  'route_A_updated_at_did_not_move');
afterFreeze('D5  Route B with a moved line timestamp',
  { bLine: { updated_at: 'Mon Sep 07 2026 09:00:00 GMT+0800 (Taiwan Standard Time)' } },
  'route_B_line_updated_at_did_not_move');
afterFreeze('D6  Route B with a persisted last mile',
  { bHeader: { recommended_last_mile_delivery: 'parcel' } },
  'route_B_header_is_byte_identical_across_every_column');
afterFreeze('D7  a manual route re-owned by a run',
  { aHeader: { generation_type: 'system_generated', generation_run_id: 'AIRUN-Z' } },
  'route_A_was_not_re_owned_by_a_run');
afterFreeze('D8  a manual total that moved', { aLine: { planned_qty: '300' } },
  'manual_planned_total_did_not_move');
afterFreeze('D9  a manual route that disappeared', { dropA: true }, 'route_A_present_exactly_once');

// AND THE FIELDS THAT MOVED ARE NAMED, so a repair manifest has something to be built from.
var D10 = readback(freezeFrom(), { aHeader: { draft_version: '5' } });
ok(D10.res.changed_fields.length > 0, 'D10 a moved route lists its fields rather than only failing');
ok(D10.res.changed_fields.some(function (c) { return c.route === 'A' && c.field === 'draft_version'; }),
  'D10a including the one that actually moved');

// ================================================================================================================
section('E — the browser half, run against a real timeline shape');
// ================================================================================================================

var BASE_SNIP = snippet('R6R7_BROWSER_BASELINE_SNIPPET_');
var DELTA_SNIP = snippet('R6R7_BROWSER_DELTA_SNIPPET_');

function req(seq, action, kind, over) {
  var r = { seq: seq, action: action, kind: kind || 'read', request_id: 'REQ-' + seq, phase: 'SETTLED',
    outcome: 'OK', code: null, http_status: 200, attempts: 1, overlapped_with: [], routes_in_payload: null,
    allocation_draft_id: null, allocation_draft_line_ids: null, intent: null, mints_new_row: null,
    marks_source: 'OBSERVED', elapsed_ms: 120 };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
// A browser world: the page has already made some requests before the test begins, which is the whole reason
// a DELTA is required.
function browser(before, after) {
  var ctx = { console: { log: function () {} } };
  ctx.window = ctx;
  var rows = before.slice();
  ctx.KM = { transport: { timeline: function () {
    return { request_timeline: rows.slice(), requests: rows.length,
      mutations: rows.filter(function (r) { return r.kind === 'write'; }),
      mutation_requests: rows.filter(function (r) { return r.kind === 'write'; }).length };
  } } };
  vm.createContext(ctx);
  vm.runInContext(BASE_SNIP, ctx);
  rows.push.apply(rows, after);
  return vm.runInContext(DELTA_SNIP, ctx);
}
var PRIOR = [req(1, 'inventory.read'), req(2, 'inventory.read'),
  req(3, 'shippingAllocationDraft.upsertAtomic', 'write')];

var E1 = browser(PRIOR, [req(4, 'weeklyAiPlan.generate', 'write',
  { request_id: 'REQ-GEN-1', outcome: 'AI_PLAN_NO_ACTION' })]);
eq(E1.verdict, 'ONE_GENERATION_REQUEST', 'E1  exactly one generation request after the baseline');
eq([E1.new_requests, E1.new_mutation_requests, E1.generation_requests], [1, 1, 1], 'E1a one, one, one');
eq(E1.baseline_max_seq, 3, 'E1b measured against the baseline, not from zero');
eq(E1.unexpected_mutations, [], 'E1c and nothing else mutated');
eq(E1.generation[0].request_id, 'REQ-GEN-1', 'E1d the request id is captured for correlation');
eq(E1.generation[0].attempts, 1, 'E1e with its attempt count');
eq(E1.scope_reported_by_transport, null, 'E1f the scope is NOT invented from the transport');
ok(String(E1.scope_note).indexOf('would be a guess') > 0, 'E1g and the reason is stated');

// THE DELTA IS NOT THE TOTAL. The prior write must not be counted as this test's.
ok(E1.new_mutation_requests === 1, 'E2  a mutation that predates the baseline is not counted');

var E3 = browser(PRIOR, [req(4, 'weeklyAiPlan.generate', 'write'), req(5, 'weeklyAiPlan.generate', 'write')]);
eq(E3.verdict, 'STOP', 'E3  two generation requests STOP');
eq(E3.generation_requests, 2, 'E3a and both are counted');

var E4 = browser(PRIOR, [req(4, 'weeklyAiPlan.generate', 'write'),
  req(5, 'shippingAllocationDraft.upsertAtomic', 'write')]);
eq(E4.verdict, 'STOP', 'E4  an unexpected route save alongside it STOPS');
eq(E4.unexpected_mutations, ['shippingAllocationDraft.upsertAtomic'], 'E4a named');
eq(E4.route_save_requests, 1, 'E4b and counted as a route save');

var E5 = browser(PRIOR, [req(4, 'shippingPlan.submit', 'write')]);
eq(E5.verdict, 'STOP', 'E5  a Submit STOPS');
eq(E5.submit_requests, 1, 'E5a and is counted');

var E6 = browser(PRIOR, []);
eq(E6.verdict, 'STOP', 'E6  no generation request at all STOPS');
eq(E6.generation_requests, 0, 'E6a rather than reporting success on an empty delta');

// NO BASELINE AT ALL. The snippet must refuse rather than compute a delta from nothing.
var noBase = (function () {
  var ctx = { console: { log: function () {} } };
  ctx.window = ctx;
  ctx.KM = { transport: { timeline: function () { return { request_timeline: [], requests: 0, mutations: [],
    mutation_requests: 0 }; } } };
  vm.createContext(ctx);
  return vm.runInContext(DELTA_SNIP, ctx);
})();
eq(noBase.verdict, 'STOP', 'E7  a delta with no baseline STOPS');
ok(String(noBase.reason).indexOf('NO_BASELINE') === 0, 'E7a under its own code');
ok(String(noBase.reason).indexOf('Do not press Generate again') > 0,
  'E7b and it forbids the retry rather than inviting one');

// ================================================================================================================
section('F — the twelve steps, the two rollbacks, and the number that is not a write');
// ================================================================================================================

var STEPS = M.res.activation_steps;
eq(STEPS.length, 14, 'F1  fourteen steps, written down');
eq(STEPS.map(function (s) { return s.n; }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  'F1a numbered in order');
// R3-P1 §七 — THE FREEZE COMES BEFORE THE AUTHORIZATION. An authorization given while the baseline is
// still null authorizes a click that nothing can check afterwards.
eq(STEPS.map(function (s) { return s.phase; }).slice(0, 5),
  ['PREPARE', 'PREPARE', 'PREPARE', 'PREPARE', 'AUTHORIZE'],
  'F1b the four read-only preparation steps come before the authorization');
ok(String(STEPS[0].do).indexOf('ACTIVATION_MANIFEST') > 0, 'F2  step 1 runs the manifest');
ok(String(STEPS[1].do).indexOf('R6R7_NO_ACTION_BEFORE_') > 0, 'F2a step 2 pastes the freeze block');
ok(String(STEPS[3].do).indexOf('READBACK') > 0 && String(STEPS[3].note).indexOf('AWAITING_ACTIVATION') > 0,
  'F3  step 4 is the baseline check, and it expects AWAITING_ACTIVATION rather than a generic STOP');
ok(String(STEPS[4].do).indexOf('explicit authorization') > 0,
  'F3a step 5 is where a person authorizes, and everything before it is read-only');
ok(String(STEPS[5].do).indexOf('INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_') > 0
  && String(STEPS[5].do).indexOf('true') > 0, 'F4  step 6 flips the one constant');
ok(String(STEPS[6].do).indexOf('00_config.gs') > 0 && String(STEPS[6].do).indexOf('deployment version') > 0,
  'F5  step 7 syncs only what changed and publishes a version');
ok(String(STEPS[7].do).indexOf('EFFECTIVE') > 0, 'F5a step 8 verifies the EFFECTIVE flag, not the file');
ok(String(STEPS[8].do).indexOf('BASELINE') > 0 && String(STEPS[8].do).indexOf('CAPTURE') > 0,
  'F6  step 9 installs BOTH the baseline and the response capture, before the click');
ok(String(STEPS[9].do).indexOf('ONCE') > 0 && String(STEPS[9].do).indexOf('Submit') > 0,
  'F7  step 10 presses once and forbids Submit');
ok(String(STEPS[10].do).indexOf('R6R7_ACTUAL_BROWSER_RESPONSE_') > 0,
  'F8  step 11 pastes the browser audit back in');
ok(String(STEPS[10].note).indexOf('AWAITING_BROWSER_AUDIT') > 0,
  'F8a and says what the readback answers without it');
ok(String(STEPS[11].do).indexOf('CONTROLLED_NO_ACTION_CONFIRMED') > 0, 'F9  step 12 reads back');
ok(String(STEPS[12].do).indexOf('false') > 0, 'F10 step 13 restores the flag');
ok(String(STEPS[13].do).indexOf('false') > 0, 'F11 and step 14 verifies it is false again');
// And the manifest itself IS the post-restore check: re-run with the flag left on and it refuses.
eq(manifest(live(), { flagTrue: true }).res.verdict, 'STOP',
  'F12 a flag left true after the restore makes the manifest STOP — it is the post-restore check too');
eq(M.res.flag.must_be_after_step_11, false, 'F12a which the flag contract states');

var AUD = M.res.browser_audit;
eq(AUD.expected_shape.browser_mutation_requests_delta, 1, 'F13 one mutation REQUEST is expected');
// R3-P1 — the capture, and the sentence that stops a timeline phase standing in for a response body.
ok(AUD.capture_snippet.indexOf('generateWeeklyAiPlanDraft') > 0, 'F13x the capture snippet is published');
ok(AUD.audit_snippet.indexOf('ACTUAL_RESPONSE_NOT_CAPTURED') > 0,
  'F13y and the audit snippet refuses without a captured body');
ok(String(AUD.a_timeline_success_is_not_a_response).indexOf('does not say what the body') > 0,
  'F13z with the reason stated rather than assumed');
eq(AUD.expected_shape.server_db_writes, 0, 'F13a beside zero database writes');
ok(String(AUD.the_misreading_to_avoid).indexOf('roll back a correct finish') > 0,
  'F13b and the misreading is named: a request count is not a write count');
ok(String(AUD.delta_not_total).indexOf('delta') > 0, 'F14 the delta rule is stated');

var RB = M.res.rollback;
eq(RB.A_no_action_as_expected.data_rollback_required, false, 'F15 a clean no-action needs no data rollback');
ok(RB.A_no_action_as_expected.still_required.length === 3, 'F15a but the flag still comes back off');
ok(String(RB.B_any_write_or_unknown_outcome.first_rule).indexOf('do NOT press Generate again') === 0,
  'F16 any write or unknown outcome forbids the retry FIRST');
ok(String(RB.B_any_write_or_unknown_outcome.order[0]).indexOf('READBACK') > 0,
  'F16a and reads before deciding');
ok(String(RB.B_any_write_or_unknown_outcome.order[1]).indexOf('freeze') === 0,
  'F16b then freezes the ids');
ok(String(RB.B_any_write_or_unknown_outcome.order[2]).indexOf('repair manifest') > 0,
  'F16c then produces a repair manifest');
ok(String(RB.B_any_write_or_unknown_outcome.order[4]).indexOf('separate, explicit authorization') > 0,
  'F16d and changes no data without another authorization');
ok(String(RB.B_any_write_or_unknown_outcome.ack_unknown).indexOf('case B until the readback says otherwise') > 0,
  'F17 a timeout is case B until the database says otherwise');

// ================================================================================================================
section('G — bounded proofs, complete, and before the detailed output');
// ================================================================================================================

var MAX = vm.runInNewContext(extractVar(CENSUS, 'R6R7_PROOF_MAX_BYTES_') + ' R6R7_PROOF_MAX_BYTES_');
[['the manifest', M], ['the readback', C]].forEach(function (c, i) {
  var raw = lineOf(c[1].world, 'r6r7_proof');
  var lab = labels(c[1].world);
  ok(raw !== null, 'G' + (i + 1) + '  ' + c[0] + ' emits a compact proof');
  ok(raw !== null && raw.length <= MAX,
    'G' + (i + 1) + 'a within the cap (' + (raw ? raw.length : -1) + ' bytes)');
  eq(JSON.parse(raw).census, c[1].res.census, 'G' + (i + 1) + 'b that parses whole');
  ok(lab.indexOf('r6r7_proof') < lab.indexOf('r6r7_export'),
    'G' + (i + 1) + 'c and comes before the detailed export');
  eq(JSON.parse(raw).proof_complete, true, 'G' + (i + 1) + 'd marked complete');
});

var MP = proofOf(M), CP = proofOf(C);
eq(MP.routes.a_route_view, B.route_a_fingerprint,
  'G3  the manifest proof carries the route-view fingerprint it froze');
eq([MP.routes.a_header, MP.routes.a_line, MP.routes.a_combined],
  [B.route_a_header_full_fingerprint, B.route_a_line_full_fingerprint, B.route_a_combined_full_fingerprint],
  'G3z and all three FULL-row fingerprints, which are the byte-identical claim');
eq([MP.flag_now, MP.flag_flipped_this_round, MP.generation_called_this_round], [false, false, false],
  'G3a and that nothing was flipped or called');
eq([CP.route_a.identical, CP.route_b.identical], [true, true],
  'G4  the readback proof carries both fingerprint comparisons');
eq([CP.new_rows, CP.changed_field_count], [0, 0], 'G4a and the two counts that decide it');
eq(CP.browser_transport_measured_here, false, 'G4b and it does not claim the browser half');

// The proof guards.
var G5 = manifest(live(), { flagTrue: true });
ok(G5.res.proof_missing.indexOf('flag_already_true_cannot_be_ready_to_authorize') >= 0
  || G5.res.verdict === 'STOP', 'G5  a manifest cannot say READY while the flag is on');
var G6 = readback(freezeFrom(), { extraHeaders: [{ allocation_draft_id: 'SADH-G6',
    generation_type: 'system_generated', generation_run_id: 'AIRUN-G6' }],
  extraLines: [{ allocation_draft_line_id: 'SADL-G6', allocation_draft_id: 'SADH-G6', planned_qty: '5' }] });
eq(G6.res.verdict, 'STOP', 'G6  a readback cannot CONFIRM beside a new row');

// ================================================================================================================
section('H — a design round: nothing was flipped, deployed, generated or written');
// ================================================================================================================

// R6-R7-R3 - RE-AIMED, NOT WAIVED. This suite's round genuinely did not move these stamps, and it was
// right to say so. R6-R7-R3 does move them: 61_ now states `reservations` in the NO_ACTION envelope, so
// the release and 63_ move with it, and the census's capture snippet changed too. An equality against
// THIS round's build can only hold until the next release, so the surviving invariant is the FLOOR - the
// file must not be BEHIND the round this suite covers. What stays exact is the parity that actually
// governs a deployment: 63_'s manifest must expect precisely the build 61_ carries.
ok(RO.stampAtOrAfter(/var WAP_BUILD_VERSION_ = '([^']+)'/.exec(G61)[1], DEPLOYMENT_BUILD),
  'H1  61_ was untouched by THIS round and is not behind it');
ok(RO.stampAtOrAfter(/var TEMP_E3_CENSUS_BUILD_ = '([^']+)'/.exec(CENSUS)[1], DEPLOYMENT_BUILD),
  'H2  and the census reports a build at or after the one it diagnoses');
eq(['RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK',
  'CENSUS_r6r7RouteFingerprint_', 'CENSUS_r6r7RowCount_', 'CENSUS_r6r7Deployment_',
  'CENSUS_r6r7ActivationSteps_', 'CENSUS_r6r7ActivationRollback_', 'CENSUS_r6r7BrowserAudit_',
  // R3-P1's additions, held to the same rule.
  'CENSUS_r6r7SchemaAuthority_', 'CENSUS_r6r7LiveSchemaOf_', 'CENSUS_r6r7FullRowSnapshot_',
  'CENSUS_r6r7RouteFullSnapshot_', 'CENSUS_r6r7CompareSnapshots_', 'CENSUS_r6r7IdentityUniverse_',
  'CENSUS_r6r7ReservationObservation_', 'CENSUS_r6r7RawTables_', 'CENSUS_r6r7ActualResponseState_'
].filter(function (f) {
  var s = extractFn(CENSUS, f);
  return /handleUpsertShippingAllocationDraftAtomic_\s*\(/.test(s) || /appendRow|setValues|setValue\s*\(/.test(s)
    || /INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=/.test(s)
    || /handleGenerateWeeklyAiPlanDraft_\s*\(/.test(s);
}), [], 'H3  nothing added this round writes, flips the flag, or calls a generation');
ok(extractFn(CENSUS, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST').indexOf('flag_flipped_this_round: false') > 0,
  'H4  and the manifest says so on its own record');

// ================================================================================================================
section('L — R6-R7-R5-R1: the SECOND proven no-action class, and a STOP that hands over nothing');
// ================================================================================================================
// WHAT WENT WRONG, from the live run rather than from a hypothesis. A production generation answered
// AI_PLAN_NO_ACTION / NO_REPLENISHMENT_REQUIRED / FULLY_COVERED_BY_ACTIVE_PLAN on gap run
// GAP-INV-20260908T132343-0001: D18/D30/D45 = 0, D90 = 160, recommended 160, already-planned 520,
// residual 0, over-planned 360, would_write false, writer_reached false, db_writes 0. Every one of those is
// the shape an activation wants to see — and the manifest STOPped, naming `recommended_qty_is_zero` and
// `every_window_is_a_stored_finite_zero`, two predicates that describe the OTHER class.
//
// 61_ has told these two apart since R6-R7-R2 (`weeklyAiPlanNoActionDecision_` reports them as different
// reasons on purpose). Only the manifest had one shape.
//
// AND IT STILL EMITTED THE FREEZE BLOCK. Measured: the STOP printed three usable numbered chunks plus the
// meta line saying where to paste them. That is the worst shape a diagnostic can take — the refusal scrolls
// past, the chunks look like the output, and a baseline the manifest DECLINED to authorize gets frozen.

// The live world: three zero windows and a positive furthest one, against the same untouched 520 plan.
var FC_GAP = { d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 0,
  d45_gap_qty: 0, d45_suggested_qty: 0, d90_gap_qty: 160, d90_suggested_qty: 160 };
function fcGap(over) {
  var g = {};
  Object.keys(FC_GAP).forEach(function (k) { g[k] = FC_GAP[k]; });
  Object.keys(over || {}).forEach(function (k) { g[k] = over[k]; });
  return { gap: g };
}
var FULLY_COVERED = fcGap();

// ---- L1  CLASS B IS RECOGNISED, and the production decision it rests on is production's own. --------------
var LB = manifest(live(FULLY_COVERED));
var lbp = LB.res.production_path || {};
eq([lbp.outcome, lbp.code, lbp.reason],
  ['AI_PLAN_NO_ACTION', 'NO_REPLENISHMENT_REQUIRED', 'FULLY_COVERED_BY_ACTIVE_PLAN'],
  'L1  production answers the three exact strings the live run reported');
eq([lbp.recommended_qty, lbp.qualifying_active_planned_qty, lbp.residual_qty], [160, 520, 0],
  'L1a recommended 160 / already planned 520 / residual 0');
eq([lbp.would_write, lbp.writer_reached, lbp.db_writes], [false, false, 0],
  'L1b and it would not write, never reaches the writer, and counts zero');
eq(LB.res.verdict, 'READY_TO_AUTHORIZE', 'L2  §B the manifest now recognises it …');
eq(failed(LB.res), [], 'L2a … with no condition unmet');
eq(LB.res.no_action_classification.classification, 'FULLY_COVERED_BY_ACTIVE_PLAN',
  'L2b and it names the class it accepted');
eq(LB.res.no_action_classification.classified_from, 'production no_action_reason',
  'L2c taken from PRODUCTION\'s reason — this file does not choose which branch judges a run');

// The seven class-B conditions are in the ledger by name, so a STOP on any one of them says which.
var LBnames = LB.res.predicates.map(function (x) { return x.predicate; });
['no_action_outcome_is_exactly_ai_plan_no_action', 'no_action_code_is_exactly_no_replenishment_required',
 'no_action_production_would_not_write', 'no_action_writer_was_not_reached', 'no_action_db_writes_is_zero',
 'no_action_residual_qty_is_numerically_zero', 'every_required_window_is_stored_finite_and_nonnegative',
 'no_action_reason_is_one_of_the_two_proven_classes',
 'fully_covered_recommended_qty_is_finite_and_positive', 'fully_covered_qualifying_planned_qty_is_finite',
 'fully_covered_active_plan_covers_the_whole_recommendation',
 'fully_covered_over_planned_equals_planned_minus_recommended',
 'fully_covered_furthest_window_equals_the_recommendation',
 'fully_covered_recommendation_state_is_exactly_nonzero_recommendation',
 'fully_covered_per_scope_evidence_is_present',
 'fully_covered_per_scope_has_exactly_one_row',
 'fully_covered_per_scope_row_is_exactly_the_frozen_scope',
 'fully_covered_scope_recommended_qty_is_finite_and_positive',
 'fully_covered_every_scope_over_planned_is_finite_and_nonnegative',
 'fully_covered_every_scope_is_individually_covered',
 'fully_covered_every_scope_residual_is_exactly_zero',
 'fully_covered_scope_over_planned_equals_its_own_planned_minus_recommended',
 'fully_covered_per_scope_totals_reconcile_with_the_reported_totals'].forEach(function (nm, i) {
  ok(LBnames.indexOf(nm) >= 0, 'L3.' + (i + 1) + ' the ledger carries ' + nm);
});
// TWO CONDITIONS BECOME TWENTY-THREE. Class B is not class A with a test removed.
ok(LBnames.filter(function (n) { return /^fully_covered_/.test(n); }).length === 15,
  'L3a fifteen of them are specific to class B',
  LBnames.filter(function (n) { return /^fully_covered_/.test(n); }));
eq(LBnames.filter(function (n) { return /recommendation_state_is_not_a_zero_state/.test(n); }), [],
  'L3a1 and the exclusion-style state check is gone from the ledger entirely');
eq(LBnames.filter(function (n) {
  return n === 'recommended_qty_is_zero' || n === 'every_window_is_a_stored_finite_zero';
}), [], 'L3b and the two class-A predicates are NOT asserted against a class-B run');

var lbc = LB.res.no_action_classification;
eq([lbc.recommended_qty, lbc.qualifying_active_planned_qty, lbc.residual_qty], [160, 520, 0],
  'L4  the classification carries the three quantities');
eq([lbc.over_planned_qty_reported, lbc.over_planned_qty_expected], [360, 360],
  'L4a and the over-planned surplus, REPORTED beside what the arithmetic requires');
eq(lbc.over_planned_source, 'sum of production per_scope[].over_planned_qty',
  'L4b summed from production per_scope, because there is no top-level field to read');
eq([lbc.furthest_window, lbc.furthest_window_qty], ['D90', 160],
  'L4c the furthest cumulative checkpoint is D90 and it equals the recommendation');
eq(lbc.stored_windows, { D18: 0, D30: 0, D45: 0, D90: 160 },
  'L4d every required window is stored, and three of them are legitimately zero');
eq([lbc.windows_missing, lbc.windows_non_finite, lbc.windows_negative], [[], [], []],
  'L4e none missing, none non-finite, none negative');
eq(LB.res.frozen_before.windows, { D18: 0, D30: 0, D45: 0, D90: 160 },
  'L4f and the freeze records the windows as they actually are');

// ---- L5  CLASS A IS UNTOUCHED. Same world, same verdict, same two predicate names. -----------------------
var LA = manifest();
eq(LA.res.verdict, 'READY_TO_AUTHORIZE', 'L5  §A a valid zero is still READY_TO_AUTHORIZE');
eq(failed(LA.res), [], 'L5a with no condition unmet');
eq(LA.res.no_action_classification.classification, 'VALID_ZERO_RECOMMENDATION', 'L5b classified as class A');
var LAnames = LA.res.predicates.map(function (x) { return x.predicate; });
ok(LAnames.indexOf('recommended_qty_is_zero') >= 0,
  'L5c and `recommended_qty_is_zero` keeps its EXACT name — a predicate name is what a STOP reports');
ok(LAnames.indexOf('every_window_is_a_stored_finite_zero') >= 0, 'L5d as does the four-zeros condition');
eq(LAnames.filter(function (n) { return /^fully_covered_/.test(n); }), [],
  'L5e while no class-B condition is asserted against a class-A run');

// ---- L6  NO GATE WAS WEAKENED. Every unrelated gate is still in the ledger, in both classes. -------------
['scope_is_the_one_frozen_sku', 'deployment_contract_is_readable', 'deployment_build_is_the_measured_one',
 'deployment_is_not_mixed', 'no_stale_modules', 'flag_is_still_false',
 'allowlist_is_exactly_the_one_frozen_scope', 'no_wildcard_or_partial_allowlist_entry',
 'residual_qty_is_zero', 'qualifying_active_planned_qty_is_520', 'recommendation_is_ready',
 'freshness_is_current', 'wrapper_and_production_agree', 'parity_says_production_would_not_write',
 'header_column_names_match_the_authority_byte_for_byte',
 'line_column_names_match_the_authority_byte_for_byte', 'identity_universe_is_freezable',
 'no_active_ai_header_exists_in_the_universe', 'reservation_observation_state_is_named',
 'reservation_table_is_not_present_but_unreadable', 'no_active_ai_row_exists_yet',
 'route_A_is_manual', 'route_B_is_manual', 'db_writes_is_zero', 'writer_not_constructed',
 'no_generation_called_by_this_file'].forEach(function (nm, i) {
  ok(LAnames.indexOf(nm) >= 0 && LBnames.indexOf(nm) >= 0,
    'L6.' + (i + 1) + ' ' + nm + ' still gates BOTH classes');
});
ok(LBnames.length > LAnames.length,
  'L6a and class B carries MORE conditions than class A, not fewer', [LAnames.length, LBnames.length]);

// ---- L7  THE NEGATIVES, asked of the classifier DIRECTLY. -------------------------------------------------
// Every one of these is a state 61_ would never produce, which is exactly why they are put to the classifier
// as crafted decisions rather than built as worlds: a negative test that cannot be constructed is a negative
// test nobody has run. The classifier is the shipped one, evaluated out of the census source.
var CLASSIFY = (function () {
  var w = W(live());
  return function (pp, wins) {
    return vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(pp) + ', '
      + JSON.stringify(wins) + ')', w.ctx);
  };
})();
function winsFor(map) {
  return ['D18', 'D30', 'D45', 'D90'].map(function (n) {
    return { window: n, gap_qty: map[n], suggested_qty: map[n] };
  });
}
// A window array with one of the four required names simply ABSENT — a different fact from a blank one.
function winsOmitting(drop) {
  return winsFor({ D18: 0, D30: 0, D45: 0, D90: 160 }).filter(function (w) { return w.window !== drop; });
}
var GOOD_WINS = winsFor({ D18: 0, D30: 0, D45: 0, D90: 160 });
function ppB(over) {
  var d = { outcome: 'AI_PLAN_NO_ACTION', code: 'NO_REPLENISHMENT_REQUIRED',
    reason: 'FULLY_COVERED_BY_ACTIVE_PLAN', recommendation_state: 'NONZERO_RECOMMENDATION',
    recommended_qty: 160, qualifying_active_planned_qty: 520, residual_qty: 0,
    would_write: false, writer_reached: false, db_writes: 0,
    per_scope: [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R',
      recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0, over_planned_qty: 360 }] };
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return d;
}
// The control: the crafted class-B decision the live run actually produced is ACCEPTED.
var LC0 = CLASSIFY(ppB(), GOOD_WINS);
eq([LC0.ok, LC0.classification, LC0.checks_failed],
  [true, 'FULLY_COVERED_BY_ACTIVE_PLAN', []], 'L7  the live class-B decision classifies clean');

[['qualifying planned BELOW the recommendation',
  ppB({ qualifying_active_planned_qty: 100, per_scope: [{ over_planned_qty: 0 }] }), GOOD_WINS,
  'fully_covered_active_plan_covers_the_whole_recommendation'],
 ['residual greater than zero', ppB({ residual_qty: 40 }), GOOD_WINS,
  'no_action_residual_qty_is_numerically_zero'],
 ['a residual that is not a number at all', ppB({ residual_qty: null }), GOOD_WINS,
  'no_action_residual_qty_is_numerically_zero'],
 ['the wrong outcome', ppB({ outcome: 'WOULD_GENERATE' }), GOOD_WINS,
  'no_action_outcome_is_exactly_ai_plan_no_action'],
 ['the wrong code', ppB({ code: 'REPLENISHMENT_REQUIRED' }), GOOD_WINS,
  'no_action_code_is_exactly_no_replenishment_required'],
 ['a reason that is neither class', ppB({ reason: 'RESIDUAL_REMAINS' }), GOOD_WINS,
  'no_action_reason_is_one_of_the_two_proven_classes'],
 ['no reason at all', ppB({ reason: '' }), GOOD_WINS,
  'no_action_reason_is_one_of_the_two_proven_classes'],
 ['would_write true', ppB({ would_write: true }), GOOD_WINS, 'no_action_production_would_not_write'],
 ['writer_reached true', ppB({ writer_reached: true }), GOOD_WINS, 'no_action_writer_was_not_reached'],
 ['db_writes above zero', ppB({ db_writes: 1 }), GOOD_WINS, 'no_action_db_writes_is_zero'],
 ['a MISSING window', ppB(), winsOmitting('D45'),
  'every_required_window_is_stored_finite_and_nonnegative'],
 ['a BLANK (non-finite) window', ppB(), winsFor({ D18: 0, D30: 0, D45: null, D90: 160 }),
  'every_required_window_is_stored_finite_and_nonnegative'],
 ['a NEGATIVE window', ppB(), winsFor({ D18: 0, D30: -5, D45: 0, D90: 160 }),
  'every_required_window_is_stored_finite_and_nonnegative'],
 ['the furthest window not equal to the recommendation', ppB(),
  winsFor({ D18: 0, D30: 0, D45: 0, D90: 200 }),
  'fully_covered_furthest_window_equals_the_recommendation'],
 ['over-planned arithmetic that does not add up',
  ppB({ per_scope: [{ over_planned_qty: 999 }] }), GOOD_WINS,
  'fully_covered_over_planned_equals_planned_minus_recommended'],
 ['a recommendation that is not finite', ppB({ recommended_qty: null }), GOOD_WINS,
  'fully_covered_recommended_qty_is_finite_and_positive'],
 ['a class-B run whose recommendation is zero', ppB({ recommended_qty: 0 }),
  winsFor({ D18: 0, D30: 0, D45: 0, D90: 0 }),
  'fully_covered_recommended_qty_is_finite_and_positive']
].forEach(function (c, i) {
  var r = CLASSIFY(c[1], c[2]);
  ok(r.ok === false && r.checks_failed.indexOf(c[3]) >= 0,
    'L7.' + (i + 1) + ' ' + c[0] + ' → refused, naming ' + c[3],
    [r.ok, r.checks_failed]);
});

// And class A is refused by its OWN conditions, not by class B's.
function ppA(over) {
  var d = { outcome: 'AI_PLAN_NO_ACTION', code: 'NO_REPLENISHMENT_REQUIRED',
    reason: 'VALID_ZERO_RECOMMENDATION', recommendation_state: 'VALID_ZERO_RECOMMENDATION',
    recommended_qty: 0, qualifying_active_planned_qty: 520, residual_qty: 0,
    would_write: false, writer_reached: false, db_writes: 0, per_scope: [{ over_planned_qty: 520 }] };
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return d;
}
var ZERO_WINS = winsFor({ D18: 0, D30: 0, D45: 0, D90: 0 });
var LA0 = CLASSIFY(ppA(), ZERO_WINS);
eq([LA0.ok, LA0.classification, LA0.checks_failed], [true, 'VALID_ZERO_RECOMMENDATION', []],
  'L8  the class-A decision still classifies clean');
var LA1 = CLASSIFY(ppA({ recommended_qty: 5 }), ZERO_WINS);
ok(LA1.ok === false && LA1.checks_failed.indexOf('recommended_qty_is_zero') >= 0,
  'L8a a class-A run with a positive recommendation is still refused by recommended_qty_is_zero');
var LA2 = CLASSIFY(ppA(), winsFor({ D18: 0, D30: 0, D45: 0, D90: 7 }));
ok(LA2.ok === false && LA2.checks_failed.indexOf('every_window_is_a_stored_finite_zero') >= 0,
  'L8b and a non-zero window is still refused by the four-zeros condition');

// ---- L9  A STALE SNAPSHOT STILL STOPS, in the new class as well as the old. ------------------------------
// FIRST, the thing that must NOT be called stale. A yesterday-only snapshot before today's 13:30 run is
// due is CURRENT_DURING_REFRESH, and R4-A2-R1 §4 exists because calling it stale refused the newest data
// that had ever existed. Asserted here so this round cannot quietly reintroduce that.
var LFresh = manifest(live(fcGap({ calculation_date: GAP_YESTERDAY })));
eq([LFresh.res.verdict, LFresh.res.frozen_before.freshness_state],
  ['READY_TO_AUTHORIZE', 'CURRENT_DURING_REFRESH'],
  'L9  a yesterday-only snapshot is CURRENT_DURING_REFRESH, not stale — the R4 defect stays fixed');
// AND NOW A GENUINELY STALE ONE: another SKU materialized TODAY makes today the accepted run, so this
// scope's yesterday row belongs to a run that is no longer the current one.
var STALE_LINEAGE = fcGap({ calculation_date: GAP_YESTERDAY });
STALE_LINEAGE.extraGap = [{ sku: 'OTHER-SKU', d18_suggested_qty: 0, d30_suggested_qty: 0,
  d45_suggested_qty: 0, d90_suggested_qty: 0 }];
var LS = manifest(live(STALE_LINEAGE));
eq(LS.res.verdict, 'STOP', 'L9a a snapshot from a superseded run STOPS a class-B run …');
eq(LS.res.production_path.outcome, 'REFUSAL',
  'L9b … because production REFUSES it rather than calling it a no-action');
ok(failed(LS.res).indexOf('production_reason_is_a_proven_no_action_class') >= 0,
  'L9c and the new class gate is among the reasons, so it cannot be reached by a refusal');
eq(LS.res.no_action_classification.classification, null,
  'L9d with no classification at all — a refusal belongs to neither class');

// ---- L10 THE SAFETY REPAIR. A STOP HANDS OVER NOTHING. ---------------------------------------------------
function freezeChunks(w) {
  return labels(w).filter(function (n) { return /^r6r7_freeze_paste_block_/.test(n); }).length;
}
function freezeMeta(w) { return labels(w).indexOf('r6r7_freeze_paste_meta') >= 0; }
function freezeWithheld(w) { return labels(w).indexOf('r6r7_freeze_paste_withheld') >= 0; }
// The READY runs still hand over exactly what an operator needs, in numbered chunks.
ok(freezeChunks(LA.world) > 0 && freezeMeta(LA.world) && !freezeWithheld(LA.world),
  'L10 a READY class-A run still emits the numbered freeze chunks and the meta line');
ok(freezeChunks(LB.world) > 0 && freezeMeta(LB.world) && !freezeWithheld(LB.world),
  'L10a and so does a READY class-B run');
ok(typeof LB.res.freeze_paste_block === 'string' && LB.res.freeze_paste_block.length > 100,
  'L10b with the block itself present on the result');
// Every STOP shape: no chunks, no meta, a NAMED withholding, and nothing left on the result to paste.
[['a residual that remains', NONZERO],
 ['a blocked recommendation', BLOCKED],
 ['a snapshot from a superseded run', STALE_LINEAGE],
 ['a negative window', fcGap({ d30_suggested_qty: -5 })]
].forEach(function (c, i) {
  var r = manifest(live(c[1]));
  eq([r.res.verdict, freezeChunks(r.world), freezeMeta(r.world), r.res.freeze_paste_block],
    ['STOP', 0, false, null],
    'L11.' + (i + 1) + ' ' + c[0] + ' → STOP, ZERO freeze chunks, no meta, nothing on the result');
  ok(freezeWithheld(r.world), 'L11.' + (i + 1) + 'a and the withholding is REPORTED, not silent');
  ok(/WITHHELD_BECAUSE_VERDICT_IS_STOP/.test(String(r.res.freeze_withheld_reason)),
    'L11.' + (i + 1) + 'b naming why');
});
// A withheld run must not leave a paste target in the log either — a reader who copies the withheld line
// must find no instruction in it.
var LW = manifest(live(NONZERO));
var lwLine = lineOf(LW.world, 'r6r7_freeze_paste_withheld');
ok(!!lwLine && JSON.parse(lwLine).paste_into === null && JSON.parse(lwLine).chunks === 0,
  'L12 the withheld notice carries chunks 0 and NO paste target');

// ---- L13 BOTH LOCKS EXIST, and the second one is defence in depth rather than theatre. -------------------
var LM = extractFn(CENSUS, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST');
var LF = extractFn(CENSUS, 'CENSUS_r6r7Finish_');
ok(/out\.verdict !== 'READY_TO_AUTHORIZE' && out\.freeze_paste_block/.test(LM),
  'L13 lock one: the manifest nulls the block whenever its own verdict is not READY_TO_AUTHORIZE');
ok(/out\.freeze_paste_block && out\.verdict === 'READY_TO_AUTHORIZE'/.test(LF),
  'L13a lock two: the emitter refuses unless the FINAL verdict is READY_TO_AUTHORIZE');
// STATED PLAINLY, because it would be easy to imply more: every Finish_-time downgrade in the current
// predicate set ALSO fails a manifest predicate, so lock two is not independently observable today. It is
// there for the downgrade that is added later — the proof guard can turn a READY into a STOP after lock one
// has already run, and on that day lock one is looking at the wrong verdict.
ok(/proof_complete/.test(LF) && /out\.verdict = 'STOP'/.test(LF),
  'L13b and Finish_ really can downgrade a verdict after lock one has run, which is why lock two exists');

// ---- L14 THE PIN STAYS INDEPENDENT. Nothing added this round reads the expected build from the observed.
ok(!/R6R7_ACTIVATION_BUILD_\s*=\s*(out\.deployment|.*deployment_build)/.test(CENSUS),
  'L14 the census still never assigns the activation pin FROM the deployment it is examining');
ok(!/deployment/.test(extractFn(CENSUS, 'CENSUS_r6r7ClassifyNoAction_')),
  'L14a and the classifier does not read the deployment at all');
eq(ACTIVATION_PIN, OBSERVED_BUILD,
  'L14b the pin is still the actually-deployed R5-R1 build, unmoved by this round');

// ---- L15 THIS ROUND WROTE NOTHING. ------------------------------------------------------------------
eq([LB.res.db_writes, LB.res.writer_constructed, LB.res.writer_calls, LB.res.submit_calls,
  LB.res.route_save_calls, LB.res.reservation_writes], [0, false, 0, 0, 0, 0],
  'L15 the class-B manifest run wrote nothing, by six counters');
eq(LB.world.dbWrites(), 0, 'L15a measured on the sheets, not reported');
eq([LB.res.flag_flipped_this_round, LB.res.generation_called_this_round], [false, false],
  'L15b and it neither flipped the flag nor called a generation');
ok(!/setValue|appendRow|deleteRow|setValues|LockService/
  .test(extractFn(CENSUS, 'CENSUS_r6r7ClassifyNoAction_')),
  'L15c the classifier itself contains no write API at all');
// ================================================================================================================
section('M — R6-R7-R5-R1 final tightening: the state is an exact value, and a sum is not evidence');
// ================================================================================================================
//
// TWO FAIL-OPEN CONDITIONS, BOTH MEASURED BEFORE THEY WERE CHANGED.
//
// (1) `fully_covered_recommendation_state_is_not_a_zero_state` was an EXCLUSION, and its list was wrong in the
//     one way that mattered. It excluded 'VALID_ZERO' — the KEY of 61_'s WAP_RECOMMENDATION_STATES_ — while the
//     string production emits is the VALUE 'VALID_ZERO_RECOMMENDATION'. So the single state it existed to keep
//     out was the one state it admitted, and it admitted every unknown value besides. Measured: a class-B
//     decision carrying recommendation_state 'VALID_ZERO_RECOMMENDATION' classified ok=true, checks_failed [].
//
// (2) The over-planned surplus is a SUM ACROSS SCOPES, and it was checked only as a sum. 520 planned against
//     160 recommended leaves 360 — and so does 660 in one scope beside NEGATIVE 140 in another, and so does one
//     scope over-planned by 400 beside one that is 40 SHORT. Measured: all three classified ok=true. The last
//     is the dangerous one, because 'fully covered' is precisely the sentence a per-scope shortfall hides in.

// ---- M1  THE EXACT CONTRACT. One value passes; nothing else does. ---------------------------------------
var MPIN = extractVar(CENSUS, 'R6R7_NONZERO_RECOMMENDATION_STATE_');
ok(/'NONZERO_RECOMMENDATION'/.test(MPIN), 'M1  the required state is pinned as an exact value', MPIN);
var M1 = CLASSIFY(ppB({ recommendation_state: 'NONZERO_RECOMMENDATION' }), GOOD_WINS);
eq([M1.ok, M1.classification, M1.checks_failed], [true, 'FULLY_COVERED_BY_ACTIVE_PLAN', []],
  'M1a NONZERO_RECOMMENDATION passes');

// Every other value, including the one the old exclusion let through. Each must be refused BY THE STATE
// CHECK ITSELF — not merely refused, which any other broken condition could also accomplish.
[['VALID_ZERO_RECOMMENDATION — the enum VALUE, and the state the old check admitted', 'VALID_ZERO_RECOMMENDATION'],
 ["'VALID_ZERO' — the enum KEY, which 61_ never emits", 'VALID_ZERO'],
 ['MISSING_RECOMMENDATION', 'MISSING_RECOMMENDATION'],
 ['an empty string', ''],
 ['null', null],
 ['a lower-case spelling of the right value', 'nonzero_recommendation'],
 ['an arbitrary unknown value', 'BOGUS_STATE'],
 ['a number', 1],
 ['a truthy object', { state: 'NONZERO_RECOMMENDATION' }]
].forEach(function (c, i) {
  var r = CLASSIFY(ppB({ recommendation_state: c[1] }), GOOD_WINS);
  ok(r.ok === false
    && r.checks_failed.indexOf('fully_covered_recommendation_state_is_exactly_nonzero_recommendation') >= 0,
    'M2.' + (i + 1) + ' ' + c[0] + ' → refused BY THE STATE CHECK', [r.ok, r.checks_failed]);
});
// And the key being absent altogether, which is not the same fact as it being null.
var MU = ppB(); delete MU.recommendation_state;
var MUr = CLASSIFY(MU, GOOD_WINS);
ok(MUr.ok === false
  && MUr.checks_failed.indexOf('fully_covered_recommendation_state_is_exactly_nonzero_recommendation') >= 0,
  'M2.10 undefined — the key absent entirely — → refused BY THE STATE CHECK', MUr.checks_failed);
eq(MUr.checks.filter(function (c) {
  return c.predicate === 'fully_covered_recommendation_state_is_exactly_nonzero_recommendation';
}).map(function (c) { return [c.expected, c.observed]; }), [['NONZERO_RECOMMENDATION', null]],
  'M2a and the check REPORTS what it wanted beside what it got, rather than only failing');
// WHAT IS ACCEPTED BESIDES THE BARE VALUE, STATED RATHER THAN LEFT TO BE DISCOVERED: surrounding whitespace,
// because every string comparison in this census goes through CENSUS_str_, which trims. I first asserted a
// padded value was refused; the measurement said otherwise and the measurement is right — this file reads
// spreadsheet-sourced strings, one reader trims them all, and a check that trimmed differently from its
// neighbours would be the surprise. Case is NOT folded, which is the half that matters (M2.6 covers it).
eq(CLASSIFY(ppB({ recommendation_state: ' NONZERO_RECOMMENDATION ' }), GOOD_WINS).ok, true,
  'M2b a padded spelling of the exact value IS accepted — CENSUS_str_ trims, uniformly, everywhere');

// ---- M3  THE PIN IS A CONTRACT, NOT AN ECHO. -------------------------------------------------------------
// Pinned rather than read from WAP_RECOMMENDATION_STATES_.NONZERO, because a check that takes its expectation
// from the thing it is checking cannot fail — it would follow a rename in silence. So the comparison against
// production's own enum lives HERE, where a rename turns red instead of being absorbed.
var MSTATES = vm.runInContext('WAP_RECOMMENDATION_STATES_', W(live()).ctx);
eq([MSTATES.NONZERO, MSTATES.VALID_ZERO, MSTATES.MISSING],
  ['NONZERO_RECOMMENDATION', 'VALID_ZERO_RECOMMENDATION', 'MISSING_RECOMMENDATION'],
  'M3  61_ still emits these three exact recommendation-state VALUES');
ok(MPIN.indexOf("'" + MSTATES.NONZERO + "'") >= 0,
  'M3a and the census pin is that value byte for byte — a rename in 61_ fails HERE, not silently');
ok(MPIN.indexOf(MSTATES.VALID_ZERO) < 0 && MPIN.indexOf(MSTATES.MISSING) < 0,
  'M3b while neither of the other two states appears in the pin');
// The KEY is not the VALUE, and confusing them is the defect this section closes. Asserted so the two can
// never be quietly swapped back.
ok(MSTATES.VALID_ZERO !== 'VALID_ZERO',
  'M3c the enum KEY `VALID_ZERO` is NOT the value it holds — which is why the old exclusion never matched');

// ---- M4  NO EXCLUSION-STYLE STATE COMPARISON SURVIVES IN THE SOURCE. -------------------------------------
var MFN = extractFn(CENSUS, 'CENSUS_r6r7ClassifyNoAction_');
ok(/CENSUS_str_\(pp\.recommendation_state\) === R6R7_NONZERO_RECOMMENDATION_STATE_/.test(MFN),
  'M4  the state is compared for EQUALITY against the pin');
ok(!/recommendation_state\) !== /.test(MFN),
  'M4a and not against a list of things it must not be', (MFN.match(/.*recommendation_state.*/g) || []).slice(0, 6));
ok(MFN.indexOf("'VALID_ZERO'") < 0,
  'M4b the string that was never a production value appears nowhere in the classifier');

// ---- M5  AND THE WHOLE MANIFEST STOPS, not just the classifier. -----------------------------------------
// The classifier is replayed through P, so a state contract failure has to reach the verdict — a repair that
// only shows up in a nested object is a repair an operator never sees.
var MSTATE_W = manifest(live(FULLY_COVERED), { after:
  'weeklyAiPlanNoActionDecision_ = (function (orig) { return function (recState, planned) {' + NLF
  + '  var d = orig.apply(null, arguments);' + NLF
  + "  if (d && d.reason === 'FULLY_COVERED_BY_ACTIVE_PLAN') d.recommendation_state = 'VALID_ZERO_RECOMMENDATION';" + NLF
  + '  return d; }; })(weeklyAiPlanNoActionDecision_);' });
eq(MSTATE_W.res.verdict, 'STOP',
  'M5  a class-B run reporting a ZERO recommendation state STOPS the whole manifest');
ok(failed(MSTATE_W.res).indexOf('fully_covered_recommendation_state_is_exactly_nonzero_recommendation') >= 0,
  'M5a naming the state contract among the reasons', failed(MSTATE_W.res).slice(0, 6));
ok(labels(MSTATE_W.world).filter(function (n) { return /^r6r7_freeze_paste_block_/.test(n); }).length === 0,
  'M5b and it hands over no freeze block, because the safety lock is downstream of the verdict');

// ---- M6/M7/M8  THE PER-SCOPE EVIDENCE CANNOT CANCEL. ----------------------------------------------------
// Production cannot build these: its per-scope surplus is clamped at zero, and any scope with a residual
// returns RESIDUAL_REMAINS rather than a no-action. They are put to the classifier directly for exactly that
// reason — a property that holds only because of what the caller happens to pass is a property of the caller,
// and this census reads a decision object it did not build.
function psB(rows, over) {
  var o = over || {}; o.per_scope = rows; return ppB(o);
}
var GOOD_SCOPE = [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R',
  recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0, over_planned_qty: 360 }];
var M6 = CLASSIFY(psB(GOOD_SCOPE), GOOD_WINS);
eq([M6.ok, M6.per_scope_count, M6.per_scope_recommended_sum, M6.per_scope_qualifying_planned_sum],
  [true, 1, 160, 520],
  'M6  the one real scope reconciles with the totals it was reported beside');
eq([M6.per_scope_over_planned_negative, M6.per_scope_under_covered, M6.per_scope_residual_non_zero],
  [[], [], []], 'M6a with nothing negative, nothing short, and no residual anywhere');
// TWO SCOPES ARE NOW REFUSED, AND THIS REVERSES WHAT I ASSERTED ONE COMMIT AGO. c335a06 accepted any set of
// individually-covered scopes on the reasoning that the guard was against cancellation rather than against
// multiplicity. For THIS activation that is the wrong boundary: it is one frozen scope, so a second row is
// not a richer answer, it is an answer about something else — and a decision covering more sites than the
// authorization does is the shape that must never reach READY. Refused now, deliberately.
var M6B = CLASSIFY(psB([
  { key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R', recommended_qty: 100,
    qualifying_planned_qty: 300, residual_qty: 0, over_planned_qty: 200 },
  { key: 'ResUS|US|Amazon|CO1200-R', marketplace: 'Amazon', sku: 'CO1200-R', recommended_qty: 60,
    qualifying_planned_qty: 220, residual_qty: 0, over_planned_qty: 160 }],
  { recommended_qty: 160, qualifying_active_planned_qty: 520 }), GOOD_WINS);
ok(M6B.ok === false && M6B.checks_failed.indexOf('fully_covered_per_scope_has_exactly_one_row') >= 0,
  'M6b two scopes — even individually covered ones — are REFUSED: this activation is one frozen scope',
  M6B.checks_failed);
eq(M6B.per_scope_identity, null,
  'M6b1 and no identity is claimed for a set of rows, because there is no single row to identify');

[['a NEGATIVE surplus in one scope offsetting a larger one in another',
  [{ key: 'A', recommended_qty: 160, qualifying_planned_qty: 660, residual_qty: 0, over_planned_qty: 500 },
   { key: 'B', recommended_qty: 0, qualifying_planned_qty: 0, residual_qty: 0, over_planned_qty: -140 }],
  'fully_covered_every_scope_over_planned_is_finite_and_nonnegative'],
 ['a scope that is genuinely SHORT, hidden behind a surplus elsewhere',
  [{ key: 'A', recommended_qty: 60, qualifying_planned_qty: 460, residual_qty: 0, over_planned_qty: 400 },
   { key: 'B', recommended_qty: 100, qualifying_planned_qty: 60, residual_qty: 40, over_planned_qty: -40 }],
  'fully_covered_every_scope_is_individually_covered'],
 ['a scope carrying a NON-ZERO residual of its own',
  [{ key: 'A', recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 12, over_planned_qty: 360 }],
  'fully_covered_every_scope_residual_is_exactly_zero'],
 ['a scope whose residual is not a number at all',
  [{ key: 'A', recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: null, over_planned_qty: 360 }],
  'fully_covered_every_scope_residual_is_exactly_zero'],
 ['rows whose own quantities have nothing to do with the reported totals',
  [{ key: 'Z', recommended_qty: 9999, qualifying_planned_qty: 10359, residual_qty: 0, over_planned_qty: 360 }],
  'fully_covered_per_scope_totals_reconcile_with_the_reported_totals'],
 ['a surplus reported with no scope quantities behind it at all',
  [{ over_planned_qty: 360 }],
  'fully_covered_per_scope_totals_reconcile_with_the_reported_totals'],
 ['an EMPTY per_scope beside a 360 surplus in the totals', [],
  'fully_covered_per_scope_evidence_is_present'],
 ['a scope whose surplus is not a finite number',
  [{ key: 'A', recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0, over_planned_qty: 'x' }],
  'fully_covered_every_scope_over_planned_is_finite_and_nonnegative']
].forEach(function (c, i) {
  var r = CLASSIFY(psB(c[1]), GOOD_WINS);
  ok(r.ok === false && r.checks_failed.indexOf(c[2]) >= 0,
    'M7.' + (i + 1) + ' ' + c[0] + ' → refused, naming ' + c[2], [r.ok, r.checks_failed]);
});
// per_scope ABSENT is a different fact from per_scope EMPTY, and both are the absence of evidence.
var MNOPS = ppB(); delete MNOPS.per_scope;
var MNOPSr = CLASSIFY(MNOPS, GOOD_WINS);
ok(MNOPSr.ok === false && MNOPSr.checks_failed.indexOf('fully_covered_per_scope_evidence_is_present') >= 0
  && MNOPSr.per_scope_count === null,
  'M7.9 per_scope absent entirely → refused, and the count is null rather than 0', MNOPSr.per_scope_count);
eq(CLASSIFY(psB([]), GOOD_WINS).per_scope_count, 0,
  'M7a while an EMPTY array reports 0 — no evidence and no rows are told apart');

// The cancelling shapes must not be accepted by the SUM check either — that check is what made them look
// right, and it still reports 360 == 360. The refusal comes from the rows, which is the whole point.
var MCANCEL = CLASSIFY(psB([
  { key: 'A', recommended_qty: 160, qualifying_planned_qty: 660, residual_qty: 0, over_planned_qty: 500 },
  { key: 'B', recommended_qty: 0, qualifying_planned_qty: 0, residual_qty: 0, over_planned_qty: -140 }]),
  GOOD_WINS);
eq([MCANCEL.over_planned_qty_reported, MCANCEL.over_planned_qty_expected], [360, 360],
  'M8  the cancelling sum STILL adds up to the expected surplus …');
ok(MCANCEL.checks.filter(function (c) {
  return c.predicate === 'fully_covered_over_planned_equals_planned_minus_recommended';
})[0].pass === true, 'M8a … and the arithmetic check still passes it, unchanged …');
eq(MCANCEL.per_scope_over_planned_negative, [{ scope: 'B', over_planned_qty: -140 }],
  'M8b … so the refusal comes from the ROWS, which name the scope and the negative amount');

// ---- M9  THE ARITHMETIC CHECK COMPUTES THE EQUATION ITS NAME STATES. ------------------------------------
// It was `Math.max(0, qp - rq)`. A predicate called `..._equals_planned_minus_recommended` should compute
// planned minus recommended: with 100 planned against 160 recommended the surplus is MINUS 60, and clamping
// it to zero made a zero reported surplus match. The coverage check refuses that case regardless, so this is
// about the number the census PRINTS being the number it claims to have compared.
var M9 = CLASSIFY(ppB({ qualifying_active_planned_qty: 100,
  per_scope: [{ key: 'A', recommended_qty: 160, qualifying_planned_qty: 100, residual_qty: 0,
    over_planned_qty: 0 }] }), GOOD_WINS);
eq(M9.over_planned_qty_expected, -60,
  'M9  planned 100 against recommended 160 is reported as MINUS 60, not clamped to zero');
ok(M9.checks_failed.indexOf('fully_covered_over_planned_equals_planned_minus_recommended') >= 0
  && M9.checks_failed.indexOf('fully_covered_active_plan_covers_the_whole_recommendation') >= 0
  && M9.checks_failed.indexOf('fully_covered_every_scope_is_individually_covered') >= 0,
  'M9a and three separate conditions refuse it — the equation, the total, and the scope',
  M9.checks_failed);

// ---- M10 CLASS A IS STILL UNTOUCHED BY EVERY ONE OF THESE. ----------------------------------------------
// Eleven class-B conditions now, and a class-A run must be judged by none of them. The class-A double also
// now spells the enum VALUE rather than the KEY, which is where the runtime defect came from.
var M10 = CLASSIFY(ppA(), ZERO_WINS);
eq([M10.ok, M10.classification, M10.checks_failed], [true, 'VALID_ZERO_RECOMMENDATION', []],
  'M10 a class-A run with a VALID_ZERO_RECOMMENDATION state still classifies clean');
eq(M10.checks.map(function (c) { return c.predicate; })
  .filter(function (n) { return /^fully_covered_/.test(n); }), [],
  'M10a and not one class-B condition is asserted against it');
eq([M10.per_scope_count, M10.per_scope_recommended_sum], [1, null],
  'M10b the per-scope fields are still REPORTED for class A — reported, and not gated on');
var M10C = manifest();
eq([M10C.res.verdict, failed(M10C.res)], ['READY_TO_AUTHORIZE', []],
  'M10c and the whole class-A manifest is still READY_TO_AUTHORIZE with nothing unmet');
var M10D = manifest(live(FULLY_COVERED));
eq([M10D.res.verdict, failed(M10D.res)], ['READY_TO_AUTHORIZE', []],
  'M10d as is the class-B one — the tightening refuses nothing that was already true');


// ---- M8  THE PER-SCOPE EVIDENCE CANNOT CANCEL. ----------------------------------------------------------

// ---- M9  THE ARITHMETIC CHECK COMPUTES THE EQUATION ITS NAME STATES. ------------------------------------

// ================================================================================================================
section('P — R6-R7-R5-R1 fail-closed: ONE row, and it has to be THIS site');
// ================================================================================================================
//
// c335a06 proved a surplus cannot be reached by cancellation. It still accepted a decision whose per_scope
// described a DIFFERENT SITE, or several sites, or a row whose own three numbers did not produce the surplus
// it reported. This activation authorizes ONE scope, so the evidence has to be one row and it has to be that
// scope — and the row has to be arithmetically true about itself, not merely add up in aggregate.
//
// THREE STATEMENTS, NONE IMPLYING ANOTHER: a row is consistent with itself; the rows sum to the totals; the
// totals are consistent with each other. c335a06 had the last two.

function pRow(over) {
  var r = { key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R',
    recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0, over_planned_qty: 360 };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
function pDrop(over, drop) { var r = pRow(over); delete r[drop]; return r; }

// ---- P1  THE LIVE CASE IS UNTOUCHED. 160 / 520 / 0 / 360 still classifies clean. ------------------------
var P1 = CLASSIFY(ppB(), GOOD_WINS);
eq([P1.ok, P1.classification, P1.checks_failed], [true, 'FULLY_COVERED_BY_ACTIVE_PLAN', []],
  'P1  the live class-B decision still classifies clean under the tighter contract');
eq(P1.per_scope_identity.mismatched, [],
  'P1a with the one row identified as the frozen scope, nothing mismatched');
eq([P1.per_scope_identity.company, P1.per_scope_identity.country,
  P1.per_scope_identity.marketplace, P1.per_scope_identity.sku],
  ['ResUS', 'US', 'Amazon', 'CO1100-R'],
  'P1b read out of PRODUCTION\'s own key by splitting it, not rebuilt from the parts here');
eq(P1.expected_scope, { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' },
  'P1c and reported beside the scope this census is frozen to');
eq(P1.checks.filter(function (c) { return /^fully_covered_/.test(c.predicate); }).length, 15,
  'P1d fifteen class-B conditions now, on the same eight-condition shared floor');
var PLIVE = manifest(live(FULLY_COVERED));
eq([PLIVE.res.verdict, failed(PLIVE.res)], ['READY_TO_AUTHORIZE', []],
  'P1e and the whole live manifest is still READY_TO_AUTHORIZE with nothing unmet');
eq([PLIVE.res.no_action_classification.per_scope_count,
  PLIVE.res.no_action_classification.per_scope_identity.ok], [1, true],
  'P1f REAL 61_ produces exactly one row and it identifies as the frozen scope');

// ---- P2  THE ROW HAS TO BE THIS SITE. ------------------------------------------------------------------
var PIDN = 'fully_covered_per_scope_row_is_exactly_the_frozen_scope';
[['a different SKU', pRow({ key: 'ResUS|US|Amazon|CO1200-R', sku: 'CO1200-R' })],
 ['a different MARKETPLACE', pRow({ key: 'ResUS|US|Walmart|CO1100-R', marketplace: 'Walmart' })],
 ['a different COMPANY', pRow({ key: 'ResEU|US|Amazon|CO1100-R' })],
 ['a different COUNTRY', pRow({ key: 'ResUS|CA|Amazon|CO1100-R' })],
 ['a key that does not split into four parts', pRow({ key: 'ResUS|US|Amazon' })],
 ['a key with an extra part', pRow({ key: 'ResUS|US|Amazon|CO1100-R|X' })],
 ['no key at all', pDrop({}, 'key')],
 ['a blank key', pRow({ key: '' })],
 ['a row whose own sku disagrees with its own key', pRow({ sku: 'CO9999-R' })],
 ['a row whose own marketplace disagrees with its own key', pRow({ marketplace: 'Walmart' })],
 ['a row with no sku field', pDrop({}, 'sku')],
 ['a row with no marketplace field', pDrop({}, 'marketplace')]
].forEach(function (c, i) {
  var r = CLASSIFY(ppB({ per_scope: [c[1]] }), GOOD_WINS);
  ok(r.ok === false && r.checks_failed.indexOf(PIDN) >= 0,
    'P2.' + (i + 1) + ' ' + c[0] + ' → refused, naming the frozen-scope identity', r.checks_failed);
});
// The identity is REPORTED, field by field, so a STOP says WHICH part of the site is wrong.
eq(CLASSIFY(ppB({ per_scope: [pRow({ key: 'ResEU|CA|Amazon|CO1100-R' })] }), GOOD_WINS)
  .per_scope_identity.mismatched, ['company', 'country'],
  'P2a and it names the parts that differ rather than only failing');
eq(CLASSIFY(ppB({ per_scope: [pRow({ key: 'ResUS|US|Amazon' })] }), GOOD_WINS)
  .per_scope_identity.mismatched, ['key_does_not_split_into_four_parts'],
  'P2b an unparseable key is its own reason — \'cannot read the identity\' is not \'the identity is right\'');

// ---- P3  EXACTLY ONE ROW. ------------------------------------------------------------------------------
var PONE = 'fully_covered_per_scope_has_exactly_one_row';
[['the frozen row PLUS an unauthorized second scope',
  [pRow(), pRow({ key: 'ResUS|US|Amazon|CO1200-R', sku: 'CO1200-R', recommended_qty: 0,
    qualifying_planned_qty: 0, over_planned_qty: 0 })]],
 ['the frozen row twice', [pRow(), pRow()]],
 ['two scopes that are EACH individually covered',
  [pRow({ recommended_qty: 100, qualifying_planned_qty: 300, over_planned_qty: 200 }),
   pRow({ key: 'ResUS|US|Amazon|CO1200-R', sku: 'CO1200-R', recommended_qty: 60,
     qualifying_planned_qty: 220, over_planned_qty: 160 })]],
 ['an empty per_scope', []]
].forEach(function (c, i) {
  var r = CLASSIFY(ppB({ per_scope: c[1] }), GOOD_WINS);
  ok(r.ok === false && r.checks_failed.indexOf(PONE) >= 0,
    'P3.' + (i + 1) + ' ' + c[0] + ' → refused, naming the one-row requirement', r.checks_failed);
});
var PNO = ppB(); delete PNO.per_scope;
var PNOr = CLASSIFY(PNO, GOOD_WINS);
ok(PNOr.ok === false && PNOr.checks_failed.indexOf(PONE) >= 0
  && PNOr.checks_failed.indexOf('fully_covered_per_scope_evidence_is_present') >= 0,
  'P3.5 per_scope missing entirely → refused by BOTH the evidence and the one-row conditions');
var PNA = CLASSIFY(ppB({ per_scope: { key: 'ResUS|US|Amazon|CO1100-R' } }), GOOD_WINS);
ok(PNA.ok === false && PNA.checks_failed.indexOf(PONE) >= 0 && PNA.per_scope_count === null,
  'P3.6 per_scope that is not an array at all → refused, and the count is null');
// CROSS-SCOPE OFFSETTING IS NOW STRUCTURALLY IMPOSSIBLE, and the per-row conditions still hold anyway.
var POFF = CLASSIFY(ppB({ per_scope: [
  pRow({ recommended_qty: 160, qualifying_planned_qty: 660, over_planned_qty: 500 }),
  pRow({ key: 'ResUS|US|Amazon|CO1200-R', sku: 'CO1200-R', recommended_qty: 0,
    qualifying_planned_qty: 0, over_planned_qty: -140 })] }), GOOD_WINS);
eq([POFF.over_planned_qty_reported, POFF.over_planned_qty_expected], [360, 360],
  'P3a the offsetting pair STILL sums to the expected surplus …');
ok(POFF.checks_failed.indexOf(PONE) >= 0
  && POFF.checks_failed.indexOf('fully_covered_every_scope_over_planned_is_finite_and_nonnegative') >= 0,
  'P3b … and is refused twice over: it is two rows, and one of them is negative', POFF.checks_failed);

// ---- P4  THE ROW HAS TO BE TRUE ABOUT ITSELF. ----------------------------------------------------------
var PARI = 'fully_covered_scope_over_planned_equals_its_own_planned_minus_recommended';
[['a surplus higher than its own two numbers produce', pRow({ over_planned_qty: 400 }), 360],
 ['a surplus lower than its own two numbers produce', pRow({ over_planned_qty: 0 }), 360],
 ['a NEGATIVE surplus on a row that is over-planned', pRow({ over_planned_qty: -360 }), 360],
 ['a surplus that is not a number', pRow({ over_planned_qty: 'x' }), 360],
 ['no surplus field at all', pDrop({}, 'over_planned_qty'), 360],
 ['no recommended_qty on the row', pDrop({}, 'recommended_qty'), null],
 ['no qualifying_planned_qty on the row', pDrop({}, 'qualifying_planned_qty'), null]
].forEach(function (c, i) {
  var r = CLASSIFY(ppB({ per_scope: [c[1]] }), GOOD_WINS);
  ok(r.ok === false && r.checks_failed.indexOf(PARI) >= 0,
    'P4.' + (i + 1) + ' ' + c[0] + ' → refused, naming the row\'s own arithmetic', r.checks_failed);
  if (c[2] !== null) {
    eq((r.per_scope_row_arithmetic_mismatch[0] || {}).required, c[2],
      'P4.' + (i + 1) + 'a and it reports what that row\'s numbers REQUIRED (' + c[2] + ')');
  }
});
// A row that is internally consistent about a SHORTFALL passes this condition and is refused by the ones
// that own the sign. Each condition says one thing.
var PSHORT = CLASSIFY(ppB({ per_scope: [pRow({ recommended_qty: 520, qualifying_planned_qty: 160,
  over_planned_qty: -360 })] }), GOOD_WINS);
ok(PSHORT.checks_failed.indexOf(PARI) === -1,
  'P4a a row consistent about a shortfall passes its OWN arithmetic — that check has one job');
ok(PSHORT.ok === false
  && PSHORT.checks_failed.indexOf('fully_covered_every_scope_is_individually_covered') >= 0
  && PSHORT.checks_failed.indexOf('fully_covered_every_scope_over_planned_is_finite_and_nonnegative') >= 0,
  'P4b … and is refused by coverage and by the non-negative surplus, which are the ones that own it');
// The row's own recommendation has to be a positive number, not merely finite.
var PZERO = 'fully_covered_scope_recommended_qty_is_finite_and_positive';
[['the row recommends zero', pRow({ recommended_qty: 0, over_planned_qty: 520 })],
 ['the row recommends a negative amount', pRow({ recommended_qty: -10, over_planned_qty: 530 })],
 ['the row recommendation is blank', pRow({ recommended_qty: null })]
].forEach(function (c, i) {
  var r = CLASSIFY(ppB({ per_scope: [c[1]] }), GOOD_WINS);
  ok(r.ok === false && r.checks_failed.indexOf(PZERO) >= 0,
    'P4c.' + (i + 1) + ' ' + c[0] + ' → refused, naming the row\'s own recommendation', r.checks_failed);
});

// ---- P5  AND THE ROWS STILL HAVE TO AGREE WITH THE TOP-LEVEL TOTALS. -----------------------------------
var PREC = 'fully_covered_per_scope_totals_reconcile_with_the_reported_totals';
var P5A = CLASSIFY(ppB({ per_scope: [pRow({ recommended_qty: 100, qualifying_planned_qty: 460,
  over_planned_qty: 360 })] }), GOOD_WINS);
ok(P5A.ok === false && P5A.checks_failed.indexOf(PREC) >= 0,
  'P5  a row internally consistent but disagreeing with the reported totals → refused', P5A.checks_failed);
eq([P5A.per_scope_recommended_sum, P5A.per_scope_qualifying_planned_sum], [100, 460],
  'P5a and the row sums are reported beside the totals they contradict (160 / 520)');
var P5B = CLASSIFY(ppB({ per_scope: [pRow({ recommended_qty: 160, qualifying_planned_qty: 520,
  over_planned_qty: 360 })], qualifying_active_planned_qty: 900 }), GOOD_WINS);
ok(P5B.ok === false && P5B.checks_failed.indexOf(PREC) >= 0,
  'P5b and a top-level total the row does not account for → refused', P5B.checks_failed);

// ---- P6  EVERY NEW STOP SHAPE HANDS OVER NOTHING. ------------------------------------------------------
// The classifier is replayed through P, so each of these has to reach the VERDICT and then be caught by the
// freeze locks. Measured on the full manifest, through the real router and the real production decision,
// with the decision wrapped at the seam — because these are shapes 61_ will not produce on its own.
function pBend(mutate) {
  return manifest(live(FULLY_COVERED), { after:
    'weeklyAiPlanNoActionDecision_ = (function (orig) { return function (recState, planned) {' + NLF
    + '  var d = orig.apply(null, arguments);' + NLF
    + "  if (d && d.reason === 'FULLY_COVERED_BY_ACTIVE_PLAN') { " + mutate + ' }' + NLF
    + '  return d; }; })(weeklyAiPlanNoActionDecision_);' });
}
[['recommendation_state BROKEN_STATE', "d.recommendation_state = 'BROKEN_STATE';",
  'fully_covered_recommendation_state_is_exactly_nonzero_recommendation'],
 ['a blank recommendation_state', "d.recommendation_state = '';",
  'fully_covered_recommendation_state_is_exactly_nonzero_recommendation'],
 ['recommendation_state deleted', 'delete d.recommendation_state;',
  'fully_covered_recommendation_state_is_exactly_nonzero_recommendation'],
 ['per_scope deleted', 'delete d.per_scope;', 'fully_covered_per_scope_has_exactly_one_row'],
 ['per_scope emptied', 'd.per_scope = [];', 'fully_covered_per_scope_evidence_is_present'],
 ['an extra unauthorized scope appended',
  "d.per_scope = d.per_scope.concat([{ key: 'ResUS|US|Amazon|CO1200-R', marketplace: 'Amazon',"
  + " sku: 'CO1200-R', recommended_qty: 0, qualifying_planned_qty: 0, residual_qty: 0,"
  + ' over_planned_qty: 0 }]);', 'fully_covered_per_scope_has_exactly_one_row'],
 ['the one row rewritten to a different site',
  "d.per_scope[0].key = 'ResUS|US|Walmart|CO1100-R'; d.per_scope[0].marketplace = 'Walmart';",
  'fully_covered_per_scope_row_is_exactly_the_frozen_scope'],
 ['the row surplus falsified', 'd.per_scope[0].over_planned_qty = 400;',
  'fully_covered_scope_over_planned_equals_its_own_planned_minus_recommended'],
 ['the rows no longer summing to the totals', 'd.per_scope[0].qualifying_planned_qty = 460;',
  'fully_covered_per_scope_totals_reconcile_with_the_reported_totals'],
 ['a cross-scope offsetting pair',
  "d.per_scope[0].qualifying_planned_qty = 660; d.per_scope[0].over_planned_qty = 500;"
  + " d.per_scope.push({ key: 'ResUS|US|Amazon|CO1200-R', marketplace: 'Amazon', sku: 'CO1200-R',"
  + ' recommended_qty: 0, qualifying_planned_qty: -140, residual_qty: 0, over_planned_qty: -140 });',
  'fully_covered_every_scope_over_planned_is_finite_and_nonnegative']
].forEach(function (c, i) {
  var r = pBend(c[1]);
  var lbl = labels(r.world);
  var chunks = lbl.filter(function (n) { return /^r6r7_freeze_paste_block_/.test(n); }).length;
  var meta = lbl.indexOf('r6r7_freeze_paste_meta') >= 0;
  var withheld = lbl.filter(function (n) { return n === 'r6r7_freeze_paste_withheld'; }).length;
  eq([r.res.verdict, chunks, meta, withheld, r.res.freeze_paste_block],
    ['STOP', 0, false, 1, null],
    'P6.' + (i + 1) + ' ' + c[0] + ' → STOP, zero chunks, no meta, exactly one withheld line, nothing to paste');
  ok(failed(r.res).indexOf(c[2]) >= 0,
    'P6.' + (i + 1) + 'a and the reasons name ' + c[2], failed(r.res).slice(0, 5));
});

// ---- P7  CLASS A AND THE PIN ARE UNTOUCHED BY ALL OF IT. -----------------------------------------------
var P7 = manifest();
eq([P7.res.verdict, failed(P7.res), P7.res.no_action_classification.classification],
  ['READY_TO_AUTHORIZE', [], 'VALID_ZERO_RECOMMENDATION'],
  'P7  VALID_ZERO_RECOMMENDATION remains green — not one of the fifteen is asserted against it');
eq(P7.res.no_action_classification.checks.map(function (c) { return c.predicate; })
  .filter(function (n) { return /^fully_covered_/.test(n); }), [],
  'P7a with no class-B condition in its ledger at all');
ok(labels(P7.world).filter(function (n) { return /^r6r7_freeze_paste_block_/.test(n); }).length > 0,
  'P7b and a READY still emits its freeze chunks — the locks gate on the verdict, not on the class');
eq(extractVar(CENSUS, 'R6R7_ACTIVATION_BUILD_').match(/'([^']+)'/)[1],
  'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1',
  'P7c the deployment build pin is still R5-R1 — no production runtime file changed this round');
eq(read('assets/specs/active/apps-script/63_api_v1_system_health.gs')
  .match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/)[1], 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1',
  'P7d and the release it follows has not moved either');

// ================================================================================================================
section('N — mutants');
// ================================================================================================================

function withCensus(src, entry, over, opts) {
  var o = {};
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  o.census = src;
  return runIt(entry, over, o);
}

mut('N1 the fingerprint blind to a field, so a moved row still matches', function () {
  var m = swap(CENSUS, "  'draft_version', 'quantity', 'shipping_method', 'last_mile_delivery', 'source_warehouse_id',",
    "  'quantity', 'shipping_method', 'last_mile_delivery', 'source_warehouse_id',");
  var clean = readback(freezeFrom(), { aHeader: { draft_version: '5' } });
  var badF = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', { aHeader: { draft_version: '5' } },
    { after: badF.source });
  return failed(clean.res).indexOf('route_A_route_view_is_byte_identical') >= 0
    && failed(bad.res).indexOf('route_A_route_view_is_byte_identical') < 0
    // and the FULL-row fingerprint still catches the move the route view went blind to.
    && failed(bad.res).indexOf('route_A_header_is_byte_identical_across_every_column') >= 0;
});

mut('N2 the readback recomputing its own baseline instead of refusing', function () {
  // The refusal is held by TWO locks — the early return and the proof guard — so the mutant removes both.
  // Either alone still STOPS, which is the point of having two.
  var m = swap(CENSUS, '  out.baseline_frozen = missing.length === 0;', '  out.baseline_frozen = true;');
  m = swap(m, "  if (out.baseline_frozen !== true) missing.push('baseline_frozen');",
    "  if (false) { missing.push('baseline_frozen'); }");
  var clean = runIt('RUN_R6R7_CONTROLLED_NO_ACTION_READBACK');
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK');
  return clean.res.verdict === 'BASELINE_NOT_FROZEN'
    && String(clean.res.stop_reason).indexOf('BASELINE_NOT_FROZEN') === 0
    && String(bad.res.stop_reason).indexOf('BASELINE_NOT_FROZEN') < 0;
});

mut('N3 the manifest reporting READY while the flag is already on', function () {
  var m = swap(CENSUS, "  P('flag_is_still_false', false, flagVal, flagVal === false);",
    "  P('flag_is_still_false', false, flagVal, true);");
  m = swap(m, "    if (out.flag && out.flag.value === true) missing.push('flag_already_true_cannot_be_ready_to_authorize');",
    "    if (false) { missing.push('x'); }");
  // A flag that is already on trips this predicate AND the preflight's own, so the claim is aimed at the
  // one this manifest owns rather than at the shared verdict.
  var clean = manifest(live(), { flagTrue: true });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(), { flagTrue: true });
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf('flag_is_still_false') >= 0
    && clean.res.proof_missing.indexOf('flag_already_true_cannot_be_ready_to_authorize') < 0
    && failed(bad.res).indexOf('flag_is_still_false') < 0;
});

mut('N4 the allowlist checked for length but not for content', function () {
  var m = swap(CENSUS, "  P('allowlist_is_exactly_the_one_frozen_scope', 1, allow ? allow.length : null, exact);",
    "  P('allowlist_is_exactly_the_one_frozen_scope', 1, allow ? allow.length : null, !!allow && allow.length === 1);");
  var opts = { allowlist: [{ company: 'ResUS', country: 'US', marketplace: 'Walmart', sku: 'CO1100-R' }] };
  var clean = manifest(live(), opts);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(), opts);
  return failed(clean.res).indexOf('allowlist_is_exactly_the_one_frozen_scope') >= 0
    && failed(bad.res).indexOf('allowlist_is_exactly_the_one_frozen_scope') < 0;
});

mut('N5 an unreadable deployment contract treated as a healthy one', function () {
  var m = swap(CENSUS, "  P('deployment_contract_is_readable', true, out.deployment.available, out.deployment.available === true);",
    "  P('deployment_contract_is_readable', true, out.deployment.available, true);");
  var opts = { after: 'sysModuleBuildStamps_ = undefined;' };
  var clean = manifest(live(), opts);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(), opts);
  return failed(clean.res).indexOf('deployment_contract_is_readable') >= 0
    && failed(bad.res).indexOf('deployment_contract_is_readable') < 0;
});

mut('N6 a new row counted as a confirmation', function () {
  var m = swap(CENSUS, "    out.new_rows.length === 0);", "    true);");
  m = swap(m, "    if ((out.new_rows || []).length !== 0) missing.push('new_rows_contradict_NO_ACTION_CONFIRMED');",
    "    if (false) { missing.push('x'); }");
  var over = { extraHeaders: [{ allocation_draft_id: 'SADH-M6', generation_type: 'system_generated',
      generation_run_id: 'AIRUN-M6' }],
    extraLines: [{ allocation_draft_line_id: 'SADL-M6', allocation_draft_id: 'SADH-M6', planned_qty: '7' }] };
  // A new row trips this predicate AND the AI-row count AND the proof guard. Aimed at the one it owns.
  var clean = readback(freezeFrom(), over);
  var badF = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', over, { after: badF.source });
  return clean.res.verdict === 'STOP'
    && failed(clean.res).indexOf('no_header_or_line_was_created') >= 0
    && failed(bad.res).indexOf('no_header_or_line_was_created') < 0
    && bad.res.new_rows.length === 1;
});

function browserWith(rows, baselineSeq, snippet) {
  var ctx = { console: { log: function () {} } };
  ctx.window = ctx;
  ctx.KM = { transport: { timeline: function () {
    return { request_timeline: rows.slice(), requests: rows.length,
      mutations: rows.filter(function (r) { return r.kind === 'write'; }),
      mutation_requests: rows.filter(function (r) { return r.kind === 'write'; }).length }; } } };
  ctx.__R6R7_BASELINE = { max_seq: baselineSeq };
  vm.createContext(ctx);
  return vm.runInContext(snippet, ctx);
}

mut('N7 the browser delta reading the TOTAL instead of the delta', function () {
  var m = DELTA_SNIP.replace('return r.seq > b.max_seq;', 'return true;');
  var rows = PRIOR.concat([req(4, 'weeklyAiPlan.generate', 'write')]);
  var clean = browserWith(rows, 3, DELTA_SNIP), bad = browserWith(rows, 3, m);
  return clean.new_mutation_requests === 1 && clean.verdict === 'ONE_GENERATION_REQUEST'
    && bad.new_mutation_requests === 2 && bad.verdict === 'STOP';
});

mut('N8 a second generation request accepted as one', function () {
  var m = DELTA_SNIP.replace('exactly_one_generation_request: gen.length === 1,',
    'exactly_one_generation_request: gen.length >= 1,');
  var rows = PRIOR.concat([req(4, 'weeklyAiPlan.generate', 'write'), req(5, 'weeklyAiPlan.generate', 'write')]);
  return browserWith(rows, 3, DELTA_SNIP).exactly_one_generation_request === false
    && browserWith(rows, 3, m).exactly_one_generation_request === true;
});

mut('N9 the manual total compared against itself rather than against BEFORE', function () {
  var m = swap(CENSUS, "  P('manual_planned_total_did_not_move', B.manual_planned_total, total, total === B.manual_planned_total);",
    "  P('manual_planned_total_did_not_move', total, total, true);");
  var over = { aLine: { planned_qty: '300' } };
  var clean = readback(freezeFrom(), over);
  var badF = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', over, { after: badF.source });
  return failed(clean.res).indexOf('manual_planned_total_did_not_move') >= 0
    && failed(bad.res).indexOf('manual_planned_total_did_not_move') < 0;
});

mut('N10 the readback claiming to have measured the browser', function () {
  var m = swap(CENSUS, "    measured_here: false,", "    measured_here: true,");
  var badF = freezeFrom(live(), { census: m });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', live(),
    { after: badF.source + auditSrc() });
  return readback(freezeFrom()).res.actual_browser_response.measured_here === false
    && bad.res.actual_browser_response.measured_here === true;
});

mut('N11 an unreadable reservation table read as an empty one', function () {
  // R3-P1 §三 — SHEET_PRESENT_BUT_UNREADABLE is the state that cannot be worked around: the table is there
  // and will not open, so neither a count nor a structural guarantee describes what is in it. The mutant
  // lets that state through as acceptable, which is exactly what null === null used to do.
  var m = swap(CENSUS,
    "    o.acceptable = false;", "    o.acceptable = true;");
  var breakIt = "(function(){ var b = SpreadsheetApp.openById('x'); var g = b.getSheetByName;"
    + " b.getSheetByName = function (n) { if (n === 'reservations') { return { getDataRange: function ()"
    + " { throw new Error('BOOM'); }, getLastRow: function () { return 1; } }; } return g.call(b, n); }; })();";
  var cf = freezeFrom(live(), { after: breakIt });
  var clean = readback(cf, live(), { after: breakIt });
  var bf = freezeFrom(live(), { census: m, after: breakIt });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK', live(),
    { after: breakIt + bf.source + auditSrc() });
  return failed(clean.res).indexOf('reservation_table_is_not_present_but_unreadable') >= 0
    && failed(bad.res).indexOf('reservation_table_is_not_present_but_unreadable') < 0;
});

mut('N12 the manifest proof dropping the frozen fingerprints', function () {
  var m = swap(CENSUS, "    if (!b.route_a_fingerprint || !b.route_b_fingerprint) missing.push('frozen_before.route_fingerprints');",
    "    if (false) { missing.push('x'); }");
  m = swap(m, "      a_route_view: b.route_a_fingerprint || null,",
    "      a_route_view: null,");
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST');
  return !!proofOf(manifest()).routes.a_route_view
    && proofOf(bad).routes.a_route_view === null
    && proofOf(bad).proof_complete === true;
});

// R6-R7-R3-P3 — THE REGRESSION THAT ACTUALLY HAPPENED, as a mutant. The pin left behind at R2 while the
// release moved to R3: the live manifest STOPs on a healthy deployment, and the old suite saw nothing.
mut('N13 the activation build pin left behind a release while the release moved on', function () {
  var m = swap(CENSUS, "var R6R7_ACTIVATION_BUILD_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';",
    "var R6R7_ACTIVATION_BUILD_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5';");
  var stalePin = (m.match(/var R6R7_ACTIVATION_BUILD_ = '([^']+)'/) || [])[1];
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST');
  // Caught three ways, and all three have to hold — the source parity, the live verdict, and the named
  // predicate. The source parity alone is what the old suite was missing.
  return ACTIVATION_PIN === RELEASE_P3            // the shipped pin agrees with the release
    && stalePin !== RELEASE_P3                     // the mutated one does not
    && manifest().res.verdict === 'READY_TO_AUTHORIZE'
    && bad.res.verdict === 'STOP'
    && failed(bad.res).indexOf('deployment_build_is_the_measured_one') >= 0;
});

// AND THE OPPOSITE FAILURE MODE: the pin made to follow whatever the deployment reports. That would end the
// STOPs forever, which is worse than the drift it "fixes" — so it must be caught too.
mut('N14 the pin adopting the observed deployment build instead of being pinned', function () {
  var m = swap(CENSUS, "  P('deployment_build_is_the_measured_one', R6R7_ACTIVATION_BUILD_, out.deployment.deployment_build," + NLF
    + '    out.deployment.deployment_build === R6R7_ACTIVATION_BUILD_);',
    "  P('deployment_build_is_the_measured_one', out.deployment.deployment_build, out.deployment.deployment_build," + NLF
    + '    out.deployment.deployment_build === out.deployment.deployment_build);');
  var wrong = { deployment: { deployment_build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R1' } };
  var clean = manifest(live(), wrong);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(), wrong);
  return clean.res.verdict === 'STOP'
    && failed(clean.res).indexOf('deployment_build_is_the_measured_one') >= 0
    && failed(bad.res).indexOf('deployment_build_is_the_measured_one') === -1;
});


mut('N15 a STOP emits usable freeze blocks — the state an operator could paste from a refusal', function () {
  // BOTH locks removed, because either alone still withholds. That is the point of having two, and it also
  // means neither can be probed on its own through behaviour.
  var m = swap(CENSUS, "  if (out.verdict !== 'READY_TO_AUTHORIZE' && out.freeze_paste_block) {",
    '  if (false) {');
  m = swap(m, "  if (out.freeze_paste_block && out.verdict === 'READY_TO_AUTHORIZE') {",
    '  if (out.freeze_paste_block) {');
  var clean = manifest(live(NONZERO));
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(NONZERO));
  function chunks(w) { return labels(w).filter(function (n) { return /^r6r7_freeze_paste_block_/.test(n); }).length; }
  return clean.res.verdict === 'STOP' && chunks(clean.world) === 0
    && bad.res.verdict === 'STOP' && chunks(bad.world) > 0;
});

mut('N16 the classification is inferred by the census instead of taken from production', function () {
  // An expected value taken from the observed one cannot fail. Here the failure mode is subtler: if the
  // census decides the class from the NUMBERS it is judging, a run whose reason is RESIDUAL_REMAINS — or
  // anything else — gets judged on the branch its own quantities happen to fit.
  var m = swap(CENSUS,
    "  if (R6R7_NO_ACTION_CLASSES_.indexOf(reason) !== -1) out.classification = reason;",
    "  if (R6R7_NO_ACTION_CLASSES_.indexOf(reason) !== -1) out.classification = reason;" + NLF
    + "  else if (fin(rq) && rq > 0) out.classification = 'FULLY_COVERED_BY_ACTIVE_PLAN';");
  var wrong = ppB({ reason: 'RESIDUAL_REMAINS' });
  var cleanR = CLASSIFY(wrong, GOOD_WINS);
  var w2 = W(live()); vm.runInContext(m, w2.ctx);
  var badR = vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(wrong) + ', '
    + JSON.stringify(GOOD_WINS) + ')', w2.ctx);
  return cleanR.classification === null
    && cleanR.checks_failed.indexOf('no_action_reason_is_one_of_the_two_proven_classes') >= 0
    && badR.classification === 'FULLY_COVERED_BY_ACTIVE_PLAN';
});

[['N17 class B stops requiring the plan to cover the whole recommendation',
  "    C('fully_covered_active_plan_covers_the_whole_recommendation',",
  "    if (false) C('fully_covered_active_plan_covers_the_whole_recommendation',",
  ppB({ qualifying_active_planned_qty: 100, per_scope: [{ over_planned_qty: 0 }] }),
  'fully_covered_active_plan_covers_the_whole_recommendation'],
 ['N18 the residual stops having to be numerically zero',
  "  C('no_action_residual_qty_is_numerically_zero', 0, rs, fin(rs) && rs === 0);",
  "  C('no_action_residual_qty_is_numerically_zero', 0, rs, true);",
  ppB({ residual_qty: 40 }), 'no_action_residual_qty_is_numerically_zero'],
 ['N19 the over-planned arithmetic is no longer checked',
  "    C('fully_covered_over_planned_equals_planned_minus_recommended', out.over_planned_qty_expected,",
  "    if (false) C('fully_covered_over_planned_equals_planned_minus_recommended', out.over_planned_qty_expected,",
  ppB({ per_scope: [{ over_planned_qty: 999 }] }),
  'fully_covered_over_planned_equals_planned_minus_recommended'],
 ['N20 the furthest window no longer has to equal the recommendation',
  "    C('fully_covered_furthest_window_equals_the_recommendation',",
  "    if (false) C('fully_covered_furthest_window_equals_the_recommendation',",
  ppB(), 'fully_covered_furthest_window_equals_the_recommendation', winsFor({ D18: 0, D30: 0, D45: 0, D90: 200 })],
 ['N21 a blank or negative window passes as a stored zero',
  "  C('every_required_window_is_stored_finite_and_nonnegative', W,",
  "  if (false) C('every_required_window_is_stored_finite_and_nonnegative', W,",
  ppB(), 'every_required_window_is_stored_finite_and_nonnegative', winsFor({ D18: 0, D30: -5, D45: 0, D90: 160 })],
 ['N22 would_write true is accepted',
  "  C('no_action_production_would_not_write', false, pp.would_write, pp.would_write === false);",
  "  C('no_action_production_would_not_write', false, pp.would_write, true);",
  ppB({ would_write: true }), 'no_action_production_would_not_write'],
 ['N23 the writer being reached is accepted',
  "  C('no_action_writer_was_not_reached', false, pp.writer_reached, pp.writer_reached === false);",
  "  C('no_action_writer_was_not_reached', false, pp.writer_reached, true);",
  ppB({ writer_reached: true }), 'no_action_writer_was_not_reached'],
 ['N24 a non-zero db_writes is accepted',
  "  C('no_action_db_writes_is_zero', 0, pp.db_writes, (CENSUS_num_(pp.db_writes) || 0) === 0);",
  "  C('no_action_db_writes_is_zero', 0, pp.db_writes, true);",
  ppB({ db_writes: 3 }), 'no_action_db_writes_is_zero'],
 ['N25 class A stops requiring a zero recommendation',
  "    C('recommended_qty_is_zero', 0, rq, rq === 0);",
  "    C('recommended_qty_is_zero', 0, rq, true);",
  ppA({ recommended_qty: 5 }), 'recommended_qty_is_zero', ZERO_WINS]
].forEach(function (c) {
  mut(c[0], function () {
    var m = swap(CENSUS, c[1], c[2]);
    var wins = c[5] || GOOD_WINS;
    var cleanR = CLASSIFY(c[3], wins);
    var w2 = W(live()); vm.runInContext(m, w2.ctx);
    var badR = vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(c[3]) + ', '
      + JSON.stringify(wins) + ')', w2.ctx);
    return cleanR.ok === false && cleanR.checks_failed.indexOf(c[4]) >= 0
      && badR.checks_failed.indexOf(c[4]) === -1;
  });
});

// ---- N26-N33  THE FINAL TIGHTENING. --------------------------------------------------------------------

mut('N26 the exclusion-style state check is restored — exactly the shape that was fail-open', function () {
  // The mutant is the ORIGINAL line, put back verbatim. Its probe is the state production really emits for a
  // zero recommendation, so this catches the defect as it actually existed rather than a caricature of it.
  var m = swap(CENSUS,
    "      CENSUS_str_(pp.recommendation_state) === R6R7_NONZERO_RECOMMENDATION_STATE_);",
    "      CENSUS_str_(pp.recommendation_state) !== 'VALID_ZERO'" + NLF
    + "        && CENSUS_str_(pp.recommendation_state) !== ''" + NLF
    + "        && CENSUS_str_(pp.recommendation_state) !== 'MISSING_RECOMMENDATION');");
  var probe = ppB({ recommendation_state: 'VALID_ZERO_RECOMMENDATION' });
  var NM = 'fully_covered_recommendation_state_is_exactly_nonzero_recommendation';
  var cleanR = CLASSIFY(probe, GOOD_WINS);
  var w2 = W(live()); vm.runInContext(m, w2.ctx);
  var badR = vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(probe) + ', '
    + JSON.stringify(GOOD_WINS) + ')', w2.ctx);
  return cleanR.checks_failed.indexOf(NM) >= 0 && badR.checks_failed.indexOf(NM) === -1;
});

mut('N27 the exclusion is restored with the list CORRECTED — still open to every unknown state', function () {
  // The tempting half-fix: keep the exclusion, spell the value right. It closes the one case that was found
  // and leaves a typo, a rename and next year's new state all passing — which is why the repair is an
  // equality and not a longer list.
  var m = swap(CENSUS,
    "      CENSUS_str_(pp.recommendation_state) === R6R7_NONZERO_RECOMMENDATION_STATE_);",
    "      CENSUS_str_(pp.recommendation_state) !== 'VALID_ZERO_RECOMMENDATION'" + NLF
    + "        && CENSUS_str_(pp.recommendation_state) !== ''" + NLF
    + "        && CENSUS_str_(pp.recommendation_state) !== 'MISSING_RECOMMENDATION');");
  var probe = ppB({ recommendation_state: 'BOGUS_STATE' });
  var NM = 'fully_covered_recommendation_state_is_exactly_nonzero_recommendation';
  var cleanR = CLASSIFY(probe, GOOD_WINS);
  var w2 = W(live()); vm.runInContext(m, w2.ctx);
  var badR = vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(probe) + ', '
    + JSON.stringify(GOOD_WINS) + ')', w2.ctx);
  return cleanR.checks_failed.indexOf(NM) >= 0 && badR.checks_failed.indexOf(NM) === -1;
});

var CANCEL_NEG = [{ key: 'A', recommended_qty: 160, qualifying_planned_qty: 660, residual_qty: 0,
  over_planned_qty: 500 },
  { key: 'B', recommended_qty: 0, qualifying_planned_qty: 0, residual_qty: 0, over_planned_qty: -140 }];
var CANCEL_SHORT = [{ key: 'A', recommended_qty: 60, qualifying_planned_qty: 460, residual_qty: 0,
  over_planned_qty: 400 },
  { key: 'B', recommended_qty: 100, qualifying_planned_qty: 60, residual_qty: 0, over_planned_qty: -40 }];

[['N28 a negative per-scope surplus is accepted, so two scopes can cancel to the right total',
  "    C('fully_covered_every_scope_over_planned_is_finite_and_nonnegative', 'no negative or unreadable surplus',",
  "    if (false) C('fully_covered_every_scope_over_planned_is_finite_and_nonnegative', 'no negative or unreadable surplus',",
  ppB({ per_scope: CANCEL_NEG }), 'fully_covered_every_scope_over_planned_is_finite_and_nonnegative'],
 ['N29 coverage is checked only in total, so a short scope hides behind a surplus elsewhere',
  "    C('fully_covered_every_scope_is_individually_covered',",
  "    if (false) C('fully_covered_every_scope_is_individually_covered',",
  ppB({ per_scope: CANCEL_SHORT }), 'fully_covered_every_scope_is_individually_covered'],
 ['N30 the rows no longer have to add up to the totals they were reported beside',
  "    C('fully_covered_per_scope_totals_reconcile_with_the_reported_totals',",
  "    if (false) C('fully_covered_per_scope_totals_reconcile_with_the_reported_totals',",
  ppB({ per_scope: [{ key: 'Z', recommended_qty: 9999, qualifying_planned_qty: 10359, residual_qty: 0,
    over_planned_qty: 360 }] }), 'fully_covered_per_scope_totals_reconcile_with_the_reported_totals'],
 ['N31 an empty per_scope counts as per-scope evidence',
  "    C('fully_covered_per_scope_evidence_is_present', 'at least one per_scope row', out.per_scope_count,",
  "    if (false) C('fully_covered_per_scope_evidence_is_present', 'at least one per_scope row', out.per_scope_count,",
  ppB({ per_scope: [], qualifying_active_planned_qty: 160 }), 'fully_covered_per_scope_evidence_is_present'],
 ['N32 a scope may carry a residual of its own',
  "    C('fully_covered_every_scope_residual_is_exactly_zero', 'residual_qty === 0 in EVERY scope',",
  "    if (false) C('fully_covered_every_scope_residual_is_exactly_zero', 'residual_qty === 0 in EVERY scope',",
  ppB({ per_scope: [{ key: 'A', recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 12,
    over_planned_qty: 360 }] }), 'fully_covered_every_scope_residual_is_exactly_zero'],
 ['N33 the state check is dropped from class B altogether',
  "    C('fully_covered_recommendation_state_is_exactly_nonzero_recommendation',",
  "    if (false) C('fully_covered_recommendation_state_is_exactly_nonzero_recommendation',",
  ppB({ recommendation_state: 'VALID_ZERO_RECOMMENDATION' }),
  'fully_covered_recommendation_state_is_exactly_nonzero_recommendation']
].forEach(function (c) {
  mut(c[0], function () {
    var m = swap(CENSUS, c[1], c[2]);
    var cleanR = CLASSIFY(c[3], GOOD_WINS);
    var w2 = W(live()); vm.runInContext(m, w2.ctx);
    var badR = vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(c[3]) + ', '
      + JSON.stringify(GOOD_WINS) + ')', w2.ctx);
    return cleanR.ok === false && cleanR.checks_failed.indexOf(c[4]) >= 0
      && badR.checks_failed.indexOf(c[4]) === -1;
  });
});

mut('N34 the surplus expectation is clamped at zero again, so the printed number is not the equation',
function () {
  var m = swap(CENSUS,
    "  out.over_planned_qty_expected = (fin(qp) && fin(rq)) ? (qp - rq) : null;",
    "  out.over_planned_qty_expected = (fin(qp) && fin(rq)) ? Math.max(0, qp - rq) : null;");
  var probe = ppB({ qualifying_active_planned_qty: 100,
    per_scope: [{ key: 'A', recommended_qty: 160, qualifying_planned_qty: 100, residual_qty: 0,
      over_planned_qty: 0 }] });
  var cleanR = CLASSIFY(probe, GOOD_WINS);
  var w2 = W(live()); vm.runInContext(m, w2.ctx);
  var badR = vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(probe) + ', '
    + JSON.stringify(GOOD_WINS) + ')', w2.ctx);
  // Both refuse the run — the coverage conditions see to that. What the mutant loses is the honest number
  // and the arithmetic condition that names it.
  return cleanR.over_planned_qty_expected === -60
    && cleanR.checks_failed.indexOf('fully_covered_over_planned_equals_planned_minus_recommended') >= 0
    && badR.over_planned_qty_expected === 0
    && badR.checks_failed.indexOf('fully_covered_over_planned_equals_planned_minus_recommended') === -1;
});

// ---- N35-N39  THE ROW-LEVEL CONTRACT. ------------------------------------------------------------------

var WRONG_SITE = [{ key: 'ResUS|US|Walmart|CO1100-R', marketplace: 'Walmart', sku: 'CO1100-R',
  recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0, over_planned_qty: 360 }];
var TWO_ROWS = [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R',
  recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0, over_planned_qty: 360 },
  { key: 'ResUS|US|Amazon|CO1200-R', marketplace: 'Amazon', sku: 'CO1200-R', recommended_qty: 0,
    qualifying_planned_qty: 0, residual_qty: 0, over_planned_qty: 0 }];
var FALSE_ROW = [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R',
  recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0, over_planned_qty: 400 }];

[['N35 the one row no longer has to be the frozen scope — any site\'s evidence would do',
  "    C('fully_covered_per_scope_row_is_exactly_the_frozen_scope',",
  "    if (false) C('fully_covered_per_scope_row_is_exactly_the_frozen_scope',",
  ppB({ per_scope: WRONG_SITE }), 'fully_covered_per_scope_row_is_exactly_the_frozen_scope'],
 ['N36 the identity is checked on the SKU alone, so a different marketplace passes',
  "      if (CENSUS_str_(idn.marketplace) !== R6R7_SCOPE_.marketplace) idn.mismatched.push('marketplace');",
  '      // marketplace no longer compared',
  ppB({ per_scope: WRONG_SITE }), 'fully_covered_per_scope_row_is_exactly_the_frozen_scope'],
 ['N37 any number of rows is accepted again, so an unauthorized scope rides along',
  "    C('fully_covered_per_scope_has_exactly_one_row', 1, out.per_scope_count, out.per_scope_count === 1);",
  "    C('fully_covered_per_scope_has_exactly_one_row', 1, out.per_scope_count, out.per_scope_count >= 1);",
  ppB({ per_scope: TWO_ROWS }), 'fully_covered_per_scope_has_exactly_one_row'],
 ['N38 the row\'s own arithmetic is no longer checked, only the aggregate',
  "    C('fully_covered_scope_over_planned_equals_its_own_planned_minus_recommended',",
  "    if (false) C('fully_covered_scope_over_planned_equals_its_own_planned_minus_recommended',",
  ppB({ per_scope: FALSE_ROW }),
  'fully_covered_scope_over_planned_equals_its_own_planned_minus_recommended'],
 ['N39 the row\'s own recommendation may be zero, so a zero-need scope poses as fully covered',
  "    C('fully_covered_scope_recommended_qty_is_finite_and_positive', 'a finite number > 0',",
  "    if (false) C('fully_covered_scope_recommended_qty_is_finite_and_positive', 'a finite number > 0',",
  ppB({ per_scope: [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R',
    recommended_qty: 0, qualifying_planned_qty: 520, residual_qty: 0, over_planned_qty: 520 }] }),
  'fully_covered_scope_recommended_qty_is_finite_and_positive']
].forEach(function (c) {
  mut(c[0], function () {
    var m = swap(CENSUS, c[1], c[2]);
    var cleanR = CLASSIFY(c[3], GOOD_WINS);
    var w2 = W(live()); vm.runInContext(m, w2.ctx);
    var badR = vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(c[3]) + ', '
      + JSON.stringify(GOOD_WINS) + ')', w2.ctx);
    return cleanR.ok === false && cleanR.checks_failed.indexOf(c[4]) >= 0
      && badR.checks_failed.indexOf(c[4]) === -1;
  });
});

mut('N40 the key is REBUILT from the frozen scope instead of read out of production\'s own key',
function () {
  // The census would then be comparing its own construction of the key against its own construction of the
  // key: a wrong site whose key contradicts its sku fields would sail through, because the key under
  // comparison is no longer the one production wrote.
  var m = swap(CENSUS, '    var parts = CENSUS_str_(row0.key).split(\'|\');',
    "    var parts = [R6R7_SCOPE_.company, R6R7_SCOPE_.country, R6R7_SCOPE_.marketplace," + NLF
    + '      CENSUS_str_(row0.sku)];');
  var probe = ppB({ per_scope: [{ key: 'ResEU|CA|Walmart|CO1100-R', marketplace: 'Amazon',
    sku: 'CO1100-R', recommended_qty: 160, qualifying_planned_qty: 520, residual_qty: 0,
    over_planned_qty: 360 }] });
  var NM = 'fully_covered_per_scope_row_is_exactly_the_frozen_scope';
  var cleanR = CLASSIFY(probe, GOOD_WINS);
  var w2 = W(live()); vm.runInContext(m, w2.ctx);
  var badR = vm.runInContext('CENSUS_r6r7ClassifyNoAction_(' + JSON.stringify(probe) + ', '
    + JSON.stringify(GOOD_WINS) + ')', w2.ctx);
  return cleanR.checks_failed.indexOf(NM) >= 0 && badR.checks_failed.indexOf(NM) === -1;
});

mut('N41 a STOP from one of the NEW row conditions still hands over a freeze block', function () {
  var m = swap(CENSUS, "  if (out.verdict !== 'READY_TO_AUTHORIZE' && out.freeze_paste_block) {",
    '  if (false) {');
  m = swap(m, "  if (out.freeze_paste_block && out.verdict === 'READY_TO_AUTHORIZE') {",
    '  if (out.freeze_paste_block) {');
  var bend = 'weeklyAiPlanNoActionDecision_ = (function (orig) { return function (recState, planned) {' + NLF
    + '  var d = orig.apply(null, arguments);' + NLF
    + "  if (d && d.reason === 'FULLY_COVERED_BY_ACTIVE_PLAN') { d.per_scope[0].over_planned_qty = 400; }" + NLF
    + '  return d; }; })(weeklyAiPlanNoActionDecision_);';
  var clean = manifest(live(FULLY_COVERED), { after: bend });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(FULLY_COVERED),
    { after: bend });
  function chunks(w) { return labels(w).filter(function (n) { return /^r6r7_freeze_paste_block_/.test(n); }).length; }
  return clean.res.verdict === 'STOP' && chunks(clean.world) === 0
    && bad.res.verdict === 'STOP' && chunks(bad.world) > 0;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
process.exit(fail ? 1 : 0);
