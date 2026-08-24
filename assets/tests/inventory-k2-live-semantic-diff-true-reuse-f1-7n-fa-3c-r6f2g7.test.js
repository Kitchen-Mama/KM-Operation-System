// R6F2G7 — expose the live stored-vs-incoming semantic diff + make TRUE_REUSE reachable without weakening change detection.
// F1-7N-FA-3C-DRAFT-MODEL-R6F2G7. Run: node assets/tests/inventory-k2-live-semantic-diff-true-reuse-f1-7n-fa-3c-r6f2g7.test.js
//
// The R6F2G6 fix normalized dates/numbers but the live retry STILL regenerated: the KMWRR incoming header omits `status`
// (writer defaults it) and the lines carry no `line_status` (in the FP but never patched by regeneration). These
// lifecycle/audit fields — which the payload authority never emits — are the remaining false negative. R6F2G7 excludes
// them + treats a blank incoming as "preserved/no-change" (blank≠zero, blank≠false), matches lines by K2 identity with
// exact membership, and keeps every business field strict; a read-only diagnostic reconstructs the real incoming payload
// and exposes the field-by-field diff so classification is based on actual live evaluation, never gate presence.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6F2G7 LIVE-SEMANTIC-DIFF: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');

var LOAD = [];
['SAD_K2_HEADER_FP_', 'SAD_K2_LINE_FP_', 'SAD_K2_FP_DATE_FIELDS_', 'SAD_K2_FP_NUMERIC_FIELDS_', 'SAD_K2_SEM_CONTRACT_', 'SAD_K2_SEM_EXCLUDE_'].forEach(function (n) { LOAD.push(G16.match(new RegExp('var ' + n + ' = [\\[{\'][\\s\\S]*?[\\]}\'];'))[0]); });
['sadFnv1a_', 'sadFpVal_', 'sadCanonDate_', 'sadFpNorm_', 'sadK2LineIdentity_', 'sadK2SemFieldEqual_', 'sadK2SemanticPayloadEqual_'].forEach(function (n) { LOAD.push(extractFn(G16, n)); });
// pure TEMP helpers (fingerprint/type/diff/checksum) + their deps
['TEMP_r5bHash_', 'TEMP_r5bIdFingerprint_', 'TEMP_isDate_', 'TEMP_r5bTypeOf_', 'TEMP_str_', 'TEMP_r6f2g7SafeVal_', 'TEMP_r6f2g7Type_', 'TEMP_r6f2g7Category_', 'TEMP_r6f2g7FieldRec_', 'TEMP_r6f2g7BuildDiff_', 'TEMP_r6f2g7SemChecksum_'].forEach(function (n) { LOAD.push(extractFn(TEMP, n)); });
LOAD.push(extractFn(TEMP, 'TEMP_r6f2gReuseVerdict_'));
eval(LOAD.join('\n'));

function D(iso) { return new Date(iso); }
// live-shaped STORED payload (Sheets: Date cells, numbers, lifecycle status/line_status present).
var storedHdr = { status: 'draft', recommended_source_warehouse_id: 'WH-TW', recommended_destination_warehouse_id: '', recommended_source_warehouse_code_snapshot: '', recommended_destination_warehouse_code_snapshot: '', recommendation_group_no: 1, recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA' };
var storedLines = [{ sku: 'KM-001', site_sku: 'B00AAA111', window_code: 'W1', window_start_date: D('2026-08-23T00:00:00+08:00'), window_end_date: D('2026-08-30T00:00:00+08:00'), required_by_date: D('2026-09-01T00:00:00+08:00'), recommended_qty: 100, planned_qty: 100, source_warehouse_id: 'WH-TW', units_per_carton: 20, route_no: '', line_status: 'active', regular_demand_snapshot: 12.5, calculated_gap_qty: 100, destination_stock_snapshot: 0 }];
// KMWRR-shaped INCOMING payload (no status, no line_status, date STRINGS, numbers; omits some persisted snapshots).
var incHdr = { recommended_source_warehouse_id: 'WH-TW', recommended_destination_warehouse_id: '', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1' };
var incLines = [{ sku: 'KM-001', site_sku: 'B00AAA111', window_code: 'W1', window_start_date: '2026-08-23', window_end_date: '2026-08-30', required_by_date: '2026-09-01', recommended_qty: 100, planned_qty: 100, source_warehouse_id: 'WH-TW', units_per_carton: 20, regular_demand_snapshot: 12.5, calculated_gap_qty: 100 }];

// ============================================================ 1 — live-shaped representations evaluate correctly
section('1. representation-correct field equality');
eq(sadK2SemFieldEqual_('window_start_date', D('2026-08-23T00:00:00+08:00'), '2026-08-23'), true, '1. Date cell vs date string → equal');
eq(sadK2SemFieldEqual_('recommended_qty', 100, '100'), true, '1. number vs numeric string → equal');
eq(sadK2SemFieldEqual_('recommendation_group_no', 1, '1'), true, '1. numeric group_no representation → equal');
eq(sadK2SemFieldEqual_('status', 'draft', undefined), true, '1. status excluded → equal even when incoming omits it');
eq(sadK2SemFieldEqual_('line_status', 'active', undefined), true, '1. line_status excluded (never patched by regeneration) → equal');
eq(sadK2SemFieldEqual_('destination_stock_snapshot', 0, ''), true, '1. blank incoming for a persisted snapshot → preserved (no change)');

// ============================================================ 2 — the EXACT current fixture predicts REUSED
section('2. exact fixture → semantic_equal true (predicts REUSED)');
eq(sadK2SemanticPayloadEqual_(storedHdr, storedLines, incHdr, incLines), true, '2. live stored (Date/status/line_status) vs KMWRR incoming → semantic_equal TRUE → predicts REUSED (was the live false negative)');

// ============================================================ 3 — diagnostic exposes the exact false-negative fields
section('3. diagnostic field-by-field diff');
var diff = TEMP_r6f2g7BuildDiff_(storedHdr, storedLines, incHdr, incLines);
var statusRec = diff.header_fields.filter(function (f) { return f.field === 'status'; })[0];
eq([statusRec.equal, statusRec.category], [true, 'AUDIT_FIELD_SHOULD_NOT_BE_IN_PAYLOAD'], '3. header `status` exposed as AUDIT_FIELD_SHOULD_NOT_BE_IN_PAYLOAD (the false-negative source)');
var lsRec = diff.line_diffs[0].fields.filter(function (f) { return f.field === 'line_status'; })[0];
eq(lsRec.category, 'AUDIT_FIELD_SHOULD_NOT_BE_IN_PAYLOAD', '3. line `line_status` exposed as AUDIT_FIELD_SHOULD_NOT_BE_IN_PAYLOAD');
var dateRec = diff.line_diffs[0].fields.filter(function (f) { return f.field === 'window_start_date'; })[0];
eq([dateRec.equal, dateRec.category], [true, 'DATE_REPRESENTATION_ONLY'], '3. Date-cell vs string classified DATE_REPRESENTATION_ONLY');
var snapRec = diff.line_diffs[0].fields.filter(function (f) { return f.field === 'destination_stock_snapshot'; })[0];
eq(snapRec.category, 'BLANK_VS_DEFAULT_EQUIVALENT', '3. omitted incoming snapshot classified BLANK_VS_DEFAULT_EQUIVALENT (preserved)');
eq([diff.diff_count, diff.true_business_diff_count], [0, 0], '3. zero diffs / zero true-business diffs for the exact fixture');
// confidential SKU/site_sku are fingerprinted, never cleartext
ok(/^len/.test(String(TEMP_r6f2g7SafeVal_('sku', 'KM-001'))) && String(TEMP_r6f2g7SafeVal_('sku', 'KM-001')).indexOf('KM-001') === -1, '3. sku value is fingerprinted, not logged cleartext');

// ============================================================ 4 — diagnostic cannot claim TRUE_REUSE_READY when comparator false
section('4. classification bound to the comparator');
var ldFn = extractFn(TEMP, 'TEMP_r6f2g7LiveSemanticDiff_');
ok(/sadK2SemanticPayloadEqual_\(stored\.header, stored\.lines, inc\.header, inc\.lines\)/.test(ldFn), '4. live diff computes semantic_equal via the SAME comparator');
ok(/semEqual \? 'LIVE_SEMANTIC_EQUAL_TRUE_REUSE_READY' : 'LIVE_SEMANTIC_DIFF_REGENERATION_WOULD_OCCUR'/.test(ldFn), '4. TRUE_REUSE_READY is reachable ONLY when the comparator returns true');
var g6 = extractFn(TEMP, 'TEMP_R6F2G6_DIAGNOSE_TRUE_ZERO_WRITE_REUSE');
ok(/TEMP_r6f2g7LiveSemanticDiff_\(token\)/.test(g6) && !/fixPresent \? 'TRUE_REUSE_ALREADY_NO_WRITE'/.test(g6), '4. R6F2G6 diagnostic no longer classifies from gate presence — uses the live evaluation');
// a genuine diff must classify DIFF (comparator false)
ok(sadK2SemanticPayloadEqual_(storedHdr, storedLines, incHdr, [Object.assign({}, incLines[0], { planned_qty: 150 })]) === false, '4. a changed payload → comparator false → would classify LIVE_SEMANTIC_DIFF (never READY)');

// ============================================================ 5 — blank vs zero / blank vs false stay different where business-relevant
section('5. blank≠zero, blank≠false');
eq(sadK2SemFieldEqual_('destination_stock_snapshot', '', '0'), false, '5. stored blank vs incoming provided 0 → NOT equal (blank≠zero)');
eq(sadK2SemFieldEqual_('recommendation_flags', '', 'false'), false, '5. stored blank vs incoming provided "false" → NOT equal (blank≠false)');
eq(sadK2SemFieldEqual_('recommended_qty', '5', '0'), false, '5. 5 vs 0 → NOT equal (genuine numeric difference)');

// ============================================================ 6 — genuine business changes still regenerate
section('6. genuine changes still regenerate');
eq(sadK2SemanticPayloadEqual_(storedHdr, storedLines, incHdr, [Object.assign({}, incLines[0], { planned_qty: 150 })]), false, '6. planned_qty change → not equal (regenerate)');
eq(sadK2SemanticPayloadEqual_(storedHdr, storedLines, incHdr, [Object.assign({}, incLines[0], { window_start_date: '2026-08-24' })]), false, '6. window date change → not equal');
eq(sadK2SemanticPayloadEqual_(storedHdr, storedLines, Object.assign({}, incHdr, { recommended_shipping_method: 'AIR' }), incLines), false, '6. route method change → not equal');
eq(sadK2SemanticPayloadEqual_(storedHdr, storedLines, incHdr, [Object.assign({}, incLines[0], { sku: 'KM-999' })]), false, '6. SKU change → identity membership differs → not equal');

// ============================================================ 7 — missing / extra line refuses
section('7. membership exact');
eq(sadK2SemanticPayloadEqual_(storedHdr, storedLines, incHdr, incLines.concat([{ sku: 'KM-002', site_sku: 'B00BBB', window_code: 'W1', recommended_qty: 5, planned_qty: 5 }])), false, '7. extra distinct-identity line → not equal');
eq(sadK2SemanticPayloadEqual_(storedHdr, storedLines, incHdr, []), false, '7. missing line → not equal');
var missDiff = TEMP_r6f2g7BuildDiff_(storedHdr, storedLines, incHdr, []);
ok(missDiff.line_diffs.some(function (l) { return l.category === 'MISSING_OR_EXTRA_LINE'; }), '7. diff reports MISSING_OR_EXTRA_LINE');

// ============================================================ 8 — semantic REUSE returns before every Sheets mutation
section('8. before-write return');
var core = extractFn(G16, 'sadAtomicUpsertCore_');
var reuseIdx = core.indexOf('reused: true'), regenIdx = core.indexOf("outcome = 'REGENERATE'"), uaIdx = core.indexOf("setCol('updated_at'");
ok(/priorFp === incFp \|\| sadK2SemanticPayloadEqual_\(/.test(core), '8. atomic REUSE gate uses sadK2SemanticPayloadEqual_');
ok(reuseIdx !== -1 && reuseIdx < regenIdx && (uaIdx === -1 || reuseIdx < uaIdx), '8. the zero-write REUSE return precedes REGENERATE + any updated_at write');
ok(/reuse_basis: \(priorFp === incFp \? 'FINGERPRINT_EQUAL' : 'SEMANTIC_EQUIVALENT@' \+ SAD_K2_SEM_CONTRACT_\)/.test(core), '8. reuse_basis carries the exact semantic-contract version');

// ============================================================ 9 — strict verifier still rejects REGENERATED + delta 0
section('9. strict verifier');
eq(TEMP_r6f2gReuseVerdict_(true, { REGENERATED: 1 }, true, true, true).verdict, 'REUSE_UNVERIFIED', '9. REGENERATED + delta0 + content-same → REUSE_UNVERIFIED (unchanged)');
eq(TEMP_r6f2gReuseVerdict_(true, { REUSED: 1 }, true, true, true).verdict, 'REUSED', '9. only-REUSED + content-same → REUSED');

// ============================================================ 10 — generic/manual unchanged
section('10. generic/manual unchanged');
var mano = extractFn(G16, 'sadUpsertDraftHeaderCore_');
ok(!/sadK2SemanticPayloadEqual_/.test(mano), '10. generic/manual header core does not use the K2 semantic comparator');
ok(/function sadK2PayloadFingerprint_/.test(G16) && /sadFnv1a_\(h \+ '\|\|' \+ ls\.join\('\|\|'\)\)/.test(G16), '10. the raw payload fingerprint formula is unchanged');

// ============================================================ G — preflight authorization gate (source-facts)
section('G. preflight may_run gate');
var pf = extractFn(TEMP, 'TEMP_R6F2G7_PREFLIGHT_TRUE_ZERO_WRITE_REUSE');
ok(/may_run_reuse_verifier = !!\(frozenOk && semEqual && diffCount === 0 && predicted === 'REUSED' && fiveLine\)/.test(pf), 'G. may_run_reuse_verifier requires frozen + semantic_equal + diff0 + predicted REUSED + exact five-line membership');
ok(/reconstructs the incoming payload without the atomic writer/.test(extractFn(TEMP, 'TEMP_R6F2G7_DIAGNOSE_LIVE_K2_SEMANTIC_DIFF')) || /R6F2G7_ZERO_WRITE_CONFIRMED/.test(extractFn(TEMP, 'TEMP_R6F2G7_DIAGNOSE_LIVE_K2_SEMANTIC_DIFF')), 'G. live diagnostic is declared read-only (no atomic-writer call)');
var recon = extractFn(TEMP, 'TEMP_r6f2g7ReconstructIncoming_');
ok(/weeklyAiPlanHarvest_/.test(recon) && /KMWRR\.buildK2GenerationPlan/.test(recon) && !/handleUpsertShippingAllocationDraftAtomic_/.test(recon), 'G. reconstruction uses harvest→KMWRR and NEVER calls the atomic writer');
ok(/LIVE_COMPARISON_UNAVAILABLE/.test(ldFn) && /NOT_BUNDLED/.test(recon), 'G. unavailable reconstruction → LIVE_COMPARISON_UNAVAILABLE (never a false READY)');

// ============================================================ H — truthful audit history (no rollback)
section('H. audit history');
ok(/draft_version_reached: 3/.test(TEMP) && /2026-08-23 22:08:57/.test(TEMP) && /never rolled back or rewritten/.test(TEMP), 'H. two prior in-place regenerations recorded truthfully (draft_version 3; 22:08:57 Taipei); not rolled back');

done();
