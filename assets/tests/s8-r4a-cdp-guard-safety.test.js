// S8-R4A — CDP REQUEST GUARD SAFETY SUITE.
//
// The R4A guard is the thing that will stand between a real browser and Production. S8-R3B's harness only had
// to refuse requests it was asked to build; this one has to refuse requests the PAGE builds, which is a
// different and much less forgiving problem — the page does not know it is being measured.
//
// THE REGRESSION THIS SUITE EXISTS FOR. The first version of the guard classified by HOST first: "is this
// script.google.com?" and everything else was third-party, therefore allowed. The local interception proof
// aimed gapJob.status.get at a sink on 127.0.0.1 and the sink recorded it arriving. A guard whose refusal
// depends on the destination is not refusing the action, it is refusing one address for it. Section B is that
// defect, written down so it cannot come back.
//
// WHAT IT PROVES
//   A  the pinned router vocabulary still matches 01_router.gs — no drift, re-derived every run
//   B  the action decides BEFORE the host, so a forbidden action is refused wherever it is pointed
//   C  the five traffic classes each have one policy, and the application is never blocked from loading
//   D  a decision becomes the matching CDP command — abort cannot silently become continue
//   E  the ledger counts what §12 names
//   F  amplification detection ignores first-return caching and only calls a monotonic rise a leak
//   G  the CDP constants encode REQUEST_SENT_BEFORE_DECISION = NO, at the Request stage
//   H  the proof tool contacts no real endpoint and would fail closed without TLS
//
// NO BROWSER. NO NETWORK. NO PRODUCTION READ. This suite is pure functions and source text; the browser proof
// is a separate tool (s8-r4a-cdp-proof.js) because launching Chrome inside the sweep would make 600 suites
// hostage to a browser install.
// TEST_DATA_CLASSIFICATION = FIXTURES_AND_SOURCE_TEXT   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s8-r4a-cdp-guard-safety.test.js

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var TOOLS = 'tools/s8-fatigue/';
var G_F = TOOLS + 's8-r4a-cdp-guard.js';
var AL_F = TOOLS + 's8-r3b-read-allowlist.js';
var PROOF_F = TOOLS + 's8-r4a-cdp-proof.js';
var ROUTER_F = 'specs/active/apps-script/01_router.gs';

var G = require(path.join(ROOT, G_F));
var AL = require(path.join(ROOT, AL_F));
var GSRC = read(G_F), PROOF = read(PROOF_F), ROUTER = read(ROUTER_F);

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
function loadMutated(rel, from, to) {
  var src = read(rel);
  if (src.indexOf(from) === -1) throw new Error('mutation anchor not found in ' + rel + ': ' + from);
  var mod = { exports: {} };
  new Function('module', 'exports', 'require', src.replace(from, to))(mod, mod.exports, function () {
    throw new Error('the guard must not require anything');
  });
  return mod.exports;
}
function mut(label, rel, from, to, probe) {
  mutants++;
  var caught = false;
  try { caught = probe(loadMutated(rel, from, to)) === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// The injected context every classify() call uses. One allowlist in the system, injected, never duplicated.
var CTX = { decide: AL.decide, actionOf: AL.actionFromRequest, isKnownAction: AL.isKnownAction,
            pageHost: 'kitchen-mama.github.io' };
var EXEC = 'https://script.google.com/macros/s/AKfycbEXAMPLE/exec';

// ============================================================================================================
section('A. THE PINNED ROUTER VOCABULARY STILL MATCHES THE ROUTER');
// ============================================================================================================
// Re-derived from 01_router.gs on every run. A pinned list that nobody re-checks becomes a stale list, and a
// stale list here means an action the router gained is no longer recognised as an application action at all —
// which, after section B, is exactly the condition under which it would be waved through as third-party.
var getTbl = ROUTER.slice(ROUTER.indexOf('function rtrGetReadHandlers_'), ROUTER.indexOf('function rtrGetReadActionList_'));
var derivedGet = (getTbl.match(/'[a-zA-Z][a-zA-Z0-9.]*':/g) || []).map(function (s) { return s.slice(1, -2); });
var supported = /Supported: ([^']+)'/.exec(ROUTER);
var derivedPost = supported ? supported[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
var derivedBranch = (ROUTER.match(/action === '([a-zA-Z][a-zA-Z0-9.]*)'/g) || [])
  .map(function (s) { return /'([^']+)'/.exec(s)[1]; });
var derived = derivedGet.concat(derivedPost).concat(derivedBranch)
  .filter(function (a, i, z) { return z.indexOf(a) === i; }).sort();
eq(AL.ROUTER_VOCABULARY, derived, 'A1  the pinned vocabulary equals the router\'s own');
ok(derived.length > 100, 'A2  …and it is the whole vocabulary, not a fragment', derived.length);
eq(derivedGet.length, 24, 'A3  the GET read table is 24 actions');
// Every approved and every forbidden action is a real router action. A name that is not routed cannot be
// measured and cannot be refused for a reason that means anything.
AL.approvedActions().forEach(function (a) {
  ok(AL.ROUTER_VOCABULARY.indexOf(a) !== -1, 'A4  approved ' + a + ' is a real router action');
});
Object.keys(AL.FORBIDDEN_ACTIONS).forEach(function (a) {
  ok(AL.ROUTER_VOCABULARY.indexOf(a) !== -1, 'A5  forbidden ' + a + ' is a real router action');
});
ok(AL.isKnownAction('gapJob.status.get'), 'A6  the forbidden poll is a known action');
ok(AL.isKnownAction('adjustFactoryInventory'), 'A7  a write nobody approved is still a known action');
ok(!AL.isKnownAction('click'), 'A8  an ordinary query param value is not an action');
ok(!AL.isKnownAction(''), 'A9  an empty string is not an action');

// ============================================================================================================
section('B. THE ACTION DECIDES BEFORE THE HOST — the regression the proof caught');
// ============================================================================================================
// A forbidden action aimed anywhere at all must be refused. These are the exact shapes that got through.
['https://script.google.com/macros/s/AKfycbEXAMPLE/exec?action=gapJob.status.get',
 'http://127.0.0.1:54755/exec?action=gapJob.status.get&km_via=get',
 'https://example.com/anything?action=gapJob.status.get',
 'https://kitchen-mama.github.io/proxy?action=gapJob.status.get'].forEach(function (u, i) {
  var d = G.classify({ url: u, method: 'GET' }, CTX);
  ok(d.allow === false, 'B1.' + i + ' gapJob.status.get refused at ' + u.slice(8, 40), d);
  ok(d.cls === G.CLASS.FORBIDDEN_ACTION, 'B2.' + i + ' …and classified FORBIDDEN, not third-party', d.cls);
});
// From a POST body too — the action does not have to be in the URL.
var dBody = G.classify({ url: 'https://example.com/x', method: 'POST',
  postData: JSON.stringify({ action: 'gapJob.status.get' }) }, CTX);
ok(dBody.allow === false && dBody.cls === G.CLASS.FORBIDDEN_ACTION,
  'B3  a forbidden action in a POST body is refused at any host', dBody);
// A known-but-unapproved action is refused wherever it is pointed, too.
['adjustFactoryInventory', 'pricing.update', 'inventoryReplenishmentGap.recalculate.all'].forEach(function (a) {
  var d = G.classify({ url: 'https://example.com/x?action=' + a, method: 'POST' }, CTX);
  ok(d.allow === false, 'B4  the unapproved action ' + a + ' is refused off-host', d);
});
// And the ordering is in the source, not only in the behaviour: the action is extracted before isApp is formed.
var cls = GSRC.slice(GSRC.indexOf('function classify'), GSRC.indexOf('function out('));
ok(cls.indexOf('var action =') < cls.indexOf('var isApp ='),
  'B5  the source extracts the action before deciding whether it is an application request');
ok(/known/.test(cls) && cls.indexOf('|| known') !== -1, 'B6  a known action makes the request an application request');

// ============================================================================================================
section('C. THE FIVE TRAFFIC CLASSES, AND THE APPLICATION STILL LOADS');
// ============================================================================================================
eq(Object.keys(G.CLASS).length, 5, 'C1  five classes');
Object.keys(G.CLASS).forEach(function (k) {
  ok(typeof G.POLICY[G.CLASS[k]] === 'string' && G.POLICY[G.CLASS[k]].length > 30,
    'C2  ' + G.CLASS[k] + ' has a stated policy');
});
// The failure a narrow guard causes: blocking the app's own assets, so the page never renders and the
// measurement looks like a performance finding.
['https://kitchen-mama.github.io/assets/css/layout.css',
 'https://kitchen-mama.github.io/assets/html/pages/fc-summary.html',
 'https://kitchen-mama.github.io/assets/js/pages/fc-summary.js',
 'https://fonts.googleapis.com/css2?family=Inter',
 '/assets/img/logo.png'].forEach(function (u, i) {
  var d = G.classify({ url: u, method: 'GET' }, CTX);
  ok(d.allow === true, 'C3.' + i + ' static asset continues: ' + u.slice(0, 48), d);
});
// A partial-load HTML fetch carries no action and is same-origin — it must never be mistaken for an app request.
var dPartial = G.classify({ url: 'https://kitchen-mama.github.io/assets/html/pages/factory-stock.html', method: 'GET' }, CTX);
eq(dPartial.cls, G.CLASS.STATIC_ASSET, 'C4  a page partial is a static asset');
// The /exec redirect target must pass or no answer ever arrives.
var dEcho = G.classify({ url: 'https://script.googleusercontent.com/macros/echo?user_content_key=abc', method: 'GET' }, CTX);
ok(dEcho.allow === true && dEcho.code === 'EXEC_REDIRECT_TARGET', 'C5  the /exec echo target continues', dEcho);
// A Google interstitial stays observable rather than being converted to a success — S8-R3B F3 needs it.
ok(/observable/.test(G.POLICY[G.CLASS.THIRD_PARTY]), 'C6  the third-party policy says the chain is recorded');
// An application-host request with no recognisable action is UNKNOWN and aborted.
var dNoAct = G.classify({ url: 'https://script.google.com/macros/s/AKfycbEXAMPLE/exec', method: 'GET' }, CTX);
ok(dNoAct.allow === false && dNoAct.cls === G.CLASS.UNKNOWN, 'C7  an actionless application request aborts', dNoAct);
ok(/rule 2/.test(G.POLICY[G.CLASS.UNKNOWN]), 'C8  …and the policy names the standing-gate rule it enforces');
// The approved read, at the right host and verb, continues.
var dOk = G.classify({ url: EXEC + '?action=fcSummary.workspace.get&km_via=get', method: 'GET' }, CTX);
ok(dOk.allow === true && dOk.cls === G.CLASS.APPROVED_READ, 'C9  an approved read continues', dOk);
eq(dOk.action, 'fcSummary.workspace.get', 'C10 …and the action is recorded');
// The same read on the wrong verb does not.
var dVerb = G.classify({ url: EXEC + '?action=fcSummary.workspace.get', method: 'POST' }, CTX);
ok(dVerb.allow === false, 'C11 an approved read on the wrong verb aborts', dVerb);
// Non-network schemes never reach the network and must not be aborted.
['data:text/html,x', 'blob:https://x/y', 'about:blank'].forEach(function (u) {
  ok(G.classify({ url: u, method: 'GET' }, CTX).allow === true, 'C12 ' + u.slice(0, 12) + ' continues');
});
// Deny by default when no decider is injected — a misconfigured run refuses rather than permits.
var dNoDecider = G.classify({ url: EXEC + '?action=fcSummary.workspace.get', method: 'GET' },
  { actionOf: AL.actionFromRequest, isKnownAction: AL.isKnownAction });
ok(dNoDecider.allow === false, 'C13 with no decider injected, an application read is refused', dNoDecider);

// ============================================================================================================
section('D. A DECISION BECOMES THE MATCHING CDP COMMAND');
// ============================================================================================================
var cAllow = G.commandFor({ allow: true }, 'req-1');
var cAbort = G.commandFor({ allow: false }, 'req-2');
eq(cAllow.method, 'Fetch.continueRequest', 'D1  allow -> continueRequest');
eq(cAbort.method, 'Fetch.failRequest', 'D2  refuse -> failRequest');
eq(cAbort.params.errorReason, 'BlockedByClient', 'D3  …with a named reason');
eq(cAllow.params.requestId, 'req-1', 'D4  the request id is carried');
ok(JSON.stringify(cAbort).indexOf('continueRequest') === -1, 'D5  an abort cannot also continue');

// ============================================================================================================
section('E. THE LEDGER COUNTS WHAT §12 NAMES');
// ============================================================================================================
var L = G.newLedger();
['REQUEST_COUNT_TOTAL', 'APPLICATION_READ_REQUEST_COUNT', 'FORBIDDEN_REQUEST_ABORT_COUNT',
 'UNKNOWN_REQUEST_ABORT_COUNT', 'STATIC_ASSET_REQUEST_COUNT', 'THIRD_PARTY_REQUEST_COUNT'].forEach(function (k) {
  ok(L[k] === 0, 'E1  ' + k + ' starts at zero');
});
G.record(L, G.classify({ url: EXEC + '?action=fcSummary.workspace.get', method: 'GET' }, CTX));
G.record(L, G.classify({ url: EXEC + '?action=fcSummary.workspace.get', method: 'GET' }, CTX));
G.record(L, G.classify({ url: EXEC + '?action=gapJob.status.get', method: 'GET' }, CTX));
G.record(L, G.classify({ url: 'https://x.github.io/a.css', method: 'GET' }, CTX));
G.record(L, G.classify({ url: EXEC, method: 'GET' }, CTX));
eq(L.REQUEST_COUNT_TOTAL, 5, 'E2  total');
eq(L.APPLICATION_READ_REQUEST_COUNT, 2, 'E3  application reads');
eq(L.byAction['fcSummary.workspace.get'], 2, 'E4  per-action count — the amplification signal');
eq(L.FORBIDDEN_REQUEST_ABORT_COUNT, 1, 'E5  forbidden aborts');
eq(L.UNKNOWN_REQUEST_ABORT_COUNT, 1, 'E6  unknown aborts');
eq(L.STATIC_ASSET_REQUEST_COUNT, 1, 'E7  static assets');
eq(L.aborted.length, 2, 'E8  every abort is itemised, not only counted');

// ============================================================================================================
section('F. AMPLIFICATION — first-return caching is not a leak');
// ============================================================================================================
eq(G.amplification([10, 8, 8, 8, 8]).verdict, 'FLAT', 'F1  a drop at the first return then flat is FLAT');
eq(G.amplification([8, 8, 9, 10, 11, 12]).verdict, 'REQUEST_LEAK_CANDIDATE', 'F2  a monotonic rise is a leak candidate');
eq(G.amplification([8, 8, 9, 8, 9, 8]).verdict, 'VARIABLE_NOT_MONOTONIC', 'F3  scattered variance is not');
eq(G.amplification([8, 8]).verdict, 'INSUFFICIENT_CYCLES', 'F4  two cycles cannot answer the question');
var leak = G.amplification([8, 8, 9, 10, 11, 12]);
eq(leak.base, 8, 'F5  the baseline is cycle 2, not cycle 1');
eq(leak.max_delta, 4, 'F6  the growth is reported');
// Cycle 1 is excluded deliberately: a page that caches its partial on first open legitimately makes fewer
// requests from cycle 2 on, and comparing against cycle 1 would call that a negative leak.
ok(/first-return caching|first return/.test(GSRC), 'F7  the exclusion of cycle 1 is explained in the source');

// ============================================================================================================
section('G. THE CDP CONSTANTS');
// ============================================================================================================
eq(G.CDP.request_stage, 'Request', 'G1  interception is at the Request stage');
eq(G.CDP.request_sent_before_decision, false, 'G2  REQUEST_SENT_BEFORE_DECISION = NO');
eq(G.CDP.deny_default, true, 'G3  deny by default');
eq(G.CDP.abort_method, 'Fetch.failRequest', 'G4  the abort method');
ok(G.CDP.forbidden_stages.indexOf('Response') !== -1, 'G5  the Response stage is named forbidden');
ok(G.CDP.forbidden_domains.indexOf('Network.setRequestInterception') !== -1,
  'G6  the deprecated Network interception domain is named forbidden');
// Response-stage interception would mean the request was already sent, which is the one thing this design
// exists to prevent — so the source says why rather than only saying no.
ok(/already sent/.test(GSRC), 'G7  the source explains why the Response stage is forbidden');

// ============================================================================================================
section('H. THE PROOF TOOL TOUCHES NO REAL ENDPOINT');
// ============================================================================================================
ok(/host-resolver-rules=MAP/.test(PROOF), 'H1  the proof maps the application host to a local sink');
ok(/127\.0\.0\.1/.test(PROOF), 'H2  the sink listens on loopback');
ok(!/AKfyc[A-Za-z0-9_-]{20,}/.test(PROOF), 'H3  the proof carries no real deployment id');
ok(PROOF.indexOf('OP_DB_API_BASE_URL') === -1, 'H4  the proof never reads the live endpoint from the client');
// The proof must fail closed when it cannot build a TLS sink — an http fallback would make the permitted
// request fail for the WRONG reason and the proof would silently stop exercising the allow path.
ok(/openssl is unavailable/.test(PROOF) && /process\.exit\(1\)/.test(PROOF),
  'H5  no TLS sink means the proof stops rather than degrading to http');
ok(/https:\/\/' \+ APP_HOST/.test(PROOF), 'H6  the permitted request uses the stable https /exec shape');
// Four requests, two hosts — running only one pair is how the broken guard passed its own first proof.
['local_permitted', 'local_forbidden', 'app_permitted', 'app_forbidden'].forEach(function (t) {
  ok(PROOF.indexOf('"' + t + '"') !== -1, 'H7  the proof fires ' + t);
});
ok(/the sink would still have\n\/\/ recorded it|sink would still have/.test(PROOF),
  'H8  the proof states why the sink is the witness');

// ============================================================================================================
section('I. MUTATION');
// ============================================================================================================
mut('host is checked before the action again', G_F,
  "    var isApp = (host === APP_HOST || host === APP_ECHO_HOST) || known;",
  "    var isApp = (host === APP_HOST || host === APP_ECHO_HOST);",
  function (m) {
    var d = m.classify({ url: 'http://127.0.0.1:1/exec?action=gapJob.status.get', method: 'GET' }, CTX);
    return d.allow === true || d.cls !== m.CLASS.FORBIDDEN_ACTION;
  });
mut('the unknown class is allowed instead of aborted', G_F,
  "    return out(CLASS.UNKNOWN, false, d.code || 'REFUSED', url, action);",
  "    return out(CLASS.UNKNOWN, true, d.code || 'REFUSED', url, action);",
  function (m) { return m.classify({ url: EXEC + '?action=adjustFactoryInventory', method: 'POST' }, CTX).allow === true; });
mut('an actionless application request is allowed', G_F,
  "      return out(CLASS.UNKNOWN, false, 'APPLICATION_REQUEST_WITH_NO_ACTION', url, null);",
  "      return out(CLASS.THIRD_PARTY, true, 'APPLICATION_REQUEST_WITH_NO_ACTION', url, null);",
  function (m) { return m.classify({ url: EXEC, method: 'GET' }, CTX).allow === true; });
mut('the allow/refuse test is inverted', G_F,
  "    return decision.allow", "    return !decision.allow",
  function (m) { return m.commandFor({ allow: false }, 'r').method !== 'Fetch.failRequest'
    || m.commandFor({ allow: true }, 'r').method !== 'Fetch.continueRequest'; });
mut('failRequest is swapped for continueRequest', G_F,
  "      : { method: 'Fetch.failRequest', params: { requestId: requestId, errorReason: CDP.abort_reason } };",
  "      : { method: 'Fetch.continueRequest', params: { requestId: requestId } };",
  function (m) { return m.commandFor({ allow: false }, 'r').method !== 'Fetch.failRequest'; });
mut('interception moves to the Response stage', G_F,
  "    request_stage: 'Request',", "    request_stage: 'Response',",
  function (m) { return m.CDP.request_stage !== 'Request'; });
mut('the guard declares the request already sent', G_F,
  "    request_sent_before_decision: false,", "    request_sent_before_decision: true,",
  function (m) { return m.CDP.request_sent_before_decision !== false; });
mut('deny-default is turned off', G_F,
  "    deny_default: true", "    deny_default: false",
  function (m) { return m.CDP.deny_default !== true; });
mut('static assets are blocked, so the page never renders', G_F,
  "        return out(CLASS.STATIC_ASSET, true, 'STATIC_ASSET', url, null);",
  "        return out(CLASS.STATIC_ASSET, false, 'STATIC_ASSET', url, null);",
  function (m) { return m.classify({ url: 'https://x.github.io/a.css', method: 'GET' }, CTX).allow === false; });
mut('the echo redirect target is blocked, so no answer arrives', G_F,
  "      if (host === APP_ECHO_HOST) return out(CLASS.THIRD_PARTY, true, 'EXEC_REDIRECT_TARGET', url, null);",
  "      if (false) return out(CLASS.THIRD_PARTY, true, 'EXEC_REDIRECT_TARGET', url, null);",
  function (m) { return m.classify({ url: 'https://script.googleusercontent.com/macros/echo?k=1', method: 'GET' }, CTX).allow === false; });
mut('forbidden aborts stop being itemised', G_F,
  "      ledger.aborted.push({ cls: decision.cls, action: decision.action, code: decision.code });",
  "      void 0;",
  function (m) {
    var l = m.newLedger();
    m.record(l, m.classify({ url: EXEC + '?action=gapJob.status.get', method: 'GET' }, CTX));
    return l.aborted.length === 0;
  });
mut('amplification calls scattered variance a leak', G_F,
  "    if (rising >= Math.ceil((tail.length - 1) * 0.6) && maxDelta > 0) {",
  "    if (rising >= 1 && maxDelta > 0) {",
  function (m) { return m.amplification([8, 8, 9, 8, 9, 8]).verdict === 'REQUEST_LEAK_CANDIDATE'; });
mut('amplification baselines on cycle 1 and so blames the cache', G_F,
  "    var base = c[1];", "    var base = c[0];",
  function (m) { return m.amplification([10, 8, 8, 8, 8]).verdict !== 'FLAT'; });
mut('two cycles are treated as enough', G_F,
  "    if (c.length < 4) return { verdict: 'INSUFFICIENT_CYCLES', cycles: c.length, needed: 4 };",
  "    if (c.length < 0) return { verdict: 'INSUFFICIENT_CYCLES', cycles: c.length, needed: 4 };",
  function (m) { return m.amplification([8, 8]).verdict !== 'INSUFFICIENT_CYCLES'; });

// ============================================================================================================
console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived');
if (fail !== 0) process.exitCode = 1;
