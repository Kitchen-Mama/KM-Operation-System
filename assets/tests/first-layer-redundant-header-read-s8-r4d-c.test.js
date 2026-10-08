/**
 * S8-R4D-C — THE FIRST-LAYER READ STOPS FETCHING EACH HEADER TWICE.
 *
 * R4D-B counted the calls `inventoryReplenishment.workspace.get` actually makes and the number was not
 * thirteen. This suite does not re-count them from the source text — it RUNS both the shipped `readTable` and
 * the one at f6b4164 against a Spreadsheet stub that COUNTS every service call, and compares.
 *
 * That matters for two reasons. A grep can be satisfied by a comment; a counter cannot. And running BOTH
 * implementations over the SAME fixtures is what makes §9's response-equality claim a measurement instead of
 * an assertion: the same thirteen tables go in, and the rows that come out must be identical object-for-object.
 *
 * The validators are the REAL ones. KMSAFE is required from its own module and `prodRequireSheet_` /
 * `prodRequireColumns_` are evaluated from the shipped 29_ bytes, so "the checking is unchanged" is proved
 * against the code that does the checking rather than against a copy of it.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var P60 = GS + '60_api_v1_inventory_replenishment_workspace.gs';
var P29 = GS + '29_production_safety_adapter.gs';
var PRE_SHA = 'f6b4164';                 // the published tree: R42, before this round
var DB_ID = 'TEST-DB-ID';

var pass = 0, fail = 0, failures = [];
function ok(c, m, extra) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; failures.push(m); console.log('FAIL ' + m + (extra === undefined ? '' : '\n   ' + extra)); } }
function eq(a, b, m) { var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m, A === B ? '' : 'expected ' + B + '\n   actual   ' + A); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function show(sha, rel) { return cp.execFileSync('git', ['show', sha + ':' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }

var KMSAFE = require(path.join(ROOT, 'assets/js/core/supply-planning-production-safety.js'));
var SRC29 = read(P29);
var SRC60_POST = read(P60);
var SRC60_PRE = show(PRE_SHA, P60);

// ---------------------------------------------------------------------------------------------------
// THE COUNTING SPREADSHEET. Every accessor the handler can reach increments a counter, so the call graph
// is observed rather than described. `getValues` is counted separately for a header range and for the
// whole data range, because that distinction IS the finding.
// ---------------------------------------------------------------------------------------------------
function makeCounter() {
  return { getValues: 0, headerRangeGetValues: 0, dataRangeGetValues: 0, getRange: 0, getDataRange: 0,
    getSheetByName: 0, getLastRow: 0, getLastColumn: 0, getId: 0 };
}
function makeSheet(name, values, c) {
  return {
    getName: function () { return name; },
    getLastRow: function () { c.getLastRow++; return values.length; },
    getLastColumn: function () { c.getLastColumn++; return values.length ? values[0].length : 0; },
    getRange: function (r, col, nr, nc) {
      c.getRange++;
      return { getValues: function () {
        c.getValues++; c.headerRangeGetValues++;
        var out = [];
        for (var i = r - 1; i < r - 1 + nr; i++) out.push((values[i] || []).slice(col - 1, col - 1 + nc));
        return out;
      } };
    },
    getDataRange: function () {
      c.getDataRange++;
      return { getValues: function () {
        c.getValues++; c.dataRangeGetValues++;
        // Apps Script answers a 1x1 blank for a sheet with no content.
        return values.length ? values.map(function (r) { return r.slice(); }) : [['']];
      } };
    }
  };
}
function makeSS(sheetMap, c) {
  return {
    getId: function () { c.getId++; return DB_ID; },
    getSheetByName: function (n) { c.getSheetByName++; return Object.prototype.hasOwnProperty.call(sheetMap, n) ? sheetMap[n] : null; }
  };
}

// Evaluate 29_ + a 60_ source together, with the REAL safety core bound in.
function buildIo(src60) {
  var ctx = {
    KMSAFE: KMSAFE,
    PRODUCTION_DB_SPREADSHEET_ID_: DB_ID,
    SpreadsheetApp: { openById: function () { throw new Error('openById must not be reached by readTable'); } },
    console: console, Date: Date, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array, Error: Error
  };
  vm.createContext(ctx);
  vm.runInContext(SRC29 + '\n;\n' + src60, ctx, { filename: 'gs-under-test' });
  return { io: ctx.sirWorkspaceDefaultIo_(), ctx: ctx };
}

// ---------------------------------------------------------------------------------------------------
// FIXTURES — the thirteen first-layer tables, with the four that carry requiredCols carrying them.
// ---------------------------------------------------------------------------------------------------
var FIRST13 = ['marketplaces', 'marketplace_skus', 'sku_details', 'warehouses',
  'amazon_inventory_snapshot', 'amazon_inventory_health_snapshot', 'amazon_daily_sales_snapshot',
  'amazon_weekly_sales_snapshot', 'fc_regular_forecast', 'fc_target_rules', 'fc_special_events',
  'overseas_inventory_snapshot', 'factory_stock'];
var REQUIRED_COLS = { marketplaces: ['marketplace_id'], marketplace_skus: ['sku'], sku_details: ['sku'], warehouses: ['warehouse_id'] };
// The 36 real columns of amazon_daily_sales_snapshot, so §10's "no projection" is checked against the
// shape Production actually returns rather than a toy row.
var DAILY_COLS = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'site_sku', 'asin', 'currency',
  'sales_units', 'sales_amount', 'sales_amount_usd', 'return_units', 'total_orders', 'session', 'page_view',
  'unit_session_percentage', 'buy_box_percentage', 'browser_session', 'browser_page_views', 'app_session',
  'app_page_view', 'source_system', 'source_report', 'source_file_id', 'source_sheet_name', 'source_row_hash',
  'sync_batch_id', 'synced_at', 'created_at', 'updated_at', 'data_window_start_date', 'data_window_end_date',
  'latest_source_date', 'is_fallback_used', 'fallback_reason', 'data_age_days'];

function fixtureValues(name) {
  if (name === 'fc_target_rules') return [['rule_id', 'scope_id', 'target_pct']];          // header only: EMPTY in Production
  if (name === 'amazon_daily_sales_snapshot') {
    return [DAILY_COLS.slice(),
      DAILY_COLS.map(function (c, i) { return c === 'sku' ? 'CO1100-R' : (c === 'sales_units' ? 3 : 'v' + i); }),
      DAILY_COLS.map(function (c, i) { return c === 'sku' ? 'CO1150-N' : (c === 'sales_units' ? 0 : 'w' + i); })];
  }
  var req = REQUIRED_COLS[name] || [];
  var cols = req.concat(['a_col', 'b_col']);
  return [cols.slice(),
    cols.map(function (c, i) { return name + '-1-' + i; }),
    cols.map(function (c, i) { return name + '-2-' + i; }),
    cols.map(function () { return ''; })];                                                  // an all-blank row: must be dropped
}
function makeWorld(c, overrides) {
  var m = {};
  FIRST13.forEach(function (n) {
    var v = (overrides && Object.prototype.hasOwnProperty.call(overrides, n)) ? overrides[n] : fixtureValues(n);
    if (v === null) return;                                                                 // sheet ABSENT
    m[n] = makeSheet(n, v, c);
  });
  return makeSS(m, c);
}
function readAll(io, c, overrides) {
  var ss = makeWorld(c, overrides), out = {};
  FIRST13.forEach(function (n) {
    out[n] = io.readTable(ss, n, REQUIRED_COLS[n] || [], !REQUIRED_COLS[n]);
  });
  return out;
}
// Reads one table and returns the thrown safetyToken, or null when it did not throw.
function tokenFor(io, c, name, overrides) {
  try { io.readTable(makeWorld(c, overrides), name, REQUIRED_COLS[name] || [], !REQUIRED_COLS[name]); return null; }
  catch (e) { return (e && (e.safetyToken || e.message)) || 'THREW'; }
}

console.log('\n================ A — THE CALL COUNT, MEASURED ON BOTH TREES ================\n');

var cPre = makeCounter(), cPost = makeCounter();
var PRE = buildIo(SRC60_PRE), POST = buildIo(SRC60_POST);
var outPre = readAll(PRE.io, cPre);
var outPost = readAll(POST.io, cPost);

eq(cPre.getValues, 30, 'A1  PRE (' + PRE_SHA + ') makes 30 getValues() range reads for 13 tables');
eq(cPre.headerRangeGetValues, 17, 'A2  of which 17 are header-only reads — 13 from prodRequireSheet_, 4 from prodRequireColumns_');
eq(cPre.dataRangeGetValues, 13, 'A3  and 13 are the full-sheet reads');
eq(cPost.getValues, 13, 'A4  POST makes 13 getValues() range reads — one per table');
eq(cPost.headerRangeGetValues, 0, 'A5  HEADER_READ_COUNT_POST = 0 — no separate header range is fetched at all');
eq(cPost.dataRangeGetValues, 13, 'A6  FULL_SHEET_READ_COUNT_POST = 13 — unchanged, and now the only read');
ok(cPost.getValues < cPre.getValues, 'A7  the reduction is real and in the right direction ('
  + cPre.getValues + ' -> ' + cPost.getValues + ')');
eq(Math.round((1 - cPost.getValues / cPre.getValues) * 100), 57, 'A8  SERVICE_CALL_REDUCTION_PERCENT = 57');
// The accessors are metadata, not range reads. They are counted so a future round cannot quietly trade a
// range read for four accessor calls and call it a win.
ok(cPost.getSheetByName < cPre.getSheetByName, 'A9  getSheetByName also falls — the optional probe and the'
  + ' guard no longer each resolve the sheet (' + cPre.getSheetByName + ' -> ' + cPost.getSheetByName + ')');
eq(cPost.getLastColumn, 13, 'A10 getLastColumn is once per table (PRE was ' + cPre.getLastColumn + ' — 13 + 4 repeats)');

console.log('\n================ B — RESPONSE EQUALITY, TABLE BY TABLE ================\n');

var diffs = [];
FIRST13.forEach(function (n) {
  if (JSON.stringify(outPre[n]) !== JSON.stringify(outPost[n])) diffs.push(n);
});
eq(diffs, [], 'B1  SEMANTIC_RESULT_DIFF_COUNT = 0 — all 13 tables return identical rows');
eq(Object.keys(outPost).sort(), FIRST13.slice().sort(), 'B2  table PRESENCE is identical — 13 in, 13 out');
FIRST13.forEach(function (n) {
  eq(outPost[n].length, outPre[n].length, 'B3  ' + n + ' row count unchanged (' + outPre[n].length + ')');
});
eq(outPost.marketplaces.length ? Object.keys(outPost.marketplaces[0]) : [],
   outPre.marketplaces.length ? Object.keys(outPre.marketplaces[0]) : [],
  'B4  the HEADER SET a row is keyed by is unchanged');
ok(outPost.marketplaces.every(function (r, i) {
  return JSON.stringify(r) === JSON.stringify(outPre.marketplaces[i]);
}), 'B5  canonical row identities match position for position, not merely as a set');
// The all-blank row in every fixture must still be dropped — that rule lived in sirWsRowsToObjects_ and had
// to survive being moved into sirWsRowsFromValues_.
eq(outPost.warehouses.length, 2, 'B6  the all-blank row is still dropped (4 sheet rows -> header + 2 kept)');

console.log('\n================ C — ONE HEADER SOURCE, AND requiredCols USES IT ================\n');

var c1 = makeCounter();
POST.io.readTable(makeWorld(c1), 'marketplaces', ['marketplace_id'], false);
eq(c1.getValues, 1, 'C1  a table WITH requiredCols costs exactly ONE getValues()');
eq(c1.headerRangeGetValues, 0, 'C2  ADDITIONAL_HEADER_READ_COUNT_FOR_REQUIRED_COLS = 0');
var c2 = makeCounter();
POST.io.readTable(makeWorld(c2), 'fc_special_events', [], true);
eq(c2.getValues, 1, 'C3  a table WITHOUT requiredCols also costs exactly ONE getValues()');
var c3 = makeCounter();
POST.io.readTable(makeWorld(c3), 'sku_details', ['sku'], false);
eq(c3.getDataRange, 1, 'C4  and the one read is the DATA range — the header is row 0 of it');

console.log('\n================ D — FAIL-CLOSED SEMANTICS, PRE vs POST ================\n');

// Each state is read on BOTH trees and the tokens compared, so "preserved" means the same answer rather
// than merely a non-empty one.
var STATES = [
  ['SHEET ABSENT (required)',  'marketplaces',    { marketplaces: null }],
  ['SHEET ABSENT (optional)',  'fc_special_events', { fc_special_events: null }],
  ['EMPTY (header only)',      'fc_target_rules', {}],
  ['HEADER BLANK',             'warehouses',      { warehouses: [['warehouse_id', '', 'b_col'], ['w1', 'x', 'y']] }],
  ['HEADER DUPLICATE',         'warehouses',      { warehouses: [['warehouse_id', 'warehouse_id'], ['w1', 'w2']] }],
  ['REQUIRED COLUMN MISSING',  'sku_details',     { sku_details: [['not_sku', 'b_col'], ['1', '2']] }],
  ['TOTALLY BLANK SHEET',      'fc_regular_forecast', { fc_regular_forecast: [] }]
];
STATES.forEach(function (s) {
  var tPre = tokenFor(PRE.io, makeCounter(), s[1], s[2]);
  var tPost = tokenFor(POST.io, makeCounter(), s[1], s[2]);
  eq(tPost, tPre, 'D  ' + s[0] + ' -> same outcome on both trees (' + String(tPre) + ')');
});
eq(tokenFor(POST.io, makeCounter(), 'marketplaces', { marketplaces: null }), 'SCHEMA_NOT_PROVISIONED',
  'D1  ABSENT_TABLE_SEMANTICS_PRESERVED — a REQUIRED missing sheet still fails closed');
eq(POST.io.readTable(makeWorld(makeCounter(), { fc_special_events: null }), 'fc_special_events', [], true), [],
  'D2  an OPTIONAL missing sheet is still [] — absence is not an error for a missing-safe table');
eq(POST.io.readTable(makeWorld(makeCounter()), 'fc_target_rules', [], true), [],
  'D3  EMPTY_TABLE_SEMANTICS_PRESERVED — fc_target_rules is header-only and answers [], not a throw');
ok(/HEADER/.test(String(tokenFor(POST.io, makeCounter(), 'warehouses',
  { warehouses: [['warehouse_id', '', 'b'], ['1', '2', '3']] }))),
  'D4  SCHEMA_MISMATCH_SEMANTICS_PRESERVED — a blank header is still refused');
eq(tokenFor(POST.io, makeCounter(), 'sku_details', { sku_details: [['not_sku'], ['1']] }), 'MISSING_REQUIRED_HEADER',
  'D5  a missing REQUIRED column is still refused, from the header array rather than a second read');
// ABSENT and EMPTY must not have collapsed into one another.
ok(tokenFor(POST.io, makeCounter(), 'marketplaces', { marketplaces: null })
   !== tokenFor(POST.io, makeCounter(), 'marketplaces', { marketplaces: [['marketplace_id'], []] }),
  'D6  ABSENT and EMPTY remain DIFFERENT states — the three did not collapse into one');

console.log('\n================ E — WHAT THIS ROUND DID NOT DO ================\n');

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var first = JSON.parse(/var IR_FIRST_LAYER_TABLES_ = (\[[\s\S]*?\]);/.exec(PAGE)[1].replace(/'/g, '"'));
var expo = JSON.parse(/var IR_EXPOSURE_TABLES_ = (\[[\s\S]*?\]);/.exec(PAGE)[1].replace(/'/g, '"'));
eq(first, FIRST13, 'E1  FIRST_LAYER_TABLE_COUNT = 13 and the membership is byte-identical');
eq(expo.length, 6, 'E2  EXPOSURE_TABLE_COUNT = 6 — lazy-once is untouched');
eq(outPost.amazon_daily_sales_snapshot.length ? Object.keys(outPost.amazon_daily_sales_snapshot[0]).length : 0, 36,
  'E3  DAILY_SALES_PROJECTION_APPLIED = NO — all 36 fields still return');
eq(Object.keys(outPost.amazon_daily_sales_snapshot[0]), DAILY_COLS,
  'E4  and in the same order, so no column was quietly dropped from the middle');
ok(/payload\.siteScope/.test(SRC60_POST) && /INVENTORY_REPLENISHMENT_SITE_SCOPE_INCOMPLETE/.test(SRC60_POST),
  'E5  the siteScope exposure contract is still present and still fails closed');
ok(/sirWsSiteScopeClosure_/.test(SRC60_POST), 'E6  and the lineage closure is still the thing that applies it');
eq(/var SIR_WS_RECENT_WINDOW_ = \{[\s\S]*?keep: 14/.test(SRC60_POST), true,
  'E7  recentWindow still keeps 14 dates — the business projection is untouched');
// The frontend must not have moved at all this round.
//
// S8-R4D-F1A-R1 — PINNED AT BOTH ENDS, the same repair S8-R4D-E2 already made to the sibling claim in
// b1-advanced-sheets-benchmark-harness-s8-r4d-d1 (see its D1_END note). Read as PRE_SHA..HEAD this said
// "no browser-served byte has moved since R42" — a claim about EVERY round that would ever follow, not
// about the round that made it. S8-R4D-F1A legitimately moves inventory-replenishment.js (the site-switch
// scope guard) plus the cache-token rotation that makes a returning browser fetch it, and this assertion
// then reported a defect in a tree that has none.
//
// C_END is the last tree the claim is ABOUT. The interval is closed, the sentence still means what it meant,
// and it still fails if anyone retroactively moves a frontend byte into the C round.
var C_END = '1876f4a';   // S8-R4D-C's own release commit
var fe = cp.execFileSync('git', ['diff', '--name-only', PRE_SHA, C_END, '--',
  'assets/js', 'assets/css', 'index.html'], { cwd: ROOT, encoding: 'utf8' }).trim();
eq(fe, '', 'E8  FRONTEND_RUNTIME_CHANGED = NO — no browser-served byte moved between ' + PRE_SHA + ' and ' + C_END);

console.log('\n================ F — ZERO WRITE ================\n');

var WRITE_PRIMS = ['setValue', 'setValues', 'appendRow', 'insertSheet', 'deleteRow', 'deleteSheet',
  'clearContent', 'clear(', 'PropertiesService', 'DriveApp', 'ScriptApp.newTrigger', 'MailApp', 'GmailApp'];
// COMMENTS ARE STRIPPED FIRST, and that is not a convenience. 60_ contains the sentence "No sheet row, no
// CacheService, no PropertiesService" — a comment asserting the very absence this scans for. Scanning raw
// text would make the file fail for SAYING it does not write, which is a detector that punishes the
// documentation it depends on.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]\/\/.*$/gm, ' ');
}
var CODE60 = stripComments(SRC60_POST);
var found = WRITE_PRIMS.filter(function (w) { return CODE60.indexOf(w) !== -1; });
eq(found, [], 'F1  WRITE_PRIMITIVE_COUNT = 0 — no write, property, drive, trigger or mail primitive in 60_');
eq(/gapJob|jobStart|materiali[sz]e/i.test(SRC60_POST.replace(/^\s*(\/\/|\*).*$/gm, '')), false,
  'F2  GAP_WRITE_REACHABLE = NO and JOB_START_REACHABLE = NO from this handler');

console.log('\n================ G — RELEASE IDENTITY ================\n');

var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var H63 = read(GS + '63_api_v1_system_health.gs');
var R43 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R43';
// S8-R4D-E2 — R43 IS A FLOOR, NOT AN EQUALITY. These read '=== R43', which is a sentence only one release
// can satisfy: the next round to change either file makes it false while describing a correct tree. What
// S8-R4D-C actually established is that its change SHIPPED IN R43 — so the stamp must be R43 OR LATER, and
// a stamp from before R43 must still fail. R44 is the release that proves the distinction was needed.
ok(RO.stampAtOrAfter(/var SIR_BUILD_VERSION_ = '([^']+)'/.exec(SRC60_POST)[1], R43),
  'G1  60_ is stamped R43 or later — the round its call count changed');
ok(RO.stampAtOrAfter(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/.exec(H63)[1], R43),
  'G2  the RELEASE is R43 or later');
ok(RO.stampAtOrAfter(/var SYS_BUILD_VERSION_ = '([^']+)'/.exec(H63)[1], R43),
  'G3  63_ own stamp is R43 or later — it carries 60_ row');
// The floor has to bite in the other direction too, or 'at or after' is just 'anything'.
ok(!RO.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R42', R43),
  'G3a and a PRE-R43 stamp is still rejected — the floor is a floor, not a formality');
eq(/var RTR_BUILD_VERSION_ = '([^']+)'/.exec(read(GS + '01_router.gs'))[1],
  'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41', 'G4  01_ is UNCHANGED at R41 — no action and no route moved');
ok(RO.stampAtOrAfter(R43, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R42'), 'G5  R43 is after R42 in the release order');
ok(!RO.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R42', R43), 'G5a and a floor written at R43 rejects R42');
eq(/SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(H63)[1], '18', 'G6  ACTION_CONTRACT_VERSION stays 18');

console.log('\n================ H — MUTANTS ================\n');

var caught = 0, missed = [], vacuous = [];
function mutant(id, label, mutate, detect) {
  var src = mutate(SRC60_POST);
  if (src === SRC60_POST) { vacuous.push(id); console.log('VACUOUS ' + id + '  ' + label + ' (no edit applied)'); return; }
  var got;
  try { got = detect(src); } catch (e) { got = true; }                 // a crash is a detection
  if (got) { caught++; console.log('caught: ' + id + '  ' + label); }
  else { missed.push(id); console.log('SURVIVED: ' + id + '  ' + label); }
}
// The call-count detector: build the mutated io and count.
function countsOf(src) { var c = makeCounter(); readAll(buildIo(src).io, c); return c; }
function tokenOf(src, name, overrides) { return tokenFor(buildIo(src).io, makeCounter(), name, overrides); }

mutant('M1', 'a separate prodRequireSheet_ header read is reintroduced',
  function (s) { return s.replace('      var data = sheet.getDataRange().getValues();            // THE ONE RANGE READ',
    '      prodRequireSheet_(ss, name, []);\n      var data = sheet.getDataRange().getValues();'); },
  function (s) { return countsOf(s).getValues > 13; });

mutant('M2', 'the prodRequireColumns_ repeat header read is reintroduced',
  function (s) { return s.replace('      if (requiredCols && requiredCols.length) {',
    '      prodRequireColumns_(sheet, requiredCols);\n      if (requiredCols && requiredCols.length) {'); },
  function (s) { return countsOf(s).getValues > 13 || countsOf(s).headerRangeGetValues > 0; });

mutant('M3', 'header validation is skipped entirely',
  function (s) { return s.replace('      if (!report.valid) throw prodSchemaError_(report.schemaStatus, name, report);', '      /* skipped */'); },
  function (s) { return tokenOf(s, 'warehouses', { warehouses: [['warehouse_id', '', 'b'], ['1', '2', '3']] }) === null; });

mutant('M4', 'a missing REQUIRED sheet is answered with [] instead of failing closed',
  // The anchor is ONE line. The first attempt spanned a newline and this file is CRLF, so the mutation
  // silently applied nothing and the mutant reported itself vacuous — which is the vacuity check earning
  // its place rather than a nuisance.
  function (s) { return s.replace("        throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', name, null);", '        return [];'); },
  function (s) { return tokenOf(s, 'marketplaces', { marketplaces: null }) === null; });

mutant('M5', 'a missing header is accepted',
  function (s) { return s.replace("      if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) throw prodSchemaError_('HEADER_MISSING', name, null);", '      /* accepted */'); },
  // Removing the geometry check does NOT stop the refusal — a blank sheet answers [['']], so the classifier
  // still rejects it. What it changes is WHICH fault is named: HEADER_MISSING becomes HEADER_BLANK. §4
  // requires the DISTINCTIONS to be preserved, not merely the fail-closing, so the detector compares the
  // token against the tree this round must not drift from.
  function (s) { return tokenOf(s, 'fc_regular_forecast', { fc_regular_forecast: [] })
    !== tokenFor(PRE.io, makeCounter(), 'fc_regular_forecast', { fc_regular_forecast: [] }); });

mutant('M6', 'a missing REQUIRED column is accepted',
  function (s) { return s.replace("        if (missing.length) throw prodSchemaError_('MISSING_REQUIRED_HEADER', name, { missing: missing });", '        /* accepted */'); },
  function (s) { return tokenOf(s, 'sku_details', { sku_details: [['not_sku'], ['1']] }) === null; });

mutant('M7', 'a first-layer table is dropped from the workspace set',
  function (s) { return s.replace("  { name: 'factory_stock',                   requiredCols: [], optional: true },", ''); },
  function (s) { var ctx = buildIo(s).ctx;
    return ctx.SIR_WORKSPACE_TABLES_.filter(function (t) { return FIRST13.indexOf(t.name) !== -1; }).length !== 13; });

mutant('M8', 'an extra table is added to the workspace set',
  function (s) { return s.replace("  { name: 'factory_stock',                   requiredCols: [], optional: true },",
    "  { name: 'factory_stock',                   requiredCols: [], optional: true },\n  { name: 'purchase_orders', requiredCols: [], optional: true },"); },
  function (s) { var ctx = buildIo(s).ctx;
    return ctx.SIR_WORKSPACE_TABLES_.some(function (t) { return t.name === 'purchase_orders'; }); });

mutant('M9', 'the daily-sales column projection is mixed into B3',
  function (s) { return s.replace('      return sirWsRowsFromValues_(data);',
    "      if (name === 'amazon_daily_sales_snapshot') { data = data.map(function (r) { return r.slice(0, 9); }); }\n      return sirWsRowsFromValues_(data);"); },
  function (s) { var c = makeCounter(); var o = readAll(buildIo(s).io, c);
    return !o.amazon_daily_sales_snapshot.length || Object.keys(o.amazon_daily_sales_snapshot[0]).length !== 36; });

mutant('M10', 'a write primitive is introduced into the read handler',
  function (s) { return s.replace('      return sirWsRowsFromValues_(data);',
    "      sheet.getRange(1, 1).setValue('x');\n      return sirWsRowsFromValues_(data);"); },
  function (s) { var k = stripComments(s); return WRITE_PRIMS.some(function (w) { return k.indexOf(w) !== -1; }); });

mutant('M11', 'the one full-sheet read is replaced by a header-only read, losing the rows',
  function (s) { return s.replace('      var data = sheet.getDataRange().getValues();            // THE ONE RANGE READ',
    '      var data = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues();'); },
  function (s) { var c = makeCounter(); var o = readAll(buildIo(s).io, c);
    return o.warehouses.length !== outPost.warehouses.length; });

mutant('M12', 'the blank-row drop is lost when rows are built from values',
  function (s) { return s.replace("if (String(data[r][c]).trim() !== '') blank = false;", 'blank = false;'); },
  function (s) { var c = makeCounter(); var o = readAll(buildIo(s).io, c);
    return o.warehouses.length !== outPost.warehouses.length; });

// VACUITY — every mutant's detector must be FALSE on the unmutated tree, or it proves nothing.
var vacuityFails = [];
[['M1/M2 call count', function () { return countsOf(SRC60_POST).getValues === 13 && countsOf(SRC60_POST).headerRangeGetValues === 0; }],
 ['M3 header validation', function () { return tokenOf(SRC60_POST, 'warehouses', { warehouses: [['warehouse_id', '', 'b'], ['1', '2', '3']] }) !== null; }],
 ['M4 absent required', function () { return tokenOf(SRC60_POST, 'marketplaces', { marketplaces: null }) !== null; }],
 ['M5 missing header', function () { var t = tokenOf(SRC60_POST, 'fc_regular_forecast', { fc_regular_forecast: [] });
   return t !== null && t === tokenFor(PRE.io, makeCounter(), 'fc_regular_forecast', { fc_regular_forecast: [] }); }],
 ['M6 required column', function () { return tokenOf(SRC60_POST, 'sku_details', { sku_details: [['not_sku'], ['1']] }) !== null; }],
 ['M7/M8 table set', function () { var ctx = buildIo(SRC60_POST).ctx;
   return ctx.SIR_WORKSPACE_TABLES_.filter(function (t) { return FIRST13.indexOf(t.name) !== -1; }).length === 13; }],
 ['M9 daily 36 fields', function () { return Object.keys(outPost.amazon_daily_sales_snapshot[0]).length === 36; }],
 ['M10 no write prim', function () { return !WRITE_PRIMS.some(function (w) { return CODE60.indexOf(w) !== -1; }); }],
 ['M11/M12 row count', function () { return outPost.warehouses.length === 2; }]
].forEach(function (p) {
  var held; try { held = !!p[1](); } catch (e) { held = false; }
  if (!held) vacuityFails.push(p[0]);
});
eq(vacuityFails, [], 'H1  every mutant detector is checked against a tree where the fault is ABSENT');
eq(missed, [], 'H2  0 mutants survived');
eq(vacuous, [], 'H3  0 vacuous mutants — every mutation actually edited the source');

console.log('\n' + new Array(101).join('='));
console.log((fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + (caught + missed.length) + ' mutants, ' + missed.length + ' survived'
  + (vacuous.length ? ', VACUOUS: ' + vacuous.join(',') : ', vacuity clean'));
console.log(new Array(101).join('='));
if (fail) { failures.forEach(function (f) { console.log('  - ' + f); }); process.exitCode = 1; }
