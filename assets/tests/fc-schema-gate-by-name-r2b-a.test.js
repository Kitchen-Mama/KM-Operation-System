// Kitchen Mama Operation System — FC-SUMMARY-R2B-A: NAME-BASED SCHEMA GATE AND VERIFIED REFUSAL
// Run: node assets/tests/fc-schema-gate-by-name-r2b-a.test.js
//
// LOCAL / FAKE-ONLY. No live Spreadsheet, no network, no DB. This suite extracts and runs the REAL active
// .gs source — the shared safety adapter (29_), the FC write helpers (14_) and the Campaign writers (20_) —
// inside a vm context whose Spreadsheet RECORDS every write instead of performing one. Nothing here is a
// re-implementation and nothing is a grep for a string: every assertion is made against a produced row, a
// produced cell, or a thrown safety token.
//
// WHY THIS EXISTS. The live `campaigns`, `campaign_sku_lines` and `fc_special_events` header rows contain every
// required column — unique, non-blank, correctly spelled — but not in the constants' ORDER, because this
// system's own additive migration appended them at the right edge before Production Safety Round S0.5 froze it.
// The S0.5 ordered gate then refused every Special Event save with
// `PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [campaigns]`. R2B-A adds an explicit, opt-in, per-table mode that
// drops the ORDER requirement for exactly those three tables and nothing else.
//
// THE LIVE HEADER ARRAYS BELOW ARE EVIDENCE, NOT INVENTION. They were captured read-only in FC-SUMMARY-R2A via
// `action=getTable`, whose handler walks the live header row left to right. They are the fixture precisely so
// that this suite proves the repair against the schema that actually refused, not against a tidy imaginary one.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var KMSAFE_PATH = path.join(__dirname, '..', 'js', 'core', 'supply-planning-production-safety.js');
function gs(rel) { return fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', rel), 'utf8'); }

// ---- extraction by brace matching (the same technique the other .gs suites use) ------------------------------
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('source function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces extracting: ' + name);
}
function extractVar(src, name) {
  var re = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;\\s*\\n');
  var m = re.exec(src);
  if (!m) throw new Error('source var not found: ' + name);
  return m[0];
}

var ADAPTER_FNS = ['prodSafetyBundle_', 'prodExpectedDbId_', 'prodSchemaError_', 'prodAssertDbTarget_',
  'prodRequireSheet_', 'prodRequireColumns_'];
var G14_VARS = ['FC_SPECIAL_EVENTS_HEADERS_', 'FC_SCHEMA_ORDERED_', 'FC_SCHEMA_BY_NAME_', 'FC_SCHEMA_BY_NAME_TABLES_'];
var G14_FNS = ['fcWriteSchemaByNameApproved_', 'fcWriteTimestamp_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_',
  'fcWriteReadSheet_', 'fcWriteAppendByHeader_', 'fcWriteUpsert_', 'fcEvtUp_', 'fcSpecialEventFindRowByKey_',
  'fcSpecialEventUpsert_'];
var G20_VARS = ['CAMPAIGNS_HEADERS_', 'CAMPAIGN_SKU_LINES_HEADERS_'];
var G20_FNS = ['campaignUpper_', 'campaignFindByKey_', 'campaignLineFindByKey_',
  'handleUpsertCampaign_', 'handleUpsertCampaignSkuLines_'];

// =================================================================================================
// THE LIVE HEADER ROWS (FC-SUMMARY-R2A, read-only capture)
// =================================================================================================
var LIVE = {
  campaigns: ['campaign_id', 'campaign_name', 'country', 'marketplace', 'marketplace_id', 'promotion_type',
    'major_event_flag', 'year', 'start_date', 'end_date', 'duration', 'status', 'event_reporting_fee',
    'commission', 'total_sales_amount', 'total_sales_units', 'total_ad_cost', 'total_acos', 'source',
    'created_at', 'updated_at', 'performance_sync_status', 'performance_synced_at', 'company', 'event_flag',
    'created_by', 'updated_by'],
  campaign_sku_lines: ['campaign_sku_line_id', 'campaign_id', 'sku', 'marketplace_sku_id', 'promo_price',
    'regular_price', 'price_units', 'discount_percent', 'special_condition', 'lps', 'line_status',
    'sales_amount', 'sales_units', 'impressions', 'sessions', 'clicks', 'ad_cost', 'ctr', 'cvr', 'acos',
    'source', 'created_at', 'updated_at', 'performance_source', 'performance_updated_at', 'created_by',
    'updated_by'],
  fc_special_events: ['event_fc_id', 'campaign_id', 'campaign_sku_line_id', 'marketplace_id', 'sku', 'year',
    'company', 'country', 'marketplace', 'category', 'series', 'event', 'event_period', 'event_month',
    'event_start_date', 'event_end_date', 'fc_qty', 'fc_share', 'source', 'status', 'created_by', 'created_at',
    'updated_by', 'updated_at', 'note', 'event_id', 'scope_type', 'scope_id', 'event_name']
};

// An existing row that must never move or be reinterpreted. Values are positioned under the LIVE headers.
function existingCampaignRow() {
  var r = new Array(LIVE.campaigns.length).fill('');
  r[0] = 'CMP-EXISTING1'; r[1] = 'BFCM 2026'; r[2] = 'US'; r[3] = 'Amazon'; r[4] = 'MP-US-AMA';
  r[11] = 'active'; r[19] = '2026-07-22'; r[20] = '2026-07-22'; r[23] = 'ResUS'; r[24] = 'BFCM';
  r[25] = 'fc-summary'; r[26] = 'fc-summary';
  return r;
}

// =================================================================================================
// FAKE SPREADSHEET — records writes instead of performing them, and can report every produced cell.
// =================================================================================================
function makeSheet(name, values) {
  var appended = [], setCells = [];
  var s = {
    getName: function () { return name; },
    getLastRow: function () { return values.length; },
    getLastColumn: function () { return values[0] ? values[0].length : 0; },
    getDataRange: function () {
      return { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
    },
    getRange: function (r, c, nr, nc) {
      var rows = nr === undefined ? 1 : nr, cols = nc === undefined ? 1 : nc;
      var out = [];
      for (var i = 0; i < rows; i++) {
        var row = [];
        for (var j = 0; j < cols; j++) {
          var rr = (r - 1) + i, cc = (c - 1) + j;
          row.push(values[rr] ? values[rr][cc] : '');
        }
        out.push(row);
      }
      return {
        getValues: function () { return out.map(function (x) { return x.slice(); }); },
        setValue: function (v) {
          if (r === 1) throw new Error('HEADER_WRITE_ATTEMPTED');   // row 1 is never writable
          setCells.push({ row: r, col: c, header: values[0][c - 1], value: v });
          while (values.length < r) values.push(new Array(values[0].length).fill(''));
          values[r - 1][c - 1] = v;
        },
        setValues: function () { throw new Error('RANGE_SETVALUES_ATTEMPTED'); }
      };
    },
    appendRow: function (row) { appended.push(row.slice()); values.push(row.slice()); },
    deleteRow: function () { throw new Error('DELETE_ROW_ATTEMPTED'); }
  };
  s.__appended = appended; s.__setCells = setCells; s.__values = values;
  return s;
}
function makeSs(tables, id) {
  var sheets = {};
  Object.keys(tables).forEach(function (n) { sheets[n] = makeSheet(n, tables[n].map(function (r) { return r.slice(); })); });
  return {
    getId: function () { return id === undefined ? 'SS-DB' : id; },
    getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheets, n) ? sheets[n] : null; },
    insertSheet: function () { throw new Error('INSERT_SHEET_ATTEMPTED'); },
    __sheet: function (n) { return sheets[n]; }
  };
}
// A live database holding all three tables, each with its real header row.
function liveDb(opts) {
  opts = opts || {};
  var t = {};
  ['campaigns', 'campaign_sku_lines', 'fc_special_events'].forEach(function (n) {
    var hdr = (opts.headers && opts.headers[n]) || LIVE[n];
    t[n] = [hdr.slice()];
  });
  if (!opts.noExistingRows) t.campaigns.push(existingCampaignRow());
  if (opts.omit) delete t[opts.omit];
  return t;
}

// =================================================================================================
// BUILD — a fresh context from the (optionally mutated) real sources.
// =================================================================================================
function build(mutate) {
  var srcAdapter = gs('29_production_safety_adapter.gs');
  var src14 = gs('14_fc_write_handlers.gs');
  var src20 = gs('20_campaign_write_handlers.gs');
  if (typeof mutate === 'function') { var m = mutate({ a: srcAdapter, g14: src14, g20: src20 }); srcAdapter = m.a; src14 = m.g14; src20 = m.g20; }

  var pieces = [];
  ADAPTER_FNS.forEach(function (n) { pieces.push(extractFn(srcAdapter, n)); });
  G14_VARS.forEach(function (n) { pieces.push(extractVar(src14, n)); });
  G14_FNS.forEach(function (n) { pieces.push(extractFn(src14, n)); });
  G20_VARS.forEach(function (n) { pieces.push(extractVar(src20, n)); });
  G20_FNS.forEach(function (n) { pieces.push(extractFn(src20, n)); });

  var uuid = 0;
  var ctx = {
    KMSAFE: require(KMSAFE_PATH),
    PRODUCTION_DB_SPREADSHEET_ID_: 'SS-DB',
    Logger: { log: function () {} },
    Utilities: {
      getUuid: function () { uuid++; return ('abcdef01234567890000000000000000' + uuid).slice(-32); },
      formatDate: function () { return '2026-09-18 12:00:00'; }
    },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    jsonResponse_: function (o) { return o; },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ctx.__ss; } },
    __ss: null,
    console: console
  };
  vm.createContext(ctx);
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'fc-r2b-a-sources.js' });
  ctx.__use = function (ss) { ctx.__ss = ss; };
  return ctx;
}

// =================================================================================================
// harness
// =================================================================================================
var pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('FAIL  ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) pass++; else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function token(fn, want, l) {
  try { fn(); fail++; console.error('FAIL  ' + l + ' — no refusal was raised'); }
  catch (e) {
    if (e && e.safetyToken === want) pass++;
    else { fail++; console.error('FAIL  ' + l + ' — token "' + (e && e.safetyToken) + '" != "' + want + '"'); }
  }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 92 - n.length)).join('-')); }

var CTX = build(null);
var HDRS = {
  campaigns: CTX.CAMPAIGNS_HEADERS_,
  campaign_sku_lines: CTX.CAMPAIGN_SKU_LINES_HEADERS_,
  fc_special_events: CTX.FC_SPECIAL_EVENTS_HEADERS_
};
var TABLES = ['campaigns', 'campaign_sku_lines', 'fc_special_events'];

// =================================================================================================
section('A. BEFORE — the ordered gate is what refused, and it still refuses');
// =================================================================================================
// This is the gate exactly as every unapproved table still gets it: prodRequireSheet_(ss, name, HEADERS_).
TABLES.forEach(function (t) {
  var ss = makeSs(liveDb());
  token(function () { CTX.prodRequireSheet_(ss, t, HDRS[t]); }, 'HEADER_ORDER_MISMATCH',
    'A1 ' + t + ': the ordered gate refuses the real live header row');
});
// And the refusal names the table, which is how the operator saw it.
try { CTX.prodRequireSheet_(makeSs(liveDb()), 'campaigns', HDRS.campaigns); }
catch (e) { eq(e.message, 'PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [campaigns]',
  'A2 the refusal message is the exact string the operator reported'); }

// The first divergence is position, and ONLY position — nothing is missing.
TABLES.forEach(function (t) {
  var missing = HDRS[t].filter(function (h) { return LIVE[t].indexOf(h) === -1; });
  eq(missing, [], 'A3 ' + t + ': every required column is present by name — order was the only complaint');
});

// =================================================================================================
section('B. AFTER — the approved tables pass, through the REAL handler entry points');
// =================================================================================================
TABLES.forEach(function (t) {
  var ss = makeSs(liveDb());
  var sheet;
  var threw = null;
  try { sheet = CTX.fcWriteEnsureSheet_(ss, t, HDRS[t], CTX.FC_SCHEMA_BY_NAME_); } catch (e) { threw = e; }
  ok(!threw && sheet && sheet.getName() === t,
    'B1 ' + t + ': the approved mode resolves the live sheet' + (threw ? ' (threw ' + threw.message + ')' : ''));
});

// The whole point: the three-stage Special Event sequence now reaches its writes.
(function () {
  var ss = makeSs(liveDb()); CTX.__use(ss);
  var res = CTX.handleUpsertCampaign_({
    campaign_name: 'R2BA ACCEPTANCE', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    marketplace_id: 'MP-US-AMA', year: 2027, promotion_type: 'BFCM', event_flag: 'BFCM',
    major_event_flag: 'BFCM', start_date: '2027-11-24', end_date: '2027-11-30', status: 'active',
    source: 'fc_summary_builder', actor: 'r2ba-test'
  });
  ok(res && res.success === true, 'B2 handleUpsertCampaign_ succeeds against the live header row');
  ok(res && res.data && /^CMP-/.test(res.data.campaign_id), 'B3 it mints a CMP- campaign_id');
  ok(res && res.data && res.data.created === true, 'B4 and reports it as created, not updated');
})();

(function () {
  var ss = makeSs(liveDb()); CTX.__use(ss);
  var res = CTX.handleUpsertCampaignSkuLines_({
    campaign_id: 'CMP-EXISTING1', actor: 'r2ba-test',
    lines: [{ sku: 'SP3320-T', marketplace_sku_id: 'MPSKU-US-AMA-SP3320-T-24b783', regular_price: 39.99,
      deal_price: 29.99, discount_percent: 25, price_units: 'USD', line_status: 'active' }]
  });
  ok(res && res.success === true, 'B5 handleUpsertCampaignSkuLines_ succeeds against the live header row');
  ok(res && res.data && res.data.upserted === 1 && res.data.created === 1, 'B6 one line, created');
})();

(function () {
  var ss = makeSs(liveDb());
  var r = CTX.fcSpecialEventUpsert_(ss, {
    campaign_id: 'CMP-EXISTING1', campaign_sku_line_id: 'CSL-1', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', marketplace_id: 'MP-US-AMA', scope_type: 'sku', scope_id: 'SP3320-T',
    sku: 'SP3320-T', series: 'SP', category: 'Sealer', event_name: 'BFCM', event_period: 'Nov',
    event_start_date: '2027-11-24', event_end_date: '2027-11-30', event_month: 11, year: 2027, fc_qty: 3000
  }, 'r2ba-test');
  ok(r && /^EFC-/.test(r.event_fc_id) && r.created === true,
    'B7 fcSpecialEventUpsert_ succeeds and mints an EFC- id');
})();

// =================================================================================================
section('C. EVERY PRODUCED VALUE LANDS UNDER ITS INTENDED NAMED COLUMN');
// =================================================================================================
// Not a success boolean: the COMPLETE appended row is compared, cell by cell, against the row that the live
// header row demands. If the writer were positional, these would be scrambled.
(function () {
  var ss = makeSs(liveDb()); CTX.__use(ss);
  var payload = {
    campaign_name: 'R2BA PLACEMENT', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    marketplace_id: 'MP-US-AMA', year: 2027, promotion_type: 'BFCM', event_flag: 'BFCM',
    major_event_flag: 'BFCM', start_date: '2027-11-24', end_date: '2027-11-30', duration: 7,
    status: 'active', source: 'fc_summary_builder', actor: 'r2ba-test'
  };
  var res = CTX.handleUpsertCampaign_(payload);
  var sheet = ss.__sheet('campaigns');
  eq(sheet.__appended.length, 1, 'C1 exactly one row was appended to campaigns');

  var got = {};
  LIVE.campaigns.forEach(function (h, i) { if (sheet.__appended[0][i] !== '') got[h] = sheet.__appended[0][i]; });
  eq(got, {
    campaign_id: res.data.campaign_id,
    campaign_name: 'R2BA PLACEMENT', country: 'US', marketplace: 'Amazon', marketplace_id: 'MP-US-AMA',
    promotion_type: 'BFCM', major_event_flag: 'BFCM', year: 2027, start_date: '2027-11-24',
    end_date: '2027-11-30', duration: 7, status: 'active', source: 'fc_summary_builder',
    created_at: '2026-09-18 12:00:00', updated_at: '2026-09-18 12:00:00',
    company: 'ResUS', event_flag: 'BFCM', created_by: 'r2ba-test', updated_by: 'r2ba-test'
  }, 'C2 every value sits under its own NAMED live column — company at index 23, event_flag at 24');

  // The two columns no contract declares are left alone rather than filled with a guess.
  eq(sheet.__appended[0][21], '', 'C3 performance_sync_status (an extra column) is untouched');
  eq(sheet.__appended[0][22], '', 'C4 performance_synced_at (an extra column) is untouched');
  eq(sheet.__appended[0].length, LIVE.campaigns.length, 'C5 the appended row is exactly as wide as the live header');
})();

// The same proof for a line, where `sku` and `marketplace_sku_id` are TRANSPOSED relative to the constant.
// A positional writer would put the SKU in the marketplace_sku_id column here; this one cannot.
(function () {
  var ss = makeSs(liveDb()); CTX.__use(ss);
  CTX.handleUpsertCampaignSkuLines_({
    campaign_id: 'CMP-EXISTING1', actor: 'r2ba-test',
    lines: [{ sku: 'SP3320-T', marketplace_sku_id: 'MPSKU-US-AMA-SP3320-T-24b783', regular_price: 39.99,
      deal_price: 29.99, discount_percent: 25, price_units: 'USD', special_condition: 'coupon',
      line_status: 'active', source: 'fc_summary_builder' }]
  });
  var sheet = ss.__sheet('campaign_sku_lines');
  var row = sheet.__appended[0];
  eq(row[LIVE.campaign_sku_lines.indexOf('sku')], 'SP3320-T',
    'C6 the Master SKU lands in `sku` (live index 2), not in the constant\'s index 3');
  eq(row[LIVE.campaign_sku_lines.indexOf('marketplace_sku_id')], 'MPSKU-US-AMA-SP3320-T-24b783',
    'C7 the marketplace SKU lands in `marketplace_sku_id` (live index 3) — the transposition is harmless');
  eq(row[LIVE.campaign_sku_lines.indexOf('promo_price')], 29.99, 'C8 deal_price lands in promo_price');
  eq(row[LIVE.campaign_sku_lines.indexOf('price_units')], 'USD', 'C9 the currency snapshot lands in price_units');
  eq(row[LIVE.campaign_sku_lines.indexOf('sales_amount')], '', 'C10 the performance columns stay empty');
})();

// fc_special_events carries BOTH `event` and `event_name` live. The writer must fill only the canonical one.
(function () {
  var ss = makeSs(liveDb());
  CTX.fcSpecialEventUpsert_(ss, {
    campaign_id: 'CMP-EXISTING1', campaign_sku_line_id: 'CSL-1', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', marketplace_id: 'MP-US-AMA', scope_type: 'sku', scope_id: 'SP3320-T',
    sku: 'SP3320-T', series: 'SP', category: 'Sealer', event_name: 'BFCM', event_period: 'Nov',
    event_start_date: '2027-11-24', event_end_date: '2027-11-30', event_month: 11, year: 2027, fc_qty: 3000,
    note: 'FC Summary Special Event Builder'
  }, 'r2ba-test');
  var sheet = ss.__sheet('fc_special_events'), row = sheet.__appended[0], L = LIVE.fc_special_events;
  eq(row[L.indexOf('event_name')], 'BFCM', 'C11 event_name (live index 28) is written');
  eq(row[L.indexOf('event')], '', 'C12 the legacy `event` column is NOT written — it is not in the contract');
  eq(row[L.indexOf('event_id')], '', 'C13 the stray legacy `event_id` column is left untouched, never dropped');
  ok(/^EFC-/.test(row[L.indexOf('event_fc_id')]), 'C14 the canonical PK event_fc_id IS populated');
  eq(row[L.indexOf('scope_type')], 'sku', 'C15 scope_type (live index 26) is written');
  eq(row[L.indexOf('fc_qty')], 3000, 'C16 fc_qty is written');
})();

// =================================================================================================
section('D. NO EXISTING DATA IS MOVED OR REINTERPRETED');
// =================================================================================================
(function () {
  var before = existingCampaignRow();
  var ss = makeSs(liveDb()); CTX.__use(ss);
  CTX.handleUpsertCampaign_({ campaign_name: 'SOMETHING ELSE', company: 'KM', country: 'CA',
    marketplace: 'Amazon', year: 2027, actor: 'r2ba-test' });
  var sheet = ss.__sheet('campaigns');
  eq(sheet.__values[0], LIVE.campaigns, 'D1 the header row is byte-identical after the write');
  eq(sheet.__values[1], before, 'D2 the pre-existing row is untouched, cell for cell');
  eq(sheet.__setCells.length, 0, 'D3 a CREATE touched no existing cell');
})();

// An UPDATE must rewrite only the named columns of the matched row, and never the header.
(function () {
  var ss = makeSs(liveDb()); CTX.__use(ss);
  var res = CTX.handleUpsertCampaign_({ campaign_id: 'CMP-EXISTING1', campaign_name: 'BFCM 2026',
    status: 'closed', actor: 'r2ba-test' });
  var sheet = ss.__sheet('campaigns');
  ok(res.success === true && res.data.created === false, 'D4 an existing campaign_id updates in place, no duplicate');
  eq(sheet.__appended.length, 0, 'D5 nothing was appended');
  eq(sheet.__values[0], LIVE.campaigns, 'D6 the header row is still byte-identical');
  var touched = sheet.__setCells.map(function (c) { return c.header; }).sort();
  eq(touched, ['campaign_name', 'status', 'updated_at', 'updated_by'],
    'D7 only the named columns present in the body (+ the audit stamps) were written');
  eq(sheet.__values[1][LIVE.campaigns.indexOf('company')], 'ResUS',
    'D8 `company` at live index 23 still reads ResUS — no shear');
  eq(sheet.__values[1][LIVE.campaigns.indexOf('created_by')], 'fc-summary',
    'D9 created_by is never overwritten on an update');
})();

// =================================================================================================
section('E. THE APPROVED GATE STILL FAILS CLOSED');
// =================================================================================================
TABLES.forEach(function (t) {
  // missing tab
  token(function () {
    CTX.fcWriteEnsureSheet_(makeSs(liveDb({ omit: t })), t, HDRS[t], CTX.FC_SCHEMA_BY_NAME_);
  }, 'SCHEMA_NOT_PROVISIONED', 'E1 ' + t + ': a missing sheet is refused');

  // wrong spreadsheet
  token(function () {
    CTX.fcWriteEnsureSheet_(makeSs(liveDb(), 'SS-WRONG'), t, HDRS[t], CTX.FC_SCHEMA_BY_NAME_);
  }, 'WRONG_SPREADSHEET_TARGET', 'E2 ' + t + ': the wrong database target is refused');

  // a required column removed
  var dropped = HDRS[t][Math.floor(HDRS[t].length / 2)];
  var less = {}; less[t] = LIVE[t].filter(function (h) { return h !== dropped; });
  token(function () {
    CTX.fcWriteEnsureSheet_(makeSs(liveDb({ headers: less, noExistingRows: true })), t, HDRS[t], CTX.FC_SCHEMA_BY_NAME_);
  }, 'MISSING_REQUIRED_HEADER', 'E3 ' + t + ': a missing required column ("' + dropped + '") is refused');

  // a duplicated (ambiguous) column
  var dup = {}; dup[t] = LIVE[t].concat([HDRS[t][1]]);
  token(function () {
    CTX.fcWriteEnsureSheet_(makeSs(liveDb({ headers: dup, noExistingRows: true })), t, HDRS[t], CTX.FC_SCHEMA_BY_NAME_);
  }, 'HEADER_DUPLICATE', 'E4 ' + t + ': an ambiguous duplicate column ("' + HDRS[t][1] + '") is refused');

  // a blank header cell
  var blank = {}; blank[t] = LIVE[t].slice(); blank[t].splice(3, 0, '');
  token(function () {
    CTX.fcWriteEnsureSheet_(makeSs(liveDb({ headers: blank, noExistingRows: true })), t, HDRS[t], CTX.FC_SCHEMA_BY_NAME_);
  }, 'HEADER_BLANK', 'E5 ' + t + ': a blank header cell is refused');
});

// And the refusal is a ZERO WRITE: no row appended, no cell set, header untouched.
(function () {
  var less = { campaigns: LIVE.campaigns.filter(function (h) { return h !== 'duration'; }) };
  var ss = makeSs(liveDb({ headers: less })); CTX.__use(ss);
  var threw = false;
  try { CTX.handleUpsertCampaign_({ campaign_name: 'X', company: 'ResUS', country: 'US', marketplace: 'Amazon' }); }
  catch (e) { threw = true; }
  var sheet = ss.__sheet('campaigns');
  ok(threw, 'E6 the refusal propagates out of handleUpsertCampaign_ (it is not swallowed into a success)');
  eq(sheet.__appended.length, 0, 'E7 zero rows appended by a refused write');
  eq(sheet.__setCells.length, 0, 'E8 zero cells set by a refused write');
  eq(sheet.__values[0], less.campaigns, 'E9 the header row is untouched by a refused write');
})();

// =================================================================================================
section('F. ORDER TOLERANCE IS GENUINE, AND EXTRA COLUMNS ARE ALLOWED');
// =================================================================================================
function shuffle(a, seed) {
  var out = a.slice();
  for (var i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var j = seed % (i + 1); var t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}
TABLES.forEach(function (t) {
  [1, 7, 99].forEach(function (seed) {
    var perm = {}; perm[t] = shuffle(LIVE[t], seed);
    var threw = null;
    try { CTX.fcWriteEnsureSheet_(makeSs(liveDb({ headers: perm, noExistingRows: true })), t, HDRS[t], CTX.FC_SCHEMA_BY_NAME_); }
    catch (e) { threw = e; }
    ok(!threw, 'F1 ' + t + ': an arbitrary safe reordering (seed ' + seed + ') passes'
      + (threw ? ' — threw ' + threw.message : ''));
  });
  // an unexpected extra column is additive, not a fault
  var extra = {}; extra[t] = LIVE[t].concat(['some_future_additive_column']);
  var threw2 = null;
  try { CTX.fcWriteEnsureSheet_(makeSs(liveDb({ headers: extra, noExistingRows: true })), t, HDRS[t], CTX.FC_SCHEMA_BY_NAME_); }
  catch (e) { threw2 = e; }
  ok(!threw2, 'F2 ' + t + ': an unexpected extra column passes (additive contract)');
});

// A reordered sheet still places values by name — reordering must not become a different kind of shear.
(function () {
  var perm = { campaigns: shuffle(LIVE.campaigns, 42) };
  var ss = makeSs(liveDb({ headers: perm, noExistingRows: true })); CTX.__use(ss);
  CTX.handleUpsertCampaign_({ campaign_name: 'PERMUTED', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', year: 2027, status: 'active', actor: 'r2ba-test' });
  var row = ss.__sheet('campaigns').__appended[0], H = perm.campaigns;
  eq(row[H.indexOf('company')], 'ResUS', 'F3 under an arbitrary permutation `company` still lands in `company`');
  eq(row[H.indexOf('campaign_name')], 'PERMUTED', 'F4 …and campaign_name in campaign_name');
  eq(row[H.indexOf('status')], 'active', 'F5 …and status in status');
})();

// =================================================================================================
section('G. SCOPE — every unapproved table keeps the ordered gate');
// =================================================================================================
// The eleven other tables that share fcWriteEnsureSheet_ must be bit-for-bit unaffected. A reordered
// factory_stock_movements header must STILL be refused.
(function () {
  var MOV = ['movement_id', 'sku', 'qty', 'movement_type'];
  var reordered = ['sku', 'movement_id', 'qty', 'movement_type'];
  var ss = makeSs({ factory_stock_movements: [reordered] });
  token(function () { CTX.fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV); },
    'HEADER_ORDER_MISMATCH', 'G1 an unapproved table with NO mode still gets the ordered gate');
  token(function () { CTX.fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV, CTX.FC_SCHEMA_BY_NAME_); },
    'HEADER_ORDER_MISMATCH', 'G2 and it CANNOT opt itself in — the approved list is the second lock');
})();
// FC-SUMMARY-R2B-A2 — the three Special Event tables must STILL be approved, together and unchanged. That is
// this round's non-regression gate and it is the half of G3 that must never move.
['campaigns', 'campaign_sku_lines', 'fc_special_events'].forEach(function (t) {
  ok(CTX.FC_SCHEMA_BY_NAME_TABLES_.indexOf(t) > -1,
    'G3 ' + t + ' remains approved — the Special Event contract is untouched by later rounds');
});
// G4 previously asserted that fc_target_rules was NOT approved, and gave the reason: its live header row had
// never been observed, so a header could not be inferred from an empty read. That reason is spent — row 1 was
// supplied, and it showed three genuinely MISSING required columns (scope_type, scope_id, target_percentage),
// which is a different fault from the reordering this suite exists for. Membership alone cannot create a
// column, so the assertion now requires membership AND the additive migration that makes it mean anything.
// Full coverage of that repair lives in fc-target-rules-schema-repair-r2b-a2.test.js.
ok(CTX.FC_SCHEMA_BY_NAME_TABLES_.indexOf('fc_target_rules') > -1,
  'G4 fc_target_rules joined the approved set once its row 1 was actually observed');
ok(fs.existsSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script',
    'TEMP_migrate_fc_target_rules_header_r2ba2.gs')),
  'G4b and it joined together with the additive migration that appends the three columns it was missing —',
  'membership without the migration would only change which token the refusal carries');
eq(CTX.FC_SCHEMA_BY_NAME_TABLES_.slice().sort(),
  ['campaign_sku_lines', 'campaigns', 'fc_special_events', 'fc_target_rules'],
  'G4c the approved set is exactly these four tables and nothing else');
eq(CTX.fcWriteSchemaByNameApproved_('campaigns', undefined), false,
  'G5 an approved table with no explicit opt-in still gets ORDERED — the default is never the relaxed mode');
eq(CTX.fcWriteSchemaByNameApproved_('campaigns', CTX.FC_SCHEMA_ORDERED_), false,
  'G6 an explicit ORDERED opt-in is honoured');
eq(CTX.fcWriteSchemaByNameApproved_('campaigns', CTX.FC_SCHEMA_BY_NAME_), true,
  'G7 both conditions together, and only then');

// fc_target_rules travels through the SAME fcWriteUpsert_ and must still be refused on a reordered header.
(function () {
  var TR = ['target_rule_id', 'company', 'country'];
  var ss = makeSs({ fc_target_rules: [['company', 'target_rule_id', 'country']] });
  token(function () { CTX.fcWriteUpsert_(ss, 'fc_target_rules', TR, 'target_rule_id', 'T1', {}, 'a'); },
    'HEADER_ORDER_MISMATCH', 'G8 fc_target_rules keeps the ordered gate through fcWriteUpsert_');
})();

// No literal-index write may have been introduced into either writer.
(function () {
  function codeOnly(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''); }
  [['14_fc_write_handlers.gs'], ['20_campaign_write_handlers.gs']].forEach(function (f) {
    var src = codeOnly(gs(f[0]));
    // Only WRITE sites matter. A 4-argument getRange(1, 1, 1, lastCol) is the header READ and is correct;
    // what must not exist is a getRange whose COLUMN is a literal and which is then written to.
    var writes = src.match(/getRange\([^)]*\)\s*\.\s*setValues?\s*\(/g) || [];
    var literalCol = writes.filter(function (w) {
      var args = w.slice(w.indexOf('(') + 1, w.indexOf(')')).split(',');
      return args.length >= 2 && /^\s*\d+\s*$/.test(args[1]);
    });
    eq(literalCol, [], 'G9 ' + f[0] + ': every write resolves its column from the LIVE header, never a literal index');
    // Anti-vacuity, stated per file rather than as one blanket rule: 14_ owns every cell write in this path
    // and must therefore HAVE write sites for the check above to mean anything, while 20_ owns none at all —
    // it delegates all writing to 14_, which is itself the property worth pinning.
    if (f[0] === '14_fc_write_handlers.gs') {
      ok(writes.length > 0, 'G9b ' + f[0] + ': write sites exist, so G9 is not vacuous');
    } else {
      eq(writes, [], 'G9b ' + f[0] + ': performs no direct cell write — it delegates to the 14_ helpers');
    }
  });
})();

// =================================================================================================
section('H. MUTANTS — each must be caught by an observable outcome');
// =================================================================================================
function swap(src, a, b) {
  var n = src.split(a).length - 1;
  if (n !== 1) throw new Error('mutation anchor hit ' + n + ' time(s): ' + a.slice(0, 70));
  return src.split(a).join(b);
}
var mutants = [

  { id: 'M1', why: 'the opt-in is globally applied — every one of the fourteen tables gets the relaxed gate',
    mutate: function (s) { return { a: s.a, g20: s.g20,
      g14: swap(s.g14, 'if (fcWriteSchemaByNameApproved_(name, mode)) {', 'if (true) {') }; },
    check: function (c) {
      // The canary is an UNAPPROVED table: it must still refuse a reordered header, so a THROW is the
      // behaviour holding and a clean return is the mutation becoming observable.
      try { c.fcWriteEnsureSheet_(makeSs({ factory_stock_movements: [['sku', 'movement_id', 'qty']] }),
        'factory_stock_movements', ['movement_id', 'sku', 'qty']); return false; }
      catch (e) { return e.safetyToken === 'HEADER_ORDER_MISMATCH'; }
    } },

  { id: 'M2', why: 'the missing-required-column check is removed from the approved path',
    mutate: function (s) { return { a: s.a, g20: s.g20,
      g14: swap(s.g14, "    prodRequireColumns_(byName, (headers || []).filter(function (h) { return !!h; }));",
        '    /* removed */') }; },
    check: function (c) {
      var less = { campaigns: LIVE.campaigns.filter(function (h) { return h !== 'duration'; }) };
      try { c.fcWriteEnsureSheet_(makeSs(liveDb({ headers: less, noExistingRows: true })), 'campaigns',
        c.CAMPAIGNS_HEADERS_, c.FC_SCHEMA_BY_NAME_); return false; }
      catch (e) { return e.safetyToken === 'MISSING_REQUIRED_HEADER'; }
    } },

  { id: 'M3', why: 'the duplicate-header check is removed from the shared classifier',
    mutate: function (s) { return { a: s.a, g14: s.g14, g20: s.g20 }; },
    mutateCore: function (core) { return core.replace(
      'else if (duplicateHeaders.length) schemaStatus = SCHEMA_STATUS.HEADER_DUPLICATE;', '') },
    check: function (c) {
      var dup = { campaigns: LIVE.campaigns.concat(['company']) };
      try { c.fcWriteEnsureSheet_(makeSs(liveDb({ headers: dup, noExistingRows: true })), 'campaigns',
        c.CAMPAIGNS_HEADERS_, c.FC_SCHEMA_BY_NAME_); return false; }
      catch (e) { return e.safetyToken === 'HEADER_DUPLICATE'; }
    } },

  { id: 'M4', why: 'the blank-header check is removed from the shared classifier',
    mutate: function (s) { return { a: s.a, g14: s.g14, g20: s.g20 }; },
    mutateCore: function (core) { return core.replace(
      'else if (blankHeaderIndexes.length) schemaStatus = SCHEMA_STATUS.HEADER_BLANK;', '') },
    check: function (c) {
      var blank = { campaigns: LIVE.campaigns.slice() }; blank.campaigns.splice(3, 0, '');
      try { c.fcWriteEnsureSheet_(makeSs(liveDb({ headers: blank, noExistingRows: true })), 'campaigns',
        c.CAMPAIGNS_HEADERS_, c.FC_SCHEMA_BY_NAME_); return false; }
      catch (e) { return e.safetyToken === 'HEADER_BLANK'; }
    } },

  { id: 'M5', why: 'campaigns alone is repaired — stage 1 commits and stage 2 then refuses (a partial write)',
    mutate: function (s) { return { a: s.a, g20: s.g20,
      g14: swap(s.g14, "var FC_SCHEMA_BY_NAME_TABLES_ = ['campaigns', 'campaign_sku_lines', 'fc_special_events'];",
        "var FC_SCHEMA_BY_NAME_TABLES_ = ['campaigns'];") }; },
    check: function (c) {
      var ss = makeSs(liveDb()); c.__use(ss);
      var campOk = c.handleUpsertCampaign_({ campaign_name: 'M5', company: 'ResUS', country: 'US',
        marketplace: 'Amazon', year: 2027, actor: 't' }).success === true;
      var linesOk = true;
      try { c.handleUpsertCampaignSkuLines_({ campaign_id: 'CMP-EXISTING1',
        lines: [{ sku: 'S', marketplace_sku_id: 'M' }], actor: 't' }); } catch (e) { linesOk = false; }
      return campOk && linesOk;   // the defect is exactly "campaigns yes, lines no"
    } },

  { id: 'M6', why: 'campaign_sku_lines is left out of the approved set',
    mutate: function (s) { return { a: s.a, g20: s.g20,
      g14: swap(s.g14, "var FC_SCHEMA_BY_NAME_TABLES_ = ['campaigns', 'campaign_sku_lines', 'fc_special_events'];",
        "var FC_SCHEMA_BY_NAME_TABLES_ = ['campaigns', 'fc_special_events'];") }; },
    check: function (c) {
      var ss = makeSs(liveDb()); c.__use(ss);
      try { c.handleUpsertCampaignSkuLines_({ campaign_id: 'CMP-EXISTING1',
        lines: [{ sku: 'S', marketplace_sku_id: 'M' }], actor: 't' }); return true; }
      catch (e) { return false; }
    } },

  { id: 'M7', why: 'fc_special_events is left out of the approved set',
    mutate: function (s) { return { a: s.a, g20: s.g20,
      g14: swap(s.g14, "var FC_SCHEMA_BY_NAME_TABLES_ = ['campaigns', 'campaign_sku_lines', 'fc_special_events'];",
        "var FC_SCHEMA_BY_NAME_TABLES_ = ['campaigns', 'campaign_sku_lines'];") }; },
    check: function (c) {
      try { c.fcSpecialEventUpsert_(makeSs(liveDb()), { campaign_id: 'C', sku: 'S', event_name: 'E', fc_qty: 1 }, 't');
        return true; } catch (e) { return false; }
    } },

  { id: 'M8', why: 'the name lookup is replaced by a numeric index in the append writer',
    mutate: function (s) { return { a: s.a, g20: s.g20,
      g14: swap(s.g14, "    if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) {\n      row[i] = obj[headers[i]];",
        "    if (obj.hasOwnProperty(CAMPAIGNS_HEADERS_[i]) && obj[CAMPAIGNS_HEADERS_[i]] !== undefined && obj[CAMPAIGNS_HEADERS_[i]] !== null) {\n      row[i] = obj[CAMPAIGNS_HEADERS_[i]];") }; },
    check: function (c) {
      var ss = makeSs(liveDb()); c.__use(ss);
      c.handleUpsertCampaign_({ campaign_name: 'M8', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        year: 2027, actor: 't' });
      var row = ss.__sheet('campaigns').__appended[0];
      // Under the mutation, `company` is written at the CONSTANT's index 1 (which is campaign_name live).
      return row[LIVE.campaigns.indexOf('company')] === 'ResUS'
          && row[LIVE.campaigns.indexOf('campaign_name')] === 'M8';
    } }
];

// M3/M4 mutate the shared classifier core, so they need their own module copy.
function buildWithCore(mutant) {
  if (!mutant.mutateCore) return build(mutant.mutate);
  var tmp = path.join(require('os').tmpdir(), 'km-r2ba-core-' + mutant.id + '.js');
  fs.writeFileSync(tmp, mutant.mutateCore(fs.readFileSync(KMSAFE_PATH, 'utf8')), 'utf8');
  var saved = KMSAFE_PATH;
  var ctx = (function () {
    var real = require.cache[require.resolve(saved)];
    delete require.cache[require.resolve(saved)];
    var patched = require(tmp);
    var c = build(mutant.mutate);
    c.KMSAFE = patched;
    if (real) require.cache[require.resolve(saved)] = real;
    return c;
  })();
  try { fs.unlinkSync(tmp); } catch (e) {}
  return ctx;
}

var caught = 0, survived = 0;
mutants.forEach(function (m) {
  var ctx, held;
  try { ctx = buildWithCore(m); held = m.check(ctx); }
  catch (e) { held = false; }     // a mutation that cannot even build is caught
  if (held) { survived++; console.error('SURVIVED  ' + m.id + '  ' + m.why); }
  else { caught++; console.log('ok   ' + m.id + '  ' + m.why + ' (caught)'); }
});

// =================================================================================================
console.log('\n' + new Array(101).join('='));
console.log('FC SCHEMA GATE BY NAME (R2B-A) — passed ' + pass + '  failed ' + fail +
  '  |  mutants caught ' + caught + '  survived ' + survived);
console.log(new Array(101).join('='));
process.exit((fail === 0 && survived === 0) ? 0 : 1);
