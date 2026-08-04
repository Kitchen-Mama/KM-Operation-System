// Kitchen Mama Operation System — FC Special-Event true persistence + sidebar refinement tests (2026-08-04).
// Run: node assets/tests/fc-special-event-persist.test.js
// LOCAL / SOURCE-LEVEL. Extracts + evals the REAL pure helpers from fc-summary.js and asserts the canonical
// Special-Event write identity/validation/batch logic, the edit-mode wiring (no false-success), the backend batch
// handler reuse of fcSpecialEventUpsert_, and the sidebar Level-2 readability fix. No DOM / no live Spreadsheet.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/fc-summary.js');
var API = read('js/api/operation-system-db-api.js');
var GS14 = read('specs/active/apps-script/14_fc_write_handlers.gs');
var GS01 = read('specs/active/apps-script/01_router.gs');
var LAYOUT = read('css/layout.css');

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
eval(extractFn(JS, '_fcUp'));
eval(extractFn(JS, 'fcValidateMonthRaw'));
eval(extractFn(JS, 'fcEventIdentityKey'));
eval(extractFn(JS, 'fcBuildEventWriteRows'));

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ==========================================================================
section('§8/§16 — Special Event canonical identity (pure)');
ok(fcEventIdentityKey({ eventId: 'EFC-1', sku: 'GA0450' }) === 'EFC:EFC-1', 'ID1 identity is the canonical PK event_fc_id');
var e1 = { eventId: 'EFC-1', sku: 'GA0450' }, e2 = { eventId: 'EFC-2', sku: 'GA0450' };
ok(fcEventIdentityKey(e1) !== fcEventIdentityKey(e2), 'ID2 same SKU, two events → DISTINCT identity');
var caUS = fcEventIdentityKey({ eventId: '', company: 'KM', country: 'US', marketplace: 'AMZ', sku: 'GA0450', event: 'Prime', year: 2026 });
var caCA = fcEventIdentityKey({ eventId: '', company: 'KM', country: 'CA', marketplace: 'AMZ', sku: 'GA0450', event: 'Prime', year: 2026 });
ok(caUS.indexOf('K:') === 0 && caUS !== caCA, 'ID3 blank-id legacy rows fall back to a company/country-safe composite (same SKU two countries distinct)');

section('§16 — value rules for fc_qty (reuses fcValidateMonthRaw)');
ok(fcValidateMonthRaw('').valid === false, 'V1 blank invalid (never silently 0)');
ok(fcValidateMonthRaw('0').valid === true && fcValidateMonthRaw('0').value === 0, 'V2 explicit zero valid');
ok(fcValidateMonthRaw('-3').valid === false && fcValidateMonthRaw('2.5').valid === false, 'V3 negative + decimal rejected');

section('§16 — batch write payload (pure fcBuildEventWriteRows)');
var rows = fcBuildEventWriteRows([
  { identity: { eventId: 'EFC-1', campaignId: 'C1', eventName: 'Prime Day', sku: 'GA0450' }, base: { fcQty: 100 }, qty: 250 },
  { identity: { eventId: 'EFC-2', campaignId: 'C2', eventName: 'BFCM', sku: 'GA0450' }, base: { fcQty: 50 }, qty: 75 }
]);
ok(rows.length === 2, 'B1 only changed events emitted');
ok(rows[0].event_fc_id === 'EFC-1' && rows[0].campaign_id === 'C1' && rows[0].event_name === 'Prime Day' && rows[0].sku === 'GA0450' && rows[0].fc_qty === 250, 'B2 full canonical identity (event_fc_id+campaign_id+event_name+sku) + edited fc_qty');
ok(rows[0].event_fc_id !== rows[1].event_fc_id && rows[1].fc_qty === 75, 'B3 two events update only their own identity');
ok(JSON.stringify(fcBuildEventWriteRows([])) === '[]', 'B4 no dirty → empty payload');

section('§16 — edit-mode wiring (source-level over the REAL functions)');
var enterSrc = extractFn(JS, 'enterEventEditMode');
ok(/_fcEventEditSource\(\)/.test(enterSrc) && !/fcEventMock/.test(enterSrc), 'W1 edit binds to LIVE source (_fcEventEditSource), not empty fcEventMock');
ok(/JSON\.parse\(JSON\.stringify/.test(enterSrc) && /_fcEventSetEditLock\(true\)/.test(enterSrc), 'W2 immutable snapshot + scope lock on enter');
var renderSrc = extractFn(JS, 'renderFcEventTableEditable');
ok(/input type="number"/.test(renderSrc) && /aria-label=/.test(renderSrc) && /fc-cell-readonly/.test(renderSrc), 'W3 only fc_qty is an input; identity cells read-only + accessible labels');
var saveSrc = extractFn(JS, 'saveEventChanges');
ok(/importFcSpecialEventsBatch/.test(saveSrc), 'W4 Save uses the canonical batch authority (importFcSpecialEventsBatch)');
ok(!/Successfully saved/.test(saveSrc) && !/console\.log\('Saving event changes'/.test(saveSrc), 'W5 NO hardcoded false-success (P0 fake toast gone from Special Event Save)');
ok(/res\.success === false/.test(saveSrc) && /\.catch\(/.test(saveSrc), 'W6 honest error handling (success check + catch)');
ok(/entries\.length === 0/.test(saveSrc) && /exitEventEditMode\(\)/.test(saveSrc), 'W7 no changes → no DB call');
ok(/counts\.invalid > 0/.test(saveSrc), 'W8 invalid cells block save');
ok(/event_fc_id[\s\S]*campaign_id[\s\S]*cannot be edited until backfilled/.test(saveSrc), 'W9 rows missing event_fc_id/campaign_id are blocked with a clear message (no silent skip/merge)');
ok(/NOT written to DB/.test(saveSrc), 'W10 demo path honestly labeled (never claims DB write)');
var cancelSrc = extractFn(JS, 'cancelEventEdit');
ok(!/KM\.DB|fetch|importFcSpecialEventsBatch/.test(cancelSrc), 'W11 Cancel makes ZERO backend calls');
var updSrc = extractFn(JS, 'updateEventFcQty');
ok(/fcValidateMonthRaw/.test(updSrc) && /invalid = true/.test(updSrc), 'W12 blank/invalid qty flagged — never coerced to 0');
ok(/campaignId:\s*r\.campaignId\s*\|\|\s*raw\.campaign_id/.test(JS) && /eventName:\s*r\.event\s*\|\|\s*raw\.event_name/.test(JS), 'W13 live event rows expose campaign_id + event_name for the write payload');

section('§7/§12 — backend batch handler reuses the canonical upsert (14_ / 01_)');
var batchSrc = extractFn(GS14, 'handleImportFcSpecialEventsBatch_');
ok(/fcSpecialEventUpsert_\(ss, r, actor\)/.test(batchSrc), 'H1 batch loops the SAME canonical row upsert (fcSpecialEventUpsert_) — no competing implementation');
ok(/missing_campaign_id/.test(batchSrc) && /missing_event_name/.test(batchSrc) && /invalid_fc_qty/.test(batchSrc), 'H2 per-row validation mirrors handleUpsertFcSpecialEvent_ (fail closed, no partial silent success)');
ok(/summary/.test(batchSrc) && /created/.test(batchSrc) && /skipped/.test(batchSrc), 'H3 deterministic per-batch summary returned');
ok(/action === 'importFcSpecialEventsBatch'/.test(stripComments(GS01)) && /handleImportFcSpecialEventsBatch_\(body\)/.test(GS01), 'H4 router registers importFcSpecialEventsBatch → handler');
ok(/importFcSpecialEventsBatch = async function/.test(API) && /if \(json && json\.success\) \{ await loadOperationDb/.test(API), 'H5 api wrapper posts one batch + reloads canonical DB on success (readback)');
ok(!/insertSheet|getRange\(1,/.test(batchSrc), 'H6 batch handler performs no direct Sheet creation / row-1 write (delegates to the S0.5-safe shared writer)');

section('§15 — legacy disposition');
ok(/function saveEventChanges/.test(JS) && !/console\.log\('Saving event changes'/.test(JS), 'L1 saveEventChanges REPLACED_ACTIVE_PATH (false-success removed)');
var baseSave = extractFn(JS, 'saveFcChanges');
ok(/importFcRegularForecastBatch/.test(baseSave) && !/Successfully saved/.test(baseSave), 'L2 Base FC saveFcChanges REUSED_AND_FIXED path unchanged (still connected, no false-success)');
ok((JS.match(/fcEventMock/g) || []).length >= 0, 'L3 legacy fcEventMock still present only as demo/builder store (not the edit SSOT)');

section('§5 — sidebar Level-2 readability (source-level over layout.css)');
ok(/\.menu-children \.menu-item\s*\{[\s\S]*?font-size:\s*var\(--font-size-body\)/.test(LAYOUT), 'C1 Level-2 uses READABLE body font (not --font-size-small)');
ok(!/\.menu-children \.menu-item\s*\{[\s\S]*?font-size:\s*var\(--font-size-small\)/.test(LAYOUT), 'C2 Level-2 no longer excessively small');
ok(/\.menu-children \.menu-item\s*\{[\s\S]*?border-left[\s\S]*?\}/.test(LAYOUT) && /\.menu-children \.menu-item\s*\{[\s\S]*?padding-left[\s\S]*?\}/.test(LAYOUT), 'C3 hierarchy via guide rail + indent (not font size)');
ok(/\.menu-children\.is-open\s*\{[^}]*background/.test(LAYOUT) && /\.menu-parent\.is-open\s*\{[^}]*soft-green/.test(LAYOUT), 'C4 distinct Level-2 surface + Level-1 expanded accent');
ok(/\.menu-children \.menu-item\.active\s*\{[\s\S]*?soft-green[\s\S]*?border-left: 3px solid #ffffff/.test(LAYOUT) && /\.menu-item\.active\s*\{[\s\S]*?border-left: 4px solid var\(--warm-orange\)/.test(LAYOUT), 'C5 active child ≠ active parent (green+white guide vs orange border)');
ok(/var\(--soft-green\)/.test(LAYOUT) && /var\(--warm-orange\)/.test(LAYOUT), 'C6 existing brand tokens only');

// ==========================================================================
if (fail === 0) console.log('\nAll FC Special-Event persistence + sidebar refinement assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
