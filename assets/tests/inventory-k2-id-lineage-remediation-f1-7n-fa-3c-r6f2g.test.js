// F1-7N-FA-3C-DRAFT-MODEL-R6F2G — K2 id + lineage remediation.
//   B: 16_ writer mints SADL-K2- for a K2 group (CREATE + missing-line REGENERATE), SADL- for a generic draft, never
//      trusts a caller-supplied arbitrary line id for a K2 CREATE; REUSE stays zero-write; user-edit ownership unchanged.
//   C: 61_ transport adopts the authoritative GAP-INV run id into calculation_run_id; blank/stale/MONTHLY_ORDER blocks.
//   D/E/F: read-only preflight (old→new mapping, dup-target block, downstream-reference HALT), STAGED migration
//      (DRY_RUN read-only, COMMIT confirmation+lock+rollback-before-mutation, exactly-5 cells, no row-count change,
//      COMMITTED_UNVERIFIED no-retry), consolidated FROZEN_SCOPE_VALIDATED validator; pre-migration = RECONCILIATION_REQUIRED.
// Run: node assets/tests/inventory-k2-id-lineage-remediation-f1-7n-fa-3c-r6f2g.test.js
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var pass = 0, fail = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

var G16 = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G61 = read('specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');

// ---- the pure 16_ id helpers (shared by the sandbox + the direct unit tests) ------------------------------------
var SAD_ID_HELPERS = ['sadFnv1a_', 'sadLineNaturalKey_', 'sadDeterministicLineId_', 'sadK2LineNaturalKey_',
  'sadK2DeterministicLineId_', 'sadK2GroupKey_', 'sadK2DeterministicHeaderId_', 'sadHeaderRouteIsComplete_',
  'sadIsK2Group_', 'sadNewLineId_'].map(function (n) { return extractFn(G16, n); }).join('\n');

// ================================================================================================================
section('B. 16_ K2-aware NEW-line id helpers (pure)');
eval(SAD_ID_HELPERS);
var L = { sku: 'A', site_sku: 'A-JP', window_code: 'W1', source_warehouse_id: 'WH-CN', route_no: 'R1' };
ok(/^SADL-K2-[0-9A-F]{8}$/.test(sadK2DeterministicLineId_('D', L)), 'B1 K2 line id shape SADL-K2-');
ok(/^SADL-[0-9A-F]{8}$/.test(sadDeterministicLineId_('D', L)) && sadDeterministicLineId_('D', L).indexOf('SADL-K2-') !== 0, 'B1 generic line id shape SADL- (not K2)');
eq(sadNewLineId_(true, 'D', L), sadK2DeterministicLineId_('D', L), 'B2 K2 group → sadNewLineId_ mints the K2 id');
eq(sadNewLineId_(false, 'D', L), sadDeterministicLineId_('D', L), 'B2 generic → sadNewLineId_ mints the SADL- id');
// K2 line natural key excludes source/route (header dims) — two lines differing only in source/route → same K2 id
eq(sadK2DeterministicLineId_('D', L), sadK2DeterministicLineId_('D', { sku: 'A', site_sku: 'A-JP', window_code: 'W1', source_warehouse_id: 'WH-XX', route_no: 'R9' }), 'B2 K2 id ignores source/route (header dims)');
// classification authority (not a spoofable prefix)
var rc = { recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: 'WH-JP', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA' };
var ri = { recommended_source_warehouse_id: 'WH-CN' };
eq(sadIsK2Group_(true, 'anything', ri), true, 'B3 resolver k2=true → K2 group');
eq(sadIsK2Group_(false, 'SADH-legacy', ri), false, 'B3 resolver k2=false + non-K2 id → generic');
eq(sadIsK2Group_(undefined, 'SADH-K2-7F15DD7D', {}), true, 'B3 explicit-id edit of a stored SADH-K2- header → K2 group');
eq(sadIsK2Group_(undefined, '', rc), true, 'B3 no id + route-complete header → K2 group (route authority)');
eq(sadIsK2Group_(undefined, '', ri), false, 'B3 no id + route-incomplete header → generic');

// ---- 16_ atomic + keyed cores wire the K2-aware minting (source-fact) -------------------------------------------
section('B. 16_ cores wire K2-aware line-id minting');
var atomicCore = extractFn(G16, 'sadAtomicUpsertCore_');
ok(/var isK2Group = id \? sadIsK2Group_\(undefined, id, header\) : false;/.test(atomicCore), 'B4 atomic core classifies K2 from explicit id / header authority');
ok(/isK2Group = sadIsK2Group_\(res\.k2, res\.id, header\);/.test(atomicCore), 'B4 atomic core classifies K2 from the resolver decision on CREATE/REUSE');
ok(/if \(isK2Group\) lineId = sadK2DeterministicLineId_\(id, l\);\s*\n\s*else if \(!lineId\) lineId = sadDeterministicLineId_\(id, l\);/.test(atomicCore), 'B5 K2 CREATE mints SADL-K2- and NEVER trusts a caller-supplied id; generic honors explicit id else SADL-');
ok(/setValue\(sadNewLineId_\(isK2Group, id, l\)\)/.test(atomicCore), 'B6 atomic heal-blank id path is K2-aware (REGENERATE missing-line uses the K2 authority)');
var keyedCore = extractFn(G16, 'sadUpsertLinesKeyedCore_');
ok(/var isK2Draft = \(String\(draftId\)\.indexOf\('SADH-K2-'\) === 0\);/.test(keyedCore), 'B7 keyed core classifies a stored SADH-K2- draft as K2');
ok(/if \(isK2Draft\) lineId = sadK2DeterministicLineId_\(draftId, l\);\s*\n\s*else if \(!lineId\) lineId = sadDeterministicLineId_\(draftId, l\);/.test(keyedCore), 'B7 keyed K2 draft mints SADL-K2-; generic unchanged');
ok(/setValue\(sadNewLineId_\(isK2Draft, draftId, l\)\)/.test(keyedCore), 'B7 keyed heal-blank id path is K2-aware');

// ---- REUSE stays zero-write; lineage fields excluded from the REUSE fingerprint ---------------------------------
section('B. REUSE zero-write + lineage excluded from fingerprint');
ok(/priorFp === incFp[\s\S]{0,200}outcome: 'REUSED'[\s\S]{0,80}zero_write: true/.test(atomicCore), 'B8 equal payload → REUSED, zero writes (K2 retry never duplicates)');
eval(G16.match(/var SAD_K2_HEADER_FP_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SAD_K2_LINE_FP_ = \[[\s\S]*?\];/)[0]);
ok(SAD_K2_HEADER_FP_.indexOf('calculation_run_id') === -1 && SAD_K2_LINE_FP_.indexOf('calculation_run_id') === -1, 'B9 calculation_run_id is EXCLUDED from the REUSE fingerprint (lineage stamp never forces REGENERATE)');
// user-edit ownership rule unchanged
ok(/function sadRegenerateLinePatch_/.test(G16) && /note is USER-owned/.test(G16), 'B10 user-edit ownership rule (sadRegenerateLinePatch_) unchanged');

// ================================================================================================================
section('C. 61_ GAP-INV lineage transport');
var lineageSrc = extractFn(G61, 'weeklyAiPlanResolveGapRunLineage_');
function resolver(propVal, cycle) {
  var PropertiesService = { getScriptProperties: function () { return { getProperty: function () { return propVal; } }; } };
  var f = new Function('PropertiesService', lineageSrc + '\nreturn weeklyAiPlanResolveGapRunLineage_;');
  return f(PropertiesService)(cycle, { sourceDataAsOf: '2026-08-01' }, { formulaVersion: 'WEEKLY_AI_PLAN_V1' });
}
var doneRun = JSON.stringify({ product: 'INVENTORY', runId: 'GAP-INV-2026-08-0001', status: 'DONE', planningCycle: 'RECO-2026-08', finishedAt: '2026-08-02T00:00:00Z', calculationDate: '2026-08-01' });
var rOk = resolver(doneRun, 'RECO-2026-08');
eq(rOk.ok, true, 'C1 DONE GAP-INV run, cycle match → ok');
eq(rOk.calculation_run_id, 'GAP-INV-2026-08-0001', 'C1 raw GAP-INV run id reaches calculation_run_id');
eq(rOk.formula_version, 'WEEKLY_AI_PLAN_V1', 'C1 formula_version carried from the request authority');
eq(rOk.source_data_as_of, '2026-08-01', 'C1 source_data_as_of carried from the harvest');
eq(rOk.calculated_at, '2026-08-02T00:00:00Z', 'C1 calculated_at carried from the GAP run (not fabricated)');
eq(resolver(null, 'RECO-2026-08').reason, 'LINEAGE_GAP_RUN_UNRESOLVED', 'C2 missing property → BLOCK LINEAGE_GAP_RUN_UNRESOLVED');
eq(resolver(JSON.stringify({ product: 'ORDER_PLANNING', runId: 'RUN::RD::MONTHLY_ORDER', status: 'DONE' }), 'RECO-2026-08').reason, 'LINEAGE_RUN_NOT_INVENTORY', 'C3 MONTHLY_ORDER / non-INVENTORY run → BLOCK (never used)');
eq(resolver(JSON.stringify({ product: 'INVENTORY', runId: 'MONTHLY-1', status: 'DONE', planningCycle: 'RECO-2026-08' }), 'RECO-2026-08').reason, 'LINEAGE_RUN_ID_PREFIX_INVALID', 'C4 wrong prefix → BLOCK');
eq(resolver(JSON.stringify({ product: 'INVENTORY', runId: 'GAP-INV-1', status: 'RUNNING', planningCycle: 'RECO-2026-08' }), 'RECO-2026-08').reason, 'LINEAGE_GAP_RUN_NOT_DONE', 'C5 not DONE → BLOCK');
eq(resolver(JSON.stringify({ product: 'INVENTORY', runId: 'GAP-INV-1', status: 'DONE', planningCycle: 'RECO-2026-07' }), 'RECO-2026-08').reason, 'LINEAGE_RUN_CYCLE_MISMATCH', 'C6 stale/other-cycle run → BLOCK');
var genK2 = extractFn(G61, 'weeklyAiPlanGenerateK2_');
ok(/var lineage = weeklyAiPlanResolveGapRunLineage_\(request\.planningCycle, harvest, request\);/.test(genK2) && /if \(!lineage\.ok\) return jsonResponse_\(\{ success: false/.test(genK2), 'C7 generate BLOCKS before any write when lineage not ok');
ok(/g\.header\.calculation_run_id = lineage\.calculation_run_id;[\s\S]{0,500}handleUpsertShippingAllocationDraftAtomic_/.test(genK2), 'C8 header stamped with lineage BEFORE the atomic write');
ok(genK2.indexOf('var lineage = weeklyAiPlanResolveGapRunLineage_') < genK2.indexOf('Object.keys(byMkt).sort().forEach'), 'C9 lineage resolution/BLOCK precedes the per-group write loop');

// ================================================================================================================
// D/E/F — vm sandbox over (16_ id helpers + TEMP) with mock DB + stored token + GAP property.
section('D/E/F. sandbox setup');
var HID = 'SADH-K2-7F15DD7D';
var HDR_COLS = ['allocation_draft_id', 'company', 'country', 'marketplace', 'planning_cycle', 'status', 'source_page', 'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of'];
var LINE_COLS = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code', 'line_status'];
function matrix(cols, objs) { return [cols.slice()].concat((objs || []).map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }
function mutableSheet(m) {
  return {
    getDataRange: function () { return { getValues: function () { return m; } }; },
    getLastColumn: function () { return m[0].length; },
    getRange: function (r, c) { return { setValue: function (v) { m[r - 1][c - 1] = v; }, getValue: function () { return m[r - 1][c - 1]; }, getValues: function () { return [m[r - 1]]; } }; },
    _m: function () { return m; }
  };
}
var GAP_RUN_ID = 'GAP-INV-2026-08-000001-abcd0001';
function makeSb(opts) {
  opts = opts || {};
  var logs = [], props = opts.props || {}, sheetMats = opts.sheets || {}, sheets = {}, writeCalls = { count: 0 };
  Object.keys(sheetMats).forEach(function (n) { sheets[n] = mutableSheet(sheetMats[n]); });
  var ss = { getSheetByName: function (n) { return sheets[n] || null; }, getId: function () { return 'MOCK'; }, getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; } };
  var sandbox = {
    Logger: { log: function (m) { logs.push(String(m)); } },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { props[k] = v; }, deleteProperty: function (k) { delete props[k]; } }; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () { } }; } },
    Utilities: { getUuid: function () { return 'uuid'; } },
    JSON: JSON, Math: Math, String: String, Number: Number, Array: Array, Object: Object, Date: Date, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp
  };
  sandbox.global = sandbox; vm.createContext(sandbox);
  vm.runInContext(SAD_ID_HELPERS + '\n' + TEMP, sandbox, { filename: 'R6F2G-sandbox' });
  // deterministic checksum guards (the live-guard computation itself is tested elsewhere; here we isolate the R6F2G gates)
  sandbox.TEMP_r6f2eComputeLiveGuards_ = function () { return { unrelated_scope_active_row_checksum: '62b84b14', legacy_header_checksum: '8a51b860' }; };
  return { s: sandbox, logs: logs, props: props, sheets: sheets };
}
function oldLineRows(ids) { return ids.map(function (id, i) { return { allocation_draft_line_id: id, allocation_draft_id: HID, sku: 'SKU' + i, site_sku: 'S' + i, window_code: 'W1', line_status: '' }; }); }
var OLD_IDS = ['SADL-FCDDD34D', 'SADL-052D41CB', 'SADL-47BE8787', 'SADL-66681C51', 'SADL-F6BF5BC5'];
function headerObj(over) {
  var h = { allocation_draft_id: HID, company: 'ResTW', country: 'JP', marketplace: 'Amazon', planning_cycle: 'RECO-2026-08', status: 'draft', source_page: 'inventory_replenishment', recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: '', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1', calculation_run_id: '', formula_version: '', calculated_at: '', source_data_as_of: '' };
  if (over) Object.keys(over).forEach(function (k) { h[k] = over[k]; }); return h;
}
function buildToken(sb, lineRows) {
  var newIds = lineRows.map(function (r) { return sb.s.sadK2DeterministicLineId_(HID, r); }).slice().sort();
  var fp = sb.s.TEMP_r5bIdFingerprint_(GAP_RUN_ID);
  return { token_version: 'R6F2E-TOKEN-1', frozen: true, freeze_version: 'R6F2E-FREEZE-1', scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon' },
    planning_cycle: 'RECO-2026-08', calculation_run_id_fingerprint: fp, freeze_checksum: 'e626e368',
    expected_k2_header_count: 1, expected_k2_line_count: 5, expected_header_ids_sorted: [HID], expected_line_ids_sorted: newIds,
    pre_run_db_header_rows: 1, pre_run_db_line_rows: 5, expected_post_run_db_header_rows: 2, expected_post_run_db_line_rows: 10,
    unrelated_scope_active_row_checksum: '62b84b14', legacy_header_checksum: '8a51b860',
    groups: [{ expected_header_id: HID, expected_line_ids: newIds }], token_integrity_checksum: 'd70cd43d' };
}
function gapProp() { return JSON.stringify({ product: 'INVENTORY', runId: GAP_RUN_ID, status: 'DONE', planningCycle: 'RECO-2026-08', finishedAt: '2026-08-02T00:00:00Z', calculationDate: '2026-08-01' }); }
function scenario(extraSheets, headerOver) {
  var lr = oldLineRows(OLD_IDS);
  var sheets = { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj(headerOver)]), shipping_allocation_draft_lines: matrix(LINE_COLS, lr) };
  if (extraSheets) Object.keys(extraSheets).forEach(function (k) { sheets[k] = extraSheets[k]; });
  var sb = makeSb({ sheets: sheets, props: {} });
  var token = buildToken(sb, lr);
  sb.props[sb.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(token);
  sb.props.GAP_JOB_INVENTORY = gapProp();
  return { sb: sb, token: token };
}

section('D. migration plan (old→new derived from live rows)');
var sc = scenario();
var plan = sc.sb.s.TEMP_r6f2gBuildMigrationPlan_(sc.token);
eq(plan.mappings.length, 5, 'D1 exactly five live rows mapped');
ok(plan.mappings.every(function (m) { return /^SADL-K2-[0-9A-F]{8}$/.test(m.new_line_id) && m.old_line_id.indexOf('SADL-K2-') !== 0; }), 'D2 every new id is SADL-K2- (from a SADL- old id)');
eq(plan.duplicate_target_count, 0, 'D3 no duplicate target ids');
eq(plan.all_fk_point_to_header, true, 'D3 every FK points to the frozen header');
eq(plan.new_ids_match_frozen, true, 'D4 derived new ids == frozen expected line ids');

section('D. preflight READY on a clean staged scope');
var pf = sc.sb.s.TEMP_R6F2G_PREFLIGHT_K2_ID_LINEAGE_REMEDIATION();
eq(pf.verdict, 'READY_FOR_CONTROLLED_K2_ID_LINEAGE_REMEDIATION', 'D5 all gates pass → READY');
eq(pf.R6F2G_ZERO_WRITE_CONFIRMED, 'YES (read-only)', 'D5 preflight is read-only');
eq(pf.inventory_flag_false, true, 'D5 inventory flag false');
eq(pf.downstream_line_id_reference_total, 0, 'D5 no downstream references to old ids');

section('D. duplicate target id blocks readiness');
var lrDup = oldLineRows(OLD_IDS);
lrDup[1].sku = lrDup[0].sku; lrDup[1].site_sku = lrDup[0].site_sku; lrDup[1].window_code = lrDup[0].window_code; // → same K2 id
var sbDup = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj()]), shipping_allocation_draft_lines: matrix(LINE_COLS, lrDup) }, props: {} });
var tokDup = buildToken(sbDup, lrDup); sbDup.props[sbDup.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokDup); sbDup.props.GAP_JOB_INVENTORY = gapProp();
ok(sbDup.s.TEMP_r6f2gBuildMigrationPlan_(tokDup).duplicate_target_count > 0, 'D6 two rows with identical K2 natural key → duplicate target detected');
ok(sbDup.s.TEMP_R6F2G_PREFLIGHT_K2_ID_LINEAGE_REMEDIATION().verdict !== 'READY_FOR_CONTROLLED_K2_ID_LINEAGE_REMEDIATION', 'D6 duplicate target → NOT READY');

section('D. downstream reference to an OLD line id → HALT');
var refSheet = matrix(['shipping_plan_line_id', 'source_allocation_draft_line_id'], [{ shipping_plan_line_id: 'SPL1', source_allocation_draft_line_id: OLD_IDS[0] }]);
var scRef = scenario({ shipping_plan_lines: refSheet });
var pfRef = scRef.sb.s.TEMP_R6F2G_PREFLIGHT_K2_ID_LINEAGE_REMEDIATION();
eq(pfRef.verdict, 'HALT_DOWNSTREAM_REFERENCE_TO_OLD_LINE_ID', 'D7 an OLD line id referenced downstream → HALT (no silent cascade)');
ok(pfRef.downstream_line_id_reference_total > 0, 'D7 the downstream reference is counted');

section('E. DRY_RUN is read-only + prints the plan checksum; confirmation left at placeholder');
var dry = sc.sb.s.TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_DRY_RUN();
eq(dry.verdict, 'DRY_RUN_READY', 'E1 dry-run ready');
eq(dry.line_id_cell_update_count, 5, 'E1 five id-cell updates planned');
eq(dry.R6F2G_ZERO_WRITE_CONFIRMED, 'YES (read-only)', 'E1 dry-run writes nothing');
ok(/PLACEHOLDER/.test(dry.confirmation_constant_status), 'E1 confirmation constant is a placeholder (COMMIT will refuse)');
ok(/TEMP_R6F2G_CONFIRMED_MIGRATION_CHECKSUM_ = 'PASTE_MIGRATION_PLAN_CHECKSUM_HERE';/.test(TEMP), 'E2 confirmation checksum constant left at placeholder in the file (staged OFF)');

section('E. COMMIT refuses while the confirmation constant is a placeholder (zero write)');
var scC = scenario();
var before = JSON.stringify(scC.sb.sheets.shipping_allocation_draft_lines._m());
var refused = scC.sb.s.TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_COMMIT();
eq(refused.verdict, 'REFUSED_CONFIRMATION_CHECKSUM_NOT_SET_OR_MISMATCH', 'E3 placeholder confirmation → COMMIT refuses');
eq(JSON.stringify(scC.sb.sheets.shipping_allocation_draft_lines._m()), before, 'E3 refused COMMIT wrote nothing');
ok(!scC.sb.props[scC.sb.s.TEMP_R6F2G_MIGRATION_STORE_KEY_], 'E3 no rollback token stored on refusal');

section('E. COMMIT behavior when confirmation is set (in-test override; file stays placeholder)');
var scX = scenario();
scX.sb.s.TEMP_R6F2G_CONFIRMED_MIGRATION_CHECKSUM_ = scX.sb.s.TEMP_r6f2gBuildMigrationPlan_(scX.token).migration_plan_checksum; // runtime-only override
var rowsBefore = scX.sb.sheets.shipping_allocation_draft_lines._m().length;
var committed = scX.sb.s.TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_COMMIT();
eq(committed.verdict, 'COMMITTED_K2_ID_LINEAGE_REMEDIATION', 'E4 confirmation + READY → committed after verified readback');
eq(committed.line_id_cells_updated, 5, 'E4 exactly five id cells updated');
eq(scX.sb.sheets.shipping_allocation_draft_lines._m().length, rowsBefore, 'E5 no row inserted/deleted (row count unchanged)');
var liveIds = scX.sb.sheets.shipping_allocation_draft_lines._m().slice(1).map(function (r) { return r[0]; }).sort();
eq(liveIds, scX.token.expected_line_ids_sorted.slice().sort(), 'E5 the five id cells now hold the frozen SADL-K2 ids');
ok(liveIds.every(function (id) { return id.indexOf('SADL-K2-') === 0; }), 'E5 no old SADL- id remains under the K2 header');
var rb = JSON.parse(scX.sb.props[scX.sb.s.TEMP_R6F2G_MIGRATION_STORE_KEY_]);
eq(rb.line_id_cells.map(function (c) { return c.before; }).sort(), OLD_IDS.slice().sort(), 'E6 rollback token captured the OLD ids (stored BEFORE the id cells were overwritten)');
var hRun = scX.sb.sheets.shipping_allocation_drafts._m()[1][HDR_COLS.indexOf('calculation_run_id')];
eq(hRun, GAP_RUN_ID, 'E7 header calculation_run_id lineage set from the authoritative GAP-INV run id');

section('E/F. COMMIT source contract (lock · rollback-before-mutation · fail-closed · no-retry)');
var commitSrc = extractFn(TEMP, 'TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_COMMIT');
ok(/LockService\.getScriptLock\(\)/.test(commitSrc) && /tryLock\(30000\)/.test(commitSrc), 'F1 COMMIT acquires a script lock');
ok(commitSrc.indexOf('setProperty(TEMP_R6F2G_MIGRATION_STORE_KEY_') < commitSrc.indexOf('targets.forEach(function (t) { sh.getRange'), 'F2 rollback token stored BEFORE the first business-cell mutation');
ok(/targets\.length !== 5[\s\S]{0,80}REFUSED_TARGET_COUNT_NOT_5/.test(commitSrc), 'F3 fail-closed unless exactly five target cells');
ok(!/deleteRow|insertRow|appendRow|deleteRows|clearContent/.test(commitSrc), 'F4 COMMIT never inserts/deletes/clears a row');
ok(/COMMITTED_UNVERIFIED/.test(commitSrc) && /NO automatic retry/.test(commitSrc), 'F5 partial/uncertain → COMMITTED_UNVERIFIED, no auto-retry');
ok(/pre2\.verdict !== 'READY/.test(commitSrc), 'F6 preflight gate re-run under the lock (live-drift refuses)');

section('F. consolidated validator: pre-migration RECONCILIATION_REQUIRED, post-migration FROZEN_SCOPE_VALIDATED');
var scV = scenario();
eq(scV.sb.s.TEMP_R6F2G_VALIDATE_K2_ID_LINEAGE_MIGRATION().verdict, 'RECONCILIATION_REQUIRED', 'F7 pre-migration live shape (SADL- ids) → RECONCILIATION_REQUIRED');
// migrated live shape: lines carry the frozen SADL-K2 ids + header calc-run set
var migratedLines = scV.token.expected_line_ids_sorted.map(function (id, i) { return { allocation_draft_line_id: id, allocation_draft_id: HID, sku: 'SKU' + i, site_sku: 'S' + i, window_code: 'W1', line_status: '' }; });
var sbV = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj({ calculation_run_id: GAP_RUN_ID })]), shipping_allocation_draft_lines: matrix(LINE_COLS, migratedLines) }, props: {} });
var tokV = buildToken(sbV, oldLineRows(OLD_IDS)); // frozen expected ids identical (same sku/site/window natural keys)
sbV.props[sbV.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokV); sbV.props.GAP_JOB_INVENTORY = gapProp();
var vv = sbV.s.TEMP_R6F2G_VALIDATE_K2_ID_LINEAGE_MIGRATION();
eq(vv.verdict, 'FROZEN_SCOPE_VALIDATED', 'F8 migrated live shape (SADL-K2 ids + lineage + K2 route + checksums) → FROZEN_SCOPE_VALIDATED');
eq(vv.gates.route_complete_k2, true, 'F8 K2 logical marketplace destination counts as route-complete (generic warehouse metric untouched)');
eq(vv.gates.calc_run_lineage, true, 'F8 authoritative calculation_run_id lineage gate satisfied');

done_report();
function done_report() { console.log('\n' + '-'.repeat(40)); console.log('R6F2G K2 ID+LINEAGE REMEDIATION: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
