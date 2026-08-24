// F1-7N-FA-4B2-FLOW-A-GROUPING-AND-LINEAGE-TRUTH-CLOSURE
// Run: node assets/tests/flow-a-grouping-lineage-truth-closure-f1-7n-fa-4b2.test.js
// Proves: the corrected PHYSICAL shipment-compatibility grouping key (adds source/dest warehouse + last_mile +
// planning_cycle; marketplace excluded; carrier deferred; every dim fingerprint-bound); the hardened marketplace
// physical/logical accessor (marketplace_seperate is the physical authority; both-nonblank-conflict fails closed); and
// the TRUTHFUL downstream lineage classification (shipment_plan_links SPEC_DEFINED_NOT_IMPLEMENTED; shipping_plan_line_id
// ONE_SOURCE_ONLY; shipment_line_allocations PO_LINE_SUPPLY_ONLY; consolidated contribution authority MISSING).

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('F1-7N-FA-4B2 GROUPING + LINEAGE TRUTH: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function rd(p) { return fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', p), 'utf8').replace(/\r\n/g, '\n'); }
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

var GS11 = rd('11_shipping_plan_handlers.gs');
var GS16 = rd('16_shipping_allocation_handlers.gs');

// eval the PURE helpers actually used by the writer (real code, not a replica).
var LOAD = [];
LOAD.push(GS11.match(/var SP_LINE_MKT_LOGICAL_ = [^\n]*;/)[0]);
LOAD.push(GS11.match(/var SP_LINE_MKT_PHYSICAL_ALIAS_ = [^\n]*;/)[0]);
['shippingPlanFnv_', 'shippingPlanRouteGroupKey_', 'shippingPlanLineMktPhysicalCol_', 'shippingPlanResolveLineMkt_',
  'shippingPlanNormalizeLineMkt_', 'shippingPlanFlowAPreflightCore_'].forEach(function (n) { LOAD.push(extractFn(GS11, n)); });
eval(LOAD.join('\n'));

// a canonical physically-compatible line (the header-marketplace derivation groups these into ONE plan).
function line(over) { var b = { company: 'KM', country: 'US', source_warehouse_id: 'WH-CN-1', ship_from: 'CN', destination_warehouse_id: 'WH-US-W', destination: 'US West', shipping_method: 'SEA', last_mile_delivery: 'FBA', planning_cycle: '2026-W34', marketplace: 'Amazon', sku: 'KM-001' }; for (var k in (over || {})) b[k] = over[k]; return b; }
function K(over) { var l = line(over); return shippingPlanRouteGroupKey_(l, l.company); }

section('A/F1. same physical route+cycle, different marketplaces → ONE group (MULTI header, real marketplace per line)');
eq(K({ marketplace: 'Amazon' }), K({ marketplace: 'Walmart' }), 'F1. marketplace is NOT in the group key → compatible lines share one plan');
// header-marketplace derivation (mirrors 11_): 1 distinct → actual; >=2 → MULTI; a line always keeps its own real value.
function headerMkt(mkts) { var set = {}; mkts.forEach(function (m) { if (m) set[m] = 1; }); var d = Object.keys(set); return d.length === 1 ? d[0] : (d.length >= 2 ? 'MULTI' : ''); }
eq(headerMkt(['Amazon', 'Walmart']), 'MULTI', 'F1. two distinct line marketplaces → header MULTI');
eq(headerMkt(['Amazon', 'Amazon']), 'Amazon', 'F1. one distinct → header = the actual marketplace');
ok(/var headerMarketplace = distinctMk\.length === 1 \? distinctMk\[0\] : \(distinctMk\.length >= 2 \? 'MULTI'/.test(GS11), 'F1. source: header marketplace derived (1→actual, ≥2→MULTI)');
ok(/marketplace: lineMk,\s*\/\/ the line's REAL marketplace \(never MULTI\)/.test(GS11), 'F2. every plan line stores its own real marketplace (never MULTI)');

section('F3/F4/F5/F6. physically-incompatible attributes → SEPARATE groups');
ok(K() !== K({ last_mile_delivery: 'TRUCK' }), 'F3. different last-mile → separate plans');
ok(K() !== K({ planning_cycle: '2026-W35' }), 'F4. different planning cycle → separate plans');
ok(K() !== K({ shipping_method: 'AIR' }), 'F5. different shipping method → separate plans');
ok(K() !== K({ destination: 'US East', destination_warehouse_id: 'WH-US-E' }), 'F6. different destination → separate plans');
ok(K() !== K({ source_warehouse_id: 'WH-CN-2' }), 'F6. different source warehouse → separate plans');
eq(K(), K({ sku: 'KM-999' }), 'A. a non-physical attribute (sku) does NOT split the group');

section('F7. every grouping dimension is bound into spfp-1');
var HDRFP = GS11.match(/var SP_HDR_FP_STR_ = \[[\s\S]*?\];/)[0];
['company', 'country', 'source_warehouse_id', 'ship_from', 'destination_warehouse_id', 'destination', 'shipping_method', 'last_mile_delivery'].forEach(function (f) {
  ok(HDRFP.indexOf("'" + f + "'") !== -1, 'F7. header fingerprint binds ' + f);
});
ok(/var SP_LINE_FP_STR_ = \[[\s\S]*?'source_reason'[\s\S]*?\];/.test(GS11), 'F7. planning_cycle is bound via the line fingerprint source_reason (cyc:)');
ok(/planning_cycle: String\(h\.planning_cycle \|\| ''\)\.trim\(\)/.test(GS16) && /cyc:' \+ String\(h\.planning_cycle/.test(GS16), 'F7. 16_ passes planning_cycle onto each submit line AND encodes cyc: into source_reason');

section('F8/F9. idempotency: exact retry REUSED; grouping change re-classified by execution key + fingerprint');
ok(/cls\.state === 'REUSED'[\s\S]{0,220}outcome: 'REUSED', reused: true/.test(GS11), 'F8. exact retry (same key + identical fingerprint) → REUSED (zero write)');
ok(/cls\.state === 'CONFLICT'[\s\S]{0,160}SUBMIT_EXECUTION_DUPLICATE_CONFLICT[\s\S]{0,80}zero_write: true/.test(GS11), 'F9. same key + changed grouping/payload → CONFLICT (zero write); a genuinely new group hashes to a new fingerprint');
ok(/shippingPlanClassifyBatch_\(existingPlans, existingLines, providedKey, incomingFingerprint/.test(GS11), 'F9. classification compares the COMPLETE canonical fingerprint (all grouping dims bound)');

section('F10/F11/B. marketplace physical/logical accessor');
var fakeSheet = function (headers) { return { getLastColumn: function () { return headers.length; }, getRange: function () { return { getValues: function () { return [headers]; } }; } }; };
eq(shippingPlanLineMktPhysicalCol_(fakeSheet(['sku', 'marketplace_seperate'])), 'marketplace_seperate', 'F11. only marketplace_seperate → accepted (no failure, no migration)');
eq(shippingPlanLineMktPhysicalCol_(fakeSheet(['sku', 'marketplace'])), 'marketplace', 'B. only marketplace (canonical/legacy/test) → accepted');
eq(shippingPlanLineMktPhysicalCol_(fakeSheet(['sku', 'marketplace', 'marketplace_seperate'])), 'marketplace_seperate', 'B. both present → physical authority marketplace_seperate WINS (never prefer marketplace)');
eq(shippingPlanLineMktPhysicalCol_(fakeSheet(['sku'])), '', 'B. neither → "" (SCHEMA_MAPPING_REQUIRED)');
eq(shippingPlanResolveLineMkt_({ marketplace: 'Amazon', marketplace_seperate: 'Amazon' }).status, 'ok', 'F10. both equal nonblank → ok');
eq(shippingPlanResolveLineMkt_({ marketplace: 'Amazon', marketplace_seperate: 'Walmart' }).status, 'conflict', 'F10. both nonblank AND differ → CONFLICT (fail closed)');
eq(shippingPlanResolveLineMkt_({ marketplace: '', marketplace_seperate: 'Walmart' }).value, 'Walmart', 'B. one blank legacy column → deterministic use of the nonblank value');
ok(shippingPlanNormalizeLineMkt_({ marketplace: 'Amazon', marketplace_seperate: 'Walmart' }).__mkt_conflict === true, 'F10. normalize flags a value–value conflict (never silently picks)');

section('C/E/F12-F15. TRUTHFUL downstream lineage classification via the preflight core');
var pre = shippingPlanFlowAPreflightCore_({
  shipping_plans: { headers: ['shipping_plan_id', 'marketplace'], rows: [{ shipping_plan_id: 'SP1', marketplace: 'MULTI' }] },
  shipping_plan_lines: { headers: ['shipping_plan_line_id', 'shipping_plan_id', 'marketplace_seperate'], rows: [{ shipping_plan_line_id: 'L1', shipping_plan_id: 'SP1', marketplace_seperate: 'Amazon' }] },
  shipment_plan_links: { headers: ['shipment_plan_link_id', 'shipment_id', 'shipping_plan_id'], rows: [], present: true },
  shipment_line_allocations: { headers: ['shipment_line_allocation_id', 'shipment_line_id', 'purchase_order_line_id'], rows: [], present: true }
});
eq(pre.shipment_plan_links.classification, 'SPEC_DEFINED_NOT_IMPLEMENTED', 'F12. shipment_plan_links = SPEC_DEFINED_NOT_IMPLEMENTED');
eq([pre.shipment_plan_links.runtime_writer_present, pre.shipment_plan_links.runtime_reader_present], [false, false], 'F12. shipment_plan_links has no runtime writer/reader');
eq(pre.shipment_line_shipping_plan_line_id.capability, 'ONE_SOURCE_ONLY', 'F13. shipment_lines.shipping_plan_line_id = ONE_SOURCE_ONLY (not a multi-source consolidation bridge)');
eq(pre.shipment_line_allocations.authority, 'PO_LINE_SUPPLY_ONLY', 'F14. shipment_line_allocations = PO_LINE_SUPPLY_ONLY');
eq(pre.consolidated_contribution_authority, 'MISSING', 'F15. consolidated Shipping-Plan-Line contribution authority = MISSING');
eq(pre.downstream_blocker, 'MISSING_SHIPPING_PLAN_LINE_CONTRIBUTION_AUTHORITY', 'F15. downstream blocker = MISSING_SHIPPING_PLAN_LINE_CONTRIBUTION_AUTHORITY');

section('D/E. Flow A submit-schema readiness is SEPARATE from downstream consolidation readiness');
eq(pre.flow_a_submit_schema_ready, true, 'D/E. marketplace_seperate present + no conflict → Flow A submit schema READY');
eq(pre.shipment_consolidation_lineage_ready, false, 'D/E. downstream Shipment consolidation lineage NOT ready');
eq(pre.grouping.dimensions, ['company', 'country', 'source_warehouse_id', 'ship_from', 'destination_warehouse_id', 'destination', 'shipping_method', 'last_mile_delivery', 'planning_cycle'], 'E. preflight reports the final grouping dimensions');
eq([pre.grouping.last_mile_included, pre.grouping.planning_cycle_included, pre.grouping.carrier_deferred, pre.grouping.marketplace_excluded], [true, true, true, true], 'E. preflight reports last-mile + planning-cycle included, carrier deferred, marketplace excluded');
// a per-row physical/logical conflict blocks Flow A submit-schema readiness (fail closed)
var preConf = shippingPlanFlowAPreflightCore_({
  shipping_plans: { headers: ['shipping_plan_id'], rows: [] },
  shipping_plan_lines: { headers: ['shipping_plan_line_id', 'marketplace', 'marketplace_seperate'], rows: [{ shipping_plan_line_id: 'L1', marketplace: 'Amazon', marketplace_seperate: 'Walmart' }] },
  shipment_plan_links: { headers: [], rows: [], present: false }, shipment_line_allocations: { headers: [], rows: [], present: true }
});
eq(preConf.shipping_plan_lines.conflict_marketplace_lines, 1, 'F10/E. preflight counts a value–value marketplace conflict');
eq([preConf.flow_a_submit_schema_ready, preConf.schema_lineage_verdict], [false, 'SHIPPING_PLAN_LINES_MARKETPLACE_CONFLICT'], 'F10/E. a conflict blocks submit-schema readiness (fail closed)');

section('F16. Flow A Submit path writes no Shipment / link / allocation / PO rows');
var FLOWA = extractFn(GS11, 'shippingPlanCommitFromLines_') + '\n' + extractFn(GS16, 'sadSubmitToShippingPlansCore_');
['shipment_plan_links', 'shipment_line_allocations', 'purchase_order_lines', 'purchase_order_line_id', 'createShipmentFromApprovedPlan_', 'handleCreateShipment', 'slaApplyExecution_'].forEach(function (t) {
  ok(FLOWA.indexOf(t) === -1, 'F16. the Submit path never references ' + t);
});

done();
