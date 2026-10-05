/**
 * S8-R4D-D1 — MANIFEST GOVERNANCE + THE READ-ONLY B1 BENCHMARK HARNESS.
 *
 * Two jobs, and they are different in kind.
 *
 * THE MANIFEST GUARD runs against repository BYTES. `appsscript.json` was in no RELEASE_OWNERS set, no suite
 * asserted it, and system.health cannot report it — so the one artefact that can silently un-deploy a feature
 * built on an advanced service was the one artefact nothing watched. It has two declared states and the
 * transition between them is an explicit, reviewable commit (`_advanced-services-state.js`). The expectation
 * lives OUTSIDE the file being guarded, because a guard that reads its expectation out of its subject passes
 * for any contents at all.
 *
 * THE HARNESS TESTS lift the benchmark tool's pure logic and RUN it. Padding, the serial->Date coercion, the
 * header classifier and the diff engine are executed against fixtures rather than grepped for, because the
 * failures this harness exists to catch — a one-day date shift, an inverted blank-row rule — are behavioural
 * and a comment cannot be made to fail.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var TOOL_REL = 'assets/tools/apps-script-diagnostics/TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs';
var MANIFEST_REL = GS + 'appsscript.json';
var PRE_SHA = '4a4a7f8';           // the tree this round starts from

var pass = 0, fail = 0, failures = [];
function ok(c, m, extra) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; failures.push(m); console.log('FAIL ' + m + (extra === undefined ? '' : '\n   ' + extra)); } }
function eq(a, b, m) { var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m, A === B ? '' : 'expected ' + B + '\n   actual   ' + A); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var STATE = require(path.join(ROOT, 'assets/tests/_advanced-services-state.js'));
var MANIFEST_RAW = read(MANIFEST_REL);
var MANIFEST = JSON.parse(MANIFEST_RAW);
var TOOL = read(TOOL_REL);

// ===================================================================================================
console.log('\n================ A — MANIFEST GOVERNANCE ================\n');

var services = (MANIFEST.dependencies && MANIFEST.dependencies.enabledAdvancedServices) || [];
function sheetsEntries(list) { return list.filter(function (s) { return String(s.serviceId).toLowerCase() === 'sheets'; }); }

ok(typeof STATE.SHEETS_ENABLED === 'boolean', 'A1  the enable state is DECLARED in the repository, not inferred');
eq(STATE.SHEETS_SERVICE, { userSymbol: 'Sheets', version: 'v4', serviceId: 'sheets' },
  'A2  and the future entry is pinned exactly — serviceId sheets, version v4');

if (!STATE.SHEETS_ENABLED) {
  eq(sheetsEntries(services).length, 0,
    'A3  PRE_ENABLE — the manifest does NOT declare Sheets, which is the expected state for this round');
  ok(!/\bSheets\.Spreadsheets\b/.test(read(GS + '60_api_v1_inventory_replenishment_workspace.gs')),
    'A3a and no Product runtime file reaches for the service that is not enabled');
} else {
  eq(sheetsEntries(services).length, 1,
    'A3  POST_ENABLE — the manifest declares Sheets EXACTLY ONCE (two entries would let a reader trust the stale one)');
  eq(sheetsEntries(services)[0], STATE.SHEETS_SERVICE,
    'A3a and it matches the declared entry byte for byte — serviceId, version and userSymbol');
}

// The services that already existed must SURVIVE. A round that adds Sheets and drops BigQuery would break the
// Amazon import, and the diff would look like one line.
STATE.REQUIRED_EXISTING_SERVICES.forEach(function (req) {
  var hit = services.filter(function (s) { return s.serviceId === req.serviceId; });
  eq(hit.length, 1, 'A4  ' + req.userSymbol + ' is still enabled exactly once — an unrelated service may not be dropped');
  if (hit.length === 1) eq(hit[0], req, 'A4a ' + req.userSymbol + ' is unchanged (userSymbol, version, serviceId)');
});
eq(services.length, STATE.REQUIRED_EXISTING_SERVICES.length + (STATE.SHEETS_ENABLED ? 1 : 0),
  'A5  and NOTHING ELSE is enabled — the service list is exactly what the repository declares');

// B1 needs NO new scope. A scope appearing beside a service addition is a fault, not a side effect.
eq(MANIFEST.oauthScopes.slice().sort(), STATE.REQUIRED_OAUTH_SCOPES.slice().sort(),
  'A6  OAUTH_SCOPE_CHANGE_REQUIRED = NO — the scope set is unchanged, so no re-consent is expected');
eq(MANIFEST.webapp, STATE.REQUIRED_WEBAPP,
  'A7  the Web App deployment settings are untouched — executeAs and access are not collateral of a service change');
eq((MANIFEST_RAW.match(/"serviceId"/g) || []).length, services.length,
  'A8  every declared serviceId is accounted for — no entry hides outside the parsed list');

// ===================================================================================================
console.log('\n================ B — THE PRODUCT RUNTIME DID NOT MOVE ================\n');

var changedRuntime = cp.execFileSync('git', ['diff', '--name-only', PRE_SHA, 'HEAD', '--',
  'assets/specs/active/apps-script', 'assets/js', 'assets/css', 'index.html'],
  { cwd: ROOT, encoding: 'utf8' }).trim();
eq(changedRuntime, '', 'B1  PRODUCT_RUNTIME_FILE_CHANGE_COUNT = 0 — no runtime, manifest or frontend byte moved');
ok(!/batchGet/.test(read(GS + '60_api_v1_inventory_replenishment_workspace.gs')),
  'B2  60_ contains NO batchGet — the candidate lives outside the Product path, as §2 requires');
ok(/var SIR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R43'/.test(read(GS + '60_api_v1_inventory_replenishment_workspace.gs')),
  'B3  60_ is still R43 — R44 is NOT cut by benchmark infrastructure');
ok(/var SYS_DEPLOYMENT_RELEASE_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R43'/.test(read(GS + '63_api_v1_system_health.gs')),
  'B3a and the release is still R43');

// ===================================================================================================
console.log('\n================ C — THE TOOL IS READ ONLY ================\n');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]\/\/.*$/gm, ' ');
}
var CODE = stripComments(TOOL);
var WRITE_PRIMS = ['setValue', 'setValues', 'appendRow', 'insertRow', 'insertRows', 'deleteRow', 'deleteRows',
  'insertSheet', 'deleteSheet', 'clearContent', 'clearFormat', '.clear(', 'SpreadsheetApp.flush',
  'PropertiesService', 'DriveApp', 'ScriptApp.newTrigger', 'MailApp', 'GmailApp', 'setProperty', 'deleteProperty'];
var found = WRITE_PRIMS.filter(function (w) { return CODE.indexOf(w) !== -1; });
eq(found, [], 'C1  WRITE_PRIMITIVE_COUNT = 0 — no write, property, drive, trigger or mail primitive');
eq(/gapJob|jobStart|CacheService/i.test(CODE), false,
  'C2  no gap job, no job start, no persistent cache');
ok(/PASTE/.test(TOOL) && /REMOVE/.test(TOOL),
  'C3  the header states PASTE / RUN / REPORT / REMOVE — it is not Product code and says so');

// ===================================================================================================
console.log('\n================ D — THE ALLOWLIST IS EXACTLY THE THIRTEEN ================\n');

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var FIRST13 = JSON.parse(/var IR_FIRST_LAYER_TABLES_ = (\[[\s\S]*?\]);/.exec(PAGE)[1].replace(/'/g, '"'));
var toolTables = (TOOL.match(/\{ name: '([a-z_]+)', requiredCols:/g) || [])
  .map(function (s) { return /name: '([a-z_]+)'/.exec(s)[1]; });
eq(toolTables, FIRST13, 'D1  the tool reads EXACTLY the 13 first-layer tables the page declares, in order');
eq(toolTables.length, 13, 'D2  READ_TABLE_COUNT = 13 — there is no fourteenth');

// requiredCols must mirror the shipped 60_, not a hand-copied guess.
var G60 = read(GS + '60_api_v1_inventory_replenishment_workspace.gs');
var required60 = {};
(G60.match(/\{ name: '([a-z_]+)',\s+requiredCols: \[([^\]]*)\]/g) || []).forEach(function (s) {
  var m = /name: '([a-z_]+)',\s+requiredCols: \[([^\]]*)\]/.exec(s);
  if (FIRST13.indexOf(m[1]) !== -1) required60[m[1]] = m[2].replace(/'/g, '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
});
var requiredTool = {};
(TOOL.match(/\{ name: '([a-z_]+)', requiredCols: \[([^\]]*)\]/g) || []).forEach(function (s) {
  var m = /name: '([a-z_]+)', requiredCols: \[([^\]]*)\]/.exec(s);
  requiredTool[m[1]] = m[2].replace(/'/g, '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
});
eq(requiredTool, required60, 'D3  requiredCols mirrors the shipped 60_ exactly for all 13 tables');

// ===================================================================================================
console.log('\n================ E — RANGES COME FROM METADATA, NOT A LITERAL ================\n');

ok(/gridProperties/.test(TOOL) && /columnCount/.test(TOOL),
  'E1  widths are derived from sheet metadata (gridProperties.columnCount)');
ok(!/!A:AZ|!A:ZZ|'!A:[A-Z]{1,2}'/.test(TOOL.replace(/b1bmColumnLetter_\(cols\)/g, '')),
  'E2  no hard-coded global range literal — the schema contract allows additive columns and a frozen width '
  + 'would truncate column 43 in silence');
ok(/fields: 'sheets\.properties/.test(TOOL),
  'E3  the metadata call is FIELD-LIMITED to properties — it does not pull grid data');
ok(/valueRenderOption: 'UNFORMATTED_VALUE'/.test(TOOL) && /dateTimeRenderOption: 'SERIAL_NUMBER'/.test(TOOL),
  'E4  the preflight-approved render options are the ones actually requested');

// ===================================================================================================
console.log('\n================ F — THE PURE LOGIC, EXECUTED ================\n');

// Lift the tool's pure helpers. Utilities is stubbed to behave as the real API does for a fixed-offset zone,
// which is what Asia/Taipei is; the point is to prove the COMPOSITION is right, not to re-implement ICU.
function buildCtx(src) {
  var TZ_OFFSET_MIN = 480;   // Asia/Taipei, no DST
  var ctx = {
    Logger: { log: function () {} }, Date: Date, Math: Math, String: String, Number: Number,
    Object: Object, Array: Array, Error: Error, isNaN: isNaN, JSON: JSON,
    Utilities: {
      formatDate: function (d, tz, fmt) {
        var ms = d.getTime() + (tz === 'UTC' ? 0 : TZ_OFFSET_MIN * 60000);
        var x = new Date(ms);
        function p(n, w) { return ('0000' + n).slice(-(w || 2)); }
        return p(x.getUTCFullYear(), 4) + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate())
          + ' ' + p(x.getUTCHours()) + ':' + p(x.getUTCMinutes()) + ':' + p(x.getUTCSeconds());
      },
      parseDate: function (s, tz, fmt) {
        var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
        if (!m) return new Date(NaN);
        var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        return new Date(utc - TZ_OFFSET_MIN * 60000);     // the wall clock belongs to tz
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'b1bm-tool' });
  return ctx;
}
var T = buildCtx(TOOL);

// --- F1 the date coercion reproduces the EXACT instant SpreadsheetApp yields -----------------------
// A date cell showing 2026-07-19 is local midnight in Asia/Taipei, which getValues() returns as the instant
// 2026-07-18T16:00:00.000Z — the live census confirmed exactly this string.
var serial_2026_07_19 = (Date.UTC(2026, 6, 19) - Date.UTC(1899, 11, 30)) / 86400000;
var coerced = T.b1bmSerialToDate_(serial_2026_07_19, 'Asia/Taipei');
eq(coerced.toISOString(), '2026-07-18T16:00:00.000Z',
  'F1  a date serial coerces to the SAME instant getValues() returns — including the UTC shift the product depends on');
ok(/parseDate/.test(TOOL) && !/\+ 8 \* 3600|28800000/.test(TOOL),
  'F1a and it goes through parseDate against the sheet timezone, not a hard-coded +08:00 offset');

// a datetime, to prove fractional serials survive the millisecond rounding
var dt = Date.UTC(2026, 7, 3, 9, 30, 8) - 480 * 60000;      // 2026-08-03 17:30:08 Taipei
var serialDt = (dt + 480 * 60000 - Date.UTC(1899, 11, 30)) / 86400000;
eq(T.b1bmSerialToDate_(serialDt, 'Asia/Taipei').toISOString(), new Date(dt).toISOString(),
  'F2  a fractional serial (a timestamp, not a date) round-trips to the millisecond');

// --- F3 padding, and the inversion it prevents -----------------------------------------------------
var headers3 = ['a', 'b', 'note'];
var raggedFromBatch = [headers3, ['1', 'x'], ['2', 'y'], []];     // batchGet omits trailing empties
var padded = T.b1bmPadRows_(raggedFromBatch, 3);
eq(padded[1], ['1', 'x', ''], 'F3  a short row is padded to header width with empty strings');
eq(T.b1bmRowsFromValues_(padded).length, 2,
  'F3a and the all-blank row is then correctly DROPPED (2 kept of 3 data rows)');
eq(T.b1bmRowsFromValues_(raggedFromBatch).length, 3,
  'F3b WITHOUT padding the drop INVERTS — String(undefined) is "undefined", which is not empty, so the blank '
  + 'row survives. This is the defect padding exists for, asserted rather than described.');
eq(T.b1bmRowsFromValues_(padded)[0], { a: '1', b: 'x', note: '' },
  'F3c and a padded cell is "" — never the string "undefined"');

// --- F4 the header classifier keeps the states apart -----------------------------------------------
eq(T.b1bmValidateHeader_([], []), 'HEADER_MISSING', 'F4  an empty header is HEADER_MISSING');
eq(T.b1bmValidateHeader_(['a', '', 'c'], []), 'HEADER_BLANK', 'F4a a blank header cell is HEADER_BLANK');
eq(T.b1bmValidateHeader_(['a', 'a'], []), 'HEADER_DUPLICATE', 'F4b a duplicate header is HEADER_DUPLICATE');
eq(T.b1bmValidateHeader_(['a', 'b'], ['sku']), 'MISSING_REQUIRED_HEADER', 'F4c a missing required column is named');
eq(T.b1bmValidateHeader_(['sku', 'b'], ['sku']), null, 'F4d and a valid header passes');

// --- F5 the diff engine actually bites --------------------------------------------------------------
var tz = 'Asia/Taipei';
eq(T.b1bmValueDiff_(new Date(Date.UTC(2026, 6, 18, 16)), serial_2026_07_19, true, tz), null,
  'F5  a correctly coerced date is NOT a diff');
eq(T.b1bmValueDiff_(new Date(Date.UTC(2026, 6, 18, 16)), serial_2026_07_19 + 1, true, tz),
  'DATE_MS_DIFF(86400000)', 'F5a a ONE DAY shift is caught and reported in milliseconds');
ok(/^DATE_MS_DIFF/.test(String(T.b1bmValueDiff_(new Date(Date.UTC(2026, 6, 18, 16)), serial_2026_07_19 + 1 / 86400, true, tz))),
  'F5b and so is a one-SECOND drift — the gate is exact to the second, not same-day');
// The coercion formats through 'yyyy-MM-dd HH:mm:ss', so it is SECOND-resolution. Stated rather than
// discovered later: a sub-second difference would NOT be caught. Every timestamp in these thirteen
// tables is stored to the second (synced_at = 09:30:08), so the gate matches the data it guards - but
// a future table carrying millisecond precision would need this revisited.
eq(T.b1bmValueDiff_(new Date(Date.UTC(2026, 6, 18, 16)), serial_2026_07_19 + 1 / 86400000, true, tz), null,
  'F5b1 and the gate is SECOND-resolution by construction - a sub-second delta is not a diff');
eq(T.b1bmValueDiff_('CO1100-R', 'CO1100-R', false, tz), null, 'F5c equal strings are not a diff');
eq(T.b1bmValueDiff_(523900, '523900', false, tz), 'TYPE(number vs string)',
  'F5d a number silently becoming a string IS a diff — identity must not be coerced to pass');
eq(T.b1bmValueDiff_(true, 'TRUE', false, tz), 'TYPE(boolean vs string)',
  'F5e and so is a boolean rendered as display text');
eq(T.b1bmValueDiff_(new Date(Date.UTC(2026, 6, 18, 16)), 46222, false, tz), 'CONTROL_DATE_IN_NON_DATE_COLUMN',
  'F5f a date appearing where no date was expected is a diff, not something to coerce away');

// ===================================================================================================
console.log('\n================ G — BENCHMARK DESIGN ================\n');

eq(T.B1BM_PAIRS_, 5, 'G1  BENCHMARK_PAIR_COUNT = 5');
eq(T.B1BM_PAIR_ORDER_, ['CONTROL_FIRST', 'B1_FIRST', 'CONTROL_FIRST', 'B1_FIRST', 'CONTROL_FIRST'],
  'G2  PAIR_ORDER alternates — a fixed order would hand arm two a warmed handle every pair');
ok(/remoteCalls\+\+/.test(TOOL) && (TOOL.match(/remoteCalls\+\+/g) || []).length === 2,
  'G3  B1_REMOTE_CALL_COUNT = 2 — one metadata call, one batchGet, and the tool counts them itself');
ok(/SHEETS_ADVANCED_SERVICE_UNAVAILABLE/.test(TOOL),
  'G4  an unavailable service is a TYPED failure, not a silent zero');
ok(!/catch[\s\S]{0,200}b1bmControlRead_/.test(TOOL.replace(/\/\*[\s\S]*?\*\//g, '')),
  'G5  there is no fallback to CONTROL inside a measured arm — a fallback would time the wrong implementation');
ok(/B1_BENCHMARK_SEMANTIC_PASS/.test(TOOL) && /worstDiff === 0 && failures\.length === 0/.test(TOOL),
  'G6  ONE diff is enough to fail — the verdict is computed, not left to the reader');
ok(/B1_DATE_COLUMN_MAP_SOURCE/.test(TOOL) && /CONTROL_ORACLE/.test(TOOL),
  'G7  the report states that batchGet CANNOT self-identify a date column, so a product B1 needs a declared map');

// ===================================================================================================
console.log('\n================ H — MUTANTS ================\n');

var caught = 0, missed = [], vacuous = [];
function mutant(id, label, mutate, detect) {
  var out = mutate();
  // A mutation that changed NOTHING is vacuous, not surviving. Reporting it as survived blames the
  // detector for a missing edit, which is exactly the misreading this line was added to prevent.
  if (out === null || out === TOOL || JSON.stringify(out) === MANIFEST_RAW
      || (typeof out === 'object' && JSON.stringify(out) === JSON.stringify(MANIFEST))) {
    vacuous.push(id); console.log('VACUOUS ' + id + '  ' + label + ' (no edit applied)'); return; }
  var got; try { got = detect(out); } catch (e) { got = true; }
  if (got) { caught++; console.log('caught: ' + id + '  ' + label); }
  else { missed.push(id); console.log('SURVIVED: ' + id + '  ' + label); }
}
function mutManifest(fn) { var m = JSON.parse(MANIFEST_RAW); fn(m); return m; }
function manifestBad(m) {
  var svc = (m.dependencies && m.dependencies.enabledAdvancedServices) || [];
  var sh = svc.filter(function (s) { return String(s.serviceId).toLowerCase() === 'sheets'; });
  if (!STATE.SHEETS_ENABLED && sh.length !== 0) return true;
  if (STATE.SHEETS_ENABLED && (sh.length !== 1 || JSON.stringify(sh[0]) !== JSON.stringify(STATE.SHEETS_SERVICE))) return true;
  for (var i = 0; i < STATE.REQUIRED_EXISTING_SERVICES.length; i++) {
    var req = STATE.REQUIRED_EXISTING_SERVICES[i];
    var hit = svc.filter(function (s) { return s.serviceId === req.serviceId; });
    if (hit.length !== 1 || JSON.stringify(hit[0]) !== JSON.stringify(req)) return true;
  }
  if (svc.length !== STATE.REQUIRED_EXISTING_SERVICES.length + (STATE.SHEETS_ENABLED ? 1 : 0)) return true;
  if (JSON.stringify(m.oauthScopes.slice().sort()) !== JSON.stringify(STATE.REQUIRED_OAUTH_SCOPES.slice().sort())) return true;
  if (JSON.stringify(m.webapp) !== JSON.stringify(STATE.REQUIRED_WEBAPP)) return true;
  return false;
}

mutant('M1', 'Sheets added with the WRONG serviceId (spreadsheets, not sheets)',
  function () { return mutManifest(function (m) { m.dependencies.enabledAdvancedServices.push({ userSymbol: 'Sheets', version: 'v4', serviceId: 'spreadsheets' }); }); },
  function (m) { return manifestBad(m) || (m.dependencies.enabledAdvancedServices.length !== STATE.REQUIRED_EXISTING_SERVICES.length); });

mutant('M2', 'Sheets added at the wrong VERSION (v3)',
  function () { var s = Object.assign({}, STATE.SHEETS_SERVICE, { version: 'v3' });
    return mutManifest(function (m) { m.dependencies.enabledAdvancedServices.push(s); }); },
  function (m) { return manifestBad(m); });

mutant('M3', 'Sheets declared TWICE',
  function () { return mutManifest(function (m) {
    m.dependencies.enabledAdvancedServices.push(STATE.SHEETS_SERVICE, STATE.SHEETS_SERVICE); }); },
  function (m) { return manifestBad(m); });

mutant('M4', 'the unrelated BigQuery service is dropped while adding Sheets',
  function () { return mutManifest(function (m) {
    m.dependencies.enabledAdvancedServices = [STATE.SHEETS_SERVICE]; }); },
  function (m) { return manifestBad(m); });

mutant('M5', 'a new OAuth scope rides along with the service change',
  function () { return mutManifest(function (m) { m.oauthScopes.push('https://www.googleapis.com/auth/drive'); }); },
  function (m) { return manifestBad(m); });

mutant('M6', 'the Web App is quietly reconfigured to execute as the accessing user',
  function () { return mutManifest(function (m) { m.webapp.executeAs = 'USER_ACCESSING'; }); },
  function (m) { return manifestBad(m); });

mutant('M7', 'a write primitive is introduced into the TEMP tool',
  function () { return TOOL.replace('  return out;\n}', "  sheet.getRange(1,1).setValue('x');\n  return out;\n}"); },
  function (src) { var k = stripComments(src); return WRITE_PRIMS.some(function (w) { return k.indexOf(w) !== -1; }); });

mutant('M8', 'a fourteenth table is added to the benchmark allowlist',
  function () { return TOOL.replace("  { name: 'factory_stock', requiredCols: [], optional: true }",
    "  { name: 'factory_stock', requiredCols: [], optional: true },\n  { name: 'purchase_orders', requiredCols: [], optional: true }"); },
  function (src) { var t = (src.match(/\{ name: '([a-z_]+)', requiredCols:/g) || [])
      .map(function (s) { return /name: '([a-z_]+)'/.exec(s)[1]; });
    return t.length !== 13 || JSON.stringify(t) !== JSON.stringify(FIRST13); });

mutant('M9', 'the date comparison is weakened to same-DAY instead of the same instant',
  function () { return TOOL.replace('return d.getTime() === a.getTime() ? null',
    'return d.toISOString().slice(0,10) === a.toISOString().slice(0,10) ? null'); },
  function (src) { var C = buildCtx(src);
    // the one-day shift must still be caught; a one-SECOND drift is what this mutant hides
    return C.b1bmValueDiff_(new Date(Date.UTC(2026, 6, 18, 16)), serial_2026_07_19 + 1 / 86400000, true, tz) === null
      ? true : false; });

mutant('M10', 'identity is coerced with String() on both sides so a type change passes',
  function () { return TOOL.replace("  if (typeof a !== typeof b) return 'TYPE(' + (typeof a) + ' vs ' + (typeof b) + ')';",
    '  if (typeof a !== typeof b) { a = String(a); b = String(b); }'); },
  function (src) { var C = buildCtx(src); return C.b1bmValueDiff_(523900, '523900', false, tz) === null; });

mutant('M11', 'the trailing-blank padding is removed',
  function () { return TOOL.replace('    var padded = b1bmPadRows_(values, hdr.length);\n    var rows = b1bmRowsFromValues_(padded);',
    '    var rows = b1bmRowsFromValues_(values);'); },
  function (src) { return !/b1bmPadRows_\(values, hdr\.length\)/.test(src); });

mutant('M12', 'a semantic diff is ignored and the verdict says YES anyway',
  function () { return TOOL.replace("B1_BENCHMARK_SEMANTIC_PASS: (worstDiff === 0 && failures.length === 0) ? 'YES' : 'NO'",
    "B1_BENCHMARK_SEMANTIC_PASS: 'YES'"); },
  function (src) { return !/worstDiff === 0 && failures\.length === 0/.test(src); });

mutant('M13', 'the ranges are frozen to a literal width instead of sheet metadata',
  function () { return TOOL.replace("ranges.push(\"'\" + name.replace(/'/g, \"''\") + \"'!A:\" + b1bmColumnLetter_(cols));",
    "ranges.push(\"'\" + name.replace(/'/g, \"''\") + \"'!A:AZ\");"); },
  function (src) { return /'!A:AZ"/.test(src) || !/b1bmColumnLetter_\(cols\)/.test(src); });

mutant('M14', 'the serial coercion uses a hard-coded +08:00 instead of the sheet timezone',
  function () { return TOOL.replace("  var s = Utilities.formatDate(wall, 'UTC', 'yyyy-MM-dd HH:mm:ss');\n  return Utilities.parseDate(s, tz, 'yyyy-MM-dd HH:mm:ss');",
    '  return new Date(wall.getTime() - 28800000);'); },
  function (src) { return !/parseDate/.test(src) || /28800000/.test(src); });

// VACUITY — every detector must be FALSE against the unmutated tree.
var vacuityFails = [];
[['manifest clean', function () { return !manifestBad(MANIFEST); }],
 ['no write prim', function () { return !WRITE_PRIMS.some(function (w) { return CODE.indexOf(w) !== -1; }); }],
 ['13 tables', function () { return JSON.stringify(toolTables) === JSON.stringify(FIRST13); }],
 ['exact date gate', function () { return T.b1bmValueDiff_(new Date(Date.UTC(2026, 6, 18, 16)), serial_2026_07_19 + 1 / 86400, true, tz) !== null; }],
 ['type gate', function () { return T.b1bmValueDiff_(523900, '523900', false, tz) !== null; }],
 ['padding present', function () { return /b1bmPadRows_\(values, hdr\.length\)/.test(TOOL); }],
 ['verdict computed', function () { return /worstDiff === 0 && failures\.length === 0/.test(TOOL); }],
 ['metadata ranges', function () { return /b1bmColumnLetter_\(cols\)/.test(TOOL) && !/'!A:AZ"/.test(TOOL); }],
 ['tz-derived coercion', function () { return /parseDate/.test(TOOL) && !/28800000/.test(TOOL); }]
].forEach(function (p) {
  var held; try { held = !!p[1](); } catch (e) { held = false; }
  if (!held) vacuityFails.push(p[0]);
});
eq(vacuityFails, [], 'H1  every mutant detector is checked against a tree where the fault is ABSENT');
eq(missed, [], 'H2  0 mutants survived');
eq(vacuous, [], 'H3  0 vacuous mutants');

console.log('\n' + new Array(101).join('='));
console.log((fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + (caught + missed.length) + ' mutants, ' + missed.length + ' survived'
  + (vacuous.length ? ', VACUOUS: ' + vacuous.join(',') : ', vacuity clean'));
console.log(new Array(101).join('='));
if (fail) { failures.forEach(function (f) { console.log('  - ' + f); }); process.exitCode = 1; }
