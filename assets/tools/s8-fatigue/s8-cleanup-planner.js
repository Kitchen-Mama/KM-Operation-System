/* ================================================================================================================
 * KMS8CLEAN — S8 FATIGUE CLEANUP PLANNER, GUARDS AND LEAK DETECTOR  (S8-R2 §10/§11/§12/§13)
 * ----------------------------------------------------------------------------------------------------------------
 * A PLANNER. NOT AN EXECUTOR. `execute` exists only to throw.
 *
 * S8-R2 §12 permits a planner, guards, a leak detector and reporting, and forbids a destructive executor and any
 * router/API delete action. So this file computes WHAT WOULD BE DELETED and refuses to delete it. The eventual
 * executor is an editor-run TEMP_ tool, authorized separately, modelled on TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP
 * (68_:880-935) — not a routed action, because this system has no routed delete and should not acquire one.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * THE THREE THINGS THAT CANNOT BE REACHED FROM HERE, AND HOW THAT IS ENFORCED.
 *
 * It is not enough for "no delete by prefix" to be a rule someone follows. The ways of doing it have to be
 * absent or to fail loudly, or the rule only holds until somebody is in a hurry. So:
 *
 *   PREFIX-ONLY DELETE   `selectByPrefix()` exists and ALWAYS throws. It is here as a tombstone: a caller who
 *                        reaches for the obvious thing gets a named refusal that explains why, rather than
 *                        finding no such function and writing their own loop.
 *   TIME-ONLY DELETE     `selectByTime()` likewise. The creation window survives only as guard G6, which
 *                        CORROBORATES a candidate the manifest already named and can never produce one.
 *   NON-MANIFEST DELETE  `planCandidates()` takes a manifest and reads ONLY `created_entity_ids`. There is no
 *                        parameter through which a pattern, a query or a row set can enter it. A row that
 *                        matches the namespace but is absent from the manifest is routed to `detectLeaks` and
 *                        classified LEAK / INVESTIGATION — which keeps the evidence, where deleting destroys it.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * WHY TEN GUARDS AND NOT ONE GOOD ONE.
 *
 * Each guard fails for a different reason, so passing all ten means ten independent things agree. The six
 * per-row guards are ANDed — never ORed, because an OR means any single mistaken check authorizes a deletion.
 * A failure aborts the WHOLE plan rather than skipping the row, because a cleanup that silently skipped
 * something is indistinguishable from one that finished, and the difference matters the next time somebody
 * asks whether the table is clean.
 *
 * NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. NO DELETION.
 * ================================================================================================================ */
(function (root, factory) {
  var api = factory(
    (typeof require === 'function') ? require('./s8-run-identity.js') : (root && root.KMS8RUN),
    (typeof require === 'function') ? require('./s8-data-classification.js') : (root && root.KMS8CLASS)
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KMS8CLEAN = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RUN, CLS) {
  'use strict';

  var DESTRUCTIVE_EXECUTOR_IMPLEMENTED = false;

  // =============================================================================================================
  // THE ORDER — derived from the FK columns the writers actually set (S8-R1 §9). Two entries are RUNTIME ACTIONS
  // rather than deletions, and their position is the load-bearing part:
  //   step 0  release reservations BEFORE the shipment row goes, or the reservation is orphaned forever, because
  //           the owner id it is keyed on (21_:448) no longer exists and nothing will ever release it;
  //   step 24 reconcile inventory AFTER every transaction row is gone, so nothing re-derives a claim against it.
  // =============================================================================================================
  var SAFE_CLEANUP_ORDER = [
    { step: 0, kind: 'RUNTIME', action: 'cancelShipmentDraft', what: 'release every reservation held by a test shipment' },
    { step: 1, kind: 'DELETE', table: 'generated_documents', note: 'registry row only; the Drive file is retained' },
    { step: 2, kind: 'DELETE', table: 'shipment_final_output_line_pos' },
    { step: 3, kind: 'DELETE', table: 'shipment_final_output_lines' },
    { step: 4, kind: 'DELETE', table: 'shipment_final_output_snapshots' },
    { step: 5, kind: 'DELETE', table: 'shipment_line_allocations' },
    { step: 6, kind: 'DELETE', table: 'shipment_events' },
    { step: 7, kind: 'DELETE', table: 'shipment_routes' },
    { step: 8, kind: 'DELETE', table: 'shipment_lines' },
    { step: 9, kind: 'DELETE', table: 'shipments' },
    { step: 10, kind: 'DELETE', table: 'shipping_plan_lines' },
    { step: 11, kind: 'DELETE', table: 'shipping_plans' },
    { step: 12, kind: 'DELETE', table: 'purchase_order_lines', note: 'then clear request_order_lines.purchase_order_line_id back-refs' },
    { step: 13, kind: 'DELETE', table: 'purchase_orders' },
    { step: 14, kind: 'DELETE', table: 'request_order_site_confirmations' },
    { step: 15, kind: 'DELETE', table: 'request_order_line_sources' },
    { step: 16, kind: 'DELETE', table: 'request_order_lines' },
    { step: 17, kind: 'DELETE', table: 'request_orders' },
    { step: 18, kind: 'DELETE', table: 'shipping_allocation_draft_lines' },
    { step: 19, kind: 'DELETE', table: 'shipping_allocation_drafts' },
    { step: 20, kind: 'DELETE', table: 'request_order_allocation_draft_lines' },
    { step: 21, kind: 'DELETE', table: 'request_order_allocation_drafts' },
    { step: 22, kind: 'DELETE', table: 'recommendation_calculation_runs' },
    { step: 23, kind: 'SKIP', table: 'inventory_replenishment_gap',
      note: 'EXCLUDED — gap write fatigue is not authorized, so a run has no gap rows to clean' },
    { step: 24, kind: 'RUNTIME', action: 'reconcileInventory',
      what: 'verify every touched inventory identity; recovery authority is the operator canonical re-import' },
    { step: 25, kind: 'RETAIN', tables: CLS.tablesWithPolicy(CLS.POLICY.RETAIN) },
    { step: 26, kind: 'VERIFY', what: 'second dry run; require candidate count 0' }
  ];

  function str(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

  // =============================================================================================================
  // THE TOMBSTONES. These are the two shapes a cleanup must never take, kept as named refusals.
  // =============================================================================================================
  function selectByPrefix(/* prefix */) {
    throw new Error('PREFIX_ONLY_SELECTION_FORBIDDEN — a namespace match is not ownership. Rows are selected from '
      + 'the run manifest (created_entity_ids) and nowhere else. A namespace-matching row that is absent from the '
      + 'manifest is a LEAK for investigation: route it to detectLeaks(), which keeps the evidence that deleting '
      + 'would destroy.');
  }
  function selectByTime(/* from, to */) {
    throw new Error('TIME_ONLY_SELECTION_FORBIDDEN — creation time is CORROBORATION (guard G6) and can never '
      + 'produce a candidate. "Everything written in the last N minutes" is the one selector that is guaranteed '
      + 'to also match whatever a real operator did during the run.');
  }
  function execute() {
    throw new Error('DESTRUCTIVE_EXECUTOR_NOT_IMPLEMENTED — S8-R2 §12 permits a planner only. Execution belongs to '
      + 'a separately authorized, editor-run, dry-run-default TEMP_ tool following the 68_:880-935 pattern, never '
      + 'to a router action.');
  }

  // =============================================================================================================
  // PER-ROW GUARDS G1..G6 — ANDed. Every one must pass.
  // =============================================================================================================
  function evaluateRowGuards(row, ctx) {
    ctx = ctx || {};
    var manifest = ctx.manifest, table = str(ctx.table), idField = str(ctx.idField);
    var refusals = [];
    var id = str(row && row[idField]);

    // G1 — the run id is canonical and is the one being cleaned.
    var runId = str(manifest && manifest.run_id);
    if (!RUN.isRunId(runId)) refusals.push({ guard: 'G1', code: 'RUN_ID_NOT_CANONICAL', detail: runId });

    // G2 + G3 — actor is the test actor, and lineage resolves (DIRECT or INHERITED) to THIS run.
    var lin = RUN.resolveLineage(row, {
      runId: runId, parentKey: ctx.parentKey, lookupParents: ctx.lookupParents,
      grandparentKey: ctx.grandparentKey, actorFields: ctx.actorFields, lineageFields: ctx.lineageFields
    });
    if (!lin.ok) {
      refusals.push({ guard: lin.code === 'ACTOR_NOT_TEST' ? 'G2' : 'G3', code: lin.code, detail: lin.detail });
    }

    // G4 — the id is in THIS run's own manifest. Candidates are replayed, never discovered.
    if (!RUN.manifestHas(manifest, table, id)) {
      refusals.push({ guard: 'G4', code: 'ROW_NOT_IN_RUN_MANIFEST',
        detail: table + '/' + (id || '<blank id>') + ' was never recorded by ' + runId });
    }

    // G5 — the table is not protected, and its policy permits deletion at all.
    var tableGate = CLS.authorizeDelete(table);
    if (!tableGate.ok) refusals.push({ guard: 'G5', code: tableGate.code, detail: tableGate.message });

    // G6 — creation window plausibility. CORROBORATION ONLY: it can refuse a candidate the manifest produced,
    // and it can never produce one. Absent timestamps are not a refusal — the manifest is still the authority.
    var createdAt = str(row && row[ctx.createdAtField || 'created_at']);
    var startedAt = str(manifest && manifest.started_at), finishedAt = str(manifest && manifest.finished_at);
    if (createdAt && startedAt && finishedAt) {
      var t = Date.parse(createdAt.replace(' ', 'T')),
          lo = Date.parse(startedAt.replace(' ', 'T')) - 3600000,
          hi = Date.parse(finishedAt.replace(' ', 'T')) + 86400000;
      if (isFinite(t) && isFinite(lo) && isFinite(hi) && (t < lo || t > hi)) {
        refusals.push({ guard: 'G6', code: 'CREATION_WINDOW_IMPLAUSIBLE',
          detail: createdAt + ' is outside [' + startedAt + ' -1h, ' + finishedAt + ' +24h]' });
      }
    }

    return { ok: refusals.length === 0, table: table, id: id, lineage: lin.ok ? lin.mode : null, refusals: refusals };
  }

  // =============================================================================================================
  // PLANNER — manifest in, plan out. The ONLY source of candidates is manifest.created_entity_ids.
  // =============================================================================================================
  function planCandidates(manifest, opts) {
    opts = opts || {};
    var eligible = RUN.cleanupEligible(manifest);
    if (!eligible.ok) {
      return { ok: false, code: eligible.code, detail: eligible.detail || eligible.errors, mode: 'DRY_RUN',
        steps: [], candidate_count: 0, refusals: [] };
    }

    var readRow = (typeof opts.readRow === 'function') ? opts.readRow : null;   // (table, id) -> row | null
    var steps = [], refusals = [], total = 0;

    SAFE_CLEANUP_ORDER.forEach(function (s) {
      if (s.kind !== 'DELETE') {
        steps.push({ step: s.step, kind: s.kind, table: s.table || null, action: s.action || null,
          what: s.what || s.note || null, tables: s.tables || null, candidates: [] });
        return;
      }
      var ids = RUN.manifestIds(manifest, s.table);
      var keep = [];
      ids.forEach(function (id) {
        var row = readRow ? readRow(s.table, id) : null;
        if (!row) {
          // Already absent. Not a refusal — a cleanup replayed after a partial run must converge, not abort.
          keep.push({ id: id, present: false, guards: 'SKIPPED_ABSENT' });
          return;
        }
        var g = evaluateRowGuards(row, {
          manifest: manifest, table: s.table, idField: opts.idFieldFor ? opts.idFieldFor(s.table) : 'id',
          parentKey: opts.parentKeyFor ? opts.parentKeyFor(s.table) : null,
          lookupParents: opts.lookupParents, createdAtField: opts.createdAtField
        });
        if (!g.ok) { refusals.push({ table: s.table, id: id, refusals: g.refusals }); return; }
        keep.push({ id: id, present: true, lineage: g.lineage });
        total++;
      });
      steps.push({ step: s.step, kind: 'DELETE', table: s.table, note: s.note || null, candidates: keep });
    });

    // A single refusal aborts the WHOLE plan. Partial cleanup is the failure mode that looks like success.
    if (refusals.length) {
      return { ok: false, code: 'GUARD_REFUSED', mode: 'DRY_RUN', run_id: manifest.run_id,
        candidate_count: 0, steps: [], refusals: refusals,
        detail: refusals.length + ' row(s) failed a guard; the entire plan is abandoned rather than partially '
          + 'applied, because a cleanup that skipped rows reports the same thing as one that finished' };
    }

    var plan = {
      ok: true, code: 'DRY_RUN_PLAN', mode: 'DRY_RUN', run_id: manifest.run_id,
      candidate_count: total, steps: steps, refusals: [],
      candidates_by_table: {}, confirmation_checksum: '',
      statement: 'PROPOSAL ONLY. Nothing was deleted. Execution requires a separately authorized editor-run tool, '
        + 'an explicit COMMIT mode, and this exact checksum recomputed against the live table.'
    };
    steps.forEach(function (s) {
      if (s.kind === 'DELETE') plan.candidates_by_table[s.table] = s.candidates.filter(function (c) { return c.present; }).length;
    });
    plan.confirmation_checksum = checksum(plan);
    return plan;
  }

  // Deterministic over (run id, table, present candidate ids) — the exact set about to be removed, and nothing
  // else, so a checksum computed at dry-run time means the same thing when it is rechecked at commit time.
  function checksum(plan) {
    var parts = [str(plan && plan.run_id)];
    (plan && plan.steps ? plan.steps : []).forEach(function (s) {
      if (s.kind !== 'DELETE') return;
      var ids = s.candidates.filter(function (c) { return c.present; }).map(function (c) { return c.id; }).sort();
      if (ids.length) parts.push(s.table + ':' + ids.join(','));
    });
    var h = 0x811c9dc5, src = parts.join('|');
    for (var i = 0; i < src.length; i++) {
      h ^= src.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8).toUpperCase();
  }

  // =============================================================================================================
  // PER-EXECUTION GUARDS G7..G10. Checked by the future executor; defined here so the planner and the executor
  // cannot hold two different opinions about what authorizes a commit.
  // =============================================================================================================
  function evaluateExecutionGuards(plan, ctx) {
    ctx = ctx || {};
    var refusals = [];

    // G7 — explicit COMMIT. The default is a dry run, and an absent mode is a dry run, never a commit.
    if (str(ctx.mode) !== 'COMMIT') {
      refusals.push({ guard: 'G7', code: 'NOT_COMMIT_MODE', detail: 'mode=' + (str(ctx.mode) || 'DRY_RUN (default)') });
    }
    // G8 — the confirmation matches a checksum recomputed against the LIVE rows, not the stored one.
    var live = str(ctx.liveChecksum);
    if (!live) refusals.push({ guard: 'G8', code: 'LIVE_CHECKSUM_MISSING', detail: 'the table must be re-read at commit time' });
    else if (live !== str(plan && plan.confirmation_checksum)) {
      refusals.push({ guard: 'G8', code: 'CONFIRMATION_STALE',
        detail: 'live ' + live + ' != planned ' + str(plan && plan.confirmation_checksum) + ' — the table changed since the dry run' });
    }
    if (str(ctx.confirmation) !== str(plan && plan.confirmation_checksum)) {
      refusals.push({ guard: 'G8', code: 'CONFIRMATION_NOT_SUPPLIED', detail: 'the operator must paste the dry run checksum' });
    }
    // G9 — the rollback journal exists BEFORE the first deletion. "Will log it as we go" is not a journal.
    if (!ctx.journalWritten) {
      refusals.push({ guard: 'G9', code: 'JOURNAL_NOT_WRITTEN',
        detail: 'the exact bytes of every row about to be removed must be logged before the first deletion' });
    }
    // G10 — live candidate count matches the dry run, and never exceeds what the run recorded creating.
    var liveCount = Number(ctx.liveCandidateCount);
    if (!isFinite(liveCount) || liveCount !== Number(plan && plan.candidate_count)) {
      refusals.push({ guard: 'G10', code: 'CANDIDATE_COUNT_DRIFT',
        detail: 'live ' + ctx.liveCandidateCount + ' != planned ' + (plan && plan.candidate_count) });
    }
    var recorded = Number(ctx.manifestCreatedCount);
    if (isFinite(recorded) && isFinite(liveCount) && liveCount > recorded) {
      refusals.push({ guard: 'G10', code: 'CANDIDATES_EXCEED_MANIFEST',
        detail: liveCount + ' candidates but the run only recorded creating ' + recorded });
    }
    return { ok: refusals.length === 0, refusals: refusals };
  }

  // =============================================================================================================
  // LEAK DETECTOR (§11). A namespace-matching row absent from the manifest is NOT a delete candidate. It means
  // either the manifest is wrong or something else is writing into the namespace, and deleting it destroys the
  // only evidence that would say which.
  // =============================================================================================================
  function detectLeaks(observed, manifest) {
    var leaks = [], foreign = [];
    (observed || []).forEach(function (o) {
      var table = str(o.table), id = str(o.id), carrier = str(o.lineageValue || o.id);
      if (!RUN.looksNamespaced(carrier)) return;
      var owner = RUN.runIdOf(carrier);
      if (owner && owner !== str(manifest && manifest.run_id)) {
        foreign.push({ table: table, id: id, owner_run_id: owner, classification: 'ANOTHER_RUN' });
        return;
      }
      if (!RUN.manifestHas(manifest, table, id)) {
        leaks.push({ table: table, id: id, lineage_value: carrier,
          classification: 'LEAK_INVESTIGATION',
          detail: 'matches the S8T namespace but ' + str(manifest && manifest.run_id) + ' never recorded creating '
            + 'it. NOT a delete candidate.' });
      }
    });
    return {
      leak_count: leaks.length, leaked_rows: leaks,
      foreign_run_count: foreign.length, foreign_rows: foreign,
      action: leaks.length || foreign.length ? 'INVESTIGATE — do not delete' : 'none'
    };
  }

  // Anything the cleanup touched that is NOT attributable to the run. Must always be zero; any value above zero
  // halts the S8 programme, which is why it is computed rather than assumed.
  function nonTestTouches(touched, manifest) {
    var bad = [];
    (touched || []).forEach(function (t) {
      if (!RUN.manifestHas(manifest, str(t.table), str(t.id))) {
        bad.push({ table: str(t.table), id: str(t.id), reason: 'not in the run manifest' });
      }
    });
    return { non_test_row_touched_count: bad.length, non_test_rows_touched: bad };
  }

  // §20 acceptance, computed from the manifest rather than asserted in prose.
  function acceptance(manifest, secondDryRun) {
    var c = manifest && manifest.cleanup ? manifest.cleanup : {};
    var remaining = 0;
    Object.keys(c.candidates_by_table || {}).forEach(function (t) {
      var del = (c.deleted_by_table || {})[t] || 0;
      remaining += Math.max(0, (c.candidates_by_table[t] || 0) - del);
    });
    var secondCount = secondDryRun ? Number(secondDryRun.candidate_count) : null;
    return {
      TEST_PARENT_ROW_REMAINS: remaining,
      TEST_CHILD_ROW_REMAINS: remaining,
      TEST_DOCUMENT_REGISTRY_REMAINS: Math.max(0, ((c.candidates_by_table || {}).generated_documents || 0)
        - ((c.deleted_by_table || {}).generated_documents || 0)),
      TEST_DRIVE_FILE_REMAINS: 'EXPECTED > 0 — retained; no Drive delete capability exists',
      TEST_MOVEMENT_ROW_REMAINS: 'EXPECTED > 0 — retained permanently',
      INVENTORY_RECONCILED: c.reconciled_inventory_identities || 0,
      RESERVATIONS_RELEASED: c.reservations_released || 0,
      NON_TEST_ROW_CHANGED_BY_CLEANUP: manifest ? manifest.non_test_row_touched_count : null,
      SECOND_DRY_RUN_CANDIDATE_COUNT: secondCount,
      pass: remaining === 0 && secondCount === 0 && (manifest && manifest.non_test_row_touched_count === 0)
    };
  }

  return {
    DESTRUCTIVE_EXECUTOR_IMPLEMENTED: DESTRUCTIVE_EXECUTOR_IMPLEMENTED,
    SAFE_CLEANUP_ORDER: SAFE_CLEANUP_ORDER,
    GUARD_COUNT: 10,
    CLEANUP_DEFAULT_EXECUTE: false,
    CLEANUP_REQUIRES_DRY_RUN: true,
    selectByPrefix: selectByPrefix,
    selectByTime: selectByTime,
    execute: execute,
    evaluateRowGuards: evaluateRowGuards,
    planCandidates: planCandidates,
    checksum: checksum,
    evaluateExecutionGuards: evaluateExecutionGuards,
    detectLeaks: detectLeaks,
    nonTestTouches: nonTestTouches,
    acceptance: acceptance,
    _version: 's8-r2-cleanup-planner'
  };
});
