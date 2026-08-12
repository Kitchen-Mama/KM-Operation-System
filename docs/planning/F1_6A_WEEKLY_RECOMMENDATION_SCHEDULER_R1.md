# F1-6A-WEEKLY-RECOMMENDATION-SCHEDULER-R1 — Weekly Recommendation Automation Wiring

**Outcome: IMPLEMENTED (reuse-only wiring; no HALT).** Replaces the Administration → Automation Schedule "Weekly
Recommendation = Coming Soon" placeholder with a real, schedulable automation wired into the EXISTING canonical
recommendation runtime. No second engine, no new table, no new API, no frontend change. Baseline: HEAD after
F1-5C-EXPORT-R3B `7245342`.

## Audit result — every authority already exists; wire, don't invent
- **Administration + schedule config authority = already built** (`ADMIN-AUTOMATION-R1`): `45_api_v1_automation_schedule.gs` owns the schedule config as ONE JSON in Script Properties (`KM_AUTOMATION_SCHEDULE_CONFIG`), reconciles exactly one owned time-trigger per job (delete-then-create allowlist), timezone `Asia/Taipei`. The UI (`automation-schedule.js/.html/.css`), adapter (`KM.DB.getAutomationSchedule/updateAutomationSchedule`), and router (`automationSchedule.get/update`) are all live and data-driven.
- **"Coming Soon" = a registry flag, not a page.** `weeklyRecommendation` was a registry entry with `handler:null` / `implemented:false` (`45_:54`), which rendered the Coming-Soon card and force-disabled it.
- **Canonical recommendation runtime = `runRecommendationGeneration(product)` (`47_:70`)** — the SAME `KMREC.generateBatch` the manual AI Plan uses ("one generator"), gap-DONE gated, non-persistent summary. The codebase pre-built the named trigger wrappers (`47_:90-91`) explicitly "attach to a FUTURE time trigger."
- **planning_cycle = deterministic** via `gapCalcResolveContext_` (`43_:237`) → `RECO-YYYY-MM` (Asia/Taipei, no DST).
- **Idempotency:** the shared owner is non-persistent (writes nothing) → duplicate/near-simultaneous/retry firings cannot create duplicate drafts; the deeper persistence runtime (`24_`) also has deterministic-key reconciliation + ScriptLock.

**HALT conditions A–E: all cleared** (canonical runtime identified; single owner; single config authority; deterministic planning_cycle; retry-safe). No HALT.

## What changed (2 backend files only)
1. `47_api_v1_recommendation_generation.gs` — added `runWeeklyRecommendation()`: a THIN trigger target that (a) defensively no-ops unless the job is enabled in the canonical config, (b) resolves the deterministic planning cycle per product via `gapCalcResolveContext_`, (c) delegates to the ONE shared owner `runRecommendationGeneration('INVENTORY')` + `('ORDER_PLANNING')`. It authors NO recommendation/gap/forecast math and writes nothing.
2. `45_api_v1_automation_schedule.gs` — flipped the `weeklyRecommendation` registry entry to `handler:'runWeeklyRecommendation'`, `implemented:true`. This alone releases the enable-guard (§78), the not-implemented force-disable (§127), and auto-allowlists the handler (§64) — making it WEEKLY-schedulable through the existing `automationSchedule.update` API + trigger reconciler. `defaults` stay **disabled** (USER opts in).

No page/adapter/router/CSS change — the existing data-driven card renders an editable weekly DISABLED card for any `implemented:true` job.

## §11 Completion report
1. PRE HEAD = `7245342`. 2. POST HEAD = this commit.
3. **Administration page owner** = `automation-schedule.html` + `automation-schedule.js` (`#automation-schedule-mount`). 4. **Old Coming-Soon owner** = the `weeklyRecommendation` registry entry (`handler:null`) → data-driven Coming-Soon card. 5. **Canonical settings owner** = `45_` Script-Properties config (`KM_AUTOMATION_SCHEDULE_CONFIG`) — unchanged.
6. **Exact persisted setting fields** = per job: `enabled`, `frequency`, `hour`, `minute`, `dayOfWeek` (WEEKLY), `updatedAt` (derived `status`, `triggerActive` from trigger presence; no `last_run`/`next_run` column exists). 7. **Timezone authority** = `Asia/Taipei` (`AUTOMATION_TZ_` + `appsscript.json`; project TZ) — unchanged.
8. **Trigger owner** = `45_` `automationReconcileTrigger_` (delete-owned-then-create). 9. **Number/type of triggers** = at most ONE time-based trigger per enabled job; Weekly Recommendation = one WEEKLY `onWeekDay().atHour().nearMinute()` trigger calling `runWeeklyRecommendation` when enabled, zero when disabled.
10. **Canonical Recommendation runtime called** = `runRecommendationGeneration(product)` (`47_`) → `KMREC.generateBatch` (the manual AI Plan generator). 11. **Manual runtime relationship** = SAME owner; the on-screen AI Plan runs `KMREC` client-side over loaded gap rows; this scheduler runs the same `KMREC` server-side — one generator, no divergence. Manual workflow untouched.
12. **planning_cycle authority** = `gapCalcResolveContext_` (`43_`) → `RECO-YYYY-MM` (deterministic; reused, not reimplemented). 13. **Idempotency mechanism** = non-persistent shared owner (no writes → no duplicate drafts) + gap-DONE gate; deeper persistence path retains deterministic-key reconciliation + ScriptLock. 14. **ScriptLock owner** = none added (the summary owner needs none; persistence path keeps `24_`/`46_` locks). 15. **Duplicate-trigger proof** = executing `runWeeklyRecommendation` twice only re-delegates; owner writes nothing (test N/O). 16. **Schedule-edit / old-trigger cleanup proof** = reconciler deletes ALL triggers for the exact handler then creates one iff enabled (existing test J + M5). 17. **Enabled=false behavior** = reconciler removes the trigger; handler also defensively no-ops (`WEEKLY_RECOMMENDATION_DISABLED`) (test K / M5). 18. **Run Now** = DEFERRED (safe reuse is possible but requires a UI button + action; out of this bounded surface — documented gap). 19. **Last Run / Next Run** = NOT added (no such column exists; would be a new schema — deliberately not invented).
20. **Files changed** = `45_api_v1_automation_schedule.gs`, `47_api_v1_recommendation_generation.gs`, `automation-schedule-admin-r1.test.js` (4 assertions updated for the now-implemented state), new `weekly-recommendation-scheduler-f1-6a-r1.test.js`, this doc.
21. **Tests added/changed** = 1 new (26 assertions) + existing automation test updated (53/53). 22. **Focused result** = F1-6A 26/26; automation-schedule 53/53. 23. **Full regression** = **204 pass / 4 known baseline** (unchanged baseline).
24. **Apps Script sync** = YES — `45_api_v1_automation_schedule.gs` + `47_api_v1_recommendation_generation.gs`. 25. **Frontend deploy** = NO (UI is data-driven; unchanged). 26. **Bundle rebuild** = NO (no `assets/js/core/*`).
27. **DB/schema impact** = NONE (config lives in Script Properties). 28. **API contract impact** = NONE (reuses `automationSchedule.get/update`). 29. **Formula impact** = NONE. 30. **Recommendation impact** = NONE (runtime unchanged; only newly callable on a schedule). 31. **Forecast/Gap impact** = NONE. 32. **Inventory impact** = NONE. 33. **RO/PO impact** = NONE. 34. **Shipment impact** = NONE. 35. **Export/document impact** = NONE.
36. **USER live verification** = Apps Script sync `45_`+`47_` → open Administration → Automation Schedule; Weekly Recommendation now shows an editable **Disabled** weekly card (not Coming Soon) → set day/time, enable, Save & Apply → exactly one `runWeeklyRecommendation` weekly trigger is created (verify in Apps Script Triggers); disable + Save → trigger removed. When it fires (or when gap jobs are DONE), it runs the canonical recommendation summary for both products; if a gap job isn't DONE that product defers (`GAP_JOB_NOT_DONE`).
37. **Remaining gaps** = (a) **scheduled PERSISTENCE of drafts** — the shared owner is a non-persistent summary in Phase-1; persisting drafts on a schedule needs the resumable RO-draft job (`48_`) to gain trigger self-continuation (it is client-driven today) — a separate future slice, deliberately not touched; (b) **Run Now** button (deferred); (c) **Last Run / Next Run** surface (no column; future). 38. **Commit hash** = chat. 39. **Next authorized slice** = per the RO-draft persistence-on-schedule gap, OR resume `F1-5C-EXPORT-R3C` — user's choice; neither started here.

## FINAL GATE
Coming Soon replaced ✓ · persisted schedule authority (Script Properties) ✓ · weekday/time/timezone deterministic
(Asia/Taipei) ✓ · one canonical trigger owner (`45_`) ✓ · max one Weekly Recommendation trigger ✓ · same Recommendation
runtime reused (`runRecommendationGeneration`→KMREC) ✓ · no second recommendation engine ✓ · no frontend recommendation
math ✓ · planning cycle deterministic (`RECO-YYYY-MM`) ✓ · duplicate/retry safe (non-persistent owner) ✓ · disable/edit
schedule safe (reconciler + defensive no-op) ✓ · manual workflow unchanged ✓ · Recommendation/Forecast/Gap unchanged ✓ ·
RO/PO/Shipment unchanged ✓ · Export/document runtime unchanged ✓ · focused tests green ✓ · no new full-regression
failures ✓.

**STOP after F1-6A-WEEKLY-RECOMMENDATION-SCHEDULER-R1.** Export R3C and Phase-1 E2E NOT begun.
