// Kitchen Mama Operation System — Recommendation Persistence pure runtime tests (Phase 2C, Round 1B).
// Run: node assets/tests/supply-planning-persistence.test.js
// Exercises the frozen §Persist-Orch contract implemented in assets/js/core/supply-planning-persistence.js.
// Pure Node, no DOM/DB/Runtime. Canonical literal expectations only.

'use strict';
var P = require('../js/core/supply-planning-persistence.js');
var createStore = P.createStore;
var resolveActiveDraft = P.resolveActiveDraft;
var generate = P.generateRecommendationDraft;
var persist = P.persistRecommendationDraft;
var resume = P.resumeRecommendationRun;
var applyUserEdit = P.applyUserEdit;

var fail = 0, pass = 0;
function ok(cond, label) { if (!cond) { fail++; console.error('FAIL ' + label); } else { pass++; console.log('ok   ' + label); } }
function eq(actual, expected, label) {
  var A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); } else { pass++; console.log('ok   ' + label); }
}
function throwsType(fn, label) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; console.log('ok   ' + label); return; } fail++; console.error('FAIL ' + label + ' (threw ' + (e && e.name) + ', expected TypeError)'); return; } fail++; console.error('FAIL ' + label + ' (no throw)'); }
function throwsRange(fn, label) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; console.log('ok   ' + label); return; } fail++; console.error('FAIL ' + label + ' (threw ' + (e && e.name) + ', expected RangeError)'); return; } fail++; console.error('FAIL ' + label + ' (no throw)'); }

// --- fixtures --------------------------------------------------------------
var SCOPE_M = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'MONTHLY' };
function cmd(over) {
  var base = {
    recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-08', businessScope: SCOPE_M,
    mode: 'SCHEDULED_REFRESH', actor: 'system',
    formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03',
    recommendedLines: [
      { lineKey: '2026-08|T1', recommendedQty: 100 },
      { lineKey: '2026-08|T2', recommendedQty: 60 }
    ]
  };
  var o = {}; for (var k in base) o[k] = base[k]; if (over) for (var j in over) o[j] = over[j]; return o;
}
function draftOf(store) { return store.drafts[0]; }
function lineByKey(store, key) { return store.lines.filter(function (l) { return l.lineKey === key; })[0]; }

// ==========================================================================
console.log('\n== resolveActiveDraft (PO-6) ==');

(function () {
  var s0 = createStore();
  eq(resolveActiveDraft(s0, cmd()).status, 'CREATE', 'resolve: 0 active → CREATE');
  var g = generate(s0, cmd());
  eq(g.result.status, 'COMPLETED', 'resolve: first generate COMPLETED');
  eq(resolveActiveDraft(g.store, cmd()).status, 'REUSE', 'resolve: 1 active → REUSE');
})();

// duplicate active → BLOCKED_CONFLICT (never auto-repair / latest-wins)
(function () {
  var g = generate(createStore(), cmd());
  var dup = clone(g.store);
  var d2 = clone(dup.drafts[0]); d2.draftId = d2.draftId + '::DUP'; d2.calculationRunId = 'RUN::DUP'; dup.drafts.push(d2);
  eq(resolveActiveDraft(dup, cmd()).status, 'BLOCKED_CONFLICT', 'resolve: >1 active → BLOCKED_CONFLICT');
  var g2 = generate(dup, cmd());
  eq(g2.result.status, 'BLOCKED', 'generate over duplicate active → BLOCKED');
  eq(g2.result.reason, 'DUPLICATE_ACTIVE_DRAFT', 'generate duplicate reason');
  eq(g2.store.drafts.length, 2, 'generate duplicate: store unchanged (no silent pick / no 3rd draft)');
})();
function clone(x) { return JSON.parse(JSON.stringify(x)); }

// ==========================================================================
console.log('\n== create + write order + totals ==');

(function () {
  var g = generate(createStore(), cmd());
  eq(g.store.drafts.length, 1, 'create: one draft');
  eq(g.store.lines.length, 2, 'create: two lines');
  eq(g.store.runs.length, 1, 'create: one run');
  eq(draftOf(g.store).status, 'draft', 'create: draft status = draft (active)');
  eq(draftOf(g.store).draftVersion, 1, 'create: draft_version = 1');
  eq(g.result.stage, 'COMPLETED', 'create: run reached COMPLETED');
  eq(g.store.runs[0].status, 'COMPLETED', 'create: run status COMPLETED');
  eq(draftOf(g.store).totals, { totalRecommendedQty: 160, totalUserQty: 160, activeLineCount: 2, blockedCount: 0, supersededCount: 0 }, 'create: totals recomputed');
  eq(lineByKey(g.store, '2026-08|T1').userQty, 100, 'create: userQty init = recommended (PO-10)');
  eq(lineByKey(g.store, '2026-08|T1').userEdited, false, 'create: line not user-edited on create');
})();

// input never mutated
(function () {
  var s0 = createStore(); var c = cmd();
  generate(s0, c);
  eq(s0, { drafts: [], lines: [], runs: [] }, 'purity: input store not mutated');
  eq(c.recommendedLines.length, 2, 'purity: input command lines not mutated');
})();

// ==========================================================================
console.log('\n== calculation_run_id + draft_version (PO-7 / PO-8) ==');

(function () {
  var g = generate(createStore(), cmd());
  var run1 = g.result.calculationRunId;
  // scheduled refresh reuses version + run id
  var g2 = generate(g.store, cmd());
  eq(g2.result.draftVersion, 1, 'refresh: draft_version unchanged (=1)');
  eq(g2.result.calculationRunId, run1, 'refresh: reuses calculation_run_id');
  eq(g2.store.runs.length, 1, 'refresh: no duplicate run row');
  // manual regenerate (no user edits) → new run id + version+1
  var g3 = generate(g2.store, cmd({ mode: 'MANUAL_REGENERATE', recommendedLines: [ { lineKey: '2026-08|T1', recommendedQty: 120 }, { lineKey: '2026-08|T2', recommendedQty: 60 } ] }));
  eq(g3.result.draftVersion, 2, 'regenerate: draft_version +1');
  ok(g3.result.calculationRunId !== run1, 'regenerate: new calculation_run_id');
  eq(g3.store.runs.length, 2, 'regenerate: second run row');
  eq(lineByKey(g3.store, '2026-08|T1').recommendedQty, 120, 'regenerate: recommended_qty recomputed');
  eq(lineByKey(g3.store, '2026-08|T1').userQty, 120, 'regenerate (no edits): userQty follows recommended');
})();

// ==========================================================================
console.log('\n== user-edit protection (PO-10) ==');

(function () {
  var g = generate(createStore(), cmd());
  var draftId = draftOf(g.store).draftId;
  var e = applyUserEdit(g.store, { draftId: draftId, lineKey: '2026-08|T1', userQty: 90, actor: 'planner' });
  eq(lineByKey(e.store, '2026-08|T1').userQty, 90, 'edit: userQty updated');
  eq(lineByKey(e.store, '2026-08|T1').userEdited, true, 'edit: userEdited flag set (explicit provenance)');
  // scheduled refresh must NOT overwrite the user-edited qty (even though recommended is unchanged)
  var g2 = generate(e.store, cmd());
  eq(lineByKey(g2.store, '2026-08|T1').userQty, 90, 'refresh: user-edited planned/order qty preserved');
  eq(lineByKey(g2.store, '2026-08|T1').recommendedQty, 100, 'refresh: recommended_qty immutable in version');
  // refresh on an UNEDITED line may keep following recommended (untouched)
  eq(lineByKey(g2.store, '2026-08|T2').userQty, 60, 'refresh: untouched line unchanged');
  // manual regenerate over user edits WITHOUT confirmation → BLOCKED
  var g3 = generate(e.store, cmd({ mode: 'MANUAL_REGENERATE', recommendedLines: [ { lineKey: '2026-08|T1', recommendedQty: 130 }, { lineKey: '2026-08|T2', recommendedQty: 60 } ] }));
  eq(g3.result.status, 'BLOCKED', 'regenerate over edits w/o confirm → BLOCKED');
  eq(g3.result.reason, 'REGENERATE_NEEDS_CONFIRMATION', 'regenerate blocked reason');
  eq(lineByKey(g3.store, '2026-08|T1').userQty, 90, 'regenerate blocked: user edit still preserved (store unchanged)');
  eq(g3.store.runs.length, 1, 'regenerate blocked: no new run (version not consumed)');
  // with confirmation → regenerate proceeds and re-inits user qty
  var g4 = generate(e.store, cmd({ mode: 'MANUAL_REGENERATE', confirmRegenerateOverUserEdits: true, recommendedLines: [ { lineKey: '2026-08|T1', recommendedQty: 130 }, { lineKey: '2026-08|T2', recommendedQty: 60 } ] }));
  eq(g4.result.status, 'COMPLETED', 'regenerate confirmed → COMPLETED');
  eq(g4.result.draftVersion, 2, 'regenerate confirmed: version +1');
  eq(lineByKey(g4.store, '2026-08|T1').userQty, 130, 'regenerate confirmed: userQty re-init to new recommended');
  eq(lineByKey(g4.store, '2026-08|T1').userEdited, false, 'regenerate confirmed: userEdited reset');
})();

// failed (blocked) regenerate does not consume a version
(function () {
  var g = generate(createStore(), cmd());
  var e = applyUserEdit(g.store, { draftId: draftOf(g.store).draftId, lineKey: '2026-08|T1', userQty: 90 });
  var before = e.store.drafts[0].draftVersion;
  var g3 = generate(e.store, cmd({ mode: 'MANUAL_REGENERATE' }));
  eq(g3.result.status, 'BLOCKED', 'version guard: blocked regenerate');
  eq(g3.store.drafts[0].draftVersion, before, 'version guard: draft_version not consumed by blocked regenerate');
})();

// ==========================================================================
console.log('\n== reconcile (PO-13) ==');

(function () {
  var g = generate(createStore(), cmd());
  // regenerate with T2 removed and T3 added
  var g2 = generate(g.store, cmd({ mode: 'MANUAL_REGENERATE', recommendedLines: [ { lineKey: '2026-08|T1', recommendedQty: 100 }, { lineKey: '2026-08|T3', recommendedQty: 40 } ] }));
  eq(lineByKey(g2.store, '2026-08|T1').lineStatus, 'ACTIVE', 'reconcile: kept line ACTIVE');
  eq(lineByKey(g2.store, '2026-08|T3').lineStatus, 'ACTIVE', 'reconcile: new line inserted ACTIVE');
  eq(lineByKey(g2.store, '2026-08|T2').lineStatus, 'SUPERSEDED', 'reconcile: removed system line SUPERSEDED (not deleted)');
  eq(g2.store.lines.length, 3, 'reconcile: no rows hard-deleted');
  eq(draftOf(g2.store).totals.activeLineCount, 2, 'reconcile: totals exclude superseded');
})();

// removed USER-EDITED line is preserved + flagged, never dropped
(function () {
  var g = generate(createStore(), cmd());
  var e = applyUserEdit(g.store, { draftId: draftOf(g.store).draftId, lineKey: '2026-08|T2', userQty: 55 });
  var g2 = generate(e.store, cmd({ mode: 'MANUAL_REGENERATE', confirmRegenerateOverUserEdits: true, recommendedLines: [ { lineKey: '2026-08|T1', recommendedQty: 100 } ] }));
  eq(lineByKey(g2.store, '2026-08|T2').lineStatus, 'SUPERSEDED_USER_REVIEW', 'reconcile: removed user-edited line → SUPERSEDED_USER_REVIEW');
  eq(lineByKey(g2.store, '2026-08|T2').userQty, 55, 'reconcile: user-edited value retained for review');
})();

// ==========================================================================
console.log('\n== blocked lines (PO-14; §34A/§39/§40 tokens, never auto-0) ==');

(function () {
  var g = generate(createStore(), cmd({ recommendedLines: [
    { lineKey: '2026-08|T1', recommendedQty: 100 },
    { lineKey: '2026-08|T2', lineState: 'BLOCKED', reason: 'DEMAND_SOURCE_QTY_CONFLICT' }
  ] }));
  var bl = lineByKey(g.store, '2026-08|T2');
  eq(bl.lineStatus, 'BLOCKED', 'blocked: line marked BLOCKED');
  eq(bl.reason, 'DEMAND_SOURCE_QTY_CONFLICT', 'blocked: reason token preserved');
  eq(bl.recommendedQty, null, 'blocked: qty never fabricated to 0');
  eq(bl.userQty, null, 'blocked: user qty not fabricated');
  eq(draftOf(g.store).totals, { totalRecommendedQty: 100, totalUserQty: 100, activeLineCount: 1, blockedCount: 1, supersededCount: 0 }, 'blocked: totals count blocked separately, exclude from active sum');
  eq(g.result.status, 'COMPLETED', 'blocked line does not block the whole draft (per-line)');
  // a MISSING_SNAPSHOT token flows through the same way
  var g2 = generate(createStore(), cmd({ recommendedLines: [ { lineKey: '2026-08|T1', lineState: 'BLOCKED', reason: 'MISSING_SNAPSHOT' } ] }));
  eq(lineByKey(g2.store, '2026-08|T1').reason, 'MISSING_SNAPSHOT', 'blocked: §34A MISSING_SNAPSHOT token preserved');
})();

// ==========================================================================
console.log('\n== partial write + resume (PO-12 / PO-15) ==');

(function () {
  // partial write: stop after LINES (totals not yet computed)
  var g = generate(createStore(), cmd({ stopAfterStage: 'LINES' }));
  eq(g.result.status, 'PARTIAL', 'partial: run status PARTIAL');
  eq(g.result.stage, 'LINES', 'partial: stopped at LINES');
  eq(draftOf(g.store).totals, null, 'partial: totals not yet written');
  eq(g.store.runs[0].status, 'PARTIAL', 'partial: run row PARTIAL');
  var runId = g.result.calculationRunId;
  // resume → completes, REUSING the calculation_run_id
  var r = resume(g.store, { draftId: draftOf(g.store).draftId });
  eq(r.result.status, 'COMPLETED', 'resume: run COMPLETED');
  eq(r.result.calculationRunId, runId, 'resume: reuses calculation_run_id');
  eq(r.result.resumed, true, 'resume: flagged resumed');
  eq(draftOf(r.store).totals.totalRecommendedQty, 160, 'resume: totals computed after resume');
  eq(r.store.runs.length, 1, 'resume: no duplicate run');
  eq(r.store.lines.length, 2, 'resume: no duplicate lines');
  // resume when nothing resumable → NOOP
  var r2 = resume(r.store, { draftId: draftOf(r.store).draftId });
  eq(r2.result.status, 'NOOP', 'resume: completed run → NOOP');
})();

// resume from an early partial (stop after HEADER — lines not written yet)
(function () {
  var g = generate(createStore(), cmd({ stopAfterStage: 'HEADER' }));
  eq(g.store.lines.length, 0, 'partial@HEADER: no lines yet');
  var r = resume(g.store, { draftId: draftOf(g.store).draftId });
  eq(r.result.status, 'COMPLETED', 'resume@HEADER: completes');
  eq(r.store.lines.length, 2, 'resume@HEADER: lines written from captured run intent');
  eq(draftOf(r.store).totals.totalRecommendedQty, 160, 'resume@HEADER: totals correct');
})();

// ==========================================================================
console.log('\n== retry idempotency (PO-8 / PO-19) ==');

(function () {
  // full retry: re-run generate → business state (drafts + lines) idempotent, no duplicates.
  // (The run's `action` label legitimately changes CREATE→REFRESH on the second call; business state does not.)
  var s0 = createStore();
  var a = generate(s0, cmd());
  var b = generate(a.store, cmd());
  eq({ drafts: b.store.drafts, lines: b.store.lines }, { drafts: a.store.drafts, lines: a.store.lines }, 'retry: business state (drafts+lines) idempotent');
  eq(b.store.drafts.length, 1, 'retry: no duplicate draft');
  eq(b.store.lines.length, 2, 'retry: no duplicate lines');
  eq(b.store.runs.length, 1, 'retry: no duplicate run');
  // two successive refreshes are fully byte-identical (same action + no state churn)
  var c = generate(b.store, cmd());
  eq(c.store, b.store, 'retry: refresh→refresh fully idempotent (byte-identical store)');
  // retry after a PARTIAL via re-generate (not resume) also converges
  var p = generate(createStore(), cmd({ stopAfterStage: 'LINES' }));
  var p2 = generate(p.store, cmd()); // re-generate full (SCHEDULED_REFRESH reuses version + run id)
  eq(p2.result.status, 'COMPLETED', 'retry-after-partial: re-generate completes');
  eq(p2.result.calculationRunId, p.result.calculationRunId, 'retry-after-partial: same calculation_run_id');
  eq(p2.store.runs.length, 1, 'retry-after-partial: no duplicate run');
})();

// ==========================================================================
console.log('\n== determinism ==');

(function () {
  var c = cmd();
  eq(generate(createStore(), c).store, generate(createStore(), c).store, 'determinism: same input → identical store');
  eq(generate(createStore(), c).result, generate(createStore(), c).result, 'determinism: same input → identical result');
  // scope key is order-independent
  var c1 = cmd({ businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'MONTHLY' } });
  var c2 = cmd({ businessScope: { draft_purpose: 'MONTHLY', marketplace: 'AMAZON_US', country: 'US', company: 'KM' } });
  eq(generate(createStore(), c1).store, generate(createStore(), c2).store, 'determinism: business scope key is field-order independent');
})();

// weekly type + distinct scope produce distinct drafts (no cross-type collision)
(function () {
  var s = createStore();
  var m = generate(s, cmd());
  var w = generate(m.store, cmd({ recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W32', businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'REPLENISH' }, recommendedLines: [ { lineKey: 'SKU1|SITE1|W32', recommendedQty: 20 } ] }));
  eq(w.store.drafts.length, 2, 'scope: weekly + monthly are distinct Active Drafts');
  eq(resolveActiveDraft(w.store, cmd()).status, 'REUSE', 'scope: monthly still resolvable after weekly added');
})();

// ==========================================================================
console.log('\n== validation (structural throws) ==');

throwsRange(function () { generate(createStore(), cmd({ recommendationType: 'X' })); }, 'validate: unknown recommendationType → RangeError');
throwsRange(function () { generate(createStore(), cmd({ mode: 'X' })); }, 'validate: unknown mode → RangeError');
throwsType(function () { generate(createStore(), cmd({ planningCycle: 123 })); }, 'validate: non-string planningCycle → TypeError');
throwsType(function () { generate(createStore(), cmd({ businessScope: 'x' })); }, 'validate: non-object businessScope → TypeError');
throwsType(function () { generate(createStore(), cmd({ recommendedLines: 'x' })); }, 'validate: non-array recommendedLines → TypeError');
throwsType(function () { generate(createStore(), cmd({ recommendedLines: [ { lineKey: '', recommendedQty: 1 } ] })); }, 'validate: empty lineKey → TypeError');
throwsType(function () { generate(createStore(), cmd({ recommendedLines: [ { lineKey: 'k', recommendedQty: '1' } ] })); }, 'validate: non-number recommendedQty → TypeError');
throwsRange(function () { generate(createStore(), cmd({ recommendedLines: [ { lineKey: 'k', recommendedQty: -5 } ] })); }, 'validate: negative recommendedQty → RangeError');
throwsRange(function () { generate(createStore(), cmd({ recommendedLines: [ { lineKey: 'k', recommendedQty: NaN } ] })); }, 'validate: NaN recommendedQty → RangeError');
throwsRange(function () { generate(createStore(), cmd({ recommendedLines: [ { lineKey: 'd', recommendedQty: 1 }, { lineKey: 'd', recommendedQty: 2 } ] })); }, 'validate: duplicate lineKey → RangeError');
throwsType(function () { generate(createStore(), cmd({ recommendedLines: [ { lineKey: 'b', lineState: 'BLOCKED' } ] })); }, 'validate: BLOCKED line without reason → TypeError');
throwsRange(function () { applyUserEdit(generate(createStore(), cmd()).store, { draftId: 'nope', lineKey: 'x', userQty: 1 }); }, 'validate: user edit on missing line → RangeError');

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1B Recommendation Persistence assertions passed (' + pass + ' assertions).');
