# S5-R1 — Decision board

Six unresolved business policies block S5-R2. Each was searched for in the canonical specs before being
declared unowned — none is a question the system has already answered somewhere else.

**No S5 implementation may proceed around any of these.** Full options, effects and reasoning: §15 of
`docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md`.

| id | Question | Recommended | Blocks |
|---|---|---|---|
| **D-S5-1** | One donor surplus, two or more contending receivers — how is it divided? | **A — deterministic §35 priority order**, serve in full until exhausted | live cross-company reallocation with contention |
| **D-S5-2** | Should a recommendation carry *what to do*, not only *how much*? | **A — freeze the enum, derive it, store nothing yet** | the Recommendation workspace action column (§14) |
| **D-S5-3** | When several sources could cover a residual, which is recommended first? | **A — consumption order is the recommendation order** | ranking of `USE_COMMITTED_PRODUCTION` vs `NEW_ORDER` |
| **D-S5-4** | Reason tokens, free text, or numbers only? | **A — closed token set**, reusing the existing blocked-reason style | `WHY_THIS_RECOMMENDATION` (§8) |
| **D-S5-5** | Rename the frozen `draft/submitted/cancelled` vocabulary to `PROPOSED/APPROVED/…`? | **A — keep the frozen one** (strongly) | nothing, if declined |
| **D-S5-6** | Does an un-actioned recommendation go stale? | **C — flag for display, never mutate the row** | cycle rollover behaviour |

---

## Why each is genuinely unowned

**D-S5-1.** §12's worked example nets a *group* total and never divides one donor across receivers. §32A fixes
per-pair eligibility and §41 fixes donor protection, but neither arbitrates between two eligible receivers
competing for the same surplus. No "split", minimum-transfer or proration rule exists in any canonical spec.

**D-S5-2.** The only `recommendation_type` in the system is the **run** type `{WEEKLY_SHIPPING,
MONTHLY_ORDER}` — a different question. `API_RECOMMENDATION_WORKSPACE_SPEC.md` explicitly lists
`ORDER/TRANSFER/BORROW/NO_ACTION` as *forbidden and omitted* from its response today. Measured: zero action
tokens in the live recommendation path.

**D-S5-3.** §41.3 fixes the order supply is **consumed**. It says nothing about which action to *recommend*
when more than one remains possible. The cost/lead-time authority an alternative would need does not exist —
`55_` returns a SKU-scalar lead time with no origin/destination grain.

**D-S5-4.** Blocked-reason tokens exist (`RECOMMENDATION_LINE_NOT_FOUND`, `ONGOING_ORDER_ETA_UNRESOLVED`), but
there is no vocabulary for why a *successful* recommendation came out the way it did.

**D-S5-5.** The vocabulary **is** frozen — `draft/submitted/cancelled` per tier, plus `user_edited` and
`draft_version`. It is simply not the one the task proposes, and all six proposed states map onto it. This is
recorded so a later round does not mistake "different" for "missing".

**D-S5-6.** No expiry, TTL or staleness rule exists for a recommendation. The cadence is monthly and a new
cycle creates a new draft, but nothing marks last month's un-actioned draft as stale. Note that Option B
(auto-cancel at rollover) would contradict `HISTORICAL_DECISION_MUTATION_ALLOWED = NO`, which is why the
recommendation is C.

---

## Carried forward from earlier rounds — not S5's to decide

| Token | Owner |
|---|---|
| `PHYSICAL_CROSS_COMPANY_RESERVATION_DEFERRED` | §41.1 — Phase 2 |
| `PHASE_1_BASELINE_TIMING_AUTHORITY` (ongoing PO anchored to `expected_completion_date`) | §44.3 — Phase 2 may supersede |
| `S6 CONNECTED_NOT_ATOMIC` (approved plan with no shipment draft) | dual mainline audit §K |
| Overseas cross-company availability | §5 — not Phase 1; overseas is company-owned |

## Operator-owned, carried from S4 (unchanged by this round)

Push `3f48f58` and this round's commit · deploy the frontend and rotate the app token · run
`docs/evidence/s3-r13-fc-special-deferred/S3_FINAL_OPERATOR_CAPTURE.md` · the remaining S4-R1 deferred
decisions · the pre-existing A0 §G.9 label-ban hit at `carrier-rate-card.js:840`.
