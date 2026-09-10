// BATCH S1 — POSITIVE-RESIDUAL AND SUBMIT READINESS CENSUS.
//
// The R6-R7-R5-R1 activation proved the class of correct no-action where the recommendation is already
// FULLY_COVERED_BY_ACTIVE_PLAN and the right answer is that nothing is written. This suite covers the other
// half of the vertical slice: a POSITIVE RESIDUAL, where the right answer is that rows ARE written, and the
// Submit that carries such a draft into a Weekly Shipping Plan.
//
// WHAT THIS SUITE IS FOR, AND WHAT IT DELIBERATELY IS NOT.
//
// It does NOT re-test the runtime lifecycle. That coverage exists and is named in the S1 report:
// shared-factory-stock-guard-and-overage-approval (the guard, the clamp, the shared pool, 210 assertions),
// inventory-ai-plan-submit-authority-f1-7n-fa-4b (the Submit gates), controlled-ai-plan-production-readiness
// (the recommendation authority and the residual), controlled-ai-plan-production-parity (the decision path),
// override-audit-provisioning-and-transaction-rollback (the transaction and its rollback). Adding a second
// copy of any of those would be the parallel model this batch is forbidden to build.
//
// It covers what has no coverage: the READ-ONLY READINESS CENSUS, and the binding between what the two
// activation manifests CLAIM and what the runtime actually does. A manifest that describes a rollback the
// runtime does not have is worse than no manifest, because it is authorised against.
//
// Run: node assets/tests/positive-residual-and-submit-readiness-census-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r5-r1.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l, d) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var NL = String.fromCharCode(10);

// ================================================================================================================
// THE WORLD IS THE READINESS SUITE'S, EXTENDED — NOT COPIED. It already wires 61_ (the harvest, the
// recommendation authority, the qualifying plan, the residual and the decision), the bundle, 69_, 16_'s
// terminal sets, 43_'s gap constants and 00_'s flag and allowlist. This suite adds the five FACTORY EXPOSURE
// tables and the shipped 71_ seam on top, because the S1 census reads tables no existing world models.
// ================================================================================================================
var BASE_OF = 'assets/tests/controlled-ai-plan-production-readiness-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7.test.js';
var BASE_SRC = read(BASE_OF).split(String.fromCharCode(13) + String.fromCharCode(10)).join(NL);
var CUT = BASE_SRC.indexOf(NL + "section('A ");
if (CUT < 0) throw new Error('the readiness suite no longer opens its assertions with section()');
var SHARED = (new Function('require', '__dirname', '__filename', 'module', 'exports', 'console',
  BASE_SRC.slice(0, CUT)
  + NL + 'return { World: World, FakeSheet: FakeSheet, extractFn: extractFn, extractVar: extractVar,'
  + ' failed: failed, GAP_DATE: GAP_DATE, GAP_CYCLE: GAP_CYCLE, gapRow: gapRow, GAP_HDR: GAP_HDR,'
  + ' HDR_FULL: HDR_FULL, LINE_FULL: LINE_FULL, G16: G16, G71: (typeof G71 === "undefined" ? null : G71) };'
))(function (m) { return require(m.indexOf('./') === 0 ? path.join(ROOT, 'assets/tests', m) : m); },
  path.join(ROOT, 'assets/tests'), __filename, module, exports,
  { log: function () {}, error: function () {} });

var World = SHARED.World, FakeSheet = SHARED.FakeSheet;
var extractFn = SHARED.extractFn, extractVar = SHARED.extractVar, failed = SHARED.failed;
var GAP_DATE = SHARED.GAP_DATE, GAP_CYCLE = SHARED.GAP_CYCLE;
var GS = 'assets/specs/active/apps-script/';
var G71 = read(GS + '71_api_v1_factory_stock_guard.gs');
var G16 = read(GS + '16_shipping_allocation_handlers.gs');
var G69 = read(GS + '69_api_v1_ai_plan_lifecycle.gs');
// 21_ is read here as well as at its assertion sites: R4E EXECUTES its movement vocabulary in the world.
var G21V = read(GS + '21_factory_inventory_handlers.gs');
var S1_REL = 'assets/tools/apps-script-diagnostics/TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs';
var S1 = read(S1_REL).split(String.fromCharCode(13) + String.fromCharCode(10)).join(NL);

// ---- THE CLOCK, PINNED TO A STATED HOUR. Same reason as the family it borrows from: the freshness resolver
// is a state machine over the Taipei hour (accepting below 17:45, REFRESH_OVERDUE above it), so a census
// verdict asserted without stating the hour is an equality with now. Today's DATE is kept because the gap
// fixtures derive theirs from the same clock; only the time of day is fixed, through 43_'s own single seam.
function pinTaipeiHourSrc_(hour) {
  var d = new Date();
  var t = new Date(d.getTime() + 8 * 3600 * 1000);
  var ms = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hour - 8, 0, 0);
  return 'gapCalcNowMs_ = function () { return ' + ms + '; };';
}
var PIN_HOUR_ = 15;   // inside the refresh window: the accepted run is current

var FACTORY_TABLES_ = {
  warehouses: ['warehouse_id', 'warehouse_code', 'warehouse_type', 'company', 'country', 'is_active', 'is_factory_warehouse'],
  factory_stock: ['warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock'],
  shipping_plans: ['shipping_plan_id', 'parent_shipping_plan_id', 'company', 'country', 'marketplace',
    'source_warehouse_id', 'status', 'plan_version', 'transferred_to_shipment_at', 'transferred_shipment_id'],
  shipping_plan_lines: ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty', 'approved_qty'],
  marketplaces: ['company', 'country', 'marketplace', 'allocation_priority'],
  // S1-R4A — 43_'s pool reader reads this table too. Present and EMPTY by default: the positive-residual
  // world sources from the factory, and an absent sheet would fail the pool read for a reason that has
  // nothing to do with what is being tested.
  overseas_inventory_snapshot: ['warehouse_id', 'sku', 'wh_available_stock'],
  // S1-R4A — BOTH carrier tables, because a routable lane needs both: the rate card prices it and
  // carrier_lead_times supplies the transit days. With the card alone the route resolves to
  // ROUTE_METHOD_UNRESOLVED / NO_TRANSIT_AUTHORITY_FOR_LANE and no K2 group is ever proposed — measured.
  carrier_rate_cards: ['rate_card_id', 'carrier_id', 'origin_country', 'destination_country', 'marketplace',
    'shipping_method', 'shipping_method_label', 'last_mile_delivery', 'currency', 'unit_rate', 'min_charge',
    'charge_type', 'charge_unit', 'status', 'effective_from', 'effective_to', 'note'],
  carrier_lead_times: ['lead_time_id', 'carrier_id', 'origin_country', 'destination_country',
    'shipping_method', 'last_mile_delivery', 'min_days', 'max_days', 'avg_days'],
  // S1-R4A §B.4 — the two surfaces a factory stock move is RECORDED on. Freezing the pool quantities alone
  // would miss a movement row written beside an unchanged total, so both are counted, id-listed and
  // full-row fingerprinted.
  // THE REAL PRODUCTION COLUMN NAMES, not convenient short ones. `factory_stock_movement_id` is how 21_
  // MOV_HEADERS spells it and `override_audit_id` is FSG_OVERRIDE_AUDIT_HEADERS_[0] in 71_. The first
  // version of this fixture invented `movement_id` / `audit_id` and the diagnostic invented them too, so the
  // tests agreed with the mistake while a live sheet would have frozen a list of blank ids.
  // S1-R4D - AND THE WHOLE HEADER, not a convenient subset. This fixture carried 11 of 21_ MOV_HEADERS'
  // 15 columns, so `named_column_count` and every full-row fingerprint were computed over a schema the
  // production table does not have. Harmless while nothing read the column count; this round reports it to
  // an operator, and a count that does not match the sheet they are about to open is worse than no count.
  // The four that were missing are the before/after audit columns - exactly the ones a movement row exists
  // to carry. Asserted against 21_'s own declaration below (Z0), so a drift there breaks this test rather
  // than quietly diverging from it.
  factory_stock_movements: ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id',
    'movement_type', 'qty', 'related_entity_type', 'related_entity_id',
    'before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock',
    'note', 'created_by', 'created_at'],
  factory_stock_override_audit: ['override_audit_id', 'created_at', 'entity_type', 'entity_id',
    'transition', 'company', 'country', 'marketplace', 'sku', 'source_warehouse_id', 'override_reason']
};
// The lane the positive-residual world ships on: CN (the factory) -> US (the marketplace). SEA and AIR both
// priced and both with transit days, so the route resolves and the auto-ranking has more than one option.
var DEFAULT_RATE_CARDS_ = [
  { rate_card_id: 'RC-SEA', carrier_id: 'CAR-1', origin_country: 'CN', destination_country: 'US',
    marketplace: '', shipping_method: 'SEA', shipping_method_label: 'Sea Freight', last_mile_delivery: 'UPS',
    currency: 'USD', unit_rate: 1.2, min_charge: 100, charge_type: 'per_unit', charge_unit: 'unit',
    status: 'ACTIVE', effective_from: '2026-01-01', effective_to: '2027-12-31' },
  { rate_card_id: 'RC-AIR', carrier_id: 'CAR-1', origin_country: 'CN', destination_country: 'US',
    marketplace: '', shipping_method: 'AIR', shipping_method_label: 'Air Freight', last_mile_delivery: 'UPS',
    currency: 'USD', unit_rate: 4.5, min_charge: 200, charge_type: 'per_unit', charge_unit: 'unit',
    status: 'ACTIVE', effective_from: '2026-01-01', effective_to: '2027-12-31' }
];
var DEFAULT_LEAD_TIMES_ = [
  { lead_time_id: 'LT-SEA', carrier_id: 'CAR-1', origin_country: 'CN', destination_country: 'US',
    shipping_method: 'SEA', last_mile_delivery: 'UPS', min_days: 30, max_days: 45, avg_days: 38 },
  { lead_time_id: 'LT-AIR', carrier_id: 'CAR-1', origin_country: 'CN', destination_country: 'US',
    shipping_method: 'AIR', last_mile_delivery: 'UPS', min_days: 7, max_days: 12, avg_days: 9 }
];
// The factory warehouse the readiness fixture's own drafts already source from. Inventing an id here would
// build a pool that no fixture row belongs to, and the exposure would read zero for the wrong reason —
// which is exactly what the first run of this suite measured.
// ================================================================================================================
// S1-R4B — THE GENUINE sysModuleBuildStamps_() RETURN SHAPE, PRODUCED BY 63_ ITSELF.
//
// Nothing about this object is spelled by the test. It is what 63_'s own function returns when handed 63_'s own
// module manifest and a project where every REQUIRED owner declares the build its row expects. The single
// OPTIONAL owner is left undeclared on purpose: 63_ §J.6 says an optional one-shot migration may be absent
// without that being a partial sync, so this default also proves the diagnostic keeps absent_optional_modules
// and absent_modules apart.
//
// WHY THIS MATTERS MORE THAN IT LOOKS: the previous fixture invented an `available` field. Every test passed
// against the invention while production, which has no such field, could only ever fail. A fixture that
// executes the real function cannot invent a field, and cannot silently keep agreeing after 63_ changes.
// ================================================================================================================
var REAL_STAMPS_ = (function () {
  var G63 = read(GS + '63_api_v1_system_health.gs');
  var G69L = read(GS + '69_api_v1_ai_plan_lifecycle.gs');
  var sb = {};
  vm.createContext(sb);
  // The two authorities 63_'s runtime half compares against each other, from their shipped files.
  vm.runInContext([
    extractVar(G16, 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_'),
    extractVar(G16, 'SAD_LIFECYCLE_TAIL_COLUMNS_'),
    extractVar(G16, 'SAD_ROUTE_IDENTITY_TAIL_COLUMNS_'),
    extractVar(G16, 'SAD_CREATE_IDEMPOTENCY_TAIL_COLUMNS_'),
    extractVar(G16, 'SAD_HEADER_OPTIONAL_TAIL_COLUMNS_'),
    extractVar(G16, 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_'),
    extractVar(G16, 'SAD_SCHEMA_GENERATIONS_'),
    extractFn(G16, 'sadSchemaGenerationColumns_'),
    extractFn(G16, 'sadSupportedSchemaVersions_'),
    extractFn(G16, 'sadResolveHeaderSchema_'),
    extractFn(G69L, 'aiplStr_'),
    extractFn(G69L, 'aiplResolveSchema_'),
    extractFn(G69L, 'aiplSchemaVersionOf_')
  ].join(NL), sb, { filename: 'stamps_authorities' });
  // 63_'s own manifest, release pin and contract function.
  vm.runInContext([
    extractVar(G63, 'SYS_DEPLOYMENT_RELEASE_'),
    extractVar(G63, 'SYS_MODULE_BUILD_STAMPS_'),
    extractFn(G63, 'sysStr_'),
    extractFn(G63, 'sysGlobalValue_'),
    extractFn(G63, 'sysRuntimeAuthorityChecks_'),
    extractFn(G63, 'sysModuleBuildStamps_')
  ].join(NL), sb, { filename: 'stamps_63' });
  // A perfectly synced project: every REQUIRED owner's build symbol declared at its expected value. The
  // optional one is deliberately NOT declared.
  vm.runInContext('SYS_MODULE_BUILD_STAMPS_.forEach(function (m) {'
    + ' if (m.optional !== true) this[m.symbol] = m.expected; }, this);', sb);
  return vm.runInContext('sysModuleBuildStamps_()', sb);
})();
/** A copy of the real shape with named fields overridden — for the negative cases. Deep-copied so one
 *  mutation cannot leak into the next world. */
function stampsWith_(over) {
  var c = JSON.parse(JSON.stringify(REAL_STAMPS_));
  Object.keys(over || {}).forEach(function (k) {
    if (over[k] === '__DELETE__') delete c[k]; else c[k] = over[k];
  });
  return c;
}

var WHF = 'WH-TW-CN-FACTORY-YOUXIN';
// The sku the default demand seam declares. Spelled here because S1World is defined above `SKU`, and it is the
// SAME string — asserted below, so the two cannot drift into describing different worlds.
var SKU_FOR_DEMAND_ = 'CO1100-R';
var DEMAND_REF_ = 'ResUS|US|Amazon|' + SKU_FOR_DEMAND_ + '|Amazon';
/**
 * The demand the seam carries, at a stated per-window quantity. See the long note in S1World: these are
 * NETTED windows, because weeklyAiPlanNetSitesByResidual_ runs inside the real harvest and subtracts the
 * qualifying manual plan before the receivers are built. So a world that changes the manual plan changes
 * this number too, and a world that forgets to is REFUSED by the manifest rather than quietly over-planned.
 */
function demandWith_(perWindow, over) {
  var o = over || {};
  var h = {};
  h[DEMAND_REF_] = { cumulativeGapByWindow: { D18: perWindow, D30: perWindow, D45: perWindow, D90: perWindow },
    requiredByByWindow: { D18: '2026-10-01', D30: '2026-10-15', D45: '2026-11-01', D90: '2026-12-01' } };
  return {
    receiverFacts: o.receiverFacts || [{ demandRef: DEMAND_REF_, marketplace: 'Amazon',
      destinationWarehouseId: 'Amazon', fulfillmentModel: 'platform_fulfilled', dailyDemand: 10,
      allocationPriority: 1, demandWeight: 1,
      // eligiblePoolTypes governs the OVERSEAS lane only (POOL_TYPES_OVERSEAS = THREE_PL | FBA); 'FACTORY'
      // is not a token there and the real validator refuses it. The factory pool reaches the allocator
      // through poolsBySku.factoryPools instead, which is what makes this world's need factory-sourced.
      eligiblePoolTypes: ['FBA'] }],
    planningFacts: o.planningFacts || [{ demandRef: DEMAND_REF_, sku: SKU_FOR_DEMAND_,
      siteSku: SKU_FOR_DEMAND_ + '-US', unitsPerCarton: 10 }],
    horizonsByDemandRef: o.horizonsByDemandRef || h
  };
}
var DEFAULT_WAREHOUSES_ = [
  { warehouse_id: WHF, warehouse_type: 'FACTORY', company: 'ResUS', country: 'CN', is_active: true, is_factory_warehouse: true },
  { warehouse_id: 'FW-TW', warehouse_type: 'FACTORY', company: 'ResUS', country: 'TW', is_active: true, is_factory_warehouse: true },
  // S1-R4A — the SECOND factory id WEEKLY_AI_PLAN_FACTORY_IDENTITY_ names. The real weekly input assembler
  // refuses with FACTORY_WAREHOUSE_MISSING when either configured factory is absent from `warehouses`, so
  // without this row the write-set prediction cannot run at all. It carries NO factory_stock row, so it
  // creates no pool and cannot change any existing pool-ambiguity or availability measurement.
  { warehouse_id: 'WH-TW-TW-FACTORY-RES', warehouse_type: 'FACTORY', company: 'ResUS', country: 'TW', is_active: true, is_factory_warehouse: true },
  { warehouse_id: 'WH-3PL', warehouse_type: '3PL', company: 'ResUS', country: 'US', is_active: true, is_factory_warehouse: false }
];

/**
 * The S1 world. `spec` is the readiness suite's `over` plus the factory-side rows.
 * `writes` is counted on EVERY sheet, including the ones added here, so "zero writes" is measured rather
 * than asserted from the absence of a call.
 */
function S1World(spec) {
  spec = spec || {};
  var over = {};
  Object.keys(spec).forEach(function (k) {
    if (['warehouses', 'factory_stock', 'plans', 'plan_lines', 'marketplaces', 'pinHour', 'after',
      'overseas', 'rateCards', 'leadTimes', 'demand', 'movements', 'overrideAudit',
      'stamps', 'stampsThrow', 'stampsAbsent'].indexOf(k) === -1) over[k] = spec[k];
  });
  var w = new World(over);
  function add(name, rows) {
    var H = FACTORY_TABLES_[name];
    var sh = new FakeSheet(H);
    (rows || []).forEach(function (r) { sh.rows.push(H.map(function (h) { return r[h] === undefined ? '' : r[h]; })); });
    sh.writes = 0;
    w.sheets[name] = sh;
    return sh;
  }
  add('warehouses', spec.warehouses || DEFAULT_WAREHOUSES_);
  add('factory_stock', spec.factory_stock || []);
  add('shipping_plans', spec.plans || []);
  add('shipping_plan_lines', spec.plan_lines || []);
  add('marketplaces', spec.marketplaces === undefined
    // The pool reader keys allocation priority by company||country||marketplace, and the harvest enumerates
    // sites from this table. The default is the ONE station the positive-residual world is about.
    ? [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', allocation_priority: 1 }]
    : spec.marketplaces);
  add('overseas_inventory_snapshot', spec.overseas || []);
  // Present by default with ONE row each, so "a row was added" is a measurable delta rather than the
  // difference between an empty table and a table. `null` removes the sheet, which is how SHEET_ABSENT is
  // driven — and SHEET_ABSENT must stay row_count null, never 0.
  if (spec.movements !== null) {
    add('factory_stock_movements', spec.movements === undefined
      ? [{ factory_stock_movement_id: 'MV-1', movement_date: '2026-09-01', sku: SKU_FOR_DEMAND_,
          warehouse_id: WHF, movement_type: 'IN', qty: 2000, created_at: '2026-09-01T00:00:00Z' }]
      : spec.movements);
  }
  if (spec.overrideAudit !== null) {
    add('factory_stock_override_audit', spec.overrideAudit === undefined
      ? [{ override_audit_id: 'AU-1', created_at: '2026-09-01T00:00:00Z', entity_type: 'shipping_plan',
          entity_id: 'SP-SEED', transition: 'seed', company: 'ResUS', country: 'US',
          marketplace: 'Amazon', sku: SKU_FOR_DEMAND_, source_warehouse_id: WHF }]
      : spec.overrideAudit);
  }
  add('carrier_rate_cards', spec.rateCards === undefined ? DEFAULT_RATE_CARDS_ : spec.rateCards);
  add('carrier_lead_times', spec.leadTimes === undefined ? DEFAULT_LEAD_TIMES_ : spec.leadTimes);

  // The two normalizers 71_ reaches for, and the shipped 71_ seam itself.
  vm.runInContext([
    'function gapTruthy_(v) { return /^(true|yes|1|y)$/i.test(String(v == null ? "" : v).trim()); }',
    'function gapCanonCountry_(c) { return String(c == null ? "" : c).trim().toUpperCase(); }'
  ].join(NL), w.ctx);
  vm.runInContext(G71, w.ctx, { filename: '71_' });
  // ================================================================================================================
  // S1-R4E - 21_'s MOVEMENT VOCABULARY, EXECUTED RATHER THAN READ AS PROSE.
  //
  // This suite already read 21_ as TEXT to check column names and the three FSMV- mint sites. R4E classifies
  // a legacy row against `movement_type`, and 21_ §G is the authority that says which seven values exist and
  // which ledger axis each one moves - so the classification has to run against the real predicates.
  //
  // Measured why it matters: with these absent, `manual_adjustment` (a member of the canonical seven) was
  // classified as 'not in the canonical vocabulary'. The diagnostic now separates an ABSENT authority from
  // an INVALID value, and this makes the suite exercise the present-authority path instead of only the
  // absent one.
  // ================================================================================================================
  vm.runInContext([
    extractVar(G21V, 'FSTX_MOV_INVENTORY_IMPORT_'), extractVar(G21V, 'FSTX_MOV_MANUAL_ADJUSTMENT_'),
    extractVar(G21V, 'FSTX_MOV_PO_RECEIPT_'), extractVar(G21V, 'FSTX_MOV_SHIPMENT_OUT_'),
    extractVar(G21V, 'FSTX_MOV_SHIPMENT_RECEIPT_'), extractVar(G21V, 'FSTX_MOV_RESERVE_ACQUIRE_'),
    extractVar(G21V, 'FSTX_MOV_RESERVE_RELEASE_'),
    extractVar(G21V, 'FSTX_MOVEMENT_TYPES_'), extractVar(G21V, 'FSTX_RESERVED_AXIS_TYPES_'),
    extractVar(G21V, 'FSTX_CURRENT_AXIS_TYPES_'),
    extractFn(G21V, 'factoryStockIsKnownMovementType_'),
    extractFn(G21V, 'factoryStockIsReservationMovement_'),
    extractFn(G21V, 'factoryStockIsCurrentMovement_')
  ].join(NL), w.ctx, { filename: '21_vocabulary' });
  // ================================================================================================================
  // S1-R4A — THE PRODUCTION WRITE-SET CHAIN, LOADED FROM REAL SOURCE.
  //
  // MANIFEST P now predicts the exact K2 identities a Generate would create or update, and it does that by
  // calling the authorities that would produce them. Those authorities have to be REAL here or the test proves
  // nothing: a stubbed allocator would let the suite agree with a prediction the production code never makes.
  // So each one is extracted from its shipped file — 61_ for the harvest and the allocator, 16_ for the K2
  // identity and the CREATE/REUSE resolver. KMWRR / KMWHA / KMWRB / KMAF already come from the 90_ bundle the
  // shared world loads.
  //
  // WHAT IS DELIBERATELY NOT DONE: nothing here is stubbed to return a write set. Section M's assertions about
  // the predicted identities are assertions about what 16_ and 90_ compute from the fixture's own rows.
  // ================================================================================================================
  // 43_'s supply-pool reader, which the harvest builds its factory/overseas pools from. Real source: the pool
  // it produces is the one the allocator spends, so a stub here would let the prediction allocate stock that
  // production would refuse.
  var G43X = read(GS + '43_api_v1_gap_materialization.gs');
  vm.runInContext([
    extractFn(G43X, 'gapStr_'), extractFn(G43X, 'gapNum_'),
    extractFn(G43X, 'gapReadObjects_'), extractFn(G43X, 'gapOpReadSupplyPoolFacts_')
  ].join(NL), w.ctx, { filename: '43_pools' });
  var G61X = read(GS + '61_api_v1_weekly_ai_plan.gs');
  vm.runInContext([
    // The two 61_ module constants the chain reads. Taken from the shipped source, not spelled here: the
    // factory identity map decides which warehouse ids the assembler treats as factories, and a copy of it
    // in a test would be a second opinion about the source of the plan.
    extractVar(G61X, 'WEEKLY_AI_PLAN_FACTORY_IDENTITY_'),
    extractVar(G61X, 'WEEKLY_AI_PLAN_SOURCE_PAGE_'),
    extractFn(G61X, 'weeklyAiPlanTargetKeySet_'),
    extractFn(G61X, 'weeklyAiPlanWhActive_'),
    extractFn(G61X, 'weeklyAiPlanCanonicalDemandRef_'),
    extractFn(G61X, 'weeklyAiPlanAcceptCanonicalDemand_'),
    extractFn(G61X, 'weeklyAiPlanForecastReadContext_'),
    extractFn(G61X, 'weeklyAiPlanSplitBySource_'),
    extractFn(G61X, 'weeklyAiPlanWarehousesById_'),
    extractFn(G61X, 'weeklyAiPlanPoolsBySku_'),
    extractFn(G61X, 'weeklyAiPlanSourceDataAsOfAuthority_'),
    extractFn(G61X, 'weeklyAiPlanCollapseCanonicalDemand_'),
    extractFn(G61X, 'weeklyAiPlanEnumerateSites_'),
    extractFn(G61X, 'weeklyAiPlanIsolateSites_'),
    extractFn(G61X, 'weeklyAiPlanBuildKmafReceivers_'),
    extractFn(G61X, 'weeklyAiPlanHarvest_'),
    extractFn(G61X, 'weeklyAiPlanClassifyDestination_'),
    extractFn(G61X, 'weeklyAiPlanWarehouseRole_'),
    extractFn(G61X, 'weeklyAiPlanK2AllocatedLines_'),
    extractFn(G61X, 'weeklyAiPlanReadCarrierAuthorities_'),
    extractFn(G61X, 'weeklyAiPlanShipDate_')
  ].join(NL), w.ctx, { filename: '61_writeset' });
  // ================================================================================================================
  // THE ONE SEAM THIS FIXTURE SUPPLIES, AND WHY IT IS THE RIGHT ONE.
  //
  // weeklyAiPlanEnumerateSites_ reads the RECOMMENDATION WORKSPACE (42_ handleRecommendationWorkspaceGet_), which
  // is a read chain over the forecast import, the inventory snapshots and the lead-time tables. None of that is
  // in this world, and none of it decides a single field of the write set — it decides what the DEMAND is, which
  // is what a fixture exists to declare. So the harvest is wrapped and handed the demand directly, in exactly
  // the shape KMWHA documents (receiverFacts + planningFacts + horizonsByDemandRef).
  //
  // EVERYTHING THAT DECIDES THE WRITE SET STAYS REAL, and that is the whole point of the seam being here rather
  // than one layer lower:
  //     KMWRB.buildWeeklySourceLines        real (90_)
  //     weeklyAiPlanK2AllocatedLines_       real (61_)  <- the allocator, quantities and per-source splits
  //     KMWRR.buildK2GenerationPlan         real (90_)  <- route grouping
  //     sadK2GroupKey_ / DeterministicHeaderId_ / DeterministicLineId_   real (16_)
  //     sadK2ResolveActiveDraft_            real (16_)  <- CREATE vs UPDATE
  //     aiplExpirationCandidates_           real (69_)
  // The identities section M asserts are therefore computed by shipped production code from this world's own
  // rows. A stub anywhere below this line would let the suite agree with a prediction production never makes.
  //
  // The real harvest still RUNS: freshness, the accepted snapshot, the gap lineage, the recommendation state,
  // the pools and warehousesById all come from it, so the manifest's other measurements are unaffected.
  // ================================================================================================================
  // 380 = the fixture's gross recommendation 900 minus its two manual drafts totalling 520. Spelled through
  // demandWith_ rather than derived from the residual: the census reaches 380 down a separate path, so the
  // manifest's `the_predicted_lines_do_not_exceed_the_proposed_quantity` compares two independent numbers
  // instead of comparing one with itself.
  var demand = spec.demand === undefined ? demandWith_(380) : spec.demand;
  vm.runInContext('var __S1_DEMAND = ' + JSON.stringify(demand) + ';', w.ctx);
  vm.runInContext([
    // AN ASSIGNMENT, NOT A DECLARATION. `function weeklyAiPlanHarvest_(){}` here would be HOISTED over the
    // capture on the line above, so __s1RealHarvest would hold the wrapper and the wrapper would call itself:
    // measured as "Maximum call stack size exceeded" reported as an unmeasurable write set.
    'var __s1RealHarvest = weeklyAiPlanHarvest_;',
    'weeklyAiPlanHarvest_ = function (ss, scope, expectedBySite) {',
    '  var h = __s1RealHarvest(ss, scope, expectedBySite);',
    '  if (h && h.ok === true && __S1_DEMAND) {',
    '    h.kmaf = { ready: true, issues: [], receiverFacts: __S1_DEMAND.receiverFacts,',
    '      planningFacts: __S1_DEMAND.planningFacts };',
    '    h.horizonsByDemandRef = __S1_DEMAND.horizonsByDemandRef;',
    '    h.site_count = (__S1_DEMAND.receiverFacts || []).length;',
    '  }',
    '  return h;',
    '};'
  ].join(NL), w.ctx, { filename: 'demand_seam' });
  vm.runInContext([
    extractFn(G16, 'sadK2ResolveActiveDraft_'),
    extractFn(G16, 'sadK2PayloadFingerprint_'),
    extractFn(G16, 'sadK2LineNaturalKey_'),
    extractFn(G16, 'sadK2PartitionLinesIntoGroups_')
  ].join(NL), w.ctx, { filename: '16_writeset' });
  // 69_'s real expiration selector — the SAME one a generation uses to expire, so the set the census reports
  // and the set a run would expire cannot differ.
  vm.runInContext([extractFn(G69, 'aiplStr_'), extractFn(G69, 'aiplLo_'),
    extractFn(G69, 'aiplIsAiGenerated_'), extractFn(G69, 'aiplSameScope_'),
    extractFn(G69, 'aiplExpirationCandidates_')].join(NL), w.ctx);
  // The four Submit-authority names, as PRESENCE STUBS. The census asks only whether they exist; every claim
  // about their BEHAVIOUR is bound to the real 16_ source in section G, so a stub cannot make one true.
  vm.runInContext([
    'function handleSubmitAllocationDraftsToShippingPlans_() { throw new Error("S1_SUITE_PRESENCE_STUB_ONLY"); }',
    'function sadSubmitToShippingPlansCore_() { throw new Error("S1_SUITE_PRESENCE_STUB_ONLY"); }',
    'function shippingPlanCommitFromLines_() { throw new Error("S1_SUITE_PRESENCE_STUB_ONLY"); }',
    'function sadVerifyShippingPlanOutput_() { throw new Error("S1_SUITE_PRESENCE_STUB_ONLY"); }'
  ].join(NL), w.ctx);
  // 63_'s deployment contract, stubbed UNIFORM: this suite is not testing the deployment probe.
  // ================================================================================================================
  // S1-R4B — THE DEPLOYMENT CONTRACT IS NOT SPELLED HERE ANY MORE. IT IS EXECUTED.
  //
  // The stub this replaces returned `{ available: true, verdict: "UNIFORM", deployment_build: …, modules: [],
  // stale_modules: [], absent_modules: [], mixed_deployment: false }`. Two things were wrong with it and they
  // compounded:
  //
  //   1. `available` IS NOT A FIELD sysModuleBuildStamps_ RETURNS. The stub invented it, the diagnostic read
  //      it, and the suite therefore agreed with an invention that production could only ever fail. That is
  //      the whole of the live STOP on `the_deployment_contract_is_readable`.
  //   2. `modules: []` meant the per-module stamps were never exercised at all, so the half of the contract
  //      that actually detects a partial sync was untested.
  //
  // So the fixture now runs 63_'s OWN sysModuleBuildStamps_ over 63_'s OWN SYS_MODULE_BUILD_STAMPS_ manifest,
  // with every REQUIRED owner symbol declared at the value its manifest row expects — a perfectly synced
  // project — and the single OPTIONAL owner left undeclared, which is 63_ §J.6's real-world case (a one-shot
  // migration the operator was told to remove). The object handed to the diagnostic is therefore the genuine
  // production shape, computed by production code, and it cannot drift from 63_ without this file breaking.
  // ================================================================================================================
  vm.runInContext('var __S1_STAMPS = ' + JSON.stringify(spec.stamps === undefined ? REAL_STAMPS_ : spec.stamps)
    + ';', w.ctx);
  vm.runInContext(spec.stampsThrow === true
    ? 'function sysModuleBuildStamps_() { throw new Error("STAMPS_EXPLODED"); }'
    : 'function sysModuleBuildStamps_() { return __S1_STAMPS; }', w.ctx);
  if (spec.stampsAbsent === true) {
    vm.runInContext('sysModuleBuildStamps_ = undefined;', w.ctx);
  }
  vm.runInContext(pinTaipeiHourSrc_(spec.pinHour === undefined ? PIN_HOUR_ : spec.pinHour), w.ctx);
  if (spec.after) vm.runInContext(spec.after, w.ctx);
  vm.runInContext(spec.s1 || S1, w.ctx, { filename: 'S1' });
  // S1-R4E - WRITES ARE ALREADY COUNTED, AND I CHECKED THE WRONG FakeSheet BEFORE BELIEVING OTHERWISE.
  // The base harness this suite borrows (controlled-ai-plan-production-readiness) increments `writes` on
  // setValue, setValues and appendRow; the near-identical FakeSheet in the k2-route-intent suite does not,
  // and that is the one I read. A wrapper added here on that premise DOUBLE-COUNTED, which the R4E execute
  // path exposed immediately: cells_written 1 against allWrites() 2. Removed. What is genuinely missing is
  // not a count but a BREAKDOWN - a total cannot say that a repair authorized on one table touched no other.
  w.allWrites = function () {
    var n = 0;
    Object.keys(w.sheets).forEach(function (k) { n += (w.sheets[k].writes || 0); });
    return n;
  };
  // Which sheets were written, not just how many writes there were: a repair authorized on one table must
  // be shown not to have touched another, and a total cannot say that.
  w.writesByTable = function () {
    var m = {};
    Object.keys(w.sheets).forEach(function (k) {
      if ((w.sheets[k].writes || 0) > 0) m[k] = w.sheets[k].writes;
    });
    return m;
  };
  return w;
}
function census(spec) {
  var w = S1World(spec);
  var r = w.run('RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS');
  r.world = w;
  return r;
}
function submitCensus(spec, id) {
  var w = S1World(spec);
  var out, threw = null;
  try { out = vm.runInContext('RUN_S1_SUBMIT_READINESS_CENSUS(' + JSON.stringify(id === undefined ? null : id) + ')', w.ctx); }
  catch (e) { threw = e; }
  return { res: out || {}, threw: threw, world: w };
}
function scopeOf(r, sku) {
  var all = (r.res.candidates || []).concat(r.res.rejected || []);
  var hit = null;
  all.forEach(function (c) { if (c.scope && c.scope.sku === sku) hit = c; });
  return hit;
}
function proofOf(row, name) {
  return ((row && row.proofs) || []).filter(function (p) { return p.predicate === name; })[0] || null;
}

// ================================================================================================================
// THE POSITIVE-RESIDUAL WORLD. The readiness suite's default fixture is Route A + Route B MANUAL drafts for
// CO1100-R totalling 520, against a gap. A POSITIVE residual is simply a recommendation LARGER than that.
// ================================================================================================================
var SKU = 'CO1100-R';
var POS = {
  // recommended 900 (furthest window), already planned 520 manually -> residual 380
  gap: { d18_gap_qty: 900, d18_suggested_qty: 900, d30_suggested_qty: 900,
    d45_suggested_qty: 900, d90_gap_qty: 900, d90_suggested_qty: 900 },
  factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 100 }]
};
function pos(over) {
  var d = {};
  Object.keys(POS).forEach(function (k) { d[k] = POS[k]; });
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return d;
}

// ================================================================================================================
section('A — the census runs read-only, and says so in numbers it measured');
// ================================================================================================================

var A = census(pos());
eq(A.threw, null, 'A0  the census does not throw against a positive-residual world');
eq([A.res.dry_run, A.res.writes, A.res.writer_calls], [true, 0, 0],
  'A1  it reports dry_run, zero writes and zero writer calls');
eq([A.res.generate_called, A.res.submit_called, A.res.migration_called], [false, false, false],
  'A1a and that it called neither Generate, nor Submit, nor a migration');
eq(A.world.allWrites(), 0,
  'A1b MEASURED ON THE SHEETS — every table in the world, including the five added here, has zero writes');
eq(A.res.environment.flag_value, false, 'A2  the generation flag is false');
eq(failed(A.res), [], 'A3  no census-level predicate failed', failed(A.res));
ok(A.res.scopes_examined > 0, 'A4  at least one scope was examined', A.res.scopes_examined);
eq(A.res.selected, null, 'A5  NO candidate is selected — that is a person\'s act, not a diagnostic\'s');
eq(A.res.proposal_only, true, 'A5a and the whole result is marked proposal_only');
ok(String(A.res.exposure_equation).indexOf('factory_current_stock - factory_reserved_stock') > 0
  && String(A.res.exposure_equation).indexOf('active_allocation_draft_qty') > 0
  && String(A.res.exposure_equation).indexOf('active_shipping_plan_qty_not_yet_transferred') > 0,
  'A6  the exposure equation is stated in full, all three subtrahends', A.res.exposure_equation);

// THE SOURCE ITSELF CARRIES NO WRITE API. Comments AND string literals are stripped first, because this file
// NAMES writers in prose and in its manifests — a naive scan would find them there and prove nothing.
function bareCode(src) {
  var noBlock = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  var noLine = noBlock.split(NL).map(function (l) {
    var i = -1, q = null;
    for (var k = 0; k < l.length; k++) {
      var ch = l[k];
      if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') { q = ch; continue; }
      if (ch === '/' && l[k + 1] === '/') { i = k; break; }
    }
    return i < 0 ? l : l.slice(0, i);
  }).join(NL);
  return noLine.replace(/'(\\.|[^'\\])*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""');
}
var S1_BARE = bareCode(S1);
// S1-R4E - NARROWED, AND THEREFORE STRONGER.
//
// Through R4D this file could not write at all, and a file-wide 'contains no setValue' said so in one line.
// R4E adds an AUTHORIZED single-cell repair, so that line is now false - and deleting it would trade a
// checkable claim for nothing. It is replaced by a claim that says WHERE a write may live: every other write
// API stays banned file-wide, `setValue` is allowed at exactly two sites, both of them are inside the two
// backfill functions, and every read-only entry point is checked on its OWN source.
// S1-R4H - NARROWED AGAIN, AND AGAIN THEREFORE STRONGER.
//
// R4E allowed `setValue` at two named sites. R4H adds an authorized REMOVAL, and it needs three more APIs:
// `clearContent` to empty the one range, `setValues` to put the fifteen cells back, and `LockService` to
// hold the sheet still while that happens. Dropping the file-wide bans on those three would trade a
// checkable claim for nothing, so each becomes a claim about WHERE it may live - a total count for the
// whole file, and that same count found inside the one function allowed to have it.
//
// WHAT STAYS BANNED OUTRIGHT is every API that changes the SHAPE of a sheet. That is not a stylistic line:
// the removal method is "empty the row, never move it", and `deleteRow` is the single call that would make
// every frozen row number in this file - R4E's target, R4F's chronology, R4H's 95 survivors - point at a
// different record.
['appendRow', 'deleteRow', 'deleteRows', 'insertRow', 'insertRows', 'moveRows', 'insertSheet',
 'deleteSheet', 'removeSheet', 'setFormula', 'setName', 'clearContents', 'Utilities.getUuid',
 'SpreadsheetApp.flush', 'DriveApp', 'MailApp', 'UrlFetchApp'].forEach(function (api, i) {
  ok(S1_BARE.indexOf(api) === -1,
    'A7.' + (i + 1) + ' the census source contains no ' + api + ' (comments and string literals stripped)');
});
// THE THREE WRITE APIS THAT ARE ALLOWED, EACH WITH A TOTAL AND A HOME.
[['setValue(', 2, ['RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL', 'S1_movRollback_'],
  'R4E\'s single-cell repair and its rollback'],
 ['setValues(', 1, ['S1_remRollback_'],
  'R4H\'s removal rollback, which restores all fifteen cells at once'],
 ['clearContent(', 1, ['RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL'],
  'R4H\'s removal, which empties exactly one range'],
 ['LockService', 2, ['S1_remAcquireLock_'],
  'the one place a script lock is taken']].forEach(function (row, i) {
  var api = row[0], total = row[1], fns = row[2], inside = 0;
  fns.forEach(function (fn) { inside += bareCode(extractFn(S1, fn)).split(api).length - 1; });
  eq(S1_BARE.split(api).length - 1, total,
    'A7.18.' + (i + 1) + 'a ' + api + ' appears exactly ' + total + ' time(s) in the whole file');
  eq(inside, total,
    'A7.18.' + (i + 1) + 'b and every one of them is inside ' + fns.join(' / ') + ' - ' + row[3]);
});
// EVERY READ-ONLY ENTRY POINT, ON ITS OWN SOURCE. A file-wide claim could not have said this once one
// function was allowed to write; this can, and it is the claim that actually matters.
['RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS', 'RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS',
 'RUN_S1_SUBMIT_READINESS_CENSUS', 'RUN_S1_MANIFEST_P', 'RUN_S1_MANIFEST_S',
 'RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC', 'RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS',
 'RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL_MANIFEST',
 'RUN_S1_FACTORY_MOVEMENT_LEGACY_PROVENANCE_CENSUS',
 'RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_MANIFEST'].forEach(function (fn, i) {
  var src = bareCode(extractFn(S1, fn));
  ok(src.length > 0, 'A7.19.' + (i + 1) + 'a ' + fn + ' is extractable');
  ok(src.indexOf('setValue') === -1 && src.indexOf('appendRow') === -1
    && src.indexOf('clearContent') === -1 && src.indexOf('LockService') === -1
    && src.indexOf('getRange') === -1,
    'A7.19.' + (i + 1) + 'b ' + fn + ' reaches no write API, no lock and no getRange at all');
});
// TEN READ-ONLY ENTRY POINTS AND TWO THAT MAY WRITE, WHICH IS THE WHOLE PUBLIC SURFACE.
eq((S1_BARE.match(/^function RUN_S1_[A-Z_]+/gm) || []).length, 12,
  'A7.20 twelve public entry points in total');
['RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL', 'RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL']
  .forEach(function (fn, i) {
  var src = bareCode(extractFn(S1, fn));
  ok(src.indexOf('opts.execute !== true') > 0,
    'A7.20.' + (i + 1) + ' and each of the two that MAY write gates on `opts.execute !== true`, by identity');
});
ok(S1_BARE.indexOf('inventoryAiPlanDbGenerationEnabled_') > 0,
  'A7a it READS the flag …');
ok(!/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=/.test(S1_BARE),
  'A7b … and never assigns it');
ok(!/INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_\s*=/.test(S1_BARE),
  'A7c nor the activation allowlist');
['handleGenerateWeeklyAiPlanDraft_(', 'weeklyAiPlanGenerateK2_(', 'sadSubmitToShippingPlansCore_(',
 'handleSubmitAllocationDraftsToShippingPlans_(', 'shippingPlanCommitFromLines_(',
 'WeeklyAiPlanControlledAuthority_'].forEach(function (c, i) {
  ok(S1_BARE.indexOf(c) === -1,
    'A8.' + (i + 1) + ' and it never CALLS ' + c.replace('(', '') + ' — it is named in prose only');
});

// ================================================================================================================
section('B — a positive residual is found, and every number comes from the shipped authority');
// ================================================================================================================

var BR = scopeOf(A, SKU);
ok(!!BR, 'B0  the frozen SKU appears in the census output');
eq(BR.scope, { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: SKU },
  'B1  under the exact four-axis identity');
eq(BR.scope_axes, ['company', 'country', 'marketplace', 'sku'],
  'B1a and the axes are all four, never three');
eq(BR.recommendation_state, 'NONZERO_RECOMMENDATION', 'B2  the recommendation state is NONZERO');
eq(BR.recommended_qty, 900, 'B2a recommended 900, from the furthest cumulative window');
eq(BR.qualifying_manual_planned_qty, 520, 'B2b qualifying MANUAL planned 520');
eq(BR.residual_qty, 380, 'B2c residual 380 = 900 - 520, from weeklyAiPlanNoActionDecision_');
eq(BR.no_action_reason, 'RESIDUAL_REMAINS',
  'B2d and production classifies it as RESIDUAL_REMAINS — not a no-action at all');
eq(BR.production_would_no_action, false, 'B2e so production would NOT answer no-action');
eq(BR.qualifying_ai_planned_qty, 0, 'B3  no AI has planned anything for this scope yet');
ok(String(BR.qualifying_ai_planned_authority).indexOf('KMFSG.draftExposure') === 0,
  'B3a and the AI quantity comes from the exposure authority, not a second traversal',
  BR.qualifying_ai_planned_authority);
eq([BR.calculation_date, BR.accepted_date], [GAP_DATE, GAP_DATE],
  'B4  the row belongs to the accepted run\'s date');
ok(/^CURRENT/.test(String(BR.freshness_state)),
  'B4a and the freshness is in the accepting set at the pinned hour', BR.freshness_state);
eq(BR.windows, { D18: 900, D30: 900, D45: 900, D90: 900 },
  'B5  all four cumulative windows are reported as stored');

// THE POOL, AND THE WHOLE EQUATION.
eq([BR.pool.warehouse_id, BR.pool.sku], [WHF, SKU], 'B6  the factory pool is warehouse_id||sku');
eq([BR.pool.factory_current_stock, BR.pool.factory_reserved_stock, BR.pool.factory_available_stock],
  [2000, 100, 1900], 'B6a current 2000 - reserved 100 = physically available 1900');
eq([BR.pool.active_allocation_draft_qty, BR.pool.active_allocation_draft_manual_qty,
  BR.pool.active_allocation_draft_ai_qty], [520, 520, 0],
  'B6b the active draft exposure is 520, ALL of it manual — manual and AI are told apart');
eq(BR.pool.active_shipping_plan_qty, 0, 'B6c no shipping-plan exposure yet');
eq(BR.pool.available_to_allocate, 1380,
  'B6d available_to_allocate = 1900 - 520 - 0 = 1380');
eq(BR.shipment_reservation_exposure.counted_as, 'factory_reserved_stock',
  'B6e the shipment stage is the RESERVED side of the balance, named rather than omitted');

eq(BR.proposed_ai_allocation_qty, 380,
  'B7  the proposal is min(residual 380, available 1380) = 380 — the residual, not the recommendation');
eq(BR.would_clamp, false, 'B7a and nothing is clamped, because the pool covers it');
eq(BR.would_write, true, 'B7b so a controlled Generate WOULD write');
eq(BR.is_candidate, true, 'B8  it is a candidate …');
eq(BR.refusal_reasons, [], 'B8a … with no refusal reason', BR.refusal_reasons);
ok(BR.proofs.length >= 11, 'B8b and it carries its own proofs, individually', BR.proofs.length);
eq(BR.proofs.filter(function (p) { return !p.pass; }), [], 'B8c every one of which passed');

// THE RANKING IS EVIDENCE, NOT A CHOICE.
ok(A.res.ranked.length >= 1, 'B9  a ranked list is returned');
eq(A.res.ranked[0].proposal_only, true, 'B9a and every entry in it is marked proposal_only');
eq(A.res.verdict, 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED',
  'B9b the verdict says candidates exist AND that authorization is still required');

// ================================================================================================================
section('C — the manual rows are protected, and the census can prove which ones');
// ================================================================================================================

eq(BR.protected_manual_identities.length, 2,
  'C1  both manual Route A and Route B lines are listed as protected', BR.protected_manual_identities);
eq(BR.protected_manual_identities.map(function (m) { return m.provenance; }), ['MANUAL', 'MANUAL'],
  'C1a each under MANUAL provenance, from 69_\'s classifier');
ok(BR.protected_manual_identities.every(function (m) { return !!m.allocation_draft_id && !!m.allocation_draft_line_id; }),
  'C1b and each names the exact header AND line identity it is protecting');
eq(BR.ai_exposure_rows, [], 'C2  no AI exposure row exists for this scope yet');
eq(BR.existing_affected_ai_identities, [],
  'C2a so a generation would supersede nothing — an empty list, not an unavailable one');
ok(proofOf(BR, 'no_manual_identity_would_be_overwritten').pass === true,
  'C3  the manual-protection proof holds');

// AND THE RESIDUAL ACCOUNTS FOR THE MANUAL EXPOSURE. If it did not, the proposal would be the whole
// recommendation and the operator would plan 900 units against a standing 520.
eq(BR.recommended_qty - BR.qualifying_manual_planned_qty, BR.residual_qty,
  'C4  residual = recommended - qualifying manual, exactly');
ok(BR.proposed_ai_allocation_qty < BR.recommended_qty,
  'C4a and the proposal is strictly less than the recommendation, because 520 is already planned');

// ================================================================================================================
section('D — an existing AI draft is netted as EXPOSURE and named as a supersede candidate');
// ================================================================================================================

// An AI draft for the SAME scope, from an earlier run. It is NOT counted in the residual (a run supersedes
// its own drafts) but it IS counted in the factory exposure (the cartons are claimed until it is expired).
var AI_HDR = { allocation_draft_id: 'AI-OLD-1', planning_cycle: GAP_CYCLE, company: 'ResUS', country: 'US',
  marketplace: 'Amazon', status: 'draft', generation_type: 'system_generated',
  generation_run_id: 'GEN-OLD', recommended_source_warehouse_id: WHF };
var AI_LN = { allocation_draft_line_id: 'AI-OLD-1-L1', allocation_draft_id: 'AI-OLD-1', sku: SKU,
  source_warehouse_id: WHF, planned_qty: 100, line_status: 'draft' };
var D = census(pos({ extraHeaders: [AI_HDR], extraLines: [AI_LN] }));
var DR = scopeOf(D, SKU);
eq(DR.qualifying_manual_planned_qty, 520,
  'D1  the qualifying MANUAL quantity is UNCHANGED by the AI draft — a run does not net against itself');
eq(DR.residual_qty, 380, 'D1a so the residual is unchanged at 380');
eq(DR.qualifying_ai_planned_qty, 100,
  'D2  while the AI quantity is reported SEPARATELY as 100 — excluded from the residual, never hidden');
eq([DR.pool.active_allocation_draft_manual_qty, DR.pool.active_allocation_draft_ai_qty], [520, 100],
  'D2a and the pool splits the exposure 520 manual / 100 AI');
eq(DR.pool.available_to_allocate, 1280,
  'D2b available falls to 1900 - 620 = 1280, because the AI draft claims real cartons');
eq(DR.proposed_ai_allocation_qty, 380,
  'D3  the proposal is still the residual, since 1280 still covers it');
ok((DR.existing_affected_ai_identities || []).length >= 1,
  'D4  the existing AI identity is named as a supersede candidate', DR.existing_affected_ai_identities);
eq((DR.existing_affected_ai_identities || []).map(function (x) { return x.allocation_draft_id; }), ['AI-OLD-1'],
  'D4a by exact allocation_draft_id');
eq(DR.protected_manual_identities.length, 2, 'D5  and both manual identities are still protected');

// A TERMINAL AI ROW IS HISTORY. It must not be exposure and must not be a supersede candidate.
var DT = census(pos({ extraHeaders: [(function () { var h = {}; Object.keys(AI_HDR).forEach(function (k) { h[k] = AI_HDR[k]; }); h.status = 'submitted'; return h; })()],
  extraLines: [AI_LN] }));
var DTR = scopeOf(DT, SKU);
eq(DTR.qualifying_ai_planned_qty, 0,
  'D6  a SUBMITTED AI draft contributes no AI exposure — it is history');
eq(DTR.pool.available_to_allocate, 1380, 'D6a and the pool is back to 1380');
eq((DTR.existing_affected_ai_identities || []).map(function (x) { return x.allocation_draft_id; }), [],
  'D6b nor is it a supersede candidate');

// ANOTHER SCOPE'S AI DRAFT IS NOT THIS SCOPE'S — but it IS the same factory pool.
var DX = census(pos({ extraHeaders: [(function () { var h = {}; Object.keys(AI_HDR).forEach(function (k) { h[k] = AI_HDR[k]; }); h.allocation_draft_id = 'AI-OTHER'; h.marketplace = 'Walmart'; return h; })()],
  extraLines: [(function () { var l = {}; Object.keys(AI_LN).forEach(function (k) { l[k] = AI_LN[k]; }); l.allocation_draft_line_id = 'AI-OTHER-L1'; l.allocation_draft_id = 'AI-OTHER'; l.planned_qty = 300; return l; })()] }));
var DXR = scopeOf(DX, SKU);
eq(DXR.qualifying_ai_planned_qty, 0,
  'D7  another marketplace\'s AI draft is NOT this scope\'s planned quantity');
eq(DXR.pool.available_to_allocate, 1080,
  'D7a but it IS the same shared factory pool: 1900 - 520 - 300 = 1080');
eq(DXR.pool.active_allocation_draft_ai_qty, 300,
  'D7b the pool counts it, because a carton does not care which marketplace claimed it');
eq(DXR.proposed_ai_allocation_qty, 380, 'D7c the residual still fits, so the proposal is unchanged');

// ================================================================================================================
section('E — the factory pool decides the proposal, and an unreadable pool is never a zero');
// ================================================================================================================

// (1) THE CLAMP. Available below the residual: the proposal follows AVAILABLE, and says it clamped.
var E1 = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 700, fac_reserved_stock: 0 }] })), SKU);
eq([E1.residual_qty, E1.pool.available_to_allocate], [380, 180],
  'E1  residual 380 against available 700 - 520 = 180');
eq([E1.proposed_ai_allocation_qty, E1.would_clamp], [180, true],
  'E1a the proposal is 180 and it declares that it clamped');
eq(E1.is_candidate, true, 'E1b it is still a candidate — a clamp is a legitimate outcome, not a refusal');
ok(proofOf(E1, 'the_proposed_quantity_does_not_exceed_available_to_allocate').pass === true,
  'E1c and the proposal is within availability');

// (2) EXHAUSTED. Available zero or negative: no candidate, and the reason is named.
var E2 = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 520, fac_reserved_stock: 0 }] })), SKU);
eq(E2.pool.available_to_allocate, 0, 'E2  the standing manual plan consumes the whole pool');
eq(E2.is_candidate, false, 'E2a so it is NOT a candidate …');
ok(E2.refusal_reasons.indexOf('available_to_allocate_is_finite_and_greater_than_zero') >= 0,
  'E2b … and the availability condition is named', E2.refusal_reasons);
eq(E2.would_write, false, 'E2c nothing would be written');

// (3) AN EXISTING BREACH IS REPORTED AS THE NEGATIVE NUMBER IT IS, never clamped to zero.
var E3 = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 300, fac_reserved_stock: 0 }] })), SKU);
eq(E3.pool.available_to_allocate, -220,
  'E3  520 already planned against 300 physical is MINUS 220 — the size of the breach is visible');
eq(E3.is_candidate, false, 'E3a and it is refused');
eq(E3.proposed_ai_allocation_qty, 0, 'E3b with a proposal of zero, never a negative allocation');

// (4) NO POOL ROW AT ALL. Not a zero pool — no pool.
var E4 = scopeOf(census(pos({ factory_stock: [] })), SKU);
eq(E4.pool, null, 'E4  an absent factory_stock row yields NO pool object …');
ok(E4.refusal_reasons.indexOf('a_factory_pool_exists_for_this_exact_warehouse_and_sku') >= 0,
  'E4a … and the missing-pool condition is named', E4.refusal_reasons);
eq([E4.proposed_ai_allocation_qty, E4.would_write], [null, false],
  'E4b the proposal is NULL — an unknown pool is never read as an unlimited one, nor as an empty one');

// (5) BLANK / NULL / NON-FINITE STOCK is refused, not coerced.
[['a blank current stock', ''], ['a non-numeric current stock', 'plenty'], ['a null current stock', null]]
  .forEach(function (c, i) {
    var r = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: c[1], fac_reserved_stock: 0 }] })), SKU);
    eq([r.is_candidate, r.would_write], [false, false],
      'E5.' + (i + 1) + ' ' + c[0] + ' → not a candidate, nothing would be written');
  });

// (6) THE POOL IS NOT PARTITIONED BY COMPANY. Another COMPANY's active draft on the same warehouse+SKU
//     reduces what this company may allocate, and that is the whole point of a shared pool.
var E6 = scopeOf(census(pos({
  extraHeaders: [{ allocation_draft_id: 'MAN-OTHERCO', planning_cycle: GAP_CYCLE, company: 'ResEU',
    country: 'DE', marketplace: 'Amazon', status: 'draft', generation_type: 'user_created',
    recommended_source_warehouse_id: WHF }],
  extraLines: [{ allocation_draft_line_id: 'MAN-OTHERCO-L1', allocation_draft_id: 'MAN-OTHERCO', sku: SKU,
    source_warehouse_id: WHF, planned_qty: 900, line_status: 'draft' }] })), SKU);
eq(E6.qualifying_manual_planned_qty, 520,
  'E6  another COMPANY\'s plan is not this scope\'s qualifying plan …');
eq(E6.pool.available_to_allocate, 480,
  'E6a … but it IS the same pool: 1900 - (520 + 900) = 480');
eq(E6.proposed_ai_allocation_qty, 380, 'E6b the residual still fits inside 480');
var E6b = scopeOf(census(pos({
  factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 1000, fac_reserved_stock: 0 }],
  extraHeaders: [{ allocation_draft_id: 'MAN-OTHERCO', planning_cycle: GAP_CYCLE, company: 'ResEU',
    country: 'DE', marketplace: 'Amazon', status: 'draft', generation_type: 'user_created',
    recommended_source_warehouse_id: WHF }],
  extraLines: [{ allocation_draft_line_id: 'MAN-OTHERCO-L1', allocation_draft_id: 'MAN-OTHERCO', sku: SKU,
    source_warehouse_id: WHF, planned_qty: 400, line_status: 'draft' }] })), SKU);
eq(E6b.pool.available_to_allocate, 80, 'E6c 1000 - 520 - 400 = 80 …');
eq([E6b.proposed_ai_allocation_qty, E6b.would_clamp], [80, true],
  'E6d … so the other company\'s claim CLAMPS this one — no ownership partition anywhere');

// (7) A SHIPPING PLAN holds exposure until it is transferred to a shipment, and then stops.
var PLAN_ROW = { shipping_plan_id: 'SP-1', company: 'ResUS', country: 'US', marketplace: 'Amazon',
  source_warehouse_id: WHF, status: 'pending_approval' };
var E7 = scopeOf(census(pos({ plans: [PLAN_ROW],
  plan_lines: [{ shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: SKU, requested_qty: 300 }] })), SKU);
eq(E7.pool.active_shipping_plan_qty, 300, 'E7  a pending-approval plan holds 300 of exposure');
eq(E7.pool.available_to_allocate, 1080, 'E7a so available is 1900 - 520 - 300 = 1080');
var E7b = scopeOf(census(pos({
  plans: [(function () { var p = {}; Object.keys(PLAN_ROW).forEach(function (k) { p[k] = PLAN_ROW[k]; });
    p.transferred_shipment_id = 'SHP-9'; p.transferred_to_shipment_at = '2026-09-08 10:00:00'; return p; })()],
  plan_lines: [{ shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: SKU, requested_qty: 300 }] })), SKU);
eq(E7b.pool.active_shipping_plan_qty, 0,
  'E7b once transferred_shipment_id is stamped the plan STOPS counting …');
eq(E7b.pool.available_to_allocate, 1380,
  'E7c … because those units are inside fac_reserved_stock and already subtracted. No double count.');

// ================================================================================================================
section('F — a scope with no residual, or a recommendation that is not current, is not a candidate');
// ================================================================================================================

// The R6-R7-R5-R1 world itself: recommended 160 against a planned 520. Fully covered, residual zero.
var F1 = scopeOf(census(pos({ gap: { d18_gap_qty: 0, d18_suggested_qty: 0, d30_suggested_qty: 0,
  d45_suggested_qty: 0, d90_gap_qty: 160, d90_suggested_qty: 160 } })), SKU);
eq(F1.residual_qty, 0, 'F1  the proved FULLY_COVERED world has residual 0 …');
eq(F1.is_candidate, false, 'F1a … so it is not a positive-residual candidate');
ok(F1.refusal_reasons.indexOf('residual_qty_is_finite_and_greater_than_zero') >= 0,
  'F1b and the residual condition names itself', F1.refusal_reasons);
eq(F1.no_action_reason, 'FULLY_COVERED_BY_ACTIVE_PLAN',
  'F1c production still classifies it as the proved no-action class — the two rounds agree');

// A BLANK window is MISSING, and MISSING is not zero and not a residual.
var F2 = scopeOf(census(pos({ gap: { d90_suggested_qty: '' } })), SKU);
eq(F2.recommendation_state, 'MISSING_RECOMMENDATION', 'F2  a blank furthest window is MISSING');
eq([F2.residual_qty, F2.is_candidate], [null, false],
  'F2a the residual is NULL and it is not a candidate — a blank is never read as a zero');
ok(F2.refusal_reasons.indexOf('the_recommendation_is_current_and_ready') >= 0,
  'F2b the readiness condition is named', F2.refusal_reasons);

// A non-READY calculation status, TWO WAYS, because they are two different situations and the census answers
// them differently. Measured before being asserted.
//
// (1) THE ONLY ROW IS NOT READY. There is then no complete snapshot at all, so the ACCEPTED RUN is unusable
//     and the whole census STOPs. It does NOT report a per-scope rejection, and it must not: a candidate list
//     measured against a snapshot that does not exist would be a list of nothing dressed as evidence.
[['PENDING', 'PENDING'], ['NONE', 'NONE'], ['BLOCKED', 'BLOCKED']].forEach(function (c, i) {
  var r = census(pos({ gap: { calculation_status: c[1] } }));
  ok(r.res.verdict === 'STOP'
    && failed(r.res).indexOf('the_accepted_run_freshness_is_in_the_accepting_set') >= 0,
    'F3.' + (i + 1) + ' calculation_status ' + c[0] + ' as the ONLY row → the whole census STOPs on the run',
    failed(r.res));
  eq(r.res.candidates, [], 'F3.' + (i + 1) + 'a and it reports no candidate at all');
});

// (2) THE RUN IS USABLE AND THIS ONE SCOPE IS NOT. Another SKU materialized READY makes the snapshot
//     complete, so the run is accepted and the non-READY identity must be REPORTED as a rejection. This is
//     the case that used to vanish: the recommendation authority does not return it, and a census that
//     iterated only what the authority returned never mentioned it.
var READY_OTHER = { sku: 'OTHER-SKU', calculation_status: 'READY', d18_suggested_qty: 0,
  d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 };
[['PENDING', 'PENDING'], ['NONE', 'NONE'], ['BLOCKED', 'BLOCKED']].forEach(function (c, i) {
  var full = census(pos({ gap: { calculation_status: c[1] }, extraGap: [READY_OTHER] }));
  var r = scopeOf(full, SKU);
  ok(!!r, 'F3b.' + (i + 1) + ' a ' + c[0] + ' scope beside a READY one is still REPORTED, not dropped');
  ok(!!r && r.is_candidate === false
    && r.refusal_reasons.indexOf('the_recommendation_is_current_and_ready') >= 0,
    'F3b.' + (i + 1) + 'a and it is refused, naming readiness', r && r.refusal_reasons);
  ok(!!r && r.recommendation_state === 'MISSING_RECOMMENDATION' && r.residual_qty === null,
    'F3b.' + (i + 1) + 'b as MISSING_RECOMMENDATION with a NULL residual — never a zero',
    r && [r.recommendation_state, r.residual_qty]);
  ok(full.res.scopes_examined >= 2,
    'F3b.' + (i + 1) + 'c and the examined count includes it', full.res.scopes_examined);
});

// A MIXED-DATE SNAPSHOT IS CAUGHT EARLIER AND HARDER. Two rows for one (company, country) at two dates is a
// PARTIAL snapshot, and the freshness authority blocks the whole pair — measured. So the census STOPs on the
// ACCEPTED RUN and never forms a per-scope opinion, which is the stricter of the two possible answers.
var Y_DATE = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
var F3c = census(pos({ gap: { calculation_date: Y_DATE },
  extraGap: [{ sku: 'OTHER-SKU', calculation_status: 'READY', d18_suggested_qty: 0, d30_suggested_qty: 0,
    d45_suggested_qty: 0, d90_suggested_qty: 0 }] }));
eq(F3c.res.verdict, 'STOP', 'F3c a mixed-date snapshot STOPS the census …');
eq(F3c.res.accepted_run.freshness_state, 'PARTIAL_SNAPSHOT_BLOCKED',
  'F3c1 … under the freshness authority\'s own PARTIAL_SNAPSHOT_BLOCKED state');
eq([F3c.res.candidates, F3c.res.ranked], [[], []],
  'F3c2 with no candidate and no ranking — an incomplete snapshot yields no evidence, not weak evidence');
eq(F3c.res.selected, null, 'F3c3 and nothing selected');

// THE UNIVERSE ACCOUNTING IS A NET BEHIND THAT GATE, and this says so rather than implying a probe exists.
// It exists so that if the authority ever returns a narrower set than the table holds — a widened allowlist,
// a new exclusion rule — the identities it drops are REPORTED instead of vanishing.
var S1_SRC_TXT = S1;
ok(S1_SRC_TXT.indexOf('NOTHING DISAPPEARS') > 0,
  'F3d the census carries an explicit accounting for identities the authority does not return');
ok(S1_SRC_TXT.indexOf('excluded_by_the_recommendation_authority: true') > 0,
  'F3d1 which marks them, rather than omitting them');
ok(S1_SRC_TXT.indexOf('out.scopes_examined = out.candidates.length + out.rejected.length;') > 0,
  'F3d2 and the examined count is the sum of both lists, so it cannot exceed what is reported');
// THE TWO MALFORMED-IDENTITY PATHS THAT ARE REACHABLE.
var F3e = census(pos({ extraGap: [{ sku: '', calculation_status: 'READY', d18_suggested_qty: 0,
  d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 }] }));
ok(F3e.res.scope_universe.malformed_identity_rows >= 1,
  'F3e a gap row with no SKU is COUNTED as a malformed identity, not skipped',
  F3e.res.scope_universe.malformed_identity_rows);
ok(F3e.res.verdict === 'STOP'
  && failed(F3e.res).indexOf('every_gap_row_carries_a_complete_four_axis_identity') >= 0,
  'F3e1 and it STOPS the census, because a row nobody can identify is not a row nobody needs',
  failed(F3e.res));

// AN OVERDUE SNAPSHOT. Same rows, later hour: the whole census refuses rather than reporting candidates
// against a run the freshness authority no longer accepts.
var F4 = census(pos({ gap: { calculation_date: new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10) },
  pinHour: 20 }));
eq(F4.res.verdict, 'STOP', 'F4  past the completion window, a yesterday-only snapshot STOPS the census');
ok(failed(F4.res).indexOf('the_accepted_run_freshness_is_in_the_accepting_set') >= 0,
  'F4a naming the freshness gate', failed(F4.res));
eq(F4.res.candidates, [], 'F4b and no candidate is reported at all');
// THE OTHER SIDE OF THE SAME BOUNDARY, so neither half becomes the whole rule.
var F4b = census(pos({ gap: { calculation_date: new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10) },
  pinHour: 15 }));
ok(/^CURRENT/.test(String(F4b.res.accepted_run.freshness_state)),
  'F4c while INSIDE the refresh window the same snapshot is accepted — R4-A2-R1 §4 stays fixed',
  F4b.res.accepted_run.freshness_state);

// THE FLAG MUST BE FALSE. A census run with generation already on is not evidence for authorizing it.
var F5 = census(pos({ flag: true }));
eq(F5.res.verdict, 'STOP', 'F5  a census run with the flag already TRUE refuses');
ok(failed(F5.res).indexOf('the_generation_flag_is_false') >= 0,
  'F5a naming the flag', failed(F5.res));

// ================================================================================================================
section('G — Submit readiness is a SEPARATE census with a SEPARATE verdict');
// ================================================================================================================

var G0 = submitCensus(pos());
eq(G0.threw, null, 'G0  the submit census does not throw with no draft named');
eq(G0.res.verdict, 'CONTRACT_ONLY_NO_DRAFT_NAMED',
  'G1  with no allocation_draft_id it reports the CONTRACT and says so — not a readiness verdict');
eq([G0.res.writes, G0.res.writer_calls, G0.res.submit_called], [0, 0, false],
  'G1a zero writes, zero writer calls, Submit not called');
eq(G0.world.allWrites(), 0, 'G1b measured on the sheets');
ok(String(G0.res.stop_reason).indexOf('authorizes nothing') > 0,
  'G1c and it states that it authorizes nothing', G0.res.stop_reason);

// THE AUTHORITY IS NAMED, AND IT EXISTS.
eq(G0.res.submit_authority.router_action, 'submitAllocationDraftsToShippingPlans',
  'G2  the router action is named');
ok(String(G0.res.submit_authority.core).indexOf('sadSubmitToShippingPlansCore_') === 0,
  'G2a the core is named');
ok(String(G0.res.submit_authority.plan_writer).indexOf('shippingPlanCommitFromLines_') === 0,
  'G2b and the ONE shipping_plans authority is named');

// EVERY REFUSAL CODE THE CENSUS ADVERTISES MUST EXIST IN THE SHIPPED SUBMIT AUTHORITY. A manifest that
// listed a refusal the runtime cannot produce would be describing a safety net that is not there.
var G16_SRC = G16;
G0.res.submit_authority.refusals.forEach(function (code, i) {
  ok(G16_SRC.indexOf(code) >= 0,
    'G3.' + (i + 1) + ' the refusal ' + code + ' exists in 16_\'s source');
});

// THE EXPOSURE INVARIANT, IN THE CENSUS'S OWN WORDS AND BOUND TO THE RUNTIME.
var GE = G0.res.exposure_equation;
ok(String(GE.before_submit).indexOf('active_allocation_draft_qty') > 0
  && String(GE.before_submit).indexOf('does not include it') > 0,
  'G4  before Submit: the draft counts and the plan does not');
ok(String(GE.during_submit).indexOf('ONE ScriptLock') === 0
  && String(GE.during_submit).indexOf('ONLY THEN') > 0,
  'G4a during: one lock, plan committed and read back BEFORE the draft transitions');
ok(String(GE.after_submit).indexOf('TERMINAL') > 0
  && String(GE.after_submit).indexOf('disjoint BY STATUS') > 0,
  'G4b after: `submitted` is terminal, and the two sets are disjoint by status');
ok(String(GE.after_transfer_to_shipment).indexOf('transferred_shipment_id') > 0
  && String(GE.after_transfer_to_shipment).indexOf('factory_reserved_stock') > 0,
  'G4c after transfer: the plan stops counting and the reservation becomes the authority');
eq(GE.reservation_owner.indexOf('shipment ONLY'), 0,
  'G4d and the ONLY reservation owner is a shipment');
// Bound to the runtime rather than asserted: 16_ really does transition AFTER the commit, and `submitted`
// really is in its terminal set.
ok(G16_SRC.indexOf('SAD_TERMINAL_STATUSES_') >= 0, 'G5  16_ defines a terminal-status set …');
var SADT = vm.runInNewContext(extractVar(G16_SRC, 'SAD_TERMINAL_STATUSES_') + ' SAD_TERMINAL_STATUSES_');
eq(SADT.submitted, 1, 'G5a … and `submitted` is in it, which is what makes the two sets disjoint');
ok(G16_SRC.indexOf('TRANSITION not-yet-submitted drafts') > 0
  && G16_SRC.indexOf('ONLY after durable plan commit') > 0,
  'G5b and 16_ states the order the census claims');

// ---- A NAMED DRAFT, measured against the gates. ---------------------------------------------------------
// The lineage and the destination are REQUIRED by the shipped Submit core for a system-generated draft, so a
// fixture without them is refused for the right reason. Supplied, so the negatives below isolate one gate.
var SUB_HDR = { allocation_draft_id: 'AI-NEW-1', planning_cycle: GAP_CYCLE, company: 'ResUS', country: 'US',
  marketplace: 'Amazon', status: 'draft', generation_type: 'system_generated', generation_run_id: 'GEN-NEW',
  recommended_source_warehouse_id: WHF, recommended_source_warehouse_code_snapshot: 'CNYOUXIN',
  calculation_run_id: 'GAP-INV-20260905-0300', formula_version: 'WEEKLY_AI_PLAN_V1',
  destination_marketplace: 'Amazon', destination_warehouse_id: '', shipping_method: 'SEA',
  last_mile_delivery: 'PARTNER_CARRIER', created_by: 'system', created_at: '2026-09-08 10:00:00' };
var SUB_LN = { allocation_draft_line_id: 'AI-NEW-1-L1', allocation_draft_id: 'AI-NEW-1', sku: SKU,
  source_warehouse_id: WHF, planned_qty: 380, line_status: 'draft' };
function subWorld(hOver, lOver) {
  var h = {}; Object.keys(SUB_HDR).forEach(function (k) { h[k] = SUB_HDR[k]; });
  Object.keys(hOver || {}).forEach(function (k) { h[k] = hOver[k]; });
  var l = {}; Object.keys(SUB_LN).forEach(function (k) { l[k] = SUB_LN[k]; });
  Object.keys(lOver || {}).forEach(function (k) { l[k] = lOver[k]; });
  return pos({ extraHeaders: [h], extraLines: [l] });
}
var G6 = submitCensus(subWorld({ draft_version: '1' }), 'AI-NEW-1');
eq(G6.threw, null, 'G6  the submit census runs against a named draft');
eq(G6.res.allocation_draft_id, 'AI-NEW-1', 'G6a and echoes the identity it was asked about');
eq([G6.res.draft.status, G6.res.draft.provenance], ['draft', 'AI'],
  'G6b reading the status and the provenance from the row');
eq([G6.res.draft.shippable_line_count, G6.res.draft.total_planned_qty], [1, 380],
  'G6c one shippable line totalling 380');
eq(G6.res.expected_shipping_plan.expected_total_requested_qty, 380,
  'G7  the expected plan total equals the draft total, exactly');
eq(G6.res.expected_shipping_plan.expected_source_rows_transitioned,
  [{ allocation_draft_id: 'AI-NEW-1', from_status: 'draft', to_status: 'submitted', is_terminal_after: true }],
  'G7a and exactly ONE source row transitions, to a terminal status');
eq(G6.res.expected_shipping_plan.before_after_exposure.delta_total_exposure, 0,
  'G7b with a total exposure delta of ZERO — the quantity moves stage, it is not created');
eq([G6.res.expected_shipping_plan.before_after_exposure.before.active_allocation_draft_qty_includes_this_draft,
  G6.res.expected_shipping_plan.before_after_exposure.after.active_allocation_draft_qty_includes_this_draft],
  [true, false], 'G7c the draft counts before and not after');
eq([G6.res.expected_shipping_plan.before_after_exposure.before.active_shipping_plan_qty_includes_this,
  G6.res.expected_shipping_plan.before_after_exposure.after.active_shipping_plan_qty_includes_this],
  [false, true], 'G7d and the plan counts after and not before');
ok(G6.res.expected_shipping_plan.natural_key_dimensions.length === 9,
  'G8  the plan natural key is the nine dimensions 11_ groups on', G6.res.expected_shipping_plan.natural_key_dimensions);
ok(String(G6.res.expected_shipping_plan.natural_key_authority).indexOf('does NOT compute a plan id') > 0,
  'G8a and the census refuses to predict a plan id, because the writer mints it');
eq(G6.res.verdict, 'SUBMIT_READY_AUTHORIZATION_REQUIRED',
  'G9  the verdict says ready AND that authorization is still required');
eq(failed(G6.res), [], 'G9a with no failed predicate', failed(G6.res));

// ---- THE SUBMIT NEGATIVES. ------------------------------------------------------------------------------
[['a CANCELLED draft', { status: 'cancelled', draft_version: '1' }, {}, 'the_draft_is_not_terminal'],
 ['an EXPIRED draft', { status: 'expired', draft_version: '1' }, {}, 'the_draft_is_not_terminal'],
 ['an ALREADY SUBMITTED draft', { status: 'submitted', draft_version: '1' }, {}, 'the_draft_is_not_terminal'],
 ['an unknown status', { status: 'weird_state', draft_version: '1' }, {}, 'the_draft_status_is_submittable'],
 ['no draft_version at all', { draft_version: '' }, {}, 'the_expected_draft_version_is_known'],
 ['a zero planned quantity', { draft_version: '1' }, { planned_qty: 0 },
  'the_draft_has_at_least_one_positive_shippable_line'],
 ['a blank planned quantity', { draft_version: '1' }, { planned_qty: '' },
  'the_draft_has_at_least_one_positive_shippable_line'],
 ['a terminal line status', { draft_version: '1' }, { line_status: 'cancelled' },
  'the_draft_has_at_least_one_positive_shippable_line'],
 ['a line with no id', { draft_version: '1' }, { allocation_draft_line_id: '' },
  'every_shippable_line_carries_an_id'],
 ['a system draft with no calculation lineage', { draft_version: '1', calculation_run_id: '', formula_version: '' }, {},
  'the_provenance_the_core_demands_is_present']
].forEach(function (c, i) {
  var r = submitCensus(subWorld(c[1], c[2]), 'AI-NEW-1');
  ok(r.res.verdict === 'STOP' && failed(r.res).indexOf(c[3]) >= 0,
    'G10.' + (i + 1) + ' ' + c[0] + ' → STOP, naming ' + c[3], failed(r.res));
  eq(r.world.allWrites(), 0, 'G10.' + (i + 1) + 'a and still zero writes');
});
var G11 = submitCensus(pos(), 'NO-SUCH-DRAFT');
ok(G11.res.verdict === 'STOP' && failed(G11.res).indexOf('the_named_allocation_draft_exists') >= 0,
  'G11 a draft that does not exist is a named refusal, not an empty success', failed(G11.res));

// ================================================================================================================
section('H — two manifests, two authorizations, and neither implies the other');
// ================================================================================================================

var W0 = S1World(pos());
var MP = vm.runInContext('RUN_S1_MANIFEST_P()', W0.ctx);
var MS = vm.runInContext('RUN_S1_MANIFEST_S()', W0.ctx);
eq([MP.dry_run, MP.writes, MS.dry_run, MS.writes], [true, 0, true, 0],
  'H1  both manifests are dry-run with zero writes');
eq(W0.allWrites(), 0, 'H1a and producing them wrote nothing');
ok(String(MP.manifest).indexOf('MANIFEST P') === 0 && String(MS.manifest).indexOf('MANIFEST S') === 0,
  'H2  they are separately named');
ok(String(MP.boundary_note).indexOf('does NOT authorize MANIFEST S') > 0,
  'H3  P states in its own text that it does not authorize S', MP.boundary_note);
ok(String(MS.boundary_note).indexOf('INDEPENDENT of MANIFEST P') > 0,
  'H3a and S states that it is independent of P');
ok(MP.does_not_authorize.filter(function (x) { return /MANIFEST S/.test(x); }).length === 1,
  'H3b P lists Submit among the things it does not authorize', MP.does_not_authorize);
['Pending Approval', 'Confirm Overage'].forEach(function (x, i) {
  ok(MP.does_not_authorize.filter(function (y) { return y.indexOf(x) >= 0; }).length === 1,
    'H3c.' + (i + 1) + ' and so is ' + x);
  ok(MS.does_not_authorize.filter(function (y) { return y.indexOf(x) >= 0; }).length === 1,
    'H3d.' + (i + 1) + ' in S as well');
});
ok(MS.does_not_authorize.filter(function (x) { return /Shipment/.test(x); }).length >= 1,
  'H3e S does not authorize any Shipment');
ok(String(MS.boundary_note).indexOf('separate approval before any Shipment') > 0,
  'H3f and it says the resulting plan still needs its own approval');

// THE EXPECTED OUTCOMES ARE NUMBERS, so a readback can disagree with them.
eq([MP.expected_outcome.reservations, MP.expected_outcome.factory_stock_change,
  MP.expected_outcome.manual_rows_changed, MP.expected_outcome.other_scope_rows_changed,
  MP.expected_outcome.shipping_plans_changed, MP.expected_outcome.shipments_changed],
  [0, 0, 0, 0, 0, 0], 'H4  MANIFEST P expects zero of every side effect it must not have');
eq([MS.expected_outcome.total_exposure_delta, MS.expected_outcome.reservations,
  MS.expected_outcome.factory_stock_change, MS.expected_outcome.shipments_created],
  [0, 0, 0, 0], 'H4a MANIFEST S expects an exposure delta of zero and no reservation or shipment');
ok(String(MP.refusal_is_success_too).indexOf('zero writes is a') > 0,
  'H5  P states that a guard STOP with zero writes is a CORRECT outcome, not a failure');

// THE ROLLBACKS ARE COMPLETE, AND THEY NAME REAL MECHANISMS.
eq([MP.rollback.complete, MS.rollback.complete], [true, true], 'H6  both rollbacks are marked complete');
[['generate', MP.rollback, ['aiplExpirationCandidates_', 'PASS 1', 'ACK_UNKNOWN']],
 ['submit', MS.rollback, ['shippingPlanCommitFromLines_', 'execution_key', 'POSTCHECK_FAILED_ROLLBACK_UNVERIFIED']]]
  .forEach(function (c) {
    var blob = JSON.stringify(c[1]);
    c[2].forEach(function (needle, i) {
      ok(blob.indexOf(needle) >= 0,
        'H6.' + c[0] + '.' + (i + 1) + ' the ' + c[0] + ' rollback names ' + needle);
    });
  });
// And those mechanisms exist in the shipped source, so the rollback is not a description of a wish.
ok(read(GS + '69_api_v1_ai_plan_lifecycle.gs').indexOf('function aiplExpirationCandidates_') > 0,
  'H7  aiplExpirationCandidates_ exists in 69_');
ok(G16_SRC.indexOf('journalExtra') > 0 && G16_SRC.indexOf('draft_before') > 0,
  'H7a 16_ really does bind a journal with the draft before-state');
ok(G16_SRC.indexOf('POSTCHECK_FAILED_ROLLBACK_UNVERIFIED') > 0,
  'H7b and it really does have an INDETERMINATE outcome that is not reported as success');
ok(read('assets/js/pages/inventory-replenishment.js').indexOf('ACK_UNKNOWN') > 0,
  'H7c the browser really does hold an ACK_UNKNOWN outcome');

// THE OPERATOR WORDING. It must name the scope, the numbers, and what it does NOT authorize.
// S1-R4 — THIS BLOCK REQUIRED THE DEFECT. It asserted that P's wording CONTAINS <company>,
// <residual_qty> and four more placeholders — so the suite was holding in place the exact thing that
// made the manifest unusable: a sentence with nothing in it a person could agree or disagree with. It is
// now the opposite claim, and section M drives the whole manifest to prove it.
ok(MP.operator_authorization_wording === null || MP.verdict === 'READY_TO_AUTHORIZE',
  'H8  P offers a sentence to sign only on a READY_TO_AUTHORIZE run', MP.verdict);
eq((String(MP.operator_authorization_wording || '').match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []), [],
  'H8a and it carries NO placeholder — see section M for the measured values it carries instead');
ok(MP.verdict !== 'READY_TO_AUTHORIZE'
  || String(MP.operator_authorization_wording).indexOf('IT DOES NOT AUTHORIZE SUBMIT') > 0,
  'H8b a READY sentence still ends by refusing Submit');
['<allocation_draft_id>', '<draft_version>', '<execution_key>', '<total_planned_qty>',
 'ACK_UNKNOWN', 'IT DOES NOT ' + 'AUTHORIZE APPROVAL'].forEach(function (t, i) {
  ok(MS.operator_authorization_wording.indexOf(t) >= 0,
    'H9.' + (i + 1) + ' S\'s wording contains ' + t);
});
ok(MP.verdict !== 'READY_TO_AUTHORIZE'
  || String(MP.operator_authorization_wording).indexOf('exactly this one scope') > 0,
  'H8c and a READY sentence pins the allowlist to one scope');
ok(MS.operator_authorization_wording.indexOf('never by') > 0
  && MS.operator_authorization_wording.indexOf('retrying') > 0,
  'H9a and S\'s wording forbids retrying a timeout');

// ================================================================================================================
section('R — S1-R1: the eligible pair universe, and evidence that fits in its own log');
// ================================================================================================================
//
// PRODUCTION SAID STOP, AND IT WAS THIS FILE'S FAULT — with the reason unreadable, which made it worse.
//
//   failed = ["the_accepted_inventory_gap_run_is_readable_for_every_pair"]   ← the ONLY one
//   Logger  = "Logging output too large. Truncating output."
//
// The two predicates either side of it PASSED, and that combination is diagnostic on its own: at least one
// pair was readable AND accepting, and at least one other pair was not readable. A census that requires
// EVERY (company, country) pair in inventory_replenishment_gap to be readable is asking for something
// production has never required and cannot require — handleGenerateWeeklyAiPlanDraft_ demands a company AND
// a country and refuses without them, and weeklyAiPlanCanonicalDemand_ narrows to that pair BEFORE it
// resolves which snapshot date is accepted. Another company's stale rows in the same table were vetoing a
// scope they can never affect.
//
// AND THE LOG. S1_CHUNK_MAX_BYTES_ was 45000 against a sibling census that has shipped 3000 for rounds, with
// the whole per-module deployment manifest inside the same payload. The pair-level reasons existed and could
// not be read, which is the same as not having produced them.

function gapDiag(spec) {
  var w = S1World(spec);
  var out, threw = null;
  try { out = vm.runInContext('RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC()', w.ctx); }
  catch (e) { threw = e; }
  return { res: out || {}, threw: threw, world: w };
}
function logTags(w) {
  return (w.log || []).map(function (l) {
    var t = String(l).replace(/^\[S1\] /, '');
    var sp = t.indexOf(' ');
    return sp < 0 ? t : t.slice(0, sp);
  });
}
function maxLogBytes(w) {
  return (w.log || []).reduce(function (m, l) { return Math.max(m, String(l).length); }, 0);
}

// A pair no allowlist entry names, whose rows belong to an OLDER planning cycle. This is the production
// shape: readable for the eligible pair, unreadable for a foreign one.
var FOREIGN_PAIR = { company: 'ResEU', country: 'DE', marketplace: 'Amazon', sku: 'OTHER-SKU',
  calculation_status: 'READY', calculation_date: '2026-08-01',
  d18_suggested_qty: 0, d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 };

// ---- R1  THE DIAGNOSTIC IS READ ONLY, AND MEASURED SO. --------------------------------------------------
var R1 = gapDiag(pos({ extraGap: [FOREIGN_PAIR] }));
eq(R1.threw, null, 'R1  the readability diagnostic does not throw');
eq([R1.res.dry_run, R1.res.writes, R1.res.writer_calls], [true, 0, 0],
  'R1a dry_run, zero writes, zero writer calls');
eq([R1.res.generate_called, R1.res.submit_called, R1.res.migration_called, R1.res.refresh_started],
  [false, false, false, false],
  'R1b Generate, Submit, migration and refresh were all NOT called');
eq(R1.world.allWrites(), 0, 'R1c measured on every sheet in the world');

// ---- R2  THE LOG FITS. Four segments, one line per pair, and nothing near a limit. ---------------------
var R2tags = logTags(R1.world);
eq(R2tags, ['s1_gap_readability_summary', 's1_gap_pair_1_of_2', 's1_gap_pair_2_of_2',
  's1_gap_scope_1_of_1', 's1_gap_readability_verdict'],
  'R2  the four required segments, with ONE line per pair and one per eligible scope', R2tags);
ok(maxLogBytes(R1.world) < 3000,
  'R2a and the largest entry is under the chunk bound the sibling census proved', maxLogBytes(R1.world));
ok(R2tags.indexOf('s1_gap_failed') === -1,
  'R2b s1_gap_failed is emitted only when something failed — an empty failure line is noise');
// THE MANIFEST IS NOT IN THERE. That is what truncated the evidence the first time.
ok((R1.world.log || []).every(function (l) { return String(l).indexOf('WAP_BUILD_VERSION_') === -1; }),
  'R2c no per-module deployment row appears in any log entry');
eq(vm.runInContext('S1_CHUNK_MAX_BYTES_', R1.world.ctx), 3000,
  'R2d and the payload chunk bound is 3000, not the unmeasured 45000');

// ---- R3  THE ELIGIBLE UNIVERSE IS THE ALLOWLIST'S, AND IT AGREES WITH PRODUCTION'S OWN ANSWER. ----------
eq(R1.res.eligible.eligible_pairs, ['ResUS|US'],
  'R3  the eligible pair universe is exactly the allowlist\'s distinct (company, country)');
eq(R1.res.eligible.eligible_scopes, [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: SKU }],
  'R3a with the four-axis scopes it came from');
ok(String(R1.res.eligible.authority).indexOf('inventoryAiPlanActivationAllowlist_') === 0,
  'R3b named as the allowlist authority, re-gated per entry', R1.res.eligible.authority);
// BOUND TO PRODUCTION: weeklyAiPlanTargetScopes_ must answer with the same scopes for that pair.
var R3prod = vm.runInContext('weeklyAiPlanTargetScopes_({ company: "ResUS", country: "US", planningCycle: gapCalcResolveContext_().planningCycle }, "")', R1.world.ctx);
eq([R3prod.ok, R3prod.scopes], [true, [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: SKU }]],
  'R3c and PRODUCTION\'s own weeklyAiPlanTargetScopes_ returns the same scope set');
var R3other = vm.runInContext('weeklyAiPlanTargetScopes_({ company: "ResEU", country: "DE", planningCycle: gapCalcResolveContext_().planningCycle }, "")', R1.world.ctx);
eq([R3other.ok, R3other.reason], [false, 'AI_PLAN_SCOPE_NOT_ENABLED'],
  'R3d while the foreign pair is NOT a scope production would write — so its readability cannot gate this');

// ---- R4  THE REPRODUCTION, CLASSIFIED. ------------------------------------------------------------------
var R4 = R1.res.pairs.filter(function (p) { return p.pair === 'ResEU|DE'; })[0];
var R4e = R1.res.pairs.filter(function (p) { return p.pair === 'ResUS|US'; })[0];
eq([R4.eligible, R4.readable], [false, false], 'R4  the foreign pair is NOT eligible and NOT readable');
eq(R4.unreadable_reason, 'LINEAGE_MISMATCH', 'R4a its reason is named, not inferred');
ok(String(R4.freshness_reason).indexOf('RECO-2026-08') >= 0,
  'R4b with the freshness authority\'s OWN sentence, which is the useful part', R4.freshness_reason);
eq([R4.gap_row_count, R4.distinct_dates, R4.calculation_statuses], [1, ['2026-08-01'], ['READY']],
  'R4c and its row count, dates and statuses are on the same line');
eq([R4e.eligible, R4e.readable, R4e.freshness_state], [true, true, 'CURRENT_AFTER_REFRESH'],
  'R4d while the ELIGIBLE pair is readable and current');
eq([R1.res.verdict, R1.res.root_cause_class],
  ['ELIGIBLE_PAIRS_READABLE', 'DIAGNOSTIC_UNIVERSE_TOO_WIDE'],
  'R4e so the root cause is classified as this census\'s own too-wide universe');
ok(String(R1.res.next_action).indexOf('outside the activation allowlist') > 0,
  'R4f and the next action says why, naming the pair', R1.res.next_action);
eq(R1.res.failed_predicates, [], 'R4g with no failed predicate — nothing about the data is blocking');

// ---- R5  FAIL-CLOSED IS PRESERVED. An ELIGIBLE pair that cannot be read still STOPS. --------------------
var R5 = gapDiag(pos({ gap: { calculation_date: '2026-08-01' } }));
eq([R5.res.verdict, R5.res.root_cause_class], ['STOP', 'DATA_NOT_READY'],
  'R5  an ELIGIBLE pair the authority cannot read is DATA_NOT_READY and a STOP');
ok(R5.res.failed_predicates.indexOf('the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair') >= 0,
  'R5a naming the eligible-pair readability gate', R5.res.failed_predicates);
eq(R5.res.eligible_unreadable, ['ResUS|US'], 'R5b and naming WHICH eligible pair');
ok(String(R5.res.next_action).indexOf('not this file') > 0
  && String(R5.res.next_action).indexOf('Do not start it from here') > 0,
  'R5c the next action sends it to the Gap Job and forbids starting one here', R5.res.next_action);
ok(logTags(R5.world).indexOf('s1_gap_failed') >= 0,
  'R5d and NOW the failure segment is emitted');

// AN ELIGIBLE PAIR WITH NO ROW AT ALL is a different fact, and it is also DATA_NOT_READY.
var R6 = gapDiag(pos({ dropGap: true, extraGap: [FOREIGN_PAIR] }));
eq([R6.res.verdict, R6.res.root_cause_class], ['STOP', 'DATA_NOT_READY'],
  'R6  an eligible pair with NO gap row is DATA_NOT_READY, not an empty scope');
ok(R6.res.failed_predicates.indexOf('every_eligible_pair_has_rows_in_the_inventory_gap_table') >= 0,
  'R6a under its own predicate', R6.res.failed_predicates);

// ---- R7  ELIGIBILITY UNKNOWN MEANS NOTHING IS ASSUMED. -------------------------------------------------
var R7 = gapDiag(pos({ allowlist: [], extraGap: [FOREIGN_PAIR] }));
eq([R7.res.verdict, R7.res.root_cause_class], ['STOP', 'SCOPE_GUARD_UNAVAILABLE'],
  'R7  an empty allowlist cannot decide eligibility, so the diagnostic refuses');
ok(R7.res.failed_predicates.indexOf('the_eligible_pair_universe_is_derived_from_the_activation_allowlist') >= 0,
  'R7a naming the universe gate', R7.res.failed_predicates);
ok(String(R7.res.next_action).indexOf('Nothing is') >= 0
  || String(R7.res.next_action).indexOf('nothing is') >= 0,
  'R7b and stating that nothing is assumed while eligibility is unknown', R7.res.next_action);
eq(R7.res.pairs, [], 'R7c with no pair verdict at all — an unknown universe yields no pair opinions');

// ---- R8  THE FOUR WINDOWS, PER ELIGIBLE SCOPE, STORED OR NOT. ------------------------------------------
var R8 = R1.res.scopes[0];
eq(R8.scope, 'ResUS|US|Amazon|' + SKU, 'R8  the eligible scope is reported at four-axis identity');
eq(R8.windows_stored, { D18: 900, D30: 900, D45: 900, D90: 900 },
  'R8a with all four cumulative windows as STORED');
eq([R8.windows_missing, R8.windows_non_finite, R8.windows_negative], [[], [], []],
  'R8b none missing, none non-finite, none negative');
eq([R8.all_four_stored_finite_nonnegative, R8.calculation_status, R8.recommendation_state],
  [true, 'READY', 'NONZERO_RECOMMENDATION'], 'R8c and the summary flag, status and state agree');
// A BLANK WINDOW IS REPORTED AS NON-FINITE, never as a zero.
var R8b = gapDiag(pos({ gap: { d45_suggested_qty: '' } })).res.scopes[0];
eq([R8b.windows_non_finite, R8b.all_four_stored_finite_nonnegative], [['D45'], false],
  'R8d a blank window is NON-FINITE and the flag falls — a blank is never a zero', R8b && R8b.windows_stored);
var R8c = gapDiag(pos({ gap: { d30_suggested_qty: -5 } })).res.scopes[0];
eq([R8c.windows_negative, R8c.all_four_stored_finite_nonnegative], [['D30'], false],
  'R8e and a negative window is reported as negative');

// ---- R9  THE CENSUS ITSELF: a foreign unreadable pair no longer vetoes, and is still REPORTED. ----------
var R9 = census(pos({ extraGap: [FOREIGN_PAIR] }));
eq(R9.res.verdict, 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED',
  'R9  the production shape now reaches a candidate verdict');
eq(failed(R9.res), [], 'R9a with no failed predicate', failed(R9.res));
eq(R9.res.eligible_universe.eligible_pairs, ['ResUS|US'], 'R9b eligible universe = the allowlist pair');
eq(R9.res.eligible_universe.gap_table_pairs, ['ResEU|DE', 'ResUS|US'],
  'R9c while BOTH table pairs are still enumerated — nothing is hidden');
eq(R9.res.non_eligible_unreadable_pairs, ['ResEU|DE'],
  'R9d and the unreadable foreign pair is REPORTED, just not allowed to veto');
eq(R9.res.pair_readability.map(function (p) { return [p.pair, p.eligible, p.readable]; }),
  [['ResEU|DE', false, false], ['ResUS|US', true, true]],
  'R9e per-pair readability is carried for every pair in the table');
var R9c = scopeOf(R9, SKU);
eq([R9c.is_candidate, R9c.residual_qty, R9c.proposed_ai_allocation_qty], [true, 380, 380],
  'R9f and the eligible scope is a candidate with the same numbers as before');
// A NON-ELIGIBLE identity is never a candidate and never a rejection in these lists — it is reported at
// PAIR grain instead, because per-identity candidacy for a scope nobody authorized is a meaningless claim.
eq(R9.res.candidates.concat(R9.res.rejected).filter(function (r) {
  return r.scope && r.scope.company === 'ResEU'; }), [],
  'R9g no foreign identity enters the candidate or rejection lists');

// ---- R10 AND THE FAIL-CLOSED HALF OF THE SAME CHANGE. --------------------------------------------------
var R10 = census(pos({ gap: { calculation_date: '2026-08-01' } }));
eq(R10.res.verdict, 'STOP',
  'R10 an ELIGIBLE pair the authority cannot read still STOPS the census');
ok(failed(R10.res).indexOf('the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair') >= 0,
  'R10a naming the eligible-pair gate', failed(R10.res));
eq([R10.res.candidates, R10.res.scopes_examined], [[], 0],
  'R10b with no candidate and nothing examined');
var R10c = census(pos({ allowlist: [], extraGap: [FOREIGN_PAIR] }));
eq(R10c.res.verdict, 'STOP', 'R10c an empty allowlist STOPS the census too');
ok(failed(R10c.res).indexOf('the_eligible_pair_universe_is_derived_from_the_activation_allowlist') >= 0,
  'R10d naming the universe gate rather than proceeding on the whole table', failed(R10c.res));

// ---- R11 THE RUN ID COMES FROM ITS OWN AUTHORITY. ------------------------------------------------------
// inventory_replenishment_gap has NO calculation_run_id column (43_ INV_GAP_HEADERS_), so reading it off the
// row reported null for everything and made a resolvable run id look unknown.
var R11cols = vm.runInNewContext(extractVar(read(GS + '43_api_v1_gap_materialization.gs'), 'INV_GAP_HEADERS_')
  + ' INV_GAP_HEADERS_');
eq(R11cols.indexOf('calculation_run_id'), -1,
  'R11 the gap table genuinely has no calculation_run_id column');
eq(R9.res.accepted_run.lineage.run_id, 'GAP-INV-20260905-0300',
  'R11a and the census reports the run id from weeklyAiPlanResolveGapRunLineage_');
ok(String(R9.res.accepted_run.lineage.authority).indexOf('GAP_JOB_INVENTORY') > 0,
  'R11b naming the script property it actually came from', R9.res.accepted_run.lineage.authority);
eq(R9c.calculation_run_id, 'GAP-INV-20260905-0300',
  'R11c so a candidate row carries a real run id instead of a null');
eq(R1.res.lineage.run_id, 'GAP-INV-20260905-0300',
  'R11d and the readability diagnostic reports the same one');

// ---- R12 THE DEPLOYMENT MANIFEST IS A SUMMARY IN THE PAYLOAD. ------------------------------------------
var R12 = R9.res.environment.deployment;
eq([typeof R12.module_count, R12.modules === undefined], ['number', true],
  'R12 the deployment is carried as COUNTS, with no per-module row array');
ok(String(R12.note).indexOf('SUMMARY ONLY') === 0,
  'R12a and it says so, naming what it caused', R12.note);

// ================================================================================================================
section('S — S1-R2: the row grain, and a discovery layer that finds candidates and can execute none');
// ================================================================================================================
//
// PRODUCTION RAN CLEAN AND ANSWERED THE WRONG QUESTION, AND IT WAS THIS FILE'S FAULT.
//
//   verdict = NO_POSITIVE_RESIDUAL_CANDIDATE   predicates_failed = 0   scopes_examined = 118   candidates = 0
//   recommendation_state: NONZERO_RECOMMENDATION = 100, MISSING_RECOMMENDATION = 18
//   calculation_status:   READY = 1, null = 117
//   and: identities whose residual_qty was NULL printed FULLY_COVERED_BY_ACTIVE_PLAN beside it.
//
// TWO DEFECTS, ONE CAUSE: A CENSUS WRITING AGGREGATE ANSWERS INTO ROW-GRAIN FIELDS.
//
// (1) `weeklyAiPlanRecommendationState_().state` and `weeklyAiPlanNoActionDecision_().reason` describe the WHOLE
//     authorized TARGET SET. The census asked once, with the allowlist's target set — one scope in production —
//     and stamped that one answer onto all 118 identities of the pair. So 100 identities the authority had never
//     evaluated claimed NONZERO_RECOMMENDATION and FULLY_COVERED_BY_ACTIVE_PLAN with a null residual in the same
//     row. `READY = 1, null = 117` is the same defect seen from the other side: only the allowlisted identity
//     had a per_scope entry, so only it could report a status. That statistic was never a fact about the data.
//
// (2) The census could only ever answer for the exact four-axis allowlist, and its verdict did not say so.
//     `NO_POSITIVE_RESIDUAL_CANDIDATE` read as a statement about ResUS|US when it was a statement about one SKU.
//
// AND THE BOOTSTRAP RUNS IN THE OTHER ORDER. A person has to SEE which identity is worth a first controlled run
// before anybody moves the allowlist to it. That question is now a separate entry point with its own boundary:
// it lists, it ranks, and there is no value of any field it returns that means "go".

var OTHER2 = 'CO2200-X';
// The PRODUCTION SHAPE: the one allowlisted identity fully covered (160 against 520 already planned), and a
// second identity in the SAME pair and marketplace that no allowlist entry names, short by 700.
var PSHAPE = pos({
  gap: { d18_gap_qty: 0, d18_suggested_qty: 0, d30_suggested_qty: 0, d45_suggested_qty: 0,
    d90_gap_qty: 160, d90_suggested_qty: 160 },
  extraGap: [{ sku: OTHER2, calculation_status: 'READY',
    d18_gap_qty: 700, d18_suggested_qty: 700, d30_suggested_qty: 700, d45_suggested_qty: 700,
    d90_gap_qty: 700, d90_suggested_qty: 700 }],
  factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 100 },
    { warehouse_id: WHF, sku: OTHER2, fac_current_stock: 900, fac_reserved_stock: 0 }]
});

function proposal(spec) {
  var w = S1World(spec);
  var out, threw = null;
  try { out = vm.runInContext('RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS()', w.ctx); }
  catch (e) { threw = e; }
  return { res: out || {}, threw: threw, world: w };
}
function propOf(p, sku) {
  var hit = null;
  ((p.res.proposals) || []).forEach(function (r) { if (r.scope && r.scope.sku === sku) hit = r; });
  return hit;
}
function rejIdx(p, sku) {
  var hit = null;
  ((p.res.rejection_index) || []).forEach(function (r) {
    if (String(r.scope_key).split('|')[3] === sku) hit = r;
  });
  return hit;
}
function cls(w, state, r, q, d) {
  return vm.runInContext('S1_rowNoActionClass_(' + JSON.stringify(state) + ',' + JSON.stringify(r)
    + ',' + JSON.stringify(q) + ',' + JSON.stringify(d) + ')', w.ctx);
}

// ---- S1 — THE ONE THE PRODUCTION PAYLOAD SHOWED. A NULL RESIDUAL IS NOT A COVERED ONE. -------------------
var CW = S1World(pos());
var S1a = cls(CW, 'NONZERO_RECOMMENDATION', 160, 520, null);
ok(S1a.class !== 'FULLY_COVERED_BY_ACTIVE_PLAN',
  'S1  a NULL residual is never FULLY_COVERED_BY_ACTIVE_PLAN', S1a.class);
eq([S1a.class, S1a.refusal], ['UNKNOWN', 'RESIDUAL_QTY_IS_NOT_A_FINITE_NUMBER'],
  'S1a it is UNKNOWN, and the refusal names the input that was absent');
eq(cls(CW, 'NONZERO_RECOMMENDATION', 160, 520, '').refusal, 'RESIDUAL_QTY_IS_NOT_A_FINITE_NUMBER',
  'S1b a BLANK residual is refused the same way — a blank is never a zero');
eq(cls(CW, 'NONZERO_RECOMMENDATION', null, 520, 0).refusal, 'RECOMMENDED_QTY_IS_NOT_A_FINITE_NUMBER',
  'S1c a null recommended_qty is refused, and named separately');
eq(cls(CW, 'NONZERO_RECOMMENDATION', 160, null, 0).refusal, 'QUALIFYING_PLANNED_QTY_IS_NOT_A_FINITE_NUMBER',
  'S1d a null qualifying qty is refused, and named separately');
// Only all three finite AND a zero residual may say FULLY_COVERED — the exact shape R5-R1 proved.
eq(cls(CW, 'NONZERO_RECOMMENDATION', 160, 520, 0).class, 'FULLY_COVERED_BY_ACTIVE_PLAN',
  'S1e the proved 160 / 520 / 0 shape IS FULLY_COVERED_BY_ACTIVE_PLAN');
eq(cls(CW, 'VALID_ZERO_RECOMMENDATION', 0, 520, 0).class, 'VALID_ZERO_RECOMMENDATION',
  'S1f and a valid zero keeps its own class — the split follows the STATE, as 61_ does it');
eq(cls(CW, 'NONZERO_RECOMMENDATION', 900, 520, 380).class, 'RESIDUAL_REMAINS',
  'S1g a positive residual is RESIDUAL_REMAINS, which is not a no-action at all');
eq(cls(CW, 'MISSING_RECOMMENDATION', null, null, null).class, 'MISSING_RECOMMENDATION',
  'S1h a MISSING recommendation stays MISSING');
// A state nobody has seen yet must STOP rather than fall into the coverage branch.
ok(cls(CW, 'BOGUS_STATE', 160, 520, 0).class === 'UNKNOWN'
  && String(cls(CW, 'BOGUS_STATE', 160, 520, 0).refusal)
    .indexOf('RECOMMENDATION_STATE_IS_NOT_ONE_THIS_CENSUS_RECOGNISES: BOGUS_STATE') === 0,
  'S1i an unrecognised state is UNKNOWN — a future enum value cannot be absorbed into coverage',
  cls(CW, 'BOGUS_STATE', 160, 520, 0));
eq(cls(CW, '', 160, 520, 0).refusal, 'THE_RECOMMENDATION_AUTHORITY_RETURNED_NO_STATE_FOR_THIS_SCOPE',
  'S1j a blank state is a named refusal, not an empty pass');
// The pinned enum must still be the production one. A check that read its expectation from the thing it
// checks could not fail, so the pin lives here and the comparison lives in the suite.
eq(vm.runInContext('S1_RECOMMENDATION_STATES_.slice().sort()', CW.ctx).join(','),
  vm.runInContext('[WAP_RECOMMENDATION_STATES_.VALID_ZERO, WAP_RECOMMENDATION_STATES_.NONZERO,'
    + ' WAP_RECOMMENDATION_STATES_.MISSING].slice().sort()', CW.ctx).join(','),
  'S1k the pinned state vocabulary is exactly 61_\'s WAP_RECOMMENDATION_STATES_ values');

// ---- S2 — THE VERDICT NAMES ITS OWN SCOPE. ---------------------------------------------------------------
var S2 = census(PSHAPE);
eq(S2.res.verdict, 'NO_POSITIVE_RESIDUAL_CANDIDATE_IN_CURRENT_ALLOWLIST',
  'S2  the no-candidate verdict says WHICH universe it examined');
eq(failed(S2.res), [], 'S2a and it is a clean run, not a refusal', failed(S2.res));
eq(S2.res.scope_of_this_verdict.boundary, 'ACTIVATION_READINESS', 'S2b it declares its boundary');
ok(String(S2.res.scope_of_this_verdict.does_not_answer).indexOf('PROPOSAL_CENSUS') > 0,
  'S2c and names the entry point that answers the wider question',
  S2.res.scope_of_this_verdict.does_not_answer);
eq(S2.res.scope_of_this_verdict.allowlisted_identity_count, 1,
  'S2d exactly one examined identity was inside the allowlist');
eq(S2.res.activation_ready_count, 0, 'S2e and nothing is activation_ready');

// ---- S3 — THE ROW GRAIN. Every number is this identity's own. ---------------------------------------------
var S3in = scopeOf(S2, SKU), S3out = scopeOf(S2, OTHER2);
eq([S3in.recommended_qty, S3in.qualifying_manual_planned_qty, S3in.residual_qty], [160, 520, 0],
  'S3  the allowlisted identity is measured at 160 / 520 / 0 …');
eq(S3in.no_action_reason, 'FULLY_COVERED_BY_ACTIVE_PLAN', 'S3a … and is the proved no-action class');
eq(S3in.currently_allowlisted, true, 'S3b it is currently allowlisted');
// THE ROW THAT USED TO INHERIT. Same pair, same marketplace, a different SKU, short by 700.
eq([S3out.recommended_qty, S3out.qualifying_manual_planned_qty, S3out.residual_qty], [700, 0, 700],
  'S3c the NON-allowlisted identity is measured at its OWN 700 / 0 / 700 …');
eq(S3out.no_action_reason, 'RESIDUAL_REMAINS',
  'S3d … and its class is RESIDUAL_REMAINS, not the neighbour\'s FULLY_COVERED_BY_ACTIVE_PLAN');
ok(S3out.no_action_reason !== 'FULLY_COVERED_BY_ACTIVE_PLAN' && S3out.residual_qty !== null,
  'S3e neither a null residual nor an inherited class — the exact production defect',
  [S3out.no_action_reason, S3out.residual_qty]);
eq(S3out.recommendation_state_grain,
  'a single-scope ask of weeklyAiPlanRecommendationState_ about this identity alone',
  'S3f the state is named as this identity\'s own, and says how it was obtained');
// THE AGGREGATE IS STILL REPORTED — under a name that cannot be read as the row's. In this exact world it
// still says FULLY_COVERED_BY_ACTIVE_PLAN, which is TRUE of the allowlisted target set and false of this row.
eq(S3out.target_set.no_action_reason, 'FULLY_COVERED_BY_ACTIVE_PLAN',
  'S3g the target set\'s aggregate answer is preserved …');
ok(String(S3out.target_set.grain).indexOf('NOT THIS ROW') > 0,
  'S3h … and labelled as being about the whole scope set', S3out.target_set.grain);
eq(S3out.target_set.scope_count, 1, 'S3i the authorized set really does hold one scope');

// ---- S4 — AND IT IS STILL REFUSED, BY NAME. --------------------------------------------------------------
eq(S3out.is_candidate, false, 'S4  a non-allowlisted identity is not a readiness candidate …');
eq(S3out.activation_ready, false, 'S4a … and is not activation_ready …');
eq((S3out.refusal_reasons || [])[0], 'the_scope_is_in_the_current_activation_allowlist',
  'S4b … and the FIRST reason is the allowlist, not a story about readiness', S3out.refusal_reasons);
ok(!!proofOf(S3out, 'the_scope_is_in_the_current_activation_allowlist'),
  'S4c the gate is a named condition on the row');
eq(proofOf(S3in, 'the_scope_is_in_the_current_activation_allowlist').pass, true,
  'S4d and it passes for the identity that is in the allowlist');

// ---- S5 — THE DISCOVERY CENSUS FINDS IT. -----------------------------------------------------------------
var S5 = proposal(PSHAPE);
eq(S5.threw, null, 'S5  the proposal census runs', S5.threw && String(S5.threw.message));
eq(S5.res.verdict, 'PROPOSALS_FOUND_AUTHORIZATION_REQUIRED', 'S5a and finds the candidate the pair holds');
eq(failed(S5.res), [], 'S5b with no failed predicate', failed(S5.res));
eq(S5.res.boundary, 'PROPOSAL_DISCOVERY', 'S5c declaring the discovery boundary');
var S5p = propOf(S5, OTHER2);
ok(!!S5p, 'S5d the non-allowlisted positive-residual scope IS listed');
eq([S5p.recommended_qty, S5p.qualifying_manual_planned_qty, S5p.qualifying_ai_planned_qty, S5p.residual_qty],
  [700, 0, 0, 700], 'S5e with its own four quantities');
eq([S5p.source_factory_warehouse_id, S5p.pool.available_to_allocate, S5p.proposed_ai_allocation_qty,
  S5p.would_clamp], [WHF, 900, 700, false],
  'S5f and its pool, availability and proposed quantity = min(residual, available)');
eq(S5p.calculation_run_id, 'GAP-INV-20260905-0300',
  'S5g carrying the run id from the lineage authority, not from the gap row');
// The identity that is fully covered is REJECTED and still accounted for.
eq(propOf(S5, SKU), null, 'S5h the fully-covered identity is not a proposal …');
eq(rejIdx(S5, SKU).first_reason, 'residual_qty_is_finite_and_greater_than_zero',
  'S5i … and appears in the rejection index with the reason that actually applies to it');
eq(S5.res.identities_examined, 2, 'S5j both identities in the pair were examined');

// ---- S6 — AND IT AUTHORIZES NOTHING. ---------------------------------------------------------------------
eq(S5.res.selected, null, 'S6  nothing is selected …');
eq(S5.res.proposal_only, true, 'S6a … the whole census is proposal_only …');
eq([S5p.activation_ready, S5p.currently_allowlisted, S5p.authorization_required, S5p.proposal_only],
  [false, false, true, true],
  'S6b … and the listed row is not allowlisted, not activation ready, and requires authorization');
eq(S5.res.activation_ready_count, 0, 'S6c no proposal is activation_ready');
eq(S5.res.not_currently_allowlisted, ['ResUS|US|Amazon|' + OTHER2],
  'S6d the rows a person would have to move the allowlist for are named');
ok(failed(S5.res).indexOf('no_proposal_outside_the_allowlist_is_marked_activation_ready') < 0
  && S5.res.predicates.filter(function (p) {
    return p.predicate === 'no_proposal_outside_the_allowlist_is_marked_activation_ready'; }).length === 1,
  'S6e the boundary is a stated condition, not a comment');
// THE GATE IS PROVED STILL SHUT, by asking production's own scope authority about the listed row.
var S6g = S5.res.predicates.filter(function (p) {
  return p.predicate === 'the_production_scope_gate_still_refuses_every_non_allowlisted_proposal'; })[0];
ok(!!S6g && S6g.pass === true && String(JSON.stringify(S6g.observed)) === '[]',
  'S6f weeklyAiPlanTargetScopes_ still refuses every listed non-allowlisted scope', S6g);
ok(String(S5.res.next_action).indexOf('separate, explicit authorization') > 0
  || String(S5.res.next_action).indexOf('its own explicit authorization') > 0,
  'S6g and the next action says the allowlist move is its own authorization', S5.res.next_action);

// ---- S7 — THE DISCOVERY RANGE IS THE ALLOWLIST'S PAIRS, AND NOTHING WIDENS IT. ---------------------------
eq(S5.res.eligible_universe.eligible_pairs, ['ResUS|US'],
  'S7  the discovery range is the allowlist\'s distinct (company, country)');
// A pair no allowlist entry names is not examined AT ALL — not as a candidate, not as a rejection.
var FOREIGN2 = { company: 'ResEU', country: 'DE', marketplace: 'Amazon', sku: 'EU-SKU',
  calculation_status: 'READY', d18_suggested_qty: 4000, d30_suggested_qty: 4000,
  d45_suggested_qty: 4000, d90_suggested_qty: 4000 };
var S7 = proposal(pos({ extraGap: [FOREIGN2],
  factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 100 },
    { warehouse_id: WHF, sku: 'EU-SKU', fac_current_stock: 9000, fac_reserved_stock: 0 }] }));
eq(propOf(S7, 'EU-SKU'), null, 'S7a a scope outside the eligible pairs is never a proposal …');
eq(rejIdx(S7, 'EU-SKU'), null, 'S7b … and is not examined at all, rather than examined and refused');
eq(S7.res.eligible_universe.eligible_pairs, ['ResUS|US'], 'S7c the range did not widen to reach it');
// AN EMPTY, ALL or WILDCARD ALLOWLIST YIELDS NOTHING. A discovery range that widens when the guard goes
// missing is the opposite of a guard.
var S7d = proposal(pos({ allowlist: [] }));
eq(S7d.res.verdict, 'STOP', 'S7d an empty allowlist STOPS the proposal census');
ok(failed(S7d.res).indexOf('the_discovery_range_is_derived_from_the_activation_allowlist') >= 0,
  'S7e naming the range as the thing that failed', failed(S7d.res));
eq(S7d.res.identities_examined, 0, 'S7f and it examines nothing — it never falls back to the gap table');
var S7g = proposal(pos({ allowlist: [{ company: 'ResUS', country: 'US', marketplace: 'ALL_SITES', sku: 'ALL' }] }));
eq(S7g.res.verdict, 'STOP', 'S7g an ALL/wildcard entry cannot open the range either');
eq(S7g.res.identities_examined, 0, 'S7h because the gate is re-asked per entry, exactly as 61_ re-asks it');

// ---- S8 — READ-ONLY, MEASURED. ---------------------------------------------------------------------------
eq(S5.world.allWrites(), 0, 'S8  the proposal census wrote nothing, counted on every sheet');
eq([S5.res.writes, S5.res.writer_calls], [0, 0], 'S8a and reports both as zero');
eq([S5.res.generate_called, S5.res.submit_called, S5.res.migration_called, S5.res.gap_job_called],
  [false, false, false, false], 'S8b Generate, Submit, migration and the Gap Job were none of them called');
eq([S5.res.allowlist_modified, S5.res.flag_modified, S5.res.script_properties_modified],
  [false, false, false], 'S8c and neither the allowlist, the flag nor a script property was modified');
eq(S5.res.environment.flag_value, false, 'S8d the generation flag was false throughout');
// The allowlist object itself is unchanged AFTER the run — a monkey-patch would show here.
eq(vm.runInContext('JSON.stringify(inventoryAiPlanActivationAllowlist_())', S5.world.ctx),
  vm.runInContext('JSON.stringify(INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_)', S5.world.ctx),
  'S8e and the allowlist authority still returns the config value it started with');
eq(vm.runInContext('inventoryAiPlanActivationAllowlist_().length', S5.world.ctx), 1,
  'S8f still exactly one entry');
// The proposal census is in the SAME zero-write source scan the rest of the file is under.
// S1-R4H - RE-AIMED AT THE CENSUS ITSELF. `setValues` is no longer absent from the FILE: R4H's rollback
// has one. A file-wide claim would now be false about a function it was never really about, so the claim
// is asked of the proposal census's own source, where it is both true and the thing that matters.
var S8gsrc = bareCode(extractFn(S1, 'RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS'));
ok(S8gsrc.length > 0 && S8gsrc.indexOf('setValue') < 0 && S8gsrc.indexOf('appendRow') < 0
  && S8gsrc.indexOf('clearContent') < 0 && S8gsrc.indexOf('getRange') < 0,
  'S8g and the proposal census itself reaches no write API at all');

// ---- S9 — THE SEGMENTED OUTPUT. §8's five names, and no 189-line payload. --------------------------------
var S9tags = logTags(S5.world);
eq(S9tags, ['s1_proposal_summary', 's1_proposal_candidate_1_of_1', 's1_proposal_rejection_counts',
  's1_proposal_verdict'], 'S9  exactly the named segments, in order, and no payload dump', S9tags);
ok(S9tags.indexOf('s1_proposal_failed') < 0,
  'S9a with no failure line when nothing failed — an empty one is noise');
var S9max = (S5.world.log || []).reduce(function (m, l) { return Math.max(m, String(l).length); }, 0);
ok(S9max < 3000, 'S9b every entry is under the chunk bound', S9max);
eq((S5.world.log || []).filter(function (l) { return /s1_payload/.test(String(l)); }).length, 0,
  'S9c and the whole payload is not logged at all');
// The failure line appears when there IS one, and only then.
ok(logTags(S7d.world).indexOf('s1_proposal_failed') >= 0,
  'S9d a failing run DOES emit s1_proposal_failed', logTags(S7d.world));
// The rejections are COUNTS plus a bounded sample — never 118 objects.
var S9r = (S5.world.log || []).filter(function (l) { return /s1_proposal_rejection_counts/.test(String(l)); })[0];
ok(String(S9r).indexOf('by_first_reason') > 0 && String(S9r).length < 3000,
  'S9e the rejections are logged as classified counts', String(S9r).length);
eq(S5.res.rejection_index.length, 1,
  'S9f while the complete per-identity list stays on the RETURN VALUE, so nothing disappears');
// The candidate census got the same treatment: a summary, a line per candidate, the counts.
var S9c = logTags(S2.world);
ok(S9c.indexOf('s1_candidate_summary') >= 0 && S9c.indexOf('s1_rejection_counts') >= 0,
  'S9g the readiness census emits the same shape of segments', S9c);
eq(S2.res.rejection_counts['the_scope_is_in_the_current_activation_allowlist'], 1,
  'S9h and its refusal counts are keyed by the first failed condition');

// ---- S10 — THE CHUNK COUNT IS BOUNDED, WHICH IS WHAT 189 PAYLOAD LINES WERE. -----------------------------
var S10w = S1World(pos());
var S10n = vm.runInContext('S1_emitChunked_("s1_payload", new Array(60000).join("x"))', S10w.ctx);
eq(S10n, 0, 'S10  a payload over the bound emits no chunks at all');
var S10last = String((S10w.log || [])[(S10w.log || []).length - 1]);
// S1-R4A — 21, NOT 20, AND THE EXTRA CHUNK IS THE POINT. The per-chunk budget is now the LINE budget: the
// tag and the '[S1] ' prefix come out of S1_CHUNK_MAX_BYTES_ instead of sitting on top of it, so the same
// 59,999-byte payload needs one more slice. Asserted as the DERIVED number rather than a fresh literal, so
// the claim stays "the count it reports is the count its own budget implies".
var S10budget = vm.runInContext('S1_chunkBudget_("s1_payload")', S10w.ctx);
ok(S10budget > 0 && S10budget < 3000, 'S10a0 the chunk budget is the line budget, not the payload budget',
  S10budget);
eq(S10last.indexOf('s1_payload_withheld') > 0, true,
  'S10a it says it was withheld', S10last.slice(0, 160));
ok(S10last.indexOf('"would_be_chunks":' + Math.ceil(59999 / S10budget)) > 0,
  'S10a1 and how many lines it would have been, at its own budget',
  [S10budget, Math.ceil(59999 / S10budget), S10last.slice(0, 160)]);
ok(S10last.indexOf('NOT TRUNCATED') > 0,
  'S10b and distinguishes withheld from truncated — a cut value is a wrong value');
eq(vm.runInContext('S1_emitChunked_("s1_small", new Array(2000).join("y"))', S10w.ctx), 1,
  'S10c a payload under the bound is still emitted whole');

// ---- S11 — THE SIX CONDITIONS THAT WERE IMPLIED AND ARE NOW STATED. -------------------------------------
['the_identity_carries_all_four_axes', 'every_schema_fingerprint_this_row_depends_on_is_present',
 'recommended_qty_is_a_finite_number', 'qualifying_manual_planned_qty_is_a_finite_number',
 'qualifying_ai_exposure_qty_is_a_finite_number', 'the_proposed_quantity_is_finite_and_greater_than_zero'
].forEach(function (n, i) {
  ok(!!proofOf(S3in, n), 'S11.' + (i + 1) + ' the row proves ' + n);
});
// A blank furthest window now names the RECOMMENDATION as absent rather than only the residual.
var S11f = scopeOf(census(pos({ gap: { d90_suggested_qty: '' } })), SKU);
ok(S11f.refusal_reasons.indexOf('recommended_qty_is_a_finite_number') >= 0,
  'S11a a blank window refuses the recommendation by name', S11f.refusal_reasons);
eq(S11f.no_action_reason, 'MISSING_RECOMMENDATION',
  'S11b and its class is MISSING_RECOMMENDATION — never a coverage claim');
// A proposal that would write nothing is not a proposal.
var S11g = scopeOf(census(pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU,
  fac_current_stock: 520, fac_reserved_stock: 0 }] })), SKU);
ok(S11g.refusal_reasons.indexOf('the_proposed_quantity_is_finite_and_greater_than_zero') >= 0,
  'S11c a proposed quantity of zero is refused by name',
  [S11g.proposed_ai_allocation_qty, S11g.refusal_reasons]);

// ---- S12 — THE TWO CENSUSES MEASURE THE SAME IDENTITY THROUGH THE SAME CODE. -----------------------------
// They must agree. Two readiness answers for one scope is the failure mode a readiness package cannot have.
var S12a = scopeOf(S2, OTHER2), S12b = propOf(S5, OTHER2);
eq([S12b.recommended_qty, S12b.qualifying_manual_planned_qty, S12b.residual_qty,
  S12b.proposed_ai_allocation_qty, S12b.recommendation_state, S12b.no_action_reason],
  [S12a.recommended_qty, S12a.qualifying_manual_planned_qty, S12a.residual_qty,
    S12a.proposed_ai_allocation_qty, S12a.recommendation_state, S12a.no_action_reason],
  'S12  both censuses measure the identity identically');
eq([S12a.boundary, S12b.boundary], ['ACTIVATION_READINESS', 'PROPOSAL_DISCOVERY'],
  'S12a differing only in the boundary each declares');
eq([S12a.is_candidate, S12b.is_candidate], [false, true],
  'S12b and in whether the allowlist gate is one of the conditions');
eq([S12a.activation_ready, S12b.activation_ready], [false, false],
  'S12c while NEITHER calls it activation ready — that needs the gate, in both');

// ---- S13 — THE PLAN AUTHORITY IS ASKED ONCE PER PAIR, NOT ONCE PER IDENTITY. -----------------------------
// 118 identities meant 236 reads of the same two tables for the same answer. The cache is keyed on
// (company, country) because weeklyAiPlanQualifyingPlannedQty_ filters on exactly those two.
var S13 = proposal(PSHAPE);
eq(S13.res.identities_examined, 2, 'S13  two identities examined …');
eq(propOf(S13, OTHER2).qualifying_manual_planned_qty, 0,
  'S13a … with the per-identity plan quantity still exact from the shared read');
eq(scopeOf(S2, SKU).qualifying_manual_planned_qty, 520,
  'S13b and the allowlisted identity still reads its own 520 from the same one call');

// ================================================================================================================
section('M — S1-R4: MANIFEST P re-measures, freezes a baseline, and a STOP hands over nothing');
// ================================================================================================================
//
// WHAT PRODUCTION GOT, AND IT WAS THIS FILE'S FAULT. RUN_S1_MANIFEST_P() was executed and returned a static
// object: preconditions as nine SENTENCES, an expected outcome with no measured number in it, and an
// authorization line still reading `<company> / <country> / <marketplace> / <sku>` against run
// `<calculation_run_id>`. Its only log line was `{ manifest: "P", dry_run: true, writes: 0 }`.
//
// There was no verdict because nothing had been decided, no evidence because nothing had been measured, and no
// freeze block because there was nothing to freeze. A manifest whose preconditions are prose asks a person to
// verify nine things by eye and then trust their memory of numbers taken on some other day — which is the
// failure this whole readiness package exists to remove.
//
// SO IT RE-MEASURES EVERY RUN, and it does that by RUNNING THE CANDIDATE CENSUS rather than measuring
// independently of it: two readiness answers for one scope is the one failure a readiness package cannot have.
// On top of that it adds the gates that are about AUTHORIZING rather than measuring — one allowlisted scope,
// that scope is the candidate, the deployment is uniform and is the build the manifest was written against,
// the flag is still false, and every field the baseline needs is readable.
//
// AND THE FREEZE HAS THREE LOCKS, because a freeze block is an authorization to proceed and a single later
// edit must not be able to leak one: the verdict assignment nulls it, the emitter refuses without a READY it
// was handed, and a READY whose authorization sentence is missing or still contains a placeholder is
// downgraded to STOP.

function manifestP(spec) {
  var w = S1World(spec);
  var out = null, threw = null;
  try { out = vm.runInContext('RUN_S1_MANIFEST_P()', w.ctx); } catch (e) { threw = e; }
  return { res: out || {}, threw: threw, world: w };
}
function mpTags(w) { return logTags(w); }
function chunkCount(w) {
  return logTags(w).filter(function (n) { return /^s1_manifest_p_freeze_paste_block_/.test(n); }).length;
}
function predOf(res, name) {
  return ((res && res.predicates) || []).filter(function (p) { return p.predicate === name; })[0] || null;
}

// ---- M1 — THE READY PATH. -------------------------------------------------------------------------------
var MP1 = manifestP(pos());
eq(MP1.threw, null, 'M1  the manifest runs', MP1.threw && String(MP1.threw.message));
eq(MP1.res.verdict, 'READY_TO_AUTHORIZE', 'M1a a live positive-residual world is READY_TO_AUTHORIZE',
  failed(MP1.res));
eq(MP1.res.predicates_failed, 0, 'M1b with no condition unmet', failed(MP1.res));
ok(MP1.res.predicates_passed >= 55,
  'M1c and it is a substantial ledger, not two lines of contract text', MP1.res.predicates_passed);
eq([MP1.res.dry_run, MP1.res.writes, MP1.res.writer_calls, MP1.res.writer_constructed],
  [true, 0, 0, false], 'M1d dry-run, zero writes, zero writer calls, no writer constructed');
eq(MP1.world.allWrites(), 0, 'M1e measured on every sheet in the world');

// THE CENSUS WAS RUN LIVE. This is the field that separates a manifest from a contract printer.
eq(MP1.res.census.ran_live, true, 'M2  the candidate census was RE-RUN by the manifest');
eq([MP1.res.census.verdict, MP1.res.census.predicates_failed],
  ['CANDIDATES_FOUND_AUTHORIZATION_REQUIRED', 0], 'M2a and it found candidates with nothing failed');
eq([MP1.res.census.writes, MP1.res.census.writer_calls], [0, 0], 'M2b writing nothing itself');
eq(MP1.res.census.selected, null, 'M2c and still selecting nothing — the allowlist is the choice');
ok(!!MP1.res.measurement_authorities && String(MP1.res.measurement_authorities.note)
  .indexOf('NOTHING here is a stored value') === 0,
  'M2d the manifest names its authorities and says none of them is a stored value');

// EVERY NUMBER §2 ASKS FOR, MEASURED, IN ONE PLACE.
var E = MP1.res.live_evidence_summary;
eq(E.scope, { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: SKU, scope_key: 'ResUS|US|Amazon|' + SKU },
  'M3  the exact four-axis scope');
eq([E.calculation_run_id, E.accepted_calculation_date, E.calculation_status, E.freshness_state],
  ['GAP-INV-20260905-0300', GAP_DATE, 'READY', 'CURRENT_AFTER_REFRESH'],
  'M3a the run id, accepted date, status and freshness');
eq(E.windows, { D18: 900, D30: 900, D45: 900, D90: 900}, 'M3b all four windows');
eq([E.recommended_qty, E.qualifying_manual_planned_qty, E.qualifying_ai_planned_qty, E.residual_qty],
  [900, 520, 0, 380], 'M3c the recommendation, the manual plan, the AI plan and the residual');
eq([E.source_factory_warehouse_id, E.available_to_allocate, E.proposed_ai_allocation_qty, E.would_clamp],
  [WHF, 1380, 380, false], 'M3d the warehouse identity, the headroom, the proposal and the clamp decision');
eq(E.evidence_gaps, 0, 'M3e and no field is unknown or unreadable');
eq(MP1.res.evidence_gaps.gaps, [], 'M3f named individually rather than counted', MP1.res.evidence_gaps);
ok(MP1.res.evidence_gaps.required_field_count >= 25,
  'M3g over a required set worth checking', MP1.res.evidence_gaps.required_field_count);

// THE DEPLOYMENT AND THE FLAG.
eq([E.mixed_deployment, E.stale_modules, E.flag_value, E.allowlist_entry_count],
  [false, 0, false, 1], 'M4  uniform deployment, no stale module, flag false, exactly one allowlisted scope');
eq(E.deployment_build, (S1.match(/var S1_BUILD_ = '([^']+)'/) || [])[1],
  'M4a and the deployment build is the one this manifest was written against');

// ---- M5 — THE BEFORE BASELINE. -------------------------------------------------------------------------
var FB = MP1.res.frozen_before;
ok(!!FB, 'M5  a BEFORE baseline was frozen');
var fbMissing = vm.runInContext('S1_FREEZE_REQUIRED_', MP1.world.ctx).filter(function (k) {
  return !Object.prototype.hasOwnProperty.call(FB, k);
});
eq(fbMissing, [], 'M5a carrying every field the declared contract requires', fbMissing);
eq([FB.manual_header_ids.length, FB.manual_line_ids.length, FB.manual_planned_total],
  [2, 2, 520], 'M5b with the existing manual identities enumerated and totalled');
ok(FB.manual_identity_fingerprint !== null,
  'M5c and fingerprinted, so a column moving inside a row is detectable', FB.manual_identity_fingerprint);
// S1-R4A — THIS ASSERTION HELD THE DEFECT IN PLACE. It read `FB.expected_ai_identities` and
// `FB.expected_ai_identity_count`, and the value behind both was `existing_affected_ai_identities` — the AI
// rows that ALREADY EXIST. In this world there are none, so the pair was [[], 0] and the suite agreed that a
// run which would create a header and a line was "expected" to touch nothing. The three sets are now three
// fields with three names, and the assertion is that they are DIFFERENT here rather than equal.
ok(FB.expected_ai_identities === undefined && FB.expected_ai_identity_count === undefined,
  'M5d the conflated field is GONE from the baseline, not merely documented',
  [FB.expected_ai_identities, FB.expected_ai_identity_count]);
eq([FB.existing_active_ai_identities, FB.existing_active_ai_identity_count], [[], 0],
  'M5d1 existing active AI identities — genuinely none in this world');
eq([FB.ai_expiration_candidates, FB.ai_expiration_candidate_count], [[], 0],
  'M5d2 and nothing for a run to expire, which is a DIFFERENT fact');
// THE ONE THE OLD FIELD COULD NEVER STATE: what a Generate would actually write.
eq([FB.expected_create_header_count, FB.expected_create_line_count,
  FB.expected_update_header_count, FB.expected_update_line_count], [1, 1, 0, 0],
  'M5d3 while the run is predicted to CREATE one header and one line, and update nothing');
ok(FB.expected_header_ids.length === 1 && /^SADH-K2-[0-9A-F]+$/.test(FB.expected_header_ids[0]),
  'M5d4 named by its deterministic K2 header id', FB.expected_header_ids);
ok(FB.expected_line_ids.length === 1 && /^SADL-K2-[0-9A-F]+$/.test(FB.expected_line_ids[0]),
  'M5d5 and its deterministic K2 line id', FB.expected_line_ids);
eq(FB.expected_k2_group_keys.length, 1, 'M5d6 across one route group, keyed canonically',
  FB.expected_k2_group_keys);
// AND THE FOURTH SET, WHICH IS A DERIVATION: nothing existed, nothing expires, one is written.
eq(FB.expected_post_generation_active_ai_identities, FB.expected_header_ids,
  'M5d7 so the post-generation AI set is exactly the one written identity');
eq(FB.writeset_measurable, true, 'M5d8 measured, not approximated', FB.writeset_stage);
// S1-R4C §2 — TWO POPULATIONS, ASSERTED APART. These three used to read `identity_universe_count` and
// `other_scope_identity_count`, and a live run put 118 and 117 of them next to 11 header rows and 13 line
// rows under that one word. The gap scope count is a count of GAP SCOPES; the draft row count is a count of
// SHEET ROWS; and the freeze now names which is which so a readback cannot compare one against the other.
ok(FB.gap_scope_universe_count === undefined && FB.identity_universe_count === undefined
  && FB.other_scope_identity_count === undefined,
  'M5e0 the ambiguous `identity universe` names are gone from the baseline',
  [FB.identity_universe_count, FB.other_scope_identity_count]);
eq(FB.gap_scope_universe_population, 'INVENTORY_GAP_SCOPES',
  'M5e the gap scope universe says what population it counts');
ok(FB.gap_scope_universe_total_count >= 1 && FB.gap_scope_universe_fingerprint !== null,
  'M5e2 by count and fingerprint',
  [FB.gap_scope_universe_total_count, FB.gap_scope_universe_fingerprint]);
eq(FB.gap_scope_universe_target_count, 1, 'M5e3 the target scope is exactly one of them');
eq(FB.gap_scope_universe_total_count,
  FB.gap_scope_universe_target_count + FB.gap_scope_universe_other_count,
  'M5e4 and the split is exact arithmetic');
eq(FB.gap_scope_universe_other_count, 0, 'M5f and how many GAP SCOPES are not this one');
// ---- and the draft ROW universe, which is a different number counted from different sheets ----
eq(FB.draft_row_universe_population, 'ALLOCATION_DRAFT_ROWS',
  'M5f2 the draft row universe names its own population');
eq(FB.draft_row_universe_total_row_count,
  FB.draft_row_universe_header_count + FB.draft_row_universe_line_count,
  'M5f3 its total is header rows plus line rows',
  [FB.draft_row_universe_header_count, FB.draft_row_universe_line_count,
    FB.draft_row_universe_total_row_count]);
eq(FB.draft_row_universe_total_row_count,
  FB.draft_row_universe_target_row_count + FB.draft_row_universe_other_scope_row_count,
  'M5f4 and it partitions exactly into target-scope and other-scope rows');
// The other-scope bucket is already frozen under its R4A names, and this ties the two namings to the same
// rows: if they ever described different populations the arithmetic would stop closing.
eq(FB.draft_row_universe_other_scope_row_count,
  FB.other_scope_header_count + FB.other_scope_line_count,
  'M5f5 with the other-scope total being its own header and line counts',
  [FB.other_scope_header_count, FB.other_scope_line_count,
    FB.draft_row_universe_other_scope_row_count]);
eq(FB.draft_row_universe_row_signature_count, FB.draft_row_universe_total_row_count,
  'M5f6 every draft row carries exactly one full-row signature');
ok(FB.draft_row_universe_combined_fingerprint !== null,
  'M5f7 and the whole row universe has a full-content fingerprint',
  FB.draft_row_universe_combined_fingerprint);
ok(Object.keys(FB.schema_fingerprints).length >= 7,
  'M5g the schema fingerprints the quantities were measured against',
  Object.keys(FB.schema_fingerprints));
eq([FB.factory_current_stock, FB.factory_reserved_stock, FB.active_allocation_draft_qty,
  FB.active_shipping_plan_qty, FB.available_to_allocate], [2000, 100, 520, 0, 1380],
  'M5h the factory pool snapshot, term by term');
eq([FB.expected_max_units_written, FB.expected_clamp], [380, false],
  'M5i and the most a correct run may write, plus whether it would clamp');
// THE RESERVATION OBSERVATION. Absent is a STATE, and its row count is null and not zero.
eq(FB.reservation_observation_state, 'SHEET_ABSENT',
  'M5j the reservation observation state is recorded');
eq(FB.reservation_row_count, null,
  'M5k and an absent table has a NULL row count — never a zero');
eq(MP1.res.reservation_observation.acceptable, true,
  'M5l acceptable here only because 61_ declares the table zero-mutation',
  MP1.res.reservation_observation);
ok(String(MP1.res.reservation_observation.authority).indexOf('SERVER_MANIFEST') === 0,
  'M5m on that authority, by name', MP1.res.reservation_observation.authority);

// ---- M6 — THE FREEZE BLOCK AND ITS DESTINATION. -------------------------------------------------------
ok(!!MP1.res.freeze_paste_block, 'M6  a freeze paste block was built');
ok(String(MP1.res.freeze_paste_block).indexOf('S1_MANIFEST_P_BEFORE_') > 0,
  'M6a naming the symbol it is pasted into');
ok(chunkCount(MP1.world) >= 1, 'M6b and it is emitted in numbered chunks', mpTags(MP1.world));
var mpMeta = (MP1.world.log || []).filter(function (l) { return /s1_manifest_p_freeze_paste_meta/.test(String(l)); })[0];
ok(!!mpMeta, 'M6c with a freeze meta line');
['"chunks":', '"bytes":', '"paste_into":"S1_MANIFEST_P_BEFORE_"'].forEach(function (t, i) {
  ok(String(mpMeta).indexOf(t) > 0, 'M6d.' + (i + 1) + ' the meta carries ' + t, String(mpMeta).slice(0, 200));
});
ok(mpTags(MP1.world).indexOf('s1_manifest_p_freeze_withheld') === -1,
  'M6e and no withheld line on a READY run — an empty refusal is noise', mpTags(MP1.world));
// THE DESTINATION EXISTS, IS NULL, AND IS NEVER WRITTEN BY CODE.
eq(vm.runInContext('S1_MANIFEST_P_BEFORE_', MP1.world.ctx), null,
  'M6f the destination symbol exists and is still null');
// ASSIGNMENTS ONLY. `\s*=` also matched the `===` in the destination-is-empty condition and reported three
// assignments where there is one. A comparison is not an assignment.
eq((S1_BARE.match(/S1_MANIFEST_P_BEFORE_\s*=(?!=)/g) || []).length, 1,
  'M6g and the file ASSIGNS it exactly once — its own declaration, never from code',
  S1_BARE.match(/S1_MANIFEST_P_BEFORE_\s*=(?!=)/g));
// EVERY LOG LINE FITS. This is a manifest, not a payload dump.
var mpMax = (MP1.world.log || []).reduce(function (m, l) { return Math.max(m, String(l).length); }, 0);
ok(mpMax < 3000, 'M6h every emitted line is under the chunk bound', mpMax);
eq((MP1.world.log || []).filter(function (l) { return /s1_payload|s1_candidate_summary/.test(String(l)); }).length, 0,
  'M6i and the census it ran did NOT dump its own payload over the verdict');

// ---- M7 — THE AUTHORIZATION WORDING, WITH THE MEASUREMENTS IN IT. -------------------------------------
var Wd = MP1.res.operator_authorization_wording;
ok(!!Wd, 'M7  a READY run produces an authorization sentence');
eq((String(Wd).match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []), [],
  'M7a with NO placeholder left in it — the defect this round was called to repair');
[SKU, 'ResUS', 'US', 'Amazon', 'GAP-INV-20260905-0300', GAP_DATE, '900', '520', '380', '1380', WHF,
 'IT DOES NOT AUTHORIZE SUBMIT'].forEach(function (t, i) {
  ok(String(Wd).indexOf(t) >= 0, 'M7b.' + (i + 1) + ' and it names ' + t);
});
ok(String(Wd).indexOf('exactly this one scope') > 0, 'M7c it still pins the allowlist to one scope');
ok(String(Wd).indexOf('AT MOST 380 units') > 0, 'M7d and states the ceiling as a number');

// ---- M8 — EVERY STOP, AND NOT ONE OF THEM LEAKS. -----------------------------------------------------
// S1-R4B — THESE ARE NOW THE REAL SHAPE WITH ONE FIELD MOVED, not hand-written objects.
//
// Both used to be `function sysModuleBuildStamps_() { return { available: true, … modules: [] … }; }` — the
// invented field again, plus an EMPTY module list, so the half of the contract that detects a partial sync
// was never exercised and each negative case failed for more reasons than the one it was named for. Built
// from REAL_STAMPS_ so exactly one thing differs and the failing predicate names exactly that thing.
var STALE_DEP = { stamps: stampsWith_({
  stale_modules: ['00_config.gs declares F1-OLD, expected F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6'],
  mixed_deployment: true,
  verdict: 'MIXED_OR_PARTIAL_SYNC — at least one owner file is absent from, or older than, what this'
    + ' deployment expects. Re-copy the files listed and publish a NEW deployment version.' }) };
var OTHER_BUILD = { stamps: stampsWith_({
  deployment_build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9' }) };
var YDAY = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
var STOPS = [
  ['the flag is already true', { flag: true }, null],
  ['the allowlist is widened to two scopes', { allowlist: [
    { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: SKU },
    { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1150-R' }] },
    'the_activation_allowlist_holds_exactly_one_scope'],
  ['the allowlist names a DIFFERENT scope', { allowlist: [
    { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'OTHER-SKU' }] }, null],
  ['the allowlist is empty', { allowlist: [] }, null],
  ['the scope is fully covered, so there is no residual', { gap: { d18_gap_qty: 0, d18_suggested_qty: 0,
    d30_suggested_qty: 0, d45_suggested_qty: 0, d90_gap_qty: 160, d90_suggested_qty: 160 } }, null],
  ['a window is blank, so the recommendation is MISSING', { gap: { d90_suggested_qty: '' } }, null],
  ['the recommendation is not READY', { gap: { calculation_status: 'PENDING' } }, null],
  ['the snapshot is yesterday-only and the refresh window has passed',
    { gap: { calculation_date: YDAY }, pinHour: 20 }, null],
  ['there is no factory pool for the sku', { factory_stock: [] }, null],
  ['availability is exhausted', { factory_stock: [{ warehouse_id: WHF, sku: SKU,
    fac_current_stock: 520, fac_reserved_stock: 0 }] }, null],
  ['the source warehouse is ambiguous', { factory_stock: [
    { warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 100 },
    { warehouse_id: 'FW-TW', sku: SKU, fac_current_stock: 900, fac_reserved_stock: 0 }] }, null],
  ['the gap table is gone (schema drift)', { dropGap: true }, null],
  ['the deployment is mixed', STALE_DEP, 'the_deployment_is_not_mixed'],
  ['the deployment is a build nobody measured on', OTHER_BUILD,
    'the_deployment_build_is_the_one_this_manifest_was_written_against']
];
STOPS.forEach(function (c, i) {
  var spec = pos();
  Object.keys(c[1]).forEach(function (k) { spec[k] = c[1][k]; });
  var x = manifestP(spec);
  var n = 'M8.' + (i + 1);
  eq(x.res.verdict, 'STOP', n + ' STOP: ' + c[0], failed(x.res));
  ok(failed(x.res).length > 0, n + 'a with at least one named failed condition', failed(x.res));
  ok(String(x.res.stop_reason || '').length > 20, n + 'b and a stop_reason that says which',
    x.res.stop_reason);
  // THE THREE THINGS A STOP MUST NOT HAND OVER.
  eq(x.res.freeze_paste_block, null, n + 'c the freeze block is null');
  eq(chunkCount(x.world), 0, n + 'd NOT ONE pasteable chunk was emitted', mpTags(x.world));
  eq(x.res.operator_authorization_wording, null, n + 'e and there is no sentence to sign');
  ok(mpTags(x.world).indexOf('s1_manifest_p_freeze_withheld') >= 0,
    n + 'f while the withholding is REPORTED, not silent', mpTags(x.world));
  eq(x.world.allWrites(), 0, n + 'g and it wrote nothing');
  if (c[2]) {
    ok(failed(x.res).indexOf(c[2]) >= 0, n + 'h naming ' + c[2], failed(x.res));
  }
});

// AND THE WITHHELD LINE SAYS WHERE NOT TO PASTE. A reader who expected chunks must be able to tell
// "the output was refused" from "the log was truncated".
var W8 = manifestP(pos({ allowlist: [] }));
var w8line = (W8.world.log || []).filter(function (l) { return /freeze_withheld/.test(String(l)); })[0];
['"chunks":0', '"paste_into":null', 'S1_MANIFEST_P_BEFORE_'].forEach(function (t, i) {
  ok(String(w8line).indexOf(t) > 0, 'M8w.' + (i + 1) + ' the withheld line carries ' + t,
    String(w8line).slice(0, 240));
});
// TWO DIFFERENT REASONS, AND THE DISTINCTION IS WORTH KEEPING. A run that failed before the baseline was
// constructed reports NOT_BUILT — there was nothing to withhold; a run that built one and then refused
// reports WITHHELD_BECAUSE. I asserted the second for a case that is honestly the first.
ok(/NOT_BUILT|WITHHELD_BECAUSE/.test(String(w8line)),
  'M8w.4 and names which of the two it is', String(w8line).slice(0, 240));
var W8b = manifestP(pos(OTHER_BUILD));
var w8bline = (W8b.world.log || []).filter(function (l) { return /freeze_withheld/.test(String(l)); })[0];
ok(/NOT_BUILT/.test(String(w8bline)),
  'M8w.5 a deployment refusal also reports NOT_BUILT, because the conditions run before the freeze',
  String(w8bline).slice(0, 200));

// ---- M9 — THE ALLOWLISTED SCOPE'S OWN REFUSAL IS SURFACED, so a STOP is actionable. ------------------
var M9 = manifestP(pos({ factory_stock: [] }));
eq(M9.res.verdict, 'STOP', 'M9  a missing factory pool is a STOP');
eq(M9.res.census.allowlisted_scope, 'ResUS|US|Amazon|' + SKU,
  'M9a and the manifest names WHICH scope it was asking about');
eq(M9.res.census.allowlisted_scope_was_measured, true,
  'M9b it WAS measured — the census refused it rather than never looking');
ok(M9.res.census.allowlisted_scope_refusals
  .indexOf('a_factory_pool_exists_for_this_exact_warehouse_and_sku') >= 0,
  'M9c and the refusal that applies to it is lifted out by name — "the census found no candidate"'
  + ' is true and not actionable', M9.res.census.allowlisted_scope_refusals);
ok(M9.res.census.allowlisted_scope_refusal_detail
  && M9.res.census.allowlisted_scope_refusal_detail.residual_qty === 380,
  'M9d with its measured numbers beside it, so the operator can see what IS true',
  M9.res.census.allowlisted_scope_refusal_detail);

// ---- M10 — THE BASELINE DESTINATION MUST BE EMPTY. ---------------------------------------------------
// A value already sitting there is a baseline from an earlier run, and freezing over it would silently
// replace the one that was signed.
var M10 = manifestP({ s1: S1.split('var S1_MANIFEST_P_BEFORE_ = null;')
  .join("var S1_MANIFEST_P_BEFORE_ = { frozen_at: 'an earlier run' };"), gap: POS.gap,
  factory_stock: POS.factory_stock });
eq(M10.res.verdict, 'STOP', 'M10 an occupied baseline destination is a STOP');
ok(failed(M10.res).indexOf('the_baseline_destination_is_empty_so_nothing_is_being_overwritten') >= 0,
  'M10a naming the destination, not something else', failed(M10.res));
eq(chunkCount(M10.world), 0, 'M10b and it emits no chunk over the one already frozen');

// ---- M11 — IDENTITY DRIFT IS VISIBLE IN THE BASELINE. -------------------------------------------------
// This round FREEZES; the AFTER readback is a later round. What must be true now is that the frozen values
// MOVE when the identities move — a baseline that reads the same for two different worlds cannot detect
// anything.
var AI_H = { allocation_draft_id: 'AI-OLD-9', planning_cycle: GAP_CYCLE, company: 'ResUS', country: 'US',
  marketplace: 'Amazon', status: 'draft', generation_type: 'system_generated',
  generation_run_id: 'RUN-OLD-9', source_page: 'inventory_replenishment',
  source_warehouse_id: WHF, recommended_destination_warehouse_id: 'WH-RESUS-US-3PL-AMZLGS' };
var AI_L = { allocation_draft_line_id: 'AI-OLD-9-L1', allocation_draft_id: 'AI-OLD-9', sku: SKU,
  planned_qty: '60', line_status: 'draft' };
var M11 = manifestP(pos({ extraHeaders: [AI_H], extraLines: [AI_L] }));
eq(M11.res.verdict, 'READY_TO_AUTHORIZE', 'M11 an existing AI draft is still a READY world', failed(M11.res));
// S1-R4A — THE THREE SETS, IN THE ONE WORLD THAT CAN TELL THEM APART. There is an existing AI draft here,
// so `existing` is 1; it is a `draft` in scope for the same cycle, so the lifecycle authority names it as an
// EXPIRATION candidate; and the run would still CREATE its own new header. The old single field could only
// ever report one of those three numbers, and it reported the first while being named for the third.
var FB11 = M11.res.frozen_before;
eq(FB11.existing_active_ai_identity_count, 1,
  'M11a one AI identity is active in this scope before the run', FB11.existing_active_ai_identities);
eq(FB11.ai_expiration_candidates, ['AI-OLD-9'],
  'M11a1 and the lifecycle authority names exactly it as the row a run would expire');
eq([FB11.expected_create_header_count, FB11.expected_create_line_count], [1, 1],
  'M11a2 while the run would CREATE a header and a line of its own');
ok(FB11.expected_header_ids.indexOf('AI-OLD-9') === -1,
  'M11a3 so the expired identity and the written identity are not the same row',
  [FB11.expected_header_ids, FB11.ai_expiration_candidates]);
eq(FB11.expected_post_generation_active_ai_identities, FB11.expected_header_ids,
  'M11a4 and after the run only the new identity is active: expired out, created in');
eq(M11.res.frozen_before.qualifying_ai_planned_qty, 60,
  'M11b with the AI exposure counted separately from the manual plan');
eq(M11.res.frozen_before.qualifying_manual_planned_qty, 520,
  'M11c which is unchanged — an AI draft is not an operator commitment');
// A CHANGED MANUAL IDENTITY CHANGES THE FINGERPRINT. Same count, different content.
// A manual quantity moving by one unit moves the RESIDUAL by one unit too (900 - 521 = 379), so the demand
// crossing the seam has to move with it — the netting that produces it happens upstream of the seam. Leaving
// the seam at 380 makes the prediction exceed the proposal by exactly one unit, which the manifest refuses:
// measured as a STOP on `the_predicted_lines_do_not_exceed_the_proposed_quantity`. That refusal is the guard
// doing its job, and it is asserted on its own below (M11d0) rather than tuned away.
var M11d0 = manifestP(pos({ aLine: { planned_qty: '321' } }));
eq(M11d0.res.verdict, 'STOP',
  'M11d0 a prediction one unit larger than the residual it is netted from is refused, not rounded',
  failed(M11d0.res));
ok(failed(M11d0.res).indexOf('the_predicted_lines_do_not_exceed_the_proposed_quantity') >= 0,
  'M11d0a and the named condition is the quantity cross-check', failed(M11d0.res));
eq(mpChunks(M11d0.world), 0, 'M11d0b with no freeze chunk emitted');
var M11d = manifestP(pos({ aLine: { planned_qty: '321' },
  demand: demandWith_(379) }));
ok(M11d.res.frozen_before
  && M11d.res.frozen_before.manual_identity_fingerprint !== FB.manual_identity_fingerprint,
  'M11d one manual quantity changing moves the manual fingerprint',
  [FB.manual_identity_fingerprint, M11d.res.frozen_before && M11d.res.frozen_before.manual_identity_fingerprint]);
eq(M11d.res.frozen_before.manual_planned_total, 521,
  'M11e and the frozen total follows it');
// A NEW IDENTITY IN ANOTHER SCOPE MOVES THE UNIVERSE FINGERPRINT.
var M11f = manifestP(pos({ extraGap: [{ sku: 'OTHER-SKU', calculation_status: 'READY',
  d18_suggested_qty: 0, d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 }] }));
ok(M11f.res.frozen_before
  && M11f.res.frozen_before.gap_scope_universe_fingerprint !== FB.gap_scope_universe_fingerprint,
  'M11f a GAP SCOPE appearing elsewhere moves the GAP SCOPE fingerprint',
  [FB.gap_scope_universe_fingerprint,
    M11f.res.frozen_before && M11f.res.frozen_before.gap_scope_universe_fingerprint]);
eq(M11f.res.frozen_before.gap_scope_universe_other_count, 1,
  'M11g and the other-scope count says how many GAP SCOPES are not this one');
// S1-R4C §2 — AND THE OTHER UNIVERSE DID NOT MOVE, which is the whole point of separating them. A new
// gap scope is not a new draft row: one population changed and the other did not, and a single
// `identity_universe` fingerprint could not have said which.
eq(M11f.res.frozen_before.draft_row_universe_combined_fingerprint,
  FB.draft_row_universe_combined_fingerprint,
  'M11g2 while the DRAFT ROW fingerprint is untouched — a gap scope is not a draft row');
eq(M11f.res.frozen_before.draft_row_universe_total_row_count, FB.draft_row_universe_total_row_count,
  'M11g3 and no draft row was added by adding a gap scope');

// ---- M12 — THE STATIC CONTRACT IS STILL THERE, because it was never the defect. -----------------------
eq([MP1.res.expected_outcome.reservations, MP1.res.expected_outcome.factory_stock_change,
  MP1.res.expected_outcome.manual_rows_changed, MP1.res.expected_outcome.other_scope_rows_changed,
  MP1.res.expected_outcome.shipping_plans_changed, MP1.res.expected_outcome.shipments_changed],
  [0, 0, 0, 0, 0, 0], 'M12 the zero side effects are still declared');
eq([MP1.res.expected_outcome.expected_max_units_written, MP1.res.expected_outcome.expected_clamp,
  MP1.res.expected_outcome.expected_superseded_ai_identities,
  MP1.res.expected_outcome.expected_manual_identities_unchanged],
  [380, false, 0, 2],
  'M12a and the expected outcome now carries MEASURED numbers a readback can disagree with');
ok(String(MP1.res.boundary_note).indexOf('does NOT authorize MANIFEST S') > 0,
  'M12b the boundary note is unchanged');
eq(MP1.res.rollback.complete, true, 'M12c and the rollback is still declared complete');



// ================================================================================================================
section('W — S1-R4A: the exact write set, and a freeze that covers every column');
// ================================================================================================================
// THE CLAIM UNDER TEST. MANIFEST P must name the exact K2 header and line identities a production Generate
// would create or update, and it must freeze enough of the current content that an AFTER readback can catch a
// row edited in place. W4's baseline could do neither: `expected_ai_identities` held the rows that already
// existed, and the fingerprints covered ids only.
//
// WHAT IS REAL HERE. Everything that decides the write set: KMWRB.buildWeeklySourceLines,
// weeklyAiPlanK2AllocatedLines_ (the allocator), KMWRR.buildK2GenerationPlan (route grouping), sadK2GroupKey_,
// sadK2DeterministicHeaderId_, sadK2DeterministicLineId_, sadK2ResolveActiveDraft_ (CREATE vs UPDATE) and
// aiplExpirationCandidates_ are all loaded from their shipped files. See the note in S1World for the one seam
// this fixture supplies and why it sits where it does.
var WG0 = MP1.res.predicted_write_set.route_groups[0];
var PRED_H = WG0.allocation_draft_id, PRED_L = WG0.line_ids[0];

// ---- W1 — THE IDENTITIES ARE PRODUCED BY THE PRODUCTION AUTHORITIES, NOT BY THIS FILE. -------------------
// Recomputed here by calling the SAME shipped functions with the SAME header the manifest reported, so the
// claim is "the manifest used the authority", not "the manifest produced a plausible-looking string".
var W1hdr = { planning_cycle: GAP_CYCLE, company: 'ResUS', country: 'US', marketplace: 'Amazon',
  source_page: 'inventory_replenishment',
  recommended_source_warehouse_id: WG0.source_warehouse_id,
  recommended_destination_warehouse_id: WG0.destination_warehouse_id,
  recommended_shipping_method: WG0.shipping_method,
  recommended_last_mile_delivery: WG0.last_mile_delivery,
  recommendation_group_no: WG0.recommendation_group_no };
var W1key = vm.runInContext('sadK2GroupKey_(' + JSON.stringify(W1hdr) + ')', MP1.world.ctx);
var W1id = vm.runInContext('sadK2DeterministicHeaderId_(' + JSON.stringify(W1hdr) + ')', MP1.world.ctx);
eq(WG0.k2_group_key, W1key, 'W1  the reported K2 group key is sadK2GroupKey_ of the reported header');
eq(PRED_H, W1id, 'W1a and the header id is sadK2DeterministicHeaderId_ of that same header');
ok(/^SADH-K2-[0-9A-F]{8}$/.test(PRED_H), 'W1b in the deterministic K2 header form', PRED_H);
ok(/^SADL-K2-[0-9A-F]{8}$/.test(PRED_L), 'W1c and the line in the deterministic K2 line form', PRED_L);
// EVERY AUTHORITY NAMED AND PRESENT, so a half-synced deployment is a refusal rather than an approximation.
var W1auth = MP1.res.predicted_write_set.authorities;
ok(W1auth.length >= 13 && W1auth.every(function (a) { return a.present === true; }),
  'W1d every write-set authority is present and named', W1auth.length);
['weeklyAiPlanK2AllocatedLines_', 'KMWRR.buildK2GenerationPlan', 'sadK2ResolveActiveDraft_',
  'sadK2DeterministicHeaderId_', 'sadK2DeterministicLineId_', 'aiplExpirationCandidates_'
].forEach(function (n, i) {
  ok(W1auth.some(function (a) { return a.authority === n; }),
    'W1e.' + (i + 1) + ' including ' + n);
});
// AND NO SECOND IMPLEMENTATION IN THIS FILE. The diagnostic must not carry its own id or grouping algorithm.
ok(S1_BARE.indexOf("'SADH-K2-'") === -1 && S1_BARE.indexOf('"SADH-K2-"') === -1,
  'W1f the diagnostic never mints a K2 header id itself');
ok(S1_BARE.indexOf("'SADL-K2-'") === -1 && S1_BARE.indexOf('"SADL-K2-"') === -1,
  'W1g nor a K2 line id');
eq((S1_BARE.match(/function S1_[A-Za-z0-9_]*[Gg]roup[A-Za-z0-9_]*\(/g) || []), [],
  'W1h and defines no grouping function of its own');

// ---- W2 — MULTI ROUTE GROUP: every K2 identity predicted, none merged. ----------------------------------
// Two receivers for the same sku with DIFFERENT destinations. The destination is a K2 group dimension, so
// route grouping must produce TWO headers — and 190 + 190 = 380 keeps the total inside the residual, because
// a prediction that exceeds the proposal is refused (see M11d0).
var W2demand = demandWith_(190, {
  receiverFacts: [
    { demandRef: DEMAND_REF_, marketplace: 'Amazon', destinationWarehouseId: 'Amazon',
      fulfillmentModel: 'platform_fulfilled', dailyDemand: 10, allocationPriority: 1, demandWeight: 0.5,
      eligiblePoolTypes: ['FBA'] },
    { demandRef: DEMAND_REF_ + '|W', marketplace: 'Amazon', destinationWarehouseId: 'WH-3PL',
      fulfillmentModel: 'self_fulfilled', dailyDemand: 10, allocationPriority: 1, demandWeight: 0.5,
      eligiblePoolTypes: ['THREE_PL'] }
  ],
  planningFacts: [
    { demandRef: DEMAND_REF_, sku: SKU_FOR_DEMAND_, siteSku: SKU_FOR_DEMAND_ + '-US', unitsPerCarton: 10 },
    { demandRef: DEMAND_REF_ + '|W', sku: SKU_FOR_DEMAND_, siteSku: SKU_FOR_DEMAND_ + '-W', unitsPerCarton: 10 }
  ],
  horizonsByDemandRef: (function () {
    var o = {}, w = { D18: 190, D30: 190, D45: 190, D90: 190 },
      rq = { D18: '2026-10-01', D30: '2026-10-15', D45: '2026-11-01', D90: '2026-12-01' };
    o[DEMAND_REF_] = { cumulativeGapByWindow: w, requiredByByWindow: rq };
    o[DEMAND_REF_ + '|W'] = { cumulativeGapByWindow: w, requiredByByWindow: rq };
    return o;
  })()
});
var W2 = manifestP(pos({ demand: W2demand }));
var W2ws = W2.res.predicted_write_set;
ok(W2ws.measurable === true && (W2ws.route_groups || []).length >= 2,
  'W2  two destinations produce two route groups, never one merged header',
  [(W2ws.route_groups || []).length, W2ws.stage]);
eq(W2ws.expected_header_ids.length, (W2ws.route_groups || []).length,
  'W2a with one predicted header id per group', W2ws.expected_header_ids);
ok(W2ws.expected_header_ids.every(function (id) { return /^SADH-K2-[0-9A-F]{8}$/.test(id); }),
  'W2b every one of them deterministic', W2ws.expected_header_ids);
eq(W2ws.duplicate_header_ids, [], 'W2c and no two groups minting the same id');
eq(W2ws.expected_k2_group_keys.length, (W2ws.route_groups || []).length,
  'W2d one canonical group key per group');
ok(new Set(W2ws.expected_k2_group_keys).size === W2ws.expected_k2_group_keys.length,
  'W2e all distinct — the destination dimension separated them', W2ws.expected_k2_group_keys);
ok(W2ws.expected_line_ids.length >= 2, 'W2f every line predicted across both groups',
  W2ws.expected_line_ids);
eq(W2ws.expected_line_ids.length,
  W2ws.route_groups.reduce(function (a, g) { return a + g.line_count; }, 0),
  'W2g and the line ids account for every group line');
eq(W2.world.allWrites(), 0, 'W2h measured: zero writes');

// ---- W3 — CREATE vs UPDATE, classified by the production resolver. --------------------------------------
// An ACTIVE AI draft seeded on the EXACT group key the CREATE path predicted. sadK2ResolveActiveDraft_ must
// return REUSE, so the same world that was a CREATE becomes an UPDATE, with no change to the identity.
var W3hdr = {
  allocation_draft_id: PRED_H, planning_cycle: GAP_CYCLE, source_page: 'inventory_replenishment',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
  generation_type: 'system_generated', generation_run_id: 'RUN-EARLIER',
  recommended_source_warehouse_id: WG0.source_warehouse_id,
  recommended_destination_warehouse_id: WG0.destination_warehouse_id,
  recommended_shipping_method: WG0.shipping_method,
  recommended_last_mile_delivery: WG0.last_mile_delivery,
  recommendation_group_no: WG0.recommendation_group_no };
var W3 = manifestP(pos({ extraHeaders: [W3hdr],
  extraLines: [{ allocation_draft_line_id: PRED_L, allocation_draft_id: PRED_H, sku: SKU,
    planned_qty: '380', line_status: 'draft' }] }));
var W3ws = W3.res.predicted_write_set;
eq(W3ws.route_groups[0].classification, 'UPDATE',
  'W3  an active draft on the predicted group key makes it an UPDATE', W3ws.route_groups[0]);
eq(W3ws.route_groups[0].resolve_status, 'REUSE',
  'W3a and the classification came from sadK2ResolveActiveDraft_ saying REUSE');
eq([W3ws.expected_create_header_count, W3ws.expected_update_header_count], [0, 1],
  'W3b counted as an update, not a create');
eq([W3ws.expected_create_line_count, W3ws.expected_update_line_count], [0, 1],
  'W3c and the line too, because its deterministic id already exists');
eq(W3ws.expected_header_ids, [PRED_H],
  'W3d the identity is unchanged — the same row, updated in place');
// THE SAME WORLD WITHOUT THE SEEDED ROW IS A CREATE. Both halves, so the classifier is shown to discriminate.
eq([MP1.res.predicted_write_set.expected_create_header_count,
  MP1.res.predicted_write_set.expected_update_header_count], [1, 0],
  'W3e while the unseeded world is a CREATE');
// AND THE RUN'S OWN ROW IS NOT A ROW IT SUPERSEDES. Without committed_ids the UPDATE target appeared in the
// expire set too, and the manifest refused it — correctly, on a wrong input.
ok((W3.res.ai_identity_sets.ai_expiration_candidates || []).indexOf(PRED_H) === -1,
  'W3f the row being updated is NOT listed as one the run would expire',
  W3.res.ai_identity_sets.ai_expiration_candidates);
eq(W3.res.verdict, 'READY_TO_AUTHORIZE', 'W3g and the world is READY', failed(W3.res));
eq(W3.world.allWrites(), 0, 'W3h measured: zero writes');

// ---- W4 — THE THREE SETS ARE NEVER THE SAME LIST. -------------------------------------------------------
// One world holding all three at once: an unrelated AI draft that WILL expire, a seeded row that WILL be
// updated, and the run's own predicted identity.
var W4 = manifestP(pos({
  extraHeaders: [W3hdr, { allocation_draft_id: 'AI-STALE-1', planning_cycle: GAP_CYCLE,
    source_page: 'inventory_replenishment', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    status: 'draft', generation_type: 'system_generated', generation_run_id: 'RUN-OLDER',
    recommended_source_warehouse_id: WHF, recommended_destination_warehouse_id: 'WH-3PL',
    recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'UPS',
    recommendation_group_no: '9' }],
  extraLines: [
    { allocation_draft_line_id: PRED_L, allocation_draft_id: PRED_H, sku: SKU, planned_qty: '380',
      line_status: 'draft' },
    { allocation_draft_line_id: 'AI-STALE-1-L1', allocation_draft_id: 'AI-STALE-1', sku: SKU,
      planned_qty: '40', line_status: 'draft' }] }));
var W4ids = W4.res.ai_identity_sets;
ok((W4ids.existing_active_ai_identities || []).length === 2,
  'W4  two AI identities exist in this scope', W4ids.existing_active_ai_identities);
eq(W4ids.ai_expiration_candidates, ['AI-STALE-1'],
  'W4a exactly one of them is what a run would EXPIRE');
eq(W4ids.expected_generation_writes.expected_header_ids, [PRED_H],
  'W4b a different one is what it would WRITE');
eq(W4ids.ai_identities_that_will_expire, ['AI-STALE-1'], 'W4c named as the expiring set');
eq(W4ids.ai_identities_that_will_update, [PRED_H], 'W4d and as the updating set');
eq(W4ids.ai_identities_that_must_stay_unchanged, [],
  'W4e with nothing left over that must not move');
eq(W4ids.expected_post_generation_active_ai_identities, [PRED_H],
  'W4f so after the run exactly one AI identity is active: the stale one expired, the written one kept');
ok(W4ids.expected_post_generation_derivation.indexOf('DERIVATION') > 0,
  'W4g and the fourth set says it is a derivation, not a measurement');
eq(W4.world.allWrites(), 0, 'W4h measured: zero writes');

// ---- W5 — A NOTE-ONLY CHANGE ON A MANUAL ROW IS VISIBLE. ------------------------------------------------
// The exact drift W4's baseline could not see: same ids, same quantities, one text column different.
var W5base = manifestP(pos()).res.frozen_before;
var W5 = manifestP(pos({ aLine: { note: 'operator added a note' } }));
ok(W5.res.frozen_before !== null, 'W5  a note-only edit is still a READY world', failed(W5.res));
ok(W5.res.frozen_before.target_manual_combined_fingerprint
  !== W5base.target_manual_combined_fingerprint,
  'W5a and it MOVES the manual full-row fingerprint',
  [W5base.target_manual_combined_fingerprint,
    W5.res.frozen_before.target_manual_combined_fingerprint]);
eq(W5.res.frozen_before.target_manual_line_ids, W5base.target_manual_line_ids,
  'W5b with every id unchanged — which is why an id fingerprint could not have caught it');
eq(W5.res.frozen_before.target_manual_planned_total, W5base.target_manual_planned_total,
  'W5c and every quantity unchanged too');
// AND THE OLD ID-ONLY FINGERPRINT PROVES THE POINT: it cannot tell these two worlds apart.
// S1-R4C — re-aimed onto the renamed field. Comparing `identity_universe_fingerprint` after the rename
// compared undefined with undefined, so this assertion had quietly become unfalsifiable: it would have
// passed on a world where the fingerprint DID move, which is the opposite of what it exists to show.
eq(W5.res.frozen_before.gap_scope_universe_fingerprint, W5base.gap_scope_universe_fingerprint,
  'W5d the GAP SCOPE fingerprint is blind to it, which is the defect this replaces');
// ...and the DRAFT ROW fingerprint is not, which is the repair. Two populations, and only one of them
// changed when a note was edited.
ok(W5.res.frozen_before.draft_row_universe_combined_fingerprint
  !== W5base.draft_row_universe_combined_fingerprint,
  'W5d2 while the DRAFT ROW full-content fingerprint does catch it',
  [W5base.draft_row_universe_combined_fingerprint,
    W5.res.frozen_before.draft_row_universe_combined_fingerprint]);

// ---- W6 — AN updated_at-ONLY CHANGE IS VISIBLE. --------------------------------------------------------
// The column that moves whenever something wrote, and the one most likely to be the ONLY evidence.
var W6 = manifestP(pos({ aLine: { updated_at: '2099-01-01T00:00:00Z' } }));
ok(W6.res.frozen_before !== null, 'W6  an updated_at-only edit is still a READY world', failed(W6.res));
ok(W6.res.frozen_before.target_manual_combined_fingerprint
  !== W5base.target_manual_combined_fingerprint,
  'W6a and it MOVES the manual full-row fingerprint',
  [W5base.target_manual_combined_fingerprint,
    W6.res.frozen_before.target_manual_combined_fingerprint]);
eq(W6.res.frozen_before.target_manual_planned_total, W5base.target_manual_planned_total,
  'W6b with no quantity having changed');
// A TIMESTAMP IS NOT ROUNDED INTO EQUALITY. One second apart must not fingerprint alike.
var W6c = manifestP(pos({ aLine: { updated_at: '2099-01-01T00:00:01Z' } }));
ok(W6c.res.frozen_before.target_manual_combined_fingerprint
  !== W6.res.frozen_before.target_manual_combined_fingerprint,
  'W6c and one second of difference is still a difference');
// EVERY LIVE COLUMN IS COVERED, asserted on the measurement rather than on the intention.
eq([W5base.draft_header_excluded_fields, W5base.draft_line_excluded_fields], [[], []],
  'W6d nothing is excluded from either full-row fingerprint');
eq([W5base.draft_header_live_column_count, W5base.draft_line_live_column_count], [36, 31],
  'W6e over all 36 header columns and all 31 line columns',
  [W5base.draft_header_live_column_count, W5base.draft_line_live_column_count]);

// ---- W7 — AN OTHER-SCOPE ROW CHANGING CONTENT, WITH ITS ID UNCHANGED. -----------------------------------
function otherScopeWorld(note) {
  return manifestP(pos({
    extraHeaders: [{ allocation_draft_id: 'OTHER-H-1', planning_cycle: GAP_CYCLE,
      source_page: 'inventory_replenishment', company: 'OtherCo', country: 'US', marketplace: 'Walmart',
      status: 'draft', generation_type: 'user_created', note: note }],
    extraLines: [{ allocation_draft_line_id: 'OTHER-H-1-L1', allocation_draft_id: 'OTHER-H-1',
      sku: 'OTHER-SKU', planned_qty: '77', line_status: 'draft' }] }));
}
var W7a = otherScopeWorld('before'), W7b = otherScopeWorld('after');
eq([W7a.res.verdict, W7b.res.verdict], ['READY_TO_AUTHORIZE', 'READY_TO_AUTHORIZE'],
  'W7  another scope holding a draft does not stop this activation',
  [failed(W7a.res), failed(W7b.res)]);
eq([W7a.res.frozen_before.other_scope_header_count, W7a.res.frozen_before.other_scope_line_count], [1, 1],
  'W7a the other scope is counted');
ok(W7a.res.frozen_before.other_scope_combined_fingerprint
  !== W7b.res.frozen_before.other_scope_combined_fingerprint,
  'W7b and a single changed CONTENT column moves its fingerprint, with the id unchanged',
  [W7a.res.frozen_before.other_scope_combined_fingerprint,
    W7b.res.frozen_before.other_scope_combined_fingerprint]);
ok(String(W7a.res.frozen_before.other_scope_row_signatures.join(',')).indexOf('OTHER-H-1') >= 0,
  'W7c the signatures are id~fingerprint pairs, so the changed row is nameable',
  W7a.res.frozen_before.other_scope_row_signatures);
eq(W7a.res.frozen_before.other_scope_row_signatures.length,
  W7b.res.frozen_before.other_scope_row_signatures.length,
  'W7d same number of rows — this is a content drift, not an identity drift');
// AND THE OTHER SCOPE IS NOT IN THE TARGET BUCKETS. Three buckets, three permissions.
ok(W7a.res.frozen_before.target_manual_header_ids.indexOf('OTHER-H-1') === -1
  && (W7a.res.ai_identity_sets.existing_active_ai_identities || []).indexOf('OTHER-H-1') === -1,
  'W7e and it is in neither target bucket');

// ---- W8 — A FACTORY MOVEMENT OR AUDIT ROW APPEARING IS VISIBLE. ----------------------------------------
var W8base = manifestP(pos()).res.frozen_before;
eq([W8base.factory_stock_movement_count, W8base.factory_override_audit_count], [1, 1],
  'W8  the factory write surfaces are counted');
eq([W8base.factory_stock_movement_state, W8base.factory_override_audit_state],
  ['SHEET_PRESENT_AND_READABLE', 'SHEET_PRESENT_AND_READABLE'], 'W8a and observed, not assumed');
var W8m = manifestP(pos({ movements: [
  { factory_stock_movement_id: 'MV-1', movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
    movement_type: 'IN', qty: 2000, created_at: '2026-09-01T00:00:00Z' },
  { factory_stock_movement_id: 'MV-2', movement_date: '2026-09-09', sku: SKU, warehouse_id: WHF,
    movement_type: 'OUT', qty: 380, created_at: '2026-09-09T00:00:00Z' }] }));
eq(W8m.res.frozen_before.factory_stock_movement_count, 2,
  'W8b one more movement row is counted');
ok(W8m.res.frozen_before.factory_stock_movement_fingerprint
  !== W8base.factory_stock_movement_fingerprint,
  'W8c and moves the movement fingerprint');
ok(W8m.res.frozen_before.factory_stock_movement_ids.indexOf('MV-2') >= 0,
  'W8d with the new id nameable', W8m.res.frozen_before.factory_stock_movement_ids);
var W8a = manifestP(pos({ overrideAudit: [
  { override_audit_id: 'AU-1', created_at: '2026-09-01T00:00:00Z', entity_type: 'shipping_plan',
    entity_id: 'SP-SEED', transition: 'seed', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    sku: SKU, source_warehouse_id: WHF },
  { override_audit_id: 'AU-2', created_at: '2026-09-09T00:00:00Z', entity_type: 'shipping_plan',
    entity_id: 'SP-NEW', transition: 'confirm_overage', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', sku: SKU, source_warehouse_id: WHF }] }));
eq(W8a.res.frozen_before.factory_override_audit_count, 2,
  'W8e one more override-audit row is counted');
ok(W8a.res.frozen_before.factory_override_audit_fingerprint
  !== W8base.factory_override_audit_fingerprint,
  'W8f and moves the audit fingerprint');
// A CONTENT-ONLY CHANGE, SAME COUNT, SAME IDS.
var W8g = manifestP(pos({ movements: [
  { factory_stock_movement_id: 'MV-1', movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
    movement_type: 'IN', qty: 1999, created_at: '2026-09-01T00:00:00Z' }] }));
ok(W8g.res.frozen_before.factory_stock_movement_fingerprint
  !== W8base.factory_stock_movement_fingerprint
  && W8g.res.frozen_before.factory_stock_movement_count === 1,
  'W8g a movement row edited in place moves the fingerprint at an unchanged count');
// AND AN ABSENT TABLE IS NEVER ZERO ROWS.
var W8h = manifestP(pos({ movements: null }));
eq([W8h.res.frozen_before.factory_stock_movement_state,
  W8h.res.frozen_before.factory_stock_movement_count], ['SHEET_ABSENT', null],
  'W8h an absent movement table freezes as SHEET_ABSENT with a NULL count, never 0');
// ---- THE ID COLUMNS ARE THE PRODUCTION ONES. --------------------------------------------------------
// This was measured wrong first: the diagnostic and this fixture both invented `movement_id` / `audit_id`,
// so the suite agreed with the mistake while a live sheet would have frozen a list of blank ids. The names
// are now checked against the shipped declarations rather than against each other.
var W8surf = manifestP(pos()).res.factory_surfaces.surfaces;
eq(W8surf['factory_stock_movements'].id_column, 'factory_stock_movement_id',
  'W8k the movement id column is the one 21_ MOV_HEADERS declares');
var G21 = read(GS + '21_factory_inventory_handlers.gs');
ok(G21.indexOf("'factory_stock_movement_id', 'movement_date'") > 0,
  'W8k1 and that is still how 21_ spells it — read from the shipped file');
var G71AUD = extractVar(G71, 'FSG_OVERRIDE_AUDIT_HEADERS_');
var R8audId = vm.runInNewContext(G71AUD + ' FSG_OVERRIDE_AUDIT_HEADERS_[0]', {});
eq(W8surf['factory_stock_override_audit'].id_column, R8audId,
  'W8l the audit id column comes from 71_ FSG_OVERRIDE_AUDIT_HEADERS_[0]', R8audId);
eq([W8surf['factory_stock_movements'].id_column_resolved,
  W8surf['factory_stock_override_audit'].id_column_resolved], [true, true],
  'W8m1 and both resolve against the live header row');
// A PRESENT TABLE WHOSE ID COLUMN IS ABSENT IS NOT A TABLE OF BLANK IDS.
var W8n = manifestP(pos({ movements: [{ movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
  movement_type: 'IN', qty: 1 }] }));
var W8nw = S1World(pos());
W8nw.sheets['factory_stock_movements'].rows[0][0] = 'renamed_id_column';
var W8nres = vm.runInContext('RUN_S1_MANIFEST_P()', W8nw.ctx);
var W8nsurf = W8nres.factory_surfaces.surfaces['factory_stock_movements'];
eq([W8nsurf.observation_state, W8nsurf.id_column_resolved, W8nsurf.ids],
  ['ID_COLUMN_UNRESOLVED', false, null],
  'W8n a renamed id column is reported as UNRESOLVED with a NULL id list, never blanks');
eq(W8nres.verdict, 'STOP', 'W8n1 and the manifest STOPs', failed(W8nres));
ok(failed(W8nres).indexOf('every_factory_write_surface_is_either_readable_or_honestly_absent') >= 0,
  'W8n2 on the factory-surface readability condition', failed(W8nres));
eq([W8nres.freeze_paste_block, W8nres.operator_authorization_wording], [null, null],
  'W8n3 with nothing pasteable and nothing to sign');
eq(W8nw.allWrites(), 0, 'W8n4 and zero writes');

// THE POOL ROW ITSELF, FULL-ROW.
ok(W8base.factory_pool_row_fingerprint !== null,
  'W8i the factory pool row is frozen as a full row', W8base.factory_pool_row_fingerprint);
var W8j = manifestP(pos({ factory_stock: [
  { warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 101 }] }));
ok(W8j.res.frozen_before
  && W8j.res.frozen_before.factory_pool_row_fingerprint !== W8base.factory_pool_row_fingerprint,
  'W8j and one unit of reserved stock moving changes it');

// ---- W9 — AN UNMEASURABLE WRITE SET IS A NAMED STOP THAT LEAKS NOTHING. ---------------------------------
// Each link removed on its own, because "the write set could not be measured" must name WHICH authority is
// absent — an operator told only that it failed has nowhere to look.
[['sadK2ResolveActiveDraft_', 'sadK2ResolveActiveDraft_ = null;'],
  ['sadK2DeterministicLineId_', 'sadK2DeterministicLineId_ = null;'],
  ['weeklyAiPlanK2AllocatedLines_', 'weeklyAiPlanK2AllocatedLines_ = null;']
].forEach(function (pair, i) {
  var R = manifestP(pos({ after: pair[1] }));
  var n = 'W9.' + (i + 1) + ' ' + pair[0] + ' absent: ';
  eq(R.res.verdict, 'STOP', n + 'the manifest STOPs', failed(R.res));
  eq(R.res.writeset_stop_code, 'EXACT_PRODUCTION_WRITESET_NOT_MEASURABLE',
    n + 'with the named code');
  ok((R.res.predicted_write_set.missing_authorities || []).indexOf(pair[0]) >= 0,
    n + 'naming the absent authority', R.res.predicted_write_set.missing_authorities);
  ok(String(R.res.stop_reason).indexOf('EXACT_PRODUCTION_WRITESET_NOT_MEASURABLE') === 0,
    n + 'and leading the stop reason with it', String(R.res.stop_reason).slice(0, 90));
  // NOTHING PASTEABLE, NOTHING TO SIGN.
  eq(R.res.frozen_before, null, n + 'no baseline');
  eq(R.res.freeze_paste_block, null, n + 'no paste block');
  eq(mpChunks(R.world), 0, n + 'no freeze chunk');
  eq(R.res.operator_authorization_wording, null, n + 'no authorization wording');
  eq([R.world.allWrites(), R.res.writes, R.res.writer_calls], [0, 0, 0], n + 'and zero writes');
});
// AND IT IS NEVER SUBSTITUTED BY AN EMPTY LIST OR BY THE EXISTING ROWS.
var W9x = manifestP(pos({ after: 'sadK2ResolveActiveDraft_ = null;' }));
ok(W9x.res.predicted_write_set.expected_header_ids.length === 0
  && W9x.res.predicted_write_set.measurable === false,
  'W9a an unmeasurable write set is not reported as an empty one — measurable says false',
  [W9x.res.predicted_write_set.expected_header_ids, W9x.res.predicted_write_set.measurable]);
ok(failed(W9x.res).indexOf('the_exact_production_write_set_is_measurable') >= 0,
  'W9b and the failing condition is the measurability one', failed(W9x.res));

// ---- W10 — A BLOCKED ROUTE IS NOT AN EMPTY WRITE SET EITHER. -------------------------------------------
// No lead times: the lane prices but has no transit authority, so KMWRR blocks every line and proposes no
// group. Measured, and it must be a STOP rather than "zero rows expected".
var W10 = manifestP(pos({ leadTimes: [] }));
eq(W10.res.verdict, 'STOP', 'W10 a lane with no transit authority stops the manifest', failed(W10.res));
ok(W10.res.predicted_write_set.measurable === true
  && (W10.res.predicted_write_set.blocked_lines || []).length >= 1,
  'W10a the authorities were reachable — the ROUTE is what failed',
  W10.res.predicted_write_set.blocked_lines);
ok(failed(W10.res).indexOf('no_line_the_generation_would_write_is_blocked_on_a_route') >= 0,
  'W10b named as a blocked route, not as a missing authority', failed(W10.res));
eq([W10.res.freeze_paste_block, W10.res.operator_authorization_wording], [null, null],
  'W10c with nothing pasteable and nothing to sign');
eq(mpChunks(W10.world), 0, 'W10d and no freeze chunk');

// ---- W11 — AN UNEXPECTED LIVE COLUMN IS A STOP. -------------------------------------------------------
// A column the schema authority does not know is either a half-applied migration or something writing to a
// table this manifest is about to declare frozen. Either way the freeze would not cover it.
var W11w = S1World(pos());
W11w.sheets['shipping_allocation_drafts'].rows[0].push('surprise_column');
var W11res = vm.runInContext('RUN_S1_MANIFEST_P()', W11w.ctx);
eq(W11res.verdict, 'STOP', 'W11 an unknown draft-header column stops the manifest', failed(W11res));
eq(W11res.row_content.header_table.unexpected_columns, ['surprise_column'],
  'W11a naming the column it does not recognise');
ok(failed(W11res).indexOf('no_unexpected_column_exists_on_the_draft_header_table') >= 0,
  'W11b on its own named condition', failed(W11res));
eq([W11res.frozen_before, W11res.freeze_paste_block, W11res.operator_authorization_wording],
  [null, null, null], 'W11c with nothing pasteable and nothing to sign');
eq(W11w.allWrites(), 0, 'W11d and zero writes');
// The SAME check on the line table, so one is not protected while the other is open.
var W11e = S1World(pos());
W11e.sheets['shipping_allocation_draft_lines'].rows[0].push('surprise_line_column');
var W11eres = vm.runInContext('RUN_S1_MANIFEST_P()', W11e.ctx);
eq(W11eres.row_content.line_table.unexpected_columns, ['surprise_line_column'],
  'W11e an unknown draft-LINE column is caught the same way');
ok(failed(W11eres).indexOf('no_unexpected_column_exists_on_the_draft_line_table') >= 0,
  'W11f on its own named condition too', failed(W11eres));

// ---- W12 — THE AUTHORIZATION WORDING STATES THE WRITE. ------------------------------------------------
var W12 = MP1.res.operator_authorization_wording;
eq((String(W12).match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []), [],
  'W12 still no placeholder anywhere in the sentence');
[['CREATE 1 allocation draft header(s) and 1 line(s)', 'the creates, as counts'],
  ['UPDATE 0 existing header(s) and 0 existing line(s)', 'the updates, separately'],
  ['EXPIRE 0 existing AI identity/identities', 'the expiries, separately again'],
  ['AT MOST 380', 'the maximum units'],
  [PRED_H, 'the exact predicted header identity'],
  [PRED_L, 'the exact predicted line identity'],
  ['FULL-ROW IDENTICAL', 'and that the protected rows must not change in any column']
].forEach(function (p, i) {
  ok(String(W12).indexOf(p[0]) > 0, 'W12.' + (i + 1) + ' it states ' + p[1], p[0]);
});
// THE SENTENCE THIS ROUND EXISTS TO DELETE.
ok(String(W12).indexOf('across 0 superseded AI identities') === -1,
  'W12a and never describes a create as "across 0 superseded AI identities"');
ok(String(W12).indexOf('manual header(s)') > 0 && String(W12).indexOf('every other scope') > 0,
  'W12b naming the manual rows and the other scopes that must stay identical');
// A WORLD WITH NO MEASURABLE WRITE SET HAS NO SENTENCE AT ALL, even if everything else measured.
eq(vm.runInContext('S1_authWordingP_({}, {}, {}, { measurable: false }, {}, {})', MP1.world.ctx), null,
  'W12c the builder refuses to write a sentence without a measured write set');

// ---- W13 — EVERY R-SECTION WORLD WROTE NOTHING AND REACHED NO WRITER. ---------------------------------
[['W2', W2], ['W3', W3], ['W4', W4], ['W5', W5], ['W6', W6], ['W7a', W7a], ['W8m', W8m], ['W9x', W9x],
  ['W10', W10]
].forEach(function (p, i) {
  var r = p[1].res, w = p[1].world;
  eq([w.allWrites(), r.writes, r.writer_calls, r.writer_constructed, r.submit_calls,
    r.route_save_calls], [0, 0, 0, false, 0, 0],
    'W13.' + (i + 1) + ' ' + p[0] + ' wrote nothing and constructed no writer');
  eq([r.dry_run_proof.generate_called, r.dry_run_proof.submit_called,
    r.dry_run_proof.migration_called, r.dry_run_proof.gap_job_called],
    [false, false, false, false],
    'W13.' + (i + 1) + 'a ' + p[0] + ' called neither Generate, Submit, migration nor the Gap Job');
  eq([r.dry_run_proof.flag_modified, r.dry_run_proof.allowlist_modified,
    r.dry_run_proof.script_properties_modified], [false, false, false],
    'W13.' + (i + 1) + 'b ' + p[0] + ' changed neither flag, allowlist nor a script property');
});


// ================================================================================================================
section('X — S1-R4B: the deployment contract, against the shape 63_ actually returns');
// ================================================================================================================
// THE LIVE FAILURE THIS REPAIRS. RUN_S1_MANIFEST_P() reported verdict=STOP with 87 passed, 1 failed, and the
// one failure was `the_deployment_contract_is_readable` — while the SAME run's live evidence carried
// deployment_build=F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6, mixed_deployment=false, stale_modules=0 and
// evidence_gaps=0, all extracted from the very object it had just declared unreadable.
//
// The predicate asked for `dep.available === true`. sysModuleBuildStamps_() has no `available` field: it was
// invented on this file's own catch path and then read back as though 63_ published it. The old fixture stub
// invented it too, so the suite agreed with the invention while production could only ever fail.

// ---- X1 — THE REAL SHAPE, PRODUCED BY 63_ ITSELF, AND WHAT IT DOES NOT CONTAIN. -------------------------
eq(Object.keys(REAL_STAMPS_).sort(),
  ['absent_modules', 'absent_optional_modules', 'deployment_build', 'mixed_deployment', 'modules',
    'runtime_authority', 'stale_modules', 'verdict'],
  'X1  sysModuleBuildStamps_ returns exactly these eight fields');
ok(!('available' in REAL_STAMPS_),
  'X1a and `available` is NOT one of them — the field the old predicate required does not exist',
  Object.keys(REAL_STAMPS_));
// PROVEN FROM THE SHIPPED SOURCE, not only from the executed object: 63_ never writes the key at all.
var G63_SRC = read(GS + '63_api_v1_system_health.gs');
var G63_STAMPS_FN = extractFn(G63_SRC, 'sysModuleBuildStamps_');
ok(G63_STAMPS_FN.indexOf('available') === -1,
  'X1b and the function body never mentions `available` anywhere');
ok(S1_BARE.indexOf('dep.available') === -1 && S1_BARE.indexOf('_dep.available') === -1,
  'X1c nor does the diagnostic read it any more');
// The real object is a healthy, fully-synced project with one OPTIONAL owner legitimately absent.
eq([REAL_STAMPS_.mixed_deployment, REAL_STAMPS_.stale_modules.length,
  REAL_STAMPS_.absent_modules.length], [false, 0, 0],
  'X1d the fixture project is healthy: not mixed, nothing stale, nothing required absent');
ok(REAL_STAMPS_.modules.length >= 20,
  'X1e over a real module manifest, not an empty list', REAL_STAMPS_.modules.length);
eq(REAL_STAMPS_.absent_optional_modules.length, 1,
  'X1f with exactly one OPTIONAL owner absent — 63_ §J.6, which must not read as a partial sync');
ok(/^UNIFORM\b/.test(REAL_STAMPS_.verdict),
  'X1g and a verdict that STARTS with UNIFORM', String(REAL_STAMPS_.verdict).slice(0, 40));

// ---- X1h — THE DIAGNOSTIC'S REQUIRED-FIELD LIST IS THE CONTRACT'S OWN KEY SET. -------------------------
// The whole defect was a list of expected fields drifting from what 63_ publishes. So the list is compared
// against the executed return value: if 63_ adds, renames or drops a field, THIS breaks and says so, instead
// of production discovering it as an unexplained STOP.
var X1fields = vm.runInContext('S1_DEPLOYMENT_CONTRACT_FIELDS_.map(function (f) { return f.field; })',
  S1World(pos()).ctx).slice().sort();
eq(X1fields, Object.keys(REAL_STAMPS_).sort(),
  'X1h the fields the diagnostic requires are EXACTLY the fields sysModuleBuildStamps_ returns',
  { diagnostic_expects: X1fields, contract_returns: Object.keys(REAL_STAMPS_).sort() });

// ---- X2 — TEST A: THE REAL SHAPE PASSES THE READABLE PREDICATE AND THE WHOLE MANIFEST. ------------------
var X2 = manifestP(pos());
eq(X2.res.verdict, 'READY_TO_AUTHORIZE',
  'X2  the genuine 63_ shape reaches READY_TO_AUTHORIZE', failed(X2.res));
eq(X2.res.predicates_failed, 0, 'X2a with nothing failed at all', failed(X2.res));
var XD = X2.res.deployment;
eq([XD.readable, XD.contract_ok], [true, true],
  'X2b the contract is both READABLE (shape) and OK (health) — two answers, two fields');
eq([XD.missing_fields, XD.wrong_type_fields, XD.stop_reasons], [[], [], []],
  'X2c with no missing field, no wrong type and no refusal of its own');
['the_deployment_contract_is_readable', 'every_module_row_in_the_contract_is_well_formed',
  'the_contract_listed_at_least_one_owner_module', 'the_deployment_is_not_mixed',
  'no_owner_module_is_stale', 'no_owner_module_is_absent',
  'every_required_module_stamp_is_present_and_matches_what_is_expected',
  'the_deployment_build_is_the_one_this_manifest_was_written_against',
  'the_deployment_verdict_is_uniform', 'the_runtime_authority_half_of_the_contract_is_uniform',
  'the_deployment_contract_reports_no_refusal_of_its_own'
].forEach(function (n, i) {
  var pr = predOf(X2.res, n);
  ok(!!pr && pr.pass === true, 'X2d.' + (i + 1) + ' ' + n + ' passes', pr && pr.observed);
});
// THE PER-MODULE HALF IS ACTUALLY EXERCISED. The old stub sent `modules: []`, so this was never tested.
ok(XD.module_count >= 20 && XD.required_module_count >= 1,
  'X2e and the per-module stamps were genuinely examined, not an empty list',
  [XD.module_count, XD.required_module_count, XD.optional_module_count]);
eq(XD.module_mismatch_count, 0, 'X2f with no stamp mismatch');
eq(XD.absent_optional_module_count, 1,
  'X2g and an absent OPTIONAL owner kept apart from an absent required one',
  [XD.absent_module_count, XD.absent_optional_module_count]);
// §6 — THE EXPECTATION COMES FROM S1_BUILD_, AND THAT IS CARRIED SO IT CAN BE AUDITED.
eq(XD.expected_build, (S1.match(/var S1_BUILD_ = '([^']+)'/) || [])[1],
  'X2h the expected build is S1_BUILD_');
ok(String(XD.expected_build_source).indexOf('S1_BUILD_') >= 0,
  'X2i and it says so, so a self-comparison would be visible', XD.expected_build_source);
eq(XD.build_matches, true, 'X2j and the live build matches it');

// ---- X3 — TESTS B..J: EVERY WAY THE CONTRACT CAN BE WRONG IS ITS OWN NAMED STOP. -----------------------
// Each case moves exactly ONE thing away from the real shape, so the failing predicate names that thing and
// not a side effect of a hand-written object.
var XCASES = [
  ['B1 the authority is absent', { stampsAbsent: true },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_AUTHORITY_ABSENT'],
  ['B2 the authority throws', { stampsThrow: true },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_THREW'],
  ['B3 it returns null', { stamps: null },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_DID_NOT_RETURN_AN_OBJECT'],
  ['B4 it returns an array', { stamps: [] },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_DID_NOT_RETURN_AN_OBJECT'],
  ['C  deployment_build is missing', { stamps: stampsWith_({ deployment_build: '__DELETE__' }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_MISSING_FIELD'],
  ['C2 deployment_build is null', { stamps: stampsWith_({ deployment_build: null }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_MISSING_FIELD'],
  ['C3 deployment_build is blank', { stamps: stampsWith_({ deployment_build: '   ' }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_WRONG_FIELD_TYPE'],
  ['D  the build is another release',
    { stamps: stampsWith_({ deployment_build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9' }) },
    'the_deployment_build_is_the_one_this_manifest_was_written_against',
    'DEPLOYMENT_BUILD_IS_NOT_THE_ONE_THIS_MANIFEST_WAS_WRITTEN_AGAINST'],
  ['E  mixed_deployment is true', { stamps: stampsWith_({ mixed_deployment: true }) },
    'the_deployment_is_not_mixed', 'DEPLOYMENT_IS_MIXED'],
  ['E2 mixed_deployment is not a boolean', { stamps: stampsWith_({ mixed_deployment: 'false' }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_WRONG_FIELD_TYPE'],
  ['F  stale_modules is non-empty',
    { stamps: stampsWith_({ stale_modules: ['16_shipping_allocation_handlers.gs declares X, expected Y'] }) },
    'no_owner_module_is_stale', 'OWNER_MODULE_IS_STALE'],
  ['G  absent_modules is non-empty',
    { stamps: stampsWith_({ absent_modules: ['69_api_v1_ai_plan_lifecycle.gs'] }) },
    'no_owner_module_is_absent', 'OWNER_MODULE_IS_ABSENT'],
  ['I  the verdict is not uniform',
    { stamps: stampsWith_({ verdict: 'MIXED_OR_PARTIAL_SYNC — at least one owner file is older' }) },
    'the_deployment_verdict_is_uniform', 'DEPLOYMENT_VERDICT_IS_NOT_UNIFORM'],
  ['J1 stale_modules is not an array', { stamps: stampsWith_({ stale_modules: 'none' }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_WRONG_FIELD_TYPE'],
  // 0 is PRESENT and of the wrong TYPE — the two are different findings and the validator says which.
  // My first expectation here named MISSING_FIELD, which is the reason for an absent or null field.
  ['J2 absent_modules is the number 0', { stamps: stampsWith_({ absent_modules: 0 }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_WRONG_FIELD_TYPE'],
  ['J2b absent_modules is null', { stamps: stampsWith_({ absent_modules: null }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_MISSING_FIELD'],
  ['J3 modules is not an array', { stamps: stampsWith_({ modules: {} }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_WRONG_FIELD_TYPE'],
  ['J4 verdict is not a string', { stamps: stampsWith_({ verdict: 42 }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_WRONG_FIELD_TYPE'],
  ['J5 runtime_authority is missing', { stamps: stampsWith_({ runtime_authority: '__DELETE__' }) },
    'the_deployment_contract_is_readable', 'DEPLOYMENT_CONTRACT_MISSING_FIELD'],
  ['J6 runtime_authority has no boolean uniform',
    { stamps: stampsWith_({ runtime_authority: { checked: true } }) },
    'the_deployment_contract_is_readable',
    'DEPLOYMENT_CONTRACT_RUNTIME_AUTHORITY_HAS_NO_BOOLEAN_UNIFORM'],
  ['J7 runtime_authority is not uniform',
    { stamps: stampsWith_({ runtime_authority: { checked: true, uniform: false,
      divergent: ['at 34 columns the writer resolves A and the lifecycle resolves B'],
      verdict: 'RUNTIME_AUTHORITY_DIVERGENCE — the deployed lifecycle body is stale' } }) },
    'the_runtime_authority_half_of_the_contract_is_uniform', 'RUNTIME_AUTHORITY_DIVERGENCE'],
  ['J8 the module list is empty', { stamps: stampsWith_({ modules: [] }) },
    'the_contract_listed_at_least_one_owner_module', 'DEPLOYMENT_CONTRACT_LISTED_NO_MODULES']
];
// H — a per-module stamp that does not match. Built from the REAL rows so only that one row differs, and
// deliberately NOT reflected in stale_modules: this is the case where the summary lists agree and the rows
// do not, which is the whole reason the rows are checked separately.
var XmodRows = JSON.parse(JSON.stringify(REAL_STAMPS_.modules));
var XreqIdx = -1;
XmodRows.forEach(function (r, i) { if (XreqIdx === -1 && r.optional !== true) XreqIdx = i; });
XmodRows[XreqIdx].matches_expected = false;
XmodRows[XreqIdx].declared_build = 'F1-SOMETHING-OLD';
XCASES.push(['H  a required module stamp does not match', { stamps: stampsWith_({ modules: XmodRows }) },
  'every_required_module_stamp_is_present_and_matches_what_is_expected', 'MODULE_STAMP_MISMATCH']);
// H2 — a required owner absent at ROW level while absent_modules is empty.
var XmodRows2 = JSON.parse(JSON.stringify(REAL_STAMPS_.modules));
XmodRows2[XreqIdx].present = false;
XmodRows2[XreqIdx].matches_expected = false;
XmodRows2[XreqIdx].declared_build = null;
XCASES.push(['H2 a required owner is absent at row level', { stamps: stampsWith_({ modules: XmodRows2 }) },
  'every_required_module_stamp_is_present_and_matches_what_is_expected', 'MODULE_STAMP_MISMATCH']);
// H3 — a malformed row: neither present nor matches_expected is a boolean.
var XmodRows3 = JSON.parse(JSON.stringify(REAL_STAMPS_.modules));
delete XmodRows3[XreqIdx].present;
XCASES.push(['H3 a module row is malformed', { stamps: stampsWith_({ modules: XmodRows3 }) },
  'every_module_row_in_the_contract_is_well_formed', 'DEPLOYMENT_CONTRACT_MALFORMED_MODULE_ROW']);
// H4 — a PRESENT OPTIONAL owner that does not match is still a fault (63_: "a stale one is still a fault").
var XmodRows4 = JSON.parse(JSON.stringify(REAL_STAMPS_.modules));
var XoptIdx = -1;
XmodRows4.forEach(function (r, i) { if (XoptIdx === -1 && r.optional === true) XoptIdx = i; });
XmodRows4[XoptIdx].present = true;
XmodRows4[XoptIdx].matches_expected = false;
XmodRows4[XoptIdx].declared_build = 'F1-STALE-MIGRATION';
XCASES.push(['H4 a PRESENT optional owner that does not match', { stamps: stampsWith_({ modules: XmodRows4 }) },
  'every_required_module_stamp_is_present_and_matches_what_is_expected', 'MODULE_STAMP_MISMATCH']);

XCASES.forEach(function (c) {
  var label = 'X3 ' + c[0] + ': ';
  var r = manifestP(pos(c[1]));
  eq(r.res.verdict, 'STOP', label + 'STOP', failed(r.res));
  ok(failed(r.res).indexOf(c[2]) >= 0, label + 'on ' + c[2], failed(r.res));
  var reasons = (r.res.deployment && r.res.deployment.stop_reasons) || [];
  ok(reasons.some(function (x) { return String(x).indexOf(c[3]) === 0; }),
    label + 'named ' + c[3], reasons);
  // TEST K — a STOP hands over nothing pasteable and nothing to sign, in every one of these worlds.
  eq(r.res.freeze_paste_block, null, label + 'no paste block');
  eq(r.res.frozen_before, null, label + 'no baseline');
  eq(mpChunks(r.world), 0, label + 'no freeze chunk');
  eq(r.res.operator_authorization_wording, null, label + 'no authorization wording');
  // TEST M — and nothing was written or called anywhere.
  eq([r.world.allWrites(), r.res.writes, r.res.writer_calls, r.res.writer_constructed,
    r.res.submit_calls, r.res.route_save_calls], [0, 0, 0, false, 0, 0], label + 'zero writes');
  eq([r.res.dry_run_proof.generate_called, r.res.dry_run_proof.submit_called],
    [false, false], label + 'no Generate, no Submit');
});

// ---- X4 — THE PREDICATE IS NOT SATISFIED BY THE VERDICT STRING ALONE (§4). -----------------------------
// A deployment that is mixed, stale and on the wrong build, whose verdict still SAYS UNIFORM. If the check
// leaned on the string, this would pass.
var X4 = manifestP(pos({ stamps: stampsWith_({
  verdict: 'UNIFORM — every probed owner file declares the build its manifest entry expects',
  mixed_deployment: true,
  stale_modules: ['16_shipping_allocation_handlers.gs declares OLD, expected NEW'],
  deployment_build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9' }) }));
eq(X4.res.verdict, 'STOP',
  'X4  a UNIFORM verdict does not rescue a mixed, stale, wrong-build deployment', failed(X4.res));
['the_deployment_is_not_mixed', 'no_owner_module_is_stale',
  'the_deployment_build_is_the_one_this_manifest_was_written_against'
].forEach(function (n, i) {
  ok(failed(X4.res).indexOf(n) >= 0, 'X4a.' + (i + 1) + ' ' + n + ' still fails');
});
eq(predOf(X4.res, 'the_deployment_verdict_is_uniform').pass, true,
  'X4b while the verdict condition itself passes — it is ONE of eleven, never the gate');
// AND THE VERDICT CHECK IS ANCHORED, not a substring search.
var X4c = manifestP(pos({ stamps: stampsWith_({
  verdict: 'MIXED_OR_PARTIAL_SYNC (RUNTIME) — this text happens to contain the word UNIFORM' }) }));
eq(predOf(X4c.res, 'the_deployment_verdict_is_uniform').pass, false,
  'X4c a verdict that merely CONTAINS "UNIFORM" is not uniform');
eq(X4c.res.verdict, 'STOP', 'X4d so that world STOPs', failed(X4c.res));
// AND THE PREDICATE IS NOT A CONSTANT.
ok(S1_BARE.indexOf("the_deployment_contract_is_readable', true, true") === -1,
  'X4e the readable predicate was not simply set to true');
ok(S1_BARE.indexOf('dep.readable === true') > 0,
  'X4f it is bound to the measured shape verdict');

// ---- X5 — TEST L: A READY RUN STILL PRODUCES THE FULL WRITE SET AND THE FULL-ROW FREEZE. ---------------
var X5fb = X2.res.frozen_before;
ok(!!X5fb, 'X5  the READY run froze a baseline');
eq([X5fb.expected_create_header_count, X5fb.expected_create_line_count], [1, 1],
  'X5a with the exact write set intact: one header, one line to CREATE');
ok(X5fb.expected_header_ids.length === 1 && /^SADH-K2-[0-9A-F]{8}$/.test(X5fb.expected_header_ids[0]),
  'X5b named by its deterministic K2 header id', X5fb.expected_header_ids);
ok(X5fb.expected_line_ids.length === 1 && /^SADL-K2-[0-9A-F]{8}$/.test(X5fb.expected_line_ids[0]),
  'X5c and its deterministic K2 line id', X5fb.expected_line_ids);
eq([X5fb.draft_header_live_column_count, X5fb.draft_line_live_column_count], [36, 31],
  'X5d and the full-row freeze still covers all 36 header and 31 line columns');
eq([X5fb.draft_header_excluded_fields, X5fb.draft_line_excluded_fields], [[], []],
  'X5e with nothing excluded');
ok(X5fb.target_manual_combined_fingerprint !== null
  && X5fb.other_scope_combined_fingerprint !== null,
  'X5f and every content fingerprint present');
eq((String(X2.res.operator_authorization_wording).match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []), [],
  'X5g the authorization sentence carries no placeholder');
ok(String(X2.res.operator_authorization_wording).indexOf('CREATE 1 allocation draft header(s)') > 0,
  'X5h and states the predicted creates');
eq([X2.world.allWrites(), X2.res.writes, X2.res.writer_calls], [0, 0, 0],
  'X5i measured: the READY run wrote nothing');

// ---- X6 — THE CENSUS SUMMARY REPORTS THE CONTRACT WITHOUT DUMPING THE 23 MODULE ROWS. -----------------
var X6 = census(pos());
var X6d = X6.res.environment.deployment;
eq(X6d.modules, undefined,
  'X6  the census summary still omits the per-module rows — they are what truncated the first live run');
eq([X6d.readable, X6d.contract_ok], [true, true],
  'X6a while reporting both the shape and the health verdicts');
eq(X6d.module_count, REAL_STAMPS_.modules.length,
  'X6b and the row COUNT, so an empty manifest is still visible');
var X6max = (X6.world.log || []).reduce(function (m, l) { return Math.max(m, String(l).length); }, 0);
ok(X6max < 3000, 'X6c with every emitted line still under the chunk bound', X6max);

// ================================================================================================================
section('Y — S1-R4C: an id that is there, two populations that are not one, and a sentence a person can read');
// ================================================================================================================
//
// THREE FINDINGS FROM ONE READY RUN, and none of them was a failed condition — which is the point. The run
// reported 99 passed / 0 failed and handed over a freeze block, and a human reading it found:
//
//   factory_stock_movement_count = 96 beside factory_stock_movement_ids[0] = ""
//   identity_universe_count = 118 / other_scope_identity_count = 117 beside 11 header rows and 13 line rows
//   authorization_wording_present = true, and no wording anywhere in the log
//
// Each is a claim the manifest could not have contradicted: a blank accepted as an identity, one word covering
// two populations, and a boolean standing in for the text it describes.

function authChunks(w) {
  return logTags(w).filter(function (n) {
    return /^s1_manifest_p_authorization_\d+_of_\d+$/.test(n);
  }).length;
}
function authText(w) {
  // Reassembled the way the meta line tells an operator to reassemble it: by segment order, concatenated.
  var out = [];
  (w.log || []).forEach(function (l) {
    var m = String(l).match(/^\[S1\] s1_manifest_p_authorization_(\d+)_of_(\d+) ([\s\S]*)$/);
    if (m) out.push({ i: Number(m[1]), text: m[3] });
  });
  out.sort(function (a, b) { return a.i - b.i; });
  return out.map(function (x) { return x.text; }).join('');
}
function mvSurf(res) {
  return ((res.factory_surfaces || {}).surfaces || {})['factory_stock_movements'] || {};
}
var MOVROW_ = { movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 5,
  created_at: '2026-09-01T00:00:00Z' };
function mov(over) {
  var r = {};
  Object.keys(MOVROW_).forEach(function (k) { r[k] = MOVROW_[k]; });
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
/** Every refusal in this section owes the same eight things, so they are asserted together rather than
 *  remembered one at a time: a STOP, the named condition, the named code, and nothing signable. */
function idFaultStop(r, label, predicate, code) {
  eq(r.res.verdict, 'STOP', label + ' the manifest STOPs', failed(r.res));
  ok(failed(r.res).indexOf(predicate) >= 0, label + '1 on ' + predicate, failed(r.res));
  ok((r.res.factory_id_fault_codes || []).indexOf(code) >= 0,
    label + '2 with the named code ' + code, r.res.factory_id_fault_codes);
  eq(mvSurf(r.res).observation_state, 'ID_INTEGRITY_FAULT',
    label + '3 and the surface is marked ID_INTEGRITY_FAULT');
  eq(mvSurf(r.res).ids, null,
    label + '4 with NO id list published — a blank is never quietly a member of one', mvSurf(r.res).ids);
  eq([r.res.freeze_paste_block, r.res.operator_authorization_wording, r.res.frozen_before],
    [null, null, null], label + '5 nothing pasteable, nothing to sign, no baseline');
  eq([mpChunks(r.world), authChunks(r.world)], [0, 0],
    label + '6 zero freeze chunks and zero authorization chunks');
  eq([r.res.writes, r.res.writer_calls, r.res.submit_calls], [0, 0, 0], label + '7 and zero writes');
  eq(r.world.allWrites(), 0, label + '8 measured on every sheet in the world');
}

// ---- Y1 — THE FIRST ROW HAS NO ID. -----------------------------------------------------------------------
// The live shape, reproduced. `ids` was built by mapping the id cell of every row and sorting the result, so
// the empty string sorted to index 0 — which is why the log said `ids[0] = ""` and why the position told a
// reader nothing at all about which row to go and look at.
var Y1 = manifestP(pos({ movements: [mov({}), mov({ factory_stock_movement_id: 'MV-2' })] }));
idFaultStop(Y1, 'Y1 ', 'every_factory_audit_row_carries_a_non_blank_id', 'FACTORY_MOVEMENT_ID_BLANK');
var Y1i = mvSurf(Y1.res).id_integrity;
eq([Y1i.checked, Y1i.clean, Y1i.blank_id_count, Y1i.ok_count],
  [true, false, 1, 1], 'Y1a one blank id out of two rows, counted');
eq(Y1i.blank_id_rows.length, 1, 'Y1b and the blank is reported as a ROW, not as a position in a sorted list');
eq(Y1i.blank_id_rows[0].row_number, 2,
  'Y1c naming the 1-based sheet row a person can open — the header is row 1',
  Y1i.blank_id_rows[0]);
ok(Y1i.blank_id_rows[0].fingerprint !== null,
  'Y1d with the full-row fingerprint of that row, so the row is identifiable by content too',
  Y1i.blank_id_rows[0].fingerprint);
eq(Y1i.faults, ['FACTORY_MOVEMENT_ID_BLANK'], 'Y1e and exactly one fault class is claimed');
// The full-row fingerprint of the TABLE is still computed: it is derived from the cells, not from the ids,
// so it stays valid evidence even while the id list is withheld.
ok(mvSurf(Y1.res).combined_fingerprint !== null,
  'Y1f the table fingerprint survives the id fault — the cells were readable',
  mvSurf(Y1.res).combined_fingerprint);

// ---- Y2 — A ROW IN THE MIDDLE HAS NO ID. -----------------------------------------------------------------
// Sorting hid position, so the first version of this defect was only ever seen at index 0. A blank in row 3
// is the same fault and must be reported at row 3.
var Y2 = manifestP(pos({ movements: [
  mov({ factory_stock_movement_id: 'MV-1' }),
  mov({ movement_date: '2026-09-02' }),
  mov({ factory_stock_movement_id: 'MV-3', movement_date: '2026-09-03' })] }));
idFaultStop(Y2, 'Y2 ', 'every_factory_audit_row_carries_a_non_blank_id', 'FACTORY_MOVEMENT_ID_BLANK');
var Y2i = mvSurf(Y2.res).id_integrity;
eq([Y2i.blank_id_count, Y2i.ok_count, Y2i.row_count], [1, 2, 3],
  'Y2a one of three rows has no id, and the other two are counted as having one');
eq(Y2i.blank_id_rows[0].row_number, 3, 'Y2b reported at row 3, where it actually is',
  Y2i.blank_id_rows[0]);

// ---- Y3 — TWO ROWS CLAIM ONE IDENTITY. -------------------------------------------------------------------
// A duplicate is not a missing id and it is not harmless: the id is the key an AFTER readback matches rows
// by, so two rows under one key make "this row is unchanged" unanswerable.
var Y3 = manifestP(pos({ movements: [
  mov({ factory_stock_movement_id: 'MV-DUP' }),
  mov({ factory_stock_movement_id: 'MV-DUP', movement_date: '2026-09-02', qty: 9 })] }));
idFaultStop(Y3, 'Y3 ', 'no_factory_audit_row_id_is_duplicated', 'FACTORY_MOVEMENT_ID_DUPLICATE');
var Y3i = mvSurf(Y3.res).id_integrity;
eq([Y3i.duplicate_id_count, Y3i.blank_id_count], [1, 0],
  'Y3a counted as a duplicate and NOT as a blank — different faults, different remedies');
eq(Y3i.duplicate_ids, ['MV-DUP'], 'Y3b naming the id that is claimed twice');
eq([Y3i.duplicate_id_rows[0].row_number, Y3i.duplicate_id_rows[0].first_seen_row], [3, 2],
  'Y3c and BOTH rows, so a person can compare them', Y3i.duplicate_id_rows[0]);

// ---- Y3b — AN ID THAT IS NOT A STRING. -------------------------------------------------------------------
// A sheet coerces on read. A numeric-looking id comes back as a number and prints in a log exactly like the
// string would, while comparing and hashing differently on the way back.
var Y3b = manifestP(pos({ movements: [
  mov({ factory_stock_movement_id: 'MV-1' }),
  mov({ factory_stock_movement_id: 20260901, movement_date: '2026-09-02' })] }));
idFaultStop(Y3b, 'Y3b ', 'every_factory_audit_row_id_is_a_string_not_a_coerced_number_or_date',
  'FACTORY_MOVEMENT_ID_WRONG_TYPE');
var Y3bi = mvSurf(Y3b.res).id_integrity;
eq([Y3bi.wrong_type_id_count, Y3bi.blank_id_count, Y3bi.duplicate_id_count], [1, 0, 0],
  'Y3b_a counted as a wrong TYPE, not as missing and not as duplicated');
eq(Y3bi.wrong_type_id_rows[0].observed_type, '[object Number]',
  'Y3b_b with the type that was actually observed', Y3bi.wrong_type_id_rows[0]);

// ---- Y4 — THE HEADER ROW IS NOT A RECORD, AND NEITHER IS A BLANK ONE. ------------------------------------
// Asserted rather than assumed, because "did the reader include the header" is exactly the question the live
// finding raised, and the answer has to be checkable. The header cell for the id column literally contains
// the string `factory_stock_movement_id`, so if it were ever read as data that value would appear in the id
// list — a uniquely recognisable footprint.
var Y4 = manifestP(pos({ movements: [
  mov({ factory_stock_movement_id: 'MV-1' }),
  mov({ factory_stock_movement_id: 'MV-2', movement_date: '2026-09-02' })] }));
eq(Y4.res.verdict, 'READY_TO_AUTHORIZE', 'Y4 two well-formed movement rows are simply fine', failed(Y4.res));
eq(mvSurf(Y4.res).row_count, 2, 'Y4a the row count is 2 — the header row is not one of them');
eq(mvSurf(Y4.res).ids, ['MV-1', 'MV-2'], 'Y4b and the id list is exactly the two data ids');
ok(mvSurf(Y4.res).ids.indexOf('factory_stock_movement_id') === -1,
  'Y4c the header cell value never appears as an identity', mvSurf(Y4.res).ids);
eq(mvSurf(Y4.res).id_integrity.blank_id_count, 0,
  'Y4d and the header contributes no blank id either');
// A TRAILING EMPTY SHEET ROW IS NOT A RECORD WITH A MISSING ID. The two must not be confused: one is a
// spreadsheet artifact, the other is a data fault, and treating the first as the second would make every
// sheet with a spare row refuse.
var Y4w = S1World(pos({ movements: [mov({ factory_stock_movement_id: 'MV-1' })] }));
var Y4sh = Y4w.sheets['factory_stock_movements'];
Y4sh.rows.push(Y4sh.rows[0].map(function () { return ''; }));
var Y4res = vm.runInContext('RUN_S1_MANIFEST_P()', Y4w.ctx);
eq(Y4res.verdict, 'READY_TO_AUTHORIZE',
  'Y4e a trailing empty sheet row is skipped, not refused as a blank id', failed(Y4res));
eq([mvSurf(Y4res).row_count, mvSurf(Y4res).id_integrity.blank_id_count], [1, 0],
  'Y4f it is not counted as a row and it is not counted as a fault');
eq(Y4w.allWrites(), 0, 'Y4g and zero writes');

// ---- Y5 — THE AUTHORITY, AND WHY THERE IS NO LEGACY ALLOWANCE TO HONOUR. ---------------------------------
// §6 asks for authority evidence if a blank is permitted. It is not, and the evidence for THAT is what this
// asserts — from the shipped schema and from 21_'s own source, not from a sentence in the diagnostic.
var Y5c = mvSurf(Y4.res).id_authority_contract;
eq([Y5c.required, Y5c.unique, Y5c.blank_permitted], [true, true, false],
  'Y5 the contract for factory_stock_movement_id: required, unique, blank NOT permitted');
ok(Y5c.schema_authority.indexOf('PK') > 0 && Y5c.schema_authority.indexOf('Required Yes') > 0,
  'Y5a naming the schema authority that makes it a required primary key', Y5c.schema_authority);
// AND THE WRITER SIDE, READ FROM 21_ RATHER THAN SPELLED HERE. Every movement row in production is written
// by one of three places in 21_ (12_, 13_ and 22_ all delegate to factoryStockApplyDeltaTx_), and each
// generates the id. So a blank cannot have come from a writer, which is why it is a data fault and a STOP.
var Y5g21 = read(GS + '21_factory_inventory_handlers.gs');
eq((Y5g21.match(/factory_stock_movement_id: /g) || []).length, 3,
  'Y5b 21_ has exactly three places that build a movement row',
  (Y5g21.match(/factory_stock_movement_id: [^,\n]*/g) || []));
ok((Y5g21.match(/'FSMV-' \+ Utilities\.getUuid\(\)/g) || []).length >= 3,
  'Y5c and every one of them mints FSMV-<hex> — none can emit a blank',
  (Y5g21.match(/'FSMV-' \+ Utilities\.getUuid\(\)/g) || []).length);
ok(Y5g21.indexOf('function factoryStockApplyDeltaTx_') > 0,
  'Y5d including the shared path 12_, 13_ and 22_ delegate to');
ok(Y5c.writer_authority.indexOf('FSMV-') > 0
  && Y5c.writer_authority.indexOf('factoryStockApplyDeltaTx_') > 0,
  'Y5e which is what the recorded writer authority claims', Y5c.writer_authority);

// ---- Y6 — A ROW OUTSIDE THE NAMED COLUMNS IS A READ-RANGE FAULT, NOT A MISSING ID. ----------------------
// The one case where §4 applies rather than §5. A value in a column whose header cell is empty makes a row
// non-blank without making it a record: every named field of it, the id included, reads empty. Reporting
// that as a missing primary key would send a person looking for data damage that is not there.
var Y6w = S1World(pos({ movements: [mov({ factory_stock_movement_id: 'MV-1' })] }));
var Y6sh = Y6w.sheets['factory_stock_movements'];
Y6sh.rows.forEach(function (r) { r.splice(3, 0, ''); });     // an UNLABELLED column, in the middle
var Y6stray = Y6sh.rows[0].map(function () { return ''; });
Y6stray[3] = 'someone typed a note here';
Y6sh.rows.push(Y6stray);
var Y6res = vm.runInContext('RUN_S1_MANIFEST_P()', Y6w.ctx);
eq(Y6res.verdict, 'STOP', 'Y6 a stray row outside the named columns is refused', failed(Y6res));
ok(failed(Y6res).indexOf('no_row_outside_the_named_columns_was_counted_as_a_factory_record') >= 0,
  'Y6a under its OWN condition, not as a blank id', failed(Y6res));
ok((Y6res.factory_id_fault_codes || []).indexOf('FACTORY_MOVEMENT_ROW_OUTSIDE_NAMED_COLUMNS') >= 0,
  'Y6b with its own named code', Y6res.factory_id_fault_codes);
var Y6i = mvSurf(Y6res).id_integrity;
eq([Y6i.outside_named_columns_count, Y6i.blank_id_count], [1, 0],
  'Y6c counted as OUTSIDE the schema and NOT as a record missing its id — different remedies');
eq(Y6i.outside_named_columns_rows[0].row_number, 3,
  'Y6d naming the row to clear', Y6i.outside_named_columns_rows[0]);
eq([Y6res.freeze_paste_block, Y6res.operator_authorization_wording], [null, null],
  'Y6e and nothing is released from it');
eq(Y6w.allWrites(), 0, 'Y6f zero writes');

// ---- Y7 — MANY GAP SCOPES AND A FEW DRAFT ROWS, IN ONE WORLD, NOT CONFUSED. -----------------------------
// The live numbers, reproduced at their real magnitudes: 118 gap scopes beside a couple of dozen draft rows.
// The old field names invited a reader to treat 118 as an identity count and 11 + 13 as a subset of it.
var Y7extraGap = [];
for (var y7 = 1; y7 <= 117; y7++) {
  Y7extraGap.push({ sku: 'GAPONLY-' + y7, calculation_status: 'READY',
    d18_suggested_qty: 0, d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 });
}
var Y7hdrs = [], Y7lns = [];
for (var y7h = 1; y7h <= 5; y7h++) {
  Y7hdrs.push({ allocation_draft_id: 'OTHER-Y7-' + y7h, planning_cycle: GAP_CYCLE, company: 'ResEU',
    country: 'DE', marketplace: 'Amazon', status: 'draft', generation_type: 'user_created' });
  Y7lns.push({ allocation_draft_line_id: 'OTHER-Y7-' + y7h + '-L1',
    allocation_draft_id: 'OTHER-Y7-' + y7h, sku: 'OTHER-SKU', planned_qty: 10, line_status: 'planned' });
}
var Y7 = manifestP(pos({ extraGap: Y7extraGap, extraHeaders: Y7hdrs, extraLines: Y7lns }));
eq(Y7.res.verdict, 'READY_TO_AUTHORIZE', 'Y7 the world is still READY', failed(Y7.res));
var Y7g = Y7.res.gap_scope_universe, Y7d = Y7.res.allocation_draft_row_universe;
eq(Y7g.population, 'INVENTORY_GAP_SCOPES', 'Y7a the gap universe names its population');
eq(Y7d.population, 'ALLOCATION_DRAFT_ROWS', 'Y7a2 and the draft universe names a different one');
eq(Y7g.total_scope_count, 118, 'Y7c 118 GAP SCOPES — the live number', Y7g.total_scope_count);
eq([Y7g.target_scope_count, Y7g.other_scope_count], [1, 117],
  'Y7d of which 1 is the target scope and 117 are not');
// AND THE DRAFT ROWS ARE A DIFFERENT POPULATION WITH A DIFFERENT TOTAL.
eq(Y7d.total_row_count, Y7d.header_count + Y7d.line_count,
  'Y7e the draft row total is header rows plus line rows',
  [Y7d.header_count, Y7d.line_count, Y7d.total_row_count]);
ok(Y7d.total_row_count !== Y7g.total_scope_count,
  'Y7f and it is NOT 118 — two populations, two numbers',
  [Y7d.total_row_count, Y7g.total_scope_count]);
eq(Y7d.other_scope_row_count, Y7d.other_scope_header_count + Y7d.other_scope_line_count,
  'Y7g the other-scope row total is its own header and line counts',
  [Y7d.other_scope_header_count, Y7d.other_scope_line_count, Y7d.other_scope_row_count]);
eq(Y7d.other_scope_header_count, 5, 'Y7h five other-scope headers, counted as ROWS');
eq(Y7d.other_scope_line_count, 5, 'Y7i and five other-scope lines');
eq(Y7d.target_row_count + Y7d.other_scope_row_count, Y7d.total_row_count,
  'Y7j the partition closes exactly');
eq(Y7d.row_signature_count, Y7d.total_row_count,
  'Y7k with exactly one full-row signature per row');
ok(Y7d.combined_fingerprint !== null && Y7g.scope_fingerprint !== null
  && Y7d.combined_fingerprint !== Y7g.scope_fingerprint,
  'Y7l and two DIFFERENT fingerprints, so a readback cannot compare one against the other',
  [Y7g.scope_fingerprint, Y7d.combined_fingerprint]);
// THE FROZEN BASELINE CARRIES BOTH, EACH UNDER ITS OWN NAME.
var Y7fb = Y7.res.frozen_before;
eq([Y7fb.gap_scope_universe_total_count, Y7fb.gap_scope_universe_other_count], [118, 117],
  'Y7m the freeze carries the gap scope counts under gap_scope_universe_*');
eq(Y7fb.draft_row_universe_total_row_count, Y7d.total_row_count,
  'Y7n and the draft row count under draft_row_universe_*');
ok(Y7fb.identity_universe_count === undefined && Y7fb.other_scope_identity_count === undefined,
  'Y7o and the ambiguous names are gone from it entirely');
// AND THE READBACK EXPECTATION IS STATED PER POPULATION: a generation adds draft rows and no gap scopes.
eq(Y7.res.expected_outcome.expected_gap_scope_universe_count_after, 118,
  'Y7p a generation is expected to add NO gap scope');
eq(Y7.res.expected_outcome.expected_draft_row_universe_total_after,
  Y7d.total_row_count + Y7.res.predicted_write_set.expected_create_header_count
    + Y7.res.predicted_write_set.expected_create_line_count,
  'Y7q while the draft row total is expected to grow by exactly the CREATED rows',
  Y7.res.expected_outcome.expected_draft_row_universe_derivation);
eq(Y7.world.allWrites(), 0, 'Y7r and zero writes across the whole world');

// ---- Y7b — AN EMPTY TARGET SCOPE ACQUIRES NO IDENTITY FROM THE OTHER UNIVERSE. --------------------------
// 118 gap scopes exist and the target scope holds no AI rows at all. Zero must stay zero: the count that
// belongs to one population must never be borrowed by the other.
eq(Y7d.target_ai_header_count, 0, 'Y7b the target scope has no existing AI header');
eq(Y7.res.ai_identity_sets.existing_active_ai_identity_count, 0,
  'Y7b1 and the AI identity set agrees — not 117, not 118');
ok(Y7.res.predicted_write_set.expected_header_ids.length >= 1,
  'Y7b2 while the run still predicts a CREATE, which is the distinction R4A drew',
  Y7.res.predicted_write_set.expected_header_ids);

// ---- Y8 — DRAFT UNIVERSE ARITHMETIC THAT DOES NOT CLOSE IS A STOP. -------------------------------------
// The guard against the confusion coming back: if a future edit fed this block a count from the gap census,
// the partition would stop adding up and the run refuses rather than freezing a total of a population that
// does not exist.
var Y8 = withMP(swapS1('      other_scope_row_count: duOtherRows,',
  '      other_scope_row_count: duOtherRows + 1,'), pos());
eq(Y8.res.verdict, 'STOP', 'Y8 an other-scope row total that does not equal its parts is refused',
  failed(Y8.res));
ok(failed(Y8.res).indexOf('the_other_scope_row_total_is_its_header_count_plus_its_line_count') >= 0,
  'Y8a on the arithmetic condition', failed(Y8.res));
eq([Y8.res.freeze_paste_block, Y8.res.operator_authorization_wording], [null, null],
  'Y8b and nothing is released');
var Y8b = withMP(swapS1('      total_row_count: part.header_table.row_count + part.line_table.row_count,',
  '      total_row_count: uniKeys.length,'), pos());
eq(Y8b.res.verdict, 'STOP',
  'Y8c and feeding it the GAP SCOPE count — the exact confusion — is refused too', failed(Y8b.res));
ok(failed(Y8b.res).indexOf('the_draft_row_universe_total_is_its_header_rows_plus_its_line_rows') >= 0,
  'Y8d by the arithmetic, without needing to know where the wrong number came from', failed(Y8b.res));

// ---- Y9 — THE SENTENCE IS PRINTED, IN SEGMENTS, AND IT REASSEMBLES EXACTLY. -----------------------------
var Y9 = manifestP(pos());
eq(Y9.res.verdict, 'READY_TO_AUTHORIZE', 'Y9 a READY run', failed(Y9.res));
ok(authChunks(Y9.world) >= 1, 'Y9a emits at least one s1_manifest_p_authorization_<i>_of_<n> line',
  authChunks(Y9.world));
eq(Y9.res.authorization_chunks, authChunks(Y9.world),
  'Y9b and the returned chunk count is the number of lines actually emitted');
eq(authText(Y9.world), String(Y9.res.operator_authorization_wording),
  'Y9c the segments reassemble to the EXACT sentence, byte for byte — nothing truncated');
ok(logTags(Y9.world).indexOf('s1_manifest_p_authorization_meta') >= 0,
  'Y9d with a meta line so a reader can confirm what they reassembled', logTags(Y9.world));
var Y9meta = JSON.parse(String((Y9.world.log || []).filter(function (l) {
  return String(l).indexOf('[S1] s1_manifest_p_authorization_meta ') === 0;
})[0]).replace('[S1] s1_manifest_p_authorization_meta ', ''));
eq([Y9meta.chunks, Y9meta.bytes],
  [Y9.res.authorization_chunks, String(Y9.res.operator_authorization_wording).length],
  'Y9e the meta line states the segment count and the byte count');
ok(Y9meta.wording_fingerprint !== null,
  'Y9f and a fingerprint over the whole text, so a mis-assembled copy is detectable',
  Y9meta.wording_fingerprint);
eq(Y9meta.placeholders, [], 'Y9g with no placeholders in it');
eq(Y9meta.facts_missing, [], 'Y9h and no required fact missing');
// ---- and the sentence carries every fact a person has to be able to check ----
var Y9w = String(Y9.res.operator_authorization_wording);
eq(Y9.res.wording_audit.missing, [], 'Y9i the wording audit finds every required fact',
  Y9.res.wording_audit.missing);
ok(Y9.res.wording_audit.required_item_count >= 25,
  'Y9j and there are enough of them for the check to mean something',
  Y9.res.wording_audit.required_item_count);
['ResUS', 'US', 'Amazon', SKU].forEach(function (t) {
  ok(Y9w.indexOf(t) > 0, 'Y9k the exact scope axis ' + t + ' is in the sentence');
});
Y9.res.predicted_write_set.expected_header_ids.forEach(function (id) {
  ok(Y9w.indexOf(id) > 0, 'Y9l the exact expected header id ' + id + ' is in the sentence');
});
Y9.res.predicted_write_set.expected_line_ids.forEach(function (id) {
  ok(Y9w.indexOf(id) > 0, 'Y9m the exact expected line id ' + id + ' is in the sentence');
});
Y9.res.predicted_write_set.expected_k2_group_keys.forEach(function (k) {
  ok(Y9w.indexOf(k) > 0, 'Y9n and the K2 group key is too');
});
ok(Y9w.indexOf('CREATE ') > 0 && Y9w.indexOf('UPDATE ') > 0 && Y9w.indexOf('EXPIRE ') > 0,
  'Y9o with CREATE, UPDATE and EXPIRE counts');
ok(Y9w.indexOf(String(Y9.res.row_content.target_manual.combined_fingerprint)) > 0
  && Y9w.indexOf(String(Y9.res.row_content.other_scope.combined_fingerprint)) > 0,
  'Y9p the protected manual and other-scope full-row fingerprints');
// S1-R4C §3 — THE FACTORY BASELINE IS NOW IN THE SENTENCE, not only in the freeze.
ok(Y9w.indexOf('factory_stock_movements ') > 0 && Y9w.indexOf('factory_stock_override_audit ') > 0
  && Y9w.indexOf('reservations ') > 0,
  'Y9q the factory movement, override-audit and reservation baselines');
ok(Y9w.indexOf(String(mvSurf(Y9.res).combined_fingerprint)) > 0,
  'Y9r including the movement table fingerprint a readback would compare');
ok(Y9w.indexOf('IT DOES NOT AUTHORIZE SUBMIT') > 0, 'Y9s and the boundary of what it authorizes');
eq((Y9w.match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []), [], 'Y9t with no placeholder anywhere in it');
eq([Y9.res.writes, Y9.res.writer_calls, Y9.res.submit_calls, Y9.res.route_save_calls], [0, 0, 0, 0],
  'Y9u and the run that produced it wrote nothing');
eq([Y9.res.dry_run_proof.generate_called, Y9.res.dry_run_proof.submit_called], [false, false],
  'Y9v having called neither Generate nor Submit');
eq(Y9.world.allWrites(), 0, 'Y9w measured on every sheet');

// ---- Y9x — AN ABSENT SURFACE IS STATED IN THE SENTENCE, NOT LEFT AS A GAP IN IT. ----------------------
// R4A's rule reaches the wording too: absent is not zero. The first version rendered a null row count
// through S1_str_ and produced 'reservations SHEET_ABSENT with  row(s)' — a double space where a number
// belongs, which a reader takes for a typo instead of the deliberate distinction it is. And an absent
// surface is not asked for a fingerprint it cannot have; it is asked to say that it is absent.
var Y9x = manifestP(pos({ movements: null }));
eq(Y9x.res.verdict, 'READY_TO_AUTHORIZE',
  'Y9x an absent movement table is honest, not a fault', failed(Y9x.res));
var Y9xw = String(Y9x.res.operator_authorization_wording);
ok(Y9xw.indexOf('factory_stock_movements SHEET_ABSENT') > 0,
  'Y9x1 and the sentence names the absence');
ok(Y9xw.indexOf('the table is absent, which is not the same as zero rows') > 0,
  'Y9x2 spelling out that it is not zero rows, rather than leaving a blank where a count goes');
ok(Y9xw.indexOf(' with  row(s)') === -1,
  'Y9x3 with no empty count anywhere in it');
eq(Y9x.res.wording_audit.missing, [],
  'Y9x4 and the audit does not demand a fingerprint the absent table cannot have',
  Y9x.res.wording_audit.missing);
eq([Y9x.res.frozen_before.factory_stock_movement_state,
  Y9x.res.frozen_before.factory_stock_movement_count], ['SHEET_ABSENT', null],
  'Y9x5 while the freeze still records SHEET_ABSENT with a NULL count, never 0');
eq(authText(Y9x.world), Y9xw, 'Y9x6 and the printed segments still reassemble exactly');
eq(Y9x.world.allWrites(), 0, 'Y9x7 zero writes');

// ---- Y10 — A PLACEHOLDER SENTENCE IS REFUSED, AND PRINTS NOTHING. --------------------------------------
var Y10 = withMP(swapS1("  if (!ws || ws.measurable !== true || !ids) return null;",
  "  if (!ws || ws.measurable !== true || !ids) return null;\n"
  + "  return 'I authorize ONE controlled generation for <company> / <country> / <marketplace> /"
  + " <sku>. IT DOES NOT AUTHORIZE SUBMIT.';"), pos());
eq(Y10.res.verdict, 'STOP', 'Y10 a sentence with placeholders is refused', failed(Y10.res));
ok(String(Y10.res.stop_reason).indexOf('placeholder') > 0,
  'Y10a naming the placeholders as the reason', Y10.res.stop_reason);
eq(Y10.res.operator_authorization_wording, null, 'Y10b and the wording is withheld');
eq([authChunks(Y10.world), mpChunks(Y10.world)], [0, 0],
  'Y10c with zero authorization chunks and zero freeze chunks — nothing signable was printed');
ok(String(authText(Y10.world)).indexOf('<company>') === -1,
  'Y10d and the placeholder text never reached the log at all', authText(Y10.world));

// ---- Y11 — A SENTENCE THAT DROPS THE EXACT IDENTITIES IS REFUSED. -------------------------------------
// LOCK THREE cannot catch this: the sentence is filled in from measured values and has no placeholder. It
// simply no longer says WHICH identities may be written, which is the one thing the authorization bounds.
var Y11 = withMP(swapS1(
  "    + ' The EXACT K2 identities it may write are header(s) ' + (hIds.length ? hIds.join(', ') : '(none)')\n"
  + "    + ' and line(s) ' + (lIds.length ? lIds.join(', ') : '(none)')\n"
  + "    + '; K2 group key(s) ' + ((ws.expected_k2_group_keys || []).join(', ') || '(none)')\n"
  + "    + '. No other identity may be created or altered.'",
  "    + ' No other identity may be created or altered.'"), pos());
eq(Y11.res.verdict, 'STOP', 'Y11 a filled-in sentence that names no identity is refused', failed(Y11.res));
ok(String(Y11.res.stop_reason).indexOf('AUTHORIZATION_WORDING_IS_NOT_VERIFIABLE') === 0,
  'Y11a under its own named reason', Y11.res.stop_reason);
eq(Y11.res.wording_audit.placeholders, [],
  'Y11b with NO placeholder in it — which is why LOCK THREE could not have caught this');
ok(Y11.res.wording_audit.missing.length >= 3,
  'Y11c and the missing facts are named, one per identity',
  Y11.res.wording_audit.missing);
ok(Y11.res.wording_audit.missing.filter(function (m) {
  return m.indexOf('expected_header_id:') === 0; }).length >= 1,
  'Y11d including the exact header id the sentence stopped naming',
  Y11.res.wording_audit.missing);
eq([Y11.res.operator_authorization_wording, Y11.res.freeze_paste_block], [null, null],
  'Y11e and nothing is released');
eq([authChunks(Y11.world), mpChunks(Y11.world)], [0, 0], 'Y11f zero chunks of either kind');
// AND A DROPPED FINGERPRINT IS THE SAME CLASS OF FAULT.
var Y11g = withMP(swapS1(
  "    + ' (fingerprint ' + S1_str_(mv && mv.combined_fingerprint) + ')'", "    + ''"), pos());
eq(Y11g.res.verdict, 'STOP',
  'Y11g dropping the factory movement fingerprint from the sentence is refused too', failed(Y11g.res));
ok(Y11g.res.wording_audit.missing.indexOf('factory_movement_fingerprint') >= 0,
  'Y11h naming the fact that went missing', Y11g.res.wording_audit.missing);

// ---- Y12 — ON EVERY STOP: NO WORDING, NO BASELINE, NO CHUNKS OF EITHER KIND. --------------------------
// One table over refusals of four different KINDS, because "a STOP hands over nothing" has to hold for all
// of them and not only for the one that was being worked on.
[['Y12a a blank movement id', Y1],
  ['Y12b a duplicate movement id', Y3],
  ['Y12c a stray row outside the named columns', { res: Y6res, world: Y6w }],
  ['Y12d broken draft-universe arithmetic', Y8],
  ['Y12e a placeholder sentence', Y10],
  ['Y12f a sentence missing the exact identities', Y11]].forEach(function (p) {
  var n = p[0], r = p[1];
  eq(r.res.verdict, 'STOP', n + ' STOPs');
  eq([r.res.operator_authorization_wording, r.res.freeze_paste_block, r.res.frozen_before],
    [null, null, null], n + ' — no wording, no paste block, no baseline');
  eq([authChunks(r.world), mpChunks(r.world)], [0, 0],
    n + ' — authorization chunks 0 and freeze chunks 0');
  eq([r.res.writes, r.res.writer_calls], [0, 0], n + ' — zero writes');
  eq([r.res.dry_run_proof.generate_called, r.res.dry_run_proof.submit_called], [false, false],
    n + ' — no Generate and no Submit');
  eq(r.world.allWrites(), 0, n + ' — zero writes measured on every sheet');
  // AND THE META LINE SAYS SO IN THE LOG, rather than simply being absent — an operator scrolling the log
  // must be told that nothing was released, not left to notice that nothing appeared.
  var meta = (r.world.log || []).filter(function (l) {
    return String(l).indexOf('[S1] s1_manifest_p_authorization_meta ') === 0; });
  eq(meta.length, 1, n + ' — and one authorization meta line is still emitted');
  var mj = JSON.parse(String(meta[0]).replace('[S1] s1_manifest_p_authorization_meta ', ''));
  eq([mj.chunks, mj.bytes], [0, 0], n + ' — reporting chunks 0 and bytes 0');
  ok(String(mj.reason).indexOf('NO_AUTHORIZATION_WORDING_ON_A_STOP') === 0,
    n + ' — under a named reason', mj.reason);
});

// ---- Y13 — EVERY EMITTED LINE IS WITHIN THE LOGGER BOUND, INCLUDING THE NEW ONES. ---------------------
// S1-R4A's lesson, re-measured now that there are more lines: the bound belongs to the emitted LINE, and the
// authorization tag is longer than the freeze tag it was modelled on.
ok(maxLogBytes(Y9.world) <= 3000,
  'Y13 the longest line a READY run emits is within the 3000-byte bound', maxLogBytes(Y9.world));
var Y13auth = (Y9.world.log || []).filter(function (l) {
  return /^\[S1\] s1_manifest_p_authorization_\d+_of_\d+ /.test(String(l)); });
ok(Y13auth.length >= 1 && Y13auth.every(function (l) { return String(l).length <= 3000; }),
  'Y13a and every authorization segment line is too — measured on the LINE, framing included',
  Y13auth.map(function (l) { return String(l).length; }));
ok(maxLogBytes(Y7.world) <= 3000,
  'Y13b including the 118-gap-scope world, whose evidence line is the longest',
  maxLogBytes(Y7.world));
// OVER THE BOUND, NOTHING IS CUT. Measured, and the measurement corrected a wrong expectation of mine: with
// the chunk bound at zero the FREEZE bound condition fails first, so the run never reaches READY and the
// authorization is never built at all. That is the stronger outcome, not a weaker one - a deployment whose
// log cannot carry the evidence refuses, rather than emitting a partial sentence - so this asserts what
// actually happens instead of the withheld line I expected.
var Y13c = withMP(swapS1('var S1_LOG_MAX_CHUNKS_ = 12;', 'var S1_LOG_MAX_CHUNKS_ = 0;'), pos());
eq(Y13c.res.verdict, 'STOP', 'Y13c a log that cannot carry the evidence is a STOP', failed(Y13c.res));
ok(failed(Y13c.res).indexOf('the_frozen_baseline_fits_in_the_log_bound') >= 0,
  'Y13d on the log-bound condition, before any authorization is built', failed(Y13c.res));
eq([authChunks(Y13c.world), mpChunks(Y13c.world)], [0, 0],
  'Y13e with zero chunks of either kind - nothing truncated, nothing partial');
eq([Y13c.res.operator_authorization_wording, Y13c.res.frozen_before], [null, null],
  'Y13f and no sentence and no baseline survive it');
// AND THE SENTENCE GOES THROUGH THE BOUNDED CHUNKER, not a raw Logger call - which is what makes the
// bound apply to it at all. Asserted on the source, because the alternative is invisible on a short
// sentence and only appears once the wording grows.
ok(read(S1_REL).indexOf("S1_emitChunked_('s1_manifest_p_authorization',") > 0,
  'Y13g the authorization is emitted through S1_emitChunked_, so the line bound applies to it');
ok(read(S1_REL).indexOf("Logger.log('[S1] ' + tag + ' ' + payload)") > 0
  || read(S1_REL).indexOf("Logger.log('[S1] '") > 0,
  'Y13h and every line still carries the [S1] framing the budget was priced against');

// ================================================================================================================
section('Z — S1-R4D: the fault was measured and never printed, and now there is somewhere to look');
// ================================================================================================================
//
// WHAT THE LIVE RUN HANDED OVER. verdict STOP, predicates_failed 3,
// factory_id_fault_codes ["FACTORY_MOVEMENT_ID_BLANK"], movement count 96, ok id count 95. Enough to know
// that exactly one row of ninety-six has no primary key; not enough to open it.
//
// R4C measured the row number and the full-row fingerprint and put them in two places the Logger is not:
// the return value, and the `observed` field of the failing predicate. Manifest P logs a bounded summary
// rather than its whole return value - correct, the baseline would blow the bound - and the summary carried
// the code. A code says what kind of problem exists; a row number is what lets someone go and look.

function fmCensus(spec, mutate) {
  var w = S1World(spec);
  if (mutate) mutate(w);
  var res = null, threw = null;
  try { res = vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx); }
  catch (e) { threw = e; }
  return { res: res || {}, threw: threw, world: w };
}
function fmFaultLines(w) {
  return logTags(w).filter(function (n) {
    return /^s1_factory_movement_id_fault_\d+_of_\d+$/.test(n);
  }).length;
}
function mpFaultLines(w) {
  return logTags(w).filter(function (n) {
    return /^s1_manifest_p_factory_id_fault_\d+_of_\d+$/.test(n);
  }).length;
}
function logObj(w, tag) {
  var pre = '[S1] ' + tag + ' ';
  var hit = (w.log || []).filter(function (l) { return String(l).indexOf(pre) === 0; });
  return hit.length ? JSON.parse(String(hit[0]).slice(pre.length)) : null;
}
function fmFaultPayloads(w) {
  var out = [];
  (w.log || []).forEach(function (l) {
    var m = String(l).match(/^\[S1\] s1_factory_movement_id_fault_(\d+)_of_(\d+) ([\s\S]*)$/);
    if (m) out.push({ i: Number(m[1]), n: Number(m[2]), body: JSON.parse(m[3]) });
  });
  out.sort(function (a, b) { return a.i - b.i; });
  return out;
}
var MOVBASE_ = { movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 5,
  related_entity_type: 'inventory_adjustment', related_entity_id: 'ADJ-20260901-AAAA',
  created_at: '2026-09-01T00:00:00Z' };
function movrow(over) {
  var r = {};
  Object.keys(MOVBASE_).forEach(function (k) { r[k] = MOVBASE_[k]; });
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
/** Every read-only claim the census makes about itself, asserted together rather than one at a time. */
function fmZeroWrite(r, label) {
  eq([r.res.dry_run, r.res.read_only], [true, true], label + ' declares dry_run and read_only');
  eq([r.res.writes, r.res.writer_calls, r.res.submit_calls, r.res.cells_written],
    [0, 0, 0, 0], label + ' zero writes, writer calls, submits and cells written');
  eq([r.res.rows_modified, r.res.rows_added, r.res.rows_removed, r.res.rows_reordered],
    [0, 0, 0, false], label + ' no row modified, added, removed or reordered');
  eq([r.res.ids_minted, r.res.ids_backfilled], [0, 0], label + ' no id minted and none backfilled');
  eq([r.res.generate_called, r.res.submit_called, r.res.migration_called, r.res.gap_job_called,
    r.res.factory_writer_called], [false, false, false, false, false],
    label + ' no Generate, Submit, migration, Gap Job or Factory Stock writer');
  eq(r.world.allWrites(), 0, label + ' and zero writes MEASURED on every sheet in the world');
}

// ---- Z0 - THE FIXTURE'S MOVEMENT HEADER IS 21_'s, READ FROM 21_. -------------------------------------
// R4A's lesson, applied to the schema rather than to one column name: a fixture that spells a header is a
// fixture that can agree with a header production does not have. 21_ declares MOV_HEADERS as a LOCAL inside
// its handlers, so there is no module constant to import - which is why it is spelled above AND checked
// here against the shipped text. A column added to 21_ fails this assertion instead of silently leaving the
// fixture measuring a narrower table than the one an operator opens.
var Z0decl = (function () {
  var g21 = read(GS + '21_factory_inventory_handlers.gs');
  var m = g21.match(/var MOV_HEADERS = \[([\s\S]*?)\];/);
  return m ? (m[1].match(/'([a-z_]+)'/g) || []).map(function (q) { return q.slice(1, -1); }) : [];
})();
eq(Z0decl.length, 15, 'Z0 21_ declares fifteen movement columns', Z0decl);
eq(FACTORY_TABLES_['factory_stock_movements'], Z0decl,
  'Z0a and the fixture header is exactly that declaration, in that order');
eq(Z0decl[0], 'factory_stock_movement_id',
  'Z0b whose first column is the primary key this section is about');
['before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock']
  .forEach(function (c) {
    ok(FACTORY_TABLES_['factory_stock_movements'].indexOf(c) >= 0,
      'Z0c including the audit column ' + c + ', which the narrower fixture was missing');
  });

// ---- Z1 — THE ONE THE LIVE RUN HIT: A REAL BUSINESS ROW WITH NO PRIMARY KEY. ---------------------------
// Reproduced at the live shape: many good rows, exactly one without an id.
var Z1rows = [];
for (var z1 = 1; z1 <= 5; z1++) {
  Z1rows.push(movrow({ factory_stock_movement_id: 'FSMV-0000000' + z1,
    movement_date: '2026-09-0' + z1 }));
}
Z1rows.splice(2, 0, movrow({ movement_date: '2026-09-06', qty: 77 }));   // no id, sheet row 4
var Z1 = fmCensus(pos({ movements: Z1rows }));
eq(Z1.threw, null, 'Z1 the census does not throw');
eq(Z1.res.verdict, 'FAULTS_FOUND', 'Z1a a readable table with a fault is FAULTS_FOUND, not STOP',
  Z1.res.stop_reasons);
eq([Z1.res.row_count, Z1.res.non_blank_id_count, Z1.res.valid_id_count, Z1.res.blank_id_count],
  [6, 5, 5, 1], 'Z1b six records, five with a usable key, one without');
eq([Z1.res.duplicate_id_count, Z1.res.wrong_type_id_count, Z1.res.outside_named_column_row_count],
  [0, 0, 0], 'Z1c and no other class of fault is claimed');
eq(Z1.res.fault_count, 1, 'Z1d exactly one fault is located');
eq(Z1.res.fault_codes, ['FACTORY_MOVEMENT_ID_BLANK'], 'Z1e under the live code');
// ---- Z2 — AND THE ROW NUMBER IS THE SHEET ROW. -------------------------------------------------------
var Z1f = Z1.res.faults[0];
eq(Z1f.one_based_sheet_row_number, 4,
  'Z2 the fault names sheet row 4 — header is row 1, so the third data row is row 4', Z1f);
eq([Z1f.table, Z1f.sheet_name, Z1f.id_column_name],
  ['factory_stock_movements', 'factory_stock_movements', 'factory_stock_movement_id'],
  'Z2a with the table, the sheet and the id column named');
eq([Z1f.observed_id_value, Z1f.observed_id_is_blank, Z1f.observed_id_type],
  ['', true, '[object String]'], 'Z2b and the observed id value and type');
eq(Z1f.first_seen_row, null, 'Z2c first_seen_row is null on a blank — it only means something for a duplicate');
eq([Z1f.live_column_count, Z1f.named_column_count], [Z0decl.length, Z0decl.length],
  'Z2d with the live and named column counts, which are 21_\'s fifteen',
  [Z1f.live_column_count, Z1f.named_column_count]);
ok(Z1f.header_fingerprint !== null && Z1f.full_named_row_fingerprint !== null,
  'Z2e and both fingerprints', [Z1f.header_fingerprint, Z1f.full_named_row_fingerprint]);
eq(Z1f.recommended_next_action, 'PREPARE_CONTROLLED_ID_BACKFILL',
  'Z2f the recommended next action for a record that lost its key');
eq(Z1f.action_is_not_authorized_by_this_run, true,
  'Z2g stated as the NEXT decision, which this run does not take');
// ---- Z3 — THE NAMED BUSINESS FIELDS, so a person can recognise the row before opening it. -----------
eq(Z1f.row_has_business_content, true, 'Z3 the row has business content');
eq(Z1f.row_outside_named_columns, false, 'Z3a and it is inside the named schema');
var Z3names = Z1f.named_nonblank_fields.map(function (f) { return f.field; });
eq(Z3names.indexOf('factory_stock_movement_id'), -1,
  'Z3b the id column is EXCLUDED from the business fields — which is what makes'
  + ' row_has_business_content a measurement rather than a restatement of the branch');
['movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty', 'related_entity_id'].forEach(function (f) {
  ok(Z3names.indexOf(f) >= 0, 'Z3c the business field ' + f + ' is reported', Z3names);
});
eq(Z1f.named_nonblank_field_count, Z1f.named_nonblank_fields.length,
  'Z3d and the count is the length of the list it counts');
var Z3qty = Z1f.named_nonblank_fields.filter(function (f) { return f.field === 'qty'; })[0];
eq([Z3qty.value, Z3qty.type], ['77', '[object Number]'],
  'Z3e each field carries its value AND its observed type', Z3qty);
// ---- Z4 — THE FINGERPRINT IDENTIFIES CONTENT, NOT POSITION, AND MOVES WHEN CONTENT MOVES. -----------
// Stability is what makes it matchable against a frozen signature: the same row read again, or read at a
// different sheet position, must hash the same.
var Z4again = fmCensus(pos({ movements: Z1rows }));
eq(Z4again.res.faults[0].full_named_row_fingerprint, Z1f.full_named_row_fingerprint,
  'Z4 the same table read twice gives the same fingerprint');
var Z4moved = Z1rows.slice();
Z4moved.splice(Z4moved.indexOf(Z1rows[2]), 1);
Z4moved.push(Z1rows[2]);                              // same row, last position instead of third
var Z4m = fmCensus(pos({ movements: Z4moved }));
eq(Z4m.res.faults[0].full_named_row_fingerprint, Z1f.full_named_row_fingerprint,
  'Z4a and the SAME fingerprint at a different sheet row — it identifies the content');
eq(Z4m.res.faults[0].one_based_sheet_row_number, 7,
  'Z4b while the row number follows the position, which is the other half of locating it');
var Z4edit = Z1rows.map(function (r) {
  if (r.factory_stock_movement_id !== undefined) return r;
  var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; });
  c.qty = 78;                                         // one cell, one value
  return c;
});
var Z4e = fmCensus(pos({ movements: Z4edit }));
ok(Z4e.res.faults[0].full_named_row_fingerprint !== Z1f.full_named_row_fingerprint,
  'Z4c and one changed cell changes it', [Z1f.full_named_row_fingerprint,
    Z4e.res.faults[0].full_named_row_fingerprint]);
eq(Z4e.res.faults[0].header_fingerprint, Z1f.header_fingerprint,
  'Z4d while the header fingerprint is unmoved — the schema did not change');

// ---- Z5 — THE BLANK IS FOUND WHERE IT IS, NOT WHERE SORTING PUT IT. ---------------------------------
// THE DEFECT THIS SECTION EXISTS FOR. `ids` was built by mapping the id cell of every row and sorting, and
// the empty string sorts FIRST — so index 0 is where a blank lands no matter which row it came from. If the
// export took its position from that list it would say the first data row every time. Here the blank is the
// LAST record in the sheet and the surrounding ids sort around it, and the answer must still be its own row.
var Z5rows = [
  movrow({ factory_stock_movement_id: 'AAA-1' }),
  movrow({ factory_stock_movement_id: 'ZZZ-9', movement_date: '2026-09-02' }),
  movrow({ factory_stock_movement_id: 'MMM-5', movement_date: '2026-09-03' }),
  movrow({ movement_date: '2026-09-04', qty: 41 })];
var Z5 = fmCensus(pos({ movements: Z5rows }));
eq(Z5.res.faults.length, 1, 'Z5 one fault');
eq(Z5.res.faults[0].one_based_sheet_row_number, 5,
  'Z5a the blank is at sheet row 5 and is reported at row 5, not at the front of a sorted list',
  Z5.res.faults[0]);
// the same content at the FRONT of the sheet, to show the number tracks the sheet and nothing else
var Z5front = [Z5rows[3], Z5rows[0], Z5rows[1], Z5rows[2]];
var Z5f = fmCensus(pos({ movements: Z5front }));
eq(Z5f.res.faults[0].one_based_sheet_row_number, 2,
  'Z5b and the same row moved to the top is reported at row 2');
eq(Z5f.res.faults[0].full_named_row_fingerprint, Z5.res.faults[0].full_named_row_fingerprint,
  'Z5c with an identical fingerprint, so the two reports are recognisably the same row');
ok(Z5.res.faults[0].one_based_sheet_row_number !== Z5f.res.faults[0].one_based_sheet_row_number,
  'Z5d — two different sheet positions, two different answers, one content');

// ---- Z6 — A DUPLICATE NAMES BOTH ROWS. -------------------------------------------------------------
var Z6 = fmCensus(pos({ movements: [
  movrow({ factory_stock_movement_id: 'FSMV-DUP' }),
  movrow({ factory_stock_movement_id: 'FSMV-OK', movement_date: '2026-09-02' }),
  movrow({ factory_stock_movement_id: 'FSMV-DUP', movement_date: '2026-09-03', qty: 9 })] }));
eq(Z6.res.verdict, 'FAULTS_FOUND', 'Z6 a duplicated primary key is a fault');
eq([Z6.res.duplicate_id_count, Z6.res.blank_id_count], [1, 0],
  'Z6a counted as a duplicate and not as a blank');
eq([Z6.res.non_blank_id_count, Z6.res.valid_id_count], [3, 2],
  'Z6b three ids present, two of them usable — a duplicate is present without being valid');
var Z6f = Z6.res.faults[0];
eq([Z6f.one_based_sheet_row_number, Z6f.first_seen_row], [4, 2],
  'Z6c and BOTH row numbers: the collision at row 4 and the row that already held the id at row 2', Z6f);
eq([Z6f.observed_id_value, Z6f.fault_class], ['FSMV-DUP', 'DUPLICATE'],
  'Z6d naming the id that is claimed twice');
eq(Z6f.recommended_next_action, 'PREPARE_CONTROLLED_ID_DEDUPLICATION', 'Z6e with its own next action');

// ---- Z7 — A WRONG-TYPED ID. -----------------------------------------------------------------------
var Z7 = fmCensus(pos({ movements: [
  movrow({ factory_stock_movement_id: 'FSMV-OK' }),
  movrow({ factory_stock_movement_id: 20260904, movement_date: '2026-09-04' })] }));
eq(Z7.res.verdict, 'FAULTS_FOUND', 'Z7 a coerced number where a string key belongs is a fault');
eq([Z7.res.wrong_type_id_count, Z7.res.blank_id_count, Z7.res.duplicate_id_count], [1, 0, 0],
  'Z7a counted as a wrong TYPE and nothing else');
eq([Z7.res.faults[0].observed_id_type, Z7.res.faults[0].observed_id_value],
  ['[object Number]', '20260904'],
  'Z7b with the type that was actually observed beside the value that prints like a string');
eq(Z7.res.faults[0].one_based_sheet_row_number, 3, 'Z7c at its sheet row');
eq(Z7.res.faults[0].recommended_next_action, 'PREPARE_CONTROLLED_ID_TYPE_NORMALIZATION',
  'Z7d with its own next action');

// ---- Z8 — A STRAY CELL OUTSIDE THE NAMED COLUMNS IS NOT A MISSING KEY. -----------------------------
// §3 B. The remedy is to look at that cell, not to invent an id for a row that is not a record.
var Z8 = fmCensus(pos({ movements: [movrow({ factory_stock_movement_id: 'FSMV-OK' })] }),
  function (w) {
    var sh = w.sheets['factory_stock_movements'];
    sh.rows.forEach(function (r) { r.splice(4, 0, ''); });      // an UNLABELLED column, in the middle
    var stray = sh.rows[0].map(function () { return ''; });
    stray[4] = 'someone typed a note here';
    sh.rows.push(stray);
  });
eq(Z8.res.verdict, 'FAULTS_FOUND', 'Z8 a stray row is a fault', Z8.res.stop_reasons);
eq([Z8.res.outside_named_column_row_count, Z8.res.blank_id_count], [1, 0],
  'Z8a counted as OUTSIDE the named columns and NOT as a record missing its id');
eq(Z8.res.fault_codes, ['FACTORY_MOVEMENT_ROW_OUTSIDE_NAMED_COLUMNS'], 'Z8b under its own code');
var Z8f = Z8.res.faults[0];
eq([Z8f.row_outside_named_columns, Z8f.row_has_business_content], [true, false],
  'Z8c with no business content — which is exactly what distinguishes it from Z1');
eq(Z8f.named_nonblank_field_count, 0, 'Z8d and no named field to report');
eq(Z8f.recommended_next_action, 'REVIEW_UNNAMED_CELL',
  'Z8e so the recommendation is to look at the cell, not to backfill an id');
eq([Z8.res.live_column_count, Z8.res.named_column_count], [Z0decl.length + 1, Z0decl.length],
  'Z8f the live column count includes the unlabelled column and the named count does not',
  [Z8.res.live_column_count, Z8.res.named_column_count]);

// ---- Z9 — A FULLY BLANK TRAILING ROW IS NOT A RECORD AND NOT A FAULT. ------------------------------
// §3 C. A spreadsheet artifact must not be reported as data damage, or every sheet with a spare row refuses.
var Z9 = fmCensus(pos({ movements: [
  movrow({ factory_stock_movement_id: 'FSMV-1' }),
  movrow({ factory_stock_movement_id: 'FSMV-2', movement_date: '2026-09-02' })] }),
  function (w) {
    var sh = w.sheets['factory_stock_movements'];
    sh.rows.push(sh.rows[0].map(function () { return ''; }));
    sh.rows.push(sh.rows[0].map(function () { return ''; }));
  });
eq(Z9.res.verdict, 'CLEAN', 'Z9 two trailing blank rows leave the table CLEAN', Z9.res.faults);
eq([Z9.res.row_count, Z9.res.non_blank_id_count, Z9.res.valid_id_count], [2, 2, 2],
  'Z9a they are not counted in row_count');
eq([Z9.res.blank_id_count, Z9.res.outside_named_column_row_count], [0, 0],
  'Z9b and they are not a blank id and not a stray row either');
eq(Z9.res.fault_count, 0, 'Z9c no fault');
eq(fmFaultLines(Z9.world), 0, 'Z9d and no fault line is emitted');
ok(String(Z9.res.row_counting_rule).indexOf('not a record') > 0,
  'Z9e with the counting rule stated in the output rather than left implicit',
  Z9.res.row_counting_rule);
// AND THE ARITHMETIC CLOSES IN EVERY ONE OF THESE WORLDS.
[['Z9f clean', Z9], ['Z9g blank id', Z1], ['Z9h duplicate', Z6], ['Z9i wrong type', Z7],
  ['Z9j stray', Z8]].forEach(function (p) {
  var r = p[1].res;
  eq(r.row_count, r.non_blank_id_count + r.blank_id_count + r.outside_named_column_row_count,
    p[0] + ': row_count is the non-blank ids plus the blanks plus the stray rows');
  eq(r.valid_id_count, r.non_blank_id_count - r.duplicate_id_count - r.wrong_type_id_count,
    p[0] + ': valid ids are the non-blank ones minus the duplicated and the wrong-typed');
  eq(r.failed_predicates, [], p[0] + ': no condition failed', r.failed_predicates);
});

// ---- Z10 — THE CENSUS STOPS RATHER THAN REPORTING AN UNREADABLE TABLE AS CLEAN. --------------------
// 'I could not look' and 'I looked and it was clean' are different answers, and only one of them is safe.
var Z10a = fmCensus(pos({ movements: null }));
eq(Z10a.res.verdict, 'STOP', 'Z10 an absent sheet is a STOP, never CLEAN');
eq(Z10a.res.stop_reasons, ['SHEET_ABSENT'], 'Z10a under a named reason');
eq([Z10a.res.row_count, Z10a.res.valid_id_count, Z10a.res.blank_id_count],
  [null, null, null], 'Z10b with NULL counts — absent is not zero');
eq(Z10a.res.fault_count, 0, 'Z10c and no fault is claimed about a table nobody read');
var Z10b = fmCensus(pos(), function (w) {
  w.sheets['factory_stock_movements'].rows[0][0] = 'renamed_id_column';
});
eq(Z10b.res.verdict, 'STOP', 'Z10d a renamed id column is a STOP');
eq(Z10b.res.stop_reasons, ['ID_COLUMN_UNRESOLVED'], 'Z10e under its own reason');
eq(Z10b.res.faults, [], 'Z10f with nothing classified, because nothing could be');
var Z10c = fmCensus(pos(), function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[0] = sh.rows[0].map(function () { return ''; });        // the header row, erased
});
eq(Z10c.res.verdict, 'STOP', 'Z10g an unreadable header row is a STOP');
ok(Z10c.res.stop_reasons.length >= 1, 'Z10h with a named reason', Z10c.res.stop_reasons);
[['Z10i absent', Z10a], ['Z10j renamed id column', Z10b], ['Z10k erased header', Z10c]]
  .forEach(function (p) {
    eq(p[1].res.fault_lines_emitted, 0, p[0] + ': no fault line, because nothing was located');
    fmZeroWrite(p[1], p[0] + ':');
  });

// ---- Z11 — MANIFEST P STILL REFUSES, AND NOW SAYS WHERE. -------------------------------------------
// The live shape: the manifest must STOP and hand over nothing signable, and it must still print the row.
var Z11spec = pos({ movements: [
  movrow({ factory_stock_movement_id: 'FSMV-1' }),
  movrow({ movement_date: '2026-09-02', qty: 12 }),
  movrow({ factory_stock_movement_id: 'FSMV-3', movement_date: '2026-09-03' })] });
var Z11 = manifestP(Z11spec);
eq(Z11.res.verdict, 'STOP', 'Z11 the manifest refuses', failed(Z11.res));
eq(Z11.res.factory_id_fault_codes, ['FACTORY_MOVEMENT_ID_BLANK'], 'Z11a with the code, as before');
// ---- and now with the rows, which is what R4C measured and never printed ----
eq(mpFaultLines(Z11.world), 1, 'Z11b one s1_manifest_p_factory_id_fault_<i>_of_<n> line is emitted',
  logTags(Z11.world));
eq(Z11.res.factory_id_fault_chunks, 1, 'Z11c and the returned count is the number emitted');
var Z11line = (Z11.world.log || []).filter(function (l) {
  return String(l).indexOf('[S1] s1_manifest_p_factory_id_fault_1_of_1 ') === 0; });
eq(Z11line.length, 1, 'Z11d numbered by fault count');
var Z11f = JSON.parse(String(Z11line[0]).replace('[S1] s1_manifest_p_factory_id_fault_1_of_1 ', ''));
eq(Z11f.one_based_sheet_row_number, 3, 'Z11e THE ROW NUMBER IS IN THE LOG', Z11f);
ok(Z11f.full_named_row_fingerprint !== null, 'Z11f and the full-row fingerprint',
  Z11f.full_named_row_fingerprint);
eq([Z11f.fault_code, Z11f.id_column_name, Z11f.observed_id_is_blank],
  ['FACTORY_MOVEMENT_ID_BLANK', 'factory_stock_movement_id', true],
  'Z11g with the code, the id column and the observed state');
eq(Z11f.recommended_next_action, 'PREPARE_CONTROLLED_ID_BACKFILL', 'Z11h and the next action');
ok(Z11f.named_nonblank_fields.length >= 3, 'Z11i and the named business fields',
  Z11f.named_nonblank_fields.map(function (f) { return f.field; }));
eq(Z11f.authoritative_id_contract.blank_permitted, false,
  'Z11j carrying the contract that makes a blank a fault rather than a style');
var Z11meta = logObj(Z11.world, 's1_manifest_p_factory_id_fault_meta');
eq([Z11meta.fault_count, Z11meta.lines_emitted, Z11meta.lines_withheld], [1, 1, 0],
  'Z11k with a meta line stating the fault count and how many lines were emitted');
eq(Z11meta.rows, [3], 'Z11l and the row numbers at a glance');
eq(Z11meta.recommended_next_actions, ['PREPARE_CONTROLLED_ID_BACKFILL'], 'Z11m and the next actions');
// ---- AND STILL NOTHING SIGNABLE. A STOP owes the operator the fault and owes them no authorization. ----
eq([Z11.res.frozen_before, Z11.res.freeze_paste_block, Z11.res.operator_authorization_wording],
  [null, null, null], 'Z11n no baseline, no paste block, no wording');
eq([mpChunks(Z11.world), authChunks(Z11.world)], [0, 0],
  'Z11o freeze chunks 0 and authorization chunks 0');
eq([Z11.res.writes, Z11.res.writer_calls, Z11.res.submit_calls], [0, 0, 0], 'Z11p zero writes');
eq([Z11.res.dry_run_proof.generate_called, Z11.res.dry_run_proof.submit_called,
  Z11.res.dry_run_proof.migration_called, Z11.res.dry_run_proof.gap_job_called],
  [false, false, false, false], 'Z11q no Generate, Submit, migration or Gap Job');
eq(Z11.world.allWrites(), 0, 'Z11r measured on every sheet');
ok(maxLogBytes(Z11.world) <= 3000, 'Z11s and every emitted line is within the byte bound',
  maxLogBytes(Z11.world));
// A CLEAN WORLD STILL GETS THE META LINE, because an absent line is not an answer.
var Z11clean = manifestP(pos());
eq(Z11clean.res.verdict, 'READY_TO_AUTHORIZE', 'Z11t a clean world is unaffected', failed(Z11clean.res));
eq(mpFaultLines(Z11clean.world), 0, 'Z11u with no fault line');
var Z11cm = logObj(Z11clean.world, 's1_manifest_p_factory_id_fault_meta');
eq([Z11cm.fault_count, Z11cm.lines_emitted], [0, 0], 'Z11v but the meta line is still emitted, saying zero');

// ---- Z12 — ONE HELPER, TWO CALLERS, THE SAME ANSWER. ----------------------------------------------
// §2.3. A second id classifier would be a second opinion, and the first thing two opinions do is disagree
// about a row nobody can then classify. Asserted on the RESULTS, and on the source that produces them.
var Z12c = fmCensus(Z11spec);
eq(Z12c.res.verdict, 'FAULTS_FOUND', 'Z12 the standalone census finds the same world faulty');
eq(Z12c.res.faults.length, Z11.res.factory_id_fault_rows.length,
  'Z12a with the same number of located faults');
var Z12keys = ['table', 'sheet_name', 'fault_code', 'fault_class', 'one_based_sheet_row_number',
  'id_column_name', 'observed_id_value', 'observed_id_is_blank', 'observed_id_type', 'first_seen_row',
  'full_named_row_fingerprint', 'live_column_count', 'named_column_count', 'header_fingerprint',
  'named_nonblank_field_count', 'row_has_business_content', 'row_outside_named_columns',
  'recommended_next_action'];
Z12keys.forEach(function (k) {
  eq(Z12c.res.faults[0][k], Z11.res.factory_id_fault_rows[0][k],
    'Z12b the two callers agree on ' + k, [Z12c.res.faults[0][k], Z11.res.factory_id_fault_rows[0][k]]);
});
eq(JSON.stringify(Z12c.res.faults[0].named_nonblank_fields),
  JSON.stringify(Z11.res.factory_id_fault_rows[0].named_nonblank_fields),
  'Z12c and on the named business fields, field for field');
// ---- and structurally: the census judges nothing of its own ----
var Z12src = extractFn(S1, 'RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS');
ok(Z12src.length > 0, 'Z12d the census function is extractable from the shipped source');
eq((Z12src.match(/S1_idIntegrity_\(/g) || []).length, 1,
  'Z12e it calls the shared id integrity authority exactly once');
eq((Z12src.match(/S1_fullRowTable_\(/g) || []).length, 1,
  'Z12f and reads exactly one table, through the shared full-row reader');
eq((Z12src.match(/S1_idFaultRows_\(/g) || []).length, 1,
  'Z12g and locates through the shared exporter');
['blank_id_count++', 'duplicate_id_count++', 'wrong_type_id_count++', 'outside_named_columns_count++']
  .forEach(function (frag) {
    eq(Z12src.indexOf(frag), -1,
      'Z12h it does NOT re-implement the ' + frag.replace('++', '') + ' judgement');
  });
['FSMV-', 'Utilities.getUuid', 'setValue', 'appendRow', 'fcWriteAppend', 'getRange']
  .forEach(function (frag) {
    eq(Z12src.indexOf(frag), -1, 'Z12i and contains no ' + frag + ' — it cannot write or mint');
  });
['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'inventory_replenishment_gap',
  'factory_stock_override_audit'].forEach(function (tbl) {
    eq(Z12src.indexOf(tbl), -1, 'Z12j and never names ' + tbl + ' — one table, as declared');
  });
ok(Z12src.indexOf('S1_FACTORY_MOVEMENT_TABLE_') > 0,
  'Z12k the one table it does read comes from the single spelling');
// AND THE THREE PLACES THAT SPELL THAT TABLE AGREE.
var Z12w = S1World(pos());
eq(vm.runInContext('S1_FACTORY_MOVEMENT_TABLE_', Z12w.ctx), 'factory_stock_movements',
  'Z12l the constant is the live sheet name');
eq(vm.runInContext('S1_FACTORY_ID_AUTHORITY_[S1_FACTORY_MOVEMENT_TABLE_].column', Z12w.ctx),
  'factory_stock_movement_id', 'Z12m the id authority is keyed by it');
eq(vm.runInContext('S1_factorySurfaceSpecs_()[0].table', Z12w.ctx), 'factory_stock_movements',
  'Z12n and the surface spec uses it too');

// ---- Z13 — ZERO WRITES, ON EVERY WORLD IN THIS SECTION. -------------------------------------------
[['Z13a clean', Z9], ['Z13b blank id', Z1], ['Z13c duplicate', Z6], ['Z13d wrong type', Z7],
  ['Z13e stray', Z8], ['Z13f sorted-position', Z5], ['Z13g moved row', Z4m],
  ['Z13h same world as the manifest', Z12c]].forEach(function (p) {
  fmZeroWrite(p[1], p[0] + ':');
});
// AND THE CENSUS NEVER PRINTS THE CLEAN ROWS. §2.8 — a summary plus the fault rows, and nothing else.
var Z13big = [];
for (var z13 = 1; z13 <= 96; z13++) {
  Z13big.push(movrow({ factory_stock_movement_id: 'FSMV-' + (10000000 + z13),
    movement_date: '2026-09-01', related_entity_id: 'ADJ-2026090' + (z13 % 10) + '-XXXX' }));
}
Z13big[42] = movrow({ movement_date: '2026-09-01', qty: 33 });          // the live shape: 96 rows, one blank
var Z13 = fmCensus(pos({ movements: Z13big }));
eq(Z13.res.verdict, 'FAULTS_FOUND', 'Z13i ninety-six rows, one without a key', Z13.res.stop_reasons);
eq([Z13.res.row_count, Z13.res.non_blank_id_count, Z13.res.blank_id_count], [96, 95, 1],
  'Z13j 96 / 95 / 1 — the live numbers');
eq(Z13.res.faults[0].one_based_sheet_row_number, 44,
  'Z13k and the one thing the live run could not say: which row', Z13.res.faults[0]);
eq(fmFaultLines(Z13.world), 1, 'Z13l exactly ONE fault line for ninety-six rows');
eq((Z13.world.log || []).length, 4,
  'Z13m four log lines in total: summary, fault, fault meta, verdict', logTags(Z13.world));
ok(maxLogBytes(Z13.world) <= 3000, 'Z13n every line within the byte bound', maxLogBytes(Z13.world));
var Z13sum = logObj(Z13.world, 's1_factory_movement_id_census_summary');
eq([Z13sum.row_count, Z13sum.non_blank_id_count, Z13sum.blank_id_count], [96, 95, 1],
  'Z13o the summary carries the counts');
ok(JSON.stringify(Z13sum).indexOf('FSMV-10000001') === -1,
  'Z13p and NOT the ninety-five clean rows — a summary, not a dump');
ok(String((Z13.world.log || []).join('|')).indexOf('FSMV-10000001') === -1,
  'Z13q nor does any other emitted line carry them');
fmZeroWrite(Z13, 'Z13r:');

// ---- Z14 — MANY FAULTS ARE BOUNDED AND SAID SO, NEVER TRUNCATED. ---------------------------------
var Z14rows = [];
for (var z14 = 1; z14 <= 20; z14++) {
  Z14rows.push(movrow({ movement_date: '2026-09-01', qty: z14 }));      // twenty rows, none with an id
}
var Z14 = fmCensus(pos({ movements: Z14rows }));
eq(Z14.res.fault_count, 20, 'Z14 twenty faults are all located in the return value');
eq(Z14.res.fault_lines_emitted, 12, 'Z14a twelve lines are emitted — the standing chunk bound');
eq(fmFaultLines(Z14.world), 12, 'Z14b measured on the log');
var Z14p = fmFaultPayloads(Z14.world);
eq(Z14p[0].n, 20, 'Z14c numbered _1_of_20, so the numbering itself says how many exist');
eq(Z14p.map(function (x) { return x.body.one_based_sheet_row_number; }),
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  'Z14d in sheet row order, so a reader walks the sheet top-down');
var Z14meta = logObj(Z14.world, 's1_factory_movement_id_fault_meta');
eq([Z14meta.fault_count, Z14meta.lines_emitted, Z14meta.lines_withheld], [20, 12, 8],
  'Z14e and the meta line says how many were withheld rather than leaving them to be missed');
ok(maxLogBytes(Z14.world) <= 3000, 'Z14f with every line inside the bound', maxLogBytes(Z14.world));
fmZeroWrite(Z14, 'Z14g:');

// ---- Z15 - A FAULT TOO WIDE FOR ONE LINE KEEPS WHAT LOCATES IT, AND SAYS WHAT IT DROPPED. ------------
//
// MEASURED, NOT HYPOTHETICAL. On 21_'s fifteen columns the complete fault payload is about 2.7KB against a
// budget just under 3KB - so the margin is one wide column, and a live table that has grown a few would
// cross it. Every field value is already capped at 80 characters, so the growth that matters is COLUMN
// COUNT rather than value length.
//
// Over the line budget the payload keeps every field that LOCATES the row - table, sheet, row number, id
// column, observed value and type, both fingerprints - and drops the wide ones under a named reason. Never
// a value cut in the middle, and never a line that looks complete when it is not.
var Z15 = fmCensus(pos({ movements: [movrow({ factory_stock_movement_id: 'FSMV-1' })] }),
  function (w) {
    var sh = w.sheets['factory_stock_movements'];
    var extra = [];
    for (var k = 1; k <= 30; k++) { extra.push('extended_attribute_column_number_' + k); }
    sh.rows[0] = sh.rows[0].concat(extra);
    sh.rows[1] = sh.rows[1].concat(extra.map(function () { return 'a value that is long enough to matter'; }));
    var noid = sh.rows[1].slice();
    noid[0] = '';                                    // the same wide row, with its primary key removed
    sh.rows.push(noid);
  });
eq(Z15.res.verdict, 'FAULTS_FOUND', 'Z15 a wide table with a blank id is still FAULTS_FOUND',
  Z15.res.stop_reasons);
eq(Z15.res.named_column_count, Z0decl.length + 30, 'Z15a on forty-five named columns',
  Z15.res.named_column_count);
// The RETURN VALUE is never trimmed: it carries the whole fault, including the fields the line could not.
var Z15f = Z15.res.faults[0];
eq(Z15f.one_based_sheet_row_number, 3, 'Z15b the return value locates the row');
// Derived from the fixture row rather than from the column count: MOVBASE_ populates eight of 21_'s
// fourteen non-key columns, and the four before/after stock columns plus note and created_by stay blank -
// which is correct, because a blank cell is not a business field.
eq(Z15f.named_nonblank_field_count, Object.keys(MOVBASE_).length + 30,
  'Z15c and carries every POPULATED named business field, blanks excluded',
  [Z15f.named_nonblank_field_count, Object.keys(MOVBASE_).length]);
ok(JSON.stringify(Z15f).length > 3000,
  'Z15d which is more than a single log line can hold', JSON.stringify(Z15f).length);
// The LINE keeps what locates the row and says what it dropped.
var Z15p = fmFaultPayloads(Z15.world);
eq(Z15p.length, 1, 'Z15e one fault line is still emitted');
var Z15b = Z15p[0].body;
eq(Z15b.one_based_sheet_row_number, 3, 'Z15f THE ROW NUMBER SURVIVES the narrowing', Z15b);
eq([Z15b.table, Z15b.sheet_name, Z15b.fault_code, Z15b.id_column_name],
  ['factory_stock_movements', 'factory_stock_movements', 'FACTORY_MOVEMENT_ID_BLANK',
    'factory_stock_movement_id'], 'Z15g and so do the table, the code and the id column');
eq(Z15b.full_named_row_fingerprint, Z15f.full_named_row_fingerprint,
  'Z15h and the full-row fingerprint, so the line is still matchable against the baseline');
eq([Z15b.observed_id_is_blank, Z15b.observed_id_type], [true, '[object String]'],
  'Z15i and the observed id state');
eq(Z15b.recommended_next_action, 'PREPARE_CONTROLLED_ID_BACKFILL', 'Z15j and the next action');
eq(Z15b.detail_withheld, ['named_nonblank_fields', 'authoritative_id_contract'],
  'Z15k with the dropped fields NAMED rather than silently missing');
ok(String(Z15b.detail_withheld_reason).indexOf('over the') > 0
  && String(Z15b.detail_withheld_reason).indexOf('return value') > 0,
  'Z15l and a reason that says why and where the rest is', Z15b.detail_withheld_reason);
eq(Z15b.named_nonblank_fields, undefined,
  'Z15m the wide field is absent from the line, not truncated inside it');
ok(maxLogBytes(Z15.world) <= 3000,
  'Z15n and every emitted line is inside the byte bound', maxLogBytes(Z15.world));
fmZeroWrite(Z15, 'Z15o:');

// ================================================================================================================
section('AA — S1-R4E: the legacy row, the whole column contract, and a repair that is one cell or nothing');
// ================================================================================================================
//
// R4D located the row. This asks whether it can be repaired, and the answer for the LIVE row is no - not
// because a repair is risky but for three measured reasons: it is missing TWO required fields rather than
// one, the second of them (movement_type) is the ledger AXIS SELECTOR, and its own quantities do not
// reconcile under either axis. Writing only the primary key would leave the row unclassifiable while
// SILENCING the census that currently refuses it.
//
// The machinery is built and tested anyway, on a synthetic row where the key genuinely is the only thing
// missing - so the execute path exists, is proven, and is unreachable for the live row by construction.

// ---- the LIVE row 2, at the frozen live shape: six non-blank named fields, nine blank. ----
var AAlive2 = { sku: SKU, warehouse_id: WHF, qty: 12000,
  before_current_stock: 1000, after_current_stock: 12000, created_at: '2026-06-12' };
// ---- a row where the PRIMARY KEY genuinely is the only thing missing. ----
function aaIdOnly(over) {
  var r = { movement_date: '2026-07-01', sku: SKU, warehouse_id: WHF,
    movement_type: 'manual_adjustment', qty: 500,
    related_entity_type: 'inventory_adjustment', related_entity_id: 'ADJ-20260701-AB12',
    before_current_stock: 1000, after_current_stock: 1500,
    before_reserved_stock: 100, after_reserved_stock: 100,
    note: 'stock count correction', created_by: 'operation-system',
    created_at: '2026-07-01T03:00:00Z' };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
function aaGood(n) {
  return aaIdOnly({ factory_stock_movement_id: 'FSMV-' + ('0000000' + (n * 7919).toString(16).toUpperCase()).slice(-8),
    qty: 10 + n, before_current_stock: 100, after_current_stock: 110 + n });
}
function aaRows(first, count) {
  var rows = [first];
  for (var i = 1; i <= (count === undefined ? 95 : count); i++) rows.push(aaGood(i));
  return rows;
}
function aaWorld(rows, mutate, extra) {
  var sp = {};
  Object.keys(pos()).forEach(function (k) { sp[k] = pos()[k]; });
  sp.movements = rows;
  Object.keys(extra || {}).forEach(function (k) { sp[k] = extra[k]; });
  var w = S1World(sp);
  if (mutate) mutate(w);
  return w;
}
function aaMan(w) {
  return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL_MANIFEST()', w.ctx);
}
function aaFill(w, arg) {
  vm.runInContext('var __AA_ARG = ' + JSON.stringify(arg || {}) + ';', w.ctx);
  return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL(__AA_ARG)', w.ctx);
}
/** Every refusal owes the same things: no write anywhere, nothing minted, no other table touched. */
function aaNoWrite(r, w, label) {
  eq([r.writes, r.cells_written, r.ids_minted], [0, 0, 0],
    label + ' zero writes, zero cells, zero ids minted');
  eq(w.allWrites(), 0, label + ' and zero writes MEASURED on every sheet in the world');
  eq(w.writesByTable(), {}, label + ' with no table written at all');
  eq([r.generate_called, r.submit_called, r.migration_called, r.gap_job_called,
    r.factory_writer_called], [false, false, false, false, false],
    label + ' no Generate, Submit, migration, Gap Job or Factory Stock writer');
}

// ---- AA1 — THE LIVE ROW. TWO REQUIRED FIELDS MISSING, NOT ONE. --------------------------------------
var AA1w = aaWorld(aaRows(AAlive2));
var AA1 = aaMan(AA1w);
eq(AA1.verdict, 'LEGACY_ROW_CLASSIFICATION_REQUIRED',
  'AA1 the live row cannot be repaired by writing one cell', AA1.classification_reasons);
eq([AA1.row_count, AA1.non_blank_id_count, AA1.valid_id_count, AA1.blank_id_count],
  [96, 95, 95, 1], 'AA1a at the frozen live counts: 96 / 95 / 95 / 1');
eq([AA1.live_column_count, AA1.named_column_count], [15, 15], 'AA1b on fifteen live columns');
eq(AA1.header_fingerprint, 'FDC8D1DB',
  'AA1c and the live header fingerprint the operator froze', AA1.header_fingerprint);
eq(AA1.target.one_based_sheet_row_number, 2, 'AA1d the target is sheet row 2');
eq(AA1.target.named_nonblank_field_count, 6,
  'AA1e with six non-blank named fields, exactly as measured live');
// THE DECISIVE FACT: the primary key is not the only required field missing.
eq(AA1.target.field_audit.required_blank, ['factory_stock_movement_id', 'movement_type'],
  'AA1f TWO required fields are blank, and the second is movement_type');
ok(AA1.classification_reasons.indexOf('REQUIRED_FIELD_IS_BLANK:movement_type') >= 0,
  'AA1g named as a required-field refusal', AA1.classification_reasons);
ok(AA1.classification_reasons.indexOf('MOVEMENT_TYPE_IS_BLANK_SO_THE_ROW_HAS_NO_LEDGER_AXIS') >= 0,
  'AA1h and separately as the loss of the LEDGER AXIS, which is what movement_type decides');
eq(AA1.target.axis_audit.axis, 'UNKNOWN_BECAUSE_MOVEMENT_TYPE_IS_BLANK',
  'AA1i so the row belongs to neither the current nor the reserved axis');
// AND ITS OWN NUMBERS DO NOT RECONCILE UNDER THE ONLY AXIS THAT COULD BE EVALUATED.
eq([AA1.target.axis_audit.readings.if_current_axis.expected_qty,
  AA1.target.axis_audit.readings.if_current_axis.observed_qty,
  AA1.target.axis_audit.readings.if_current_axis.agrees], [11000, 12000, false],
  'AA1j read as a current-axis move, qty should be 12000-1000 = 11000 and it is 12000');
eq(AA1.target.axis_audit.readings.if_reserved_axis, null,
  'AA1k and the reserved reading cannot be evaluated at all, both reserved columns being blank');
eq(AA1.target.field_audit.writer_populated_blank,
  ['movement_date', 'related_entity_type', 'related_entity_id', 'before_reserved_stock',
    'after_reserved_stock', 'note', 'created_by'],
  'AA1l plus seven fields every shipped writer populates — so no current writer produced this row');
// NOTHING IS PROPOSED, FROZEN OR SIGNED. The execute path has nothing to consume.
eq([AA1.proposed, AA1.frozen_before, AA1.authorization_wording, AA1.expected_after],
  [null, null, null, null],
  'AA1m no id is proposed, no baseline frozen, no sentence written, no AFTER stated');
ok(String(AA1.next_decision).indexOf('data governance') > 0
  && String(AA1.next_decision).indexOf('SILENCING') > 0,
  'AA1n and the next decision names the governance question and the silencing hazard',
  AA1.next_decision);
aaNoWrite(AA1, AA1w, 'AA1o');
// AND THE BACKFILL CANNOT BE RUN FROM IT.
var AA1f = aaFill(AA1w, { execute: true, frozen: AA1.frozen_before,
  authorization: AA1.authorization_wording });
eq(AA1f.verdict, 'REFUSED', 'AA1p the backfill refuses with no frozen baseline to consume');
ok(String(AA1f.refusal_reasons[0]).indexOf('NO_FROZEN_BASELINE') === 0,
  'AA1q under that named reason', AA1f.refusal_reasons);
aaNoWrite(AA1f, AA1w, 'AA1r');

// ---- AA2 — THE ID-ONLY ROW: MANIFEST, DRY RUN, EXECUTE, RETRY. -------------------------------------
var AA2w = aaWorld(aaRows(aaIdOnly({})));
var AA2 = aaMan(AA2w);
eq(AA2.verdict, 'READY_TO_AUTHORIZE_BACKFILL',
  'AA2 a row missing only its primary key is repairable', AA2.classification_reasons);
eq(AA2.classification, 'ID_ONLY_MISSING', 'AA2a classified ID_ONLY_MISSING');
eq(AA2.classification_reasons, [], 'AA2b with no refusal reason');
eq(AA2.target.field_audit.required_blank, ['factory_stock_movement_id'],
  'AA2c the primary key is the ONLY required field blank');
eq(AA2.target.field_audit.writer_populated_blank, [],
  'AA2d and no writer-populated field is blank either');
eq([AA2.target.axis_audit.axis, AA2.target.axis_audit.invariant_holds], ['CURRENT', true],
  'AA2e its ledger axis is known and its own numbers reconcile');
// §3 THE PROPOSED KEY.
ok(/^FSMV-[0-9A-F]{8}$/.test(AA2.proposed.proposed_id),
  'AA2f the proposed id is FSMV- plus eight uppercase hex', AA2.proposed.proposed_id);
eq(AA2.proposed.deterministic, true, 'AA2g and it is deterministic');
ok(String(AA2.proposed.derivation_authority).indexOf('KMFSG.fnv1a') === 0,
  'AA2h derived through the same hash authority 71_ uses for its FSOA- ids',
  AA2.proposed.derivation_authority);
ok(String(AA2.proposed.derivation_authority).indexOf('getUuid') > 0,
  'AA2i and it says why NOT Utilities.getUuid: a backfill must be retry-stable');
eq(AA2.proposed.natural_key,
  'FSMV|factory_stock_movements|row=2|fp=' + AA2.frozen_before.target_row_fingerprint,
  'AA2j the natural key binds the id to the exact row state that was measured');
// The FORMAT authority is 21_'s, checked against 21_'s own text rather than asserted.
ok(G21V.indexOf("'FSMV-' + Utilities.getUuid()") > 0,
  'AA2k 21_ does mint FSMV- ids, which is the format this aligns to');
ok(G71.indexOf("'FSOA-' + KMFSG.fnv1a(") > 0,
  'AA2l and 71_ does mint a deterministic id from a natural key through KMFSG.fnv1a — shipped precedent');
// §10 THE FROZEN BEFORE AND THE EXACT AFTER.
var AAfz = AA2.frozen_before;
eq(AAfz.target_row_number, 2, 'AA2m the freeze names the row');
eq(AAfz.target_id_column_index_1based, 1, 'AA2n and the column index');
eq(AAfz.target_row_cells.length, 15, 'AA2o with all fifteen BEFORE cell values, canonically');
ok(AAfz.expected_after_row_fingerprint !== AAfz.target_row_fingerprint,
  'AA2p the expected AFTER row fingerprint differs from the BEFORE one',
  [AAfz.target_row_fingerprint, AAfz.expected_after_row_fingerprint]);
eq(AAfz.expected_after.other_columns_unchanged, 14,
  'AA2q and fourteen other columns must be byte-for-byte identical');
eq([AAfz.expected_after.blank_id_count, AAfz.expected_after.valid_id_count,
  AAfz.expected_after.duplicate_id_count, AAfz.expected_after.wrong_type_id_count],
  [0, 96, 0, 0], 'AA2r the AFTER is 96 valid, 0 blank, 0 duplicated, 0 wrong-typed');
eq(AAfz.expected_after.table_combined_fingerprint_changes, true,
  'AA2s and the TABLE fingerprint is expected to CHANGE — one cell changed, so equality would be wrong');
eq(AA2.wording_audit.missing, [], 'AA2t the authorization names every fact a person must check',
  AA2.wording_audit.missing);
ok(AA2.wording_audit.required_item_count >= 20,
  'AA2u and there are enough of them to mean something', AA2.wording_audit.required_item_count);
eq((String(AA2.authorization_wording).match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []), [],
  'AA2v with no placeholder in it');
aaNoWrite(AA2, AA2w, 'AA2w');
// §DEFAULT — execute:false.
var AA2dry = aaFill(AA2w, { frozen: AAfz, authorization: AA2.authorization_wording });
eq(AA2dry.verdict, 'DRY_RUN_OK', 'AA2x the default is a DRY RUN and every check passes',
  AA2dry.failed_predicates);
eq([AA2dry.execute_requested, AA2dry.dry_run], [false, true], 'AA2y reported as such');
aaNoWrite(AA2dry, AA2w, 'AA2z');
// EXECUTE — one cell.
var AA2ex = aaFill(AA2w, { execute: true, frozen: AAfz, authorization: AA2.authorization_wording });
eq(AA2ex.verdict, 'EXECUTED_OK', 'AA3 the execute path writes and the readback confirms it',
  [AA2ex.failed_predicates, AA2ex.refusal_reasons]);
eq([AA2ex.writes, AA2ex.cells_written], [1, 1], 'AA3a exactly one cell was written');
eq(AA2w.allWrites(), 1, 'AA3b measured on the sheets: one write in the whole world');
eq(AA2w.writesByTable(), { factory_stock_movements: 1 },
  'AA3c and it landed on the movement table and no other');
eq([AA2ex.readback.ok, AA2ex.readback.columns_compared, AA2ex.readback.columns_identical],
  [true, 14, 14], 'AA3d with all fourteen other columns byte-for-byte identical');
eq(AA2ex.readback.mismatches, [], 'AA3e and nothing mismatched');
eq(AA2ex.readback.measured.target_row_id, AAfz.proposed_id,
  'AA3f the cell now holds the frozen id');
eq(AA2ex.readback.measured.target_row_fingerprint, AAfz.expected_after_row_fingerprint,
  'AA3g and the row hashes to the FROZEN expected AFTER — an expectation it did not compute itself');
eq([AA2ex.rows_added, AA2ex.rows_removed, AA2ex.rows_reordered], [0, 0, false],
  'AA3h no row was added, removed or reordered');
eq([AA2ex.ids_minted, AA2ex.rollback], [0, null],
  'AA3i the tool minted nothing of its own and had nothing to roll back');
// §3 RETRY.
var AA2re = aaFill(AA2w, { execute: true, frozen: AAfz, authorization: AA2.authorization_wording });
eq(AA2re.verdict, 'ALREADY_APPLIED', 'AA4 a retry of a completed repair reports ALREADY_APPLIED',
  [AA2re.failed_predicates, AA2re.refusal_reasons]);
eq([AA2re.already_applied, AA2re.writes, AA2re.cells_written, AA2re.ids_minted],
  [true, 0, 0, 0], 'AA4a writing nothing and minting no second id');
eq(AA2w.allWrites(), 1, 'AA4b the world still has exactly ONE write in it');
eq(AA2re.readback.ok, true,
  'AA4c and the retry CONFIRMS the completed repair against the frozen expected AFTER');

// ---- AA5 — EVERY DRIFT REFUSES, EACH UNDER ITS OWN NAME. ------------------------------------------
// One table, because "it refuses on drift" has to hold for every kind of drift and not only the one being
// worked on. Each case takes the SAME frozen baseline and mutates the world under it.
function aaDrift(label, mutate, expectFailed, extra) {
  var w = aaWorld(aaRows(aaIdOnly({})), null, extra);
  var m = aaMan(w);
  ok(m.verdict === 'READY_TO_AUTHORIZE_BACKFILL', label + '0 the world starts repairable',
    m.classification_reasons);
  if (mutate) mutate(w, m);
  var r = aaFill(w, { execute: true, frozen: m.frozen_before,
    authorization: m.authorization_wording });
  ok(r.verdict === 'REFUSED', label + ' it refuses', [r.verdict, r.failed_predicates]);
  if (expectFailed) {
    ok(r.failed_predicates.indexOf(expectFailed) >= 0 || r.refusal_reasons.join('|').indexOf(expectFailed) >= 0,
      label + 'a on ' + expectFailed, [r.failed_predicates, r.refusal_reasons]);
  }
  aaNoWrite(r, w, label + 'b');
  return r;
}
// fingerprint drift — a cell of the target row changed after the freeze
aaDrift('AA5 fingerprint drift', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[1][sh.rows[0].indexOf('note')] = 'edited after the freeze';
}, 'the_target_row_fingerprint_is_the_one_that_was_frozen');
// header / schema drift — a column renamed
aaDrift('AA6 header drift', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[0][sh.rows[0].indexOf('note')] = 'remark';
}, 'the_header_fingerprint_is_the_one_that_was_frozen');
// table count drift — a row appeared
aaDrift('AA7 row count drift', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows.push(sh.rows[2].slice());
}, 'the_row_count_is_the_one_that_was_frozen');
// the row MOVED — same content, different sheet position
aaDrift('AA8 the target row moved', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  var moved = sh.rows.splice(1, 1)[0];
  sh.rows.push(moved);
}, 'the_target_row_fingerprint_is_the_one_that_was_frozen');
// the id is no longer blank — somebody else filled it
aaDrift('AA9 the id is no longer blank', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[1][0] = 'FSMV-DEADBEEF';
}, 'the_target_row_fingerprint_is_the_one_that_was_frozen');
// a SECOND blank id appeared — the repair is no longer a single-cell one
aaDrift('AA10 a second blank id appeared', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[3][0] = '';
}, 'the_table_still_has_exactly_one_id_integrity_fault');
// a duplicate appeared
aaDrift('AA11 a duplicate id appeared', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[3][0] = String(sh.rows[2][0]);
}, 'the_table_still_has_exactly_one_blank_id_and_no_other_class_of_fault');
// a wrong-typed id appeared
aaDrift('AA12 a wrong-typed id appeared', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[3][0] = 20260901;
}, 'the_table_still_has_exactly_one_blank_id_and_no_other_class_of_fault');
// the proposed id turns up in use elsewhere
aaDrift('AA13 the proposed id collides', function (w, m) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[3][0] = m.frozen_before.proposed_id;
}, 'the_frozen_id_collides_with_no_existing_id');
// the row stops classifying as id-only
aaDrift('AA14 the row stops classifying as id-only', function (w) {
  var sh = w.sheets['factory_stock_movements'];
  sh.rows[1][sh.rows[0].indexOf('movement_type')] = '';
}, 'the_target_row_fingerprint_is_the_one_that_was_frozen');
// THE PRODUCTION TARGET ASSERTION. Not run through aaDrift: breaking the target from the start would break
// the MANIFEST too, and then there would be no frozen baseline to refuse against. The freeze is taken
// against the real target first, and the assertion is broken underneath it - which is the case that
// matters, a baseline that was valid when it was taken and a database that is no longer the right one.
aaDrift('AA15 the production target assertion fails', function (w) {
  vm.runInContext('prodAssertDbTarget_ = function () {'
    + ' throw new Error("WRONG_SPREADSHEET"); };', w.ctx);
}, 'DB_NOT_OPENED');

// ---- AA16 — NO EXECUTION WITHOUT THE EXACT AUTHORIZATION, AND NONE WITHOUT A FREEZE. ---------------
var AA16w = aaWorld(aaRows(aaIdOnly({})));
var AA16 = aaMan(AA16w);
[['AA16 no options at all', {}],
  ['AA16b execute with no freeze', { execute: true }],
  ['AA16c a freeze with no authorization', { execute: true, frozen: AA16.frozen_before }],
  ['AA16d a freeze with the wrong authorization',
    { execute: true, frozen: AA16.frozen_before, authorization: 'I authorize the repair.' }],
  ['AA16e the sentence with one character changed',
    { execute: true, frozen: AA16.frozen_before,
      authorization: String(AA16.authorization_wording).replace('ONE controlled', 'one controlled') }],
  ['AA16f an incomplete freeze', { execute: true,
    frozen: (function () { var c = JSON.parse(JSON.stringify(AA16.frozen_before));
      delete c.expected_after_row_fingerprint; return c; })(),
    authorization: AA16.authorization_wording }],
  ['AA16g a freeze whose classification is not id-only', { execute: true,
    frozen: (function () { var c = JSON.parse(JSON.stringify(AA16.frozen_before));
      c.classification = 'LEGACY_ROW_CLASSIFICATION_REQUIRED'; return c; })(),
    authorization: AA16.authorization_wording }],
  ['AA16h a freeze taken against another build', { execute: true,
    frozen: (function () { var c = JSON.parse(JSON.stringify(AA16.frozen_before));
      c.build = 'F1-SOMETHING-ELSE'; return c; })(),
    authorization: AA16.authorization_wording }]].forEach(function (p) {
  var r = aaFill(AA16w, p[1]);
  eq(r.verdict, 'REFUSED', p[0] + ' refuses');
  aaNoWrite(r, AA16w, p[0] + ':');
});
// AND execute must be EXACTLY true. A truthy value is a typo, not an authorization.
[['AA17 execute:"true" (a string)', 'true'], ['AA17b execute:1', 1],
  ['AA17c execute:{}', {}]].forEach(function (p) {
  var r = aaFill(AA16w, { execute: p[1], frozen: AA16.frozen_before,
    authorization: AA16.authorization_wording });
  eq([r.verdict, r.dry_run, r.execute_requested], ['DRY_RUN_OK', true, false],
    p[0] + ' is a DRY RUN, not an execution');
  aaNoWrite(r, AA16w, p[0] + ':');
});

// ---- AA18 — WRITE FAILURE, READBACK FAILURE, AND THE ROLLBACK. -----------------------------------
// WRITE THROWS: nothing was written, so the rollback finds the row already at its frozen BEFORE.
var AA18w = aaWorld(aaRows(aaIdOnly({})));
var AA18m = aaMan(AA18w);
(function () {
  var sh = AA18w.sheets['factory_stock_movements'];
  var orig = sh.getRange;
  var first = true;
  sh.getRange = function (r, c, nr, nc) {
    var rg = orig.call(sh, r, c, nr, nc);
    var sv = rg.setValue;
    rg.setValue = function (v) {
      if (first) { first = false; throw new Error('SHEET_WRITE_REFUSED_BY_THE_BACKEND'); }
      return sv.call(rg, v);
    };
    return rg;
  };
})();
var AA18 = aaFill(AA18w, { execute: true, frozen: AA18m.frozen_before,
  authorization: AA18m.authorization_wording });
eq(AA18.verdict, 'WRITE_FAILED', 'AA18 a write that throws is reported as WRITE_FAILED',
  [AA18.verdict, AA18.refusal_reasons]);
ok(String(AA18.refusal_reasons.join('|')).indexOf('WRITE_THREW') >= 0,
  'AA18a naming the throw', AA18.refusal_reasons);
eq([AA18.cells_written, AA18.writes], [0, 0], 'AA18b with no cell recorded as written');
eq(AA18.rollback.outcome, 'RESTORED',
  'AA18c and the rollback verifies the row is at its frozen BEFORE fingerprint', AA18.rollback);
eq(AA18.rollback.restored_row_fingerprint, AA18m.frozen_before.target_row_fingerprint,
  'AA18d proven by fingerprint, not by assumption');
// READBACK MISMATCH: the write lands a DIFFERENT value, so the row cannot hash to the expected AFTER.
var AA19w = aaWorld(aaRows(aaIdOnly({})));
var AA19m = aaMan(AA19w);
(function () {
  var sh = AA19w.sheets['factory_stock_movements'];
  var orig = sh.getRange;
  var n = 0;
  sh.getRange = function (r, c, nr, nc) {
    var rg = orig.call(sh, r, c, nr, nc);
    var sv = rg.setValue;
    rg.setValue = function (v) {
      n++;
      return sv.call(rg, (n === 1 && String(v).indexOf('FSMV-') === 0) ? 'FSMV-WRONG001' : v);
    };
    return rg;
  };
})();
var AA19 = aaFill(AA19w, { execute: true, frozen: AA19m.frozen_before,
  authorization: AA19m.authorization_wording });
eq(AA19.verdict, 'EXECUTED_AND_ROLLED_BACK',
  'AA19 a readback that does not match the frozen AFTER is rolled back',
  [AA19.verdict, AA19.refusal_reasons]);
eq(AA19.readback.ok, false, 'AA19a the readback failed');
ok(AA19.readback.mismatches.length >= 1, 'AA19b naming what did not match',
  AA19.readback.mismatches.map(function (m) { return m.what; }));
eq(AA19.rollback.outcome, 'RESTORED', 'AA19c and the rollback restored the cell to blank');
eq(AA19.rollback.restored_row_fingerprint, AA19m.frozen_before.target_row_fingerprint,
  'AA19d verified against the frozen BEFORE fingerprint');
eq(AA19.cells_rolled_back, 1, 'AA19e exactly one cell was rolled back');
// ROLLBACK FAILURE: the restore itself lands a non-blank value, so the fingerprint cannot return.
var AA20w = aaWorld(aaRows(aaIdOnly({})));
var AA20m = aaMan(AA20w);
(function () {
  var sh = AA20w.sheets['factory_stock_movements'];
  var orig = sh.getRange;
  var n = 0;
  sh.getRange = function (r, c, nr, nc) {
    var rg = orig.call(sh, r, c, nr, nc);
    var sv = rg.setValue;
    rg.setValue = function (v) {
      n++;
      if (n === 1) return sv.call(rg, 'FSMV-WRONG002');
      if (n === 2) return sv.call(rg, 'STILL-NOT-BLANK');
      return sv.call(rg, v);
    };
    return rg;
  };
})();
var AA20 = aaFill(AA20w, { execute: true, frozen: AA20m.frozen_before,
  authorization: AA20m.authorization_wording });
eq(AA20.verdict, 'ROLLBACK_FAILED',
  'AA20 a rollback that does not restore the frozen fingerprint is reported as FAILED',
  [AA20.verdict, AA20.rollback]);
eq(AA20.rollback.outcome, 'FAILED', 'AA20a and it says so');
ok(String(AA20.rollback.error).indexOf('DID_NOT_RETURN_TO_ITS_FROZEN_BEFORE_FINGERPRINT') >= 0,
  'AA20b under a named reason rather than a silent pass', AA20.rollback.error);
ok(AA20.rollback.restored_row_fingerprint !== AA20m.frozen_before.target_row_fingerprint,
  'AA20c with both fingerprints reported so a person can see the gap',
  [AA20m.frozen_before.target_row_fingerprint, AA20.rollback.restored_row_fingerprint]);

// ---- AA21 — ONE CELL, AND NOTHING ELSE IN THE WORLD. ---------------------------------------------
// §4-§7 as a measurement rather than a promise: after a successful execute, every OTHER row of the
// movement table and every OTHER table in the world is byte-for-byte what it was.
var AA21w = aaWorld(aaRows(aaIdOnly({})));
var AA21snapshot = JSON.stringify(Object.keys(AA21w.sheets).sort().map(function (k) {
  return { table: k, rows: AA21w.sheets[k].rows };
}));
var AA21m = aaMan(AA21w);
var AA21 = aaFill(AA21w, { execute: true, frozen: AA21m.frozen_before,
  authorization: AA21m.authorization_wording });
eq(AA21.verdict, 'EXECUTED_OK', 'AA21 the repair succeeded', AA21.failed_predicates);
var AA21after = JSON.parse(JSON.stringify(Object.keys(AA21w.sheets).sort().map(function (k) {
  return { table: k, rows: AA21w.sheets[k].rows };
})));
var AA21before = JSON.parse(AA21snapshot);
var AA21diff = [];
AA21before.forEach(function (t, ti) {
  var now = AA21after[ti];
  if (t.rows.length !== now.rows.length) {
    AA21diff.push({ table: t.table, what: 'ROW_COUNT', before: t.rows.length, after: now.rows.length });
    return;
  }
  t.rows.forEach(function (row, ri) {
    row.forEach(function (cell, ci) {
      if (String(cell) !== String(now.rows[ri][ci])) {
        AA21diff.push({ table: t.table, row: ri + 1, col: ci + 1,
          before: String(cell), after: String(now.rows[ri][ci]) });
      }
    });
  });
});
eq(AA21diff.length, 1, 'AA21a EXACTLY ONE cell in the entire world differs', AA21diff);
eq([AA21diff[0].table, AA21diff[0].row, AA21diff[0].col],
  ['factory_stock_movements', 2, 1], 'AA21b and it is the one named in the authorization');
eq([AA21diff[0].before, AA21diff[0].after], ['', AA21m.frozen_before.proposed_id],
  'AA21c blank before, the frozen id after');
eq(AA21w.writesByTable(), { factory_stock_movements: 1 },
  'AA21d no other table was written');
eq([AA21.rows_added, AA21.rows_removed, AA21.rows_reordered], [0, 0, false],
  'AA21e and no row was added, removed or reordered');

// ---- AA24 - A REPAIR THAT TOUCHED TWO CELLS IS NOT RECOVERABLE, AND THE TOOL SAYS SO. --------------
//
// Found while writing this round's mutants and worth stating as a limitation rather than discovering later.
// The rollback restores THE ONE authorized cell. If something outside the authorization also moved - a
// concurrent edit, a backend that wrote more than it was asked to - the row can never hash back to its
// frozen BEFORE, so the rollback reports FAILED instead of claiming a clean restore. That is the honest
// outcome: a partially-applied change needs a person, and a tool that said RESTORED would have hidden it.
var AA24w = aaWorld(aaRows(aaIdOnly({})));
var AA24m = aaMan(AA24w);
(function () {
  var sh = AA24w.sheets['factory_stock_movements'];
  var orig = sh.getRange;
  var n = 0;
  sh.getRange = function (r, c, nr, nc) {
    var rg = orig.call(sh, r, c, nr, nc);
    var sv = rg.setValue;
    rg.setValue = function (v) {
      n++;
      if (n === 1) { sh.rows[1][sh.rows[0].indexOf('note')] = 'a concurrent edit'; }
      return sv.call(rg, v);
    };
    return rg;
  };
})();
var AA24 = aaFill(AA24w, { execute: true, frozen: AA24m.frozen_before,
  authorization: AA24m.authorization_wording });
eq(AA24.verdict, 'ROLLBACK_FAILED',
  'AA24 a second cell moving under the repair is reported as an unrecoverable rollback',
  [AA24.verdict, AA24.rollback]);
eq(AA24.readback.ok, false, 'AA24a the readback refuses');
ok(AA24.readback.mismatches.filter(function (m) {
  return m.what === 'COLUMN_CHANGED:note'; }).length === 1,
  'AA24b naming the column that moved outside the authorization',
  AA24.readback.mismatches.map(function (m) { return m.what; }));
eq(AA24.rollback.outcome, 'FAILED',
  'AA24c and the rollback says FAILED rather than claiming a clean restore');
ok(AA24.rollback.restored_row_fingerprint !== AA24m.frozen_before.target_row_fingerprint,
  'AA24d because the row cannot return to its frozen BEFORE while another cell is still changed');
eq(AA24.cells_rolled_back, 1,
  'AA24e exactly one cell was rolled back — the tool restores what it was authorized to write, and no more');

// ---- AA22 — THE FIELD CONTRACT ITSELF, AGAINST BOTH AUTHORITIES. ---------------------------------
var AA22 = AA2.field_contract;
eq(AA22.length, 15, 'AA22 the contract has one entry per live column');
eq(AA22.map(function (f) { return f.column; }), Z0decl,
  'AA22a in 21_ MOV_HEADERS order, matching the live header exactly');
eq(AA22.filter(function (f) { return f.required; }).map(function (f) { return f.column; }),
  ['factory_stock_movement_id', 'sku', 'warehouse_id', 'movement_type', 'qty', 'created_at'],
  'AA22b six columns are REQUIRED, and required-ness comes from the schema doc');
// The doc says so, checked against the doc rather than asserted.
var AA22doc = read('assets/specs/active/pages/shipping/SHIPMENT_DATABASE_SCHEMA.md');
var AA22sec = AA22doc.slice(AA22doc.indexOf('| factory_stock_movement_id | string | Yes | PK'),
  AA22doc.indexOf('| created_at | datetime | Yes | 異動時間'));
ok(AA22sec.indexOf('| movement_type | enum | Yes |') > 0,
  'AA22c SHIPMENT_DATABASE_SCHEMA.md marks movement_type Required = Yes');
ok(AA22sec.indexOf('| related_entity_type | enum |  |') > 0
  || /\| related_entity_type \| enum \|\s*\|/.test(AA22sec),
  'AA22d and related_entity_type optional — so the two are not the same finding');
// The three 21_-era columns the doc has no entry for are recorded as such, not invented as required.
eq(AA22.filter(function (f) { return f.doc_column === null; }).map(function (f) { return f.column; }),
  ['movement_date', 'before_reserved_stock', 'after_reserved_stock'],
  'AA22e three live columns have no schema-doc entry at all');
ok(AA22.filter(function (f) { return f.doc_column === null; })
  .every(function (f) { return f.required === false && f.every_writer_sets === true; }),
  'AA22f and they are recorded as NOT required but writer-populated, rather than given a requirement');
eq(AA22.filter(function (f) { return f.every_writer_sets; }).length, 15,
  'AA22g every one of the fifteen is populated by every shipped writer');
eq(AA22.filter(function (f) { return f.role === 'LEDGER_AXIS_SELECTOR'; })
  .map(function (f) { return f.column; }), ['movement_type'],
  'AA22h and exactly one column is the ledger axis selector');
// THE VOCABULARY IS 21_'s, EXECUTED.
var AA22w = S1World(pos());
eq(vm.runInContext('FSTX_MOVEMENT_TYPES_.length', AA22w.ctx), 7,
  'AA22i 21_ declares seven movement types and the world runs them');
eq(vm.runInContext('factoryStockIsKnownMovementType_("manual_adjustment")', AA22w.ctx), true,
  'AA22j so a canonical value is recognised as canonical');
eq(vm.runInContext('factoryStockIsKnownMovementType_("")', AA22w.ctx), false,
  'AA22k and a blank one is not');

// ---- AA23 — AN ABSENT VOCABULARY IS NOT AN INVALID VALUE. ---------------------------------------
// This round's own first mistake, kept as a case: with 21_ not loaded, `manual_adjustment` was reported
// as "not in the canonical vocabulary". Both still refuse — you must not classify a row whose type cannot
// be checked — but only one of the two is a data problem, and the operator has to be told which.
var AA23w = aaWorld(aaRows(aaIdOnly({})), null,
  { after: 'factoryStockIsKnownMovementType_ = undefined;'
    + ' factoryStockIsCurrentMovement_ = undefined;'
    + ' factoryStockIsReservationMovement_ = undefined;' });
var AA23 = aaMan(AA23w);
eq(AA23.verdict, 'LEGACY_ROW_CLASSIFICATION_REQUIRED',
  'AA23 with the vocabulary authority absent the row is not classified as repairable');
ok(AA23.classification_reasons
  .indexOf('MOVEMENT_TYPE_VOCABULARY_AUTHORITY_IS_UNAVAILABLE_IN_THIS_DEPLOYMENT') >= 0,
  'AA23a under a reason that names the ABSENT AUTHORITY', AA23.classification_reasons);
ok(AA23.classification_reasons.join('|').indexOf('NOT_IN_THE_CANONICAL_VOCABULARY') === -1,
  'AA23b and NOT as an invalid value — the row is fine, the deployment cannot check it',
  AA23.classification_reasons);
eq(AA23.target.axis_audit.axis, 'UNCHECKABLE_BECAUSE_THE_VOCABULARY_AUTHORITY_IS_ABSENT',
  'AA23c with the axis reported as uncheckable rather than unknown');
eq(AA23.target.axis_audit.vocabulary_authority_available, false,
  'AA23d and the availability recorded as the fact it is');
eq([AA23.proposed, AA23.frozen_before, AA23.authorization_wording], [null, null, null],
  'AA23e nothing is proposed, frozen or signed');
aaNoWrite(AA23, AA23w, 'AA23f');

// ================================================================================================================
section('AB — S1-R4F: where row 2 came from, asked of everything except row 2');
// ================================================================================================================
//
// R4E proved the row cannot be repaired by writing one cell and named why. That refusal is also the end of
// what ONE TABLE can settle: movement_type is blank so the row does not say what it was, related_entity_id is
// blank so it does not say what it came from, and no shipped writer leaves either blank - so the table holds
// no record of its own provenance. This section drives the census that asks the rest of the database.
//
// THE PIN. The census re-confirms a frozen live state before it will publish anything, and the frozen state
// includes the live table's combined fingerprint - which no fixture can reproduce, because it is a hash over
// 95 real primary keys. So these worlds pass their own measured state in as `opts.expect`, and the census
// REPORTS that the expectation was caller-supplied. The safety property itself is tested separately and
// against the DEFAULT: AB20 runs with no argument and gets STOP, which is what a live run against a drifted
// sheet would get.
//
// This is not the self-comparison this file keeps finding. The pin is what the census is asked to hold the
// world to; the assertions below are about the provenance reasoning, none of which reads the pin.

function abBlank() {
  return { factory_stock_movement_id: '', movement_date: '', sku: SKU, warehouse_id: WHF,
    movement_type: '', qty: '', related_entity_type: '', related_entity_id: '',
    before_current_stock: '', after_current_stock: '', before_reserved_stock: '',
    after_reserved_stock: '', note: '', created_by: '', created_at: '' };
}
/** The LIVE row 2, at the shape the operator froze: six non-blank named fields, nine blank. */
function abLive(over) {
  var r = abBlank();
  r.qty = 12000; r.before_current_stock = 1000; r.after_current_stock = 12000;
  r.created_at = '2026-06-12';
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
/** A row every shipped writer would recognise: all fifteen columns populated, and its own qty reconciles. */
function abFull(over) {
  var r = { factory_stock_movement_id: 'FSMV-000000A1', movement_date: '2026-06-20',
    sku: SKU, warehouse_id: WHF, movement_type: 'manual_adjustment', qty: 500,
    related_entity_type: 'inventory_adjustment', related_entity_id: 'ADJ-20260620-0001',
    before_current_stock: 12000, after_current_stock: 12500,
    before_reserved_stock: 0, after_reserved_stock: 0,
    note: 'stock count correction', created_by: 'operation-system',
    created_at: '2026-06-20T00:00:00Z' };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
/** A row from the target's own batch that someone LATER keyed and typed: the same blanks everywhere else. */
function abSibling(over) {
  var r = abBlank();
  r.factory_stock_movement_id = 'FSMV-000000B2';
  r.movement_type = 'manual_adjustment';
  r.qty = 4000; r.before_current_stock = 1000; r.after_current_stock = 5000;
  r.created_at = '2026-06-12';
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
var AB_POOL_ = [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 12500, fac_reserved_stock: 0 }];
function abWorld(rows, extra, mutate) {
  var sp = {};
  Object.keys(pos()).forEach(function (k) { sp[k] = pos()[k]; });
  sp.movements = rows;
  sp.factory_stock = AB_POOL_;
  Object.keys(extra || {}).forEach(function (k) { sp[k] = extra[k]; });
  var w = S1World(sp);
  if (mutate) mutate(w);
  return w;
}
/** The world's own measured state, read through the SHIPPED read-only id census, as the pin. */
function abPin(w, over) {
  var c = vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx);
  var f = (c.faults || [])[0] || {};
  var e = { build: c.build, header_fingerprint: c.header_fingerprint,
    table_combined_fingerprint: c.table_combined_fingerprint,
    row_count: c.row_count, valid_id_count: c.valid_id_count, blank_id_count: c.blank_id_count,
    duplicate_id_count: c.duplicate_id_count, wrong_type_id_count: c.wrong_type_id_count,
    outside_named_column_row_count: c.outside_named_column_row_count,
    target_row_number: f.one_based_sheet_row_number, target_row_fingerprint: f.full_named_row_fingerprint,
    target_movement_type_is_blank: true, pool_warehouse_id: WHF, pool_sku: SKU,
    authority: 'the suite\'s own measurement of the world it built' };
  Object.keys(over || {}).forEach(function (k) { e[k] = over[k]; });
  return e;
}
function abProv(w, opts) {
  vm.runInContext('var __AB_ARG = ' + JSON.stringify(opts || {}) + ';', w.ctx);
  return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_LEGACY_PROVENANCE_CENSUS(__AB_ARG)', w.ctx);
}
/** Build a world, pin it to itself, run the census. */
function abRun(rows, pinOver, extra, mutate, optsOver) {
  var w = abWorld(rows, extra, mutate);
  var o = { expect: abPin(w, pinOver) };
  Object.keys(optsOver || {}).forEach(function (k) { o[k] = optsOver[k]; });
  var r = abProv(w, o);
  r.world = w;
  return r;
}
/** Every read-only claim, asserted together. §6 asks for all of these by name. */
function abZeroWrite(r, label) {
  eq([r.dry_run, r.read_only], [true, true], label + ' declares dry_run and read_only');
  eq([r.writes, r.writer_calls, r.cells_written, r.ids_minted, r.ids_backfilled],
    [0, 0, 0, 0, 0], label + ' zero writes, writer calls, cells, ids minted and ids backfilled');
  eq([r.rows_modified, r.rows_added, r.rows_removed, r.rows_reordered],
    [0, 0, 0, false], label + ' no row modified, added, removed or reordered');
  eq([r.jobs_triggered, r.tables_created, r.submit_calls], [0, 0, 0],
    label + ' no job triggered, no table created, no submit');
  eq([r.generate_called, r.submit_called, r.migration_called, r.gap_job_called,
    r.factory_writer_called], [false, false, false, false, false],
    label + ' no Generate, Submit, migration, Gap Job or Factory Stock writer');
  eq([r.has_execute_path, r.proposes_authorized_repair], [false, false],
    label + ' no execute path and no authorized repair proposed');
  eq(r.world.allWrites(), 0, label + ' and zero writes MEASURED on every sheet in the world');
  eq(r.world.writesByTable(), {}, label + ' with no table written at all');
}

// ---- AB1 — THE LIVE ROW, AND WHAT THE WRITERS' OWN CONTRACTS SAY ABOUT IT. --------------------------
// The one line of evidence that needs no other table: each shipped writer populates certain columns
// unconditionally, so a row blank in any of them cannot have come from it. This ELIMINATES rather than
// guesses, and for the live row it eliminates all three.
var AB1 = abRun([abLive(), abFull()]);
eq(AB1.verdict === 'STOP', false, 'AB1 the census reaches a provenance verdict on the live-shaped row',
  AB1.stop_reasons);
eq(AB1.classification, 'LEGACY_ROW_CLASSIFICATION_REQUIRED',
  'AB1a R4E\'s classification is unchanged and is carried forward, not re-litigated');
eq(AB1.target_row.required_blank, ['factory_stock_movement_id', 'movement_type'],
  'AB1b two required fields blank, and the second decides the ledger axis');
eq(AB1.target_row.named_nonblank_field_count, 6,
  'AB1c six non-blank named fields, exactly the frozen live count');
eq(AB1.writer_elimination.eliminated_count, 3,
  'AB1d all three shipped writers are eliminated', AB1.writer_elimination.per_writer);
eq(AB1.writer_elimination.writers_that_could_have_written_this_row, [],
  'AB1e so no shipped writer could have produced this row');
eq(AB1.writer_elimination.no_shipped_writer_could_have_produced_this_row, true,
  'AB1f which is stated as its own fact rather than left to be inferred');
AB1.writer_elimination.per_writer.forEach(function (p, i) {
  ok(p.because.length > 0, 'AB1g.' + (i + 1) + ' ' + p.writer + ' says WHY it is eliminated',
    p.because);
});
ok(AB1.writer_elimination.per_writer[0].because.join('|')
  .indexOf('THIS_WRITER_ALWAYS_WRITES_movement_type=manual_adjustment') >= 0,
  'AB1h and a constant mismatch is named as a constant mismatch',
  AB1.writer_elimination.per_writer[0].because);
ok(AB1.writer_elimination.per_writer[2].because.join('|')
  .indexOf('THIS_WRITER_WRITES_QTY_AS_AFTER_MINUS_BEFORE_WHICH_WOULD_BE:11000') >= 0,
  'AB1i and the import writer is eliminated on the ledger invariant too: 11000, not 12000',
  AB1.writer_elimination.per_writer[2].because);
// A BLANK IS NOT A ZERO, and this is where that distinction does real work: every writer stores a NUMBER in
// both reserved columns, and 0 canonicalizes to N:0. Blank reserved cells therefore eliminate all three.
ok(AB1.writer_elimination.per_writer[1].because.join('|')
  .indexOf('THIS_WRITER_NEVER_LEAVES_IT_BLANK:before_reserved_stock') >= 0,
  'AB1j a blank reserved cell eliminates a writer that would have stored a zero there',
  AB1.writer_elimination.per_writer[1].because);
abZeroWrite(AB1, 'AB1k:');

// ---- AB2 — THE CHEAP INNOCENT EXPLANATION, MEASURED AND REFUSED. -----------------------------------
// A row full of blanks is usually a row that predates some appended columns - fcWriteEnsureColumns_ appends
// additively, so this happens. But a widening can only leave a CONTIGUOUS TAIL of blanks, and this row's
// blanks start at position 1. Decidable from the positions alone, and worth deciding: if it held, the row
// would be a normal old record.
eq(AB2_(AB1).supported, false, 'AB2 the column-append explanation does not hold for this row');
function AB2_(r) { return r.column_append_hypothesis; }
eq(AB1.column_append_hypothesis.blanks_form_a_contiguous_trailing_block, false,
  'AB2a because the blanks are not a trailing block');
eq(AB1.column_append_hypothesis.blank_positions_1based, [1, 2, 5, 7, 8, 11, 12, 13, 14],
  'AB2b they are interleaved with filled cells at these nine positions');
eq(AB1.column_append_hypothesis.filled_positions_1based, [3, 4, 6, 9, 10, 15],
  'AB2c and the six filled ones sit among them');
ok(String(AB1.column_append_hypothesis.why).indexOf('INTERLEAVED') >= 0,
  'AB2d and the reason names interleaving rather than only saying no',
  AB1.column_append_hypothesis.why);

// ---- AB3 — THE CHRONOLOGY KEEPS THE SHEET ROW, AND SAYS WHICH COLUMN ORDERED IT. --------------------
// R4C's lesson applied to a sorted list: a position in an ordering is not a fact about the data, so the
// 1-based sheet row travels with every entry. And the ordering AUTHORITY is published, because a chronology
// built by silently preferring one of two time columns is a chronology nobody can check.
var AB3 = abRun([abLive(), abFull()]);
eq(AB3.chronology.entry_count, 2, 'AB3 both rows of the pool are in the chronology');
eq(AB3.chronology.target_position, 1, 'AB3a the target sorts first, on 2026-06-12');
eq(AB3.chronology.entries.map(function (e) { return e.one_based_sheet_row_number; }), [2, 3],
  'AB3b and every entry carries its 1-based sheet row');
eq(AB3.chronology.entries[0].time_source, 'created_at',
  'AB3c ordered by created_at, which the schema doc marks Required');
ok(String(AB3.chronology.ordering_authority).indexOf('sheet row') > 0,
  'AB3d and ties are broken by sheet row, stated', AB3.chronology.ordering_authority);
eq(AB3.chronology.rows_without_a_usable_time, 0, 'AB3e no row here lacks a usable time');
eq(AB3.chronology.ordering_is_unambiguous, true, 'AB3f so the ordering is unambiguous, and says so');

// ---- AB4 — A ROW WITH NO USABLE TIME SORTS LAST AND IS COUNTED, NOT GIVEN ONE. ----------------------
// "I do not know when this happened" is the single most important thing to say about a legacy row, so a
// blank time is neither filled with now(), nor given position zero, nor dropped.
var AB4 = abRun([abLive(), abFull(), abFull({ factory_stock_movement_id: 'FSMV-000000C3',
  movement_date: '', created_at: '', before_current_stock: 12500, after_current_stock: 12600, qty: 100 })]);
eq(AB4.chronology.rows_without_a_usable_time, 1, 'AB4 the timeless row is counted');
eq(AB4.chronology.entries[AB4.chronology.entries.length - 1].one_based_sheet_row_number, 4,
  'AB4a and it sorts LAST rather than first');
eq(AB4.chronology.entries[AB4.chronology.entries.length - 1].time_source, 'NONE',
  'AB4b with its time source reported as NONE rather than invented');
eq(AB4.chronology.ordering_is_unambiguous, false,
  'AB4c and the ordering no longer claims to be unambiguous');

// ---- AB5 — THE DISCRIMINATOR: THE NEXT ROW'S `before` = 12000. -------------------------------------
// §1.4. This is the whole point of asking another row: every writer records before/after, so the next
// movement's opening balance is an INDEPENDENT statement of what this row's closing balance was.
var AB5 = abRun([abLive(), abFull()]);
var AB5n = AB5.next_classifiable_same_pool_movement;
eq(AB5n.one_based_sheet_row_number, 3,
  'AB5 the next classifiable movement in the pool is located');
eq(AB5n.movement_type, 'manual_adjustment', 'AB5a with its type');
eq([AB5n.before_current_stock, AB5n.after_current_stock],
  [12000, 12500], 'AB5b and both of its current-axis cells');
eq(AB5n.movement_id, 'FSMV-000000A1', 'AB5c and its primary key');
ok(AB5n.full_named_row_fingerprint !== null,
  'AB5d and its own full-row fingerprint, so it can be re-found');
// R4G §C — THE THREE SUCCESSOR QUESTIONS COINCIDE HERE, AND THAT IS WHY ONE VARIABLE SURVIVED R4F.
// This world's next row opens at 12000, exactly where the target closed, so it is the physical successor,
// the classifiable one AND the one in the target's own ledger epoch. R4F's single `next_same_pool_movement`
// was measured against worlds like this one and looked correct on all of them. Section AC is the world
// where the three answers differ.
eq([AB5.next_physical_same_pool_movement.one_based_sheet_row_number,
  AB5.next_classifiable_same_pool_movement.one_based_sheet_row_number,
  AB5.next_same_ledger_epoch_movement.one_based_sheet_row_number], [3, 3, 3],
  'AB5d1 all three successor questions have the same answer on a single-epoch chain');
eq(AB5.ledger_epochs.epoch_count, 1, 'AB5d2 because this chain is one ledger epoch');
eq(AB5.chain_continuity.links[0].current.state, 'AGREES', 'AB5d3 its one link agrees');
ok(String(AB5.chain_continuity.links[0].current.comparability_basis)
  .indexOf('BOTH_CELLS_ARE_READINGS_OF_THE_SAME_POOL_QUANTITY') === 0,
  'AB5d4 and says WHY the two cells are commensurable, citing the writers that read them',
  AB5.chain_continuity.links[0].current.comparability_basis);
var AB5ev = AB5.evidence.filter(function (e) { return e.source === 'LEDGER_CHAIN_OVERLAP'; });
ok(AB5ev.length >= 1, 'AB5e the overlap produces evidence', AB5.evidence);
ok(AB5ev[0].supports.indexOf('CURRENT_DELTA_FROM_BEFORE_AFTER') >= 0
  && AB5ev[0].contradicts.indexOf('CURRENT_DELTA_FROM_QTY') >= 0,
  'AB5f which confirms after_current_stock and contradicts the qty reading', AB5ev[0]);
eq(AB5ev[0].independent, true,
  'AB5g and it is INDEPENDENT: a different call, at a different time, in a different row');

// ---- AB6 — THE NEXT ROW'S `before` IS NOT 12000: IT IS before+qty. ---------------------------------
// Then the ledger points the other way - qty is the reliable cell and after_current_stock is the wrong one.
// The same measurement, a different answer, which is what makes it a discriminator rather than a formality.
var AB6 = abRun([abLive(), abFull({ before_current_stock: 13000, after_current_stock: 13500 })]);
var AB6ev = AB6.evidence.filter(function (e) { return e.source === 'LEDGER_CHAIN_OVERLAP'; });
ok(AB6ev[0].supports.indexOf('CURRENT_DELTA_FROM_QTY') >= 0,
  'AB6 with the next row opening at 13000 the chain supports the qty reading', AB6ev[0]);
ok(AB6ev[0].contradicts.indexOf('CURRENT_DELTA_FROM_BEFORE_AFTER') >= 0
  && AB6ev[0].contradicts.indexOf('INITIAL_BALANCE_SET') >= 0,
  'AB6a and contradicts both readings that keep after_current_stock', AB6ev[0]);
// AND THE BALANCE DOES NOT RESCUE IT. factory_stock agreeing with the ledger's LAST row says the chain
// reconciles downstream; it says nothing about which of the target's own cells is wrong. Measured, and the
// honest consequence is that this world does NOT reach READY on one source.
eq(AB6.verdict, 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED',
  'AB6b one independent source is not a classification, even when it is unambiguous', AB6.verdict_detail);

// ---- AB7 — THE NEXT ROW OPENS WHERE THIS ONE OPENED: THE BALANCE NEVER MOVED. -----------------------
var AB7 = abRun([abLive(), abFull({ before_current_stock: 1000, after_current_stock: 1500 })]);
var AB7ev = AB7.evidence.filter(function (e) { return e.source === 'LEDGER_CHAIN_OVERLAP'; });
ok(AB7ev[0].supports.indexOf('INVALID_NON_LEDGER_ROW') >= 0,
  'AB7 a next row opening at the target\'s own before means the row took no effect', AB7ev[0]);
eq(AB7ev[0].contradicts.length, 3,
  'AB7a and it contradicts all three readings that treat the row as a movement');

// ---- AB8 — A CHAIN GAP THAT MATCHES NOTHING. THE CHAIN DECLINES TO CHOOSE. --------------------------
// The important behaviour: it does not pick the nearest number. Evidence with no `supports` and no
// `contradicts` is still published, because "the chain cannot settle this" is a finding.
var AB8 = abRun([abLive(), abFull({ before_current_stock: 9999, after_current_stock: 10500 })]);
var AB8ev = AB8.evidence.filter(function (e) { return e.source === 'LEDGER_CHAIN_OVERLAP'; });
eq([AB8ev[0].supports, AB8ev[0].contradicts], [[], []],
  'AB8 a next row matching none of the three candidates supports and contradicts nothing', AB8ev[0]);
ok(String(AB8ev[0].statement).indexOf('matches none of') > 0,
  'AB8a and says so in the statement', AB8ev[0].statement);
eq(AB8.chain_continuity.current_axis.disagree, 1,
  'AB8b while the continuity check records the break');
eq(AB8.chain_continuity.chain_is_continuous_on_the_current_axis, false,
  'AB8c so the chain is not continuous');
eq(AB8.chain_continuity.first_break_at_position, 2,
  'AB8d and the first break is located by position');
eq(AB8.verdict, 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED',
  'AB8e and nothing is classified');

// ---- AB9 — A CONTINUOUS CHAIN, AND A LINK NOBODY RECORDED IS UNEVALUABLE RATHER THAN BROKEN. --------
// The target's reserved pair is blank, so the reserved link cannot be checked. Calling that a broken chain
// would blame the row for a fact nobody wrote down - the same rule that keeps an absent table's count null.
var AB9 = abRun([abLive(), abFull(), abFull({ factory_stock_movement_id: 'FSMV-000000D4',
  before_current_stock: 12500, after_current_stock: 12800, qty: 300,
  created_at: '2026-06-25T00:00:00Z', movement_date: '2026-06-25' })]);
eq(AB9.chain_continuity.links_examined, 2, 'AB9 two links across three pool rows');
eq(AB9.chain_continuity.current_axis,
  { checked: 2, agree: 2, disagree: 0, unevaluable: 0, epoch_boundary: 0, not_comparable: 0 },
  'AB9a and the current axis joins up on both, with NO epoch boundary anywhere in it');
eq(AB9.chain_continuity.chain_is_continuous_on_the_current_axis, true,
  'AB9b so the current chain is continuous');
eq(AB9.chain_continuity.reserved_axis,
  { checked: 2, agree: 1, disagree: 0, unevaluable: 1, epoch_boundary: 0, not_comparable: 0 },
  'AB9c while the reserved link touching the blank pair is UNEVALUABLE, not broken');
eq(AB9.chain_continuity.links[0].reserved.state, 'UNEVALUABLE',
  'AB9d named per link');
ok(String(AB9.chain_continuity.links[0].reserved.why).indexOf('blank is not a quantity') > 0,
  'AB9e with the reason spelled out', AB9.chain_continuity.links[0].reserved.why);
eq(AB9.chain_continuity.chain_is_continuous_on_the_reserved_axis, false,
  'AB9f and a chain of one agreement and one unreadable link is NOT called continuous');
// MEASURED, AND IT CHANGED THE CODE. The first definition of continuity was 'every EVALUABLE link agreed',
// which reported this chain as continuous on the reserved axis while one of its two links had never been
// read. Both facts are now published under names that mean what they say.
eq(AB9.chain_continuity.every_readable_link_agrees_on_the_reserved_axis, true,
  'AB9g while the weaker reading - every link that COULD be read agreed - is true, and keeps its own name');
eq(AB9.chain_continuity.every_readable_link_agrees_on_the_current_axis, true,
  'AB9h and on the current axis, where every link was readable, the two readings agree');

// ---- AB10 — factory_stock RECONCILES, AND THE INDEPENDENCE IS CHECKED RATHER THAN ASSUMED. ----------
var AB10 = abRun([abLive(), abFull()]);
eq([AB10.balance_reconcile.factory_stock_current, AB10.balance_reconcile.ledger_last_after_current],
  [12500, 12500], 'AB10 the pool balance and the ledger\'s last after agree');
eq(AB10.balance_reconcile.current_agrees, true, 'AB10a so the reconcile passes');
eq(AB10.balance_reconcile.independent_of_the_target_row, true,
  'AB10b and it is independent: the last row in the chain is not the target');
eq(AB10.balance_reconcile.ledger_last_sheet_row, 3, 'AB10c named by sheet row');

// ---- AB11 — factory_stock DISAGREES. REPORTED, AND IT SUPPORTS NOTHING. ----------------------------
// A ledger that already disagrees with its balance is not evidence for any reading of the target row: it is
// a second problem, and saying so is more useful than folding it into a score.
var AB11 = abRun([abLive(), abFull()], null,
  { factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 999, fac_reserved_stock: 0 }] });
eq(AB11.balance_reconcile.current_agrees, false, 'AB11 the mismatch is measured');
var AB11ev = AB11.evidence.filter(function (e) { return e.source === 'FACTORY_STOCK_BALANCE'; });
eq([AB11ev[0].supports, AB11ev[0].contradicts], [[], []],
  'AB11a and it supports no candidate and contradicts none', AB11ev[0]);
ok(String(AB11ev[0].statement).indexOf('already disagree') > 0,
  'AB11b saying the ledger and the balance already disagree', AB11ev[0].statement);
AB11.candidates.forEach(function (c) {
  eq(c.current_factory_stock_compatibility, 'THE_LEDGER_AND_THE_LIVE_BALANCE_ALREADY_DISAGREE',
    'AB11c.' + c.number + ' every candidate carries that reading: ' + c.candidate);
});
eq(AB11.verdict, 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED', 'AB11d and nothing is classified');

// ---- AB12 — THE BALANCE IS NOT INDEPENDENT WHEN THE TARGET IS THE LAST ROW. -------------------------
// R4B's defect, one table over: an expectation taken from the thing being checked passes by construction.
// If the target is last in the chain, comparing factory_stock to "the ledger's last after" compares the
// cell under question with itself.
var AB12 = abRun([abLive({ created_at: '2026-12-31' }), abFull()], null,
  { factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 12000, fac_reserved_stock: 0 }] });
eq(AB12.balance_reconcile.independent_of_the_target_row, false,
  'AB12 the target is last, so the balance reading is not independent');
ok(String(AB12.balance_reconcile.why_not_independent).indexOf('CELL_UNDER_QUESTION') > 0,
  'AB12a and it says why', AB12.balance_reconcile.why_not_independent);
eq(AB12.evidence.filter(function (e) { return e.source === 'FACTORY_STOCK_BALANCE'; }).length, 0,
  'AB12b so it produces NO evidence at all, rather than agreeable-looking evidence');
AB12.candidates.forEach(function (c) {
  ok(String(c.current_factory_stock_compatibility).indexOf('NOT_ATTRIBUTABLE') === 0
    && String(c.current_factory_stock_compatibility).indexOf('NOT_INDEPENDENT') > 0,
    'AB12c.' + c.number + ' and every candidate reports it as not independent: ' + c.candidate,
    c.current_factory_stock_compatibility);
});

// ---- AB13 — TWO INDEPENDENT SOURCES AGREE. THE ONLY WAY TO READY. ----------------------------------
// The chain says after_current_stock is right; the balance says the chain reconciles. Two distinct
// independent sources on CURRENT_DELTA_FROM_BEFORE_AFTER, and the balance reading is contradicted for
// INITIAL_BALANCE_SET by the writer contract (an import that creates a pool passes beforeCurrent = 0), so
// exactly one candidate qualifies.
var AB13 = abRun([abLive(), abFull()]);
eq(AB13.verdict, 'READY_FOR_LEGACY_ROW_REPAIR_DECISION',
  'AB13 two independent sources agreeing and nothing contradicting reaches READY', AB13.verdict_detail);
eq(AB13.selected_candidate, 'CURRENT_DELTA_FROM_BEFORE_AFTER',
  'AB13a on the candidate they both point at');
eq(AB13.verdict_detail.qualifying, ['CURRENT_DELTA_FROM_BEFORE_AFTER'],
  'AB13b and it is the only one that qualifies');
var AB13c2 = AB13.candidates[1];
eq(AB13c2.independent_supporting_sources.sort(),
  ['FACTORY_STOCK_BALANCE', 'LEDGER_CHAIN_OVERLAP'],
  'AB13c two DISTINCT independent sources, named');
eq(AB13c2.contradicting_sources, [], 'AB13d and nothing authoritative contradicts it');
eq(AB13c2.computed_delta, 11000, 'AB13e the delta the pair implies is 11000');
eq(AB13c2.subsequent_chain_compatibility, 'CONSISTENT_WITH_THE_NEXT_MOVEMENT_IN_THE_SAME_LEDGER_EPOCH',
  'AB13f chain-consistent, and the reading names the epoch it is consistent WITHIN');
eq(AB13c2.current_factory_stock_compatibility,
  'THE_TARGETS_OWN_LEDGER_EPOCH_RECONCILES_TO_THE_LIVE_BALANCE',
  'AB13g and balance-consistent');
// INITIAL_BALANCE_SET is blocked, not merely out-scored, and the block is recorded with its reason.
eq(AB13.verdict_detail.blocked_by_contradiction,
  [{ candidate: 'INITIAL_BALANCE_SET', contradicted_by: ['WRITER_CONTRACT'] }],
  'AB13h while INITIAL_BALANCE_SET is BLOCKED by an authoritative contradiction, and it is named');
ok(AB13.candidates[0].contradicting_evidence.length >= 1
  && String(AB13.candidates[0].contradicting_evidence[0].statement).indexOf('beforeCurrent = 0') > 0,
  'AB13i because an import that creates the pool passes beforeCurrent = 0, and before is 1000',
  AB13.candidates[0].contradicting_evidence);
// AND READY IS STILL NOT A REPAIR ROUTE.
eq(AB13.proposed_repair_fields.candidate, 'CURRENT_DELTA_FROM_BEFORE_AFTER',
  'AB13j READY publishes PROPOSED fields');
eq(AB13.proposed_repair_fields.implies_wrong_cell, 'qty (it would have to become 11000)',
  'AB13k naming the exact cell and the exact value the decision implies');
ok(String(AB13.proposed_repair_fields.status).indexOf('not authorized, not frozen, not executable') > 0,
  'AB13l and marked not authorized, not frozen, not executable', AB13.proposed_repair_fields.status);
eq([AB13.has_execute_path, AB13.proposes_authorized_repair], [false, false],
  'AB13m with no execute path even on READY');
eq(AB13.operator_questions, null, 'AB13n and no operator questions, because none are needed');
abZeroWrite(AB13, 'AB13o:');

// ---- AB14 — ONE SOURCE ONLY. NEVER READY. ----------------------------------------------------------
// §1.7 and §5.A as an enforced rule rather than a stated one: remove the pool row and the balance source
// disappears, leaving the chain alone. The chain still says exactly what it said in AB13.
var AB14 = abRun([abLive(), abFull()], null, { factory_stock: [] });
eq(AB14.verdict, 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED',
  'AB14 one independent source cannot classify, however unambiguous it is', AB14.verdict_detail);
eq(AB14.verdict_detail.why, 'NO_CANDIDATE_HAS_TWO_INDEPENDENT_SUPPORTING_SOURCES',
  'AB14a and the rule is named');
eq(AB14.candidates[1].independent_supporting_sources, ['LEDGER_CHAIN_OVERLAP'],
  'AB14b the chain still points where it pointed');
ok(String(AB14.candidates[1].confidence_basis).indexOf('ONE INDEPENDENT SOURCE ONLY') === 0,
  'AB14c and the confidence basis says a single agreement is not a classification',
  AB14.candidates[1].confidence_basis);
ok(AB14.candidates[1].missing_evidence
  .indexOf('A_SECOND_INDEPENDENT_SOURCE_POINTING_AT_THIS_SAME_READING') >= 0,
  'AB14d with the missing evidence named', AB14.candidates[1].missing_evidence);
eq(AB14.selected_candidate, null, 'AB14e nothing is selected');
eq(AB14.proposed_repair_fields, null, 'AB14f and nothing is proposed');

// ---- AB15 — THE ROW'S OWN ARITHMETIC IS A SOURCE, AND NEVER AN INDEPENDENT ONE. --------------------
// qty (12000) equals after_current_stock (12000) exactly, which reads like a hand-entered ending balance -
// and is also exactly what a delta typed into the wrong cell looks like. That single agreement must not be
// allowed to conclude anything, so it is recorded with independent:false.
var AB15ev = AB1.evidence.filter(function (e) { return e.source === 'ROW_SELF_ARITHMETIC'; });
ok(AB15ev.length >= 1, 'AB15 the row\'s own arithmetic is published as evidence', AB1.evidence);
AB15ev.forEach(function (e, i) {
  eq(e.independent, false, 'AB15a.' + (i + 1) + ' and it is NOT independent: it is the thing being explained');
});
ok(String(AB15ev[0].statement).indexOf('also exactly what a delta typed into the wrong cell looks like') > 0,
  'AB15b and the statement names both readings of the same coincidence', AB15ev[0].statement);
eq(AB1.evidence.filter(function (e) { return e.source === 'ROW_SELF_ARITHMETIC' && e.independent; }).length,
  0, 'AB15c so no self-evidence is ever counted as independent');

// ---- AB16 — A SIBLING FROM THE SAME BATCH, AND WHAT IT CAN HONESTLY TESTIFY TO. ---------------------
// The exact-shape search could never find this: the target's blank-shape INCLUDES movement_type, so a row
// matching it exactly is by definition also unclassified. The near shape ignores the key and the type -
// exactly the two cells a later hand would have filled - and nothing else.
// The sibling is in a DIFFERENT POOL on purpose, and that is what a batch looks like: a hand-made import or
// an initialization spans SKUs at one warehouse. Measured why it has to be: with the sibling in the target's
// own pool and dated the same day, it became the NEXT MOVEMENT in the chronology as well, its
// before_current_stock of 1000 made the chain say 'the balance never moved', and the world was testing
// something other than the sibling.
var AB16 = abRun([abLive(), abSibling({ sku: 'OTHER-SKU' }), abFull()]);
eq(AB16.siblings.near_shape_match_count, 1, 'AB16 the batch sibling is found on the near shape');
eq(AB16.siblings.exact_shape_match_count, 0,
  'AB16a and NOT on the exact shape, which could never have matched a classified row');
eq(AB16.siblings.ignored_in_the_near_shape, ['factory_stock_movement_id', 'movement_type'],
  'AB16b the relaxation is exactly those two columns, published');
eq(AB16.siblings.classified_sibling_available_as_a_template, true, 'AB16c and it is classified');
var AB16d = AB16.siblings.per_column_diff_against_the_first_classified_sibling;
eq(AB16d.sibling_sheet_row, 3, 'AB16d located by sheet row');
eq(AB16d.sibling_movement_type, 'manual_adjustment', 'AB16e with its type');
// ITS EVIDENCE IS ITS CONVENTION, NOT ITS TYPE NAME. 21_'s import writer stores a DELTA in qty even for
// inventory_import, so a type-name mapping would have been wrong. What the sibling can testify to is how its
// OWN qty relates to its OWN pair: 4000 = 5000 - 1000, a delta.
eq(AB16d.sibling_convention, 'QTY_IS_A_DELTA',
  'AB16f and the convention is measured on the sibling\'s own three cells');
var AB16ev = AB16.evidence.filter(function (e) { return e.source === 'SIBLING_SHAPE_BATCH'; });
ok(AB16ev[0].supports.indexOf('CURRENT_DELTA_FROM_BEFORE_AFTER') >= 0,
  'AB16g so it supports the delta reading', AB16ev[0]);
ok(AB16ev[0].contradicts.indexOf('INITIAL_BALANCE_SET') >= 0,
  'AB16h and contradicts the balance reading');
eq(AB16.siblings.per_column_diff_against_the_first_classified_sibling.columns.length, 15,
  'AB16i the per-column diff covers all fifteen columns');
ok(String(AB16.siblings.template_use).indexOf('PROVENANCE_EVIDENCE_ONLY') === 0,
  'AB16j and the sibling is evidence only - never a source of values', AB16.siblings.template_use);
// A sibling agreeing with the chain and the balance is a THIRD source, and READY still needs no more.
eq(AB16.verdict, 'READY_FOR_LEGACY_ROW_REPAIR_DECISION', 'AB16k three agreeing sources still reach READY');
eq(AB16.candidates[1].independent_supporting_sources.sort(),
  ['FACTORY_STOCK_BALANCE', 'LEDGER_CHAIN_OVERLAP', 'SIBLING_SHAPE_BATCH'],
  'AB16l with all three named');

// ---- AB17 — THE SIBLING CONTRADICTS THE NUMBERS. NOBODY WINS. --------------------------------------
// A sibling whose own qty equals its own after is testifying that the batch wrote BALANCES, which points at
// INITIAL_BALANCE_SET and away from the delta reading the chain supports. Two sources against two: the
// census must refuse rather than prefer one.
var AB17 = abRun([abLive(), abSibling({ sku: 'OTHER-SKU', qty: 5000, before_current_stock: 1000,
  after_current_stock: 5000 }), abFull()]);
eq(AB17.siblings.per_column_diff_against_the_first_classified_sibling.sibling_convention,
  'QTY_IS_A_BALANCE', 'AB17 the sibling testifies that the batch wrote balances');
var AB17ev = AB17.evidence.filter(function (e) { return e.source === 'SIBLING_SHAPE_BATCH'; });
ok(AB17ev[0].supports.indexOf('INITIAL_BALANCE_SET') >= 0
  && AB17ev[0].contradicts.indexOf('CURRENT_DELTA_FROM_BEFORE_AFTER') >= 0,
  'AB17a so it points at the balance reading and away from the delta one', AB17ev[0]);
eq(AB17.verdict, 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED',
  'AB17b and the delta reading is no longer uncontradicted, so READY is withdrawn', AB17.verdict_detail);
eq(AB17.verdict_detail.blocked_by_contradiction.length, 2,
  'AB17c both candidates with two sources are BLOCKED by contradiction',
  AB17.verdict_detail.blocked_by_contradiction);
eq(AB17.verdict_detail.qualifying, [], 'AB17d so none qualifies');
eq(AB17.selected_candidate, null, 'AB17e and nothing is selected');

// ---- AB18 — A SIBLING WHOSE OWN BEFORE IS ZERO CANNOT DISTINGUISH WHAT IT IS BEING ASKED TO. -------
// When before is 0 a delta and a balance are the same number, so the sibling's convention is unreadable
// and it testifies to nothing. Reported as AMBIGUOUS rather than resolved either way.
var AB18 = abRun([abLive(), abSibling({ sku: 'OTHER-SKU', qty: 5000, before_current_stock: 0,
  after_current_stock: 5000 }), abFull()]);
eq(AB18.siblings.per_column_diff_against_the_first_classified_sibling.sibling_convention,
  'AMBIGUOUS_BECAUSE_ITS_OWN_BEFORE_IS_ZERO', 'AB18 the sibling\'s own convention is unreadable');
var AB18ev = AB18.evidence.filter(function (e) { return e.source === 'SIBLING_SHAPE_BATCH'; });
eq([AB18ev[0].supports, AB18ev[0].contradicts], [[], []],
  'AB18a so it supports and contradicts nothing', AB18ev[0]);

// ---- AB19 — AMBIGUITY THAT IS REAL: before = 0 MAKES A SET AND A DELTA THE SAME ROW. ---------------
// With before_current_stock = 0, qty = after - before AND qty = after are both true, and the writer-contract
// contradiction against INITIAL_BALANCE_SET disappears. Two candidates genuinely qualify, and two qualifying
// candidates is ambiguity rather than a choice.
var AB19 = abRun([abLive({ before_current_stock: 0 }),
  abFull({ before_current_stock: 12000, after_current_stock: 12500 })]);
eq(AB19.verdict, 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED',
  'AB19 two qualifying candidates is ambiguity, not a choice', AB19.verdict_detail);
eq(AB19.verdict_detail.qualifying.sort(),
  ['CURRENT_DELTA_FROM_BEFORE_AFTER', 'INITIAL_BALANCE_SET'],
  'AB19a and both are named');
ok(String(AB19.verdict_detail.why).indexOf('MORE_THAN_ONE_CANDIDATE_QUALIFIES') === 0,
  'AB19b with the reason distinguishing this from having too little evidence', AB19.verdict_detail.why);
eq(AB19.selected_candidate, null, 'AB19c nothing selected');
ok(AB19.operator_questions.question_count >= 3,
  'AB19d and the operator questions are published instead', AB19.operator_questions.question_count);

// ---- AB20 — THE DEFAULT EXPECTATION IS THE FROZEN ONE, AND A FIXTURE IS NOT THE LIVE SHEET. --------
// The safety property, tested against the DEFAULT rather than a caller-supplied pin. No argument at all:
// the census holds the world to the frozen R4E state and STOPs, which is exactly what a live run against a
// drifted sheet would do.
var AB20w = abWorld([abLive(), abFull()]);
var AB20 = abProv(AB20w, {});
AB20.world = AB20w;
eq(AB20.verdict, 'STOP', 'AB20 with no argument the census pins itself to the frozen live state and STOPs');
eq(AB20.expectation_source, 'THE_FROZEN_S1_R4E_AUTHORIZATION',
  'AB20a naming the frozen authorization as the expectation source');
eq(AB20.expected.table_combined_fingerprint, 'E3E783BF',
  'AB20b which carries the operator\'s frozen table fingerprint');
ok(AB20.stop_reasons.filter(function (r) {
  return String(r).indexOf('LIVE_STATE_DRIFTED:') === 0; }).length >= 1,
  'AB20c and the STOP names which frozen facts drifted', AB20.stop_reasons);
// A STOP PUBLISHES NO CONCLUSION. Not a classification, not a candidate, not a proposal, and not a set of
// operator questions dressed up as one - the same lock LOCK FIVE enforces one table over.
eq([AB20.selected_candidate, AB20.proposed_repair_fields, AB20.operator_questions],
  [null, null, null], 'AB20d and it publishes no candidate, no proposal and no questions');
eq(AB20.live_state_confirmed, false, 'AB20e with the confirmation recorded as failed');
abZeroWrite(AB20, 'AB20f:');
// AND THE CALLER-SUPPLIED PIN IS LABELLED SO IT CANNOT BE MISTAKEN FOR A MEASUREMENT.
ok(String(AB1.expectation_source).indexOf('CALLER_SUPPLIED') === 0,
  'AB20g while a caller-supplied expectation says so, loudly', AB1.expectation_source);
ok(String(AB1.expectation_source).indexOf('never be mistaken for a live measurement') > 0,
  'AB20h and says why that matters', AB1.expectation_source);

// ---- AB21 — DRIFT, ONE FROZEN FACT AT A TIME. -------------------------------------------------------
// Each of these is a live-state fact the operator froze. A run that proceeds past any of them would be
// gathering provenance evidence about a table nobody authorized.
[['header_fingerprint', 'DEADBEEF'], ['table_combined_fingerprint', 'DEADBEEF'],
  ['row_count', 4242], ['blank_id_count', 7], ['duplicate_id_count', 3],
  ['wrong_type_id_count', 2], ['outside_named_column_row_count', 5], ['valid_id_count', 4242],
  ['target_row_fingerprint', 'DEADBEEF'], ['pool_warehouse_id', 'WH-SOMEWHERE-ELSE'],
  ['pool_sku', 'NOT-THIS-SKU']].forEach(function (d, i) {
  var over = {};
  over[d[0]] = d[1];
  var r = abRun([abLive(), abFull()], over);
  eq(r.verdict, 'STOP', 'AB21.' + (i + 1) + ' drift in ' + d[0] + ' is a STOP');
  ok(r.stop_reasons.indexOf('LIVE_STATE_DRIFTED:' + d[0]) >= 0,
    'AB21.' + (i + 1) + 'a and it is named: LIVE_STATE_DRIFTED:' + d[0], r.stop_reasons);
  eq([r.selected_candidate, r.proposed_repair_fields, r.operator_questions], [null, null, null],
    'AB21.' + (i + 1) + 'b publishing no conclusion');
  eq(r.world.allWrites(), 0, 'AB21.' + (i + 1) + 'c and writing nothing');
});
// AND THE BUILD, which is checked before anything else is even read.
var AB21b = abRun([abLive(), abFull()], { build: 'SOME-OTHER-BUILD' });
eq(AB21b.verdict, 'STOP', 'AB21b a build mismatch is a STOP');
eq(AB21b.stop_reasons, ['BUILD_DRIFTED'], 'AB21c named BUILD_DRIFTED');
eq(AB21b.live_state_confirmation, null,
  'AB21d and it refuses before it even reads the table, so there is no confirmation to report');

// ---- AB22 — THE TARGET ROW MOVED. ------------------------------------------------------------------
// The blank-key row is at sheet row 3 while the freeze names row 2. Row 2 exists, so the census does not
// crash on a missing row - it reads the row that IS at 2, finds a different fingerprint, and refuses.
var AB22 = abRun([abFull(), abLive({ created_at: '2026-06-12' })], { target_row_number: 2 });
eq(AB22.verdict, 'STOP', 'AB22 a moved target row is a STOP');
ok(AB22.stop_reasons.indexOf('LIVE_STATE_DRIFTED:target_row_fingerprint') >= 0,
  'AB22a on the row fingerprint of whatever is at the frozen row number now', AB22.stop_reasons);
ok(failed(AB22).indexOf('the_one_fault_is_still_a_blank_primary_key_on_the_frozen_row') >= 0,
  'AB22b and the fault-location predicate fails by name', failed(AB22));
// AND THE ROW GENUINELY ABSENT, which is a different stop.
var AB22c = abRun([abLive(), abFull()], { target_row_number: 99 });
eq(AB22c.verdict, 'STOP', 'AB22c a frozen row number that no longer exists is a STOP');
ok(AB22c.stop_reasons.indexOf('TARGET_ROW_MISSING') >= 0,
  'AB22d named TARGET_ROW_MISSING rather than reported as a fingerprint mismatch', AB22c.stop_reasons);

// ---- AB23 — A SECOND BLANK KEY APPEARS. ------------------------------------------------------------
// The freeze says exactly one fault. Two means the table changed in a way the evidence does not cover, and
// which of the two blanks is "the target" is no longer a question this census may answer.
var AB23 = abRun([abLive(), abLive({ qty: 7, before_current_stock: 1, after_current_stock: 8,
  created_at: '2026-06-13' }), abFull()], { blank_id_count: 1 });
eq(AB23.verdict, 'STOP', 'AB23 a second blank primary key is a STOP');
ok(AB23.stop_reasons.indexOf('LIVE_STATE_DRIFTED:blank_id_count') >= 0
  && AB23.stop_reasons.indexOf('THE_FAULT_COUNT_IS_NO_LONGER_ONE') >= 0,
  'AB23a named on both the count and the fault total', AB23.stop_reasons);
eq([AB23.selected_candidate, AB23.operator_questions], [null, null],
  'AB23b and no conclusion is published');

// ---- AB24 — THE MOVEMENT TYPE IS NO LONGER BLANK. --------------------------------------------------
// Somebody typed a movement_type between R4E and now. That is the single most important fact about this row
// and the freeze pins it, so the census must not carry on reasoning about a row that has been changed.
var AB24 = abRun([abLive({ movement_type: 'manual_adjustment' }), abFull()],
  { target_movement_type_is_blank: true });
eq(AB24.verdict, 'STOP', 'AB24 a movement_type that is no longer blank is a STOP');
ok(AB24.stop_reasons.indexOf('LIVE_STATE_DRIFTED:target_movement_type_is_blank') >= 0,
  'AB24a named on the movement_type itself', AB24.stop_reasons);

// ---- AB25 — THE READ FAILS. "I COULD NOT LOOK" IS NOT "I LOOKED AND FOUND NOTHING". ----------------
var AB25 = abRun([abLive(), abFull()], null, null, function (w) {
  w.sheets['factory_stock_movements'].getDataRange = function () {
    throw new Error('transient sheet read failure'); };
});
eq(AB25.verdict, 'STOP', 'AB25 an unreadable movement table is a STOP');
ok(AB25.stop_reasons.indexOf('SHEET_PRESENT_BUT_UNREADABLE') >= 0,
  'AB25a named as present-but-unreadable rather than as an empty table', AB25.stop_reasons);
eq([AB25.chronology, AB25.candidates.length, AB25.operator_questions], [null, 0, null],
  'AB25b with no chronology, no candidates and no questions');
abZeroWrite(AB25, 'AB25c:');
// AND THE SHEET ABSENT ALTOGETHER.
var AB25d = abRun([abLive(), abFull()], null, { movements: null });
eq(AB25d.verdict, 'STOP', 'AB25d an absent movement table is a STOP');
ok(AB25d.stop_reasons.indexOf('SHEET_ABSENT') >= 0, 'AB25e named SHEET_ABSENT', AB25d.stop_reasons);

// ---- AB26 — THE CROSS-TABLE READ: PRESENT, ABSENT AND UNREADABLE ARE THREE ANSWERS. ----------------
// "There is no import-audit table" and "the import-audit table has no matching row" are different answers to
// the provenance question and only one of them is evidence. An absent table is reported absent - never
// created, never filled, never inferred to be empty, and no job is triggered to produce it.
var AB26 = abRun([abLive(), abFull()], null,
  { overseas: [{ warehouse_id: WHF, sku: SKU, wh_available_stock: 12000 }] });
ok(AB26.cross_table.tables_examined >= 13,
  'AB26 every candidate provenance table is examined', AB26.cross_table.tables_examined);
ok(AB26.cross_table.tables_absent.indexOf('purchase_orders') >= 0
  && AB26.cross_table.tables_absent.indexOf('shipments') >= 0
  && AB26.cross_table.tables_absent.indexOf('reservations') >= 0,
  'AB26a and the ones that do not exist are reported ABSENT', AB26.cross_table.tables_absent);
eq(AB26.tables_created, 0, 'AB26b nothing was created to fill them');
eq(AB26.jobs_triggered, 0, 'AB26c and no job was triggered');
ok(String(AB26.cross_table.read_rule).indexOf('never') > 0,
  'AB26d with the rule stated in the output', AB26.cross_table.read_rule);
ok(AB26.cross_table.tables_with_a_hit.indexOf('overseas_inventory_snapshot') >= 0,
  'AB26e the seeded same-sku snapshot row is found', AB26.cross_table.tables_with_a_hit);
ok(AB26.cross_table.markers.indexOf(String(SKU).toLowerCase()) >= 0
  && AB26.cross_table.markers.indexOf(String(WHF).toLowerCase()) >= 0
  && AB26.cross_table.markers.indexOf('12000') >= 0
  && AB26.cross_table.markers.indexOf('1000') >= 0
  && AB26.cross_table.markers.indexOf('2026-06-12') >= 0,
  'AB26f searched on the sku, the warehouse, both quantities and the date',
  AB26.cross_table.markers);
var AB26g = AB26.cross_table.per_table.filter(function (e) {
  return e.table === 'overseas_inventory_snapshot'; })[0];
ok(AB26g.hits[0].one_based_sheet_row_number === 2
  && AB26g.columns_that_matched.length >= 2,
  'AB26g and a hit carries its sheet row and the columns that matched', AB26g);
// A CROSS-TABLE HIT IS PROVENANCE, NOT A CLASSIFICATION. It names where to look; it does not vote.
var AB26ev = AB26.evidence.filter(function (e) { return e.source === 'CROSS_TABLE_EVENT'; });
eq([AB26ev[0].supports, AB26ev[0].contradicts], [[], []],
  'AB26h a marker hit supports no candidate on its own', AB26ev[0]);

// ---- AB27 — NO CROSS-TABLE SOURCE AT ALL. ----------------------------------------------------------
var AB27 = abRun([abLive(), abFull()], null, { overrideAudit: null });
ok(AB27.cross_table.tables_absent.indexOf('factory_stock_override_audit') >= 0,
  'AB27 an absent audit table is listed absent', AB27.cross_table.tables_absent);
AB27.candidates.forEach(function (c) {
  ok(c.missing_evidence.length > 0,
    'AB27a.' + c.number + ' and every candidate names what it is missing: ' + c.candidate,
    c.missing_evidence);
});

// ---- AB28 — THE FOUR CANDIDATES, ALL OF THEM, EVERY TIME. ------------------------------------------
// Not "the plausible ones". A candidate with nothing supporting it is still measured and published, because
// an operator needs to see that it was considered and what it would have taken.
eq(AB1.candidates.map(function (c) { return c.candidate; }),
  ['INITIAL_BALANCE_SET', 'CURRENT_DELTA_FROM_BEFORE_AFTER', 'CURRENT_DELTA_FROM_QTY',
    'INVALID_NON_LEDGER_ROW'], 'AB28 all four candidates, in a stable order');
eq(AB1.candidates.map(function (c) { return c.number; }), [1, 2, 3, 4], 'AB28a numbered 1 to 4');
eq(AB1.computed, { delta_from_the_before_after_pair: 11000, after_implied_by_qty: 13000,
  qty: 12000, before_current_stock: 1000, after_current_stock: 12000 },
  'AB28b and the three arithmetics the task named: 12000, 11000 and 13000');
eq(AB1.candidates[0].authoritative_ending_balance, 12000,
  'AB28c candidate 1 states the authoritative ending balance');
eq(AB1.candidates[1].computed_delta, 11000, 'AB28d candidate 2 states 12000 - 1000 = 11000');
eq(AB1.candidates[2].expected_after, 13000, 'AB28e candidate 3 states 1000 + 12000 = 13000');
eq(AB1.candidates[2].implies_wrong_cell, 'after_current_stock (it would have to become 13000)',
  'AB28f and names the cell each reading would make wrong');
AB1.candidates.forEach(function (c) {
  ok(S1has(c, 'supporting_evidence') && S1has(c, 'contradicting_evidence')
    && S1has(c, 'downstream_balance_impact') && S1has(c, 'subsequent_chain_compatibility')
    && S1has(c, 'current_factory_stock_compatibility') && S1has(c, 'confidence_basis')
    && S1has(c, 'missing_evidence'),
    'AB28g.' + c.number + ' ' + c.candidate + ' carries all seven required readings',
    Object.keys(c));
});
function S1has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
ok(String(AB1.candidates[3].downstream_balance_impact).indexOf('unknown_type row') > 0,
  'AB28h and candidate 4 states what the reconciliation already does with this row',
  AB1.candidates[3].downstream_balance_impact);

// ---- AB29 — DOES THE LEDGER NEED THIS ROW AT ALL? --------------------------------------------------
// §4.4 as a measurement: remove the target from the chronology and re-check the overlaps. If the rows either
// side join up directly, the target carries no part of the balance.
var AB29 = abRun([abLive(), abFull({ factory_stock_movement_id: 'FSMV-000000E5',
  created_at: '2026-06-01T00:00:00Z', movement_date: '2026-06-01',
  before_current_stock: 800, after_current_stock: 1000, qty: 200 }),
  abFull({ before_current_stock: 1000, after_current_stock: 1500, qty: 500 })]);
eq(AB29.chain_without_the_target.neighbours_overlap_each_other_directly, true,
  'AB29 the rows either side of the target overlap each other directly');
var AB29ev = AB29.evidence.filter(function (e) {
  return e.source === 'LEDGER_CHAIN_OVERLAP'
    && e.supports.indexOf('INVALID_NON_LEDGER_ROW') >= 0; });
ok(AB29ev.length >= 1, 'AB29a which is evidence that it is not a ledger row', AB29.evidence);
// AND THE OPPOSITE: a load-bearing row cannot be dismissed.
var AB29b = abRun([abLive(), abFull()]);
eq(AB29b.chain_without_the_target.removing_it_breaks_a_link, false,
  'AB29b a two-row chain has no link to break');
eq(AB29b.chain_without_the_target.neighbours_overlap_each_other_directly, null,
  'AB29c and with the target first there is nothing to bridge, which stays null rather than false');
eq(AB29b.chain_without_the_target.neighbours_overlap_state,
  'NOT_APPLICABLE_THE_TARGET_ROW_IS_FIRST_OR_LAST_IN_THE_CHAIN',
  'AB29c1 and R4G makes the null say which of the several nulls it is');
// AND THIS IS A WORLD THAT REACHES READY ON "NOT A LEDGER ROW". The chain says the row took no effect and
// the writer contract says no shipped writer produced it: two independent sources, nothing contradicting.
// Worth asserting, because it is the one candidate whose repair is not a cell edit at all.
eq(AB29.verdict, 'READY_FOR_LEGACY_ROW_REPAIR_DECISION',
  'AB29d a row the ledger does not need, that no writer could have written, reaches READY',
  AB29.verdict_detail);
eq(AB29.selected_candidate, 'INVALID_NON_LEDGER_ROW', 'AB29e on candidate 4');
eq(AB29.candidates[3].independent_supporting_sources.sort(),
  ['LEDGER_CHAIN_OVERLAP', 'WRITER_CONTRACT'], 'AB29f named by both sources');
eq(AB29.proposed_repair_fields.implies_wrong_cell, 'none - the row itself is the error',
  'AB29g and the proposal names no cell, because this reading edits none');
ok(String(AB29.candidates[3].downstream_balance_impact).indexOf('neither adds nor drops') > 0,
  'AB29h while stating what the reconciliation already does with it today',
  AB29.candidates[3].downstream_balance_impact);

// ---- AB34 - THE BOUND HOLDS ON A DELIBERATELY LARGE WORLD, AND NOTHING IS WITHHELD. ----------------
// R1's lesson and R2's: the line budget exists because the logger truncates, and an unbounded CHUNK COUNT
// is no more readable than one oversized line. Every section here is bounded by construction - the
// chronology is reported as counts, the sibling and cross-table lists are sliced - so the test is that a
// world big enough to break a naive emitter changes nothing about the log.
var AB34rows = [abLive()];
for (var ab34 = 1; ab34 <= 40; ab34++) {
  AB34rows.push(abFull({ factory_stock_movement_id: 'FSMV-' + ('0000000' + ab34).slice(-8),
    before_current_stock: 12000 + ab34 * 10, after_current_stock: 12010 + ab34 * 10, qty: 10,
    created_at: '2026-07-' + ('0' + ((ab34 % 28) + 1)).slice(-2) + 'T00:00:00Z',
    movement_date: '2026-07-' + ('0' + ((ab34 % 28) + 1)).slice(-2),
    note: 'a note long enough to matter when forty of them are in one payload ' + ab34 }));
}
for (var ab34b = 1; ab34b <= 30; ab34b++) {
  AB34rows.push(abSibling({ sku: 'BATCH-SKU-' + ab34b,
    factory_stock_movement_id: 'FSMV-B' + ('000000' + ab34b).slice(-7) }));
}
var AB34over = [];
for (var ab34c = 1; ab34c <= 25; ab34c++) {
  AB34over.push({ warehouse_id: WHF, sku: SKU, wh_available_stock: 12000 });
}
var AB34 = abRun(AB34rows, null, { overseas: AB34over });
eq(AB34.verdict === 'STOP', false, 'AB34 the census completes on a 71-row table', AB34.stop_reasons);
ok(maxLogBytes(AB34.world) <= 3000,
  'AB34a and every emitted line is still inside the 3000-byte bound', maxLogBytes(AB34.world));
function abProvTags(w) {
  return abTags(w).filter(function (g) { return g.indexOf('s1_provenance') === 0; });
}
eq(abProvTags(AB34.world).filter(function (g) { return g.indexOf('_withheld') > 0; }), [],
  'AB34b with no provenance section withheld for being oversized');
eq(abProvTags(AB34.world).filter(function (g) { return /_\d+_of_\d+$/.test(g)
  && g.indexOf('operator_questions') === -1; }), [],
  'AB34c and none needed segmenting, because each one is bounded by construction');
// A CAPPED VALUE AND A TRUNCATED LINE ARE NOT THE SAME THING, and my first assertion here conflated them.
// A line the logger cuts is a wrong value nobody was told about; a value S1_cap_ shortens carries the
// marker and the byte count it dropped, which is an honest summary. Six of those on this world, and the
// requirement is that every one of them is MARKED - not that none exists.
var AB34d = (AB34.world.log || []).filter(function (l) {
  return String(l).indexOf('[S1] s1_provenance') === 0 && String(l).indexOf('…[+') >= 0; });
ok(AB34d.length > 0, 'AB34d long values are capped on a world this size', AB34d.length);
AB34d.forEach(function (l, i) {
  ok(/…\[\+\d+\]/.test(String(l)),
    'AB34d.' + (i + 1) + ' and every capped value carries the marker and the dropped byte count');
});
// THE HIT AND CANDIDATE LISTS ARE CAPPED AND SAY SO, rather than being cut silently.
var AB34e = abPayload(AB34.world, 's1_provenance_cross_table_evidence');
var AB34f = AB34e.per_table.filter(function (e) {
  return e.table === 'overseas_inventory_snapshot'; })[0];
ok(AB34f && AB34f.hits_total === 25 && AB34f.hits_shown === 6 && AB34f.hits_withheld === 19,
  'AB34e a capped hit list reports the total, the shown and the withheld', AB34f);
var AB34g = abPayload(AB34.world, 's1_provenance_sibling_shape_summary');
ok(AB34g && AB34g.near_shape_match_count === 30 && AB34g.rows.length === 12,
  'AB34f and the sibling summary counts all thirty while listing twelve', AB34g);
abZeroWrite(AB34, 'AB34g:');

// ---- AB30 — THE OPERATOR QUESTIONS, AND WHAT EACH ANSWER COSTS IN CELLS. ---------------------------
// "This needs a human" is not a finding. A question answerable from the operator's own records, with the
// consequence of each answer stated in cells, is.
var AB30 = AB14.operator_questions;
ok(AB30 !== null && AB30.question_count === 3,
  'AB30 a refusal publishes the exact questions', AB30 && AB30.question_count);
eq(AB30.questions.map(function (q) { return q.question_id; }), ['Q1', 'Q2', 'Q3'],
  'AB30a identified so an answer can be given against one');
AB30.questions.forEach(function (q, i) {
  ok(q.options.length >= 2, 'AB30b.' + (i + 1) + ' ' + q.question_id + ' offers options', q.options.length);
  q.options.forEach(function (o, j) {
    ok(String(o.data_impact).length > 40,
      'AB30c.' + (i + 1) + '.' + (j + 1) + ' and every option states its data impact', o.data_impact);
  });
  ok(String(q.why_only_you_can_answer).length > 40,
    'AB30d.' + (i + 1) + ' and says why the database cannot answer it', q.why_only_you_can_answer);
});
ok(String(AB30.questions[0].question).indexOf('CO1100-R') > 0
  && String(AB30.questions[0].question).indexOf('12000') > 0
  && String(AB30.questions[0].question).indexOf('1000') > 0,
  'AB30e Q1 carries the actual measured values, not placeholders', AB30.questions[0].question);
ok(String(AB30.questions[1].options[0].data_impact).indexOf('balance does not move') > 0,
  'AB30f Q2 says which answer moves the balance and which does not');
ok(String(AB30.questions[2].why_only_you_can_answer).indexOf('SILENCES') > 0,
  'AB30g and Q3 names the silencing hazard of keying the row before classifying it',
  AB30.questions[2].why_only_you_can_answer);
ok(String(AB30.note).indexOf('questions, not proposals') > 0,
  'AB30h with the whole block marked questions rather than proposals', AB30.note);
// NO PLACEHOLDERS ANYWHERE. R4C's rule, applied to this census's own prose.
var AB30i = JSON.stringify(AB30);
eq(/<[a-z_]+>/.test(AB30i), false, 'AB30i and no <...> placeholder survives into the questions');

// ---- AB31 — THE LOG: THE NAMED LINES, EACH BOUNDED, AND THE DETAIL IS IN THEM. ---------------------
// §7. The detail must not be left only in the return value, and it must not arrive as one giant payload
// either - a reader looking for the chain reading should not scroll past the chronology to reach it.
function abTags(w) {
  return (w.log || []).map(function (l) {
    var m = String(l).match(/^\[S1\] (\S+)/); return m ? m[1] : null; }).filter(Boolean);
}
var AB31 = AB13, AB31t = abTags(AB31.world);
['s1_provenance_summary', 's1_provenance_target_row',
  's1_provenance_next_physical_same_pool_movement',
  's1_provenance_next_classifiable_same_pool_movement',
  's1_provenance_next_same_ledger_epoch_movement', 's1_provenance_ledger_epochs',
  's1_provenance_chain_continuity', 's1_provenance_sibling_shape_summary',
  's1_provenance_cross_table_evidence', 's1_provenance_candidate_1', 's1_provenance_candidate_2',
  's1_provenance_candidate_3', 's1_provenance_candidate_4', 's1_provenance_verdict']
  .forEach(function (t) {
    ok(AB31t.indexOf(t) >= 0, 'AB31 the log carries ' + t, AB31t);
  });
ok(maxLogBytes(AB31.world) <= 3000,
  'AB31a and every emitted line is inside the 3000-byte bound', maxLogBytes(AB31.world));
ok(AB31.log_bytes_max <= 3000 && AB31.log_bytes_max > 0,
  'AB31b which the census measures and reports about itself', AB31.log_bytes_max);
eq(AB31t.filter(function (t) { return t.indexOf('s1_provenance_operator_questions') === 0; }).length, 0,
  'AB31c a READY run emits NO operator-question lines');
// AND A REFUSAL EMITS THEM, one line per question, numbered.
var AB31d = abTags(AB14.world).filter(function (t) {
  return t.indexOf('s1_provenance_operator_questions') === 0; });
eq(AB31d, ['s1_provenance_operator_questions_1_of_3', 's1_provenance_operator_questions_2_of_3',
  's1_provenance_operator_questions_3_of_3'],
  'AB31d while a refusal emits one numbered line per question');
ok(maxLogBytes(AB14.world) <= 3000,
  'AB31e also inside the bound', maxLogBytes(AB14.world));
// THE DETAIL IS ACTUALLY IN THE LINES. Not a summary that points at the return value.
function abPayload(w, tag) {
  var pre = '[S1] ' + tag + ' ';
  var hit = (w.log || []).filter(function (l) { return String(l).indexOf(pre) === 0; });
  return hit.length ? JSON.parse(String(hit[0]).slice(pre.length)) : null;
}
var AB31f = abPayload(AB13.world, 's1_provenance_chain_continuity');
ok(AB31f && AB31f.current && AB31f.current.agree === 1 && AB31f.balance
  && AB31f.balance.factory_stock_current === 12500,
  'AB31f the chain line carries the per-axis counts and the balance, not a pointer to them', AB31f);
var AB31g = abPayload(AB13.world, 's1_provenance_candidate_2');
ok(AB31g && AB31g.computed_delta === 11000 && AB31g.supporting.length === 3
  && AB31g.supporting.filter(function (x) { return x.independent; }).length === 2
  && AB31g.independent_supporting_sources.length === 2 && AB31g.missing_evidence,
  'AB31g and each candidate line carries its arithmetic, its evidence and its gaps', AB31g);
var AB31h = abPayload(AB13.world, 's1_provenance_next_classifiable_same_pool_movement');
ok(AB31h && AB31h.row === 3 && AB31h.movement_id === 'FSMV-000000A1'
  && AB31h.its_before_equals_the_targets_after === true,
  'AB31h and the next-movement line answers §1.4 directly', AB31h);
var AB31i = abPayload(AB20.world, 's1_provenance_verdict');
ok(AB31i && AB31i.verdict === 'STOP' && AB31i.stop_reasons.length > 0
  && AB31i.proposed_repair_fields === null,
  'AB31i a STOP verdict line carries the reasons and no proposal', AB31i);
// THE OVERSIZED CASE IS SEGMENTED, NOT TRUNCATED. Driven by shrinking the bound rather than by inventing
// a pathological world: a 50-row pool would put the whole chronology in one line otherwise.
var AB31j = abRun([abLive(), abFull()], null, null, null, null);
eq(typeof AB31j.lines_emitted, 'number', 'AB31j the census counts the lines it emitted');
ok(AB31j.lines_emitted >= 11, 'AB31k at least one per named section', AB31j.lines_emitted);

// ---- AB32 — THERE IS NO EXECUTABLE REPAIR ROUTE, AND THAT IS CHECKED ON THE SOURCE. ---------------
// The task's hard boundary. Asserted structurally rather than by absence of evidence: the census's own
// source is read and every write API is looked for in it.
var AB32src = S1_BARE.split(NL + 'function RUN_S1_FACTORY_MOVEMENT_LEGACY_PROVENANCE_CENSUS')[1];
AB32src = AB32src ? AB32src.split(NL + 'function RUN_S1_MANIFEST_S')[0] : '';
ok(AB32src.length > 2000, 'AB32 the provenance census source was located for inspection', AB32src.length);
['setValue', 'setValues', 'appendRow', 'deleteRow', 'insertSheet', 'deleteSheet', 'removeSheet',
  'setFormula', 'setName', 'getRange', 'LockService'].forEach(function (api) {
  eq(AB32src.indexOf(api), -1, 'AB32a.' + api + ' the provenance census source contains no ' + api);
});
// The whole FILE still has exactly two, both from R4E's authorized backfill, neither in this round's code.
eq((S1_BARE.match(/setValue\(/g) || []).length, 2,
  'AB32b and the file still has exactly two setValue sites, both R4E\'s');
eq(AB32src.indexOf('S1_movProposedId_'), -1,
  'AB32c the census never mints or proposes a primary key');
['authorization_wording', 'freeze_paste_block', 'frozen_before'].forEach(function (k) {
  eq(AB32src.indexOf(k), -1, 'AB32d.' + k + ' and it writes no ' + k + ': there is nothing to sign');
});
eq(AB13.repair_route.indexOf('NONE'), 0, 'AB32e the output states the repair route is NONE');
ok(String(AB13.repair_route).indexOf('a PERSON may now decide, never that a tool may act') > 0,
  'AB32f and what READY means, in words', AB13.repair_route);
// AND THE ENTRY POINT COUNT. R4F added one, read-only; R4H added two more - a read-only manifest and the
// one tool in this file that may empty a range. The count is asserted so a third writer cannot appear
// without this line changing.
eq((S1_BARE.match(/^function RUN_S1_[A-Z_]+/gm) || []).length, 12,
  'AB32g twelve public entry points: nine from R4E and before, R4F\'s read-only census, and R4H\'s two');

// ---- AB33 — THE FIELD CONTRACT IS R4E's, NOT A SECOND OPINION. ------------------------------------
// A second required-ness table would be a second opinion, and the first thing two opinions do is disagree.
eq(AB1.field_audit.contract_column_count, 15, 'AB33 the census judges against R4E\'s fifteen-column contract');
eq(AB1.field_audit.required_blank, ['factory_stock_movement_id', 'movement_type'],
  'AB33a and reaches R4E\'s answer about which required fields are blank');
eq(AB1.field_audit.writer_populated_blank,
  ['movement_date', 'related_entity_type', 'related_entity_id', 'before_reserved_stock',
    'after_reserved_stock', 'note', 'created_by'],
  'AB33b plus the seven writer-populated columns that are blank');
eq(AB1.axis_audit.axis, 'UNKNOWN_BECAUSE_MOVEMENT_TYPE_IS_BLANK',
  'AB33c the axis is unknown because the selector is blank');
eq(AB1.axis_audit.readings.if_current_axis,
  { expected_qty: 11000, observed_qty: 12000, agrees: false },
  'AB33d the current reading is computed and disagrees');
eq(AB1.axis_audit.readings.if_reserved_axis, null,
  'AB33e and the reserved reading is unevaluable, which is null rather than false');
eq(AB1.axis_audit.vocabulary_authority_available, true,
  'AB33f with 21_\'s vocabulary actually loaded, so an absent authority is not mistaken for a bad value');
// The writer-signature table is read off the shipped source, and these two facts anchor it there.
ok(G21V.indexOf("movement_type: 'manual_adjustment'") > 0,
  'AB33g 21_ really does write movement_type as that literal in the adjust path');
ok(G21V.indexOf("qty: afterCurrent - beforeCurrent") > 0,
  'AB33h and really does write qty as afterCurrent - beforeCurrent in the import path');
ok(G21V.indexOf("if (!note) return jsonResponse_({ success: false, error: 'Note is required' })") > 0,
  'AB33i and really does validate note as required, which is why blank note eliminates that writer');

// ================================================================================================================
section('AC — S1-R4G: the epoch boundary, and a balance that reconciles somebody else');

// ======================================================================================================
// THE LIVE SCENE, REPRODUCED CELL FOR CELL.
//
//   sheet row 2  (the target)  id blank, movement_type blank, qty 12000, before 1000, after 12000
//   sheet row 3                id FSMV-e5bf1d8f, inventory_import, qty 2210, before 0, after 2210
//   factory_stock              fac_current_stock 2210
//
// R4F published four contradictions about this table and every one of them came from the same root: it
// had no way to say that row 3's `before_current_stock` of 0 might not be a reading of anything.
//
//   1. all four candidates said "no classifiable movement follows this one in this pool" - about a table
//      whose very next row is `inventory_import`, which R4F itself printed two lines above;
//   2. all four then asked for that row in `missing_evidence`;
//   3. `removing_it_repairs_a_break: true`, blaming the target row for a boundary it is upstream of;
//   4. the factory_stock agreement - which reconciles row 3's epoch - was scored as SUPPORTING two of
//      the four classifications of row 2.
//
// Section AC is that scene, and every assertion below is one of those four not happening.
// ======================================================================================================

/** Sheet row 3, exactly as the live table holds it: the pool-creating import signature. */
function acImport(over) {
  var r = { factory_stock_movement_id: 'FSMV-e5bf1d8f', movement_date: '2026-06-20',
    sku: SKU, warehouse_id: WHF, movement_type: 'inventory_import', qty: 2210,
    related_entity_type: 'factory_inventory_import', related_entity_id: 'FIB-20260620-0001',
    before_current_stock: 0, after_current_stock: 2210,
    before_reserved_stock: 0, after_reserved_stock: 0,
    note: '', created_by: 'operation-system', created_at: '2026-06-20T00:00:00Z' };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
/** The live factory_stock: one pool row holding 2210, which is row 3's `after` and not row 2's. */
var AC_POOL_ = [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2210, fac_reserved_stock: 0 }];
function acRun(rows, pool, pinOver) {
  return abRun(rows, pinOver, { factory_stock: pool === undefined ? AC_POOL_ : pool });
}

var AC = acRun([abLive(), acImport()]);

// ---- AC1 — the scene is the scene. -----------------------------------------------------------------
eq(AC.target_row_number, 2, 'AC1 the target is sheet row 2');
eq([AC.target_row.qty, AC.target_row.before_current_stock, AC.target_row.after_current_stock],
  [12000, 1000, 12000], 'AC1a with the live quantities');
eq([AC.target_row.movement_id, AC.target_row.movement_type], [null, null],
  'AC1b and both the key and the type still blank');
eq(AC.chronology.entry_count, 2, 'AC1c two movements in this pool');
eq(AC.balance_reconcile.factory_stock_current, 2210, 'AC1d and factory_stock holds 2210');

// ---- AC2 — REQUIREMENT 1. A FOUND ROW IS NEVER REPORTED AS AN ABSENT ONE. --------------------------
ok(AC.next_classifiable_same_pool_movement !== null,
  'AC2 the next classifiable movement in this pool IS found');
eq(AC.next_classifiable_same_pool_movement.one_based_sheet_row_number, 3,
  'AC2a and it is sheet row 3');
eq([AC.next_classifiable_same_pool_movement.movement_id,
  AC.next_classifiable_same_pool_movement.movement_type],
  ['FSMV-e5bf1d8f', 'inventory_import'], 'AC2b with its key and its type');
var AC2c = AC.candidates.filter(function (c) {
  return String(c.subsequent_chain_compatibility).indexOf('NO_LATER_CLASSIFIABLE_MOVEMENT') === 0
    || String(c.subsequent_chain_compatibility).indexOf('NO_LATER_MOVEMENT') === 0; });
eq(AC2c.map(function (c) { return c.candidate; }), [],
  'AC2c so NO candidate claims that no classifiable movement follows - the R4F sentence, four times over',
  AC.candidates.map(function (c) { return c.subsequent_chain_compatibility; }));
var AC2d = AC.candidates.filter(function (c) {
  return (c.missing_evidence || []).filter(function (m) {
    return String(m).indexOf('A_LATER_CLASSIFIABLE_MOVEMENT_IN_THIS_POOL') === 0
      || String(m).indexOf('ANY_LATER_MOVEMENT_IN_THIS_POOL') === 0; }).length > 0; });
eq(AC2d.map(function (c) { return c.candidate; }), [],
  'AC2d and none asks for the row it just printed',
  AC.candidates.map(function (c) { return c.missing_evidence; }));
// WHAT IS ACTUALLY MISSING IS A COMPARABLE ROW, AND THAT IS WHAT IT ASKS FOR.
AC.candidates.forEach(function (c, i) {
  ok((c.missing_evidence || []).filter(function (m) {
    return String(m).indexOf('A_LATER_MOVEMENT_IN_THE_TARGETS_OWN_LEDGER_EPOCH') === 0; }).length === 1,
    'AC2e.' + (i + 1) + ' candidate ' + c.candidate
      + ' asks for a movement in the target\'s OWN epoch instead', c.missing_evidence);
});

// ---- AC3 — REQUIREMENT 2. THE THREE SUCCESSOR QUESTIONS, AND HERE THEY DIFFER. --------------------
eq(AC.next_physical_same_pool_movement.one_based_sheet_row_number, 3,
  'AC3 the next PHYSICAL movement is row 3');
eq(AC.next_classifiable_same_pool_movement.one_based_sheet_row_number, 3,
  'AC3a the next CLASSIFIABLE movement is also row 3');
eq(AC.next_same_ledger_epoch_movement, null,
  'AC3b but the next movement in the target\'s OWN LEDGER EPOCH is null - and that is the difference'
  + ' R4F\'s single variable could not express');
eq(AC.next_movements.a_later_movement_exists_in_this_pool, true, 'AC3c a later movement exists');
eq(AC.next_movements.a_later_classifiable_movement_exists_in_this_pool, true,
  'AC3d a later CLASSIFIABLE movement exists');
eq(AC.next_movements.a_later_movement_exists_in_the_targets_own_epoch, false,
  'AC3e and yet none of them is in the target\'s own epoch. All three facts are true at once.');
eq(AC.chain_reading_state, 'NOT_COMPARABLE_ACROSS_A_BOUNDARY',
  'AC3f so the chain reading is NOT_COMPARABLE rather than NOT_MEASURABLE');
AC.candidates.forEach(function (c, i) {
  ok(String(c.subsequent_chain_compatibility)
    .indexOf('NOT_COMPARABLE_ACROSS_A_LEDGER_EPOCH_BOUNDARY') === 0,
    'AC3g.' + (i + 1) + ' and candidate ' + c.candidate + ' says exactly that',
    c.subsequent_chain_compatibility);
  ok(String(c.subsequent_chain_compatibility).indexOf('EXISTS') > 0,
    'AC3h.' + (i + 1) + ' naming that the later movement EXISTS');
});

// ---- AC4 — REQUIREMENT 3. THE EPOCH DETERMINATION, FROM THE WRITER CONTRACT. ---------------------
eq(AC.ledger_epochs.epoch_count, 2, 'AC4 this pool holds TWO ledger epochs');
eq(AC.ledger_epochs.target_epoch_index, 1, 'AC4a the target row is in epoch 1');
eq(AC.ledger_epochs.last_entry_epoch_index, 2, 'AC4b and the chain ends in epoch 2');
eq(AC.ledger_epochs.target_is_in_the_last_epoch, false, 'AC4c so the target is not in the last epoch');
eq(AC.ledger_epochs.boundaries.length, 1, 'AC4d with exactly one boundary between them');
var ACb = AC.ledger_epochs.boundaries[0];
eq([ACb.at_sheet_row, ACb.from_sheet_row], [3, 2], 'AC4e from sheet row 2 into sheet row 3');
eq(ACb.state, 'LEDGER_EPOCH_BOUNDARY', 'AC4f classified as a ledger epoch boundary');
eq(ACb.kind, 'POOL_CREATION_OR_UNRECORDED_BALANCE_CHANGE',
  'AC4g whose kind names BOTH readings, because the ledger cannot settle which it is');
eq([ACb.earlier_after_current, ACb.later_before_current], [12000, 0],
  'AC4h and carries the two numbers 12000 -> 0 it was decided from');
// THE SIGNATURE, AND THE SHIPPED LINES IT IS READ OFF.
var ACsig = AC.chain_continuity.links[0].current.epoch_boundary.signature;
eq(ACsig.matches, true, 'AC4i row 3 carries the pool-creating write\'s signature');
eq(ACsig.before_current_is_the_create_path_literal, true,
  'AC4j its before_current_stock is the create-path literal 0');
eq(ACsig.movement_type_is_known, true,
  'AC4k and its type is in the shipped vocabulary, so a shipped writer could have put it there');
eq(ACsig.both_axes_open_at_zero, true,
  'AC4l with BOTH axes opening at zero, which is what both writers do on that branch');
ok(ACsig.writer_citations.join(' ').indexOf('244-247') > 0
  && ACsig.writer_citations.join(' ').indexOf('959-960') > 0,
  'AC4m citing factoryStockApplyDeltaTx_ 21_:244-247 AND the import commit 21_:959-960 - the rule is not'
  + ' inventory_import-specific, because BOTH current-axis writers take that branch', ACsig.writer_citations);
ok(AC.chain_continuity.links[0].current.epoch_boundary.both_readings_require_something_unrecorded === true,
  'AC4n and the honest limit is published: both readings need something the record does not contain');
// THE TWO SHIPPED LINES REALLY DO SAY THAT. Asserted against 21_'s own source, so the contract this
// whole section rests on is anchored in the file rather than in this file's opinion of it.
ok(G21V.indexOf('beforeCurrent = 0; beforeReserved = 0; created = true') > 0,
  'AC4o 21_ really does set beforeCurrent = 0 on the branch that creates the pool row');
ok(G21V.indexOf('var beforeCurrent = ex ? ex.current : 0') > 0,
  'AC4p and the import commit really does default it to 0 when there is no pool row to read');

// ---- AC5 — REQUIREMENT 4a. THIS IS NOT A DELTA CHAIN BREAK. --------------------------------------
eq(AC.chain_continuity.current_axis.disagree, 0,
  'AC5 ZERO comparable disagreements on the current axis');
eq(AC.chain_continuity.current_axis.epoch_boundary, 1,
  'AC5a because the one non-agreeing link is an epoch boundary');
eq(AC.chain_continuity.first_break_at_position, null,
  'AC5b so there is no first break to point at');
eq(AC.chain_continuity.first_epoch_boundary_at_position, 2,
  'AC5c and the boundary is reported at its own position under its own name');
eq(AC.chain_continuity.the_current_chain_crosses_a_ledger_epoch_boundary, true,
  'AC5d the chain says plainly that it crosses one');
eq(AC.chain_continuity.chain_is_continuous_on_the_current_axis, false,
  'AC5e it is still NOT called continuous - a chain with a boundary in it has not been shown to join up');
eq(AC.chain_continuity.every_comparable_link_agrees_on_the_current_axis, false,
  'AC5f and the weaker claim is false too, because there was no comparable link to agree');
eq(AC.chain_continuity.links[0].current.state, 'LEDGER_EPOCH_BOUNDARY',
  'AC5g the link itself is named, not scored');
eq(AC.chain_continuity.links[0].current.comparable, false, 'AC5h and marked not comparable');
eq(AC.chain_continuity.links[0].current.discriminating, false, 'AC5i and not discriminating');
ok(String(AC.chain_continuity.links[0].current.epoch_boundary.why_not_a_delta_break)
  .indexOf('a break is a disagreement between two readings of one quantity') === 0,
  'AC5j with the reason a boundary is not a break spelled out',
  AC.chain_continuity.links[0].current.epoch_boundary.why_not_a_delta_break);

// ---- AC6 — REQUIREMENT 4b. `removing_target_repairs_break` MUST NOT BE TRUE. --------------------
var ACw = AC.chain_without_the_target;
ok(ACw.removing_it_repairs_a_break !== true,
  'AC6 removing the target row is NOT claimed to repair a break - the flagship R4F false positive',
  ACw.removing_it_repairs_a_break);
eq(ACw.removing_it_repairs_a_break, null,
  'AC6a it is null rather than a bare false, because there was never a break to not-repair');
eq(ACw.removing_it_repairs_a_break_state,
  'NOT_APPLICABLE_THE_ONLY_NON_AGREEING_LINKS_ARE_LEDGER_EPOCH_BOUNDARIES',
  'AC6b with a named NOT_APPLICABLE state');
ok(String(ACw.removing_it_repairs_a_break_why).indexOf('A boundary is not a break') > 0,
  'AC6c and an explicit reason', ACw.removing_it_repairs_a_break_why);
eq([ACw.comparable_breaks_with_the_target, ACw.comparable_breaks_without_the_target], [0, 0],
  'AC6d comparable breaks are zero both with and without the row, which is what makes the claim vacuous');
eq(ACw.with_the_target_row.current_epoch_boundary, 1,
  'AC6e the boundary is counted in its own bucket rather than in the disagreement bucket');

// ---- AC7 — REQUIREMENT 4c. 2210 PROVES THE CURRENT EPOCH AND NOTHING ABOUT ROW 2. --------------
var ACba = AC.balance_reconcile;
eq([ACba.factory_stock_current, ACba.ledger_last_after_current], [2210, 2210],
  'AC7 factory_stock and the ledger\'s last after both hold 2210');
eq(ACba.current_agrees, true, 'AC7a so they agree');
eq(ACba.independent_of_the_target_row, true,
  'AC7b and the agreement IS independent of the target row - the last chain entry is row 3');
eq(ACba.attributable_to_the_target_row, false,
  'AC7c BUT IT IS NOT ATTRIBUTABLE TO IT. Independence and attribution are two different tests, and R4F'
  + ' only had the first.');
eq([ACba.target_epoch_index, ACba.ledger_last_epoch_index], [1, 2],
  'AC7d because the balance reconciles epoch 2 and the target row sits in epoch 1');
eq(ACba.balance_is_in_the_same_epoch_as_the_target, false, 'AC7e stated directly');
ok(String(ACba.why_not_attributable).indexOf('THE_LIVE_BALANCE_RECONCILES_TO_LEDGER_EPOCH_2') === 0,
  'AC7f with the reason naming both epochs', ACba.why_not_attributable);
ok(String(ACba.what_this_proves).indexOf('ONLY_THAT_LEDGER_EPOCH_2_RECONCILES') === 0,
  'AC7g and what_this_proves says only what it proves', ACba.what_this_proves);
// AND THE SCORING. This is the assertion R4F would have failed.
AC.candidates.forEach(function (c, i) {
  eq(c.supporting_sources.indexOf('FACTORY_STOCK_BALANCE'), -1,
    'AC7h.' + (i + 1) + ' FACTORY_STOCK_BALANCE supports candidate ' + c.candidate + ' NOWHERE',
    c.supporting_sources);
  eq(c.contradicting_sources.indexOf('FACTORY_STOCK_BALANCE'), -1,
    'AC7i.' + (i + 1) + ' and contradicts it nowhere either');
});
// IT IS STILL PUBLISHED. Refusing to score it is not the same as hiding it.
var ACbev = AC.evidence.filter(function (e) { return e.source === 'FACTORY_STOCK_BALANCE'; });
eq(ACbev.length, 1, 'AC7j the balance agreement is still published as evidence', AC.evidence);
eq(ACbev[0].discriminates, false, 'AC7k marked as discriminating nothing');
eq([ACbev[0].supports.length, ACbev[0].contradicts.length], [0, 0],
  'AC7l with both of its candidate lists empty');
ok(String(ACbev[0].statement).indexOf('LEDGER EPOCH 2 AND THE TARGET ROW IS IN EPOCH 1') > 0,
  'AC7m and a statement that says which epoch it reconciles', ACbev[0].statement);
AC.candidates.forEach(function (c, i) {
  ok(String(c.current_factory_stock_compatibility).indexOf('NOT_ATTRIBUTABLE') === 0,
    'AC7n.' + (i + 1) + ' candidate ' + c.candidate + ' reads the balance as NOT_ATTRIBUTABLE',
    c.current_factory_stock_compatibility);
  ok((c.missing_evidence || []).filter(function (m) {
    return String(m).indexOf('A_BALANCE_STATEMENT_ATTRIBUTABLE_TO_THE_TARGET_ROWS_OWN_LEDGER_EPOCH') === 0;
  }).length === 1, 'AC7o.' + (i + 1) + ' and asks for one that is attributable');
});

// ---- AC8 — REQUIREMENT 6. ONE SOURCE, ONE SCORE, AND EVERY LISTED ITEM DISCRIMINATES. ----------
AC.candidates.forEach(function (c, i) {
  eq(c.no_source_counted_more_than_once, true,
    'AC8.' + (i + 1) + ' candidate ' + c.candidate + ' counts no evidence source twice',
    c.supporting_source_multiplicity);
  eq(c.every_listed_evidence_item_discriminates_this_candidate, true,
    'AC8a.' + (i + 1) + ' and every item in its two lists actually discriminates it');
  eq(c.independent_supporting_source_count, c.independent_supporting_sources.length,
    'AC8b.' + (i + 1) + ' and the gating count is the number of DISTINCT source names');
});
ok(AC.non_discriminating_evidence_count >= 2,
  'AC8c the non-discriminating items are separated out rather than mixed into support',
  AC.non_discriminating_evidence_count);
eq(AC.discriminating_evidence_count + AC.non_discriminating_evidence_count, AC.evidence_count,
  'AC8d and the two partitions add up to the whole evidence list');
AC.non_discriminating_evidence.forEach(function (e, i) {
  eq([e.supports.length, e.contradicts.length], [0, 0],
    'AC8e.' + (i + 1) + ' each one names no candidate at all');
});

// ---- AC9 — REQUIREMENT 7. THE VERDICT STAYS WITH THE OPERATOR. --------------------------------
eq(AC.verdict, 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED',
  'AC9 row 2 still needs an operator business classification');
eq(AC.selected_candidate, null, 'AC9a with nothing selected');
eq(AC.proposed_repair_fields, null, 'AC9b and no proposed repair fields');
eq(AC.verdict_detail.why, 'NO_CANDIDATE_HAS_TWO_INDEPENDENT_SUPPORTING_SOURCES',
  'AC9c because no candidate reaches two independent sources');
eq(AC.candidates.filter(function (c) {
  return c.independent_supporting_source_count >= 2; }).map(function (c) { return c.candidate; }), [],
  'AC9d measured per candidate, not asserted',
  AC.candidates.map(function (c) { return [c.candidate, c.independent_supporting_source_count]; }));
ok(AC.operator_questions && AC.operator_questions.question_count >= 3,
  'AC9e and the exact questions are published instead',
  AC.operator_questions && AC.operator_questions.question_count);
eq([AC.has_execute_path, AC.proposes_authorized_repair], [false, false],
  'AC9f with no execute path and nothing authorized');
abZeroWrite(AC, 'AC9g');

// ---- AC10 — THE CONTRADICTION SWEEP. NO OUTPUT MAY DENY A FACT THE SAME OUTPUT ASSERTS. --------
// The four R4F defects were all one shape: a claim in one field contradicted a measurement in another.
// So this is checked structurally rather than field by field - the serialized output is searched for
// sentences that the measured facts forbid.
(function () {
  var blob = JSON.stringify({ candidates: AC.candidates, chain: AC.chain_continuity,
    without: AC.chain_without_the_target, balance: AC.balance_reconcile,
    next: AC.next_movements, epochs: AC.ledger_epochs });
  var forbidden = [];
  if (AC.next_classifiable_same_pool_movement !== null) {
    ['NO_LATER_CLASSIFIABLE_MOVEMENT_IN_THIS_POOL', 'NO_LATER_MOVEMENT_IN_THIS_POOL',
      'no classifiable movement follows'].forEach(function (p) {
      if (blob.indexOf(p) >= 0) forbidden.push('claims absence of a found row: ' + p); });
  }
  if (AC.chain_continuity.current_axis.disagree === 0) {
    if (blob.indexOf('"first_break_at_position":2') >= 0) {
      forbidden.push('points at a break position with zero comparable disagreements');
    }
    if (blob.indexOf('"removing_it_repairs_a_break":true') >= 0) {
      forbidden.push('claims a removal repairs a break with zero comparable disagreements');
    }
  }
  if (AC.balance_reconcile.attributable_to_the_target_row === false) {
    if (blob.indexOf('THE_TARGETS_OWN_LEDGER_EPOCH_RECONCILES_TO_THE_LIVE_BALANCE') >= 0) {
      forbidden.push('claims the target\'s own epoch reconciles when the balance is not attributable');
    }
  }
  eq(forbidden, [], 'AC10 the output contains no sentence its own measurements forbid', forbidden);
})();
// AND IN THE LOG, WHICH IS WHAT AN OPERATOR ACTUALLY READS.
var ACtags = abProvTags(AC.world);
['s1_provenance_next_physical_same_pool_movement',
  's1_provenance_next_classifiable_same_pool_movement',
  's1_provenance_next_same_ledger_epoch_movement',
  's1_provenance_ledger_epochs'].forEach(function (t, i) {
  ok(ACtags.indexOf(t) >= 0, 'AC10a.' + (i + 1) + ' the log publishes ' + t, ACtags);
});
var ACp1 = abPayload(AC.world, 's1_provenance_next_classifiable_same_pool_movement');
eq([ACp1.row, ACp1.movement_type], [3, 'inventory_import'],
  'AC10b the classifiable-successor line names row 3 and its type');
eq(ACp1.its_before_equals_the_targets_after, false,
  'AC10c and reports plainly that its before does not equal the target\'s after');
var ACp2 = abPayload(AC.world, 's1_provenance_next_same_ledger_epoch_movement');
eq(ACp2.next, null, 'AC10d while the same-epoch line is null');
ok(String(ACp2.why).indexOf('A LATER CLASSIFIABLE MOVEMENT EXISTS AND IS NOT COMPARABLE') === 0,
  'AC10e and its `why` says the row EXISTS and is not comparable - never that none was found', ACp2.why);
var ACp3 = abPayload(AC.world, 's1_provenance_ledger_epochs');
eq([ACp3.epoch_count, ACp3.target_epoch_index, ACp3.last_entry_epoch_index], [2, 1, 2],
  'AC10f the epoch line carries the two epochs and where the target sits');
eq(ACp3.boundaries.length, 1, 'AC10g with its one boundary');
var ACp4 = abPayload(AC.world, 's1_provenance_chain_continuity');
eq(ACp4.balance.attributable_to_the_target_row, false,
  'AC10h and the chain line carries the attribution verdict, not only the independence one');
eq(ACp4.without_the_target.removing_it_repairs_a_break, null,
  'AC10i with the repair claim null in the log too');
ok(String(ACp4.without_the_target.removing_it_repairs_a_break_state).indexOf('NOT_APPLICABLE') === 0,
  'AC10j and its named state beside it');

// ---- AC11 — REQUIREMENT 5. WHEN IT IS *NOT* A BOUNDARY, SAY WHY THE COMPARISON IS VALID. -------
// The same import row, opening where the target closed. Now it is an ordinary comparable link, and the
// census owes a positive writer-contract reason for comparing across rows at all.
var AC11 = acRun([abLive(), acImport({ before_current_stock: 12000, after_current_stock: 14210,
  qty: 2210 })], [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 14210, fac_reserved_stock: 0 }]);
eq(AC11.ledger_epochs.epoch_count, 1, 'AC11 one epoch when the import opens where the target closed');
eq(AC11.ledger_epochs.boundaries.length, 0, 'AC11a with no boundary');
eq(AC11.chain_continuity.links[0].current.state, 'AGREES', 'AC11b the link agrees');
ok(String(AC11.chain_continuity.links[0].current.comparability_basis)
  .indexOf('BOTH_CELLS_ARE_READINGS_OF_THE_SAME_POOL_QUANTITY') === 0,
  'AC11c and carries the WRITER CONTRACT reason the comparison is legitimate',
  AC11.chain_continuity.links[0].current.comparability_basis);
ok(String(AC11.chain_continuity.links[0].current.comparability_basis).indexOf('257-258') > 0,
  'AC11d citing the shipped lines that READ before_current_stock out of factory_stock');
eq(AC11.next_same_ledger_epoch_movement.one_based_sheet_row_number, 3,
  'AC11e so the same-epoch successor exists here');
eq(AC11.chain_reading_state, 'CONSISTENT', 'AC11f and the chain reading is a real reading');
eq(AC11.balance_reconcile.attributable_to_the_target_row, true,
  'AC11g the balance is now attributable, because it reconciles the target\'s own epoch');
ok(AC11.candidates.filter(function (c) {
  return c.supporting_sources.indexOf('FACTORY_STOCK_BALANCE') >= 0; }).length > 0,
  'AC11h and only NOW may it support a candidate - the gate is the epoch, not the source');

// A REAL ZERO IS NOT A BOUNDARY EITHER. Three rows: the first closes the pool at 0, so the import's 0 is
// a genuine reading and the discriminator says so. This is the (b) branch of §A, tested on its own.
var AC12 = acRun([abLive(), abFull({ factory_stock_movement_id: 'FSMV-000000F1',
  created_at: '2026-06-15T00:00:00Z', movement_date: '2026-06-15',
  before_current_stock: 12000, after_current_stock: 0, qty: -12000 }),
  acImport({ before_current_stock: 0, after_current_stock: 2210, qty: 2210 })]);
eq(AC12.ledger_epochs.epoch_count, 1,
  'AC12 an import opening at 0 after a row that CLOSED at 0 is one epoch, not two');
eq(AC12.chain_continuity.links[1].current.state, 'AGREES', 'AC12a its link agrees');
ok(String(AC12.chain_continuity.links[1].current.comparability_basis).length > 0,
  'AC12b with a comparability basis, because a real zero is a reading like any other');
eq(AC12.next_same_ledger_epoch_movement.one_based_sheet_row_number, 3,
  'AC12c and the target keeps a same-epoch successor');
eq(AC12.balance_reconcile.attributable_to_the_target_row, true,
  'AC12d so the balance is attributable to it');

// AND A GENUINE BREAK IS STILL A GENUINE BREAK. The import opens at a value that is neither 0 nor the
// target's after, so nothing about the create path applies and the disagreement is real.
var AC13 = acRun([abLive(), acImport({ before_current_stock: 9999, after_current_stock: 12209 })],
  [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 12209, fac_reserved_stock: 0 }]);
eq(AC13.ledger_epochs.epoch_count, 1, 'AC13 a non-zero mismatch is not a boundary');
eq(AC13.chain_continuity.links[0].current.state, 'DISAGREES', 'AC13a it is a comparable DISAGREEMENT');
eq(AC13.chain_continuity.current_axis.disagree, 1, 'AC13b counted as one');
eq(AC13.chain_continuity.first_break_at_position, 2, 'AC13c with a real break position');
eq(AC13.chain_continuity.the_current_chain_crosses_a_ledger_epoch_boundary, false,
  'AC13d and no boundary claimed');
ok(String(AC13.chain_continuity.links[0].current.comparability_basis)
  .indexOf('AND THIS LINK IS NOT AN EPOCH BOUNDARY') > 0,
  'AC13e the basis states positively why the boundary reading does not apply here',
  AC13.chain_continuity.links[0].current.comparability_basis);

// ---- AC14 — AN ABSENT VOCABULARY AUTHORITY IS NOT A DECIDED BOUNDARY EITHER. ------------------
// R4E's lesson, applied to R4G's new test. Without 21_ loaded, whether a shipped writer produced row 3
// cannot be established, so the link is NOT_COMPARABLE with its own reason - never a break, and never a
// confirmed boundary. The census must not decide a question its deployment cannot answer.
var AC14 = abRun([abLive(), acImport()], null,
  { factory_stock: AC_POOL_,
    after: 'factoryStockIsKnownMovementType_ = undefined;'
      + ' factoryStockIsCurrentMovement_ = undefined;'
      + ' factoryStockIsReservationMovement_ = undefined;' });
eq(AC14.chain_continuity.links[0].current.state, 'NOT_COMPARABLE',
  'AC14 with no vocabulary authority the link is NOT_COMPARABLE',
  AC14.chain_continuity.links[0].current.state);
eq(AC14.chain_continuity.links[0].current.epoch_boundary.kind,
  'UNDECIDABLE_THE_VOCABULARY_AUTHORITY_IS_ABSENT',
  'AC14a and the reason is the absent authority, not the data');
eq(AC14.chain_continuity.current_axis.disagree, 0, 'AC14b still zero disagreements');
ok(AC14.chain_without_the_target.removing_it_repairs_a_break !== true,
  'AC14c and still no claim that removing the row repairs anything');
// ================================================================================================================
section('AD — S1-R4H: the operator classified it, and removal is not completion');
// ================================================================================================================
//
// R4E proved the row cannot be repaired by writing one cell. R4F and R4G ended at
// OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED, because the database does not contain the answer. The operator
// has now answered - INVALID_NON_LEDGER_ROW on the basis CONFIRMED_EARLY_TEST_RESIDUE - and that answer is an
// INPUT to the diagnostic rather than a finding of it. Everything below tests a package that records the
// classification, refuses to act if the row it was issued against has moved, and removes the row by EMPTYING
// it in place.
//
// THE TWO COUNTS. Clearing is not deleting: the record leaves the population while the physical row stays
// where it is, so 96 -> 95 logical against an unchanged sheet extent. Every remaining row keeps its ROW
// NUMBER as well as its content, which is the property `deleteRow` would destroy and the reason the method
// is what it is.
//
// FakeSheet's range has no clearContent - nothing in this family could clear one before. It is added here,
// as a REAL clear that counts a write, so allWrites() still measures what actually happened.
(function () {
  var baseGetRange = FakeSheet.prototype.getRange;
  FakeSheet.prototype.getRange = function (row, col, nr, nc) {
    var s = this;
    var r = baseGetRange.call(this, row, col, nr, nc);
    r.clearContent = function () {
      s.writes++;
      for (var i = 0; i < (nr || 1); i++) {
        for (var j = 0; j < (nc || 1); j++) s.rows[row - 1 + i][col - 1 + j] = '';
      }
    };
    return r;
  };
})();

// A script lock that can be observed and can be made to refuse. Injected per world, so a world built without
// it is the genuine "no lock authority" case rather than a flag.
var AD_LOCK_SRC_ = 'var __AD_LOCK = { tries: 0, releases: 0, held: false, grant: true, thrw: null,'
  + ' last_timeout: null };' + NL
  + 'var LockService = { getScriptLock: function () { return {' + NL
  + '  tryLock: function (ms) { __AD_LOCK.tries++; __AD_LOCK.last_timeout = ms;' + NL
  + '    if (__AD_LOCK.thrw) { throw new Error(__AD_LOCK.thrw); }' + NL
  + '    if (__AD_LOCK.grant) { __AD_LOCK.held = true; return true; }' + NL
  + '    return false; },' + NL
  + '  releaseLock: function () { __AD_LOCK.releases++; __AD_LOCK.held = false; } }; } };';

var AD_POOL_ = [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2210, fac_reserved_stock: 0 }];

/** The live target row 2, and 95 records every writer would recognise. */
function adRows(first, count) {
  var rows = [first === undefined ? abLive() : first];
  for (var i = 1; i <= (count === undefined ? 95 : count); i++) rows.push(aaGood(i));
  return rows;
}
function adWorld(rows, extra, noLock, mutate) {
  var sp = {};
  Object.keys(pos()).forEach(function (k) { sp[k] = pos()[k]; });
  sp.movements = rows === undefined ? adRows() : rows;
  sp.factory_stock = AD_POOL_;
  // THE BASE HARNESS ALREADY SUPPLIES A LOCK, and it always grants. So "no lock authority" has to be made
  // EXPLICITLY - an absent stub is not the same as an absent service, and the world that proves the refusal
  // has to actually not have one.
  sp.after = noLock ? 'LockService = undefined;' : AD_LOCK_SRC_;
  Object.keys(extra || {}).forEach(function (k) { sp[k] = extra[k]; });
  var w = S1World(sp);
  if (mutate) mutate(w);
  return w;
}
/** The world's own measured state, read through the SHIPPED read-only id census, as the pin. Same seam R4F
 *  uses: the package REPORTS that its expectation was caller-supplied, and AD16 drives the default. */
function adPin(w, over) {
  var c = vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx);
  var f = (c.faults || [])[0] || {};
  var e = { build: c.build, header_fingerprint: c.header_fingerprint,
    table_combined_fingerprint: c.table_combined_fingerprint,
    row_count: c.row_count, logical_movement_record_count: c.row_count,
    valid_id_count: c.valid_id_count, blank_id_count: c.blank_id_count,
    duplicate_id_count: c.duplicate_id_count, wrong_type_id_count: c.wrong_type_id_count,
    outside_named_column_row_count: c.outside_named_column_row_count,
    target_row_number: f.one_based_sheet_row_number,
    target_row_fingerprint: f.full_named_row_fingerprint,
    target_movement_id_is_blank: true, target_movement_type_is_blank: true,
    pool_warehouse_id: WHF, pool_sku: SKU,
    pool_fac_current_stock: 2210, pool_fac_reserved_stock: 0,
    authority: 'the suite\'s own measurement of the world it built' };
  Object.keys(over || {}).forEach(function (k) { e[k] = over[k]; });
  return e;
}
function adMan(w, optsOver) {
  var o = { expect: adPin(w, (optsOver || {}).pinOver) };
  Object.keys(optsOver || {}).forEach(function (k) { if (k !== 'pinOver') o[k] = optsOver[k]; });
  vm.runInContext('var __AD_ARG = ' + JSON.stringify(o) + ';', w.ctx);
  return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_MANIFEST(__AD_ARG)', w.ctx);
}
function adRun(w, arg) {
  vm.runInContext('var __AD_RUN = ' + JSON.stringify(arg || {}) + ';', w.ctx);
  return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL(__AD_RUN)', w.ctx);
}
function adLock(w) { return vm.runInContext('JSON.parse(JSON.stringify(__AD_LOCK))', w.ctx); }
/** Every refusal owes the same things: nothing written anywhere, nothing minted, no row structure changed. */
function adNoWrite(r, w, label) {
  eq([r.writes, r.cells_cleared, r.cells_restored, r.ids_minted], [0, 0, 0, 0],
    label + ' zero writes, zero cells cleared, zero restored, zero ids minted');
  eq(w.allWrites(), 0, label + ' and zero writes MEASURED on every sheet in the world');
  eq(w.writesByTable(), {}, label + ' with no table written at all');
  eq([r.rows_added, r.rows_removed, r.rows_reordered, r.tables_created], [0, 0, false, 0],
    label + ' and no row added, removed or reordered, and no table created');
}
/** The whole movement sheet as raw rows, so a physical claim can be checked physically. */
function adSheet(w) { return w.sheets.factory_stock_movements.rows; }

// ---- AD1 — THE MANIFEST MEASURES, CONFIRMS AND FREEZES. --------------------------------------------
var AD1w = adWorld();
var AD1 = adMan(AD1w);
eq(AD1.verdict, 'READY_TO_AUTHORIZE_REMOVAL',
  'AD1  the manifest is ready to authorize a removal', [AD1.failed_predicates, AD1.stop_reasons]);
eq([AD1.read_only, AD1.dry_run], [true, true], 'AD1a and says of itself that it is read-only');
eq(AD1.live_state_confirmed, true, 'AD1b every frozen fact was re-confirmed against the sheet');
eq(AD1.classification_applies, true,
  'AD1c and the operator classification still describes the row that is on the sheet');
eq([AD1.classification, AD1.operator_basis],
  ['INVALID_NON_LEDGER_ROW', 'CONFIRMED_EARLY_TEST_RESIDUE'],
  'AD1d classified INVALID_NON_LEDGER_ROW on the basis CONFIRMED_EARLY_TEST_RESIDUE');
// THE CLASSIFICATION IS AN INPUT. This is the fact the whole round rests on and it is published, not implied.
eq(AD1.operator_decision.decided_by, 'OPERATOR', 'AD1e the decision was made by a person');
eq(AD1.operator_decision.derived_by_this_file, false,
  'AD1f and the diagnostic states that it did NOT derive it');
eq([AD1.operator_decision.qty_is_not_a_delta,
  AD1.operator_decision.after_current_stock_is_not_a_balance], [true, true],
  'AD1g qty and after_current_stock are recorded as readings of nothing');
eq([AD1.operator_decision.must_not_mint_movement_id,
  AD1.operator_decision.must_not_write_movement_type], [true, true],
  'AD1h and neither the primary key nor the ledger axis may be filled in');
ok(String(AD1.operator_decision.must_not_become_a_movement).indexOf('SILENCING') > 0,
  'AD1i naming R4E\'s silencing hazard as the reason completion is refused',
  AD1.operator_decision.must_not_become_a_movement);
// A CLASSIFICATION IS ISSUED AGAINST A STATE.
eq(AD1.classification_issued_against.row_number, 2, 'AD1j the decision names the row it was issued against');
eq(AD1.classification_issued_against.row_fingerprint, AD1.target.row_fingerprint,
  'AD1k and the FINGERPRINT that row had, which is what makes it revocable by drift');

// ---- AD2 — THE METHOD, AND EVERY ALTERNATIVE IT REFUSES. -------------------------------------------
eq(AD1.method.method, 'CLEAR_CONTENT_OF_THE_WHOLE_TARGET_ROW_RANGE', 'AD2 the method is a range clear');
eq([AD1.method.physical_row_survives, AD1.method.logical_record_leaves], [true, true],
  'AD2a the physical row survives and the logical record leaves');
ok(String(AD1.method.refused_row_deletion).indexOf('shift every row below the target up by one') > 0,
  'AD2b row deletion is refused, and the reason is the row numbers it would move',
  AD1.method.refused_row_deletion);
['refused_row_insertion', 'refused_reorder', 'refused_quarantine_table', 'refused_new_table',
 'refused_mint_id', 'refused_fill_movement_type'].forEach(function (k, i) {
  ok(String(AD1.method[k]).length > 30, 'AD2c.' + (i + 1) + ' ' + k + ' is refused with a reason');
});
ok(String(AD1.method.counts_note).indexOf('LOGICAL RECORD COUNT AND A PHYSICAL ROW COUNT') > 0,
  'AD2d and the two counts are named as two counts', AD1.method.counts_note);

// ---- AD3 — THE TARGET: ONE ROW, ONE RANGE, FIFTEEN TOUCHED, SIX CHANGED. ---------------------------
eq(AD1.target.row_number, 2, 'AD3 the target is sheet row 2');
eq(AD1.target.range_a1, 'A2:O2', 'AD3a and the range is A2:O2', AD1.target.range_a1);
eq(AD1.target.range_cell_count, 15, 'AD3b fifteen cells are TOUCHED');
eq(AD1.target.non_blank_cell_count, 6, 'AD3c and six of them currently hold a value and will CHANGE');
ok(String(AD1.target.note).indexOf('TOUCHES') > 0 && String(AD1.target.note).indexOf('CHANGES') > 0,
  'AD3d with the difference between the two stated rather than left to the reader', AD1.target.note);
eq(AD1.target.occurrences, 1, 'AD3e the target fingerprint identifies exactly one row');
eq([AD1.target.movement_id_is_blank, AD1.target.movement_type_is_blank], [true, true],
  'AD3f the key and the ledger axis are both still blank');
eq([AD1.target.warehouse_id, AD1.target.sku], [WHF, SKU], 'AD3g at the pool the operator named');
eq(AD1.target.cells.length, 15, 'AD3h and all fifteen BEFORE cells are captured, canonically');
eq(AD1.target.cells.filter(function (c) { return c.canonical !== '~'; })
  .map(function (c) { return c.column; }),
  ['sku', 'warehouse_id', 'qty', 'before_current_stock', 'after_current_stock', 'created_at'],
  'AD3i the six that change are exactly the six the operator listed');

// ---- AD4 — THE TABLE BEFORE, AND THE EXACT TABLE AFTER. -------------------------------------------
eq([AD1.logical_movement_record_count, AD1.valid_id_count, AD1.blank_id_count,
  AD1.duplicate_id_count, AD1.wrong_type_id_count], [96, 95, 1, 0, 0],
  'AD4 the BEFORE table: 96 logical records, 95 valid ids, 1 blank, 0 duplicate, 0 wrong-typed');
eq([AD1.live_column_count, AD1.named_column_count], [15, 15], 'AD4a over fifteen live columns');
eq(AD1.expected_after.logical_movement_record_count, 95,
  'AD4b the AFTER is 95 logical movement records');
eq([AD1.expected_after.valid_id_count, AD1.expected_after.blank_id_count,
  AD1.expected_after.id_fault_count], [95, 0, 0],
  'AD4c the valid id count does NOT rise — the blank key goes because the record goes, not because it was filled');
eq(AD1.expected_after.physical_last_row, AD1.physical_last_row,
  'AD4d and the physical extent of the sheet does not move at all');
eq([AD1.expected_after.physical_rows_removed, AD1.expected_after.rows_added,
  AD1.expected_after.rows_reordered], [0, 0, false], 'AD4e no row is removed, added or reordered');
eq([AD1.expected_after.cells_touched, AD1.expected_after.cells_changed], [15, 6],
  'AD4f fifteen touched, six changed');
eq([AD1.expected_after.target_row_is_a_logical_record, AD1.expected_after.target_row_all_blank],
  [false, true], 'AD4g the target row stops being a record and becomes an empty row');
ok(AD1.expected_after.table_combined_fingerprint !== AD1.table_combined_fingerprint,
  'AD4h the table fingerprint is expected to CHANGE',
  [AD1.table_combined_fingerprint, AD1.expected_after.table_combined_fingerprint]);
ok(String(AD1.expected_after.note).indexOf('"it must differ" is satisfied by any damage at all') > 0,
  'AD4i and the exact value it must change TO is stated, because "it differs" is not an expectation',
  AD1.expected_after.note);
ok(AD1.expected_after.target_row_raw_fingerprint !== AD1.target.row_fingerprint,
  'AD4j the all-blank row has its own fingerprint, computed from the live header');

// ---- AD5 — THE 95 THAT MUST SURVIVE, BY IDENTITY AND BY ROW NUMBER. -------------------------------
eq(AD1.remaining.count, 95, 'AD5 ninety-five records must survive');
eq(AD1.remaining.ids.filter(function (i) { return i === ''; }).length, 0,
  'AD5a none of them is missing its primary key');
eq(AD1.remaining.row_fingerprints.length, 95, 'AD5b each with its row number and its row fingerprint');
eq(AD1.remaining.row_fingerprints[0].row_number, 3,
  'AD5c starting at row 3 — the target is row 2 and it is excluded');
ok(AD1.remaining.id_universe_fingerprint && AD1.remaining.row_fingerprint_map_fingerprint
  && AD1.remaining.id_universe_fingerprint !== AD1.remaining.row_fingerprint_map_fingerprint,
  'AD5d and the identity fingerprint and the row-number map fingerprint are two different values',
  [AD1.remaining.id_universe_fingerprint, AD1.remaining.row_fingerprint_map_fingerprint]);
eq(AD1.expected_after.remaining_id_universe_fingerprint, AD1.remaining.id_universe_fingerprint,
  'AD5e both are expected to survive the removal unchanged');
eq(AD1.expected_after.remaining_row_fingerprint_map_fingerprint,
  AD1.remaining.row_fingerprint_map_fingerprint, 'AD5f including the row-number map');

// ---- AD6 — THE POOL AND THE PROTECTED SURFACES. --------------------------------------------------
eq([AD1.pool.fac_current_stock, AD1.pool.fac_reserved_stock], [2210, 0],
  'AD6 factory_stock CO1100-R is 2210 current, 0 reserved');
ok(String(AD1.pool.role).indexOf('FROZEN_TO_PROVE_IT_DID_NOT_CHANGE') === 0,
  'AD6a and it is frozen to prove it did not change', AD1.pool.role);
ok(String(AD1.pool.role).indexOf('later ledger epoch') > 0,
  'AD6b explicitly NOT as evidence about the target row — R4G measured that it reconciles a later epoch');
eq(AD1.protected_surfaces.table_count, 8, 'AD6c eight protected surfaces were observed');
eq(AD1.protected_surfaces.surfaces.filter(function (s) {
  return s.state === 'SHEET_ABSENT'; }).map(function (s) { return s.table; }),
  ['shipments', 'shipment_lines', 'reservations'],
  'AD6d three of them are ABSENT in this world, and absence is frozen as a STATE');
eq(AD1.protected_surfaces.surfaces.filter(function (s) {
  return s.state === 'SHEET_ABSENT' && s.row_count === null; }).length, 3,
  'AD6e an absent table has NO row count — null, never zero');
eq(AD1.protected_surfaces.surfaces.filter(function (s) {
  return s.state === 'SHEET_PRESENT_AND_READABLE'; }).length, 5,
  'AD6f and five are present and readable');
ok(AD1.protected_surfaces.fingerprint && AD1.protected_surfaces.fingerprint.length > 0,
  'AD6g with one fingerprint over all eight, so one comparison can refuse a change to any');

// ---- AD7 — THE CONTROL SURFACE: the flag, the allowlist and the build. ---------------------------
eq(AD1.control_surface.flag_value, false, 'AD7 the generation flag is false');
eq(AD1.control_surface.allowlist_count, 1, 'AD7a the allowlist holds exactly one scope');
eq(AD1.control_surface.allowlist_scope_keys, ['ResUS|US|Amazon|' + SKU],
  'AD7b measured, not assumed — in THIS world the one allowlisted scope is the removal target\'s own');
// AND THAT IS NOT A REFUSAL, WHICH IS THE POINT. An allowlist entry authorizes nothing while the flag is
// false, so refusing on it would be refusing on a fact that cannot act. The two are asked as ONE question.
eq(AD1.control_surface.target_sku_is_on_the_activation_allowlist, true,
  'AD7c the membership is published either way, rather than inferred from a silence');
eq(AD1.control_surface.concurrent_generation_possible, false,
  'AD7c1 but no generation could be writing to this pool, because the flag is false');
eq(AD1.stop_reasons, [], 'AD7c2 so the allowlist entry alone is not a stop reason', AD1.stop_reasons);
eq(AD1.build, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6', 'AD7d measured against the pinned build');

// ---- AD8 — THE FREEZE AND THE SENTENCE. ----------------------------------------------------------
var ADfz = AD1.frozen_before;
ok(ADfz !== null, 'AD8  a baseline was frozen');
eq(ADfz.target_range_a1, 'A2:O2', 'AD8a naming the one range');
eq([ADfz.target_range_cell_count, ADfz.target_non_blank_cell_count], [15, 6],
  'AD8b the cells touched and the cells that change');
eq(ADfz.remaining_ids.length, 95, 'AD8c the 95 surviving identities');
eq(ADfz.protected_surfaces.length, 8, 'AD8d and every protected surface');
eq(AD1.wording_audit.missing, [], 'AD8e the authorization names every fact a person must check',
  AD1.wording_audit.missing);
ok(AD1.wording_audit.required_item_count >= 28,
  'AD8f and there are enough of them to mean something', AD1.wording_audit.required_item_count);
eq((String(AD1.authorization_wording).match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []), [],
  'AD8g with no placeholder in it');
['NO row is deleted', 'no movement id is minted', 'no movement_type is written',
 'never attempted a second time'].forEach(function (n, i) {
  ok(String(AD1.authorization_wording).indexOf(n) > 0,
    'AD8h.' + (i + 1) + ' and the sentence itself says "' + n + '"');
});
var ADtags = logTags(AD1w);
var ADchunks = ADtags.filter(function (t) {
  return t.indexOf('s1_mov_removal_manifest_freeze_paste_block_') === 0; });
ok(ADchunks.length >= 1 && ADchunks[0] === 's1_mov_removal_manifest_freeze_paste_block_1_of_'
  + ADchunks.length,
  'AD8i the freeze paste block was emitted, in numbered chunks', ADchunks);
ok(ADtags.indexOf('s1_mov_removal_manifest_freeze_meta') >= 0,
  'AD8i2 with a meta line saying where it is pasted');
ok(ADtags.indexOf('s1_mov_removal_manifest_freeze_withheld') < 0,
  'AD8j and nothing was withheld on a READY run');
adNoWrite(AD1, AD1w, 'AD8k');

// ---- AD9 — execute OMITTED and execute:false BOTH WRITE NOTHING. ---------------------------------
var AD9dry = adRun(AD1w, { frozen: ADfz, authorization: AD1.authorization_wording });
eq(AD9dry.verdict, 'DRY_RUN_OK', 'AD9  the default is a DRY RUN and every check passes',
  [AD9dry.failed_predicates, AD9dry.refusal_reasons]);
eq([AD9dry.execute_requested, AD9dry.dry_run], [false, true], 'AD9a reported as such');
eq(AD9dry.lock.acquired, true, 'AD9b the dry run took the SAME lock as the execute path');
eq(AD9dry.lock.released, true, 'AD9c and released it');
eq(adLock(AD1w).held, false, 'AD9d measured on the lock itself: it is not held afterwards');
eq(adLock(AD1w).last_timeout, 30000, 'AD9e with the default 30s budget');
adNoWrite(AD9dry, AD1w, 'AD9f');
var AD9false = adRun(AD1w, { execute: false, frozen: ADfz, authorization: AD1.authorization_wording });
eq(AD9false.verdict, 'DRY_RUN_OK', 'AD9g execute:false is also a dry run');
var AD9str = adRun(AD1w, { execute: 'true', frozen: ADfz, authorization: AD1.authorization_wording });
eq(AD9str.verdict, 'DRY_RUN_OK',
  'AD9h and so is the STRING "true" — the gate is identity, not truthiness');
eq([AD9str.execute_requested, AD9str.dry_run], [false, true], 'AD9i reported honestly');
adNoWrite(AD9str, AD1w, 'AD9j');
eq(AD1w.allWrites(), 0, 'AD9k after three dry runs the world has still never been written to');

// ---- AD10 — THE EXECUTE. ONE RANGE, SIX CELLS CHANGED, NOTHING ELSE MOVED. ------------------------
var AD10w = adWorld();
var AD10m = adMan(AD10w);
eq(AD10m.verdict, 'READY_TO_AUTHORIZE_REMOVAL', 'AD10 a fresh world is ready');
var AD10before = adSheet(AD10w).map(function (r) { return r.slice(); });
var AD10 = adRun(AD10w, { execute: true, frozen: AD10m.frozen_before,
  authorization: AD10m.authorization_wording });
eq(AD10.verdict, 'EXECUTED_OK', 'AD10a the removal executed and the readback confirmed it',
  [AD10.failed_predicates, AD10.refusal_reasons,
    AD10.readback ? AD10.readback.mismatches : null]);
eq([AD10.writes, AD10.cells_touched, AD10.cells_cleared], [1, 15, 6],
  'AD10b one write, fifteen cells touched, six changed');
eq(AD10w.allWrites(), 1, 'AD10c measured on the sheets: one write in the whole world');
eq(AD10w.writesByTable(), { factory_stock_movements: 1 },
  'AD10d and it landed on the movement table and no other');
eq([AD10.ids_minted, AD10.movement_types_written], [0, 0],
  'AD10e no primary key was minted and no ledger axis was written');
eq([AD10.rows_added, AD10.rows_removed, AD10.rows_reordered, AD10.tables_created], [0, 0, false, 0],
  'AD10f no row added, removed or reordered, and no table created');
eq([AD10.attempts, AD10.retryable], [1, false], 'AD10g attempted exactly once, and not retryable');
eq(AD10.lock.released, true, 'AD10h the lock was released');
// THE PHYSICAL SHEET, CHECKED PHYSICALLY.
eq(adSheet(AD10w).length, AD10before.length,
  'AD11 the sheet has exactly as many physical rows as it started with');
eq(adSheet(AD10w)[1].join('|'), (new Array(15)).join('|'),
  'AD11a physical row 2 is fifteen empty cells', adSheet(AD10w)[1]);
eq(adSheet(AD10w)[0].join('|'), AD10before[0].join('|'), 'AD11b the header row is untouched');
var AD11moved = 0;
for (var adI = 2; adI < AD10before.length; adI++) {
  if (adSheet(AD10w)[adI].join('|') !== AD10before[adI].join('|')) AD11moved++;
}
eq(AD11moved, 0, 'AD11c and every one of the 95 other physical rows is byte-identical, in place');
// THE READBACK, AGAINST THE FROZEN EXPECTATION.
eq(AD10.readback.mismatches, [], 'AD12 nothing mismatched on readback');
eq([AD10.readback.measured.logical_movement_record_count,
  AD10.readback.measured.valid_id_count, AD10.readback.measured.blank_id_count,
  AD10.readback.measured.duplicate_id_count, AD10.readback.measured.wrong_type_id_count],
  [95, 95, 0, 0, 0],
  'AD12a 95 logical records, 95 valid ids, and the blank-id fault is gone');
eq(AD10.readback.measured.id_fault_count, 0, 'AD12b the id integrity fault count is zero');
eq(AD10.readback.measured.physical_last_row, AD10m.frozen_before.physical_last_row,
  'AD12c while the physical last row did not move — clearing is not deleting');
eq([AD10.readback.measured.target_cells_read, AD10.readback.measured.target_cells_blank], [15, 15],
  'AD12d the target range reads fifteen cells and all fifteen are blank');
eq(AD10.readback.measured.target_row_is_a_logical_record, false,
  'AD12e the row is no longer a record …');
eq(AD10.readback.measured.target_row_raw_fingerprint,
  AD10m.frozen_before.expected_after.target_row_raw_fingerprint,
  'AD12f … and the RAW range hashes to the all-blank fingerprint, which is how "emptied" is told from "deleted"');
eq([AD10.readback.measured.remaining_record_count,
  AD10.readback.measured.remaining_id_universe_fingerprint,
  AD10.readback.measured.remaining_row_fingerprint_map_fingerprint],
  [95, AD10m.frozen_before.remaining_id_universe_fingerprint,
    AD10m.frozen_before.remaining_row_fingerprint_map_fingerprint],
  'AD12g the 95 keep every identity AND every row number');
eq([AD10.readback.measured.pool_fac_current_stock, AD10.readback.measured.pool_fac_reserved_stock],
  [2210, 0], 'AD12h factory_stock CO1100-R is untouched at 2210 / 0');
eq(AD10.readback.measured.pool_row_fingerprint, AD10m.frozen_before.pool_row_fingerprint,
  'AD12i to the byte');
eq(AD10.readback.measured.protected_surface_fingerprint,
  AD10m.frozen_before.protected_surface_fingerprint,
  'AD12j and all eight protected surfaces are at their frozen fingerprint');
eq([AD10.readback.measured.flag_value, AD10.readback.measured.build],
  [false, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6'], 'AD12k with the flag and the build unmoved');
eq(AD10.readback.measured.table_combined_fingerprint,
  AD10m.frozen_before.expected_after.table_combined_fingerprint,
  'AD12l and the table fingerprint is the exact value the manifest predicted');

// ---- AD13 — A RETRY OF A COMPLETED REMOVAL WRITES NOTHING. ---------------------------------------
var AD13 = adRun(AD10w, { execute: true, frozen: AD10m.frozen_before,
  authorization: AD10m.authorization_wording });
eq(AD13.verdict, 'ALREADY_APPLIED', 'AD13 a retry recognises the completed removal',
  [AD13.failed_predicates, AD13.refusal_reasons]);
eq(AD13.already_applied, true, 'AD13a and says so');
eq([AD13.writes, AD13.cells_cleared, AD13.attempts], [0, 0, 0],
  'AD13b having written nothing and attempted nothing');
eq(AD10w.allWrites(), 1, 'AD13c the world still carries exactly the one write from AD10');
eq(AD13.readback.ok, true, 'AD13d and it CONFIRMS the completed removal rather than shrugging at it');
eq(AD13.retryable, false, 'AD13e a completed removal is not retryable');

// ---- AD14 — THE REFUSALS. Each one writes nothing. -----------------------------------------------
var AD14w = adWorld();
var AD14m = adMan(AD14w);
var AD14 = adRun(AD14w, { execute: true });
eq(AD14.verdict, 'REFUSED', 'AD14 no frozen baseline: refused');
ok(String(AD14.refusal_reasons[0]).indexOf('NO_FROZEN_BASELINE') === 0,
  'AD14a under that named reason', AD14.refusal_reasons);
adNoWrite(AD14, AD14w, 'AD14b');
var AD14partial = {};
Object.keys(AD14m.frozen_before).forEach(function (k) {
  if (k !== 'remaining_id_universe_fingerprint') AD14partial[k] = AD14m.frozen_before[k]; });
var AD14c = adRun(AD14w, { execute: true, frozen: AD14partial,
  authorization: AD14m.authorization_wording });
eq(AD14c.verdict, 'REFUSED', 'AD14c an incomplete baseline is refused');
ok(String(AD14c.refusal_reasons[0]).indexOf('FROZEN_BASELINE_INCOMPLETE') === 0
  && String(AD14c.refusal_reasons[0]).indexOf('remaining_id_universe_fingerprint') > 0,
  'AD14d naming the field that is missing', AD14c.refusal_reasons);
var AD14e = adRun(AD14w, { execute: true, frozen: AD14m.frozen_before,
  authorization: 'I authorize something else entirely.' });
eq(AD14e.verdict, 'REFUSED', 'AD14e a sentence that is not the frozen one is refused');
eq(AD14e.refusal_reasons, ['AUTHORIZATION_DOES_NOT_MATCH_THE_FROZEN_SENTENCE'], 'AD14f by name');
var AD14g = adRun(AD14w, { execute: true, frozen: AD14m.frozen_before });
eq(AD14g.refusal_reasons, ['NO_AUTHORIZATION_SUPPLIED'], 'AD14g and an absent one likewise');
adNoWrite(AD14g, AD14w, 'AD14h');
// A BASELINE THAT CARRIES A DIFFERENT DECISION IS A DIFFERENT AUTHORIZATION.
var AD14i = JSON.parse(JSON.stringify(AD14m.frozen_before));
AD14i.classification = 'ID_ONLY_MISSING';
var AD14j = adRun(AD14w, { execute: true, frozen: AD14i,
  authorization: AD14m.authorization_wording });
eq(AD14j.verdict, 'REFUSED', 'AD14i a baseline classified as something else is refused');
ok(String(AD14j.refusal_reasons[0]).indexOf('FROZEN_CLASSIFICATION_IS_NOT_THE_REMOVAL_DECISION') === 0,
  'AD14j by name', AD14j.refusal_reasons);
adNoWrite(AD14j, AD14w, 'AD14k');

// ---- AD15 — DRIFT BETWEEN THE MANIFEST AND THE EXECUTE. ------------------------------------------
function adDrift(label, mutateAfterManifest, expectReason) {
  var w = adWorld();
  var m = adMan(w);
  if (m.verdict !== 'READY_TO_AUTHORIZE_REMOVAL') {
    ok(false, label + ' the manifest was ready before the drift', m.failed_predicates);
    return;
  }
  var wrote0 = w.allWrites();
  mutateAfterManifest(w);
  var r = adRun(w, { execute: true, frozen: m.frozen_before, authorization: m.authorization_wording });
  eq(r.verdict, 'REFUSED', label + ' refused', [r.refusal_reasons, r.failed_predicates]);
  ok(r.refusal_reasons.indexOf(expectReason) >= 0,
    label + 'a naming ' + expectReason, r.refusal_reasons);
  eq([r.writes, r.cells_cleared, r.cells_restored], [0, 0, 0], label + 'b having written nothing');
  eq(w.allWrites(), wrote0, label + 'c measured on every sheet in the world');
  eq(r.lock.acquired, true, label + 'd the drift was found UNDER the lock, not before it');
}
adDrift('AD15 a fingerprint drifted:', function (w) {
  w.sheets.factory_stock_movements.rows[3][5] = 999999;
}, 'DRIFT:table_combined_fingerprint');
adDrift('AD16 the schema drifted:', function (w) {
  w.sheets.factory_stock_movements.rows[0][14] = 'created_at_v2';
}, 'DRIFT:header_fingerprint');
adDrift('AD17 the factory pool drifted:', function (w) {
  w.sheets.factory_stock.rows[1][2] = 2211;
}, 'DRIFT:pool_fac_current_stock');
adDrift('AD18 a protected surface drifted:', function (w) {
  w.sheets.shipping_plans.rows.push(['SP-NEW', '', 'ResUS', 'US', 'Amazon', WHF, 'DRAFT', 1, '', '']);
}, 'DRIFT:protected_surface_fingerprint');
adDrift('AD19 the target row itself was edited:', function (w) {
  w.sheets.factory_stock_movements.rows[1][5] = 12001;
}, 'DRIFT:target_row_fingerprint');
// THE INTERLOCK WITH R4E. If the backfill has run, this classification no longer describes the sheet.
adDrift('AD20 the target row acquired a primary key:', function (w) {
  w.sheets.factory_stock_movements.rows[1][0] = 'FSMV-DEADBEEF';
}, 'DRIFT:target_movement_id_is_blank');
adDrift('AD21 the target row acquired a ledger axis:', function (w) {
  w.sheets.factory_stock_movements.rows[1][4] = 'inventory_import';
}, 'DRIFT:target_movement_type_is_blank');
// A ROW THAT MOVED. Inserting above the target puts a different record at the frozen row number.
adDrift('AD22 the target row moved:', function (w) {
  var sh = w.sheets.factory_stock_movements;
  sh.rows.splice(1, 0, sh.rows[0].map(function (h, i) { return i === 0 ? 'FSMV-0000AAAA' : (i === 5 ? 7 : ''); }));
}, 'DRIFT:target_row_fingerprint');

// ---- AD23 — THE MANIFEST REFUSES BEFORE THE EXECUTE EVER SEES ANYTHING. --------------------------
var AD23w = adWorld();
var AD23 = adMan(AD23w, { pinOver: { table_combined_fingerprint: 'DEADBEEF' } });
eq(AD23.verdict, 'STOP', 'AD23 a drifted pin STOPs the manifest');
ok(AD23.stop_reasons.indexOf('LIVE_STATE_DRIFTED:table_combined_fingerprint') >= 0,
  'AD23a naming which of the frozen facts moved', AD23.stop_reasons);
eq(AD23.live_state_confirmed, false, 'AD23b with the confirmation recorded as failed');
eq([AD23.frozen_before, AD23.authorization_wording], [null, null],
  'AD23c and it freezes NOTHING and signs NOTHING');
ok(String(AD23.next_decision).indexOf('NOTHING IS AUTHORIZED') === 0,
  'AD23d saying so in words', AD23.next_decision);
ok(logTags(AD23w).indexOf('s1_mov_removal_manifest_freeze_withheld') >= 0,
  'AD23e and the withheld freeze is logged as withheld rather than silently absent', logTags(AD23w));
adNoWrite(AD23, AD23w, 'AD23f');
// AND THE EXECUTE HAS NOTHING TO CONSUME.
var AD23g = adRun(AD23w, { execute: true, frozen: AD23.frozen_before,
  authorization: AD23.authorization_wording });
eq(AD23g.verdict, 'REFUSED', 'AD23g so the removal refuses for want of a baseline');
adNoWrite(AD23g, AD23w, 'AD23h');

// ---- AD24 — A TARGET THAT IS NOT UNIQUE. ---------------------------------------------------------
var AD24rows = [abLive(), abLive()];
for (var ad24i = 1; ad24i <= 94; ad24i++) AD24rows.push(aaGood(ad24i));
var AD24w = adWorld(AD24rows);
var AD24 = adMan(AD24w);
eq(AD24.verdict, 'STOP', 'AD24 two rows sharing the target fingerprint STOP the manifest');
ok(AD24.stop_reasons.filter(function (r) {
  return String(r).indexOf('THE_TARGET_ROW_IS_NOT_UNIQUE') === 0; }).length === 1,
  'AD24a because a removal authorized against a fingerprint that matches two rows cannot say which it removed',
  AD24.stop_reasons);
eq(AD24.classification_applies, false,
  'AD24b and the operator classification is recorded as no longer applying');
eq(AD24.frozen_before, null, 'AD24c nothing is frozen');
adNoWrite(AD24, AD24w, 'AD24d');

// ---- AD25 — THE MANIFEST REFUSES ON THE CONTROL SURFACE. -----------------------------------------
var AD25w = adWorld(undefined, { flag: true });
var AD25 = adMan(AD25w);
eq(AD25.verdict, 'STOP', 'AD25 a true generation flag STOPs the manifest');
ok(AD25.stop_reasons.indexOf('THE_GENERATION_FLAG_IS_NOT_FALSE') >= 0,
  'AD25a by name', AD25.stop_reasons);
adNoWrite(AD25, AD25w, 'AD25b');

// ---- AD26 — THE LOCK. ----------------------------------------------------------------------------
var AD26w = adWorld(undefined, null, true);            // built WITHOUT a lock authority
var AD26m = adMan(AD26w);
eq(AD26m.verdict, 'READY_TO_AUTHORIZE_REMOVAL',
  'AD26 the read-only manifest needs no lock and is ready', AD26m.failed_predicates);
var AD26 = adRun(AD26w, { execute: true, frozen: AD26m.frozen_before,
  authorization: AD26m.authorization_wording });
eq(AD26.verdict, 'REFUSED', 'AD26a but with no lock authority the removal refuses');
eq(AD26.lock.authority_present, false, 'AD26b saying the authority is absent');
ok(String(AD26.refusal_reasons[0]).indexOf('LOCK_NOT_HELD:LOCK_AUTHORITY_UNAVAILABLE') === 0,
  'AD26c rather than proceeding unlocked', AD26.refusal_reasons);
adNoWrite(AD26, AD26w, 'AD26d');
var AD27w = adWorld();
var AD27m = adMan(AD27w);
vm.runInContext('__AD_LOCK.grant = false;', AD27w.ctx);
var AD27 = adRun(AD27w, { execute: true, frozen: AD27m.frozen_before,
  authorization: AD27m.authorization_wording });
eq(AD27.verdict, 'REFUSED', 'AD27 a lock somebody else holds refuses the run');
ok(String(AD27.refusal_reasons[0]).indexOf('LOCK_NOT_HELD:LOCK_NOT_ACQUIRED_WITHIN_30000MS') === 0,
  'AD27a naming the timeout it waited', AD27.refusal_reasons);
eq(AD27.retryable, true, 'AD27b and a run that never started IS retryable');
eq(adLock(AD27w).tries, 1, 'AD27c it asked for the lock exactly once — it did not spin');
adNoWrite(AD27, AD27w, 'AD27d');

// ---- AD28 — A FORCED POSTCONDITION FAILURE, AND A VERIFIED ROLLBACK. -----------------------------
//
// The postcondition is forced to fail by handing the run an AFTER expectation the sheet cannot satisfy. The
// write itself is the authorized one; what is under test is what happens NEXT.
var AD28w = adWorld();
var AD28m = adMan(AD28w);
var AD28fz = JSON.parse(JSON.stringify(AD28m.frozen_before));
AD28fz.expected_after.remaining_id_universe_fingerprint = 'DEADBEEF';
var AD28 = adRun(AD28w, { execute: true, frozen: AD28fz,
  authorization: AD28m.authorization_wording });
eq(AD28.verdict, 'ROLLED_BACK_VERIFIED', 'AD28 a failed postcondition rolls back, verified',
  [AD28.refusal_reasons, AD28.rollback]);
ok(String(AD28.refusal_reasons[0]).indexOf('READBACK_MISMATCH') === 0,
  'AD28a naming the readback as the thing that failed', AD28.refusal_reasons);
eq(AD28.rollback.outcome, 'ROLLED_BACK_VERIFIED', 'AD28b the rollback reports itself verified');
eq(AD28.cells_restored, 15, 'AD28c all fifteen cells were restored, not the six that changed');
eq(AD28.rollback.restored_row_fingerprint, AD28m.frozen_before.target_row_fingerprint,
  'AD28d and the row is back at its frozen BEFORE fingerprint');
eq(AD28.rollback.restored_table_fingerprint, AD28m.frozen_before.table_combined_fingerprint,
  'AD28e AND the whole table is back at its BEFORE fingerprint — both, not either');
eq(AD28.attempts, 1, 'AD28f the clear was never attempted a second time');
eq(AD28w.writesByTable(), { factory_stock_movements: 2 },
  'AD28g exactly two writes on the one table: the clear and the restore');
eq(adSheet(AD28w)[1].filter(function (c) { return String(c) !== ''; }).length, 6,
  'AD28h and physical row 2 carries its six values again');
eq(adLock(AD28w).held, false, 'AD28i with the lock released after the rollback');
// A PROTECTED SURFACE THAT CANNOT BE SATISFIED ROLLS BACK THE SAME WAY.
var AD29w = adWorld();
var AD29m = adMan(AD29w);
var AD29fz = JSON.parse(JSON.stringify(AD29m.frozen_before));
AD29fz.expected_after.pool_fac_current_stock = 9999;
var AD29 = adRun(AD29w, { execute: true, frozen: AD29fz,
  authorization: AD29m.authorization_wording });
eq(AD29.verdict, 'ROLLED_BACK_VERIFIED',
  'AD29 an unsatisfiable protected-surface expectation also rolls back, verified', AD29.rollback);
ok(String(AD29.refusal_reasons[0]).indexOf('pool_fac_current_stock') > 0,
  'AD29a naming the surface it could not satisfy', AD29.refusal_reasons);
eq(adSheet(AD29w)[1].filter(function (c) { return String(c) !== ''; }).length, 6,
  'AD29b and the row came back');

// ---- AD30 — ACK_UNKNOWN. A TIMEOUT IS NOT A FAILED WRITE, AND IT IS NEVER RETRIED. ---------------
//
// Three outcomes, and the whole point is that the run does not guess which one it is: it re-reads and
// classifies.
//
// S1-R4H-R1 — AND NONE OF THE THREE IS RETRYABLE. R4H asserted here that a proven zero-write "stays
// retryable", which is what the tool then reported, and it is the wrong field for the true thing it was
// trying to say. What a proven zero-write establishes is that no harm was done; what `retryable` is read
// as is "run this same call again", and the authorization was spent by the ATTEMPT, not by the write.
// AD33 measures the full contract on every verdict; these two keep the classification itself.
function adThrowOnClear(w, alsoClear) {
  var sh = w.sheets.factory_stock_movements;
  var orig = sh.getRange;
  sh.getRange = function (row, col, nr, nc) {
    var r = orig.call(this, row, col, nr, nc);
    var self = this;
    var base = r.clearContent;
    r.clearContent = function () {
      if (alsoClear) base.call(r);
      throw new Error('Service timed out while accessing spreadsheet');
    };
    return r;
  };
}
var AD30w = adWorld();
var AD30m = adMan(AD30w);
adThrowOnClear(AD30w, false);
var AD30 = adRun(AD30w, { execute: true, frozen: AD30m.frozen_before,
  authorization: AD30m.authorization_wording });
eq(AD30.verdict, 'NOT_APPLIED_ACK_UNKNOWN',
  'AD30 a clear that threw and provably did not land is NOT_APPLIED_ACK_UNKNOWN',
  [AD30.refusal_reasons, AD30.readback ? AD30.readback.mismatches : null]);
eq(AD30.write_acknowledged, 'RESOLVED_BY_READBACK_AS_NOT_APPLIED',
  'AD30a resolved by READBACK, never by retry');
eq([AD30.writes, AD30.cells_cleared], [0, 0], 'AD30b with a proven zero-write');
eq(AD30.retryable, false,
  'AD30c and a proven zero-write is NOT APPLIED AND FINISHED, not retryable');
eq(AD30.attempts, 1, 'AD30d the clear was attempted exactly once');
ok(String(AD30.refusal_reasons[0]).indexOf('WRITE_ACK_UNKNOWN') === 0,
  'AD30e and the unacknowledged write is named as unacknowledged', AD30.refusal_reasons);
eq(adSheet(AD30w)[1].filter(function (c) { return String(c) !== ''; }).length, 6,
  'AD30f the row is intact');
eq(adLock(AD30w).held, false, 'AD30g and the lock was released');
// AND THE OTHER RESOLUTION: it landed, and the acknowledgement is what went missing.
var AD31w = adWorld();
var AD31m = adMan(AD31w);
adThrowOnClear(AD31w, true);
var AD31 = adRun(AD31w, { execute: true, frozen: AD31m.frozen_before,
  authorization: AD31m.authorization_wording });
eq(AD31.verdict, 'EXECUTED_OK_AFTER_ACK_UNKNOWN',
  'AD31 a clear that threw but DID land is resolved as applied',
  [AD31.refusal_reasons, AD31.readback ? AD31.readback.mismatches : null]);
eq(AD31.write_acknowledged, 'RESOLVED_BY_READBACK_AS_APPLIED', 'AD31a by readback');
eq([AD31.writes, AD31.cells_cleared], [1, 6], 'AD31b and the write is counted, once');
eq(AD31.retryable, false, 'AD31c an applied write is not retryable — nor is any other outcome');
eq(AD31.attempts, 1, 'AD31d still exactly one attempt');
eq(adSheet(AD31w)[1].join('|'), (new Array(15)).join('|'), 'AD31e the row is empty');
eq(adSheet(AD31w).length, 97, 'AD31f and the sheet still has all 97 physical rows');

// ---- AD32 — THE WRITE SURFACE, ON THE SOURCE. ----------------------------------------------------
var AD32man = bareCode(extractFn(S1, 'RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_MANIFEST'));
var AD32run = bareCode(extractFn(S1, 'RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL'));
var AD32roll = bareCode(extractFn(S1, 'S1_remRollback_'));
ok(AD32man.length > 3000 && AD32run.length > 3000,
  'AD32 both entry points were located for inspection', [AD32man.length, AD32run.length]);
['setValue', 'setValues', 'appendRow', 'clearContent', 'getRange', 'LockService'].forEach(function (a, i) {
  eq(AD32man.indexOf(a), -1, 'AD32a.' + (i + 1) + ' the MANIFEST reaches no ' + a + ' at all');
});
eq((AD32run.match(/clearContent\(/g) || []).length, 1,
  'AD32b the removal has exactly ONE clear site');
eq((S1_BARE.match(/clearContent\(/g) || []).length, 1,
  'AD32c and it is the only one in the whole file');
eq((AD32roll.match(/setValues\(/g) || []).length, 1,
  'AD32d the rollback has exactly ONE restore site');
eq((S1_BARE.match(/setValues\(/g) || []).length, 1,
  'AD32e and it is the only setValues in the whole file');
eq(AD32run.indexOf('setValue('), -1, 'AD32f the removal itself writes no single cell');
// THE ROW-STRUCTURE APIS ARE ABSENT FROM THE WHOLE FILE, WHICH IS THE METHOD STATED AS A PROPERTY.
['deleteRow', 'deleteRows', 'insertRow', 'insertRows', 'moveRows', 'clearContents',
 'insertSheet', 'deleteSheet', 'removeSheet'].forEach(function (a, i) {
  eq(S1_BARE.indexOf(a), -1,
    'AD32g.' + (i + 1) + ' no ' + a + ' anywhere in the census source (comments and strings stripped)');
});
eq(AD32run.indexOf('S1_movProposedId_'), -1, 'AD32h the removal never mints a primary key');
eq(AD32man.indexOf('S1_movProposedId_'), -1, 'AD32i and neither does its manifest');
eq(AD32run.indexOf('S1_MANIFEST_P_BEFORE_'), -1,
  'AD32j nor does either touch the generation baseline …');
eq(AD32man.indexOf('S1_MANIFEST_P_BEFORE_'), -1, 'AD32k … which stays null and unrelated');
eq(vm.runInContext('S1_MANIFEST_P_BEFORE_', AD1w.ctx), null,
  'AD32l measured after every run in this section: it is still null');

// ---- AD33 — S1-R4H-R1. THE RETRY CONTRACT, ON EVERY VERDICT THAT CAN LEAVE THE FUNCTION. ---------
//
// R4H's own report contained the contradiction this section closes: the prose said a timeout is never
// retried, and the verdict table said NOT_APPLIED_ACK_UNKNOWN was `retryable: true`. Both were describing
// something true and they were describing DIFFERENT things — "this function will not loop" and "a removal
// may still happen one day" — in one field. The field an operator reads answers the first question, so the
// second answer had to move out of it.
//
// WHAT IS MEASURED HERE. Four questions on every response: may this call be re-driven as-is, may anything
// retry it automatically, is the authorization sentence still good, is the frozen baseline still good. Plus
// the fifth, which is the one that is allowed to say yes after an ACK_UNKNOWN: may a removal be attempted
// again at all, starting from a new manifest.
var AD_REMANIFEST_ = 'RERUN_MANIFEST_AND_REQUIRE_NEW_OPERATOR_AUTHORIZATION';
/** [retryable, automatic_retry_allowed, same_authorization_reusable, same_frozen_baseline_reusable] */
function adSpent(r) {
  return [r.retryable, r.automatic_retry_allowed, r.same_authorization_reusable,
    r.same_frozen_baseline_reusable];
}
var AD_NOTHING_REUSABLE_ = [false, false, false, false];
/** Count every clearContent() the tool ISSUES, whatever happens next. Applied LAST, so it wraps a throwing
 *  stub too: the count under test is of ATTEMPTS, and an attempt that threw is still an attempt. */
function adCountClears(w) {
  var sh = w.sheets.factory_stock_movements;
  var orig = sh.getRange;
  var n = { clears: 0 };
  sh.getRange = function (row, col, nr, nc) {
    var r = orig.call(this, row, col, nr, nc);
    var base = r.clearContent;
    if (base) { r.clearContent = function () { n.clears++; return base.call(r); }; }
    return r;
  };
  return n;
}
/** The clear lands, spills onto the next row AND throws — the only combination that leaves the outcome
 *  genuinely indeterminate and the rollback unable to verify. */
function adSpillAndThrowOnClear(w) {
  var sh = w.sheets.factory_stock_movements;
  var orig = sh.getRange;
  sh.getRange = function (row, col, nr, nc) {
    var r = orig.call(this, row, col, nr, nc);
    var s = this;
    var base = r.clearContent;
    if (base) {
      r.clearContent = function () {
        base.call(r);
        for (var j = 0; j < (nc || 1); j++) s.rows[row][col - 1 + j] = '';
        throw new Error('Service timed out while accessing spreadsheet');
      };
    }
    return r;
  };
}

// AD33a — THE DRY RUN IS THE ONE CONTRACT THAT SAYS YES TO EVERYTHING, and it must, because the whole
// workflow is: manifest, dry run on that baseline, execute on that same baseline.
var AD33aw = adWorld();
var AD33am = adMan(AD33aw);
var AD33a = adRun(AD33aw, { frozen: AD33am.frozen_before,
  authorization: AD33am.authorization_wording });
eq(AD33a.verdict, 'DRY_RUN_OK', 'AD33a a dry run on a good baseline');
eq(adSpent(AD33a), [true, false, true, true],
  'AD33a.1 re-drivable, with the authorization and the baseline both still current …');
eq(AD33a.automatic_retry_allowed, false, 'AD33a.2 … and STILL nothing may retry it automatically');
eq(AD33a.next_action, 'RERUN_WITH_EXECUTE_TRUE_USING_THIS_FROZEN_BASELINE',
  'AD33a.3 the next action is the execute it exists to precede');
eq(AD33a.attempts, 0, 'AD33a.4 with no attempt made');
eq(AD33a.retry_contract_key, 'DRY_RUN_OK', 'AD33a.5 keyed by its own verdict');

// AD33b — A LOCK SOMEBODY ELSE HOLDS IS A CONTENTION, NOT A DRIFT. Nothing was measured and nothing was
// written, so the baseline is exactly as current as it was — but the retry is a PERSON coming back later.
var AD33bw = adWorld();
var AD33bm = adMan(AD33bw);
vm.runInContext('__AD_LOCK.grant = false;', AD33bw.ctx);
var AD33b = adRun(AD33bw, { execute: true, frozen: AD33bm.frozen_before,
  authorization: AD33bm.authorization_wording });
eq([AD33b.verdict, AD33b.retry_contract_key], ['REFUSED', 'REFUSED_LOCK_CONTENTION'],
  'AD33b a lock contention refuses under its own contract, not the drift one');
eq(adSpent(AD33b), [true, false, true, true],
  'AD33b.1 nothing was spent, because nothing was attempted');
eq(AD33b.next_action, 'RETRY_LATER_WITH_THIS_FROZEN_BASELINE_WHEN_THE_LOCK_IS_FREE',
  'AD33b.2 and it says come back later rather than spin');
eq(AD33b.attempts, 0, 'AD33b.3 with no attempt made');

// AD33c — A REFUSAL THAT IS A DRIFT IS THE OPPOSITE: being stale is what the refusal DETECTED.
var AD33cw = adWorld();
var AD33cm = adMan(AD33cw);
var AD33cfz = JSON.parse(JSON.stringify(AD33cm.frozen_before));
AD33cfz.table_combined_fingerprint = 'DEADBEEF';
var AD33c = adRun(AD33cw, { execute: true, frozen: AD33cfz,
  authorization: AD33cm.authorization_wording });
eq([AD33c.verdict, AD33c.retry_contract_key], ['REFUSED', 'REFUSED'],
  'AD33c a drift refusal is keyed as a plain REFUSED');
eq(adSpent(AD33c), AD_NOTHING_REUSABLE_,
  'AD33c.1 and the baseline it refused is not offered back as reusable');
eq(AD33c.next_action, AD_REMANIFEST_, 'AD33c.2 the next action is a new manifest');
eq(AD33c.removal_may_be_attempted_again, true,
  'AD33c.3 a removal is still permitted — from a new baseline, which is a different sentence');
adNoWrite(AD33c, AD33cw, 'AD33c.4');

// AD33d — A CLEAN EXECUTE. Done is done: nothing is reusable and nothing is left to do.
var AD33dw = adWorld();
var AD33dm = adMan(AD33dw);
var AD33dc = adCountClears(AD33dw);
var AD33d = adRun(AD33dw, { execute: true, frozen: AD33dm.frozen_before,
  authorization: AD33dm.authorization_wording });
eq(AD33d.verdict, 'EXECUTED_OK', 'AD33d a clean execute', AD33d.refusal_reasons);
eq(adSpent(AD33d), AD_NOTHING_REUSABLE_, 'AD33d.1 nothing is reusable after the write was reached');
eq(AD33d.removal_may_be_attempted_again, false, 'AD33d.2 and there is nothing left to remove');
eq(AD33d.next_action, 'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE', 'AD33d.3 so: no further action');
eq([AD33d.attempts, AD33dc.clears], [1, 1], 'AD33d.4 one attempt, one clearContent ISSUED');

// AD33e — THE ONE THIS ROUND EXISTS FOR. A proven zero-write after an unacknowledged clear.
//
// R4H reported this as retryable, meaning "no harm was done". It is now reported as NOT APPLIED AND
// FINISHED. The distinction is not academic: `retryable: true` in front of an operator who is holding the
// same frozen block and the same authorization sentence is an instruction to paste them back in, and the
// authorization was issued against a state whose currency the ATTEMPT ended — not the write.
var AD33ew = adWorld();
var AD33em = adMan(AD33ew);
adThrowOnClear(AD33ew, false);
var AD33ec = adCountClears(AD33ew);
var AD33e = adRun(AD33ew, { execute: true, frozen: AD33em.frozen_before,
  authorization: AD33em.authorization_wording });
eq(AD33e.verdict, 'NOT_APPLIED_ACK_UNKNOWN', 'AD33e a proven zero-write after ACK_UNKNOWN',
  [AD33e.refusal_reasons, AD33e.readback ? AD33e.readback.mismatches : null]);
eq([AD33e.writes, AD33e.cells_cleared], [0, 0], 'AD33e.1 with nothing written');
eq(adSpent(AD33e), AD_NOTHING_REUSABLE_,
  'AD33e.2 AND IT IS NOT RETRYABLE — not the call, not automatically, not the authorization, not the baseline');
eq(AD33e.next_action, AD_REMANIFEST_,
  'AD33e.3 the next action is a new manifest and a new operator authorization');
eq(AD33e.removal_may_be_attempted_again, true,
  'AD33e.4 a future removal is still permitted — in the field that means that, and only there');
eq([AD33e.attempts, AD33ec.clears], [1, 1],
  'AD33e.5 exactly one attempt and exactly one clearContent ISSUED in this invocation');
eq(adSheet(AD33ew)[1].filter(function (c) { return String(c) !== ''; }).length, 6,
  'AD33e.6 and the row is intact');

// AD33f — IT LANDED, AND THE ACKNOWLEDGEMENT IS WHAT WENT MISSING.
var AD33fw = adWorld();
var AD33fm = adMan(AD33fw);
adThrowOnClear(AD33fw, true);
var AD33fc = adCountClears(AD33fw);
var AD33f = adRun(AD33fw, { execute: true, frozen: AD33fm.frozen_before,
  authorization: AD33fm.authorization_wording });
eq(AD33f.verdict, 'EXECUTED_OK_AFTER_ACK_UNKNOWN', 'AD33f resolved by readback as applied',
  [AD33f.refusal_reasons, AD33f.readback ? AD33f.readback.mismatches : null]);
eq(adSpent(AD33f), AD_NOTHING_REUSABLE_, 'AD33f.1 nothing reusable');
eq(AD33f.removal_may_be_attempted_again, false, 'AD33f.2 and nothing left to remove');
eq(AD33f.next_action, 'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE',
  'AD33f.3 S1-R4H-R2: the readback SETTLED it, so the case is closed and no manifest is asked for');
eq([AD33f.attempts, AD33fc.clears], [1, 1], 'AD33f.4 one attempt, one clearContent ISSUED');

// AD33g — ACK_UNKNOWN, INDETERMINATE, AND THE ROLLBACK SUCCEEDS. The clear threw AND landed, and the
// frozen AFTER cannot be satisfied, so neither "applied as authorized" nor "provably untouched" holds.
var AD33gw = adWorld();
var AD33gm = adMan(AD33gw);
var AD33gfz = JSON.parse(JSON.stringify(AD33gm.frozen_before));
AD33gfz.expected_after.remaining_id_universe_fingerprint = 'DEADBEEF';
adThrowOnClear(AD33gw, true);
var AD33gc = adCountClears(AD33gw);
var AD33g = adRun(AD33gw, { execute: true, frozen: AD33gfz,
  authorization: AD33gm.authorization_wording });
eq(AD33g.verdict, 'ROLLED_BACK_VERIFIED',
  'AD33g an indeterminate ACK_UNKNOWN rolls back, verified', [AD33g.refusal_reasons, AD33g.rollback]);
eq(AD33g.rollback.outcome, 'ROLLED_BACK_VERIFIED', 'AD33g.1 the rollback reports itself verified');
eq(adSpent(AD33g), AD_NOTHING_REUSABLE_, 'AD33g.2 and nothing is reusable');
eq(AD33g.next_action, AD_REMANIFEST_, 'AD33g.3 next action: a new manifest and a new authorization');
eq(AD33g.removal_may_be_attempted_again, true,
  'AD33g.4 the table is back at BEFORE, so a removal may be attempted again — from scratch');
eq([AD33g.attempts, AD33gc.clears], [1, 1],
  'AD33g.5 ONE clearContent issued: the rollback restores, it does not clear again');
eq(adSheet(AD33gw)[1].filter(function (c) { return String(c) !== ''; }).length, 6,
  'AD33g.6 and the row came back');

// AD33h — ACK_UNKNOWN AND THE ROLLBACK CANNOT VERIFY. The clear threw, landed, and took the next row with
// it, so the row returns but the TABLE fingerprint cannot.
var AD33hw = adWorld();
var AD33hm = adMan(AD33hw);
adSpillAndThrowOnClear(AD33hw);
var AD33hc = adCountClears(AD33hw);
var AD33h = adRun(AD33hw, { execute: true, frozen: AD33hm.frozen_before,
  authorization: AD33hm.authorization_wording });
eq(AD33h.verdict, 'MANUAL_RECOVERY_REQUIRED',
  'AD33h an unverifiable rollback after ACK_UNKNOWN is MANUAL_RECOVERY_REQUIRED',
  [AD33h.refusal_reasons, AD33h.rollback]);
eq(AD33h.rollback.error, 'THE_ROW_CAME_BACK_BUT_THE_TABLE_FINGERPRINT_DID_NOT',
  'AD33h.1 naming which of the two fingerprints did not come back');
eq(adSpent(AD33h), AD_NOTHING_REUSABLE_, 'AD33h.2 nothing is reusable');
eq(AD33h.removal_may_be_attempted_again, false,
  'AD33h.3 and this is the one outcome where the removal must NOT be run again by this tool');
eq(AD33h.next_action, 'STOP_AND_PERFORM_MANUAL_RECOVERY',
  'AD33h.4 S1-R4H-R2: an unreadable state is handed to a PERSON, not to the removal path\'s front door');
eq([AD33h.attempts, AD33hc.clears], [1, 1], 'AD33h.5 still exactly one clearContent issued');

// AD33i — THE SAME CONTRACT REACHED THE OTHER WAY: a rollback from a plain readback mismatch, with no
// ACK_UNKNOWN anywhere. The verdict decides the contract, not the branch that produced it.
var AD33iw = adWorld();
var AD33im = adMan(AD33iw);
var AD33ifz = JSON.parse(JSON.stringify(AD33im.frozen_before));
AD33ifz.expected_after.remaining_id_universe_fingerprint = 'DEADBEEF';
var AD33ic = adCountClears(AD33iw);
var AD33i = adRun(AD33iw, { execute: true, frozen: AD33ifz,
  authorization: AD33im.authorization_wording });
eq(AD33i.verdict, 'ROLLED_BACK_VERIFIED', 'AD33i a readback mismatch rolls back, verified');
eq(AD33i.write_acknowledged, true, 'AD33i.1 with the write acknowledged — this was never ACK_UNKNOWN');
eq(adSpent(AD33i), AD_NOTHING_REUSABLE_, 'AD33i.2 and the contract is identical');
eq([AD33i.attempts, AD33ic.clears], [1, 1], 'AD33i.3 one clearContent, and the restore is not one');

// AD33j — A REMOVAL THAT HAD ALREADY HAPPENED. No attempt, and nothing to do.
var AD33jw = adWorld();
var AD33jm = adMan(AD33jw);
adRun(AD33jw, { execute: true, frozen: AD33jm.frozen_before,
  authorization: AD33jm.authorization_wording });
var AD33j = adRun(AD33jw, { execute: true, frozen: AD33jm.frozen_before,
  authorization: AD33jm.authorization_wording });
eq(AD33j.verdict, 'ALREADY_APPLIED', 'AD33j the second run finds the removal already done');
eq(adSpent(AD33j), AD_NOTHING_REUSABLE_, 'AD33j.1 nothing reusable');
eq(AD33j.next_action, 'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE',
  'AD33j.2 and the next action is the same sentence a fresh success gets — it is the same case');
eq([AD33j.attempts, AD33j.writes], [0, 0], 'AD33j.3 with no attempt and no write');

// AD33k — EVERY VERDICT THE SOURCE CAN EMIT HAS A ROW IN THE TABLE. Read off the function's own text, so a
// verdict added later without a contract is a failure here rather than an `undefined` in a response.
var AD33src = extractFn(S1, 'RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL');
var AD33verdicts = {};
(AD33src.match(/out\.verdict = [^;]+;/g) || []).forEach(function (stmt) {
  (stmt.match(/'([A-Z][A-Z0-9_]{3,})'/g) || []).forEach(function (q) {
    AD33verdicts[q.replace(/'/g, '')] = true;
  });
});
AD33verdicts.REFUSED = true;    // the initial value of out.verdict, not an assignment
var AD33keys = vm.runInContext('Object.keys(S1_REMOVAL_RETRY_CONTRACT_)', AD1w.ctx);
var AD33missing = Object.keys(AD33verdicts).filter(function (v) {
  return AD33keys.indexOf(v) === -1; });
ok(Object.keys(AD33verdicts).length >= 9,
  'AD33k the verdicts were read off the source, and there are several', Object.keys(AD33verdicts));
eq(AD33missing, [], 'AD33k.1 and every one of them has a declared retry contract');
eq(AD33keys.indexOf('REFUSED_LOCK_CONTENTION') >= 0, true,
  'AD33k.2 plus the one contract key that is a refinement of a verdict rather than a verdict');

// AD33l — THE CONTRACT IS WRITTEN IN ONE PLACE AND THE BRANCHES DO NOT ARGUE WITH IT.
eq((AD33src.match(/out\.retryable = /g) || []).length, 1,
  'AD33l exactly one assignment to retryable in the whole function …');
ok(AD33src.indexOf('out.retryable = RC.retryable;') > 0,
  'AD33l.1 … and it is the derived one, in fin()');
['same_authorization_reusable', 'same_frozen_baseline_reusable', 'removal_may_be_attempted_again',
 'next_action'].forEach(function (f, i) {
  eq((AD33src.match(new RegExp('out\\.' + f + ' = ', 'g')) || []).length, 1,
    'AD33l.' + (i + 2) + ' and one assignment to ' + f);
});
var AD33res = extractFn(S1, 'S1_remRetryContract_');
eq((AD33res.match(/automatic_retry_allowed: false/g) || []).length, 2,
  'AD33l.6 automatic_retry_allowed is a literal false on both returns of the resolver …');
eq(AD33res.indexOf('automatic_retry_allowed: row['), -1,
  'AD33l.7 … and never read from the table, so no row can grant it');
// AND MEASURED, NOT ONLY READ: not one response in this whole section allows an automatic retry.
[AD33a, AD33b, AD33c, AD33d, AD33e, AD33f, AD33g, AD33h, AD33i, AD33j].forEach(function (r, i) {
  eq(r.automatic_retry_allowed, false,
    'AD33l.8.' + (i + 1) + ' ' + r.verdict + ' does not permit an automatic retry');
});
// AND NO RESPONSE ANYWHERE IN THE AD SECTION LEAVES A CONTRACT FIELD UNANSWERED.
[AD33a, AD33b, AD33c, AD33d, AD33e, AD33f, AD33g, AD33h, AD33i, AD33j].forEach(function (r, i) {
  ok(typeof r.retryable === 'boolean' && typeof r.same_authorization_reusable === 'boolean'
    && typeof r.same_frozen_baseline_reusable === 'boolean'
    && typeof r.removal_may_be_attempted_again === 'boolean' && !!r.next_action,
    'AD33l.9.' + (i + 1) + ' ' + r.verdict + ' answers every contract field', r);
  eq(r.predicates_failed !== undefined, true, 'AD33l.10.' + (i + 1) + ' with a ledger');
});
// AND THE INVARIANT ITSELF IS IN THE LEDGER, so a response carries its own proof rather than needing this
// suite to re-derive it.
[AD33d, AD33e, AD33f, AD33g, AD33h, AD33i].forEach(function (r, i) {
  var names = (r.predicates || []).map(function (p) { return p.predicate; });
  ok(JSON.stringify(names).indexOf(
    'an_attempt_that_reached_the_write_leaves_no_authorization_and_no_baseline_reusable') > 0,
    'AD33l.11.' + (i + 1) + ' ' + r.verdict + ' states the spent-attempt invariant in its own ledger');
});



// ---- AD34 — S1-R4H-R2. THE FOUR ACK_UNKNOWN OUTCOMES, AS ONE MATRIX. -----------------------------
//
// R4H-R1 settled what may be REUSED after an unacknowledged clear: nothing, in all four cases. It then
// gave all four the same next_action, and for two of them that is wrong in opposite directions.
//
//   RESOLVED AS APPLIED — the readback proved the clear landed and the postcondition holds. The case is
//   CLOSED. Sending that operator back to a manifest asks them to reopen a settled removal, and the
//   natural continuation of a manifest is an execute.
//
//   UNRECOVERABLE — the tool could not establish where it left the table. A manifest ends in a freeze
//   block and an authorization sentence; it is the front door of the removal path. Pointing an
//   unreadable state at that door describes the recovery as something a tool can drive.
//
// The two middle cases are unchanged: nothing stands removed, so a removal is still permitted, and it
// begins at a new manifest with a new baseline and a new operator authorization.
//
// The four responses are the ones AD33 already drove, with their clearContent counters, so this is a
// matrix over real runs rather than a re-reading of the table.
var AD34 = [
  { r: AD33f, c: AD33fc, v: 'EXECUTED_OK_AFTER_ACK_UNKNOWN',
    again: false, next: 'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE' },
  { r: AD33e, c: AD33ec, v: 'NOT_APPLIED_ACK_UNKNOWN',
    again: true, next: AD_REMANIFEST_ },
  { r: AD33g, c: AD33gc, v: 'ROLLED_BACK_VERIFIED',
    again: true, next: AD_REMANIFEST_ },
  { r: AD33h, c: AD33hc, v: 'MANUAL_RECOVERY_REQUIRED',
    again: false, next: 'STOP_AND_PERFORM_MANUAL_RECOVERY' }
];
AD34.forEach(function (row, i) {
  var n = 'AD34.' + (i + 1) + ' ' + row.v;
  eq(row.r.verdict, row.v, n + ' — the outcome under test');
  eq(row.r.next_action, row.next, n + ' next_action', row.r.next_action);
  eq(row.r.removal_may_be_attempted_again, row.again, n + ' removal_may_be_attempted_again');
  /* THE FOUR REUSE ANSWERS ARE STILL false FOR ALL FOUR. R4H-R1's result, re-measured here so that a
     round about next_action cannot quietly loosen the thing next_action sits beside. */
  eq(adSpent(row.r), AD_NOTHING_REUSABLE_,
    n + ' retryable / automatic / authorization / baseline all false');
  eq(row.r.attempts, 1, n + ' attempts');
  eq(row.c.clears, 1, n + ' clearContent calls ISSUED in the invocation');
});
/* THE TWO THAT MUST NOT BE ROUTED TO A MANIFEST, SAID DIRECTLY. */
eq(AD33f.next_action === AD_REMANIFEST_, false,
  'AD34.5 a completed removal is NOT told to rerun the manifest');
eq(AD33h.next_action === AD_REMANIFEST_, false,
  'AD34.6 nor is an unrecoverable state — a manifest is the front door of the removal path');
ok(String(AD33h.next_action).indexOf('MANUAL') >= 0,
  'AD34.7 which is told to stop and be recovered by a person', AD33h.next_action);
/* AND THE TWO FIELDS AGREE ON EVERY RESPONSE THIS SECTION PRODUCED, not just the four above. */
var AD34all = [AD33a, AD33b, AD33c, AD33d, AD33e, AD33f, AD33g, AD33h, AD33i, AD33j];
var AD34map = vm.runInContext('S1_REMOVAL_NEXT_ACTION_ALLOWS_ANOTHER_REMOVAL_', AD1w.ctx);
AD34all.forEach(function (r, i) {
  var known = Object.prototype.hasOwnProperty.call(AD34map, String(r.next_action));
  ok(known, 'AD34.8.' + (i + 1) + ' ' + r.verdict + ' carries a declared next_action',
    r.next_action);
  eq(AD34map[String(r.next_action)], r.removal_may_be_attempted_again,
    'AD34.9.' + (i + 1) + ' ' + r.verdict + ' — its next_action and its permission agree');
});
/* NO OTHER LIFECYCLE WAS INVENTED: the tool emits exactly the six actions the vocabulary declares. */
var AD34used = {};
AD34all.forEach(function (r) { AD34used[String(r.next_action)] = true; });
eq(Object.keys(AD34used).sort(),
  ['INVESTIGATE_THE_TABLE_DOES_NOT_MATCH_THE_FROZEN_EXPECTED_AFTER',
    'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE',
    'RERUN_MANIFEST_AND_REQUIRE_NEW_OPERATOR_AUTHORIZATION',
    'RERUN_WITH_EXECUTE_TRUE_USING_THIS_FROZEN_BASELINE',
    'RETRY_LATER_WITH_THIS_FROZEN_BASELINE_WHEN_THE_LOCK_IS_FREE',
    'STOP_AND_PERFORM_MANUAL_RECOVERY'].filter(function (k) { return !!AD34used[k]; }),
  'AD34.10 every action emitted is one of the declared six, and no seventh appeared');
/* A LOCK CONTENTION IS NOT AN ACK_UNKNOWN, and the matrix must not have quietly absorbed it. */
eq([AD33b.verdict, AD33b.attempts, AD33b.retry_contract_key],
  ['REFUSED', 0, 'REFUSED_LOCK_CONTENTION'],
  'AD34.11 a lock contention never reached the write and is classified on its own');
eq(AD33b.next_action, 'RETRY_LATER_WITH_THIS_FROZEN_BASELINE_WHEN_THE_LOCK_IS_FREE',
  'AD34.12 so it comes back later with the SAME baseline, which no ACK_UNKNOWN outcome may do');
/* AND THE MANIFEST-ROUTING LISTS ARE DISJOINT, so no verdict can be in both. */
var AD34must = vm.runInContext('S1_REMOVAL_MUST_REMANIFEST_', AD1w.ctx);
var AD34not = vm.runInContext('S1_REMOVAL_MUST_NOT_REMANIFEST_', AD1w.ctx);
eq(AD34must.filter(function (v) { return AD34not.indexOf(v) >= 0; }), [],
  'AD34.13 the two routing lists are disjoint');
eq(AD34not.indexOf('MANUAL_RECOVERY_REQUIRED') >= 0, true,
  'AD34.14 and the unrecoverable state is on the do-not-route list');


section('N — mutants');
// ================================================================================================================

function withS1(src, spec) {
  var s = {};
  Object.keys(spec || {}).forEach(function (k) { s[k] = spec[k]; });
  s.s1 = src;
  var w = S1World(s);
  var r = w.run('RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS');
  r.world = w;
  return r;
}
function swapS1(a, b) {
  var n = S1.split(a).length - 1;
  if (n !== 1) throw new Error('swap anchor count ' + n + ' :: ' + a.slice(0, 90));
  return S1.split(a).join(b);
}
// S1-R4H - A SWAP SCOPED TO ONE FUNCTION, BECAUSE A WHOLE-FILE ANCHOR CAN BE QUIETLY AMBIGUOUS.
//
// The removal tool needs its OWN execute gate, its OWN authorization check and its OWN drift refusal - a
// per-entry-point guard is not a shared authority, it is a guard each entry point owes. But the moment the
// second copy existed, four mutants that had anchored on the text of the first stopped resolving, and a
// mutant that cannot resolve is not testing the second copy: it has stopped testing the first one too.
// This says WHICH copy it is aiming at, and the mutants below name their function.
function swapS1In(fnName, a, b) {
  var body = extractFn(S1, fnName);
  if (S1.split(body).length - 1 !== 1) throw new Error('function body is not unique :: ' + fnName);
  var n = body.split(a).length - 1;
  if (n !== 1) {
    throw new Error('scoped swap anchor count ' + n + ' in ' + fnName + ' :: ' + a.slice(0, 80));
  }
  return S1.split(body).join(body.split(a).join(b));
}

mut('N1 the proposal is sized from the RECOMMENDATION instead of the residual', function () {
  var m = swapS1('    prop = Math.min(row.residual_qty, a);',
    '    prop = Math.min(row.recommended_qty, a);');
  var clean = scopeOf(census(pos()), SKU);
  var bad = scopeOf(withS1(m, pos()), SKU);
  return clean.proposed_ai_allocation_qty === 380 && bad.proposed_ai_allocation_qty === 900;
});

mut('N2 the proposal ignores available_to_allocate, so a clamp is never reported', function () {
  var m = swapS1('    prop = Math.min(row.residual_qty, a);', '    prop = row.residual_qty;');
  var spec = pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 700, fac_reserved_stock: 0 }] });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  return clean.proposed_ai_allocation_qty === 180 && clean.would_clamp === true
    && bad.proposed_ai_allocation_qty === 380
    && bad.refusal_reasons.indexOf('the_proposed_quantity_does_not_exceed_available_to_allocate') >= 0;
});

mut('N3 an unknown pool is coerced to a zero-availability pool instead of refusing', function () {
  // The exact fail-open this class of census must never have: `null` becoming a number.
  var m = swapS1('  if (row.residual_qty !== null && pool && S1_qty_(pool.available_to_allocate) !== null) {',
    '  if (row.residual_qty !== null) {' + NL
    + '    if (!pool) pool = { available_to_allocate: 0, pool_row_found: false };');
  var spec = pos({ factory_stock: [] });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  return clean.proposed_ai_allocation_qty === null && bad.proposed_ai_allocation_qty === 0;
});

mut('N4 the residual is netted by the AI quantity as well as the manual one', function () {
  // Netting a run against its own previous output is the defect that makes regeneration impossible for ever.
  // The census must report the AI quantity WITHOUT subtracting it.
  var m = swapS1('  row.residual_qty = dScope ? S1_qty_(dScope.residual_qty) : null;',
    '  row.residual_qty = dScope ? S1_qty_(dScope.residual_qty) : null;' + NL
    + '  if (row.residual_qty !== null) row.residual_qty = Math.max(0, row.residual_qty'
    + '    - ((aiPlanned.byKey[key] === undefined) ? 0 : aiPlanned.byKey[key]));');
  var spec = pos({ extraHeaders: [AI_HDR], extraLines: [AI_LN] });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  return clean.residual_qty === 380 && bad.residual_qty === 280;
});

mut('N5 the census SELECTS a candidate instead of ranking them', function () {
  var m = swapS1("    L.P('at_least_one_scope_was_examined', 'more than zero', out.scopes_examined, out.scopes_examined > 0);",
    '    out.selected = out.ranked.length ? out.ranked[0] : null;' + NL
    + "    L.P('at_least_one_scope_was_examined', 'more than zero', out.scopes_examined, out.scopes_examined > 0);");
  var clean = census(pos()), bad = withS1(m, pos());
  return clean.res.selected === null
    && failed(clean.res).indexOf('no_candidate_was_silently_selected') < 0
    && bad.res.selected !== null
    && failed(bad.res).indexOf('no_candidate_was_silently_selected') >= 0;
});

mut('N6 the residual proof is dropped, so a fully-covered scope becomes a positive-residual candidate',
function () {
  // `the_row_belongs_to_the_accepted_run` is deliberately NOT mutated here: bySite only ever holds rows at
  // the accepted date, so that proof cannot be made to fail through any world this harness can build. It is
  // defence in depth against that set widening, and it is asserted to EXIST (F3d) rather than probed.
  var m = swapS1("  C.P('residual_qty_is_finite_and_greater_than_zero', 'a finite number > 0', row.residual_qty,",
    "  C.P('residual_qty_is_finite_and_greater_than_zero', 'a finite number > 0', row.residual_qty," + NL
    + '    true ||');
  // The proved W6-W7-W5-W1 world: recommended 160 against 520 already planned. Residual zero.
  var spec = pos({ gap: { d18_gap_qty: 0, d18_suggested_qty: 0, d30_suggested_qty: 0,
    d45_suggested_qty: 0, d90_gap_qty: 160, d90_suggested_qty: 160 } });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  var NM = 'residual_qty_is_finite_and_greater_than_zero';
  return clean.residual_qty === 0 && clean.is_candidate === false
    && clean.refusal_reasons.indexOf(NM) >= 0
    && bad.refusal_reasons.indexOf(NM) === -1;
});

mut('N7b the pool is filtered to the requesting company, partitioning a shared factory', function () {
  // The single defect KMFSG exists to prevent, injected into the CENSUS's pool lookup: only pools whose
  // warehouse belongs to this company are considered. Two companies then each plan the same cartons.
  var m = swapS1('    if (S1_str_(p.sku).toUpperCase() === sku.toUpperCase()) poolCandidates.push(p);',
    '    if (S1_str_(p.sku).toUpperCase() === sku.toUpperCase()' + NL
    + '      && S1_str_(p.warehouse_id).indexOf("FW-XX") === 0) poolCandidates.push(p);');
  var spec = pos({ factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 100 }] });
  var clean = scopeOf(census(spec), SKU), bad = scopeOf(withS1(m, spec), SKU);
  // The clean run finds the pool by the recommendation's named warehouse; the mutant loses the candidate
  // list, so the ambiguity proof and the pool proof can no longer both hold.
  return clean.is_candidate === true
    && (bad.is_candidate === false || bad.pool === null || bad.pool_candidates.length === 0);
});

mut('N8 MISSING is coerced to zero by the census\'s own numeric reader', function () {
  // Measured first: KMFSG parses factory_stock itself, so this reader never gated that number and mutating
  // it could not change the pool. What it DOES gate is every quantity the census reads back from an
  // authority, so the claim is aimed at its own contract — blank, null and undefined are UNKNOWN, not zero.
  var m = swapS1('function S1_qty_(v) {' + NL + "  if (v === '' || v === null || v === undefined) return null;",
    'function S1_qty_(v) {' + NL + "  if (v === '' || v === null || v === undefined) return 0;");
  var w = S1World(pos()), w2 = S1World({ s1: m });
  function probe(ctx) {
    return vm.runInContext('[S1_qty_(""), S1_qty_(null), S1_qty_(undefined), S1_qty_(0), S1_qty_(7)]', ctx);
  }
  var clean = probe(w.ctx), bad = probe(w2.ctx);
  return JSON.stringify(clean) === JSON.stringify([null, null, null, 0, 7])
    && JSON.stringify(bad) === JSON.stringify([0, 0, 0, 0, 7]);
});

mut('N9 the manifests stop declaring that one does not authorize the other', function () {
  var m = swapS1("    boundary_note: 'MANIFEST P succeeding does NOT authorize MANIFEST S. They are separate because a Generate'",
    "    boundary_note: 'MANIFEST P and MANIFEST S may be authorized together. A Generate'");
  var w = S1World(pos()); var w2 = S1World({ s1: m });
  var clean = vm.runInContext('RUN_S1_MANIFEST_P()', w.ctx);
  var bad = vm.runInContext('RUN_S1_MANIFEST_P()', w2.ctx);
  return String(clean.boundary_note).indexOf('does NOT authorize MANIFEST S') > 0
    && String(bad.boundary_note).indexOf('does NOT authorize MANIFEST S') === -1;
});

mut('N10 the submit census reports a readiness verdict when no draft was named', function () {
  var m = swapS1("      out.verdict = L.failed.length ? 'STOP' : 'CONTRACT_ONLY_NO_DRAFT_NAMED';",
    "      out.verdict = L.failed.length ? 'STOP' : 'SUBMIT_READY_AUTHORIZATION_REQUIRED';");
  var clean = submitCensus(pos());
  var w2 = S1World({ s1: m });
  var bad = vm.runInContext('RUN_S1_SUBMIT_READINESS_CENSUS(null)', w2.ctx);
  return clean.res.verdict === 'CONTRACT_ONLY_NO_DRAFT_NAMED'
    && bad.verdict === 'SUBMIT_READY_AUTHORIZATION_REQUIRED';
});

mut('N11 a terminal draft passes the submit gate', function () {
  var m = swapS1("      st !== 'submitted' && st !== 'cancelled' && st !== 'expired');",
    '      true);');
  var spec = subWorld({ status: 'cancelled', draft_version: '1' });
  var clean = submitCensus(spec, 'AI-NEW-1');
  var w2 = S1World((function () { var s = {}; Object.keys(spec).forEach(function (k) { s[k] = spec[k]; }); s.s1 = m; return s; })());
  var bad = vm.runInContext('RUN_S1_SUBMIT_READINESS_CENSUS("AI-NEW-1")', w2.ctx);
  var NM = 'the_draft_is_not_terminal';
  return failed(clean.res).indexOf(NM) >= 0 && failed(bad).indexOf(NM) === -1;
});

mut('N12 the exposure delta is declared non-zero, so Submit would look like it creates exposure', function () {
  var m = swapS1('        delta_total_exposure: 0,', '        delta_total_exposure: 380,');
  var clean = submitCensus(subWorld({ draft_version: '1' }), 'AI-NEW-1');
  var spec = subWorld({ draft_version: '1' });
  var w2 = S1World((function () { var s = {}; Object.keys(spec).forEach(function (k) { s[k] = spec[k]; }); s.s1 = m; return s; })());
  var bad = vm.runInContext('RUN_S1_SUBMIT_READINESS_CENSUS("AI-NEW-1")', w2.ctx);
  return clean.res.expected_shipping_plan.before_after_exposure.delta_total_exposure === 0
    && bad.expected_shipping_plan.before_after_exposure.delta_total_exposure !== 0;
});

// ---- N13-N18  S1-W1: the universe, the fail-closed half, and the log. ----------------------------------

function gapDiagWith(src, spec) {
  var sp = {}; Object.keys(spec || {}).forEach(function (k) { sp[k] = spec[k]; });
  sp.s1 = src;
  var w = S1World(sp);
  return { res: vm.runInContext('RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC()', w.ctx), world: w };
}

mut('N13 the census requires EVERY table pair to be readable again — the exact production STOP', function () {
  var m = swapS1('    var notOk = eligiblePairKeys.filter(function (pk) { return !(canByPair[pk] && canByPair[pk].ok === true); });',
    '    var notOk = pairKeys.filter(function (pk) { return !(canByPair[pk] && canByPair[pk].ok === true); });');
  var spec = pos({ extraGap: [FOREIGN_PAIR] });
  var clean = census(spec), bad = withS1(m, spec);
  var NM = 'the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair';
  return clean.res.verdict === 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED'
    && failed(clean.res).indexOf(NM) === -1
    && bad.res.verdict === 'STOP' && failed(bad.res).indexOf(NM) >= 0
    && bad.res.scopes_examined === 0;
});

mut('N14 an UNREADABLE eligible pair is accepted, so the fail-closed half is lost', function () {
  // The predicate NAME now appears in BOTH entry points, so the anchor carries the pass expression from the
  // census's own copy to stay unique.
  var m = swapS1('      !!(out.accepted_run && out.accepted_run.ok) && notOk.length === 0);',
    '      true);');
  var spec = pos({ gap: { calculation_date: '2026-08-01' } });
  var NM = 'the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair';
  var clean = census(spec), bad = withS1(m, spec);
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N15 the eligible universe falls back to the whole gap table when the allowlist is empty', function () {
  var m = swapS1('  out.ok = out.scopes.length > 0;' + NL + "  if (!out.ok) out.reason = 'AI_PLAN_SCOPE_NOT_ENABLED';",
    '  out.ok = true;');
  var spec = pos({ allowlist: [], extraGap: [FOREIGN_PAIR] });
  var NM = 'the_eligible_pair_universe_is_derived_from_the_activation_allowlist';
  var clean = census(spec), bad = withS1(m, spec);
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N16 the eligibility gate stops being re-asked, so a blank allowlist entry becomes eligible', function () {
  // 61_ re-asks inventoryAiPlanScopeEnabled_ per entry rather than trusting the list, precisely so a blank
  // or ALL entry can never pass. This census must do the same or it would report a scope production refuses.
  var m = swapS1('    if (!inventoryAiPlanScopeEnabled_(c, k, m, sk)) return;',
    '    if (false) return;');
  var spec = pos({ allowlist: [{ company: 'ResEU', country: 'DE', marketplace: 'ALL_SITES', sku: 'ALL' }],
    extraGap: [FOREIGN_PAIR] });
  var clean = gapDiag(spec), bad = gapDiagWith(m, spec);
  return clean.res.root_cause_class === 'SCOPE_GUARD_UNAVAILABLE'
    && bad.res.eligible.eligible_pairs.indexOf('ResEU|DE') >= 0;
});

mut('N17 the chunk bound goes back to 45000, which is what truncated the evidence', function () {
  var m = swapS1('var S1_CHUNK_MAX_BYTES_ = 3000;', 'var S1_CHUNK_MAX_BYTES_ = 45000;');
  var w = S1World(pos()), w2 = S1World({ s1: m });
  return vm.runInContext('S1_CHUNK_MAX_BYTES_', w.ctx) === 3000
    && vm.runInContext('S1_CHUNK_MAX_BYTES_', w2.ctx) === 45000;
});

mut('N18 the whole per-module deployment manifest goes back into the payload', function () {
  // S1-R4B — RE-ANCHORED. The summary is no longer hand-rolled from `_dep`; it is projected from
  // S1_deploymentContract_'s normalized result, so the old anchor matched nothing. The mutant is the
  // same one: put the 23 per-module rows back into the object that gets logged.
  var m = swapS1('  out.deployment = {\n    // `readable` is the SHAPE answer',
    '  out.deployment = {\n    modules: sysModuleBuildStamps_().modules,\n    // `readable` is the SHAPE answer');
  var clean = census(pos()), bad = withS1(m, pos());
  return clean.res.environment.deployment.modules === undefined
    && Object.prototype.toString.call(bad.res.environment.deployment.modules) === '[object Array]'
    && bad.res.environment.deployment.modules.length > 0;
});

mut('N19 a DATA_NOT_READY eligible pair is misreported as this census\'s own defect', function () {
  // The two root causes have opposite next actions — one is a Gap Job question and one is a code question —
  // so mixing them up sends the operator to the wrong place with a confident answer.
  var m = swapS1('    } else if (eligUnreadable.length) {' + NL
    + "      out.verdict = 'STOP';" + NL
    + "      out.root_cause_class = 'DATA_NOT_READY';",
    '    } else if (eligUnreadable.length) {' + NL
    + "      out.verdict = 'ELIGIBLE_PAIRS_READABLE';" + NL
    + "      out.root_cause_class = 'DIAGNOSTIC_UNIVERSE_TOO_WIDE';");
  var spec = pos({ gap: { calculation_date: '2026-08-01' } });
  var clean = gapDiag(spec), bad = gapDiagWith(m, spec);
  return clean.res.root_cause_class === 'DATA_NOT_READY' && clean.res.verdict === 'STOP'
    && bad.res.root_cause_class === 'DIAGNOSTIC_UNIVERSE_TOO_WIDE';
});

mut('N20 the run id is read off the gap row again, so a resolvable one reports null', function () {
  var m = swapS1("  row.calculation_run_id = (out.accepted_run.lineage && out.accepted_run.lineage.run_id) || null;",
    '  row.calculation_run_id = mine ? (S1_str_(mine.calculation_run_id) || null) : null;');
  var clean = scopeOf(census(pos()), SKU), bad = scopeOf(withS1(m, pos()), SKU);
  return clean.calculation_run_id === 'GAP-INV-20260905-0300' && bad.calculation_run_id === null;
});


function withS1P(src, spec) {
  var s = {};
  Object.keys(spec || {}).forEach(function (k) { s[k] = spec[k]; });
  s.s1 = src;
  var w = S1World(s);
  var out = null, threw = null;
  try { out = vm.runInContext('RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS()', w.ctx); }
  catch (e) { threw = e; }
  return { res: out || {}, threw: threw, world: w };
}

mut('N21 the row class is taken from the target set again — the exact production misclassification', function () {
  // Restore the defect: `decision.reason` copied straight into the row. In the production shape it makes an
  // identity with residual 700 report FULLY_COVERED_BY_ACTIVE_PLAN, because the ALLOWLISTED scope is covered.
  // NOTE: restoring `decision.reason` would change nothing now — `decision` is the SINGLE-SCOPE ask, so
  // it is already this row's own answer. The defect was the TARGET SET's decision, and that is what gets
  // restored here: the aggregate over the allowlist's scopes, printed onto a row it does not describe.
  var m = swapS1('  row.no_action_reason = cls.class;',
    '  row.no_action_reason = setDecision ? (setDecision.reason || null) : null;');
  var clean = scopeOf(census(PSHAPE), OTHER2), bad = scopeOf(withS1(m, PSHAPE), OTHER2);
  return clean.no_action_reason === 'RESIDUAL_REMAINS'
    && bad.no_action_reason === 'FULLY_COVERED_BY_ACTIVE_PLAN'
    && bad.residual_qty === 700;
});

mut('N22 a null residual is admitted to the coverage branch', function () {
  // The single most dangerous fail-open in the classifier: MISSING read as zero.
  var m = swapS1('  if (d === null) { out.refusal = \'RESIDUAL_QTY_IS_NOT_A_FINITE_NUMBER\'; return out; }',
    '  if (d === null) { d = 0; }');
  var w = S1World(pos()), wb = S1World((function () { var s = pos(); s.s1 = m; return s; })());
  function cl(ctx) {
    return vm.runInContext('S1_rowNoActionClass_("NONZERO_RECOMMENDATION",160,520,null).class', ctx);
  }
  return cl(w.ctx) === 'UNKNOWN' && cl(wb.ctx) === 'FULLY_COVERED_BY_ACTIVE_PLAN';
});

mut('N23 an unrecognised recommendation state falls through into coverage', function () {
  var m = swapS1('  if (S1_RECOMMENDATION_STATES_.indexOf(st) === -1) {',
    '  if (false && S1_RECOMMENDATION_STATES_.indexOf(st) === -1) {');
  var w = S1World(pos()), wb = S1World((function () { var s = pos(); s.s1 = m; return s; })());
  function cl(ctx) { return vm.runInContext('S1_rowNoActionClass_("BOGUS_STATE",160,520,0).class', ctx); }
  return cl(w.ctx) === 'UNKNOWN' && cl(wb.ctx) === 'FULLY_COVERED_BY_ACTIVE_PLAN';
});

mut('N24 the row state is taken from the target set instead of the single-scope ask', function () {
  // The other half of the grain defect: the STATE, rather than the reason. An identity the authority never
  // evaluated then claims NONZERO_RECOMMENDATION because a DIFFERENT scope in the set is nonzero.
  var m = swapS1('  row.recommendation_state = recState ? recState.state : null;\n'
    + '  row.recommendation_state_grain =',
    '  row.recommendation_state = setState ? setState.state : null;\n'
    + '  row.recommendation_state_grain =');
  // A world where the allowlisted scope is NONZERO and the other identity is NOT READY, so its own state is
  // MISSING and the set's is not.
  var spec = pos({ extraGap: [{ sku: OTHER2, calculation_status: 'PENDING' }],
    factory_stock: [{ warehouse_id: WHF, sku: SKU, fac_current_stock: 2000, fac_reserved_stock: 100 }] });
  var clean = scopeOf(census(spec), OTHER2), bad = scopeOf(withS1(m, spec), OTHER2);
  return clean.recommendation_state === 'MISSING_RECOMMENDATION'
    && bad.recommendation_state === 'NONZERO_RECOMMENDATION';
});

mut('N25 the readiness census drops the allowlist condition, so any identity in the pair becomes a candidate',
function () {
  var m = swapS1('      row.currently_allowlisted, row.currently_allowlisted === true);',
    '      row.currently_allowlisted, true);');
  var clean = scopeOf(census(PSHAPE), OTHER2), bad = scopeOf(withS1(m, PSHAPE), OTHER2);
  var NM = 'the_scope_is_in_the_current_activation_allowlist';
  return clean.is_candidate === false && clean.refusal_reasons.indexOf(NM) >= 0
    && bad.is_candidate === true && bad.refusal_reasons.indexOf(NM) === -1;
});

mut('N26 activation_ready stops requiring the allowlist, so a proposal looks executable', function () {
  var m = swapS1('  row.activation_ready = row.is_candidate === true && row.currently_allowlisted === true;',
    '  row.activation_ready = row.is_candidate === true;');
  var clean = withS1P(S1, PSHAPE), bad = withS1P(m, PSHAPE);
  var NM = 'no_proposal_outside_the_allowlist_is_marked_activation_ready';
  function p(r) { return (r.res.proposals || [])[0] || {}; }
  return p(clean).activation_ready === false && clean.res.activation_ready_count === 0
    && failed(clean.res).indexOf(NM) < 0
    && p(bad).activation_ready === true
    && failed(bad.res).indexOf(NM) >= 0 && bad.res.verdict === 'STOP';
});

mut('N27 the proposal census falls back to the whole gap table when the allowlist is empty', function () {
  // A discovery range that widens when the guard goes missing is the opposite of a guard.
  var m = swapS1('    if (!elig.ok) {\n'
    + "      out.stop_reason = 'the discovery range is empty: ' + (elig.reason || 'AI_PLAN_SCOPE_NOT_ENABLED');",
    '    if (false && !elig.ok) {\n'
    + "      out.stop_reason = 'the discovery range is empty: ' + (elig.reason || 'AI_PLAN_SCOPE_NOT_ENABLED');");
  var spec = pos({ allowlist: [], extraGap: [FOREIGN2] });
  var clean = withS1P(S1, spec), bad = withS1P(m, spec);
  var NM = 'the_discovery_range_is_derived_from_the_activation_allowlist';
  return clean.res.verdict === 'STOP' && clean.res.identities_examined === 0
    && failed(clean.res).indexOf(NM) >= 0
    // The mutant proceeds past the empty range; the predicate still fails, and that is the point: the STOP
    // must not depend on the early return alone.
    && failed(bad.res).indexOf(NM) >= 0 && bad.res.verdict === 'STOP';
});

mut('N28 the proposal census examines pairs outside the allowlist', function () {
  // The range is widened to every (company, country) the gap TABLE holds — the W1 defect, moved into the
  // discovery census. It is a different code path from N27: the allowlist here is non-empty and correct.
  var m = swapS1('    var canByPair = {}, dates = {}, unreadable = [];',
    '    (gapReadObjects_(ss, "inventory_replenishment_gap") || []).forEach(function (gr) {\n'
    + '      var pk = S1_str_(gr.company) + "|" + S1_str_(gr.country);\n'
    + '      if (!S1_str_(gr.company) || !S1_str_(gr.country) || elig.pairs.indexOf(pk) !== -1) return;\n'
    + '      elig.pairs.push(pk);\n'
    + '      elig.pair_index[pk] = { company: S1_str_(gr.company), country: S1_str_(gr.country) };\n'
    + '    });\n'
    + '    var canByPair = {}, dates = {}, unreadable = [];');
  // The foreign pair's rows are in the same table. The clean run never reaches them.
  var spec = pos({ extraGap: [FOREIGN2] });
  var clean = withS1P(S1, spec), bad = withS1P(m, spec);
  function has(r) {
    return (r.res.rejection_index || []).concat((r.res.proposals || []).map(function (x) {
      return { scope_key: x.scope_key }; })).filter(function (x) {
      return String(x.scope_key).indexOf('ResEU') === 0; }).length > 0;
  }
  return has(clean) === false && clean.res.identities_examined >= 1 && has(bad) === true;
});

mut('N29 the rejection roll-up logs the whole refusal set instead of counts', function () {
  var m = swapS1("    S1_log_('s1_proposal_rejection_counts', JSON.stringify({ total: out.rejection_index.length,\n"
    + '      by_first_reason: out.rejection_counts, samples: out.rejection_samples.slice(0, 3) }));',
    "    S1_log_('s1_proposal_rejection_counts', JSON.stringify({ total: out.rejection_index.length,\n"
    + '      by_first_reason: out.rejection_counts, samples: out.rejection_samples,\n'
    + '      every_rejection: out.rejection_index }));');
  // 40 refused identities in the eligible pair: a count stays one short line, the full set does not.
  var many = [];
  for (var i = 0; i < 40; i++) {
    many.push({ sku: 'BULK-' + i, calculation_status: 'READY', d18_suggested_qty: 0,
      d30_suggested_qty: 0, d45_suggested_qty: 0, d90_suggested_qty: 0 });
  }
  var spec = pos({ extraGap: many });
  function sizeOf(r) {
    var l = (r.world.log || []).filter(function (x) { return /s1_proposal_rejection_counts/.test(String(x)); })[0];
    return String(l || '').length;
  }
  var clean = withS1P(S1, spec), bad = withS1P(m, spec);
  return clean.res.rejection_index.length >= 40 && sizeOf(clean) < 3000 && sizeOf(bad) > 3000;
});

mut('N30 the chunk-count bound is removed, so the payload floods the log again', function () {
  // S1-W4 — DISAMBIGUATED. A second, separate bound now guards the FREEZE block, so the bare line
  // appears twice. This mutant is about the PAYLOAD bound; the freeze bound has its own.
  // S1-R4A — RE-ANCHORED. The divisor is now the per-tag LINE budget rather than S1_CHUNK_MAX_BYTES_, so the
  // old anchor matched nothing and the probe reported a PROBE ERROR instead of a caught mutant.
  var m = swapS1('var s = String(text == null ? \'\' : text), n = Math.ceil(s.length / budget) || 1;'+NL
    + '  if (n > S1_LOG_MAX_CHUNKS_) {',
    'var s = String(text == null ? \'\' : text), n = Math.ceil(s.length / budget) || 1;'+NL
    + '  if (false) {');
  function chunks(src) {
    var s = {}; Object.keys(pos()).forEach(function (k) { s[k] = pos()[k]; });
    s.s1 = src;
    var w = S1World(s);
    return vm.runInContext('S1_emitChunked_("s1_payload", new Array(60000).join("x"))', w.ctx);
  }
  // The expected count is DERIVED from the budget, not spelled: a literal here would have to be edited every
  // time the framing changes, and the claim is "over the bound emits nothing", not "emits exactly 20".
  var probeCtx = S1World(pos()).ctx;
  var want = Math.ceil(59999 / vm.runInContext('S1_chunkBudget_("s1_payload")', probeCtx));
  return chunks(S1) === 0 && chunks(m) === want
    && want > vm.runInContext('S1_LOG_MAX_CHUNKS_', probeCtx);
});

mut('N31 the no-candidate verdict goes back to sounding like a statement about the whole pair', function () {
  var m = swapS1("      : (L.failed.length ? 'STOP' : 'NO_POSITIVE_RESIDUAL_CANDIDATE_IN_CURRENT_ALLOWLIST');",
    "      : (L.failed.length ? 'STOP' : 'NO_POSITIVE_RESIDUAL_CANDIDATE');");
  var clean = census(PSHAPE), bad = withS1(m, PSHAPE);
  return clean.res.verdict === 'NO_POSITIVE_RESIDUAL_CANDIDATE_IN_CURRENT_ALLOWLIST'
    && bad.res.verdict === 'NO_POSITIVE_RESIDUAL_CANDIDATE';
});


function withMP(src, spec) {
  var s = {};
  Object.keys(spec || {}).forEach(function (k) { s[k] = spec[k]; });
  s.s1 = src;
  var w = S1World(s);
  var out = null, threw = null;
  try { out = vm.runInContext('RUN_S1_MANIFEST_P()', w.ctx); } catch (e) { threw = e; }
  return { res: out || {}, threw: threw, world: w };
}
function mpChunks(w) {
  return logTags(w).filter(function (n) { return /^s1_manifest_p_freeze_paste_block_/.test(n); }).length;
}

mut('N32 the manifest goes back to printing a static contract instead of measuring', function () {
  // THE EXACT PRODUCTION SHAPE: no census run, so no verdict, no evidence and no baseline. A manifest that
  // does not measure must never be able to report READY.
  var m = swapS1("    var cen = RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS({ quiet: true });",
    "    var cen = { verdict: 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED', predicates_failed: 0,\n"
    + "      failed_predicates: [], candidates: [], rejected: [], writes: 0, writer_calls: 0,\n"
    + "      scopes_examined: 0, environment: null, schema: null, accepted_run: null, factory: null };");
  var clean = manifestP(pos()), bad = withMP(m, pos());
  return clean.res.verdict === 'READY_TO_AUTHORIZE' && clean.res.census.ran_live === true
    && bad.res.verdict === 'STOP' && bad.res.freeze_paste_block === null
    && mpChunks(bad.world) === 0 && bad.res.operator_authorization_wording === null;
});

mut('N33 LOCK ONE is removed, so a STOP keeps its freeze block', function () {
  var m = swapS1("      out.freeze_paste_block = null;\n"
    + "      if (!out.stop_reason) {",
    "      if (!out.stop_reason) {");
  var spec = pos({ allowlist: [] });
  var clean = manifestP(spec), bad = withMP(m, spec);
  // LOCK TWO still refuses to EMIT it, which is the point of having two: the block is present on the
  // returned object and no chunk reaches the log.
  return clean.res.verdict === 'STOP' && clean.res.freeze_paste_block === null
    && bad.res.verdict === 'STOP' && mpChunks(bad.world) === 0;
});

mut('N34 LOCK TWO is removed, so the emitter no longer checks the verdict it was handed', function () {
  var m = swapS1('  var ready = verdict === \'READY_TO_AUTHORIZE\';', '  var ready = true;');
  // With the emitter trusting its caller, only LOCK ONE stands. Probed by handing the emitter a STOP
  // directly, which is what a later edit inside the manifest would effectively do.
  var w = S1World(pos()), w2 = S1World({ s1: m, gap: POS.gap, factory_stock: POS.factory_stock });
  var cleanN = vm.runInContext("S1_emitFreeze_('probe', 'BASELINE', 'STOP', 'because')", w.ctx);
  var badN = vm.runInContext("S1_emitFreeze_('probe', 'BASELINE', 'STOP', 'because')", w2.ctx);
  return cleanN === 0 && badN >= 1
    && logTags(w).indexOf('probe_freeze_withheld') >= 0
    && logTags(w2).filter(function (n) { return /^probe_freeze_paste_block_/.test(n); }).length >= 1;
});

mut('N35 LOCK THREE is removed, so a placeholder sentence reads as an authorization', function () {
  // The defect this round repaired, injected as a wording builder that returns the old template.
  // S1-R4A — the builder now takes the write set and the identity sets too, so the anchor carries the new
  // signature. Same mutant: the wording goes back to a template with nothing measured in it.
  // S1-R4C — the builder also takes the factory + reservation baseline now, so the anchor moved again.
  var m = swapS1("function S1_authWordingP_(cand, acceptedRun, scope, ws, ids, content, surf, resv) {\n"
    + "  if (!cand || !scope) return null;",
    "function S1_authWordingP_(cand, acceptedRun, scope, ws, ids, content, surf, resv) {\n"
    + "  return 'I authorize ONE controlled generation for <company> / <country> / <marketplace> / <sku>"
    + " against run <calculation_run_id> with residual <residual_qty>. IT DOES NOT AUTHORIZE SUBMIT.';\n"
    + "  // eslint-disable-next-line no-unreachable\n"
    + "  if (!cand || !scope) return null;");
  var clean = manifestP(pos()), bad = withMP(m, pos());
  var cw = String(clean.res.operator_authorization_wording);
  return clean.res.verdict === 'READY_TO_AUTHORIZE'
    && (cw.match(/<[a-zA-Z_]+>/g) || []).length === 0
    // The guard catches it: the READY is downgraded, the block is withheld and the sentence is dropped.
    && bad.res.verdict === 'STOP'
    && String(bad.res.stop_reason).indexOf('placeholders') > 0
    && bad.res.freeze_paste_block === null && mpChunks(bad.world) === 0
    && bad.res.operator_authorization_wording === null;
});

mut('N36 the evidence-gap check becomes advisory, so nulls are admitted into the baseline', function () {
  var m = swapS1("    L.P('every_required_piece_of_evidence_is_present_and_readable', [], gaps, gaps.length === 0);",
    "    L.P('every_required_piece_of_evidence_is_present_and_readable', [], gaps, true);");
  // A world where the run lineage cannot resolve: the run id is a required field and becomes null.
  var spec = pos({ gapJob: null });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'every_required_piece_of_evidence_is_present_and_readable';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N37 the baseline is built even when a condition already failed', function () {
  // RE-AIMED. The first version used an EMPTY-allowlist world, where `out.scope` is null and building the
  // freeze throws before it can finish — so the mutant produced no baseline and looked caught by a
  // defence nobody designed. The honest world is one where the scope and the candidate are fully
  // measured and a LATER condition refuses: a deployment reporting a build nobody measured on.
  var m = swapS1('    if (L.failed.length === 0) {\n      var freeze = {',
    '    if (true) {\n      var freeze = {');
  var spec = pos(OTHER_BUILD);
  var clean = manifestP(spec), bad = withMP(m, spec);
  // RE-AIMED AGAIN in S1-R4C. LOCK FIVE now nulls `frozen_before` on every STOP, so `frozen_before !== null`
  // stopped being observable and this mutant survived — the same shape as R4B's N61: aimed at something a
  // new lock had made redundant. The fact the guard actually protects is WHETHER A BASELINE WAS BUILT AT
  // ALL, and that is visible in two places that LOCK FIVE does not touch: the withheld reason distinguishes
  // 'NOT_BUILT' from 'built, then held back', and the freeze-completeness conditions can only appear in the
  // ledger if there was a freeze to check. A refused run must have nothing to withhold.
  var names = function (r) { return (r.res.predicates || []).map(function (p) { return p.predicate; }); };
  return clean.res.verdict === 'STOP' && bad.res.verdict === 'STOP'
    && String(clean.res.freeze_withheld_reason).indexOf('NOT_BUILT') === 0
    && String(bad.res.freeze_withheld_reason).indexOf('NOT_BUILT') !== 0
    && names(clean).indexOf('the_frozen_baseline_carries_every_required_field') === -1
    && names(bad).indexOf('the_frozen_baseline_carries_every_required_field') >= 0
    // and both still leak nothing, which is what having five locks is for
    && clean.res.frozen_before === null && bad.res.frozen_before === null
    && mpChunks(clean.world) === 0 && mpChunks(bad.world) === 0;
});

mut('N38 an absent reservations table is read as a row count of zero', function () {
  // The fail-open a baseline must never contain: "I could not look" recorded as "there was nothing there".
  var m = swapS1("    o.observation_state = 'SHEET_ABSENT';",
    "    o.observation_state = 'SHEET_ABSENT';\n    o.row_count = 0;");
  var clean = manifestP(pos()), bad = withMP(m, pos());
  return clean.res.reservation_observation.row_count === null
    && clean.res.frozen_before.reservation_row_count === null
    && bad.res.reservation_observation.row_count === 0
    && bad.res.frozen_before.reservation_row_count === 0;
});

mut('N39 an over-long baseline is truncated to fit the log instead of refusing', function () {
  var m = swapS1('  if (n > S1_LOG_MAX_CHUNKS_) {\n'
    + "    S1_log_(tag + '_freeze_withheld', JSON.stringify({ verdict: verdict, chunks: 0, paste_into: null,",
    '  if (false) {\n'
    + "    S1_log_(tag + '_freeze_withheld', JSON.stringify({ verdict: verdict, chunks: 0, paste_into: null,");
  var big = new Array(50000).join('x');
  var w = S1World(pos()), w2 = S1World({ s1: m, gap: POS.gap, factory_stock: POS.factory_stock });
  var cleanN = vm.runInContext("S1_emitFreeze_('probe', " + JSON.stringify(big) + ", 'READY_TO_AUTHORIZE', null)", w.ctx);
  var badN = vm.runInContext("S1_emitFreeze_('probe', " + JSON.stringify(big) + ", 'READY_TO_AUTHORIZE', null)", w2.ctx);
  return cleanN === 0 && badN > 12
    && logTags(w).indexOf('probe_freeze_withheld') >= 0;
});

mut('N40 the candidate is no longer required to BE the allowlisted scope', function () {
  var m = swapS1("    L.P('the_single_candidate_is_the_single_allowlisted_scope',\n"
    + "      out.scope ? out.scope.scope_key : null, cand ? cand.scope_key : null,\n"
    + "      !!cand && !!out.scope && cand.scope_key === out.scope.scope_key);",
    "    L.P('the_single_candidate_is_the_single_allowlisted_scope',\n"
    + "      out.scope ? out.scope.scope_key : null, cand ? cand.scope_key : null, !!cand);");
  var NM = 'the_single_candidate_is_the_single_allowlisted_scope';
  var clean = manifestP(pos()), bad = withMP(m, pos());
  // The clean run passes it because they DO match; the probe is that the condition still discriminates,
  // shown by handing it a candidate whose key differs from the allowlisted scope's.
  return failed(clean.res).indexOf(NM) < 0
    && !!predOf(clean.res, NM) && predOf(clean.res, NM).pass === true
    && JSON.stringify(predOf(bad.res, NM).observed) === JSON.stringify(predOf(clean.res, NM).observed)
    && String(vm.runInContext('String(RUN_S1_MANIFEST_P)', S1World({ s1: m, gap: POS.gap,
      factory_stock: POS.factory_stock }).ctx)).indexOf('cand.scope_key === out.scope.scope_key') === -1;
});

mut('N41 the baseline-destination check is dropped, so a freeze overwrites an earlier one', function () {
  var occupied = "var S1_MANIFEST_P_BEFORE_ = { frozen_at: 'an earlier run' };";
  var withOccupied = S1.split('var S1_MANIFEST_P_BEFORE_ = null;').join(occupied);
  var m = withOccupied.split(
    "    L.P('the_baseline_destination_is_empty_so_nothing_is_being_overwritten', null,")
    .join("    L.P('the_baseline_destination_is_empty_so_nothing_is_being_overwritten', null, null, true) || L.P('_unused', null,");
  if (m === withOccupied) throw new Error('destination anchor missing');
  var spec = { gap: POS.gap, factory_stock: POS.factory_stock };
  var clean = withMP(withOccupied, spec), bad = withMP(m, spec);
  var NM = 'the_baseline_destination_is_empty_so_nothing_is_being_overwritten';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && bad.res.verdict === 'READY_TO_AUTHORIZE' && mpChunks(bad.world) >= 1;
});

mut('N42 the deployment-build gate takes its expectation from the deployment it is checking', function () {
  // An expected value read from the observed value is a comparison with itself: it cannot fail, and a gate
  // that cannot fail is not a gate.
  // S1-R4B — RE-ANCHORED onto the repaired predicate AND the helper behind it. Same mutant: take the
  // EXPECTATION from the object being checked, at every layer, so each comparison compares a value with
  // itself. §6 is written the way it is because of exactly this shape.
  var m = swapS1('  o.build_matches = o.deployment_build === null ? null'
    + ' : (o.deployment_build === S1_BUILD_);',
    '  o.build_matches = o.deployment_build === null ? null : true;');
  m = m.split('    expected_build: S1_BUILD_,')
    .join('    expected_build: null, __self_compare: 1,');
  m = m.split('  o.build_matches = o.deployment_build')
    .join('  o.expected_build = o.deployment_build;\n  o.build_matches = o.deployment_build');
  m = m.split("    stop('DEPLOYMENT_BUILD_IS_NOT_THE_ONE_THIS_MANIFEST_WAS_WRITTEN_AGAINST")
    .join("    if (false) stop('DEPLOYMENT_BUILD_IS_NOT_THE_ONE_THIS_MANIFEST_WAS_WRITTEN_AGAINST");
  m = m.split('dep.deployment_build === S1_BUILD_ && dep.build_matches === true')
    .join('dep.build_matches === true');
  m = m.split('&& dep.expected_build === S1_BUILD_);').join(');');
  // The build literal here was collateral damage from S1-R4A's section rename (R4->W4 etc. inside a string),
  // and the stub carried the invented `available` field. Both replaced by the real shape with ONE field moved.
  var spec = pos({ stamps: stampsWith_({
    deployment_build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9' }) });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'the_deployment_build_is_the_one_this_manifest_was_written_against';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});


mut('N54 the factory-surface id column is guessed instead of taken from the authority', function () {
  // The defect that shipped in the first version of this round: invented column names. Against a real sheet
  // the ids resolve to nothing, so the baseline lists blanks while appearing to list identities.
  var m = swapS1("      id_authority: '21_ MOV_HEADERS[0] (spelled — no module constant to read)' },",
    "      id_authority: 'guessed' },").split("id: 'factory_stock_movement_id',").join("id: 'movement_id',");
  var clean = manifestP(pos()), bad = withMP(m, pos());
  var NM = 'every_factory_write_surface_is_either_readable_or_honestly_absent';
  var cs = clean.res.factory_surfaces.surfaces['factory_stock_movements'];
  var bs = bad.res.factory_surfaces.surfaces['factory_stock_movements'];
  return clean.res.verdict === 'READY_TO_AUTHORIZE' && cs.id_column_resolved === true
    && cs.ids.length === 1 && cs.ids[0] === 'MV-1'
    // The mutant cannot resolve its guessed column, and that is REPORTED rather than filled with blanks.
    && bs.id_column_resolved === false && bs.ids === null
    && bad.res.verdict === 'STOP' && failed(bad.res).indexOf(NM) >= 0
    && bad.res.freeze_paste_block === null && mpChunks(bad.world) === 0;
});

mut('N43 the write set falls back to the EXISTING AI identities — the exact W4 defect', function () {
  // The shape this round repaired, injected: `expected` is fed the rows that already exist. On the READY
  // world that is [] and 0, so the manifest would report a create of nothing and the sentence would say
  // "across 0 superseded AI identities" about a run that writes a header and a line.
  var m = swapS1('    expected_header_ids: (ws.expected_header_ids || []).slice().sort(),'+NL
    + '        expected_line_ids: (ws.expected_line_ids || []).slice().sort(),',
    '    expected_header_ids: (ids.existing_active_ai_identities || []).slice().sort(),'+NL
    + '        expected_line_ids: (ids.existing_active_ai_identities || []).slice().sort(),');
  var clean = manifestP(pos()), bad = withMP(m, pos());
  // WHAT CAUGHT IT, AFTER IT FIRST SURVIVED. Presence of the field was checked; AGREEMENT with the
  // measurement was not, so a baseline carrying `[]` satisfied every condition and stayed READY. The
  // survival is the finding: `the_frozen_write_set_is_the_one_that_was_measured` exists because of it.
  var NM = 'the_frozen_write_set_is_the_one_that_was_measured';
  return clean.res.verdict === 'READY_TO_AUTHORIZE'
    && clean.res.frozen_before.expected_header_ids.length === 1
    && failed(clean.res).indexOf(NM) === -1
    && bad.res.verdict === 'STOP'
    && failed(bad.res).indexOf(NM) >= 0
    && bad.res.freeze_paste_block === null
    && bad.res.operator_authorization_wording === null
    && mpChunks(bad.world) === 0;
});

mut('N44 an unmeasurable write set is reported as an empty one instead of a refusal', function () {
  var m = swapS1("    L.P('the_exact_production_write_set_is_measurable', true, ws.measurable,"+NL
    + '      ws.measurable === true);',
    "    L.P('the_exact_production_write_set_is_measurable', true, ws.measurable, true);");
  var spec = pos({ after: 'sadK2ResolveActiveDraft_ = null;' });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'the_exact_production_write_set_is_measurable';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N45 the deterministic line id is minted here instead of by the K2 authority', function () {
  // A second implementation is the thing §A forbids. It produces ids the writer would never mint, and a
  // readback comparing against them would pass a world where the wrong rows appeared.
  var m = swapS1("          var lid = S1_str_(sadK2DeterministicLineId_(hid, l));",
    "          var lid = 'SADL-K2-' + S1_str_(l.sku).toUpperCase();");
  var clean = manifestP(pos()), bad = withMP(m, pos());
  return /^SADL-K2-[0-9A-F]{8}$/.test(clean.res.predicted_write_set.expected_line_ids[0])
    && bad.res.predicted_write_set.expected_line_ids[0] !== clean.res.predicted_write_set.expected_line_ids[0];
});

mut('N46 CREATE and UPDATE collapse into one classification', function () {
  var m = swapS1("        var cls = (r && r.status === 'CREATE') ? 'CREATE'"+NL
    + "          : ((r && r.status === 'REUSE') ? 'UPDATE' : 'BLOCKED_CONFLICT');",
    "        var cls = 'CREATE';");
  var seeded = pos({ extraHeaders: [W3hdr],
    extraLines: [{ allocation_draft_line_id: PRED_L, allocation_draft_id: PRED_H, sku: SKU,
      planned_qty: '380', line_status: 'draft' }] });
  var clean = manifestP(seeded), bad = withMP(m, seeded);
  // The clean world calls it an UPDATE of an existing row; the mutant calls the same row a CREATE, which is
  // the difference between "one header changed" and "a second header appeared" in any readback.
  return clean.res.predicted_write_set.expected_update_header_count === 1
    && clean.res.predicted_write_set.expected_create_header_count === 0
    && bad.res.predicted_write_set.expected_create_header_count === 1;
});

mut('N47 the row fingerprint covers the ids only, so an in-place edit is invisible', function () {
  var m = swapS1('  var parts = [];'+NL
    + '  for (var i = 0; i < headers.length; i++) {'+NL
    + "    parts.push(S1_str_(headers[i]) + '=' + S1_canonCell_(row[i]));"+NL
    + '  }',
    '  var parts = [];'+NL
    + '  for (var i = 0; i < headers.length; i++) {'+NL
    + "    if (String(headers[i]).indexOf('_id') >= 0) parts.push(S1_str_(headers[i]) + '=' + S1_canonCell_(row[i]));"+NL
    + '  }');
  var noteWorld = pos({ aLine: { note: 'operator added a note' } });
  var cleanA = manifestP(pos()), cleanB = manifestP(noteWorld);
  var badA = withMP(m, pos()), badB = withMP(m, noteWorld);
  // Clean: the note moves the fingerprint. Mutant: the two worlds fingerprint alike, which is the W4 hole.
  return cleanA.res.frozen_before.target_manual_combined_fingerprint
      !== cleanB.res.frozen_before.target_manual_combined_fingerprint
    && badA.res.frozen_before.target_manual_combined_fingerprint
      === badB.res.frozen_before.target_manual_combined_fingerprint;
});

mut('N48 an unexpected live column is recorded but not refused', function () {
  var m = swapS1("    L.P('no_unexpected_column_exists_on_the_draft_header_table', [],"+NL
    + '      part.header_table.unexpected_columns, (part.header_table.unexpected_columns || []).length === 0);',
    "    L.P('no_unexpected_column_exists_on_the_draft_header_table', [],"+NL
    + '      part.header_table.unexpected_columns, true);');
  function run(src) {
    var s = {}; Object.keys(pos()).forEach(function (k) { s[k] = pos()[k]; });
    if (src) s.s1 = src;
    var w = S1World(s);
    w.sheets['shipping_allocation_drafts'].rows[0].push('surprise_column');
    var o = null; try { o = vm.runInContext('RUN_S1_MANIFEST_P()', w.ctx); } catch (e) { o = {}; }
    return { res: o || {}, world: w };
  }
  var clean = run(null), bad = run(m);
  var NM = 'no_unexpected_column_exists_on_the_draft_header_table';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N49 the other-scope bucket is frozen by id count instead of by content', function () {
  var m = swapS1("        other_scope_row_signatures: part.other_scope.header_sigs.concat(part.other_scope.line_sigs),"+NL
    + '        other_scope_combined_fingerprint: part.other_scope.combined_fingerprint,',
    "        other_scope_row_signatures: part.other_scope.header_sigs.concat(part.other_scope.line_sigs),"+NL
    + '        other_scope_combined_fingerprint: S1_fingerprint_([String(part.other_scope.header_count)]),');
  function world(note, src) {
    var s = pos({
      extraHeaders: [{ allocation_draft_id: 'OTHER-H-1', planning_cycle: GAP_CYCLE,
        source_page: 'inventory_replenishment', company: 'OtherCo', country: 'US', marketplace: 'Walmart',
        status: 'draft', generation_type: 'user_created', note: note }],
      extraLines: [{ allocation_draft_line_id: 'OTHER-H-1-L1', allocation_draft_id: 'OTHER-H-1',
        sku: 'OTHER-SKU', planned_qty: '77', line_status: 'draft' }] });
    return src ? withMP(src, s) : manifestP(s);
  }
  var cA = world('before', null), cB = world('after', null);
  var bA = world('before', m), bB = world('after', m);
  return cA.res.frozen_before.other_scope_combined_fingerprint
      !== cB.res.frozen_before.other_scope_combined_fingerprint
    && bA.res.frozen_before.other_scope_combined_fingerprint
      === bB.res.frozen_before.other_scope_combined_fingerprint;
});

mut('N50 the factory movement table being absent is frozen as zero rows', function () {
  var m = swapS1("      row_count: t.present && t.readable ? t.row_count : null,",
    "      row_count: t.present && t.readable ? t.row_count : 0,");
  var spec = pos({ movements: null });
  var clean = manifestP(spec), bad = withMP(m, spec);
  return clean.res.frozen_before.factory_stock_movement_count === null
    && clean.res.frozen_before.factory_stock_movement_state === 'SHEET_ABSENT'
    && bad.res.frozen_before.factory_stock_movement_count === 0;
});

mut('N51 the run\'s own predicted rows are also reported as rows it would expire', function () {
  // The defect measured while building W3: with committed_ids dropped, a REUSE target appears in the expire
  // set as well, so the manifest claims it retires a row it is updating.
  var m = swapS1("        committed_ids: (writeSet && writeSet.expected_header_ids) ? writeSet.expected_header_ids : [] }) || {};",
    '        committed_ids: [] }) || {};');
  var seeded = pos({ extraHeaders: [W3hdr],
    extraLines: [{ allocation_draft_line_id: PRED_L, allocation_draft_id: PRED_H, sku: SKU,
      planned_qty: '380', line_status: 'draft' }] });
  var clean = manifestP(seeded), bad = withMP(m, seeded);
  var NM = 'no_identity_is_both_expired_and_written_by_the_same_run';
  return clean.res.verdict === 'READY_TO_AUTHORIZE'
    && (clean.res.ai_identity_sets.ai_expiration_candidates || []).indexOf(PRED_H) === -1
    && bad.res.verdict === 'STOP' && failed(bad.res).indexOf(NM) >= 0;
});

mut('N52 the predicted quantity is no longer checked against the proposal', function () {
  var m = swapS1("    L.P('the_predicted_lines_do_not_exceed_the_proposed_quantity',"+NL
    + "      'planned total <= ' + S1_str_(prop), ws.expected_line_planned_total,"+NL
    + '      prop !== null && ws.expected_line_planned_total !== null'+NL
    + '        && ws.expected_line_planned_total <= prop);',
    "    L.P('the_predicted_lines_do_not_exceed_the_proposed_quantity',"+NL
    + "      'planned total <= ' + S1_str_(prop), ws.expected_line_planned_total, true);");
  // The one-unit-over world: manual 521 makes the residual 379 while the seam still carries 380.
  var spec = pos({ aLine: { planned_qty: '321' } });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'the_predicted_lines_do_not_exceed_the_proposed_quantity';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N53 the chunk budget ignores the tag, so an emitted line can exceed the bound', function () {
  // S1-R4D - RE-ANCHORED. The suffix is an argument now, because the per-fault emitter numbers its lines by
  // fault COUNT and a three-digit N is wider than '_99_of_99'. Same mutant: stop pricing the framing, so
  // the payload budget ignores how long the tag and suffix actually are.
  var m = swapS1("  var framing = '[S1] '.length + String(tag).length" + NL
    + "    + String(suffix === undefined || suffix === null ? '_99_of_99' : suffix).length + 1;",
    '  var framing = 0;');
  function longest(src) {
    var s = {}; Object.keys(pos()).forEach(function (k) { s[k] = pos()[k]; });
    if (src) s.s1 = src;
    var w = S1World(s);
    vm.runInContext('S1_emitChunked_("s1_probe_tag", new Array(9000).join("z"))', w.ctx);
    return (w.log || []).reduce(function (mx, l) { return Math.max(mx, String(l).length); }, 0);
  }
  var c = longest(null), b = longest(m);
  return c <= 3000 && b > 3000;
});


mut('N55 the readable predicate goes back to a field the contract does not publish', function () {
  // THE LIVE BUG, INJECTED. `available` is not in sysModuleBuildStamps_()'s return, so this reads undefined
  // and refuses every real deployment — while the surrounding evidence extracts fine, which is exactly how
  // the production run reported 87 passed / 1 failed on a healthy project.
  var m = swapS1('      !!dep && dep.readable === true);', '      !!dep && dep.available === true);');
  var clean = manifestP(pos()), bad = withMP(m, pos());
  var NM = 'the_deployment_contract_is_readable';
  return clean.res.verdict === 'READY_TO_AUTHORIZE' && failed(clean.res).indexOf(NM) === -1
    && bad.res.verdict === 'STOP' && failed(bad.res).indexOf(NM) >= 0
    // and the giveaway: the same run still read the build out of the object it called unreadable
    && bad.res.deployment.deployment_build === clean.res.deployment.deployment_build
    && bad.res.freeze_paste_block === null && mpChunks(bad.world) === 0;
});

mut('N56 a missing contract field is recorded but does not make the shape unreadable', function () {
  var m = swapS1('  o.readable = o.missing_fields.length === 0 && o.wrong_type_fields.length === 0;',
    '  o.readable = true;');
  var spec = pos({ stamps: stampsWith_({ runtime_authority: '__DELETE__' }) });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'the_deployment_contract_is_readable';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N57 the field TYPE check is dropped, so a string passes for an array', function () {
  var m = swapS1("    if (!S1_typeOk_(raw[f.field], f.type)) {", '    if (false) {');
  var spec = pos({ stamps: stampsWith_({ stale_modules: 'none' }) });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'the_deployment_contract_is_readable';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N58 the per-module stamps are never examined, only the two summary lists', function () {
  // The half that catches a partial sync whose summary lists happen to be empty.
  var m = swapS1("      if (r.matches_expected !== true) {" + NL
    + "        mism.push(file + ' declares ' + S1_str_(r.declared_build) + ', expected '" + NL
    + "          + S1_str_(r.expected_build));" + NL
    + '      }',
    '      if (false) { mism.push(file); }');
  var rows = JSON.parse(JSON.stringify(REAL_STAMPS_.modules));
  var at = -1;
  rows.forEach(function (r, i) { if (at === -1 && r.optional !== true) at = i; });
  rows[at].matches_expected = false;
  rows[at].declared_build = 'F1-SOMETHING-OLD';
  var spec = pos({ stamps: stampsWith_({ modules: rows }) });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'every_required_module_stamp_is_present_and_matches_what_is_expected';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N59 an absent OPTIONAL owner is counted as an absent required one', function () {
  // The opposite failure direction, and just as bad: 63_ §J.6 says an optional one-shot migration may be
  // absent without that being a partial sync, so this would STOP a healthy deployment — the same class of
  // defect this round is repairing, rebuilt facing the other way.
  var m = swapS1('      if (!r.present) {' + NL
    + '        if (!optional) {',
    '      if (!r.present) {' + NL
    + '        if (true) {');
  var clean = manifestP(pos()), bad = withMP(m, pos());
  var NM = 'every_required_module_stamp_is_present_and_matches_what_is_expected';
  return clean.res.verdict === 'READY_TO_AUTHORIZE'
    && clean.res.deployment.absent_optional_module_count === 1
    && bad.res.verdict === 'STOP' && failed(bad.res).indexOf(NM) >= 0;
});

mut('N60 the verdict check becomes a substring search for UNIFORM', function () {
  var m = swapS1("  o.verdict_is_uniform = o.verdict === null ? null : /^UNIFORM\\b/.test(o.verdict.trim());",
    "  o.verdict_is_uniform = o.verdict === null ? null : (o.verdict.indexOf('UNIFORM') >= 0);");
  var spec = pos({ stamps: stampsWith_({
    verdict: 'MIXED_OR_PARTIAL_SYNC (RUNTIME) — this text happens to contain the word UNIFORM' }) });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'the_deployment_verdict_is_uniform';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1;
});

mut('N61 the contract-level refusal list stops being surfaced', function () {
  // RE-AIMED. The first version mutated `contract_ok`, which is deliberately redundant with the individual
  // health predicates — so the mutant lost nothing observable and survived. The thing worth protecting is the
  // COLLECTION of named reasons: without it the manifest still STOPs, but it can no longer say why, and
  // "the deployment is wrong" with no reason is the report this whole round was called to stop producing.
  var m = swapS1('  function stop(reason) { o.stop_reasons.push(reason); }',
    '  function stop(reason) { return reason; }');
  var spec = pos({ stamps: stampsWith_({ mixed_deployment: true }) });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'the_deployment_contract_reports_no_refusal_of_its_own';
  // The mixed check still fires in both — what the mutant loses is the single line that says "the contract
  // itself refused", which is the one an operator reads first.
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && failed(bad.res).indexOf(NM) === -1
    && bad.res.verdict === 'STOP';
});

// ---- S1-R4C mutants ------------------------------------------------------------------------------------

/** swapS1 always swaps against the pristine source, so a mutant that needs TWO edits cannot chain it.
 *  Some of the locks below are only reachable on a world that a FIRST edit made refuse, which is exactly
 *  the shape that needs two. Same anchor-count discipline: a swap that matches 0 or 2 places is a broken
 *  probe, not a surviving mutant, and it says so. */
function swap2_(src, a, b) {
  var n = src.split(a).length - 1;
  if (n !== 1) throw new Error('swap2 anchor count ' + n + ' :: ' + a.slice(0, 90));
  return src.split(a).join(b);
}

mut('N62 the id list goes back to mapping the raw cell and sorting it', function () {
  // THE LIVE BUG, INJECTED. This is the expression that produced `factory_stock_movement_ids[0] = ""`
  // beside `count = 96` on a run that called itself READY: map the id cell of every row, sort, publish.
  // The empty string sorts first, so the blank both joined the identity list and lost its row number.
  var m = swapS1('      ids: integ.ok_ids,',
    "      ids: (t.present && t.readable && idResolved === true)\n"
    + "        ? (t.rows || []).map(function (r) { return S1_str_(r[idKey]); }).sort() : null,");
  var spec = pos({ movements: [
    { movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 5 },
    { factory_stock_movement_id: 'MV-2', movement_date: '2026-09-02', sku: SKU, warehouse_id: WHF,
      movement_type: 'IN', qty: 7 }] });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'every_factory_audit_row_carries_a_non_blank_id';
  var bs = ((bad.res.factory_surfaces || {}).surfaces || {})['factory_stock_movements'] || {};
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) >= 0
    && ((clean.res.factory_surfaces.surfaces['factory_stock_movements'] || {}).ids === null)
    // the giveaway the live run showed: a blank sitting at index 0 of a published identity list
    && Object.prototype.toString.call(bs.ids) === '[object Array]' && bs.ids[0] === '';
});

mut('N63 a blank id is counted but does not make the integrity pass dirty', function () {
  // RE-AIMED ONCE, BY THE MEASUREMENT. The first version asserted that the mutant reaches READY, and it
  // does not: with the blank excluded from the id list, `ok_count` (0) stops matching `row_count` (1) and
  // `every_published_factory_id_list_is_complete_and_blank_free` refuses on the arithmetic. That is
  // defence in depth working, and it is worth recording as such.
  //
  // What the mutant DOES destroy is the diagnosis. The run still STOPs, but it no longer says the id is
  // BLANK, no longer emits FACTORY_MOVEMENT_ID_BLANK, and no longer hands over the row number and
  // fingerprint — so an operator is told a count does not add up instead of being told which row to open.
  var m = swapS1("  if (o.blank_id_count) o.faults.push(pre + '_ID_BLANK');",
    "  if (false) o.faults.push(pre + '_ID_BLANK');");
  var spec = pos({ movements: [
    { movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 5 }] });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'every_factory_audit_row_carries_a_non_blank_id';
  var CO = 'every_published_factory_id_list_is_complete_and_blank_free';
  return clean.res.verdict === 'STOP'
    && failed(clean.res).indexOf(NM) >= 0
    && (clean.res.factory_id_fault_codes || []).indexOf('FACTORY_MOVEMENT_ID_BLANK') >= 0
    // the mutant still refuses — on the wrong condition, with no named code and no row to go and look at
    && bad.res.verdict === 'STOP'
    && failed(bad.res).indexOf(NM) === -1 && failed(bad.res).indexOf(CO) >= 0
    && (bad.res.factory_id_fault_codes || []).length === 0;
});

mut('N64 a duplicate id is folded into the blank count', function () {
  // Four faults exist as four counts because they have four remedies. Collapsing two of them reports a
  // duplicated primary key as a missing one, which sends a person looking for the wrong thing.
  var m = swapS1('      o.duplicate_id_count++;', '      o.blank_id_count++;');
  var spec = pos({ movements: [
    { factory_stock_movement_id: 'MV-D', movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
      movement_type: 'IN', qty: 5 },
    { factory_stock_movement_id: 'MV-D', movement_date: '2026-09-02', sku: SKU, warehouse_id: WHF,
      movement_type: 'IN', qty: 6 }] });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var DUP = 'no_factory_audit_row_id_is_duplicated';
  var BLK = 'every_factory_audit_row_carries_a_non_blank_id';
  return clean.res.verdict === 'STOP'
    && failed(clean.res).indexOf(DUP) >= 0 && failed(clean.res).indexOf(BLK) === -1
    && bad.res.verdict === 'STOP'
    && failed(bad.res).indexOf(DUP) === -1 && failed(bad.res).indexOf(BLK) >= 0;
});

mut('N65 a row outside the named columns is judged as a record missing its id', function () {
  // The read-range fault reported as a data fault. Both STOP, so the verdict cannot tell them apart — what
  // the mutant loses is WHICH remedy the operator is sent to: clear a stray cell, or repair a record.
  var m = swapS1("    if (r.named_column_nonblank === false) {", '    if (false) {');
  var w = S1World(pos({ movements: [{ factory_stock_movement_id: 'MV-1', movement_date: '2026-09-01',
    sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 5 }] }));
  var sh = w.sheets['factory_stock_movements'];
  sh.rows.forEach(function (r) { r.splice(3, 0, ''); });
  var stray = sh.rows[0].map(function () { return ''; });
  stray[3] = 'stray';
  sh.rows.push(stray);
  var clean = vm.runInContext('RUN_S1_MANIFEST_P()', w.ctx);
  var w2 = S1World(pos({ s1: m, movements: [{ factory_stock_movement_id: 'MV-1',
    movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 5 }] }));
  var sh2 = w2.sheets['factory_stock_movements'];
  sh2.rows.forEach(function (r) { r.splice(3, 0, ''); });
  var stray2 = sh2.rows[0].map(function () { return ''; });
  stray2[3] = 'stray';
  sh2.rows.push(stray2);
  var bad = vm.runInContext('RUN_S1_MANIFEST_P()', w2.ctx);
  var STRAY = 'no_row_outside_the_named_columns_was_counted_as_a_factory_record';
  var BLK = 'every_factory_audit_row_carries_a_non_blank_id';
  return failed(clean).indexOf(STRAY) >= 0 && failed(clean).indexOf(BLK) === -1
    && failed(bad).indexOf(STRAY) === -1 && failed(bad).indexOf(BLK) >= 0;
});

mut('N66 the wording audit accepts an empty needle, so an unmeasured fact reads as present', function () {
  // HOW A SUBSTRING CHECK QUIETLY STOPS CHECKING. `indexOf('')` is 0 on every string, so a required fact
  // whose measured value came back null would be 'found' in any sentence at all - including one that says
  // nothing about it. The whole audit would then pass on a world where the measurement failed.
  //
  // Two edits, because the rule is only observable when some required value IS empty: the first makes one
  // (the factory pool row fingerprint), the second removes the guard.
  var EMPTY = "  need('factory_pool_row_fingerprint', ((surf && surf.pool) || {}).row_fingerprint);";
  // S1-R4E - RE-ANCHORED onto the ONE place the rule now lives. R4E added a second wording audit (the
  // backfill authorization) and with it a second copy of this line, so the anchor stopped being unique -
  // which is the same duplication that lets two audits disagree about what counts as present. Extracted to
  // S1_needleFound_, so this single mutant now covers both callers.
  var GUARD = "  return S1_str_(needle) !== '' && String(text).indexOf(needle) >= 0;";
  var withEmpty = swapS1(EMPTY, "  need('factory_pool_row_fingerprint', null);");
  var clean = withMP(withEmpty, pos());
  var bad = withMP(swap2_(withEmpty, GUARD,
    '  return String(text).indexOf(needle) >= 0;'), pos());
  var NM = 'AUTHORIZATION_WORDING_IS_NOT_VERIFIABLE';
  return clean.res.verdict === 'STOP' && String(clean.res.stop_reason).indexOf(NM) === 0
    && clean.res.wording_audit.missing.indexOf('factory_pool_row_fingerprint') >= 0
    // the mutant finds the unmeasured fact 'present' and authorizes
    && bad.res.verdict === 'READY_TO_AUTHORIZE'
    && bad.res.wording_audit.missing.length === 0;
});

mut('N67 the authorization is logged in one raw line instead of the bounded chunker', function () {
  // The bound belongs to the emitted LINE (S1-R4A), and it only applies to the wording if the wording goes
  // through the chunker. A raw call is invisible on a short sentence and truncates on a long one.
  var m = swapS1("      out.authorization_chunks = S1_emitChunked_('s1_manifest_p_authorization',\n"
    + '        out.operator_authorization_wording);',
    "      S1_log_('s1_manifest_p_authorization', out.operator_authorization_wording);\n"
    + '      out.authorization_chunks = 1;');
  var clean = manifestP(pos()), bad = withMP(m, pos());
  return clean.res.verdict === 'READY_TO_AUTHORIZE' && authChunks(clean.world) >= 1
    && authText(clean.world) === String(clean.res.operator_authorization_wording)
    && bad.res.verdict === 'READY_TO_AUTHORIZE' && authChunks(bad.world) === 0;
});

mut('N68 the sentence is not printed at all — only the boolean about it', function () {
  // THE LIVE DEFECT. `authorization_wording_present = true` was the whole of what an operator saw, and the
  // sentence exists precisely so that a human can check its numbers against the evidence.
  var m = swapS1("    if (out.verdict === 'READY_TO_AUTHORIZE' && out.operator_authorization_wording) {\n"
    + "      out.authorization_chunks = S1_emitChunked_('s1_manifest_p_authorization',",
    "    if (false) {\n"
    + "      out.authorization_chunks = S1_emitChunked_('s1_manifest_p_authorization',");
  var clean = manifestP(pos()), bad = withMP(m, pos());
  return clean.res.verdict === 'READY_TO_AUTHORIZE' && authChunks(clean.world) >= 1
    && bad.res.verdict === 'READY_TO_AUTHORIZE'
    && !!bad.res.operator_authorization_wording          // the boolean would still have said true
    && authChunks(bad.world) === 0 && authText(bad.world) === '';
});

mut('N69 the draft row universe is fed the gap scope count', function () {
  // The confusion this round ended, injected: 118 gap scopes reported as the draft row total. Caught by
  // arithmetic rather than by recognising the number, so it does not depend on knowing that 118 is wrong.
  var m = swapS1('      total_row_count: part.header_table.row_count + part.line_table.row_count,',
    '      total_row_count: uniKeys.length,');
  var clean = manifestP(pos()), bad = withMP(m, pos());
  var NM = 'the_draft_row_universe_total_is_its_header_rows_plus_its_line_rows';
  return clean.res.verdict === 'READY_TO_AUTHORIZE' && failed(clean.res).indexOf(NM) === -1
    && bad.res.verdict === 'STOP' && failed(bad.res).indexOf(NM) >= 0
    && bad.res.freeze_paste_block === null && mpChunks(bad.world) === 0;
});

mut('N70 the two populations go back to sharing one fingerprint', function () {
  // A fingerprint whose population is ambiguous cannot refuse anything. With both names pointing at the
  // gap scope hash, a draft row edited in place moves neither — which is the readback hole the split closed.
  var m = swapS1('      combined_fingerprint: S1_fingerprint_(duAllSigs),',
    '      combined_fingerprint: uniFp,');
  var base = manifestP(pos()), baseM = withMP(m, pos());
  var edit = manifestP(pos({ aLine: { note: 'operator added a note' } }));
  var editM = withMP(m, pos({ aLine: { note: 'operator added a note' } }));
  return base.res.verdict === 'READY_TO_AUTHORIZE'
    // clean: the draft fingerprint moves when a draft row is edited, and the gap one does not
    && edit.res.frozen_before.draft_row_universe_combined_fingerprint
      !== base.res.frozen_before.draft_row_universe_combined_fingerprint
    && edit.res.frozen_before.gap_scope_universe_fingerprint
      === base.res.frozen_before.gap_scope_universe_fingerprint
    // mutant: the draft fingerprint is the gap one, so the in-place edit is invisible to both
    && editM.res.frozen_before.draft_row_universe_combined_fingerprint
      === baseM.res.frozen_before.draft_row_universe_combined_fingerprint;
});

mut('N71 LOCK FIVE is removed, so a refused run keeps the baseline it built', function () {
  // FOUND BY THIS ROUND'S OWN STOP TABLE (Y12). LOCKS THREE and FOUR fire AFTER a clean measurement, so on
  // those two paths the freeze had already been built - and nulling only the paste block left the same
  // content reachable as an object an operator could stringify and paste. Two edits: the first produces a
  // world that measures cleanly and is then refused for its sentence, which is the only state where a
  // baseline exists at the moment of refusal; the second removes the lock.
  var IDS = "    + ' The EXACT K2 identities it may write are header(s) '"
    + " + (hIds.length ? hIds.join(', ') : '(none)')";
  var LOCK5 = "    if (out.verdict !== 'READY_TO_AUTHORIZE') {" + NL
    + '      if (out.frozen_before && !out.freeze_withheld_reason) {';
  var LOCK5OFF = '    if (false) {' + NL
    + '      if (out.frozen_before && !out.freeze_withheld_reason) {';
  var refused = swapS1(IDS, "    + ' The identities it may write are header(s) (withheld)'");
  var clean = withMP(refused, pos());
  var bad = withMP(swap2_(refused, LOCK5, LOCK5OFF), pos());
  return clean.res.verdict === 'STOP' && clean.res.frozen_before === null
    && clean.res.freeze_paste_block === null
    // the mutant STOPs and still hands back the whole measured baseline
    && bad.res.verdict === 'STOP' && bad.res.frozen_before !== null
    && bad.res.frozen_before.expected_header_ids.length >= 1
    && mpChunks(bad.world) === 0;
});

mut('N72 an absent factory surface is required to contribute a fingerprint', function () {
  // THIS ROUND'S OWN MISTAKE, KEPT AS A MUTANT. The wording audit's first version demanded a fingerprint
  // from every surface, and an honestly ABSENT movement table has none — so a healthy world (W8h) was
  // refused. R4A's rule holds here too: absent stays absent, and it is never asked to behave like present.
  var m = swapS1("    if (sv && sv.observation_state === 'SHEET_PRESENT_AND_READABLE') {",
    '    if (true) {');
  var spec = pos({ movements: null });
  var clean = manifestP(spec), bad = withMP(m, spec);
  return clean.res.verdict === 'READY_TO_AUTHORIZE'
    && clean.res.frozen_before.factory_stock_movement_state === 'SHEET_ABSENT'
    && clean.res.frozen_before.factory_stock_movement_count === null
    && bad.res.verdict === 'STOP'
    && String(bad.res.stop_reason).indexOf('AUTHORIZATION_WORDING_IS_NOT_VERIFIABLE') === 0;
});

// ---- S1-R4D mutants ------------------------------------------------------------------------------------

mut('N73 the fault rows are measured and never printed', function () {
  // THE LIVE DEFECT, INJECTED. R4C measured the row number and the fingerprint and put them in the return
  // value and in a predicate's `observed` field; the Logger got the code. verdict STOP, one code, 96 rows,
  // 95 good ids, and nowhere to look.
  var m = swapS1("    var frOut = out.factory_id_fault_rows || [];\n"
    + '    if (frOut.length) {',
    "    var frOut = out.factory_id_fault_rows || [];\n"
    + '    if (false) {');
  var spec = pos({ movements: [
    { factory_stock_movement_id: 'FSMV-1', movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
      movement_type: 'IN', qty: 5 },
    { movement_date: '2026-09-02', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 6 }] });
  var clean = manifestP(spec), bad = withMP(m, spec);
  return clean.res.verdict === 'STOP' && mpFaultLines(clean.world) === 1
    && bad.res.verdict === 'STOP' && mpFaultLines(bad.world) === 0
    // the giveaway: the mutant still reports the CODE, which is exactly what the live run did
    && String(bad.res.factory_id_fault_codes) === 'FACTORY_MOVEMENT_ID_BLANK'
    && (bad.res.factory_id_fault_rows || []).length === 1;
});

mut('N74 the fault row number comes from the front of the sorted id list', function () {
  // The defect the sort caused in the first place: '' sorts first, so a position taken from the id list is
  // always the first data row no matter which row lost its key. Here the blank is the LAST record.
  var m = swapS1('      one_based_sheet_row_number: entry.row_number,',
    '      one_based_sheet_row_number: 2,');
  var spec = pos({ movements: [
    { factory_stock_movement_id: 'AAA-1', movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
      movement_type: 'IN', qty: 1 },
    { factory_stock_movement_id: 'ZZZ-9', movement_date: '2026-09-02', sku: SKU, warehouse_id: WHF,
      movement_type: 'IN', qty: 2 },
    { movement_date: '2026-09-03', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 3 }] });
  var clean = fmCensus(spec);
  var bad = fmCensus(function () { var s = {}; Object.keys(spec).forEach(function (k) { s[k] = spec[k]; });
    s.s1 = m; return s; }());
  return clean.res.faults[0].one_based_sheet_row_number === 4
    && bad.res.faults[0].one_based_sheet_row_number === 2;
});

mut('N75 the located fault loses its full-row fingerprint', function () {
  // The other half of locating a row: the number says where it is now, the fingerprint says which row it is
  // and matches the frozen signature. A null one makes the report unmatchable against the baseline.
  var m = swapS1('      full_named_row_fingerprint: rec ? rec.fingerprint : null,',
    '      full_named_row_fingerprint: null,');
  var spec = pos({ movements: [
    { movement_date: '2026-09-02', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 6 }] });
  var clean = manifestP(spec), bad = withMP(m, spec);
  var NM = 'every_located_fault_row_carries_a_row_number_a_fingerprint_and_a_next_action';
  return clean.res.verdict === 'STOP' && failed(clean.res).indexOf(NM) === -1
    && bad.res.verdict === 'STOP' && failed(bad.res).indexOf(NM) >= 0;
});

mut('N76 the business-content test counts the id column, so a bare key looks like a record', function () {
  // RE-AIMED BY THE MEASUREMENT. The first version used a stray row, and the mutant survived: that row's id
  // cell is EMPTY, so including the id column adds nothing and nothing observable changed. The exclusion is
  // load-bearing only where the id IS populated - a row carrying a duplicated key and no other content.
  //
  // Clean, that row reports row_has_business_content false: it has a key and nothing else, so there is no
  // record to back-fill a key for. Counting the id makes the flag true, and the report then claims business
  // content whose only evidence is the very field that is at fault.
  var m = swapS1("    if (c === '' || c === skipColumn) return;", "    if (c === '') return;");
  function run(src) {
    var s = {}; Object.keys(pos()).forEach(function (k) { s[k] = pos()[k]; });
    s.movements = [
      { factory_stock_movement_id: 'FSMV-D', movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
        movement_type: 'IN', qty: 1 },
      { factory_stock_movement_id: 'FSMV-D' }];          // a bare duplicated key, nothing else on the row
    if (src) s.s1 = src;
    var w = S1World(s);
    return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx);
  }
  var clean = run(null), bad = run(m);
  var cf = clean.faults[0], bf = bad.faults[0];
  var names = function (f) { return f.named_nonblank_fields.map(function (x) { return x.field; }); };
  return clean.verdict === 'FAULTS_FOUND' && cf.fault_class === 'DUPLICATE'
    && cf.row_has_business_content === false && cf.named_nonblank_field_count === 0
    && names(cf).indexOf('factory_stock_movement_id') === -1
    // the mutant reports the key itself as the row's business content
    && bf.row_has_business_content === true && bf.named_nonblank_field_count === 1
    && names(bf).indexOf('factory_stock_movement_id') >= 0;
});

mut('N77 an unreadable table is reported as CLEAN instead of STOP', function () {
  // 'I could not look' and 'I looked and it was clean' are different answers. This is the same rule that
  // keeps an absent table's row_count null, applied to the verdict.
  var m = swapS1("    out.verdict = (out.stop_reasons.length || L.failed.length) ? 'STOP'\n"
    + "      : ((out.faults || []).length ? 'FAULTS_FOUND' : 'CLEAN');",
    "    out.verdict = (out.faults || []).length ? 'FAULTS_FOUND' : 'CLEAN';");
  function run(src) {
    var s = {}; Object.keys(pos()).forEach(function (k) { s[k] = pos()[k]; });
    s.movements = null;
    if (src) s.s1 = src;
    var w = S1World(s);
    return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx);
  }
  var clean = run(null), bad = run(m);
  return clean.verdict === 'STOP' && clean.stop_reasons.indexOf('SHEET_ABSENT') >= 0
    && bad.verdict === 'CLEAN' && bad.stop_reasons.indexOf('SHEET_ABSENT') >= 0
    && bad.row_count === null;
});

mut('N78 valid_id_count goes back to meaning "the cell was not blank"', function () {
  // R4C's `ok_count` includes a duplicate and a coerced number, because both leave the cell populated.
  // Reporting that as `valid` is the same class of mistake as calling 118 gap scopes an identity count.
  var m = swapS1('    out.valid_id_count = integ.ok_count - integ.duplicate_id_count'
    + ' - integ.wrong_type_id_count;',
    '    out.valid_id_count = integ.ok_count;');
  function run(src) {
    var s = {}; Object.keys(pos()).forEach(function (k) { s[k] = pos()[k]; });
    s.movements = [
      { factory_stock_movement_id: 'FSMV-D', movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
        movement_type: 'IN', qty: 1 },
      { factory_stock_movement_id: 'FSMV-D', movement_date: '2026-09-02', sku: SKU, warehouse_id: WHF,
        movement_type: 'IN', qty: 2 }];
    if (src) s.s1 = src;
    var w = S1World(s);
    return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx);
  }
  var clean = run(null), bad = run(m);
  var NM = 'the_valid_ids_are_the_non_blank_ones_minus_the_duplicated_and_the_wrong_typed';
  return clean.verdict === 'FAULTS_FOUND'
    && clean.non_blank_id_count === 2 && clean.valid_id_count === 1
    && clean.failed_predicates.indexOf(NM) === -1
    && bad.valid_id_count === 2 && bad.failed_predicates.indexOf(NM) >= 0;
});

mut('N79 the census judges the ids itself instead of asking the shared authority', function () {
  // A second classifier is a second opinion, and the first thing two opinions do is disagree about a row
  // nobody can then classify. Here the local one counts a blank as valid, so the standalone census and
  // Manifest P report different worlds.
  var m = swapS1('    var integ = S1_idIntegrity_(t, spec.id);',
    "    var integ = { checked: true, clean: true, id_column: spec.id, row_count: t.row_count,\n"
    + '      ok_count: t.row_count, blank_id_count: 0, wrong_type_id_count: 0, duplicate_id_count: 0,\n'
    + '      outside_named_columns_count: 0, blank_id_rows: [], wrong_type_id_rows: [],\n'
    + '      duplicate_id_rows: [], outside_named_columns_rows: [], faults: [] };');
  var spec = pos({ movements: [
    { factory_stock_movement_id: 'FSMV-1', movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
      movement_type: 'IN', qty: 5 },
    { movement_date: '2026-09-02', sku: SKU, warehouse_id: WHF, movement_type: 'IN', qty: 6 }] });
  var mp = manifestP(spec);
  var clean = fmCensus(spec);
  var bad = fmCensus(function () { var s = {}; Object.keys(spec).forEach(function (k) { s[k] = spec[k]; });
    s.s1 = m; return s; }());
  return mp.res.verdict === 'STOP'
    // clean: one authority, so the two callers agree
    && clean.res.verdict === 'FAULTS_FOUND' && clean.res.fault_count === 1
    && clean.res.faults[0].one_based_sheet_row_number
      === mp.res.factory_id_fault_rows[0].one_based_sheet_row_number
    // mutant: the census calls the same world clean while the manifest still refuses it
    && bad.res.verdict === 'CLEAN' && bad.res.fault_count === 0;
});

mut('N80 a fully blank trailing sheet row is counted as a record missing its id', function () {
  // A spreadsheet artifact reported as data damage. Every sheet with a spare row would refuse, and an
  // operator would be sent to a row that has nothing in it.
  var m = swapS1('    if (blank) continue;                                  '
    + '// a trailing empty sheet row is not a record',
    '    if (false) continue;');
  function run(src) {
    var s = {}; Object.keys(pos()).forEach(function (k) { s[k] = pos()[k]; });
    s.movements = [{ factory_stock_movement_id: 'FSMV-1', movement_date: '2026-09-01', sku: SKU,
      warehouse_id: WHF, movement_type: 'IN', qty: 5 }];
    if (src) s.s1 = src;
    var w = S1World(s);
    var sh = w.sheets['factory_stock_movements'];
    sh.rows.push(sh.rows[0].map(function () { return ''; }));
    return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx);
  }
  var clean = run(null), bad = run(m);
  return clean.verdict === 'CLEAN' && clean.row_count === 1 && clean.fault_count === 0
    && bad.verdict === 'FAULTS_FOUND' && bad.row_count === 2 && bad.fault_count === 1;
});

mut('N81 the withheld fault lines stop being counted, so the log looks complete', function () {
  // Above the bound the remainder is withheld and SAID so - the same rule the baseline has. A meta line
  // reporting 12 of 12 when 20 exist is a truncated report claiming to be a whole one.
  var m = swapS1('      lines_withheld: Math.max(0, out.fault_count - out.fault_lines_emitted),',
    '      lines_withheld: 0,');
  function run(src) {
    var s = {}; Object.keys(pos()).forEach(function (k) { s[k] = pos()[k]; });
    s.movements = [];
    for (var i = 1; i <= 20; i++) {
      s.movements.push({ movement_date: '2026-09-01', sku: SKU, warehouse_id: WHF,
        movement_type: 'IN', qty: i });
    }
    if (src) s.s1 = src;
    var w = S1World(s);
    vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx);
    return logObj(w, 's1_factory_movement_id_fault_meta');
  }
  var clean = run(null), bad = run(m);
  return clean.fault_count === 20 && clean.lines_emitted === 12 && clean.lines_withheld === 8
    && bad.fault_count === 20 && bad.lines_emitted === 12 && bad.lines_withheld === 0;
});


mut('N82 an over-wide fault line is cut instead of narrowed', function () {
  // The rule the baseline already has, applied to a fault line: never truncated. A cut line is not a
  // shorter report, it is a broken one - JSON.parse fails on it, so the row number an operator needs is
  // not merely abbreviated but unreadable. Narrowing drops NAMED fields and keeps everything that locates
  // the row; cutting keeps whatever happened to fit.
  var m = swapS1('      payload = JSON.stringify(slim);', '      payload = payload.slice(0, budget);');
  function wide(src) {
    var sp = {};
    Object.keys(pos()).forEach(function (k) { sp[k] = pos()[k]; });
    sp.movements = [{ factory_stock_movement_id: 'FSMV-1', movement_date: '2026-09-01', sku: SKU,
      warehouse_id: WHF, movement_type: 'IN', qty: 5 }];
    if (src) sp.s1 = src;
    var w = S1World(sp);
    var sh = w.sheets['factory_stock_movements'];
    var extra = [];
    for (var k = 1; k <= 30; k++) { extra.push('extended_attribute_column_number_' + k); }
    sh.rows[0] = sh.rows[0].concat(extra);
    sh.rows[1] = sh.rows[1].concat(extra.map(function () {
      return 'a value that is long enough to matter'; }));
    var noid = sh.rows[1].slice();
    noid[0] = '';
    sh.rows.push(noid);
    vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS()', w.ctx);
    var line = (w.log || []).filter(function (l) {
      return /^\[S1\] s1_factory_movement_id_fault_1_of_1 /.test(String(l)); })[0];
    var body = String(line).replace('[S1] s1_factory_movement_id_fault_1_of_1 ', '');
    var parsed = null;
    try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
    return { bytes: String(line).length, parsed: parsed };
  }
  var clean = wide(null), bad = wide(m);
  return clean.bytes <= 3000 && bad.bytes <= 3000
    // clean: still valid JSON, still locates the row, and names what it left out
    && clean.parsed !== null
    && clean.parsed.one_based_sheet_row_number === 3
    && clean.parsed.full_named_row_fingerprint !== null
    && String(clean.parsed.detail_withheld_reason).indexOf('return value') > 0
    // mutant: a cut line no reader can parse at all
    && bad.parsed === null;
});

// ---- S1-R4E mutants ------------------------------------------------------------------------------------

/** A repairable world plus its freeze, built through a mutated source. */
function aaMut(src, rowsOver) {
  var sp = {};
  Object.keys(pos()).forEach(function (k) { sp[k] = pos()[k]; });
  sp.movements = rowsOver || aaRows(aaIdOnly({}));
  if (src) sp.s1 = src;
  var w = S1World(sp);
  var m = vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL_MANIFEST()', w.ctx);
  return { world: w, man: m };
}
function aaRun(w, arg) {
  vm.runInContext('var __AAM_ARG = ' + JSON.stringify(arg || {}) + ';', w.ctx);
  return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL(__AAM_ARG)', w.ctx);
}
/** Make the write land on a SECOND cell as well as the authorized one. */
function aaSecondCellWriter(w) {
  var sh = w.sheets['factory_stock_movements'];
  var orig = sh.getRange;
  var n = 0;
  sh.getRange = function (r, c, nr, nc) {
    var rg = orig.call(sh, r, c, nr, nc);
    var sv = rg.setValue;
    rg.setValue = function (v) {
      n++;
      if (n === 1) { sh.rows[1][sh.rows[0].indexOf('note')] = 'and this cell too'; }
      return sv.call(rg, v);
    };
    return rg;
  };
}

mut('N83 the repair also touches a second cell', function () {
  // §4/§5. The readback is what makes "one cell" a measurement: the row must hash to the frozen expected
  // AFTER and every other column must be byte-identical. Drop the column comparison and the second cell
  // still moves the row fingerprint, so this mutant is aimed at the thing that says WHICH cell moved -
  // which on a failed repair is the first thing a person needs.
  var m = swapS1("  (fz.target_row_cells || []).forEach(function (c) {\n"
    + '    if (c.column === fz.target_id_column) return;',
    '  (fz.target_row_cells || []).forEach(function (c) {\n'
    + '    if (true) return;');
  var clean = aaMut(null), bad = aaMut(m);
  aaSecondCellWriter(clean.world);
  aaSecondCellWriter(bad.world);
  var cr = aaRun(clean.world, { execute: true, frozen: clean.man.frozen_before,
    authorization: clean.man.authorization_wording });
  var br = aaRun(bad.world, { execute: true, frozen: bad.man.frozen_before,
    authorization: bad.man.authorization_wording });
  var named = function (r) {
    return (r.readback ? r.readback.mismatches : []).map(function (x) { return x.what; })
      .filter(function (x) { return String(x).indexOf('COLUMN_CHANGED:note') === 0; }).length;
  };
  // MEASURED, AND IT CORRECTED MY EXPECTATION. Both runs end in ROLLBACK_FAILED, not
  // EXECUTED_AND_ROLLED_BACK - and that is right: the rollback restores the ONE authorized cell, so a stray
  // write to a second cell cannot be undone and the row can never hash back to its frozen BEFORE. A repair
  // that touched two cells is therefore not recoverable by this tool, and it says so instead of claiming a
  // clean restore.
  //
  // What the mutant loses is the NAME of the cell that moved. Both refuse; only one can tell an operator
  // which column to look at, and on a half-applied repair that is the whole of what they need.
  return cr.verdict === 'ROLLBACK_FAILED' && named(cr) === 1
    && cr.readback.columns_compared === 14
    && cr.rollback.outcome === 'FAILED'
    && br.verdict === 'ROLLBACK_FAILED' && named(br) === 0
    && br.readback.columns_compared === 0;
});

mut('N84 execute becomes a truthy check, so a typo writes to production', function () {
  // `execute` must be exactly true. A truthy test turns the string 'false', 'no' and 1 into an execution,
  // and the default-dry-run property is the whole reason this tool is safe to hand over.
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL',
    "    if (opts.execute !== true) {\n"
    + "      out.verdict = 'DRY_RUN_OK';", '    if (!opts.execute) {\n'
    + "      out.verdict = 'DRY_RUN_OK';");
  var clean = aaMut(null), bad = aaMut(m);
  var cr = aaRun(clean.world, { execute: 'false', frozen: clean.man.frozen_before,
    authorization: clean.man.authorization_wording });
  var br = aaRun(bad.world, { execute: 'false', frozen: bad.man.frozen_before,
    authorization: bad.man.authorization_wording });
  return cr.verdict === 'DRY_RUN_OK' && cr.cells_written === 0 && clean.world.allWrites() === 0
    && br.verdict === 'EXECUTED_OK' && br.cells_written === 1 && bad.world.allWrites() === 1;
});

mut('N85 the classifier looks at the primary key and nothing else', function () {
  // THE CORE DEFECT THIS ROUND EXISTS TO PREVENT. With only the key checked, the LIVE row - missing
  // movement_type, with no ledger axis and quantities that do not reconcile - becomes "repairable", and a
  // one-cell write would SILENCE the census that currently refuses it while leaving the row unclassifiable.
  var m = swapS1("  fa.required_blank.forEach(function (c) {\n"
    + "    if (c !== 'factory_stock_movement_id') o.reasons.push('REQUIRED_FIELD_IS_BLANK:' + c);\n"
    + '  });',
    '  fa.required_blank.forEach(function (c) { if (false) o.reasons.push(c); });');
  var live = aaRows(AAlive2);
  var clean = aaMut(null, live), bad = aaMut(m, live);
  return clean.man.verdict === 'LEGACY_ROW_CLASSIFICATION_REQUIRED'
    && clean.man.frozen_before === null && clean.man.proposed === null
    && clean.man.target.field_audit.required_blank.length === 2
    // the mutant proposes an id and freezes a baseline for a row nobody can classify
    && bad.man.classification_reasons.indexOf('REQUIRED_FIELD_IS_BLANK:movement_type') === -1;
});

mut('N86 the ledger invariant is not checked, so a row whose numbers disagree reads as clean', function () {
  // Every writer sets qty to the delta of the axis its movement_type names. A row where that does not hold
  // was not written under the model the ledger is read under, and repairing its key would make it look sound.
  var m = swapS1("  } else if (aa.invariant_holds !== true) {\n"
    + "    o.reasons.push('QTY_DOES_NOT_RECONCILE_WITH_THE_BEFORE_AFTER_PAIR_ON_THE_'\n"
    + "      + aa.axis + '_AXIS');",
    '  } else if (false) {\n'
    + "    o.reasons.push('QTY_DOES_NOT_RECONCILE');");
  // A row missing ONLY its key, but whose qty does not match its own before/after pair.
  var rows = aaRows(aaIdOnly({ qty: 9999 }));
  var clean = aaMut(null, rows), bad = aaMut(m, rows);
  var NM = 'QTY_DOES_NOT_RECONCILE_WITH_THE_BEFORE_AFTER_PAIR_ON_THE_CURRENT_AXIS';
  return clean.man.verdict === 'LEGACY_ROW_CLASSIFICATION_REQUIRED'
    && clean.man.classification_reasons.indexOf(NM) >= 0
    && clean.man.frozen_before === null
    && bad.man.verdict === 'READY_TO_AUTHORIZE_BACKFILL' && bad.man.frozen_before !== null;
});

mut('N87 the proposed id stops being deterministic, so a retry would mint a second one', function () {
  // 21_ mints with Utilities.getUuid and that is right for a NEW row. A BACKFILL can be retried, and two
  // ids for one row is the one thing a primary key repair must never do.
  var m = swapS1("  var natural = 'FSMV|' + S1_str_(table) + '|row=' + S1_str_(rowNumber)\n"
    + "    + '|fp=' + S1_str_(rowFingerprint);",
    "  if (typeof S1__NONCE_ === 'undefined') { S1__NONCE_ = 0; }\n"
    + '  S1__NONCE_++;\n'
    + "  var natural = 'FSMV|' + S1_str_(table) + '|row=' + S1_str_(rowNumber)\n"
    + "    + '|fp=' + S1_str_(rowFingerprint) + '|n=' + S1__NONCE_;");
  var clean = aaMut(null), bad = aaMut(m);
  var NM = 'the_proposed_id_is_deterministic_so_a_retry_cannot_mint_a_second_one';
  return clean.man.verdict === 'READY_TO_AUTHORIZE_BACKFILL'
    && failed(clean.man).indexOf(NM) === -1
    && bad.man.verdict === 'STOP' && failed(bad.man).indexOf(NM) >= 0
    && bad.man.frozen_before === null && bad.man.authorization_wording === null;
});

mut('N88 the readback takes its expectation from the row it is checking', function () {
  // R4B's defect, one table over: a check whose expectation comes from the thing being checked passes by
  // construction. Here it means a write that landed the WRONG value reads back as a success.
  var m = swapS1("  cmp('target_row_fingerprint', fz.expected_after_row_fingerprint, rec.fingerprint);",
    "  cmp('target_row_fingerprint', rec.fingerprint, rec.fingerprint);");
  function wrongWriter(w) {
    var sh = w.sheets['factory_stock_movements'];
    var orig = sh.getRange;
    var n = 0;
    sh.getRange = function (r, c, nr, nc) {
      var rg = orig.call(sh, r, c, nr, nc);
      var sv = rg.setValue;
      rg.setValue = function (v) {
        n++;
        return sv.call(rg, (n === 1 && String(v).indexOf('FSMV-') === 0) ? 'FSMV-0BADBAD0' : v);
      };
      return rg;
    };
  }
  var clean = aaMut(null), bad = aaMut(m);
  wrongWriter(clean.world); wrongWriter(bad.world);
  var cr = aaRun(clean.world, { execute: true, frozen: clean.man.frozen_before,
    authorization: clean.man.authorization_wording });
  var br = aaRun(bad.world, { execute: true, frozen: bad.man.frozen_before,
    authorization: bad.man.authorization_wording });
  // RE-AIMED BY THE MEASUREMENT. The readback compares the cell's VALUE against the frozen expected id as
  // well as the row's fingerprint, so the wrong value is still caught and the mutant survived my first
  // assertion. That is defence in depth working, and worth recording as such.
  //
  // What the mutant destroys is the FINGERPRINT check - the only one that covers the whole row rather than
  // one cell of it. Without it a repair that landed the right id and disturbed something else would read
  // back clean, which is exactly the self-comparison R4B was called in to repair.
  var fpNamed = function (r) {
    return (r.readback ? r.readback.mismatches : [])
      .filter(function (x) { return x.what === 'target_row_fingerprint'; }).length;
  };
  return cr.readback.ok === false && fpNamed(cr) === 1
    && cr.rollback.outcome === 'RESTORED'
    && br.readback.ok === false && fpNamed(br) === 0;
});

mut('N89 the rollback is not verified, so a failed restore reads as a success', function () {
  // §9. A rollback that is not proven is a hope: the cell is set and nobody looks. Verified by requiring the
  // row to hash back to the FROZEN BEFORE, which is the only value that means "as it was".
  var m = swapS1("  o.outcome = S1_str_(rec.fingerprint) === S1_str_(fz.target_row_fingerprint) ? 'RESTORED'\n"
    + "    : 'FAILED';", "  o.outcome = 'RESTORED';");
  function badRollback(w) {
    var sh = w.sheets['factory_stock_movements'];
    var orig = sh.getRange;
    var n = 0;
    sh.getRange = function (r, c, nr, nc) {
      var rg = orig.call(sh, r, c, nr, nc);
      var sv = rg.setValue;
      rg.setValue = function (v) {
        n++;
        if (n === 1) return sv.call(rg, 'FSMV-0BADBAD1');
        if (n === 2) return sv.call(rg, 'STILL-NOT-BLANK');
        return sv.call(rg, v);
      };
      return rg;
    };
  }
  var clean = aaMut(null), bad = aaMut(m);
  badRollback(clean.world); badRollback(bad.world);
  var cr = aaRun(clean.world, { execute: true, frozen: clean.man.frozen_before,
    authorization: clean.man.authorization_wording });
  var br = aaRun(bad.world, { execute: true, frozen: bad.man.frozen_before,
    authorization: bad.man.authorization_wording });
  return cr.verdict === 'ROLLBACK_FAILED' && cr.rollback.outcome === 'FAILED'
    && br.verdict === 'EXECUTED_AND_ROLLED_BACK' && br.rollback.outcome === 'RESTORED';
});

mut('N90 the authorization check becomes a presence check', function () {
  // The sentence is the authorization. Accepting any non-empty string accepts one that describes a different
  // repair - a different row, a different id, a different table.
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL',
    "    out.authorization_matches_frozen = auth !== '' && auth === S1_str_(fz.authorization_wording);",
    "    out.authorization_matches_frozen = auth !== '';");
  var clean = aaMut(null), bad = aaMut(m);
  var cr = aaRun(clean.world, { execute: true, frozen: clean.man.frozen_before,
    authorization: 'I authorize something else entirely.' });
  var br = aaRun(bad.world, { execute: true, frozen: bad.man.frozen_before,
    authorization: 'I authorize something else entirely.' });
  return cr.verdict === 'REFUSED' && clean.world.allWrites() === 0
    && br.verdict === 'EXECUTED_OK' && bad.world.allWrites() === 1;
});

mut('N91 a refused manifest keeps its freeze and its sentence', function () {
  // MANIFEST P's LOCK FIVE, applied here: the baseline and the sentence are the same authorization by two
  // routes, so a refusal must take both. A frozen id for a row nobody can classify is an authorization
  // waiting to be misused.
  var m = swapS1("    if (out.verdict !== 'READY_TO_AUTHORIZE_BACKFILL') {\n"
    + '      out.frozen_before = null;\n'
    + '      out.authorization_wording = null;',
    "    if (false) {\n"
    + '      out.frozen_before = null;\n'
    + '      out.authorization_wording = null;');
  // A world that measures cleanly and is then refused on the DETERMINISM predicate, which fires after the
  // freeze has been built - the only path where one exists at the moment of refusal.
  var nonce = "  if (typeof S1__NONCE2_ === 'undefined') { S1__NONCE2_ = 0; }\n"
    + '  S1__NONCE2_++;\n'
    + "  var natural = 'FSMV|' + S1_str_(table) + '|row=' + S1_str_(rowNumber)\n"
    + "    + '|fp=' + S1_str_(rowFingerprint) + '|n=' + S1__NONCE2_;";
  var ANCHOR = "  var natural = 'FSMV|' + S1_str_(table) + '|row=' + S1_str_(rowNumber)\n"
    + "    + '|fp=' + S1_str_(rowFingerprint);";
  var cleanSrc = swapS1(ANCHOR, nonce);
  var badSrc = swap2_(cleanSrc, "    if (out.verdict !== 'READY_TO_AUTHORIZE_BACKFILL') {\n"
    + '      out.frozen_before = null;\n'
    + '      out.authorization_wording = null;',
    "    if (false) {\n"
    + '      out.frozen_before = null;\n'
    + '      out.authorization_wording = null;');
  var clean = aaMut(cleanSrc), bad = aaMut(badSrc);
  // RE-AIMED BY THE MEASUREMENT. `out.frozen_before` is only ASSIGNED when nothing has failed, so the
  // baseline never leaks even without the lock - the same structure MANIFEST P has. The SENTENCE is
  // different: it is built and assigned before that check, so it is the half the lock actually withholds.
  // A refused run that still hands over a signable sentence is an authorization waiting to be misused.
  return clean.man.verdict === 'STOP'
    && clean.man.frozen_before === null && clean.man.authorization_wording === null
    && bad.man.verdict === 'STOP'
    && bad.man.frozen_before === null
    && bad.man.authorization_wording !== null
    && String(bad.man.authorization_wording).indexOf('I authorize ONE controlled') === 0;
});

mut('N92 an absent vocabulary authority is reported as an invalid movement_type', function () {
  // THIS ROUND'S OWN FIRST MISTAKE, KEPT AS A MUTANT. With 21_ not loaded, `manual_adjustment` - one of the
  // canonical seven - was classified as "not in the canonical vocabulary". Both states refuse, correctly;
  // the difference is that one of them is a data problem and the other is a deployment one, and telling an
  // operator the wrong one sends them to repair a row that is fine.
  var m = swapS1('  } else if (aa.vocabulary_authority_available !== true) {',
    '  } else if (false) {');
  var kill = 'factoryStockIsKnownMovementType_ = undefined;'
    + ' factoryStockIsCurrentMovement_ = undefined;'
    + ' factoryStockIsReservationMovement_ = undefined;';
  function run(src) {
    var sp = {};
    Object.keys(pos()).forEach(function (k) { sp[k] = pos()[k]; });
    sp.movements = aaRows(aaIdOnly({}));
    sp.after = kill;
    if (src) sp.s1 = src;
    var w = S1World(sp);
    return vm.runInContext('RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL_MANIFEST()', w.ctx);
  }
  var clean = run(null), bad = run(m);
  var ABSENT = 'MOVEMENT_TYPE_VOCABULARY_AUTHORITY_IS_UNAVAILABLE_IN_THIS_DEPLOYMENT';
  var INVALID = 'MOVEMENT_TYPE_IS_NOT_IN_THE_CANONICAL_VOCABULARY:manual_adjustment';
  return clean.verdict === 'LEGACY_ROW_CLASSIFICATION_REQUIRED'
    && clean.classification_reasons.indexOf(ABSENT) >= 0
    && clean.classification_reasons.indexOf(INVALID) === -1
    // the mutant blames the data for what the deployment cannot check
    && bad.classification_reasons.indexOf(ABSENT) === -1
    && bad.classification_reasons.indexOf(INVALID) >= 0;
});

// ---- S1-R4F — the provenance census. -----------------------------------------------------------------
// The pin is derived from a world built on the CLEAN source, then handed to the mutated one. Deriving it
// from the mutant would let a mutant that breaks fingerprinting move the expectation along with it, which
// is the self-comparison this whole family of diagnostics exists to refuse.
function swapIn(src, a, b) {
  var n = src.split(a).length - 1;
  if (n !== 1) throw new Error('swapIn anchor count ' + n + ' :: ' + a.slice(0, 90));
  return src.split(a).join(b);
}
function abMut(src, rows, pinOver, extra) {
  var sp = {};
  Object.keys(pos()).forEach(function (k) { sp[k] = pos()[k]; });
  sp.movements = rows;
  sp.factory_stock = AB_POOL_;
  Object.keys(extra || {}).forEach(function (k) { sp[k] = extra[k]; });
  var pin = abPin(S1World(sp), pinOver);
  if (src) sp.s1 = src;
  var w = S1World(sp);
  var r = abProv(w, { expect: pin });
  r.world = w;
  return r;
}

mut('N93 the independence rule counts sources instead of INDEPENDENT sources', function () {
  var m = swapS1(
    '      if (x.independent && c.independent_supporting_sources.indexOf(x.source) === -1) {',
    '      if (c.independent_supporting_sources.indexOf(x.source) === -1) {');
  // A THREE-ROW CHAIN, AND THE MIDDLE ROW IS THE TARGET. The first version of this mutant used a two-row
  // world and SURVIVED, for a reason worth keeping: with the target first in the chain, removing it breaks
  // nothing, so INVALID_NON_LEDGER_ROW went uncontradicted and reached two sources under the mutation too -
  // two qualifying candidates, and the census refused for the right reason by accident. Here removing the
  // target breaks an overlap that currently holds, so that candidate is blocked and the mutation has exactly
  // one way to express itself.
  //
  // No pool row either, so the only independent source is the chain. The row's OWN arithmetic must not be
  // allowed to make up the second one: an interpretation supported only by the row it interprets has a
  // sample size of one, and this file has already found one live case of a fingerprint compared with itself.
  var rows = [abLive(),
    abFull({ factory_stock_movement_id: 'FSMV-000000F6', created_at: '2026-06-01T00:00:00Z',
      movement_date: '2026-06-01', before_current_stock: 800, after_current_stock: 1000, qty: 200 }),
    abFull({ before_current_stock: 12000, after_current_stock: 12500, qty: 500 })];
  var clean = abMut(null, rows, null, { factory_stock: [] });
  var bad = abMut(m, rows, null, { factory_stock: [] });
  return clean.verdict === 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED'
    && clean.candidates[1].independent_supporting_sources.length === 1
    && bad.verdict === 'READY_FOR_LEGACY_ROW_REPAIR_DECISION'
    && bad.candidates[1].independent_supporting_sources.indexOf('ROW_SELF_ARITHMETIC') >= 0;
});

// The anchor is the whole if/else: replacing only the `if` leaves a dangling `else` and the probe throws
// rather than measuring anything, which is a broken mutant and not a caught one.
var L94a = ["      if (c.contradicting_sources.length === 0) o.qualifying.push(c.candidate);",
  '      else o.blocked_by_contradiction.push({ candidate: c.candidate,',
  '        contradicted_by: c.contradicting_sources.slice() });'].join(NL);
var L94b = '      o.qualifying.push(c.candidate);';
mut('N94 a candidate with two sources qualifies even when something authoritative contradicts it',
  function () {
    var m = swapS1(L94a, L94b);
    var rows = [abLive(), abSibling({ sku: 'OTHER-SKU', qty: 5000, before_current_stock: 1000,
      after_current_stock: 5000 }), abFull()];
    var clean = abMut(null, rows), bad = abMut(m, rows);
    // The sibling says the batch wrote BALANCES and the chain says the pair is right. Both readings have
    // two independent sources and both are contradicted, so the honest answer is that nobody wins.
    return clean.verdict === 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED'
      && clean.verdict_detail.blocked_by_contradiction.length === 2
      && clean.verdict_detail.qualifying.length === 0
      && bad.verdict_detail.qualifying.length === 2
      && bad.verdict === 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED'
      // It still refuses - on ambiguity rather than on contradiction - and the DIFFERENCE is that the
      // blocked list is empty, so an operator is told two readings are equally supported when in fact
      // each one has authoritative evidence against it. Same verdict, opposite meaning.
      && bad.verdict_detail.blocked_by_contradiction.length === 0;
  });

mut('N95 two qualifying candidates picks the first instead of refusing', function () {
  var m = swapS1('  if (o.qualifying.length === 1) {', '  if (o.qualifying.length >= 1) {');
  // before = 0 makes a SET and a delta the SAME row: qty === after - before AND qty === after are both
  // true, and no evidence in the database can separate them. Ambiguity is not a choice.
  var rows = [abLive({ before_current_stock: 0 }), abFull()];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  return clean.verdict === 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED'
    && clean.verdict_detail.qualifying.length === 2 && clean.selected_candidate === null
    && bad.verdict === 'READY_FOR_LEGACY_ROW_REPAIR_DECISION'
    && bad.selected_candidate !== null;
});

mut('N96 a drifted live state is reported and then reasoned past anyway', function () {
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_PROVENANCE_CENSUS',
    "      if (!okv) stop('LIVE_STATE_DRIFTED:' + name);", '');
  var rows = [abLive(), abFull()];
  var over = { table_combined_fingerprint: 'DEADBEEF' };
  var clean = abMut(null, rows, over), bad = abMut(m, rows, over);
  // RE-AIMED BY THE MEASUREMENT. Both runs STOP, and that is right: every frozen fact is ALSO a ledger
  // predicate, and `fin()` makes any failed predicate a STOP. Defence in depth working, and worth recording
  // as such rather than asserting around.
  //
  // What the mutant destroys is the NAMED REASON. The operator gets STOP with an empty stop_reasons list
  // and has to go and diff two fingerprints by eye to find out which of eleven frozen facts moved - which
  // is the same defect R4D was called in to repair, one level up: a refusal that will not say what it saw.
  return clean.verdict === 'STOP'
    && clean.stop_reasons.indexOf('LIVE_STATE_DRIFTED:table_combined_fingerprint') >= 0
    && bad.verdict === 'STOP' && bad.stop_reasons.length === 0
    && bad.live_state_confirmed === false;
});

mut('N97 a STOP still hands over the operator questions it was refused the right to ask', function () {
  // TWO STAGES, AND THE FIRST ONE IS WHAT MAKES THE LOCK OBSERVABLE. Measured: on a FROZEN-STATE drift the
  // run returns before the questions are ever built, so removing the lock changes nothing and the mutant
  // survives - exactly the shape of R4E's N91 finding. The lock earns its keep on the other path: a LEDGER
  // PREDICATE that fails LATE, after the candidates and the questions have been assembled. There `fin()`
  // turns the verdict to STOP with a decision framework already sitting in the output.
  //
  // So the mutant first breaks a late predicate - which the CLEAN source survives correctly, withholding the
  // questions - and then removes the lock on top of that.
  var LATE = ['      out.chronology.target_position !== null,'
    + ' out.chronology.target_position !== null);'].join(NL);
  var withLate = swapS1(LATE,
    '      out.chronology.target_position !== null, false);');
  var m = swapIn(withLate,
    "    if (out.verdict === 'STOP') out.operator_questions = null;", '');
  // AND THE WORLD HAS TO BE ONE THAT REFUSES ON THE EVIDENCE. Measured: with the pool row present this is
  // the READY world, so `operator_questions` is never assigned and the lock is unobservable again - the
  // same trap, one level in. No pool row means one independent source, which means
  // OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED, which means the questions exist by the time `fin()` runs.
  var rows = [abLive(), abFull()];
  var noPool = { factory_stock: [] };
  var clean = abMut(withLate, rows, null, noPool), bad = abMut(m, rows, null, noPool);
  // A refused run that still publishes a decision framework is a decision framework about a table nobody
  // confirmed. Same lock as LOCK FIVE one table over: the refusal owns what it withholds.
  return clean.verdict === 'STOP' && clean.operator_questions === null
    && clean.candidates.length === 4
    && bad.verdict === 'STOP' && bad.operator_questions !== null
    && bad.operator_questions.question_count === 3;
});

mut('N98 a blank cell is treated as matching a writer constant', function () {
  var m = swapS1('      if (got !== sg.always_constant[c]) {',
    "      if (got !== '' && got !== sg.always_constant[c]) {");
  var rows = [abLive(), abFull()];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  function why(r) { return r.writer_elimination.per_writer[0].because.join('|'); }
  // A BLANK DIFFERS FROM EVERY CONSTANT. Reading it as a wildcard is how a row nothing wrote comes to look
  // like a row this writer wrote, and the elimination stops eliminating.
  return why(clean).indexOf('THIS_WRITER_ALWAYS_WRITES_movement_type=manual_adjustment') >= 0
    && why(bad).indexOf('THIS_WRITER_ALWAYS_WRITES_movement_type') === -1;
});

mut('N99 a row with no usable time is placed at the head of the chronology', function () {
  // RE-AIMED. My first attempt injected a now() fallback into S1_movTimeKey_ and SURVIVED, because the
  // per-column loop returns on a blank cell before it ever reaches the parse - the guard the fallback was
  // meant to defeat is upstream of it. The behaviour that actually matters is where the row is PUT: a
  // timeless row sorting first becomes 'the earliest event in this pool', which is a confident and wrong
  // statement about the one thing nobody recorded.
  var m = swapS1(
    ['    if (a.tk.ms === null) return 1;                       '
      + '// unknown time goes last, never first',
      '    if (b.tk.ms === null) return -1;'].join(NL),
    ['    if (a.tk.ms === null) return -1;',
      '    if (b.tk.ms === null) return 1;'].join(NL));
  var rows = [abLive(), abFull(), abFull({ factory_stock_movement_id: 'FSMV-000000C3',
    movement_date: '', created_at: '', before_current_stock: 12500, after_current_stock: 12600, qty: 100 })];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  function first(r) { return r.chronology.entries[0].one_based_sheet_row_number; }
  function last(r) {
    return r.chronology.entries[r.chronology.entries.length - 1].one_based_sheet_row_number;
  }
  return clean.chronology.rows_without_a_usable_time === 1 && last(clean) === 4 && first(clean) === 2
    && bad.chronology.rows_without_a_usable_time === 1 && first(bad) === 4;
});

mut('N106 the ordering claims to be unambiguous with a row whose time nobody recorded', function () {
  var m = swapS1(
    '  o.ordering_is_unambiguous = o.tied_time_groups === 0 && o.rows_without_a_usable_time === 0;',
    '  o.ordering_is_unambiguous = o.tied_time_groups === 0;');
  var rows = [abLive(), abFull(), abFull({ factory_stock_movement_id: 'FSMV-000000C3',
    movement_date: '', created_at: '', before_current_stock: 12500,
    after_current_stock: 12600, qty: 100 })];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  // A chronology with a timeless row in it has an unknown ordering, and every reading built on that
  // ordering - which next movement follows the target, which links overlap - inherits the uncertainty. The
  // count is still reported either way; the mutant is that the ordering stops admitting what it costs.
  return clean.chronology.rows_without_a_usable_time === 1
    && clean.chronology.ordering_is_unambiguous === false
    && bad.chronology.rows_without_a_usable_time === 1
    && bad.chronology.ordering_is_unambiguous === true;
});

mut('N100 a chain link nobody recorded is counted as a link that agreed', function () {
  var m = swapS1("      } else if (c.state === 'UNEVALUABLE') bucket.unevaluable++;",
    "      } else if (c.state === 'UNEVALUABLE') bucket.agree++;");
  var rows = [abLive(), abFull(), abFull({ factory_stock_movement_id: 'FSMV-000000D4',
    before_current_stock: 12500, after_current_stock: 12800, qty: 300,
    created_at: '2026-06-25T00:00:00Z', movement_date: '2026-06-25' })];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  // The target's reserved pair is blank, so that link was never read. Counting it as an agreement reports a
  // continuous reserved chain across a hole - and the reserved axis is exactly where the missing evidence is.
  return clean.chain_continuity.reserved_axis.unevaluable === 1
    && clean.chain_continuity.chain_is_continuous_on_the_reserved_axis === false
    && bad.chain_continuity.reserved_axis.unevaluable === 0
    && bad.chain_continuity.chain_is_continuous_on_the_reserved_axis === true;
});

mut('N101 the sibling testifies by its type NAME instead of by its own cells', function () {
  var m = swapS1(
    "        : (sb2 === 0 ? 'AMBIGUOUS_BECAUSE_ITS_OWN_BEFORE_IS_ZERO'",
    "        : (false ? 'AMBIGUOUS_BECAUSE_ITS_OWN_BEFORE_IS_ZERO'");
  var rows = [abLive(), abSibling({ sku: 'OTHER-SKU', qty: 5000, before_current_stock: 0,
    after_current_stock: 5000 }), abFull()];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  function conv(r) {
    var d = r.siblings.per_column_diff_against_the_first_classified_sibling;
    return d ? d.sibling_convention : null;
  }
  // When the sibling's own before is 0 a delta and a balance are the SAME number, so it cannot distinguish
  // what the target row is being asked to distinguish. The mutant makes it testify anyway.
  return conv(clean) === 'AMBIGUOUS_BECAUSE_ITS_OWN_BEFORE_IS_ZERO'
    && clean.evidence.filter(function (e) {
      return e.source === 'SIBLING_SHAPE_BATCH' && e.supports.length; }).length === 0
    && conv(bad) !== 'AMBIGUOUS_BECAUSE_ITS_OWN_BEFORE_IS_ZERO'
    && bad.evidence.filter(function (e) {
      return e.source === 'SIBLING_SHAPE_BATCH' && e.supports.length; }).length === 1;
});

mut('N102 the batch sibling is looked for on the exact blank-shape, which can never match', function () {
  var m = swapS1("    if (nearShape && mt !== '' && firstClassified === null) firstClassified = r;",
    "    if (sameShape && mt !== '' && firstClassified === null) firstClassified = r;");
  var rows = [abLive(), abSibling({ sku: 'OTHER-SKU' }), abFull()];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  // The target's blank-shape INCLUDES movement_type, so a row matching it exactly is by definition also
  // unclassified. An exact-shape template search can only ever return more of the same problem - it does
  // not find fewer templates, it finds none, and the batch becomes invisible.
  return clean.siblings.classified_sibling_available_as_a_template === true
    && bad.siblings.classified_sibling_available_as_a_template === false
    && bad.siblings.per_column_diff_against_the_first_classified_sibling === null;
});

mut('N103 the balance is used as evidence even when it is the target row echoing itself', function () {
  var m = swapS1('  if (bal && bal.current_agrees === true && bal.attributable_to_the_target_row === true) {',
    '  if (bal && bal.current_agrees === true) {');
  var rows = [abLive({ created_at: '2026-12-31' }), abFull()];
  var extra = { factory_stock: [{ warehouse_id: WHF, sku: SKU,
    fac_current_stock: 12000, fac_reserved_stock: 0 }] };
  var clean = abMut(null, rows, null, extra), bad = abMut(m, rows, null, extra);
  // R4B's defect, one table over. With the target last in the chain, "factory_stock agrees with the ledger's
  // last after_current_stock" is after_current_stock agreeing with itself.
  return clean.balance_reconcile.independent_of_the_target_row === false
    && clean.evidence.filter(function (e) { return e.source === 'FACTORY_STOCK_BALANCE'; }).length === 0
    && bad.evidence.filter(function (e) { return e.source === 'FACTORY_STOCK_BALANCE'; }).length === 1;
});

mut('N104 a provenance table that does not exist is reported as one that had nothing in it', function () {
  var m = swapS1("    if (!t.present) { o.tables_absent.push(spec.table); o.per_table.push(e); return; }",
    "    if (!t.present) { e.present = true; e.readable = true; e.row_count = 0;"
    + ' o.per_table.push(e); return; }');
  var rows = [abLive(), abFull()];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  // "There is no import-audit table" and "the import-audit table has no matching row" are different answers
  // to the provenance question, and only one of them is evidence.
  return clean.cross_table.tables_absent.indexOf('purchase_orders') >= 0
    && bad.cross_table.tables_absent.indexOf('purchase_orders') === -1
    && bad.cross_table.per_table.filter(function (e) {
      return e.table === 'purchase_orders'; })[0].row_count === 0;
});

mut('N105 a caller-supplied expectation is presented as the frozen authorization', function () {
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_PROVENANCE_CENSUS',
    '  out.expectation_source = opts.expect', '  out.expectation_source = false');
  var rows = [abLive(), abFull()];
  var clean = abMut(null, rows), bad = abMut(m, rows);
  // The pin is what the census holds the world to. A run pinned to something the caller handed it is not a
  // measurement of the live sheet, and a reader who cannot tell the two apart cannot use either.
  return String(clean.expectation_source).indexOf('CALLER_SUPPLIED') === 0
    && bad.expectation_source === 'THE_FROZEN_S1_R4E_AUTHORIZATION';
});

// ---- S1-R4G — the epoch boundary and the evidence attribution. --------------------------------------
// Each of these eight restores ONE of R4F's behaviours. They are not hypothetical mutations: N107, N108,
// N109 and N110 are the four contradictions R4F actually published about the live table, expressed as code
// changes. If any of them survives, the repair is decoration.
var AC_POOL_MUT_ = { factory_stock: AC_POOL_ };
function acMut(src, rows) { return abMut(src, rows, null, AC_POOL_MUT_); }
var AC_ROWS_ = [abLive(), acImport()];

mut('N107 a ledger epoch boundary is counted as a chain break', function () {
  var m = swapS1("      o.state = 'LEDGER_EPOCH_BOUNDARY'; o.comparable = false; o.discriminating = false;",
    "      o.state = 'DISAGREES'; o.comparable = true; o.discriminating = true;");
  var clean = acMut(null, AC_ROWS_), bad = acMut(m, AC_ROWS_);
  // The target closes at 12000 and the next row opens at the create-path literal 0. Under the mutation that
  // is one broken link and a break position to point at - about a chain in which nothing was ever compared.
  return clean.chain_continuity.current_axis.disagree === 0
    && clean.chain_continuity.current_axis.epoch_boundary === 1
    && clean.chain_continuity.first_break_at_position === null
    && bad.chain_continuity.current_axis.disagree === 1
    && bad.chain_continuity.first_break_at_position === 2;
});

mut('N108 the balance scores on independence alone, without asking which epoch it reconciles', function () {
  var m = swapS1('  if (bal && bal.current_agrees === true && bal.attributable_to_the_target_row === true) {',
    '  if (bal && bal.current_agrees === true && bal.independent_of_the_target_row === true) {');
  var clean = acMut(null, AC_ROWS_), bad = acMut(m, AC_ROWS_);
  function backs(r) {
    return r.candidates.filter(function (c) {
      return c.supporting_sources.indexOf('FACTORY_STOCK_BALANCE') >= 0; }).length;
  }
  // factory_stock holds 2210, which is row 3's closing balance in row 3's OWN epoch. It is independent of
  // the target row and says nothing about it. R4F's test was independence, so it scored the agreement as
  // support for two classifications of a row on the far side of a boundary the balance cannot see past.
  return clean.balance_reconcile.independent_of_the_target_row === true
    && clean.balance_reconcile.attributable_to_the_target_row === false
    && backs(clean) === 0
    && backs(bad) === 2;
});

mut('N109 a successor that was found is reported as a successor that does not exist', function () {
  var m = swapS1("        case 'NOT_COMPARABLE_ACROSS_A_BOUNDARY':\n"
    + "          return 'NOT_COMPARABLE_ACROSS_A_LEDGER_EPOCH_BOUNDARY - a later classifiable movement EXISTS in'\n"
    + "            + ' this pool and is not comparable with this row';",
    "        case 'NOT_COMPARABLE_ACROSS_A_BOUNDARY':\n"
    + "          return 'NOT_MEASURABLE - no classifiable movement follows this one in this pool';");
  var clean = acMut(null, AC_ROWS_), bad = acMut(m, AC_ROWS_);
  function denies(r) {
    return r.candidates.filter(function (c) {
      return String(c.subsequent_chain_compatibility).indexOf('no classifiable movement follows') > 0;
    }).length;
  }
  // THE FLAGSHIP R4F CONTRADICTION, RESTORED VERBATIM. Row 3 is `inventory_import`, it is printed in the
  // census's own successor line, and all four candidates deny it exists. What is unusable about it is that
  // it is not comparable - which is a different sentence, and the only true one.
  return clean.next_classifiable_same_pool_movement !== null
    && denies(clean) === 0
    && bad.next_classifiable_same_pool_movement !== null
    && denies(bad) === 4;
});

mut('N110 removing the target row is claimed to repair a break that was only a boundary', function () {
  var m = swapS1('  var brokeWith = withAll.current_axis.disagree;',
    '  var brokeWith = withAll.current_axis.disagree + withAll.current_axis.epoch_boundary;');
  var clean = acMut(null, AC_ROWS_), bad = acMut(m, AC_ROWS_);
  // R4F counted boundaries as breaks, so the arithmetic 1 > 0 && 0 < 1 published `true` - and pointed the
  // operator at the target row as the cause of a boundary it sits upstream of. Deleting one of the two rows
  // a comparison was made between removes the comparison; it never settles it.
  return clean.chain_without_the_target.removing_it_repairs_a_break === null
    && String(clean.chain_without_the_target.removing_it_repairs_a_break_state)
      .indexOf('NOT_APPLICABLE') === 0
    && bad.chain_without_the_target.removing_it_repairs_a_break === true;
});

mut('N111 the continuity argument is made against a row on the far side of the boundary', function () {
  var m = swapS1('  var nxtEpoch = nm.next_same_ledger_epoch_movement || null;',
    '  var nxtEpoch = nm.next_classifiable_same_pool_movement || null;');
  var clean = acMut(null, AC_ROWS_), bad = acMut(m, AC_ROWS_);
  // The next classifiable row opens at the create-path literal 0. Comparing the target's after_current_stock
  // against it is comparing a balance with a placeholder for an absence - and the mutant then reports the
  // result of that comparison as a measurement of the chain.
  return clean.chain_reading_state === 'NOT_COMPARABLE_ACROSS_A_BOUNDARY'
    && bad.chain_reading_state === 'MEASURED_AND_NEUTRAL'
    && String(clean.candidates[0].subsequent_chain_compatibility)
      .indexOf('NOT_COMPARABLE_ACROSS_A_LEDGER_EPOCH_BOUNDARY') === 0
    && String(bad.candidates[0].subsequent_chain_compatibility)
      .indexOf('NOT_COMPARABLE') !== 0;
});

mut('N112 the create-path signature is claimed without checking that a writer could have written it', function () {
  // AIMED AT THE ONE GUARD THAT DECIDES. The first version of this mutant swapped the signature
  // function's own `if`, and SURVIVED - because the link classifier re-asked the same question and still
  // refused. Two copies of one rule is not defence in depth, it is two authorities; the census now answers
  // it once, in `writer_could_have_written_it`, and this is that line.
  var m = swapS1('  o.writer_could_have_written_it = o.movement_type_is_known === true;',
    '  o.writer_could_have_written_it = o.movement_type_is_known !== undefined;');
  var noVocab = { factory_stock: AC_POOL_,
    after: 'factoryStockIsKnownMovementType_ = undefined;'
      + ' factoryStockIsCurrentMovement_ = undefined;'
      + ' factoryStockIsReservationMovement_ = undefined;' };
  var clean = abMut(null, AC_ROWS_, null, noVocab), bad = abMut(m, AC_ROWS_, null, noVocab);
  // R4E's lesson, on R4G's new test. With the vocabulary absent, `movement_type_is_known` is null - and null
  // is neither yes nor no. The clean code refuses to confirm the boundary and says WHY; the mutant asserts a
  // decided boundary from a question the deployment could not answer. An absent authority is not a value.
  return clean.chain_continuity.links[0].current.state === 'NOT_COMPARABLE'
    && clean.chain_continuity.links[0].current.epoch_boundary.kind
      === 'UNDECIDABLE_THE_VOCABULARY_AUTHORITY_IS_ABSENT'
    && clean.chain_continuity.links[0].current.epoch_boundary.signature
      .writer_could_have_written_it === false
    && bad.chain_continuity.links[0].current.state === 'LEDGER_EPOCH_BOUNDARY'
    && bad.chain_continuity.links[0].current.epoch_boundary.signature
      .writer_could_have_written_it === true;
});

mut('N113 a measurement that discriminated nothing is filed as though it did', function () {
  var m = swapS1('    discriminates: s.length > 0 || c.length > 0 };', '    discriminates: true };');
  var clean = acMut(null, AC_ROWS_), bad = acMut(m, AC_ROWS_);
  // MEASURED AND NEUTRAL IS NOT THE SAME AS NOT MEASURED, and it is not the same as support either. Two of
  // this world's evidence items name no candidate at all - the boundary and the unattributable balance - and
  // the partition is what lets a reader see that they were read and still counted for nothing.
  return clean.non_discriminating_evidence_count >= 2
    && clean.discriminating_evidence_count + clean.non_discriminating_evidence_count
      === clean.evidence_count
    && bad.non_discriminating_evidence_count === 0;
});

mut('N114 the chronology is never segmented, so every row is in one epoch', function () {
  var m = swapS1('      if (link && link.starts_a_new_epoch) {',
    '      if (link && link.starts_a_new_epoch && false) {');
  var clean = acMut(null, AC_ROWS_), bad = acMut(m, AC_ROWS_);
  // One epoch means the balance reconciles the target's own chain, which is how the unattributable agreement
  // gets back in. The segmentation is not bookkeeping - it is the thing the attribution test reads.
  return clean.ledger_epochs.epoch_count === 2
    && clean.balance_reconcile.attributable_to_the_target_row === false
    && bad.ledger_epochs.epoch_count === 1
    && bad.balance_reconcile.attributable_to_the_target_row === true;
});




// ---- S1-R4H — the controlled removal package. ------------------------------------------------------
// Ten restorations of a behaviour this round exists to prevent. Several of them are measured on the FIELD
// they destroy rather than on the verdict: the package has more than one check over the same fact in places,
// and where that is true the mutant is aimed at what it actually breaks rather than asserted around.
function adMutWorld(src, rows, extra, noLock) {
  var e = { s1: src };
  Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
  return adWorld(rows, e, noLock);
}
/** Build a world on the given source, take the manifest, run the removal. */
function adCycle(src, arg, rows, extra, noLock, patch) {
  var w = adMutWorld(src, rows, extra, noLock);
  var m = adMan(w);
  if (patch) patch(w);
  var a = { frozen: m.frozen_before, authorization: m.authorization_wording };
  Object.keys(arg || {}).forEach(function (k) { a[k] = arg[k]; });
  var r = adRun(w, a);
  r.world = w;
  r.man = m;
  return r;
}
/** Clear one row too far. Injected on the WORLD, not on the source, so a mutant can be about the ROLLBACK. */
function adSpillOnClear(w) {
  var sh = w.sheets.factory_stock_movements;
  var orig = sh.getRange;
  sh.getRange = function (row, col, nr, nc) {
    var r = orig.call(this, row, col, nr, nc);
    var s = this;
    var base = r.clearContent;
    if (base) {
      r.clearContent = function () {
        base.call(r);
        for (var j = 0; j < (nc || 1); j++) s.rows[row][col - 1 + j] = '';
      };
    }
    return r;
  };
}

mut('N115 the removal execute gate becomes truthy, so a typo empties a production row', function () {
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL',
    "    if (opts.execute !== true) {" + NL + "      out.verdict = 'DRY_RUN_OK';",
    "    if (!opts.execute) {" + NL + "      out.verdict = 'DRY_RUN_OK';");
  var clean = adCycle(null, { execute: 'false' });
  var bad = adCycle(m, { execute: 'false' });
  return clean.verdict === 'DRY_RUN_OK' && clean.cells_cleared === 0 && clean.world.allWrites() === 0
    && bad.verdict === 'EXECUTED_OK' && bad.cells_cleared === 6 && bad.world.allWrites() === 1;
});

mut('N116 the removal authorization check becomes a presence check', function () {
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL',
    "    out.authorization_matches_frozen = auth !== '' && auth === S1_str_(fz.authorization_wording);",
    "    out.authorization_matches_frozen = auth !== '';");
  var arg = { execute: true, authorization: 'I authorize something else entirely.' };
  var clean = adCycle(null, arg), bad = adCycle(m, arg);
  return clean.verdict === 'REFUSED' && clean.world.allWrites() === 0
    && bad.verdict === 'EXECUTED_OK' && bad.world.allWrites() === 1;
});

mut('N117 the clear spills onto the next row, and the readback lets it', function () {
  // The blast radius of a range write is the RANGE. One row too far destroys a record nobody authorized
  // touching, and the row-number map is what refuses it.
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL',
    '      R.sheet.getRange(fz.target_row_number, 1, 1, R.live_column_count).clearContent();',
    '      R.sheet.getRange(fz.target_row_number, 1, 2, R.live_column_count).clearContent();');
  var clean = adCycle(null, { execute: true }), bad = adCycle(m, { execute: true });
  return clean.verdict === 'EXECUTED_OK' && clean.readback.ok === true
    && bad.verdict !== 'EXECUTED_OK' && bad.readback.ok === false
    && bad.readback.mismatches.filter(function (x) {
      return x.what === 'remaining_row_fingerprint_map_fingerprint'; }).length === 1;
});

mut('N118 the rollback verifies the row and not the table, so a spill is called fully restored', function () {
  // BOTH, NOT EITHER. The row fingerprint proves the fifteen cells came back; only the TABLE fingerprint can
  // say that nothing else moved while they did. The spill is injected on the world, so this mutant is about
  // the rollback and nothing else.
  var m = swapS1In('S1_remRollback_',
    "  o.outcome = (rowOk && tableOk) ? 'ROLLED_BACK_VERIFIED' : 'MANUAL_RECOVERY_REQUIRED';",
    "  o.outcome = rowOk ? 'ROLLED_BACK_VERIFIED' : 'MANUAL_RECOVERY_REQUIRED';");
  var clean = adCycle(null, { execute: true }, undefined, null, false, adSpillOnClear);
  var bad = adCycle(m, { execute: true }, undefined, null, false, adSpillOnClear);
  return clean.verdict === 'MANUAL_RECOVERY_REQUIRED'
    && clean.rollback.error === 'THE_ROW_CAME_BACK_BUT_THE_TABLE_FINGERPRINT_DID_NOT'
    && bad.verdict === 'ROLLED_BACK_VERIFIED' && bad.rollback.outcome === 'ROLLED_BACK_VERIFIED';
});

mut('N119 an unacknowledged write that never landed is reported as applied', function () {
  // The ACK_UNKNOWN hazard in one line: a removal reported as done that never happened, and a retryable
  // zero-write turned into a closed case.
  // S1-R4H-R1 — re-aimed: `retryable` is no longer set here, or anywhere else in this function.
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL',
    "        out.write_acknowledged = 'RESOLVED_BY_READBACK_AS_NOT_APPLIED';" + NL
    + "        out.verdict = 'NOT_APPLIED_ACK_UNKNOWN';",
    "        out.write_acknowledged = 'ASSUMED_APPLIED';" + NL
    + "        out.verdict = 'EXECUTED_OK_AFTER_ACK_UNKNOWN';");
  var clean = adCycle(null, { execute: true }, undefined, null, false,
    function (w) { adThrowOnClear(w, false); });
  var bad = adCycle(m, { execute: true }, undefined, null, false,
    function (w) { adThrowOnClear(w, false); });
  var cleanRowIntact = adSheet(clean.world)[1].filter(function (c) { return String(c) !== ''; }).length === 6;
  var badRowIntact = adSheet(bad.world)[1].filter(function (c) { return String(c) !== ''; }).length === 6;
  return clean.verdict === 'NOT_APPLIED_ACK_UNKNOWN' && clean.writes === 0
    && clean.removal_may_be_attempted_again === true && cleanRowIntact
    && bad.verdict === 'EXECUTED_OK_AFTER_ACK_UNKNOWN'
    && bad.removal_may_be_attempted_again === false && badRowIntact;
});

mut('N120 the classification is claimed to describe a row that two rows now answer to', function () {
  // MEASURED ON THE FIELD IT DESTROYS. Both runs STOP, because the uniqueness test is also a ledger
  // predicate — defence in depth working. What the mutant destroys is the ANSWER to whether the operator's
  // decision still names one row, which is the fact a person would read before re-issuing it.
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_MANIFEST',
    '    out.classification_applies = out.live_state_confirmed === true' + NL
    + '      && S1_str_(rec.fingerprint) === S1_str_(EXP.target_row_fingerprint) && occ === 1;',
    '    out.classification_applies = true;');
  var rows = [abLive(), abLive()];
  for (var i = 1; i <= 94; i++) rows.push(aaGood(i));
  var clean = adMan(adMutWorld(null, rows)), bad = adMan(adMutWorld(m, rows));
  return clean.verdict === 'STOP' && clean.classification_applies === false
    && bad.verdict === 'STOP' && bad.classification_applies === true;
});

mut('N121 a STOPped removal manifest keeps the sentence it was refused the right to write', function () {
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_MANIFEST',
    "    if (out.verdict !== 'READY_TO_AUTHORIZE_REMOVAL') {" + NL + '      out.frozen_before = null;',
    '    if (false) {' + NL + '      out.frozen_before = null;');
  var over = { pinOver: { table_combined_fingerprint: 'DEADBEEF' } };
  var clean = adMan(adMutWorld(null), over), bad = adMan(adMutWorld(m), over);
  return clean.verdict === 'STOP' && clean.authorization_wording === null
    && bad.verdict === 'STOP' && String(bad.authorization_wording).indexOf('I authorize') === 0;
});

mut('N122 an absent lock authority is reported as a lock that was taken', function () {
  // RE-AIMED ONCE, AND THE FIRST AIM IS WORTH RECORDING. Setting only `acquired` still refused, because
  // `authority_present` is a SEPARATE predicate - two guards over one fact, working. What actually opens the
  // door is claiming BOTH, which is what "the lock is optional here" looks like when it is written down.
  var m = swapS1In('S1_remAcquireLock_',
    "  if (typeof LockService === 'undefined') { o.reason = 'LOCK_AUTHORITY_UNAVAILABLE'; return o; }",
    "  if (typeof LockService === 'undefined') { o.authority_present = true; o.acquired = true; return o; }");
  var clean = adCycle(null, { execute: true }, undefined, null, true);
  var bad = adCycle(m, { execute: true }, undefined, null, true);
  return clean.verdict === 'REFUSED' && clean.world.allWrites() === 0
    && String(clean.refusal_reasons[0]).indexOf('LOCK_AUTHORITY_UNAVAILABLE') > 0
    && bad.verdict === 'EXECUTED_OK' && bad.world.allWrites() === 1;
});

mut('N123 the dry run skips the lock, so its all-clear is about a moment that has gone', function () {
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL',
    '    LK = S1_remAcquireLock_(Number(opts.lock_timeout_ms) > 0 ? Number(opts.lock_timeout_ms) : 30000);',
    '    LK = opts.execute === true' + NL
    + '      ? S1_remAcquireLock_(Number(opts.lock_timeout_ms) > 0 ? Number(opts.lock_timeout_ms) : 30000)' + NL
    + '      : { authority_present: true, acquired: true, lock: null, reason: null, timeout_ms: 0 };');
  var clean = adCycle(null, {}), bad = adCycle(m, {});
  return clean.verdict === 'DRY_RUN_OK' && adLock(clean.world).tries === 1
    && bad.verdict === 'DRY_RUN_OK' && adLock(bad.world).tries === 0;
});

mut('N124 the physical extent is expected to shrink, collapsing the two counts into one', function () {
  // THE HEADLINE OF THE ROUND, INVERTED. A logical record count and a physical row count are two different
  // numbers; expecting the sheet to shrink by one makes a CORRECT removal fail its own postcondition and be
  // undone.
  var m = swapS1In('RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_MANIFEST',
    '      physical_last_row: lastRow,' + NL
    + '      physical_rows_removed: 0, rows_added: 0, rows_reordered: false,',
    '      physical_last_row: R.integrity.row_count - 1,' + NL
    + '      physical_rows_removed: 1, rows_added: 0, rows_reordered: false,');
  var clean = adCycle(null, { execute: true }), bad = adCycle(m, { execute: true });
  return clean.verdict === 'EXECUTED_OK'
    && bad.verdict === 'ROLLED_BACK_VERIFIED'
    && bad.readback.mismatches.filter(function (x) {
      return x.what === 'physical_last_row'; }).length === 1;
});

// ---- S1-R4H-R1 — THE RETRY CONTRACT UNDER MUTATION. ----------------------------------------------
//
// The defect this round fixed was one wrong literal in one branch, and it survived R4H's whole suite
// because nothing asserted the contract as a CONTRACT — only that a particular verdict carried a
// particular flag. These five attack the table and the resolver directly.
var N_INV_ = 'an_attempt_that_reached_the_write_leaves_no_authorization_and_no_baseline_reusable';
/** Build a world on the given source, take the manifest, tamper the frozen AFTER, run. Forces the
 *  readback to fail so the rollback path is the one under test. */
function adRollbackCycle(src) {
  var w = adMutWorld(src);
  var man = adMan(w);
  var fz = JSON.parse(JSON.stringify(man.frozen_before));
  fz.expected_after.remaining_id_universe_fingerprint = 'DEADBEEF';
  var r = adRun(w, { execute: true, frozen: fz, authorization: man.authorization_wording });
  r.world = w;
  return r;
}

mut('N125 a proven zero-write after an unacknowledged clear is offered back as retryable', function () {
  // THE EXACT DEFECT R4H SHIPPED. Nothing was written, so the flag looks harmless — and the reader of
  // this field is a person holding the same frozen block and the same authorization sentence.
  var m = swapS1('  NOT_APPLIED_ACK_UNKNOWN: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],',
    '  NOT_APPLIED_ACK_UNKNOWN: [true, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],');
  var p = function (w) { adThrowOnClear(w, false); };
  var clean = adCycle(null, { execute: true }, undefined, null, false, p);
  var bad = adCycle(m, { execute: true }, undefined, null, false, p);
  return clean.verdict === 'NOT_APPLIED_ACK_UNKNOWN' && clean.retryable === false
    && clean.failed_predicates.indexOf(N_INV_) === -1 && clean.writes === 0
    && bad.verdict === 'NOT_APPLIED_ACK_UNKNOWN' && bad.retryable === true
    && bad.failed_predicates.indexOf(N_INV_) >= 0;
});

mut('N126 an unacknowledged run hands the same authorization and the same baseline back', function () {
  // The subtler half of the same mistake: `retryable` stays false and the two REUSE flags say yes, which
  // is the same instruction written in two words instead of one.
  var m = swapS1('  EXECUTED_OK_AFTER_ACK_UNKNOWN: [false, false, false, false, S1_REMOVAL_NEXT_DONE_],',
    '  EXECUTED_OK_AFTER_ACK_UNKNOWN: [false, true, true, false, S1_REMOVAL_NEXT_DONE_],');
  var p = function (w) { adThrowOnClear(w, true); };
  var clean = adCycle(null, { execute: true }, undefined, null, false, p);
  var bad = adCycle(m, { execute: true }, undefined, null, false, p);
  return clean.verdict === 'EXECUTED_OK_AFTER_ACK_UNKNOWN'
    && clean.same_authorization_reusable === false && clean.same_frozen_baseline_reusable === false
    && clean.failed_predicates.indexOf(N_INV_) === -1
    && bad.verdict === 'EXECUTED_OK_AFTER_ACK_UNKNOWN'
    && bad.same_authorization_reusable === true && bad.same_frozen_baseline_reusable === true
    && bad.failed_predicates.indexOf(N_INV_) >= 0;
});

mut('N127 automatic retry becomes something a table row can grant', function () {
  // It is a literal false on both returns of the resolver precisely so that no row of data can turn it
  // on. Wire it to the table and the one verdict that IS re-drivable by a person starts claiming a
  // machine may do it.
  var m = swapS1('    // one clear site, no loop, no recursion, and the caller is a person.' + NL
    + '    automatic_retry_allowed: false,',
    '    // one clear site, no loop, no recursion, and the caller is a person.' + NL
    + '    automatic_retry_allowed: row[0] === true,');
  var clean = adCycle(null, {}), bad = adCycle(m, {});
  return clean.verdict === 'DRY_RUN_OK' && clean.retryable === true
    && clean.automatic_retry_allowed === false && clean.predicates_failed === 0
    && bad.verdict === 'DRY_RUN_OK' && bad.automatic_retry_allowed === true
    && bad.failed_predicates.indexOf('no_verdict_of_this_tool_permits_an_automatic_retry') >= 0;
});

mut('N128 a verified rollback is treated as though the attempt had never happened', function () {
  // The table is back at its BEFORE fingerprint, so "nothing changed" is true of the TABLE. It is not
  // true of the authorization, which was issued against a state and spent by the attempt.
  var m = swapS1('  ROLLED_BACK_VERIFIED: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],',
    '  ROLLED_BACK_VERIFIED: [true, true, true, true, S1_REMOVAL_NEXT_MANIFEST_],');
  var clean = adRollbackCycle(null), bad = adRollbackCycle(m);
  return clean.verdict === 'ROLLED_BACK_VERIFIED' && clean.retryable === false
    && clean.same_frozen_baseline_reusable === false
    && clean.failed_predicates.indexOf(N_INV_) === -1
    && bad.verdict === 'ROLLED_BACK_VERIFIED' && bad.retryable === true
    && bad.failed_predicates.indexOf(N_INV_) >= 0;
});

mut('N129 the one outcome that forbids a second removal says one may be attempted again', function () {
  // MANUAL_RECOVERY_REQUIRED means the tool could not establish where it left the table. That is the
  // single case where "you may start again from a new manifest" is the wrong sentence.
  var m = swapS1('  MANUAL_RECOVERY_REQUIRED: [false, false, false, false, S1_REMOVAL_NEXT_MANUAL_]',
    '  MANUAL_RECOVERY_REQUIRED: [false, false, false, true, S1_REMOVAL_NEXT_MANUAL_]');
  var clean = adCycle(null, { execute: true }, undefined, null, false, adSpillOnClear);
  var bad = adCycle(m, { execute: true }, undefined, null, false, adSpillOnClear);
  return clean.verdict === 'MANUAL_RECOVERY_REQUIRED'
    && clean.removal_may_be_attempted_again === false && clean.retryable === false
    && bad.verdict === 'MANUAL_RECOVERY_REQUIRED'
    && bad.removal_may_be_attempted_again === true && bad.retryable === false;
});

// ---- S1-R4H-R2 — ONE MUTANT PER OUTCOME, EACH GIVEN A NEIGHBOUR'S next_action. -------------------
//
// Every one of these four is a real sentence that would be handed to a person holding a real table in
// a real state, and each is wrong in a different way: reopening a settled case, routing an unreadable
// state at the front door of the removal path, and twice declaring a case closed that is not.
var N_AGREE_ = 'the_next_action_and_the_permission_to_remove_again_agree';
var N_NOTBACK_ = 'a_completed_or_unrecoverable_outcome_is_not_sent_back_to_a_manifest';
var N_MANUAL_ = 'a_state_that_needs_a_person_says_so_rather_than_naming_a_tool_to_run';
var N_BACK_ = 'an_unresolved_or_not_applied_outcome_is_sent_back_to_a_new_manifest';

mut('N130 a removal the readback proved complete is sent back to the manifest', function () {
  // R4H-R1's own behaviour, now a regression. The natural continuation of a manifest is an execute,
  // so this hands somebody holding a FINISHED removal an instruction that leads to clearing the row.
  var m = swapS1('  EXECUTED_OK_AFTER_ACK_UNKNOWN: [false, false, false, false, S1_REMOVAL_NEXT_DONE_],',
    '  EXECUTED_OK_AFTER_ACK_UNKNOWN: [false, false, false, false, S1_REMOVAL_NEXT_MANIFEST_],');
  var p = function (w) { adThrowOnClear(w, true); };
  var clean = adCycle(null, { execute: true }, undefined, null, false, p);
  var bad = adCycle(m, { execute: true }, undefined, null, false, p);
  return clean.verdict === 'EXECUTED_OK_AFTER_ACK_UNKNOWN'
    && clean.next_action === 'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE'
    && clean.failed_predicates.indexOf(N_NOTBACK_) === -1
    && bad.verdict === 'EXECUTED_OK_AFTER_ACK_UNKNOWN'
    && bad.next_action === 'RERUN_MANIFEST_AND_REQUIRE_NEW_OPERATOR_AUTHORIZATION'
    && bad.failed_predicates.indexOf(N_NOTBACK_) >= 0
    && bad.failed_predicates.indexOf(N_AGREE_) >= 0;
});

mut('N131 a state nobody can read is routed at the front door of the removal path', function () {
  // A manifest ends in a freeze block and an authorization sentence. Sending MANUAL_RECOVERY_REQUIRED
  // there says the recovery is something this tool can drive, and it is precisely the case where it
  // cannot: the postcondition or the rollback could not be VERIFIED.
  var m = swapS1('  MANUAL_RECOVERY_REQUIRED: [false, false, false, false, S1_REMOVAL_NEXT_MANUAL_]',
    '  MANUAL_RECOVERY_REQUIRED: [false, false, false, false, S1_REMOVAL_NEXT_MANIFEST_]');
  var clean = adCycle(null, { execute: true }, undefined, null, false, adSpillOnClear);
  var bad = adCycle(m, { execute: true }, undefined, null, false, adSpillOnClear);
  return clean.verdict === 'MANUAL_RECOVERY_REQUIRED'
    && clean.next_action === 'STOP_AND_PERFORM_MANUAL_RECOVERY'
    && clean.removal_may_be_attempted_again === false
    && clean.failed_predicates.indexOf(N_MANUAL_) === -1
    && bad.verdict === 'MANUAL_RECOVERY_REQUIRED'
    && bad.next_action === 'RERUN_MANIFEST_AND_REQUIRE_NEW_OPERATOR_AUTHORIZATION'
    && bad.failed_predicates.indexOf(N_MANUAL_) >= 0
    && bad.failed_predicates.indexOf(N_NOTBACK_) >= 0;
});

mut('N132 a proven zero-write is told the removal is complete', function () {
  // Nothing was removed. Closing the case here loses the row the operator asked to have removed, and
  // loses it silently: the response reads exactly like a success.
  var m = swapS1('  NOT_APPLIED_ACK_UNKNOWN: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],',
    '  NOT_APPLIED_ACK_UNKNOWN: [false, false, false, true, S1_REMOVAL_NEXT_DONE_],');
  var p = function (w) { adThrowOnClear(w, false); };
  var clean = adCycle(null, { execute: true }, undefined, null, false, p);
  var bad = adCycle(m, { execute: true }, undefined, null, false, p);
  return clean.verdict === 'NOT_APPLIED_ACK_UNKNOWN'
    && clean.next_action === 'RERUN_MANIFEST_AND_REQUIRE_NEW_OPERATOR_AUTHORIZATION'
    && clean.failed_predicates.indexOf(N_BACK_) === -1
    && bad.verdict === 'NOT_APPLIED_ACK_UNKNOWN'
    && bad.next_action === 'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE'
    && bad.failed_predicates.indexOf(N_BACK_) >= 0
    && bad.failed_predicates.indexOf(N_AGREE_) >= 0;
});

mut('N133 a verified rollback is filed as a finished removal', function () {
  // The table came back to its BEFORE fingerprint — which means the row is STILL THERE. "Complete" is
  // the one word that must not be attached to it.
  var m = swapS1('  ROLLED_BACK_VERIFIED: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],',
    '  ROLLED_BACK_VERIFIED: [false, false, false, true, S1_REMOVAL_NEXT_DONE_],');
  var clean = adRollbackCycle(null), bad = adRollbackCycle(m);
  return clean.verdict === 'ROLLED_BACK_VERIFIED'
    && clean.next_action === 'RERUN_MANIFEST_AND_REQUIRE_NEW_OPERATOR_AUTHORIZATION'
    && clean.failed_predicates.indexOf(N_BACK_) === -1
    && bad.verdict === 'ROLLED_BACK_VERIFIED'
    && bad.next_action === 'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE'
    && bad.failed_predicates.indexOf(N_BACK_) >= 0
    && bad.failed_predicates.indexOf(N_AGREE_) >= 0;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
process.exit(fail ? 1 : 0);
