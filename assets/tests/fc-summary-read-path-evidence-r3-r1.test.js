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
// B. THE CLIENT: HOW MANY LOGICAL REQUESTS DOES EACH OPERATOR ACTION ISSUE?
// ==================================================================================================
section('B  Logical workspace requests per operator action');

function makeClient() {
  var state = { logical: 0, hydrations: 0, errors: 0, answer: 'ok' };
  var sb = { console: { log: function () {}, warn: function () {} }, JSON: JSON, Date: Date,
             Promise: Promise, Math: Math, Array: Array, Object: Object, String: String,
             Number: Number, setTimeout: setTimeout, isNaN: isNaN };
  sb.window = sb;
  sb.document = { getElementById: function () { return null; }, querySelector: function () { return null; },
                  querySelectorAll: function () { return []; } };

  function envelope() {
    return { success: true, meta: { action: 'fcSummary.workspace.get', serverDurationMs: 4700 },
      data: {
        summary: { regularCount: 2, eventCount: 0, targetRuleCount: 1, marketplaceCount: 1, years: ['2026'] },
        fcRegularForecast: [{ forecast_id: 'f1', sku: 'A', year: '2026' }, { forecast_id: 'f2', sku: 'B', year: '2026' }],
        fcSpecialEvents: [],
        fcTargetRules: [{ target_rule_id: 'tr1', scope_type: 'SKU', scope_id: 'A', year: '2026' }],
        marketplaces: [{ marketplace: 'AMAZON', company: 'RESUS', country: 'US' }],
        counts: { fcRegularForecast: 2, fcSpecialEvents: 0, fcTargetRules: 1, marketplaces: 1 },
        capped: { fcRegularForecast: false, fcSpecialEvents: false, fcTargetRules: false, marketplaces: false }
      } };
  }
  sb.KM = {
    api: { getWorkspace: function () {
      state.logical++;
      if (state.answer === 'fail') {
        return Promise.resolve({ success: false, errors: [{ code: 'REQUEST_TIMEOUT', message: 'No answer arrived within 60s.' }] });
      }
      return new Promise(function (res) { setTimeout(function () { res(envelope()); }, 2); });
    } },
    DB: { adaptFcSummaryWorkspace: function (d) {
      return { fcRegularForecast: (d.fcRegularForecast || []).map(function (r) { return { sku: r.sku, year: r.year, raw: r }; }),
               fcSpecialEvents: [],
               fcTargetRules: (d.fcTargetRules || []).map(function (r) { return { ruleId: r.target_rule_id, raw: r }; }),
               marketplaces: d.marketplaces || [] };
    } },
    loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' } },
    lifecycle: { currentEpoch: function () { return sb.__epoch; }, commitGuard: function (e) { return e === sb.__epoch; } }
  };
  sb.__epoch = 1;
  sb.__note = function (k) { state[k]++; };

  vm.createContext(sb);
  vm.runInContext([
    'var _fcReadSeq = 0, _fcReadModel = null, _fcCandidateYears_ = null;',
    'var _fcReadbackFlight_ = false, _fcReadbackLoads_ = 0, _fcViewState_ = "CURRENT";',
    'var _fcMeta_ = {}; var _fcPrereqState_ = "IDLE";',
    // stubs. Not one of these can reach the network, which is the only thing being counted.
    'function _fcRegion_() { return { beginLoad: function(){}, set: function(){} }; }',
    'function _fcHydrateFromModel_() { __note("hydrations"); }',
    'function _fcShowBanner_() {} function _fcClearBanner_() {} function _fcBannerHost_() { return null; }',
    'function _fcRenderError_() { _fcReadModel = null; _fcCandidateYears_ = null; __note("errors"); }',
    'function _populateFcFilterOptionsFromDb() {} function _populateFcYearFromDb() {}',
    'function _fcResizeInit_() {} function _fcRerenderTables_() {} function _fcSyncFilterOptions() {}',
    'function _fcUseDb() { return true; }',
    'function _fcGetRegularForecast() { return (_fcReadModel && _fcReadModel.fcRegularForecast) || []; }',
    'function _fcErrDetail_() { return ""; } function _fcEscapeHtml(s) { return String(s); }',
    'function _fcFailureStage_(s) { return s; } function _fcStageText_(t) { return String(t); }'
  ].join('\n'), sb);
  ['FC_RETRY_', 'FC_RETRY_LABEL_', 'FC_STAGE_', 'FC_MSG_', 'FC_VIEW_']
    .forEach(function (v) { vm.runInContext(varSrc(FCS, v), sb); });
  ['_fcWorkspaceRefresh_', '_fcRefreshViewNow_', '_fcAfterWrite', '_fcSummaryEnsureDbAndRender',
   '_fcEffectiveWorkspace', '_fcValidWorkspaceData_', '_fcValidReadModel_', '_fcYearsOf_',
   '_fcRetryLabel_', '_fcOwns_', '_fcEpoch_', '_fcNoteEnvMeta_']
    .forEach(function (f) { vm.runInContext(fnSrc(FCS, f), sb); });
  // The workspace/legacy switch reads page globals this harness does not build. Forcing its production
  // answer is not stubbing the thing under test: what is under test is how many requests follow.
  vm.runInContext('_fcEffectiveWorkspace = function () { return true; };', sb);

  return {
    sb: sb, state: state,
    run: function (code) { vm.runInContext(code, sb); },
    get: function (expr) { return vm.runInContext(expr, sb); },
    reset: function () { state.logical = 0; state.hydrations = 0; state.errors = 0; state.answer = 'ok'; },
    settle: function () { return new Promise(function (r) { setTimeout(r, 40); }); }
  };
}

function clientScenarios() {
  var C = makeClient();
  var out = {};
  return Promise.resolve()
    .then(function () {
      C.reset(); C.run('_fcReadModel = null; _fcSummaryEnsureDbAndRender();');
      return C.settle();
    })
    .then(function () {
      out.coldMount = C.state.logical;
      out.modelAfterCold = C.get('!!_fcReadModel');
      C.reset(); C.run('_fcSummaryEnsureDbAndRender();');
      return C.settle();
    })
    .then(function () {
      out.reEntry = C.state.logical;
      C.reset();
      C.run('_fcRefreshViewNow_("x", "COLD_READ"); _fcRefreshViewNow_("x", "COLD_READ"); _fcRefreshViewNow_("x", "COLD_READ");');
      return C.settle();
    })
    .then(function () {
      out.threeRetries = C.state.logical;
      C.reset(); C.run('_fcViewState_ = "CURRENT"; __cb = 0; _fcAfterWrite(function () { __cb++; });');
      return C.settle();
    })
    .then(function () {
      out.postWrite = C.state.logical;
      out.writeReported = C.get('__cb');
      C.reset();
      C.run('_fcViewState_ = "CURRENT"; _fcAfterWrite(function () {}); __epoch = 2;');
      return C.settle();
    })
    .then(function () {
      out.hydrationsAfterUnmount = C.state.hydrations;
      C.run('__epoch = 1;');
      C.reset(); C.state.answer = 'fail';
      C.run('_fcReadModel = null; _fcSummaryEnsureDbAndRender();');
      return C.settle();
    })
    .then(function () {
      out.failedColdModelNull = C.get('_fcReadModel === null');
      out.failedColdErrors = C.state.errors;
      C.reset();
      C.run('_fcReadModel = null; _fcSummaryEnsureDbAndRender();');
      return C.settle();
    })
    .then(function () {
      out.rowsBeforeFailedRefresh = C.get('_fcReadModel ? _fcReadModel.fcRegularForecast.length : -1');
      C.state.answer = 'fail';
      C.run('_fcReadbackFlight_ = false; _fcRefreshViewNow_("x", "COLD_READ");');
      return C.settle();
    })
    .then(function () {
      out.rowsAfterFailedRefresh = C.get('_fcReadModel ? _fcReadModel.fcRegularForecast.length : -1');
      return out;
    });
}

// ==================================================================================================
// C. THE TARGET RULE MODAL STATE MACHINE
//
// The round's correction is explicit: the screenshot proves nothing, and the gate may be changed ONLY
// if a real state-machine test shows REFUSED or INITIAL_LOADING can still be classified NEW. This is
// that test. It is allowed to come back "no change needed".
// ==================================================================================================
function modalStates() {
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array,
             Object: Object, Math: Math, Date: Date, isNaN: isNaN };
  sb.window = sb;
  sb.document = { getElementById: function () { return null; } };
  sb.KM = { DB: {} };
  vm.createContext(sb);
  vm.runInContext('var _fcReadModel = null; function _fcUseDb() { return true; }', sb);
  vm.runInContext(varSrc(FCS, '_TR_UNAVAILABLE_'), sb);
  ['_fcGetTargetRules', '_trExistingRules_'].forEach(function (f) { vm.runInContext(fnSrc(FCS, f), sb); });

  function probe(setup) {
    vm.runInContext('_fcReadModel = null; KM.DB.getFcTargetRules = undefined; window._opDbCache = null;', sb);
    vm.runInContext(setup, sb);
    var rows = vm.runInContext('_trExistingRules_()', sb);
    if (rows === null) return 'NULL';
    if (rows && rows.targetRuleRowsUnavailable === true) return 'UNAVAILABLE';
    if (Array.isArray(rows)) return 'ARRAY:' + rows.length;
    return 'OTHER';
  }
  return {
    authoritativeOne: probe('_fcReadModel = { fcTargetRules: [{ ruleId: "tr1", raw: { target_rule_id: "tr1", scope_type: "SKU", scope_id: "A" } }] };'),
    authoritativeZero: probe('_fcReadModel = { fcTargetRules: [] };'),
    refused: probe('KM.DB.getFcTargetRules = function () { return (window._opDbCache && window._opDbCache.fcTargetRules) || []; };'),
    initialLoading: probe('/* nothing has been read, and no getter exists */'),
    notCanonical: probe('_fcReadModel = { fcTargetRules: [{ ruleId: "tr1" }] };'),
    demo: probe('_fcUseDb = function () { return false; };')
  };
}

// ==================================================================================================
// RUN
// ==================================================================================================
clientScenarios().then(function (R) {
  console.log('    measured: ' + JSON.stringify(R));

  // ---- INVARIANTS: already correct, and the round listed each as a suspected defect ----
  eq(R.coldMount, 1, 'B1  INVARIANT a cold mount issues exactly one logical request');
  ok(R.modelAfterCold === true, 'B2  and it commits a model');
  eq(R.threeRetries, 1, 'B3  INVARIANT three Retry clicks in one tick issue ONE request (single-flight)');
  eq(R.hydrationsAfterUnmount, 0, 'B4  INVARIANT a response arriving after the route changed mutates no DOM');
  ok(R.failedColdModelNull === true, 'B5  INVARIANT a failed cold read leaves NO model — a refusal, never loaded-empty');
  eq(R.failedColdErrors, 1, 'B6  and renders the refusal exactly once');
  ok(R.rowsBeforeFailedRefresh > 0 && R.rowsAfterFailedRefresh === R.rowsBeforeFailedRefresh,
    'B7  INVARIANT a failed refresh KEEPS the prior valid rows', R);
  eq(R.writeReported, 1, 'B8  INVARIANT a confirmed write is reported before the readback is attempted');

  // ---- CHARACTERISATION: the two defects, as they are today ----
  eq(R.reEntry, 1, 'B9  CHARACTERISATION route re-entry re-fetches even with a valid model (Commit C: 0)');
  eq(R.postWrite, 1, 'B10 CHARACTERISATION one saved row triggers a FULL workspace re-read (Commit C: 0)');

  // Positive control for B9/B10: a characterisation that passed because nothing ran at all would be
  // worthless. The cold mount above proves the counter counts, and B2 proves the model was committed —
  // so "1" in B9 is a request issued while a valid model was held, not an artefact of an empty harness.
  ok(R.coldMount === 1 && R.modelAfterCold === true,
    'B11 the counter and the model are both live, so B9/B10 measure a real re-fetch');

  section('C  Target Rule modal — what the classifier sees in each read state');
  var M = modalStates();
  console.log('    measured: ' + JSON.stringify(M));

  eq(M.authoritativeOne, 'ARRAY:1', 'C1  an authoritative read hands the classifier its canonical rows');
  eq(M.notCanonical, 'UNAVAILABLE', 'C2  INVARIANT a non-canonical row shape still fails closed');
  eq(M.demo, 'NULL', 'C3  INVARIANT Demo mode still reports matching as not applicable');

  // THE PROOF THE CORRECTION ASKED FOR. Three different states produce one indistinguishable value.
  eq(M.authoritativeZero, 'ARRAY:0', 'C4  a proven-empty database reads as an empty list');
  eq(M.refused, 'ARRAY:0', 'C5  CHARACTERISATION a REFUSED read reads as the SAME empty list');
  eq(M.initialLoading, 'ARRAY:0', 'C6  CHARACTERISATION so does a read that has not happened yet');
  ok(M.refused === M.authoritativeZero && M.initialLoading === M.authoritativeZero,
    'C7  PROVEN: REFUSED, INITIAL_LOADING and proven-empty are indistinguishable at the classifier, '
    + 'so NEW + twelve 100s is reachable without an authoritative read (Commit C inverts C5/C6/C7)');

  // And the mechanism, so the repair lands on the cause rather than on the symptom.
  var getter = fnSrc(FCS, '_fcGetTargetRules');
  ok(/if\s*\(_fcReadModel\)\s*return\s+_fcReadModel\.fcTargetRules;/.test(getter),
    'C8  the authoritative branch is guarded on _fcReadModel');
  ok(/KM\.DB\.getFcTargetRules/.test(getter) && /:\s*\[\]/.test(getter),
    'C9  and the fall-through answers the broad cache, or [] — which is the fail-open, one line wide');

  section('D  The evidence document says what the code does');
  ok(/6,289 ms/.test(DOC), 'D1  the measured platform floor is recorded');
  ok(/30 Sheets service calls|\*\*30\*\*/.test(DOC), 'D2  the service-call count is recorded');
  ok(/TARGET_RULE_MODAL_PRODUCTION_DEFECT_PROVEN = NO/.test(DOC),
    'D3  and it states plainly that the screenshot proved no production defect');
  ok(/not achievable/.test(DOC), 'D4  the unreachable targets are named as unreachable, not quietly dropped');
  ok(/parallel/i.test(DOC) && /two floors|two platform floors/.test(DOC),
    'D5  and the reason sequential staging is refused is recorded');

  // ================================================================================================
  section('E  Mutants');
  // Each mutant breaks one measured fact and must be caught by the assertion that measures it.
  var mutants = [];
  function mutant(name, fn) {
    var survived = false;
    try { survived = fn() === true; } catch (e) { survived = false; }
    mutants.push({ name: name, survived: survived });
    if (survived) { fail++; console.error('SURVIVED  ' + name); } else { pass++; }
  }

  // M1 — a census that counted nothing would make every <= bound in Section A vacuous.
  mutant('M1  the service-call census counts nothing', function () {
    return census.calls.length === 0;
  });
  // M2 — if the harness never committed a model, B9 would be measuring a cold mount, not a re-entry.
  mutant('M2  the client harness never commits a model', function () {
    return R.modelAfterCold !== true;
  });
  // M3 — if getWorkspace were never reached, every count would be 0 and B3/B9/B10 would all "pass".
  mutant('M3  the request counter never increments', function () {
    return R.coldMount === 0;
  });
  // M4 — the fail-open proof would be vacuous if the UNAVAILABLE sentinel never appeared at all.
  mutant('M4  _TR_UNAVAILABLE_ is unreachable in every state', function () {
    return M.notCanonical !== 'UNAVAILABLE';
  });
  // M5 — and equally vacuous if EVERY state returned an empty list, including the canonical one.
  mutant('M5  every state returns an empty list', function () {
    return M.authoritativeOne === 'ARRAY:0';
  });
  // M6 — the full-sheet scan must actually carry the header, or A8's claim of redundancy is wrong.
  mutant('M6  the full-sheet scan does not include the header row', function () {
    var c = runServerCensus();
    var scan = c.calls.filter(function (x) { return /getDataRange/.test(x.op) && x.sheet === 'fc_target_rules'; })[0];
    return !scan || Number(scan.op.split(':')[1]) < 30;   // 3 rows x 10 cols incl. header
  });

  console.log('    ' + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');

  console.log('\n================================================================');
  console.log('FC-SUMMARY-R3-R1 PHASE A EVIDENCE:  ' + pass + ' passed, ' + fail + ' failed, '
    + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.error('HARNESS ERROR: ' + (e && e.stack || e));
  process.exit(1);
});
