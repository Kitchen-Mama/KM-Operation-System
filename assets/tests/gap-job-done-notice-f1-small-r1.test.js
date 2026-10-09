// Kitchen Mama Operation System — F1-SMALL-GAP-JOB-DONE-NOTICE-R1 manual recalc completion-notice guard.
// Run: node assets/tests/gap-job-done-notice-f1-small-r1.test.js
// -----------------------------------------------------------------------------
// Proves the shared transport helper announces a MANUAL gap-recalc completion EXACTLY ONCE per runId, only via the
// manual runJob done() (which the transport calls only on terminal DONE, AFTER refresh), and that the resume/mount
// path stays silent (scheduled/resumed jobs never pop success). Pure dedupe + message formatting are unit-tested;
// the wiring (manual-only, once-per-run, FAILED/STALLED/CANCELLED/POLL_TIMEOUT never announce) is asserted structurally.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');   // = assets/
var GR = require('../js/utils/gap-recalc-transport.js');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (a !== e) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }

var INV = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');
var TRANSPORT = read('js/utils/gap-recalc-transport.js');

// =============================================================================
section('API present');
ok(typeof GR.announceManualDone === 'function', 'announceManualDone exported');
ok(typeof GR.formatDoneMessage === 'function', 'formatDoneMessage exported');

section('§7 exactly one notice per manual runId (dedupe); different runId notifies; injectable notify');
var calls = []; var notify = function (m) { calls.push(m); };
ok(GR.announceManualDone('RUN-DN-1', 'msg-a', notify) === true, 'first announce for RUN-DN-1 → true (notifies)');
ok(GR.announceManualDone('RUN-DN-1', 'msg-a-again', notify) === false, 'repeated DONE for the SAME runId → false (no second notice)');
ok(GR.announceManualDone('RUN-DN-2', 'msg-b', notify) === true, 'a different runId → true (notifies)');
eq(calls.length, 2, 'exactly TWO notifications for two distinct runIds (the duplicate was suppressed)');
eq(calls[0], 'msg-a', 'message passed through verbatim (1)');
eq(calls[1], 'msg-b', 'message passed through verbatim (2)');
// a missing runId cannot be de-duped but must still deliver the single manual notice the caller intends
var c2 = []; ok(GR.announceManualDone('', 'no-run', function (m) { c2.push(m); }) === true && c2.length === 1, 'missing runId still delivers one notice');

section('formatDoneMessage — page supplies label; scope counts only when present on the DONE payload');
eq(GR.formatDoneMessage('Inventory', { mode: 'ALL_SITES' }, { scopesProcessed: 10, scopesTotal: 10 }),
  'Inventory recalculation completed successfully.\n10 / 10 scopes processed.', 'Inventory ALL_SITES → N / N scopes processed');
eq(GR.formatDoneMessage('Order Planning', { mode: 'ALL_SITES' }, { scopesProcessed: 34, scopesTotal: 34 }),
  'Order Planning recalculation completed successfully.\n34 / 34 scopes processed.', 'Order Planning ALL_SITES → 34 / 34');
eq(GR.formatDoneMessage('Inventory', { mode: 'CURRENT_SCOPE', country: 'US', marketplace: 'AMAZON_US' }, {}),
  'Inventory recalculation completed — US / AMAZON_US.', 'CURRENT_SCOPE with a locally-resolved label');
eq(GR.formatDoneMessage('Inventory', { mode: 'CURRENT_SCOPE' }, { scopesProcessed: 1, scopesTotal: 1 }),
  'Inventory recalculation completed successfully.\n1 / 1 scope processed.', 'CURRENT_SCOPE no label → singular scope count');
eq(GR.formatDoneMessage('Inventory', null, null), 'Inventory recalculation completed successfully.', 'no scope/state → base success line only');
ok(GR.formatDoneMessage('Order Planning', { mode: 'ALL_SITES' }, {}).indexOf('debug') === -1, 'no debug payload in message');

section('§4/§5 transport calls done() only on terminal DONE, AFTER refresh (refresh-before-notify); non-DONE → failed/cancelled');
ok(/status === JOB_STATUS\.DONE \|\| status === JOB_STATUS\.CANCELLED[\s\S]{0,200}opts\.refresh[\s\S]{0,400}ui\.done\(finalState\)/.test(TRANSPORT), 'runJob: refresh() runs before ui.done(finalState)');
ok(/if \(typeof ui\.failed === 'function'\) ui\.failed\(finalState/.test(TRANSPORT), 'non-DONE terminal routes to ui.failed (never ui.done)');
ok(!/announceManualDone/.test(TRANSPORT.replace(/announceManualDone: announceManualDone|function announceManualDone|var _announcedRuns[\s\S]*?return true;\n  \}/g, '')), 'transport never self-invokes announceManualDone (page-invoked only)');

// --- structural, fail-closed extraction (shared by both pages) ---------------------------------
// S8-R48-K — the Inventory side used the same fixed-length windows the Order Planning side did:
// {0,240} from `done: function (finalState) {` and {0,2500} from `product: 'INVENTORY'`. They had
// not fired yet only because this handler is shorter — measured 112 of 240 and 1277 of 2500 — so
// they were the identical tripwire, waiting for one more line in the handler. Both are gone.
function balancedFrom(src, at, open, close, what) {
    var depth = 0, started = false;
    for (var i = at; i < src.length; i++) {
        var ch = src[i];
        if (ch === open) { depth++; started = true; }
        else if (ch === close) { depth--; if (started && depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error('FAIL-CLOSED: unbalanced ' + what);
}
/** The full argument list of a call, however long it grows. Ambiguity is refused, not resolved. */
function callArgs(src, needle) {
    var at = src.indexOf(needle);
    if (at === -1) throw new Error('FAIL-CLOSED: call site not found: ' + needle);
    if (src.indexOf(needle, at + 1) !== -1) throw new Error('FAIL-CLOSED: ambiguous call site, found more than one: ' + needle);
    return balancedFrom(src, at + needle.length - 1, '(', ')', needle);
}
/** One handler body out of an options object, by property name. */
function handlerBody(objSrc, prop) {
    var re = new RegExp(prop + '\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{', 'g');
    var m = re.exec(objSrc);
    if (!m) throw new Error('FAIL-CLOSED: handler not found: ' + prop);
    if (re.exec(objSrc)) throw new Error('FAIL-CLOSED: ambiguous handler, found more than one: ' + prop);
    return balancedFrom(objSrc, m.index + m[0].length - 1, '{', '}', prop);
}
function extractFn(src, name) {
    var at = src.indexOf('function ' + name);
    if (at === -1) throw new Error('FAIL-CLOSED: fn not found: ' + name);
    return balancedFrom(src, src.indexOf('{', at), '{', '}', name);
}
function announces(s) { return count(s, 'announceManualDone('); }

section('Inventory wiring — MANUAL done announces once; resume/cancelled/failed stay silent');
var INV_RUNJOB = callArgs(INV, 'gr.runJob(');
var INV_DONE = handlerBody(INV_RUNJOB, 'done');
var INV_RESUME = callArgs(INV, 'gr.resumeIfRunning(');

eq(announces(INV_DONE), 1, 'Inventory: the manual completion path announces EXACTLY once');
ok(/gr\.announceManualDone\(_irActiveRunId,\s*gr\.formatDoneMessage\('Inventory', scopeSpec, finalState\)\)/.test(INV_DONE),
  'Inventory manual done → announceManualDone(runId, formatDoneMessage(Inventory, …))');
ok(/product: 'INVENTORY'/.test(INV_RUNJOB), 'Inventory: that done handler belongs to the INVENTORY runJob');
// The partition: every announce on the page is the one in the completion path. Inventory has no
// toast-owner reuse, so the completion path must account for ALL of them — a second call site
// anywhere, of any kind, breaks this.
eq(announces(INV), announces(INV_DONE), 'Inventory: every announceManualDone on the page is the completion one — nothing else announces');
eq(announces(INV_RESUME), 0, 'Inventory resume-on-mount announces nothing (scheduled/resumed stay silent)');
eq(announces(handlerBody(INV_RUNJOB, 'cancelled')), 0, 'Inventory cancelled() does NOT announce success');
// Recovery delegates a done that only restores the button — it must not announce either.
var INV_RECOVERY = extractFn(INV, '_irRecalcTransportRecovery_');
eq(announces(INV_RECOVERY), 0, 'Inventory transport recovery announces nothing');

// =============================================================================
// S8-R48-J — ORDER PLANNING: THE COMPLETION-NOTIFICATION INVARIANT.
//
// What this section used to assert was `count(RO, 'gr.announceManualDone(') === 1` — call sites as a
// PROXY for notification uniqueness. The proxy broke when an unrelated feature reused the function:
// `_roNotify_` is the AI Plan toast owner ("reuse the gap-recalc toast owner; alert fallback"), and
// it announces with a NULL runId, which deliberately bypasses dedupe. Two call sites, two features,
// never two notices for one completion — but the count said otherwise, and a count cannot tell those
// apart. Call sites, invocations and user-visible notifications are three different things.
//
// Its two companion assertions were fixed-length windows, {0,240} and {0,1200}. Both re-armed when
// the done handler grew by one `_roAiSupportNotice_` line: measured 266 against 240, and 1320
// against 1200. A window is a tripwire that fires on unrelated growth, so both are gone.
//
// The invariant asserted instead: the gap-recalc completion path contains EXACTLY ONE announce, and
// every other announce in the page is accounted for as the toast owner. That is a partition of all
// call sites, which is strictly stronger than counting them.
// =============================================================================
section('Order Planning wiring — the completion-notification invariant');

var RO_RUNJOB = callArgs(RO, 'gr.runJob(');
var RO_DONE = handlerBody(RO_RUNJOB, 'done');
var RO_NOTIFY = extractFn(RO, '_roNotify_');
var RO_RESUME = callArgs(RO, 'gr.resumeIfRunning(');

// (1) exactly one reachable announcement per completion — and it is the right one.
eq(announces(RO_DONE), 1, 'OP: the manual completion path announces EXACTLY once');
ok(/gr\.announceManualDone\(_roActiveRunId,\s*gr\.formatDoneMessage\('Order Planning', scopeSpec, finalState\)\)/.test(RO_DONE),
  'OP: manual done → announceManualDone(runId, formatDoneMessage(Order Planning, …))');
ok(/product: 'ORDER_PLANNING'/.test(RO_RUNJOB), 'OP: that done handler belongs to the ORDER_PLANNING runJob');

// (2) every OTHER announce in the page is the AI Plan toast owner — a complete partition, so no
//     third call site can appear unnoticed.
eq(announces(RO_NOTIFY), 1, 'OP: _roNotify_ (the AI Plan toast owner) announces once');
eq(announces(RO), announces(RO_DONE) + announces(RO_NOTIFY),
  'OP: every announceManualDone in the page is accounted for — one completion + one toast owner, nothing else');
ok(/announceManualDone\(null,/.test(RO_NOTIFY),
  'OP: the toast owner passes a NULL runId — it is a toast, not a completion announcement');
ok(!/_roNotify_\(/.test(RO_DONE), 'OP: the completion path does not also raise a toast (no double notice)');

// (5) resume/recovery stays silent.
eq(announces(RO_RESUME), 0, 'OP: resume-on-mount announces nothing (scheduled/resumed jobs stay silent)');

// (3)+(4) the two runId semantics, proven behaviourally against the shipped module.
var d1 = []; var dn = function (m) { d1.push(m); };
GR.announceManualDone('RUN-J3', 'a', dn); GR.announceManualDone('RUN-J3', 'a', dn);
eq(d1.length, 1, 'OP: a non-null runId still de-duplicates — one completion, one notice');
var d2 = []; var tn = function (m) { d2.push(m); };
GR.announceManualDone(null, 't', tn); GR.announceManualDone(null, 't', tn);
eq(d2.length, 2, 'OP: a null runId still does NOT de-duplicate — toast semantics preserved');

section('cache-version bump — changed assets refetch');
var INDEX = read(path.join('..', 'index.html'));
// S4-R3 - DERIVED, NOT PINNED. A literal token is correct until the first round that legitimately
// rotates the file, and then it fails while describing a correct tree. S4-R3 gated the mount-time
// job-status read inside this file and rotated it with the application family. The claim is unchanged
// - a CHANGED asset must be cache-versioned so browsers refetch it - and asking the series makes it
// survive every future rotation rather than needing an edit per round.
var REL_ = require('./_release-order.js');
ok(INDEX.indexOf('gap-recalc-transport.js?v=' + REL_.currentAppToken()) > -1,
  'index.html loads gap-recalc-transport.js with the bumped token');
ok(!/\?v=aiscope-20260811/.test(INDEX), 'no stale ?v=aiscope-20260811 remains');

// =============================================================================
section('§X negative mutants — every claim above must be able to fail');
// =============================================================================
// Mutants edit an in-memory copy of the page source and re-run the ONE check they should break.
// A throw counts as a kill only where fail-closed extraction IS the contract; otherwise a crash is
// reported as a crash, because a check that explodes has proven nothing about the code.
var mutants = 0, survived = 0;
function mutant(label, probe) {
    mutants++;
    var detected = false, crashed = null;
    try { detected = probe(); } catch (e) { crashed = e; }
    if (crashed) {
        detected = /FAIL-CLOSED/.test(String(crashed.message));
        if (!detected) { survived++; fail++; console.error('FAIL X' + mutants + ' CRASHED (not a kill) — ' + label + ' — ' + crashed.message); return; }
    }
    if (!detected) { survived++; fail++; console.error('FAIL X' + mutants + ' SURVIVED — ' + label); }
    else console.log('ok   X' + mutants + ' killed — ' + label);
}

// X1 — a second announce inside the SAME completion path: one completion, two notices.
mutant('a duplicate announcement is added to the completion path', function () {
    var m = RO.replace("gr.announceManualDone(_roActiveRunId, gr.formatDoneMessage('Order Planning', scopeSpec, finalState))",
        "gr.announceManualDone(_roActiveRunId, gr.formatDoneMessage('Order Planning', scopeSpec, finalState)); gr.announceManualDone(_roActiveRunId, 'again')");
    if (m === RO) throw new Error('FAIL-CLOSED: announce anchor absent');
    return announces(handlerBody(callArgs(m, 'gr.runJob('), 'done')) !== 1;
});
// X2 — the completion announcement is removed entirely: a finished job tells the user nothing.
mutant('the completion announcement is removed', function () {
    var m = RO.replace(/gr\.announceManualDone\(_roActiveRunId,[\s\S]*?finalState\)\)/, '0');
    if (m === RO) throw new Error('FAIL-CLOSED: announce anchor absent');
    return announces(handlerBody(callArgs(m, 'gr.runJob('), 'done')) !== 1;
});
// X3 — resume/recovery starts announcing, so a page remount pops a success it did not cause.
mutant('resume-on-mount announces a completion', function () {
    var args = callArgs(RO, 'gr.resumeIfRunning(');
    var mutatedArgs = args.replace(/done: function \(\) \{/, "done: function () { gr.announceManualDone(_roActiveRunId, 'resumed');");
    if (mutatedArgs === args) throw new Error('FAIL-CLOSED: resume done handler absent');
    return announces(mutatedArgs) !== 0;
});
// X4 — dedupe removed in the transport: the same runId notifies twice.
mutant('non-null runId de-duplication is broken', function () {
    var src = TRANSPORT.replace('if (_announcedRuns[key]) return false;', 'if (false) return false;');
    if (src === TRANSPORT) throw new Error('FAIL-CLOSED: dedupe anchor absent');
    var mod = { exports: {} };
    new Function('module', 'exports', 'require', src)(mod, mod.exports, require);
    var seen = [], n = function (m) { seen.push(m); };
    mod.exports.announceManualDone('X4', 'a', n); mod.exports.announceManualDone('X4', 'a', n);
    return seen.length !== 1;
});
// X5 — the toast owner stops being a toast: a non-null runId there would make it a second
//      completion announcement, and the partition above must notice.
mutant('the AI Plan toast owner starts announcing with a real runId', function () {
    var m = RO.replace('gr.announceManualDone(null, String(msg), null)', 'gr.announceManualDone(_roActiveRunId, String(msg), null)');
    if (m === RO) throw new Error('FAIL-CLOSED: toast anchor absent');
    return !/announceManualDone\(null,/.test(extractFn(m, '_roNotify_'));
});
// X6 — a THIRD announce appears somewhere else in the page: the partition must stop balancing.
mutant('a third announce call site appears outside both known paths', function () {
    var m = RO.replace('function _roNotify_(msg) {', "function _roStray_() { gr.announceManualDone('x', 'y'); }\nfunction _roNotify_(msg) {");
    if (m === RO) throw new Error('FAIL-CLOSED: _roNotify_ anchor absent');
    return announces(m) !== announces(handlerBody(callArgs(m, 'gr.runJob('), 'done')) + announces(extractFn(m, '_roNotify_'));
});
// X7 — THE ANTI-TRIPWIRE. Growing the handler by 200 characters WITHOUT changing behaviour must
//      NOT fail. This is the mutant the old {0,240} / {0,1200} windows could not survive: they
//      broke on exactly this, which is how a correct page failed three assertions.
mutant('(inverted) the done handler grows 200 chars with no behaviour change — must STILL pass', function () {
    var filler = "/* " + new Array(197).join('x') + " */";
    var m = RO.replace("done: function (finalState) { _roShowCancel_(false);",
                       "done: function (finalState) { " + filler + " _roShowCancel_(false);");
    if (m === RO) throw new Error('FAIL-CLOSED: done handler anchor absent');
    var body = handlerBody(callArgs(m, 'gr.runJob('), 'done');
    var stillOk = announces(body) === 1
        && /gr\.announceManualDone\(_roActiveRunId,\s*gr\.formatDoneMessage\('Order Planning', scopeSpec, finalState\)\)/.test(body);
    return stillOk;   // "detected" here means the assertion correctly DID NOT break
});

// ---- K1: the same five claims, on the Inventory side ------------------------------------------
// I1 — a second announce inside the Inventory completion path.
mutant('INV: a duplicate completion announcement is added', function () {
    var m = INV.replace("gr.announceManualDone(_irActiveRunId, gr.formatDoneMessage('Inventory', scopeSpec, finalState))",
        "gr.announceManualDone(_irActiveRunId, gr.formatDoneMessage('Inventory', scopeSpec, finalState)); gr.announceManualDone(_irActiveRunId, 'again')");
    if (m === INV) throw new Error('FAIL-CLOSED: INV announce anchor absent');
    return announces(handlerBody(callArgs(m, 'gr.runJob('), 'done')) !== 1;
});
// I2 — the Inventory completion announcement removed.
mutant('INV: the completion announcement is removed', function () {
    var m = INV.replace(/gr\.announceManualDone\(_irActiveRunId,[\s\S]*?finalState\)\)/, '0');
    if (m === INV) throw new Error('FAIL-CLOSED: INV announce anchor absent');
    return announces(handlerBody(callArgs(m, 'gr.runJob('), 'done')) !== 1;
});
// I3 — resume-on-mount starts announcing.
mutant('INV: resume-on-mount announces a completion', function () {
    var args = callArgs(INV, 'gr.resumeIfRunning(');
    var m = args.replace(/done: function \(\) \{/, "done: function () { gr.announceManualDone(_irActiveRunId, 'resumed');");
    if (m === args) throw new Error('FAIL-CLOSED: INV resume done handler absent');
    return announces(m) !== 0;
});
// I4 — a structural anchor goes MISSING: extraction must refuse, not silently return nothing.
mutant('INV: the structural anchor is missing — extraction must fail closed', function () {
    var m = INV.split('gr.runJob(').join('gr.runJobRENAMED(');
    try { callArgs(m, 'gr.runJob('); return false; }          // returning quietly would be the bug
    catch (e) { return /FAIL-CLOSED: call site not found/.test(e.message); }
});
// I5 — a structural anchor becomes AMBIGUOUS: two runJob calls must refuse, not pick the first.
mutant('INV: the structural anchor is duplicated — extraction must refuse to guess', function () {
    var m = INV.replace('return gr.runJob(startFn, statusFn, {', 'if (0) gr.runJob(0, 0, {});\n  return gr.runJob(startFn, statusFn, {');
    if (m === INV) throw new Error('FAIL-CLOSED: INV runJob anchor absent');
    try { callArgs(m, 'gr.runJob('); return false; }
    catch (e) { return /FAIL-CLOSED: ambiguous call site/.test(e.message); }
});
// I6 — THE ANTI-TRIPWIRE, Inventory side. This is the one the {0,240} window could not survive.
mutant('(inverted) INV: the done handler grows 200 chars with no behaviour change — must STILL pass', function () {
    var filler = "/* " + new Array(197).join('x') + " */";
    var m = INV.replace("done: function (finalState) { _irShowCancel_(false);",
                        "done: function (finalState) { " + filler + " _irShowCancel_(false);");
    if (m === INV) throw new Error('FAIL-CLOSED: INV done handler anchor absent');
    var body = handlerBody(callArgs(m, 'gr.runJob('), 'done');
    return announces(body) === 1
        && /gr\.announceManualDone\(_irActiveRunId,\s*gr\.formatDoneMessage\('Inventory', scopeSpec, finalState\)\)/.test(body);
});

ok(mutants >= 7, 'the mutant set is non-empty (' + mutants + ' mutants) — not vacuous');

console.log('\n----------------------------------------');
console.log('GAP JOB DONE NOTICE (F1-SMALL-GAP-JOB-DONE-NOTICE-R1): ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived, ' + (mutants >= 7 ? 'vacuity clean' : 'VACUOUS'));
if (fail > 0) { process.exitCode = 1; }
