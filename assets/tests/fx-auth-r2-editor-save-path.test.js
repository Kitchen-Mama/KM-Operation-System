// FX-AUTH-R2 — the Web channel cannot identify a caller; the phase-1 Owner path goes through 75_'s own save.
// Run: node assets/tests/fx-auth-r2-editor-save-path.test.js
//
// OFFLINE ONLY. The real 73_ helpers and the whole real 75_ run in a sandbox over an in-memory Script
// Properties store, with the editor's Session stubbed. Nothing here reaches a deployment.
//
//   A  the channel, from the shipped source: the page's FX calls carry no credentials, the deployment is
//      ANYONE_ANONYMOUS, and nothing in this round moved either
//   B  the Editor wrapper, EXECUTED: a dry run writes nothing; a confirmed run writes exactly once, through
//      75_'s lock, compare-and-swap, validation and server-side audit; every refusal writes nothing
//   C  the wrapper's text: no direct Property write, no deployer identity, no pricing, no spreadsheet
//   D  it is not in any release
//   M  mutants of the wrapper, each caught by B or C
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var WRAP_REL = 'docs/planning/fx-auth-r2/TEMP_FxRateBookEditorSave.gs.txt';
var OWNER = 'vic.zhou@shopkitchenmama.com';
var BASE_SHA = '8da211de';   // the frozen candidate this round starts from
var pass = 0, fail = 0;
function ok(c, l, x) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.log('FAIL ' + l + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } }
function eq(a, b, l) { ok(JSON.stringify(a) === JSON.stringify(b), l, { got: a, want: b }); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function extract(src, header) {
  var i = src.indexOf(header);
  if (i < 0) throw new Error('not found: ' + header);
  var depth = 0, started = false;
  for (var j = i; j < src.length; j++) {
    var c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1) + (header.indexOf('var') === 0 ? ';' : ''); }
  }
  throw new Error('unbalanced: ' + header);
}
var SRC73 = read(GS + '73_api_v1_pricing_write.gs');
var SRC75 = read(GS + '75_api_v1_fx_rate_book.gs');
var REUSED = ['var PRICING_FX_DECIMALS_ = {', 'function pricingStr_(', 'function pricingReadNumber_(',
  'function pricingDecimalsFor_(', 'function pricingFxPairKey_(', 'function pricingBuildRateTable_(']
  .map(function (h) { return extract(SRC73, h); }).join('\n\n');
var WRAP = read(WRAP_REL);

var RATES = [
  { base_currency: 'USD', quote_currency: 'CAD', rate: 1.37, source: 'manual', as_of: '2026-10-20',
    effective_from: '2026-10-20', effective_to: '', status: 'active', version: 1 },
  { base_currency: 'USD', quote_currency: 'JPY', rate: 151.2, source: 'manual', as_of: '2026-10-20',
    effective_from: '2026-10-20', effective_to: '', status: 'active', version: 1 }
];

/* ONE RUN OF THE WRAPPER, AS THE EDITOR WOULD RUN IT. `opts.store` is the Script Properties; `opts.swapAfterReads`
   replaces the stored book after N reads of it, to stand for another writer landing between two reads. */
function runWrapper(src, opts) {
  var store = JSON.parse(JSON.stringify(opts.store || {}));
  var t = { set: [], reads: 0, lock: 0, unlock: 0, effective: 0, other: [], logs: [] };
  function trap(name) {
    return new Proxy(function () {}, { get: function (_x, k) { t.other.push(name + '.' + String(k)); throw new Error('TRAP ' + name); },
      apply: function () { t.other.push(name + '()'); throw new Error('TRAP ' + name); } });
  }
  var ctx = {
    console: { log: function () {} }, JSON: JSON, Math: Math, Object: Object, String: String, Number: Number, Array: Array, Date: Date, isFinite: isFinite,
    PropertiesService: { getScriptProperties: function () { return {
      getProperty: function (k) {
        if (k === 'KM_FX_RATE_BOOK') {
          t.reads++;
          if (opts.swapAfterReads && t.reads > opts.swapAfterReads && opts.swapTo) store[k] = opts.swapTo;
        }
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setProperty: function (k, v) { t.set.push(k); store[k] = String(v); },
      getProperties: function () { t.other.push('getProperties'); throw new Error('TRAP getProperties'); },
      deleteProperty: function () { t.other.push('deleteProperty'); throw new Error('TRAP deleteProperty'); }
    }; } },
    Session: {
      getActiveUser: function () {
        if (opts.user === 'THROW') throw new Error('You do not have permission to call Session.getActiveUser. Required permissions: https://www.googleapis.com/auth/userinfo.email');
        return { getEmail: function () { return opts.user; } };
      },
      getEffectiveUser: function () { t.effective++; return { getEmail: function () { return OWNER; } }; },
      getScriptTimeZone: function () { return 'Asia/Taipei'; }
    },
    LockService: { getScriptLock: function () { return {
      tryLock: function () { t.lock++; return true; }, waitLock: function () { t.lock++; }, releaseLock: function () { t.unlock++; } }; } },
    Logger: { log: function (s) { t.logs.push(String(s)); } }
  };
  ['SpreadsheetApp', 'ScriptApp', 'UrlFetchApp', 'DriveApp', 'MailApp', 'GmailApp', 'BigQuery', 'Sheets', 'CacheService', 'ContentService', 'HtmlService']
    .forEach(function (g) { ctx[g] = trap(g); });
  vm.createContext(ctx);
  vm.runInContext(REUSED + '\n' + SRC75 + '\n' + src, ctx);
  ctx.__rates = opts.rates;
  vm.runInContext('TEMP_FX_RATES = __rates; TEMP_FX_EXPECTED_DOC_VERSION = ' + JSON.stringify(opts.expected) + ';', ctx);
  if (opts.confirmFrom) {
    var dry = vm.runInContext('(function(){ var c = TEMP_FX_CONFIRM; TEMP_FX_CONFIRM = ""; var o = TEMP_FxRateBookEditorSave(); TEMP_FX_CONFIRM = c; return o; })()', ctx);
    ctx.__confirm = dry.confirm_for_this_payload;
    t.set = []; t.lock = 0; t.unlock = 0; t.logs = []; t.reads = 0;
    if (opts.ratesAfterDry) { ctx.__r2 = opts.ratesAfterDry; vm.runInContext('TEMP_FX_RATES = __r2;', ctx); }
    vm.runInContext('TEMP_FX_CONFIRM = __confirm;', ctx);
  } else if (opts.confirm !== undefined) {
    ctx.__confirm = opts.confirm; vm.runInContext('TEMP_FX_CONFIRM = __confirm;', ctx);
  }
  var out, err = null;
  try { out = JSON.parse(JSON.stringify(vm.runInContext('TEMP_FxRateBookEditorSave()', ctx))); } catch (e) { err = e.message; }
  return { out: out, err: err, t: t, store: store };
}
function book(v, rates) { return JSON.stringify({ shape: 1, doc_version: v, rates: rates || [], log: [] }); }
var EDITORS = { KM_FX_RATE_BOOK_EDITORS: OWNER };

/* THE GATE — every scenario, against one wrapper text. Returns the list of violations. */
function scenarioGate(src) {
  var v = [];
  function r(o) { try { return runWrapper(src, o); } catch (e) { return { err: 'LOAD ' + e.message, t: { set: [], other: [], effective: 0, lock: 0, unlock: 0, logs: [] }, store: {} }; } }
  function clean(name, x) {
    if (x.err) v.push(name + ' THREW ' + x.err);
    if (x.t.other.length) v.push(name + ' TOUCHED ' + x.t.other.join(','));
    if (x.t.effective) v.push(name + ' READ_EFFECTIVE_USER');
  }
  // dry run
  var a = r({ store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirm: '' });
  clean('DRY', a);
  if (!a.out || a.out.mode !== 'DRY_RUN' || a.out.stopped !== 'DRY_RUN_ONLY') v.push('DRY not a dry run');
  if (a.t.set.length || a.t.lock) v.push('DRY wrote or locked');
  if (!a.out || !/^SAVE doc_version 0 -> 1 digest [0-9a-f]{8}$/.test(a.out.confirm_for_this_payload || '')) v.push('DRY no exact confirm');
  if (!a.out || JSON.stringify(a.out.would_record) !== JSON.stringify(['ADDED USD>CAD@2026-10-20', 'ADDED USD>JPY@2026-10-20'])) v.push('DRY changes not reported');
  if (a.t.logs.length !== 1) v.push('DRY log lines ' + a.t.logs.length);
  // confirmed commit
  var b = r({ store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirmFrom: true });
  clean('COMMIT', b);
  if (!b.out || b.out.mode !== 'COMMIT' || !b.out.result || b.out.result.success !== true || b.out.result.doc_version !== 1) v.push('COMMIT did not save v1');
  if (JSON.stringify(b.t.set) !== JSON.stringify(['KM_FX_RATE_BOOK'])) v.push('COMMIT writes ' + JSON.stringify(b.t.set));
  if (b.t.lock !== 1 || b.t.unlock !== 1) v.push('COMMIT lock ' + b.t.lock + '/' + b.t.unlock);
  var stored = null; try { stored = JSON.parse(b.store.KM_FX_RATE_BOOK); } catch (e) { stored = null; }
  if (!stored || stored.doc_version !== 1 || stored.rates.length !== 2) v.push('COMMIT stored book wrong');
  if (!stored || !stored.log.length || !stored.log.every(function (l) { return l.by === OWNER && /^\d{4}-\d{2}-\d{2}T/.test(l.at); })) v.push('COMMIT audit not server-side Owner');
  // the payload changed after its dry run
  var c = r({ store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirmFrom: true,
    ratesAfterDry: [Object.assign({}, RATES[0], { rate: 1.73 }), RATES[1]] });
  clean('CHANGED', c);
  if (!c.out || c.out.stopped !== 'CONFIRM_DOES_NOT_MATCH_THIS_PAYLOAD' || c.t.set.length) v.push('CHANGED payload committed on an old confirm');
  // the version is not the stored one
  var d = r({ store: Object.assign({ KM_FX_RATE_BOOK: book(1, []) }, EDITORS), user: OWNER, rates: RATES, expected: 0, confirm: 'SAVE doc_version 0 -> 1 digest 00000000' });
  clean('STALE', d);
  if (!d.out || d.out.stopped !== 'VERSION_NOT_THE_STORED_ONE' || d.t.set.length) v.push('STALE not stopped by version');
  // another writer lands between the wrapper's read and 75_'s re-read inside the lock
  var e = r({ store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirmFrom: true, swapAfterReads: 1, swapTo: book(1, []) });
  clean('RACE', e);
  if (!e.out || !e.out.result || e.out.result.success !== false || e.out.result.errors.indexOf('FX_VERSION_CONFLICT') === -1 || e.t.set.length) v.push('RACE not refused by 75_ CAS');
  // invalid rates
  var f = r({ store: EDITORS, user: OWNER, rates: [Object.assign({}, RATES[0], { status: '' })], expected: 0, confirm: '' });
  clean('INVALID', f);
  if (!f.out || f.out.stopped !== 'INVALID' || f.t.set.length || !(f.out.errors || []).some(function (x) { return x.code === 'FX_STATUS_INVALID'; })) v.push('INVALID not stopped');
  // not on the list / unidentifiable / wildcard / unset
  [['NOT_LISTED', { store: { KM_FX_RATE_BOOK_EDITORS: 'someone.else@shopkitchenmama.com' }, user: OWNER }, 'FX_NOT_AUTHORIZED'],
   ['THROWS', { store: EDITORS, user: 'THROW' }, 'FX_AUTHORITY_UNVERIFIABLE'],
   ['EMPTY', { store: EDITORS, user: '' }, 'FX_AUTHORITY_UNVERIFIABLE'],
   ['WILDCARD', { store: { KM_FX_RATE_BOOK_EDITORS: '*' }, user: OWNER }, 'FX_AUTHORITY_WILDCARD_REFUSED'],
   ['UNSET', { store: {}, user: OWNER }, 'FX_AUTHORITY_NOT_CONFIGURED']].forEach(function (k) {
    var x = r(Object.assign({ rates: RATES, expected: 0, confirm: 'SAVE doc_version 0 -> 1 digest 00000000' }, k[1]));
    clean(k[0], x);
    if (!x.out || x.out.stopped !== 'AUTHORITY' || !x.out.authority || x.out.authority.code !== k[2] || x.t.set.length || x.t.lock) v.push(k[0] + ' not stopped at authority');
  });
  return v;
}
function textGate(src) {
  var v = [];
  var code = src.split('\n').map(function (l) { return l.replace(/^\s*\/\/.*$/, ''); }).join('\n');
  ['setProperty', 'setProperties', 'deleteProperty', 'getProperties', 'fxBookCommit_', 'getEffectiveUser', 'SpreadsheetApp',
    'UrlFetchApp', 'ScriptApp', 'newTrigger', 'pricing.fxReconcile', 'handlePricing', 'pricingReconcile', 'Reconcile',
    'pricing_list', 'getOAuthToken'].forEach(function (tok) { if (code.indexOf(tok) !== -1) v.push('FORBIDDEN ' + tok); });
  if ((code.match(/handleFxRateBookSave_\(/g) || []).length !== 1) v.push('SAVE_CALLS_NOT_ONE');
  var fns = (code.match(/^function\s+([A-Za-z0-9_$]+)/gm) || []).map(function (s) { return s.replace(/^function\s+/, ''); });
  if (JSON.stringify(fns) !== JSON.stringify(['TEMP_FxRateBookEditorSave', 'TEMP_FxDigest_'])) v.push('FUNCTIONS ' + fns.join(','));
  if (!/var TEMP_FX_CONFIRM = '';/.test(code)) v.push('CONFIRM_NOT_EMPTY_BY_DEFAULT');
  if (!/var TEMP_FX_RATES = \[\s*(\/\/[^\n]*\n\s*)*\];/.test(src)) v.push('RATES_NOT_EMPTY_BY_DEFAULT');
  return v;
}

console.log('\n=== A  THE CHANNEL, FROM THE SHIPPED SOURCE ===');
var API = read('assets/js/api/operation-system-db-api.js');
ok(/window\.KM\.DB\.getFxRateBook = function\(\) \{ return _kmGapRead_\('fxRateBook\.get', \{\}\); \};/.test(API)
  && /window\.KM\.DB\.saveFxRateBook = function\(payload\) \{ return _kmGapRead_\('fxRateBook\.save'/.test(API),
  'A1 both FX calls leave through _kmGapRead_');
var gap = API.slice(API.indexOf('async function _kmGapRead_('), API.indexOf('async function _kmGapRead_(') + 4000);
ok(/\? \{ method: 'GET', cache: 'no-store' \}/.test(gap) && /: \{ method: 'POST', cache: 'no-store', headers: \{ 'Content-Type': 'text\/plain' \}, body: JSON\.stringify\(dto\) \}/.test(gap)
  && !/credentials/.test(gap), 'A2 and it sends no credentials option: the fetch default (same-origin) carries no Google cookie to script.google.com');
ok(!/credentials\s*:/.test(API.split('\n').filter(function (l) { return !/^\s*(\/\/|\*)/.test(l); }).join('\n')),
  'A3 no fetch anywhere in the transport sets credentials');
var MAN = JSON.parse(read(GS + 'appsscript.json'));
eq(MAN.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }, 'A4 the deployment does not require sign-in, and runs as the deployer');
eq(cp.execFileSync('git', ['diff', '--name-only', BASE_SHA, '--', GS, 'assets/js', 'assets/css', 'assets/html', 'index.html'],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), '',
  'A5 this round changed no runtime file: no .gs, no bundle, no frontend, no manifest (since ' + BASE_SHA + ')');

console.log('\n=== B  THE EDITOR WRAPPER, EXECUTED OVER THE REAL 75_ ===');
var CLEAN_B = scenarioGate(WRAP);
eq(CLEAN_B, [], 'B1 dry run writes nothing; a confirmed run writes once through 75_ (lock, CAS, validation, server-side audit); every refusal writes nothing');
var demo = runWrapper(WRAP, { store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirmFrom: true });
eq([demo.out.mode, demo.out.result.success, demo.out.result.doc_version, demo.t.set, demo.out.handler],
  ['COMMIT', true, 1, ['KM_FX_RATE_BOOK'], 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55'],
  'B2 the committed run: one write, doc_version 0 -> 1, and it reports the 75_ build it ran (compare with the get handler)');
var dryOnly = runWrapper(WRAP, { store: EDITORS, user: OWNER, rates: [], expected: 0, confirm: '' });
eq([dryOnly.out.stopped, dryOnly.t.set.length], ['DRY_RUN_ONLY', 0], 'B3 the file as shipped (no rates, no confirm) can only dry-run');

console.log('\n=== C  THE WRAPPER TEXT ===');
eq(textGate(WRAP), [], 'C1 no direct Property write, no commit helper, no deployer identity, no pricing, no spreadsheet, one save call, empty by default');

console.log('\n=== D  NOT IN ANY RELEASE ===');
var APPS = fs.readdirSync(path.join(ROOT, GS));
eq(APPS.filter(function (f) { return /TEMP_FxRateBookEditorSave/.test(read(GS + f)); }), [], 'D1 no file in the Apps Script folder carries the wrapper');
ok(WRAP_REL.indexOf(GS) !== 0 && /\.gs\.txt$/.test(WRAP_REL), 'D2 it lives outside that folder as .gs.txt');

console.log('\n=== M  MUTANTS ===');
var caught = 0, survived = 0, vacuous = 0;
function mutant(id, why, gate, find, repl) {
  if (gate(WRAP).length) { vacuous++; console.log('VACUOUS  ' + id); return; }
  if (WRAP.split(find).length !== 2) { vacuous++; console.log('VACUOUS  ' + id + ' anchor'); return; }
  var m = WRAP.replace(find, repl);
  var res = gate(m);
  if (res.length) { caught++; console.log('caught   ' + id + '  ' + why + '  -> ' + res.slice(0, 3).join(' | ')); }
  else { survived++; console.log('SURVIVED ' + id + '  ' + why); }
}
mutant('M1', 'the confirm check is dropped: every run commits', scenarioGate,
  "  } else if (TEMP_FX_CONFIRM !== out.confirm_for_this_payload) {", "  } else if (false) {");
mutant('M2', 'the confirm ignores the payload (version only)', scenarioGate,
  "    + (TEMP_FX_EXPECTED_DOC_VERSION + 1) + ' digest ' + TEMP_FxDigest_(TEMP_FX_RATES);", "    + (TEMP_FX_EXPECTED_DOC_VERSION + 1) + ' digest ' + TEMP_FxDigest_([]);");
mutant('M3', 'the wrapper no longer checks the stored version itself', scenarioGate,
  "  if (typeof TEMP_FX_EXPECTED_DOC_VERSION !== 'number' || current.doc_version !== TEMP_FX_EXPECTED_DOC_VERSION) {", "  if (false) {");
mutant('M4', 'the wrapper writes the book itself instead of calling 75_', scenarioGate,
  "  var res = handleFxRateBookSave_({ payload: { doc_version: TEMP_FX_EXPECTED_DOC_VERSION, rates: TEMP_FX_RATES } });",
  "  PropertiesService.getScriptProperties().setProperty('KM_FX_RATE_BOOK', JSON.stringify({ shape: 1, doc_version: 1, rates: TEMP_FX_RATES, log: [] }));\n  var res = { success: true, data: { doc_version: 1, change_log: [] }, errors: [] };");
mutant('M5', 'the wrapper falls back to the deployer when the caller is unreadable', scenarioGate,
  "  var io = fxBookDefaultIo_();", "  var io = fxBookDefaultIo_(); var u0 = io.user; io.user = function () { return u0() || Session.getEffectiveUser().getEmail(); };");
mutant('M6', 'the wrapper commits through the commit helper, skipping the lock', scenarioGate,
  "  var res = handleFxRateBookSave_({ payload: { doc_version: TEMP_FX_EXPECTED_DOC_VERSION, rates: TEMP_FX_RATES } });",
  "  var cm = fxBookCommit_(io, { doc_version: current.doc_version + 1, rates: TEMP_FX_RATES, log: current.log });\n  var res = { success: cm.ok, data: { doc_version: current.doc_version + 1, change_log: [] }, errors: [] };");
mutant('M7', 'the wrapper skips its own authority stop', scenarioGate,
  "  if (!auth.ok) { out.stopped = 'AUTHORITY'; Logger.log(JSON.stringify(out)); return out; }", "");
mutant('M8', 'the wrapper skips its own validation stop', scenarioGate,
  "  } else if (!v.ok) {\n    out.stopped = 'INVALID';\n", "  } else if (false) {\n");
mutant('M9', 'a commit-ready confirm ships as the default', textGate,
  "var TEMP_FX_CONFIRM = '';", "var TEMP_FX_CONFIRM = 'SAVE doc_version 0 -> 1 digest 00000000';");
mutant('M10', 'the wrapper calls the pricing reconcile after saving', textGate,
  "  Logger.log(JSON.stringify(out));\n  return out;\n}\n\n// A short", "  handlePricingFxReconcile_({});\n  Logger.log(JSON.stringify(out));\n  return out;\n}\n\n// A short");
eq(survived, 0, 'M  0 mutants survived (' + caught + ' caught)');
eq(vacuous, 0, 'M  0 vacuous');

console.log('\nFX-AUTH-R2 EDITOR SAVE PATH — passed ' + pass + '  failed ' + fail + '  |  mutants caught ' + caught + '  survived ' + survived + '  vacuous ' + vacuous);
process.exitCode = fail ? 1 : 0;
