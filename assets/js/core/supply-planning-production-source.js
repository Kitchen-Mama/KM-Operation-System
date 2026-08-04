// Kitchen Mama Operation System — PRODUCTION Recommendation Source Wiring (Phase 2C, Round 1S-P2).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC read-only glue that binds the existing Canonical Operation System Database Sheets to the
// frozen recommendation read path — WITHOUT any persistence write:
//   canonical Sheets (injected spreadsheet) → readCanonicalSnapshots (raw, value-preserving) → the frozen
//   Projection Runtime (KMSP) → the frozen Production Source Reader (KMSRP) → Reader (KMSR) → Integration (KMSI)
//     → Ledger → Allocation → Weekly/Monthly Resolver → Plan Builder Bridge → Plan Builder (read-only).
//
// It owns ONLY: (1) the canonical Sheet-name registry, (2) an INJECT-testable raw canonical-table reader (the
// `.gs` passes SpreadsheetApp.getActiveSpreadsheet(); tests pass a fake — NO global SpreadsheetApp reference here),
// (3) the orchestrator computeFacts shape + a read-only RecommendationPlan result. It owns NO Calculation / Ledger
// / Allocation / lifecycle / recommendation formula (all reused from the bundled pure modules) and NEVER writes:
// no setValues / setValue / appendRow / insertRow(s) / deleteRow(s) / clear / LockService / CacheService /
// PersistencePlan execution / repository upsert / draft mutation. No Date.now / Math.random / locale; input never
// mutated; fresh output. NO physical recommendation_source_* Sheets are read (the DTO snapshots are in-memory only).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-source-projection.js') : (root.KMSP || (root.KM && root.KM.sourceProjection)),
    req ? req('./supply-planning-plan-builder.js') : (root.KMPB || (root.KM && root.KM.planBuilder))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.productionSource = api; }
})(this, function (KMSP, KMPB) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }

  // ---- canonical Sheet-name registry (real Operation DB tables; overridable via config.sheetNames) ----------
  // key = the KMSP.sourceSnapshots key; sheet = the canonical DB Sheet name; required = whether the recommendation
  // read is blocked when absent (the Projection Runtime itself is the fail-closed authority on required rows).
  var CANONICAL_TABLES = [
    { key: 'skuDetails', sheet: 'sku_details', required: false },
    { key: 'marketplaceSkus', sheet: 'marketplace_skus', required: false },
    { key: 'warehouses', sheet: 'warehouses', required: false },
    { key: 'marketplaces', sheet: 'marketplaces', required: false },
    { key: 'fcRegularForecast', sheet: 'fc_regular_forecast', required: false },
    { key: 'fcSpecialEvents', sheet: 'fc_special_events', required: false },
    { key: 'amazonInventorySnapshot', sheet: 'amazon_inventory_snapshot', required: false },
    { key: 'overseasInventorySnapshot', sheet: 'overseas_inventory_snapshot', required: false },
    { key: 'factoryStock', sheet: 'factory_stock', required: false },
    { key: 'shippingPlans', sheet: 'shipping_plans', required: false },
    { key: 'shipments', sheet: 'shipments', required: false }
  ];

  function tablesFor(config) {
    var over = (config && config.sheetNames) || {};
    return CANONICAL_TABLES.map(function (e) { var c = { key: e.key, sheet: over[e.key] ? str(over[e.key]) : e.sheet, required: e.required }; return c; });
  }

  // ---- INJECT-testable raw canonical-table reader (the `.gs` passes SpreadsheetApp; tests pass a fake) --------
  // `spreadsheet` = any object exposing getSheetByName(name) → sheet | null; sheet exposes getLastRow() and
  // getDataRange().getValues() (2D). READ-ONLY; value-preserving (numbers/Date/blank kept verbatim). Never writes.
  function readCanonicalSnapshots(spreadsheet, config) {
    aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'readCanonicalSnapshots: spreadsheet.getSheetByName required');
    var entries = tablesFor(config);
    var snapshots = {};
    var issues = [];
    entries.forEach(function (e) {
      var sheet = spreadsheet.getSheetByName(e.sheet);
      if (!sheet) { issues.push({ sourceType: e.key, sheetName: e.sheet, reason: 'SOURCE_NOT_AVAILABLE' }); return; }
      var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : null;
      if (lastRow === 0) { issues.push({ sourceType: e.key, sheetName: e.sheet, reason: 'MISSING_SNAPSHOT' }); return; }
      var values = sheet.getDataRange().getValues();
      if (!values || !values.length) { issues.push({ sourceType: e.key, sheetName: e.sheet, reason: 'MISSING_SNAPSHOT' }); return; }
      var headers = values[0].map(function (h) { return str(h); });
      var rows = [];
      for (var r = 1; r < values.length; r++) rows.push(values[r].slice());        // preserve raw cell values verbatim
      snapshots[e.key] = { headers: headers, rows: rows };
    });
    return { snapshots: snapshots, issues: issues };
  }

  // Merge the caller/orchestrator-owned Projection inputs with the read canonical snapshots (no fact invention).
  function projectionInput(request, snapshots) {
    return {
      recommendationType: request.recommendationType, planningCycle: request.planningCycle,
      businessScope: request.businessScope, sourceSnapshots: snapshots,
      planningFacts: request.planningFacts, receiverFacts: request.receiverFacts,
      factoryDemandFacts: request.factoryDemandFacts, routing: request.routing,
      requiredByDate: request.requiredByDate, forecastMonth: request.forecastMonth,
      formulaVersion: request.formulaVersion, sourceDataAsOf: request.sourceDataAsOf
    };
  }

  // ---- orchestrator computeFacts seam (replaces SOURCE_READER_PENDING; read-only) -------------------------
  // Returns EXACTLY the shape the frozen Orchestrator's deps.computeFacts contract expects:
  //   { lines, ready, reason, formulaVersion, sourceDataAsOf, sourceIssues }
  function resolveProductionFacts(spreadsheet, request) {
    aType(isObj(request), 'resolveProductionFacts: request required');
    var read = readCanonicalSnapshots(spreadsheet, request.config);
    var full = KMSP.projectAndRead(projectionInput(request, read.snapshots));
    var projIssues = (full.projection && full.projection.issues) || [];
    var srcIssues = (full.sourceIssues || []).concat(read.issues).concat(projIssues);
    if (full.ready === false) {
      return { lines: [], ready: false, reason: full.reason, formulaVersion: request.formulaVersion,
        sourceDataAsOf: (full.projection && full.projection.sourceDataAsOf) || request.sourceDataAsOf, sourceIssues: srcIssues };
    }
    return { lines: full.lines || [], ready: full.ready !== false, reason: full.reason,
      formulaVersion: full.formulaVersion, sourceDataAsOf: full.sourceDataAsOf, sourceIssues: srcIssues };
  }

  // ---- read-only RecommendationPlan result (NO persistence; NO draft; NO write) ---------------------------
  function buildProductionRecommendationSource(spreadsheet, request) {
    aType(isObj(request), 'buildProductionRecommendationSource: request required');
    var read = readCanonicalSnapshots(spreadsheet, request.config);
    var full = KMSP.projectAndRead(projectionInput(request, read.snapshots));
    var proj = full.projection || {};
    var srcIssues = (full.sourceIssues || []).concat(read.issues).concat(proj.issues || []);
    var ready = full.ready !== false && !!full.bridgeResult;
    var recommendationPlan = ready ? KMPB.buildRecommendation(full.bridgeResult) : null;
    return {
      ready: ready, status: ready ? 'READY' : 'BLOCKED', reason: full.reason || null,
      recommendationType: request.recommendationType, planningCycle: request.planningCycle,
      businessScope: request.businessScope,
      recommendationPlan: recommendationPlan,
      lines: (full.bridgeResult && full.bridgeResult.lines) || [],
      issues: srcIssues,
      sourceDataAsOf: full.sourceDataAsOf !== undefined ? full.sourceDataAsOf : (proj.sourceDataAsOf || null),
      formulaVersion: full.formulaVersion !== undefined ? full.formulaVersion : (request.formulaVersion || null),
      lineage: { origin: 'PRODUCTION_SOURCE_READ_ONLY', demandCount: (proj.demandSourceEntries || []).length, supplyCount: (proj.supplySourceEntries || []).length },
      persistenceStatus: 'NOT_EXECUTED'
    };
  }

  return {
    CANONICAL_TABLES: CANONICAL_TABLES.map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; return c; }),
    tablesFor: tablesFor,
    readCanonicalSnapshots: readCanonicalSnapshots,
    resolveProductionFacts: resolveProductionFacts,
    buildProductionRecommendationSource: buildProductionRecommendationSource
  };
});
