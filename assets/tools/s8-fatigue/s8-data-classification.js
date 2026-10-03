/* ================================================================================================================
 * KMS8CLASS — S8 FATIGUE PRODUCTION DATA SAFETY BOUNDARY  (S8-R2 §1/§2/§3/§4/§5)
 * ----------------------------------------------------------------------------------------------------------------
 * THE AUTHORIZED WRITE SURFACE IS A CLOSED LIST, AND EVERYTHING NOT ON IT IS A STOP.
 *
 * S8 exists to fatigue the OPERATIONAL MAINLINE — gap → request order → purchase order → shipping plan →
 * shipment → reservation/dispatch/receipt → inventory → read models. It is NOT permission to mutate the
 * Production master and reference data that mainline reads from. The operator drew that line explicitly in
 * S8-R2 §1, and this module is where the line lives so that no later round has to remember it.
 *
 * THIS MODULE FAILS CLOSED, which is the whole point. `classify()` of a table nobody registered returns
 * UNAUTHORIZED_UNKNOWN, and `authorizeWrite()` refuses it. A fatigue scenario that reaches a table this
 * registry has never heard of does not proceed on the assumption that it is probably fine; it stops and
 * produces the §5 approval request. Adding a table here is a deliberate edit that a human reviews — which is
 * exactly the property that "technically writable" does not have.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * WHY CLASS AND CLEANUP POLICY ARE TWO SEPARATE AXES.
 *
 * §4 asks for one of five classes per table. Five classes cannot also express what cleanup does, because the
 * two questions are genuinely independent: `factory_stock_movements` holds rows a test caused (so its class is
 * TEST_OWNED_TRANSACTION) and those rows must NEVER be deleted (so its policy is RETAIN). Collapsing those into
 * one word would force a lie in one direction or the other. So every table carries both, and the suite asserts
 * the pairs that are forbidden.
 *
 * A NOTE ON WHAT "TEST_OWNED_TRANSACTION" MEANS, because it is easy to misread. It does not say the TABLE
 * belongs to tests — `request_orders` holds real business orders. It says the ROWS A FATIGUE RUN CREATES in that
 * table are owned by that run and are, subject to policy, its to clean up. Ownership is per row and is decided
 * by lineage (KMS8RUN), never by the table name.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * THE INVENTORY DECISION (§2), AND WHY IT IS NOT A WEAKENING.
 *
 * S8-R1 required exact pre-test balance restoration for `factory_stock` / `overseas_inventory_snapshot`. The
 * operator has replaced that with RUNTIME RECONCILIATION + OPERATOR CANONICAL RE-IMPORT, because a canonical
 * re-import is a stronger recovery than an arithmetic inverse: it restores the number from the source of truth
 * rather than from the harness's own bookkeeping, so it is correct even if the harness's bookkeeping was wrong.
 *
 * What did NOT change, and is enforced here rather than left to good intentions:
 *   - writes reach these two tables ONLY through canonical runtime owners (an action), never as a cell write;
 *   - the movement ledgers keep the lineage, and are never a delete target;
 *   - every touched inventory identity is recorded in the run manifest, whether or not it is ever restored.
 *
 * `directCellWriteAuthorized()` returns false for EVERY table in this registry, including the authorized ones.
 * There is no table this harness may poke a cell in. That is a stronger statement than the authorization list,
 * and it is the one that makes "only through canonical runtime owners" checkable instead of aspirational.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * THE GAP TABLES (§6) ARE READ_ONLY_DERIVED, AND THAT IS A FINDING, NOT A DEFAULT.
 *
 * They ARE written in production — `gapUpsertByKey_` materializes them. They are classified READ_ONLY_DERIVED
 * *to this harness* because S8-R2 §6 determined gap write fatigue is not yet safe: see GAP_FINDING below. The
 * canonical owner may rewrite them whenever it likes; the harness may not touch them at all.
 *
 * NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. This file is a pure registry.
 * ================================================================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KMS8CLASS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONTRACT = 'S8-R2 — S8 fatigues the operational mainline only. Master/reference data is READ-ONLY to the '
    + 'harness. factory_stock and overseas_inventory_snapshot are REBUILDABLE_OPERATIONAL_STATE, writable only '
    + 'through canonical runtime owners, recovered by runtime reconciliation plus an operator canonical '
    + 're-import. Movement ledgers are permanent. The gap tables are excluded from write fatigue. Any table not '
    + 'in this registry is UNAUTHORIZED_UNKNOWN and is a STOP.';

  // ---- the five classes §4 requires ----------------------------------------------------------------------
  var CLASS = {
    PROTECTED_MASTER: 'PROTECTED_MASTER',
    TEST_OWNED_TRANSACTION: 'TEST_OWNED_TRANSACTION',
    REBUILDABLE_OPERATIONAL_STATE: 'REBUILDABLE_OPERATIONAL_STATE',
    READ_ONLY_DERIVED: 'READ_ONLY_DERIVED',
    UNAUTHORIZED_UNKNOWN: 'UNAUTHORIZED_UNKNOWN'
  };

  // ---- the orthogonal cleanup axis §10 requires ------------------------------------------------------------
  //   DELETE_CANDIDATE  may be proposed for deletion, but ONLY through the manifest (KMS8CLEAN)
  //   RETAIN            rows a run created stay forever; they are evidence, and for the movement ledgers they
  //                     are also the derivation of the reserved balance (21_:448)
  //   RECONCILE         not deleted and not restored by arithmetic; verified, then recovered by operator re-import
  //   NEVER_TOUCH       the harness neither writes nor deletes; it may read
  var POLICY = {
    DELETE_CANDIDATE: 'DELETE_CANDIDATE',
    RETAIN: 'RETAIN',
    RECONCILE: 'RECONCILE',
    NEVER_TOUCH: 'NEVER_TOUCH'
  };

  var INVENTORY_RECOVERY_MODEL = 'RUNTIME RECONCILIATION + OPERATOR CANONICAL RE-IMPORT';

  function T(name, cls, policy, why) { return { table: name, cls: cls, policy: policy, why: why }; }

  var M = CLASS.PROTECTED_MASTER, X = CLASS.TEST_OWNED_TRANSACTION,
      B = CLASS.REBUILDABLE_OPERATIONAL_STATE, D = CLASS.READ_ONLY_DERIVED;
  var DEL = POLICY.DELETE_CANDIDATE, RET = POLICY.RETAIN, REC = POLICY.RECONCILE, NEV = POLICY.NEVER_TOUCH;

  // =============================================================================================================
  // THE REGISTRY — 58 physical tables, every one the backend touches plus every canonical recommendation input.
  // Derived from: the sheet-name literals in assets/specs/active/apps-script/*.gs, and CANONICAL_TABLES in
  // assets/js/core/supply-planning-production-source.js. Not from memory.
  // =============================================================================================================
  var REGISTRY = [
    // ---- §1 PROTECTED_PRODUCTION_DATA_SET — operator-named ---------------------------------------------------
    T('sku_details', M, NEV, 'operator §1 — SKU master'),
    T('sku_regional_details', M, NEV, 'operator §1 — SKU Regional Details backing data'),
    T('marketplaces', M, NEV, 'operator §1'),
    T('marketplace_skus', M, NEV, 'operator §1 — site identity master; also the gap key source'),
    T('pricing_list', M, NEV, 'operator §1; additionally behind PRODUCT_STRATEGY_BOARD_ENABLED_ (00_config:88)'),
    T('fc_regular_forecast', M, NEV, 'operator §1'),
    T('fc_special_events', M, NEV, 'operator §1'),
    T('campaigns', M, NEV, 'operator §1'),
    T('campaign_sku_lines', M, NEV, 'operator §1'),
    T('warehouses', M, NEV, 'operator §1'),
    T('tax_rate_components', M, NEV, 'operator §1'),
    T('tax_referral_rates', M, NEV, 'operator §1'),
    // ---- §1 "also protected unless separately authorized" -----------------------------------------------------
    T('pricing_change_log', M, NEV, 'the append-only log of pricing_list; protected with its table'),
    T('fc_target_rules', M, NEV, 'forecast master — same family as fc_regular_forecast / fc_special_events'),
    T('logistics_locations', M, NEV, 'reference master'),
    T('company_legal_entities', M, NEV, 'operator §1 — company/entity master data'),
    T('carriers', M, NEV, 'operator §1 — carrier/reference master'),
    T('carrier_rate_cards', M, NEV, 'operator §1 — carrier/reference master'),
    T('carrier_lead_times', M, NEV, 'operator §1 — carrier/reference master'),
    T('shipment_route_templates', M, NEV, 'route reference master'),
    T('shipment_route_template_nodes', M, NEV, 'route reference master'),
    T('document_templates', M, NEV, 'reference master, AND the Drive output-folder root authority (38_:18) — '
      + 'editing it would redirect where REAL documents are written'),
    T('document_template_fields', M, NEV, 'reference master'),
    T('amazon_inventory_snapshot', M, NEV, 'operator §1 — Amazon imported source data'),
    T('amazon_daily_sales_snapshot', M, NEV, 'operator §1 — Amazon daily imported source data; the §22 run-rate basis'),
    T('amazon_weekly_sales_snapshot', M, NEV, 'operator §1 — Amazon imported source data'),
    T('import_sync_runs', M, NEV, 'unattended Amazon sync audit log — truncate+rewrite owner, never a test target'),
    T('import_sync_issues', M, NEV, 'unattended Amazon sync audit log'),
    T('replenishment_demand_allocation_rules', M, NEV, 'legacy master; storage retired to Script Properties (50_), '
      + 'still a canonical read'),

    // ---- §2 REBUILDABLE_OPERATIONAL_STATE — operator-authorized ------------------------------------------------
    T('factory_stock', B, REC, 'operator §2 — mutated only through canonical runtime owners (21_ adjust / reserve / '
      + 'dispatch / receipt); recovered by runtime reconciliation + operator canonical re-import'),
    T('overseas_inventory_snapshot', B, REC, 'operator §2 — mutated only through canonical runtime owners '
      + '(05_ / 31_); recovered by runtime reconciliation + operator canonical re-import'),

    // ---- §3 permanent ledgers — class is TEST_OWNED (a run creates the rows), policy is RETAIN ------------------
    T('factory_stock_movements', X, RET, '§3 — permanent operational/audit evidence; reserved balance is DERIVED '
      + 'from these rows (factoryStockOwnerReservedTx_, 21_:448), so deleting them destroys the balance'),
    T('overseas_inventory_movements', X, RET, '§3 — permanent operational/audit evidence; same derivation in 05_'),
    T('factory_stock_override_audit', X, RET, 'append-only override ledger (71_); the runtime REQUIRES it before it '
      + 'will accept an overage confirmation, and an override whose justification was never written is the exact '
      + 'thing it exists to make impossible'),

    // ---- §4 TEST_OWNED_TRANSACTION — the operational mainline --------------------------------------------------
    T('request_orders', X, DEL, 'ordering mainline root'),
    T('request_order_lines', X, DEL, 'child of request_orders'),
    T('request_order_line_sources', X, DEL, 'child of request_orders — A1 immutable site provenance'),
    T('request_order_site_confirmations', X, DEL, 'child of request_orders'),
    T('request_order_allocation_drafts', X, DEL, 'non-commit draft; no reservation, no movement (DB map §14)'),
    T('request_order_allocation_draft_lines', X, DEL, 'child of request_order_allocation_drafts'),
    T('shipping_allocation_drafts', X, DEL, 'non-commit draft; id is DETERMINISTIC from the business key, so two '
      + 'runs on the same dimensions would legitimately REUSE one row — see KMS8RUN cross-run isolation'),
    T('shipping_allocation_draft_lines', X, DEL, 'child of shipping_allocation_drafts'),
    T('purchase_orders', X, DEL, 'procurement commitment; child of request_orders by request_order_id'),
    T('purchase_order_lines', X, DEL, 'child of purchase_orders'),
    T('shipping_plans', X, DEL, 'decision commit'),
    T('shipping_plan_lines', X, DEL, 'child of shipping_plans'),
    T('shipments', X, DEL, 'execution snapshot — CONDITIONAL: its reservation must be RELEASED through the runtime '
      + 'before the row is removed, or the reservation is orphaned forever'),
    T('shipment_lines', X, DEL, 'child of shipments'),
    T('shipment_line_allocations', X, DEL, 'child of shipment_lines'),
    T('shipment_events', X, DEL, 'child of shipments'),
    T('shipment_routes', X, DEL, 'child of shipments'),
    T('shipment_final_output_snapshots', X, DEL, 'child of shipments'),
    T('shipment_final_output_lines', X, DEL, 'child of shipment_final_output_snapshots'),
    T('shipment_final_output_line_pos', X, DEL, 'child of shipment_final_output_lines'),
    T('generated_documents', X, DEL, 'registry row only — the Drive FILE cannot be deleted (0 setTrashed sites; '
      + 'appsscript.json declares no Drive scope), so the file is retained and removed by the operator'),
    T('recommendation_calculation_runs', X, DEL, 'run journal for the recommendation persistence plan (23_/90_)'),

    // ---- §6 READ_ONLY_DERIVED — written by the canonical owner, never by this harness ---------------------------
    T('inventory_replenishment_gap', D, NEV, '§6 — materialized by 43_/46_ from 21 canonical inputs. Excluded from '
      + 'write fatigue: see GAP_FINDING'),
    T('order_planning_gap', D, NEV, '§6 — materialized by 43_/46_ from 21 canonical inputs. Excluded from write '
      + 'fatigue: see GAP_FINDING')
  ];

  // =============================================================================================================
  // §6 — THE GAP DETERMINATION, recorded as data so the suite can assert it and a later round cannot quietly
  // flip it in prose. Rebuild IS supported. Write fatigue is still NOT safe, and the two are different questions.
  // =============================================================================================================
  var GAP_FINDING = {
    canonical_rebuild_supported: true,
    rebuild_owner: 'inventoryReplenishmentGap.job.start / orderPlanningGap.job.start (46_api_v1_gap_materialization_job.gs) '
      + 'driving the canonical slice processors in 43_api_v1_gap_materialization.gs. Job state lives in Script '
      + 'Properties; the two gap tables remain the only result store.',
    rebuild_scope_modes: ['ALL_SITES', 'CURRENT_COUNTRY', 'CURRENT_SCOPE'],
    rebuild_scope_note: 'Order Planning EXPANDS any sub-company selection to the WHOLE COMPANY, because the factory '
      + 'pool competes company-wide and a partial run must never silently change allocation (46_:79-81). Inventory '
      + 'scopes are independent and are not expanded.',
    rebuild_completeness_provable: true,
    rebuild_completeness_proof: "status === 'DONE' && scopesProcessed === scopesTotal (46_:120, :287). The terminal "
      + 'set is DONE/FAILED/BLOCKED/ERROR/CANCELLED/STALLED, and a job never stays non-terminal (46_:86).',
    deterministic: true,
    deterministic_evidence: 'company-chunked Order Planning yields byte-identical allocation to the monolithic run '
      + '(46_ header); Inventory scopes are independent.',
    canonical_input_count: 21,
    // Of the 21 canonical inputs, these 8 are themselves mutated by operational-mainline fatigue. This is the
    // fact that decides the ordering: a rebuild run before these are canonical reproduces the CONTAMINATION.
    canonical_inputs_mutated_by_fatigue: [
      'factory_stock', 'overseas_inventory_snapshot', 'shipments', 'shipment_lines',
      'shipping_plans', 'shipping_plan_lines', 'purchase_order_lines', 'request_order_line_sources'
    ],
    write_fatigue_safe: false,
    // Each entry is a condition that is NOT met today. All four must be met before write fatigue can be reconsidered.
    write_fatigue_blockers: [
      { code: 'NO_TEST_OWNED_KEY_SPACE',
        detail: 'A gap row is keyed by company|country|marketplace|sku. §1 forbids inserting test rows into '
          + 'sku_details / marketplace_skus, so no test-owned key can exist, so every gap write lands on a row '
          + 'that describes real business.' },
      { code: 'NO_OBSERVATION_ISOLATION',
        detail: 'The gap tables ARE the read store the pages serve from (inventoryReplenishmentGap.get / '
          + 'orderPlanningGap.get). There is no flag, filter or status that would hide a transient test value, so '
          + 'a real operator reading Inventory Replenishment during the window sees it as planning truth.' },
      { code: 'REBUILD_ORDERING_DEPENDENCY',
        detail: 'A rebuild reads 8 tables that fatigue itself mutates, so it is canonical only AFTER the test '
          + 'transaction rows are cleaned AND the operator inventory re-import has completed. The contaminated '
          + 'window is therefore not minutes — it lasts until the operator finishes recovering.' },
      { code: 'REBUILD_DURATION',
        detail: 'Measured full all-site materialization is ~14m (Inventory) and ~13.5m (Order Planning) (46_ '
          + 'header), so even the best case leaves ~28 minutes of whole-system recalculation inside the window.' }
    ],
    verdict: 'GAP WRITE FATIGUE REMAINS EXCLUDED. A rebuild is available and provable, but a rebuild repairs the '
      + 'table AFTER the fact; it does not stop a real planning read from seeing a test number first. R2 writes '
      + 'no gap row and adds no fatigue_run_id column.'
  };

  // =============================================================================================================
  // LOOKUP + AUTHORIZATION
  // =============================================================================================================
  var BY_TABLE = {};
  REGISTRY.forEach(function (e) { BY_TABLE[e.table] = e; });

  function str(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

  // The fail-closed classifier. An unregistered table is UNAUTHORIZED_UNKNOWN — never "probably a transaction".
  function classify(table) {
    var e = BY_TABLE[str(table)];
    if (!e) {
      return { table: str(table), cls: CLASS.UNAUTHORIZED_UNKNOWN, policy: POLICY.NEVER_TOUCH, registered: false,
        why: 'not in the S8 registry — no round has classified or authorized this table' };
    }
    return { table: e.table, cls: e.cls, policy: e.policy, registered: true, why: e.why };
  }

  function tablesIn(cls) {
    return REGISTRY.filter(function (e) { return e.cls === cls; }).map(function (e) { return e.table; }).sort();
  }
  function tablesWithPolicy(policy) {
    return REGISTRY.filter(function (e) { return e.policy === policy; }).map(function (e) { return e.table; }).sort();
  }

  // THE WRITE GATE. A fatigue round asks this before it dispatches anything that could write.
  // `via` must be 'RUNTIME_OWNER' — the harness calls an action and the canonical handler writes. There is no
  // other accepted value, which is how "never by direct arbitrary cell writes from the harness" is enforced
  // rather than merely asserted.
  function authorizeWrite(table, via) {
    var c = classify(table);
    var v = str(via);
    if (v !== 'RUNTIME_OWNER') {
      return { ok: false, code: 'DIRECT_WRITE_FORBIDDEN', table: c.table, cls: c.cls,
        message: 'the fatigue harness writes ONLY through canonical runtime owners; via must be RUNTIME_OWNER '
          + '(got ' + (v || '<empty>') + ')' };
    }
    if (c.cls === CLASS.UNAUTHORIZED_UNKNOWN) {
      return { ok: false, code: 'UNAUTHORIZED_UNKNOWN_TABLE', table: c.table, cls: c.cls,
        message: 'STOP — this table is not classified. Raise the §5 approval request before any write.' };
    }
    if (c.cls === CLASS.PROTECTED_MASTER) {
      return { ok: false, code: 'PROTECTED_MASTER_WRITE_FORBIDDEN', table: c.table, cls: c.cls,
        message: 'READ is allowed; WRITE / DELETE / TEST INSERT is not. ' + c.why };
    }
    if (c.cls === CLASS.READ_ONLY_DERIVED) {
      return { ok: false, code: 'DERIVED_TABLE_WRITE_FORBIDDEN', table: c.table, cls: c.cls,
        message: 'this table is materialized by its canonical owner and is excluded from write fatigue. ' + c.why };
    }
    return { ok: true, code: 'WRITE_AUTHORIZED', table: c.table, cls: c.cls, policy: c.policy };
  }

  // THE DELETE GATE. Table-level only — row-level selection is KMS8CLEAN's job and needs the manifest too.
  function authorizeDelete(table) {
    var c = classify(table);
    if (c.policy !== POLICY.DELETE_CANDIDATE) {
      return { ok: false, code: 'DELETE_FORBIDDEN_BY_POLICY', table: c.table, cls: c.cls, policy: c.policy,
        message: 'policy ' + c.policy + ' — ' + c.why };
    }
    return { ok: true, code: 'DELETE_TABLE_ELIGIBLE', table: c.table, cls: c.cls, policy: c.policy,
      message: 'eligible at TABLE level only; every row must still clear the manifest guards' };
  }

  // There is no table this harness may write a cell in. Not one, including the authorized ones.
  function directCellWriteAuthorized(/* table */) { return false; }

  // =============================================================================================================
  // §5 — THE STANDING APPROVAL GATE. A refusal is not the end of the road; it is a form to fill in. This builds
  // the form, with every field §5 names, so a blocked round hands the operator a decision rather than a problem.
  // =============================================================================================================
  var APPROVAL_TRIGGERS = ['WRITE_UNAPPROVED_TABLE', 'INSERT_INTO_PROTECTED_TABLE', 'DELETE_FROM_NEW_TABLE',
    'ADD_TABLE', 'ADD_COLUMN', 'SCHEMA_MIGRATION', 'BACKFILL'];

  function approvalRequest(req) {
    req = req || {};
    var trigger = str(req.trigger);
    var missing = [];
    ['table', 'operation', 'whyRequired', 'testScenario', 'recoveryModel'].forEach(function (k) {
      if (!str(req[k])) missing.push(k);
    });
    if (req.expectedRowCount === undefined || req.expectedRowCount === null) missing.push('expectedRowCount');
    if (APPROVAL_TRIGGERS.indexOf(trigger) === -1) missing.push('trigger');
    return {
      status: 'STOP_OPERATOR_APPROVAL_REQUIRED',
      complete: missing.length === 0,
      missing_fields: missing,
      trigger: trigger,
      table: str(req.table),
      operation: str(req.operation),
      why_required: str(req.whyRequired),
      test_scenario: str(req.testScenario),
      expected_row_count: (req.expectedRowCount === undefined) ? null : req.expectedRowCount,
      cleanup_recovery_model: str(req.recoveryModel),
      current_classification: classify(req.table),
      statement: 'The authorized write surface is NOT expanded by this request. It is expanded only by an operator '
        + 'decision that edits the KMS8CLASS registry.'
    };
  }

  // =============================================================================================================
  // COUNTS — published in the round report, derived here so the report cannot drift from the registry.
  // =============================================================================================================
  function counts() {
    var authorizedWrite = tablesIn(CLASS.TEST_OWNED_TRANSACTION).length + tablesIn(CLASS.REBUILDABLE_OPERATIONAL_STATE).length;
    return {
      total_registered: REGISTRY.length,
      protected_master: tablesIn(CLASS.PROTECTED_MASTER).length,
      test_owned_transaction: tablesIn(CLASS.TEST_OWNED_TRANSACTION).length,
      rebuildable_operational_state: tablesIn(CLASS.REBUILDABLE_OPERATIONAL_STATE).length,
      read_only_derived: tablesIn(CLASS.READ_ONLY_DERIVED).length,
      unauthorized_unknown: 0,                       // zero KNOWN; any unregistered name classifies as one
      authorized_write_tables: authorizedWrite,       // all via RUNTIME_OWNER
      direct_cell_write_tables: 0,
      delete_candidate_tables: tablesWithPolicy(POLICY.DELETE_CANDIDATE).length,
      retain_tables: tablesWithPolicy(POLICY.RETAIN).length,
      reconcile_tables: tablesWithPolicy(POLICY.RECONCILE).length,
      never_touch_tables: tablesWithPolicy(POLICY.NEVER_TOUCH).length,
      operator_approval_required_tables:
        tablesIn(CLASS.PROTECTED_MASTER).length + tablesIn(CLASS.READ_ONLY_DERIVED).length
    };
  }

  return {
    CONTRACT: CONTRACT,
    CLASS: CLASS,
    POLICY: POLICY,
    REGISTRY: REGISTRY,
    GAP_FINDING: GAP_FINDING,
    INVENTORY_RECOVERY_MODEL: INVENTORY_RECOVERY_MODEL,
    APPROVAL_TRIGGERS: APPROVAL_TRIGGERS,
    MOVEMENT_DELETE_ALLOWED: false,
    classify: classify,
    tablesIn: tablesIn,
    tablesWithPolicy: tablesWithPolicy,
    authorizeWrite: authorizeWrite,
    authorizeDelete: authorizeDelete,
    directCellWriteAuthorized: directCellWriteAuthorized,
    approvalRequest: approvalRequest,
    counts: counts,
    _version: 's8-r2-data-classification'
  };
});
