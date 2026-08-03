# Inventory Table Mapping Spec (Inventory Replenishment / 貨物庫存表)

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** how the Inventory Replenishment page maps to data sources + display fields.
> - **Canonical Owner For:** Inventory page field → source mapping and display labels.
> - **Not Owner For:** formulas (`SUPPLY_PLANNING_CALCULATION_RULES.md` — all Current Stock / Qualified Incoming / shortage / allocation math), schema (`DATABASE_RELATIONSHIP_MAP.md`), the **Qualified Incoming allowlist** (owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §2E / §10 · Shipment `SHIPMENT_CENTER_SPEC.md` §10; B-4 contract resolved, Runtime pending).
> - **Status:** Reviewed — B-1 / B-2 / B-3 RESOLVED; **B-4 CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED** (On-the-Way + external-quarantine read model §22; Runtime / read-model pending); B-5 / B-6 / B-7 / B-8 UNRESOLVED.
> - **Current Version:** v1.6.0 (Round 4D-C, 2026-08-01: added **§22 On-the-Way + External-Quarantine Read Model** — display mapping only, Runtime NOT implemented). v1.5.9 (Batch B Round 1: Factory Stock `fac_*` residual fix in §17.3A / display map + header/footer/changelog version reconciliation).
> - **Last Reviewed:** 2026-07-30.
> - **Depends On:** Calculation Rules, Database Relationship Map, Amazon Snapshot Import, Runtime Architecture.
> - **Blocked By:** Batch B — **B-4 Qualified Incoming and On-the-Way Runtime / read-model implementation prerequisites**; the business predicate, per-table direction and external-origin admission contract are **resolved** (see `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-4 / `SUPPLY_PLANNING_CALCULATION_RULES.md` §2E / §38). *(B-1 Reserve Trigger is resolved elsewhere — owner Architecture Principles §8A.1; not a blocker of this document.)*

**Status:** 🟢 v1.6.0 — Inventory Table Mapping **finalized** (Spec only — this document does **NOT** own any calculation formula; all formulas are owned by `SUPPLY_PLANNING_CALCULATION_RULES.md` **the active canonical formula SSOT**)
**Last Updated:** 2026-08-01
> **Changelog v1.5.8 → v1.5.9 (2026-07-30):** Batch B Round 1 residual cleanup — replaced the remaining unprefixed Factory Stock field names with the canonical `fac_*` namespace (`factory_stock.fac_current_stock` in the Factory CN/TW display map §17.3A; `fac_current_stock=0` / `fac_reserved_stock=0` in the lifecycle baseline + Runtime-status note), per the Inventory Field Namespace Rule (§3.0). Reconciled header/footer/changelog to the same version. Overseas `wh_*` and non-inventory entity fields deliberately left unchanged. No formula, mapping direction, or runtime change.
> **Changelog v1.5.7 → v1.5.8 (2026-07-28):** Batch A repair — clarified **Engine Current Stock vs UI Inventory Position vs Qualified Incoming** separation (display vs engine-coverage). Documentation only; no formula redefined. *(Changelog entry backfilled 2026-07-30.)*
> **Changelog v1.5.6 → v1.5.7 (2026-07-24):** documentation-only sync to calculation owner **v4.1** — Avg Sales/Day now sampled as the latest 30 eligible normal days within a 90-completed-day source window (§8/§13); §21 calculation Open Questions closed (resolved → owner sections, runtime mapping pending); §14/§15 restated as owner-pointing summaries. No formula redefined here. *(Round-3 residual cleanup, same v1.5.7: §13 "Suggested Qty" mapping now specifies its canonical meaning = Recommended Shipping Qty from `shipping_allocation_draft_lines.recommended_qty` per owner §2C.1/§31 — NOT raw Engine A shortage and NOT Request Order Suggested Order Qty; §16 restated as a UI/data-mapping summary that does not own the allocation rule — owner §20 is authoritative.)*
**Maintained By:** Development Team
**Authority / context (read, not overridden):** [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) (**authoritative for all formulas**), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md), [`SYSTEM_RUNTIME_ARCHITECTURE.md`](./SYSTEM_RUNTIME_ARCHITECTURE.md), [`UI_COMPONENT_GUIDELINES.md`](./UI_COMPONENT_GUIDELINES.md) (**KM Sticky Header Framework**).

> **Changelog v1.5.5 → v1.5.6 (2026-07-01):**
> - **§11.6 added — KM Sticky Header Framework:** the main table's two-layer sticky header now pins at **`--km-sticky-top-base`** (the sticky control panel's **live measured height**, set by the reusable `KM.stickyHeader` helper on mount/resize) instead of a hard-coded `top: 72px`. **Root cause of the covered-header bug:** the control panel is taller than 72px (and wraps taller on small screens), so with a fixed 72px offset it overlapped/covered the `Current Stock / On the Way / Avg. Sales/day` row. Header height + row heights + all sticky z-indexes now come from centralized framework variables (`assets/css/core/km-sticky-header.css`); **no per-page magic numbers.** Future Request Order / Purchase Order / Shipment / Warehouse Stock tables reuse the same framework (see [`UI_COMPONENT_GUIDELINES.md`](./UI_COMPONENT_GUIDELINES.md)). CSS + core helper only; no data / calculation / Submit Plan change.

> **Mapping + finalized rules.** This defines how the Inventory Replenishment main table (貨物庫存表) maps to data sources, the finalized AI-suggestion / replenishment direction, the Overseas Shared Inventory Allocation rule, and the Marketplace Fulfillment Model flow. It is **not** the final frontend and **not** the calculation engine code. Where this and a domain spec differ, the **domain spec wins** (formulas live in `SUPPLY_PLANNING_CALCULATION_RULES.md`).

> **Changelog v1.5.4 → v1.5.5 (2026-07-01):**
> - **§11 UI polish:** (1) **Upcoming Event** no longer over-tall — the expanded row uses `align-items: flex-start` and second-row cards are `flex: 0 0 auto`, so Upcoming Event matches the Shipping Shipment / 3rd Party small-card height. (2) **Recommendation Summary title→table spacing** tightened to match Long Term Storage (title `margin-bottom: 4px`). (3) **Recommendation Summary Total row** shows only `Total` + `Qty` — **Route and Reason blank**. (4) **Execution Plan Method/Delete no longer overlap** — grid `minmax(100px,1fr) minmax(100px,1fr) 60px minmax(130px,1fr) 36px`, `column-gap: 8px`, **Group D widened to 490px**. Cross-ref: cost shown at planning is an **estimated quote** (`CARRIER_AND_ROUTE_SPEC.md` §4B). CSS-only + Total-row markup; no data/logic change.
>
> **Changelog v1.5.3 → v1.5.4 (2026-07-01):**
> - **§11.5 UI polish:** (1) **Top-row cards visually aligned** — Stock / LTS / Forecast Breakdown / Sales Trend / Achievement Rate share `min-height` ≈150px and no longer flex-grow (Forecast & Achievement stop stretching tall); charts keep 100px canvas (not squeezed). (2) **Recommendation Summary `Reason` single-line** (`table-layout: auto` + `white-space: nowrap`, no ellipsis) with Group C widened to **420px**. (3) **Recommendation Summary header background = `rgb(255,248,240)`** (light warm, dark text) — that table only. (4) **Execution Plan** delete-column header text removed (red `×` only); grid `… 56px minmax(110px,1fr) 32px` + `column-gap: 8px` so Method and `×` never overlap; Group D widened to **440px**. CSS-only + one label markup change; no Submit Plan / data / calculation change.
>
> **Changelog v1.5.2 → v1.5.3 (2026-07-01):**
> - **§11.5 rewritten — Expanded Row Layout v3 (stable fixed-width horizontal):** the four groups (A inventory / B forecast context / C sales recommendation / D action plan) use **fixed widths (A≈320 / B≈240 / C≈400 / D≈420)** and **never shrink, grow, or wrap**. **Removed the `@media (max-width:900px)` vertical single-column reflow and all `flex-wrap` on the expanded row** — small screens now keep the groups horizontal and scroll them via the **main table's horizontal scroll**. Expanded row is **content-height** (no absolute/transform/height-collapse) so it **never overlaps the next SKU row**. Recommendation Summary: title note removed (just "Recommendation Summary"), columns **Window / Qty / Route / Reason** shown in full (no ellipsis; `Stock Sufficient` complete). Execution Plan: columns **From / To / Qty / Method / X**, grid `minmax(90px,1fr) minmax(90px,1fr) 56px minmax(96px,1fr) 28px` (Method/X never overlap; X off the card edge). Top chart cards share `min-height` for visual alignment. CSS-only + label/markup tweaks in `inventory-replenishment.js` / `.css`. No Submit Plan / data-structure / calculation change.
>
> **Changelog v1.5.1 → v1.5.2 (2026-07-01):**
> - **§11.5 rewritten — Expanded Row Layout v2:** four horizontal groups, each stacking vertically — **A** inventory state (Stock/LTS/Shipping/3rd Party), **B** planning context (Forecast/Event, narrowed), **C** recommendation insight (Sales Trend → **Recommendation Summary**), **D** decision action (Achievement Rate → **Execution Plan**). Recommendation Summary and Execution Plan no longer share one narrow stack. Hardened overflow: **no content may exceed its card/container** (Delete `×` fixed in-track), `min-width:0` on all grid/flex items + inputs/selects, Recommendation table `table-layout:fixed`, Execution grid `minmax(0,1fr)` tracks, Recommendation Summary title spacing tightened. Single overflow = main-table `.scroll-col`; no nested scrollbars; ≤900px collapses to one column. CSS-only + markup regrouping in `inventory-replenishment.js` / `.css`. No Submit Plan / data-structure / calculation change.
>
> **Changelog v1.5 → v1.5.1 (2026-07-01):**
> - **§11.5 added — expanded-row layout rule (UI):** Recommendation Summary and Execution Plan are **stacked vertically** in one planning column (not side-by-side); both reuse the left detail-card styling. The expanded row must **not** use nested vertical or horizontal scrollbars — panels **wrap** (`flex-wrap`) and the **main table's horizontal scroll is the single overflow strategy**; the sticky/top-aligned two-row header is preserved. Narrow widths (≤ 900px) collapse to a single top-to-bottom column. CSS-only fix in `inventory-replenishment.css` + minor markup/class changes in `inventory-replenishment.js` (planning column wrapper; shared exec-plan grid class). No Submit Plan / data-structure change.
>
> **Changelog v1.4 → v1.5:**
> - **§11 rewritten — second-layer right panel redefined as `Recommendation Summary` (top, read-only system suggestion) + `Execution Plan` (bottom, the submitted plan).** Replaces the legacy `AI Suggestion` / `Shipping Allocation` / `Shipping Plan Suggestions` trio. **`Shipping Allocation` is now a legacy name; `Shipping Plan Suggestions` removed.**
>   - Recommendation Summary table: **Target Window / Suggested Qty / Suggested Route / Reason** over rows `0–18d / 19–30d / 31–45d / 46–90d / Total`. Suggested Route + Reason are **first-version placeholders** (`--` / `AI Pending`); no AI engine introduced.
>   - Execution Plan route list: **Ship From / Destination / Suggested Qty / Shipping Method / Delete** + **`+ Add Route`**. First version allows manual entry; future `ship_from` / `destination` / `shipping_method` come from **`replenishment_route_rules`** (`CARRIER_AND_ROUTE_SPEC.md`) and may be permission-locked.
>   - **API-ready (§11.4):** Execution Plan lives in centralized JS state (`window.KM.shippingAllocationDraft`); **Submit Plan reads ONLY the Execution Plan state**, never the Recommendation Summary or the DOM; `sessionStorage` is recovery-only; all writes go through `KM.DB` / Apps Script. Implemented in `inventory-replenishment.js` + `inventory-replenishment.css`.
>
> **Changelog v1.3 → v1.4:**
> - **§5 Long Term Storage standardized (no country branch):** **Over 90+ = `inv_age_91_to_180_days`** (the `inv_age_0_to_90_days` bucket is **not** included — corrected after the initial v1.4 draft); **Over 180+ = `inv_age_181_to_270_days` + `inv_age_271_to_365_days` + `inv_age_365_plus_days` + `inv_age_366_to_455_days` + `inv_age_456_plus_days`** (previously omitted `inv_age_365_plus_days` — corrected). **`inv_age_61_to_90_days` removed** (superseded by `0–90` in DB/import only); missing buckets count as 0. Implemented in `inventory-replenishment.js` (`IRMap.longTermStorage`), `operation-system-db-api.js` (added `invAge0To90Days`, retained for storage), and `06_amazon_import_config.gs` (all age buckets optional; `inv-age-61-to-90-days` removed).
>
> **Changelog v1.2 → v1.3:**
> - **Avg Sales/Day is no longer always `sales_units_7d ÷ 7`.** It now uses **`normalized_avg_sales_per_day`** (the latest 30 **eligible normal** sales days sampled backward within a 90-completed-day source window, this SKU's event/promotion days excluded) when contamination exists and enough normal days are available; otherwise it falls back to `sales_units_7d ÷ 7` (per `SUPPLY_PLANNING_CALCULATION_RULES.md` §22.2). **Sales Trend still shows the Past 7 complete days** — only the Avg Sales *calculation* uses the 90→30-normal-day normalization (§8, §13).
>
> **Changelog v1.1 → v1.2:**
> - §5 Long Term Storage: kept the finalized Over 180+ formula and added the **report-version compatibility note** — `inv_age_365_plus_days` is the backward-compatible fallback for older Amazon reports, while `inv_age_366_to_455_days` / `inv_age_456_plus_days` are preferred when available. The importer now maps these buckets via `optionalFieldMap` (missing → blank/0, never fails the import).
>
> **Changelog v1.0 → v1.1:**
> - Added the **Special Event Preparation-Date rule** (§8.1): an event is bucketed by `Preparation Date = Event Start Date − 30 days`, not by the event date itself; all Need buckets (0–18 / 19–30 / 31–45 / 46–90) are judged against the Preparation Date; each event is counted once (no repeated accumulation).
>
> **Changelog v0.2 → v1.0:**
> - Filter scope finalized to **Company + Country + Marketplace** (Company added).
> - Stock Card mapping finalized (incl. **Unsellable** = `amazon_inventory_snapshot.unfulfillable_qty`).
> - Long Term Storage **Over 180+** finalized to sum `181_270 + 271_365 + 366_455 + 456_plus`.
> - Sales Trend finalized to **Past 7 Days** (previous 7 complete days, exclude today) + Apps Script requirement stated.
> - Added **First Layer Summary Mapping** (Current Stock / On The Way / 3rd Party Stock / Avg Sales per Day / 60 Days FC / Upcoming Event / Days of Supply / Suggested Qty / Factory CN / Factory TW).
> - **Sales Driven** algorithm replaced with cumulative incremental-bucket logic (count-once events, deduct-once on-the-way).
> - **Forecast Driven** finalized with Safety Days **30**.
> - Added **Overseas Shared Inventory Allocation** chapter (7 rules) — now official Supply Planning rule.
> - Added **Marketplace Fulfillment Model UI Flow** (platform_fulfilled / self_fulfilled / hybrid).

---

## 1. Positioning

- The Inventory Table is the **first operational view** for Supply Planning.
- It **reads** from: Amazon snapshots (`amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_daily_sales_snapshot`, `amazon_weekly_sales_snapshot`), FC forecast tables (`fc_regular_forecast`, `fc_target_rules`, `fc_special_events`), `warehouses` + `overseas_inventory_snapshot`, `factory_stock`, and shipment / on-the-way data.
- It must **always be scoped by Company + Country + Marketplace**.
- **Never aggregate** stock or sales across all marketplaces unless a future spec explicitly requests it.

---

## 2. Filter scope (mandatory)

- **Company + Country + Marketplace are mandatory runtime filters.**
- Only the **selected marketplace's data** is displayed. **Never aggregate all marketplaces together.**
- All stock, sales, forecast, long-term-storage, event, shipment, allocation, and recommendation logic must be computed **within the selected Company + Country + Marketplace**.
- **SKU is already the unique key inside the table** (display grain = SKU). SKU and Status are already wired and out of scope for this mapping.

### 2.1 Marketplace display label rule (UI display vs DB key)
- The Marketplace **filter dropdown** and the **results-table marketplace column** display **`marketplace_display_name`** (e.g. `KM Walmart`), falling back to the canonical `marketplace` key when the display name is blank.
- The **selected/stored value stays the canonical `marketplace` key** — the display name is never used as the DB key. Country/marketplace filtering and all downstream scope logic continue to match on the canonical key.
- Options are **deduped by `value` + `label` pair** (not by key alone) so distinct display names for the same key remain visible/selectable.
- Helper: `_replenMarketplaceLabel(key, company, country)` (runtime label resolution from the `marketplaces` registry). Add SKU / Import marketplace dropdowns already showed the display name. See `FC_SUMMARY_SPEC.md` §11 for the shared rule.

---

## 3. Database sync — overseas inventory (current DB structure)

These tables have **already been updated in the DB**. Documented for mapping reference. **No schema change is proposed by this spec.**

### 3.0 Inventory Field Namespace Rule (canonical — finalized 2026-07-21)

- **`fac_*`** fields belong **exclusively** to the Factory Stock domain (`factory_stock`): `fac_current_stock`, `fac_reserved_stock` (derived `fac_available_stock`).
- **`wh_*`** fields belong **exclusively** to the Overseas Warehouse Inventory domain (`overseas_inventory_snapshot` / `overseas_inventory_movements`): `wh_physical_stock`, `wh_available_stock`, `wh_reserved_stock`, `wh_damaged_stock`, `wh_on_the_way_qty`, `wh_on_the_way_eta`, `wh_on_the_way_bucket`, `wh_quantity`, `wh_quantity_before`, `wh_quantity_after`, `wh_before/after_physical_stock`, `wh_before/after_reserved_stock`, `wh_before/after_available_stock`.
- `fac_*` must **never** hold an overseas balance; `wh_*` must **never** hold a Factory Stock balance; `wh_quantity` applies **only** to `overseas_inventory_movements`.
- **Generic unprefixed** stock/movement field names must **not** be introduced into these two domains without explicit specification approval.
- **Entity-specific quantities outside these inventory tables** (PO lines, shipment lines, allocation lines, receiving lines, marketplace snapshots, etc.) **retain their existing names** — they are NOT renamed.

### 3.1 `overseas_inventory_snapshot` (current columns)

```
overseas_inventory_id, snapshot_date, warehouse_id, sku, site_sku,
wh_physical_stock, wh_available_stock, wh_reserved_stock, wh_damaged_stock,
wh_on_the_way_qty, wh_on_the_way_eta, wh_on_the_way_bucket,
last_movement_at, updated_by, created_at, updated_at, note
```

> **Inventory namespace (finalized 2026-07-21):** Overseas Warehouse Inventory columns are `wh_*`. `wh_physical_stock` / `wh_available_stock` / `wh_reserved_stock` / `wh_damaged_stock` / `wh_on_the_way_qty` / `wh_on_the_way_eta` / `wh_on_the_way_bucket` **supersede** the earlier unprefixed names (same fields, renamed to disambiguate from the Factory `fac_*` domain). See the Inventory Field Namespace Rule (§3.0 / `DATABASE_RELATIONSHIP_MAP.md`).

**Stock definitions (authoritative for warehouse-side inventory):**
- `wh_physical_stock` = physical warehouse inventory (on-hand).
- `wh_reserved_stock` = reserved by planning / allocation.
- `wh_damaged_stock` = unsellable / damaged at the warehouse.
- `wh_available_stock` = `wh_physical_stock − wh_reserved_stock − wh_damaged_stock` **where the source reports a reconstructable value; the snapshot may also carry a source-reported `wh_available_stock` that is not reconstructable from the other columns — preserve the source value (this rename does not change the source/calculation contract).**
- `wh_on_the_way_qty` / `wh_on_the_way_eta` / `wh_on_the_way_bucket` = inbound-to-warehouse quantity, its ETA, and the ETA bucket — the **warehouse-side On-the-Way source** used by the Sales Driven shipment deduction (§14).

> `overseas_inventory_snapshot` is **warehouse-side** inventory (3PL / overseas warehouse), **not** Amazon FBA stock and **not** factory stock. Amazon FBA stock comes from `amazon_inventory_snapshot` (§4); factory stock from `factory_stock` (§13).

> **Daily Report Pipeline (canonical cadence, `SYSTEM_RUNTIME_ARCHITECTURE.md` §7A).** The daily import/refresh of platform inventory, daily sales, forecast/source snapshots, and qualified on-the-way runs **12:00 Asia/Taipei** and updates the **Analysis Layer only** — it **creates/modifies no recommendation Draft** (`shipping_allocation_drafts` / `request_order_allocation_drafts`), never overwrites user-entered quantities, and never submits a plan or creates a Shipment/PO. *(Note: an existing BQ daily-sales importer at 16:00 Asia/Taipei is flagged for reconciliation against the 12:00 pipeline — Runtime Mapping Required, §7A.)*

### 3.2 `overseas_inventory_movements` (movement ledger — future reservation control)

```
movement_id, movement_date, warehouse_id, sku, site_sku,
movement_type, movement_scope, from_stock_type, to_stock_type,
wh_quantity, wh_quantity_before, wh_quantity_after,
wh_before_physical_stock, wh_after_physical_stock,
wh_before_reserved_stock, wh_after_reserved_stock,
wh_before_available_stock, wh_after_available_stock,
reference_type, reference_id, source_module, created_by, created_at, note
```

> **Inventory namespace (finalized 2026-07-21):** Overseas movement quantity/balance columns are `wh_*` (supersede the earlier unprefixed names). `wh_quantity` preserves the existing movement-type sign contract.
> **⚠ Unresolved semantics (reported to product owner):** `wh_quantity_before` / `wh_quantity_after` are **not precisely defined by the current authority**. In the only implemented writer (`handleAdjustOverseasInventory_`, manual adjustment) they record the **`wh_available_stock` bucket** balance before/after (the bucket named by `to_stock_type`, which is always `available` today); the general contract for other movement types is undefined. **Do not assume they mean physical stock.** Definition pending owner confirmation.

- Records each movement and the **before/after balances per stock type** (`wh_before/after_physical_stock` / `_reserved_stock` / `_available_stock`); `movement_scope` classifies the movement domain.
- `from_stock_type → to_stock_type` models transitions such as `available → reserved` (allocation hold) and `reserved → available` (release).
- **Future reservation control:** this ledger is the intended mechanism to make `wh_reserved_stock` auditable so allocation/planning can place and release holds. **No reservation logic / write path / UI is implemented or implied here.**

---

## 4. Stock Card Mapping

Scope: selected Company + Country + Marketplace, per SKU. Source: `amazon_inventory_snapshot`.

| UI field | Source |
|----------|--------|
| **Available** | `amazon_inventory_snapshot.available_qty` |
| **FC Transfer** | `amazon_inventory_snapshot.fc_transfer_qty` |
| **FC Processing** | `amazon_inventory_snapshot.fc_processing_qty` |
| **Customer Orders** | `amazon_inventory_snapshot.customer_order_qty` |
| **Unsellable** | `amazon_inventory_snapshot.unfulfillable_qty` (field already exists in DB) |

> **Sellable vs in-transit (Batch A 2026-07-28):** only **Available** is currently sellable. **FC Transfer** and **FC Processing** are **in-transit-to-FBA** buckets — they roll up into the UI **Inventory Position** display (§13) but are **not** part of the Engine's sellable **Current Stock**; they offset demand only as **Qualified Incoming** when qualified (owner `SUPPLY_PLANNING_CALCULATION_RULES.md`; qualification direction = B-4, contract resolved / Runtime pending). **Customer Orders** / **Unsellable** are never added to sellable stock.

---

## 5. Long Term Storage

Scope: selected Company + Country + Marketplace, per SKU. Source: `amazon_inventory_health_snapshot`.
Purpose: identify **slow-moving inventory** for promotion / discount / ad actions.

**Unified formula (FINAL — no country branch; missing / blank / undefined buckets all count as 0):**
```
Over 90+  = inv_age_91_to_180_days        (inv_age_0_to_90_days is NOT included)

Over 180+ = inv_age_181_to_270_days
          + inv_age_271_to_365_days
          + inv_age_365_plus_days
          + inv_age_366_to_455_days
          + inv_age_456_plus_days
```

| UI field | Meaning | Source |
|----------|---------|--------|
| **Over 90+** | stock aged **91–180 days** | `inv_age_91_to_180_days` |
| **Over 180+** | stock aged **above 180 days** | sum of the 181+ buckets above |

> **`inv_age_0_to_90_days` is NOT part of Over 90+.** It remains imported/stored in `amazon_inventory_health_snapshot` but does **not** contribute to the Over 90+ display.

> **One algorithm for every country / marketplace** — there is **no country-specific branch**.
> **`inv_age_61_to_90_days` is removed** and must never be used (the `0–90` bucket supersedes it).
>
> **Report-version compatibility (importer optional buckets).** Amazon Inventory Health reports differ by marketplace / report version. The importer treats **all age buckets as optional** (`optionalFieldMap`, per [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) §7.2 / §9.1): a missing bucket maps to **blank (0 in the sum)** and never fails the import.
> - A given report supplies **either** the single `inv_age_365_plus_days` top bucket (older reports) **or** the finer `inv_age_366_to_455_days` / `inv_age_456_plus_days` buckets (newer reports) — they are mutually exclusive per report version, so summing all three in Over 180+ stays correct (the absent set contributes 0).
> - The Inventory Table reads whatever the snapshot holds — no Inventory-Table schema change is implied here.

---

## 6. Sales Trend — Past 7 Days

- **Display:** **Past 7 Days** (no longer 4 days). Show each day's sales individually.
- **Source:** `amazon_daily_sales_snapshot.sales_units`.
- **Filter:** Company + Country + Marketplace + SKU.

> **CLARIFICATION (2026-07-22) — anchor on the latest DB date, not browser-today.** The 7 days are the
> **calendar range `latest_db_date − 6 … latest_db_date`**, where `latest_db_date` is the most recent
> `snapshot_date` present **in the scoped result** (Company+Country+Marketplace+SKU). The chart renders
> **exactly seven x-axis dates / seven data points**, sorted chronologically. Browser "today" is never the
> end date (the snapshot excludes today and may lag). A date inside the window with no row is still shown
> on the axis as an explicit **no-data GAP** — never a fabricated 0 (per the no-fabrication rule). An empty
> scoped result renders an honest empty chart (no synthetic points).

**Apps Script note (CANONICAL — active SSOT):** the Daily Sales snapshot's canonical source window is the **latest 90 completed calendar days, excluding today** (`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` §7.4 — `retentionDays: 90` / `lookbackDays: 90`). *(Runtime gap: if the current importer still runs `lookbackDays: 30`, that is a recorded implementation gap — see `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` §7.4 and `project-current-state.md`; this spec states the requirement, not a claim that runtime is live.)* This single snapshot serves **two** purposes:
- **Sales Trend display = the most recent 7 complete days** (unchanged — show each of the last 7 completed `snapshot_date` rows, excluding today).
- **Avg Sales/Day** is the Normal Sales Days baseline **defined by `SUPPLY_PLANNING_CALCULATION_RULES.md` §22.2** (90-day search → latest 30 eligible normal sales days, excluding this SKU's event/promotion days). This page **consumes** that value and does **not** redefine the formula (§13).

> **Trend vs Avg Sales are separate:** the trend chart stays at 7 days; the 90-day source window exists only to sample the latest 30 normal days for a clean Avg Sales/Day baseline. No new `amazon_daily_sales_snapshot` column and no BigQuery schema change.

---

## 7. Forecast Breakdown — Next 3 Months

- **Display:** the **next 3 months** of forecast; show **each month** and the **total**.
- **Source:** `fc_regular_forecast`.
- **Target Rules must already be applied before display.**

**Target Rule Priority (only ONE rule may apply): SKU > Series > Category**
- If a **SKU-level** rule exists → use it.
- Else if a **Series-level** rule exists → use it.
- Else if a **Category-level** rule exists → use it.
- The lower-priority level applies **only when** the higher level does not exist. **Never stack** SKU + Series + Category.

> Target-rule math is owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`; this spec fixes the **resolution priority** and the display window.

---

## 8. Upcoming Event — Next 3 Months

- **Source:** `fc_special_events`.
- **Display window:** next 3 months only.
- **Display fields:** Event Name · Period · FC Qty · **Total Event Qty**.
- **Each event counts once** for AI Suggestion (§14) — never double-count one event across multiple Need buckets.

### 8.1 Special Event Preparation-Date Rule (consumer view — formula owned by Calculation Rules §10)

The **authoritative Preparation-Date formula is owned by [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md) §10**; this section only describes how the Inventory Replenishment page **consumes** it — it does **not** own or redefine the formula. As a summary of the §10 rule: event demand must be prepared **before** the event begins, so an event is **not** placed in a Need bucket by its event date — it is placed by its **Preparation Date**:

```
Preparation Date = Event Start Date − 30 days
```

- **All Need buckets (0–18 / 19–30 / 31–45 / 46–90) are judged against the Preparation Date**, not the event start/end date. The bucket is the one whose day-window (counted from today) contains the Preparation Date.
- **Each event is counted once.** An event contributes its `fc_qty` to exactly one Need bucket (the one its Preparation Date falls into) and **must not be accumulated again** in any other bucket or in a later recalculation pass.
- If the Preparation Date is already in the past (event imminent), the event falls into the earliest bucket (0–18d).
- The **authoritative event-timing formula is `SUPPLY_PLANNING_CALCULATION_RULES.md` §10** (not this section). This consumer summary supersedes the previous "attribute by event period" wording in §14 for the page's display; where any wording differs, **§10 wins**.

> Example: an event starting **Aug 15** has Preparation Date **Jul 16**. If today is **Jul 1**, the Preparation Date is 15 days out → it lands in the **0–18d** bucket (not by the Aug 15 event date).

### 8.2 Special Event Display Contract (CANONICAL 2026-07-22)

Special Event stays visible in **three** places (and stays part of the formula even after a Draft / Plan / Shipment is created — only timely eligible supply offsets its remaining gap):

1. **Upcoming Event Card** — event name · event period · Preparation Date · Event FC.
2. **Recommendation Summary** — a small **Special Event badge** on affected Window rows + the Event quantity included in **Reason**. **Do NOT add a separate wide Event column** (the 5-column contract §11.2 is fixed).
3. **Sales Trend** — optional event marker / background band. **Do NOT mix it into Monthly Achievement Rate.**

---

## 9. Shipping Shipment

- **Still pending — no mapping yet. Placeholder retained.**
- Future mapping to shipment / On-the-Way modules per [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) (`shipments` + `shipment_lines` + ETA) and warehouse-side `overseas_inventory_snapshot.on_the_way_*`.

---

## 10. Achievement Rate

- **Pending.** Will depend on the future Monthly Sales BigQuery summary (see §21).

---

## 11. Second-layer right panel — Recommendation Summary + Execution Plan

The expanded SKU row's **right panel** is split into two blocks (top → bottom). This **replaces the legacy trio `AI Suggestion` / `Shipping Allocation` / `Shipping Plan Suggestions`.**

### 11.1 Terminology (authoritative)

| New name | Meaning | Submitted? |
|----------|---------|-----------|
| **Recommendation Summary** | the **system suggestion** (per-window need + suggested route + reason). Read-only. Replaces **AI Suggestion**. | ❌ NOT submitted |
| **Execution Plan** | the PM's **actual shipping plan** (one or more routes) that Submit Plan pushes to the Weekly Shipping Plan. Replaces **Shipping Allocation** (legacy name). | ✅ the only thing submitted |

- **`Shipping Allocation` is a LEGACY name** — no longer used as a primary block title. The Working Draft that backs the Execution Plan may still be called the "Execution Plan Working Draft" (was "Shipping Allocation Working Draft").
- **`Shipping Plan Suggestions` (Stage 2 placeholder) is removed.**
- **Submit Plan uses the Execution Plan only — never the Recommendation Summary.**

### 11.2 Recommendation Summary (read-only) — FINAL 5-column small spec (CANONICAL 2026-07-22)

**Recommendation Summary is system-generated, read-only, and NEVER directly submitted** (only the Execution Plan is submitted — §11.3/§11.4). Rows are the incremental, non-overlapping windows (`0–18d` / `19–30d` / `31–45d` / `46–90d`) + a **Total** row. The compact table contains **exactly five columns**:

| Column | Meaning |
|--------|---------|
| **Window** | `0–18d` / `19–30d` / `31–45d` / `46–90d` / **Total**. |
| **Calculated Gap** | destination demand remaining **after** destination stock + timely supply. **Derived output consumed by this mapping; the formula, its inputs and operators are owned exclusively by `SUPPLY_PLANNING_CALCULATION_RULES.md` §2C** — this spec neither restates nor re-derives it. Maps to DB `calculated_gap_qty`. |
| **Recommended Qty** | the actual system shipping recommendation **after source availability, carton rules, and route timing feasibility**. **Derived recommendation output; the formula, rounding mode, caps and carton behaviour are owned exclusively by `SUPPLY_PLANNING_CALCULATION_RULES.md` §2C** — not restated here. Maps to DB `recommended_qty`. |
| **Route** | recommended carrier / method / last-mile display (from the Route Recommendation Engine, `CARRIER_AND_ROUTE_SPEC.md`; placeholder `--` until wired). |
| **Reason** | compact explanation exposing: **Sales or Forecast** basis · **Platform or Overseas** stock basis · **Special Event** when applicable · stock/incoming shortage · timing constraint · route-selection reason. |

**REMOVED from the visible Recommendation Summary table (2026-07-22):** `Required By`, `Suggested Source`, `Expected Arrival`, `Coverage Status`, `Uncovered Qty`.
- **`Required By` remains a calculation/DB field** (`required_by_date` on the Draft line) — just hidden from the compact table.
- **Do NOT persist `Uncovered Qty`** (nor `Coverage Status`). A **`Remaining Gap`** may be derived at Runtime under the Execution Plan totals for display only; its definition (Calculated Gap net of committed Execution-Plan quantity, floored at zero) and operators are owned by **`SUPPLY_PLANNING_CALCULATION_RULES.md` §2C** — not restated as an equation here.
- Which engine fills the windows depends on the four modes (`SUPPLY_PLANNING_CALCULATION_RULES.md` §2B: Sales/Forecast × Platform/Overseas).
- **Total row shows only `Window=Total` + `Calculated Gap` + `Recommended Qty`** — Route/Reason blank.
- **Read-only / never submitted:** the Recommendation Summary alone never commits; **Submit Plan reads only the Execution Plan** (§11.4). Recommendation Summary and Execution Plan are **separate cards, stacked** (Recommendation Summary directly above Execution Plan — §11.5).

### 11.3 Execution Plan (bottom block, submitted)

A route list the PM builds. Canonical columns — **From / To / Qty / Method / Expected Arrival / Action** (`Expected Arrival` sits **immediately to the right of Method**):

| Column | Meaning |
|--------|---------|
| **From** | origin (`ship_from`). First version manual; future default from `replenishment_route_rules`, permission-lockable. |
| **To** | destination (`destination`). First version manual; future route-rule default. |
| **Qty** | route quantity (`planned_qty`; integer; full-carton multiple, §carton rule below). |
| **Method** | `shipping_method` (`Sea` / `Sea Express` / `Air` / `Courier`; future from `replenishment_route_rules`). |
| **Expected Arrival** | `expected_arrival` — projected arrival for the selected route/rate/lead-time (Route Recommendation Engine, `CARRIER_AND_ROUTE_SPEC.md`). **Recalculates when From / To / Method / planned ship date / the selected route/rate/lead-time record changes.** |
| **Action** | add / delete the route. |

- **`+ Add Route`** button adds a blank route.
- **Submit Plan** reads the Execution Plan **state** (see §11.4) and emits one Weekly Shipping Plan line per route: `company / country / marketplace / ship_from / destination / shipping_method / sku / requested_qty` + the frozen Decision Snapshot (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`). A route with **qty > 0 AND a shipping_method** is submittable; blank-method routes are ignored.
- **Carton gate (unchanged):** every submitted route qty must be an integer multiple of the SKU's `units_per_carton`; a missing UPC blocks Submit.
- **Factory-stock hint** is display-only (no deduction; no allocation engine).

### 11.4 Persistence rule (Recommendation Summary + Execution Plan)

- **Live analysis / calculation preview** may remain **non-persisted** (transient).
- The **scheduled / manual generated recommendation cycle persists** a `shipping_allocation_drafts` header + `_draft_lines` (canonical schema: `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6). **The persisted Draft is the SSOT** for the active cycle.
- **Recommendation Summary** displays the persisted **system snapshot** (`recommended_qty` / `calculated_gap_qty` / `recommended_*` / `recommendation_reason`) for the active Draft when one exists (read-only).
- **Execution Plan** edits persist into **`planned_qty`** + the selected route fields on the same Draft line.
- **`sessionStorage` is transient UI recovery ONLY** (`km_replen_alloc_draft_v1`) — **never the SSOT**; the DB Draft is authoritative.
- **Submit Plan reads ONLY the Execution Plan** (`planned_qty` + selected route fields) and creates `shipping_plans` / `shipping_plan_lines`; it never submits the Recommendation Summary and never reads the raw DOM.
- All persistence goes through **`KM.DB` / Apps Script handlers** (`createShippingPlansBatch` = Decision Commit). No direct DOM-to-DB writes.
- A line the PM never customized still carries `planned_qty = recommended_qty` (initialized at generation); the Recommendation Summary alone never commits.

### 11.5 Expanded-row layout (Analysis area + Decision area)

> The expanded row is organized as an **Analysis area** and a **Decision area**: **Recommendation Summary sits directly ABOVE Execution Plan** (stacked, same width), and **Monthly Achievement Rate sits directly below Sales Trend** (in the Analysis area).

**Analysis area (cards):** Stock · Long Term Storage · Forecast Breakdown · Upcoming Event · Sales Trend · **Monthly Achievement Rate directly below Sales Trend**.

**Decision area (stacked, in order):**
1. **Recommendation Summary** — read-only (§11.2, 5 columns).
2. **Execution Plan** — editable, the **only** source Submit Plan reads (§11.3/§11.4).

- **Recommendation Summary is directly above Execution Plan**, **same card width + alignment**, **vertically stacked**, but **remain logically and technically separate** (never merged into one table/state).
- Both reuse the detail-card styling (`.replen-card`: white bg, border, radius, padding, compact title/table).

**Recommendation Summary rendering:** columns **`Window` · `Calculated Gap` · `Recommended Qty` · `Route` · `Reason`** (title "Recommendation Summary"). `Reason` stays single-line, no ellipsis (`table-layout: auto` + `white-space: nowrap`, card wide enough). Header background `rgb(255, 248, 240)` (light warm), text `#1f2937` — this table only.

**Execution Plan rendering:** columns **`From` · `To` · `Qty` · `Method` · `Expected Arrival` · `Action`** (Expected Arrival immediately right of Method; Action = add/delete). `Expected Arrival` recalculates on change of From / To / Method / planned ship date / selected route-rate-lead-time record. `column-gap: 8px`; Method select, Expected Arrival, and the Action button never overlap and never touch the card edge (`min-width: 0` on all grid/flex items + inputs/selects).

**Overflow strategy (unchanged, shared with the main table):**
- **NO responsive reflow to a single column** — the expanded row extends past the viewport and is viewed via the **main table's horizontal scroll** (`.scroll-col`).
- **No expanded content overlaps the following SKU rows** — the container is sized by content height (no absolute/transform overlay collapsing the parent).
- Main table two-row header stays **sticky**; its column widths are unaffected by expanded content.
- **No nested scrollbars** anywhere in the expanded row (no inner `overflow-y`/`max-height`/`overflow-x`).
- **No content exceeds its card boundary.**

---

## 11.6 Sticky Header — KM Sticky Header Framework

The main 貨物庫存表 uses the reusable **KM Sticky Header Framework** (`assets/css/core/km-sticky-header.css` + `assets/js/core/sticky-header.js`; authoritative reference: [`UI_COMPONENT_GUIDELINES.md`](./UI_COMPONENT_GUIDELINES.md)). It replaces the previous hard-coded `top: 72px`.

**Rules (must hold):**
- The main table may use a **two-layer sticky header** (Header Row 1 = `Status / Company / Marketplace / Inventory / Sales / Replenishment / 工廠Stock / AI Action` group headers; Header Row 2 = `Current Stock / On the Way / 3rd Party Stock / Avg. Sales/day / …`).
- **Header Row 1 pins at `top = var(--km-sticky-top-base)`; Header Row 2 pins at `top = base + var(--km-sticky-row-1-height)`** (accumulated offset). The two rows **must not** share the same `top`. *(Implementation note: the Inventory main table stacks both rows inside ONE sticky bar `.table-header-bar` pinned at the base, so the accumulated-offset overlap is structurally impossible; the framework's independent `.km-sticky-row-1/2/3` classes exist for future tables that pin rows separately.)*
- **`--km-sticky-top-base` is NOT a magic number.** It equals the **live height of the sticky control panel** (`.replen-control-panel`), measured by `KM.stickyHeader.bindToolbar(#opsSection, .replen-control-panel)` on mount and on resize, and written as a CSS variable on `#opsSection`. This is what fixes the covered-header bug: the control panel is taller than 72px (and **wraps taller on small screens**), so a fixed offset let it cover Header Row 2. The fixed app header (`.top-header`) is **outside** the `.main-content` scroll container and does **not** count toward the base.
- **Z-index order (centralized variables, high → low):** control panel (`--km-sticky-z-toolbar`) > top-left corner (`--km-sticky-z-corner`) > Header Row 1 (`--km-sticky-z-header-1`) > Row 2 (`--km-sticky-z-header-2`) > left sticky column (`--km-sticky-z-col`) > table body / **expanded row** (unset). The **expanded row never covers the sticky header**; the **left sticky SKU column never conflicts** with the top headers.
- **No per-page magic `top` / `z-index` numbers.** All values come from the framework variables; row heights come from `--km-sticky-row-1-height` / `--km-sticky-row-2-height`.
- **Future Request Order / Purchase Order / Shipment / Warehouse Stock tables must reuse the same framework** — never re-hard-code offsets.

---

## 12. Days of Supply — UI color rule

| Days of Supply | Color | Meaning |
|----------------|-------|---------|
| **< 30** | 🔴 Red | low coverage — needs action |
| **30 – 150** | Normal | healthy coverage |
| **> 150** | 🟤 Khaki / Brown | long inventory warning (potential overstock) |

These are **UI display thresholds only**; the Days of Supply value is computed per §13 / the calculation engine.

---

## 13. First Layer Summary Mapping

Top-level per-SKU summary row (scope: selected Company + Country + Marketplace).

#### 13.0 Stock-quantity naming (three distinct concepts — must never be merged)

`Sellable Current Stock ≠ Qualified Incoming ≠ Inventory Position ≠ Draft/Unqualified Quantity`. The first-layer top cell **currently displays the label "Current Stock"** while showing `Available + FC Transfer + FC Processing`, which is an **Inventory Position** total, not the Engine's sellable input — a known label gap:

| Aspect | Value / status |
|--------|----------------|
| **Current Physical UI Label** | **`Current Stock`** — *Legacy / Misleading* (shows `Available + FC Transfer + FC Processing`, an Inventory Position sum) |
| **Target Canonical UI Label** | **`Inventory Position`** |
| **Engine Input Name** | **`Sellable Current Stock`** = currently sellable / available only (owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §8/§28) |
| **UI-label Migration Status** | **NOT Implemented / Unverified** — the screen still reads "Current Stock"; renaming to "Inventory Position" is a future UI change (no code change in Batch A) |

The Engine `Sellable Current Stock` must **NOT** include FC Transfer, FC Processing, Recommendation Draft, Shipment Draft, or unqualified On-the-way. FC Transfer / FC Processing / On-the-way may offset demand only as **Qualified Incoming** when they satisfy the qualification rules owned by `SUPPLY_PLANNING_CALCULATION_RULES.md` (per-table qualification direction **RESOLVED — B-4 CONTRACT RESOLVED, RUNTIME NOT IMPLEMENTED**; Qualified Incoming Runtime pending, `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-4). The Inventory Position display must never be fed to the Engine as sellable stock.

**Per-field tags** — `Engine Input?` = feeds the Engine's `Sellable Current Stock`; `Qual. Req?` = must pass Qualified-Incoming qualification before it can offset demand.

| Summary field | Definition / source | Engine Input? | Qual. Req? | Current / Target / Legacy |
|---------------|---------------------|:---:|:---:|---|
| **Inventory Position** *(screen label currently "Current Stock" — see §13.0)* | `Available + FC Transfer + FC Processing` (`amazon_inventory_snapshot`) — display total only | No | — | Current physical label = Legacy; Target label = Inventory Position |
| **Sellable Current Stock** *(Engine input — owner Calc Rules §8/§28; not a screen column)* | destination sellable/available only; excludes FC Transfer / FC Processing / Draft / unqualified On-the-way | Yes | No | Target canonical (Engine semantics) |
| **On The Way** | Shipping Shipment Total — **pending implementation** (§9); raw label only | No (unless qualified) | **Yes** | Current label; qualification direction = B-4 (contract resolved; Runtime/read-model pending) |
| **3rd Party Stock** | total **available stock** across eligible Overseas Warehouses (`overseas_inventory_snapshot.available_stock`, eligible warehouses only — see §16) | Yes (sellable overseas) | No | Current |
| **Avg Sales / Day** | **Primary:** `normalized_avg_sales_per_day` (latest 30 eligible normal days within a 90-completed-day source window, this SKU's event/promotion days excluded; divide by actual normal-day count); **Fallback:** `amazon_weekly_sales_snapshot.sales_units_7d ÷ 7`. **Rounded to 1 decimal.** Runtime result (not persisted); adopted source + warning frozen only at Submit Plan. Owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §22.2 / §22.6. | Yes (demand rate) | — | Current |
| **60 Days FC** | `Forecast Month+1 + Forecast Month+2` (**Target Rule already applied**, §7) | Yes (demand) | — | Current |
| **Upcoming Event** | Total Event FC (`fc_special_events`, §8) | Yes (demand) | — | Current |
| **Days of Supply** | `Inventory Position ÷ Avg Sales per Day` (the displayed top-cell total; UI color per §12). Engine coverage uses **Sellable Current Stock** + Qualified Incoming per the owner — the UI Days-of-Supply is not the Engine coverage. | No (display) | — | Current |
| **Suggested Qty** *(UI label)* | Canonical meaning = **Recommended Shipping Qty**, sourced from `shipping_allocation_draft_lines.recommended_qty`, derived per Formula Owner **§2C.1 / §31** (`Calculated Gap → eligible source availability → shipment carton FLOOR`). **NOT** raw Engine A Shortage (§14/§15), **NOT** Request Order Suggested Order Qty. *(UI column still labelled "Suggested Qty". The §2C.1/§31/§40 Calculation **Pure** Runtime is TEST-VERIFIED (Round 11A, 39/1/0 Golden), but the production recommendation **writer** that would populate `shipping_allocation_draft_lines.recommended_qty` from it — and the live DB / UI integration — remain **NOT IMPLEMENTED / PENDING**; test-verified pure runtime and UI/display mapping do NOT prove production DB integration.)* | No (recommendation) | — | Current label; Target = Recommended Shipping Qty |
| **Factory CN** | `factory_stock.fac_current_stock` where the warehouse resolves to a **CN** factory (`warehouses.country = CN`, `is_factory_warehouse = TRUE`) | Yes (source pool) | No | Current |
| **Factory TW** | `factory_stock.fac_current_stock` where the warehouse resolves to a **TW** factory (`warehouses.country = TW`, `is_factory_warehouse = TRUE`) | Yes (source pool) | No | Current |

> `factory_stock` has no `company` / `factory_name`; CN/TW factory is resolved via `warehouse_id → warehouses` (per `SHIPMENT_CENTER_SPEC.md` §0). Factory stock is **physical, shared** stock (display only; not deducted here).

---

## 14. Sales Driven Calculation (replaces old algorithm)

> **Direction / intent — final math owned by `SUPPLY_PLANNING_CALCULATION_RULES.md`.**

**Need is cumulative across time buckets:** `0–18`, `19–30`, `31–45`, `46–90`. Each bucket calculates **only incremental demand** for its window.

### 14.1 Count-once / deduct-once rules (must hold)

- **Upcoming Events:** each event may be counted **once only** — never double-count. An event is attributed to the single Need bucket whose window contains its **Preparation Date = Event Start Date − 30 days** (see §8.1), not its event date.
- **On-the-Way shipments:** only the **qualifying** portion (Qualified Incoming per the active owner — see the §14.2 On-the-Way boundary) is **deducted** from Need, and a given shipment quantity **can only be deducted once** — never double-deduct. Earlier-arriving qualifying shipments offset the earliest unmet demand first (FIFO by ETA bucket).

### 14.2 Canonical term set (direction / mapping summary — no formula here)

The Sales-Driven Need this page consumes and displays uses the owner's **complete** canonical term set — none of the following may be dropped or simplified here:

- **Demand side:** incremental base sales demand per bucket **+ Special Event Demand** (owner §10 — 100%, counted once).
- **Supply offsets:** **Current Stock** − **Qualified Incoming** − **Approved / Committed Supply** (all three required; never omit Approved / Committed Supply).

Buckets are the **non-overlapping exact-date windows** `0–18 / 19–30 / 31–45 / 46–90`; events are attributed to the single bucket whose window contains the event **Preparation Date = Event Start Date − 30 days** (§8.1) and counted **once**; qualifying incoming is deducted **once** (FIFO by ETA). Nothing is counted or deducted twice.

**UI-label boundaries (must hold):**
- **On-the-Way** is a **UI / mapping label only**. It must **not** be treated as **Qualified Incoming** unless it satisfies the qualification, timing, status, and commitment rules owned by the active `SUPPLY_PLANNING_CALCULATION_RULES.md` (the current canonical formula SSOT). Only the qualifying portion offsets Need — the raw On-the-Way total is never assumed to equal Qualified Incoming.
- **Upcoming Event** is the **UI presentation of Special Event Demand** (a demand term) and does **not** define a separate calculation formula. It is **never** treated as supply.

The engine output is the **Engine A live Demand / Shortage / Remaining Need** — a planning signal, **not** Suggested Order Qty (that exists only after Engine B reallocation → `Net Order Need`, owner §20 / §31).

### 14.3 Formula ownership

> **This document is a UI / data-mapping consumer only.** **Current Stock, Qualified Incoming, Approved / Committed Supply, Special Event Demand, timing eligibility, shortage, reallocation, and Net Order Need are governed exclusively by the active `SUPPLY_PLANNING_CALCULATION_RULES.md`** (the current canonical formula SSOT; §2C / §2D / §20 / §26 / §29E / §29F / §29G / §31). **Qualified Incoming status (B-4):** the business predicate + per-table qualification direction + external-origin admission gate are **RESOLVED (B-4 CONTRACT RESOLVED — RUNTIME NOT IMPLEMENTED, 2026-08-01; `SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-4)** — but the **Qualified Incoming Runtime + On-the-Way read model (§22) remain open**, and the `wh_on_the_way_qty` ↔ Shipment-derived incoming reconciliation is an **OPEN DEPENDENCY** (§21). This document is not blocked by a wholly-undecided allowlist; it is a display/mapping consumer only. This section owns no formula, adds **no** simplified shortage equation, does not restore any prior v4.0 formula, and never reverses ownership onto Inventory §14/§15; any quantity displayed here maps to the owner output.

---

## 15. Forecast Driven Calculation (finalized)

> **Direction / intent only — this section does not own the formula. Final math owned by the active `SUPPLY_PLANNING_CALCULATION_RULES.md`** (the current canonical formula SSOT; §29F Forecast-Driven, §29G 30-Day Safety Demand, §8/§28 Current Stock). Safety Days = **30**.

**Term set (semantic mapping only — no formula here).** The Forecast-Driven demand result combines, on the demand side: **Target-Adjusted Regular FC** (Month+1 + Month+2, with the Target Rule SKU > Series > Category already applied, §7), **30-Day Safety Demand** (owner §29G), and **Special Event Demand** (100%, owner §10 — must not be omitted). It is netted against the supply offsets: **Current Stock**, **Qualified Incoming**, and **Approved / Committed Supply** (must not be omitted). Floored at 0.

> **Formula ownership — canonical `SUPPLY_PLANNING_CALCULATION_RULES.md` §2D** (the active SSOT; with §29F Forecast-Driven, §29G 30-Day Safety Demand). **This section owns no executable formula**; it lists the term mapping only. Neither the demand-side terms nor the supply offsets may be dropped, but the authoritative equation lives only in the owner.

> **Live vs Persisted (canonical, owner §36).** Every Demand / Shortage figure the Inventory Replenishment page shows — including the forecast-breakdown windows and any T1–T4 tier view — is a **LIVE, continuously-recalculated planning signal** (danger notification / shortage risk / planner review / emergency-order entry). It is **NOT** a saved order and **must NOT overwrite** a persisted monthly/emergency Suggested Order snapshot (`recommended_qty`) or the user's `order_qty` / `carton_qty`. Re-displaying the live value never auto-reverts a user edit. **T4 (Month+4) is visibility-only** — shown for risk/planning, never turned into an order commitment (owner §27 / §36).

Where:
- **Forecast Month+1 / Month+2** = target-adjusted regular forecast for the next two months.
- **Safety Stock** = 30 days of demand (Safety Days = 30).
- **Current Stock** = on-hand sellable for the scope (per the engine spec).
- **Qualified On-the-Way** = incoming shipment qty that qualifies for the coverage window.

---

## 16. Overseas Shared Inventory Allocation (UI / data-mapping summary)

This chapter is a **UI / data-mapping summary and consumer**. The authoritative overseas allocation formula is owned **exclusively** by `SUPPLY_PLANNING_CALCULATION_RULES.md` §20; this section only maps / displays that owner output and does not own or generate the rule.

**Rule 1 — Allocation Scope.** Allocate inventory **only within the same Company and same Country**. **Never** allocate across companies or across countries.

**Rule 2 — Platform Fulfilled (CANONICAL, 2026-07-22 addendum; owner = the active `SUPPLY_PLANNING_CALCULATION_RULES.md`).** Platform FBA **Current Stock is a separate bucket** and is **never merged/added into 3PL Current Stock** (separate lineages). **However, a platform-fulfilled marketplace MAY still participate in the shared 3PL replenishment RESERVE** where warehouse-side eligibility holds (`company + country + warehouse_type='3PL' + is_active`); that reserve is shown as `3PL Replenishment Reserve` and can later replenish FBA — it is never displayed as FBA Current Stock. *(Supersedes the earlier "No shared allocation" wording.)* Authoritative formula: `SUPPLY_PLANNING_CALCULATION_RULES.md` §23.6/§24.9 (the active canonical formula SSOT).

> **FBA inventory source precedence (canonical 2026-07-20; `SUPPLY_PLANNING_CALCULATION_RULES.md` §24.2).** **Mode 1 — Platform Snapshot (preferred):** FBA Current Stock = latest valid `amazon_inventory_snapshot` value (the platform SSOT), at the existing grain `company + country/site + marketplace + SKU`. **Do NOT subtract Sales Report quantities again from an imported snapshot** (double-deduct). **Mode 2 — Estimated Ledger (fallback only, when no current snapshot):** opening confirmed stock ± confirmed inbound/returns/adjustments − sales/removals/disposals/loss-damage; label the result **"Estimated Inventory"**; a newer snapshot replaces/reconciles it; never apply both modes to the same interval. Missing adjustment sources → verified-only + stale warning, no fabrication → **Runtime Mapping Required.** FBA is **never** virtually redistributed into the shared FBM pool and Warehouse Reference rows never infer FBA quantity.

**Rule 3 — Self Fulfilled.** Uses **shared overseas inventory**; allocation is **required**.

**Rule 4 — Hybrid.** Display **Platform Inventory** and **3rd Party Inventory** — **both sections remain visible**. The **Marketplace SKU's fulfillment model decides** the final fulfillment behavior.

**Rule 5 — Minimum Survival Stock = 18 Days (highest priority).** Every eligible Self-Fulfilled site must **first** receive enough inventory to **survive 18 days**. Only the **remaining** inventory continues to further allocation.

**Rule 6 — Allocation Priority.** After all sites reach the 18-day survival stock, remaining inventory is allocated by **`marketplaces.allocation_priority`** — **higher number = higher priority**. Editable by PM.

**Rule 7 — Future Shared Allocation.** `allocation_priority` becomes the **system-wide shared allocation rule**; future **Factory Allocation**, **Shipping Allocation**, and **Carrier Capacity** may reuse this same priority.

---

## 17. Marketplace Fulfillment Model & UI Flow

### 17.1 Fulfillment model values

`platform_fulfilled` · `self_fulfilled` · `hybrid` (stored on `marketplaces.fulfillment_model`; SKU-level override on `marketplace_skus.fulfillment_model`).

### 17.2 Add Marketplace

- Must choose a **Fulfillment Model**: `platform_fulfilled` / `self_fulfilled` / `hybrid`.

### 17.3 Add SKU

- If the marketplace is **Platform** → the SKU Fulfillment Model field is **locked** (to `platform_fulfilled`).
- If the marketplace is **Self** → the SKU Fulfillment Model field is **locked** (to `self_fulfilled`).
- If the marketplace is **Hybrid** → the **PM must select** the SKU Fulfillment Model.

### 17.3A Add SKU / Add Marketplace SKU ↔ `sku_regional_details` + Tax source (planned — `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` v2.0 §6)

**SKU Domain v2.0:** `sku_regional_details` is the **higher-level source**; `marketplace_skus` is the **operational synchronized copy**. Match grain for the pair: **`sku + company + country + marketplace`**.

- **Two creation flows:**
  - **Flow A** — Add Marketplace SKU → creates `marketplace_skus` → **ensure/update** the matching `sku_regional_details` row (copy `sku` / `company` / `country` / `marketplace` / `site_sku` / `marketplace_product_id` / **`product_url`**; compliance-document fields blank and never overwritten).
  - **Flow B** — Regional Details created first → later, when `marketplace_skus` is created it **copies `site_sku` / `marketplace_product_id` FROM `sku_regional_details`**.

#### 17.3A.1 Baseline triggers — TWO DISTINCT triggers (CANONICAL — 2026-07-20 v2, authoritative here)

**These are two separate baselines with two separate triggers. Neither is triggered by Master SKU creation, and Factory Stock is NOT triggered by Marketplace SKU creation** (both prior statements are **superseded**).

**(a) Factory Stock baseline — trigger = lifecycle transition into `Running in the Market`.**
```
Create sku_details                                   → NO factory_stock mutation
Save edits without entering Running in the Market    → NO factory_stock mutation
sku_details.lifecycle: non-running → "Running in the Market"
  → ensure factory_stock baseline (eligible Factory Warehouses)
  → idempotent by warehouse_id + MASTER sku   (never site_sku / company / country / marketplace)
  → fac_current_stock = 0 ; fac_reserved_stock = 0 (where the schema/default supports it)
```
- Exact stored value from `VALID_LIFECYCLES_` = `['Upcoming SKU','Running in the Market','Phasing Out','Closure','Other']` (do not invent a second value).
- **Keyed by `warehouse_id + Master sku`** — never `site_sku`/company/country/marketplace. Editing a SKU already Running must not reset stock; leaving Running must not delete stock/history; returning to Running repeats only the idempotent ensure.
- **Display join:** `marketplace_skus` filtered by `company + country + marketplace` → DISTINCT **Master sku** → join `sku_details` → join `factory_stock` **by Master sku**. **Never join Factory Stock by `site_sku`.**
- **Eligible Factory Warehouse rule:** OPEN MAPPING (a default preferred factory `WH-TW-CN-FACTORY-YOUXIN` exists; no canonical "for-these-warehouses" set). Do not invent it.

**(b) Overseas Inventory baseline/context — trigger = successful Marketplace SKU add to the Inventory/Replenishment scope.**
```
Add Marketplace SKU (into planning scope)
  → ensure the relevant Overseas Inventory baseline/context
  → physical overseas grain = company + warehouse_id + MASTER sku
  → company / country / marketplace preserved as planning-DEMAND context (not physical grain)
```
- **Marketplace is NOT part of the physical shared-3PL stock grain.** Shared self-fulfilled marketplaces (Shopify / Target / Walmart / Wayfair / …) may **share one physical warehouse inventory**; adding multiple Marketplace SKUs for one Master SKU must **not** create multiple copies of the same physical 3PL inventory (see §17.3A.2).
- **Amazon FBA / `platform_fulfilled`** inventory stays a **separate bucket** (never merged into 3PL Current Stock); marketplace-level participation in the shared 3PL **reserve** is a separate, warehouse-side eligibility question — see §16 Rule 2 and `SUPPLY_PLANNING_CALCULATION_RULES.md` §23.6 (the active canonical formula SSOT).
- `overseas_inventory_snapshot` / `_movements` are keyed by `warehouse_id + sku` (Master sku); `company`/`country` resolved via `warehouses` at read time — not stored on the rows.

**Runtime status (updated 2026-07-21):**
- **(a) Factory Stock baseline on lifecycle → `Running in the Market`: IMPLEMENTED IN SOURCE (Apps Script — pending redeploy + live verification).** `handleUpsertSkuDetail_` now captures previous lifecycle, and on a non-running → Running transition calls `ensureFactoryStockBaseline_` (`03_master_data_handlers.gs`): eligibility `is_active ∧ is_factory_warehouse`, idempotent by `warehouse_id + Master sku`, `fac_current_stock=0`/`fac_reserved_stock=0` where the column exists, **fail-closed to `db_mapping_gap`** if the `warehouses`/`factory_stock` sheet or columns are absent (never invents). Logic unit-tested (5 cases). Requires redeploy + a live `factory_stock` sheet with the documented columns.
- **(b) Overseas Inventory baseline on Marketplace-SKU add: NOT IMPLEMENTED / Runtime Mapping Required** — the ensure-write flow is not yet designed.
Cross-refs: [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md) §6.1, [`SKU_DETAILS_ADD_EDIT_SPEC.md`](./SKU_DETAILS_ADD_EDIT_SPEC.md) §15/§23.
- **Add SKU required fields (2026-07):** the Add SKU modal requires **ASIN** (UI label → `marketplace_skus.marketplace_product_id`, also synced into `sku_regional_details.marketplace_product_id`) and **Product URL** (→ `sku_regional_details.product_url`). Validation: `product_url` trimmed + `http(s)://` (no fixed domain); `marketplace_product_id` trimmed, case-preserved, no fixed length. `site_sku` stays required. No separate `asin` column is created.
- **Sync (both ways, no silent divergence):** editing `site_sku` / `marketplace_product_id` in Inventory Replenishment updates the paired `sku_regional_details` row, and vice-versa. `product_url` syncs operational → regional (regional-only; not propagated to `marketplace_skus`). **`sku_regional_details` is the higher-priority source** on conflict; save surfaces a warning / repair-sync.
- **`asin → marketplace_product_id`:** the operational platform id column on `marketplace_skus` is **`marketplace_product_id`** (platform-neutral); Amazon's ASIN is stored there (UI may label it "ASIN"). Legacy `asin` is read-fallback only during migration.
- **Tax / Duty source (REPLACES duty synchronization):** there is **NO duty/HS-code/declared-value sync into `sku_regional_details` or `marketplace_skus`**. **Tax information (HS Code / Duty / VAT / Referral / Declared Value) comes from `tax_referral_rates` through `series`** (`sku_details.series → tax_referral_rates.series`, filtered by `duty_country` + effective date) — see [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md). Those values are **never copied** onto SKU / regional / marketplace rows.
- **Spec only — not implemented; no DB migration yet.**

### 17.4 Inventory UI behavior

- **Platform** → display the Platform Inventory layout.
- **Self** → hide the Platform Stock Card; **3rd Party Inventory becomes the primary inventory**.
- **Hybrid** → display **both** Platform and 3rd Party inventory.

---

## 18. Mixed Carton — future extension

- The DB now contains **`mixed_carton_rules`** (newly added table).
- **Current version: Future Extension only — NO implementation.** No mapping / formula / write path / UI is defined here.

---

## 19. DB / Runtime impact

- **No DB schema change, no frontend, no Apps Script, no BigQuery, no API** is implemented by this spec task.
- **Newest DB structures referenced** (synced in `DATABASE_RELATIONSHIP_MAP.md`): `marketplaces.fulfillment_model`, `marketplaces.allocation_priority`, `marketplace_skus.fulfillment_model`, `overseas_inventory_snapshot` (physical/available/reserved/damaged/on_the_way_*), `overseas_inventory_movements` (movement_scope + before/after per stock type), `mixed_carton_rules`.
- **Existing fields/tables referenced:** `amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_daily_sales_snapshot`, `amazon_weekly_sales_snapshot`, `fc_regular_forecast`, `fc_target_rules`, `fc_special_events`, `warehouses`, `factory_stock`.

---

## 20. Monthly Sales Summary — future design note

- **Preferred source:** a future BigQuery table **`AmazonSales.amazon_monthly_sales_summary`**, generated from `Raw Daily Sales` by a scheduled query.
- Deferred because Amazon data may be delayed / corrected / backfilled. A future spec must define: monthly close date, refresh window, prior-month recalculation, append-vs-MERGE, and whether a Google Sheet snapshot is needed for frontend speed.
- **Achievement Rate (§10) depends on this.**

---

## 21. Open Questions

**Calculation-semantic questions are CLOSED (owner = the active `SUPPLY_PLANNING_CALCULATION_RULES.md`).** The items below are **Specification: FINALIZED**; where the runtime engine is not yet built, `Runtime Mapping: NOT IMPLEMENTED` (never reopened as an Open Question):

| Former Open Question | Resolution (owner section) | Runtime |
|----------------------|----------------------------|---------|
| Demand run-rate window (§14) | Latest **30 eligible normal days within the latest 90 completed days** — §22.2 | NOT IMPLEMENTED |
| Event-to-bucket attribution (§8, §14) | Preparation Date = Event Start − 30d; count-once — §10 / §29 | NOT IMPLEMENTED |
| Forecast-Driven Current Stock (§15) | Destination sellable stock; Factory Stock is source-side — §8 / §28 | NOT IMPLEMENTED |
| Eligible Overseas Warehouses (§13, §16) | Warehouse-side eligibility `company + country + warehouse_type='3PL' + is_active` — §23.6 / §24.9 | NOT IMPLEMENTED |
| Allocation rounding (§16) | Deterministic largest-remainder — §24.5–§24.7 / §31 / §34 | NOT IMPLEMENTED |

**Remaining (non-calculation / data-mapping) items — genuinely open, do not affect a frozen formula:**
- **Inventory-health finer buckets (§5):** confirm `inv_age_366_to_455_days` / `inv_age_456_plus_days` are added to the Amazon Inventory Health source + import mapping to feed the Over 180+ display.
- **Shipping Shipment / On-the-Way (§9, §13) — OPEN DEPENDENCY (B-4 contract repair, 2026-08-01):** warehouse-side `overseas_inventory_snapshot.wh_on_the_way_qty` and Shipment-derived incoming (`shipments` + `shipment_lines.shipment_qty`) are **two representations of the same physical incoming** and **must NOT be added blindly**. Before the Recommendation / Qualified-Incoming Runtime can be production-ready, **exactly one canonical owner must be selected for each physical incoming quantity** (count-once, `SUPPLY_PLANNING_CALCULATION_RULES.md` §30). Status: **OPEN DEPENDENCY** — owner = future **Supply Ledger / Inventory Mapping implementation**; **required before Golden #12/#13/#14 Runtime promotion**; **NOT resolved by this documentation round** (this round does not decide whether `wh_on_the_way_qty` is removed or derived). This mapping is **UI/display only** and is never the qualification predicate (owned by §2E).
- **Monthly close / recalculation cadence (§10, §20).**

---

## 22. On-the-Way + External-Quarantine Read Model (CANONICAL 2026-08-01 Round 4D-C — display mapping only; Runtime NOT implemented; NO UI built)

> Owns the Inventory Replenishment **On-the-Way** display + the external exception/reconciliation panel mapping. Calculation contribution is owned by `SUPPLY_PLANNING_CALCULATION_RULES.md` §2E / §38; this section maps **display**, never the qualification predicate. **No frontend / calculation-engine / UI is built in this round.**

**22.1 First-layer "On the Way"** shows **only the canonical, deduplicated, planning-eligible Incoming** (post §38 admission + §2E qualification + §30 count-once). A visible external quantity **does not** imply a calculation contribution.

**22.2 Expanded detail rows** (display-only unless admitted): KM Shipment Incoming · Linked External Evidence · Unlinked External Quarantined · Adoption Pending · Needs Reconciliation · Fresh External Not Admitted · Stale External · Quantity Mismatch · ETA Mismatch · Missing Identity · Missing Warehouse Mapping · Missing SKU Mapping · Rejected External · Ignored for Planning · external reference · last sync · responsible person · open age.

**22.3 Rules:**
- visible external quantity **≠** calculation contribution;
- **quarantined quantity always contributes 0** (fresh or stale);
- **no automatic fresh fallback** — admission requires an explicit human Adopt (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §12);
- `overseas_inventory_snapshot.wh_on_the_way_qty` may be **visible / a reconciliation input** but is **NOT** the canonical On-the-Way total and is never blindly added to Shipment-derived incoming (count-once, `SUPPLY_PLANNING_CALCULATION_RULES.md` §30; the §9 / §13 / §21 OPEN DEPENDENCY);
- the UI Inventory Position (Available + FC Transfer + FC Processing, §13.0) differs from the Engine sellable Current Stock — external evidence is **not** canonical stock.

---

**v1.6.0 — Inventory Table Mapping finalized. Mapping + rule direction only; no frontend, calculation-engine code, Apps Script, BigQuery, API, or DB change is implied. All formulas remain owned by `SUPPLY_PLANNING_CALCULATION_RULES.md` the active canonical formula SSOT.**

**End of Document**
