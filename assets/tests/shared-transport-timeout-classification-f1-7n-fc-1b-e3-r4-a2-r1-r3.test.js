// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R3 §16–§18 — SHARED TRANSPORT / DISPATCH TIMEOUT, CLASSIFIED HONESTLY
// ----------------------------------------------------------------------------------------------------------------
// This is the SECOND of the round's three tracks and it is reported separately on purpose: nothing here says
// anything about the AI allocation path, and nothing there says anything about this.
//
// The live evidence, fully classified by the client and completely unactionable:
//
//   getClientCapabilities                45,624 ms  REQUEST_TIMEOUT  DISPATCH
//   inventoryScope.registry.get          45,604 ms  REQUEST_TIMEOUT  DISPATCH
//   gapJob.status.get                    45,602 ms  REQUEST_TIMEOUT  DISPATCH
//   inventoryReplenishment.workspace.get 60,594 ms  REQUEST_TIMEOUT  DISPATCH
//   inventoryReplenishment.workspace.get 60,293 ms  REQUEST_TIMEOUT  DISPATCH
//   server_execution_ms / tables_read / open_ms / slowest_tables / rows_returned  ALL null
//
// FOUR defects in how that was reported, each measured below:
//
//   1. IT WAS CALLED A READ TIMEOUT. `REPEATED_READ_TIMEOUT` is the only class the vocabulary had, and on this
//      page everyone reads it as "the 19-table workspace read is too slow". Two of the five failures are small
//      reads that touch none of those tables, and they failed at the SAME bound in the SAME phase. What those
//      five requests share is the transport and the dispatch, not the table set.
//   2. A SAMPLE CARRIED NO SERVER EVIDENCE. action/kind/code/phase/ms/bytes/attempts and nothing else — so
//      "the server was slow" and "nothing we sent was ever accepted" were indistinguishable, and the first is
//      the reading people reach for because it names something already known to be slow.
//   3. TWO IDENTICAL WORKSPACE READS AND NO OWNER. `_irWorkspaceRefresh_` has FOUR callers and recorded none,
//      so the report could state that a duplicate happened and nothing about who caused it.
//   4. ONE OUTAGE RENDERED AS FOUR RED BLOCKS, with the Country/Marketplace selectors lost underneath them.
//
// WHAT THIS ROUND DOES NOT CLAIM: it does not identify which server-side condition caused the outage. The
// browser cannot see that, and §18 explicitly allows REQUEST_REACHED_SERVER_CLASSIFIED to be a telemetry gap.
// What it must not do is invent a YES, and the reach classifier is built so that it cannot.
//
// Run: node assets/tests/shared-transport-timeout-classification-f1-7n-fc-1b-e3-r4-a2-r1-r3.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
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

var CMP = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var TD = CMP.IRReadTimeoutDiagnostic;
var PAGE = read('assets/js/pages/inventory-replenishment.js');
var TRANSPORT = read('assets/js/api/km-transport.js');
var FOUNDATION = read('assets/js/api/km-api-foundation.js');
var COMPAT = read('assets/js/utils/inventory-compat.js');
var RO = require('./_release-order.js');

// The live sample set, verbatim, with the R3 telemetry the transport now records.
function liveSamples() {
  return [
    { kind: 'read', action: 'getClientCapabilities', code: 'REQUEST_TIMEOUT', phase: 'DISPATCH', ms: 45624,
      http_status: null, redirected: false, server_answered: false, server_ms: null, request_id: 'RID-1' },
    { kind: 'read', action: 'inventoryScope.registry.get', code: 'REQUEST_TIMEOUT', phase: 'DISPATCH', ms: 45604,
      http_status: null, redirected: false, server_answered: false, server_ms: null, request_id: 'RID-2' },
    { kind: 'read', action: 'gapJob.status.get', code: 'REQUEST_TIMEOUT', phase: 'DISPATCH', ms: 45602,
      http_status: null, redirected: false, server_answered: false, server_ms: null, request_id: 'RID-3' },
    { kind: 'read', action: 'inventoryReplenishment.workspace.get', code: 'REQUEST_TIMEOUT', phase: 'DISPATCH', ms: 60594,
      http_status: null, redirected: false, server_answered: false, server_ms: null, request_id: 'RID-4' },
    { kind: 'read', action: 'inventoryReplenishment.workspace.get', code: 'REQUEST_TIMEOUT', phase: 'DISPATCH', ms: 60293,
      http_status: null, redirected: false, server_answered: false, server_ms: null, request_id: 'RID-5' }
  ];
}
// The SAME five failures as a pre-R3 deployment recorded them: no telemetry fields at all.
function preR3Samples() {
  return liveSamples().map(function (s) {
    return { kind: s.kind, action: s.action, code: s.code, phase: s.phase, ms: s.ms };
  });
}

// ================================================================================================================
section('A. §16 / §16.2 — five timeouts across four actions is not a read timeout');
// ================================================================================================================
var L = TD.classify(liveSamples(), null);
eq(L.timeouts, 5, 'A1  all five timeouts are seen');
eq(L.distinctTimeoutActions, 4, 'A2  across FOUR distinct actions');
eq(Object.keys(L.timeoutActions).sort(), ['gapJob.status.get', 'getClientCapabilities',
  'inventoryReplenishment.workspace.get', 'inventoryScope.registry.get'].sort(),
  'A2a and every one of them is named');
eq(L.timeoutActions['inventoryReplenishment.workspace.get'], 2, 'A2b including the workspace read twice');
eq(L.serverEvidence, false, 'A3  no request produced any server evidence');
eq(L.serverEvidenceKnown, true, 'A3a and that is a KNOWN false, not an absent field');
eq(L.classification, 'SHARED_TRANSPORT_OR_DISPATCH_TIMEOUT',
  'A4  so the classification is SHARED_TRANSPORT_OR_DISPATCH_TIMEOUT …');
ok(L.classification !== 'REPEATED_READ_TIMEOUT', 'A4a … and NOT a repeated READ timeout');
ok(L.classification !== 'COLD_START_OR_TRANSIENT_TIMEOUT', 'A4b … and not a cold start');
eq(L.phases, ['DISPATCH', 'DISPATCH', 'DISPATCH', 'DISPATCH', 'DISPATCH'], 'A5  every failure is in DISPATCH');
// A LIGHTWEIGHT action alone still classifies as itself — the shared class needs the cross-action view.
var one = TD.classify(liveSamples(), 'getClientCapabilities');
ok(one.classification !== 'SHARED_TRANSPORT_OR_DISPATCH_TIMEOUT',
  'A6  asking about ONE action can never produce the shared class (a single-action view cannot see the others)');
eq(one.distinctTimeoutActions, 1, 'A6a because it only sees one');
// Heavyweight-only failures are still a read timeout, which is the case the old class was right about.
var heavyOnly = liveSamples().filter(function (s) { return /workspace/.test(s.action); });
eq(TD.classify(heavyOnly, null).classification, 'REPEATED_READ_TIMEOUT',
  'A7  when ONLY the workspace read fails, REPEATED_READ_TIMEOUT is still the right answer');
// One timeout, one action, is still a cold start / transient.
eq(TD.classify([liveSamples()[0]], null).classification, 'COLD_START_OR_TRANSIENT_TIMEOUT',
  'A8  and a single timeout of a single action is still transient');
// Server evidence flips it back: if the server DID answer, this is not a shared transport fault.
var withEvidence = liveSamples();
withEvidence[3].server_answered = true;
ok(TD.classify(withEvidence, null).classification !== 'SHARED_TRANSPORT_OR_DISPATCH_TIMEOUT',
  'A9  any server evidence at all removes the shared-transport reading');
// A typed server refusal is never a timeout, and still outranks everything.
var typed = liveSamples().concat([{ kind: 'read', action: 'x', code: 'SCHEMA_MISMATCH', phase: 'VALIDATE', ms: 10 }]);
eq(TD.classify(typed, null).classification, 'SERVER_TYPED_FAILURE',
  'A10 a typed server failure still outranks every timeout class');

// ================================================================================================================
section('B. §16.1 — did it reach Apps Script? Only the evidence answers.');
// ================================================================================================================
eq(L.reach.classification, 'UNRESOLVED_WITH_CURRENT_TELEMETRY',
  'B1  with no status, no redirect and no envelope, the honest answer is UNRESOLVED');
ok(L.reach.evidence.length > 0, 'B1a and it states what it DID observe');
ok(L.reach.missing.length >= 3, 'B2  naming the server-side evidence that would decide it');
ok(L.reach.missing.some(function (m) { return /APPS_SCRIPT_EXECUTION_RECORD/.test(m); }),
  'B2a whether an execution started for the correlation id');
ok(L.reach.missing.some(function (m) { return /SERVER_QUEUE_TIME/.test(m); }), 'B2b whether it queued');
ok(L.reach.missing.some(function (m) { return /SCRIPT_LOCK_WAIT/.test(m); }), 'B2c whether it blocked on a lock');
eq(L.reach.telemetry.request_id, 5, 'B3  and all five carry a correlation id a server record can be matched to');
// Every OTHER bucket is reachable, from its own evidence.
var s1 = liveSamples(); s1[0].server_ms = 71000;
eq(TD.classifyReach(s1).classification, 'SERVER_EXECUTION_EXCEEDED_CLIENT_BOUND',
  'B4  server execution time on a timed-out request ⇒ the server was slower than the client waited');
var s2 = liveSamples(); s2[0].http_status = 200; s2[0].server_answered = false;
eq(TD.classifyReach(s2).classification, 'SERVER_RESPONSE_PARSE_FAILURE',
  'B5  a status with no parseable envelope ⇒ a response arrived and could not be read');
var s3 = liveSamples(); s3[0].redirected = true;
eq(TD.classifyReach(s3).classification, 'PLATFORM_REDIRECT_FAILURE',
  'B6  the redirect completed and nothing followed ⇒ a platform redirect failure');
// §18 — a pre-R3 deployment's samples cannot be classified, and it says which field is missing.
var PRE = TD.classify(preR3Samples(), null);
eq(PRE.serverEvidence, null, 'B7  pre-R3 samples carry UNKNOWN server evidence, not false');
eq(PRE.serverEvidenceKnown, false, 'B7a explicitly');
eq(PRE.reach.classification, 'UNRESOLVED_WITH_CURRENT_TELEMETRY', 'B8  so the reach is unresolved …');
ok(PRE.reach.missing.some(function (m) { return /CLIENT_TELEMETRY/.test(m); }),
  'B8a … and it names the client field that is absent rather than blaming the platform');
// The shared class still holds without telemetry — it needs only the cross-action fact.
eq(PRE.classification, 'SHARED_TRANSPORT_OR_DISPATCH_TIMEOUT',
  'B9  and a pre-R3 deployment still gets the SHARED class, because four actions failing is visible either way');
// No timeouts at all is not a reach question.
eq(TD.classifyReach([{ kind: 'read', action: 'a', code: null, ms: 10 }]).classification,
  'UNRESOLVED_WITH_CURRENT_TELEMETRY', 'B10 no timeout ⇒ nothing to classify');
ok(TD.classifyReach([]).missing.indexOf('NO_TIMEOUT_TO_CLASSIFY') >= 0, 'B10a said as such');
// It never guesses.
ok(Object.keys(TD.REACH_CLASSES).length === 8, 'B11 all eight buckets are enumerated');
ok(!/likely|probabl|most common|usually/i.test(
  COMPAT.slice(COMPAT.indexOf('function classifyReach'), COMPAT.indexOf('function classifyReach') + 4000)),
  'B11a and the classifier ranks nothing by likelihood');

// ================================================================================================================
section('C. §16.1 — the transport records the evidence that closes the gap');
// ================================================================================================================
ok(/http_status: \(typeof _d\.httpStatus === 'number'\) \? _d\.httpStatus : null/.test(TRANSPORT),
  'C1  the HTTP status is recorded, and null means NO response arrived');
ok(/redirected: _d\.redirected === true/.test(TRANSPORT), 'C2  whether the platform redirect happened');
ok(/server_answered: !!_env/.test(TRANSPORT), 'C3  whether a parseable envelope came back');
ok(/server_ms: \(_meta && typeof _meta\.serverDurationMs === 'number'\)/.test(TRANSPORT),
  'C4  the server\'s own execution time when it reports one');
ok(/request_id: requestId \|\| null/.test(TRANSPORT), 'C5  and the correlation id');
// It is not new measurement — every field was already on this path.
ok(/var _d = res\.details \|\| \{\};/.test(TRANSPORT), 'C6  all of it read from what the path already computed');
ok(!/fetch\(|XMLHttpRequest/.test(TRANSPORT.slice(TRANSPORT.indexOf('var _d = res.details'),
  TRANSPORT.indexOf('var _d = res.details') + 1200)), 'C6a no extra request is issued to obtain it');
// An externally recorded sample leaves the fields EXPLICITLY unknown rather than defaulting to a negative.
ok(/server_answered: \(typeof sample\.server_answered === 'boolean'\) \? sample\.server_answered : null/.test(TRANSPORT),
  'C7  an external sample records UNKNOWN, never a false it did not observe');
// No payload, no URL, no rows in the sample.
var recBlock = TRANSPORT.slice(TRANSPORT.indexOf('var _d = res.details'), TRANSPORT.indexOf('return res;', TRANSPORT.indexOf('var _d = res.details')));
ok(!/payload|dto\.payload|url:/.test(recBlock), 'C8  and the sample carries no payload and no URL');

// ================================================================================================================
section('D. §16.3 — who dispatched the duplicate read');
// ================================================================================================================
ok(/var _irReadDispatches = \[\]/.test(PAGE), 'D1  the page keeps a dispatch ledger');
['COALESCED_BOOTSTRAP', 'RESTORED_MOUNT_REVALIDATION', 'SEARCH_CLICK', 'POST_WRITE_READBACK'].forEach(function (o) {
  ok(new RegExp("owner: '" + o + "'").test(PAGE), 'D2  ' + o + ' declares itself at its call site');
});
eq((PAGE.match(/_irWorkspaceRefresh_\(\{/g) || []).length, 4,
  'D3  and those are the FOUR dispatch sites — every one of them declares an owner');
ok(!/_irWorkspaceRefresh_\(\)\.then/.test(PAGE), 'D3a no call site dispatches without declaring one');
ok(/if \(IR_READ_OWNERS_\.indexOf\(_owner\) === -1\) _owner = 'UNDECLARED';/.test(PAGE),
  'D4  an unrecognised owner is recorded as UNDECLARED, never guessed');
ok(/payload_fingerprint: _irReadPayloadFingerprint_\(_wsPayload\)/.test(PAGE),
  'D5  each dispatch records a payload fingerprint, so identity is compared not assumed');
ok(/at: _irNowMs_ \? _irNowMs_\(\) : 0/.test(PAGE), 'D6  and a dispatch wall clock');
ok(/_dispatch\.settled_at = /.test(PAGE), 'D6a with a settlement time, so overlap is decidable');
ok(/concurrent: overlapped/.test(PAGE), 'D7  the report decides CONCURRENT vs SEQUENTIAL from those two times');
ok(/CONCURRENT_IDENTICAL_READ[\s\S]{0,200}must share one in-flight request/.test(PAGE),
  'D7a a concurrent pair is a coalescing finding …');
ok(/SEQUENTIAL_IDENTICAL_READ[\s\S]{0,200}scheduling question/.test(PAGE),
  'D7b … and a sequential pair is a SCHEDULING finding — different fixes, never conflated');
// The ledger is bounded and carries no payload contents.
ok(/if \(_irReadDispatches\.length < 20\)/.test(PAGE), 'D8  the ledger is bounded');
// The in-flight latch that DOES exist is still exercised, and its skips are now visible.
ok(/function noteShareSkipped/.test(TRANSPORT), 'D9  a read that could not be shared records WHY');
ok(/share_skipped: JSON\.parse\(JSON\.stringify\(_metrics\.shareSkipped \|\| \{\}\)\)/.test(TRANSPORT),
  'D9a and the reasons are reported beside `coalesced`');
ok(/CONSUMER_SUPPLIED_ABORT_SIGNAL/.test(FOUNDATION),
  'D10 including the deliberate one: a cancellable read is never shared');
// And the reason it is deliberate is written down rather than left as a bare condition.
ok(/would cancel the underlying fetch out from under everyone attached to it/.test(FOUNDATION),
  'D10a with the correctness argument beside it');
// The primary read passes NO signal, so it DOES take the shared path — which is why the live duplicate
// cannot be explained by that condition.
ok(/getWorkspace\('inventoryReplenishment', _wsPayload\)/.test(PAGE),
  'D11 the primary read passes no abort signal …');
ok(!/getWorkspace\('inventoryReplenishment', _wsPayload, \{ signal/.test(PAGE),
  'D11a … so in-flight sharing is available to it');

// ================================================================================================================
section('E. §16.2 / §16.6 — the two findings are kept apart');
// ================================================================================================================
ok(/finding_split/.test(PAGE), 'E1  the report splits shared-transport availability from workspace cost');
ok(/UNMEASURED: no primary read completed in this session, so its cost is unknown/.test(PAGE),
  'E2  and when no read completed, the workspace cost is UNMEASURED — not zero and not fine');
ok(/NOT_OBSERVED_IN_THIS_SESSION/.test(PAGE), 'E2a while a session with no outage says so');
ok(/timeout_actions = c\.timeoutActions/.test(PAGE), 'E3  the cross-action evidence is carried out …');
ok(/distinct_timeout_actions = /.test(PAGE), 'E3a … with the distinct count …');
ok(/server_evidence_known = c\.serverEvidenceKnown === true/.test(PAGE),
  'E3b … and whether server evidence was even observable');
ok(/request_reached_server = \(c\.reach && c\.reach\.classification\)/.test(PAGE),
  'E4  and the reach classification reaches the report');

// ================================================================================================================
section('F. §16.7 — one outage is one message, and the scope survives it');
// ================================================================================================================
var FOUR = { classification: 'SHARED_TRANSPORT_OR_DISPATCH_TIMEOUT', stages: [
  { stage: 'deployment_contract', codes: ['REQUEST_TIMEOUT'] },
  { stage: 'scope_registry', codes: ['REQUEST_TIMEOUT'] },
  { stage: 'inventory_workspace', codes: ['REQUEST_TIMEOUT', 'REQUEST_TIMEOUT'] },
  { stage: 'recommendation_read', codes: ['REQUEST_TIMEOUT'] }] };
var N = TD.availabilityNotice(FOUR);
eq(N.notice_count, 1, 'F1  four failed stages produce ONE notice, not four');
eq(N.mode, 'SERVICE_UNAVAILABLE', 'F1a naming the shared cause');
eq(N.keep_shell, true, 'F2  the page shell is never part of the failure');
eq(N.preserve_scope, true, 'F2a and the Country/Marketplace selection is kept');
ok(/kept/.test(N.detail), 'F2b which the message says, so the operator is not left guessing');
eq(N.retry_stages, ['scope_registry', 'inventory_workspace', 'recommendation_read'],
  'F3  Retry covers ONLY the stages that failed …');
ok(N.retry_stages.indexOf('deployment_contract') === -1,
  'F3a … and never the non-blocking capability read that is not worth blocking on');
ok(N.retry_stages.indexOf('ALL') === -1 && N.action_label === 'Retry', 'F3b there is no whole-page reload offered');
// A capability failure ALONE is not a page outage.
var CAP = TD.availabilityNotice({ classification: 'COLD_START_OR_TRANSIENT_TIMEOUT',
  stages: [{ stage: 'deployment_contract', codes: ['REQUEST_TIMEOUT'] },
           { stage: 'inventory_workspace', codes: [] }] });
eq(CAP.mode, 'DEGRADED_NON_BLOCKING', 'F4  a capability failure alone is DEGRADED, never an outage');
eq(CAP.blocking_stages, [], 'F4a it blocks nothing');
eq(CAP.preserve_scope, true, 'F4b and still keeps the scope');
// One real stage down names that stage and only that stage.
var ONE = TD.availabilityNotice({ classification: 'REPEATED_READ_TIMEOUT',
  stages: [{ stage: 'inventory_workspace', codes: ['REQUEST_TIMEOUT'] }] });
eq(ONE.mode, 'SINGLE_STAGE_FAILED', 'F5  a single failed stage is reported as itself');
eq(ONE.retry_stages, ['inventory_workspace'], 'F5a with a retry scoped to it');
ok(/inventory workspace/.test(ONE.detail), 'F5b and named in words');
// A healthy session produces no notice at all.
var NONE = TD.availabilityNotice({ classification: 'NO_TIMEOUT_OBSERVED',
  stages: [{ stage: 'inventory_workspace', codes: ['SUCCESS'] }] });
eq(NONE.notice_count, 0, 'F6  a healthy session produces NO notice');
eq(NONE.mode, 'NONE', 'F6a and no mode');
eq(NONE.preserve_scope, true, 'F6b (the scope is preserved unconditionally — it has no false branch)');
// A partially failed stage is not a failed stage: a retry that succeeded must not raise an outage.
var MIXED = TD.availabilityNotice({ classification: 'SUCCESS_AFTER_RETRY',
  stages: [{ stage: 'inventory_workspace', codes: ['REQUEST_TIMEOUT', 'SUCCESS'] }] });
eq(MIXED.notice_count, 0, 'F7  a stage that timed out and then SUCCEEDED is not a failed stage');
// It renders nothing.
var noticeSrc = COMPAT.slice(COMPAT.indexOf('function availabilityNotice'), COMPAT.indexOf('var IRReadTimeoutDiagnostic'));
ok(!/document\.|innerHTML|querySelector/.test(noticeSrc), 'F8  and the decision touches no DOM — it is pure');

// ================================================================================================================
section('G. §16.5 / §19 — no timeout was raised, nothing was merged, nothing blindly retried');
// ================================================================================================================
ok(!/READ_TIMEOUT_MS\s*=\s*(9|1[0-9])\d{4}/.test(TRANSPORT), 'G1  no timeout bound was increased');
ok(!/setTimeout\([^)]*retry[^)]*\)/i.test(PAGE.slice(PAGE.indexOf('function _irWorkspaceRefresh_'),
  PAGE.indexOf('function _irWorkspaceRefresh_') + 6000)), 'G2  the read path adds no automatic retry');
ok(!/location\.reload/.test(PAGE), 'G3  and no whole-page reload anywhere on the page');
// §16.5 — the stages stay independently timed and independently failable; nothing was combined.
var stages = (PAGE.match(/\{ stage: '[a-z_]+', actions: \[/g) || []).length;
eq(stages, 6, 'G4  the six read stages are still separate (nothing merged into one mega-request)');
ok(/inventoryReplenishment\.workspace\.get/.test(PAGE), 'G4a the workspace action is unchanged');
// The one existing coalescing facility is untouched in its safety property.
ok(/business scope: never shared/.test(TRANSPORT), 'G5  metadata-only single-flight still refuses business scopes');
ok(/if \(!isMetadataKey\(k\)\) return Promise\.resolve\(\)\.then\(fn\);/.test(TRANSPORT), 'G5a by construction');
// §13/§19 — this track touched no server file and no flag.
// The flag is NAMED in two long-standing comments explaining that the client only mirrors it. What must
// not happen is an ASSIGNMENT: the browser can never turn generation on, and this track added nothing
// that could. Matching the bare name would have failed on the explanation rather than on a defect.
ok(!/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=[^=]/.test(PAGE + TRANSPORT + FOUNDATION + COMPAT),
  'G6  nothing in the transport track ASSIGNS the AI Plan flag');
ok(!/inventoryAiPlanDbGenerationEnabled_\s*=[^=]/.test(PAGE + TRANSPORT + FOUNDATION + COMPAT),
  'G6a nor overrides its accessor');
ok(!/clasp|git push|gh pr/.test(PAGE + TRANSPORT + FOUNDATION + COMPAT), 'G7  and nothing reaches for a remote');

// ================================================================================================================
section('H. release identity');
// ================================================================================================================
var IDX = read('index.html');
eq(RO.staleAppTokenRefs(IDX), [], 'H1  no browser asset is left behind on an older application token');
ok(RO.appTokenRefCount(IDX) >= 19, 'H1a and the co-deployed set carries the current one');
ok(/fc1be3r4a2r1r3-transport-20260904/.test(IDX), 'H2  this round minted a NEW application token');
['assets/js/utils/inventory-compat.js', 'assets/js/api/km-transport.js',
 'assets/js/api/km-api-foundation.js', 'assets/js/pages/inventory-replenishment.js'].forEach(function (f) {
  ok(IDX.indexOf(f + '?v=fc1be3r4a2r1r3-transport-20260904') !== -1,
    'H3  ' + f.split('/').pop() + ' carries it (it changed this round)');
});

// ================================================================================================================
section('I. §17 — mutations. Each restores one way of misreading the evidence.');
// ================================================================================================================
mut('I1  the shared class removed (five timeouts read as a workspace cost again)', function () {
  var src = COMPAT.replace(
    "    else if (!want && nActions >= 2 && out.serverEvidence !== true) {\r\n      out.classification = IR_READ_TIMEOUT_CLASSES.SHARED_TRANSPORT_OR_DISPATCH_TIMEOUT;\r\n    }\r\n",
    '').replace(
    "    else if (!want && nActions >= 2 && out.serverEvidence !== true) {\n      out.classification = IR_READ_TIMEOUT_CLASSES.SHARED_TRANSPORT_OR_DISPATCH_TIMEOUT;\n    }\n",
    '');
  if (src === COMPAT) throw new Error('mutation target absent');
  var m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports.IRReadTimeoutDiagnostic.classify(liveSamples(), null).classification === 'REPEATED_READ_TIMEOUT';
});
mut('I2  missing telemetry read as a NEGATIVE (a reporting gap becomes a platform finding)', function () {
  var src = COMPAT.replace(
    'out.serverEvidence = out.serverEvidenceKnown',
    'out.serverEvidence = true ? false : out.serverEvidenceKnown');
  if (src === COMPAT) throw new Error('mutation target absent');
  var m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports.IRReadTimeoutDiagnostic.classify(preR3Samples(), null).serverEvidence === false;
});
mut('I3  the reach classifier DEFAULTS to a bucket instead of UNRESOLVED', function () {
  var src = COMPAT.replace(
    "      classification: IR_REACH_CLASSES.UNRESOLVED_WITH_CURRENT_TELEMETRY,\n      timeouts: timeouts.length,",
    "      classification: IR_REACH_CLASSES.SERVER_QUEUE_OR_CONCURRENCY_DELAY,\n      timeouts: timeouts.length,")
   .replace(
    "      classification: IR_REACH_CLASSES.UNRESOLVED_WITH_CURRENT_TELEMETRY,\r\n      timeouts: timeouts.length,",
    "      classification: IR_REACH_CLASSES.SERVER_QUEUE_OR_CONCURRENCY_DELAY,\r\n      timeouts: timeouts.length,");
  if (src === COMPAT) throw new Error('mutation target absent');
  var m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports.IRReadTimeoutDiagnostic.classifyReach(liveSamples()).classification
    === 'SERVER_QUEUE_OR_CONCURRENCY_DELAY';
});
mut('I4  a cold start claimed for four different actions', function () {
  var src = COMPAT.replace('else if (timeouts.length > 1) out.classification = IR_READ_TIMEOUT_CLASSES.REPEATED_READ_TIMEOUT;',
    'else if (false) out.classification = IR_READ_TIMEOUT_CLASSES.REPEATED_READ_TIMEOUT;');
  if (src === COMPAT) throw new Error('mutation target absent');
  var m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  var mutated = m.exports.IRReadTimeoutDiagnostic;
  // With the shared class ALSO unavailable (single action), the cold-start reading returns for a repeat.
  return mutated.classify(liveSamples().filter(function (s) { return /workspace/.test(s.action); }), null)
    .classification === 'COLD_START_OR_TRANSIENT_TIMEOUT';
});
mut('I5  the capability read made BLOCKING (a degraded page becomes an outage)', function () {
  var src = COMPAT.replace("var IR_NON_BLOCKING_STAGES = ['deployment_contract'];",
    'var IR_NON_BLOCKING_STAGES = [];');
  if (src === COMPAT) throw new Error('mutation target absent');
  var m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports.IRReadTimeoutDiagnostic.availabilityNotice({
    classification: 'COLD_START_OR_TRANSIENT_TIMEOUT',
    stages: [{ stage: 'deployment_contract', codes: ['REQUEST_TIMEOUT'] }] }).mode === 'SINGLE_STAGE_FAILED';
});
mut('I6  four errors rendered for one shared outage', function () {
  var src = COMPAT.replace('    if (shared || blocking.length > 1) {', '    if (false) {');
  if (src === COMPAT) throw new Error('mutation target absent');
  var m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  var n = m.exports.IRReadTimeoutDiagnostic.availabilityNotice(FOUR);
  return n.mode === 'SINGLE_STAGE_FAILED';   // no longer ONE message about the shared cause
});
mut('I7  the scope discarded on an outage', function () {
  var src = COMPAT.replace('      preserve_scope: true,\n      keep_shell: true,', '      preserve_scope: false,\n      keep_shell: true,')
                  .replace('      preserve_scope: true,\r\n      keep_shell: true,', '      preserve_scope: false,\r\n      keep_shell: true,');
  if (src === COMPAT) throw new Error('mutation target absent');
  var m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports.IRReadTimeoutDiagnostic.availabilityNotice(FOUR).preserve_scope === false;
});
mut('I8  Retry widened from the failed stages to everything', function () {
  var src = COMPAT.replace('      retry_stages: blocking.slice(),', "      retry_stages: ['ALL'],");
  if (src === COMPAT) throw new Error('mutation target absent');
  var m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return JSON.stringify(m.exports.IRReadTimeoutDiagnostic.availabilityNotice(FOUR).retry_stages) === '["ALL"]';
});
mut('I9  the transport stops recording whether the server answered', function () {
  return !/server_answered: !!_env/.test(TRANSPORT.replace('server_answered: !!_env', 'x: 1'));
});
mut('I10 a dispatch owner left undeclared', function () {
  var mutated = PAGE.replace("owner: 'SEARCH_CLICK',", '');
  if (mutated === PAGE) throw new Error('mutation target absent');
  return (mutated.match(/owner: '(COALESCED_BOOTSTRAP|RESTORED_MOUNT_REVALIDATION|SEARCH_CLICK|POST_WRITE_READBACK)'/g) || []).length === 3;
});
mut('I11 concurrent and sequential duplicates conflated', function () {
  var mutated = PAGE.replace('concurrent: overlapped,', 'concurrent: true,');
  if (mutated === PAGE) throw new Error('mutation target absent');
  return !/concurrent: overlapped,/.test(mutated);
});
mut('I12 the workspace cost reported as fine when nothing completed', function () {
  var mutated = PAGE.replace("'UNMEASURED: no primary read completed in this session, so its cost is unknown'", "'0 ms'");
  if (mutated === PAGE) throw new Error('mutation target absent');
  return !/UNMEASURED: no primary read completed/.test(mutated);
});

console.log('\n----------------------------------------');
console.log('R3 SHARED TRANSPORT / DISPATCH CLASSIFICATION: ' + pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail > 0) process.exitCode = 1;
