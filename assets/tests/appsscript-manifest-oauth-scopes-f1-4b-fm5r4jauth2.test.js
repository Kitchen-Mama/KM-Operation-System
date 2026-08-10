// Kitchen Mama Operation System — F1-4B-FM5-R4J-AUTH2 Apps Script manifest OAuth-scope audit.
// Run: node assets/tests/appsscript-manifest-oauth-scopes-f1-4b-fm5r4jauth2.test.js
// -----------------------------------------------------------------------------
// The live manifest had no explicit oauthScopes, so ScriptApp.newTrigger failed authorization. Switching to an
// EXPLICIT scope list disables auto-detection, so the list must be COMPLETE (or the Amazon BigQuery import / Sheet
// access break) AND minimal (no unused broad scopes). Code audit proved the ONLY scope-bearing APIs are
// SpreadsheetApp (incl. openById), ScriptApp (triggers), and BigQuery.Jobs (advanced service). This test pins the
// exact required set + the preserved project config, and forbids unused/broad scopes.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var MANIFEST_REL = 'specs/active/apps-script/appsscript.json';
var raw = read(MANIFEST_REL);

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

section('valid JSON');
var m = null;
try { m = JSON.parse(raw); ok(true, 'appsscript.json parses as JSON'); } catch (e) { ok(false, 'appsscript.json parses as JSON — ' + e.message); }
m = m || {};
var scopes = Array.isArray(m.oauthScopes) ? m.oauthScopes : [];

section('required scopes present (the exact minimum set from code usage)');
ok(scopes.indexOf('https://www.googleapis.com/auth/script.scriptapp') !== -1, 'script.scriptapp present — ScriptApp.newTrigger / getProjectTriggers / deleteTrigger (the AUTH2 fix)');
ok(scopes.indexOf('https://www.googleapis.com/auth/spreadsheets') !== -1, 'spreadsheets present — SpreadsheetApp getActiveSpreadsheet + openById (read/write the Operation DB)');
ok(scopes.indexOf('https://www.googleapis.com/auth/bigquery') !== -1, 'bigquery present — BigQuery.Jobs.query (Amazon daily-sales import; must survive the switch to explicit scopes)');

section('minimality — no unused / overly-broad scopes (auto-detection is now OFF)');
var FORBIDDEN = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/script.external_request',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/script.send_mail'
];
FORBIDDEN.forEach(function (s) { ok(scopes.indexOf(s) === -1, 'no unused scope ' + s + ' (no UrlFetch/Drive/Mail usage in the code)'); });
ok(scopes.length === 3, 'exactly 3 scopes (spreadsheets, script.scriptapp, bigquery) — minimal set');

section('preserved project config (Phase 2 must-preserve)');
ok(m.timeZone === 'Asia/Taipei', 'timeZone = Asia/Taipei (frozen operational cadence)');
ok(m.runtimeVersion === 'V8', 'runtimeVersion = V8');
ok(m.webapp && typeof m.webapp === 'object' && m.webapp.executeAs && m.webapp.access, 'webapp block present (executeAs + access) — deployment config preserved');
var adv = (m.dependencies && Array.isArray(m.dependencies.enabledAdvancedServices)) ? m.dependencies.enabledAdvancedServices : [];
ok(adv.some(function (s) { return s.serviceId === 'bigquery'; }), 'BigQuery advanced service preserved in dependencies (the import depends on it)');

section('no cross-domain impact — manifest is config only');
ok(/script\.scriptapp/.test(raw), 'raw manifest text carries the trigger-management scope');
// The manifest touches no .gs code, no formula, no DB. This test asserts the file is JUST the manifest.
ok(Object.keys(m).every(function (k) { return ['timeZone', 'dependencies', 'exceptionLogging', 'runtimeVersion', 'webapp', 'oauthScopes'].indexOf(k) !== -1; }), 'manifest contains only standard appsscript.json keys (no stray/injected fields)');

console.log('\n----------------------------------------');
console.log('APPS SCRIPT MANIFEST OAUTH SCOPES (F1-4B-FM5-R4J-AUTH2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
