# `replenishment_demand_allocation_rules` — Phase-1 Multi-Warehouse Demand Allocation Config (F1-4B-E0R)

> **Status: SPEC + PROVISIONING ARTIFACT (2026-08-06). Table NOT created by runtime.** This is the smallest
> authorized Phase-1 configuration authority for decision **D-F1-4B-E0R-2/3**: an explicit, canonical, per-warehouse
> demand-allocation ratio. The pure runtime (`assets/js/core/supply-planning-demand-allocation.js`) READS + VALIDATES
> injected rows; it never creates/repairs/mutates the table. Provisioning is **user/editor-owned** (below). Until the
> table exists and is wired by a later slice, multi-warehouse allocation stays dormant (no guess, no default ratio).

## 1. Why this exists (authority audit result)

The current Google-Sheet operational process allocates KM/US/Amazon Forecast + Sales ≈ **30% / 70%** across two
overseas warehouses because real orders distribute on roughly that basis. That ratio is **`SOURCE_MISSING` in the
repository / DB** — it lives only in manual Sheet formulas (`SOURCE_PROVEN_MANUAL_SHEET_ONLY` as a business practice,
**not** runtime-authoritative). The canonical Forecast (`fc_regular_forecast`), Sales
(`amazon_weekly/daily_sales_snapshot`) and Special-Event (`fc_special_events`) sources are **marketplace-level (no
`warehouse_id`)**, while Current Stock (`overseas_inventory_snapshot.warehouse_id`) and Qualified Incoming
(`shipments.destination_warehouse_id`) are **warehouse-level (separable)**. So marketplace demand must be split to
warehouses by an explicit configured ratio — this table is that single canonical authority.

## 2. Canonical table

| Column | Type | Notes |
|---|---|---|
| `allocation_rule_id` | string (PK) | Stable id: `RDAR-{COMPANY}-{COUNTRY}-{MARKETPLACE}-{WAREHOUSE_ID}` (+ suffix for a distinct effective period). **Never UUID / row index.** |
| `company` | string | scope |
| `country` | string | scope |
| `marketplace` | string | scope (channel) |
| `destination_warehouse_id` | string | **canonical `warehouses.warehouse_id`** (never display name / array position) |
| `forecast_allocation_ratio` | number | decimal fraction in **[0,1]** (e.g. `0.30`) |
| `sales_allocation_ratio` | number | decimal fraction in **[0,1]** (e.g. `0.30`) |
| `status` | string | `active` (blank/other ⇒ excluded — no silent default) |
| `effective_from` | string | `YYYY-MM-DD` (inclusive; blank = open) |
| `effective_to` | string | `YYYY-MM-DD` (inclusive; blank = open) |
| `version` | string | optimistic/audit |
| `updated_by` | string | audit |
| `updated_at` | string | audit |
| `note` | string | free text |

**Grain (unique active key):** `company + country + marketplace + destination_warehouse_id + effective period`.
No field is added without source-proven necessity.

## 3. Validation (integer basis points; enforced by `validateAllocationRules`)

For one active scope + effective period: every destination is a canonical **active, same-company** `warehouse_id`;
each ratio is numeric in `[0,1]`; **active ratios sum to exactly 100%** (converted to integer basis points,
`0.30 → 3000`, total must equal `10000` — no float drift); no duplicate active destination; no ambiguously
overlapping effective periods; ≥1 active destination. Errors:
`DEMAND_ALLOCATION_RULE_NOT_CONFIGURED` / `DEMAND_ALLOCATION_RATIO_INVALID` / `DEMAND_ALLOCATION_RATIO_TOTAL_INVALID`
/ `DEMAND_ALLOCATION_DESTINATION_CONFLICT` / `DEMAND_ALLOCATION_PERIOD_CONFLICT` / `DESTINATION_WAREHOUSE_INVALID`.
A missing/invalid ratio **never** becomes 50/50 or 100/0.

### 3a. Planning-destination membership authority (F1-7N-D-2i-R1) — rules ARE the membership authority

These rows are the **sole** authority for which warehouses are self_fulfilled **planning / replenishment** destinations.
`recoWsExpandWarehouse_` (42) plans ONLY to the warehouses named by active rows for the scope (`ruleset.warehouses`
from `validateAllocationRules`); it never enumerates the `warehouses` table to invent destinations. A warehouse's mere
presence in `warehouses` — even `active + same-company + non-factory` — does **NOT** make it a planning destination.

The `warehouses` table intentionally also holds physical marketplace / FBA receiving FCs (e.g. `WH-KM-US-FBA-ONT8`,
`WH-KM-US-FBA-ABE2`, `WH-KM-US-FBA-AMAZON`) retained **only** for **Shipment Draft / shipment-execution** selection.
These are NOT self_fulfilled planning destinations and MUST NOT be inferred as candidates from
`active && same-company && non-factory`. Weekly AI Plan therefore recommends a logical destination (`CN → Amazon`),
never a physical FC grain (`CN → Amazon ONT8`) — physical FC assignment is deferred to shipment execution.

`platform_fulfilled` marketplaces resolve to the logical **MARKETPLACE** destination and require **NO** rows here.
Only the `self_fulfilled` lane (incl. the self_fulfilled SKUs of a `hybrid` marketplace, per D-F1-7N-D-2h) uses this
table. Absence of a rule for a self lane fail-closes (`DEMAND_ALLOCATION_RULE_NOT_CONFIGURED`) — never a default.

## 4. Deterministic integer allocation (reuses the FROZEN largest-remainder policy)

`allocateByBasisPoints(qty, weights)` splits an integer marketplace demand by the validated basis points using the
project's **frozen deterministic largest-remainder** method (§24.7 `supply-planning-allocations.js`; IRMap
`_allocateShared` fractional-remainder + stable-key tie-break) — **not a newly invented rounding policy**. It
conserves the total EXACTLY (`Forecast 1,001 @ 30/70 → 300 / 701`, sum `1,001`; leftover unit → largest fractional
remainder, tie-break ascending `warehouse_id`). Forecast and Sales use the same mechanism. A warehouse-level source is
**passed through unchanged** (never re-split).

## 5. Provisioning (user/editor-owned — runtime never creates/repairs)

1. In the Operation Database spreadsheet (exact Spreadsheet-ID only), add a sheet named
   `replenishment_demand_allocation_rules` with the header row in §2 (exact column names).
2. Seed rows ONLY for `self_fulfilled` scopes (and the self_fulfilled SKUs of a `hybrid` marketplace). Example for a
   self_fulfilled marketplace split across two overseas warehouses: `RDAR-KM-US-SHOPIFY-{WH_A}` = `0.30`,
   `RDAR-KM-US-SHOPIFY-{WH_B}` = `0.70` (resolve `{WH_A}`/`{WH_B}` to the **canonical `warehouse_id`s**, never names;
   ratios are user-owned business config and must sum to `1.00`; a single-warehouse scope takes an explicit `1.00` row).
   Do **NOT** seed rows for `platform_fulfilled` marketplaces (e.g. Amazon, Newegg) — they resolve to the logical
   MARKETPLACE destination and physical FBA FC assignment is deferred to shipment execution (see §3a).
3. No auto-repair, no data deletion, no runtime table creation.

**Reader (F1-4B-E — implemented):** `window.KM.DB.getReplenishmentDemandAllocationRules()` is a targeted, read-only
getter over the already-loaded cache (`operation-system-db-api.js`) — never a whole-DB load, never a fetch, never a
sheet mutation. It returns normalized rows, or `[]` when the cache is unloaded or the tab is absent (→ downstream
`DEMAND_ALLOCATION_RULE_NOT_CONFIGURED`, never a default). The pure integration adapter
`KM.demandAllocation.resolveScopeWarehouseDemandFacts(...)` consumes those rows to produce per-warehouse demand facts
(Warehouse Forecast) that the EXISTING recommendation runtime (KMPCX/KMAF/KMPS) consumes unchanged.

**Sync/deployment:** F1-4B-E adds NO Apps Script handler / router / bundle change — the table remains a **manual DB
setup prerequisite** (user-owned). `APPS_SCRIPT_SYNC_REQUIRED = false`; `BUNDLE_REBUILD_REQUIRED = false`.

## 6. Not this round

No UI, Submit, Shipment, persistence of recommendation results, gap/recommendedQty computation, Coverage/DOS,
cross-warehouse transfer (Phase-2, separately frozen), or wiring into KMPCX/KMAF/KMPA/KMPS (unchanged frozen owners).
