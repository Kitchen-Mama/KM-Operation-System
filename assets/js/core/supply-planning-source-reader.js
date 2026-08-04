// Kitchen Mama Operation System — Apps Script RECOMMENDATION SOURCE READER Runtime (Phase 2C, Round 1P).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC. The ONE canonical Source for the Recommendation Runtime. It owns exactly:
//   Google Sheet Row → Domain Object → Runtime DTO
// and NOTHING else. It performs ONLY: sheet-row mapping, null-normalize, type-normalize, enum-normalize,
// identity-normalize, column rename, DTO build. It owns NO business logic:
//   × Gap / Demand / Forecast / Allocation / Recommendation / Priority / 18-day / Company-allocation /
//     Factory-decision / any Runtime decision. It never DERIVES a value — it reads whatever a source column
//     already holds (raw or upstream-computed) and renames/normalizes it.
//
// It produces the exact inputs the FROZEN runtimes consume (never reimplemented):
//   • demandLedgerInput  → supply-planning-ledgers.js buildDemandLedger  (§39 demand entries)
//   • supplyLedgerInput  → supply-planning-ledgers.js buildSupplyLedger  (§39 supply entries)
//   • receiverFacts / factoryDemandFacts → supply-planning-source-facts.js projectAllocationInputs (§40)
//   • weeklyPlanningFacts / monthlyPlanningFacts → resolveWeekly/MonthlyRecommendationFacts (§31/§14)
// The Ledger-owned `demandKey` is NOT computed here (that is Ledger business logic); the reader emits each
// fact's natural `demandRef` and `resolveDemandKeys(dto, demandLedger)` LINKS them to the ledger-EMITTED
// demandKey by identity (never recomputing the key).
//
// Invariants: read-only; JSON-safe; deterministic (No Date.now / No Math.random / No locale / No
// SpreadsheetApp / No LockService / No Cache / No DB / No Browser); input never mutated; fresh output;
// MISSING is never silently 0 (only an explicit source 0 yields 0); identity ambiguity / duplicate identity
// / invalid enum / missing-required all FAIL CLOSED (no fallback).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceReader = api; }
})(this, function (SF) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }

  var DEMAND_TYPES = { REGULAR: 1, SALES_RUN_RATE: 1, SPECIAL_EVENT: 1, SAFETY: 1 };
  var POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };
  var FULFILLMENT_MODELS = { self_fulfilled: 1, platform_fulfilled: 1, hybrid: 1 };
  var KEY_SEP = String.fromCharCode(1); // the Ledger demandKey separator (read-only; used only to READ emitted keys)

  // ---- CANONICAL COLUMN MAP (Database First) --------------------------------------------------------------
  // snake_case source column → runtime DTO field. Overridable via createRecommendationSourceReader({ columns }).
  // These are pure RENAME targets (allowed); the reader never invents a VALUE, only maps a column NAME.
  //
  // Two grounding tiers (Round 1P Database-First survey — see RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC §1P):
  //   [DB-CONFIRMED] a real canonical Sheet column exists and is cited:
  //     `sku` (the Master SKU — DATABASE_RELATIONSHIP_MAP §sku_details), `site_sku`, `units_per_carton`,
  //     `window_code`, `calculated_gap_qty`, `request_month`, `request_bucket`, `net_order_need_snapshot`
  //     (16_/15_ draft-line headers), `warehouse_id`, `allocation_priority` (marketplaces), `fulfillment_model`
  //     (marketplace_skus), `company`, `country`, `marketplace`, `planning_cycle`, `formula_version`,
  //     `source_data_as_of`, `recommendation_type`, `source_page`, `draft_purpose`.
  //   [CONVENTION] NO canonical Sheet column is defined yet (the runtime deliberately requires these as
  //     caller-supplied facts — source-facts.js projectAllocationInputs header): `demand_type`, `source_ref`,
  //     `pool_type`, `supply_lineage_ref`, `quantity`, `destination_warehouse_id`, `demand_source_ref`,
  //     `survival_need_qty`, `daily_demand`, `demand_weight`, `eligible_pool_types`,
  //     `eligible_factory_warehouse_ids`, `event_id`, `lifecycle_bucket`. These defaults are the DTO-field
  //     snake_case rendering — OVERRIDE them via `columns` once the canonical recommendation-SOURCE sheet is
  //     defined. The reader never DERIVES them (Forecast→Demand / inventory→Supply projection is out of scope).
  var DEFAULT_COLUMNS = {
    demand: {
      demandType: 'demand_type', sourceRef: 'source_ref', requiredByDate: 'required_by_date',
      quantity: 'quantity', eventId: 'event_id',
      masterSku: 'sku', company: 'company', country: 'country', marketplace: 'marketplace',
      destinationWarehouseId: 'destination_warehouse_id', planningCycle: 'planning_cycle'
    },
    supply: {
      supplyLineageRef: 'supply_lineage_ref', masterSku: 'sku', company: 'company',
      warehouseId: 'warehouse_id', poolType: 'pool_type', lifecycleBucket: 'lifecycle_bucket', quantity: 'quantity'
    },
    receiver: {
      receiverKey: 'receiver_key', demandRef: 'demand_source_ref', marketplace: 'marketplace',
      destinationWarehouseId: 'destination_warehouse_id', fulfillmentModel: 'fulfillment_model',
      survivalNeedQty: 'survival_need_qty', dailyDemand: 'daily_demand',
      allocationPriority: 'allocation_priority', demandWeight: 'demand_weight', eligiblePoolTypes: 'eligible_pool_types'
    },
    factory: {
      demandRef: 'demand_source_ref', marketplace: 'marketplace', destinationWarehouseId: 'destination_warehouse_id',
      requiredByDate: 'required_by_date', allocationPriority: 'allocation_priority',
      eligibleFactoryWarehouseIds: 'eligible_factory_warehouse_ids'
    },
    weeklyFact: {
      recommendationType: 'recommendation_type', masterSku: 'sku', siteSku: 'site_sku',
      windowCode: 'window_code', demandRef: 'demand_source_ref', company: 'company', country: 'country',
      marketplace: 'marketplace', destinationWarehouseId: 'destination_warehouse_id',
      calculatedGap: 'calculated_gap_qty', unitsPerCarton: 'units_per_carton',
      formulaVersion: 'formula_version', sourceDataAsOf: 'source_data_as_of'
    },
    monthlyFact: {
      recommendationType: 'recommendation_type', masterSku: 'sku', siteSku: 'site_sku',
      requestMonth: 'request_month', requestBucket: 'request_bucket', demandRef: 'demand_source_ref',
      company: 'company', country: 'country', marketplace: 'marketplace',
      destinationWarehouseId: 'destination_warehouse_id', netOrderNeed: 'net_order_need_snapshot',
      unitsPerCarton: 'units_per_carton', formulaVersion: 'formula_version', sourceDataAsOf: 'source_data_as_of'
    }
  };

  // ---- sheet-values normalization (2D header rows OR array of row-objects) ---------------------------------
  function normalizeRows(values, where) {
    if (values === undefined || values === null) return [];
    aType(Array.isArray(values), where + ' must be an array (2D values or row objects)');
    if (values.length === 0) return [];
    if (Array.isArray(values[0])) {
      // Apps Script getValues(): first row is the header.
      var header = values[0].map(function (h) { return str(h); });
      var out = [];
      for (var r = 1; r < values.length; r++) {
        var rowArr = values[r];
        aType(Array.isArray(rowArr), where + '[' + r + '] must be an array row');
        var o = {};
        for (var c = 0; c < header.length; c++) { if (header[c] !== '') o[header[c]] = rowArr[c]; }
        out.push(o);
      }
      return out;
    }
    // Array of row objects.
    return values.map(function (o, i) { aType(isObj(o), where + '[' + i + '] must be a row object'); var n = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; return n; });
  }

  // ---- value normalizers (MISSING ≠ ZERO; no coercion of invalids to defaults) ----------------------------
  function pick(row, col) { return row[col]; }
  function normStr(v) { return nonEmpty(v) ? str(v) : null; }
  function normQty(v) {
    if (v === undefined || v === null || v === '') return { ok: false, missing: true };
    var n = Number(v); if (typeof v === 'boolean' || !isFinite(n)) return { ok: false, invalid: true };
    return { ok: true, qty: n };
  }
  function normList(v) {
    // array OR comma-separated string → trimmed, de-duped, sorted id list. Empty → [].
    var raw = [];
    if (Array.isArray(v)) raw = v;
    else if (typeof v === 'string') raw = v.split(',');
    else if (v === undefined || v === null || v === '') return { ok: true, list: [] };
    else return { ok: false };
    var seen = {}, out = [];
    for (var i = 0; i < raw.length; i++) { var t = str(raw[i]); if (t === '') continue; if (!seen[t]) { seen[t] = 1; out.push(t); } }
    out.sort(cmpStr);
    return { ok: true, list: out };
  }

  // ---- run-level scope / metadata (caller-owned; row columns must AGREE, never override) -------------------
  function readRunMeta(input, fn) {
    aType(isObj(input), fn + ': input must be an object');
    aType(isObj(input.scope), fn + ': input.scope required');
    aType(nonEmpty(input.planningCycle), fn + ': planningCycle required');
    return {
      scope: input.scope,
      planningCycle: str(input.planningCycle),
      formulaVersion: input.formulaVersion === undefined ? null : input.formulaVersion,
      sourceDataAsOf: input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf
    };
  }

  // identity-normalize: reuse the FROZEN resolveSourceIdentity when identity tables are supplied (duplicate /
  // ambiguity fail-closed); otherwise a minimal scope-derived identity. Never invents identity.
  function readIdentity(input, scope, fn) {
    if (input.identityTables && SF && typeof SF.resolveSourceIdentity === 'function') {
      var it = input.identityTables;
      var res = SF.resolveSourceIdentity({
        rawScope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: scope.sku },
        marketplaceSkuRows: normalizeRows(it.marketplaceSkus, fn + ': identityTables.marketplaceSkus'),
        skuDetailRows: normalizeRows(it.skuDetails, fn + ': identityTables.skuDetails'),
        warehouseRows: normalizeRows(it.warehouses, fn + ': identityTables.warehouses'),
        destinationWarehouseId: input.destinationWarehouseId
      });
      aRange(res.status === 'RESOLVED', fn + ': identity not resolved (' + res.status + ':' + res.reason + ')');
      return res.identity;
    }
    return {
      company: normStr(scope.company), country: normStr(scope.country), marketplace: normStr(scope.marketplace),
      masterSku: normStr(scope.sku), fulfillmentModel: normStr(scope.fulfillmentModel)
    };
  }

  // ---- demand ledger input (§39 demand entries; missing → issue+exclude, never 0) --------------------------
  function readDemandEntries(rows, cols, meta, issues) {
    var entries = [];
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i];
      var dt = str(pick(d, cols.demandType));
      if (DEMAND_TYPES[dt] !== 1) { issues.push({ domain: 'demand', i: i, reason: 'INVALID_DEMAND_TYPE:' + dt }); continue; }
      var sourceRef = normStr(pick(d, cols.sourceRef));
      if (!sourceRef) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_SOURCE_REF' }); continue; }
      var masterSku = normStr(pick(d, cols.masterSku)) || normStr(meta.scope.sku);
      if (!masterSku) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_MASTER_SKU' }); continue; }
      var company = normStr(pick(d, cols.company)) || normStr(meta.scope.company);
      if (!company) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_COMPANY' }); continue; }
      var dest = normStr(pick(d, cols.destinationWarehouseId));
      if (!dest) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_DESTINATION_WAREHOUSE_ID' }); continue; }
      var pc = normStr(pick(d, cols.planningCycle)) || meta.planningCycle;
      if (pc !== meta.planningCycle) { issues.push({ domain: 'demand', i: i, reason: 'PLANNING_CYCLE_MISMATCH:' + pc }); continue; }
      var qr = normQty(pick(d, cols.quantity));
      if (!qr.ok) { issues.push({ domain: 'demand', i: i, reason: (qr.missing ? 'MISSING_DEMAND_QUANTITY:' : 'INVALID_DEMAND_QUANTITY:') + sourceRef }); continue; }
      var entry = {
        demandType: dt, masterSku: masterSku, company: company,
        country: normStr(pick(d, cols.country)) != null ? normStr(pick(d, cols.country)) : (normStr(meta.scope.country)),
        marketplace: normStr(pick(d, cols.marketplace)) != null ? normStr(pick(d, cols.marketplace)) : (normStr(meta.scope.marketplace)),
        destinationWarehouseId: dest, planningCycle: pc,
        requiredByDate: str(pick(d, cols.requiredByDate)), sourceRef: sourceRef, quantity: qr.qty
      };
      if (dt === 'SPECIAL_EVENT') { var ev = normStr(pick(d, cols.eventId)); if (!ev) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_EVENT_ID:' + sourceRef }); continue; } entry.eventId = ev; }
      entries.push(entry);
    }
    return entries;
  }

  // ---- supply ledger input (§39 supply entries) -----------------------------------------------------------
  function readSupplyEntries(rows, cols, meta, issues) {
    var entries = [];
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i];
      var pt = str(pick(s, cols.poolType));
      if (POOL_TYPES[pt] !== 1) { issues.push({ domain: 'supply', i: i, reason: 'INVALID_POOL_TYPE:' + pt }); continue; }
      var wh = normStr(pick(s, cols.warehouseId));
      if (!wh) { issues.push({ domain: 'supply', i: i, reason: 'MISSING_WAREHOUSE_ID' }); continue; }
      var masterSku = normStr(pick(s, cols.masterSku)) || normStr(meta.scope.sku);
      if (!masterSku) { issues.push({ domain: 'supply', i: i, reason: 'MISSING_MASTER_SKU' }); continue; }
      var company = normStr(pick(s, cols.company)) || normStr(meta.scope.company);
      if (!company) { issues.push({ domain: 'supply', i: i, reason: 'MISSING_COMPANY' }); continue; }
      var qr = normQty(pick(s, cols.quantity));
      if (!qr.ok) { issues.push({ domain: 'supply', i: i, reason: (qr.missing ? 'MISSING_STOCK_QUANTITY:' : 'INVALID_STOCK_QUANTITY:') + wh }); continue; }
      var lineage = normStr(pick(s, cols.supplyLineageRef)) || ('stock:' + pt + ':' + wh + ':' + masterSku);
      var bucket = normStr(pick(s, cols.lifecycleBucket)) || 'CURRENT_STOCK';
      entries.push({ supplyLineageRef: lineage, masterSku: masterSku, company: company, warehouseId: wh, poolType: pt, lifecycleBucket: bucket, quantity: qr.qty });
    }
    return entries;
  }

  // ---- overseas receiver facts (weekly allocation input) --------------------------------------------------
  function readReceiverFacts(rows, cols, issues) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var receiverKey = normStr(pick(r, cols.receiverKey));
      if (!receiverKey) { issues.push({ domain: 'receiver', i: i, reason: 'MISSING_RECEIVER_KEY' }); continue; }
      var demandRef = normStr(pick(r, cols.demandRef));
      if (!demandRef) { issues.push({ domain: 'receiver', i: i, reason: 'MISSING_DEMAND_SOURCE_REF:' + receiverKey }); continue; }
      var fm = normStr(pick(r, cols.fulfillmentModel));
      if (fm !== null && FULFILLMENT_MODELS[fm] !== 1) { issues.push({ domain: 'receiver', i: i, reason: 'INVALID_FULFILLMENT_MODEL:' + fm }); continue; }
      var el = normList(pick(r, cols.eligiblePoolTypes));
      if (!el.ok) { issues.push({ domain: 'receiver', i: i, reason: 'INVALID_ELIGIBLE_POOL_TYPES' }); continue; }
      var fact = { receiverKey: receiverKey, demandRef: demandRef, eligiblePoolTypes: el.list };
      var mkt = normStr(pick(r, cols.marketplace)); if (mkt !== null) fact.marketplace = mkt;
      var dest = normStr(pick(r, cols.destinationWarehouseId)); if (dest !== null) fact.destinationWarehouseId = dest;
      if (fm !== null) fact.fulfillmentModel = fm;
      var sv = normQty(pick(r, cols.survivalNeedQty)); if (sv.ok) fact.survivalNeedQty = sv.qty;
      var dd = normQty(pick(r, cols.dailyDemand)); if (dd.ok) fact.dailyDemand = dd.qty;
      var pr = normQty(pick(r, cols.allocationPriority)); if (pr.ok) fact.allocationPriority = pr.qty;
      var wt = normQty(pick(r, cols.demandWeight)); if (wt.ok) fact.demandWeight = wt.qty;
      out.push(fact);
    }
    return out;
  }

  // ---- factory demand facts (monthly allocation input) ----------------------------------------------------
  function readFactoryFacts(rows, cols, issues) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var demandRef = normStr(pick(r, cols.demandRef));
      if (!demandRef) { issues.push({ domain: 'factory', i: i, reason: 'MISSING_DEMAND_SOURCE_REF' }); continue; }
      var few = normList(pick(r, cols.eligibleFactoryWarehouseIds));
      if (!few.ok) { issues.push({ domain: 'factory', i: i, reason: 'INVALID_ELIGIBLE_FACTORY_WAREHOUSES' }); continue; }
      var fact = { demandRef: demandRef, eligibleFactoryWarehouseIds: few.list };
      var mkt = normStr(pick(r, cols.marketplace)); if (mkt !== null) fact.marketplace = mkt;
      var dest = normStr(pick(r, cols.destinationWarehouseId)); if (dest !== null) fact.destinationWarehouseId = dest;
      var rbd = normStr(pick(r, cols.requiredByDate)); if (rbd !== null) fact.requiredByDate = rbd;
      var pr = normQty(pick(r, cols.allocationPriority)); if (pr.ok) fact.allocationPriority = pr.qty;
      out.push(fact);
    }
    return out;
  }

  // ---- weekly planning facts ------------------------------------------------------------------------------
  function readWeeklyFacts(rows, cols, meta, issues) {
    var out = [], seen = {};
    for (var i = 0; i < rows.length; i++) {
      var f = rows[i];
      var rt = normStr(pick(f, cols.recommendationType)) || 'WEEKLY_SHIPPING';
      if (rt !== 'WEEKLY_SHIPPING') { issues.push({ domain: 'weeklyFact', i: i, reason: 'NOT_WEEKLY_RECOMMENDATION_TYPE:' + rt }); continue; }
      var demandRef = normStr(pick(f, cols.demandRef));
      if (!demandRef) { issues.push({ domain: 'weeklyFact', i: i, reason: 'MISSING_DEMAND_SOURCE_REF' }); continue; }
      var fv = pick(f, cols.formulaVersion); if (fv !== undefined && fv !== null && str(fv) !== '' && meta.formulaVersion != null && str(fv) !== str(meta.formulaVersion)) { issues.push({ domain: 'weeklyFact', i: i, reason: 'FORMULA_VERSION_MISMATCH:' + str(fv) }); continue; }
      var fact = { recommendationType: 'WEEKLY_SHIPPING', demandRef: demandRef };
      var sku = normStr(pick(f, cols.masterSku)) || normStr(meta.scope.sku); if (sku !== null) fact.sku = sku;
      var site = normStr(pick(f, cols.siteSku)); if (site !== null) fact.siteSku = site;
      var win = normStr(pick(f, cols.windowCode)); if (win !== null) fact.windowCode = win;
      var comp = normStr(pick(f, cols.company)) || normStr(meta.scope.company); if (comp !== null) fact.company = comp;
      var ctry = normStr(pick(f, cols.country)) || normStr(meta.scope.country); if (ctry !== null) fact.country = ctry;
      var mkt = normStr(pick(f, cols.marketplace)) || normStr(meta.scope.marketplace); if (mkt !== null) fact.marketplace = mkt;
      var dest = normStr(pick(f, cols.destinationWarehouseId)); if (dest !== null) fact.destinationWarehouseId = dest;
      var gap = normQty(pick(f, cols.calculatedGap)); if (gap.ok) fact.calculatedGap = gap.qty;
      var upc = normQty(pick(f, cols.unitsPerCarton)); if (upc.ok) fact.unitsPerCarton = upc.qty;
      // duplicate natural identity (sku|site_sku|window_code) → fail closed (matches resolver grain)
      var nk = str(fact.sku) + KEY_SEP + str(fact.siteSku) + KEY_SEP + str(fact.windowCode);
      if (nonEmpty(fact.sku) && nonEmpty(fact.windowCode)) { aRange(seen[nk] !== 1, 'readWeeklyRecommendationSource: duplicate Weekly line identity: ' + str(fact.sku) + '|' + str(fact.siteSku) + '|' + str(fact.windowCode)); seen[nk] = 1; }
      out.push(fact);
    }
    return out;
  }

  // ---- monthly planning facts -----------------------------------------------------------------------------
  function readMonthlyFacts(rows, cols, meta, issues) {
    var out = [], seen = {};
    for (var i = 0; i < rows.length; i++) {
      var f = rows[i];
      var rt = normStr(pick(f, cols.recommendationType)) || 'MONTHLY_ORDER';
      if (rt !== 'MONTHLY_ORDER') { issues.push({ domain: 'monthlyFact', i: i, reason: 'NOT_MONTHLY_RECOMMENDATION_TYPE:' + rt }); continue; }
      var demandRef = normStr(pick(f, cols.demandRef));
      if (!demandRef) { issues.push({ domain: 'monthlyFact', i: i, reason: 'MISSING_DEMAND_SOURCE_REF' }); continue; }
      var fv = pick(f, cols.formulaVersion); if (fv !== undefined && fv !== null && str(fv) !== '' && meta.formulaVersion != null && str(fv) !== str(meta.formulaVersion)) { issues.push({ domain: 'monthlyFact', i: i, reason: 'FORMULA_VERSION_MISMATCH:' + str(fv) }); continue; }
      var fact = { recommendationType: 'MONTHLY_ORDER', demandRef: demandRef };
      var sku = normStr(pick(f, cols.masterSku)) || normStr(meta.scope.sku); if (sku !== null) fact.masterSku = sku;
      var site = normStr(pick(f, cols.siteSku)); if (site !== null) fact.siteSku = site;
      var rm = normStr(pick(f, cols.requestMonth)); if (rm !== null) fact.requestMonth = rm;
      var rb = normStr(pick(f, cols.requestBucket)); if (rb !== null) fact.requestBucket = rb;
      var comp = normStr(pick(f, cols.company)) || normStr(meta.scope.company); if (comp !== null) fact.company = comp;
      var ctry = normStr(pick(f, cols.country)) || normStr(meta.scope.country); if (ctry !== null) fact.country = ctry;
      var mkt = normStr(pick(f, cols.marketplace)) || normStr(meta.scope.marketplace); if (mkt !== null) fact.marketplace = mkt;
      var dest = normStr(pick(f, cols.destinationWarehouseId)); if (dest !== null) fact.destinationWarehouseId = dest;
      var need = normQty(pick(f, cols.netOrderNeed)); if (need.ok) fact.netOrderNeed = need.qty;
      var upc = normQty(pick(f, cols.unitsPerCarton)); if (upc.ok) fact.unitsPerCarton = upc.qty;
      var nk = str(fact.masterSku) + KEY_SEP + str(fact.requestMonth) + KEY_SEP + str(fact.requestBucket);
      if (nonEmpty(fact.masterSku) && nonEmpty(fact.requestMonth) && nonEmpty(fact.requestBucket)) { aRange(seen[nk] !== 1, 'readMonthlyRecommendationSource: duplicate Monthly line identity: ' + str(fact.masterSku) + '|' + str(fact.requestMonth) + '|' + str(fact.requestBucket)); seen[nk] = 1; }
      out.push(fact);
    }
    return out;
  }

  // ---- the two public readers (share one core) ------------------------------------------------------------
  function makeReader(config) {
    var COLS = mergeColumns(config && config.columns);

    function readWeekly(input) {
      var meta = readRunMeta(input, 'readWeeklyRecommendationSource');
      var sheets = isObj(input.sheets) ? input.sheets : {};
      var issues = [];
      var identity = readIdentity(input, meta.scope, 'readWeeklyRecommendationSource');
      var demandEntries = readDemandEntries(normalizeRows(sheets.demand, 'sheets.demand'), COLS.demand, meta, issues);
      var supplyEntries = readSupplyEntries(normalizeRows(sheets.supply, 'sheets.supply'), COLS.supply, meta, issues);
      var receiverFacts = readReceiverFacts(normalizeRows(sheets.receivers, 'sheets.receivers'), COLS.receiver, issues);
      var weeklyFacts = readWeeklyFacts(normalizeRows(sheets.planningFacts, 'sheets.planningFacts'), COLS.weeklyFact, meta, issues);
      issues.sort(sortIssue);
      return {
        recommendationType: 'WEEKLY_SHIPPING', planningCycle: meta.planningCycle, businessScope: meta.scope,
        identity: identity, formulaVersion: meta.formulaVersion, sourceDataAsOf: meta.sourceDataAsOf,
        demandLedgerInput: { entries: demandEntries }, supplyLedgerInput: { entries: supplyEntries },
        receiverFacts: receiverFacts, weeklyPlanningFacts: weeklyFacts, issues: issues
      };
    }

    function readMonthly(input) {
      var meta = readRunMeta(input, 'readMonthlyRecommendationSource');
      var sheets = isObj(input.sheets) ? input.sheets : {};
      var issues = [];
      var identity = readIdentity(input, meta.scope, 'readMonthlyRecommendationSource');
      var demandEntries = readDemandEntries(normalizeRows(sheets.demand, 'sheets.demand'), COLS.demand, meta, issues);
      var supplyEntries = readSupplyEntries(normalizeRows(sheets.supply, 'sheets.supply'), COLS.supply, meta, issues);
      var factoryFacts = readFactoryFacts(normalizeRows(sheets.factoryDemands, 'sheets.factoryDemands'), COLS.factory, issues);
      var monthlyFacts = readMonthlyFacts(normalizeRows(sheets.planningFacts, 'sheets.planningFacts'), COLS.monthlyFact, meta, issues);
      issues.sort(sortIssue);
      return {
        recommendationType: 'MONTHLY_ORDER', planningCycle: meta.planningCycle, businessScope: meta.scope,
        identity: identity, formulaVersion: meta.formulaVersion, sourceDataAsOf: meta.sourceDataAsOf,
        demandLedgerInput: { entries: demandEntries }, supplyLedgerInput: { entries: supplyEntries },
        factoryDemandFacts: factoryFacts, monthlyPlanningFacts: monthlyFacts, issues: issues
      };
    }

    return { readWeeklyRecommendationSource: readWeekly, readMonthlyRecommendationSource: readMonthly };
  }

  function sortIssue(a, b) { return cmpStr(a.domain, b.domain) || (a.i - b.i) || cmpStr(a.reason, b.reason); }

  function mergeColumns(over) {
    var out = {};
    for (var group in DEFAULT_COLUMNS) {
      out[group] = {};
      for (var k in DEFAULT_COLUMNS[group]) out[group][k] = DEFAULT_COLUMNS[group][k];
      if (over && over[group]) for (var o in over[group]) out[group][o] = str(over[group][o]);
    }
    return out;
  }

  // ---- demandKey linker: fact.demandRef → ledger-EMITTED demandKey (identity normalize; never recomputed) --
  // The Ledger owns demandKey (§39). This reads the ledger's emitted keys and maps each fact's natural
  // demandRef (= the demand's trailing key segment: sourceRef for non-event, eventId for SPECIAL_EVENT) to its
  // demandKey. Ambiguous ref (two demandKeys share the trailing segment) → fail closed (RangeError).
  function buildRefIndex(demandLedger, fn) {
    aType(isObj(demandLedger) && Array.isArray(demandLedger.entries), fn + ': demandLedger.entries required');
    var byRef = {}, dup = {};
    demandLedger.entries.forEach(function (e) {
      var key = str(e.demandKey); var parts = key.split(KEY_SEP); var ref = parts[parts.length - 1];
      if (byRef[ref] !== undefined && byRef[ref] !== key) dup[ref] = 1;
      byRef[ref] = key;
    });
    return { byRef: byRef, dup: dup };
  }
  function linkFactList(list, idx, fn) {
    return list.map(function (f) {
      var ref = str(f.demandRef);
      var copy = {}; for (var k in f) if (k !== 'demandRef') copy[k] = f[k];
      if (ref !== '' && idx.byRef[ref] !== undefined) {
        aRange(idx.dup[ref] !== 1, fn + ': ambiguous demandRef (multiple demandKeys share trailing segment): ' + ref);
        copy.demandKey = idx.byRef[ref];
      }
      // ref not found → demandKey omitted; downstream resolver blocks the line fail-closed (never fabricated).
      return copy;
    });
  }
  function resolveDemandKeys(dto, demandLedger) {
    aType(isObj(dto), 'resolveDemandKeys: dto must be an object');
    var fn = 'resolveDemandKeys';
    var idx = buildRefIndex(demandLedger, fn);
    var out = {};
    for (var k in dto) out[k] = dto[k];
    if (Array.isArray(dto.receiverFacts)) out.receiverFacts = linkFactList(dto.receiverFacts, idx, fn);
    if (Array.isArray(dto.factoryDemandFacts)) out.factoryDemandFacts = linkFactList(dto.factoryDemandFacts, idx, fn);
    if (Array.isArray(dto.weeklyPlanningFacts)) out.weeklyPlanningFacts = linkFactList(dto.weeklyPlanningFacts, idx, fn);
    if (Array.isArray(dto.monthlyPlanningFacts)) out.monthlyPlanningFacts = linkFactList(dto.monthlyPlanningFacts, idx, fn);
    return out;
  }

  var DEFAULT = makeReader(null);

  return {
    DEMAND_TYPES: (function () { var o = {}; for (var k in DEMAND_TYPES) o[k] = 1; return o; })(),
    POOL_TYPES: (function () { var o = {}; for (var k in POOL_TYPES) o[k] = 1; return o; })(),
    DEFAULT_COLUMNS: mergeColumns(null),
    createRecommendationSourceReader: function (config) { return makeReader(config); },
    readWeeklyRecommendationSource: DEFAULT.readWeeklyRecommendationSource,
    readMonthlyRecommendationSource: DEFAULT.readMonthlyRecommendationSource,
    resolveDemandKeys: resolveDemandKeys
  };
});
