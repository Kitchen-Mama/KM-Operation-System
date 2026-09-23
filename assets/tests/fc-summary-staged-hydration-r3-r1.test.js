// Kitchen Mama Operation System — FC-SUMMARY-R3-R1 §C
// STAGED HYDRATION: THE REQUESTS THAT STOPPED BEING ISSUED
// Run: node assets/tests/fc-summary-staged-hydration-r3-r1.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime, no writes.
//
// WHAT IS FAKED, AND WHAT IS NOT. The network is faked. The decision to GO to the network is not: every
// function that can issue a read — _fcMountLoad_, _fcSliceFetch_, _fcEnsureTabSlice_, _fcAfterWrite,
// _fcRefreshViewNow_, _fcRetryFailedSlices_, _fcSummaryEnsureDbAndRender — is the committed source,
// extracted and executed. So is the real slice adapter from the shipped API file, and the four canonical
// normalizers it calls. Counting happens at the KM.api.getWorkspace boundary, which is the only place a
// logical request can be born.
//
// WHY THE COUNTS ARE THE POINT. Phase A measured a 6.3-second median floor for a production request that
// reads nothing at all — five times what the 496-row table costs. On that platform a page is fast because
// it does not ask, not because it asks for less. Every assertion here is therefore about how many requests
// an operator action issues, and which slice each one names.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');
var INDEX = read('index.html');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
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
// window.KM.DB.x = function () {} is an ASSIGNMENT, so fnSrc cannot see it.
function assignFnSrc(src, dotted) {
  var m = new RegExp('(?:^|\\n)' + dotted.replace(/\./g, '\\.') + '\\s*=\\s*function').exec(src);
  if (!m) throw new Error('assignment not found: ' + dotted);
  var start = src.indexOf(dotted, m.index);
  return src.slice(start, scanTo(src, src.indexOf('{', src.indexOf(')', start)), false)) + ';';
}

var PAGE_VARS = ['FC_SLICE_', 'FC_FRESH_', '_FC_TAB_SLICE_', '_FC_SLICE_KEYS_', '_FC_MODEL_KEYS_',
                 'FC_RETRY_', 'FC_RETRY_LABEL_', 'FC_STAGE_', 'FC_MSG_', 'FC_VIEW_', '_TR_UNAVAILABLE_',
                 // A3-R10 §14.1/§14.2 — the model generation and the boot-dependency list.
                 '_fcSliceState_', '_fcModelGen_', '_fcInvalidateReason_', '_FC_BOOT_DEPS_',
                 // R2-STABILITY §4 — the post-write warm-up reads the prerequisite census and the
                 // per-slice table map. Lifted rather than stubbed so this suite counts its real
                 // requests against the real lists.
                 '_FC_PREREQ_TABLES_', '_FC_SLICE_PREREQ_TABLES_', '_fcPrereqLoadedTables_',
                 '_fcPrereqLoadedPaths_', '_fcMeta_'];
var PAGE_FNS = ['_fcSliceRec_', '_fcSliceStates_', '_fcWorkspaceMode_', '_fcHas_', '_fcSliceHasData_',
                '_fcModelUsable_', '_fcTabNow_', '_fcMergeSlice_', '_fcSliceFetch_', '_fcFailedSlices_',
                '_fcMountLoad_', '_fcSliceFailed_', '_fcNoteFreshness_', '_fcRetryFailedSlices_',
                '_fcEnsureTabSlice_', '_fcAfterWriteScoped_', '_fcAfterWrite', '_fcRefreshViewNow_',
                '_fcSummaryEnsureDbAndRender', '_fcEffectiveWorkspace', '_fcOwns_', '_fcEpoch_',
                // _fcSliceFetch_ validates the payload shape before it commits anything, so the
                // validator travels with it. A gate that is not lifted is a gate that throws.
                '_fcValidWorkspaceData_',
                // R2-STABILITY §4 — `_fcAfterWrite` now starts a post-write warm-up beside the readback,
                // and the same rule applies: a callee that is not lifted is a callee that throws. It is
                // lifted WITH its dependencies rather than stubbed, so this suite counts its requests too.
                '_fcPostWriteWarm_', '_fcPrereqMissing_', '_fcSliceTables_', '_fcReconcileFromReceipts_',
                '_fcYearsOf_', '_fcRetryLabel_', '_fcNoteEnvMeta_', '_fcGetRegularForecast',
                '_fcGetSpecialEvents', '_fcGetTargetRules', '_fcGetMarketplaces', '_trExistingRules_',
                // A3-R10 — _fcRenderError_ delegates the reset, _fcMountLoad_ defers dispatch, and
                // _fcRetryFailedSlices_ asks what the tab needs. All three are already driven here.
                '_fcModelGenNow_', '_fcInvalidateModel_', '_fcDispatchWhenBootClear_',
                '_fcSlicesNeededNow_'];

// ------------------------------------------------------------------ the world ------------------
function ROWS() {
  return {
    regular: [
      { forecast_id: 'f1', sku: 'CO1100-R', year: '2026', company: 'RESUS', country: 'US', marketplace: 'AMAZON', category: 'Openers', series: 'CO1100' },
      { forecast_id: 'f2', sku: 'CO1100-B', year: '2025', company: 'RESUS', country: 'US', marketplace: 'AMAZON', category: 'Openers', series: 'CO1100' }
    ],
    events: [{ event_fc_id: 'e1', campaign_id: 'c1', sku: 'CO1100-R', year: '2026', event: 'Prime Day' }],
    rules: [{ target_rule_id: 'tr1', scope_type: 'SKU', scope_id: 'CO1100-R', year: '2026',
              company: 'RESUS', country: 'US', marketplace: 'AMAZON', oct_pct: 150 }],
    marketplaces: [{ marketplace: 'AMAZON', company: 'RESUS', country: 'US' }]
  };
}
var FACETS = { years: ['2026', '2025'], companies: ['RESUS'], marketplaces: ['AMAZON'],
               countries: ['US'], categories: ['Openers'], series: ['CO1100'], events: ['Prime Day'] };

function sliceEnvelope(name, R) {
  var d = { slice: name, observed_at: '2026-09-20T10:00:00.000Z', counts: {}, capped: {}, row_count: 0 };
  if (name === 'bootstrap') { d.fcTargetRules = R.rules; d.marketplaces = R.marketplaces; d.facets = FACETS;
                              d.counts = { fcRegularForecast: R.regular.length }; }
  if (name === 'regular') d.fcRegularForecast = R.regular;
  if (name === 'events') d.fcSpecialEvents = R.events;
  if (name === 'rules') d.fcTargetRules = R.rules;
  return { success: true, meta: { action: 'fcSummary.workspace.get', slice: name }, data: d };
}

function world(opts) {
  opts = opts || {};
  var R = opts.rows || ROWS();
  var log = [];                       // every logical request, in order
  var state = { tab: opts.tab || 'regular', hydrations: 0, errors: 0, banners: [] };
  var answers = opts.answers || {};   // slice -> 'ok' | 'fail' | 'full' | 'wrong'
  var held = {};                      // slice -> resolve fn, when opts.hold names it

  var sb = { console: { log: function () {}, warn: function () {}, error: function () {} },
             JSON: JSON, Date: Date, Promise: Promise, Math: Math, Array: Array, Object: Object,
             String: String, Number: Number, setTimeout: setTimeout, isNaN: isNaN, parseFloat: parseFloat,
             parseInt: parseInt };
  sb.window = sb;
  sb.document = { getElementById: function () { return null; }, querySelector: function () { return null; },
                  querySelectorAll: function () { return []; } };

  sb.KM = {
    api: {
      workspaceApiActive: function () { return opts.workspaceOff ? false : true; },
      getWorkspace: function (name, params) {
        var slice = (params && params.include && params.include.slice) || 'FULL';
        log.push(slice);
        var how = answers[slice] || 'ok';
        var mk = function () {
          if (how === 'fail') return { success: false, errors: [{ code: 'REQUEST_TIMEOUT', message: 'No answer arrived within 60s.' }] };
          if (how === 'full') {   // an R13 backend that ignores include.slice
            return { success: true, meta: {}, data: { fcRegularForecast: R.regular, fcSpecialEvents: R.events,
              fcTargetRules: R.rules, marketplaces: R.marketplaces, counts: {}, capped: {} } };
          }
          if (how === 'wrong') { var e = sliceEnvelope(slice === 'regular' ? 'events' : 'regular', R); return e; }
          if (how === 'zero') { var z = sliceEnvelope(slice, R); if (z.data.fcTargetRules) z.data.fcTargetRules = []; return z; }
          return sliceEnvelope(slice, R);
        };
        if (opts.hold && opts.hold.indexOf(slice) !== -1) {
          return new Promise(function (res) { held[slice] = function () { res(mk()); }; });
        }
        return new Promise(function (res) { setTimeout(function () { res(mk()); }, 2); });
      }
    },
    DB: {},
    loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' } },
    lifecycle: { currentEpoch: function () { return sb.__epoch; },
                 commitGuard: function (e) { return e === sb.__epoch; } }
  };
  sb.__epoch = 1;

  vm.createContext(sb);
  // THE REAL ADAPTER AND THE REAL NORMALIZERS. The slice contract — an absent key means unknown — lives
  // in the adapter, so stubbing it would delete the thing under test.
  vm.runInContext([
    'window.KM = window.KM || {}; window.KM.DB = window.KM.DB || {};',
    fnSrc(API, 'normalizeFcTargetRuleRecord'),
    fnSrc(API, 'normalizeFcRegularForecastRecord'),
    // normalizeFcSpecialEventRecord CALLS this one. Leaving it out made every Special Event row throw
    // inside the real adapter, which reads exactly like a refusal — a fixed extraction list is a
    // dependency declaration, and a lifted function cannot call what the list does not also lift.
    fnSrc(API, '_fcParseEventPeriodDates'),
    fnSrc(API, 'normalizeFcSpecialEventRecord'),
    fnSrc(API, 'normalizeMarketplaceRecord'),
    assignFnSrc(API, 'window.KM.DB.adaptFcSummaryWorkspaceSlice')
  ].join('\n'), sb, { filename: 'api' });

  // Stubs. Not one of these can issue a request, which is the only thing being counted.
  vm.runInContext([
    'var _fcReadModel = null, _fcCandidateYears_ = null, _fcReadSeq = 0;',
    'var _fcSliceState_ = {};',
    'var _fcReadbackFlight_ = false, _fcReadbackLoads_ = 0, _fcViewState_ = "CURRENT";',
    'var _fcMeta_ = {}; var __tab = "' + state.tab + '";',
    'function _fcActiveTab() { return __tab; }',
    'function _fcUseDb() { return ' + (opts.demo ? 'false' : 'true') + '; }',
    'function _fcRegion_() { return { beginLoad: function(){}, set: function(){} }; }',
    'function _fcHydrateFromModel_() { __note("hydrations"); }',
    'function _fcShowBanner_(t) { __banner(t); } function _fcClearBanner_() { __banner(null); }',
    'function _fcBannerHost_() { return null; }',
    'function _fcRenderError_() { _fcReadModel = null; _fcCandidateYears_ = null; __note("errors"); }',
    'function _populateFcFilterOptionsFromDb() {} function _populateFcYearFromDb() {}',
    'function _fcResizeInit_() {} function _fcRerenderTables_() {} function _fcSyncFilterOptions() {}',
    'function _fcErrDetail_() { return ""; } function _fcEscapeHtml(s) { return String(s); }',
    'function _fcFailureStage_(s) { return s; } function _fcStageText_(t) { return String(t); }',
    'function renderFcRegularTable() {} function renderFcEventTable() {} function renderTargetRulesTable() {}',
    'function _fcSetTargetSaveEnabled_() {}',
    'function _trStrTok_(v) { return String(v === undefined || v === null ? "" : v).trim(); }'
  ].join('\n'), sb, { filename: 'stubs' });
  sb.__note = function (k) { state[k]++; };
  sb.__banner = function (t) { state.banners.push(t); };

  PAGE_VARS.forEach(function (v) { vm.runInContext(varSrc(FCS, v), sb, { filename: 'var:' + v }); });
  PAGE_FNS.forEach(function (f) { vm.runInContext(fnSrc(FCS, f), sb, { filename: 'fn:' + f }); });

  return {
    sb: sb, log: log, state: state, held: held,
    run: function (code) { return vm.runInContext(code, sb); },
    get: function (expr) { return vm.runInContext(expr, sb); },
    tab: function (t) { state.tab = t; vm.runInContext('__tab = ' + JSON.stringify(t) + ';', sb); },
    answer: function (slice, how) { answers[slice] = how; },
    release: function (slice) { if (held[slice]) { held[slice](); delete held[slice]; } },
    reset: function () { log.length = 0; state.hydrations = 0; state.errors = 0; state.banners.length = 0; },
    settle: function (ms) { return new Promise(function (r) { setTimeout(r, ms || 40); }); }
  };
}

// ==================================================================================================
(function run() {
  var P = Promise.resolve();
  function step(fn) { P = P.then(fn); return P; }

  // ---------------------------------------------------------------- A. COLD MOUNT
  step(function () {
    section('A  Cold mount: bootstrap plus the ACTIVE tab, and nothing else');
    var w = world({ tab: 'regular' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      eq(w.log.slice().sort(), ['bootstrap', 'regular'],
         'A1  a cold mount on Regular issues exactly bootstrap + regular');
      eq(w.log.length, 2, 'A2  two logical requests, the contract maximum');
      ok(w.log.indexOf('events') === -1,
         'A3  Special Event is NOT fetched while Regular is active', w.log);
      ok(w.log.indexOf('FULL') === -1, 'A4  and nothing asked for the whole workspace', w.log);
      ok(w.get('_fcHas_("fcRegularForecast")') && w.get('_fcHas_("fcTargetRules")'),
         'A5  both slices landed in the one model');
      ok(w.get('_fcReadModel.fcSpecialEvents === undefined'),
         'A6  the events key is ABSENT, not [] — unread is not empty');
      eq(w.get('_fcCandidateYears_'), ['2026', '2025'],
         'A7  the Year options come from the server-derived facets, complete');
    });
  });

  step(function () {
    var w = world({ tab: 'target' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      eq(w.log, ['bootstrap'],
         'A8  a cold mount on Target Rules issues ONE request — bootstrap carries the rules');
      ok(w.get('_fcHas_("fcTargetRules")'), 'A9  and the rules are authoritative immediately');
      ok(w.get('_fcReadModel.fcRegularForecast === undefined'),
         'A10 while the 496-row table is not fetched for a tab that does not show it');
    });
  });

  step(function () {
    var w = world({ tab: 'event' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      eq(w.log.slice().sort(), ['bootstrap', 'events'],
         'A11 a cold mount on Special Event issues bootstrap + events');
      ok(w.log.indexOf('regular') === -1, 'A12 and does not fetch the Regular rows', w.log);
    });
  });

  // ---------------------------------------------------------------- B. ROUTE RE-ENTRY
  step(function () {
    section('B  Route re-entry draws from memory, before any request could settle');
    var w = world({ tab: 'regular' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset();
      // unmount() keeps the model; this is the second visit.
      w.run('_fcSummaryEnsureDbAndRender();');
      eq(w.log, [], 'B1  SYNCHRONOUSLY: re-entry issues ZERO requests');
      eq(w.state.hydrations, 1, 'B2  and has ALREADY drawn before any promise could resolve');
      return w.settle().then(function () {
        eq(w.log, [], 'B3  and still issues none once the microtask queue drains');
        ok(w.get('_fcHas_("fcRegularForecast")'), 'B4  with the rows intact');
      });
    });
  });

  step(function () {
    // Re-entering on a DIFFERENT tab whose slice was never loaded fetches only that slice.
    var w = world({ tab: 'regular' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset(); w.tab('event');
      w.run('_fcSummaryEnsureDbAndRender();');
      return w.settle().then(function () {
        eq(w.log, ['events'], 'B5  re-entry on an unloaded tab fetches THAT slice only — bootstrap is still in memory');
      });
    });
  });

  // ---------------------------------------------------------------- C. LAZY TABS AND SINGLE FLIGHT
  step(function () {
    section('C  Lazy tabs, and one logical request per slice however many clicks');
    var w = world({ tab: 'regular' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset();
      w.run('_fcEnsureTabSlice_("event");');
      w.run('_fcEnsureTabSlice_("event");');
      w.run('_fcEnsureTabSlice_("event");');
      return w.settle().then(function () {
        eq(w.log, ['events'], 'C1  three activations of the same tab issue ONE request');
        w.reset();
        w.run('_fcEnsureTabSlice_("event");');
        return w.settle().then(function () {
          eq(w.log, [], 'C2  and a tab already in memory issues none at all');
          w.reset();
          w.run('_fcEnsureTabSlice_("target");');
          return w.settle().then(function () {
            eq(w.log, [], 'C3  nor does Target Rules, whose rows arrived with the bootstrap');
          });
        });
      });
    });
  });

  step(function () {
    var w = world({ tab: 'regular' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset();
      w.run('_fcRefreshViewNow_("x", "COLD_READ"); _fcRefreshViewNow_("x", "COLD_READ"); _fcRefreshViewNow_("x", "COLD_READ");');
      return w.settle().then(function () {
        eq(w.log, ['regular'], 'C4  three Retry clicks in one tick issue ONE request, for the ACTIVE slice');
      });
    });
  });

  // ---------------------------------------------------------------- D. FAILURE ISOLATION
  step(function () {
    section('D  One slice failing does not erase another');
    var w = world({ tab: 'regular', answers: { regular: 'fail' } });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      ok(w.get('_fcHas_("fcTargetRules")'),
         'D1  bootstrap succeeded while the active slice failed — the Target Rules are still authoritative');
      ok(w.get('_fcReadModel.fcRegularForecast === undefined'),
         'D2  and the failed slice is ABSENT rather than []');
      eq(w.get('_fcSliceRec_("regular").state'), 'REFUSED', 'D3  the failed slice is REFUSED');
      eq(w.get('_fcSliceRec_("bootstrap").state'), 'CURRENT', 'D4  the one that worked is CURRENT');
      eq(w.state.errors, 0, 'D5  and the whole page is NOT replaced by a refusal — there is real data on it');
      ok(w.state.banners.filter(Boolean).length > 0, 'D6  the page says which part it could not load',
         w.state.banners);
    });
  });

  step(function () {
    var w = world({ tab: 'regular', answers: { bootstrap: 'fail' } });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      ok(w.get('_fcHas_("fcRegularForecast")'),
         'D7  the active slice succeeded while bootstrap failed — the rows are on screen');
      eq(w.get('_fcSliceRec_("bootstrap").state'), 'REFUSED', 'D8  and bootstrap is REFUSED');
      eq(w.get('_fcGetTargetRules()'), null,
         'D9  with the Target Rule authority UNAVAILABLE rather than empty — the modal must refuse');
    });
  });

  step(function () {
    // A background refresh that fails over good data keeps the data and says it is old.
    var w = world({ tab: 'regular' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      var before = w.get('_fcReadModel.fcRegularForecast.length');
      w.reset(); w.answer('regular', 'fail');
      w.run('_fcReadbackFlight_ = false; _fcRefreshViewNow_("x", "COLD_READ");');
      return w.settle().then(function () {
        eq(w.get('_fcReadModel.fcRegularForecast.length'), before,
           'D10 a failed refresh KEEPS the rows it already had');
        eq(w.get('_fcSliceRec_("regular").state'), 'STALE',
           'D11 and calls them STALE — real, and older than we would like');
        eq(w.state.errors, 0, 'D12 never a refusal over data that is on screen');
      });
    });
  });

  step(function () {
    // Nothing in memory and nothing arrives: THAT is a refusal, and it must not read as empty.
    var w = world({ tab: 'regular', answers: { bootstrap: 'fail', regular: 'fail' } });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      eq(w.get('_fcReadModel'), null, 'D13 a cold mount that failed entirely holds NO model');
      ok(w.state.errors > 0, 'D14 and renders a refusal — never an empty table');
      eq(w.get('_fcGetTargetRules()'), null, 'D15 the Target Rule authority is unavailable, not empty');
    });
  });

  // ---------------------------------------------------------------- E. OWNERSHIP
  step(function () {
    section('E  Late answers, and answers about the wrong question');
    var w = world({ tab: 'regular', hold: ['regular'] });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset();
      w.run('__epoch = 2;');          // routed away while the regular slice is still in flight
      w.release('regular');
      return w.settle().then(function () {
        eq(w.state.hydrations, 0, 'E1  a response arriving after the route changed draws NOTHING');
      });
    });
  });

  step(function () {
    // Tab A's answer may not be installed as tab B's data.
    var w = world({ tab: 'regular', answers: { regular: 'wrong' } });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      eq(w.get('_fcSliceRec_("regular").state'), 'REFUSED',
         'E2  a response labelled as a different slice is REFUSED, not merged');
      ok(w.get('_fcReadModel === null || _fcReadModel.fcRegularForecast === undefined'),
         'E3  and nothing of it reaches the model');
    });
  });

  step(function () {
    // The deployment-order guard: an R13 backend ignores include.slice and answers FULL.
    var w = world({ tab: 'regular', answers: { bootstrap: 'full', regular: 'full' } });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      ok(w.get('_fcHas_("fcRegularForecast")') && w.get('_fcHas_("fcTargetRules")'),
         'E4  a server that answers FULL instead of a slice is accepted — more than asked for is not a failure');
      eq(w.state.errors, 0, 'E5  so a backend rollback degrades to slow, never to broken');
    });
  });

  // ---------------------------------------------------------------- F. POST-WRITE
  step(function () {
    section('F  A one-row write never re-reads the workspace');
    var w = world({ tab: 'target' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset();
      w.run('__cb = 0; _fcAfterWriteScoped_({ slice: FC_SLICE_.RULES, merged: true }, function () { __cb++; });');
      return w.settle().then(function () {
        eq(w.log, [], 'F1  a Target Rule save whose receipt merged issues ZERO requests');
        eq(w.get('__cb'), 1, 'F2  and the confirmed write is still reported');
        eq(w.get('_fcViewState_'), 'CURRENT', 'F3  with the view declared current, because it is');
      });
    });
  });

  step(function () {
    var w = world({ tab: 'regular' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset();
      w.run('_fcAfterWriteScoped_(FC_SLICE_.REGULAR, function () {});');
      return w.settle().then(function () {
        eq(w.log, ['regular'], 'F4  a Base FC save reconciles through the REGULAR slice only');
        ok(w.log.indexOf('FULL') === -1 && w.log.indexOf('bootstrap') === -1,
           'F5  never the workspace, never the bootstrap it did not touch', w.log);
      });
    });
  });

  step(function () {
    var w = world({ tab: 'regular' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset();
      w.run('_fcAfterWriteScoped_(FC_SLICE_.EVENTS, function () {});');
      return w.settle().then(function () {
        eq(w.log, ['events'], 'F6  a Special Event save reconciles through the EVENTS slice');
      });
    });
  });

  step(function () {
    // A readback failure downgrades the VIEW, never the WRITE.
    var w = world({ tab: 'regular', answers: { regular: 'fail' } });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.answer('regular', 'ok');
      w.run('_fcSummaryEnsureDbAndRender();');
      return w.settle().then(function () {
        w.reset(); w.answer('regular', 'fail');
        w.run('__cb = 0; _fcAfterWriteScoped_(FC_SLICE_.REGULAR, function () { __cb++; });');
        return w.settle().then(function () {
          eq(w.get('__cb'), 1, 'F7  the confirmed write is reported BEFORE the readback is attempted');
          ok(w.get('_fcHas_("fcRegularForecast")'), 'F8  and a failed readback keeps the rows');
          eq(w.get('_fcViewState_'), 'STALE_AFTER_CONFIRMED_WRITE',
             'F9  the VIEW is downgraded, never the write');
        });
      });
    });
  });

  // ---------------------------------------------------------------- G. TARGET RULE FAIL-CLOSED
  step(function () {
    section('G  The Target Rule modal: NEW only after an authoritative read');
    var w = world({ tab: 'target' });
    // Nothing read yet.
    eq(w.get('_fcGetTargetRules()'), null, 'G1  INITIAL_LOADING: the authority is unavailable, not empty');
    ok(w.get('_trExistingRules_() && _trExistingRules_().targetRuleRowsUnavailable === true'),
       'G2  so the modal sees the UNAVAILABLE sentinel and fails closed');
    // The broad cache is present and empty — the exact shape that used to prove "no rules exist".
    w.run('window._opDbCache = { fcTargetRules: [] };'
        + 'KM.DB.getFcTargetRules = function () { return window._opDbCache.fcTargetRules; };');
    eq(w.get('_fcGetTargetRules()'), null,
       'G3  a broad cache answering [] CANNOT prove canonical emptiness — the fail-open is closed');
    ok(w.get('_trExistingRules_() && _trExistingRules_().targetRuleRowsUnavailable === true'),
       'G4  and the modal still refuses');
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      ok(Array.isArray(w.get('_fcGetTargetRules()')) && w.get('_fcGetTargetRules().length') === 1,
         'G5  after an authoritative read the rules are a real list again');
      ok(Array.isArray(w.get('_trExistingRules_()')), 'G6  and the modal gets rows to match against');
    });
  });

  step(function () {
    // A SUCCESSFUL read of a database with no matching rule still proves NEW. This must not regress.
    var w = world({ tab: 'target', answers: { bootstrap: 'zero' } });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      eq(w.get('_fcGetTargetRules()'), [],
         'G7  a successful read that finds zero rules returns an EMPTY LIST — a proven answer');
      eq(w.get('_trExistingRules_()'), [],
         'G8  and the modal may assert NEW from it, exactly as before');
      eq(w.get('_fcSliceRec_("bootstrap").state'), 'CURRENT', 'G9  because the read genuinely succeeded');
    });
  });

  step(function () {
    // A failed read AFTER a good one: the rules are stale, not absent, and not silently NEW.
    var w = world({ tab: 'target' });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.answer('rules', 'fail');
      w.run('_fcSliceFetch_("rules").catch(function () {});');
      return w.settle().then(function () {
        eq(w.get('_fcGetTargetRules().length'), 1, 'G10 a failed refresh keeps the rules that were proved');
        eq(w.get('_fcSliceRec_("rules").state'), 'STALE', 'G11 and marks them stale');
      });
    });
  });

  step(function () {
    // Demo mode is untouched.
    var w = world({ tab: 'target', demo: true });
    eq(w.get('_trExistingRules_()'), null, 'G12 Demo mode still reports matching as not applicable');
  });

  // ---------------------------------------------------------------- H. RETRY SCOPE
  step(function () {
    section('H  Retry asks for what failed, and only that');
    var w = world({ tab: 'regular', answers: { regular: 'fail' } });
    w.run('_fcSummaryEnsureDbAndRender();');
    return w.settle().then(function () {
      w.reset(); w.answer('regular', 'ok');
      w.run('_fcRetryFailedSlices_();');
      return w.settle().then(function () {
        eq(w.log, ['regular'], 'H1  only the failed slice is re-requested');
        ok(w.get('_fcHas_("fcRegularForecast")'), 'H2  and it lands');
        eq(w.get('_fcSliceRec_("regular").state'), 'CURRENT', 'H3  and is current again');
        eq(w.get('_fcCandidateYears_'), ['2026', '2025'],
           'H4  the Year options survive a successful Retry — they do not fall back to ----');
        eq(w.state.banners[w.state.banners.length - 1], null,
           'H5  and the stale banner is cleared once nothing is stale');
      });
    });
  });

  // ---------------------------------------------------------------- I. SOURCE GUARDS
  step(function () {
    section('I  What the source may not contain');
    ok(!/_fcWorkspaceRefresh_\s*\(/.test(FCS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')),
       'I1  no live call to a full-workspace read remains in the page');
    ok(!/function\s+_fcWorkspaceRefresh_\s*\(/.test(FCS),
       'I2  and the function itself is gone, not merely unused');
    var live = FCS.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    var calls = (live.match(/getWorkspace\s*\(\s*'fcSummary'\s*,\s*([^)]*)\)/g) || []);
    ok(calls.length === 1 && /include:\s*\{\s*slice:/.test(calls[0]),
       'I3  the page has exactly ONE getWorkspace call site and it always names a slice', calls);
    ok(!/readTimeoutMs|60000|timeout\s*[:=]\s*\d{5,}/.test(live),
       'I4  no timeout was raised to make the symptom go away');
    ok(!/googleusercontent/.test(live), 'I5  and no redirect target is remembered anywhere');
    ok(!/localStorage\.(set|get)Item\s*\(\s*['"]fc(TargetRules|RegularForecast)/.test(live),
       'I6  no authoritative DB state is parked in localStorage');
    // The slice vocabulary the page sends must be the vocabulary the server answers.
    var SERVER = read('assets/specs/active/apps-script/58_api_v1_fc_summary_workspace.gs');
    ['bootstrap', 'regular', 'events', 'rules'].forEach(function (n, i) {
      ok(new RegExp("'" + n + "'").test(FCS) && new RegExp("(^|\\s)" + n + ":\\s*\\{").test(SERVER),
         'I7.' + (i + 1) + '  the "' + n + '" slice exists on both sides of the wire');
    });
  });

  // ---------------------------------------------------------------- J. CACHE TOKEN
  step(function () {
    section('J  Cache token');
    var toks = {};
    (INDEX.match(/[?&]v=([a-z0-9-]+)/g) || []).forEach(function (t) {
      var k = t.replace(/^[?&]v=/, ''); toks[k] = (toks[k] || 0) + 1;
    });
    // THE DOCUMENT CARRIES SEVERAL TOKEN FAMILIES AND ALWAYS HAS — map, toolbar and sku-read-path
    // assets rotate on their own rounds. Asserting 'exactly one token in the file' would assert
    // something that was never true and would fail on every round that is not this one. What this
    // round owns is the APPLICATION set, which is 39 references as of FC-SHARE-DUAL-MODEL-R1.
    // R2B-A3-R1 — DERIVED, not restated. This literal is precisely the equality-with-now that
    // _release-order.js exists to end: it was correct for exactly one round and then described the
    // token of the round before. The ledger is the single place a round appends to.
    var APP = require('./_release-order.js').currentAppToken();
    // FC-SHARE-DUAL-MODEL-R1 — 38 became 39: supply-planning-forecast-share.js (KMFCS) joined the
    // set as the ONE forecast-share normalizer, replacing a page-local formula.
    // S2-R4A — 39 became 40. assets/js/utils/data.js joined the co-deployed set. It is the SAME SHAPE as
    // the home.js case two entries above: it stood on `donenotice-20260811`, a token that is not in
    // ROUND_TOKENS at all, so staleAppTokenRefs skipped it and it could have shipped cached indefinitely
    // while every guard reported clean. This round deletes the legacy weeklyShippingPlans store and the
    // four DataRepo methods over it, one of which was named updateShippingPlanStatus — the same name as
    // the CANONICAL writer. A browser left on the old copy keeps a DataRepo that still answers to that
    // name over localStorage, which is the one residue this round exists to remove.
    // PRICING-R2 — the COUNT goes, and _release-order.js says why in its own words: appTokenRefCount is
    // "Reported, never pinned — a round that adds an asset moves this number, and that is not a defect."
    // R21 adds sku-regional-pricing.js and rotates the SKU Regional page and its stylesheet, so the count
    // moved again. What must hold is that NO member of the set was left behind on an older application
    // token, which is answerable and is what this line now asks. The specific members this suite cares
    // about are asserted by name immediately below, where leaving one behind still fails.
    eq(require('./_release-order.js').staleAppTokenRefs(INDEX), [],
      'J1  no asset is left behind on an older application token', toks);
    ok(toks[APP] >= 40, 'J1a and the co-deployed set has not shrunk (' + toks[APP] + ' references)');
    ['stagedhydration-r3r1-20260920', 'statuscard-r2ba2r5f6-20260919',
     'trseamrepair-r2ba2r5f5f1-20260919',
     'tgtrehydrate-r2ba2r5f5-20260919', 'fcroutemount-bootfcr2f1-20260919'].forEach(function (t, i2) {
      eq(toks[t], undefined, 'J2.' + (i2 + 1) + '  nothing left behind on ' + t);
    });
    ok(INDEX.indexOf('assets/js/pages/fc-summary.js?v=' + APP) > -1,
       'J3  and the file this round changed carries it');
    ok(INDEX.indexOf('assets/js/api/operation-system-db-api.js?v=' + APP) > -1,
       'J4  as does the adapter that changed with it');
  });

  // ---------------------------------------------------------------- K. MUTANTS
  step(function () {
    section('K  Mutants');
    var mutants = [];
    function mutant(name, fn) {
      var survived = false;
      var p;
      try { p = fn(); } catch (e) { p = Promise.resolve(false); }
      return Promise.resolve(p).then(function (v) { survived = (v === true); }, function () { survived = false; })
        .then(function () {
          mutants.push({ name: name, survived: survived });
          if (survived) { fail++; console.error('SURVIVED  ' + name); } else { pass++; }
        });
    }
    var savedFCS = FCS;
    function withMutation(find, replace, fn) {
      var next = savedFCS.split(find).join(replace);
      if (next === savedFCS) throw new Error('MUTATION WAS A NO-OP — anchor not found: ' + find.slice(0, 70));
      FCS = next;
      return Promise.resolve().then(fn).then(function (v) { FCS = savedFCS; return v; },
                                             function (e) { FCS = savedFCS; throw e; });
    }

    return Promise.resolve()
      // M1 — route re-entry starts re-fetching. The single largest win, undone.
      .then(function () { return mutant('M1  route re-entry re-fetches instead of drawing from memory', function () {
        return withMutation('  if (_fcModelUsable_(tab)) {', '  if (false) {', function () {
          var w = world({ tab: 'regular' });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () {
            w.reset(); w.run('_fcSummaryEnsureDbAndRender();');
            return w.settle().then(function () { return w.log.length === 0; });
          });
        });
      }); })
      // M2 — the inactive tab is fetched on mount.
      .then(function () { return mutant('M2  the mount also fetches the inactive tabs', function () {
        return withMutation("  if (!ridesBootstrap && !_fcSliceHasData_(want)) {",
                            "  [FC_SLICE_.REGULAR, FC_SLICE_.EVENTS].forEach(function (x) { _fcSliceFetch_(x).catch(function(){}); });\n  if (false) {", function () {
          var w = world({ tab: 'regular' });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () { return w.log.indexOf('events') === -1; });
        });
      }); })
      // M3 — the single-flight latch is removed: three clicks, three reads.
      .then(function () { return mutant('M3  a slice loses its single-flight latch', function () {
        return withMutation('  if (rec.flight) return rec.flight;', '  if (false) return rec.flight;', function () {
          var w = world({ tab: 'regular' });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () {
            w.reset();
            w.run('_fcEnsureTabSlice_("event"); _fcEnsureTabSlice_("event"); _fcEnsureTabSlice_("event");');
            return w.settle().then(function () { return w.log.length === 1; });
          });
        });
      }); })
      // M4 — a failed slice blanks the model instead of keeping what is real.
      .then(function () { return mutant('M4  a refusal erases data that is already on screen', function () {
        return withMutation('      rec.state = had ? FC_FRESH_.STALE : FC_FRESH_.REFUSED;',
                            '      _fcReadModel = null;\n      rec.state = had ? FC_FRESH_.STALE : FC_FRESH_.REFUSED;', function () {
          var w = world({ tab: 'regular', answers: { regular: 'fail' } });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () { return w.get('_fcHas_("fcTargetRules")') === true; });
        });
      }); })
      // M5 — THE FAIL-OPEN, RESTORED. An unread authority answers [] again.
      .then(function () { return mutant('M5  the Target Rule authority answers [] when unread', function () {
        return withMutation('  if (_fcWorkspaceMode_()) return null;   // UNREAD or REFUSED — never a proven-empty list',
                            '  if (_fcWorkspaceMode_()) return [];', function () {
          var w = world({ tab: 'target' });
          return Promise.resolve(w.get('_fcGetTargetRules()') === null);
        });
      }); })
      // M6 — a slice merges keys it does not own, so one tab can overwrite another.
      .then(function () { return mutant('M6  a slice installs keys it never asked for', function () {
        return withMutation("    if (Array.isArray(adapted[k])) { _fcReadModel[k] = adapted[k]; landed.push(k); }",
                            "    _fcReadModel[k] = adapted[k] || []; landed.push(k);", function () {
          var w = world({ tab: 'regular' });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () { return w.get('_fcReadModel.fcSpecialEvents === undefined'); });
        });
      }); })
      // M7 — post-write goes back to reading everything.
      .then(function () { return mutant('M7  a one-row write reconciles by reading every slice', function () {
        return withMutation("  var _slice = _sc.slice || _FC_TAB_SLICE_[_fcTabNow_()] || FC_SLICE_.REGULAR;",
                            "  var _slice = FC_SLICE_.BOOTSTRAP; _fcSliceFetch_(FC_SLICE_.REGULAR).catch(function(){}); _fcSliceFetch_(FC_SLICE_.EVENTS).catch(function(){});", function () {
          var w = world({ tab: 'regular' });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () {
            w.reset();
            w.run('_fcAfterWriteScoped_(FC_SLICE_.REGULAR, function () {});');
            return w.settle().then(function () { return w.log.length === 1 && w.log[0] === 'regular'; });
          });
        });
      }); })
      // M8 — a complete receipt still triggers a read.
      .then(function () { return mutant('M8  a merged receipt still asks the server', function () {
        return withMutation('  if (_sc.merged) {   // the receipt was complete and is already in the model',
                            '  if (false) {', function () {
          var w = world({ tab: 'target' });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () {
            w.reset();
            w.run('_fcAfterWriteScoped_({ slice: FC_SLICE_.RULES, merged: true }, function () {});');
            return w.settle().then(function () { return w.log.length === 0; });
          });
        });
      }); })
      // M9 — a response about another slice is merged anyway.
      .then(function () { return mutant('M9  a mismatched slice answer is accepted', function () {
        return withMutation('      if (!isFull && String(d.slice || \'\') !== name) {', '      if (false) {', function () {
          var w = world({ tab: 'regular', answers: { regular: 'wrong' } });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () { return w.get('_fcSliceRec_("regular").state') === 'REFUSED'; });
        });
      }); })
      // M10 — a late answer draws after the route changed.
      .then(function () { return mutant('M10 an unmounted response mutates the page', function () {
        return withMutation('    if (!_fcOwns_(epoch)) return;            // routed away mid-flight: draw nothing',
                            '    if (false) return;', function () {
          var w = world({ tab: 'regular', hold: ['regular'] });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () {
            w.reset(); w.run('__epoch = 2;'); w.release('regular');
            return w.settle().then(function () { return w.state.hydrations === 0; });
          });
        });
      }); })
      // M11 — the filter universe is derived from whatever rows happen to be loaded.
      .then(function () { return mutant('M11 the Year list is derived from rows instead of the facets', function () {
        return withMutation('  if (_fcReadModel.facets && Array.isArray(_fcReadModel.facets.years)) _fcCandidateYears_ = _fcReadModel.facets.years;',
                            '  if (false) _fcCandidateYears_ = null;', function () {
          var w = world({ tab: 'target' });     // bootstrap only: no Regular rows to derive years from
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () {
            return JSON.stringify(w.get('_fcCandidateYears_')) === JSON.stringify(['2026', '2025']);
          });
        });
      }); })
      // M12 — Retry asks for everything again.
      .then(function () { return mutant('M12 Retry re-requests every slice', function () {
        return withMutation('  if (!bad.length) bad = [_FC_TAB_SLICE_[_fcTabNow_()] || FC_SLICE_.REGULAR];',
                            '  bad = [FC_SLICE_.BOOTSTRAP, FC_SLICE_.REGULAR, FC_SLICE_.EVENTS];', function () {
          var w = world({ tab: 'regular', answers: { regular: 'fail' } });
          w.run('_fcSummaryEnsureDbAndRender();');
          return w.settle().then(function () {
            w.reset(); w.answer('regular', 'ok');
            w.run('_fcRetryFailedSlices_();');
            return w.settle().then(function () { return w.log.length === 1; });
          });
        });
      }); })
      .then(function () {
        console.log('    ' + mutants.length + ' mutants, '
          + mutants.filter(function (m) { return m.survived; }).length + ' survived');
        console.log('\n================================================================');
        console.log('FC-SUMMARY-R3-R1 §C STAGED HYDRATION:  ' + pass + ' passed, ' + fail + ' failed, '
          + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');
        process.exit(fail === 0 ? 0 : 1);
      });
  });

  P.catch(function (e) {
    console.error('HARNESS ERROR: ' + (e && e.stack || e));
    process.exit(1);
  });
})();
