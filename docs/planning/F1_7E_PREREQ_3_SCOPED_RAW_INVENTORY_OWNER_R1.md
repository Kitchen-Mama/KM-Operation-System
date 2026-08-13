# F1-7E-PREREQ-3-SCOPED-RAW-INVENTORY-OWNER-R1 — AI-Plan Layer-1 raw inventory read owner

**Outcome: IMPLEMENTED (backend scoped raw-inventory read owner; BEFORE FACT == AFTER FACT proven for all three facts).**
Baseline HEAD `8f1afdd`. A new backend owner exposes three AI-Plan Layer-1 RAW inventory facts — `siteStockRawQty`,
`overseasStockRawQty`, `factoryStockRawQty` — per SKU/site, provably equal to the current browser `siteStock()` +
`thirdParty()` + `factoryBySku`. **No AI-Plan cutover.** No allocation, no planning engine, no inventory-formula change;
shared-factory pool preserved.

## Owner placement
**New dedicated owner `54_api_v1_raw_inventory_owner.gs`**, action **`rawInventory.get`**. No existing backend owner
exposes these RAW pools — the recommendation runtime (KMPS/KMHP/KMTPP) surfaces only *allocated/projected* supply
(different facts, per PREREQ-0), so reusing it would break BEFORE==AFTER. Dedicated, bounded, RAW-only (consistent with
PREREQ-1/2). Reads only `amazon_inventory_snapshot` + `overseas_inventory_snapshot` + `factory_stock` + `warehouses`
(all missing-safe). Not registered as a planning workspace.

## Frozen fact contracts (extracted verbatim; no formula invented)
**Site Stock (`siteStockRawQty`)** = `siteStock(sku, country, marketplace)`: group `amazon_inventory_snapshot` by
`UPPER(sku)`; keep rows matching `country` (UPPER, **only when scope.country present**) AND `marketplace` (LOWER of
`marketplace||'Amazon'` — the normalizer's blank→'Amazon' default preserved, **only when scope.marketplace present**);
pick the **LATEST** by `String(snapshot_date)` lexicographic (ties → first in sheet order); value =
`num(available_qty)+num(fc_transfer_qty)+num(fc_processing_qty)`. `0` when no rows / no match.

**Overseas Stock (`overseasStockRawQty`)** = `thirdParty(sku, country)`: for each `overseas_inventory_snapshot` row with
`UPPER(sku)`, resolve its warehouse (`warehouses` by `warehouse_id`, last-wins); if found → drop when scope.country
present and warehouse country ≠ scope.country, drop factory warehouses (`is_factory_warehouse ∈ {true,1,yes}`); if not
found → drop when scope.country present (cannot confirm country); **Σ `num(wh_available_stock||available_stock)` over ALL
matching rows** (POOLED across warehouses — **NO latest-snapshot dedup**, unlike Site Stock; the source is a current
per-warehouse snapshot). `0` when the table is empty / no match.

**Factory Stock (`factoryStockRawQty`)** = `factoryBySku`: **Σ `num(fac_current_stock||current_stock)` over ALL
`factory_stock` rows with `UPPER(sku)`** — company/factory/country/marketplace ALL ignored. `0` when no rows.

## Scope contract (per fact — asymmetry preserved, not normalized away)
| Dimension | Site Stock | Overseas Stock | Factory Stock |
|---|---|---|---|
| sku | REQUIRED_FILTER (group key) | REQUIRED_FILTER | REQUIRED_FILTER |
| country | CONDITIONAL_FILTER (row country) | CONDITIONAL_FILTER (via warehouse) | IGNORED |
| marketplace | CONDITIONAL_FILTER (default 'Amazon') | IGNORED | IGNORED |
| company | IGNORED | IGNORED | IGNORED |
| warehouse / factory_id | IGNORED | resolved from data (country + factory-exclusion), not an input filter | IGNORED |
`scope.company` and `scope.factory_id` are **CONTEXT_ONLY** (echoed, never filter any of the three raw pools). All three
facts are deterministic — no `SITE_STOCK_RAW_SEMANTIC_AMBIGUOUS` / `OVERSEAS_STOCK_RAW_SEMANTIC_AMBIGUOUS` /
`FACTORY_STOCK_RAW_SEMANTIC_AMBIGUOUS`.

## Shared-factory KM/ResTW/ResUS proof
`factory_stock` is summed per SKU across ALL rows regardless of company/factory. Proven: a SKU with rows under KM(700) +
ResTW(300) + ResUS(200) on Factory A returns `factoryStockRawQty = 1200` for a KM scope, a ResTW scope, AND a ResUS scope
— the **SAME raw shared pool**. `factory_id` NEVER implies company; company NEVER filters the raw factory fact. (This is
the RAW pool; it is NOT allocated planning supply — the engine may allocate only part of it to one company, a separate
Layer-2 fact.)

## Note on the overseas no-dedup semantic (preserved, not "fixed")
The browser `thirdParty()` sums ALL matching overseas rows without a latest-snapshot filter (the table is a current
per-warehouse snapshot — one row per sku+warehouse). PREREQ-3 preserves this EXACTLY (BEFORE==AFTER is the authority; the
round must not silently change semantics). Proven: two rows for the same warehouse are pooled identically by browser and
backend. **This is not `CURRENT_BROWSER_STOCK_BUG_FOUND`** — it is the intended current-snapshot pooling; if historical
overseas rows were ever introduced, a separate business task (not a transport round) would add latest-snapshot dedup.

## API grain
- **Action:** `rawInventory.get` (router dispatch added). **Tables read:** `amazon_inventory_snapshot` +
  `overseas_inventory_snapshot` + `factory_stock` + `warehouses` ONLY, **missing-safe** (a missing snapshot/stock table →
  `[]` → 0 facts, matching the browser's `_opDbCache` []-on-missing). Never `getOperationDb`.
- **Input:** `{ scope:{country?, marketplace?, company?, factory_id?}, skus:[...] }`.
- **Output:** `{ scope, items:[{ sku, siteStockRawQty, overseasStockRawQty, factoryStockRawQty }], count }`. RAW-qualified
  field names (never a bare `availableQty`/`allocatedQty`/`supplyQty`).
- Discipline mirrors `40_`/`50_`/`52_`/`53_`: pure `rivBuild_` + injectable `io`; S0/S0.5 exact-ID + validate-only
  presence; fail-closed. Read-only; writes nothing; no allocation/gap/recommendation/FIFO/PO/forecast.

## BEFORE == AFTER equivalence (gold-standard)
`api-raw-inventory-owner-f1-7e-prereq3-r1.test.js` **46/0**. The harness runs the **actual** browser `siteStock()` +
`thirdParty()` + `factoryBySku` (extracted) over records from the **actual** db-api normalizers
(`normalizeAmazonInventorySnapshotRecord`/`…Overseas`/`…FactoryStock`/`…Warehouse` + `_invPick`), and the **actual**
backend `rivBuild_` over the raw rows, asserting `backend === (browser === null ? 0 : browser)` per fact. Covered — Site:
single/multi-SKU, exact site, different-country/marketplace excluded, company-ignored, multiple snapshots latest-wins,
blank-marketplace→Amazon default, invalid numeric, zero. Overseas: one/multi-warehouse pooling, same-warehouse multi-row
pooling (BEFORE==AFTER), factory-warehouse excluded, unknown-warehouse country behavior, scope, zero. Factory: one/multi
row summed, canonical vs legacy column, invalid numeric, zero, and the KM/ResTW/ResUS shared-Factory-A proof
(1200==1200==1200). Combined all-three, multi-SKU batch, unknown SKU→0/0/0, missing-table graceful-empty, and
ERROR≠ZERO. Source guards: no getOperationDb/write/allocation/KMPS-KMHP-KMTPP/gap/recommendation/PO/forecast; RAW-qualified
DTO names; `request-order.js` still owns the aggregations + broad cache and does NOT yet consume the owner.

## Planning-allocation isolation
54_ performs NO allocation, subtracts no Gap, reserves nothing, includes no PO remaining/incoming, and does not read
KMPS/KMHP/KMTPP or any gap/recommendation table (structural proof). It is a read-only raw-context owner.

## No AI-Plan cutover (this round)
`request-order.js` unchanged: still `siteStock()`/`thirdParty()`/factory sum, still `loadOperationDb({force:true})`; no
UI/loading/Suggest-Order/Target-Rules/quantity change. Owner composed later in PREREQ-5. No frontend/db-api/foundation
wiring → no `UNEXPECTED_FRONTEND_DEPENDENCY`.

## Tests / regression
PREREQ-3 suite 46/0; PREREQ-1 28/0; PREREQ-2 40/0; inventory/gap/recommendation + foundation/router suites green. **Full
regression: 222 files, only the 4 known baseline failures (none new).** Bundle unchanged (`aaf5b07`, --check PASS).

## Deployment / version
- **PRE HEAD** `8f1afdd` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `54_api_v1_raw_inventory_owner.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment: YES** (new router action + handler). No deploy-ordering hazard — nothing consumes it yet;
  deploy independently ahead of PREREQ-5.
- **Frontend deploy: NO.** **Bundle rebuild: NO** (`54_` not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `rawInventory.get`; no existing route/DTO changed; KMPS/KMHP/KMTPP/gap/recommendation
  untouched.
- **Rollback:** revert this commit (removes `54_` + the router dispatch); nothing depends on it.

## Prerequisite status
PREREQ-0 = DONE · PREREQ-1 = DONE · PREREQ-2 = DONE · **PREREQ-3 = DONE** · PREREQ-4 = NOT_STARTED ·
PREREQ-5 = NOT_STARTED. F1-PHASE1-LIVE-ACCEPTANCE-R2 = PAUSED_BY_USER_FOR_API_MIGRATION (unchanged).

## FINAL GATE — PASS
`siteStockRawQty` == current Site Stock fact ✓ · `overseasStockRawQty` == current Overseas fact ✓ · `factoryStockRawQty`
== current Factory Stock fact ✓ (same fixture/scope) · no allocation ✓ · no planning engine duplicated ✓ · no frontend
cutover ✓ · shared-factory behavior preserved ✓ · no broad DB read ✓ · no business formula change ✓.

**Exact next task:** **PREREQ-4 — lead-time read** (`supplier_price_list` latest-active `lead_time_days` per SKU),
reproducing the current browser `leadTime()`; may fold into the composition owner. Do NOT begin automatically.
