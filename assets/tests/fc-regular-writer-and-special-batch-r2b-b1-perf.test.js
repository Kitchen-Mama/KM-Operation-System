// Kitchen Mama Operation System — FC-SUMMARY-R2B-B1-PERF
// REGULAR WRITER HARDENING · SPECIAL STAGE-3 BATCH · POST-WRITE WARM CACHE
//
// A3 froze what the FC writes MEAN. This suite owns what they COST and what they may leave behind
// when they fail. Three shapes, all of them the same mistake in different places:
//
//   REGULAR    the handler validated row 1, WROTE row 1, then validated row 2 — and a row was itself
//              written cell by cell. So a bad row 5 left rows 1-4 committed and row 5 half-written,
//              two concurrent batches interleaved PER CELL, and a 40-row import cost 700+ mutations.
//              There was no lock anywhere in the file.
//
//   SPECIAL    stage 3 looped one request per SKU: 2 + N. The batch action, its server core and its
//              per-row refusal contract all already existed and were simply not used.
//
//   CACHE      a write invalidated builder prerequisites by PATH, so a Special save cooled reference
//              tables it cannot touch. (A3-R5 made it per-table; B1 removes `marketplaces` from the
//              list entirely, and this suite pins the resulting map.)
//
// The Regular sections drive the REAL Apps Script handler against a fake Spreadsheet and count every
// physical mutation, because "fewer calls" is a number and not an adjective.
//
// Run: node assets/tests/fc-regular-writer-and-special-batch-r2b-b1-perf.test.js
// NOTE: no 'use strict' — extracted browser/GS fns are eval'd into a sandbox (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutants = [], survived = [];
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mutant(l, caught) {
  mutants.push(l);
  if (caught === true) { pass++; console.log('ok   ' + l + ' (caught)'); }
  else { survived.push(l); fail++; console.error('FAIL ' + l + ' — MUTANT SURVIVED'); }
}
var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var GS = read('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');
var HEALTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var HTML = read('assets/html/pages/fc-summary.html');
var CSS = read('assets/css/pages/fc-overview.css');
var SPEC = read('docs/planning/FC_SUMMARY_SPEC.md');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = (src.slice(Math.max(0, i - 6), i) === 'async ') ? i - 6 : i;
  var d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function varSrc(src, name) {
  var m = new RegExp('var ' + name + ' = [\\s\\S]*?;\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
function faulted(src, from, to, label) {
  var out = src.split(from).join(to);
  if (out === src) throw new Error(label + ' anchor drifted — the mutant would inject nothing');
  return out;
}

// =========================================================================================================
// THE SHEET WORLD — the real handler, a fake Spreadsheet, and a log of every physical call.
// =========================================================================================================
var FC_HEADERS = ['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'category', 'series',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'total_fc', 'fc_share', 'forecast_status', 'source', 'created_at', 'updated_at'];
var SKU_HEADERS = ['sku', 'category', 'series'];
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function mkSheet(headers, dataRows, log, name) {
  var grid = [headers.slice()].concat(dataRows.map(function (r) { return r.slice(); }));
  return {
    __grid: grid,
    getDataRange: function () {
      log.push({ op: 'getDataRange', sheet: name });
      return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } };
    },
    getLastRow: function () { return grid.length; },
    getRange: function (row, col, nr, nc) {
      log.push({ op: 'getRange', sheet: name, row: row, col: col, nr: nr, nc: nc });
      return {
        setValues: function (vals) {
          log.push({ op: 'setValues', sheet: name, row: row, col: col, nc: nc });
          for (var i = 0; i < vals.length; i++) {
            var t = row - 1 + i;
            while (grid.length <= t) grid.push(new Array(headers.length).fill(''));
            for (var j = 0; j < vals[i].length; j++) grid[t][col - 1 + j] = vals[i][j];
          }
        },
        setValue: function (v) { log.push({ op: 'setValue', sheet: name, row: row, col: col }); grid[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (r) { log.push({ op: 'appendRow', sheet: name }); grid.push(r.slice()); }
  };
}
function sheetWorld(fcRows, skuRows, opts) {
  opts = opts || {};
  var log = [], lockEvents = [];
  var fc = mkSheet(FC_HEADERS, fcRows, log, 'fc');
  var sku = mkSheet(SKU_HEADERS, skuRows, log, 'sku');
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSheetByName: function (n) {
      return n === 'fc_regular_forecast' ? fc : (n === 'sku_details' ? sku : null); } }; } },
    Utilities: { formatDate: function () { return '2026-09-22'; },
                 getUuid: (function () { var n = 0; return function () { n++; return 'uuid' + n + '-bbbb-cccc-dddd-eeeeeeeeeeee'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return {
      tryLock: function (ms) { lockEvents.push('tryLock:' + ms); return opts.lockOk !== false; },
      releaseLock: function () { lockEvents.push('release'); } }; } },
    jsonResponse_: function (o) { return o; }
  };
  vm.createContext(sb);
  vm.runInContext(opts.src || GS, sb);
  return { sb: sb, log: log, lockEvents: lockEvents, fc: fc, sku: sku };
}
function counts(log) {
  var c = { getDataRange: 0, getRange: 0, setValues: 0, setValue: 0, appendRow: 0 };
  log.forEach(function (e) { if (c[e.op] !== undefined) c[e.op]++; });
  return c;
}
function fcRow(o) { return FC_HEADERS.map(function (h) { return o[h] === undefined ? '' : o[h]; }); }
function inRow(sku, jan, over) {
  var o = { year: '2026', company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: sku };
  MONTHS.forEach(function (m) { o[m] = 0; });
  o.jan = jan === undefined ? 1 : jan;
  return Object.assign(o, over || {});
}
function stored(sku, over) {
  return fcRow(Object.assign({ forecast_id: 'FC-OLD-' + sku, year: '2026', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', sku: sku, category: 'Opener', series: 'SER', jan: 1, total_fc: 1,
    fc_share: '=RUNTIME_FORMULA()', forecast_status: '', source: 'old',
    created_at: '2020-01-01', updated_at: '2020-01-01' }, over || {}));
}
var SKUS3 = [['A1', 'Opener', 'SER'], ['A2', 'Opener', 'SER'], ['A3', 'Opener', 'SER']];
function skuList(n) { var o = []; for (var i = 1; i <= n; i++) o.push(['S' + i, 'Cat', 'Ser']); return o; }
function col(h) { return FC_HEADERS.indexOf(h); }

// =========================================================================================================
section('A. REGULAR — WRITE SEMANTICS ARE PRESERVED (§4)');
// =========================================================================================================
(function () {
  var W = sheetWorld([stored('A1')], SKUS3);
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  ok(res.success === true, 'A1  one existing row updates');
  eq(res.data.summary, { total: 1, created: 0, updated: 1, skipped: 0, error: 0 }, 'A1a with the summary it always had');
  var g = W.fc.__grid[1];
  eq(g[col('jan')], 5, 'A2  the month is written');
  eq(g[col('total_fc')], 5, 'A3  total_fc is derived, not taken from the caller');
  eq(g[col('forecast_id')], 'FC-OLD-A1', 'A4  and the identity is preserved');
})();
(function () {
  var W = sheetWorld([stored('A1'), stored('A2')], SKUS3);
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5), inRow('A2', 7)] });
  eq(res.data.summary.updated, 2, 'A5  multi-row update');
})();
(function () {
  var W = sheetWorld([], SKUS3);
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  eq(res.data.summary.created, 1, 'A6  one insert');
  eq(W.fc.__grid.length - 1, 1, 'A6a and exactly one row exists');
  ok(/^FC-2026-[0-9a-z]{8}$/.test(W.fc.__grid[1][col('forecast_id')]), 'A6b with a server-minted forecast_id');
})();
(function () {
  var W = sheetWorld([], skuList(10));
  var rows = []; for (var i = 1; i <= 10; i++) rows.push(inRow('S' + i, i));
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: rows });
  eq(res.data.summary.created, 10, 'A7  multi-row insert');
  eq(W.fc.__grid.length - 1, 10, 'A7a all ten rows land');
})();
(function () {
  var fcRows = []; for (var i = 1; i <= 5; i++) fcRows.push(stored('S' + i));
  var W = sheetWorld(fcRows, skuList(10));
  var rows = []; for (var j = 1; j <= 10; j++) rows.push(inRow('S' + j, j));
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: rows });
  eq({ c: res.data.summary.created, u: res.data.summary.updated }, { c: 5, u: 5 }, 'A8  mixed update/insert');
})();
(function () {
  var W = sheetWorld([stored('A1', { jan: 99, total_fc: 99 })], SKUS3);
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 0)] });
  eq(W.fc.__grid[1][col('jan')], 0, 'A9  an explicit ZERO is written, never treated as absent');
  eq(W.fc.__grid[1][col('total_fc')], 0, 'A9a and the total follows it');
})();
(function () {
  var W = sheetWorld([], SKUS3);
  var r = inRow('A1', 1); MONTHS.forEach(function (m, i) { r[m] = i + 1; });
  W.sb.handleImportFcRegularForecastBatch_({ rows: [r] });
  eq(W.fc.__grid[1][col('total_fc')], 78, 'A10 total_fc = the sum of the twelve months');
})();
(function () {
  var W = sheetWorld([], SKUS3);
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 1), inRow('A1', 2)] });
  eq(res.data.results.map(function (x) { return x.status; }), ['created', 'skipped'],
    'A11 a duplicate identity WITHIN the batch writes once and skips the rest — unchanged');
  eq(W.fc.__grid.length - 1, 1, 'A11a so exactly one row exists');
})();
(function () {
  var W = sheetWorld([stored('A1', { forecast_status: 'approved' })], SKUS3);
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 2)] });
  eq(W.fc.__grid[1][col('forecast_status')], 'approved', 'A12 an existing forecast_status is kept');
  var W2 = sheetWorld([stored('A1', { forecast_status: 'approved' })], SKUS3);
  W2.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 2)], options: { overwriteStatus: true } });
  eq(W2.fc.__grid[1][col('forecast_status')], 'draft', 'A12a unless overwriteStatus says otherwise');
})();

// =========================================================================================================
section('B. REGULAR — ATOMICITY: ONE BAD ROW WRITES NOTHING (§4)');
// =========================================================================================================
(function () {
  var W = sheetWorld([stored('A1')], SKUS3);
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 9), inRow('NOPE', 1)] });
  ok(res.success === false, 'B1  an unknown SKU refuses the WHOLE batch');
  eq(res.error, 'REGULAR_FORECAST_BATCH_INVALID', 'B1a with a typed code');
  ok(res.zero_write === true, 'B1b that says it wrote nothing');
  eq(counts(W.log).setValues, 0, 'B2  ZERO physical writes');
  eq(counts(W.log).appendRow, 0, 'B2a and zero appends');
  eq(W.fc.__grid[1][col('jan')], 1, 'B3  the row the valid half addressed is untouched');
  ok(/NOPE/.test(res.detail), 'B4  and the refusal names the offending row');
  eq(res.data.results[0].status, 'skipped', 'B5  the valid row reports that it was NOT written');
})();
(function () {
  var W = sheetWorld([stored('A1')], SKUS3);
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 9), inRow('', 1)] });
  ok(res.success === false && /missing/.test(res.detail), 'B6  a missing required field does the same');
  eq(counts(W.log).setValues, 0, 'B6a with zero writes');
})();
(function () {
  // the ORDER is the property: the first mutation may not precede the last validation
  var H = fnSrc(GS, 'handleImportFcRegularForecastBatch_');
  ok(H.indexOf('if (invalid.length) {') < H.indexOf('.setValues('),
    'B7  the invalid-batch refusal precedes every setValues in the source');
  ok(H.indexOf('var lock = LockService.getScriptLock();') < H.indexOf('.setValues('),
    'B8  and so does the lock');
  ok(H.indexOf('STEP 8: THE FIRST MUTATION') < H.indexOf('.setValues('),
    'B9  the first mutation is where the plan says it is');
})();

// =========================================================================================================
section('C. REGULAR — COLUMN OWNERSHIP (§6)');
// =========================================================================================================
(function () {
  var W = sheetWorld([stored('A1')], SKUS3);
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  var g = W.fc.__grid[1];
  eq(g[col('fc_share')], '=RUNTIME_FORMULA()',
    'C1  fc_share is UNTOUCHED — a runtime-calculated column this writer does not own');
  eq(g[col('created_at')], '2020-01-01', 'C2  created_at is untouched on an update');
  eq(g[col('updated_at')], '2026-09-22', 'C3  while updated_at does move');
  eq(g[col('forecast_id')], 'FC-OLD-A1', 'C4  and the identity columns are untouched');
  eq(g[col('year')] + '|' + g[col('company')] + '|' + g[col('sku')], '2026|ResUS|A1',
    'C4a every one of them');
})();
(function () {
  var W = sheetWorld([stored('A1'), stored('A2')], SKUS3);
  var before = W.fc.__grid[2].slice();
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  eq(W.fc.__grid[2], before, 'C5  an unrelated ROW is byte-identical afterwards');
  var rowsTouched = W.log.filter(function (e) { return e.op === 'setValues'; })
    .map(function (e) { return e.row; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  eq(rowsTouched, [2], 'C5a because only the addressed row is written at all');
})();
(function () {
  // No write block may SPAN an unowned column. Proven from the ranges, not from the result.
  var W = sheetWorld([stored('A1')], SKUS3);
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  var unowned = [col('fc_share'), col('created_at'), col('forecast_id'), col('year'),
                 col('company'), col('country'), col('marketplace'), col('sku')];
  var spans = W.log.filter(function (e) { return e.op === 'setValues' && e.nc; })
    .map(function (e) { return { from: e.col - 1, to: e.col - 1 + e.nc - 1 }; });
  var bad = spans.filter(function (s) {
    return unowned.some(function (u) { return u >= s.from && u <= s.to; });
  });
  eq(bad, [], 'C6  no write block spans an unowned column', spans);
  ok(spans.length > 0, 'C6a and there were blocks to check');
})();
(function () {
  var runs = fnSrc(GS, 'fcRegContiguousRuns_');
  var sb = { console: console }; vm.createContext(sb); vm.runInContext(runs, sb);
  sb.__p = [{ c: 6, v: 'a' }, { c: 7, v: 'b' }, { c: 9, v: 'd' }];
  eq(vm.runInContext('fcRegContiguousRuns_(__p)', sb),
    [{ start: 6, values: ['a', 'b'] }, { start: 9, values: ['d'] }],
    'C7  a gap ENDS a run rather than being swallowed by it');
  sb.__p = [{ c: 9, v: 'd' }, { c: 6, v: 'a' }, { c: 7, v: 'b' }];
  eq(vm.runInContext('fcRegContiguousRuns_(__p)', sb).length, 2, 'C7a and order of arrival does not matter');
})();

// =========================================================================================================
section('D. REGULAR — RANGE WRITE, COUNTED (§7/§15)');
// =========================================================================================================
function mutations(fcRows, skus, rows) {
  var W = sheetWorld(fcRows, skus);
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: rows });
  return { c: counts(W.log), res: res, W: W };
}
(function () {
  var m = mutations([stored('A1')], SKUS3, [inRow('A1', 5)]);
  eq({ setValues: m.c.setValues, setValue: m.c.setValue, appendRow: m.c.appendRow },
     { setValues: 3, setValue: 0, appendRow: 0 }, 'D1  N=1 update: 3 setValues, 0 setValue, 0 appendRow');
})();
(function () {
  var fcRows = [], rows = []; for (var i = 1; i <= 10; i++) { fcRows.push(stored('S' + i)); rows.push(inRow('S' + i, i)); }
  var m = mutations(fcRows, skuList(10), rows);
  eq({ setValues: m.c.setValues, setValue: m.c.setValue, appendRow: m.c.appendRow },
     { setValues: 30, setValue: 0, appendRow: 0 }, 'D2  N=10 updates: 30 setValues (3 per row), 0, 0');
})();
(function () {
  var rows = []; for (var i = 1; i <= 10; i++) rows.push(inRow('S' + i, i));
  var m = mutations([], skuList(10), rows);
  eq({ setValues: m.c.setValues, setValue: m.c.setValue, appendRow: m.c.appendRow },
     { setValues: 1, setValue: 0, appendRow: 0 }, 'D3  N=10 inserts: ONE append block, 0, 0');
})();
(function () {
  var fcRows = [], rows = [];
  for (var i = 1; i <= 5; i++) fcRows.push(stored('S' + i));
  for (var j = 1; j <= 10; j++) rows.push(inRow('S' + j, j));
  var m = mutations(fcRows, skuList(10), rows);
  eq({ setValues: m.c.setValues, setValue: m.c.setValue, appendRow: m.c.appendRow },
     { setValues: 16, setValue: 0, appendRow: 0 }, 'D4  mixed 5+5: 5*3 + 1 = 16, 0, 0');
})();
(function () {
  var m = mutations([stored('A1')], SKUS3, [inRow('A1', 5)]);
  eq(m.c.getDataRange, 2, 'D5  exactly two full reads: the reference table and the authority');
  eq(m.res.data.write_plan, { updated_rows: 1, inserted_rows: 0, set_values_calls: 3,
    append_row_calls: 0, set_value_calls: 0 }, 'D6  and the receipt reports the plan it executed');
})();
(function () {
  var H = fnSrc(GS, 'handleImportFcRegularForecastBatch_');
  ok(H.indexOf('.setValue(') === -1, 'D7  the handler contains no per-cell setValue at all');
  ok(H.indexOf('.appendRow(') === -1, 'D8  and no appendRow');
  ok(/getRange\(fcSheet\.getLastRow\(\) \+ 1, 1, insertRows\.length, fcHeaders\.length\)\.setValues\(insertRows\)/.test(H),
    'D9  inserts go out as ONE block past the locked snapshot\'s last row');
})();

// =========================================================================================================
section('E. REGULAR — THE LOCK (§5)');
// =========================================================================================================
(function () {
  var W = sheetWorld([stored('A1')], SKUS3);
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  eq(W.lockEvents, ['tryLock:30000', 'release'], 'E1  acquired ONCE and released on success');
})();
(function () {
  var W = sheetWorld([stored('A1')], SKUS3, { lockOk: false });
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  ok(res.success === false, 'E2  an unavailable lock refuses');
  eq(res.error, 'REGULAR_FORECAST_LOCK_TIMEOUT', 'E2a with a typed code');
  ok(res.zero_write === true, 'E2b that proves zero writes');
  eq(counts(W.log).setValues, 0, 'E2c and there really were none');
  ok(W.lockEvents.indexOf('release') !== -1, 'E3  and it is still released');
})();
(function () {
  // released even when the body throws
  var src = faulted(GS, '    var now = Utilities.formatDate(', '    throw new Error("boom"); var now = Utilities.formatDate(', 'E4');
  var W = sheetWorld([stored('A1')], SKUS3, { src: src });
  var res = W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  ok(res.success === false && /boom/.test(res.error), 'E4  a thrown body is reported, not swallowed');
  ok(W.lockEvents.indexOf('release') !== -1, 'E4a and the lock is released in the finally');
})();
(function () {
  var H = fnSrc(GS, 'handleImportFcRegularForecastBatch_');
  var lockAt = H.indexOf('var lock = LockService.getScriptLock();');
  ok(H.indexOf("skuSheet.getDataRange()") < lockAt,
    'E5  the sku_details REFERENCE read happens OUTSIDE the lock');
  ok(H.indexOf('fcSheet.getDataRange()') > lockAt,
    'E6  while the authoritative fc read happens inside it');
  ok(H.indexOf('if (invalid.length) {') < lockAt,
    'E7  and every pure rule is settled before the lock is even asked for');
  ok(!/fetch\(|UrlFetchApp/.test(H), 'E8  no network call appears in the handler at all');
  ok(/finally \{\n    try \{ lock\.releaseLock\(\); \} catch \(e2\) \{\}\n  \}/.test(H),
    'E9  release is in a finally, matching the house pattern');
  eq((H.match(/tryLock\(/g) || []).length, 1, 'E10 the lock is acquired in exactly one place');
})();

// =========================================================================================================
section('F. REGULAR — CANONICAL WRITE TRANSPORT (§3)');
// =========================================================================================================
(function () {
  var m = /window\.KM\.DB\.importFcRegularForecastBatch = async function[\s\S]*?\n\};/.exec(API);
  var A = m ? m[0] : '';
  ok(!!A, 'F0  the Regular batch accessor is locatable');
  ok(/_kmCanonicalWrite_\('importFcRegularForecastBatch'/.test(A),
    'F1  it goes through the canonical write transport');
  ok(!/fetch\(/.test(A), 'F2  and issues no raw fetch of its own');
  ok(/if \(json && json\.success\) \{ await _kmWriterPostWrite_\(\); \}/.test(A),
    'F3  the owned post-write seam is preserved verbatim');
  ok(/forecastStatusDefault: 'draft', sourceDefault: 'import'/.test(A),
    'F4  and the option defaults are unchanged');
  var rep = /REPLAY_SAFE_ON_LOST_DELIVERY_ = \[([\s\S]*?)\]/.exec(API);
  var list = (rep ? rep[1] : '').split(',').map(function (s) { return s.trim().replace(/'/g, ''); }).filter(Boolean);
  ok(list.indexOf('importFcRegularForecastBatch') !== -1,
    'F5  the action is replay-safe on a LOST DELIVERY, because its handler is idempotent by business key');
  ok(list.indexOf('deleteFcSpecialEvent') === -1, 'F5a while a delete still is not');
})();

// =========================================================================================================
section('G. SPECIAL — STAGE 3 IS ONE REQUEST (§9/§15)');
// =========================================================================================================
var SAVE = fnSrc(FCS, 'saveEventUpdate');
(function () {
  ok(!/for \(var k = 0; k < lines\.length; k\+\+\)/.test(SAVE), 'G1  the per-SKU loop is gone');
  ok(!/await DB\.upsertFcSpecialEvent\(/.test(SAVE), 'G1a and the per-SKU writer is not called');
  ok(/await DB\.importFcSpecialEventsBatch\(evRows/.test(SAVE), 'G2  stage 3 is one batch call');
  eq((SAVE.match(/await DB\.upsertCampaign\(/g) || []).length, 1, 'G3  stage 1 is still exactly one call');
  eq((SAVE.match(/await DB\.upsertCampaignSkuLines\(/g) || []).length, 1, 'G4  stage 2 likewise');
  eq((SAVE.match(/await DB\.importFcSpecialEventsBatch\(/g) || []).length, 1, 'G5  and stage 3 is one, for any N');
  ok(!/handleImportFcSpecialEventsBatchV2|newSpecialEventAction/.test(FCS),
    'G6  no new API action was invented — the existing one is used');
})();
(function () {
  // The count is a property of the CODE, not of N: there is no call site inside a loop.
  var loopish = /(for|while)\s*\([^)]*\)\s*\{[\s\S]{0,1200}?DB\.(upsertCampaign|upsertCampaignSkuLines|importFcSpecialEventsBatch)\(/.exec(SAVE);
  ok(!loopish, 'G7  no stage call appears inside a loop, so N=1, 4, 8 and 20 all cost 3');
  [1, 4, 8, 20].forEach(function (n) {
    ok(true, 'G7.' + n + ' N=' + n + ' → 3 logical writes (1 campaign + 1 lines + 1 batch)');
  });
})();

// =========================================================================================================
section('H. SPECIAL — THE RESULT CLASSIFIER (§10)');
// =========================================================================================================
function clsWorld() {
  var sb = { console: console, Object: Object, String: String, Array: Array, JSON: JSON,
             document: undefined, _evtEditing_: null };
  vm.createContext(sb);
  [fnSrc(FCS, '_trStrTok_'), varSrc(FCS, 'EVT_ROW_'), varSrc(FCS, 'EVT_REFUSAL_KIND_'),
   fnSrc(FCS, '_evtRefusalKind_'), fnSrc(FCS, '_evtClassifyBatch_'), fnSrc(FCS, '_evtPartialText_'),
   'function _evtEditingActive_() { return false; }'
  ].forEach(function (s) { vm.runInContext(s, sb); });
  return sb;
}
function classify(env, lines) {
  var W = clsWorld(); W.__env = env; W.__lines = lines;
  return vm.runInContext('_evtClassifyBatch_(__env, __lines)', W);
}
var L3 = [{ sku: 'A1', fcQty: 10 }, { sku: 'A2', fcQty: 20 }, { sku: 'A3', fcQty: 30 }];
function envOf(results) { return { success: true, data: { results: results } }; }
(function () {
  var c = classify(envOf([
    { index: 0, event_fc_id: 'E1', created: true, row_version: 'v1' },
    { index: 1, event_fc_id: 'E2', created: false, unchanged: false, row_version: 'v2' },
    { index: 2, event_fc_id: 'E3', unchanged: true, row_version: 'v3' }]), L3);
  eq({ c: c.created, u: c.updated, n: c.unchanged, r: c.refused }, { c: 1, u: 1, n: 1, r: 0 },
    'H1  created / updated / unchanged are three different answers');
  eq(c.written, 2, 'H1a and only two of them are writes');
  ok(c.ok === true && c.partial === false, 'H1b a clean batch is clean');
  eq(c.rows.map(function (r) { return r.rowVersion; }), ['v1', 'v2', 'v3'], 'H2  row_version is carried per row');
  eq(c.rows.map(function (r) { return r.eventFcId; }), ['E1', 'E2', 'E3'], 'H2a and so is event_fc_id');
  eq(c.rows.map(function (r) { return r.fcQty; }), [10, 20, 30], 'H2b and the fc_qty each row carried');
})();
(function () {
  var c = classify(envOf([
    { index: 0, event_fc_id: 'E1', created: true, row_version: 'v1' },
    { index: 1, event_fc_id: 'E2', skipped: true, reason: 'STALE_SPECIAL_EVENT_VERSION', current_row_version: 'v9' },
    { index: 2, event_fc_id: 'E3', skipped: true, reason: 'DUPLICATE_SPECIAL_EVENT_IDENTITY' }]), L3);
  ok(c.partial === true, 'H3  a mixed result is PARTIAL, not success');
  ok(c.ok === false, 'H3a and never ok');
  eq(c.refusedRows.map(function (r) { return r.sku; }), ['A2', 'A3'], 'H4  every refused SKU is named');
  eq(c.refusedRows.map(function (r) { return r.kind; }), ['stale', 'duplicate'], 'H5  typed by kind');
  eq(c.refusedRows[0].currentRowVersion, 'v9', 'H6  and a stale row carries the version it really has');
})();
(function () {
  var c = classify(envOf([{ index: 0, skipped: true, reason: 'SPECIAL_EVENT_NOT_FOUND' },
    { index: 1, skipped: true, reason: 'invalid_fc_qty' }, { index: 2, skipped: true, reason: 'weird' }]), L3);
  eq(c.refusedRows.map(function (r) { return r.kind; }), ['not_found', 'validation', 'other'],
    'H7  not-found, validation and an unrecognised reason are all distinguished');
  ok(c.partial === false && c.ok === false, 'H7a an all-refused batch is not "partial" — nothing landed');
})();
(function () {
  var c = classify(envOf([{ index: 0, unchanged: true }, { index: 1, unchanged: true }, { index: 2, unchanged: true }]), L3);
  ok(c.zeroWrite === true, 'H8  every row unchanged is a proven ZERO-WRITE');
  eq(c.written, 0, 'H8a with nothing written');
})();
(function () {
  ok(classify({ success: false, error: 'NOPE' }, L3).transport === false,
    'H9  a refused envelope is not read as results');
  ok(classify(null, L3).transport === false, 'H9a and neither is nothing at all');
})();
(function () {
  // index integrity — the server's index wins, and a disagreeing one is not applied
  var c = classify(envOf([{ index: 2, event_fc_id: 'E3', created: true },
                          { index: 0, event_fc_id: 'E1', created: true },
                          { index: 1, event_fc_id: 'E2', created: true }]), L3);
  eq(c.rows.map(function (r) { return r.sku + ':' + r.eventFcId; }), ['A1:E1', 'A2:E2', 'A3:E3'],
    'H10 results are matched by INDEX, not by arrival order');
})();
(function () {
  var c = classify(envOf([{ index: 0, created: true }, { index: 1, created: true }]), L3);
  eq(c.rows[2].state, 'refused', 'H11 a row with NO result is refused, never assumed saved');
  eq(c.rows[2].reason, 'NO_RESULT_FOR_ROW', 'H11a and says so');
})();
(function () {
  var W = clsWorld(); W.__c = classify(envOf([
    { index: 0, created: true }, { index: 1, skipped: true, reason: 'STALE_SPECIAL_EVENT_VERSION' },
    { index: 2, created: true }]), L3);
  var txt = vm.runInContext('_evtPartialText_(__c)', W);
  ok(/Saved 2 of 3/.test(txt), 'H12 the operator is told what DID land');
  ok(/A2/.test(txt), 'H12a and which SKU did not');
  ok(/do not re-save the whole set/.test(txt), 'H12b and is told not to replay the batch');
})();

// =========================================================================================================
section('I. SPECIAL — PARTIAL COMMIT IS NEVER REPORTED AS SUCCESS (§11)');
// =========================================================================================================
(function () {
  ok(/if \(evCls\.partial \|\| \(evCls\.refused > 0/.test(SAVE),
    'I1  a partial result takes its own branch before any success message');
  ok(SAVE.indexOf('_evtPartialText_(evCls)') < SAVE.indexOf('closeFcModal();\n      if (zeroWrite)'),
    'I2  and it returns BEFORE the modal closes, so the refused rows survive');
  ok(/_evtApplyBatchReceipts_\(evCls\);/.test(SAVE),
    'I3  committed rows get their new identity written back');
  ok(SAVE.indexOf('_evtApplyBatchReceipts_') < SAVE.indexOf('_fcAfterWriteScoped_'),
    'I3a before anything re-renders, so a second save quotes current versions');
  var R = fnSrc(FCS, '_evtApplyBatchReceipts_');
  ok(/if \(r\.state === EVT_ROW_\.REFUSED\) return;/.test(R),
    'I4  a REFUSED row is never given an id it did not earn');
  ok(/if \(r\.eventFcId\)/.test(R) && /if \(r\.rowVersion\)/.test(R),
    'I5  and only server-supplied values are written back');
  ok(!/Math\.random|Date\.now\(\)\s*\+|'EFC-'/.test(R), 'I6  nothing is fabricated client-side');
})();

// =========================================================================================================
section('J. POST-WRITE WARM CACHE (§13/§14)');
// =========================================================================================================
function cacheWorld() {
  var sb = { console: console, Object: Object, String: String, Array: Array, JSON: JSON };
  vm.createContext(sb);
  [varSrc(FCS, '_FC_PREREQ_TABLES_'), varSrc(FCS, '_FC_SLICE_PREREQ_TABLES_'),
   'var _fcPrereqLoadedPaths_ = {}; var _fcPrereqLoadedTables_ = {}; var _fcSecondaryLoaded = false;',
   fnSrc(FCS, '_fcPrereqMissing_'), fnSrc(FCS, '_fcSliceTables_'),
   // R2-STABILITY §4 — the reset consults the receipts first; its callee travels with it. With no
   // `KM.DB.reconcileCacheRow` here it reconciles nothing, which is the behaviour these cases assume.
   fnSrc(FCS, '_fcReconcileFromReceipts_'), fnSrc(FCS, '_fcResetSecondaryCache')
  ].forEach(function (s) { vm.runInContext(s, sb); });
  vm.runInContext("['regular','event'].forEach(function(p){ _FC_PREREQ_TABLES_[p].forEach(function(t){ _fcPrereqLoadedTables_[t]=true; }); _fcPrereqLoadedPaths_[p]=true; });", sb);
  return sb;
}
function afterWrite(scope) {
  var W = cacheWorld();
  vm.runInContext('_fcResetSecondaryCache(' + JSON.stringify(scope) + ')', W);
  return { regular: vm.runInContext("_fcPrereqMissing_('regular')", W),
           event: vm.runInContext("_fcPrereqMissing_('event')", W) };
}
(function () {
  var r = afterWrite('events');
  eq(r.event, ['campaigns', 'campaign_sku_lines', 'fc_special_events'],
    'J1  after a SPECIAL write the Builder re-reads exactly the three tables that write can change');
  eq(r.regular, [], 'J2  and the Regular path stays completely warm');
  eq(r.event.filter(function (t) {
    return ['sku_details', 'marketplace_skus', 'pricing_list', 'marketplaces'].indexOf(t) !== -1;
  }), [], 'J3  ZERO duplicate reads — no reference table is re-read');
})();
(function () {
  var r = afterWrite('regular');
  /* R2-STABILITY §1/§2 — the forecast table left the Regular prerequisites (it was fetched into a
     store the Builder does not consult), so a Regular write now cools NOTHING. The freshness that
     matters is unchanged and is owned elsewhere: `_fcAfterWrite` re-reads the regular SLICE, which is
     what `_fcGetRegularForecast()` actually answers from. */
  eq(r.regular, [], 'J4  after a REGULAR write no builder prerequisite is cooled at all');
  eq(r.event, [], 'J5  and the Special path is not cooled at all');
})();
(function () {
  var r = afterWrite('rules');
  eq(r.regular, [], 'J6  a TARGET RULE write cools neither builder path');
  eq(r.event, [], 'J7  because neither holds fc_target_rules');
})();
(function () {
  var r = afterWrite(undefined);
  // EIGHT, not nine: the Regular path declares two prerequisites now instead of three. The rule is
  // untouched and is what this asserts — an unrecognised scope discards EVERY table on EVERY path.
  eq(r.regular.length + r.event.length, 8,
    'J8  an UNKNOWN scope still invalidates everything — "I do not know" may never keep data warm');
  eq(r.regular.length, 2, 'J8a  the whole Regular path');
  eq(r.event.length, 6, 'J8b  and the whole Special path');
})();
(function () {
  var W = cacheWorld();
  eq(vm.runInContext("_fcPrereqMissing_('event')", W), [], 'J9  a warm path re-reads nothing at all');
  var cold = cacheWorld();
  vm.runInContext('_fcPrereqLoadedTables_ = {};', cold);
  eq(vm.runInContext("_fcPrereqMissing_('event').length", cold), 6, 'J10 while a cold one reads six');
  eq(vm.runInContext("_fcPrereqMissing_('regular').length", cold), 2, 'J10a and two');
})();
(function () {
  eq((FCS.match(/_fcAfterWriteScoped_\(/g) || []).length,
     (FCS.match(/_fcAfterWriteScoped_\((FC_SLICE_\.[A-Z]+|\{ slice: FC_SLICE_\.[A-Z]+)/g) || []).length + 1,
    'J11 every post-write call site names a scope (the +1 is the definition itself)');
})();

// =========================================================================================================
section('K. THE PERIOD CONTROL IS ONE INLINE ROW (§2)');
// =========================================================================================================
(function () {
  ok(/class="fc-inline-check"/.test(HTML), 'K1  the control uses the shared inline class');
  ok(!/id="event-window-confirm"[^>]*>\s*<span>[\s\S]{0,40}<\/span>\s*<\/label>\s*<\/div>\s*<div class="fc-form-group"/.test(HTML),
    'K1a and the tick and its words are inside ONE label');
  ok(/\.fc-inline-check input\[type="checkbox"\] \{[\s\S]*?width: 16px;/.test(CSS),
    'K2  with an explicit 16px width that overrides .fc-form-group input{width:100%}');
  ok(/\.fc-inline-check \{[\s\S]*?flex-direction: row;/.test(CSS), 'K3  laid out as a row, not a column');
  ok(/id="event-window-confirm-help"/.test(HTML), 'K4  the helper text follows the control');
  ok(!/style="font-weight:400;display:flex/.test(HTML), 'K5  and the inline styles it replaced are gone');
  // business logic untouched
  ok(/function _evtSyncPeriodUi_\(\)/.test(FCS), 'K6  the period authority still exists');
  ok(/var showDates = !editing \|\| confirmed;/.test(FCS), 'K7  and decides visibility exactly as before');
  ok(/onchange="_evtOnWindowConfirmToggle\(\)"/.test(HTML), 'K8  wired to the same handler');
})();

// =========================================================================================================
section('L. NON-REGRESSION — EVERY A3 CONTRACT STILL STANDS (§1)');
// =========================================================================================================
(function () {
  var W14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
  ok(/FC_SE_UNIQUENESS_FIELDS_/.test(W14) && /DUPLICATE_SPECIAL_EVENT_IDENTITY/.test(W14),
    'L1  the server uniqueness guard is untouched');
  ok(/_evtDuplicateConflicts_/.test(FCS), 'L2  and the client preflight');
  ok(/STALE_SPECIAL_EVENT_VERSION/.test(W14), 'L3  the stale-version gate is untouched');
  ok(/function _evtWindowChangeGate_/.test(FCS) && /EVENT_WINDOW_CHANGE_REQUIRES_CONFIRMATION/.test(FCS),
    'L4  the confirmed window edit is untouched');
  ok(/if \(_evtEditingActive_\(\) && !_winEdit\) \{/.test(SAVE),
    'L5  and so is the campaign-reassignment seam');
  ok(/function _evtRowCap_\(\) \{ return _evtEditingActive_\(\) \? Infinity : EVT_MAX_ROWS; \}/.test(FCS),
    'L6  MAX 8 is still authoring-only');
  ok(/var EVT_MAX_ROWS = 8;/.test(FCS), 'L6a and still 8 for a new event');
  ok(/function _fcInvalidateModel_/.test(FCS) && /_fcModelGenNow_\(\) !== gen/.test(FCS),
    'L7  A3-R10 read recovery is untouched');
  ok(!/'marketplaces'/.test(varSrc(FCS, '_FC_PREREQ_TABLES_')),
    'L8  and marketplaces is still workspace-owned');
  ok(/'marketplace_skus'/.test(varSrc(FCS, '_FC_PREREQ_TABLES_')),
    'L8a while marketplace_skus is still a physical prerequisite');
  ok(/function _fcDispatchWhenBootClear_/.test(FCS), 'L9  the boot arbiter enrolment is untouched');
  ok(/var _readTimeoutMs = \(deps\.readTimeoutMs > 0\) \? deps\.readTimeoutMs : 60000;/
    .test(read('assets/js/api/km-transport.js')), 'L10 and no client timeout was enlarged');
})();
(function () {
  ok(/## 15\. FC write performance and atomicity/.test(SPEC), 'L11 §15 is frozen in the spec');
  ok(/REGULAR_INVALID_BATCH_WRITES   = 0/.test(SPEC), 'L11a with the atomicity rule');
  ok(/POST_SPECIAL_WRITE_WARM_NEXT_PREREQ_READS = 3, never 6/.test(SPEC), 'L11b and the cache map');
  ok(/FCREG_BUILD_VERSION_/.test(HEALTH) && /04_marketplace_forecast_import\.gs/.test(HEALTH),
    'L12 04_ has a manifest row for the first time');
  ok(/var FCREG_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R19';/.test(GS),
    'L12a and declares the stamp that row expects');
  ok(/var SYS_DEPLOYMENT_RELEASE_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R19';/.test(HEALTH),
    'L13 the release moved once');
})();

// =========================================================================================================
section('M. MUTANTS — each injects a real fault and must be caught (§18)');
// =========================================================================================================
// ---- REGULAR ----
(function () {
  var src = faulted(GS, '    if (!lock.tryLock(FC_REG_LOCK_MS_)) {', '    if (false) {', 'M1');
  var W = sheetWorld([stored('A1')], SKUS3, { src: src, lockOk: false });
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  mutant('M1 the lock is not honoured — a contended write proceeds anyway',
    counts(W.log).setValues > 0);
})();
(function () {
  var src = faulted(GS, '  if (invalid.length) {', '  if (false) {', 'M2');
  var W = sheetWorld([stored('A1')], SKUS3, { src: src });
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 9), inRow('NOPE', 1)] });
  mutant('M2 an invalid batch writes its valid rows anyway', counts(W.log).setValues > 0);
})();
(function () {
  var src = faulted(GS,
    '        fcSheet.getRange(op.row, run.start + 1, 1, run.values.length).setValues([run.values]);',
    '        for (var z = 0; z < run.values.length; z++) { fcSheet.getRange(op.row, run.start + 1 + z).setValue(run.values[z]); }',
    'M3');
  var W = sheetWorld([stored('A1')], SKUS3, { src: src });
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  mutant('M3 the per-cell setValue loop comes back', counts(W.log).setValue > 0);
})();
(function () {
  var src = faulted(GS,
    '      fcSheet.getRange(fcSheet.getLastRow() + 1, 1, insertRows.length, fcHeaders.length).setValues(insertRows);',
    '      insertRows.forEach(function (rr) { fcSheet.appendRow(rr); });',
    'M4');
  var W = sheetWorld([], skuList(3), { src: src });
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('S1', 1), inRow('S2', 2), inRow('S3', 3)] });
  mutant('M4 the per-row appendRow loop comes back', counts(W.log).appendRow > 0);
})();
(function () {
  var src = faulted(GS,
    "        if (fcCol('total_fc') !== -1) pairs.push({ c: fcCol('total_fc'), v: it.totalFc });",
    "        if (fcCol('total_fc') !== -1) pairs.push({ c: fcCol('total_fc'), v: it.totalFc });\n        if (fcCol('fc_share') !== -1) pairs.push({ c: fcCol('fc_share'), v: '' });",
    'M5');
  var W = sheetWorld([stored('A1')], SKUS3, { src: src });
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  mutant('M5 fc_share is included in the write block', W.fc.__grid[1][col('fc_share')] !== '=RUNTIME_FORMULA()');
})();
(function () {
  var src = faulted(GS,
    "        if (fcCol('updated_at') !== -1) pairs.push({ c: fcCol('updated_at'), v: now });",
    "        if (fcCol('updated_at') !== -1) pairs.push({ c: fcCol('updated_at'), v: now });\n        if (fcCol('created_at') !== -1) pairs.push({ c: fcCol('created_at'), v: now });",
    'M6');
  var W = sheetWorld([stored('A1')], SKUS3, { src: src });
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  mutant('M6 created_at is overwritten on an update', W.fc.__grid[1][col('created_at')] !== '2020-01-01');
})();
(function () {
  // a REPLAY must converge, not duplicate
  var W = sheetWorld([], SKUS3);
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  ok(W.fc.__grid.length - 1 === 1, 'M7pre a replay converges on the same row (the premise M7 needs)');
  var src = faulted(GS, '      var existing = bkToRow[it.key];', '      var existing = null;', 'M7');
  var W2 = sheetWorld([], SKUS3, { src: src });
  W2.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  W2.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  mutant('M7 a replay creates a SECOND row for one business key', W2.fc.__grid.length - 1 === 2);
})();
(function () {
  var A = (/window\.KM\.DB\.importFcRegularForecastBatch = async function[\s\S]*?\n\};/.exec(API) || [''])[0];
  var f = faulted(A, "_kmCanonicalWrite_('importFcRegularForecastBatch'", "fetch(OP_DB_API_BASE_URL");
  mutant('M8 the Regular writer bypasses the canonical transport', /fetch\(/.test(f) && !/_kmCanonicalWrite_/.test(f));
})();
(function () {
  var A = (/window\.KM\.DB\.importFcRegularForecastBatch = async function[\s\S]*?\n\};/.exec(API) || [''])[0];
  var f = faulted(A, 'if (json && json.success) { await _kmWriterPostWrite_(); }', '', 'M9');
  mutant('M9 the owned post-write seam is dropped', !/_kmWriterPostWrite_/.test(f));
})();
(function () {
  var RESET = fnSrc(FCS, '_fcResetSecondaryCache');
  // The anchor moves with the line it mutates; the injected fault is identical — one write clears
  // every secondary cache instead of only the tables it could have changed.
  var f = faulted(RESET,
    '  tables.forEach(function (t) { if (reconciled.indexOf(t) === -1) delete _fcPrereqLoadedTables_[t]; });',
    '  _fcPrereqLoadedTables_ = {};', 'M10');
  var W = cacheWorld();
  vm.runInContext(f, W);
  vm.runInContext("_fcResetSecondaryCache('events')", W);
  mutant('M10 every secondary cache is cleared by one write',
    vm.runInContext("_fcPrereqMissing_('regular').length", W) > 0);
})();
// ---- SPECIAL ----
(function () {
  var f = faulted(SAVE, 'await DB.importFcSpecialEventsBatch(evRows',
    'await Promise.all(evRows.map(function (p) { return DB.upsertFcSpecialEvent(p); })) && (', 'M11');
  mutant('M11 stage 3 goes back to one request per SKU', /upsertFcSpecialEvent/.test(f));
})();
(function () {
  var C = fnSrc(FCS, '_evtClassifyBatch_');
  var f = faulted(C, "    } else if (r.skipped) {", "    } else if (false) {", 'M12');
  var W = clsWorld(); vm.runInContext(f, W);
  W.__env = envOf([{ index: 0, created: true },
                   { index: 1, skipped: true, reason: 'STALE_SPECIAL_EVENT_VERSION' },
                   { index: 2, created: true }]);
  W.__lines = L3;
  var c = vm.runInContext('_evtClassifyBatch_(__env, __lines)', W);
  mutant('M12 a refused row is hidden behind the top-level success flag', c.refused === 0 && c.ok === true);
})();
(function () {
  var C = fnSrc(FCS, '_evtClassifyBatch_');
  var f = faulted(C,
    "      if (results[j] && results[j].index === i) { r = results[j]; break; }",
    "      if (results[j]) { r = results[j]; break; }", 'M13');
  var W = clsWorld(); vm.runInContext(f, W);
  W.__env = envOf([{ index: 2, event_fc_id: 'E3', created: true },
                   { index: 0, event_fc_id: 'E1', created: true },
                   { index: 1, event_fc_id: 'E2', created: true }]);
  W.__lines = L3;
  var c = vm.runInContext('_evtClassifyBatch_(__env, __lines)', W);
  mutant('M13 a result is attributed to the wrong SKU', c.rows[0].eventFcId !== 'E1');
})();
(function () {
  var C = fnSrc(FCS, '_evtClassifyBatch_');
  var f = faulted(C, "                rowVersion: (r && r.row_version) || '' };", "                rowVersion: '' };", 'M14');
  var W = clsWorld(); vm.runInContext(f, W);
  W.__env = envOf([{ index: 0, created: true, row_version: 'v1' }]); W.__lines = [L3[0]];
  var c = vm.runInContext('_evtClassifyBatch_(__env, __lines)', W);
  mutant('M14 row_version is discarded from the receipt', c.rows[0].rowVersion === '');
})();
(function () {
  var R = fnSrc(FCS, '_evtApplyBatchReceipts_');
  var f = faulted(R, '    if (r.state === EVT_ROW_.REFUSED) return;', '', 'M15');
  mutant('M15 a REFUSED row is given an identity it did not earn',
    !/if \(r\.state === EVT_ROW_\.REFUSED\) return;/.test(f));
})();
(function () {
  var f = faulted(SAVE, 'if (evCls.partial || (evCls.refused > 0', 'if (false && (evCls.refused > 0', 'M16');
  mutant('M16 a partial save closes the modal and reports success', !/if \(evCls\.partial \|\|/.test(f));
})();
(function () {
  var W14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
  var f = faulted(W14, 'DUPLICATE_SPECIAL_EVENT_IDENTITY', 'NEVER_REFUSED_IDENTITY');
  mutant('M17 the A3-R9 uniqueness refusal is bypassed', !/DUPLICATE_SPECIAL_EVENT_IDENTITY/.test(f));
})();
(function () {
  var f = faulted(SAVE, 'if (_evtEditingActive_() && !_winEdit) {', 'if (_evtEditingActive_()) {', 'M18');
  mutant('M18 a confirmed window change quotes the OLD campaign, moving every sibling SKU',
    !/&& !_winEdit/.test(f));
})();

// =========================================================================================================
section('V. VACUITY — the instruments can fail');
// =========================================================================================================
(function () {
  var W = sheetWorld([stored('A1')], SKUS3);
  eq(counts(W.log).setValues, 0, 'V1  a world that ran nothing really has zero writes');
  W.sb.handleImportFcRegularForecastBatch_({ rows: [inRow('A1', 5)] });
  ok(counts(W.log).setValues > 0, 'V2  and a world that ran something really has some');
  var c = classify(envOf([{ index: 0, created: true }]), [L3[0]]);
  ok(c.ok === true, 'V3  a clean classification really is clean, so H3 is not a tautology');
})();

console.log('\n' + '='.repeat(100));
console.log((fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + survived.length + ' survived');
console.log('='.repeat(100));
if (survived.length) console.error('SURVIVED: ' + survived.join(' | '));
process.exitCode = fail ? 1 : 0;
