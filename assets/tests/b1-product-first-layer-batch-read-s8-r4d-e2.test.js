/**
 * S8-R4D-E2 — THE PRODUCT B1 FIRST-LAYER BATCH READ.
 *
 * WHAT THIS SUITE IS FOR, AND WHY IT IS NOT THE BENCHMARK AGAIN.
 *
 * The S8-R4D-D2 benchmark scored zero semantic diffs over thirteen live tables and five pairs. It proved the
 * TRANSPORT is equivalent. It could not prove the thing a product reader actually needs, because it asked the
 * OLD reader which columns were Dates — an oracle that does not exist in production. Under UNFORMATTED_VALUE
 * + SERIAL_NUMBER a date and a number are the SAME wire value, so the declared map is the only thing standing
 * between `fc_special_events.event_month = 11` and a silently corrupted FC event window.
 *
 * So this suite tests the half the benchmark could not: that the map is complete, that the traps stay out of
 * it, that the coercion is type-gated, that the fallback is bounded and reported, and that the schema tokens
 * a failing read raises are the ones R43 raised. Where it can, it EXECUTES the handler rather than reading
 * its source — a one-day date shift and an inverted blank-row rule are behavioural, and a comment cannot be
 * made to fail.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var G60_REL = GS + '60_api_v1_inventory_replenishment_workspace.gs';
var G63_REL = GS + '63_api_v1_system_health.gs';
var R44 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R44';

var pass = 0, fail = 0;
function ok(c, m, extra) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (extra === undefined ? '' : '\n   ' + extra)); } }
function eq(a, b, m) { var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m, A === B ? '' : 'expected ' + B + '\n   actual   ' + A); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function section(t) { console.log('\n================ ' + t + ' ================\n'); }

var G60 = read(G60_REL);
var G63 = read(G63_REL);
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]\/\/.*$/gm, ' ');
}

// ---------------------------------------------------------------------------------------------------
// THE SANDBOX. 60_ is self-contained apart from the Apps Script globals, which are stubbed here so the
// reader can be RUN. Utilities.formatDate/parseDate are implemented for real (UTC + fixed-offset zones),
// because the date gate is the point of the suite and a fake that returned the input would pass anything.
// ---------------------------------------------------------------------------------------------------
var TZ_OFFSET_MIN = { 'Asia/Taipei': 480, 'UTC': 0, 'America/Los_Angeles': -480 };
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmt(d, tz, pattern) {
  var off = TZ_OFFSET_MIN[tz]; if (off === undefined) throw new Error('unknown tz ' + tz);
  var t = new Date(d.getTime() + off * 60000);
  var s = t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
  if (/HH:mm:ss/.test(pattern)) s += ' ' + pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes()) + ':' + pad2(t.getUTCSeconds());
  return s;
}
function parseDate(s, tz, pattern) {
  var off = TZ_OFFSET_MIN[tz]; if (off === undefined) throw new Error('unknown tz ' + tz);
  var m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(s);
  if (!m) throw new Error('parseDate: ' + s);
  var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return new Date(ms - off * 60000);
}

// The REAL schema classifier, not a stub. The whole question in section F is which token a failing read
// raises, and a reimplementation here would only prove the suite agrees with itself — which is exactly the
// mistake the D2 benchmark made when it validated headers with its own local copy of these rules.
var SAFETY = require(path.join(ROOT, 'assets/js/core/supply-planning-production-safety.js'));

function makeCtx(src, sheetsImpl) {
  var sb = {
    console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object,
    Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt,
    Error: Error, RegExp: RegExp, Boolean: Boolean,
    Utilities: { formatDate: fmt, parseDate: parseDate },
    prodAssertDbTarget_: function () { return true; },
    prodExpectedDbId_: function () { return 'SS-TEST'; },
    prodSchemaError_: function (token, table, report) {
      var e = new Error(token + ' [' + table + ']');
      e.schemaStatus = token; e.table = table; e.report = report || null; return e;
    },
    prodSafetyBundle_: function () { return { classifySchemaMismatch: SAFETY.classifySchemaMismatch }; }
  };
  if (sheetsImpl !== undefined) sb.Sheets = sheetsImpl;
  sb.global = sb;
  var c = vm.createContext(sb);
  vm.runInContext(src || G60, c, { filename: '60' });
  return c;
}
var C = makeCtx();
function f(name, ctx) { return vm.runInContext(name, ctx || C); }

// ---------------------------------------------------------------------------------------------------
section('A — THE SCOPE IS EXACTLY THIRTEEN');
// ---------------------------------------------------------------------------------------------------
var EXPECTED_13 = ['marketplaces', 'marketplace_skus', 'sku_details', 'warehouses',
  'amazon_inventory_snapshot', 'amazon_inventory_health_snapshot', 'amazon_daily_sales_snapshot',
  'amazon_weekly_sales_snapshot', 'fc_regular_forecast', 'fc_target_rules', 'fc_special_events',
  'overseas_inventory_snapshot', 'factory_stock'];
var B1_TABLES = f('SIR_B1_TABLES_');
eq(B1_TABLES, EXPECTED_13, 'A1  B1_PRODUCT_TABLE_COUNT = 13, and they are exactly the approved set in order');
eq(Object.keys(f('SIR_B1_DATE_MAP_')).sort(), EXPECTED_13.slice().sort(),
  'A2  the date map covers every one of the thirteen — a table in the batch with no map entry would have '
  + 'its dates left as bare serials');
var WS_TABLES = f('SIR_WORKSPACE_TABLES_').map(function (t) { return t.name; });
eq(WS_TABLES.filter(function (n) { return EXPECTED_13.indexOf(n) !== -1; }), EXPECTED_13,
  'A3  and the workspace still declares all thirteen, in the same order');
eq(WS_TABLES.length, 21, 'A4  the workspace declares 21 tables in total — B1 takes thirteen and leaves eight');
var isB1 = f('sirWsIsB1Table_');
eq(WS_TABLES.filter(function (n) { return isB1(n); }), EXPECTED_13,
  'A5  UNRELATED_IO_READTABLE_CALLER_CHANGE_COUNT = 0 — the other eight are not in the batch');
ok(!isB1('shipments') && !isB1('carrier_rate_cards'),
  'A5a an exposure table and a carrier table are both excluded');

// Every other workspace file defines its OWN private readTable, so this change cannot reach them.
var OTHER_WORKSPACES = fs.readdirSync(path.join(ROOT, GS))
  .filter(function (x) { return /^\d\d_.*\.gs$/.test(x) && x.indexOf('60_') !== 0; })
  .filter(function (x) { return /readTable:\s*function/.test(read(GS + x)); });
ok(OTHER_WORKSPACES.length >= 10,
  'A6  ' + OTHER_WORKSPACES.length + ' other workspace files define their OWN readTable — 60_\'s change is '
  + 'structurally unable to reach them, which is why the "unrelated callers" count is zero by construction');
eq(OTHER_WORKSPACES.filter(function (x) { return /Values\.batchGet\s*\(/.test(stripComments(read(GS + x))); }), [],
  'A6a and none of them calls batchGet');

// ---------------------------------------------------------------------------------------------------
section('B — THE DECLARED DATE MAP, AND THE TRAPS THAT STAY OUT OF IT');
// ---------------------------------------------------------------------------------------------------
var MAP = f('SIR_B1_DATE_MAP_');
var TRAPS = f('SIR_B1_NON_DATE_TRAPS_');
var declaredCount = 0;
EXPECTED_13.forEach(function (t) { declaredCount += MAP[t].length; });
eq(declaredCount, 46, 'B1  PRODUCT_DATE_COLUMN_MAP_COUNT = 46 — 41 observed populated + 5 declared blank');

// The exact per-table map, asserted rather than counted: a count is satisfied by the wrong 46 columns.
var EXPECT_MAP = {
  marketplaces: ['created_at', 'updated_at'],
  marketplace_skus: ['launch_date', 'created_at', 'updated_at'],
  sku_details: ['created_at', 'updated_at'],
  warehouses: ['created_at', 'updated_at'],
  amazon_inventory_snapshot: ['snapshot_date', 'synced_at', 'created_at', 'updated_at'],
  amazon_inventory_health_snapshot: ['snapshot_date', 'synced_at', 'created_at', 'updated_at'],
  amazon_daily_sales_snapshot: ['snapshot_date', 'synced_at', 'created_at', 'updated_at',
    'data_window_start_date', 'data_window_end_date', 'latest_source_date'],
  amazon_weekly_sales_snapshot: ['snapshot_month', 'week_start_date', 'week_end_date', 'synced_at',
    'created_at', 'updated_at'],
  fc_regular_forecast: ['created_at', 'updated_at'],
  fc_target_rules: ['created_at', 'updated_at'],
  fc_special_events: ['event_start_date', 'event_end_date', 'created_at', 'updated_at'],
  overseas_inventory_snapshot: ['created_at', 'updated_at', 'snapshot_date', 'wh_on_the_way_eta', 'last_movement_at'],
  factory_stock: ['created_at', 'updated_at', 'last_transaction_at']
};
EXPECTED_13.forEach(function (t) { eq(MAP[t], EXPECT_MAP[t], 'B2  ' + t + ' declares exactly its date columns'); });

// THE THREE TRAPS. Each is a live column that one shortcut or another would get wrong.
eq(TRAPS.fc_special_events, ['event_month', 'event_period'], 'B3  fc_special_events traps declared');
eq(TRAPS.amazon_weekly_sales_snapshot, ['snapshot_week'], 'B3a amazon_weekly_sales_snapshot trap declared');
var trapCount = 0;
for (var tk in TRAPS) { if (Object.prototype.hasOwnProperty.call(TRAPS, tk)) trapCount += TRAPS[tk].length; }
eq(trapCount, 3, 'B3b NON_DATE_TRAP_COUNT = 3');
var trapInMap = [];
for (var tt in TRAPS) {
  if (!Object.prototype.hasOwnProperty.call(TRAPS, tt)) continue;
  TRAPS[tt].forEach(function (c) { if ((MAP[tt] || []).indexOf(c) !== -1) trapInMap.push(tt + '.' + c); });
}
eq(trapInMap, [], 'B4  NO declared trap appears in the date map — event_month is the number 11, and coercing '
  + 'it would yield 1900-01-10 and destroy every FC event window');

// The map must not drift onto a column the sheet does not have. Checked against the recorded live headers.
var SHAPE = require(path.join(ROOT, 'docs/planning/incident/R4D_FIRST_LAYER_COST/r4db-13-table-shape.json'))['0'];
var unknown = [];
EXPECTED_13.forEach(function (t) {
  var hdr = (SHAPE.tables && SHAPE.tables[t] && SHAPE.tables[t].headers) || [];
  if (!hdr.length) return;                       // fc_target_rules has no header row: nothing to check against
  MAP[t].forEach(function (c) { if (hdr.indexOf(c) === -1) unknown.push(t + '.' + c); });
});
eq(unknown, [], 'B5  every mapped column exists in the recorded live header for its table — the map cannot '
  + 'name a column that is not there');

// ---------------------------------------------------------------------------------------------------
section('C — THE CONVERSION, EXECUTED');
// ---------------------------------------------------------------------------------------------------
var serialToDate = f('sirWsSerialToDate_');
var applyMap = f('sirWsApplyDateMap_');
var TZ = 'Asia/Taipei';

// A date-only cell is LOCAL MIDNIGHT, which is the previous UTC day under Asia/Taipei. That relationship is
// the whole reason every date in this product renders ...T16:00:00.000Z, and the client slices the first ten
// characters of it, so a one-day shift here is a silently wrong chart rather than an error.
var d1 = serialToDate(46222, TZ);                      // 2026-07-19 local midnight
eq(d1.toISOString(), '2026-07-18T16:00:00.000Z', 'C1  a date-only serial is local midnight — the UTC-16:00 '
  + 'form the product has always returned');
eq(fmt(d1, TZ, 'yyyy-MM-dd'), '2026-07-19', 'C1a and it reads back as the calendar date the cell displays');

// A fractional serial is a real timestamp. fc_special_events.created_at is 07:44:07Z live, not midnight.
var ts = serialToDate(46222 + (15 * 3600 + 44 * 60 + 7) / 86400, TZ);
eq(ts.toISOString(), '2026-07-19T07:44:07.000Z', 'C2  a fractional serial round-trips to the SECOND');

// Leap day, and a timezone boundary that lands on the previous UTC calendar day.
eq(serialToDate(46812, TZ).toISOString(), '2028-02-28T16:00:00.000Z', 'C3  leap day 2028-02-29 converts exactly');
ok(serialToDate(46222, TZ).getUTCDate() === 18, 'C4  the timezone boundary puts local midnight on the '
  + 'PREVIOUS UTC day, which is the behaviour consumers already parse');

// THE TYPE GATE. Only numbers are coerced. This is not defensive: marketplace_skus.launch_date is written as
// String(...).trim() by both write paths while all 495 live rows hold Dates, so a string in a declared date
// column is one upsert away.
var vals = [
  ['sku', 'launch_date', 'created_at'],
  ['S1', 46222, 46222],
  ['S2', '2019-08-05', 46222],
  ['S3', '', 46222]
];
var n = applyMap('marketplace_skus', vals, TZ);
ok(vals[1][1] instanceof Date, 'C5  a number in a declared date column becomes a Date');
eq(vals[2][1], '2019-08-05', 'C5a a STRING in a declared date column passes through UNTOUCHED');
eq(vals[3][1], '', 'C5b a blank stays blank — never epoch, never Invalid Date');
eq(n, 4, 'C5c and exactly the numeric cells in declared columns were converted');

// A number in an UNDECLARED column must stay a number. This is the event_month case, executed.
var ev = [['sku', 'event_month', 'event_start_date'], ['S1', 11, 46222]];
applyMap('fc_special_events', ev, TZ);
eq(ev[1][1], 11, 'C6  event_month stays the NUMBER 11 — the trap that a name heuristic converts to 1900-01-10');
ok(ev[1][2] instanceof Date, 'C6a while event_start_date, two columns away, is converted');

// A declared-but-blank column: nothing to convert today, and it must not invent anything.
var ov = [['sku', 'snapshot_date', 'created_at'], ['S1', '', 46222]];
applyMap('overseas_inventory_snapshot', ov, TZ);
eq(ov[1][1], '', 'C7  a declared date column that is blank today stays blank');

// The timezone comes from the SPREADSHEET, not a constant.
ok(/getSpreadsheetTimeZone\s*\(\s*\)/.test(stripComments(G60)),
  'C8  the timezone is read from the spreadsheet at runtime');
ok(!/\+08:00|\b28800000\b/.test(stripComments(G60)),
  'C8a and no hard-coded +08:00 offset appears anywhere in the reader');

// ---------------------------------------------------------------------------------------------------
section('D — RAGGED ROWS, PADDED BEFORE ANYTHING READS THEM');
// ---------------------------------------------------------------------------------------------------
var padRows = f('sirWsPadRows_');
var rowsFromValues = f('sirWsRowsFromValues_');
var ragged = [['a', 'b', 'note'], ['1', '2'], [], ['3', '4']];
var padded = padRows(ragged, 3);
eq(padded[1], ['1', '2', ''], 'D1  a short row is padded to header width with empty strings');
eq(padded[2], ['', '', ''], 'D1a and an entirely missing row becomes all-blank');
eq(padRows(ragged, 3)[1][2], '', 'D1b a padded cell is "" — never the string "undefined"');
eq(rowsFromValues(padded).length, 2, 'D2  the all-blank row is then correctly DROPPED (2 of 3 data rows kept)');
// WITHOUT padding the drop INVERTS, because String(undefined) is "undefined", which is not empty. This is
// the defect padding exists for, asserted rather than described.
eq(rowsFromValues(ragged).length, 3, 'D3  WITHOUT padding the blank row SURVIVES — the rule inverts, and '
  + 'three tables end in an all-blank column today');
// Order: pad, then coerce, then map. Asserted on the source because it is an ordering, not a value.
var batchSrc = stripComments(G60);
var iPad = batchSrc.indexOf('sirWsPadRows_(values, header.length)');
var iMap = batchSrc.indexOf('sirWsApplyDateMap_(name, padded, tz)');
var iRows = batchSrc.indexOf('sirWsRowsFromValues_(padded)');
ok(iPad > 0 && iMap > iPad && iRows > iMap,
  'D4  the reader pads, THEN coerces, THEN maps — the order is the contract');

// ---------------------------------------------------------------------------------------------------
section('E — THE TWO-CALL TOPOLOGY, EXECUTED AGAINST A FAKE SERVICE');
// ---------------------------------------------------------------------------------------------------
function fakeSheets(tableData, opts) {
  opts = opts || {};
  var calls = { get: 0, batchGet: 0, ranges: null };
  return {
    _calls: calls,
    Spreadsheets: {
      get: function (id, params) {
        calls.get++; calls.getFields = params && params.fields;
        if (opts.throwOnGet) throw opts.throwOnGet;
        var sheets = [];
        Object.keys(tableData).forEach(function (t) {
          sheets.push({ properties: { title: t, gridProperties: { rowCount: 1000, columnCount: (tableData[t][0] || ['a']).length } } });
        });
        return { sheets: sheets };
      },
      Values: {
        batchGet: function (id, params) {
          calls.batchGet++; calls.ranges = params.ranges.slice();
          calls.renderOptions = [params.valueRenderOption, params.dateTimeRenderOption];
          if (opts.throwOnBatch) throw opts.throwOnBatch;
          var vr = params.ranges.map(function (r) {
            var nm = /^'(.*)'!/.exec(r)[1].replace(/''/g, "'");
            var v = tableData[nm];
            return (v && v.length) ? { values: v } : {};
          });
          if (opts.dropOneRange) vr.pop();
          return { valueRanges: vr };
        }
      }
    }
  };
}
function fakeSs(tableData) {
  return {
    getId: function () { return 'SS-TEST'; },
    getSpreadsheetTimeZone: function () { return TZ; },
    getSheetByName: function (n) {
      if (!tableData[n]) return null;
      var d = tableData[n];
      return { getLastRow: function () { return d.length; }, getLastColumn: function () { return (d[0] || []).length; },
        getDataRange: function () { return { getValues: function () { return d; } }; } };
    }
  };
}
var DATA = {};
EXPECTED_13.forEach(function (t) {
  DATA[t] = [['sku', 'created_at'], ['S1', 46222]];
});
DATA.marketplaces = [['marketplace_id', 'created_at', 'note'], ['M1', 46222, '']];
DATA.marketplace_skus = [['sku', 'launch_date', 'created_at'], ['S1', 46222, 46222]];
DATA.sku_details = [['sku', 'created_at'], [12345, 46222], ['S-TEXT', 46222]];
DATA.warehouses = [['warehouse_id', 'created_at'], ['W1', 46222]];

var SHEETS = fakeSheets(DATA);
var CTX = makeCtx(G60, SHEETS);
var io = vm.runInContext('sirWorkspaceDefaultIo_()', CTX);
var specs = vm.runInContext('SIR_WORKSPACE_TABLES_', CTX).filter(function (s) { return EXPECTED_13.indexOf(s.name) !== -1; });
var res = io.batchReadTables(fakeSs(DATA), specs, TZ);

eq(SHEETS._calls.get, 1, 'E1  B1_REMOTE_CALL_COUNT: exactly ONE metadata call');
eq(SHEETS._calls.batchGet, 1, 'E1a and exactly ONE batchGet — 13 reads become 2');
eq(res.remoteCalls, 2, 'E1b and the reader reports 2');
eq(res.rangeCount, 13, 'E1c thirteen ranges in that one call');
eq(SHEETS._calls.getFields, 'sheets.properties(title,gridProperties(rowCount,columnCount))',
  'E2  the metadata mask is the narrowest that answers existence and width — no values, no formats, no formulas');
eq(SHEETS._calls.renderOptions, ['UNFORMATTED_VALUE', 'SERIAL_NUMBER'],
  'E3  the render options are the frozen pair');
ok(SHEETS._calls.ranges.every(function (r) { return /^'[^']+'!A:[A-Z]+$/.test(r); }),
  'E4  ranges are column-bounded and ROW-OPEN — gridProperties.rowCount is the ALLOCATED grid, not the last '
  + 'row with content, so bounding on it would make an empty sheet look full');
ok(!/A:AZ|A:AP/.test(SHEETS._calls.ranges.join(' ')),
  'E4a and no frozen literal width — the schema contract runs extraColumnsPolicy ALLOW');
eq(Object.keys(res.tables).sort(), EXPECTED_13.slice().sort(), 'E5  all thirteen came back');
ok(res.tables.marketplace_skus[0].launch_date instanceof Date,
  'E6  a declared date column arrived as a Date through the whole path');
eq(res.tables.sku_details[0].sku, 12345, 'E7  IDENTITY: a numeric sku stays a NUMBER');
eq(res.tables.sku_details[1].sku, 'S-TEXT', 'E7a and a string sku stays a string — no blanket String()');

// ---------------------------------------------------------------------------------------------------
section('F — ABSENT / EMPTY / SCHEMA STATES');
// ---------------------------------------------------------------------------------------------------
function runBatch(data, sheetsOpts, specNames) {
  var sh = fakeSheets(data, sheetsOpts);
  var ctx = makeCtx(G60, sh);
  var io2 = vm.runInContext('sirWorkspaceDefaultIo_()', ctx);
  var sp = vm.runInContext('SIR_WORKSPACE_TABLES_', ctx)
    .filter(function (s) { return (specNames || EXPECTED_13).indexOf(s.name) !== -1; });
  try { return { ok: true, res: io2.batchReadTables(fakeSs(data), sp, TZ), sheets: sh }; }
  catch (e) { return { ok: false, err: e, token: e && (e.schemaStatus || e.sirB1Class), sheets: sh }; }
}
// An ABSENT optional sheet is [] and is simply not asked for — naming it would make batchGet reject the
// WHOLE request and take the other twelve down.
var noFactory = {}; EXPECTED_13.forEach(function (t) { if (t !== 'factory_stock') noFactory[t] = DATA[t]; });
var rAbsent = runBatch(noFactory);
ok(rAbsent.ok, 'F1  one absent OPTIONAL sheet does not fail the batch for the other twelve');
eq(rAbsent.res.tables.factory_stock, [], 'F1a and it reads as [] — SHEET_ABSENT, the browser\'s graceful empty');
eq(rAbsent.res.rangeCount, 12, 'F1b and it was NOT named in the ranges');
ok(rAbsent.sheets._calls.ranges.join(' ').indexOf('factory_stock') === -1, 'F1c proven on the actual ranges');

// An absent REQUIRED sheet fails closed. Never [].
var noMk = {}; EXPECTED_13.forEach(function (t) { if (t !== 'marketplaces') noMk[t] = DATA[t]; });
var rReq = runBatch(noMk);
ok(!rReq.ok && rReq.token === 'SCHEMA_NOT_PROVISIONED',
  'F2  an absent REQUIRED sheet fails closed with SCHEMA_NOT_PROVISIONED — READ FAILURE != EMPTY DATA');

// An EMPTY sheet keeps R43's geometry-decided token. batchGet cannot tell "no rows" from "one blank row";
// the metadata accessors R43 already used can, and they are not range reads.
var emptyFt = {}; EXPECTED_13.forEach(function (t) { emptyFt[t] = DATA[t]; }); emptyFt.fc_target_rules = [];
var rEmpty = runBatch(emptyFt);
ok(!rEmpty.ok && rEmpty.token === 'HEADER_MISSING',
  'F3  an EMPTY sheet raises HEADER_MISSING — the same token R43 raises, decided on the same geometry');

// A blank header cell is a DIFFERENT fault and keeps its own token.
var blankHdr = {}; EXPECTED_13.forEach(function (t) { blankHdr[t] = DATA[t]; });
blankHdr.fc_special_events = [['sku', '', 'created_at'], ['S1', 'x', 46222]];
var rBlank = runBatch(blankHdr);
ok(!rBlank.ok && rBlank.token === 'HEADER_BLANK',
  'F4  a blank header cell is HEADER_BLANK, NOT collapsed into HEADER_MISSING');

// A missing REQUIRED column names itself.
var missCol = {}; EXPECTED_13.forEach(function (t) { missCol[t] = DATA[t]; });
missCol.warehouses = [['not_the_id', 'created_at'], ['W1', 46222]];
var rMiss = runBatch(missCol);
ok(!rMiss.ok && rMiss.token === 'MISSING_REQUIRED_HEADER',
  'F5  a missing required column is MISSING_REQUIRED_HEADER');

// A HEADER-ONLY sheet is valid with zero rows — present, provisioned, empty of data.
var hdrOnly = {}; EXPECTED_13.forEach(function (t) { hdrOnly[t] = DATA[t]; });
hdrOnly.fc_regular_forecast = [['sku', 'created_at']];
var rHdr = runBatch(hdrOnly);
ok(rHdr.ok, 'F6  a HEADER_ONLY sheet is VALID');
eq(rHdr.res.tables.fc_regular_forecast, [], 'F6a with zero rows — which is NOT the same fact as absent');

// A short valueRanges array is a malformed response, not an empty table.
var rPartial = runBatch(DATA, { dropOneRange: true });
ok(!rPartial.ok && rPartial.token === 'SHEETS_PARTIAL_RESPONSE',
  'F7  fewer valueRanges than ranges requested is SHEETS_PARTIAL_RESPONSE — treating a MISSING ENTRY as [] '
  + 'would fabricate an empty business table out of a malformed response');

// ---------------------------------------------------------------------------------------------------
section('G — THE BOUNDED FALLBACK');
// ---------------------------------------------------------------------------------------------------
var classify = f('sirWsClassifySheetsError_');
var isTransient = f('sirWsIsTransientClass_');
[['Service invoked too many times: 429 rate limit', 'SHEETS_QUOTA_EXCEEDED', true],
 ['API call failed with 503 backend error', 'SHEETS_SERVICE_ERROR', true],
 ['500 INTERNAL', 'SHEETS_SERVICE_ERROR', true],
 ['Google Sheets API has not been used in project 123 (SERVICE_DISABLED)', 'SHEETS_API_DISABLED', false],
 ['403 PERMISSION_DENIED', 'SHEETS_PERMISSION_DENIED', false],
 ['400 Unable to parse range', 'SHEETS_RANGE_REJECTED', false],
 ['something nobody has seen before', 'SHEETS_READ_FAILED', false]
].forEach(function (c) {
  eq(classify(new Error(c[0])), c[1], 'G1  "' + c[0].slice(0, 32) + '..." classifies as ' + c[1]);
  eq(isTransient(c[1]), c[2], 'G1a and FALLBACK_ALLOWED = ' + c[2]);
});
eq(f('SIR_B1_FALLBACK_CLASSES_'),
  ['SHEETS_QUOTA_EXCEEDED', 'SHEETS_SERVICE_ERROR', 'ADVANCED_SHEETS_SERVICE_UNAVAILABLE'],
  'G2  FALLBACK_ALLOWED_CLASSES is exactly the three platform-transient ones');
eq(f('SIR_B1_MAX_FALLBACK_'), 1, 'G3  MAX_FALLBACK_COUNT = 1 — there is no retry loop');
ok(!isTransient('SHEETS_API_DISABLED') && !isTransient('SHEETS_PERMISSION_DENIED')
  && !isTransient('SHEETS_RANGE_REJECTED') && !isTransient('SHEETS_PARTIAL_RESPONSE')
  && !isTransient('HEADER_MISSING') && !isTransient('MISSING_REQUIRED_HEADER'),
  'G4  NON_FALLBACK_CLASSES all fail closed — a 403 that fell back would turn a deployment error into a '
  + 'permanent silent slow path that nobody is told about');
// The unclassifiable case is NOT transient. Conservative on purpose.
ok(!isTransient(classify(new Error('entirely novel failure'))),
  'G5  an UNRECOGNISED failure is not transient — the default is to fail closed, not to take the slow path');

// ---------------------------------------------------------------------------------------------------
section('H — THE META CONTRACT, AND THE CONSUMER THAT WOULD HAVE THROWN');
// ---------------------------------------------------------------------------------------------------
var meta = stripComments(G60);
ok(/slowestTables:\s*slow\.slice\(0, 5\)/.test(meta),
  'H1  slowestTables is still built from an ARRAY slice');
['readerMode', 'timingMode', 'perTableTiming', 'batchMetadataMs', 'batchValuesMs', 'normalizationMs',
 'perTableRows', 'primaryReader', 'fallbackUsed', 'fallbackReason', 'fallbackErrorClass', 'fallbackCount',
 'finalReader', 'rangeCount', 'remoteCallCount', 'dateMapVersion'].forEach(function (k) {
  ok(new RegExp('\\b' + k + ':').test(meta), 'H2  meta carries ' + k);
});
ok(!/slowestTables:\s*'/.test(meta) && !/slowestTables:\s*\{/.test(meta),
  'H3  slowestTables is NEVER a string or object sentinel — inventory-replenishment.js:10200 calls .forEach '
  + 'on it inside no try/catch, so a sentinel raises a TypeError on the page');
// Proven against the real consumer's expression rather than asserted about it.
var CONSUMER = read('assets/js/pages/inventory-replenishment.js');
ok(/\(\(meta && meta\.slowest_tables\) \|\| \[\]\)\.forEach/.test(CONSUMER),
  'H3a the consumer really does call .forEach on it — this is why H3 exists');
function consumerSurvives(v) {
  try { var slow = {}; ((v) || []).forEach(function (x) { slow[x.table] = x.ms; }); return true; }
  catch (e) { return false; }
}
ok(consumerSurvives([]) && consumerSurvives(null) && !consumerSurvives('UNAVAILABLE_IN_BATCH_MODE')
  && !consumerSurvives({ mode: 'BATCH' }),
  'H3b [] and null survive that expression; a string or object sentinel does NOT');
ok(/no sensitive|No secret|not expose|spreadsheet id/i.test(G60) || !/getId\(\)\s*\}/.test(meta),
  'H4  no spreadsheet id is placed in meta');
ok(meta.indexOf('spreadsheetId: id') === -1 && !/meta[^\n]*PRODUCTION_DB_SPREADSHEET_ID_/.test(meta),
  'H4a nor any credential or token');

// ---------------------------------------------------------------------------------------------------
section('I — THE DRIFT DETECTOR');
// ---------------------------------------------------------------------------------------------------
ok(typeof f('sirWsDateMapDrift_') === 'function', 'I1  the drift detector exists');
var driftSrc = stripComments(/function sirWsDateMapDrift_[\s\S]*?\n}/.exec(G60)[0]);
ok(/effectiveFormat\.numberFormat\.type/.test(driftSrc),
  'I2  it reads effectiveFormat.numberFormat.type — the mechanism that actually decides whether '
  + 'SpreadsheetApp returns a Date, rather than what a writer intended');
ok(/DATE_MAP_DRIFT/.test(driftSrc), 'I3  a disagreement is reported as DATE_MAP_DRIFT');
ok(/UNDETECTABLE_NO_DATA/.test(driftSrc),
  'I4  a table with no data row reports UNDETECTABLE_NO_DATA and never "agrees" — fc_target_rules is in the '
  + 'thirteen and has no row 2');
ok(/DECLARED_BUT_UNFORMATTED/.test(driftSrc),
  'I4a and a declared column with no format is reported as a blind spot rather than counted as agreement');
// It must NOT be in the read path, and it must not remap.
var batchFn = /batchReadTables: function[\s\S]*?\n    \}/.exec(G60)[0];
ok(batchFn.indexOf('sirWsDateMapDrift_') === -1,
  'I5  the detector is NOT called from the read path — detect only, out of band');
ok(!/SIR_B1_DATE_MAP_\[[^\]]+\]\s*=|SIR_B1_DATE_MAP_\[[^\]]+\]\.push/.test(stripComments(G60)),
  'I6  nothing ever writes to the date map at runtime — a detected drift never auto-remaps, because that '
  + 'would be the runtime inference the contract forbids, arriving through the back door');

// ---------------------------------------------------------------------------------------------------
section('J — RELEASE, MANIFEST AND HEALTH');
// ---------------------------------------------------------------------------------------------------
// S8-R4D-E4-B — R44 IS A FLOOR, NOT AN EQUALITY, for the reason E2 itself gave when it converted R43's
// three pins: '=== R44' is a sentence only one release can satisfy, and the next round to change either file
// makes it false while describing a correct tree. What E2 established is that the batch reader SHIPPED IN
// R44 — so the stamp must be R44 OR LATER, and anything earlier must still fail. R45 is the release that
// proves the distinction was needed again, and it needed it faster than R43 did: R44's own acceptance failed
// on normalization cost, so the repair landed one round later.
var RO_E2 = require(path.join(ROOT, 'assets/tests/_release-order.js'));
ok(RO_E2.stampAtOrAfter((G60.match(/var SIR_BUILD_VERSION_ = '([^']+)'/) || [])[1], R44),
  'J1  60_ is stamped R44 or later — the round the batch reader shipped');
ok(RO_E2.stampAtOrAfter((G63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1], R44),
  'J2  the RELEASE is R44 or later');
ok(RO_E2.stampAtOrAfter((G63.match(/var SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1], R44),
  'J3  63_ own stamp is R44 or later — it carries 60_\'s row');
// The floor has to bite in the other direction too, or 'at or after' is just 'anything'.
ok(!RO_E2.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R43', R44),
  'J3a and a PRE-R44 stamp is still rejected — the floor is a floor, not a formality');
eq((read(GS + '01_router.gs').match(/var RTR_BUILD_VERSION_ = '([^']+)'/) || [])[1],
  'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41', 'J4  01_ is UNCHANGED at R41 — no action and no route moved');
eq((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1], '18',
  'J5  ACTION_CONTRACT_VERSION stays 18 — the action set did not change');

var MANIFEST = JSON.parse(read(GS + 'appsscript.json'));
var svcs = MANIFEST.dependencies.enabledAdvancedServices;
eq(svcs.filter(function (s) { return s.serviceId === 'sheets'; }),
  [{ userSymbol: 'Sheets', version: 'v4', serviceId: 'sheets' }],
  'J6  the manifest declares Sheets v4 exactly once');
eq(svcs.filter(function (s) { return s.serviceId === 'bigquery'; }).length, 1, 'J6a BigQuery preserved');
eq(MANIFEST.oauthScopes.length, 3, 'J6b the three OAuth scopes are unchanged');
eq(MANIFEST.timeZone, 'Asia/Taipei', 'J6c and the timezone — which is what makes a date cell local midnight');
var ADV = require(path.join(ROOT, 'assets/tests/_advanced-services-state.js'));
ok(ADV.PRODUCT_RUNTIME_DEPENDENCY === true,
  'J7  the service is declared a PRODUCT RUNTIME dependency, not benchmark infrastructure');
eq(ADV.PRODUCT_RUNTIME_DEPENDENT_RELEASE, R44, 'J7a and it names the release that made it one');
ok(/advanced_sheets_required/.test(G63) && /advanced_sheets_runtime_mode/.test(G63),
  'J8  63_ attests the service');
ok(/typeof Sheets/.test(stripComments(G63)),
  'J8a BY EXECUTION — a manifest in this repository is not necessarily the one deployed');
ok(!/Sheets\.Spreadsheets\.(get|Values)\s*\(/.test(stripComments(G63)),
  'J8b and it costs ZERO API calls — a typeof check is not a request');
var LOG = read('docs/planning/DEPLOYMENT_RELEASE_LOG.md');
ok(LOG.indexOf(R44) !== -1, 'J9  R44 has a ledger entry');
ok(/NOT DEPLOYED/.test(LOG.slice(LOG.indexOf(R44))), 'J9a which records that it is NOT yet deployed');

// ---------------------------------------------------------------------------------------------------
section('K — MAINLINE NON-REGRESSION');
// ---------------------------------------------------------------------------------------------------
var CODE60 = stripComments(G60);
var WRITE_PRIMS = ['setValue', 'setValues', 'appendRow', 'insertRow', 'insertRows', 'deleteRow', 'deleteRows',
  'insertSheet', 'deleteSheet', 'clearContents', 'PropertiesService', 'CacheService', 'DriveApp', 'MailApp',
  'GmailApp', 'ScriptApp.newTrigger', 'Values.update', 'Values.append', 'Spreadsheets.batchUpdate'];
eq(WRITE_PRIMS.filter(function (w) { return CODE60.indexOf(w) !== -1; }), [],
  'K1  60_ contains ZERO write primitives — B1 changes read transport and nothing else');
eq((CODE60.match(/action:\s*'[^']+'/g) || []), ["action: 'inventoryReplenishment.workspace.get'"],
  'K2  it still declares exactly ONE action');
ok(!/gapJob|jobStart|materiali[sz]e/i.test(CODE60),
  'K3  GAP_WRITE_REACHABLE = NO and JOB_START_REACHABLE = NO');
eq(f('SIR_EXPOSURE_TABLES_').length, 6, 'K4  the exposure family is untouched at six tables');
eq(f('SIR_WS_RECENT_WINDOW_').amazon_daily_sales_snapshot.keep, 14,
  'K5  the recent-window projection is unchanged — it runs AFTER the read, so the transport cannot move it');

// ---------------------------------------------------------------------------------------------------
section('L — MUTANTS');
// ---------------------------------------------------------------------------------------------------
// Mutations are applied to in-memory COPIES. Nothing is written to disk: a suite that rewrites a real source
// file and is then killed leaves the mutant behind, and that has already cost this repository a round.
var survived = 0, vacuous = 0;
function mutant(id, why, mutate, detect) {
  var clean = { g60: G60, g63: G63, manifest: read(GS + 'appsscript.json') };
  if (detect(clean)) { vacuous++; console.log('VACUOUS ' + id + '  the detector already fires on the UNMUTATED tree'); return; }
  var t = { g60: G60, g63: G63, manifest: read(GS + 'appsscript.json') };
  mutate(t);
  if (t.g60 === clean.g60 && t.g63 === clean.g63 && t.manifest === clean.manifest) {
    vacuous++; console.log('VACUOUS ' + id + '  the mutation changed NOTHING — a no-op cannot be caught'); return;
  }
  if (detect(t)) console.log('caught: ' + id + '  ' + why);
  else { survived++; console.log('SURVIVED ' + id + '  ' + why); }
}
function tablesOf(src) { var m = /var SIR_B1_TABLES_ = \[([\s\S]*?)\];/.exec(src); return (m ? m[1].match(/'([^']+)'/g) || [] : []).map(function (x) { return x.slice(1, -1); }); }
function mapOf(src) {
  var m = /var SIR_B1_DATE_MAP_ = \{([\s\S]*?)\n\};/.exec(src);
  var out = {}; if (!m) return out;
  var re = /(\w+):\s*\[([\s\S]*?)\]/g, mm;
  while ((mm = re.exec(m[1]))) out[mm[1]] = (mm[2].match(/'([^']+)'/g) || []).map(function (x) { return x.slice(1, -1); });
  return out;
}
function trapsOf(src) {
  var m = /var SIR_B1_NON_DATE_TRAPS_ = \{([\s\S]*?)\n\};/.exec(src);
  var out = {}; if (!m) return out;
  var re = /(\w+):\s*\[([\s\S]*?)\]/g, mm;
  while ((mm = re.exec(m[1]))) out[mm[1]] = (mm[2].match(/'([^']+)'/g) || []).map(function (x) { return x.slice(1, -1); });
  return out;
}
var dTables = function (t) { return JSON.stringify(tablesOf(t.g60)) !== JSON.stringify(EXPECTED_13); };
var dMap = function (t) {
  var m = mapOf(t.g60), n = 0;
  var keys = Object.keys(m); if (keys.length !== 13) return true;
  keys.forEach(function (k) { n += m[k].length; });
  if (n !== 46) return true;
  var bad = false;
  EXPECTED_13.forEach(function (k) { if (JSON.stringify(m[k]) !== JSON.stringify(EXPECT_MAP[k])) bad = true; });
  return bad;
};
var dTrap = function (t) {
  var m = mapOf(t.g60), tr = trapsOf(t.g60), bad = false;
  for (var k in tr) { if (!Object.prototype.hasOwnProperty.call(tr, k)) continue;
    tr[k].forEach(function (c) { if ((m[k] || []).indexOf(c) !== -1) bad = true; }); }
  return bad;
};
// Anchored on the CALL SHAPE, not the name prefix: renaming the function to sirWsDateMapDrift_DISABLED_
// still contains 'function sirWsDateMapDrift_' as a substring, so the loose form reported a disabled
// detector as present. And the format read is COUNTED, because it appears twice — the fields mask and the
// access — so replacing one of them left the other to satisfy a boolean test.
var dDrift = function (t) {
  if (!/function sirWsDateMapDrift_\s*\(/.test(t.g60)) return true;
  return (t.g60.match(/effectiveFormat\.numberFormat\.type/g) || []).length < 2;
};
var dStringCoerce = function (t) {
  var c = stripComments(t.g60);
  var m = /function sirWsApplyDateMap_[\s\S]*?\n}/.exec(c);
  return !m || !/typeof v === 'number'/.test(m[0]) || /String\(v\)/.test(m[0]);
};
var dPad = function (t) { return !/sirWsPadRows_\(values, header\.length\)/.test(stripComments(t.g60)); };
var dFallbackList = function (t) {
  var m = /var SIR_B1_FALLBACK_CLASSES_ = \[([\s\S]*?)\];/.exec(t.g60);
  var list = m ? (m[1].match(/'([^']+)'/g) || []).map(function (x) { return x.slice(1, -1); }) : [];
  return JSON.stringify(list) !== JSON.stringify(['SHEETS_QUOTA_EXCEEDED', 'SHEETS_SERVICE_ERROR', 'ADVANCED_SHEETS_SERVICE_UNAVAILABLE']);
};
var dMaxFallback = function (t) { return !/var SIR_B1_MAX_FALLBACK_ = 1;/.test(t.g60)
  || !/fallbackCount >= SIR_B1_MAX_FALLBACK_/.test(stripComments(t.g60)); };
var dSilent = function (t) { var c = stripComments(t.g60);
  return !/fallbackUsed: fallbackUsed/.test(c) || !/fallbackReason: fallbackReason/.test(c); };
var dSlowArray = function (t) { var c = stripComments(t.g60);
  return !/slowestTables:\s*slow\.slice\(0, 5\)/.test(c) || /slowestTables:\s*'/.test(c) || /slowestTables:\s*\{/.test(c); };
var dManifest = function (t) {
  var svc = (JSON.parse(t.manifest).dependencies || {}).enabledAdvancedServices || [];
  var sh = svc.filter(function (x) { return x.serviceId === 'sheets'; });
  return sh.length !== 1 || sh[0].version !== 'v4';
};
var dWrite = function (t) { var c = stripComments(t.g60); return WRITE_PRIMS.some(function (w) { return c.indexOf(w) !== -1; }); };
var dClassify = function (t) {
  var c = makeCtx(t.g60);
  try { return vm.runInContext('sirWsIsTransientClass_', c)('SHEETS_PERMISSION_DENIED') === true
    || vm.runInContext('sirWsIsTransientClass_', c)('MISSING_REQUIRED_HEADER') === true; }
  catch (e) { return true; }
};

mutant('M1', 'a FOURTEENTH table is added to the B1 set', function (t) {
  t.g60 = t.g60.replace("'factory_stock'];", "'factory_stock', 'request_orders'];"); }, dTables);
mutant('M2', 'a table is OMITTED from the B1 set', function (t) {
  // Scoped to the B1 array. An unscoped replace hits SIR_WORKSPACE_TABLES_ first, mutating a different
  // constant and reporting SURVIVED for a detector that was never given the fault.
  t.g60 = t.g60.replace(/var SIR_B1_TABLES_ = \[[\s\S]*?\];/,
    function (m) { return m.replace("'fc_target_rules', ", ''); }); }, dTables);
mutant('M3', 'a date column is removed from the map — its dates become bare serials', function (t) {
  t.g60 = t.g60.replace("['launch_date', 'created_at', 'updated_at']", "['created_at', 'updated_at']"); }, dMap);
mutant('M4', 'the event_month TRAP is treated as a date — 11 becomes 1900-01-10', function (t) {
  t.g60 = t.g60.replace("fc_special_events:                ['event_start_date', 'event_end_date', 'created_at', 'updated_at'],",
    "fc_special_events:                ['event_start_date', 'event_end_date', 'created_at', 'updated_at', 'event_month'],"); }, dTrap);
mutant('M5', 'the drift detector is disabled', function (t) {
  t.g60 = t.g60.replace('function sirWsDateMapDrift_', 'function sirWsDateMapDrift_DISABLED_'); }, dDrift);
mutant('M5a', 'the drift detector stops using number formats and guesses from values instead', function (t) {
  t.g60 = t.g60.split('effectiveFormat.numberFormat.type').join('effectiveValue.numberValue'); }, dDrift);
mutant('M6', 'identity is coerced with String() so a type change passes', function (t) {
  // S8-R4D-E4-B — the anchor moved with the code. R45 routes the type-gated branch through
  // sirWsSerialToDateGuarded_, so the R44 text no longer matches and the replace became a no-op: the mutant
  // was reported VACUOUS rather than silently passing, which is the whole reason L2 counts them.
  t.g60 = t.g60.replace("if (typeof v === 'number') { values[r][idx[k]] = sirWsSerialToDateGuarded_(v, tz, offsetByYear); converted++; }",
    "{ values[r][idx[k]] = String(v); converted++; }"); }, dStringCoerce);
mutant('M7', 'the ragged-row padding is removed — the blank-row rule inverts', function (t) {
  t.g60 = t.g60.replace('sirWsPadRows_(values, header.length)', 'values'); }, dPad);
mutant('M8', 'a 403 is added to the fallback allowlist', function (t) {
  t.g60 = t.g60.replace("var SIR_B1_FALLBACK_CLASSES_ = ['SHEETS_QUOTA_EXCEEDED', 'SHEETS_SERVICE_ERROR',",
    "var SIR_B1_FALLBACK_CLASSES_ = ['SHEETS_PERMISSION_DENIED', 'SHEETS_QUOTA_EXCEEDED', 'SHEETS_SERVICE_ERROR',"); }, dFallbackList);
mutant('M9', 'a schema mismatch becomes a fallback class', function (t) {
  t.g60 = t.g60.replace("'ADVANCED_SHEETS_SERVICE_UNAVAILABLE'];", "'ADVANCED_SHEETS_SERVICE_UNAVAILABLE', 'MISSING_REQUIRED_HEADER'];"); }, dClassify);
mutant('M10', 'a SECOND fallback is allowed — the bound becomes a retry loop', function (t) {
  t.g60 = t.g60.replace('var SIR_B1_MAX_FALLBACK_ = 1;', 'var SIR_B1_MAX_FALLBACK_ = 3;'); }, dMaxFallback);
mutant('M11', 'the fallback stops being reported — a silent fallback', function (t) {
  t.g60 = t.g60.replace('fallbackUsed: fallbackUsed,', ''); }, dSilent);
mutant('M12', 'slowestTables becomes a string sentinel and the page throws', function (t) {
  t.g60 = t.g60.replace('slowestTables: slow.slice(0, 5),', "slowestTables: 'UNAVAILABLE_IN_BATCH_MODE',"); }, dSlowArray);
mutant('M13', 'the Sheets declaration is removed from the manifest', function (t) {
  t.manifest = t.manifest.replace(/,\s*\{[^{}]*"serviceId":\s*"sheets"[^{}]*\}/, ''); }, dManifest);
mutant('M14', 'the Sheets service is declared at the wrong version', function (t) {
  t.manifest = t.manifest.replace('"version": "v4"', '"version": "v3"'); }, dManifest);
mutant('M15', 'a write primitive is introduced into the read handler', function (t) {
  t.g60 = t.g60.replace('function sirWsIsB1Table_(name) {',
    'function sirWsEvil_(sh) { sh.getRange(1, 1).setValue(1); }\r\nfunction sirWsIsB1Table_(name) {'); }, dWrite);

eq(survived, 0, 'L1  0 mutants survived');
eq(vacuous, 0, 'L2  0 vacuous mutants');

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, 16 mutants, '
  + survived + ' survived, ' + (vacuous === 0 ? 'vacuity clean' : vacuous + ' VACUOUS'));
console.log(new Array(101).join('='));
process.exitCode = fail === 0 ? 0 : 1;
