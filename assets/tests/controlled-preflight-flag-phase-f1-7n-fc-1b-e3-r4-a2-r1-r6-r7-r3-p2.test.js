// F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R3-P2 — THE FLAG IS A PHASE THIS CENSUS OBSERVES, NOT A POSTURE IT DEMANDS.
//
// RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT asserted P('flag_is_still_false_this_round', false, flagVal,
// flagVal === false), and that made it contradict the runbook it belongs to. The activation procedure
// requires running the preflight AGAIN after the flag is on — that run is the last read before a person
// presses the button — and the predicate STOPPED every time, reporting a failed condition for the operator
// having done exactly what the procedure told them to do.
//
// It was measured live. Production answered AI_PLAN_NO_ACTION / NO_REPLENISHMENT_REQUIRED with would_write
// false, writer_reached false and db_writes 0, and the ONLY failing predicate was the flag being in the
// position step 8 had just put it in.
//
// The deeper mistake is a category one, and it is the one this suite pins:
//
//   MAY the flag be flipped        is the ACTIVATION MANIFEST's question. It keeps its own
//                                  flag_is_still_false, untouched, and section D proves it still refuses.
//   WOULD a generation write       is the PREFLIGHT's question, and it is legitimate in both postures —
//                                  most of all in the second.
//
// A read-only diagnostic that refuses to read is not a safety mechanism. It is a diagnostic that has quietly
// appointed itself an authorization source, which is why authorization_is_external is now a named predicate
// rather than a comment.
//
// The fix ADDS checks. PRE_ACTIVATION carries 34 predicates and POST_ACTIVATION 42, because the phase where
// a write is actually possible pins every number the authorization rested on.
//
// Run: node assets/tests/controlled-preflight-flag-phase-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r3-p2.test.js

var fs = require('fs');
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
// THE WORLD IS LOADED FROM THE R6-R7-R3 SUITE, NOT COPIED — the rule every round since R2. A second copy of the
// fixtures would let two suites disagree about what production looks like.
// ================================================================================================================
var R3_OF = 'assets/tests/controlled-no-action-activation-manifest-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r3.test.js';
var R3_SRC = read(R3_OF).replace(/\r\n/g, '\n');
var CUT = R3_SRC.indexOf("\nsection('A ");
if (CUT < 0) throw new Error('the R6-R7-R3 suite no longer opens its assertions with section()');
var SHARED = (new Function('require', '__dirname', '__filename', 'module', 'exports', 'console',
  R3_SRC.slice(0, CUT)
  + '\nreturn { World: World, failed: failed, swap: swap, extractFn: extractFn, extractVar: extractVar,'
  + ' extractStmt: extractStmt, CENSUS: CENSUS, G61: G61, live: live, projection: projection, NLF: NLF,'
  + ' W: W, runIt: runIt, manifest: manifest, lineOf: lineOf, labels: labels, proofOf: proofOf,'
  + ' freezeFrom: freezeFrom, readback: readback, DEPLOYMENT_BUILD: DEPLOYMENT_BUILD };'
))(require, __dirname, __filename, module, exports, { log: function () {}, error: function () {} });

var World = SHARED.World, failed = SHARED.failed, swap = SHARED.swap;
var extractFn = SHARED.extractFn, extractVar = SHARED.extractVar, extractStmt = SHARED.extractStmt;
var CENSUS = SHARED.CENSUS, live = SHARED.live, NLF = SHARED.NLF;
var runIt = SHARED.runIt, manifest = SHARED.manifest, lineOf = SHARED.lineOf, proofOf = SHARED.proofOf;
var freezeFrom = SHARED.freezeFrom, readback = SHARED.readback;
var DEPLOYMENT_BUILD = SHARED.DEPLOYMENT_BUILD;

var G00 = read('assets/specs/active/apps-script/00_config.gs');
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var RUNBOOK = read('docs/planning/CONTROLLED_NO_ACTION_ACTIVATION_RUNBOOK.md');
var PASTE = read('docs/planning/R6R7_PREFLIGHT_PHASE_MINIMAL_PASTE.md');
var RO = require('./_release-order.js');

function pf(over, opts) { return runIt('RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', over || live(), opts || {}); }
function withCensus(src, entry, over, opts) {
  var o = {};
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  o.census = src;
  return runIt(entry, over || live(), o);
}
// A flag reader that answers something other than a strict boolean. Every one of these is UNOBSERVABLE, and
// the string case is the reason the read is strict: 'false' is TRUTHY.
function reader(body) { return 'inventoryAiPlanDbGenerationEnabled_ = ' + body + ';'; }
var BLOCKED = { gap: { calculation_status: 'BLOCKED', d18_suggested_qty: '', d30_suggested_qty: '',
  d45_suggested_qty: '', d90_suggested_qty: '' } };
var NONZERO = { gap: { d18_gap_qty: 900, d18_suggested_qty: 900, d30_suggested_qty: 900,
  d45_suggested_qty: 900, d90_gap_qty: 900, d90_suggested_qty: 900 } };
// Production answering AI_PLAN_NO_ACTION and would_write true at the same time. Not a mutant — a modelled
// contradiction, because the two facts come from different fields of the same envelope and nothing in the
// data prevents them disagreeing.
var WOULD_WRITE = '(function(){ var o = CENSUS_r6r7ProductionPath_;'
  + ' CENSUS_r6r7ProductionPath_ = function () { var r = o(); r.would_write = true; return r; }; })();';

var EXACT = [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' }];

// ================================================================================================================
section('A — two legal phases, and the SAME verdict in each');
// ================================================================================================================

var PRE = pf();
eq(PRE.res.verdict, 'READY_NO_ACTION', 'A1  flag false + exact allowlist is READY_NO_ACTION');
eq(PRE.res.flag_phase.phase, 'PRE_ACTIVATION', 'A1a in phase PRE_ACTIVATION');
eq(failed(PRE.res), [], 'A1b with no predicate failed');
eq([PRE.res.flag_phase.flag_effective, PRE.res.flag_phase.observable, PRE.res.flag_phase.reader_present],
  [false, true, true], 'A1c the flag read strictly false, through the server\'s own reader');

var POST = pf(live(), { flagTrue: true });
eq(POST.res.verdict, 'READY_NO_ACTION',
  'A2  flag TRUE + exact allowlist is ALSO READY_NO_ACTION — the run step 8 of the runbook requires');
eq(POST.res.flag_phase.phase, 'POST_ACTIVATION', 'A2a in phase POST_ACTIVATION');
eq(failed(POST.res), [], 'A2b with no predicate failed');
eq(POST.res.flag_phase.flag_effective, true, 'A2c and the flag read strictly true');

// THE FIX ADDS CHECKS RATHER THAN REMOVING THEM. §G forbids repairing this by deleting a safety predicate,
// so the count is asserted in both directions: the open-window phase must be the STRICTER of the two.
eq([PRE.res.predicates_passed, PRE.res.predicates_failed], [34, 0], 'A3  PRE_ACTIVATION runs 34 predicates');
eq([POST.res.predicates_passed, POST.res.predicates_failed], [42, 0],
  'A3a POST_ACTIVATION runs 42 — eight MORE, because that is the phase where a write is possible');
ok(POST.res.predicates_passed > PRE.res.predicates_passed,
  'A3b the phase with the open window is the stricter one, never the more permissive');

// §C — the three things the preflight must report about itself.
[['PRE', PRE], ['POST', POST]].forEach(function (c, i) {
  var f = c[1].res.flag_phase;
  eq(f.name, 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_',
    'A4' + (i ? 'a' : '') + '  ' + c[0] + ' names the flag it read');
  eq(f.authorization_is_external, true,
    'A4' + (i ? 'b' : '-x') + ' and declares the authorization external to itself');
  eq(f.authorized_by, null,
    'A4' + (i ? 'c' : '-y') + ' naming no authorizer, because it is not one');
  ok(String(f.why_external).indexOf('ACTIVATION_MANIFEST') > 0,
    'A4' + (i ? 'd' : '-z') + ' and points at the census that DOES hold that gate');
});
eq(PRE.res.flag.value, false, 'A5  the legacy flag.value field still reports the reading');
eq([PRE.res.flag.phase, POST.res.flag.phase], ['PRE_ACTIVATION', 'POST_ACTIVATION'],
  'A5a and now carries the phase beside it');
ok(String(PRE.res.flag.note).indexOf('BOTH positions are legal') === 0,
  'A5b the note no longer claims false is the only correct posture');

// The named predicates that replaced the hard-coded one.
['flag_effective_is_an_observable_boolean', 'flag_phase_is_one_of_the_two_declared_phases',
  'this_preflight_is_not_an_authorization_source', 'no_wildcard_or_partial_allowlist_entry'
].forEach(function (n, i) {
  ok((PRE.res.predicates || []).some(function (p) { return p.predicate === n; }),
    'A6' + String.fromCharCode(97 + i) + ' ' + n + ' is asserted, in both phases');
});
ok((PRE.res.predicates || []).some(function (p) { return p.predicate === 'pre_activation_flag_effective_is_false'; }),
  'A7  PRE_ACTIVATION still asserts the flag is off — the phase label is checked, not just printed');
ok((POST.res.predicates || []).some(function (p) { return p.predicate === 'post_activation_flag_effective_is_true'; }),
  'A7a and POST_ACTIVATION asserts it is on');
eq((PRE.res.predicates || []).filter(function (p) { return p.predicate === 'flag_is_still_false_this_round'; }).length, 0,
  'A8  and the contradictory predicate is gone, not merely passing');

// ================================================================================================================
section('B — a flag we cannot read is not a flag in a known position');
// ================================================================================================================

function unobservable(label, body, expectFlag) {
  var r = pf(live(), { after: reader(body) });
  eq(r.res.verdict, 'STOP', label);
  eq(r.res.flag_phase.phase, 'UNOBSERVABLE', label + ' — phase UNOBSERVABLE');
  eq(r.res.flag_phase.observable, false, label + ' — and it says so');
  ok(failed(r.res).indexOf('flag_effective_is_an_observable_boolean') >= 0
    && failed(r.res).indexOf('flag_phase_is_one_of_the_two_declared_phases') >= 0,
    label + ' — under both named predicates');
  if (expectFlag !== undefined) {
    eq(r.res.flag_phase.flag_effective, expectFlag, label + ' — reporting what it actually got');
  }
  return r;
}
var B1 = pf(live(), { after: 'inventoryAiPlanDbGenerationEnabled_ = undefined;' });
eq(B1.res.verdict, 'STOP', 'B1  an ABSENT flag reader STOPS');
eq(B1.res.flag_phase.reader_present, false, 'B1a and reports the reader missing');
ok(String(B1.res.flag_phase.reason).indexOf('FLAG_READER_ABSENT') === 0, 'B1b under its own code');
ok(String(B1.res.flag_phase.reason).indexOf('00_config.gs is not synced') > 0,
  'B1c naming what an operator has to fix');

var B2 = unobservable('B2  a reader that THREW', 'function () { throw new Error("BOOM"); }', null);
ok(String(B2.res.flag_phase.reason).indexOf('FLAG_READER_THREW') === 0, 'B2a under its own code');
unobservable('B3  a reader answering null', 'function () { return null; }', null);
unobservable('B4  a reader answering undefined', 'function () { return undefined; }');
// THE DANGEROUS ONE. 'false' is a TRUTHY string, so a lenient read would have called this POST_ACTIVATION and
// walked into the open-window branch on a flag nobody could actually read.
var B5 = unobservable('B5  a reader answering the STRING "false"', 'function () { return "false"; }', 'false');
ok(String(B5.res.flag_phase.reason).indexOf('FLAG_NOT_A_BOOLEAN') === 0, 'B5a under its own code');
ok(String(B5.res.flag_phase.reason).indexOf('truthiness') > 0,
  'B5b and says why a truthy non-boolean is refused rather than coerced');
unobservable('B6  a reader answering 1', 'function () { return 1; }', 1);
unobservable('B7  a reader answering 0', 'function () { return 0; }', 0);
unobservable('B8  a reader answering an object', 'function () { return { on: true }; }');

// ================================================================================================================
section('C — the allowlist, in both phases');
// ================================================================================================================

function listStop(label, list, opts) {
  var o = { allowlist: list };
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  var r = pf(live(), o);
  eq(r.res.verdict, 'STOP', label);
  return r;
}
var C1 = listStop('C1  an EMPTY allowlist STOPS', []);
ok(failed(C1.res).indexOf('allowlist_holds_exactly_this_one_scope') >= 0, 'C1a by count');
var C2 = listStop('C2  a WIDENED allowlist STOPS',
  EXACT.concat([{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'OTHER-SKU' }]));
ok(failed(C2.res).indexOf('allowlist_holds_exactly_this_one_scope') >= 0, 'C2a by count');
var C3 = listStop('C3  an ALL_SITES wildcard STOPS',
  [{ company: 'ResUS', country: 'US', marketplace: 'ALL_SITES', sku: 'CO1100-R' }]);
ok(failed(C3.res).indexOf('no_wildcard_or_partial_allowlist_entry') >= 0, 'C3a as a wildcard, by name');
var C4 = listStop('C4  a BLANK axis STOPS',
  [{ company: 'ResUS', country: '', marketplace: 'Amazon', sku: 'CO1100-R' }]);
ok(failed(C4.res).indexOf('no_wildcard_or_partial_allowlist_entry') >= 0, 'C4a a blank is a wildcard');
var C5 = listStop('C5  a DIFFERENT single scope STOPS',
  [{ company: 'ResUS', country: 'US', marketplace: 'Walmart', sku: 'CO1100-R' }]);
ok(failed(C5.res).indexOf('allowlist_entry_is_this_scope') >= 0, 'C5a because it is not this scope');

// §F — after the flip, exactness is asserted a SECOND time, in the phase's own words.
[['C6  empty', []], ['C6a widened', EXACT.concat([{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'X' }])],
  ['C6b wildcard', [{ company: 'ResUS', country: 'US', marketplace: 'ALL_SITES', sku: 'CO1100-R' }]]
].forEach(function (c) {
  var r = listStop(c[0] + ' STOPS after the flip too', c[1], { flagTrue: true });
  ok(failed(r.res).indexOf('post_activation_allowlist_is_exactly_the_frozen_scope') >= 0,
    c[0] + ' — under the POST_ACTIVATION exactness claim');
});
eq(pf(live(), { allowlist: EXACT }).res.verdict, 'READY_NO_ACTION',
  'C7  and the exact one-entry allowlist is accepted');
eq(POST.res.allowlist.is_exactly_the_frozen_scope, true, 'C7a reported as exactly the frozen scope');

// ================================================================================================================
section('D — the authorization gate did NOT move here');
// ================================================================================================================
//
// §E. The manifest is the census a person authorizes from, and it keeps its own flag_is_still_false. If this
// round had "fixed" the contradiction by relaxing that too, the activation would have no gate at all.

var D1 = manifest(live(), { flagTrue: true });
eq(D1.res.verdict, 'STOP', 'D1  the activation manifest still STOPS on a flag that is already true');
eq(failed(D1.res), ['flag_is_still_false'],
  'D1a on exactly that predicate and no other — the preflight it calls is now happy, and the gate holds anyway');
eq(D1.res.flag.value, true, 'D1b having observed the flag as true');
var D2 = manifest();
eq(D2.res.verdict, 'READY_TO_AUTHORIZE', 'D2  and it still authorizes from a flag that is false');
ok(D2.res.predicates_passed >= 68, 'D2a with its full predicate set intact');
// The manifest's gate and the preflight's phase are INDEPENDENT: breaking the preflight's phase claims must
// not open the manifest.
var relax = swap(CENSUS, "  if (fp.phase === 'PRE_ACTIVATION') {", '  if (false) {');
var D3 = withCensus(relax, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(), { flagTrue: true });
eq(D3.res.verdict, 'STOP',
  'D3  and a census whose preflight phase claims are gutted still cannot authorize with the flag on');
ok(failed(D3.res).indexOf('flag_is_still_false') >= 0, 'D3a because the gate is somewhere else entirely');

// ================================================================================================================
section('E — POST_ACTIVATION pins every number the authorization rested on');
// ================================================================================================================

var POST_ONLY = ['post_activation_flag_effective_is_true', 'post_activation_allowlist_is_exactly_the_frozen_scope',
  'post_activation_production_outcome_is_no_action', 'post_activation_production_code_is_no_replenishment_required',
  'post_activation_production_would_not_write', 'post_activation_writer_would_not_be_reached',
  'post_activation_recommended_qty_is_zero', 'post_activation_qualifying_active_planned_qty_is_520',
  'post_activation_residual_qty_is_zero'];
POST_ONLY.forEach(function (n, i) {
  ok((POST.res.predicates || []).some(function (p) { return p.predicate === n; }),
    'E1' + String.fromCharCode(97 + i) + ' POST_ACTIVATION asserts ' + n);
  ok(!(PRE.res.predicates || []).some(function (p) { return p.predicate === n; }),
    'E1' + String.fromCharCode(97 + i) + '-pre and PRE_ACTIVATION does not — the phase decides');
});

// A refusal from production STOPS in both phases.
var E2 = pf(BLOCKED);
eq(E2.res.verdict, 'STOP', 'E2  a production REFUSAL STOPS in PRE_ACTIVATION');
ok(failed(E2.res).indexOf('production_path_would_not_refuse') >= 0, 'E2a by name');
var E3 = pf(BLOCKED, { flagTrue: true });
eq(E3.res.verdict, 'STOP', 'E3  and STOPS in POST_ACTIVATION');
ok(failed(E3.res).indexOf('post_activation_production_outcome_is_no_action') >= 0,
  'E3a naming the phase\'s own claim as well');

// A residual appearing after the flip is the state changing under the authorization.
var E4 = pf(NONZERO, { flagTrue: true });
eq(E4.res.verdict, 'STOP',
  'E4  a NONZERO recommendation after the flip STOPS — nobody authorized a run that writes');
ok(failed(E4.res).indexOf('post_activation_residual_qty_is_zero') >= 0, 'E4a because the residual moved');
ok(failed(E4.res).indexOf('post_activation_production_outcome_is_no_action') >= 0,
  'E4b and production would no longer answer no-action');
// The same world BEFORE the flip is a legitimate reading, not a failure of this kind.
var E4pre = pf(NONZERO);
eq(E4pre.res.flag_phase.phase, 'PRE_ACTIVATION', 'E4c the same world reads as PRE_ACTIVATION with the flag off');
eq(failed(E4pre.res).filter(function (n) { return n.indexOf('post_activation_') === 0; }), [],
  'E4d and none of the POST_ACTIVATION claims is charged against it');

// §7 of the task — the contradiction that no single field can catch: outcome says no-action, would_write says
// it writes. The two come from different fields of the same envelope, and nothing in the data prevents it.
var E5 = pf(live(), { flagTrue: true, after: WOULD_WRITE });
eq(E5.res.verdict, 'STOP', 'E5  AI_PLAN_NO_ACTION beside would_write true STOPS');
eq(failed(E5.res), ['post_activation_production_would_not_write'],
  'E5a on exactly one predicate — the contradiction is isolated, not buried in a pile');
eq(E5.res.production_path.outcome, 'AI_PLAN_NO_ACTION',
  'E5b while the outcome field still says no-action, which is the whole point');

// ================================================================================================================
section('F — the bounded proof places its own verdict');
// ================================================================================================================

var MAX = vm.runInNewContext(extractStmt(CENSUS, 'R6R7_PROOF_MAX_BYTES_') + ' R6R7_PROOF_MAX_BYTES_');
[['PRE', PRE, 'PRE_ACTIVATION', false], ['POST', POST, 'POST_ACTIVATION', true]].forEach(function (c, i) {
  var raw = lineOf(c[1].world, 'r6r7_proof');
  var p = JSON.parse(raw);
  ok(raw.length <= MAX, 'F1' + (i ? 'a' : '') + '  the ' + c[0] + ' proof is within the cap ('
    + raw.length + ' bytes)');
  eq(p.flag_phase, c[2], 'F2' + (i ? 'a' : '') + '  and carries the phase');
  eq(p.flag_effective, c[3], 'F3' + (i ? 'a' : '') + '  and the effective flag');
  eq(p.flag_observable, true, 'F4' + (i ? 'a' : '') + '  and that it was observable');
  eq(p.authorization_is_external, true, 'F5' + (i ? 'a' : '') + '  and that the authorization is external');
  eq(p.allowlist_is_exactly_the_frozen_scope, true, 'F6' + (i ? 'a' : '') + '  and the allowlist exactness');
  eq(p.proof_complete, true, 'F7' + (i ? 'a' : '') + '  marked complete');
});
// An UNOBSERVABLE phase reaches the proof too — a refusal an operator cannot read is not a refusal.
var F8 = JSON.parse(lineOf(B1.world, 'r6r7_proof'));
eq([F8.flag_phase, F8.flag_observable], ['UNOBSERVABLE', false],
  'F8  and an unreadable flag reaches the proof as UNOBSERVABLE rather than as a blank');
eq(F8.verdict, 'STOP', 'F8a beside the STOP it caused');
// §I — the declared-evidence contract gained the phase, so a verdict without it cannot stand.
var REQ = vm.runInNewContext(extractStmt(CENSUS, 'R6R7_REQUIRED_EXPORT_')
  + ' R6R7_REQUIRED_EXPORT_.RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT');
eq(REQ, ['production_path', 'parity', 'flag_phase'],
  'F9  flag_phase is declared evidence, not a decoration');

// ================================================================================================================
section('G — nothing wrote, nothing was flipped, nothing was deployed');
// ================================================================================================================

var EVERY = [['PRE', PRE], ['POST', POST], ['unobservable', B1], ['blocked', E2], ['nonzero post', E4],
  ['would_write', E5], ['manifest flag on', D1], ['manifest flag off', D2]];
EVERY.forEach(function (c, i) {
  eq([c[1].res.db_writes, c[1].res.writer_calls, c[1].res.writer_constructed, c[1].res.submit_calls,
    c[1].res.route_save_calls, c[1].res.reservation_writes], [0, 0, false, 0, 0, 0],
    'G1' + String.fromCharCode(97 + i) + ' ' + c[0] + ': db_writes 0, writer_calls 0, and four more zeros');
  eq(c[1].world.dbWrites(), 0,
    'G1' + String.fromCharCode(97 + i) + '-m and zero cells touched, measured on the sheets');
});
eq(/var WAP_BUILD_VERSION_ = '([^']+)'/.exec(G61)[1], DEPLOYMENT_BUILD, 'G2  61_ is untouched');
eq(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/.exec(G63)[1], DEPLOYMENT_BUILD,
  'G2a and the deployment release does not move for a diagnostic patch');
eq(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R3-P2'), -1,
  'G2b which is why this round is not in the release order either');
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false/.test(G00),
  'G3  00_config.gs still holds the flag at false');
var PHASE_FNS = ['CENSUS_r6r7FlagPhase_'];
eq(PHASE_FNS.filter(function (n) {
  var s = extractFn(CENSUS, n);
  return /appendRow|setValues|setValue\s*\(/.test(s)
    || /INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=[^=]/.test(s)
    || /handleGenerateWeeklyAiPlanDraft_\s*\(/.test(s);
}), [], 'G4  the phase reader writes nothing, sets no flag and calls no generation');
ok(extractFn(CENSUS, 'CENSUS_r6r7FlagPhase_').indexOf('inventoryAiPlanDbGenerationEnabled_') > 0,
  'G4a it reads the server\'s own gate rather than restating a default');

// ================================================================================================================
section('H — the frozen baseline survives the sync, and the paste instructions are not stale');
// ================================================================================================================
//
// The operator's Apps Script copy holds a FROZEN R6R7_NO_ACTION_BEFORE_. A whole-file re-paste would reset it
// to null and cost them the baseline — three log pastes to rebuild. So the repo keeps the constant null (a
// repository cannot hold one activation's live baseline) and ships a minimal-paste document instead. A
// document whose find-strings have drifted is worse than no document, so they are asserted here.

var BEFORE_SRC = extractStmt(CENSUS, 'R6R7_NO_ACTION_BEFORE_');
ok(/frozen_at:\s*null/.test(BEFORE_SRC),
  'H1  the repo copy of R6R7_NO_ACTION_BEFORE_ is still unfrozen, as a repo copy must be');
ok(/calculation_run_id:\s*null/.test(BEFORE_SRC) && /route_a_header_snapshot:\s*null/.test(BEFORE_SRC),
  'H1a with every live field null rather than somebody\'s captured activation');
// And the readback still refuses against it, which is how the operator verifies the freeze survived.
eq(runIt('RUN_R6R7_CONTROLLED_NO_ACTION_READBACK').res.verdict, 'BASELINE_NOT_FROZEN',
  'H2  so a fresh repo copy answers BASELINE_NOT_FROZEN — the check the operator runs after the sync');
eq(readback(freezeFrom(), live(), { noAudit: true }).res.verdict, 'AWAITING_ACTIVATION',
  'H2a while a frozen one answers AWAITING_ACTIVATION, which is the proof the freeze is intact');

ok(PASTE.indexOf('R6R7_NO_ACTION_BEFORE_') > 0, 'H3  the minimal-paste document names the constant to protect');
ok(PASTE.indexOf('do NOT re-paste the whole file') > 0 || PASTE.indexOf('not re-paste the whole file') > 0,
  'H3a and says not to re-paste the whole file');
ok(PASTE.indexOf('AWAITING_ACTIVATION') > 0, 'H3b and names the verification the operator runs afterwards');
// Every FIND anchor the document tells the operator to search for must still exist in the census, verbatim.
var ANCHORS = (function () {
  var out = [], re = /<!--\s*ANCHOR:\s*([\s\S]*?)\s*-->/g, m;
  while ((m = re.exec(PASTE)) !== null) out.push(m[1]);
  return out;
})();
ok(ANCHORS.length >= 3, 'H4  the document declares ' + ANCHORS.length + ' machine-checkable anchors');
eq(ANCHORS.filter(function (a) { return CENSUS.indexOf(a) === -1; }), [],
  'H4a and every one of them is present in the census verbatim — the instructions cannot go stale silently');

// The runbook says which flag each phase expects, executably.
ok(RUNBOOK.indexOf('PRE_ACTIVATION') > 0 && RUNBOOK.indexOf('POST_ACTIVATION') > 0,
  'H5  the runbook names both phases');
ok(RUNBOOK.indexOf('R6R7_PREFLIGHT_PHASE_MINIMAL_PASTE') > 0,
  'H5a and points at the minimal-paste document');

// ================================================================================================================
section('N — mutants');
// ================================================================================================================

mut('N1 the hard-coded flag=false precondition restored', function () {
  // The exact regression. Reinstating it makes the preflight refuse the run step 8 requires.
  var m = swap(CENSUS, "  if (fp.phase === 'PRE_ACTIVATION') {" + NLF
    + "    P('pre_activation_flag_effective_is_false', false, flagVal, flagVal === false);",
    '  if (true) {' + NLF
    + "    P('flag_is_still_false_this_round', false, flagVal, flagVal === false);");
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(), { flagTrue: true });
  return POST.res.verdict === 'READY_NO_ACTION'
    && bad.res.verdict === 'STOP'
    && failed(bad.res).indexOf('flag_is_still_false_this_round') >= 0;
});

mut('N2 a LENIENT flag read, so a truthy non-boolean becomes POST_ACTIVATION', function () {
  var m = swap(CENSUS, '  if (v === true || v === false) {', '  if (true) { v = !!v;');
  var body = { after: reader('function () { return "false"; }') };
  var clean = pf(live(), body);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(), body);
  // The string 'false' is truthy. A lenient read calls it POST_ACTIVATION and walks into the open-window
  // branch on a flag it could not actually read.
  return clean.res.flag_phase.phase === 'UNOBSERVABLE' && clean.res.verdict === 'STOP'
    && bad.res.flag_phase.phase === 'POST_ACTIVATION';
});

mut('N3 UNOBSERVABLE accepted as a legal phase', function () {
  var m = swap(CENSUS, "var R6R7_FLAG_PHASES_ = ['PRE_ACTIVATION', 'POST_ACTIVATION'];",
    "var R6R7_FLAG_PHASES_ = ['PRE_ACTIVATION', 'POST_ACTIVATION', 'UNOBSERVABLE'];");
  m = swap(m, "    fp.observable === true);", '    true);');
  var body = { after: 'inventoryAiPlanDbGenerationEnabled_ = undefined;' };
  var clean = pf(live(), body);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(), body);
  return clean.res.verdict === 'STOP' && bad.res.verdict === 'READY_NO_ACTION';
});

mut('N4 the census appointing itself the authorization source', function () {
  var m = swap(CENSUS, "    phase: 'UNOBSERVABLE', authorization_is_external: true, authorized_by: null,",
    "    phase: 'UNOBSERVABLE', authorization_is_external: false, authorized_by: 'this preflight',");
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT');
  return failed(bad.res).indexOf('this_preflight_is_not_an_authorization_source') >= 0
    && bad.res.verdict === 'STOP'
    && failed(PRE.res).indexOf('this_preflight_is_not_an_authorization_source') < 0;
});

mut('N5 the POST_ACTIVATION production block skipped, so a residual walks through the open window', function () {
  var m = swap(CENSUS, "  if ((out.flag_phase || {}).phase === 'POST_ACTIVATION') {" + NLF
    + "    P('post_activation_production_outcome_is_no_action', 'AI_PLAN_NO_ACTION', pp.outcome,",
    "  if (false) {" + NLF
    + "    P('post_activation_production_outcome_is_no_action', 'AI_PLAN_NO_ACTION', pp.outcome,");
  // TWO LOCKS hold this, so the mutant removes both: the phase's own predicate, and the proof guard's
  // older rule that a READY_NO_ACTION may not sit beside production_would_write true. Either alone
  // still STOPs, which is the point of having two.
  m = swap(m, "  if (out.verdict === 'READY_NO_ACTION' && pa.production_would_write === true) {",
    '  if (false) {');
  var clean = pf(live(), { flagTrue: true, after: WOULD_WRITE });
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(),
    { flagTrue: true, after: WOULD_WRITE });
  return clean.res.verdict === 'STOP'
    && failed(clean.res).indexOf('post_activation_production_would_not_write') >= 0
    && bad.res.verdict === 'READY_NO_ACTION';
});

mut('N6 POST_ACTIVATION allowlist exactness dropped, so a widened list passes after the flip', function () {
  var m = swap(CENSUS,
    "    P('post_activation_allowlist_is_exactly_the_frozen_scope', true, out.allowlist.is_exactly_the_frozen_scope,"
      + NLF + '      out.allowlist.is_exactly_the_frozen_scope === true);',
    "    P('post_activation_allowlist_is_exactly_the_frozen_scope', true, out.allowlist.is_exactly_the_frozen_scope, true);");
  var list = { flagTrue: true, allowlist: [{ company: 'ResUS', country: 'US', marketplace: 'ALL_SITES', sku: 'CO1100-R' }] };
  var clean = pf(live(), list);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(), list);
  return failed(clean.res).indexOf('post_activation_allowlist_is_exactly_the_frozen_scope') >= 0
    && failed(bad.res).indexOf('post_activation_allowlist_is_exactly_the_frozen_scope') < 0;
});

mut('N7 the phase dropped from the bounded proof', function () {
  // Two locks: the proof carries the phase, and the proof GUARD refuses a preflight proof without one.
  var m = swap(CENSUS, "    flag_phase: (out.flag_phase || {}).phase || null,", '    flag_phase: null,');
  m = swap(m, "  if (!out.flag_phase || R6R7_FLAG_PHASES_.indexOf(fph.phase) === -1) missing.push('flag_phase');",
    "  if (false) { missing.push('flag_phase'); }");
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT');
  return JSON.parse(lineOf(PRE.world, 'r6r7_proof')).flag_phase === 'PRE_ACTIVATION'
    && JSON.parse(lineOf(bad.world, 'r6r7_proof')).flag_phase === null
    && bad.res.verdict === 'READY_NO_ACTION';
});

mut('N8 the phase claim printed but never checked', function () {
  // A phase label nothing asserts is a label. The mutant keeps the reporting and removes both directions.
  var m = swap(CENSUS, "    P('pre_activation_flag_effective_is_false', false, flagVal, flagVal === false);",
    "    P('pre_activation_flag_effective_is_false', false, flagVal, true);");
  m = swap(m, "    P('post_activation_flag_effective_is_true', true, flagVal, flagVal === true);",
    "    P('post_activation_flag_effective_is_true', true, flagVal, true);");
  // Force the phase and the reading apart: the label says PRE_ACTIVATION while the flag reads true.
  var lie = swap(m, "    o.phase = v === true ? 'POST_ACTIVATION' : 'PRE_ACTIVATION';",
    "    o.phase = 'PRE_ACTIVATION';");
  var honest = swap(CENSUS, "    o.phase = v === true ? 'POST_ACTIVATION' : 'PRE_ACTIVATION';",
    "    o.phase = 'PRE_ACTIVATION';");
  var clean = withCensus(honest, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(), { flagTrue: true });
  var bad = withCensus(lie, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(), { flagTrue: true });
  return failed(clean.res).indexOf('pre_activation_flag_effective_is_false') >= 0
    && failed(bad.res).indexOf('pre_activation_flag_effective_is_false') < 0;
});

mut('N9 the wildcard allowlist check removed from the preflight', function () {
  var m = swap(CENSUS, "  P('no_wildcard_or_partial_allowlist_entry', [], wild, wild.length === 0);",
    "  P('no_wildcard_or_partial_allowlist_entry', [], wild, true);");
  var list = { allowlist: [{ company: 'ResUS', country: '', marketplace: 'Amazon', sku: 'CO1100-R' }] };
  var clean = pf(live(), list);
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(), list);
  return failed(clean.res).indexOf('no_wildcard_or_partial_allowlist_entry') >= 0
    && failed(bad.res).indexOf('no_wildcard_or_partial_allowlist_entry') < 0;
});

mut('N10 the activation manifest relaxed along with the preflight', function () {
  // The failure mode of a careless fix: reading 'the flag predicate was wrong' as 'every flag predicate was
  // wrong', and taking the authorization gate out with it.
  var m = swap(CENSUS, "  P('flag_is_still_false', false, flagVal, flagVal === false);",
    "  P('flag_is_still_false', false, flagVal, true);");
  var bad = withCensus(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST', live(), { flagTrue: true });
  return D1.res.verdict === 'STOP' && failed(D1.res).indexOf('flag_is_still_false') >= 0
    && failed(bad.res).indexOf('flag_is_still_false') < 0;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
process.exit(fail ? 1 : 0);
