# Phase F1-4B — Read-Only Recommendation Workspace API Seam — Readiness + BLOCKER

> **Status: READINESS AUDIT COMPLETE — IMPLEMENTATION HALTED (2026-08-05).** Per the round's §2 first
> checkpoint ("Before editing, produce a short source-proven table") and its HALT rule, this is the deliverable.
> The API/Apps-Script seam that F1-4A had to defer is now *in scope* — so F1-4A's blocker #1 (no read-API) is
> **resolved by this round's mandate**. But a **deeper, distinct blocker** surfaces on source-proof: the
> recommendation runtime **cannot produce `recommendedQty` for the Inventory Replenishment scope without inventing
> missing source data** — the planning-facts producer (gap / net-order-need + receiver survival-weight-eligibility
> + D-3 destination routing) is **caller-owned and NOT IMPLEMENTED**. This is exactly the round's **HALT condition
> #2** (and D-3 touches #3). No runtime / API / page code changed. Evidence is code-verified (file:line).

---

## A. One-line result

The read-only seam is *structurally* buildable (the server path already exists —
[`27_recommendation_production_source.gs`](../../assets/specs/active/apps-script/27_recommendation_production_source.gs)
`buildProductionRecommendationSource_`, explicitly "kept for a future authorized read-only route"), **but wiring it
would return `BLOCKED` for every real page scope**, because the production projection **routes, never computes** the
planning facts a recommendation needs. Producing them from the canonical DB is the still-missing
**Recommendation Planning-Facts Projection Runtime** (SC-1 "single biggest freeze finding" / SC-9 #1 remainder) — a
**formula/runtime build**, which this round forbids ("Do not create new formulas"; §6 "Do not duplicate or rewrite …
gap formula … order quantity formula"). Emitting a recommendation anyway would violate "Do not output fake zeroes as
canonical recommendation results."

---

## B. §2 Readiness table (source-proven)

| Requirement | Status | Source (file:line) |
|---|---|---|
| F1-3b production Qualified-Incoming bridge connected | **PARTIAL** — *supply* lifecycle only | `supply-planning-source-projection.js:249-342` routes `shipping_plans`/`shipments` through canonical `KMSF.projectSupplyLifecycle` (§2E `evaluateQualifiedIncoming` + §39.5 + `buildSupplyLedger`). **Demand/planning-facts side not produced** (rows below). |
| Current Stock input authority available | **YES** | `supply-planning-source-projection.js:205-247` — FBA `amazon_inventory_snapshot.available_qty`, THREE_PL `overseas_inventory_snapshot.wh_available_stock`, FACTORY `factory_stock.fac_current_stock` → `lifecycle_bucket:'CURRENT_STOCK'` supply rows. |
| Forecast/Demand source available | **PARTIAL / CALLER-GATED** | `:156-199` assembles demand from `fc_regular_forecast[forecastMonth]` + `fc_special_events.fc_qty`, but **requires caller `input.forecastMonth`** (`:163` else `MISSING_FORECAST`), `input.requiredByDate` (`:159`), and a resolvable **destination** (`:174-175`/`:192-193` else `MISSING_DESTINATION_WAREHOUSE`). |
| Qualified Incoming output available | **YES** (as supply-ledger `SHIPPED_IN_TRANSIT`) | `:249-342` (F1-3b canonical bridge); reachable buckets APPROVED_SHIPPING_PLAN / SHIPPED_IN_TRANSIT / CURRENT_STOCK. |
| Existing `recommendedQty` resolver callable server-side | **YES, but requires planning facts** | `supply-planning-production-source.js:109-129` `buildProductionRecommendationSource` → `KMSP.projectAndRead` → resolver `supply-planning-source-facts.js:566-707` (`resolveWeeklyRecommendationFacts`) / `:720-833` (Monthly). |
| Existing page SKU/scope identity sufficient | **NO** | Page supplies scope `{planning_cycle,company,country,marketplace}` but **no `destinationWarehouseId`, no `windowCode`/`requestMonth`, no `calculatedGap`/`netOrderNeed`, no receiver/factory facts** (F1-4A audit §C; D-3 `RECOMMENDATION_SOURCE_CONTRACT_SPEC.md` SC-11.3). |
| Read-only API implementable without DB/schema changes | **YES (structurally)** — but returns BLOCKED for real scope | Server path present (`27_…gs`); Weekly-Workspace DI pattern (`40_api_v1_weekly_workspace.gs`) mirrors cleanly; no schema/header write needed. |

---

## C. The blocker — planning facts are ROUTED, not COMPUTED (HALT #2)

The production projection's own header is explicit:
> `supply-planning-source-projection.js:25` — "(windowCode / requestMonth / requestBucket / **calculatedGap** /
> netOrderNeed) are **CALLER-OWNED** (frozen contract)".

And the code proves it:

- **Planning facts are a pass-through of `input.planningFacts`** (`:345-356`): Weekly sets
  `row.window_code = f.windowCode; row.calculated_gap_qty = f.calculatedGap;` Monthly sets
  `row.net_order_need_snapshot = f.netOrderNeed`. Nothing derives them.
- **Fail-closed presence gate** (`:403-407`): `demand + supply + planningFacts` must all have produced rows, else
  `hardReason = 'SOURCE_NOT_AVAILABLE'` → `ready:false` (BLOCKED). `planningRows` comes *only* from caller facts, so
  **no caller planning facts → BLOCKED**.
- **Receiver / factory allocation facts are caller-owned too** (`:358-377`): `survival_need_qty`, `daily_demand`,
  `demand_weight`, `eligible_pool_types`, `eligible_factory_warehouse_ids` are copied from `input.receiverFacts` /
  `input.factoryDemandFacts`; without them the allocator yields no allocated source, so the Weekly resolver's
  `recommendedQty` (FLOOR over *allocated* source, `supply-planning-source-facts.js:638-646`) is 0/blocked even if a
  gap were supplied.
- **Destination is caller-owned (D-3)** (`:147-154`, `:174-175`, `:192-193`): with no `factHint`, no `routing[ref]`,
  and no `scope.destinationWarehouseId`, every demand row is dropped with `MISSING_DESTINATION_WAREHOUSE`.

The resolver's `calculateGap` owner is frozen and *can* compute a gap from the four raw inputs
(`supply-planning-source-facts.js:588-596`: `demand`, `destinationCurrentStock`, `timelyQualifiedIncoming`,
`timelyApprovedCommittedSupply`) — **but nothing produces those four inputs from the canonical DB for a fresh scope.**
This is precisely the contract's own "single biggest freeze finding"
(`RECOMMENDATION_SOURCE_CONTRACT_SPEC.md` SC-1, ~L131-140): *"there is NO implemented Forecast/Sales/warehouse →
planning-facts projector … today they are caller-supplied DTO facts with no persisted producer."* The implemented
"Projection Runtime" (Round 1S-P1.5B) assembles **demand + supply** rows from snapshots; it deliberately leaves the
**planning facts** (gap / net-order-need / survival / weight / eligibility / destination) to the caller.

The **only** callers that supply those facts today are the **test fixtures** (Weekly 96 / Monthly 24 come from crafted
`planningFacts`/`receiverFacts`, not from the DB). The Inventory Replenishment page supplies none.

### Net effect of wiring the seam now
A `recommendation.workspace.get` scoped to `{company,country,marketplace}` (what the page can send) →
`buildProductionRecommendationSource` → `ready:false`, `reason:'SOURCE_NOT_AVAILABLE'` /
`MISSING_DESTINATION_WAREHOUSE` / `MISSING_FORECAST` → **no lines, no `recommendedQty`**. Suggested Qty — the point of
the round — is unobtainable without inventing the gap / allocation / destination facts. Of the three target fields,
only Current Stock and Qualified Incoming are computed at all (in the supply ledger), and they are reachable only if
the whole chain reaches `ready`, which it will not for the page scope. Surfacing them alone through a chain that
BLOCKS would be a fabricated partial success.

---

## D. Why this is HALT, not "implement with honest empty state"

The round's §2 is unambiguous: **"HALT before implementation only if … (2) The resolver cannot produce recommendedQty
without inventing missing source data."** That condition is met. When it is met, the rule is: *"make no runtime/API/
page code changes; document the exact missing dependency; provide the smallest next slice; create only a docs
checkpoint."* Building the API + router + Foundation flag + page wiring + ~30 tests that assert *BLOCKED for every real
call* would (a) breach the explicit "make no code changes" HALT instruction, and (b) be unable to satisfy §17
acceptance ("Suggested Qty is source-proven"; "Existing canonical runtime is invoked", returning real values). D-3
(caller-owned destination; the page has none) independently trips the same wall.

Delta vs F1-4A: F1-4A halted on *"no read-API / server-side only"* (its blocker #1) **and** on Coverage/DOS/Projected/
Reason not existing (#2). F1-4B's mandate dissolves F1-4A #1 (the seam is now allowed, and in fact already stubbed in
`27_…gs`). What remains — and is fatal for *this* round — is a blocker F1-4A also named in passing: the recommendation
needs a **source DTO the page cannot build**, and no runtime builds it from the DB. F1-4B makes that concrete and
cited: it is the **planning-facts producer**, not the API seam, that is missing.

---

## E. Smallest next slice (recommended, separately authorized)

**F1-4B-PRE — Recommendation Planning-Facts Projection Runtime** (SC-1 convergent gap / SC-9 #1 remainder). A pure
runtime that, from the canonical DB rows the projection already reads, PRODUCES the caller-owned planning facts the
resolver consumes:

1. **Demand → gap inputs**: demand-entry assembly (already present, `:156-199`) → per-line `demand`,
   `destinationCurrentStock` (from the CURRENT_STOCK supply rows), `timelyQualifiedIncoming` (from the F1-3b
   SHIPPED_IN_TRANSIT ledger), `timelyApprovedCommittedSupply` → **Engine-A `calculateGap`** (frozen owner; *invoked,
   not rewritten*) → Weekly `calculatedGap`.
2. **Monthly** `netOrderNeed` via the frozen Engine-A→B `sumRemainingShortages` (§12/§32) — invoked, not rewritten.
3. **Receiver / factory facts**: `survivalNeedQty` (§20.3/§24.4), `dailyDemand` (§22/§2D), `demandWeight` (§7/§24.5),
   `eligiblePoolTypes` (§23.6/§24.9), `eligibleFactoryWarehouseIds` (§40/§35) — from `marketplaces`/`marketplace_skus`/
   `warehouses` + forecast/sales — invoking the frozen owners.
4. **D-3 destination**: resolve `destinationWarehouseId` from a caller/planning-scope routing input (the page must
   provide an explicit destination selection per SC-11.3 — a small page/UX prerequisite, not an inference).

Because #1–#3 *invoke frozen calc owners* rather than authoring new math, F1-4B-PRE is closer to a **wiring/projection**
round than a formula round — but it still crosses this round's "no new formula logic / no planning-facts derivation"
line, so it must be **authorized on its own** (it is the SC-1 producer that SC-5/SC-9 always named as the prerequisite).

**Then F1-4B (this seam) becomes meaningful**: `recommendation.workspace.get` → `buildProductionRecommendationSource`
now returns real `recommendedQty` + `calculatedGap`, plus Current Stock + Qualified Incoming from the ledger; the page
replaces its `suggestedQty`/`onTheWay` stubs. F1-5 (Coverage/DOS/Projected/Reason) stays separate and later.

Until F1-4B-PRE lands, the page's honest stubs (`onTheWay:0`, `suggestedQty:0`, `status:'Sufficient'`) must remain — a
BLOCKED-for-everything API is not preferable to the stub.

---

## F. Governance

No new formula, no new runtime, no recommendation/planning-facts derivation; no API / router / Foundation / page /
DB / schema / Apps Script / bundle / CSS change. F1-3b (supply lifecycle bridge) is confirmed landed at HEAD
(`source-projection.js:249-342`; commit `97df611`). Read-only audit; docs-only checkpoint. No live DB accessed. No
push, no deploy. Full suite unchanged (83/83); Golden Matrix 39/1/0; Scenario #34 Pending.

---

## G. F1-4B-B — Page cutover readiness (2026-08-06): runtime now READY, page-caller inputs ABSENT → HALT

The §C runtime blocker is **RESOLVED**. F1-4B-PRE (assembly `supply-planning-production-assembly.js`, KMPA) + F1-5-A
(KMAF) + F1-5-BD (KMPCX) now PRODUCE the caller-owned planning facts from canonical DB rows by invoking the frozen
owners, and F1-4B-A exposes them through the bounded read endpoint `recommendation.workspace.get`
([`42_api_v1_recommendation_workspace.gs`](../../assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs)).
The F1-4B-A suite proves a REAL `recommendedQty = 96` end-to-end from raw snapshots, with source-proven
`currentStockQty`/`qualifiedIncomingQty`/`calculatedGap`
([`supply-planning-recommendation-workspace-f1-4b-a.test.js:69-72`](../../assets/tests/supply-planning-recommendation-workspace-f1-4b-a.test.js)).
So the seam is meaningful now — **given the three caller-owned inputs**.

**But the page-side INPUT AUTHORITY those inputs require does not exist**, and the frozen registry forbids
synthesizing two of the three. This is the distinct, still-open blocker for the *page* cutover (the §E#4
"small page/UX prerequisite … must be authorized on its own" — never built by any completed round).

### G.1 The endpoint mandates three caller-owned inputs (validated before any read)

| Input | Frozen rule (never synthesize) | Authority (file:line) |
|---|---|---|
| `destinationWarehouseId` | explicit canonical `warehouse_id`, VALIDATED; **NEVER auto-selected/inferred** (no first-row / display-name / country-default / latest-wins / cheapest-route / random) — D-F1-5B-1 | `supply-planning-planning-context.js:54-76` (`validateDestination` → `MISSING_DESTINATION_WAREHOUSE` when absent, `:66`) |
| `calculationMonth` (`YYYY-MM`) | injected anchor; **NO Date.now / NO browser-current-date** — D-F1-5B-3 | `supply-planning-planning-context.js:118-119` |
| `planningCycle` | required caller/scheduler run parameter (SC-3.3) | `supply-planning-planning-context.js:116-117` (`MISSING_PLANNING_CYCLE`) |

The frontend DTO builder forwards exactly what the page passes and defaults each of these to `null`
([`km-api-foundation.js:350-366`](../../assets/js/api/km-api-foundation.js)) — a `null` yields the corresponding
server `MISSING_*` structured failure, never a value.

### G.2 The Inventory Replenishment page owns NONE of the three

- **Header controls (source-proven):** only Country + Marketplace + LTS Filter + Target Days
  ([`inventory-replenishment.html:16,32,44,52`](../../assets/html/pages/inventory-replenishment.html)). There is **no
  destination-warehouse selector, no calculation-month anchor, no planning-cycle control.**
- **Page scope object (source-proven):** `{ company, country, marketplace, sku, marketplaceId, series, category }`
  ([`inventory-replenishment.js:3450-3454`](../../assets/js/pages/inventory-replenishment.js)) — no
  `destinationWarehouseId`, no injected `calculationMonth` (the page uses `new Date().getMonth()` for its *legacy*
  display math at `:3433`, which is exactly the browser-current-date source the frozen decision forbids feeding the
  API), no `planningCycle`.

### G.3 Why this is HALT, not "wire it and show MISSING_* everywhere"

To reach the round's stated GOAL — a **populated** Recommendation Summary ("Recommendation Summary populated" is a
listed acceptance test) — the page must send a valid `destinationWarehouseId` + `calculationMonth` + `planningCycle`.
It cannot:
- Auto-selecting the destination (e.g. "the one eligible 3PL", `IRMap.eligible3plWarehouses`) is precisely the
  inference D-F1-5B-1 bans; platform-fulfilled destinations aren't modeled as a page-selectable `warehouse_id` at all.
- Deriving `calculationMonth` from the browser clock is banned by D-F1-5B-3.
- `planningCycle` has no page representation to derive from.

Wiring the seam to send `null`s would make **every** row render `MISSING_DESTINATION_WAREHOUSE` /
`MISSING_CALCULATION_MONTH` / `MISSING_PLANNING_CYCLE` — never a real recommendation — which fails the GOAL and the
"populated" acceptance test, while the honest legacy stubs already convey "not generated". Manufacturing the inputs to
avoid that violates the frozen registry and the round's own "No fake zero / No placeholder values / No page
calculation / pure presentation layer" constraints, and building a destination/month/cycle **input authority** is new
caller-context (decision-input) semantics — outside a *pure presentation* cutover and adjacent to the round's DO-NOT
list (Decision Engine / Allocation Runtime). Either path breaches a hard constraint → **HALT**.

### G.4 Smallest next slice (separately authorized) — F1-4B-B-PRE · Inventory Replenishment Planning-Context Input Authority

A page/UX-only slice that lets the page legitimately **own** the three caller inputs, so the F1-4B-A endpoint becomes
callable with real values — authoring NO formula, NO runtime, NO inference:

1. **Destination** — an explicit destination-`warehouse_id` selection surfaced from canonical eligible warehouses
   (validated by the existing `validateDestination`, never auto-picked). Scope/UX decision: per-scope selector vs
   per-row; how platform-fulfilled (FBA) destinations are represented as a canonical `warehouse_id`.
2. **Calculation month** — an explicit injected `YYYY-MM` anchor control (default policy is a product decision, but the
   *value sent to the API must be caller-explicit*, never the browser clock).
3. **Planning cycle** — an explicit run-parameter control/echo (`YYYY-Www`-style), caller-owned.

**Then F1-4B-B (this cutover) becomes meaningful:** the Recommendation Summary can call
`recommendation.workspace.get` behind the default-false `recommendation` flag and present the real
`currentStockQty` / `qualifiedIncomingQty` / `calculatedGap` / `recommendedQty` (+ blocked / blockedReason /
formulaVersion / sourceDataAsOf / diagnostics), with differentiated structured states
(NO_DATA / BLOCKED / MISSING_FORECAST / MISSING_DESTINATION / API_FAILURE / VALID_ZERO) replacing the
"AI Pending" / "No recommendation generated" placeholders — a genuine pure-presentation layer.

Until F1-4B-B-PRE lands, the page's honest legacy stubs must remain (a `MISSING_*`-for-everything wiring is not
preferable to the honest "not generated" state).

### G.5 Governance (F1-4B-B)
Readiness/authority audit only. **No** runtime / API / router / Foundation / page / HTML / CSS / DB / schema / Apps
Script / bundle change. No formula, no inference, no fake value. Docs-only checkpoint. No live DB accessed. No push,
no deploy. Full suite unchanged; Golden Matrix 39/1/0; Scenario #34 Pending.

---

## H. F1-4B-B-PRE — Planning-Context Input Authority (2026-08-06): §G.4 slice IMPLEMENTED

The §G.4 "smallest next slice" is now built (page/UX only; NO API call, NO formula, NO inference). The Inventory
Replenishment page **owns** the three caller inputs the endpoint requires, via a new "Recommendation Context" control
group + a pure `window.IRContext` module ([`inventory-replenishment.js`](../../assets/js/pages/inventory-replenishment.js) `__IRCTX_*`):

- **Destination Warehouse** — explicit `<select>` whose option value is a canonical `warehouse_id` (display = code —
  name; identity is never the display string). Options = `IRContext.eligibleDestinationWarehouses` (explicitly active +
  same company + compatible country via the `IRCountry` UK≡GB contract). **Never auto-selects** the first/only option;
  blank until the user picks. States: `UNSELECTED` / `SELECTED_VALID` / `SELECTED_INVALID` / `NO_ELIGIBLE_DESTINATION` /
  `PLATFORM_DESTINATION_IDENTITY_UNRESOLVED` / `DESTINATION_AUTHORITY_CONFLICT`.
- **Calculation Month** — `<input type="month">` → explicit `YYYY-MM`; blank start; **no `new Date()` default**;
  malformed → `INVALID_FORMAT`.
- **Planning Cycle** — explicit non-empty run identifier (deterministic whitespace normalization). The registry pins the
  calc-month **anchor** (D-F1-5B-3, `YYYY-MM`) but not a strict cycle format, and the runtime treats `planningCycle` as
  an opaque required string (echoed as `windowCode`); so the control requires an explicit value and does **not** invent
  a format validator or silently copy the calculation month.

`IRContext.normalizeRecommendationContext` → one page-local model (`NOT_READY` / `READY` / `INVALID` /
`DESTINATION_BLOCKED`); `toRequestContext` returns the exact `{company,country,marketplace,destinationWarehouseId,
calculationMonth,planningCycle}` DTO **only when READY** (else `null`) — proven to drive a fully-populated
`recommendation.workspace.get` DTO with no `MISSING_*` nulls. FBA/platform destinations appear only if a canonical
`warehouse_id` exists; otherwise the scope is honestly `PLATFORM_DESTINATION_IDENTITY_UNRESOLVED` (no fabricated id).
**This slice makes NO API call and replaces NO Recommendation Summary placeholder** — that is F1-4B-B. Tests:
`replen-recommendation-context-f1-4b-b-pre.test.js` (67). No formula/runtime/API/Apps-Script/DB/schema/bundle change;
no write (sessionStorage page-input preference only); full suite 88 files / 0 failing; Golden 39/1/0; #34 Pending.

---

## I. F1-4B-B — Recommendation READ cutover (2026-08-06): IMPLEMENTED (the blocker is fully dissolved)

The Recommendation Summary is now connected to `recommendation.workspace.get` behind the default-false
`recommendation` flag ([`inventory-replenishment.js`](../../assets/js/pages/inventory-replenishment.js) `__IRRECO_*`):

- **Effective predicate** `_irRecommendationWorkspaceEnabled()` = Foundation `workspaceApiActive('recommendation')`
  (master `USE_WORKSPACE_API` **and** per-workspace `recommendation`, both ON). Flags OFF → the legacy windowed
  placeholder (`_recSummaryRows`, "AI Pending"/"No recommendation generated") is preserved verbatim.
- **One request per READY scope** (`loadRecommendationWorkspace_`): READY context → `IRContext.toRequestContext` →
  Foundation `getWorkspace('recommendation', {scope, destinationWarehouseId, calculationMonth, planningCycle,
  filters:null, pagination:{1,100}, include:{diagnostics:true}})`. The server loops SKUs internally → **no per-SKU
  HTTP**. Deduped by context key; monotonic-seq stale guard; `AbortController` invalidation on scope/destination/
  month/cycle change and unmount. Context not READY / flags OFF → no request.
- **Page-local read state** `_irRecoState` (separate from Allocation Draft): `DISABLED` / `CONTEXT_NOT_READY` /
  `LOADING` / `READY` / `EMPTY` / `API_ERROR`, with per-line `VALID_ZERO` / `BLOCKED` / `RECOMMENDATION_LINE_NOT_FOUND`
  / `RECOMMENDATION_LINE_CONFLICT` resolved by a canonical composite key (company|country|marketplace|sku|siteSku|
  destination — never index/order/label; conflicts never latest-win).
- **Direct mapping, no recompute** (`_irRecoMapLine` via `_irNumOrNull`): `currentStockQty` / `qualifiedIncomingQty` /
  `calculatedGap` / `recommendedQty` passed through; a legitimate `0` is preserved and a missing field is `null`
  (never `|| 0`). Blocked lines show the reason (+ source-proven stock/QI) but **not** a `recommendedQty`.
  Diagnostics (issues + `formulaVersion` + `sourceDataAsOf` + `requestId`) in a collapsible `<details>`.
- **Presentation scope:** the Recommendation Summary card is the API-value surface (all four fields co-labeled).
  The main results-table columns keep their existing FBA/legacy meaning — the API's destination-scoped
  `currentStockQty` is a *different* quantity than the table's FBA "Current Inventory", so they are deliberately not
  overwritten (documented, honest bounded disposition). No Execution Plan / Allocation Draft / Submit / persistence.

Tests: `replen-recommendation-cutover-f1-4b-b.test.js` (54) + compat PG1/PG1c updated (weekly + recommendation are the
two READ cutover pages). No formula/runtime/API/Apps-Script/router/Foundation/DB/schema/bundle change; no write; full
suite 89 files / 0 failing; Golden 39/1/0; #34 Pending. Flags remain default-false (dormant until enabled).

---

## J. F1-4B-C — Recommendation Context UI refactor (2026-08-06): the input panel was an implementation leak → removed

F1-4B-B-PRE surfaced the three Recommendation-Runtime inputs (destination / calculation month / planning cycle) as a
page **"Recommendation Context"** control panel. That exposed Runtime internals to the user — an implementation leak,
not product UX. **F1-4B-C removes the panel and makes the context INTERNAL/HIDDEN** (UI-only; no Runtime/API/Formula/
Planning-Context/Engine/Apps-Script/Bundle/DB/Mapping change):

- **HTML** — the `.replen-reco-context` block (Destination `<select>`, Calculation-Month input, Planning-Cycle input,
  readiness indicator) is deleted. The page's scope controls are again just Country / Marketplace / LTS / Target Days /
  Search (original UX). No popup/dialog/drawer/floating panel added.
- **CSS** — the now-dead panel styles are deleted; the Recommendation Summary OUTPUT-state styles remain.
- **JS** — the pure `IRContext` model is **retained** (frozen decisions unchanged). The DOM-bound panel wiring is
  replaced by an internal hidden `_irInternalContext` (all null by default) + a **non-UI** seam
  `_irSetInternalRecommendationContext(ctx)` that a future scheduler/config (never the user) uses to supply the runtime
  context. `updateReplenRecoContext()` now builds the normalized model from scope + the internal inputs, renders
  nothing, calls no API. The entire F1-4B-B read cutover is unchanged — the Runtime still receives
  destination/month/cycle, now **only** from the internal context via `IRContext.toRequestContext`.

With no internal populator and the flags default-false, the context stays `NOT_READY` and the workspace is `DISABLED`,
so the Recommendation Summary keeps its honest legacy placeholder ("No recommendation generated" / "AI Pending") until
the runtime is truly Ready — exactly the required behavior. The PRE test was rewritten to F1-4B-C (retained pure-model
sections + UI-removal + internal-wiring assertions; 64). Full suite 89 files / 0 failing; Golden 39/1/0; #34 Pending.
