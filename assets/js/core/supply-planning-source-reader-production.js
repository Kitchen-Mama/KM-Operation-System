// Kitchen Mama Operation System — PRODUCTION Recommendation Source Reader boundary (Phase 2C, Round 1S-P1).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC production read-only boundary that turns raw Google-Sheet table snapshots into the
// Recommendation Source Facts DTO, by REUSING the frozen pipeline (never reimplementing it):
//   raw table snapshot (headers+rows) → structural header/schema validation → row-objects (value-preserving)
//     → the Round 1P Source Reader (KMSR) → the Round 1Q Source Integration (KMSI: ledgers → resolveDemandKeys
//       → projectAllocationInputs → Weekly/Monthly resolver → bridge).
//
// This module owns ONLY structural facts: a read-only source-table registry, an INJECT-testable Sheet reader
// (`readRawTableSnapshot(spreadsheet, entry)` — the `.gs` passes SpreadsheetApp, tests pass a fake), header/
// schema validation (fail-closed), value-preserving raw-row → object mapping, and the DTO assembly that hands
// the row collections to the frozen reader/integration. It owns NO business logic (× Gap / Forecast /
// survivalNeedQty / allocationPriority / demandWeight / recommendedQty / Net Order Need / carton / demand
// assembly / lifecycle derivation) and never writes. No SpreadsheetApp / LockService / CacheService here (the
// `.gs` wrapper injects the spreadsheet); no Date.now / Math.random / locale; input never mutated; fresh output.
//
// SCOPE NOTE (Round 1R contract SC-5/SC-9): this reads the Recommendation SOURCE INPUT sheets whose columns are
// the frozen reader DTO convention. The UPSTREAM projection that SHAPES raw DB tables (fc_regular_forecast
// jan..dec, inventory snapshots, calc-engine gap/net-order-need) INTO those source sheets is the separate
// `Recommendation Source Projection Runtime` (SC-9 #1) — deliberately NOT implemented here (forbidden business
// logic). Registry `sheetName`s are convention (overridable via config), grounded in real names where they exist.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-source-reader.js') : (root.KMSR || (root.KM && root.KM.sourceReader)),
    req ? req('./supply-planning-recommendation-source-integration.js') : (root.KMSI || (root.KM && root.KM.recommendationSourceIntegration))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceReaderProduction = api; }
})(this, function (KMSR, KMSI) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }

  // ---- READ-ONLY source-table registry (STRUCTURAL facts only; no business formula) --------------------
  // sourceType: logical role the reader/integration consumes. sheetName: convention (overridable via config).
  // required/optional/identity Headers: structural schema. asOfHeader: source-supported as-of evidence column
  // (never the clock). applicability: WEEKLY | MONTHLY | BOTH. required: whole-run vs optional source.
  var REGISTRY = [
    // identity / master (real canonical sheet names; feed resolveSourceIdentity structurally)
    { sourceType: 'skuDetails', role: 'identity', sheetName: 'sku_details', requiredHeaders: ['sku'], optionalHeaders: ['category', 'series', 'units_per_carton'], identityHeaders: ['sku'], asOfHeader: 'updated_at', applicability: 'BOTH', required: false },
    { sourceType: 'marketplaceSkus', role: 'identity', sheetName: 'marketplace_skus', requiredHeaders: ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace'], optionalHeaders: ['site_sku', 'fulfillment_model'], identityHeaders: ['marketplace_sku_id'], asOfHeader: 'updated_at', applicability: 'BOTH', required: false },
    { sourceType: 'warehouses', role: 'identity', sheetName: 'warehouses', requiredHeaders: ['warehouse_id'], optionalHeaders: ['warehouse_type', 'is_factory_warehouse', 'is_active', 'company', 'country'], identityHeaders: ['warehouse_id'], asOfHeader: 'updated_at', applicability: 'BOTH', required: false },
    // recommendation source input sheets (DTO-convention columns; populated by the deferred Projection Runtime)
    { sourceType: 'demand', role: 'demand', sheetName: 'recommendation_source_demand', requiredHeaders: ['demand_type', 'source_ref', 'quantity'], optionalHeaders: ['required_by_date', 'sku', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'planning_cycle', 'event_id'], identityHeaders: ['source_ref'], asOfHeader: 'source_data_as_of', applicability: 'BOTH', required: true },
    { sourceType: 'supply', role: 'supply', sheetName: 'recommendation_source_supply', requiredHeaders: ['pool_type', 'warehouse_id', 'quantity'], optionalHeaders: ['supply_lineage_ref', 'sku', 'company', 'lifecycle_bucket'], identityHeaders: ['supply_lineage_ref'], asOfHeader: 'source_data_as_of', applicability: 'BOTH', required: true },
    { sourceType: 'receivers', role: 'receivers', sheetName: 'recommendation_source_receivers', requiredHeaders: ['receiver_key', 'demand_source_ref'], optionalHeaders: ['eligible_pool_types', 'survival_need_qty', 'daily_demand', 'allocation_priority', 'demand_weight', 'fulfillment_model', 'marketplace', 'destination_warehouse_id'], identityHeaders: ['receiver_key'], asOfHeader: 'source_data_as_of', applicability: 'WEEKLY', required: false },
    { sourceType: 'factoryDemands', role: 'factoryDemands', sheetName: 'recommendation_source_factory_demands', requiredHeaders: ['demand_source_ref'], optionalHeaders: ['eligible_factory_warehouse_ids', 'allocation_priority', 'marketplace', 'destination_warehouse_id', 'required_by_date'], identityHeaders: ['demand_source_ref'], asOfHeader: 'source_data_as_of', applicability: 'MONTHLY', required: false },
    { sourceType: 'planningFacts', role: 'planningFacts', sheetName: 'recommendation_source_planning_facts', requiredHeaders: ['recommendation_type', 'demand_source_ref'], optionalHeaders: ['sku', 'site_sku', 'window_code', 'request_month', 'request_bucket', 'calculated_gap_qty', 'net_order_need_snapshot', 'units_per_carton', 'company', 'country', 'marketplace', 'formula_version', 'source_data_as_of'], identityHeaders: ['demand_source_ref'], asOfHeader: 'source_data_as_of', applicability: 'BOTH', required: true }
  ];

  function registryFor(recommendationType, config) {
    var over = (config && config.sheetNames) || {};
    var applies = recommendationType === 'WEEKLY_SHIPPING' ? 'WEEKLY' : (recommendationType === 'MONTHLY_ORDER' ? 'MONTHLY' : null);
    aRange(applies !== null, 'source-reader-production: unsupported recommendationType: ' + recommendationType);
    return REGISTRY.filter(function (e) { return e.applicability === 'BOTH' || e.applicability === applies; })
      .map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; if (over[e.sourceType]) c.sheetName = str(over[e.sourceType]); return c; });
  }

  // ---- INJECT-testable raw Sheet reader (the `.gs` wrapper passes SpreadsheetApp; tests pass a fake) ------
  // `spreadsheet` = any object exposing getSheetByName(name) → sheet | null; sheet exposes getLastRow(),
  // getLastColumn(), getDataRange().getValues() (2D). READ-ONLY. Never writes. Returns a JSON-safe snapshot.
  function readRawTableSnapshot(spreadsheet, entry) {
    aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'readRawTableSnapshot: spreadsheet.getSheetByName required');
    aType(isObj(entry) && nonEmpty(entry.sheetName), 'readRawTableSnapshot: entry.sheetName required');
    var out = { sourceType: entry.sourceType, sheetName: entry.sheetName, headers: [], rows: [], rowCount: 0, sourceDataAsOfEvidence: null, found: false, issues: [] };
    var sheet = spreadsheet.getSheetByName(entry.sheetName);
    if (!sheet) { out.issues.push('SOURCE_NOT_AVAILABLE'); return out; }
    out.found = true;
    var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : null;
    if (lastRow === 0) { out.issues.push('MISSING_SNAPSHOT'); return out; }        // empty sheet (no header row)
    var values = sheet.getDataRange().getValues();                                 // raw values (numbers/Date/bool preserved)
    if (!values || !values.length) { out.issues.push('MISSING_SNAPSHOT'); return out; }
    out.headers = values[0].map(function (h) { return str(h); });
    for (var r = 1; r < values.length; r++) out.rows.push(values[r].slice());       // preserve raw cell values verbatim
    out.rowCount = out.rows.length;
    // as-of evidence: read the registry as-of column's first non-empty value (never the clock).
    if (entry.asOfHeader) {
      var ai = out.headers.indexOf(entry.asOfHeader);
      if (ai >= 0) { for (var i = 0; i < out.rows.length; i++) { if (nonEmpty(out.rows[i][ai])) { out.sourceDataAsOfEvidence = str(out.rows[i][ai]); break; } } }
    }
    return out;
  }

  // Read every registry table for a recommendationType (read-only). Returns a snapshots-by-sourceType map.
  function readAllSnapshots(spreadsheet, recommendationType, config) {
    var entries = registryFor(recommendationType, config);
    var snapshots = {};
    entries.forEach(function (e) { snapshots[e.sourceType] = readRawTableSnapshot(spreadsheet, e); });
    return snapshots;
  }

  // ---- structural header/schema validation (fail-closed; deterministic issue tokens) ---------------------
  function validateSnapshot(snapshot, entry) {
    var issues = [];
    if (!snapshot || snapshot.found === false) { issues.push({ sourceType: entry.sourceType, reason: 'SOURCE_NOT_AVAILABLE' }); return issues; }
    var headers = snapshot.headers || [];
    if (!headers.length) { issues.push({ sourceType: entry.sourceType, reason: 'MISSING_REQUIRED_HEADER' }); return issues; }
    var seen = {};
    headers.forEach(function (h) { if (h === '') issues.push({ sourceType: entry.sourceType, reason: 'MISSING_REQUIRED_HEADER:blank' }); else if (seen[h]) issues.push({ sourceType: entry.sourceType, reason: 'DUPLICATE_HEADER:' + h }); else seen[h] = 1; });
    (entry.requiredHeaders || []).forEach(function (h) { if (!seen[h]) issues.push({ sourceType: entry.sourceType, reason: 'MISSING_REQUIRED_HEADER:' + h }); });
    (snapshot.rows || []).forEach(function (row, i) { if (row.length !== headers.length) issues.push({ sourceType: entry.sourceType, reason: 'INVALID_ROW_WIDTH:@' + i }); });
    return issues;
  }

  // ---- build the Recommendation Source Facts DTO by REUSING KMSR + KMSI ---------------------------------
  // input = { recommendationType, planningCycle, businessScope, snapshots:{sourceType→snapshot}, formulaVersion?,
  //           sourceDataAsOf?, config? }. Structural validation fails closed; the row collections are handed to
  //           the frozen reader/integration (which own ALL mapping + math). No business logic here.
  function buildRecommendationSourceFacts(input) {
    aType(isObj(input), 'buildRecommendationSourceFacts: input must be an object');
    aType(nonEmpty(input.planningCycle), 'buildRecommendationSourceFacts: planningCycle required');
    aType(isObj(input.businessScope), 'buildRecommendationSourceFacts: businessScope required');
    var type = str(input.recommendationType);
    var entries = registryFor(type, input.config);
    var snapshots = isObj(input.snapshots) ? input.snapshots : {};

    var schemaIssues = [];
    entries.forEach(function (e) {
      var snap = snapshots[e.sourceType];
      if (e.required && (!snap || snap.found === false)) { schemaIssues.push({ sourceType: e.sourceType, reason: 'SOURCE_NOT_AVAILABLE' }); return; }
      if (snap && snap.found !== false) validateSnapshot(snap, e).forEach(function (x) { schemaIssues.push(x); });
    });

    // 2D passthrough (the frozen reader's normalizeRows accepts [headers, ...rows]); value-preserving.
    function sheet2D(sourceType) { var s = snapshots[sourceType]; return (s && s.found !== false && s.headers.length) ? [s.headers.slice()].concat(s.rows.map(function (r) { return r.slice(); })) : []; }

    // as-of authority = caller-supplied OR the demand/planning-fact snapshot evidence (never the clock).
    var asOf = input.sourceDataAsOf !== undefined ? input.sourceDataAsOf
      : ((snapshots.demand && snapshots.demand.sourceDataAsOfEvidence) || (snapshots.planningFacts && snapshots.planningFacts.sourceDataAsOfEvidence) || null);

    var sourceInput = {
      recommendationType: type, planningCycle: str(input.planningCycle), scope: input.businessScope,
      formulaVersion: input.formulaVersion === undefined ? null : input.formulaVersion, sourceDataAsOf: asOf,
      identityTables: { skuDetails: sheet2D('skuDetails'), marketplaceSkus: sheet2D('marketplaceSkus'), warehouses: sheet2D('warehouses') },
      sheets: {
        demand: sheet2D('demand'), supply: sheet2D('supply'), planningFacts: sheet2D('planningFacts')
      }
    };
    if (type === 'WEEKLY_SHIPPING') sourceInput.sheets.receivers = sheet2D('receivers');
    if (type === 'MONTHLY_ORDER') sourceInput.sheets.factoryDemands = sheet2D('factoryDemands');
    // only pass identityTables when at least one identity sheet is present (else the reader keeps scope identity)
    if (!sourceInput.identityTables.skuDetails.length && !sourceInput.identityTables.marketplaceSkus.length && !sourceInput.identityTables.warehouses.length) delete sourceInput.identityTables;

    // Structural schema failure on a REQUIRED source → fail closed (do not run the pipeline on a broken schema).
    var hardSchema = schemaIssues.filter(function (x) {
      var e = entries.filter(function (z) { return z.sourceType === x.sourceType; })[0];
      return e && e.required;
    });
    if (hardSchema.length) {
      return { recommendationType: type, planningCycle: str(input.planningCycle), businessScope: input.businessScope,
        formulaVersion: sourceInput.formulaVersion, sourceDataAsOf: asOf, ready: false, reason: hardSchema[0].reason,
        schemaIssues: schemaIssues, sourceIssues: [], lines: [], bridgeResult: null, resolverResult: null,
        ledgerResult: null, allocationInput: null };
    }

    // Hand off to the frozen integration (KMSI) — it owns reader → ledgers → allocation → resolver → bridge.
    var full = KMSI.resolveRecommendationFactsFromSource(sourceInput, { mode: 'SCHEDULED_REFRESH', recommendationType: type });
    var out = {};
    for (var k in full) out[k] = full[k];
    out.schemaIssues = schemaIssues;                 // structural (non-fatal) schema notes surfaced, never dropped
    return out;
  }

  // Full production entry (the `.gs` wrapper calls this with SpreadsheetApp). READ-ONLY end-to-end.
  function readRecommendationSourceFacts(spreadsheet, cmd, config) {
    aType(isObj(cmd), 'readRecommendationSourceFacts: cmd required');
    var snapshots = readAllSnapshots(spreadsheet, str(cmd.recommendationType), config);
    return buildRecommendationSourceFacts({
      recommendationType: cmd.recommendationType, planningCycle: cmd.planningCycle, businessScope: cmd.businessScope,
      snapshots: snapshots, formulaVersion: cmd.formulaVersion, sourceDataAsOf: cmd.sourceDataAsOf, config: config
    });
  }

  return {
    SOURCE_TABLE_REGISTRY: REGISTRY.map(function (e) { var c = {}; for (var k in e) c[k] = Array.isArray(e[k]) ? e[k].slice() : e[k]; return c; }),
    registryFor: registryFor,
    readRawTableSnapshot: readRawTableSnapshot,
    readAllSnapshots: readAllSnapshots,
    validateSnapshot: validateSnapshot,
    buildRecommendationSourceFacts: buildRecommendationSourceFacts,
    readRecommendationSourceFacts: readRecommendationSourceFacts
  };
});
