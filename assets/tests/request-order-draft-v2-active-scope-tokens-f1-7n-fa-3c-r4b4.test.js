// Kitchen Mama Operation System — R4B4 LIVE ACTIVE-SCOPE TOKEN diagnostic — F1-7N-FA-3C-DRAFT-MODEL-R4B4.
// Run: node assets/tests/request-order-draft-v2-active-scope-tokens-f1-7n-fa-3c-r4b4.test.js
// Loads the ACTUAL TEMP_migrate_request_order_draft_v2.gs in a vm sandbox with a mock Spreadsheet exposing ONLY
// order_planning_gap + marketplace_skus (+ the legacy tabs, present but never touched), and the REAL KMRDV2/KMRDV2P.
// Proves TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2() is strictly READ-ONLY, exposes every raw marketplace
// token without silent normalization, and simulates reuse with the exact scopeMatches_ equality (case-sensitive).

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

var GAP_COLS = ['company', 'country', 'marketplace', 'sku', 'calculation_month', 'calculation_status', 'calculated_at', 'updated_at'];
var MPS_COLS = ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'marketplace_sku_status'];
function toMatrix(cols, objs) { return [cols.slice()].concat(objs.map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }

function gapRow(co, cy, mp, sku, month) { return { company: co, country: cy, marketplace: mp, sku: sku, calculation_month: month, calculation_status: 'READY', calculated_at: '2026-07-01', updated_at: '2026-07-02' }; }
function mpsRow(id, sku, co, cy, mp) { return { marketplace_sku_id: id, sku: sku, company: co, country: cy, marketplace: mp, site_sku: 'SITE-' + sku, marketplace_sku_status: 'active' }; }

// Fixtures exercise every verdict:
//  key1 ResUS/US/Amazon/CO1200-O 2026-07     → EXACT_MATCH (unique exact REUSE)
//  key2 ResTW/CA/Amazon/CO1200-O 2026-07     → TOKEN_MAPPING_REQUIRED (gap uses 'amazon' — case-only)
//  key3 KM/US/KM Walmart/CO1200-O 2026-07    → NO_LIVE_CANDIDATE (gap 'Walmart' ≠ 'KM Walmart'); master proves 'Walmart' → proposed map
//  key4 ResUS/US/Amazon/CO5600-R 2026-07     → NO_LIVE_CANDIDATE (no gap row at all)
//  key5 ResUS/US/Amazon/CO5600-W 2026-07     → AMBIGUOUS_CANDIDATE (two identical gap rows each REUSE)
//  key6 ResUS/US/Amazon/SP5120-R 2026-08     → EXACT_MATCH
function gapFixture() {
  return [
    gapRow('ResUS', 'US', 'Amazon', 'CO1200-O', '2026-07'),
    gapRow('ResTW', 'CA', 'amazon', 'CO1200-O', '2026-07'),   // lowercase — must NOT be silently folded
    gapRow('KM', 'US', 'Walmart', 'CO1200-O', '2026-07'),     // 'Walmart' vs legacy 'KM Walmart'
    gapRow('ResUS', 'US', 'Amazon', 'CO5600-W', '2026-07'),   // key5 duplicate #1
    gapRow('ResUS', 'US', 'Amazon', 'CO5600-W', '2026-07'),   // key5 duplicate #2
    gapRow('ResUS', 'US', 'Amazon', 'SP5120-R', '2026-08')
  ];
}
function mpsFixture() {
  return [
    mpsRow('MPSKU-1', 'CO1200-O', 'ResUS', 'US', 'Amazon'),
    mpsRow('MPSKU-2', 'CO1200-O', 'ResTW', 'CA', 'Amazon'),   // canonical master token 'Amazon' (gap said 'amazon')
    mpsRow('MPSKU-3', 'CO1200-O', 'KM', 'US', 'Walmart'),     // single master token 'Walmart' → proposes KM Walmart→Walmart
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
  // legacy tabs present but must never be touched by the R4B4 diagnostic
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
    insertSheet: function (n) { insertLog.push(n); tabs[n] = []; return sheetObj(n); },
    deleteSheet: function (sh) { if (sh && sh.getName) T(sh.getName()).del++; }
  };
  var sandbox = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, Logger: { log: function () {} }, console: console };
  vm.createContext(sandbox); vm.runInContext(GS, sandbox, { filename: 'TEMP_migrate_request_order_draft_v2.gs' });
  return { sandbox: sandbox, track: track, insertLog: insertLog, readLog: readLog };
}
function totalWrites(track) { var n = 0; Object.keys(track).forEach(function (k) { var t = track[k]; n += t.setValues + t.clear + t.rename + t.del + t.append; }); return n; }

// ==========================================================================
section('public entrypoint is Run-menu visible + strictly read-only');
var d = makeSandbox();
ok(typeof d.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2 === 'function', 'public entrypoint present');
ok(!/_$/.test('TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2'), 'entrypoint has no trailing `_` (Run-menu visible)');
var res = d.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2();
eq(totalWrites(d.track), 0, 'total spreadsheet write count = 0 (no setValues/clear/append/rename/delete)');
eq(d.insertLog, [], 'inserts no sheet');
ok(!d.track['request_order_allocation_drafts'] && !d.track['request_order_allocation_draft_lines'], 'legacy draft + line tabs never mutated');
ok(!d.readLog['request_order_allocation_drafts'] && !d.readLog['request_order_allocation_draft_lines'], 'legacy draft + line tabs never even read');
ok(d.readLog['order_planning_gap'] >= 1 && d.readLog['marketplace_skus'] >= 1, 'reads exactly order_planning_gap + marketplace_skus');

section('coverage: six frozen keys exactly once; RD id byte-for-byte verbatim');
ok(res.summary.DIAGNOSTIC_ROWS === 6 && res.summary.EXPECTED_ROWS === 6, 'six diagnostic rows');
eq(res.summary.MISSING_ROWS, 0, 'MISSING_ROWS = 0');
eq(res.summary.UNIQUE_SOURCE_IDS, 6, 'UNIQUE_SOURCE_IDS = 6');
ok(res.rows.every(function (r, i) { return r.seq === i + 1; }), 'sequence 1..6 stable');
eq(res.rows[5].source_id, RD6_ID, 'RD id #6 embedded byte-for-byte (never re-minted)');
eq(res.rows[5].proposed_migrated_key.planning_cycle, '2026-08', 'RD #6 planning_cycle FIELD = canonical 2026-08 (independent of the id string)');

section('per-row verdicts');
function row(seq) { return res.rows[seq - 1]; }
eq([row(1).verdict, row(1).reusable_by_active_lookup], ['EXACT_MATCH', 'YES'], 'key1 exact live gap+master → REUSABLE');
eq([row(2).verdict, row(2).reusable_by_active_lookup], ['TOKEN_MAPPING_REQUIRED', 'NO'], 'key2 gap uses case-only variant → not reusable');
eq([row(3).verdict, row(3).reusable_by_active_lookup], ['NO_LIVE_CANDIDATE', 'NO'], 'key3 KM Walmart has no matching gap marketplace token');
eq([row(4).verdict, row(4).reusable_by_active_lookup], ['NO_LIVE_CANDIDATE', 'NO'], 'key4 no gap row at all → fail closed');
eq([row(5).verdict, row(5).reusable_by_active_lookup], ['AMBIGUOUS_CANDIDATE', 'NO'], 'key5 duplicate gap rows each REUSE → ambiguous, not reusable');
eq([row(6).verdict, row(6).reusable_by_active_lookup], ['EXACT_MATCH', 'YES'], 'key6 exact (2026-08) → REUSABLE');

section('raw marketplace tokens are NOT silently normalized');
eq(row(2).gap_candidates[0].raw.marketplace, 'amazon', 'raw gap token "amazon" preserved verbatim (lowercase)');
ok(row(2).gap_candidates[0].marketplace_exact === false && row(2).gap_candidates[0].marketplace_ci === true, 'key2 exposed as case-insensitive-only (exact=false, ci=true)');
ok(row(2).gap_candidates[0].scope_field_diff.indexOf('marketplace') !== -1, 'key2 scope_field_diff flags marketplace');

section('KM Walmart vs Walmart remain unequal; master proves a proposed one-time map');
ok(row(3).gap_candidates.length === 1 && row(3).gap_candidates[0].raw.marketplace === 'Walmart', 'key3 gap candidate raw token = "Walmart"');
ok(row(3).gap_candidates[0].marketplace_ci === false, '"KM Walmart" and "Walmart" are NOT case-insensitive equal');
eq(row(3).proposed_marketplace_mapping, { from: 'KM Walmart', to: 'Walmart', evidence: 'marketplace_skus proves exactly one token for country+sku', masterRowCount: 1 }, 'key3 proposes KM Walmart→Walmart from master (exactly one token)');
ok(row(1).proposed_marketplace_mapping === null, 'key1 (legacy Amazon == master Amazon) proposes NO mapping');

section('special Amazon master check — canonical token = Amazon');
ok(row(1).distinct_master_marketplace_tokens.indexOf('Amazon') !== -1 && row(1).distinct_master_token_conflict === false, 'key1 master token set = {Amazon}, no conflict');

section('summary tallies');
eq([res.summary.EXACT_MATCH, res.summary.TOKEN_MAPPING_REQUIRED, res.summary.NO_LIVE_CANDIDATE, res.summary.AMBIGUOUS_CANDIDATE], [2, 1, 2, 1], 'verdict tally 2/1/2/1');
eq([res.summary.REUSABLE_ROWS, res.summary.NON_REUSABLE_ROWS], [2, 4], 'REUSABLE=2, NON_REUSABLE=4');
eq(res.summary.CONFLICT_ROWS, 1, 'CONFLICT_ROWS = 1 (the ambiguous key5)');
eq(res.summary.READY_FOR_R4C_SCOPE_DECISION, 'YES', 'all six diagnosed → READY_FOR_R4C_SCOPE_DECISION=YES (NOT an execute authorization)');

section('token map surfaces every distinct live token per legacy token');
var amz = res.tokenMap.filter(function (t) { return t.legacy_token === 'Amazon'; })[0];
var kmw = res.tokenMap.filter(function (t) { return t.legacy_token === 'KM Walmart'; })[0];
ok(amz && amz.gap_tokens.indexOf('Amazon') !== -1 && amz.gap_tokens.indexOf('amazon') !== -1, 'Amazon legacy token maps to both live gap tokens {Amazon, amazon}');
ok(amz && amz.proposed_mapping === null, 'Amazon legacy token needs no proposed map');
ok(kmw && kmw.master_tokens.length === 1 && kmw.master_tokens[0] === 'Walmart' && kmw.proposed_mapping, 'KM Walmart maps to master {Walmart} with a proposed one-time map');

section('required-tab HALT is fail-closed and creates nothing');
var h1 = makeSandbox({ noGap: true });
var r1 = h1.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2();
eq([r1.halt, r1.GAP_TAB_PRESENT, r1.READY_FOR_R4C_SCOPE_DECISION], ['REQUIRED_TAB_ABSENT', false, 'NO'], 'missing order_planning_gap → HALT, not ready');
eq(h1.insertLog, [], 'HALT creates no tab');
var h2 = makeSandbox({ noMps: true });
var r2 = h2.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2();
eq([r2.halt, r2.MARKETPLACE_SKUS_TAB_PRESENT], ['REQUIRED_TAB_ABSENT', false], 'missing marketplace_skus → HALT');

section('exact-token equality is the ONLY reuse gate (mutation of a single token flips reuse)');
var flip = makeSandbox({ gap: [gapRow('ResUS', 'US', 'Amazon ', 'CO1200-O', '2026-07')] });   // trailing space
var rf = flip.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2();
// 'Amazon ' trims to 'Amazon' → scopeMatches_ trims both → still EXACT for key1
eq(rf.rows[0].verdict, 'EXACT_MATCH', 'trailing-space token trims to exact (scopeMatches_ trims) → still reusable');
var flip2 = makeSandbox({ gap: [gapRow('ResUS', 'US', 'AmazonUS', 'CO1200-O', '2026-07')] });
var rf2 = flip2.sandbox.TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2();
eq(rf2.rows[0].reusable_by_active_lookup, 'NO', 'a genuinely different token (AmazonUS) → NOT reusable');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4B4 LIVE ACTIVE-SCOPE TOKEN DIAGNOSTIC (F1-7N-FA-3C-R4B4): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
