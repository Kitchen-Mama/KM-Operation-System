// Kitchen Mama Operation System — Allocation Draft schema audit + decision-landing tests (Round C2-D1).
// Run: node assets/tests/allocation-draft-schema-audit.test.js
// LOCAL / SOURCE-LEVEL. Extracts the REAL running-stack canonical constants (16_shipping_allocation_handlers.gs)
// and evals the REAL read-only diagnostic (41_shipping_allocation_schema_audit.gs), driving its PURE functions +
// the editor-run wrapper against fakes. Proves: Model-1 exact match, Model-2 drift detection, line-level
// ownership, migration classification (never DELETE), deterministic hashes, zero-mutation + fail-closed wrapper,
// no raw values, non-routing/non-reachability, and that the decision-landing docs encode K3 / group_no deferral.
// No network, no live Spreadsheet, no mutation.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function readDoc(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }

var HANDLER = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
var GSRC = read('specs/active/apps-script/41_shipping_allocation_schema_audit.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var INVREPLEN = read('js/pages/inventory-replenishment.js');
var DBAPI = read('js/api/operation-system-db-api.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- bring the REAL canonical constants + the diagnostic functions into scope ---------------------------------
eval(HANDLER.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\];/)[0]);
eval(HANDLER.match(/var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]);
var DRAFTS_CANON = SHIPPING_ALLOCATION_DRAFTS_HEADERS_.slice();
var LINES_CANON = SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.slice();
eval(GSRC);   // defines sad* pure helpers + auditShippingAllocationSchemaReadOnly (all function declarations)

function draftsReport(actualHeaders, rows) { return sadAuditBuildTableReport_('shipping_allocation_drafts', true, actualHeaders, rows || [], DRAFTS_CANON); }
function planActions(plan) { return plan.map(function (p) { return p.action; }); }

// =====================================================================================================
section('Approved 30/28 exact canonical → NO_MIGRATION_REQUIRED (T1, T4)');
var r1 = draftsReport(DRAFTS_CANON.slice(), []);
ok(r1.exactMatch === true && r1.prefixMatch === true, 'T1 approved 30-col drafts header → exactMatch true');
ok(r1.migrationClassification === 'NO_MIGRATION_REQUIRED', 'T1b classification NO_MIGRATION_REQUIRED');
ok(r1.firstMismatchIndex === -1 && r1.missingHeaders.length === 0 && r1.extraHeaders.length === 0, 'T1c no mismatch/missing/extra');

var rLine = sadAuditBuildTableReport_('shipping_allocation_draft_lines', true, LINES_CANON.slice(), [], LINES_CANON);
ok(rLine.exactMatch === true && rLine.migrationClassification === 'NO_MIGRATION_REQUIRED', 'T4 approved 28-col line → exact match, NO_MIGRATION_REQUIRED');
ok(DRAFTS_CANON.indexOf('recommended_source_warehouse_id') >= 0 && DRAFTS_CANON.indexOf('recommended_destination_warehouse_id') >= 0 &&
   DRAFTS_CANON.indexOf('recommended_shipping_method') >= 0 && DRAFTS_CANON.indexOf('recommendation_group_no') >= 0, 'T4b route (From/To/Method) + group_no are HEADER columns');
ok(DRAFTS_CANON.length === 30 && LINES_CANON.length === 31, 'T4c approved schema = 30-col header / 31-col line (R3C2: +source_warehouse_id/code/allocated_qty)');
ok(LINES_CANON.indexOf('selected_source_warehouse_id') < 0 && LINES_CANON.indexOf('selected_shipping_method') < 0 && LINES_CANON.indexOf('user_edited') < 0, 'T4d NO selected_*/user_edited on the 28-col line');

// =====================================================================================================
section('Stale-expectation drift detection: old 23-col header / 52-col line (T2, T3)');
// The prior (incorrect) 23-col Model-1 header — no header-route fields — is DRIFT vs the approved 30-col canonical.
var HDR_ROUTE = ['recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery'];
var old23 = DRAFTS_CANON.filter(function (h) { return HDR_ROUTE.indexOf(h) < 0; });
ok(old23.length === 23, 'T2-pre old Model-1 header = 23 cols');
var r2 = draftsReport(old23, []);
ok(r2.exactMatch === false && r2.firstMismatchIndex === 7, 'T2 old 23-col header → first mismatch at index 7 (canonical has recommended_source_warehouse_id there)');
ok(r2.missingHeaders.indexOf('recommendation_group_no') >= 0 && r2.missingHeaders.indexOf('recommended_shipping_method') >= 0, 'T2b old header MISSING the header-route fields');
ok(r2.migrationClassification === 'MISSING_CANONICAL_COLUMN_REQUIRES_MIGRATION', 'T2c old 23-col → MISSING_CANONICAL_COLUMN_REQUIRES_MIGRATION');
// The prior 52-col line (selected_* + user_edited) has EXTRA columns vs the approved 28-col line.
var old52line = LINES_CANON.concat(['selected_source_warehouse_id', 'selected_destination_warehouse_id', 'selected_shipping_method', 'user_edited', 'user_edited_by']);
var rL2 = sadAuditBuildTableReport_('shipping_allocation_draft_lines', true, old52line, [], LINES_CANON);
ok(rL2.extraHeaders.indexOf('selected_source_warehouse_id') >= 0 && rL2.extraHeaders.indexOf('user_edited') >= 0, 'T3 old 52-col line → selected_*/user_edited reported as EXTRA vs the 28-col canonical');
ok(rL2.migrationClassification === 'EXTRA_EMPTY_COLUMNS_SAFE_CANDIDATE', 'T3b extra line columns (empty fixture) → safe candidate, never auto-delete');

// =====================================================================================================
section('Structural fault detection (T5, T6, T7, T8)');
var missing = DRAFTS_CANON.slice(); missing.splice(missing.indexOf('status'), 1);
var r5 = draftsReport(missing, []);
ok(r5.missingHeaders.indexOf('status') >= 0 && r5.migrationClassification === 'MISSING_CANONICAL_COLUMN_REQUIRES_MIGRATION', 'T5 missing canonical column → MISSING_CANONICAL_COLUMN_REQUIRES_MIGRATION');

var dup = DRAFTS_CANON.slice(); dup.push('note');
var r6 = draftsReport(dup, []);
ok(r6.duplicateHeaders.indexOf('note') >= 0 && r6.migrationClassification === 'DUPLICATE_OR_BLANK_HEADER_BLOCKED', 'T6 duplicate header → DUPLICATE_OR_BLANK_HEADER_BLOCKED');

var blank = DRAFTS_CANON.slice(); blank.splice(5, 0, '');
var r7 = draftsReport(blank, []);
ok(r7.blankHeaderIndexes.length > 0 && r7.migrationClassification === 'DUPLICATE_OR_BLANK_HEADER_BLOCKED', 'T7 blank header → DUPLICATE_OR_BLANK_HEADER_BLOCKED');

var reordered = DRAFTS_CANON.slice();
var a = reordered.indexOf('created_by'), b = reordered.indexOf('created_at');
reordered[a] = 'created_at'; reordered[b] = 'created_by';                 // swap two canonical fields
var r8 = draftsReport(reordered, []);
ok(r8.exactMatch === false && r8.reorderedHeaders.length > 0 && r8.missingHeaders.length === 0, 'T8 reordered canonical fields → reported (reorderedHeaders, no missing)');
ok(r8.migrationClassification === 'REORDER_ONLY_SAFE_CANDIDATE', 'T8b pure reorder → REORDER_ONLY_SAFE_CANDIDATE');

// =====================================================================================================
section('Extra-column policy (T9, T10) — populated needs decision, empty is a safe candidate, never auto-delete');
var extraPop = DRAFTS_CANON.slice(); extraPop.push('legacy_extra_col');
var popRow = []; for (var i = 0; i < DRAFTS_CANON.length; i++) popRow.push('');
popRow.push('LEGACY-DATA');                                              // the extra column carries data
var r9 = draftsReport(extraPop, [popRow]);
ok(r9.populatedExtraColumns.length === 1 && r9.populatedExtraColumns[0].header === 'legacy_extra_col' && r9.populatedExtraColumns[0].nonBlankCount === 1, 'T9 populated extra column → reported with count (no values)');
ok(r9.migrationClassification === 'EXTRA_POPULATED_COLUMNS_REQUIRES_MAPPING_DECISION', 'T9b populated extra → EXTRA_POPULATED_COLUMNS_REQUIRES_MAPPING_DECISION');

var r10 = draftsReport(extraPop, []);                                    // same header, but the extra column is EMPTY
ok(r10.populatedExtraColumns.length === 0 && r10.migrationClassification === 'EXTRA_EMPTY_COLUMNS_SAFE_CANDIDATE', 'T10 empty extra column → EXTRA_EMPTY_COLUMNS_SAFE_CANDIDATE');
var legacyPlan = r10.proposedMigrationPlan.filter(function (p) { return p.sourceHeader === 'legacy_extra_col'; })[0];
ok(legacyPlan && legacyPlan.action === 'PRESERVE_LEGACY', 'T10b empty extra column plan = PRESERVE_LEGACY (never auto-delete)');

// =====================================================================================================
section('Migration plan never emits DELETE (T17)');
var allActions = []
  .concat(planActions(r1.proposedMigrationPlan))
  .concat(planActions(r2.proposedMigrationPlan))
  .concat(planActions(r5.proposedMigrationPlan))
  .concat(planActions(r8.proposedMigrationPlan))
  .concat(planActions(r9.proposedMigrationPlan))
  .concat(planActions(r10.proposedMigrationPlan));
ok(allActions.indexOf('DELETE') < 0, 'T17 no proposed plan ever contains a DELETE action');
ok(GSRC.indexOf("'DELETE'") < 0, 'T17b source never emits a quoted DELETE token');
var missPlan = r5.proposedMigrationPlan.filter(function (p) { return p.targetHeader === 'status'; })[0];
ok(missPlan && missPlan.action === 'ADD_BLANK', 'T17c a missing canonical column is proposed as ADD_BLANK');

// =====================================================================================================
section('Deterministic hashes (T15, T16)');
ok(sadAuditHeaderHash_(DRAFTS_CANON) === sadAuditHeaderHash_(DRAFTS_CANON.slice()), 'T15 header hash deterministic (same input → same hash)');
ok(sadAuditHeaderHash_(DRAFTS_CANON) !== sadAuditHeaderHash_(old23), 'T15b header hash differs for a different header');
var rowsA = [['a', 'b', 'c'], ['d', 'e', 'f']];
var rowsB = [['a', 'b', 'c'], ['d', 'e', 'X']];
ok(sadAuditRowsHash_(rowsA) === sadAuditRowsHash_([['a', 'b', 'c'], ['d', 'e', 'f']]), 'T16 data-row hash deterministic');
ok(sadAuditRowsHash_(rowsA) !== sadAuditRowsHash_(rowsB), 'T16b data-row hash changes when a cell changes');

// =====================================================================================================
section('Editor-run wrapper — zero mutation, fail-closed, missing-sheet, no raw values (T11, T12, T13, T14)');
var EXPECTED_ID = 'EXACT_PROD_DB_ID_0001';
var CURRENT_SS = null;
global.SpreadsheetApp = { openById: function (id) { if (CURRENT_SS && CURRENT_SS.__failOpen) throw new Error('openById denied'); return CURRENT_SS; } };
global.Logger = { log: function () {} };
global.PRODUCTION_DB_SPREADSHEET_ID_ = EXPECTED_ID;

function spySheet(headers, rows) {
  var calls = { setValues: 0, setValue: 0, clear: 0, insertColumnBefore: 0, insertColumnAfter: 0, deleteColumn: 0, moveColumns: 0 };
  return {
    _calls: calls,
    getLastRow: function () { return 1 + (rows ? rows.length : 0); },
    getLastColumn: function () { return headers.length; },
    getName: function () { return 'fake'; },
    getRange: function (r) { return {
      getValues: function () { return r === 1 ? [headers.slice()] : rows.slice(); },
      setValues: function () { calls.setValues++; }, setValue: function () { calls.setValue++; }, clear: function () { calls.clear++; }
    }; },
    insertColumnBefore: function () { calls.insertColumnBefore++; }, insertColumnAfter: function () { calls.insertColumnAfter++; },
    deleteColumn: function () { calls.deleteColumn++; }, moveColumns: function () { calls.moveColumns++; }
  };
}
function spySS(id, map) { return { _insertSheet: 0, getId: function () { return id; }, getSheetByName: function (n) { return map[n] || null; }, insertSheet: function () { this._insertSheet++; throw new Error('insertSheet'); } }; }

// T11 — happy path against the exact target: zero mutation.
var dSheet = spySheet(DRAFTS_CANON.slice(), [DRAFTS_CANON.map(function () { return 'x'; })]);
var lSheet = spySheet(LINES_CANON.slice(), []);
CURRENT_SS = spySS(EXPECTED_ID, { shipping_allocation_drafts: dSheet, shipping_allocation_draft_lines: lSheet });
var w = auditShippingAllocationSchemaReadOnly();
function noMutation(s) { var c = s._calls; return c.setValues === 0 && c.setValue === 0 && c.clear === 0 && c.insertColumnBefore === 0 && c.insertColumnAfter === 0 && c.deleteColumn === 0 && c.moveColumns === 0; }
ok(w.readOnly === true && w.mutation === 'NONE' && !w.error, 'T11 wrapper runs read-only against the exact target');
ok(noMutation(dSheet) && noMutation(lSheet) && CURRENT_SS._insertSheet === 0, 'T11b ZERO mutation calls on any sheet / no insertSheet');
ok(w.tables.length === 2 && w.tables[0].exactMatch === true && w.tables[1].exactMatch === true, 'T11c both tables reported, exact-match against running-stack canonical');
ok(w.maskedTarget.indexOf(EXPECTED_ID) < 0 && w.maskedTarget.length > 0, 'T11d target id is masked (full id never disclosed)');

// T12 — wrong Spreadsheet id fails closed.
CURRENT_SS = spySS('SOME_OTHER_ID', { shipping_allocation_drafts: spySheet(DRAFTS_CANON.slice(), []) });
var wWrong = auditShippingAllocationSchemaReadOnly();
ok(wWrong.error === 'WRONG_SPREADSHEET_TARGET' && wWrong.tables.length === 0, 'T12 wrong Spreadsheet id → WRONG_SPREADSHEET_TARGET, no sheet read');
global.PRODUCTION_DB_SPREADSHEET_ID_ = '';
CURRENT_SS = spySS(EXPECTED_ID, {});
var wBlank = auditShippingAllocationSchemaReadOnly();
ok(wBlank.error === 'WRONG_SPREADSHEET_TARGET', 'T12b blank configured id → fail closed');
global.PRODUCTION_DB_SPREADSHEET_ID_ = EXPECTED_ID;

// T13 — missing sheet is report-only (no throw), classified UNKNOWN_BLOCKED.
CURRENT_SS = spySS(EXPECTED_ID, { shipping_allocation_drafts: spySheet(DRAFTS_CANON.slice(), []) });   // lines sheet absent
var wMiss = auditShippingAllocationSchemaReadOnly();
var linesRep = wMiss.tables.filter(function (t) { return t.table === 'shipping_allocation_draft_lines'; })[0];
ok(!wMiss.error && linesRep && linesRep.exists === false && linesRep.migrationClassification === 'UNKNOWN_BLOCKED', 'T13 missing sheet → report-only exists:false UNKNOWN_BLOCKED (no throw)');

// T14 — no raw business values are ever returned.
var secret = 'SECRET_CELL_VALUE_9Z';
var dRow = DRAFTS_CANON.map(function () { return secret; });
CURRENT_SS = spySS(EXPECTED_ID, { shipping_allocation_drafts: spySheet(DRAFTS_CANON.slice(), [dRow]), shipping_allocation_draft_lines: spySheet(LINES_CANON.slice(), []) });
var wSecret = auditShippingAllocationSchemaReadOnly();
ok(JSON.stringify(wSecret).indexOf(secret) < 0, 'T14 raw business cell values never appear in the output (only counts + hashes)');
ok(wSecret.tables[0].rowCount === 1 && typeof wSecret.tables[0].dataRowContentHash === 'string', 'T14b row count + deterministic data hash present instead of values');

// =====================================================================================================
section('Non-routing / non-reachability (T18, T19)');
ok(ROUTER.indexOf('auditShippingAllocationSchemaReadOnly') < 0, 'T18 router (doGet/doPost) never references the diagnostic');
ok(!/function\s+doGet/.test(GSRC) && !/function\s+doPost/.test(GSRC), 'T18b diagnostic file declares no doGet/doPost function');
// the only NON-definition, NON-test reference to a CALL must be absent from Runtime pages/handlers/adapters
function hasCall(src) { return /[^a-zA-Z_]auditShippingAllocationSchemaReadOnly\s*\(/.test(src.replace(/function\s+auditShippingAllocationSchemaReadOnly/g, '')); }
ok(!hasCall(HANDLER) && !hasCall(INVREPLEN) && !hasCall(DBAPI) && !hasCall(ROUTER), 'T19 no Runtime handler/page/adapter/router invokes the diagnostic');

// =====================================================================================================
section('Decision landing encoded in canonical docs (T20, T21, T22, T23)');
var FREEZE = readDoc('docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md');
var AMEND = readDoc('docs/planning/SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md');
var k3m = FREEZE.match(/<!-- K3-KEY-BEGIN -->([\s\S]*?)<!-- K3-KEY-END -->/);
ok(!!k3m, 'T20-pre freeze doc publishes a machine-checkable K3 key block');
var k3 = k3m ? k3m[1] : '';
ok(k3.indexOf('draft_version') < 0, 'T20 K3 key block excludes draft_version');
ok(k3.indexOf('recommendation_group_no') < 0, 'T21 K3 key block excludes recommendation_group_no');
ok(k3.indexOf('source_page') >= 0 && k3.indexOf('planning_cycle') >= 0, 'T21b K3 key includes source_page + planning_cycle');
ok(/draft_version[\s\S]{0,80}(version|concurrency)/i.test(FREEZE), 'T7-doc draft_version classified as version/concurrency (not a natural key)');
ok(FREEZE.indexOf('recommended_source_warehouse_id') >= 0 && FREEZE.indexOf('recommended_destination_warehouse_id') >= 0 && /header-level/i.test(FREEZE), 'T22 header-level route ownership (From/To/Method) documented');
ok(AMEND.indexOf('PHASE_2_DEFERRED') >= 0, 'T23 amendment air/sea multi-head + K2 key marked PHASE_2_DEFERRED');
ok(AMEND.indexOf('recommendation_group_no') >= 0, 'T23b amendment content retained (not deleted)');

// =====================================================================================================
section('Existing safety + reliability suites remain green (T24, T25)');
var cp = require('child_process');
function runSuite(rel) { try { cp.execSync('node "' + path.join(__dirname, rel) + '"', { stdio: 'ignore' }); return true; } catch (e) { return false; } }
ok(runSuite('supply-planning-production-safety.test.js'), 'T24 production-safety suite remains green');
ok(runSuite('km-weekly-command-reliability.test.js'), 'T25 C1 command-reliability suite remains green');

console.log('\n----------------------------------------');
console.log('ALLOCATION DRAFT SCHEMA AUDIT (C2-D1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
