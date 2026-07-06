# Tax & Referral Rates — Reference Master Spec

**Status:** 🟡 Draft v1 — **Spec only.** NO code, NO frontend, NO Apps Script, NO API, NO DB migration. The actual DB is **not** modified. Implementation is **pending**; the user updates the real DB after this MD + implementation plan are ready.
**Last Updated:** 2026-07-06
**Maintained By:** Development Team
**Related:** [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md) (SKU Domain v2.0 — Layer 4), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §4B, [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md), [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md) (future cost/duty consumers).

> **Purpose.** `tax_referral_rates` is the **Reference Master** for country-level **tax, referral and duty** information. It is **Layer 4** of the SKU Master Domain (SKU_MASTER_AND_REGIONAL_DETAILS_SPEC v2.0). It is the **single source of truth** for HS Code / Duty / VAT / Referral / Declared Value, and the **future source** for the Cost Engine, Duty Engine, Shipment Cost, Export, and Compliance / AI cost recommendation. **This spec defines schema + relationships only — no engine, no calculation, no code, no DB migration.**

> **Table name note.** The reference table is **`tax_referral_rates`** (as used in the relationship diagrams); its primary key is **`tax_rate_id`**. This spec file is `TAX_AND_REFERRAL_RATES_SPEC.md`.

---

## 1. Purpose & positioning

- **Reference Master** (master/reference data — not a Decision Layer, not transactional).
- **Single source of truth** for: **HS Code, Duty, Extra Tax, VAT, Port Tax, Referral Fee, Declared Value** (and, for now, **`country_of_origin`**).
- **Future reference source** for:
  - **Cost Engine** — landed-cost / margin computation.
  - **Duty Engine** — import duty + extra tax computation.
  - **Shipment Cost** — customs / duty components of a shipment estimate.
  - **Export / Compliance** — declared value + HS code on export documents.
  - **Future AI cost recommendation.**
- **No engine, formula, or calculation is defined or implemented here.** Downstream consumers read this table when they are built.

---

## 2. Schema — `tax_referral_rates`

| Column | Note |
|--------|------|
| `tax_rate_id` | PK (system generated) |
| `series` | **join key** — matched from `sku_details.series` (rates are maintained per product series) |
| `duty_country` | the destination / duty jurisdiction the rate applies to |
| `country_of_origin` | manufacturing origin country (**intentionally kept here for now — NOT moved to `sku_details`**) |
| `hscode` | HS / tariff classification code |
| `duty_rate` | base import duty rate |
| `extra_tax_rate` | additional / anti-dumping / special tax rate |
| `vat` | value-added tax rate |
| `port_tax` | port / harbor / handling tax |
| `referral_fee_rate` | marketplace referral fee rate |
| `declared_value` | customs declared value |
| `declared_currency` | currency for `declared_value` |
| `effective_from` | effective start (inclusive) |
| `effective_to` | effective end (inclusive; blank = open-ended) |
| `note` | free text |
| `created_at` | system |
| `updated_at` | system |

- **Match grain:** `series + duty_country` (+ effective-date window) — a series' rate for a given duty jurisdiction and period.
- **Effective-date versioning:** a new rate period is a **new row**; overlapping windows are allowed (a future engine picks the applicable row by date; that selection is **not** defined here).

---

## 3. Relationship

```
sku_details
    │  (series)
    ▼
tax_referral_rates
    │
    ├─► Duty
    ├─► Referral
    ├─► VAT
    ├─► Declared Value
    ├─► Cost Engine            (future)
    ├─► Shipment Cost          (future)
    ├─► Export                 (future)
    └─► Future AI Cost Recommendation
```

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `sku_details` → `tax_referral_rates` | `series` | 1 → many (per `duty_country` × effective period) |

- Rates are **series-level**, not SKU-level — every SKU in a series inherits its series' tax/referral/duty reference.
- Consumers join `sku_details.series → tax_referral_rates.series` (then filter by `duty_country` + effective date).

---

## 4. Source-of-truth rule (do not duplicate)

**HS Code · Duty · VAT · Referral · Declared Value must ONLY exist inside `tax_referral_rates`.**

- **Do NOT duplicate** these values in `sku_details`, `sku_regional_details`, or `marketplace_skus`.
- `sku_regional_details` (SKU Domain Layer 2) **no longer holds** `hscode` / `duty_rate` / `extra_duty_rate` / `vat` / `port_tax` / `referral_fee_rate` / `declared_value` / `declared_currency` — they were relocated here (SKU_MASTER_AND_REGIONAL_DETAILS_SPEC v2.0 §4).
- `sku_details` **no longer holds** `hscode` / `declared_value` (deprecated / read-fallback only during migration).

---

## 5. `country_of_origin` placement (explicit)

- `country_of_origin` **is part of this reference table for now.**
- **Do NOT move `country_of_origin` into `sku_details` yet.** The current architecture intentionally keeps it inside `tax_referral_rates`. (Revisit only in a future explicit design.)

---

## 6. Non-Goals / Deferred
- No Cost Engine, Duty Engine, Shipment-cost engine, or any calculation / formula.
- No code, frontend, Apps Script, API, DB migration, or live DB change.
- Effective-date selection / tie-break logic is deferred to the future engine that consumes this table.
- Migration (create the table; relocate `hscode` / duty / `declared_value` from `sku_details` / `sku_regional_details`) is a **future user-run step** after this MD + implementation are ready.

---

**Draft v1 — Spec only. Reference Master schema/relationship definition; no engine and no implementation is implied. The actual DB will be updated by the user after the MD and implementation are ready.**

**End of Document**
