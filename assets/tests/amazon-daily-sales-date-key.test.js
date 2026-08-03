// HOTFIX A — Amazon Daily Sales snapshot_date key idempotency.
// Exercises the ACTUAL source in assets/specs/active/apps-script/{08,09,10}_*.gs by extracting and
// eval'ing the real functions (amazonNormalizeDate_, amazonPad2_, amazonAddDaysStr_,
// amazonRollingCutoffDate_, amazonUpsertRollingSnapshot_, amazonReadDestDateCoverage_) — NOT a grep,
// NOT a re-implementation. Proves: a Google-Sheets Date cell and an incoming 'yyyy-MM-dd' string for the
// same calendar day produce byte-identical natural keys, so rolling upsert UPDATES instead of APPENDING;
// mixed-representation existing duplicates collapse; a repeated import is idempotent (no duplicate append);
// destination coverage recognizes Date-typed rows (no false "missing"); retention/prune uses the same
// canonical normalization. Natural key remains snapshot_date + country + marketplace + channel + sku.
// Run: node assets/tests/amazon-daily-sales-date-key.test.js

var fs = require('fs');
var path = require('path');

function readGs(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', name), 'utf8');
}
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

// ---- fake Apps Script host (type-preserving) ------------------------------
// Asia/Taipei is UTC+8 with no DST — deterministic shift is faithful for yyyy-MM-dd / timestamp formats.
var Utilities = {
  formatDate: function (date, tz, fmt) {
    var t = new Date(date.getTime() + 8 * 3600 * 1000);
    var y = t.getUTCFullYear();
    var mo = ('0' + (t.getUTCMonth() + 1)).slice(-2);
    var da = ('0' + t.getUTCDate()).slice(-2);
    var hh = ('0' + t.getUTCHours()).slice(-2);
    var mi = ('0' + t.getUTCMinutes()).slice(-2);
    var ss = ('0' + t.getUTCSeconds()).slice(-2);
    if (fmt === 'yyyy-MM-dd HH:mm:ss') return y + '-' + mo + '-' + da + ' ' + hh + ':' + mi + ':' + ss;
    return y + '-' + mo + '-' + da;
  }
};
// A Date whose Asia/Taipei calendar day is exactly (y-m-d) — models a real Sheets Date cell.
function taipeiDate(y, m, d) { return new Date(Date.UTC(y, m - 1, d) - 8 * 3600 * 1000); }

function makeSheet(grid) {
  return {
    _grid: grid,
    getLastRow: function () {
      var last = 0;
      for (var r = 0; r < this._grid.length; r++) {
        var any = false;
        for (var c = 0; c < this._grid[r].length; c++) {
          var v = this._grid[r][c];
          if (v !== '' && v !== null && v !== undefined) { any = true; break; }
        }
        if (any) last = r + 1;
      }
      return last;
    },
    getLastColumn: function () { return this._grid.length ? this._grid[0].length : 0; },
    getRange: function (row, col, numRows, numCols) {
      var self = this;
      return {
        getValues: function () {
          var out = [];
          for (var r = 0; r < numRows; r++) {
            var line = [];
            for (var c = 0; c < numCols; c++) {
              var gr = self._grid[row - 1 + r] || [];
              line.push(gr[col - 1 + c]);
            }
            out.push(line);
          }
          return out;
        },
        setValues: function (vals) {
          for (var r = 0; r < vals.length; r++) {
            while (self._grid.length <= row - 1 + r) self._grid.push([]);
            for (var c = 0; c < vals[r].length; c++) self._grid[row - 1 + r][col - 1 + c] = vals[r][c];
          }
        },
        clearContent: function () {
          for (var r = 0; r < numRows; r++) {
            if (!self._grid[row - 1 + r]) continue;
            for (var c = 0; c < numCols; c++) self._grid[row - 1 + r][col - 1 + c] = '';
          }
        }
      };
    }
  };
}
var SS_REGISTRY = {};
var SpreadsheetApp = {
  openById: function (id) {
    var sheets = SS_REGISTRY[id] || {};
    return { getSheetByName: function (n) { return sheets[n] || null; } };
  }
};

// ---- extract the REAL functions -------------------------------------------
var GS08 = readGs('08_amazon_import_sources.gs');
var GS09 = readGs('09_amazon_import_writer_logger.gs');
var GS10 = readGs('10_amazon_import_helpers.gs');

eval(extractFn(GS10, 'amazonPad2_'));
eval(extractFn(GS10, 'amazonNormalizeDate_'));
eval(extractFn(GS10, 'amazonAddDaysStr_'));
eval(extractFn(GS09, 'amazonRollingCutoffDate_'));
eval(extractFn(GS09, 'amazonUpsertRollingSnapshot_'));
eval(extractFn(GS08, 'amazonReadDestDateCoverage_'));

// ---- assertion harness -----------------------------------------------------
var fail = 0, pass = 0;
function ok(cond, l) { if (cond) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}

ok(typeof amazonUpsertRollingSnapshot_ === 'function', 'source: amazonUpsertRollingSnapshot_ extracted from 09_');
ok(typeof amazonReadDestDateCoverage_ === 'function', 'source: amazonReadDestDateCoverage_ extracted from 08_');
ok(typeof amazonNormalizeDate_ === 'function', 'source: amazonNormalizeDate_ extracted from 10_');

var NK = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku'];
var HEADER = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units', 'source_row_hash', 'synced_at', 'updated_at'];
function mkObj(date, sku, units, hash) {
  return {
    snapshot_date: date, country: 'US', marketplace: 'Amazon', channel: 'Amazon', sku: sku,
    sales_units: units, source_row_hash: hash, synced_at: '2026-08-03 16:00:00', updated_at: '2026-08-03 16:00:00'
  };
}
function rowOf(dateVal, sku, units, hash) {
  return [dateVal, 'US', 'Amazon', 'Amazon', sku, units, hash, '2026-07-30 16:00:00', '2026-07-30 16:00:00'];
}
// Register a sheet under a spreadsheet id/name so the REAL writer can openById/getSheetByName it.
var UPSERT_SEQ = 0;
function runUpsert(sheet, objs, cutoff) {
  UPSERT_SEQ++;
  var id = 'ss-' + UPSERT_SEQ;
  SS_REGISTRY[id] = { snap: sheet };
  return amazonUpsertRollingSnapshot_(id, 'snap', objs, NK, 'snapshot_date', 90, 'Asia/Taipei', cutoff);
}

// ===========================================================================
console.log('\n-- A. Date normalization (shared canonical rule) --');
eq(amazonNormalizeDate_(taipeiDate(2026, 7, 30)).value, '2026-07-30', 'A1 Date object → yyyy-MM-dd');
eq(amazonNormalizeDate_('2026-07-30').value, '2026-07-30', 'A2 date string → same yyyy-MM-dd');
eq(amazonNormalizeDate_('2026-07-30T00:00:00').value, '2026-07-30', 'A3 datetime string → canonical date');
eq(amazonNormalizeDate_('2026/7/5').value, '2026-07-05', 'A4 slashed/short → padded yyyy-MM-dd');
ok(amazonNormalizeDate_('not-a-date').ok === false, 'A5 invalid string → ok:false');
ok(amazonNormalizeDate_('').empty === true, 'A6 blank → empty:true');
eq(amazonNormalizeDate_(taipeiDate(2026, 7, 30)).value, amazonNormalizeDate_(taipeiDate(2026, 7, 30)).value, 'A7 deterministic repeat');
eq(amazonNormalizeDate_(taipeiDate(2026, 7, 30)).value, amazonNormalizeDate_('2026-07-30').value, 'A8 Date value and string value are byte-identical');

// ===========================================================================
console.log('\n-- C. Rolling upsert: Date-typed existing vs string incoming --');
// Existing sheet row stores snapshot_date as a real Date object (the production hazard).
var g1 = [HEADER.slice(), rowOf(taipeiDate(2026, 7, 30), 'CO1100-R', 5, 'OLDHASH')];
var sh1 = makeSheet(g1);
var res1 = runUpsert(sh1, [mkObj('2026-07-30', 'CO1100-R', 9, 'NEWHASH')], '2026-05-01');
eq({ appended: res1.appended, updated: res1.updated, total: res1.total }, { appended: 0, updated: 1, total: 1 }, 'C1 Date existing + string incoming → UPDATE not APPEND (no duplicate)');
eq(sh1.getLastRow(), 2, 'C2 sheet still has exactly 1 data row (header + 1)');
eq(sh1._grid[1][5], 9, 'C3 the existing row was updated in place (sales_units 5 → 9)');

// String existing + string incoming → UPDATE.
var g2 = [HEADER.slice(), rowOf('2026-07-30', 'CO1100-R', 5, 'OLDHASH')];
var sh2 = makeSheet(g2);
var res2 = runUpsert(sh2, [mkObj('2026-07-30', 'CO1100-R', 7, 'NEWHASH')], '2026-05-01');
eq({ appended: res2.appended, updated: res2.updated }, { appended: 0, updated: 1 }, 'C4 string existing + string incoming → UPDATE');

// Mixed-representation pre-existing duplicates collapse (Date row + string row, same natural key).
var g3 = [HEADER.slice(), rowOf(taipeiDate(2026, 7, 30), 'CO1100-R', 5, 'H1'), rowOf('2026-07-30', 'CO1100-R', 6, 'H2')];
var sh3 = makeSheet(g3);
var res3 = runUpsert(sh3, [], '2026-05-01');
eq({ dupRemoved: res3.duplicatesRemoved, total: res3.total }, { dupRemoved: 1, total: 1 }, 'C5 mixed Date/string duplicates recognized as one key → collapsed (last wins)');
eq(sh3._grid[1][5], 6, 'C6 last-wins winner preserved (later row, sales_units 6)');

// Different natural keys remain separate.
var g4 = [HEADER.slice(), rowOf(taipeiDate(2026, 7, 30), 'CO1100-R', 5, 'H1')];
var sh4 = makeSheet(g4);
var res4 = runUpsert(sh4, [mkObj('2026-07-30', 'CO2200-B', 8, 'H2')], '2026-05-01');
eq({ appended: res4.appended, total: res4.total }, { appended: 1, total: 2 }, 'C7 different SKU (same day) is a distinct key → appended, not merged');

// Changed metric updates the existing row (hash differs).
eq(sh1._grid[1][6], 'NEWHASH', 'C8 changed source_row_hash written on update');

// ===========================================================================
console.log('\n-- F. Retry / idempotency (repeated identical run) --');
var g5 = [HEADER.slice(), rowOf(taipeiDate(2026, 7, 30), 'CO1100-R', 5, 'HASH-A')];
var sh5 = makeSheet(g5);
var incoming = [mkObj('2026-07-30', 'CO1100-R', 5, 'HASH-A')];
runUpsert(sh5, incoming, '2026-05-01');
var after1 = sh5.getLastRow();
runUpsert(sh5, incoming, '2026-05-01');
var after2 = sh5.getLastRow();
eq({ after1: after1, after2: after2 }, { after1: 2, after2: 2 }, 'F1 running the SAME rolling import twice does NOT append a duplicate (idempotent)');

// ===========================================================================
console.log('\n-- E. Retention / prune (canonical date compare) --');
var gR = [HEADER.slice(),
  rowOf(taipeiDate(2026, 6, 1), 'IN-DATE', 1, 'h'),   // Date, inside window → keep
  rowOf('2026-06-15', 'IN-STR', 1, 'h'),              // string, inside → keep
  rowOf(taipeiDate(2026, 4, 30), 'OUT-DATE', 1, 'h'), // Date, before cutoff → prune
  rowOf('2026-04-29', 'OUT-STR', 1, 'h'),             // string, before cutoff → prune
  rowOf('2026-05-01', 'BOUNDARY', 1, 'h'),            // == cutoff → keep (inclusive)
  rowOf('', 'BLANK', 1, 'h')];                         // blank date → keep (cannot judge)
var shR = makeSheet(gR);
var resR = runUpsert(shR, [], '2026-05-01');
eq({ pruned: resR.pruned, total: resR.total }, { pruned: 2, total: 4 }, 'E1 Date+string inside kept, both outside pruned, boundary+blank kept (no mass deletion)');

// ===========================================================================
console.log('\n-- D. Destination coverage reader (Date-typed rows counted) --');
var covGrid = [HEADER.slice(),
  rowOf(taipeiDate(2026, 7, 30), 'CO1100-R', 5, 'h'),  // Date cell
  rowOf('2026-07-30', 'CO2200-B', 3, 'h'),             // string cell, same day, diff sku
  rowOf('2026-07-29', 'CO3300-X', 2, 'h'),             // string cell, prior day
  rowOf('garbage', 'CO4400-Z', 1, 'h')];               // invalid date → excluded safely
SS_REGISTRY['ss-cov'] = { snap: makeSheet(covGrid) };
var covConfig = { destinationSpreadsheetId: 'ss-cov', destinationSheetName: 'snap', naturalKey: NK };
var cov = amazonReadDestDateCoverage_(covConfig, '2026-07-01', '2026-07-31');
ok(!!cov['2026-07-30'], 'D1 Date-typed row bucketed under canonical 2026-07-30 (not a locale string)');
eq(cov['2026-07-30'].cnt, 2, 'D2 Date row + string row on same day both counted (present, not missing)');
eq(cov['2026-07-30'].keycnt, 2, 'D3 two distinct SKUs → keycnt 2');
ok(!!cov['2026-07-29'], 'D4 prior-day string row present');
ok(!cov['garbage'] && Object.keys(cov).length === 2, 'D5 invalid date excluded safely — no spurious coverage bucket');

// Mixed representation for the SAME key on the same day counts once.
var covGrid2 = [HEADER.slice(),
  rowOf(taipeiDate(2026, 7, 30), 'CO1100-R', 5, 'h'),
  rowOf('2026-07-30', 'CO1100-R', 5, 'h')];
SS_REGISTRY['ss-cov2'] = { snap: makeSheet(covGrid2) };
var cov2 = amazonReadDestDateCoverage_({ destinationSpreadsheetId: 'ss-cov2', destinationSheetName: 'snap', naturalKey: NK }, '2026-07-01', '2026-07-31');
eq({ cnt: cov2['2026-07-30'].cnt, keycnt: cov2['2026-07-30'].keycnt, dup: cov2['2026-07-30'].dup }, { cnt: 2, keycnt: 1, dup: 1 }, 'D6 Date + string for one key on one day → counted once (dup detected)');

// ===========================================================================
console.log('\n-- B. Natural-key preservation (dimensions still distinguish) --');
var gB = [HEADER.slice(), rowOf(taipeiDate(2026, 7, 30), 'CO1100-R', 5, 'h')];
var shB = makeSheet(gB);
// same date but different country → must append (country still distinguishes)
var objB = mkObj('2026-07-30', 'CO1100-R', 9, 'h2'); objB.country = 'CA';
var resB = runUpsert(shB, [objB], '2026-05-01');
eq({ appended: resB.appended, total: resB.total }, { appended: 1, total: 2 }, 'B1 non-date key dimension (country) still separates rows after date normalization');

// ===========================================================================
if (fail === 0) console.log('\nAll Amazon daily-sales date-key assertions passed (' + pass + ' assertions)');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
