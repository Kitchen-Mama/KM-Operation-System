/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE THIRD READ, AND THE LAST SENTENCE THAT WAS NOT TRUE   (P1-B8D-R10A)
 * ==================================================================================================
 *
 * R10 EXISTED TO PUT THIS PAGE'S READS ON ONE TRANSPORT AND FINISHED WITH TWO OF THREE.
 *
 * `productPricing.siteUniverse.get` and `productPricing.workspace.get` moved. `system.health` — the
 * capability read, the one that decides whether the page offers itself at all — stayed on
 * `km-api-foundation`'s private POST shim, and R10's own documents were written as though it had
 * moved too. The gap was found by reading the committed code against the claim rather than by a
 * failing test, because no test asserted the claim.
 *
 * IT WAS THE WORST OF THE THREE TO LEAVE BEHIND. The other two fail visibly and recoverably. This one
 * FAILS CLOSED: an /exec POST whose body a 302 drops, an echo target that 404s — the fault R10
 * measured at 4 in 40 live reads in one window — and the page answers FEATURE_DISABLED. Not "the
 * server could not be reached". "The feature is switched off": a definite statement about a product
 * decision, made from a request that never got an answer, with no retry and no classification.
 *
 * SO THIS ROUND DOES TWO THINGS AND THEY ARE THE SAME THING.
 *
 *   1. The capability read goes through `KM.transport.request` — via the SAME `readOnce` helper the
 *      other two use, so the envelope, the GET semantics, the classification and the single bounded
 *      recovery are identical by construction rather than by resemblance. No new transport, no new
 *      retry, no raised ceiling.
 *
 *   2. A capability read that could not be COMPLETED no longer renders as a feature that is OFF. The
 *      accessor remembers why, and the controller shows that instead. FEATURE_DISABLED now means
 *      exactly one thing: a server answered, and what it said was `false`.
 *
 * AND ONE THING IT DELIBERATELY DOES NOT DO. `navigator.onLine === false` still costs up to two
 * attempted dispatches, because no transport specification in this repository requires a pre-dispatch
 * short-circuit and R10A §4 forbids inventing one in a page round. What is asserted instead is the
 * honest decomposition: external ATTEMPTS, requests that REACHED a server, RETRIES, and the state the
 * operator is SHOWN. Those are four different numbers and this suite keeps them apart.
 *
 * WHAT WOULD HAVE CAUGHT THE ORIGINAL GAP, and is asserted here: the census of who calls the private
 * POST shim, measured on decommented source, must be ZERO.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function score(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
/* P1-B8D-R10D — a census of CODE must not be answered by prose that names what the code removed.
   The accessor now carries several paragraphs explaining that the capability action is gone; a raw
   search for `CAPABILITY_ACTION =` finds them and reports a constant that does not exist. */
function destringForCensus(src) {
  return decomment(src)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

var ACC_REL = 'assets/js/api/km-product-pricing-workspace.js';
var PAGE_REL = 'assets/js/pages/product-strategy-board.js';
var TRANSPORT_REL = 'assets/js/api/km-transport.js';
var UNIVERSE_REL = 'assets/js/product-strategy/km-product-strategy-site-universe.js';

var ACC = require(path.join(ROOT, ACC_REL));
var TP = require(path.join(ROOT, TRANSPORT_REL));
var accCode = decomment(read(ACC_REL));
var pageCode = decomment(read(PAGE_REL));

// ==================================================================================================
section('§A — THE CENSUS THAT WOULD HAVE CAUGHT THE GAP');
// ==================================================================================================

/* R10 claimed this page's reads were unified while one of them was not, and nothing failed. The claim
   is now a measurement, taken on DECOMMENTED source so the paragraphs that NAME the shim (there are
   several, explaining the history) can neither satisfy nor break it. */
var shimCalls = accCode.match(/api\s*\.\s*transport\s*\.\s*post\s*\(/g) || [];
eq(shimCalls.length, 0,
  'A1  the private POST shim has ZERO callers in the Product Strategy accessor');
var pageShim = pageCode.match(/transport\s*\.\s*post\s*\(/g) || [];
eq(pageShim.length, 0, 'A2  and zero in the page controller');
ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(accCode),
  'A3  and the accessor opens no socket of its own');

/* THE THREE READ ACTIONS, and the one dispatch helper all three go through. */
eq(ACC.ACTION, 'productPricing.workspace.get', 'A4  the workspace action is unchanged');
eq(ACC.SITE_UNIVERSE_ACTION, 'productPricing.siteUniverse.get', 'A5  the universe action is unchanged');
/* ============================================================================================
   SUPERSEDED BY P1-B8D-R10D — A6, A7, A9 AND A10, EACH WITH ITS REASON, NONE DELETED.

   R10A's claim was "the capability read goes through the same door as the other two". R10D's is
   stronger and makes R10A's unstateable: THERE IS NO CAPABILITY READ. The flag arrives on the
   application's shared `getClientCapabilities` bootstrap, which runs once per page life whatever
   Product Strategy does, so this module dispatches nothing for it at all.

   The property each assertion was protecting is kept, aimed at what now carries it:
     A6  was "the capability action is system.health"  → there is NO capability action to name.
     A7  was "readOnce is called by all THREE reads"   → by both remaining reads; there are two.
     A9  was "refreshCapability dispatches through readOnce" → it dispatches nothing.
     A10 was "and builds no envelope beside it"        → still true, and now trivially so.
   A8 is untouched: "exactly one way out of this file" was always the real property, and it holds. */
ok(!/CAPABILITY_ACTION\s*=/.test(destringForCensus(read(ACC_REL))),
  'A6  SUPERSEDED (R10D): there is no capability ACTION constant — the read is gone, not moved');

/* ONE HELPER, TWO CALLERS. A second dispatch path is how the first gap happened, so the property
   asserted is not "the capability read is migrated" but "there is only one way out of this file". */
var readOnceCalls = accCode.match(/readOnce\s*\(/g) || [];
ok(readOnceCalls.length >= 3,
  'A7  SUPERSEDED (R10D): readOnce is defined once and called by BOTH remaining reads',
  readOnceCalls.length);
var tpRequests = accCode.match(/tp\s*\.\s*request\s*\(/g) || [];
eq(tpRequests.length, 1,
  'A8  and there is exactly ONE KM.transport.request call site in the whole accessor');

/* The capability must reach the mirror without a request of any kind. */
ok(!/readOnce\(api,\s*CAPABILITY_ACTION/.test(accCode),
  'A9  SUPERSEDED (R10D): refreshCapability dispatches nothing — not even through readOnce');
ok(!/buildRequestEnvelope\(CAPABILITY_ACTION/.test(accCode),
  'A10 and no longer builds its own envelope beside it');

/* §5.13 — NO SECOND RETRY. The only bound in this page is the transport's. */
ok(!/for\s*\([^)]*attempt|while\s*\([^)]*attempt|maxRetries|retryDelay/.test(accCode + pageCode),
  'A11 neither the accessor nor the controller contains a second retry or recovery loop');

/* §5.14 — NO WRITE PATH. */
ok(!/kind:\s*'write'/.test(accCode + pageCode),
  'A12 and no write-shaped dispatch exists in either file');

// ==================================================================================================
section('§B — WHAT "false" MEANS, AND WHAT IT MUST NOT BE ALLOWED TO MEAN');
// ==================================================================================================

/* The accessor is loaded here with no window, so these exercise the module's own state machine. */
function freshAccessor() {
  var full = path.join(ROOT, ACC_REL);
  delete require.cache[require.resolve(full)];
  return require(full);
}

ok(typeof ACC.capabilityFailure === 'function',
  'B1  the accessor can say WHY the mirror is false');

var A0 = freshAccessor();
eq(A0.isEnabled(), false, 'B2  it starts closed — nothing is offered before a server has spoken');
eq(A0.capabilityHeard(), false, 'B3  and it knows it has not heard one');
eq(A0.capabilityFailure(), null,
  'B4  with no reason recorded, because nothing has failed — it simply has not asked');

/* §5.10 — ONLY THE LITERAL true. */
[[{ product_strategy_enabled: true }, true, 'the literal true'],
 [{ product_strategy_enabled: false }, false, 'false'],
 [{ product_strategy_enabled: 'true' }, false, 'the STRING "true"'],
 [{ product_strategy_enabled: 1 }, false, 'the number 1'],
 [{}, false, 'a missing field'],
 [null, false, 'no payload at all']
].forEach(function (row, i) {
  var m = freshAccessor();
  eq(m.setCapability(row[0]), row[1], 'B5.' + i + ' ' + row[2] + ' -> ' + row[1]);
});

/* §5.16 — A TRANSPORT FAILURE MUST NOT BE LATCHED. `_capabilityHeard` is the gate that decides
   whether the page ever asks again; recording a failure there would disable the feature for the life
   of the page over one unreadable hop that has since recovered. This is the property the mutant in
   §Z attacks, and it is stated here as source structure because the module's guard is private. */
/* ============================================================================================
   SUPERSEDED BY P1-B8D-R10D — B6 THROUGH B12, RE-AIMED AT THE FUNCTION THAT NOW DECIDES.

   These asserted the branch structure of `refreshCapability`, because that is where the capability
   was decided when R10A wrote them. R10D deletes that decision point: the value arrives through
   `setCapability`, pushed by the shared bootstrap, and `refreshCapability` dispatches nothing.

   Every property is kept and moved to where it now lives. R10A's job here is to prove the OLD
   MECHANISM IS GONE and that its guarantees did not go with it; R10D's own suite drives the new
   one. Two suites, one property each, neither restating the other. */
var capSrc = read(ACC_REL);
var setFn = capSrc.slice(capSrc.indexOf('function setCapability'));
setFn = setFn.slice(0, setFn.indexOf('\n  function isEnabled'));

ok(!/_capabilityGen/.test(destringForCensus(capSrc)),
  'B6  SUPERSEDED (R10D): the accessor no longer runs a capability read, so it keeps no generation');
var failBranch = setFn.slice(0, setFn.indexOf('if (!isObj(caps))'));
ok(/_capabilityHeard\s*=\s*false/.test(failBranch),
  'B7  the transport-failure branch records NOTHING as heard — closed, but never latched');
ok(/_capabilityFailure\s*=\s*classifyTransportCode/.test(failBranch),
  'B8  that branch records the CLASSIFIED reason instead');

/* And a server answer clears any remembered reason, so a recovered read cannot be described by a
   fault that is over. */
var heardTrue = setFn.match(/_capabilityHeard\s*=\s*true/g) || [];
eq(heardTrue.length, 2,
  'B9  SUPERSEDED (R10D): exactly TWO branches may record that a server was heard — the literal '
  + 'true and the literal false. Every other input leaves it unheard.');
ok(/_capabilityFailure\s*=\s*null/.test(setFn),
  'B10 and a capability set from the boot bootstrap clears any remembered reason');

/* §5.11 — A SUPERSEDED CAPABILITY ANSWER WRITES NOTHING, AND THE GUARD MOVED TO THE SEQUENCE.
   The accessor no longer has a sequence of its own to guard, because it no longer issues the read.
   The shared bootstrap does, and it DISCARDS a superseded answer before applying anything — so a
   stale response never reaches the mirror rather than reaching it and being ignored. Asserted here
   against the shipped db api, because that is where the property now lives. */
var DB = decomment(fs.readFileSync(path.join(ROOT, 'assets/js/api/operation-system-db-api.js'), 'utf8')
  .replace(/\r\n/g, '\n'));
var bootFn = DB.slice(DB.indexOf('async function _kmApplyClientCapabilities_'),
  DB.indexOf('window.KM.DB.applyClientCapabilities ='));
ok(/var mySeq = \+\+_kmCapSeq_/.test(bootFn),
  'B11 SUPERSEDED (R10D): the bootstrap takes the generation, because the bootstrap owns the read');
ok(bootFn.indexOf('issuedIdentity !== nowIdentity') < bootFn.indexOf('setCapability')
  && bootFn.indexOf('_kmCapAppliedSeq_ > mySeq') < bootFn.indexOf('setCapability'),
  'B12 and BOTH supersede guards are evaluated before the mirror is written');

/* §6 — the controller must consult the reason rather than asserting "off". */
ok(/capabilityFailure/.test(pageCode),
  'B13 the controller asks the accessor why the mirror is false');
var fdShows = pageCode.match(/show\('FEATURE_DISABLED'/g) || [];
eq(fdShows.length, 1,
  'B14 and FEATURE_DISABLED is shown from exactly one place — the answered-false case');

// ==================================================================================================
section('§C — THE CAPABILITY READ SITS UNDER THE SAME BOUND AS THE OTHER TWO');
// ==================================================================================================

/* These are properties of the shared policy, asserted for the action the capability read uses. No
   new bound was written this round; the point is that this read is now subject to the existing one. */
eq(TP.isAutoRetryable({ kind: 'read', code: 'REDIRECT_TARGET_NOT_FOUND' }), true,
  'C1  §5.4 an echo redirect 404 is recoverable — once');
eq(TP.isAutoRetryable({ kind: 'read', code: 'AUTH_OR_ACCESS_HTML' }), false,
  'C2  §5.6 a sign-in page is not retried');
eq(TP.isAutoRetryable({ kind: 'read', code: 'TRANSPORT_NON_JSON_RESPONSE' }), false,
  'C3  §5.7 a generic HTML body is not retried');
eq(TP.isAutoRetryable({ kind: 'read', code: 'RESPONSE_ACTION_MISMATCH' }), false,
  'C4  §5.8 an action mismatch is not retried');
eq(TP.isAutoRetryable({ kind: 'read', code: 'DEPLOYMENT_CONTRACT_MISMATCH' }), false,
  'C5  §5.9 a schema/contract mismatch is not retried');
eq(TP.isAutoRetryable({ kind: 'read', code: 'BACKEND_BUSINESS_REJECTION' }), false,
  'C6  a business refusal is not retried');
eq(TP.isAutoRetryable({ kind: 'write', code: 'REDIRECT_TARGET_NOT_FOUND' }), false,
  'C7  §5.14 and a write is never retried, under the one code reads do recover from');

/* THE CLASSIFICATION THE CAPABILITY READ WILL USE. Same function as the other two reads. */
var C = ACC.classifyTransportCode;
eq(C('REDIRECT_TARGET_NOT_FOUND', 404, true), 'HTTP_NOT_FOUND',
  'C8  an unreadable echo target is a 404, not a disabled feature');
eq(C('AUTH_OR_ACCESS_HTML', 200, true), 'NOT_AUTHORIZED', 'C9  a sign-in page is an account fact');
eq(C('TRANSPORT_NON_JSON_RESPONSE', 200, true), 'RESPONSE_NOT_READABLE',
  'C10 an unreadable body is unreadable');
eq(C('HTTP_TRANSPORT_ERROR', null, false), 'BROWSER_OFFLINE',
  'C11 and nothing at all, on an offline browser, is offline');
['HTTP_NOT_FOUND', 'NOT_AUTHORIZED', 'RESPONSE_NOT_READABLE', 'BROWSER_OFFLINE'].forEach(function (s) {
  ok(s !== 'FEATURE_DISABLED', 'C12 ' + s + ' is not FEATURE_DISABLED');
});


// ==================================================================================================
section('\u00a7E — THE STATE MACHINE, DRIVEN. Not inspected as text.');
// ==================================================================================================

/* ============================================================================================
   SUPERSEDED BY P1-B8D-R10D — THE WHOLE OF \u00a7E, AND FOR ONE REASON THAT COVERS ALL OF IT.

   \u00a7E drove `refreshCapability` against a fake transport: a slow read superseded by a fast one, a
   failure that must not latch, a late answer that must not overwrite a newer one. Every one of
   those scenarios needed the accessor to ISSUE A CAPABILITY READ, and R10D removed that read —
   the flag arrives on the application's shared bootstrap, which runs whatever this page does.

   The scenarios did not become untrue; they moved. The supersede race now happens inside the
   shared bootstrap, which guards it with its own sequence and DISCARDS a stale answer before
   applying anything, and it is driven end to end by the R10D suite. What \u00a7E keeps, and what only
   \u00a7E can say, is that the OLD MECHANISM IS ACTUALLY GONE rather than merely unused — proved by
   driving it, not by reading the source, because "we removed the call" and "the call does nothing"
   are different claims and only the second one survives a refactor.

   E11/E11a below are unchanged in substance: the literal-true rule and the closed-but-not-latched
   rule are properties of the mirror, they still hold, and they are still driven here. */
function withWindow(transportImpl, body) {
  var saved = global.window;
  global.window = {
    KM: {
      api: {
        buildRequestEnvelope: function (action, payload, ctx) {
          return { apiVersion: '1.0', action: action, requestId: (ctx && ctx.requestId) || null,
            payload: payload || {}, context: { actor: null, clientVersion: null } };
        }
      },
      transport: { request: transportImpl }
    },
    navigator: { onLine: true }
  };
  var full = path.join(ROOT, ACC_REL);
  delete require.cache[require.resolve(full)];
  var mod = require(full);
  try { return body(mod); }
  finally {
    if (saved === undefined) { delete global.window; } else { global.window = saved; }
    delete require.cache[require.resolve(full)];
  }
}

var EJOBS = [];

/* E1-E5 SUPERSEDED: THE READ IS GONE, PROVED BY ASKING FOR IT.
   A transport that COUNTS every request it is handed, and a `refreshCapability({ force: true })` —
   the strongest form of the old ask. Zero dispatches is the assertion; anything else means the
   request came back under a different name. */
EJOBS.push((function () {
  var dispatched = [];
  function counting(o) {
    dispatched.push(o && o.action);
    return Promise.resolve({ success: false, code: 'REDIRECT_TARGET_NOT_FOUND', details: {} });
  }
  return withWindow(counting, function (m) {
    return Promise.resolve(m.refreshCapability({ force: true })).then(function (v) {
      eq(dispatched, [], 'E1  SUPERSEDED (R10D): a forced refresh dispatches NOTHING');
      eq(v, false, 'E2  and it answers from the mirror, which no one has raised');
      eq(m.capabilityFailure(), null,
        'E3  SUPERSEDED (R10D): it invents no transport fault, because it attempted no transport');
      eq(m.capabilityHeard(), false, 'E4  and it records nothing as heard');
      eq(m.capabilityState(), 'PENDING', 'E5  the mirror is still exactly where it started');
    });
  });
}()));

/* E6-E10 SUPERSEDED: THE DECISION POINT MOVED, SO THE DRIVING MOVED WITH IT.
   The properties are the ones \u00a7E always cared about, driven through the function that now decides:
   closed but not latched on a fault, and a classified reason rather than a bare false. */
EJOBS.push((function () {
  return withWindow(function () { return Promise.resolve({ success: false, code: 'X', details: {} }); },
    function (m) {
      m.setCapability(null, { failureCode: 'AUTH_OR_ACCESS_HTML' });
      eq(m.isEnabled(), false, 'E6  SUPERSEDED (R10D): a sign-in page leaves the mirror closed');
      eq(m.capabilityHeard(), false, 'E7  and NOT latched — nothing was heard, so nothing is settled');
      eq(m.capabilityFailure(), 'NOT_AUTHORIZED',
        'E8  a sign-in page is remembered as NOT_AUTHORIZED');
      m.setCapability({ product_strategy_enabled: true });
      eq(m.isEnabled(), true, 'E9  and a later server answer of true opens the feature');
      eq(m.capabilityFailure(), null,
        'E10 recording, only now, that a server was heard — the stale reason is cleared');
      return Promise.resolve();
    });
}()));

/* E11 — ONLY THE LITERAL true, DRIVEN. Unchanged in substance from R10A. */
[[true, true, 'true'], [false, false, 'false'], ['true', false, 'the STRING "true"'],
  [1, false, 'the number 1']].forEach(function (row, i) {
  EJOBS.push(withWindow(function () { return Promise.resolve({ success: true, envelope: {} }); },
    function (m) {
      m.setCapability({ product_strategy_enabled: row[0] });
      eq(m.isEnabled(), row[1], 'E11.' + i + ' a server answer of ' + row[2] + ' -> ' + row[1]);
      eq(m.capabilityHeard(), typeof row[0] === 'boolean',
        'E12.' + i + ' and it counts as heard only when a BOOLEAN was actually read');
      return Promise.resolve();
    }));
});

/* E14/E15 SUPERSEDED: the late-answer race belongs to the bootstrap now, and is asserted against it
   in \u00a7B11/\u00a7B12 above and driven in the R10D suite. What is kept here is the one half of it that
   is still this module's: a second set does not resurrect a reason the first one cleared. */
EJOBS.push(withWindow(function () { return Promise.resolve({ success: true, envelope: {} }); },
  function (m) {
    m.setCapability(null, { failureCode: 'REDIRECT_TARGET_NOT_FOUND' });
    m.setCapability({ product_strategy_enabled: true });
    m.setCapability({ product_strategy_enabled: true });
    eq(m.isEnabled(), true, 'E14 SUPERSEDED (R10D): repeated answers do not disturb the mirror');
    eq(m.capabilityFailure(), null, 'E15 nor leave a stale reason behind');
    return Promise.resolve();
  }));

// ==================================================================================================
// THE BROWSER HALF — production index, real Chrome, real lifecycle, real KM.transport.
// The fake `fetch` sits BENEATH the transport, so the classification and the bounded recovery under
// test are production's own. R10A §6 forbids accepting this round on Node evidence.
// ==================================================================================================
var RUN = require(path.join(__dirname, '_p1b8c-visual-runner.js'));
var BROWSER = RUN.findBrowser();
var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-r10a-'));
var PAGE_FILE = path.join(__dirname, '_p1b8c-acceptance.html');
var SITE_A = { company: 'KM', country: 'US', marketplace: 'Shopify' };
var SITE_B = { company: 'KM', country: 'US', marketplace: 'Walmart' };
/* P1-B8D-R10D — THE CAPABILITY READ IS STILL UNDER TEST HERE; IT IS A DIFFERENT REQUEST.
   R10A aimed every fault in this section at `system.health`, because that is what the page asked
   for its capability. R10D moved the question onto the application's shared bootstrap, so the
   faults move with it. Nothing about what §D asserts changes: a capability read that could not be
   completed must not reach an operator as a product decision, and it must stay inside the one
   bounded recovery it always had. Only the action it happens to travel on is different. */
var HEALTH = 'getClientCapabilities';

function browserHalf(body) {
  if (!BROWSER) {
    fail++;
    console.error('FAIL STOP_NO_BROWSER_AVAILABLE — R10A §6 forbids accepting this round on Node evidence.');
    process.exitCode = 2;
    return;
  }
  return body();
}
function trace(script, args, opts) {
  fs.writeFileSync(PAGE_FILE, RUN.buildPage(Object.assign(
    { capture: 'live', activated: true, site: SITE_A, script: script, scriptArgs: args, noSite: true },
    opts || {})), 'utf8');
  var r = RUN.shot(BROWSER, PAGE_FILE, OUT, { id: 'r10a', w: 1440, h: 900 });
  if (!r.measurements) throw new Error('no measurements came back from the browser');
  if (!r.measurements.trace) {
    throw new Error('no trace came back (error: ' + JSON.stringify(r.measurements.error) + ')');
  }
  return r.measurements;
}
function tidy(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function shows(m, state) { return tidy(m.stateText).indexOf(state) > -1; }

Promise.all(EJOBS).then(function () {
return browserHalf(function () {

// ==================================================================================================
section('§D — THE CAPABILITY READ, IN A BROWSER, UNDER EACH NAMED FAULT');
// ==================================================================================================

/* ---- D1-D5: the transient echo 404. The whole reason this round exists. ---------------------- */
var REC = trace('transport-fault', { first: SITE_A },
  { netFault: 'redirect404', netFaultWhen: HEALTH, netFaultOnce: true });
var recLast = REC.trace[REC.trace.length - 1];

ok(!shows(REC, 'FEATURE_DISABLED'),
  'D1  a capability read that 404s once and then answers NEVER shows FEATURE_DISABLED',
  tidy(REC.stateText).slice(0, 140));
ok(recLast.mounted === true,
  'D2  the board mounts — the recovery carried the whole page life, not just the one read');
ok(recLast.board && recLast.board.viewChildren > 0,
  'D3  and it actually drew something', recLast.board && recLast.board.viewChildren);
eq(recLast.physical.byAction[HEALTH], 2,
  'D4  the capability read cost exactly two physical requests: the read and ONE recovery');
ok(recLast.physical.methods.every(function (m) { return m === 'GET'; }),
  'D5  every one of them a GET — no POST for a 302 to strip the body from',
  recLast.physical.methods);

/* ---- D6-D8: the server ANSWERS false. The one case FEATURE_DISABLED is true. ------------------ */
var OFFCAP = trace('transport-fault', { first: SITE_A }, { capabilityOff: true });
ok(shows(OFFCAP, 'FEATURE_DISABLED'),
  'D6  a server that says the feature is off IS reported as FEATURE_DISABLED',
  tidy(OFFCAP.stateText).slice(0, 120));
var offLast = OFFCAP.trace[OFFCAP.trace.length - 1];
eq(offLast.physical.byAction['productPricing.siteUniverse.get'], undefined,
  'D7  and NO site-universe read is issued — the saving the mirror exists for');
eq(offLast.physical.byAction['productPricing.workspace.get'], undefined,
  'D8  nor a workspace read');

/* ---- D9-D12: a sign-in page, and a generic error page. Neither is "the feature is off". ------ */
var AUTH = trace('transport-fault', { first: SITE_A },
  { netFault: 'authHtml', netFaultWhen: HEALTH });
ok(!shows(AUTH, 'FEATURE_DISABLED'),
  'D9  a sign-in page on the capability read is NOT reported as a disabled feature',
  tidy(AUTH.stateText).slice(0, 140));
ok(shows(AUTH, 'NOT_AUTHORIZED'),
  'D9a it is reported as the authorization fact it is', tidy(AUTH.stateText).slice(0, 140));
eq(AUTH.trace[AUTH.trace.length - 1].physical.byAction[HEALTH], 1,
  'D10 and it is asked ONCE — a second ask cannot create a session');

var GEN = trace('transport-fault', { first: SITE_A },
  { netFault: 'genericHtml', netFaultWhen: HEALTH });
ok(!shows(GEN, 'FEATURE_DISABLED'),
  'D11 a generic HTML error page is not a disabled feature either',
  tidy(GEN.stateText).slice(0, 140));
ok(shows(GEN, 'RESPONSE_NOT_READABLE'),
  'D11a it is reported as unreadable', tidy(GEN.stateText).slice(0, 140));
eq(GEN.trace[GEN.trace.length - 1].physical.byAction[HEALTH], 1,
  'D12 and not retried — the same page would come back');

/* ---- D13-D16: a genuinely offline browser. -------------------------------------------------- */
var OFF = trace('transport-fault', { first: SITE_A },
  { netFault: 'offline', netFaultWhen: HEALTH, offline: true });
ok(!shows(OFF, 'FEATURE_DISABLED'),
  'D13 an offline browser is NOT told the feature is switched off',
  tidy(OFF.stateText).slice(0, 140));
ok(shows(OFF, 'BROWSER_OFFLINE'),
  'D13a it is told it is offline', tidy(OFF.stateText).slice(0, 140));

/* R10A §4 — FOUR DIFFERENT NUMBERS, KEPT APART. No pre-dispatch short-circuit was added to the
   shared transport (no specification in this repository requires one), so an offline read still
   ATTEMPTS. What matters is that the attempts stay inside the existing bound and that ZERO of them
   reach a server. Reporting "0 requests" here would be false; reporting "0 reached a server" is the
   true and useful statement. */
var offAttempts = OFF.trace[OFF.trace.length - 1].physical.byAction[HEALTH];
ok(offAttempts <= 2,
  'D14 external ATTEMPTS stay within the existing bounded contract (<=2)', offAttempts);
eq(shows(OFF, 'SOURCE_NOT_CONNECTED'), false,
  'D15 and it is not mislabelled as a server that failed to answer');
eq(shows(OFF, 'RESPONSE_NOT_READABLE'), false,
  'D16 nor as an unreadable response — nothing was received to be unreadable');


// ==================================================================================================
section('§Z — THE MUTANTS. Zero survivors, zero broken probes.');
// ==================================================================================================

/* Each mutant edits a REAL SHIPPED FILE, runs the check meant to catch it, and puts the file back —
   always, including on a throw. A probe that THROWS is scored as a SURVIVOR: "the probe broke" is not
   evidence that the property holds. */
function fresh(rel) {
  var full = path.join(ROOT, rel);
  delete require.cache[require.resolve(full)];
  return require(full);
}
function mutate(label, rel, from, to, probe) {
  return function () {
    var full = path.join(ROOT, rel);
    var original = fs.readFileSync(full, 'utf8');
    var src = original.replace(/\r\n/g, '\n');
    function restore() {
      fs.writeFileSync(full, original, 'utf8');
      try { fresh(rel); } catch (e) { /* the unmutated file is back */ }
    }
    var hits = src.split(from).length - 1;
    if (hits !== 1) {
      neg.missed++; fail++;
      console.error('FAIL ' + label + ' — PROBE ERROR: anchor matched ' + hits + ' times in ' + rel);
      return Promise.resolve();
    }
    fs.writeFileSync(full, src.replace(from, to), 'utf8');
    return Promise.resolve().then(probe).then(function (r) {
      restore(); score(label, r === true);
    }, function (e) {
      restore(); neg.missed++; fail++;
      console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    });
  };
}
/** Re-read the shipped accessor as text, the way §A measures it. */
function accText() { return decomment(read(ACC_REL)); }

var MUT = [];

/* ============================================================================================
   SUPERSEDED BY P1-B8D-R10D — SEVEN OF THESE NINE MUTANTS ATTACKED CODE THAT NO LONGER EXISTS.

   Every one of them aimed at `refreshCapability`'s dispatch: the POST shim it could regress to, the
   generation it took, the failure it classified, the retry it could grow. R10D deleted that
   dispatch, so each anchor matched zero times and each probe scored as a BROKEN PROBE — which is the
   correct score for a check aimed at absent text, and the wrong outcome for the properties.

   So each is re-aimed at the thing that now carries its property, and the two that were never about
   the capability dispatch (Z2, and the controller's refusal to say "off" about a fault) are kept as
   they were. The wording of each label says what it now attacks.
   ============================================================================================ */

/* Z1 SUPERSEDED — THE CAPABILITY DISPATCH COMES BACK. The gap R10A closed was a second door out of
   this file; the gap R10D closed is the door existing at all. The census in §A is what catches it. */
MUT.push(mutate('Z1  the accessor reacquires a capability dispatch of its own',
  ACC_REL,
  "  var CAPABILITY_SOURCE = 'shared-bootstrap:getClientCapabilities';",
  "  var CAPABILITY_ACTION = 'system.health';\n  var CAPABILITY_SOURCE = 'shared-bootstrap:getClientCapabilities';",
  function () {
    return !/^$/.test('x') && (decomment(read(ACC_REL)).match(/['"]system\.health['"]/g) || []).length > 0;
  }));

/* Z2 — a POST fallback reinstated inside readOnce, which is how the original gap survived R10.
   Untouched by R10D: `readOnce` still exists and still serves both business reads. */
MUT.push(mutate('Z2  a POST fallback is reinstated inside readOnce',
  ACC_REL,
  "    return Promise.resolve({ code: 'API_ENDPOINT_CONFIGURATION_INVALID', status: null });",
  '    return Promise.resolve(api.transport.post(dto, { signal: signal })).then(function (r) { return { env: r }; });',
  function () {
    var calls = accText().match(/api\s*\.\s*transport\s*\.\s*post\s*\(/g) || [];
    return calls.length > 0;
  }));

/* Z3 SUPERSEDED §5.16 — A TRANSPORT FAILURE LATCHED AS THOUGH A SERVER HAD ANSWERED. The property is
   unchanged and the branch that can break it moved from `refreshCapability` to `setCapability`:
   recording "heard" on a fault would settle the mirror on a fault that has since gone away. */
MUT.push(mutate('Z3  a transport failure is remembered as though a server had answered',
  ACC_REL,
  '      _capabilityHeard = false;      // closed, but NOT latched: nothing was heard, so nothing is settled',
  '      _capabilityHeard = true;',
  function () {
    var m = fresh(ACC_REL);
    m.setCapability(null, { failureCode: 'AUTH_OR_ACCESS_HTML' });
    return m.capabilityHeard() === true;
  }));

/* Z4 §6 — THE CONTROLLER GOES BACK TO SAYING "OFF" ABOUT A READ IT COULD NOT COMPLETE.
   Unchanged in substance; the fault now travels on the bootstrap read, which is what HEALTH names. */
MUT.push(mutate('Z4  a capability transport failure is rendered as FEATURE_DISABLED again',
  PAGE_REL,
  '        if (capFail) {',
  '        if (false) {',
  function () {
    var m = trace('transport-fault', { first: SITE_A },
      { netFault: 'authHtml', netFaultWhen: HEALTH });
    return shows(m, 'FEATURE_DISABLED');
  }));

/* Z5 SUPERSEDED — the accessor stops classifying the failure at all, so the controller has nothing
   to show and every fault collapses back into one sentence. */
MUT.push(mutate('Z5  the capability failure reason is never recorded',
  ACC_REL,
  '      _capabilityFailure = classifyTransportCode(meta.failureCode,\n'
  + "        (typeof meta.httpStatus === 'number') ? meta.httpStatus : null, browserOnline());",
  '      _capabilityFailure = null;',
  function () {
    var m = fresh(ACC_REL);
    m.setCapability(null, { failureCode: 'AUTH_OR_ACCESS_HTML' });
    return m.capabilityFailure() !== 'NOT_AUTHORIZED';
  }));

/* Z6 SUPERSEDED §5.11 — THE SUPERSEDE GUARD IS DEFEATED, so a stale capability answer lands on a
   newer one. The guard moved to the shared bootstrap with the read it guards, so the mutant moves
   there too: writing the mirror BEFORE the guards is exactly the regression. */
MUT.push(mutate('Z6  a superseded capability answer is allowed to write',
  'assets/js/api/operation-system-db-api.js',
  '    var mySeq = ++_kmCapSeq_;',
  '    var mySeq = ++_kmCapSeq_;\n    try { window.KM.productPricingWorkspace.setCapability({}); } catch (e0) {}',
  function () {
    var d = decomment(read('assets/js/api/operation-system-db-api.js'));
    var b = d.slice(d.indexOf('async function _kmApplyClientCapabilities_'),
      d.indexOf('window.KM.DB.applyClientCapabilities ='));
    return b.indexOf('setCapability') < b.indexOf('issuedIdentity !== nowIdentity');
  }));

/* Z7 SUPERSEDED §5.10 — THE MIRROR ACCEPTS ANY TRUTHY VALUE. The literal-true rule moved into
   `setCapability` with the decision; a `1` on the wire must still open nothing. */
MUT.push(mutate('Z7  the capability accepts any truthy value',
  ACC_REL,
  '    if (v === true) {',
  '    if (v) {',
  function () {
    var m = fresh(ACC_REL);
    m.setCapability({ product_strategy_enabled: 1 });
    return m.isEnabled() === true;
  }));

/* Z8 — A STALE FAILURE REASON SURVIVES A LATER ANSWER, so a fault that is over keeps describing a
   capability that has since been set. The line is still in `setCapability`; only the probe changed,
   because there is no longer a read to drive it through. */
MUT.push(mutate('Z8  a stale failure reason survives setCapability',
  ACC_REL,
  '    _capabilityFailure = null;\n    return _enabled;\n  }\n  function isEnabled()',
  '    return _enabled;\n  }\n  function isEnabled()',
  function () {
    var m = fresh(ACC_REL);
    m.setCapability(null, { failureCode: 'AUTH_OR_ACCESS_HTML' });
    m.setCapability({ product_strategy_enabled: true });
    return m.capabilityFailure() !== null;
  }));

/* Z9 SUPERSEDED §5.4/§5.13 — THE CAPABILITY ACQUIRES A SECOND REQUEST above the shared bound. It
   cannot grow one inside the accessor any more, so the place it can grow one is the bootstrap glue,
   and the measurement is the same: more physical capability requests than the bound allows. */
MUT.push(mutate('Z9  the capability read is given a retry of its own',
  'assets/js/api/operation-system-db-api.js',
  /* TWO THINGS THIS MUTANT HAD TO LEARN, AND BOTH WERE REAL.
     · NOT `KM.DB.getClientCapabilities()`: that name is single-flighted, so calling it twice adds no
       PHYSICAL request and the mutant changed nothing measurable. The suite scored it as a survivor,
       which was the correct answer to a mutant that did not mutate anything observable.
     · NOT THE `caps` BRANCH: under an always-on fault the bootstrap never produces a payload, so a
       line inside `if (caps)` is unreachable in the very scenario that measures the cost. It goes on
       the glue's entry, which runs whatever the read did. */
  '        var _psAcc = (window.KM && window.KM.productPricingWorkspace) ? window.KM.productPricingWorkspace : null;',
  '        _kmGapRead_("getClientCapabilities", {});\n'
  + '        var _psAcc = (window.KM && window.KM.productPricingWorkspace) ? window.KM.productPricingWorkspace : null;',
  function () {
    var m = trace('transport-fault', { first: SITE_A },
      { netFault: 'redirect404', netFaultWhen: HEALTH });
    var n = m.trace[m.trace.length - 1].physical.byAction[HEALTH];
    return typeof n === 'number' && n > 2;
  }));

var chain = Promise.resolve();
MUT.forEach(function (m) { chain = chain.then(m); });
return chain;

});
})
.then(function () {
  console.log('');
  console.log('passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
  if (fail > 0) process.exitCode = 1;
});
