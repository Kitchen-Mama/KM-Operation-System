// F1-7N-FA-3C-DRAFT-MODEL-R6F2F2-POST-COMMIT-READBACK-RECONCILIATION — reconcile the committed-but-unverified controlled
// K2 generation without touching any business row.
//   canonical accessors (exact-30 line id / FK / header id / calc-run) ; non-vacuous line_fk_ok ; actual DB line ids
//   (never token copies) ; K2-compatible route completeness (logical marketplace) ; FROZEN_SCOPE_VALIDATED only on full
//   pass ; malformed / divergent-id-scheme → RECONCILIATION_REQUIRED.
// vm sandbox over the ACTUAL TEMP .gs with mock DB sheets + a stored token.
// Run: node assets/tests/inventory-post-commit-readback-reconciliation-f1-7n-fa-3c-r6f2f2.test.js
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var HDR_COLS = ['allocation_draft_id', 'company', 'country', 'marketplace', 'planning_cycle', 'status', 'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no', 'calculation_run_id'];
var LINE_COLS = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'window_code', 'line_status'];
function matrix(cols, objs) { return [cols.slice()].concat((objs || []).map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }
function makeSandbox(opts) {
  opts = opts || {};
  var logs = [], props = opts.props || {}, setCalls = 0, sheets = opts.sheets || {};
  var ss = { getSheetByName: function (n) { if (sheets[n]) { var m = sheets[n]; return { getDataRange: function () { return { getValues: function () { return m; } }; } }; } return null; }, getId: function () { return 'MOCK'; }, getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; } };
  var sandbox = {
    Logger: { log: function (m) { logs.push(String(m)); } },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { setCalls++; props[k] = v; }, deleteProperty: function (k) { delete props[k]; } }; } },
    Utilities: { getUuid: function () { return 'u' + (++setCalls); }, computeDigest: function () { return [0]; }, DigestAlgorithm: { MD5: 'MD5' }, Charset: { UTF_8: 'UTF_8' } },
    JSON: JSON, Math: Math, String: String, Number: Number, Array: Array, Object: Object, Date: Date, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp
  };
  if (opts.flagTrue) sandbox.inventoryAiPlanDbGenerationEnabled_ = function () { return true; };
  sandbox.global = sandbox; vm.createContext(sandbox);
  vm.runInContext(TEMP, sandbox, { filename: 'TEMP.gs' });
  return { s: sandbox, logs: logs, props: props, setCalls: function () { return setCalls; } };
}
var FROZEN_LINES = ['SADL-K2-25BAA672', 'SADL-K2-434B65FA', 'SADL-K2-477B4D96', 'SADL-K2-4ED9AD78', 'SADL-K2-A9F07664'];
var HID = 'SADH-K2-7F15DD7D';
function baseToken() {
  return { token_version: 'R6F2E-TOKEN-1', frozen: true, freeze_version: 'R6F2E-FREEZE-1', scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon' },
    planning_cycle: 'RECO-2026-08', calculation_run_id_fingerprint: 'FP', freeze_checksum: 'e626e368',
    expected_k2_header_count: 1, expected_k2_line_count: 5, expected_header_ids_sorted: [HID], expected_line_ids_sorted: FROZEN_LINES.slice(),
    pre_run_db_header_rows: 2, pre_run_db_line_rows: 0, expected_post_run_db_header_rows: 3, expected_post_run_db_line_rows: 5,
    unrelated_scope_active_row_checksum: 'UNREL', legacy_header_checksum: 'LEG', groups: [{ expected_header_id: HID, expected_line_ids: FROZEN_LINES.slice() }], token_integrity_checksum: 'x' };
}
function header(over) { var h = { allocation_draft_id: HID, company: 'ResTW', country: 'JP', marketplace: 'Amazon', planning_cycle: 'RECO-2026-08', status: 'draft', recommended_source_warehouse_id: 'WH1', recommended_destination_warehouse_id: '', recommended_shipping_method: 'Air', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1', calculation_run_id: 'GAP-INV-0001' }; if (over) Object.keys(over).forEach(function (k) { h[k] = over[k]; }); return h; }
function lineRows(ids, fk) { return ids.map(function (id, i) { return { allocation_draft_line_id: id, allocation_draft_id: fk || HID, sku: 'SKU' + i, window_code: 'W1', line_status: '' }; }); }
function sbWith(headerObj, lines) { return makeSandbox({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj]), shipping_allocation_draft_lines: matrix(LINE_COLS, lines) } }); }

// =====================================================================================================
section('canonical accessors + exact-30 field mapping');
var S0 = makeSandbox().s;
eq(S0.TEMP_r6f2fLineId_({ allocation_draft_line_id: 'L1' }), 'L1', 'A1 line id accessor reads allocation_draft_line_id');
eq(S0.TEMP_r6f2fLineFk_({ allocation_draft_id: 'H1' }), 'H1', 'A2 line FK accessor reads allocation_draft_id');
eq(S0.TEMP_r6f2fHeaderRunId_({ calculation_run_id: 'R1' }), 'R1', 'A3 header calc-run accessor reads calculation_run_id');
ok(/'allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku'/.test(read('specs/active/apps-script/16_shipping_allocation_handlers.gs')), 'A4 line id/FK are index 0/1 in the exact-30 schema');

// =====================================================================================================
section('readback: five frozen actual DB line IDs recognized; from DB not token');
var rbMatch = sbWith(header(), lineRows(FROZEN_LINES)).s.TEMP_r6f2fReadFrozenScopeState_(baseToken());
eq(rbMatch.lines_present, 5, 'B1 five frozen actual DB line ids matched');
eq(rbMatch.line_fk_ok, true, 'B2 non-vacuous line_fk_ok=true when lines matched');
eq(rbMatch.missing_line_ids.length, 0, 'B3 no missing frozen line ids');
eq(rbMatch.unexpected_line_ids.length, 0, 'B4 no unexpected line ids');
eq(JSON.stringify(rbMatch.actual_line_ids_for_expected_header), JSON.stringify(FROZEN_LINES.slice().sort()), 'B5 actual_line_ids come from DB rows (not token copies)');

// =====================================================================================================
section('readback: zero matched lines cannot yield line_fk_ok=true (vacuous-truth fix)');
var rbDiverge = sbWith(header(), lineRows(['SADL-AAA', 'SADL-BBB', 'SADL-CCC', 'SADL-DDD', 'SADL-EEE'])).s.TEMP_r6f2fReadFrozenScopeState_(baseToken());
eq(rbDiverge.lines_present, 0, 'C1 divergent-scheme actual ids → zero matched');
eq(rbDiverge.line_fk_ok, null, 'C2 line_fk_ok is null (UNKNOWN), never vacuously true, when zero matched');
eq(rbDiverge.missing_line_ids.length, 5, 'C3 all five frozen line ids are missing');
eq(rbDiverge.unexpected_line_ids.length, 5, 'C4 the five actual SADL- ids are unexpected');

// =====================================================================================================
section('readback: missing / wrong-FK / route completeness');
var rbMissing = sbWith(header(), lineRows(FROZEN_LINES.slice(0, 4))).s.TEMP_r6f2fReadFrozenScopeState_(baseToken());
eq(rbMissing.missing_line_ids.length, 1, 'D1 a missing line id is surfaced (blocker)');
// wrong FK: frozen line ids but FK to a different header → not under the frozen header → missing
var rbWrongFk = sbWith(header(), lineRows(FROZEN_LINES, 'SADH-K2-OTHER')).s.TEMP_r6f2fReadFrozenScopeState_(baseToken());
eq(rbWrongFk.lines_present, 0, 'D2 lines FK-linked to a different header are not counted for the frozen header');
eq(rbWrongFk.missing_line_ids.length, 5, 'D3 wrong-FK lines leave all frozen ids missing (blocker)');
// route completeness K2: marketplace destination (no dest warehouse) is route-complete
eq(sbWith(header({ recommended_destination_warehouse_id: '', marketplace: 'Amazon' }), lineRows(FROZEN_LINES)).s.TEMP_r6f2fReadFrozenScopeState_(baseToken()).route_complete_k2, true, 'D4 logical marketplace destination → K2 route-complete');
// missing method → not route complete
eq(sbWith(header({ recommended_shipping_method: '' }), lineRows(FROZEN_LINES)).s.TEMP_r6f2fReadFrozenScopeState_(baseToken()).route_complete_k2, false, 'D5 missing method → not route-complete');

// =====================================================================================================
section('diagnostic verdict: divergent id scheme → RECONCILIATION_REQUIRED (business data present, not malformed)');
var sbD = sbWith(header(), lineRows(['SADL-AAA', 'SADL-BBB', 'SADL-CCC', 'SADL-DDD', 'SADL-EEE']));
sbD.s.PropertiesService.getScriptProperties().setProperty(sbD.s.TEMP_R6F2E_STORE_PROP_KEY_, JSON.stringify(baseToken()));
var setBefore = sbD.setCalls();
var diag = sbD.s.TEMP_R6F2F2_DIAGNOSE_COMMITTED_FROZEN_SCOPE();
eq(diag.verdict, 'RECONCILIATION_REQUIRED', 'E1 divergent line-id scheme → RECONCILIATION_REQUIRED (never weakened to pass)');
eq(diag.validator_comparison.line_id_scheme_divergent, true, 'E2 diagnostic flags the FREEZE/WRITER line-id-scheme divergence');
ok(/PRESENT_AND_LINKED/.test(diag.business_data_conclusion), 'E3 business data classified present+linked (not malformed)');
ok(diag.reconciliation.missing_line_ids.length === 5 && diag.reconciliation.unexpected_line_ids.length === 5, 'E4 reconciliation sets: 5 missing frozen + 5 unexpected actual');
eq(sbD.logs.filter(function (m) { return m.indexOf('R6F2F2_DIAGNOSE ') === 0; }).length, 1, 'E5 one compact primary log');
ok(diag.schema_authority && diag.schema_authority.line_id_field === 'allocation_draft_line_id' && diag.schema_authority.line_fk_field === 'allocation_draft_id' && diag.schema_authority.header_calc_run_field === 'calculation_run_id', 'E6 diagnostic surfaces the canonical line id / FK / calc-run field authorities');

// =====================================================================================================
section('diagnostic verdict: exact committed 1+5 → FROZEN_SCOPE_VALIDATED (all gates)');
var sbV = sbWith(header(), lineRows(FROZEN_LINES));
// derive the checksums/lineage the token must carry so ALL canonical gates pass
var tokV = baseToken();
tokV.calculation_run_id_fingerprint = sbV.s.TEMP_r5bIdFingerprint_('GAP-INV-0001');
var guardsV = sbV.s.TEMP_r6f2eComputeLiveGuards_({ company: 'ResTW', country: 'JP', marketplace: 'Amazon', planning_cycle: 'RECO-2026-08' });
tokV.unrelated_scope_active_row_checksum = guardsV.unrelated_scope_active_row_checksum;
tokV.legacy_header_checksum = guardsV.legacy_header_checksum;
sbV.s.PropertiesService.getScriptProperties().setProperty(sbV.s.TEMP_R6F2E_STORE_PROP_KEY_, JSON.stringify(tokV));
var diagV = sbV.s.TEMP_R6F2F2_DIAGNOSE_COMMITTED_FROZEN_SCOPE();
eq(diagV.verdict, 'FROZEN_SCOPE_VALIDATED', 'F1 exact 1+5 with matching lineage + checksums → FROZEN_SCOPE_VALIDATED');
eq(diagV.actual_header.calc_run_lineage_match, true, 'F2 calc-run lineage matches the frozen fingerprint');
// break lineage → RECONCILIATION_REQUIRED (lineage is a gate)
var tokBadLineage = JSON.parse(JSON.stringify(tokV)); tokBadLineage.calculation_run_id_fingerprint = 'WRONG';
sbV.s.PropertiesService.getScriptProperties().setProperty(sbV.s.TEMP_R6F2E_STORE_PROP_KEY_, JSON.stringify(tokBadLineage));
eq(sbV.s.TEMP_R6F2F2_DIAGNOSE_COMMITTED_FROZEN_SCOPE().verdict, 'RECONCILIATION_REQUIRED', 'F3 wrong cycle/run lineage is a blocker');

// =====================================================================================================
section('diagnostic: malformed (orphan line) → RECONCILIATION_REQUIRED; no repair');
var sbM = makeSandbox({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [header()]), shipping_allocation_draft_lines: matrix(LINE_COLS, lineRows(FROZEN_LINES).concat([{ allocation_draft_line_id: 'ORPH', allocation_draft_id: 'SADH-NONEXIST', sku: 'X', window_code: 'W', line_status: '' }])) } });
sbM.s.PropertiesService.getScriptProperties().setProperty(sbM.s.TEMP_R6F2E_STORE_PROP_KEY_, JSON.stringify(baseToken()));
var diagM = sbM.s.TEMP_R6F2F2_DIAGNOSE_COMMITTED_FROZEN_SCOPE();
ok(diagM.reconciliation.orphan_lines >= 1, 'G1 orphan line detected');
eq(diagM.verdict, 'RECONCILIATION_REQUIRED', 'G2 malformed data stays RECONCILIATION_REQUIRED');
ok(!/setProperty|setValue|appendRow/.test((function () { var a = TEMP.indexOf('function TEMP_R6F2F2_DIAGNOSE_COMMITTED_FROZEN_SCOPE'); return TEMP.slice(a, TEMP.length); })().split('function TEMP_')[0] + 'x'), 'G3 the diagnostic body performs no write');

// =====================================================================================================
section('executor committed-state detection = zero generation (flag false, matched fixture)');
var sbAC = sbWith(header(), lineRows(FROZEN_LINES));
sbAC.s.PropertiesService.getScriptProperties().setProperty(sbAC.s.TEMP_R6F2E_STORE_PROP_KEY_, JSON.stringify(baseToken()));
var acOut = sbAC.s.TEMP_R6F2F_EXECUTE_FROZEN_INVENTORY_AI_PLAN_ONCE();
eq(acOut.verdict, 'CONTROLLED_EXECUTION_ALREADY_COMMITTED', 'H1 matched 1+5 → ALREADY_COMMITTED');
eq(acOut.generation_called, false, 'H2 zero generation call on ALREADY_COMMITTED');

console.log('\n----------------------------------------');
console.log('R6F2F2 POST-COMMIT READBACK RECONCILIATION: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
