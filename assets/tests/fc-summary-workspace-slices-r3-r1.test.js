// Kitchen Mama Operation System — FC-SUMMARY-R3-R1 §B
// SLICES ON ONE ACTION, AND ONE SHEETS READ PER SHEET
// Run: node assets/tests/fc-summary-workspace-slices-r3-r1.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime, no writes.
//
// The only fake is the spreadsheet — the one thing that cannot exist outside Apps Script, and whose every
// method is a billed round trip, which is why counting them IS the measurement. The handler, the IO, the
// schema validation and the KMSAFE classifier calls are the committed source, executed.
//
// THREE THINGS THIS SUITE EXISTS TO STOP.
//
//   1. A slice that quietly changes the FULL answer. FULL is what every deployed caller receives until the
//      frontend ships, and the backend deploys FIRST, so a FULL that drifted by one key would break the page
//      that is already live. Section A pins it against the pre-R3-R1 shape.
//   2. A "cheaper" read that is cheaper because it stopped checking something. Section C drives every refusal
//      the old two-read path could produce and requires the same token from the one-read path.
//   3. A facet set that is not the set the page would have built for itself. Section D derives the universes
//      from the same rows through the page's own rule and compares.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
var ASD = path.join(REPO, 'assets', 'specs', 'active', 'apps-script');
// LINE ENDINGS ARE NORMALISED ON READ, DELIBERATELY. The .gs sources are CRLF, and every mutation
// anchor in this file is written with a bare newline. An anchor that silently fails to match leaves the
// source unmutated and reports the mutant as SURVIVED — a false green indistinguishable from a missing
// assertion, which is exactly what happened on the first run of this suite. Normalising here removes the
// whole class. Extraction and the regex checks below are unaffected by line endings.
function readGs(f) { return fs.readFileSync(path.join(ASD, f), 'utf8').split('\r\n').join('\n'); }

var WS = readGs('58_api_v1_fc_summary_workspace.gs');
var SAFE = readGs('29_production_safety_adapter.gs');
var HEALTH = readGs('63_api_v1_system_health.gs');
var ROUTER = readGs('01_router.gs');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 96 - n.length)).join('-')); }

var R14 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R14';
var R13 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R13';

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

// ------------------------------------------------------------------ the fixture ------------------
// Small, but shaped exactly like production: the two tables whose requiredCols are non-empty, a table with a
// blank trailing row, and values that make the facet sets non-trivial (duplicates, blanks, mixed order).
function fixture() {
  return {
    fc_regular_forecast: {
      header: ['forecast_id', 'sku', 'year', 'company', 'country', 'marketplace', 'category', 'series', 'jan', 'dec'],
      rows: [
        ['f1', 'CO1100-R', '2026', 'RESUS', 'US', 'AMAZON', 'Openers', 'CO1100', 10, 20],
        ['f2', 'CO1100-B', '2026', 'RESUS', 'US', 'AMAZON', 'Openers', 'CO1100', 11, 21],
        ['f3', 'KM2200-A', '2025', 'RESUS', 'CA', 'SHOPIFY', 'Grinders', 'KM2200', 12, 22],
        ['f4', 'KM2200-B', '2027', 'KMJP', 'JP', 'RAKUTEN', '', 'KM2200', 13, 23],
        ['', '', '', '', '', '', '', '', '', '']
      ]
    },
    fc_special_events: {
      header: ['event_fc_id', 'campaign_id', 'sku', 'year', 'event', 'event_name'],
      rows: [
        ['e1', 'c1', 'CO1100-R', '2026', 'Prime Day', ''],
        ['e2', 'c1', 'CO1100-B', '2026', '', 'Black Friday'],
        ['e3', 'c1', 'KM2200-A', '2026', 'Prime Day', '']
      ]
    },
    fc_target_rules: {
      header: ['target_rule_id', 'scope_type', 'scope_id', 'year', 'company', 'country', 'marketplace', 'oct_pct'],
      rows: [
        ['tr1', 'SERIES', 'CO1100', '2026', 'RESUS', 'US', 'AMAZON', 110],
        ['tr2', 'SKU', 'CO1100-R', '2026', 'RESUS', 'US', 'AMAZON', 150]
      ]
    },
    marketplaces: {
      header: ['marketplace', 'company', 'country', 'status'],
      rows: [['AMAZON', 'RESUS', 'US', 'active'], ['SHOPIFY', 'RESUS', 'CA', 'active']]
    }
  };
}

function makeRuntime(opts) {
  opts = opts || {};
  var data = opts.data || fixture();
  var calls = [];
  function note(op, sheet) { calls.push({ op: op, sheet: sheet || '' }); }

  function makeSheet(name) {
    var t = data[name];
    var all = [t.header].concat(t.rows);
    return {
      getName: function () { return name; },
      getLastRow: function () { note('getLastRow', name); return all.length; },
      getLastColumn: function () { note('getLastColumn', name); return t.header.length; },
      getRange: function (r1, c1, nr, nc) {
        return { getValues: function () {
          note('getRange.getValues', name);
          var out = []; for (var i = 0; i < nr; i++) out.push((all[r1 - 1 + i] || []).slice(c1 - 1, c1 - 1 + nc));
          return out;
        } };
      },
      getDataRange: function () {
        return { getValues: function () { note('getDataRange.getValues', name); return all; } };
      }
    };
  }
  var sheets = {};
  Object.keys(data).forEach(function (n) { if (!opts.absent || opts.absent.indexOf(n) === -1) sheets[n] = makeSheet(n); });

  var sb = { console: console, JSON: JSON, Date: Date, String: String, Number: Number,
             Array: Array, Object: Object, Error: Error, Math: Math };
  sb.PRODUCTION_DB_SPREADSHEET_ID_ = opts.configuredId === undefined ? 'DB' : opts.configuredId;
  var SS = {
    getId: function () { note('getId'); return opts.actualId === undefined ? 'DB' : opts.actualId; },
    getSheetByName: function (n) { note('getSheetByName', n); return sheets[n] || null; }
  };
  sb.SpreadsheetApp = { openById: function () { note('openById'); return SS; } };
  sb.KMSAFE = {
    assertExpectedSpreadsheetId: function (ss, expected) {
      if (!ss || typeof ss.getId !== 'function') throw new Error('WRONG_SPREADSHEET_TARGET');
      if (String(expected) === '') throw new Error('WRONG_SPREADSHEET_TARGET');
      if (String(ss.getId()) !== String(expected)) throw new Error('WRONG_SPREADSHEET_TARGET');
      return { ok: true };
    },
    classifySchemaMismatch: function (req) {
      if (opts.classifyInvalid) return { valid: false, schemaStatus: 'HEADER_DUPLICATE', actual: req.actualHeaders };
      return { valid: true, schemaStatus: 'OK' };
    }
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

  return {
    sb: sb, calls: calls, data: data,
    call: function (body) {
      calls.length = 0;
      sb.__body = body || {};
      return vm.runInContext('handleFcSummaryWorkspaceGet_(__body, undefined)', sb);
    },
    cellReads: function () { return calls.filter(function (c) { return /getValues/.test(c.op); }); },
    perSheet: function () {
      var m = {};
      calls.filter(function (c) { return /getValues/.test(c.op); })
           .forEach(function (c) { m[c.sheet] = (m[c.sheet] || 0) + 1; });
      return m;
    }
  };
}

// ==================================================================================================
section('A  FULL is exactly what it was — the backend deploys before the frontend');
// ==================================================================================================
var rt = makeRuntime();
var full = rt.call({ action: 'fcSummary.workspace.get' });

ok(full.success === true, 'A1  FULL answers successfully');
eq(Object.keys(full.data).sort(),
   ['capped', 'counts', 'fcRegularForecast', 'fcSpecialEvents', 'fcTargetRules', 'marketplaces', 'summary'],
   'A2  FULL returns exactly the seven pre-R3-R1 keys and no more');
eq(full.data.counts, { fcRegularForecast: 4, fcSpecialEvents: 3, fcTargetRules: 2, marketplaces: 2 },
   'A3  the blank trailing row is dropped, as it always was');
eq(full.data.summary.years, ['2027', '2026', '2025'], 'A4  summary.years keeps its descending-numeric order');
eq(full.data.fcTargetRules[1].target_rule_id, 'tr2', 'A5  rows are still raw passthrough under the sheet\'s own column names');
ok(full.data.facets === undefined, 'A6  FULL gains NO facets key — a new key is a shape change to a live caller');
ok(full.data.slice === undefined, 'A7  and no slice key');
eq(full.meta.tablesRead, 4, 'A8  FULL still reads all four tables');
eq(full.meta.slice, 'full', 'A9  meta names the slice, which is additive and safe');
eq(full.meta.workspaceBuild, R14, 'A10 and carries the owner\'s build stamp');

// An unknown or blank slice is FULL, not an error. A client one version ahead must never be able to make
// the server refuse; it must simply receive everything, which is what it would have received anyway.
// (' BOOTSTRAP ' is NOT in this list: fcsResolveSlice_ trims and lowercases on purpose, so a loosely
// spelled slice name resolves to the slice the caller meant rather than silently widening to FULL.)
['', null, undefined, 'nonsense', 'regular-ish', 0, {}].forEach(function (v, i) {
  var r = rt.call({ payload: { include: { slice: v } } });
  ok(r.success === true && r.data.fcRegularForecast !== undefined && r.data.slice === undefined,
     'A11.' + (i + 1) + '  an unrecognised slice (' + JSON.stringify(v) + ') falls back to FULL');
});
var summaryOff = rt.call({ payload: { include: { summary: false } } });
ok(summaryOff.data.summary === null, 'A12 include.summary:false still suppresses the summary');

// ==================================================================================================
section('B  One read per sheet, and only the sheets the slice needs');
// ==================================================================================================
rt.call({ action: 'fcSummary.workspace.get' });
var fullPer = rt.perSheet();
console.log('    FULL cell-transferring reads per sheet: ' + JSON.stringify(fullPer));
eq(fullPer, { fc_regular_forecast: 1, fc_special_events: 1, fc_target_rules: 1, marketplaces: 1 },
   'B1  every sheet is read EXACTLY once — the six redundant header reads are gone');
eq(rt.cellReads().length, 4, 'B2  four cell transfers for four tables');
eq(rt.calls.filter(function (c) { return c.op === 'getId'; }).length, 1,
   'B3  the spreadsheet id is asserted ONCE per request, not once per table');
eq(rt.calls.filter(function (c) { return /getLastRow|getLastColumn/.test(c.op); }).length, 0,
   'B4  no getLastRow/getLastColumn round trips: the full-sheet scan already knows both');
eq(rt.calls.length, 10, 'B5  ten Sheets service calls in total, down from the measured thirty');

var boot = rt.call({ payload: { include: { slice: 'bootstrap' } } });
console.log('    bootstrap reads: ' + JSON.stringify(rt.perSheet()));
eq(rt.perSheet(), { fc_regular_forecast: 1, fc_special_events: 1, fc_target_rules: 1, marketplaces: 1 },
   'B6  bootstrap reads all four ONCE — it needs the Regular rows to derive the facets');

var reg = rt.call({ payload: { include: { slice: 'regular' } } });
eq(rt.perSheet(), { fc_regular_forecast: 1 }, 'B7  the regular slice reads ONE sheet');
eq(reg.meta.tablesRead, 1, 'B8  and says so');

var rules = rt.call({ payload: { include: { slice: 'rules' } } });
eq(rt.perSheet(), { fc_target_rules: 1 }, 'B9  the rules slice — the post-write path — reads ONE sheet');
var evs = rt.call({ payload: { include: { slice: 'events' } } });
eq(rt.perSheet(), { fc_special_events: 1 }, 'B10 the events slice reads ONE sheet');

// ==================================================================================================
section('C  Every refusal the two-read path could produce, from the one-read path');
// ==================================================================================================
function tokenOf(env) { return (env.errors && env.errors[0] && env.errors[0].code) || null; }

var wrongId = makeRuntime({ actualId: 'SOMETHING-ELSE' }).call({});
eq(tokenOf(wrongId), 'WRONG_SPREADSHEET_TARGET', 'C1  a spreadsheet that is not the configured one is refused');
ok(wrongId.success === false && wrongId.data === null, 'C2  and returns no data at all');

var blankCfg = makeRuntime({ configuredId: '' }).call({});
eq(tokenOf(blankCfg), 'WRONG_SPREADSHEET_TARGET', 'C3  a blank configured id fails closed, never "use whatever is open"');

var missing = makeRuntime({ absent: ['fc_target_rules'] }).call({});
eq(tokenOf(missing), 'SCHEMA_NOT_PROVISIONED', 'C4  an absent sheet is named, not skipped');

var noHeaderData = fixture(); noHeaderData.marketplaces = { header: [''], rows: [] };
eq(tokenOf(makeRuntime({ data: noHeaderData }).call({})), 'HEADER_MISSING',
   'C5  a sheet whose header row is entirely blank is refused');

var emptyData = fixture(); emptyData.fc_special_events = { header: [], rows: [] };
eq(tokenOf(makeRuntime({ data: emptyData }).call({})), 'HEADER_MISSING', 'C6  so is one with no header at all');

var noSku = fixture();
noSku.fc_regular_forecast.header = ['forecast_id', 'year', 'company', 'country', 'marketplace', 'category', 'series', 'jan', 'dec'];
noSku.fc_regular_forecast.rows = noSku.fc_regular_forecast.rows.map(function (r) { return r.slice(0, 1).concat(r.slice(2)); });
var missingCol = makeRuntime({ data: noSku }).call({});
eq(tokenOf(missingCol), 'MISSING_REQUIRED_HEADER', 'C7  a missing REQUIRED column still fails closed');
eq(missingCol.errors[0].details, { missing: ['sku'] }, 'C8  and still names which column');

eq(tokenOf(makeRuntime({ classifyInvalid: true }).call({})), 'HEADER_DUPLICATE',
   'C9  whatever KMSAFE.classifySchemaMismatch decides is still the token — the classifier is still consulted');

// A refusal must be a refusal in every slice, not only in FULL.
['bootstrap', 'regular', 'rules', 'events'].forEach(function (s, i) {
  var env = makeRuntime({ actualId: 'ELSEWHERE' }).call({ payload: { include: { slice: s } } });
  ok(env.success === false && env.data === null && tokenOf(env) === 'WRONG_SPREADSHEET_TARGET',
     'C10.' + (i + 1) + '  the ' + s + ' slice fails closed too, with no partial data');
});
var errEnv = makeRuntime({ absent: ['fc_regular_forecast'] }).call({ payload: { include: { slice: 'regular' } } });
eq(errEnv.meta.slice, 'regular', 'C11 a failed slice still reports WHICH slice failed, so the client can retry only that one');

// ==================================================================================================
section('D  The facets are the universes the page would have built for itself');
// ==================================================================================================
var bootEnv = makeRuntime().call({ payload: { include: { slice: 'bootstrap' } } });
var F = bootEnv.data.facets;
console.log('    facets: ' + JSON.stringify(F));

// The page's own rule, re-implemented HERE from fc-summary.js: trim, drop blanks, default sort. If the server
// and this disagree, one of them changed what an operator can select.
var FCS_PAGE = fs.readFileSync(path.join(REPO, 'assets/js/pages/fc-summary.js'), 'utf8');
ok(/function distinct\(arr\)[\s\S]{0,260}\.sort\(\);\s*\}/.test(FCS_PAGE),
   'D0  the page still builds its universes with trim / drop-blank / default sort');

function pageDistinct(rows, field) {
  var o = [], s = {};
  rows.forEach(function (r) { var v = String(r[field] == null ? '' : r[field]).trim(); if (v && !s[v]) { s[v] = 1; o.push(v); } });
  return o.sort();
}
var fx = fixture();
var regRows = fx.fc_regular_forecast.rows.map(function (r) {
  var o = {}; fx.fc_regular_forecast.header.forEach(function (h, i) { o[h] = r[i]; }); return o;
}).filter(function (o) { return String(o.sku).trim() !== '' || String(o.forecast_id).trim() !== ''; });

eq(F.companies, pageDistinct(regRows, 'company'), 'D1  companies');
eq(F.countries, pageDistinct(regRows, 'country'), 'D2  countries');
eq(F.marketplaces, pageDistinct(regRows, 'marketplace'), 'D3  marketplaces');
eq(F.categories, pageDistinct(regRows, 'category'), 'D4  categories — and the blank one is dropped, not listed');
eq(F.series, pageDistinct(regRows, 'series'), 'D5  series');
eq(F.years, ['2027', '2026', '2025'], 'D6  years keep the dropdown\'s descending-numeric order');

// The event facet coalesces event || event_name per ROW, the way the normalizer does. Picking one column and
// falling back only if it was entirely empty would silently drop the rows that use the other.
eq(F.events, ['Black Friday', 'Prime Day'],
   'D7  events coalesce event || event_name PER ROW, so a table using both loses nothing');

ok(bootEnv.data.fcRegularForecast === undefined,
   'D8  bootstrap does NOT carry the Regular Forecast rows');
eq(bootEnv.data.counts.fcRegularForecast, 4,
   'D9  but it states how many exist — "not asked for" and "none there" must stay different facts');
eq(Object.keys(bootEnv.data).sort(),
   ['capped', 'counts', 'facets', 'fcTargetRules', 'marketplaces', 'observed_at', 'row_count', 'slice'].sort(),
   'D10 and it carries Target Rules, which is what lets the modal prove NEW safely');
// THE ASYMMETRY, ASSERTED. Special Events are just as small as Target Rules and are deliberately absent:
// Target Rules gate a CONTROL (the modal may not assert NEW without them), Special Events gate nothing,
// and shipping a tab nobody opened is the eager read this round exists to remove.
ok(bootEnv.data.fcSpecialEvents === undefined,
   'D10a and NOT the Special Events — small is not a reason to fetch a tab nobody has opened');
eq(bootEnv.data.counts.fcSpecialEvents, undefined,
   'D10b which it does not pretend to have counted either');
ok(typeof bootEnv.data.observed_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(bootEnv.data.observed_at),
   'D11 every slice is stamped with when it was observed', bootEnv.data.observed_at);

var regEnv = makeRuntime().call({ payload: { include: { slice: 'regular' } } });
ok(regEnv.data.fcSpecialEvents === undefined && regEnv.data.fcTargetRules === undefined,
   'D12 a slice OMITS the keys it does not own rather than sending []');
eq(regEnv.data.row_count, 4, 'D13 and reports its own row count');
eq(regEnv.data.capped, { fcRegularForecast: false }, 'D14 and its own capped flags');

// ==================================================================================================
section('E  Release identity and the manifest');
// ==================================================================================================
ok(new RegExp("var FCSWS_BUILD_VERSION_ = '" + R14 + "'").test(WS), 'E1  58_ declares R14');
ok(new RegExp("var SYS_BUILD_VERSION_ = '" + R14 + "'").test(HEALTH), 'E2  63_ declares R14');
ok(new RegExp("var SYS_DEPLOYMENT_RELEASE_ = '" + R14 + "'").test(HEALTH), 'E3  the release is R14');

var row58 = /\{ file: '58_api_v1_fc_summary_workspace\.gs', symbol: '([A-Z_]+)', expected: '([^']+)'/.exec(HEALTH);
ok(!!row58, 'E4  58_ now has a manifest row');
if (row58) {
  eq(row58[1], 'FCSWS_BUILD_VERSION_', 'E5  keyed on the symbol 58_ actually declares');
  eq(row58[2], R14, 'E6  and expected at R14');
}
ok(!/optional: true/.test(row58 ? HEALTH.slice(row58.index, HEALTH.indexOf('}', row58.index)) : 'optional: true'),
   'E7  it is REQUIRED — an absent FC read owner is not an acceptable deployment');

// The files that must not have moved. A release that marched an unchanged file would put it on the sync
// list and destroy the signal that says which files a project is actually missing.
[['14_fc_write_handlers.gs', R13], ['13_procurement_handlers.gs', 'R6-R7-R12'],
 ['00_config.gs', 'R6-R7-R11'], ['01_router.gs', 'R6-R7-R9'],
 ['72_api_v1_product_pricing_workspace.gs', 'R6-R7-R10']].forEach(function (p, i) {
  var m = new RegExp("\\{ file: '" + p[0].replace(/\./g, '\\.') + "', symbol: '[A-Z_]+', expected: '([^']+)'").exec(HEALTH);
  ok(!!m && m[1].indexOf(p[1]) !== -1, 'E8.' + (i + 1) + '  ' + p[0] + ' still expects ' + p[1], m && m[1]);
});
ok(/KM_BUNDLE_CONTENT_HASH_', expected: '830563effc604ba55a70424d8f7b95c627ae0bc4ce84aa981833fb75ac2ed64f'/.test(HEALTH),
   'E9  the generated bundle hash is untouched — no rebuild');
ok(!/R6-R7-R14/.test(ROUTER), 'E10 01_router.gs is not part of this release');
ok(/action === 'fcSummary\.workspace\.get'/.test(ROUTER) && /handleFcSummaryWorkspaceGet_\(body\)/.test(ROUTER),
   'E11 and still dispatches the SAME action — no new routed action was invented');

var SAFE_NOW = SAFE;
ok(/function prodRequireColumns_/.test(SAFE_NOW) && /function prodRequireSheet_/.test(SAFE_NOW),
   'E12 29_production_safety_adapter.gs still exports both validators, unmodified — every other read owner uses them');

// ==================================================================================================
section('F  Mutants');
// ==================================================================================================
var mutants = [];
function mutant(name, fn) {
  var survived = false;
  try { survived = fn() === true; } catch (e) { survived = false; }
  mutants.push({ name: name, survived: survived });
  if (survived) { fail++; console.error('SURVIVED  ' + name); } else { pass++; }
}
// A mutation that does not change the source is not a mutation, and a mutant that "survives" one is
// reporting on a moved anchor rather than on the code. withMutation throws instead.
function withMutation(find, replace, fn) {
  var saved = WS;
  try {
    var next = WS.split(find).join(replace);
    if (next === saved) throw new Error('MUTATION WAS A NO-OP — anchor not found: ' + find.slice(0, 60));
    WS = next;
    return fn();
  } finally { WS = saved; }
}

// Every mutant below goes through withMutation, which refuses a no-op. Two of these first appeared to
// survive against an anchor that could not match the CRLF source — a false green indistinguishable from
// a missing assertion, and the reason that guard exists.

// M1 — bootstrap starts shipping the Regular rows. The whole point of the slice.
mutant('M1  bootstrap emits fcRegularForecast', function () {
  return withMutation("emits: ['fcTargetRules', 'marketplaces'],",
                      "emits: ['fcRegularForecast', 'fcTargetRules', 'marketplaces'],",
    function () {
      return makeRuntime().call({ payload: { include: { slice: 'bootstrap' } } }).data.fcRegularForecast === undefined;
    });
});
// M2 — a slice reads a sheet it does not need. Each extra sheet is a service call nobody asked for.
mutant('M2  the regular slice also reads fc_special_events', function () {
  return withMutation("regular: { reads: ['fc_regular_forecast']",
                      "regular: { reads: ['fc_regular_forecast', 'fc_special_events']",
    function () {
      var r = makeRuntime(); r.call({ payload: { include: { slice: 'regular' } } });
      return Object.keys(r.perSheet()).length === 1;
    });
});
// M3 — the header validation is dropped from the one-read path, which is the cheap way to be "faster".
mutant('M3  fcsValidateHeader_ stops checking required columns', function () {
  var noSkuData = fixture();
  noSkuData.fc_regular_forecast.header = ['forecast_id', 'year'];
  return withMutation("if (missing.length) throw prodSchemaError_('MISSING_REQUIRED_HEADER', name, { missing: missing });", '',
    function () { return tokenOf(makeRuntime({ data: noSkuData }).call({})) === 'MISSING_REQUIRED_HEADER'; });
});
// M4 — the id assertion is dropped now that it runs once per request instead of once per table.
mutant('M4  openTarget stops asserting the spreadsheet id', function () {
  return withMutation('      prodAssertDbTarget_(ss, id);\n', '',
    function () { return makeRuntime({ actualId: 'ELSEWHERE' }).call({}).success === false; });
});
// M5 — a facet is derived from a narrowed set, which is the behaviour change this design exists to avoid.
mutant('M5  facets are derived from the first row only', function () {
  return withMutation('  for (var i = 0; i < rows.length; i++) {\n    var v = \'\';',
                      '  for (var i = 0; i < Math.min(1, rows.length); i++) {\n    var v = \'\';',
    function () {
      var F2 = makeRuntime().call({ payload: { include: { slice: 'bootstrap' } } }).data.facets;
      return !!(F2 && F2.countries.length > 1);
    });
});
// M6 — a slice answers [] for a key it did not read, which is the fail-open the client repair is about.
mutant('M6  a slice emits [] for keys it does not own', function () {
  return withMutation('  var out = { slice: sliceName, observed_at: observedAt, counts: {}, capped: {}, row_count: 0 };',
    '  var out = { slice: sliceName, observed_at: observedAt, counts: {}, capped: {}, row_count: 0,\n'
    + '    fcRegularForecast: [], fcSpecialEvents: [], fcTargetRules: [], marketplaces: [] };',
    function () {
      return makeRuntime().call({ payload: { include: { slice: 'rules' } } }).data.fcRegularForecast === undefined;
    });
});
// M7 — FULL quietly gains the slice shape, breaking the already-deployed page the backend ships ahead of.
mutant('M7  FULL starts returning the slice shape', function () {
  return withMutation("return FCS_SLICE_SPECS_[name] ? name : 'full';", "return FCS_SLICE_SPECS_[name] ? name : 'bootstrap';",
    function () { return makeRuntime().call({ action: 'fcSummary.workspace.get' }).data.fcRegularForecast !== undefined; });
});
// M8 — the blank-row drop disappears, which would add a phantom row to every table.
mutant('M8  blank trailing rows are kept', function () {
  return withMutation('if (!blank) out.push(o);', 'out.push(o);',
    function () { return makeRuntime().call({}).data.counts.fcRegularForecast === 4; });
});
// M12 — bootstrap starts shipping Special Events again: an inactive tab fetched on mount.
mutant('M12 bootstrap emits fcSpecialEvents', function () {
  return withMutation("emits: ['fcTargetRules', 'marketplaces'],",
                      "emits: ['fcSpecialEvents', 'fcTargetRules', 'marketplaces'],",
    function () {
      return makeRuntime().call({ payload: { include: { slice: 'bootstrap' } } }).data.fcSpecialEvents === undefined;
    });
});
// M9 — observed_at stops being stamped, so a client can no longer say how old a cached slice is.
mutant('M9  observed_at is dropped from the slice', function () {
  return withMutation('var out = { slice: sliceName, observed_at: observedAt,', 'var out = { slice: sliceName,',
    function () { return typeof makeRuntime().call({ payload: { include: { slice: 'rules' } } }).data.observed_at === 'string'; });
});
// M10 — a slice stops reporting which slice it was, so a client cannot retry only the one that failed.
mutant('M10 the envelope stops naming the slice', function () {
  return withMutation('tablesRead: readCount, slice: slice,', 'tablesRead: readCount,',
    function () { return makeRuntime().call({ payload: { include: { slice: 'regular' } } }).meta.slice === 'regular'; });
});
// M11 — bootstrap stops stating how many Regular rows exist, so "not asked for" and "none" collapse.
mutant('M11 bootstrap drops the Regular row count', function () {
  return withMutation("    out.counts.fcRegularForecast = (tables.fc_regular_forecast || []).length;", '',
    function () { return makeRuntime().call({ payload: { include: { slice: 'bootstrap' } } }).data.counts.fcRegularForecast === 4; });
});

console.log('    ' + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');

// Not a mutation, but the same class of hazard and the one that has bitten this repository before: a
// manifest row keyed on a symbol the file does not declare reports ABSENT forever.
var declaredSym = /var (FCSWS_BUILD_VERSION_) =/.exec(WS);
var manifestSym = /\{ file: '58_api_v1_fc_summary_workspace\.gs', symbol: '([A-Z_]+)'/.exec(HEALTH);
ok(!!declaredSym && !!manifestSym && declaredSym[1] === manifestSym[1],
   'F1  the manifest row is keyed on the symbol 58_ actually declares — a wrong key reports ABSENT forever',
   [declaredSym && declaredSym[1], manifestSym && manifestSym[1]]);

console.log('\n================================================================');
console.log('FC-SUMMARY-R3-R1 §B WORKSPACE SLICES:  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + mutants.filter(function (m) { return m.survived; }).length + ' survived');
process.exit(fail === 0 ? 0 : 1);
