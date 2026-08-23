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
function resolver(propVal, cycle, harvestSda) {
  var PropertiesService = { getScriptProperties: function () { return { getProperty: function () { return propVal; } }; } };
  var f = new Function('PropertiesService', lineageSrc + '\nreturn weeklyAiPlanResolveGapRunLineage_;');
  // R6F2G2 — the harvest arg carries a DELIBERATELY DIFFERENT sourceDataAsOf to prove the resolver IGNORES it.
  return f(PropertiesService)(cycle, { sourceDataAsOf: harvestSda !== undefined ? harvestSda : 'HARVEST-IGNORED-2099-01-01' }, { formulaVersion: 'WEEKLY_AI_PLAN_V1' });
}
var doneRun = JSON.stringify({ product: 'INVENTORY', runId: 'GAP-INV-2026-08-0001', status: 'DONE', planningCycle: 'RECO-2026-08', finishedAt: '2026-08-23T13:41:00Z', calculationDate: '2026-08-23' });
var rOk = resolver(doneRun, 'RECO-2026-08');
eq(rOk.ok, true, 'C1 DONE GAP-INV run, cycle match → ok');
eq(rOk.calculation_run_id, 'GAP-INV-2026-08-0001', 'C1 raw GAP-INV run id reaches calculation_run_id');
eq(rOk.formula_version, 'WEEKLY_AI_PLAN_V1', 'C1 formula_version carried from the request authority');
eq(rOk.source_data_as_of, '2026-08-23', 'C1 source_data_as_of = GAP calculationDate (input cutoff), NOT the harvest value');
eq(rOk.calculated_at, '2026-08-23T13:41:00Z', 'C1 calculated_at = GAP finishedAt (completion timestamp)');
ok(rOk.source_data_as_of !== rOk.calculated_at, 'C1 source_data_as_of and calculated_at are semantically DISTINCT');
ok(rOk.source_data_as_of !== 'HARVEST-IGNORED-2099-01-01', 'C1b the harvest sourceDataAsOf is IGNORED (adapter cannot drive it)');
// blank calculationDate → BLOCK before write (never a silent blank, never current time)
eq(resolver(JSON.stringify({ product: 'INVENTORY', runId: 'GAP-INV-2', status: 'DONE', planningCycle: 'RECO-2026-08', finishedAt: '2026-08-23T13:41:00Z', calculationDate: '' }), 'RECO-2026-08').reason, 'LINEAGE_SOURCE_DATA_AS_OF_UNAVAILABLE', 'C1c blank calculationDate cutoff → BLOCK LINEAGE_SOURCE_DATA_AS_OF_UNAVAILABLE');
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
    Utilities: { getUuid: function () { return 'uuid'; }, formatDate: function (date, tz, pattern) {
      var offMin = (tz === 'Asia/Taipei') ? 480 : 0;                 // deterministic tz-aware format (Apps Script does the real tz)
      var d = new Date(date.getTime() + offMin * 60000);
      function p(n) { return (n < 10 ? '0' : '') + n; }
      var s = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
      return pattern === 'yyyy-MM-dd' ? s : s + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
    } },
    JSON: JSON, Math: Math, String: String, Number: Number, Array: Array, Object: Object, Date: Date, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp
  };
  sandbox.global = sandbox; vm.createContext(sandbox);
  vm.runInContext(SAD_ID_HELPERS + '\n' + TEMP, sandbox, { filename: 'R6F2G-sandbox' });
  // deterministic checksum guards (the live-guard computation itself is tested elsewhere; here we isolate the R6F2G gates)
  sandbox.TEMP_r6f2eComputeLiveGuards_ = function () { return { unrelated_scope_active_row_checksum: '62b84b14', legacy_header_checksum: '8a51b860' }; };
  // R6F2G2 — source_data_as_of authority = GAP_JOB_INVENTORY.calculationDate (set via gapProp), NOT the harvest.
  return { s: sandbox, logs: logs, props: props, sheets: sheets };
}
var GAP_CUTOFF = '2026-08-23', GAP_CALC_AT = '2026-08-23T13:41:00Z';   // calculationDate (cutoff) vs finishedAt (completion) — DISTINCT
function lineageHeaderOver() { return { calculation_run_id: GAP_RUN_ID, formula_version: 'WEEKLY_AI_PLAN_V1', calculated_at: GAP_CALC_AT, source_data_as_of: GAP_CUTOFF }; }
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
// R6F2G2 — the GAP job persists BOTH finishedAt (completion) and calculationDate (frozen input cutoff = the
// source_data_as_of authority). `gap.noCutoff` omits calculationDate to prove the fail-closed path; `gap.cutoff`
// overrides it to prove the checksum tracks source_data_as_of.
function gapProp(gap) {
  gap = gap || {};
  var o = { product: 'INVENTORY', runId: GAP_RUN_ID, status: 'DONE', planningCycle: 'RECO-2026-08', finishedAt: GAP_CALC_AT };
  if (!gap.noCutoff) o.calculationDate = gap.cutoff || GAP_CUTOFF;
  return JSON.stringify(o);
}
function scenario(extraSheets, headerOver, sbOpts) {
  var lr = oldLineRows(OLD_IDS);
  var sheets = { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj(headerOver)]), shipping_allocation_draft_lines: matrix(LINE_COLS, lr) };
  if (extraSheets) Object.keys(extraSheets).forEach(function (k) { sheets[k] = extraSheets[k]; });
  var o = { sheets: sheets, props: {} }; if (sbOpts) Object.keys(sbOpts).forEach(function (k) { o[k] = sbOpts[k]; });
  var sb = makeSb(o);
  var token = buildToken(sb, lr);
  sb.props[sb.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(token);
  sb.props.GAP_JOB_INVENTORY = gapProp(sbOpts && sbOpts.gap);
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

section('E. DRY_RUN is read-only + prints the plan checksum; confirmation now carries the reviewed checksum');
var dry = sc.sb.s.TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_DRY_RUN();
eq(dry.verdict, 'DRY_RUN_READY', 'E1 dry-run ready');
eq(dry.line_id_cell_update_count, 5, 'E1 five id-cell updates planned');
eq(dry.R6F2G_ZERO_WRITE_CONFIRMED, 'YES (read-only)', 'E1 dry-run writes nothing');
// R6F2G3 — the confirmation constant is now the USER-reviewed checksum, so status reports SET (no longer PLACEHOLDER).
eq(dry.confirmation_constant_status, 'SET', 'E1 confirmation constant is SET (USER-reviewed checksum), COMMIT still gated on plan-checksum equality');
ok(/TEMP_R6F2G_CONFIRMED_MIGRATION_CHECKSUM_ = '7c86deb0';/.test(TEMP), 'E2 confirmation checksum constant set to the reviewed 7c86deb0 in the file');
ok(/=== 'PASTE_MIGRATION_PLAN_CHECKSUM_HERE'/.test(TEMP), 'E2 the COMMIT refusal guard still checks the placeholder sentinel (staged-OFF safety preserved)');

section('E. COMMIT refuses while the confirmation constant is the placeholder sentinel (zero write)');
var scC = scenario();
scC.sb.s.TEMP_R6F2G_CONFIRMED_MIGRATION_CHECKSUM_ = 'PASTE_MIGRATION_PLAN_CHECKSUM_HERE';   // exercise the placeholder-refusal path deterministically
var before = JSON.stringify(scC.sb.sheets.shipping_allocation_draft_lines._m());
var refused = scC.sb.s.TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_COMMIT();
eq(refused.verdict, 'REFUSED_CONFIRMATION_CHECKSUM_NOT_SET_OR_MISMATCH', 'E3 placeholder confirmation → COMMIT refuses');
eq(JSON.stringify(scC.sb.sheets.shipping_allocation_draft_lines._m()), before, 'E3 refused COMMIT wrote nothing');
ok(!scC.sb.props[scC.sb.s.TEMP_R6F2G_MIGRATION_STORE_KEY_], 'E3 no rollback token stored on refusal');

section('E. COMMIT behavior when confirmation matches the plan checksum (in-test override)');
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
eq(rb.line_id_cells.map(function (c) { return c.old_line_id; }).sort(), OLD_IDS.slice().sort(), 'E6 rollback token captured the OLD ids (stored BEFORE the id cells were overwritten)');
var hdrRow = scX.sb.sheets.shipping_allocation_drafts._m()[1];
eq(hdrRow[HDR_COLS.indexOf('calculation_run_id')], GAP_RUN_ID, 'E7 header calculation_run_id set from the authoritative GAP-INV run id');
eq(hdrRow[HDR_COLS.indexOf('formula_version')], 'WEEKLY_AI_PLAN_V1', 'E7 header formula_version set');
eq(hdrRow[HDR_COLS.indexOf('calculated_at')], GAP_CALC_AT, 'E7 header calculated_at set from the GAP run timestamp');
eq(hdrRow[HDR_COLS.indexOf('source_data_as_of')], GAP_CUTOFF, 'E7 header source_data_as_of set from the GAP calculationDate cutoff authority');
eq(committed.lineage_fields_set.calculation_run_id, true, 'E7 all four lineage fields reported set');
eq(committed.lineage_fields_set.source_data_as_of, true, 'E7 source_data_as_of reported set');

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
var sbV = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj(lineageHeaderOver())]), shipping_allocation_draft_lines: matrix(LINE_COLS, migratedLines) }, props: {} });
var tokV = buildToken(sbV, oldLineRows(OLD_IDS)); // frozen expected ids identical (same sku/site/window natural keys)
sbV.props[sbV.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokV); sbV.props.GAP_JOB_INVENTORY = gapProp();
var vv = sbV.s.TEMP_R6F2G_VALIDATE_K2_ID_LINEAGE_MIGRATION();
eq(vv.verdict, 'FROZEN_SCOPE_VALIDATED', 'F8 migrated live shape (SADL-K2 ids + lineage + K2 route + checksums) → FROZEN_SCOPE_VALIDATED');
eq(vv.gates.route_complete_k2, true, 'F8 K2 logical marketplace destination counts as route-complete (generic warehouse metric untouched)');
eq(vv.gates.calc_run_lineage, true, 'F8 authoritative calculation_run_id lineage gate satisfied');
eq(vv.gates.formula_version_lineage, true, 'F8 formula_version lineage gate satisfied');
eq(vv.gates.calculated_at_lineage, true, 'F8 calculated_at lineage gate satisfied');
eq(vv.gates.source_data_as_of_lineage, true, 'F8 source_data_as_of lineage gate satisfied');

// ================================================================================================================
// R6F2G1 — LINEAGE-PLAN COMPLETENESS (checksum binds all four lineage fields; canonical authorities; rollback preview)
section('R6F2G1 A. checksum binds the complete field set (old 1c42330d bound only header+mappings)');
var scG1 = scenario();
var planG1 = scG1.sb.s.TEMP_r6f2gBuildMigrationPlan_(scG1.token);
eq(planG1.canonical_field_order.length, 9, 'A1 checksum canonical order has all nine field groups');
ok(planG1.canonical_field_order.indexOf('four lineage OLD') !== -1 && planG1.canonical_field_order.indexOf('four lineage NEW') !== -1, 'A1 four-field lineage bound (old+new)');
ok(planG1.canonical_field_order.indexOf('legacy checksum') !== -1 && planG1.canonical_field_order.indexOf('unrelated-scope checksum') !== -1 && planG1.canonical_field_order.indexOf('frozen/token checksum') !== -1, 'A1 frozen/legacy/unrelated checksums bound');
eq(planG1.migration_plan_checksum === '1c42330d', false, 'A2 the checksum is NOT the incomplete 1c42330d');

section('R6F2G1 B. canonical lineage authorities');
eq(planG1.lineage.fields.calculated_at.new, GAP_CALC_AT, 'B1 calculated_at authority = GAP run finishedAt (completion)');
ok(/finishedAt/i.test(planG1.lineage.fields.calculated_at.source), 'B1 calculated_at source = finishedAt (documented)');
eq(planG1.lineage.fields.source_data_as_of.new, GAP_CUTOFF, 'B2 source_data_as_of authority = GAP calculationDate (input cutoff), not harvest');
ok(/calculationDate/i.test(planG1.lineage.fields.source_data_as_of.source), 'B2 source_data_as_of source = GAP_JOB_INVENTORY.calculationDate (documented, not harvest)');
ok(planG1.lineage.fields.source_data_as_of.new !== planG1.lineage.fields.calculated_at.new, 'B2 source_data_as_of (cutoff DATE) is DISTINCT from calculated_at (completion TIMESTAMP)');
eq(planG1.lineage.source_data_as_of_authority, 'GAP_JOB_INVENTORY.calculationDate', 'B2 authority label frozen');
eq(planG1.lineage_complete, true, 'B3 all four authorities resolvable → complete');

section('R6F2G1 C. checksum changes on any lineage-field OR mapping change');
// change source_data_as_of authority (GAP calculationDate cutoff) → different checksum
var scG1b = scenario(null, null, { gap: { cutoff: '2026-08-09' } });
ok(scG1b.sb.s.TEMP_r6f2gBuildMigrationPlan_(scG1b.token).migration_plan_checksum !== planG1.migration_plan_checksum, 'C1 changing source_data_as_of (GAP calculationDate) changes the checksum');
// change a line mapping (different sku → different K2 new id) → different checksum
var lrAlt = oldLineRows(OLD_IDS); lrAlt[0].sku = 'DIFFERENT';
var sbAlt = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj()]), shipping_allocation_draft_lines: matrix(LINE_COLS, lrAlt) }, props: {} });
var tokAlt = buildToken(sbAlt, lrAlt); sbAlt.props[sbAlt.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokAlt); sbAlt.props.GAP_JOB_INVENTORY = gapProp();
ok(sbAlt.s.TEMP_r6f2gBuildMigrationPlan_(tokAlt).migration_plan_checksum !== planG1.migration_plan_checksum, 'C2 changing a line mapping changes the checksum');
// change a lineage OLD value (header already carries a calc_run) → different checksum
var scG1c = scenario(null, { calculation_run_id: 'GAP-INV-PRESET' });
ok(scG1c.sb.s.TEMP_r6f2gBuildMigrationPlan_(scG1c.token).migration_plan_checksum !== planG1.migration_plan_checksum, 'C3 changing a lineage OLD value changes the checksum');

section('R6F2G1 D. full dry-run contract');
var dG1 = scG1.sb.s.TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_DRY_RUN();
eq(dG1.verdict, 'DRY_RUN_READY', 'D1 complete plan → DRY_RUN_READY');
eq(dG1.id_mappings.length, 5, 'D1 all five id mappings present');
eq(Object.keys(dG1.header_lineage_updates).length, 4, 'D1 all four lineage fields in header_lineage_updates');
ok('old' in dG1.header_lineage_updates.source_data_as_of && 'new' in dG1.header_lineage_updates.source_data_as_of && 'source' in dG1.header_lineage_updates.source_data_as_of, 'D1 each lineage field has old/new/source');
eq(dG1.db_row_counts.unchanged, true, 'D1 before/after row counts unchanged');
eq(dG1.mutates_business_table, false, 'D1 dry-run mutates nothing');
eq(dG1.header_lineage_cell_update_count, 4, 'D1 header_lineage_cell_update_count = 4 (all four lineage cells blank→set)');
eq(dG1.total_business_cell_update_count, 9, 'D1 total_business_cell_update_count = 9 (5 line ids + 4 lineage cells)');
eq(dG1.rollback_evidence_written_before_first_business_mutation, 'YES', 'D1 rollback-evidence-before-mutation asserted');
ok(dG1.rollback_property_key === scG1.sb.s.TEMP_R6F2G_MIGRATION_STORE_KEY_, 'D1 rollback_property_key exposed');

section('R6F2G1 E. rollback token preview contract');
var rbp = dG1.rollback_token_preview;
eq(rbp.version, 'R6F2G-ROLLBACK-1', 'E1 rollback version');
eq(rbp.header_id, HID, 'E1 header id');
eq(rbp.line_id_before_after.length, 5, 'E1 five old/new id pairs');
eq(Object.keys(rbp.lineage_before).length, 4, 'E1 all four lineage before-values captured');
ok(rbp.lineage_before.source_data_as_of === '' , 'E1 lineage before-values are the current (blank) header values');
ok(!!rbp.legacy_checksum && !!rbp.unrelated_scope_checksum && !!rbp.integrity_checksum, 'E1 legacy/unrelated/integrity checksums in the preview');

section('R6F2G1 F. incomplete lineage HALTs dry-run and blocks COMMIT (no silent blank)');
var scNoHarvest = scenario(null, null, { gap: { noCutoff: true } });   // GAP run has no calculationDate → cutoff authority unavailable
var planNo = scNoHarvest.sb.s.TEMP_r6f2gBuildMigrationPlan_(scNoHarvest.token);
eq(planNo.lineage_complete, false, 'F1 missing GAP calculationDate → lineage NOT complete');
ok(planNo.lineage_missing.indexOf('source_data_as_of') !== -1, 'F1 source_data_as_of reported missing');
eq(scNoHarvest.sb.s.TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_DRY_RUN().verdict, 'DRY_RUN_INCOMPLETE', 'F2 incomplete lineage → DRY_RUN_INCOMPLETE (not READY)');
eq(scNoHarvest.sb.s.TEMP_R6F2G_PREFLIGHT_K2_ID_LINEAGE_REMEDIATION().verdict, 'NOT_READY_GATES_UNMET', 'F3 incomplete lineage → preflight NOT READY');
// even with confirmation set, COMMIT refuses before any mutation
scNoHarvest.sb.s.TEMP_R6F2G_CONFIRMED_MIGRATION_CHECKSUM_ = planNo.migration_plan_checksum;
var beforeNo = JSON.stringify(scNoHarvest.sb.sheets.shipping_allocation_draft_lines._m());
var refNo = scNoHarvest.sb.s.TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_COMMIT();
eq(refNo.verdict, 'REFUSED_LINEAGE_AUTHORITY_UNAVAILABLE', 'F4 incomplete lineage → COMMIT refuses before mutation');
eq(JSON.stringify(scNoHarvest.sb.sheets.shipping_allocation_draft_lines._m()), beforeNo, 'F4 refused COMMIT wrote nothing');

section('R6F2G1 G. COMMIT fail-closed source contract (before-drift · rollback read-back · lineage gate)');
var commitSrc2 = extractFn(TEMP, 'TEMP_R6F2G_MIGRATE_K2_ID_LINEAGE_COMMIT');
ok(/REFUSED_LINEAGE_AUTHORITY_UNAVAILABLE/.test(commitSrc2), 'G1 COMMIT refuses when lineage authority unavailable');
ok(/REFUSED_LINEAGE_BEFORE_DRIFT/.test(commitSrc2), 'G2 COMMIT refuses on lineage before-value drift');
ok(/REFUSED_ROLLBACK_TOKEN_NOT_DURABLE/.test(commitSrc2) && /integrity_checksum/.test(commitSrc2), 'G3 COMMIT reads the rollback token back and refuses if not durable');
ok(commitSrc2.indexOf('setProperty(TEMP_R6F2G_MIGRATION_STORE_KEY_') < commitSrc2.indexOf('targets.forEach(function (t) { sh.getRange'), 'G4 rollback stored before the first id-cell mutation');
ok(/put\(hcSda, F\.source_data_as_of\.new/.test(commitSrc2), 'G5 COMMIT writes source_data_as_of (all four lineage fields)');

section('R6F2G1 H. rollback token written by COMMIT carries all four lineage before-values');
eq(rb.lineage_before ? Object.keys(rb.lineage_before).length : 0, 4, 'H1 committed rollback token has all four lineage before-values');
eq(rb.integrity_checksum ? true : false, true, 'H1 committed rollback token carries an integrity checksum');

// ================================================================================================================
// R6F2G2 — source_data_as_of canonical authority (GAP calculationDate cutoff, distinct from finishedAt)
section('R6F2G2 A. current time is never used; production & migration share one authority');
ok(!/Date\.now|new Date|gapCalcNowMs_|Utilities\.formatDate/.test(lineageSrc), 'A1 production lineage resolver never reads a clock (reads persisted GAP run fields only)');
var gapSrc = extractFn(TEMP, 'TEMP_r6f2gGapLineage_');
ok(!/Date\.now|new Date/.test(gapSrc), 'A1 TEMP GAP-lineage helper never reads a clock');
// production resolver source_data_as_of == migration plan source_data_as_of for the SAME run
var scG2 = scenario();
var planG2 = scG2.sb.s.TEMP_r6f2gBuildMigrationPlan_(scG2.token);
eq(planG2.lineage.fields.source_data_as_of.new, rOk.source_data_as_of, 'A2 migration source_data_as_of == production resolver source_data_as_of (same GAP calculationDate authority)');
eq(planG2.lineage.fields.source_data_as_of.new, GAP_CUTOFF, 'A2 both resolve to the GAP run calculationDate cutoff');

section('R6F2G2 B. retired checksums stay invalid; reproducible without rerunning GAP');
ok(planG2.migration_plan_checksum !== '1c42330d' && planG2.migration_plan_checksum !== '250cde5f', 'B1 checksum is neither the retired 1c42330d nor 250cde5f');
// reproducible across repeated reads (no GAP rerun): same token+props → same source_data_as_of + same checksum
var planG2b = scG2.sb.s.TEMP_r6f2gBuildMigrationPlan_(scG2.token);
eq(planG2b.lineage.fields.source_data_as_of.new, planG2.lineage.fields.source_data_as_of.new, 'B2 source_data_as_of stable across repeated reads (no GAP rerun)');
eq(planG2b.migration_plan_checksum, planG2.migration_plan_checksum, 'B2 checksum stable across repeated reads');

section('R6F2G2 C. validator rejects an arbitrary nonblank source_data_as_of');
var wrongSda = scV.token.expected_line_ids_sorted.map(function (id, i) { return { allocation_draft_line_id: id, allocation_draft_id: HID, sku: 'SKU' + i, site_sku: 'S' + i, window_code: 'W1', line_status: '' }; });
var sbWrong = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj({ calculation_run_id: GAP_RUN_ID, formula_version: 'WEEKLY_AI_PLAN_V1', calculated_at: GAP_CALC_AT, source_data_as_of: '1999-01-01' })]), shipping_allocation_draft_lines: matrix(LINE_COLS, wrongSda) }, props: {} });
var tokWrong = buildToken(sbWrong, oldLineRows(OLD_IDS)); sbWrong.props[sbWrong.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokWrong); sbWrong.props.GAP_JOB_INVENTORY = gapProp();
var vWrong = sbWrong.s.TEMP_R6F2G_VALIDATE_K2_ID_LINEAGE_MIGRATION();
eq(vWrong.verdict, 'RECONCILIATION_REQUIRED', 'C1 arbitrary nonblank source_data_as_of (≠ GAP calculationDate) does NOT validate');
eq(vWrong.gates.source_data_as_of_lineage, false, 'C1 source_data_as_of gate fails when it differs from the canonical cutoff');

// ================================================================================================================
// R6F2G4 — canonical Date/timezone lineage normalization + stored-token validator false-positive fix
section('R6F2G4 A. canonical lineage normalizer (Date-vs-string safe; distinct concepts; fail-closed)');
var Snorm = makeSb({ sheets: {}, props: {} }).s;
var norm = Snorm.TEMP_r6f2gNormalizeLineage_;
// Date object calculated_at (a Taipei-midnight-plus-time) normalizes to yyyy-MM-dd HH:mm:ss
var dCalc = new Date(Date.UTC(2026, 7, 23, 5, 41, 0));   // 05:41 UTC == 13:41 Asia/Taipei
eq(norm('calculated_at', dCalc), '2026-08-23 13:41:00', 'A1 Date calculated_at → yyyy-MM-dd HH:mm:ss in Asia/Taipei');
// string calculated_at (space and ISO forms) normalize
eq(norm('calculated_at', '2026-08-23 13:41:00'), '2026-08-23 13:41:00', 'A2 string calculated_at (space) normalizes');
eq(norm('calculated_at', '2026-08-23T13:41:00Z'), '2026-08-23 13:41:00', 'A2 string calculated_at (ISO) normalizes');
// date-only Date object does not shift the day (Taipei midnight)
var dDay = new Date(Date.UTC(2026, 7, 22, 16, 0, 0));   // 2026-08-22 16:00 UTC == 2026-08-23 00:00 Asia/Taipei
eq(norm('source_data_as_of', dDay), '2026-08-23', 'A3 date-only Date → yyyy-MM-dd with NO day shift (Asia/Taipei)');
eq(norm('source_data_as_of', '2026-08-23'), '2026-08-23', 'A3 string source_data_as_of normalizes');
eq(norm('source_data_as_of', '2026-08-23 00:00:00'), '2026-08-23', 'A3 datetime string → date-only for source_data_as_of');
// fail-closed
eq(norm('source_data_as_of', ''), null, 'A4 blank → null (fail)');
eq(norm('calculated_at', ''), null, 'A4 blank → null (fail)');
eq(norm('source_data_as_of', 'not-a-date'), null, 'A4 arbitrary nonblank → null (never a pass)');
eq(norm('calculated_at', 'RANDOM'), null, 'A4 malformed calculated_at → null');
// distinct concepts: same instant normalizes to different granularity per field
ok(norm('calculated_at', '2026-08-23T13:41:00Z') !== norm('source_data_as_of', '2026-08-23T13:41:00Z'), 'A5 calculated_at (timestamp) and source_data_as_of (date) stay DISTINCT');
// field match: wrong value fails; correct matches
ok(Snorm.TEMP_r6f2gLineageFieldMatch_('source_data_as_of', dDay, '2026-08-23') === true, 'A6 Date cell == authority date (serialization-only) → match');
ok(Snorm.TEMP_r6f2gLineageFieldMatch_('source_data_as_of', dDay, '2026-08-24') === false, 'A6 wrong date → no match');
ok(Snorm.TEMP_r6f2gLineageFieldMatch_('calculated_at', dCalc, '2026-08-23 13:41:00') === true, 'A6 Date calculated_at == authority → match');
ok(Snorm.TEMP_r6f2gLineageFieldMatch_('calculated_at', dCalc, '2026-08-23 09:00:00') === false, 'A6 wrong timestamp → no match');

section('R6F2G4 B. validator passes when the committed header carries DATE cells (serialization-only)');
// migrated header with Date cells for the two lineage fields + string ids
var dateHdr = headerObj({ calculation_run_id: GAP_RUN_ID, formula_version: 'WEEKLY_AI_PLAN_V1', calculated_at: dCalc, source_data_as_of: dDay });
var migLines = null;   // built after token
var sbDate = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [dateHdr]), shipping_allocation_draft_lines: matrix(LINE_COLS, []) }, props: {} });
var tokDate = buildToken(sbDate, oldLineRows(OLD_IDS));
migLines = tokDate.expected_line_ids_sorted.map(function (id, i) { return { allocation_draft_line_id: id, allocation_draft_id: HID, sku: 'SKU' + i, site_sku: 'S' + i, window_code: 'W1', line_status: '' }; });
var sbDate2 = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [dateHdr]), shipping_allocation_draft_lines: matrix(LINE_COLS, migLines) }, props: {} });
var tokDate2 = buildToken(sbDate2, oldLineRows(OLD_IDS)); sbDate2.props[sbDate2.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokDate2); sbDate2.props.GAP_JOB_INVENTORY = gapProp();
var vDate = sbDate2.s.TEMP_r6f2gFrozenScopeValidated_(tokDate2);
eq(vDate.gates.calculated_at_lineage, true, 'B1 Date calculated_at cell now passes the lineage gate (normalized)');
eq(vDate.gates.source_data_as_of_lineage, true, 'B1 Date source_data_as_of cell now passes the lineage gate (no day shift)');
eq(vDate.verdict, 'FROZEN_SCOPE_VALIDATED', 'B2 full validator → FROZEN_SCOPE_VALIDATED with Date cells');

section('R6F2G4 C. stored-token validator cannot false-pass a wrong/missing date lineage');
// wrong calculated_at (a different timestamp) → RECONCILIATION_REQUIRED via the consolidated verdict
var wrongHdr = headerObj({ calculation_run_id: GAP_RUN_ID, formula_version: 'WEEKLY_AI_PLAN_V1', calculated_at: '2026-08-23 09:00:00', source_data_as_of: GAP_CUTOFF });
var sbWrongCa = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [wrongHdr]), shipping_allocation_draft_lines: matrix(LINE_COLS, migLines) }, props: {} });
var tokWrongCa = buildToken(sbWrongCa, oldLineRows(OLD_IDS)); sbWrongCa.props[sbWrongCa.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokWrongCa); sbWrongCa.props.GAP_JOB_INVENTORY = gapProp();
eq(sbWrongCa.s.TEMP_r6f2gFrozenScopeValidated_(tokWrongCa).gates.calculated_at_lineage, false, 'C1 wrong calculated_at → gate false');
var svWrong = sbWrongCa.s.TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE();
ok(svWrong.verdict !== 'FROZEN_SCOPE_VALIDATED', 'C2 stored-token validator NEVER false-passes a wrong date lineage (got ' + svWrong.verdict + ')');
// blank calculated_at (write-missing) → gate false
var missHdr = headerObj({ calculation_run_id: GAP_RUN_ID, formula_version: 'WEEKLY_AI_PLAN_V1', calculated_at: '', source_data_as_of: GAP_CUTOFF });
var sbMiss = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [missHdr]), shipping_allocation_draft_lines: matrix(LINE_COLS, migLines) }, props: {} });
var tokMiss = buildToken(sbMiss, oldLineRows(OLD_IDS)); sbMiss.props[sbMiss.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokMiss); sbMiss.props.GAP_JOB_INVENTORY = gapProp();
eq(sbMiss.s.TEMP_r6f2gFrozenScopeValidated_(tokMiss).gates.calculated_at_lineage, false, 'C3 blank calculated_at (write-missing) → gate false');
// source-fact: the stored-token validator now delegates to the consolidated validator (not only the older package)
var svSrc = extractFn(TEMP, 'TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE');
ok(/TEMP_r6f2gFrozenScopeValidated_\(token\)/.test(svSrc) && /out\.verdict = full\.verdict/.test(svSrc), 'C4 stored-token verdict comes from the consolidated four-lineage-gate validator');

section('R6F2G4 D. diagnostic classifies serialization-only + stays read-only');
var sbDiag = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [dateHdr]), shipping_allocation_draft_lines: matrix(LINE_COLS, migLines) }, props: {} });
var tokDiag = buildToken(sbDiag, oldLineRows(OLD_IDS)); sbDiag.props[sbDiag.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokDiag); sbDiag.props.GAP_JOB_INVENTORY = gapProp();
var diag = sbDiag.s.TEMP_R6F2G4_DIAGNOSE_POST_COMMIT_DATE_LINEAGE();
eq(diag.classification, 'DATE_SERIALIZATION_ONLY', 'D1 Date cells semantically equal after normalization → DATE_SERIALIZATION_ONLY');
eq(diag.calculated_at.instanceof_date, true, 'D1 calculated_at raw cell is a Date');
eq(diag.calculated_at.semantic_match, true, 'D1 calculated_at semantic match after normalization');
eq(diag.source_data_as_of.semantic_match, true, 'D1 source_data_as_of semantic match (no day shift)');
eq(diag.R6F2G4_ZERO_WRITE_CONFIRMED, 'YES (read-only, no cell mutation)', 'D2 diagnostic is read-only');
ok(/DATA_CORRECT/.test(diag.policy), 'D2 policy = fix validators/readback only (do not rewrite cells)');
// wrong value → VALUE_ACTUALLY_WRONG + HALT policy
var sbDiagW = makeSb({ sheets: { shipping_allocation_drafts: matrix(HDR_COLS, [headerObj({ calculation_run_id: GAP_RUN_ID, formula_version: 'WEEKLY_AI_PLAN_V1', calculated_at: '2026-08-23 09:00:00', source_data_as_of: GAP_CUTOFF })]), shipping_allocation_draft_lines: matrix(LINE_COLS, migLines) }, props: {} });
var tokDiagW = buildToken(sbDiagW, oldLineRows(OLD_IDS)); sbDiagW.props[sbDiagW.s.TEMP_R6F2E_STORE_PROP_KEY_] = JSON.stringify(tokDiagW); sbDiagW.props.GAP_JOB_INVENTORY = gapProp();
var diagW = sbDiagW.s.TEMP_R6F2G4_DIAGNOSE_POST_COMMIT_DATE_LINEAGE();
eq(diagW.classification, 'VALUE_ACTUALLY_WRONG', 'D3 a wrong timestamp → VALUE_ACTUALLY_WRONG');
ok(/HALT/.test(diagW.policy), 'D3 wrong value → HALT policy (no write/rollback)');

done_report();
function done_report() { console.log('\n' + '-'.repeat(40)); console.log('R6F2G K2 ID+LINEAGE REMEDIATION: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
