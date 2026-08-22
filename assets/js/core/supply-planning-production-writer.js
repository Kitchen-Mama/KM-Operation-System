// Kitchen Mama Operation System — PRODUCTION Recommendation Draft Writer composition (Phase 2C, Round 1S-P3).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC composition that completes the production WRITE path by binding the frozen production source
// facts to the frozen LOCKED persistence pipeline — WITHOUT authoring any new business/persistence logic:
//   production facts (KMPS.resolveProductionFacts) → the frozen Orchestrator (KMORCH.runRecommendationGeneration:
//     active-draft lookup → Core replay → Plan Builder → Persistence Plan Builder → LOCKED apply via KMPL + KMPR)
//   → the four editable Recommendation Draft tables (shipping_allocation_drafts/_lines,
//     request_order_allocation_drafts/_lines). It writes ONLY those Draft workspaces.
//
// It owns NO Calculation / Ledger / Allocation / recommendation / carton formula, NO active-draft resolution
// (KMPR), NO lock policy (KMPL), NO plan diffing (KMPPB), NO reconcile/user-edit rule (KMPC/KMPR) — every decision
// is delegated to the already-frozen, test-verified modules. It NEVER Submits, NEVER promotes a Weekly Plan,
// NEVER creates a Request Order / PO / Shipment, NEVER reserves/deducts inventory, and NEVER populates
// submitted_by/submitted_at. No SpreadsheetApp / LockService / Date.now / Math.random / locale here (the `.gs`
// injects SpreadsheetApp + LockService; tests inject fakes); input never mutated.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-recommendation-orchestrator.js') : (root.KMORCH || (root.KM && root.KM.recommendationOrchestrator)),
    req ? req('./supply-planning-persistence-locking.js') : (root.KMPL || (root.KM && root.KM.persistenceLocking)),
    req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)),
    req ? req('./supply-planning-production-source.js') : (root.KMPS || (root.KM && root.KM.productionSource)),
    req ? req('./supply-planning-production-safety.js') : (root.KMSAFE || (root.KM && root.KM.productionSafety))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.productionWriter = api; }
})(this, function (KMORCH, KMPL, KMPR, KMPS, KMSAFE) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }

  // ---- exact frozen Draft-table schemas (Round 1S-P3 §2) — canonical header order; used only to SEED an -----
  // in-memory sheet-set for tests / node callers (the `.gs` ensures the same headers via its ensure-table path).
  var DRAFT_HEADERS = {
    WEEKLY_SHIPPING: {
      header: ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
        'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_source_warehouse_code_snapshot',
        'recommended_destination_warehouse_code_snapshot', 'recommendation_group_no', 'recommended_shipping_method',
        'recommended_last_mile_delivery', 'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at',
        'source_data_as_of', 'draft_version', 'created_by', 'created_at', 'updated_by', 'updated_at', 'submitted_by',
        'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'],
      lines: ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code', 'window_start_date',
        'window_end_date', 'required_by_date', 'regular_demand_snapshot', 'special_event_demand_snapshot',
        'destination_stock_snapshot', 'qualified_incoming_snapshot', 'approved_supply_snapshot', 'calculated_gap_qty',
        'source_initial_available_qty_snapshot', 'source_available_before_allocation_snapshot', 'allocation_sequence',
        'recommendation_reason', 'recommendation_flags', 'recommended_qty',
        // F1-7N-FA-3C-R6F1 — per-source axis at the CANONICAL LIVE position (after recommended_qty, BEFORE the user
        // Execution Plan). Byte-for-byte live 30-col order (djb2 '|' = e4880646). The prior R3C2 tail column
        // `source_allocated_qty_snapshot` is NOT in the live schema (accidental source-only 31st field) and is REMOVED
        // so the seed/ensure authority equals the live 30-col schema exactly. KMPB still computes the per-source
        // allocated qty internally to drive planned_qty; it is simply NOT persisted (the name-based writer drops any
        // key absent from this canonical header). The shipping-line validator is EXACT (no trailing-extra tolerance).
        'source_warehouse_id', 'source_warehouse_code_snapshot',
        'planned_qty', 'units_per_carton', 'route_no', 'line_status', 'override_reason', 'note', 'created_at', 'updated_at']
    },
    MONTHLY_ORDER: {
      header: ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku',
        'category_snapshot', 'series_snapshot', 'status', 'generation_type', 'draft_purpose', 'calculation_run_id',
        'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version', 'created_by', 'created_at',
        'updated_by', 'updated_at', 'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'],
      lines: ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket',
        'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot',
        'third_party_available_qty_snapshot', 'qualified_incoming_snapshot', 'approved_supply_snapshot',
        'factory_available_qty_snapshot', 'target_pct_snapshot', 'calculated_gap_qty_snapshot',
        'recommended_shipping_qty_snapshot', 'residual_production_required_snapshot', 'reallocation_in_qty_snapshot',
        'reallocation_out_qty_snapshot', 'net_order_need_snapshot', 'recommended_qty', 'order_qty', 'carton_qty',
        'units_per_carton', 'allocation_method', 'recommendation_reason', 'recommendation_flags', 'line_status',
        'submitted_by', 'submitted_at', 'note', 'created_at', 'updated_at']
    }
  };

  // Seed a fresh in-memory sheet-set with the canonical Draft + run-journal headers (rows empty). Deterministic.
  function seedSheetSet(type) {
    aType(DRAFT_HEADERS[type], 'seedSheetSet: unknown recommendationType: ' + type);
    var cfg = KMPR.TABLES[type];
    var seed = {};
    seed[cfg.header] = { headers: DRAFT_HEADERS[type].header.slice(), rows: [] };
    seed[cfg.lines] = { headers: DRAFT_HEADERS[type].lines.slice(), rows: [] };
    seed[KMPR.RUN_JOURNAL_TABLE] = { headers: KMPR.RUN_JOURNAL_HEADERS.slice(), rows: [] };
    return KMPR.createSheetSet(seed);
  }

  // Build the Orchestrator deps over an in-memory sheet-set + injected lock + canonical spreadsheet (the node /
  // test twin of the `.gs` handler). Every stage delegates to a frozen module; NO new logic. The lock is
  // re-read UNDER the lock (never the pre-lock snapshot) via KMPL's revalidation contract.
  //   env = { sheetSet, canonicalSpreadsheet, request, lock:{ acquire():bool, release():void } }
  function sheetSetDeps(env) {
    aType(isObj(env) && isObj(env.sheetSet), 'sheetSetDeps: env.sheetSet required');
    aType(isObj(env.request), 'sheetSetDeps: env.request required');
    aType(isObj(env.lock) && typeof env.lock.acquire === 'function' && typeof env.lock.release === 'function', 'sheetSetDeps: env.lock.acquire/release required');
    var type = env.request.recommendationType;
    var query = { recommendationType: type, planningCycle: env.request.planningCycle, businessScope: env.request.businessScope };
    return {
      loadActiveContext: function (q) { return KMPR.loadActiveDraftContext(env.sheetSet, q || query); },
      loadPriorSnapshot: function (id) { return KMPR.loadDraftSnapshot(env.sheetSet, id, type); },
      computeFacts: function () { return KMPS.resolveProductionFacts(env.canonicalSpreadsheet, env.request); },
      lockedApply: function (plan, expectedToken, opts) {
        return KMPL.executeLockedPersistence({
          plan: plan, expectedToken: expectedToken, opts: opts, generationType: opts.generationType,
          deps: {
            validatePlan: function (p) { return KMPR.validatePersistencePlan(p); },
            acquireLock: function () { return env.lock.acquire() === true; },
            releaseLock: function () { return env.lock.release(); },
            loadActiveDraftContext: function () { return KMPR.loadActiveDraftContext(env.sheetSet, query); },
            reloadSnapshot: function () { return KMPR.loadDraftSnapshot(env.sheetSet, plan.draftId, type); },
            recomputeToken: function (snap) {
              var dv = snap.draft ? snap.draft.draft_version : plan.draftVersion;
              return KMPR.computeExpectedToken(dv, (snap.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
            },
            applyPlan: function (tok, o) { return KMPR.applyPersistencePlan(env.sheetSet, plan, tok, o || opts || {}); }
          }
        });
      }
    };
  }

  // ---- Production Safety Round S0 — pre-write schema validation (validate, NEVER repair/create) -------------
  // The five authorized Recommendation persistence tables, each with its frozen expected Header. Line tables carry
  // ADDITIVE columns (user_edited/user_edited_by) beyond DRAFT_HEADERS.lines, so extra columns are ALLOWed (the
  // table's additive contract) while missing/blank/duplicate/reordered required Headers still fail closed.
  // F1-7N-FA-3C-PRE3-R3 — validate ONLY the tables the requested recommendationType actually writes (its own
  // header+lines) plus the shared run journal. A given type never reads or writes the OTHER type's draft tables
  // (the write set is exactly [cfg.header, cfg.lines, RUN_JOURNAL] — see the orchestrator), so a stale UNRELATED
  // schema (e.g. a WEEKLY_SHIPPING shipping_allocation_* sheet) must NOT hard-gate a MONTHLY_ORDER draft. An absent
  // or unknown recommendationType validates ALL authorized tables (backward-compatible with any type-agnostic
  // caller). This narrows the validation SCOPE only — it changes no header contract and weakens no fail-closed
  // guard for a table that IS written.
  function draftTableSpecs_(type) {
    var t = KMPR.TABLES[type], h = DRAFT_HEADERS[type];
    // F1-7N-FA-3C-R6F1 (rule 9): the 30-vs-31 line drift is fixed AT THE AUTHORITY — DRAFT_HEADERS.WEEKLY_SHIPPING.lines
    // is now the EXACT live 30-col schema (accidental R3C2 source_allocated_qty_snapshot removed), so the phantom column
    // can never be written and the mismatch is not concealed by a tolerant gate. EXACT enforcement (order-sensitive) is
    // delivered by the runtime validator (TEMP_R6F line_schema_exact_30) + the atomic write gate (sadExactSchemaReason_,
    // 16_). This write-gate keeps extraColumnsPolicy 'ALLOW' SOLELY to honor the canonical, DECLARED line-additive
    // contract (KMPR.LINE_ADDITIVE_HEADERS = user_edited/user_edited_by) — a documented optional extension, NOT the drift.
    return [
      { sheetName: t.header, expectedHeaders: h.header, required: true, extraColumnsPolicy: 'ALLOW' },
      { sheetName: t.lines, expectedHeaders: h.lines, required: true, extraColumnsPolicy: 'ALLOW' }
    ];
  }
  function authorizedTableSpecs(recommendationType) {
    var journal = { sheetName: KMPR.RUN_JOURNAL_TABLE, expectedHeaders: KMPR.RUN_JOURNAL_HEADERS, required: true, extraColumnsPolicy: 'ALLOW' };
    if (recommendationType && KMPR.TABLES[recommendationType] && DRAFT_HEADERS[recommendationType]) {
      return draftTableSpecs_(recommendationType).concat([journal]);
    }
    return draftTableSpecs_('WEEKLY_SHIPPING').concat(draftTableSpecs_('MONTHLY_ORDER')).concat([journal]);
  }

  // Validate all five authorized Draft/journal table schemas against a live-shaped Spreadsheet BEFORE any
  // lock/write. Read-only via KMSAFE (getSheetByName + getValues); performs ZERO mutation and NEVER creates or
  // repairs a Sheet. A missing REQUIRED table → SCHEMA_NOT_PROVISIONED (the writer must never provision it). A
  // blank required Header → HEADER_BLANK. Returns a JSON-safe {ready, spreadsheetId, tables, blockers}.
  function validateAuthorizedRecommendationSchemas(spreadsheet, opts) {
    aType(isObj(opts) && str(opts.expectedSpreadsheetId) !== '', 'validateAuthorizedRecommendationSchemas: opts.expectedSpreadsheetId required (exact-ID gate)');
    var idCheck = KMSAFE.checkExpectedSpreadsheetId(spreadsheet, opts.expectedSpreadsheetId);
    var tables = {}, blockers = [];
    // F1-7N-FA-3C-R2b-2 — a caller (the MONTHLY_ORDER flat-V2 shape adapter) may inject the exact authorized-table
    // specs to validate (e.g. the 53-col flat request_order_allocation_drafts + run journal, EXCLUDING the retired
    // child-line table and both shipping tables). When absent, behavior is byte-identical to PRE3-R3 (type-scoped
    // or all-tables). This narrows/redirects the validation SET only; it weakens no fail-closed guard.
    var specs = (Array.isArray(opts.tableSpecsOverride) && opts.tableSpecsOverride.length) ? opts.tableSpecsOverride : authorizedTableSpecs(opts.recommendationType);
    specs.forEach(function (spec) {   // F1-7N-FA-3C-PRE3-R3 — scope to the type being generated (else all)
      var report;
      if (!idCheck.ok) {
        report = { ready: false, sheetName: spec.sheetName, schemaStatus: KMSAFE.SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, issues: [{ reason: KMSAFE.SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET }] };
      } else {
        report = KMSAFE.validateCanonicalTable(spreadsheet, {
          sheetName: spec.sheetName, expectedHeaders: spec.expectedHeaders,
          expectedSpreadsheetId: opts.expectedSpreadsheetId, extraColumnsPolicy: spec.extraColumnsPolicy
        });
        // a missing authorized table is a provisioning gap the writer must NOT fix — normalize to SCHEMA_NOT_PROVISIONED.
        if (report.schemaStatus === KMSAFE.SCHEMA_STATUS.SHEET_MISSING) { report.schemaStatus = KMSAFE.SCHEMA_STATUS.SCHEMA_NOT_PROVISIONED; report.issues = [{ reason: KMSAFE.SCHEMA_STATUS.SCHEMA_NOT_PROVISIONED }]; report.ready = false; }
      }
      report.required = spec.required;
      tables[spec.sheetName] = report;
      if (spec.required && !report.ready) blockers.push({ table: spec.sheetName, schemaStatus: report.schemaStatus });
    });
    return { ready: blockers.length === 0, spreadsheetId: idCheck.spreadsheetId || '', tables: tables, blockers: blockers };
  }

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  // Hard gate for the live generate handler: throw fail-closed BEFORE acquiring the lock when any authorized table
  // schema is not provisioned/valid or the Spreadsheet target is wrong. Never mutates.
  function assertAuthorizedSchemasReady(spreadsheet, opts) {
    var v = validateAuthorizedRecommendationSchemas(spreadsheet, opts);
    if (!v.ready) { var e = new Error('RECOMMENDATION_SCHEMA_NOT_READY: ' + v.blockers.map(function (b) { return b.table + '=' + b.schemaStatus; }).join('; ')); e.schemaValidation = v; throw e; }
    return v;
  }

  // Public writer API: run the frozen locked generation and shape a JSON-safe production persistence result.
  // `deps` is the injected orchestrator dependency set (the `.gs` builds it over real Sheets + LockService;
  // tests build it via sheetSetDeps over an in-memory set + a fake lock). This function adds NO algorithm — it
  // delegates to KMORCH and only labels the persistence outcome (READ-only callers use KMPS, not this).
  function persistProductionRecommendation(command, deps) {
    aType(isObj(command), 'persistProductionRecommendation: command required');
    aType(isObj(deps) && typeof deps.computeFacts === 'function' && typeof deps.lockedApply === 'function', 'persistProductionRecommendation: deps.computeFacts/lockedApply required');
    var result = KMORCH.runRecommendationGeneration(command, deps);
    var wrote = result.wrote === true && result.status === 'COMPLETED';
    var cfg = KMPR.TABLES[command.recommendationType];
    result.persistenceStatus = wrote ? 'COMPLETED' : 'NOT_EXECUTED';
    result.writtenTables = wrote && cfg ? [cfg.header, cfg.lines, KMPR.RUN_JOURNAL_TABLE] : [];
    return result;
  }

  // Convenience end-to-end entry for node/test callers: seed nothing (caller supplies sheetSet), run the write.
  function persistToSheetSet(env) {
    var deps = sheetSetDeps(env);
    return persistProductionRecommendation({
      recommendationType: env.request.recommendationType, mode: env.request.mode,
      planningCycle: env.request.planningCycle, businessScope: env.request.businessScope,
      confirmRegenerateOverUserEdits: env.request.confirmRegenerateOverUserEdits === true,
      actor: env.request.actor || 'system', now: env.request.now || ''
    }, deps);
  }

  return {
    DRAFT_HEADERS: DRAFT_HEADERS,
    seedSheetSet: seedSheetSet,
    sheetSetDeps: sheetSetDeps,
    persistProductionRecommendation: persistProductionRecommendation,
    persistToSheetSet: persistToSheetSet,
    authorizedTableSpecs: authorizedTableSpecs,
    validateAuthorizedRecommendationSchemas: validateAuthorizedRecommendationSchemas,
    assertAuthorizedSchemasReady: assertAuthorizedSchemasReady
  };
});
