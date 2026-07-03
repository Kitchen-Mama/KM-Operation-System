# UI Component Guidelines — KM Operation System

**Status:** 🟢 Living document — shared front-end conventions
**Last Updated:** 2026-07-01
**Maintained By:** Development Team
**Related:** [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md), [`FRONTEND_MODULARIZATION_PLAN.md`](./FRONTEND_MODULARIZATION_PLAN.md)

> Cross-page UI rules that individual page specs reference instead of re-defining. First entry: the **KM Sticky Header Framework**.

---

## 1. KM Sticky Header Framework

A single, reusable way to make table headers stick under a page's sticky toolbar without per-page magic numbers or overlap. Used by Inventory Replenishment today; **Request Order, Purchase Order, Shipment, and Warehouse Stock tables must reuse it.**

**Files:**
- `assets/css/core/km-sticky-header.css` — CSS variables + reusable `.km-sticky-*` classes. Linked globally in `index.html` (after `layout.css`).
- `assets/js/core/sticky-header.js` — `KM.stickyHeader.bindToolbar(pageRoot, toolbar, opts)` helper. Linked globally (core scripts, after `partial-loader.js`).

### 1.1 The model

A page's scroll container is `.main-content` (the fixed `.top-header` lives **outside** it, so it never counts toward sticky offsets). A page may have a sticky toolbar / control panel at the top of that scroll area; table header rows must pin **below** it:

```
Header Row 1: top = var(--km-sticky-top-base)
Header Row 2: top = base + var(--km-sticky-row-1-height)
Header Row 3: top = base + var(--km-sticky-row-1-height) + var(--km-sticky-row-2-height)
```

**`--km-sticky-top-base`** = the height of whatever sticky element would otherwise cover the header (usually the page's sticky control panel). Default `0`. Set it **per page**:
- **Static CSS** when the toolbar height is fixed: `.my-page { --km-sticky-top-base: 64px; }`.
- **Dynamic (preferred when the toolbar can wrap on small screens)** via the helper — it measures the toolbar's live height and self-corrects on resize.

### 1.2 CSS variables (defined in `:root`)

| Variable | Purpose | Default |
|---|---|---|
| `--km-sticky-top-base` | offset to where Header Row 1 pins (toolbar height) | `0px` |
| `--km-sticky-row-1-height` | Header Row 1 height (drives Row 2 top) | `48px` |
| `--km-sticky-row-2-height` | Header Row 2 height (drives Row 3 top) | `48px` |
| `--km-sticky-row-3-height` | Header Row 3 height | `0px` |
| `--km-sticky-header-total` | `row1 + row2 + row3` (combined header height) | calc |
| `--km-sticky-z-toolbar` | sticky control panel / filter toolbar | `131` |
| `--km-sticky-z-corner` | top-left corner cell (sticky both axes) | `121` |
| `--km-sticky-z-header-1` | Header Row 1 | `120` |
| `--km-sticky-z-header-2` | Header Row 2 | `119` |
| `--km-sticky-z-header-3` | Header Row 3 | `118` |
| `--km-sticky-z-col` | left sticky column body | `110` |

**Z-index order (high → low), so nothing masks the layer below it:**
`toolbar > corner > header row 1 > header row 2 > header row 3 > left sticky column > table body / expanded rows`.

### 1.3 Reusable classes

- `.km-sticky-row-1` / `.km-sticky-row-2` / `.km-sticky-row-3` — independently-sticky header rows with the accumulated top offsets above.
- `.km-sticky-col` — a left column body that pins horizontally (`left:0`) and scrolls under the header vertically.
- `.km-sticky-corner` — the top-left cell, sticky on both axes and above the header rows so it stays visible when scrolling down **and** right.

> **Single-bar alternative:** a table may instead place both header rows inside ONE sticky bar pinned at `--km-sticky-top-base` (Inventory Replenishment's `.table-header-bar` does this). The two rows stack in a flex column inside the single pinned bar, so row-1/row-2 overlap is structurally impossible — only the base offset matters. Either approach is valid; both consume the same variables.

### 1.4 JS helper

```js
// On page mount (after the markup exists):
var handle = KM.stickyHeader.bindToolbar(pageRootEl, toolbarEl);
// pageRootEl : element the --km-sticky-top-base var is written on (descendants inherit).
// toolbarEl  : the sticky control panel whose live height becomes the base (pass null if none).
// opts.extraOffset : extra px added to the measured height (default 0).

// On unmount:
handle.destroy();   // releases the ResizeObserver + window resize listener
```

The helper re-measures on `ResizeObserver` (toolbar height change) and `window resize` (wrap), so the header stays correctly positioned on small screens.

### 1.5 Rules (must hold)

- **No hard-coded `top: <px>` magic numbers** for sticky headers scattered across pages — consume `--km-sticky-top-base` (+ accumulated row heights).
- **Header rows must not share the same `top`** — Row 2 = base + Row 1 height (or be stacked inside one pinned bar).
- **Fix small screens too:** if the toolbar can wrap, drive the base dynamically via the helper (do not fix only desktop).
- **Expanded / detail rows must never cover the sticky header** — leave them at the default (unset) z-index, below `--km-sticky-z-header-*`.
- **Left sticky column must not conflict** with the top headers — it uses `--km-sticky-z-col` (below the header rows); the corner uses `--km-sticky-z-corner` (above the rows).

### 1.6 Reference implementation

Inventory Replenishment (`#ops-section`): the `.replen-control-panel` is sticky at the top; `KM.stickyHeader.bindToolbar(#opsSection, .replen-control-panel)` writes `--km-sticky-top-base`; the main table's `.table-header-bar` (two rows in one bar) pins at that base. See [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) §11.6.

---

**End of Document**
