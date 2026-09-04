// R6F2G5 — K2 REUSE incorrectly classified as legacy-route reconciliation: root-cause proof + fix.
// F1-7N-FA-3C-DRAFT-MODEL-R6F2G5. Run: node assets/tests/inventory-k2-reuse-route-reconciliation-f1-7n-fa-3c-r6f2g5.test.js
//
// DEFECT (proven here): a GENUINE K2 shipment group uses a MARKETPLACE as its logical destination, so its persisted
// 30-col header row carries a BLANK recommended_destination_warehouse_id and has NO destination_marketplace column
// (destination_marketplace is not in SHIPPING_ALLOCATION_DRAFTS_HEADERS_). The K2 group resolver correctly REUSEs the
// row (group key matches), but the post-resolution legacy guard sadLegacyReconcileReason_ re-read the stored row and
// applied the GENERIC From+To+Method completeness rule — which the persisted header can only satisfy via a warehouse
// id — so it returned LEGACY_ROUTE_RECONCILIATION_REQUIRED with zero writes (exactly the live REUSE_UNVERIFIED).
// FIX: sadLegacyReconcileReason_ recognises a genuine K2 group by the row's stored id EQUALLING the deterministic hash
// of its OWN group dims (never the SADH-K2- prefix alone); an impostor / route-drifted SADH-K2- row is refused with a
// DISTINCT typed K2_ROUTE_RECONCILIATION_REQUIRED. Generic (non-K2) legacy behaviour is unchanged.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6F2G5 K2-REUSE-ROUTE-RECONCILIATION: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');

eval(G16.match(/var SAD_STATUSES_ = \{[\s\S]*?\};/)[0]);
eval(G16.match(/var SAD_RECOMMENDATION_FIELDS_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SAD_K2_HEADER_FP_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SAD_K2_LINE_FP_ = \[[\s\S]*?\];/)[0]);
eval(['sadFnv1a_', 'sadK2GroupKey_', 'sadK2DeterministicHeaderId_', 'sadK2ResolveActiveDraft_', 'sadDestinationIdentity_', 'sadHeaderRouteIsComplete_',
  'sadReadActiveHeaderRows_', 'sadResolveActiveDraft_', 'sadResolveActiveDraftK2OrK3_', 'sadRowToObject_',
  'sadLegacyReconcileReason_', 'sadReconcileMessage_', 'sadK2PayloadFingerprint_', 'sadFpVal_']
  .map(function (n) { return extractFn(G16, n); }).join('\n'));

// persisted 30-col header shape used by the mock sheet (mirrors SHIPPING_ALLOCATION_DRAFTS_HEADERS_ group dims;
// note: destination_marketplace is intentionally ABSENT — it is not a stored column).
var HDR = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'];
ok(HDR.indexOf('destination_marketplace') === -1, 'S0. destination_marketplace is NOT a persisted header column (root-cause precondition)');
ok(!/'destination_marketplace'/.test(G16.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\];/)[0]), 'S0. SHIPPING_ALLOCATION_DRAFTS_HEADERS_ has no destination_marketplace column');
function sheet(rows) { var data = [HDR].concat(rows.map(function (o) { return HDR.map(function (h) { return o[h] == null ? '' : o[h]; }); })); return { getDataRange: function () { return { getValues: function () { return data; } }; }, getLastColumn: function () { return HDR.length; }, getRange: function (r, c, nr, nc) { return { getValues: function () { return [data[r - 1]]; } }; } }; }
function foundAt(row) { return { row: row, col: function () { return 0; } }; }

// A genuine K2 shipment group whose LOGICAL destination is a marketplace (Amazon): blank warehouse destination.
var k2Route = { planning_cycle: 'RECO-2026-08', company: 'ResTW', country: 'JP', marketplace: 'Amazon',
  source_page: 'inventory_replenishment', recommended_source_warehouse_id: 'WH-TW-1', recommended_destination_warehouse_id: '',
  recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1' };
var k2Id = sadK2DeterministicHeaderId_(k2Route);
// STORED row = persisted columns only (no destination_marketplace), blank recommended_destination_warehouse_id.
var storedK2 = Object.assign({ allocation_draft_id: k2Id, status: 'draft' }, k2Route);
// INCOMING header (from KMWRR.buildGroupHeader) DOES carry destination_marketplace (route-complete for K2).
var incomingK2 = Object.assign({ destination_marketplace: 'Amazon' }, k2Route);

// ============================================================ A — ROOT CAUSE
section('A. root cause: generic completeness rule vs a marketplace-logical K2 destination');
ok(k2Id.indexOf('SADH-K2-') === 0, 'A0. deterministic K2 header id has SADH-K2- prefix');
// the stored row (blank warehouse dest, no destination_marketplace column) FAILS the generic From+To+Method rule...
eq(sadHeaderRouteIsComplete_(storedK2), false, 'A1. generic completeness rule reports the STORED K2 row as route-INCOMPLETE (the exact trigger)');
// ...yet the INCOMING header (carrying destination_marketplace) is route-complete, so the K2 path IS taken.
eq(sadHeaderRouteIsComplete_(incomingK2), true, 'A2. incoming K2 header (destination_marketplace present) is route-COMPLETE');
// the K2 group resolver therefore correctly REUSEs the frozen header (group key matches; delta 0/0 in the writer).
var rr = sadResolveActiveDraftK2OrK3_(sheet([storedK2]), incomingK2);
eq([rr.status, rr.k2, rr.id], ['REUSE', true, k2Id], 'A3. K2 group resolver → REUSE (k2:true) the frozen header — never K3');
// PRE-FIX the legacy guard would have fired LEGACY on this REUSE; POST-FIX it proceeds (this is the defect + the fix).
eq(sadLegacyReconcileReason_(sheet([storedK2]), foundAt(2), false), '', 'A4. FIX: legacy guard PROCEEDS for a genuine K2 group (no spurious LEGACY_ROUTE_RECONCILIATION_REQUIRED)');
// source-fact: the guard authority is the row\'s OWN deterministic id, not the prefix alone.
var guardFn = extractFn(G16, 'sadLegacyReconcileReason_');
ok(/sadK2DeterministicHeaderId_\(o\) === storedId/.test(guardFn), 'A5. guard authority = deterministic hash of the row\'s own K2 dims (not prefix alone)');
ok(/K2_ROUTE_RECONCILIATION_REQUIRED/.test(guardFn) && /LEGACY_ROUTE_RECONCILIATION_REQUIRED/.test(guardFn), 'A5. guard emits BOTH typed reasons');

// ============================================================ B — FIX CONTRACT (strict REUSE eligibility)
section('B. REUSE only for a self-consistent genuine K2 group; legacy protection preserved');
// 1 + 2: exact committed K2 fixture + logical Amazon (blank warehouse) destination → REUSE, guard proceeds.
eq(sadK2ResolveActiveDraft_([storedK2], incomingK2).status, 'REUSE', 'B1. exact committed K2 fixture → REUSE');
eq(sadLegacyReconcileReason_(sheet([storedK2]), foundAt(2), false), '', 'B2. logical Amazon destination with BLANK destination warehouse is a valid K2 (guard proceeds)');
eq(sadK2DeterministicHeaderId_(storedK2), k2Id, 'B2. stored K2 row regenerates its own id (self-consistent)');
// 3: wrong route dim → a DIFFERENT deterministic id → cannot REUSE the frozen header (resolves to CREATE, new group).
['marketplace', 'recommended_source_warehouse_id', 'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'].forEach(function (dim) {
  var wrong = Object.assign({ destination_marketplace: 'Amazon' }, k2Route); wrong[dim] = 'X-' + wrong[dim];
  ok(sadK2DeterministicHeaderId_(wrong) !== k2Id, 'B3. wrong ' + dim + ' → different deterministic K2 id (cannot reuse the frozen header)');
  eq(sadK2ResolveActiveDraft_([storedK2], wrong).status, 'CREATE', 'B3. wrong ' + dim + ' → resolver CREATE (a new group), never REUSE of the frozen row');
});
// 4: header-prefix-only impostor — stored id carries SADH-K2- but the row dims do NOT hash to it → distinct refusal.
var impostor = Object.assign({}, storedK2); impostor.recommended_shipping_method = 'AIR';   // id was minted from SEA
ok(sadK2DeterministicHeaderId_(impostor) !== k2Id, 'B4. impostor row dims do not regenerate its stored SADH-K2- id');
eq(sadLegacyReconcileReason_(sheet([impostor]), foundAt(2), false), 'K2_ROUTE_RECONCILIATION_REQUIRED', 'B4. header-prefix-only impostor → distinct typed K2_ROUTE_RECONCILIATION_REQUIRED (never silent reuse / heal)');
// 7: two legacy NOT_SAFE headers (no SADH-K2- prefix, route-incomplete) must STILL refuse — legacy protection intact.
var legacyA = { allocation_draft_id: 'SAD-LEG-A', status: 'draft', planning_cycle: 'RECO-2026-08', company: 'ResTW', country: 'JP', marketplace: 'Amazon', source_page: 'inventory_replenishment' };
var legacyB = { allocation_draft_id: 'SAD-LEG-B', status: 'draft', planning_cycle: 'RECO-2026-08', company: 'ResTW', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment' };
eq(sadLegacyReconcileReason_(sheet([legacyA]), foundAt(2), false), 'LEGACY_ROUTE_RECONCILIATION_REQUIRED', 'B7. legacy NOT_SAFE header A still refuses (unchanged)');
eq(sadLegacyReconcileReason_(sheet([legacyB]), foundAt(2), false), 'LEGACY_ROUTE_RECONCILIATION_REQUIRED', 'B7. legacy NOT_SAFE header B still refuses (unchanged)');
// allow_legacy_reconcile (explicit USER migration) still short-circuits to proceed.
eq(sadLegacyReconcileReason_(sheet([legacyA]), foundAt(2), true), '', 'B7. explicit USER migration (allowReconcile) still proceeds');
// 8: generic non-K2 behaviour unchanged — a route-complete generic row proceeds; an incomplete one refuses.
var genComplete = { allocation_draft_id: 'SAD-GEN-1', status: 'draft', recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: 'SEA' };
eq(sadLegacyReconcileReason_(sheet([genComplete]), foundAt(2), false), '', 'B8. generic route-complete row proceeds (unchanged)');
var genIncomplete = { allocation_draft_id: 'SAD-GEN-2', status: 'draft', recommended_source_warehouse_id: 'WH-CN' };
eq(sadLegacyReconcileReason_(sheet([genIncomplete]), foundAt(2), false), 'LEGACY_ROUTE_RECONCILIATION_REQUIRED', 'B8. generic route-incomplete row refuses (unchanged)');
// a physical-warehouse K2 header (non-blank dest) still proceeds (no regression for warehouse-destination K2).
var k2Wh = Object.assign({}, k2Route); k2Wh.recommended_destination_warehouse_id = 'WH-JP-FC';
var k2WhId = sadK2DeterministicHeaderId_(k2Wh); var storedK2Wh = Object.assign({ allocation_draft_id: k2WhId, status: 'draft' }, k2Wh);
eq(sadLegacyReconcileReason_(sheet([storedK2Wh]), foundAt(2), false), '', 'B8. physical-warehouse K2 header still proceeds (no regression)');

// ============================================================ C — TYPED, OBSERVABLE REASONS
section('C. typed observable reasons (no blind retry / no auto overwrite-heal)');
ok(/K2 identity mismatch/.test(sadReconcileMessage_('K2_ROUTE_RECONCILIATION_REQUIRED')) && /never auto-healed or overwritten/.test(sadReconcileMessage_('K2_ROUTE_RECONCILIATION_REQUIRED')), 'C1. K2 mismatch message is distinct + states never auto-healed/overwritten');
ok(/incomplete route/.test(sadReconcileMessage_('LEGACY_ROUTE_RECONCILIATION_REQUIRED')), 'C2. legacy message states incomplete route');
ok(sadReconcileMessage_('K2_ROUTE_RECONCILIATION_REQUIRED') !== sadReconcileMessage_('LEGACY_ROUTE_RECONCILIATION_REQUIRED'), 'C3. the two reasons produce DISTINCT messages');
// both atomic + manual BLOCK sites surface the typed reason via data.reason / data.status.
var atomicCore = extractFn(G16, 'sadSchemaGenerationColumns_') + '\n' + extractFn(G16, 'sadSupportedSchemaVersions_') + '\n' + extractFn(G16, 'sadAiK2IntentEvidence_', 'sadResolveHeaderSchema_') + '\n' + extractFn(G16, 'sadDraftsSchemaReason_') + '\n' + extractFn(G16, 'sadAtomicUpsertCore_');
ok(/sadReconcileMessage_\(legR\)/.test(atomicCore) && /data: \{ reason: legR, existing_id: id \}/.test(atomicCore), 'C4. atomic core surfaces the typed reason (data.reason) + reason-typed message');
var manualCore = extractFn(G16, 'sadUpsertDraftHeaderCore_');
ok(/sadReconcileMessage_\(legR\)/.test(manualCore) && /data: \{ status: legR, existing_id: id \}/.test(manualCore), 'C4. manual core surfaces the typed reason (data.status) + reason-typed message');

// ============================================================ D — REUSE = ZERO WRITE + comprehensive gate (TEMP)
section('D. zero-write REUSE + comprehensive frozen-scope gate');
// 9: an unchanged payload → equal fingerprint → the atomic writer\'s REUSE branch (zero_write), never insert/update/delete.
var lineD9 = [{ sku: 'S1', site_sku: 'S1-JP', window_code: 'W1', recommended_qty: 10, planned_qty: 10 }];
var fpA = sadK2PayloadFingerprint_(storedK2, lineD9);
eq(fpA, sadK2PayloadFingerprint_(JSON.parse(JSON.stringify(storedK2)), JSON.parse(JSON.stringify(lineD9))), 'D9. unchanged payload → equal fingerprint (REUSE = zero write)');
ok(fpA !== sadK2PayloadFingerprint_(storedK2, [{ sku: 'S1', site_sku: 'S1-JP', window_code: 'W1', recommended_qty: 99, planned_qty: 99 }]), 'D9. changed line qty → different fingerprint (REGENERATE, not silent REUSE)');
ok(/priorFp === incFp[\s\S]*?reused: true[\s\S]*?zero_write: true/.test(atomicCore), 'D9. atomic REUSE branch returns reused + zero_write (no insert/update/delete)');
// 5 + 6: missing/unexpected line + lineage mismatch are refused by the comprehensive frozen-scope validator (TEMP).
var validatorFn = extractFn(TEMP, 'TEMP_r6f2gFrozenScopeValidated_');
ok(/no_missing: st\.missing_line_ids\.length === 0/.test(validatorFn) && /no_unexpected: st\.unexpected_line_ids\.length === 0/.test(validatorFn), 'D5. frozen-scope validator gates missing + unexpected lines');
ok(/no_orphan: st\.orphan_lines === 0/.test(validatorFn) && /no_dup: st\.dup_line_id === 0 && st\.dup_k2 === 0/.test(validatorFn), 'D5. validator gates orphan + duplicate rows');
ok(/five_k2_lines: st\.matched_line_ids\.length === token\.expected_k2_line_count/.test(validatorFn) && /fk_ok: st\.line_fk_ok === true/.test(validatorFn), 'D5. validator gates exact five K2 line ids + FKs');
ok(/calculation_run_id_lineage: lineageOk\('calculation_run_id'\)/.test(validatorFn) && /formula_version_lineage: lineageOk\('formula_version'\)/.test(validatorFn) && /calculated_at_lineage: lineageOk\('calculated_at'\)/.test(validatorFn) && /source_data_as_of_lineage: lineageOk\('source_data_as_of'\)/.test(validatorFn), 'D6. validator gates all four lineage fields');
ok(/unrelated_match:/.test(validatorFn) && /legacy_match:/.test(validatorFn), 'D6. validator gates unrelated + legacy checksums unchanged');
ok(/route_complete_k2: st\.route_complete_k2 === true/.test(validatorFn), 'D6. validator gates route_complete_k2 (the STORED K2 route is complete — independent of the generic warehouse rule)');
ok(/verdict: validated \? 'FROZEN_SCOPE_VALIDATED' : 'RECONCILIATION_REQUIRED'/.test(validatorFn), 'D6. validator verdict is all-gates-pass FROZEN_SCOPE_VALIDATED else RECONCILIATION_REQUIRED');

done();
