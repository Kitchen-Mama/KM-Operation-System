# ISOLATED FATIGUE TEST PLAN — S8-B3-R3-CP2I-R1

**STATUS: PLAN ONLY. NOTHING IN THIS DOCUMENT HAS BEEN CREATED, SEEDED OR RUN.**
No Spreadsheet, no Apps Script project, no deployment and no frontend configuration has been made. No live
write of any kind has been issued. Every step below requires Owner setup and Owner authorization first.

> **Why this document exists.** Every round since CP2C has ended with the same sentence: the write path is
> ready for a fatigue test, and the fatigue test cannot be run because the only system that has the data is
> Production. This plan removes that deadlock by describing an environment that is *provably* not Production,
> rather than by relaxing the constraint that keeps us out of it.

---

## 0. THE ONE RULE THIS PLAN IS BUILT AROUND

A fatigue test is only isolated if **no component can reach Production even by mistake**. Isolation by
intention — "we will be careful to point it at the test endpoint" — is not isolation; it is a configuration
that is one stale browser tab away from being wrong. Every control below is therefore a **structural** one:
something that makes the Production target *absent*, not merely *unselected*.

---

## 1. THE THREE SEPARATE THINGS OWNER MUST CREATE

| # | Component | What it is | Why it cannot be shared with Production |
|---|---|---|---|
| **A** | **Test Spreadsheet** | A NEW, EMPTY Google Spreadsheet owned by the Owner. Tabs created by the seeding script in §3, never by copying a Production tab. | The script lock is per-PROJECT and the data authority is the Spreadsheet. A shared Spreadsheet means a fatigue run writes real rows. |
| **B** | **Test Apps Script project** | A NEW standalone Apps Script project bound to **A**, holding a copy of the same `.gs` sources at the candidate HEAD, with its own Web App deployment. | `LockService.getScriptLock()` is per-project. Sharing the project would let a fatigue run contend with real operators for the lock, and `gapJobContinue_` holds it up to 240 s. |
| **C** | **Test frontend configuration** | A local checkout serving the same frontend with `OP_DB_API_BASE_URL` pointed at **B**'s `/exec`, and the test flag of §2.3 set. | The endpoint is a **hardcoded constant** at the top of `assets/js/api/operation-system-db-api.js`. There is no runtime switch today — see §2.1, which is a decision Owner must take. |

**Not created by this plan:** Script Properties, time-driven triggers, Drive folders, document templates, or
any Google account other than the Owner's own.

---

## 2. HOW TO PROVE NO PRODUCTION ENDPOINT OR DATA IS TARGETED

Four independent proofs. They are independent on purpose: any one of them can be defeated by a mistake, and
no single mistake defeats all four.

### 2.1 PROOF 1 — The Production endpoint is not present in the artifact under test
`OP_DB_API_BASE_URL` is a hardcoded constant. The fatigue build must be produced by **replacing** it, not by
overriding it at runtime, and the check is a **negative grep**: the Production `/exec` string must return
**zero** matches anywhere in the served tree. A build that still contains the Production URL fails the gate
whether or not anything intends to use it.

> **OWNER DECISION REQUIRED.** There is no supported way to point the frontend at a second backend today.
> The options are (a) a throwaway local build with the constant replaced, discarded afterwards and never
> committed — lowest risk, no production code changes; or (b) a first-class `KM_API_TARGET` seam added to the
> codebase. **This plan assumes (a).** Option (b) is a product change and is not proposed here: an endpoint
> switch that exists in the shipped bundle is a new way to point the real frontend at the wrong backend.

### 2.2 PROOF 2 — Identity, from the backend's own mouth
Before any fatigue traffic, call the existing read-only `system.health` action against **B** and record the
answer. The test project must carry a **test-only marker constant** (a Script Property or a module constant
such as `KM_ENVIRONMENT_ = 'FATIGUE'`) that Production does not have, and the run log must contain that marker.
**A run whose recorded health answer lacks the marker is void and its results are discarded** — not
investigated, not partially accepted.

### 2.3 PROOF 3 — The test Spreadsheet refuses to be mistaken for the real one
The seeded fixtures are **recognisable on sight**: every company is `ZZTEST`, every SKU is prefixed `ZZ-`,
every marketplace is `ZZMarket`. No real company, SKU, marketplace, warehouse or carrier name appears
anywhere. If a fatigue row is ever observed in Production, it is unambiguous and greppable rather than a row
somebody has to reason about.

### 2.4 PROOF 4 — Read-back, from the other side
After the run, read the Production `marketplaces` and the Production flow tables and confirm **zero** rows
match the `ZZ` fixture vocabulary, and that Production `updated_at` values show no activity in the run window.
This is the only proof that looks at Production, and it is **READ-ONLY**.

---

## 3. FIXTURES — SYNTHETIC, OWNED, AND NEVER COPIED

**Formal Master Lists are never copied and never written.** The SKU master, marketplace master and carrier
catalogue in Production are reference data belonging to the business; a fatigue environment seeded from them
is a second copy of real data that then has to be governed, and would make Proof 3 impossible.

Fixtures are **generated** by a seed script from a written specification: a small, deliberately awkward set —
roughly 3 companies × 2 countries × 2 marketplaces × 12 SKUs — chosen to contain the shapes that break
things, not the shapes that are common:

- a canonical-identity collision pair (`UK` and `GB` rows for one marketplace) — the §45.A hazard
- a row with **no** `marketplace_id`, and a duplicate raw-identity pair
- a marketplace with a **MISSING** priority, one with an explicit **0**, one with an INVALID cell (`7abc`)
- a `marketplaces` tab **missing `updated_at`** — the CP2I-R1 refusal, which must be observed live
- a SKU with zero forecast, one with zero stock, one already fully allocated
- a lane with a rate card but **no** lead time (the known non-routable lane)

**Fixture ownership: the Owner owns the test Spreadsheet; this plan owns the fixture *specification*.** The
seed script is deterministic and re-runnable so a failed run can be reproduced exactly rather than described.

---

## 4. THE TWO FLOWS, MAPPED TO ACTUAL RUNTIME ACTIONS

These are the dispatched action names as they exist in `01_router.gs` at the candidate HEAD — not a
description of the flows.

### FLOW 1 — Replenishment → Weekly Shipping → Shipment / Dispatch / Receiving

| Stage | Actions |
|---|---|
| Replenishment gap | `inventoryReplenishment.workspace.get` · `inventoryReplenishmentGap.get` · `inventoryReplenishmentGap.job.start` · `gapJob.status.get` · `inventoryReplenishmentGap.job.cancel` |
| Weekly plan | `weeklyAiPlan.generate` · `aiPlanFirstLayer.get` · `weeklyShipping.workspace.get` |
| Allocation draft | `getShippingAllocationDraftWorkspace` · `upsertShippingAllocationDraft` · `upsertShippingAllocationDraftAtomic` · `upsertShippingAllocationDraftLines` · `cancelShippingAllocationDraft` |
| Shipping plan | `createShippingPlansBatch` · `updateShippingPlanLineQty` · `updateShippingPlanStatus` · `appendShippingPlanNote` · `completeShippingPlan` |
| Shipment | `createShipmentFromPlan` · `generateShipmentLineAllocations` · `confirmShipmentAndDispatch` · `cancelShipmentDraft` · `updateShipment` |
| Route / receiving | `shipment.route.advance` · `shipment.eta.update` · `shipment.receipt.update` |
| Documents | `renderShipmentDocument` · `finalizeShipmentFinalOutput` · `getShipmentFinalOutput` · `document.get` · `document.retry` · `document.diagnostic.shipment` |

### FLOW 2 — Request Recommendation → Request Order → Purchase Order / Receiving

| Stage | Actions |
|---|---|
| Recommendation | `recommendation.workspace.get` · `getRecommendationDraftToken` · `generateRecommendationDraftLocked` |
| Order-planning gap | `orderPlanningGap.get` · `orderPlanningGap.job.start` · `orderPlanningGap.job.cancel` |
| Request draft | `requestOrderDraft.generateFromGap` · `requestOrderDraft.job.start` · `requestOrderDraft.job.continue` · `requestOrderDraft.job.status` · `requestOrderDraft.job.cancel` · `requestOrderDraft.getActive` |
| Allocation | `requestOrder.allocationDraft.ensureAndEdit` · `upsertRequestOrderAllocationDraft` · `upsertRequestOrderAllocationDraftLines` · `upsertRequestOrderSiteConfirmations` |
| Send | `requestOrder.workspace.get` · `requestOrder.sendWorkset.get` · `requestOrder.send.orchestrate` · `requestOrder.send.status` |
| Order lifecycle | `updateRequestOrderLineQty` · `updateRequestOrderStatus` · `cancelRequestOrderTier` |
| Purchase order | `createPurchaseOrderFromRequest` · `purchaseOrder.workspace.get` · `receivePurchaseOrderLines` · `document.diagnostic.purchaseOrder` |

---

## 5. THE CASES — WHAT EACH ONE IS ACTUALLY TESTING

| # | Case | The invariant, stated so it can fail |
|---|---|---|
| **F-1** | **Reservation** | A draft that holds a reservation makes that quantity unavailable to a second draft **immediately**, not after a refresh. `11_shipping_plan_handlers.gs` already states the intended property: *"there is no window in which both count and none in which neither does."* Fatigue is how that sentence gets tested instead of trusted. |
| **F-2** | **Cancellation / reversal** | `cancelShipmentDraft`, `cancelShippingAllocationDraft` and `cancelRequestOrderTier` must release **exactly** what they reserved — never more (a double release inflates availability) and never less (a leak strands stock permanently). Measure the pool before and after; the delta must be the reserved quantity, to the unit. |
| **F-3** | **Count-once** | One demand unit must appear in exactly one plan. Run replenishment and order-planning **concurrently** on an overlapping scope and assert no SKU-destination unit is counted by both. |
| **F-4** | **Conservation** | Across a full flow, `requested = allocated + unallocated + rejected`, and received ≤ dispatched ≤ planned. Assert the **identity**, per scope and in total. A conservation test that only checks totals passes while two scopes swap quantities. |
| **F-5** | **Duplicate submission** | The same request sent twice — by double-click, by retry, by a stale tab — must produce **one** effect. The seam exists: `km_rid` (`request_id`) is already carried through `01_router.gs`. This case establishes which handlers honour it and which do not. **Expect findings here.** |
| **F-6** | **Concurrency** | Two operators on one scope. The script lock is **per-project**: `gapJobContinue_` can hold it for 240 s, so the realistic outcome under load is `LOCK_UNAVAILABLE`, not a queue. Assert that every refusal is a clean zero-write refusal and that **no** concurrent pair produces a half-applied document. |
| **F-7** | **Timeout** | Kill the client mid-request at each stage. Every outcome must be classifiable into the four S3-R10 states, and — the point of the case — **`CONFIRMED_REJECTED` must never be returned without zero-write evidence.** A timeout that gets reported as "nothing was written" is the CP2C defect returning. |
| **F-8** | **Document failure** | Fail `renderShipmentDocument` / `document.retry` at each step. A failed document must not strand the shipment in a state no action can leave, and `document.retry` must not produce a second document for one shipment. |
| **F-9** | **Priority write under load** | This round's writer, in its own environment: concurrent CAS saves to one row, a save during a 240 s Gap run, a save against the audit-column-less tab, and a save with an array priority. Assert the invariants proved offline in §J of the contract suite now hold against a **real** Apps Script runtime: real `LockService`, real `SpreadsheetApp.flush()`, real execution limits. |

---

## 6. RUN IDENTITY, RECONCILIATION AND STOP CONDITIONS

**Run ID.** Every run gets `FTG-<UTC-timestamp>-<short-random>`, carried in `updated_by` on every write it
makes and recorded in the evidence manifest with the §2.2 health answer. A row the fatigue run cannot claim by
run ID is a row it did not write — which is how a leak would be detected rather than argued about.

**Reconciliation.** After every run: dispatch a census of each affected tab, compare against the deterministic
expectation computed by the seed script, and record the diff. **A run with an unexplained diff is a FAILED
run.** The diff is the result; a green log with an unexplained diff is not a pass.

**STOP CONDITIONS — halt the run immediately and do not continue:**

1. The §2.2 marker is absent or does not match → **void the run**, discard results.
2. Any write is observed outside the test Spreadsheet.
3. Any row appears that the run cannot claim by run ID.
4. A `CONFIRMED_REJECTED` is returned by any handler without zero-write evidence.
5. Conservation (F-4) fails by any amount.
6. The Production read-back of §2.4 is non-empty.
7. Any Apps Script execution-quota or Drive-quota warning appears — quota exhaustion is shared with the
   Owner's account and can affect Production availability even from an isolated project. **This is the one way
   an isolated run can still hurt Production, and it is the reason the run must be attended.**

---

## 7. WHAT OWNER MUST STILL DO — nothing below has been done

1. **Authorize the fatigue environment at all**, and confirm option (a) or (b) in §2.1.
2. **Create** the test Spreadsheet (A), the Apps Script project (B) and its Web App deployment.
3. **Decide the test-only marker** of §2.2 and set it in the test project only.
4. **Confirm the quota exposure** of §6.7 is acceptable, and **schedule the run in a window where Production
   is not in use**, since the quota is shared even though the data is not.
5. **Approve the fixture specification** in §3 before any seeding.
6. **Confirm no real Master List is to be copied** — this plan assumes it is not.
7. **Authorize each run individually.** This plan does not carry standing authorization.

---

## 8. SCOPE LIMITS OF THIS DOCUMENT

This plan does not create the environment, seed data, run a fatigue test, modify the endpoint constant, add an
environment seam, change Properties or Triggers, or write to Production in any way. It names what would be
required and what would have to be proved. **Everything in it is pending Owner setup and authorization.**
