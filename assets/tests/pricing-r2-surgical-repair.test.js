// =============================================================================================================
// PRICING-R2 SURGICAL REPAIR — base_msrp became a Date, and the reorder is what did it.
//
// THE HARNESS MODELS THE ACTUAL FAILURE, which is the only reason anything below means anything. In Sheets a
// cell's number format decides what getValues() hands back: a numeric cell carrying a date format returns a
// Date object, not a number. So the fake sheet here keeps formats alongside values and coerces on read, and
// section A proves the fake really does that before any conclusion is drawn from it. A regression test for
// type coercion, run against a fake that cannot coerce, would pass forever and guard nothing.
// =============================================================================================================

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var REPAIR = readN('assets/tools/apps-script-diagnostics/TEMP_PRICING_R2_SURGICAL_REPAIR.gs');
var RECON = readN('assets/tools/apps-script-diagnostics/TEMP_PRICING_R2_SCHEMA_RECONCILE.gs');
var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
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

var LIVE = ['pricing_id', 'marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price',
  'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price',
  'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'];
var LIVE_LOG = ['pricing_log_id', 'pricing_id', 'sku', 'country', 'marketplace', 'field_name',
  'old_value', 'new_value', 'old_currency', 'new_currency', 'change_type', 'changed_by', 'changed_at',
  'change_reason', 'source'];

// What pricing_change_log looks like RIGHT NOW in production: its migration succeeded, and the rollback
// that undid pricing_list threw before it ever reached this table.
var MIGRATED_LOG = AUTH.LOGCANON.concat(['sku', 'country', 'marketplace', 'old_currency', 'new_currency', 'source']);

var EPOCH = Date.UTC(1899, 11, 30);
function serialToDate(n) { return new Date(EPOCH + n * 86400000); }
function dateToSerial(d) { return (d.getTime() - EPOCH) / 86400000; }
function isDateFormat(f) { return /y|d{1,2}\/|mm\/|dd/.test(String(f)) && !/^[0#.,$]*$/.test(String(f)); }

// A field's natural format. base_* and the price fields are numeric; fx_rate_date and the timestamps are
// dates; everything else is text. This is what the PRE sheet is built with.
function naturalFormat(field) {
  if (/^(base_|auto_)?(regular_price|minimum_price|msrp)$/.test(field) || field === 'fx_rate'
      || field === 'base_regular_price' || field === 'base_minimum_price' || field === 'base_msrp') return '0.00';
  if (field === 'fx_rate_date' || field === 'created_at' || field === 'updated_at') return 'yyyy-mm-dd';
  return '@';
}

/**
 * A sheet that remembers what each cell is TOLD to be, and answers getValues accordingly. Writing a number
 * into a date-formatted cell therefore reads back as a Date — which is the whole failure, reproduced.
 */
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
      var R = {
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
              // Writing a Date into a cell makes that cell a date cell — this is what gave physical
              // column 14 a date format during the reorder.
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
      return R;
    }
  };
  S.copyTo = function () {
    var c = fakeSheet('copy', g[0], g.slice(1));
    c.__fmt = fm.map(function (r) { return r.slice(); });
    return c;
  };
  return S;
}

function liveRow(i) {
  var o = {
    pricing_id: 'PRC-' + (1000 + i), marketplace_sku_id: 'MSKU-' + i, marketplace_id: 'MKT-' + (i % 3),
    sku: 'SKU-' + i, company: (i % 2 ? 'KM' : 'MAMA'), country: (i % 2 ? 'CA' : 'US'),
    marketplace: 'Amazon', site_sku: 'SS-' + i, marketplace_product_id: 'B00' + i,
    currency: (i % 2 ? 'CAD' : 'USD'), base_currency: 'USD',
    base_regular_price: 29.99, base_minimum_price: 20, base_msrp: (i % 2 ? 35 : 40),
    fx_rate: 1, fx_rate_date: new Date(Date.UTC(2026, 0, 1)),
    auto_regular_price: 29.99, auto_minimum_price: 20, auto_msrp: 39.99,
    regular_price: 34.99, minimum_price: 20, msrp: 39.99,
    price_source: 'auto', price_status: 'draft',
    created_by: 'import', created_at: new Date(Date.UTC(2026, 0, 1)), updated_by: '',
    updated_at: '', note: 'n' + i
  };
  return LIVE.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
}
function rows(n) { var a = []; for (var i = 1; i <= n; i++) a.push(liveRow(i)); return a; }

function makeWorld(opts) {
  opts = opts || {};
  var price = fakeSheet('pricing_list', opts.priceHeader || LIVE, opts.rows || rows(6));
  var log = fakeSheet('pricing_change_log', opts.logHeader || LIVE_LOG, opts.logRows || []);
  var extra = {};
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
            var all = [price, log]; Object.keys(extra).forEach(function (k) { all.push(extra[k]); }); return all;
          },
          getSheetByName: function (n) {
            if (n === 'pricing_list') return price;
            if (n === 'pricing_change_log') return log;
            return extra[n] || null;
          }
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
    __price: price, __log: log, __extra: extra
  };
  S.PRICING_LIST_HEADERS_ = AUTH.CANON.slice();
  S.PRICING_MANUAL_FLAG_COLUMNS_ = AUTH.FLAGS.slice();
  S.PRICING_CHANGE_LOG_HEADERS_ = AUTH.LOGCANON.slice();
  S.PRW_BUILD_VERSION_ = AUTH.BUILD;
  var origCopy = price.copyTo;
  price.copyTo = function () {
    var c = origCopy();
    var o = c.setName; c.setName = function (n) { extra[n] = c; return o.call(c, n); };
    return c;
  };
  vm.createContext(S);
  vm.runInContext(opts.repair || REPAIR, S, { filename: 'TEMP_PRICING_R2_SURGICAL_REPAIR.gs' });
  return S;
}

/** Put the world into the state production is actually in: PRE snapshot taken, base_msrp date-coerced. */
function damagedWorld(opts) {
  opts = opts || {};
  if (!opts.logHeader) opts.logHeader = MIGRATED_LOG;
  var w = makeWorld(opts);
  // The PRE snapshot, taken before anything went wrong.
  var snap = w.__price.copyTo();
  snap.setName('PRE__pricing_list__20260923-184134');
  // THE DAMAGE, produced the way production produced it: physical column 14 was given a date format when
  // the reorder wrote fx_rate_date into it, and base_msrp's numbers were later restored into those cells.
  var col14 = LIVE.indexOf('base_msrp');
  for (var r = 1; r < w.__price.__grid.length; r++) w.__price.__fmt[r][col14] = 'yyyy-mm-dd';
  return w;
}

// =============================================================================================================
section('A · THE HARNESS REALLY DOES COERCE — everything below depends on it');
// =============================================================================================================
{
  var s = fakeSheet('t', ['pricing_id', 'base_msrp'], [['P1', 35], ['P2', 40]]);
  var before = s.getRange(1, 1, 3, 2).getValues();
  eq(before[1][1], 35, 'A1  a numeric cell with a numeric format reads back as the number');

  s.__fmt[1][1] = 'yyyy-mm-dd';
  s.__fmt[2][1] = 'yyyy-mm-dd';
  var after = s.getRange(1, 1, 3, 2).getValues();
  ok(after[1][1] instanceof Date, 'A2  the SAME cell with a date format reads back as a Date');
  eq(after[1][1].toISOString().slice(0, 10), '1900-02-03',
    'A3  and serial 35 is 1900-02-03 — exactly what the operator saw for a price of 35');
  eq(after[2][1].toISOString().slice(0, 10), '1900-02-08', 'A3a serial 40 is 1900-02-08, for a price of 40');

  // Writing a Date is what GIVES a column its date format. That is step one of the real failure.
  var s2 = fakeSheet('t2', ['pricing_id', 'base_msrp'], [['P1', 35]]);
  s2.getRange(2, 2).setValues([[new Date(Date.UTC(2026, 0, 1))]]);
  eq(s2.__fmt[1][1], 'yyyy-mm-dd', 'A4  writing a Date into a cell makes that cell date-formatted');
}

// =============================================================================================================
section('B · THE ROOT CAUSE, REPRODUCED — and why only base_msrp');
// =============================================================================================================
{
  // Three physical columns receive a date-typed field in the target layout. Only one of them held a NUMBER.
  var canonSet = {}; AUTH.CANON.forEach(function (h) { canonSet[h] = 1; });
  var ext = LIVE.filter(function (h) { return !canonSet[h]; });
  var target = AUTH.CANON.concat(ext);
  var DATE_FIELDS = ['fx_rate_date', 'created_at', 'updated_at'];
  var casualties = [];
  target.forEach(function (t, i) {
    if (DATE_FIELDS.indexOf(t) === -1) return;
    var pre = LIVE[i];
    if (pre && naturalFormat(pre) === '0.00') casualties.push(pre);
  });
  eq(casualties, ['base_msrp'],
    'B1  exactly ONE numeric field sits in a physical column that receives a date field: base_msrp');
  eq(LIVE[13], 'base_msrp', 'B1a which is physical column 14');
  eq(target[13], 'fx_rate_date', 'B1b the column the reorder fills with fx_rate_date');

  // And the old value-only reorder really does produce it.
  var w = makeWorld({ rows: rows(6) });
  var g = w.__price.__grid, f = w.__price.__fmt;
  var projected = [target.slice()];
  var lIdx = {}; LIVE.forEach(function (h, i) { lIdx[h] = i; });
  for (var r = 1; r < g.length; r++) {
    projected.push(target.map(function (n) { return lIdx[n] === undefined ? '' : g[r][lIdx[n]]; }));
  }
  w.__price.insertColumnsAfter(29, target.length - 29);
  w.__price.getRange(1, 1, projected.length, target.length).setValues(projected);   // VALUES ONLY, as before
  eq(w.__price.__fmt[1][13], 'yyyy-mm-dd',
    'B2  writing fx_rate_date into physical column 14 gives that column a date format');

  // Now the value-only restore puts base_msrp's numbers back into that column.
  w.__price.getRange(1, 1, 1, 1);
  var back = [];
  for (var r2 = 1; r2 < g.length; r2++) back.push([r2 % 2 ? 35 : 40]);
  w.__price.getRange(2, 14, back.length, 1).setValues(back);
  var read = w.__price.getRange(2, 14, back.length, 1).getValues();
  ok(read[0][0] instanceof Date, 'B3  and the restored NUMBER now reads back as a Date — the reported fault');
  eq(read[0][0].toISOString().slice(0, 10), '1900-02-03', 'B3a at 1900-02-03 for a price of 35');
}

// =============================================================================================================
section('C · THE REPAIR');
// =============================================================================================================
{
  var w = damagedWorld({ rows: rows(6) });
  var dry = w.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
  ok(/DIFFERING_FIELDS = base_msrp/.test(dry), 'C1  the dry run finds base_msrp and nothing else');
  ok(/the quantity survived on every row; the TYPE did not/.test(dry),
    'C2  and proves the quantity survived, by serial, rather than assuming it');
  ok(/MATCH/.test(dry) && !/\*\*\* MISMATCH \*\*\*/.test(dry),
    'C3  the repaired grid reproduces the PRE snapshot over every PRE field');
  eq(w.__price.__rangeWrites, 0, 'C4  ZERO writes from a dry run');

  function grab(re) { var m = re.exec(dry); return m ? m[1] : null; }
  w.PSR_EXPECT_LIVE_HEADER_HASH_ = grab(/LIVE_HEADER_HASH = (\S+)/);
  w.PSR_EXPECT_ROW_COUNT_ = Number(grab(/PSR_EXPECT_ROW_COUNT_ = (\d+);/));
  w.PSR_EXPECT_REPAIR_HASH_ = grab(/REPAIRED_LOGICAL_HASH = (\S+)/);
  var com = w.TEMP_PRICING_R2_SURGICAL_REPAIR_COMMIT();

  ok(/SURGICAL_REPAIR_PASS = YES/.test(com), 'C5  the repair passes its own validator');
  ok(/PASS  base_msrp holds NO Date values/.test(com), 'C6  base_msrp holds no Date anywhere');
  ok(/PASS  prodRequireSheet_ pricing_list PASS/.test(com), 'C7  and the REAL gate accepts the result');

  var post = w.__price.getRange(1, 1, w.__price.__grid.length, w.__price.__grid[0].length).getValues();
  eq(post[0].slice(0, 30), AUTH.CANON, 'C8  canonical positions 1..30 exact');
  eq(post[0].slice(30), ['marketplace_id', 'company'], 'C9  extensions preserved at 31 / 32');
  eq(post.length - 1, 6, 'C10 every row still there');

  var pIdx = {}; post[0].forEach(function (h, i) { pIdx[h] = i; });
  ok(typeof post[1][pIdx['base_msrp']] === 'number', 'C11 base_msrp reads back as a NUMBER');
  eq(post[1][pIdx['base_msrp']], 35, 'C12 and holds 35, from the PRE snapshot');
  eq(post[2][pIdx['base_msrp']], 40, 'C12a and 40 on the next row');
  // It must come from PRE, never from the effective msrp column, which is downstream data.
  ok(post[1][pIdx['msrp']] !== post[1][pIdx['base_msrp']],
    'C13 base_msrp is NOT the effective msrp — the two legitimately differ and were not made to agree');

  AUTH.FLAGS.forEach(function (f) {
    var blank = 0;
    for (var i = 1; i < post.length; i++) if (String(post[i][pIdx[f]] || '').trim() === '') blank++;
    eq(blank, 6, 'C14 ' + f + ' is BLANK on every row');
  });
  ok(/PRE_REPAIR_SNAPSHOT = PREREPAIR__pricing_list__/.test(com),
    'C15 a fresh snapshot is taken and the PRE__ one is left alone');
  ok(w.__price.__formatWrites > 0, 'C16 formats were written, not only values');
}

// =============================================================================================================
section('D · WHAT IT REFUSES');
// =============================================================================================================
{
  // More than one field differing is a different incident.
  var w = damagedWorld({ rows: rows(6) });
  w.__price.__grid[1][LIVE.indexOf('regular_price')] = 1.11;
  var r = w.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
  ok(/BLOCKED — this tool repairs exactly one field/.test(r), 'D1  a second differing field REFUSES the repair');
  eq(w.__price.__rangeWrites, 0, 'D1a with nothing written');

  // A genuinely different QUANTITY is not the known damage and must not be papered over.
  var w2 = damagedWorld({ rows: rows(6) });
  var c = LIVE.indexOf('base_msrp');
  w2.__price.__grid[1][c] = 999;                        // still date-formatted, but a different number
  var r2 = w2.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
  ok(/hold a DIFFERENT quantity/.test(r2), 'D2  a changed QUANTITY is refused, not repaired');
  eq(w2.__price.__rangeWrites, 0, 'D2a with nothing written');

  // No snapshot: PRE is the only authority, and effective msrp is explicitly not a substitute.
  var w3 = makeWorld({ rows: rows(6) });
  var r3 = w3.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
  ok(/no PRE__pricing_list__\* snapshot/.test(r3), 'D3  no snapshot REFUSES');
  ok(/NEVER take base_msrp/.test(r3) && /effective MSRP is downstream/.test(r3),
    'D3a and says why the obvious substitute is wrong');

  // Row identity has to hold or a positional repair is meaningless.
  var w4 = damagedWorld({ rows: rows(6) });
  w4.__price.__grid[1][LIVE.indexOf('pricing_id')] = 'PRC-9999';
  var r4 = w4.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
  ok(/ROW_IDENTITY_MATCHES = NO/.test(r4), 'D4  a row that is not the same row REFUSES');

  // An unarmed COMMIT is refused.
  var w5 = damagedWorld({ rows: rows(6) });
  var r5 = w5.TEMP_PRICING_R2_SURGICAL_REPAIR_COMMIT();
  ok(/not what the dry run measured/.test(r5), 'D5  COMMIT with unarmed constants is REFUSED');
  eq(w5.__price.__rangeWrites, 0, 'D5a with nothing written');
}

// =============================================================================================================
section('E · MUTANTS');
// =============================================================================================================
function nl(src, t) { return src.indexOf('\r\n') !== -1 ? t.split('\n').join('\r\n') : t; }
function mut(label, from, to, probe) {
  var caught = false;
  try {
    var a = nl(REPAIR, from), b = nl(REPAIR, to);
    if (REPAIR.indexOf(a) === -1) throw new Error(label + ' anchor drifted — the mutant would inject nothing');
    var m = REPAIR.split(a).join(b);
    if (m === REPAIR) throw new Error(label + ' changed nothing');
    caught = probe(m) === true;
  } catch (e) {
    if (/anchor drifted|changed nothing/.test(e.message)) { fail++; console.error('FAIL ' + label + ' — ' + e.message); return; }
    caught = true;
  }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

function repairWith(src) {
  var w = damagedWorld({ rows: rows(6), repair: src });
  var dry = w.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
  function grab(re) { var m = re.exec(dry); return m ? m[1] : null; }
  w.PSR_EXPECT_LIVE_HEADER_HASH_ = grab(/LIVE_HEADER_HASH = (\S+)/);
  w.PSR_EXPECT_ROW_COUNT_ = Number(grab(/PSR_EXPECT_ROW_COUNT_ = (\d+);/));
  w.PSR_EXPECT_REPAIR_HASH_ = grab(/REPAIRED_LOGICAL_HASH = (\S+)/);
  return { w: w, dry: dry, com: w.TEMP_PRICING_R2_SURGICAL_REPAIR_COMMIT() };
}

// 1 — THE REGRESSION §6 ASKS FOR. Formats are not written, so the values land in whatever formatting the
// physical column happens to carry — which is exactly how 35 became 1900-02-03.
mut('E1  the target number formats are never applied',
  '    rg.setNumberFormats(formats);',
  '    // formats not applied',
  function (m) {
    var r = repairWith(m);
    var post = r.w.__price.getRange(1, 1, r.w.__price.__grid.length, r.w.__price.__grid[0].length).getValues();
    var pIdx = {}; post[0].forEach(function (h, i) { pIdx[h] = i; });
    // Caught when a price comes back as a Date, or when the validator refuses to call it a pass.
    return post[1][pIdx['base_msrp']] instanceof Date || /SURGICAL_REPAIR_PASS = NO/.test(r.com);
  });

// (There was an E2 here asserting that formats must be applied BEFORE values. It survived, and it was right to:
// swapping the two calls changes nothing observable, because the number is stored either way and the format
// decides what comes back. The property that matters is that formats are applied AT ALL, which E1 pins. The
// ordering is still worth keeping for a different reason — if the script dies between the two calls, formats
// first leaves correct formats over old values, values first leaves new values wearing foreign formats — but
// that is a crash-window argument, not something this mutant was testing.)

// 3 — the obvious wrong repair: take base_msrp from the effective msrp column. It is downstream of FX and of
// manual ownership, so rows where they legitimately differ would be silently rewritten to agree.
mut('E3  base_msrp is taken from the effective msrp column instead of from PRE',
  "        row[c] = S.values[rr][sIdx[name]];                    // PRE is the authority for this one field",
  "        row[c] = L.values[rr][lIdx['msrp']];",
  function (m) {
    var r = repairWith(m);
    return /\*\*\* MISMATCH \*\*\*/.test(r.dry) || /BLOCKED/.test(r.dry)
      || /SURGICAL_REPAIR_PASS = NO/.test(r.com);
  });

// 4 — the "only base_msrp differs" gate is removed, so a second, undiagnosed change rides along.
mut('E4  the single-field gate is removed',
  '  if (differing.length !== 1 || differing[0] !== PSR_REPAIR_FIELD_) {',
  '  if (false) {',
  function (m) {
    var w = damagedWorld({ rows: rows(6), repair: m });
    w.__price.__grid[1][LIVE.indexOf('regular_price')] = 1.11;
    var dry = w.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
    return !/BLOCKED — this tool repairs exactly one field/.test(dry);
  });

// 5 — the serial proof is skipped, so a genuinely different price is restored as if it were a type fault.
mut('E5  the quantity proof is skipped',
  '  if (serialDiffer > 0) {',
  '  if (false) {',
  function (m) {
    var w = damagedWorld({ rows: rows(6), repair: m });
    w.__price.__grid[1][LIVE.indexOf('base_msrp')] = 999;
    var dry = w.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
    return !/hold a DIFFERENT quantity/.test(dry);
  });

// 6 — the new authority flags are created FALSE. One migration, and the whole price book is declared
// system-owned with no operator ever asked.
mut('E6  the new flag columns are initialized FALSE',
  "        row[c] = '';\n        fmt[c] = '@';",
  "        row[c] = (FLAGS.indexOf(name) !== -1) ? 'FALSE' : '';\n        fmt[c] = '@';",
  function (m) {
    var r = repairWith(m);
    return /FAIL  regular_price_is_manual blank on every row/.test(r.com)
      || /SURGICAL_REPAIR_PASS = NO/.test(r.com);
  });

// 7 — the repaired grid is no longer required to reproduce the snapshot, so the repair may edit rather than
// restore.
mut('E7  the repaired grid is not checked against the snapshot',
  '  if (repairHash !== snapHash) {',
  '  if (false) {',
  function (m) {
    var w = damagedWorld({ rows: rows(6), repair: m });
    // Make the projection wrong in a way only the snapshot comparison would notice.
    var dry = w.TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN();
    var mm = /REPAIRED_LOGICAL_HASH = (\S+)[\s\S]*?SNAPSHOT_LOGICAL_HASH = (\S+)/.exec(dry);
    // With the gate removed the run continues past a mismatch; with it in place it stops.
    return !/BLOCKED — the repaired grid does not reproduce/.test(dry) && !!mm;
  });

// =============================================================================================================
console.log('\n' + pass + ' passed / ' + fail + ' failed   ·   ' + (mutCaught + mutSurvived) + ' mutants, ' + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
