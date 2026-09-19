// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R5-F2
// FIVE RESOLVERS, FIVE ANSWERS — NOW ONE
// Run: node assets/tests/fc-target-rule-consumer-parity-r2b-a2-r5-f2.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime. It drives the SAME fixture through every
// live consumer of fc_target_rules — the canonical JS module, the generated Apps Script bundle, procurement,
// Request Order and Inventory Replenishment — and requires them to agree.
//
// WHAT THE F1 AUDIT FOUND. Five resolvers, and no two implemented the same contract:
//
//   resolveTargetPct (supply planning)   ignored scope_type; first matching row won
//   procurementTargetRuleResolver_       ignored year, company, country AND marketplace;
//                                        never read a monthly column
//   _roTargetPct (Request Order)         ignored scope_type; first row won
//   targetPct (Inventory Replenishment)  ignored year; never read a monthly column;
//                                        compared the literal string `All`
//   getEffectiveTargetPct (FC Summary)   ignored company and country — and was DEAD CODE
//
// The consequence with the acceptance fixture Jan 91 … Dec 102: supply planning answered 93 for March while
// procurement and Inventory Replenishment answered 91 for every month, because `target_percentage` is the
// January alias. And the same `All` rule meant "everywhere" (supply planning), "nowhere" (IR, literal
// comparison) and "everywhere in this country" (procurement, marketplace ignored) simultaneously.
//
// The contract is FC_SUMMARY_SPEC.md §4.1, authorised in R2B-A2-R5-F2 as D1/D2/D3.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var MODULE_REL = 'assets/js/core/supply-planning-planning-demand.js';
var BUNDLE_REL = 'assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs';
var PROC_REL = 'assets/specs/active/apps-script/13_procurement_handlers.gs';
var WRITE_REL = 'assets/specs/active/apps-script/14_fc_write_handlers.gs';
var RO_REL = 'assets/js/pages/request-order.js';
var IR_REL = 'assets/js/pages/inventory-replenishment.js';
var FCS_REL = 'assets/js/pages/fc-summary.js';

var MODULE = read(MODULE_REL), BUNDLE = read(BUNDLE_REL), PROC = read(PROC_REL),
    WRITE = read(WRITE_REL), RO = read(RO_REL), IR = read(IR_REL), FCS = read(FCS_REL);

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) pass++; else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) pass++; else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 96 - n.length)).join('-')); }

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  var i = src.indexOf('(', start), p = 0;
  for (; i < src.length; i++) { if (src[i] === '(') p++; else if (src[i] === ')') { p--; if (p === 0) { i++; break; } } }
  var b = src.indexOf('{', i), d = 0;
  for (i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;[^\\S\\n]*(?:\\/\\/[^\\n]*)?\\r?\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
function codeOnly(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function swapSrc(src, a, b) {
  var n = src.replace(/\r\n/g, '\n');
  if (n.split(a).length - 1 !== 1) throw new Error('mutation anchor not unique: ' + a.slice(0, 90));
  return n.split(a).join(b);
}

// =================================================================================================
// THE ONE FIXTURE
// =================================================================================================
var SITE = { year: '2026', company: 'ResTW', country: 'US', marketplace: 'Amazon' };
function rule(scopeType, scopeId, months, over) {
  var r = {
    target_rule_id: 'TR-' + scopeType + '-' + String(scopeId).replace(/\W/g, ''),
    year: SITE.year, company: SITE.company, country: SITE.country, marketplace: SITE.marketplace,
    scope_type: scopeType, scope_id: scopeId,
    category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R',
    target_percentage: ''
  };
  ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].forEach(function (m) { r[m + '_pct'] = ''; });
  Object.keys(months || {}).forEach(function (k) { r[k] = months[k]; });
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
// The acceptance row: Jan 91 … Dec 102.
var ACCEPT_MONTHS = {};
['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].forEach(function (m, i) {
  ACCEPT_MONTHS[m + '_pct'] = 91 + i;
});
var R_SKU = rule('SKU', 'CO1100-R', ACCEPT_MONTHS);
var R_SERIES = rule('SERIES', 'CO1100', { mar_pct: 50 });
var R_CATEGORY = rule('CATEGORY', 'Electric Can Opener', { mar_pct: 10 });
var ALL_RULES = [R_SKU, R_SERIES, R_CATEGORY];

function req(over) {
  var r = { year: SITE.year, company: SITE.company, country: SITE.country, marketplace: SITE.marketplace,
    category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R', month: 3 };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}

// =================================================================================================
// FIVE RUNTIMES, ONE CALL SHAPE — each returns a percentage or null
// =================================================================================================
function loadModule(src) {
  var S = { module: { exports: {} }, console: console };
  S.window = undefined;
  vm.createContext(S);
  vm.runInContext(String(src), S);
  return S.module.exports;
}
// 1 — canonical JS source owner
function runCanonical(rules, request, mutated) {
  return loadModule(mutated || MODULE).resolveTargetRule(rules, request);
}
// 2 — the copy Apps Script actually executes, pulled out of the GENERATED bundle
function runBundle(rules, request) {
  var S = { console: console };
  vm.createContext(S);
  var code = [extractVar(BUNDLE, 'TR_SCOPE_TYPES_'), extractVar(BUNDLE, 'TR_PRECEDENCE_'),
    extractVar(BUNDLE, 'TR_RETIRED_IDENTITY_'), extractVar(BUNDLE, 'TR_DEFAULT_PCT_'),
    extractVar(BUNDLE, 'MONTH_ABBR'),
    extractFn(BUNDLE, 's'), extractFn(BUNDLE, 'U'), extractFn(BUNDLE, 'L'), extractFn(BUNDLE, 'num'),
    extractFn(BUNDLE, 'trScopeType'), extractFn(BUNDLE, 'trBusinessKey'),
    extractFn(BUNDLE, 'trMonthIndex'), extractFn(BUNDLE, 'trIdentityUsable'),
    extractFn(BUNDLE, 'resolveTargetRule')].join('\n');
  vm.runInContext(code, S);
  return S.resolveTargetRule(rules, request);
}
// 3 — procurement (Apps Script), through its KMPD global
function runProcurement(rules, request, mutatedProc) {
  var src = mutatedProc || PROC;
  var S = { console: console, KMPD: loadModule(MODULE) };
  vm.createContext(S);
  vm.runInContext(extractFn(src, 'procurementTargetPct_'), S);
  return { targetPct: S.procurementTargetPct_(rules, request) };
}
// 4 — Request Order (browser)
function runRequestOrder(rules, request, mutatedRo) {
  var src = mutatedRo || RO;
  var S = { console: console };
  S.window = { KM: { core: { planningDemand: loadModule(MODULE) },
    DB: { getFcTargetRules: function () { return rules.map(function (r) { return { raw: r }; }); } } } };
  vm.createContext(S);
  vm.runInContext([extractFn(src, '_roTargetRules_'), extractFn(src, '_roTargetAuthority_'),
    extractFn(src, '_roTargetPct')].join('\n'), S);
  return { targetPct: S._roTargetPct(
    { company: request.company, country: request.country, marketplace: request.marketplace,
      category: request.category, series: request.series, sku: request.sku },
    { idx: request.month - 1, year: request.year }) };
}
// 5 — Inventory Replenishment (browser)
function runInventoryReplenishment(rules, request, mutatedIr) {
  var src = mutatedIr || IR;
  var S = { console: console };
  S.window = { KM: { core: { planningDemand: loadModule(MODULE) } } };
  vm.createContext(S);
  vm.runInContext([extractFn(src, 'trRawRows'), extractFn(src, 'trAuthority'),
    extractFn(src, 'targetPct')].join('\n'), S);
  var ym = request.year + '-' + ('0' + request.month).slice(-2);
  return { targetPct: S.targetPct(rules.map(function (r) { return { raw: r }; }),
    { company: request.company, country: request.country, marketplace: request.marketplace,
      category: request.category, series: request.series, sku: request.sku }, ym) };
}

var CONSUMERS = [
  ['canonical JS source', runCanonical],
  ['generated AS bundle', runBundle],
  ['procurement', runProcurement],
  ['Request Order', runRequestOrder],
  ['Inventory Replen.', runInventoryReplenishment]
];
/** Every consumer's answer for one (rules, request). */
function allPct(rules, request) {
  return CONSUMERS.map(function (c) { return c[1](rules, request).targetPct; });
}
/** The one agreed answer, or the disagreement. */
function agreed(rules, request, label) {
  var v = allPct(rules, request);
  var same = v.every(function (x) { return JSON.stringify(x) === JSON.stringify(v[0]); });
  ok(same, label + ' — every consumer agrees', same ? undefined :
    CONSUMERS.map(function (c, i) { return c[0] + '=' + v[i]; }));
  return v[0];
}

// =================================================================================================
section('A. §6.1-6.9 — SITE IDENTITY AND PRECEDENCE, THROUGH EVERY CONSUMER');
// =================================================================================================
eq(agreed(ALL_RULES, req(), 'A1 §6.1/6.6 exact SKU rule, March'), 93,
  'A1b and the answer is 93 — the March column, not the January alias');
eq(agreed(ALL_RULES, req({ year: '2025' }), 'A2 §6.2 wrong year'), 100, 'A2b → default 100');
eq(agreed(ALL_RULES, req({ company: 'KM-EU' }), 'A3 §6.3 wrong company'), 100, 'A3b → default 100');
eq(agreed(ALL_RULES, req({ country: 'CA' }), 'A4 §6.4 wrong country'), 100, 'A4b → default 100');
eq(agreed(ALL_RULES, req({ marketplace: 'Walmart' }), 'A5 §6.5 wrong marketplace'), 100, 'A5b → default 100');
eq(agreed([R_SERIES, R_CATEGORY], req(), 'A6 §6.7 Series beats Category'), 50, 'A6b → 50');
eq(agreed([R_CATEGORY], req(), 'A7 §6.8 Category alone applies'), 10, 'A7b → 10');
eq(agreed([], req(), 'A8 §6.9 no rules'), 100, 'A8b → default 100');
eq(agreed([rule('SKU', 'SOMETHING-ELSE', { mar_pct: 7 })], req(), 'A9 §6.9 no scope match'), 100, 'A9b → 100');

// §6.10 — the same text under two scope types must not collide.
var COLLIDE = [
  rule('CATEGORY', 'CO1100', { mar_pct: 11 }, { category: 'CO1100' }),
  rule('SERIES', 'CO1100', { mar_pct: 22 })
];
eq(agreed(COLLIDE, req({ category: 'CO1100' }), 'A10 §6.10 same scope_id text, two scope types'), 22,
  'A10b SERIES wins on precedence; the CATEGORY row with identical text does not collide');

// =================================================================================================
section('B. §6.11-6.15 — BLANKS AND THE RETIRED SENTINEL ARE NOT WILDCARDS');
// =================================================================================================
['year', 'company', 'country', 'marketplace'].forEach(function (f, i) {
  var blanked = {}; blanked[f] = '';
  eq(agreed([rule('SKU', 'CO1100-R', ACCEPT_MONTHS, blanked)], req(), 'B' + (i + 1) + ' §6.1' + (i + 1) + ' blank ' + f + ' in the rule'),
    100, 'B' + (i + 1) + 'b blank ' + f + ' does not act as a wildcard');
});
['country', 'marketplace', 'company'].forEach(function (f, i) {
  var alled = {}; alled[f] = 'All';
  eq(agreed([rule('SKU', 'CO1100-R', ACCEPT_MONTHS, alled)], req(), 'B5.' + (i + 1) + ' §6.15 `All` as ' + f),
    100, 'B5.' + (i + 1) + 'b `All` is not a wildcard');
});
// and the REQUEST cannot smuggle one in either
eq(runCanonical(ALL_RULES, req({ company: '' })).reason, 'INVALID_REQUEST_IDENTITY',
  'B6 a blank requested company is a refusal, not a match-anything');
eq(runCanonical(ALL_RULES, req({ marketplace: 'All' })).reason, 'INVALID_REQUEST_IDENTITY',
  'B7 and `All` requested is refused too');

// =================================================================================================
section('C. §6.16-6.17 — DUPLICATES AND ROW ORDER');
// =================================================================================================
var DUP = [R_SKU, rule('SKU', 'CO1100-R', ACCEPT_MONTHS, { target_rule_id: 'TR-OTHER' })];
eq(runCanonical(DUP, req()).reason, 'DUPLICATE_TARGET_RULE_IDENTITY',
  'C1 §6.16 two rows with the same business key refuse');
eq(runBundle(DUP, req()).reason, 'DUPLICATE_TARGET_RULE_IDENTITY', 'C1b and the bundle copy refuses too');
eq(allPct(DUP, req()), [null, null, null, null, null],
  'C2 §6.16 every consumer answers null — a refusal is never 100');

eq(agreed(ALL_RULES.slice().reverse(), req(), 'C3 §6.17 reversed row order'), 93,
  'C3b identical result — row order is not load-bearing');
eq(agreed([R_CATEGORY, R_SKU, R_SERIES], req(), 'C4 §6.17 a third ordering'), 93, 'C4b still 93');

// =================================================================================================
section('D. §6.18-6.22 — MONTHS ARE READ BY NAME');
// =================================================================================================
eq(agreed(ALL_RULES, req({ month: 1 }), 'D1 §6.18 January'), 91, 'D1b jan_pct');
eq(agreed(ALL_RULES, req({ month: 3 }), 'D2 §6.19 March'), 93, 'D2b mar_pct');
eq(agreed(ALL_RULES, req({ month: 12 }), 'D3 §6.20 December'), 102, 'D3b dec_pct');
eq(agreed([rule('SKU', 'CO1100-R', { mar_pct: 0 })], req(), 'D4 §6.21 zero'), 0,
  'D4b 0 stays 0 — not converted to 100');
eq(agreed([rule('SKU', 'CO1100-R', {}, { target_percentage: 77 })], req(), 'D5 §6.22 only target_percentage'),
  100, 'D5b target_percentage cannot stand in for a month');
// the exact divergence the audit found, now closed
var pctByConsumer = CONSUMERS.map(function (c) { return c[1](ALL_RULES, req({ month: 3 })).targetPct; });
eq(pctByConsumer, [93, 93, 93, 93, 93],
  'D6 THE ACCEPTANCE ROW: March is 93 in all five. It was 93/93/91/93/91 before this round.');

// =================================================================================================
section('E. §6.23-6.24 — INDEPENDENT SITES AND YEARS COEXIST');
// =================================================================================================
var TWO_SITES = [
  R_SKU,
  rule('SKU', 'CO1100-R', { mar_pct: 44 }, { country: 'CA', target_rule_id: 'TR-CA' }),
  rule('SKU', 'CO1100-R', { mar_pct: 55 }, { year: '2025', target_rule_id: 'TR-2025' })
];
eq(agreed(TWO_SITES, req(), 'E1 §6.23 US/2026'), 93, 'E1b its own value');
eq(agreed(TWO_SITES, req({ country: 'CA' }), 'E2 §6.23 CA/2026'), 44, 'E2b its own value');
eq(agreed(TWO_SITES, req({ year: '2025' }), 'E3 §6.24 US/2025'), 55, 'E3b its own value');
ok(runCanonical(TWO_SITES, req()).reason === 'OK', 'E4 three rules for three sites are not duplicates');

// =================================================================================================
section('F. §6.25-6.29 — WRITE IDENTITY, against a fake sheet');
// =================================================================================================
function makeSheet(rows) {
  var headers = ['target_rule_id', 'company', 'country', 'marketplace', 'scope_type', 'scope_id',
    'year', 'category', 'series', 'sku', 'target_percentage',
    'jan_pct','feb_pct','mar_pct','apr_pct','may_pct','jun_pct','jul_pct','aug_pct','sep_pct','oct_pct','nov_pct','dec_pct',
    'note', 'created_by', 'created_at', 'updated_by', 'updated_at'];
  var data = [headers.slice()];
  (rows || []).forEach(function (o) { data.push(headers.map(function (h) { return o[h] === undefined ? '' : o[h]; })); });
  var sheet = {
    _d: data,
    getDataRange: function () { return { getValues: function () { return sheet._d.map(function (r) { return r.slice(); }); } }; },
    getLastColumn: function () { return headers.length; },
    appendRow: function (row) { sheet._d.push(row.slice()); },
    getRange: function (r, c, nr, nc) {
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < (nr || 1); i++) out.push(sheet._d[r - 1 + i].slice(c - 1, c - 1 + (nc || 1)));
          return out;
        },
        setValues: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            for (var j = 0; j < vals[i].length; j++) sheet._d[r - 1 + i][c - 1 + j] = vals[i][j];
          }
        },
        setValue: function (v) { sheet._d[r - 1][c - 1] = v; }
      };
    }
  };
  return { sheet: sheet, headers: headers };
}
var UUID_SEQ = 0;   // distinct ids per create — a fixed fake UUID made two rules collide
function runUpsert(existingRows, body, opts) {
  opts = opts || {};
  var made = makeSheet(existingRows);
  var responses = [];
  var locked = { held: false, tried: 0 };
  var S = {
    console: console,
    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return { getSheetByName: function () { return made.sheet; } }; },
      flush: function () {}
    },
    LockService: { getScriptLock: function () {
      return { tryLock: function () { locked.tried++; return opts.lockBusy ? false : (locked.held = true); },
               releaseLock: function () { locked.held = false; } };
    } },
    Utilities: { getUuid: function () { return 'u' + (++UUID_SEQ) + '00000000000000000000000000000000000'; },
                 formatDate: function () { return '2026-09-19 00:00:00'; } },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    jsonResponse_: function (o) { responses.push(o); return o; },
    fcWriteEnsureSheet_: function () { return made.sheet; },
    fcWriteEnsureColumns_: function () {},
    FC_SCHEMA_BY_NAME_: 'BY_NAME'
  };
  vm.createContext(S);
  var src = opts.mutateJs ? opts.mutateJs(WRITE) : WRITE;
  var code = [extractVar(src, 'FC_TARGET_RULES_HEADERS_'), extractVar(src, 'FC_TR_SCOPE_TYPES_'),
    extractVar(src, 'FC_TR_RETIRED_IDENTITY_'), extractVar(src, 'FC_TR_KEY_FIELDS_'),
    extractVar(src, 'FC_TR_LOCK_MS_'),
    // R2B-A2-R5-F5 — the write handler gained a version token and a read-back receipt, so its new
    // helpers join the sandbox. A fixed extraction list is a dependency declaration: when the handler
    // grows one, the list must say so, or the sandbox reports a ReferenceError as a product refusal.
    extractVar(src, 'FC_TR_MONTH_KEYS_'), extractVar(src, 'FC_TR_FINGERPRINT_FIELDS_'),
    extractVar(src, 'FC_TR_FINGERPRINT_NUMERIC_'),
    extractFn(src, 'fcTrNum_'), extractFn(src, 'fcTrFingerprint_'), extractFn(src, 'fcTrReceiptFor_'),
    extractFn(src, 'fcTrStr_'), extractFn(src, 'fcTrUp_'), extractFn(src, 'fcTrScopeType_'),
    extractFn(src, 'fcTrIdentityUsable_'), extractFn(src, 'fcTrBusinessKey_'),
    extractFn(src, 'fcTrScopeDimension_'), extractFn(src, 'fcTrValidateBody_'),
    extractFn(src, 'fcTrIndexRows_'), extractFn(src, 'fcWriteReadSheet_'),
    extractFn(src, 'fcWriteAppendByHeader_'), extractFn(src, 'fcWriteTimestamp_'),
    extractFn(src, 'handleUpsertFcTargetRule_')].join('\n');
  vm.runInContext(code, S);
  var res = S.handleUpsertFcTargetRule_(body);
  return { res: res, rows: made.sheet._d.slice(1), headers: made.headers, lock: locked };
}
function bodyOf(over) {
  var b = { year: 2026, company: 'ResTW', country: 'US', marketplace: 'Amazon',
    scope_type: 'SKU', scope_id: 'CO1100-R', category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R',
    actor: 'test' };
  Object.keys(ACCEPT_MONTHS).forEach(function (k) { b[k] = ACCEPT_MONTHS[k]; });
  Object.keys(over || {}).forEach(function (k) { b[k] = over[k]; });
  return b;
}
function rowObj(r, headers) { var o = {}; headers.forEach(function (h, i) { o[h] = r[i]; }); return o; }

// The server's OWN version token, in its own sandbox, so a test can compose an honest update. The
// handler's sandbox is built per call inside runUpsert and is not reachable from here.
var FP = vm.createContext({});
vm.runInContext([extractVar(WRITE, 'FC_TR_MONTH_KEYS_'), extractVar(WRITE, 'FC_TR_FINGERPRINT_FIELDS_'),
  extractVar(WRITE, 'FC_TR_FINGERPRINT_NUMERIC_'), extractFn(WRITE, 'fcTrStr_'),
  extractFn(WRITE, 'fcTrNum_'), extractFn(WRITE, 'fcTrFingerprint_')].join(String.fromCharCode(10)), FP);
function versionOf(row) { return FP.fcTrFingerprint_(row); }

var f25a = runUpsert([], bodyOf());
ok(f25a.res.success, 'F1 a first save creates', f25a.res);
eq(f25a.rows.length, 1, 'F1b one row');
var id1 = f25a.res.data.target_rule_id;
ok(!!id1, 'F1c and returns its target_rule_id');
eq(f25a.res.data.business_key, '2026|RESTW|US|AMAZON|SKU|CO1100-R', 'F1d and the canonical business key');

// §6.25 — same canonical identity, saved again, must update the same row rather than append a twin.
//
// R2B-A2-R5-F5 CHANGED WHAT THAT SAVE MUST CARRY. An update now names the version it was composed
// against, because the page that sends one without a version is by definition a page that never read
// the stored row — and that is exactly the page which flattens Jan 110 to 100. The claim below is
// unchanged (one row, same id); what moved is that it must be asked for honestly.
var existing1 = rowObj(f25a.rows[0], f25a.headers);
var ver1 = versionOf(existing1);
var f25bNoVersion = runUpsert([existing1], bodyOf({ mar_pct: 77 }));
eq(f25bNoVersion.res.success, false, 'F2pre a save with NO version over an existing row is REFUSED');
eq(f25bNoVersion.res.error, 'STALE_TARGET_RULE_VERSION', 'F2pre1 as a stale write');
eq(f25bNoVersion.rows.length, 1, 'F2pre2 and the stored row is untouched');
var f25b = runUpsert([existing1], bodyOf({ mar_pct: 77, expected_row_version: ver1 }));
ok(f25b.res.success, 'F2 §6.25 the same identity saved again, with its version, succeeds', f25b.res);
eq(f25b.rows.length, 1, 'F2b still ONE row — the old writer appended a duplicate here');
eq(f25b.res.data.target_rule_id, id1, 'F2c and keeps the same target_rule_id');
eq(f25b.res.data.created, false, 'F2d reported as an update');
eq(rowObj(f25b.rows[0], f25b.headers).mar_pct, 77, 'F2e with the new March value');
eq(rowObj(f25b.rows[0], f25b.headers).created_at, existing1.created_at, 'F2f created_at preserved');

// §6.26 — a different business key creates a second rule.
var f26 = runUpsert([existing1], bodyOf({ country: 'CA' }));
ok(f26.res.success, 'F3 §6.26 a different country is a different rule');
eq(f26.rows.length, 2, 'F3b so a second row is created');
ok(f26.res.data.target_rule_id !== id1, 'F3c with its own id');

// §6.27 — an id whose stored identity differs performs zero writes.
var f27 = runUpsert([existing1], bodyOf({ country: 'CA', target_rule_id: id1 }));
eq(f27.res.success, false, 'F4 §6.27 id/identity mismatch refuses');
eq(f27.res.error, 'TARGET_RULE_IDENTITY_MISMATCH', 'F4b with the canonical code');
eq(f27.rows.length, 1, 'F4c and writes NOTHING');
eq(rowObj(f27.rows[0], f27.headers).country, 'US', 'F4d the existing row is untouched');

// §6.29 — duplicates already in the sheet: zero writes.
var f29 = runUpsert([existing1, rowObj(f26.rows[0], f26.headers)].map(function (o, i) {
  return i === 1 ? Object.assign({}, o, { country: 'US', target_rule_id: 'TR-DUP' }) : o;
}), bodyOf({ mar_pct: 5 }));
eq(f29.res.success, false, 'F5 §6.29 two rows already share the identity');
eq(f29.res.error, 'DUPLICATE_TARGET_RULE_IDENTITY', 'F5b refused by name');
eq(f29.rows.filter(function (r) { return String(r[13 + 9]) === '5'; }).length, 0, 'F5c nothing was written');

// §6.28 — the lock is real.
var f28 = runUpsert([], bodyOf(), { lockBusy: true });
eq(f28.res.success, false, 'F6 §6.28 a busy lock refuses rather than racing');
eq(f28.res.error, 'TARGET_RULE_LOCK_TIMEOUT', 'F6b by name');
eq(f28.rows.length, 0, 'F6c with zero rows written');
ok(runUpsert([], bodyOf()).lock.tried > 0, 'F6d and the happy path really does take the lock');

// identity validation at the door
[['company', ''], ['country', ''], ['marketplace', ''], ['year', ''],
 ['company', 'All'], ['marketplace', 'All']].forEach(function (p, i) {
  var o = {}; o[p[0]] = p[1];
  var r = runUpsert([], bodyOf(o));
  eq(r.res.success, false, 'F7.' + (i + 1) + ' ' + p[0] + '="' + p[1] + '" refuses');
  eq(r.rows.length, 0, 'F7.' + (i + 1) + 'b with zero writes');
});
var fScope = runUpsert([], bodyOf({ scope_type: 'Nonsense' }));
eq(fScope.res.error, 'TARGET_RULE_SCOPE_TYPE_INVALID', 'F8 an unknown scope_type refuses');
var fLower = runUpsert([], bodyOf({ scope_type: 'sku' }));
ok(fLower.res.success, 'F9 lowercase `sku` is accepted through the one mapping');
eq(rowObj(fLower.rows[0], fLower.headers).scope_type, 'SKU', 'F9b and persisted UPPERCASE');

// =================================================================================================
section('G. §6.30 / §3 — ONE IMPLEMENTATION, NOT FIVE COPIES');
// =================================================================================================
// the generated bundle is the source owner's bytes
function fnOf(src, n) { return extractFn(src, n).replace(/\r\n/g, '\n'); }
['resolveTargetRule', 'trScopeType', 'trBusinessKey', 'trMonthIndex', 'trIdentityUsable'].forEach(function (f, i) {
  eq(fnOf(BUNDLE, f), fnOf(MODULE, f), 'G1.' + (i + 1) + ' the generated bundle carries the source owner\'s ' + f + ' verbatim');
});
// no consumer restates the matching logic
var PROC_CODE = codeOnly(PROC), RO_CODE = codeOnly(RO), IR_CODE = codeOnly(IR), FCS_CODE = codeOnly(FCS);
eq(PROC_CODE.indexOf('procurementTargetRuleResolver_'), -1, 'G2 procurement\'s own resolver is gone');
ok(PROC_CODE.indexOf('KMPD.resolveTargetRule') > -1, 'G2b it calls the canonical authority');
ok(RO_CODE.indexOf('resolveTargetRule') > -1, 'G3 Request Order calls the canonical authority');
ok(IR_CODE.indexOf('resolveTargetRule') > -1, 'G4 Inventory Replenishment calls it too');
// the dead FC Summary chain is gone
['getEffectiveTargetPct', 'getEffectiveFcSafe', 'calculateEffectiveFC', 'determineRuleSource'].forEach(function (f, i) {
  eq(FCS.indexOf('function ' + f + '('), -1, 'G5.' + (i + 1) + ' ' + f + ' is removed');
  eq(FCS.indexOf(f + '('), -1, 'G5.' + (i + 1) + 'b and nothing calls it');
});
// Nobody keeps a private `All` comparison IN THE TARGET RULE CODE. Scoped to those functions: `All` is a
// legitimate label elsewhere on these pages (a filter's "select everything" option), and a page-wide scan
// would either fail on unrelated code or have to be weakened until it caught nothing.
function trCodeOf(src, names) {
  return codeOnly(names.map(function (n) { return extractFn(src, n); }).join('\n'));
}
var TR_CODE = [
  ['PROC', trCodeOf(PROC, ['procurementTargetRuleRows_', 'procurementTargetPct_', 'procurementForecastNext3Map_'])],
  ['RO', trCodeOf(RO, ['_roTargetRules_', '_roTargetAuthority_', '_roTargetPct', '_roCommonMonthlyPct_'])],
  ['IR', trCodeOf(IR, ['trRawRows', 'trAuthority', 'targetPct', '_irForecastPlanning2mo'])],
  ['FCS', trCodeOf(FCS, ['_trBuildPayload_', '_trGate_', '_trCommonMonthlyPct_'])]
];
TR_CODE.forEach(function (p, i) {
  eq(/'ALL'|'All'/.test(p[1]), false, 'G6.' + (i + 1) + ' ' + p[0] + ' Target Rule code holds no `All` comparison');
});
// And no consumer RESOLVES through target_percentage. It is authored (by the two writers, outside the
// functions scanned here) and never read as a runtime value.
[['PROC', trCodeOf(PROC, ['procurementTargetPct_', 'procurementForecastNext3Map_'])],
 ['RO', trCodeOf(RO, ['_roTargetPct'])],
 ['IR', trCodeOf(IR, ['targetPct', '_irForecastPlanning2mo'])]].forEach(function (p, i) {
  eq(/target_percentage|targetPercentage/.test(p[1]), false,
    'G6b.' + (i + 1) + ' ' + p[0] + ' resolution never reads target_percentage');
});
// the browser can actually reach the authority
var INDEX = read('index.html');
ok(/supply-planning-planning-demand\.js/.test(INDEX),
  'G7 index.html loads the canonical resolver — the browser had no copy at all before this round');
ok(/supply-planning-planning-demand\.js[^"]*"\s+defer/.test(INDEX), 'G7b deferred like every other page script');

// =================================================================================================
section('H. MUTANTS');
// =================================================================================================
var mutants = [];
function mut(label, fn) { mutants.push({ label: label, correct: fn }); }
function modMut(from, to) { return function () { return swapSrc(MODULE, from, to); }; }

mut('M1  year is ignored', function () {
  var m = swapSrc(MODULE, "      if (U(r.year) !== U(req.year)) continue;", "      if (false) continue;");
  return runCanonical(ALL_RULES, req({ year: '2025' }), m).targetPct === 100;
});
mut('M2  company is ignored', function () {
  var m = swapSrc(MODULE, "      if (U(r.company) !== U(req.company)) continue;", "      if (false) continue;");
  return runCanonical(ALL_RULES, req({ company: 'KM-EU' }), m).targetPct === 100;
});
mut('M3  country is ignored', function () {
  var m = swapSrc(MODULE, "      if (U(r.country) !== U(req.country)) continue;", "      if (false) continue;");
  return runCanonical(ALL_RULES, req({ country: 'CA' }), m).targetPct === 100;
});
mut('M4  marketplace is ignored', function () {
  var m = swapSrc(MODULE, "      if (U(r.marketplace) !== U(req.marketplace)) continue;", "      if (false) continue;");
  return runCanonical(ALL_RULES, req({ marketplace: 'Walmart' }), m).targetPct === 100;
});
// A SERIES rule whose scope_id is a SKU string. Correct: it matches nothing, because scope_id is compared
// against its OWN dimension. Ignore scope_type and it matches the SKU request.
var CROSS_DIM = [rule('SERIES', 'CO1100-R', { mar_pct: 66 }, { series: 'CO1100-R' })];
mut('M5  scope_id is matched against ANY dimension instead of its own', function () {
  var m = swapSrc(MODULE,
    "      var want = wantDim[st];\n      if (!want || U(sid) !== U(want)) continue;",
    "      var want = wantDim[st];\n      if (U(sid) !== U(req.sku) && U(sid) !== U(req.series) && U(sid) !== U(req.category)) continue;");
  return runCanonical(CROSS_DIM, req(), m).targetPct === 100;
});
mut('M6  first-row-wins is restored', function () {
  var m = swapSrc(MODULE,
    "    for (var p = 0; p < TR_PRECEDENCE_.length; p++) {\n      for (var c = 0; c < candidates.length; c++) {\n        if (candidates[c].scopeType === TR_PRECEDENCE_[p]) {",
    "    for (var p = 0; p < 1; p++) {\n      for (var c = 0; c < candidates.length; c++) {\n        if (true) {");
  // correct = order-independent
  return runCanonical(ALL_RULES.slice().reverse(), req(), m).targetPct === 93;
});
mut('M7  SKU/Series precedence is reversed', function () {
  var m = swapSrc(MODULE, "  var TR_PRECEDENCE_ = ['SKU', 'SERIES', 'CATEGORY'];",
    "  var TR_PRECEDENCE_ = ['SERIES', 'SKU', 'CATEGORY'];");
  return runCanonical(ALL_RULES, req(), m).targetPct === 93;
});
// On the RULE side, blank and `All` are already rejected by exact matching — U('All') !== U('Amazon') — so
// mutating trIdentityUsable there changes no answer. That is defence in depth, not a gap. The guards are
// load-bearing in two other places, and that is where these mutants aim:
//   the WRITE path, which must refuse to PERSIST such a row at all; and
//   the resolver's REQUEST validation, which must refuse to resolve against an unusable request.
mut('M8  the write path accepts a blank required identity', function () {
  var r = runUpsert([], bodyOf({ company: '' }), { mutateJs: function (js) {
    return swapSrc(js, "var FC_TR_KEY_FIELDS_ = ['year', 'company', 'country', 'marketplace'];",
      "var FC_TR_KEY_FIELDS_ = [];"); } });
  return r.res.success === false && r.rows.length === 0;
});
mut('M9  the write path accepts the retired `All` sentinel', function () {
  var r = runUpsert([], bodyOf({ marketplace: 'All' }), { mutateJs: function (js) {
    return swapSrc(js, "var FC_TR_RETIRED_IDENTITY_ = 'ALL';", "var FC_TR_RETIRED_IDENTITY_ = '\\u0000NEVER';"); } });
  return r.res.success === false && r.rows.length === 0;
});
mut('M9b  the resolver stops validating the REQUEST identity', function () {
  var m = swapSrc(MODULE,
    "    if (!trIdentityUsable(req.year) || !trIdentityUsable(req.company)\n      || !trIdentityUsable(req.country) || !trIdentityUsable(req.marketplace)) {",
    "    if (false) {");
  return runCanonical(ALL_RULES, req({ company: '' }), m).reason === 'INVALID_REQUEST_IDENTITY';
});
mut('M10  target_percentage is substituted for the month', function () {
  var m = swapSrc(MODULE, "      var raw = r[monthColumn];", "      var raw = (r[monthColumn] === '' || r[monthColumn] == null) ? r.target_percentage : r[monthColumn];");
  return runCanonical([rule('SKU', 'CO1100-R', {}, { target_percentage: 77 })], req(), m).targetPct === 100;
});
mut('M11  0 becomes 100', function () {
  var m = swapSrc(MODULE, "      if (pct === null) continue;", "      if (!pct) continue;");
  return runCanonical([rule('SKU', 'CO1100-R', { mar_pct: 0 })], req(), m).targetPct === 0;
});
mut('M12  the month is looked up by position', function () {
  var m = swapSrc(MODULE, "    var monthColumn = MONTH_ABBR[mi] + '_pct';", "    var monthColumn = MONTH_ABBR[(mi + 1) % 12] + '_pct';");
  return runCanonical(ALL_RULES, req({ month: 3 }), m).targetPct === 93;
});
mut('M13  a duplicate is silently selected', function () {
  var m = swapSrc(MODULE, "      if (seen[candidates[d].key]) return answer('DUPLICATE_TARGET_RULE_IDENTITY', null, null);",
    "      if (false) return answer('DUPLICATE_TARGET_RULE_IDENTITY', null, null);");
  return runCanonical(DUP, req(), m).reason === 'DUPLICATE_TARGET_RULE_IDENTITY';
});
mut('M14  the write lock is removed', function () {
  var r = runUpsert([], bodyOf(), { lockBusy: true, mutateJs: function (js) {
    return swapSrc(js, "    if (!lock.tryLock(FC_TR_LOCK_MS_)) {", "    if (false) {"); } });
  return r.res.success === false && r.res.error === 'TARGET_RULE_LOCK_TIMEOUT';
});
mut('M15  the business-key lookup is removed from the create path', function () {
  var r = runUpsert([existing1], bodyOf({ mar_pct: 77 }), { mutateJs: function (js) {
    return swapSrc(js, "      if (byKey.length === 1) { targetRow = byKey[0].rowNumber; ruleId = byKey[0].id; }",
      "      if (false) { targetRow = byKey[0].rowNumber; ruleId = byKey[0].id; }"); } });
  return r.rows.length === 1;                       // correct = updated in place, still one row
});
mut('M16  an id with a different identity is accepted', function () {
  var r = runUpsert([existing1], bodyOf({ country: 'CA', target_rule_id: id1 }), { mutateJs: function (js) {
    return swapSrc(js, "      if (byId[0].key !== v.key) {", "      if (false) {"); } });
  return r.res.success === false && r.res.error === 'TARGET_RULE_IDENTITY_MISMATCH';
});
// THE STALE-BUNDLE MUTANT. The bundle is generated, so "someone edited the source and did not re-run the
// builder" is the real hazard. Simulated by changing the MODULE and asking whether the parity check still
// reports a match — it must not.
mut('M17  the source owner changed and the generated bundle was not regenerated', function () {
  var m = swapSrc(MODULE, "  var TR_DEFAULT_PCT_ = 100;", "  var TR_DEFAULT_PCT_ = 99;");
  var mm = loadModule(m);
  // correct = source and shipped bundle AGREE. Under a stale bundle they do not, which is the catch.
  return mm.resolveTargetRule([], req()).targetPct === runBundle([], req()).targetPct;
});
mut('M18  the frontend omits company from the payload', function () {
  // the gate is in fc-summary.js; the server is the backstop. Mutate the FRONTEND builder and require
  // that the write still refuses, so neither layer alone is trusted.
  var built = swapSrc(FCS, "    company: g.company,\n    country: g.sel.country,", "    company: '',\n    country: g.sel.country,");
  var has = /\n    company: g\.company,/.test(built);
  var r = runUpsert([], bodyOf({ company: '' }));
  // correct = BOTH layers hold: the frontend really does send the derived company, AND the server refuses
  // a blank one anyway. The mutant removes the first, so this goes false.
  return has && r.res.success === false && r.rows.length === 0;
});
mut('M19  scope_id is allowed to disagree with its own column', function () {
  var r = runUpsert([], bodyOf({ scope_id: 'SOMETHING-ELSE' }), { mutateJs: function (js) {
    return swapSrc(js, "  if (dim && fcTrUp_(dim) !== fcTrUp_(b.scope_id)) {", "  if (false) {"); } });
  return r.res.success === false && r.res.error === 'TARGET_RULE_SCOPE_ID_MISMATCH';
});
mut('M20  a consumer stops calling the authority and resolves locally', function () {
  var m = swapSrc(PROC, "  return KMPD.resolveTargetRule(ruleRows, req).targetPct;",
    "  return 100;   // local approximation");
  // correct = procurement's answer still comes from the authority, so the local approximation is visible
  return runProcurement(ALL_RULES, req(), m).targetPct === 93;
});

var caught = 0, survived = [];
mutants.forEach(function (m) {
  var correct;
  try { correct = !!m.correct(); }
  catch (e) { correct = false; console.error('   (' + m.label + ' threw: ' + e.message + ')'); }
  if (!correct) { caught++; console.log('ok   ' + m.label + ' (caught)'); }
  else { survived.push(m.label); console.error('FAIL ' + m.label + ' — MUTANT SURVIVED'); fail++; }
});

// =================================================================================================
section('I. VACUITY');
// =================================================================================================
var vacuous = [];
[['M1', function () { return runCanonical(ALL_RULES, req({ year: '2025' })).targetPct === 100; }],
 ['M2', function () { return runCanonical(ALL_RULES, req({ company: 'KM-EU' })).targetPct === 100; }],
 ['M3', function () { return runCanonical(ALL_RULES, req({ country: 'CA' })).targetPct === 100; }],
 ['M4', function () { return runCanonical(ALL_RULES, req({ marketplace: 'Walmart' })).targetPct === 100; }],
 ['M5', function () { return runCanonical(COLLIDE, req({ category: 'CO1100' })).targetPct === 22; }],
 ['M6', function () { return runCanonical(ALL_RULES.slice().reverse(), req()).targetPct === 93; }],
 ['M7', function () { return runCanonical(ALL_RULES, req()).targetPct === 93; }],
 ['M5', function () { return runCanonical(CROSS_DIM, req()).targetPct === 100; }],
 ['M8', function () { var r = runUpsert([], bodyOf({ company: '' })); return r.res.success === false && r.rows.length === 0; }],
 ['M9', function () { var r = runUpsert([], bodyOf({ marketplace: 'All' })); return r.res.success === false && r.rows.length === 0; }],
 ['M9b', function () { return runCanonical(ALL_RULES, req({ company: '' })).reason === 'INVALID_REQUEST_IDENTITY'; }],
 ['M17', function () { return fnOf(BUNDLE, 'resolveTargetRule') === fnOf(MODULE, 'resolveTargetRule'); }],
 ['M20', function () { return runProcurement(ALL_RULES, req()).targetPct === 93; }],
 ['M10', function () { return runCanonical([rule('SKU','CO1100-R',{},{target_percentage:77})], req()).targetPct === 100; }],
 ['M11', function () { return runCanonical([rule('SKU','CO1100-R',{mar_pct:0})], req()).targetPct === 0; }],
 ['M12', function () { return runCanonical(ALL_RULES, req({ month: 3 })).targetPct === 93; }],
 ['M13', function () { return runCanonical(DUP, req()).reason === 'DUPLICATE_TARGET_RULE_IDENTITY'; }],
 ['M14', function () { var r = runUpsert([], bodyOf(), { lockBusy: true });
    return r.res.success === false && r.res.error === 'TARGET_RULE_LOCK_TIMEOUT'; }],
 ['M15', function () { return runUpsert([existing1], bodyOf({ mar_pct: 77 })).rows.length === 1; }],
 ['M16', function () { var r = runUpsert([existing1], bodyOf({ country: 'CA', target_rule_id: id1 }));
    return r.res.success === false && r.res.error === 'TARGET_RULE_IDENTITY_MISMATCH'; }],
 ['M19', function () { var r = runUpsert([], bodyOf({ scope_id: 'SOMETHING-ELSE' }));
    return r.res.success === false && r.res.error === 'TARGET_RULE_SCOPE_ID_MISMATCH'; }]
].forEach(function (p) {
  var held; try { held = !!p[1](); } catch (e) { held = false; }
  if (!held) vacuous.push(p[0]);
});
eq(vacuous, [], 'I1 every mutant predicate holds on the UNMUTATED source — none is vacuous', vacuous);

// The parity harness must be able to SEE a disagreement, or its silence means nothing.
var brokenIr = swapSrc(IR, "    return res.targetPct;", "    return 1234;");
var seen = runInventoryReplenishment(ALL_RULES, req(), brokenIr).targetPct;
eq(seen, 1234, 'I2 positive control — a consumer really is executed, not asserted about');
ok(runInventoryReplenishment(ALL_RULES, req()).targetPct === 93,
  'I3 and unmutated it agrees with the others, so I2 proves something');

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + survived.length + ' survived, '
  + (vacuous.length === 0 ? 'vacuity clean' : 'VACUOUS: ' + vacuous.join(',')));
console.log(new Array(101).join('='));
process.exit(fail === 0 ? 0 : 1);
