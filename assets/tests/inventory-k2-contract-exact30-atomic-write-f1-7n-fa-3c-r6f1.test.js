// Kitchen Mama Operation System — R6F1 exact-30 schema + K2 shipment-group CONTRACT + atomic Header/Lines write +
// read-only empty-header tools + exact-30 validator. F1-7N-FA-3C-DRAFT-MODEL-R6F1.
// Run: node assets/tests/inventory-k2-contract-exact30-atomic-write-f1-7n-fa-3c-r6f1.test.js
//
// Exercises the REAL PURE helpers extracted+eval'd from the NON-bundled 16_ handler + the TEMP diagnostic, the REAL
// 30/30 schema constants (16_ + the bundled production-writer core), source-structure contracts, and the exact live
// schema hash. NO live DB. Preserves the frozen three-flag posture. K2 LIVE generation is NOT activated (contract only).

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6F1 EXACT30 + K2 CONTRACT + ATOMIC (F1-7N-FA-3C-R6F1): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var ROUTER = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '01_router.gs'), 'utf8').replace(/\r\n/g, '\n');
var PW = fs.readFileSync(path.join(ROOT, 'js', 'core', 'supply-planning-production-writer.js'), 'utf8').replace(/\r\n/g, '\n');
var CONFIG = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');

// ---- bring the REAL constants + pure helpers into scope --------------------------------------------------------
eval(G16.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SAD_STATUSES_ = \{[\s\S]*?\};/)[0]);
eval(G16.match(/var SAD_LINE_LEGACY_ALIASES_ = \{[\s\S]*?\};/)[0]);
eval(G16.match(/var SAD_RECOMMENDATION_FIELDS_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SAD_K2_GROUP_DIMENSIONS_ = \[[\s\S]*?\];/)[0]);
eval(['sadFnv1a_', 'sadLineNaturalKey_', 'sadApplyLineAliases_', 'sadDeterministicLineId_',
  'sadK2GroupKey_', 'sadK2DeterministicHeaderId_', 'sadK2LineNaturalKey_', 'sadK2DeterministicLineId_',
  'sadK2ResolveActiveDraft_', 'sadK2LinesRouteCompatibleWithHeader_', 'sadK2PartitionLinesIntoGroups_',
  'sadLineIsComplete_', 'sadDestinationIdentity_', 'sadHeaderRouteIsComplete_', 'sadExactSchemaReason_', 'sadAtomicValidateBatch_']
  .map(function (n) { return extractFn(G16, n); }).join('\n'));

// djb2('|') — the repository's exact live-schema fingerprint (as used by the live diagnostics).
function djb2(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }

// ============================================================ A — exact 30/30 schema, canonical live order + hash
section('A. exact 30-col line schema == live production (djb2| = e4880646); accidental 31st field removed');
ok(SHIPPING_ALLOCATION_DRAFTS_HEADERS_.length === 30, 'A1. header = 30 cols');
ok(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.length === 30, 'A2. line = 30 cols (exact live)');
eq(djb2(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.join('|')), 'e4880646', 'A3. line schema djb2("|") == the verified live production hash e4880646');
ok(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.indexOf('source_allocated_qty_snapshot') < 0, 'A4. accidental 31st field source_allocated_qty_snapshot is REMOVED');
// canonical position: source_warehouse_id/code sit immediately after recommended_qty, before planned_qty
(function () {
  var L = SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_;
  ok(L.indexOf('source_warehouse_id') === L.indexOf('recommended_qty') + 1, 'A5. source_warehouse_id is directly after recommended_qty');
  ok(L.indexOf('source_warehouse_code_snapshot') === L.indexOf('source_warehouse_id') + 1, 'A5. source_warehouse_code_snapshot follows source_warehouse_id');
  ok(L.indexOf('planned_qty') === L.indexOf('source_warehouse_code_snapshot') + 1, 'A5. planned_qty follows the per-source pair (live order)');
})();
// the bundled production-writer core mirrors the exact 30-col line + validates it EXACT (no trailing-extra tolerance)
ok(/'source_warehouse_id', 'source_warehouse_code_snapshot',\s*\n\s*'planned_qty'/.test(PW), 'A6. production-writer DRAFT_HEADERS.WEEKLY_SHIPPING.lines uses the live order');
ok(!/'source_allocated_qty_snapshot'/.test(PW), 'A6. production-writer no longer lists source_allocated_qty_snapshot as a schema column');
// rule 9: the drift is fixed AT THE AUTHORITY (A6) — the phantom column can never be written; EXACT order-sensitive
// enforcement is delivered by the runtime validator (I1) + the atomic write gate (F1). The write-gate keeps ALLOW ONLY
// for the canonical DECLARED additive contract (KMPR.LINE_ADDITIVE_HEADERS = user_edited/user_edited_by), not the drift.
ok(/KMPR\.LINE_ADDITIVE_HEADERS/.test(PW) && /DECLARED line-additive/.test(PW), 'A7. write-gate ALLOW is documented as the canonical declared-additive contract; exactness is at the authority + validator + atomic gate (rule 9)');

// ============================================================ K2 CONTRACT — key / ids / resolve / guard / split
section('B. K2 group key = the frozen 10 dimensions (route context on the header)');
eq(SAD_K2_GROUP_DIMENSIONS_, ['planning_cycle', 'company', 'country', 'marketplace', 'source_page',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_shipping_method',
  'recommended_last_mile_delivery', 'recommendation_group_no'], 'B1. the 10 K2 dimensions in frozen order');
var hA = { planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inventory_replenishment',
  recommended_source_warehouse_id: 'WH-A', recommended_destination_warehouse_id: 'WH-Z', recommended_shipping_method: 'SEA',
  recommended_last_mile_delivery: 'FBA', recommendation_group_no: 'G1' };
var hA2 = { planning_cycle: 'RECO-2026-08', company: 'km', country: 'us', marketplace: 'amz', source_page: 'inventory_replenishment',
  source_warehouse_id: 'WH-A', destination_warehouse_id: 'WH-Z', shipping_method: 'sea', last_mile_delivery: 'fba', recommendation_group_no: 'g1' };
eq(sadK2GroupKey_(hA), sadK2GroupKey_(hA2), 'B2. key accepts recommended_* OR short aliases; case/whitespace-insensitive');
var hMethodB = JSON.parse(JSON.stringify(hA)); hMethodB.recommended_shipping_method = 'AIR';
ok(sadK2GroupKey_(hA) !== sadK2GroupKey_(hMethodB), 'B3. a different shipping method => a different group key');

section('C. deterministic ids (stable; group vs SKU+window grain)');
ok(/^SADH-K2-[0-9A-F]{8}$/.test(sadK2DeterministicHeaderId_(hA)), 'C1. header id shape SADH-K2-<8 hex upper>');
ok(sadK2DeterministicHeaderId_(hA) === sadK2DeterministicHeaderId_(hA2), 'C1. same shipment group => same header id (stable)');
ok(sadK2DeterministicHeaderId_(hA) !== sadK2DeterministicHeaderId_(hMethodB), 'C1. different route => different header id');
var lK = { sku: 'SKU1', site_sku: 'SS1', window_code: 'W1', source_warehouse_id: 'WH-A', route_no: '1' };
var lK2 = { sku: 'SKU1', site_sku: 'SS1', window_code: 'W1', source_warehouse_id: 'WH-B', route_no: '9' };
ok(/^SADL-K2-[0-9A-F]{8}$/.test(sadK2DeterministicLineId_('D1', lK)), 'C2. K2 line id shape SADL-K2-<8 hex upper>');
ok(sadK2DeterministicLineId_('D1', lK) === sadK2DeterministicLineId_('D1', lK2), 'C2. K2 line id ignores source/route (SKU+window grain — source is a HEADER dim under K2)');
ok(sadK2DeterministicLineId_('D1', lK) !== sadK2DeterministicLineId_('D1', { sku: 'SKU2', site_sku: 'SS1', window_code: 'W1' }), 'C2. different SKU => different K2 line id');

section('D. CREATE / REUSE / CONFLICT over the K2 group key');
var rowsNone = [{ allocation_draft_id: 'X', status: 'cancelled', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inventory_replenishment', recommended_source_warehouse_id: 'WH-A', recommended_destination_warehouse_id: 'WH-Z', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: 'G1' }];
var rCreate = sadK2ResolveActiveDraft_(rowsNone, hA);
eq(rCreate.status, 'CREATE', 'D1. 0 ACTIVE match (only a cancelled row) => CREATE');
eq(rCreate.allocation_draft_id, sadK2DeterministicHeaderId_(hA), 'D1. CREATE returns the deterministic header id');
var rowsOne = [{ allocation_draft_id: 'H1', status: 'draft', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inventory_replenishment', recommended_source_warehouse_id: 'WH-A', recommended_destination_warehouse_id: 'WH-Z', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: 'G1' }];
eq(sadK2ResolveActiveDraft_(rowsOne, hA).status, 'REUSE', 'D2. 1 ACTIVE match => REUSE');
eq(sadK2ResolveActiveDraft_(rowsOne, hA).allocation_draft_id, 'H1', 'D2. REUSE returns the existing id');
var rowsTwo = rowsOne.concat([{ allocation_draft_id: 'H2', status: 'site_confirmed', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inventory_replenishment', recommended_source_warehouse_id: 'WH-A', recommended_destination_warehouse_id: 'WH-Z', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: 'G1' }]);
var rConf = sadK2ResolveActiveDraft_(rowsTwo, hA);
eq(rConf.status, 'BLOCKED_CONFLICT', 'D3. >1 ACTIVE match => BLOCKED_CONFLICT');
eq(rConf.conflictIds, ['H1', 'H2'], 'D3. conflict returns all colliding ids (zero mutation)');

section('E. incompatible-route guard + split/regroup');
var gOk = sadK2LinesRouteCompatibleWithHeader_(hA, [{ sku: 'A', source_warehouse_id: 'WH-A' }, { sku: 'B' /* omits => inherits */ }]);
ok(gOk.compatible === true && gOk.violations.length === 0, 'E1. lines matching (or omitting) route dims are compatible');
var gBad = sadK2LinesRouteCompatibleWithHeader_(hA, [{ sku: 'A', source_warehouse_id: 'WH-A' }, { sku: 'C', shipping_method: 'AIR' }]);
ok(gBad.compatible === false && gBad.violations.length === 1 && gBad.violations[0].field === 'shipping_method', 'E2. a line with an incompatible route dim => violation (a header never holds incompatible-route lines)');
var groups = sadK2PartitionLinesIntoGroups_({ planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inventory_replenishment' },
  [{ sku: 'A', source_warehouse_id: 'WH-A', destination_warehouse_id: 'WH-Z', shipping_method: 'SEA', last_mile_delivery: 'FBA', recommendation_group_no: 'G1' },
   { sku: 'B', source_warehouse_id: 'WH-A', destination_warehouse_id: 'WH-Z', shipping_method: 'SEA', last_mile_delivery: 'FBA', recommendation_group_no: 'G1' },
   { sku: 'C', source_warehouse_id: 'WH-B', destination_warehouse_id: 'WH-Z', shipping_method: 'AIR', last_mile_delivery: 'FBA', recommendation_group_no: 'G1' }]);
eq(groups.length, 2, 'E3. split/regroup: 3 lines over 2 distinct routes => 2 K2 Header buckets');
eq([groups[0].lines.length, groups[1].lines.length], [2, 1], 'E3. lines land under their own route bucket (2 + 1)');
ok(groups[0].allocation_draft_id !== groups[1].allocation_draft_id, 'E3. each bucket gets its own deterministic header id (never merged)');

// ============================================================ C — atomic Header/Lines write safety
section('F. atomic write: exact-schema reason + pre-write batch validation (zero-write on any failure)');
function fakeSheet(headers) { return { getDataRange: function () { return { getValues: function () { return [headers.slice()]; } }; } }; }
eq(sadExactSchemaReason_(fakeSheet(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_), SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_), '', 'F1. exact 30-col sheet => no reason (valid)');
ok(sadExactSchemaReason_(fakeSheet(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.concat(['source_allocated_qty_snapshot'])), SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_).indexOf('COL_COUNT_31') >= 0, 'F1. a 31st trailing column FAILS closed (rule 9 — no tolerance)');
var reorder = SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.slice(); reorder[20] = 'planned_qty'; reorder[22] = 'source_warehouse_id';
ok(sadExactSchemaReason_(fakeSheet(reorder), SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_).indexOf('COL20') >= 0, 'F1. a reordered column FAILS closed (order-sensitive)');
var vOk = sadAtomicValidateBatch_({ recommended_source_warehouse_id: 'WH-A', recommended_destination_warehouse_id: 'WH-Z', recommended_shipping_method: 'SEA' }, [{ sku: 'A', planned_qty: 5 }], false);
ok(vOk.ok === true && vOk.lines.length === 1, 'F2. complete header + complete line => ok');
var vHdr = sadAtomicValidateBatch_({ recommended_source_warehouse_id: 'WH-A' /* no To/Method */ }, [{ sku: 'A', planned_qty: 5 }], false);
ok(vHdr.ok === false && vHdr.stage === 'header' && /PLAN_HEADER_INCOMPLETE/.test(vHdr.error), 'F2. partial route => PLAN_HEADER_INCOMPLETE (zero write)');
var vLine = sadAtomicValidateBatch_({}, [{ sku: 'A', planned_qty: 0 }], false);
ok(vLine.ok === false && vLine.stage === 'lines' && /PLAN_LINE_INCOMPLETE/.test(vLine.error), 'F2. Qty<=0 manual line => PLAN_LINE_INCOMPLETE');
var vDup = sadAtomicValidateBatch_({}, [{ sku: 'A', site_sku: 'S', window_code: 'W', planned_qty: 5 }, { sku: 'A', site_sku: 'S', window_code: 'W', planned_qty: 7 }], false);
ok(vDup.ok === false && /DUPLICATE_LINE_IN_BATCH/.test(vDup.error), 'F2. two lines with the same identity => DUPLICATE_LINE_IN_BATCH');
var vK2 = sadAtomicValidateBatch_({ recommended_source_warehouse_id: 'WH-A', recommended_destination_warehouse_id: 'WH-Z', recommended_shipping_method: 'SEA' }, [{ sku: 'A', planned_qty: 5, shipping_method: 'AIR' }], true);
ok(vK2.ok === false && vK2.stage === 'grouping' && /K2_ROUTE_INCOMPATIBLE/.test(vK2.error), 'F2. enforce_k2_grouping:true rejects an incompatible-route line');
var vK2off = sadAtomicValidateBatch_({ recommended_source_warehouse_id: 'WH-A', recommended_destination_warehouse_id: 'WH-Z', recommended_shipping_method: 'SEA' }, [{ sku: 'A', planned_qty: 5, shipping_method: 'AIR' }], false);
ok(vK2off.ok === true, 'F2. K2 guard is OFF by default (live K2 activation HALTed) — the same batch passes');

section('G. atomic write source contract: one lock, validate-before-write, compensation, no delete, routed');
ok(/function handleUpsertShippingAllocationDraftAtomic_\(body\)/.test(G16) && /LockService\.getScriptLock\(\)/.test(G16) && /tryLock\(30000\)/.test(G16), 'G1. atomic public handler wraps in ONE 30s ScriptLock');
var atomicCore = extractFn(G16, 'sadAtomicUpsertCore_');
ok(atomicCore.indexOf('sadExactSchemaReason_') >= 0 && atomicCore.indexOf('sadAtomicValidateBatch_') >= 0, 'G2. core validates BOTH schemas + the batch BEFORE any write');
ok(/COMMITTED_UNVERIFIED[\s\S]*compensated: true/.test(atomicCore) && /R6F1_ATOMIC_COMPENSATION_LINE_WRITE_FAILED/.test(atomicCore), 'G3. NEW-header + line failure => soft-cancel compensation + COMMITTED_UNVERIFIED');
ok(/RECONCILIATION_REQUIRED/.test(atomicCore), 'G3. EXISTING draft + line failure => RECONCILIATION_REQUIRED (fail closed)');
ok(atomicCore.indexOf('.deleteRow(') < 0 && atomicCore.indexOf('deleteRows(') < 0, 'G3. atomic core NEVER hard-deletes (compensation is soft-cancel)');
ok(/action === 'upsertShippingAllocationDraftAtomic'/.test(ROUTER) && /handleUpsertShippingAllocationDraftAtomic_\(body\)/.test(ROUTER), 'G4. atomic handler is routed (additive; legacy two-call path retained)');

// ============================================================ D — read-only empty-header tools + classifier
section('H. empty-header classifier + USER-gated cleanup tools');
eval(extractFn(TEMP, 'TEMP_str_'));
eval(extractFn(TEMP, 'TEMP_r5bHash_'));
eval(extractFn(TEMP, 'TEMP_r5bIdFingerprint_'));
eval(TEMP.match(/var TEMP_R6F1_ACTIVE_ = \{[\s\S]*?\};/)[0]);
eval(extractFn(TEMP, 'TEMP_r6f1ClassifyEmptyHeaders_'));
var H = { rows: [
  { allocation_draft_id: 'O1', planning_cycle: '', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', status: 'draft' },       // blank-cycle orphan
  { allocation_draft_id: 'M1', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', status: 'draft' },   // real cycle, no line => failed manual
  { allocation_draft_id: 'D1', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'JP', source_page: 'inv', status: 'draft' },    // dup active pair (both empty)
  { allocation_draft_id: 'D2', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'JP', source_page: 'inv', status: 'draft' },
  { allocation_draft_id: 'L1', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'DE', source_page: 'inv', status: 'draft' }     // has a line => NOT empty
] };
var L = { rows: [{ allocation_draft_id: 'L1', sku: 'S', line_status: 'draft' }] };
var cls = TEMP_r6f1ClassifyEmptyHeaders_(H, L);
eq(cls.count, 4, 'H1. 4 empty headers classified (L1 excluded — it has an active line)');
function byFp(id) { return cls.headers.filter(function (h) { return h.allocation_draft_id_fingerprint === TEMP_r5bIdFingerprint_(id); })[0]; }
eq(byFp('O1').classification, 'EMPTY_ORPHAN_SAFE_TO_CANCEL', 'H2. blank-cycle => EMPTY_ORPHAN_SAFE_TO_CANCEL');
eq(byFp('M1').classification, 'FAILED_MANUAL_HEADER_SAFE_TO_CANCEL', 'H2. real-cycle, no line => FAILED_MANUAL_HEADER_SAFE_TO_CANCEL');
eq(byFp('D1').classification, 'DUPLICATE_K3_ACTIVE_REVIEW', 'H2. >1 active header for the scope => DUPLICATE_K3_ACTIVE_REVIEW (NOT auto-cancel)');
ok(typeof cls.checksum === 'string' && cls.checksum.length === 8, 'H3. deterministic 8-hex classification checksum');
// tool presence + safety contract (source-level)
ok(/function TEMP_R6F1_DRY_RUN_RECONCILE_EMPTY_INVENTORY_HEADERS\(\)/.test(TEMP) && /function TEMP_R6F1_VALIDATE_RECONCILED_INVENTORY_HEADERS\(\)/.test(TEMP), 'H4. DRY_RUN + VALIDATE tools present');
var execFn = extractFn(TEMP, 'TEMP_R6F1_EXECUTE_RECONCILE_EMPTY_INVENTORY_HEADERS');
ok(/opts\.execute !== true/.test(execFn) && /CONFIRM_CHECKSUM_MISMATCH/.test(execFn), 'H5. EXECUTE is gated on execute:true AND confirmChecksum');
ok(execFn.indexOf('.deleteRow(') < 0 && execFn.indexOf('deleteRows(') < 0 && /setValue\('cancelled'\)/.test(execFn), 'H5. EXECUTE soft-cancels only — NEVER hard-deletes (audit preserved)');
ok(/st === 'cancelled' \|\| st === 'submitted'\) continue/.test(execFn), 'H5. EXECUTE never touches a terminal row');
var dryFn = extractFn(TEMP, 'TEMP_R6F1_DRY_RUN_RECONCILE_EMPTY_INVENTORY_HEADERS');
ok(dryFn.indexOf('.setValue(') < 0 && /R6F1_ZERO_WRITE_CONFIRMED/.test(dryFn), 'H6. DRY_RUN is read-only (zero write)');

// ============================================================ F — validator upgraded to exact-30 + K2 posture
section('I. validator: exact-30, K2 contract ready / live NOT activated, empty-header classification, zero-write');
var vf = extractFn(TEMP, 'TEMP_r6fValidateGroupModel_');
ok(/line_schema_exact_30:/.test(vf) && !/line_schema_exact_31:/.test(vf), 'I1. validator reports line_schema_exact_30 (not _31)');
ok(/K2_CONTRACT_AND_MACHINERY_READY: 'YES/.test(vf), 'I2. K2_CONTRACT_AND_MACHINERY_READY = YES');
ok(/K2_LIVE_GENERATION_ACTIVATED: 'NO/.test(vf), 'I2. K2_LIVE_GENERATION_ACTIVATED = NO');
ok(/K2_LIVE_GENERATION_NOT_ACTIVATED/.test(vf) && /route-derivation of shipping_method\/last_mile_delivery\/destination_warehouse_id\/recommendation_group_no/.test(vf), 'I3. the K2 route-derivation blocker names the 4 undof dims');
ok(/header_line_atomic_write_readiness:/.test(vf) && /handleUpsertShippingAllocationDraftAtomic_/.test(vf), 'I4. validator reports atomic write readiness');
ok(/empty_header_classification: emptyClass/.test(vf), 'I5. validator embeds the empty-header classification');
ok(/R6F_ZERO_WRITE_CONFIRMED/.test(vf) && vf.indexOf('.setValue(') < 0 && vf.indexOf('appendRow(') < 0, 'I6. validator remains zero-write');

// ============================================================ flags frozen; K2 live NOT activated
section('J. three flags frozen; INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ stays false');
ok(/var\s+REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=\s*true\s*;/.test(CONFIG), 'J1. flat V2 cutover = true');
ok(/var\s+REQUEST_ORDER_SITE_CONFIRM_REQUIRED_\s*=\s*false\s*;/.test(CONFIG), 'J2. site confirm = false');
ok(/var\s+INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false\s*;/.test(CONFIG), 'J3. inventory generation = false (K2 live activation HALTed; no live gen)');

done();
