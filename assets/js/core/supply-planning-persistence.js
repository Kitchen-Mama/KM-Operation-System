// Kitchen Mama Operation System — Recommendation Persistence pure runtime (Phase 2C, Round 1B).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC implementation of the frozen Persistence / Orchestration contract in
// docs/planning/RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md §Persist-Orch (FROZEN 2026-08-03) +
// SYSTEM_RUNTIME_ARCHITECTURE.md §7C. This round (1B) implements ONLY the persistence RUNTIME CORE:
//   • resolveActiveDraft        — PO-6 Active-Draft lookup (0→CREATE, 1→REUSE, >1→BLOCKED_CONFLICT)
//   • generateRecommendationDraft — PO-9 create/refresh/regenerate matrix + user-edit protection (PO-10)
//   • persistRecommendationDraft  — PO-12 logical write order, stage-by-stage, idempotent + resumable
//   • resumeRecommendationRun     — PO-15 resume a PARTIAL/RUNNING run from its last completed stage
//   • applyUserEdit               — records a user edit (planned_qty / order_qty) with explicit provenance
//   • createStore                 — an in-memory store { drafts, lines, runs }
//
// NOT in scope (contract PO-21 / Round 1B §12): NO Scheduler, NO Trigger, NO LockService, NO API, NO Apps
// Script, NO DB migration, NO Weekly-Plan promotion, NO Request writer (B-5), NO Submit, NO B-6/B-8.
//
// The orchestration is side-effect-controlled: every function CLONES its input store and returns a NEW
// store — the input is never mutated; a fresh result object every call; same input ⇒ identical output.
// Identities are DERIVED deterministically from the frozen natural keys (no clock, no Math.random, no
// uuid) so retry/resume are idempotent by construction: one `calculation_run_id` per (draft, version).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.persistence = api;
  }
})(this, function () {
  'use strict';

  // ---- frozen enum tokens (contract PO-4 / PO-6 / PO-9) ---------------------
  var REC_TYPES = { WEEKLY_SHIPPING: 1, MONTHLY_ORDER: 1 };
  var MODES = { SCHEDULED_REFRESH: 1, MANUAL_REGENERATE: 1 };
  var ACTIVE_STATUSES = { draft: 1, site_confirmed: 1 }; // non-terminal, editable (PO-6)
  // Logical write order (PO-12) — each stage is atomic and idempotent; a run advances stage-by-stage.
  var STAGES = ['RUN_METADATA', 'HEADER', 'LINES', 'RECONCILE', 'LINEAGE', 'TOTALS', 'COMPLETED'];

  // ---- helpers --------------------------------------------------------------
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function aType(cond, msg) { if (!cond) throw new TypeError(msg); }
  function aRange(cond, msg) { if (!cond) throw new RangeError(msg); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function stageIdx(name) { return STAGES.indexOf(name); }

  function sortedScope(scope) {
    var out = {}; Object.keys(scope).sort().forEach(function (k) { out[k] = scope[k]; }); return out;
  }
  function scopeKey(scope) {
    var s = sortedScope(scope);
    return Object.keys(s).map(function (k) { return k + '=' + String(s[k]); }).join('|');
  }
  function activeKeyOf(type, cycle, scope) {
    // F1-7N-FA-3C-R6F2: planning_cycle is serialized EXACTLY ONCE — as the leading `::<cycle>::` segment. Defensively
    // strip any `planning_cycle` key from the scope object so a caller that (now or later) includes it in businessScope
    // can never double-count it in scopeKey(scope). No-op for the current callers (WEEKLY mScope has no planning_cycle;
    // MONTHLY uses KMRDV2P's own key), so the deterministic RD:: id format is unchanged.
    var sc = scope;
    if (scope && Object.prototype.hasOwnProperty.call(scope, 'planning_cycle')) {
      sc = {}; for (var k in scope) if (scope.hasOwnProperty(k) && k !== 'planning_cycle') sc[k] = scope[k];
    }
    return type + '::' + cycle + '::' + scopeKey(sc);
  }
  function draftIdOf(activeKey) { return 'RD::' + activeKey; }
  function runIdOf(draftId, version) { return 'RUN::' + draftId + '::v' + version; }
  function lineIdOf(draftId, lineKey) { return 'RL::' + draftId + '::' + lineKey; }

  function findDraft(store, draftId) { for (var i = 0; i < store.drafts.length; i++) if (store.drafts[i].draftId === draftId) return store.drafts[i]; return null; }
  function findRun(store, runId) { for (var i = 0; i < store.runs.length; i++) if (store.runs[i].calculationRunId === runId) return store.runs[i]; return null; }
  function findLine(store, lineId) { for (var i = 0; i < store.lines.length; i++) if (store.lines[i].lineId === lineId) return store.lines[i]; return null; }
  function draftLines(store, draftId) { return store.lines.filter(function (l) { return l.draftId === draftId; }); }

  function normStore(store) {
    var s = clone(store) || {};
    s.drafts = s.drafts || []; s.lines = s.lines || []; s.runs = s.runs || [];
    return s;
  }
  function createStore() { return { drafts: [], lines: [], runs: [] }; }

  // ---- validation -----------------------------------------------------------
  function validateScopeQuery(q) {
    aType(isObj(q), 'query must be an object');
    aRange(REC_TYPES[q.recommendationType] === 1, 'unknown recommendationType (expect WEEKLY_SHIPPING | MONTHLY_ORDER)');
    aType(typeof q.planningCycle === 'string' && q.planningCycle.length > 0, 'planningCycle must be a non-empty string');
    aType(isObj(q.businessScope), 'businessScope must be an object');
  }
  function validateLines(lines) {
    aType(Array.isArray(lines), 'recommendedLines must be an array');
    lines.forEach(function (l, i) {
      aType(isObj(l), 'recommendedLines[' + i + '] must be an object');
      aType(typeof l.lineKey === 'string' && l.lineKey.length > 0, 'recommendedLines[' + i + '].lineKey must be a non-empty string');
      if (l.lineState === 'BLOCKED') {
        aType(typeof l.reason === 'string' && l.reason.length > 0, 'recommendedLines[' + i + '] BLOCKED requires a reason token');
      } else {
        aRange(l.lineState === undefined || l.lineState === 'OK', 'recommendedLines[' + i + '].lineState must be "OK" | "BLOCKED"');
        aType(typeof l.recommendedQty === 'number', 'recommendedLines[' + i + '].recommendedQty must be a number');
        aRange(isFinite(l.recommendedQty) && l.recommendedQty >= 0, 'recommendedLines[' + i + '].recommendedQty must be finite ≥ 0');
      }
    });
    // duplicate lineKey guard (deterministic upsert requires unique natural keys per run)
    var seen = {};
    lines.forEach(function (l) { aRange(seen[l.lineKey] !== 1, 'duplicate lineKey in recommendedLines: ' + l.lineKey); seen[l.lineKey] = 1; });
  }

  // ---- PO-6: Active Draft lookup (read-only) --------------------------------
  function resolveActiveDraft(store, query) {
    validateScopeQuery(query);
    var s = normStore(store);
    var ak = activeKeyOf(query.recommendationType, query.planningCycle, query.businessScope);
    var matches = s.drafts.filter(function (d) { return d.activeKey === ak && ACTIVE_STATUSES[d.status] === 1; });
    if (matches.length === 0) return { status: 'CREATE', activeKey: ak, draftId: draftIdOf(ak), draft: null };
    if (matches.length === 1) return { status: 'REUSE', activeKey: ak, draftId: draftIdOf(ak), draft: clone(matches[0]) };
    // >1 Active — fail-closed; never auto-repair, never latest-wins (PO-6)
    return { status: 'BLOCKED_CONFLICT', activeKey: ak, draftId: null, matchCount: matches.length, draft: null };
  }

  function hasUserEdits(store, draftId) {
    return draftLines(store, draftId).some(function (l) {
      return l.userEdited === true && l.lineStatus !== 'SUPERSEDED' && l.lineStatus !== 'SUPERSEDED_USER_REVIEW';
    });
  }

  // ---- stage execution (shared by persist + resume) -------------------------
  function execStage(store, run, stage, counts) {
    if (stage === 'RUN_METADATA') {
      // run row already upserted by the caller; ensure RUNNING
      run.status = 'RUNNING';
      return;
    }
    if (stage === 'HEADER') {
      var d = findDraft(store, run.draftId);
      if (!d) {
        store.drafts.push({
          draftId: run.draftId, activeKey: run.activeKey, recommendationType: run.recommendationType,
          planningCycle: run.planningCycle, businessScope: clone(run.businessScope), draftVersion: run.draftVersion,
          status: 'draft', calculationRunId: run.calculationRunId, formulaVersion: run.formulaVersion,
          sourceDataAsOf: run.sourceDataAsOf, totals: null
        });
        counts.created++;
      } else {
        d.draftVersion = run.draftVersion; d.calculationRunId = run.calculationRunId;
        d.formulaVersion = run.formulaVersion; d.sourceDataAsOf = run.sourceDataAsOf;
        if (ACTIVE_STATUSES[d.status] !== 1) { /* never mutate a terminal (submitted/cancelled) record */ }
        counts.updated++;
      }
      return;
    }
    if (stage === 'LINES') {
      run.plannedLines.forEach(function (pl) {
        var lineId = lineIdOf(run.draftId, pl.lineKey);
        var line = findLine(store, lineId);
        var blocked = pl.lineState === 'BLOCKED';
        if (!line) {
          store.lines.push({
            lineId: lineId, draftId: run.draftId, lineKey: pl.lineKey,
            recommendedQty: blocked ? null : pl.recommendedQty,
            // first-line init = the per-source WHOLE-CARTON execution qty when the plan carries one (F1-4B-FM6-R3D
            // WEEKLY per-source lines), else the recommendation snapshot (PO-10; MONTHLY + single-source unchanged).
            userQty: blocked ? null : (typeof pl.userQty === 'number' && isFinite(pl.userQty) ? pl.userQty : pl.recommendedQty),
            userEdited: false,
            lineStatus: blocked ? 'BLOCKED' : 'ACTIVE',
            reason: blocked ? pl.reason : null,
            demandKey: pl.demandKey !== undefined ? pl.demandKey : null,
            calculationRunId: run.calculationRunId
          });
          if (blocked) counts.blocked++; else counts.created++;
          return;
        }
        // existing line
        if (blocked) {
          line.lineStatus = 'BLOCKED'; line.reason = pl.reason; line.recommendedQty = null; // never fabricate a qty
          counts.blocked++; // userQty untouched
        } else if (run.action === 'REFRESH') {
          // recommended_qty immutable within a draft_version (PO-11); refresh only repairs a prior BLOCK
          if (line.lineStatus === 'BLOCKED') { line.lineStatus = 'ACTIVE'; line.reason = null; }
          counts.skipped++;
        } else { // CREATE (re-run) or REGENERATE — recompute recommended; user qty per reInit
          line.recommendedQty = pl.recommendedQty;
          if (run.reInitUserQty === true) { line.userQty = (typeof pl.userQty === 'number' && isFinite(pl.userQty) ? pl.userQty : pl.recommendedQty); line.userEdited = false; }
          line.lineStatus = 'ACTIVE'; line.reason = null;
          counts.updated++;
        }
        line.calculationRunId = run.calculationRunId;
      });
      return;
    }
    if (stage === 'RECONCILE') {
      var planned = {}; run.plannedLines.forEach(function (pl) { planned[pl.lineKey] = 1; });
      draftLines(store, run.draftId).forEach(function (line) {
        if (planned[line.lineKey] === 1) return;
        if (line.lineStatus === 'SUPERSEDED' || line.lineStatus === 'SUPERSEDED_USER_REVIEW') return; // idempotent
        // removed line — never hard-delete; user-edited rows are preserved + flagged for review (PO-13)
        line.lineStatus = line.userEdited === true ? 'SUPERSEDED_USER_REVIEW' : 'SUPERSEDED';
        counts.superseded++;
      });
      return;
    }
    if (stage === 'LINEAGE') {
      var plannedKeys = {}; run.plannedLines.forEach(function (pl) { plannedKeys[pl.lineKey] = 1; });
      draftLines(store, run.draftId).forEach(function (line) {
        if (plannedKeys[line.lineKey] === 1) {
          line.calculationRunId = run.calculationRunId;
          line.sourceDataAsOf = run.sourceDataAsOf;
        }
      });
      return;
    }
    if (stage === 'TOTALS') {
      var totRec = 0, totUser = 0, active = 0, blockedN = 0, supersededN = 0;
      draftLines(store, run.draftId).forEach(function (line) {
        if (line.lineStatus === 'ACTIVE') { totRec += (line.recommendedQty || 0); totUser += (line.userQty || 0); active++; }
        else if (line.lineStatus === 'BLOCKED') blockedN++;
        else supersededN++;
      });
      var d2 = findDraft(store, run.draftId);
      if (d2) {
        d2.totals = { totalRecommendedQty: totRec, totalUserQty: totUser, activeLineCount: active, blockedCount: blockedN, supersededCount: supersededN };
        d2.calculationRunId = run.calculationRunId; d2.draftVersion = run.draftVersion;
      }
      return;
    }
    // COMPLETED — terminal marker; status set by the driver
  }

  function driveStages(store, run, startIdx, stopAfterStage) {
    var counts = { created: 0, updated: 0, superseded: 0, blocked: 0, skipped: 0 };
    run.status = 'RUNNING';
    for (var i = startIdx; i < STAGES.length; i++) {
      var st = STAGES[i];
      execStage(store, run, st, counts);
      run.stage = st;
      if (stopAfterStage && st === stopAfterStage) {
        run.status = (st === 'COMPLETED') ? 'COMPLETED' : 'PARTIAL';
        return counts;
      }
    }
    run.status = 'COMPLETED';
    return counts;
  }

  function buildResult(run, counts, extra) {
    var r = {
      status: run.status, draftId: run.draftId, draftVersion: run.draftVersion,
      calculationRunId: run.calculationRunId, stage: run.stage, action: run.action, counts: counts
    };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  // ---- PO-12: persist (logical write order, idempotent, resumable) ----------
  function persistRecommendationDraft(store, plan) {
    aType(isObj(plan) && typeof plan.draftId === 'string', 'plan must be an object with a draftId');
    aType(Array.isArray(plan.recommendedLines), 'plan.recommendedLines must be an array');
    if (plan.stopAfterStage !== undefined) aRange(stageIdx(plan.stopAfterStage) !== -1, 'plan.stopAfterStage must be a valid stage');
    var s = normStore(store);
    // RUN_METADATA: upsert the run row (captures full intent so resume is self-contained) — idempotent by runId
    var run = findRun(s, plan.calculationRunId);
    if (!run) {
      run = {
        calculationRunId: plan.calculationRunId, draftId: plan.draftId, activeKey: plan.activeKey,
        recommendationType: plan.recommendationType, planningCycle: plan.planningCycle,
        businessScope: clone(plan.businessScope), draftVersion: plan.draftVersion,
        formulaVersion: plan.formulaVersion !== undefined ? plan.formulaVersion : null,
        sourceDataAsOf: plan.sourceDataAsOf !== undefined ? plan.sourceDataAsOf : null,
        action: plan.action, reInitUserQty: plan.reInitUserQty === true,
        plannedLines: clone(plan.recommendedLines), status: 'RUNNING', stage: null
      };
      s.runs.push(run);
    } else {
      // retry of the same operation — reuse the same run id; refresh captured intent (idempotent)
      run.status = 'RUNNING'; run.plannedLines = clone(plan.recommendedLines); run.action = plan.action;
      run.reInitUserQty = plan.reInitUserQty === true;
      run.formulaVersion = plan.formulaVersion !== undefined ? plan.formulaVersion : run.formulaVersion;
      run.sourceDataAsOf = plan.sourceDataAsOf !== undefined ? plan.sourceDataAsOf : run.sourceDataAsOf;
    }
    var counts = driveStages(s, run, 0, plan.stopAfterStage);
    return { store: s, result: buildResult(run, counts) };
  }

  // ---- PO-9: generate (create / refresh / regenerate) -----------------------
  function generateRecommendationDraft(store, command) {
    validateScopeQuery(command);
    aRange(MODES[command.mode] === 1, 'unknown mode (expect SCHEDULED_REFRESH | MANUAL_REGENERATE)');
    validateLines(command.recommendedLines);
    var s = normStore(store);
    var resolved = resolveActiveDraft(s, command);
    if (resolved.status === 'BLOCKED_CONFLICT') {
      // duplicate Active Draft — run BLOCKS; store unchanged (PO-6 / PO-14)
      return { store: clone(store) || createStore(), result: { status: 'BLOCKED', reason: 'DUPLICATE_ACTIVE_DRAFT', activeKey: resolved.activeKey, draftId: null, matchCount: resolved.matchCount } };
    }
    var draftId = resolved.draftId, action, version, reInit;
    if (resolved.status === 'CREATE') {
      action = 'CREATE'; version = 1; reInit = true;
    } else { // REUSE
      if (command.mode === 'SCHEDULED_REFRESH') {
        action = 'REFRESH'; version = resolved.draft.draftVersion; reInit = false;
      } else { // MANUAL_REGENERATE
        var edits = hasUserEdits(s, draftId);
        if (edits && command.confirmRegenerateOverUserEdits !== true) {
          // regenerating over user edits needs explicit confirmation (PO-9 case G / PO-10)
          return { store: clone(store) || createStore(), result: { status: 'BLOCKED', reason: 'REGENERATE_NEEDS_CONFIRMATION', draftId: draftId, draftVersion: resolved.draft.draftVersion, activeKey: resolved.activeKey } };
        }
        action = 'REGENERATE'; version = resolved.draft.draftVersion + 1;
        reInit = true; // confirmed overwrite OR no edits → user qty re-initializes from the new recommendation
      }
    }
    var plan = {
      draftId: draftId, activeKey: resolved.activeKey, recommendationType: command.recommendationType,
      planningCycle: command.planningCycle, businessScope: sortedScope(command.businessScope),
      draftVersion: version, calculationRunId: runIdOf(draftId, version),
      formulaVersion: command.formulaVersion !== undefined ? command.formulaVersion : null,
      sourceDataAsOf: command.sourceDataAsOf !== undefined ? command.sourceDataAsOf : null,
      action: action, reInitUserQty: reInit, recommendedLines: clone(command.recommendedLines),
      stopAfterStage: command.stopAfterStage
    };
    return persistRecommendationDraft(s, plan);
  }

  // ---- PO-15: resume a PARTIAL/RUNNING run (reuses calculation_run_id) -------
  function resumeRecommendationRun(store, query) {
    aType(isObj(query), 'query must be an object');
    var s = normStore(store);
    var draftId = query.draftId;
    if (!draftId) { validateScopeQuery(query); draftId = draftIdOf(activeKeyOf(query.recommendationType, query.planningCycle, query.businessScope)); }
    var candidates = s.runs.filter(function (r) { return r.draftId === draftId && r.status !== 'COMPLETED'; });
    candidates.sort(function (a, b) { return (b.draftVersion - a.draftVersion) || cmpStr(b.calculationRunId, a.calculationRunId); });
    var run = candidates[0];
    if (!run) return { store: s, result: { status: 'NOOP', reason: 'NO_RESUMABLE_RUN', draftId: draftId } };
    var fromIdx = run.stage == null ? 0 : stageIdx(run.stage) + 1;
    var counts = driveStages(s, run, fromIdx, undefined); // reuses run.calculationRunId + run.plannedLines
    return { store: s, result: buildResult(run, counts, { resumed: true, resumedFromStage: fromIdx < STAGES.length ? STAGES[fromIdx] : 'COMPLETED' }) };
  }

  // ---- user-edit provenance (PO-10: explicit signal, never value comparison)-
  function applyUserEdit(store, edit) {
    aType(isObj(edit) && typeof edit.draftId === 'string' && typeof edit.lineKey === 'string', 'edit requires draftId + lineKey');
    aType(typeof edit.userQty === 'number', 'edit.userQty must be a number');
    aRange(isFinite(edit.userQty) && edit.userQty >= 0, 'edit.userQty must be finite ≥ 0');
    var s = normStore(store);
    var line = findLine(s, lineIdOf(edit.draftId, edit.lineKey));
    aRange(!!line, 'no such line for draftId+lineKey');
    line.userQty = edit.userQty; line.userEdited = true; line.userEditedBy = edit.actor || 'user';
    return { store: s, result: { draftId: edit.draftId, lineKey: edit.lineKey, userQty: edit.userQty, userEdited: true } };
  }

  return {
    createStore: createStore,
    resolveActiveDraft: resolveActiveDraft,
    generateRecommendationDraft: generateRecommendationDraft,
    persistRecommendationDraft: persistRecommendationDraft,
    resumeRecommendationRun: resumeRecommendationRun,
    applyUserEdit: applyUserEdit,
    STAGES: STAGES.slice()
  };
});
