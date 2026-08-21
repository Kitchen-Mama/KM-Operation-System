// Kitchen Mama Operation System — R4B4/R4B5 LIVE ACTIVE-SCOPE TOKEN diagnostic (R4B5-corrected) — F1-7N-FA-3C-DRAFT-MODEL-R4B5.
// Run: node assets/tests/request-order-draft-v2-active-scope-tokens-f1-7n-fa-3c-r4b4.test.js
// Loads the ACTUAL TEMP_migrate_request_order_draft_v2.gs in a vm sandbox with a mock Spreadsheet (ONLY
// order_planning_gap + marketplace_skus) + Utilities + the REAL KMRDV2/KMRDV2P. Proves the corrected diagnostic:
// marketplace is part of the natural key (multi-marketplace ≠ ambiguous), the R4B4 false NO_LIVE_CANDIDATE is
// eliminated, BLOCKED is separated from token mismatch, and a Date Aug-1 Taipei never canonicalizes to July.

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var RD6_ID = 'RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R';
// The exact live instant: 2026-08-01 00:00 Asia/Taipei == 2026-07-31T16:00:00.000Z (UTC July, Taipei August).
var AUG1_TAIPEI = new Date('2026-07-31T16:00:00.000Z');

var GAP_COLS = ['company', 'country', 'marketplace', 'sku', 'calculation_month', 'calculation_status', 'calculated_at', 'updated_at'];
var MPS_COLS = ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'marketplace_sku_status'];
function toMatrix(cols, objs) { return [cols.slice()].concat(objs.map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }
function gapRow(co, cy, mp, sku, month, status) { return { company: co, country: cy, marketplace: mp, sku: sku, calculation_month: month, calculation_status: status || 'READY', calculated_at: '2026-08-01', updated_at: '2026-08-02' }; }
function mpsRow(id, sku, co, cy, mp) { return { marketplace_sku_id: id, sku: sku, company: co, country: cy, marketplace: mp, site_sku: 'SITE-' + sku, marketplace_sku_status: 'active' }; }

// Fixtures exercise every corrected classification:
//  key1 ResUS/US/Amazon/CO1200-O  Date(Aug1 Taipei) READY  + a Walmart row for the SAME SKU → CYCLE_TRANSPORT_DEFECT, NOT ambiguous
//  key2 ResTW/CA/Amazon/CO1200-O  "2026-08" string READY   → EXACT_SCOPE_MATCH (canonical, reusable)
//  key3 KM/US/Walmart/CO1200-O    Walmart Date READY + a Shopify row → selects Walmart (map applied), CYCLE_TRANSPORT_DEFECT
//  key4 ResUS/US/Amazon/CO5600-R  "2026-08" string BLOCKED → BLOCKED_BUT_SCOPE_MATCH (eligible=false, still reusable-if-queried)
//  key5 ResUS/US/Amazon/CO5600-W  TWO Amazon rows same full scope → MULTIPLE_EXACT_CANDIDATES
//  key6 RD ResUS/US/Amazon/SP5120-R Date(Aug1 Taipei) READY → CYCLE_TRANSPORT_DEFECT, RD id byte-verbatim
function gapFixture() {
  return [
    gapRow('ResUS', 'US', 'Amazon', 'CO1200-O', AUG1_TAIPEI, 'READY'),
    gapRow('ResUS', 'US', 'Walmart', 'CO1200-O', AUG1_TAIPEI, 'READY'),   // same SKU, different marketplace — must NOT make key1 ambiguous
    gapRow('ResTW', 'CA', 'Amazon', 'CO1200-O', '2026-08', 'READY'),
    gapRow('KM', 'US', 'Shopify', 'CO1200-O', AUG1_TAIPEI, 'READY'),      // distractor for key3
    gapRow('KM', 'US', 'Walmart', 'CO1200-O', AUG1_TAIPEI, 'READY'),      // key3 real candidate (migrated KM Walmart→Walmart)
    gapRow('ResUS', 'US', 'Amazon', 'CO5600-R', '2026-08', 'BLOCKED'),
    gapRow('ResUS', 'US', 'Amazon', 'CO5600-W', '2026-08', 'READY'),      // key5 duplicate #1
    gapRow('ResUS', 'US', 'Amazon', 'CO5600-W', '2026-08', 'READY'),      // key5 duplicate #2 (true ambiguity)
    gapRow('ResUS', 'US', 'Amazon', 'SP5120-R', AUG1_TAIPEI, 'READY')
  ];
}
function mpsFixture() {
  return [
    mpsRow('MPSKU-1', 'CO1200-O', 'ResUS', 'US', 'Amazon'),
    mpsRow('MPSKU-2', 'CO1200-O', 'ResTW', 'CA', 'Amazon'),
    mpsRow('MPSKU-3', 'CO1200-O', 'KM', 'US', 'Walmart'),
    mpsRow('MPSKU-4', 'CO5600-R', 'ResUS', 'US', 'Amazon'),
    mpsRow('MPSKU-5', 'CO5600-W', 'ResUS', 'US', 'Amazon'),
    mpsRow('MPSKU-6', 'SP5120-R', 'ResUS', 'US', 'Amazon')
  ];
}

function makeSandbox(opts) {
  opts = opts || {};
  var tabs = {};
  if (!opts.noGap) tabs['order_planning_gap'] = toMatrix(GAP_COLS, opts.gap || gapFixture());
  if (!opts.noMps) tabs['marketplace_skus'] = toMatrix(MPS_COLS, opts.mps || mpsFixture());
  tabs['request_order_allocation_drafts'] = [['request_allocation_draft_id', 'status']];
  tabs['request_order_allocation_draft_lines'] = [['request_allocation_draft_id', 'request_bucket']];
  var track = {}; function T(n) { track[n] = track[n] || { setValues: 0, clear: 0, rename: 0, del: 0, append: 0 }; return track[n]; }
  var insertLog = [], readLog = {};
  function sheetObj(name) {
    return {
      getName: function () { return name; },
      getDataRange: function () { return { getValues: function () { readLog[name] = (readLog[name] || 0) + 1; return tabs[name] || [[]]; } }; },
      getRange: function () { return { setValues: function () { T(name).setValues++; }, setValue: function () { T(name).setValues++; } }; },
      clear: function () { T(name).clear++; }, clearContent: function () { T(name).clear++; },
      setName: function () { T(name).rename++; }, appendRow: function () { T(name).append++; },
      deleteRow: function () { T(name).del++; }, deleteRows: function () { T(name).del++; }
    };
  }
  var ss = {
    getSheetByName: function (n) { return (tabs[n] !== undefined) ? sheetObj(n) : null; },
    getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; },
    insertSheet: function (n) { insertLog.push(n); tabs[n] = []; return sheetObj(n); },
    deleteSheet: function (sh) { if (sh && sh.getName) T(sh.getName()).del++; }
  };
  // Minimal Utilities.formatDate supporting 'yyyy-MM' in Asia/Taipei (+8) — enough for the diagnostic's cycle math.
  var Utilities = { formatDate: function (d, tz, fmt) {
    var off = (tz === 'Asia/Taipei') ? 8 : 0;
    var t = new Date(d.getTime() + off * 3600000);
    var y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, mm = (m < 10 ? '0' + m : '' + m), dd = (t.getUTCDate() < 10 ? '0' + t.getUTCDate() : '' + t.getUTCDate());
    if (fmt === 'yyyy-MM') return y + '-' + mm;
    return y + '-' + mm + '-' + dd;
  } };
  var sandbox = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, Utilities: Utilities, Logger: { log: function () {} }, console: console };
  vm.createContext(sandbox); vm.runInContext(GS, sandbox, { filename: 'TEMP_migrate_request_order_draft_v2.gs' });
  return { sandbox: sandbox, track: track, insertLog: insertLog, readLog: readLog };
}
function totalWrites(track) { var n = 0; Object.keys(track).forEach(function (k) { var t = track[k]; n += t.setValues + t.clear + t.rename + t.del + t.append; }); return n; }

// ==========================================================================
section('strictly read-only surface + reads only gap + marketplace_skus');
var d = makeSandbox();
ok(typeof d.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2 === 'function', 'public entrypoint present');
var res = d.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2();
eq(totalWrites(d.track), 0, 'total spreadsheet write count = 0');
eq(d.insertLog, [], 'inserts no sheet');
ok(!d.readLog['request_order_allocation_drafts'] && !d.readLog['request_order_allocation_draft_lines'], 'legacy draft + line tabs never read');
ok(!d.track['request_order_allocation_drafts'] && !d.track['request_order_allocation_draft_lines'], 'legacy draft + line tabs never written');
ok(d.readLog['order_planning_gap'] >= 1 && d.readLog['marketplace_skus'] >= 1, 'reads exactly gap + marketplace_skus');

section('coverage: six frozen keys; RD id byte-verbatim; all cycles canonical 2026-08');
ok(res.summary.DIAGNOSTIC_ROWS === 6 && res.summary.UNIQUE_SOURCE_IDS === 6, 'six diagnostic rows / six unique ids');
eq(res.rows[5].source_id, RD6_ID, 'RD id #6 byte-for-byte verbatim');
ok(res.rows.every(function (r) { return r.EXPECTED_CANONICAL_CYCLE === '2026-08' && r.proposed_migrated_key.planning_cycle === '2026-08'; }), 'all six proposed cycles = 2026-08');
eq(res.summary.PROJECT_TIMEZONE, 'Asia/Taipei', 'project timezone surfaced');

function row(s) { return res.rows[s - 1]; }

section('R4B4 false NO_LIVE_CANDIDATE eliminated + marketplace is part of the key');
ok(row(1).TOKEN_SCOPE_MATCH === true, 'key1 exact Amazon scope matches (was falsely NO_LIVE_CANDIDATE in R4B4)');
eq(row(1).EXACT_GAP_MARKETPLACE_CANDIDATES, 1, 'key1 selects exactly ONE Amazon candidate despite a Walmart row for the same SKU');
ok(row(1).all_sku_gap_marketplace_tokens.indexOf('Amazon') !== -1 && row(1).all_sku_gap_marketplace_tokens.indexOf('Walmart') !== -1, 'key1 still EXPOSES both raw tokens (Amazon + Walmart)');
ok(row(1).classification !== 'MULTIPLE_EXACT_CANDIDATES', 'multi-marketplace same SKU is NOT ambiguous');

section('Date Aug-1 Taipei canonicalizes to 2026-08, NEVER July; production transport defect surfaced');
eq(row(1).GAP_CYCLE_IN_PROJECT_TIMEZONE, '2026-08', 'key1 project-tz month = 2026-08');
ok(row(1).GAP_CYCLE_IN_PROJECT_TIMEZONE !== '2026-07', 'key1 project-tz month is NOT 2026-07 (UTC slice rejected)');
eq(row(1).RAW_GAP_CYCLE_TYPE, 'Date', 'key1 raw calculation_month type = Date');
ok(row(1).PRODUCTION_CYCLE_EQUAL === false && row(1).CYCLE_TRANSPORT_DEFECT === true, 'key1 production stringifies the Date → transport defect');
ok(row(1).ACTIVE_LOOKUP_REUSABLE_IF_QUERIED === true, 'key1 reusable IF queried with canonical 2026-08 (defect is transport, not identity)');

section('key2 canonical string → clean EXACT_SCOPE_MATCH');
eq([row(2).classification, row(2).PRODUCTION_CYCLE_EQUAL, row(2).CYCLE_TRANSPORT_DEFECT, row(2).ACTIVE_LOOKUP_REUSABLE_IF_QUERIED], ['EXACT_SCOPE_MATCH', true, false, true], 'key2 canonical "2026-08" → exact, reusable, no defect');

section('key3 mapped Walmart selects Walmart despite a Shopify row');
eq([row(3).SOURCE_MARKETPLACE, row(3).MIGRATED_MARKETPLACE, row(3).TOKEN_MAPPING_APPLIED], ['KM Walmart', 'Walmart', true], 'key3 KM Walmart→Walmart map applied');
eq(row(3).EXACT_GAP_MARKETPLACE_CANDIDATES, 1, 'key3 selects exactly ONE Walmart candidate (Shopify excluded)');
ok(row(3).all_sku_gap_marketplace_tokens.indexOf('Shopify') !== -1, 'key3 exposes the Shopify distractor token');
ok(row(3).ACTIVE_LOOKUP_REUSABLE_IF_QUERIED === true, 'key3 Walmart identity reusable-if-queried');

section('key4 BLOCKED is separated from token mismatch');
eq([row(4).TOKEN_SCOPE_MATCH, row(4).CURRENT_QUERY_ELIGIBLE, row(4).classification], [true, false, 'BLOCKED_BUT_SCOPE_MATCH'], 'key4 scope matches but calculation_status BLOCKED');
ok(row(4).ACTIVE_LOOKUP_REUSABLE_IF_QUERIED === true, 'key4 still reusable-if-queried (blocked ≠ non-reusable identity)');

section('key5 ambiguity requires MULTIPLE complete exact-scope matches');
eq([row(5).EXACT_GAP_MARKETPLACE_CANDIDATES, row(5).MULTIPLE_EXACT_CANDIDATES, row(5).classification], [2, true, 'MULTIPLE_EXACT_CANDIDATES'], 'key5 two identical full-scope rows → ambiguous');
ok(row(5).ACTIVE_LOOKUP_REUSABLE_IF_QUERIED === false, 'key5 ambiguous → not reusable');

section('key6 RD row transport defect + reusable');
eq([row(6).classification, row(6).ACTIVE_LOOKUP_REUSABLE_IF_QUERIED], ['CYCLE_TRANSPORT_DEFECT', true], 'key6 Date → transport defect, reusable-if-queried');

section('summary tallies + token map is exactly the two frozen entries');
eq([res.summary.CYCLE_TRANSPORT_DEFECT, res.summary.EXACT_SCOPE_MATCH, res.summary.BLOCKED_BUT_SCOPE_MATCH, res.summary.MULTIPLE_EXACT_CANDIDATES], [3, 1, 1, 1], 'classification tally: 3 transport-defect / 1 exact / 1 blocked / 1 multiple');
eq(res.summary.TOKEN_SCOPE_MATCH_ROWS, 6, 'all six token-scope match (no false NO_EXACT_CANDIDATE)');
eq(res.summary.NO_EXACT_CANDIDATE, 0, 'zero NO_EXACT_CANDIDATE');
eq(res.summary.TOKEN_MAPPING_APPLIED, 1, 'exactly one token-mapping-applied row (KM Walmart→Walmart)');
eq(res.tokenMap, { 'Amazon': 'Amazon', 'KM Walmart': 'Walmart' }, 'token map is exactly the two frozen source→migrated entries (no global alias)');

section('required-tab HALT is fail-closed and creates nothing');
var h1 = makeSandbox({ noGap: true });
var r1 = h1.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2();
eq([r1.halt, r1.GAP_TAB_PRESENT], ['REQUIRED_TAB_ABSENT', false], 'missing order_planning_gap → HALT');
eq(h1.insertLog, [], 'HALT creates no tab');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4B4/R4B5 ACTIVE-SCOPE TOKEN DIAGNOSTIC (F1-7N-FA-3C-R4B5): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
