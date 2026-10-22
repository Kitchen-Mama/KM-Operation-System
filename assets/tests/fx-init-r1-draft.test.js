// FX-INIT-R1 — the DRAFT initialisation payload: reproduced from the official source, valid under the real
// 75_, and dry-run through the frozen Editor tool with zero writes.
// Run: node assets/tests/fx-init-r1-draft.test.js
//
// OFFLINE ONLY. Nothing here reaches a deployment, a Script Property or a price.
//
//   S  the source: the saved ECB file holds the five legs the draft names, for the date it names
//   R  the rates: each one re-derived from those legs by exact decimal arithmetic, half-up to 6 places
//   P  the payload: exactly USD>AUD/CAD/EUR/GBP/JPY, once each, version 1, active, open-ended; the paste
//      block and the JSON are the same entries in the same key order
//   V  the real 73_ + 75_ accept it; the frozen tool's DRY RUN lists 5 ADDED, writes nothing, takes no lock,
//      and prints the confirm string predicted here; an in-memory commit fits the 8 KB book
//   T  the tool is unchanged since FX-AUTH-R2-R1 and still ships empty
//   M  mutants of the draft, each caught
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var DIR = 'docs/planning/fx-init-r1/';
var TOOL_REL = 'docs/planning/fx-auth-r2/TEMP_FxRateBookEditorSave.gs.txt';
var TOOL_FROZEN_AT = 'b6ef4008';
var OWNER = 'vic.zhou@shopkitchenmama.com';
var PAIRS = ['AUD', 'CAD', 'EUR', 'GBP', 'JPY'];
var pass = 0, fail = 0;
function ok(c, l, x) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.log('FAIL ' + l + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } }
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
var TOOL = read(TOOL_REL);
var XML = read('docs/evidence/fx-init-r1/ecb-eurofxref-daily-2026-10-21.xml');
var DRAFT = JSON.parse(read(DIR + 'fx-rate-book-init-draft-r1.json'));
var PASTE = read(DIR + 'TEMP_FX_RATES.draft-r1.js.txt');

function evalPaste(src) {
  var c = {}; vm.createContext(c);
  vm.runInContext(src + '\n;__v = TEMP_FX_EXPECTED_DOC_VERSION; __r = TEMP_FX_RATES;', c);
  return { version: c.__v, rates: JSON.parse(JSON.stringify(c.__r)) };
}
function ecbLegs(xml) {
  var day = (xml.match(/<Cube time='(\d{4}-\d{2}-\d{2})'>/) || [])[1] || null;
  var legs = {};
  xml.replace(/<Cube currency='([A-Z]{3})' rate='([0-9.]+)'\/>/g, function (_m, c, r) { legs[c] = r; return _m; });
  return { day: day, legs: legs, sender: /<gesmes:name>European Central Bank<\/gesmes:name>/.test(xml) };
}
/* Exact decimal division of two published decimal STRINGS, rounded half-up to dp places. No floats. */
function div(a, b, dp) {
  function sc(s) { var p = String(s).split('.'); var f = p[1] || ''; return [BigInt(p[0] + f), f.length]; }
  var A = sc(a), B = sc(b);
  var num = A[0] * (10n ** BigInt(B[1])) * (10n ** BigInt(dp + 1)), den = B[0] * (10n ** BigInt(A[1]));
  var q = (num / den + 5n) / 10n, s = q.toString().padStart(dp + 1, '0');
  return Number(s.slice(0, -dp) + '.' + s.slice(-dp));
}
function sha256Hex(s) { return crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex'); }
function predictedConfirm(v, rates) {
  return 'SAVE doc_version ' + v + ' -> ' + (v + 1) + ' sha256 ' + sha256Hex(JSON.stringify({ doc_version: v, rates: rates }));
}

/* ONE RUN OF THE FROZEN TOOL, AS THE EDITOR WOULD RUN IT, over an in-memory Script Properties store. */
function runTool(rates, version, confirm, store0) {
  var store = JSON.parse(JSON.stringify(store0 || { KM_FX_RATE_BOOK_EDITORS: OWNER }));
  var t = { set: [], lock: 0, other: [] };
  function trap(name) {
    return new Proxy(function () {}, { get: function (_x, k) { t.other.push(name + '.' + String(k)); throw new Error('TRAP ' + name); },
      apply: function () { t.other.push(name + '()'); throw new Error('TRAP ' + name); } });
  }
  var ctx = {
    console: { log: function () {} }, JSON: JSON, Math: Math, Object: Object, String: String, Number: Number, Array: Array, Date: Date, isFinite: isFinite,
    PropertiesService: { getScriptProperties: function () { return {
      getProperty: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setProperty: function (k, v) { t.set.push(k); store[k] = String(v); },
      getProperties: function () { t.other.push('getProperties'); throw new Error('TRAP'); },
      deleteProperty: function () { t.other.push('deleteProperty'); throw new Error('TRAP'); }
    }; } },
    Session: {
      getActiveUser: function () { return { getEmail: function () { return OWNER; } }; },
      getEffectiveUser: function () { t.other.push('getEffectiveUser'); throw new Error('TRAP'); },
      getScriptTimeZone: function () { return 'Asia/Taipei'; }
    },
    LockService: { getScriptLock: function () { return {
      tryLock: function () { t.lock++; return true; }, waitLock: function () { t.lock++; }, releaseLock: function () {} }; } },
    Logger: { log: function () {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: function (alg, text, cs) {
        if (alg !== 'SHA_256' || cs !== 'UTF_8') throw new Error('TRAP digest');
        return Array.prototype.map.call(crypto.createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest(),
          function (b) { return b > 127 ? b - 256 : b; });
      }
    }
  };
  ['SpreadsheetApp', 'ScriptApp', 'UrlFetchApp', 'DriveApp', 'MailApp', 'GmailApp', 'Sheets', 'CacheService']
    .forEach(function (g) { ctx[g] = trap(g); });
  vm.createContext(ctx);
  vm.runInContext(REUSED + '\n' + SRC75 + '\n' + TOOL, ctx);
  ctx.__r = rates; ctx.__v = version; ctx.__c = confirm;
  vm.runInContext('TEMP_FX_RATES = __r; TEMP_FX_EXPECTED_DOC_VERSION = __v; TEMP_FX_CONFIRM = __c;', ctx);
  var out = JSON.parse(JSON.stringify(vm.runInContext('TEMP_FxRateBookEditorSave()', ctx)));
  var bytes = vm.runInContext('fxBookByteLen_', ctx)(store.KM_FX_RATE_BOOK || '');
  return { out: out, t: t, store: store, bytes: bytes };
}

/* THE GATE — every claim about the draft, as a list of violations. */
function draftGate(d, pasteSrc, xml) {
  var v = [];
  var src = ecbLegs(xml);
  var s = d._source || {};
  if (!src.sender) v.push('S_NOT_ECB_FILE');
  if (src.day !== s.published_for) v.push('S_DAY ' + src.day + ' vs ' + s.published_for);
  ['USD'].concat(PAIRS.filter(function (q) { return q !== 'EUR'; })).forEach(function (c) {
    if ((s.legs_as_published || {})['EUR>' + c] !== src.legs[c]) v.push('S_LEG_' + c);
  });
  var legUsd = src.legs.USD;
  var rates = d.rates || [];
  if (d.doc_version !== 0) v.push('P_DOC_VERSION');
  var seen = rates.map(function (e) { return e.base_currency + '>' + e.quote_currency; });
  if (JSON.stringify(seen) !== JSON.stringify(PAIRS.map(function (q) { return 'USD>' + q; }))) v.push('P_PAIRS ' + seen.join(','));
  var KEYS = 'base_currency,quote_currency,rate,source,as_of,effective_from,effective_to,status,version';
  rates.forEach(function (e) {
    var q = e.quote_currency;
    if (Object.keys(e).join(',') !== KEYS) v.push('P_KEYS_' + q);
    var want = q === 'EUR' ? div('1', legUsd, 6) : div(src.legs[q], legUsd, 6);
    if (e.rate !== want) v.push('R_RATE_' + q + ' ' + e.rate + ' want ' + want);
    var leg = q === 'EUR' ? '1' : src.legs[q];
    if (e.source !== 'ECB eurofxref-daily ' + src.day + ' (derived: ' + leg + ' / ' + legUsd + ')') v.push('R_SOURCE_' + q);
    if (e.as_of !== src.day) v.push('R_AS_OF_' + q);
    if (e.effective_from !== '2026-10-22' || e.effective_to !== '') v.push('P_PERIOD_' + q);
    if (e.status !== 'active') v.push('P_STATUS_' + q);
    if (e.version !== 1) v.push('P_VERSION_' + q);
  });
  var p;
  try { p = evalPaste(pasteSrc); } catch (err) { v.push('P_PASTE_LOAD ' + err.message); return v; }
  if (p.version !== d.doc_version) v.push('P_PASTE_VERSION');
  if (JSON.stringify(p.rates) !== JSON.stringify(rates)) v.push('P_PASTE_DIFFERS_FROM_JSON');
  if (/TEMP_FX_CONFIRM\s*=\s*'[^']/.test(pasteSrc) || /^var TEMP_FX_CONFIRM/m.test(pasteSrc)) v.push('P_PASTE_SETS_CONFIRM');
  return v;
}

/* ---- S / R / P ---- */
var base = draftGate(DRAFT, PASTE, XML);
ok(base.length === 0, 'S/R/P  the draft is reproduced from the saved ECB file and the paste block equals the JSON', base);
var src = ecbLegs(XML);
ok(src.day === '2026-10-21' && src.legs.USD === '1.1234', 'S  ECB file: published for 2026-10-21, EUR>USD 1.1234', src.day);

/* ---- V ---- */
var dry = runTool(DRAFT.rates, 0, '', null);
var o = dry.out;
var want = predictedConfirm(0, DRAFT.rates);
ok(o.authority.ok === true && o.authority.user === OWNER, 'V1 authority: the Owner, as on the Editor diagnostic', o.authority);
ok(o.valid === true && o.errors.length === 0, 'V2 the real 73_ + 75_ validation accepts all five', o.errors);
ok(o.stopped === 'DRY_RUN_ONLY' && o.mode === 'DRY_RUN', 'V3 the empty confirm stops at DRY_RUN_ONLY', o.stopped);
ok(dry.t.set.length === 0 && dry.t.lock === 0 && dry.t.other.length === 0, 'V4 the dry run: 0 writes, no lock, no trapped service', dry.t);
ok(o.changes.length === 5 && o.changes.every(function (c) { return c.change === 'ADDED' && c.old === null && c.new; }),
  'V5 five ADDED, each with no old entry and its full new entry', o.changes.map(function (c) { return c.change; }));
ok(JSON.stringify(o.payload_entries.map(function (e) { return e.pair + ' ' + e.rate; })) ===
  JSON.stringify(DRAFT.rates.map(function (e) { return e.base_currency + '>' + e.quote_currency + ' ' + e.rate; })),
  'V6 payload_entries list exactly the drafted pairs and rates', o.payload_entries);
ok(o.confirm_for_this_payload === want, 'V7 the dry run prints the confirm string predicted here', { got: o.confirm_for_this_payload, want: want });
console.log('     predicted confirm: ' + want);
// In-memory ONLY: the book this payload would become fits the 8 KB property. No production store is involved.
var mem = runTool(DRAFT.rates, 0, want, null);
ok(mem.out.mode === 'COMMIT' && mem.out.result.success === true && mem.out.result.doc_version === 1 && mem.bytes > 0 && mem.bytes < 8192,
  'V8 in-memory sandbox only: the resulting book is ' + mem.bytes + ' bytes, under the 8192 guard', mem.out.result);

/* ---- T ---- */
var toolDiff = '';
try { toolDiff = cp.execSync('git diff --name-only ' + TOOL_FROZEN_AT + ' -- ' + TOOL_REL, { cwd: ROOT, encoding: 'utf8' }).trim(); }
catch (e) { toolDiff = 'GIT ' + e.message; }
ok(toolDiff === '', 'T1 the Editor tool is unchanged since ' + TOOL_FROZEN_AT, toolDiff);
ok(/var TEMP_FX_CONFIRM = '';/.test(TOOL) && /var TEMP_FX_RATES = \[\s*(\/\/[^\n]*\n\s*)*\];/.test(TOOL) &&
  /var TEMP_FX_EXPECTED_DOC_VERSION = 0;/.test(TOOL), 'T2 the tool still ships with empty rates and an empty confirm');
var rel = '';
try { rel = cp.execSync('git ls-files -- "' + GS + '*fx-init*" "' + GS + '*TEMP_*"', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { rel = 'GIT ' + e.message; }
ok(rel === '', 'T3 no draft or temporary file is inside the Apps Script folder', rel);

/* ---- M ---- */
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function withRate(i, f) { var d = clone(DRAFT); f(d.rates[i], d); return d; }
var MUTANTS = [
  ['M1 a mistyped leg', function () { return [withRate(1, function (e) { e.rate = 1.404576; }), PASTE, XML]; }],
  ['M2 EUR stored as EUR>USD (inverted direction)', function () { return [withRate(2, function (e) { e.rate = 1.1234; }), PASTE, XML]; }],
  ['M3 truncated instead of half-up', function () { return [withRate(3, function (e) { e.rate = 0.746171; }), PASTE, XML]; }],
  ['M4 the previous ECB day (2026-10-16) reused', function () { return [withRate(0, function (e) { e.rate = 1.437039; }), PASTE, XML]; }],
  ['M5 version 2', function () { return [withRate(4, function (e) { e.version = 2; }), PASTE, XML]; }],
  ['M6 a sixth record', function () { var d = clone(DRAFT); d.rates.push(clone(d.rates[1])); return [d, PASTE, XML]; }],
  ['M7 as_of not the ECB day', function () { return [withRate(0, function (e) { e.as_of = '2026-10-22'; }), PASTE, XML]; }],
  ['M8 a closed effective period', function () { return [withRate(1, function (e) { e.effective_to = '2026-12-31'; }), PASTE, XML]; }],
  ['M9 the paste block differs from the JSON', function () { return [DRAFT, PASTE.replace('rate: 157.877871', 'rate: 157.87787'), XML]; }],
  ['M10 the paste block sets a confirm', function () { return [DRAFT, PASTE + "\nvar TEMP_FX_CONFIRM = 'SAVE doc_version 0 -> 1 sha256 x';\n", XML]; }],
  ['M11 the source says another day than the file', function () { return [DRAFT, PASTE, XML.replace("time='2026-10-21'", "time='2026-10-20'")]; }],
  ['M12 status blank', function () { return [withRate(2, function (e) { e.status = ''; }), PASTE, XML]; }]
];
var caught = 0;
MUTANTS.forEach(function (m) {
  var a = m[1](), r = draftGate(a[0], a[1], a[2]);
  if (r.length) caught++;
  ok(r.length > 0, m[0] + ' -> caught', r);
});
// M13: a key-order change keeps every value but changes the digest, so the predicted confirm must change.
var reordered = DRAFT.rates.map(function (e) { var x = {}; Object.keys(e).reverse().forEach(function (k) { x[k] = e[k]; }); return x; });
ok(predictedConfirm(0, reordered) !== want && draftGate(Object.assign(clone(DRAFT), { rates: reordered }), PASTE, XML).length > 0,
  'M13 a reordered entry changes the confirm string and is caught');
console.log('\n' + pass + ' passed, ' + fail + ' failed; mutants caught ' + (caught + 1) + '/' + (MUTANTS.length + 1));
process.exitCode = fail ? 1 : 0;
