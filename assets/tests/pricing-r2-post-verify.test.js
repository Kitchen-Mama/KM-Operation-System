// =============================================================================================================
// PRICING-R2-SCHEMA-RECONCILIATION-POST-VERIFY-R1
//
// The migration already validates itself after it writes. This suite is about the OTHER verifier — the one
// that shares nothing with it — and the property that makes it worth having: it has to catch a migration that
// the migration's own POST validator called a success.
//
// So the central case is not "the verifier says PASS on a good sheet". It is: take the REAL reconciliation
// tool, damage it in a way its own validator cannot see, run it, and require the independent verifier to
// refuse. A second opinion that agrees with the first by construction is not a second opinion.
// =============================================================================================================

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var VERIFY = readN('assets/tools/apps-script-diagnostics/TEMP_PRICING_R2_POST_VERIFY.gs');
var TOOL = readN('assets/tools/apps-script-diagnostics/TEMP_PRICING_R2_SCHEMA_RECONCILE.gs');
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

// The PRE shapes, transcribed from the production measurement — the state the migration started from.
var LIVE = ['pricing_id', 'marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price',
  'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price',
  'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'];
var LIVE_LOG = ['pricing_log_id', 'pricing_id', 'sku', 'country', 'marketplace', 'field_name',
  'old_value', 'new_value', 'old_currency', 'new_currency', 'change_type', 'changed_by', 'changed_at',
  'change_reason', 'source'];

function fakeSheet(name, grid) {
  var g = grid.map(function (r) { return r.slice(); });
  var S = {
    // Per-cell number formats, default "@". The verifier reads these to prove no numeric base column is
    // carrying a date format. This fake stores them beside the values rather than coercing on read — a
    // test that wants a Date IN the cell puts a real Date there, which is exactly what getValues would
    // hand back, so both halves of the §3 proof are expressible without pretending to be Sheets.
    __fmt: g.map(function (r) { return r.map(function () { return '@'; }); }),
    __grid: g, __name: name, __rangeWrites: 0, __cellWrites: 0, __cleared: 0, __widened: 0,
    getName: function () { return S.__name; },
    setName: function (n) { S.__name = n; return S; },
    getLastRow: function () { return g.length; },
    getLastColumn: function () { return g.length ? g[0].length : 0; },
    getMaxColumns: function () { return g.length ? g[0].length : 0; },
    insertColumnsAfter: function (after, n) { S.__widened += n; g.forEach(function (r) { for (var i = 0; i < n; i++) r.push(''); }); },
    clear: function () { S.__cleared++; g.length = 0; },
    getDataRange: function () {
      return {
        getValues: function () { return g.map(function (r) { return r.slice(); }); },
        // Carries values, types and formats in the real API. Here it carries the cell objects as they are,
        // which is the closest a fake gets; what the suite can prove is that the restore goes through
        // THIS and not through setValues.
        copyTo: function (destRange) {
          var d = destRange.__sheet;
          d.__grid.length = 0;
          g.forEach(function (row) { d.__grid.push(row.slice()); });
          d.__copyToWrites = (d.__copyToWrites || 0) + 1;
        }
      };
    },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        __sheet: S, __r: r, __c: c,
        getNumberFormats: function () {
          var o = [];
          for (var i = 0; i < nr; i++) {
            var row = [];
            for (var j = 0; j < nc; j++) row.push(((S.__fmt[r - 1 + i] || [])[c - 1 + j]) || '@');
            o.push(row);
          }
          return o;
        },
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

/**
 * One spreadsheet holding BOTH tools, exactly as the operator's project does. That matters: the verifier can
 * see every tempPr2s* function from here, so "it does not call them" is a restraint it has to actually
 * exercise rather than one the sandbox enforces for it.
 */
function makeWorld(opts) {
  opts = opts || {};
  var price = fakeSheet('pricing_list', [opts.priceHeader || LIVE].concat(opts.rows || rows(5)));
  var log = fakeSheet('pricing_change_log', [opts.logHeader || LIVE_LOG].concat(opts.logRows || []));
  var extra = {};
  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number,
    Math: Math, JSON: JSON, isFinite: isFinite, Date: Date, RegExp: RegExp,
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
      formatDate: function () { return '20260923-181500'; },
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
  price.copyTo = function () { var c = fakeSheet('copy', price.__grid);
    var o = c.setName; c.setName = function (n) { extra[n] = c; return o.call(c, n); }; return c; };
  log.copyTo = function () { var c = fakeSheet('copy', log.__grid);
    var o = c.setName; c.setName = function (n) { extra[n] = c; return o.call(c, n); }; return c; };

  vm.createContext(S);
  // The REAL 04_marketplace_forecast_import.gs, so the verifier's §1 contract cross-check is measured
  // against the actual import rather than against a stub written to agree with it. Nothing in it is ever
  // CALLED here — only stringified.
  if (opts.gs04 !== null) vm.runInContext(opts.gs04 || GS04, S, { filename: '04_marketplace_forecast_import.gs' });
  vm.runInContext(opts.tool || TOOL, S, { filename: 'TEMP_PRICING_R2_SCHEMA_RECONCILE.gs' });
  vm.runInContext(opts.verify || VERIFY, S, { filename: 'TEMP_PRICING_R2_POST_VERIFY.gs' });
  // DECLARED, not inherited. Every case in this suite except section J verifies a SCHEMA-ONLY migration,
  // where no value may move; leaving the mode at whatever the file happens to default to would mean these
  // assertions silently changed meaning the next time that default did.
  S.PV_MODE_ = opts.mode || 'SCHEMA_ONLY';
  // The base-source tables, present so the sync-mode section can use them and absent-by-default behaviour
  // stays honest: a SCHEMA_ONLY run must never consult them.
  if (opts.mskuRows || opts.skuRows) {
    extra['marketplace_skus'] = fakeSheet('marketplace_skus',
      [opts.mskuHeader || ['marketplace_sku_id', 'sku']].concat(opts.mskuRows || []));
    extra['sku_details'] = fakeSheet('sku_details',
      [opts.skuHeader || ['sku', 'selling_price', 'minimum_price', 'msrp', 'base_currency']]
        .concat(opts.skuRows || []));
  }
  return S;
}

/** Arm the reconcile tool from its own dry run, commit, then arm the verifier from the PRE snapshot. */
function migrateThenVerify(opts) {
  var w = makeWorld(opts);
  var dry = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN();
  function grab(re) { var m = re.exec(dry); return m ? m[1] : null; }
  w.TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ = grab(/^LIVE_HEADER_HASH\s+=\s+(\S+)/m);
  w.TEMP_PR2S_EXPECT_LOGICAL_HASH_ = grab(/^FULL_LOGICAL_HASH_PRE\s+=\s+(\S+)/m);
  w.TEMP_PR2S_EXPECT_ROW_COUNT_ = Number(grab(/^ROW_COUNT_PRE\s+=\s+(\d+)/m));
  w.TEMP_PR2S_EXPECT_LOG_HEADER_HASH_ = grab(/^LOG_HEADER_HASH\s+=\s+(\S+)/m);
  w.TEMP_PR2S_EXPECT_LOG_LOGICAL_HASH_ = grab(/^LOG_FULL_LOGICAL_HASH_PRE\s+=\s+(\S+)/m);
  w.TEMP_PR2S_EXPECT_LOG_ROW_COUNT_ = Number(grab(/LIVE pricing_change_log header \(\d+ columns\), ROW_COUNT = (\d+)/));
  var com = w.TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT();
  armVerifier(w);
  if (opts && opts.beforeVerify) opts.beforeVerify(w);
  return { w: w, dry: dry, com: com, ver: w.TEMP_PRICING_R2_POST_VERIFY() };
}

/**
 * The frozen baseline in the shipped file is production's. Here it is measured from the PRE snapshot the
 * migration just took, using THE VERIFIER'S OWN digest — "what PRE was, as this verifier measures it" is
 * exactly what the constants mean, and computing them with the migration tool's digest instead would quietly
 * re-introduce the dependency the whole file exists to avoid.
 */
function armVerifier(w) {
  var snapName = Object.keys(w.__extra).filter(function (k) { return k.indexOf('PRE__pricing_list__') === 0; }).sort().pop();
  if (!snapName) return w;
  var g = w.__extra[snapName].__grid;
  var head = g[0].map(w.pvStr_);
  var idCol = head.indexOf('pricing_id');
  var ids = [];
  for (var r = 1; r < g.length; r++) ids.push(w.pvStr_(g[r][idCol]));
  w.PV_PRE_ROW_COUNT_ = g.length - 1;
  w.PV_PRE_IDS_HASH_ = w.pvSha_(ids.join('\n'));
  // Armed with the MIGRATION tool's digest, because that is what produced the frozen constant on production.
  // If pvBaselineHash_ ever stops reproducing that encoding, every value test in this file fails — which is
  // the only reason those tests mean anything about the shipped constant.
  w.PV_PRE_LOGICAL_HASH_ = w.tempPr2sLogicalHash_(head, g, w.PV_PRE_FIELDS_);
  return w;
}

function bare(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

// =============================================================================================================
section('A · THE VERIFIER SHARES NOTHING WITH THE THING IT VERIFIES');
// =============================================================================================================
{
  var B = bare(VERIFY);
  // Both files are loaded into one project, so every tempPr2s* helper is in scope here. Not using them is a
  // restraint the file has to keep, not one the runtime keeps for it.
  ok(!/tempPr2s/.test(B), 'A1  the verifier CODE calls no function belonging to the migration tool');
  ok(/tempPr2s/.test(bare(TOOL)), 'A1a while the migration tool is full of them — they really are in scope');
  ok(/function pvSha_/.test(B) && /function pvLogicalHash_/.test(B),
    'A2  it carries its own digest and its own logical hash');

  // If the two implementations agreed by copy, a wrong digest would be wrong identically on both sides and
  // the agreement would prove nothing. So the independent digest is written in its own encoding — measured
  // on the FUNCTION, because the file also contains a baseline digest that is REQUIRED to use the tool's
  // encoding, and a whole-file check cannot tell those two apart.
  function body(src, name) {
    var i = src.indexOf('function ' + name + '(');
    if (i === -1) return '';
    var j = src.indexOf('\n}', i);
    return src.slice(i, j === -1 ? src.length : j);
  }
  var indep = body(VERIFY, 'pvLogicalHash_');
  var baseline = body(VERIFY, 'pvBaselineHash_');
  ok(indep.length > 100 && baseline.length > 100, 'A3  both digest functions are found');
  ok(!/\|~\||\|#\|/.test(indep),
    'A3a the INDEPENDENT digest uses none of the reconciliation tool\'s separators');
  ok(/\|~\|/.test(baseline) && /\|#\|/.test(baseline),
    'A3b while the BASELINE digest uses exactly them — it has to be comparable to the frozen number');
  ok(/'\|#\|'/.test(TOOL), 'A3c and that really is the tool\'s encoding');

  ok(!/setValue|setValues|appendRow|insertColumns|deleteColumn|deleteRow|\.clear\(/.test(B),
    'A4  READ ONLY BY CONSTRUCTION — no write call of any kind appears in the code');
  ok(!/LockService/.test(B), 'A5  and it takes no lock, because it changes nothing that needs one');
  ok(!/PRE__pricing_list__.*remove|deleteSheet/.test(B), 'A6  it never deletes a snapshot');

  // AND YET ONE NUMBER MUST BE COMPARABLE. The frozen PV_PRE_LOGICAL_HASH_ came out of the reconciliation
  // tool, in its encoding. A digest of a different encoding of the same rows is a different number, so
  // comparing the two would fail on a perfect sheet and tell the operator to restore a snapshot over a
  // correct migration. pvBaselineHash_ exists to be comparable; pvLogicalHash_ exists to be independent.
  var w = makeWorld({ rows: rows(25) });
  var g = w.__price.__grid;
  var hd = g[0].map(w.pvStr_);
  eq(w.pvBaselineHash_(hd, g, w.PV_PRE_FIELDS_), w.tempPr2sLogicalHash_(hd, g, w.PV_PRE_FIELDS_),
    'A7  the BASELINE digest reproduces the reconciliation tool\'s, byte for byte');
  ok(w.pvLogicalHash_(hd, g, w.PV_PRE_FIELDS_, 'pricing_id') !== w.tempPr2sLogicalHash_(hd, g, w.PV_PRE_FIELDS_),
    'A7a while the INDEPENDENT digest deliberately does not — that is what makes agreement mean something');
  // Both still have to be real digests of the data, not constants that happen to line up.
  var g2 = g.map(function (r2) { return r2.slice(); });
  g2[1][hd.indexOf('regular_price')] = 0.01;
  ok(w.pvBaselineHash_(hd, g2, w.PV_PRE_FIELDS_) !== w.pvBaselineHash_(hd, g, w.PV_PRE_FIELDS_),
    'A7b and the baseline digest still moves when a value moves');
}

// =============================================================================================================
section('B · A REAL MIGRATION, VERIFIED BY THE OTHER IMPLEMENTATION');
// =============================================================================================================
{
  var r = migrateThenVerify({ rows: rows(495) });
  ok(/SCHEMA_RECONCILE_PASS = YES/.test(r.com), 'B0  the migration reports success');
  ok(/PRICING_R2_DB_SCHEMA = SEALED/.test(r.ver), 'B1  and the INDEPENDENT verifier seals it');
  ok(/PRICING_SCHEMA_MIGRATION_PASS = YES/.test(r.ver), 'B1a with every invariant passing');
  ok(!/FAIL  /.test(r.ver), 'B1b and not one FAIL line');

  ok(/ROW_COUNT_POST                = 495/.test(r.ver), 'B2  ROW_COUNT_POST = 495');
  ok(/COLUMN_COUNT_POST             = 32/.test(r.ver), 'B3  COLUMN_COUNT_POST = 32');
  ok(/PRICING_LIST_CANONICAL_ORDER  = EXACT 1\.\.30/.test(r.ver), 'B4  canonical positions 1..30 exact');
  ok(/PRICING_LIST_EXTENSIONS       = marketplace_id, company/.test(r.ver), 'B5  extensions at 31 / 32');
  ok(/CHANGE_LOG_COLUMN_COUNT       = 15/.test(r.ver), 'B6  change_log is 15 columns');
  ok(/CHANGE_LOG_PK                 = log_id   \(pricing_log_id GONE\)/.test(r.ver),
    'B7  the PK is log_id and pricing_log_id is gone');
  ok(/CHANGE_LOG_CANONICAL_ORDER    = EXACT 1\.\.9/.test(r.ver), 'B8  change_log canonical order exact');

  ['PRICING_IDS', 'BASE_VALUES', 'FX_VALUES', 'AUTO_VALUES', 'EFFECTIVE_VALUES', 'EXTENSION_VALUES'].forEach(function (g) {
    ok(new RegExp(g + '_UNCHANGED\\s+= YES').test(r.ver), 'B9  ' + g + '_UNCHANGED = YES');
  });
  ok(/PRICING_LIST_PROD_REQUIRE_SHEET = PASS/.test(r.ver), 'B10 the real gate accepts pricing_list');
  ok(/CHANGE_LOG_PROD_REQUIRE_SHEET   = PASS/.test(r.ver), 'B11 and pricing_change_log');
  ok(/ROLLBACK_REQUIRED               = NO/.test(r.ver), 'B12 ROLLBACK_REQUIRED = NO');
  ok(/PRE_SNAPSHOT_TABS               = PRE__pricing_list__\S+, PRE__pricing_change_log__\S+/.test(r.ver),
    'B13 both PRE snapshot tabs are named');

  // The header hash is SUPPOSED to move. The layout changed on purpose.
  ok(/the HEADER hash is EXPECTED to differ/.test(r.ver),
    'B14 and it says the header hash is expected to differ, rather than treating that as a fault');
}

// =============================================================================================================
section('C · THE THREE-STATE FLAG CENSUS — READ FROM THE RAW CELL');
// =============================================================================================================
{
  var r = migrateThenVerify({ rows: rows(20) });
  AUTH.FLAGS.forEach(function (f) {
    ok(new RegExp(f + '  blank=20  TRUE=0  FALSE=0  OTHER=0').test(r.ver),
      'C1  ' + f + ' blank on all 20, no TRUE, no FALSE');
  });

  // FALSE IS NOT BLANK. Blank is UNKNOWN — nobody has said. FALSE is a claim that the system owns the field
  // and the next FX run may overwrite it, and a migration that wrote it would have made that claim for the
  // whole price book at once.
  var rf = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    var c = w.__price.__grid[0].indexOf('regular_price_is_manual');
    w.__price.__grid[3][c] = false;                          // a BOOLEAN false, as a checkbox column yields
  } });
  ok(/FAIL  regular_price_is_manual FALSE == 0/.test(rf.ver),
    'C2  a single boolean FALSE among 20 blanks is caught — false is not blank');
  ok(/regular_price_is_manual  blank=19  TRUE=0  FALSE=1/.test(rf.ver), 'C2a and counted as FALSE, not blank');
  ok(/cells are BOOLEAN, not text — the column is formatted as a checkbox/.test(rf.ver),
    'C2b with the checkbox formatting called out, because that is how blanks silently become false');
  ok(/PRICING_R2_DB_SCHEMA = NOT SEALED/.test(rf.ver), 'C2c and the schema is NOT sealed');
  // Nothing was lost — a flag wrongly set is a shape fault, not a data fault.
  ok(/ROLLBACK_REQUIRED               = NO — every VALUE invariant passed/.test(rf.ver),
    'C2d ROLLBACK is NOT required for it: no value moved, and restoring would discard a good migration');

  var rt = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    var c = w.__price.__grid[0].indexOf('msrp_is_manual');
    w.__price.__grid[5][c] = 'TRUE';
  } });
  ok(/FAIL  msrp_is_manual TRUE == 0/.test(rt.ver), 'C3  a TRUE is caught too — the migration claims neither owner');

  var ro = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    var c = w.__price.__grid[0].indexOf('minimum_price_is_manual');
    w.__price.__grid[7][c] = 'yes';
  } });
  ok(/FAIL  minimum_price_is_manual OTHER == 0/.test(ro.ver), 'C4  and anything that is none of the three');
  ok(/OTHER row 8: "yes"/.test(ro.ver), 'C4a naming the row and the value rather than just a count');
}

// =============================================================================================================
section('D · IT CATCHES A MIGRATION THAT PASSED ITS OWN VALIDATOR');
// =============================================================================================================
{
  // THE POINT OF THE WHOLE FILE. The migration tool's POST validator compares its own hash against its own
  // PRE reading. Damage BOTH sides identically — corrupt the value on the way in AND in the snapshot the
  // comparison is made against — and it verifies clean while the data is wrong. The independent verifier
  // compares POST against the snapshot it can see and against the frozen baseline, and refuses.
  var NL = TOOL.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  function faulted(src, from, to, tag) {
    var a = from.split('\n').join(NL), b = to.split('\n').join(NL);
    if (src.indexOf(a) === -1) throw new Error(tag + ' anchor drifted — the fault would inject nothing');
    return src.split(a).join(b);
  }

  // A blind spot that is real: the migration's PRICE_VALUES hash and FULL_LOGICAL hash are computed from
  // `grid`, the array it read at the start. Corrupt the array itself and every comparison it makes is made
  // between two equally-wrong sides.
  // (1) the write lands a value that is not the one the plan proved.
  var corrupted = faulted(TOOL,
    '      sh.getRange(1, 1, projected.length, target.length).setValues(projected);',
    "      var damaged = projected.map(function (row, ri) { return ri === 0 ? row : row.map(function (v, ci) {\n"
    + "        return ci === target.indexOf('regular_price') ? 0.01 : v; }); });\n"
    + '      sh.getRange(1, 1, damaged.length, target.length).setValues(damaged);',
    'corrupt-write');
  // (2) and the self-check that would have caught it is the part that is broken.
  var blind = faulted(corrupted,
    '    function check(label, cond, detail) { checks.push({ label: label, ok: !!cond, detail: detail }); }',
    '    function check(label, cond, detail) { checks.push({ label: label, ok: true, detail: detail }); }',
    'blind-validator');

  var r = migrateThenVerify({ rows: rows(10), tool: blind });
  ok(/SCHEMA_RECONCILE_PASS = YES/.test(r.com) && !/FAIL  /.test(r.com),
    'D1  the migration reports a clean PASS with not one FAIL line, while every effective price is wrong');
  ok(/PRICING_R2_DB_SCHEMA = NOT SEALED/.test(r.ver), 'D2  and the independent verifier refuses to seal it');
  ok(/FAIL  EFFECTIVE_VALUES_UNCHANGED/.test(r.ver), 'D3  naming EFFECTIVE_VALUES as the group that moved');
  ok(/WRITE COMPLETE/.test(r.com), 'D3a the migration did write — this is a committed sheet, not a blocked run');
  ok(/FAIL  FULL_LOGICAL_HASH == frozen PRE/.test(r.ver), 'D4  and the frozen baseline disagreeing too');
  ok(/ROLLBACK_REQUIRED               = YES/.test(r.ver), 'D5  THIS one requires rollback — data is gone');
  ok(/EFFECTIVE_VALUES_UNCHANGED\s+= NO/.test(r.ver), 'D6  reported as NO in the §7 block');
  // The groups that did not move must still read YES, or the report cannot tell you where to look.
  ok(/BASE_VALUES_UNCHANGED\s+= YES/.test(r.ver), 'D7  while BASE_VALUES, untouched, still reads YES');
  ok(/EXTENSION_VALUES_UNCHANGED\s+= YES/.test(r.ver), 'D7a and EXTENSION_VALUES too');
}

// =============================================================================================================
section('E · WHAT ELSE IT REFUSES');
// =============================================================================================================
{
  // A row lost between migration and verification.
  var rr = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) { w.__price.__grid.pop(); } });
  ok(/FAIL  ROW_COUNT_POST == 495/.test(rr.ver) || /FAIL  snapshot ROW_COUNT == POST ROW_COUNT/.test(rr.ver),
    'E1  a row that disappeared after the migration is caught');
  ok(/PRICING_R2_DB_SCHEMA = NOT SEALED/.test(rr.ver), 'E1a and nothing is sealed');

  // An extension column quietly dropped.
  var rd = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    w.__price.__grid.forEach(function (row) { row.pop(); });          // company gone
  } });
  ok(/FAIL  company at position 32/.test(rd.ver), 'E2  a dropped extension column is caught');
  ok(/FAIL  EXTENSION_VALUES_UNCHANGED/.test(rd.ver), 'E2a including its values');
  ok(/ROLLBACK_REQUIRED               = YES/.test(rd.ver), 'E2b and that IS a data loss — rollback required');

  // The canonical block out of order — the exact fault this whole programme exists to repair.
  var rw = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    var g = w.__price.__grid;
    g.forEach(function (row) { var t = row[2]; row[2] = row[3]; row[3] = t; });
  } });
  ok(/FAIL  canonical positions 1\.\.30 EXACT/.test(rw.ver), 'E3  a canonical order fault is caught');
  ok(/FAIL  prodRequireSheet_ pricing_list PASS/.test(rw.ver),
    'E3a and the REAL gate refuses it, which is what would have blocked every price write');

  // A duplicate header — invisible to a prefix check, refused by the real classifier.
  var rdup = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    w.__price.__grid.forEach(function (row, i) { row.push(i === 0 ? 'company' : 'x'); });
  } });
  ok(/FAIL  DUPLICATE_HEADER_NAMES == 0/.test(rdup.ver), 'E4  a duplicate header is caught');
  ok(/FAIL  prodRequireSheet_ pricing_list PASS   \[FAIL HEADER_DUPLICATE\]/.test(rdup.ver),
    'E4a with the real classifier naming HEADER_DUPLICATE');

  // An extension nobody declared. Not automatically wrong — but not silently accepted either.
  var ru = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    w.__price.__grid.forEach(function (row, i) { row.push(i === 0 ? 'asin' : ''); });
  } });
  ok(/FAIL  UNKNOWN_EXTENSIONS == 0/.test(ru.ver), 'E5  an undeclared extension column is reported');

  // pricing_log_id still there: the rename did not happen.
  var rl = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    w.__log.__grid[0][0] = 'pricing_log_id';
  } });
  ok(/FAIL  change_log PK is log_id at position 1/.test(rl.ver), 'E6  a rename that did not happen is caught');
  ok(/FAIL  pricing_log_id NO LONGER EXISTS/.test(rl.ver), 'E6a stated as its own invariant');
  ok(/pricing_log_id STILL PRESENT/.test(rl.ver), 'E6b and called out in the §7 block');

  // Rows appearing in the change log after the migration — a fact to see, not to average away.
  var rlr = migrateThenVerify({ rows: rows(20), beforeVerify: function (w) {
    w.__log.__grid.push(w.__log.__grid[0].map(function () { return 'z'; }));
  } });
  ok(/FAIL  change_log ROW_COUNT == 0/.test(rlr.ver), 'E7  a change_log row appearing afterwards is reported');
}

// =============================================================================================================
section('F · THE TWO DECLARATIONS, AND THE MISSING SNAPSHOT');
// =============================================================================================================
{
  // Verifying the sheet only against the same list the migration was driven from would let ONE wrong list
  // produce a wrong sheet that verifies clean. The transcribed expectation exists to disagree.
  var w = makeWorld({ rows: rows(5) });
  w.PV_EXPECTED_CANONICAL_ = w.PV_EXPECTED_CANONICAL_.slice();
  w.PV_EXPECTED_CANONICAL_[2] = 'marketplace_id';        // the historical drift, as if it were canonical
  var r = w.TEMP_PRICING_R2_POST_VERIFY();
  ok(/DECLARATION_CROSS_CHECK pricing_list       = \*\*\* DISAGREE \*\*\*/.test(r),
    'F1  a disagreement between 73_ and the transcribed order BLOCKS before anything is verified');
  ok(/Nothing is verified against a contested list/.test(r), 'F1a and says why');
  ok(!/PRICING_R2_DB_SCHEMA = SEALED/.test(r), 'F1b nothing is sealed on a contested list');

  // No snapshot: the frozen-baseline proof still stands, but the independent one does not, and the report
  // must not quietly present one proof as two.
  var r2 = migrateThenVerify({ rows: rows(20), beforeVerify: function (w2) {
    Object.keys(w2.__extra).forEach(function (k) { delete w2.__extra[k]; });
  } });
  ok(/NO PRE SNAPSHOT FOUND/.test(r2.ver), 'F2  a missing snapshot is reported, not skipped');
  ok(/FAIL  PRE snapshot available for independent comparison/.test(r2.ver), 'F2a as a failed invariant');
  ok(/PRICING_IDS_UNCHANGED\s+= NOT MEASURED \(no snapshot\)/.test(r2.ver),
    'F2b and the per-group answers say NOT MEASURED rather than YES');
  ok(/PRE_SNAPSHOT_TABS               = \(none\)/.test(r2.ver), 'F2c PRE_SNAPSHOT_TABS = (none)');

  // The snapshots survive the verification. They are the way back, and this round is not the one that
  // decides they are no longer needed.
  var r3 = migrateThenVerify({ rows: rows(20) });
  eq(Object.keys(r3.w.__extra).length, 2, 'F3  both snapshot tabs still exist after verifying');
  eq(r3.w.__price.__rangeWrites, 1, 'F4  and the verifier added no write of its own');
  eq(r3.w.__log.__rangeWrites, 1, 'F4a on either table');
  eq(r3.w.__price.__cleared, 0, 'F4b and cleared nothing');
}

// =============================================================================================================
section('G · NOT A RELEASE FILE');
// =============================================================================================================
{
  var health = readN('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  ok(health.indexOf('TEMP_PRICING_R2_POST_VERIFY') === -1, 'G1  no manifest row');
  ok(!fs.existsSync(path.join(ROOT, 'assets/specs/active/apps-script/TEMP_PRICING_R2_POST_VERIFY.gs')),
    'G2  it does not sit in the deployed directory');
  ok(!/var\s+\w*_BUILD_VERSION_\s*=/.test(VERIFY) && !/var\s+SYS_DEPLOYMENT_RELEASE_\s*=/.test(VERIFY),
    'G3  it declares no build stamp and no release identity');
  ok(/PRW_BUILD_VERSION_/.test(VERIFY), 'G3a while printing which authority build it measured against');
}

// =============================================================================================================
section('H · MUTANTS');
// =============================================================================================================
function nl(src, t) { return src.indexOf('\r\n') !== -1 ? t.split('\n').join('\r\n') : t; }
function faultedV(src, from, to, tag) {
  var a = nl(src, from), b = nl(src, to);
  if (src.indexOf(a) === -1) throw new Error(tag + ' anchor drifted — the mutant would inject nothing');
  return src.split(a).join(b);
}
function mut(label, from, to, probe) {
  var caught = false;
  try {
    var m = faultedV(VERIFY, from, to, label);
    if (m === VERIFY) throw new Error(label + ' changed nothing');
    caught = probe(m) === true;
  } catch (e) {
    if (/anchor drifted|changed nothing/.test(e.message)) { fail++; console.error('FAIL ' + label + ' — ' + e.message); return; }
    caught = true;
  }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

// 1 — blank and FALSE are counted as the same thing, which is the defect the entire pricing model is built
// around. It would seal a price book newly declared system-owned from end to end.
mut('H1  a FALSE authority flag is counted as blank',
  "    if (v === '') out.blank++;\n    else if (/^true$/i.test(v)) out.TRUE++;\n    else if (/^false$/i.test(v)) out.FALSE++;",
  "    if (v === '' || /^false$/i.test(v)) out.blank++;\n    else if (/^true$/i.test(v)) out.TRUE++;\n    else if (false) out.FALSE++;",
  function (m) {
    var r = migrateThenVerify({ rows: rows(20), verify: m, beforeVerify: function (w) {
      var c = w.__price.__grid[0].indexOf('regular_price_is_manual');
      for (var i = 1; i <= 20; i++) w.__price.__grid[i][c] = false;
    } });
    return /PRICING_R2_DB_SCHEMA = SEALED/.test(r.ver);
  });

// 2 — the verifier borrows the migration tool's digest, so a wrong digest is wrong identically on both sides.
// 2 — the snapshot comparison compares POST against POST. This is the shape every self-verification takes:
// two readings of the same thing, agreeing because they are the same thing. The per-group answers then
// report every value group as unchanged on a sheet whose values changed.
mut('H2  the snapshot comparison compares POST against itself',
  "      var a = pvLogicalHash_(snapHead, snapGrid, g.fields, 'pricing_id');",
  "      var a = pvLogicalHash_(head, grid, g.fields, 'pricing_id');",
  function (m) {
    var r = migrateThenVerify({ rows: rows(10), verify: m, beforeVerify: function (w) {
      var c = w.__price.__grid[0].indexOf('regular_price');
      for (var i = 1; i <= 10; i++) w.__price.__grid[i][c] = 0.01;
    } });
    return !/FAIL  EFFECTIVE_VALUES_UNCHANGED/.test(r.ver);
  });

// 3 — the frozen baseline is not compared at all, so the only surviving proof is the snapshot one.
mut('H3  the frozen PRE baseline is never compared',
  "  valueCheck('FULL_LOGICAL_HASH == frozen PRE', postLogical === PV_PRE_LOGICAL_HASH_);",
  "  valueCheck('FULL_LOGICAL_HASH == frozen PRE', true);",
  function (m) {
    var r = migrateThenVerify({ rows: rows(10), verify: m, beforeVerify: function (w) {
      // Both the sheet AND the snapshot altered the same way: only the frozen baseline can still tell.
      var c = w.__price.__grid[0].indexOf('regular_price');
      w.__price.__grid[1][c] = 0.01;
      var snap = w.__extra[Object.keys(w.__extra).filter(function (k) { return /^PRE__pricing_list__/.test(k); })[0]];
      snap.__grid[1][snap.__grid[0].indexOf('regular_price')] = 0.01;
    } });
    return !/FAIL  FULL_LOGICAL_HASH == frozen PRE/.test(r.ver);
  });

// 4 — the snapshot comparison is positional between two grids, so it means nothing unless row N is the same
// row on both sides. Without the identity check, two sorted-differently grids compare "equal" per column.
mut('H4  row identity between snapshot and POST is not established',
  "    valueCheck('row order preserved (pricing_id matches row for row)', sameOrder);",
  "    valueCheck('row order preserved (pricing_id matches row for row)', true);",
  function (m) {
    var r = migrateThenVerify({ rows: rows(10), verify: m, beforeVerify: function (w) {
      var g = w.__price.__grid;
      var t = g[1]; g[1] = g[2]; g[2] = t;                 // two rows swapped after the migration
    } });
    return !/FAIL  row order preserved/.test(r.ver);
  });

// 5 — a shape failure is reported as a data loss, which sends the operator to restore a snapshot over a
// migration whose values are all intact. The wrong repair is not a smaller mistake than no repair.
mut('H5  every failure is treated as a reason to roll back',
  "  p('ROLLBACK_REQUIRED               = ' + (valueFailures.length ? 'YES — ' + valueFailures.join('; ')",
  "  p('ROLLBACK_REQUIRED               = ' + (!allOk ? 'YES — ' + checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.label; }).join('; ')",
  function (m) {
    var r = migrateThenVerify({ rows: rows(20), verify: m, beforeVerify: function (w) {
      var c = w.__price.__grid[0].indexOf('msrp_is_manual');
      w.__price.__grid[3][c] = 'TRUE';                     // a flag fault: no value moved
    } });
    return /ROLLBACK_REQUIRED               = YES/.test(r.ver);
  });

// 6 — the real production gate is replaced by the verifier's own opinion of the layout, which cannot see a
// duplicate beyond the canonical prefix.
mut('H6  prodRequireSheet_ is not consulted',
  "  try { prodRequireSheet_(ss, name, expected); return 'PASS'; }\n  catch (e) { return 'FAIL ' + (e && e.message ? e.message : String(e)); }",
  "  return 'PASS';",
  function (m) {
    var r = migrateThenVerify({ rows: rows(20), verify: m, beforeVerify: function (w) {
      w.__price.__grid.forEach(function (row, i) { row[31] = i === 0 ? 'marketplace_id' : row[31]; });
    } });
    return !/FAIL  prodRequireSheet_ pricing_list PASS/.test(r.ver);
  });

// 7 — the missing snapshot is silently treated as "nothing to compare", so one proof is presented as two.
mut('H7  a missing PRE snapshot is not reported as a gap',
  "    check('PRE snapshot available for independent comparison', false, 'none found');",
  "    check('PRE snapshot available for independent comparison', true, 'none found');",
  function (m) {
    var r = migrateThenVerify({ rows: rows(20), verify: m, beforeVerify: function (w) {
      Object.keys(w.__extra).forEach(function (k) { delete w.__extra[k]; });
    } });
    return /PRICING_R2_DB_SCHEMA = SEALED/.test(r.ver);
  });

// 8 — only the grouped fields are compared, so a PRE column nobody thought to put in a group can move
// unnoticed. price_status is in no group.
mut('H8  only the grouped fields are compared, not every PRE field',
  "    valueCheck(scopeLabel, movedFields.length === 0, movedFields.join(','));",
  "    valueCheck(scopeLabel, true, '');",
  function (m) {
    var r = migrateThenVerify({ rows: rows(10), verify: m, beforeVerify: function (w) {
      var c = w.__price.__grid[0].indexOf('price_status');
      w.__price.__grid[1][c] = 'published';
      // and the frozen baseline is armed from the snapshot, so blind it the same way
      w.PV_PRE_LOGICAL_HASH_ = w.pvLogicalHash_(w.__price.__grid[0].map(w.pvStr_), w.__price.__grid,
        w.PV_PRE_FIELDS_, 'pricing_id');
    } });
    return !/FAIL  EVERY one of the 29 PRE fields is unchanged/.test(r.ver);
  });

// 9 — THE BUG THIS FILE SHIPPED ONCE. The frozen baseline is compared in the wrong ENCODING: a digest of a
// different serialisation of identical rows. Nothing is wrong with the sheet, nothing is wrong with the
// migration, and the verifier reports a data loss and tells the operator to restore a snapshot over it.
mut('H9  the frozen baseline is compared in an encoding it was never measured in',
  "      parts.push(f[i] + '|~|' + (c === undefined ? '' : pvStr_(grid[r][c])));",
  "      parts.push(f[i] + '=' + (c === undefined ? '' : pvStr_(grid[r][c])));",
  function (m) {
    var r = migrateThenVerify({ rows: rows(20), verify: m });
    // A GOOD migration. Caught when the verifier calls it a data loss anyway.
    return /SCHEMA_RECONCILE_PASS = YES/.test(r.com) && /ROLLBACK_REQUIRED               = YES/.test(r.ver);
  });

// =============================================================================================================
// =============================================================================================================
section('J · BASE_SOURCE_SYNC MODE — the acceptance rule that replaces "unchanged from PRE"');
// =============================================================================================================
{
  // sku_details holds values DELIBERATELY different from the pre-migration pricing_list. A sync that did
  // nothing would leave 29.99 / 20 / 39.99 in place, so "the target equals the source" cannot be satisfied
  // by the tool simply not running.
  var SKUD_HEAD = ['sku', 'selling_price', 'minimum_price', 'msrp', 'base_currency'];
  function skuRows(over) {
    var a = [];
    for (var i = 1; i <= 5; i++) {
      a.push(['SKU-' + i, 31.5 + i, 21, (i % 2 ? 35 : 40), 'USD']);
    }
    if (over) over(a);
    return a;
  }
  function mskuRows() {
    var a = [];
    for (var i = 1; i <= 5; i++) a.push(['MSKU-' + i, 'SKU-' + i]);
    return a;
  }

  /** Apply the authorised base sync to the POST sheet, the way the migration did on production. */
  function applySync(w, sd) {
    var g = w.__price.__grid;
    var head = g[0];
    var byId = {};
    sd.forEach(function (r) { byId[r[0]] = r; });
    var cSku = head.indexOf('sku');
    var map = [['base_regular_price', 1], ['base_minimum_price', 2], ['base_msrp', 3], ['base_currency', 4]];
    for (var r2 = 1; r2 < g.length; r2++) {
      var src = byId[g[r2][cSku]];
      if (!src) continue;
      map.forEach(function (m) { g[r2][head.indexOf(m[0])] = src[m[1]]; });
    }
  }

  function syncRun(opts) {
    opts = opts || {};
    var sd = skuRows(opts.overSource);
    return migrateThenVerify({
      rows: rows(5), mskuRows: mskuRows(), skuRows: sd, skuHeader: SKUD_HEAD,
      beforeVerify: function (w) {
        applySync(w, sd);
        w.PV_MODE_ = 'BASE_SOURCE_SYNC';
        // Production's census is 495 rows; this world is 5. The cross-check is armed for THIS world so a
        // fixture size cannot masquerade as a production disagreement.
        w.PV_EXPECTED_BASE_CENSUS_ = {
          base_regular_price: { nonblank: 5, blank: 0 }, base_minimum_price: { nonblank: 5, blank: 0 },
          base_msrp: { nonblank: 5, blank: 0 }, base_currency: { nonblank: 5, blank: 0 }
        };
        if (opts.after) opts.after(w);
      }
    });
  }

  // J1 — AN AUTHORISED BASE SYNC DOES NOT TRIGGER ROLLBACK. This is the whole reason the mode exists: the
  // old rule reported data loss on this exact sheet and recommended restoring a snapshot over it.
  var r1 = syncRun();
  ok(/PV_MODE_ = BASE_SOURCE_SYNC/.test(r1.ver), 'J1  the run declares the mode it is judging by');
  ok(/ROLLBACK_REQUIRED               = NO/.test(r1.ver), 'J1a an authorised base sync does NOT ask for rollback');
  ok(/BASE_SOURCE_MATCH_PASS          = YES/.test(r1.ver), 'J1b because the base values match sku_details');
  ok(/PRICING_R2_BASE_LAYER           = SEALED/.test(r1.ver), 'J1c and the base layer seals');
  ok(/BASE_VALUES.*CHANGED \(expected — base sync\)/.test(r1.ver), 'J1d the mutation is named as expected');
  ok(/EXPECTED mutation observed in: /.test(r1.ver), 'J1e and the moved fields are listed');
  ok(/UNEXPECTED mutation observed in: \(none\)/.test(r1.ver), 'J1f with nothing outside the declared set');
  ok(/BASE_SOURCE_CONTRACT_AGREES = YES/.test(r1.ver), 'J1g §1 contract re-derived and agreeing');
  ok(/BASE_SOURCE_JOIN_AGREES = YES/.test(r1.ver), 'J1h §1 join re-derived and agreeing');
  ok(/SKU_DETAILS_MATCHED = 5/.test(r1.ver), 'J1i every row resolved to exactly one source');
  ok(/JOIN_AMBIGUITY_COUNT = 0/.test(r1.ver), 'J1j no ambiguity');

  // AND THE SAME SHEET UNDER THE OLD RULE. If this did not fail, J1 would be proving nothing: the mode
  // would be decorative and the sheet would have passed either way.
  var rOld = migrateThenVerify({
    rows: rows(5), mskuRows: mskuRows(), skuRows: skuRows(), skuHeader: SKUD_HEAD,
    beforeVerify: function (w) { applySync(w, skuRows()); }      // mode stays SCHEMA_ONLY
  });
  ok(/ROLLBACK_REQUIRED               = YES/.test(rOld.ver),
    'J2  the SAME sheet under SCHEMA_ONLY demands a rollback — which is the defect this mode fixes');
  ok(/BASE_VALUES_UNCHANGED/.test(rOld.ver), 'J2a naming BASE_VALUES as the loss it thinks it found');

  // J3 — a base value that does NOT match sku_details fails, and names the row.
  var r3 = syncRun({ after: function (w) {
    var g = w.__price.__grid; g[1][g[0].indexOf('base_msrp')] = 999;
  } });
  ok(/BASE_MSRP_MISMATCH_COUNT = 1/.test(r3.ver), 'J3  a base value disagreeing with sku_details is counted');
  ok(/MISMATCH  PRC-1001 \| SKU-1 \| source 35/.test(r3.ver), 'J3a and the row is named, both sides shown');
  ok(/ROLLBACK_REQUIRED               = YES/.test(r3.ver), 'J3b it is a VALUE failure, so rollback is required');
  ok(/PRICING_R2_BASE_LAYER           = NOT SEALED/.test(r3.ver), 'J3c and the base layer does not seal');

  // J4 — a blank source must leave a blank target; a blank source with a VALUE in pricing_list is a
  // mismatch, not a pass. Blank is the one that is easiest to get wrong in the forgiving direction.
  // applySync copies the source faithfully, blanks included, so blanking the source alone would blank the
  // target too and prove nothing. The target is put back on purpose: a blank source against a price is the
  // forgiving direction, and it is the one that has to fail.
  var r4 = syncRun({
    overSource: function (a) { a[2][3] = ''; },
    after: function (w) { var g = w.__price.__grid; g[3][g[0].indexOf('base_msrp')] = 39.99; }
  });
  ok(/BASE_MSRP_MISMATCH_COUNT = 1/.test(r4.ver),
    'J4  a blank source against a nonblank target is a mismatch, not a tolerated blank');
  ok(/ROLLBACK_REQUIRED               = YES/.test(r4.ver), 'J4e and it is a value failure');
  var r4b = syncRun({
    overSource: function (a) { a[2][3] = ''; },
    after: function (w) { var g = w.__price.__grid; g[3][g[0].indexOf('base_msrp')] = ''; }
  });
  ok(/BASE_MSRP_BLANK_MATCH_COUNT = 1/.test(r4b.ver), 'J4a blank source + blank target is a MATCH...');
  ok(/BASE_MSRP_MISMATCH_COUNT = 0/.test(r4b.ver), 'J4b ...and counts zero mismatches');
  ok(/BASE_SOURCE_MATCH_PASS          = YES/.test(r4b.ver), 'J4c and still seals');
  ok(/BASE_MSRP_MATCH_COUNT = 4/.test(r4b.ver), 'J4d with the blank counted apart from the four matches');

  // J5 — FX / auto / effective drift still fails, in sync mode, exactly as before. The narrowing is four
  // names; it is not a relaxation.
  [['fx_rate', 'FX_VALUES'], ['auto_msrp', 'AUTO_VALUES'], ['msrp', 'EFFECTIVE_VALUES'],
   ['company', 'EXTENSION_VALUES'], ['marketplace_sku_id', 'PRICING_IDS']].forEach(function (pair) {
    var rr = syncRun({ after: function (w) {
      var g = w.__price.__grid; g[1][g[0].indexOf(pair[0])] = 'MOVED';
    } });
    ok(new RegExp('FAIL  ' + pair[1] + '_UNCHANGED').test(rr.ver),
      'J5  ' + pair[0] + ' drifting still fails ' + pair[1] + '_UNCHANGED in sync mode');
    ok(/ROLLBACK_REQUIRED               = YES/.test(rr.ver), 'J5a ' + pair[0] + ' drift still demands rollback');
    ok(new RegExp('UNEXPECTED mutation observed in: .*' + pair[0]).test(rr.ver),
      'J5b ' + pair[0] + ' is named as an UNEXPECTED mutation');
  });

  // J6 — a field outside the four, that nobody grouped, still gets caught by the all-fields sweep.
  var r6 = syncRun({ after: function (w) {
    var g = w.__price.__grid; g[1][g[0].indexOf('price_status')] = 'published';
  } });
  ok(/FAIL  EVERY PRE field OUTSIDE the declared mutation set is unchanged/.test(r6.ver),
    'J6  an ungrouped field outside the declared set is still data loss');
  ok(/ROLLBACK_REQUIRED               = YES/.test(r6.ver), 'J6a and still asks for the snapshot back');

  // J7 — a base sync that changed NOTHING is a finding too. Sealing there would seal the old data.
  var r7 = migrateThenVerify({
    rows: rows(5), mskuRows: mskuRows(), skuRows: skuRows(), skuHeader: SKUD_HEAD,
    beforeVerify: function (w) { w.PV_MODE_ = 'BASE_SOURCE_SYNC'; }        // no applySync
  });
  ok(/FAIL  BASE_VALUES changed from PRE \(expected in BASE_SOURCE_SYNC mode\)/.test(r7.ver),
    'J7  a base sync that moved nothing is reported, not sealed as clean');
  ok(/the base sync appears not to have run/.test(r7.ver), 'J7a in words the operator can act on');

  // J8 — §3 type and format. A Date in base_msrp is the original incident; a date FORMAT on a numeric
  // base cell is the mechanism that produced it. Both are reported, and the first is a value failure.
  var r8 = syncRun({ after: function (w) {
    var g = w.__price.__grid; g[1][g[0].indexOf('base_msrp')] = new Date(Date.UTC(1900, 1, 3));
  } });
  ok(/BASE_MSRP_DATE_VALUE_COUNT      = 1/.test(r8.ver), 'J8  a Date in base_msrp is counted');
  ok(/ROLLBACK_REQUIRED               = YES/.test(r8.ver), 'J8a and is a value failure');
  var r9 = syncRun({ after: function (w) {
    w.__price.__fmt[1][w.__price.__grid[0].indexOf('base_msrp')] = 'yyyy-mm-dd';
  } });
  ok(/NUMERIC_BASE_FIELDS_WITH_DATE_FORMAT = 1/.test(r9.ver),
    'J9  a date FORMAT on a numeric base cell is caught even while the value is still a number');
  ok(/ROLLBACK_REQUIRED               = YES/.test(r9.ver), 'J9a it is the mechanism of the incident, so it blocks');

  // J10 — ambiguity on either hop is never resolved by picking one.
  var r10 = migrateThenVerify({
    rows: rows(5), mskuRows: mskuRows().concat([['MSKU-2', 'SKU-2']]), skuRows: skuRows(), skuHeader: SKUD_HEAD,
    beforeVerify: function (w) { applySync(w, skuRows()); w.PV_MODE_ = 'BASE_SOURCE_SYNC'; }
  });
  ok(/JOIN_AMBIGUITY_COUNT = 1/.test(r10.ver), 'J10 a duplicate marketplace_sku_id is ambiguous');
  ok(/FAIL  JOIN_AMBIGUITY_COUNT == 0/.test(r10.ver), 'J10a and fails');

  // J11 — with no source tables at all, the four declared fields are verified by NOTHING. That must not
  // seal: unverified is not the same as correct, and this is the failure mode the narrowing could create.
  var r11 = migrateThenVerify({
    rows: rows(5),
    beforeVerify: function (w) { w.PV_MODE_ = 'BASE_SOURCE_SYNC'; }        // no marketplace_skus/sku_details
  });
  ok(/FAIL  base source tables present/.test(r11.ver),
    'J11 sync mode with no source table is a VALUE failure, not a quiet pass');
  ok(/ROLLBACK_REQUIRED               = YES/.test(r11.ver), 'J11a and cannot seal');

  ok(/PRICING_R2_DB_SCHEMA = SEALED/.test(r1.ver), 'J12 and the clean sync seals the schema too');
}

// =============================================================================================================
section('K · MUTATION — the ways the narrowing could quietly become a relaxation');
// =============================================================================================================

// K1 — the narrowing is applied to EVERY field instead of the four declared ones, so nothing outside the
// mutation set is checked any more. This is the one real danger in the whole change.
mut('K1  sync mode skips the PRE check for every field, not just the declared four',
  "      if (syncMode && PV_BASE_SYNC_FIELDS_.indexOf(f) !== -1) movedExpected.push(f);",
  "      if (syncMode) movedExpected.push(f);",
  function (m) {
    var sd = [];
    for (var i = 1; i <= 5; i++) sd.push(['SKU-' + i, 31.5 + i, 21, (i % 2 ? 35 : 40), 'USD']);
    var ms = [];
    for (var j = 1; j <= 5; j++) ms.push(['MSKU-' + j, 'SKU-' + j]);
    var r = migrateThenVerify({
      rows: rows(5), mskuRows: ms, skuRows: sd, verify: m,
      skuHeader: ['sku', 'selling_price', 'minimum_price', 'msrp', 'base_currency'],
      beforeVerify: function (w) {
        var g = w.__price.__grid, hd = g[0];
        var by = {}; sd.forEach(function (x) { by[x[0]] = x; });
        for (var r2 = 1; r2 < g.length; r2++) {
          var s2 = by[g[r2][hd.indexOf('sku')]];
          if (!s2) continue;
          [['base_regular_price', 1], ['base_minimum_price', 2], ['base_msrp', 3], ['base_currency', 4]]
            .forEach(function (p2) { g[r2][hd.indexOf(p2[0])] = s2[p2[1]]; });
        }
        g[1][hd.indexOf('auto_msrp')] = 'MOVED';
        w.PV_MODE_ = 'BASE_SOURCE_SYNC';
        w.PV_EXPECTED_BASE_CENSUS_ = {
          base_regular_price: { nonblank: 5, blank: 0 }, base_minimum_price: { nonblank: 5, blank: 0 },
          base_msrp: { nonblank: 5, blank: 0 }, base_currency: { nonblank: 5, blank: 0 }
        };
      }
    });
    // The grouped AUTO_VALUES check still fires; what the mutant destroys is the all-fields sweep, so the
    // fingerprint is that auto_msrp is no longer named as an UNEXPECTED mutation.
    return !/UNEXPECTED mutation observed in: .*auto_msrp/.test(r.ver);
  });

// K2 — the base comparison always agrees. The four fields would then be "verified" by a function that
// cannot fail, which is indistinguishable from not verifying them at all.
mut('K2  the base-vs-sku_details comparison can never fail',
  "            if (!okRow) {",
  "            if (false) {",
  function (m) {
    var sd = [];
    for (var i = 1; i <= 5; i++) sd.push(['SKU-' + i, 31.5 + i, 21, (i % 2 ? 35 : 40), 'USD']);
    var ms = [];
    for (var j = 1; j <= 5; j++) ms.push(['MSKU-' + j, 'SKU-' + j]);
    var r = migrateThenVerify({
      rows: rows(5), mskuRows: ms, skuRows: sd, verify: m,
      skuHeader: ['sku', 'selling_price', 'minimum_price', 'msrp', 'base_currency'],
      beforeVerify: function (w) {
        var g = w.__price.__grid, hd = g[0];
        var by = {}; sd.forEach(function (x) { by[x[0]] = x; });
        for (var r2 = 1; r2 < g.length; r2++) {
          var s2 = by[g[r2][hd.indexOf('sku')]];
          if (!s2) continue;
          [['base_regular_price', 1], ['base_minimum_price', 2], ['base_msrp', 3], ['base_currency', 4]]
            .forEach(function (p2) { g[r2][hd.indexOf(p2[0])] = s2[p2[1]]; });
        }
        g[1][hd.indexOf('base_msrp')] = 999;            // a base value that disagrees with the source
        w.PV_MODE_ = 'BASE_SOURCE_SYNC';
        w.PV_EXPECTED_BASE_CENSUS_ = {
          base_regular_price: { nonblank: 5, blank: 0 }, base_minimum_price: { nonblank: 5, blank: 0 },
          base_msrp: { nonblank: 5, blank: 0 }, base_currency: { nonblank: 5, blank: 0 }
        };
      }
    });
    return !/BASE_MSRP_MISMATCH_COUNT = 1/.test(r.ver);
  });

// K3 — a missing source table is downgraded to a shape finding, so an unverifiable base layer seals.
mut('K3  a missing source table no longer blocks the seal',
  "      valueCheck('base source tables present (' + PV_MSKU_TAB_ + ', ' + PV_SKU_TAB_ + ')', false,",
  "      check('base source tables present (' + PV_MSKU_TAB_ + ', ' + PV_SKU_TAB_ + ')', false,",
  function (m) {
    var r = migrateThenVerify({
      rows: rows(5), verify: m, beforeVerify: function (w) { w.PV_MODE_ = 'BASE_SOURCE_SYNC'; }
    });
    return !/ROLLBACK_REQUIRED               = YES/.test(r.ver);
  });

// K4 — the mode is INFERRED from the sheet instead of declared. A verifier that picks its own rules can
// always find a set under which the thing in front of it passes.
mut('K4  the mode is inferred rather than declared',
  "  var syncMode = PV_MODE_ === 'BASE_SOURCE_SYNC';",
  "  var syncMode = true;",
  function (m) {
    // The sheet the mutant can actually hide: a SCHEMA_ONLY migration whose base values happen to agree
    // with sku_details. The real file judges it by SCHEMA_ONLY rules and calls the drift data loss; the
    // mutant judges it by sync rules, finds the base matching, and seals a migration nobody declared.
    var sd = [];
    for (var i = 1; i <= 5; i++) sd.push(['SKU-' + i, 31.5 + i, 21, (i % 2 ? 35 : 40), 'USD']);
    var ms = [];
    for (var j = 1; j <= 5; j++) ms.push(['MSKU-' + j, 'SKU-' + j]);
    var r = migrateThenVerify({
      rows: rows(5), mskuRows: ms, skuRows: sd, verify: m,
      skuHeader: ['sku', 'selling_price', 'minimum_price', 'msrp', 'base_currency'],
      beforeVerify: function (w) {
        var g = w.__price.__grid, hd = g[0];
        var by = {}; sd.forEach(function (x) { by[x[0]] = x; });
        for (var r2 = 1; r2 < g.length; r2++) {
          var s2 = by[g[r2][hd.indexOf('sku')]];
          if (!s2) continue;
          [['base_regular_price', 1], ['base_minimum_price', 2], ['base_msrp', 3], ['base_currency', 4]]
            .forEach(function (p2) { g[r2][hd.indexOf(p2[0])] = s2[p2[1]]; });
        }
        w.PV_EXPECTED_BASE_CENSUS_ = {
          base_regular_price: { nonblank: 5, blank: 0 }, base_minimum_price: { nonblank: 5, blank: 0 },
          base_msrp: { nonblank: 5, blank: 0 }, base_currency: { nonblank: 5, blank: 0 }
        };
        // PV_MODE_ deliberately LEFT at SCHEMA_ONLY. That is the declaration under test.
      }
    });
    return !/ROLLBACK_REQUIRED               = YES/.test(r.ver);
  });

console.log('\n' + pass + ' passed / ' + fail + ' failed   ·   ' + (mutCaught + mutSurvived) + ' mutants, ' + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
