# SKU Details — Logistics Schema & Display Spec

**Status:** 🟡 Draft v1.0 — `sku_details` logistics columns + SKU Details display rules (Spec + frontend/API mapping; NO DB migration script — sheet headers already updated; NO calculation engine)
**Last Updated:** 2026-06-30
**Maintained By:** Development Team
**Authority / context (read, not overridden):** [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (table relationships), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) (where CBM / weight will be computed).

> **Purpose.** Documents the **`sku_details` logistics columns** (split item / package / carton dimensions + units, weights + units, customs/price + units), the **secondary item-size rule** (`item_*_2`), and the **SKU Details UI display rules**. It also records **which columns the future Shipment CBM / weight calculation will use**. No DB migration is required (the Google Sheet headers are already updated); no calculation engine is implemented here.

> **Changelog:**
> - **Draft v1.0 (2026-06-30)** — Created. Synced the split logistics columns; defined the secondary item-size (`item_*_2`) display rule; defined SKU Details display rules; recorded the future Shipment CBM/weight column basis. Frontend (`sku-details.js`) + API normalizer (`operation-system-db-api.js`) updated to read the new columns (legacy combined columns kept as fallback).

---

## 1. `sku_details` Columns (current live headers)

| Group | Columns |
|-------|---------|
| **Identity / content** | `sku`, `product_name`, `category`, `series`, `lifecycle`, `image_url`, `gs1_code`, `gs1_type`, `amz_asin` |
| **Item size** | `item_length`, `item_width`, `item_height`, `item_length_2`, `item_width_2`, `item_height_2`, `item_dimension_unit`, `item_weight`, `item_weight_unit` |
| **Package size** | `package_length`, `package_width`, `package_height`, `package_dimension_unit`, `package_weight`, `package_weight_unit` |
| **Carton size** | `carton_length`, `carton_width`, `carton_height`, `carton_dimension_unit`, `carton_weight`, `carton_weight_unit`, `units_per_carton` |
| **Customs / price** | `hscode`, `declared_value`, `declared_value_unit`, `minimum_price`, `minimum_price_unit`, `msrp`, `msrp_unit`, `selling_price`, `selling_unit` |
| **Meta** | `pm`, `created_at`, `updated_at` |

- **Dimensions are split** into `*_length` / `*_width` / `*_height` plus a per-group `*_dimension_unit`. This supersedes the legacy single `item_dimensions` / `package_dimensions` / `carton_dimensions` text columns. **The API normalizer still reads the legacy columns as a fallback** when the split columns are empty (backward compatibility).
- **Units are never hard-coded.** Each group carries its own unit: `*_dimension_unit` (default `cm`), `*_weight_unit` (default `kg`), and each price carries `*_unit` / `selling_unit`. Defaults are applied only when the column is blank; stored unit values are authoritative.

---

## 2. Secondary Item Size — `item_length_2` / `item_width_2` / `item_height_2`

A SKU may contain **two product size components** (e.g. a large + small combo). The second size is captured in the `*_2` columns.

- **Primary item size:** `item_length` × `item_width` × `item_height`.
- **Secondary item size:** `item_length_2` × `item_width_2` × `item_height_2`.
- The `*_2` columns are **optional and may be blank**.
- **`item_dimension_unit` applies to BOTH** the primary and secondary item size (there is no separate `*_2` unit).
- **The secondary size is product-content display only.** It **must NOT** participate in carton CBM or any logistics calculation. Logistics uses `package_*` / `carton_*` only (§4).

---

## 3. SKU Details UI Display Rules

The SKU Details page is a table with a global **CM/KG ↔ IN/LB** unit toggle. Dimension cells contain a numeric `L x W x H` string (the unit is shown in the column header / by the toggle); price cells show the unit inline (prices have no metric/imperial toggle).

**Item Dimensions** (single cell, combined `A + B {unit}` form):
- No secondary: `{item_length} × {item_width} × {item_height} {item_dimension_unit}`
  - e.g. `29.4 × 4.8 × 1.9 cm`
- With secondary: `{item_length} × {item_width} × {item_height} + {item_length_2} × {item_width_2} × {item_height_2} {item_dimension_unit}`
  - e.g. `29.4 × 4.8 × 1.9 + 20.5 × 3.3 × 1.3 cm`
- If all `*_2` are blank → only the primary size is shown.
- **One cell only** — never two separate dimension cards/columns. This is a **display rule** (no new column).
- The shared `item_dimension_unit` applies to **both** groups and is shown **inline**; each numeric group still converts under the CM/IN toggle and the inline unit suffix flips cm↔in with it.

**Package Dimensions:** `{package_length} x {package_width} x {package_height}` (`package_dimension_unit`).
**Carton Dimensions:** `{carton_length} x {carton_width} x {carton_height}` (`carton_dimension_unit`).

**Weight:** `item_weight` / `package_weight` / `carton_weight` (each with its `*_weight_unit`; the table conveys unit via header / toggle).

**Price (unit shown inline):**
- Declared Value: `{declared_value} {declared_value_unit}`
- Minimum Price: `{minimum_price} {minimum_price_unit}`
- MSRP: `{msrp} {msrp_unit}`
- Selling Price: `{selling_price} {selling_unit}`

> **Toggle compatibility:** each dimension line is rendered as a numeric span so the existing CM/IN conversion still works per line. The secondary line converts independently of the primary.

---

## 4. Future Shipment CBM / Weight basis (calculation NOT implemented here)

When the Shipment CBM / weight calculation is built (`SHIPMENT_CENTER_SPEC.md` §15.3), it will use the **carton** dimensions and the per-row units — **never the item `*_2` size**:

```
carton_cbm = carton_length * carton_width * carton_height / 1,000,000      (when carton_dimension_unit = cm)
shipment_lines.cbm          = carton_qty * carton_cbm
shipment_lines.gross_weight = carton_qty * carton_weight
shipment_lines.net_weight   = qty * item_weight
```

- **CBM uses carton dimensions only.** `item_length_2` / `item_width_2` / `item_height_2` do **not** participate.
- **Units are read, not hard-coded:** dimension unit from `carton_dimension_unit` (default `cm`), weight unit from `carton_weight_unit` / `item_weight_unit` (default `kg`). A non-cm / non-kg unit requires conversion (deferred to the engine).
- This section is **specification only** — no CBM/weight is computed in this task.

---

## 5. Non-Goals

- **No** DB migration script (sheet headers already updated).
- **No** Shipment CBM / weight actual calculation, **no** Carrier / Duty engine, **no** Factory Stock deduction, **no** Request Order / PO, **no** Runtime Planning Engine.
- **No** new table; **no** historical data deletion; **no** Decision Snapshot recalculation.

---

**Draft v1.0 — SKU Details Logistics Schema & Display Spec. Schema/display/mapping only; logistics CBM/weight calculation is specified for the future Shipment engine and not implemented here.**

**End of Document**
