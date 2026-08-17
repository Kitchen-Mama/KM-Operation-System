// Kitchen Mama Operation System — F1-7M-A-P0-SERIAL-REQUEST-ELIMINATION-R1
// Proves the ONLY runtime change of this round — A1: the RO/AI-Plan first-open marketplace-reference read and the
// first-layer composer read now start in the SAME wave (both HTTP requests in flight together instead of
// marketplace-then-composer serial), while the SUCCESS render still waits for BOTH (marketplace dropdown populated on
// the first _roRenderAll — identical render ordering). It also LOCKS IN the two audited-but-unchanged sub-slices:
//   A2 (RO Send hidden token) = HALT RO_SEND_TOKEN_EQUIVALENCE_NOT_PROVEN — the manual Send lines-writer holds NO token
//       (never calls _roEnsureDraftToken_), so the single db-api token read is NECESSARY, not redundant; source UNCHANGED.
//   FC Special Event = BATCH_ENDPOINT_REQUIRED — handleUpsertFcSpecialEvent_ is an UNLOCKED read-scan-then-appendRow
//       writer, so parallelizing the existing per-SKU writes could race; the serial loop is left UNCHANGED (deferred).
// Frozen invariants re-checked: writer full-reload = 0, app prime = 0, canonical broad = 0.
// Run: node assets/tests/api-serial-request-elimination-f1-7m-a-r1.test.js
// NOTE: no 'use strict' — extracted source slices are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
function tick() { return new Promise(function (r) { setImmediate(r); }); }   // flush all pending microtasks

var RO = read('js/pages/request-order.js');
var FC = read('js/pages/fc-summary.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var GS = read('specs/active/apps-script/14_fc_write_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');

// ===================================================================================================================
console.log('\n== A1 structural: first-open fires both reads in ONE wave (no ref→composer serial .then) ==');
// The old serial chain "_roLoadMarketplaceRef_().then(function () { _opLoadFirstLayerComposer_(); })" is GONE.
ok(RO.indexOf('_roLoadMarketplaceRef_().then(function () { _opLoadFirstLayerComposer_(); })') === -1,
  'the marketplace-ref → composer serial .then chain is removed from the first-open path');
// Replaced by: fire the ref (promise captured) then the composer synchronously in the same statement wave.
ok(/var _mktRefPromise = _roLoadMarketplaceRef_\(\);\s*_opLoadFirstLayerComposer_\(_mktRefPromise\);/.test(RO),
  'first-open captures the ref promise and hands it to the composer as a render gate (both reads start in the same wave)');
ok(/function _opLoadFirstLayerComposer_\(refGate\)/.test(RO), '_opLoadFirstLayerComposer_ takes an optional refGate render-gate param');
// The reload path hands the composer a refresh-gate (updated by F1-7M-B2: bounded single-table refresh or full-set
// fallback, fired in the same wave as the composer). The A1 no-gate FIRST-OPEN behavior is asserted above; this only
// confirms A1 did not itself serialize the reload — the reload's own bounded/parallel shape is owned by B2's suite.
ok(/_opLoadFirstLayerComposer_\(refreshP\)/.test(RO) && /function _roReloadAndRerender\(changedTables\)/.test(RO),
  'reload path (_roReloadAndRerender) re-reads the composer via a refresh gate (no serial ref→composer chain)');

// ===================================================================================================================
console.log('\n== A1 behavioral: parallel start, render waits for BOTH, single composer request, bounded error ==');
// Stubs shared by the behavioral cases (module-scope vars so the eval\'d fn resolves them).
var callLog, renderCount, errorState, _opFirstLayerSeq, requestOrderState;
var _composerResolve, _composerPromise;
function _resetEnv() {
  callLog = []; renderCount = 0; errorState = null; _opFirstLayerSeq = 0; requestOrderState = { data: [] };
  _composerPromise = new Promise(function (r) { _composerResolve = r; });
}
global.document = { getElementById: function () { return null; } };
global.window = { KM: {
  DB: { getAiPlanFirstLayer: function () { callLog.push('composer'); return _composerPromise; } },
  loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' } }
} };
function _opFirstLayerRegion_() { return { beginLoad: function () {}, set: function (s) { errorState = s; } }; }
function _roRenderAll() { renderCount++; callLog.push('render'); }
function _opFirstLayerError_(err) { requestOrderState.data = []; errorState = 'ERROR'; callLog.push('error:' + (err && err.code)); }
function _opFirstLayerCycle() { return 'RECO-2026-08'; }
eval(extractFn(RO, '_opLoadFirstLayerComposer_'));

(async function () {
  // --- Case 1: first-open success — both reads start together; render gated on the ref promise ---
  _resetEnv();
  var _mktResolve, _mktPromise = new Promise(function (r) { _mktResolve = r; });
  function _roLoadMarketplaceRef_() { callLog.push('marketplace'); return _mktPromise; }   // mirrors the real loader (always resolves)
  // The exact first-open dispatch shape:
  var _mktRefPromise = _roLoadMarketplaceRef_();
  _opLoadFirstLayerComposer_(_mktRefPromise);
  eq(callLog.slice().sort(), ['composer', 'marketplace'], 'A1: BOTH the marketplace ref read and the composer read start in the same wave (before any resolve)');
  ok(renderCount === 0, 'A1: no render before either read resolves');

  // Composer resolves FIRST, ref still pending → render must WAIT (dropdown would be empty otherwise).
  _composerResolve({ success: true, data: { rows: [{ sku: 'A' }] } });
  await tick();
  ok(renderCount === 0, 'A1: composer alone does NOT render — the render gate waits for the marketplace ref');

  // Ref resolves → NOW render fires exactly once, READY state.
  _mktResolve([{ marketplaceId: 'US1' }]);
  await tick();
  ok(renderCount === 1, 'A1: render fires once both reads resolve');
  eq(errorState, 'READY', 'A1: rows present → READY state');
  eq((callLog.filter(function (x) { return x === 'composer'; })).length, 1, 'A1: exactly ONE composer request (no duplicate)');

  // --- Case 2: composer FAILURE → bounded error state, no render, ref pending is irrelevant ---
  _resetEnv();
  var _mp2 = new Promise(function () {});   // ref never resolves — must not matter on the error path
  _opLoadFirstLayerComposer_(_mp2);
  _composerResolve({ success: false, errors: [{ code: 'READ_FAILED', message: 'x' }] });
  await tick();
  ok(renderCount === 0, 'A1: composer failure does NOT render');
  eq(errorState, 'ERROR', 'A1: composer failure → bounded ERROR state (independent of the ref promise)');
  ok(callLog.indexOf('error:READ_FAILED') !== -1, 'A1: bounded error surfaces the composer error code');

  // --- Case 3: reload path (no gate) → render is synchronous within the composer .then (unchanged) ---
  _resetEnv();
  _opLoadFirstLayerComposer_();   // no refGate
  _composerResolve({ success: true, data: { rows: [] } });
  await tick();
  ok(renderCount === 1, 'A1: no-gate (reload) path renders on composer resolve — unchanged behavior');
  eq(errorState, 'EMPTY', 'A1: no-gate empty rows → EMPTY state');

  // --- Case 4: stale supersede — a newer composer load bumps the seq; the stale render is dropped ---
  _resetEnv();
  var _mp4r, _mp4 = new Promise(function (r) { _mp4r = r; });
  _opLoadFirstLayerComposer_(_mp4);           // seq → 1
  _composerResolve({ success: true, data: { rows: [{ sku: 'Z' }] } });
  await tick();                                // composer resolved, ref still pending, render still gated
  _opFirstLayerSeq = 5;                         // simulate a newer load superseding this one
  _mp4r([]);
  await tick();
  ok(renderCount === 0, 'A1: a superseded (stale-seq) first-open render is dropped even after its ref resolves');

  // ===================================================================================================================
  console.log('\n== A2 (HALT RO_SEND_TOKEN_EQUIVALENCE_NOT_PROVEN): manual Send holds no token; source UNCHANGED ==');
  // The manual Send branch (d.isCanonical === false) calls the lines-writer with NO expectedToken and does NOT fetch a
  // token first — so there is no held token to pass and the single db-api read is necessary (not redundant).
  ok(/_roEnsureDraftToken_/.test(RO), '_roEnsureDraftToken_ exists (canonical-draft token helper)');
  // It is used ONLY on the canonical branch / inline edit — NOT in the manual lines-writer path.
  eq((RO.match(/(?<!function )_roEnsureDraftToken_\(/g) || []).length, 2, '_roEnsureDraftToken_ is CALLED exactly twice (canonical confirm + inline order-qty edit) — NOT the manual Send lines path');
  // The manual lines-writer call site still passes NO expectedToken (unchanged — no locking bypass introduced).
  var linesCall = RO.slice(RO.indexOf('DB.upsertRequestOrderAllocationDraftLines('), RO.indexOf('DB.upsertRequestOrderAllocationDraftLines(') + 400);
  ok(linesCall.indexOf('expectedToken') === -1, 'A2: manual Send lines-writer call passes NO expectedToken — UNCHANGED (no null-token locking bypass)');
  // The db-api read-before-write guard is intact: it fetches the token ONLY when expectedToken is undefined.
  ok(/payload\.expectedToken === undefined && payload\.request_allocation_draft_id/.test(DBAPI),
    'A2: db-api still fetches the token only when expectedToken is undefined (fail-closed conflict guard intact)');

  // ===================================================================================================================
  console.log('\n== FC Special Event (BATCH_ENDPOINT_REQUIRED): unlocked appendRow writer; serial loop UNCHANGED ==');
  // The FC layer-3 writer is UNLOCKED (no LockService in 14_fc_write_handlers.gs) and appends via sheet.appendRow.
  ok(GS.indexOf('LockService') === -1, 'FC writer file 14_fc_write_handlers.gs uses NO LockService (unlocked writer)');
  ok(/sheet\.appendRow\(/.test(GS), 'FC writer creates rows via sheet.appendRow (concurrent appends can race without a lock)');
  // The router\'s only LockService is the recommendation bridge — it does NOT wrap the FC upsert.
  ok(/upsertFcSpecialEvent/.test(ROUTER) && /handleUpsertFcSpecialEvent_/.test(ROUTER), 'router dispatches upsertFcSpecialEvent → handleUpsertFcSpecialEvent_ (no per-write lock wrapper)');
  // Runtime UNCHANGED: the save still writes fc_special_events serially, one await per SKU.
  ok(/for \(var k = 0; k < lines\.length; k\+\+\) \{[\s\S]*?await DB\.upsertFcSpecialEvent\(/.test(FC),
    'FC saveFcEvent STILL writes special events serially (await per SKU) — unchanged, batch deferred to F1-7M-A2-FC-SPECIAL-EVENT-BATCH-R1');

  // ===================================================================================================================
  console.log('\n== Frozen invariants re-checked (must not regress) ==');
  var FORCE = 'loadOperationDb({ force: true })';
  eq((DBAPI.split('await ' + FORCE + ';').length - 1), 2, 'writer full-reload remains 0 (db-api keeps exactly its 2 non-writer whole-DB reloads: seam fallback + debug util)');
  var APP = read('js/app.js');
  ok(APP.indexOf('loadOperationDb') === -1, 'app prime remains 0 (app.js makes no whole-DB load)');
  eq((RO.match(/loadOperationDb\(\{ force: true \}\)/g) || []).length, 1, 'canonical broad remains 0 in request-order.js (only the legacy kill-switch init branch keeps a whole-DB load)');
  ok(/Legacy broad-cache path \(kill-switch only\)/.test(RO), 'the remaining RO whole-DB load is still the documented legacy kill-switch path');

  console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
  if (fail) process.exitCode = 1;
})();
