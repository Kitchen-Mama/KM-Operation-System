/**
 * FX-AUTH-R1 — THE ONE SCOPE THE OWNER APPROVED, AND NOTHING ELSE.
 * Run: node assets/tests/fx-auth-userinfo-email-scope-fx-auth-r1.test.js
 *
 * THE MEASUREMENT. With KM_FX_RATE_BOOK_EDITORS set (allowlist_present = true), one read-only
 * fxRateBook.get still answered FX_AUTHORITY_UNVERIFIABLE, and Session.getActiveUser() THREW because the
 * manifest's explicit oauthScopes lack userinfo.email. 75_ catches the throw as '', so the refusal looked
 * exactly like "the deployment cannot see the caller" — a different cause with a different remedy.
 *
 * THE CHANGE. appsscript.json gains https://www.googleapis.com/auth/userinfo.email. That is all:
 * the three scopes, Sheets v4, BigQuery v2, Asia/Taipei, V8, STACKDRIVER, executeAs and access are
 * byte-identical; no .gs, no bundle, no API moved.
 *
 * WHAT THIS SUITE HOLDS
 *   A  the evidence the round rests on is kept, and says only what was measured
 *   B  the manifest is EXACTLY the old bytes plus one line — checked on the raw text, not a parse
 *   C  the round moved no runtime file — pinned to the round's OWN interval, not PRE..HEAD
 *   D  75_ still fails closed, executed: a throw and an empty email both refuse; a request body, a '*'
 *      and the deployer (getEffectiveUser) can never stand in for the caller
 *   E  the runbook no longer explains UNVERIFIABLE as execute-as-owner by default
 *   F  the approval record is the literal list below, so it cannot grow without this file changing too
 *   M  mutants: each must be caught by the gate above it, and each gate must be green on the clean tree
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var MANIFEST_REL = GS + 'appsscript.json';
var PRE_SHA = '26b35b6c';   // the tree this round started from (PSB-DEMO-R1 raw sweep)
var SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
var OWNER = 'vic.zhou@shopkitchenmama.com';

// Pinned here as a literal ON PURPOSE (F): the shared approval module must agree with it.
var EXPECTED_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/bigquery',
  SCOPE
];

var pass = 0, fail = 0;
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.log('FAIL ' + l + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, l) { ok(JSON.stringify(a) === JSON.stringify(b), l, { got: a, want: b }); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function git(args) { return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }

var NOW_RAW = read(MANIFEST_REL);
var PRE_RAW = git(['show', PRE_SHA + ':' + MANIFEST_REL]);
var FX_SRC = read(GS + '75_api_v1_fx_rate_book.gs');
var RUNBOOK = read('docs/planning/R55_PRODUCTION_RELEASE_RUNBOOK.md');

// ===================================================================================================
console.log('\n=== A  THE MEASUREMENT IS KEPT, AND CLAIMS NO MORE THAN WAS MEASURED ===');
var EV = JSON.parse(read('docs/evidence/fx-auth-r1/owner-measurement.json'));
eq(EV.round, 'FX-AUTH-R1', 'A1 the evidence names this round');
eq(EV.reported.allowlist_present, true, 'A2 allowlist_present = true, as the Owner measured');
ok(/threw/.test(EV.reported['Session.getActiveUser']) && EV.reported['Session.getActiveUser'].indexOf(SCOPE) !== -1,
  'A3 and Session.getActiveUser threw for the missing userinfo.email scope');
ok(EV.readOnly === true && /Owner/.test(EV.measuredBy), 'A4 recorded as the Owner’s read-only measurement, not the agent’s');
ok((EV.notMeasured || []).some(function (s) { return /expected, not proved/.test(s); }),
  'A5 and it says the fix is EXPECTED to identify the caller, not that it has been shown to');

// ===================================================================================================
console.log('\n=== B  THE MANIFEST: THE OLD BYTES PLUS ONE LINE ===');
function manifestGate(raw) {
  var v = [];
  var m;
  try { m = JSON.parse(raw); } catch (e) { return ['NOT_JSON']; }
  if ((raw.match(/"oauthScopes"/g) || []).length !== 1) v.push('OAUTH_SCOPES_KEY_COUNT');
  if (JSON.stringify(m.oauthScopes) !== JSON.stringify(EXPECTED_SCOPES)) v.push('SCOPES_NOT_EXACT');
  var pre = JSON.parse(PRE_RAW);
  if (JSON.stringify(m.webapp) !== JSON.stringify(pre.webapp)) v.push('WEBAPP_MOVED');
  if (!m.webapp || m.webapp.executeAs !== 'USER_DEPLOYING' || m.webapp.access !== 'ANYONE_ANONYMOUS') v.push('WEBAPP_NOT_PINNED');
  ['timeZone', 'runtimeVersion', 'exceptionLogging'].forEach(function (k) { if (m[k] !== pre[k]) v.push(k.toUpperCase() + '_MOVED'); });
  if (JSON.stringify(m.dependencies) !== JSON.stringify(pre.dependencies)) v.push('SERVICES_MOVED');
  if (JSON.stringify(Object.keys(m)) !== JSON.stringify(Object.keys(pre))) v.push('KEYS_MOVED');
  // The raw text, line-ending normalised: exactly PRE with the one approved line added.
  var want = lf(PRE_RAW).replace('    "https://www.googleapis.com/auth/bigquery"\n  ]',
    '    "https://www.googleapis.com/auth/bigquery",\n    "' + SCOPE + '"\n  ]');
  if (lf(raw) !== want) v.push('RAW_NOT_PRE_PLUS_ONE_LINE');
  return v;
}
eq(manifestGate(NOW_RAW), [], 'B1 the manifest passes every gate below');
eq(JSON.parse(NOW_RAW).oauthScopes, EXPECTED_SCOPES, 'B2 the scopes are EXACTLY the three plus userinfo.email, in order');
eq(JSON.parse(PRE_RAW).oauthScopes, EXPECTED_SCOPES.slice(0, 3), 'B3 and the three are the ones ' + PRE_SHA + ' carried');
eq(JSON.parse(NOW_RAW).webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
  'B4 executeAs and access are unchanged');
eq(JSON.parse(NOW_RAW).dependencies.enabledAdvancedServices.map(function (s) { return s.userSymbol + ' ' + s.version; }),
  ['BigQuery v2', 'Sheets v4'], 'B5 BigQuery v2 and Sheets v4 are still the advanced services');
eq([JSON.parse(NOW_RAW).timeZone, JSON.parse(NOW_RAW).runtimeVersion, JSON.parse(NOW_RAW).exceptionLogging],
  ['Asia/Taipei', 'V8', 'STACKDRIVER'], 'B6 timezone, runtime and exception logging are unchanged');
// git show returns the INDEX copy (LF); the checkout is CRLF. What must hold is that the edit did not mix them.
ok((NOW_RAW.match(/\r\n/g) || []).length === (NOW_RAW.match(/\n/g) || []).length,
  'B7 and the working copy has one line ending throughout - the added line did not bring a different one');

// ===================================================================================================
console.log('\n=== C  THE ROUND MOVED NO RUNTIME FILE — over the round’s own interval ===');
// The commit that introduced the scope ends the interval once it exists. Before the commit, the working
// tree is the round. Either way a later round's .gs edit is NOT this round's, so it cannot fail here.
var ROUND_END = git(['log', '--format=%H', '-S', 'auth/userinfo.email', PRE_SHA + '..HEAD', '--', MANIFEST_REL])
  .trim().split(/\r?\n/).filter(Boolean).pop() || null;
var changed = (ROUND_END
  ? git(['diff', '--name-only', PRE_SHA, ROUND_END])
  : git(['diff', '--name-only', PRE_SHA]) + git(['ls-files', '--others', '--exclude-standard']))
  .trim().split(/\r?\n/).filter(Boolean).sort();
var ALLOWED = [
  MANIFEST_REL,
  'assets/tests/_advanced-services-state.js',
  'assets/tests/_oauth-scope-approvals.js',
  'assets/tests/advanced-sheets-service-enable-transition-s8-r4d-d2.test.js',
  'assets/tests/appsscript-manifest-oauth-scopes-f1-4b-fm5r4jauth2.test.js',
  'assets/tests/b1-advanced-sheets-benchmark-harness-s8-r4d-d1.test.js',
  'assets/tests/b1-product-first-layer-batch-read-s8-r4d-e2.test.js',
  'assets/tests/fc-target-rules-migration-actor-r2b-a2-f1.test.js',
  'assets/tests/fx-auth-userinfo-email-scope-fx-auth-r1.test.js',
  'assets/tests/identity-boundary-baseline-sec-a0.test.js',
  'assets/tests/product-strategy-activation-p1-b8d.test.js',
  'docs/evidence/fx-auth-r1/owner-measurement.json',
  'docs/planning/DEPLOYMENT_RELEASE_LOG.md',
  'docs/planning/R55_PRODUCTION_RELEASE_RUNBOOK.md'
];
eq(changed.filter(function (f) { return ALLOWED.indexOf(f) === -1; }), [],
  'C1 every file the round touched is on its list (' + (ROUND_END ? PRE_SHA + '..' + ROUND_END.slice(0, 8) : 'working tree') + ')');
eq(changed.filter(function (f) { return /\.gs$/.test(f); }), [], 'C2 no .gs file moved — the generated bundle included');
eq(changed.filter(function (f) { return /^assets\/(js|css|html)\//.test(f) || f === 'index.html'; }), [],
  'C3 and no frontend file moved — no new API, no new page');
ok(changed.indexOf(MANIFEST_REL) !== -1, 'C4 and the manifest is among them (the interval is not empty by accident)');

// ===================================================================================================
console.log('\n=== D  75_ STILL FAILS CLOSED — executed, not grepped ===');
var P73 = read(GS + '73_api_v1_pricing_write.gs');
var PRICING_STR = /^function pricingStr_\(v\) \{[^\n]*\}\s*$/m.exec(P73)[0];
var DECIMALS = /var PRICING_FX_DECIMALS_ = \{[\s\S]*?\};/.exec(P73)[0];
function run75(src, opts) {
  var props = { KM_FX_RATE_BOOK_EDITORS: opts.editors };
  var writes = 0, touches = { active: 0, effective: 0 };
  var ctx = {
    console: { log: function () {} },
    PropertiesService: { getScriptProperties: function () { return {
      getProperty: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
      setProperty: function () { writes++; } }; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {} }; } },
    Session: {
      getActiveUser: function () {
        touches.active++;
        if (opts.active === 'THROW') throw new Error('You do not have permission to call Session.getActiveUser. Required permissions: ' + SCOPE);
        return { getEmail: function () { return opts.active; } };
      },
      getEffectiveUser: function () { touches.effective++; return { getEmail: function () { return OWNER; } }; }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(PRICING_STR + '\n' + DECIMALS + '\n' + src, ctx);
  ctx.__body = opts.body || {};
  var auth = vm.runInContext('fxBookAuthority_(fxBookDefaultIo_())', ctx);
  var get = vm.runInContext('handleFxRateBookGet_(__body)', ctx);
  var save = vm.runInContext('handleFxRateBookSave_(__body)', ctx);
  return { auth: auth, get: get, save: save, writes: writes, touches: touches };
}
var CLAIM = { email: OWNER, user: OWNER, editor: OWNER, role: 'owner', may_edit: true,
  rates: [], doc_version: 0 };
function refusalGate(src) {
  var v = [];
  var r;
  r = run75(src, { editors: OWNER, active: 'THROW', body: CLAIM });
  if (r.auth.code !== 'FX_AUTHORITY_UNVERIFIABLE') v.push('THROW_NOT_UNVERIFIABLE');
  if (r.get.data && r.get.data.may_edit !== false) v.push('THROW_GET_MAY_EDIT');
  if (r.save.success !== false || r.writes !== 0) v.push('THROW_SAVE_WROTE');
  if (r.touches.effective !== 0) v.push('EFFECTIVE_USER_READ');
  r = run75(src, { editors: OWNER, active: '', body: CLAIM });
  if (r.auth.code !== 'FX_AUTHORITY_UNVERIFIABLE' || r.writes !== 0 || r.save.success !== false) v.push('EMPTY_NOT_REFUSED');
  if (r.touches.effective !== 0) v.push('EFFECTIVE_USER_READ_EMPTY');
  r = run75(src, { editors: '*', active: OWNER, body: CLAIM });
  if (r.auth.code !== 'FX_AUTHORITY_WILDCARD_REFUSED' || r.writes !== 0) v.push('WILDCARD_NOT_REFUSED');
  r = run75(src, { editors: 'someone.else@shopkitchenmama.com', active: 'stranger@example.com', body: CLAIM });
  if (r.auth.code !== 'FX_NOT_AUTHORIZED' || r.writes !== 0) v.push('OTHER_NOT_REFUSED');
  r = run75(src, { editors: undefined, active: OWNER, body: CLAIM });
  if (r.auth.code !== 'FX_AUTHORITY_NOT_CONFIGURED') v.push('UNSET_NOT_REFUSED');
  r = run75(src, { editors: OWNER, active: OWNER, body: {} });
  if (r.auth.ok !== true || r.auth.user !== OWNER || !(r.get.data && r.get.data.may_edit === true)) v.push('OWNER_NOT_IDENTIFIED');
  return v;
}
var CLEAN_D = refusalGate(FX_SRC);
eq(CLEAN_D, [], 'D1 every refusal holds and the listed Owner is still recognised');
var rThrow = run75(FX_SRC, { editors: OWNER, active: 'THROW', body: CLAIM });
eq([rThrow.auth.code, rThrow.get.data.may_edit, rThrow.get.data.authority_reason],
  ['FX_AUTHORITY_UNVERIFIABLE', false, 'FX_AUTHORITY_UNVERIFIABLE'],
  'D2 the measured case reproduces: allowlist set, getActiveUser throws -> may_edit false, UNVERIFIABLE');
eq([rThrow.save.success, rThrow.writes], [false, 0],
  'D3 and a save carrying a browser-sent email and role is refused with zero writes');
eq(rThrow.touches.effective, 0, 'D4 getEffectiveUser is never read — the deployer is not the caller');
var rOk = run75(FX_SRC, { editors: OWNER, active: OWNER, body: {} });
eq([rOk.auth.ok, rOk.get.data.may_edit, rOk.get.data.authority_reason], [true, true, null],
  'D5 once getActiveUser answers with the listed address, the Owner may edit (what the scope is for)');
eq(/function fxBookAuthority_\(([^)]*)\)/.exec(FX_SRC)[1], 'io', 'D6 the authority takes only the io — no request reaches it');
var RUNTIME = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) { return /\.gs$/.test(f); });
eq(RUNTIME.filter(function (f) { return /getEffectiveUser/.test(read(GS + f)); }), [],
  'D7 no runtime file reads Session.getEffectiveUser');
eq(RUNTIME.filter(function (f) { return /Session\.getActiveUser/.test(read(GS + f)); }), ['75_api_v1_fx_rate_book.gs'],
  'D8 and 75_ is still the only file that asks who is calling');

// ===================================================================================================
console.log('\n=== E  THE RUNBOOK NAMES BOTH CAUSES ===');
function runbookGate(md) {
  var v = [];
  var row = (md.match(/^\s*\| `FX_AUTHORITY_UNVERIFIABLE` \|[^\n]*$/m) || [''])[0];
  if (!row) v.push('ROW_MISSING');
  if (/execute-as-owner\)/.test(row)) v.push('ROW_STILL_EXECUTE_AS_OWNER');
  if (!/two causes/.test(row)) v.push('ROW_NOT_TWO_CAUSES');
  if (!/permission exception[^\n]*userinfo\.email/.test(md)) v.push('NO_PERMISSION_CASE');
  if (!/empty email[^\n]*returns `''`/.test(md)) v.push('NO_EMPTY_CASE');
  if (!/neither can the execution log/.test(md)) v.push('CLAIMS_LOG_DISTINGUISHES');
  if (!/## 5A\. FX-AUTH-R1/.test(md)) v.push('NO_SCOPE_STEP');
  if (!/getEffectiveUser/.test(md) || !/`\*`/.test(md)) v.push('NO_REFUSED_SHORTCUTS');
  return v;
}
eq(runbookGate(RUNBOOK), [], 'E1 UNVERIFIABLE is explained as an empty email OR a permission exception, not execute-as-owner');

// ===================================================================================================
console.log('\n=== F  THE APPROVAL RECORD IS THIS LIST AND NO LONGER ONE ===');
var APPROVALS = require('./_oauth-scope-approvals.js');
eq(APPROVALS.EXPECTED, EXPECTED_SCOPES, 'F1 the shared approval module says exactly what this suite pins');
eq(APPROVALS.APPROVED_ADDITIONS.map(function (a) { return [a.scope, a.round]; }), [[SCOPE, 'FX-AUTH-R1']],
  'F2 one approved addition, named by round');
eq(APPROVALS.withApproved(APPROVALS.BASELINE), EXPECTED_SCOPES, 'F3 baseline plus approvals is the manifest');
eq(APPROVALS.withApproved(EXPECTED_SCOPES), EXPECTED_SCOPES, 'F4 and applying it twice adds nothing');

// ===================================================================================================
console.log('\n=== M  MUTANTS ===');
var caught = 0, survived = 0, vacuous = 0;
function swap(s, a, b) {
  var crlf = /\r\n/.test(s);
  var A = crlf ? a.replace(/\r?\n/g, '\r\n') : a, B = crlf ? b.replace(/\r?\n/g, '\r\n') : b;
  if (s.split(A).length !== 2) throw new Error('mutant anchor not unique: ' + a.slice(0, 60));
  return s.replace(A, B);
}
function mutant(id, why, gate, clean, mutate) {
  if (gate(clean).length) { vacuous++; console.log('VACUOUS  ' + id + '  gate fires on the clean input'); return; }
  var m = mutate(clean);
  if (m === clean) { vacuous++; console.log('VACUOUS  ' + id + '  the mutation changed nothing'); return; }
  var v;
  try { v = gate(m); } catch (e) { v = ['THREW ' + e.message]; }
  if (v.length) { caught++; console.log('caught   ' + id + '  ' + why + '  -> ' + v.join(',')); }
  else { survived++; console.log('SURVIVED ' + id + '  ' + why); }
}
var BQ = '"https://www.googleapis.com/auth/bigquery",';
var UE = '"' + SCOPE + '"';
mutant('M1', 'spreadsheets removed', manifestGate, NOW_RAW, function (s) { return swap(s, '    "https://www.googleapis.com/auth/spreadsheets",\n', ''); });
mutant('M2', 'script.scriptapp removed', manifestGate, NOW_RAW, function (s) { return swap(s, '    "https://www.googleapis.com/auth/script.scriptapp",\n', ''); });
mutant('M3', 'bigquery removed', manifestGate, NOW_RAW, function (s) { return swap(s, '    ' + BQ + '\n', ''); });
mutant('M4', 'userinfo.email removed again', manifestGate, NOW_RAW, function (s) { return swap(s, BQ + '\n    ' + UE, BQ.slice(0, -1)); });
mutant('M5', 'drive rides along', manifestGate, NOW_RAW, function (s) { return swap(s, UE, UE + ',\n    "https://www.googleapis.com/auth/drive"'); });
mutant('M6', 'userinfo.profile rides along (the "harmless" neighbour)', manifestGate, NOW_RAW, function (s) { return swap(s, UE, UE + ',\n    "https://www.googleapis.com/auth/userinfo.profile"'); });
mutant('M7', 'external_request added (a token verifier without a decision)', manifestGate, NOW_RAW, function (s) { return swap(s, UE, UE + ',\n    "https://www.googleapis.com/auth/script.external_request"'); });
mutant('M8', 'userinfo.email listed twice', manifestGate, NOW_RAW, function (s) { return swap(s, UE, UE + ',\n    ' + UE); });
mutant('M9', 'openid instead of userinfo.email', manifestGate, NOW_RAW, function (s) { return swap(s, UE, '"openid"'); });
mutant('M10', 'executeAs moved to USER_ACCESSING', manifestGate, NOW_RAW, function (s) { return swap(s, '"USER_DEPLOYING"', '"USER_ACCESSING"'); });
mutant('M11', 'access narrowed to DOMAIN', manifestGate, NOW_RAW, function (s) { return swap(s, '"ANYONE_ANONYMOUS"', '"DOMAIN"'); });
mutant('M12', 'timezone moved', manifestGate, NOW_RAW, function (s) { return swap(s, '"Asia/Taipei"', '"UTC"'); });
mutant('M13', 'Sheets v4 dropped', manifestGate, NOW_RAW, function (s) { return swap(s, ',\n      {\n        "userSymbol": "Sheets",\n        "version": "v4",\n        "serviceId": "sheets"\n      }', ''); });
mutant('M14', 'a second oauthScopes key injected above the real one', manifestGate, NOW_RAW, function (s) { return swap(s, '"timeZone"', '"oauthScopes": ["https://www.googleapis.com/auth/drive"],\n  "timeZone"'); });
mutant('M15', 'a stray key added to the manifest', manifestGate, NOW_RAW, function (s) { return swap(s, '"runtimeVersion": "V8",', '"runtimeVersion": "V8",\n  "urlFetchWhitelist": [],'); });
mutant('M16', '75_ falls back to getEffectiveUser when the caller is unreadable', refusalGate, FX_SRC, function (s) {
  return swap(s, "try { return pricingStr_(Session.getActiveUser().getEmail()); } catch (e) { return ''; }",
    "try { return pricingStr_(Session.getActiveUser().getEmail()) || pricingStr_(Session.getEffectiveUser().getEmail()); } catch (e) { return pricingStr_(Session.getEffectiveUser().getEmail()); }"); });
mutant('M17', '75_ honours * again', refusalGate, FX_SRC, function (s) {
  return swap(s, "if (real.length === 0 && list.indexOf('*') !== -1) {", "if (false) {"); });
mutant('M18', '75_ treats an unidentifiable caller as allowed', refusalGate, FX_SRC, function (s) {
  return swap(s, "  if (!who) {\n    return { ok: false, code: 'FX_AUTHORITY_UNVERIFIABLE'", "  if (!who && false) {\n    return { ok: false, code: 'FX_AUTHORITY_UNVERIFIABLE'"); });
mutant('M19', '75_ trusts a browser-sent email on save', refusalGate, FX_SRC, function (s) {
  return swap(s, "function handleFxRateBookSave_(body, io) {\n  io = io || fxBookDefaultIo_();",
    "function handleFxRateBookSave_(body, io) {\n  io = io || fxBookDefaultIo_();\n  if (body && body.email) { var u0 = io.user; io = Object.assign({}, io, { user: function () { return u0() || String(body.email); } }); }"); });
mutant('M20', 'the runbook row goes back to execute-as-owner', runbookGate, RUNBOOK, function (s) {
  return swap(s, "the caller's email could not be read — **two causes, one code** (below)", 'the deployment cannot see the caller (execute-as-owner)'); });
mutant('M21', 'the runbook claims the execution log tells the causes apart', runbookGate, RUNBOOK, function (s) {
  return swap(s, 'neither can the execution log', 'the execution log can'); });
eq(survived, 0, 'M  0 mutants survived (' + caught + ' caught)');
eq(vacuous, 0, 'M  0 vacuous mutants');

console.log('\n' + new Array(101).join('='));
console.log('FX-AUTH-R1 USERINFO.EMAIL SCOPE — passed ' + pass + '  failed ' + fail + '  |  mutants caught ' + caught
  + '  survived ' + survived + '  vacuous ' + vacuous);
console.log(new Array(101).join('='));
process.exitCode = fail === 0 ? 0 : 1;
