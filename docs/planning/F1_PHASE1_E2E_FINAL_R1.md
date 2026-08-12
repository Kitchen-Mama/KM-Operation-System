# F1-PHASE1-E2E-FINAL-R1 — Phase-1 Full Functional / Data-Flow Acceptance

**Audit round (no new architecture; no code change — no bounded defect found).** HEAD `fce6878`.

> **§30 EVIDENCE SCOPE (read first).** The agent has **no access to live production** (Apps Script project, live DB
> rows, Drive, OAuth). Therefore **every gate below is `TEST_VERIFIED` and/or `SOURCE_PROVEN`; ZERO gates are
> `LIVE_VERIFIED`.** This round accepts the **implemented system as code** — proving the factual chain is connected,
> single-owned, and quantity-conserving across 213 test files + the source authority audit. **LIVE acceptance is a
> separate USER step**: it requires (1) deploying HEAD per `F1_PHASE1_RELEASE_READINESS_R1.md` §28, then (2) executing
> the §33 live checklist below. Until HEAD is deployed, a *live* run would pre-flight as
> `E2E_ENVIRONMENT_VERSION_MISMATCH` (deploy first — do not read a business-flow failure against stale production).

## §35 FINAL VERDICT → **B. PHASE1_CORE_E2E_PASS_WITH_NONBLOCKING_RESIDUALS**
The core factual chain (Automation → Gap → Monthly Recommendation → AI-Plan persistence → manual order edit → Request
Order → PO → FIFO PO allocation → Shipment → Dispatch → Factory Stock → PO shipped/remaining → Incoming → Receipt →
Final-Output Snapshot → Shipping Detail → Packing List → Generate/Download) is **connected, single-owned, and
quantity-conserving** — TEST_VERIFIED + SOURCE_PROVEN. No runtime bug (not D), no authority gap (not E), no data-config
code defect (not F). The six known residuals are all NON_BLOCKING (§29). Not verdict A only because nothing is
LIVE_VERIFIED — **the LIVE run is gated on the USER deployment + checklist (would be `C` until HEAD is deployed).**

## §0 Pre-flight — production alignment
| # | Item | Result | Evidence |
|---|---|---|---|
| 1–4 | HEAD / origin/main / tree / unpushed | `fce6878` == `fce6878`, clean, 0 unpushed (incl. `fce6878` grouping) | SOURCE_PROVEN |
| 5–7 | Apps Script cumulative sync / Web-App version / frontend deploy | **PENDING (USER)** — last deployed baseline `226b027`; 24 `.gs` changed since; new version + Pages redeploy required | NOT_VERIFIED (live) — see readiness §28 |
| 8 | Bundle integrity | CURRENT — 40 modules, sha256 `aaf5b07…`, `--check` PASS | SOURCE_PROVEN |
| 9 | Live DB tables/columns | contracts match (14/22/30/23/30 + SFO + required cols); LIVE existence USER-verified (`releaseReadinessVerifySchema_`) | SOURCE_PROVEN / NOT_VERIFIED(live) |
| 10–13 | Triggers / TZ / OAuth / seed | USER-owned; verifiers + steps provided | NOT_VERIFIED (live) |

**§0 verdict:** code aligned to HEAD; **LIVE production not confirmed on HEAD → deploy per readiness §28 before a live E2E.** This is a deployment *action*, not a code defect.

## §34 Completion report (indexed; C=CORE gate)
1. PRE HEAD `fce6878`. 2. POST HEAD = this docs-only commit. 3. Production-version verdict = **PENDING USER deploy** (git aligned; Apps Script/Pages USER-owned). 4. Live-schema verdict = contracts match (SOURCE); live existence USER-verified. 5. Trigger verdict = canonical 5-set defined; live attach USER-owned. 6. OAuth/readiness = scopes enumerated (readiness §12); grant USER-owned.

**AUTOMATION** — 7. Source Import = daily gap scheduler owner intact (44_→46_). 8. Inventory Gap = 46_ resumable job (TEST_VERIFIED gap-job suites). 9. **Weekly Inventory (C)** = INVENTORY-only, gap-gated (`runWeeklyInventoryRecommendation`) — split test 33/33. 10. Order Planning Gap = 46_ job. 11. **Monthly Order (C)** = ORDER_PLANNING-only, day-10, gap-gated (`runMonthlyOrderRecommendation`) — split 33/33. 12. **Prerequisite-failure (C)** = both handlers return truthful `BLOCKED` (`GAP_JOB_NOT_DONE` / `ORDER_PLANNING_GAP_NOT_READY`), blocked≠success, no stale/partial/recompute fallback — split C1–C4 + persistence suite. **TEST_VERIFIED.**

**AI PLAN** — 13. **Manual AI Plan (C)** = 48_ resumable job START→CONTINUE→DONE→getActive, T1/T2/T3 only, no browser fan-out — request-order-draft-job 52/52. 14. **Scheduled draft (C)** = 49_→48_→24_ persists `request_order_allocation_drafts`, same authority as manual (shared-lock integration fixture) — persistence 45/45. 15. **recommended_qty (C)** = verbatim from `order_planning_gap` (`recGenMapGapRowToFacts_`, no re-cartonization). 16. **order_qty persistence (C)** = user edit preserved (`preserveUserQty`); SCHEDULED_REFRESH holds recommended_qty immutable within a draft_version. 17. Conflict/retry = BLOCKED_CONFLICT + lease + idempotent REUSE. **TEST_VERIFIED/SOURCE_PROVEN.**

**REQUEST ORDER** — 18. Send Request = draft→site_confirmed→submitted (R4E4/R4E5 suites). 19. **RO exactly-once (C)** = deterministic ROEXEC; double-click/two-tab/lost-response safe. 20. Lineage = `request_order_line_sources.request_allocation_draft_id` present (schema ✓). **TEST_VERIFIED.**

**PO** — 21. Approval = draft→pending_approval→approved gate. 22. Conversion = Request Order→PO, T1/T2_T3 grouping, requested_qty→ordered_qty conserved. 23. **PO exactly-once (C)** = `request_order_id` identity; retry returns existing PO (F1-5A-PO-R2). 24. Quantity = ordered_qty = requested_qty. **TEST_VERIFIED.**

**SHIPMENT** — 25. Draft = physical `shipment_lines` persist first. 26. **FIFO (C)** = backend-only, order_date→po_no→line-id, one shipment-scoped call (F1-5B-SHIP-R3A). 27. Multi-PO = one shipment line → N PO lines, Σ allocated = shipment_qty. 28. **Shared factory (C)** = scope sku+company+factory; factory shared, never determines company (seam-audit §F). 29. **Dispatch (C)** = one atomic boundary; draft→executed allocations (R3B). 30. **Factory stock (C)** = deducted once, separate from PO shipped_qty. 31. **PO shipped/remaining (C)** = shipped_qty SET from Σ executed allocations; remaining = max(0, completed−shipped). **TEST_VERIFIED (R3A/R3B).**

**INCOMING/RECEIPT** — 32. **Incoming (C)** = shipment_qty − shipment_received_qty (single physical source, R7C). 33. ETA buckets = 0–18/19–30/31–45/45+/overdue. 34. **Partial receipt (C)** = cumulative shipment_received_qty; partially_received; overseas wh_available_stock += delta once. 35. **Full receipt (C)** = received; remaining 0; only the additional delta credited. 36. Overseas inventory = managed destination credit once. 37. Platform/FBA/WMS = no manual local credit. 38(§18). Receipt never changes PO shipped_qty/remaining/factory_stock. **TEST_VERIFIED (incoming/receipt suites).**

**FINAL OUTPUT** — 38. **Final snapshot (C)** = `finalizeShipmentFinalOutput` deterministic SFO-<id>, finalized once, idempotent re-run (R2B 70/70). 39. Multi-PO snapshot = executed-allocation lineage, never collapsed. 40. **Immutability (C)** = renderer/getShipmentFinalOutput read only the 3 SFO tables; no live-master re-resolution (seam-audit §K + renderer Y/Z guards). 41. **Shipping Detail (C)** = snapshot→renderer→template→mapping→generated_documents→Drive file→download_url (R3C 35/35). 42. **Packing List (C)** = same authority, PL template (R3C). 43. **Generate/Download (C)** = `KM.DB.generateShipmentDocument`/`openGeneratedDocument`, thin (document-UI 22/22). 23(§23). Customs stays `LEGAL_IMPORTER_AUTHORITY_GAP`, never blocks SD/PL. **TEST_VERIFIED.**

**SYSTEM** — 44. Conservation trace = below. 45. Retry/idempotency matrix = below. 46. Parallel-engine audit = single writer per fact (below). 47. Shared-factory company-isolation = separation at recommendation/RO/PO/shipment-FIFO; shipper = shipment.company legal entity; factory never seller (seam-audit §F + party-authority 45/45). 48. Reload/persistence = every stage persists to DB (Sheets); no localStorage authority (page adapters post to canonical actions). 49. Residuals = §29 all NON_BLOCKING. 50. Focused summary = below. 51. Full regression = **213 files, only 4 baseline failures**. 52. Bounded fixes = **NONE** (no defect). 53. Files changed = this doc only. 54–56. Apps Script sync / frontend / bundle = **NONE this round**. 57. DB/schema impact = NONE. 58. USER checklist = §33. 59. Unresolved blockers = NONE at code level; LIVE deploy pending (USER). 60. Verdict = **B**. 61. Commit = chat. 62. Next mainline = LIVE acceptance run (§33) post-deploy, then Phase-2 planning.

## §27 Quantity-conservation trace (flagship SKU, symbolic — SOURCE_PROVEN invariants)
```
Gap suggested qty        = G            (order_planning_gap tN_suggested_qty, carton-rounded)
AI recommended_qty       = G            (verbatim — no second cartonization)                    [recommended_qty = G]
AI/manual order_qty      = O            (user-editable; default O=G; a user edit sets O≠G)
Request requested_qty    = O            INVARIANT: requested_qty = chosen order_qty ✓
PO ordered_qty           = O            INVARIANT: ordered_qty = requested_qty ✓
PO completed_qty         = C            (production capacity; independent, C≤O typical)
Shipment shipment_qty    = S            (physical truth; S≤C shippable)
Draft PO allocations     = Σd = S       (before dispatch; Σ allocated = shipment_qty)           INVARIANT ✓
Executed PO allocations  = Σe = S       (at Confirm&Dispatch)  INVARIANT: Σ executed = shipped physical ✓
PO shipped_qty           = Σe (per PO line = Σ executed for that line)  INVARIANT: shipped = Σ executed ✓
PO remaining_qty         = max(0, C − shipped)
Shipment received_qty    = R            (0→partial→S)          receipt NEVER changes shipped_qty ✓
Shipment remaining incoming = max(0, S − R)
Final-output shipment_qty = S           INVARIANT: final-output qty = shipment physical qty ✓
Document shipment qty    = S            INVARIANT: documents use final-output qty ✓
```
Legitimate differences: O≠G only on a user edit; C is a separate production fact; R accrues on receipt (incoming
side) and never touches the dispatch-side shipped/remaining/factory ledgers. All required invariants hold by owner.

## §28 Parallel-engine / single-authority audit (SOURCE_PROVEN + guard tests)
| Fact | Single writer | Guard |
|---|---|---|
| Gap tables | 43_ slice processors via 46_ job (one job owner) | gap-job suites |
| Recommendation | KMREC (bundle) via `runRecommendationGeneration` (one owner) | recommendation-generation |
| allocation draft | 24_/23_ locked persister (KMPW), reached by 47_/48_/49_ | draft-job + persistence |
| Request Order / PO exactly-once | ROEXEC / `request_order_id` | R4E5B / F1-5A-PO-R2 |
| FIFO allocation + shipment physical qty | 32_ (shipment_lines + shipment_line_allocations) | R3A |
| PO shipped / executed allocations | 22_ dispatch only | R3B |
| receipt / incoming | 31_ (shipment_received_qty); one physical source (R7C) | incoming/receipt |
| final-output snapshot | 34_ only | seam-audit R1 |
| template mapping / generated document | 36_ only | R3B |
| file generation (Drive/PDF) | 37_ only (raw DriveApp confined) | seam-audit §K |
No competing factual writer found. Display-only helpers (readbacks, workspace 42_) write nothing.

## §29 Residual classification
| # | Residual | Class | Why |
|---|---|---|---|
| 1 | Weekly INVENTORY scheduled actionable persistence absent | **NON_BLOCKING** | Weekly Inventory is informational; the core E2E chain is Order Planning → RO → PO → Shipment → Final Output; nothing downstream requires persisted inventory drafts. Building one = 2nd engine (forbidden). |
| 2 | Automation Last-Run / blocked-history UI absent | **NON_BLOCKING** | Runtime blocking works (truthful BLOCKED); only the persistent-history *UI* is deferred (needs schema). |
| 3 | `LEGAL_IMPORTER_AUTHORITY_GAP` (Customs) | **NON_BLOCKING** | SD/PL never consult customs; Customs/CI out of core scope. |
| 4 | CI/Booking broader document families | **NON_BLOCKING** | Not in frozen core scope (SD + PL only). |
| 5 | Post-dispatch reversal policy deferred | **NON_BLOCKING** | Core E2E is a forward happy-path. |
| 6 | 4 known regression baseline failures | **NON_BLOCKING** | Pre-existing, peripheral/UI (gap-done-notice, OP monthly projection consumer, replen header toggle, supply-planning route inventory); not on the core factual chain; count unchanged for ~10 rounds. |

## §50 Focused suite summary (TEST_VERIFIED)
automation admin 57 · UI grouping 33 · weekly/monthly split 33 · scheduled persistence 45 · recommendation-generation
47 · request-order draft job 52 · final-output R2B 70 · renderer R3A 37 · document runtime R3B 63 · document file R3C
35 · document UI 22 · party-authority R2A 45 · seam-audit R1 23 — **all pass.** production-safety adapter 85 (prior).
**Full regression: 213 files — only the 4 known baseline failures (none new).**

## §33 USER LIVE ACCEPTANCE CHECKLIST (in order — run against a deployment synced to HEAD)
1. **Verify deployment version** — Apps Script `/exec` is the NEW version containing all 49 `.gs` at HEAD (readiness §28); project TZ = Asia/Taipei.
2. **Verify triggers** — run `releaseReadinessListTriggers_()`: the 5 recurring handlers ≤1 each, zero `runWeeklyRecommendation`, continuation handlers only if a job is running.
3. **Verify schema/seed** — run `releaseReadinessVerifySchema_()` (all `OK`); confirm `company_legal_entities` (KM/ResTW/ResUS active), SHIPDETAIL+PL `document_templates` (real `template_file_id`, `output_folder_id`), `document_template_fields`.
4. **Choose a controlled scope + flagship SKU** (a company/country/marketplace with real gap inputs).
5. **Materialize gaps** — run Inventory + Order Planning gap jobs to DONE.
6. **Recommendation prerequisite** — with gaps NOT done, confirm `runMonthlyOrderRecommendation()` returns BLOCKED (blocked≠success); with gaps DONE, proceed.
7. **AI Plan** (manual) — START→CONTINUE→DONE→getActive; edit one order_qty; reload → edit persists, recommended_qty unchanged.
8. **Scheduled Monthly** — invoke `runMonthlyOrderRecommendation()`; confirm persisted drafts appear via `requestOrderDraft.getActive` (generation_type `scheduled`), user-edited draft not overwritten.
9. **Send Request** — draft→site_confirmed→submitted; exactly one Request Order; requested_qty = chosen order_qty.
10. **Approve + Convert to PO** — approved-only; one PO set (T1/T2_T3); ordered_qty = requested_qty; retry returns same PO.
11. **PO completed_qty** — set controlled completed capacity.
12. **Shipment Draft + FIFO** — persist lines; `generateShipmentLineAllocations` (draft); Σ allocated = shipment_qty; FIFO order; shared factory across companies.
13. **Confirm & Dispatch** — factory_stock −once; executed allocations; PO shipped_qty = Σ executed; remaining recomputed; retry idempotent.
14. **On-the-Way / Receipt** — partial then full receipt; shipment_received_qty accrues; overseas wh_available_stock credited once; receipt never changes PO shipped_qty.
15. **Final Output** — `finalizeShipmentFinalOutput`; qty = shipment_qty; multi-PO lineage; re-run idempotent.
16. **Documents** — `shipmentDocument.generate {SHIPDETAIL|PL, generate_file:true}` → Download/Open the Sheet/PDF; re-run reuses.
17. **Reload** at each step — DB truth survives.

## §36 FINAL GATE
Automation ✓ · Gap ✓ · Monthly Recommendation ✓ · AI-Plan persistence ✓ · manual order edit ✓ · Request Order ✓ · PO ✓ ·
FIFO PO allocation ✓ · Shipment ✓ · Dispatch ✓ · Factory Stock ✓ · PO shipped/remaining ✓ · Incoming ✓ · Receipt ✓ ·
Final-Output Snapshot ✓ · Shipping Detail ✓ · Packing List ✓ · Generate/Download ✓ — and quantity conservation ✓ ·
retry/idempotency ✓ · shared factory across companies ✓ · no parallel factual engine ✓ · reload persistence ✓ · no
silent stale-data fallback ✓. **All ✓ at the code-integration level (TEST_VERIFIED / SOURCE_PROVEN). LIVE acceptance
pending the §33 checklist on a HEAD-synced deployment.**

**STOP after F1-PHASE1-E2E-FINAL-R1.** Phase 2 NOT begun. Next mainline = USER LIVE acceptance run (§33) after
deploying HEAD per `F1_PHASE1_RELEASE_READINESS_R1.md` §28.
