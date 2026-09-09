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
  factory_stock_movements: ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id',
    'movement_type', 'qty', 'related_entity_type', 'related_entity_id', 'note', 'created_by', 'created_at'],
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
  w.allWrites = function () {
    var n = 0;
    Object.keys(w.sheets).forEach(function (k) { n += (w.sheets[k].writes || 0); });
    return n;
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
['setValue', 'setValues', 'appendRow', 'deleteRow', 'insertSheet', 'deleteSheet', 'setFormula',
 'removeSheet', 'setName', 'LockService'].forEach(function (api, i) {
  ok(S1_BARE.indexOf(api) === -1,
    'A7.' + (i + 1) + ' the census source contains no ' + api + ' (comments and string literals stripped)');
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
ok(S1_BARE.indexOf('RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS') > 0
  && S1_BARE.indexOf('setValues') < 0 && S1_BARE.indexOf('appendRow') < 0,
  'S8g and the file carrying it still contains no write API at all');

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
ok(FB.identity_universe_count >= 1 && FB.identity_universe_fingerprint !== null,
  'M5e the whole identity universe, by count and fingerprint',
  [FB.identity_universe_count, FB.identity_universe_fingerprint]);
eq(FB.other_scope_identity_count, 0, 'M5f and how many identities belong to OTHER scopes');
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
  && M11f.res.frozen_before.identity_universe_fingerprint !== FB.identity_universe_fingerprint,
  'M11f an identity appearing in ANOTHER scope moves the universe fingerprint',
  [FB.identity_universe_fingerprint,
    M11f.res.frozen_before && M11f.res.frozen_before.identity_universe_fingerprint]);
eq(M11f.res.frozen_before.other_scope_identity_count, 1,
  'M11g and the other-scope count says how many identities are not this one');

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
eq(W5.res.frozen_before.identity_universe_fingerprint, W5base.identity_universe_fingerprint,
  'W5d the identity-universe fingerprint is blind to it, which is the defect this replaces');

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
  var m = swapS1("function S1_authWordingP_(cand, acceptedRun, scope, ws, ids, content) {\n"
    + "  if (!cand || !scope) return null;",
    "function S1_authWordingP_(cand, acceptedRun, scope, ws, ids, content) {\n"
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
  // Both still STOP and neither emits a chunk — the locks hold, which is the point of having three.
  // What the mutant loses is that a refused run has NOTHING to withhold: it now constructs a baseline
  // from a world it refused, and the next edit that weakens a lock has something to leak.
  return clean.res.verdict === 'STOP' && clean.res.frozen_before === null
    && bad.res.verdict === 'STOP' && bad.res.frozen_before !== null
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
  var m = swapS1("  var framing = '[S1] '.length + String(tag).length + '_99_of_99'.length + 1;",
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

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
process.exit(fail ? 1 : 0);
