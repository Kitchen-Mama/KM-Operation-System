/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE THIRD AUTHORITY, AND WHY EVERY SUITE MISSED IT        (P1-B8D-R4)
 * ==================================================================================================
 *
 * P1-B8D flipped the two authorities it had named — `PRODUCT_STRATEGY_ENABLED_` on the server and
 * `KM_STAGED_SECTIONS_['product-strategy'].enabled` in the shell — shipped, deployed, and attested
 * the live /exec at R11. The navigation appeared, all six sub-tabs opened, and every one of them
 * rendered the same three lines:
 *
 *     Product Strategy is not enabled yet.
 *     The capability is off, so no request was sent.
 *     FEATURE_DISABLED
 *
 * THERE WAS A THIRD AUTHORITY AND IT HAD NO PRODUCER. `km-product-pricing-workspace.js` keeps a
 * capability mirror, `_enabled`, which defaults false and is raised only by `setCapability(caps)`.
 * Its own header says "only a server capability payload can raise it". No server capability payload
 * ever reaches it: `setCapability` has ZERO callers in `assets/js` and in `index.html`. The boot
 * bootstrap (app.js -> KM.DB.applyClientCapabilities -> getClientCapabilities -> KM.api) carries
 * three backend-owned flags and none of them is this one. The mirror is unreachable in a browser.
 *
 * WHILE THE FEATURE WAS "INSTALLED, NOT ACTIVATED" THAT WAS CORRECT, and index.html still says so in
 * as many words: the mirror was the third of four locks. Activation moved two locks and left this
 * one, because nothing could see it — which is the part this suite exists to change.
 *
 * WHY EVERY SUITE PASSED. The whole corpus raises the mirror itself. `_p1b8c-replay.js install()`
 * calls `setCapability({product_strategy_enabled:true})` in the same breath as installing the fake
 * transport, so the browser acceptance runner photographed a fully rendered board through a door
 * production cannot open. That is a SECOND, TEST-ONLY ACTIVATION PATH, and a harness that supplies
 * the one input production is missing cannot fail for the one reason production fails.
 *
 * And one assertion actively guarded the defect: shell-integration E2/E2a assert that neither the
 * shell nor the page controller mentions `setCapability`. True and load-bearing before activation;
 * after activation it forbids the fix.
 *
 * WHAT THIS SUITE DOES. It reproduces the live screen through the production entry point with the
 * real modules, the real capability payload PARSED OUT OF THE SERVER SOURCE (so the test cannot
 * invent a field the server does not send), and NO call to `setCapability` anywhere. Then it holds
 * the repair: the mirror is DERIVED from a deployed read-only action, it is not a fourth flag, and
 * the server remains the last gate.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');

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
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  /* A PROMISE IS NOT A VERDICT. The first version of this compared `r === true` and every mutant that
     had to reach the transport to prove anything came back as SURVIVED — five of them, all reporting
     an unguarded rule while measuring nothing. An async probe now has to be run as one. */
  if (r && typeof r.then === 'function') {
    fail++; neg.missed++;
    console.error('FAIL ' + label + ' — PROBE ERROR: asynchronous verdict; use mutP');
    return;
  }
  score(label, r);
}
/** The same, for a probe that must await the wire. Returns a promise the caller MUST chain. */
function mutP(label, f) {
  var r;
  try { r = f(); } catch (e) {
    neg.missed++; fail++;
    console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    return Promise.resolve();
  }
  return Promise.resolve(r).then(function (v) { score(label, v); },
    function (e) {
      neg.missed++; fail++;
      console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    });
}

var ROOT = path.join(__dirname, '..', '..');
/**
 * LINE ENDINGS NORMALIZED ON READ  (P1-B8D-R5).
 *
 * This suite shipped in R4 without this and was RED ON EVERY FRESH CHECKOUT: `core.autocrlf=true`
 * stores LF in the blob and writes CRLF into the working tree, so four mutant anchors that span
 * more than one line matched zero times and `mut` reported them as PROBE ERROR / SURVIVED — four
 * announcements of unguarded rules, about code that had not changed by a byte. It passed where it
 * was written only because those files happened to be LF in that particular tree, which is the
 * worst way for a test to pass.
 *
 * `_psb-harness.js` has carried this same note since P1-B2 and for the same reason. Every reader of
 * these files needs it, including the next clone.
 */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}
var JS = path.join(ROOT, 'assets', 'js');
var H = require(path.join(__dirname, '_psb-harness.js'));

var SRC = {
  index: read('index.html'),
  app: read('assets/js/app.js'),
  accessor: read('assets/js/api/km-product-pricing-workspace.js'),
  page: read('assets/js/pages/product-strategy-board.js'),
  dbapi: read('assets/js/api/operation-system-db-api.js'),
  foundation: read('assets/js/api/km-api-foundation.js'),
  master: read('assets/specs/active/apps-script/03_master_data_handlers.gs'),
  health63: read('assets/specs/active/apps-script/63_api_v1_system_health.gs'),
  cfg: read('assets/specs/active/apps-script/00_config.gs'),
  partial: read('assets/html/pages/product-strategy-board.html'),
  replay: read('assets/tests/_p1b8c-replay.js')
};

var ACC = require(path.join(JS, 'api', 'km-product-pricing-workspace.js'));
var UNI = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
var LIVE = require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));
var VIEWS = require(path.join(JS, 'product-strategy', 'psb-views.js')).PSB_VIEWS;

var partialSkeleton = H.productionSkeleton(SRC.partial);

/* THE THREE LINES OFF THE SCREENSHOT, spelled once. Every assertion below compares against these,
   so "reproduced the live failure" means the same characters, not a similar-looking state. */
var LIVE_HEADLINE = 'Product Strategy is not enabled yet.';
var LIVE_DETAIL = 'The capability is off, so no request was sent.';
var LIVE_CODE = 'FEATURE_DISABLED';

// --------------------------------------------------------------------------------------------- 1
/**
 * THE CAPABILITY PAYLOAD THE DEPLOYED SERVER ACTUALLY SENDS, parsed out of its own handler.
 * Hand-writing this object is how a test comes to assert against a server that does not exist: the
 * whole finding is that a field is ABSENT, and a fixture that lists the fields is a fixture whose
 * author decides which ones are there.
 */
function deployedCapabilityPayload() {
  var m = /function handleGetClientCapabilities_\(\)\s*\{([\s\S]*?)\n\}/.exec(SRC.master);
  if (!m) throw new Error('handleGetClientCapabilities_ not found in 03_');
  var body = m[1];
  var keys = [];
  var re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm, k;
  while ((k = re.exec(body))) { if (keys.indexOf(k[1]) === -1) keys.push(k[1]); }
  var out = {};
  keys.forEach(function (key) {
    if (key === 'capabilitiesVersion') { out[key] = 'parsed-from-03'; return; }
    if (key === 'success' || key === 'data') return;
    out[key] = true;              // every flag at its most permissive: absence is the only finding
  });
  return { keys: keys.filter(function (x) { return x !== 'success' && x !== 'data'; }), payload: out };
}
var CAPS = deployedCapabilityPayload();

/**
 * A transport that counts, and answers ONLY what the scenario says the deployment answers.
 *
 * `health` is the whole variable: undefined models the deployment as it was before this round (the
 * capability question has no answer on the wire), an object models 63_'s FLAT health envelope. No
 * scenario is allowed to hand the accessor the mirror directly - that is the test-only door this
 * whole suite exists to close.
 */
function countingApi(scenario) {
  scenario = scenario || {};
  var calls = [];
  return {
    calls: calls,
    pricingCalls: function () {
      return calls.filter(function (a) { return String(a).indexOf('productPricing.') === 0; });
    },
    api: {
      buildRequestEnvelope: function (action, payload, o) {
        return { action: action, requestId: (o && o.requestId) || 'rid', payload: payload || {} };
      },
      transport: {
        safeReadJsonResponse: function (r) { return r; },
        post: function (dto) {
          var action = dto && dto.action;
          calls.push(action);
          if (action === 'system.health') {
            if (scenario.healthThrows) return Promise.reject(new Error('network'));
            if (scenario.health === undefined) return Promise.resolve({ success: true });
            return Promise.resolve(scenario.health);
          }
          return Promise.resolve({ ok: false, error: { code: 'NOT_SERVED' } });
        }
      }
    },
    /* P1-B8D-R10A — THE SHARED TRANSPORT, WHICH IS THE DOOR THE ACCESSOR NOW USES.

       R10A removed the last Product Strategy caller of `KM.api.transport.post`, so a socket that
       only offers `post` records nothing and every scenario here measured an accessor that had
       already refused before sending. Same counting, same scenarios, same envelopes — moved to the
       boundary production dispatches through.

       It resolves the { success, envelope } shape `KM.transport.request` resolves, including for a
       thrown scenario: the shared transport reports transport failure as a typed CODE rather than a
       rejection, and a harness that threw instead would be exercising a path production cannot
       reach. */
    transport: {
      request: function (o) {
        var action = o && o.action;
        calls.push(action);
        if (action === 'system.health') {
          if (scenario.healthThrows) {
            return Promise.resolve({ success: false, code: 'HTTP_TRANSPORT_ERROR', details: {} });
          }
          if (scenario.health === undefined) return Promise.resolve({ success: true, envelope: { success: true } });
          return Promise.resolve({ success: true, envelope: scenario.health });
        }
        return Promise.resolve({ success: true, envelope: { ok: false, error: { code: 'NOT_SERVED' } } });
      }
    }
  };
}

/** One mount, through the production entry, with the real modules and a counting socket. */
function mountLive(opts) {
  opts = opts || {};
  var dom = H.makeDom(partialSkeleton);
  var t = countingApi(opts);
  /* EVERY SCENARIO ASKS AGAIN. The mirror is a module singleton - one page life in a browser, one
     process here - so without this the second scenario would be answered by the first one's server. */
  ACC.setCapability({});
  var savedKM = global.KM, savedWin = global.window, savedDoc = global.document;
  global.window = global.window || {};
  global.KM = { api: t.api, transport: t.transport, productPricingWorkspace: ACC };
  global.window.KM = global.KM;
  global.document = dom.document;
  var state = null, err = null;
  var c = PAGE.create({ document: dom.document, accessor: ACC,
    siteUniverse: UNI, liveAdapter: LIVE, board: null });
  return Promise.resolve(ACC.refreshCapability({ force: true }))
    .then(function () { return c.loadUniverse(); })
    .then(function (r) { state = r; }, function (e) { err = e; })
    .then(function () {
      var box = dom.document.querySelector('[data-cy="psb-state"]');
      var headline = box && box.querySelector('.psb-state__headline');
      var detail = box && box.querySelector('.psb-state__detail');
      global.KM = savedKM; global.window = savedWin; global.document = savedDoc;
      return {
        state: state, err: err, calls: t.calls.slice(), pricingCalls: t.pricingCalls(),
        headline: headline ? String(headline.textContent) : null,
        detail: detail ? String(detail.textContent) : null,
        text: box ? String(box.textContent || '') : null,
        capability: ACC.isEnabled()
      };
    });
}

// =================================================================================================
section('A — THE LIVE SCREEN, REPRODUCED THROUGH THE PRODUCTION ENTRY');
// =================================================================================================

/* THE SERVER IS ON, AND THE TEST SAYS SO FROM THE SERVER'S OWN SOURCE. Every assertion below is
   about a client that refuses while the server would have answered. */
ok(/var PRODUCT_STRATEGY_ENABLED_ = true;/.test(SRC.cfg),
  'A1  the server flag is true in the config of record');
ok(/product_strategy_enabled/.test(SRC.health63),
  'A1a and 63_ publishes product_strategy_enabled, so the server state is READABLE by a client');
eq(SRC.app.indexOf("'product-strategy'") >= 0
  && /enabled: true/.test(SRC.app.slice(SRC.app.indexOf("'product-strategy': {"),
    SRC.app.indexOf("'product-strategy': {") + 400)), true,
  'A2  and the navigation authority is true, which is why the menu and six sub-tabs appear');

/* THE CAPABILITY BOOTSTRAP RUNS, WITH THE REAL PAYLOAD, AT ITS MOST PERMISSIVE. */
ok(CAPS.keys.length >= 3, 'A3  the deployed capability payload was parsed from 03_', CAPS.keys);
eq(CAPS.keys.indexOf('product_strategy_enabled'), -1,
  'A3a and it does NOT carry product_strategy_enabled — the key the accessor waits for');
eq(ACC.setCapability(CAPS.payload), false,
  'A3b so applying the whole real payload to the mirror leaves it FALSE');

var A = null;
mountLive().then(function (r) {
  A = r;

  eq(r.capability, false, 'A4  the client capability mirror is false after a production boot');
  /* ZERO PRICING REQUESTS is the rule, and it is not the same as zero requests. Before this round
     the page sent nothing at all because it had nothing to ask; the repair gives it one question to
     ask, and the rule that survives both worlds is that a feature it cannot confirm costs no
     business read. */
  eq(r.pricingCalls, [], 'A5  and no productPricing read was sent', r.calls);
  eq(r.state && r.state.state, LIVE_CODE, 'A6  the rendered state is FEATURE_DISABLED');
  eq(r.headline, LIVE_HEADLINE, 'A6a with the headline off the screenshot');
  eq(r.detail, LIVE_DETAIL, 'A6b and the detail off the screenshot');
  ok(r.text !== null && r.text.indexOf(LIVE_CODE) >= 0,
    'A6c and the refusal code is named on screen', r.text);
  eq(r.state && r.state.may_analyse, false, 'A7  nothing may be analysed, so no board state exists');

  // ===============================================================================================
  section('B — THE SIX VIEWS ARE THE SAME SCREEN, WHICH IS WHAT THE SCREENSHOT SHOWED');
  // ===============================================================================================
  eq(VIEWS.VIEWS.length, 6, 'B1  six views are declared');
  /* The controller refuses BEFORE any view is selected, so the view id cannot change the answer.
     This is asserted as the absence of a branch rather than by mounting six times: there is no view
     parameter on the path that produces this state. */
  var lu = /function loadUniverseResolved\(\)[\s\S]*?\n    \}/.exec(SRC.page);
  ok(!!lu, 'B2  the universe-load body is locatable in the shipped source');
  ok(lu && lu[0].indexOf('capabilityOk()') < lu[0].indexOf('SU || !live'),
    'B2a and the capability is read before the modules are even checked');
  ok(lu && !/view|tab/i.test(lu[0].split('capabilityOk()')[1].split('}')[0] || ''),
    'B2b the refusal branch reads no view, so all six render identically');
  /* AND THE DERIVE RUNS BEFORE THE REFUSAL, which is the ordering the live page did not have.
     Asserted on the entry point rather than on the body, because that is where it lives now. */
  var entry = /C\.loadUniverse = function \(\)[\s\S]*?\n    \};/.exec(SRC.page);
  ok(!!entry && /capabilityResolved\(\)/.test(entry[0]),
    'B3  loadUniverse resolves the capability before running the body');

  // ===============================================================================================
  section('C — THE THIRD AUTHORITY, NAMED: A MIRROR WITH NO PRODUCER');
  // ===============================================================================================
  var prodFiles = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (f) {
      var p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) return walk(p);
      if (/\.js$/.test(f)) prodFiles.push(p);
    });
  }(JS));
  var callers = prodFiles.filter(function (p) {
    var s = fs.readFileSync(p, 'utf8');
    if (/km-product-pricing-workspace\.js$/.test(p)) return false;   // the definition site
    return /\.setCapability\s*\(/.test(s);
  }).map(function (p) { return path.relative(ROOT, p).split(path.sep).join('/'); });

  eq(callers, [], 'C1  NOTHING in assets/js raises the capability mirror', callers);
  eq(SRC.index.indexOf('setCapability') >= 0, false, 'C1a and neither does index.html');
  ok(/var _enabled = false;/.test(SRC.accessor), 'C2  the mirror is declared false');
  ok(/only a server capability payload/i.test(SRC.accessor),
    'C2a and its own header says only a server payload may raise it');
  /* C3 — AND THAT PAYLOAD DOES NOT EXIST ON THIS PATH. The bootstrap is real, it runs at boot, and
     it applies a three-flag envelope into KM.api. It never reaches this accessor. */
  ok(/KM\.DB\.applyClientCapabilities/.test(SRC.app),
    'C3  app.js runs the capability bootstrap at boot');
  ok(/applyClientCapabilities\(caps\)/.test(SRC.dbapi),
    'C3a which applies the backend envelope through KM.api');
  ok(!/productPricingWorkspace/.test(SRC.dbapi) && !/productPricingWorkspace/.test(SRC.foundation),
    'C3b and neither the bootstrap nor the foundation has ever heard of this accessor');

  // ===============================================================================================
  section('D — WHY THE HARNESS COULD NOT SEE IT: A SECOND, TEST-ONLY ACTIVATION PATH');
  // ===============================================================================================
  /* THE DOOR IS SHUT, AND THIS IS THE ASSERTION THAT KEEPS IT SHUT. `install()` used to call
     `setCapability({product_strategy_enabled:true})` in the same breath as swapping the transport, so
     every replay-driven suite — including the seven-viewport browser acceptance — ran with the one
     input production never receives. The screenshots were real; the world was not. */
  /* READ AS CODE, NOT AS PROSE. A comment that mentions the call is not the call, and a probe that
     cannot tell them apart reports a repaired harness as broken — which is exactly what the first
     version of this did, against a header paragraph describing the behaviour that had just been
     removed. */
  var replayCode = SRC.replay.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  ok(!/setCapability\(\{\s*product_strategy_enabled:\s*true\s*\}\)/.test(replayCode),
    'D1  the replay harness no longer raises the mirror for the page');
  ok(/product_strategy_enabled: opts\.capability !== false/.test(SRC.replay),
    'D1a it SERVES the capability question instead, the way the deployment answers it');
  ok(/R\.CAPABILITY_ACTION = 'system\.health'/.test(SRC.replay),
    'D1b on the same action the shipped accessor asks');
  /* D2 — AND THE BROWSER ACCEPTANCE NOW WALKS THE PRODUCTION PATH. `capabilityOff` is a server
     answer, not a poke at the client, so "the feature is off" is modelled the way a browser meets it. */
  var runnerSrc = read('assets/tests/_p1b8c-visual-runner.js');
  ok(/P1B8C_REPLAY\.install/.test(runnerSrc),
    'D2  the activated visual runner mounts through that same install');
  ok(runnerSrc.indexOf('KM.productPricingWorkspace.setCapability') < 0,
    'D2a and it no longer reaches into the accessor to decide the answer');
  ok(/capability: capOn/.test(runnerSrc),
    'D2b it configures the SERVER side of the question instead');

  // ===============================================================================================
  section('E — THE REPAIR: DERIVED, NOT DECLARED');
  // ===============================================================================================
  /* The mirror must be raised from something the SERVER already publishes through an action that is
     already deployed and already read-only. 63_ publishes product_strategy_enabled on system.health,
     which the client transport already knows. No fourth flag, no new server field, no Apps Script
     change. These assertions are the contract the fix must satisfy; they fail until it lands. */
  ok(typeof ACC.refreshCapability === 'function',
    'E1  the accessor exposes a DERIVE step, so the mirror has a producer at last');
  ok(/system\.health/.test(SRC.accessor),
    'E1a which reads the deployed read-only health action');
  var fourth = (SRC.accessor.match(/var _enabled/g) || []).length;
  eq(fourth, 1, 'E2  and there is still exactly ONE mirror variable — not a fourth flag');
  ok(/PRODUCT_STRATEGY_ENABLED_/.test(SRC.cfg)
    && SRC.accessor.indexOf('PRODUCT_STRATEGY_ENABLED_ =') < 0,
    'E2a the client never declares the server flag, it only reflects it');
  ok(/if \(io\.flagEnabled\(\) !== true\)/.test(read('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs')),
    'E3  and the server keeps the last gate regardless of what any client mirrors');

  // ===============================================================================================
  section('F — THE REPAIRED CHAIN, DRIVEN FROM BOTH SERVER STATES');
  // ===============================================================================================
  var HEALTH_ON = { success: true, ok: true, product_strategy_enabled: true };
  var HEALTH_OFF = { success: true, ok: true, product_strategy_enabled: false };

  return mountLive({ health: HEALTH_ON }).then(function (on) {
    eq(on.capability, true, 'F1  server says enabled -> the mirror rises');
    eq(on.calls.filter(function (a) { return a === 'system.health'; }).length, 1,
      'F1a from exactly one health read', on.calls);
    eq(on.pricingCalls, ['productPricing.siteUniverse.get'],
      'F1b and the site universe is then actually requested', on.calls);
    ok(on.state && on.state.state !== LIVE_CODE,
      'F1c the page is no longer answering FEATURE_DISABLED', on.state && on.state.state);

    return mountLive({ health: HEALTH_OFF });
  }).then(function (off) {
    eq(off.capability, false, 'F2  server says disabled -> the mirror stays down');
    eq(off.pricingCalls, [], 'F2a and no productPricing read is sent', off.calls);
    eq(off.state && off.state.state, LIVE_CODE, 'F2b the page says FEATURE_DISABLED');
    eq(off.state && off.state.may_analyse, false, 'F2c and never renders READY');

    /* F3 — ROLLBACK IS FAIL-CLOSED AT BOTH LAYERS, and the second one is the one that matters.
       Lowering the server flag lowers this mirror on the next page life; and even a client that
       somehow still believed it was raised reaches a handler that refuses before it opens a
       spreadsheet. That ordering is owned by the activation suite and by b7 D8a; it is named here
       because a mirror is only ever a saving, never a permission. */
    return mountLive({ healthThrows: true });
  }).then(function (dead) {
    eq(dead.capability, false, 'F3  an unreadable health answer leaves the mirror FALSE');
    eq(dead.pricingCalls, [], 'F3a and still costs zero business reads', dead.calls);
    /* P1-B8D-R10A §6 — STILL CLOSED, AND NO LONGER MISNAMED.

       F3 and F3a are the assertions that matter and both are untouched: the mirror stays FALSE and
       the run still costs ZERO business reads. What changed is the SENTENCE. This used to render as
       FEATURE_DISABLED — "Product Strategy is not enabled yet" — for a health read that was never
       completed, which states a product decision on the strength of a request that got no answer.

       R10A put this read on the shared transport, so the failure now has a classification, and the
       controller shows it. FEATURE_DISABLED from here on means exactly one thing: a server answered,
       and what it said was false. */
    eq(dead.state && dead.state.state, 'SOURCE_NOT_CONNECTED',
      'F3b failing closed, and named as the unanswered read it was rather than as a disabled feature');

    return mountLive({ health: { success: true, ok: true } });
  }).then(function (noField) {
    eq(noField.capability, false, 'F4  a health answer with no capability field is not a yes');
    eq(noField.pricingCalls, [], 'F4a zero business reads', noField.calls);

    return mountLive({ health: { success: true, product_strategy_enabled: 'true' } });
  }).then(function (stringy) {
    eq(stringy.capability, false, 'F5  and neither is the STRING "true"');

    // =============================================================================================
    section('G — mutants');
    // =============================================================================================
    var vm = require('vm');
    var ACC_SRC = SRC.accessor;
    /**
     * Load a mutated accessor in its own context, so one mutant cannot leak into the next — and hand
     * it a transport ON ITS OWN ROOT.
     *
     * The module closes over `window` at load time and reads `root.KM.api` at call time. The first
     * version of this put the transport on the test process's `global`, which that closure has never
     * heard of, so every transport-driven mutant reached `transportOf() === null`, answered
     * SOURCE_NOT_CONNECTED without sending anything, and scored as SURVIVED. Three mutants declared
     * three rules unguarded while measuring nothing at all.
     */
    function accessorFrom(src, api) {
      var mod = { exports: {} };
      var win = {};
      var ctx = { module: mod, exports: mod.exports, window: win, console: console,
        Promise: Promise, setTimeout: setTimeout };
      ctx.self = ctx; ctx.globalThis = ctx;
      vm.createContext(ctx);
      vm.runInContext(src, ctx, { filename: 'accessor' });
      if (api) {
        win.KM = win.KM || {};
        win.KM.api = api.api || api;
        /* R10A — the mutants drive the shared transport too, or they measure a refusal that happened
           before anything was sent, which is how three of them scored SURVIVED while measuring
           nothing. `accessorFrom` accepts either a bare api (older callers) or the whole
           countingApi result. */
        if (api.transport) win.KM.transport = api.transport;
      }
      return mod.exports;
    }
    function swapAcc(a, b) {
      var n = ACC_SRC.split(a).length - 1;
      if (n !== 1) { throw new Error('accessor anchor count ' + n + ' :: ' + a.slice(0, 70)); }
      return ACC_SRC.split(a).join(b);
    }
    /** Drive one accessor through the health read with a given server answer. */
    function derive(acc, health) {
      var t = countingApi({ health: health });
      acc.__setApi = null;
      var g = { KM: { api: t.api } };
      // the accessor reads its transport off the global it was loaded with
      return { acc: acc, t: t, g: g };
    }

    /* G1 — THE DEFECT ITSELF, PUT BACK. A mirror with no producer is the live failure, and the
       repaired suite must not pass without one. */
    mut('G1 the derive step is removed, leaving the mirror with no producer again', function () {
      var m = swapAcc('    refreshCapability: refreshCapability, capabilityHeard: capabilityHeard,\n',
        '');
      var A2 = accessorFrom(m, null);
      return typeof ACC.refreshCapability === 'function'
        && typeof A2.refreshCapability !== 'function';
    });

    /* G2 — THE OPPOSITE MISTAKE, AND THE ONE THAT WOULD HAVE "FIXED" THE SCREENSHOT FASTEST. */
    mut('G2 the mirror is hard-coded true, so a rolled-back server still gets a business read',
      function () {
        var m = swapAcc('  var _enabled = false;\n', '  var _enabled = true;\n');
        var A2 = accessorFrom(m, null);
        return ACC.isEnabled() === false && A2.isEnabled() === true;
      });

    /* G3 — THE SERVER'S "NO" IS READ AS A "YES". */
    var G3p = mutP('G3 any health answer raises the mirror, rather than the literal true', function () {
      var m = swapAcc('        _enabled = v === true;', '        _enabled = v !== true;');
      var t = countingApi({ health: HEALTH_OFF });
      var A2 = accessorFrom(m, t);
      A2.setCapability({});
      return A2.refreshCapability({ force: true }).then(function (v) { return v === true; });
    });

    /* G4 — FAIL OPEN INSTEAD OF FAIL CLOSED. */
    var G4p = mutP('G4 an unreadable health answer is treated as permission', function () {
      /* R10A — THE RULE MOVED, SO THE MUTANT MOVED WITH IT. Fail-closed used to live only in the
         `.catch`, because the POST shim reported a transport failure by throwing. The shared
         transport reports it as a typed CODE instead, so the branch that decides is the one that
         inspects `r0.code`. Mutating the old site would now mutate a path production cannot reach. */
      var m = swapAcc('        if (r0.code) {\n          _enabled = false;',
        '        if (r0.code) {\n          _enabled = true;');
      var t = countingApi({ healthThrows: true });
      var A2 = accessorFrom(m, t);
      A2.setCapability({});
      /* THE MIRROR, NOT THE RETURN VALUE. The fail-closed branch both lowers `_enabled` AND returns
         false, so a mutant that raises the mirror still resolves false and would score as caught by a
         probe that only read the resolved value — it did, on the first attempt at this. What must
         stay down is the mirror, because that is what every later caller reads. */
      return A2.refreshCapability({ force: true }).then(function () { return A2.isEnabled() === true; });
    });

    /* G5 — THE CAPABILITY IS READ OFF THE WRONG ENVELOPE LEVEL. 63_'s health is FLAT; a reader that
       only looks under `data` finds undefined and disables a feature that is switched on. This
       repository has already been bitten by exactly that, on exactly this action. */
    var G5p = mutP('G5 the health envelope is read as nested-only, so a flat answer disables the feature',
      function () {
        var m = swapAcc('        var v = (top && top.product_strategy_enabled !== undefined)\n'
          + '          ? top.product_strategy_enabled\n'
          + '          : (nested ? nested.product_strategy_enabled : undefined);',
          '        var v = nested ? nested.product_strategy_enabled : undefined;');
        var t = countingApi({ health: HEALTH_ON });
        var A2 = accessorFrom(m, t);
        A2.setCapability({});
        return A2.refreshCapability({ force: true }).then(function (v) { return v === false; });
      });

    /* G6 — THE BUSINESS READ IS SENT BEFORE THE ANSWER IS KNOWN. */
    var G6p = mutP('G6 the pricing read no longer waits behind the capability', function () {
      /* R10A — the gate now chooses between two sentences before refusing, so the anchor is the
         gate itself rather than the gate welded to the FEATURE_DISABLED line under it. */
      var m = swapAcc('    if (!isEnabled()) {\n      if (_capabilityFailure) {',
        '    if (false) {\n      if (_capabilityFailure) {');
      var t = countingApi({});
      var A2 = accessorFrom(m, t);
      A2.setCapability({});
      /* THE HONEST SIDE IS MEASURED TOO. "the mutant sent one" only means something beside "the
         shipped one sent none", or the probe is testing that a transport exists. */
      var honest = accessorFrom(ACC_SRC, countingApi({}).api);
      honest.setCapability({});
      var t0 = countingApi({});
      var honest2 = accessorFrom(ACC_SRC, t0.api);
      honest2.setCapability({});
      return honest2.getSiteUniverse({}).then(function () {
        return A2.getSiteUniverse({});
      }).then(function () {
        return t0.pricingCalls().length === 0 && t.pricingCalls().length === 1;
      });
    });

    /* G7 — THE PAGE STOPS ASKING. The controller half of the same rule. */
    mut('G7 the controller stops resolving the capability and refuses on the stale default',
      function () {
        var pageSrc = SRC.page;
        var a = '      return capabilityResolved().then(loadUniverseResolved);';
        var n = pageSrc.split(a).length - 1;
        if (n !== 1) { throw new Error('controller anchor count ' + n); }
        var m = pageSrc.split(a).join('      return Promise.resolve(loadUniverseResolved());');
        return /capabilityResolved\(\)\.then/.test(pageSrc) && !/capabilityResolved\(\)\.then/.test(m);
      });

    /* G8 — THE SUITE RAISES THE MIRROR ITSELF, which is exactly how every earlier suite missed this.
       Asserted against this file's own source: a reproduction that supplies the missing input is not
       a reproduction. */
    mut('G8 this suite raises the capability itself, the way the replay harness does', function () {
      /* THE PROBE MUST NOT READ ITSELF. The first version scanned this file for the raising call and
         found one — inside its own mutation string. A mutant whose anchor is its own source is a
         mutant that can never die, and it reported the rule as guarded while proving nothing. The
         needle is assembled at runtime and this block is cut out before the scan. */
      var self = read('assets/tests/product-strategy-live-activation-p1-b8d-r4.test.js');
      var MARK = 'G8 this suite raises';
      var from = self.indexOf(MARK);
      var to = self.indexOf('G9 the refusal branch');
      if (from < 0 || to < 0 || to <= from) { throw new Error('G8 self-exclusion markers missing'); }
      var body = self.slice(0, from) + self.slice(to);
      var needle = 'setCapability({ ' + 'product_strategy_enabled';
      var raisesToday = body.indexOf(needle) >= 0;
      var mutated = body.split('ACC.setCapability({});').join('ACC.' + needle + ': true });');
      return raisesToday === false && mutated.indexOf(needle) >= 0;
    });

    /* G9 — THE REFUSAL BECOMES VIEW-DEPENDENT, so the six sub-tabs would stop agreeing. */
    mut('G9 the refusal branch starts reading the view, so the six views could disagree', function () {
      var body = /function loadUniverseResolved\(\)[\s\S]*?\n    \}/.exec(SRC.page)[0];
      var a = "      if (!capabilityOk()) {";
      var m = body.split(a).join("      if (!capabilityOk() && C.view !== 'overview') {");
      return body.indexOf('C.view') < 0 && m.indexOf('C.view') >= 0;
    });

    return Promise.all([G3p, G4p, G5p, G6p]).then(function () {
      // ===========================================================================================
      section('H — THE RULES THIS ROUND DOES NOT OWN, AND WHERE THEY LIVE');
      // ===========================================================================================
      /* Named rather than duplicated. A second copy of an assertion is a second thing to update the
         day the rule changes, and these four already have owners that run in the same sweep. */
      var owners = [
        ['assets/tests/product-strategy-activation-p1-b8d.test.js', 'FEATURE_DISABLED',
          'H1 the server gate before io.openTarget() — activation suite §F'],
        ['assets/tests/product-strategy-shell-integration-p1-b7.test.js', 'partial',
          'H2 the partial is fetched and mounted — shell integration'],
        ['assets/tests/_release-order.js', 'staleAppTokenRefs',
          'H3 no asset is left behind on a published token — the release order'],
        ['assets/tests/product-strategy-information-architecture-p1-b8b.test.js', 'psb-views',
          'H4 the six views are declared once — information architecture']
      ];
      owners.forEach(function (o) {
        var src = '';
        try { src = read(o[0]); } catch (e) { src = ''; }
        ok(src.length > 0 && src.indexOf(o[1]) >= 0, o[2]);
      });

      console.log('\npassed ' + pass + '  failed ' + fail
        + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
      process.exit(fail ? 1 : 0);
    });
  });
}).catch(function (e) {
  console.error('FATAL ' + (e && e.stack || e));
  process.exit(1);
});
