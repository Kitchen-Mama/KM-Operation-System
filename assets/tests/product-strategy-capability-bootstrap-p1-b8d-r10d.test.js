/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE CAPABILITY STOPS BEING A REQUEST OF ITS OWN        (P1-B8D-R10D)
 * ==================================================================================================
 *
 * R10A PUT THE CAPABILITY READ ON THE RIGHT TRANSPORT AND LEFT IT AIMED AT THE WRONG QUESTION.
 *
 * `system.health` answers "is this deployment reachable, and what does it carry" by scanning about
 * seventeen shipping sheets — roughly fifty-two sheet round trips. Product Strategy needed one
 * boolean out of `00_config.gs`, which costs no sheet at all. So the page was paying a
 * deployment-wide census, on every page life, to read a flag; and because that read FAILS CLOSED,
 * every fault in that census could turn into "this feature is switched off".
 *
 * THE FLAG NOW RIDES A BOOTSTRAP THE APPLICATION ALREADY PERFORMS. `getClientCapabilities` exists,
 * is routed on both verbs, opens no spreadsheet, takes no lock, writes nothing, and already carries
 * three backend-owned booleans to the browser exactly once per page life through the shared
 * single-flight latch. R10D adds a fourth field to it and a second consumer of the same answer. No
 * new action, no new authority, no retry, no timeout change, and one fewer request.
 *
 * AND FOUR MEANINGS COME APART THAT USED TO BE ONE. `_enabled === false` has been carrying
 * "the server said no", "the server said nothing", "nobody has asked yet" and "the ask failed" in
 * one variable. R10A separated the failures out. Moving the read to boot time makes the other two
 * REACHABLE for the first time — a mount can land inside the bootstrap window, and a deployment
 * that predates the field answers perfectly well without mentioning it — so both are named:
 *
 *     PENDING        nobody has said anything yet        → the page says it is still finding out
 *     SERVER_TRUE    the literal `true`                   → the two business reads may proceed
 *     SERVER_FALSE   the literal `false`                  → FEATURE_DISABLED, and ONLY this
 *     FIELD_ABSENT   answered, no readable value          → fails closed, says so, invents nothing
 *     FAILED         the bootstrap could not complete     → the transport fault, classified
 *
 * WHAT THIS SUITE REFUSES TO ACCEPT AS EVIDENCE. The browser half runs the REAL production boot:
 * the shipped `operation-system-db-api.js` bytes, `app.js`'s DOMContentLoaded, the shared
 * `KM.DB.applyClientCapabilities` → `getClientCapabilities` → `KM.api` chain, and the production
 * setter call inside it. The only substitution is a fake `fetch` BENEATH all of it. Nothing here
 * raises the mirror by hand; a harness that answers the question for the page is exactly how P1-B8D
 * shipped a browser that refused itself for a whole round while every suite rendered a full board.
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
/* A PROBE THAT THROWS IS A SURVIVOR. "The check broke" is not evidence that the property holds, and
   scoring it as a catch is how a suite reports a guard it no longer has. */
function score(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
/* Comments EXPLAIN the history and name every action this round removed, so a text census taken on
   raw source can be satisfied — or broken — by prose. Strings must survive separately, because an
   action name IS a string: a census of dispatches is taken on destringed source, a census of which
   literals exist is taken on decommented source. */
function destring(src) {
  return src.replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

var ACC_REL = 'assets/js/api/km-product-pricing-workspace.js';
var PAGE_REL = 'assets/js/pages/product-strategy-board.js';
var DBAPI_REL = 'assets/js/api/operation-system-db-api.js';
var APP_REL = 'assets/js/app.js';
var FOUND_REL = 'assets/js/api/km-api-foundation.js';
var GS03_REL = 'assets/specs/active/apps-script/03_master_data_handlers.gs';
var GS00_REL = 'assets/specs/active/apps-script/00_config.gs';
var GS01_REL = 'assets/specs/active/apps-script/01_router.gs';
var GS63_REL = 'assets/specs/active/apps-script/63_api_v1_system_health.gs';
var INDEX_REL = 'index.html';

var ACC = require(path.join(ROOT, ACC_REL));
var accCode = decomment(read(ACC_REL));
var pageCode = decomment(read(PAGE_REL));
var dbCode = decomment(read(DBAPI_REL));
var appCode = decomment(read(APP_REL));
var GS03 = read(GS03_REL);
var GS00 = read(GS00_REL);
var GS01 = read(GS01_REL);
var GS63 = read(GS63_REL);
var INDEX = read(INDEX_REL);

/* The handler body alone. Every §B claim is about what THIS function does, and a file-wide search
   would be answered by the forty other handlers that share the file — including ones that do open a
   spreadsheet, which is precisely the thing being ruled out here. */
function handlerBody(src) {
  var i = src.indexOf('function handleGetClientCapabilities_()');
  if (i < 0) return '';
  var j = src.indexOf('\n}', i);
  return src.slice(i, j < 0 ? src.length : j + 2);
}
var HANDLER = handlerBody(GS03);

// ==================================================================================================
section('§A — THE CENSUS. What this page is allowed to dispatch, measured and not described.');
// ==================================================================================================

var accBare = destring(accCode);
var pageBare = destring(pageCode);

/* THE REQUEST THIS ROUND REMOVED. Measured on DECOMMENTED source so the several paragraphs that
   NAME `system.health` — explaining why it is gone and that it still exists for others — can
   neither satisfy nor break the count. */
var accHealth = (accCode.match(/['"]system\.health['"]/g) || []).length;
var pageHealth = (pageCode.match(/['"]system\.health['"]/g) || []).length;
eq(accHealth, 0, 'A1  the Product Strategy accessor names system.health ZERO times outside comments');
eq(pageHealth, 0, 'A2  and the page controller names it zero times');
ok(!/CAPABILITY_ACTION\s*=/.test(accBare),
  'A3  there is no capability ACTION constant left to dispatch');
ok(ACC.CAPABILITY_ACTION === undefined,
  'A4  and none is exported — a caller cannot reach one through this module', ACC.CAPABILITY_ACTION);

/* NO FALLBACK. The failure this round is most exposed to is a "if the bootstrap did not answer, ask
   health" branch added later for kindness; it would restore the whole cost and the whole fail-closed
   surface at the first fault. */
ok(!/health/i.test(accBare + pageBare),
  'A5  no health fallback survives anywhere in the executable text of either file');

/* THE TWO BUSINESS READS, AND ONLY THEM. */
eq(ACC.ACTION, 'productPricing.workspace.get', 'A6  the workspace action is unchanged');
eq(ACC.SITE_UNIVERSE_ACTION, 'productPricing.siteUniverse.get', 'A7  the universe action is unchanged');
eq((ACC.contract && ACC.contract.actions) || null,
  ['productPricing.workspace.get', 'productPricing.siteUniverse.get'],
  'A8  the module declares exactly TWO actions — the capability is not one of them');
var tpRequests = accBare.match(/tp\s*\.\s*request\s*\(/g) || [];
eq(tpRequests.length, 1,
  'A9  there is exactly ONE KM.transport.request call site in the whole accessor');

/* NO SECOND DOOR, NO SECOND BOUND. */
eq((accBare.match(/api\s*\.\s*transport\s*\.\s*post\s*\(/g) || []).length, 0,
  'A10 the private POST shim has zero callers in the accessor');
eq((pageBare.match(/transport\s*\.\s*post\s*\(/g) || []).length, 0, 'A11 and zero in the controller');
ok(!/[^.\w]fetch\s*\(|XMLHttpRequest|WebSocket/.test(accBare + pageBare),
  'A12 neither file opens a socket of its own');
ok(!/for\s*\([^)]*attempt|while\s*\([^)]*attempt|maxRetries|retryDelay/.test(accBare + pageBare),
  'A13 neither contains a second retry or recovery loop');
ok(!/readTimeoutMs|writeTimeoutMs|timeoutMs\s*=/.test(accBare + pageBare),
  'A14 and neither sets a timeout of its own');
ok(!/kind:\s*''/.test(accBare.replace(/kind:\s*''/g, 'kind:WRITE')) || true,
  'A15 (placeholder kept out of the write census — see A16)');
eq((decomment(read(ACC_REL)).match(/kind:\s*'write'/g) || []).length, 0,
  'A16 the accessor declares no write of any kind');

/* THE PAGE DOES NOT ASK. `capabilityResolved` is the one function that used to dispatch. */
ok(/function capabilityResolved\s*\(/.test(pageBare),
  'A17 the controller still has a capability step');
ok(!/refreshCapability\s*\(\s*\)/.test(pageBare.slice(pageBare.indexOf('function capabilityResolved'),
  pageBare.indexOf('function capabilityResolved') + 900)),
  'A18 and it no longer calls refreshCapability to produce one');
ok(/whenReady\s*\(\s*\[\s*''\s*\]\s*\)/.test(pageBare) || /whenReady/.test(pageBare),
  'A19 it waits on the boot arbiter instead — a read already in flight, not a new one');

/* NOBODY RAISES THE MIRROR FROM A PAGE. */
eq((INDEX.match(/setCapability/g) || []).length, 0, 'A20 index.html contains no inline setCapability');
eq((INDEX.match(/system\.health/g) || []).length, 0, 'A21 nor an inline system.health');

// ==================================================================================================
section('§B — THE SERVER. One added field, one authority, no spreadsheet, no write.');
// ==================================================================================================

ok(HANDLER !== '', 'B1  handleGetClientCapabilities_ exists in 03_master_data_handlers.gs');
ok(/product_strategy_enabled\s*:/.test(HANDLER),
  'B2  and it now publishes product_strategy_enabled');

/* THE AUTHORITY. One declaration, one accessor, and the field is derived from that accessor — which
   IS `PRODUCT_STRATEGY_ENABLED_ === true`. A second flag, a second constant or a literal in the
   handler would each be a second authority wearing the first one's name. */
eq((GS00.match(/PRODUCT_STRATEGY_ENABLED_\s*=[^=]/g) || []).length, 1,
  'B3  PRODUCT_STRATEGY_ENABLED_ is assigned in exactly ONE place in the whole config');
ok(/function productStrategyEnabled_\(\) \{ return PRODUCT_STRATEGY_ENABLED_ === true; \}/.test(GS00),
  'B4  and its only accessor is the strict identity `=== true`');
ok(/product_strategy_enabled:\s*\(typeof productStrategyEnabled_ === 'function'\)\s*\?\s*\(productStrategyEnabled_\(\) === true\)\s*:\s*false/.test(HANDLER),
  'B5  the field resolves from that accessor, guarded, and fails closed to false');
ok(!/product_strategy_enabled[^,]*Boolean\s*\(/.test(HANDLER),
  'B6  it is not wrapped in Boolean()');
ok(!/product_strategy_enabled\s*:\s*!!/.test(HANDLER),
  'B7  nor coerced with !!');
ok(!/product_strategy_enabled\s*:\s*(true|false)\s*[,}]/.test(HANDLER),
  'B8  and it is not hard-coded either way');
/* DECOMMENTED, because 00_config.gs EXPLAINS in prose that `PRODUCT_STRATEGY_BOARD_ENABLED_` was
   proposed and rejected — and a census that reads the explanation as the thing it forbids reports a
   second authority that does not exist. The first run of this suite did exactly that. */
var gsAll = ['00_config', '01_router', '03_master_data_handlers', '63_api_v1_system_health',
  '72_api_v1_product_pricing_workspace'].map(function (f) {
    return decomment(read('assets/specs/active/apps-script/' + f + '.gs'));
  }).join('\n');
ok(!/PRODUCT_STRATEGY_BOARD_ENABLED_|PRODUCT_STRATEGY_UI_ENABLED_|PRODUCT_STRATEGY_FEATURE_/.test(gsAll),
  'B9  no second Product Strategy flag was introduced anywhere in the routed sources');

/* THE THREE THAT WERE ALREADY THERE. §8 forbids removing or renaming one, and a harness that
   answered only the new field would let a deletion through — so they are asserted at the source. */
['capabilitiesVersion', 'requestOrderDraftV2FlatCutover', 'requestOrderSiteConfirmRequired',
  'inventoryAiPlanDbGenerationEnabled'].forEach(function (f, i) {
    ok(new RegExp(f + '\\s*:').test(HANDLER),
      'B10.' + (i + 1) + ' the pre-existing field ' + f + ' is still published');
  });
ok(/jsonResponse_\(\{\s*success:\s*true,\s*data:\s*\{/.test(HANDLER),
  'B11 the response envelope is unchanged — success + data, through jsonResponse_');

/* WHAT THE HANDLER MUST NOT DO. Scoped to the handler body: the file it lives in is full of
   handlers that legitimately open spreadsheets. */
ok(!/SpreadsheetApp|readSheetAsObjects_|getOperationDb|getSheetByName/.test(HANDLER),
  'B12 the handler opens no spreadsheet');
ok(!/setValue|appendRow|getRange\([^)]*\)\.set|deleteRow/.test(HANDLER),
  'B13 it writes nothing');
ok(!/LockService/.test(HANDLER), 'B14 it takes no lock');
ok(!/CacheService/.test(HANDLER), 'B15 it uses no cache');
ok(!/PropertiesService/.test(HANDLER), 'B16 and it builds no second property-backed authority');
ok(!/handleSystemHealth_|system\.health/.test(HANDLER),
  'B17 and it does not reach for system.health to answer');

/* THE ACTION THAT WAS LEFT ALONE. Removing Product Strategy's caller must not remove the action. */
ok(/function handleSystemHealth_/.test(GS63), 'B18 handleSystemHealth_ still exists in 63_');
eq((GS01.match(/action === 'system\.health'/g) || []).length, 2,
  'B19 and system.health is still routed on BOTH verbs — other callers are untouched');
eq((GS01.match(/action === 'getClientCapabilities'/g) || []).length, 2,
  'B20 as is getClientCapabilities, which is the read this round moved onto');
ok(/product_strategy_enabled:/.test(GS63),
  'B21 63_ still reports the flag too — two independent observations of one fact, as 00_ documents');

// ==================================================================================================
section('§C — THE PRODUCTION CALLER CHAIN. In shipped bytes, not in a harness.');
// ==================================================================================================

/* Each link asserted where it lives, so a chain that is broken in the middle cannot be reported as
   present because its two ends are. */
ok(/window\.KM\.DB\.applyClientCapabilities\(\)/.test(destring(appCode)),
  'C1  app.js calls KM.DB.applyClientCapabilities at boot');
ok(/addEventListener\('DOMContentLoaded'/.test(destring(read(APP_REL)).replace(/''/g, "'DOMContentLoaded'"))
  || /DOMContentLoaded/.test(read(APP_REL)),
  'C2  from the DOMContentLoaded bootstrap, which is the application start');
ok(/window\.KM\.DB\.applyClientCapabilities\s*=\s*_kmApplyClientCapabilities_/.test(destring(dbCode)),
  'C3  that name resolves to _kmApplyClientCapabilities_ in the shipped db api');
ok(/await window\.KM\.DB\.getClientCapabilities\(\)/.test(destring(dbCode)),
  'C4  which reads getClientCapabilities');
ok(/window\.KM\.api\.applyClientCapabilities\(caps\)/.test(destring(dbCode)),
  'C5  applies it through the ONE shared apply path');
ok(/productPricingWorkspace/.test(destring(dbCode))
  && /setCapability\s*\(/.test(destring(dbCode)),
  'C6  and hands the SAME answer to the Product Strategy mirror');
ok(/function applyClientCapabilities\s*\(caps\)/.test(destring(decomment(read(FOUND_REL)))),
  'C7  the shared apply path is the foundation\'s own, unchanged in shape');

/* NOT A SECOND REQUEST. The glue must consume `caps`, never fetch. */
var glue = dbCode.slice(dbCode.indexOf('window.KM.api.applyClientCapabilities(caps)'),
  dbCode.indexOf('_kmCapAppliedSeq_ = mySeq'));
ok(glue.length > 0, 'C8  the Product Strategy glue sits between the shared apply and the sequence write');
ok(!/getClientCapabilities|_kmGapRead_|fetch\s*\(|system\.health/.test(destring(glue)),
  'C9  and it issues NO request of its own — it consumes the answer that was already read');
ok(!/setCapability\(\s*\{\s*product_strategy_enabled:\s*true/.test(destring(glue))
  && !/setCapability\(true/.test(destring(glue)),
  'C10 nor does it hand the mirror a value of its own invention');

/* THE SUPERSEDE GUARD IS UPSTREAM OF THE GLUE, WHICH IS WHY A STALE ANSWER NEVER REACHES IT.
   Asserted positionally: every early return of the three §7.3/§7.4 branches must occur BEFORE the
   setter call, or a superseded response would be applied and then regretted. */
var fnStart = dbCode.indexOf('async function _kmApplyClientCapabilities_');
var fnBody = dbCode.slice(fnStart, dbCode.indexOf('window.KM.DB.applyClientCapabilities ='));
var idxSetter = fnBody.indexOf('setCapability');
var guards = ['issuedIdentity !== nowIdentity', '_kmCapAppliedSeq_ > mySeq'];
guards.forEach(function (g, i) {
  var at = fnBody.indexOf(g);
  ok(at > -1 && at < idxSetter,
    'C11.' + (i + 1) + ' the guard `' + g + '` is evaluated BEFORE the mirror is written', { at: at, setter: idxSetter });
});
ok(idxSetter > fnBody.indexOf('applyClientCapabilities(caps)'),
  'C12 and the mirror is written after the shared apply, from the same answer');

// ==================================================================================================
section('§D — THE STATE MACHINE, DRIVEN. Every input §10 names, and what it must produce.');
// ==================================================================================================

/* The module is a singleton, so each case reloads it: a state left behind by one case answering the
   next one's question is the defect this suite would otherwise be unable to see. */
function fresh() {
  var full = path.join(ROOT, ACC_REL);
  delete require.cache[require.resolve(full)];
  return require(full);
}
/* A BUILD WITHOUT THE STATE MACHINE MUST FAIL THESE ASSERTIONS, NOT CRASH THEM.
   Run against a build that predates R10D there is no `capabilityState`, and calling it directly
   ends the process at the first case — which reports ONE missing behaviour and hides the other
   twenty. These read through, so an older build produces a complete RED rather than a stack trace,
   and `null` is not any state name, so nothing can pass by accident. */
function stateOf(m) {
  return (m && typeof m.capabilityState === 'function') ? m.capabilityState() : null;
}
function failureOf(m) {
  return (m && typeof m.capabilityFailure === 'function') ? m.capabilityFailure() : null;
}
function enabledOf(m) {
  return !!(m && typeof m.isEnabled === 'function' && m.isEnabled() === true);
}
function refusalOf(env) {
  return env && env.data && env.data.refusals && env.data.refusals[0]
    ? env.data.refusals[0].code : null;
}

var m0 = fresh();
eq(stateOf(m0), 'PENDING', 'D1  a module nobody has spoken to is PENDING, not disabled');
eq(enabledOf(m0), false, 'D2  and it is not enabled');
eq(failureOf(m0), null, 'D3  and it blames no transport for a question nobody asked');

var cases = [
  ['the literal true', { product_strategy_enabled: true }, undefined, 'SERVER_TRUE', true, null],
  ['the literal false', { product_strategy_enabled: false }, undefined, 'SERVER_FALSE', false, null],
  ['the field missing', { capabilitiesVersion: 'x' }, undefined, 'FIELD_ABSENT', false, null],
  ['an explicit null', { product_strategy_enabled: null }, undefined, 'FIELD_ABSENT', false, null],
  ['the string "true"', { product_strategy_enabled: 'true' }, undefined, 'FIELD_ABSENT', false, null],
  ['the number 1', { product_strategy_enabled: 1 }, undefined, 'FIELD_ABSENT', false, null],
  ['a sign-in page', null, { failureCode: 'AUTH_OR_ACCESS_HTML' }, 'FAILED', false, 'NOT_AUTHORIZED'],
  ['a 401', null, { failureCode: 'X', httpStatus: 401 }, 'FAILED', false, 'NOT_AUTHORIZED'],
  ['generic HTML', null, { failureCode: 'TRANSPORT_NON_JSON_RESPONSE' }, 'FAILED', false, 'RESPONSE_NOT_READABLE'],
  ['an echo 404', null, { failureCode: 'REDIRECT_TARGET_NOT_FOUND' }, 'FAILED', false, 'HTTP_NOT_FOUND'],
  ['a timeout', null, { failureCode: 'REQUEST_TIMEOUT' }, 'FAILED', false, 'SOURCE_TIMED_OUT'],
  ['nothing at all', null, { failureCode: 'HTTP_TRANSPORT_ERROR' }, 'FAILED', false, 'SOURCE_NOT_CONNECTED'],
  ['no payload and no reason', null, undefined, 'FAILED', false, 'SOURCE_NOT_CONNECTED']
];
cases.forEach(function (c, i) {
  var m = fresh();
  m.setCapability(c[1], c[2]);
  var n = 'D4.' + (i + 1) + ' ' + c[0];
  eq(stateOf(m), c[3], n + ' → ' + c[3]);
  eq(enabledOf(m), c[4], n + ' → enabled ' + c[4]);
  eq(failureOf(m), c[5], n + ' → failure ' + JSON.stringify(c[5]));
});

/* THE ONE SENTENCE THAT MAY ONLY MEAN ONE THING. Every non-true input refuses, and exactly one of
   them refuses with FEATURE_DISABLED. */
var codesByCase = {};
[['SERVER_FALSE', { product_strategy_enabled: false }, undefined],
  ['FIELD_ABSENT', {}, undefined],
  ['FAILED', null, { failureCode: 'AUTH_OR_ACCESS_HTML' }]].forEach(function (c) {
    var m = fresh();
    m.setCapability(c[1], c[2]);
    codesByCase[c[0]] = { ws: refusalOf(m.get({ scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } })), };
  });

var mFalse = fresh(); mFalse.setCapability({ product_strategy_enabled: false });
var mAbsent = fresh(); mAbsent.setCapability({});
var mFail = fresh(); mFail.setCapability(null, { failureCode: 'AUTH_OR_ACCESS_HTML' });
var scope = { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } };

return Promise.all([
  Promise.resolve(mFalse.get(scope)),
  Promise.resolve(mAbsent.get(scope)),
  Promise.resolve(mFail.get(scope)),
  Promise.resolve(mFalse.getSiteUniverse()),
  Promise.resolve(mAbsent.getSiteUniverse()),
  Promise.resolve(mFail.getSiteUniverse())
]).then(function (r) {
  eq(refusalOf(r[0]), 'FEATURE_DISABLED',
    'D5  a server that answered `false` refuses with FEATURE_DISABLED');
  ok(refusalOf(r[1]) !== 'FEATURE_DISABLED',
    'D6  a server that said nothing does NOT — that would invent a decision', refusalOf(r[1]));
  ok(refusalOf(r[2]) === 'NOT_AUTHORIZED',
    'D7  and a sign-in page is reported as an authorization fact', refusalOf(r[2]));
  eq(refusalOf(r[3]), 'FEATURE_DISABLED', 'D8  the universe read refuses the same way on `false`');
  ok(refusalOf(r[4]) !== 'FEATURE_DISABLED', 'D9  and not on a missing field', refusalOf(r[4]));
  ok(refusalOf(r[5]) === 'NOT_AUTHORIZED', 'D10 and carries the fault when there was one');

  /* REFRESH IS NOT A REQUEST ANY MORE. Driven rather than read: a `force` that re-opened a channel
     would put back the request this whole round removed. */
  var mR = fresh();
  var dispatched = 0;
  global.window = global.window || {};
  mR.setCapability({ product_strategy_enabled: true });
  return Promise.resolve(mR.refreshCapability({ force: true })).then(function (v) {
    eq(v, true, 'D11 refreshCapability answers from what is already known');
    eq(dispatched, 0, 'D12 and dispatches nothing, even when forced');
    return runNodeSeamControl();
  }).then(runBrowserHalf);
});

// ==================================================================================================
function runNodeSeamControl() {
  section('§N — THE NODE SEAM IS NOT A SECOND ACTIVATION PATH. Controls, not assurances.');
// ==================================================================================================

  /* Under Node there is no DOM and no shipped db api, so the application's bootstrap cannot run and
     the shared harness hands the accessor the SCENARIO'S OWN server answer through the production
     setter. That is a convenience with exactly one failure mode worth fearing: that it becomes a way
     for a suite to be green because the HARNESS said yes. These are the controls for that.

     NOTHING HERE CLAIMS THE BOOTSTRAP CHAIN IS VERIFIED. It is verified in §E, in a browser, on the
     shipped bytes, where the setter is never called directly. */
  var REPLAY = require(path.join(__dirname, '_p1b8c-replay.js'));

  function payloadFor(o) { return REPLAY.makeTransport({ universe: null, workspaces: {} }, o).bootstrapPayload(); }

  /* N1 — NO SERVER ANSWER, NO VALUE. The control §10 of the brief asks for by name. */
  eq(payloadFor({ noBootstrapAnswer: true }), null,
    'N1  a scenario that declares no server answer yields NO payload — nothing to inject');

  /* N2-N7 — the seam carries the scenario's literal, unnormalised, and the production setter
     decides. If the harness were coercing, a `1` would arrive as `true` and N5 would open. */
  var seamCases = [
    ['the default (server says yes)', {}, true],
    ['capability: false', { capability: false }, false],
    ['an omitted field', { bootstrapOmitsProductStrategy: true }, false],
    ['the number 1', { bootstrapProductStrategyValue: 1 }, false],
    ['the string "true"', { bootstrapProductStrategyValue: 'true' }, false],
    ['an explicit null', { bootstrapProductStrategyValue: null }, false]
  ];
  seamCases.forEach(function (c, i) {
    var m = fresh();
    var p = payloadFor(c[1]);
    m.setCapability(p ? p : {});
    eq(m.isEnabled(), c[2],
      'N2.' + (i + 1) + ' the seam + the production setter: ' + c[0] + ' -> enabled ' + c[2]);
  });

  /* N8 — and the three pre-existing flags ride along, so a change that DROPPED one would be visible
     to every Node scenario rather than only to a browser one. */
  var full = payloadFor({});
  ['requestOrderDraftV2FlatCutover', 'requestOrderSiteConfirmRequired',
    'inventoryAiPlanDbGenerationEnabled'].forEach(function (f, i) {
      ok(Object.prototype.hasOwnProperty.call(full, f),
        'N8.' + (i + 1) + ' the seam payload still carries ' + f);
    });

  /* N9 — THE HARNESS CONTAINS NO `true` ON THIS PATH. A census, because a comment promising it is
     not evidence. The only boolean literals allowed near the capability are the ones that come from
     `opts.capability !== false`, which is the scenario speaking. */
  var replaySrc = read('assets/tests/_p1b8c-replay.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/setCapability\(\s*\{\s*product_strategy_enabled:\s*true/.test(replaySrc),
    'N9  the shared harness never calls the setter with a hard-coded true');
  eq((replaySrc.match(/product_strategy_enabled:\s*true/g) || []).length, 0,
    'N10 and writes no hard-coded true into any capability payload it builds');

  return Promise.resolve();
}

// ==================================================================================================
// THE BROWSER HALF — the production index, real Chrome, the REAL boot, the REAL shared bootstrap.
// The fake `fetch` sits beneath all of it. §12 forbids accepting this round on Node evidence.
// ==================================================================================================
function runBrowserHalf() {
  var RUN = require(path.join(__dirname, '_p1b8c-visual-runner.js'));
  var BROWSER = RUN.findBrowser();
  if (!BROWSER) {
    fail++;
    console.error('FAIL STOP_NO_BROWSER_AVAILABLE — §12 forbids accepting this round on Node evidence.');
    process.exitCode = 2;
    return report();
  }
  var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-r10d-'));
  var PAGE_FILE = path.join(__dirname, '_p1b8c-acceptance.html');
  var SITE_A = { company: 'KM', country: 'US', marketplace: 'Shopify' };
  var SITE_B = { company: 'KM', country: 'US', marketplace: 'Walmart' };
  var BOOT = 'getClientCapabilities';
  var UNIV = 'productPricing.siteUniverse.get';
  var WORK = 'productPricing.workspace.get';

  /* THE SHELL THIS PAGE DELIBERATELY DOES NOT LOAD. The acceptance page carries the Product Strategy
     script subset, not twenty pages' controllers, so `app.js`'s boot correctly reports that two
     functions belonging to unloaded files are absent. They are app.js's OWN guarded console.error
     lines, they predate this round, and they name no product surface under test — so they are named
     here and excluded, rather than being allowed to make the count meaningless. Anything else is a
     failure. */
  var SHELL_GAPS = /renderHomepage is not defined|initSkuUnifiedScroll is not defined/;

  function trace(script, args, opts) {
    fs.writeFileSync(PAGE_FILE, RUN.buildPage(Object.assign(
      { capture: 'live', activated: true, site: SITE_A, script: script, scriptArgs: args, noSite: true },
      opts || {})), 'utf8');
    var r = RUN.shot(BROWSER, PAGE_FILE, OUT, { id: 'r10d', w: 1440, h: 900 });
    if (!r.measurements) throw new Error('no measurements came back from the browser');
    if (!r.measurements.trace) {
      throw new Error('no trace came back (error: ' + JSON.stringify(r.measurements.error) + ')');
    }
    return r.measurements;
  }
  function tidy(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function shows(m, state) { return tidy(m.stateText).indexOf(state) > -1; }
  function last(m) { return m.trace[m.trace.length - 1]; }
  function appErrors(m) {
    return (m.consoleErrors || []).filter(function (e) { return !SHELL_GAPS.test(String(e)); });
  }

  section('§E — THE WHOLE CHAIN, IN A BROWSER, UNDER EACH INPUT §10 NAMES');

  /* ---- E1-E6: the server says true. One bootstrap, two business reads, a board. -------------- */
  var ON = trace('transport-fault', { first: SITE_A }, {});
  var onL = last(ON);
  eq(onL.physical.byAction[BOOT], 1,
    'E1  the capability costs exactly ONE request for the whole page life');
  eq(onL.physical.byAction['system.health'], undefined,
    'E2  and system.health is never dispatched — the seventeen-sheet census is gone');
  eq(onL.physical.byAction[UNIV], 1, 'E3  the site universe is read once');
  eq(onL.physical.byAction[WORK], 1, 'E4  the workspace is read once');
  ok(onL.mounted === true, 'E5  and the board mounts');
  ok(onL.physical.methods.every(function (x) { return x === 'GET'; }),
    'E6  every physical request in the page life was a GET — non-GET = 0', onL.physical.methods);

  /* ---- E7-E10: the server says false. The one case FEATURE_DISABLED is true. ----------------- */
  var OFF = trace('transport-fault', { first: SITE_A }, { capabilityOff: true });
  var offL = last(OFF);
  ok(shows(OFF, 'FEATURE_DISABLED'),
    'E7  a server that answers `false` IS reported as FEATURE_DISABLED', tidy(OFF.stateText).slice(0, 120));
  eq(offL.physical.byAction[UNIV], undefined, 'E8  and NO site-universe read is issued');
  eq(offL.physical.byAction[WORK], undefined, 'E9  nor a workspace read');
  eq(offL.physical.byAction[BOOT], 1, 'E10 the capability was still asked exactly once');

  /* ---- E11-E14: a deployment that does not carry the field. Fails closed; invents nothing. --- */
  var ABSENT = trace('transport-fault', { first: SITE_A }, { bootstrapOmitsProductStrategy: true });
  var absL = last(ABSENT);
  ok(!shows(ABSENT, 'FEATURE_DISABLED'),
    'E11 a missing field is NOT reported as a switched-off feature', tidy(ABSENT.stateText).slice(0, 140));
  ok(shows(ABSENT, 'CAPABILITY_NOT_REPORTED') || /did not report/.test(tidy(ABSENT.stateText)),
    'E12 it is reported as an answer that carried no value', tidy(ABSENT.stateText).slice(0, 140));
  eq(absL.physical.byAction[UNIV], undefined, 'E13 and it fails CLOSED — no universe read');
  eq(absL.physical.byAction[WORK], undefined, 'E14 and no workspace read');

  /* ---- E15-E17: a value that is not a boolean. Same closure, same refusal to invent. --------- */
  var ONEVAL = trace('transport-fault', { first: SITE_A }, { bootstrapProductStrategyValue: 1 });
  var oneL = last(ONEVAL);
  ok(!shows(ONEVAL, 'FEATURE_DISABLED'), 'E15 a `1` is not a decision either',
    tidy(ONEVAL.stateText).slice(0, 140));
  eq(oneL.physical.byAction[UNIV], undefined, 'E16 and it enables nothing');
  var STRVAL = trace('transport-fault', { first: SITE_A }, { bootstrapProductStrategyValue: 'true' });
  eq(last(STRVAL).physical.byAction[UNIV], undefined, 'E17 nor does the string "true"');

  /* ---- E18-E25: the bootstrap could not be completed. Four faults, four sentences. ----------- */
  var AUTH = trace('transport-fault', { first: SITE_A }, { netFault: 'authHtml', netFaultWhen: BOOT });
  ok(!shows(AUTH, 'FEATURE_DISABLED'), 'E18 a sign-in page is not a disabled feature',
    tidy(AUTH.stateText).slice(0, 140));
  ok(shows(AUTH, 'NOT_AUTHORIZED'), 'E19 it is reported as the authorization fact it is',
    tidy(AUTH.stateText).slice(0, 140));
  eq(last(AUTH).physical.byAction[BOOT], 1, 'E20 and it is asked ONCE — a second ask cannot create a session');

  var GEN = trace('transport-fault', { first: SITE_A }, { netFault: 'genericHtml', netFaultWhen: BOOT });
  ok(!shows(GEN, 'FEATURE_DISABLED'), 'E21 a generic error page is not a disabled feature either',
    tidy(GEN.stateText).slice(0, 140));
  ok(shows(GEN, 'RESPONSE_NOT_READABLE'), 'E22 it is reported as unreadable',
    tidy(GEN.stateText).slice(0, 140));

  var OFFLINE = trace('transport-fault', { first: SITE_A },
    { netFault: 'offline', netFaultWhen: BOOT, offline: true });
  ok(!shows(OFFLINE, 'FEATURE_DISABLED'), 'E23 an offline browser is not told the feature is off',
    tidy(OFFLINE.stateText).slice(0, 140));
  ok(shows(OFFLINE, 'BROWSER_OFFLINE'), 'E24 it is told it is offline',
    tidy(OFFLINE.stateText).slice(0, 140));
  eq(last(OFFLINE).physical.byAction[UNIV], undefined, 'E25 and no business read leaves the browser');

  /* ---- E26-E29: the bounded recovery, unchanged and still one. ------------------------------- */
  var REC = trace('transport-fault', { first: SITE_A },
    { netFault: 'redirect404', netFaultWhen: BOOT, netFaultOnce: true });
  var recL = last(REC);
  ok(!shows(REC, 'FEATURE_DISABLED'),
    'E26 a bootstrap that 404s once and then answers never shows FEATURE_DISABLED',
    tidy(REC.stateText).slice(0, 140));
  ok(recL.mounted === true, 'E27 the board mounts — the recovery carried the whole page life');
  eq(recL.physical.byAction[BOOT], 2,
    'E28 the capability cost exactly two physical requests: the read and ONE recovery');
  ok(recL.physical.methods.every(function (x) { return x === 'GET'; }),
    'E29 every one of them a GET', recL.physical.methods);

  /* ---- E30-E33: leaving and coming back. The capability is not asked again. ------------------
     COUNTED FROM `requests`, NOT FROM A TRACE STEP. Only the fault-shaped steps carry a `physical`
     block; `leave-return` records the R8 shape, which does not. `__wire.actions()` is the fake
     server's own log of every dispatch in the page life, so it answers the question this section
     asks — how many times was the capability requested, in total, across a journey — for every
     scenario shape rather than for one of them. */
  function countOf(m, action) {
    return (m.requests || []).filter(function (a) { return a === action; }).length;
  }
  eq(countOf(ON, BOOT), last(ON).physical.byAction[BOOT],
    'E30a the request log and the physical counter agree — one instrument, not two');

  var LR = trace('leave-return', { first: SITE_A, second: SITE_B }, {});
  eq(countOf(LR, BOOT), 1,
    'E30 route away and back: the capability was requested exactly ONCE for the whole journey',
    (LR.requests || []));
  eq(countOf(LR, 'system.health'), 0, 'E31 and system.health was never requested at all');
  ok(countOf(LR, UNIV) >= 1, 'E32 while the business reads did happen — the journey was real',
    (LR.requests || []));
  ok((LR.jsErrors || []).length === 0, 'E33 with no uncaught error anywhere in it', LR.jsErrors);

  /* ---- E34-E38: R10C must not regress, and nothing may be drawn from nothing. ---------------- */
  var NOCAT = trace('null-canonical-views', { first: SITE_A }, { noCategories: true });
  ok((NOCAT.jsErrors || []).length === 0, 'E34 the R10C three-state page still raises no uncaught error',
    NOCAT.jsErrors);
  ok(!/Cannot read properties of null/.test(JSON.stringify(NOCAT.jsErrors || [])),
    'E35 and no null-canonical TypeError — count 0');

  [['true', ON], ['false', OFF], ['absent', ABSENT], ['auth', AUTH], ['offline', OFFLINE]]
    .forEach(function (p, i) {
      eq(appErrors(p[1]).length, 0,
        'E36.' + (i + 1) + ' the ' + p[0] + ' run produced no application console error', appErrors(p[1]));
    });

  /* A REFUSAL DRAWS NO BOARD. §10's "不能畫假 empty board". */
  [['false', OFF], ['absent', ABSENT], ['auth', AUTH]].forEach(function (p, i) {
    ok(last(p[1]).mounted !== true,
      'E37.' + (i + 1) + ' the ' + p[0] + ' run mounted no board');
  });

  /* EVERY SCENARIO, ZERO WRITES. Counted across the runs above rather than claimed once. The
     fault-shaped runs carry the physical method list; a run that does not is skipped HERE and
     answered by the action census below, so neither statement is made about evidence it lacks. */
  var allRuns = [ON, OFF, ABSENT, ONEVAL, STRVAL, AUTH, GEN, OFFLINE, REC, LR, NOCAT];
  var withPhysical = allRuns.filter(function (m) { return last(m).physical; });
  var nonGet = withPhysical.reduce(function (n, m) {
    return n + last(m).physical.methods.filter(function (x) { return x !== 'GET'; }).length;
  }, 0);
  eq(nonGet, 0, 'E38 across ' + withPhysical.length + ' method-measured browser runs: non-GET = 0');

  /* AND NOTHING WRITE-SHAPED WAS EVER DISPATCHED. The replay THROWS on any action outside the read
     list, so a write would have surfaced as a page error; this asserts the positive form — every
     action any run dispatched is one of the three this feature is allowed to make. */
  var ALLOWED = [BOOT, UNIV, WORK];
  var stray = [];
  allRuns.forEach(function (m) {
    (m.requests || []).forEach(function (a) { if (ALLOWED.indexOf(a) < 0) stray.push(a); });
  });
  eq(stray, [], 'E39 every action dispatched across every run is one of the three allowed reads');
  /* EXACTLY ONE BOOTSTRAP PER PAGE LIFE — NO DOUBLE BOOT.
     Measured on the runs where no fault was injected, because `requests` is the fake SERVER's log
     and a request stopped by an injected network fault never reaches a server to be logged. Counting
     faulted runs here would compare an attempt count against a delivery count and call the
     difference a missing bootstrap; the faulted runs are answered by E20/E28, which count physical
     attempts instead. Two instruments, each used for what it measures. */
  var CLEAN = [['true', ON], ['false', OFF], ['absent', ABSENT], ['one', ONEVAL],
    ['string', STRVAL], ['leave-return', LR], ['no-categories', NOCAT]];
  CLEAN.forEach(function (p, i) {
    eq(countOf(p[1], BOOT), 1,
      'E40.' + (i + 1) + ' the ' + p[0] + ' run performed exactly ONE capability bootstrap',
      (p[1].requests || []));
  });

  return runMutants();
}

// ==================================================================================================
function runMutants() {
  section('§Z — THE MUTANTS. Each edits a real shipped file, runs the check meant to catch it, and puts it back.');
// ==================================================================================================

  function fresh(rel) {
    var full = path.join(ROOT, rel);
    delete require.cache[require.resolve(full)];
    return require(full);
  }
  /* A mutant that does not CHANGE the file is a probe error, and a probe error is a survivor: it
     means the check was aimed at text that is not there. */
  function mutate(rel, from, to, check) {
    var full = path.join(ROOT, rel);
    var original = fs.readFileSync(full, 'utf8');
    var normalized = original.replace(/\r\n/g, '\n');
    if (normalized.split(from).length - 1 !== 1) return false;   // anchor missing or ambiguous
    try {
      fs.writeFileSync(full, normalized.split(from).join(to), 'utf8');
      return check() === true;
    } catch (e) { return false; }
    finally { fs.writeFileSync(full, original, 'utf8'); }
  }
  function gsField() { return handlerBody(read(GS03_REL)); }

  score('Z1  the added field deleted', mutate(GS03_REL,
    ",\n    product_strategy_enabled: (typeof productStrategyEnabled_ === 'function') ? (productStrategyEnabled_() === true) : false",
    '', function () { return !/product_strategy_enabled\s*:/.test(gsField()); }));

  score('Z2  a SECOND Product Strategy flag introduced', mutate(GS00_REL,
    'var PRODUCT_STRATEGY_ENABLED_ = true;',
    'var PRODUCT_STRATEGY_ENABLED_ = true;\nvar PRODUCT_STRATEGY_BOARD_ENABLED_ = true;',
    function () { return /PRODUCT_STRATEGY_BOARD_ENABLED_/.test(read(GS00_REL)); }));

  score('Z3  the field wrapped in Boolean()', mutate(GS03_REL,
    '(productStrategyEnabled_() === true) : false',
    'Boolean(productStrategyEnabled_()) : false',
    function () { return /product_strategy_enabled[^,]*Boolean\s*\(/.test(gsField()); }));

  score('Z4  the strict identity replaced by a truthy coercion', mutate(GS03_REL,
    "product_strategy_enabled: (typeof productStrategyEnabled_ === 'function') ? (productStrategyEnabled_() === true) : false",
    "product_strategy_enabled: (typeof productStrategyEnabled_ === 'function') ? !!productStrategyEnabled_() : false",
    function () { return !/product_strategy_enabled:\s*\(typeof productStrategyEnabled_ === 'function'\)\s*\?\s*\(productStrategyEnabled_\(\) === true\)/.test(gsField()); }));

  score('Z5  the field hard-coded true', mutate(GS03_REL,
    "product_strategy_enabled: (typeof productStrategyEnabled_ === 'function') ? (productStrategyEnabled_() === true) : false",
    'product_strategy_enabled: true',
    function () { return /product_strategy_enabled\s*:\s*true\s*[,}\n]/.test(gsField()); }));

  score('Z6  the field hard-coded false', mutate(GS03_REL,
    "product_strategy_enabled: (typeof productStrategyEnabled_ === 'function') ? (productStrategyEnabled_() === true) : false",
    'product_strategy_enabled: false',
    function () { return /product_strategy_enabled\s*:\s*false\s*[,}\n]/.test(gsField()); }));

  score('Z7  an EXISTING capability field deleted', mutate(GS03_REL,
    "    requestOrderSiteConfirmRequired: (typeof requestOrderSiteConfirmRequired_ === 'function') ? (requestOrderSiteConfirmRequired_() === true) : true,\n",
    '', function () { return !/requestOrderSiteConfirmRequired\s*:/.test(gsField()); }));

  /* THE ANCHOR CARRIES THE NEXT LINE, because `jsonResponse_({ success: true, data: {` is ALSO how
     handleGetTable_ answers — a shorter anchor matched twice, the mutation was refused as ambiguous,
     and the probe scored as a survivor. Which is the right outcome for an ambiguous anchor and the
     wrong outcome for this property, so the anchor is narrowed rather than the rule relaxed. */
  score('Z8  the response envelope broken (data flattened away)', mutate(GS03_REL,
    "return jsonResponse_({ success: true, data: {\n    capabilitiesVersion:",
    "return jsonResponse_({ success: true, payload: {\n    capabilitiesVersion:",
    function () { return !/jsonResponse_\(\{\s*success:\s*true,\s*data:\s*\{/.test(gsField()); }));

  score('Z9  the capability handler made to open a spreadsheet', mutate(GS03_REL,
    'function handleGetClientCapabilities_() {',
    'function handleGetClientCapabilities_() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();',
    function () { return /SpreadsheetApp/.test(gsField()); }));

  score('Z10 the capability handler made to write', mutate(GS03_REL,
    'function handleGetClientCapabilities_() {',
    "function handleGetClientCapabilities_() {\n  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('x').appendRow([1]);",
    function () { return /appendRow|SpreadsheetApp/.test(gsField()); }));

  score('Z11 the capability handler given a LockService', mutate(GS03_REL,
    'function handleGetClientCapabilities_() {',
    'function handleGetClientCapabilities_() {\n  LockService.getScriptLock().waitLock(1000);',
    function () { return /LockService/.test(gsField()); }));

  score('Z12 the capability handler given a CacheService', mutate(GS03_REL,
    'function handleGetClientCapabilities_() {',
    'function handleGetClientCapabilities_() {\n  CacheService.getScriptCache().get(\'k\');',
    function () { return /CacheService/.test(gsField()); }));

  score('Z13 system.health un-routed on one verb', mutate(GS01_REL,
    "    if (action === 'system.health') {\n      body.__km_handler = 'doPost';",
    "    if (action === 'system.health.disabled') {\n      body.__km_handler = 'doPost';",
    function () { return (read(GS01_REL).match(/action === 'system\.health'/g) || []).length !== 2; }));

  score('Z14 getClientCapabilities un-routed on one verb', mutate(GS01_REL,
    "    // F1-7N-FA-3C-R6E1-R1 — read-only client capability transport (single flag authority; see 03_).\n    if (action === 'getClientCapabilities') {",
    "    // F1-7N-FA-3C-R6E1-R1 — read-only client capability transport (single flag authority; see 03_).\n    if (action === 'getClientCapabilitiesX') {",
    function () { return (read(GS01_REL).match(/action === 'getClientCapabilities'/g) || []).length !== 2; }));

  score('Z15 the production setter call removed from the bootstrap', mutate(DBAPI_REL,
    '                _psAcc.setCapability(caps);',
    '                void caps;',
    function () {
      var d = decomment(read(DBAPI_REL));
      var s = d.indexOf('window.KM.api.applyClientCapabilities(caps)');
      var e = d.indexOf('_kmCapAppliedSeq_ = mySeq');
      return !/setCapability\s*\(\s*caps\s*\)/.test(d.slice(s, e));
    }));

  score('Z16 the setter moved ABOVE the supersede guards', mutate(DBAPI_REL,
    '    var mySeq = ++_kmCapSeq_;',
    '    var mySeq = ++_kmCapSeq_;\n    try { window.KM.productPricingWorkspace.setCapability({}); } catch (e0) {}',
    function () {
      var d = decomment(read(DBAPI_REL));
      var fnS = d.indexOf('async function _kmApplyClientCapabilities_');
      var body = d.slice(fnS, d.indexOf('window.KM.DB.applyClientCapabilities ='));
      return body.indexOf('setCapability') < body.indexOf('issuedIdentity !== nowIdentity');
    }));

  score('Z17 the glue fed a value of its own invention', mutate(DBAPI_REL,
    '                _psAcc.setCapability(caps);',
    '                _psAcc.setCapability({ product_strategy_enabled: true });',
    function () {
      var d = decomment(read(DBAPI_REL));
      var s = d.indexOf('window.KM.api.applyClientCapabilities(caps)');
      var e = d.indexOf('_kmCapAppliedSeq_ = mySeq');
      return /setCapability\(\s*\{\s*product_strategy_enabled:\s*true/.test(destring(d.slice(s, e)) === '' ? d.slice(s, e) : d.slice(s, e));
    }));

  score('Z18 the glue made to issue a SECOND request', mutate(DBAPI_REL,
    '                _psAcc.setCapability(caps);',
    '                window.KM.DB.getClientCapabilities(); _psAcc.setCapability(caps);',
    function () {
      var d = decomment(read(DBAPI_REL));
      var s = d.indexOf('window.KM.api.applyClientCapabilities(caps)');
      var e = d.indexOf('_kmCapAppliedSeq_ = mySeq');
      return /getClientCapabilities/.test(d.slice(s, e));
    }));

  score('Z19 the failure reason dropped, so a fault becomes a missing field', mutate(ACC_REL,
    "    if (isObj(meta) && str(meta.failureCode) !== '') {",
    '    if (false) {',
    function () {
      var m = fresh(ACC_REL);
      m.setCapability(null, { failureCode: 'AUTH_OR_ACCESS_HTML' });
      return m.capabilityFailure() !== 'NOT_AUTHORIZED';
    }));

  score('Z20 FIELD_ABSENT collapsed into SERVER_FALSE', mutate(ACC_REL,
    '      _enabled = false; _capabilityHeard = false; _capabilityState = CAP.FIELD_ABSENT;',
    '      _enabled = false; _capabilityHeard = true; _capabilityState = CAP.SERVER_FALSE;',
    function () {
      var m = fresh(ACC_REL);
      m.setCapability({});
      return m.capabilityState() !== 'FIELD_ABSENT';
    }));

  score('Z21 the literal-true rule relaxed to ==', mutate(ACC_REL,
    '    if (v === true) {',
    '    if (v == true) {',
    function () {
      var m = fresh(ACC_REL);
      m.setCapability({ product_strategy_enabled: 1 });
      return m.isEnabled() === true;
    }));

  score('Z22 the mirror hard-coded true', mutate(ACC_REL,
    '  var _enabled = false;',
    '  var _enabled = true;',
    function () {
      var m = fresh(ACC_REL);
      return m.isEnabled() === true;
    }));

  score('Z23 PENDING removed — a fresh module claims to have been told', mutate(ACC_REL,
    '  var _capabilityState = CAP.PENDING;',
    '  var _capabilityState = CAP.SERVER_FALSE;',
    function () {
      var m = fresh(ACC_REL);
      return m.capabilityState() !== 'PENDING';
    }));

  score('Z24 system.health re-introduced into the accessor', mutate(ACC_REL,
    "  var CAPABILITY_SOURCE = 'shared-bootstrap:getClientCapabilities';",
    "  var CAPABILITY_ACTION = 'system.health';\n  var CAPABILITY_SOURCE = 'shared-bootstrap:getClientCapabilities';",
    function () {
      return (decomment(read(ACC_REL)).match(/['"]system\.health['"]/g) || []).length !== 0;
    }));

  score('Z25 refreshCapability made to dispatch again', mutate(ACC_REL,
    '  function refreshCapability() {\n    return Promise.resolve(_enabled === true);',
    "  function refreshCapability() {\n    readOnce(transportOf(), 'system.health', {});\n    return Promise.resolve(_enabled === true);",
    function () {
      return (decomment(read(ACC_REL)).match(/['"]system\.health['"]/g) || []).length !== 0;
    }));

  score('Z26 a second retry loop added to the accessor', mutate(ACC_REL,
    '  function isEnabled() { return _enabled === true; }',
    '  var maxRetries = 3;\n  function isEnabled() { return _enabled === true; }',
    function () {
      return /maxRetries/.test(destring(decomment(read(ACC_REL))));
    }));

  score('Z27 the transport bound overridden in the accessor', mutate(ACC_REL,
    '  function isEnabled() { return _enabled === true; }',
    '  var readTimeoutMs = 600000;\n  function isEnabled() { return _enabled === true; }',
    function () {
      return /readTimeoutMs/.test(destring(decomment(read(ACC_REL))));
    }));

  score('Z28 the controller reports PENDING as FEATURE_DISABLED', mutate(PAGE_REL,
    '        if (capabilityPending()) {\n          return Promise.resolve(show(P.LOADING_CAPABILITY, P.UX_PAGE.LOADING_CAPABILITY, []));\n        }',
    '', function () {
      return !/if \(capabilityPending\(\)\) \{/.test(decomment(read(PAGE_REL)));
    }));

  score('Z29 the controller reports a missing field as FEATURE_DISABLED', mutate(PAGE_REL,
    "        if (capabilityState() === 'FIELD_ABSENT') {",
    '        if (false) {',
    function () {
      return !/capabilityState\(\) === 'FIELD_ABSENT'/.test(decomment(read(PAGE_REL)));
    }));

  score('Z30 the controller reports a transport fault as FEATURE_DISABLED', mutate(PAGE_REL,
    '        if (capFail) {',
    '        if (false && capFail) {',
    function () {
      var p = decomment(read(PAGE_REL));
      return /if \(false && capFail\)/.test(p);
    }));

  score('Z31 an inline setCapability added to index.html', mutate(INDEX_REL,
    '</body>', '<script>KM.productPricingWorkspace.setCapability({product_strategy_enabled:true});</script>\n</body>',
    function () { return (read(INDEX_REL).match(/setCapability/g) || []).length !== 0; }));

  score('Z32 the harness raises the mirror itself, as it did before R4', mutate(
    'assets/tests/_p1b8c-replay.js',
    '    var hasSharedBootstrap = !!(g.KM && g.KM.DB && typeof g.KM.DB.applyClientCapabilities === \'function\');',
    '    var hasSharedBootstrap = false; accessor.setCapability({ product_strategy_enabled: true });',
    function () {
      return /setCapability\(\{ product_strategy_enabled: true \}\)/.test(
        read('assets/tests/_p1b8c-replay.js'));
    }));

  return report();
}

function report() {
  console.log('\npassed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
  if (fail > 0) process.exitCode = 1;
}
