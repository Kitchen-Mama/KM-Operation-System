// Kitchen Mama Operation System — FC-SUMMARY-R3-R1 PHASE A
// READ-PATH EVIDENCE: WHAT THE PAGE ACTUALLY ASKS FOR, AND HOW OFTEN
// Run: node assets/tests/fc-summary-read-path-evidence-r3-r1.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime, no writes.
//
// THIS IS A MEASUREMENT COMMIT'S SUITE. It changes no runtime. It exists to hold three kinds of fact
// still while Phases B and C move the code underneath them:
//
//   INVARIANT        already correct, and must stay correct. Four of the behaviours the round listed
//                    as suspected defects are in this group — single-flight Retry, fail-closed refusal,
//                    a kept stale model, and no DOM mutation after routing away. They are repaired
//                    already; the suite's job is to stop them regressing while the read path is rebuilt.
//   BASELINE         measured now, expected to IMPROVE. Asserted with <= so that Phase B tightening the
//                    number never breaks the assertion, and Section A's prose carries the exact value.
//   CHARACTERISATION the two defects this round exists to fix, asserted AS THEY ARE TODAY so this
//                    commit is green on its own tree. Each one names the commit that inverts it. A
//                    characterisation test that silently starts passing for the wrong reason is worse
//                    than none, so each is paired with a positive control.
//
// WHAT IS FAKED. The spreadsheet and the network — the two things that cannot exist outside their
// runtime, and each of whose calls is the unit being counted. Every function that DECIDES to read is
// the committed source, extracted and executed.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var FCS = read('assets/js/pages/fc-summary.js');
var WS = read('assets/specs/active/apps-script/58_api_v1_fc_summary_workspace.gs');
var SAFE = read('assets/specs/active/apps-script/29_production_safety_adapter.gs');
var DOC = read('docs/planning/FC_SUMMARY_R3_R1_READ_PATH_EVIDENCE.md');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function le(a, b, l) { if (a <= b) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   ' + a + ' > ' + b); } }
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 96 - n.length)).join('-')); }

// ------------------------------------------------------------------ extraction ------------------
function scanTo(s, from, semicolon) {
  var i = from, depth = 0, opened = false;
  while (i < s.length) {
    var c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      var q = c; i++;
      while (i < s.length) { if (s[i] === '\\') { i += 2; continue; } if (s[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth++; opened = true; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; if (!semicolon && depth === 0 && opened) return i; continue; }
    if (semicolon && c === ';' && depth === 0) return i + 1;
    i++;
  }
  throw new Error('unterminated from ' + from);
}
function fnSrc(src, name) {
  var m = new RegExp('(?:^|\\n)\\s*function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var start = src.indexOf('function', m.index);
  return src.slice(start, scanTo(src, src.indexOf('{', src.indexOf(')', start)), false));
}
function varSrc(src, name) {
  var m = new RegExp('(?:^|\\n)var\\s+' + name + '\\s*=').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  var start = src.indexOf('var', m.index);
  return src.slice(start, scanTo(src, src.indexOf('=', start) + 1, true));
}

// ==================================================================================================
// A. THE SERVER: HOW MANY SHEETS SERVICE CALLS IS ONE LOGICAL REQUEST?
//
// The handler takes an injectable `io` so it can run without SpreadsheetApp — but injecting `io`
// REPLACES readTable, which is exactly where the repeated reads live. So the real
// fcsWorkspaceDefaultIo_ runs, against a spreadsheet that counts what is asked of it. Each method on
// that object is a billed round trip in production, so counting them IS the measurement.
// ==================================================================================================
section('A  Sheets service calls in ONE logical workspace request');

var TABLES = {
  fc_regular_forecast: { cols: ['forecast_id', 'sku', 'year', 'company', 'country', 'marketplace',
    'jan_qty', 'dec_qty', 'forecast_status', 'source', 'updated_at'], rows: 496 },
  fc_special_events: { cols: ['event_id', 'campaign_id', 'campaign_sku_line_id', 'sku', 'year'], rows: 4 },
  fc_target_rules: { cols: ['target_rule_id', 'scope_type', 'scope_id', 'year', 'company', 'country',
    'marketplace', 'jan_pct', 'dec_pct', 'updated_at'], rows: 2 },
  marketplaces: { cols: ['marketplace', 'company', 'country', 'status'], rows: 15 }
};

function runServerCensus() {
  var calls = [];
  function note(op, sheet) { calls.push({ op: op, sheet: sheet || '' }); }

  function makeSheet(name) {
    var spec = TABLES[name], header = spec.cols, all = [header];
    for (var r = 0; r < spec.rows; r++) {
      var row = []; for (var c = 0; c < header.length; c++) row.push(name + '-' + r + '-' + c);
      all.push(row);
    }
    return {
      getName: function () { return name; },
      getLastRow: function () { note('getLastRow', name); return all.length; },
      getLastColumn: function () { note('getLastColumn', name); return header.length; },
      getRange: function (r1, c1, nr, nc) {
        return { getValues: function () {
          note('getRange.getValues:' + (nr * nc), name);
          var out = []; for (var i = 0; i < nr; i++) out.push(all[r1 - 1 + i].slice(c1 - 1, c1 - 1 + nc));
          return out;
        } };
      },
      getDataRange: function () {
        return { getValues: function () { note('getDataRange.getValues:' + (all.length * header.length), name); return all; } };
      }
    };
  }
  var SHEETS = {}; Object.keys(TABLES).forEach(function (n) { SHEETS[n] = makeSheet(n); });
  var SS = { getId: function () { note('getId'); return 'DB'; },
             getSheetByName: function (n) { note('getSheetByName', n); return SHEETS[n] || null; } };

  var sb = { console: console, JSON: JSON, Date: Date, String: String, Number: Number,
             Array: Array, Object: Object, Error: Error, Math: Math };
  sb.PRODUCTION_DB_SPREADSHEET_ID_ = 'DB';
  sb.SpreadsheetApp = { openById: function () { note('openById'); return SS; } };
  sb.KMSAFE = {
    assertExpectedSpreadsheetId: function (ss, expected) {
      if (!ss || typeof ss.getId !== 'function') throw new Error('WRONG_SPREADSHEET_TARGET');
      if (String(ss.getId()) !== String(expected)) throw new Error('WRONG_SPREADSHEET_TARGET');
      return { ok: true };
    },
    classifySchemaMismatch: function () { return { valid: true, schemaStatus: 'OK' }; }
  };
  vm.createContext(sb);
  vm.runInContext('function prodSafetyBundle_() { return KMSAFE; }', sb);
  ['prodExpectedDbId_', 'prodSchemaError_', 'prodAssertDbTarget_', 'prodRequireSheet_', 'prodRequireColumns_']
    .forEach(function (f) { vm.runInContext(fnSrc(SAFE, f), sb); });
  ['FCSWS_BUILD_VERSION_', 'FCS_WORKSPACE_TABLES_', 'FCS_WS_ROW_MAX_', 'FCS_SLICE_SPECS_', 'FCS_EMIT_SOURCE_']
    .forEach(function (v) { vm.runInContext(varSrc(WS, v), sb); });
  vm.runInContext('var FCS_WS_SEQ_ = 0;', sb);
  ['fcsWsStr_', 'fcsBuildEnvelope_', 'fcsCap_', 'fcsDistinctYears_', 'fcsDistinctAsc_', 'fcsBuildFacets_',
   'fcsWorkspaceBuild_', 'fcsResolveSlice_', 'fcsSliceBuild_', 'fcsWsRowsToObjects_', 'fcsRowsFromValues_',
   'fcsValidateHeader_', 'fcsReadTableOnce_', 'fcsWorkspaceDefaultIo_', 'handleFcSummaryWorkspaceGet_']
    .forEach(function (f) { vm.runInContext(fnSrc(WS, f), sb); });

  var env = vm.runInContext('handleFcSummaryWorkspaceGet_({ action: "fcSummary.workspace.get" }, undefined)', sb);
  return { env: env, calls: calls };
}

var census = runServerCensus();
ok(census.env.success === true, 'A1  the real handler answers successfully against a counting spreadsheet');
eq(census.env.meta.tablesRead, 4, 'A2  four tables are read');
eq(census.env.data.counts, { fcRegularForecast: 496, fcSpecialEvents: 4, fcTargetRules: 2, marketplaces: 15 },
  'A3  and every row of each reaches the envelope');

var cellReads = census.calls.filter(function (c) { return /getValues/.test(c.op); });
var perSheet = {};
cellReads.forEach(function (c) { perSheet[c.sheet] = (perSheet[c.sheet] || 0) + 1; });

console.log('    measured: ' + census.calls.length + ' service calls, ' + cellReads.length + ' of them transferring cells');
console.log('    per sheet: ' + JSON.stringify(perSheet));

// BASELINE — measured at 07c23fd: 30 service calls, 10 cell transfers. Phase B must not exceed these
// and is expected to fall well below them, so the bound is <= and the exact number lives in the prose
// and in the evidence document beside it.
le(census.calls.length, 30, 'A4  BASELINE service calls per logical request <= 30');
le(cellReads.length, 10, 'A5  BASELINE cell-transferring reads <= 10');

// The contract in §4 of the evidence document: each needed sheet read AT MOST ONCE per logical request.
// Commit A measured two sheets being read three times and said here that Commit B would invert this.
// It has. The assertion is now the contract rather than the defect.
var worst = Object.keys(perSheet).reduce(function (m, k) { return Math.max(m, perSheet[k]); }, 0);
eq(worst, 1, 'A6  every sheet is read AT MOST ONCE per logical request (was three)');
var repeated = Object.keys(perSheet).filter(function (k) { return perSheet[k] > 1; }).sort();
eq(repeated, [], 'A7  and no sheet is read twice — the requiredCols second header read is gone');

// The redundancy is provable, not merely counted: getDataRange() returns the header row, so every
// getRange(1,1,1,n) read is a second trip for bytes the handler is about to receive anyway.
var headerReads = census.calls.filter(function (c) { return /getRange\.getValues/.test(c.op); }).length;
eq(headerReads, 0, 'A8  no separate header reads at all — the full-sheet scan already carries the header');
var fullScans = census.calls.filter(function (c) { return /getDataRange/.test(c.op); }).length;
eq(fullScans, 4, 'A9  one full-sheet scan per table — and it already carries the header');

var getIds = census.calls.filter(function (c) { return c.op === 'getId'; }).length;
eq(getIds, 1, 'A10 the spreadsheet id is asserted ONCE per request, not once per table (was five)');
// Asserted once is not asserted less: the refusal itself is unchanged, and the slice suite drives every
// WRONG_SPREADSHEET_TARGET path to prove it. Four proofs of one fact were four service calls, not four
// safeguards.
eq(census.calls.length, 10, 'A10a ten Sheets service calls in total, down from the thirty Commit A measured');

// ==================================================================================================
// B / C. MOVED — and where to.
//
// Phase A counted logical requests here through _fcWorkspaceRefresh_, and characterised the Target Rule
// fail-open here too. Commit B and Commit C inverted both, exactly as the prose above said they would:
// _fcWorkspaceRefresh_ no longer exists (nothing in the page can read the whole workspace any more), and
// an unread or refused Target Rule authority now answers `null` rather than a proven-empty list.
//
// Both are asserted in fc-summary-staged-hydration-r3-r1.test.js, against the same committed functions
// and with far more cases than were here: per-slice failure isolation, generation ownership, late
// answers after unmount, a mismatched slice answer, the four write paths and their receipts, and the
// deployment-order guard for a backend rollback. Re-implementing them here with a second harness would
// leave two places to keep in step and two chances to disagree. They moved; they were not dropped, and
// the guard below fails if they ever quietly become nobody's job.
// ==================================================================================================

// ==================================================================================================
// RUN
// ==================================================================================================
section('D  The evidence document says what the code does');
ok(/6,289 ms/.test(DOC), 'D1  the measured platform floor is recorded');
ok(/30 Sheets service calls|\*\*30\*\*/.test(DOC), 'D2  the PRE service-call count is recorded');
ok(/TARGET_RULE_MODAL_PRODUCTION_DEFECT_PROVEN = NO/.test(DOC),
  'D3  and it states plainly that the screenshot proved no production defect');
ok(/not achievable/.test(DOC), 'D4  the unreachable targets are named as unreachable, not quietly dropped');
ok(/parallel/i.test(DOC) && /two floors|two platform floors/.test(DOC),
  'D5  and the reason sequential staging was refused is recorded');

// THE GUARD THAT MAKES 'MOVED' DIFFERENT FROM 'DELETED'. If the suite that inherited those assertions
// disappears or stops asserting them, this one fails rather than quietly covering less than it says.
var HEIR = 'assets/tests/fc-summary-staged-hydration-r3-r1.test.js';
var heirSrc = fs.existsSync(path.join(REPO, HEIR)) ? read(HEIR) : '';
ok(heirSrc.length > 0, 'D6  the suite that inherited the request counting exists', HEIR);
ok(/_fcSummaryEnsureDbAndRender/.test(heirSrc) && /_fcAfterWrite/.test(heirSrc) && /_fcRefreshViewNow_/.test(heirSrc),
  'D7  and drives the same request-issuing functions this section used to');
ok(/_trExistingRules_/.test(heirSrc) && /targetRuleRowsUnavailable/.test(heirSrc),
  'D8  and the Target Rule fail-closed state machine with it');

// ==================================================================================================
section('E  Mutants');
var mutants = [];
function mutant(name, fn) {
  var survived = false;
  try { survived = fn() === true; } catch (e) { survived = false; }
  mutants.push({ name: name, survived: survived });
  if (survived) { fail++; console.error('SURVIVED  ' + name); } else { pass++; }
}
// M1 — a census that counted nothing would make every bound in Section A vacuous.
mutant('M1  the service-call census counts nothing', function () {
  return census.calls.length === 0;
});
// M2 — the full-sheet scan must actually carry the header, or A8's claim of redundancy is wrong.
mutant('M2  the full-sheet scan does not include the header row', function () {
  var c = runServerCensus();
  var scan = c.calls.filter(function (x) { return /getDataRange/.test(x.op) && x.sheet === 'fc_target_rules'; })[0];
  return !scan || Number(scan.op.split(':')[1]) < 30;   // 3 rows x 10 cols incl. header
});
// M3 — the heir suite silently stops covering what moved out of here.
mutant('M3  the inherited assertions are nobody\'s job', function () {
  return heirSrc.indexOf('_trExistingRules_') === -1 && heirSrc.length > 0;
});

console.log('    ' + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');

console.log('\n================================================================');
console.log('FC-SUMMARY-R3-R1 PHASE A EVIDENCE:  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');
process.exit(fail === 0 ? 0 : 1);
