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
ok(/CAPABILITY_ACTION\s*=\s*'system\.health'/.test(read(ACC_REL)),
  'A6  and the capability action is system.health');

/* ONE HELPER, THREE CALLERS. A second dispatch path is how the first gap happened, so the property
   asserted is not "the capability read is migrated" but "there is only one way out of this file". */
var readOnceCalls = accCode.match(/readOnce\s*\(/g) || [];
ok(readOnceCalls.length >= 4,
  'A7  readOnce is defined once and called by all three reads', readOnceCalls.length);
var tpRequests = accCode.match(/tp\s*\.\s*request\s*\(/g) || [];
eq(tpRequests.length, 1,
  'A8  and there is exactly ONE KM.transport.request call site in the whole accessor');

/* The capability read must reach that helper rather than building its own request. */
ok(/readOnce\(api,\s*CAPABILITY_ACTION/.test(accCode),
  'A9  refreshCapability dispatches through readOnce — the same door as the other two');
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
var capSrc = read(ACC_REL);
var capFn = capSrc.slice(capSrc.indexOf('function refreshCapability'));
capFn = capFn.slice(0, capFn.indexOf('\n  function capabilityHeard'));
var heardSets = capFn.match(/_capabilityHeard\s*=\s*true/g) || [];
eq(heardSets.length, 1,
  'B6  exactly ONE branch in refreshCapability may record that a server was heard');
var failBranch = capFn.slice(capFn.indexOf('if (r0.code)'));
failBranch = failBranch.slice(0, failBranch.indexOf('var env'));
ok(failBranch.indexOf('_capabilityHeard') === -1,
  'B7  and the transport-failure branch is not it — closed, but never latched');
ok(/_capabilityFailure\s*=\s*classifyTransportCode/.test(failBranch),
  'B8  that branch records the CLASSIFIED reason instead');

/* And a server answer clears any remembered reason, so a recovered read cannot be described by a
   fault that is over. */
ok(/_capabilityHeard\s*=\s*true;[\s\S]{0,400}?_capabilityFailure\s*=\s*null/.test(capFn),
  'B9  a server answer clears the remembered reason');
ok(/_capabilityFailure\s*=\s*null/.test(
    capSrc.slice(capSrc.indexOf('function setCapability'), capSrc.indexOf('function isEnabled'))),
  'B10 and so does a capability set from the boot bootstrap');

/* §5.11 — A SUPERSEDED CAPABILITY ANSWER WRITES NOTHING. */
ok(/var myGen = \+\+_capabilityGen/.test(capFn),
  'B11 each capability read takes a generation');
var genGuards = capFn.match(/myGen\s*!==\s*_capabilityGen/g) || [];
ok(genGuards.length >= 2,
  'B12 and BOTH the resolve and the reject paths refuse to write when superseded', genGuards.length);

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
section('§E — THE STATE MACHINE, DRIVEN. Not inspected as text.');
// ==================================================================================================

/* §B asserted the SHAPE of refreshCapability because its guard is private. That is weaker than
   driving it, so this drives it: a fake `window` is installed BEFORE the module is loaded, carrying a
   foundation and a KM.transport whose answers this section chooses. Everything below is the shipped
   module's own behaviour. */
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

function failing(code, status) {
  return function () {
    return Promise.resolve({ success: false, code: code,
      details: { http_status: (status === undefined ? null : status) } });
  };
}
function answering(value) {
  return function (o) {
    return Promise.resolve({ success: true, envelope: {
      apiVersion: '1.0', success: true, action: o.action,
      request_id: o.requestId || null, meta: { action: o.action, requestId: o.requestId || null },
      product_strategy_enabled: value } });
  };
}

var EJOBS = [];

/* E1-E4 — A TRANSPORT FAILURE IS CLOSED BUT NOT LATCHED. This is §5.16 as behaviour: the page must
   be able to ask again once the fault has passed, or one unreadable hop disables the feature for the
   whole session. */
EJOBS.push(withWindow(failing('REDIRECT_TARGET_NOT_FOUND', 404), function (m) {
  return m.refreshCapability().then(function (enabled) {
    eq(enabled, false, 'E1  a capability read that fails leaves the feature closed');
    eq(m.capabilityHeard(), false,
      'E2  and does NOT record that a server was heard — closed, but not latched');
    eq(m.capabilityFailure(), 'HTTP_NOT_FOUND',
      'E3  while remembering the classified reason, so the page can say what actually happened');
    eq(m.isEnabled(), false, 'E4  and the mirror stays false');
  });
}));

/* E5-E7 — AND THE NEXT CALL REALLY DOES ASK AGAIN. A latched failure would skip the read entirely,
   so the proof is a COUNT of dispatches, not a return value. */
EJOBS.push((function () {
  var calls = 0;
  var flaky = function (o) {
    calls++;
    return (calls === 1)
      ? Promise.resolve({ success: false, code: 'REDIRECT_TARGET_NOT_FOUND', details: { http_status: 404 } })
      : answering(true)(o);
  };
  return withWindow(flaky, function (m) {
    return m.refreshCapability().then(function (first) {
      eq(first, false, 'E5  the first capability read fails and the feature is closed');
      return m.refreshCapability();
    }).then(function (second) {
      eq(calls, 2, 'E6  the SECOND call issues a real read rather than reusing the failure');
      eq(second, true, 'E7  and a server that answers true opens the feature');
    });
  });
}()));

/* E8-E10 — A SERVER ANSWER CLEARS THE REMEMBERED REASON. Otherwise a fault that is over keeps
   speaking for a capability that has since been answered. */
EJOBS.push((function () {
  var calls = 0;
  var flaky = function (o) {
    calls++;
    return (calls === 1)
      ? Promise.resolve({ success: false, code: 'AUTH_OR_ACCESS_HTML', details: {} })
      : answering(true)(o);
  };
  return withWindow(flaky, function (m) {
    return m.refreshCapability().then(function () {
      eq(m.capabilityFailure(), 'NOT_AUTHORIZED', 'E8  a sign-in page is remembered as NOT_AUTHORIZED');
      return m.refreshCapability();
    }).then(function () {
      eq(m.capabilityFailure(), null, 'E9  and a later real answer clears it');
      eq(m.capabilityHeard(), true, 'E10 recording, only now, that a server was heard');
    });
  });
}()));

/* E11-E13 — ONLY THE LITERAL true, through a real read rather than through setCapability. */
[[true, true], [false, false], ['true', false], [undefined, false]].forEach(function (row, i) {
  EJOBS.push(withWindow(answering(row[0]), function (m) {
    return m.refreshCapability().then(function (v) {
      eq(v, row[1], 'E11.' + i + ' a server answer of ' + JSON.stringify(row[0]) + ' -> ' + row[1]);
      eq(m.capabilityHeard(), true,
        'E12.' + i + ' and it counts as heard either way — a server DID answer');
      eq(m.capabilityFailure(), null, 'E13.' + i + ' with no transport reason recorded');
    });
  }));
});

/* E14-E15 — A SUPERSEDED CAPABILITY ANSWER WRITES NOTHING. Two reads are started; the first resolves
   LAST and must not overwrite what the second established. */
EJOBS.push((function () {
  var n = 0, release = [];
  var slowThenFast = function (o) {
    n++;
    if (n === 1) {
      return new Promise(function (res) {
        release.push(function () { res({ success: false, code: 'AUTH_OR_ACCESS_HTML', details: {} }); });
      });
    }
    return answering(true)(o);
  };
  return withWindow(slowThenFast, function (m) {
    var first = m.refreshCapability();
    var second = m.refreshCapability({ force: true });
    return second.then(function () {
      eq(m.isEnabled(), true, 'E14 the newer capability read established the feature');
      release.forEach(function (f) { f(); });
      return first;
    }).then(function () {
      eq(m.isEnabled(), true,
        'E15 and the older answer, arriving late, does not take it away again');
      eq(m.capabilityFailure(), null, 'E15a nor leave its stale reason behind');
    });
  });
}()));

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
var HEALTH = 'system.health';

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

/* Z1 §5.15 — THE PRIVATE POST SHIM COMES BACK. This is the whole gap R10A closes, and the census in
   §A is what catches it. */
MUT.push(mutate('Z1  the capability read goes back to the private POST shim',
  ACC_REL,
  '    return readOnce(api, CAPABILITY_ACTION, {}, str(opts.requestId) || undefined, opts.signal)',
  '    return Promise.resolve(api.transport.post({ action: CAPABILITY_ACTION }))',
  function () {
    var calls = accText().match(/api\s*\.\s*transport\s*\.\s*post\s*\(/g) || [];
    return calls.length > 0;
  }));

/* Z2 — and the same thing one layer out: a POST fallback reinstated inside readOnce, which is how it
   survived R10 in the first place. */
MUT.push(mutate('Z2  a POST fallback is reinstated inside readOnce',
  ACC_REL,
  "    return Promise.resolve({ code: 'API_ENDPOINT_CONFIGURATION_INVALID', status: null });",
  '    return Promise.resolve(api.transport.post(dto, { signal: signal })).then(function (r) { return { env: r }; });',
  function () {
    var calls = accText().match(/api\s*\.\s*transport\s*\.\s*post\s*\(/g) || [];
    return calls.length > 0;
  }));

/* Z3 §5.16 — A TRANSIENT TRANSPORT FAILURE IS LATCHED AS A PERMANENT false. The mutant records that a
   server was heard when none was, so the page never asks again and one unreadable hop disables the
   feature for the whole session. Caught behaviourally: the second call stops issuing a read. */
MUT.push(mutate('Z3  a transport failure is remembered as though a server had answered',
  ACC_REL,
  '        if (r0.code) {\n          _enabled = false;',
  '        if (r0.code) {\n          _enabled = false;\n          _capabilityHeard = true;',
  function () {
    var calls = 0;
    var flaky = function (o) {
      calls++;
      return (calls === 1)
        ? Promise.resolve({ success: false, code: 'REDIRECT_TARGET_NOT_FOUND', details: { http_status: 404 } })
        : Promise.resolve({ success: true, envelope: { apiVersion: '1.0', success: true,
          action: o.action, request_id: o.requestId || null,
          meta: { action: o.action, requestId: o.requestId || null },
          product_strategy_enabled: true } });
    };
    return withWindow(flaky, function (m) {
      return m.refreshCapability()
        .then(function () { return m.refreshCapability(); })
        .then(function (second) {
          /* Under the mutant the second call short-circuits: one dispatch, still false. */
          return calls === 1 && second === false;
        });
    });
  }));

/* Z4 §6 — THE CONTROLLER GOES BACK TO SAYING "OFF" ABOUT A READ IT COULD NOT COMPLETE. */
MUT.push(mutate('Z4  a capability transport failure is rendered as FEATURE_DISABLED again',
  PAGE_REL,
  '        if (capFail) {',
  '        if (false) {',
  function () {
    var m = trace('transport-fault', { first: SITE_A },
      { netFault: 'authHtml', netFaultWhen: HEALTH });
    return shows(m, 'FEATURE_DISABLED');
  }));

/* Z5 — the accessor stops classifying the failure at all, so the controller has nothing to show. */
MUT.push(mutate('Z5  the capability failure reason is never recorded',
  ACC_REL,
  '          _capabilityFailure = classifyTransportCode(r0.code, r0.status, browserOnline());',
  '          _capabilityFailure = null;',
  function () {
    return withWindow(failing('AUTH_OR_ACCESS_HTML'), function (m) {
      return m.refreshCapability().then(function () { return m.capabilityFailure() === null; });
    });
  }));

/* Z6 §5.11 — THE GENERATION GUARD IS REMOVED, so a superseded capability answer lands. */
MUT.push(mutate('Z6  a superseded capability answer is allowed to write',
  ACC_REL,
  '        if (myGen !== _capabilityGen) return _enabled === true;\n\n        /* ---',
  '        if (false) return _enabled === true;\n\n        /* ---',
  function () {
    var n = 0, release = [];
    var slowThenFast = function (o) {
      n++;
      if (n === 1) {
        return new Promise(function (res) {
          release.push(function () { res({ success: false, code: 'AUTH_OR_ACCESS_HTML', details: {} }); });
        });
      }
      return Promise.resolve({ success: true, envelope: { apiVersion: '1.0', success: true,
        action: o.action, request_id: o.requestId || null,
        meta: { action: o.action, requestId: o.requestId || null },
        product_strategy_enabled: true } });
    };
    return withWindow(slowThenFast, function (m) {
      var first = m.refreshCapability();
      return m.refreshCapability({ force: true }).then(function () {
        release.forEach(function (f) { f(); });
        return first;
      }).then(function () {
        /* Under the mutant the stale AUTH failure overwrites the newer success. */
        return m.isEnabled() === false;
      });
    });
  }));

/* Z7 §5.10 — THE LITERAL true IS RELAXED TO TRUTHY, so the string "false" would enable the page. */
MUT.push(mutate('Z7  the capability accepts any truthy value',
  ACC_REL,
  '        _enabled = v === true;',
  '        _enabled = !!v;',
  function () {
    return withWindow(answering('false'), function (m) {
      return m.refreshCapability().then(function (v) { return v === true; });
    });
  }));

/* Z8 — setCapability stops clearing the remembered reason, so a long-gone fault keeps speaking for a
   capability that has since been set directly. */
MUT.push(mutate('Z8  a stale failure reason survives setCapability',
  ACC_REL,
  '    _capabilityFailure = null;\n    return _enabled;',
  '    return _enabled;',
  function () {
    return withWindow(failing('AUTH_OR_ACCESS_HTML'), function (m) {
      return m.refreshCapability().then(function () {
        m.setCapability({ product_strategy_enabled: true });
        return m.capabilityFailure() !== null;
      });
    });
  }));

/* Z9 §5.4/§5.13 — THE CAPABILITY READ ACQUIRES A SECOND RETRY, above the shared bound. */
MUT.push(mutate('Z9  the capability read is given a retry of its own',
  ACC_REL,
  "    return readOnce(api, CAPABILITY_ACTION, {}, str(opts.requestId) || undefined, opts.signal)\n      .then(function (r0) {",
  "    return readOnce(api, CAPABILITY_ACTION, {}, str(opts.requestId) || undefined, opts.signal)\n      .then(function (r0) { return r0.code ? readOnce(api, CAPABILITY_ACTION, {}, undefined, opts.signal) : r0; })\n      .then(function (r0) {",
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
