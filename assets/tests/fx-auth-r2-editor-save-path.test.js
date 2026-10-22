// FX-AUTH-R2 — the Web channel cannot identify a caller; the phase-1 Owner path goes through 75_'s own save.
// Run: node assets/tests/fx-auth-r2-editor-save-path.test.js
//
// OFFLINE ONLY. The real 73_ helpers and the whole real 75_ run in a sandbox over an in-memory Script
// Properties store, with the editor's Session stubbed and Utilities.computeDigest backed by a real SHA-256
// that returns Java-style signed bytes, as Apps Script does. Nothing here reaches a deployment.
//
//   A  the channel, from the shipped source: the page's FX calls carry no credentials, the deployment is
//      ANYONE_ANONYMOUS, and nothing in this round moved either
//   B  the Editor wrapper, EXECUTED: a dry run lists every entry and every change with its full old and new
//      entry, writes nothing and takes no lock; a confirmed run writes exactly once, through 75_'s lock,
//      compare-and-swap, validation and server-side audit; every refusal writes nothing
//   K  FX-AUTH-R2-R1 — the confirm string: SHA-256 of exactly the payload sent; the 32-bit collision the
//      first version had, kept as a regression counter-example (NOT a suggested rate)
//   C  the wrapper's text: no hand-written hash, no direct Property write, no deployer identity, no pricing
//   D  it is not in any release
//   M  mutants of the wrapper, each caught by B, K or C
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');
var crypto = require('crypto');

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

function entry(o) {
  return Object.assign({ base_currency: 'USD', quote_currency: 'CAD', rate: 1.37, source: 'manual', as_of: '2026-10-20',
    effective_from: '2026-10-20', effective_to: '', status: 'active', version: 1 }, o || {});
}
var RATES = [entry(), entry({ quote_currency: 'JPY', rate: 151.2 })];
function view(e) {
  return { pair: e.base_currency + '>' + e.quote_currency, rate: e.rate, source: e.source, as_of: e.as_of,
    effective_from: e.effective_from, effective_to: e.effective_to, status: e.status, version: e.version };
}
function sha256Hex(s) { return crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex'); }
function expectedConfirm(v, rates) {
  return 'SAVE doc_version ' + v + ' -> ' + (v + 1) + ' sha256 ' + sha256Hex(JSON.stringify({ doc_version: v, rates: rates }));
}

/* ONE RUN OF THE WRAPPER, AS THE EDITOR WOULD RUN IT. `opts.store` is the Script Properties; `opts.swapAfterReads`
   replaces the stored book after N reads of it, to stand for another writer landing between two reads. */
function runWrapper(src, opts) {
  var store = JSON.parse(JSON.stringify(opts.store || {}));
  var t = { set: [], reads: 0, lock: 0, unlock: 0, effective: 0, other: [], logs: [], digests: [] };
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
    Logger: { log: function (s) { t.logs.push(String(s)); } },
    /* Apps Script's computeDigest returns Java bytes, -128..127. Only SHA_256 over UTF_8 is accepted. */
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256', SHA_1: 'SHA_1', MD5: 'MD5', SHA_512: 'SHA_512' },
      Charset: { UTF_8: 'UTF_8', US_ASCII: 'US_ASCII' },
      computeDigest: function (alg, text, charset) {
        t.digests.push(alg + '/' + charset);
        if (alg !== 'SHA_256' || charset !== 'UTF_8') { t.other.push('computeDigest ' + alg + '/' + charset); throw new Error('TRAP digest ' + alg); }
        return Array.prototype.map.call(crypto.createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest(),
          function (b) { return b > 127 ? b - 256 : b; });
      }
    }
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
var ZERO_CONFIRM = 'SAVE doc_version 0 -> 1 sha256 ' + new Array(65).join('0');

/* THE GATE — every scenario, against one wrapper text. Returns the list of violations. */
function scenarioGate(src) {
  var v = [];
  function r(o) { try { return runWrapper(src, o); } catch (e) { return { err: 'LOAD ' + e.message, t: { set: [], other: [], effective: 0, lock: 0, unlock: 0, logs: [], digests: [] }, store: {} }; } }
  function clean(name, x) {
    if (x.err) v.push(name + ' THREW ' + x.err);
    if (x.t.other.length) v.push(name + ' TOUCHED ' + x.t.other.join(','));
    if (x.t.effective) v.push(name + ' READ_EFFECTIVE_USER');
  }
  // dry run over an empty book: the full listing, two ADDED with their new entries, the exact confirm
  var a = r({ store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirm: '' });
  clean('DRY', a);
  if (!a.out || a.out.mode !== 'DRY_RUN' || a.out.stopped !== 'DRY_RUN_ONLY') v.push('DRY not a dry run');
  if (a.t.set.length || a.t.lock) v.push('DRY wrote or locked');
  if (!a.out || a.out.confirm_for_this_payload !== expectedConfirm(0, RATES)) v.push('DRY confirm is not sha256 of the payload sent');
  if (!a.out || JSON.stringify(a.out.payload_entries) !== JSON.stringify(RATES.map(view))) v.push('DRY payload not listed in full');
  if (!a.out || JSON.stringify(a.out.changes) !== JSON.stringify([
    { change: 'ADDED', pair: 'USD>CAD@2026-10-20', fields: null, old: null, new: view(RATES[0]) },
    { change: 'ADDED', pair: 'USD>JPY@2026-10-20', fields: null, old: null, new: view(RATES[1]) }])) v.push('DRY additions not listed with their new entries');
  if (a.t.logs.length !== 1) v.push('DRY log lines ' + a.t.logs.length);
  // dry run over an existing book: an edit and a removal, each with the full old entry (and new where there is one)
  var OLD = [entry({ rate: 1.35, source: 'old-source', as_of: '2026-10-01', version: 1 }), entry({ quote_currency: 'GBP', rate: 0.75 })];
  var NEW = [entry({ rate: 1.36, source: 'new-source', as_of: '2026-10-21', version: 2 })];
  var ed = r({ store: Object.assign({ KM_FX_RATE_BOOK: book(4, OLD) }, EDITORS), user: OWNER, rates: NEW, expected: 4, confirm: '' });
  clean('EDIT', ed);
  var want = [
    { change: 'EDITED', pair: 'USD>CAD@2026-10-20', fields: [{ field: 'rate', from: '1.35', to: '1.36' }, { field: 'source', from: 'old-source', to: 'new-source' }, { field: 'as_of', from: '2026-10-01', to: '2026-10-21' }],
      old: view(OLD[0]), new: view(NEW[0]) },
    { change: 'REMOVED', pair: 'USD>GBP@2026-10-20', fields: null, old: view(OLD[1]), new: null }];
  if (!ed.out || JSON.stringify(ed.out.changes) !== JSON.stringify(want)) v.push('EDIT changes not listed with full old and new');
  if (!ed.out || ed.out.confirm_for_this_payload !== expectedConfirm(4, NEW) || ed.t.set.length || ed.t.lock) v.push('EDIT confirm or zero-write wrong');
  // confirmed commit
  var b = r({ store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirmFrom: true });
  clean('COMMIT', b);
  if (!b.out || b.out.mode !== 'COMMIT' || !b.out.result || b.out.result.success !== true || b.out.result.doc_version !== 1) v.push('COMMIT did not save v1');
  if (JSON.stringify(b.t.set) !== JSON.stringify(['KM_FX_RATE_BOOK'])) v.push('COMMIT writes ' + JSON.stringify(b.t.set));
  if (b.t.lock !== 1 || b.t.unlock !== 1) v.push('COMMIT lock ' + b.t.lock + '/' + b.t.unlock);
  var stored = null; try { stored = JSON.parse(b.store.KM_FX_RATE_BOOK); } catch (e) { stored = null; }
  if (!stored || stored.doc_version !== 1 || JSON.stringify(stored.rates) !== JSON.stringify(RATES)) v.push('COMMIT stored book is not the approved payload');
  if (!stored || !stored.log.length || !stored.log.every(function (l) { return l.by === OWNER && /^\d{4}-\d{2}-\d{2}T/.test(l.at); })) v.push('COMMIT audit not server-side Owner');
  // the payload changed after its dry run
  var c = r({ store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirmFrom: true,
    ratesAfterDry: [Object.assign({}, RATES[0], { rate: 1.73 }), RATES[1]] });
  clean('CHANGED', c);
  if (!c.out || c.out.stopped !== 'CONFIRM_DOES_NOT_MATCH_THIS_PAYLOAD' || c.t.set.length) v.push('CHANGED payload committed on an old confirm');
  // the version is not the stored one
  var d = r({ store: Object.assign({ KM_FX_RATE_BOOK: book(1, []) }, EDITORS), user: OWNER, rates: RATES, expected: 0, confirm: ZERO_CONFIRM });
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
    var x = r(Object.assign({ rates: RATES, expected: 0, confirm: ZERO_CONFIRM }, k[1]));
    clean(k[0], x);
    if (!x.out || x.out.stopped !== 'AUTHORITY' || !x.out.authority || x.out.authority.code !== k[2] || x.t.set.length || x.t.lock) v.push(k[0] + ' not stopped at authority');
  });
  return v;
}

/* THE COLLISION THE FIRST VERSION HAD — a regression counter-example only, NOT a suggested rate. */
var COLL_A = [entry({ rate: 1.37, source: 'manual-d1xinu-1vbz5wk', as_of: '2026-10-22', effective_from: '2026-10-22' })];
var COLL_B = [entry({ rate: 1.38, source: 'manual-n3giwf-54gd4r', as_of: '2026-10-22', effective_from: '2026-10-22' })];
function oldDigest32(rates) {   // the R2 function, verbatim in behaviour, kept ONLY to prove the collision is real
  var s = JSON.stringify(rates), h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}
function collisionGate(src) {
  var v = [];
  var ra, rb, rx;
  try {
    ra = runWrapper(src, { store: EDITORS, user: OWNER, rates: COLL_A, expected: 0, confirm: '' });
    rb = runWrapper(src, { store: EDITORS, user: OWNER, rates: COLL_B, expected: 0, confirm: '' });
  } catch (e) { return ['LOAD ' + e.message]; }
  var ca = ra.out && ra.out.confirm_for_this_payload, cb = rb.out && rb.out.confirm_for_this_payload;
  if (!ca || !cb || ca === cb) v.push('A and B share a confirm string');
  if (ca !== expectedConfirm(0, COLL_A) || cb !== expectedConfirm(0, COLL_B)) v.push('confirm is not sha256 of {doc_version, rates}');
  // A's confirm used on payload B must be refused, with zero writes
  try { rx = runWrapper(src, { store: EDITORS, user: OWNER, rates: COLL_B, expected: 0, confirm: ca }); } catch (e) { return v.concat(['LOAD ' + e.message]); }
  if (!rx.out || rx.out.stopped !== 'CONFIRM_DOES_NOT_MATCH_THIS_PAYLOAD' || rx.t.set.length) v.push('A confirm accepted for payload B');
  // the version is part of what is bound
  var r5 = runWrapper(src, { store: Object.assign({ KM_FX_RATE_BOOK: book(5, []) }, EDITORS), user: OWNER, rates: COLL_A, expected: 5, confirm: '' });
  if (!r5.out || r5.out.confirm_for_this_payload === ca || r5.out.confirm_for_this_payload !== expectedConfirm(5, COLL_A)) v.push('doc_version not bound into the digest');
  if (ra.t.digests.join(',') !== 'SHA_256/UTF_8') v.push('digest calls ' + ra.t.digests.join(','));
  return v;
}

function textGate(src) {
  var v = [];
  var code = src.split('\n').map(function (l) { return l.replace(/^\s*\/\/.*$/, ''); }).join('\n');
  ['setProperty', 'setProperties', 'deleteProperty', 'getProperties', 'fxBookCommit_', 'getEffectiveUser', 'SpreadsheetApp',
    'UrlFetchApp', 'ScriptApp', 'newTrigger', 'pricing.fxReconcile', 'handlePricing', 'pricingReconcile', 'Reconcile',
    'pricing_list', 'getOAuthToken', '16777619', '2166136261', 'Math.imul', 'charCodeAt', 'MD5', 'SHA_1', 'SHA_512']
    .forEach(function (tok) { if (code.indexOf(tok) !== -1) v.push('FORBIDDEN ' + tok); });
  if ((code.match(/handleFxRateBookSave_\(/g) || []).length !== 1 || code.indexOf('handleFxRateBookSave_({ payload: payload })') === -1) v.push('SAVE_NOT_THE_FROZEN_PAYLOAD');
  if (code.indexOf("TEMP_FxSha256Hex_(JSON.stringify(payload))") === -1) v.push('DIGEST_NOT_OVER_THE_FROZEN_PAYLOAD');
  if (code.indexOf('Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)') === -1) v.push('NOT_UTILITIES_SHA256_UTF8');
  var fns = (code.match(/^function\s+([A-Za-z0-9_$]+)/gm) || []).map(function (s) { return s.replace(/^function\s+/, ''); });
  if (JSON.stringify(fns) !== JSON.stringify(['TEMP_FxRateBookEditorSave', 'TEMP_FxEntryView_', 'TEMP_FxChanges_', 'TEMP_FxSha256Hex_'])) v.push('FUNCTIONS ' + fns.join(','));
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
eq(scenarioGate(WRAP), [], 'B1 dry run lists every entry and every change (full old and new), writes nothing, takes no lock; a confirmed run writes once through 75_; every refusal writes nothing');
var demo = runWrapper(WRAP, { store: EDITORS, user: OWNER, rates: RATES, expected: 0, confirmFrom: true });
eq([demo.out.mode, demo.out.result.success, demo.out.result.doc_version, demo.t.set, demo.out.handler],
  ['COMMIT', true, 1, ['KM_FX_RATE_BOOK'], 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55'],
  'B2 the committed run: one write, doc_version 0 -> 1, and it reports the 75_ build it ran (compare with the get handler)');
var dryOnly = runWrapper(WRAP, { store: EDITORS, user: OWNER, rates: [], expected: 0, confirm: '' });
eq([dryOnly.out.stopped, dryOnly.t.set.length, dryOnly.t.lock], ['DRY_RUN_ONLY', 0, 0], 'B3 the file as shipped (no rates, no confirm) can only dry-run: no write, no lock');

console.log('\n=== K  THE CONFIRM STRING: SHA-256 OF EXACTLY WHAT IS SENT ===');
eq([oldDigest32(COLL_A), oldDigest32(COLL_B)], ['411273e5', '411273e5'],
  'K1 the counter-example is real: the first version’s 32-bit digest gave A (1.37) and B (1.38) the same 411273e5');
eq(collisionGate(WRAP), [], 'K2 now A and B have different confirm strings, each the SHA-256 of {doc_version, rates}; A’s confirm is refused for B; the version is bound too');
var shown = runWrapper(WRAP, { store: EDITORS, user: OWNER, rates: COLL_A, expected: 0, confirm: '' }).out.confirm_for_this_payload;
ok(/^SAVE doc_version 0 -> 1 sha256 [0-9a-f]{64}$/.test(shown), 'K3 the confirm string carries the full 64-hex SHA-256 (' + shown.slice(-12) + ')');

console.log('\n=== C  THE WRAPPER TEXT ===');
eq(textGate(WRAP), [], 'C1 no hand-written hash, no direct Property write, no commit helper, no deployer identity, no pricing; the digest and the save read one frozen payload');

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
var SAVE_LINE = "  var res = handleFxRateBookSave_({ payload: payload });";
mutant('M1', 'the confirm check is dropped: every run commits', scenarioGate,
  "  } else if (TEMP_FX_CONFIRM !== out.confirm_for_this_payload) {", "  } else if (false) {");
mutant('M2', 'the digest covers the rates but not the version', collisionGate,
  "TEMP_FxSha256Hex_(JSON.stringify(payload))", "TEMP_FxSha256Hex_(JSON.stringify(payload.rates))");
mutant('M3', 'the wrapper no longer checks the stored version itself', scenarioGate,
  "  if (typeof payload.doc_version !== 'number' || current.doc_version !== payload.doc_version) {", "  if (false) {");
mutant('M4', 'the wrapper writes the book itself instead of calling 75_', scenarioGate, SAVE_LINE,
  "  PropertiesService.getScriptProperties().setProperty('KM_FX_RATE_BOOK', JSON.stringify({ shape: 1, doc_version: 1, rates: payload.rates, log: [] }));\n  var res = { success: true, data: { doc_version: 1, change_log: [] }, errors: [] };");
mutant('M5', 'the wrapper falls back to the deployer when the caller is unreadable', scenarioGate,
  "  var io = fxBookDefaultIo_();", "  var io = fxBookDefaultIo_(); var u0 = io.user; io.user = function () { return u0() || Session.getEffectiveUser().getEmail(); };");
mutant('M6', 'the wrapper commits through the commit helper, skipping the lock', scenarioGate, SAVE_LINE,
  "  var cm = fxBookCommit_(io, { doc_version: current.doc_version + 1, rates: payload.rates, log: current.log });\n  var res = { success: cm.ok, data: { doc_version: current.doc_version + 1, change_log: [] }, errors: [] };");
mutant('M7', 'the wrapper skips its own authority stop', scenarioGate,
  "  if (!auth.ok) { out.stopped = 'AUTHORITY'; Logger.log(JSON.stringify(out)); return out; }", "");
mutant('M8', 'the wrapper skips its own validation stop', scenarioGate,
  "  } else if (!v.ok) {\n    out.stopped = 'INVALID';\n", "  } else if (false) {\n");
mutant('M9', 'a commit-ready confirm ships as the default', textGate,
  "var TEMP_FX_CONFIRM = '';", "var TEMP_FX_CONFIRM = 'SAVE doc_version 0 -> 1 sha256 x';");
mutant('M10', 'the wrapper calls the pricing reconcile after saving', textGate,
  "  Logger.log(JSON.stringify(out));\n  return out;\n}\n\n// Every field", "  handlePricingFxReconcile_({});\n  Logger.log(JSON.stringify(out));\n  return out;\n}\n\n// Every field");
mutant('M11', 'the 32-bit hand-written hash comes back', collisionGate,
  "  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);\n  return bytes.map(function (b) { var h = (b & 0xff).toString(16); return h.length === 1 ? '0' + h : h; }).join('');",
  "  var s = text, h = 2166136261;\n  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }\n  return ('00000000' + h.toString(16)).slice(-8);");
mutant('M12', 'a weaker digest (SHA-1)', collisionGate,
  "Utilities.DigestAlgorithm.SHA_256", "Utilities.DigestAlgorithm.SHA_1");
mutant('M13', 'the hex conversion drops the sign fix, so negative bytes print wrong', collisionGate,
  "var h = (b & 0xff).toString(16);", "var h = b.toString(16);");
mutant('M14', 'the listing drops the version field', scenarioGate,
  "    version: e.version };", "    version: undefined };");
mutant('M15', 'the change listing drops the old entry', scenarioGate,
  "      old: oldBy[r.pair] ? TEMP_FxEntryView_(oldBy[r.pair]) : null,", "      old: null,");
mutant('M16', 'the save sends the live constant, not the frozen payload that was digested', textGate, SAVE_LINE,
  "  var res = handleFxRateBookSave_({ payload: { doc_version: TEMP_FX_EXPECTED_DOC_VERSION, rates: TEMP_FX_RATES } });");
eq(survived, 0, 'M  0 mutants survived (' + caught + ' caught)');
eq(vacuous, 0, 'M  0 vacuous');

console.log('\nFX-AUTH-R2 EDITOR SAVE PATH — passed ' + pass + '  failed ' + fail + '  |  mutants caught ' + caught + '  survived ' + survived + '  vacuous ' + vacuous);
process.exitCode = fail ? 1 : 0;
