// F1-7N-FA-4B1-FLOW-A-RELEASE-GATE-AND-LINEAGE-HARDENING
// Run: node assets/tests/flow-a-release-gate-lineage-hardening-f1-7n-fa-4b1.test.js
// Proves: marketplace physical(marketplace_seperate)/logical(marketplace) accessor + typed fail-closed release gate;
// Header MULTI vs line-real marketplace; route grouping authority; durable-journal + inserted-only rollback (plan write
// + draft-transition restore); idempotency durability; version/token gate; read-only schema/lineage preflight; and the
// TWO-LINEAGE model (planning/marketplace vs procurement/PO-supply) with shipment_line_allocations as the PO bridge.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('F1-7N-FA-4B1 RELEASE-GATE + LINEAGE: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function rd(p) { return fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', p), 'utf8').replace(/\r\n/g, '\n'); }
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

var GS11 = rd('11_shipping_plan_handlers.gs');
var GS16 = rd('16_shipping_allocation_handlers.gs');
var GS12 = rd('12_shipment_handlers.gs');
var GS32 = rd('32_shipment_line_allocation_handlers.gs');
var ROUTER = rd('01_router.gs');

// ---- eval the PURE 11_ helpers (accessor / normalize / remap / preflight core / rollback delete) -----------------
var LOAD = [];
LOAD.push(GS11.match(/var SP_LINE_MKT_LOGICAL_ = [^\n]*;/)[0]);
LOAD.push(GS11.match(/var SP_LINE_MKT_PHYSICAL_ALIAS_ = [^\n]*;/)[0]);
['shippingPlanFnv_', 'shippingPlanLineMktPhysicalCol_', 'shippingPlanNormalizeLineMkt_', 'shippingPlanApplyLineMktPhysical_',
  'shippingPlanDeleteRowsByColumn_', 'shippingPlanFlowAPreflightCore_'].forEach(function (n) { LOAD.push(extractFn(GS11, n)); });
eval(LOAD.join('\n'));

// minimal fake Sheet for the accessor + delete helpers (getLastColumn/getLastRow/getRange().getValues()/deleteRow).
function fakeSheet(headers, rows) {
  rows = rows || [];
  var data = [headers.slice()].concat(rows.map(function (r) { return headers.map(function (h) { return r[h] == null ? '' : r[h]; }); }));
  return {
    _name: 'fake',
    getName: function () { return this._name; },
    getLastColumn: function () { return headers.length; },
    getLastRow: function () { return data.length; },
    getRange: function (r, c, nr, nc) { return { getValues: function () { var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push(data[r - 1 + i][c - 1 + j]); out.push(row); } return out; } }; },
    deleteRow: function (n) { data.splice(n - 1, 1); }
  };
}

// ============================================================ A/B/K — physical/logical marketplace accessor
section('A/B/K. physical(marketplace_seperate)/logical(marketplace) accessor');
eq(SP_LINE_MKT_LOGICAL_, 'marketplace', 'A. logical application field = marketplace');
eq(SP_LINE_MKT_PHYSICAL_ALIAS_, 'marketplace_seperate', 'A. physical alias retained verbatim (misspelled, not spell-corrected)');
eq(shippingPlanLineMktPhysicalCol_(fakeSheet(['shipping_plan_line_id', 'marketplace', 'sku'])), 'marketplace', 'L5. a sheet with `marketplace` resolves to marketplace');
eq(shippingPlanLineMktPhysicalCol_(fakeSheet(['shipping_plan_line_id', 'marketplace_seperate', 'sku'])), 'marketplace_seperate', 'L5. a sheet with only `marketplace_seperate` resolves to the physical alias (no failure, no migration)');
eq(shippingPlanLineMktPhysicalCol_(fakeSheet(['shipping_plan_line_id', 'marketplace', 'marketplace_seperate'])), 'marketplace', 'L5. both present → logical `marketplace` wins (single accessor, deterministic)');
eq(shippingPlanLineMktPhysicalCol_(fakeSheet(['shipping_plan_line_id', 'sku'])), '', 'L21. neither present → "" (caller fails closed SCHEMA_MAPPING_REQUIRED)');

section('B. normalize + one-column remap (no duplicate marketplace columns)');
eq(shippingPlanNormalizeLineMkt_({ marketplace_seperate: 'Amazon' }).marketplace, 'Amazon', 'B. reader exposes logical marketplace from the physical alias');
eq(shippingPlanNormalizeLineMkt_({ marketplace: 'Amazon', marketplace_seperate: 'STALE' }).marketplace, 'Amazon', 'B. a real logical value is never overwritten by the alias');
var remapped = shippingPlanApplyLineMktPhysical_({ sku: 'X', marketplace: 'Walmart' }, 'marketplace_seperate');
ok(remapped.marketplace_seperate === 'Walmart' && !remapped.hasOwnProperty('marketplace'), 'L6. remap writes ONE physical column (marketplace_seperate) and never both');
var passthru = shippingPlanApplyLineMktPhysical_({ sku: 'X', marketplace: 'Walmart' }, 'marketplace');
ok(passthru.marketplace === 'Walmart' && !passthru.hasOwnProperty('marketplace_seperate'), 'L6. when physical col IS marketplace, no alias column is written');

// ============================================================ Header MULTI vs line-real marketplace
section('L1/L2/L3/L4. Header MULTI rule; line retains real marketplace, never MULTI');
ok(/distinctMk\.length === 1 \? distinctMk\[0\]/.test(GS11), 'L1. single distinct line marketplace → header = the actual marketplace');
ok(/distinctMk\.length >= 2 \? 'MULTI'/.test(GS11), 'L2. two+ distinct line marketplaces → header = MULTI');
ok(/marketplace: lineMk,\s*\/\/ the line's REAL marketplace \(never MULTI\)/.test(GS11), 'L3/L4. the plan line writes its own real marketplace (lineMk), never the MULTI header scope marker');
ok(/var headerMarketplace = distinctMk\.length/.test(GS11), 'L1/L2. header marketplace is DERIVED from the lines (not copied blindly)');

// ============================================================ C — shipping plan grouping authority
section('C/L7/L8. route grouping authority (physical compatibility, not marketplace)');
ok(/\[company, country, shipFrom, destination, method\]\.join\('\|\|'\)/.test(GS11), 'C/L7. group key = company+country+ship_from+destination+shipping_method (physical route) — conflicting routes → separate plans');
ok(/Group by the ROUTE key[\s\S]{0,80}NOT marketplace/.test(GS11), 'C/L8. marketplace is NOT part of the group key → compatible multi-marketplace lines CAN share one plan (header MULTI)');

// ============================================================ K — typed fail-closed release gate
section('K/L21. schema-mapping fail-closed before any write');
ok(/SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED/.test(GS11) && /zero_write: true, data: \{ required_one_of/.test(GS11), 'K/L21. neither marketplace column present → typed SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED (zero write) BEFORE any append');
ok(/prodRequireColumns_\(lineSheet, SHIPPING_PLAN_LINES_HEADERS_\.filter\(function \(h\) \{ return h !== SP_LINE_MKT_LOGICAL_/.test(GS11), 'K. the rigid gate validates every canonical column EXCEPT marketplace (marketplace via the accessor)');

// ============================================================ F/H — durable idempotency + version/token gate
section('F/L12/L14/L15. durable idempotency (persisted, not in-memory)');
ok(/submit_batch_id: submitBatchId/.test(GS11) && /String\(p\.submit_batch_id \|\| ''\)\.trim\(\) === providedKey/.test(GS11), 'L12. execution key is PERSISTED on shipping_plans.submit_batch_id and re-read from the sheet (survives a fresh execution)');
ok(/cls\.state === 'REUSED'[\s\S]{0,220}outcome: 'REUSED', reused: true/.test(GS11), 'L14. exact retry (same key + identical fingerprint) → REUSED, returns BEFORE any write (zero-write)');
ok(/cls\.state === 'CONFLICT'[\s\S]{0,160}SUBMIT_EXECUTION_DUPLICATE_CONFLICT[\s\S]{0,80}zero_write: true/.test(GS11), 'L15. same key + changed fingerprint → CONFLICT, zero write');
ok(/shippingPlanClassifyBatch_\(existingPlans, existingLines, providedKey, incomingFingerprint/.test(GS11), 'F. classify compares the COMPLETE canonical fingerprint of persisted rows (durable authority)');
section('H/L13/L20. version/token gate + no-duplicate-by-another-key');
ok(/reason: 'STALE_VERSION'[\s\S]{0,80}zero_write/.test(GS16) || /reason: 'STALE_VERSION'/.test(GS16), 'L20. a stale expected draft_version under the lock → typed STALE_VERSION, zero write');
ok(/SUBMIT_DRAFT_ALREADY_SUBMITTED'[\s\S]{0,60}code: 'CONFLICT'/.test(GS16), 'L13. already-submitted drafts under a DIFFERENT execution key → CONFLICT (cannot duplicate the same draft)');

// ============================================================ G — durable journal + inserted-only rollback
section('G/L16/L17/L19. durable journal + inserted-only rollback + restore');
ok(/PropertiesService\.getScriptProperties\(\)\.setProperty\(journalKey/.test(GS11) && /intended_plan_ids: wantPlanIds, intended_line_ids: wantLineIds/.test(GS11) && /integrity =/.test(GS11), 'G. durable journal binds exec key + fingerprint + intended plan/line ids + integrity checksum BEFORE the first append');
ok(GS11.indexOf("setProperty(journalKey") < GS11.indexOf('derivedHeaderObjs.forEach(function (h) { shippingPlanAppendByHeader_'), 'G. the durable journal is written BEFORE the first business mutation');
ok(/COMMIT_FAILED_ROLLED_BACK/.test(GS11) && /COMMIT_FAILED_ROLLBACK_UNVERIFIED/.test(GS11) && /shippingPlanRollbackBatch_\(ss, providedKey, wantPlanIds\)/.test(GS11), 'L16/L19. plan-write readback shortfall → inserted-only rollback → COMMIT_FAILED_ROLLED_BACK / _ROLLBACK_UNVERIFIED');
ok(GS11.indexOf('COMMITTED_UNVERIFIED') !== -1 ? /cls\.state === 'COMMITTED_UNVERIFIED'/.test(GS11) : true, 'G. COMMITTED_UNVERIFIED survives ONLY as an idempotency-classifier state (never a post-write terminal)');
ok(!/stage: 'readback', zero_write: false,\s*\n\s*data:[\s\S]{0,40}COMMITTED_UNVERIFIED/.test(GS11), 'G. the readback path no longer returns a COMMITTED_UNVERIFIED terminal');
ok(/POSTCHECK_FAILED_ROLLED_BACK/.test(GS16) && /POSTCHECK_FAILED_ROLLBACK_UNVERIFIED/.test(GS16), 'L17/L19. draft-transition failure → typed POSTCHECK_FAILED_ROLLED_BACK / _ROLLBACK_UNVERIFIED');
ok(/shippingPlanRollbackBatch_\(ss, execKey, planIds\)/.test(GS16) && /\['status', 'submitted_by', 'submitted_at', 'updated_by', 'updated_at', 'note'\]\.forEach/.test(GS16), 'L17. POSTCHECK failure restores ONLY the draft cells this execution changed AND removes the committed plan rows');
ok(/journalExtra: \{ affected_draft_ids: toTransition\.slice\(\), draft_before: draftBefore \}/.test(GS16), 'G. the affected draft ids + before-state are bound into the durable journal evidence');

section('L18. rollback is inserted-only — never removes a pre-existing / other-batch row');
var sheet = fakeSheet(['shipping_plan_id', 'submit_batch_id'], [
  { shipping_plan_id: 'SP-KEEP', submit_batch_id: 'OTHER' },
  { shipping_plan_id: 'SP-A', submit_batch_id: 'EXEC1' },
  { shipping_plan_id: 'SP-KEEP2', submit_batch_id: 'OTHER' },
  { shipping_plan_id: 'SP-B', submit_batch_id: 'EXEC1' }
]);
var removed = shippingPlanDeleteRowsByColumn_(sheet, 'shipping_plan_id', { 'SP-A': 1, 'SP-B': 1 });
eq(removed, 2, 'L18. deletes exactly the two inserted ids');
var remain = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().map(function (r) { return r[0]; });
eq(remain.sort(), ['SP-KEEP', 'SP-KEEP2'], 'L18. pre-existing (other-batch) rows are NEVER removed by rollback');

// ============================================================ I — read-only schema/lineage preflight
section('I/L22. read-only Flow A schema/lineage preflight verdicts');
var preClean = shippingPlanFlowAPreflightCore_({
  shipping_plans: { headers: ['shipping_plan_id', 'marketplace'], rows: [{ shipping_plan_id: 'SP1', marketplace: 'Amazon' }] },
  shipping_plan_lines: { headers: ['shipping_plan_line_id', 'shipping_plan_id', 'marketplace'], rows: [{ shipping_plan_line_id: 'L1', shipping_plan_id: 'SP1', marketplace: 'Amazon' }] },
  shipment_plan_links: { headers: [], rows: [], present: false },
  shipment_line_allocations: { headers: ['shipment_line_allocation_id', 'purchase_order_line_id'], rows: [], present: true }
});
eq(preClean.shipping_plan_lines.resolved_physical_marketplace_col, 'marketplace', 'L22. preflight resolves the physical marketplace column (marketplace)');
eq(preClean.shipping_plan_lines.every_line_retains_real_marketplace, true, 'L22. preflight confirms every line retains a real marketplace');
eq(preClean.schema_lineage_verdict, 'FLOW_A_SCHEMA_LINEAGE_READY', 'L22. a clean canonical sheet → FLOW_A_SCHEMA_LINEAGE_READY');
var preAlias = shippingPlanFlowAPreflightCore_({
  shipping_plans: { headers: ['shipping_plan_id', 'marketplace'], rows: [] },
  shipping_plan_lines: { headers: ['shipping_plan_line_id', 'shipping_plan_id', 'marketplace_seperate'], rows: [{ shipping_plan_line_id: 'L1', shipping_plan_id: 'SP1', marketplace_seperate: 'Amazon' }] },
  shipment_plan_links: { headers: [], rows: [], present: false },
  shipment_line_allocations: { headers: [], rows: [], present: true }
});
eq(preAlias.shipping_plan_lines.resolved_physical_marketplace_col, 'marketplace_seperate', 'L22. a live sheet with only marketplace_seperate resolves the physical alias');
eq(preAlias.physical_logical_marketplace_verdict, 'PHYSICAL_LOGICAL_ALIAS_REQUIRED', 'L22. verdict = PHYSICAL_LOGICAL_ALIAS_REQUIRED (accessor, not migration)');
var preMissing = shippingPlanFlowAPreflightCore_({
  shipping_plans: { headers: [], rows: [] },
  shipping_plan_lines: { headers: ['shipping_plan_line_id', 'shipping_plan_id', 'sku'], rows: [] },
  shipment_plan_links: { headers: [], rows: [], present: false },
  shipment_line_allocations: { headers: [], rows: [], present: false }
});
eq(preMissing.schema_lineage_verdict, 'SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED', 'L22. neither marketplace column → SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED');
var preMulti = shippingPlanFlowAPreflightCore_({
  shipping_plans: { headers: ['shipping_plan_id', 'marketplace'], rows: [{ shipping_plan_id: 'SP1', marketplace: 'MULTI' }] },
  shipping_plan_lines: { headers: ['shipping_plan_line_id', 'shipping_plan_id', 'marketplace'], rows: [{ shipping_plan_line_id: 'L1', shipping_plan_id: 'SP1', marketplace: 'MULTI' }] },
  shipment_plan_links: { headers: [], rows: [], present: false }, shipment_line_allocations: { headers: [], rows: [], present: true }
});
eq(preMulti.schema_lineage_verdict, 'LINE_MARKETPLACE_AMBIGUOUS', 'L22. a LINE storing MULTI is ambiguous → LINE_MARKETPLACE_AMBIGUOUS (a line must never be MULTI)');
ok(/present/.test(JSON.stringify(preClean.shipment_plan_links)) && /Header consolidation lineage/.test(preClean.shipment_plan_links.note), 'L9/L11. preflight reports shipment_plan_links as HEADER consolidation lineage (spec-only), never claims line-level qty from it');
ok(/PO-line SUPPLY bridge/.test(preClean.shipment_line_allocations.note), 'addendum. preflight labels shipment_line_allocations as the PO-line supply bridge (not the planning bridge)');
ok(/action === 'flowASchemaLineagePreflight'/.test(ROUTER) && /handleFlowASchemaLineagePreflight_/.test(ROUTER), 'I. preflight is wired as a router action');
ok(/mode: 'STRICTLY READ-ONLY[\s\S]{0,60}getValues only/.test(GS11) && /ZERO_WRITE_CONFIRMED/.test(GS11), 'I. the preflight entrypoint is strictly read-only (zero-write confirmed)');

// ============================================================ D + ADDENDUM — two-lineage model source facts
section('D/addendum. shipment_line_allocations = PO-supply bridge (NOT the plan-line bridge)');
var ALLOC_HDR = GS32.match(/var SHIPMENT_LINE_ALLOCATIONS_HEADERS_ = \[[\s\S]*?\];/)[0];
ok(/purchase_order_line_id/.test(ALLOC_HDR), 'addendum1/L10. shipment_line_allocations references purchase_order_line_id (PO-line supply)');
ok(ALLOC_HDR.indexOf('shipping_plan_line_id') === -1, 'addendum1/L10. shipment_line_allocations does NOT carry shipping_plan_line_id');
var SHIPLINE_HDR = GS12.match(/var SHIPMENT_LINES_HEADERS_ = \[[\s\S]*?\];/)[0];
ok(/shipping_plan_line_id/.test(SHIPLINE_HDR), 'L10. the REAL plan-line→shipment-line bridge is shipment_lines.shipping_plan_line_id (line-level, 1:1)');

// Scope the write-boundary assertions to the actual FLOW A SUBMIT PATH functions (11_ also holds a SEPARATE later
// approve→shipment handler and a read-only preflight; those are NOT the Submit path and must not widen this check).
var WRITER = extractFn(GS11, 'shippingPlanCommitFromLines_');
var SUBMIT = extractFn(GS16, 'sadSubmitToShippingPlansCore_');
var SUBMIT_ENTRY = extractFn(GS16, 'handleSubmitAllocationDraftsToShippingPlans_');
var FLOWA = WRITER + '\n' + SUBMIT + '\n' + SUBMIT_ENTRY;

section('addendum2/3/7. the Flow A Submit PATH creates no shipment_line_allocations, no PO change, no dispatch');
['shipment_line_allocations', 'purchase_order_lines', 'purchase_order_line_id', 'slaApplyExecution_', 'confirmAndDispatch', 'shipped_qty'].forEach(function (tok) {
  ok(FLOWA.indexOf(tok) === -1, 'addendum2/3. the Submit path (writer + orchestration) never references ' + tok);
});

section('L23. no Shipment/PO/stock/document/K2 mutation in the Flow A Submit path');
['handleCreateShipment', 'createShipmentFromApprovedPlan_', 'reserveFactoryStock', 'deductFactoryStock', 'consumePurchaseOrder', 'handleReceiveShipment', 'generateDocument', 'handleShipmentDocumentGenerate_'].forEach(function (b) {
  ok(FLOWA.indexOf(b) === -1, 'L23/addendum8. no banned downstream mutation in the Submit path: ' + b);
});

section('L24. compatibility wrappers delegate to the one writer');
ok(/function handleCreateShippingPlansBatch_[\s\S]{0,600}handleSubmitAllocationDraftsToShippingPlans_\(body\)/.test(GS11) || /SUBMIT_ROUTE_DEPRECATED/.test(GS11), 'L24. handleCreateShippingPlansBatch_ is a deprecated wrapper (delegates / refuses legacy lines)');
ok(/function handleSubmitShippingAllocationDrafts_[\s\S]{0,300}handleSubmitAllocationDraftsToShippingPlans_/.test(GS16), 'L24. handleSubmitShippingAllocationDrafts_ delegates to the one canonical authority');
ok(/shippingPlanCommitFromLines_\(ss, submitLines/.test(GS16), 'L24. the Submit authority delegates the WRITE to the single shippingPlanCommitFromLines_');

done();
