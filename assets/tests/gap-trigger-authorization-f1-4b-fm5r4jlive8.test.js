// Kitchen Mama Operation System — F1-4B-FM5-R4J-LIVE8 PART B: ScriptApp trigger-authorization bootstrap/verify.
// Run: node assets/tests/gap-trigger-authorization-f1-4b-fm5r4jlive8.test.js
// -----------------------------------------------------------------------------
// The live manual/scheduled START fails with CONTINUATION_SCHEDULE_FAILED / "ScriptApp.newTrigger authorization
// required". gapJobVerifyTriggerAuth_ is the bounded bootstrap that forces + PROVES the SAME trigger-management
// authorization WITHOUT any gap calculation and WITHOUT a permanent trigger: create a one-off owned continuation
// trigger, then immediately delete it. Cleanup may delete ONLY owned gap continuation handlers — never the Amazon
// import trigger or any unrelated handler. On failure the EXACT Apps Script exception is surfaced (never hidden).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var F46 = read('specs/active/apps-script/46_api_v1_gap_materialization_job.gs');

// Extract the self-contained testable core gapJobVerifyTriggerAuth_(handlers, io) from source and evaluate it.
function extractFn(src, name) {
  var start = src.indexOf('function ' + name);
  if (start < 0) throw new Error('function ' + name + ' not found');
  var i = src.indexOf('{', start), depth = 0, end = -1;
  for (var p = i; p < src.length; p++) { if (src[p] === '{') depth++; else if (src[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } } }
  return new Function('return (' + src.slice(start, end) + ')')();
}
var verify = extractFn(F46, 'gapJobVerifyTriggerAuth_');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var INV = 'continueInventoryGapMaterializationJob', OP = 'continueOrderPlanningGapMaterializationJob';
var AMAZON = 'runAmazonSnapshotImports';

// A fake trigger io that records create/delete and can be told to throw an authorization error on create.
function makeIo(opts) {
  opts = opts || {};
  var created = [], deleted = [], ownedSet = opts.owned || {};
  ownedSet[INV] = ownedSet[INV] !== false; ownedSet[OP] = ownedSet[OP] !== false;   // both owned by default
  return {
    created: created, deleted: deleted,
    createTrigger: function (h) { if (opts.throwOn && opts.throwOn(h)) { throw new Error('ScriptApp.newTrigger authorization required'); } var t = { handler: h, id: created.length }; created.push(h); return t; },
    deleteTrigger: function (t) { deleted.push(t.handler); },
    isOwned: function (h) { return ownedSet[h] === true; }
  };
}

section('B15/B16 — SUCCESS: both continuation handlers create + clean up → TRIGGER_AUTHORIZATION_OK');
(function () {
  var io = makeIo();
  var out = verify([INV, OP], io);
  ok(out.status === 'TRIGGER_AUTHORIZATION_OK' && out.created === true && out.cleanup === true, 'B15/16 both products authorized → TRIGGER_AUTHORIZATION_OK created+cleanup');
  ok(io.created.join(',') === INV + ',' + OP, 'both continuation triggers were created (Inventory + Order Planning)');
  ok(io.deleted.join(',') === INV + ',' + OP, 'both created triggers were cleaned up (no permanent trigger left)');
  ok(out.handlers.length === 2 && out.handlers.every(function (r) { return r.created && r.cleanup && !r.error; }), 'per-handler result: created + cleanup, no error');
})();

section('B10 — FAILURE: ScriptApp authorization exception is propagated VERBATIM (never hidden)');
(function () {
  var io = makeIo({ throwOn: function () { return true; } });
  var out = verify([INV, OP], io);
  ok(out.status === 'TRIGGER_AUTHORIZATION_FAILED', 'auth failure → TRIGGER_AUTHORIZATION_FAILED');
  ok(out.handlers[0].error === 'ScriptApp.newTrigger authorization required' && out.handlers[0].created === false, 'exact Apps Script authorization message surfaced per handler; created=false');
  ok(io.deleted.length === 0, 'nothing to clean up when creation itself was unauthorized');
})();

section('B13 — cleanup deletes ONLY owned gap continuation handlers');
(function () {
  // A non-owned handler that somehow got created must NOT be deleted by the cleanup guard.
  var io = makeIo({ owned: { 'someForeignHandler': false } });
  var out = verify(['someForeignHandler'], io);
  ok(io.created.join(',') === 'someForeignHandler', 'the (foreign) trigger was created');
  ok(io.deleted.length === 0, 'a NON-owned handler is never deleted by cleanup (isOwned guard)');
  ok(out.handlers[0].created === true && out.handlers[0].cleanup === false, 'foreign handler: created but cleanup=false (guard held)');
})();

section('B14 — Amazon import trigger is never created or deleted by the verifier');
(function () {
  var io = makeIo();
  verify([INV, OP], io);
  ok(io.created.indexOf(AMAZON) === -1 && io.deleted.indexOf(AMAZON) === -1, 'runAmazonSnapshotImports never appears in created/deleted sets');
})();

section('source contract — the top-level wrapper verifies BOTH products, guards cleanup, and runs NO calculation');
(function () {
  var _ws = F46.indexOf('function verifyGapTriggerAuthorization');
  var w = F46.slice(_ws, F46.indexOf('// ---- TIME-TRIGGER TARGETS', _ws));   // bound to the wrapper only (not the trigger targets)
  ok(/GAP_JOB_CONTINUATION_HANDLERS_\.INVENTORY/.test(w) && /GAP_JOB_CONTINUATION_HANDLERS_\.ORDER_PLANNING/.test(w), '§B8 wrapper verifies BOTH Inventory + Order Planning continuation handlers');
  ok(/ScriptApp\.newTrigger\(h\)\.timeBased\(\)\.after\(/.test(w) && /ScriptApp\.deleteTrigger\(t\)/.test(w), 'wrapper uses ScriptApp.newTrigger (same auth as START) + deleteTrigger for cleanup');
  ok(/gapJobIsOwnedContinuationHandler_\(h\)/.test(w), '§B6 cleanup guarded by gapJobIsOwnedContinuationHandler_ (owned handlers only)');
  ok(!/processSlice|gapJobContinue_|gapProcess/.test(w), '§B5 the verifier performs NO gap calculation');
  // The throwing owner is gapJobScheduleContinuation_ → ScriptApp.newTrigger (the START-path auth site).
  ok(/function gapJobScheduleContinuation_/.test(F46) && /ScriptApp\.newTrigger\(h\)\.timeBased\(\)\.after\(/.test(F46), 'START-path auth site present: gapJobScheduleContinuation_ → ScriptApp.newTrigger');
})();

console.log('\n----------------------------------------');
console.log('GAP TRIGGER AUTHORIZATION (F1-4B-FM5-R4J-LIVE8 PART B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
