// Kitchen Mama Operation System — F1-4B-FM5-R4J-AUTH3 Trigger cleanup / deleteTrigger runtime repair.
// Run: node assets/tests/gap-trigger-cleanup-f1-4b-fm5r4jauth3.test.js
// -----------------------------------------------------------------------------
// LIVE result proved trigger CREATE works (created:true for both continuation handlers). The remaining live failure
// was ONLY "Unexpected error while getting the method or property deleteTrigger on object ScriptApp." — Cause A: the
// OLD verifier deleted the Trigger object returned DIRECTLY by newTrigger().create(). AUTH3 makes the verifier clean
// up with the SAME safe provenance every production cleanup path already uses: gapJobDeleteTriggersByHandler_ →
// re-read ScriptApp.getProjectTriggers(), delete the object obtained from THAT read, matched by handler. CREATE and
// CLEANUP are now classified SEPARATELY (TRIGGER_AUTHORIZATION_OK / _FAILED / TRIGGER_CLEANUP_FAILED) so a cleanup
// failure is never collapsed into an authorization failure. Amazon + unrelated triggers are NEVER deleted.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var F46 = read('specs/active/apps-script/46_api_v1_gap_materialization_job.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

function fnText(src, name) {
  var start = src.indexOf('function ' + name);
  if (start < 0) throw new Error('function ' + name + ' not found');
  var i = src.indexOf('{', start), depth = 0, end = -1;
  for (var p = i; p < src.length; p++) { if (src[p] === '{') depth++; else if (src[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } } }
  return src.slice(start, end);
}
function extractFn(src, name) { return new Function('return (' + fnText(src, name) + ')')(); }

var INV = 'continueInventoryGapMaterializationJob', OP = 'continueOrderPlanningGapMaterializationJob';
var AMAZON = 'runAmazonSnapshotImports', DAILY = 'runDailyInventoryGapMaterialization', FOREIGN = 'someUnrelatedHandler';
var HANDLERS = { INVENTORY: INV, ORDER_PLANNING: OP };

// gapJobClearContinuationTriggers_ calls gapJobDeleteTriggersByHandler_ + reads GAP_JOB_CONTINUATION_HANDLERS_ — bind both.
function makeClearContinuation(scriptApp) {
  var body = fnText(F46, 'gapJobDeleteTriggersByHandler_') + '\n' + fnText(F46, 'gapJobClearContinuationTriggers_') + '\n return gapJobClearContinuationTriggers_;';
  return new Function('ScriptApp', 'GAP_JOB_CONTINUATION_HANDLERS_', body)(scriptApp, HANDLERS);
}
// The testable verify core with an injected io (no ScriptApp needed).
var verify = extractFn(F46, 'gapJobVerifyTriggerAuth_');

// A fake Apps Script trigger registry. Each entry is a handler name; delete flips a flag so getProjectTriggers hides it.
function fakeScriptApp(handlerNames) {
  var reg = handlerNames.map(function (h, i) { return { h: h, id: i, deleted: false }; });
  var api = {
    _reg: reg,
    getProjectTriggers: function () {
      api._reads = (api._reads || 0) + 1;
      return reg.filter(function (t) { return !t.deleted; }).map(function (t) { return { getHandlerFunction: function () { return t.h; }, __t: t }; });
    },
    deleteTrigger: function (tw) { if (!tw || !tw.__t) throw new Error('deleteTrigger requires a getProjectTriggers object'); tw.__t.deleted = true; },
    liveHandlers: function () { return reg.filter(function (t) { return !t.deleted; }).map(function (t) { return t.h; }); }
  };
  return api;
}

// gapJobDeleteTriggersByHandler_ closes over ScriptApp — bind per-registry so each io uses its OWN fake registry.
function boundDelByHandler(sa) { return new Function('ScriptApp', fnText(F46, 'gapJobDeleteTriggersByHandler_') + '\n return gapJobDeleteTriggersByHandler_;')(sa); }
function makeIoBound(opts) {
  opts = opts || {};
  var created = [], owned = opts.owned || {};
  owned[INV] = owned[INV] !== false; owned[OP] = owned[OP] !== false;
  var sa = fakeScriptApp(opts.preexisting || []);
  var del = boundDelByHandler(sa);
  return {
    created: created, sa: sa,
    createTrigger: function (h) { if (opts.throwCreate && opts.throwCreate(h)) throw new Error('ScriptApp.newTrigger authorization required'); created.push(h); sa._reg.push({ h: h, id: sa._reg.length, deleted: false }); },
    cleanupOwned: function (h) { if (opts.throwCleanup && opts.throwCleanup(h)) throw new Error('Unexpected error while getting the method or property deleteTrigger on object ScriptApp.'); return del(h); },
    isOwned: function (h) { return owned[h] === true; }
  };
}

section('§6.1/§6.2 — create Inventory + Order Planning continuation triggers → cleanup SUCCEEDS via getProjectTriggers');
(function () {
  var io = makeIoBound();
  var out = verify([INV, OP], io);
  ok(out.status === 'TRIGGER_AUTHORIZATION_OK' && out.created === true && out.cleanup === true, 'both products: create + cleanup pass → TRIGGER_AUTHORIZATION_OK created+cleanup');
  ok(io.created.join(',') === INV + ',' + OP, 'both continuation triggers created (same auth as START)');
  ok(io.sa.liveHandlers().length === 0, 'NO trigger left behind — both created triggers cleaned via the safe getProjectTriggers path');
  ok(out.handlers.every(function (r) { return r.created && r.cleanup && r.cleaned === 1 && !r.error && !r.cleanupError; }), 'per-handler: created + cleanup, exactly 1 cleaned, no errors');
})();

section('§6.3 — owned trigger selection is handler-SPECIFIC (only the exact handler is deleted)');
(function () {
  var sa = fakeScriptApp([INV, OP, AMAZON, DAILY, FOREIGN]);
  var del = boundDelByHandler(sa);
  var n = del(INV);
  ok(n === 1, 'deleting INV removes exactly ONE trigger (its own handler)');
  ok(sa.liveHandlers().sort().join(',') === [OP, AMAZON, DAILY, FOREIGN].sort().join(','), 'every other handler (OP, Amazon, daily, unrelated) is preserved');
})();

section('§6.4 — Amazon import trigger is NEVER deleted');
(function () {
  var sa = fakeScriptApp([INV, AMAZON]);
  var del = boundDelByHandler(sa);
  del(INV);
  ok(sa.liveHandlers().indexOf(AMAZON) !== -1, 'runAmazonSnapshotImports survives an Inventory-continuation cleanup');
  // and a cleanup targeting a gap handler never even matches the Amazon handler
  var sa2 = fakeScriptApp([AMAZON]); var del2 = boundDelByHandler(sa2);
  ok(del2(INV) === 0 && sa2.liveHandlers().join(',') === AMAZON, 'cleanup by a gap handler deletes 0 when only Amazon is present');
})();

section('§6.5 — unrelated scheduled triggers are NEVER deleted (no delete-all)');
(function () {
  var sa = fakeScriptApp([OP, FOREIGN, DAILY]);
  var del = boundDelByHandler(sa);
  del(OP);
  ok(sa.liveHandlers().sort().join(',') === [FOREIGN, DAILY].sort().join(','), 'unrelated + daily handlers preserved after an Order-Planning cleanup');
})();

section('§6.6 — CANCEL cleans ONLY its own product continuation (gapJobClearContinuationTriggers_)');
(function () {
  var sa = fakeScriptApp([INV, OP, AMAZON]);
  var clear = makeClearContinuation(sa);
  clear('INVENTORY');
  ok(sa.liveHandlers().sort().join(',') === [OP, AMAZON].sort().join(','), 'cancel INVENTORY removes only the Inventory continuation — Order Planning + Amazon preserved');
  clear('ORDER_PLANNING');
  ok(sa.liveHandlers().join(',') === AMAZON, 'cancel ORDER_PLANNING removes only the OP continuation — Amazon still preserved');
})();

section('§6.7 — duplicate continuation cleanup is safe (all copies of the same handler removed)');
(function () {
  var sa = fakeScriptApp([INV, INV, INV, AMAZON]);
  var del = boundDelByHandler(sa);
  var n = del(INV);
  ok(n === 3, 'three duplicate Inventory continuation triggers all deleted (no duplicate chain left)');
  ok(sa.liveHandlers().join(',') === AMAZON, 'Amazon preserved; no Inventory continuation remains');
})();

section('§6.8 — missing target trigger is HARMLESS (0 deleted, no throw)');
(function () {
  var sa = fakeScriptApp([AMAZON]);
  var del = boundDelByHandler(sa);
  var n; var threw = false; try { n = del(INV); } catch (e) { threw = true; }
  ok(!threw && n === 0, 'cleanup when the target continuation is absent → 0 deleted, never throws');
  var sa2 = fakeScriptApp([]); var clear = makeClearContinuation(sa2);
  var t2 = false; try { clear('INVENTORY'); } catch (e) { t2 = true; }
  ok(!t2, 'cancel with an empty trigger table is harmless');
})();

section('§6.9 — CREATE failure still classified as authorization failure (NOT cleanup)');
(function () {
  var io = makeIoBound({ throwCreate: function () { return true; } });
  var out = verify([INV, OP], io);
  ok(out.status === 'TRIGGER_AUTHORIZATION_FAILED' && out.created === false && out.cleanup === false, 'create throws → TRIGGER_AUTHORIZATION_FAILED (create=false, cleanup=false)');
  ok(out.handlers[0].error === 'ScriptApp.newTrigger authorization required' && out.handlers[0].created === false, 'exact create exception surfaced per handler');
})();

section('§6.10 — CLEANUP failure classified SEPARATELY as TRIGGER_CLEANUP_FAILED (create succeeded)');
(function () {
  var io = makeIoBound({ throwCleanup: function () { return true; } });
  var out = verify([INV, OP], io);
  ok(out.status === 'TRIGGER_CLEANUP_FAILED' && out.created === true && out.cleanup === false, 'create ok + cleanup throws → TRIGGER_CLEANUP_FAILED (NOT authorization failed)');
  ok(out.handlers[0].created === true && out.handlers[0].cleanup === false && /deleteTrigger on object ScriptApp/.test(out.handlers[0].cleanupError), 'per-handler: created=true, cleanup=false, EXACT cleanup exception surfaced (never hidden)');
  ok(io.created.length === 2, 'both creates still happened (creation authorization is intact)');
})();

section('§6.10b — a NON-owned handler that was created is never cleaned (isOwned guard) and does not fail cleanup');
(function () {
  var io = makeIoBound({ owned: { someForeignHandler: false } });
  var out = verify(['someForeignHandler'], io);
  ok(out.handlers[0].created === true && out.handlers[0].cleanup === false && out.handlers[0].cleaned === 0, 'foreign handler: created but cleanup guarded off (cleaned 0)');
  ok(out.status === 'TRIGGER_AUTHORIZATION_OK', 'guard-skipped cleanup is not a failure (create succeeded, nothing owned to clean)');
})();

section('ROOT CAUSE contract — the verifier NEVER deletes the create()-returned object; safe provenance only');
(function () {
  var core = fnText(F46, 'gapJobVerifyTriggerAuth_');
  ok(!/deleteTrigger\(t\)/.test(core) && !/var t = io\.createTrigger/.test(core), 'verify core does NOT capture + delete the newTrigger().create() return (Cause A removed)');
  ok(/io\.createTrigger\(h\);/.test(core) && /io\.cleanupOwned\(h\)/.test(core), 'verify core: create then cleanupOwned (re-read path) — separate try/catch');
  var wrapper = F46.slice(F46.indexOf('function verifyGapTriggerAuthorization'), F46.indexOf('// ---- TIME-TRIGGER TARGETS'));
  ok(/cleanupOwned: function \(h\) \{ return gapJobDeleteTriggersByHandler_\(h\)/.test(wrapper) && !/deleteTrigger\(t\)/.test(wrapper), 'wrapper cleanup routes through gapJobDeleteTriggersByHandler_ (getProjectTriggers), never the created object');
  var del = fnText(F46, 'gapJobDeleteTriggersByHandler_');
  ok(/ScriptApp\.getProjectTriggers\(\)/.test(del) && /getHandlerFunction\(\) === h/.test(del) && /ScriptApp\.deleteTrigger\(triggers\[i\]\)/.test(del), 'safe helper deletes ONLY objects re-read from getProjectTriggers(), matched by handler');
  ok(/function gapJobClearContinuationTriggers_[\s\S]*gapJobDeleteTriggersByHandler_\(h\)/.test(F46), 'cancel/continuation cleanup reuses the same safe helper (single delete provenance)');
})();

section('§5 negative constraints — no formula / cadence / DB / recommendation change in this repair');
(function () {
  // The AUTH3 diff touches ONLY these four functions — assert calculation/mapping/DB owners are absent from each.
  var touched = ['gapJobDeleteTriggersByHandler_', 'gapJobClearContinuationTriggers_', 'gapJobVerifyTriggerAuth_', 'verifyGapTriggerAuthorization']
    .map(function (n) { return fnText(F46, n); }).join('\n');
  ok(!/gapProcess|processSlice|gapInvMapFromLines_|gapOpMapFromLines_|KMCALC|KMMSA|KMALLOC/.test(touched), 'no gap calculation / mapping / allocation owner in the AUTH3-touched functions');
  ok(!/SpreadsheetApp|getRange|setValues|BigQuery/.test(touched), 'no DB / sheet / BigQuery write in the AUTH3-touched functions');
})();

console.log('\n----------------------------------------');
console.log('GAP TRIGGER CLEANUP (F1-4B-FM5-R4J-AUTH3): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
