// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R1
// AN EXISTING SPECIAL EVENT WAS A BLANK FORM, AND THE SAVE THAT FOLLOWED OVERWROTE IT
// Run: node assets/tests/fc-special-event-identity-and-builder-prefetch-r2b-a3-r1.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime, no writes.
//
// THE DEFECT, IN TWO HALVES THAT COMPOUNDED EACH OTHER.
//
//   1. The campaign business key was company|country|marketplace|campaign_name|year, and the Special
//      Event Builder composes campaign_name as `<event flag> <year>`. So "BFCM 2027" named every BFCM
//      window in 2027. A second window resolved to the FIRST campaign, overwrote its start and end
//      dates, and then campaignLineFindByKey_ matched the same marketplace_sku_id and overwrote its
//      line. Two events, one row, and the response said "Saved successfully".
//
//   2. openEventModal cleared every field on every open and there was no path that could load a
//      persisted event. An operator revisiting an event saw an empty form and retyped what they
//      remembered — into the save described above.
//
// Neither half is a UI complaint. Together they are a silent data-loss path, and the guard that would
// have caught it — an optimistic-concurrency token — existed for fc_target_rules and for nothing else.
//
// WHAT THIS SUITE DRIVES. The REAL handlers, lifted out of 14_ and 20_ and run against a fake sheet
// that records writes instead of performing them, and the REAL page functions, lifted out of
// fc-summary.js and run against a DOM shim carrying the modal's actual control ids. Nothing is
// re-implemented: a re-implementation would agree with itself.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n'); }

var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');
var GS14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
var GS20 = read('assets/specs/active/apps-script/20_campaign_write_handlers.gs');
var GS63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var HTML = read('assets/html/pages/fc-summary.html');
var ADAPTER = read('assets/specs/active/apps-script/29_production_safety_adapter.gs');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 100 - n.length)).join('-')); }

// ------------------------------------------------------------------ extraction ------------------
function fnSrc(src, name) {
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
function asyncFnSrc(src, name) {
  var start = src.indexOf('async function ' + name + '(');
  if (start < 0) return fnSrc(src, name);
  var b = src.indexOf('{', src.indexOf(')', start)), d = 0;
  for (var i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}
function varSrc(src, name) {
  var start = src.indexOf('var ' + name + ' =');
  if (start < 0) throw new Error('var not found: ' + name);
  var i = start, depth = 0, inStr = null;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (inStr) { if (ch === '\\') { i++; continue; } if (ch === inStr) inStr = null; continue; }
    if (ch === "'" || ch === '"') { inStr = ch; continue; }
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') depth--;
    else if (ch === ';' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unterminated var: ' + name);
}

// =================================================================================================
// THE FAKE SPREADSHEET — records writes instead of performing them.
// =================================================================================================
var HDR = {
  campaigns: ['campaign_id', 'campaign_name', 'country', 'marketplace', 'marketplace_id',
    'promotion_type', 'major_event_flag', 'year', 'start_date', 'end_date', 'duration', 'status',
    'event_reporting_fee', 'commission', 'total_sales_amount', 'total_sales_units', 'total_ad_cost',
    'total_acos', 'source', 'created_at', 'updated_at', 'company', 'event_flag', 'created_by', 'updated_by'],
  campaign_sku_lines: ['campaign_sku_line_id', 'campaign_id', 'sku', 'promo_price', 'regular_price',
    'discount_percent', 'special_condition', 'lps', 'line_status', 'source', 'created_by', 'created_at',
    'updated_by', 'updated_at', 'marketplace_sku_id', 'price_units'],
  fc_special_events: ['event_fc_id', 'campaign_id', 'campaign_sku_line_id', 'company', 'country',
    'marketplace', 'marketplace_id', 'scope_type', 'scope_id', 'sku', 'series', 'category', 'event_name',
    'event_period', 'event_start_date', 'event_end_date', 'event_month', 'year', 'fc_qty', 'note',
    'created_by', 'created_at', 'updated_by', 'updated_at']
};

function makeSheet(name, values) {
  var appended = [], setCells = [];
  var s = {
    getName: function () { return name; },
    getLastRow: function () { return values.length; },
    getLastColumn: function () { return values[0] ? values[0].length : 0; },
    getDataRange: function () { return { getValues: function () { return values.map(function (r) { return r.slice(); }); } }; },
    getRange: function (r, c, nr, nc) {
      var rows = nr === undefined ? 1 : nr, cols = nc === undefined ? 1 : nc;
      var out = [];
      for (var i = 0; i < rows; i++) {
        var row = [];
        for (var j = 0; j < cols; j++) { var rr = (r - 1) + i, cc = (c - 1) + j; row.push(values[rr] ? values[rr][cc] : ''); }
        out.push(row);
      }
      return {
        getValues: function () { return out.map(function (x) { return x.slice(); }); },
        setValue: function (v) {
          if (r === 1) throw new Error('HEADER_WRITE_ATTEMPTED');
          setCells.push({ row: r, col: c, header: values[0][c - 1], value: v });
          while (values.length < r) values.push(new Array(values[0].length).fill(''));
          values[r - 1][c - 1] = v;
        },
        setValues: function (vals) {
          if (r === 1) throw new Error('HEADER_WRITE_ATTEMPTED');
          (vals[0] || []).forEach(function (v, j) {
            setCells.push({ row: r, col: c + j, header: values[0][c - 1 + j], value: v });
            values[r - 1][c - 1 + j] = v;
          });
        }
      };
    },
    appendRow: function (row) { appended.push(row.slice()); values.push(row.slice()); },
    deleteRow: function () { throw new Error('DELETE_ROW_ATTEMPTED'); }
  };
  s.__appended = appended; s.__setCells = setCells; s.__values = values;
  return s;
}
function makeSs(tables) {
  var sheets = {};
  Object.keys(tables).forEach(function (n) { sheets[n] = makeSheet(n, tables[n].map(function (r) { return r.slice(); })); });
  return {
    getId: function () { return 'SS-DB'; },
    getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheets, n) ? sheets[n] : null; },
    insertSheet: function () { throw new Error('INSERT_SHEET_ATTEMPTED'); },
    __sheet: function (n) { return sheets[n]; },
    __writes: function () {
      return Object.keys(sheets).reduce(function (n, k) { return n + sheets[k].__setCells.length + sheets[k].__appended.length; }, 0);
    }
  };
}
function emptyDb() {
  return { campaigns: [HDR.campaigns.slice()], campaign_sku_lines: [HDR.campaign_sku_lines.slice()],
           fc_special_events: [HDR.fc_special_events.slice()] };
}
function rowOf(table, obj) {
  return HDR[table].map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; });
}

// The server world: the REAL handlers, nothing re-implemented.
var SRV_NAMES_14_VARS = ['FC_SPECIAL_EVENTS_HEADERS_', 'FC_TARGET_RULES_HEADERS_', 'FC_SCHEMA_ORDERED_',
  'FC_SCHEMA_BY_NAME_', 'FC_SCHEMA_BY_NAME_TABLES_', 'FC_SE_FINGERPRINT_FIELDS_', 'FC_SE_FINGERPRINT_NUMERIC_',
  'FC_SE_UNIQUENESS_FIELDS_'];
var SRV_NAMES_14_FNS = ['fcWriteSchemaByNameApproved_', 'fcWriteTimestamp_', 'fcWriteEnsureSheet_',
  'fcWriteEnsureColumns_', 'fcWriteReadSheet_', 'fcWriteAppendByHeader_', 'fcWriteUpsert_', 'fcEvtUp_',
  'fcSpecialEventFindRowByKey_', 'fcSeUniquenessKey_', 'fcSeUniquenessConflict_',
  'fcSeNum_', 'fcSeFingerprint_', 'fcSeRowAt_', 'fcSeReceiptFor_',
  'fcSpecialEventUpsert_', 'handleUpsertFcSpecialEvent_', 'handleImportFcSpecialEventsBatch_'];
var SRV_NAMES_20_VARS = ['CAMPAIGNS_HEADERS_', 'CAMPAIGN_SKU_LINES_HEADERS_', 'CAMPAIGN_KEY_FIELDS_',
  'CAMPAIGN_LOCK_MS_', 'CAMPAIGN_FINGERPRINT_FIELDS_', 'CAMPAIGN_FINGERPRINT_NUMERIC_',
  'CAMPAIGN_LINE_FINGERPRINT_FIELDS_', 'CAMPAIGN_LINE_FINGERPRINT_NUMERIC_'];
var SRV_NAMES_20_FNS = ['campaignUpper_', 'campaignDateKey_', 'campaignNum_', 'campaignKeyOf_',
  'campaignFingerprint_', 'campaignIndexRows_', 'campaignReceiptFor_', 'campaignFindByKey_',
  'campaignLineFindByKey_', 'campaignLineIndexRows_', 'campaignLineFingerprint_',
  // A3-R6 §2 — the resolve/classify half of the campaign handler is its own function now, called
  // once outside the lock and again under it; the readiness probe gates the unlocked pass.
  'campaignSheetReady_', 'campaignResolveOrTerminal_',
  'handleUpsertCampaign_', 'handleUpsertCampaignSkuLines_'];
var ADAPTER_FNS = ['prodSafetyBundle_', 'prodExpectedDbId_', 'prodSchemaError_', 'prodAssertDbTarget_',
  'prodRequireSheet_', 'prodRequireColumns_'];

function server(mutate) {
  var a = ADAPTER, g14 = GS14, g20 = GS20;
  if (typeof mutate === 'function') { var m = mutate({ a: a, g14: g14, g20: g20 }); a = m.a; g14 = m.g14; g20 = m.g20; }
  var pieces = [];
  ADAPTER_FNS.forEach(function (n) { pieces.push(fnSrc(a, n)); });
  SRV_NAMES_14_VARS.forEach(function (n) { pieces.push(varSrc(g14, n)); });
  SRV_NAMES_14_FNS.forEach(function (n) { pieces.push(fnSrc(g14, n)); });
  SRV_NAMES_20_VARS.forEach(function (n) { pieces.push(varSrc(g20, n)); });
  SRV_NAMES_20_FNS.forEach(function (n) { pieces.push(fnSrc(g20, n)); });
  var uuid = 0;
  var ctx = {
    KMSAFE: require(path.join(REPO, 'assets/js/core/supply-planning-production-safety.js')),
    PRODUCTION_DB_SPREADSHEET_ID_: 'SS-DB',
    Logger: { log: function () {} },
    Utilities: { getUuid: function () { uuid++; return ('abcdef012345678900000000000000' + uuid).slice(-32); },
                 formatDate: function () { return '2026-09-20 12:00:00'; } },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    jsonResponse_: function (o) { return o; },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ctx.__ss; } },
    __ss: null, console: console
  };
  vm.createContext(ctx);
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'a3-server.js' });
  ctx.__use = function (ss) { ctx.__ss = ss; };
  return ctx;
}
var S = server(null);

// =================================================================================================
section('A. IDENTITY — the window decides, the name does not');
// =================================================================================================
// THE KEY IS READ OFF ITS OWNER, NOT RESTATED HERE. CAMPAIGN_PROMOTION_RECORD_CONTRACT.md §1.2 owns
// campaign identity and declares HEADER_IDENTITY_KEY; the writer must implement that key and not a
// near-miss of it. Comparing the two is the only assertion that can catch a near-miss, because a
// literal copied into this file would agree with whatever the writer happened to do.
var CONTRACT = read('docs/planning/CAMPAIGN_PROMOTION_RECORD_CONTRACT.md');
var declaredKey = (/HEADER_IDENTITY_KEY = ([^\n]+)/.exec(CONTRACT) || [])[1] || '';
eq(declaredKey.split('|').map(function (x) { return x.trim(); }), S.CAMPAIGN_KEY_FIELDS_,
  'A1  the writer implements HEADER_IDENTITY_KEY exactly as its owner declares it', declaredKey);
ok(S.CAMPAIGN_KEY_FIELDS_.indexOf('campaign_name') === -1,
  'A2  and campaign_name is NOT in it — the label is not the identity');

var BASE = { company: 'ResUS', country: 'US', marketplace: 'Amazon',
  promotion_type: 'BFCM', event_flag: 'BFCM' };
function key(over) { return S.campaignKeyOf_(Object.assign({}, BASE, over)); }
ok(key({ start_date: '2027-07-15', end_date: '2027-07-16', campaign_name: 'Prime Day 2027' })
   !== key({ start_date: '2027-11-24', end_date: '2027-11-30', campaign_name: 'Prime Day 2027' }),
  'A3  same SKU, same year, same NAME, two windows -> two identities (scenario B/C)');
eq(key({ start_date: '2027-11-24', end_date: '2027-11-30', campaign_name: 'BFCM' }),
   key({ start_date: '2027-11-24', end_date: '2027-11-30', campaign_name: 'Black Friday' }),
  'A4  and renaming an event does NOT create a second identity (scenario D)');

// A window cell may be text or a real Date. If those two never compare equal, every save appends.
eq(S.campaignDateKey_('2027-11-24'), '2027-11-24', 'A5  a text window is its own calendar day');
eq(S.campaignDateKey_(new Date(2027, 10, 24)), '2027-11-24', 'A5a a Date cell reduces to the same day');
eq(S.campaignDateKey_('2027-11-24T00:00:00.000Z'), '2027-11-24', 'A5b and so does an ISO instant');
eq(key({ start_date: new Date(2027, 10, 24), end_date: new Date(2027, 10, 30) }),
   key({ start_date: '2027-11-24', end_date: '2027-11-30' }),
  'A6  so a Date-typed sheet and a text payload resolve to ONE campaign, not two');
ok(key({ start_date: '2027-11-24', end_date: '2027-11-30' }) !== key({ company: 'KM', start_date: '2027-11-24', end_date: '2027-11-30' }),
  'A7  and company still separates KM Amazon from ResUS Amazon');

// THE CASE A WINDOW-ONLY KEY STILL MERGES. Two promotions can share a site and seven days and be
// two campaigns: the contract says so in as many words, and a key carrying only the window would
// fold them into one exactly the way the name-based key folded two windows.
ok(key({ promotion_type: 'Prime Day', event_flag: 'Prime Day', start_date: '2027-07-15', end_date: '2027-07-16' })
   !== key({ promotion_type: 'Lightning Deal', event_flag: 'Lightning Deal', start_date: '2027-07-15', end_date: '2027-07-16' }),
  'A7a two promotion types in the SAME window on the SAME site are two campaigns');
eq(key({ year: 2027 }), key({ year: 2026 }),
  'A7b and `year` is not in the key — two rows sharing a window cannot differ in it except by bad data');

// The content token and the key are disjoint — see the comment at CAMPAIGN_FINGERPRINT_FIELDS_.
S.CAMPAIGN_KEY_FIELDS_.forEach(function (f) {
  ok(S.CAMPAIGN_FINGERPRINT_FIELDS_.indexOf(f) === -1,
    'A8  key field "' + f + '" is not also a content field');
});

// =================================================================================================
section('B. THE EVENT VERSION TOKEN — two implementations, one value');
// =================================================================================================
var CLI = vm.createContext({});
vm.runInContext([
  varSrc(FCS, '_SE_FP_FIELDS_'), varSrc(FCS, '_SE_FP_NUMERIC_'),
  varSrc(FCS, '_CMP_FP_FIELDS_'), varSrc(FCS, '_CMP_FP_NUMERIC_'),
  fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'),
  fnSrc(FCS, '_seFingerprint_'), fnSrc(FCS, '_cmpFingerprint_')
].join('\n'), CLI);

eq(S.FC_SE_FINGERPRINT_FIELDS_, CLI._SE_FP_FIELDS_, 'B1  both sides fingerprint the SAME event fields in order');
eq(S.FC_SE_FINGERPRINT_NUMERIC_, CLI._SE_FP_NUMERIC_, 'B1a and normalise the same ones numerically');
eq(S.CAMPAIGN_FINGERPRINT_FIELDS_, CLI._CMP_FP_FIELDS_, 'B1b likewise for the campaign token');

var EVENT_ROW = {
  event_fc_id: 'EFC-AAA111', campaign_id: 'CMP-BFCM27', campaign_sku_line_id: 'CSL-1',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MP-US-AMA',
  scope_type: 'sku', scope_id: 'CO1100-R', sku: 'CO1100-R', series: 'CO1100', category: 'Opener',
  event_name: 'BFCM', event_period: 'Nov 24 - Nov 30', event_start_date: '2027-11-24',
  event_end_date: '2027-11-30', event_month: 11, year: 2027, fc_qty: 3000, note: '',
  created_by: 'fc-summary', created_at: '2026-09-20T00:00:00.000Z',
  updated_by: 'fc-summary', updated_at: '2026-09-20T00:00:00.000Z'
};
eq(S.fcSeFingerprint_(EVENT_ROW), CLI._seFingerprint_(EVENT_ROW), 'B2  the two implementations agree on a real row');
eq(S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { fc_qty: 3000 })),
   S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { fc_qty: '3000' })),
  'B3  3000 and "3000" are one value (a sheet answers numbers, JSON answers strings)');
ok(S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { fc_qty: 0 }))
   !== S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { fc_qty: '' })),
  'B4  a stored 0 is NOT a blank');
ok(S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { fc_qty: 3100 })) !== S.fcSeFingerprint_(EVENT_ROW),
  'B5  and a changed quantity changes the token');
eq(S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { updated_at: 'CHANGED', updated_by: 'someone' })),
   S.fcSeFingerprint_(EVENT_ROW),
  'B6  the audit columns are NOT in it — a token carrying them would be stale on issue');
eq(S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { event_start_date: new Date(2027, 10, 24) })),
   S.fcSeFingerprint_(EVENT_ROW),
  'B7  and neither are the two Date-typed window columns (they cannot survive the round trip)');
ok(S.FC_SE_FINGERPRINT_FIELDS_.indexOf('event_fc_id') === -1,
  'B8  the PK is excluded: it identifies the row, it does not describe it');

// =================================================================================================
section('C. ID PRESERVATION, ZERO-WRITE, DUPLICATE AND STALE — against the real handlers');
// =================================================================================================
// One campaign, one line, one event — the state an operator returns to.
function seededDb() {
  var db = emptyDb();
  db.campaigns.push(rowOf('campaigns', {
    campaign_id: 'CMP-BFCM27', campaign_name: 'BFCM 2027', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', marketplace_id: 'MP-US-AMA', promotion_type: 'BFCM', major_event_flag: 'BFCM',
    event_flag: 'BFCM', year: 2027, start_date: '2027-11-24', end_date: '2027-11-30', status: 'active',
    source: 'fc_summary_builder', created_by: 'fc-summary', created_at: '2026-09-20 10:00:00',
    updated_by: 'fc-summary', updated_at: '2026-09-20 10:00:00'
  }));
  db.campaign_sku_lines.push(rowOf('campaign_sku_lines', {
    campaign_sku_line_id: 'CSL-1', campaign_id: 'CMP-BFCM27', sku: 'CO1100-R',
    marketplace_sku_id: 'MPSKU-1', promo_price: 29.99, regular_price: 39.99, discount_percent: 25,
    price_units: 'USD', line_status: 'active', source: 'fc_summary_builder'
  }));
  db.fc_special_events.push(rowOf('fc_special_events', EVENT_ROW));
  return db;
}
function srvWorld() { var ss = makeSs(seededDb()); S.__use(ss); return ss; }
function campVersion(ss, id) {
  var hit = S.campaignIndexRows_(S.fcWriteReadSheet_(ss.__sheet('campaigns'))).filter(function (r) { return r.id === id; });
  return hit.length === 1 ? hit[0].fingerprint : null;
}
function eventVersion(ss, id) {
  var r = S.fcSeReceiptFor_(ss.__sheet('fc_special_events'), id);
  return r ? r.row_version : null;
}

// C1-C3 — a second window in the same year is a NEW campaign, not an overwrite. This is the defect.
(function () {
  var ss = srvWorld();
  var res = S.handleUpsertCampaign_({
    campaign_name: 'BFCM 2027', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    marketplace_id: 'MP-US-AMA', year: 2027, start_date: '2027-12-10', end_date: '2027-12-14',
    promotion_type: 'BFCM', event_flag: 'BFCM', status: 'active', actor: 'a3'
  });
  ok(res.success === true && res.data.created === true,
    'C1  a SECOND window with the SAME name creates its own campaign');
  ok(res.data.campaign_id !== 'CMP-BFCM27', 'C2  with its own campaign_id');
  eq(ss.__sheet('campaigns').__setCells.length, 0, 'C3  and the first campaign was not touched at all');
})();

// C4-C5 — the same window under a different label is the SAME campaign.
(function () {
  var ss = srvWorld();
  var res = S.handleUpsertCampaign_({
    campaign_name: 'Black Friday / Cyber Monday', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    promotion_type: 'BFCM', event_flag: 'BFCM',
    year: 2027, start_date: '2027-11-24', end_date: '2027-11-30', actor: 'a3'
  });
  ok(res.success === false && res.error === 'STALE_CAMPAIGN_VERSION',
    'C4  a renamed save with NO version is refused — it would land on a row the operator has not seen');
  eq(ss.__writes(), 0, 'C5  and it is a proven zero-write');
})();

(function () {
  var ss = srvWorld();
  var res = S.handleUpsertCampaign_({
    campaign_name: 'Black Friday / Cyber Monday', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    promotion_type: 'BFCM', event_flag: 'BFCM',
    year: 2027, start_date: '2027-11-24', end_date: '2027-11-30', actor: 'a3',
    expected_row_version: campVersion(ss, 'CMP-BFCM27')
  });
  ok(res.success === true && res.data.created === false && res.data.campaign_id === 'CMP-BFCM27',
    'C6  the same rename WITH the version updates the existing campaign and keeps its id (scenario D)');
  eq(ss.__sheet('campaigns').__appended.length, 0, 'C7  no twin row was appended');
})();

// C8-C11 — the event's three canonical ids survive an update, and an unchanged save writes nothing.
(function () {
  var ss = srvWorld();
  var v = eventVersion(ss, 'EFC-AAA111');
  var r = S.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { fc_qty: 3500, expected_row_version: v }), 'a3');
  eq(r.event_fc_id, 'EFC-AAA111', 'C8  an UPDATE preserves event_fc_id');
  ok(r.created === false && r.unchanged === false, 'C9  and reports itself as an update');
  var row = S.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111');
  eq([row.campaign_id, row.campaign_sku_line_id], ['CMP-BFCM27', 'CSL-1'],
    'C10 campaign_id and campaign_sku_line_id are preserved too (§6)');
  eq(String(row.fc_qty), '3500', 'C11 and the edited value landed');
})();

(function () {
  var ss = srvWorld();
  var v = eventVersion(ss, 'EFC-AAA111');
  var r = S.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { expected_row_version: v }), 'a3');
  ok(r.unchanged === true, 'C12 re-saving the stored values reports UNCHANGED');
  eq(ss.__writes(), 0, 'C13 and writes nothing at all — not even updated_at (§3)');
})();

// C14-C16 — the stale-write case, which is the one that used to lose an edit silently.
(function () {
  var ss = srvWorld();
  var vA = eventVersion(ss, 'EFC-AAA111');       // user A reads V
  var vB = vA;                                    // user B reads the same V
  var a = S.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { fc_qty: 4000, expected_row_version: vA }), 'userA');
  ok(a.created === false && !a.refusal, 'C14 A writes successfully');
  var before = ss.__writes();
  var b = S.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { fc_qty: 9999, expected_row_version: vB }), 'userB');
  ok(b.refusal && b.refusal.error === 'STALE_SPECIAL_EVENT_VERSION',
    'C15 B, writing over the version it read, is REFUSED rather than silently winning');
  eq(ss.__writes(), before, 'C16 and B wrote nothing');
  eq(String(S.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111').fc_qty), '4000',
    'C17 A\'s value is what the sheet holds');
  ok(b.refusal.current_row_version === eventVersion(ss, 'EFC-AAA111'),
    'C18 and the refusal hands B the CURRENT version, so it can reload instead of guessing');
})();

// C19-C20 — a versionless update is the repeated-click / composed-as-new case.
(function () {
  var ss = srvWorld();
  var r = S.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { fc_qty: 5000 }), 'a3');
  ok(r.refusal && r.refusal.error === 'STALE_SPECIAL_EVENT_VERSION',
    'C19 a save composed as NEW cannot become an update (§4 duplicate guard, server-side)');
  eq(ss.__writes(), 0, 'C20 zero write');
})();

// C21 — and the refusal is reported as success:false, not thrown as a 500.
(function () {
  var ss = srvWorld();
  var res = S.handleUpsertFcSpecialEvent_(Object.assign({}, EVENT_ROW, { fc_qty: 5000 }));
  ok(res.success === false && res.error === 'STALE_SPECIAL_EVENT_VERSION' && res.wrote === 0,
    'C21 the single-event handler reports a typed, proven zero-write refusal');
})();

// C22-C23 — the batch path (the inline fc_qty edit) refuses per row and keeps going.
(function () {
  var ss = srvWorld();
  var v = eventVersion(ss, 'EFC-AAA111');
  var res = S.handleImportFcSpecialEventsBatch_({ rows: [
    { event_fc_id: 'EFC-AAA111', campaign_id: 'CMP-BFCM27', event_name: 'BFCM', sku: 'CO1100-R', fc_qty: 7000, expected_row_version: 'stale' },
    { event_fc_id: 'EFC-AAA111', campaign_id: 'CMP-BFCM27', event_name: 'BFCM', sku: 'CO1100-R', fc_qty: 7000, expected_row_version: v }
  ], actor: 'a3' });
  eq(res.data.summary.skipped, 1, 'C22 the stale row is skipped');
  eq(res.data.results[0].reason, 'STALE_SPECIAL_EVENT_VERSION', 'C22a named by its token');
  eq(res.data.summary.updated, 1, 'C23 and the current row still writes');
})();

// C24 — a line whose values already match writes nothing.
(function () {
  var ss = srvWorld();
  var res = S.handleUpsertCampaignSkuLines_({ campaign_id: 'CMP-BFCM27', actor: 'a3', lines: [
    { campaign_sku_line_id: 'CSL-1', sku: 'CO1100-R', marketplace_sku_id: 'MPSKU-1',
      regular_price: 39.99, deal_price: 29.99, discount_percent: 25, price_units: 'USD', line_status: 'active' }
  ] });
  ok(res.success === true && res.data.unchanged === 1, 'C24 an unchanged campaign line reports unchanged');
  eq(ss.__sheet('campaign_sku_lines').__setCells.length, 0, 'C25 and writes no cell (§3)');
})();

// C26 — an id that names nothing is not a licence to create.
(function () {
  var ss = srvWorld();
  var r = S.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { event_fc_id: 'EFC-NOPE', campaign_id: 'CMP-OTHER', campaign_sku_line_id: 'CSL-9' }), 'a3');
  ok(r.refusal && r.refusal.error === 'SPECIAL_EVENT_NOT_FOUND',
    'C26 an event_fc_id that matches no row refuses instead of minting a second lineage');
  eq(ss.__writes(), 0, 'C27 zero write');
})();

// C28 — a legacy campaign with no window is adopted once rather than duplicated.
(function () {
  var db = emptyDb();
  db.campaigns.push(rowOf('campaigns', {
    campaign_id: 'CMP-LEGACY', campaign_name: 'BFCM 2027', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', year: 2027, status: 'active'
  }));
  var ss = makeSs(db); S.__use(ss);
  var id = S.campaignFindByKey_(ss.__sheet('campaigns'), {
    company: 'ResUS', country: 'US', marketplace: 'Amazon', year: 2027,
    campaign_name: 'BFCM 2027', start_date: '2027-11-24', end_date: '2027-11-30'
  });
  eq(id, 'CMP-LEGACY', 'C28 a window-less legacy row is adopted by name exactly once');
})();
(function () {
  var db = emptyDb();
  ['CMP-L1', 'CMP-L2'].forEach(function (cid) {
    db.campaigns.push(rowOf('campaigns', { campaign_id: cid, campaign_name: 'BFCM 2027',
      company: 'ResUS', country: 'US', marketplace: 'Amazon', year: 2027, status: 'active' }));
  });
  var ss = makeSs(db); S.__use(ss);
  eq(S.campaignFindByKey_(ss.__sheet('campaigns'), {
    company: 'ResUS', country: 'US', marketplace: 'Amazon', year: 2027,
    campaign_name: 'BFCM 2027', start_date: '2027-11-24', end_date: '2027-11-30'
  }), '', 'C29 but TWO window-less candidates adopt NEITHER — adoption may never merge two rows');
})();

// =================================================================================================
section('D. THE PAGE — rehydration, and a persisted zero that stays zero');
// =================================================================================================
function makeEl(tag) {
  var el = { tagName: tag || 'DIV', _v: '', innerHTML: '', textContent: '', className: '', hidden: false,
    dataset: {}, style: {}, disabled: false, options: [], children: [], childNodes: [],
    appendChild: function (c) { this.children.push(c); this.options.push(c); this.lastElementChild = c; return c; },
    removeChild: function () {}, remove: function () {},
    setAttribute: function () {}, removeAttribute: function () {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    querySelector: function (sel) { return (this._q && this._q[sel]) || null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; } };
  Object.defineProperty(el, 'value', {
    get: function () { return this._v; },
    set: function (v) { this._v = (v === null || v === undefined) ? '' : String(v); }, enumerable: true
  });
  return el;
}

// The page world: the REAL rehydration functions over a DOM shim carrying the modal's real ids.
function pageWorld(events, campaigns, lines, opts) {
  opts = opts || {};
  var els = {};
  ['event-existing-select', 'event-existing-note', 'event-editing-banner', 'event-start-date',
   'event-end-date', 'event-target-year', 'event-name-input', 'event-country', 'event-marketplace',
   'event-sku-rows', 'event-add-row-btn', 'event-sku-datalist'].forEach(function (id) { els[id] = makeEl(); });
  els['event-target-year'].value = String(opts.year === undefined ? 2027 : opts.year);
  els['event-marketplace'].value = 'ResUS|US|Amazon';
  els['event-country'].value = 'US';
  els['event-name-input'].options = [{ value: 'BFCM' }, { value: 'Normal' }];

  var rowsHost = els['event-sku-rows'];
  rowsHost.children = [];
  rowsHost.appendChild = function (c) { this.children.push(c); this.lastElementChild = c; return c; };
  Object.defineProperty(rowsHost, 'innerHTML', {
    get: function () { return ''; }, set: function () { this.children = []; this.lastElementChild = null; },
    configurable: true
  });

  var dom = {
    getElementById: function (id) { return els[id] || null; },
    createElement: function (t) { return makeEl(t); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  var win = { KM: { DB: {
    getFcSpecialEvents: function () { return events; },
    getCampaigns: function () { return campaigns || []; },
    getCampaignSkuLines: function () { return lines || []; }
  } } };
  var ctx = vm.createContext({ document: dom, window: win, console: console, Array: Array, Object: Object,
    String: String, Number: Number, JSON: JSON, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt });
  vm.runInContext([
    varSrc(FCS, '_SE_FP_FIELDS_'), varSrc(FCS, '_SE_FP_NUMERIC_'),
    varSrc(FCS, '_CMP_FP_FIELDS_'), varSrc(FCS, '_CMP_FP_NUMERIC_'),
    fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'),
    fnSrc(FCS, '_seFingerprint_'), fnSrc(FCS, '_cmpFingerprint_'),
    'var EVT_MAX_ROWS = 8;',
    'var _fcPrereqLoadedPaths_ = { event: true };',
    'var _fcReadModel = null;',
    'function _fcHas_() { return false; }',
    'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
    'function _evtSelectedSite() { return { company: "ResUS", country: "US", marketplace: "Amazon" }; }',
    'function _evtClearPeriodError() {}',
    'function _evtSwitchMode() {}',
    'function _evtUpdateAddRowBtn() {}',
    'function _evtApplyRowPricing() {}',
    'var _evtAddedRows = [];',
    // A3-R6 §7 — a single row labels its Qty control Current Event FC while an event is loaded.
    'function _evtApplyCurrentFcLabel_() {}',
    'function _evtAddSingleRow() {',
    '  var host = document.getElementById("event-sku-rows");',
    // `.value` is a DOMString in every browser: `el.value = 24.99` stores the STRING "24.99". A shim
    // that stored the number would let an assertion pass or fail for a reason the DOM does not have.
    '  function cell() { var c = { _v: "" }; Object.defineProperty(c, "value", {',
    '    get: function () { return this._v; },',
    '    set: function (v) { this._v = (v === null || v === undefined) ? "" : String(v); } }); return c; }',
    '  var row = { dataset: {}, _cells: { ".evt-sku": cell(), ".evt-deal": cell(),',
    '    ".evt-disc": cell(), ".evt-fc": cell(), ".evt-reg": cell() },',
    '    querySelector: function (s) { return this._cells[s] || null; } };',
    '  host.children.push(row); host.lastElementChild = row; _evtAddedRows.push(row);',
    '}',
    fnSrc(FCS, '_evtEditingActive_'), fnSrc(FCS, '_evtBuilderEventRows_'),
    fnSrc(FCS, '_evtCampaignRows_'), fnSrc(FCS, '_evtCampaignLineRows_'),
    fnSrc(FCS, '_evtExistingEvents_'), fnSrc(FCS, '_evtExistingLabel_'),
    fnSrc(FCS, '_evtPopulateExistingSelect'), fnSrc(FCS, '_evtOnExistingChange'),
    // A3-R9 — _evtClearEditing_ and the chrome now disarm the period-change confirmation.
    fnSrc(FCS, '_evtWindowConfirmEl_'), fnSrc(FCS, '_evtWindowConfirmChecked_'),
    // A3-R10 §10.2 — _evtSetEditingChrome_ and _evtClearEditing_ now delegate the period controls
    // to one owner, so that owner and the two helpers it reads travel with them.
    fnSrc(FCS, '_evtFmtDay_'), fnSrc(FCS, '_evtSavedWindowText_'), fnSrc(FCS, '_evtSyncPeriodUi_'),
    fnSrc(FCS, '_evtClearEditing_'), fnSrc(FCS, '_evtSetEditingChrome_'),
    fnSrc(FCS, '_evtHydrateExisting_'),
    'var _evtEditing_ = null;'
  ].join('\n'), ctx, { filename: 'a3-page.js' });
  ctx.__els = els;
  return ctx;
}

function evRec(over) {
  var raw = Object.assign({}, EVENT_ROW, over || {});
  return { eventId: raw.event_fc_id, campaignId: raw.campaign_id, campaignSkuLineId: raw.campaign_sku_line_id,
    company: raw.company, country: raw.country, marketplace: raw.marketplace, sku: raw.sku,
    event: raw.event_name, eventStartDate: raw.event_start_date, eventEndDate: raw.event_end_date,
    year: raw.year, fcQty: raw.fc_qty, raw: raw };
}
var CAMPS = [
  { raw: { campaign_id: 'CMP-BFCM27', campaign_name: 'BFCM 2027', marketplace_id: 'MP-US-AMA',
           promotion_type: 'BFCM', major_event_flag: 'BFCM', event_flag: 'BFCM', duration: '', status: 'active' } },
  { raw: { campaign_id: 'CMP-DEC27', campaign_name: 'BFCM 2027', marketplace_id: 'MP-US-AMA',
           promotion_type: 'BFCM', major_event_flag: 'BFCM', event_flag: 'BFCM', duration: '', status: 'active' } }
];
var LINES = [
  { raw: { campaign_sku_line_id: 'CSL-1', campaign_id: 'CMP-BFCM27', sku: 'CO1100-R',
           promo_price: 29.99, regular_price: 39.99, discount_percent: 25 } },
  { raw: { campaign_sku_line_id: 'CSL-2', campaign_id: 'CMP-DEC27', sku: 'CO1100-R',
           promo_price: 24.99, regular_price: 39.99, discount_percent: 37.5 } }
];

// D1-D3 — two windows, same name, same SKU, same year: two entries, and each loads its own values.
(function () {
  var A = evRec({});
  var B = evRec({ event_fc_id: 'EFC-BBB222', campaign_id: 'CMP-DEC27', campaign_sku_line_id: 'CSL-2',
                  event_start_date: '2027-12-10', event_end_date: '2027-12-14', fc_qty: 1200 });
  var W = pageWorld([A, B], CAMPS, LINES);
  var groups = W._evtExistingEvents_();
  eq(groups.length, 2, 'D1  the same SKU in the same year with two windows lists TWO events (scenario B)');
  ok(groups[0].campaignId === 'CMP-BFCM27' && groups[1].campaignId === 'CMP-DEC27',
    'D1a ordered by window, and keyed by campaign rather than by name');
  ok(/2027-11-24/.test(W._evtExistingLabel_(groups[0])) && /2027-12-10/.test(W._evtExistingLabel_(groups[1])),
    'D2  and the label carries the window, because the window is the only difference (scenario C)');

  W._evtHydrateExisting_('CMP-DEC27');
  var ed = W._evtEditing_;
  ok(!!ed && ed.campaignId === 'CMP-DEC27', 'D3  selecting the second event loads the SECOND event');
  eq(W.__els['event-start-date'].value, '2027-12-10', 'D3a with its own window');
  var rows = W.__els['event-sku-rows'].children;
  eq(rows.length, 1, 'D4  one row per saved SKU');
  eq(rows[0].querySelector('.evt-fc').value, '1200', 'D5  showing the PERSISTED fc_qty (§2A)');
  eq(rows[0].querySelector('.evt-deal').value, '24.99', 'D6  and the saved deal price from its own campaign line');
  eq([rows[0].dataset.eventFcId, rows[0].dataset.campaignSkuLineId], ['EFC-BBB222', 'CSL-2'],
    'D7  the row carries the canonical ids it was loaded with (§6)');
  eq(rows[0].dataset.rowVersion, CLI._seFingerprint_(B.raw), 'D8  and the version its save must quote (§5)');
})();

// D9 — a persisted zero is a value, not a missing one. `|| ''` here would read as a new event.
(function () {
  var Z = evRec({ fc_qty: 0 });
  var W = pageWorld([Z], CAMPS, LINES);
  W._evtHydrateExisting_('CMP-BFCM27');
  eq(W.__els['event-sku-rows'].children[0].querySelector('.evt-fc').value, '0',
    'D9  a persisted fc_qty of 0 renders as an explicit zero (§2E)');
})();

// D10 — the picker distinguishes "none" from "cannot tell", because only one of them licenses a create.
(function () {
  var W = pageWorld([], CAMPS, LINES);
  eq(W._evtExistingEvents_().length, 0, 'D10 a scope with no events lists none');
  W._evtPopulateExistingSelect();
  ok(!W.__els['event-existing-select'].disabled, 'D10a and the picker is usable');
})();
(function () {
  var W = pageWorld([], CAMPS, LINES);
  vm.runInContext('_fcPrereqLoadedPaths_ = {}; window.KM.DB.getFcSpecialEvents = function () { return null; };', W);
  eq(W._evtExistingEvents_(), null, 'D11 unavailable event rows are null, NEVER an empty list (§2F)');
  W._evtPopulateExistingSelect();
  ok(W.__els['event-existing-select'].disabled === true,
    'D11a and the picker refuses rather than offering "+ New event" over data it cannot see');
})();

// D12 — an event in a different scope or year is not offered.
(function () {
  var other = evRec({ event_fc_id: 'EFC-CCC', campaign_id: 'CMP-OTHER', year: 2028 });
  var W = pageWorld([evRec({}), other], CAMPS, LINES);
  eq(W._evtExistingEvents_().length, 1, 'D12 the year filter is applied (scoping unchanged)');
})();
(function () {
  var foreign = evRec({ event_fc_id: 'EFC-KM', campaign_id: 'CMP-KM', company: 'KM' });
  var W = pageWorld([evRec({}), foreign], CAMPS, LINES);
  eq(W._evtExistingEvents_().length, 1, 'D13 and so is company — KM Amazon is not ResUS Amazon');
})();

// D14 — clearing the selection returns to a genuinely NEW event, carrying nothing over.
(function () {
  var W = pageWorld([evRec({})], CAMPS, LINES);
  W._evtHydrateExisting_('CMP-BFCM27');
  ok(W._evtEditingActive_(), 'D14 an event is loaded');
  W._evtClearEditing_();
  ok(!W._evtEditingActive_() && W.__els['event-start-date'].value === '',
    'D15 and "+ New event" clears the ids AND the window it belonged to');
})();

// D16 — while an event is loaded, its IDENTITY fields are not editable. A3-R9 moved the period out of
// that set and into the event's attributes: one event flag in one target year is one event for a
// scoped SKU, whatever its dates, so the period is edited HERE (behind an explicit confirmation) and
// is no longer a second event's name. Scope, flag and year are still locked, and that is the whole of
// what D16 was ever protecting — changing one of those does not edit this event, it addresses another.
(function () {
  var W = pageWorld([evRec({})], CAMPS, LINES);
  W._evtHydrateExisting_('CMP-BFCM27');
  eq([W.__els['event-country'].disabled, W.__els['event-name-input'].disabled,
      W.__els['event-target-year'].disabled],
    [true, true, true], 'D16 scope, event flag and target year are read-only while editing');
  eq(W.__els['event-start-date'].disabled, false,
    'D16a while the PERIOD is editable — it is this event\'s attribute, not another event\'s name');
  ok(W.__els['event-editing-banner'].hidden === false,
    'D17 and the modal says it is editing a saved event rather than creating one');
})();

// =================================================================================================
section('E. THE WRITE PAYLOAD — what the page actually sends');
// =================================================================================================
var PAY = vm.createContext({});
vm.runInContext(fnSrc(FCS, 'fcBuildEventWriteRows'), PAY);
(function () {
  var rows = PAY.fcBuildEventWriteRows([{ qty: 42, identity: { eventId: 'EFC-AAA111', campaignId: 'CMP-BFCM27',
    campaignSkuLineId: 'CSL-1', rowVersion: 'V1', eventName: 'BFCM', sku: 'CO1100-R' } }]);
  eq(rows.length, 1, 'E1  one changed row, one payload row');
  eq(rows[0].expected_row_version, 'V1', 'E2  carrying the version the operator saw (§5)');
  eq([rows[0].event_fc_id, rows[0].campaign_id, rows[0].campaign_sku_line_id],
     ['EFC-AAA111', 'CMP-BFCM27', 'CSL-1'], 'E3  and the full canonical identity (§6)');
})();
(function () {
  var rows = PAY.fcBuildEventWriteRows([{ qty: 42, identity: { eventId: 'EFC-X', campaignId: 'CMP-X' } }]);
  eq(rows[0].expected_row_version, '',
    'E4  a row whose version could not be computed sends an EMPTY one — and the server refuses it');
})();
ok(/campaignPayload\.expected_row_version = _evtEditing_\.campaignVersion;/.test(FCS),
  'E5  the builder quotes the campaign version it loaded');
ok(/if \(l\.eventFcId\) evPayload\.event_fc_id = l\.eventFcId;/.test(FCS),
  'E6  and preserves event_fc_id on an edit rather than letting the key re-resolve it');

// =================================================================================================
section('F. BUILDER PREREQUISITES — per path, one flight, no duplicate');
// =================================================================================================
function prereqWorld() {
  var calls = [];
  var resolvers = [];
  var ctx = vm.createContext({ console: console, Promise: Promise, Date: Date, Object: Object, Array: Array,
    String: String, document: { getElementById: function () { return null; } },
    window: { KM: { DB: { refreshCacheTables: function (names) {
      calls.push(names.slice());
      return new Promise(function (res, rej) { resolvers.push({ res: res, rej: rej }); });
    } } } } });
  vm.runInContext([
    varSrc(FCS, '_FC_PREREQ_TABLES_'), varSrc(FCS, '_FC_SECONDARY_TABLES'),
    'var _fcSecondaryLoaded = false;',
    varSrc(FCS, '_fcPrereqLoadedPaths_'),
    // A3-R5 §5 — freshness is recorded per TABLE as well as per path; the loader reads the finer
    // record to decide what to ask for, so both it and its reader join the world.
    varSrc(FCS, '_fcPrereqLoadedTables_'), fnSrc(FCS, '_fcPrereqMissing_'),
    fnSrc(FCS, '_fcResetSecondaryCache'),
    'var FC_PREREQ_ = { IDLE: "IDLE", LOADING: "LOADING_PREREQUISITES", READY: "READY", REFUSED: "PREREQUISITE_REFUSED", UNMOUNTED: "UNMOUNTED" };',
    'var _fcPrereqState_ = FC_PREREQ_.IDLE; var _fcPrereqFlight_ = null; var _fcPrereqLoads_ = 0;',
    'var _fcMeta_ = {};',
    'function _fcEffectiveWorkspace() { return true; }',
    fnSrc(FCS, '_fcPrereqPath_'), fnSrc(FCS, '_fcPrereqNeeded_'),
    varSrc(FCS, '_fcPrereqFlightByPath_'), fnSrc(FCS, '_fcLoadPrerequisites_'),
    fnSrc(FCS, '_fcOnModeSelected_')
  ].join('\n'), ctx, { filename: 'a3-prereq.js' });
  ctx.__calls = calls; ctx.__resolvers = resolvers;
  return ctx;
}

(function () {
  var W = prereqWorld();
  eq(W._FC_PREREQ_TABLES_.regular.indexOf('campaigns'), -1,
    'F1  the Regular path does not read campaigns');
  eq(W._FC_PREREQ_TABLES_.regular.indexOf('pricing_list'), -1, 'F1a nor pricing_list');
  ok(W._FC_PREREQ_TABLES_.event.indexOf('campaign_sku_lines') !== -1,
    'F2  the Special Event path DOES read campaign_sku_lines — rehydration needs the saved deal price');
  eq(W._FC_PREREQ_TABLES_.event.indexOf('fc_regular_forecast'), -1,
    'F3  and does not read the regular forecast (§7: only the SELECTED path)');
})();

(function () {
  var W = prereqWorld();
  W._fcOnModeSelected_('regular');
  eq(W.__calls.length, 1, 'F4  choosing a card starts exactly one load');
  eq(W.__calls[0], W._FC_PREREQ_TABLES_.regular, 'F5  of that path\'s tables, and only that path\'s');
})();

(function () {
  var W = prereqWorld();
  W._fcOnModeSelected_('event');
  var first = W._fcLoadPrerequisites_('event');
  var second = W._fcLoadPrerequisites_('event');
  eq(W.__calls.length, 1, 'F6  the first Next issues NO second request (§7: one single-flight)');
  ok(first === second, 'F6a because both attach to the same promise');
})();

(function () {
  var W = prereqWorld();
  W._fcOnModeSelected_('regular');
  W._fcOnModeSelected_('event');
  eq(W.__calls.length, 2, 'F7  switching path fetches the newly required path');
  eq(W.__calls[1], W._FC_PREREQ_TABLES_.event, 'F7a and only it — never both paths at once');
})();

(function () {
  var W = prereqWorld();
  W._fcOnModeSelected_('regular');
  W.__resolvers[0].res({});
  return Promise.resolve().then(function () {
    eq(W._fcPrereqNeeded_('regular'), false, 'F8  a loaded path is no longer needed (memory is used)');
    W._fcOnModeSelected_('regular');
    eq(W.__calls.length, 1, 'F9  so reopening it issues nothing');
    eq(W._fcPrereqNeeded_('event'), true, 'F10 while the OTHER path is still unloaded');
    W._fcResetSecondaryCache();
    eq(W._fcPrereqNeeded_('regular'), true, 'F11 and a write invalidates both, as it always did');
  });
})();

var asyncChecks = [];
asyncChecks.push((function () {
  var W = prereqWorld();
  W._fcOnModeSelected_('event');
  W.__resolvers[0].rej(new Error('transport'));
  return new Promise(function (r) { setTimeout(r, 0); }).then(function () {
    ok(W._fcPrereqNeeded_('event'), 'F12 a FAILED prefetch leaves the path unloaded');
    W._fcOnModeSelected_('event');
    eq(W.__calls.length, 2, 'F13 and retryable — the latch was released, so Retry issues a NEW request');
  });
})());

// =================================================================================================
section('G. NON-REGRESSION');
// =================================================================================================
ok(/id="event-existing-select"/.test(HTML), 'G1  the picker exists in the modal markup');
ok(/_evtOnExistingChange\(\)/.test(HTML), 'G2  wired to the real handler');
ok(/_fcOnModeSelected_\('regular'\)/.test(HTML) && /_fcOnModeSelected_\('event'\)/.test(HTML),
  'G3  and both cards start their own path\'s prefetch');
ok(/onclick="_fcOnModeSelected_\('regular'\)"/.test(HTML),
  'G3a on CLICK, so choosing the already-checked default counts as a choice');

// The staged read is untouched: the builder's prerequisites are not the page's initial render.
ok(/bootstrap: \{/.test(read('assets/specs/active/apps-script/58_api_v1_fc_summary_workspace.gs')),
  'G4  the workspace slices are unchanged');
ok(!/campaign_sku_lines/.test(varSrc(read('assets/specs/active/apps-script/58_api_v1_fc_summary_workspace.gs'), 'FCS_WORKSPACE_TABLES_')),
  'G5  and the PRIMARY render still reads four tables — the builder\'s new table is not on it (§7)');
ok(/FC_TR_FINGERPRINT_FIELDS_/.test(GS14) && /handleUpsertFcTargetRule_/.test(GS14),
  'G6  the Target Rule contract is still present and separate');
ok(/'STALE_CAMPAIGN_VERSION'/.test(API) && /'STALE_SPECIAL_EVENT_VERSION'/.test(API),
  'G7  the shared zero-write authority knows the new typed refusals');
// ONE AUTHORITY, AND IT TRAVELS WITH ITS FUNCTION. The token list sits inside _kmZeroWriteProven_
// because five suites lift that function BY NAME into a vm context and a sibling `var` does not go
// with it — a lookup that throws would classify every proven zero-write as an UNKNOWN outcome. So:
// the tokens are in the function, and nowhere else in the tree.
(function () {
  var fn = fnSrc(API, '_kmZeroWriteProven_');
  ok(/STALE_CAMPAIGN_VERSION/.test(fn) && /STALE_SPECIAL_EVENT_VERSION/.test(fn),
    'G7a the tokens live INSIDE the rule, so lifting the rule gets all of it');
  // FC-SUMMARY-R2B-A3-R4 — TWO LISTS, TWO QUESTIONS, AND NOW A CHECKED AGREEMENT.
  // A3-R4 registered these same tokens in KM_CANONICAL_CODES, which answers a DIFFERENT question:
  // _kmZeroWriteProven_ says "did this refusal write?", KM_CANONICAL_CODES says "what is its code?".
  // Without the second list a typed write refusal was reported under the generic READ_FAILED. The
  // harness constraint above forbids merging them — the rule must travel with its function — so the
  // duplication is forced, and the honest response is to CHECK it rather than to forbid or ignore it.
  var codes = (/var KM_CANONICAL_CODES = \[[\s\S]*?\];/.exec(API) || [])[0];
  ok(!!codes, 'G7b the canonical code registry is present');
  ok(!/STALE_CAMPAIGN_VERSION/.test(API.replace(fn, '').replace(codes, '')),
    'G7b1 and the tokens appear in those two authorities and NOWHERE else in the api file');
  ['STALE_CAMPAIGN_VERSION', 'CAMPAIGN_NOT_FOUND', 'CAMPAIGN_IDENTITY_MISMATCH',
   'DUPLICATE_CAMPAIGN_IDENTITY', 'CAMPAIGN_LOCK_TIMEOUT', 'STALE_SPECIAL_EVENT_VERSION',
   'SPECIAL_EVENT_NOT_FOUND'].forEach(function (t, i) {
    ok(fn.indexOf(t) > -1 && codes.indexOf(t) > -1,
      'G7b2.' + i + ' ' + t + ' is in BOTH authorities — a token in one and not the other is the drift');
  });
  ok(!/'STALE_CAMPAIGN_VERSION'\s*[,\]]/.test(FCS),
    'G7c and the page does not keep a copy of the list it consults');
})();
ok(/CAMPAIGN_BUILD_VERSION_/.test(GS63) && /20_campaign_write_handlers\.gs/.test(GS63),
  'G8  20_ has a REQUIRED manifest row — a partial sync of it is otherwise invisible');
var RELEASE = /var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/.exec(GS63)[1];
// FC-SUMMARY-R2B-A3-R4 — DERIVED, not pinned. This asserted the release EQUALS R15 and that both write
// handlers carry it, which forbade any later release from existing and contradicted the project's own
// module-stamp rule: a stamp records the round its file last CHANGED and is never marched to the
// release. R16 changes 20_ and not 14_. What G9 is FOR is that A3-R1's two write handlers each got a
// stamp at least as new as the release that shipped them, so that is what is asserted.
function relNum(s) { var m = /-R(\d+)$/.exec(String(s || '')); return m ? parseInt(m[1], 10) : -1; }
ok(relNum(RELEASE) >= 15, 'G9  the release is at or after R15, the release A3-R1 cut', RELEASE);
ok(relNum(/var CAMPAIGN_BUILD_VERSION_ = '([^']+)'/.exec(GS20)[1]) >= 15,
  'G9a and 20_ carries a stamp at or after it — the campaign writer shipped in R15 and has changed since');
ok(relNum(/var FCW_BUILD_VERSION_ = '([^']+)'/.exec(GS14)[1]) >= 15,
  'G9b and so does 14_, whose stamp stays at the round it last changed');
var RO = require(path.join(REPO, 'assets/tests/_release-order.js'));
// FC-SUMMARY-R2B-A3-R3 — DERIVED, not pinned. This asserted `currentAppToken() === <this round's
// literal>`, which is the equality-with-now _release-order.js exists to end: it forbade any LATER round
// from rotating the token, and A3-R3 legitimately did. What G10 is FOR is that A3-R1 rotated the token
// rather than shipping its bytes under a published one — and that is answerable from the append-only
// series, which keeps the answer true no matter how many rounds follow.
ok(RO.ROUND_TOKENS.indexOf('speventidentity-r2ba3r1-20260920') > -1,
  'G10 A3-R1 rotated the application cache token, and its token remains in the append-only history');
// Append-only means no entry is ever reused: a repeated token is a published token being served again,
// which is the one thing this series exists to prevent.
eq(RO.ROUND_TOKENS.length, new Set(RO.ROUND_TOKENS).size,
  'G10a and no token appears twice in the series — a reused token re-serves published bytes');
eq(RO.staleAppTokenRefs ? RO.staleAppTokenRefs(read('index.html')) : [], [],
  'G11 and no reference to a previous application token survives in index.html');

// =================================================================================================
section('H. MUTANTS — each fault put back, each caught by an observable outcome');
// =================================================================================================
// Lifted from the source rather than retyped: a mutant whose search string has drifted silently
// mutates NOTHING and reports the unmutated tree as a survivor, which is the one failure a mutation
// suite cannot afford. This throws instead.
var KEY_DECL = (/var CAMPAIGN_KEY_FIELDS_ = \[[\s\S]*?\];/.exec(GS20) || [])[0];
if (!KEY_DECL) { throw new Error('CAMPAIGN_KEY_FIELDS_ declaration not found — the key mutants would be vacuous'); }
var mutants = [], survived = [];
function mutant(label, mutate, detect) {
  var caught = false, note = '';
  try { caught = detect(mutate) === true; }
  catch (e) { caught = true; note = ' (threw: ' + (e && e.message) + ')'; }
  mutants.push(label);
  if (caught) console.log('  caught: ' + label + note);
  else { survived.push(label); console.error('SURVIVED: ' + label); }
}
function mutServer(mutate) { return server(mutate); }

mutant('M1  campaign_name becomes identity again', function () {}, function () {
  var M = mutServer(function (s) {
    return { a: s.a, g14: s.g14,
      g20: s.g20.replace(KEY_DECL, "var CAMPAIGN_KEY_FIELDS_ = ['company', 'country', 'marketplace', 'campaign_name'];") };
  });
  var a = M.campaignKeyOf_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM', campaign_name: 'BFCM 2027', start_date: '2027-11-24', end_date: '2027-11-30' });
  var b = M.campaignKeyOf_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM', campaign_name: 'BFCM 2027', start_date: '2027-12-10', end_date: '2027-12-14' });
  return a === b;   // the two windows collapse to one identity — exactly the defect
});

mutant('M2  the event window is dropped from identity', function () {}, function () {
  var M = mutServer(function (s) {
    return { a: s.a, g14: s.g14,
      g20: s.g20.replace(KEY_DECL, "var CAMPAIGN_KEY_FIELDS_ = ['company', 'country', 'marketplace', 'promotion_type', 'event_flag'];") };
  });
  return M.campaignKeyOf_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM', start_date: '2027-11-24', end_date: '2027-11-30' })
      === M.campaignKeyOf_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM', start_date: '2027-12-10', end_date: '2027-12-14' });
});

mutant('M3  an update loses campaign_sku_line_id', function () {}, function () {
  var M = mutServer(function (s) {
    return { a: s.a, g20: s.g20,
      g14: s.g14.replace("    if (body.hasOwnProperty(h)) setCell(targetRow, h, body[h]);",
        "    if (h === 'campaign_sku_line_id') { setCell(targetRow, h, ''); return; }\n    if (body.hasOwnProperty(h)) setCell(targetRow, h, body[h]);") };
  });
  var ss = makeSs(seededDb()); M.__use(ss);
  var v = M.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111').row_version;
  M.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { fc_qty: 3500, expected_row_version: v }), 'm3');
  return M.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111').campaign_sku_line_id !== 'CSL-1';
});

mutant('M4  an unchanged event is written anyway', function () {}, function () {
  var M = mutServer(function (s) {
    return { a: s.a, g20: s.g20,
      g14: s.g14.replace("  if (prior.id && fcSeFingerprint_(incoming) === prior.fingerprint) {",
        "  if (false) {") };
  });
  var ss = makeSs(seededDb()); M.__use(ss);
  var v = M.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111').row_version;
  M.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { expected_row_version: v }), 'm4');
  return ss.__writes() > 0;
});

mutant('M5  the duplicate guard is removed (a versionless save becomes an update)', function () {}, function () {
  // The fault is put back the way it would actually appear: a missing version treated as a matching
  // one. Merely disabling the first branch is an EQUIVALENT mutant — the mismatch check below catches
  // an empty string anyway — and an equivalent mutant proves nothing about the guard.
  var M = mutServer(function (s) {
    return { a: s.a, g20: s.g20,
      g14: s.g14.replace("  var expectedVersion = String(body.expected_row_version == null ? '' : body.expected_row_version).trim();",
        "  var expectedVersion = prior.fingerprint;") };
  });
  var ss = makeSs(seededDb()); M.__use(ss);
  var r = M.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { fc_qty: 5000 }), 'm5');
  return !(r && r.refusal);
});

mutant('M6  the stale-version check is removed', function () {}, function () {
  var M = mutServer(function (s) {
    return { a: s.a, g20: s.g20,
      g14: s.g14.replace("  if (expectedVersion !== prior.fingerprint) {", "  if (false) {") };
  });
  var ss = makeSs(seededDb()); M.__use(ss);
  var r = M.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { fc_qty: 9999, expected_row_version: 'not-the-version' }), 'm6');
  return !(r && r.refusal) && String(M.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111').fc_qty) === '9999';
});

mutant('M7  the campaign version gate is removed', function () {}, function () {
  // A3-R6 §2 — the version gate moved into campaignResolveOrTerminal_ and lost two spaces of
  // indentation with it. The anchor is re-pointed AND guarded: a replace() that silently matches
  // nothing injects no fault, and a mutant that injects no fault cannot fail. That is exactly how
  // this one survived the restructure without anything else going red.
  var M = mutServer(function (s) {
    var FROM = "    var expectedVersion = String(body.expected_row_version == null ? '' : body.expected_row_version).trim();";
    if (s.g20.indexOf(FROM) === -1) throw new Error('M7 anchor drifted');
    return { a: s.a, g14: s.g14,
      g20: s.g20.split(FROM).join('    var expectedVersion = matched.fingerprint;') };
  });
  var ss = makeSs(seededDb()); M.__use(ss);
  var res = M.handleUpsertCampaign_({ campaign_name: 'RENAMED', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM', year: 2027,
    start_date: '2027-11-24', end_date: '2027-11-30', actor: 'm7' });
  return res.success === true && res.data.created === false;   // a versionless save landed on a real row
});

mutant('M8  the window columns are put INTO the event token', function () {}, function () {
  var M = mutServer(function (s) {
    return { a: s.a, g20: s.g20,
      g14: s.g14.replace("var FC_SE_FINGERPRINT_FIELDS_ = ['campaign_id', 'campaign_sku_line_id', 'company', 'country',",
        "var FC_SE_FINGERPRINT_FIELDS_ = ['event_start_date', 'event_end_date', 'campaign_id', 'campaign_sku_line_id', 'company', 'country',") };
  });
  // The client sends the ISO instant the workspace gave it; the sheet holds a Date. The two must not
  // disagree, and with the dates in the token they do.
  var sheetShape = Object.assign({}, EVENT_ROW, { event_start_date: new Date(2027, 10, 24) });
  var jsonShape = Object.assign({}, EVENT_ROW, { event_start_date: '2027-11-23T16:00:00.000Z' });
  return M.fcSeFingerprint_(sheetShape) !== M.fcSeFingerprint_(jsonShape);
});

mutant('M9  the Builder loads its prerequisites at page mount', function () {}, function () {
  // The page must contain no call that loads prerequisites outside a mode selection or Next.
  var mutated = FCS.replace("function _fcOnModeSelected_(mode) {",
    "function _fcMountPrefetch_() { _fcLoadPrerequisites_('event'); }\nfunction _fcOnModeSelected_(mode) {");
  return /_fcMountPrefetch_/.test(mutated) && !/_fcMountPrefetch_/.test(FCS);
});

mutant('M10 selecting one path fetches BOTH', function () {}, function () {
  var W = prereqWorld();
  vm.runInContext("_FC_PREREQ_TABLES_.regular = _FC_PREREQ_TABLES_.regular.concat(_FC_PREREQ_TABLES_.event);", W);
  W._fcOnModeSelected_('regular');
  return W.__calls[0].indexOf('campaigns') !== -1;   // the Regular path pulled the event path's tables
});

mutant('M11 Next issues a second request instead of reusing the flight', function () {}, function () {
  var W = prereqWorld();
  vm.runInContext("_fcLoadPrerequisites_ = function (mode) { var p = _fcPrereqPath_(mode); "
    + "return Promise.resolve(window.KM.DB.refreshCacheTables(_FC_PREREQ_TABLES_[p])); };", W);
  W._fcOnModeSelected_('regular');
  W._fcLoadPrerequisites_('regular');
  return W.__calls.length === 2;
});

mutant('M12 a stale prefetch answer is accepted for the current scope', function () {}, function () {
  var W = prereqWorld();
  vm.runInContext("_fcLoadPrerequisites_ = function () { if (_fcPrereqFlight_) return _fcPrereqFlight_; "
    + "_fcPrereqFlight_ = Promise.resolve(window.KM.DB.refreshCacheTables(_FC_PREREQ_TABLES_.regular)); return _fcPrereqFlight_; };", W);
  W._fcOnModeSelected_('regular');
  W._fcOnModeSelected_('event');
  // With ONE global latch the event selection attaches to the regular flight and never fetches its tables.
  return W.__calls.length === 1;
});

// =================================================================================================
Promise.all(asyncChecks).then(function () {
  section('I. VACUITY — every mutant predicate must be FALSE on the unmutated tree');
  var vacuous = [];
  [['M1/M2 key', function () {
      return S.campaignKeyOf_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM', campaign_name: 'BFCM 2027', start_date: '2027-11-24', end_date: '2027-11-30' })
        !== S.campaignKeyOf_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM', campaign_name: 'BFCM 2027', start_date: '2027-12-10', end_date: '2027-12-14' });
    }],
   ['M3 line id survives', function () {
      var ss = makeSs(seededDb()); S.__use(ss);
      var v = S.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111').row_version;
      S.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { fc_qty: 3500, expected_row_version: v }), 'v');
      return S.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111').campaign_sku_line_id === 'CSL-1';
    }],
   ['M4 unchanged writes nothing', function () {
      var ss = makeSs(seededDb()); S.__use(ss);
      var v = S.fcSeReceiptFor_(ss.__sheet('fc_special_events'), 'EFC-AAA111').row_version;
      S.fcSpecialEventUpsert_(ss, Object.assign({}, EVENT_ROW, { expected_row_version: v }), 'v');
      return ss.__writes() === 0;
    }],
   ['M8 dates are out of the token', function () {
      return S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { event_start_date: new Date(2027, 10, 24) }))
        === S.fcSeFingerprint_(Object.assign({}, EVENT_ROW, { event_start_date: '2027-11-23T16:00:00.000Z' }));
    }],
   ['M10/M11/M12 per-path single flight', function () {
      var W = prereqWorld();
      W._fcOnModeSelected_('regular');
      W._fcLoadPrerequisites_('regular');
      W._fcOnModeSelected_('event');
      return W.__calls.length === 2 && W.__calls[0].indexOf('campaigns') === -1;
    }]
  ].forEach(function (p) {
    var held; try { held = !!p[1](); } catch (e) { held = false; }
    if (!held) vacuous.push(p[0]);
  });
  eq(vacuous, [], 'I1  every mutant predicate is checked against a tree where the fault is absent');

  console.log('\n' + new Array(101).join('='));
  console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail
    + ' failed, ' + mutants.length + ' mutants, ' + survived.length + ' survived');
  console.log(new Array(101).join('='));
  process.exit((fail === 0 && survived.length === 0) ? 0 : 1);
});
