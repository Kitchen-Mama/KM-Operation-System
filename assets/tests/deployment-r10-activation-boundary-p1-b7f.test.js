/**
 * ==================================================================================================
 * R10 IS DEPLOYED, AND THE DOOR IT WOULD OPEN HAS NO LOCK   —   P1-B7F
 * ==================================================================================================
 *
 * TWO WIRE BODIES AND ONE UNMODIFIED ACCESSOR. `_p1b7d-exec-capture.js` is the R9 response: its
 * meta.action said productPricing.workspace.get for a siteUniverse answer, and the shipped accessor
 * called it SOURCE_NOT_CONNECTED. `_p1b7f-exec-capture-r10.js` is the R10 response to the SAME action,
 * read the same way, through the same 302. Run both through the same accessor — not a relaxed one, not
 * a test-only path — and one is refused and one is classified correctly. THE THING THAT CHANGED IS THE
 * DEPLOYMENT, NOT THE TEST, and that is the only form of evidence this round accepts for "it is fixed
 * in production".
 *
 * THE READBACK QUESTION IS ANSWERED BY EXPERIMENT, NOT BY EYE. R10's readback fingerprints CA0BB90F /
 * 7273 where P1-B6 froze D53C96CE / 7272, and two different fingerprints is exactly what a drift
 * question looks like. §F rolls back the only two fields a redeploy legitimately changes and requires
 * the P1-B6 fingerprint to reappear byte for byte. It does. That covers the fields nobody thought to
 * check, which is the half that comparing ten row counts by eye always misses.
 *
 * WHY §G IS A TEST AND NOT A PARAGRAPH. P1-B8 asks whether production has a server-side identity
 * boundary. It does not: the Web App is published `executeAs USER_DEPLOYING` / `access
 * ANYONE_ANONYMOUS`, no runtime file asks Apps Script who is calling, and the router has no token,
 * no allowlist and no session check anywhere in front of a handler. Written as prose, that conclusion
 * would go stale the first time somebody adds a login and forgets what it was blocking. Written as
 * assertions, THE DAY IT STOPS BEING TRUE IS THE DAY THIS SUITE GOES RED — which is the signal to
 * re-run the GO/NO-GO, not a failure to be silenced. Every §G assertion says so in its own message.
 *
 * A FAILING ASSERTION HERE IS NEVER FIXED BY EDITING THE CAPTURES. They are immutable evidence: if a
 * future accessor answers something else for these bodies, that is a finding.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');
var JS = path.join(ROOT, 'assets', 'js');
var GSDIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

var SRC = {
  config: read(path.join(GSDIR, '00_config.gs')),
  router: read(path.join(GSDIR, '01_router.gs')),
  health: read(path.join(GSDIR, '63_api_v1_system_health.gs')),
  ppw: read(path.join(GSDIR, '72_api_v1_product_pricing_workspace.gs')),
  manifest: read(path.join(GSDIR, 'appsscript.json')),
  accessor: read(path.join(JS, 'api', 'km-product-pricing-workspace.js')),
  app: read(path.join(JS, 'app.js'))
};

var R9_CAPTURE = require(path.join(__dirname, '_p1b7d-exec-capture.js'));
var R10_CAPTURE = require(path.join(__dirname, '_p1b7f-exec-capture-r10.js'));
var READBACK = require(path.join(__dirname, '_p1b7f-readback-r10.js'));

var UNIVERSE_ACTION = 'productPricing.siteUniverse.get';
var R9 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9';
var R10 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10';

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, label, A === B ? undefined : { got: a, want: b });
}

/** The client chain, loaded fresh so the capability mirror starts where the file declares it. */
function clientChain(env) {
  Object.keys(require.cache).forEach(function (k) {
    if (/product-strategy|product-pricing/.test(k)) delete require.cache[k];
  });
  global.PSB_CONTRACT = require(path.join(JS, 'product-strategy', 'psb-data-contract.js')).PSB_CONTRACT;
  require(path.join(JS, 'product-strategy', 'psb-selectors.js'));
  require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
  var UNI = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
  var ACC = require(path.join(JS, 'api', 'km-product-pricing-workspace.js'));
  ACC.setCapability({ product_strategy_enabled: true });
  global.KM = global.KM || {};
  global.KM.api = { transport: {
    post: function () { return Promise.resolve({ __b: env }); },
    safeReadJsonResponse: function (r) { return r.__b; } } };
  return ACC.getSiteUniverse({}).then(function (out) {
    return { out: out, universe: UNI.adapt(out) };
  });
}

// ===================================================================================================
console.log('\n=== §A  WHAT THE DEPLOYED R10 ENDPOINT SAID, ON THE WIRE ===');
// ===================================================================================================
(function () {
  var h = R10_CAPTURE.health;
  eq(h.build_id, R10, 'A1 build_id is R10');
  eq(h.deployment_release, R10, 'A2 and so is the deployment release');
  eq(h.deployed_action_contract_version, 14,
    'A3 the action contract stays 14 — this fix added no action, so no browser is told its deployment aged');
  eq(h.required_action_list_version, 12, 'A4 required action list version 12, unchanged');
  eq(h.required_action_count, 44, 'A5 forty-four actions, unchanged');
  eq(h.missing_actions, [], 'A6 missing_actions is empty');
  eq(h.router_ready, true, 'A7 router_ready');
  eq(h.entrypoints, { doGet: true, doPost: true }, 'A8 both entrypoints answer');
  eq(h.mixed_deployment, false, 'A9 mixed_deployment false — no half-copied project');
  eq(h.environment_mode, 'production', 'A10 and it is the production deployment, not a dev URL');

  /* THE WRITE COUNTERS ARE THE POINT OF A VERIFICATION ROUND. A health call that mutated anything
     would make every other number in this file untrustworthy. */
  eq(h.read_only, true, 'A11 read_only');
  ['db_writes', 'drive_writes', 'status_transitions', 'emails', 'demo_mutations'].forEach(function (k, i) {
    eq(h[k], 0, 'A12.' + (i + 1) + ' ' + k + ' is zero');
  });

  eq(h.product_strategy_enabled, false, 'A13 the Product Strategy flag is still false in the deployment that answered');
  eq(h.inventory_ai_plan_db_generation_enabled, false, 'A14 and the AI Plan generation flag too');
}());

// ===================================================================================================
console.log('\n=== §B  THE THREE MANIFEST ROWS THIS ROUND IS ABOUT ===');
// ===================================================================================================
(function () {
  var rows = {};
  R10_CAPTURE.health.module_builds.forEach(function (m) { rows[m.file] = m; });

  eq(rows['63_api_v1_system_health.gs'].declared_build, R10, 'B1 63_ declares R10 in the deployment');
  eq(rows['72_api_v1_product_pricing_workspace.gs'].declared_build, R10, 'B2 72_ declares R10 — the file the fix is in');

  /* 01_router.gs IS THE INTERESTING ROW. No action was added, renamed or removed, so its stamp stayed
     at R9 through a release that moved everything around it. A manifest that agrees with that is the
     rule working; a router silently marched to R10 would be the rule being kept quiet. */
  eq(rows['01_router.gs'].declared_build, R9, 'B3 01_router.gs is still R9, because the fix touched no route');
  eq(rows['01_router.gs'].expected_build, R9, 'B3a and the manifest expects exactly that');

  Object.keys(rows).forEach(function (f) {
    ok(rows[f].matches_expected === true, 'B4 ' + f.slice(0, 3) + ' declared == expected');
  });

  /* AND THE DEPLOYED STAMPS AGREE WITH THE REPOSITORY. This is what makes "the user synced the right
     files" a measured fact rather than a hope: the same two strings, read from the committed source. */
  ok(SRC.ppw.indexOf("PPW_BUILD_VERSION_ = '" + R10 + "'") >= 0,
    'B5 the committed 72_ declares the build the deployment reported');
  ok(SRC.health.indexOf("SYS_BUILD_VERSION_ = '" + R10 + "'") >= 0,
    'B6 the committed 63_ declares it too');
  ok(SRC.health.indexOf("SYS_DEPLOYMENT_RELEASE_ = '" + R10 + "'") >= 0,
    'B7 and the committed release identity is R10');
  ok(SRC.router.indexOf("RTR_BUILD_VERSION_ = '" + R9 + "'") >= 0,
    'B8 while the committed router is still R9 — repository and deployment tell the same story');
}());

// ===================================================================================================
console.log('\n=== §C  THE SITE-UNIVERSE RESPONSE, AS IT CAME OFF THE WIRE ===');
// ===================================================================================================
(function () {
  var b = R10_CAPTURE.siteUniverse;
  eq(b.meta.action, UNIVERSE_ACTION, 'C1 meta.action names the action that actually answered');
  eq(b.data.schema.action, UNIVERSE_ACTION, 'C2 and data.schema.action agrees with it');
  eq(b.meta.build, R10, 'C3 served by R10');
  eq(b.meta.refused, true, 'C4 refused');
  eq(b.meta.refusalCode, 'FEATURE_DISABLED', 'C5 with FEATURE_DISABLED');
  eq(b.data.refusals[0].code, 'FEATURE_DISABLED', 'C5a and the refusal is in the data too, not only the meta');

  /* THE GATE RAN BEFORE THE DOOR. A refusal measured after the spreadsheet was opened would be a
     different and much weaker fact. */
  eq(b.meta.dbOpened, false, 'C6 dbOpened false — the flag was checked before the spreadsheet was opened');
  eq(b.meta.tablesRead, 0, 'C7 tablesRead zero');
  eq(b.meta.read_only, true, 'C8 read_only');
  eq(b.meta.db_writes, 0, 'C9 db_writes zero');
  eq(b.errors, [], 'C10 no errors: a refusal is an answer, not a fault');
  eq(b.data.sites, [], 'C11 and no site rows were published while refused');

  /* THE ROUTE EXISTS. An undeployed action would have come back UNKNOWN_ACTION or a handler fault, and
     a structured refusal is the one answer neither of those can produce. */
  ok(JSON.stringify(b).indexOf('UNKNOWN_ACTION') < 0, 'C12 not UNKNOWN_ACTION — the action is routed');
  ok(JSON.stringify(b).indexOf('is not a function') < 0, 'C13 and no undefined-handler fault');
}());

// ===================================================================================================
console.log('\n=== §D  THE CAPTURE IS DE-IDENTIFIED ===');
// ===================================================================================================
(function () {
  var blob = JSON.stringify({ h: R10_CAPTURE.health, u: R10_CAPTURE.siteUniverse });
  [['script.google.com', 'the endpoint host'], ['AKfycb', 'a deployment id'],
   ['macros/s/', 'the Web App path'], ['googleusercontent', 'the echo target'],
   ['requestId', 'the per-request id'], ['server_timestamp', 'the server clock']
  ].forEach(function (p, i) {
    ok(blob.indexOf(p[0]) < 0, 'D' + (i + 1) + ' the bodies carry no ' + p[1]);
  });
  eq(R10_CAPTURE.provenance.is_immutable_evidence, true,
    'D7 and the file declares itself immutable evidence, so a later round cannot quietly agree with it');
}());

// ===================================================================================================
console.log('\n=== §E  BOTH WIRE BODIES, THROUGH THE SAME UNMODIFIED ACCESSOR ===');
// ===================================================================================================
var J = clientChain(R10_CAPTURE.siteUniverse).then(function (r) {
  /* THE WHOLE ROUND IS THIS ASSERTION. The refusal arrives at the client AS A REFUSAL. */
  eq(r.out.meta.refused, true, 'E1 the accessor accepts the R10 body and reports it refused');
  eq(r.out.meta.refusalCode, 'FEATURE_DISABLED', 'E2 as FEATURE_DISABLED');
  ok(r.out.meta.refusalCode !== 'SOURCE_NOT_CONNECTED', 'E3 and NOT as SOURCE_NOT_CONNECTED');
  ok(JSON.stringify(r.out).indexOf('RESPONSE_ACTION_MISMATCH') < 0,
    'E4 with no RESPONSE_ACTION_MISMATCH anywhere in the result');
  eq(r.out.data.refusals[0].detail,
    'PRODUCT_STRATEGY_ENABLED_ is false in the deployment that answered',
    'E5 carrying the server\'s own sentence, not a transport guess about what went wrong');
  eq(r.universe.state, 'FEATURE_DISABLED',
    'E6 and the site-universe module says the feature is off, which is a state the board can render');

}).then(function () {
  return clientChain(R9_CAPTURE.siteUniverse).then(function (r) {
    /* THE CONTRAST IS THE PROOF. Same accessor, same call, older body. */
    eq(r.out.meta.refusalCode, 'SOURCE_NOT_CONNECTED',
      'E7 the SAME accessor still rejects the R9 body');
    eq(r.out.data.refusals[0].detail, 'RESPONSE_ACTION_MISMATCH',
      'E8 still naming the action mismatch');
    eq(r.universe.state, 'SOURCE_NOT_CONNECTED',
      'E9 so the difference between E1-E6 and E7-E9 is the deployment, not the test');
  });

}).then(function () {
  // =================================================================================================
  console.log('\n=== §F  THE SITE UNIVERSE DID NOT DRIFT — BY RECONSTRUCTION, NOT BY EYE ===');
  // =================================================================================================
  var text = JSON.stringify(READBACK.report, null, 2);
  eq(text.length, READBACK.r10.length, 'F1 the frozen report is the length the R10 log reported');
  eq(READBACK.hash(text), READBACK.r10.fingerprint, 'F2 and fingerprints to what the R10 log reported');

  /* ROLL BACK THE ONLY TWO FIELDS A REDEPLOY LEGITIMATELY CHANGES and the P1-B6 fingerprint has to
     reappear. If a single row count, header, exclusion or hierarchy entry had moved, it would not. */
  var rolled = JSON.parse(text);
  rolled.endpoint_build = READBACK.r9.build;
  rolled.universe.read_at = READBACK.r9.read_at;
  var t2 = JSON.stringify(rolled, null, 2);
  eq(t2.length, READBACK.r9.length, 'F3 rolled back, it is P1-B6\'s length exactly');
  eq(READBACK.hash(t2), READBACK.r9.fingerprint,
    'F4 and P1-B6\'s fingerprint exactly — not one byte of the universe moved across the envelope fix');
  eq(READBACK.r10.length - READBACK.r9.length, 1, 'F5 the entire difference is one character: "R9" became "R10"');

  var u = READBACK.report.universe;
  eq(READBACK.report.verdict, 'P1_B6_SITE_UNIVERSE_READY', 'F6 verdict unchanged');
  eq(READBACK.report.read_only, true, 'F7 read_only');
  ['writes', 'writer_calls', 'sheets_created', 'rows_modified'].forEach(function (k, i) {
    eq(READBACK.report[k], 0, 'F8.' + (i + 1) + ' ' + k + ' zero');
  });
  eq(READBACK.report.gate_proof.feature_flag, false, 'F9 the flag was false when it ran');
  eq(READBACK.report.gate_proof.flag_was_modified_by_this_readback, false,
    'F9a and the readback did not write it to get a better answer');
  eq(READBACK.report.gate_proof.db_opened, false, 'F10 db_opened false');
  eq(READBACK.report.gate_proof.tables_read, 0, 'F10a tables_read zero');
  eq(u.site_count, 10, 'F11 ten sites');
  eq(u.table_fingerprint.rows, 495, 'F12 four hundred and ninety-five membership rows');
  eq(u.table_fingerprint.fingerprint, '2AF82658', 'F13 same source table fingerprint as P1-B6');
  eq(u.sites.reduce(function (a, s) { return a + s.membership_row_count; }, 0), 495,
    'F14 and the per-site counts still add up to the table');

  /* THE EVIDENCE GAP IS STILL AN EVIDENCE GAP. A round that proved something else must not quietly
     retire it. */
  eq(READBACK.report.evidence_gaps, ['SOURCE_MODIFIED_AT_NOT_MEASURABLE_IN_THIS_DEPLOYMENT_SCOPE'],
    'F15 source_modified_at remains unmeasurable, and is still recorded as such');

}).then(function () {
  // =================================================================================================
  console.log('\n=== §G  THERE IS NO SERVER-SIDE IDENTITY BOUNDARY  (P1-B8 GO/NO-GO) ===');
  // =================================================================================================
  /* EVERY ASSERTION IN THIS SECTION IS A DESCRIPTION OF TODAY, NOT A REQUIREMENT FOREVER. A red line
     here means production changed and the activation decision has to be made again. */
  var man = JSON.parse(SRC.manifest);

  eq(man.webapp.access, 'ANYONE_ANONYMOUS',
    'G1 the Web App is published to anyone, anonymously — RE-RUN THE GO/NO-GO IF THIS CHANGES');
  eq(man.webapp.executeAs, 'USER_DEPLOYING',
    'G2 and runs as the deploying owner, so every caller has the owner\'s sheet authority');
  /* Those two together settle it before any code is read: Apps Script cannot name an anonymous caller,
     so Session.getActiveUser() would return an empty string even if something asked. */

  var runtime = fs.readdirSync(GSDIR).filter(function (f) {
    return /\.gs$/.test(f) && f.indexOf('TEMP_') !== 0;
  });
  var asksWhoIsCalling = runtime.filter(function (f) {
    return /Session\.get(Active|Effective)User/.test(read(path.join(GSDIR, f)));
  });
  eq(asksWhoIsCalling, [],
    'G3 not one runtime file asks Apps Script who is calling — RE-RUN THE GO/NO-GO IF THIS CHANGES');
  ok(runtime.length > 20, 'G3a (and that was checked across every runtime file, ' + runtime.length + ' of them)');

  /* NO GATE IN FRONT OF THE ROUTER EITHER. Not a shared secret, not a bearer token, not a caller
     allowlist. The scope allowlists this repository does have are about WHICH DATA a write may touch,
     which is a different control and not a substitute for one. */
  ok(!/\b(bearer|apiKey|api_key|sharedSecret|authToken)\b/i.test(SRC.router),
    'G4 the router has no token or shared-secret check in front of a handler');
  ok(!/Session\.get/.test(SRC.router), 'G5 and no session check either');

  /* THE REPOSITORY ALREADY SAYS SO, IN THE FILE THAT OWNS THE FLAG. Worth pinning: the position this
     round reports is not a new discovery, it is the recorded one, and P0 §13.1 measured it. */
  ok(/no RBAC, no server-side identity/.test(SRC.config),
    'G6 00_config.gs records the same position, in the file that owns the flag');
  ok(/created_by` client-asserted/.test(SRC.config),
    'G7 including that created_by is asserted by the client and proves nothing about who called');

  /* AND THE THINGS THAT MUST NOT BE MISTAKEN FOR AUTHORIZATION. */
  eq(R10_CAPTURE.health.caller_probe === undefined ? null : R10_CAPTURE.health.caller_probe, null,
    'G8 caller_probe is a deployment probe, not a caller identity — it names no user even when populated');
  ok(/staged/.test(SRC.app) && /enabled: false/.test(SRC.app),
    'G9 the navigation is hidden by a staged-section registry, which is a UI decision and not a boundary');

  /* THE FLAG IS THE ONLY CONTROL THAT EXISTS, AND IT IS GLOBAL. It answers "is this feature on",
     never "may THIS caller use it" — which is precisely the question P1-B8 has to answer. */
  ok(/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(SRC.config),
    'G10 PRODUCT_STRATEGY_ENABLED_ is still false — the one control, and it is one global boolean');
  ok(/THIS FLAG IS THE ACCESS CONTROL/.test(SRC.config),
    'G11 and the file says outright that the flag IS the access control today');

  /* THE REFUSAL IS STILL WHERE IT HAS TO BE: before the spreadsheet, in the handler, not in the page. */
  ok(/flagEnabled\(\) !== true/.test(SRC.ppw),
    'G12 72_ still gates on the server flag before opening anything');
  /* THE CLIENT HAS A FEATURE_DISABLED OF ITS OWN — the capability mirror refuses before sending, so a
     disabled feature costs zero requests. It carries a DIFFERENT sentence on purpose, which is the only
     reason E5 can tell a served refusal apart from one this side invented. Two refusals that read alike
     would make every FEATURE_DISABLED in the evidence ambiguous. */
  ok(/the client capability mirror is false; no request was sent/.test(SRC.accessor),
    "G12a the client pre-flight refusal names itself, so it can never be mistaken for the server one");
  ok(SRC.accessor.indexOf('PRODUCT_STRATEGY_ENABLED_ is false in the deployment that answered') < 0,
    "G12b and that server sentence exists nowhere in the client — E5 could only have come off the wire");

}).then(function () {
  // =================================================================================================
  console.log('\n=== §H  NOTHING WAS ACTIVATED BY THIS ROUND ===');
  // =================================================================================================
  ok(/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(SRC.config), 'H1 Product Strategy flag false in source');
  ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(SRC.config), 'H2 AI Plan flag false in source');
  eq(R10_CAPTURE.health.product_strategy_enabled, false, 'H3 and false in the deployment that answered');
  ok(/'product-strategy':\s*\{[\s\S]{0,200}?enabled: false/.test(SRC.app),
    'H4 the staged section is still disabled, so the menu entry cannot be reached');

  /* NO NEW WAY IN. A query parameter, header or debug token that bypassed the flag would be a hole
     opened by a verification round, which is the worst possible place to open one. */
  ok(!/km_force|debug_token|bypass|__enable/i.test(SRC.router + SRC.ppw + SRC.config),
    'H5 no bypass parameter, token or debug switch was added anywhere in the gate path');

  /* AND THIS ROUND CHANGED NO APPS SCRIPT AT ALL, which is why it needs no sync and no new version. */
  ok(SRC.ppw.indexOf("PPW_BUILD_VERSION_ = '" + R10 + "'") >= 0 &&
     SRC.health.indexOf("SYS_DEPLOYMENT_RELEASE_ = '" + R10 + "'") >= 0,
    'H6 the server stamps are still R10 — no new release identity was minted for a documentation round');

}).then(function () {
  // =================================================================================================
  console.log('\n=== §I  MUTANTS ===');
  // =================================================================================================
  function mut(label, file, from, to, probe) {
    var full = path.join(ROOT, file);
    var original = fs.readFileSync(full, 'utf8');
    var norm = original.replace(/\r\n/g, '\n');
    var n = norm.split(from).length - 1;
    if (n !== 1) { mutSurvived++; console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label); return; }
    fs.writeFileSync(full, norm.replace(from, to), 'utf8');
    var caught = false, why = '';
    try { caught = probe(read(full)) === true; } catch (e) { caught = true; why = String(e && e.message); }
    fs.writeFileSync(full, original, 'utf8');
    if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
    else { mutSurvived++; console.log('  MUTANT SURVIVED ' + label + ' ' + why); }
  }

  /* I1 — the one that proves §G reads the file rather than remembering a conclusion. */
  mut('I1 the Web App is republished with a restricted audience and §G does not notice',
    'assets/specs/active/apps-script/appsscript.json',
    '"access": "ANYONE_ANONYMOUS"', '"access": "DOMAIN"',
    function (src) { return JSON.parse(src).webapp.access !== 'ANYONE_ANONYMOUS'; });

  mut('I2 an identity check appears in the router and the NO-GO is not revisited',
    'assets/specs/active/apps-script/01_router.gs',
    'function doGet(e) {', 'function doGet(e) {\n  var who = Session.getActiveUser().getEmail();',
    function (src) { return /Session\.get/.test(src); });

  mut('I3 the Product Strategy flag is flipped on without an authorization round',
    'assets/specs/active/apps-script/00_config.gs',
    'var PRODUCT_STRATEGY_ENABLED_ = false;', 'var PRODUCT_STRATEGY_ENABLED_ = true;',
    function (src) { return !/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(src); });

  mut('I4 the staged navigation is quietly enabled',
    'assets/js/app.js', 'enabled: false,', 'enabled: true,',
    function (src) { return !/'product-strategy':\s*\{[\s\S]{0,200}?enabled: false/.test(src); });

  mut('I5 01_router.gs is marched to R10 although no route changed',
    'assets/specs/active/apps-script/01_router.gs',
    "RTR_BUILD_VERSION_ = '" + R9 + "'", "RTR_BUILD_VERSION_ = '" + R10 + "'",
    function (src) { return src.indexOf("RTR_BUILD_VERSION_ = '" + R9 + "'") < 0; });

  mut('I6 the client validator is relaxed, which would make §E pass for the wrong reason',
    'assets/js/api/km-product-pricing-workspace.js',
    '    if (!isObj(env.meta) || env.meta.action !== SITE_UNIVERSE_ACTION) {', '    if (false) {',
    function () {
      return !/env\.meta\.action !== SITE_UNIVERSE_ACTION/
        .test(read(path.join(JS, 'api', 'km-product-pricing-workspace.js')));
    });

  /* I7 — the frozen R9 capture is edited to agree with the fix. The pair is the evidence; a capture
     that has been brought up to date proves nothing, so tampering has to be visible. */
  mut('I7 the immutable R9 capture is edited to agree with the current code',
    'assets/tests/_p1b7d-exec-capture.js',
    '"action": "productPricing.workspace.get"', '"action": "productPricing.siteUniverse.get"',
    function (src) { return (src.match(/"action": "productPricing\.workspace\.get"/g) || []).length === 0; });

}).then(function () {
  console.log('\n' + new Array(101).join('='));
  console.log('passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log(new Array(101).join('='));
  if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
});
