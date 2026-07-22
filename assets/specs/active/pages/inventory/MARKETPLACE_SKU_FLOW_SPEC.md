# Inventory / Marketplace SKU Flow Audit & Implementation Plan

**Created:** 2026-06  
**Status:** Audit & Plan only — no code changes made  
**Purpose:** Document current Add SKU / Add Marketplace behavior, propose marketplace_skus integration, and define implementation phases.

> **SUPERSEDED (persistence, 2026-07-22):** any "Submit Plan → sessionStorage `allShippingPlans` / session-only / no DB" wording below is a historical MVP snapshot and is **NOT current authority.** Canonical rule: the scheduled/manual recommendation cycle persists `shipping_allocation_drafts` / `_draft_lines` (SSOT); Execution Plan edits persist into `planned_qty`; `sessionStorage` is transient UI recovery only; Submit Plan reads the persisted Execution Plan and writes `shipping_plans` via `KM.DB`. See `INVENTORY_TABLE_MAPPING_SPEC.md` §11.4 + `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6.

---

## 1. Current State

### Data Sources Summary

| Page | Current Data Source | Demo Guard | DB Connected |
|------|-------------------|------------|--------------|
| Inventory Replenishment | DemoData (KM.DemoData.getInventoryRows) | ✅ Yes | ❌ No |
| FC Summary | DemoData (KM.DemoData.getFcSummaryRows) | ✅ Yes | ❌ No |
| Request Order | DemoData (KM.DemoData.getRequestOrderRows) | ✅ Yes | ❌ No |
| Promotion Risk Tracker | Mock data (inventorySkuAvailabilityMock + sku_details) | ✅ Yes | ❌ No |
| SKU Details | Google Sheet (KM.DB.getSkuDetails) | N/A — DB primary | ✅ Yes |

### Storage Methods

| Action | Storage | Persists After Reload? |
|--------|---------|----------------------|
| Add SKU (Inventory) | In-memory array `replenishmentData.push()` | ❌ No |
| Add Marketplace | Console log + alert only | ❌ No (TODO comment) |
| Submit Plan | sessionStorage `allShippingPlans` | ⚠️ Session only |

---

## 2. Add SKU Current Behavior

**Function:** `saveReplenSku()` in `inventory-replenishment.js`

**Modal fields:**
- SKU (text input, required)
- Country (select, pre-populated from current filter)
- Marketplace (select, pre-populated from current filter)
- Status (select)

**What happens on submit:**
1. Validates SKU is not empty
2. Checks duplicate (same sku + country + marketplace in `replenishmentData`)
3. Creates object with default 0 values for all numeric fields
4. Pushes to in-memory `replenishmentData` array
5. Calls `renderReplenishment()` to refresh table
6. Shows alert confirmation

**Key findings:**
- ❌ Does NOT persist — lost on page reload
- ❌ Does NOT write to any storage (no localStorage, no sessionStorage, no DB)
- ❌ Does NOT create marketplace_skus relation
- ❌ Does NOT sync to FC Summary or Request Order
- ❌ Only works when Demo mode is ON (because `getReplenishmentData()` returns empty when demo off)
- ✅ Has duplicate validation
- ✅ Updates UI immediately

**Conclusion:** This is a "site SKU assignment" action (sku + country + marketplace), NOT a product creation action. It should eventually write to `marketplace_skus`.

---

## 3. Add Marketplace Current Behavior

**Function:** `saveMarketplace()` in `inventory-replenishment.js`

**Modal fields:**
- Country (select)
- Company (select)
- Marketplace (text input, required)

**What happens on submit:**
1. Validates marketplace name is not empty
2. Logs to console
3. Shows alert
4. Closes modal

**Key findings:**
- ❌ Does NOT persist — completely non-functional (TODO comment in code)
- ❌ Does NOT add option to Country/Marketplace filters
- ❌ Does NOT create any dimension record
- ❌ Does NOT affect any data anywhere

**Conclusion:** This is a placeholder. Needs either:
- A `marketplaces` dimension table write, OR
- Direct addition to `marketplace_skus` with the new marketplace value

---

## 4. Current Storage / Persistence

| Data | Location | Lifecycle |
|------|----------|-----------|
| Inventory rows | In-memory `replenishmentData` | Page session only |
| Added SKUs | In-memory push | Lost on reload |
| Added Marketplaces | Console log only | Not stored |
| Shipping Plans | sessionStorage `allShippingPlans` | Browser session |
| SKU lifecycle overrides | localStorage `km_sku_lifecycle_overrides_v1` | Persistent |
| SKU image overrides | localStorage `km_sku_image_overrides_v1` | Persistent |

---

## 5. marketplace_skus Intended Role

### Should serve as:

1. ✅ **Site SKU master table** — defines which SKUs are sold in which country + marketplace
2. ✅ **Inventory Replenishment filter source** — Country/Marketplace options from distinct values
3. ✅ **Request Order / 下單系統 SKU planning base** — which SKUs can be ordered for which site
4. ✅ **FC Summary FC base row source** — which SKUs need forecast entries
5. ✅ **Promotion Risk Tracker SKU universe** — which SKUs can have promotions
6. ✅ **Future Sales Raw normalized join key** — sku + country + marketplace

### Schema assessment:

Current v1 schema is **sufficient** for Phase 1. Key observations:

- ✅ Has all needed identification fields (sku, country, marketplace, asin, site_sku)
- ✅ Has pricing fields for promotion/risk analysis
- ✅ Has status enum for lifecycle management
- ⚠️ Missing `company` field — currently mapped via marketplace/country conventions
- ⚠️ No explicit `marketplaces` dimension table — acceptable for v1 if country+marketplace combinations are stable

### Recommendation on marketplaces dimension table:

**Not required for v1.** Country + marketplace pairs are a small stable set (~15-20 combinations). Can be hardcoded enum for now. Consider adding a `marketplaces` dimension table in v2 if:
- Company-to-marketplace mapping becomes complex
- Marketplace-specific settings (lead times, costs) need structured storage

---

## 6. Country / Marketplace Linked Filter Proposal

### Recommended approach for v1: **Strategy A + auto-reset**

1. User selects Country → Marketplace options filter to only show marketplaces with `marketplace_skus` rows for that country
2. User selects Marketplace → Country options filter to only show countries with `marketplace_skus` rows for that marketplace
3. If current selection becomes invalid → auto-reset the invalid filter to "All" with a subtle notification

### Data source:
- `marketplace_skus` distinct (country, marketplace) pairs
- NOT from Sales Raw (sales data is reporting, not configuration)

### Risk assessment:
- Low risk — it's a standard cascading filter pattern
- Requires `marketplace_skus` read API to be connected first

### Implementation notes:
- This is purely a frontend filter state + data relationship concern
- Does NOT require Sales Raw
- Does NOT require changes to data calculation logic

---

## 7. Inventory Default Empty State Proposal

### Recommendation:

1. **Default Country:** Pre-select "US" (most common market)
2. **Default Marketplace:** Pre-select "Amazon" (primary channel)
3. **Demo mode ON:** Load demo data immediately with defaults ✅ (current behavior)
4. **Demo mode OFF + DB not connected:** Show empty state: "No data source connected. Connect Google Sheet or enable Demo mode."
5. **Demo mode OFF + DB connected:** Load from `marketplace_skus` for selected Country + Marketplace

### Empty state message:
```
Select Country and Marketplace to view inventory data.
No data source connected yet.
```

### Impact on Submit Plan:
- Submit Plan should be disabled when no data is loaded
- No functional change needed — current behavior already requires data rows to submit

### Impact on Request Order / Shipping Plan:
- None — these pages have their own data sources and lifecycle

---

## 8. Add SKU Cross-page Sync Proposal

### When user adds a site SKU (sku + country + marketplace), the system should:

| Target | Auto-create? | Default Values | Phase |
|--------|-------------|----------------|-------|
| marketplace_skus row | ✅ Yes (required) | status: 'active', prices: null | Phase 3 |
| FC Summary base row | ⚠️ Optional | year: current+1, months: all 0 | Phase 4 |
| Request Order planning row | ❌ No | N/A — created when order is placed | N/A |
| Inventory base snapshot | ❌ No | Comes from live inventory data | N/A |
| Factory stock row | ❌ No | Factory stock is per-SKU not per-site | N/A |

### Must create:
- `marketplace_skus` — this IS the primary action

### Should create (optional, Phase 4):
- FC Summary default row — so the SKU appears in forecast planning for the next year
- `created_by`: "system_auto" or current user
- `source`: "add_sku_flow"

### Should NOT auto-create:
- Request Order rows — these are created on-demand when planning
- Inventory snapshots — these come from external data sync
- Factory stock — this is a global per-SKU concept, not per-site

### Duplicate prevention:
- Check `marketplace_skus` unique constraint: country + marketplace + sku
- Alert user if already exists
- Do NOT silently overwrite

### Partial failure handling:
- If marketplace_skus write succeeds but FC row fails → log warning, don't rollback
- FC row creation is optional enhancement, not critical path

---

## 9. FC Summary Add SKU Button Recommendation

**Recommendation: Keep as admin fallback, not primary entry point.**

Rationale:
- Primary "Add site SKU" flow should be Inventory Replenishment (because it's the operational hub)
- FC Summary "Add SKU" can remain for edge cases: manually adding forecast for SKU not yet in marketplace_skus
- Long-term, FC Summary Add SKU could be removed if all new SKUs come through marketplace_skus → auto-create FC row flow

**No immediate change needed.**

---

## 10. Sales Raw Relationship Note

### Current raw tabs:
- `amazon_daily_sales_raw`
- `amazon_inventory_raw`
- `amazon_inventory_health_raw`

### Recommendations:
1. ❌ Inventory Replenishment should NOT directly read raw tabs — too noisy, no normalization
2. ✅ Future: build normalized summary layer (daily_sales_summary, inventory_summary)
3. ✅ Join key: `marketplace_skus.sku` + `marketplace_skus.country` + `marketplace_skus.marketplace` maps to raw report's ASIN/SKU via `marketplace_skus.asin` or `marketplace_skus.site_sku`
4. ✅ Raw tabs should be import-only layer — never read directly by UI pages

**This will be a separate task — not in scope for marketplace_skus v1.**

---

## 11. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| marketplace_skus not yet in Google Sheet | All linked filter/sync features blocked | Phase 1 priority: create tab + read API |
| Add SKU writes without validation against sku_details | Orphan marketplace_skus entries | Validate SKU exists in sku_details before creating |
| FC auto-create fills sheet with empty rows | Storage waste, confusing UI | Make FC auto-create optional, admin-configurable |
| Country/Marketplace cascading filter too aggressive | Users confused by disappearing options | Use "disable with count" approach, not hide |

---

## 12. Recommended Implementation Phases

### Phase 1: Read Foundation
- Create `marketplace_skus` tab in Google Sheet
- Populate with current known site SKUs (manual or script)
- Add `getMarketplaceSkus()` read support to `operation-system-db-api.js`
- Use marketplace_skus for Inventory Replenishment Country/Marketplace/SKU filter options
- No write actions yet

### Phase 2: Linked Filters + Empty State
- Implement Country ↔ Marketplace cascading filter (disable unavailable)
- Implement default empty state when no data
- Add marketplace_skus distinct values as filter options

### Phase 3: Write — Add SKU / Add Marketplace
- Add Apps Script `doPost` action: `addMarketplaceSku`
- Connect Inventory Replenishment "Add SKU" to write `marketplace_skus`
- Add Marketplace: either add to hardcoded enum (if stable) or write to dimension table
- Duplicate check via unique constraint

### Phase 4: Cross-page Sync
- After successful `marketplace_skus` write, auto-create FC Summary default row
- Show confirmation: "SKU added to US-Amazon. FC base row created for 2027."
- Make FC auto-create configurable (on/off toggle or admin setting)

### Phase 5: Cleanup
- Remove or downgrade FC Summary "Add SKU" button to admin-only
- Consider removing Inventory Add SKU if marketplace_skus has a dedicated management UI
- Document the "single source of truth" flow in system architecture

---

**End of Document**
