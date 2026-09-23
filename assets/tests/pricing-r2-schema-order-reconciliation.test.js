// Kitchen Mama Operation System — PRICING-R2 SCHEMA ORDER RECONCILIATION
// =============================================================================================================
// THIS TOOL REWRITES THE LAYOUT OF 495 PRODUCTION PRICING ROWS. It is executed here against a fake sheet that
// counts writes, supports copyTo/insertColumnsAfter/clear, and is seeded with the EXACT live header the
// operator's dry run reported — 29 columns with marketplace_id at 3 and company at 5.
//
//   A  the canonical list comes from CODE, and the live columns are classified against it
//   B  the target layout and the old->new map
//   C  §10 THE REAL CLASSIFIER — live must fail HEADER_ORDER_MISMATCH, projected must pass
//   D  the dry run: zero writes, nothing dropped, values proven equal by name
//   E  the commit: drift gate, snapshot, one bounded write, and a POST validator that can fail
//   F  rollback
//   G  the tool is not a release file
//   H  mutants
//
// Run: node assets/tests/pricing-r2-schema-order-reconciliation.test.js
// NOTE: no 'use strict' — the .gs source is eval'd.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var TOOL = readN('assets/tools/apps-script-diagnostics/TEMP_PRICING_R2_SCHEMA_RECONCILE.gs');
var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
// §10 — the REAL production-safety core, the same module the deployed bundle is generated from.
var KMSAFE = require(path.join(ROOT, 'assets', 'js', 'core', 'supply-planning-production-safety.js'));

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

// ---- the canonical authority, taken from the shipped 73_ by EXECUTING it -------------------------------------
var AUTH = {};
(function () {
  var S = { Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON, isFinite: isFinite, Date: Date };
  vm.createContext(S); vm.runInContext(GS73, S);
  AUTH.CANON = S.PRICING_LIST_HEADERS_.slice();
  AUTH.FLAGS = S.PRICING_MANUAL_FLAG_COLUMNS_.slice();
  AUTH.LOGCANON = S.PRICING_CHANGE_LOG_HEADERS_.slice();
  AUTH.BUILD = S.PRW_BUILD_VERSION_;
})();

// THE LIVE HEADER THE OPERATOR ACTUALLY MEASURED. Not a guess and not the canonical list with two things
// moved — this is transcribed from the production dry run, which is the only reason this round exists.
var LIVE = ['pricing_id', 'marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price',
  'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price',
  'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'];
// AND THE LIVE CHANGE LOG, likewise transcribed rather than assumed. Its first column is NOT the canonical
// name, it carries six contextual extensions the canonical list has never heard of, and it holds 0 rows.
var LIVE_LOG = ['pricing_log_id', 'pricing_id', 'sku', 'country', 'marketplace', 'field_name',
  'old_value', 'new_value', 'old_currency', 'new_currency', 'change_type', 'changed_by', 'changed_at',
  'change_reason', 'source'];

// -------------------------------------------------------------------------------------------------------------
// A fake spreadsheet with the operations this tool actually performs.
// -------------------------------------------------------------------------------------------------------------
function fakeSheet(name, grid) {
  var g = grid.map(function (r) { return r.slice(); });
  var S = {
    __grid: g, __name: name, __rangeWrites: 0, __cellWrites: 0, __cleared: 0, __widened: 0,
    getName: function () { return S.__name; },
    setName: function (n) { S.__name = n; return S; },
    getLastRow: function () { return g.length; },
    getLastColumn: function () { return g.length ? g[0].length : 0; },
    getMaxColumns: function () { return g.length ? g[0].length : 0; },
    insertColumnsAfter: function (after, n) { S.__widened += n; g.forEach(function (r) { for (var i = 0; i < n; i++) r.push(''); }); },
    clear: function () { S.__cleared++; g.length = 0; },
    getDataRange: function () { return { getValues: function () { return g.map(function (r) { return r.slice(); }); } }; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: function () {
          var o = [];
          for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push((g[r - 1 + i] || [])[c - 1 + j]); o.push(row); }
          return o;
        },
        setValue: function (v) { while (g.length < r) g.push([]); g[r - 1][c - 1] = v; S.__cellWrites++; },
        setValues: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            while (g.length < r + i) g.push([]);
            for (var j = 0; j < vals[i].length; j++) g[r - 1 + i][c - 1 + j] = vals[i][j];
          }
          S.__rangeWrites++;
        }
      };
    }
  };
  return S;
}

function liveRow(i) {
  var o = {
    pricing_id: 'PRC-' + (1000 + i), marketplace_sku_id: 'MSKU-' + i, marketplace_id: 'MKT-' + (i % 3),
    sku: 'SKU-' + i, company: (i % 2 ? 'KM' : 'MAMA'), country: (i % 2 ? 'CA' : 'US'),
    marketplace: 'Amazon', site_sku: 'SS-' + i, marketplace_product_id: 'B00' + i,
    currency: (i % 2 ? 'CAD' : 'USD'), base_currency: 'USD',
    base_regular_price: 29.99, base_minimum_price: 20, base_msrp: 39.99,
    fx_rate: 1, fx_rate_date: '2026-01-01',
    auto_regular_price: 29.99, auto_minimum_price: 20, auto_msrp: 39.99,
    regular_price: 34.99, minimum_price: 20, msrp: 39.99,
    price_source: 'auto_from_sku_details', price_status: 'draft',
    created_by: 'import', created_at: '2026-01-01', updated_by: '', updated_at: '', note: 'n' + i
  };
  return LIVE.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
}
function rows(n) { var a = []; for (var i = 1; i <= n; i++) a.push(liveRow(i)); return a; }

// Production has 0 of these. They exist so the rename stops being a vacuous claim the moment a row appears,
// which is the case §4 asks the tool to survive rather than refuse.
function logRow(i) {
  var o = {
    pricing_log_id: 'PCL-' + (900 + i), pricing_id: 'PRC-' + (1000 + i), sku: 'SKU-' + i,
    country: (i % 2 ? 'CA' : 'US'), marketplace: 'Amazon', field_name: 'regular_price',
    old_value: 29.99, new_value: 34.99, old_currency: 'USD', new_currency: (i % 2 ? 'CAD' : 'USD'),
    change_type: 'MANUAL_SET', changed_by: 'ops', changed_at: '2026-02-0' + i,
    change_reason: 'r' + i, source: 'pricing.update'
  };
  return LIVE_LOG.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; });
}
function logRows(n) { var a = []; for (var i = 1; i <= n; i++) a.push(logRow(i)); return a; }

function makeWorld(src, opts) {
  opts = opts || {};
  var priceHeader = opts.priceHeader || LIVE;
  var price = fakeSheet('pricing_list', [priceHeader].concat(opts.rows || rows(5)));
  var log = fakeSheet('pricing_change_log', [opts.logHeader || LIVE_LOG].concat(opts.logRows || []));
  var extra = {};
  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number,
    Math: Math, JSON: JSON, isFinite: isFinite, Date: Date,
    Logger: { log: function () {} },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return {
      tryLock: function () { S.__lockTries = (S.__lockTries || 0) + 1; return !opts.lockDenied; },
      releaseLock: function () { S.__lockReleased = (S.__lockReleased || 0) + 1; }
    }; } },
    // prodRequireSheet_ as 29_ defines it, minus the spreadsheet-id assertion that has no meaning here. The
    // classifier underneath is KMSAFE itself — the same code the deployed adapter calls — so a POST state
    // this accepts is one production accepts.
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
      flush: function () {}
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      formatDate: function () { return '20260923-120000'; },
      computeDigest: function (a, s) {
        var h = crypto.createHash('sha256').update(String(s), 'utf8').digest();
        return Array.prototype.slice.call(h).map(function (b) { return b > 127 ? b - 256 : b; });
      }
    },
    __price: price, __log: log, __extra: extra
  };
  // copyTo lands a real snapshot sheet in the book, which is what ROLLBACK later looks for.
  price.copyTo = function () { var c = fakeSheet('copy', price.__grid); extra['__pending'] = c;
    var origSet = c.setName; c.setName = function (n) { delete extra['__pending']; extra[n] = c; return origSet.call(c, n); }; return c; };
  log.copyTo = function () { var c = fakeSheet('copy', log.__grid); var o = c.setName;
    c.setName = function (n) { extra[n] = c; return o.call(c, n); }; return c; };

  if (!opts.noAuthority) {
    S.PRICING_LIST_HEADERS_ = AUTH.CANON.slice();
    S.PRICING_MANUAL_FLAG_COLUMNS_ = AUTH.FLAGS.slice();
    S.PRICING_CHANGE_LOG_HEADERS_ = AUTH.LOGCANON.slice();
    S.PRW_BUILD_VERSION_ = AUTH.BUILD;
  }
  vm.createContext(S);
  vm.runInContext(src, S, { filename: 'TEMP_PRICING_R2_SCHEMA_RECONCILE.gs' });
  return S;
}

/** Arm all six drift constants from a dry run the operator would have reviewed. */
function armFrom(w, dry) {
  function grab(re) { var m = re.exec(dry); return m ? m[1] : null; }
  w.TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ = grab(/^LIVE_HEADER_HASH\s+=\s+(\S+)/m);
  w.TEMP_PR2S_EXPECT_LOGICAL_HASH_ = grab(/^FULL_LOGICAL_HASH_PRE\s+=\s+(\S+)/m);
  w.TEMP_PR2S_EXPECT_ROW_COUNT_ = Number(grab(/^ROW_COUNT_PRE\s+=\s+(\d+)/m));
  w.TEMP_PR2S_EXPECT_LOG_HEADER_HASH_ = grab(/^LOG_HEADER_HASH\s+=\s+(\S+)/m);
  w.TEMP_PR2S_EXPECT_LOG_LOGICAL_HASH_ = grab(/^LOG_FULL_LOGICAL_HASH_PRE\s+=\s+(\S+)/m);
  w.TEMP_PR2S_EXPECT_LOG_ROW_COUNT_ = Number(grab(/LIVE pricing_change_log header \(\d+ columns\), ROW_COUNT = (\d+)/));
  return w;
}

/** Run a dry run, then arm the drift constants from its output and commit. */
function dryThenCommit(src, opts) {
  var w = makeWorld(src, opts);
  var dry = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  armFrom(w, dry);
  var com = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT();
  return { w: w, dry: dry, com: com };
}

/** Commit a world whose change_log range write throws — the half-migrated pair §5 forbids leaving behind. */
function failingLogWrite(src) {
  var w = makeWorld(src, { rows: rows(5), logRows: logRows(3) });
  armFrom(w, w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN());
  var real = w.__log.getRange, armed = false;
  w.__log.getRange = function (r, c, nr, nc) {
    var range = real.call(w.__log, r, c, nr, nc);
    var setv = range.setValues;
    range.setValues = function (v) {
      if (!armed && r === 1 && c === 1 && nr > 1) { armed = true; throw new Error('quota exceeded'); }
      return setv.call(range, v);
    };
    return range;
  };
  w.__com = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT();
  return w;
}

/** Make every range write on a sheet silently do nothing: asked for, never happened. */
function swallowWrites(sheet) {
  var real = sheet.getRange;
  sheet.getRange = function (r, c, nr, nc) {
    var range = real.call(sheet, r, c, nr, nc);
    range.setValues = function () { return range; };
    return range;
  };
}

// =============================================================================================================
section('A · CANONICAL FROM CODE, LIVE COLUMNS CLASSIFIED AGAINST IT');
// =============================================================================================================
{
  eq(AUTH.CANON.length, 30, 'A1  the authority declares 30 canonical columns');
  eq(AUTH.CANON.slice(20, 23), AUTH.FLAGS, 'A2  the three flags sit at canonical indexes 20..22, not at the end');
  eq(AUTH.CANON[2], 'sku', 'A3  canonical position 3 is `sku` — which is exactly what the live sheet disagrees with');
  eq(LIVE[2], 'marketplace_id', 'A3a while live position 3 is `marketplace_id`');
  eq(LIVE.length, 29, 'A4  the live header carries 29 columns');

  var canonSet = {}; AUTH.CANON.forEach(function (h) { canonSet[h] = 1; });
  var ext = LIVE.filter(function (h) { return !canonSet[h]; });
  eq(ext, ['marketplace_id', 'company'], 'A5  LIVE_EXTENSION_COLUMNS = marketplace_id, company');
  var missing = AUTH.CANON.filter(function (h) { return LIVE.indexOf(h) === -1; });
  eq(missing, AUTH.FLAGS, 'A6  and the ONLY canonical columns absent are the three this round provisions');
  eq(LIVE.length - ext.length + AUTH.FLAGS.length, AUTH.CANON.length,
    'A7  the arithmetic closes: live minus extensions plus the three flags IS the canonical list');

  // asin is optionally written by 04_ and is NOT in the live sheet. It must not be conjured into existence.
  ok(LIVE.indexOf('asin') === -1, 'A8  `asin` is absent from production');
  var w = makeWorld(TOOL);
  var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  ok(!/asin/.test(r), 'A8a and the tool never mentions it — an extension absent from production is not invented');
  ok(/EXTRA_EXTENSION/.test(r) && /CANONICAL_REQUIRED/.test(r), 'A9  every live column is classified');
}

// =============================================================================================================
section('B · THE TARGET LAYOUT AND THE MAP');
// =============================================================================================================
{
  var w = makeWorld(TOOL);
  var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  ok(/TARGET header \(32 columns\)/.test(r), 'B1  the target is 32 columns: 30 canonical + 2 preserved extensions');
  ok(/would_drop_columns = 0/.test(r), 'B2  would_drop_columns = 0');
  ok(/would_add_columns  = 3/.test(r), 'B3  would_add_columns = 3');
  ok(/would_move_columns = \d+/.test(r), 'B4  and the number of moved columns is reported');
  // The extensions land to the RIGHT of the canonical block, which is the only place the order check tolerates.
  var block = r.slice(r.indexOf('TARGET header (32 columns)'));
  block = block.slice(0, block.indexOf('OLD_TO_NEW_COLUMN_MAP'));
  var targetCols = [];
  block.split(/\r?\n/).forEach(function (l) {
    var mm = /^\s+(\d+) (\S+)\s*$/.exec(l);
    if (mm) targetCols[Number(mm[1]) - 1] = mm[2];
  });
  eq(targetCols.length, 32, 'B4a the target block lists all 32 positions');
  eq(targetCols.slice(0, 30), AUTH.CANON, 'B5  target positions 1..30 ARE the canonical list, in order');
  eq(targetCols.slice(30), ['marketplace_id', 'company'],
    'B6  and the extensions follow it in their existing relative order');
}

// =============================================================================================================
section('C · §10 — THE REAL SCHEMA CLASSIFIER, NOT A WEAKER ONE');
// =============================================================================================================
{
  // This is KMSAFE itself, the module the deployed bundle is generated from — the same code prodRequireSheet_
  // calls. A hand-rolled order check here would prove nothing about what production will do.
  ok(typeof KMSAFE.classifySchemaMismatch === 'function', 'C0  the real classifier is loaded');

  var pre = KMSAFE.classifySchemaMismatch({
    exists: true, actualHeaders: LIVE, expectedHeaders: AUTH.CANON, extraColumnsPolicy: 'ALLOW' });
  // It reports the FIRST failing status; missing headers rank above order, and the flags are genuinely
  // missing today, so the live sheet fails for both reasons at once.
  ok(pre.valid === false, 'C1  PRE — the live header is REFUSED by the real classifier');
  ok(pre.schemaStatus === 'HEADER_MISSING' || pre.schemaStatus === 'HEADER_ORDER_MISMATCH',
    'C1a with a header fault', pre.schemaStatus);

  // The precise claim this round exists for: even WITH the three columns present, appending them leaves the
  // sheet refused on ORDER. That is the failure a plain "add three columns" migration would have shipped.
  var appended = LIVE.concat(AUTH.FLAGS);
  var app = KMSAFE.classifySchemaMismatch({
    exists: true, actualHeaders: appended, expectedHeaders: AUTH.CANON, extraColumnsPolicy: 'ALLOW' });
  eq(app.valid, false, 'C2  APPENDING the flags still fails — every required column present, still refused');
  eq(app.schemaStatus, 'HEADER_ORDER_MISMATCH', 'C2a specifically on ORDER');

  var post = KMSAFE.classifySchemaMismatch({
    exists: true, actualHeaders: AUTH.CANON.concat(['marketplace_id', 'company']),
    expectedHeaders: AUTH.CANON, extraColumnsPolicy: 'ALLOW' });
  eq(post.valid, true, 'C3  POST — the projected header PASSES the real classifier');
  eq(post.schemaStatus, 'SCHEMA_VALID', 'C3a SCHEMA_VALID');
  eq(post.unexpectedHeaders, ['marketplace_id', 'company'],
    'C3b with the extensions reported as expected-but-tolerated rather than silently ignored');
}

// =============================================================================================================
section('D · THE DRY RUN — zero writes, nothing dropped, values proven by name');
// =============================================================================================================
{
  var w = makeWorld(TOOL, { rows: rows(5) });
  var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  eq(w.__price.__rangeWrites + w.__price.__cellWrites, 0, 'D1  ZERO writes to pricing_list');
  eq(w.__log.__rangeWrites + w.__log.__cellWrites, 0, 'D2  ZERO writes to pricing_change_log');
  eq(w.__price.__widened, 0, 'D3  and the sheet is not widened');
  eq(Object.keys(w.__extra).length, 0, 'D4  no snapshot sheet is created by a dry run');

  ok(/FULL_LOGICAL_HASH_PROJ = \w+   MATCH/.test(r),
    'D5  the projected logical hash MATCHES the pre hash — the migration is a rearrangement, not an edit');
  ok(/ALL EQUAL/.test(r), 'D6  and the sample rows prove OLD == projected NEW, field by field');
  ok(!/\*\*\* DIFFERENCE \*\*\*/.test(r), 'D6a with no row differing');
  ok(/ROW_COUNT_PRE          = 5/.test(r), 'D7  the row count is reported');
  ok(/PRICING_IDS_PRE_HASH/.test(r) && /PRICE_VALUES_PRE_HASH/.test(r), 'D8  and both PRE hashes');
  ok(/var TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ = '\w+';/.test(r),
    'D9  the dry run prints the exact constants COMMIT will demand');

  // 495 rows, the real production count.
  var w2 = makeWorld(TOOL, { rows: rows(495) });
  var r2 = w2.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  ok(/ROW_COUNT_PRE          = 495/.test(r2), 'D10 it handles the production row count');
  eq(w2.__price.__rangeWrites + w2.__price.__cellWrites, 0, 'D10a still writing nothing');
}

// =============================================================================================================
section('E · THE COMMIT — drift gate, snapshot, one bounded write, a validator that can fail');
// =============================================================================================================
{
  // THE DRIFT GATE. A plan reviewed against one sheet is not a plan for a different one.
  var w0 = makeWorld(TOOL, { rows: rows(5) });
  var blocked = w0.TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT();
  ok(/pricing_list IS NOT WHAT THE DRY RUN MEASURED/.test(blocked),
    'E1  COMMIT with unarmed constants is REFUSED');
  eq(w0.__price.__rangeWrites, 0, 'E1a having written nothing');

  var res = dryThenCommit(TOOL, { rows: rows(495) });
  var w = res.w, com = res.com;
  ok(/DRIFT GATE PASSED/.test(com), 'E2  armed with the dry run\'s own values, the gate passes');

  // The snapshot exists BEFORE the write, and it is a real sheet in the book.
  ok(/PRE_SNAPSHOT_CREATED  = YES/.test(com), 'E3  a PRE snapshot is created');
  var snaps = Object.keys(w.__extra).filter(function (k) { return k.indexOf('PRE__pricing_list__') === 0; });
  eq(snaps.length, 1, 'E3a and it is a real sheet in the spreadsheet');
  eq(w.__extra[snaps[0]].__grid.length, 496, 'E3b holding the header and all 495 rows');
  eq(w.__extra[snaps[0]].__grid[0], LIVE, 'E3c in the ORIGINAL layout, which is what makes it a rollback');

  // ONE bounded range write per sheet — not a cell loop, and not a sequence of inserts whose intermediate
  // states are each a differently-broken layout.
  eq(w.__price.__rangeWrites, 1, 'E4  pricing_list is rewritten in ONE range write');
  eq(w.__price.__cellWrites, 0, 'E4a with zero per-cell writes');
  eq(w.__log.__rangeWrites, 1, 'E4b and the change log in one');

  var post = w.__price.__grid;
  eq(post[0].slice(0, 30), AUTH.CANON, 'E5  the canonical prefix is now EXACT');
  eq(post[0].slice(30), ['marketplace_id', 'company'], 'E6  extensions preserved, in order, to the right');
  eq(post.length - 1, 495, 'E7  495 rows, unchanged');

  // THE VALUES MOVED WITH THEIR NAMES.
  var pre = liveRow(1);
  var byName = {}; LIVE.forEach(function (h, i) { byName[h] = pre[i]; });
  var okAll = true;
  LIVE.forEach(function (h) { if (post[1][post[0].indexOf(h)] !== byName[h]) okAll = false; });
  ok(okAll, 'E8  every value in row 1 sits under the same NAME it started under');
  ok(/PASS  PRICING_IDS_POST_HASH == PRE/.test(com), 'E9  identities unchanged');
  ok(/PASS  PRICE_VALUES_POST_HASH == PRE/.test(com), 'E10 price values unchanged');
  ok(/PASS  FULL_LOGICAL_HASH_POST == PRE/.test(com), 'E11 and the full logical hash is unchanged');

  // THE FLAGS ARE BLANK. This is the whole reason the round is careful.
  AUTH.FLAGS.forEach(function (f) {
    var c = post[0].indexOf(f), blank = 0, falses = 0;
    for (var i = 1; i < post.length; i++) {
      var v = String(post[i][c] === undefined ? '' : post[i][c]).trim();
      if (v === '') blank++; else if (/^false$/i.test(v)) falses++;
    }
    eq(blank, 495, 'E12 ' + f + ' is BLANK on all 495 rows');
    eq(falses, 0, 'E12a ' + f + ' has no FALSE value anywhere');
  });
  ok(/SCHEMA_RECONCILE_PASS = YES/.test(com), 'E13 SCHEMA_RECONCILE_PASS');

  // change_type provisioned at its canonical position, log rows preserved.
  eq(w.__log.__grid[0].slice(0, AUTH.LOGCANON.length), AUTH.LOGCANON,
    'E14 pricing_change_log gains change_type at its canonical position');

  // AND THE RESULT PASSES THE REAL CLASSIFIER — the end-to-end claim.
  var v = KMSAFE.classifySchemaMismatch({
    exists: true, actualHeaders: post[0], expectedHeaders: AUTH.CANON, extraColumnsPolicy: 'ALLOW' });
  eq(v.schemaStatus, 'SCHEMA_VALID', 'E15 the committed sheet passes the REAL classifier — writes are unblocked');
}

// =============================================================================================================
section('F · ROLLBACK');
// =============================================================================================================
{
  var res = dryThenCommit(TOOL, { rows: rows(20) });
  var w = res.w;
  eq(w.__price.__grid[0].slice(0, 30), AUTH.CANON, 'F1  the sheet is migrated');
  w.TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK();
  eq(w.__price.__grid[0], LIVE, 'F2  ROLLBACK restores the ORIGINAL 29-column header');
  eq(w.__price.__grid.length - 1, 20, 'F3  with every row back');
  eq(w.__price.__grid[1], liveRow(1), 'F4  byte for byte');
  ok(w.__price.__cleared > 0, 'F5  and it replaced the sheet rather than merging into it');
}

// =============================================================================================================
section('G · THE TOOL IS NOT A RELEASE FILE');
// =============================================================================================================
{
  var health = readN('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  ok(health.indexOf('TEMP_PRICING_R2_SCHEMA_RECONCILE') === -1, 'G1  no manifest row');
  ok(!fs.existsSync(path.join(ROOT, 'assets/specs/active/apps-script/TEMP_PRICING_R2_SCHEMA_RECONCILE.gs')),
    'G2  it does not sit in the deployed directory');
  // Measured on a DECLARATION. The first spelling matched `PRW_BUILD_VERSION_ === 'string'` — the tool
  // READING the authority's stamp to print it, which is the opposite of declaring one.
  ok(!/var\s+\w*_BUILD_VERSION_\s*=/.test(TOOL) && !/var\s+SYS_DEPLOYMENT_RELEASE_\s*=/.test(TOOL),
    'G3  it declares no build stamp and no release identity');
  ok(/PRW_BUILD_VERSION_/.test(TOOL), 'G3a while it does READ the authority\'s stamp, to print which one it used');
  // It must not carry a schema of its own — the fault it repairs is a schema believed in two places.
  ok(!/'pricing_id', *'marketplace_sku_id', *'sku'/.test(TOOL),
    'G4  THE TOOL CARRIES NO HARD-CODED COLUMN LIST — the layout is derived from the deployed authority');
  ok(/CARRIES NO SCHEMA OF ITS OWN/.test(TOOL), 'G4a and says so');
}

// =============================================================================================================
section('I · pricing_change_log — THE LIVE 15-COLUMN SHAPE AND ITS TARGET');
// =============================================================================================================
{
  eq(AUTH.LOGCANON.length, 9, 'I1  the authority declares 9 canonical change_log columns');
  eq(AUTH.LOGCANON[0], 'log_id', 'I2  and the canonical primary key is log_id');
  eq(LIVE_LOG.length, 15, 'I3  the live sheet carries 15');
  eq(LIVE_LOG[0], 'pricing_log_id', 'I4  whose first column is named pricing_log_id');

  // The arithmetic has to close the same way pricing_list's did, or something is unaccounted for.
  var logCanonSet = {}; AUTH.LOGCANON.forEach(function (h) { logCanonSet[h] = 1; });
  var eff = LIVE_LOG.map(function (h) { return h === 'pricing_log_id' ? 'log_id' : h; });
  var ext = eff.filter(function (h) { return !logCanonSet[h]; });
  eq(ext, ['sku', 'country', 'marketplace', 'old_currency', 'new_currency', 'source'],
    'I5  CHANGE_LOG_EXTENSION_COLUMNS = the six contextual columns');
  eq(AUTH.LOGCANON.length + ext.length, LIVE_LOG.length,
    'I6  9 canonical + 6 extensions IS the live 15 — nothing is unaccounted for');
  eq(AUTH.LOGCANON.filter(function (h) { return eff.indexOf(h) === -1; }), [],
    'I7  after the rename NO canonical column is missing — change_type is already live');

  var w = makeWorld(TOOL);
  var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  ok(/RENAME_MAP = pricing_log_id -> log_id/.test(r), 'I8  the dry run declares the rename it applies');
  ok(/change_log would_drop_columns = 0/.test(r), 'I9  change_log drops nothing');
  ok(/change_log would_add_columns  = 0/.test(r), 'I10 and adds nothing — change_type is already there');
  ok(/change_log would_move_columns = 12/.test(r), 'I11 twelve of the fifteen columns move');
  ok(/LOG_FULL_LOGICAL_HASH_PROJ = \w+   MATCH/.test(r), 'I12 the change_log projection is value-identical');
  ok(/PRICING_CHANGE_LOG_PROJECTION_MATCH = YES/.test(r), 'I12a and says so in the verdict block');

  var m = /TARGET pricing_change_log header \(15\): (.+)/.exec(r);
  ok(!!m, 'I13 the target header is printed');
  var tgt = m[1].trim().split(', ');
  eq(tgt.slice(0, 9), AUTH.LOGCANON, 'I14 target positions 1..9 ARE the canonical list, in order');
  eq(tgt.slice(9), ['sku', 'country', 'marketplace', 'old_currency', 'new_currency', 'source'],
    'I15 and the six extensions follow it in their existing relative order');

  // §13 — the REAL gate has to accept the result, and has to have refused the original.
  var pre = KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: LIVE_LOG,
    expectedHeaders: AUTH.LOGCANON, extraColumnsPolicy: 'ALLOW' });
  eq(pre.valid, false, 'I16 PRE — the real classifier REFUSES the live change_log');
  var post = KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: tgt,
    expectedHeaders: AUTH.LOGCANON, extraColumnsPolicy: 'ALLOW' });
  eq(post.schemaStatus, 'SCHEMA_VALID', 'I17 POST — and accepts the target');
}

// =============================================================================================================
section('J · THE RENAME IS AUDITED, NOT INFERRED FROM THE NAME');
// =============================================================================================================
{
  // The whole claim is "pricing_log_id IS log_id". Names that look alike are not evidence about what a column
  // holds, so what makes it safe is that NOTHING IN THE REPOSITORY has ever used the live name — there is no
  // writer whose meaning could differ, and no reader whose expectation could be violated.
  var PROD = ['assets/specs/active/apps-script/73_api_v1_pricing_write.gs',
    'assets/specs/active/apps-script/02_core_sheet_db.gs',
    'assets/specs/active/apps-script/03_master_data_handlers.gs',
    'assets/specs/active/apps-script/01_router.gs',
    'assets/js/api/operation-system-db-api.js'];
  PROD.forEach(function (f) {
    ok(readN(f).indexOf('pricing_log_id') === -1,
      'J1  ' + f.split('/').pop() + ' has never heard of pricing_log_id');
  });

  // Every consumer of the key reads it BY NAME, and the name it reads is the canonical one.
  var GS02 = readN('assets/specs/active/apps-script/02_core_sheet_db.gs');
  var DBAPI = readN('assets/js/api/operation-system-db-api.js');
  ok(/r\.log_id/.test(GS02), 'J2  02_ filters change_log rows on r.log_id, by name');
  ok(/String\(r\.log_id \|\| ''\)/.test(DBAPI), 'J3  the browser normalizer reads r.log_id, by name');
  ok(/log_id: 'PCL-'/.test(GS73), 'J4  and the only writer MINTS log_id rather than reading one');

  // The writer projects its record through the LIVE header by name. That is why the live name matters at
  // all: against a sheet headed pricing_log_id this writes a row whose primary key is BLANK.
  ok(/logHeaders\.map\(function \(h\) \{ return Object\.prototype\.hasOwnProperty\.call\(rec, h\)/.test(GS73),
    'J5  the writer projects by header NAME, so a mismatched name silently yields a blank key');
  // It never gets that far today, because the sheet is refused first — which is why there are zero rows.
  ok(/prodRequireSheet_\(ss, 'pricing_change_log', PRICING_CHANGE_LOG_HEADERS_\)/.test(GS73),
    'J6  but prodRequireSheet_ refuses the sheet before any write — hence 0 live rows');

  // The rename lives in ONE declared table. A rename this file does not list does not happen.
  ok(/var TEMP_PR2S_LOG_RENAME_ = \{ pricing_log_id: 'log_id' \};/.test(TOOL),
    'J7  the rename is a declared constant, not a similarity heuristic');
  var BARE = TOOL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok(!/similar|fuzzy|levenshtein|endsWith|startsWith/i.test(BARE),
    'J8  and nothing in the tool CODE guesses a rename from the shape of a name');
  ok(/similarity guess/.test(TOOL), 'J8a while the prose still says why that would be wrong');

  // §7 — no spec, test or comment calls the canonical key pricing_log_id.
  ['assets/specs/active/SKU_MASTER_FLOW.md', 'assets/specs/active/PRICING_DATABASE_MAPPING.md',
   'docs/planning/DATABASE_RELATIONSHIP_MAP.md'].forEach(function (f) {
    ok(readN(f).indexOf('pricing_log_id') === -1 || /LIVE|live sheet/.test(readN(f)),
      'J9  ' + f.split('/').pop() + ' does not present pricing_log_id as canonical');
  });
}

// =============================================================================================================
section('K · WHAT THE CHANGE_LOG MIGRATION REFUSES, AND WHAT IT DOES WITH ROWS');
// =============================================================================================================
{
  // A rename onto a name the sheet already carries would MERGE two columns. Two columns are two facts.
  var collide = ['pricing_log_id', 'log_id', 'pricing_id', 'field_name', 'old_value', 'new_value',
    'change_type', 'changed_by', 'changed_at', 'change_reason'];
  var w1 = makeWorld(TOOL, { logHeader: collide });
  var r1 = w1.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  ok(/would merge/.test(r1) && /BLOCKED/.test(r1), 'K1  a rename collision is REFUSED, not resolved');
  eq(w1.__log.__rangeWrites, 0, 'K1a with nothing written');

  var dup = LIVE_LOG.concat(['sku']);
  var w2 = makeWorld(TOOL, { logHeader: dup });
  var r2 = w2.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  ok(/CHANGE_LOG_DUPLICATE_HEADERS = 1/.test(r2) && /BLOCKED/.test(r2),
    'K2  a duplicate change_log header is REFUSED');

  var blank = LIVE_LOG.slice(); blank.push('');
  var w3 = makeWorld(TOOL, { logHeader: blank });
  var r3 = w3.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  ok(/CHANGE_LOG_BLANK_HEADERS     = 1/.test(r3) && /BLOCKED/.test(r3),
    'K3  a blank change_log header is REFUSED');

  var short = ['pricing_log_id', 'field_name', 'old_value', 'new_value', 'change_type', 'changed_by',
    'changed_at', 'change_reason'];    // pricing_id absent
  var w4 = makeWorld(TOOL, { logHeader: short });
  ok(/missing canonical column\(s\)[\s\S]*pricing_id/.test(w4.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN()),
    'K4  a missing canonical column this tool does not provision is REFUSED');

  // 0 rows today. The proof says VACUOUS rather than implying it checked something.
  var w5 = makeWorld(TOOL);
  ok(/RENAME_VALUE_PROOF = VACUOUS — 0 rows/.test(w5.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN()),
    'K5  with 0 rows the rename proof reports itself VACUOUS rather than PASSED');

  // §4 — rows appearing before execution must not silently stop the migration, but must be PROVEN.
  var res = dryThenCommit(TOOL, { rows: rows(5), logRows: logRows(4) });
  ok(/RENAME_VALUE_PROOF = ALL 4 rows carry their value across intact/.test(res.dry),
    'K6  with rows present the proof becomes a per-row check of every renamed value');
  ok(/SCHEMA_RECONCILE_PASS = YES/.test(res.com), 'K7  and the migration completes');

  var lg = res.w.__log.__grid;
  eq(lg[0].slice(0, 9), AUTH.LOGCANON, 'K8  the committed change_log has the canonical prefix EXACT');
  eq(lg[0].slice(9), ['sku', 'country', 'marketplace', 'old_currency', 'new_currency', 'source'],
    'K9  and the six extensions preserved, in order');
  eq(lg.length - 1, 4, 'K10 with every row still there');

  // §8.5 — the values under the OLD name are the values under the NEW one.
  var srcIdx = LIVE_LOG.indexOf('pricing_log_id');
  var dstIdx = lg[0].indexOf('log_id');
  var okPk = true, okExt = true;
  for (var i = 1; i <= 4; i++) {
    if (lg[i][dstIdx] !== logRow(i)[srcIdx]) okPk = false;
    if (lg[i][lg[0].indexOf('old_currency')] !== logRow(i)[LIVE_LOG.indexOf('old_currency')]) okExt = false;
  }
  ok(okPk, 'K11 every pricing_log_id value now sits under log_id, unchanged');
  ok(okExt, 'K12 and the extension values came across too');
  ok(/PASS  LOG_FULL_LOGICAL_HASH_POST == PRE/.test(res.com), 'K13 the POST logical hash matches PRE');
  ok(/POST_PROD_REQUIRE_SHEET pricing_change_log = PASS/.test(res.com),
    'K14 and the REAL gate accepts the migrated change_log');
  ok(/POST_PROD_REQUIRE_SHEET pricing_list       = PASS/.test(res.com), 'K14a as it does pricing_list');
}

// =============================================================================================================
section('L · THE LOCK, AND A PARTIAL MIGRATION THAT ROLLS BOTH TABLES BACK');
// =============================================================================================================
{
  var res = dryThenCommit(TOOL, { rows: rows(5), logRows: logRows(2) });
  eq(res.w.__lockTries, 1, 'L1  COMMIT takes the script lock exactly once');
  eq(res.w.__lockReleased, 1, 'L1a and releases it');

  var denied = makeWorld(TOOL, { rows: rows(5), lockDenied: true });
  armFrom(denied, denied.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN());
  var dr = denied.TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT();
  ok(/could not take the script lock/.test(dr), 'L2  a lock it cannot take REFUSES the migration');
  eq(denied.__price.__rangeWrites, 0, 'L2a with nothing written');

  // A dry run neither takes the lock nor needs it.
  var d = makeWorld(TOOL, { rows: rows(5) });
  d.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  ok(!d.__lockTries, 'L3  a DRY RUN takes no lock, because it writes nothing');

  // THE PARTIAL MIGRATION. pricing_list lands; the change_log write throws. The pair must not be left
  // half-migrated — 73_ needs BOTH to validate, so one repaired table is not partial progress, it is a
  // different broken state that reads like progress.
  var w = failingLogWrite(TOOL);
  var com = w.__com;
  ok(/WRITE FAILED/.test(com), 'L4  the change_log write fails loudly');
  ok(/AUTO_ROLLBACK — restoring BOTH tables/.test(com), 'L5  and BOTH tables are rolled back');
  ok(/SCHEMA_RECONCILE_PASS = NO/.test(com), 'L6  reported as a failure, never as partial success');
  ok(!/automatic retry/.test(com) || /No automatic retry/.test(com), 'L6a with no automatic retry');
  eq(w.__price.__grid[0], LIVE, 'L7  pricing_list is back to its ORIGINAL 29-column header');
  eq(w.__price.__grid[1], liveRow(1), 'L7a byte for byte');
  eq(w.__log.__grid[0], LIVE_LOG, 'L8  and the change_log to its original 15');
  eq(w.__lockReleased, 1, 'L9  the lock is released even on the failing path');

  // §6 — ROLLBACK reproves the restore by hash rather than trusting that a write that was asked for happened.
  var res2 = dryThenCommit(TOOL, { rows: rows(20), logRows: logRows(3) });
  var rb = res2.w.TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK();
  ok(/header MATCH/.test(rb) && /rowcount MATCH/.test(rb) && /values MATCH/.test(rb),
    'L10 ROLLBACK proves header, row count and values against the snapshot');
  eq(res2.w.__price.__grid[0], LIVE, 'L11 pricing_list restored');
  eq(res2.w.__log.__grid[0], LIVE_LOG, 'L12 change_log restored');
  ok(/ROLLBACK COMPLETE/.test(rb), 'L13 and says so only after the proof');
}

// =============================================================================================================
section('H · MUTANTS');
// =============================================================================================================
function nl(src, t) { return src.indexOf('\r\n') !== -1 ? t.split('\n').join('\r\n') : t; }
function faulted(src, from, to, tag) {
  var a = nl(src, from), b = nl(src, to);
  if (src.indexOf(a) === -1) throw new Error(tag + ' anchor drifted — the mutant would inject nothing');
  return src.split(a).join(b);
}
function mut(label, from, to, probe) {
  var caught = false;
  try {
    var m = faulted(TOOL, from, to, label);
    if (m === TOOL) throw new Error(label + ' changed nothing');
    caught = probe(m) === true;
  } catch (e) {
    if (/anchor drifted|changed nothing/.test(e.message)) { fail++; console.error('FAIL ' + label + ' — ' + e.message); return; }
    caught = true;
  }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

// 1 — the flags are appended rather than placed canonically: every column present, every write still refused.
mut('H1  the flags are appended instead of placed at their canonical positions',
  '  var target = CANON.concat(extensions);',
  '  var target = live.concat(FLAGS.filter(function (f) { return live.indexOf(f) === -1; })).concat([]);',
  function (m) {
    var r = dryThenCommit(m, { rows: rows(5) });
    var v = KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: r.w.__price.__grid[0],
      expectedHeaders: AUTH.CANON, extraColumnsPolicy: 'ALLOW' });
    return v.schemaStatus !== 'SCHEMA_VALID';
  });

// 2 / 3 — an extension column is dropped. Values that exist today would simply cease to.
mut('H2  marketplace_id is dropped from the target layout',
  '  var extensions = live.filter(function (h) { return !canonSet[h]; });',
  "  var extensions = live.filter(function (h) { return !canonSet[h] && h !== 'marketplace_id'; });",
  function (m) {
    var w = makeWorld(m, { rows: rows(5) });
    return !/would_drop_columns = 0/.test(w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN());
  });
mut('H3  company is dropped from the target layout',
  '  var extensions = live.filter(function (h) { return !canonSet[h]; });',
  "  var extensions = live.filter(function (h) { return !canonSet[h] && h !== 'company'; });",
  function (m) {
    var w = makeWorld(m, { rows: rows(5) });
    return !/would_drop_columns = 0/.test(w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN());
  });

// 4 — an extension absent from production is invented, so the sheet gains a column nothing ever wrote.
mut('H4  the absent `asin` column is invented',
  '  var target = CANON.concat(extensions);',
  "  var target = CANON.concat(extensions).concat(['asin']);",
  function (m) {
    var r = dryThenCommit(m, { rows: rows(5) });
    return r.w.__price.__grid[0].indexOf('asin') !== -1;
  });

// 5 — THE DEFECT THE WHOLE PRICING MODEL GUARDS AGAINST.
mut('H5  the new authority flags are initialized FALSE instead of blank',
  "      row[c] = Object.prototype.hasOwnProperty.call(liveIdx, name) ? grid[r][liveIdx[name]] : '';",
  "      row[c] = Object.prototype.hasOwnProperty.call(liveIdx, name) ? grid[r][liveIdx[name]] : (FLAGS.indexOf(name) !== -1 ? 'FALSE' : '');",
  function (m) {
    var r = dryThenCommit(m, { rows: rows(5) });
    return /FAIL  regular_price_is_manual/.test(r.com) || !/SCHEMA_RECONCILE_PASS = YES/.test(r.com);
  });

// 6 — values are moved by column NUMBER. With the live order differing, this mis-assigns almost everything.
mut('H6  row values are projected by column index instead of by name',
  '      row[c] = Object.prototype.hasOwnProperty.call(liveIdx, name) ? grid[r][liveIdx[name]] : \'\';',
  "      row[c] = c < grid[r].length ? grid[r][c] : '';",
  function (m) {
    var w = makeWorld(m, { rows: rows(5) });
    var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
    return /MISMATCH/.test(r) || /DIFFERENCE/.test(r);
  });

// 7 — a duplicate header name is tolerated, making "which column did the data mean" unanswerable.
mut('H7  a duplicate header name is allowed through',
  '  if (dupNames.length || blanks.length) {',
  '  if (false) {',
  function (m) {
    // The first version overwrote `note` with a second `sku`, which ALSO removed a canonical column — so
    // the missing-column guard blocked it and the duplicate guard was never reached. The duplicate is now
    // an EXTRA column, leaving the guard under test as the only thing standing.
    var dup = LIVE.concat(['sku']);
    var w = makeWorld(m, { priceHeader: dup, rows: [dup.map(function () { return 'x'; })] });
    var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
    return !/BLOCKED/.test(r);
  });

// 8 — the drift gate is skipped, so a plan reviewed against one sheet is applied to another.
/* H8 — REPOINTED. `false && A || B || C` binds as `(false && A) || B || C`, so the other two conditions
   still fired and the gate still refused: the mutant injected a fault that a surviving half of the same
   guard caught. It now removes the whole condition. */
mut('H8  the live-drift gate is skipped',
  '  if (TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ !== liveHeaderHash\n      || TEMP_PR2S_EXPECT_LOGICAL_HASH_ !== logicalPre\n      || TEMP_PR2S_EXPECT_ROW_COUNT_ !== rowCount) {',
  '  if (false) {',
  function (m) {
    // Armed correctly from a real dry run, THEN the sheet moves. Unmutated the gate refuses the stale plan;
    // mutated it applies it. An unarmed world would prove nothing now, because the change_log gate would
    // refuse on its own and the mutant would look caught by a guard it never touched.
    var w = makeWorld(m, { rows: rows(5) });
    armFrom(w, w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN());
    w.__price.__grid[1][w.__price.__grid[0].indexOf('regular_price')] = 111.11;
    w.TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT();
    return w.__price.__rangeWrites > 0;
  });

/* 9 — A PRICE THAT CHANGES DURING THE REARRANGEMENT. The first version disabled the POST price check and
   expected that to be the only guard; it was not, and it was not even reached — the DRY RUN compares the
   projected logical hash against the pre hash and refuses before a single cell is written, which is the
   stronger property and the one worth asserting. The fault injected is the real one (a value silently
   altered while columns move); the detector is that NOTHING IS WRITTEN AT ALL. */
mut('H9  a price value is altered while the columns move',
  '    projected.push(row);',
  "    if (r === 1) row[target.indexOf('regular_price')] = 999999; projected.push(row);",
  function (m) {
    var w = makeWorld(m, { rows: rows(5) });
    var dry = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
    return /BLOCKED/.test(dry) && /MISMATCH/.test(dry) && w.__price.__rangeWrites === 0;
  });

// 10 — the logical hash drops the field NAMES, so it can no longer tell a rearrangement from a reassignment.
mut('H10 the logical hash ignores field names',
  "      parts.push(fields[f] + '|~|' + (c === undefined ? '' : tempPr2sStr_(grid[r][c])));",
  "      parts.push((c === undefined ? '' : tempPr2sStr_(grid[r][c])));",
  function (m) {
    // A field RENAMED, carrying the same value. Sorted into the same slot, it reads identically to a
    // name-less digest — and that is precisely a rearrangement being mistaken for a reassignment.
    var S = { Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON,
      isFinite: isFinite, Date: Date, Logger: { log: function () {} },
      Utilities: { DigestAlgorithm: { SHA_256: 'S' }, Charset: { UTF_8: 'U' },
        computeDigest: function (a, s) { var h = crypto.createHash('sha256').update(String(s), 'utf8').digest();
          return Array.prototype.slice.call(h).map(function (b) { return b > 127 ? b - 256 : b; }); } } };
    vm.createContext(S); vm.runInContext(m, S);
    var h1 = ['pricing_id', 'alpha'];
    var h2 = ['pricing_id', 'beta'];
    var g1 = [h1, ['P1', 'X']];
    var g2 = [h2, ['P1', 'X']];
    // Unmutated these MUST differ (alpha is not beta); mutated they collide.
    return S.tempPr2sLogicalHash_(h1, g1, h1) === S.tempPr2sLogicalHash_(h2, g2, h2);
  });

// 11 — the dry run falls through into the write path.
mut('H11 the dry run executes the commit path',
  '  if (!commit) {',
  '  if (false) {',
  function (m) {
    // The drift gate stops it writing — defence in depth, and not what this mutant is about. What it
    // must detect is that the function stopped BEING a dry run: it no longer completes as one.
    var w = makeWorld(m, { rows: rows(5) });
    var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
    return !/COMMIT_AUTHORIZED = NO — this was a DRY RUN\. ZERO WRITES\./.test(r);
  });

/* 12 — A PARTIAL WRITE REPORTED AS SUCCESS, which is the one outcome worse than a loud failure. The fault
   is injected where a partial write actually comes from — the range write landing fewer rows than the plan
   — and the detector is the POST validator refusing to call it a pass. The earlier version tampered with
   the projection instead, which the dry-run gate caught before the validator was ever reached. */
mut('H12 a partial write is treated as success',
  '      sh.getRange(1, 1, projected.length, target.length).setValues(projected);',
  '      sh.getRange(1, 1, 3, target.length).setValues(projected.slice(0, 3));',
  function (m) {
    var r = dryThenCommit(m, { rows: rows(5) });
    // A short write leaves the row COUNT intact — the untouched rows are still there, now holding their old
    // layout beneath the new header — so what the validator catches is the VALUES, not the count.
    return /SCHEMA_RECONCILE_PASS = NO/.test(r.com) && /FAIL  /.test(r.com);
  });

// 13 — the change_log drift gate is skipped, so the second table is migrated against a stale plan while the
// first is correctly gated. Only the log constants are wrong here; pricing_list's are armed and correct.
mut('H13 the change_log drift gate is skipped',
  '  if (TEMP_PR2S_EXPECT_LOG_HEADER_HASH_ !== logHeaderHash\n      || TEMP_PR2S_EXPECT_LOG_LOGICAL_HASH_ !== logLogicalPre\n      || TEMP_PR2S_EXPECT_LOG_ROW_COUNT_ !== logRowCount) {',
  '  if (false) {',
  function (m) {
    var w = makeWorld(m, { rows: rows(5), logRows: logRows(2) });
    armFrom(w, w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN());
    w.TEMP_PR2S_EXPECT_LOG_LOGICAL_HASH_ = 'stale-plan-from-a-different-sheet';
    w.TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT();
    return w.__log.__rangeWrites > 0;
  });

// 14 — the declared rename is not applied. The canonical key would simply be absent, and this tool does not
// provision a primary key out of nothing.
mut('H14 the declared rename is never applied',
  '    if (Object.prototype.hasOwnProperty.call(TEMP_PR2S_LOG_RENAME_, h)) {',
  '    if (false) {',
  function (m) {
    var w = makeWorld(m, { rows: rows(5) });
    var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
    return /BLOCKED/.test(r) && /log_id/.test(r) && w.__log.__rangeWrites === 0;
  });

// 15 — the collision guard is removed, so a rename onto an existing name MERGES two columns into one. Two
// columns are two facts, and nothing here is allowed to decide which of them survives.
mut('H15 a rename that collides with an existing column is allowed through',
  '  if (effDup.length) {',
  '  if (false) {',
  function (m) {
    var collide = ['pricing_log_id', 'log_id', 'pricing_id', 'field_name', 'old_value', 'new_value',
      'change_type', 'changed_by', 'changed_at', 'change_reason'];
    var lr = [collide.map(function (h, i) { return h + '-v' + i; })];
    var w = makeWorld(m, { rows: rows(2), logHeader: collide, logRows: lr });
    var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
    // Unmutated: BLOCKED. Mutated: it proceeds, and one of the two colliding columns is silently lost.
    return !/would merge/.test(r);
  });

// 16 — change_log values are moved by column NUMBER. The live order differs from the target in twelve of
// fifteen positions, so this mis-assigns almost every field.
mut('H16 change_log rows are projected by column index instead of by name',
  "      lrow[lc] = Object.prototype.hasOwnProperty.call(logEffIdx, ln) ? logGrid[lr][logEffIdx[ln]] : '';",
  "      lrow[lc] = lc < logGrid[lr].length ? logGrid[lr][lc] : '';",
  function (m) {
    var w = makeWorld(m, { rows: rows(5), logRows: logRows(3) });
    var r = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
    return /BLOCKED/.test(r) && w.__log.__rangeWrites === 0;
  });

// 17 — the write fails and NOTHING is rolled back, leaving pricing_list migrated and the change_log original.
// That pair still refuses every pricing write, while reading like progress.
mut('H17 a failed write leaves a half-migrated pair behind',
  '      tempPr2sAutoRollback_(ss, snapName, logSnapName).forEach(p);',
  '      p(\'(rollback skipped)\');',
  function (m) {
    var w = failingLogWrite(m);
    // Caught when pricing_list did NOT come back to its original header.
    return w.__price.__grid[0].length === 32;
  });

// 18 — the lock is never taken, so a concurrent writer and this migration can interleave.
mut('H18 the script lock is not required',
  '  if (!lock.tryLock(TEMP_PR2S_LOCK_MS_)) {',
  '  if (false) {',
  function (m) {
    var w = makeWorld(m, { rows: rows(5), lockDenied: true });
    armFrom(w, w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN());
    w.TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT();
    return w.__price.__rangeWrites > 0;
  });

// 19 — the POST state is checked only against this tool's OWN opinion of the layout, not against the gate
// that actually refuses pricing writes. A duplicated EXTENSION column passes every check the tool makes for
// itself — the canonical prefix is exact, the extensions are in order, and the logical hash is unmoved
// because both copies hold the same value — and is refused by the real classifier with HEADER_DUPLICATE.
mut('H19 the POST state is not put through the real production gate',
  "  if (typeof prodRequireSheet_ !== 'function') return 'UNAVAILABLE — 29_production_safety_adapter.gs not loaded';\n  try { prodRequireSheet_(ss, name, expectedHeaders); return 'PASS'; }\n  catch (e) { return 'FAIL ' + (e && e.message ? e.message : String(e)); }",
  "  return 'PASS';",
  function (m) {
    var m2 = faulted(m, '  var target = CANON.concat(extensions);',
      "  var target = CANON.concat(extensions).concat(['company']);", 'H19 inner');
    var r = dryThenCommit(m2, { rows: rows(5) });
    var v = KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: r.w.__price.__grid[0],
      expectedHeaders: AUTH.CANON, extraColumnsPolicy: 'ALLOW' });
    // The fault is real — the real gate refuses this sheet with HEADER_DUPLICATE. The ORIGINAL tool reports
    // SCHEMA_RECONCILE_PASS = NO on this same input, because it asks that gate. The mutant reports YES.
    return v.schemaStatus === 'HEADER_DUPLICATE' && /SCHEMA_RECONCILE_PASS = YES/.test(r.com);
  });

// 20 — ROLLBACK reports success without proving it. A write that was asked for is not a write that happened,
// and a rollback nobody verified is the one thing you find out about at the worst moment.
mut('H20 the rollback does not verify what it restored',
  '    if (!okHead || !okRows || !okData) throw new Error(\'restore of \' + pair[1] + \' did not reproduce the snapshot\');',
  '    if (false) throw new Error(\'unreachable\');',
  function (m) {
    var res = dryThenCommit(m, { rows: rows(5), logRows: logRows(2) });
    swallowWrites(res.w.__price);                       // the restore is asked for and silently does nothing
    var rb = res.w.TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK();
    return /ROLLBACK COMPLETE/.test(rb);
  });

// =============================================================================================================
console.log('\n' + pass + ' passed / ' + fail + ' failed   ·   ' + (mutCaught + mutSurvived) + ' mutants, ' + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
