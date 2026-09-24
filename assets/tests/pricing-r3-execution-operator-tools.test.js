// Kitchen Mama Operation System — PRICING-R3-EXECUTION-R1 · THE OPERATOR TOOLS
// =============================================================================================================
// These two files are pasted into the live Apps Script project and run against the real pricing_list. One of
// them INSERTS COLUMNS into a production table. So they are executed here against a fake sheet that counts
// every physical write, rather than read and believed.
//
//   A  the migration refuses what it cannot safely decide
//   B  the migration's plan: INSERT at the canonical index, never append
//   C  what COMMIT actually writes — header cells only, and blank is blank
//   D  the validator: counts, identities and price values survive the column insert
//   E  the census: read-only, and the numbers it reports
//   F  mutants
//
// Run: node assets/tests/pricing-r3-execution-operator-tools.test.js
// NOTE: no 'use strict' — the .gs sources are eval'd.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var TOOLS = 'assets/tools/apps-script-diagnostics/';
var MIG = readN(TOOLS + 'TEMP_PRICING_R2_MIGRATION.gs');
var CEN = readN(TOOLS + 'TEMP_PRICING_R3_PRODUCTION_CENSUS.gs');
var DEC = readN(TOOLS + 'TEMP_PRICING_R3_FX_DECOMPOSE.gs');
var SEL = readN(TOOLS + 'TEMP_PRICING_R4_SMOKE_SELECT.gs');
var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(c, l, d) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }

// -------------------------------------------------------------------------------------------------------------
// A fake sheet that supports insertColumnBefore, because that is the operation under test.
// -------------------------------------------------------------------------------------------------------------
function fakeSheet(name, grid) {
  var g = grid.map(function (r) { return r.slice(); });
  var S = {
    __grid: g, __headerWrites: 0, __dataWrites: 0, __inserts: [],
    getName: function () { return name; },
    getLastRow: function () { return g.length; },
    getLastColumn: function () { return g.length ? g[0].length : 0; },
    getDataRange: function () { return { getValues: function () { return g.map(function (r) { return r.slice(); }); } }; },
    insertColumnBefore: function (i) {
      S.__inserts.push(i);
      g.forEach(function (row) { row.splice(i - 1, 0, ''); });
    },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push((g[r - 1 + i] || [])[c - 1 + j]); out.push(row); }
          return out;
        },
        setValue: function (v) {
          while (g.length < r) g.push([]);
          g[r - 1][c - 1] = v;
          if (r === 1) S.__headerWrites++; else S.__dataWrites++;
        }
      };
    }
  };
  return S;
}

var CANON = ['pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'site_sku',
  'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp',
  'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
  'regular_price', 'minimum_price', 'msrp',
  'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual',
  'price_source', 'price_status', 'created_by', 'created_at', 'updated_by', 'updated_at', 'note'];
var FLAGS = ['regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual'];
var LOGCANON = ['log_id', 'pricing_id', 'field_name', 'old_value', 'new_value',
  'change_type', 'changed_by', 'changed_at', 'change_reason'];
var PRE_HEADER = CANON.filter(function (h) { return FLAGS.indexOf(h) === -1; });
var PRE_LOG = LOGCANON.filter(function (h) { return h !== 'change_type'; });

/** A pre-migration pricing row, from a { column: value } object. */
function preRow(o) { return PRE_HEADER.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; }); }

function makeWorld(src, opts) {
  opts = opts || {};
  var priceHeader = opts.priceHeader || PRE_HEADER;
  var logHeader = opts.logHeader || PRE_LOG;
  var priceSheet = fakeSheet('pricing_list', [priceHeader].concat(opts.rows || []));
  var logSheet = fakeSheet('pricing_change_log', [logHeader].concat(opts.logRows || []));
  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number,
    Math: Math, JSON: JSON, isFinite: isFinite, Date: Date,
    Logger: { log: function (s) { S.__logged = s; } },
    SpreadsheetApp: {
      getActiveSpreadsheet: function () {
        return { getName: function () { return 'KM-OPS'; }, getId: function () { return 'SHEET-ID'; },
          getSheetByName: function (n) {
            if (opts.missingSheet === n) return null;
            return n === 'pricing_list' ? priceSheet : (n === 'pricing_change_log' ? logSheet : null);
          } };
      },
      flush: function () {}
    },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      // A real fx_rate_date cell comes back from getValues as a Date, not a string, so the census has to
      // normalise it before it can be compared or sorted. This models that.
      formatDate: function (d) { return d.toISOString().slice(0, 10); },
      computeDigest: function (alg, s) {
        var h = crypto.createHash('sha256').update(String(s), 'utf8').digest();
        return Array.prototype.slice.call(h).map(function (b) { return b > 127 ? b - 256 : b; });
      }
    },
    __price: priceSheet, __log: logSheet
  };
  // The tools read their authority out of the deployed 73_, so the sandbox carries it the same way the
  // Apps Script project would — by having the file loaded alongside them.
  if (!opts.noAuthority) {
    S.PRICING_LIST_HEADERS_ = CANON.slice();
    S.PRICING_MANUAL_FLAG_COLUMNS_ = FLAGS.slice();
    S.PRICING_CHANGE_LOG_HEADERS_ = LOGCANON.slice();
    S.PRICING_FX_DECIMALS_ = { USD: 2, CAD: 2, EUR: 2, GBP: 2, AUD: 2, JPY: 0, KRW: 0, TWD: 0 };
    S.PRW_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R23';
  }
  vm.createContext(S);
  vm.runInContext(src, S, { filename: 'tool.gs' });
  return S;
}

var ROWS = [
  preRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', sku: 'SKU-A', currency: 'CAD', base_currency: 'USD',
    base_regular_price: 29.99, base_minimum_price: 20, base_msrp: 39.99,
    fx_rate: 1, fx_rate_date: '2026-01-01',
    auto_regular_price: 29.99, auto_minimum_price: 20, auto_msrp: 39.99,
    regular_price: 34.99, minimum_price: 20, msrp: 39.99, price_source: 'auto_from_sku_details' }),
  preRow({ pricing_id: 'P2', marketplace_sku_id: 'M2', sku: 'SKU-B', currency: 'USD', base_currency: 'USD',
    base_regular_price: 19.99, fx_rate: 1, auto_regular_price: 19.99, regular_price: 19.99 }),
  preRow({ pricing_id: 'P3', marketplace_sku_id: 'M3', sku: 'SKU-C', currency: 'JPY', base_currency: 'USD',
    base_regular_price: 10, fx_rate: 1, auto_regular_price: 10, regular_price: 10 })
];

// =============================================================================================================
section('A · THE MIGRATION REFUSES WHAT IT CANNOT SAFELY DECIDE');
// =============================================================================================================
{
  // NO AUTHORITY -> BLOCKED. A migration that carries its own idea of the schema puts a column at the wrong
  // index, and the index is the entire problem this tool exists for.
  var w = makeWorld(MIG, { noAuthority: true, rows: ROWS });
  var r = w.TEMP_PRICING_R2_MIGRATION_DRY_RUN();
  ok(/AUTHORITY_NOT_LOADED/.test(r), 'A1  with 73_ absent the tool refuses rather than guessing the header');
  ok(/BLOCKED/.test(r), 'A1a and says BLOCKED');
  eq(w.__price.__headerWrites + w.__price.__dataWrites, 0, 'A1b having written nothing');

  // A LIVE ORDER THAT IS NOT THE CANONICAL ORDER -> BLOCKED. This is the failure the whole file is about:
  // the sheet would have every required column and still refuse every write.
  var scrambled = PRE_HEADER.slice();
  scrambled.splice(2, 0, 'marketplace_id');          // an extra column INSIDE the canonical prefix
  var w2 = makeWorld(MIG, { priceHeader: scrambled, rows: [scrambled.map(function () { return ''; })] });
  var r2 = w2.TEMP_PRICING_R2_MIGRATION_DRY_RUN();
  ok(/THE LIVE COLUMN ORDER IS NOT THE CANONICAL ORDER/.test(r2),
    'A2  an extra column INSIDE the canonical prefix is refused');
  ok(/HEADER_ORDER_MISMATCH/.test(r2), 'A2a naming the error the sheet would actually produce');
  eq(w2.__price.__inserts, [], 'A2b and nothing is inserted');

  // A missing sheet is a refusal, not a creation. RULE S0-2: this tool provisions columns, never tables.
  var w3 = makeWorld(MIG, { missingSheet: 'pricing_list', rows: ROWS });
  ok(/BLOCKED — pricing_list is not present/.test(w3.TEMP_PRICING_R2_MIGRATION_DRY_RUN()),
    'A3  a missing pricing_list is refused, never created');
}

// =============================================================================================================
section('B · THE PLAN — INSERT AT THE CANONICAL INDEX, NEVER APPEND');
// =============================================================================================================
{
  var w = makeWorld(MIG, { rows: ROWS });
  var r = w.TEMP_PRICING_R2_MIGRATION_DRY_RUN();
  // The flags belong at canonical positions 21, 22, 23 (1-based) — between msrp and price_source.
  ok(/insert column at 21  ->  regular_price_is_manual/.test(r), 'B1  regular flag planned at position 21');
  ok(/insert column at 22  ->  minimum_price_is_manual/.test(r), 'B2  minimum flag planned at position 22');
  ok(/insert column at 23  ->  msrp_is_manual/.test(r), 'B3  msrp flag planned at position 23');
  ok(/INSERT, not append/.test(r), 'B4  and the plan says why appending would be wrong');
  ok(/insert column at 6  ->  change_type/.test(r), 'B5  change_type planned at its canonical position too');
  eq(w.__price.__inserts, [], 'B6  A DRY RUN INSERTS NOTHING');
  eq(w.__price.__headerWrites + w.__price.__dataWrites, 0, 'B6a and writes nothing at all');
  eq(w.__log.__inserts, [], 'B6b including the change log');
  ok(/VERDICT: GO/.test(r), 'B7  and the verdict is GO');

  // Already provisioned -> nothing to do, and it says so rather than inserting duplicates.
  var w2 = makeWorld(MIG, { priceHeader: CANON, logHeader: LOGCANON,
    rows: [CANON.map(function () { return ''; })] });
  var r2 = w2.TEMP_PRICING_R2_MIGRATION_DRY_RUN();
  ok(/NOTHING TO DO/.test(r2), 'B8  a sheet already provisioned is reported as nothing to do');
  eq(w2.__price.__inserts, [], 'B8a and would insert nothing');
}

// =============================================================================================================
section('C · COMMIT — HEADER CELLS ONLY, AND BLANK STAYS BLANK');
// =============================================================================================================
{
  var w = makeWorld(MIG, { rows: ROWS });
  var r = w.TEMP_PRICING_R2_MIGRATION_COMMIT();

  eq(w.__price.__inserts, [21, 22, 23], 'C1  three columns inserted, left to right, at the canonical indexes');
  eq(w.__price.__headerWrites, 3, 'C2  exactly three HEADER cells written');
  eq(w.__price.__dataWrites, 0, 'C3  ZERO data-row writes — no existing row was touched');
  eq(w.__log.__headerWrites, 1, 'C3a and one header cell in the change log');
  eq(w.__log.__dataWrites, 0, 'C3b with no data row touched there either');

  var header = w.__price.__grid[0];
  eq(header.slice(20, 23), FLAGS, 'C4  the three flags now sit at indexes 20..22, exactly as the canonical list has them');
  eq(header, CANON, 'C5  and the whole header is now byte-for-byte the canonical order — no HEADER_ORDER_MISMATCH');

  // THE ONE THING THAT MATTERS MOST: every existing row is blank, not FALSE.
  var blanks = 0, falses = 0;
  for (var i = 1; i < w.__price.__grid.length; i++) {
    [20, 21, 22].forEach(function (c) {
      var v = String(w.__price.__grid[i][c] === undefined ? '' : w.__price.__grid[i][c]).trim();
      if (v === '') blanks++; else if (/^false$/i.test(v)) falses++;
    });
  }
  eq(blanks, ROWS.length * 3, 'C6  EVERY existing row gets a BLANK flag in all three columns');
  eq(falses, 0, 'C7  and not one of them is FALSE — blank is UNKNOWN, and FALSE would classify the price book');
  ok(/blank = UNKNOWN/.test(r) && /It is NOT false/.test(r),
    'C8  and the tool says so in the output the operator reads');
}

// =============================================================================================================
section('D · THE VALIDATOR — identities and price values survive the insert');
// =============================================================================================================
{
  var w = makeWorld(MIG, { rows: ROWS });
  var r = w.TEMP_PRICING_R2_MIGRATION_COMMIT();
  function val(k) { var m = new RegExp(k + '\\s*=\\s*(\\S+)').exec(r); return m ? m[1] : null; }

  eq(val('ROW_COUNT_PRE'), String(ROWS.length), 'D1  ROW_COUNT_PRE');
  eq(val('ROW_COUNT_POST'), String(ROWS.length), 'D2  ROW_COUNT_POST — unchanged');
  eq(val('PRICING_IDS_POST_HASH'), val('PRICING_IDS_PRE_HASH'), 'D3  the identities are unchanged');
  eq(val('PRICE_VALUES_POST_HASH'), val('PRICE_VALUES_PRE_HASH'), 'D4  and so is every price value');
  eq(val('UNKNOWN_REGULAR_COUNT'), String(ROWS.length), 'D5  UNKNOWN_REGULAR_COUNT = every row');
  eq(val('UNKNOWN_MINIMUM_COUNT'), String(ROWS.length), 'D6  UNKNOWN_MINIMUM_COUNT = every row');
  eq(val('UNKNOWN_MSRP_COUNT'), String(ROWS.length), 'D7  UNKNOWN_MSRP_COUNT = every row');
  eq(val('DB_MIGRATION_PASS'), 'YES', 'D8  DB_MIGRATION_PASS');

  // THE HASH IS BUILT FROM NAMED LOOKUPS, NOT POSITIONS — which is the only way it can survive an operation
  // whose whole purpose is to move columns, while still catching a changed VALUE.
  ok(/hashed by identity/.test(MIG), 'D9  and the file records why the hash is keyed by name');
}

// =============================================================================================================
section('E · THE CENSUS — read-only, and what it counts');
// =============================================================================================================
{
  // Run it against a sheet that has ALREADY been migrated, which is the state it is meant for.
  var migrated = ROWS.map(function (row) {
    var o = {}; PRE_HEADER.forEach(function (h, i) { o[h] = row[i]; });
    return CANON.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
  });
  migrated[0][CANON.indexOf('regular_price_is_manual')] = 'TRUE';   // P1 Regular is a person's price
  migrated[1][CANON.indexOf('regular_price_is_manual')] = 'FALSE';  // P2 Regular is system-owned

  var w = makeWorld(CEN, { priceHeader: CANON, logHeader: LOGCANON, rows: migrated });
  var r = w.TEMP_PRICING_R3_CENSUS();
  function val(k) { var m = new RegExp(k + '\\s*=\\s*(\\S+)').exec(r); return m ? m[1] : null; }

  eq(w.__price.__headerWrites + w.__price.__dataWrites, 0, 'E1  THE CENSUS WRITES NOTHING');
  eq(w.__price.__inserts, [], 'E1a and inserts nothing');

  eq(val('PRICING_ROWS_TOTAL'), '3', 'E2  PRICING_ROWS_TOTAL');
  eq(val('SAME_CURRENCY_ROWS'), '1', 'E3  SAME_CURRENCY_ROWS — P2 is USD on USD');
  eq(val('FX_CONVERTIBLE_ROWS'), '2', 'E4  FX_CONVERTIBLE_ROWS — P1 (CAD) and P3 (JPY)');
  eq(val('UNKNOWN_AUTHORITY_ROWS'), '3', 'E5  every row still has at least one unclaimed field');

  // THE NUMBER THIS ROUND EXISTS FOR.
  eq(val('CROSS_CURRENCY_FX_RATE_1_PRE'), '2',
    'E6  CROSS_CURRENCY_FX_RATE_1_PRE — two rows priced across a currency boundary at rate 1');

  ok(/USD>CAD/.test(r) && /USD>JPY/.test(r), 'E7  and the required pairs are listed');
  ok(!/USD>USD/.test(r), 'E8  while the same-currency pair is NOT listed — an identity needs no rate');
  eq(val('DUPLICATE_PRICING_IDENTITY_ROWS'), '0', 'E9  DUPLICATE_PRICING_IDENTITY_ROWS');
  eq(val('INVALID_ROWS'), '0', 'E10 INVALID_ROWS');
  ok(/REGULAR:  MANUAL=1  AUTO=1  UNKNOWN=1/.test(r),
    'E11 per-field authority is reported three-state, not as a boolean');

  // A currency outside the frozen contract is named, not silently converted.
  var chf = migrated.map(function (x) { return x.slice(); });
  chf[0][CANON.indexOf('currency')] = 'CHF';
  var w2 = makeWorld(CEN, { priceHeader: CANON, logHeader: LOGCANON, rows: chf });
  var r2 = w2.TEMP_PRICING_R3_CENSUS();
  ok(/NOT IN THE FROZEN PRECISION CONTRACT/.test(r2), 'E12 an unsupported currency is called out by name');
  eq((/UNSUPPORTED_CURRENCY_ROWS\s*=\s*(\d+)/.exec(r2) || [])[1], '1', 'E13 and counted');

  // Before the migration, everything is UNKNOWN — which is what a missing column means.
  var w3 = makeWorld(CEN, { rows: ROWS });
  var r3 = w3.TEMP_PRICING_R3_CENSUS();
  ok(/ownership flag columns present: NO/.test(r3), 'E14 a pre-migration sheet is reported as such');
  eq((/UNKNOWN_AUTHORITY_ROWS\s*=\s*(\d+)/.exec(r3) || [])[1], '3', 'E15 with every row UNKNOWN');
  eq(w3.__price.__headerWrites + w3.__price.__dataWrites, 0, 'E16 and still nothing written');
}

// =============================================================================================================
// =============================================================================================================
section('H · THE FX PRECHECK CENSUS — the rate, its date, and what a refresh would rebuild');
// =============================================================================================================
{
  var migrated2 = ROWS.map(function (row) {
    var o = {}; PRE_HEADER.forEach(function (h, i) { o[h] = row[i]; });
    return CANON.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
  });
  var wh = makeWorld(CEN, { priceHeader: CANON, logHeader: LOGCANON, rows: migrated2 });
  var rh = wh.TEMP_PRICING_R3_CENSUS();
  function v(k) { var m = new RegExp(k + '\\s*=\\s*(\\S+)').exec(rh); return m ? m[1] : null; }

  eq(wh.__price.__headerWrites + wh.__price.__dataWrites, 0, 'H0  the extended census still writes nothing');

  // THE RATE ITSELF.
  eq(v('FX_RATE_MISSING_ROWS'), '0', 'H1  FX_RATE_MISSING_ROWS — every fixture row carries a rate');
  eq(v('FX_RATE_DATE_MISSING_ROWS'), '2', 'H2  two rows have no fx_rate_date at all');
  eq(v('FX_RATE_DATE_OLDEST'), '2026-01-01', 'H3  the oldest date is reported');
  eq(v('FX_RATE_DATE_NEWEST'), '2026-01-01', 'H3a and the newest');
  ok(/2026-01-01  x1/.test(rh), 'H4  with the distribution, so a threshold can be chosen from real data');

  // STALENESS IS A POLICY, AND NOBODY HAS SET ONE. Reporting a number here would look exactly like a
  // measurement, and the operator would act on it.
  eq(v('FX_RATE_STALE_ROWS'), 'NOT_DEFINED', 'H5  FX_RATE_STALE_ROWS is NOT_DEFINED, not guessed');
  ok(/No staleness threshold exists/.test(rh), 'H5a and the report says why');
  wh.TEMP_PR3C_STALE_BEFORE_ = '2026-06-01';
  var rh2 = wh.TEMP_PRICING_R3_CENSUS();
  ok(/FX_RATE_STALE_ROWS              = 1   \(fx_rate_date before 2026-06-01\)/.test(rh2),
    'H6  once the operator declares a threshold it is applied, and the threshold is shown with the count');

  // WHAT A REFRESH WORKS FROM, AND WHAT IT WOULD REBUILD. These are different questions and a blank in
  // either one means "no price", never zero.
  ok(/BASE_REGULAR_AVAILABLE = 3   BASE_REGULAR_BLANK = 0/.test(rh), 'H7  base regular availability');
  ok(/BASE_MINIMUM_AVAILABLE = 1   BASE_MINIMUM_BLANK = 2/.test(rh), 'H7a base minimum');
  ok(/BASE_MSRP_AVAILABLE = 1   BASE_MSRP_BLANK = 2/.test(rh), 'H7b base msrp');
  ok(/AUTO_REGULAR_EXISTING = 3   AUTO_REGULAR_BLANK = 0/.test(rh), 'H8  auto regular reference');
  ok(/AUTO_MINIMUM_EXISTING = 1   AUTO_MINIMUM_BLANK = 2/.test(rh), 'H8a auto minimum');
  ok(/AUTO_MSRP_EXISTING = 1   AUTO_MSRP_BLANK = 2/.test(rh), 'H8b auto msrp');
  ok(/0 is a price/.test(rh), 'H9  and the report says a blank base never becomes 0');

  // A Date-typed fx_rate_date is what the real sheet hands back; it must normalise, not stringify to
  // something unsortable.
  var dated = migrated2.map(function (x) { return x.slice(); });
  dated[1][CANON.indexOf('fx_rate_date')] = new Date(Date.UTC(2025, 5, 15));
  var wd = makeWorld(CEN, { priceHeader: CANON, logHeader: LOGCANON, rows: dated });
  var rd = wd.TEMP_PRICING_R3_CENSUS();
  eq((/FX_RATE_DATE_OLDEST\s*=\s*(\S+)/.exec(rd) || [])[1], '2025-06-15',
    'H10 a Date-typed fx_rate_date is normalised and sorts correctly');
  eq((/FX_RATE_DATE_MISSING_ROWS\s*=\s*(\d+)/.exec(rd) || [])[1], '1', 'H10a and counts as present');
}

// =============================================================================================================
section('F · MUTANTS');
// =============================================================================================================
function nl(src, t) { return src.indexOf('\r\n') !== -1 ? t.split('\n').join('\r\n') : t; }
function faulted(src, from, to, tag) {
  var a = nl(src, from), b = nl(src, to);
  if (src.indexOf(a) === -1) throw new Error(tag + ' anchor drifted — the mutant would inject nothing');
  return src.split(a).join(b);
}
function mut(label, src, from, to, probe) {
  var caught = false;
  try {
    var m = faulted(src, from, to, label);
    if (m === src) throw new Error(label + ' changed nothing');
    caught = probe(m) === true;
  } catch (e) {
    if (/anchor drifted|changed nothing/.test(e.message)) { fail++; console.error('FAIL ' + label + ' — ' + e.message); return; }
    caught = true;
  }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

// F1 — THE DEFECT THE WHOLE ROUND GUARDS AGAINST: back-filling FALSE into the existing rows.
mut('F1  the migration back-fills FALSE instead of leaving the flag blank', MIG,
  "    sh.getRange(1, x.at).setValue(x.column);",
  "    sh.getRange(1, x.at).setValue(x.column);\n    for (var zz = 2; zz <= sh.getLastRow(); zz++) sh.getRange(zz, x.at).setValue('FALSE');",
  function (m) {
    var w = makeWorld(m, { rows: ROWS });
    w.TEMP_PRICING_R2_MIGRATION_COMMIT();
    return w.__price.__dataWrites > 0;
  });

// F2 — APPEND INSTEAD OF INSERT: every column present, every write refused.
mut('F2  the flags are appended to the right instead of inserted at the canonical index', MIG,
  "  missing.forEach(function (f) { plan.push({ column: f, at: CANON.indexOf(f) + 1 }); });",
  "  missing.forEach(function (f) { plan.push({ column: f, at: liveHeader.length + 1 }); });",
  function (m) {
    var w = makeWorld(m, { rows: ROWS });
    w.TEMP_PRICING_R2_MIGRATION_COMMIT();
    return JSON.stringify(w.__price.__grid[0].slice(0, CANON.length)) !== JSON.stringify(CANON);
  });

// F3 — the order guard is removed, so a sheet that can never be written to is migrated anyway.
mut('F3  the canonical-order guard is disabled', MIG,
  "  if (!prefixOk) {",
  "  if (false) {",
  function (m) {
    var scrambled = PRE_HEADER.slice();
    scrambled.splice(2, 0, 'marketplace_id');
    var w = makeWorld(m, { priceHeader: scrambled, rows: [scrambled.map(function () { return ''; })] });
    var r = w.TEMP_PRICING_R2_MIGRATION_DRY_RUN();
    return !/THE LIVE COLUMN ORDER IS NOT THE CANONICAL ORDER/.test(r);
  });

// F4 — a dry run that writes is not a dry run.
mut('F4  the dry run falls through into the commit path', MIG,
  "  if (!commit) {",
  "  if (false) {",
  function (m) {
    var w = makeWorld(m, { rows: ROWS });
    w.TEMP_PRICING_R2_MIGRATION_DRY_RUN();
    return w.__price.__inserts.length > 0;
  });

// F5 — the validator stops comparing, so a changed price value would pass unnoticed.
mut('F5  the post-migration value check always agrees', MIG,
  "  var ok = (postRows === dataRows) && (post.idsHash === pre.idsHash) && (post.valuesHash === pre.valuesHash)",
  "  var ok = (postRows === dataRows) && (post.idsHash === pre.idsHash) && (true)",
  function (m) {
    // Drive it where the values DID change, so only the comparison stands between that and DB_MIGRATION_PASS.
    var m2 = m.replace("      var cells = PRICE_FIELDS.map(function (f) { return idx[f] === -1 ? '' : tempPr2mStr_(grid[r][idx[f]]); });",
      "      var cells = PRICE_FIELDS.map(function (f) { return idx[f] === -1 ? '' : tempPr2mStr_(grid[r][idx[f]]) + (commit ? Math.random() : ''); });");
    if (m2 === m) throw new Error('F5 second anchor drifted');
    var w = makeWorld(m2, { rows: ROWS });
    var r = w.TEMP_PRICING_R2_MIGRATION_COMMIT();
    return /DB_MIGRATION_PASS = YES/.test(r);
  });

// F6 — the census reads a blank flag as AUTO, which is the classification the whole model forbids.
mut('F6  the census reads a blank ownership flag as AUTO', CEN,
  "  if (s === '') return 'UNKNOWN';",
  "  if (s === '') return 'AUTO';",
  function (m) {
    var w = makeWorld(m, { priceHeader: CANON, logHeader: LOGCANON,
      rows: [CANON.map(function (h) { return ({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', base_currency: 'USD' })[h] || ''; })] });
    var r = w.TEMP_PRICING_R3_CENSUS();
    return /UNKNOWN_AUTHORITY_ROWS\s*=\s*0/.test(r);
  });

// F7 — the census lists same-currency pairs, sending the operator to fetch a rate for USD against itself.
mut('F7  the census asks for a rate for a same-currency pair', CEN,
  "      if (loc === base) c.SAME_CURRENCY_ROWS++;",
  "      if (false) c.SAME_CURRENCY_ROWS++;",
  function (m) {
    var w = makeWorld(m, { priceHeader: CANON, logHeader: LOGCANON,
      rows: [CANON.map(function (h) { return ({ pricing_id: 'P2', marketplace_sku_id: 'M2', currency: 'USD', base_currency: 'USD' })[h] || ''; })] });
    return /USD>USD/.test(w.TEMP_PRICING_R3_CENSUS());
  });

// F8 — the census starts writing. It is the one tool that must never touch the table.
mut('F8  the census writes to the sheet', CEN,
  "  var grid = sh.getDataRange().getValues();",
  "  var grid = sh.getDataRange().getValues(); sh.getRange(1, 1).setValue('touched');",
  function (m) {
    var w = makeWorld(m, { priceHeader: CANON, logHeader: LOGCANON, rows: [] });
    w.TEMP_PRICING_R3_CENSUS();
    return (w.__price.__headerWrites + w.__price.__dataWrites) > 0;
  });

// =============================================================================================================
section('J · THE CENSUS ANSWERS THE OPERATOR REPORT, FIELD BY FIELD, BY NAME');
// =============================================================================================================
{
  // A census whose numbers are right and whose LABELS are not is a census the operator cannot transcribe.
  // Three fields of the R22 closeout report had no matching name in this tool and one was not measured by
  // it at all, which is only discoverable by reading the two side by side — so the list lives here now.
  var REQUIRED = [
    'PRICING_ROWS_TOTAL', 'SUPPORTED_BASE_CURRENCIES', 'SUPPORTED_LOCAL_CURRENCIES',
    'CURRENCY_PAIRS_REQUIRED', 'SAME_CURRENCY_ROWS', 'CROSS_CURRENCY_ROWS',
    'BASE_REGULAR_AVAILABLE', 'BASE_REGULAR_BLANK',
    'BASE_MINIMUM_AVAILABLE', 'BASE_MINIMUM_BLANK',
    'BASE_MSRP_AVAILABLE', 'BASE_MSRP_BLANK',
    'AUTO_REGULAR_EXISTING', 'AUTO_REGULAR_BLANK',
    'AUTO_MINIMUM_EXISTING', 'AUTO_MINIMUM_BLANK',
    'AUTO_MSRP_EXISTING', 'AUTO_MSRP_BLANK',
    'FX_RATE_MISSING_ROWS', 'FX_RATE_INVALID_ROWS', 'FX_RATE_DATE_MISSING_ROWS',
    'CROSS_CURRENCY_FX_RATE_1_ROWS', 'FX_RATE_DATE_DISTRIBUTION',
    'UNKNOWN_AUTHORITY_ROWS', 'JOIN_AMBIGUITY_COUNT'
  ];
  var migratedJ = ROWS.map(function (row) {
    var o = {}; PRE_HEADER.forEach(function (h, i) { o[h] = row[i]; });
    return CANON.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
  });
  var wj = makeWorld(CEN, { priceHeader: CANON, logHeader: LOGCANON, rows: migratedJ });
  var rj = wj.TEMP_PRICING_R3_CENSUS();
  REQUIRED.forEach(function (name) {
    // Anywhere the name is followed by = or :. Some pairs legitimately share a line (AVAILABLE beside
    // BLANK, which is how you see the two sum to the total), and demanding line-start would fail a
    // report that is perfectly transcribable.
    ok(new RegExp('(^|[\\n\\s])' + name + '\\s*[:=]').test(rj), 'J1  the census reports ' + name + ' by name');
  });

  // JOIN_AMBIGUITY_COUNT is answered, but by pointing at the tool that owns it rather than by measuring
  // it a second time. Two tools that can disagree about whether a row has exactly one source is worse
  // than one tool that answers it.
  ok(/JOIN_AMBIGUITY_COUNT            = NOT MEASURED HERE/.test(rj),
    'J2  JOIN_AMBIGUITY_COUNT is not silently measured twice');
  ok(/TEMP_PRICING_R2_POST_VERIFY/.test(rj), 'J2a and its owner is named');
  ok(/DIFFERENT question/.test(rj),
    'J2b beside the duplicate-identity count it is easy to confuse with');

  // The legacy names stay readable, so an earlier report does not become untranslatable.
  ok(/FX_CONVERTIBLE_ROWS\s*=/.test(rj), 'J3  the earlier name for CROSS_CURRENCY_ROWS still prints');
  ok(/CROSS_CURRENCY_FX_RATE_1_PRE\s*=/.test(rj), 'J3a and for CROSS_CURRENCY_FX_RATE_1_ROWS');

  // The one-line summaries are what actually gets pasted into a report, so they carry values rather than
  // being headings over an indented list.
  ok(/SUPPORTED_LOCAL_CURRENCIES      = CAD, JPY, USD/.test(rj), 'J4  local currencies as one copyable line');
  ok(/SUPPORTED_BASE_CURRENCIES       = USD/.test(rj), 'J4a base currencies likewise');
  ok(/CURRENCY_PAIRS_REQUIRED         = USD>CAD, USD>JPY/.test(rj), 'J4b and the required pairs');
  ok(!/CURRENCY_PAIRS_REQUIRED         = .*USD>USD/.test(rj),
    'J4c with the same-currency identity still excluded from the copyable line');
}

// =============================================================================================================
section('I · MUTANTS FOR THE FX PRECHECK');
// =============================================================================================================
function censusMutant(label, from, to, probe) {
  if (CEN.indexOf(from) === -1) { fail++; console.error('FAIL ' + label + '   [anchor not found]'); return; }
  if (CEN.split(from).length - 1 !== 1) { fail++; console.error('FAIL ' + label + '   [anchor not unique]'); return; }
  var m = CEN.replace(from, to);
  var migrated3 = ROWS.map(function (row) {
    var o = {}; PRE_HEADER.forEach(function (h, i) { o[h] = row[i]; });
    return CANON.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
  });
  var caught;
  try {
    var w = makeWorld(m, { priceHeader: CANON, logHeader: LOGCANON, rows: migrated3 });
    caught = probe(w.TEMP_PRICING_R3_CENSUS(), w);
  } catch (e) { caught = true; }
  if (caught) { mutCaught++; pass++; console.log('ok   ' + label + '  (mutant caught)'); }
  else { mutSurvived++; fail++; console.error('SURVIVED ' + label); }
}

// I1 — a staleness threshold is invented. The operator would read a number that looks measured and act
// on it, and nothing on screen would say it was a guess.
censusMutant('I1  the census invents a staleness threshold instead of saying NOT_DEFINED',
  "var TEMP_PR3C_STALE_BEFORE_ = '';",
  "var TEMP_PR3C_STALE_BEFORE_ = '2026-06-01';",
  function (r) { return !/FX_RATE_STALE_ROWS              = NOT_DEFINED/.test(r); });

// I2 — a blank auto_* is counted as an existing reference, so a FIRST FILL is reported as a refresh and
// the operator authorises a much larger change than they think.
censusMutant('I2  a blank auto reference is counted as existing',
  "      if (a.present) autoCensus[s.L].existing++; else autoCensus[s.L].blank++;",
  "      autoCensus[s.L].existing++;",
  function (r) { return !/AUTO_MSRP_EXISTING = 1   AUTO_MSRP_BLANK = 2/.test(r); });

// I3 — a missing fx_rate_date is counted as present, which would make an undated rate look dated.
censusMutant('I3  a blank fx_rate_date is treated as present',
  "    if (fxdStr === '') c.FX_RATE_DATE_MISSING_ROWS++;",
  "    if (false) c.FX_RATE_DATE_MISSING_ROWS++;",
  function (r) { return !/FX_RATE_DATE_MISSING_ROWS       = 2/.test(r); });

// I5 — a required report name is dropped. The numbers stay right and the report becomes untranscribable,
// which is the failure this whole section exists for and the one that does not look like a bug.
censusMutant('I5  a required report field loses its name',
  "  p('CROSS_CURRENCY_ROWS             = ' + c.FX_CONVERTIBLE_ROWS);",
  "  p('' + c.FX_CONVERTIBLE_ROWS);",
  function (r) { return !/(^|\n)\s*CROSS_CURRENCY_ROWS\s*[:=]/.test(r); });

// I4 — a blank base is counted as available, so the census promises a refresh material it does not have.
censusMutant('I4  a blank base price is counted as available',
  "      if (b.present) baseCensus[s.L].available++; else baseCensus[s.L].blank++;",
  "      baseCensus[s.L].available++;",
  function (r) { return !/BASE_MSRP_AVAILABLE = 1   BASE_MSRP_BLANK = 2/.test(r); });

// =============================================================================================================
section('L · THE FX PLAN DECOMPOSITION — WHY A PER-FIELD COUNT CAN EXCEED THE CONVERTIBLE ROWS');
// =============================================================================================================
// A production dry run reported AUTO_MINIMUM_WOULD_UPDATE = 197 against FX_CONVERTIBLE_ROWS = 193. The
// excess is not a defect and not an overflow: same-currency rows are PLANNED through a synthesised identity
// rate rather than skipped, so a USD row whose auto_* disagrees with its own base price moves too. This
// section builds a table where that is true by construction and checks the tool separates the two.
//
// The decomposition tool calls the DEPLOYED planner, so the world here loads 73_ alongside it exactly as
// the Apps Script project would. A tool that recomputed the plan its own way could agree with itself and
// still be wrong about the run it claims to be explaining.
function decWorld(src, rows, opts) {
  opts = opts || {};
  var priceSheet = fakeSheet('pricing_list', [CANON].concat(rows));
  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math,
    JSON: JSON, isFinite: isFinite, Date: Date, RegExp: RegExp, parseFloat: parseFloat, isNaN: isNaN,
    Logger: { log: function (x) { S.__logged = x; } },
    SpreadsheetApp: {
      getActiveSpreadsheet: function () {
        return { getSheetByName: function (n) {
          if (opts.missingSheet === n) return null;
          return n === 'pricing_list' ? priceSheet : null;
        } };
      },
      flush: function () {}
    },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: { formatDate: function (d) { return d.toISOString().slice(0, 10); } },
    __price: priceSheet
  };
  vm.createContext(S);
  if (!opts.noAuthority) vm.runInContext(GS73, S, { filename: '73_.gs' });
  vm.runInContext(src, S, { filename: 'decompose.gs' });
  return S;
}
function decRow(o) { return CANON.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; }); }

// THE TABLE, designed so every bucket below is derived by hand and not by running the tool first.
//
//   X1 CAD   all three bases present, auto_* still equal to base (what 04_ seeds)   -> 3 cross moves
//   X2 JPY   regular and msrp present, minimum blank                                -> 2 cross moves
//   X3 CAD   base_regular 0, auto 0. 0 x 1.41095 = 0, so a CROSS row that does NOT move -> 0
//   I1 USD   auto already equals base exactly                                       -> 0 identity moves
//   I2 USD   base 12.347 — more decimals than USD can hold, so ROUND moves it       -> BASE_NOT_ROUNDED
//   I3 USD   auto blank                                                             -> AUTO_BLANK
//   I4 USD   auto 37.5 against a base of 40                                         -> AUTO_STALE
//   I5 USD   base_minimum blank while auto_minimum still holds 9.99                 -> the stale-auto count
var DECROWS = [
  decRow({ pricing_id: 'X1', marketplace_sku_id: 'MX1', sku: 'SKU-X1', currency: 'CAD', base_currency: 'USD',
    base_regular_price: 29.99, base_minimum_price: 20, base_msrp: 39.99,
    auto_regular_price: 29.99, auto_minimum_price: 20, auto_msrp: 39.99,
    fx_rate: 1, regular_price: 34.99, minimum_price: 20, msrp: 39.99 }),
  decRow({ pricing_id: 'X2', marketplace_sku_id: 'MX2', sku: 'SKU-X2', currency: 'JPY', base_currency: 'USD',
    base_regular_price: 10, base_msrp: 5, auto_regular_price: 10, auto_msrp: 5, fx_rate: 1 }),
  decRow({ pricing_id: 'X3', marketplace_sku_id: 'MX3', sku: 'SKU-X3', currency: 'CAD', base_currency: 'USD',
    base_regular_price: 0, auto_regular_price: 0, fx_rate: 1 }),
  decRow({ pricing_id: 'I1', marketplace_sku_id: 'MI1', sku: 'SKU-I1', currency: 'USD', base_currency: 'USD',
    base_regular_price: 19.99, base_minimum_price: 15, base_msrp: 25,
    auto_regular_price: 19.99, auto_minimum_price: 15, auto_msrp: 25, fx_rate: 1 }),
  decRow({ pricing_id: 'I2', marketplace_sku_id: 'MI2', sku: 'SKU-I2', currency: 'USD', base_currency: 'USD',
    base_regular_price: 12.347, auto_regular_price: 12.347, fx_rate: 1 }),
  decRow({ pricing_id: 'I3', marketplace_sku_id: 'MI3', sku: 'SKU-I3', currency: 'USD', base_currency: 'USD',
    base_regular_price: 30, fx_rate: 1 }),
  decRow({ pricing_id: 'I4', marketplace_sku_id: 'MI4', sku: 'SKU-I4', currency: 'USD', base_currency: 'USD',
    base_regular_price: 40, auto_regular_price: 37.5, fx_rate: 1 }),
  decRow({ pricing_id: 'I5', marketplace_sku_id: 'MI5', sku: 'SKU-I5', currency: 'USD', base_currency: 'USD',
    base_regular_price: 11, auto_regular_price: 11, auto_minimum_price: 9.99, fx_rate: 1 })
];

// The tool carries the PRODUCTION envelope as a constant. Against any other table it must say so rather
// than explaining numbers that no longer describe what it just read — so the fake table is rewritten into
// the constant for the tests that need the matching path, and left alone for the test that needs the other.
var DEC_FAKE_ENVELOPE = DEC.replace(
  /var TEMP_PR3D_ENVELOPE_ = \{[\s\S]*?\n\};/,
  ['var TEMP_PR3D_ENVELOPE_ = {',
   '  PRICING_ROWS_TOTAL: 8, SAME_CURRENCY_ROWS: 5, FX_CONVERTIBLE_ROWS: 3,',
   '  rows_planned: 8, rows_changed: 8, skipped_count: 0, log_rows: 8,',
   '  AUTO_REGULAR_WOULD_UPDATE: 5, AUTO_MINIMUM_WOULD_UPDATE: 1, AUTO_MSRP_WOULD_UPDATE: 2,',
   '  EFFECTIVE_REGULAR_WOULD_FOLLOW: 0, EFFECTIVE_MINIMUM_WOULD_FOLLOW: 0, EFFECTIVE_MSRP_WOULD_FOLLOW: 0',
   '};'].join('\n'));

{
  ok(DEC_FAKE_ENVELOPE !== DEC, 'L0  the envelope constant is rewritable for the fixture');

  var wDef = decWorld(DEC, DECROWS);
  var rDef = wDef.TEMP_PRICING_R3_FX_DECOMPOSE();

  // THE FIRST THING THE TOOL OWES THE OPERATOR: this is not the table the envelope came from. A
  // decomposition of a table that has moved since the dry run explains the wrong plan, and it would look
  // exactly as authoritative.
  ok(/ENVELOPE_STILL_DESCRIBES_TABLE  = NO/.test(rDef),
    'L1  against a different table the tool says the envelope no longer describes it');
  ok(/DECOMPOSITION_SUMS_MATCH        = NO/.test(rDef), 'L1a and does not claim the sums match');

  var w = decWorld(DEC_FAKE_ENVELOPE, DECROWS);
  var r = w.TEMP_PRICING_R3_FX_DECOMPOSE();

  ok(/ENVELOPE_STILL_DESCRIBES_TABLE  = YES/.test(r), 'L2  with the envelope matching, the recount agrees');
  ok(/rows_planned                    = 8   /.test(r), 'L2a  8 rows planned');
  ok(/skipped_count                   = 0   /.test(r), 'L2b  none skipped');
  ok(/SAME_CURRENCY_ROWS              = 5   /.test(r), 'L2c  5 same-currency');
  ok(/FX_CONVERTIBLE_ROWS             = 3   /.test(r), 'L2d  3 cross-currency');

  // THE ANSWER. 5 > 3 for the regular price, and the two extra are identity rows — which is the whole
  // shape of the production anomaly, reproduced at eight rows.
  ok(/AUTO_REGULAR_WOULD_UPDATE       = 5   /.test(r), 'L3  AUTO_REGULAR_WOULD_UPDATE = 5, above the 3 cross rows');
  ok(/AUTO_REGULAR_WOULD_UPDATE[\s\S]*?CROSS_CURRENCY                = 2\r?\n  SAME_CURRENCY_IDENTITY        = 3/.test(r),
    'L3a  and it decomposes 2 cross + 3 identity');
  ok(/AUTO_MINIMUM_WOULD_UPDATE       = 1   /.test(r), 'L3b  AUTO_MINIMUM_WOULD_UPDATE = 1');
  ok(/AUTO_MINIMUM_WOULD_UPDATE[\s\S]*?CROSS_CURRENCY                = 1\r?\n  SAME_CURRENCY_IDENTITY        = 0/.test(r),
    'L3c  1 cross + 0 identity');
  ok(/AUTO_MSRP_WOULD_UPDATE          = 2   /.test(r), 'L3d  AUTO_MSRP_WOULD_UPDATE = 2');
  ok(/DECOMPOSITION_SUMS_MATCH        = YES/.test(r), 'L3e  and every part sums to its reported total');

  // A CROSS-CURRENCY ROW THAT DOES NOT MOVE. X3 is a real counterexample to "all 193 convert": zero times
  // any rate is still zero, so the cross bucket is a bound and not an identity.
  ok(/cross-currency rows that did NOT move:[\s\S]*?AUTO_ALREADY_CURRENT 1/.test(r),
    'L4  a cross row whose converted value equals its auto is reported as not moving');

  // WHY EACH IDENTITY ROW MOVED — the distinction the operator actually needs, because a first fill and a
  // stale value are different findings about the health of the table.
  ok(/AUTO_BLANK           1/.test(r), 'L5  one identity row moved because auto was blank');
  ok(/AUTO_STALE           1/.test(r), 'L5a  one because auto disagreed with its base');
  ok(/BASE_NOT_ROUNDED     1/.test(r), 'L5b  one because the base carries more decimals than USD can hold');

  // EVERY IDENTITY CHANGE IS THE ROUNDED BASE. Checked against pricingRoundFx_ rather than against a
  // multiplication written in the test, because "times one" is the step a bug would also get right.
  ok(/IDENTITY_TARGET_MISMATCHES      = 0/.test(r), 'L6  no identity change departs from ROUND(base)');
  ok(/IDENTITY_AUTO_EQUALS_ROUNDED_BASE = YES/.test(r), 'L6a  stated as a verdict');
  ok(/SKU-I2[\s\S]*?base=12\.347[\s\S]*?12\.35/.test(r), 'L6b  and 12.347 is shown becoming 12.35');

  // THE LOG PROJECTION. 5 + 1 + 2 = 8, and not one of them is an effective-price log.
  ok(/log rows from auto_\* changes    = 8/.test(r), 'L7  8 auto log rows');
  ok(/log rows from effective changes = 0/.test(r), 'L7a  and no effective log rows');
  ok(/LOG_ROWS_EQUALS_AUTO_SUM        = YES/.test(r), 'L7b  the log count is exactly the sum of the auto counts');

  // THE WRITE SET, read off the plans rather than off the handler report.
  ok(/columns_to_write                = auto_minimum_price, auto_msrp, auto_regular_price, fx_rate, fx_rate_date/.test(r),
    'L8  the write set is the three auto columns and the two rate columns');
  ok(/EFFECTIVE_IN_WRITE_SET          = NONE/.test(r), 'L8a  no effective price is written for UNKNOWN authority');
  ok(/FLAG_IN_WRITE_SET               = NONE/.test(r), 'L8b  and no ownership flag is written at all');
  ok(/FX_RATE_1_POST                  = 5   /.test(r), 'L8c  the rows left at rate 1 are exactly the identity rows');

  // BLANK BASE WITH A STALE AUTO. The planner leaves these alone, so the count is a standing fact about
  // the table rather than something this run changes.
  ok(/BASE_REGULAR_BLANK_WITH_AUTO_NONBLANK   = 0/.test(r), 'L9  no regular price is blank beside a live auto');
  ok(/BASE_MINIMUM_BLANK_WITH_AUTO_NONBLANK   = 1/.test(r), 'L9a  one minimum price is');
  ok(/BASE_MSRP_BLANK_WITH_AUTO_NONBLANK      = 0/.test(r), 'L9b  no msrp is');
  ok(/BLANK_BASE_STALE_AUTO_PRESENT   = YES/.test(r), 'L9c  and the verdict says so');
  ok(/measured only — nothing is cleaned here/.test(r), 'L9d  while saying it did not clean them');

  // THE AUTO CENSUS the dry-run envelope never carried.
  ok(/AUTO_REGULAR_EXISTING\s+= 7\s+AUTO_REGULAR_BLANK\s+= 1/.test(r), 'L10  7 existing / 1 blank');
  ok(/AUTO_MINIMUM_EXISTING\s+= 3\s+AUTO_MINIMUM_BLANK\s+= 5/.test(r), 'L10a  3 / 5');
  ok(/AUTO_MSRP_EXISTING\s+= 3\s+AUTO_MSRP_BLANK\s+= 5/.test(r), 'L10b  3 / 5');

  // READ ONLY, proved on the sheet rather than promised in a header.
  eq(w.__price.__headerWrites + w.__price.__dataWrites, 0, 'L11  the tool writes nothing to the sheet');
  ok(/DB_WRITES                       = 0/.test(r), 'L11a  and says so');
  ok(/FX_EXECUTION_AUTHORIZED         = NO/.test(r), 'L11b  authorising nothing');

  // WITHOUT THE PLANNER IT REFUSES. The alternative — falling back to its own arithmetic — would produce a
  // decomposition that cannot be wrong in the same way as the thing it explains, which is the one property
  // that makes it worth reading.
  var wn = decWorld(DEC, DECROWS, { noAuthority: true });
  var rn = wn.TEMP_PRICING_R3_FX_DECOMPOSE();
  ok(/AUTHORITY_NOT_LOADED/.test(rn), 'L12  with 73_ absent the tool refuses');
  ok(/missing: pricingPlanFxRow_/.test(rn), 'L12a  naming the planner it will not reimplement');
  ok(/BLOCKED/.test(rn), 'L12b  and says BLOCKED');

  // AN EXPLICIT AUTO FLAG IS THE CONTRAST. No production row carries one, so without this the write-set
  // and effective-log checks above would pass on a table where they could not have failed.
  var autoFlagRows = DECROWS.concat([
    decRow({ pricing_id: 'A1', marketplace_sku_id: 'MA1', sku: 'SKU-A1', currency: 'CAD', base_currency: 'USD',
      base_regular_price: 29.99, auto_regular_price: 29.99, regular_price: 29.99,
      regular_price_is_manual: 'FALSE', fx_rate: 1 })
  ]);
  var wa = decWorld(DEC, autoFlagRows);
  var ra = wa.TEMP_PRICING_R3_FX_DECOMPOSE();
  ok(/EFFECTIVE_IN_WRITE_SET          = regular_price/.test(ra),
    'L13  a row flagged AUTO does put its effective price in the write set');
  ok(/EFFECTIVE_\*_WOULD_FOLLOW \(all\)  = 1/.test(ra), 'L13a  and is counted as following');
  ok(/log rows from effective changes = 1/.test(ra), 'L13b  with its own log row');
  ok(/LOG_ROWS_EQUALS_AUTO_SUM        = NO/.test(ra),
    'L13c  so the log count is no longer purely the auto sum, and the tool says NO');
  ok(/FLAG_IN_WRITE_SET               = NONE/.test(ra), 'L13d  the flag itself is still never written');
}

// =============================================================================================================
section('M · MUTANTS FOR THE DECOMPOSITION');
// =============================================================================================================
// Convention, as elsewhere in this repo: the probe returns TRUE when the mutant is CAUGHT. It asserts the
// BROKEN behaviour, not the correct one — a probe written the other way round reads SURVIVED for every
// mutant and proves nothing.
function decMutant(label, from, to, probe, rows, srcBase) {
  var base = srcBase || DEC_FAKE_ENVELOPE;
  if (base.indexOf(from) === -1) { fail++; console.error('FAIL ' + label + '   [anchor not found]'); return; }
  if (base.split(from).length - 1 !== 1) { fail++; console.error('FAIL ' + label + '   [anchor not unique]'); return; }
  var caught;
  try {
    var w = decWorld(base.replace(from, to), rows || DECROWS);
    caught = probe(w.TEMP_PRICING_R3_FX_DECOMPOSE(), w);
  } catch (e) { caught = true; }
  if (caught) { mutCaught++; pass++; console.log('ok   ' + label + '  (mutant caught)'); }
  else { mutSurvived++; fail++; console.error('SURVIVED ' + label); }
}

// M1 — every change is filed as cross-currency. The totals stay right and the decomposition becomes a
// restatement of the number it was supposed to explain, which is the failure that looks most like success.
decMutant('M1  the identity rows are filed as cross-currency',
  "split[s.field][plan.identity ? 'IDENTITY' : 'CROSS']++;",
  "split[s.field]['CROSS']++;",
  function (r) { return !/CROSS_CURRENCY                = 2\r?\n  SAME_CURRENCY_IDENTITY        = 3/.test(r); });

// M2 — the identity target is the raw base rather than the rounded base. 12.347 then reads as a mismatch,
// and an operator would be told a legitimate rounding is an unrelated mutation.
decMutant('M2  the identity target skips the rounding',
  "      var target = pricingRoundFx_(b.value, localCurrency);",
  "      var target = b.value;",
  function (r) { return !/IDENTITY_AUTO_EQUALS_ROUNDED_BASE = YES/.test(r); });

// M3 — the stale-auto probe is inverted. It would report blank-beside-blank as the finding and miss the
// only row that has one.
decMutant('M3  the blank-base stale-auto test is inverted',
  "      if (!b.present && a.present) blankBaseStaleAuto[s.field]++;",
  "      if (!b.present && !a.present) blankBaseStaleAuto[s.field]++;",
  function (r) { return !/BASE_MINIMUM_BLANK_WITH_AUTO_NONBLANK   = 1/.test(r); });

// M4 — the write-set audit stops looking for effective prices. Caught only on the AUTO-flag table, because
// on the production shape no effective price is ever in the write set and the mutant injects nothing.
decMutant('M4  the write-set audit stops noticing effective prices',
  "    if (EFFECTIVE[k]) effectiveKeysInWriteSet.push(k);",
  "    if (false) effectiveKeysInWriteSet.push(k);",
  function (r) { return !/EFFECTIVE_IN_WRITE_SET          = regular_price/.test(r); },
  DECROWS.concat([decRow({ pricing_id: 'A1', marketplace_sku_id: 'MA1', sku: 'SKU-A1', currency: 'CAD',
    base_currency: 'USD', base_regular_price: 29.99, auto_regular_price: 29.99, regular_price: 29.99,
    regular_price_is_manual: 'FALSE', fx_rate: 1 })]),
  DEC);

// M5 — the duplicate guard the batch planner applies is dropped here. The decomposition would then cover
// rows the run would refuse, and the parts would stop adding up to a plan anybody could execute.
decMutant('M5  the duplicate-identity guard is dropped from the replication',
  "    if (seen[id]) { skipped++; skipReasons.DUPLICATE_IDENTITY = (skipReasons.DUPLICATE_IDENTITY || 0) + 1; return; }",
  "    if (false) { return; }",
  function (r) { return !/skipped_count                   = 1   /.test(r); },
  DECROWS.concat([decRow({ pricing_id: 'DUP', marketplace_sku_id: 'MX1', sku: 'SKU-X1', currency: 'CAD',
    base_currency: 'USD', base_regular_price: 29.99, auto_regular_price: 29.99, fx_rate: 1 })]),
  DEC);

// M6 — the envelope check is made unconditional. The tool would then say the production envelope still
// describes whatever table it was pointed at, which is the one claim it exists to be careful about.
decMutant('M6  the envelope reconciliation always reports YES',
  "  var envOk = (rowsPlanned === TEMP_PR3D_ENVELOPE_.rows_planned)",
  "  var envOk = true || (rowsPlanned === TEMP_PR3D_ENVELOPE_.rows_planned)",
  function (r) { return !/ENVELOPE_STILL_DESCRIBES_TABLE  = NO/.test(r); },
  DECROWS, DEC);


// =============================================================================================================
section('P · PRICING-R4 §2/§3/§4 — SELECTING FOUR SMOKE ROWS THAT CANNOT BE PICKED BY EYE');
// =============================================================================================================
// Three of the selection constraints are invisible in a spreadsheet export: whether an id is unique in
// pricing_list, whether its marketplace_skus row is unique, and whether a field's effective price already
// equals its auto value. The last one decides whether the AUTO smoke moves a live price or not, so the
// fixture below gives every exclusion rule exactly one row that ONLY it can catch — a rule that stopped
// working would otherwise be covered by its neighbour.
var MSKU_H = ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'marketplace_sku_status'];
function mskuRow(o) { return MSKU_H.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; }); }

function smokeWorld(src, rows, mskus, opts) {
  opts = opts || {};
  var priceSheet = fakeSheet('pricing_list', [CANON].concat(rows || []));
  var mskuSheet = fakeSheet('marketplace_skus', [MSKU_H].concat(mskus || []));
  var logSheet = fakeSheet('pricing_change_log', [LOGCANON].concat(opts.logRows || []));
  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math,
    JSON: JSON, isFinite: isFinite, Date: Date, RegExp: RegExp, parseFloat: parseFloat, isNaN: isNaN,
    Logger: { log: function (x) { S.__logged = x; } },
    SpreadsheetApp: {
      getActiveSpreadsheet: function () {
        return { getSheetByName: function (n) {
          if (opts.missingSheet === n) return null;
          if (n === 'pricing_list') return priceSheet;
          if (n === 'marketplace_skus') return mskuSheet;
          if (n === 'pricing_change_log') return logSheet;
          return null;
        } };
      },
      flush: function () {}
    },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: { formatDate: function (d) { return d.toISOString().slice(0, 10); } },
    __price: priceSheet, __msku: mskuSheet, __log: logSheet
  };
  vm.createContext(S);
  if (!opts.noAuthority) vm.runInContext(GS73, S, { filename: '73_.gs' });
  vm.runInContext(src, S, { filename: 'smoke-select.gs' });
  return S;
}

// One healthy row: every base, auto and effective present, every flag blank, currency supported.
function healthy(o) {
  var base = {
    base_currency: 'USD', currency: 'USD', fx_rate: 1, fx_rate_date: '2026-09-24',
    base_regular_price: 30, base_minimum_price: 15, base_msrp: 25,
    auto_regular_price: 30, auto_minimum_price: 15, auto_msrp: 25,
    regular_price: 31, minimum_price: 16, msrp: 26,
    price_status: 'active', updated_by: 'import', updated_at: '2026-09-01 00:00:00'
  };
  Object.keys(o).forEach(function (k) { base[k] = o[k]; });
  return decRow(base);
}
function activeMsku(id, o) {
  var b = { marketplace_sku_id: id, sku: 'SKU-' + id, company: 'KM', country: 'US',
    marketplace: 'amazon', site_sku: 'S-' + id, marketplace_sku_status: 'active' };
  Object.keys(o || {}).forEach(function (k) { b[k] = o[k]; });
  return mskuRow(b);
}

{
  // THE FOUR THAT SHOULD BE PICKED. Sorted by id, so A=MA, B=MB, C=MC — and D is MD because it is the
  // only row whose effective already equals its auto anywhere.
  var ROWS_OK = [
    healthy({ pricing_id: 'PA', marketplace_sku_id: 'MA', sku: 'SKU-MA', site_sku: 'S-MA',
      regular_price: 44.99, auto_regular_price: 42.31, minimum_price: 20, auto_minimum_price: 19,
      msrp: 30.49, auto_msrp: 29 }),
    healthy({ pricing_id: 'PB', marketplace_sku_id: 'MB', sku: 'SKU-MB', site_sku: 'S-MB',
      regular_price: 50, auto_regular_price: 49, minimum_price: 20, auto_minimum_price: 19,
      msrp: 30, auto_msrp: 29 }),
    healthy({ pricing_id: 'PC', marketplace_sku_id: 'MC', sku: 'SKU-MC', site_sku: 'S-MC',
      regular_price: 60, auto_regular_price: 59, minimum_price: 22, auto_minimum_price: 21,
      msrp: 30.49, auto_msrp: 29.49 }),
    // MD has BOTH its minimum and its msrp already equal to auto. Minimum must win: it is the least
    // customer-visible of the three, so if the equality check were ever wrong the blast radius is least.
    healthy({ pricing_id: 'PD', marketplace_sku_id: 'MD', sku: 'SKU-MD', site_sku: 'S-MD',
      regular_price: 70, auto_regular_price: 69, minimum_price: 25, auto_minimum_price: 25,
      msrp: 40, auto_msrp: 40 })
  ];
  // ONE ROW PER EXCLUSION RULE, each disqualified by exactly one thing.
  var ROWS_BAD = [
    healthy({ pricing_id: 'PX', marketplace_sku_id: 'MX' }),                              // no marketplace_skus row
    healthy({ pricing_id: 'PS', marketplace_sku_id: 'MS' }),                              // phasing_out
    healthy({ pricing_id: 'PZ', marketplace_sku_id: 'MZ' }),                              // two marketplace_skus rows
    healthy({ pricing_id: 'PF', marketplace_sku_id: 'MF', regular_price_is_manual: 'TRUE' }),
    healthy({ pricing_id: 'PK', marketplace_sku_id: 'MK', auto_msrp: '' }),               // blank auto
    healthy({ pricing_id: 'PP', marketplace_sku_id: 'MP', currency: 'JPY', regular_price: 1000.5 }),
    healthy({ pricing_id: 'PQ', marketplace_sku_id: 'MQ', currency: 'XYZ' }),             // unsupported currency
    healthy({ pricing_id: 'PU', marketplace_sku_id: 'MDUP' }),
    healthy({ pricing_id: 'PU2', marketplace_sku_id: 'MDUP' }),                           // duplicate identity
    healthy({ pricing_id: 'PN', marketplace_sku_id: '' })                                 // no identity at all
  ];
  var MSKUS = ['MA', 'MB', 'MC', 'MD', 'MF', 'MK', 'MDUP'].map(function (id) { return activeMsku(id); })
    .concat([activeMsku('MS', { marketplace_sku_status: 'phasing_out' }),
      activeMsku('MZ'), activeMsku('MZ'),
      // The odd-currency rows live in their own targets. A stray currency does not just disqualify its own
      // row — it makes its whole TARGET un-importable, which is asserted separately rather than here.
      activeMsku('MP', { country: 'JP', marketplace: 'rakuten' }),
      activeMsku('MQ', { country: 'XX', marketplace: 'other' })]);

  var w = smokeWorld(SEL, ROWS_OK.concat(ROWS_BAD), MSKUS);
  var r = w.TEMP_PRICING_R4_SMOKE_SELECT();

  // ---- the funnel: every rule fires, and says which one ----
  eq(w.__price.__headerWrites + w.__price.__dataWrites, 0, 'P1  the selector writes nothing');
  ok(/DB_WRITES                       = 0/.test(r), 'P1a  and says so');
  ok(/PRICING_ROWS_TOTAL              = 14/.test(r), 'P2  it read all fourteen rows');
  ['NO_MARKETPLACE_SKUS_ROW', 'NOT_ACTIVE_phasing_out', 'AMBIGUOUS_MARKETPLACE_SKUS_SOURCE',
   'AUTHORITY_ALREADY_STATED', 'BLANK_BASE_AUTO_OR_EFFECTIVE', 'EFFECTIVE_EXCEEDS_CURRENCY_PRECISION',
   'CURRENCY_UNSUPPORTED', 'DUPLICATE_IN_PRICING_LIST', 'IDENTITY_MISSING'].forEach(function (why) {
    ok(new RegExp('excluded ' + why + '\\s+\\d').test(r), 'P2a  the funnel names ' + why);
  });
  ok(/CANDIDATE_ROWS                  = 4/.test(r), 'P3  exactly the four healthy rows survive');

  // ---- §2: the four rows, and D chosen for the right reason ----
  ok(/SMOKE_ROW_A   \(regular MANUAL smoke\)[\s\S]*?marketplace_sku_id            = MA/.test(r), 'P4  row A is MA');
  ok(/SMOKE_ROW_B   \(minimum MANUAL smoke\)[\s\S]*?marketplace_sku_id            = MB/.test(r), 'P4a row B is MB');
  ok(/SMOKE_ROW_C   \(msrp MANUAL smoke\)[\s\S]*?marketplace_sku_id            = MC/.test(r), 'P4b row C is MC');
  ok(/SMOKE_ROW_D   \(AUTO restore\)[\s\S]*?marketplace_sku_id            = MD/.test(r), 'P4c row D is MD');

  // ONE TARGET FOR ALL FOUR. The bulk import is scoped to one country + marketplace, so four rows spread
  // across four targets would be four uploads and four chances to pick the wrong scope.
  ok(/SINGLE_SCOPE_SMOKE_AVAILABLE    = YES/.test(r), 'P4d all four cases come from one target');

  // EVERY REQUIRED LABEL, BY NAME.
  ['SMOKE_TARGET_COUNTRY', 'SMOKE_TARGET_MARKETPLACE', 'SMOKE_TARGET_CURRENCY',
   'TARGET_PRICING_ROW_COUNT', 'TARGET_CANDIDATE_ROW_COUNT', 'SINGLE_SCOPE_SMOKE_AVAILABLE',
   'MINIMUM_SCOPES_REQUIRED', 'WHY_THIS_TARGET', 'A_TEST_VALUE', 'B_TEST_VALUE', 'C_TEST_VALUE',
   'AUTO_SELECTED_FIELD', 'AUTO_EFFECTIVE_VALUE', 'AUTO_REFERENCE_VALUE', 'EFFECTIVE_EQUALS_AUTO',
   'ROW_D_EFFECTIVE_EQUALS_AUTO', 'PRICING_CHANGE_LOG_PRE_COUNT', 'SMOKE_PRE_SNAPSHOT_READY',
   'PRODUCTION_WRITE_AUTHORIZED'].forEach(function (name) {
    ok(new RegExp('(^|[\\n\\s])' + name + '\\s*=').test(r), 'P4r  the report answers ' + name + ' by name');
  });

  // THE TARGET'S OWN NUMBERS. Four good rows plus MDUP x2, MF, MK, MS, MZ all sit in US|amazon; MX has no
  // bridge row so it belongs to no target at all.
  ok(/SMOKE_TARGET_COUNTRY            = US/.test(r), 'P4j the country is named on its own line');
  ok(/SMOKE_TARGET_MARKETPLACE        = amazon/.test(r), 'P4k and the marketplace');
  ok(/SMOKE_TARGET_CURRENCY           = USD/.test(r), 'P4l and the currency, from the rows themselves');
  ok(/TARGET_PRICING_ROW_COUNT        = 10/.test(r),
    'P4m the target row count is every pricing row of the target, not only the healthy ones');
  ok(/TARGET_CANDIDATE_ROW_COUNT      = 4/.test(r), 'P4n beside the count that passed every guard');

  // WHY IT WON, stated rather than left to be inferred from a sort order nobody can see.
  ok(/WHY_THIS_TARGET                 = most qualifying rows, then name/.test(r), 'P4o the ranking rule is stated');
  ok(/1\. US\|amazon[\s\S]{0,80}<- selected/.test(r), 'P4p with the ranked list and which one was taken');
  ok(/SMOKE_SCOPE                     = US\|amazon/.test(r), 'P4e which is named');
  ok(/MINIMUM_SCOPES_REQUIRED         = 1/.test(r), 'P4f so the smoke is a single upload');
  eq((r.match(/TARGET \(upload scope\)\s+= US\|amazon/g) || []).length, 4,
    'P4g and every one of the four rows says it belongs to that target');
  ok(/--- UPLOAD 1 of 1   target US\|amazon ---/.test(r), 'P4h the template is one block');
  ok(/--- RESTORE UPLOAD 1 of 1   target US\|amazon ---/.test(r), 'P4i and so is the restore');
  ok(/AUTO_SELECTED_FIELD\s+= minimum_price/.test(r),
    'P5  and D tests the MINIMUM price — the least customer-visible field that qualifies');
  ok(/EFFECTIVE_EQUALS_AUTO\s+= YES/.test(r), 'P5a  with its effective already equal to its auto');
  ok(/ROW_D_EFFECTIVE_EQUALS_AUTO\s+= YES/.test(r), 'P5b  and again in the copyable required-output block');
  ok(/company                       = KM/.test(r), 'P6  company comes from marketplace_skus, which is where it lives');
  ok(/price_status\s+= .*reported only — never used as a filter/.test(r),
    'P7  price_status is reported and never filtered on — its default is still an open question');

  // ---- §3: the test value keeps the minor units ----
  ok(/A_TEST_VALUE\s+= 45\.99/.test(r), 'P8  44.99 + 1 = 45.99 — the .99 ending is kept, not invented');
  ok(/B_TEST_VALUE\s+= 21\b/.test(r), 'P8a 20 + 1 = 21 — and a round price does not acquire an ending');
  ok(/C_TEST_VALUE\s+= 31\.49/.test(r), 'P8b 30.49 + 1 = 31.49');
  // §2 asks for these per row, and the snapshot further down used to be the only place they appeared.
  ok(/pricing_id\s+= PA/.test(r), 'P8c  the per-row block carries pricing_id');
  ok(/base_regular_price\s+= 30/.test(r), 'P8d  the base prices, under their own column names');
  ok(/regular_price_is_manual\s+= \(blank = UNKNOWN\)/.test(r),
    'P8e  and a blank flag printed as what it MEANS — an empty space transcribes as FALSE');
  ok(/PRODUCTION_WRITE_AUTHORIZED\s+= NO/.test(r),
    'P8f  the tool states it authorises nothing, rather than leaving that to whoever writes the report');

  // ---- §3: the template rows themselves ----
  var tmpl = r.split('§3 — SMOKE_TEMPLATE_ROWS')[1].split('§8 —')[0];
  ok(/MA,SKU-MA,S-MA,KM,US,amazon,USD,MANUAL,45\.99,NO_CHANGE,,NO_CHANGE,/.test(tmpl), 'P9  row A asks for regular only');
  ok(/MB,SKU-MB,S-MB,KM,US,amazon,USD,NO_CHANGE,,MANUAL,21,NO_CHANGE,/.test(tmpl), 'P9a row B asks for minimum only');
  ok(/MC,SKU-MC,S-MC,KM,US,amazon,USD,NO_CHANGE,,NO_CHANGE,,MANUAL,31\.49/.test(tmpl), 'P9b row C asks for msrp only');
  ok(/MD,SKU-MD,S-MD,KM,US,amazon,USD,NO_CHANGE,,AUTO,,NO_CHANGE,/.test(tmpl), 'P9c row D asks for AUTO with an EMPTY value cell');

  // THE TEMPLATE ROWS MUST SURVIVE THE REAL PARSER AND THE REAL WRITER. Generating a file the import
  // then rejects is the one failure this tool exists to prevent, so the lines go through both.
  var SRP = require('../js/pages/sku-regional-pricing.js');
  var tl = tmpl.split(/\r?\n/);
  var start = 0;
  while (start < tl.length && tl[start].indexOf('marketplace_sku_id,master_sku') !== 0) start++;
  var block = [];
  for (var bi = start; bi < tl.length && tl[bi].trim() !== ''; bi++) block.push(tl[bi]);
  var fileText = block.join('\r\n');
  var parsed = SRP.validateFile(fileText);
  eq([parsed.ok, parsed.errors.length], [true, 0], 'P10 the generated file passes the real browser validator');
  var lines = parsed.lines.filter(SRP.lineTouches);
  eq(lines.length, 4, 'P10a and all four rows ask for something');
  ok(lines[3].minimum_price === undefined, 'P10b with AUTO carrying no value across the seam');

  // ---- §8: the restore rows carry the ORIGINAL values, and D has none ----
  var rest = r.split('§8 — RESTORE_TEMPLATE_ROWS')[1].split('§4 —')[0];
  ok(/MA,SKU-MA,S-MA,KM,US,amazon,USD,MANUAL,44\.99,/.test(rest), 'P11 the restore puts A back to 44.99, not to the test value');
  ok(/MANUAL,20,NO_CHANGE,/.test(rest), 'P11a and B back to 20');
  ok(/MANUAL,30\.49/.test(rest), 'P11b and C back to 30.49');
  ok(rest.indexOf('MD,') === -1, 'P11c row D has NO restore line — its price never moved');
  ok(/OWNERSHIP_RETURNED_TO_UNKNOWN = NO, by design/.test(rest), 'P11d and the limit is stated where the restore is');

  // ---- §4: the pre-snapshot ----
  var snap = r.split('§4 — SMOKE_PRE_SNAPSHOT')[1];
  ok(/pricing_id,marketplace_sku_id,currency,base_regular_price/.test(snap), 'P12 the snapshot carries the §4 columns in order');
  ok(/^PA,MA,USD,30,15,25,42\.31,19,29,44\.99,20,30\.49,,,,/m.test(snap),
    'P12a with base, auto, effective and three BLANK flags — blank being the UNKNOWN state');
  ok(/PRICING_CHANGE_LOG_PRE_COUNT\s+= 0/.test(r), 'P13 and the change-log baseline is counted, header excluded');
  ok(/CHANGE_LOG_PRE_COUNT\s+= 0/.test(r), 'P13b under the earlier name too, so an old report stays readable');
  ok(/SMOKE_PRE_SNAPSHOT_READY        = YES/.test(r), 'P13a four rows found, so the snapshot is complete');

  // ---- determinism: the pre-snapshot is only true if a re-run picks the same rows ----
  var r2 = smokeWorld(SEL, ROWS_OK.concat(ROWS_BAD), MSKUS).TEMP_PRICING_R4_SMOKE_SELECT();
  function ids(text) { return (text.match(/marketplace_sku_id            = \S+/g) || []).join('|'); }
  eq(ids(r2), ids(r), 'P14 a second run selects exactly the same four rows');

  // ---- the refusals ----
  var wNo = smokeWorld(SEL, ROWS_OK, MSKUS, { noAuthority: true });
  var rNo = wNo.TEMP_PRICING_R4_SMOKE_SELECT();
  ok(/AUTHORITY_NOT_LOADED/.test(rNo) && /BLOCKED/.test(rNo), 'P15 without 73_ it refuses rather than guessing precision');

  var wNone = smokeWorld(SEL, [healthy({ marketplace_sku_id: '' })], MSKUS);
  var rNone = wNone.TEMP_PRICING_R4_SMOKE_SELECT();
  ok(/CANDIDATE_ROWS                  = 0/.test(rNone) && /BLOCKED/.test(rNone), 'P16 no candidates is a BLOCK');
  ok(/which constraint to relax is an operator decision/.test(rNone),
    'P16a and it does not relax one of its own constraints to produce an answer');

  // NO ROW D AT ALL. A/B/C are still usable, and the runbook rule is repeated where it matters.
  var noEq = ROWS_OK.slice(0, 3).concat([
    healthy({ pricing_id: 'PD', marketplace_sku_id: 'MD', regular_price: 70, auto_regular_price: 69,
      minimum_price: 25, auto_minimum_price: 24, msrp: 40, auto_msrp: 39 })]);
  var rNoD = smokeWorld(SEL, noEq, MSKUS).TEMP_PRICING_R4_SMOKE_SELECT();
  ok(/SMOKE_ROW_D = NOT AVAILABLE/.test(rNoD), 'P17 with no equal-valued field anywhere, row D is refused');
  ok(/every[\s\S]{0,40}AUTO restore would MOVE a live price/.test(rNoD), 'P17a for the reason that matters');
  ok(/Rows A\/B\/C are unaffected/.test(rNoD), 'P17b while A, B and C stay usable');
  ok(/SMOKE_PRE_SNAPSHOT_READY        = NO/.test(rNoD), 'P17c and the run is not declared ready');

  // A ZERO-DECIMAL CURRENCY. The test value must stay an integer; a 0.01 delta would be refused at upload
  // as PRICE_PRECISION_UNSUPPORTED and the operator would find out at the Confirm step.
  function jpyRow(id, min, autoMin) {
    return healthy({ pricing_id: 'P' + id, marketplace_sku_id: id, currency: 'JPY', base_currency: 'USD',
      base_regular_price: 29.99, base_minimum_price: 24, base_msrp: 35,
      auto_regular_price: 4736, auto_minimum_price: autoMin, auto_msrp: 5527,
      regular_price: 4800, minimum_price: min, msrp: 5600 });
  }
  // Four rows so the target is completable; AJ4 is the AUTO-capable one. AJ sorts first, so it takes case A.
  var jpy = [jpyRow('AJ', 3800, 3789), jpyRow('AJ2', 3800, 3789), jpyRow('AJ3', 3800, 3789),
    jpyRow('AJ4', 3789, 3789)];
  var rJ = smokeWorld(SEL, jpy, ['AJ', 'AJ2', 'AJ3', 'AJ4'].map(function (id) {
    return activeMsku(id, { country: 'JP', marketplace: 'rakuten' }); })).TEMP_PRICING_R4_SMOKE_SELECT();
  ok(/currency                      = JPY   \(0 decimals\)/.test(rJ), 'P18 the currency precision is read from the deployed contract');
  ok(/A_TEST_VALUE\s+= 4801\b/.test(rJ), 'P18a and a 0-decimal currency gets a whole-number test value');
  ok(/SINGLE_SCOPE_SMOKE_AVAILABLE    = YES/.test(rJ), 'P18b and it is still a single-target smoke');

  // A STRAY CURRENCY POISONS ITS WHOLE TARGET, not just its own row. The bulk UI reads the target currency
  // over every row of the target, so one un-migrated row makes the screen refuse the upload — and a smoke
  // plan that pointed at that target would send the operator somewhere they cannot import.
  var poison = ROWS_OK.concat([healthy({ pricing_id: 'PJX', marketplace_sku_id: 'MJX', currency: 'JPY',
    regular_price: 4800, auto_regular_price: 4736, minimum_price: 3800, auto_minimum_price: 3789,
    msrp: 5600, auto_msrp: 5527 })]);
  var rP = smokeWorld(SEL, poison, MSKUS.concat([activeMsku('MJX')])).TEMP_PRICING_R4_SMOKE_SELECT();
  ok(/US\|amazon[\s\S]{0,60}currency=AMBIGUOUS/.test(rP), 'P19  one stray currency makes the whole target ambiguous');
  ok(/SINGLE_SCOPE_SMOKE_AVAILABLE    = NO/.test(rP), 'P19a so that target cannot host the smoke');

  // TWO COMPLETE TARGETS: the bigger one wins, and the ranking is a ranking so two runs cannot disagree.
  function famRow(id, cc, mk, cur, min, autoMin) {
    return healthy({ pricing_id: 'P' + id, marketplace_sku_id: id, currency: cur,
      regular_price: 50, auto_regular_price: 49, minimum_price: min, auto_minimum_price: autoMin,
      msrp: 30, auto_msrp: 29 });
  }
  var twoRows = [], twoMsk = [];
  ['A1', 'A2', 'A3', 'A4'].forEach(function (id, i) {
    twoRows.push(famRow(id, 'CA', 'amazon', 'CAD', i === 3 ? 25 : 20, 25));
    twoMsk.push(activeMsku(id, { country: 'CA', marketplace: 'amazon' }));
  });
  ['B1', 'B2', 'B3', 'B4', 'B5'].forEach(function (id, i) {
    twoRows.push(famRow(id, 'US', 'amazon', 'USD', i === 4 ? 25 : 20, 25));
    twoMsk.push(activeMsku(id, { country: 'US', marketplace: 'amazon' }));
  });
  var rT = smokeWorld(SEL, twoRows, twoMsk).TEMP_PRICING_R4_SMOKE_SELECT();
  ok(/SMOKE_SCOPE                     = US\|amazon/.test(rT),
    'P20  with two completable targets the one holding more healthy rows is chosen');
  ok(/2 target\(s\) could host all four cases\. Ranked:/.test(rT), 'P20a and the tool says how many it chose between');

  // NO SINGLE TARGET: the minimum number of uploads is reported, and the equality rule is not relaxed to
  // manufacture one.
  var splitRows = [], splitMsk = [];
  ['C1', 'C2', 'C3'].forEach(function (id, i) {
    splitRows.push(famRow(id, 'CA', 'amazon', 'CAD', i === 2 ? 25 : 20, 25));
    splitMsk.push(activeMsku(id, { country: 'CA', marketplace: 'amazon' }));
  });
  ['D1'].forEach(function (id) {
    splitRows.push(famRow(id, 'US', 'amazon', 'USD', 20, 19));
    splitMsk.push(activeMsku(id, { country: 'US', marketplace: 'amazon' }));
  });
  var rS = smokeWorld(SEL, splitRows, splitMsk).TEMP_PRICING_R4_SMOKE_SELECT();
  ok(/SINGLE_SCOPE_SMOKE_AVAILABLE    = NO/.test(rS), 'P21  three rows in one target and one in another is not a single-target smoke');
  ok(/MINIMUM_SCOPES_REQUIRED         = 2/.test(rS), 'P21a and two uploads is the minimum, computed rather than guessed');
  ok(/THE EQUALITY RULE IS NOT RELAXED/.test(rS), 'P21b with the equality rule explicitly not traded away for a tidier answer');
  ok(/--- UPLOAD 1 of 2/.test(rS) && /--- UPLOAD 2 of 2/.test(rS), 'P21c and the template comes as one block per upload');
  ok(/the AUTO case is here/.test(rS), 'P21d naming which target carries the constrained case');
  ok(/Scope 1:  CA \/ amazon/.test(rS) && /Scope 2:  US \/ amazon/.test(rS),
    'P21e the plan names each scope in the form the operator report asks for');
  // The AUTO case must sit in the scope that can host it, and that scope fills up first: CA takes A and B
  // alongside D, leaving C for the second upload. The mapping is the plan, so it is asserted exactly.
  ok(/hosts A, B, D/.test(rS), 'P21f and which cases each one hosts');
  ok(/hosts C\b/.test(rS), 'P21g including the scope that carries the single leftover case');

  // NOTHING AUTO-CAPABLE ANYWHERE is a different failure from "not in one target", and says so.
  var noAuto = [], noAutoMsk = [];
  ['E1', 'E2', 'E3', 'E4'].forEach(function (id) {
    noAuto.push(famRow(id, 'CA', 'amazon', 'CAD', 20, 19));
    noAutoMsk.push(activeMsku(id, { country: 'CA', marketplace: 'amazon' }));
  });
  var rN = smokeWorld(SEL, noAuto, noAutoMsk).TEMP_PRICING_R4_SMOKE_SELECT();
  ok(/MINIMUM_SCOPES_REQUIRED         = NOT ACHIEVABLE/.test(rN),
    'P22  with no AUTO-capable row anywhere, no number of uploads helps and the tool says so');
  ok(/SMOKE_ROW_D = NOT AVAILABLE/.test(rN), 'P22a and row D is still refused rather than approximated');
}

// =============================================================================================================
section('Q · MUTANTS FOR THE SMOKE SELECTOR');
// =============================================================================================================
// The probe returns TRUE when the mutant is CAUGHT: it asserts the BROKEN behaviour, never the correct one.
function smokeMutant(label, from, to, probe, rows, mskus) {
  if (SEL.indexOf(from) === -1) { fail++; console.error('FAIL ' + label + '   [anchor not found]'); return; }
  if (SEL.split(from).length - 1 !== 1) { fail++; console.error('FAIL ' + label + '   [anchor not unique]'); return; }
  var caught;
  try {
    var w = smokeWorld(SEL.replace(from, to), rows, mskus);
    caught = probe(w.TEMP_PRICING_R4_SMOKE_SELECT(), w);
  } catch (e) { caught = true; }
  if (caught) { mutCaught++; pass++; console.log('ok   ' + label + '  (mutant caught)'); }
  else { mutSurvived++; fail++; console.error('SURVIVED ' + label); }
}


{
  var QROWS = [
    healthy({ pricing_id: 'PA', marketplace_sku_id: 'MA', sku: 'SKU-MA', site_sku: 'S-MA',
      regular_price: 44.99, auto_regular_price: 42.31, minimum_price: 20, auto_minimum_price: 19,
      msrp: 30.49, auto_msrp: 29 }),
    healthy({ pricing_id: 'PB', marketplace_sku_id: 'MB', sku: 'SKU-MB', site_sku: 'S-MB',
      regular_price: 50, auto_regular_price: 49, minimum_price: 20, auto_minimum_price: 19,
      msrp: 30, auto_msrp: 29 }),
    healthy({ pricing_id: 'PC', marketplace_sku_id: 'MC', sku: 'SKU-MC', site_sku: 'S-MC',
      regular_price: 60, auto_regular_price: 59, minimum_price: 22, auto_minimum_price: 21,
      msrp: 30.49, auto_msrp: 29.49 }),
    healthy({ pricing_id: 'PD', marketplace_sku_id: 'MD', sku: 'SKU-MD', site_sku: 'S-MD',
      regular_price: 70, auto_regular_price: 69, minimum_price: 25, auto_minimum_price: 25,
      msrp: 40, auto_msrp: 40 }),
    healthy({ pricing_id: 'PF', marketplace_sku_id: 'MF', regular_price_is_manual: 'TRUE' }),
    healthy({ pricing_id: 'PP', marketplace_sku_id: 'MP', currency: 'JPY', regular_price: 1000.5 }),
    healthy({ pricing_id: 'PU', marketplace_sku_id: 'MDUP' }),
    healthy({ pricing_id: 'PU2', marketplace_sku_id: 'MDUP' })
  ];
  var QMSKUS = ['MA', 'MB', 'MC', 'MD', 'MF', 'MDUP'].map(function (id) { return activeMsku(id); })
    .concat([activeMsku('MP', { country: 'JP', marketplace: 'rakuten' })]);
  // The baseline must be a WORKING selection, or the probes below cannot tell a mutant from the fixture.
  ok(/SINGLE_SCOPE_SMOKE_AVAILABLE    = YES/.test(smokeWorld(SEL, QROWS, QMSKUS).TEMP_PRICING_R4_SMOKE_SELECT()),
    'Q0  the mutant baseline selects a complete single target, so a probe can tell the two apart');

  // Q1 — the AUTO row is chosen without checking the equality. It still LOOKS like a valid smoke row, and
  // uploading it would move a live price to a number nobody chose. This is the whole reason row D is
  // selected by a tool rather than by eye.
  smokeMutant('Q1  row D is chosen without the effective-equals-auto check',
    "if (ff.eff.value === ff.auto.value) return { row: rows[ci], field: PREF[pi] };",
    "if (true) return { row: rows[ci], field: PREF[pi] };",
    function (r) { return !/effective_equals_auto         = YES/.test(r); }, QROWS, QMSKUS);

  // Q2 — the duplicate-identity guard goes. Both rows of the pair become candidates, and a write aimed at
  // one of them is refused by the server anyway — after the pre-snapshot has been taken against the wrong
  // row.
  smokeMutant('Q2  a duplicated marketplace_sku_id is offered as a smoke row',
    "    if (pDupe[id]) return no('DUPLICATE_IN_PRICING_LIST');",
    "    if (false) return null;",
    function (r) { return !/excluded DUPLICATE_IN_PRICING_LIST/.test(r); }, QROWS, QMSKUS);

  // Q3 — the precision pre-check goes. Caught on the FUNNEL rather than on the selection, because a row
  // that sorts after the four picks would be masked by them: the mutant must be observable where it acts.
  smokeMutant('Q3  a price the currency cannot hold is no longer screened out',
    "    if (!precisionOk) return no('EFFECTIVE_EXCEEDS_CURRENCY_PRECISION');",
    "    if (false) return null;",
    function (r) { return !/excluded EFFECTIVE_EXCEEDS_CURRENCY_PRECISION/.test(r); }, QROWS, QMSKUS);

  // Q4 — a row that someone has already classified is offered for a smoke whose entire premise is that
  // the flags start blank.
  smokeMutant('Q4  a row already carrying authority is offered as a smoke row',
    "    if (!flagsClean) return no('AUTHORITY_ALREADY_STATED');",
    "    if (false) return null;",
    function (r) { return !/excluded AUTHORITY_ALREADY_STATED/.test(r); }, QROWS, QMSKUS);

  // Q5 — the test value is rounded to whole units regardless of currency. 44.99 becomes 46, which is a
  // real price change dressed as a test value, and the restore would not put back what was there.
  smokeMutant('Q5  the test value is rounded away from the currency precision',
    "    return Math.round(raw * fpow) / fpow;",
    "    return Math.round(raw);",
    function (r) { return !/TEST VALUE \(current \+ 1\)     = 45\.99/.test(r); }, QROWS, QMSKUS);

  // Q7 — a target that cannot host all four is treated as if it could. The report would claim a
  // single-target smoke while handing over rows from two targets, and the second upload would be refused
  // as ROW_OUTSIDE_TARGET after the operator had built the file.
  smokeMutant('Q7  an incomplete target is offered as a single-target smoke',
    "sc.complete = !!(sc.importable && sc.dRow && sc.rows.length >= 4);",
    "sc.complete = !!(sc.importable && sc.dRow);",
    function (r) { return !/SINGLE_SCOPE_SMOKE_AVAILABLE    = NO/.test(r); },
    [healthy({ pricing_id: 'PS1', marketplace_sku_id: 'S1', regular_price: 50, auto_regular_price: 49,
       minimum_price: 25, auto_minimum_price: 25, msrp: 30, auto_msrp: 29 }),
     healthy({ pricing_id: 'PS2', marketplace_sku_id: 'S2', regular_price: 50, auto_regular_price: 49,
       minimum_price: 20, auto_minimum_price: 19, msrp: 30, auto_msrp: 29 })],
    [activeMsku('S1'), activeMsku('S2')]);

  // Q6 — the restore file carries the TEST value instead of the original. The smoke would then be
  // irreversible in the one dimension the runbook promises is reversible.
  smokeMutant('Q6  the restore rows carry the test value instead of the original price',
    "restoreRows.push({ c: rowA, field: 'regular_price', value: rowA.f.regular_price.eff.value });",
    "restoreRows.push({ c: rowA, field: 'regular_price', value: testValue(rowA, 'regular_price') });",
    function (r) { var rest = r.split('§8 — RESTORE_TEMPLATE_ROWS')[1].split('§4 —')[0];
      return !/MANUAL,44\.99,/.test(rest); }, QROWS, QMSKUS);
}


// =============================================================================================================
section('G · THE TOOLS ARE NOT RELEASE FILES');
// =============================================================================================================
{
  var health = readN('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  ['TEMP_PRICING_R2_MIGRATION.gs', 'TEMP_PRICING_R3_PRODUCTION_CENSUS.gs',
    'TEMP_PRICING_R3_FX_DECOMPOSE.gs', 'TEMP_PRICING_R4_SMOKE_SELECT.gs'].forEach(function (f, i) {
    ok(health.indexOf(f) === -1, 'G' + (i + 1) + '  ' + f + ' has no manifest row — it is not an owner');
    ok(!fs.existsSync(path.join(ROOT, 'assets/specs/active/apps-script', f)),
      'G' + (i + 1) + 'a and does not sit in the deployed directory');
  });
  ok(/NOT part of any release/.test(MIG) && /NOT a release file/.test(CEN)
    && /NOT a release file/.test(DEC) && /NOT a release file/.test(SEL),
    'G3  and all four say so at the top, where an operator reads it');
  // They must not move the release identity either: a pasted tool is not a sync.
  ok(!/SYS_DEPLOYMENT_RELEASE_/.test(MIG) && !/SYS_DEPLOYMENT_RELEASE_/.test(CEN)
    && !/SYS_DEPLOYMENT_RELEASE_/.test(DEC) && !/SYS_DEPLOYMENT_RELEASE_/.test(SEL),
    'G4  none of them declares or touches the release identity');
}

// =============================================================================================================
console.log('\n' + pass + ' passed / ' + fail + ' failed   ·   ' + (mutCaught + mutSurvived) + ' mutants, ' + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
