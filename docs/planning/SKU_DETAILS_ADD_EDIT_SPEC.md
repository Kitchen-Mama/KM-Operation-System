# SKU Details — Add / Edit Unified PM Workspace Spec

**Status:** 🟡 Draft v2.0 — **Spec only.** NO code, NO Apps Script, NO API, NO DB migration, NO UI change. Nothing here is implemented. This document is the **authority for the Add/Edit SKU UI, validation, and Runtime Mapping**; it is **subordinate to** the canonical data authority (`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`).
**Last Updated:** 2026-07-20
**Maintained By:** Development Team
**Related / Authority chain:**
- [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md) — **Product + Regional business-data authority.**
- [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §3/§4/§4A/§6/§7.7 — **existing schema authority.**
- [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) — **Tax / HS Code / Declared Value authority.**
- [`SKU_REGIONAL_DETAILS_UI_UX_SPEC.md`](./SKU_REGIONAL_DETAILS_UI_UX_SPEC.md) — **Regional page visual authority.**
- [`SKU_DETAILS_LOGISTICS_SPEC.md`](./SKU_DETAILS_LOGISTICS_SPEC.md), [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md) §4.5 (Global Logistics Enums), [`TEMPLATE_UI_STANDARD_SPEC.md`](./TEMPLATE_UI_STANDARD_SPEC.md), [`UI_COMPONENT_GUIDELINES.md`](./UI_COMPONENT_GUIDELINES.md).

> **v2.0 changelog (2026-07-20, spec only).** Rewrote the dialog from the earlier 8-tab draft (General/Attributes/Logistics/Pricing/Marketplace/Regional/Supplier/Images) into a **unified four-tab Add/Edit PM Workspace** (Basic / Sales / Supplier / Logs). **Corrected the retired `battery_type` / `magnet_type` enums** (`none/built_in/removable/lithium/unknown`, `none/magnetic/unknown`) to the **canonical Global Logistics Enums** (§7 Group B). Added full Runtime Mapping (§17), Factory Stock baseline honesty (§15), and Open Decisions (§21). This does **not** create a second SSOT — business-data meaning stays owned by `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`.

---

## 1. Purpose

Finalize **one unified Add / Edit SKU interface** owned by Product Management (PM). Add SKU and Edit SKU share the **same form component, tabs, field components, validation definitions, canonical enums, and payload model**. Only mode-specific behavior differs (§5). The dialog maintains the **Product Master** (`sku_details`) and nothing outside it.

---

## 2. Authority

| Document | Authority |
|---|---|
| `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` | Product + Regional **business data** (fields, meaning, sync, SSOT ownership). |
| **This document** | Add/Edit SKU **UI, validation, Runtime Mapping**. |
| `DATABASE_RELATIONSHIP_MAP.md` | Existing **schema**. |
| `TAX_AND_REFERRAL_RATES_SPEC.md` | **Tax / HS Code / Declared Value**. |
| `SKU_REGIONAL_DETAILS_UI_UX_SPEC.md` | Regional page **visuals**. |

Where this UI spec and a data-authority spec disagree on *what a field means or which table owns it*, the data-authority spec wins. This document decides only *how* the Add/Edit surface arranges canonical data and *how* the runtime should create/update the master row. **No second SSOT is created.**

---

## 3. PM Workspace Boundary

**SKU Details = Product Management Workspace.** It owns **product-intrinsic** information: SKU identity, lifecycle, product names (EN/CN), series, category, GS1, material, product use, battery type, magnet type, product/package/carton dimensions + weights, master carton info, and **brand baseline commercial references** (`minimum_price` / `msrp` / `selling_price` / `base_currency`).

**SKU Details MUST NOT absorb** (owned by Regional / marketplace / pricing / tax / supplier / audit domains):
- `site_sku`, `marketplace_product_id` / ASIN, regional `product_url`
- regional packaging regulations, regional language / manual / label rules
- `marketplace_sku_status`, `launch_date`, `replenishment_model`, `fulfillment_model` (marketplace operational)
- live marketplace pricing (`pricing_list`)
- country-specific tax rows (`tax_referral_rates`)
- supplier relationships (until the supplier model is finalized — §6)
- fabricated audit history (§10)

**SKU Regional Details** (`sku_regional_details`) owns the Company / Country / Marketplace regional master; see `SKU_REGIONAL_DETAILS_UI_UX_SPEC.md`.

---

## 4. Unified Add / Edit Architecture

One canonical form: **`SkuMasterForm`** with `mode ∈ { add, edit }`. **Do not build two forms** and **do not create separate Add vs Edit field definitions.** The single field set, validation set, enum set, and payload model are shared; mode only changes the behaviors in §5.

- The UI may reuse the **existing Edit SKU modal surface** (`#sku-edit-modal-overlay`), **reorganized into the four tabs** of §6. It must not spawn a second modal or a second data-loading path.
- The form reads options through a **single enum accessor** (§7) so the source can later move from front-end constants to DB option lists without touching field logic.

---

## 5. Mode Differences

| Behavior | Add | Edit |
|---|---|---|
| `sku` field | **Editable** until create | **Read-only** (immutable identity) |
| Title | `Add SKU` | `Edit SKU — {SKU}` |
| Primary action | `Create SKU` | `Save Changes` |
| Existing values | Blank / defaults | Load current `sku_details` |
| Factory Stock baseline | **None from create itself** — baseline is ensured only when `lifecycle` transitions into **`Running in the Market`** (§15). Add that sets lifecycle = Running triggers the idempotent ensure. | **Never** reset stock; transition into Running repeats the idempotent ensure |
| HS Code & Tax Rates | **Disabled** until SKU/Series exists | **Available** |
| Regional Details | Available **after** create (navigation, not a write) | Navigation available |
| Logs | New-record empty state | Metadata display (§10) |

---

## 6. Four-Tab Information Architecture

Tab order (fixed): **1. Basic Information · 2. Sales Information · 3. Supplier Information · 4. Logs.**

Bilingual labels (if consistent with the existing system): `基礎資訊 / Basic Information`, `銷售資訊 / Sales Information`, `供應商資訊 / Supplier Information`, `日誌 / Logs`.

V1 implementation scope per tab:

| Tab | V1 status |
|---|---|
| Basic Information | **Active / editable** |
| Sales Information | **Active / editable** (Master baseline commercial fields only) |
| Supplier Information | **Future placeholder / read-only boundary** (§9) |
| Logs | **Current metadata only** (§10); detailed audit future |

**Tab behavior (spec):**
- **Active state:** one tab active at a time; active tab visually distinct (not color-only — §19).
- **Keyboard:** `role="tablist"`; Left/Right (and Home/End) move between tabs; `aria-selected` tracks the active tab; each panel `role="tabpanel"`.
- **Error indicator:** a tab with a validation error shows an inline text/icon badge (`Error`), not color alone (§8, §19).
- **Read-only / future indicator:** Supplier shows `Future`; Logs shows `Read-only`.
- **Tab switching preserves entered values** — switching tabs never clears fields (state lives in the shared form model).
- **Sticky footer** (§11) stays visible across all tabs; the primary action is never hidden below scrolling content.
- **Mobile / narrow:** tabs collapse to a horizontally scrollable/stacked tab strip; dimension groups reflow to single-column (§19); footer stays pinned.

---

## 7. Basic Information Tab

### Group A — Product Identity
`sku`, `lifecycle` (displayed as **Status**), `product_name`, `product_name_cn`, `series`, `category`, `gs1_code`, `gs1_type`.

Rules:
- `sku` editable **only in Add**; **read-only in Edit** (immutable identity / match key).
- UI label may be **Status**, but the DB/API field is the existing canonical **`lifecycle`**. **Do not create a second status column.**
- `series` / `category` use **existing canonical values** (data-derived distinct values from `sku_details`, plus free-add in v1 — future `option_lists`). **Do not silently create new labels.** **UI (implemented 2026-07-21):** accessible **creatable comboboxes** — distinct existing values (trimmed, de-duped case-insensitively, natural sort) as options + `＋ Add new …: {typed}`; keyboard Arrow/Enter/Escape; a new value persists **only** through the normal `sku_details` Save and appears in options after the next cache refresh (no Series/Category master table).

### Group B — Product Attributes
`material`, `product_use`, `battery_type`, `magnet_type`.

- **`battery_type` — canonical Global Logistics Enum** (`CARRIER_AND_ROUTE_SPEC.md` §4.5, verified). **Selectable choices (2026-07-21, §E simplification): `no_battery` / `alkaline_battery` / `lithium_battery`.** `rechargeable_lithium` is **RETIRED from selection** but remains a readable **Legacy** value: it is preserved verbatim on save unless the user explicitly changes Battery Type, is never bulk-migrated, and — if the user does edit the field — a current canonical choice must be selected. Document `HAS_BATTERY`/`LINE_HAS_BATTERY` continue to treat `rechargeable_lithium` (and verified legacy battery labels) as **TRUE**. Help text: *“Battery Type refers to the battery built into or supplied with the product, not a battery type the customer must purchase separately.”* A product requiring AAA batteries but shipped without them stays `no_battery`.
- **`magnet_type` — REAL Boolean (finalized 2026-07-21; supersedes the earlier `no_magnet`/`magnetic` enum).** UI = **Contains Magnet** with choices **Yes → `true`**, **No → `false`**; the payload and the DB cell are an actual Boolean (never `"magnetic"`/`"no_magnet"`/`"Yes"`/`"No"`/`"TRUE"`/`"FALSE"` strings). Legacy `magnetic`/`no_magnet`/`TRUE`/`FALSE` are **read-compatibility inputs only**, normalized for display and rewritten to canonical Boolean when the SKU is next updated (no bulk migration; explicit token classification — never `Boolean(value)`). `battery_type` **remains a semantic enum** (unchanged).
- **RETIRED values (`false`/`true`/`none`/`built_in`/`removable`/`lithium`/`unknown`) MUST NOT be offered as current canonical choices.** Legacy stored values may be **read and normalized** only per the existing API normalizer (front-end `_skuBoolDisplay` maps false/none/blank→No, true→Yes, other→original text — display only; the editor must not re-introduce retired values into dropdowns).
- `material` and `product_use` use **canonical English values** in the **existing free-text columns** (no new column/table). **UI (implemented 2026-07-21):** both are **tag/chip inputs with preset multi-select + creatable custom** (one shared component) — a suggestion dropdown offers **UI-default presets** (Material: ABS Plastic / Stainless Steel / Aluminum / Silicone / PP / PC / TPR / Rubber / Glass / Ceramic / Wood / Paper / Cardboard / Other; Product Use: Home Kitchen / Restaurant / Commercial Use / Outdoor / Travel / Gift / Office / Pantry / Hospitality / Other) plus a `＋ Add new …: {typed}` custom row; type-to-filter; Enter/comma adds; per-chip remove; Backspace-on-empty removes the last; exact duplicates rejected; order preserved. **Presets are UI defaults only — never a DB row/master table.** Selecting `Other` does not block adding a descriptive custom tag.
- **Serialization — canonical decision (2026-07-21): safe reversible `" + "` delimiter.** Chips serialize to a `" + "`-joined string (e.g. `ABS Plastic + Stainless Steel Blade`). On load, a value already using `" + "` splits into clean chips; **any other non-empty value (including a bare-underscore legacy string such as `Stainless_Steel_ABS`) loads as ONE preserved chip** and is written back **verbatim unless the user edits it** — ambiguous legacy data is never mis-split. This round-trips losslessly and preserves spaces. The earlier "multi-value underscore" note is superseded for the UI serializer; the column type (free text) is unchanged.

### Group C — Item Dimensions (presentation grouping only)
- **Item Dimensions:** `item_length` × `item_width` × `item_height` + `item_dimension_unit`.
- **Item Weight:** `item_weight` + `item_weight_unit`.
- Optional **secondary item size** `item_length_2` / `item_width_2` / `item_height_2` — display/content only, **not used in carton CBM** (`SKU_DETAILS_LOGISTICS_SPEC.md` §2).

### Group D — Package Dimensions
- **Package Dimensions:** `package_length` × `package_width` × `package_height` + `package_dimension_unit`.
- **Package Weight:** `package_weight` + `package_weight_unit`.

### Group E — Carton / Master Packaging
- `units_per_carton`.
- **Carton dimensions/weights (confirmed present in `sku_details`):** `carton_length`, `carton_width`, `carton_height`, `carton_dimension_unit`, `carton_weight`, `carton_weight_unit`.

> The `L × W × H` layout is **presentation only** — it maps to the separate existing `*_length` / `*_width` / `*_height` DB columns. **Do not create a combined dimension DB column.** Do not add any field solely because it looks desirable in the UI.

### Open item — `pm`
The current runtime renders `pm` with the label `負責PM` (implying a responsible Product Manager). Per this task, **`pm` is classified as an OPEN DECISION — canonical field meaning/source not confirmed** (candidate meanings such as *Product Manager* or *Packaging Method* must not be finalized without user confirmation). The field already exists in `sku_details` and in the current editor; **no DB field is added or renamed in this task.** See §21.

---

## 8. Sales Information Tab

**Master / brand baseline commercial references only** (exact `sku_details` fields): `minimum_price`, `msrp`, `selling_price`, `base_currency`.

Persistent notice (required):
> **These are brand baseline / reference prices. Live marketplace prices are maintained in Pricing List.**

**MUST NOT appear on this tab** (Regional / marketplace / pricing): `site_sku`, `marketplace_product_id` / ASIN, `marketplace`, `country`, company/site identity, `product_url`, `marketplace_sku_status`, `launch_date`, `replenishment_model`, `fulfillment_model`, live marketplace regular price. Those belong to `sku_regional_details` / `marketplace_skus` / `pricing_list`.

**Regional Navigation Block** (navigation only — **never a Regional write**):
- **Edit mode:** `Regional Marketplace Information` → **[View Regional Details]** (opens the Regional page/workspace for this SKU).
- **Add mode (before create):** *"Regional marketplace information can be added after the Master SKU is created."*

**Tax & Customs Reference Block** (reference/navigation only):
- **Never stored in `sku_details`:** `hscode`, `country_of_origin`, `duty_country`, `declared_value`, `declared_currency`, duty/VAT/referral/port tax rates — all owned by `tax_referral_rates` (§16).
- **Edit mode:** `Tax & Customs Reference` · `Series: {series}` · **[HS Code & Tax Rates]** (opens the existing Series-scoped tax subpage).
- **Add mode (before create):** *"Create the Master SKU before adding Series/Country tax rates."*
- **Route display convention (unchanged):** `country_of_origin → duty_country` (e.g. `CN → AU`), Unicode arrow. **Do not change Tax DB mappings.**

---

## 9. Supplier Information Tab

**V1 status: FUTURE / NOT IMPLEMENTED.** **Do not add `supplier_name` or any supplier field to `sku_details`.**

Documented future relationship concept (conceptual only — no DB/Runtime created here):
```
Supplier Master  →  SKU–Supplier Assignment  →  Master SKU
```
Potential future attributes (conceptual): `supplier_id`, `supplier_item_no`, primary/backup supplier, MOQ, unit cost, currency, production lead time, factory warehouse, effective dates, status.

**V1 UI state:**
> **Supplier Information** — *"Supplier assignment is not available yet. It will be managed through Supplier Master and SKU–Supplier relationships."*

**Mapping finding (existing planned source, NOT adopted):** `DATABASE_RELATIONSHIP_MAP.md` §7.7 already defines a **planned, spec-only** `factory_price_list` table carrying `supplier_id` / `supplier_name` / `factory_id` / `unit_cost` / `moq` / `lead_time_days` / effective dates / status, with `factory_price_list.supplier_id` → a **future `suppliers` master**. It also states the **sensitivity boundary**: `sku_details` MUST stay product/marketing-facing and **MUST NOT store sensitive factory cost/source fields**. This task **does not adopt, create, or modify** `factory_price_list` or a `suppliers` table — it is reported as the likely future home for Supplier Information.

---

## 10. Logs Tab

**Distinguish Metadata from Audit History.** V1 shows **only fields that actually exist** on `sku_details`:
- `created_at`, `updated_at` — **verified present** (set by `handleUpsertSkuDetail_`).
- `created_by`, `updated_by` — **NOT present** on `sku_details` / not written by the upsert handler. → show **"Change author is not tracked yet."**

Detailed change-history empty state:
> **"Detailed change history is not available yet."**

**Do not fabricate** user / actor / role / action / old value / new value / note / history rows.

**Future shared Audit concept (conceptual only — not created here):**
```
audit_logs: audit_log_id, entity_type, entity_id, action, field_name,
            old_value, new_value, note, actor_id, actor_role, source, created_at
```
Audit must eventually be a **shared, cross-module** system — **not** a SKU-only isolated log. No table/schema is added in this task.

---

## 11. Field-to-DB Mapping

All targets are **existing `sku_details` columns** (`DATABASE_RELATIONSHIP_MAP.md` §3; runtime allowlist `SKU_DETAILS_UPSERT_FIELDS_`). No new columns.

| Tab · Group | UI field | `sku_details` column | Notes |
|---|---|---|---|
| Basic · A | SKU | `sku` | match key; editable only in Add |
| Basic · A | Status | `lifecycle` | label "Status"; canonical enum `VALID_LIFECYCLES_` |
| Basic · A | Product Name | `product_name` | |
| Basic · A | Product Name CN | `product_name_cn` | |
| Basic · A | Series | `series` | canonical/data-derived; also tax key |
| Basic · A | Category | `category` | canonical/data-derived |
| Basic · A | GS1 Code | `gs1_code` | |
| Basic · A | GS1 Type | `gs1_type` | enum `UPC`/`EAN`/`GTIN` |
| Basic · B | Material | `material` | tag input → `" + "`-joined free text; legacy value preserved as 1 chip (§7 B) |
| Basic · B | Product Use | `product_use` | tag input → `" + "`-joined free text (customs-facing); legacy value preserved as 1 chip |
| Basic · B | Battery Type | `battery_type` | Global Logistics Enum (§7 B) |
| Basic · B | Contains Magnet | `magnet_type` | **Boolean** — Yes→`true` / No→`false` (§7 B); legacy magnetic/no_magnet read-compat |
| Basic · C | Item L/W/H | `item_length`, `item_width`, `item_height` | + `item_dimension_unit` |
| Basic · C | Item Wt | `item_weight` | + `item_weight_unit` |
| Basic · C | Item L/W/H (2nd) | `item_length_2`, `item_width_2`, `item_height_2` | optional; display only, not CBM |
| Basic · D | Package L/W/H | `package_length`, `package_width`, `package_height` | + `package_dimension_unit` |
| Basic · D | Package Wt | `package_weight` | + `package_weight_unit` |
| Basic · E | Carton L/W/H | `carton_length`, `carton_width`, `carton_height` | + `carton_dimension_unit` |
| Basic · E | Carton Wt | `carton_weight` | + `carton_weight_unit` |
| Basic · E | Units / Carton | `units_per_carton` | positive integer |
| Basic · (open) | PM | `pm` | **OPEN DECISION** — meaning unconfirmed (§21) |
| Sales | Minimum Price | `minimum_price` | brand baseline |
| Sales | MSRP | `msrp` | brand baseline |
| Sales | Selling Price | `selling_price` | brand baseline |
| Sales | Base Currency | `base_currency` | single currency for the three baseline prices |
| Sales | (image) | `image_url` | present in allowlist; image management deferred (§14) |
| Logs | Created At | `created_at` | system |
| Logs | Updated At | `updated_at` | system |

**Deprecated / never on `sku_details` (do not surface as editable):** `hscode`, `declared_value`, `declared_value_unit` (→ `tax_referral_rates`); `minimum_price_unit`, `msrp_unit`, `selling_unit` (→ `base_currency`); `amz_asin` / `marketplace_product_id` (→ Regional / `marketplace_skus`).

---

## 12. Validation

Per-tab status chips (text + icon, never color-only — §19): **Complete · Error · Read-only/Future.** Example:
```
Basic Information    Error
Sales Information    Complete
Supplier Information Future
Logs                 Read-only
```

**Create/Save validation behavior:**
1. Validate all **active editable** tabs (Basic, Sales).
2. **Do not validate** future/read-only tabs (Supplier, Logs).
3. Show an **error summary**.
4. **Switch to the first tab** containing an error.
5. **Focus the first invalid field.**
6. **Preserve entered values** when switching tabs.
7. **Prevent duplicate submission** (disable primary action while a request is in flight).

**Validation rules — classified (do not invent required-field rules):**

| Rule | Class |
|---|---|
| `sku` non-empty (Add) | **Existing runtime** — `handleUpsertSkuDetail_` rejects missing `sku` (`{success:false,error:'Missing sku'}`). |
| Second item-dimension group all-or-nothing | **Existing spec validation** (prior draft §4). |
| Dimensions > 0; weights > 0; `units_per_carton` ≥ 1 (integer); baseline prices ≥ 0; `*_unit` + `base_currency` non-empty | **Existing spec validation** (prior draft §4) — front-end level; **not enforced by the backend upsert** (backend writes allowlisted values as-is). |
| Lifecycle ∈ `VALID_LIFECYCLES_` | **Existing runtime** enum (`00_config.gs`). |
| **`sku` uniqueness on Add (reject if the SKU already exists)** | **PROPOSED — requires business approval + runtime work.** The current `handleUpsertSkuDetail_` is an **upsert**: Add on an existing SKU would **silently update** it, not reject. A duplicate-guard is **not implemented** (§17, §21). |
| Required-field enforcement at the backend | **PROPOSED** — backend currently enforces only `sku` presence; other "required" rules are front-end only. |

---

## 13. Add SKU Business Flow

Canonical V1 target flow:
```
Open Add SKU (mode=add, sku editable)
  → Enter Basic Information
  → Enter Master Sales Information
  → Validate active tabs (§12)
  → [PROPOSED] reject if sku already exists (duplicate guard — not in current runtime)
  → Create sku_details (KM.DB.upsertSkuDetail → handleUpsertSkuDetail_ creates the row)
  → NO factory_stock mutation UNLESS this create sets lifecycle = "Running in the Market"
    (baseline is ensured only on the lifecycle transition into Running in the Market — §15)
  → Return success
  → Optional navigation: View SKU / Add Regional Detail / Add Tax Rate
```

Master SKU creation **MUST NOT** auto-create `marketplace_skus`, `sku_regional_details`, `pricing_list`, `fc_regular_forecast`, tax rows, supplier assignments, audit history, shipment/inbound records, **or `factory_stock`** — the Factory Stock baseline is ensured only on the **lifecycle transition into `Running in the Market`** (§15). (Current runtime: `handleUpsertSkuDetail_` creates none of these — confirmed §17.)

---

## 14. Edit SKU Business Flow

```
Open Edit SKU (mode=edit)  [requires a selected SKU]
  → Load sku_details by SKU (KM.DB.getSkuDetails → _skuFindRecord)
  → Populate the SAME shared form
  → sku read-only
  → User edits allowed fields
  → Validate changed/current values (§12)
  → Update existing sku_details (KM.DB.upsertSkuDetail → update branch; omitted columns preserved)
  → Do NOT recreate Factory Stock
  → Refresh SKU Details list (renderSkuDetailsTable) + Handbook
  → Preserve the selected SKU
```

Edit **must not**: create a new SKU row, change SKU identity, recreate a Factory Stock baseline, modify Regional records, modify `marketplace_skus`, modify `pricing_list`, or modify Tax rows — **except** via the explicit HS Code & Tax Rates subpage (which writes only `tax_referral_rates`). Historical Shipment / PO / plan snapshots remain **frozen** (Immutable Flow) — editing the master never rewrites committed snapshots.

---

## 15. Factory Stock Baseline

> **Canonical business rule (REVISED 2026-07-20 v2 — trigger = lifecycle transition into "Running in the Market").** The Factory Stock baseline is **NOT** created by Master SKU (`sku_details`) creation and **NOT** by Marketplace SKU creation (both prior rules are **superseded**). **Creating `sku_details` performs NO `factory_stock` mutation.** The baseline is ensured when **`sku_details.lifecycle` transitions from any non-running value into the canonical `Running in the Market` value** (exact stored string from `VALID_LIFECYCLES_` = `['Upcoming SKU','Running in the Market','Phasing Out','Closure','Other']`; do not invent a second value). Authoritative home for the trigger: [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md); this spec records only that **Add/Edit Master SKU never seeds `factory_stock` except via the lifecycle-transition ensure**.

**Finalized canonical rule:**
```
Create sku_details                                   → NO factory_stock mutation
Save edits without entering Running in the Market    → NO factory_stock mutation
lifecycle transition (non-running → "Running in the Market")
  → ensure factory_stock baseline for eligible Factory Warehouses
  → idempotent by warehouse_id + MASTER sku   (never site_sku)
  → current_stock = 0
  → reserved_stock = 0   (only where the canonical schema/default supports it)
```
- **`factory_stock` is keyed by `warehouse_id + Master sku`** — **never `site_sku`, `company`, `country`, or `marketplace`.** Site-SKU/marketplace differences never create separate factory rows.
- **Add Master SKU does NOT create a baseline** (unless the create itself sets `lifecycle = Running in the Market`, which is the transition). Editing a SKU **already** Running in the Market must **not** reset stock.
- **Non-destructive lifecycle:** leaving `Running in the Market` must **not** delete stock or history; returning to `Running in the Market` repeats only the **idempotent ensure** (no duplicate `warehouse_id + Master sku` rows, no reset).

**Implementation status: NOT IMPLEMENTED** (no runtime performs this ensure today — §17; `handleUpsertSkuDetail_` correctly creates none).

**Remaining OPEN MAPPING (unresolved — §21):**
- **Exact eligible factory-warehouse selection rule** — not conclusively defined (`DATABASE_RELATIONSHIP_MAP.md` notes a default preferred factory warehouse `WH-TW-CN-FACTORY-YOUXIN` and `factory_stock → sku_details` keyed by `sku`, but no canonical "for-these-warehouses" set). Do not invent the eligibility set.
- **Partial-failure compensation / retry behavior** — see atomicity note below.

**Atomicity / compensation:** Google Sheets + Apps Script provide **no multi-row/multi-sheet transactions** — do **not** claim full DB transactions. Because the ensure is idempotent by `warehouse_id + Master sku`, a **safe retry** re-seeds only missing rows. The precise compensation/retry contract remains **OPEN MAPPING**.

---

## 16. Tax and Regional Navigation

- **Tax:** `hscode` / `country_of_origin` / `duty_country` / `declared_value` / `declared_currency` / duty·VAT·referral·port-tax rates live **only** in `tax_referral_rates` (keyed by `series`). The Add/Edit form provides **navigation** to the existing Series-scoped **HS Code & Tax Rates** subpage; it never stores tax fields on `sku_details`. Route display: `country_of_origin → duty_country`. **No Tax DB mapping change.**
- **Regional:** Site SKU / Marketplace Product ID (ASIN) / `product_url` / regional packaging·language·manual·label / marketplace operational status live in `sku_regional_details` / `marketplace_skus`. The form provides **[View Regional Details]** navigation in Edit mode (and an "after create" note in Add mode). **The Add/Edit SKU form performs no Regional write.**

---

## 17. Runtime Mapping (inspected — NOT changed)

**Current entry points & behavior (before):**

| Concern | Current runtime | File |
|---|---|---|
| Add SKU entry | **`handleAddSku()` — STUB** (`alert('Add SKU cloud write-back is not enabled yet…')`); **not wired to backend** | [assets/js/pages/sku-details.js](../../assets/js/pages/sku-details.js) |
| Edit SKU entry | `handleEditSku()` — requires `_selectedSku`; builds/reuses `#sku-edit-modal-overlay` | sku-details.js |
| Modal renderer | `_buildSkuEditModal()` + `handleEditSku()` render from `SKU_EDIT_FIELDS_` (single flat grid — **no tabs today**) | sku-details.js |
| Form serializer | `saveSkuEdit()` collects `SKU_EDIT_FIELDS_` (skips readonly) → payload `{ sku, …allowlisted }` | sku-details.js |
| SKU getter | `KM.DB.getSkuDetails()` → `_skuFindRecord(sku)` | [operation-system-db-api.js](../../assets/js/api/operation-system-db-api.js) L1609 |
| Upsert client | `KM.DB.upsertSkuDetail(payload)` → POST `{action:'upsertSkuDetail', …}` | operation-system-db-api.js L1935 |
| Router | `action==='upsertSkuDetail'` → `handleUpsertSkuDetail_` | [01_router.gs](../../assets/specs/active/apps-script/01_router.gs) L52 |
| Upsert handler | `handleUpsertSkuDetail_` — **upsert by `sku`**; allowlist `SKU_DETAILS_UPSERT_FIELDS_`; preserves omitted columns; ensures columns additively; sets `created_at`/`updated_at` | [03_master_data_handlers.gs](../../assets/specs/active/apps-script/03_master_data_handlers.gs) L120 |
| Create vs update | **Implicit** — finds row by `sku` → update branch; else create branch. **No explicit "created vs updated" caller contract beyond `data.created/updated`** | 03_master_data_handlers.gs L145/L155 |
| Duplicate SKU detection | **NONE** — Add on an existing SKU **updates** it silently (no rejection) | 03_master_data_handlers.gs |
| Validation (backend) | Only `sku` presence (`Missing sku`); lifecycle enum via config; **no numeric/required enforcement** — values written as-is | 03_master_data_handlers.gs |
| Factory Stock baseline | **NOT created here** (explicit comment); no master-create seeding exists | 03_master_data_handlers.gs L103-104 |
| Field whitelist / preservation | `SKU_DETAILS_UPSERT_FIELDS_` (36 fields); omitted (`undefined`) fields preserved, never blanked | 03_master_data_handlers.gs L105-112 |
| Tax subpage opener | `handleSkuTaxRates()` → `_buildSkuTaxModal()` (writes only `tax_referral_rates`) | sku-details.js |
| Regional navigation | **None in the current modal** (Regional is a separate page) | — |
| Timestamps / actors | `created_at`, `updated_at` set; **no `created_by`/`updated_by`** | 03_master_data_handlers.gs L137/L151/L163-164 |
| Response format | `jsonResponse_({ success:boolean, data?:{…}, error?:string })` | 03_master_data_handlers.gs |

**Before → Target (documentation only):**
- **Before:** flat single-panel Edit modal; Add is a stub; shared `upsertSkuDetail` for updates only; no tabs; no duplicate guard; no factory baseline; retired enum values present in the prior spec §6.
- **Target:** one `SkuMasterForm` (add/edit) with 4 tabs over the **same** `SKU_EDIT_FIELDS_`/allowlist and the **same** `upsertSkuDetail` payload; Add wired to `upsertSkuDetail` (create branch) with a **proposed** duplicate-SKU guard; **no** factory baseline on create — baseline is ensured only on the **lifecycle transition into `Running in the Market`** (§15); corrected canonical enums. **No runtime is changed in this task.**

**Exact files a future implementation would modify** (identified from inspection — not touched here):
- `assets/js/pages/sku-details.js` (form → tabs; wire `handleAddSku`; add-mode `sku` editability; validation orchestration; Regional nav in Edit).
- `assets/html/pages/sku-details.html` (Add SKU / Edit SKU toolbar buttons; any static modal scaffolding).
- `assets/css/pages/sku-details.css` (tab, footer, chip, error-state styling).
- `assets/js/api/operation-system-db-api.js` (only if an Add-specific create call or duplicate-check accessor is added — otherwise reuse `upsertSkuDetail`).
- `assets/specs/active/apps-script/03_master_data_handlers.gs` (only if a duplicate-SKU guard and/or factory baseline seeding are approved) + `01_router.gs` (only if a new action is added).

---

## 18. Error and Retry Behavior

- Use the **existing response contract** (`{success, data, error}`) and the existing toast pattern (`showSkuStatusToast`) — no raw exceptions/stack traces to the user.
- **Add:** if `sku_details` create fails → surface `error`, keep the form open with values intact, **no baseline** attempted.
- **Baseline (if/when implemented):** partial failure → report which `warehouse_id + sku` rows are missing; retry is **idempotent** (seeds only missing rows). **No transaction claim** — Sheets/Apps Script cannot guarantee atomic multi-row writes (§15).
- **Duplicate submission** prevented by disabling the primary action while in flight (§12.7).
- **Edit:** update failure → surface `error`, preserve edits; never partially rewrite identity.

---

## 19. Responsive and Accessibility

- **Tablist semantics:** `role="tablist"` / `role="tab"` / `role="tabpanel"`, `aria-selected`, `aria-controls`; Left/Right/Home/End move focus; Enter/Space activate.
- **Visible focus** on tabs, fields, and footer actions.
- **Error state not color-only** — text label + icon on the tab chip and inline field message.
- **Labels / help text** correct and associated (`<label for>`); the baseline-price notice and Regional/Tax notes are readable, not tooltip-only.
- **Modal focus trap**; **Escape / close** prompts a **confirm when there are unsaved changes**.
- **Responsive:** dimension groups (`L × W × H + unit`) reflow to single column on narrow screens without clipping; the tab strip scrolls/stacks; the **sticky footer stays usable** and the primary action is **never hidden below scrolling content**.

---

## 20. Deferred Scope (V1 does NOT implement)

Supplier Master · SKU–Supplier relationship · detailed Audit Log · Role & Permission · Regional Detail editor · Marketplace SKU creation · live marketplace pricing · Forecast baseline creation · Tax row auto-creation · Product Features module · regional packaging rules · API layer changes · image management (unless already canonical and separately requested). The Factory Stock baseline is **NOT** created on Master SKU creation nor on Marketplace SKU creation — it is ensured on the **lifecycle transition into `Running in the Market`** (§15, `INVENTORY_TABLE_MAPPING_SPEC.md`); this Add/Edit flow mutates `factory_stock` only via that transition. Only the eligible-warehouse rule and partial-failure retry remain open mapping (§21).

---

## 21. Open Decisions

1. **`pm` meaning/source** — current label `負責PM` suggests responsible Product Manager, but the canonical meaning/source is **not confirmed**. Do not finalize or add/rename a DB field without user confirmation.
2. **Add-mode duplicate-SKU guard** — current runtime upserts (silent update). Decide whether Add must **reject** an existing `sku` (recommended) and where to enforce (front-end pre-check via `getSkuDetails` and/or a backend guard in `handleUpsertSkuDetail_`).
3. **Factory Stock baseline trigger** — **FINALIZED (§15): the trigger is the `sku_details.lifecycle` transition into `Running in the Market`** — NOT Master SKU creation and NOT Marketplace SKU creation (both superseded). NOT open. Remaining **OPEN MAPPING**: (a) the **exact eligible factory-warehouse selection rule** (not conclusively defined today — do not invent eligibility); (b) the **partial-failure compensation / retry contract**. Do not re-open the trigger.
4. **Backend required-field enforcement** — today only `sku` presence is enforced server-side; decide whether numeric/required rules move to the backend.
5. **`option_lists` / `system_settings`** — mid-term source for `category` / `series` / enums (front-end constants in v1).
6. **Image management** (`image_url` present in the allowlist) — single URL today; multi-image/asset management deferred.

---

## 22. Acceptance Criteria

1. ✅ Add and Edit use **one shared canonical form** (`SkuMasterForm`, §4).
2. ✅ **Four tabs** defined (§6).
3. ✅ **Basic + Sales** are V1 active tabs (§6–§8).
4. ✅ **Supplier + Logs** fabricate no unsupported data (§9–§10).
5. ✅ `sku` editable only in Add (§5, §7).
6. ✅ `sku` immutable in Edit (§5, §7, §14).
7. ✅ Product Master vs Regional Master boundary explicit (§3).
8. ✅ **No Regional fields written** by Add/Edit SKU (§8, §16).
9. ✅ **No live marketplace pricing** edited here (§8).
10. ✅ Tax fields remain in `tax_referral_rates` (§16).
11. ✅ Marketplace Product ID remains Regional (§3, §8, §11).
12. ✅ Factory Stock baseline **NOT** created by Master SKU or Marketplace SKU creation — trigger is the **lifecycle transition into `Running in the Market`** (§13, §15); runtime NOT IMPLEMENTED.
13. ✅ Factory baseline logic **idempotent** (§15).
14. ✅ Edit **never** recreates Factory Stock (§5, §14, §15).
15. ✅ Canonical **battery/magnet enums** used; retired values excluded (§7 B).
16. ✅ Material/Product Use use existing canonical storage (§7 B, §11).
17. ✅ Dimension layout creates **no combined DB column** (§7 C–E).
18. ✅ Cross-tab validation specified (§12).
19. ✅ Supplier relationship deferred (§9, §20).
20. ✅ Audit history deferred (§10, §20).
21. ✅ Current Runtime **mapped, not changed** (§17).
22. ✅ No DB / Runtime / UI / API changes occur (spec file only).
23. ✅ Implementation status accurately reflects **IMPLEMENTED IN SOURCE** (frontend live; Apps Script pending redeploy; live E2E pending) — §23.
24. ✅ Exact future allowed code files identified from inspection (§17).

---

## 23. Implementation Status (updated 2026-07-21 — IMPLEMENTED IN SOURCE)

**IMPLEMENTED IN SOURCE (frontend live on reload; Apps Script requires redeploy; live end-to-end not yet verified).**

- **Unified `SkuMasterForm` (add/edit)** — `assets/js/pages/sku-details.js`: one component, four tabs (Basic / Sales / Supplier / Logs), shared fields/enums/validation/payload; `handleAddSku()` → `openSkuMasterForm('add')`, `handleEditSku()` → `openSkuMasterForm('edit')`. **Live on frontend reload.**
- **Add duplicate protection + Edit-safe update** — backend `handleUpsertSkuDetail_` (`03_master_data_handlers.gs`) gates on `body.mode`: `add` rejects an existing SKU (`error_code:'duplicate_sku'`), `edit` rejects a missing SKU (`not_found`); omitted columns preserved; `created_at` retained, `updated_at` set; SKU trim + case-sensitive (existing convention). Frontend disables duplicate submit + surfaces structured errors. **Requires Apps Script redeploy.**
- **Factory Stock baseline ensure on lifecycle transition** (`ensureFactoryStockBaseline_`) — fires only non-running → `Running in the Market`; idempotent by `warehouse_id + Master sku`; `current_stock=0`, `reserved_stock=0` where the column exists; eligibility `is_active ∧ is_factory_warehouse`; **fail-closed to a structured `db_mapping_gap`** if the `warehouses`/`factory_stock` sheets or required columns are absent (never invents). Logic unit-tested (5 cases). **Requires Apps Script redeploy + a live `factory_stock` sheet with the documented columns.**
- **Enums** — battery/magnet use the canonical Global Logistics Enums; legacy/unrecognized stored values load without destruction, render as a flagged "legacy" option, and require an explicit canonical selection before Save (no silent coercion).
- **Button contrast + double-click Edit** — modal buttons carry explicit readable colors; SKU-cell double-click opens Edit for that row (keyboard/toolbar Edit preserved).

**UI refinement (implemented 2026-07-21 — frontend only, no DB/API/Apps Script change):**
- **Stable top-anchored dialog** — the modal aligns to a fixed top offset (`clamp(24px, 8vh, 96px)`); header + tab bar hold their screen Y across Basic/Sales/Supplier/Logs switches; only the body scrolls (`max-height: calc(100vh − offset − 24px)`, header/tabs/footer `flex-shrink:0`). No re-centering on tab change; overlay scrolls on very small screens.
- **Creatable Series/Category comboboxes** — see §7 A; options are distinct live `sku_details` values, `＋ Add new` persists only via normal Save.
- **Material / Product Use tag inputs** — shared component, reversible `" + "` serializer; see §7 B.
- **Friendly Battery/Magnet enum labels** — human-readable option text (`No Battery / 無電池`, `Magnetic / 含磁性`, …) while the submitted `<option value>` stays the canonical DB code; legacy codes shown as a flagged `⚠ Legacy value: {raw}` that must be replaced before Save. Scoped `.skuf-enum` class only — native selects elsewhere are untouched.
- **Dimension / weight unit spacing** — Item/Package/Carton groups use `.skuf-dim-grid` / `.skuf-wt-grid` with an explicit column gap and a `minmax(84px,auto)` unit column (no negative margins / overlap); stacks to 2-col / 1-col under 640px.

**SKU Details list toolbar + tag presets (implemented 2026-07-21 — frontend only, no DB/API/Apps Script change):**
- **Toolbar restructure** (`sku-details.html`): primary controls left→right = Add SKU · Edit SKU · Search · **Series filter** · **Category filter** · CM/KG↔IN/LB · Display · **More Options** (far right). Add/Edit are never hidden.
- **More Options menu** (`.more-options-*`): collapses Export Template / Import Template / Refresh DB; right-aligned, keyboard-focusable items, Escape + outside-click close, Import visibly flagged as data-changing, Refresh does not fire on open. No feature removed.
- **Series / Category list filters** (`populateSkuFilters`/`applySkuFilters`): options = DISTINCT non-empty values across **all** lifecycle groups (live from rendered rows), natural-sorted. Search **AND** Series **AND** Category; lifecycle grouping stays visible; a fully-filtered group shows a concise `.sku-filter-empty` note; `All Series`/`All Categories` clears a dimension; filters never mutate data and survive re-render/edit (selection preserved when the edited SKU still matches; new Series/Category appear after refresh).
- **Creatable Series/Category (Add/Edit)** — custom combobox now always exposes the `＋ Add new …` action (labelled `＋ Add new series: {typed}` when typing); persists only via normal `sku_details` Save.
- **Material / Product Use preset multi-select + creatable tags** — see §7 B; presets are UI defaults only.

**Toolbar + enum-display corrections (implemented 2026-07-21 — frontend only):**
- **Toolbar grouping** (`sku-details.html`/`.css`): a **filter group** (Category → Series → Search SKU) on the left and an **action group** (Add SKU · Edit SKU · CM/KG↔IN/LB · Display · More Options) on the right (`margin-left:auto`), one desktop row where space permits, clear gap between groups, actions never interrupt filters. Filter order Category → Series → Search matches SKU Regional Details.
- **More Options single-line** (`.more-options-item{white-space:nowrap}` + panel `width:max-content;max-width:340px`): icon · label · right-aligned badge stay on one row; the menu widens instead of wrapping (no two-line Import item). Keyboard/Escape/outside-click intact.
- **Friendly Battery/Magnet in the SKU table** (`_skuEnumDisplay`): canonical codes render bilingual friendly labels (`no_battery`→No Battery / 無電池, `alkaline_battery`→Alkaline Battery / 鹼性電池, `lithium_battery`→Lithium Battery / 鋰電池, `rechargeable_lithium`→Rechargeable Lithium Battery (Legacy); `no_magnet`→No / 無磁性, `magnetic`→Yes / 含磁性); blank→`--`; unknown legacy→verbatim + “(Legacy)”. **Stored DB codes stay canonical enum strings — never Boolean.** Add/Edit closed enum controls show friendly labels (never raw snake_case), including the legacy option.

**Document derived battery/magnet fields (verification 2026-07-21):** `HAS_BATTERY`/`HAS_MAGNET`/`LINE_HAS_BATTERY`/`LINE_HAS_MAGNET` are **NOT IMPLEMENTED in runtime** (spec-only; no resolver/engine in code). The canonical derivation in [`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](./DOCUMENT_GENERATION_SYSTEM_SPEC.md) §I.2.6 was **corrected** (normalized-token classification; `no_battery`/`no_magnet` ⇒ FALSE; unknown ⇒ unresolved; no JS truthiness; header = OR across all lines). `battery_type` **stays a semantic enum**; **`magnet_type` is now a REAL Boolean** (§7 B — corrected 2026-07-21). `hasMagnet` derives from the normalized Boolean (`true → TRUE`, `false → FALSE`); legacy `magnetic`/`no_magnet` remain read-compatible.

**Correction 2026-07-21 — Magnet Boolean + Series/Category Add-New dialog (implemented, frontend + Apps Script):**
- **`magnet_type` migrated enum → Boolean.** UI **Contains Magnet** (Yes→`true`/No→`false`); frontend sends a Boolean; `KM.DB.upsertSkuDetail` JSON-serializes it (no stringify); `handleUpsertSkuDetail_` writes a **real Boolean cell** via `skuMagnetToBool_` (explicit token normalization — legacy `magnetic`/`no_magnet`/`TRUE`/`FALSE`/`yes`/`no` accepted on read, canonicalized on write; blank/unknown → not guessed). SKU table shows friendly Yes/No via `_skuMagnetBool`/`_skuMagnetDisplay`, never raw `true`/`false`. **No `Boolean(value)` truthiness** anywhere. `battery_type` unchanged.
- **Series/Category Add-New is now a small confirm dialog** (title *Add New Series* / *Add New Category*, one input, Add/Cancel; trim; reject empty; case-insensitive de-dup → selects the existing value). Arbitrary typing in the field only **filters** — it is never auto-committed; the committed value is `_skuComboData[id].value`.
- **Temporary-until-save lifecycle:** a confirmed new value is **form-local temp state** (`_skuComboData[id].temp`) — shown in this form's list only, **never** written to a master table, **never** added to the page-level filter lists, **never** leaked to another opened form. It is discarded on dialog Cancel, form Cancel/close/Escape, selection change, reload, **or a failed Create/Update**. It becomes a global option **only** after a successful `sku_details` Save (which reloads DISTINCT persisted values). No Series/Category master table, no independent Add-Series/Add-Category API, no secondary write.

**STILL NOT IMPLEMENTED (unchanged):** Supplier tab (read-only placeholder), full audit/Logs history (metadata-only + honest empty states), Regional Detail editing (navigation only), duplicate-SKU business rule beyond existence, `pm` meaning (OPEN DECISION §21), eligible-factory-warehouse configuration system.

**Build / Redeploy:** frontend = static reload; **Apps Script (`03_master_data_handlers.gs`) MUST be copied to the live Apps Script project and redeployed** for backend behavior (duplicate gate, factory baseline) to take effect. **Live in-browser + live-Sheet verification is still pending** (see §L of the implementation task).

**End of Document**
