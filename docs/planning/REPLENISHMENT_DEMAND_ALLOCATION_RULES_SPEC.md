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

> **STORAGE OWNER (F1-7N-D-2k-R1):** these rows are **NOT** a user-managed Google Sheet tab. They persist in the
> `KM_WAREHOUSE_ALLOCATION_CONFIG` Script-Property JSON blob (owner `50_api_v1_warehouse_allocation_config.gs`),
> edited via **Site Inventory → More Options → Warehouse Allocation**, and are **materialized on read** into the
> rule-row shape below (`warehouseAllocationConfigToRuleRows_`). The blob holds only current-active membership per
> scope (`{company,country,marketplace} → warehouses[]`); `status` is always `active`, `effective_*` open, and
> `version`/`note` are not stored (deactivation = removal from the blob). The RULE MODEL and validation are unchanged —
> the engine still consumes the columns below. Backend + scheduled automation read the SAME blob (no browser session);
> the server planning path (42_) overrides the `replenishmentDemandAllocationRules` snapshot with this config at its
> single read boundary, so there is exactly ONE planning authority.

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

## 5. Provisioning (F1-7N-D-2k-R1 — via the UI; NO Sheet tab)

Provision from **Site Inventory → More Options → Warehouse Allocation** (no manual spreadsheet maintenance). Select a
`self_fulfilled` scope `(company, country, marketplace)` (or the self lane of a `hybrid` marketplace), check its self
warehouses, and enter Forecast/Sales % (each must sum to 100%; a single warehouse auto-fills and persists an explicit
`1.0/1.0`). Save writes the `KM_WAREHOUSE_ALLOCATION_CONFIG` Script-Property blob (router action
`replenishmentDemandAllocation.save` → `handleReplenishmentDemandAllocationSave_`). Do **NOT** configure
`platform_fulfilled` marketplaces (e.g. Amazon, Newegg) — they resolve to the logical MARKETPLACE destination and
physical FBA FC assignment is deferred to shipment execution (see §3a). Execution/source FCs (FBA/RETURN/FACTORY) are
rejected by the writer and excluded from the picker. No auto-repair, no runtime table creation.

> **HISTORICAL (superseded):** F1-4B-E originally required a manually-created `replenishment_demand_allocation_rules`
> Sheet tab and a cache getter `window.KM.DB.getReplenishmentDemandAllocationRules()`. Since D-2k the SSOT is the
> Script-Property blob; the modal hydrates via `getWarehouseAllocationConfig(scope)` (router `warehouseAllocation.get`
> → `handleWarehouseAllocationConfigGet_`), and the pure integration adapter
> `KM.demandAllocation.resolveScopeWarehouseDemandFacts(...)` / `validateAllocationRules(...)` consume the
> config-materialized rows unchanged (rule MODEL preserved). The cache getter and the never-created Sheet tab are inert.

**Sync/deployment (D-2k):** `APPS_SCRIPT_SYNC_REQUIRED = true` (new `50_`, plus `03_`/`01_`/`42_`); `NEW_EXEC_REQUIRED
= true`; `FRONTEND_DEPLOY_REQUIRED = true`; `BUNDLE_REBUILD_REQUIRED = false` (no bundled core changed).

## 6. Not this round

No UI, Submit, Shipment, persistence of recommendation results, gap/recommendedQty computation, Coverage/DOS,
cross-warehouse transfer (Phase-2, separately frozen), or wiring into KMPCX/KMAF/KMPA/KMPS (unchanged frozen owners).
