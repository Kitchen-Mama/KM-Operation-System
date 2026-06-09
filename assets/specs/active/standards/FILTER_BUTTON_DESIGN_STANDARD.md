# Filter & Button Design Standard

**Version:** v1  
**Scope:** Operation System UI  
**Status:** Foundation defined, not yet applied system-wide  
**Brand source:** Kitchen Mama Brand Guidelines 2024  
**Current implementation phase:** Define tokens and standards first, then apply page by page  
**Last Updated:** 2026-06

---

## Brand Color Tokens

### Primary Brand Red
- HEX: `#f04f5e`
- Usage: brand accent, critical highlight, danger only when appropriate

### Brand Black
- HEX: `#3a3a3a`
- Usage: text, strong neutral

### White
- HEX: `#ffffff`
- Usage: background, cards, inputs

### Teal
- HEX: `#3abfb6`
- Usage: info / secondary positive / freshness

### Blue
- HEX: `#0080bb`
- Usage: info / utility action / refresh / export when appropriate

### Yellow
- HEX: `#e6a620`
- Usage: warning / attention / watch

### Purple
- HEX: `#8e76a8`
- Usage: utility / import / demo / training

### System Success Green (Legacy)
- HEX: `#7FB069`
- Note: This is NOT a Brand Guidelines primary color. It is currently used throughout the system as the "soft green" accent. Future brand alignment may replace it with Teal/Green family. For now it is preserved as `--km-ui-success` for backward compatibility.

---

## Filter Template Standard

系統主要 filter 樣式採用「label + control」結構。

### Structure

```
Filter bar container
├─ Filter item
│  ├─ Label
│  └─ Select / input / date range / search
├─ Filter item
│  ├─ Label
│  └─ Control
└─ Optional action buttons (right side)
```

### Visual Standard

1. Filter bar background: neutral light surface (`--km-filter-surface`).
2. Filter item label sits above the control.
3. Label font: small, stable, muted text color (`--km-filter-muted`).
4. Select / input height: fixed, recommended 36px (`--km-filter-height`).
5. Border: light neutral border (`--km-filter-border`).
6. Radius: 6px (`--km-filter-radius`).
7. Control background: white (`--km-filter-bg`).
8. Dropdown arrow / input placeholder color: consistent muted tone.
9. Same-row filter gap: consistent (`--filter-gap` or 12px).
10. Different pages should NOT have completely different filter appearances.

### Reference Implementations

- Factory Stock filter (`#factory-stock-section .fc-filter-bar`)
- FC Summary filter (`#fc-summary-section .fc-filter-bar`)
- Forecast Review filter (`.forecast-filters`)
- Inventory Replenishment filter (`#ops-section .replen-control-panel`)

---

## Primary Filter Template

Operation System 的主要篩選器樣式以 Factory Stock / Forecast 管理為基準。

### Standard Structure

**Filter bar:**
- Neutral light surface background (`--km-filter-surface`)
- Consistent padding (16px 20px recommended)
- Consistent gap (12px)
- Light border (1px solid `--km-filter-border`)
- Border-radius: `--km-filter-radius`
- Responsive wrap on smaller screens

**Filter item:**
- Label on top (always visible)
- Control below the label
- Label: 12px, font-weight 500, color `--km-filter-muted`
- Gap between label and control: 4px

**Control:**
- White background (`--km-filter-bg`)
- 36px height (`--km-filter-height`)
- 6px radius (`--km-filter-radius`)
- Light neutral border (`--km-filter-border`)
- Consistent padding (0 12px)
- Muted placeholder
- Dropdown arrow consistent
- Focus state: `--km-brand-blue` border + subtle box-shadow

**Action buttons:**
- Sit on the right side of filter bar
- Vertically aligned to bottom of filter items (`align-items: flex-end`)
- Follow Button Size Standard

### Dropdown Panel (Checkbox Dropdown)

- White background
- Light border
- Subtle shadow
- Checkbox option style allowed
- "All" option allowed
- z-index above sticky table header
- Preferred for multi-select dimensions (factory, company, category, series, marketplace, lifecycle)
- Checked state may use `--km-brand-teal` or approved system accent
- Do NOT implement cascading logic in v1

### Native Select vs Checkbox Dropdown

- **Checkbox dropdown** is the preferred pattern for multi-select filters
- **Native select** is acceptable as a temporary simple single-select implementation
- If a filter only needs single-select and has few options, native select is fine
- If a filter needs multi-select in the future, plan to upgrade to checkbox dropdown
- Both must share the same visual height, border, radius, and background

### Compact Toolbar Filter (Exception)

- Allowed only when there is a documented reason (e.g., very dense toolbar with many actions)
- Should NOT be the default for main page filters
- If a page currently uses compact toolbar-only style, it should migrate toward Primary Filter Template when refactored

---

## Filter Layout Rules

1. Filter bar should use consistent spacing.
2. Label should always be visible unless the control is a toolbar-only compact filter.
3. Select / input / search should share height and border style.
4. Search input should visually match select controls.
5. Primary page action buttons may sit on the right side of filter bar.
6. Filter bar should wrap on smaller screens.
7. Do not mix pill filters, raw select filters, and custom dropdowns without a documented reason.
8. Dropdown z-index should not be blocked by sticky table headers (filter bar must have `position: relative; z-index` above table header).
9. Filter state should not be stored in random global variables if the page has complex filters.
10. Future cascading filters should use a consistent state model.

---

## Cascading Filter Guidance

Cascading / dependent filters are supported in future phases.

**Example:**  
If Series = "Electric Can Opener" and Country = "UK" has no matching records, the Country filter can hide UK, disable UK, or show it with 0 count depending on UX decision.

### Strategy Options

#### A. Hide unavailable options
- Pros: Options are clean
- Cons: User may not know why an option disappeared

#### B. Disable unavailable options with count (Recommended)
- Pros: Most transparent for data-driven systems
- Cons: UI slightly more complex

#### C. Keep all options but show 0 result
- Pros: Simplest implementation
- Cons: Potentially worse user experience

### Recommendation

First version: standardize filter visual style only, do NOT implement cascading logic.

Future implementation: adopt Strategy B (disable unavailable options with count) because it is the most transparent approach for a data-heavy internal operation system.

**Note:** This is UX / state management work, not a database schema requirement.

---

## Button Color Usage Standard

### Primary Action
- Color: Brand Red (`--km-brand-red`) or current system orange (`--warm-orange`) if existing UI still depends on it
- Usage: main submit / add / most important CTA
- Examples: Submit Plan, Add SKU, Add Promotion

### Success Action
- Color: System Success Green (`--km-ui-success`)
- Usage: Approve, Save, Confirm, Done

### Info / Utility Action
- Color: Brand Blue (`--km-brand-blue`)
- Usage: Refresh DB, Export, View Detail, utility action

### Import / Training / Demo / Secondary Utility
- Color: Brand Purple (`--km-brand-purple`)
- Usage: Import Template, Demo Data Mode, Training utility

### Warning
- Color: Brand Yellow (`--km-brand-yellow`)
- Usage: Watch, attention, medium risk

### Danger
- Color: Brand Red (`--km-brand-red`)
- Usage: Delete, Reject, Stop, High Risk destructive action

### Neutral / Secondary
- Color: White background + neutral border
- Usage: Display dropdown, filter actions, cancel, secondary controls

### Rules

1. Do not use random button colors per page.
2. Same action type should use same semantic color.
3. Destructive action must not use green or blue.
4. Import and Export should not share the same color if they represent different action types.
5. Demo mode should consistently use Purple utility.
6. Delete / Reject should consistently use Danger.
7. Primary Add actions should be consistent across pages.

---

## Button Size Standard

1. Default button height: 36px (`--km-button-height`).
2. Compact button height: 30px.
3. Border radius: 6px (`--km-button-radius`).
4. Horizontal padding: 14px (`--km-button-padding-x`).
5. Font size: 12px or 13px depending on current page table density.
6. Icon + text buttons should keep consistent gap.
7. Do not mix large pill buttons and square buttons in the same toolbar unless documented.
8. Toolbar buttons should align vertically with filter controls.

---

## Pages To Align

### Filter style alignment needed:

1. Inventory Replenishment
2. Shipping History / Shipment Overview
3. Promotion Risk Tracker
4. SKU Handbook

### Button style alignment needed:

1. SKU Details toolbar
2. Inventory Replenishment toolbar
3. Shipping History search button
4. Promotion Risk Tracker actions
5. FC Summary actions
6. Factory Stock edit button
7. Future Shipping Plan / Shipment Management actions

**Note:** These pages should be updated page by page after the standard is approved.

---

## Filter Dropdown Option Standard

Operation System 的 dropdown option 樣式以 Factory Stock 的 checkbox dropdown 為主要視覺基準。

### Dropdown Panel

1. Background: white (`--km-filter-bg`).
2. Border: 1px solid `--km-filter-border`.
3. Border-radius: `--km-filter-radius`.
4. Box-shadow: `0 4px 12px rgba(0,0,0,0.1)` or subtle shadow.
5. Padding: `6px 0` (vertical only) or `8px`.
6. Min-width should match or exceed control width.
7. Max-height: 200px–300px, allow vertical scroll.
8. `overflow-y: auto`.
9. `overflow-x: hidden`.
10. z-index must be above sticky table headers (1000 recommended).
11. Dropdown should not be clipped by parent containers.
12. Dropdown should not show horizontal scrollbar.
13. Position: `absolute; top: 100%; left: 0; right: 0; margin-top: 4px`.

### Checkbox Option Row

1. `display: flex`.
2. `align-items: center`.
3. `gap: 8px`.
4. Min-height: 28px to 32px.
5. Padding: `6px 12px`.
6. Checkbox stays on the left.
7. Label stays on the right.
8. Checkbox and label are vertically centered.
9. Label uses `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
10. Checkbox width/height: stable, use `width: auto; height: auto` or explicit 14–16px.
11. Checked accent color: `--km-brand-teal` or approved system accent.
12. Hover state: subtle neutral background (`#f7fafc`).
13. Option row should NOT inherit table cell overflow/width rules.
14. Checkbox should NOT inherit filter-group input rules (min-width, height, padding).

### Native Select Exception

Native browser `<select>` dropdown option styling is inconsistent across browsers and cannot be customized.

Recommended:
- For core page filters that require visual consistency, use the system checkbox dropdown pattern.
- Native `<select>` may remain only for:
  - Date range type controls.
  - Temporary implementations before upgrading to checkbox dropdown.
- Country / Marketplace / Shipping Method / Category / Series should use system checkbox dropdown style when used as primary page filters.
- Checkbox dropdown may still represent single-select behavior if the underlying page logic requires single-select; visual style should remain consistent regardless of select vs multi-select behavior.

### Checked State Standard

1. Checked checkbox uses `accent-color: var(--km-brand-teal)` (#3abfb6) for consistent teal/blue-green checked state.
2. Checkmark is white (provided by browser with accent-color).
3. Checkbox size should be stable (`width: auto; height: auto` — browser default size).
4. Checked state must be consistent across Factory Stock, FC Summary, Shipping History, and future filter dropdowns.
5. All pages using checkbox dropdown must include `accent-color` on the checkbox input.
6. Do not rely on browser default checkbox color without `accent-color` — different browsers render differently.

### Current Page Guidance

| Page | Status |
|------|--------|
| Factory Stock | ✅ Reference implementation for checkbox dropdown |
| FC Summary | ✅ Aligned to Factory Stock checkbox dropdown style |
| Shipping History | ✅ Country/Method converted to checkbox dropdown (single-select behavior) |
| Promotion Risk Tracker | ✅ Category/Series converted to checkbox dropdown multi-select |
| SKU Handbook | ✅ Product Line/Brand/Lifecycle converted to checkbox dropdown multi-select |
| Forecast Review | Close to checkbox dropdown style, secondary reference |
| Inventory Replenishment | Native select (single-select), upgrade candidate for future |

**Note:** Native `<select>` should NOT be used for Product Line, Brand, Lifecycle, Category, Series, or Marketplace filters. These must use the system checkbox dropdown pattern.

---

## Pill Filter Variant

Pill filters are allowed only for small, high-level quick filters such as:

- Product Category
- Product Series
- Lifecycle quick filters
- Risk status quick filters

### Rules

1. Pill filter group must have a clear label (uppercase, small, muted).
2. Active pill uses `--km-ui-success` (system green) as background.
3. Inactive pill uses white background + neutral border (`--km-filter-border`).
4. All pills in the same group use same height, padding (5px 14px), radius (16px), and font size (12px).
5. Pill filters should not replace complex multi-select dropdowns.
6. If options exceed ~8 items, use Primary Filter Template dropdown instead.
7. Do not mix random pill colors inside the same group.
8. Pill filter state must be visually obvious (active = filled color, inactive = outline only).

### Current Usage

- Promotion Risk Tracker: Product Category / Product Series use Pill Filter Variant.

---

**End of Document**
