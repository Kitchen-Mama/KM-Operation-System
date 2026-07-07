# Carrier & Route Foundation Spec

**Status:** 🟢 Draft v1.8 — Foundation DB definition + **Carrier Rate Card v1.1** (two template modes + carrier-scoped Update Template with `rate_card_id` update/create + importer-enforced field locking + finalized destination matching priority + `last_mile_delivery`, all implemented) + **first adopter of the Import Job Framework** (§4C.8) + **future carrier-email round-trip documented** (Spec + matching runtime/UI mapping; NO email automation, NO Export Center, NO pricing/cost engine, NO DB migration by this spec)
**Last Updated:** 2026-07-07
**Maintained By:** Development Team
**Authority / context (read, not overridden):** [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md), [`IMPORT_JOB_FRAMEWORK_SPEC.md`](./IMPORT_JOB_FRAMEWORK_SPEC.md) (**canonical import review/apply workflow — Carrier is the first adopter**), [`IMPORT_JOB_DATABASE_SPEC.md`](./IMPORT_JOB_DATABASE_SPEC.md), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md).

> **Purpose.** This document defines the **foundation tables** for Carrier master data, Carrier rate cards (price + validity), and Shipping Route rules (default `ship_from` / `destination` / `route_code`). It is a **schema/relationship definition only**. It introduces **NO** Carrier Price Engine, **NO** calculation logic, **NO** code, frontend, Apps Script, API, DB migration, or BigQuery change. Until the future **Carrier Price Engine** is built, the Weekly Shipping Plan **Cost Breakdown remains a placeholder** (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §11).

> **Changelog:**
> - **Draft v1.8 (2026-07-07) — Carrier Rate import adopts the Import Job Framework (spec only).** Added **§4C.8**: Carrier Rate is the **first adopter** of the new platform [`IMPORT_JOB_FRAMEWORK_SPEC.md`](./IMPORT_JOB_FRAMEWORK_SPEC.md) — the canonical import workflow is **Task Card → Review Page → Apply → History** (popup = summary only), not a Carrier-specific popup. Row rules map 1:1 (existing = update / new = create / blank = ignore), and **locked-field changes become a reviewable Warning (default Keep Original, user may Override)** instead of being silently ignored. Import summary counts map onto `import_jobs` header counts (`IMPORT_JOB_DATABASE_SPEC.md` §10.1). No implementation; the current direct import + alert (§4C.4) is interim.
> - **Draft v1.7 (2026-07-06) — Carrier Rate Template update/create semantics + carrier scope + importer-enforced locking (implemented); future email round-trip documented.** Both templates now carry **`rate_card_id`** (present ⇒ update that row; blank ⇒ create). **Update Template is carrier-scoped** — a carrier must be selected (else export is blocked: *"Please select a carrier before exporting Update Template."*), and it exports only that carrier's active rows. **Importer rewritten** (`17_carrier_handlers.gs` `handleImportCarrierRateCards_`): existing rows update by `rate_card_id`; in Update mode only `unit_rate`/`effective_from`/`effective_to`/`fuel_surcharge`/`customs_fee`/`doc_fee`/`status`/`note` are editable and **locked-field edits are ignored + reported** (`locked_fields_ignored_count` + row warnings); new rows (blank `rate_card_id` + required values) are validated and created under the carrier scope (may add new `shipping_method`/`last_mile_delivery`/`destination_warehouse_code`/city/zip/country); blank rows skipped. New import summary: `updated_existing_count` / `created_new_count` / `blank_skipped_count` / `rejected_count` / `locked_fields_ignored_count` / `warnings` / `errors`. **Master mode** may update any field on existing rows and create new ones (admin full-edit). **CSV cannot protect cells → locking enforced by the importer** (documented §4C.3A). Added **§4C.7 future Export Center → carrier-email round-trip (documentation only; NOT implemented — no email/Gmail/parser/Export Center)**. Client: `exportCarrierRateTemplate` adds `rate_card_id`; `importCarrierRateTemplate` passes `mode` + `carrier_scope`. No pricing/cost engine, no DB migration.
> - **Draft v1.6 (2026-07-06) — Carrier v1.1 finalized (implemented).** **(1) Two export template modes** (§4C.3): **Export Update Template** (weekly/monthly — route/method/structure locked; `unit_rate` / `effective_from` / `effective_to` cleared for re-fill; uses current Search result) and **Export Master Template** (one-time full import / new-route setup — all `carrier_rate_cards` columns, all fields editable, nothing cleared, supports adding new `shipping_method` / `last_mile_delivery` / `destination_warehouse_code` / city / zip / country rows; exports all loaded rows). Neither exports Lead Time. **(2) Destination matching priority FINALIZED** (§4 matching): `destination_warehouse_code` → `destination_city` → `destination_postal_code_start~end` → `destination_country`, **stop at the first (most specific) level that matches** — higher-priority match wins and lower levels are ignored (engine still not implemented). **(3) `last_mile_delivery`** confirmed as a separate column on `carrier_rate_cards` + `carrier_lead_times`, displayed as its own UI column (never `Sea/P` / `Sea/T`). Client-side: `exportCarrierRateTemplate(rows, {mode})`, two page buttons/handlers. No pricing/cost engine, no DB migration by this spec.
> - **Draft v1.5 (2026-07-06)** — **`last_mile_delivery` separated from `shipping_method` (runtime + UI implemented).** `shipping_method` = **main transportation mode** (`Sea` / `Sea Express` / `Air` / `Courier`); new `last_mile_delivery` = **final delivery mode** (`Parcel` / `Truck`). The two are **independent columns** on both `carrier_rate_cards` (§4) and `carrier_lead_times` (§4A) — **never combined**, and **never** encoded as `Sea/P`, `Sea/T`, `P`, or `T`. The **Lead Time display join** now keys on `carrier_id + origin_country + destination_country + shipping_method + last_mile_delivery`, with a **legacy fallback** to `… + shipping_method` when the rate card's `last_mile_delivery` is blank. Carrier Rate Card page now shows **Shipping Method** and **Last Mile Delivery** as separate columns + an optional **Last Mile Delivery filter**; the Rate Template gained a `last_mile_delivery` fixed column. Runtime normalizers (`normalizeCarrierRateCardRecord` / `normalizeCarrierLeadTimeRecord`), the import handler header + write path (`17_carrier_handlers.gs`), and the client template export were updated to match. No pricing/cost engine, no DB migration by this spec (DB columns added operationally).
> - **Draft v1.4 (2026-07-06)** — **Final architecture sync before Carrier implementation (spec only).** **Removed `carrier_rate_cards.transit_days`** entirely — Lead Time is **no longer stored on rate cards**. **`carrier_lead_times` is the SINGLE SOURCE OF TRUTH for Lead Time**; `carrier_rate_cards` must never duplicate it. The Carrier Rate Card page shows Lead Time via a **display-only join** to `carrier_lead_times` (`carrier_id + origin_country + destination_country + shipping_method`; **blank if no match — no fallback**). **Carrier Rate Template no longer includes Lead Time** (template covers only `unit_rate` / `effective_from` / `effective_to` / `fuel_surcharge` / `customs_fee` / `doc_fee` / `min_charge`; routing locked). **`carrier_lead_times` is Kitchen-Mama-maintained master data with a lifecycle independent from Carrier Rate** (never updated by the rate template; future manual / shipment-history updates). Neither table writes to the other. No engine, no code, no DB migration.
> - **Draft v1.3 (2026-07-06)** — **Carrier Rate Card v1 (implementation-ready spec, still no engine / no code).** Added §4 columns `transit_type`, `battery_type`, `customs_type`, `note`; clarified `charge_type` (pricing model) / `charge_unit` / `min_charge` v1 enums. Added **§4C Carrier Rate Card v1** — purpose (Reference/Master-like data, NOT a Decision Layer, does not auto-decide carrier), the **Carrier Rate Card page v1** (filters, table columns, Lead Time from `carrier_lead_times`), **Template Export v1** (fixed route/method preserved; `unit_rate`/`effective_from`/`effective_to` cleared; `row_type` example/data helper not persisted), **Template Import v1** (append-only + validation), and the **effective-date overlap rule** (append new version; never overwrite; future-engine tie-break = latest `effective_from` → latest `import_batch_id`/`updated_at` → conflict warning; v1 page shows both). **`carrier_fee_types` / `carrier_rate_breakdowns` explicitly deferred** (FCL/container cost breakdown later; v1 keeps all rate rows in `carrier_rate_cards`). Spec only — no DB migration, no engine.
> - **Draft v1.2 (2026-07-01)** — **Carrier rate-card schema expansion (still no engine).** `carriers.carrier_type` enum → `forwarder / courier / trucker / warehouse_partner / customs_broker / other` (§3). `carrier_rate_cards` (§4) rewritten to the authoritative import schema: added `destination_postal_code_start/end`, `destination_warehouse_code`, `charge_type`, `charge_unit`, `dim_divisor`, `min_box_weight(+unit)`, `weight_tier(+unit)`, `fuel_surcharge`/`customs_fee`/`doc_fee`, `effective_from/to`, `status`, `source_file_name`/`import_batch_id`; **`route_code` marked optional/deprecated for MVP (not the primary match key)**; added matching-precedence note (warehouse_code → postal range → city → country). Added **§4B Estimated Quote vs Actual Cost** (coarse estimate at Shipping Plan → refined at Shipment Draft → actual after invoice; `estimated_*` on `shipping_plans`/`shipments`, `*_actual` on `shipments`). Added **§4A rule** on `carrier_lead_times` as the transit-day source (a former rate-card `transit_days` reference column was **removed in v1.4**). Clarified **`shipment_routes` = planned route nodes vs `shipment_events` = actual events** (see §6A + `DATABASE_RELATIONSHIP_MAP.md`). Spec only — no engine, no code, no DB migration.
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
| `shipping_method` | string | **main transportation mode** — `Sea` / `Sea Express` / `Air` / `Courier` / … (matches plan/shipment `shipping_method`) |
| `last_mile_delivery` | string | **final delivery mode** — `Parcel` / `Truck` / … . **Separate concept from `shipping_method`.** Do NOT encode Parcel/Truck into `shipping_method`, and do NOT use `P` / `T` abbreviations or combined labels like `Sea/P`. Blank allowed (legacy rows). |
| `charge_type` | enum | **pricing model** — `weight` / `volume` / `container` / `shipment` / `carton`. (Weight rows further derive billable qty as actual / dim / chargeable — see semantics.) |
| `charge_unit` | enum | the unit `unit_rate` is priced per — `kg` / `lb` / `cbm` / `20GP` / `40HQ` / `shipment` / `carton` |
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
| `transit_type` | enum | `port_to_port` / `door_to_port` / `port_to_door` / `door_to_door` |
| `battery_type` | enum | `no_battery` / `built_in_battery` / `removable_battery` / `lithium_battery` / `unknown` |
| `customs_type` | enum | `buy_export_license` / `tax_refund_export` / `not_applicable` / `unknown` |
| `note` | string | free text (rate-row remarks) |
| `effective_from` | date | effective start (inclusive) |
| `effective_to` | date | effective end (inclusive; blank = open-ended) |
| `status` | enum | `active` / `inactive` |
| `source_file_name` | string | import lineage — the carrier file this row came from |
| `import_batch_id` | string | import lineage — the batch that created the row |
| `created_at` | timestamp | system |
| `updated_at` | timestamp | system |

**Field semantics:**
- **`shipping_method` = main transportation mode; `last_mile_delivery` = final delivery mode — two SEPARATE concepts.** `shipping_method` ∈ `Sea` / `Sea Express` / `Air` / `Courier` / …; `last_mile_delivery` ∈ `Parcel` / `Truck` / … . Valid combinations include `Sea` + `Parcel`, `Sea` + `Truck`, `Sea Express` + `Parcel`, `Sea Express` + `Truck`. **Never** collapse the final-delivery mode into `shipping_method`, and **never** use short/combined canonical values such as `Sea/P`, `Sea/T`, `P`, or `T` — those are display shorthand only, never DB values.
- **`charge_type` = the pricing model** of the row: `weight` / `volume` / `container` / `shipment` / `carton`. For `weight`, the billable quantity is further derived as **actual** (gross), **dim** (L×W×H ÷ `dim_divisor`), or **chargeable** (max of actual vs dim) — the mode follows the carrier file / `dim_divisor` presence. `volume` → priced by `cbm`; `container` → priced per container unit (`20GP` / `40HQ`); `shipment` → flat per shipment; `carton` → per carton.
- **`charge_unit` = the unit `unit_rate` is quoted per**: `kg` / `lb` / `cbm` / `20GP` / `40HQ` / `shipment` / `carton`. Must be consistent with `charge_type` (e.g. `container` → `20GP`/`40HQ`; `weight` → `kg`/`lb`).
- **`min_charge` = the minimum billable amount for this rate row** (a per-row / per-shipment floor, in `currency`). `min_box_weight` is a separate **per-carton** minimum chargeable weight floor.
- **`transit_type`** = leg coverage of the quote: `port_to_port` / `door_to_port` / `port_to_door` / `door_to_door`.
- **`battery_type`** = battery classification the rate applies to: `no_battery` / `built_in_battery` / `removable_battery` / `lithium_battery` / `unknown`.
- **`customs_type`** = customs handling the rate assumes: `buy_export_license` / `tax_refund_export` / `not_applicable` / `unknown`.
- `dim_divisor` = dimensional-weight divisor, e.g. `5000` or `6000`.
- `weight_tier` = the tier's **starting value** (e.g. rows for `20` / `50` / `100` kg breakpoints); the applicable row is the highest tier ≤ the shipment's chargeable weight.
- `unit_rate` = rate **per `charge_unit`**.
- `destination_warehouse_code` = match by warehouse code (most specific); `destination_postal_code_start/end` = match by postal-code range; `destination_city` / `destination_country` = coarser geo match.

**Destination matching priority (FINALIZED — Carrier v1.1).** Match the destination at the **most specific level that has a matching rate row, then STOP** — do not fall through to lower-priority levels once a higher one matches:

1. **`destination_warehouse_code`** (most specific)
2. **`destination_city`**
3. **`destination_postal_code_start` ~ `destination_postal_code_end`** (postal-code range)
4. **`destination_country`** (coarsest)

**Stop rule:** if a higher-priority level matches, use that level's rate **even if** lower-priority (city / zip / country) rows also match. Example: when `destination_warehouse_code` matches, use the warehouse-code rate and ignore any city / zip / country rows for the same route.

After the destination level is fixed, further narrow by `marketplace` + `shipping_method` + `last_mile_delivery`, then the `weight_tier` band; validity by `status = active` and reference date within `[effective_from, effective_to]`. **The engine that consumes this priority (and any tie-break within a level) is the future Carrier Price Engine and is intentionally NOT implemented here** — this section fixes only the priority order + stop rule.

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
| `shipping_method` | string | **main transportation mode** — `Sea` / `Sea Express` / `Air` / `Courier` / … (match key) |
| `last_mile_delivery` | string | **final delivery mode** — `Parcel` / `Truck` / … (match key). Blank allowed → legacy fallback (see join rule below). |
| `min_days` | number | fastest transit estimate |
| `max_days` | number | slowest transit estimate |
| `avg_days` | number | typical transit estimate |
| `created_at` | timestamp | system |
| `updated_at` | timestamp | system |

**`carrier_lead_times` is the SINGLE SOURCE OF TRUTH for Lead Time (v1.4):**
- **Lead Time lives ONLY in `carrier_lead_times`.** `carrier_rate_cards` **must NEVER store or duplicate** transit / lead-time data — the former `carrier_rate_cards.transit_days` column has been **removed** (v1.4).
- **`carrier_lead_times.min_days` / `max_days` / `avg_days`** = the transit-day range (system-maintained or historically-observed). Future AI recommendation reads `carrier_lead_times.avg_days`.
- **Maintenance & lifecycle:** `carrier_lead_times` is **maintained internally by Kitchen Mama** (manual today; future manual or automatic updates from **shipment history**). It is **NOT updated by the Carrier Rate Template** and its lifecycle is **independent from the Carrier Rate lifecycle** — rate periods change without touching lead times, and vice versa.
- Consumed by the Carrier Rate Card page (display-only join, §4C.2) and later by On-The-Way ETA planning + carrier recommendation; **not implemented now.**

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

## 4C. Carrier Rate Card v1 (implementation-ready spec — no code / no engine)

This section makes the `carrier_rate_cards` table (§4) **implementation-ready as a v1 feature**: purpose, page, template export/import, and effective-date versioning. It remains **spec only** — no frontend, Apps Script, API, DB migration, or pricing engine is built.

### 4C.1 Purpose & positioning

- **Carrier Rate Card is Reference Data / Master-like logistics pricing data.** It sits in the **Carrier / Route master layer** (§2), not in the Decision Layer.
- It **does NOT decide the carrier automatically** and performs **no calculation**. It only supports **lookup, filtering, manual comparison**, and is the **future source** for the Carrier Price Engine.
- It never writes back into `shipping_plans` / `shipments`; the future engine (not this spec) is the only writer of `estimated_*` / `*_actual` cost (§4B).
- **Lead Time is NOT part of the rate card.** `carrier_lead_times` (§4A) is the **single source of truth** for Lead Time; `carrier_rate_cards` never stores or duplicates it (the former `transit_days` column was removed in v1.4). The page shows Lead Time by a **display-only join**; the two tables are **independent master data** and neither writes to the other.
- Authoritative schema = **§4 `carrier_rate_cards`** (now including `transit_type`, `battery_type`, `customs_type`, `note`; **no** `transit_days`).

### 4C.2 Carrier Rate Card page v1

**Page name:** **Carrier Rate Card**

**Filters (left → right):** **Date · Country / Ship To · Method (`shipping_method`) · Last Mile Delivery (`last_mile_delivery`, optional) · Carrier (`carrier_name`) · Search button.**

- **Default:** **no data is shown before Search** (the table renders only after the user clicks Search).
- `Date` filters rows whose `[effective_from, effective_to]` window contains the chosen date (blank `effective_to` = open-ended).
- `Country / Ship To` matches destination (`destination_country` / `destination_city` / `destination_warehouse_code`).

**Table columns (display order):**

| Column | Source |
|--------|--------|
| carrier_name | `carriers.carrier_name` (join by `carrier_id`) |
| Ship From | `origin_country` (+ `origin_city` when present) |
| Ship To | `destination_country` / `destination_city` / `destination_warehouse_code` (most specific present) |
| Shipping Method | `shipping_method` (main transportation mode; shown as its own column) |
| Last Mile Delivery | `last_mile_delivery` (final delivery mode; shown as its own column — **never combined** with Shipping Method) |
| Lead Time | **display-only join** to `carrier_lead_times.min_days ~ max_days` — matched by `carrier_id + origin_country + destination_country + shipping_method + last_mile_delivery`. If the rate card's `last_mile_delivery` is **blank** (legacy rows), fall back to `carrier_id + origin_country + destination_country + shipping_method`. **Blank if still no matching record — NO fabricated fallback value.** (Lead Time is NOT stored on `carrier_rate_cards`.) |
| Charge Type | `charge_type` |
| Charge Unit | `charge_unit` |
| Min Box Weight | `min_box_weight` |
| Min Box Weight Unit | `min_box_weight_unit` |
| Weight Tier | `weight_tier` |
| Weight Tier Unit | `weight_tier_unit` |
| Unit Rate | `unit_rate` |
| Min Charge | `min_charge` |
| Fuel Surcharge | `fuel_surcharge` |
| Customs Fee | `customs_fee` |
| Doc Fee | `doc_fee` |
| Transit Type | `transit_type` |
| Battery Type | `battery_type` |
| Customs Type | `customs_type` |
| Effective Date | `effective_from` ~ `effective_to` |
| Status | `status` |
| Currency | `currency` |
| Note | `note` |

- **Lead Time** is **display-only** — read from `carrier_lead_times` (§4A), the **single source of truth**; the page does **not** write it and `carrier_rate_cards` does **not** store it. Match by `carrier_id + origin_country + destination_country + shipping_method + last_mile_delivery`; when the rate card's `last_mile_delivery` is **blank** (legacy rows) fall back to `carrier_id + origin_country + destination_country + shipping_method`. If no matching record exists the cell is **blank (no fabricated fallback value)**.
- **`shipping_method` and `last_mile_delivery` are displayed as two separate columns** — never a combined `Sea/P` style label. `last_mile_delivery` also has an **optional filter**.
- The page reads `carrier_rate_cards` **and** `carrier_lead_times` **together for display only** — **neither table writes to the other**.
- The page is **read/browse + import/export** only; it does not select or rank carriers.
- **Export buttons (two, §4C.3):** **Export Update Template** (**carrier-scoped** — requires a selected carrier; exports that carrier's active rows with `rate_card_id`; route/method locked; `unit_rate`/`effective_from`/`effective_to` cleared) and **Export Master Template** (all carriers / all rows; every field editable; add new route/method/last-mile/warehouse/city/zip/country rows). Both exclude Lead Time.

### 4C.3 Template Export — two modes (Carrier v1.1)

The Carrier Rate Card page offers **two** export buttons. **Neither** includes Lead Time / `transit_days` — those live only in `carrier_lead_times` (§4A / §4C.1) and are never exported or imported through any rate template. Both include `last_mile_delivery`. Both templates carry two identity/helper columns first: **`row_type`** = `example` / `data` (**not persisted**) and **`rate_card_id`** (the row's PK — **present ⇒ existing row (update); blank ⇒ new row (create)**). Neither template carries `import_batch_id` / `created_at` / `updated_at` (system-assigned on import).

**Mode 1 — "Export Update Template"** *(routine carrier quotation update — CARRIER-SCOPED)*
- **Purpose:** let a specific carrier / forwarder fill in a **new rate period** and optionally add new routes, without touching the fixed route / method / charge structure of existing rows.
- **Carrier scope (required):** a carrier must be selected first. **If no carrier is selected the export is blocked** with: *"Please select a carrier before exporting Update Template."*
- **Export source:** **only that carrier's existing ACTIVE rows** (`carrier_id = selected`, `status ≠ inactive`), independent of the date/country filters so the carrier receives their full current rate set. Each exported existing row **includes its `rate_card_id`**.
- **Behavior:**
  - **Preserve** the fixed route / method / charge structure columns (carrier, origin/destination keys, `marketplace`, `shipping_method`, `last_mile_delivery`, `charge_type`, `charge_unit`, `dim_divisor`, `min_box_weight(+unit)`, `weight_tier(+unit)`, `currency`, `min_charge`, `transit_type`, `battery_type`, `customs_type`). These are **LOCKED** — see §4C.3A.
  - **Clear by default:** `unit_rate`, `effective_from`, `effective_to` (the carrier fills the new period + prices).
  - Include one **example row** demonstrating the format.
  - **CSV limitation:** a CSV cannot enforce cell protection, so "locked" columns are advisory in the file and **the enforcement happens in the importer** (§4C.3A / §4C.4), not in the CSV.
  - The **blank rows below** are for the carrier to add new route/method rows (leave `rate_card_id` blank → created on import; see §4C.3B).

**Mode 2 — "Export Master Template"** *(initial full setup & internal maintenance)*
- **Purpose:** a complete, fully-editable snapshot for **initial bulk import** or internal admin maintenance — **not** the carrier routine quote update.
- **Export source:** **all** loaded `carrier_rate_cards` rows across **all carriers** (does not require a prior Search; exports the example row alone if none exist). Existing rows include `rate_card_id`.
- **Behavior:**
  - Exports the **full `carrier_rate_cards` schema** (same column set as the Update Template — still **no** Lead Time / `transit_days`).
  - **All fields editable; nothing is cleared.** On import, a row **with** `rate_card_id` **updates** that row (any field); a row **without** `rate_card_id` **creates** a new row.
  - **Supports adding new rows:** new `shipping_method`, new `last_mile_delivery`, new `destination_warehouse_code`, and new city / zip / country-level rates.

### 4C.3A Update Template — row semantics & field locking (importer-enforced)

The importer classifies each data row by `rate_card_id`:

**A. Existing row** — `rate_card_id` is present (and must exist in `carrier_rate_cards`; otherwise **rejected**).
- **Editable fields:** `unit_rate`, `effective_from`, `effective_to`, `fuel_surcharge`, `customs_fee`, `doc_fee`, `status`, `note`.
- **Locked fields:** everything else, including `carrier_id`, `origin_country`, `origin_city`, `destination_country`, `destination_city`, `destination_postal_code_start`, `destination_postal_code_end`, `destination_warehouse_code`, `marketplace`, `shipping_method`, `last_mile_delivery`, `charge_type`, `charge_unit`, `dim_divisor`, `min_box_weight`, `min_box_weight_unit`, `weight_tier`, `weight_tier_unit`, `currency`, `min_charge`, `transit_type`, `battery_type`, `customs_type`.
- **If a locked field is changed on an existing row:** the change is **ignored** (the original DB value is kept), counted in `locked_fields_ignored_count`, and a **row-level warning** is emitted. *(Master-mode import is exempt — it may update any field.)*

**B. New row** — `rate_card_id` is **blank** but the row carries required route/rate values.
- Treated as a **new `carrier_rate_cards` row**; **all fields editable**; a new `rate_card_id` is generated.
- `carrier_id` defaults to the **template carrier scope** when blank (Update Template import derives the scope from the file's existing rows or an explicit `carrier_scope`).
- May introduce new `shipping_method`, `last_mile_delivery`, `destination_warehouse_code`, `destination_city`, `destination_postal_code_start`/`end`, `destination_country`, `weight_tier`, `charge_type`/`charge_unit`.
- **Required fields (new row):** `carrier_id` (or template carrier scope), `origin_country`, `destination_country`, `shipping_method`, `last_mile_delivery`, `charge_type`, `charge_unit`, `currency`, `unit_rate`, `effective_from`, `effective_to`. Destination may be specified at any level (`destination_warehouse_code` / `destination_city` / `destination_postal_code_start`+`end` / `destination_country` only). Invalid rows are **rejected + reported**; valid rows are **appended** (never overwrite an existing row unless `rate_card_id` is present).

**C. Blank row** — no `rate_card_id` and no meaningful required values → **skipped silently** (counted as `blank_skipped_count`).

### 4C.4 Template Import v1.1

- **Update vs create by `rate_card_id`** (§4C.3A): present ⇒ update that row; blank + meaningful ⇒ create new; blank + empty ⇒ skip.
- **Mode** is derived from the file name (`master` ⇒ Master rules, else Update rules); the client passes it explicitly. **Field locking is enforced by the importer, not the CSV.**
- New rows are stamped with a new `rate_card_id`, `source_file_name`, `import_batch_id`, `created_at`, `updated_at`; updates set `updated_at`.
- **`row_type = example` rows are skipped.** Lead Time / `transit_days` columns → **whole import rejected**.

**Required import validation (new rows — rejected / reported on failure):** `carrier_id` exists in `carriers`; `origin_country` / `destination_country` / `shipping_method` / `last_mile_delivery` present; `charge_type` / `charge_unit` valid enums; `currency` present; `unit_rate` numeric; `effective_from` / `effective_to` valid dates with `effective_from ≤ effective_to`; `status` defaults `active`. For **existing-row updates**, only the edited allowed fields are validated (date validity, `status` enum, `unit_rate` numeric).

**Import summary (returned + shown):** `updated_existing_count`, `created_new_count`, `blank_skipped_count`, `rejected_count`, `locked_fields_ignored_count`, plus `warnings` (locked-field-ignored, row-level) and `errors` (row-level), and `batch_id`.

### 4C.5 Effective-date overlap rule

- **DB import rule:** when a new row's date window **overlaps** an existing row for the same route / method, **do NOT delete or overwrite** the old row — **append it as a new rate version** (both rows coexist, distinguished by `effective_from` / `import_batch_id`).
- **Future pricing engine rule** (NOT implemented here) — when multiple rows match the same route / method / date:
  1. choose the row whose **`effective_from` is latest**;
  2. if tied, choose the **latest `import_batch_id` / `updated_at`**;
  3. if still tied, **show a conflict warning**.
- **v1 page behavior:** if overlapping rows exist, the page **shows both rows** (no auto-selection) until a future comparison / pricing engine is built.

### 4C.6 Deferred: `carrier_fee_types` / `carrier_rate_breakdowns` (NOT v1)

- **`carrier_fee_types` and `carrier_rate_breakdowns` are intentionally deferred** — **not part of v1.**
- **FCL / container quote cost breakdown** (itemized fee lines behind a single quote) will be supported **later** via these tables.
- **v1 keeps ALL rate rows in `carrier_rate_cards` only** (one flat row per rate; surcharges live in the `fuel_surcharge` / `customs_fee` / `doc_fee` columns, not in a breakdown table).

### 4C.7 FUTURE — Export Center → carrier-email round-trip (documentation only; NOT implemented)

> **This section documents a future workflow only. NO email automation, Gmail/Inbox parser, or Export Center is implemented now.** Today the Update Template is exported/downloaded manually and imported manually via the Carrier Rate Card page.

Planned future flow, reusing the **same Update Template rules** (§4C.3 / §4C.3A / §4C.4):

1. **Export Center** generates a **carrier-scoped Update Template** for a chosen carrier (that carrier's active rows only, each with its `rate_card_id`; route/method/structure marked locked; `unit_rate` / `effective_from` / `effective_to` cleared).
2. Export Center **emails the template to the carrier's contact address** (carrier-scoped — one carrier per file; never another carrier's rows).
3. The **carrier fills in** new prices / effective dates on the existing rows, and may **add new route/method rows** in the blank rows below (blank `rate_card_id`).
4. The carrier **replies by email with the completed template attached.**
5. A **future importer reads the email attachment automatically** and applies the **identical Update Template import rules**: existing rows (by `rate_card_id`) update only the allowed fields with locked-field edits ignored + reported; new rows are validated and created under the carrier scope; blank rows skipped; the same summary (`updated_existing_count` / `created_new_count` / `blank_skipped_count` / `rejected_count` / `locked_fields_ignored_count` / warnings / errors) is produced.

**Explicitly out of scope now:** email sending, Gmail/Inbox reading/parsing, attachment extraction, auto-trigger, and Export Center itself. These are future work; the carrier round-trip today is manual export → manual import.

### 4C.8 Import Job Framework adoption (canonical review workflow)

> **Carrier Rate import is the FIRST adopter of the platform [`IMPORT_JOB_FRAMEWORK_SPEC.md`](./IMPORT_JOB_FRAMEWORK_SPEC.md).** The framework — not a Carrier-specific popup — is the canonical review/apply workflow. **Import Job is a platform layer, not a Carrier feature.**

- **Canonical flow:** an Update / Master Template import creates an **Import Job** (`module = carrier_rate`, `job_type = update_template | master_template`, `table_name = carrier_rate_cards`) → **Validation** classifies each row (create / update / ignore) into `import_job_details` → the job appears as a **Task Card** (e.g. *"Carrier Import · DHL · 245 rows · 12 warnings · Waiting Review"*) → the user opens the **Review Page** (Top Summary + row-level warnings showing *Original → Imported → Recommended Action*) → **Approve** → **Apply** writes `carrier_rate_cards` → **History** retains the job.
- **Row rules map 1:1** to the framework: existing rows (has `rate_card_id`) = `update` (only `unit_rate` / `effective_from` / `effective_to` / `fuel_surcharge` / `customs_fee` / `doc_fee` / `status` / `note` editable; **locked-field change → Warning, default Keep Original, user may Override** — no longer silently discarded); new rows (blank `rate_card_id` + required values) = `create`; blank rows = `ignore`. Field-set details stay in §4C.3A; the record-key + editable/locked mapping is tabulated in `IMPORT_JOB_DATABASE_SPEC.md` §10.1.
- **Popup is summary only.** The **Review Page** is the primary workflow; a popup may show a quick count summary but is never where warnings are resolved or the import is approved.
- **Summary counts** returned by the current importer (`updated_existing_count` / `created_new_count` / `blank_skipped_count` / `rejected_count` / `locked_fields_ignored_count`) map onto the Import Job header counts (`updated_rows` / `created_rows` / `ignored_rows` / `error_rows` / `warning_rows`).
- **Migration note (spec-level):** the currently-implemented direct import + alert-summary (§4C.4) is an **interim** behavior. The **target** is the review-gated Import Job flow above; the one behavioral change on adoption is that locked-field edits become a **reviewable Warning with Keep-Original/Override** instead of being auto-ignored. No implementation in this spec.

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
| `carrier_rate_cards` → `carrier_rate_breakdowns` | `rate_card_id` | 1 → many — **FUTURE / deferred (not v1)**; FCL/container itemized cost breakdown (§4C.6) |
| `carriers` → `carrier_lead_times` | `carrier_id` | 1 → many |
| `carrier_lead_times` → Carrier Rate Card page | `carrier_id + origin_country + destination_country + shipping_method + last_mile_delivery` (blank `last_mile_delivery` → fall back to `… + shipping_method`) | **read for Lead Time display only** (§4C.2) |
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

When built, the engine will: pick the applicable `carrier_rate_cards` row (by carrier + origin/destination + marketplace + method + weight tier + validity window, per §4 precedence and the §4C.5 overlap tie-break), derive the billable quantity from `charge_type` (`weight` → actual / dim via `dim_divisor` / chargeable; `volume` → `cbm`; `container` → `20GP`/`40HQ`; `carton`; `shipment`) with the `min_box_weight` per-carton floor, compute freight from `unit_rate` × billable `charge_unit` (+ `min_charge` / `fuel_surcharge` / `customs_fee` / `doc_fee`), and write `estimated_*` onto `shipping_plans` / `shipments` (and `*_actual` onto `shipments` after invoice, §4B). **None of this is implemented now.** Until then, Cost Breakdown shows stored values or `--` placeholders.

---

## 8. Non-Goals

- **No** Carrier Price Engine / freight / duty / total-cost formula.
- **No** code, frontend, Apps Script, API, DB migration, or BigQuery.
- **No** change to Shipment / Execution Commit / Weekly Shipping Plan implementation.
- **No** `carrier_lead_times` definition (future ETA-planning work).

---

**Draft v1.0 — Carrier & Route Foundation Spec. Schema/relationship definition only; no pricing engine and no implementation is implied. Routing defaults are overridable by the Weekly Shipping Plan; Cost Breakdown stays a placeholder until the future Carrier Price Engine.**

**End of Document**
