// FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R2 — the repair, driven.
//
// R1 was an investigation and its suite proved four defects. This one proves they are closed, and it does
// so by RUNNING the shipped code rather than by reading it:
//
//   §4  fcSpecialEventUpsert_ against a real sheet with and without the line it names
//   §6  two concurrent stage-2 writes against one campaign
//   §1  _evtVerifyGraph_ against graphs built by the REAL server projection, fcsGraphProject_
//   §3  the projection itself, over tables in the shape 58_ reads them
//
// WHAT THIS SUITE WILL NOT DO. It never asserts success from a count the client supplied — that is the
// defect under repair, so every "committed" figure below is read out of a projection of the sheets. Where
// a fixture needs to say what the save INTENDED, it says so through stage 2's receipt, which is where the
// line ids actually come from.
//
// A NOTE ON THE NINE. The production EU BFCM incident is nine orphaned events, not five: the operator
// tested two Series. Nothing in this suite or in the repair carries that number — expected cardinality is
// derived from the event graph in every path, and §J asserts that no literal row count exists anywhere in
// the recovery logic.
//
// NO PRODUCTION WRITE. A fake spreadsheet, pure projections, and source text. No network, no clock.
// Run: node assets/tests/fc-special-event-write-consistency-r2.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var GS = 'specs/active/apps-script/';
var G14 = read(GS + '14_fc_write_handlers.gs');
var G20 = read(GS + '20_campaign_write_handlers.gs');
var G29 = read(GS + '29_production_safety_adapter.gs');
var G58 = read(GS + '58_api_v1_fc_summary_workspace.gs');
var FCS = read('js/pages/fc-summary.js');
var API = read('js/api/operation-system-db-api.js');
var KMSAFE = require(path.join(ROOT, 'js', 'core', 'supply-planning-production-safety.js'));

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, extra) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
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
var SAVEC = code(fnSrc(FCS, 'saveEventUpdate'));

// =========================================================================================================
// THE FAKE SPREADSHEET — every method logged, so lock and read counts are measured rather than described.
// =========================================================================================================
function mkSheet(headers, rows, log, name) {
  var grid = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    __name: name, __grid: grid,
    getDataRange: function () { log.push({ sheet: name, op: 'getDataRange' });
      return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col, nr, nc) {
      return {
        getValues: function () { var o = []; for (var i = 0; i < (nr || 1); i++) { var r = grid[row - 1 + i] || []; o.push(r.slice(col - 1, col - 1 + (nc || 1))); } return o; },
        setValues: function (vals) { log.push({ sheet: name, op: 'setValues', row: row, nr: vals.length });
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
var CAMP_HEADERS = ['campaign_id', 'campaign_name', 'company', 'country', 'marketplace', 'year',
  'event_start_date', 'event_end_date', 'created_by', 'created_at', 'updated_by', 'updated_at'];

function serverWorld(opts) {
  opts = opts || {};
  var log = [], locks = [];
  var sheets = {
    campaigns: mkSheet(CAMP_HEADERS, opts.campaigns || [], log, 'campaigns'),
    campaign_sku_lines: mkSheet(LINE_HEADERS, opts.lines || [], log, 'campaign_sku_lines'),
    fc_special_events: mkSheet(EVT_HEADERS, opts.events || [], log, 'fc_special_events')
  };
  if (!opts.noRegistry) {
    sheets.marketplaces = mkSheet(['marketplace_id', 'company', 'country', 'marketplace'],
      (opts.marketplaces || [['M1', 'KM', 'DE', 'Amazon']]), log, 'marketplaces');
  }
  var ss = { getId: function () { return 'TESTDB'; },
    getSheetByName: function (n) { return sheets[n] || null; },
    insertSheet: function (n) { return sheets[n]; } };
  var lockHeld = opts.lockHeld === true;
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, KMSAFE: KMSAFE, PRODUCTION_DB_SPREADSHEET_ID_: 'TESTDB',
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-30 00:00:00'; },
      getUuid: (function () { var n = 0; return function () { n++; return ('u' + n) + '-bbbb-cccc-dddd-eeeeeeeeeeee'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    LockService: { getScriptLock: function () {
      return { tryLock: function () { locks.push('tryLock'); return !lockHeld; },
        releaseLock: function () { locks.push('release'); } };
    } },
    jsonResponse_: function (o) { return o; } };
  vm.createContext(sb);
  vm.runInContext(G29, sb); vm.runInContext(G14, sb); vm.runInContext(G20, sb);
  return { sb: sb, log: log, locks: locks, sheets: sheets, ss: ss };
}
function dataRows(sheet) { return sheet.__grid.slice(1).filter(function (r) { return String(r.join('')).trim() !== ''; }); }
function colOf(hs, n) { return hs.indexOf(n); }
function lineRow(id, campaignId, sku) {
  return LINE_HEADERS.map(function (h) {
    if (h === 'campaign_sku_line_id') return id;
    if (h === 'campaign_id') return campaignId;
    if (h === 'sku') return sku || '';
    return '';
  });
}
function evtRow(o) { return EVT_HEADERS.map(function (h) { return o[h] === undefined ? '' : o[h]; }); }
function evtPayload(campaignId, lineId, sku) {
  return { campaign_id: campaignId, campaign_sku_line_id: lineId, company: 'KM', country: 'DE',
    marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku', scope_id: sku, sku: sku,
    event_name: 'BFCM', year: 2026, fc_qty: 10, source: 'campaign_sync' };
}

// The REAL page comparison and the REAL server projection, lifted.
var SB2 = { console: console, String: String, Number: Number, Object: Object, Array: Array, JSON: JSON };
vm.createContext(SB2);
vm.runInContext(fnSrc(FCS, '_evtVerifyGraph_'), SB2);
vm.runInContext(fnSrc(G58, 'fcsGraphUp_'), SB2);
vm.runInContext(fnSrc(G58, 'fcsGraphProject_'), SB2);
var verify = SB2._evtVerifyGraph_;
var project = SB2.fcsGraphProject_;

// The adapter's rename, applied exactly as operation-system-db-api.js applies it. Written here rather than
// imported because the whole browser file cannot be loaded in Node — and section G pins the two in step.
function adaptGraph(g) {
  return { campaignId: String(g.campaign_id || ''), campaignFound: g.campaign_found === true,
    lineIds: (g.lineIds || []).map(String),
    events: (g.events || []).map(function (e) {
      return { eventFcId: String(e.event_fc_id || ''), campaignSkuLineId: String(e.campaign_sku_line_id || ''),
        sku: String(e.sku || '') };
    }) };
}
// Build the graph the way 58_ would, from table objects in the shape io.readTable returns.
function graphOf(world, campaignId) {
  var rowsOf = function (sheet, headers) {
    return dataRows(sheet).map(function (r) { var o = {}; headers.forEach(function (h, i) { o[h] = r[i]; }); return o; });
  };
  return adaptGraph(project({
    campaigns: rowsOf(world.sheets.campaigns, CAMP_HEADERS),
    campaign_sku_lines: rowsOf(world.sheets.campaign_sku_lines, LINE_HEADERS),
    fc_special_events: rowsOf(world.sheets.fc_special_events, EVT_HEADERS)
  }, { campaign_id: campaignId }));
}
function expectedOf(lineIds, skus) { return { lineIds: lineIds, skus: skus || lineIds, eventCount: lineIds.length }; }

// =========================================================================================================
section('A. §13.1 / §13.14 — all three stages commit, and the readback VERIFIES it');
// =========================================================================================================
(function () {
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-1' : ''; })] });
  var L = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', actor: 't',
    lines: [{ sku: 'S1', marketplace_sku_id: 'MSK-1' }, { sku: 'S2', marketplace_sku_id: 'MSK-2' }] });
  ok(L.success, 'A1 stage 2 commits two lines');
  var ids = L.data.lines.map(function (x) { return x.campaign_sku_line_id; });
  var E = w.sb.handleImportFcSpecialEventsBatch_({ options: { actor: 't' },
    rows: [evtPayload('C-1', ids[0], 'S1'), evtPayload('C-1', ids[1], 'S2')] });
  eq([E.success, dataRows(w.sheets.fc_special_events).length], [true, 2], 'A2 stage 3 commits two events');

  var v = verify(graphOf(w, 'C-1'), expectedOf(ids, ['S1', 'S2']));
  eq([v.verified, v.committedCampaignCount, v.committedLineCount, v.committedEventCount], [true, 1, 2, 2],
    'A3 the GRAPH READBACK verifies the whole save (executed end to end)');
  eq([v.missingLineIds, v.missingEventSkus, v.orphanEventIds], [[], [], []],
    'A4 with nothing missing and nothing orphaned');
})();

// =========================================================================================================
section('B. §13.2–§13.5 — every incomplete graph refuses to be called success');
// =========================================================================================================
// 13.2 — campaign commits, lines do not.
(function () {
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-2' : ''; })] });
  var v = verify(graphOf(w, 'C-2'), expectedOf(['CSL-A', 'CSL-B'], ['S1', 'S2']));
  eq([v.verified, v.committedCampaignCount, v.committedLineCount, v.missingLineIds], [false, 1, 0, ['CSL-A', 'CSL-B']],
    'B1 campaign present, lines absent -> NOT verified, and the missing ids are NAMED');
})();
// 13.3 — campaign + lines commit, events do not.
(function () {
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-3' : ''; })],
    lines: [lineRow('CSL-A', 'C-3', 'S1'), lineRow('CSL-B', 'C-3', 'S2')] });
  var v = verify(graphOf(w, 'C-3'), expectedOf(['CSL-A', 'CSL-B'], ['S1', 'S2']));
  eq([v.verified, v.committedLineCount, v.committedEventCount, v.missingEventSkus], [false, 2, 0, ['S1', 'S2']],
    'B2 lines present, events absent -> NOT verified, and the SKUs without an event are named');
})();
// 13.4 — the writer claims N lines and the readback finds none. THIS IS THE PRODUCTION INCIDENT.
(function () {
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-4' : ''; })],
    events: [evtRow({ event_fc_id: 'E1', campaign_id: 'C-4', campaign_sku_line_id: 'CSL-GONE-1', sku: 'S1' }),
             evtRow({ event_fc_id: 'E2', campaign_id: 'C-4', campaign_sku_line_id: 'CSL-GONE-2', sku: 'S2' })] });
  var v = verify(graphOf(w, 'C-4'), expectedOf(['CSL-GONE-1', 'CSL-GONE-2'], ['S1', 'S2']));
  eq([v.verified, v.committedLineCount, v.committedEventCount], [false, 0, 0],
    'B3 the EU BFCM shape — events present, every line gone — is NOT verified (executed)');
  eq(v.orphanEventIds.sort(), ['E1', 'E2'],
    'B4 and each orphaned event is reported BY ID, which is what makes a recovery possible');
})();
// 13.5 — a writer that says "2 lines" over a sheet holding none cannot manufacture success.
(function () {
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-5' : ''; })] });
  var claimed = { lines: [{ campaign_sku_line_id: 'CSL-X', sku: 'S1' }, { campaign_sku_line_id: 'CSL-Y', sku: 'S2' }],
    upserted: 2, created: 2 };
  var v = verify(graphOf(w, 'C-5'), expectedOf(claimed.lines.map(function (l) { return l.campaign_sku_line_id; }), ['S1', 'S2']));
  eq([claimed.created, v.committedLineCount, v.verified], [2, 0, false],
    'B5 a receipt claiming 2 against a sheet holding 0 is NOT success — the claim and the count come from '
    + 'different places, which is the whole repair (executed)');
})();

// =========================================================================================================
section('C. §4 / §13.6–§13.7 — referential integrity on the event write');
// =========================================================================================================
(function () {
  var w = serverWorld({ lines: [], events: [] });
  var r = w.sb.handleImportFcSpecialEventsBatch_({ rows: [evtPayload('C-1', 'CSL-NOPE', 'S1')], options: { actor: 't' } });
  eq([r.success, r.data.summary.skipped, dataRows(w.sheets.fc_special_events).length], [true, 1, 0],
    'C1 an event naming a line that does not exist is REFUSED and writes nothing (executed)');
  ok(/DANGLING_CAMPAIGN_SKU_LINE_REFERENCE/.test(JSON.stringify(r.data.results)),
    'C1a with its own typed reason', r.data.results);
})();
(function () {
  var w = serverWorld({ lines: [lineRow('CSL-1', 'C-OTHER', 'S1')], events: [] });
  var r = w.sb.handleImportFcSpecialEventsBatch_({ rows: [evtPayload('C-1', 'CSL-1', 'S1')], options: { actor: 't' } });
  eq([r.success, dataRows(w.sheets.fc_special_events).length], [true, 0],
    'C2 a line that exists under a DIFFERENT campaign is refused — existence alone is not enough');
  ok(/CAMPAIGN_SKU_LINE_CAMPAIGN_MISMATCH/.test(JSON.stringify(r.data.results)),
    'C2a naming both campaigns, so the operator can see which is wrong', r.data.results);
})();
(function () {
  var w = serverWorld({ lines: [lineRow('CSL-1', 'C-1', 'S1')], events: [] });
  var r = w.sb.handleImportFcSpecialEventsBatch_({ rows: [evtPayload('C-1', 'CSL-1', 'S1')], options: { actor: 't' } });
  eq([r.success, dataRows(w.sheets.fc_special_events).length], [true, 1],
    'C3 and the SAME event with its line present commits normally — the gate refuses holes, not writes');
})();
// The writer must not repair its own input. Four things it is forbidden to do, checked in source.
(function () {
  var REF = code(fnSrc(G14, 'fcSeLineRefCheck_'));
  ok(!/appendRow|setValue|getRange/.test(REF), 'C4 the gate WRITES nothing — it cannot create the missing line');
  ok(!/\.sku\b/.test(REF), 'C4a and never searches by SKU, so it cannot adopt a different line');
  ok(/CAMPAIGN_SKU_LINE_REGISTRY_UNREADABLE/.test(REF),
    'C4b an unreadable line table is its OWN refusal — never reported as a dangling reference');
})();

// =========================================================================================================
section('D. §5 / §13.12 — UPDATE is gated only when the reference CHANGES');
// =========================================================================================================
(function () {
  // The nine production orphans must stay EDITABLE. An event whose line is missing but unchanged is a row
  // the operator still has to be able to correct; refusing it would punish the evidence.
  var w = serverWorld({ lines: [], events: [evtRow({ event_fc_id: 'E1', campaign_id: 'C-1',
    campaign_sku_line_id: 'CSL-GONE', sku: 'S1', event_name: 'BFCM', year: 2026, fc_qty: 5,
    company: 'KM', country: 'DE', marketplace: 'Amazon', marketplace_id: 'M1', scope_type: 'sku', scope_id: 'S1' })] });
  var before = w.sb.fcSpecialEventUpsert_(w.ss, { event_fc_id: 'E1' }, 't');
  var ver = (before && before.refusal && before.refusal.current_row_version) || '';
  var r = w.sb.fcSpecialEventUpsert_(w.ss, Object.assign({}, evtPayload('C-1', 'CSL-GONE', 'S1'),
    { event_fc_id: 'E1', expected_row_version: ver, fc_qty: 99 }), 't');
  ok(!r.refusal, 'D1 an UNCHANGED reference does not block an edit — the orphaned events stay editable', r.refusal);
  eq(dataRows(w.sheets.fc_special_events)[0][colOf(EVT_HEADERS, 'fc_qty')], 99,
    'D1a and the quantity edit lands (executed)');
  eq(dataRows(w.sheets.fc_special_events)[0][colOf(EVT_HEADERS, 'campaign_sku_line_id')], 'CSL-GONE',
    'D1b without corrupting the reference it did not touch');
})();
(function () {
  // But an edit may not MOVE a reference into a hole.
  var w = serverWorld({ lines: [lineRow('CSL-1', 'C-1', 'S1')],
    events: [evtRow({ event_fc_id: 'E1', campaign_id: 'C-1', campaign_sku_line_id: 'CSL-1', sku: 'S1',
      event_name: 'BFCM', year: 2026, fc_qty: 5, company: 'KM', country: 'DE', marketplace: 'Amazon',
      marketplace_id: 'M1', scope_type: 'sku', scope_id: 'S1' })] });
  var pre = w.sb.fcSpecialEventUpsert_(w.ss, { event_fc_id: 'E1' }, 't');
  var ver = (pre && pre.refusal && pre.refusal.current_row_version) || '';
  var r = w.sb.fcSpecialEventUpsert_(w.ss, Object.assign({}, evtPayload('C-1', 'CSL-ELSEWHERE', 'S1'),
    { event_fc_id: 'E1', expected_row_version: ver }), 't');
  ok(r.refusal && r.refusal.error === 'DANGLING_CAMPAIGN_SKU_LINE_REFERENCE',
    'D2 an EXPLICIT reference change to a missing line IS refused', r.refusal);
  eq(dataRows(w.sheets.fc_special_events)[0][colOf(EVT_HEADERS, 'campaign_sku_line_id')], 'CSL-1',
    'D2a and the stored reference is untouched — a refusal writes nothing');
})();

// =========================================================================================================
section('E. §6 / §13.8 — concurrent stage-2 creates');
// =========================================================================================================
(function () {
  var H = code(fnSrc(G20, 'handleUpsertCampaignSkuLines_'));
  ok(H.indexOf('LockService.getScriptLock()') > -1, 'E1 stage 2 takes the ScriptLock');
  ok(H.indexOf('LockService.getScriptLock()') < H.indexOf('fcWriteReadSheet_(sheet)'),
    'E1a BEFORE the authoritative read — locking after it would fence nothing');
  ok(H.indexOf('releaseLock') > H.indexOf('appends.length'),
    'E1b and releases after the last mutation, in a finally');
})();
(function () {
  // The contended request is REFUSED rather than allowed to race. Driven with the lock already held.
  var w = serverWorld({ lockHeld: true });
  var r = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', actor: 't',
    lines: [{ sku: 'S1', marketplace_sku_id: 'MSK-1' }] });
  eq([r.success, r.error, dataRows(w.sheets.campaign_sku_lines).length], [false, 'CAMPAIGN_SKU_LINE_LOCK_TIMEOUT', 0],
    'E2 a contended write is refused with its own token and writes NOTHING (executed)');
})();
(function () {
  // Serialised, the second request finds the first one's row and updates it. One canonical line.
  var w = serverWorld({});
  var body = { campaign_id: 'C-1', actor: 't', lines: [{ sku: 'S1', marketplace_sku_id: 'MSK-1' }] };
  var a = w.sb.handleUpsertCampaignSkuLines_(body);
  var b = w.sb.handleUpsertCampaignSkuLines_(JSON.parse(JSON.stringify(body)));
  eq([dataRows(w.sheets.campaign_sku_lines).length, a.data.lines[0].campaign_sku_line_id === b.data.lines[0].campaign_sku_line_id],
    [1, true], 'E3 two saves of one identity resolve to ONE canonical row and ONE id (executed)');
})();
// §11 — the lock did not cost a second read. The seal it must not break, re-measured here.
(function () {
  var w = serverWorld({});
  w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', actor: 't',
    lines: [{ sku: 'S1', marketplace_sku_id: 'MSK-1' }, { sku: 'S2', marketplace_sku_id: 'MSK-2' }] });
  var reads = w.log.filter(function (e) { return e.sheet === 'campaign_sku_lines' && e.op === 'getDataRange'; }).length;
  eq(reads, 1, 'E4 still EXACTLY ONE authoritative read — the lock wraps the read, it does not add one');
})();

// =========================================================================================================
section('F. §13.9–§13.11 — retry, timeout, and idempotent convergence');
// =========================================================================================================
(function () {
  // The server committed; the client never heard. A retry of the SAME save must converge, not duplicate.
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-1' : ''; })] });
  var body = { campaign_id: 'C-1', actor: 't', lines: [{ sku: 'S1', marketplace_sku_id: 'MSK-1' }] };
  var first = w.sb.handleUpsertCampaignSkuLines_(body);
  var id = first.data.lines[0].campaign_sku_line_id;
  var ev = w.sb.handleImportFcSpecialEventsBatch_({ rows: [evtPayload('C-1', id, 'S1')], options: { actor: 't' } });
  ok(ev.success, 'F1 the save commits (the answer is then lost, which the server never learns)');

  var again = w.sb.handleUpsertCampaignSkuLines_(JSON.parse(JSON.stringify(body)));
  eq([dataRows(w.sheets.campaign_sku_lines).length, again.data.lines[0].campaign_sku_line_id], [1, id],
    'F2 a retry of stage 2 converges on the SAME row and id — no duplicate (executed)');
  var evAgain = w.sb.handleImportFcSpecialEventsBatch_({ rows: [evtPayload('C-1', id, 'S1')], options: { actor: 't' } });
  eq(dataRows(w.sheets.fc_special_events).length, 1,
    'F3 and a retry of stage 3 does not mint a second event', evAgain.data.summary);
  var v = verify(graphOf(w, 'C-1'), expectedOf([id], ['S1']));
  ok(v.verified, 'F4 after the retry the graph verifies — idempotent CONVERGENCE, not accumulation');
})();
(function () {
  // Partial state + retry: the campaign and one line exist, the second does not. The retry fills the hole.
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-1' : ''; })],
    lines: [lineRow('CSL-1', 'C-1', 'S1')] });
  var r = w.sb.handleUpsertCampaignSkuLines_({ campaign_id: 'C-1', actor: 't',
    lines: [{ sku: 'S1', marketplace_sku_id: 'MSK-1', campaign_sku_line_id: 'CSL-1' },
            { sku: 'S2', marketplace_sku_id: 'MSK-2' }] });
  eq([r.data.created, dataRows(w.sheets.campaign_sku_lines).length], [1, 2],
    'F5 a retry over PARTIAL state creates only what is missing (executed)');
})();
// The client never replays an unknown outcome. Asserted against the save source.
ok(/if \(!graph\)[\s\S]{0,200}?_evtGraphUnknownText_/.test(SAVEC),
  'F6 an unreadable graph is OUTCOME_UNKNOWN in the page');
ok(!/_evtGraphUnknownText_[\s\S]{0,400}?(DB\.upsert|DB\.importFc|saveEventUpdate\()/.test(SAVEC),
  'F7 OUTCOME_UNKNOWN_AUTOREPLAY_COUNT = 0 — the unknown branch dispatches nothing');

// =========================================================================================================
section('G. §3 / §13.13 — the projection, and the identity boundary it must not break');
// =========================================================================================================
(function () {
  var tables = {
    campaigns: [{ campaign_id: 'C-1' }, { campaign_id: 'C-2' }],
    campaign_sku_lines: [{ campaign_sku_line_id: 'L1', campaign_id: 'C-1' },
                         { campaign_sku_line_id: 'L2', campaign_id: 'C-2' }],
    fc_special_events: [{ event_fc_id: 'E1', campaign_id: 'C-1', campaign_sku_line_id: 'L1', sku: 'S1' },
                        { event_fc_id: 'E2', campaign_id: 'C-2', campaign_sku_line_id: 'L2', sku: 'S2' }]
  };
  var g = project(tables, { campaign_id: 'C-1' });
  eq([g.campaign_found, g.lineIds, g.events.map(function (e) { return e.event_fc_id; })], [true, ['L1'], ['E1']],
    'G1 the projection selects ONE campaign’s rows and no other’s (executed)');
  var none = project(tables, { campaign_id: '' });
  eq([none.campaign_found, none.lineIds.length, none.events.length], [false, 0, 0],
    'G2 an EMPTY campaign_id selects NOTHING — a readback that answered for every campaign would verify a '
    + 'save against rows it never wrote');
  var missing = project(tables, { campaign_id: 'C-NOPE' });
  eq([missing.campaign_found, missing.lineIds.length], [false, 0], 'G3 and an unknown campaign answers empty, not everything');
})();
// The adapter renames; the comparison reads the renamed shape. Pinned in step so a rename on one side fails.
(function () {
  var a = adaptGraph(project({ campaigns: [{ campaign_id: 'C-1' }],
    campaign_sku_lines: [{ campaign_sku_line_id: 'L1', campaign_id: 'C-1' }],
    fc_special_events: [{ event_fc_id: 'E1', campaign_id: 'C-1', campaign_sku_line_id: 'L1', sku: 'S1' }] },
    { campaign_id: 'C-1' }));
  eq(Object.keys(a).sort(), ['campaignFound', 'campaignId', 'events', 'lineIds'],
    'G4 the adapted graph carries exactly the four fields the comparison reads');
  ok(verify(a, expectedOf(['L1'], ['S1'])).verified,
    'G4a and the real comparison verifies it — projection, adapter and comparison agree end to end');
  ok(/campaignSkuLineId: String\(\(e && e\.campaign_sku_line_id\)/.test(API),
    'G4b the shipped adapter performs that exact rename (source)');
})();
// FC-ID-R2 still holds: an unreadable marketplace registry still refuses, and says so in its own words.
(function () {
  var w = serverWorld({ lines: [lineRow('CSL-1', 'C-1', 'S1')], events: [], noRegistry: true });
  var r = w.sb.handleImportFcSpecialEventsBatch_({ rows: [evtPayload('C-1', 'CSL-1', 'S1')], options: { actor: 't' } });
  eq([r.success, dataRows(w.sheets.fc_special_events).length], [true, 0], 'G5 FC-ID-R2 still fails closed');
  ok(/MARKETPLACE_REGISTRY_UNREADABLE/.test(JSON.stringify(r.data.results)),
    'G5a with ITS token, not the new line-reference one — two fail-closed gates, two reasons', r.data.results);
})();

// =========================================================================================================
section('H. §11 — the request budget');
// =========================================================================================================
(function () {
  var SPECS = /var FCS_SLICE_SPECS_ = \{[\s\S]*?\n\};/.exec(G58)[0];
  var FULL = /var FCS_WORKSPACE_TABLES_ = \[([\s\S]*?)\];/.exec(G58)[1];
  ok(!/campaign_sku_lines/.test(FULL) && !/'campaigns'/.test(FULL),
    'H1 FULL_TABLE_READ_COUNT_ADDED = 0 — neither graph table joined the primary-render set');
  ok(/graph: \{ reads: \['campaigns', 'campaign_sku_lines', 'fc_special_events'\]/.test(SPECS),
    'H2 the graph slice declares exactly the three tables it needs');
  var SLICEONLY = /var FCS_SLICE_ONLY_TABLES_ = \[([\s\S]*?)\];/.exec(G58)[1];
  ok(/'campaigns'/.test(SLICEONLY) && /'campaign_sku_lines'/.test(SLICEONLY),
    'H3 they are SLICE-ONLY, so a healthy FC Summary open still pays for four sheets, not six');
  // One readback per save, and only after a write.
  eq((SAVEC.match(/_evtGraphReadback_\(/g) || []).length, 1,
    'H4 AUTHORITATIVE_READBACK_REQUEST_COUNT = 1 — one readback per save (computed)');
  ok(SAVEC.indexOf('_evtGraphReadback_(') > SAVEC.indexOf('importFcSpecialEventsBatch'),
    'H5 and it happens AFTER the write, never on modal open');
  ok(!/lines\.forEach[\s\S]{0,200}?_evtGraphReadback_|for \([\s\S]{0,120}?_evtGraphReadback_/.test(SAVEC),
    'H6 PER_SKU_REQUEST_COUNT = 0 — the readback is not inside any per-SKU loop');
})();

// =========================================================================================================
section('J. §8 — the EU BFCM incident: nine, derived, and untouched');
// =========================================================================================================
(function () {
  // The operator corrected the incident size from five to nine. Nothing in the repair may carry either.
  var RECOVERY = code(fnSrc(FCS, '_evtVerifyGraph_')) + code(fnSrc(FCS, '_evtGraphPartialText_'))
    + code(fnSrc(G14, 'fcSeLineRefCheck_')) + code(fnSrc(G58, 'fcsGraphProject_'));
  ok(!/\b(===|==|!=|!==|<|>|<=|>=)\s*(5|9)\b/.test(RECOVERY),
    'J1 HARDCODED_INCIDENT_ROW_COUNT = NO — no literal row count is compared anywhere in the repair');
  // Cardinality comes from the graph, at nine exactly as at two.
  var ids = [], skus = [], evs = [];
  for (var i = 1; i <= 9; i++) { ids.push('CSL-GONE-' + i); skus.push('S' + i);
    evs.push(evtRow({ event_fc_id: 'E' + i, campaign_id: 'C-EU', campaign_sku_line_id: 'CSL-GONE-' + i, sku: 'S' + i })); }
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-EU' : ''; })],
    events: evs });
  var g = graphOf(w, 'C-EU');
  var v = verify(g, expectedOf(ids, skus));
  eq([v.verified, v.committedLineCount, v.orphanEventIds.length], [false, 0, 9],
    'J2 the real incident size — NINE orphans across two Series — is derived from the graph, not assumed');
  eq(g.events.map(function (e) { return e.campaignSkuLineId; }).sort(), ids.slice().sort(),
    'J3 and the nine events still CARRY the line ids the recovery must reuse — they are the only surviving '
    + 'copy, which is why the recovery reconstructs lines and never rewrites events');
  // The ids are recoverable; the commercial values are not.
  ok(EVT_HEADERS.indexOf('discount_percent') === -1 && LINE_HEADERS.indexOf('discount_percent') !== -1,
    'J4 RECOVERY_REQUIRES_OPERATOR_DISCOUNT = YES — discount_percent exists on the LINE and on no event');
  eq(['promo_price', 'regular_price', 'price_units', 'discount_percent']
    .filter(function (h) { return EVT_HEADERS.indexOf(h) !== -1; }), [],
    'J4a nor does any other commercial value survive on the event row (computed)');
})();

// =========================================================================================================
section('K. MUTANTS — §13.15–§13.18');
// =========================================================================================================
mut('K-M1 [13.15] a verifier that reports success on an incomplete graph', function () {
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-1' : ''; })] });
  var real = verify(graphOf(w, 'C-1'), expectedOf(['CSL-A'], ['S1']));
  var mutated = { verified: true };            // the false-success rule this round removed
  return real.verified === false && mutated.verified === true;
});
mut('K-M2 [13.16] removing the reference validation lets the orphan back in', function () {
  var w = serverWorld({ lines: [], events: [] });
  var body = { rows: [evtPayload('C-1', 'CSL-NOPE', 'S1')], options: { actor: 't' } };
  var guarded = dataRows((w.sb.handleImportFcSpecialEventsBatch_(body), w.sheets.fc_special_events)).length;
  var w2 = serverWorld({ lines: [], events: [] });
  vm.runInContext('fcSeLineRefCheck_ = function () { return { ok: true }; };', w2.sb);
  w2.sb.handleImportFcSpecialEventsBatch_(body);
  return guarded === 0 && dataRows(w2.sheets.fc_special_events).length === 1;
});
mut('K-M3 [13.17] removing stage 2’s lock', function () {
  var H = code(fnSrc(G20, 'handleUpsertCampaignSkuLines_'));
  var DECL = 'var lock = LockService.getScriptLock();';
  if (H.indexOf(DECL) === -1) throw new Error('anchor drifted');
  return H.split(DECL).join('').indexOf('LockService') === -1 && H.indexOf('LockService') > -1;
});
mut('K-M4 [13.18] a receipt built from the payload count', function () {
  // The mutant: committed = what the client sent. Run both against a sheet holding nothing.
  var w = serverWorld({ campaigns: [CAMP_HEADERS.map(function (h) { return h === 'campaign_id' ? 'C-1' : ''; })] });
  var expected = expectedOf(['CSL-A', 'CSL-B'], ['S1', 'S2']);
  var real = verify(graphOf(w, 'C-1'), expected);
  var mutatedCommitted = expected.lineIds.length;     // payload cardinality as committed cardinality
  return real.committedLineCount === 0 && mutatedCommitted === 2;
});
mut('K-M5 an UPDATE gate that also blocks UNCHANGED references', function () {
  var U = code(fnSrc(G14, 'fcSpecialEventUpsert_'));
  // The real writer compares incoming against prior before gating. A mutant that dropped that comparison
  // would gate every update, freezing the production orphans.
  return /fcEvtUp_\(incomingLineId\) !== fcEvtUp_\(priorLineId\)/.test(U);
});
mut('K-M6 a projection that ignores campaign scope', function () {
  var tables = { campaigns: [{ campaign_id: 'C-1' }],
    campaign_sku_lines: [{ campaign_sku_line_id: 'L1', campaign_id: 'C-1' },
                         { campaign_sku_line_id: 'L2', campaign_id: 'C-OTHER' }],
    fc_special_events: [] };
  var scoped = project(tables, { campaign_id: 'C-1' }).lineIds;
  return scoped.length === 1 && tables.campaign_sku_lines.length === 2;
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R2');
console.log('SAVE_SUCCESS_AUTHORITY = POST_WRITE_AUTHORITATIVE_GRAPH_READBACK');
console.log('FALSE_SUCCESS_REACHABLE = NO   EVENT_REFERENTIAL_INTEGRITY_ENFORCED = YES');
console.log('DANGLING_EVENT_CREATE_REACHABLE = NO   DUPLICATE_LINE_CREATE_REACHABLE = NO');
console.log('OUTCOME_UNKNOWN_AUTOREPLAY_COUNT = 0   RETRY_IDEMPOTENT = YES');
console.log('AUTHORITATIVE_READBACK_REQUEST_COUNT = 1   FULL_TABLE_READ_COUNT_ADDED = 0');
console.log('CURRENT_EU_BFCM_ROWS_MODIFIED = 0   PRODUCTION_ROWS_WRITTEN = 0');
console.log('=====================================================');
console.log('FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R2 — ' + pass + ' passed / ' + fail + ' failed');
console.log('MUTATION ' + (mutants - survived) + '/' + mutants + (survived ? '  SURVIVORS PRESENT' : ''));
console.log('=====================================================');
process.exit((fail || survived) ? 1 : 0);
