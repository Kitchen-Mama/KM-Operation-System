# Carrier & Route Foundation Spec

**Status:** 🟡 Draft v1.0 — Foundation DB definition only (Spec only — NO code, NO frontend, NO Apps Script, NO DB migration yet, NO BigQuery, NO pricing engine)
**Last Updated:** 2026-06-30
**Maintained By:** Development Team
**Authority / context (read, not overridden):** [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md).

> **Purpose.** This document defines the **foundation tables** for Carrier master data, Carrier rate cards (price + validity), and Shipping Route rules (default `ship_from` / `destination` / `route_code`). It is a **schema/relationship definition only**. It introduces **NO** Carrier Price Engine, **NO** calculation logic, **NO** code, frontend, Apps Script, API, DB migration, or BigQuery change. Until the future **Carrier Price Engine** is built, the Weekly Shipping Plan **Cost Breakdown remains a placeholder** (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §11).

> **Changelog:**
> - **Draft v1.0 (2026-06-30)** — Created. Defines `carriers`, `carrier_rate_cards`, `shipping_route_rules` (columns + relationships + how route rules feed the Weekly Shipping Plan defaults, overridable by the PM). No pricing engine, no implementation.

---

## 1. Scope & Non-Goals

**In scope (this spec):**
- The **column definitions** and **relationships** for three foundation tables: `carriers`, `carrier_rate_cards`, `shipping_route_rules`.
- How `shipping_route_rules` **defaults** `ship_from` / `destination` / `route_code` into a Weekly Shipping Plan, and how the PM may **override** them.
- Where `carrier_rate_cards` will eventually supply price + validity (as the future engine's source).

**Out of scope (NOT in this spec):**
- ❌ The **Carrier Price Engine** (freight / duty / total-cost calculation). No formula is defined or implemented here.
- ❌ Any frontend, Apps Script, API, DB migration, or BigQuery change.
- ❌ Any change to Shipment (`shipments` / `shipment_lines`) or the Execution Commit.
- ❌ `carrier_lead_times` (ETA-planning table; referenced in `DATABASE_RELATIONSHIP_MAP.md` §9, defined later when On-The-Way ETA work begins).

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
| `carrier_type` | enum | `air` / `sea` / `express` / `rail` / `courier` / `forwarder` |
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

## 4. `carrier_rate_cards` — Carrier Rate + Validity

One row per (carrier × route × method × rate-type) effective window. **Source for the future Carrier Price Engine only — no calculation is performed by this spec.**

| Field | Type | Source / Rule |
|-------|------|---------------|
| `rate_card_id` | string (PK) | system generated |
| `carrier_id` | string (FK) | → `carriers.carrier_id` |
| `route_code` | string | route identifier (shared with `shipping_route_rules.route_code`) |
| `ship_from` | string | origin logical warehouse / location (→ `warehouses`) |
| `destination` | string | destination logical warehouse / location (→ `warehouses`) |
| `shipping_method` | string | `Air Freight` / `Sea Freight` / `Express` / `Rail Freight` / … (matches plan/shipment `shipping_method`) |
| `rate_type` | enum | `per_kg` / `per_cbm` / `per_carton` / `per_container` / `flat` — the billing basis (semantics only; engine deferred) |
| `unit_rate` | number | rate per the `rate_type` unit |
| `currency` | string | rate currency |
| `min_charge` | number | minimum charge floor (optional) |
| `fuel_surcharge_pct` | number | optional surcharge % (reference; not applied here) |
| `duty_rate_pct` | number | optional duty/customs % (reference; not applied here) |
| `transit_days` | number | typical transit days for the route (reference; ETA planning future) |
| `valid_from` | date | effective start (inclusive) |
| `valid_to` | date | effective end (inclusive; blank = open-ended) |
| `is_active` | boolean | `TRUE` / `FALSE` |
| `note` | string | free text |
| `created_by` | string | placeholder actor |
| `created_at` | timestamp | system |
| `updated_by` | string | placeholder actor |
| `updated_at` | timestamp | system |

- **Validity:** a rate card is "current" when `is_active = TRUE` and the reference date is within `[valid_from, valid_to]`. The **selection rule** (which card wins when several overlap) belongs to the future **Carrier Price Engine** and is intentionally **not defined here**.
- **`rate_type` is metadata only.** No freight/duty/total math is implemented; the Weekly Shipping Plan Cost Breakdown stays a placeholder (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §11) until the engine exists.
- `shipping_plans` already carries `carrier_id` / `carrier_unit_rate` / `carrier_rate_type` and `shipments` carries `carrier_id` / `rate_card_id`; those fields will be populated **from** a chosen rate card by the future engine, not by this spec.

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

## 6. Relationships (summary)

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `carriers` → `carrier_rate_cards` | `carrier_id` | 1 → many |
| `carriers` → `shipping_route_rules` | `default_carrier_id` | 1 → many (reference; optional) |
| `shipping_route_rules` → `shipping_plans` | `company + country + marketplace + shipping_method` (default `ship_from` / `destination` / `route_code`) | reference (overridable) |
| `carrier_rate_cards` ↔ `shipping_route_rules` | `route_code` | shared route identifier |
| `shipping_plans` → `carriers` | `carrier_id` | reference |
| `shipments` → `carriers` | `carrier_id` | reference |
| `shipments` → `carrier_rate_cards` | `rate_card_id` | reference |

- `ship_from` / `destination` on all tables are **logical warehouse / location ids** resolved via `warehouses` (consistent with `shipments.warehouse_id`; `DATABASE_RELATIONSHIP_MAP.md` §6/§8).
- `route_code` is the **shared join** between a route rule (which default route to use) and a rate card (what that route costs) — to be consumed by the future engine.

---

## 7. Future Carrier Price Engine (NOT in this spec)

When built, the engine will: pick the applicable `carrier_rate_cards` row (by carrier + route_code/method + validity window), compute freight from `rate_type` × billable quantity (+ `min_charge` / `fuel_surcharge_pct`), compute duty from `duty_rate_pct`, and write `estimated_freight_cost` / `estimated_duty` / `estimated_total_cost` / `currency` onto `shipping_plans` (and actuals onto `shipments`). **None of this is implemented now.** Until then, Cost Breakdown shows stored values or `--` placeholders.

---

## 8. Non-Goals

- **No** Carrier Price Engine / freight / duty / total-cost formula.
- **No** code, frontend, Apps Script, API, DB migration, or BigQuery.
- **No** change to Shipment / Execution Commit / Weekly Shipping Plan implementation.
- **No** `carrier_lead_times` definition (future ETA-planning work).

---

**Draft v1.0 — Carrier & Route Foundation Spec. Schema/relationship definition only; no pricing engine and no implementation is implied. Routing defaults are overridable by the Weekly Shipping Plan; Cost Breakdown stays a placeholder until the future Carrier Price Engine.**

**End of Document**
