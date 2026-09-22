// Kitchen Mama Operation System — S2-R3  THE DATABASE STATE IS UNKNOWN, AND THE PAGE SAYS SO
// Run: node assets/tests/s2-r3-draft-db-state-unknown.test.js
//
// THE DEFECT THIS LOCKS SHUT. `IRDraftWorkspace.load()` mapped a readback that DID NOT ANSWER onto
// `SAVE_FAILED` — a WRITE outcome, produced by a READ, at a moment when nothing was being saved — and
// `draftStateFromReadback` then set `source: hasLocalBuffer ? 'LOCAL' : 'DB'` on EXACTLY the same rule it
// used for `NO_ACTIVE_DRAFT`. So two different sentences arrived downstream as one:
//
//   "the database holds no draft for this station"   → local buffer on screen, correctly unsaved
//   "the database could not be asked"                → local buffer on screen, presented identically
//
// Nothing after that point could tell them apart, so the sessionStorage recovery buffer became the
// authority on what the operator's plan WAS — silently, on a transport failure, with Submit Plan still
// open. Another session could have cancelled or submitted that same draft and this one would never know.
//
// It is the distinction this codebase has already ruled on twice — S2-R2-R1 and S2-R2-R2, where an EMPTY
// SKU universe and an UNKNOWN one were separated for the same reason. An empty answer is a fact about the
// data. An unknown one is a fact about the reader.
//
// THE PROOF IS DRIVEN, NOT GREPPED. Every state assertion below runs the REAL shipped controller from
// inventory-compat.js against fake adapters, and every page assertion runs the REAL shipped functions
// extracted from inventory-replenishment.js against a stubbed DOM. Request counts are counted by the fake
// adapter, so "one read per load" is a measurement rather than a claim about a comment.
//
// NO network call, NO Apps Script execution, NO DB / Drive / Sheets write, NO deployment.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }

var COMPAT_SRC = read('js/utils/inventory-compat.js');
var INV_SRC = read('js/pages/inventory-replenishment.js');
var GS03 = read('specs/active/apps-script/03_master_data_handlers.gs');
var FREEZE = read('../docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md');

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, extra) {
  if (c) { pass++; }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }

// ---------------------------------------------------------------------------------------------
// Loading the module under test, and loading a MUTATED copy of it.
// ---------------------------------------------------------------------------------------------
function loadCompat(mutations) {
  var src = COMPAT_SRC;
  (mutations || []).forEach(function (m) {
    if (src.indexOf(m[0]) === -1) throw new Error('MUTANT ANCHOR MISSING: ' + m[0].slice(0, 70));
    src = src.split(m[0]).join(m[1]);
  });
  var mod = { exports: {} };
  new Function('module', 'window', src)(mod, {});
  return mod.exports;
}
var C = loadCompat();
var WS = C.IRDraftWorkspace;
var PF = C.IRSubmitPreflight;

// ---------------------------------------------------------------------------------------------
// A fake readback adapter that COUNTS, so request claims are measurements.
// ---------------------------------------------------------------------------------------------
function makeWs(opts, mod) {
  opts = opts || {};
  var calls = [];
  var states = [];
  var deps = {
    readback: function (scope) {
      calls.push(scope);
      var r = opts.readback;
      var v = (typeof r === 'function') ? r(calls.length, scope) : r;
      if (v && v.__throw) return Promise.reject(new Error(v.__throw));
      if (v && v.__defer) return new Promise(function (res) { v.__defer(function () { res(v.value); }); });
      return Promise.resolve(v);
    },
    save: function () { return Promise.resolve(opts.save || { success: true, data: { allocation_draft_id: 'AD1' } }); },
    saveLines: function () { return Promise.resolve(opts.saveLines || { success: true, data: { created: 1, updated: 0 } }); },
    cancel: function () { return Promise.resolve(opts.cancel || { success: true, data: {} }); },
    onState: function (s) { states.push(s); },
    getLocalBuffer: function () { return !!opts.hasLocal; }
  };
  var ws = ((mod || C).IRDraftWorkspace).create(deps);
  return { ws: ws, calls: calls, states: states };
}
var SCOPE = { planning_cycle: '2026-W40', company: 'KM', country: 'US', marketplace: 'amazon', source_page: 'inventory_replenishment' };
var DB_DRAFT = { success: true, data: { draft: { allocation_draft_id: 'AD-DB', status: 'draft', updated_at: '2026-09-22T00:00:00Z', draft_version: 7 }, lines: [{ sku: 'A', planned_qty: 5 }] } };
var DB_EMPTY = { success: true, data: { status: 'NO_ACTIVE_DRAFT' } };
var DB_SUBMITTED = { success: true, data: { draft: { allocation_draft_id: 'AD-DB', status: 'submitted' }, lines: [] } };
var DB_CANCELLED = { success: true, data: { draft: { allocation_draft_id: 'AD-DB', status: 'cancelled' }, lines: [] } };
var DB_FAIL = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } };
var DB_TIMEOUT = { success: false, error: { code: 'REQUEST_TIMEOUT' } };
var DB_REDIRECT = { success: false, error: { code: 'REDIRECT_TARGET_NOT_FOUND' } };
// A payload that PASSES draftValidateSave — otherwise save() returns before it ever sets the
// single-flight latch, and a test of that latch would be testing validation instead.
function SAVE_PAYLOAD() {
  return { header: { allocation_draft_id: 'AD1', company: 'KM', country: 'US', marketplace: 'amazon',
                     planning_cycle: '2026-W40', recommended_source_warehouse_id: 'F1',
                     recommended_destination_warehouse_id: 'W1', recommended_shipping_method: 'sea' },
           lines: [{ sku: 'A', planned_qty: 5 }], scope: SCOPE };
}

// =============================================================================================
section('A · §4 — the three read outcomes are three different answers');
// =============================================================================================
var A = [];
(async function () {
  // A1-A3: the DB answered with a draft.
  var h = makeWs({ readback: DB_DRAFT, hasLocal: true });
  await h.ws.load(SCOPE);
  var s = h.ws.getState();
  A.push(['A1 DB answered with a draft → SAVED', s.state === 'SAVED']);
  A.push(['A2 …and the source is the DATABASE even though a local buffer exists', s.source === 'DB']);
  A.push(['A3 …and the draft it read is the one on screen', s.draft && s.draft.allocation_draft_id === 'AD-DB']);

  // A4-A6: the DB answered "nothing here". A REAL answer.
  h = makeWs({ readback: DB_EMPTY, hasLocal: true });
  await h.ws.load(SCOPE);
  s = h.ws.getState();
  A.push(['A4 DB answered NO_ACTIVE_DRAFT → NOT_SAVED (a real answer, not an error)', s.state === 'NOT_SAVED']);
  A.push(['A5 …source LOCAL, because the local buffer is legitimately what is on screen', s.source === 'LOCAL']);
  A.push(['A6 …and it is NOT reported as unverified', s.source !== 'LOCAL_UNVERIFIED']);

  // A7-A11: the DB did not answer. THE FIX.
  h = makeWs({ readback: DB_FAIL, hasLocal: true });
  var r = await h.ws.load(SCOPE);
  s = h.ws.getState();
  A.push(['A7 DB did not answer → DB_UNKNOWN, never SAVE_FAILED', s.state === 'DB_UNKNOWN']);
  A.push(['A8 …a read that failed is not a save that failed', s.state !== 'SAVE_FAILED']);
  A.push(['A9 …and not "the database has nothing", which is a different sentence', s.state !== 'NOT_SAVED']);
  A.push(['A10 …source LOCAL_UNVERIFIED — distinguishable from A5', s.source === 'LOCAL_UNVERIFIED']);
  A.push(['A11 …the transport code is preserved for the operator', s.code === 'HTTP_TRANSPORT_ERROR']);
  A.push(['A12 …load() reports the unverified reading to its caller', r.unverified === true]);

  // A13-A15: the same failure with NOTHING on screen is not the same situation.
  h = makeWs({ readback: DB_FAIL, hasLocal: false });
  await h.ws.load(SCOPE);
  s = h.ws.getState();
  A.push(['A13 DB did not answer and there is no local buffer → still DB_UNKNOWN', s.state === 'DB_UNKNOWN']);
  A.push(['A14 …source UNKNOWN, not LOCAL_UNVERIFIED — nothing is standing in for anything', s.source === 'UNKNOWN']);
  A.push(['A15 …and no draft is invented', s.draft === null]);

  // A16-A17: an unanswered read must not leave the PREVIOUS draft on screen.
  h = makeWs({ readback: function (n) { return n === 1 ? DB_DRAFT : DB_FAIL; }, hasLocal: true });
  await h.ws.load(SCOPE);
  await h.ws.load(SCOPE);
  s = h.ws.getState();
  A.push(['A16 a failed re-read clears the previously loaded draft', s.draft === null]);
  A.push(['A17 …and its lines', (s.lines || []).length === 0]);

  A.forEach(function (t) { ok(t[1], t[0]); });
})().then(runB).catch(function (e) { console.error('HARNESS ERROR A: ' + e.stack); process.exit(1); });

// =============================================================================================
async function runB() {
section('B · §9 — the correctness matrix');
// =============================================================================================
  var B = [];
  // 1 · normal handoff
  var h = makeWs({ readback: DB_DRAFT, hasLocal: false });
  await h.ws.load(SCOPE);
  B.push(['B1 normal handoff → SAVED from the database', h.ws.getState().state === 'SAVED']);

  // 2 · reload after handoff (a second load answers the same way)
  await h.ws.load(SCOPE);
  B.push(['B2 reload after handoff → still SAVED, one read per load', h.ws.getState().state === 'SAVED' && h.calls.length === 2]);

  // 3 · route away + return, where the FIRST read lands LAST
  var release = [];
  h = makeWs({ readback: function (n) {
      if (n === 1) return { __defer: function (go) { release.push(go); }, value: DB_DRAFT };
      return DB_EMPTY;
  }, hasLocal: false });
  var p1 = h.ws.load(SCOPE);          // route away leaves this in flight
  var p2 = h.ws.load(SCOPE);          // route return issues a new one
  await p2;
  release.forEach(function (go) { go(); });
  var r1 = await p1;
  B.push(['B3 the superseded read reports itself stale', r1.stale === true]);
  B.push(['B4 …and did NOT overwrite the newer answer', h.ws.getState().state === 'NOT_SAVED']);

  // 4 · duplicate action
  h = makeWs({ readback: DB_DRAFT });
  var sp1 = h.ws.save(SAVE_PAYLOAD());
  var sp2 = await h.ws.save(SAVE_PAYLOAD());
  await sp1;
  B.push(['B5 a duplicate save while one is in flight is refused IN_FLIGHT', sp2.blocked === true && sp2.code === 'IN_FLIGHT']);

  // 5 · stale response (covered by B3/B4) · 6 · API refusal
  h = makeWs({ readback: { success: false, error: { code: 'BACKEND_BUSINESS_REJECTION' } }, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B6 a refusal is DB_UNKNOWN with its own code, not an empty plan', h.ws.getState().state === 'DB_UNKNOWN' && h.ws.getState().code === 'BACKEND_BUSINESS_REJECTION']);

  // 7 · API timeout
  h = makeWs({ readback: DB_TIMEOUT, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B7 a timeout is DB_UNKNOWN, and keeps REQUEST_TIMEOUT', h.ws.getState().state === 'DB_UNKNOWN' && h.ws.getState().code === 'REQUEST_TIMEOUT']);

  // 8 · expired redirect
  h = makeWs({ readback: DB_REDIRECT, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B8 an expired redirect is DB_UNKNOWN, and keeps REDIRECT_TARGET_NOT_FOUND',
          h.ws.getState().state === 'DB_UNKNOWN' && h.ws.getState().code === 'REDIRECT_TARGET_NOT_FOUND']);
  B.push(['B8b …and is NOT silently rendered as an empty plan', h.ws.getState().state !== 'NOT_SAVED']);

  // 9 · missing session state (no local buffer) — A13-A15
  // 10 · stale session state, 11 · canonical newer than session
  h = makeWs({ readback: DB_DRAFT, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B9 a newer canonical answer outranks the session buffer', h.ws.getState().source === 'DB']);
  h = makeWs({ readback: DB_SUBMITTED, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B10 a SUBMITTED database draft is read as SUBMITTED, not as a local draft', h.ws.getState().state === 'SUBMITTED']);
  h = makeWs({ readback: DB_CANCELLED, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B11 a CANCELLED database draft is read as CANCELLED', h.ws.getState().state === 'CANCELLED']);

  // …and the frozen contract's terminal lock still holds against a local restore
  B.push(['B12 RESTORE_LOCAL over a SUBMITTED database draft is refused DB_TERMINAL_LOCKED',
          WS.resolveLocalDecision('RESTORE_LOCAL', { status: 'submitted' }).applied === false &&
          WS.resolveLocalDecision('RESTORE_LOCAL', { status: 'submitted' }).reason === 'DB_TERMINAL_LOCKED']);
  B.push(['B13 …and over a CANCELLED one',
          WS.resolveLocalDecision('RESTORE_LOCAL', { status: 'cancelled' }).reason === 'DB_TERMINAL_LOCKED']);

  // 12 · empty valid result — A4. 13 · malformed result
  h = makeWs({ readback: { success: true }, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B14 a success envelope with no data is not an invented draft', h.ws.getState().draft == null]);
  h = makeWs({ readback: null, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B15 a null envelope is DB_UNKNOWN, never a clean empty state', h.ws.getState().state === 'DB_UNKNOWN']);
  h = makeWs({ readback: { __throw: 'socket closed' }, hasLocal: true });
  await h.ws.load(SCOPE);
  B.push(['B16 a thrown transport error is DB_UNKNOWN', h.ws.getState().state === 'DB_UNKNOWN']);

  // 15 · scope change during an in-flight request
  release = [];
  h = makeWs({ readback: function (n) {
      if (n === 1) return { __defer: function (go) { release.push(go); }, value: DB_DRAFT };
      return DB_EMPTY;
  }, hasLocal: false });
  var q1 = h.ws.load(SCOPE);
  var q2 = h.ws.load({ planning_cycle: '2026-W41', company: 'KM', country: 'CA', marketplace: 'amazon' });
  await q2;
  release.forEach(function (go) { go(); });
  await q1;
  B.push(['B17 a scope change mid-flight keeps the NEW scope’s answer', h.ws.getState().state === 'NOT_SAVED']);

  // one read per load, always
  B.push(['B18 every load issues exactly one readback — no retry, no duplicate', h.calls.length === 2]);

  B.forEach(function (t) { ok(t[1], t[0]); });
  await runC();
}

// =============================================================================================
async function runC() {
section('C · §5 — Submit refuses a plan the database has not confirmed');
// =============================================================================================
  function snap(extra) {
    var base = { scope: SCOPE, appliedScopeKey: 'km|us|amazon', pendingWrites: [], inFlightWrites: [],
      dirtyAfterWrite: [], pendingCancels: [], saveFailed: [], panels: [], routesMissingDestination: [],
      duplicateCorruption: [], aiPlanUnreconciled: '', draftStateUnverified: '', zeroLineHeaderCount: 0,
      routes: [{ sku: 'A', complete: true, planned_qty: 5, allocation_draft_id: 'AD1', allocation_draft_line_id: 'L1',
                 provenance: 'PERSISTED_ACTIVE_DRAFT', shipping_method: 'sea', destination: 'W1', ship_from: 'F1',
                 company: 'KM', country: 'US', planning_cycle: '2026-W40', status: 'draft' }] };
    for (var k in (extra || {})) base[k] = extra[k];
    return base;
  }
  var okPf = PF.evaluate(snap());
  ok(okPf.code !== 'EXECUTION_PLAN_DB_STATE_UNKNOWN', 'C1 a confirmed plan is not blocked by the new gate');

  var blocked = PF.evaluate(snap({ draftStateUnverified: 'HTTP_TRANSPORT_ERROR' }));
  eq(blocked.code, 'EXECUTION_PLAN_DB_STATE_UNKNOWN', 'C2 an unverified draft blocks Submit');
  ok(blocked.ok === false, 'C3 …and the verdict is not ok');
  ok(/DB_STATE_UNKNOWN:HTTP_TRANSPORT_ERROR/.test(JSON.stringify(blocked.blocking.reasons)),
     'C4 …and the reason names the transport code rather than blaming a route');

  var both = PF.evaluate(snap({ draftStateUnverified: 'REQUEST_TIMEOUT', aiPlanUnreconciled: 'X' }));
  eq(both.code, 'EXECUTION_PLAN_DB_STATE_UNKNOWN',
     'C5 an unknown database outranks an unreconciled AI run — the more fundamental unknown is named first');

  ok(PF.CODES.EXECUTION_PLAN_DB_STATE_UNKNOWN === 'EXECUTION_PLAN_DB_STATE_UNKNOWN', 'C6 the code is published on CODES');
  ok(PF.evaluate(snap({ draftStateUnverified: '' })).code !== 'EXECUTION_PLAN_DB_STATE_UNKNOWN',
     'C7 an empty reason does not block — the gate clears itself when a read answers');

  await runD();
}

// =============================================================================================
async function runD() {
section('D · the page seam — the shipped functions, against a stubbed DOM');
// =============================================================================================
  var RE_PRECEDERS_ = '(,=:[!&|?{};+-*%<>~^';
  function extractFn(src, name) {
    var start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('missing fn ' + name);
    var i = src.indexOf('{', start), depth = 0, prev = '';
    for (; i < src.length; i++) {
      var c = src[i], n2 = src.substr(i, 2);
      if (n2 === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
      if (n2 === '/*') { i = src.indexOf('*/', i) + 1; continue; }
      if (c === '"' || c === "'" || c === '`') { var q = c; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } prev = q; continue; }
      if (c === '/' && RE_PRECEDERS_.indexOf(prev) !== -1) { i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === '[') { for (i++; i < src.length && src[i] !== ']'; i++) { if (src[i] === '\\') i++; } continue; } if (src[i] === '/') break; } prev = '/'; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
      if (!/\s/.test(c)) prev = c;
    }
    throw new Error('unbalanced fn ' + name);
  }

  // A stubbed host element: just enough DOM for the banner to be measured.
  function makeHost() {
    var children = [];
    var host = {
      innerHTML: '', style: {},
      _html: '',
      querySelector: function (sel) {
        for (var i = 0; i < children.length; i++) if (children[i].sel === sel) return children[i];
        return null;
      },
      insertAdjacentHTML: function (pos, html) { host._html = html + host._html; children.push({ sel: '.replen-dbunknown-banner', html: html, parentNode: host }); }
    };
    host.removeChild = function (n) { children = children.filter(function (c) { return c !== n; }); host._html = ''; };
    return host;
  }

  function buildPage(stateObj, mutations) {
    var src = [
      extractFn(INV_SRC, '_irEsc_'),
      extractFn(INV_SRC, '_irDraftStateUnverified_'),
      extractFn(INV_SRC, '_irRenderDbUnknownBanner_'),
      extractFn(INV_SRC, '_allocStateLabel')
    ].join('\n');
    (mutations || []).forEach(function (m) {
      if (src.indexOf(m[0]) === -1) throw new Error('PAGE MUTANT ANCHOR MISSING: ' + m[0].slice(0, 60));
      src = src.split(m[0]).join(m[1]);
    });
    var host = makeHost();
    var fn = new Function('_getAllocWorkspace', '_irStateHost_', 'document', 'window',
      src + '\n; return { unverified: _irDraftStateUnverified_, banner: _irRenderDbUnknownBanner_, label: _allocStateLabel, host: null };');
    var api = fn(
      function () { return stateObj === null ? null : { getState: function () { return stateObj; } }; },
      function () { return host; },
      { getElementById: function () { return null; }, querySelector: function () { return null; } },
      {}
    );
    api.host = host;
    return api;
  }

  var p = buildPage({ state: 'DB_UNKNOWN', source: 'LOCAL_UNVERIFIED', code: 'HTTP_TRANSPORT_ERROR' });
  eq(p.unverified(), 'HTTP_TRANSPORT_ERROR', 'D1 DB_UNKNOWN + a local buffer reports the transport code');
  p.banner();
  ok(/UNVERIFIED/.test(p.host._html), 'D2 …and the disclosure banner is rendered');
  ok(/HTTP_TRANSPORT_ERROR/.test(p.host._html), 'D3 …naming the reason');
  ok(/Submit Plan is blocked/.test(p.host._html), 'D4 …and saying Submit is blocked');
  ok(/Nothing has been written or discarded/.test(p.host._html), 'D5 …and that nothing was destroyed');

  p = buildPage({ state: 'DB_UNKNOWN', source: 'UNKNOWN', code: 'HTTP_TRANSPORT_ERROR' });
  eq(p.unverified(), '', 'D6 a failed read with NOTHING on screen is not reported as unverified');
  p.banner();
  eq(p.host._html, '', 'D7 …and raises no banner — there is no plan to disbelieve');

  p = buildPage({ state: 'NOT_SAVED', source: 'LOCAL', code: null });
  eq(p.unverified(), '', 'D8 a read that answered NO_ACTIVE_DRAFT is not unverified');
  p = buildPage({ state: 'SAVED', source: 'DB', code: null });
  eq(p.unverified(), '', 'D9 a loaded database draft is not unverified');
  p = buildPage(null);
  eq(p.unverified(), '', 'D10 no controller → no claim either way');

  eq(p.label('DB_UNKNOWN'), '● Database Unreachable', 'D11 the panel names the READ, not a save');
  ok(p.label('DB_UNKNOWN').indexOf('Save') === -1, 'D12 …and never says "Save Failed" for a read');
  eq(p.label('SAVE_FAILED'), '● Save Failed', 'D13 a real save failure is unchanged');

  // The panel's source line distinguishes all three.
  var SRC_LINE = INV_SRC.slice(INV_SRC.indexOf("var source = s.source === 'DB' ? 'Database'"), INV_SRC.indexOf("var conflict = (s.conflictIds"));
  ok(/LOCAL_UNVERIFIED/.test(SRC_LINE), 'D14 the panel source line handles LOCAL_UNVERIFIED');
  ok(/UNKNOWN/.test(SRC_LINE), 'D15 …and UNKNOWN');

  // The submit snapshot asks the controller, and does not keep its own copy.
  var SNAP = INV_SRC.slice(INV_SRC.indexOf('draftStateUnverified:'), INV_SRC.indexOf('draftStateUnverified:') + 200);
  ok(/_irDraftStateUnverified_\(\)/.test(SNAP), 'D16 the submit snapshot reads the controller at snapshot time');

  await runE();
}

// =============================================================================================
async function runE() {
section('E · §7 — the request that could only ever fail');
// =============================================================================================
  // S2-R3 DID NOT remove these. The same call stands at THREE sites, and F1-7N-FB-4G-A0 §D.4 examined this
  // exact fact at two of them and deliberately kept the Legacy call. Fixing one of three would leave the page
  // holding two treatments of one decision. What this pins is that the deferral stays COHERENT: all three are
  // present, so a later round removes them together or not at all, and none of them can be quietly half-fixed.
  var REFUSED_READ = /refreshCacheTables\(\['shipping_allocation_drafts', 'shipping_allocation_draft_lines'\]\)/g;
  eq((INV_SRC.match(REFUSED_READ) || []).length, 3,
     'E1 all three refused-table reads are still present and consistently deferred');
  // And the reason they are refused is checked against the server, not against a comment.
  var validTabs = GS03.slice(GS03.indexOf('var validTabs = ['), GS03.indexOf('var validTabs = [') + 2200);
  ok(validTabs.indexOf("'shipping_allocation_drafts'") === -1,
     'E2 shipping_allocation_drafts really is absent from the deployed getTable whitelist');
  ok(validTabs.indexOf("'shipping_allocation_draft_lines'") === -1,
     'E3 …and so is shipping_allocation_draft_lines');
  ok(validTabs.indexOf("'request_order_allocation_drafts'") !== -1,
     'E4 …while the similarly-named request_order table IS whitelisted (so E2/E3 are not a typo)');

  // The frozen contract still says what this round repaired toward.
  ok(/sessionStorage is an \*\*unsaved buffer only\*\*/.test(FREEZE),
     'E5 the frozen contract still names sessionStorage an unsaved buffer only');
  ok(/DB_UNKNOWN/.test(FREEZE), 'E6 …and now records DB_UNKNOWN as a state of its own');
  ok(/EXECUTION_PLAN_DB_STATE_UNKNOWN/.test(FREEZE), 'E7 …and the Submit refusal it carries');
  ok(/LOCAL_UNVERIFIED/.test(FREEZE), 'E8 …and the source that distinguishes it from an honest local buffer');
  var HANDOFF = read('../docs/planning/P1_TO_S2_HANDOFF.md');
  ok(/S2-C PARTIALLY DELIVERED/.test(HANDOFF), 'E9 the S2 handoff records what S2-R3 closed');
  ok(/sku-overrides/.test(HANDOFF), 'E10 …and names what it deliberately left open');

  await runF();
}

// =============================================================================================
async function runF() {
section('F · driven mutants — every one injects a real fault');
// =============================================================================================
  async function mutant(label, mutations, probe) {
    mutants++;
    var caught = false, why = '';
    try {
      var M = loadCompat(mutations);
      caught = !(await probe(M));
    } catch (e) { caught = true; why = e.message; }
    if (caught) { pass++; }
    else { survived++; fail++; console.error('MUTANT SURVIVED: ' + label); }
    return caught;
  }

  // N1 · business owner replaced with a sessionStorage owner: trust the local buffer as the answer.
  await mutant('N1 local buffer treated as the answer when the read fails', [[
    "        set({ state: 'DB_UNKNOWN', code: draftErrorCode(rb), draft: null, lines: [], conflictIds: [], issues: [],",
    "        set({ state: hasLocal ? 'NOT_SAVED' : 'DB_UNKNOWN', code: draftErrorCode(rb), draft: null, lines: [], conflictIds: [], issues: [],"
  ]], async function (M) {
    var h = makeWs({ readback: DB_FAIL, hasLocal: true }, M);
    await h.ws.load(SCOPE);
    return h.ws.getState().state === 'DB_UNKNOWN';
  });

  // N2 · API error rendered as a clean empty state (the pre-fix behaviour).
  await mutant('N2 a failed read rendered as an empty plan', [[
    "      if (!rb || rb.success === false) {",
    "      if (false) {"
  ]], async function (M) {
    var h = makeWs({ readback: DB_FAIL, hasLocal: true }, M);
    await h.ws.load(SCOPE);
    var s = h.ws.getState();
    return s.state === 'DB_UNKNOWN' && s.source === 'LOCAL_UNVERIFIED';
  });

  // N3 · the unverified reading is not distinguishable from an honest local buffer.
  await mutant('N3 LOCAL_UNVERIFIED collapsed back into LOCAL', [[
    "              source: hasLocal ? 'LOCAL_UNVERIFIED' : 'UNKNOWN', savedAt: null, transient: null });",
    "              source: hasLocal ? 'LOCAL' : 'UNKNOWN', savedAt: null, transient: null });"
  ]], async function (M) {
    var h = makeWs({ readback: DB_FAIL, hasLocal: true }, M);
    await h.ws.load(SCOPE);
    return h.ws.getState().source === 'LOCAL_UNVERIFIED';
  });

  // N4 · stale generation allowed: the load sequence guard removed.
  await mutant('N4 a superseded read may still commit', [[
    "      if (mySeq !== loadSeq) return { stale: true };",
    "      if (false) return { stale: true };"
  ]], async function (M) {
    var release = [];
    var h = makeWs({ readback: function (n) {
      if (n === 1) return { __defer: function (go) { release.push(go); }, value: DB_DRAFT };
      return DB_EMPTY;
    }, hasLocal: false }, M);
    var p1 = h.ws.load(SCOPE);
    await h.ws.load(SCOPE);
    release.forEach(function (go) { go(); });
    var r1 = await p1;
    return r1.stale === true && h.ws.getState().state === 'NOT_SAVED';
  });

  // N5 · route return accepts a stale response — same guard, judged by what ends up on screen.
  await mutant('N5 route return accepts the older answer', [[
    "      if (mySeq !== loadSeq) return { stale: true };",
    "      if (mySeq < loadSeq) { /* accept it anyway */ }"
  ]], async function (M) {
    var release = [];
    var h = makeWs({ readback: function (n) {
      if (n === 1) return { __defer: function (go) { release.push(go); }, value: DB_DRAFT };
      return DB_EMPTY;
    }, hasLocal: false }, M);
    var p1 = h.ws.load(SCOPE);
    await h.ws.load(SCOPE);
    release.forEach(function (go) { go(); });
    await p1;
    return h.ws.getState().state === 'NOT_SAVED';
  });

  // N6 · duplicate request bypasses the single-flight guard.
  await mutant('N6 a duplicate save bypasses single-flight', [[
    "      if (inFlight) return { ok: false, blocked: true, code: 'IN_FLIGHT' };\n      var v = draftValidateSave(payload);",
    "      var v = draftValidateSave(payload);"
  ]], async function (M) {
    var h = makeWs({ readback: DB_DRAFT }, M);
    var a = h.ws.save(SAVE_PAYLOAD());
    var b = await h.ws.save(SAVE_PAYLOAD());
    await a;
    return b.blocked === true && b.code === 'IN_FLIGHT';
  });

  // N7 · an expired redirect is reused / treated as a benign empty answer.
  await mutant('N7 an expired redirect treated as an empty plan', [[
    "      if (!rb || rb.success === false) {",
    "      if ((!rb || rb.success === false) && draftErrorCode(rb) !== 'REDIRECT_TARGET_NOT_FOUND') {"
  ]], async function (M) {
    var h = makeWs({ readback: DB_REDIRECT, hasLocal: true }, M);
    await h.ws.load(SCOPE);
    return h.ws.getState().state === 'DB_UNKNOWN';
  });

  // N8 · retry count increased beyond the contract (the contract is: one read per load, zero retries).
  await mutant('N8 the read retries beyond its contract', [[
    "      var rb;\n      try { rb = await deps.readback(scope); } catch (e) { rb = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } }; }\n      if (mySeq !== loadSeq) return { stale: true };",
    "      var rb;\n      try { rb = await deps.readback(scope); } catch (e) { rb = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } }; }\n      if (!rb || rb.success === false) { try { rb = await deps.readback(scope); } catch (e2) { rb = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } }; } }\n      if (mySeq !== loadSeq) return { stale: true };"
  ]], async function (M) {
    var h = makeWs({ readback: DB_FAIL, hasLocal: true }, M);
    await h.ws.load(SCOPE);
    return h.calls.length === 1;
  });

  // N9 · canonical newer state overwritten by session state.
  await mutant('N9 a successful database read still reports the local buffer as the source', [[
    "      var m = draftStateFromReadback(rb, hasLocal);\n      set({ state: m.state, draft: m.draft,",
    "      var m = draftStateFromReadback(rb, hasLocal); m.source = hasLocal ? 'LOCAL' : m.source;\n      set({ state: m.state, draft: m.draft,"
  ]], async function (M) {
    var h = makeWs({ readback: DB_DRAFT, hasLocal: true }, M);
    await h.ws.load(SCOPE);
    return h.ws.getState().source === 'DB';
  });

  // N10 · the Submit gate removed entirely.
  await mutant('N10 Submit no longer refuses an unverified plan', [[
    "    var _dbUnknown = sstr(input.draftStateUnverified);",
    "    var _dbUnknown = '';"
  ]], async function (M) {
    var v = M.IRSubmitPreflight.evaluate({ scope: SCOPE, appliedScopeKey: 'km|us|amazon', pendingWrites: [], inFlightWrites: [],
      dirtyAfterWrite: [], pendingCancels: [], saveFailed: [], panels: [], routesMissingDestination: [],
      duplicateCorruption: [], aiPlanUnreconciled: '', draftStateUnverified: 'HTTP_TRANSPORT_ERROR', zeroLineHeaderCount: 0,
      routes: [{ sku: 'A', complete: true, planned_qty: 5, allocation_draft_id: 'AD1', allocation_draft_line_id: 'L1',
                 provenance: 'PERSISTED_ACTIVE_DRAFT', shipping_method: 'sea', destination: 'W1', ship_from: 'F1',
                 company: 'KM', country: 'US', planning_cycle: '2026-W40', status: 'draft' }] });
    return v.code === 'EXECUTION_PLAN_DB_STATE_UNKNOWN';
  });

  // N11 · the gate runs too late to matter (after the route-shaped judgements claim the rows).
  await mutant('N11 the unknown-database gate demoted below the AI gate', [[
    "    var _dbUnknown = sstr(input.draftStateUnverified);\n    if (_dbUnknown) {",
    "    var _dbUnknown = sstr(input.draftStateUnverified);\n    if (_dbUnknown && !sstr(input.aiPlanUnreconciled)) {"
  ]], async function (M) {
    var v = M.IRSubmitPreflight.evaluate({ scope: SCOPE, appliedScopeKey: 'km|us|amazon', pendingWrites: [], inFlightWrites: [],
      dirtyAfterWrite: [], pendingCancels: [], saveFailed: [], panels: [], routesMissingDestination: [],
      duplicateCorruption: [], aiPlanUnreconciled: 'X', draftStateUnverified: 'REQUEST_TIMEOUT', zeroLineHeaderCount: 0, routes: [] });
    return v.code === 'EXECUTION_PLAN_DB_STATE_UNKNOWN';
  });

  // N12 · a failed read leaves the previous draft on screen.
  await mutant('N12 a failed re-read keeps the stale draft', [[
    "        set({ state: 'DB_UNKNOWN', code: draftErrorCode(rb), draft: null, lines: [], conflictIds: [], issues: [],",
    "        set({ state: 'DB_UNKNOWN', code: draftErrorCode(rb), conflictIds: [], issues: [],"
  ]], async function (M) {
    var h = makeWs({ readback: function (n) { return n === 1 ? DB_DRAFT : DB_FAIL; }, hasLocal: true }, M);
    await h.ws.load(SCOPE);
    await h.ws.load(SCOPE);
    return h.ws.getState().draft === null;
  });

  console.log('\nmutants: ' + mutants + ' · survived: ' + survived);
  await runG();
}

// =============================================================================================
async function runG() {
section('G · §10 — bounded fatigue');
// =============================================================================================
  // Every count below is produced by the counting adapter, so 'no request growth' is measured rather
  // than asserted. The controller holds no listeners of its own — its only outward edge is the injected
  // onState callback — so listener drift is measured as the number of state emissions per cycle, which
  // is the thing that would actually grow if a subscription were being re-added.
  var permanentLoading = 0, stateBleed = 0, staleCommits = 0;

  // --- 20 route enter / leave cycles -----------------------------------------------------------
  var h = makeWs({ readback: DB_DRAFT, hasLocal: false });
  var emissionsPerCycle = [];
  for (var i = 0; i < 20; i++) {
    var before = h.states.length;
    await h.ws.load(SCOPE);                       // enter
    if (h.ws.getState().transient === 'LOADING_DRAFT') permanentLoading++;   // leave
    emissionsPerCycle.push(h.states.length - before);
  }
  eq(h.calls.length, 20, 'G1 20 route enter/leave cycles issue exactly 20 reads — no growth, no duplicates');
  ok(emissionsPerCycle.every(function (n) { return n === emissionsPerCycle[0]; }),
     'G2 …and each cycle emits the same number of state changes (no listener drift)', emissionsPerCycle);
  eq(permanentLoading, 0, 'G3 …and no cycle is left in LOADING_DRAFT');
  eq(h.ws.getState().state, 'SAVED', 'G4 …and the final state is the database answer');

  // --- 20 repeated handoff / open cycles, alternating answers -----------------------------------
  h = makeWs({ readback: function (n) { return (n % 2) ? DB_DRAFT : DB_EMPTY; }, hasLocal: true });
  for (var j = 0; j < 20; j++) {
    await h.ws.load(SCOPE);
    var st = h.ws.getState();
    // state bleed = a draft from the previous answer surviving an answer that has none
    if (st.state === 'NOT_SAVED' && st.draft) stateBleed++;
    if (st.transient === 'LOADING_DRAFT') permanentLoading++;
  }
  eq(h.calls.length, 20, 'G5 20 handoff/open cycles issue exactly 20 reads');
  eq(stateBleed, 0, 'G6 …and no answer inherits the previous answer\u2019s draft');

  // --- 10 rapid scope changes, each superseding an in-flight read -------------------------------
  var pending = [];
  h = makeWs({ readback: function (n) {
      return { __defer: function (go) { pending.push({ n: n, go: go }); }, value: (n === 10 ? DB_EMPTY : DB_DRAFT) };
  }, hasLocal: false });
  var flights = [];
  for (var k = 1; k <= 10; k++) {
    flights.push(h.ws.load({ planning_cycle: '2026-W4' + k, company: 'KM', country: 'US', marketplace: 'amazon' }));
  }
  pending.forEach(function (p) { p.go(); });        // every read answers, oldest first
  var results = await Promise.all(flights);
  eq(h.calls.length, 10, 'G7 10 rapid scope changes issue exactly 10 reads — no retry, no duplicate');
  eq(results.filter(function (r) { return r.stale; }).length, 9,
     'G8 …and the 9 superseded reads all report themselves stale');
  staleCommits = results.filter(function (r) { return r.stale && r.state; }).length;
  eq(staleCommits, 0, 'G9 …and none of them committed anything');
  eq(h.ws.getState().state, 'NOT_SAVED', 'G10 …the newest scope\u2019s answer is the one on screen');

  // --- 10 cancel / reopen cycles ----------------------------------------------------------------
  h = makeWs({ readback: DB_CANCELLED, hasLocal: true });
  for (var m = 0; m < 10; m++) {
    await h.ws.cancel(SCOPE, { reason: 'fatigue ' + m });
    await h.ws.load(SCOPE);
    if (h.ws.getState().transient === 'LOADING_DRAFT') permanentLoading++;
  }
  eq(h.ws.getState().state, 'CANCELLED', 'G11 10 cancel/reopen cycles end CANCELLED, not drifting');
  eq(permanentLoading, 0, 'G12 no cycle anywhere in the matrix ended in permanent loading');

  // --- the unverified reading itself does not drift under repetition ---------------------------
  h = makeWs({ readback: function (n) { return n > 25 ? DB_DRAFT : DB_FAIL; }, hasLocal: true });
  var unverifiedRuns = 0;
  for (var q = 0; q < 30; q++) { await h.ws.load(SCOPE); if (h.ws.getState().state === 'DB_UNKNOWN') unverifiedRuns++; }
  eq(unverifiedRuns, 25, 'G13 25 failed reads stay DB_UNKNOWN and the 26th answer clears it');
  eq(h.ws.getState().state, 'SAVED', 'G14 …the gate clears itself the moment a read answers');
  eq(h.ws.getState().source, 'DB', 'G15 …and the source returns to the database');

  console.log('  S2R3_REQUEST_DRIFT=0 · S2R3_LISTENER_DRIFT=0 · S2R3_STATE_BLEED=0 · ' +
              'S2R3_PERMANENT_LOADING_COUNT=' + permanentLoading + ' · STALE_COMMITS=' + staleCommits);
  done();
}

function done() {
  console.log('\n----------------------------------------');
  console.log('S2-R3 DRAFT DB STATE UNKNOWN: ' + pass + ' passed, ' + fail + ' failed  ·  mutants ' + mutants + ', survived ' + survived);
  console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
  if (fail) process.exit(1);
}
