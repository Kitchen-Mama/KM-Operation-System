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
    S.PRW_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R22';
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
section('G · THE TOOLS ARE NOT RELEASE FILES');
// =============================================================================================================
{
  var health = readN('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  ['TEMP_PRICING_R2_MIGRATION.gs', 'TEMP_PRICING_R3_PRODUCTION_CENSUS.gs'].forEach(function (f, i) {
    ok(health.indexOf(f) === -1, 'G' + (i + 1) + '  ' + f + ' has no manifest row — it is not an owner');
    ok(!fs.existsSync(path.join(ROOT, 'assets/specs/active/apps-script', f)),
      'G' + (i + 1) + 'a and does not sit in the deployed directory');
  });
  ok(/NOT part of any release/.test(MIG) && /NOT a release file/.test(CEN),
    'G3  and both say so at the top, where an operator reads it');
  // They must not move the release identity either: a pasted tool is not a sync.
  ok(!/SYS_DEPLOYMENT_RELEASE_/.test(MIG) && !/SYS_DEPLOYMENT_RELEASE_/.test(CEN),
    'G4  neither declares or touches the release identity');
}

// =============================================================================================================
console.log('\n' + pass + ' passed / ' + fail + ' failed   ·   ' + (mutCaught + mutSurvived) + ' mutants, ' + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
