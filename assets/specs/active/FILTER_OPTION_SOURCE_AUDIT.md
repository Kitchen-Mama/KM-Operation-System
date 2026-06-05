# Filter Option Source Audit

**Created:** 2026-06  
**Purpose:** Document where each page's filter options come from, and whether they need migration to DB.  
**Status:** Audit only — no code changes made based on this document.

---

## Factory Stock

| Filter | Current Source | Type | Should Be | Risk | Next Step |
|--------|---------------|------|-----------|------|-----------|
| Factory | Hardcoded HTML checkboxes (CN, TW) | Static Enum | Static Enum | Low — factories are stable | Keep as-is |
| Company | Hardcoded HTML checkboxes (Kitchen Mama, Res US, Res TW) | Static Enum | Static Enum | Low — companies are stable | Keep as-is |
| Category | Hardcoded HTML checkboxes | Static Enum | Dynamic from sku_details | Medium — new categories won't appear | Future: derive from DB |
| Series | Hardcoded HTML checkboxes | Static Enum | Dynamic from sku_details | Medium — new series won't appear | Future: derive from DB |
| SKU | Text input (user types) | N/A | N/A | None | Keep as-is |

---

## Forecast Review

| Filter | Current Source | Type | Should Be | Risk | Next Step |
|--------|---------------|------|-----------|------|-----------|
| SKU | Text input | N/A | N/A | None | Keep as-is |
| Country | Hardcoded in forecast-dropdown HTML (US, CA, JP, UK, DE) | Static Enum | Static Enum | Low — countries are stable set | Keep as-is |
| Marketplace | Hardcoded in forecast-dropdown HTML (Amazon, Shopify, Target, Walmart) | Static Enum | Static Enum | Low | Keep as-is |
| Date Range | Date picker (user selects) | N/A | N/A | None | Keep as-is |

---

## Request Order (下單系統)

| Filter | Current Source | Type | Should Be | Risk | Next Step |
|--------|---------------|------|-----------|------|-----------|
| Country | Hardcoded HTML checkboxes | Static Enum | Static Enum | Low | Keep as-is |
| Marketplace | Hardcoded HTML checkboxes | Static Enum | Static Enum | Low | Keep as-is |
| Company | Hardcoded HTML checkboxes | Static Enum | Static Enum | Low | Keep as-is |
| Category | Hardcoded HTML checkboxes | Static Enum | Dynamic from sku_details | Medium | Future: derive from DB |
| Series | Hardcoded HTML checkboxes | Static Enum | Dynamic from sku_details | Medium | Future: derive from DB |
| SKU | Text input | N/A | N/A | None | Keep as-is |

---

## FC Summary

| Filter | Current Source | Type | Should Be | Risk | Next Step |
|--------|---------------|------|-----------|------|-----------|
| Year | Hardcoded HTML select (2025, 2026) | Static Enum | Dynamic from data years | Medium — needs manual update yearly | Future: derive from DB |
| Company | Hardcoded HTML checkboxes (ResTW, ResUS, ResEU) | Static Enum | Static Enum | Low | Keep as-is |
| Marketplace | Hardcoded HTML checkboxes (Amazon, Shopify, Target, Walmart) | Static Enum | Static Enum | Low | Keep as-is |
| Country | Hardcoded HTML checkboxes (US, CA, JP) | Static Enum | Static Enum | Low | Keep as-is |
| Category | Hardcoded HTML checkboxes | Static Enum | Dynamic from sku_details | Medium | Future: derive from DB |
| Series | Hardcoded HTML checkboxes | Static Enum | Dynamic from sku_details | Medium | Future: derive from DB |
| Event Type | Hardcoded HTML checkboxes (Spring Deal, Prime Day, BFCM) | Static Enum | Dynamic from campaigns | Medium | Future: derive from DB |
| SKU | Text input | N/A | N/A | None | Keep as-is |

---

## Shipping History

| Filter | Current Source | Type | Should Be | Risk | Next Step |
|--------|---------------|------|-----------|------|-----------|
| Date | Date picker (user selects) | N/A | N/A | None | Keep as-is |
| Country | Hardcoded HTML checkbox dropdown (US, UK, DE, CA) | Static Enum | Static Enum | Low | Keep as-is |
| SKU | Text input | N/A | N/A | None | Keep as-is |
| Shipping Method | Hardcoded HTML checkbox dropdown (Air, Sea, AGL, Private, Express) | Static Enum | Static Enum | Low — methods are stable | Keep as-is |

---

## Summary

### Safe to keep hardcoded (Static Enum):
- Country, Marketplace, Company, Factory, Shipping Method — these are stable business dimensions.

### Should migrate to dynamic DB source in future:
- Category, Series — new products may have new categories/series.
- Year — needs manual update each year.
- Event Type — new events may be added.

### Demo mode considerations:
- When demo mode is OFF and no DB connected, hardcoded enum filters are still useful for UI structure.
- Dynamic options (Category, Series) will be empty when DB is not connected and demo is off.
- This is acceptable — the filter UI remains functional, just has no options to select.

---

**End of Document**
