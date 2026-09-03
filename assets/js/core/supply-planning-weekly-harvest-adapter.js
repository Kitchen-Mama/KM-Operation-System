// Kitchen Mama Operation System — WEEKLY AI PLAN harvest→batch-request adapter (F1-7N-D-2b).
// -----------------------------------------------------------------------------
// PURE join/mapping brain for the D-2b Apps Script harvest owner. It turns the RAW canonical facts the .gs shell
// fetches — the result of ONE multi-site KMAF.projectAllocationFacts call (per-site §7 demandWeight, FORECAST_DRIVEN),
// per-site horizons, per-SKU supply pools, factory-identity config — into the exact `request` the (company,country)
// BATCH owner KMWRB.generateWeeklyShippingRecommendationBatch(request, deps) consumes.
//
//   ONE KMAF call across the WHOLE (company,country) universe → receiverFacts (Σ demandWeight == 1) + planningFacts
//   → join receiverFact ↔ planningFact by demandRef (receiverFact carries NO sku; planningFact does)
//   → per site: demandWeight (KMAF §7 site share, verbatim), survivalNeedQty = ceil(18 × dailyDemand) [frozen 18],
//               horizons cumulativeGapByWindow / requiredByByWindow (from the workspace, per site), unitsPerCarton
//   → group lanes by masterSku (+ that SKU's overseas/factory pools) → KMWRB request
//
// It RE-DERIVES NO business value: demandWeight is KMAF's §7 forecast-share output consumed verbatim; survivalNeedQty
// reuses the frozen ceil(18×dailyDemand); the window split + shared-pool allocation happen downstream in KMWIA/B. It
// is PURE: no I/O, no clock/random, no DB/Sheet, inputs never mutated. Fail-closed: if the single KMAF call is not
// ready (any receiver issue → the whole universe is ready:false, no partial success), the request is refused.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyHarvestAdapter = api; }
})(this, function () {
  'use strict';

  var SURVIVAL_HORIZON_DAYS = 18;                 // §20.3/§24.4 frozen survival horizon (reused, not re-invented)
  var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function aType(c, m) { if (!c) throw new TypeError('weeklyHarvestAdapter: ' + m); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function nonEmpty(v) { return str(v).length > 0; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

  // resolveWorkspaceLineDestination(line) → { destinationRef, destinationType, isPhysicalWarehouse }  (F1-7N-D-2c)
  // Resolve the canonical ALLOCATION destination reference from a recommendation-workspace line, reusing the FROZEN
  // KMDR destination classification (F1-4B-FM1 / decisions D-F1-4B-FM5-R2b · D-F1-4B-E0R-1):
  //   WAREHOUSE   → destinationRef = warehouse_id      (physical; self_fulfilled/3PL — UNCHANGED behavior)
  //   MARKETPLACE → destinationRef = marketplace_id     (LOGICAL platform node for platform_fulfilled/FBA;
  //                                                      NEVER a fabricated Amazon warehouse — the final Amazon FC /
  //                                                      carrier / appointment stays downstream Shipping-Plan/Shipment)
  // The weekly allocation engine (KMAF/KMWIA/KMWSA) treats the destination ONLY as a stable demandKey identity — it is
  // never a physical-warehouse FK — so a marketplace_id destination flows through unchanged and is NEVER classified as
  // a physical warehouse (isPhysicalWarehouse=true ONLY for a WAREHOUSE node; a marketplace_id can never match the
  // exact CN/TW factory identity). Fail-closed: destinationRef='' (caller SKIPS the line) when the workspace line has
  // no resolved canonical destination (e.g. DESTINATION_AUTHORITY_UNRESOLVED). Mirrors KMDR's legacy rule: a bare
  // warehouseId ⇒ WAREHOUSE, a bare marketplace ref ⇒ MARKETPLACE.
  function resolveWorkspaceLineDestination(line) {
    line = isObj(line) ? line : {};
    var type = str(line.destinationType).toUpperCase();
    var whId = str(line.warehouseId);
    var mktRef = nonEmpty(line.destinationRefId) ? str(line.destinationRefId) : str(line.marketplaceId);
    if (!type) type = nonEmpty(whId) ? 'WAREHOUSE' : (nonEmpty(mktRef) ? 'MARKETPLACE' : '');
    if (type === 'WAREHOUSE') {
      var wref = nonEmpty(whId) ? whId : str(line.destinationRefId);
      return { destinationRef: wref, destinationType: nonEmpty(wref) ? 'WAREHOUSE' : '', isPhysicalWarehouse: nonEmpty(wref) };
    }
    if (type === 'MARKETPLACE') {
      var mref = nonEmpty(line.destinationRefId) ? str(line.destinationRefId) : str(line.marketplaceId);
      return { destinationRef: mref, destinationType: nonEmpty(mref) ? 'MARKETPLACE' : '', isPhysicalWarehouse: false };
    }
    return { destinationRef: '', destinationType: '', isPhysicalWarehouse: false };
  }

  // ===========================================================================================================
  // F1-7N-FC-1B-E3-R1 §C — THE CANONICAL READINESS RESULT.
  // -----------------------------------------------------------------------------------------------------------
  // WHAT WAS WRONG, MEASURED. A live census returned `mapped.ready = false` with `mapped.issues = []`, and the
  // only thing production could then say was a bare HARVEST_NOT_READY. Executing the predicates showed why,
  // and it was structural rather than situational:
  //
  //   * KMAF decides readiness as `issues.length === 0 && receiverFacts.length > 0`. So `ready:false` with an
  //     EMPTY issues array means exactly one thing — ZERO RECEIVERS — because any staged receiver
  //     either yields a fact or yields at least one issue.
  //   * KMAF already NAMES that case: `reason: 'PLANNING_FACTS_NOT_READY'`.
  //   * and this function returned `{ ready, issues, request }`, copying `kmaf.issues.slice()` and DROPPING
  //     `kmaf.reason`. The one field that explained the refusal was discarded at the boundary.
  //
  // So the answer was never "no reason was known"; it was "the reason was known and thrown away".
  //
  // THE DECISION IS UNCHANGED. Every shape that was ready before is ready now and vice versa: no predicate was
  // added to the gate, none was relaxed, and no missing value is defaulted. `SOURCE_DATA_AS_OF_PRESENT` and
  // `SKU_LANES_NON_EMPTY` are reported as NON-BLOCKING precisely because they never gated readiness here and
  // making them gate it would be a behaviour change with no spec behind it. (Executed: a blank, a null and a
  // real sourceDataAsOf all produce ready:true, all else equal — it is not a readiness predicate, and its
  // blankness in the live census is a CO-SYMPTOM of the same zero-receiver drop, since 61_ populates it only
  // from a site that survived.)
  //
  // TWO KINDS, NEVER CONFLATED (§C.4). Every issue carries a mandatory `kind`: 'DATA' for a readiness fact
  // about the operator's data, 'TRANSPORT' for an exception, an unavailable module or an unreachable read. They
  // share one array so that "ready:false with nothing said" is unrepresentable (§C.1), and they are told
  // apart by a field rather than by a caller guessing from the code.
  // ===========================================================================================================
  var READINESS_CODES = {
    SOURCE_DATA_AS_OF_MISSING: 'SOURCE_DATA_AS_OF_MISSING',
    PLANNING_CYCLE_MISSING: 'PLANNING_CYCLE_MISSING',
    REQUESTED_SCOPE_EMPTY: 'REQUESTED_SCOPE_EMPTY',
    SKU_FACTS_MISSING: 'SKU_FACTS_MISSING',
    SUGGESTED_QTY_UNRESOLVED: 'SUGGESTED_QTY_UNRESOLVED',
    FACTORY_SOURCE_UNRESOLVED: 'FACTORY_SOURCE_UNRESOLVED',
    DESTINATION_UNRESOLVED: 'DESTINATION_UNRESOLVED',
    CANONICAL_MAPPING_INCOMPLETE: 'CANONICAL_MAPPING_INCOMPLETE'
  };
  // §C.6 — the engine's own code is PRESERVED VERBATIM on every issue as `engine_code`, so this table
  // is a translation at one boundary and never a rename: no existing code is retired, nothing downstream loses
  // the code KMAF or 61_ actually emitted, and no synonym is invented inside either of them.
  var ENGINE_TO_READINESS = {
    // KMAF receiver-level codes
    MISSING_DESTINATION_WAREHOUSE: READINESS_CODES.DESTINATION_UNRESOLVED,
    RECEIVER_IDENTITY_INCOMPLETE: READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,
    MISSING_WINDOW_CODE: READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,
    POOL_ELIGIBILITY_UNRESOLVED: READINESS_CODES.FACTORY_SOURCE_UNRESOLVED,
    DEMAND_WEIGHT_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
    DAILY_DEMAND_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
    WEIGHT_BASIS_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
    MISSING_FORECAST_WEIGHT_SOURCE: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
    // KMAF whole-result reasons
    PLANNING_FACTS_NOT_READY: READINESS_CODES.SKU_FACTS_MISSING,
    KMAF_NOT_READY: READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,
    // 61_ harvest-level codes (carried in `harvest.errors`)
    FORECAST_SHARE_INCOMPLETE: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
    RECEIVER_WITHOUT_PLANNING_FACT: READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE
  };
  // TRANSPORT, not data. An exception, an unavailable module or an unreachable read says nothing about whether
  // the operator's data is complete, and reporting it as a data issue would send someone to fix a spreadsheet.
  var ENGINE_TRANSPORT = {
    WORKSPACE_THREW: 1, KMAF_THREW: 1, SUPPLY_POOL_FACTS_UNAVAILABLE: 1,
    FORECAST_MONTHS_UNRESOLVED: 1, WORKSPACE_NOT_OK: 1, WEEKLY_AI_PLAN_NOT_BUNDLED: 1
  };
  // §C.3 — an issue names a field, never carries a table. `actual` is a short scalar summary; arrays
  // and objects are reduced to a shape description, so no row content can ride out through a diagnostic.
  function sanitize(v) {
    if (v === undefined) return '';
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array(' + v.length + ')';
    if (typeof v === 'object') return 'object(' + Object.keys(v).length + ' keys)';
    var s = String(v);
    return s.length > 120 ? s.slice(0, 117) + '...' : s;
  }
  function readinessIssue(o) {
    o = isObj(o) ? o : {};
    var engine = str(o.engine_code);
    var kind = o.kind || (ENGINE_TRANSPORT[engine] ? 'TRANSPORT' : 'DATA');
    var code = str(o.code) || (kind === 'TRANSPORT' ? engine : (ENGINE_TO_READINESS[engine] || READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE));
    var sc = isObj(o.affected_scope) ? o.affected_scope : {};
    return {
      code: code,
      engine_code: engine,
      kind: kind,
      blocking: o.blocking === false ? false : true,
      field: str(o.field),
      stage: str(o.stage) || 'MAPPER',
      expected: sanitize(o.expected),
      actual: sanitize(o.actual),
      source_table: str(o.source_table),
      source_header: str(o.source_header),
      // identity only, never row data
      affected_scope: {
        company: str(sc.company), country: str(sc.country), marketplace: str(sc.marketplace),
        sku: str(sc.sku), demandRef: str(sc.demandRef)
      }
    };
  }
  // An engine issue (KMAF's { code, ref, message } or 61_'s { code, message, ...extra }) → a typed readiness
  // issue. The engine code survives; the scope identity is taken from whatever the engine attached.
  function fromEngineIssue(e, stage, scope) {
    e = isObj(e) ? e : {};
    var engine = str(e.code) || str(e.reason) || str(e.kind);
    var ref = str(e.ref) || str(e.demandRef);
    var sc = { company: str(scope && scope.company), country: str(scope && scope.country), demandRef: ref };
    // demandRef is company|country|marketplace|sku|destination in 61_ — split it back for a readable scope,
    // WITHOUT inventing values when the shape does not match.
    var parts = ref.split('|');
    if (parts.length === 5) { sc.marketplace = parts[2]; sc.sku = parts[3]; }
    return readinessIssue({
      engine_code: engine, stage: stage, field: str(e.field), affected_scope: sc,
      expected: e.expected === undefined ? 'a canonical value' : e.expected,
      actual: e.actual === undefined ? (str(e.message) || 'unresolved') : e.actual,
      source_table: str(e.source_table), source_header: str(e.source_header)
    });
  }

  // mapWeeklyHarvestToBatchRequest(harvest) → { ready, reason, issues, warnings, predicates, request }
  //   harvest = {
  //     planningCycle, businessScope:{company,country,source_page}, mode?, confirmRegenerateOverUserEdits?, actor?, now?,
  //     sourceDataAsOf?, formulaVersion?, factoryIdentityConfig, warehousesById,
  //     kmaf: { ready, issues?, receiverFacts:[ {demandRef, marketplace, destinationWarehouseId, fulfillmentModel,
  //                                              dailyDemand, allocationPriority, demandWeight, eligiblePoolTypes} ],
  //             planningFacts:[ {demandRef, sku, siteSku, unitsPerCarton} ] },     // ONE multi-site §7 call
  //     horizonsByDemandRef: { [demandRef]: { cumulativeGapByWindow:{D18,D30,D45,D90}, requiredByByWindow? } },
  //     poolsBySku: { [sku]: { overseasSupplyPools:[], factoryPools:[] } }
  //   }
  function mapWeeklyHarvestToBatchRequest(harvest) {
    aType(isObj(harvest), 'harvest must be an object');
    var scope = isObj(harvest.businessScope) ? harvest.businessScope : {};
    var issues = [];
    var formulaVersion = nonEmpty(harvest.formulaVersion) ? str(harvest.formulaVersion) : DEFAULT_FORMULA_VERSION;
    var sourceDataAsOf = harvest.sourceDataAsOf === undefined ? null : harvest.sourceDataAsOf;

    var kmaf = harvest.kmaf;
    // ---- THE PREDICATES, evaluated and RECORDED (§A.2/§G). The gate below is the same boolean it has
    // always been; what changes is that each half of it is now a named fact with a true/false answer instead of
    // a condition that collapses into one bare `false`. -----------------------------------------------------
    var predicates = [];
    function pred(name, required, passed, detail) {
      predicates.push({ name: name, required: required === true, passed: passed === true, detail: str(detail) });
      return passed === true;
    }
    var warnings = [];
    var scopeIdent = { company: str(scope.company), country: str(scope.country) };

    var pKmafPresent = pred('KMAF_PRESENT', true, isObj(kmaf), isObj(kmaf) ? 'kmaf is an object' : 'kmaf is ' + (kmaf === undefined ? 'undefined' : typeof kmaf));
    var pKmafReady = pred('KMAF_READY', true, isObj(kmaf) && kmaf.ready !== false, (isObj(kmaf) ? 'kmaf.ready=' + kmaf.ready : 'no kmaf'));
    var pFactsArray = pred('KMAF_RECEIVER_FACTS_ARRAY', true, isObj(kmaf) && Array.isArray(kmaf.receiverFacts),
      isObj(kmaf) ? 'receiverFacts is ' + (Array.isArray(kmaf.receiverFacts) ? 'an array(' + kmaf.receiverFacts.length + ')' : typeof kmaf.receiverFacts) : 'no kmaf');
    // NON-BLOCKING, and deliberately so: an EMPTY receiverFacts array has always passed this gate, and 61_
    // refuses the empty universe downstream with its own REQUESTED_SCOPE_EMPTY. Recorded, never re-gated.
    pred('KMAF_RECEIVER_FACTS_NON_EMPTY', false, isObj(kmaf) && Array.isArray(kmaf.receiverFacts) && kmaf.receiverFacts.length > 0,
      isObj(kmaf) && Array.isArray(kmaf.receiverFacts) ? kmaf.receiverFacts.length + ' receiver fact(s)' : 'not an array');
    pred('PLANNING_CYCLE_PRESENT', false, nonEmpty(harvest.planningCycle), 'planningCycle=' + (str(harvest.planningCycle) || 'BLANK'));
    pred('SCOPE_COMPANY_PRESENT', false, nonEmpty(scope.company), 'company=' + (str(scope.company) || 'BLANK'));
    pred('SCOPE_COUNTRY_PRESENT', false, nonEmpty(scope.country), 'country=' + (str(scope.country) || 'BLANK'));
    // SOURCE_DATA_AS_OF is NOT a readiness predicate here and never has been (executed both ways: blank, null
    // and a real date all yield ready:true, all else equal). It is reported because it is consumed downstream —
    // weeklyAiPlanShipDate_ derives the ship date from it, so a blank one yields a blank ship date and a lane
    // with no resolvable ETA. A WARNING, not a gate: inventing a gate for it would be a behaviour change with
    // no spec behind it, and inventing a value for it is forbidden outright.
    if (!nonEmpty(sourceDataAsOf)) {
      warnings.push(readinessIssue({
        code: READINESS_CODES.SOURCE_DATA_AS_OF_MISSING, blocking: false, kind: 'DATA',
        field: 'sourceDataAsOf', stage: 'HARVEST',
        expected: 'the source-data cutoff carried by a surviving recommendation-workspace line (YYYY-MM-DD)',
        actual: sourceDataAsOf === null ? 'null' : (sourceDataAsOf === '' ? 'blank' : sourceDataAsOf),
        source_table: 'recommendation workspace (derived; see gap run lineage for the STORED value)',
        source_header: 'sourceDataAsOf',
        affected_scope: scopeIdent
      }));
    }
    pred('SOURCE_DATA_AS_OF_PRESENT', false, nonEmpty(sourceDataAsOf), nonEmpty(sourceDataAsOf) ? 'present' : 'blank/null (NON-BLOCKING here)');

    // ---- 61_'s own non-fatal harvest errors, if the caller passed them through. Before R1 the harvest
    // collected FORECAST_SHARE_INCOMPLETE / WORKSPACE_NOT_OK per site and then dropped the array on its
    // SUCCESS return, so the one fact identifying WHICH site and WHY never left the server. ---------------
    var harvestErrs = Array.isArray(harvest.errors) ? harvest.errors : [];
    var carried = harvestErrs.map(function (e) { return fromEngineIssue(e, 'HARVEST', scopeIdent); });

    // Fail-closed: the single (company,country) §7 call is all-or-nothing (any receiver issue → ready:false). A
    // partial universe would corrupt the §7 denominator, so the whole batch is refused.
    // THE SAME BOOLEAN. Only the answer's SHAPE changed.
    if (!pKmafPresent || !pKmafReady || !pFactsArray) {
      var eng = (isObj(kmaf) && Array.isArray(kmaf.issues) ? kmaf.issues : []).map(function (e) { return fromEngineIssue(e, 'KMAF', scopeIdent); });
      var out = carried.concat(eng);
      // §C.1/§C.2 — ready:false with an empty issues list is UNREPRESENTABLE. When KMAF refused with no
      // per-receiver issues it still told us why in `reason` (PLANNING_FACTS_NOT_READY = zero receivers), and
      // that is what used to be discarded here. If even the reason is absent, the gate's own failing predicate
      // is named, so there is always at least one issue.
      // The KMAF REASON is additional information exactly when KMAF produced no per-receiver issues of its
      // own — it sets `reason = issues[0].code` otherwise, so adding it then would duplicate. Note the
      // condition is on `eng`, NOT on `out`: a harvest that already reported a per-site drop STILL needs the
      // universe-level effect stated, or the answer names the cause without the consequence. Both, always.
      if (!eng.length) {
        var reason = (isObj(kmaf) && nonEmpty(kmaf.reason)) ? str(kmaf.reason)
          : (!pKmafPresent ? 'KMAF_NOT_READY' : (!pFactsArray ? 'KMAF_NOT_READY' : 'PLANNING_FACTS_NOT_READY'));
        out = out.concat([readinessIssue({
          engine_code: reason, stage: 'KMAF',
          field: !pFactsArray ? 'kmaf.receiverFacts' : 'kmaf.receiverFacts[]',
          expected: 'at least one receiver fact for the requested (company, country) universe',
          actual: reason === 'PLANNING_FACTS_NOT_READY'
            ? 'zero receiver facts and zero receiver issues — every site was dropped before KMAF was called'
            : 'KMAF produced no usable result',
          source_table: 'fc_regular_forecast',
          source_header: 'company, country, marketplace, sku, year + the month column for each of M+1..M+4',
          affected_scope: scopeIdent
        })]);
      }
      // The HEADLINE is the first blocking issue, which is the harvest's site-level cause when there is one
      // and the KMAF universe-level reason otherwise. A refusal that leads with the effect sends the reader
      // looking in the wrong place.
      var reasonCode = out.filter(function (i) { return i.blocking; })[0];
      return {
        ready: false, reason: reasonCode ? reasonCode.code : READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,
        issues: out, warnings: warnings, predicates: predicates, request: null
      };
    }

    // planningFacts index (recovers sku / siteSku / unitsPerCarton — absent on receiverFact) by demandRef.
    var pfByRef = {};
    (kmaf.planningFacts || []).forEach(function (pf) { if (nonEmpty(pf.demandRef)) pfByRef[str(pf.demandRef)] = pf; });

    var horizonsByRef = isObj(harvest.horizonsByDemandRef) ? harvest.horizonsByDemandRef : {};
    var poolsBySku = isObj(harvest.poolsBySku) ? harvest.poolsBySku : {};

    var bySku = {}, skuOrder = [];
    for (var i = 0; i < kmaf.receiverFacts.length; i++) {
      var rf = kmaf.receiverFacts[i];
      var ref = str(rf.demandRef);
      var pf = pfByRef[ref];
      if (!pf) {
        // R1: the legacy `{ kind, reason }` shape is REPLACED by the typed one rather than duplicated - a
        // caller reading two shapes for one fact is how a UI ends up showing a raw token.
        issues.push(readinessIssue({
          engine_code: 'RECEIVER_WITHOUT_PLANNING_FACT', stage: 'MAPPER', field: 'planningFacts[demandRef]',
          expected: 'a planning fact for every receiver fact, joined on demandRef',
          actual: 'no planning fact for this demandRef',
          affected_scope: { company: str(scope.company), country: str(scope.country), demandRef: ref }
        }));
        continue;
      }
      var sku = nonEmpty(pf.masterSku) ? str(pf.masterSku) : str(pf.sku);
      var dest = str(rf.destinationWarehouseId);
      var mkt = str(rf.marketplace);
      var h = horizonsByRef[ref];
      // A site KMAF included but with no horizon shortage → no weekly demand for it; skip (not an error).
      if (!isObj(h) || !isObj(h.cumulativeGapByWindow)) { continue; }
      var dd = num(rf.dailyDemand);
      var survival = (dd === null) ? 0 : Math.ceil(SURVIVAL_HORIZON_DAYS * dd);   // frozen ceil(18×dailyDemand)

      var lane = {
        siteSku: str(pf.siteSku), destinationWarehouseId: dest, marketplace: mkt,
        company: str(scope.company), country: str(scope.country),
        cumulativeGapByWindow: h.cumulativeGapByWindow,
        requiredByByWindow: isObj(h.requiredByByWindow) ? h.requiredByByWindow : {},
        unitsPerCarton: pf.unitsPerCarton,
        survivalNeedQty: survival,
        demandWeight: num(rf.demandWeight) === null ? 0 : num(rf.demandWeight),   // §7 site share, verbatim from KMAF
        fulfillmentModel: str(rf.fulfillmentModel),
        eligiblePoolTypes: Array.isArray(rf.eligiblePoolTypes) ? rf.eligiblePoolTypes.slice() : [],
        allocationPriority: num(rf.allocationPriority) === null ? 0 : num(rf.allocationPriority)
      };
      if (!bySku[sku]) { bySku[sku] = []; skuOrder.push(sku); }
      bySku[sku].push(lane);
    }

    skuOrder.sort();
    var skus = skuOrder.map(function (sku) {
      var pools = isObj(poolsBySku[sku]) ? poolsBySku[sku] : {};
      return {
        masterSku: sku,
        overseasSupplyPools: Array.isArray(pools.overseasSupplyPools) ? pools.overseasSupplyPools : [],
        factoryPools: Array.isArray(pools.factoryPools) ? pools.factoryPools : [],
        lanes: bySku[sku]
      };
    });

    var request = {
      planningCycle: str(harvest.planningCycle),
      businessScope: { company: str(scope.company), country: str(scope.country), source_page: str(scope.source_page) },
      mode: harvest.mode, confirmRegenerateOverUserEdits: harvest.confirmRegenerateOverUserEdits === true,
      actor: harvest.actor, now: harvest.now,
      sourceDataAsOf: sourceDataAsOf, formulaVersion: formulaVersion,
      factoryIdentityConfig: harvest.factoryIdentityConfig, warehousesById: harvest.warehousesById,
      skus: skus
    };

    // NON-BLOCKING, recorded: a universe that joined to zero SKUs. It has always passed this gate and 61_
    // refuses it downstream by name; re-gating it here would change the decision.
    pred('SKU_LANES_NON_EMPTY', false, skus.length > 0, skus.length + ' sku group(s) after the join');
    var allIssues = carried.concat(issues);
    allIssues.sort(function (a, b) {
      return (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
        (a.engine_code < b.engine_code ? -1 : a.engine_code > b.engine_code ? 1 : 0);
    });
    // THE DECISION IS UNCHANGED: reaching here has always meant ready:true, join issues and all. `carried`
    // holds the harvest's own per-site drops, which are REPORTED at this level too — a run can legitimately be
    // ready while some sites were dropped, and before R1 nobody downstream could see that had happened.
    var blockingNow = allIssues.filter(function (i) { return i.blocking; });
    return {
      ready: true, reason: null, issues: allIssues, warnings: warnings, predicates: predicates,
      partial: blockingNow.length > 0, request: request
    };
  }

  return {
    mapWeeklyHarvestToBatchRequest: mapWeeklyHarvestToBatchRequest,
    resolveWorkspaceLineDestination: resolveWorkspaceLineDestination,
    SURVIVAL_HORIZON_DAYS: SURVIVAL_HORIZON_DAYS,
    // F1-7N-FC-1B-E3-R1 - the readiness vocabulary, exported so the server and the page name the same codes
    // rather than each keeping a copy.
    READINESS_CODES: READINESS_CODES,
    ENGINE_TO_READINESS: ENGINE_TO_READINESS,
    ENGINE_TRANSPORT: ENGINE_TRANSPORT,
    readinessIssue: readinessIssue,
    fromEngineIssue: fromEngineIssue,
    _version: 'f1-7n-fc-1b-e3-r1-readiness'
  };
});
