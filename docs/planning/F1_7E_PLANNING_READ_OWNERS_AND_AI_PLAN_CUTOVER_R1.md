# F1-7E-PLANNING-READ-OWNERS-AND-AI-PLAN-CUTOVER-R1 — Audit + HALT

**Outcome: HALT (audit-only; no code change).** Baseline HEAD `1473d41`. The audit proves that the AI-Plan first-layer
table (`request-order.js` `_buildRequestOrderRowsFromDb`) cannot be cut to scoped APIs this round without **establishing
new backend Forecast + inventory read/aggregation authority** and **redefining user-visible planning numbers** — both
forbidden by this round's own guardrails (§2 reuse-before-create, §4/§5 do-not-reimplement-formulas, §14 BEFORE == AFTER,
§19 do-not-broaden). HALT tokens raised: **`FORECAST_BACKEND_AUTHORITY_NOT_ESTABLISHED`** +
**`INVENTORY_BACKEND_AUTHORITY_NOT_ESTABLISHED`** (with `BUSINESS_EQUIVALENCE_FAILED` as the concrete failure a naive
reuse would cause, and `SECOND_ENGINE_REQUIRED` as the cost of building the missing owners).

## §0 request-order.js read/write map (audit)
`request-order.js` is a **multi-feature page**, not a single planning table. It has FOUR broad-DB surfaces plus one
already-scoped surface:

**A. First-layer planning table** — `_buildRequestOrderRowsFromDb()` (mount → `initRequestOrderSection` →
`loadOperationDb({force:true})` when `!_opDbCache`). Aggregates **~12 tables** from `_opDbCache` per SKU row:
`marketplace_skus`, `sku_details`, `fc_regular_forecast`, `fc_special_events`, `amazon_inventory_snapshot`,
`overseas_inventory_snapshot`, `warehouses`, `factory_stock`, `purchase_order_lines`, `purchase_orders`,
`supplier_price_list`, `marketplaces`.

**B. Target Rules editor** — reads `fc_target_rules` + `fc_regular_forecast`; **WRITES `fc_target_rules`**
(`upsertFcTargetRule`). A forecast-authority write surface embedded in the page.

**C. Forecast breakdown panel** — reads `fc_regular_forecast`, `factory_stock`, `warehouses`, `fc_target_rules`.

**D. Site-confirmation + allocation-draft "Send Request" flow** — `getRequestOrderSiteConfirmations`,
`upsertRequestOrderSiteConfirmations`, `upsertRequestOrderAllocationDraft(Lines)`, `createRequestOrderDraft`,
`submitRequestOrderAllocationDrafts`.

**E. Second-layer Gap/Recommendation — ALREADY SCOPED (done).** Expanded-row read = `getOrderPlanningGap(scope)`
(materialized `order_planning_gap`, T1–T4 gap/suggested read verbatim, no browser math) or
`recommendation.workspace.get` (scope-only). The top-table "Suggest Order" cell is painted from `_opMatCache`
(a transient client cache of the canonical materialized-gap DTO). Gap job control = `startOrderPlanningGapJob` /
`getGapJobStatus` / `cancelOrderPlanningGapJob` (scoped).

### Classification of every first-layer browser calculation
| Fact / calc | Source | Class | Backend owner today |
|---|---|---|---|
| identity (sku/country/marketplace/company/category/series) | marketplace_skus + sku_details | READ_MODEL_ASSEMBLY / FORMAT_ONLY | — (assembly) |
| `basicFcT3` = Σ **raw** fc_regular_forecast over Taipei-now N+1..N+3 | fc_regular_forecast | **LEGACY_PARALLEL_BUSINESS_FACT** | **NONE** (reco owns *adjusted+blended* demand, a different number) |
| `specialEventsFc` = Σ fc_special_events, prep-month = start−30d, N+1..N+3 | fc_special_events | **LEGACY_PARALLEL_BUSINESS_FACT** | NONE as a *separate* column (reco folds it into blended demand) |
| `siteStock` = latest amazon_inventory_snapshot (avail+transfer+processing), strict site scope | amazon_inventory_snapshot | **LEGACY_PARALLEL_BUSINESS_FACT** | reco `currentStockQty` exists but raw-row selection + strict-scoping is browser-authored (value may differ) |
| `thirdPartyStock` = Σ overseas non-factory same-country | overseas_inventory_snapshot | **LEGACY_PARALLEL_BUSINESS_FACT** | NONE (only *allocated* qty inside gap allocator, not raw pool Σ) |
| `factoryStock` = Σ factory_stock.current_stock per SKU | factory_stock | **LEGACY_PARALLEL_BUSINESS_FACT** | NONE (only *allocated* qty inside gap allocator) |
| `totalOngoingOrders` = Σ open-PO remaining (RO_OPEN_PO_STATUS set) | purchase_order_lines ⋈ purchase_orders | **LEGACY_PARALLEL_BUSINESS_FACT** | F1-7C owns per-**line** remaining; per-**SKU-open** aggregation + status set = NONE |
| `leadTime` = supplier_price_list latest active | supplier_price_list | READ_MODEL_ASSEMBLY / LEGACY | NONE (no reco/gap backend reads supplier_price_list) |
| Suggest Order (top cell) | order_planning_gap (materialized) | **CANONICAL_BUSINESS_FACT** | **ALREADY SCOPED** (43_ materialized read; no math) |
| risk / remaining / suggestedOrder columns | — | DISPLAY_ONLY (null → "--") | placeholder |
| carton breakdown, tier balance/labels | reads engine output | DISPLAY_ONLY / FORMAT_ONLY | — |

Filtering/search/sort/pagination = FILTER_ONLY (client, over the assembled rows). Post-write refresh =
`initRequestOrderSection` (broad reload) for A/B/C; the E path re-reads scoped gap/recommendation.

## §2 Existing backend read owners (reuse-before-create — evidence)
- **`recommendation.workspace.get` (42_)** — single-scope in (`company/country/marketplace` mandatory), **multi-row out**
  (`data.lines[]`, every SKU in that site). Reads ~19 canonical tables via `KMPS.readCanonicalSnapshots` (NOT
  getOperationDb; **no `purchase_order_lines`, no `supplier_price_list`**). Per-row it exposes `allocatedForecastQty`
  (Σ **Target%-adjusted** regular + special demand, via canonical KMPD), `currentStockQty` (site stock), `calculatedGap`,
  `recommendedQty`, and `openingSupplyComposition.{allocatedFactoryQty, allocatedOverseasQty}` (**allocated**, not raw
  pool Σ). It does **not** expose raw factory/overseas Σ, open-PO remaining, or lead time.
- **`orderPlanningGap.get` / `inventoryReplenishmentGap.get` (43_)** — multi-row **stored** gap rows (T1–T4 / D18-D90
  gap + suggested + status). Owns **no** forecast/inventory/stock/PO column. Already consumed by the second-layer.
- **`purchaseOrder.workspace.get` (50_, F1-7C)** — canonical `remaining_qty = max(0, completed − shipped)`, but
  **PO-keyed**, not aggregated per planning SKU / by open-status.
- **Canonical engine (KMPD/KMPS/KMHP/KMTPP in `90_…bundle.gs`)** — owns forecast-per-scope (`planningDemandByMonth`,
  `adjustedRegularFc`, `scopedSpecialEventPreps`) and inventory-projection-per-scope, but **per single SKU/destination**;
  the multi-SKU fan-out lives only in 42_'s loop.
- **`fcSummary` workspace** — **REGISTERED-only, NO backend handler** (no `fc.workspace.get` action; `fc-summary.js`
  still reads `getOperationDb`). Not a usable owner yet.

## §3/§4/§5/§6 Why this is a HALT, not a bounded cutover
Backing the first-layer table with BEFORE == AFTER requires, per column:
1. **Raw forecast Σ (`basicT3`) + separate special-event Σ** — no backend owner. The nearest (`allocatedForecastQty`) is
   **Target%-adjusted and blended** → a *different displayed number*. Reusing it = `BUSINESS_EQUIVALENCE_FAILED`; building
   a raw-sum owner = new forecast-projection authority (§4 forbids reimplementing formula authority) **and** relocates the
   Asia/Taipei-`now` month-window server-side (a time-authority shift that is itself not BEFORE == AFTER-safe).
2. **Raw factory_stock Σ + raw overseas Σ per SKU** — no owner surfaces the raw pools (only *allocated* qty). Surfacing
   them = new inventory read authority (§5 forbids a second inventory calculation authority).
3. **Open-PO ongoing remaining per SKU** — no owner. Requires reusing F1-7C's per-line `remaining_qty` **plus** a new
   per-SKU aggregation keyed by the browser-only "open PO status" set (`RO_OPEN_PO_STATUS`) — new business authority.
4. **Lead time** — read by no backend today; a new read.

That is **≥4 new backend read/aggregation authorities** + relocating four browser-only business rules (open-PO status set,
strict site-scoping, prep-month bucketing, Taipei-`now` window). This is neither "smallest architecture" (§3) nor a reuse
(§2); it reimplements aggregation/projection logic §4/§5 prohibit; and no single fixture can be proven BEFORE == AFTER for
the forecast/time-window facts. Per §19 (do not broaden around a HALT) → **STOP and report the smallest prerequisite.**

## §8 `_opMatCache` (unchanged this round)
Before role = transient client cache of the canonical materialized-gap DTO (T1–T4 gap/suggested per SKU for one scope),
painting the top "Suggest Order" cells (no math). After role = **unchanged** (no cutover performed). Remaining data =
the same canonical gap rows; remaining consumer = `request-order.js` second-layer only. It is NOT a second business
authority (it holds canonical values verbatim). No change.

## §17 app.js global prime / broad-cache pages
Unchanged. **request-order.js first-layer independent: NO** (still needs `_opDbCache` for surfaces A/B/C). Remaining
broad-cache pages ≈ 11 (request-order.js + fc-summary.js + inventory pages + others). Global-prime removal remains
Batch F, now explicitly blocked behind this HALT for the AI-Plan surface.

## §18 Deployment
**NONE.** No `.gs`/router/frontend/bundle/DB change. Docs-only commit.

## Smallest prerequisite slice (recommended sequence — each its own bounded round)
The first-layer's informational columns have **no canonical backend owner and do not equal the canonical recommendation
facts**. Resolving that is a **product + architecture decision**, not a transport-only cutover. Proposed order:

**PREREQ-0 — DECISION round (no code):** Product owner decides, per first-layer column, one of:
- **(a) Redefine to canonical facts** — replace `basicT3`/`specialEventsFc`/`siteStock` with the recommendation
  workspace's `allocatedForecastQty`/`currentStockQty` (accepting the displayed numbers CHANGE to canonical; this is a
  deliberate product change, explicitly NOT BEFORE == AFTER), or
- **(b) Keep raw informational columns** — commit to building raw-aggregate read owners (PREREQ-2/3/4 below), accepting
  the Taipei-`now` window relocates to a server time authority.
This decision gates everything; without it every cutover silently changes a user-visible number.

**PREREQ-1 — Open-PO-remaining-per-SKU read owner (cleanest reuse; do first if any):** a scoped read that aggregates the
**F1-7C canonical** `remaining_qty` per SKU over an explicitly-frozen open-PO status set. Pure reuse of the existing
definition; BEFORE == AFTER-provable against the current `ongoing()`. Retires the one unambiguous
LEGACY_PARALLEL_BUSINESS_FACT.

**PREREQ-2 — fcSummary workspace (implement the registered stub):** a scoped forecast read owner exposing raw
`fc_regular_forecast` and `fc_special_events` per scope, reusing KMPD's `scopedSpecialEventPreps` prep-month rule; freezes
the month-window authority (resolve "now" explicitly, ideally client-supplied, to preserve BEFORE == AFTER).

**PREREQ-3 — scoped inventory read owner:** raw per-SKU `factory_stock` Σ + `overseas_inventory_snapshot` Σ +
`amazon_inventory_snapshot` latest, reusing the strict site-scoping rule as a frozen backend contract.

**PREREQ-4 — lead-time read** (supplier_price_list latest-active per SKU) folded into PREREQ-3 or PREREQ-1's owner.

**Then** a final F1-7E' cutover composes PREREQ-1..4 + the existing gap/recommendation into ONE scoped AI-Plan first-layer
View-Model and cuts `_buildRequestOrderRowsFromDb` off `_opDbCache`. (Surfaces B/C — Target Rules editor / forecast
breakdown — are separate follow-ups; they also write/read forecast tables and are out of scope for a first-layer read
cutover.)

## FINAL GATE — NOT MET (HALT)
First-layer primary render scoped API driven: **NO** · Forecast backend authority reused: **NO (none exists for the raw
columns)** · inventory backend authority reused: **NO** · client parallel business math retired: **NO** · BEFORE ==
AFTER: **cannot be guaranteed for forecast/time-window facts**. → HALT per §19.

**Request Order AI-Plan first-layer scoped read: BLOCKED — prerequisite backend read owners required (see sequence).**

**Exact next slice:** run **PREREQ-0 (DECISION round)** to choose redefine-to-canonical vs. build-raw-owners; then
**PREREQ-1 (open-PO-remaining-per-SKU, canonical-reuse)** as the first bounded implementation. Do NOT begin Shipment or
any first-layer cutover until PREREQ-0 is decided.
