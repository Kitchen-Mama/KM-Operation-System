// Kitchen Mama Operation System — R6E1A complete Shipping Plan payload fingerprint + cumulative release manifest —
// F1-7N-FA-3C-DRAFT-MODEL-R6E1A. Run: node assets/tests/shipping-plan-canonical-fingerprint-cumulative-release-f1-7n-fa-3c-r6e1a.test.js
//
// Exercises the REAL PURE canonical-fingerprint helpers extracted from 11_shipping_plan_handlers.gs (shippingPlanFpStr_/
// shippingPlanFpNum_/shippingPlanFnv_/sort keys/shippingPlanProjectBatch_/shippingPlanCanonicalFingerprint_/
// shippingPlanLinesSchemaComplete_/shippingPlanClassifyBatch_) + the fingerprint field-list vars, plus the REAL
// index.html / namespace.js / 00_config for the cumulative unified-release + three-flag assertions.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6E1A CANONICAL FINGERPRINT + CUMULATIVE RELEASE (F1-7N-FA-3C-R6E1A): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
var GS = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '11_shipping_plan_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');

function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
function extractVar(src, name) { var m = new RegExp('var\\s+' + name + '\\s*=\\s*([\\s\\S]*?);\\n').exec(src); if (!m) throw new Error('missing var ' + name); return 'var ' + name + ' = ' + m[1] + ';'; }
var VARS = ['SHIPPING_PLAN_FINGERPRINT_VERSION_', 'SP_HDR_FP_STR_', 'SP_HDR_FP_NUM_', 'SP_LINE_FP_STR_', 'SP_LINE_FP_NUM_'].map(function (n) { return extractVar(GS, n); });
var FNS = ['shippingPlanFpStr_', 'shippingPlanFpNum_', 'shippingPlanFnv_', 'shippingPlanHdrSortKey_', 'shippingPlanLineSortKey_',
  'shippingPlanProjectBatch_', 'shippingPlanCanonicalFingerprint_', 'shippingPlanLinesSchemaComplete_', 'shippingPlanClassifyBatch_'].map(function (n) { return extractFn(GS, n); });
eval(VARS.join('\n') + '\n' + FNS.join('\n'));

// ---- full canonical row objects (every fingerprint field present → schema-complete) ------------------------------
function basePlan() { return { shipping_plan_id: 'SP-1', submit_batch_id: 'SB-1', company: 'KM', country: 'US', marketplace: 'amazon.com',
  ship_from: 'CN-WH', source_warehouse_id: 'W1', ship_from_type: 'OVERSEAS', destination: 'FBA-US', destination_warehouse_id: 'D1', destination_type: 'FBA',
  shipping_method: 'sea', last_mile_delivery: 'UPS', customs_type: 'DDP', carrier_id: 'C1', carrier_rate_type: 'per_kg', import_duty_treatment: 'prepaid',
  currency: 'USD', plan_name: 'KM / US / amazon.com / sea / 2026-08-22', note: '', source: 'inventory_replenishment_submit_plan',
  carrier_unit_rate: 3.5, estimated_freight_cost: 100, estimated_duty: 20, estimated_customs_fee: 5, estimated_total_cost: 125 }; }
function baseLine(sku) { return { shipping_plan_id: 'SP-1', sku: sku || 'SKU1', site_sku: 'SS-' + (sku || 'SKU1'), marketplace: 'amazon.com',
  requested_qty: 100, approved_qty: 100, plan_carton_qty: 5, units_per_carton: 20, carton_cbm: 0.1, cbm: 0.5, gross_weight: 10, net_weight: 8,
  snapshot_avg_sales_source: 'amz', snapshot_avg_sales_warning: '', snapshot_fc_context: '{"f":1}', snapshot_event_context: '',
  source_page: 'inventory_replenishment', source_reason: 'manual_submit', inventory_snapshot_date: '2026-08-20', note: '',
  snapshot_current_stock: 200, snapshot_avg_sales_per_day: 3, snapshot_days_of_supply: 66, snapshot_suggested_qty: 120, snapshot_target_days: 60,
  snapshot_normal_days_count: 30, snapshot_excluded_event_days_count: 0 }; }

var P = [basePlan()];
var L = [baseLine('SKU1'), baseLine('SKU2')];
var EXACT_FP = shippingPlanCanonicalFingerprint_(P, L);
function classify(persP, persL, key, incomingFp, n) { return shippingPlanClassifyBatch_(persP, persL, key, incomingFp, n).state; }
// helper: fingerprint an incoming variant (deep-ish clones)
function fpVariant(mutatePlan, mutateLine, lineIdx) {
  var p = [Object.assign({}, basePlan())]; if (mutatePlan) mutatePlan(p[0]);
  var ls = [baseLine('SKU1'), baseLine('SKU2')]; if (mutateLine) mutateLine(ls[lineIdx == null ? 0 : lineIdx]);
  return shippingPlanCanonicalFingerprint_(p, ls);
}

section('fingerprint version + coverage (every listed field participates)');
ok(/^spfp-1:/.test(EXACT_FP) && SHIPPING_PLAN_FINGERPRINT_VERSION_ === 'spfp-1', '0. fingerprint carries the version prefix spfp-1');
// every header + line fingerprint field, when changed, MUST change the fingerprint (proves complete coverage)
SP_HDR_FP_STR_.concat(SP_HDR_FP_NUM_).forEach(function (f) {
  var fp = fpVariant(function (p) { p[f] = (typeof p[f] === 'number') ? p[f] + 7 : String(p[f]) + '_X'; });
  ok(fp !== EXACT_FP, '0. header field in fingerprint coverage: ' + f);
});
SP_LINE_FP_STR_.concat(SP_LINE_FP_NUM_).forEach(function (f) {
  var fp = fpVariant(null, function (l) { l[f] = (typeof l[f] === 'number') ? l[f] + 7 : String(l[f]) + '_X'; });
  ok(fp !== EXACT_FP, '0. line field in fingerprint coverage: ' + f);
});

section('C/E. REUSE cases');
ok(classify(P, L, 'SB-1', EXACT_FP, 2) === 'REUSED', '1. exact retry → REUSED (zero writes)');
var reversedFp = shippingPlanCanonicalFingerprint_(P, [baseLine('SKU2'), baseLine('SKU1')]);
ok(reversedFp === EXACT_FP && classify(P, L, 'SB-1', reversedFp, 2) === 'REUSED', '2. line ORDER change only → REUSED (lines sorted before hashing)');
var numStrFp = fpVariant(function (p) { p.carrier_unit_rate = '3.5'; p.estimated_total_cost = '125'; }, null);
var numStrLinesFp = shippingPlanCanonicalFingerprint_(
  [Object.assign(basePlan(), { carrier_unit_rate: '3.5', estimated_total_cost: '125' })],
  [Object.assign(baseLine('SKU1'), { requested_qty: '100', plan_carton_qty: '5' }), Object.assign(baseLine('SKU2'), { requested_qty: '100', plan_carton_qty: '5' })]);
var numStrExpected = shippingPlanCanonicalFingerprint_(
  [Object.assign(basePlan(), { carrier_unit_rate: 3.5, estimated_total_cost: 125 })],
  [Object.assign(baseLine('SKU1'), { requested_qty: 100, plan_carton_qty: 5 }), Object.assign(baseLine('SKU2'), { requested_qty: 100, plan_carton_qty: 5 })]);
ok(numStrLinesFp === numStrExpected, '3. numeric string "400" vs number 400 → identical fingerprint (no false conflict)');

section('C/E. CONFLICT cases (any material change)');
ok(classify(P, L, 'SB-1', fpVariant(null, function (l) { l.requested_qty = 999; }), 2) === 'CONFLICT', '4. changed requested_qty → CONFLICT');
ok(classify(P, L, 'SB-1', fpVariant(function (p) { p.carrier_id = 'C2'; }), 2) === 'CONFLICT', '5. changed carrier → CONFLICT');
ok(classify(P, L, 'SB-1', fpVariant(function (p) { p.shipping_method = 'air'; }), 2) === 'CONFLICT', '6. changed shipping_method → CONFLICT');
ok(classify(P, L, 'SB-1', fpVariant(function (p) { p.last_mile_delivery = 'FedEx'; }), 2) === 'CONFLICT', '7. changed last_mile_delivery → CONFLICT');
ok(classify(P, L, 'SB-1', fpVariant(function (p) { p.customs_type = 'DDU'; }), 2) === 'CONFLICT', '8. changed customs_type → CONFLICT');
ok(classify(P, L, 'SB-1', fpVariant(function (p) { p.carrier_unit_rate = 9.9; p.estimated_total_cost = 300; }), 2) === 'CONFLICT', '9. changed rate/cost → CONFLICT');
ok(classify(P, L, 'SB-1', fpVariant(function (p) { p.note = 'header note edit'; }), 2) === 'CONFLICT', '10. changed header Note → CONFLICT');
ok(classify(P, L, 'SB-1', fpVariant(null, function (l) { l.note = 'line note edit'; }), 2) === 'CONFLICT', '11. changed line Note → CONFLICT');
ok(classify(P, L, 'SB-1', fpVariant(null, function (l) { l.snapshot_fc_context = '{"f":2}'; }), 2) === 'CONFLICT', '12. changed snapshot context → CONFLICT');

section('D. partial / legacy / duplicate fail-closed');
ok(classify(P, [], 'SB-1', EXACT_FP, 2) === 'COMMITTED_UNVERIFIED', '13. header(s) but zero lines while payload has lines → COMMITTED_UNVERIFIED');
// pre-migration / unknown fingerprint: a line lacking canonical fields (marketplace + snapshots) cannot be completely fingerprinted
var legacyLine = { shipping_plan_id: 'SP-1', sku: 'SKU1', site_sku: 'SS1', requested_qty: 100, approved_qty: 100, plan_carton_qty: 5, units_per_carton: 20,
  carton_cbm: 0.1, cbm: 0.5, gross_weight: 10, net_weight: 8, snapshot_avg_sales_source: 'amz', snapshot_normal_days_count: 30,
  snapshot_excluded_event_days_count: 0, snapshot_avg_sales_warning: '', source_page: 'inventory_replenishment', source_reason: 'manual_submit', inventory_snapshot_date: '2026-08-20', note: '' };
ok(shippingPlanLinesSchemaComplete_([legacyLine]) === false, '14a. a pre-migration line (no marketplace/snapshot cols) is schema-INCOMPLETE');
ok(classify(P, [legacyLine], 'SB-1', EXACT_FP, 2) === 'RECONCILIATION_REQUIRED', '14. legacy/unknown fingerprint (schema-incomplete rows) → RECONCILIATION_REQUIRED (never a false REUSE)');
// duplicate route group under one key → DUPLICATE_CONFLICT
var dupPlans = [basePlan(), Object.assign(basePlan(), { shipping_plan_id: 'SP-2' })];   // same route + same key twice
ok(classify(dupPlans, L, 'SB-1', EXACT_FP, 2) === 'DUPLICATE_CONFLICT', '14b. two headers under one key sharing a route → DUPLICATE_CONFLICT');
ok(classify([], [], 'SB-1', EXACT_FP, 2) === 'CREATE', '14c. no header carries the key → CREATE');
ok(classify(P, L, 'SB-OTHER', EXACT_FP, 2) === 'CREATE', '14d. a different execution key is a fresh intention → CREATE');

section('E. concurrent identical Submit under one key → exactly one CREATE');
var store = { plans: [], lines: [] };
function submitOnce(key) {
  var incomingP = [Object.assign(basePlan(), { submit_batch_id: key })];
  var incomingL = [baseLine('SKU1'), baseLine('SKU2')];
  var fp = shippingPlanCanonicalFingerprint_(incomingP, incomingL);
  var st = shippingPlanClassifyBatch_(store.plans, store.lines, key, fp, 2);
  if (st.state !== 'CREATE') return st.state;
  store.plans.push(incomingP[0]); incomingL.forEach(function (l) { store.lines.push(l); });
  return 'CREATED';
}
var a1 = submitOnce('SB-CC'), a2 = submitOnce('SB-CC');
ok(a1 === 'CREATED' && a2 === 'REUSED', '15. first CREATED, retry REUSED (serialized under one lock)');
ok(store.plans.filter(function (p) { return p.submit_batch_id === 'SB-CC'; }).length === 1, '15. exactly ONE plan for the batch (no duplicate)');

section('A/16. request-order.js on the unified release token');
var INDEX = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/request-order\.js\?v=r6e1a-shipping-release-20260822/.test(INDEX), '16. request-order.js carries the unified R6E1A token (off the stale r6c token)');

section('17. cumulative frontend + backend manifests complete');
var FE = ['core/namespace.js', 'api/operation-system-db-api.js', 'api/km-api-foundation.js', 'pages/inventory-replenishment.js', 'pages/request-order.js', 'app.js'];
FE.forEach(function (a) { ok(new RegExp(a.replace(/[.\/]/g, '\\$&') + '\\?v=r6e1a-shipping-release-20260822').test(INDEX), '17. cumulative FE asset on unified token: ' + a); });
// none of the 6 cumulative-changed assets may be stranded on an older token (lifecycle.js/home.js are unchanged and
// legitimately keep r6c — so we check the cumulative set by name, not a blanket r6c scan).
FE.forEach(function (a) { ok(!new RegExp(a.replace(/[.\/]/g, '\\$&') + '\\?v=r6[cd]').test(INDEX), '17. cumulative FE asset NOT stranded on r6c/r6d: ' + a); });
ok(!/\?v=r6e1-flags-shipping-20260822/.test(INDEX) && !/\?v=r6d1-invplan-20260822/.test(INDEX), '17. no asset remains on the superseded r6e1/r6d1 tokens');
var NS = fs.readFileSync(path.join(ROOT, 'js', 'core', 'namespace.js'), 'utf8');
ok(/RELEASE:\s*'r6e1a-shipping-release-20260822'/.test(NS), '17. KM.RELEASE is the unified token (agrees with the asset tokens)');
var apiDir = path.join(ROOT, 'specs', 'active', 'apps-script');
['00_config.gs', '01_router.gs', '03_master_data_handlers.gs', '11_shipping_plan_handlers.gs', 'TEMP_migrate_request_order_draft_v2.gs'].forEach(function (f) {
  ok(fs.existsSync(path.join(apiDir, f)), '17. cumulative BE manifest file present: ' + f);
});
var DOC = fs.readFileSync(path.join(ROOT, '..', 'docs', 'planning', 'REQUEST_ORDER_ALLOCATION_DRAFT_V2_FLATTEN_DESIGN_FREEZE.md'), 'utf8');
ok(/42\. R6E1A/.test(DOC) && /request-order\.js/.test(DOC), '17. §42 documents the cumulative manifest incl. request-order.js');

section('18. three-flag posture preserved');
var CONFIG = fs.readFileSync(path.join(apiDir, '00_config.gs'), 'utf8');
ok(/var\s+REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=\s*true\s*;/.test(CONFIG), '18. flat V2 cutover = true');
ok(/var\s+REQUEST_ORDER_SITE_CONFIRM_REQUIRED_\s*=\s*false\s*;/.test(CONFIG), '18. site confirm = false');
ok(/var\s+INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false\s*;/.test(CONFIG), '18. inventory generation = false');
var FND = require(path.join(ROOT, 'js', 'api', 'km-api-foundation.js'));
var api = FND.createApiFoundation({});
api.applyClientCapabilities({ requestOrderDraftV2FlatCutover: true, requestOrderSiteConfirmRequired: false, inventoryAiPlanDbGenerationEnabled: false });
eq([api.requestOrderDraftV2FlatCutover(), api.requestOrderSiteConfirmRequired(), api.inventoryAiPlanDbGenerationEnabled()], [true, false, false], '18. runtime mirror reflects the frozen three-value posture');

done();
