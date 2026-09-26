// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R6
// THE LOCK WAS COVERING THE READING, AND ONE COLUMN WAS HOLDING FOUR DIFFERENT QUANTITIES
//
// THREE LIVE BLOCKERS ON THE PUBLISHED 27e70ee / R16 BUILD.
//
//   A  Stage 1 of a Special Event save intermittently answered CAMPAIGN_LOCK_TIMEOUT — for a save
//      that, on its commonest path, writes no campaign cell at all. `LockService.getScriptLock()` is
//      ONE lock for the whole Apps Script project (nineteen other handlers across eleven files take
//      the same one), and 20_ acquired it as its first act and held it for its entire body: the full
//      getDataRange().getValues() of the campaigns sheet, a second full read for the legacy key
//      fallback, a third for the receipt — and then returned "nothing was written". The zero-write
//      case was queuing behind every other writer in the project and failing at the 30 s bound.
//
//   B  A prerequisite load could fail with REQUEST_TIMEOUT / "Action: getTable". True, and unusable:
//      the Special path asks for six tables and the message names the verb, not the noun. The
//      transport had the answer the whole time — getOperationDbTableFromSheet attaches `table` to
//      every typed error it throws — and the shared formatter simply did not carry the field.
//
//   C  The Build card's single "Base FC" column was being filled with fc_regular_forecast at the
//      event's own month WHATEVER assist method was selected. A3-R5 fixed an always-empty column and
//      introduced that: for Apply Growth Rate the baseline is another campaign's fc_special_events
//      total, for Adjust it is a Regular forecast at the operator's chosen Base Year/Month, and for
//      Manual there is none. Three different quantities were sharing one name, and a persisted
//      event's own fc_qty — the CURRENT EVENT FC, a fourth meaning — must never join them.
//
// Run: node assets/tests/fc-campaign-lock-and-baseline-semantics-r2b-a3-r6.test.js
// NOTE: no 'use strict' — extracted browser/Apps Script fns are eval'd into a sandbox (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutants = [], survived = [];
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mutant(l, caught) {
  mutants.push(l);
  if (caught === true) { pass++; console.log('ok   ' + l + ' (caught)'); }
  else { survived.push(l); fail++; console.error('FAIL ' + l + ' — MUTANT SURVIVED'); }
}

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');
var GS20 = read('assets/specs/active/apps-script/20_campaign_write_handlers.gs');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = (src.slice(Math.max(0, i - 6), i) === 'async ') ? i - 6 : i;
  var d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function varSrc(src, name) {
  var m = new RegExp('var ' + name + ' = [\\s\\S]*?;\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}

// =========================================================================================================
// THE SERVER — a real fake sheet (2-D grid, header row at index 0, which is what fcWriteReadSheet_ hands
// the handler) and the real handler over it, with the project lock counted.
// =========================================================================================================
var CAMPAIGN_ROW = {
  campaign_id: 'CMP-BFCM26', company: 'ResUS', country: 'US', marketplace: 'Amazon',
  marketplace_id: 'MKT-RESUS-US-AMAZON', campaign_name: 'BFCM 2026', promotion_type: 'BFCM',
  event_flag: 'BFCM', major_event_flag: 'BFCM', year: 2026, duration: '', status: 'active',
  start_date: '2026-11-19', end_date: '2026-11-30', updated_at: '2026-09-20T00:00:00.000Z'
};
function serverWorld(rows, overrides) {
  overrides = overrides || {};
  var HEADERS = (overrides.headers || Object.keys(CAMPAIGN_ROW));
  var grid = [HEADERS.slice()];
  (rows || []).forEach(function (r) { grid.push(HEADERS.map(function (h) { return r[h] === undefined ? '' : r[h]; })); });
  var writes = [], responses = [], tries = 0, releases = 0, held = false, heldReads = 0, reads = 0;
  var sheet = { __grid: grid };
  var ensured = { sheet: 0, columns: 0 };
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array,
    Math: Math, Date: Date, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, RegExp: RegExp,
    CAMPAIGNS_HEADERS_: Object.keys(CAMPAIGN_ROW), FC_SCHEMA_BY_NAME_: {},
    LockService: { getScriptLock: function () {
      return { tryLock: function () { tries++; held = true; return overrides.lockFails !== true; },
               releaseLock: function () { releases++; held = false; } };
    } },
    SpreadsheetApp: { getActiveSpreadsheet: function () {
      return { __ss: true, getSheetByName: function (n) { return n === 'campaigns' ? sheet : null; } };
    } },
    Utilities: { getUuid: function () { return 'NEWUUID' + String(1000 + writes.length); } },
    jsonResponse_: function (o) { responses.push(o); return o; },
    fcWriteEnsureSheet_: function () { ensured.sheet++; return sheet; },
    fcWriteEnsureColumns_: function () { ensured.columns++; },
    fcWriteReadSheet_: function () {
      reads++; if (held) heldReads++;
      return { headers: HEADERS, rows: grid, col: function (n) { return HEADERS.indexOf(n); } };
    },
    fcWriteUpsert_: function (ss, nm, hdrs, keyCol, id, body) {
      writes.push({ id: id, body: body });
      var idCol = HEADERS.indexOf(keyCol);
      for (var i = 1; i < grid.length; i++) {
        if (String(grid[i][idCol]) === String(id)) {
          Object.keys(body).forEach(function (k) { var c = HEADERS.indexOf(k); if (c !== -1) grid[i][c] = body[k]; });
          return { id: id, created: false };
        }
      }
      var fresh = HEADERS.map(function (h) { return body[h] === undefined ? '' : body[h]; });
      fresh[idCol] = id; grid.push(fresh);
      return { id: id, created: true };
    },
    __writes: function () { return writes; },
    __rowCount: function () { return grid.length - 1; },
    __ids: function () {
      var c = HEADERS.indexOf('campaign_id');
      return grid.slice(1).map(function (r) { return String(r[c]); });
    },
    __tries: function () { return tries; },
    __releases: function () { return releases; },
    __heldReads: function () { return heldReads; },
    __reads: function () { return reads; },
    __last: function () { return responses[responses.length - 1]; }
  };
  vm.createContext(sb);
  vm.runInContext([
    varSrc(GS20, 'CAMPAIGN_KEY_FIELDS_'), varSrc(GS20, 'CAMPAIGN_LOCK_MS_'),
    varSrc(GS20, 'CAMPAIGN_FINGERPRINT_FIELDS_'), varSrc(GS20, 'CAMPAIGN_FINGERPRINT_NUMERIC_'),
    fnSrc(GS20, 'campaignDateKey_'), fnSrc(GS20, 'campaignUpper_'), fnSrc(GS20, 'campaignNum_'),
    fnSrc(GS20, 'campaignKeyOf_'), fnSrc(GS20, 'campaignFingerprint_'), fnSrc(GS20, 'campaignIndexRows_'),
    fnSrc(GS20, 'campaignReceiptFor_'), fnSrc(GS20, 'campaignFindByKey_'),
    overrides.ready || fnSrc(GS20, 'campaignSheetReady_'),
    overrides.resolver || fnSrc(GS20, 'campaignResolveOrTerminal_'),
    overrides.handler || fnSrc(GS20, 'handleUpsertCampaign_')
  ].join('\n'), sb, { filename: 'gs20.js' });
  return sb;
}
function payloadFor(over) {
  return Object.assign({
    campaign_name: 'BFCM 2026', company: 'ResUS', marketplace_id: 'MKT-RESUS-US-AMAZON',
    country: 'US', marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM',
    major_event_flag: 'BFCM', year: 2026, status: 'active',
    start_date: '2026-11-19', end_date: '2026-11-30'
  }, over || {});
}

// =========================================================================================================
section('A. THE LOCK NO LONGER COVERS THE READING');
// =========================================================================================================
var HANDLER = fnSrc(GS20, 'handleUpsertCampaign_');
var RESOLVER = fnSrc(GS20, 'campaignResolveOrTerminal_');

ok(/function campaignResolveOrTerminal_\(/.test(GS20),
  'A0  resolve/classify is its own function — one copy, called by both passes');
ok(HANDLER.indexOf('campaignResolveOrTerminal_') !== -1
  && (HANDLER.match(/campaignResolveOrTerminal_\(/g) || []).length === 2,
  'A0a the handler calls it exactly twice: once unlocked, once under the lock');
ok(HANDLER.indexOf('campaignResolveOrTerminal_') < HANDLER.indexOf('LockService.getScriptLock()'),
  'A0b and the FIRST call happens before the lock is even requested');
ok(!/LockService|tryLock|releaseLock/.test(RESOLVER),
  'A0c the classifier itself never touches a lock — it reads, decides, and writes nothing');
ok(/fcWriteUpsert_/.test(HANDLER) && !/fcWriteUpsert_/.test(RESOLVER),
  'A0d and the only writer stayed in the handler, inside the lock');
ok(/\} finally \{\s*try \{ lock\.releaseLock\(\); \} catch \(e\) \{\}\s*\}/.test(HANDLER),
  'A0e the release is still in a finally, so no branch can leak the lock');

(function () {
  // §12.1 — a normal reuse: succeeds, writes nothing, and now never asks for the project lock.
  var S = serverWorld([CAMPAIGN_ROW]);
  var r = S.handleUpsertCampaign_(payloadFor());
  ok(r.success === true && r.data.reused === true, 'A1  a normal reuse still succeeds');
  eq(S.__writes().length, 0, 'A1a with zero writes');
  eq(S.__tries(), 0, 'A1b and ZERO lock acquisitions — the operator\'s CAMPAIGN_LOCK_TIMEOUT path');
  eq(S.__heldReads(), 0, 'A1c no sheet read happened while a lock was held');
  eq(r.data.campaign_id, 'CMP-BFCM26', 'A1d the resolved id is unchanged');
  ok(r.data.row_version, 'A1e and the stored version travels back for stage 2');
})();

(function () {
  // §12.5/§12.6 — every refusal is still a refusal, still zero-write, and still takes no lock.
  var stale = serverWorld([CAMPAIGN_ROW]).handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED' }));
  ok(stale.success === false && stale.error === 'STALE_CAMPAIGN_VERSION',
    'A2  a header mutation with no version is still refused');
  var S2 = serverWorld([CAMPAIGN_ROW]);
  S2.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED' }));
  eq([S2.__writes().length, S2.__tries()], [0, 0], 'A2a zero writes, and no lock was taken to say so');

  var S3 = serverWorld([CAMPAIGN_ROW]);
  var badVer = S3.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED', expected_row_version: 'nope' }));
  ok(badVer.success === false && badVer.error === 'STALE_CAMPAIGN_VERSION',
    'A3  a STALE version is still refused');
  eq([S3.__writes().length, S3.__tries()], [0, 0], 'A3a also without the lock');

  var S4 = serverWorld([CAMPAIGN_ROW]);
  var nf = S4.handleUpsertCampaign_(payloadFor({ campaign_id: 'CMP-NOPE' }));
  ok(nf.success === false && nf.error === 'CAMPAIGN_NOT_FOUND', 'A4  CAMPAIGN_NOT_FOUND preserved');
  eq(S4.__tries(), 0, 'A4a lock-free');

  var S5 = serverWorld([CAMPAIGN_ROW]);
  var mm = S5.handleUpsertCampaign_(payloadFor({ campaign_id: 'CMP-BFCM26', country: 'CA' }));
  ok(mm.success === false && mm.error === 'CAMPAIGN_IDENTITY_MISMATCH', 'A5  IDENTITY_MISMATCH preserved');
  eq(S5.__tries(), 0, 'A5a lock-free');

  var S6 = serverWorld([CAMPAIGN_ROW, Object.assign({}, CAMPAIGN_ROW)]);
  var dup = S6.handleUpsertCampaign_(payloadFor());
  ok(dup.success === false && dup.error === 'DUPLICATE_CAMPAIGN_IDENTITY', 'A6  DUPLICATE preserved');
  eq(S6.__tries(), 0, 'A6a lock-free');
})();

(function () {
  // §12.4 — a genuine update still takes the lock, writes under it, and releases.
  var S = serverWorld([CAMPAIGN_ROW]);
  var fp = S.handleUpsertCampaign_(payloadFor()).data.row_version;
  var up = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED', expected_row_version: fp }));
  ok(up.success === true, 'A7  a header mutation with a FRESH version still applies');
  eq(S.__writes().length, 1, 'A7a exactly one write');
  eq(S.__tries(), 1, 'A7b and it DID take the lock — the write path is still guarded');
  eq(S.__releases(), 1, 'A7c and released it');
  ok(S.__heldReads() > 0, 'A7d the write path re-reads UNDER the lock, which is what closes the race');
})();

(function () {
  // §12.3/§12.7 — THE CREATE RACE, made deterministic. Two savers resolve the same brand-new identity
  // before either has written; the writes are then interleaved. The second must find the first's row.
  var S = serverWorld([]);
  var fresh = payloadFor({ campaign_name: 'BFCM 2027', year: 2027,
    start_date: '2027-11-24', end_date: '2027-11-30' });
  var sheetRef = { __grid: null };
  // both resolve first — this is the pre-lock classification each saver would carry into the lock
  var a = S.campaignResolveOrTerminal_({ __g: 1 }, fresh, fresh.campaign_name, '');
  var b = S.campaignResolveOrTerminal_({ __g: 1 }, fresh, fresh.campaign_name, '');
  eq([a.terminal, b.terminal], [false, false], 'A8  both savers resolve "no match" — the race is set up');
  eq([a.id, b.id], ['', ''], 'A8a neither has an id to reuse');
  var r1 = S.handleUpsertCampaign_(fresh);
  var r2 = S.handleUpsertCampaign_(fresh);
  ok(r1.success === true && r1.data.created === true, 'A9  the first save creates the campaign');
  ok(r2.success === true && r2.data.created === false,
    'A9a the second does NOT create a second one — the locked pass re-resolved and found it');
  eq(S.__rowCount(), 1, 'A9b one canonical campaign row for one canonical identity');
  eq(r1.data.campaign_id, r2.data.campaign_id, 'A9c and both savers hold the same campaign_id');
  ok(sheetRef.__grid === null, 'A9d (the fixture holds no second grid — one sheet, one truth)');
})();

(function () {
  // §12.2 — two simultaneous REUSES of an existing identity.
  var S = serverWorld([CAMPAIGN_ROW]);
  var x = S.handleUpsertCampaign_(payloadFor());
  var y = S.handleUpsertCampaign_(payloadFor());
  eq([x.data.campaign_id, y.data.campaign_id], ['CMP-BFCM26', 'CMP-BFCM26'],
    'A10  two concurrent reuses resolve the SAME campaign_id');
  eq(S.__rowCount(), 1, 'A10a and add no row');
  eq([S.__writes().length, S.__tries()], [0, 0], 'A10b no write, no lock, either time');
})();

(function () {
  // §12.6 — the lock is released when the locked pass refuses, and when tryLock itself fails.
  var S = serverWorld([], { lockFails: true });
  var r = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'BFCM 2028', year: 2028,
    start_date: '2028-11-24', end_date: '2028-11-30' }));
  ok(r.success === false && r.error === 'CAMPAIGN_LOCK_TIMEOUT',
    'A11  a genuine lock timeout is still reported, on the path that genuinely needs the lock');
  eq(S.__writes().length, 0, 'A11a and nothing was written');
  eq(S.__releases(), 1, 'A11b the finally still ran — a failed tryLock does not leak the lock');
})();

(function () {
  // THE LOCKED PASS IS SELF-SUFFICIENT. With the unlocked pass skipped entirely, every outcome is
  // still correct — which is what makes pass 1 a pure optimisation and pass 2 the authority.
  var SKIP = 'function campaignSheetReady_() { return false; }';
  var S = serverWorld([CAMPAIGN_ROW], { ready: SKIP });
  var r = S.handleUpsertCampaign_(payloadFor());
  ok(r.success === true && r.data.reused === true && S.__writes().length === 0,
    'A13  with the unlocked pass skipped, the locked pass still classifies the reuse — zero writes');
  eq(S.__tries(), 1, 'A13a it does take the lock on that route, which is the cost of not knowing yet');
  var S2 = serverWorld([CAMPAIGN_ROW], { ready: SKIP });
  var r2 = S2.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED' }));
  ok(r2.success === false && r2.error === 'STALE_CAMPAIGN_VERSION',
    'A13b and still refuses a versionless header mutation');
})();

(function () {
  // The unlocked pass runs only against a structurally sound sheet, because repairing one is a write.
  var S = serverWorld([CAMPAIGN_ROW]);
  eq(S.campaignSheetReady_({ __g: 1 }), true, 'A12  a complete sheet is ready to classify against');
  var Short = serverWorld([CAMPAIGN_ROW], { headers: ['campaign_id', 'company'] });
  eq(Short.campaignSheetReady_({ __g: 1 }), false,
    'A12a a sheet missing a canonical column is NOT — that repair belongs under the lock');
})();

// =========================================================================================================
section('B. THE TIMED-OUT TABLE HAS A NAME');
// =========================================================================================================
ok(/table: tableName/.test(API),
  'B0  getOperationDbTableFromSheet attaches the table to the typed error it throws');
var ERRTBL = fnSrc(FCS, '_fcErrTable_');
ok(/kmTransport/.test(ERRTBL) && /\.table/.test(ERRTBL), 'B1  and the page has a reader for it');
var DETAIL = fnSrc(FCS, '_fcErrDetail_');
ok(/bits\.push\('Table: ' \+ _tbl\)/.test(DETAIL), 'B2  which the refusal line renders');
ok(DETAIL.indexOf("'Action: ' + f.action") < DETAIL.indexOf("'Table: ' + _tbl"),
  'B2a next to the action it qualifies');
(function () {
  var sb = { console: console, String: String }; vm.createContext(sb);
  vm.runInContext(ERRTBL, sb);
  eq(sb._fcErrTable_({ kmTransport: { code: 'REQUEST_TIMEOUT', action: 'getTable', table: 'pricing_list' } }),
    'pricing_list', 'B3  a timed-out table read names its table');
  eq(sb._fcErrTable_({ transport: { table: 'campaigns' } }), 'campaigns', 'B3a either envelope is read');
  eq(sb._fcErrTable_({ kmTransport: { code: 'REQUEST_TIMEOUT', action: 'fcSummary.workspace.get' } }), '',
    'B3b an error that is not about a table adds nothing');
  eq(sb._fcErrTable_(null), '', 'B3c and a missing error is not an exception');
})();
var REFUSAL = fnSrc(FCS, '_fcShowPrereqRefusal_');
ok(/_fcErrDetail_\(err, FC_RETRY_\.COLD_READ\)/.test(REFUSAL),
  'B4  the prerequisite refusal composes through that same line');
ok(/proceedToFcMode\(\);/.test(REFUSAL) && /exactly ONE new logical load/.test(REFUSAL),
  'B5  and its Retry is still exactly one new load — no auto-loop');

// =========================================================================================================
section('C. PREREQUISITES: WARM MEANS WARM, AND SHARED MEANS SHARED');
// =========================================================================================================
var PREREQ = varSrc(FCS, '_FC_PREREQ_TABLES_');
var SLICETBL = varSrc(FCS, '_FC_SLICE_PREREQ_TABLES_');
function prereqWorld(resetSrc) {
  var sb = { console: console, Object: Object, Array: Array, String: String };
  vm.createContext(sb);
  vm.runInContext([
    PREREQ, SLICETBL, 'var _fcSecondaryLoaded = true;',
    'var _fcPrereqLoadedPaths_ = {};', 'var _fcPrereqLoadedTables_ = {};',
    fnSrc(FCS, '_fcSliceTables_'), fnSrc(FCS, '_fcPrereqMissing_'),
    // R2-STABILITY §4 — `_fcResetSecondaryCache` now consults the receipts before invalidating, so
    // its callee is lifted too. With no `KM.DB.reconcileCacheRow` in this sandbox it reconciles
    // nothing, which is the pre-round behaviour and is exactly what the assertions below expect.
    fnSrc(FCS, '_fcReconcileFromReceipts_'),
    resetSrc || fnSrc(FCS, '_fcResetSecondaryCache')
  ].join('\n'), sb);
  sb.__load = function (p) {
    var miss = sb._fcPrereqMissing_(p);
    var cur = vm.runInContext('_fcPrereqLoadedTables_', sb);
    miss.forEach(function (t) { cur[t] = true; });
    return miss;                       // the physical requests that load would issue
  };
  return sb;
}
// A3-R10 §14.4 — `marketplaces` is no longer a prerequisite on either path: the fcSummary bootstrap
// slice emits it, adapted through the same normalizer and filter as the broad cache, so the Builder
// reads it from the page model and issues no physical getTable for it.
/* S3-R12 — FIVE, NOT SIX. fc_special_events left the Special prerequisite list because an
   authoritative scoped owner already carries it: the fcSummary `events` slice, whose declared key set
   is exactly ['fcSpecialEvents']. `_evtBuilderEventRows_` has always preferred the read model over the
   broad cache, so the table was being fetched to fill a fallback. This is the same removal
   R2-STABILITY §2 made for fc_regular_forecast on the Regular path, with the same replacement shape
   (`_fcEnsureEventSource_` beside `_fcEnsureBaseFcSource_`). The WRITE census below is untouched: a
   Special save still reaches three tables, and the third is now made current by the slice readback
   rather than by a broad re-read. */
var EVENT_TABLES = ['sku_details', 'marketplace_skus', 'campaigns',
  'campaign_sku_lines', 'pricing_list'];
// R2-STABILITY §1/§2 — `fc_regular_forecast` left this list. It was fetched once and read never: in
// Workspace mode `_fcGetRegularForecast()` answers from the read model and does not fall through to
// the broad cache, so the six Builder call sites that were asking `KM.DB.getFcRegularForecast()`
// directly now ask the page accessor and the broad read serves nobody. Same correction as §14.4 above,
// one table further down. C1 and C6 below move with it — and C6 in particular becomes the strongest
// statement in this section: Special -> Regular now fetches NOTHING AT ALL.
var REGULAR_TABLES = ['sku_details', 'marketplace_skus'];
var SHARED = ['sku_details', 'marketplace_skus'];

(function () {
  var W = prereqWorld();
  eq(W._FC_PREREQ_TABLES_.regular.slice().sort(), REGULAR_TABLES.slice().sort(), 'C0  the Regular path\'s tables');
  eq(W._FC_PREREQ_TABLES_.event.slice().sort(), EVENT_TABLES.slice().sort(), 'C0a the Special path\'s tables');
  // Derived from the SOURCE declarations, not from the two constants above — intersecting this file's
  // own lists asserted nothing about the page and would have survived either list moving.
  var shared = W._FC_PREREQ_TABLES_.regular.filter(function (t) {
    return W._FC_PREREQ_TABLES_.event.indexOf(t) !== -1;
  });
  eq(shared.sort(), SHARED.slice().sort(), 'C0b and the two they share');
})();

(function () {
  // §12.8/§12.9 — A: cold Regular, then Regular again.
  var W = prereqWorld();
  eq(W.__load('regular').sort(), REGULAR_TABLES.slice().sort(), 'C1  cold Regular fetches its two tables');
  eq(W.__load('regular'), [], 'C2  warm Regular fetches NOTHING — 0 physical requests');
})();

(function () {
  // §12.10/§12.11 — B: cold Special, then Special again.
  var W = prereqWorld();
  eq(W.__load('event').sort(), EVENT_TABLES.slice().sort(), 'C3  cold Special fetches its six tables');
  eq(W.__load('event'), [], 'C4  warm Special fetches NOTHING — 0 physical requests');
})();

(function () {
  // §12.12 — C: Regular loaded, then Special. The three shared tables are NOT fetched again.
  var W = prereqWorld();
  W.__load('regular');
  var second = W.__load('event').sort();
  /* S3-R12 — fc_special_events left the Special prerequisite list: the fcSummary `events` slice is
     its authoritative scoped owner, and `_evtBuilderEventRows_` has always preferred the read model.
     The RULE each of these asserts is untouched; only the membership it is asserted over moved. */
  eq(second, ['campaign_sku_lines', 'campaigns', 'pricing_list'],
    'C5  Regular → Special fetches only the three the Special path does not already hold');
  eq(SHARED.filter(function (t) { return second.indexOf(t) !== -1; }), [],
    'C5a not one shared table is re-requested');
})();

(function () {
  // §12.13 — D: Special loaded, then Regular.
  var W = prereqWorld();
  W.__load('event');
  var second = W.__load('regular');
  // The Special path already holds both of the Regular path's tables, and the Regular path no longer
  // wants a third. So this sequence costs the operator nothing at all.
  eq(second, [], 'C6  Special → Regular fetches NOTHING — every table it needs is already warm');
})();

(function () {
  // §12.14/§12.F — a chooser close/open, a route return, and any flow with NO write, all leave the
  // record alone: the ONLY caller of the reset is the post-write path.
  var defs = (FCS.match(/function _fcResetSecondaryCache\(/g) || []).length;
  eq(defs, 1, 'C7  _fcResetSecondaryCache has exactly one definition');
  // Occurrences minus the definition minus the one prose mention in the ownership comment above it.
  var invocations = (FCS.match(/[^n] _fcResetSecondaryCache\(scope\)/g) || []).length;
  eq(invocations, 1, 'C7z and exactly one place invokes it', invocations);
  ok(/if \(typeof _fcResetSecondaryCache === 'function'\) _fcResetSecondaryCache\(scope\);/.test(FCS),
    'C7a and that call site is the scoped post-write path');
  var AFTER = fnSrc(FCS, '_fcAfterWrite');
  ok(AFTER.indexOf('_fcResetSecondaryCache(scope)') !== -1,
    'C7b so nothing but a write can clear a valid prerequisite');
  ok(!/function (openEventModal|openRegularUpdateModal|closeFcModal)[\s\S]{0,4000}_fcResetSecondaryCache/.test(FCS),
    'C7c no modal opener or closer clears it');
})();

(function () {
  // §12.16 — the slice fetcher is still single-flight, so a Retry cannot become a storm.
  var SF = fnSrc(FCS, '_fcSliceFetch_');
  ok(/if \(rec\.flight\) return rec\.flight;/.test(SF), 'C8  slice reads are single-flight');
  var LP = fnSrc(FCS, '_fcLoadPrerequisites_');
  ok(/if \(_fcPrereqFlightByPath_\[p\]\) return _fcPrereqFlightByPath_\[p\];/.test(LP),
    'C8a and so are prerequisite loads, per path');
  ok(/_fcPrereqFlightByPath_\[p\] = null/.test(LP),
    'C8b with the latch released on failure, so Retry issues a NEW request rather than re-awaiting a dead one');
})();

// =========================================================================================================
section('D. FOUR BASELINES, FOUR NAMES');
// =========================================================================================================
function baseWorld(opts) {
  opts = opts || {};
  var dom = {
    'event-assist-method': { value: opts.method || 'growth' },
    'event-assist-base-campaign': { value: opts.baseCampaign === undefined ? 'CMP-BFCM25' : opts.baseCampaign },
    'event-assist-base-year': { value: opts.baseYear === undefined ? '' : opts.baseYear },
    'event-assist-base-month': { value: opts.baseMonth === undefined ? '0' : opts.baseMonth },
    'event-start-date': { value: opts.start === undefined ? '2026-11-19' : opts.start },
    'event-target-year': { value: '2026' }
  };
  var sb = {
    console: console, String: String, Number: Number, isNaN: isNaN, Math: Math,
    parseInt: parseInt, parseFloat: parseFloat, Array: Array, Object: Object,
    document: { getElementById: function (id) { return dom[id] || null; } },
    __growthCalls: [], __regularCalls: [], __eventCalls: []
  };
  vm.createContext(sb);
  vm.runInContext([
    'function _evtAssistMethod() { return (document.getElementById("event-assist-method") || {}).value || "growth"; }',
    'function _evtGrowthBaseForSku(cid, sku) { __growthCalls.push([cid, sku]); return ' +
      (opts.growthValue === undefined ? '7000' : JSON.stringify(opts.growthValue)) + '; }',
    'function _evtBaseFcForSku(sku, m, y) { __regularCalls.push([sku, m, y]); return ' +
      (opts.regularValue === undefined ? '4200' : JSON.stringify(opts.regularValue)) + '; }',
    'function _evtEventBaseFcForSku(sku) { __eventCalls.push(sku); return ' +
      (opts.eventValue === undefined ? '4200' : JSON.stringify(opts.eventValue)) + '; }',
    fnSrc(FCS, '_evtEventMonthIdx'),
    fnSrc(FCS, '_evtBaselineKind_'), fnSrc(FCS, '_evtBaselineLabel_'),
    opts.missingSrc || fnSrc(FCS, '_evtBaselineMissingInput_'),
    opts.buildSrc || fnSrc(FCS, '_evtBuildBaselineForSku')
  ].join('\n'), sb);
  return sb;
}

(function () {
  // §12.17 — GROWTH reads the Base Campaign's event FC, and says so.
  var W = baseWorld({ method: 'growth' });
  eq(W._evtBaselineKind_(), 'growth', 'D1  growth is its own baseline kind');
  eq(W._evtBaselineLabel_(), 'Base Campaign FC', 'D1a labelled Base Campaign FC');
  eq(W._evtBuildBaselineForSku('CO1100-R'), 7000, 'D1b and resolves from the Base Campaign');
  eq(W.__growthCalls, [['CMP-BFCM25', 'CO1100-R']], 'D1c through the campaign reader, with the selected campaign');
  eq(W.__regularCalls.length + W.__eventCalls.length, 0,
    'D1d and NEVER touches fc_regular_forecast — that is a different quantity, not a fallback');
})();

(function () {
  // §12.18 — ADJUST reads the Regular forecast at the operator's chosen Base Year + Base Month.
  var W = baseWorld({ method: 'adjust', baseYear: '2025', baseMonth: '10' });
  eq(W._evtBaselineKind_(), 'adjust', 'D2  adjust is its own kind');
  eq(W._evtBaselineLabel_(), 'Base Forecast', 'D2a labelled Base Forecast');
  eq(W._evtBuildBaselineForSku('CO1100-R'), 4200, 'D2b and resolves from the Regular forecast');
  eq(W.__regularCalls, [['CO1100-R', 10, 2025]],
    'D2c at the OPERATOR\'s Base Year and Base Month, not the event\'s own month');
  eq(W.__growthCalls.length, 0, 'D2d and never from a campaign');
})();

(function () {
  // ADJUST with no explicit base period falls back to the event's own month — A3-R5's behaviour, kept.
  var W = baseWorld({ method: 'adjust', baseYear: '', baseMonth: '0' });
  eq(W._evtBuildBaselineForSku('CO1100-R'), 4200, 'D3  with no Base Year it uses the event month');
  eq(W.__eventCalls, ['CO1100-R'], 'D3a through the event-month owner A3-R5 added');
})();

(function () {
  // §12.19 — MANUAL does not pretend a baseline exists.
  var W = baseWorld({ method: 'manual' });
  eq(W._evtBaselineKind_(), 'manual', 'D4  manual is its own kind');
  eq(W._evtBaselineLabel_(), 'Base (n/a)', 'D4a and the column says the baseline does not apply');
  eq(W._evtBuildBaselineForSku('CO1100-R'), null, 'D4b it resolves nothing');
  eq(W.__growthCalls.length + W.__regularCalls.length + W.__eventCalls.length, 0,
    'D4c and reads no baseline source at all');
})();

(function () {
  // §12.21 — a MISSING INPUT is a different state from a missing row.
  var noCampaign = baseWorld({ method: 'growth', baseCampaign: '' });
  ok(/Base Campaign/.test(noCampaign._evtBaselineMissingInput_()),
    'D5  growth with no Base Campaign selected reports the INPUT it needs');
  eq(noCampaign._evtBuildBaselineForSku('CO1100-R'), null, 'D5a and resolves nothing meanwhile');
  eq(noCampaign.__growthCalls.length, 0, 'D5b without asking the reader a question it cannot answer');

  var noPeriod = baseWorld({ method: 'adjust', baseYear: '', baseMonth: '0', start: '' });
  ok(/Event Period/.test(noPeriod._evtBaselineMissingInput_()),
    'D6  adjust with neither an event window nor a base period asks for the Event Period');
  eq(noPeriod._evtBuildBaselineForSku('CO1100-R'), null, 'D6a and resolves nothing');

  var explicit = baseWorld({ method: 'adjust', baseYear: '2025', baseMonth: '3', start: '' });
  eq(explicit._evtBaselineMissingInput_(), '',
    'D7  but an explicit Base Year + Base Month needs NO event window — the filter does not use one');
  eq(explicit._evtBuildBaselineForSku('CO1100-R'), 4200, 'D7a and answers');

  eq(baseWorld({ method: 'manual', start: '' })._evtBaselineMissingInput_(), '',
    'D8  manual never demands an input for a baseline it does not have');
  eq(baseWorld({ method: 'growth' })._evtBaselineMissingInput_(), '',
    'D9  and a selected Base Campaign is all growth needs');
})();

(function () {
  // §12.22/§12.23 — zero is a value; missing is missing. Both survive the dispatch.
  eq(baseWorld({ method: 'growth', growthValue: 0 })._evtBuildBaselineForSku('X'), 0,
    'D10  a Base Campaign FC of 0 stays 0');
  eq(baseWorld({ method: 'adjust', baseYear: '2025', baseMonth: '1', regularValue: 0 })._evtBuildBaselineForSku('X'), 0,
    'D10a a Base Forecast of 0 stays 0');
  eq(baseWorld({ method: 'growth', growthValue: null })._evtBuildBaselineForSku('X'), null,
    'D11  and a genuinely absent baseline stays null');
})();

(function () {
  // The card renders the name of the quantity it is holding, and distinguishes the two blank reasons.
  var RENDER = fnSrc(FCS, '_evtRenderGroupCards');
  ok(/_evtBaselineLabel_\(\)/.test(RENDER), 'D12  the column header is the method\'s own label');
  ok(/var baseKind = _evtBaselineKind_\(\), baseNote = _evtBaselineMissingInput_\(\);/.test(RENDER),
    'D12a the card knows both the kind and whether an input is missing');
  ok(/baseNote \? 'set input' : \(baseKind === 'manual' \? 'n\/a' : '—'\)/.test(RENDER),
    'D12b so "you have not told me yet", "not applicable" and "no such row" are three different cells');
  var BUILD = fnSrc(FCS, '_evtBuildGroups');
  ok(/_evtBuildBaselineForSku\(r\.sku\)/.test(BUILD), 'D13  and Build resolves through the one dispatcher');
})();

(function () {
  // §12.20 — the FOURTH meaning: a persisted event's own fc_qty is the CURRENT EVENT FC.
  var LBL = fnSrc(FCS, '_evtApplyCurrentFcLabel_');
  ok(/'Current Event FC'/.test(LBL) && /'Qty'/.test(LBL),
    'D14  the Qty control is renamed Current Event FC while a saved event is loaded');
  var CHROME = fnSrc(FCS, '_evtSetEditingChrome_');
  ok(/_evtApplyCurrentFcLabel_\(\)/.test(CHROME), 'D14a applied when the editing chrome goes on');
  var ADD = fnSrc(FCS, '_evtAddSingleRow');
  ok(/_evtApplyCurrentFcLabel_\(row\)/.test(ADD), 'D14b and inherited by a row added while editing');
  // The two can never share a cell: an existing event rehydrates into Single SKU mode, whose rows have
  // no baseline column at all. That is asserted here so a later round cannot quietly change it.
  var HYD = fnSrc(FCS, '_evtHydrateExisting_');
  ok(/input\[name="event-mode"\]\[value="single"\]/.test(HYD),
    'D15  an existing event rehydrates into Single SKU mode');
  var SINGLE = fnSrc(FCS, '_evtAddSingleRow');
  ok(SINGLE.indexOf('Base FC') === -1 && SINGLE.indexOf('Base Campaign FC') === -1,
    'D15a whose rows carry NO baseline column — the current value can never be read as a baseline');
})();

// =========================================================================================================
section('E. R16 / A3-R5 / A3-R2 NON-REGRESSION');
// =========================================================================================================
(function () {
  // §12.24 — the operator's own passing flow.
  var S = serverWorld([CAMPAIGN_ROW]);
  var r = S.handleUpsertCampaign_(payloadFor());
  ok(r.success === true && r.data.campaign_id === 'CMP-BFCM26' && S.__writes().length === 0,
    'E1  existing Campaign + a new SKU still resolves the header with zero writes');
})();
ok(/if \(headerIdentical\) \{/.test(GS20), 'E2  the R16 reuse branch survives the restructure');
ok(RESOLVER.indexOf('if (headerIdentical) {') < RESOLVER.indexOf('var expectedVersion'),
  'E3  §12.25 — still classified BEFORE the version gate');
ok(/_kmCanonicalWrite_/.test(API) && /kind: 'write'/.test(API), 'E4  §12.29 canonical write transport preserved');
ok(/STALE_CAMPAIGN_VERSION/.test(API) && /CAMPAIGN_LOCK_TIMEOUT/.test(API),
  'E5  §12.26 the typed codes, CAMPAIGN_LOCK_TIMEOUT included, are still registered on the client');
var TRENDER = fnSrc(FCS, '_fcRenderTargetSave_');
ok(/b\.disabled = _fcTargetSave_\.busy \|\| !_fcTargetSave_\.valid;/.test(TRENDER)
  && /if \(_fcTargetSave_\.busy\) \{/.test(TRENDER),
  'E6  §12.27 the A3-R5 Target Rule valid/busy split is untouched');
(function () {
  // §12.28 — the A3-R5 three-table post-write readback.
  var W = prereqWorld();
  W.__load('event'); W.__load('regular');
  W._fcResetSecondaryCache('events');
  eq(W._fcPrereqMissing_('event').sort(), ['campaign_sku_lines', 'campaigns'],
    'E7  a Special save still invalidates exactly three tables');
  eq(W._fcPrereqMissing_('regular'), [], 'E7a and leaves the Regular builder warm');
})();

// =========================================================================================================
section('F. MUTANTS');
// =========================================================================================================
function faultHandler(from, to) {
  var out = (from instanceof RegExp) ? HANDLER.replace(from, to) : HANDLER.split(from).join(to);
  if (out === HANDLER) throw new Error('handler mutant anchor drifted: ' + from);
  return out;
}
function faultResolver(from, to) {
  var out = (from instanceof RegExp) ? RESOLVER.replace(from, to) : RESOLVER.split(from).join(to);
  if (out === RESOLVER) throw new Error('resolver mutant anchor drifted: ' + from);
  return out;
}

mutant('M1 the lock is taken before the classification again (the A3-R6 defect)', (function () {
  var faulted = faultHandler('  var pre = ss.getSheetByName(\'campaigns\');',
    '  var pre = null;');
  var S = serverWorld([CAMPAIGN_ROW], { handler: faulted });
  S.handleUpsertCampaign_(payloadFor());
  return S.__tries() > 0;          // a zero-write reuse queued for the project lock again
})());

mutant('M2 the locked pass trusts the unlocked classification instead of re-resolving', (function () {
  var faulted = faultHandler('    var r = campaignResolveOrTerminal_(sheet, body, name, suppliedId);',
    '    var r = { terminal: false, id: \'\' };');
  // The unlocked pass is skipped, which is the state the locked re-resolve exists for: live, it is a
  // row another execution appended after this one had already looked.
  var SKIP = 'function campaignSheetReady_() { return false; }';
  var S = serverWorld([CAMPAIGN_ROW], { handler: faulted, ready: SKIP });
  S.handleUpsertCampaign_(payloadFor());
  return S.__rowCount() > 1;       // the create race is open: a duplicate campaign appears
})());

mutant('M3 the unlocked pass answers a NON-terminal classification', (function () {
  var faulted = faultHandler('    if (early.terminal) return early.response;', '    return early.response;');
  var S = serverWorld([], { handler: faulted });
  var r = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'BFCM 2029', year: 2029,
    start_date: '2029-11-23', end_date: '2029-11-29' }));
  return r === undefined || r === null;   // a create returned "no response"
})());

mutant('M4 the lock is not released', (function () {
  var faulted = faultHandler(/\} finally \{\s*try \{ lock\.releaseLock\(\); \} catch \(e\) \{\}\s*\}/,
    '} finally { }');
  var S = serverWorld([CAMPAIGN_ROW], { handler: faulted });
  var fp = S.handleUpsertCampaign_(payloadFor()).data.row_version;
  S.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED', expected_row_version: fp }));
  return S.__releases() === 0;
})());

mutant('M5 the readiness probe passes an incomplete sheet', (function () {
  var READY = fnSrc(GS20, 'campaignSheetReady_');
  var faulted = READY.replace('if (s.col(CAMPAIGNS_HEADERS_[i]) === -1) return false;', '');
  if (faulted === READY) throw new Error('M5 anchor drifted');
  var S = serverWorld([CAMPAIGN_ROW], { headers: ['campaign_id', 'company'], ready: faulted });
  return S.campaignSheetReady_({ __g: 1 }) === true;
})());

mutant('M6 a real stale mutation is allowed through the unlocked pass', (function () {
  var S = serverWorld([CAMPAIGN_ROW], { resolver: faultResolver(
    'if (expectedVersion !== matched.fingerprint) {', 'if (false) {') });
  var r = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED', expected_row_version: 'stale' }));
  return r.success === true;
})());

mutant('M7 the table name is dropped from the refusal line', (function () {
  var faulted = DETAIL.replace("bits.push('Table: ' + _tbl);", '');
  if (faulted === DETAIL) throw new Error('M7 anchor drifted');
  return !/Table: /.test(faulted);
})());

mutant('M8 the Build baseline ignores the assist method', (function () {
  var BUILDFN = fnSrc(FCS, '_evtBuildBaselineForSku');
  var faulted = BUILDFN.replace('  var k = _evtBaselineKind_();', '  var k = "adjust";');
  if (faulted === BUILDFN) throw new Error('M8 anchor drifted');
  var W = baseWorld({ method: 'growth', buildSrc: faulted });
  W._evtBuildBaselineForSku('CO1100-R');
  return W.__growthCalls.length === 0;    // growth silently read a Regular forecast
})());

mutant('M9 growth falls back to the regular forecast', (function () {
  var BUILDFN = fnSrc(FCS, '_evtBuildBaselineForSku');
  var faulted = BUILDFN.replace(
    "    return _evtGrowthBaseForSku((document.getElementById('event-assist-base-campaign') || {}).value || '', sku);",
    '    return _evtEventBaseFcForSku(sku);');
  if (faulted === BUILDFN) throw new Error('M9 anchor drifted');
  var W = baseWorld({ method: 'growth', buildSrc: faulted });
  W._evtBuildBaselineForSku('CO1100-R');
  return W.__eventCalls.length > 0;
})());

mutant('M10 manual pretends a baseline exists', (function () {
  var BUILDFN = fnSrc(FCS, '_evtBuildBaselineForSku');
  var faulted = BUILDFN.replace("  if (k === 'manual') return null;", '');
  if (faulted === BUILDFN) throw new Error('M10 anchor drifted');
  var W = baseWorld({ method: 'manual', buildSrc: faulted });
  return W._evtBuildBaselineForSku('CO1100-R') !== null;
})());

mutant('M11 a missing input is reported as no data', (function () {
  var MISS = fnSrc(FCS, '_evtBaselineMissingInput_');
  var faulted = MISS.replace(/return \(_evtEventMonthIdx\(\) == null\)[\s\S]*?: '';/, "return '';");
  if (faulted === MISS) throw new Error('M11 anchor drifted');
  var W = baseWorld({ method: 'adjust', baseYear: '', baseMonth: '0', start: '', missingSrc: faulted });
  return W._evtBaselineMissingInput_() === '';   // the operator is shown an empty cell, not the reason
})());

mutant('M12 the baseline column keeps one generic name', (function () {
  var LBLFN = fnSrc(FCS, '_evtBaselineLabel_');
  var faulted = LBLFN.replace(/  var k = _evtBaselineKind_\(\);[\s\S]*?return 'Base \(n\/a\)';/,
    "  return 'Base FC';");
  if (faulted === LBLFN) throw new Error('M12 anchor drifted');
  var sb = { console: console }; vm.createContext(sb);
  vm.runInContext(faulted, sb);
  return sb._evtBaselineLabel_() === 'Base FC';
})());

// =========================================================================================================
section('G. VACUITY — the unfaulted tree really does behave as the mutants assume');
// =========================================================================================================
(function () {
  var S = serverWorld([CAMPAIGN_ROW]);
  S.handleUpsertCampaign_(payloadFor());
  ok(S.__tries() === 0 && S.__rowCount() === 1,
    'G1  a real reuse really does take no lock and add no row, so M1/M2 can fail');
  var W = baseWorld({ method: 'growth' });
  W._evtBuildBaselineForSku('X');
  ok(W.__growthCalls.length === 1 && W.__eventCalls.length === 0,
    'G2  growth really does read the campaign and not the forecast, so M8/M9 can fail');
  ok(baseWorld({ method: 'manual' })._evtBuildBaselineForSku('X') === null,
    'G3  manual really does resolve nothing, so M10 can fail');
  ok(/Table: /.test(DETAIL), 'G4  the real detail line really does carry the table, so M7 can fail');
})();

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail
  + ' failed, ' + mutants.length + ' mutants, ' + survived.length + ' survived');
console.log(new Array(101).join('='));
process.exit((fail === 0 && survived.length === 0) ? 0 : 1);
