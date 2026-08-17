# F1-7J-A2-BOUNDED-REFERENCE-AND-INCLUDE-EXTENSIONS-R1 — Bounded reference/projection transports (3 DONE)

**Outcome: TRANSPORT / REFERENCE-DATA only. BEFORE FACT == AFTER FACT. No new business authority, no new formula, no
schema change, no writer-reload change, no app-prime removal.** Baseline PRE HEAD `6452ab1`. Closes the three bounded
transport gaps left by F1-7J-A (weekly line-logistics A, RO marketplace scope C, IR carrier planning S6/S8) via small
ADDITIVE backend read/projection extensions + existing-API reuse. All three previously-HALTed items are now RESOLVED.

## §0 Result summary
| Gap | Surface | Verdict | Approach |
|---|---|---|---|
| A | Weekly Shipping line-logistics SKU carton/detail | **DONE** | 40_ bounded SKU-logistics projection (line-SKUs only) |
| C | Request Order full marketplace reference | **DONE** | REUSE existing `getTable('marketplaces')` (no new API) |
| S6 | IR Execution-Plan `carrier_lead_times` ETA | **DONE** | 60_ `include.carrierPlanning` (secondary-gated) |
| S8 | IR carrier-method `carrier_rate_cards` | **DONE** | same `carrierPlanning` include (same grain, one fetch) |

---

## §1 — A · Weekly Shipping SKU logistics projection
- **§0 audit** — CURRENT SOURCE: `shipping-plan.js` `_spSkuDetail`→`getSkuDetails()` (broad cache). FIELDS REQUIRED (actual,
  read by `_spLineLogistics`): `cartonLength, cartonWidth, cartonHeight, cartonDimensionUnit, cartonWeight, itemWeight`
  (+ `sku`). EXISTING OWNER: none in the weekly payload (40_ read only plans/lines/warehouses/carriers). EXTENSION CHANGES
  SEMANTICS? No (read-only projection). NEW ACTION? No (extend the existing weekly workspace).
- **Backend (40_):** added `sku_details` to `WEEKLY_WORKSPACE_TABLES_`; `weeklyWorkspaceBuild_` collects the SKUs on the
  RETURNED PAGE's plan lines and emits `skuDetails` = RAW passthrough of **only those** sku_details rows (never the full
  master; gated with `include.details`). `tablesRead` 4→5.
- **Frontend:** db-api exposes `KM.DB.normalizeSkuDetail(raw)` (the canonical sku_details normalizer). `shipping-plan.js`
  `_spAdaptWorkspaceToRecords` re-normalizes the projection → `_spRenderReadModel_` stashes it in `_spWsSkuDetails` →
  `_spSkuDetail` reads the projection in Workspace mode (broad `getSkuDetails()` only in the Legacy kill-switch branch).
- **§2 DISPLAY_ONLY preserved:** carton count / CBM / gross / net stay frontend display math (`_spLineLogistics`
  unchanged); `approved_qty` / plan qty / shipment qty / FIFO / factory stock / PO capacity untouched. BEFORE==AFTER for
  every displayed logistics value (proven: `_spLineLogistics` byte-identical from the projection vs the broad master for
  single/multi-SKU, blank dims, zero, UPC, CBM/gross/net, qty changes).
- **§14 no broad cache:** canonical line-logistics no longer requires `_opDbCache` / app prime.

## §2 — C · Request Order marketplace reference (existing-API REUSE)
- **§0 audit** — CURRENT SOURCE: `_roActiveMarketplaces` + `_roScopeModalPrefill_`→`getMarketplaces()` (broad). FIELDS:
  full active marketplace master (`marketplaceId, marketplace, marketplaceDisplayName, country, company, status,
  fulfillmentModel`). EXISTING OWNER: **YES — the generic `getTable` GET action already serves `marketplaces`
  server-side** (`03_master_data_handlers.gs` `handleGetTable_`; db-api `getOperationDbTableFromSheet`). NEW ACTION? **No**
  — §4 preferred #1 (reuse) satisfied; no new API, no router change.
- **Implementation:** db-api `KM.DB.getMarketplaceReference()` = `getOperationDbTableFromSheet('marketplaces')` →
  `normalizeMarketplaceRecord` → SAME `r.marketplaceId||r.marketplace` filter as `normalizeOperationDb`.
  `request-order.js` loads it once per mount (`_roLoadMarketplaceRef_`, chained BEFORE the composer so dropdowns render
  populated) into `_roMarketplaceRef`; `_roActiveMarketplaces` + `_roScopeModalPrefill_` read `_roMarketplaceUniverse()`
  (canonical = scoped ref, fail-closed [] on failure — NO broad fallback; Legacy = broad getter).
- **§5 contract frozen:** the server `filterRows_('marketplaces')` keeps `marketplace_id||marketplace` — identical to the
  client filter, so the reference universe (all `marketplace_id` across countries/companies, incl. inactive + blank-field
  rows, same normalization) equals `getMarketplaces()` exactly (BEFORE scope options == AFTER). The scope modal still
  supports ANY valid user-selectable scope; the full active universe is NOT replaced by a row/recommendation subset.
- **§6/§14 no broad cache:** canonical RO scope resolution no longer reads `getMarketplaces()` / `_opDbCache`.

## §3 — S6 + S8 · IR carrier planning include
- **§0 audit** — CURRENT SOURCE: `_irComputeRouteEta`→`getCarrierLeadTimes()` (grain: `shippingMethod`, `destinationCountry`,
  `avgDays`); `_execRateCardMethods`→`getCarrierRateCards()` (grain: `originCountry`, `destinationCountry`, `marketplace`,
  `shippingMethod`, `shippingMethodLabel`, effective dates) — both broad. EXISTING OWNER: none in the IR payload. EXTENSION
  SEMANTICS? No (reference only). NEW ACTION? No (extend the IR workspace).
- **Backend (60_):** added `carrier_lead_times` + `carrier_rate_cards` as INCLUDE-gated (`carrierPlanning`) missing-safe
  specs; the read loop AND build loop skip un-requested include tables → **base primary payload is byte-identical**
  (BEFORE==AFTER for the primary render; no read cost when carrier not requested). §8: both reference sets share the one
  `carrierPlanning` include (secondary-panel-only per §10).
- **Frontend:** db-api adapter maps `getCarrierLeadTimes`/`getCarrierRateCards` (same normalizers + filters as
  `normalizeOperationDb`; [] in the base payload). `inventory-replenishment.js` `_irLoadCarrierPlanning_()` lazily fetches
  `getWorkspace('inventoryReplenishment', {include:{carrierPlanning:true}})` ONCE (cached) when the Execution Plan renders
  (`initializeShippingAllocation`), extracts ONLY the carrier arrays into `_irCarrierModel`, then refreshes that SKU's
  method options + ETAs. `_irComputeRouteEta`/`_execRateCardMethods` read `_irCarrierGet(...)` (canonical = scoped model,
  fail-closed []; Legacy = broad getter). `_execWarehouseCandidates` now reads `_irWsGet('getWarehouses')` (warehouses are
  already in the primary IR payload) — the last broad read in the Execution-Plan panel.
- **§8/§9 no new authority:** ETA = today + `avg_days` and method options remain existing frontend display logic; NO
  server-side carrier selection/booking/recommendation. BEFORE==AFTER for ETA + method outputs.
- **§14 no broad cache:** canonical Execution-Plan ETA + carrier-method reads no longer require `_opDbCache` / app prime.

## §11 — HALT E untouched
`_hydrateAllocationDraftFromDb` is UNCHANGED (`IR_ALLOCATION_DRAFT_SSOT_NOT_BEFORE_EQUALS_AFTER` stands — deferred to a
product/semantic round). Not routed through `_irWsGet`, not converged onto the async SSOT.

## §12 — Other authority debts untouched (byte-identical)
Incoming Inventory reconstruction, `sitePlanningAllocation` 18-day 3PL pool, FC Event Assist, RO 2nd-layer expand, FC
builder modals — all left exactly as-is.

## §15 — Debt delta (PRE = F1-7J-A POST)
| Metric | PRE | POST | Note |
|---|---|---|---|
| Active broad-cache loader (`loadOperationDb`) occurrences | 59 | 59 | this round routes broad-GETTER reads, not loader calls — no loader site removed |
| Secondary broad-cache surfaces | ~10 | ~6 | resolved: weekly line-logistics, RO scope resolver, IR Execution-Plan ETA, IR carrier-method, IR Execution-Plan warehouses |
| app-prime-dependent surfaces | 4 | 1 | resolved S2 (weekly), S4 (RO scope), S6 (IR carrier); remaining = **S1 SKU Handbook** (A3). (S7 IR allocation-draft = HALT E; IR Monthly-Achievement = dead-stub metric — both out of scope) |
| Writer full reload | 47 | **47** | untouched (asserted) |
| Registered workspaces / registered-only | 8 / 0 | 8 / 0 | no new workspace |

Remaining secondary broad-cache surfaces (~6): fc-summary builder/import modals (self-heal lazy), fc-summary Event Assist
base reads (Event Assist redesign), RO 2nd-layer expand (self-heal lazy), IR allocation-draft hydrate (HALT E), IR
Monthly-Achievement FC read (dead-stub metric).

## §17/§18 — Deployment & version (all ADDITIVE, backward-compatible)
- **Apps Script sync: YES** — `40_api_v1_weekly_workspace.gs`, `60_api_v1_inventory_replenishment_workspace.gs`. **Router
  change: NO** (C reuses the existing `getTable` action; A/S6 are handler-internal projection/include). **New /exec: YES**
  (backend DTO contract gained additive fields/include — deploy backend BEFORE the canonical frontend consumes them).
- **Frontend deploy: YES** — `operation-system-db-api.js`, `shipping-plan.js`, `request-order.js`,
  `inventory-replenishment.js`.
- **Additive only:** 40_ adds a `skuDetails` key (existing consumers ignore it); 60_ returns carrier tables ONLY under
  `include.carrierPlanning` (base payload unchanged); `getMarketplaceReference` reuses `getTable`. No existing DTO field
  mutated. **Bundle: NO** (`aaf5b07…2782`; .gs + pages + db-api are not bundle sources). **DB/schema: NONE.**
- **Rollback:** revert the commit; or kill switches — `setWorkspaceEnabled('weeklyShipping'|'inventoryReplenishment', false)`
  reverts A/S6 to Legacy broad-cache (and the composer flag reverts C), no deploy. On a backend-not-yet-deployed race, the
  canonical frontend degrades fail-closed (weekly line-logistics reads an empty projection until 40_ ships; RO dropdown
  empty until the reference resolves; carrier ETA "unavailable" until 60_ ships) — never a silent broad read.

## §16 — Tests
NEW `api-bounded-reference-include-extensions-f1-7j-a2-r1.test.js` (29/0). Repointed (additive-contract updates):
`km-api-weekly-workspace` (tablesRead 4→5 + sku_details projection), `api-inventory-replenishment-workspace-f1-7i-r1`
(carrier normalizers in eval), `api-ai-plan-first-layer-composer-f1-7e-prereq5` (init ref→composer chain),
`api-weekly-shipping-cutover-f1-7b` (node-safe `typeof window`), `api-existing-workspace-secondary-cutover-f1-7j-a`
(A/C HALT proofs → RESOLVED). Full regression: **231 files, only the 4 known baselines** (`gap-job-done-notice-f1-small-r1`,
`order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`) — no
new failures. Bundle unchanged.

## §19 — Status
Weekly line-logistics transport = **DONE**. RO marketplace scope transport = **DONE**. IR carrier planning transport =
**DONE**. **Batch F is NOT ready** — its prerequisites include A3 (the remaining non-workspace pages + SKU Handbook) and
the deferred authority items (Incoming Inventory, Event Assist, sitePlanningAllocation, allocation-draft HALT E).

**STOP after F1-7J-A2. Do NOT begin A3 automatically.**
