// Kitchen Mama Operation System — PRODUCTION Recommendation Source Projection Runtime (Phase 2C, Round 1S-P1.5B).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC in-memory projection that SHAPES snapshots of the existing Canonical Operation System DB
// tables into the exact Recommendation Source DTO snapshots consumed by the frozen Round 1S-P1 Production Source
// Reader (KMSRP) → Round 1P Reader (KMSR) → Round 1Q Integration (KMSI) → Ledger → Allocation → Weekly/Monthly
// Resolver → Plan Builder Bridge → Plan Builder. It ASSEMBLES facts; it NEVER duplicates a Calculation / Ledger /
// Allocation formula, never writes, never touches SpreadsheetApp/DB/Cache/LockService, and never invents a value.
//
// It implements ONLY the frozen Production Source Projection Contract (RECOMMENDATION_SOURCE_CONTRACT_SPEC.md
// SC-10/SC-11): Option C in-memory projection; NO persisted recommendation_source_* Sheets are created — the
// convention-named DTO snapshots exist ONLY in memory, tagged origin PROJECTION_RUNTIME. Frozen decisions honored:
//   D-1 FACTORY supply company = FACTORY_SHARED sentinel (shared cross-company pool; never per-receiver, never
//       scope.company, never warehouses.company).
//   D-2 Factory source-as-of = factory_stock.last_transaction_at → updated_at → SOURCE_AS_OF_MISSING.
//   D-3 destinationWarehouseId = caller/planning-scope-owned (explicit routing → else MISSING_DESTINATION_WAREHOUSE;
//       never inferred from country/marketplace/code/first-match/display/prev-shipment/array-order/default-FC).
//   D-4 (F1-3b) shipping_plans + shipments lifecycle classification is DELEGATED to the canonical bridge
//       KMSF.projectSupplyLifecycle (§2E evaluateQualifiedIncoming ten-gate + §39.5 lifecycle + buildSupplyLedger);
//       this runtime keeps NO second status/lifecycle authority. Canonical `approved` plan vocabulary + B4-R3
//       shipment lineage (shipment:<id>:<lineId>). CURRENT_STOCK stays direct from inventory authority; Delivered /
//       Received / COMMITTED_PRODUCTION require their own canonical authorities (routeEvents / receivingFacts /
//       committedProduction — separate slices, not wired here). Unknown/omitted/transferred → structured issues.
// No Date.now / Math.random / locale; input never mutated; fresh output. The planning facts with no canonical
// stored column (survivalNeedQty / dailyDemand / demandWeight / eligiblePoolTypes / eligibleFactoryWarehouseIds /
// windowCode / requestMonth / requestBucket / calculatedGap / netOrderNeed) are CALLER-OWNED (frozen contract) —
// the projection ROUTES them, it does not compute them. `unitsPerCarton`/`allocationPriority`/`fulfillmentModel`
// are joined from canonical identity (sku_details / marketplaces / marketplace_skus) when not explicitly supplied.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-source-reader-production.js') : (root.KMSRP || (root.KM && root.KM.sourceReaderProduction)),
    req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceProjection = api; }
})(this, function (KMSRP, KMSF) {
  'use strict';

  // ---- primitives (fail-closed; no coercion of MISSING to a default) --------------------------------------
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  var ORIGIN = 'PROJECTION_RUNTIME';
  var FACTORY_SHARED = 'FACTORY_SHARED';                 // D-1 canonical shared-pool company sentinel
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // F1-3b: this runtime NO LONGER owns any shipping_plans / shipments status→lifecycle-bucket authority. Incoming
  // supply (shipping_plans + shipments) is classified ONLY by the canonical bridge KMSF.projectSupplyLifecycle
  // (§2E evaluateQualifiedIncoming → §39.5 lifecycle → buildSupplyLedger). Current Stock stays direct (inventory
  // authority) below. See projectRecommendationProductionSources' lifecycle section.

  // Strict real-calendar YYYY-MM-DD guard (mirrors the §2F contract; no Date constructor / clock / locale) — used
  // only to fail-closed BEFORE the canonical Qualified-Incoming shipment gate (which requires a strict Required-By).
  function isStrictDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v)); if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1) return false;
    var dim = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= dim[mo - 1];
  }

  // ---- canonical snapshot normalization (accept 2D getValues OR row-objects; value-preserving) ------------
  function normalizeCanonical(snapshot, where) {
    if (snapshot === undefined || snapshot === null) return [];
    if (isObj(snapshot) && Array.isArray(snapshot.rows) && Array.isArray(snapshot.headers)) {
      // {headers, rows} snapshot form → row-objects
      var hs = snapshot.headers.map(function (h) { return str(h); });
      return snapshot.rows.map(function (r, i) {
        aType(Array.isArray(r), where + '.rows[' + i + '] must be an array');
        var o = {}; for (var c = 0; c < hs.length; c++) if (hs[c] !== '') o[hs[c]] = r[c]; return o;
      });
    }
    aType(Array.isArray(snapshot), where + ' must be an array (2D values or row objects) or a {headers,rows} snapshot');
    if (snapshot.length === 0) return [];
    if (Array.isArray(snapshot[0])) {
      var header = snapshot[0].map(function (h) { return str(h); });
      var out = [];
      for (var rr = 1; rr < snapshot.length; rr++) {
        aType(Array.isArray(snapshot[rr]), where + '[' + rr + '] must be an array row');
        var ro = {}; for (var cc = 0; cc < header.length; cc++) if (header[cc] !== '') ro[header[cc]] = snapshot[rr][cc];
        out.push(ro);
      }
      return out;
    }
    return snapshot.map(function (o, i) { aType(isObj(o), where + '[' + i + '] must be a row object'); var n = {}; for (var k in o) if (has(o, k)) n[k] = o[k]; return n; });
  }

  // Build an in-memory DTO snapshot (matching KMSRP.readRawTableSnapshot output shape) from row-objects + a fixed
  // convention header list. Rows are aligned to headers (value-preserving; MISSING stays undefined, never 0).
  function toSnapshot(sourceType, rowObjs, headers, asOfEvidence) {
    var rows = rowObjs.map(function (o) { return headers.map(function (h) { return has(o, h) ? o[h] : ''; }); });
    return { sourceType: sourceType, sheetName: sourceType, headers: headers.slice(), rows: rows, rowCount: rows.length,
      sourceDataAsOfEvidence: asOfEvidence === undefined ? null : asOfEvidence, found: true, origin: ORIGIN, issues: [] };
  }

  // ---- identity + join helpers (reuse canonical identity semantics; never first-row for business identity) --
  function indexBy(rows, key) { var m = {}; rows.forEach(function (r) { var k = str(r[key]); if (k) m[k] = r; }); return m; }

  // ---- as-of helpers ------------------------------------------------------------------------------------
  function maxAsOf(list) { var best = null; list.forEach(function (v) { if (nonEmpty(v) && (best === null || cmpStr(str(v), best) > 0)) best = str(v); }); return best; }

  // ==========================================================================================================
  // PUBLIC: projectRecommendationProductionSources(input)
  //   input = { recommendationType, planningCycle, businessScope, sourceSnapshots,
  //             planningFacts?, receiverFacts?, factoryDemandFacts?, routing?, requiredByDate?, forecastMonth?,
  //             formulaVersion?, sourceDataAsOf? }
  //   sourceSnapshots (canonical DB tables; each a 2D getValues OR row-objects OR {headers,rows}):
  //     identity: skuDetails, marketplaceSkus, warehouses, marketplaces
  //     demand:   fcRegularForecast, fcSpecialEvents
  //     supply:   amazonInventorySnapshot, overseasInventorySnapshot, factoryStock
  //     lifecycle:shippingPlans, shipments
  // ==========================================================================================================
  function projectRecommendationProductionSources(input) {
    aType(isObj(input), 'projectRecommendationProductionSources: input must be an object');
    aType(isObj(input.businessScope), 'projectRecommendationProductionSources: businessScope required');
    aType(nonEmpty(input.planningCycle), 'projectRecommendationProductionSources: planningCycle required');
    var type = str(input.recommendationType);
    aType(type === 'WEEKLY_SHIPPING' || type === 'MONTHLY_ORDER', 'projectRecommendationProductionSources: recommendationType must be WEEKLY_SHIPPING | MONTHLY_ORDER');
    var snaps = isObj(input.sourceSnapshots) ? input.sourceSnapshots : {};
    var scope = input.businessScope;
    var issues = [];
    function addIssue(domain, ref, reason) { issues.push({ domain: domain, ref: ref === undefined ? null : ref, reason: reason }); }

    // ---- normalize canonical inputs (structural; fail-closed on malformed shapes) --------------------------
    var skuRows = normalizeCanonical(snaps.skuDetails, 'sourceSnapshots.skuDetails');
    var mskRows = normalizeCanonical(snaps.marketplaceSkus, 'sourceSnapshots.marketplaceSkus');
    var whRows = normalizeCanonical(snaps.warehouses, 'sourceSnapshots.warehouses');
    var mktRows = normalizeCanonical(snaps.marketplaces, 'sourceSnapshots.marketplaces');
    var fcReg = normalizeCanonical(snaps.fcRegularForecast, 'sourceSnapshots.fcRegularForecast');
    var fcEvt = normalizeCanonical(snaps.fcSpecialEvents, 'sourceSnapshots.fcSpecialEvents');
    var fba = normalizeCanonical(snaps.amazonInventorySnapshot, 'sourceSnapshots.amazonInventorySnapshot');
    var ovs = normalizeCanonical(snaps.overseasInventorySnapshot, 'sourceSnapshots.overseasInventorySnapshot');
    var fac = normalizeCanonical(snaps.factoryStock, 'sourceSnapshots.factoryStock');
    var plans = normalizeCanonical(snaps.shippingPlans, 'sourceSnapshots.shippingPlans');
    var ships = normalizeCanonical(snaps.shipments, 'sourceSnapshots.shipments');

    var whById = indexBy(whRows, 'warehouse_id');
    var upcBySku = {}; skuRows.forEach(function (r) { if (nonEmpty(r.sku) && has(r, 'units_per_carton')) upcBySku[str(r.sku)] = r.units_per_carton; });
    var priorityByMkt = {}; mktRows.forEach(function (r) { var k = str(r.marketplace) || str(r.marketplace_id); if (k && has(r, 'allocation_priority')) priorityByMkt[k] = r.allocation_priority; });
    var ffByMskKey = {}; mskRows.forEach(function (r) { var k = [str(r.company), str(r.country), str(r.marketplace), str(r.sku)].join('|'); if (has(r, 'fulfillment_model')) ffByMskKey[k] = r.fulfillment_model; });

    // ---- destination ownership (D-3): caller/planning-scope-owned; never inferred ---------------------------
    var routing = isObj(input.routing) ? input.routing : {};
    function resolveDestination(demandRef, factHint) {
      if (nonEmpty(factHint)) return str(factHint);                                   // explicit canonical planning fact
      if (nonEmpty(routing[demandRef])) return str(routing[demandRef]);               // caller/planning-scope routing map
      if (nonEmpty(scope.destinationWarehouseId)) return str(scope.destinationWarehouseId); // frozen-scope destination (regeneration)
      return null;                                                                    // → MISSING_DESTINATION_WAREHOUSE
    }

    // ---- DEMAND assembly (fc_regular_forecast month column + fc_special_events) -----------------------------
    var demandRows = [];
    var seenDemandRef = {};
    var requiredByDate = input.requiredByDate;                                         // caller/planning-scope required-by (D: derived-upstream, caller-owned)
    var forecastMonth = nonEmpty(input.forecastMonth) ? str(input.forecastMonth).toLowerCase() : null;

    if (fcReg.length) {
      if (!forecastMonth || MONTHS.indexOf(forecastMonth) < 0) { addIssue('DEMAND', null, 'MISSING_FORECAST'); }
      else {
        fcReg.forEach(function (r) {
          var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
          if (!nonEmpty(sku)) { addIssue('DEMAND', null, 'MISSING_FORECAST'); return; }
          var val = r[forecastMonth];
          if (val === undefined || val === null || val === '') return;                // blank month stays MISSING (never fabricated 0)
          var srcRef = nonEmpty(r.forecast_id) ? 'FC:' + str(r.forecast_id)
            : 'REG:' + [str(r.company) || str(scope.company), str(r.country) || str(scope.country), str(r.marketplace) || str(scope.marketplace), sku, str(input.planningCycle)].join(':');
          if (seenDemandRef[srcRef]) { addIssue('DEMAND', srcRef, 'DUPLICATE_SOURCE'); return; }
          seenDemandRef[srcRef] = 1;
          var dest = resolveDestination(srcRef, null);
          if (!dest) { addIssue('DEMAND', srcRef, 'MISSING_DESTINATION_WAREHOUSE'); return; } // D-3 blocks this demand scope
          demandRows.push({ demand_type: 'REGULAR', source_ref: srcRef, quantity: val, sku: sku,
            company: str(r.company) || str(scope.company), country: str(r.country) || str(scope.country),
            marketplace: str(r.marketplace) || str(scope.marketplace), destination_warehouse_id: dest,
            planning_cycle: str(input.planningCycle), required_by_date: requiredByDate });
        });
      }
    }
    if (fcEvt.length) {
      fcEvt.forEach(function (r) {
        var eventId = nonEmpty(r.event_fc_id) ? str(r.event_fc_id) : (nonEmpty(r.event_id) ? str(r.event_id) : null);
        if (!eventId) { addIssue('DEMAND', null, 'BLOCKED_CONFLICT'); return; }        // missing event identity fails closed
        if (r.fc_qty === undefined || r.fc_qty === null || r.fc_qty === '') return;   // blank event qty stays MISSING
        var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
        var srcRef = 'EVT:' + eventId;
        if (seenDemandRef[srcRef]) { addIssue('DEMAND', srcRef, 'DUPLICATE_SOURCE'); return; }
        seenDemandRef[srcRef] = 1;
        var dest = resolveDestination(srcRef, null);
        if (!dest) { addIssue('DEMAND', srcRef, 'MISSING_DESTINATION_WAREHOUSE'); return; }
        demandRows.push({ demand_type: 'SPECIAL_EVENT', source_ref: srcRef, event_id: eventId, quantity: r.fc_qty, sku: sku,
          company: str(r.company) || str(scope.company), country: str(r.country) || str(scope.country),
          marketplace: str(r.marketplace) || str(scope.marketplace), destination_warehouse_id: dest,
          planning_cycle: str(input.planningCycle), required_by_date: requiredByDate });
      });
    }

    // ---- SUPPLY assembly: current stock (FBA / THREE_PL / FACTORY) + lifecycle (plans / shipments) ----------
    var supplyRows = [];
    var asOfByType = {};

    // FBA current stock — amazon_inventory_snapshot (poolType FBA; company via identity/scope; as-of snapshot_date)
    var fbaAsOf = [];
    fba.forEach(function (r) {
      if (r.available_qty === undefined || r.available_qty === null || r.available_qty === '') return;
      var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
      var wh = str(r.warehouse_id) || str(scope.fbaWarehouseId);
      if (!nonEmpty(wh)) { addIssue('SUPPLY', sku, 'SOURCE_NOT_AVAILABLE'); return; }
      var company = str(scope.company);                                               // FBA belongs to the run's real company
      fbaAsOf.push(r.snapshot_date);
      supplyRows.push({ pool_type: 'FBA', warehouse_id: wh, quantity: r.available_qty, sku: sku, company: company,
        lifecycle_bucket: 'CURRENT_STOCK', supply_lineage_ref: 'stock:FBA:' + wh + ':' + sku });
    });
    if (fba.length) asOfByType.amazonInventorySnapshot = maxAsOf(fbaAsOf);

    // THREE_PL current stock — overseas_inventory_snapshot (company via warehouse join; as-of snapshot_date)
    var ovsAsOf = [];
    ovs.forEach(function (r) {
      if (r.wh_available_stock === undefined || r.wh_available_stock === null || r.wh_available_stock === '') return;
      var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
      var wh = str(r.warehouse_id);
      if (!nonEmpty(wh)) { addIssue('SUPPLY', sku, 'SOURCE_NOT_AVAILABLE'); return; }
      var whRow = whById[wh];
      var company = whRow && nonEmpty(whRow.company) ? str(whRow.company) : str(scope.company); // 3PL company via warehouses join
      ovsAsOf.push(r.snapshot_date);
      supplyRows.push({ pool_type: 'THREE_PL', warehouse_id: wh, quantity: r.wh_available_stock, sku: sku, company: company,
        lifecycle_bucket: 'CURRENT_STOCK', supply_lineage_ref: 'stock:THREE_PL:' + wh + ':' + sku });
    });
    if (ovs.length) asOfByType.overseasInventorySnapshot = maxAsOf(ovsAsOf);

    // FACTORY current stock — factory_stock (D-1 company=FACTORY_SHARED; D-2 as-of last_transaction_at→updated_at)
    var facAsOf = [];
    fac.forEach(function (r) {
      if (r.fac_current_stock === undefined || r.fac_current_stock === null || r.fac_current_stock === '') return;
      var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
      var wh = str(r.warehouse_id);
      if (!nonEmpty(wh)) { addIssue('SUPPLY', sku, 'SOURCE_NOT_AVAILABLE'); return; }
      var rowAsOf = nonEmpty(r.last_transaction_at) ? str(r.last_transaction_at) : (nonEmpty(r.updated_at) ? str(r.updated_at) : null);
      if (rowAsOf === null) addIssue('SUPPLY', 'stock:FACTORY:' + wh + ':' + sku, 'SOURCE_AS_OF_MISSING'); // D-2
      else facAsOf.push(rowAsOf);
      supplyRows.push({ pool_type: 'FACTORY', warehouse_id: wh, quantity: r.fac_current_stock, sku: sku,
        company: FACTORY_SHARED, lifecycle_bucket: 'CURRENT_STOCK', supply_lineage_ref: 'stock:FACTORY:' + wh + ':' + sku });
    });
    if (fac.length) asOfByType.factoryStock = facAsOf.length ? maxAsOf(facAsOf) : null;

    // ---- Incoming/committed lifecycle supply — shipping_plans + shipments via the CANONICAL bridge (F1-3b) -----
    // NO local status/lifecycle authority here. shipping_plans + shipments are shaped into the canonical
    // KMSF.projectSupplyLifecycle input and classified by the frozen §2E Qualified-Incoming ten-gate +
    // §39.5 lifecycle map + buildSupplyLedger (evaluateQualifiedIncoming is now on the production supply path).
    // The canonical lifecycle entries are reused VERBATIM (a camelCase→snake_case shape adapter only; the
    // lifecycle_bucket value is NEVER re-translated). Current Stock stays direct (Path A above). DELIVERED /
    // RECEIVED / COMMITTED_PRODUCTION require their own canonical authorities (routeEvents / receivingFacts /
    // committedProduction) — separate slices, not wired here (like the PO read).
    var planAsOf = [], shipAsOf = [];

    // A run-level planning destination for the canonical shipment scope (company+sku+destination). It does NOT
    // decide inclusion (the emitted warehouse is each shipment's OWN canonical destination); it satisfies the
    // B4-R4 adapter's required scope. Caller/planning-scope owned (never inferred from country/marketplace/code).
    function resolveRunDestination() {
      if (nonEmpty(scope.destinationWarehouseId)) return str(scope.destinationWarehouseId);
      for (var k in routing) { if (has(routing, k) && nonEmpty(routing[k])) return str(routing[k]); }
      return null;
    }

    // shipping_plans → canonical approvedShippingPlans[] (canonical `approved` vocabulary owned by the bridge;
    // canonical lineage from shipping_plan_line_id; approved_qty; canonical destination/source warehouse; THREE_PL).
    var approvedShippingPlans = plans.map(function (r) {
      planAsOf.push(r.source_data_as_of);
      var lineId = str(r.shipping_plan_line_id), planId = str(r.shipping_plan_id);
      return {
        status: r.status,
        supplyLineageRef: lineId ? (planId ? 'shipping_plan:' + planId + ':' + lineId : 'shipping_plan:' + lineId) : '',
        company: str(r.company) || str(scope.company),
        masterSku: nonEmpty(r.sku) ? str(r.sku) : str(scope.sku),
        warehouseId: str(r.destination_warehouse_id) || str(r.source_warehouse_id),
        poolType: 'THREE_PL',
        quantity: r.approved_qty
      };
    });
    if (plans.length) asOfByType.shippingPlans = maxAsOf(planAsOf);

    // shipments → canonical B4-R3 shipmentInputs [{shipment,line}] (canonical shipment_id/shipment_line_id identity
    // → lineage shipment:<id>:<lineId>; shipment_qty; destination_warehouse_id w/ legacy warehouse_id fallback; eta;
    // raw status preserved for the bridge). Malformed rows lacking canonical identity fail closed via ADAPT_FAILED.
    var shipmentInputs = ships.map(function (r) {
      shipAsOf.push(r.source_data_as_of);
      return {
        shipment: {
          shipmentId: nonEmpty(r.shipment_id) ? str(r.shipment_id) : undefined,
          company: str(r.company) || str(scope.company),
          country: nonEmpty(r.country) ? str(r.country) : (nonEmpty(scope.country) ? str(scope.country) : undefined),
          marketplace: nonEmpty(r.marketplace) ? str(r.marketplace) : (nonEmpty(scope.marketplace) ? str(scope.marketplace) : undefined),
          destinationWarehouseId: nonEmpty(r.destination_warehouse_id) ? str(r.destination_warehouse_id) : undefined,
          legacyWarehouseId: nonEmpty(r.warehouse_id) ? str(r.warehouse_id) : undefined,
          eta: has(r, 'eta') ? r.eta : undefined,
          status: has(r, 'status') ? r.status : undefined,
          sourceUpdatedAt: nonEmpty(r.source_data_as_of) ? str(r.source_data_as_of) : undefined
        },
        line: {
          shipmentLineId: nonEmpty(r.shipment_line_id) ? str(r.shipment_line_id) : undefined,
          sku: nonEmpty(r.sku) ? str(r.sku) : str(scope.sku),
          shipmentQty: has(r, 'shipment_qty') ? r.shipment_qty : undefined,
          // R4 — cumulative receipt so the candidate can net REMAINING incoming (blank/absent → 0 downstream).
          shipmentReceivedQty: has(r, 'shipment_received_qty') ? r.shipment_received_qty : undefined,
          siteSku: nonEmpty(r.site_sku) ? str(r.site_sku) : undefined
        }
      };
    });
    if (ships.length) asOfByType.shipments = maxAsOf(shipAsOf);

    // Canonical lifecycle bridge. Shipments require a strict Required-By (evaluateQualifiedIncoming §2F) + a run
    // destination for the canonical scope; if either is absent they fail closed (issue) and plans still project.
    // Gate 9/10 count-once evidence sets pass through when the caller supplies them (production default: empty).
    var lifecycleInput = { approvedShippingPlans: approvedShippingPlans, sourceDataAsOf: input.sourceDataAsOf };
    if (shipmentInputs.length) {
      var runDest = resolveRunDestination();
      if (!isStrictDate(requiredByDate)) { addIssue('SUPPLY', 'shipments', 'MISSING_REQUIRED_BY_DATE'); }
      else if (!runDest) { addIssue('SUPPLY', 'shipments', 'MISSING_DESTINATION_FOR_SHIPMENT_SCOPE'); }
      else {
        lifecycleInput.shipments = {
          shipmentInputs: shipmentInputs,
          scope: { company: str(scope.company), sku: str(scope.sku), destinationWarehouseId: runDest,
            country: nonEmpty(scope.country) ? str(scope.country) : undefined,
            marketplace: nonEmpty(scope.marketplace) ? str(scope.marketplace) : undefined },
          requiredByDate: str(requiredByDate),
          postedToCurrentStockLineageKeys: Array.isArray(input.postedToCurrentStockLineageKeys) ? input.postedToCurrentStockLineageKeys : [],
          activeOtherBucketLineageKeys: Array.isArray(input.activeOtherBucketLineageKeys) ? input.activeOtherBucketLineageKeys : []
        };
      }
    }

    var lifecycle = KMSF.projectSupplyLifecycle(lifecycleInput);
    // Surface every canonical structured issue (UNKNOWN_STATUS / LINEAGE_TRANSFERRED_DOWNSTREAM / MISSING_* /
    // RECEIVING_AUTHORITY_REQUIRED / POSTED_TO_CURRENT_STOCK_AUTHORITY / ADAPT_FAILED …) — nothing silently dropped.
    (lifecycle.issues || []).forEach(function (x) { addIssue('SUPPLY', x.domain + '@' + x.i, x.reason); });
    if (lifecycle.ready === false) addIssue('SUPPLY', 'lifecycle', lifecycle.reason || 'BLOCKED_CONFLICT');
    // Reuse the canonical lifecycle entries VERBATIM (shape adapter only; lifecycle_bucket carried through unchanged).
    (lifecycle.entries || []).forEach(function (e) {
      supplyRows.push({ pool_type: e.poolType, warehouse_id: e.warehouseId, quantity: e.quantity,
        supply_lineage_ref: e.supplyLineageRef, sku: e.masterSku, company: e.company, lifecycle_bucket: e.lifecycleBucket,
        eta: (e.eta == null ? null : str(e.eta)) });   // F1-4B-FM3c-1b: carry the KMSF-preserved canonical ETA through the supply row (evidence only; missing stays null)
    });

    // ---- F1-4B-FM3c-1b: WAREHOUSE Qualified Incoming EVENT facts (additive; surfaced, never reconstructed) ----
    // Surfaced from the SAME SHIPPED_IN_TRANSIT supply rows the handler already aggregates
    // (recoWsSupplyBySku_: qualifiedIncomingQty = Σ SHIPPED_IN_TRANSIT). These events are EVIDENCE over existing
    // supply, NOT additional supply — each event's eligibleQty is the row's already-counted quantity, so the
    // aggregate is unchanged. Only a row with a canonical ETA becomes a DATED event (missing ETA is never a
    // fabricated date → the row stays in the aggregate but is not a dated event). incomingId = the count-once
    // supply_lineage_ref (shipment:<id>:<lineId>, per-line, one destination warehouse) → legitimate multi-warehouse
    // splits are distinct lineageKeys, so they are distinct events and are never deduped together.
    var warehouseQualifiedEvents = [];
    supplyRows.forEach(function (e) {
      if (e.lifecycle_bucket !== 'SHIPPED_IN_TRANSIT') return;   // canonical Qualified Incoming bucket (matches the handler aggregate)
      if (!nonEmpty(e.eta)) return;                              // no fabricated date; row still counted in the aggregate
      warehouseQualifiedEvents.push({
        incomingId: str(e.supply_lineage_ref), eta: str(e.eta), eligibleQty: e.quantity,
        warehouseId: str(e.warehouse_id), sourceType: 'KM', state: 'QUALIFIED'
      });
    });
    warehouseQualifiedEvents.sort(function (a, b) {
      return cmpStr(a.warehouseId, b.warehouseId) || cmpStr(a.eta, b.eta) || cmpStr(a.incomingId, b.incomingId);
    });

    // ---- caller-owned planning facts → DTO rows (ROUTE, never compute) --------------------------------------
    var callerFacts = Array.isArray(input.planningFacts) ? input.planningFacts : [];
    var planningRows = callerFacts.map(function (f) {
      var sku = nonEmpty(f.sku) ? str(f.sku) : str(scope.sku);
      var row = { recommendation_type: type, demand_source_ref: str(f.demandRef), sku: sku,
        site_sku: f.siteSku, company: str(f.company) || str(scope.company),
        country: str(f.country) || str(scope.country), marketplace: str(f.marketplace) || str(scope.marketplace),
        units_per_carton: has(f, 'unitsPerCarton') ? f.unitsPerCarton : upcBySku[sku],
        formula_version: input.formulaVersion, source_data_as_of: input.sourceDataAsOf };
      if (type === 'WEEKLY_SHIPPING') { row.window_code = f.windowCode; row.calculated_gap_qty = f.calculatedGap; }
      else { row.request_month = f.requestMonth; row.request_bucket = f.requestBucket; row.net_order_need_snapshot = f.netOrderNeed; }
      return row;
    });

    var receiverInput = Array.isArray(input.receiverFacts) ? input.receiverFacts : [];
    var receiverRows = receiverInput.map(function (f) {
      var mkt = str(f.marketplace) || str(scope.marketplace);
      var mskKey = [str(scope.company), str(scope.country), mkt, str(f.sku || scope.sku)].join('|');
      return { receiver_key: str(f.receiverKey), demand_source_ref: str(f.demandRef),
        eligible_pool_types: f.eligiblePoolTypes, survival_need_qty: f.survivalNeedQty, daily_demand: f.dailyDemand,
        allocation_priority: has(f, 'allocationPriority') ? f.allocationPriority : priorityByMkt[mkt],
        demand_weight: f.demandWeight,
        fulfillment_model: nonEmpty(f.fulfillmentModel) ? f.fulfillmentModel : ffByMskKey[mskKey],
        marketplace: mkt, destination_warehouse_id: resolveDestination(str(f.demandRef), f.destinationWarehouseId) };
    });

    var factoryInput = Array.isArray(input.factoryDemandFacts) ? input.factoryDemandFacts : [];
    var factoryRows = factoryInput.map(function (f) {
      var mkt = str(f.marketplace) || str(scope.marketplace);
      return { demand_source_ref: str(f.demandRef), eligible_factory_warehouse_ids: f.eligibleFactoryWarehouseIds,
        allocation_priority: has(f, 'allocationPriority') ? f.allocationPriority : priorityByMkt[mkt],
        required_by_date: has(f, 'requiredByDate') ? f.requiredByDate : requiredByDate,
        marketplace: mkt, destination_warehouse_id: resolveDestination(str(f.demandRef), f.destinationWarehouseId) };
    });

    // ---- assemble the in-memory DTO snapshots (origin PROJECTION_RUNTIME; NO persisted Sheets) ---------------
    var demandAsOf = asOfByType.overseasInventorySnapshot || null;
    var demandHeaders = ['demand_type', 'source_ref', 'quantity', 'required_by_date', 'sku', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'planning_cycle', 'event_id'];
    var supplyHeaders = ['pool_type', 'warehouse_id', 'quantity', 'supply_lineage_ref', 'sku', 'company', 'lifecycle_bucket'];
    var planningHeaders = type === 'WEEKLY_SHIPPING'
      ? ['recommendation_type', 'demand_source_ref', 'sku', 'site_sku', 'window_code', 'calculated_gap_qty', 'units_per_carton', 'company', 'country', 'marketplace', 'formula_version', 'source_data_as_of']
      : ['recommendation_type', 'demand_source_ref', 'sku', 'site_sku', 'request_month', 'request_bucket', 'net_order_need_snapshot', 'units_per_carton', 'company', 'country', 'marketplace', 'formula_version', 'source_data_as_of'];
    var receiverHeaders = ['receiver_key', 'demand_source_ref', 'eligible_pool_types', 'survival_need_qty', 'daily_demand', 'allocation_priority', 'demand_weight', 'fulfillment_model', 'marketplace', 'destination_warehouse_id'];
    var factoryHeaders = ['demand_source_ref', 'eligible_factory_warehouse_ids', 'allocation_priority', 'required_by_date', 'marketplace', 'destination_warehouse_id'];

    var sourceAsOf = input.sourceDataAsOf !== undefined ? input.sourceDataAsOf
      : maxAsOf([asOfByType.amazonInventorySnapshot, asOfByType.overseasInventorySnapshot, asOfByType.factoryStock, asOfByType.shippingPlans, asOfByType.shipments]);

    var reader = {
      skuDetails: toSnapshot('skuDetails', skuRows, unionHeaders(skuRows, ['sku', 'units_per_carton', 'category', 'series']), null),
      marketplaceSkus: toSnapshot('marketplaceSkus', mskRows, unionHeaders(mskRows, ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model']), null),
      warehouses: toSnapshot('warehouses', whRows, unionHeaders(whRows, ['warehouse_id', 'warehouse_type', 'is_factory_warehouse', 'is_active', 'company', 'country']), null),
      demand: toSnapshot('demand', demandRows, demandHeaders, demandAsOf),
      supply: toSnapshot('supply', supplyRows, supplyHeaders, sourceAsOf),
      planningFacts: toSnapshot('planningFacts', planningRows, planningHeaders, input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf)
    };
    if (type === 'WEEKLY_SHIPPING') reader.receivers = toSnapshot('receivers', receiverRows, receiverHeaders, null);
    if (type === 'MONTHLY_ORDER') reader.factoryDemands = toSnapshot('factoryDemands', factoryRows, factoryHeaders, null);

    // required-source presence (fail-closed): demand + supply + planningFacts must have produced rows
    var hardReason = null;
    if (!demandRows.length) hardReason = 'SOURCE_NOT_AVAILABLE';
    else if (!supplyRows.length) hardReason = 'MISSING_SNAPSHOT';
    else if (!planningRows.length) hardReason = 'SOURCE_NOT_AVAILABLE';

    return {
      ready: hardReason === null, status: hardReason === null ? 'READY' : 'BLOCKED', reason: hardReason,
      issues: issues, recommendationType: type, planningCycle: str(input.planningCycle), businessScope: scope,
      sourceReaderInput: reader,
      demandSourceEntries: demandRows, supplySourceEntries: supplyRows,
      warehouseQualifiedEvents: warehouseQualifiedEvents,   // F1-4B-FM3c-1b (additive; evidence over SHIPPED_IN_TRANSIT supply)
      receiverFacts: receiverRows, factoryDemandFacts: factoryRows, planningFacts: planningRows,
      sourceDataAsOf: sourceAsOf, sourceAsOfByType: asOfByType,
      lineage: { origin: ORIGIN, demandCount: demandRows.length, supplyCount: supplyRows.length }
    };
  }

  function unionHeaders(rows, base) {
    var seen = {}; base.forEach(function (h) { seen[h] = 1; });
    var extra = [];
    rows.forEach(function (r) { for (var k in r) if (has(r, k) && !seen[k]) { seen[k] = 1; extra.push(k); } });
    extra.sort(cmpStr);
    return base.concat(extra);
  }

  // Full projection → frozen Production Reader (KMSRP) → whole chain. In-memory only; NO writes; NO Sheets.
  function projectAndRead(input) {
    var p = projectRecommendationProductionSources(input);
    if (!p.ready) {
      return { projection: p, ready: false, reason: p.reason, recommendationType: p.recommendationType,
        planningCycle: p.planningCycle, businessScope: p.businessScope, lines: [], bridgeResult: null };
    }
    var full = KMSRP.buildRecommendationSourceFacts({
      recommendationType: p.recommendationType, planningCycle: p.planningCycle, businessScope: p.businessScope,
      snapshots: p.sourceReaderInput, formulaVersion: input.formulaVersion, sourceDataAsOf: p.sourceDataAsOf
    });
    full.projection = p;
    return full;
  }

  return {
    FACTORY_SHARED: FACTORY_SHARED,
    projectRecommendationProductionSources: projectRecommendationProductionSources,
    projectAndRead: projectAndRead
  };
});
