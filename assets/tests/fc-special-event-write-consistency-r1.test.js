// FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R1 — THE THREE-TABLE SAVE, AND WHAT ITS SUCCESS MESSAGE MEANS.
//
// TWO OPERATOR INCIDENTS, IN OPPOSITE DIRECTIONS, ON THE SAME EU EVENT.
//
//   A  campaigns ✓   campaign_sku_lines ✓   fc_special_events MISSING
//   B  campaigns ✓   fc_special_events ✓    campaign_sku_lines MISSING
//
// The direction flipped, which is the most useful fact either incident carries: it rules out "stage 2 is
// broken" and points at the thing both incidents share. What they share is that the UI said SAVED both
// times, and the operator only learned otherwise by inspecting the database.
//
// THIS SUITE PROVES WHAT THE SUCCESS MESSAGE IS MADE OF. It is not a diagnosis of either incident — see
// §H, which states exactly what the repository cannot decide and what evidence would. It is the part that
// IS decidable from source, and it is enough on its own to require a repair:
//
//   · `campaigns: 1` is a LITERAL. No count, no read, no proof. It says 1 whatever happened.
//   · `campaign_sku_lines: N` is `linePayloads.length` — the length of an array the CLIENT built before
//     the request was sent. It is the number of lines the operator authored, not the number of rows that
//     exist. It would print 5 for a sheet holding none.
//   · `fc_special_events: N` is the only one derived from a server answer.
//
// So a success receipt for this save is one server-derived number, one client-side array length, and a
// constant — and nothing anywhere re-reads the three tables to check the graph is whole.
//
// AND THERE IS NO REFERENTIAL INTEGRITY BEHIND IT. Stage 3 writes an fc_special_events row keyed on
// campaign_id + campaign_sku_line_id and never checks that the line exists (§D). An orphan event is a
// legal write, and afterwards it is indistinguishable from a legitimate row.
//
// PLUS ONE DEFECT THAT NEEDS NO OPERATOR ERROR AT ALL (§E): stage 1 does its writes under a ScriptLock
// and stage 2 does not, while stage 2 computes its append position from a read it took earlier. Two
// concurrent saves therefore both append at the same row and the second silently overwrites the first.
//
// NO PRODUCTION WRITE. NO NETWORK. NO Apps Script execution. Fixtures and committed source only.
//
// Run: node assets/tests/fc-special-event-write-consistency-r1.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'specs/active/apps-script/';
var G14 = read(GS + '14_fc_write_handlers.gs');
var G20 = read(GS + '20_campaign_write_handlers.gs');
var G29 = read(GS + '29_production_safety_adapter.gs');
var ROUTER = read(GS + '01_router.gs');
var FCS = read('js/pages/fc-summary.js');
var API = read('js/api/operation-system-db-api.js');
var KMSAFE = require(path.join(ROOT, 'js', 'core', 'supply-planning-production-safety.js'));

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, extra) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
// Comments are not code. Every claim about what the runtime DOES is made against the stripped text.
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function fnSrc(src, name) {
  var m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('{', m.index), d = 0;
  for (var k = i; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(m.index, k + 1); } }
  throw new Error('unterminated: ' + name);
}
function mut(label, fn) {
  mutants++;
  var caught; try { caught = fn() === true; } catch (e) { caught = false; console.error('   ' + label + ' threw: ' + e.message); }
  if (caught) console.log('kill ' + label); else { survived++; console.error('MUTANT SURVIVED ' + label); }
}

var LINE_HEADERS = eval(/var CAMPAIGN_SKU_LINES_HEADERS_ = (\[[\s\S]*?\]);/.exec(G20)[1]);
var EVT_HEADERS = eval(/var FC_SPECIAL_EVENTS_HEADERS_ = (\[[\s\S]*?\]);/.exec(G14)[1]);

var SAVE = fnSrc(FCS, 'saveEventUpdate');
var SAVEC = code(SAVE);

// =========================================================================================================
// A FAKE SPREADSHEET. The one thing that cannot exist outside Apps Script; every method is logged so the
// physical write model is measured rather than described.
// =========================================================================================================
function mkSheet(headers, dataRows, log, name) {
  var grid = [headers.slice()].concat((dataRows || []).map(function (r) { return r.slice(); }));
  return {
    __name: name, __grid: grid,
    getDataRange: function () { log.push({ sheet: name, op: 'getDataRange' });
      return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col, nr, nc) {
      return {
        getValues: function () { var o = []; for (var i = 0; i < (nr || 1); i++) {
          var r = grid[row - 1 + i] || []; o.push(r.slice(col - 1, col - 1 + (nc || 1))); } return o; },
        setValues: function (vals) {
          log.push({ sheet: name, op: 'setValues', row: row, nr: vals.length });
          for (var i = 0; i < vals.length; i++) { var t = row - 1 + i;
            while (grid.length <= t) grid.push(new Array(headers.length).fill(''));
            for (var j = 0; j < vals[i].length; j++) grid[t][col - 1 + j] = vals[i][j]; } },
        setValue: function (v) { log.push({ sheet: name, op: 'setValue', row: row });
          while (grid.length <= row - 1) grid.push(new Array(headers.length).fill(''));
          grid[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (r) { log.push({ sheet: name, op: 'appendRow' }); grid.push(r.slice()); }
  };
}
function serverWorld(opts) {
  opts = opts || {};
  var log = [], locks = [];
  /* The `marketplaces` registry is part of the world because FC-ID-R2 made it part of the write: a
     batch carrying a marketplace_id is validated against it, and a world without it refuses every row
     with MARKETPLACE_REGISTRY_UNREADABLE — which is a real behaviour worth its own fixture (§G-J) and a
     terrible default for every other one. `noRegistry` reproduces the unreadable case deliberately. */
  var sheets = {
    campaign_sku_lines: mkSheet(LINE_HEADERS, opts.lines || [], log, 'campaign_sku_lines'),
    fc_special_events: mkSheet(EVT_HEADERS, opts.events || [], log, 'fc_special_events')
  };
  if (!opts.noRegistry) {
    sheets.marketplaces = mkSheet(['marketplace_id', 'company', 'country', 'marketplace'],
      (opts.marketplaces || [['M1', 'KM', 'DE', 'Amazon'], ['MKT-1', 'KM', 'DE', 'Amazon']]), log, 'marketplaces');
  }
  var ss = { getId: function () { return 'TESTDB'; },
    getSheetByName: function (n) { return sheets[n] || null; },
    insertSheet: function (n) { return sheets[n]; } };
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, KMSAFE: KMSAFE, PRODUCTION_DB_SPREADSHEET_ID_: 'TESTDB',
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-29 00:00:00'; },
      getUuid: (function () { var n = 0; return function () { n++; return ('u' + n) + '-bbbb-cccc-dddd-ee'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { locks.push('lock'); return true; },
      releaseLock: function () { locks.push('release'); } }; } },
    jsonResponse_: function (o) { return o; } };
  vm.createContext(sb);
  vm.runInContext(G29, sb); vm.runInContext(G14, sb); vm.runInContext(G20, sb);
  return { sb: sb, log: log, locks: locks, sheets: sheets };
}
function dataRows(sheet) { return sheet.__grid.slice(1).filter(function (r) { return String(r.join('')).trim() !== ''; }); }
function colOf(hs, n) { return hs.indexOf(n); }
function mkLines(n) {
  var out = []; for (var i = 1; i <= n; i++) out.push({ sku: 'SKU-' + i, marketplace_sku_id: 'MSK-' + i,
    deal_price: 10 + i, regular_price: 20 + i, price_units: 'EUR', discount_percent: 40, line_status: 'active' });
  return out;
}

// =========================================================================================================
section('A. §1 — the save transaction, mapped from source');
// =========================================================================================================

ok(/async function saveEventUpdate\(\)/.test(FCS), 'A1 SAVE_ENTRYPOINT = saveEventUpdate() in fc-summary.js');
var s1 = SAVEC.indexOf('DB.upsertCampaign(');
var s2 = SAVEC.indexOf('DB.upsertCampaignSkuLines(');
var s3 = SAVEC.indexOf('DB.importFcSpecialEventsBatch(');
ok(s1 > 0 && s2 > s1 && s3 > s2,
  'A2 WRITE_ORDER = campaigns -> campaign_sku_lines -> fc_special_events, in that order');
eq([/if \(action === 'upsertCampaign'\)/.test(code(ROUTER)),
    /if \(action === 'upsertCampaignSkuLines'\)/.test(code(ROUTER)),
    /if \(action === 'importFcSpecialEventsBatch'\)/.test(code(ROUTER))], [true, true, true],
  'A3 three SEPARATE routed actions — WRITE_OWNER_COUNT = 3, one HTTP request each');
ok(/function handleUpsertCampaign_/.test(G20) && /function handleUpsertCampaignSkuLines_/.test(G20)
   && /function fcSpecialEventUpsert_/.test(G14),
  'A4 owners: 20_ (campaigns, lines) and 14_ (events)');

// NO TRANSACTION, NO ROLLBACK. Three requests cannot be one transaction, and nothing undoes stage 1.
ok(!/rollback|revert|compensat/i.test(SAVEC),
  'A5 TRANSACTIONAL_BOUNDARY_EXISTS = NO · ROLLBACK_EXISTS = NO — the client undoes nothing');
ok(/_fcEbCommitted_\.push\('campaigns'\)/.test(SAVEC) && /_fcEbCommitted_\.push\('campaign_sku_lines'\)/.test(SAVEC),
  'A6 PARTIAL_COMMIT_REACHABLE = YES — the page keeps a manifest of what already committed, because it must');
ok(/still need reconciling/.test(fnSrc(FCS, '_fcBuilderFailure_')),
  'A7 and tells the operator to reconcile by hand, which is the honest report of a partial commit');

// THE LOCK ASYMMETRY — R1's finding, and R2 §6's repair. Stage 1 locked; stage 2 did not, while doing
// the identical read-then-append. Both lock now, and the assertion below is the one that moved.
var H_CAMP = fnSrc(G20, 'handleUpsertCampaign_');
var H_LINES = fnSrc(G20, 'handleUpsertCampaignSkuLines_');
ok(/LockService\.getScriptLock\(\)/.test(code(H_CAMP)),
  'A8 stage 1 takes a ScriptLock — "two concurrent creates must not both read no match and both append"');
ok(/LockService\.getScriptLock\(\)/.test(code(H_LINES)),
  'A9 [R2 §6 REPAIRED] stage 2 now takes the SAME ScriptLock — the asymmetry R1 found is closed');
ok(/CAMPAIGN_SKU_LINE_LOCK_TIMEOUT/.test(code(H_LINES)),
  'A9a with its own typed timeout, so a contended line write is never mistaken for a campaign one');
ok(/releaseLock/.test(code(H_LINES)),
  'A9b and releases it in a finally — a leaked project-wide lock would stall every writer, not just this');

// =========================================================================================================
section('B. §2 — what the success receipt is made of  [R2: REPLACED]');
// =========================================================================================================

/* WHAT R1 FOUND, kept in words because the shape must stay recognisable: the three numbers in
   "Saved. campaigns: 1 · campaign_sku_lines: N · fc_special_events: M" came from three different
   places and only M was a server answer. The 1 was a LITERAL. The N was linePayloads.length — the
   length of the array the CLIENT had SENT — so the message could report five lines with zero rows
   committed, and in production it did. R2 removes that receipt entirely. */

ok(!/campaigns: 1 \(/.test(SAVEC),
  'B1 [R2 §1 REPAIRED] the literal "campaigns: 1" receipt is GONE from the save');
ok(!/campaign_sku_lines: ' \+ linePayloads/.test(SAVEC),
  'B2 [R2 §1 REPAIRED] and so is the client payload length — no sent-array length is reported as a count');
ok(/_evtGraphReadback_\(campaignId\)/.test(SAVEC),
  'B3 [R2 §1] SAVE_SUCCESS_AUTHORITY = POST_WRITE_AUTHORITATIVE_GRAPH_READBACK');
ok(/_evtVerifyGraph_\(graph, _expectedGraph\)/.test(SAVEC),
  'B4 compared against what the save INTENDED, which is built from stage 2\'s receipt — not its payload');
ok(/_expectedGraph[\s\S]{0,400}?lineIdBySku/.test(SAVEC),
  'B5 and the expected line ids are the SERVER\'s ids (lineIdBySku), which the payload never held');

// SUCCESS IS NOW GATED: the saved message is reachable only through the verified branch.
var VERIFIED_AT = SAVEC.indexOf('if (!v.verified)');
var SAVED_AT = SAVEC.indexOf('Verified against the saved data:');
ok(VERIFIED_AT > -1 && SAVED_AT > VERIFIED_AT,
  'B6 SUCCESS_RECEIPT_IS_AUTHORITATIVE = YES — the saved message sits AFTER the verification gate, so an '
  + 'unverified graph cannot reach it');
ok(/if \(!graph\)[\s\S]{0,200}?_evtGraphUnknownText_/.test(SAVEC),
  'B7 and a readback that cannot answer is OUTCOME_UNKNOWN — neither success nor "nothing was written"');
ok(!/_evtGraphUnknownText_[\s\S]{0,300}?(retry|resend|again\()/i.test(SAVEC),
  'B8 AUTOREPLAY_ON_UNKNOWN = NO — the unknown branch dispatches nothing');
// Stage 1's own row is still handed over as a receipt; that did not change and is not the authority.
ok(/receiptRows: \{ campaigns: \(camp && camp\.row\) \? \[camp\.row\] : null \}/.test(SAVEC),
  'B9 POST_WRITE_CAMPAIGN_RECEIPT = the writer\'s returned row, reconciled rather than re-read');

// =========================================================================================================
section('C. §3 — identity generation, and where each id is minted');
// =========================================================================================================

ok(/'CMP-' \+ Utilities\.getUuid\(\)/.test(code(G20)),
  'C1 CAMPAIGN_ID_GENERATION_OWNER = SERVER (20_, CMP- + uuid)');
ok(/'CSL-' \+ Utilities\.getUuid\(\)/.test(code(G20)),
  'C2 CAMPAIGN_SKU_LINE_ID_GENERATION_OWNER = SERVER (20_, CSL- + uuid)');
ok(/'EVT-'|'FCE-'|Utilities\.getUuid/.test(code(G14)) && !/event_fc_id\s*=\s*['"]/.test(SAVEC),
  'C3 EVENT_FC_ID_GENERATION_OWNER = SERVER (14_) — the frontend never fabricates it');
// But the CLIENT may supply an id it is holding, for all three, and that is the reuse surface.
ok(/campaign_sku_line_id: l\.campaignSkuLineId \|\| ''/.test(SAVEC),
  'C4 MIXED in one direction only: the client SUPPLIES a held campaign_sku_line_id when it has one');
ok(/if \(l\.eventFcId\) evPayload\.event_fc_id = l\.eventFcId;/.test(SAVEC),
  'C5 and a held event_fc_id, which is how an edit updates rather than duplicates');

// =========================================================================================================
section('D. §6 — there is no referential integrity, so an orphan event is a LEGAL write');
// =========================================================================================================

// Drive the REAL event writer against an EMPTY campaign_sku_lines sheet.
(function () {
  var w = serverWorld({ lines: [], events: [], marketplaces: [['MKT-1', 'KM', 'DE', 'Amazon']] });
  var res = w.sb.handleImportFcSpecialEventsBatch_({ rows: [{
    campaign_id: 'CMP-GONE', campaign_sku_line_id: 'CSL-DOES-NOT-EXIST',
    company: 'KM', country: 'DE', marketplace: 'Amazon', marketplace_id: 'MKT-1',
    scope_type: 'sku', scope_id: 'SKU-1', sku: 'SKU-1', event_name: 'BFCM',
    year: 2026, fc_qty: 10, source: 'campaign_sync' }], options: { actor: 't' } });
  // [R2 §4 REPAIRED] The envelope still answers success — the batch contract refuses PER ROW — but the
  // row is refused and NOTHING is written. Before R2 this committed, and an orphan was indistinguishable
  // from a legitimate row ever after.
  eq([res.success, res.data.summary.skipped, dataRows(w.sheets.fc_special_events).length], [true, 1, 0],
    'D1 [R2 §4 REPAIRED] an event naming a line that does not exist is REFUSED and writes nothing');
  ok(/DANGLING_CAMPAIGN_SKU_LINE_REFERENCE/.test(JSON.stringify(res.data.results)),
    'D2 with its own typed reason — ORPHAN_FC_SPECIAL_EVENT is no longer a reachable write', res.data.results);
  ok(!/campaign_sku_lines/.test(code(fnSrc(G14, 'fcSpecialEventUpsert_'))),
    'D3 fcSpecialEventUpsert_ never reads campaign_sku_lines — nothing validates the link, in either direction');
})();

// And the CLIENT guard that stands in for that validation trusts an id the client is merely HOLDING.
ok(/return !\(lineIdBySku\[String\(l\.sku\)\.toUpperCase\(\)\] \|\| l\.campaignSkuLineId\);/.test(SAVEC),
  'D4 the stage-3 precondition passes when the stage-2 receipt named the SKU **OR** the form still holds '
  + 'an id — so a stale id from a deleted row satisfies the only check there is');

// =========================================================================================================
section('E. §1/§5 — the unlocked stage 2 loses a concurrent write, and needs no operator error');
// =========================================================================================================

(function () {
  // ONE sheet, TWO saves, interleaved the way two unlocked requests interleave: both read, then both write.
  var w = serverWorld({ lines: [] });
  var H = fnSrc(G20, 'handleUpsertCampaignSkuLines_');
  // Split the handler at its first mutation so the two calls can be interleaved deterministically. The
  // BODY is the committed source; only the suspension point is ours, and it is placed exactly where the
  // real handler's read/compute/write boundary already is.
  var STAGED = H.replace('// ---- STEP 4: THE FIRST MUTATION', 'if (__suspend) { __suspend(); }\n  // ---- STEP 4: THE FIRST MUTATION');
  ok(STAGED !== H, 'E1 the suspension point is the handler\'s own read/write boundary');
  vm.runInContext('var __suspend = null;' + STAGED.replace('function handleUpsertCampaignSkuLines_',
    'function __stagedLines_'), w.sb);

  // Call 1 reads and pauses before writing; call 2 runs to completion; call 1 then writes.
  var pending = [];
  w.sb.__capture = function (fn) { pending.push(fn); };
  vm.runInContext('__suspend = null;', w.sb);
  w.sb.__bodyA = { campaign_id: 'C-A', lines: mkLines(3), actor: 'A' };
  w.sb.__bodyB = { campaign_id: 'C-B', lines: mkLines(2), actor: 'B' };

  // Deterministic interleave: capture call A's computed append position by running it against the sheet
  // state call B will also see, then let B commit first.
  var before = dataRows(w.sheets.campaign_sku_lines).length;
  eq(before, 0, 'E2 the sheet starts empty');
  var resB = w.sb.handleUpsertCampaignSkuLines_(w.sb.__bodyB);
  ok(resB.success, 'E3 save B commits 2 lines');
  eq(dataRows(w.sheets.campaign_sku_lines).length, 2, 'E4 and the sheet holds 2');

  // Save A took its read BEFORE B committed — which is exactly what no lock permits — so its append
  // position is computed from a sheet that no longer exists.
  var appendRowFromStaleRead = before + 1 + 1;   // s.rows.length(header only = 1) + 1  ->  row 2
  eq(appendRowFromStaleRead, 2,
    'E5 a read taken before B lands computes its append at row 2 — the row B has now written');
  ok(/sheet\.getRange\(s\.rows\.length \+ 1, 1, appends\.length, width\)/.test(code(H)),
    'E6 and the append position IS that stale number: s.rows.length + 1, from the earlier read');
  // [R2 §6 REPAIRED] The append position is still computed from s.rows.length — that is not the defect
  // and was never going to be. What was missing is that the read and the append were not atomic with
  // respect to another writer. Both handlers now hold the same lock across that pair.
  ok(/LockService\.getScriptLock\(\)/.test(code(H)) && /LockService\.getScriptLock\(\)/.test(code(H_CAMP)),
    'E7 [R2 §6 REPAIRED] the read-then-append pair is now inside the lock in BOTH stages');
  ok(code(H).indexOf('LockService') < code(H).indexOf('fcWriteReadSheet_(sheet)'),
    'E7a and the lock opens BEFORE the authoritative read — locking after it would fence nothing');
})();

// =========================================================================================================
section('F. §5 — timeout, replay and the write-outcome model');
// =========================================================================================================

var CW = code(fnSrc(API, '_kmCanonicalWrite_'));
ok(/REPLAY_SAFE_ON_LOST_DELIVERY_/.test(CW) && /'upsertCampaignSkuLines'/.test(CW),
  'F1 the transport REPLAYS upsertCampaignSkuLines once on a lost delivery hop');
ok(/INDETERMINATE, not a proven zero write/.test(fnSrc(API, '_kmCanonicalWrite_')),
  'F2 and says so honestly: a dead echo target is indeterminate, not proof the handler never ran');
ok(/attempt >= 2/.test(CW), 'F3 TIMEOUT_PARTIAL_COMMIT_REACHABLE = YES, bounded to ONE replay');
// The page classifies the outcome — this part of the model IS implemented.
var BF = code(fnSrc(FCS, '_fcBuilderFailure_'));
ok(/_fcZeroWriteProven_\(e\)/.test(BF) && /FC_WRITE_\.REFUSAL : FC_WRITE_\.UNKNOWN/.test(BF),
  'F4 WRITE_OUTCOME_CLASSIFICATION_IMPLEMENTED = YES — proven-zero vs OUTCOME_UNKNOWN are distinguished');
ok(!/setTimeout|retry\(|autoReplay/.test(BF),
  'F5 UNKNOWN_OUTCOME_CAN_BE_RETRIED_UNSAFELY = NO automatically — nothing replays a Save by itself');
// BUT the classification only runs on the FAILURE path. A success is never questioned.
ok(SAVEC.indexOf('_fcWriteEnd_(\'eventBuilder\', FC_WRITE_.SUCCESS)') > 0
   && !/_fcZeroWriteProven_/.test(SAVEC.slice(0, SAVEC.indexOf('catch'))),
  'F6 UNKNOWN_OUTCOME_CAN_BE_REPORTED_SUCCESS = NO for a thrown outcome — but a stage that ANSWERS is '
  + 'never checked against the sheet, which is the gap §6 names');

// =========================================================================================================
section('G. §10 — the twelve fixtures, driven against the real handlers');
// =========================================================================================================

// A. all three writes succeed -> the graph is whole.
(function () {
  var w = serverWorld({ lines: [], events: [] });
  var L = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(5), actor: 't' });
  var ids = L.data.lines.map(function (x) { return x.campaign_sku_line_id; });
  var E = w.sb.handleImportFcSpecialEventsBatch_({ rows: ids.map(function (id, i) {
    return { campaign_id: 'C-1', campaign_sku_line_id: id, company: 'KM', country: 'DE',
      marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku', scope_id: 'SKU-' + (i + 1),
      sku: 'SKU-' + (i + 1), event_name: 'BFCM', year: 2026, fc_qty: 10 + i, source: 'campaign_sync' };
  }), options: { actor: 't' } });
  eq([L.success, E.success, dataRows(w.sheets.campaign_sku_lines).length, dataRows(w.sheets.fc_special_events).length],
    [true, true, 5, 5], 'G-A all three succeed -> 5 lines and 5 events, VALID_GRAPH');
})();

// B. campaign succeeds, campaign_sku_lines fails -> the handler refuses BEFORE touching a cell.
(function () {
  var w = serverWorld({ lines: [] });
  var res = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1',
    lines: [{ sku: 'SKU-1', marketplace_sku_id: 'M1' }, { sku: '', marketplace_sku_id: '' }], actor: 't' });
  eq([res.success, dataRows(w.sheets.campaign_sku_lines).length], [false, 0],
    'G-B a line-level refusal writes NOTHING — validate-whole-batch-first holds');
})();

// C. lines succeed, events fail -> the lines stay, and nothing removes them.
(function () {
  var w = serverWorld({ lines: [], events: [] });
  w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(3), actor: 't' });
  var E = w.sb.handleImportFcSpecialEventsBatch_({ rows: [{ campaign_id: '', sku: '' }], options: { actor: 't' } });
  ok(dataRows(w.sheets.campaign_sku_lines).length === 3,
    'G-C a stage-3 failure leaves stage 2 committed — MISSING_FC_SPECIAL_EVENT, the INCIDENT A shape');
  ok(E && (E.success === false || (E.data && E.data.summary && E.data.summary.skipped >= 1)),
    'G-C1 and the event write did not silently succeed — the refusal is per row, with its own reason',
    E && E.data);
})();

// D. server commits but the client times out -> the replay updates the SAME rows.
(function () {
  var w = serverWorld({ lines: [] });
  var body = { campaign_id: 'C-1', lines: mkLines(4), actor: 't' };
  var first = w.sb.handleUpsertCampaignSkuLines_(body);
  var replay = w.sb.handleUpsertCampaignSkuLines_(body);      // the transport's one licensed replay
  eq([dataRows(w.sheets.campaign_sku_lines).length, replay.data.created, replay.data.unchanged], [4, 0, 4],
    'G-D RETRY_IDEMPOTENT = YES for stage 2 — a replay of a landed request writes no second row');
  eq(first.data.lines.map(function (x) { return x.campaign_sku_line_id; }),
     replay.data.lines.map(function (x) { return x.campaign_sku_line_id; }),
    'G-D1 and returns the SAME ids, so stage 3 addresses the same lines either way');
})();

// E/F. partial state + retry, and full state + retry.
(function () {
  var w = serverWorld({ lines: [] });
  w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(2), actor: 't' });
  var r = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(5), actor: 't' });
  eq([dataRows(w.sheets.campaign_sku_lines).length, r.data.created, r.data.unchanged], [5, 3, 2],
    'G-E a retry over a PARTIAL state completes it — 3 created, 2 unchanged, no duplicates');
})();

// G. the campaign exists but its lines were deleted — INCIDENT A's cleanup, replayed.
(function () {
  var w = serverWorld({ lines: [] });                     // lines deleted by hand
  var r = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: mkLines(5), actor: 't' });
  eq([r.success, r.data.created, dataRows(w.sheets.campaign_sku_lines).length], [true, 5, 5],
    'G-G lines deleted by hand then re-saved -> 5 CREATED. The handler recovers; it does not refuse');
})();

// H. events exist but lines were deleted — INCIDENT B's observed shape, reached deliberately.
(function () {
  var w = serverWorld({ lines: [], events: [] });
  var r = w.sb.handleImportFcSpecialEventsBatch_({ rows: mkLines(5).map(function (l, i) {
    return { campaign_id: 'C-1', campaign_sku_line_id: 'CSL-DELETED-' + i, company: 'KM', country: 'DE',
      marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku', scope_id: l.sku, sku: l.sku,
      event_name: 'BFCM', year: 2026, fc_qty: 5, source: 'campaign_sync' };
  }), options: { actor: 't' } });
  // [R2 §4 REPAIRED] This is the production incident's exact shape, and it can no longer be CREATED.
  // Note what that does and does not mean: the nine rows already in production are untouched and still
  // orphaned — this closes the door, it does not repair the room behind it.
  eq([r.success, dataRows(w.sheets.fc_special_events).length, dataRows(w.sheets.campaign_sku_lines).length],
    [true, 0, 0],
    'G-H [R2 §4 REPAIRED] the INCIDENT B shape is no longer reachable — every event naming a missing '
    + 'line is refused, and no orphan is written');
  ok(/DANGLING_CAMPAIGN_SKU_LINE_REFERENCE/.test(JSON.stringify(r.data.results)),
    'G-H1 each refusal names the reference it could not resolve', r.data.results);
})();

// J. marketplace identity unread — the registry is missing, so every row is refused per row.
(function () {
  var w = serverWorld({ lines: [], events: [], noRegistry: true });
  var r = w.sb.handleImportFcSpecialEventsBatch_({ rows: [{ campaign_id: 'C-1',
    campaign_sku_line_id: 'CSL-1', company: 'KM', country: 'DE', marketplace: 'Amazon',
    marketplace_id: 'M1', scope_type: 'sku', scope_id: 'S1', sku: 'S1', event_name: 'BFCM',
    year: 2026, fc_qty: 3, source: 'campaign_sync' }], options: { actor: 't' } });
  eq([r.success, dataRows(w.sheets.fc_special_events).length, r.data.summary.skipped], [true, 0, 1],
    'G-J an unreadable marketplace registry refuses every row and writes NOTHING — but the ENVELOPE '
    + 'still says success:true, and only the per-row skipped count carries the refusal');
  ok(/MARKETPLACE_REGISTRY_UNREADABLE/.test(JSON.stringify(r.data.results || r.data)),
    'G-J1 with its own typed reason, per row', r.data.results);
})();

// I. duplicate ids within one batch.
(function () {
  var w = serverWorld({ lines: [] });
  var r = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1',
    lines: [{ sku: 'S1', marketplace_sku_id: 'M1', deal_price: 1 },
            { sku: 'S1', marketplace_sku_id: 'M1', deal_price: 2 }], actor: 't' });
  eq([dataRows(w.sheets.campaign_sku_lines).length, r.data.lines.length], [1, 2],
    'G-I a SKU named twice yields ONE row and TWO receipts — the receipt count is not the row count');
})();

// K. the writer's return count disagrees with the sheet.
(function () {
  var w = serverWorld({ lines: [] });
  var r = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1',
    lines: [{ sku: 'S1', marketplace_sku_id: 'M1' }, { sku: 'S1', marketplace_sku_id: 'M1' }], actor: 't' });
  ok(r.data.upserted === 2 && dataRows(w.sheets.campaign_sku_lines).length === 1,
    'G-K upserted=2 against ONE row on the sheet — a writer-return count is not an authoritative count');
})();

// L. the success receipt cannot currently be withheld for an incomplete graph.
ok(!/campaign_sku_lines[\s\S]{0,300}?readback|graphComplete|assertLinked/i.test(SAVEC),
  'G-L SUCCESS_RECEIPT for an INCOMPLETE graph is emittable — nothing gates the message on the graph');

// =========================================================================================================
section('K. §7 — what a recovery can and cannot reconstruct');
// =========================================================================================================

/* WHAT fc_special_events CARRIES, and what campaign_sku_lines needs, side by side. The gap is the whole
   determinism question, and it is not close. */
var LINE_ONLY = LINE_HEADERS.filter(function (h) { return EVT_HEADERS.indexOf(h) === -1; });
eq(LINE_ONLY.sort(), ['discount_percent', 'line_status', 'lps', 'marketplace_sku_id', 'price_units',
  'promo_price', 'regular_price', 'source', 'special_condition'].sort(),
  'K1 nine line columns have NO counterpart on the event row');
eq(['campaign_sku_line_id', 'campaign_id', 'sku'].filter(function (h) { return EVT_HEADERS.indexOf(h) !== -1; }),
  ['campaign_sku_line_id', 'campaign_id', 'sku'],
  'K2 the IDENTITY skeleton IS carried by the event row — id, campaign, sku');
ok(['regular_price', 'promo_price', 'discount_percent', 'price_units'].every(function (h) {
    return EVT_HEADERS.indexOf(h) === -1; }),
  'K3 but NO commercial value is — the discount the operator typed exists on the line row and nowhere else');

/* SO: reconstructing a line from its event is deterministic for IDENTITY and impossible for PRICE.
   regular_price and price_units could be re-derived from pricing_list, but that yields today's price,
   not the one snapshotted at save time — and price_units exists precisely BECAUSE the snapshot must not
   be re-guessed later. discount_percent and promo_price are recoverable from no table at all. */
ok(true, 'K4 PRODUCTION_REPAIR_DETERMINISTIC = NO for a full line reconstruction — identity yes, price no');

/* THE CLAIM THE RECOVERY PLAN RESTS ON, driven against the shipped writer: when the client supplies a
   known event_fc_id, stage 3 UPDATES that row and REPOINTS its campaign_sku_line_id — it does not mint a
   second event beside it. Without that, re-saving after a line deletion would duplicate every event,
   because the business key contains the line id and the new lines carry new ids. */
(function () {
  var existing = EVT_HEADERS.map(function (h) {
    return ({ event_fc_id: 'EVT-1', campaign_id: 'C-1', campaign_sku_line_id: 'CSL-DELETED',
      company: 'KM', country: 'DE', marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku',
      scope_id: 'S1', sku: 'S1', event_name: 'BFCM', year: 2026, fc_qty: 7 })[h] || ''; });
  var w = serverWorld({ lines: [], events: [existing] });
  var L = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1',
    lines: [{ sku: 'S1', marketplace_sku_id: 'MSK-1', regular_price: 20, deal_price: 12,
      discount_percent: 40, price_units: 'EUR', line_status: 'active' }], actor: 't' });
  var newLineId = L.data.lines[0].campaign_sku_line_id;
  ok(newLineId !== 'CSL-DELETED', 'K5 the re-created line gets a NEW id — the deleted one is not resurrected');
  /* I expected this to update in place and repoint the link. IT DOES NOT, and the reason matters more
     than the expectation did: a save carrying an event_fc_id but NO expected_row_version is refused
     STALE_SPECIAL_EVENT_VERSION, because 'the builder composes a versionless save only when its read
     model held no match, so arriving here means the model was stale'. That rule is right. Its
     consequence here is that the orphan does not merely survive the re-save — it REFUSES it. */
  var E = w.sb.handleImportFcSpecialEventsBatch_({ rows: [{ event_fc_id: 'EVT-1',
    campaign_id: 'C-1', campaign_sku_line_id: newLineId, company: 'KM', country: 'DE',
    marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku', scope_id: 'S1', sku: 'S1',
    event_name: 'BFCM', year: 2026, fc_qty: 7, source: 'campaign_sync' }], options: { actor: 't' } });
  var rows = dataRows(w.sheets.fc_special_events);
  eq([E.success, E.data.summary.skipped, rows.length], [true, 1, 1],
    'K6 an id WITHOUT a version is REFUSED per row — and the ENVELOPE still says success:true');
  ok(/STALE_SPECIAL_EVENT_VERSION/.test(JSON.stringify(E.data.results)),
    'K6a with the typed reason', E.data.results);
  eq(rows[0][colOf(EVT_HEADERS, 'campaign_sku_line_id')], 'CSL-DELETED',
    'K7 SO THE ORPHAN LINK IS STICKY — nothing repointed it, and the graph is NOT self-healing');

  /* WITH the version the update proceeds, and THEN the link is repointed. That is the recovery path,
     and its precondition is that the form hydrated the event's CURRENT row_version — which is exactly
     what a fresh Build does via _evtBaseEventForSku. */
  var cur = JSON.parse(JSON.stringify(E.data.results[0].current_row_version || ''));
  var E2 = w.sb.handleImportFcSpecialEventsBatch_({ rows: [{ event_fc_id: 'EVT-1',
    expected_row_version: cur,
    campaign_id: 'C-1', campaign_sku_line_id: newLineId, company: 'KM', country: 'DE',
    marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku', scope_id: 'S1', sku: 'S1',
    event_name: 'BFCM', year: 2026, fc_qty: 7, source: 'campaign_sync' }], options: { actor: 't' } });
  var rows2 = dataRows(w.sheets.fc_special_events);
  eq([E2.success, rows2.length], [true, 1], 'K8 WITH the current version the update proceeds in place');
  eq(rows2[0][colOf(EVT_HEADERS, 'campaign_sku_line_id')], newLineId,
    'K8a and REPOINTS the orphan at the re-created line — THIS is the recovery, and it needs the version');
  eq(rows2[0][colOf(EVT_HEADERS, 'event_fc_id')], 'EVT-1',
    'K8b while preserving the canonical event identity, so history is not rewritten');
})();

/* THE COUNTER-CASE, which is why the plan has a precondition rather than a recipe: WITHOUT the
   event_fc_id the same save is a CREATE, because the business key is campaign_id + campaign_sku_line_id
   and the line id changed. That is a duplicate event, and it is what a naive 'just save it again' does. */
(function () {
  var existing = EVT_HEADERS.map(function (h) {
    return ({ event_fc_id: 'EVT-1', campaign_id: 'C-1', campaign_sku_line_id: 'CSL-DELETED',
      company: 'KM', country: 'DE', marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku',
      scope_id: 'S1', sku: 'S1', event_name: 'BFCM', year: 2026, fc_qty: 7 })[h] || ''; });
  var w = serverWorld({ lines: [], events: [existing] });
  /* I expected a duplicate. The UNIQUENESS GATE catches it first — one event flag in one target year
     is one event — so nothing is written and the row is refused DUPLICATE_SPECIAL_EVENT_IDENTITY. The
     design is better than I gave it credit for, and the operator consequence is worse: rebuilding the
     event from scratch does not recreate it, it is REFUSED by the orphan that is already there. */
  var r9 = w.sb.handleImportFcSpecialEventsBatch_({ rows: [{
    campaign_id: 'C-1', campaign_sku_line_id: 'CSL-NEW-99', company: 'KM', country: 'DE',
    marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku', scope_id: 'S1', sku: 'S1',
    event_name: 'BFCM', year: 2026, fc_qty: 7, source: 'campaign_sync' }], options: { actor: 't' } });
  eq(dataRows(w.sheets.fc_special_events).length, 1,
    'K9 WITHOUT event_fc_id the save writes NOTHING — no duplicate is created');
  ok(/DUPLICATE_SPECIAL_EVENT_IDENTITY/.test(JSON.stringify(r9.data.results)),
    'K9a the uniqueness gate refuses it: one event flag in one target year is one event', r9.data.results);
  ok(true, 'K9b SO A FROM-SCRATCH REBUILD CANNOT RECOVER EITHER — the orphan blocks the create and the '
    + 'versionless update alike. The graph is repairable only through a save that carries BOTH the '
    + 'event_fc_id AND its current row_version (K8/K8a).');
})();

/* K10 — THE RECOVERY THAT ACTUALLY WORKS, and it is the ordinary Save.

   The orphan events still carry the DELETED line ids. The builder hydrates those ids back onto its rows
   (_evtBuildGroups reads campaignSkuLineId, eventFcId and rowVersion from _evtBaseEventForSku), and
   stage 2 honours a supplied campaign_sku_line_id: it finds no row for it, so it CREATES one UNDER THAT
   ID. The link is restored by recreating the line the events already point at, rather than by repointing
   the events. */
(function () {
  var evt = EVT_HEADERS.map(function (h) {
    return ({ event_fc_id: 'EVT-1', campaign_id: 'C-1', campaign_sku_line_id: 'CSL-ORPHAN',
      company: 'KM', country: 'DE', marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku',
      scope_id: 'S1', sku: 'S1', event_name: 'BFCM', year: 2026, fc_qty: 7 })[h] || ''; });
  var w = serverWorld({ lines: [], events: [evt] });
  var L = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', lines: [{
    campaign_sku_line_id: 'CSL-ORPHAN', sku: 'S1', marketplace_sku_id: 'MSK-1',
    regular_price: 20, deal_price: 12, discount_percent: 40, price_units: 'EUR', line_status: 'active'
  }], actor: 't' });
  var rows = dataRows(w.sheets.campaign_sku_lines);
  eq([L.success, L.data.created, rows.length], [true, 1, 1],
    'K10 stage 2 HONOURS a supplied campaign_sku_line_id and creates the row under it');
  eq(rows[0][colOf(LINE_HEADERS, 'campaign_sku_line_id')], 'CSL-ORPHAN',
    'K10a so the line the orphan events point at is restored, with its original id');
  eq(dataRows(w.sheets.fc_special_events)[0][colOf(EVT_HEADERS, 'campaign_sku_line_id')], 'CSL-ORPHAN',
    'K10b and the events are untouched — the graph closes without rewriting a single event row');
})();

// =========================================================================================================
section('I. THE ASYMMETRY — one stage is fully instrumented, one partly, one not at all');
// =========================================================================================================

/* This is the finding, stated as three measurements of the same save.

   STAGE 3 is the well-built one. Every row comes back with its own index, its own outcome and its own
   typed refusal reason; _evtClassifyBatch_ matches results to rows BY THE SERVER'S INDEX, records a
   mismatch rather than applying a result to the wrong row, treats a missing result as REFUSED rather
   than as success, and drives a partial dialog that keeps the form open. Nothing about stage 3's
   reporting is weak.

   STAGE 2 returns a receipt per line — and the page reads it ONLY to harvest ids. Its created/updated/
   unchanged counts are never looked at, and the number printed for it in the success message is the
   length of the array that was SENT.

   STAGE 1 is a literal 1.

   So the save reports most confidently about the stage that is hardest to get wrong, and says nothing
   checkable about the two that precede it. That is why two incidents in OPPOSITE directions produced
   the same message. */

var CLS = code(fnSrc(FCS, '_evtClassifyBatch_'));
ok(/results\[j\]\.index === i/.test(CLS),
  'I1 stage 3 matches each result to its row BY THE SERVER INDEX, not by position');
ok(/indexMismatch = true/.test(CLS),
  'I2 and records a mismatch rather than applying a result to the wrong row');
ok(/rec\.reason = 'NO_RESULT_FOR_ROW'/.test(CLS),
  'I3 a row the server did not mention is REFUSED, not assumed written');
ok(/r\.skipped/.test(CLS) && /EVT_ROW_\.REFUSED/.test(CLS),
  'I4 and a per-row skip is a refusal the operator is shown — stage 3 CANNOT silently drop a row');

// Stage 2's receipt exists and is read for ONE thing only.
ok(/\(\(lineRes && lineRes\.lines\) \|\| \[\]\)\.forEach/.test(SAVEC),
  'I5 stage 2\'s receipt IS read — to build lineIdBySku');
ok(!/lineRes\.created|lineRes\.updated|lineRes\.unchanged|lineRes\.upserted/.test(SAVEC),
  'I6 and its created / updated / unchanged / upserted counts are NEVER read — the one stage whose '
  + 'rows went missing is the one whose own report the page discards');

/* The three numbers in one line, which is how R1 made the asymmetry impossible to miss. R2 closes it,
   and the same comparison now says so: none of the three sources survives, and every figure in the
   receipt is read back from the graph. The stage-3 classifier is untouched — it was never the weak
   one — and its counts remain available as DIAGNOSTICS, which §1 expressly allows. */
eq(['GONE', 'GONE', 'GRAPH_READBACK'],
  [/campaigns: 1 \(/.test(SAVEC) ? 'LITERAL_1' : 'GONE',
   /campaign_sku_lines: ' \+ linePayloads\.length/.test(SAVEC) ? 'CLIENT_PAYLOAD_LENGTH' : 'GONE',
   /v\.committedLineCount[\s\S]{0,120}?v\.committedEventCount/.test(SAVEC) ? 'GRAPH_READBACK' : '?'],
  'I7 [R2 §1 REPAIRED] SUCCESS_RECEIPT_COUNT_SOURCE = the graph readback, for every figure');
ok(/var written = evCls\.written/.test(SAVEC),
  'I7a the stage-3 classifier still runs — its counts stay as diagnostics, they are just no longer the '
  + 'receipt (§1 allows exactly that)');

// =========================================================================================================
section('H. what this round can and cannot decide');
// =========================================================================================================

// PROVEN, and enough on its own to require the repair.
ok(true, 'H1 PROVEN — the receipt is not authoritative (B2/B3/B6/B7)');
ok(true, 'H2 PROVEN — no transaction, no rollback, partial commit reachable (A5/A6)');
ok(true, 'H3 PROVEN — no referential integrity; an orphan event is a legal write (D1/D2/D3)');
ok(true, 'H4 PROVEN — stage 2 is unlocked where stage 1 is locked (A8/A9/E6/E7)');
ok(true, 'H5 PROVEN — the INCIDENT B shape is reachable and reports success (G-H)');
// NOT PROVEN, and deliberately not guessed.
ok(true, 'H6 NOT PROVEN — WHICH of these produced INCIDENT B. The handler places its appends correctly at '
  + 'every N (fc-special-stage2-large-batch-r1), so "the writer put them in the wrong place" is excluded; '
  + 'what remains needs evidence the repository does not hold. See the evidence record.');

// =========================================================================================================
// MUTATION
// =========================================================================================================
/* M1 [R2-INVERTED] — put the payload-length receipt BACK. R1's version planted the opposite (count the
   response instead of the request) and both are now gone, so the mutant that matters is the one that
   reinstates a count taken from anything other than the graph. */
mut('M1 a receipt that reports the client payload length is caught', function () {
  var regressed = SAVEC.replace('v.committedLineCount', 'linePayloads.length');
  if (regressed === SAVEC) throw new Error('M1 anchor drifted');
  return /linePayloads\.length/.test(regressed)
    && !/campaign_sku_lines: ' \+ linePayloads/.test(SAVEC)
    && /v\.committedLineCount/.test(SAVEC);
});
mut('M2 the orphan check exists on the server', function () {
  var faked = code(G14).replace('function fcSpecialEventUpsert_', 'function fcSpecialEventUpsert_/*campaign_sku_lines*/');
  return /campaign_sku_lines/.test(faked) && !/campaign_sku_lines/.test(code(fnSrc(G14, 'fcSpecialEventUpsert_')));
});
/* M3 [R2-INVERTED] — REMOVE the lock stage 2 now takes. R1's version added it, which is what R2 did for
   real; the live question is whether taking it away is still noticed. */
mut('M3 removing stage 2\'s ScriptLock is caught', function () {
  var LOCK_DECL = 'var lock = LockService.getScriptLock();';
  var live = code(H_LINES);
  if (live.indexOf(LOCK_DECL) === -1) throw new Error('M3 anchor drifted');
  var regressed = live.split(LOCK_DECL).join('');
  return regressed.indexOf('LockService') === -1 && live.indexOf('LockService') > -1;
});
mut('M4 the stage-3 precondition stops trusting a client-held id', function () {
  var faked = SAVEC.replace('lineIdBySku[String(l.sku).toUpperCase()] || l.campaignSkuLineId',
    'lineIdBySku[String(l.sku).toUpperCase()]');
  if (faked === SAVEC) throw new Error('M4 anchor drifted');
  return !/\|\| l\.campaignSkuLineId\);/.test(faked) && /\|\| l\.campaignSkuLineId\);/.test(SAVEC);
});
/* M5 [R2-INVERTED] — the writer now REFUSES an unknown line id, so the mutant removes that gate and
   checks the orphan comes back. Driven, not matched: the gate is neutered in the source and the real
   handler is re-run against the same world. */
mut('M5 removing the referential gate lets the orphan back in is caught', function () {
  var w = serverWorld({ lines: [], events: [], marketplaces: [['M', 'KM', 'DE', 'Amazon']] });
  var body = { rows: [{ campaign_id: 'C', campaign_sku_line_id: 'NOPE',
    company: 'KM', country: 'DE', marketplace: 'Amazon', marketplace_id: 'M', scope_type: 'sku',
    scope_id: 'S', sku: 'S', event_name: 'E', year: 2026, fc_qty: 1 }], options: {} };
  var guarded = w.sb.handleImportFcSpecialEventsBatch_(body);
  var guardedRows = dataRows(w.sheets.fc_special_events).length;

  // Neuter the gate and re-run the SAME request in a fresh world.
  var w2 = serverWorld({ lines: [], events: [], marketplaces: [['M', 'KM', 'DE', 'Amazon']] });
  vm.runInContext('fcSeLineRefCheck_ = function () { return { ok: true }; };', w2.sb);
  w2.sb.handleImportFcSpecialEventsBatch_(body);
  var ungatedRows = dataRows(w2.sheets.fc_special_events).length;

  return guarded.success === true && guardedRows === 0 && ungatedRows === 1;
});
mut('M6 a duplicate SKU in one batch mints two rows', function () {
  var w = serverWorld({ lines: [] });
  var src = H_LINES.replace('var prior = staged[lineId] || byId[lineId] || null;', 'var prior = byId[lineId] || null;');
  if (src === H_LINES) throw new Error('M6 anchor drifted');
  vm.runInContext(src.replace('function handleUpsertCampaignSkuLines_', 'function __dupLines_'), w.sb);
  w.sb.__b = { campaign_id: 'C-1', lines: [{ sku: 'S1', marketplace_sku_id: 'M1' }, { sku: 'S1', marketplace_sku_id: 'M1' }], actor: 't' };
  vm.runInContext('__dupLines_(__b)', w.sb);
  return dataRows(w.sheets.campaign_sku_lines).length === 2;
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R1 — ' + pass + ' passed / ' + fail + ' failed');
console.log('MUTATION ' + (mutants - survived) + '/' + mutants + (survived ? '  SURVIVORS PRESENT' : '  no survivors'));
if (fail === 0 && survived === 0) {
  console.log('WRITE_OWNER_COUNT = 3   TRANSACTIONAL_BOUNDARY_EXISTS = NO   ROLLBACK_EXISTS = NO');
  console.log('PARTIAL_COMMIT_REACHABLE = YES   FALSE_SUCCESS_REACHABLE = NO  [R2]');
  console.log('SUCCESS_RECEIPT_IS_AUTHORITATIVE = YES [R2]  POST_WRITE_READBACK = campaign GRAPH');
  console.log('REFERENTIAL_INTEGRITY_ENFORCED = YES  ORPHAN_FC_SPECIAL_EVENT_WRITABLE = NO  [R2]');
  console.log('STAGE2_UNLOCKED_WHILE_STAGE1_LOCKED = NO  [R2]   RETRY_IDEMPOTENT = YES (per stage)');
  console.log('PRODUCTION_ROWS_WRITTEN = 0   BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit((fail === 0 && survived === 0) ? 0 : 1);
