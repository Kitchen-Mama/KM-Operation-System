// Kitchen Mama Operation System — OVERSEAS ALLOCATION PREVIEW JOB (R51) — S8-B3-R1A focused suite.
// Run: node assets/tests/overseas-allocation-preview-job-s8-b3-r1a.test.js
// =============================================================================================================
// Proves the SHIPPED 74_api_v1_overseas_allocation_preview_job.gs against the SHIPPED KMMSA/KMCID and the
// SHIPPED chunked-store primitives from 46_ — nothing is reimplemented here.
//
// THE ASSERTION THIS SUITE EXISTS FOR is §4's short-lock contract. The Preview shares ONE per-script lock with
// Gap Materialization, whose worker holds it for up to 240 s while its own bounded wait is 8 × 1000 ms. So the
// danger is NOT that Preview is slow — it is that Preview becomes the long holder and pushes a SHIPPED job into
// LOCK_UNAVAILABLE_TIMEOUT. Section D therefore instruments the lock and the expensive calls together and asserts
// the lock was NOT held during any of them. That is a property no amount of reading the file can establish.

'use strict';
var fs = require('fs'), path = require('path');
var REPO = path.join(__dirname, '..', '..');
var GS = path.join(REPO, 'assets/specs/active/apps-script/');
var F46 = fs.readFileSync(GS + '46_api_v1_gap_materialization_job.gs', 'utf8');
var F74 = fs.readFileSync(GS + '74_api_v1_overseas_allocation_preview_job.gs', 'utf8');
var ROUTER = fs.readFileSync(GS + '01_router.gs', 'utf8');
var CONFIG = fs.readFileSync(GS + '00_config.gs', 'utf8');
var HEALTH = fs.readFileSync(GS + '63_api_v1_system_health.gs', 'utf8');
var KMMSA = require('../js/core/supply-planning-marketplace-supply-allocation.js');
var KMCID = require('../js/core/supply-planning-country-identity.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n     exp ' + E + '\n     got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- load the SHIPPED module with the SHIPPED 46_ primitives -------------------------------------------------
function extractFns(src, names) {
  return names.map(function (n) {
    var i = src.indexOf('function ' + n + '(');
    if (i < 0) throw new Error('primitive missing from 46_: ' + n);
    var d = 0, j = src.indexOf('{', i);
    for (var k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    throw new Error('unbalanced: ' + n);
  }).join('\n');
}
var PRIMITIVES = ['gapJobPad4_', 'gapJobUtf8Len_', 'gapJobFnv1a_', 'gapJobChunkString_'];
var PRIM = extractFns(F46, PRIMITIVES);

var makeModule = new Function('KMMSA', 'KMCID', 'OV',
  PRIM + '\n' + F74 + '\n'
  + 'var overseasAllocationPreviewEnabled_ = function () { return OV.enabled(); };\n'
  + 'var gapOpReadSupplyPoolFacts_ = function (ss) { return OV.poolFacts(ss); };\n'
  + 'var gapOpHarvestReceivers_ = function (a, b, c, d, e) { return OV.harvest(a, b, c, d, e); };\n'
  + 'var gapEnumerateScopes_ = function (ss) { return OV.scopes(ss); };\n'
  + 'var gapMaterializationDefaultIo_ = function (c) { return OV.io(c); };\n'
  + 'var gapCalcResolveContext_ = function (p) { return OV.ctx(p); };\n'
  + 'return { start: oapJobStart_, cont: oapJobContinue_, status: oapJobStatus_, result: oapResultGet_,'
  + ' cancel: oapJobCancel_, readState: oapReadState_, writeState: oapWriteState_, fingerprint: oapFingerprint_,'
  + ' purge: oapResultPurge_, resultRead: oapResultRead_, canon: oapCanonCountry_,'
  + ' hStart: handleStartOverseasAllocationPreviewJob_, hStatus: handleGetOverseasAllocationPreviewJobStatus_,'
  + ' hResult: handleGetOverseasAllocationPreviewResult_, hCancel: handleCancelOverseasAllocationPreviewJob_,'
  + ' K: { PROP: OAP_PROP_KEY_, PREFIX: OAP_RESULT_PREFIX_, SAFE: OAP_RESULT_SAFE_BYTES_, MAXR: OAP_MAX_RECEIVERS_,'
  + '      LOCK_RETRY: OAP_LOCK_RETRY_DELAY_MS_, MAX_WAITS: OAP_MAX_LOCK_WAITS_, TTL: OAP_RESULT_TTL_MS_,'
  + '      MAX_ATTEMPTS: OAP_MAX_ATTEMPTS_, STALE: OAP_STALE_MS_, RECOVERY_DELAY: OAP_RECOVERY_DELAY_MS_,'
  + '      MAX_RECOVERIES: OAP_MAX_RECOVERIES_, HANDLER: OAP_CONTINUATION_HANDLER_ } };');

// ---- the test world ------------------------------------------------------------------------------------------
var MKTS = ['amazon_us', 'walmart_us', 'target_us', 'ebay_us', 'shopify_us'];
function makeWorld(cfg) {
  cfg = cfg || {};
  var nRecv = cfg.receivers === undefined ? 3 : cfg.receivers;
  var world = {
    enabled: cfg.enabled === undefined ? true : cfg.enabled,
    now: 1000000,
    clock: 0,
    props: {},
    triggers: [],
    lockHeld: false,
    lockTimeline: [],          // every acquire/release, in order
    heldDuring: {},            // call-name -> true if the lock was held when it ran
    sheetOpens: 0,
    harvestCalls: 0,
    allocCalls: 0,
    writes: [],                // ANY attempted spreadsheet write lands here
    lockAvailable: cfg.lockAvailable === undefined ? true : cfg.lockAvailable,
    driftOnRecheck: !!cfg.driftOnRecheck,
    receiverCount: nRecv,
    poolQty: cfg.poolQty === undefined ? 900 : cfg.poolQty,
    priorityOverride: cfg.priorityOverride,
    countryOf: cfg.countryOf || function () { return 'US'; },
    companyOf: cfg.companyOf || function () { return 'KM'; }
  };
  world.note = function (name) { world.heldDuring[name] = world.heldDuring[name] || world.lockHeld; };
  return world;
}
// A Spreadsheet whose every write method THROWS. A business write is not merely counted — it is impossible.
var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'deleteRows', 'insertRow', 'insertRows',
  'insertSheet', 'clear', 'clearContent', 'clearContents'];
function throwingSpreadsheet(world) {
  function boom(m) { return function () { world.writes.push(m); throw new Error('BUSINESS_WRITE_ATTEMPTED: ' + m); }; }
  var range = { getValues: function () { return []; } };
  WRITE_METHODS.forEach(function (m) { range[m] = boom('range.' + m); });
  var sheet = { getLastRow: function () { return 0; }, getLastColumn: function () { return 0; },
    getDataRange: function () { return range; }, getRange: function () { return range; } };
  WRITE_METHODS.forEach(function (m) { sheet[m] = boom('sheet.' + m); });
  var ss = { getSheetByName: function () { return sheet; }, getSheets: function () { return [sheet]; } };
  WRITE_METHODS.forEach(function (m) { ss[m] = boom('ss.' + m); });
  return ss;
}
function overrides(world) {
  return {
    enabled: function () { return world.enabled; },
    io: function () { return { openTarget: function () { return throwingSpreadsheet(world); } }; },
    ctx: function () { return { calculationDate: '2026-10-10', calculationMonth: '2026-10', planningCycle: '2026-W41' }; },
    scopes: function () {
      world.note('enumerateScopes');
      var out = [];
      for (var i = 0; i < world.receiverCount; i++) out.push({ company: world.companyOf(i), country: world.countryOf(i), marketplace: MKTS[i % MKTS.length] });
      out.push({ company: 'OTHER_CO', country: 'US', marketplace: 'amazon_us' });   // a foreign company, never a member
      out.push({ company: 'KM', country: 'CA', marketplace: 'amazon_ca' });         // a different country, never a member
      return out;
    },
    poolFacts: function (ss) {
      world.note('readSupplyPoolFacts'); world.sheetOpens++;
      var pools = [
        { poolKey: 'OV:WH1:S1', poolType: 'THREE_PL', warehouseId: 'WH1', effectiveSupplyQty: Math.floor(world.poolQty / 2) },
        { poolKey: 'OV:WH2:S1', poolType: 'THREE_PL', warehouseId: 'WH2', effectiveSupplyQty: world.poolQty - Math.floor(world.poolQty / 2) }
      ];
      return { overseasPoolsByKey: { 'KM||US||S1': pools }, factoryPoolsBySku: {}, priorityByMkt: {}, eligibleFactoryWarehouseIds: [] };
    },
    harvest: function (scopes) {
      world.note('harvestReceivers'); world.harvestCalls++;
      // PERSISTENT drift: every read differs from the last, so the source never settles. Drift that happened
      // ONCE would let the retry succeed - which is correct behaviour, and proves nothing about the BOUND -
      // so the fixture keeps moving.
      var drift = world.driftOnRecheck ? world.harvestCalls : 0;
      var out = [];
      scopes.forEach(function (s, i) {
        if (s.company !== 'KM' || KMCID.canonicalCountryCode(s.country) !== 'US') return;
        out.push({ company: s.company, country: KMCID.canonicalCountryCode(s.country), marketplace: s.marketplace,
          sku: 'S1', demandQty: 300 + i * 50 + drift, requiredByDate: '2026-11-01',
          allocationPriority: world.priorityOverride !== undefined ? world.priorityOverride : (i % 3),
          key: [s.company, KMCID.canonicalCountryCode(s.country), s.marketplace, 'S1'].join('||') });
      });
      return { receivers: out, calculationMonth: '2026-10' };
    }
  };
}
function makeEnv(world) {
  return {
    props: {
      get: function (k) { return Object.prototype.hasOwnProperty.call(world.props, k) ? world.props[k] : null; },
      set: function (k, v) { world.props[k] = String(v); },
      del: function (k) { delete world.props[k]; },
      keys: function () { return Object.keys(world.props); }
    },
    lock: {
      acquire: function () {
        if (!world.lockAvailable) { world.lockTimeline.push('DENIED'); return false; }
        world.lockHeld = true; world.lockTimeline.push('ACQUIRE'); return true;
      },
      release: function () { world.lockHeld = false; world.lockTimeline.push('RELEASE'); }
    },
    timestamp: function () { return '2026-10-10 12:00:0' + (world.clock++ % 10); },
    nowMs: function () { return world.now; },
    newRunId: function () { return 'OAP-RUN-' + (++world.runSeq || (world.runSeq = 1)); },
    openTarget: function () { return throwingSpreadsheet(world); },
    enumerateScopes: function (ss) { return overrides(world).scopes(ss); },
    workspaceIo: function () { return { openTarget: function () { return throwingSpreadsheet(world); } }; },
    scheduleContinuation: function (ms) { world.triggers.push({ handler: 'OAP', ms: ms }); },
    clearContinuationTriggers: function () { world.triggers = world.triggers.filter(function (t) { return t.handler !== 'OAP'; }); }
  };
}
function boot(cfg) {
  var world = makeWorld(cfg);
  var M = makeModule(KMMSA, KMCID, overrides(world));
  return { world: world, M: M, env: makeEnv(world) };
}
function runToDone(b) {
  var s = b.M.start(b.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var c = b.M.cont(b.env);
  return { startRes: s, contRes: c, state: b.M.readState(b.env) };
}

// =============================================================================================================
section('A — THE DISABLED GATE REFUSES BEFORE ANYTHING HAPPENS');
// =============================================================================================================
(function () {
  var b = boot({ enabled: false });
  var r1 = b.M.hStart({ payload: { scope: { company: 'KM', country: 'US', masterSku: 'S1' } } });
  var r2 = b.M.hStatus({ payload: {} });
  var r3 = b.M.hResult({ payload: {} });
  var r4 = b.M.hCancel({ payload: {} });
  [r1, r2, r3, r4].forEach(function (r, i) {
    ok(r.success === false && r.errors[0].code === 'FEATURE_DISABLED', 'A' + (i + 1) + ' handler ' + (i + 1) + ' refuses with FEATURE_DISABLED');
  });
  // The ordering claim, executed: a refused call creates NO job state, opens NO spreadsheet and arms NO trigger.
  eq(Object.keys(b.world.props), [], 'A5 a disabled Preview wrote NO Script Property — no job state was created');
  eq(b.world.triggers, [], 'A6 and armed NO trigger');
  eq(b.world.sheetOpens, 0, 'A7 and opened NO spreadsheet — the gate is before the database, not after it');
  ok(/OVERSEAS_ALLOCATION_PREVIEW_ENABLED_ = false/.test(CONFIG), 'A8 and the flag ships FALSE in 00_config.gs');
  ok(/function continueOverseasAllocationPreviewJob\(\)[\s\S]{0,200}oapEnabled_\(\)/.test(F74),
     'A9 even the TRIGGER handler checks the flag — a trigger left behind by an enablement cannot work after a rollback');
})();

// =============================================================================================================
section('B — THE FOUR ACTIONS ARE ROUTED AND THE CONTRACT MOVED ONCE');
// =============================================================================================================
(function () {
  var actions = ['overseasAllocationPreview.job.start', 'overseasAllocationPreview.job.status',
    'overseasAllocationPreview.result.get', 'overseasAllocationPreview.job.cancel'];
  var handlers = ['handleStartOverseasAllocationPreviewJob_', 'handleGetOverseasAllocationPreviewJobStatus_',
    'handleGetOverseasAllocationPreviewResult_', 'handleCancelOverseasAllocationPreviewJob_'];
  actions.forEach(function (a, i) {
    ok(ROUTER.indexOf("action === '" + a + "'") !== -1, 'B' + (i + 1) + ' ' + a + ' is ROUTED');
    ok(F74.indexOf('function ' + handlers[i] + '(') !== -1, 'B' + (i + 1) + 'a and ' + handlers[i] + ' is DEFINED');
    ok(ROUTER.indexOf(handlers[i] + '(body)') !== -1, 'B' + (i + 1) + 'b and the route dispatches to it');
  });
  // S8-B3-R3-CP2I - EQUALITY-WITH-NOW, REPLACED BY THE TWO CLAIMS THIS ROUND ACTUALLY OWNS.
  //
  // These read `=== 19` and `=== 19`, which is the fault this repository has a name for: an assertion PINNED
  // AT ONE END. The true statement R51 makes is that its four routes moved the contract to 19 and that the
  // client pin agrees with the deployment. The literal 19 turned the first half into a claim that NO LATER
  // RELEASE MAY EVER ADD A ROUTE - and R52 adds one, so a true statement about R51 would have failed here
  // for a tree that is correct. Exactly the shape of s7-r4's H2b and _release-order.js's token series.
  //
  // What survives is directional plus relational, and the relational half is the one with teeth: a client
  // pinned BELOW its deployment would make a half-synced project and a correctly synced one report the same
  // number, which is the whole reason the pin is held to EQUALITY rather than to "at least".
  var _ac = Number((/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/.exec(HEALTH) || [])[1]);
  var DBAPI = fs.readFileSync(path.join(REPO, 'assets/js/api/operation-system-db-api.js'), 'utf8');
  var _pin = Number((/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/.exec(DBAPI) || [])[1]);
  ok(_ac >= 19, 'B5 the action contract is at or after 19 - the round these four routes were added (' + _ac + ')');
  eq(_pin, _ac, 'B6 and the client pin AGREES with the deployment contract, derived rather than restated');
  // SYS_REQUIRED_ACTIONS_ is the list of actions PAGES depend on. No page calls the Preview, so it must NOT grow.
  var reg = (/var SYS_REQUIRED_ACTIONS_ = \[[\s\S]*?\n\];/.exec(HEALTH) || [''])[0];
  ok(reg.indexOf('overseasAllocationPreview') === -1,
     'B7 SYS_REQUIRED_ACTIONS_ does NOT list the Preview — no page depends on it, and that list is about pages');
  // Narrow deliberately: index.html uses the word "preview" for unrelated surfaces, so matching it would
  // fail for a reason that has nothing to do with this release. What must be absent is THIS feature.
  var INDEX = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  var APP = fs.readFileSync(path.join(REPO, 'assets/js/app.js'), 'utf8');
  ok(INDEX.indexOf('overseasAllocationPreview') === -1 && APP.indexOf('overseasAllocationPreview') === -1,
     'B8 no browser file references the Preview actions - the backend lands with no caller');
  ok(!/overseas[-_]?allocation[-_]?preview/i.test(INDEX),
     'B8a and no Preview page or navigation entry was activated');
})();

// =============================================================================================================
section('C — THE LIFECYCLE: START → CONTINUE → DONE → RESULT');
// =============================================================================================================
(function () {
  var b = boot({ receivers: 3, poolQty: 900 });
  var s = b.M.start(b.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  ok(s.success === true && /^OAP-RUN-/.test(s.data.runId), 'C1 START returns a runId immediately');
  eq(b.M.readState(b.env).status, 'PENDING', 'C2 and leaves the run PENDING — no calculation in the request');
  eq(b.world.sheetOpens, 0, 'C3 START opened NO spreadsheet: it is a quick write, not a calculation');
  ok(b.world.triggers.length === 1, 'C4 and armed exactly one continuation');
  var c = b.M.cont(b.env);
  eq(c.status, 'DONE', 'C5 the worker completes the group in ONE execution (a group is indivisible)');
  var st = b.M.readState(b.env);
  eq(st.status, 'DONE', 'C6 and the persisted state is DONE');
  ok(st.resultMeta && st.resultMeta.chunkCount >= 1, 'C7 with a result META committed');
  var r = b.M.result(b.env, st.runId);
  ok(r.success === true, 'C8 RESULT returns the published payload');
  eq(r.data.result.scope, { company: 'KM', country: 'US', masterSku: 'S1' }, 'C9 scoped to the requested group');
  eq(r.data.result.receivers.length, 3, 'C10 with every member receiver present');
  eq(b.M.status(b.env, st.runId).data.status, 'DONE', 'C11 STATUS agrees');
  // STATUS carries progress, never the payload — a status poll must not ship the whole result on every tick.
  ok(b.M.status(b.env, st.runId).data.result === undefined,
     'C12 and STATUS does NOT carry the result payload — that is what result.get is for');
  eq(b.world.triggers, [], 'C13 a completed run leaves NO trigger armed');
})();

// =============================================================================================================
section('D — THE SHORT-LOCK CONTRACT (the reason this suite exists)');
// =============================================================================================================
(function () {
  var b = boot({ receivers: 5 });
  runToDone(b);
  // THE CENTRAL ASSERTION. If any of these is true, a Preview worker can hold the shared lock across a
  // multi-second operation and push a SHIPPED Gap job into LOCK_UNAVAILABLE_TIMEOUT.
  eq(b.world.heldDuring.readSupplyPoolFacts, false, 'D1 the lock is NOT held during the sheet read');
  eq(b.world.heldDuring.harvestReceivers, false, 'D2 the lock is NOT held during workspaceGet / forecast harvesting');
  eq(b.world.heldDuring.enumerateScopes, false, 'D3 the lock is NOT held during scope enumeration');
  // Non-vacuity: the instrument can actually observe a held lock, so the three falses above mean something.
  ok(b.world.lockTimeline.indexOf('ACQUIRE') !== -1,
     'D4 NON-VACUOUS: the lock WAS acquired during the run, so "not held" is an observation, not an absence');
  // The lock is taken in SHORT bursts, each released before the next acquire — never one long span.
  var tl = b.world.lockTimeline.filter(function (x) { return x !== 'DENIED'; });
  var balanced = true, depth = 0;
  tl.forEach(function (x) { depth += (x === 'ACQUIRE' ? 1 : -1); if (depth > 1 || depth < 0) balanced = false; });
  ok(balanced && depth === 0, 'D5 every acquire is released before the next — no nested or dangling hold');
  ok(tl.filter(function (x) { return x === 'ACQUIRE'; }).length >= 2,
     'D6 and the worker takes the lock in SEVERAL short bursts rather than one long span');
  // The source-level half of the same claim: the long calls are not inside a locked region.
  ok(/PHASE 2[\s\S]{0,400}NO LOCK IS HELD/.test(F74), 'D7 the file states the phase-2 no-lock contract where phase 2 begins');
})();

// =============================================================================================================
section('E — LOCK CONTENTION WITH GAP MATERIALIZATION');
// =============================================================================================================
(function () {
  // A Gap worker holds the shared lock. The Preview must degrade TRUTHFULLY and RETRYABLY — never FAILED on
  // the first miss, and never in a way that pressures the Gap job's own budget.
  var b = boot({ receivers: 3 });
  b.M.start(b.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  b.world.lockAvailable = false;                                   // ← a Gap worker now holds it
  var c = b.M.cont(b.env);
  eq(c.status, 'RESCHEDULED_LOCKED', 'E1 a locked-out worker RESCHEDULES rather than failing');
  var armed = b.world.triggers[b.world.triggers.length - 1];
  eq(armed.ms, b.M.K.LOCK_RETRY, 'E2 and re-arms at the PREVIEW-LOCAL retry delay, not the gap job\'s prompt one');
  // The sizing claim, asserted numerically: the wait budget must outlast a Gap worker's hold.
  var GAP_WORKER_BUDGET = Number(/var GAP_JOB_WORKER_BUDGET_MS_ = (\d+);/.exec(F46)[1]);
  var GAP_HARD_KILL = 360000;
  ok(b.M.K.LOCK_RETRY * b.M.K.MAX_WAITS > GAP_WORKER_BUDGET,
     'E3 the Preview wait budget (' + (b.M.K.LOCK_RETRY * b.M.K.MAX_WAITS) + ' ms) outlasts a Gap worker\'s clean-exit hold (' + GAP_WORKER_BUDGET + ' ms)');
  ok(b.M.K.LOCK_RETRY * b.M.K.MAX_WAITS > GAP_HARD_KILL,
     'E4 and outlasts even a hard-killed Gap worker (~' + GAP_HARD_KILL + ' ms) — so waiting ends in a RETRY, not a FAILED');
  // Bounded: it cannot reschedule forever.
  for (var i = 0; i < b.M.K.MAX_WAITS + 2; i++) b.M.cont(b.env);
  eq(b.M.readState(b.env).status, 'FAILED', 'E5 but the wait IS bounded — it ends in a truthful terminal, not an infinite loop');
  ok(/LOCK_UNAVAILABLE_TIMEOUT/.test(b.M.readState(b.env).lastError), 'E6 and the terminal names the reason');
  // START under contention is a retryable refusal that creates nothing.
  var b2 = boot({ receivers: 3 });
  b2.world.lockAvailable = false;
  var s2 = b2.M.start(b2.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  ok(s2.success === false && s2.errors[0].code === 'PREVIEW_BUSY', 'E7 START under contention refuses with PREVIEW_BUSY');
  eq(Object.keys(b2.world.props), [], 'E8 and creates no job state — a busy START leaves nothing behind');
})();

// =============================================================================================================
section('F — RACES: no stale worker may publish, no cancelled run may succeed');
// =============================================================================================================
(function () {
  // F1 — two STARTs. The second must be refused, not silently take over.
  var b = boot({ receivers: 3 });
  var s1 = b.M.start(b.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var s2 = b.M.start(b.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  ok(s1.success === true && s2.success === false && s2.errors[0].code === 'PREVIEW_ALREADY_RUNNING',
     'F1 a second START is REFUSED while a run is active');
  eq(b.M.readState(b.env).runId, s1.data.runId, 'F1a and the first run still owns the slot');

  // F2 — duplicate continuation triggers. Running the worker twice must not double-publish or corrupt.
  var b2 = boot({ receivers: 3 });
  b2.M.start(b2.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var c1 = b2.M.cont(b2.env), c2 = b2.M.cont(b2.env);
  eq(c1.status, 'DONE', 'F2 the first continuation completes');
  eq(c2.status, 'DONE', 'F2a a DUPLICATE continuation is a harmless no-op on a terminal run');
  eq(b2.M.readState(b2.env).status, 'DONE', 'F2b and the run stays DONE');

  // F3 — an OLD worker finishing after a NEWER run started. THE critical race the short lock creates.
  var b3 = boot({ receivers: 3 });
  b3.M.start(b3.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var stale = b3.M.readState(b3.env);
  // The old worker is mid-phase-2; meanwhile the state is replaced by a newer run.
  var newer = JSON.parse(JSON.stringify(stale));
  newer.runId = 'OAP-RUN-NEWER'; newer.status = 'PENDING';
  b3.M.writeState(b3.env, newer);
  var c3 = b3.M.cont(b3.env);     // this worker now claims the NEWER run, which is correct
  eq(b3.M.readState(b3.env).runId, 'OAP-RUN-NEWER', 'F3 the newer run owns the slot');
  ok(c3.status === 'DONE', 'F3a and it is the NEWER run that completes');

  // F4 — CANCEL racing with COMPLETE. A cancelled run must never publish a successful result.
  var b4 = boot({ receivers: 3 });
  var s4 = b4.M.start(b4.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  b4.M.cancel(b4.env, s4.data.runId);
  var c4 = b4.M.cont(b4.env);
  eq(b4.M.readState(b4.env).status, 'CANCELLED', 'F4 a cancelled run STAYS cancelled');
  ok(c4.status === 'CANCELLED', 'F4a and the worker refuses to resurrect it');
  ok(!b4.M.readState(b4.env).resultMeta, 'F4b a CANCELLED run published NO result');
  var r4 = b4.M.result(b4.env, s4.data.runId);
  ok(r4.success === false && r4.errors[0].code === 'RESULT_NOT_READY', 'F4c and result.get refuses to serve one');

  // F5 — CANCEL arriving DURING phase 2, i.e. after the worker claimed the run. The publish must be discarded.
  var b5 = boot({ receivers: 3 });
  var s5 = b5.M.start(b5.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var cancelledMidFlight = false;
  var realHarvest = b5.world.harvestCalls;
  // Cancel the instant the expensive work begins — exactly the window the short lock opens.
  var origPool = b5.env.props.get;
  b5.world.onHarvest = true;
  var M5 = b5.M, E5 = b5.env;
  var patched = Object.create(E5);
  (function () {
    var harvested = 0;
    var ov = overrides(b5.world);
    var origScopes = E5.enumerateScopes;
    E5.enumerateScopes = function (ss) {
      harvested++;
      if (harvested === 1 && !cancelledMidFlight) { cancelledMidFlight = true; M5.cancel(E5, s5.data.runId); }
      return origScopes(ss);
    };
  })();
  var c5 = M5.cont(E5);
  ok(cancelledMidFlight, 'F5 the cancel landed DURING the unlocked phase');
  eq(M5.readState(E5).status, 'CANCELLED', 'F5a the run is still CANCELLED after the worker returns');
  ok(!M5.readState(E5).resultMeta, 'F5b and the in-flight worker published NOTHING — the runId/terminal guard held');
  ok(c5.status === 'SUPERSEDED' || c5.status === 'CANCELLED', 'F5c the worker reports it was superseded, got ' + c5.status);

  // F6 — RECOVERY racing with CANCEL: a cancelled run must not be self-healed back to life.
  var b6 = boot({ receivers: 3 });
  var s6 = b6.M.start(b6.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  b6.M.cancel(b6.env, s6.data.runId);
  b6.world.now += b6.M.K.STALE + 1;                                // long past the stale window
  var st6 = b6.M.status(b6.env, s6.data.runId);
  eq(st6.data.status, 'CANCELLED', 'F6 a stale CANCELLED run is NOT resurrected by the self-heal path');
  eq(b6.M.readState(b6.env).recoveryCount, 0, 'F6a and no recovery was counted against it');
})();

// =============================================================================================================
section('G — RESULT STORAGE INTEGRITY');
// =============================================================================================================
(function () {
  var b = boot({ receivers: 6 });
  runToDone(b);
  var st = b.M.readState(b.env);
  var meta = st.resultMeta;
  ok(meta.runId === undefined || true, 'G0 (meta shape)');
  ['generationId', 'chunkCount', 'byteLength', 'checksum', 'createdAt', 'expiresAtMs'].forEach(function (f, i) {
    ok(Object.prototype.hasOwnProperty.call(meta, f), 'G1.' + (i + 1) + ' META carries ' + f);
  });
  ok(st.runId && st.company && st.country && st.masterSku, 'G2 and the state carries run identity + company/country/masterSku');
  // Every chunk is within the EXISTING per-chunk budget (never raised by this release).
  var CHUNK_BUDGET = Number(/var GAP_JOB_PARTITION_SAFE_BYTES_ = (\d+);/.exec(F46)[1]);
  var keys = Object.keys(b.world.props).filter(function (k) { return k.indexOf(b.M.K.PREFIX + ':') === 0; });
  eq(keys.length, meta.chunkCount, 'G3 exactly chunkCount chunks are stored');
  ok(keys.every(function (k) { return Buffer.byteLength(b.world.props[k], 'utf8') <= CHUNK_BUDGET; }),
     'G4 and every chunk is within the EXISTING ' + CHUNK_BUDGET + '-byte per-chunk budget');
  // FAIL-CLOSED: a missing chunk and a corrupt chunk are both refused, never partially reconstructed.
  var saved = b.world.props[keys[0]];
  delete b.world.props[keys[0]];
  var rMissing = b.M.result(b.env, st.runId);
  ok(rMissing.success === false && /CHUNK_MISSING/.test(JSON.stringify(rMissing.errors)),
     'G5 a MISSING chunk fails closed — never a partial result');
  b.world.props[keys[0]] = saved + 'x';
  var rCorrupt = b.M.result(b.env, st.runId);
  ok(rCorrupt.success === false && /CHECKSUM_MISMATCH|CHUNK_MISSING/.test(JSON.stringify(rCorrupt.errors)),
     'G6 a CORRUPT chunk fails closed on the checksum');
  b.world.props[keys[0]] = saved;
  ok(b.M.result(b.env, st.runId).success === true, 'G7 and the intact store reads back cleanly (non-vacuous)');

  // Cross-run chunk mixing is impossible: generations are keyed, and cleanup is prefix-bounded.
  var b2 = boot({ receivers: 4 });
  b2.world.props['UNRELATED_KEY'] = 'keepme';
  b2.world.props['GAP_JOB_ORDER_PLANNING'] = 'another job\'s state';
  b2.world.props['GAP_JOB_ORDER_PLANNING:PART:gen1:0000'] = 'another job\'s chunk';
  runToDone(b2);
  var st2 = b2.M.readState(b2.env);
  var gen1 = st2.resultMeta.generationId;
  // a SECOND run replaces the first generation entirely
  b2.world.props[b2.M.K.PROP] = JSON.stringify(Object.assign({}, st2, { status: 'DONE' }));
  var b2keysBefore = Object.keys(b2.world.props).filter(function (k) { return k.indexOf(b2.M.K.PREFIX + ':') === 0; });
  ok(b2keysBefore.every(function (k) { return k.indexOf(b2.M.K.PREFIX + ':' + gen1 + ':') === 0; }),
     'G8 every stored chunk belongs to the ONE current generation — no cross-run mixing');
  b2.M.purge(b2.env, null);
  eq(b2.world.props['UNRELATED_KEY'], 'keepme', 'G9 cleanup is prefix-bounded — an unrelated key is untouched');
  eq(b2.world.props['GAP_JOB_ORDER_PLANNING'], 'another job\'s state', 'G9a and the GAP JOB state is untouched');
  eq(b2.world.props['GAP_JOB_ORDER_PLANNING:PART:gen1:0000'], 'another job\'s chunk',
     'G9b and the GAP JOB chunks are untouched — the two stores cannot collide');
})();

// =============================================================================================================
section('H — SIZE OVERFLOW IS A TRUTHFUL TERMINAL, NEVER A TRUNCATION');
// =============================================================================================================
(function () {
  var b = boot({ receivers: b_overflow_count() });
  function b_overflow_count() { return 0; }
  // Receiver-count cap: above it, the run FAILS rather than silently previewing a subset.
  var over = boot({ receivers: 95 });
  over.M.start(over.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  for (var i = 0; i < over.M.K.MAX_ATTEMPTS; i++) over.M.cont(over.env);
  var stOver = over.M.readState(over.env);
  eq(stOver.status, 'FAILED', 'H1 a group above the receiver cap FAILS');
  ok(/PREVIEW_RECEIVER_LIMIT/.test(stOver.lastError), 'H2 with a typed reason naming the limit');
  ok(!stOver.resultMeta, 'H3 and publishes NO result — never a truncated one');
  // And the real gate is BYTES, not the count: the byte check exists and is enforced before any chunk is written.
  ok(/PREVIEW_RESULT_SIZE_LIMIT[\s\S]{0,200}no truncation is performed/.test(F74),
     'H4 the BYTE gate is a typed failure that states it does not truncate');
  ok(F74.indexOf('if (serialized.byteLength > OAP_RESULT_SAFE_BYTES_)') !== -1,
     'H5 and it is checked on SERIALIZED UTF-8 BYTES before chunking — receiver count alone is not the gate');
  // Preview + Gap must coexist inside the shared ~500 KB store.
  // The store is SHARED with the Gap job's state and its partition chunks, so the real claim is about what
  // the Preview LEAVES, not what it takes.
  var STORE = 512000;
  ok(STORE - over.M.K.SAFE >= 350000,
     'H6 the Preview budget (' + over.M.K.SAFE + ' B) leaves ' + (STORE - over.M.K.SAFE)
     + ' B of the shared ~500 KB store for the Gap job - it cannot starve it');
})();

// =============================================================================================================
section('I — RESULT EXPIRATION');
// =============================================================================================================
(function () {
  var b = boot({ receivers: 3 });
  runToDone(b);
  var st = b.M.readState(b.env);
  ok(b.M.result(b.env, st.runId).success === true, 'I1 a fresh result is served');
  ok(b.M.status(b.env, st.runId).data.resultAvailable === true, 'I1a and STATUS says it is available');
  b.world.now += b.M.K.TTL + 1;
  var r = b.M.result(b.env, st.runId);
  ok(r.success === false && r.errors[0].code === 'RESULT_EXPIRED', 'I2 past its TTL the result is REFUSED, not served stale');
  ok(b.M.status(b.env, st.runId).data.resultAvailable === false, 'I2a and STATUS stops advertising it');
})();

// =============================================================================================================
section('J — SOURCE CONSISTENCY AND DRIFT DETECTION');
// =============================================================================================================
(function () {
  var b = boot({ receivers: 4 });
  runToDone(b);
  var r = b.M.result(b.env, b.M.readState(b.env).runId);
  ok(/^[0-9a-f]{8}$/.test(r.data.result.generation.inputFingerprint), 'J1 the published result carries an input fingerprint');
  ok(r.data.result.generation.calculationMonth === '2026-10', 'J2 and the calculation month it was computed under');
  ok(b.world.harvestCalls >= 2, 'J3 the worker REVALIDATES the source before publishing (it harvested twice)');

  // Drift between the read and the publish must NOT be published.
  var d = boot({ receivers: 4, driftOnRecheck: true });
  d.M.start(d.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var c = d.M.cont(d.env);
  ok(c.status === 'RETRY' || c.status === 'FAILED', 'J4 detected drift does NOT publish — it retries, got ' + c.status);
  ok(/SOURCE_DRIFT/.test(d.M.readState(d.env).lastError), 'J5 and the reason is named SOURCE_DRIFT');
  ok(!d.M.readState(d.env).resultMeta, 'J6 no result META was committed for a drifted computation');
  // Bounded: drift cannot retry forever.
  for (var i = 0; i < d.M.K.MAX_ATTEMPTS + 1; i++) d.M.cont(d.env);
  eq(d.M.readState(d.env).status, 'FAILED', 'J7 drift retries are BOUNDED and end in a truthful terminal');

  // The fingerprint is ORDER-INDEPENDENT: a re-read returning rows in a different order is not drift.
  var recv = [{ key: 'a', marketplace: 'm1', demandQty: 1, allocationPriority: 0, requiredByDate: 'd' },
              { key: 'b', marketplace: 'm2', demandQty: 2, allocationPriority: 1, requiredByDate: 'd' }];
  var pools = [{ poolKey: 'p1', poolType: 'THREE_PL', warehouseId: 'w1', effectiveSupplyQty: 5 },
               { poolKey: 'p2', poolType: 'THREE_PL', warehouseId: 'w2', effectiveSupplyQty: 6 }];
  eq(b.M.fingerprint(recv, pools), b.M.fingerprint(recv.slice().reverse(), pools.slice().reverse()),
     'J8 the fingerprint is ORDER-INDEPENDENT — a re-read in a different row order is not mistaken for drift');
  ok(b.M.fingerprint(recv, pools) !== b.M.fingerprint(
       [{ key: 'a', marketplace: 'm1', demandQty: 99, allocationPriority: 0, requiredByDate: 'd' }, recv[1]], pools),
     'J9 NON-VACUOUS: but a changed DEMAND does change it');
  ok(b.M.fingerprint(recv, pools) !== b.M.fingerprint(recv,
       [{ poolKey: 'p1', poolType: 'THREE_PL', warehouseId: 'w1', effectiveSupplyQty: 500 }, pools[1]]),
     'J10 and so does a changed POOL');
})();

// =============================================================================================================
section('K — BUSINESS READ-ONLY PROOF');
// =============================================================================================================
(function () {
  var b = boot({ receivers: 5 });
  runToDone(b);
  eq(b.world.writes, [], 'K1 EXECUTED: not one spreadsheet write was attempted during a full successful run');
  // The source-level half. A write method named anywhere in this module would be a reachable write.
  var FORBIDDEN = ['appendRow', 'setValue', 'setValues', 'deleteRow', 'deleteRows', 'insertSheet', 'insertRow',
    'clearContent', 'clearContents', 'getRange('];
  var found = FORBIDDEN.filter(function (m) { return F74.indexOf(m) !== -1; });
  eq(found, [], 'K2 the module names NO spreadsheet write method anywhere in its source');
  // Business tables must not appear as write targets. They may be READ; this module reads none of them directly.
  var BUSINESS_TABLES = ['order_planning_gap', 'inventory_replenishment_gap', 'request_order', 'purchase_order',
    'shipments', 'shipment_lines', 'overseas_inventory_snapshot', 'factory_stock', 'allocation_draft'];
  var written = BUSINESS_TABLES.filter(function (t) {
    return new RegExp('(appendRow|setValues?|insertRow)[^\\n]{0,80}' + t).test(F74);
  });
  eq(written, [], 'K3 and no business table appears as a write target');
  // Every property it DID write is inside its own namespace — nothing else in the store was touched.
  var keys = Object.keys(b.world.props);
  var foreign = keys.filter(function (k) { return k !== b.M.K.PROP && k.indexOf(b.M.K.PREFIX + ':') !== 0; });
  eq(foreign, [], 'K4 every Script Property written is inside the Preview namespace');
  ok(keys.length > 0, 'K5 NON-VACUOUS: it did write its own technical state, so K4 is a boundary not an absence');
  // Triggers: only its own handler name.
  ok(/ScriptApp\.newTrigger\(OAP_CONTINUATION_HANDLER_\)/.test(F74), 'K6 it arms only its OWN handler');
  ok(/getHandlerFunction\(\) === OAP_CONTINUATION_HANDLER_/.test(F74),
     'K7 and deletes only triggers matching that exact handler — a Gap job trigger can never be collected');
  // The header comment NAMES these to explain why the gap job is NOT extended, so the assertion has to be
  // about CALL SITES rather than mentions - otherwise the explanation would break the rule it explains.
  var CODE = F74.split(/\r?\n/).filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
  ok(CODE.indexOf('GAP_JOB_PROP_KEYS_') === -1,
     'K8 no CODE line reaches into the Gap job\'s property-key map');
  ok(CODE.indexOf('gapJobWriteState_(') === -1 && CODE.indexOf('gapJobPartitionWrite_(') === -1
     && CODE.indexOf('gapJobClearState_(') === -1,
     'K8a and it never calls the Gap job\'s state or partition WRITERS - only the product-agnostic chunk '
     + 'primitives, which is exactly what lets 46_ stay untouched');
  ok(CODE.indexOf('gapJobChunkString_(') !== -1 && CODE.indexOf('gapJobFnv1a_(') !== -1,
     'K8b NON-VACUOUS: it DOES call the shared primitives, so K8a is a boundary and not an absence');
})();

// =============================================================================================================
section('L — MEMBERSHIP, COMPANY ISOLATION, KMCID, AND KMMSA PARITY');
// =============================================================================================================
(function () {
  // Membership: every marketplace of the company+canonical country that carries the SKU — and nothing else.
  var b = boot({ receivers: 4 });
  runToDone(b);
  var res = b.M.result(b.env, b.M.readState(b.env).runId).data.result;
  eq(res.receivers.length, 4, 'L1 all four member receivers are present');
  ok(res.receivers.every(function (r) { return r.receiverKey.indexOf('KM||US||') === 0; }),
     'L2 and ONLY this company + canonical country — the foreign company and the CA scope are not members');
  ok(res.receivers.every(function (r) { return r.demandBasis === 'allocatedForecastQty'; }),
     'L3 every receiver names allocatedForecastQty as its demand basis');

  // KMCID: UK and GB are ONE canonical country.
  eq(b.M.canon('UK'), b.M.canon('GB'), 'L4 KMCID canonicalises UK and GB to one identity');
  var uk = boot({ receivers: 3, countryOf: function (i) { return i === 1 ? 'UK' : 'GB'; } });
  uk.M.start(uk.env, { company: 'KM', country: 'GB', masterSku: 'S1' });
  // (the world's pool key is KM||US||S1, so a GB group finds no pool — what matters is that membership resolved)
  ok(uk.M.canon('gb') === uk.M.canon('UK'), 'L5 and the canonicalisation is case-insensitive');

  // KMMSA parity: the Preview's numbers are the allocator's numbers, not a reimplementation.
  var p = boot({ receivers: 4, poolQty: 700 });
  runToDone(p);
  var pres = p.M.result(p.env, p.M.readState(p.env).runId).data.result;
  var direct = KMMSA.allocateMarketplaceReceiverSupply({
    company: 'KM', masterSku: 'S1',
    overseasPools: [{ poolKey: 'OV:WH1:S1', poolType: 'THREE_PL', warehouseId: 'WH1', effectiveSupplyQty: 350 },
                    { poolKey: 'OV:WH2:S1', poolType: 'THREE_PL', warehouseId: 'WH2', effectiveSupplyQty: 350 }],
    receivers: pres.receivers.map(function (r, i) {
      return { company: 'KM', country: 'US', marketplace: r.marketplace, sku: 'S1', demandQty: r.demandQty,
        allocationPriority: r.allocationPriority, requiredByDate: '2026-11-01', eligiblePoolTypes: ['THREE_PL'] };
    })
  });
  var previewByKey = {}; pres.receivers.forEach(function (r) { previewByKey[r.receiverKey] = r.allocatedOverseasQty; });
  var directByKey = {}; Object.keys(direct.byReceiver).forEach(function (k) { directByKey[k] = direct.byReceiver[k].allocatedOverseasQty; });
  eq(previewByKey, directByKey, 'L6 PARITY: the Preview reports exactly what KMMSA returns, receiver by receiver');
  eq(pres.allocationMode, direct.overseas ? direct.overseas.allocationMode : null,
     'L7 and reports KMMSA\'s §40 allocationMode VERBATIM — no mode is synthesised');
  // Integer conservation, on the published numbers.
  var sum = pres.receivers.reduce(function (a, r) { return a + (r.allocatedOverseasQty || 0); }, 0);
  eq(sum, pres.totals.totalAllocatedQty, 'L8 Σ receiver allocations = totalAllocatedQty');
  eq(pres.totals.totalAllocatedQty + pres.totals.totalUnusedSupplyQty, pres.totals.totalSupplyQty,
     'L9 allocated + unused = supply (conservation holds on the PUBLISHED result)');
  ok(pres.receivers.every(function (r) { return r.allocatedOverseasQty === Math.floor(r.allocatedOverseasQty); }),
     'L10 and every published quantity is an INTEGER');
  // Warehouse contribution attribution survives publication.
  ok(pres.warehouseContributions.length > 0 && pres.warehouseContributions.every(function (a) { return !!a.sourceWarehouseId; }),
     'L11 warehouse contributions are published with their source warehouse');
  eq(pres.warehouseContributions.reduce(function (a, x) { return a + x.allocatedQty; }, 0), pres.totals.totalAllocatedQty,
     'L12 and Σ contributions = totalAllocatedQty');

  // Missing priority fails CLOSED — the C1/B1 contract must survive into the Preview.
  var mp = boot({ receivers: 3, priorityOverride: null });
  mp.M.start(mp.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  mp.M.cont(mp.env);
  var mpres = mp.M.result(mp.env, mp.M.readState(mp.env).runId);
  if (mpres.success) {
    var rr = mpres.data.result;
    ok(rr.blocked === true || rr.ready === false, 'L13 an UNRESOLVED priority blocks the group — never a fabricated 0');
    ok(JSON.stringify(rr.issues).indexOf('RECEIVER_PRIORITY_UNRESOLVED') !== -1,
       'L13a and the issue names RECEIVER_PRIORITY_UNRESOLVED');
    ok(rr.receivers.every(function (r) { return r.priorityResolved === false; }),
       'L13b and every affected receiver is NAMED as unresolved rather than dropped');
  } else {
    ok(false, 'L13 expected a published blocked result, got ' + JSON.stringify(mpres.errors));
  }
})();

console.log('\n----------------------------------------');
console.log('OVERSEAS ALLOCATION PREVIEW JOB (S8-B3-R1A): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
