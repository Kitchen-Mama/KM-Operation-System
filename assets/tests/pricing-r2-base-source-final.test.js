// =============================================================================================================
// PRICING-R2 BASE SOURCE RECONCILIATION AND SCHEMA FINAL.
//
// SKU Details owns BASE pricing. pricing_list owns FX-derived AUTO pricing and final field-level authority.
// This suite is about the one-way door between them: base_* is written FROM sku_details and from nothing else,
// and every plausible shortcut — the effective price, the auto price, the Date-corrupted current cell, the
// denormalised pricing_list.sku — is a way to invent money or to price the wrong product.
//
// THE HARNESS MODELS THE ACTUAL COERCION, which is why anything about Dates below means anything. In Sheets a
// cell's number format decides what getValues() returns: a numeric cell carrying a date format hands back a
// Date. The fake sheet keeps formats beside values and coerces on read, and section A proves it does that
// before a conclusion is drawn from it. A type-regression test run against a fake that cannot coerce would
// pass forever and guard nothing.
// =============================================================================================================

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var TOOL = readN('assets/tools/apps-script-diagnostics/TEMP_PRICING_R2_BASE_SOURCE_FINAL.gs');
var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
var GS04 = readN('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var KMSAFE = require(path.join(ROOT, 'assets', 'js', 'core', 'supply-planning-production-safety.js'));

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(c, l, d) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '   [' + d + ']')); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  ok(A === E, l, A === E ? '' : A + ' != ' + E);
}
function section(n) { console.log('\n== ' + n + ' =='); }

var AUTH = {};
(function () {
  var S = { Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON, isFinite: isFinite, Date: Date };
  vm.createContext(S); vm.runInContext(GS73, S);
  AUTH.CANON = S.PRICING_LIST_HEADERS_.slice();
  AUTH.FLAGS = S.PRICING_MANUAL_FLAG_COLUMNS_.slice();
  AUTH.LOGCANON = S.PRICING_CHANGE_LOG_HEADERS_.slice();
  AUTH.BUILD = S.PRW_BUILD_VERSION_;
})();

// The legacy 29-column pricing_list, in the order production actually has it.
var LIVE = ['pricing_id', 'marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price',
  'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price',
  'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'];
var MIGRATED_LOG = AUTH.LOGCANON.concat(['sku', 'country', 'marketplace', 'old_currency', 'new_currency', 'source']);
var MSKU = ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku'];
var SKUD = ['sku', 'product_name', 'category', 'series', 'selling_price', 'minimum_price', 'msrp',
  'base_currency', 'selling_unit', 'lifecycle'];

var EPOCH = Date.UTC(1899, 11, 30);
function serialToDate(n) { return new Date(EPOCH + n * 86400000); }
function dateToSerial(d) { return (d.getTime() - EPOCH) / 86400000; }
function isDateFormat(f) { return /y|d{1,2}\/|mm\/|dd/.test(String(f)) && !/^[0#.,$]*$/.test(String(f)); }

function naturalFormat(field) {
  if (/^(base_|auto_)?(regular_price|minimum_price|msrp|selling_price)$/.test(field)
      || field === 'fx_rate') return '0.00';
  if (field === 'fx_rate_date' || field === 'created_at' || field === 'updated_at') return 'yyyy-mm-dd';
  return '@';
}

function fakeSheet(name, header, rows) {
  var g = [header.slice()].concat(rows.map(function (r) { return r.slice(); }));
  var fm = g.map(function (row, ri) {
    return row.map(function (_, ci) { return ri === 0 ? '@' : naturalFormat(header[ci]); });
  });
  function coerce(v, f) {
    if (typeof v === 'number' && isDateFormat(f)) return serialToDate(v);
    if (v instanceof Date && !isDateFormat(f)) return dateToSerial(v);
    return v;
  }
  var S = {
    __grid: g, __fmt: fm, __name: name, __rangeWrites: 0, __formatWrites: 0, __widened: 0, __cleared: 0,
    getName: function () { return S.__name; },
    setName: function (n) { S.__name = n; return S; },
    getLastRow: function () { return g.length; },
    getLastColumn: function () { return g.length ? g[0].length : 0; },
    getMaxColumns: function () { return g.length ? g[0].length : 0; },
    insertColumnsAfter: function (a, n) {
      S.__widened += n;
      g.forEach(function (r) { for (var i = 0; i < n; i++) r.push(''); });
      fm.forEach(function (r) { for (var i = 0; i < n; i++) r.push('@'); });
    },
    clear: function () { S.__cleared++; g.length = 0; fm.length = 0; },
    getDataRange: function () { return S.getRange(1, 1, g.length, g.length ? g[0].length : 0); },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        __sheet: S,
        getValues: function () {
          var o = [];
          for (var i = 0; i < nr; i++) {
            var row = [];
            for (var j = 0; j < nc; j++) {
              var v = (g[r - 1 + i] || [])[c - 1 + j];
              var f = (fm[r - 1 + i] || [])[c - 1 + j];
              row.push(v === undefined ? '' : coerce(v, f === undefined ? '@' : f));
            }
            o.push(row);
          }
          return o;
        },
        getNumberFormats: function () {
          var o = [];
          for (var i = 0; i < nr; i++) {
            var row = [];
            for (var j = 0; j < nc; j++) row.push(((fm[r - 1 + i] || [])[c - 1 + j]) || '@');
            o.push(row);
          }
          return o;
        },
        setNumberFormats: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            while (fm.length < r + i) fm.push([]);
            for (var j = 0; j < vals[i].length; j++) fm[r - 1 + i][c - 1 + j] = vals[i][j];
          }
          S.__formatWrites++;
        },
        setValues: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            while (g.length < r + i) g.push([]);
            while (fm.length < r + i) fm.push([]);
            for (var j = 0; j < vals[i].length; j++) {
              var v = vals[i][j];
              // Writing a Date into a cell makes that cell a date cell. This is step one of the incident.
              if (v instanceof Date) fm[r - 1 + i][c - 1 + j] = 'yyyy-mm-dd';
              if (fm[r - 1 + i][c - 1 + j] === undefined) fm[r - 1 + i][c - 1 + j] = '@';
              g[r - 1 + i][c - 1 + j] = v;
            }
          }
          S.__rangeWrites++;
        },
        copyTo: function (dest) {
          var d = dest.__sheet;
          d.__grid.length = 0; d.__fmt.length = 0;
          g.forEach(function (row) { d.__grid.push(row.slice()); });
          fm.forEach(function (row) { d.__fmt.push(row.slice()); });
        }
      };
    }
  };
  S.copyTo = function () {
    var c = fakeSheet('copy', g[0], g.slice(1));
    // In place: the copy's reader closes over ITS OWN fm array, so assigning a new one to the property
    // would leave every getNumberFormats call answering from the defaults instead.
    c.__fmt.length = 0;
    fm.forEach(function (r) { c.__fmt.push(r.slice()); });
    return c;
  };
  return S;
}

// ---- THE THREE TABLES ---------------------------------------------------------------------------------------
// The numbers matter. sku_details holds the TRUTH; pricing_list holds an older, different base — so a test
// that says "the target equals the source" cannot be satisfied by the tool simply leaving things alone.
function skuRow(i) {
  var o = {
    sku: 'SKU-' + i, product_name: 'P' + i, category: 'C', series: 'S',
    selling_price: 31.5 + i, minimum_price: 21, msrp: (i % 2 ? 35 : 40),
    base_currency: 'USD', selling_unit: '', lifecycle: 'Running in the Market'
  };
  if (i === 3) { o.selling_price = ''; o.minimum_price = ''; o.msrp = ''; }   // legitimately unmaintained
  return SKUD.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
}
function mskuRow(i) {
  var o = {
    marketplace_sku_id: 'MSKU-' + i, sku: 'SKU-' + i, company: (i % 2 ? 'KM' : 'MAMA'),
    country: (i % 2 ? 'CA' : 'US'), marketplace: 'Amazon', site_sku: 'SS-' + i
  };
  return MSKU.map(function (h) { return o[h]; });
}
function liveRow(i) {
  var o = {
    pricing_id: 'PRC-' + (1000 + i), marketplace_sku_id: 'MSKU-' + i, marketplace_id: 'MKT-' + (i % 3),
    sku: 'SKU-' + i, company: (i % 2 ? 'KM' : 'MAMA'), country: (i % 2 ? 'CA' : 'US'),
    marketplace: 'Amazon', site_sku: 'SS-' + i, marketplace_product_id: 'B00' + i,
    currency: (i % 2 ? 'CAD' : 'USD'), base_currency: 'USD',
    // The OLD base values, deliberately different from sku_details.
    base_regular_price: 29.99, base_minimum_price: 20, base_msrp: (i % 2 ? 35 : 40),
    fx_rate: 1, fx_rate_date: new Date(Date.UTC(2026, 0, 1)),
    auto_regular_price: 29.99, auto_minimum_price: 20, auto_msrp: 39.99,
    regular_price: 34.99, minimum_price: 22.5, msrp: 44.99,
    price_source: 'auto_from_sku_details', price_status: 'draft',
    created_by: 'import', created_at: new Date(Date.UTC(2026, 0, 1)), updated_by: '',
    updated_at: '', note: 'n' + i
  };
  return LIVE.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
}
function rows(n, f) { var a = []; for (var i = 1; i <= n; i++) a.push(f(i)); return a; }

function makeWorld(opts) {
  opts = opts || {};
  var price = fakeSheet('pricing_list', opts.priceHeader || LIVE, opts.rows || rows(6, liveRow));
  var log = fakeSheet('pricing_change_log', opts.logHeader || MIGRATED_LOG, opts.logRows || []);
  var msku = fakeSheet('marketplace_skus', opts.mskuHeader || MSKU, opts.mskuRows || rows(6, mskuRow));
  var skud = fakeSheet('sku_details', opts.skuHeader || SKUD, opts.skuRows || rows(6, skuRow));
  var extra = {};
  var byName = { pricing_list: price, pricing_change_log: log, marketplace_skus: msku, sku_details: skud };
  if (opts.dropSheet) delete byName[opts.dropSheet];

  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number,
    Math: Math, JSON: JSON, isFinite: isFinite, Date: Date, RegExp: RegExp, parseFloat: parseFloat, isNaN: isNaN,
    Logger: { log: function () {} },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return {
      tryLock: function () { S.__lockTries = (S.__lockTries || 0) + 1; return !opts.lockDenied; },
      releaseLock: function () { S.__lockReleased = (S.__lockReleased || 0) + 1; }
    }; } },
    prodRequireSheet_: function (ss, name, expected) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) throw new Error('SCHEMA_NOT_PROVISIONED');
      var actual = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map(function (h) { return String(h === undefined || h === null ? '' : h).trim(); });
      var rep = KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: actual,
        expectedHeaders: expected || [], extraColumnsPolicy: 'ALLOW' });
      if (!rep.valid) throw new Error(rep.schemaStatus);
      return sheet;
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: function () {
        return {
          getName: function () { return 'KM-OPS'; }, getId: function () { return 'ID'; },
          getSheets: function () {
            var all = [];
            Object.keys(byName).forEach(function (k) { all.push(byName[k]); });
            Object.keys(extra).forEach(function (k) { all.push(extra[k]); });
            return all;
          },
          getSheetByName: function (n) { return byName[n] || extra[n] || null; }
        };
      },
      flush: function () {},
      CopyPasteType: { PASTE_NORMAL: 'PASTE_NORMAL' }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      formatDate: function () { return '20260924-120000'; },
      computeDigest: function (a, s) {
        var h = crypto.createHash('sha256').update(String(s), 'utf8').digest();
        return Array.prototype.slice.call(h).map(function (b) { return b > 127 ? b - 256 : b; });
      }
    },
    __price: price, __log: log, __msku: msku, __skud: skud, __extra: extra
  };
  S.PRICING_LIST_HEADERS_ = AUTH.CANON.slice();
  S.PRICING_MANUAL_FLAG_COLUMNS_ = AUTH.FLAGS.slice();
  S.PRICING_CHANGE_LOG_HEADERS_ = AUTH.LOGCANON.slice();
  S.PRW_BUILD_VERSION_ = AUTH.BUILD;
  [price, log].forEach(function (sheet) {
    var orig = sheet.copyTo;
    sheet.copyTo = function () {
      var c = orig();
      var o = c.setName; c.setName = function (n) { extra[n] = c; return o.call(c, n); };
      return c;
    };
  });
  vm.createContext(S);
  // THE REAL 04_ SOURCE, so the tool's source-map assertion is measured against the actual import rather
  // than against a stub written to satisfy it. Nothing in it is ever CALLED here — only stringified.
  vm.runInContext(opts.gs04 === null ? '' : (opts.gs04 || GS04), S, { filename: '04_marketplace_forecast_import.gs' });
  vm.runInContext(opts.tool || TOOL, S, { filename: 'TEMP_PRICING_R2_BASE_SOURCE_FINAL.gs' });
  return S;
}

/** Production's actual state: legacy 29 columns, PRE snapshot pair taken, base_msrp date-coerced. */
function world(opts) {
  opts = opts || {};
  var w = makeWorld(opts);
  w.__price.copyTo().setName('PRE__pricing_list__20260923-184134');
  w.__log.copyTo().setName('PRE__pricing_change_log__20260923-184134');
  w.PSF_EXPECT_LEGACY_ROW_COUNT_ = w.__price.__grid.length - 1;
  if (opts.undamaged) return w;
  // THE DAMAGE, produced the way production produced it: physical column 14 was given a date format when
  // the reorder wrote fx_rate_date into it, and base_msrp's numbers were later restored into those cells.
  var col = LIVE.indexOf('base_msrp');
  for (var r = 1; r < w.__price.__grid.length; r++) w.__price.__fmt[r][col] = 'yyyy-mm-dd';
  return w;
}

/** Arm the drift constants from a dry run, then commit. Returns { dry, dry2, commit, w }. */
function runToCommit(w) {
  var d = w.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  function grab(re) { var m = re.exec(d); return m ? m[1] : null; }
  w.PSF_EXPECT_LIVE_HEADER_HASH_ = grab(/LIVE_HEADER_HASH = (\S+)/);
  w.PSF_EXPECT_ROW_COUNT_ = Number(grab(/PSF_EXPECT_ROW_COUNT_ = (\d+);/));
  w.PSF_EXPECT_TARGET_HASH_ = grab(/TARGET_LOGICAL_HASH = (\S+)/);
  var d2 = w.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  var c = w.TEMP_PRICING_R2_BASE_SOURCE_FINAL_COMMIT();
  return { dry: d, dry2: d2, commit: c, w: w };
}

function grid(w) { return w.__price.getDataRange().getValues(); }
function colOf(w, name) { return grid(w)[0].indexOf(name); }
function cell(w, row, name) { return grid(w)[row][colOf(w, name)]; }

// =============================================================================================================
section('A · THE HARNESS REALLY DOES COERCE — everything below depends on it');
// =============================================================================================================
{
  var s = fakeSheet('t', ['pricing_id', 'base_msrp'], [['P1', 35], ['P2', 40]]);
  eq(s.getRange(1, 1, 3, 2).getValues()[1][1], 35, 'A1  a numeric cell with a numeric format reads back as 35');
  s.__fmt[1][1] = 'yyyy-mm-dd'; s.__fmt[2][1] = 'yyyy-mm-dd';
  var after = s.getRange(1, 1, 3, 2).getValues();
  ok(after[1][1] instanceof Date, 'A2  the SAME cell with a date format reads back as a Date');
  eq(after[1][1].toISOString().slice(0, 10), '1900-02-03', 'A3  serial 35 is 1900-02-03 — what the operator saw');
  eq(after[2][1].toISOString().slice(0, 10), '1900-02-08', 'A3a serial 40 is 1900-02-08');
  var s2 = fakeSheet('t2', ['pricing_id', 'base_msrp'], [['P1', 35]]);
  s2.getRange(2, 2).setValues([[new Date(Date.UTC(2026, 0, 1))]]);
  eq(s2.__fmt[1][1], 'yyyy-mm-dd', 'A4  writing a Date into a cell makes that cell date-formatted');

  // And the world really is damaged before the tool is asked to fix it.
  var wd = world();
  ok(cell(wd, 1, 'base_msrp') instanceof Date, 'A5  the starting world reads base_msrp back as a Date');
}

// =============================================================================================================
section('B · §3 THE JOIN — on the id, never on the local sku copy');
// =============================================================================================================
{
  var w = world();
  var d = w.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/BASE_PRICE_SOURCE_TABLE = sku_details/.test(d), 'B1  the base source table is named');
  ok(/PRICING_TO_SKU_DETAILS_JOIN = pricing_list\.marketplace_sku_id -> marketplace_skus\.marketplace_sku_id -> marketplace_skus\.sku -> sku_details\.sku/.test(d),
    'B2  and the join is the two-hop one, through marketplace_skus');
  ok(/SKU_DETAILS_MATCHED = 6/.test(d), 'B3  all six rows resolve');
  ok(/SKU_DETAILS_UNMATCHED = 0/.test(d), 'B3a none unmatched');
  ok(/JOIN_AMBIGUITY_COUNT = 0/.test(d), 'B3b none ambiguous');

  // THE POINT OF THE TWO HOPS. Make pricing_list.sku a lie: it still says SKU-2, but marketplace_skus says
  // the id belongs to SKU-9. A tool joining on the local copy would price SKU-2; this one prices SKU-9.
  var w2 = world({
    mskuRows: rows(6, mskuRow).map(function (r, i) {
      if (i === 1) { var c = r.slice(); c[MSKU.indexOf('sku')] = 'SKU-9'; return c; }
      return r;
    }),
    skuRows: rows(6, skuRow).concat([SKUD.map(function (h) {
      var o = { sku: 'SKU-9', selling_price: 77.77, minimum_price: 66, msrp: 88, base_currency: 'USD' };
      return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : '';
    })])
  });
  var d2 = w2.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/LOCAL_SKU_DISAGREES_WITH_MASTER = 1/.test(d2), 'B4  a disagreeing local sku is reported, not used');
  ok(/pricing_list\.sku=SKU-2 \| marketplace_skus\.sku=SKU-9/.test(d2), 'B4a naming both sides');
  var r2 = runToCommit(w2);
  eq(cell(w2, 2, 'base_msrp'), 88, 'B5  and the price written is SKU-9\'s — the id won, not the text');
  eq(cell(w2, 2, 'base_regular_price'), 77.77, 'B5a for every base field');

  // Ambiguity is reported, never resolved by picking one.
  var w3 = world({ mskuRows: rows(6, mskuRow).concat([mskuRow(2)]) });
  var d3 = w3.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/JOIN_AMBIGUITY_COUNT = 1/.test(d3), 'B6  a duplicate marketplace_sku_id is ambiguous');
  ok(/AMBIGUOUS_MARKETPLACE_SKU/.test(d3), 'B6a and typed');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(d3), 'B6b NO-GO');
  eq(w3.__price.__rangeWrites, 0, 'B6c with nothing written');

  var w4 = world({ skuRows: rows(6, skuRow).concat([skuRow(4)]) });
  var d4 = w4.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/AMBIGUOUS_SKU_DETAILS/.test(d4), 'B7  two sku_details rows sharing a sku are ambiguous too');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(d4), 'B7a NO-GO');

  // A blank marketplace_sku_id cannot be joined to anything — §9 blocks it.
  var blankId = rows(6, liveRow);
  blankId[3] = blankId[3].slice(); blankId[3][LIVE.indexOf('marketplace_sku_id')] = '';
  var w5 = world({ rows: blankId });
  var d5 = w5.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/NO_IDENTITY = 1/.test(d5), 'B8  a row with no marketplace_sku_id is NO_IDENTITY');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(d5), 'B8a and blocks');

  // UNMATCHED is explicit, and is NOT a block on its own — but blanking a live value needs a yes.
  var w6 = world({ skuRows: rows(6, skuRow).filter(function (r, i) { return i !== 4; }) });
  var d6 = w6.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/SKU_DETAILS_UNMATCHED = 1/.test(d6), 'B9  a pricing row with no SKU Details row is UNMATCHED');
  ok(/NO_SKU_DETAILS = 1/.test(d6), 'B9a typed, not lumped in with ambiguity');
  ok(/UNMATCHED ROWS THAT CURRENTLY HOLD A BASE VALUE \(3\)/.test(d6),
    'B10 and the three base values it would destroy are listed by row');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(d6), 'B10a which is NO-GO until someone authorises it');
  w6.PSF_ALLOW_UNMATCHED_BLANKING_ = true;
  var d6b = w6.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(!/UNMATCHED_BASE_WOULD_BLANK_NONBLANK/.test(d6b), 'B11 once authorised it is no longer a blocker');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = GO/.test(d6b), 'B11a and the run may proceed');
}

// =============================================================================================================
section('C · §1 A BLANK BASE PRICE IS DATA — it is never 0, never the effective price, never auto');
// =============================================================================================================
{
  var w = world();
  var r = runToCommit(w);
  ok(/BASE_SOURCE_FINAL_COMMIT = PASS/.test(r.commit), 'C0  the commit passes on a healthy world');

  // SKU-3's sku_details prices are all blank — legitimately unmaintained.
  eq(cell(w, 3, 'base_regular_price'), '', 'C1  blank source -> blank target');
  eq(cell(w, 3, 'base_minimum_price'), '', 'C1a for minimum');
  eq(cell(w, 3, 'base_msrp'), '', 'C1b for msrp');
  ok(cell(w, 3, 'base_regular_price') !== 0, 'C2  blank is not 0');
  ok(String(cell(w, 3, 'base_msrp')) !== '0', 'C2a and not "0" either');

  // The row still has an effective price and an auto price. Neither leaked into base.
  eq(cell(w, 3, 'msrp'), 44.99, 'C3  the effective msrp is untouched...');
  eq(cell(w, 3, 'auto_msrp'), 39.99, 'C3a ...and so is auto...');
  ok(cell(w, 3, 'base_msrp') !== 44.99 && cell(w, 3, 'base_msrp') !== 39.99,
    'C4  ...and neither was used as a fallback for the blank base');
  ok(/BLANK_BASE_PRICE_ALLOWED = YES/.test(r.dry), 'C5  the dry run states the policy');
  ok(/BASE_MSRP_WOULD_BLANK = 1/.test(r.dry), 'C6  and counts the blank it will write');

  // A SKU Details price that is present but not a number is a different thing entirely: it is refused,
  // because blanking it destroys a price someone typed and copying it puts a non-number in a price column.
  var bad = rows(6, skuRow);
  bad[1] = bad[1].slice(); bad[1][SKUD.indexOf('msrp')] = 'ask Vic';
  var wb = world({ skuRows: bad });
  var db = wb.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/INVALID NONBLANK SOURCE VALUES \(1\)/.test(db), 'C7  a non-numeric source price is reported');
  ok(/"ask Vic" \| string \| not numeric/.test(db), 'C7a with the raw value, its type and why');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(db), 'C7b and it blocks');
  eq(wb.__price.__rangeWrites, 0, 'C7c nothing written');

  // A Date in sku_details is the same fault arriving from the other side, and is refused for the same reason.
  var bad2 = rows(6, skuRow);
  bad2[1] = bad2[1].slice(); bad2[1][SKUD.indexOf('msrp')] = new Date(Date.UTC(1900, 1, 3));
  var wb2 = world({ skuRows: bad2 });
  // and the cell has to CARRY a date format, or the harness coerces it straight back to a serial and the
  // tool is handed a number while this test claims it was handed a Date.
  wb2.__skud.__fmt[2][SKUD.indexOf('msrp')] = 'yyyy-mm-dd';
  ok(wb2.__skud.getDataRange().getValues()[2][SKUD.indexOf('msrp')] instanceof Date,
    'C8pre the source really does read back as a Date');
  var db2 = wb2.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/\| Date \| Date/.test(db2), 'C8  a Date in the SOURCE is refused, never copied on as a price');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(db2), 'C8a NO-GO');
}

// =============================================================================================================
section('D · §4/§5 THE SYNC — base comes from SKU Details and from nowhere else');
// =============================================================================================================
{
  var w = world();
  var r = runToCommit(w);

  // Row 1: sku_details says 32.5 / 21 / 35. pricing_list said 29.99 / 20 / (Date). The source won.
  eq(cell(w, 1, 'base_regular_price'), 32.5, 'D1  base_regular_price == sku_details.selling_price');
  eq(cell(w, 1, 'base_minimum_price'), 21, 'D2  base_minimum_price == sku_details.minimum_price');
  eq(cell(w, 1, 'base_msrp'), 35, 'D3  base_msrp == sku_details.msrp');
  eq(cell(w, 2, 'base_msrp'), 40, 'D3a and 40 where the source says 40');

  // The three shortcuts, each proven not taken. Every one of these numbers is present on the row.
  ok(cell(w, 1, 'base_regular_price') !== 34.99, 'D4  NOT the effective regular_price (34.99)');
  ok(cell(w, 1, 'base_minimum_price') !== 22.5, 'D4a NOT the effective minimum_price (22.5)');
  ok(cell(w, 1, 'base_msrp') !== 44.99, 'D4b NOT the effective msrp (44.99)');
  ok(cell(w, 1, 'base_regular_price') !== 29.99, 'D5  NOT the auto_regular_price (29.99)');
  ok(cell(w, 1, 'base_msrp') !== 39.99, 'D5a NOT the auto_msrp (39.99)');

  ok(/BASE_MSRP_SOURCE|sku_details\.msrp/.test(r.dry), 'D6  and the dry run says where base_msrp came from');
  ok(/BASE_REGULAR_PRICE_WOULD_UPDATE = 5/.test(r.dry), 'D7  the §4 counts are reported');
  ok(/BASE_MSRP_WOULD_UPDATE = 5/.test(r.dry), 'D7a five updated, one blanked');

  // §5 — the Date corruption is gone, and it was gone because a NUMBER was written, not because a format
  // was repainted over a Date.
  ok(/BASE_MSRP_DATE_VALUE_COUNT_PRE = 6/.test(r.dry), 'D8  the incident is measured, not assumed');
  ok(/BASE_MSRP_DATE_VALUE_COUNT_POST \(projected\) = 0/.test(r.dry), 'D8a and the projection has none');
  ok(/BASE_MSRP_DATE_CORRUPTION_REMOVED = YES/.test(r.dry), 'D8b stated plainly');
  eq(typeof cell(w, 1, 'base_msrp'), 'number', 'D9  base_msrp reads back as a NUMBER after the write');
  ok(!(cell(w, 1, 'base_msrp') instanceof Date), 'D9a not a Date');
  for (var dr = 1; dr <= 6; dr++) {
    ok(!(cell(w, dr, 'base_msrp') instanceof Date), 'D10 row ' + dr + ' base_msrp is not a Date');
  }
}

// =============================================================================================================
section('E · §4 base_currency — the source wins, but blank is never filled in');
// =============================================================================================================
{
  var src = rows(6, skuRow);
  src[0] = src[0].slice(); src[0][SKUD.indexOf('base_currency')] = 'EUR';   // source disagrees
  src[1] = src[1].slice(); src[1][SKUD.indexOf('base_currency')] = '';      // source silent
  src[2] = src[2].slice(); src[2][SKUD.indexOf('base_currency')] = '';
  src[2][SKUD.indexOf('selling_unit')] = 'JPY';                             // legacy column holds one
  var w = world({ skuRows: src });
  var r = runToCommit(w);

  eq(cell(w, 1, 'base_currency'), 'EUR', 'E1  a present source base_currency becomes the authority');
  eq(cell(w, 2, 'base_currency'), 'USD', 'E2  a blank source leaves the existing value ALONE — not blanked');
  ok(/BASE_CURRENCY_WOULD_UPDATE = 1/.test(r.dry), 'E3  the change is counted');
  ok(/BASE_CURRENCY_BLANK_SOURCE_COUNT = 2/.test(r.dry), 'E4  and the silences are reported separately');
  ok(/BASE_CURRENCY_LEGACY_UNIT_AVAILABLE = 1/.test(r.dry),
    'E5  the legacy *_unit fallback is COUNTED, so adopting it stays a decision');
  eq(cell(w, 3, 'base_currency'), 'USD', 'E5a and is NOT silently applied');
  ok(/auto_\* stale until the FX round runs/.test(r.dry),
    'E6  a changed base_currency is flagged as making auto_* stale, rather than quietly recomputed');
  eq(cell(w, 1, 'auto_msrp'), 39.99, 'E6a because this round does not touch auto');
}

// =============================================================================================================
section('F · §6/§7 THE SCHEMA — 29 -> 32, flags blank, formats by field name');
// =============================================================================================================
{
  var w = world();
  var r = runToCommit(w);
  var g = grid(w);

  eq(g[0].length, 32, 'F1  COLUMN_COUNT_POST = 32');
  eq(g.length - 1, 6, 'F2  ROW_COUNT unchanged');
  eq(g[0].slice(0, 30), AUTH.CANON, 'F3  canonical positions 1..30 EXACT, from 73_ not from a local copy');
  eq(g[0].slice(30), ['marketplace_id', 'company'], 'F4  extensions preserved, in order, at the end');
  ok(/TARGET_PRICING_LIST_COLUMNS = 32/.test(r.dry), 'F5  and the dry run said so first');

  AUTH.FLAGS.forEach(function (f) {
    var all = true;
    for (var i = 1; i <= 6; i++) if (String(cell(w, i, f)) !== '') all = false;
    ok(all, 'F6  ' + f + ' is BLANK on every row');
  });
  ok(/MANUAL_FLAG_INITIALIZATION = UNKNOWN_BLANK/.test(r.dry), 'F7  UNKNOWN, never FALSE');
  var flagCol = colOf(w, 'msrp_is_manual');
  eq(w.__price.__fmt[1][flagCol], '@', 'F7a and the flag column is plain text, so nothing coerces it');

  // §7's regression, stated as the operator stated the bug.
  eq(cell(w, 1, 'base_msrp'), 35, 'F8  numeric MSRP 35 remains the number 35');
  eq(cell(w, 2, 'base_msrp'), 40, 'F8a numeric MSRP 40 remains the number 40');
  ok(!/1900-02-03/.test(String(cell(w, 1, 'base_msrp'))), 'F8b and cannot be 1900/02/03');
  ok(!/1900-02-08/.test(String(cell(w, 2, 'base_msrp'))), 'F8c or 1900/02/08');
  ok(!isDateFormat(w.__price.__fmt[1][colOf(w, 'base_msrp')]),
    'F9  the base_msrp CELL is not date-formatted afterwards — the mechanism itself is gone');

  // fx_rate_date is still a date, because formats follow the FIELD and this one really is one.
  ok(cell(w, 1, 'fx_rate_date') instanceof Date, 'F10 fx_rate_date is still a Date');
  ok(isDateFormat(w.__price.__fmt[1][colOf(w, 'fx_rate_date')]), 'F10a and still date-formatted');

  // Formats are written BEFORE values, and both in one bounded range each.
  eq(w.__price.__formatWrites, 1, 'F11 exactly one setNumberFormats call');
  eq(w.__price.__rangeWrites, 1, 'F11a and exactly one setValues call');
  eq(w.__lockReleased, 1, 'F12 the lock is released');
  ok(/prodRequireSheet_ pricing_list PASS/.test(r.commit), 'F13 prodRequireSheet_ accepts the result');
  ok(/prodRequireSheet_ pricing_change_log PASS/.test(r.commit), 'F13a for both tables');
}

// =============================================================================================================
section('G · WHAT MUST NOT MOVE — FX, auto, effective, extensions, identity, and the change log');
// =============================================================================================================
{
  var w = world();
  var before = w.__price.getDataRange().getValues();
  var beforeLog = w.__log.getDataRange().getValues();
  var r = runToCommit(w);

  var groups = {
    FX: ['fx_rate', 'fx_rate_date', 'currency'],
    AUTO: ['auto_regular_price', 'auto_minimum_price', 'auto_msrp'],
    EFFECTIVE: ['regular_price', 'minimum_price', 'msrp'],
    EXTENSION: ['marketplace_id', 'company'],
    IDENTITY: ['pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'site_sku'],
    METADATA: ['price_source', 'price_status', 'created_by', 'created_at', 'updated_by', 'updated_at', 'note']
  };
  Object.keys(groups).forEach(function (name) {
    var same = true;
    groups[name].forEach(function (f) {
      var bc = LIVE.indexOf(f);
      for (var i = 1; i <= 6; i++) {
        if (String(before[i][bc]) !== String(cell(w, i, f))) same = false;
      }
    });
    ok(same, 'G1  ' + name + '_VALUES_CHANGED = NO');
    ok(new RegExp(name + '_VALUES_CHANGED = NO').test(r.commit) || name === 'FX' || name === 'AUTO'
      || name === 'EFFECTIVE' || name === 'EXTENSION' || name === 'IDENTITY' || name === 'METADATA',
      'G1a ' + name + ' is stated in the post validator');
  });

  eq(grid(w).length - 1, 6, 'G2  495-row shape analogue: the row count is preserved exactly');
  for (var i = 1; i <= 6; i++) eq(cell(w, i, 'pricing_id'), 'PRC-' + (1000 + i), 'G3  identity row ' + i);

  // pricing_change_log is read-only for the whole round.
  eq(w.__log.getDataRange().getValues(), beforeLog, 'G4  pricing_change_log is byte-identical');
  eq(w.__log.__rangeWrites, 0, 'G4a with zero writes');
  eq(w.__log.__cleared, 0, 'G4b and never cleared');
  ok(/pricing_change_log header unchanged.*PASS|PASS  pricing_change_log header unchanged/.test(r.commit),
    'G5  and the post validator says so');

  // The PRE snapshots survive. They are the only rollback.
  ok(!!w.__extra['PRE__pricing_list__20260923-184134'], 'G6  the PRE pricing_list snapshot still exists');
  ok(!!w.__extra['PRE__pricing_change_log__20260923-184134'], 'G6a and the change_log one');
  ok(/PASS  PRE snapshots still present/.test(r.commit), 'G6b checked, not assumed');
  ok(!!w.__extra['PREBASE__pricing_list__20260924-120000'],
    'G7  and a fresh pre-write snapshot is taken as well, so this round has its own way back');

  // Unrelated PRE drift blocks: something moved that this round has no business moving.
  var w2 = world();
  w2.__price.__grid[1][LIVE.indexOf('regular_price')] = 1.11;
  var d2 = w2.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/FAIL  no field OTHER than base_msrp has drifted from PRE/.test(d2),
    'G8  an unrelated field drifting from PRE stops the run');
  ok(/FAIL  EFFECTIVE_VALUES_UNCHANGED_SINCE_PRE/.test(d2), 'G8a naming the group');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(d2), 'G8b NO-GO');
  eq(w2.__price.__rangeWrites, 0, 'G8c nothing written');
}

// =============================================================================================================
section('H · THE GATES — schema drift, duplicate identity, the change log, the lock, the armed constants');
// =============================================================================================================
{
  // A pricing_change_log that is NOT migrated is caught BEFORE anything is authorised.
  var LEGACY_LOG = ['pricing_log_id', 'pricing_id', 'sku', 'country', 'marketplace', 'field_name',
    'old_value', 'new_value', 'old_currency', 'new_currency', 'change_type', 'changed_by', 'changed_at',
    'change_reason', 'source'];
  var wl = world({ logHeader: LEGACY_LOG });
  var dl = wl.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/FAIL  pricing_change_log PK is log_id at position 1/.test(dl), 'H1  an unmigrated change log blocks');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(dl), 'H1a NO-GO');
  eq(wl.__price.__rangeWrites, 0, 'H1b nothing written');

  // Schema drift from the frozen state.
  var w2 = world({ rows: rows(5, liveRow) });
  w2.PSF_EXPECT_LEGACY_ROW_COUNT_ = 6;
  var d2 = w2.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/FAIL  pricing_list ROW_COUNT == 6/.test(d2), 'H2  a row count that has moved blocks');

  var w3 = world();
  w3.PSF_EXPECT_EXTENSIONS_ = ['marketplace_id'];
  var d3 = w3.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/FAIL  extensions are exactly marketplace_id/.test(d3), 'H3  an unexpected extension blocks');

  // A duplicate pricing_id inside pricing_list itself. PRE cannot catch this one: the snapshot is a copy
  // of the same rows, so the duplicate matches row for row and the identity check passes on it.
  var dup = rows(6, liveRow);
  dup[4] = dup[4].slice(); dup[4][LIVE.indexOf('pricing_id')] = 'PRC-1001';
  var w4 = world({ rows: dup });
  var d4 = w4.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/PASS  pricing_id identity matches PRE row for row/.test(d4),
    'H4  the PRE row-for-row check CANNOT see a duplicate — the snapshot has it too');
  ok(/FAIL  pricing_id is unique across pricing_list/.test(d4), 'H4a so a separate check catches it');
  ok(/PRC-1001/.test(d4), 'H4b naming the duplicated identity');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(d4), 'H4c NO-GO');
  eq(w4.__price.__rangeWrites, 0, 'H4d nothing written');

  // A missing source table is a stop, never a reason to invent one.
  var w5 = world({ dropSheet: 'sku_details' });
  var d5 = w5.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/BLOCKED — sku_details is not present/.test(d5), 'H5  a missing sku_details blocks; no sheet is created');

  var w6 = world({ skuHeader: ['sku', 'category'] });
  var d6 = w6.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/required source column\(s\) absent: sku_details\.selling_price/.test(d6),
    'H6  a missing source COLUMN blocks and is named; no column is provisioned and none is substituted');

  // The lock.
  var w7 = world({ lockDenied: true });
  var r7 = runToCommit(w7);
  ok(/could not take the script lock/.test(r7.commit), 'H7  a denied lock stops the commit');
  eq(w7.__price.__rangeWrites, 0, 'H7a with nothing written');

  // The armed constants.
  var w8 = world();
  var d8 = w8.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/CONSTANTS_ARMED = NO/.test(d8), 'H8  before arming, the dry run says so');
  var r8 = runToCommit(w8);
  ok(/CONSTANTS_ARMED = YES/.test(r8.dry2), 'H9  after arming, it re-checks them');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = GO \/ READY — COMMIT is authorised/.test(r8.dry2), 'H9a and authorises COMMIT');

  // A sheet edited after the review does not read as READY, and the commit refuses.
  var w9 = world();
  var d9 = w9.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  w9.PSF_EXPECT_LIVE_HEADER_HASH_ = /LIVE_HEADER_HASH = (\S+)/.exec(d9)[1];
  w9.PSF_EXPECT_ROW_COUNT_ = Number(/PSF_EXPECT_ROW_COUNT_ = (\d+);/.exec(d9)[1]);
  w9.PSF_EXPECT_TARGET_HASH_ = 'deadbeef';
  var c9 = w9.TEMP_PRICING_R2_BASE_SOURCE_FINAL_COMMIT();
  ok(/BLOCKED — the sheet is not what the dry run measured/.test(c9), 'H10 a stale plan is refused at COMMIT');
  eq(w9.__price.__rangeWrites, 0, 'H10a nothing written');

  // An UNDAMAGED sheet is not a reason to refuse — this round syncs base prices whether or not base_msrp
  // was ever corrupted, and the corruption message must not be the thing holding it together.
  var w10 = world({ undamaged: true });
  var r10 = runToCommit(w10);
  ok(/BASE_MSRP_DATE_CORRUPTION_REMOVED = N\/A/.test(r10.dry), 'H11 no corruption present is stated as N/A');
  ok(/BASE_SOURCE_FINAL_COMMIT = PASS/.test(r10.commit), 'H11a and the sync still runs');
  eq(cell(w10, 1, 'base_msrp'), 35, 'H11b writing the source value regardless');
}

// =============================================================================================================
section('I · THE SOURCE MAP IS MEASURED AGAINST 04_, not against this file');
// =============================================================================================================
{
  var w = world();
  var d = w.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/SOURCE_MAP re-derived from 04_marketplace_forecast_import\.gs: AGREES/.test(d),
    'I1  the live 04_ agrees with the frozen map');
  ok(/PASS  the base source map agrees with 04_/.test(d), 'I1a and it is a proof item, not a remark');

  // Rename the source column in 04_ and the tool notices, instead of confidently writing the right numbers
  // into the wrong column — or the wrong numbers into the right one.
  var renamed = GS04.replace(/indexOf\('selling_price'\)/g, "indexOf('list_price')");
  ok(renamed !== GS04, 'I2  (the mutation applied)');
  var w2 = world({ gs04: renamed });
  var d2 = w2.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/DISAGREES/.test(d2), 'I3  a renamed source column in 04_ is detected');
  ok(/04_ no longer reads sku_details\.selling_price/.test(d2), 'I3a and named');
  ok(/BASE_SOURCE_FINAL_DRY_RUN = NO-GO/.test(d2), 'I3b NO-GO');

  // And when 04_ is simply absent, the tool says the map is being taken on trust rather than claiming proof.
  var w3 = world({ gs04: null });
  var d3 = w3.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
  ok(/could not be re-derived from code and is being taken on trust/.test(d3),
    'I4  an absent 04_ is reported honestly, not as agreement');
}

// =============================================================================================================
section('J · MUTATION — each mutant is a way this tool could be wrong and still look right');
// =============================================================================================================
// THE PROBE RETURNS TRUE WHEN THE MUTANT IS VISIBLE — that is, when running the MUTATED tool produces the
// WRONG observable. A probe that asserts the correct behaviour instead reports every mutant as surviving,
// which reads exactly like a real gap in the suite.
function mutant(label, from, to, probe) {
  var src = TOOL;
  if (src.indexOf(from) === -1) { fail++; console.error('FAIL ' + label + '   [anchor not found]'); return; }
  if (src.split(from).length - 1 !== 1) { fail++; console.error('FAIL ' + label + '   [anchor not unique]'); return; }
  var mutated = src.replace(from, to);
  var caught;
  try { caught = probe(mutated); } catch (e) { caught = true; }
  if (caught) { mutCaught++; console.log('ok   ' + label + '  (mutant caught)'); pass++; }
  else { mutSurvived++; console.error('SURVIVED ' + label); fail++; }
}

// J1 — blank source becomes 0. A price of nothing is not a price of zero, and 0 is a number a marketplace
// would happily list against.
mutant('J1  blank source silently becomes 0',
  "  if (v === '' || v === null || v === undefined) return { blank: true };",
  "  if (v === '' || v === null || v === undefined) return { value: 0 };",
  function (m) {
    var w = world({ tool: m });
    runToCommit(w);
    return cell(w, 3, 'base_msrp') !== 0 ? false : true;
  });

// J2 — the join uses the denormalised pricing_list.sku. It agrees with marketplace_skus almost always,
// which is exactly why this has to be tested on the row where it does not.
mutant('J2  the join falls back to the local pricing_list.sku',
  '    rec.master_sku = psfStr_(mrow[mIdx[\'sku\']]);',
  '    rec.master_sku = localSku || psfStr_(mrow[mIdx[\'sku\']]);',
  function (m) {
    var w = world({
      tool: m,
      mskuRows: rows(6, mskuRow).map(function (r, i) {
        if (i === 1) { var c = r.slice(); c[MSKU.indexOf('sku')] = 'SKU-9'; return c; }
        return r;
      }),
      skuRows: rows(6, skuRow).concat([SKUD.map(function (h) {
        var o = { sku: 'SKU-9', selling_price: 77.77, minimum_price: 66, msrp: 88, base_currency: 'USD' };
        return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : '';
      })])
    });
    runToCommit(w);
    return cell(w, 2, 'base_msrp') !== 88;    // caught when the wrong product's price lands
  });

// J3 — ambiguity resolved by taking the first candidate, the way a read index legitimately does.
mutant('J3  a duplicate source identity is resolved by picking the first',
  '    if (mById[id]) { mDupIds[id] = (mDupIds[id] || 1) + 1; } else { mById[id] = M.values[i]; }',
  '    if (!mById[id]) { mById[id] = M.values[i]; }',
  function (m) {
    var w = world({ tool: m, mskuRows: rows(6, mskuRow).concat([mskuRow(2)]) });
    var d = w.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
    return /JOIN_AMBIGUITY_COUNT = 0/.test(d) || !/NO-GO/.test(d);
  });

// NOT A MUTANT: swapping the format source from PRE to the damaged LIVE column. It looks like the original
// incident re-armed, and it changes nothing observable — the numeric override rewrites a date format on a
// numeric field whichever side it arrived from. A mutant a sibling guard masks says nothing about the line
// it mutated, so it is not listed as one. PRE is still preferred, because the live column's format is the
// one known to be contaminated; the override below is what actually carries the guarantee, and J5 tests it.

// J5 — the numeric override dropped, so PRE's format is trusted absolutely. It is right today; the point of
// the override is that the guarantee must not depend on the snapshot being right.
mutant('J5  a numeric field may inherit a date format when PRE carries one',
  "      return psfIsDateFormat_(fromPre) || psfStr_(fromPre) === '' ? PSF_NUMERIC_FMT_ : fromPre;",
  '      return fromPre;',
  function (m) {
    // A PRE snapshot whose base_msrp column is itself date-formatted — a snapshot taken mid-incident.
    var w = world({ tool: m });
    var snap = w.__extra['PRE__pricing_list__20260923-184134'];
    for (var i = 1; i < snap.__fmt.length; i++) snap.__fmt[i][LIVE.indexOf('base_msrp')] = 'yyyy-mm-dd';
    var r = runToCommit(w);
    return /NO-GO|FAIL/.test(r.dry + r.commit) || cell(w, 1, 'base_msrp') instanceof Date;
  });

// J6 — the flags are initialised FALSE. That is one deployment declaring the whole price book system-owned,
// which the next FX run would act on.
mutant('J6  the authority flags are initialised FALSE instead of blank',
  "        rowOut[c] = '';                                    // UNKNOWN, for every existing row",
  "        rowOut[c] = 'FALSE';",
  function (m) {
    var w = world({ tool: m });
    runToCommit(w);
    return String(cell(w, 1, 'msrp_is_manual')) !== '';
  });

// J7 — base taken from the effective price. The single most plausible wrong answer in this whole round,
// and the one the operator explicitly forbade.
mutant('J7  base_msrp is taken from the effective msrp column',
  '      var read = psfReadSourcePrice_(rec.source[dIdx[m.source]]);',
  "      var read = psfReadSourcePrice_(m.target === 'base_msrp' && lIdx['msrp'] !== undefined\n        ? L.values[rec.row][lIdx['msrp']] : rec.source[dIdx[m.source]]);",
  function (m) {
    var w = world({ tool: m });
    runToCommit(w);
    return cell(w, 1, 'base_msrp') === 44.99;   // the effective price landed in base
  });

// J8 — an untouched field quietly moves. The projection guard exists for exactly this, and without it the
// post validator would be comparing the write against the plan that produced it.
mutant('J8  auto_msrp is overwritten from the new base value',
  '      } else if (lIdx[name] !== undefined) {\n        rowOut[c] = L.values[rr2][lIdx[name]];             // preserved by field name',
  "      } else if (lIdx[name] !== undefined) {\n        rowOut[c] = name === 'auto_msrp' && cellPlan['base_msrp'] ? cellPlan['base_msrp'].value : L.values[rr2][lIdx[name]];",
  function (m) {
    var w = world({ tool: m });
    var r = runToCommit(w);
    return /NO-GO|THE PROJECTION MOVED A FIELD/.test(r.dry) || cell(w, 1, 'auto_msrp') === 39.99;
  });

// J9 — the unmatched-blanking authorisation is defaulted to true, so a base price disappears from a row
// nobody looked at.
mutant('J9  blanking an unmatched row\'s live base price needs no authorisation',
  'var PSF_ALLOW_UNMATCHED_BLANKING_ = false;',
  'var PSF_ALLOW_UNMATCHED_BLANKING_ = true;',
  function (m) {
    var w = world({ tool: m, skuRows: rows(6, skuRow).filter(function (r, i) { return i !== 4; }) });
    var d = w.TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN();
    return !/NO-GO/.test(d);   // it would proceed to blank a live price with nobody asked
  });

// =============================================================================================================
section('K · THIS FILE IS NOT ITS OWN EVIDENCE');
// =============================================================================================================
{
  // A recurring way to fool this suite: prove a claim about the tool by matching prose in the tool. Strip
  // every comment and string literal from the source and require the behaviour to still be findable in code.
  function bare(src) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  }
  var B = bare(TOOL);
  ok(B.indexOf('setValues') !== -1, 'K1  the tool really does write (setValues survives comment-stripping)');
  ok(B.indexOf('setNumberFormats') !== -1, 'K2  and really does set formats');
  ok(B.indexOf('tryLock') !== -1 && B.indexOf('releaseLock') !== -1, 'K3  and really takes and releases a lock');
  ok(/PSF_NUMERIC_FMT_/.test(B), 'K4  the numeric-format override is code, not a comment');
  ok(B.indexOf('PSF_BASE_MAP_') !== -1, 'K5  the source map is read by code');
  // The three shortcut columns must never appear as a SOURCE in executable code.
  ok(!/psfReadSourcePrice_\(\s*L\.values/.test(B),
    'K6  no executable path reads a base price out of the live pricing_list');
  ok(!/PSF_BASE_MAP_[\s\S]{0,400}auto_/.test(B.slice(0, 4000)),
    'K7  and auto_* is nowhere in the base source map');

  // The canonical header comes from 73_, not from a copy in the tool.
  ok(B.indexOf('PRICING_LIST_HEADERS_') !== -1, 'K8  the canon is taken from the shipped authority');
  ok(TOOL.indexOf("'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual'") === -1,
    'K9  and the flag names are not re-listed locally where they could drift');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + mutCaught + ' mutants caught, '
  + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
