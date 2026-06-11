# Database Relationship Map

**Status:** 🟡 Draft v1 — Database Relationship Specification (documentation only)
**Last Updated:** 2026-06-09
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md), `assets/specs/active/SKU_MASTER_FLOW.md`

> Documentation only. **No code changes. No DB schema changes. No implementation.** This document maps how tables relate; it does not define field-level schemas (see the respective spec/schema docs).

> **Marketplace naming note (accepted current live design — do NOT rename in this task):**
> - `marketplaces.marketplace` may contain a platform name such as `Amazon` / `Walmart` / `Shopify`.
> - `marketplace_display_name` is user-facing display text.
> - Some display names may include company-specific wording such as `KM Amazon`.
> - This document does **not** propose renaming or restructuring marketplace rows.

---

## 1. Purpose

This document maps **how database tables relate** across the Kitchen Mama supply chain system — the foreign-key and logical relationships that connect master data, marketplace/pricing, forecast, inventory, factory/procurement, shipping, carrier, document, and future ERP layers.

It is a **relationship map**, not a schema definition and not an implementation plan.

---

## 2. Entity Layers

| Layer | Tables (incl. future) |
|-------|------------------------|
| **Master Data Layer** | `sku_details`, `sku_handbook_summaries`, `product_features` |
| **Marketplace / Pricing Layer** | `marketplaces`, `marketplace_skus`, `pricing_list`, `pricing_change_log` |
| **Forecast Layer** | `fc_regular_forecast`, `fc_special_events`, `fc_target_rules` |
| **Inventory Layer** | `factory_stock`, `factory_stock_movements`, `warehouses`, `overseas_inventory_snapshot`, `overseas_inventory_movements`, *future* marketplace inventory snapshots (e.g. `amazon_inventory_snapshot`) |
| **Factory / Procurement Layer** | `purchase_orders`, `purchase_order_lines`, `production_schedule` |
| **Shipping / Logistics Layer** | `shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_events`, `shipment_routes` |
| **Carrier Layer** | `carriers`, `carrier_rate_cards`, `carrier_lead_times` |
| **Document / Export Layer** | `document_templates`, `generated_documents` |
| **Future ERP / Ownership Layer** | `sales_orders` *(future)*, `sales_order_lines` *(future)*, AR/AP/accounting *(future)* |

---

## 3. Master Data Layer

**Tables:** `sku_details`, `sku_handbook_summaries`, `product_features`

- `sku_details` is the **product master** and the source for `category` / `series` / carton info / **base price references** (selling_price, minimum_price, msrp).
- `sku_handbook_summaries` and `product_features` are knowledge/content tables keyed by SKU (or scope), used by SKU Handbook — not part of supply calculation.

| Relationship | Type |
|--------------|------|
| `sku_details.sku` ← `sku_handbook_summaries.sku` | 1 → many (logical) |
| `sku_details` ← `product_features` (scope: sku / series / category) | 1 → many (logical, scoped) |

> `sku_details` is referenced by `marketplace_skus`, `factory_stock`, `fc_regular_forecast`, etc. via `sku`.

---

## 4. Marketplace / Pricing Layer

**Tables:** `marketplaces`, `marketplace_skus`, `pricing_list`, `pricing_change_log`

```
marketplaces ──1:many──▶ marketplace_skus ──1:1──▶ pricing_list ──1:many──▶ pricing_change_log
```

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `marketplaces` → `marketplace_skus` | `marketplace_id` | 1 → many |
| `marketplace_skus` → `pricing_list` | `marketplace_sku_id` | 1 → 1 |
| `pricing_list` → `pricing_change_log` | `pricing_id` | 1 → many |

- `marketplace_skus` stores **site identity and operational settings** (site_sku, asin, status, replenishment_model, launch_date).
- `pricing_list` is the **pricing source of truth** (Regular / Minimum / MSRP / Currency, base + FX + effective).
- **`marketplace_skus` must NOT be treated as the final pricing source.**

**Company rule:**
- `company` on `marketplace_skus` is **required**.
- **`company + country + marketplace`** distinguishes operational ownership.
- **`country` alone is not enough** — e.g. US can include both `KM` and `ResUS`.

---

## 5. Forecast Layer

**Tables:** `fc_regular_forecast`, `fc_special_events`, `fc_target_rules`

| Relationship | Logical key |
|--------------|-------------|
| `fc_regular_forecast` → `marketplace_skus` | `company + country + marketplace + sku` |
| `fc_special_events` → `marketplace_skus` | `marketplace_id` and/or `company + country + marketplace + sku` |
| `fc_target_rules` → forecast | by **scope**: category / series / sku |

- **Target rules adjust Regular FC only** (`Target Adjusted Forecast = Regular Forecast × Target Rule %`, default 100%).
- **Special Event FC is independent and always 100%** (no target adjustment); event demand is pulled forward one month (see calculation rules doc §8).

---

## 6. Inventory Layer

**Tables:** `factory_stock`, `factory_stock_movements`, `warehouses`, `overseas_inventory_snapshot`, `overseas_inventory_movements`, *future* `amazon_inventory_snapshot` (and similar).

| Relationship | Key |
|--------------|-----|
| `factory_stock` → `sku_details` | `sku` |
| `factory_stock_movements` → `factory_stock` | logical: `sku + factory_name` |
| `overseas_inventory_snapshot` → `warehouses` | `warehouse_id` |
| `overseas_inventory_movements` → `warehouses` | `warehouse_id` (+ `sku`) |

- `warehouses` is the **warehouse master**.
- **Overseas inventory = warehouse-side inventory** (3PL / marketplace logistics), **not** factory stock.
- **Factory stock = production-side inventory** (at CN_YOUXIN / TW_SHENGYI).

**Warehouse ID convention:** `WH-{COMPANY}-{COUNTRY}-{TYPE}-{NAME}`

Examples:
- `WH-RESUS-US-3PL-WINIT`
- `WH-RESUS-US-3PL-AMZLGS`
- `WH-RESUS-US-RETURN-AMZLGS_LIKE_NEW`
- `WH-KM-US-3PL-AMZLGS`

---

## 7. Factory / Procurement Layer

**Tables:** `purchase_orders`, `purchase_order_lines`, `production_schedule`

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `purchase_orders` → `purchase_order_lines` | `purchase_order_id` | 1 → many |
| `purchase_order_lines` → `production_schedule` | `purchase_order_line_id` (if needed) | 1 → many |
| `purchase_order_lines` → `shipment_lines` | `purchase_order_line_id` | linkable |

- **ResTW is the procurement hub** (KM / ResUS route demand through ResTW).
- Factories **CN_YOUXIN** and **TW_SHENGYI** are **production resources, not company entities**.

---

## 8. Shipping / Logistics Layer

**Tables:** `shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_events`, `shipment_routes`

```
shipping_plans ──1:many──▶ shipping_plan_lines
       │ (approved → convert)
       ▼
shipments ──1:many──▶ shipment_lines
   ├──1:many──▶ shipment_events
   └──1:many──▶ shipment_routes
```

| Relationship | Key | Notes |
|--------------|-----|-------|
| `shipping_plans` → `shipping_plan_lines` | `shipping_plan_id` | 1 → many |
| approved `shipping_plan` → `shipments` | conversion | 1 → one or more |
| `shipments` → `shipment_lines` | `shipment_id` | 1 → many; actual shipped SKU lines |
| `shipment_lines` → `purchase_order_lines` | `purchase_order_line_id` | may reference |
| `shipments` → `sales_orders` | `sales_order_id` | **future** reference |
| `shipments` → `shipment_events` | `shipment_id` | actual tracking/timeline events |
| `shipments` → `shipment_routes` | `shipment_id` | planned/route waypoint structure |

- `shipments` stores the **formal execution snapshot** (header + lines copied at creation).
- **Shipping History** = read view over `shipments` + `shipment_lines`. **No separate Shipping History DB.**
- **On The Way** = visual/operational view over `shipments` + `shipment_lines` + `shipment_events` + `shipment_routes`. **No separate On The Way DB.**

---

## 9. Carrier Layer

**Tables:** `carriers`, `carrier_rate_cards`, `carrier_lead_times`

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `carriers` → `carrier_rate_cards` | `carrier_id` | 1 → many |
| `carriers` → `carrier_lead_times` | `carrier_id` | 1 → many |
| `shipments` → `carriers` | `carrier_id` | reference |
| `shipments` → `carrier_rate_cards` | `rate_card_id` | reference |

- `carrier_rate_cards` include `route_code` and `transit_days`.
- `carrier_lead_times` supports **ETA planning** (used by On The Way ETA buckets and shipment planning).

---

## 10. Document / Export Layer

**Tables:** `document_templates`, `generated_documents`

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `document_templates` → `generated_documents` | `template_id` | 1 → many |

- `generated_documents.related_entity_type` / `related_entity_id` can reference:
  - `shipment`
  - `purchase_order`
  - `sales_order` *(future)*
  - `report` *(future)*
- **Export Center / Document Center** is the future UI; **Template Management is a sub-tab, not the whole module.**

---

## 11. Future ERP / Ownership Layer

**Tables (future):** `sales_orders`, `sales_order_lines`, AR/AP/accounting.

- **Physical shipment flow and ownership flow are separate.**
- **Ownership model:** `Factory → ResTW → KM / ResUS / ResTW → Customer`
- **ResTW** is both **procurement hub** and **non-US operating entity**.
- **ResUS** handles **US Res marketplaces**.
- **KM** handles **Kitchen Mama brand operations**.
- **Full ERP accounting is future scope.**

```
Factory (CN_YOUXIN / TW_SHENGYI)
        ▼
ResTW (procurement hub / non-US operating entity)
        ▼
KM  /  ResUS  /  ResTW   (operating entities)
        ▼
Customer
```

---

## 12. Key Relationship Flow Diagram

```
sku_details
   ▼
marketplaces ──▶ marketplace_skus
                      ▼
                 pricing_list ──▶ pricing_change_log
                      ▼
   fc_regular_forecast / fc_special_events / fc_target_rules
                      ▼
   Inventory Replenishment  /  Request Order      ◀── factory_stock, overseas_inventory_snapshot, on-the-way
                      ▼
                shipping_plans ──▶ shipping_plan_lines
                      ▼ (approve → convert)
                  shipments
                      ▼
   shipment_lines  /  shipment_events  /  shipment_routes
                      ▼
              generated_documents

Procurement branch (links into shipment_lines):
   purchase_orders ──▶ purchase_order_lines ──▶ production_schedule
                                │
                                └──(purchase_order_line_id)──▶ shipment_lines
```

---

## 13. Page-to-Table Map

| Page | Primary Reads | Primary Writes |
|------|---------------|----------------|
| Inventory Replenishment | marketplace_skus, fc_regular_forecast, factory_stock, overseas_inventory_snapshot, shipments (on-the-way) | shipping_plans, shipping_plan_lines (on Submit Plan) |
| FC Summary | fc_regular_forecast, fc_special_events, fc_target_rules, marketplace_skus | fc_regular_forecast / events / rules (edits) |
| Factory Stock | factory_stock, sku_details (category/series join) | — (read; movements future) |
| Warehouse Management *(future)* | warehouses, overseas_inventory_snapshot | warehouses, overseas_inventory_movements |
| Shipping Plan | shipping_plans, shipping_plan_lines | shipping_plans status/approval |
| Formal Shipment | shipping_plans, shipping_plan_lines (snapshot source), carriers, carrier_rate_cards | shipments, shipment_lines |
| Shipment On The Way | shipments, shipment_lines, shipment_events, shipment_routes, carrier_lead_times | — (visualization) |
| Shipment History | shipments, shipment_lines | — (read) |
| Request Order / 下單系統 | fc_regular_forecast, marketplace_skus, factory_stock, overseas_inventory_snapshot, shipments (on-the-way) | future: purchase_orders, purchase_order_lines |
| Purchase Order | purchase_orders, purchase_order_lines, production_schedule | purchase_orders, purchase_order_lines |
| Carrier Management | carriers, carrier_rate_cards, carrier_lead_times | carriers, carrier_rate_cards, carrier_lead_times |
| Export / Document Center | document_templates, shipments / purchase_orders | generated_documents |
| Company Management | marketplaces (company values), marketplace_skus | marketplaces |
| Permission / Role Management *(future)* | role/permission tables *(future)* | role/permission tables *(future)* |

---

## 14. Persistence Rules

- **Calculation previews do not persist unless submitted.**
- **Shipping Allocation preview has no DB in MVP.**
- **`shipping_plans` persist only after Submit Plan.**
- **`shipments` persist only after explicit formal shipment creation.**
- **`generated_documents` persist after document generation.**

| Artifact | Persisted? | Trigger |
|----------|-----------|---------|
| Replenishment / order calculation | No | preview |
| Shipping Allocation preview | No (no DB in MVP) | preview |
| shipping_plans / lines | Yes | Submit Plan |
| shipments / shipment_lines | Yes (snapshot) | explicit formal shipment creation |
| generated_documents | Yes | document generation |

---

## 15. Open Items

- `sales_orders` / `sales_order_lines` *(future)*
- Permission / role model
- Exact warehouse management UI
- Shipment document field templates
- Carton number automation (Amazon / carrier docs)
- Final Inventory Projection Engine implementation
- Future ERP accounting layer

---

## Notes / Cross-document Consistency

- **Field-name divergence (carry-over):** `marketplace_skus` operational status is referred to as `marketplace_sku_status` in SYSTEM_ROADMAP / API, but as `status` in `SKU_MASTER_FLOW.md` §7. This map uses "status (operational)" generically; the naming reconciliation remains an open decision (not resolved here).
- **Company enum:** values are `KM` / `ResUS` / `ResTW` (DB enum); user-facing labels may read "Kitchen Mama" / "Res US" / "Res TW". Marketplace display names may include company wording (e.g. `KM Amazon`) — accepted as current design.

---

**Draft v1 Database Relationship Specification — subject to revision. Documentation only; no code or DB changes are implied by this document.**

**End of Document**
