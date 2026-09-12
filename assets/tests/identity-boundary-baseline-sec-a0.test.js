/**
 * ==================================================================================================
 * THE IDENTITY BOUNDARY THAT ISN'T THERE  —  SEC-A0 baseline
 * ==================================================================================================
 *
 * P1-B7F asked whether Product Strategy could be activated and found no server-side caller identity.
 * SEC-A0 asked how far that reaches and the answer is: THE WHOLE SYSTEM. One Web App URL, published
 * ANYONE_ANONYMOUS, routes 138 actions, of which 76 are unambiguous mutations — every purchase order,
 * shipment, allocation draft, import and trigger schedule in the business. Product Strategy is not the
 * thing that needs a lock; it is the first feature that happened to ask whether there was one.
 *
 * THIS SUITE CHANGES NOTHING AND DEFENDS THE DESCRIPTION. It pins the CURRENT posture, one named fact
 * at a time, so the day production stops matching it is the day this goes red — which is the signal to
 * re-run the decision, not a number to bump. Every assertion here is a statement about today; none is
 * a requirement forever. The messages say so individually, because whoever hits the red line will read
 * the message and not this header.
 *
 * WHY THE SURFACE IS COUNTED RATHER THAN DESCRIBED. "Some write actions are exposed" invites a fix that
 * covers the ones somebody remembered. 76 is a number a migration plan can be checked against, and
 * §B recomputes it from the router rather than trusting the figure written here.
 *
 * §E IS THE ONE THAT EXECUTES SOMETHING. The AI Plan scope allowlist is the only fail-closed,
 * server-owned, no-wildcard gate this codebase already has, and SEC-A2's operator allowlist is meant to
 * inherit its shape. So its behaviour is pinned HERE, by running it — empty means nobody, a wildcard is
 * never a match, an incomplete key is never a match — BEFORE it is copied. A pattern that is copied
 * after it has quietly rotted is worse than no pattern at all.
 *
 * WHAT THIS SUITE DELIBERATELY DOES NOT DO: it does not assert that an identity boundary SHOULD exist,
 * it does not encode a preferred architecture, and it does not touch a single runtime file. SEC-A0 is
 * discovery and a design freeze. The code changes start at SEC-A1, after the user has made two
 * decisions that are not an agent's to make.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var JS = path.join(ROOT, 'assets', 'js');
var GSDIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

var SRC = {
  config: read(path.join(GSDIR, '00_config.gs')),
  router: read(path.join(GSDIR, '01_router.gs')),
  manifestRaw: read(path.join(GSDIR, 'appsscript.json')),
  transport: read(path.join(JS, 'api', 'km-transport.js')),
  app: read(path.join(JS, 'app.js'))
};
var MANIFEST = JSON.parse(SRC.manifestRaw);

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, label, A === B ? undefined : { got: a, want: b });
}

/** Every runtime .gs — TEMP_ diagnostics are not runtime and are excluded on purpose. */
function runtimeFiles() {
  return fs.readdirSync(GSDIR).filter(function (f) { return /\.gs$/.test(f) && f.indexOf('TEMP_') !== 0; });
}

/** The router's own dispatch surface, recomputed from source. */
function surface() {
  var r = SRC.router;
  var readBlock = r.slice(r.indexOf('function rtrGetReadHandlers_'));
  readBlock = readBlock.slice(0, readBlock.indexOf('\n}'));
  var readTable = (readBlock.match(/'[A-Za-z][A-Za-z0-9_.]*':/g) || []).map(function (s) { return s.slice(1, -2); });
  var postBlock = r.slice(r.indexOf('function doPost'));
  var post = [];
  (postBlock.match(/action === '[^']+'/g) || []).forEach(function (s) {
    var a = s.slice(12, -1); if (post.indexOf(a) < 0) post.push(a);
  });
  var getBlock = r.slice(r.indexOf('function doGet(e)'), r.indexOf('function doPost'));
  var getOnly = [];
  (getBlock.match(/action === '[^']+'/g) || []).forEach(function (s) {
    var a = s.slice(12, -1); if (getOnly.indexOf(a) < 0) getOnly.push(a);
  });
  var MUT = /^(upsert|update|create|delete|import|submit|cancel|confirm|adjust|backfill|seed|retire|generate|receive|sync|append|complete|finalize|audit|run|weeklyAiPlan)|\.(save|update|advance|generate|retry|commit|job\.(start|cancel|continue))$|Batch$|Locked$/;
  var all = {};
  readTable.concat(post, getOnly).forEach(function (a) { all[a] = true; });
  return {
    readTable: readTable, post: post, getOnly: getOnly,
    all: Object.keys(all),
    mutations: post.filter(function (a) { return MUT.test(a); })
  };
}

// ===================================================================================================
console.log('\n=== §A  THE POSTURE, AS PUBLISHED  (each line: if it changes, re-run the decision) ===');
// ===================================================================================================
(function () {
  eq(MANIFEST.webapp.access, 'ANYONE_ANONYMOUS',
    'A1 the Web App is published to anyone, anonymously — RE-RUN THE SEC DECISION IF THIS CHANGES');
  eq(MANIFEST.webapp.executeAs, 'USER_DEPLOYING',
    'A2 and executes as the deploying owner — the sheet authority every caller borrows');

  /* THE TWO KNOBS ARE INDEPENDENT, and the design turns on that. `access` decides whether Google
     authenticates the caller; `executeAs` decides whose authority the code runs with. Only the first
     may move: §A3-A5 are why the second must not. */
  var files = runtimeFiles();
  var bound = files.filter(function (f) { return /SpreadsheetApp\.getActiveSpreadsheet\(\)/.test(read(path.join(GSDIR, f))); });
  ok(bound.length > 0,
    'A3 the script is CONTAINER-BOUND (' + bound.length + ' files call getActiveSpreadsheet) — under '
    + 'executeAs USER_ACCESSING every user would need edit rights on the container itself');
  ok(MANIFEST.oauthScopes.indexOf('https://www.googleapis.com/auth/bigquery') >= 0,
    'A4 and it holds a BigQuery scope, which under executeAs USER_ACCESSING every user would need too');
  var drive = files.filter(function (f) { return /DriveApp\./.test(read(path.join(GSDIR, f))); });
  ok(drive.length > 0,
    'A5 and ' + drive.length + ' files write Drive files, likewise — so executeAs stays USER_DEPLOYING');

  /* NOTHING ASKS WHO IS CALLING. */
  var asks = files.filter(function (f) {
    return /Session\.get(Active|Effective)User/.test(read(path.join(GSDIR, f)));
  });
  eq(asks, [], 'A6 not one runtime file asks Apps Script who is calling');
  ok(files.length > 20, 'A6a (checked across every runtime file, ' + files.length + ' of them)');
  ok(!/Session\.get/.test(SRC.router), 'A7 the router has no session lookup');
  ok(!/\b(bearer|apiKey|api_key|sharedSecret|authToken|x-api-key)\b/i.test(SRC.router),
    'A8 and no token, shared secret or API key check in front of any handler');

  /* AND IT COULD NOT VERIFY A TOKEN TODAY EVEN IF ONE ARRIVED. Verifying a Google ID token needs an
     outbound request, and this project holds no external_request scope. That is a fact about the
     migration cost, not a defect: SEC-A2 adding this scope means re-authorisation by the deployer. */
  ok(MANIFEST.oauthScopes.indexOf('https://www.googleapis.com/auth/script.external_request') < 0,
    'A9 no external_request scope — the server cannot currently verify an assertion from anyone');
  eq(MANIFEST.oauthScopes.length, 3, 'A9a exactly three scopes, so A9 is about the whole list');
}());

// ===================================================================================================
console.log('\n=== §B  THE SURFACE THAT SITS BEHIND IT, COUNTED FROM THE ROUTER ===');
// ===================================================================================================
(function () {
  var s = surface();
  /* These exact numbers are the SEC-A0 inventory. A diff here is not a number to bump: it means the
     anonymous surface moved and the inventory in the design freeze has to move with it. */
  eq(s.all.length, 138, 'B1 138 actions are routed — the whole anonymous surface');
  eq(s.readTable.length, 23, 'B2 23 of them on the GET read table');
  eq(s.post.length, 136, 'B3 136 dispatched by doPost');
  eq(s.mutations.length, 76, 'B4 and 76 are unambiguous MUTATIONS, every one reachable without identity');

  /* THE NAMED ONES, because a list of 76 is easy to discount and these are not. */
  ['createPurchaseOrderFromRequest', 'confirmShipmentAndDispatch', 'submitAllocationDraftsToShippingPlans',
   'importMarketplaceSkusBatch', 'automationSchedule.update', 'updateSkuLifecycle'
  ].forEach(function (a, i) {
    ok(s.mutations.indexOf(a) >= 0, 'B5.' + (i + 1) + ' ' + a + ' is one of them');
  });

  /* THE DISPATCH IS THE FIRST THING THAT HAPPENS. There is no gate above it to remove, which is why
     SEC-A2 is an insertion and not a repair. */
  var doPost = SRC.router.slice(SRC.router.indexOf('function doPost'));
  var firstDispatch = doPost.indexOf("action === '");
  var preamble = doPost.slice(0, firstDispatch);
  ok(!/Session\.|token|allowlist|authoriz/i.test(preamble),
    'B6 nothing between doPost entry and the first dispatch performs any identity or permission check');

  /* AND THE ONE CONTROL THAT DOES EXIST IS NOT ABOUT CALLERS — WHICH IS NOW THE WHOLE POINT.
     P1-B8D set PRODUCT_STRATEGY_ENABLED_ to true. While it was false it was doing duty as a lock, and
     B8 below says so in as many words. Switching it on does not weaken a lock; it retires a stand-in,
     and what is left protecting the two Product Strategy reads is exactly what protects every other
     action in this router: nothing about the caller. That is the baseline this file measures, it got
     one feature worse today, and it is recorded rather than softened — Login/RBAC is P2-A, and this
     is one of the facts that argues for it.

     The assertion stays about SHAPE, because shape is what a file can check: one global boolean,
     answering "is this feature on" and never "may THIS caller use it". */
  ok(/var PRODUCT_STRATEGY_ENABLED_ = (?:true|false);/.test(SRC.config),
    'B7 PRODUCT_STRATEGY_ENABLED_ is one global boolean — a feature switch, never a caller check');
  var near = SRC.config.indexOf('var PRODUCT_STRATEGY_ENABLED_ = ');
  ok(!/Session\.|getActiveUser|getEffectiveUser/i.test(SRC.config.slice(near, near + 400)),
    'B7a and nothing near it consults an identity, because there is none to consult');
  ok(/THIS FLAG IS THE ACCESS CONTROL/.test(SRC.config),
    'B8 the file says outright that the flag IS the access control today — a feature switch standing in for a lock');
}());

// ===================================================================================================
console.log('\n=== §C  THE AUDIT IDENTITY IS CLIENT-ASSERTED, WHICH IS A SEPARATE HOLE ===');
// ===================================================================================================
(function () {
  var files = runtimeFiles();
  var derives = files.filter(function (f) {
    return /(body\s*&&\s*)?\(?body\.(actor|created_by|updated_by|cancelled_by)/.test(read(path.join(GSDIR, f)));
  });
  ok(derives.length >= 15,
    'C1 ' + derives.length + ' runtime files take the actor from the REQUEST BODY, defaulting to a constant');
  ok(/String\(\(body && \(body\.created_by \|\| body\.actor\)\) \|\| 'system_user'\)/.test(
      read(path.join(GSDIR, '12_shipment_handlers.gs'))),
    'C2 e.g. a shipment records created_by = whatever the caller sent, or the literal "system_user"');
  ok(/created_by` client-asserted/.test(SRC.config),
    'C3 and 00_config.gs has recorded that since P0 §13.1');

  /* THE ONE THING THAT WOULD MAKE IT DANGEROUS RATHER THAN MERELY USELESS: a permission decision keyed
     on a value the caller chose. There is none, and there must never be one — this assertion is the
     tripwire. AuthZ that reads its subject from the request body is a login form with no password. */
  var decisions = [];
  files.forEach(function (f) {
    var s = read(path.join(GSDIR, f));
    if (/\bif\s*\([^)]*\b(actor|createdBy|created_by|updated_by)\b\s*===\s*['"]/.test(s)) decisions.push(f);
  });
  eq(decisions, [],
    'C4 no handler makes a permission decision from a body-derived actor — IT MUST STAY THIS WAY');

  /* So the DB audit columns answer "what did the payload say", not "who did this". Naming it keeps it
     from being mistaken for an audit trail when SEC-A2 asks what already exists. */
  ok(true, 'C5 (therefore created_by/updated_by are provenance of a claim, never of a person)');
}());

// ===================================================================================================
console.log('\n=== §D  THE TRANSPORT ALREADY HAS A NAME FOR WHAT A RESTRICTED AUDIENCE WOULD DO ===');
// ===================================================================================================
(function () {
  /* THE SINGLE MOST IMPORTANT COMPATIBILITY FACT IN SEC-A0, and it was already in the codebase.
     The frontend is a separate origin (GitHub Pages) calling script.google.com with fetch. The init
     carries NO `credentials`, so the Fetch default `same-origin` applies and NO Google cookie is sent.
     That works today only because the deployment demands none. Restrict the audience and the same
     request becomes unauthenticated — Google answers with a sign-in page, and the transport already
     classifies exactly that. */
  ok(!/credentials\s*:/.test(SRC.transport),
    'D1 the transport sends no `credentials` — cross-origin, so no Google session cookie is attached');
  ok(/method: 'GET', cache: 'no-store'/.test(SRC.transport),
    'D2 the read init is method+cache only, which is where a credentials option would have to go');
  ok(/AUTH_OR_ACCESS_HTML/.test(SRC.transport),
    'D3 and the transport already has a typed code for a Google auth/access page');
  ok(/GOOGLE_AUTH_OR_ACCESS/.test(SRC.transport),
    'D4 fed by a detector that looks for accounts.google.com and unauthorized markers');
  ok(/the fix is "sign in \/ change\n\s*\/\/ the deployment's access policy", which no retry can perform/.test(SRC.transport)
     || /which no retry can perform/.test(SRC.transport),
    'D5 classified NEVER-RETRY, because the fix is a human changing the access policy');

  /* So flipping access without changing the frontend would turn all 138 actions into that one code,
     on every page, at once. This assertion is why Option A is not a one-line change. */
  ok(/NEVER_AUTO_RETRY_CODES/.test(SRC.transport) &&
     SRC.transport.indexOf('CODES.AUTH_OR_ACCESS_HTML') >= 0,
    'D6 and it is in the never-retry set, so every page would surface it as a hard error');
}());

// ===================================================================================================
console.log('\n=== §E  THE FAIL-CLOSED SHAPE SEC-A2 MUST INHERIT, PINNED BY EXECUTION ===');
// ===================================================================================================
(function () {
  function cfg(src) {
    var sb = { console: { log: function () {} }, JSON: JSON, Math: Math, Date: Date, Object: Object,
      Array: Array, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(src === undefined ? SRC.config : src, sb, { filename: '00_config.gs' });
    return sb;
  }
  var c = cfg();
  var E = c.inventoryAiPlanScopeEnabled_;

  ok(E('ResUS', 'US', 'Amazon', 'SP0750-M') === true, 'E1 an exact four-part scope matches');
  ok(E('ResUS', 'US', 'Amazon', 'NOPE') === false, 'E2 a near miss does not');
  ok(E('ResUS', 'US', 'ALL_SITES', 'SP0750-M') === false, 'E3 ALL_SITES can never match — no wildcard exists');
  ok(E('ResUS', 'US', 'Amazon', 'ALL') === false, 'E3a nor ALL in the sku position');
  ok(E('ResUS', '', 'Amazon', 'SP0750-M') === false, 'E4 an INCOMPLETE key is never enabled');
  ok(E(null, null, null, null) === false, 'E4a and neither is an absent one');
  ok(E('resus', 'US', 'Amazon', 'SP0750-M') === false, 'E5 the match is case-sensitive, so near-identity is not identity');

  /* EMPTY MEANS NOBODY. This is the property an operator allowlist lives or dies by, and it is proved
     by emptying the real list and re-running the real function rather than by reading it. */
  var emptied = cfg(SRC.config.replace(
    "var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = [\n  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP0750-M' }\n];",
    'var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = [];'));
  ok(emptied.INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_.length === 0, 'E6 (the list really was emptied)');
  ok(emptied.inventoryAiPlanScopeEnabled_('ResUS', 'US', 'Amazon', 'SP0750-M') === false,
    'E7 an EMPTY allowlist enables nothing — fail-closed, which is the only safe default for a narrow list');

  /* And it is reportable without leaking anything, which an operator registry will also have to be. */
  var rep = c.inventoryAiPlanActivationAllowlist_();
  ok(Array.isArray(rep) && rep.length === 1, 'E8 the list is reportable for diagnostics');
  ok(JSON.stringify(rep).indexOf('spreadsheet') < 0 && JSON.stringify(rep).indexOf('http') < 0,
    'E8a carrying business identifiers only — no id, url or key');
}());

// ===================================================================================================
console.log('\n=== §F  WHAT IS ACTIVATED, WHAT IS NOT, AND THE NO-GO THAT CANNOT BE DELETED QUIETLY ===');
// ===================================================================================================
(function () {
  /* THE HEADING CHANGED BECAUSE THE ANSWER DID. P1-B8D activated Product Strategy: server flag true,
     staged navigation true. This section used to assert that nothing anywhere was on - a true
     sentence about a moment rather than a rule, and one that would have had to be deleted the first
     time anything shipped. What it is FOR is that activation is a deliberate, reviewable act with
     nothing else riding on it. So what is asserted now is the BOUNDARY of what was switched on:
     Product Strategy is two reads, the AI Plan WRITE flag did not travel with it, and the two gates
     agree. One feature was activated, not a posture. */
  ok(/var PRODUCT_STRATEGY_ENABLED_ = true;/.test(SRC.config),
    'F1 Product Strategy is ACTIVATED — deliberately, and it is the only thing switched on');
  ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(SRC.config),
    'F2 the AI Plan DB GENERATION flag did NOT move with it — a write flag is not carried by a read activation');
  ok(/'product-strategy':\s*\{[\s\S]{0,400}?enabled: true/.test(SRC.app),
    'F3 staged navigation is activated to match — two gates that agree is the only safe pair');
  ok(!/km_force|debug_token|bypass|__enable/i.test(SRC.router + SRC.config),
    'F4 no bypass parameter, token or debug switch exists in the gate path');

  /* THE P1-B7F NO-GO IS A FILE, AND A FILE CAN BE DELETED. §6 asks that a future identity boundary
     force a RE-DECISION rather than a silent removal, so the assertions that describe the absence are
     themselves required to exist. Deleting them now fails here; satisfying them later fails there. */
  var b7f = path.join(__dirname, 'deployment-r10-activation-boundary-p1-b7f.test.js');
  ok(fs.existsSync(b7f), 'F5 the P1-B7F NO-GO suite still exists');
  var s = read(b7f);
  /* THE INSTRUCTION IS ATTACHED TO BOTH LOAD-BEARING ASSERTIONS, and counting matters: removing it from
     one and leaving it on the other would pass a mere presence check while un-marking half the decision. */
  eq((s.match(/RE-RUN THE GO\/NO-GO IF THIS CHANGES/g) || []).length, 2,
    'F6 both re-decision instructions are still attached, so a green day cannot quietly become a deletion');
  ok(s.indexOf('ANYONE_ANONYMOUS') >= 0 && s.indexOf('getActiveUser') >= 0,
    'F7 still asserting the two facts the whole NO-GO rests on');
}());

// ===================================================================================================
console.log('\n=== §G  MUTANTS ===');
// ===================================================================================================
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
var MAN = 'assets/specs/active/apps-script/appsscript.json';
var CFG = 'assets/specs/active/apps-script/00_config.gs';

mut('G1 the audience is restricted and the baseline does not notice', MAN,
  '"access": "ANYONE_ANONYMOUS"', '"access": "DOMAIN"',
  function (s) { return JSON.parse(s).webapp.access !== 'ANYONE_ANONYMOUS'; });

mut('G2 executeAs is switched to the accessing user', MAN,
  '"executeAs": "USER_DEPLOYING"', '"executeAs": "USER_ACCESSING"',
  function (s) { return JSON.parse(s).webapp.executeAs !== 'USER_DEPLOYING'; });

mut('G3 an external_request scope appears (a token verifier arrived without a decision)', MAN,
  '"https://www.googleapis.com/auth/bigquery"',
  '"https://www.googleapis.com/auth/bigquery",\n    "https://www.googleapis.com/auth/script.external_request"',
  function (s) {
    var m = JSON.parse(s);
    return m.oauthScopes.length !== 3
      || m.oauthScopes.indexOf('https://www.googleapis.com/auth/script.external_request') >= 0;
  });

mut('G4 an identity lookup appears in the router', 'assets/specs/active/apps-script/01_router.gs',
  'function doGet(e) {', 'function doGet(e) {\n  var who = Session.getActiveUser().getEmail();',
  function (s) { return /Session\.get/.test(s); });

mut('G5 the allowlist gains a wildcard, so a narrow list silently becomes a wide one', CFG,
  "  if (/^all(_sites)?$/i.test(m) || /^all(_sites)?$/i.test(s)) return false;   // ALL_SITES can never be enabled",
  "  if (/^all(_sites)?$/i.test(m) || /^all(_sites)?$/i.test(s)) return true;",
  function (src) {
    var sb = { console: { log: function () {} }, JSON: JSON, Math: Math, Date: Date, Object: Object,
      Array: Array, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error };
    sb.globalThis = sb; vm.createContext(sb); vm.runInContext(src, sb, { filename: '00_config.gs' });
    return sb.inventoryAiPlanScopeEnabled_('ResUS', 'US', 'ALL_SITES', 'SP0750-M') !== false;
  });

mut('G6 an empty allowlist starts meaning "everything" instead of "nothing"', CFG,
  '  var list = INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ || [];\n  for (var i = 0; i < list.length; i++) {\n    var e = list[i] || {};\n    if (String(e.company) === c && String(e.country) === k',
  '  var list = INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ || [];\n  if (!list.length) return true;\n  for (var i = 0; i < list.length; i++) {\n    var e = list[i] || {};\n    if (String(e.company) === c && String(e.country) === k',
  function (src) {
    var emptied = src.replace(
      "var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = [\n  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP0750-M' }\n];",
      'var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = [];');
    var sb = { console: { log: function () {} }, JSON: JSON, Math: Math, Date: Date, Object: Object,
      Array: Array, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error };
    sb.globalThis = sb; vm.createContext(sb); vm.runInContext(emptied, sb, { filename: '00_config.gs' });
    return sb.inventoryAiPlanScopeEnabled_('ResUS', 'US', 'Amazon', 'SP0750-M') !== false;
  });

/* G7 — THE GUARD THIS MUTANT TARGETS IS INVISIBLE AGAINST A FULLY-POPULATED LIST, so the probe builds
   the situation it actually defends: a MIS-TYPED allowlist row with one empty field. With the guard in
   place a caller sending the same blank is refused; without it, the blank matches the blank and a typo
   in config becomes an open scope. That is the failure worth a mutant, not the one that was easy. */
mut('G7 the incomplete-key guard is dropped, so a typo in the allowlist becomes an open scope', CFG,
  '  if (!c || !k || !m || !s) return false;                 // an incomplete scope is never enabled',
  '  if (false) return false;',
  function (src) {
    var typo = src.replace(
      "{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP0750-M' }",
      "{ company: 'ResUS', country: '', marketplace: 'Amazon', sku: 'SP0750-M' }");
    var sb = { console: { log: function () {} }, JSON: JSON, Math: Math, Date: Date, Object: Object,
      Array: Array, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error };
    sb.globalThis = sb; vm.createContext(sb); vm.runInContext(typo, sb, { filename: '00_config.gs' });
    return sb.inventoryAiPlanScopeEnabled_('ResUS', '', 'Amazon', 'SP0750-M') !== false;
  });

/* G8 AND G9 BOTH TURNED AROUND AT P1-B8D, and neither could have stayed: a mutant that flips false
   to true has no anchor once the value IS true, and an anchorless mutant scores as SURVIVED -
   reporting an unguarded rule while measuring nothing. The defects worth modelling after an
   activation are the two ways it goes wrong quietly: a WRITE flag carried along by a read
   activation, and the two gates drifting out of agreement. */
mut('G8 the AI Plan write flag is carried along by the read activation', CFG,
  'var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;',
  'var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true;',
  function (s) { return !/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(s); });

mut('G9 the navigation is switched off while the server stays on — the gates disagree',
  'assets/js/app.js', 'enabled: true,', 'enabled: false,',
  function (s) { return !/'product-strategy':\s*\{[\s\S]{0,400}?enabled: true/.test(s); });

mut('G10 the P1-B7F NO-GO loses its re-decision instruction',
  'assets/tests/deployment-r10-activation-boundary-p1-b7f.test.js',
  "'G1 the Web App is published to anyone, anonymously — RE-RUN THE GO/NO-GO IF THIS CHANGES'",
  "'G1 the Web App is published to anyone, anonymously'",
  function () {
    var t = read(path.join(__dirname, 'deployment-r10-activation-boundary-p1-b7f.test.js'));
    return (t.match(/RE-RUN THE GO\/NO-GO IF THIS CHANGES/g) || []).length !== 2;
  });

mut('G11 the transport starts sending credentials, changing the compatibility analysis',
  'assets/js/api/km-transport.js',
  "          ? { method: 'GET', cache: 'no-store' }", "          ? { method: 'GET', cache: 'no-store', credentials: 'include' }",
  function (s) { return /credentials\s*:/.test(s); });

console.log('\n' + new Array(101).join('='));
console.log('passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
console.log(new Array(101).join('='));
if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
