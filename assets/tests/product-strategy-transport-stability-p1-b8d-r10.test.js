/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE ONE READ PATH THAT NEVER JOINED THE TRANSPORT   (P1-B8D-R10)
 * ==================================================================================================
 *
 * TWO DIFFERENT ERRORS ON ONE LIVE PAGE, and they were one defect.
 *
 *   · "API 預期 JSON，卻收到 web page" over a console 404 on a `script.googleusercontent.com/macros/echo`
 *   · "No server answered", with the site chooser already holding ResUS / US / Amazon
 *
 * WHAT THE WIRE SAID, measured in real Chrome with `window.fetch` wrapped BEFORE any application file
 * was allowed to load — because every cheaper discriminator lied, and both of those are recorded in
 * this round's report rather than quietly dropped:
 *
 *     accessor getSiteUniverse  ->  POST  km_via=post   ... 404, redirected     <- the reported failure
 *     accessor workspace.get    ->  POST  km_via=post
 *     KM.transport.request      ->  GET   km_via=get                            <- every other page
 *
 * PRODUCT STRATEGY WAS THE LAST WORKSPACE READ ON THE FOUNDATION'S PRIVATE POST SHIM — the one whose
 * own comment calls it "a fallback and not the path". An Apps Script `/exec` answers a POST with a
 * 302, and a 302 after a POST is re-issued by specification as a GET WITH THE BODY DROPPED. The
 * shared transport has dispatched reads as GET with the body in `km_body` since F1-7N-FB-4E-R4A1 for
 * exactly that reason. This page never got the fix, and so it also never got the endpoint classifier,
 * the HTML fingerprint, the redirect-target classification, or the bounded recovery.
 *
 * WHAT THIS ROUND DID NOT DO, and the distinction is the point. It did not write a retry. One already
 * existed, one layer down, bounded to a single recovery for reads and to zero for writes, rebuilt
 * from the stable /exec with a fresh request id. The fix was to JOIN that boundary. A second retry
 * policy living in the page would have been a second thing to keep correct.
 *
 * WHAT THE EVIDENCE ELIMINATED, so that no one re-opens it from memory:
 *
 *   · redirect reuse. The /exec 302 carries `no-cache, no-store, max-age=0, must-revalidate`, and 24
 *     of 24 live attempts received a DISTINCT 354-character user_content_key. None was shared across
 *     the three read actions.
 *   · URL length. 164-290 characters against a 6000 ceiling.
 *   · the deployment. R11, uniform, router ready, 0 missing actions, product_strategy_enabled true,
 *     read_only true, every write counter 0.
 *
 * HOW THIS SUITE IS ALLOWED TO PROVE THINGS.
 *
 *   §B and §C run in Node, and they are about POLICY — what the classifier maps and what the retry
 *   bound is. That is a property of the source and Node may speak for it.
 *
 *   §D, §E and §F run in a REAL BROWSER and they are about BEHAVIOUR. A Node run is never accepted as
 *   evidence for a browser here (R10 §3). The faults are injected at `fetch`, BENEATH a real
 *   transport built from the shipped factory, so the classification and the recovery under test are
 *   production's own and not this file's.
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
/* A PROBE ERROR IS A FAILURE, NOT A SKIP. R10 §10 asks for 0 survived AND 0 PROBE ERROR, so a mutant
   that throws instead of answering is counted against the round rather than logged past. */
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) {
    neg.missed++; fail++;
    console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    return;
  }
  score(label, r);
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

var ACC_REL = 'assets/js/api/km-product-pricing-workspace.js';
var TRANSPORT_REL = 'assets/js/api/km-transport.js';
var UNIVERSE_REL = 'assets/js/product-strategy/km-product-strategy-site-universe.js';
var ADAPTER_REL = 'assets/js/product-strategy/km-product-strategy-live-adapter.js';

var ACC = require(path.join(ROOT, ACC_REL));
var TP = require(path.join(ROOT, TRANSPORT_REL));
var UNI = require(path.join(ROOT, UNIVERSE_REL));
var ADP = require(path.join(ROOT, ADAPTER_REL));

var SRC = {
  acc: read(ACC_REL),
  transport: read(TRANSPORT_REL),
  universe: read(UNIVERSE_REL),
  adapter: read(ADAPTER_REL)
};

// ==================================================================================================
section('§A — THE ROUTE: this page reads through the shared transport, like every other page');
// ==================================================================================================

/* A1 is the whole round in one line. Everything below is about what that route then guarantees. */
ok(typeof ACC.readsThroughSharedTransport === 'function',
  'A1  the accessor can state, at runtime, which door its reads go through');

/* The accessor is loaded here with no `window`, so `KM.transport` is genuinely absent and this
   answers false — which is the point: the fallback still exists and still works, and the LIVE claim
   is made by §D in a browser where the transport is present. */
eq(ACC.readsThroughSharedTransport(), false,
  'A2  and with no KM.transport present it says so rather than pretending');

var accCode = decomment(SRC.acc);
ok(/root\.KM\.transport/.test(accCode),
  'A3  the accessor resolves the shared transport from the page, not a copy of its own');
ok(/tp\.request\(\{[\s\S]{0,400}kind:\s*'read'/.test(accCode),
  'A4  and dispatches its reads as kind:read, which is what bounds the retry to one');

/* THE ENVELOPE IS THE BODY, NOT THE PAYLOAD, and this cost one live regression to learn. `readQuery`
   serialises whatever it is handed verbatim and the router reads `body.payload.scope` out of it, so
   passing the inner payload produced a 200 that refused SCOPE_INCOMPLETE — a scope that WAS supplied,
   reported as missing. The DTO built by buildRequestEnvelope is what crosses. */
ok(/buildRequestEnvelope/.test(accCode),
  'A5  the request envelope is built by the foundation, so one shape crosses the wire');
ok(/payload:\s*dto/.test(accCode),
  'A6  and the WHOLE envelope is what travels, not the inner payload (the SCOPE_INCOMPLETE lesson)');
/* P1-B8D-R10A §3 — THE OLD DOOR IS GONE, NOT MERELY SECOND.

   R10 kept `api.transport.post` as a fallback and this assertion checked only that it came AFTER the
   shared transport. That was the right assertion for a round that left the door standing. R10A
   removed it, because "keeps working with its old failure modes" describes the exact path whose
   302-dropped body caused the live failure — falling back to it would reintroduce the defect at
   precisely the moment something else is already wrong, and do it silently.

   So the property is now absence, measured on decommented source so the historical paragraphs that
   NAME the shim cannot satisfy or break it. */
var primaryFirst = accCode.indexOf('tp.request(');
var shimCalls = (accCode.match(/api\s*\.\s*transport\s*\.\s*post\s*\(/g) || []);
eq(shimCalls.length, 0,
  'A7  the private POST shim has ZERO callers in the Product Strategy accessor');
ok(primaryFirst > -1, 'A7a while the shared transport is dispatched from it', primaryFirst);
ok(!/fetch\s*\(|XMLHttpRequest/.test(accCode),
  'A7b and the accessor opens no socket of its own either');

// ==================================================================================================
section('§B — CLASSIFICATION: the sentences R10 §5 forbids, each asserted by name');
// ==================================================================================================

var C = ACC.classifyTransportCode;

/* R10 §5: "HTTP 404 不得被描述成 No server answered". A 404 means the address was REACHED. */
eq(C('HTTP_NOT_FOUND_HTML', 404, true), 'HTTP_NOT_FOUND',
  'B1  a 404 is a server that answered, and is never SOURCE_NOT_CONNECTED');
eq(C('REDIRECT_TARGET_NOT_FOUND', 404, true), 'HTTP_NOT_FOUND',
  'B2  and so is a redirect target that 404s — the endpoint was reached, the hop was not');
eq(C('ANYTHING_ELSE', 404, true), 'HTTP_NOT_FOUND',
  'B3  the STATUS alone is enough; an unrecognised code cannot launder a 404 into offline');

/* §5: a server that returned HTML is not a disconnected database, and a login page is not offline. */
eq(C('AUTH_OR_ACCESS_HTML', 200, true), 'NOT_AUTHORIZED',
  'B4  a Google sign-in page is an authorisation fact, not a network one');
eq(C('AUTH_OR_ACCESS_HTML', 200, false), 'NOT_AUTHORIZED',
  'B5  and it stays that even if the browser also thinks it is offline — the page ARRIVED');
eq(C('TRANSPORT_NON_JSON_RESPONSE', 200, true), 'RESPONSE_NOT_READABLE',
  'B6  HTML where JSON was expected is unreadable, not disconnected');

/* §5: a timeout must never be reported as a permission error. */
eq(C('REQUEST_TIMEOUT', null, true), 'SOURCE_TIMED_OUT',
  'B7  a timeout is a timeout and never NOT_AUTHORIZED');
eq(C('REQUEST_TIMEOUT_WRITE_INDETERMINATE', null, true), 'SOURCE_TIMED_OUT',
  'B7a including the write-indeterminate timeout, which is still a clock and not a permission');

eq(C('HTTP_TRANSPORT_ERROR', 403, true), 'NOT_AUTHORIZED',
  'B8  a 403 is a permission fact even when the code is the generic transport one');
eq(C('HTTP_TRANSPORT_ERROR', 401, true), 'NOT_AUTHORIZED', 'B8a and so is a 401');
eq(C('HTTP_TRANSPORT_ERROR', null, false), 'BROWSER_OFFLINE',
  'B9  a failure with NO response at all, on an offline browser, is the one honest offline');
eq(C('HTTP_TRANSPORT_ERROR', null, true), 'SOURCE_NOT_CONNECTED',
  'B10 and online with no response is the only thing left that "no server answered" may describe');

/* §5: a known status must survive an unknown code rather than being discarded with it. */
eq(C('SOME_FUTURE_CODE', 404, true), 'HTTP_NOT_FOUND',
  'B11 a status that is known is never dropped in favour of the default');

/* An answer to a DIFFERENT question is the one failure that could have reached a price axis as data. */
eq(C('RESPONSE_ACTION_MISMATCH', 200, true), 'ACTION_MISMATCH',
  'B12 an envelope for another action is a routing fault, not a missing network');
eq(C('RESPONSE_REQUEST_ID_MISMATCH', 200, true), 'ACTION_MISMATCH', 'B12a and so is a stale correlation id');
eq(C('RESPONSE_CORRELATION_UNPROVEN', 200, true), 'ACTION_MISMATCH', 'B12b and so is an unprovable one');
eq(ACC.stateForValidationCode('RESPONSE_ACTION_MISMATCH'), 'ACTION_MISMATCH',
  'B13 and the VALIDATION path names it the same way the transport path does');
eq(ACC.stateForValidationCode('SCHEMA_BROKEN'), 'RESPONSE_NOT_READABLE',
  'B14 while a broken schema is unreadable — which is true, and is not "no server answered"');

/* EVERY STATE THE ACCESSOR CAN PRODUCE MUST EXIST IN BOTH UX MAPS. These maps fall back to
   `UX[state] || UX.SOURCE_NOT_CONNECTED`, so a state added here and forgotten there does not throw —
   it silently renders as the exact sentence §5 forbids. That is why this is a loop and not a list. */
ACC.CLIENT_TRANSPORT_STATES.forEach(function (s) {
  ok(UNI.STATES.indexOf(s) > -1, 'B15 site-universe STATES knows ' + s);
  ok(!!UNI.UX[s], 'B16 site-universe UX has wording for ' + s);
  /* SOURCE_NOT_CONNECTED IS THE FALLBACK ITSELF, so it belongs to neither list by construction —
     it is where an unlisted state LANDS. Asserting it into CLIENT_ONLY_REFUSALS would be asserting
     the default against itself; asserting every OTHER state into it is the property that matters. */
  if (s !== 'SOURCE_NOT_CONNECTED') {
    ok(UNI.CLIENT_ONLY_REFUSALS.indexOf(s) > -1,
      'B17 and ' + s + ' is an explicit client-only refusal, not a fall-through to the default');
  }
  ok(!!ADP.UX[s], 'B18 live-adapter UX has wording for ' + s);
});
eq(UNI.CLIENT_ONLY_REFUSALS.indexOf('SOURCE_NOT_CONNECTED'), -1,
  'B17a and the fallback is deliberately NOT in that list — it is what an unlisted state becomes');

/* And the wording itself must not contradict the classification it belongs to. */
var NF_TEXT = JSON.stringify(UNI.UX.HTTP_NOT_FOUND);
var AM_TEXT = JSON.stringify(UNI.UX.ACTION_MISMATCH);
ok(/404|nothing there|nothing to read/i.test(NF_TEXT),
  'B19 the 404 wording says something was reached and is empty', NF_TEXT);
ok(!/not connected|no server answered|offline/i.test(NF_TEXT),
  'B20 and never says "not connected" about a server that answered', NF_TEXT);
ok(!/database|not connected|offline/i.test(AM_TEXT),
  'B21 and the mismatch wording does not blame the database or the network', AM_TEXT);

/* NOTHING IN ANY OPERATOR-FACING STRING MAY CARRY AN ADDRESS. R10 §5 forbids it outright. */
var ALL_UX = JSON.stringify(UNI.UX) + JSON.stringify(ADP.UX) + JSON.stringify(ACC.TRANSPORT_DETAIL);
ok(!/script\.google\.com|googleusercontent|macros\/s\/|AKfyc|user_content_key/i.test(ALL_UX),
  'B22 no endpoint, deployment id or redirect token appears in anything an operator is shown');

// ==================================================================================================
section('§C — THE RETRY BOUND, asserted against the REAL transport over an injected network');
// ==================================================================================================

/* WHY THIS IS NOT A STUB. The whole R10 question is whether the recovery under test is bounded,
   restarted from the stable /exec, and never applied to a write. Stubbing `request` would make every
   one of those assertions a statement about the stub. So a REAL transport is built from the shipped
   factory and only `fetch` is ours. `sleep` collapses because a suite should not wait out a backoff;
   `random` is pinned so the delay is an exact number rather than a range. */
var EXEC = 'https://script.google.com/macros/s/R10_SYNTHETIC_DEPLOYMENT_ID_NOT_REAL/exec';
var ECHO_HOST = 'https://script.googleusercontent.com/macros/echo';

function netResponse(status, ctype, body, finalUrl, redirected) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    url: finalUrl,
    redirected: redirected === true,
    headers: { get: function (h) { return String(h).toLowerCase() === 'content-type' ? ctype : null; } },
    text: function () { return Promise.resolve(body); }
  };
}
var HTML = {
  notFound: '<!DOCTYPE html><html><head><title>Error 404 (Not Found)</title></head>'
    + '<body><p>The requested URL was not found on this server.</p></body></html>',
  signIn: '<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head>'
    + '<body><div>Please sign in to continue to accounts.google.com</div></body></html>',
  generic: '<!DOCTYPE html><html><head><title>Error</title></head>'
    + '<body><p>A temporary error occurred.</p></body></html>'
};

/**
 * Run one request through a real transport whose network answers with `plan[n]` on attempt n, and
 * hand back both the outcome and EVERY URL that was physically requested.
 */
function runNet(plan, opts) {
  opts = opts || {};
  var seen = { urls: [], methods: [], n: 0 };
  var tp = TP.create({
    baseUrl: EXEC,
    sleep: function () { return Promise.resolve(); },
    random: function () { return 0.5; },
    fetch: function (url, init) {
      var n = ++seen.n;
      seen.urls.push(String(url));
      seen.methods.push((init && init.method) || 'GET');
      var step = plan[Math.min(n, plan.length) - 1];
      if (typeof step === 'function') return step(n, String(url));
      return step;
    }
  });
  return tp.request(Object.assign({ action: 'productPricing.siteUniverse.get', kind: 'read',
    requestId: 'R10-C', payload: { apiVersion: '1.0', action: 'productPricing.siteUniverse.get' } },
    opts)).then(function (res) { return { res: res, seen: seen, tp: tp }; });
}

/* A 404 on the redirect target, forever. */
function alwaysRedirect404() {
  return Promise.resolve(netResponse(404, 'text/html; charset=utf-8', HTML.notFound, ECHO_HOST + '?x=1', true));
}
/* A SUCCESS MUST ECHO THE ID OF THE ATTEMPT THAT ASKED, and writing this fixture the lazy way is how
   that got proven. A fixed 'R10-C' made the RECOVERY fail with RESPONSE_REQUEST_ID_MISMATCH — because
   the second attempt carries its own id and its answer is validated against that one, never against
   the first attempt's. The harness was wrong and the transport was right, which is the outcome a
   correlation check is supposed to produce. So the fixture reads the id off the wire, as a server
   would. */
function okEnvelope(n, url) {
  var rid = (/[?&]km_rid=([^&]*)/.exec(String(url || '')) || [])[1];
  rid = rid ? decodeURIComponent(rid) : 'R10-C';
  return Promise.resolve(netResponse(200, 'application/json', JSON.stringify({
    apiVersion: '1.0', success: true, action: 'productPricing.siteUniverse.get',
    request_id: rid, meta: { action: 'productPricing.siteUniverse.get', requestId: rid },
    data: { state: 'READY', sites: [] }
  }), EXEC, false));
}

var CJOBS = [];

/* C1-C5 — THE BOUND IS EXACTLY ONE, and every property of the recovery is checked on the same run. */
CJOBS.push(runNet([alwaysRedirect404, alwaysRedirect404, alwaysRedirect404]).then(function (r) {
  eq(r.seen.n, 2, 'C1  a redirect target that 404s costs exactly TWO physical requests, never three');
  eq(r.res.success, false, 'C2  and after the one recovery it reports failure rather than hiding it');
  eq(r.res.code, 'REDIRECT_TARGET_NOT_FOUND', 'C3  named as the redirect-target fault it is');

  /* R10 §6: "禁止重用 googleusercontent redirect URL". The recovery restarts from the stable /exec. */
  var offExec = r.seen.urls.filter(function (u) { return u.indexOf(EXEC) !== 0; });
  eq(offExec.length, 0, 'C4  BOTH attempts were issued to the stable /exec and nothing else', offExec);
  ok(r.seen.urls.every(function (u) { return u.indexOf('googleusercontent') === -1; }),
    'C4a the failed redirect target is never requested again — it is not even stored');

  /* R10 §6: a new request id per attempt. */
  function rid(u) { return (/[?&]km_rid=([^&]*)/.exec(u) || [])[1] || ''; }
  ok(rid(r.seen.urls[0]) !== '' && rid(r.seen.urls[1]) !== '',
    'C5  each physical attempt carries a request id');
  ok(rid(r.seen.urls[0]) !== rid(r.seen.urls[1]),
    'C5a and the recovery gets a NEW one, so its answer is correlated to itself',
    r.seen.urls.map(rid));

  /* The read is a GET. A POST cannot survive the 302 that /exec always answers with. */
  eq(r.seen.methods, ['GET', 'GET'], 'C6  reads go out as GET, both times — the body rides in km_rid/km_body');
  ok(r.seen.urls.every(function (u) { return /[?&]km_via=get(&|$)/.test(u); }),
    'C6a and say so on the wire, so the router can prove which door was used');

  /* THE RECOVERY IS COUNTED, so "it recovered" is a number rather than a belief. A recovery happening
     on every read would mean the primary path is still wrong, and only a counter can show that.

     THIS DELIBERATELY DOES NOT ASSERT `details.recovery_from`. That field is written onto the FIRST
     attempt's failure object, which is then discarded in favour of the retry's result — so it is
     unobservable to a caller, and a test that read it would have to reach into a value production
     cannot see. It is reported as a finding rather than fixed here: km-transport.js is shared by every
     page and this round is not about it. The property itself is already proven, and proven harder, by
     C4/C4a — both URLs were the stable /exec, which is a fact about the wire rather than a self-report. */
  eq(r.tp.metrics().recoveries, 1, 'C7  the bounded recovery is COUNTED, exactly once');
  eq(r.tp.metrics().retries, 1, 'C7a and counted once as a retry — the two counters agree');
}));

/* C8 — AND WHEN THE SECOND ATTEMPT ANSWERS, IT IS A SUCCESS AND COSTS TWO. */
CJOBS.push(runNet([alwaysRedirect404, okEnvelope]).then(function (r) {
  eq(r.seen.n, 2, 'C8  a transient redirect 404 recovers on the second attempt');
  eq(r.res.success, true, 'C8a and the caller is handed a success, not a failure it has to interpret');
}));

/* C9-C11 — THE THINGS THAT MUST NEVER BE RETRIED. Each is a SINGLE physical request. */
CJOBS.push(runNet([function () {
  return Promise.resolve(netResponse(200, 'text/html; charset=utf-8', HTML.signIn, ECHO_HOST, true));
}, okEnvelope]).then(function (r) {
  eq(r.seen.n, 1, 'C9  a sign-in page is NEVER retried — asking again cannot create a session');
  eq(r.res.code, 'AUTH_OR_ACCESS_HTML', 'C9a and it is named as an access fact');
}));

CJOBS.push(runNet([function () {
  return Promise.resolve(netResponse(404, 'text/html; charset=utf-8', HTML.notFound, EXEC, false));
}, okEnvelope]).then(function (r) {
  eq(r.seen.n, 1, 'C10 a 404 from the STABLE /exec itself is not retried — the address is wrong, not busy');
  eq(r.res.code, 'HTTP_NOT_FOUND_HTML', 'C10a and it is distinguished from the redirect-target 404');
}));

CJOBS.push(runNet([function () {
  return Promise.resolve(netResponse(200, 'application/json', JSON.stringify({
    apiVersion: '1.0', success: true, action: 'productPricing.workspace.get',
    meta: { action: 'productPricing.workspace.get', requestId: 'R10-C' }, data: {}
  }), EXEC, false));
}, okEnvelope]).then(function (r) {
  eq(r.seen.n, 1, 'C11 an answer to a DIFFERENT action is not retried — a repeat would be misrouted too');
  eq(r.res.code, 'RESPONSE_ACTION_MISMATCH', 'C11a and it is named as a mismatch');
}));

/* C12 — A WRITE IS NEVER AUTOMATICALLY REPLAYED, under the same fault that a read recovers from.
   This is the one asymmetry the whole policy exists for: the server may have committed after the
   browser stopped listening. */
CJOBS.push(runNet([alwaysRedirect404, alwaysRedirect404],
  { kind: 'write', action: 'productPricing.workspace.save' }).then(function (r) {
  eq(r.seen.n, 1, 'C12 a WRITE under the identical fault costs exactly one request — never replayed');
  eq(r.seen.methods, ['POST'], 'C12a and a write is never downgraded to a GET to make it retryable');
}));

/* C13 — and the policy says so on its own, without being driven. */
eq(TP.isAutoRetryable({ kind: 'write', code: 'REDIRECT_TARGET_NOT_FOUND' }), false,
  'C13 the policy refuses to auto-retry a write even for the one code reads recover from');
eq(TP.isAutoRetryable({ kind: 'read', code: 'REDIRECT_TARGET_NOT_FOUND' }), true,
  'C13a and allows it for a read, which is the whole of the R10 fix');
eq(TP.isAutoRetryable({ kind: 'read', code: 'AUTH_OR_ACCESS_HTML' }), false,
  'C13b an authorisation refusal is never retried');
eq(TP.isAutoRetryable({ kind: 'read', code: 'HTTP_NOT_FOUND_HTML' }), false,
  'C13c nor a 404 from the endpoint itself');
eq(TP.isAutoRetryable({ kind: 'read', code: 'REQUEST_TIMEOUT' }), false,
  'C13d nor a timeout — the bound already elapsed, and asking again doubles the wait');
eq(TP.isAutoRetryable({ kind: 'read', code: 'BACKEND_BUSINESS_REJECTION' }), false,
  'C13e nor a business refusal, which would refuse identically a second time');
eq(TP.isAutoRetryable({ kind: 'read', code: 'REQUEST_ABORTED' }), false,
  'C13f nor a request that was superseded — nobody is waiting for its answer any more');

/* C14 — THE CEILING IS NOT NEGOTIABLE FROM ABOVE. A caller asking for five gets one. */
CJOBS.push(runNet([alwaysRedirect404, alwaysRedirect404, alwaysRedirect404, alwaysRedirect404],
  { maxRetries: 5 }).then(function (r) {
  eq(r.seen.n, 2, 'C14 a caller that asks for five retries still gets exactly one');
}));
CJOBS.push(runNet([alwaysRedirect404, okEnvelope], { maxRetries: 0 }).then(function (r) {
  eq(r.seen.n, 1, 'C14a and a caller that asks for none gets none — the bound clamps both ways');
}));

/* C15 — NO READ IS ANYWHERE NEAR THE URL CEILING, which is the hypothesis §4 Q5 raised and closed. */
var probeUrl = TP.create({ baseUrl: EXEC }).readUrl('productPricing.workspace.get',
  { apiVersion: '1.0', action: 'productPricing.workspace.get',
    payload: { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } } }, 'R10-C');
ok(probeUrl.length < 1000, 'C15 a real workspace read is well under a thousand characters', probeUrl.length);
ok(TP.create({ baseUrl: EXEC }).READ_URL_MAX >= 6000,
  'C15a against a ceiling of at least six thousand — length was never the fault');

Promise.all(CJOBS).then(function () {

// ==================================================================================================
// THE BROWSER HALF
//
// R10 §3 is explicit: "不得用 Node-only 成功證明 browser 成功". Everything below runs in real Chrome
// against the shipped page. If there is no browser this round does not pass with a note — it stops.
// ==================================================================================================
var RUN = require(path.join(__dirname, '_p1b8c-visual-runner.js'));
var BROWSER = RUN.findBrowser();
var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-r10-'));
var PAGE_FILE = path.join(__dirname, '_p1b8c-acceptance.html');

var SITE_A = { company: 'KM', country: 'US', marketplace: 'Shopify' };
var SITE_B = { company: 'KM', country: 'US', marketplace: 'Walmart' };

/* THIS IS MUTANT 13 AS A STANDING GUARD rather than as a one-off probe: the suite cannot report a
   pass on the strength of its Node half alone. */
function browserHalf(body) {
  if (!BROWSER) {
    fail++;
    console.error('FAIL STOP_NO_BROWSER_AVAILABLE — R10 §3 forbids accepting this round on Node evidence.');
    process.exitCode = 2;
    return;
  }
  return body();
}

function trace(script, args, opts) {
  fs.writeFileSync(PAGE_FILE, RUN.buildPage(Object.assign(
    { capture: 'live', activated: true, site: SITE_A, script: script, scriptArgs: args, noSite: true },
    opts || {})), 'utf8');
  var r = RUN.shot(BROWSER, PAGE_FILE, OUT, { id: 'r10', w: 1440, h: 900 });
  if (!r.measurements) throw new Error('no measurements came back from the browser');
  if (!r.measurements.trace) {
    throw new Error('no trace came back (error: ' + JSON.stringify(r.measurements.error) + ')');
  }
  return r.measurements;
}
function tidy(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

return browserHalf(function () {

// ==================================================================================================
section('§D — THE PRODUCTION-LIKE MATRIX, in a browser, with the faults injected under a REAL transport');
// ==================================================================================================

/* Each row drives the SHIPPED page through one named network fault and records two things: what the
   operator is told, and how many physical requests it cost. Nothing here stubs the classifier or the
   retry — a fake `fetch` sits BENEATH a real transport, so what is measured is production's policy. */
function faultRun(name) {
  var m = trace('transport-fault', { first: SITE_A }, { netFault: name });
  var last = m.trace[m.trace.length - 1];
  return { text: tidy(m.stateText), attempts: last.physical ? last.physical.attempts : null,
    methods: last.physical ? last.physical.methods : null, mounted: last.mounted, m: m };
}

var D_404 = faultRun('redirect404');
ok(/nothing there|nothing to read/i.test(D_404.text),
  'D1  a 404 on the redirect target is reported as an address that answered and holds nothing',
  D_404.text);
ok(!/no server answered|not connected/i.test(D_404.text),
  'D1a and NOT as "no server answered" — the sentence R10 §5 forbids for exactly this case', D_404.text);
eq(D_404.attempts, 2, 'D2  and it costs exactly two physical requests: the read and one recovery');
eq(D_404.methods, ['GET', 'GET'], 'D2a both GET — no POST that a 302 could strip the body from');

var D_AUTH = faultRun('authHtml');
ok(/cannot read|sign in|account/i.test(D_AUTH.text),
  'D3  a Google sign-in page is reported as an account fact', D_AUTH.text);
ok(!/offline|not connected/i.test(D_AUTH.text),
  'D3a and never as offline — the page ARRIVED', D_AUTH.text);
eq(D_AUTH.attempts, 1, 'D4  and it is asked ONCE: a repeat cannot create a session');

var D_HTML = faultRun('genericHtml');
ok(/answered|not with a site list|could not be read/i.test(D_HTML.text),
  'D5  a generic HTML error page is reported as an unreadable answer', D_HTML.text);
ok(!/database|not connected/i.test(D_HTML.text),
  'D5a and does not blame the database for a server that replied', D_HTML.text);
eq(D_HTML.attempts, 1, 'D6  and is not retried — the same page would come back');

var D_OFF = faultRun('offline');
ok(/not connected|no server/i.test(D_OFF.text),
  'D7  a failure with NO response at all is the one case "not connected" describes', D_OFF.text);
eq(D_OFF.attempts, 2, 'D8  and it gets the one bounded recovery, because nothing was ever answered');

var D_ERR = faultRun('transportError');
ok(/not connected|no server/i.test(D_ERR.text), 'D9  and so is a transport error', D_ERR.text);
eq(D_ERR.attempts, 2, 'D10 with the same single recovery');

/* NO FAULT AT ALL — the control row. Without it, every count above could be explained by a page that
   simply never reads. */
var D_OK = trace('transport-fault', { first: SITE_A }, {});
var dOkLast = D_OK.trace[D_OK.trace.length - 1];
/* TWO READS, ONE REQUEST EACH — and the first draft of this line asserted ONE request in total,
   which is simply false about the page: loading a site is the site-universe read AND the workspace
   read. The property worth having is PER ACTION, because that is what a spurious retry would break,
   and a total would have hidden one action retrying while another was skipped. */
var dOkActions = Object.keys(dOkLast.physical.byAction);
ok(dOkActions.length >= 2, 'D11 a clean site load issues the universe read and the workspace read',
  dOkLast.physical.byAction);
dOkActions.forEach(function (a) {
  eq(dOkLast.physical.byAction[a], 1,
    'D11a and ' + a + ' costs exactly ONE request — nothing retries when nothing failed');
});
eq(tidy(D_OK.stateText), '', 'D12 and the operator is shown no error state at all', tidy(D_OK.stateText));
ok(dOkLast.mounted === true, 'D13 and the board is mounted, so the control row really did read');

/* EVERY FAULT IS AT MOST TWO REQUESTS. This is R10 §6's "同一使用者操作最多兩次實際request", stated
   once over the whole matrix so a new fault class cannot quietly acquire a third. */
[D_404, D_AUTH, D_HTML, D_OFF, D_ERR].forEach(function (row, i) {
  ok(row.attempts <= 2, 'D14 fault row ' + i + ' cost at most two physical requests', row.attempts);
});

/* AND NOT ONE OF THEM SHOWS THE OPERATOR AN ADDRESS. */
[D_404, D_AUTH, D_HTML, D_OFF, D_ERR].forEach(function (row, i) {
  ok(!/script\.google|googleusercontent|macros\/s\/|AKfyc|km_rid=|km_body=/i.test(row.text),
    'D15 fault row ' + i + ' shows no endpoint, request id or redirect token', row.text);
});

// ==================================================================================================
section('§E — THE RECOVERY DOES NOT FLICKER: loading, then data. Never an error in between.');
// ==================================================================================================

/* R10 §6: "retry期間UI維持 loading，不先畫錯誤再跳回成功". A run that only looked at the END could not
   tell a clean recovery from an error that flashed and was replaced, so this samples DURING the
   outstanding read as well as after it. */
var REC = trace('transport-recovery', { first: SITE_A },
  { netFault: 'redirect404', netFaultOnce: true });
var rSteps = REC.trace;

ok(rSteps.length >= 3, 'E1  the recovery was sampled mid-flight as well as at rest', rSteps.length);

/* AN EMPTY STRING IS NOT THE TEST, AND THE FIRST DRAFT OF THIS LINE THOUGHT IT WAS. Before anything
   is chosen the page correctly says "Select a company, country and marketplace to begin" — an
   instruction, not a refusal. What §6 forbids is a FAILURE being painted and then replaced by a
   success, so the thing to look for is a refusal state, by name. Every state the accessor can
   produce is appended to the rendered text, which is what makes this checkable rather than a guess
   about wording. */
var REFUSAL_STATES = ACC.CLIENT_TRANSPORT_STATES.concat(['FEATURE_DISABLED', 'SCHEMA_CONTRACT_MISMATCH']);
function refusalShown(s) {
  var txt = tidy(s && s.stateText);
  return REFUSAL_STATES.some(function (st) { return txt.indexOf(st) > -1; });
}
var midErrors = rSteps.slice(0, rSteps.length - 1).filter(refusalShown);
ok(midErrors.length === 0,
  'E2  NO error state is ever drawn while the recovery is outstanding',
  midErrors.map(function (s) { return s.step + ' :: ' + tidy(s.stateText).slice(0, 120); }));

var settled = rSteps[rSteps.length - 1];
ok(!refusalShown(settled), 'E3  and none at rest either — the second attempt answered',
  tidy(settled.stateText).slice(0, 120));
ok(settled.mounted === true, 'E4  the board is mounted from the RECOVERED read');
ok(settled.board && settled.board.viewChildren > 0,
  'E5  and it actually drew something', settled.board && settled.board.viewChildren);

/* The first attempt failed, so the physical count proves the recovery happened rather than the fault
   simply not having applied. */
ok(rSteps[0].physical.attempts >= 2,
  'E6  the first attempt really did fail — this is a recovery, not a fault that missed',
  rSteps[0].physical.attempts);
/* P1-B8D-R10A — THE THIRD READ JOINS THE COUNT, AND THAT IS THE PROOF IT MOVED.

   This bound was 3 and is now 4, for one reason: the capability read (`system.health`) used to go
   out through the foundation's private POST shim, which this harness's fake `fetch` never saw. It
   goes through KM.transport now, so it is COUNTED — capability + its one recovery + universe +
   workspace. A count that did NOT move would have meant the migration had not taken effect, which is
   why the increase is asserted as a floor as well as a ceiling. */
ok(settled.physical.attempts <= 4,
  'E7  and the whole sequence stays bounded — no retry loop', settled.physical.attempts);
ok(settled.physical.attempts >= 4,
  'E7a and the capability read is one of the counted requests — it is on the shared transport now',
  settled.physical.attempts);

// ==================================================================================================
section('§F — A RECOVERY FOR A SITE NOBODY IS ON MUST NOT LAND');
// ==================================================================================================

/* R10 §6: "stale retry must not overwrite a new site" and "site switch must cancel/supersede". */
/* ATTEMPTS 1 AND 2 ARE SITE A AND ITS ONE BOUNDED RECOVERY, AND BOTH FAIL. Attempt 3 is site B and
/* THE FAULT IS AIMED AT SITE A BY NAME, not at a range of attempt numbers. Site B is chosen while A
   is still outstanding, so the two sites' reads interleave and an attempt number cannot reliably
   name either of them — an earlier version of this line faulted attempts 2-3 and hit site B's first
   read instead of site A's recovery. Site A fails through its whole bounded sequence; site B is
   untouched and must succeed, which is the only arrangement in which a stale answer has something
   to overwrite and can be seen not to. */
var SW = trace('fault-site-switch', { first: SITE_A, second: SITE_B },
  { netFault: 'redirect404', netFaultWhen: SITE_A.marketplace, netFaultSlowMs: 300 });
var swFirst = SW.trace[0];
var swLast = SW.trace[SW.trace.length - 1];

ok(swLast.mounted === true,
  'F1  after switching to site B the board belongs to B and is mounted');
ok(!refusalShown({ stateText: SW.stateText }),
  'F2  the failed recovery for site A does not paint its error over site B',
  tidy(SW.stateText).slice(0, 140));
/* R10A — five, for the same reason E7 is four: capability(1) + universe(1) + site A(1) + A's one
   bounded recovery(1) + site B(1). The fault is aimed at site A by name, so neither the capability
   read nor site B is touched by it. */
ok(swLast.physical.attempts <= 5,
  'F3  and the switch does not multiply requests — A bounded, then B', swLast.physical.attempts);
ok(swFirst.physical.attempts >= 1,
  'F4  site A really was outstanding when B was chosen', swFirst.physical.attempts);
ok(swLast.board && swLast.board.viewChildren > 0,
  'F5  and site B drew its own board rather than inheriting the board site A left',
  swLast.board && swLast.board.viewChildren);


// ==================================================================================================
section('§G — NOTHING THIS ROUND TOUCHED MAY HAVE COST R8/R9 THEIR PROPERTIES');
// ==================================================================================================

/* R10 §9 lists what must still hold. The R8 and R9 suites assert all of it and are re-run in this
   round's sweep; what belongs HERE is the handful that changing the READ ROUTE could plausibly break,
   measured through the new route rather than the old one. */

var LR = trace('leave-return', { first: SITE_A });
var lrBoard = LR.trace.filter(function (s) { return !!s.board; });
var lrLast = lrBoard[lrBoard.length - 1];
ok(lrLast.workspaceRequests <= 1,
  'G1  leaving Product Strategy and coming back issues NO second workspace read',
  lrLast.workspaceRequests);
ok(!refusalShown(LR.trace[LR.trace.length - 1]),
  'G2  and returning does not land the operator in a refusal');

var TD = trace('deferred-teardown', { first: SITE_A, second: SITE_B },
  { slowSite: SITE_B, slowMs: 700 });
var tdBoard = TD.trace.filter(function (s) { return !!s.board; });
eq(tdBoard[tdBoard.length - 1].workspaceRequests, 2,
  'G3  a site switch is exactly two workspace reads — site A, then site B, and no third');

/* R10 §11: NO WRITE MAY BE ADDED BY THIS ROUND. That is a property of the source, so it is asserted
   against the source rather than inferred from a run that happened not to write. */
eq(/kind:\s*'write'/.test(accCode), false,
  'G4  the Product Strategy accessor dispatches no write of any kind');
eq(/tp\.request\(/g.test(accCode) && /kind:\s*'read'/.test(accCode), true,
  'G5  every dispatch it does make is declared a read');

// ==================================================================================================
section('§Z — THE MUTANTS. R10 §10 asks for zero survivors and zero broken probes.');
// ==================================================================================================

/* Every mutant edits a REAL SHIPPED FILE, runs the check that is supposed to catch it, and puts the
   file back — always, including on a throw. A mutant whose probe THROWS is scored as a SURVIVOR: "the
   probe broke" is not evidence that the property holds, and R10 §10 asks for zero of both. */
function fresh(rel) {
  var full = path.join(ROOT, rel);
  delete require.cache[require.resolve(full)];
  return require(full);
}
/**
 * SOME PROPERTIES ARE GUARDED TWICE, and a one-line mutant cannot tell you that — it just survives,
 * which reads exactly like a missing assertion. This applies a SET of edits as one mutant, so a
 * defence in depth can be removed in full and the assertion underneath can be shown to catch it.
 */
function mutateAll(label, rel, edits, probe) {
  return function () {
    var full = path.join(ROOT, rel);
    var original = fs.readFileSync(full, 'utf8');
    var src = original.replace(/\r\n/g, '\n');
    function restore() {
      fs.writeFileSync(full, original, 'utf8');
      try { fresh(rel); } catch (e) { /* the unmutated file is back */ }
    }
    for (var k = 0; k < edits.length; k++) {
      var hits = src.split(edits[k][0]).length - 1;
      if (hits !== 1) {
        neg.missed++; fail++;
        console.error('FAIL ' + label + ' — PROBE ERROR: edit ' + k + ' matched ' + hits + ' times');
        return Promise.resolve();
      }
      src = src.replace(edits[k][0], edits[k][1]);
    }
    fs.writeFileSync(full, src, 'utf8');
    return Promise.resolve().then(probe).then(function (r) {
      restore(); score(label, r === true);
    }, function (e) {
      restore(); neg.missed++; fail++;
      console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    });
  };
}
function mutate(label, rel, from, to, probe) {
  return function () {
    var full = path.join(ROOT, rel);
    var original = fs.readFileSync(full, 'utf8');
    var normalized = original.replace(/\r\n/g, '\n');
    var hits = normalized.split(from).length - 1;
    function restore() {
      fs.writeFileSync(full, original, 'utf8');
      try { fresh(rel); } catch (e) { /* the unmutated file is back; a stale cache entry is not */ }
    }
    if (hits !== 1) {
      neg.missed++; fail++;
      console.error('FAIL ' + label + ' — PROBE ERROR: anchor matched ' + hits + ' times in ' + rel);
      return Promise.resolve();
    }
    fs.writeFileSync(full, normalized.replace(from, to), 'utf8');
    return Promise.resolve().then(probe).then(function (r) {
      restore();
      score(label, r === true);
    }, function (e) {
      restore();
      neg.missed++; fail++;
      console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    });
  };
}

/** One read through a freshly-loaded (possibly mutated) transport, reporting what the network saw. */
function mutRun(plan, opts) {
  var T = fresh(TRANSPORT_REL);
  var seen = { urls: [], methods: [], n: 0 };
  var tp = T.create({
    baseUrl: EXEC, sleep: function () { return Promise.resolve(); },
    random: function () { return 0.5; },
    fetch: function (url, init) {
      var n = ++seen.n;
      seen.urls.push(String(url));
      seen.methods.push((init && init.method) || 'GET');
      var step = plan[Math.min(n, plan.length) - 1];
      return (typeof step === 'function') ? step(n, String(url)) : step;
    }
  });
  return tp.request(Object.assign({ action: 'productPricing.siteUniverse.get', kind: 'read',
    requestId: 'R10-Z', payload: { apiVersion: '1.0', action: 'productPricing.siteUniverse.get' } },
    opts || {})).then(function (res) { return { res: res, seen: seen }; });
}
function ridOf(u) {
  var m = /[?&]km_rid=([^&]*)/.exec(String(u));
  return m ? decodeURIComponent(m[1]) : '';
}

var MUT = [];

// ---- the recovery's ADDRESS -----------------------------------------------------------------
/* Z1 — the failed redirect target is re-requested instead of the stable /exec. This is the exact
   shape R10 §6 forbids by name, and the one the live 404 would have made tempting. Caught by C4/C4a. */
MUT.push(mutate('Z1  the recovery is sent to the redirect target that just 404d',
  TRANSPORT_REL,
  '        var url = urlFor(attemptRid);',
  '        var url = (n > 1) ? (\'https://script.googleusercontent.com/macros/echo?km_rid=\' + attemptRid) : urlFor(attemptRid);',
  function () {
    return mutRun([alwaysRedirect404, alwaysRedirect404]).then(function (r) {
      return r.seen.urls.some(function (u) { return u.indexOf('googleusercontent') > -1; });
    });
  }));

/* Z2 — the recovery reuses the first attempt's request id, so its answer would be correlated to a
   request that is no longer the one outstanding. Caught by C5a. */
MUT.push(mutate('Z2  the recovery reuses the first attempt request id',
  TRANSPORT_REL,
  'function ridForAttempt(n) { return (n <= 1 || !requestId) ? requestId : (requestId + \'-R\' + n); }',
  'function ridForAttempt(n) { return requestId; }',
  function () {
    return mutRun([alwaysRedirect404, alwaysRedirect404]).then(function (r) {
      return r.seen.urls.length === 2 && ridOf(r.seen.urls[0]) === ridOf(r.seen.urls[1]);
    });
  }));

// ---- the BOUND ------------------------------------------------------------------------------
/* Z3 — the ceiling is raised, so a read can retry twice. Caught by C1/C14. */
MUT.push(mutate('Z3  the retry ceiling is raised above one',
  TRANSPORT_REL,
  'Math.max(0, Math.min(1, opts.maxRetries)) : 1);',
  'Math.max(0, Math.min(3, opts.maxRetries)) : 3);',
  function () {
    return mutRun([alwaysRedirect404, alwaysRedirect404, alwaysRedirect404, alwaysRedirect404])
      .then(function (r) { return r.seen.n > 2; });
  }));

/* Z4 — the read stops retrying at all, so the live transient 404 goes straight to the operator. This
   is the mutant that proves the fix is load-bearing rather than incidental. Caught by C8/E4/E6. */
MUT.push(mutate('Z4  reads stop retrying entirely — the R10 fix is removed',
  TRANSPORT_REL,
  'var maxRetries = (kind === \'write\') ? 0 :',
  'var maxRetries = (kind === \'write\' || kind === \'read\') ? 0 :',
  function () {
    return mutRun([alwaysRedirect404, okEnvelope]).then(function (r) {
      return r.seen.n === 1 && r.res.success !== true;
    });
  }));

/* Z5 — A WRITE BECOMES RETRYABLE. The server may have committed after the browser stopped listening,
   which is why this is the one asymmetry the whole policy exists for. Caught by C12/C13. */
MUT.push(mutate('Z5  a write becomes automatically retryable',
  TRANSPORT_REL,
  '    if (str(o.kind) === \'write\') return false;',
  '    if (str(o.kind) === \'write\') { /* mutant */ }',
  function () {
    var T = fresh(TRANSPORT_REL);
    return T.isAutoRetryable({ kind: 'write', code: 'REDIRECT_TARGET_NOT_FOUND' }) === true;
  }));

/* Z6 — AN AUTHORISATION REFUSAL IS RETRIED, and it took two failed mutants to state this properly.

   The first removed AUTH_OR_ACCESS_HTML from NEVER_AUTO_RETRY_CODES. It survived. The second added
   the code to the positive branch of `isAutoRetryable`. It survived too. Neither was a gap in the
   assertions: an auth refusal is guarded TWICE, independently — the blocklist is consulted before
   the allowlist, and the allowlist ends in `return false`, so either one alone is sufficient to keep
   a sign-in page from being asked for a second time.

   That is worth knowing rather than working around, so the mutant removes BOTH locks. C9 catches it,
   which is the thing that had to be proven: the assertion is load-bearing, and the redundancy in the
   source is redundancy rather than confusion. */
MUT.push(mutateAll('Z6  a sign-in page is retried (both of its guards removed)',
  TRANSPORT_REL,
  [['CODES.API_ENDPOINT_CONFIGURATION_INVALID, CODES.HTTP_NOT_FOUND_HTML, CODES.AUTH_OR_ACCESS_HTML,',
    'CODES.API_ENDPOINT_CONFIGURATION_INVALID, CODES.HTTP_NOT_FOUND_HTML,'],
   ['    if (code === CODES.REDIRECT_TARGET_NOT_FOUND) return true;',
    '    if (code === CODES.REDIRECT_TARGET_NOT_FOUND || code === CODES.AUTH_OR_ACCESS_HTML) return true;']],
  function () {
    return mutRun([function () {
      return Promise.resolve(netResponse(200, 'text/html; charset=utf-8', HTML.signIn, ECHO_HOST, true));
    }, okEnvelope]).then(function (r) { return r.seen.n > 1; });
  }));

/* Z7 — reads go back to POST, which is the defect this whole round is about: an /exec POST loses its
   body across the 302 it always answers with. Caught by C6/C6a. */
MUT.push(mutate('Z7  reads are dispatched as POST again',
  TRANSPORT_REL,
  '          ? { method: \'GET\', cache: \'no-store\' }',
  '          ? { method: \'POST\', cache: \'no-store\' }',
  function () {
    return mutRun([okEnvelope]).then(function (r) { return r.seen.methods[0] === 'POST'; });
  }));

// ---- the WORDS ------------------------------------------------------------------------------
/* Z8 — a 404 is reported as "no server answered", which R10 §5 forbids by name. Caught by B1/D1a. */
MUT.push(mutate('Z8  a 404 is classified as SOURCE_NOT_CONNECTED',
  ACC_REL,
  '      || status === 404) return \'HTTP_NOT_FOUND\';',
  '      || status === 404) return \'SOURCE_NOT_CONNECTED\';',
  function () {
    return fresh(ACC_REL).classifyTransportCode('HTTP_NOT_FOUND_HTML', 404, true) !== 'HTTP_NOT_FOUND';
  }));

/* Z9 — a sign-in page is reported as offline. Caught by B4/B5/D3a. */
MUT.push(mutate('Z9  an auth page is classified as BROWSER_OFFLINE',
  ACC_REL,
  'if (code === \'AUTH_OR_ACCESS_HTML\' || status === 401 || status === 403) return \'NOT_AUTHORIZED\';',
  'if (status === 401 || status === 403) return \'NOT_AUTHORIZED\';',
  function () {
    var m = fresh(ACC_REL);
    return m.classifyTransportCode('AUTH_OR_ACCESS_HTML', 200, false) !== 'NOT_AUTHORIZED';
  }));

/* Z10 — a timeout is reported as a permission error. Caught by B7. */
MUT.push(mutate('Z10 a timeout is classified as NOT_AUTHORIZED',
  ACC_REL,
  'if (code === \'REQUEST_TIMEOUT\' || code === \'REQUEST_TIMEOUT_WRITE_INDETERMINATE\') return \'SOURCE_TIMED_OUT\';',
  'if (code === \'REQUEST_TIMEOUT\' || code === \'REQUEST_TIMEOUT_WRITE_INDETERMINATE\') return \'NOT_AUTHORIZED\';',
  function () {
    return fresh(ACC_REL).classifyTransportCode('REQUEST_TIMEOUT', null, true) !== 'SOURCE_TIMED_OUT';
  }));

/* Z11 — a KNOWN status is discarded because the code was not recognised, which R10 §5 forbids
   ("response status/content-type已知時不得丟失"). Caught by B3/B11. */
MUT.push(mutate('Z11 a known 404 status is dropped when the code is unfamiliar',
  ACC_REL,
  '      || status === 404) return \'HTTP_NOT_FOUND\';',
  '      ) return \'HTTP_NOT_FOUND\';',
  function () {
    return fresh(ACC_REL).classifyTransportCode('SOME_FUTURE_CODE', 404, true) !== 'HTTP_NOT_FOUND';
  }));

/* Z12 — an answer to a DIFFERENT request collapses back into "no server answered". This is the one
   failure that could otherwise have put another site's numbers on a price axis. Caught by B13/D5a. */
MUT.push(mutate('Z12 a mismatched envelope is reported as a missing network',
  ACC_REL,
  '      return \'ACTION_MISMATCH\';\n    }\n    if (code === \'SERVER_SENT_A_CLIENT_ONLY_STATE\')',
  '      return \'SOURCE_NOT_CONNECTED\';\n    }\n    if (code === \'SERVER_SENT_A_CLIENT_ONLY_STATE\')',
  function () {
    return fresh(ACC_REL).stateForValidationCode('RESPONSE_ACTION_MISMATCH') !== 'ACTION_MISMATCH';
  }));

/* Z13 — A WHITELIST THAT SILENTLY DEGRADES. Removing a state from CLIENT_ONLY_REFUSALS throws no
   error and breaks no schema: the page simply renders it as "No server answered". That silence is
   precisely why it is asserted. Caught by B17. */
MUT.push(mutate('Z13 HTTP_NOT_FOUND is dropped from the site-universe refusal whitelist',
  UNIVERSE_REL,
  '\'NOT_AUTHORIZED\', \'RESPONSE_NOT_READABLE\', \'HTTP_NOT_FOUND\', \'ACTION_MISMATCH\'];\n\n  /* P1-B8D-R10 §5 — HTTP_NOT_FOUND and ACTION_MISMATCH join the vocabulary.',
  '\'NOT_AUTHORIZED\', \'RESPONSE_NOT_READABLE\', \'ACTION_MISMATCH\'];\n\n  /* P1-B8D-R10 §5 — HTTP_NOT_FOUND and ACTION_MISMATCH join the vocabulary.',
  function () {
    return fresh(UNIVERSE_REL).CLIENT_ONLY_REFUSALS.indexOf('HTTP_NOT_FOUND') === -1;
  }));

/* Z14 — and the same silence one map over: wording removed, so the operator gets the forbidden
   sentence about a server that answered. Caught by B16. */
MUT.push(mutate('Z14 the 404 wording is removed, so the page falls back to "No server answered"',
  UNIVERSE_REL,
  '    HTTP_NOT_FOUND: { may_choose: false, severity: \'stop\',',
  '    HTTP_NOT_FOUND_DISABLED_BY_MUTANT: { may_choose: false, severity: \'stop\',',
  function () {
    return !fresh(UNIVERSE_REL).UX.HTTP_NOT_FOUND;
  }));

/* Z15 — an endpoint leaks into something an operator is shown. Caught by B22/D15. */
MUT.push(mutate('Z15 an endpoint address leaks into operator-facing wording',
  UNIVERSE_REL,
  '    SOURCE_NOT_CONNECTED: {',
  '    LEAKED: { headline: \'https://script.google.com/macros/s/AKfycbxLEAKED/exec\' },\n    SOURCE_NOT_CONNECTED: {',
  function () {
    var U = fresh(UNIVERSE_REL);
    return /script\.google\.com|AKfyc|macros\/s\//i.test(JSON.stringify(U.UX));
  }));


/* Z16 — THE WHOLE ROUND, UNDONE IN ONE LINE: the accessor goes back to the foundation's private POST
   shim. Nothing throws and nothing looks broken — the read simply bypasses the endpoint classifier,
   the HTML fingerprint and the recovery, exactly as it did live. The tell is that an injected network
   fault stops being visible at all, because the shim never touches `fetch`. Caught by §D. */
MUT.push(mutate('Z16 the accessor goes back to the private POST shim',
  ACC_REL,
  '      return (t && typeof t.request === \'function\') ? t : null;',
  '      return null;',
  function () {
    var m = trace('transport-fault', { first: SITE_A }, { netFault: 'redirect404' });
    return !/nothing there|nothing to read/i.test(tidy(m.stateText));
  }));

/* Z17 — THE STALE-ANSWER GUARD IS REMOVED, so site A's late failure lands on site B. This is R10 §6's
   "stale retry must not overwrite a new site", and it is a browser mutant because the race it depends
   on does not exist anywhere else. Caught by F1/F2/F5. */
MUT.push(mutate('Z17 a superseded read is allowed to land on the site that replaced it',
  'assets/js/pages/product-strategy-board.js',
  '          if (myToken !== C.token) {',
  '          if (false) {',
  function () {
    var m = trace('fault-site-switch', { first: SITE_A, second: SITE_B },
      { netFault: 'redirect404', netFaultWhen: SITE_A.marketplace, netFaultSlowMs: 300 });
    return refusalShown({ stateText: m.stateText });
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
