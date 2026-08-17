# F1-7J-A-EXISTING-WORKSPACE-SECONDARY-AND-SKU-REGIONAL-CUTOVER-R1 — Transport/wiring cutover (partial: 3 done, 3 HALT)

**Outcome: TRANSPORT / WIRING only. BEFORE FACT == AFTER FACT. No new API, no new workspace, no new formula, no authority
change, no schema change, no writer change, no app-prime removal.** Baseline PRE HEAD `2d35c7f`. Migrated three targets
(B, D, F) onto EXISTING scoped workspaces / read-models; the other three (A, C, E) are isolated HALT sub-slices — they
CANNOT be migrated purely by reusing an existing read-model without a backend change (A) or a behavior change (C, E).

## §0 Result summary
| Target | Surface | Verdict | New authority |
|---|---|---|---|
| A | Weekly Shipping line-logistics editor (`shipping-plan.js` `_spSkuDetail`) | **HALT `F1_7J_A_UNEXPECTED_BACKEND_REQUIREMENT`** | — |
| B | Purchase Order detail modal (`purchase-order-list.js` `view()`) | **DONE** | none |
| C | Request Order order-planning scope resolver (`request-order.js` `_roScopeModalPrefill_`) | **HALT `REQUEST_ORDER_SCOPE_EXISTING_READ_MODEL_NOT_EQUIVALENT`** | — |
| D | Inventory Replenishment reference/registry lookups (`inventory-replenishment.js`) | **DONE** | none |
| E | Inventory Replenishment allocation-draft hydrate (`inventory-replenishment.js` `_hydrateAllocationDraftFromDb`) | **HALT `IR_ALLOCATION_DRAFT_SSOT_NOT_BEFORE_EQUALS_AFTER`** | — |
| F | SKU Regional Details WHOLE PAGE (`sku-regional-details.js`) | **DONE (primary cutover)** | none |

---

## §1 — DONE: B · Purchase Order detail modal
- **Old:** `view(id)` read `window.KM.DB.getPurchaseOrders()` / `getPurchaseOrderLines()` (broad cache) directly.
- **New:** read-model-first — `_polReadModel ? _polReadModel.orders : (window.KM.DB.getPurchaseOrders()||[])` (and lines),
  the IDENTICAL accessor already used by `renderRows` (`purchase-order-list.js:154-155`). Opening the modal in canonical
  mode requires ZERO broad-DB fetch.
- **BEFORE==AFTER:** the `purchaseOrder` adapter's orders/lines equivalence is proven by the F1-7C suite; `view()` now uses
  the exact same accessor as the already-tested `renderRows`, so the modal shows identical header + line rows.
- **remaining_qty:** `view()` computes NONE — the backend-owned `remaining_qty` is unaffected; the frontend
  `max(0, completed − shipped)` fallback stays ONLY in `renderRows` (Legacy-blank rows). No authority promoted.

## §2 — DONE: D · Inventory Replenishment reference/registry lookups
- **Old:** 7 sites read `window.KM.DB.getMarketplaces()` (`:171` Add-SKU dropdown, `:4358` Edit-SKU fulfillment,
  `:4446` import active marketplaces, `:4776` `_replenSelectedScope`, `:4855` `_replenMarketplaceLabel`, `:5141`
  `_irctxScope`) and `getWarehouses()` (`:5134` `_irctxWarehouses`) from the broad cache.
- **New:** all 7 route through the EXISTING `_irWsGet(name)` choke point → Workspace mode reads `_irReadModel`
  (`getMarketplaces`/`getWarehouses` are already in the IR workspace payload, F1-7I); Legacy reads the getter unchanged.
- **BEFORE==AFTER:** `_irWsGet` returns the SAME arrays as the getters (the IR adapter keys both through the same
  normalizers as `normalizeOperationDb`; proven in the F1-7I suite). Option universes / IDs / labels / country /
  marketplace / company / warehouse identity / fulfillment model unchanged.
- **Out of scope (untouched):** the Execution-Plan warehouse-candidate read `_execWarehouseCandidates`
  (`inventory-replenishment.js:3020`) and carrier reads (`carrier_lead_times`, `carrier_rate_cards`) — §2 assigns these to
  A2/A3 (carrier tables are NOT in the IR payload). One direct `getWarehouses()` remains at `:3020` by design.

## §3 — DONE: F · SKU Regional Details WHOLE PAGE (primary cutover)
- **Old:** primary page broad-loaded via `loadOperationDb({force:true})` and read 5 tables from the broad cache
  (`getSkuRegionalDetails`, `getSkuDetails`, `getMarketplaceSkus`, `getTaxReferralRates`, `getTaxRateComponents`).
- **New:** mirrors F1-7H — `_srdEffectiveWorkspace()` (gates on `workspaceApiActive('skuDetails')`), `_srdReadModel`,
  read-model-first accessors (`_srdGetRegional/_srdGetMasters/_srdGetMktSkus/_srdGetTaxRates/_srdGetTaxComponents`),
  bounded `KM.loadState` region (INITIAL_LOADING/READY/EMPTY/ERROR), fail-closed `_srdRenderError_` (NO silent broad
  fallback — the error path never calls `render()`, so the accessors' Legacy branch is never reached in Workspace mode),
  scoped `_srdWorkspaceRefresh_` and post-write `_srdAfterWrite`.
- **Include contract:** `KM.api.getWorkspace('skuDetails', { include: { regional: true } })`. The EXISTING `skuDetails`
  owner (59_) already returns the two 'regional' tables (`marketplace_skus` + `sku_regional_details`) under
  `include.regional` (bounded includes; base call skips them at no read cost). **NO new workspace, NO new API** — the
  DTO builder already forwards `include`, and the adapter `adaptSkuDetailsWorkspace` already maps the regional arrays.
- **BEFORE==AFTER (whole-page):** the adapter re-normalizes with the SAME normalizers + per-array filters as
  `normalizeOperationDb`, so all 5 arrays are byte-identical to the legacy getters; the ACTUAL page joins/render
  (`buildIndexes`, `masterList`, `resolveTax`, `taxComponentsFor`, `statusOf`) produce IDENTICAL output from the Workspace
  read-model vs the Legacy getters (proven by the focused suite running the real functions over the same fixture).
- **Write authority UNCHANGED:** `upsertSkuRegionalDetail` (incl. its `marketplace_skus` identity sync) is byte-identical;
  after write in canonical mode the page performs a scoped `skuDetails` (include.regional) re-read via `_srdAfterWrite` —
  NO page-level broad Operation DB reload. **NO Factory Stock init; NO company-from-factory inference;** shared
  KM/ResUS/ResTW marketplace rows stay distinct (the operational-status join keeps its exactly-one-match rule).
- **Legacy kill-switch retained:** `setWorkspaceEnabled('skuDetails', false)` → the page falls back to the broad-cache
  `loadOperationDb` mount path unchanged.

---

## §4 — HALT: A · Weekly Shipping line-logistics editor → `F1_7J_A_UNEXPECTED_BACKEND_REQUIREMENT`
**Finding:** the F1-7J audit (and the round's §3) assumed the `weeklyShipping` workspace payload "already carries
sku_details." **It does not.** `weeklyWorkspaceBuild_` (`40_api_v1_weekly_workspace.gs:238`) reads only
`shipping_plans / shipping_plan_lines / warehouses / carriers` and emits `{ filters, summary, plans, detailsByPlanId,
pagination, dataVersion }`. `sku_details` appears in the workspace's REGISTERED read-scope table list
(`km-api-foundation.js:85`) but is NEVER read or projected by the builder; the per-line `raw` passthrough is the
`shipping_plan_lines` row (no carton dims). `_spLineLogistics` (`shipping-plan.js:992`) needs sku_details
`carton_length/width/height`, `carton_weight`, `item_weight` to LIVE-recompute CBM/gross/net while the user edits a line
qty. Those fields are unavailable in the current payload → wiring the editor to the workspace requires a **40_ backend
projection** (add a sku_details carton-dims array/lookup to the weekly payload). Per §15 this is out of scope for J-A.
**Correction to the F1-7J audit:** the S2 claim "sku_details already in weeklyShipping ws payload" was imprecise (read-scope
≠ emitted payload). `shipping-plan.js` `_spSkuDetail` is UNCHANGED (still reads the broad getter) — HALTED, not silently
backend-changed. **Next:** F1-7J-A2 (project sku_details carton dims into 40_, or a bounded sku-details lookup).

## §5 — HALT: C · Request Order scope resolver → `REQUEST_ORDER_SCOPE_EXISTING_READ_MODEL_NOT_EQUIVALENT`
**Finding:** `_roScopeModalPrefill_` (`request-order.js:1316`) and the marketplace-dropdown builder `_roActiveMarketplaces`
(`:492`) read the FULL marketplace master via `getMarketplaces()` to resolve any country's marketplace universe (the scope
modal must handle ANY scope the user picks). request-order.js (the AI-plan page) has NO on-page scoped read model carrying
that master: the first-layer composer `getAiPlanFirstLayer` returns `{ rows }` only (`:433`), and the `recommendation`
workspace's `marketplaces` are lazy (loaded per row-expand) and scope-subset — neither reproduces the full active
marketplace master at the moment the resolver runs. Per §5 "Do not invent a new source" → HALT this sub-slice. The
resolver is UNCHANGED. **Next:** a bounded marketplace-reference read (A2/A3), or extend the composer/recommendation payload.

## §6 — HALT: E · IR allocation-draft hydrate → `IR_ALLOCATION_DRAFT_SSOT_NOT_BEFORE_EQUALS_AFTER`
**Finding:** §7 directs using the scoped SSOT `getShippingAllocationDraftWorkspace` and explicitly FORBIDS reconstructing
from raw workspace tables (so routing `_hydrateAllocationDraftFromDb` through `_irWsGet('getShippingAllocationDrafts'/
'...Lines')` — which WOULD be byte-identical BEFORE==AFTER — is not permitted). But the SSOT is **not equivalent** to the
current sync hydrate: (1) the SSOT is ASYNC (`operation-system-db-api.js:3292` — its own network fetch), whereas the
hydrate is a synchronous cache read whose caller uses `if (_hydrateAllocationDraftFromDb(ctx)) return;`
(`inventory-replenishment.js:2665`); (2) the SSOT requires a COMPLETE scope incl. `planning_cycle`
(`_allocDraftScopeComplete`, `:2646`), whereas the hydrate selects by country+marketplace(+optional company), latest-updated
non-cancelled — different selection semantics; (3) the SSOT returns `{ data:{ status, draft, lines, issues } }`, a different
shape than the raw drafts/lines the hydrate maps into `bySku`. Migrating to the SSOT would therefore CHANGE behavior,
violating the round's supreme BEFORE==AFTER mandate; the BEFORE==AFTER path (`_irWsGet`) is forbidden by §7. Impasse →
HALT this sub-slice for a product decision. `_hydrateAllocationDraftFromDb` is UNCHANGED. (Note: the persistence PANEL
already uses the SSOT via `_allocDraftInitialLoad`; only the working-draft hydrate remains on the broad cache.) **Next:**
a J-B/J-D decision — either accept the `_irWsGet` raw-table route (BEFORE==AFTER, waives §7's SSOT preference) or converge
the hydrate onto the async SSOT (a deliberate behavior change).

---

## §7 — Authority isolation (unchanged) & guards
No domain-boundary change. IR flow = Gap → Recommendation → Shipping Plan → Shipment (not Request Order); Procurement = Gap
→ AI Plan → RO → PO; Shipment consumes existing PO lines via FIFO; shared factory ≠ company; RAW inventory ≠ allocated;
RAW forecast ≠ adjusted. Incoming Inventory, sitePlanningAllocation, and Event Assist are all UNCHANGED (not touched).

## §8 — Debt delta (PRE = F1-7J audit counts)
| Metric | PRE | POST | Δ |
|---|---|---|---|
| Active broad-cache loader occurrences | 60 | 59 | −1 (sku-regional-details.js primary `loadOperationDb` now canonical-gated to Legacy-only) |
| Secondary broad-cache surfaces | 14 | ~10 | −4 (PO-list view modal; IR reference lookups [marketplaces/warehouses]) + SKU-Regional page moved from PRIMARY-broad to scoped |
| Writer full reloads | 47 | **47** | 0 (untouched — as required) |
| app-prime-dependent surfaces | 7 | 4 | −3 (S3 PO-list view modal; S5 IR reference lookups; and SKU Regional page no longer broad-primes) |
| REGISTERED page workspaces / registered-only | 8 / 0 | 8 / 0 | 0 (NO new workspace) |

app-prime-dependent surfaces remaining (4): S1 SKU Handbook, S2 Weekly line-logistics (HALT A), S4 RO scope resolver
(HALT C), S6 IR Execution-Plan carrier_lead_times, S7 IR allocation-draft hydrate (HALT E). (Net −3 vs PRE: S3 + S5
resolved; SKU-Regional was a PRIMARY-broad page, not in the 7 prime-dependent count, but its primary broad-DB dependency is
now removed.)

## §9 — Files changed
Runtime: `purchase-order-list.js` (B), `inventory-replenishment.js` (D), `sku-regional-details.js` (F). Tests: NEW
`api-existing-workspace-secondary-cutover-f1-7j-a-r1.test.js` (45/0); `km-api-foundation-compat.test.js` (repointed PG1:
sku-regional-details.js → CUTOVER_PAGES). Docs: this file + master-plan delta. **No `.gs`, no `km-api-foundation.js`, no
`operation-system-db-api.js`, no bundle, no DB.**

## §10 — Tests & regression
Focused suite **45/0**. Reran foundation 61/0, compat 50/0, weekly 66/0, sku-details(F1-7H) 53/0, inventory-replenishment
(F1-7I) 66/0, recommendation-cutover 38/0. **Full regression: 230 files, only the 4 known baselines**
(`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`,
`supply-planning-route-inventory`) — no new failures. Bundle unchanged (`aaf5b07…2782`).

## §11 — Deployment
**Apps Script sync: NO. New /exec: NO. DB/schema: NONE. Bundle: NO.** Frontend deploy: `purchase-order-list.js`,
`inventory-replenishment.js`, `sku-regional-details.js`. (The `skuDetails` backend `include.regional` path already ships
from F1-7H — this round only wires the SKU Regional page to it.) Rollback: revert the commit, or
`KM.api.setWorkspaceEnabled('skuDetails', false)` (SKU Regional + SKU Details fall back to Legacy broad-cache, no deploy).

## §12 — Next
- **F1-7J-A2:** project `sku_details` carton dims into the weekly payload (unblock A); add `carrier_lead_times` to the IR
  include (unblock S6); a bounded marketplace-reference read for the RO scope resolver (unblock C).
- **F1-7J-B/-C/-D:** Incoming Inventory / Event Assist / sitePlanningAllocation authority redesigns; and the
  allocation-draft hydrate decision (E).

**STOP after F1-7J-A. Do NOT begin F1-7J-A2 automatically.**
