// F1-4B-FM6-R4E3 — Order Planning AI Plan → resumable canonical draft job → DB read-back → editable Order Allocation.
// Proves the BOUNDED frontend integration over the EXISTING R4E2-B2 backend: AI Plan drives ONE logical scope job
// (1 start → N bounded continues → 1 getActive), renders Order Allocation from the PERSISTED DB draft (execution
// authority), keeps recommended_qty immutable, persists order_qty through the EXISTING locked writer, fails closed on
// FAILED/conflict/stale token, treats CANCELLED as non-failure, marks NO_DRAFT without a recompute fallback, excludes
// T4, and does NOT touch Send Request. Pure dispositions are eval'd; the driver runs against a fake KM.DB (proving no
// per-SKU fan-out); the rest are source guards. Run: node assets/tests/ai-plan-canonical-job-f1-4b-fm6r4e3.test.js
// NOTE: no 'use strict' — the extracted helpers are eval'd into module scope (strict eval would sandbox them).

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var RO = read('js/pages/request-order.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var HTML = read('html/pages/request-order.html');

// ---- stubbed environment shared by the eval'd driver functions (declared BEFORE eval so closures capture them) ----
var window = { KM: { DB: null } };
var document = { getElementById: function () { return null; } };   // every UI helper guards on a null element → no-op
var setTimeout = function (fn) { Promise.resolve().then(fn); };     // defer to a microtask so the loop advances on drain
var _notes = [];
function _roNotify_(m) { _notes.push(String(m)); }
var _getActiveCalls = 0, _getActiveScopes = [];
function _roLoadCanonicalDraftsForScope_(scope) { _getActiveCalls++; _getActiveScopes.push(scope); return Promise.resolve({}); }
var _canonScope = null;
function _roCanonicalScope_() { return _canonScope; }
// module-scope driver state + tunables (mirror the source; the eval'd functions read/assign these bindings)
var _roAiPlanBusy = false, _roAiPlanRunId = null, _roAiPlanTotal = 0, _roAiPlanCancelRequested = false;
var _RO_AI_PLAN_CONTINUE_DELAY_MS = 0, _RO_AI_PLAN_BUSY_RETRY_MS = 0;
var _roAiPlanResult = null;   // F1-7N-FA-3C-PRE3-R2 — persistent result state (render no-ops in Node: no `document`)
var _roAiPlanManualToken = 0, _roAiPlanKeydownBound = false;   // F1-7N-FA-3C-R5D — manual-only result authority state used by the driver

// ---- eval the pure dispositions + the async driver into module scope (top-level eval so the bindings persist) ----
eval(extractFn(RO, '_roAiPlanStartDisposition_'));
eval(extractFn(RO, '_roAiPlanContinueDisposition_'));
eval(extractFn(RO, '_roAiPlanFailMsg_'));
eval(extractFn(RO, '_roAiPlanScopeMatches_'));
eval(extractFn(RO, '_roAiPlanTrigger_'));
eval(extractFn(RO, '_roAiPlanCancelBtn_'));
eval(extractFn(RO, '_roAiPlanSetProgress_'));
eval(extractFn(RO, '_roAiPlanResetUi_'));
eval(extractFn(RO, '_roAiPlanDelay_'));
eval(extractFn(RO, '_roAiPlanDoneMsg_'));   // F1-7N-FA-3C-PRE3-R1 — terminal-count message builder used by _roAiPlanFinishDone_
eval(extractFn(RO, '_roAiPlanShouldShowResult_'));   // F1-7N-FA-3C-R5D — manual-only result authority helper used by the driver
eval(extractFn(RO, '_roAiPlanScopeKey_'));  // F1-7N-FA-3C-PRE3-R2 — persistent result panel helpers used by the driver
eval(extractFn(RO, '_roAiPlanNum_'));
eval(extractFn(RO, '_roAiPlanResultVisibleFor_'));
eval(extractFn(RO, '_roClearAiPlanResult_'));
eval(extractFn(RO, '_roSetAiPlanResult_'));
eval(extractFn(RO, '_roAiPlanResultEl_'));
eval(extractFn(RO, '_roRenderAiPlanResult_'));
eval(extractFn(RO, '_roRunAiPlanJob_'));
eval(extractFn(RO, '_roAiPlanDriveContinue_'));
eval(extractFn(RO, '_roAiPlanFinishDone_'));
eval(extractFn(RO, '_roAiPlanFinishCancelled_'));
eval(extractFn(RO, 'handleCancelRequestOrderDraftJob'));

function drain(n) { var p = Promise.resolve(); for (var i = 0; i < (n || 200); i++) p = p.then(function () {}); return p; }

// =============================================================================
console.log('\n== PURE dispositions (START / CONTINUE / fail-msg / scope) ==');
// START
eq(_roAiPlanStartDisposition_({ success: true, data: { runId: 'R1', status: 'RUNNING', total: 3 } }), { action: 'RUN', runId: 'R1', total: 3, resumed: false }, 'A START fresh → RUN with runId+total');
eq(_roAiPlanStartDisposition_({ success: true, data: { runId: 'R1', status: 'RUNNING', total: 3, alreadyRunning: true, sameScope: true } }).action, 'RUN', '§16 same-scope alreadyRunning → RUN (resume, not duplicate)');
eq(_roAiPlanStartDisposition_({ success: true, data: { alreadyRunning: true, busy: true, sameScope: false } }).action, 'BUSY', '§3 another scope owns the single slot → BUSY (never a duplicate start)');
eq(_roAiPlanStartDisposition_({ success: false, error: { code: 'ORDER_PLANNING_GAP_NOT_READY' } }), { action: 'FAIL', code: 'ORDER_PLANNING_GAP_NOT_READY' }, 'START error surfaces the truthful code');
// CONTINUE — terminal handling (§4)
eq(_roAiPlanContinueDisposition_({ success: true, data: { status: 'DONE', cursor: 3, total: 3, hasMore: false } }), { action: 'DONE', done: 3, total: 3, counts: null, reasonCounts: null, reasonSamples: null }, 'CONTINUE DONE (carries counts + reason distribution; null when the terminal state omits them)');
eq(_roAiPlanContinueDisposition_({ success: true, data: { status: 'RUNNING', cursor: 25, total: 93, hasMore: true } }), { action: 'MORE', done: 25, total: 93 }, 'CONTINUE hasMore → MORE (keep driving)');
eq(_roAiPlanContinueDisposition_({ success: true, data: { status: 'FAILED', lastError: 'GAP_GENERATION_CHANGED' } }), { action: 'FAILED', code: 'GAP_GENERATION_CHANGED', counts: null, reasonCounts: null, reasonSamples: null }, 'H CONTINUE FAILED carries lastError + reason distribution (fail closed)');
eq(_roAiPlanContinueDisposition_({ success: true, data: { status: 'CANCELLED' } }).action, 'CANCELLED', 'I CONTINUE CANCELLED is its own terminal (not FAILED)');
eq(_roAiPlanContinueDisposition_({ success: true, data: { busy: true } }).action, 'BUSY', '§3 a live lease → BUSY (wait, do not fan out)');
eq(_roAiPlanContinueDisposition_({ success: true, data: { status: 'NONE' } }).action, 'NONE', 'vanished job → NONE');
eq(_roAiPlanContinueDisposition_({ success: false, error: { code: 'X' } }).action, 'FAIL', 'transport failure → FAIL (never silent success)');
// fail-msg mapping — never converts a failure into success
ok(/Recalculate/.test(_roAiPlanFailMsg_('GAP_GENERATION_CHANGED')) && /No partial result/.test(_roAiPlanFailMsg_('GAP_GENERATION_CHANGED')), 'H fail-msg: gap changed → recalc + no-partial-applied');
ok(/eligible/i.test(_roAiPlanFailMsg_('REQUEST_ORDER_DRAFT_EMPTY_SCOPE')), 'fail-msg: empty scope truthful');
ok(/too large/i.test(_roAiPlanFailMsg_('REQUEST_ORDER_DRAFT_JOB_STATE_LIMIT')), 'fail-msg: state-limit truthful');
// scope match (§16 resume ownership)
ok(_roAiPlanScopeMatches_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, { company: 'km', country: 'us', marketplace: 'amazon_us' }), 'scope match is case-insensitive');
ok(!_roAiPlanScopeMatches_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA' }), 'scope mismatch → false (do not adopt another scope job)');

// =============================================================================
// FUNCTIONAL — the driver against a fake KM.DB proves ONE logical job: 1 start + N bounded continues + 1 getActive.
(async function () {
  console.log('\n== FUNCTIONAL driver (no browser per-SKU fan-out) ==');

  // Fixture B — 93-SKU scope @25/continue: exactly 1 start, 4 continues, 1 getActive (NOT 93 requests).
  (function reset() { _roAiPlanBusy = false; _notes = []; _getActiveCalls = 0; })();
  var calls = { start: 0, cont: 0, getActive0: 0 };
  window.KM.DB = {
    startRequestOrderDraftJob: function () { calls.start++; return Promise.resolve({ success: true, data: { runId: 'R1', status: 'RUNNING', total: 93, cursor: 0 } }); },
    continueRequestOrderDraftJob: function () { calls.cont++; var done = calls.cont >= 4; return Promise.resolve({ success: true, data: done ? { status: 'DONE', cursor: 93, total: 93, hasMore: false } : { status: 'RUNNING', cursor: calls.cont * 25, total: 93, hasMore: true } }); }
  };
  _roRunAiPlanJob_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' });
  await drain();
  eq([calls.start, calls.cont, _getActiveCalls], [1, 4, 1], 'B 93 SKUs @25 → 1 start + 4 continues + 1 getActive (NO 93-request fan-out)');
  ok(_notes.some(function (m) { return /completed/i.test(m); }), '§17 exactly-once success notification on DONE');
  ok(_roAiPlanBusy === false, 'driver resets busy on terminal');

  // Fixture A — 3-SKU: START → one CONTINUE → DONE → one getActive; success once.
  (function reset() { _roAiPlanBusy = false; _notes = []; _getActiveCalls = 0; })();
  var a = { start: 0, cont: 0 };
  window.KM.DB = {
    startRequestOrderDraftJob: function () { a.start++; return Promise.resolve({ success: true, data: { runId: 'RA', status: 'RUNNING', total: 3, cursor: 0 } }); },
    continueRequestOrderDraftJob: function () { a.cont++; return Promise.resolve({ success: true, data: { status: 'DONE', cursor: 3, total: 3, hasMore: false } }); }
  };
  _roRunAiPlanJob_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' });
  await drain();
  eq([a.start, a.cont, _getActiveCalls], [1, 1, 1], 'A 3-SKU → 1 start + 1 continue + 1 getActive');

  // §3 — a duplicate AI Plan while one is already running is refused (no second start).
  (function reset() { _roAiPlanBusy = false; })();
  var g = { start: 0 };
  window.KM.DB = {
    startRequestOrderDraftJob: function () { g.start++; return new Promise(function () {}); },   // never resolves → stays busy
    continueRequestOrderDraftJob: function () { return new Promise(function () {}); }
  };
  _roRunAiPlanJob_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' });
  await drain(5);
  _roRunAiPlanJob_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' });   // second click while busy
  await drain(5);
  eq(g.start, 1, '§3 a second AI Plan while busy does NOT start a duplicate job');
  _roAiPlanBusy = false;   // release the stuck fixture

  // Fixture H — FAILED (GAP_GENERATION_CHANGED) fails closed: NO getActive-as-success, truthful notice.
  (function reset() { _roAiPlanBusy = false; _notes = []; _getActiveCalls = 0; })();
  window.KM.DB = {
    startRequestOrderDraftJob: function () { return Promise.resolve({ success: true, data: { runId: 'RH', status: 'RUNNING', total: 3, cursor: 0 } }); },
    continueRequestOrderDraftJob: function () { return Promise.resolve({ success: true, data: { status: 'FAILED', lastError: 'GAP_GENERATION_CHANGED' } }); }
  };
  _roRunAiPlanJob_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' });
  await drain();
  eq(_getActiveCalls, 0, 'H FAILED → getActive NOT called (no stale draft treated as successful)');
  ok(_notes.some(function (m) { return /Recalculate/.test(m); }) && !_notes.some(function (m) { return /completed/i.test(m); }), 'H FAILED → truthful notice, never a success toast');

  // Fixture I — CANCELLED: poll stops, drafts preserved (getActive reload), NOT a failure.
  (function reset() { _roAiPlanBusy = false; _notes = []; _getActiveCalls = 0; })();
  var ic = { cont: 0 };
  window.KM.DB = {
    startRequestOrderDraftJob: function () { return Promise.resolve({ success: true, data: { runId: 'RI', status: 'RUNNING', total: 3, cursor: 0 } }); },
    continueRequestOrderDraftJob: function () { ic.cont++; return Promise.resolve({ success: true, data: { status: 'CANCELLED' } }); }
  };
  _roRunAiPlanJob_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US' });
  await drain();
  eq(_getActiveCalls, 1, 'I CANCELLED → one getActive reload (already-created drafts preserved + rendered)');
  ok(_notes.some(function (m) { return /cancelled/i.test(m) && /kept/i.test(m); }) && !_notes.some(function (m) { return /could not/i.test(m); }), 'I CANCELLED announced as non-failure (drafts kept)');

  // scopeless AI Plan never starts the backend job (honest boundary — KMREC-only)
  (function reset() { _roAiPlanBusy = false; })();
  var sc = { start: 0 };
  window.KM.DB = { startRequestOrderDraftJob: function () { sc.start++; return Promise.resolve({ success: true, data: {} }); }, continueRequestOrderDraftJob: function () { return Promise.resolve({ success: true, data: { status: 'DONE' } }); } };
  await _roRunAiPlanJob_(null);
  await _roRunAiPlanJob_({ company: 'KM' });   // incomplete scope
  eq(sc.start, 0, 'scopeless / partial scope → job never starts (backend requires company+country+marketplace)');

  // =============================================================================
  console.log('\n== SOURCE guards (wiring, immutability, boundaries) ==');
  // §5/§13/§14 AI Plan drives the job from the concrete scope; KMREC render stays display-only
  ok(/_roRunAiPlanJob_\(_cs\)/.test(RO) && /DISPLAY-ONLY/.test(RO), '§14 handleRequestOrderAiPlan drives the job for a concrete scope; KMREC labelled DISPLAY-ONLY');
  // §7 DONE → getActive read-back is the ONLY place the drafts are read on completion (one scope read)
  ok(/_roAiPlanFinishDone_[\s\S]{0,600}_roLoadCanonicalDraftsForScope_\(scope\)/.test(RO), '§6/§7 DONE handler performs ONE scope getActive read-back (render from DB draft)');   // window widened for the FA-3C-PRE3-R2 persistent-result set before the read-back
  // no per-SKU fan-out: the continue loop is a single self-chained step (setTimeout), never Promise.all over SKUs
  var driver = extractFn(RO, '_roAiPlanDriveContinue_');
  ok(!/Promise\.all/.test(driver) && /_roAiPlanDelay_\(step/.test(driver), '§3/§25 continue loop is self-chained (one at a time) — no Promise.all / per-SKU fan-out');
  ok(!/getOrderPlanningGap|calculateGap|KMALLOC|KMAR|KMSF|KMFC/.test(driver), '§21/§22 driver performs NO gap/factory recompute (KMALLOC/KMAR/calculateGap absent)');
  // §16 resume — status(null) adopted only for a matching scope; no second job table
  ok(/getRequestOrderDraftJobStatus\(null\)/.test(RO) && /_roAiPlanScopeMatches_\(d\.scope, scope\)/.test(RO), '§16 resume-on-mount adopts a RUNNING job ONLY when the scope matches');
  ok(/_roLoadCanonicalDraftsOnMount_ === 'function'\) \{ try \{ _roLoadCanonicalDraftsOnMount_\(\)/.test(RO) && /_roResumeAiPlanJobOnMount_ === 'function'\) \{ try \{ _roResumeAiPlanJobOnMount_\(\)/.test(RO), '§15/§16 lifecycle mount restores drafts (getActive) AND resumes a running job');

  // Order Allocation execution source = persisted draft (R4E3-PRE display switch stays canonical authority)
  ok(/_roRowOrderQtyDisplay_[\s\S]{0,400}_roCanonicalRowFor_[\s\S]{0,120}order_qty/.test(RO), '§7/§13/§14 Order Qty display reads the persisted canonical draft order_qty (execution authority)');
  // recommended_qty / gap snapshot / UPC never in the edit command (§9 immutable) — only order_qty
  var editCmd = extractFn(RO, '_roBuildOrderQtyEditCommand_');
  ok(/fields: \{ order_qty:/.test(editCmd) && !/recommended_qty|calculated_gap_qty_snapshot|units_per_carton/.test(editCmd), '§9/§10 locked edit sends ONLY order_qty (recommended/gap/UPC immutable)');
  ok(/updateRecommendationDecisionLocked/.test(RO), '§10 order_qty persists through the EXISTING locked decision writer (no second edit writer)');
  // §11 stale token + conflict fail closed
  ok(/CONCURRENCY_TOKEN_MISMATCH|VERSION_CONFLICT|TOKEN_MISMATCH/.test(RO) && /_roLoadCanonicalDraftsForScope_\(_roCanonicalScope_\(\)\)/.test(RO), '§11 stale token → reload latest draft, never overwrite (R6B: inline Conflict state + re-read)');
  ok(/if \(!d \|\| d\.conflict \|\| !d\.lines\) return null;/.test(RO), '§13 conflict draft → no canonical row (editing blocked; fail closed)');
  // §12 NO_DRAFT marker without a recompute fallback
  ok(/_roIsNoDraftSku_/.test(RO) && /No active AI Plan draft/.test(RO), '§12 NO_DRAFT SKUs are clearly marked (no silent second quantity authority)');
  ok(/_roNoDraftSkus = \{\}/.test(RO) && /data\.noDraftSkus/.test(RO), '§12 the NO_DRAFT set comes from the scope read-back only (replaced each read; R6B: reset in the loader, populated in the per-scope reader)');
  // §8 T4 non-actionable — the allocation renderer only builds T1/T2/T3 rows
  ok(/\['T1', 'T2', 'T3'\]\.map\(function/.test(RO), '§8/J T4 is never rendered as an editable allocation line (renderer = T1/T2/T3 only)');

  // §5 contextual cancel only while active
  ok(/id="ro-ai-plan-cancel-btn"[\s\S]{0,240}display:none/.test(HTML) && /handleCancelRequestOrderDraftJob\(\)/.test(HTML), '§18 contextual AI Plan Cancel button (hidden until active)');
  var cancelFn = extractFn(RO, 'handleCancelRequestOrderDraftJob');
  ok(/cancelRequestOrderDraftJob\(_roAiPlanRunId\)/.test(cancelFn) && /_roAiPlanFinishCancelled_/.test(cancelFn), '§18 cancel calls the canonical backend cancel once then reloads preserved drafts');

  // R4E3 boundary — Send Request was NOT wired to the canonical draft in R4E3 (its collision was documented and
  // deferred). F1-4B-FM6-R4E4 supersedes this: Send now sources canonical persisted order_qty (_roSendOrderQty_)
  // and confirms the existing draft in place. See send-request-lifecycle-f1-4b-fm6r4e4.test.js for the full behavior.
  var send = extractFn(RO, 'handleSendRequest');
  ok(/_roSendOrderQty_\(item, idx, b, e\)/.test(send), 'R4E4 Send Request sources canonical persisted order_qty (_roSendOrderQty_), not a live recompute');
  ok(!/startRequestOrderDraftJob|continueRequestOrderDraftJob/.test(send), '§19 Send Request does NOT drive the AI Plan job');

  // adapters reused (no new transport / second persister)
  ok(/startRequestOrderDraftJob = function\(scope/.test(DBAPI) && /continueRequestOrderDraftJob = function\(runId/.test(DBAPI) && /getActiveRequestOrderDrafts = function\(scope/.test(DBAPI), 'adapters: start/continue/getActive already exist (reused, not re-created)');

  console.log('\n----------------------------------------');
  console.log('AI PLAN CANONICAL JOB (F1-4B-FM6-R4E3): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) process.exitCode = 1;
})();
