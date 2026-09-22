// Kitchen Mama Operation System — FC SPECIAL EVENT STAGE-2 LARGE BATCH R1
// Run: node assets/tests/fc-special-stage2-large-batch-r1.test.js
//
// THE OPERATOR FAILURE THIS LOCKS SHUT. A Special Event save with >90 authored SKUs committed stage 1
// (campaigns) and then died at stage 2 with "the API redirect target had already expired, so the answer
// to upsertCampaignSkuLines was a 404 page instead of data."
//
// THE REDIRECT WAS THE SYMPTOM, NOT THE CAUSE, and the cause was not payload size. Measured against the
// real handler with a counting spreadsheet, `handleUpsertCampaignSkuLines_` cost 3N+1 FULL sheet reads:
// one inside campaignLineFindByKey_, one inside fcWriteUpsert_, and — the expensive one — a whole-sheet
// re-read PER LINE purely to compute that line's row_version for the receipt.
//
//     N=1     12 physical calls        N=50    404
//     N=8     68                       N=100   804   (301 getDataRange + 403 getRange + 100 appendRow)
//
// On a sheet that grows as it writes. Apps Script ran past the single-use googleusercontent echo
// target's lifetime, the delivery hop 404'd — and because the cost is DETERMINISTIC, the write
// transport's ONE licensed replay (upsertCampaignSkuLines is in REPLAY_SAFE_ON_LOST_DELIVERY_) did
// exactly the same work and died exactly the same way. That is why the operator saw it fail, not retry
// past it.
//
// It is now ONE read, in-memory resolution and full-width range writes: SIX physical calls at every N
// from 1 to 200. The §9 matrix below drives the resulting behaviour, not the call count alone.
//
// PRODUCTION VOLUME. The operator states a single Special Event routinely carries 100+ SKUs, so N=100
// is normal operating volume rather than an edge case, N=150 is required, and N=200 is the safety
// margin. All three are driven below, and the cost at 200 is the cost at 1.
//
// NOTHING IN THE BUSINESS CONTRACT MOVED. The refusals, the business-key precedence, the unchanged
// rule, the fingerprints, the created/updated/unchanged counts and the per-index receipts are the ones
// that were there before. Stage 3, `campaigns`, Special Event uniqueness, Base Event FC and the window
// rules are untouched.
//
// NO network call, NO Apps Script execution, NO DB / Drive / Sheets write, NO deployment.

var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'specs/active/apps-script/';
var G14 = read(GS + '14_fc_write_handlers.gs');
var G20 = read(GS + '20_campaign_write_handlers.gs');
var G29 = read(GS + '29_production_safety_adapter.gs');
var FCS = read('js/pages/fc-summary.js');
var API = read('js/api/operation-system-db-api.js');
var KMSAFE = require(path.join(ROOT, 'js', 'core', 'supply-planning-production-safety.js'));

var HEADERS = eval(/var CAMPAIGN_SKU_LINES_HEADERS_ = (\[[\s\S]*?\]);/.exec(G20)[1]);

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, extra) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function faulted(src, from, to, tag) {
  if (src.indexOf(from) === -1) throw new Error(tag + ' anchor drifted — the mutant would inject nothing');
  return src.split(from).join(to);
}

// =============================================================================================
// THE SHEET WORLD — the real handler, a fake Spreadsheet, and a log of every physical call.
// =============================================================================================
function mkSheet(headers, dataRows, log) {
  var grid = [headers.slice()].concat(dataRows.map(function (r) { return r.slice(); }));
  return {
    __grid: grid,
    getDataRange: function () { log.push({ op: 'getDataRange' });
      return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col, nr, nc) {
      log.push({ op: 'getRange', row: row, col: col, nr: nr, nc: nc });
      return {
        getValues: function () { var o = []; for (var i = 0; i < (nr || 1); i++) {
          var r = grid[row - 1 + i] || []; o.push(r.slice(col - 1, col - 1 + (nc || 1))); } return o; },
        setValues: function (vals) {
          log.push({ op: 'setValues', row: row, col: col, nr: vals.length, nc: (vals[0] || []).length });
          for (var i = 0; i < vals.length; i++) { var t = row - 1 + i;
            while (grid.length <= t) grid.push(new Array(headers.length).fill(''));
            for (var j = 0; j < vals[i].length; j++) grid[t][col - 1 + j] = vals[i][j]; } },
        setValue: function (v) { log.push({ op: 'setValue', row: row, col: col });
          while (grid.length <= row - 1) grid.push(new Array(headers.length).fill(''));
          grid[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (r) { log.push({ op: 'appendRow' }); grid.push(r.slice()); }
  };
}
function world(existingRows, src20) {
  var log = [], locks = [];
  var lines = mkSheet(HEADERS, existingRows || [], log);
  var ss = { getId: function () { return 'TESTDB'; },
    getSheetByName: function (n) { return n === 'campaign_sku_lines' ? lines : null; },
    insertSheet: function () { return lines; } };
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, KMSAFE: KMSAFE, PRODUCTION_DB_SPREADSHEET_ID_: 'TESTDB',
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-22 00:00:00'; },
      getUuid: (function () { var n = 0; return function () { n++; return ('u' + n) + '-bbbb-cccc-dddd-ee'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { locks.push('t'); return true; },
      releaseLock: function () { locks.push('r'); } }; } },
    jsonResponse_: function (o) { return o; } };
  vm.createContext(sb);
  vm.runInContext(G29, sb); vm.runInContext(G14, sb); vm.runInContext(src20 || G20, sb);
  return { sb: sb, log: log, locks: locks, sheet: lines };
}
function counts(log) {
  var c = { getDataRange: 0, getRange: 0, setValues: 0, setValue: 0, appendRow: 0 };
  log.forEach(function (e) { if (c[e.op] !== undefined) c[e.op]++; });
  c.total = c.getDataRange + c.getRange + c.setValues + c.setValue + c.appendRow;
  return c;
}
function mkLines(n, over) {
  var out = [];
  for (var i = 1; i <= n; i++) {
    out.push(Object.assign({ sku: 'SKU-' + String(i).padStart(3, '0'), marketplace_sku_id: 'MSK-' + i,
      deal_price: 10 + i, regular_price: 20 + i, price_units: 'USD', discount_percent: 50,
      special_condition: '', line_status: 'active' }, over || {}));
  }
  return out;
}
function rowFor(o) { return HEADERS.map(function (h) { return o[h] === undefined ? '' : o[h]; }); }
function dataRows(sheet) { return sheet.__grid.slice(1).filter(function (r) { return String(r.join('')).trim() !== ''; }); }
function colOf(n) { return HEADERS.indexOf(n); }

// =============================================================================================
section('A · §5 — the physical write model is bounded, and the same at every N');
// =============================================================================================
var COST = {};
// PRODUCTION VOLUME, stated by the operator: a single Special Event routinely carries 100+ SKUs, so
// N=100 is NORMAL, N=150 must pass, and N=200 is the safety margin — not an edge case among them.
[1, 8, 20, 50, 100, 150, 200].forEach(function (n) {
  var w = world([]);
  var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(n), actor: 't' });
  var c = counts(w.log);
  COST[n] = c;
  ok(res && res.success === true, 'A' + n + ' N=' + n + ' succeeds');
  eq(res.data.lines.length, n, 'A' + n + 'a one receipt per input line, in input order');
  eq(c.getDataRange, 1, 'A' + n + 'b exactly ONE authoritative read at N=' + n);
  eq(c.appendRow, 0, 'A' + n + 'c and no appendRow loop');
  eq(c.setValue, 0, 'A' + n + 'd and no per-cell write loop');
});
eq(COST[1].total, COST[200].total,
   'A6 the cost is CONSTANT — N=200 costs exactly what N=1 costs',
   { n1: COST[1].total, n100: COST[100].total, n150: COST[150].total, n200: COST[200].total });
ok(COST[200].total <= 8, 'A7 …and that constant is small', COST[200].total);
eq(COST[200].setValues, 1, 'A8 two hundred new lines are written as ONE range block');
// The old handler's cost was 8N + 4. Stated as the thing the operator actually felt: at the volumes
// they work at, it issued hundreds of full-sheet reads and ran past the echo target's lifetime.
eq([COST[100].getDataRange, COST[150].getDataRange, COST[200].getDataRange], [1, 1, 1],
   'A8a ONE authoritative read at 100, 150 and 200 alike');

// The receipts are positional and complete — a batch may not answer about a line it was not given.
(function () {
  var w = world([]);
  var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(100), actor: 't' });
  var skus = res.data.lines.map(function (l) { return l.sku; });
  eq(skus, mkLines(100).map(function (l) { return l.sku; }), 'A9 receipts are in input order, one per index');
  ok(res.data.lines.every(function (l) { return /^CSL-/.test(l.campaign_sku_line_id); }),
     'A10 every receipt carries a minted id');
  ok(res.data.lines.every(function (l) { return !!l.row_version; }), 'A11 and a row_version');
  eq(new Set(res.data.lines.map(function (l) { return l.campaign_sku_line_id; })).size, 100,
     'A12 and 100 DISTINCT ids — no line adopted another line’s row');
})();

// =============================================================================================
section('A2 · production volume — 100 normal, 150 required, 200 safety margin');
// =============================================================================================
[100, 150, 200].forEach(function (n) {
  var w = world([]);
  var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(n), actor: 't' });
  var rows = dataRows(w.sheet);
  var ids = res.data.lines.map(function (l) { return l.campaign_sku_line_id; });
  ok(res.success === true, 'A2-' + n + ' N=' + n + ' PASSES');
  eq(rows.length, n, 'A2-' + n + 'a exactly ' + n + ' rows — no duplicate campaign_sku_lines');
  eq(new Set(ids).size, n, 'A2-' + n + 'b ' + n + ' distinct line identities');
  eq(res.data.lines.length, n, 'A2-' + n + 'c a receipt for every input index — no unresolved line');
  ok(res.data.lines.every(function (l) { return !!l.campaign_sku_line_id && !!l.row_version; }),
     'A2-' + n + 'd every receipt carries an id AND a row_version, so stage 3 can address each line');
  eq(counts(w.log).getDataRange, 1, 'A2-' + n + 'e at ONE authoritative read');
  // And a re-save at that volume reconciles rather than duplicating — the partial-commit case.
  var again = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(n), actor: 't' });
  eq(dataRows(w.sheet).length, n, 'A2-' + n + 'f a re-save at N=' + n + ' still leaves ' + n + ' rows');
  eq(again.data.unchanged, n, 'A2-' + n + 'g …and is entirely UNCHANGED, so a resume writes nothing');
});

// =============================================================================================
section('B · §9 — the stress matrix');
// =============================================================================================
// 6 · stage 1 existing campaign + N=100  ·  7 · stage 1 newly created campaign + N=100
(function () {
  var existing = [];
  for (var i = 1; i <= 100; i++) existing.push(rowFor({ campaign_sku_line_id: 'CSL-' + i, campaign_id: 'C-1',
    marketplace_sku_id: 'MSK-' + i, sku: 'SKU-' + String(i).padStart(3, '0'), promo_price: 1,
    regular_price: 2, price_units: 'USD', discount_percent: 9, line_status: 'active',
    created_by: 'old', created_at: 'T0', updated_by: 'old', updated_at: 'T0' }));

  var w = world(existing);
  var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(100), actor: 't' });
  eq({ c: res.data.created, u: res.data.updated, n: res.data.unchanged }, { c: 0, u: 100, n: 0 },
     'B1 an EXISTING campaign’s 100 lines all UPDATE — none is duplicated');
  eq(dataRows(w.sheet).length, 100, 'B2 …and the sheet still holds exactly 100 rows');
  eq(counts(w.log).getDataRange, 1, 'B3 …at one authoritative read');
  var created = dataRows(w.sheet).map(function (r) { return r[colOf('created_at')]; });
  ok(created.every(function (v) { return v === 'T0'; }), 'B4 …and the creation audit is preserved');
  ok(dataRows(w.sheet).every(function (r) { return r[colOf('updated_at')] === '2026-09-22 00:00:00'; }),
     'B5 …while updated_at moves, because the rows really changed');

  // 11 · re-save identical → every line unchanged, ZERO writes
  var w2 = world(existing);
  var same = mkLines(100).map(function (l) { return { sku: l.sku, marketplace_sku_id: l.marketplace_sku_id,
    deal_price: 1, regular_price: 2, price_units: 'USD', discount_percent: 9, line_status: 'active' }; });
  var res2 = w2.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: same, actor: 't' });
  eq({ c: res2.data.created, u: res2.data.updated, n: res2.data.unchanged }, { c: 0, u: 0, n: 100 },
     'B6 a re-save of an unedited event is 100 UNCHANGED');
  eq(counts(w2.log).setValues, 0, 'B7 …and writes NOTHING — not one cell');
  ok(dataRows(w2.sheet).every(function (r) { return r[colOf('updated_at')] === 'T0'; }),
     'B8 …so updated_at does not move, which would be a lie about the row’s history');
})();

// 10 · partial state: half the lines already exist
(function () {
  var existing = [];
  for (var i = 1; i <= 50; i++) existing.push(rowFor({ campaign_sku_line_id: 'CSL-' + i, campaign_id: 'C-1',
    marketplace_sku_id: 'MSK-' + i, sku: 'SKU-' + String(i).padStart(3, '0'), promo_price: 1,
    line_status: 'active', created_by: 'old', created_at: 'T0' }));
  var w = world(existing);
  var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(100), actor: 't' });
  eq({ c: res.data.created, u: res.data.updated }, { c: 50, u: 50 },
     'B9 a resumed save updates the 50 that exist and creates the 50 that do not');
  eq(dataRows(w.sheet).length, 100, 'B10 …leaving 100 rows, not 150 — the partial commit is RECONCILED');
  var ids = dataRows(w.sheet).map(function (r) { return r[colOf('campaign_sku_line_id')]; });
  eq(new Set(ids).size, 100, 'B11 …every id distinct');
})();

// 12 · duplicate line among valid rows — the same SKU twice in one batch
(function () {
  var w = world([]);
  var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1',
    lines: [mkLines(1)[0], Object.assign({}, mkLines(1)[0], { deal_price: 99 })], actor: 't' });
  eq(dataRows(w.sheet).length, 1, 'B12 the same SKU twice in one batch writes ONE row, not two');
  eq(res.data.lines[0].campaign_sku_line_id, res.data.lines[1].campaign_sku_line_id,
     'B13 …both receipts name the same line');
  eq(dataRows(w.sheet)[0][colOf('promo_price')], 99, 'B14 …and the LAST value wins, as a sequence would');
  eq({ c: res.data.created, u: res.data.updated }, { c: 1, u: 1 }, 'B15 …counted as one create and one update');
})();

// a different campaign is never adopted
(function () {
  var other = [rowFor({ campaign_sku_line_id: 'CSL-X', campaign_id: 'C-2', marketplace_sku_id: 'MSK-1',
    sku: 'SKU-001', promo_price: 5, line_status: 'active' })];
  var w = world(other);
  var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(1), actor: 't' });
  eq(res.data.created, 1, 'B16 another campaign’s line is never adopted — a new row is created');
  eq(dataRows(w.sheet).length, 2, 'B17 …and the other campaign’s row is untouched');
  eq(dataRows(w.sheet)[0][colOf('promo_price')], 5, 'B18 …still holding its own value');
})();

// 1 · refusals, and they happen BEFORE any mutation
(function () {
  var w = world([]);
  var res = w.sb.handleUpsertCampaignSkuLines_({ lines: mkLines(1) });
  ok(res.success === false && /campaign_id/.test(res.error), 'B19 a missing campaign_id refuses');
  eq(counts(w.log).setValues, 0, 'B20 …with zero writes');

  var w2 = world([]);
  var res2 = w2.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: [] });
  ok(res2.success === false, 'B21 an empty batch refuses');

  // 13 · a malformed line at index 60 of 100 — the whole batch refuses and NOTHING is written
  var w3 = world([]);
  var bad = mkLines(100);
  bad[59] = { deal_price: 1 };            // no sku and no marketplace_sku_id
  var res3 = w3.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: bad, actor: 't' });
  ok(res3.success === false && /Line 60/.test(res3.error),
     'B22 a bad line at index 60 refuses, naming its 1-based index', res3.error);
  eq(counts(w3.log).setValues + counts(w3.log).appendRow + counts(w3.log).setValue, 0,
     'B23 …and NOT ONE of the 59 good lines before it was written');
  eq(dataRows(w3.sheet).length, 0, 'B24 …the sheet is untouched');
})();

// 16 · the same save invoked twice rapidly — idempotent by business key
(function () {
  var w = world([]);
  var body = { campaign_id: 'C-1', lines: mkLines(20), actor: 't' };
  var r1 = w.sb.handleUpsertCampaignSkuLines_(JSON.parse(JSON.stringify(body)));
  var r2 = w.sb.handleUpsertCampaignSkuLines_(JSON.parse(JSON.stringify(body)));
  eq(dataRows(w.sheet).length, 20, 'B25 the SAME batch replayed writes 20 rows, not 40');
  eq(r2.data.unchanged, 20, 'B26 …and the replay is entirely UNCHANGED');
  eq(r1.data.lines.map(function (l) { return l.campaign_sku_line_id; }),
     r2.data.lines.map(function (l) { return l.campaign_sku_line_id; }),
     'B27 …answering with the same ids, which is what makes the transport replay safe');
})();

// =============================================================================================
section('C · §2/§7 — the transport, and why one replay was licensed and still failed');
// =============================================================================================
ok(/REPLAY_SAFE_ON_LOST_DELIVERY_/.test(API), 'C1 the write transport has a lost-delivery replay class');
ok(/REPLAY_SAFE_ON_LOST_DELIVERY_ = \[[^\]]*'upsertCampaignSkuLines'/.test(API.replace(/\s+/g, ' ')),
   'C2 …and upsertCampaignSkuLines is in it');
ok(/attempt <= 2/.test(API) || /attempt >= 2/.test(API), 'C3 …bounded to ONE replay, never a loop');
ok(/RETRY_ONLY_ON_ = \['REQUEST_METHOD_DOWNGRADED', 'RESPONSE_CORRELATION_UNPROVEN'\]/.test(API),
   'C4 a proven-never-ran replay stays a separate, narrower gate');
// CODE ONLY. The first version of this read the function WITH its comments and failed — on the comment
// that EXPLAINS the echo target. An assertion satisfiable by deleting the explanation is not an
// assertion about behaviour, so the comments come out and a companion check keeps the prose honest.
function codeOnly(x) { return x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''); }
var CW = API.match(/function _kmCanonicalWrite_[\s\S]*?\n}/)[0];
ok(!/googleusercontent/.test(codeOnly(CW)),
   'C5 the write never stores or reuses an echo URL — every attempt restarts from the stable /exec');
ok(/googleusercontent/.test(CW),
   'C5a while the reasoning that says WHY is still written down, so C5 cannot be passed by deletion');
// The point the measurement makes: a bounded replay cannot save a DETERMINISTICALLY slow handler.
ok(COST[100].total === COST[1].total,
   'C6 which is why the repair had to be the cost, not the retry — the replay repeated the same work');

// =============================================================================================
section('D · §3 — stage 3 may not run on a line nothing resolved');
// =============================================================================================
var SAVE = FCS.slice(FCS.indexOf('function saveEventUpdate'), FCS.indexOf('function saveEventUpdate') + 20000);
ok(/_unresolved/.test(SAVE), 'D1 the page checks that every line came back with an id');
ok(SAVE.indexOf('_unresolved') < SAVE.indexOf("_fcEbStage_ = 'stage 3"),
   'D2 …BEFORE stage 3 is entered');
ok(/Stage 3 was NOT started/.test(SAVE), 'D3 …and says so plainly when it refuses');
ok(SAVE.indexOf("_fcEbCommitted_.push('campaign_sku_lines')") < SAVE.indexOf('_unresolved'),
   'D4 …while still recording that stage 2 committed, so the operator is told what exists');
ok(!/getWorkspace|refreshCacheTables/.test(SAVE.slice(SAVE.indexOf('_unresolved'), SAVE.indexOf('_unresolved') + 900)),
   'D5 …and it issues no request of its own');

// =============================================================================================
section('E · §10 — bounded fatigue');
// =============================================================================================
(function () {
  var reads = [], rows = [], dupes = 0, lost = 0;
  for (var k = 0; k < 10; k++) {
    var w = world([]);
    var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-' + k, lines: mkLines(100), actor: 't' });
    reads.push(counts(w.log).getDataRange);
    rows.push(dataRows(w.sheet).length);
    var ids = res.data.lines.map(function (l) { return l.campaign_sku_line_id; });
    if (new Set(ids).size !== ids.length) dupes++;
    if (res.data.lines.length !== 100) lost++;
  }
  ok(reads.every(function (r) { return r === 1; }), 'E1 10 x N=100: one read every time — no request drift', reads);
  ok(rows.every(function (r) { return r === 100; }), 'E2 …100 rows every time — no lost authored row', rows);
  eq(dupes, 0, 'E3 …zero duplicate line identities');
  eq(lost, 0, 'E4 …zero incorrect receipt counts');

  // 20 reconcile cycles against ONE growing sheet
  var w2 = world([]);
  var prev = null, drift = 0, grew = 0;
  for (var c2 = 0; c2 < 20; c2++) {
    var r = w2.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(50), actor: 't' });
    if (dataRows(w2.sheet).length !== 50) grew++;
    var ids2 = r.data.lines.map(function (l) { return l.campaign_sku_line_id; }).join('|');
    if (prev !== null && ids2 !== prev) drift++;
    prev = ids2;
  }
  eq(grew, 0, 'E5 20 reconcile cycles never grow the table past 50 rows');
  eq(drift, 0, 'E6 …and the resolved identities never drift between cycles');
})();

// =============================================================================================
section('F · driven mutants');
// =============================================================================================
function mutant(label, mutations, probe) {
  mutants++;
  var caught = false;
  try {
    var src = G20;
    mutations.forEach(function (m) { src = faulted(src, m[0], m[1], label); });
    caught = !probe(src);
  } catch (e) { caught = true; }
  if (caught) { pass++; } else { survived++; fail++; console.error('MUTANT SURVIVED: ' + label); }
}

// N1 — validation moved back inside the write loop, so a late bad line leaves earlier ones written.
mutant('N1 validation no longer precedes the first mutation',
  [["  for (var vi = 0; vi < lines.length; vi++) {", "  for (var vi = 0; vi < 0; vi++) {"]],
  function (src) {
    var w = world([], src);
    var bad = mkLines(100); bad[59] = { deal_price: 1 };
    var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: bad, actor: 't' });
    return res.success === false && /Line 60/.test(res.error) && dataRows(w.sheet).length === 0;
  });

// N2 — a line staged in THIS batch is no longer findable, so a repeated SKU mints a second row.
mutant('N2 a repeated SKU in one batch creates a second row',
  [["      campaignLineRegisterKey_(keyMap, campaignId, payload.marketplace_sku_id, sku, lineId);", ""]],
  function (src) {
    var w = world([], src);
    w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1',
      lines: [mkLines(1)[0], Object.assign({}, mkLines(1)[0], { deal_price: 99 })], actor: 't' });
    return dataRows(w.sheet).length === 1;
  });

// N3 — the business-key lookup dropped, so an existing line is duplicated instead of updated.
mutant('N3 an existing line is duplicated instead of updated',
  [["    if (!lineId) lineId = campaignLineKeyLookup_(keyMap, campaignId, l.marketplace_sku_id, sku);", ""]],
  function (src) {
    var existing = [rowFor({ campaign_sku_line_id: 'CSL-1', campaign_id: 'C-1', marketplace_sku_id: 'MSK-1',
      sku: 'SKU-001', promo_price: 1, line_status: 'active' })];
    var w = world(existing, src);
    w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(1), actor: 't' });
    return dataRows(w.sheet).length === 1;
  });

// N4 — the unchanged short-circuit removed: a re-save touches every cell and moves updated_at.
mutant('N4 an unedited re-save writes anyway',
  [["      if (campaignLineFingerprint_(incomingLine) === prior.fingerprint) {",
    "      if (false) {"]],
  function (src) {
    var existing = [rowFor({ campaign_sku_line_id: 'CSL-1', campaign_id: 'C-1', marketplace_sku_id: 'MSK-1',
      sku: 'SKU-001', promo_price: 11, regular_price: 21, price_units: 'USD', discount_percent: 50,
      line_status: 'active', created_at: 'T0', updated_at: 'T0' })];
    var w = world(existing, src);
    var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(1), actor: 't' });
    return res.data.unchanged === 1 && counts(w.log).setValues === 0;
  });

// N5 — the creation audit overwritten on update.
mutant('N5 created_at is rewritten on an update',
  [["      if (h === 'created_at') { if (isNew) values[c] = now; continue; }",
    "      if (h === 'created_at') { values[c] = now; continue; }"]],
  function (src) {
    var existing = [rowFor({ campaign_sku_line_id: 'CSL-1', campaign_id: 'C-1', marketplace_sku_id: 'MSK-1',
      sku: 'SKU-001', promo_price: 1, line_status: 'active', created_at: 'T0' })];
    var w = world(existing, src);
    w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(1), actor: 't' });
    return dataRows(w.sheet)[0][colOf('created_at')] === 'T0';
  });

// N6 — the append block writes over the last existing row instead of after it.
mutant('N6 the append block overwrites the last row',
  [["    sheet.getRange(s.rows.length + 1, 1, appends.length, width)",
    "    sheet.getRange(s.rows.length, 1, appends.length, width)"]],
  function (src) {
    var existing = [rowFor({ campaign_sku_line_id: 'CSL-9', campaign_id: 'C-1', marketplace_sku_id: 'MSK-9',
      sku: 'SKU-009', promo_price: 7, line_status: 'active' })];
    var w = world(existing, src);
    w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1',
      lines: [{ sku: 'SKU-NEW', marketplace_sku_id: 'MSK-NEW', deal_price: 3, line_status: 'active' }], actor: 't' });
    return dataRows(w.sheet).length === 2;
  });

// N7 — the receipt count stops matching the input.
mutant('N7 a line is dropped from the receipts',
  [["    out.push({ campaign_sku_line_id: lineId, sku: sku, created: isNew, unchanged: false, row_version: fp });",
    "    if (i > 0) out.push({ campaign_sku_line_id: lineId, sku: sku, created: isNew, unchanged: false, row_version: fp });"]],
  function (src) {
    var w = world([], src);
    var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(20), actor: 't' });
    return res.data.lines.length === 20;
  });

// N8 — back to a per-line whole-sheet read, which is the defect itself.
mutant('N8 the per-line whole-sheet read returns',
  [["  var index = campaignLineIndexRows_(s);",
    "  var index = campaignLineIndexRows_(s); for (var q = 0; q < lines.length; q++) { fcWriteReadSheet_(sheet); }"]],
  function (src) {
    var w = world([], src);
    w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(100), actor: 't' });
    return counts(w.log).getDataRange === 1;
  });

// N9 — the cross-campaign guard dropped from the key map.
mutant('N9 the key map stops scoping by campaign',
  [["    if (msku && !m.byMsku[c + '|' + msku]) m.byMsku[c + '|' + msku] = id;",
    "    if (msku && !m.byMsku[msku]) m.byMsku[msku] = id;"],
   ["  if (wantMsku) return map.byMsku[c + '|' + wantMsku] || '';",
    "  if (wantMsku) return map.byMsku[wantMsku] || '';"]],
  function (src) {
    var other = [rowFor({ campaign_sku_line_id: 'CSL-X', campaign_id: 'C-2', marketplace_sku_id: 'MSK-1',
      sku: 'SKU-001', promo_price: 5, line_status: 'active' })];
    var w = world(other, src);
    var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(1), actor: 't' });
    return res.data.created === 1 && dataRows(w.sheet).length === 2;
  });

console.log('\nmutants: ' + mutants + ' · survived: ' + survived);
console.log('\n----------------------------------------');
console.log('FC SPECIAL STAGE-2 LARGE BATCH R1: ' + pass + ' passed, ' + fail + ' failed  ·  mutants '
  + mutants + ', survived ' + survived);
console.log('cost: N=1 ' + COST[1].total + ' physical calls · N=100 ' + COST[100].total
  + ' (reads ' + COST[100].getDataRange + ', range writes ' + COST[100].setValues + ')');
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
if (fail) process.exit(1);
