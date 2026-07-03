# Carrier & Route Foundation Spec

**Status:** 🟡 Draft v1.2 — Foundation DB definition only (Spec only — NO code, NO frontend, NO Apps Script, NO DB migration yet, NO BigQuery, NO pricing engine)
**Last Updated:** 2026-07-01
**Maintained By:** Development Team
**Authority / context (read, not overridden):** [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md).

> **Purpose.** This document defines the **foundation tables** for Carrier master data, Carrier rate cards (price + validity), and Shipping Route rules (default `ship_from` / `destination` / `route_code`). It is a **schema/relationship definition only**. It introduces **NO** Carrier Price Engine, **NO** calculation logic, **NO** code, frontend, Apps Script, API, DB migration, or BigQuery change. Until the future **Carrier Price Engine** is built, the Weekly Shipping Plan **Cost Breakdown remains a placeholder** (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §11).

> **Changelog:**
> - **Draft v1.2 (2026-07-01)** — **Carrier rate-card schema expansion (still no engine).** `carriers.carrier_type` enum → `forwarder / courier / trucker / warehouse_partner / customs_broker / other` (§3). `carrier_rate_cards` (§4) rewritten to the authoritative import schema: added `destination_postal_code_start/end`, `destination_warehouse_code`, `charge_type`, `charge_unit`, `dim_divisor`, `min_box_weight(+unit)`, `weight_tier(+unit)`, `fuel_surcharge`/`customs_fee`/`doc_fee`, `effective_from/to`, `status`, `source_file_name`/`import_batch_id`; **`route_code` marked optional/deprecated for MVP (not the primary match key)**; added matching-precedence note (warehouse_code → postal range → city → country). Added **§4B Estimated Quote vs Actual Cost** (coarse estimate at Shipping Plan → refined at Shipment Draft → actual after invoice; `estimated_*` on `shipping_plans`/`shipments`, `*_actual` on `shipments`). Added **§4A rule:** rate-card `transit_days` = quoted reference; `carrier_lead_times.avg_days` = actual (future AI prefers avg_days). Clarified **`shipment_routes` = planned route nodes vs `shipment_events` = actual events** (see §6A + `DATABASE_RELATIONSHIP_MAP.md`). Spec only — no engine, no code, no DB migration.
> - **Draft v1.1 (2026-07-01)** — Added **`replenishment_route_rules`** (§5A) — the route-defaults table for **Inventory Replenishment / Recommendation Summary / Execution Plan** (`ship_from` / `destination` / `shipping_method` defaults), explicitly **distinct from `shipment_routes`** (Shipment / World Map / in-transit nodes only). Added **`carrier_lead_times`** (§4A). Added the **import-oriented carrier column variant** note (§4.1) for the `carriers` / `carrier_rate_cards` sync. No pricing engine, no implementation.
> - **Draft v1.0 (2026-06-30)** — Created. Defines `carriers`, `carrier_rate_cards`, `shipping_route_rules` (columns + relationships + how route rules feed the Weekly Shipping Plan defaults, overridable by the PM). No pricing engine, no implementation.

---

## 1. Scope & Non-Goals

**In scope (this spec):**
- The **column definitions** and **relationships** for three foundation tables: `carriers`, `carrier_rate_cards`, `shipping_route_rules`.
- How `shipping_route_rules` **defaults** `ship_from` / `destination` / `route_code` into a Weekly Shipping Plan, and how the PM may **override** them.
- Where `carrier_rate_cards` will eventually supply price + validity (as the future engine's source).

**In scope (added v1.1):**
- **`replenishment_route_rules`** (§5A) — route defaults for **Inventory Replenishment / Recommendation Summary / Execution Plan**.
- **`carrier_lead_times`** (§4A) — carrier transit-day ranges (ETA-planning master).

**Out of scope (NOT in this spec):**
- ❌ The **Carrier Price Engine** (freight / duty / total-cost calculation). No formula is defined or implemented here.
- ❌ Any frontend, Apps Script, API, DB migration, or BigQuery change.
- ❌ Any change to Shipment (`shipments` / `shipment_lines`) or the Execution Commit.
- ❌ Any **AI Recommendation Engine** / **Factory Allocation Engine** / **Carrier Rate Engine** — these tables are master data only; no engine is built.

---

## 2. Layer Positioning

These tables form the **Carrier / Route master layer** that the Decision Layer (Weekly Shipping Plan) reads for routing defaults, and that the future pricing engine reads for rates:

```
shipping_route_rules ──(default ship_from / destination / route_code)──▶ Weekly Shipping Plan (Decision)
carriers ──1:many──▶ carrier_rate_cards ──(price + validity, future engine)──▶ Cost Breakdown (placeholder today)
```

- **`carriers`** = logistics-provider master.
- **`carrier_rate_cards`** = a carrier's rate for a route/method, with an effective date window.
- **`shipping_route_rules`** = the routing defaults (which `ship_from` / `destination` / `route_code` to pre-fill) for a given Company / Country / Marketplace / Shipping Method.

All three are **master/reference data**, not transactional snapshots — they are read by upstream/downstream layers but are not themselves part of the Decision or Execution snapshots.

---

## 3. `carriers` — Carrier Master

One row per logistics provider (forwarder / carrier / courier).

| Field | Type | Source / Rule |
|-------|------|---------------|
| `carrier_id` | string (PK) | system generated |
| `carrier_code` | string | short unique code (e.g. `DHL`, `MAERSK`, `FEDEX`) |
| `carrier_name` | string | display name |
| `carrier_type` | enum | `forwarder` / `courier` / `trucker` / `warehouse_partner` / `customs_broker` / `other` |
| `scac_code` | string | Standard Carrier Alpha Code (optional; ocean/air) |
| `default_currency` | string | default billing currency (e.g. `USD`) |
| `contact_name` | string | optional |
| `contact_email` | string | optional |
| `contact_phone` | string | optional |
| `website` | string | optional |
| `is_active` | boolean | `TRUE` / `FALSE` — inactive carriers hidden from selection |
| `note` | string | free text |
| `created_by` | string | placeholder actor (future Role & Permission) |
| `created_at` | timestamp | system |
| `updated_by` | string | placeholder actor |
| `updated_at` | timestamp | system |

- **`carrier_id`** is referenced by `carrier_rate_cards.carrier_id`, `shipping_route_rules.default_carrier_id`, `shipping_plans.carrier_id`, and `shipments.carrier_id`.

---

## 4. `carrier_rate_cards` — Carrier Rate + Validity (authoritative column set)

One row per (carrier × origin × destination × method × charge basis × weight tier) effective window. **Source for the future Carrier Price Engine only — no calculation is performed by this spec.** This is the **import-oriented canonical schema** (rate cards are typically imported from carrier files).

| Field | Type | Source / Rule |
|-------|------|---------------|
| `rate_card_id` | string (PK) | system generated |
| `carrier_id` | string (FK) | → `carriers.carrier_id` |
| `origin_country` | string | origin match key |
| `origin_city` | string | origin match key (optional) |
| `destination_country` | string | destination match key |
| `destination_city` | string | destination match key (optional) |
| `destination_postal_code_start` | string | destination **postal-code range** start (match by postal code) |
| `destination_postal_code_end` | string | destination postal-code range end |
| `destination_warehouse_code` | string | destination **warehouse code** match (e.g. `ONT8`); most specific destination key |
| `marketplace` | string | match key (e.g. `Amazon`) |
| `shipping_method` | string | `Air Freight` / `Sea Freight` / `Express` / `Rail Freight` / … (matches plan/shipment `shipping_method`) |
| `charge_type` | enum | `actual_weight` / `dim_weight` / `chargeable_weight` / `cbm` / `carton` / `shipment` — how the billable quantity is derived |
| `charge_unit` | enum | `kg` / `cbm` / `carton` / `shipment` — the unit `unit_rate` is priced per |
| `dim_divisor` | number | dimensional-weight divisor (e.g. `5000` or `6000`); used with `charge_type = dim_weight` / `chargeable_weight` |
| `min_box_weight` | number | **minimum chargeable weight per carton** (a floor applied per box) |
| `min_box_weight_unit` | string | unit for `min_box_weight` (e.g. `kg`) |
| `weight_tier` | number | tier **starting value** (e.g. `20` / `50` / `100`) — the row applies at/above this weight |
| `weight_tier_unit` | string | unit for `weight_tier` (e.g. `kg`) |
| `currency` | string | rate currency |
| `unit_rate` | number | rate **per `charge_unit`** |
| `min_charge` | number | minimum charge floor (optional) |
| `fuel_surcharge` | number | optional surcharge (reference; not applied here) |
| `customs_fee` | number | optional customs fee (reference; not applied here) |
| `doc_fee` | number | optional documentation fee (reference; not applied here) |
| `transit_days` | number | **reference** transit days **as printed on the rate card / quote** (see §4A — actuals live in `carrier_lead_times`) |
| `effective_from` | date | effective start (inclusive) |
| `effective_to` | date | effective end (inclusive; blank = open-ended) |
| `status` | enum | `active` / `inactive` |
| `source_file_name` | string | import lineage — the carrier file this row came from |
| `import_batch_id` | string | import lineage — the batch that created the row |
| `created_at` | timestamp | system |
| `updated_at` | timestamp | system |

**Field semantics:**
- `charge_type` = how the billable quantity is derived: `actual_weight` (gross kg), `dim_weight` (L×W×H ÷ `dim_divisor`), `chargeable_weight` (max of actual vs dim), `cbm`, `carton`, `shipment` (flat per shipment).
- `charge_unit` = the unit `unit_rate` is quoted per (`kg` / `cbm` / `carton` / `shipment`).
- `dim_divisor` = dimensional-weight divisor, e.g. `5000` or `6000`.
- `min_box_weight` = minimum chargeable weight applied **per carton** (a per-box floor); `min_charge` is the per-shipment floor.
- `weight_tier` = the tier's **starting value** (e.g. rows for `20` / `50` / `100` kg breakpoints); the applicable row is the highest tier ≤ the shipment's chargeable weight.
- `unit_rate` = rate **per `charge_unit`**.
- `destination_warehouse_code` = match by warehouse code (most specific); `destination_postal_code_start/end` = match by postal-code range; `destination_city` / `destination_country` = coarser geo match.

**Matching precedence (for the future engine, not implemented here):** most specific destination wins → `destination_warehouse_code` → postal-code range (`destination_postal_code_start`…`end`) → `destination_city` → `destination_country`; then `marketplace` + `shipping_method`; then the `weight_tier` band; validity by `status = active` and reference date within `[effective_from, effective_to]`. **The selection/tie-break rule belongs to the future Carrier Price Engine and is intentionally NOT defined here.**

- **`route_code` is OPTIONAL / DEPRECATED for MVP.** It may still exist for legacy joins but **must NOT be used as the primary matching key** — matching is by origin/destination + marketplace + method + weight tier (above). New rate cards need not populate `route_code`.
- **No math is implemented.** The Weekly Shipping Plan Cost Breakdown stays a placeholder (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §11) until the engine exists.
- `shipping_plans` carries `carrier_id` / `carrier_unit_rate` / `carrier_rate_type` and `shipments` carries `carrier_id` / `rate_card_id`; those are populated **from** a chosen rate card by the future engine, not by this spec.

### 4A. `carrier_lead_times` — Carrier Transit-Day Ranges

One row per (carrier × origin country × destination country × method). ETA-planning master; **no ETA engine here.**

| Field | Type | Source / Rule |
|-------|------|---------------|
| `lead_time_id` | string (PK) | system generated |
| `carrier_id` | string (FK) | → `carriers.carrier_id` |
| `origin_country` | string | match key |
| `destination_country` | string | match key |
| `shipping_method` | string | `Air Freight` / `Sea Freight` / … |
| `min_days` | number | fastest transit estimate |
| `max_days` | number | slowest transit estimate |
| `avg_days` | number | typical transit estimate |
| `created_at` | timestamp | system |
| `updated_at` | timestamp | system |

**`transit_days` (rate card) vs `carrier_lead_times` (actuals):**
- **`carrier_rate_cards.transit_days`** = the **reference transit time printed on the quote / rate card** (what the carrier advertises).
- **`carrier_lead_times.min_days` / `max_days` / `avg_days`** = the **system-maintained or historically-observed actual transit time** (from real shipment history / manual tuning).
- **Future AI recommendation prefers `carrier_lead_times.avg_days`** over the rate-card `transit_days` when both exist (actual observed ETA beats the advertised quote figure).
- Consumed later by On-The-Way ETA planning + carrier recommendation; **not implemented now.**

---

## 4B. Estimated Quote vs Actual Cost (cost lifecycle — spec only)

Cost resolves progressively as destination detail becomes known. **All amounts are placeholders until the future Carrier Price Engine exists** — this section defines only *which* fields hold *what* at each stage.

### 4B.1 Shipping Plan stage — coarse **estimated** quote
- At Weekly Shipping Plan the exact destination is usually **not yet known** (no `destination_warehouse_code` / postal code / exact city).
- The system may therefore only produce a **coarse estimate** from `country + marketplace + shipping_method + weight_tier` (a rate card matched at the coarse level).
- This is an **estimated quote, NOT the final actual cost.** It is stored in the plan's **`estimated_*`** fields:
  - `shipping_plans`: `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `estimated_unit_cost`.

### 4B.2 Shipment Draft stage — **refined** estimated quote
- Once `warehouse_code` / `destination_warehouse_code` / postal code / city is known, the estimate can be **re-computed (refined)** using a more specific rate-card match (per the §4 matching precedence).
- Refined estimate is stored in the shipment's **`estimated_*`** fields (below); it is still an estimate.

### 4B.3 Settlement stage — **actual** cost
- **Actual** freight / duty / total are filled **only after the carrier invoice / settlement**, into the shipment's **`*_actual`** fields.

### 4B.4 Suggested cost columns

| Table | Estimated (quote) | Actual (post-invoice) |
|-------|-------------------|-----------------------|
| `shipping_plans` | `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `estimated_unit_cost` | — (plans are not invoiced) |
| `shipments` | `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `estimated_unit_cost` | `freight_cost_actual`, `duty_actual`, `total_cost_actual` |

- **Estimated and actual are never overwritten into each other** — estimates stay for variance analysis vs actuals.
- These columns are **planned schema only** (no engine, no writer). Existing `shipments` already has `freight_cost_actual` / `duty_actual`; the `estimated_*` and `total_cost_actual` columns are **new (future)** — see `DATABASE_RELATIONSHIP_MAP.md`.

---

## 5. `shipping_route_rules` — Route Defaults (ship_from / destination / route_code)

One row per (Company × Country × Marketplace × Shipping Method) routing default. **Drives the pre-filled `ship_from` / `destination` / `route_code` on a Weekly Shipping Plan.**

| Field | Type | Source / Rule |
|-------|------|---------------|
| `route_rule_id` | string (PK) | system generated |
| `company` | string | match key (blank = wildcard / applies to any) |
| `country` | string | match key |
| `marketplace` | string | match key |
| `shipping_method` | string | match key (`Air Freight` / `Sea Freight` / …; blank = any) |
| `route_code` | string | route identifier (shared with `carrier_rate_cards.route_code`) |
| `default_ship_from` | string | default origin logical warehouse / location (→ `warehouses`) |
| `default_destination` | string | default destination logical warehouse / location (→ `warehouses`) |
| `default_carrier_id` | string (FK) | optional → `carriers.carrier_id` (suggested carrier) |
| `priority` | number | tie-breaker when multiple rules match (lower = higher priority) |
| `is_active` | boolean | `TRUE` / `FALSE` |
| `note` | string | free text |
| `created_by` | string | placeholder actor |
| `created_at` | timestamp | system |
| `updated_by` | string | placeholder actor |
| `updated_at` | timestamp | system |

### 5.1 How route rules feed the Weekly Shipping Plan (defaults, overridable)

- When building a Weekly Shipping Plan group, the system **looks up `shipping_route_rules`** by the plan's `company` + `country` + `marketplace` + `shipping_method` (most specific active rule by `priority`) to **pre-fill** `ship_from`, `destination`, and `route_code`.
- **The Weekly Shipping Plan may OVERRIDE `ship_from` / `destination`.** The route rule provides only a **default**; the PM's chosen values win and are what get persisted on `shipping_plans` (and they are part of the six-value group key, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1).
- If **no** route rule matches, `ship_from` / `destination` fall back to whatever the allocation/selection provides (blank counts as a distinct group-key value, per the Weekly spec).
- This lookup/override behavior is **specified here but NOT implemented** (no frontend / Apps Script change). Today the Weekly Shipping Plan already treats `ship_from` / `destination` as part of the key with manual/blank values; this table is the future default source.

---

## 5A. `replenishment_route_rules` — Inventory Replenishment / Execution Plan Route Defaults

One row per routing default consumed by **Inventory Replenishment** — specifically the **Recommendation Summary** (Suggested Route) and the **Execution Plan** (`ship_from` / `destination` / `shipping_method` per route). This is the **upstream (planning-side)** route-defaults table.

| Field | Type | Source / Rule |
|-------|------|---------------|
| `route_rule_id` | string (PK) | system generated |
| `company` | string | match key (blank = wildcard) |
| `country` | string | match key |
| `marketplace` | string | match key |
| `shipping_method` | string | `Air Freight` / `Sea Freight` / `Express` / `Rail Freight` / … |
| `ship_from` | string | default origin (logical warehouse / location → `warehouses`) |
| `destination` | string | default destination (logical warehouse / location → `warehouses`) |
| `origin_country` | string | geo-split of `ship_from` |
| `origin_city` | string | geo-split of `ship_from` |
| `destination_country` | string | geo-split of `destination` |
| `destination_city` | string | geo-split of `destination` |
| `route_code` | string | route identifier (shared with `carrier_rate_cards.route_code`) |
| `default_carrier_id` | string (FK) | optional → `carriers.carrier_id` |
| `priority` | number | tie-breaker when multiple rules match (lower = higher priority) |
| `is_active` | boolean | `TRUE` / `FALSE` |
| `created_by` | string | placeholder actor |
| `created_at` | timestamp | system |
| `updated_by` | string | placeholder actor |
| `updated_at` | timestamp | system |
| `note` | string | free text |

### 5A.1 Usage

- **Recommendation Summary → Suggested Route:** the Inventory Replenishment second-layer Recommendation Summary derives the **Suggested Route** string (e.g. `CN → Amazon FBA / Sea`) from the matching `replenishment_route_rules` row. *(First version: placeholder `--`; this table is the future source — `INVENTORY_TABLE_MAPPING_SPEC.md` §11.2.)*
- **Execution Plan → route defaults:** when the PM adds an Execution Plan route, `ship_from` / `destination` / `shipping_method` are **pre-filled** from the matching rule (most specific active rule by `priority`) and **may be permission-locked** (future Role & Permission). The PM's chosen values are what Submit Plan pushes to the Weekly Shipping Plan. *(First version: manual entry; not implemented.)*

### 5A.2 `replenishment_route_rules` vs `shipping_route_rules` vs `shipment_routes` (do NOT mix)

| Table | Layer | Purpose |
|-------|-------|---------|
| **`replenishment_route_rules`** | Analysis / Decision (upstream) | route **defaults for Inventory Replenishment / Recommendation Summary / Execution Plan** (this section). |
| `shipping_route_rules` | Decision | route defaults pre-filled onto a **Weekly Shipping Plan** group (§5). |
| **`shipment_routes`** | Execution | **Shipment / World Map / in-transit route nodes** ONLY (leg-by-leg tracking). **NOT** a planning-defaults table. |

- **`replenishment_route_rules` MUST NOT be conflated with `shipment_routes`.** The former is a **planning-side defaults master**; the latter is **execution-side in-transit geography**. They share no rows and serve different layers.
- `replenishment_route_rules` and `shipping_route_rules` are both **planning route-defaults**; `replenishment_route_rules` is the Inventory-Replenishment-facing name (Recommendation Summary + Execution Plan), while `shipping_route_rules` is the Weekly-Shipping-Plan-group-facing name. They may be **merged into one physical table** in implementation, but the Execution Plan reads its defaults from `replenishment_route_rules` semantics.

---

## 6. Relationships (summary)

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `carriers` → `carrier_rate_cards` | `carrier_id` | 1 → many |
| `carriers` → `carrier_lead_times` | `carrier_id` | 1 → many |
| `carriers` → `shipping_route_rules` | `default_carrier_id` | 1 → many (reference; optional) |
| `carriers` → `replenishment_route_rules` | `default_carrier_id` | 1 → many (reference; optional) |
| `replenishment_route_rules` → Inventory Replenishment (Recommendation Summary / Execution Plan) | `company + country + marketplace + shipping_method` (default `ship_from` / `destination`) | reference (overridable by PM) |
| `shipping_route_rules` → `shipping_plans` | `company + country + marketplace + shipping_method` (default `ship_from` / `destination` / `route_code`) | reference (overridable) |
| `carrier_rate_cards` ↔ `shipping_route_rules` | `route_code` | legacy shared identifier — **deprecated for MVP matching** (§4) |
| `shipping_plans` → `carriers` | `carrier_id` | reference |
| `shipments` → `carriers` | `carrier_id` | reference |
| `shipments` → `carrier_rate_cards` | `rate_card_id` | reference |

- `ship_from` / `destination` on all tables are **logical warehouse / location ids** resolved via `warehouses` (consistent with `shipments.warehouse_id`; `DATABASE_RELATIONSHIP_MAP.md` §6/§8).
- `route_code` is a **legacy/optional** shared identifier only; it is **deprecated for MVP matching** (§4) — rate cards match by origin/destination + marketplace + method + weight tier, not by `route_code`.

---

## 6A. `shipment_routes` (planned nodes) vs `shipment_events` (actual events)

These are **Execution-layer** tables (Shipment / On-The-Way / World Map) — distinct from the planning-side route tables above, and from each other:

- **`shipment_routes` = the PLANNED route nodes** (the intended leg-by-leg path). Example sequence:
  1. 東莞工廠 (Dongguan factory)
  2. 深圳出口海關 (Shenzhen export customs)
  3. 太平洋航段 (Pacific ocean leg)
  4. 洛杉磯港 (Los Angeles port)
  5. Amazon ONT8
- **`shipment_events` = the ACTUAL events that occurred** (timestamped status log). Example events:
  `picked_up` · `customs_cleared` · `vessel_departed` · `arrived_port` · `delivered`.
- **Do NOT conflate:** `shipment_routes` is the *plan* (where it should go); `shipment_events` is the *fact* (what happened, when). The World Map / On-The-Way view reads `shipment_routes` for the path and `shipment_events` for progress along it.
- **Neither is a planning-defaults table** (`replenishment_route_rules` / `shipping_route_rules`) and neither is defined/implemented by this spec — see `DATABASE_RELATIONSHIP_MAP.md` §8/§9 and `SHIPMENT_CENTER_SPEC.md` §18.

---

## 7. Future Carrier Price Engine (NOT in this spec)

When built, the engine will: pick the applicable `carrier_rate_cards` row (by carrier + origin/destination + marketplace + method + weight tier + validity window, per §4 precedence), derive the billable quantity from `charge_type` (`actual_weight` / `dim_weight` via `dim_divisor` / `chargeable_weight` / `cbm` / `carton` / `shipment`) with the `min_box_weight` per-carton floor, compute freight from `unit_rate` × billable `charge_unit` (+ `min_charge` / `fuel_surcharge` / `customs_fee` / `doc_fee`), and write `estimated_*` onto `shipping_plans` / `shipments` (and `*_actual` onto `shipments` after invoice, §4B). **None of this is implemented now.** Until then, Cost Breakdown shows stored values or `--` placeholders.

---

## 8. Non-Goals

- **No** Carrier Price Engine / freight / duty / total-cost formula.
- **No** code, frontend, Apps Script, API, DB migration, or BigQuery.
- **No** change to Shipment / Execution Commit / Weekly Shipping Plan implementation.
- **No** `carrier_lead_times` definition (future ETA-planning work).

---

**Draft v1.0 — Carrier & Route Foundation Spec. Schema/relationship definition only; no pricing engine and no implementation is implied. Routing defaults are overridable by the Weekly Shipping Plan; Cost Breakdown stays a placeholder until the future Carrier Price Engine.**

**End of Document**
