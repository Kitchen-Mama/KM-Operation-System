# TableTemplate_ScrollXY: Scroll XY Freeze Panes Specification

**Version:** 2.0  
**Status:** Normative Standard (Single Source of Truth)  
**Last Updated:** 2025-01-16

---

## 1. Document Purpose & Scope

### 1.1 Normative Status
This document defines the **REQUIRED** architecture for all Scroll XY tables in the Kitchen Mama Operation System. Implementations MUST conform to this specification to ensure consistent behavior across all table components.

### 1.2 Verified Capabilities
This specification reflects a **validated implementation** with the following guaranteed behaviors:
- Single vertical scroll source with sticky header
- Single horizontal scroll source with sticky left column
- Perfect row alignment (zero pixel drift)
- Excel/Monday.com freeze panes behavior

### 1.3 Terminology
- **MUST / MUST NOT**: Absolute requirement
- **REQUIRED / FORBIDDEN**: Mandatory constraint
- **SHOULD / SHOULD NOT**: Strong recommendation
- **Contract**: Non-negotiable behavioral guarantee
- **Invariant**: Condition that must always hold true

---

## 2. Scroll Contract (Non-Negotiable)

### 2.1 Vertical Scroll Source

**REQUIRED:**
- `.main-content` MUST be the **ONLY** vertical scroll source
- `.main-content` MUST have `overflow-y: auto` and explicit `height: calc(100vh - 80px)`
- `body` MUST have `overflow: hidden` to prevent dual scroll sources

**FORBIDDEN:**
- Multiple vertical scroll containers
- Nested scrollable regions within table area
- `overflow-y: auto` on any descendant of `.main-content` within table scope

**Rationale:**
- `position: sticky` references the nearest scrolling ancestor
- Multiple scroll sources cause sticky elements to reference the wrong container
- This creates "sticky appears to fail" symptoms where elements scroll away

### 2.2 Horizontal Scroll Source

**REQUIRED:**
- `.scroll-col` MUST be the **ONLY** horizontal scroll source
- `.scroll-col` MUST have `overflow-x: auto; overflow-y: hidden`
- `.scroll-header` MUST sync via `transform: translateX()` (NOT `scrollLeft`)

**FORBIDDEN:**
- Multiple horizontal scroll containers requiring manual sync
- Using `scrollLeft` manipulation (causes reflow)
- Horizontal scroll on `.main-content` or `body`

**Rationale:**
- Single scroll source eliminates sync complexity
- `transform` is GPU-accelerated and avoids layout thrashing
- Multiple scroll sources create race conditions and jank

### 2.3 Scroll Container Hierarchy

**INVARIANT:**
```
body (overflow: hidden)
└── .main-content (overflow-y: auto) ← ONLY vertical scroll
    └── .content-area (no overflow)
        └── .sku-lifecycle-section (overflow: visible)
            └── .dual-layer-table (no overflow)
                └── .scroll-col (overflow-x: auto) ← ONLY horizontal scroll
```

**Contract Violation Detection:**
If sticky behavior fails, verify:
1. No `overflow: hidden/auto/scroll` between sticky element and scroll container
2. No `transform/filter/perspective/contain` on sticky ancestors
3. Scroll container has explicit height (not `height: auto`)

---

## 3. Sticky Behavior Contract

### 3.1 Header Sticky (Y-Axis Freeze)

**REQUIRED:**
```css
.table-header-bar {
    position: sticky;
    top: 0;
    z-index: 120;
    background: #7FB069;  /* MUST be opaque */
}
```

**FORBIDDEN:**
- `overflow: hidden` on `.dual-layer-table` or any ancestor up to `.main-content`
- `transform/filter/perspective/contain` on any ancestor
- Transparent or semi-transparent background (content will show through)

**Behavioral Contract:**
- Header MUST remain visible at viewport top during vertical scroll
- Content rows MUST be covered by header (not visible through it)
- Header MUST scroll horizontally with `.scroll-col`

### 3.2 Fixed Column Sticky (X-Axis Freeze)

**REQUIRED:**
```css
.fixed-col {
    position: sticky;
    left: 0;
    z-index: 110;
    background: white;  /* MUST be opaque */
}
```

**FORBIDDEN:**
- `overflow: hidden` on horizontal scroll path
- Lower z-index than scrollable content (causes content to show through)

**Behavioral Contract:**
- Fixed column MUST remain visible at viewport left during horizontal scroll
- Scrollable cells MUST be covered by fixed column (not vice versa)
- Fixed column MUST scroll vertically with `.main-content`

### 3.3 Z-Index Stacking Contract

**REQUIRED Hierarchy:**
```
120: .table-header-bar (highest - covers all content)
110: .fixed-col (middle - covers scrollable content)
 90: .scroll-header-viewport (lower - clipped by viewport)
  1: .scroll-col (lowest - scrollable content)
```

**INVARIANT:**
- Fixed elements MUST have higher z-index than scrollable elements
- Header MUST have higher z-index than fixed column (when both present)
- All sticky elements MUST have opaque backgrounds

**Rationale:**
- Ensures correct visual layering during scroll
- Prevents "content bleeding through" artifacts
- Maintains Excel-like freeze panes behavior

---

## 4. DOM Structure Contract

### 4.1 Minimal Legal Structure

**REQUIRED Hierarchy:**
```html
.main-content (vertical scroll source, height: calc(100vh - 80px))
└── .content-area (padding wrapper, no overflow)
    └── .sku-lifecycle-section (overflow: visible)
        └── .dual-layer-table (flex column, no overflow)
            ├── .table-header-bar (sticky top: 0, z-index: 120)
            │   ├── .fixed-header (width: 150px, no sticky)
            │   │   └── .header-cell (height: 48px)
            │   └── .scroll-header-viewport (flex: 1, overflow: hidden)
            │       └── .scroll-header (flex, transform sync)
            │           └── .header-cell (height: 48px, width: explicit)
            └── .table-body-bar (flex row)
                ├── .fixed-col (sticky left: 0, z-index: 110, width: 150px)
                │   └── .fixed-body (padding-bottom: 12px)
                │       └── .fixed-row (height: 48px)
                └── .scroll-col (flex: 1, overflow-x: auto)
                    └── .scroll-body (padding-bottom: 12px)
                        └── .scroll-row (height: 48px, flex)
                            └── .scroll-cell (width: explicit)
```

### 4.2 Structural Constraints

**Layer: `.main-content`**
- MUST have `overflow-y: auto; overflow-x: hidden`
- MUST have explicit height: `calc(100vh - 80px)`
- MUST NOT have padding (use `.content-area` instead)
- FORBIDDEN: Any `transform/filter/perspective`

**Layer: `.dual-layer-table`**
- MUST have `display: flex; flex-direction: column`
- MUST NOT have `overflow: hidden` (breaks sticky)
- MUST have `position: relative` (for z-index context)

**Layer: `.table-header-bar`**
- MUST have `position: sticky; top: 0; z-index: 120`
- MUST have `display: flex` (for horizontal layout)
- MUST have opaque background

**Layer: `.fixed-col`**
- MUST have `position: sticky; left: 0; z-index: 110`
- MUST have same width as `.fixed-header`
- MUST have opaque background

**Layer: `.scroll-col`**
- MUST have `overflow-x: auto; overflow-y: hidden`
- MUST be the ONLY horizontal scroll source
- MUST NOT have `overflow-x: scroll` (use `auto` for conditional scrollbar)

### 4.3 Anti-Pattern Detection

**FORBIDDEN Structures:**
```html
<!-- ❌ Header inside fixed-col (header scrolls away) -->
<div class="fixed-col">
    <div class="fixed-header">...</div>
    <div class="fixed-body">...</div>
</div>

<!-- ❌ Overflow hidden on table (breaks sticky) -->
<div class="dual-layer-table" style="overflow: hidden">

<!-- ❌ Multiple scroll sources (sync nightmare) -->
<div class="scroll-col" style="overflow-y: auto">

<!-- ❌ Padding on scroll container (breaks alignment) -->
<div class="main-content" style="padding: 2rem">
```

---

## 5. Row Alignment Contract

### 5.1 Height Invariant

**REQUIRED:**
```css
.fixed-row,
.scroll-row {
    height: 48px;  /* MUST be identical */
    box-sizing: border-box;  /* MUST be consistent */
}
```

**INVARIANT:**
- `offsetHeight` of `.fixed-row[i]` MUST equal `offsetHeight` of `.scroll-row[i]`
- Height MUST be explicit (not `height: auto`)
- Height MUST include borders via `box-sizing: border-box`

**Verification:**
```javascript
// MUST pass for all rows
fixedRow.offsetHeight === scrollRow.offsetHeight
```

### 5.2 Border Placement Contract

**REQUIRED:**
- Borders MUST be on row level: `border-bottom: 1px solid`
- Borders MUST NOT be on cell level (causes 1px drift)
- Both `.fixed-row` and `.scroll-row` MUST have identical border rules

**FORBIDDEN:**
```css
/* ❌ Border on cells (causes misalignment) */
.scroll-cell {
    border-bottom: 1px solid;
}

/* ❌ Different borders (causes height mismatch) */
.fixed-row { border-bottom: 1px solid; }
.scroll-row { border-bottom: 2px solid; }
```

### 5.3 Box Model Contract

**REQUIRED:**
```css
.fixed-row,
.scroll-row,
.scroll-cell,
.header-cell {
    box-sizing: border-box;  /* MUST be consistent */
}
```

**Rationale:**
- `content-box` causes borders/padding to add to height
- Inconsistent `box-sizing` creates unpredictable height calculations
- `border-box` ensures `height: 48px` means total height is 48px

### 5.4 Scrollbar Compensation

**REQUIRED:**
```css
.fixed-body,
.scroll-body {
    padding-bottom: 12px;  /* Compensate for horizontal scrollbar */
}
```

**Rationale:**
- Horizontal scrollbar on `.scroll-col` adds 12px height
- Without compensation, `.fixed-body` appears shorter
- Creates visual "bottom gap" between fixed and scroll areas

### 5.5 Content Height Contract

**FORBIDDEN:**
- Allowing cell content to determine row height
- Using `height: auto` on rows
- Different padding between `.fixed-row` and `.scroll-row`

**REQUIRED:**
- Row height MUST be controlled by explicit `height` property
- Content MUST be clipped via `overflow: hidden; text-overflow: ellipsis`
- Vertical alignment MUST use `display: flex; align-items: center`

---

## 6. Anti-Patterns (Explicit Prohibitions)

### 6.1 ❌ Overflow Misuse

**FORBIDDEN:**
```css
/* Breaks sticky by creating new containing block */
.dual-layer-table {
    overflow: hidden;
}

/* Creates dual scroll source */
.sku-lifecycle-section {
    overflow-y: auto;
}

/* Breaks horizontal scroll sync */
.scroll-header {
    overflow-x: auto;
}
```

**Why Forbidden:**
- `overflow: hidden` on sticky ancestors breaks `position: sticky`
- Multiple scroll sources require complex JS sync
- Nested scrollable regions confuse user interaction

### 6.2 ❌ Transform/Filter on Sticky Path

**FORBIDDEN:**
```css
.dual-layer-table {
    transform: translateZ(0);  /* Breaks sticky */
    filter: drop-shadow(...);  /* Breaks sticky */
    perspective: 1000px;       /* Breaks sticky */
    contain: layout;           /* Breaks sticky */
}
```

**Why Forbidden:**
- These properties create new stacking contexts
- Sticky positioning references the wrong container
- Causes "sticky doesn't work" symptoms

### 6.3 ❌ Body as Scroll Source

**FORBIDDEN:**
```css
body {
    overflow-y: auto;  /* Creates dual scroll source */
}

.main-content {
    height: auto;  /* Expands to content, no scroll */
}
```

**Why Forbidden:**
- Two vertical scroll sources (body + .main-content)
- Sticky elements reference body instead of .main-content
- Breaks sticky behavior in unpredictable ways

### 6.4 ❌ JS Height Synchronization

**FORBIDDEN:**
```javascript
// Manual height sync (template prohibits this)
function syncRowHeights() {
    fixedRows.forEach((row, i) => {
        row.style.height = scrollRows[i].offsetHeight + 'px';
    });
}
```

**Why Forbidden:**
- Indicates broken CSS (should be automatic)
- Creates performance bottleneck
- Causes layout thrashing on scroll
- This template guarantees alignment via CSS alone

### 6.5 ❌ Nested Table Structures

**FORBIDDEN:**
```html
<!-- Using <table> elements -->
<table>
    <thead>...</thead>
    <tbody>...</tbody>
</table>

<!-- Nested dual-layer-table -->
<div class="dual-layer-table">
    <div class="dual-layer-table">...</div>
</div>
```

**Why Forbidden:**
- `<table>` elements have unpredictable layout behavior
- Cannot achieve pixel-perfect alignment with table cells
- Nested structures break scroll source contract

---

## 7. Implementation Summary

### 7.1 Guaranteed Behaviors

By following this specification, implementations automatically achieve:

1. **Single Scroll Source**: No dual scroll containers or sync complexity
2. **Automatic Alignment**: Zero JS height manipulation required
3. **Sticky Reliability**: Header and fixed column work in all scroll scenarios
4. **Performance**: GPU-accelerated transforms, no layout thrashing
5. **Maintainability**: Clear structure, no hidden dependencies
6. **Predictability**: Behavior matches Excel/Monday.com freeze panes
7. **Scalability**: Works with 10 rows or 10,000 rows (with virtual scrolling)
8. **Browser Compatibility**: Works in all modern browsers (Chrome/Firefox/Safari)

### 7.2 Historical Problems Avoided

This specification prevents:

- ❌ "Sticky doesn't work" (overflow: hidden on ancestors)
- ❌ "Rows misaligned by 1px" (inconsistent box-sizing/borders)
- ❌ "Content shows through header" (z-index or transparency issues)
- ❌ "Dual scrollbars" (multiple scroll sources)
- ❌ "Scroll jank" (using scrollLeft instead of transform)
- ❌ "Bottom gap between fixed and scroll" (missing scrollbar compensation)
- ❌ "Header scrolls away" (header inside fixed-col)

### 7.3 Adoption Checklist

Before implementing a new Scroll XY table:

- [ ] Read this entire specification
- [ ] Verify scroll source hierarchy matches Section 2.3
- [ ] Confirm no `overflow: hidden` on sticky ancestors
- [ ] Ensure `.fixed-row` and `.scroll-row` have identical height
- [ ] Set correct z-index hierarchy (Section 3.3)
- [ ] Add scrollbar compensation padding (Section 5.4)
- [ ] Implement header sync via `transform` (Section 2.2)
- [ ] Run alignment verification (Section 5.1)

---

## 8. CSS Reference (Normative)

### 8.1 Scroll Container

```css
body {
    overflow: hidden;  /* REQUIRED */
}

.main-content {
    overflow-y: auto;  /* REQUIRED */
    overflow-x: hidden;  /* REQUIRED */
    height: calc(100vh - 80px);  /* REQUIRED */
    padding: 0;  /* REQUIRED */
}

.content-area {
    padding: 2rem;  /* Padding moved here */
}
```

### 8.2 Table Structure

```css
.dual-layer-table {
    display: flex;
    flex-direction: column;
    position: relative;
    /* NO overflow property */
}

.table-header-bar {
    position: sticky;  /* REQUIRED */
    top: 0;  /* REQUIRED */
    z-index: 120;  /* REQUIRED */
    display: flex;
    background: #7FB069;  /* MUST be opaque */
}

.table-body-bar {
    display: flex;
}
```

### 8.3 Fixed Column

```css
.fixed-header {
    width: 150px;  /* MUST match .fixed-col */
    flex-shrink: 0;
    /* NO position: sticky */
}

.fixed-col {
    width: 150px;  /* MUST match .fixed-header */
    position: sticky;  /* REQUIRED */
    left: 0;  /* REQUIRED */
    z-index: 110;  /* REQUIRED */
    background: white;  /* MUST be opaque */
}

.fixed-row {
    height: 48px;  /* REQUIRED */
    box-sizing: border-box;  /* REQUIRED */
    border-bottom: 1px solid #E2E8F0;
}
```

### 8.4 Scrollable Column

```css
.scroll-header-viewport {
    flex: 1;
    overflow: hidden;  /* Clipping container */
}

.scroll-header {
    display: flex;
    /* Synced via JS: transform: translateX(-scrollLeft) */
}

.scroll-col {
    overflow-x: auto;  /* REQUIRED */
    overflow-y: hidden;  /* REQUIRED */
}

.scroll-row {
    height: 48px;  /* MUST match .fixed-row */
    box-sizing: border-box;  /* REQUIRED */
    border-bottom: 1px solid #E2E8F0;
    display: flex;
}

.scroll-cell {
    width: 120px;  /* MUST be explicit */
    box-sizing: border-box;  /* REQUIRED */
}
```

### 8.5 Scrollbar Compensation

```css
:root {
    --scrollbar-h: 12px;
}

.fixed-body,
.scroll-body {
    padding-bottom: var(--scrollbar-h);  /* REQUIRED */
}
```

---

## 9. JavaScript Reference (Normative)

### 9.1 Header Scroll Sync (REQUIRED)

```javascript
function syncHeaderScroll() {
    const scrollCol = document.querySelector('.scroll-col');
    const scrollHeader = document.querySelector('.scroll-header');
    
    if (!scrollCol || !scrollHeader) return;
    
    scrollCol.addEventListener('scroll', () => {
        // REQUIRED: Use transform (NOT scrollLeft)
        scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
    });
}

window.addEventListener('DOMContentLoaded', syncHeaderScroll);
```

### 9.2 Alignment Verification (RECOMMENDED)

```javascript
function verifyAlignment() {
    const fixedRows = document.querySelectorAll('.fixed-row');
    const scrollRows = document.querySelectorAll('.scroll-row');
    
    let allAligned = true;
    fixedRows.forEach((fixedRow, index) => {
        const scrollRow = scrollRows[index];
        if (fixedRow.offsetHeight !== scrollRow.offsetHeight) {
            console.error(`❌ Row ${index} misaligned: ` +
                `fixed=${fixedRow.offsetHeight}px, ` +
                `scroll=${scrollRow.offsetHeight}px`);
            allAligned = false;
        }
    });
    
    if (allAligned) {
        console.log('✅ All rows perfectly aligned');
    }
    
    return allAligned;
}
```

### 9.3 Row Rendering (REQUIRED Pattern)

```javascript
function renderTable(data) {
    const fixedBody = document.getElementById('fixedBody');
    const scrollBody = document.getElementById('scrollBody');
    
    // Batch render (REQUIRED for performance)
    fixedBody.innerHTML = data.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row">
            ${item.columns.map(col => `
                <div class="scroll-cell">${col}</div>
            `).join('')}
        </div>
    `).join('');
}
```

---

## 10. Validation & Compliance

### 10.1 Automated Checks

**MUST pass all checks:**

```javascript
// Check 1: Single vertical scroll source
const verticalScrollSources = document.querySelectorAll('[style*="overflow-y: auto"]');
console.assert(verticalScrollSources.length === 1, 'Multiple vertical scroll sources');

// Check 2: Row alignment
console.assert(verifyAlignment(), 'Row alignment failed');

// Check 3: Sticky elements present
const stickyHeader = document.querySelector('.table-header-bar');
const stickyCol = document.querySelector('.fixed-col');
console.assert(
    getComputedStyle(stickyHeader).position === 'sticky',
    'Header not sticky'
);
console.assert(
    getComputedStyle(stickyCol).position === 'sticky',
    'Fixed column not sticky'
);

// Check 4: Z-index hierarchy
const headerZ = parseInt(getComputedStyle(stickyHeader).zIndex);
const colZ = parseInt(getComputedStyle(stickyCol).zIndex);
console.assert(headerZ > colZ, 'Z-index hierarchy violated');
```

### 10.2 Manual Verification

**MUST exhibit behaviors:**

1. **Vertical Scroll Test**
   - Scroll down 10+ rows
   - Header MUST remain at viewport top
   - Content MUST be covered by header (not visible through)

2. **Horizontal Scroll Test**
   - Scroll right 5+ columns
   - Fixed column MUST remain at viewport left
   - Scrollable cells MUST be covered by fixed column

3. **Alignment Test**
   - Run `verifyAlignment()` in console
   - MUST return `true` (all rows aligned)

4. **Performance Test**
   - Scroll rapidly in both directions
   - MUST NOT exhibit jank or lag
   - MUST NOT trigger layout thrashing

---

## 11. Compliance Statement

Implementations claiming conformance to TableTemplate_ScrollXY v2.0 MUST:

1. Implement all REQUIRED behaviors defined in Sections 2-5
2. Avoid all FORBIDDEN patterns defined in Section 6
3. Pass all automated checks defined in Section 10.1
4. Exhibit all manual behaviors defined in Section 10.2

Non-conforming implementations MUST NOT claim compatibility with this specification.

---

**End of Normative Specification**

**Version:** 2.0  
**Authority:** Kitchen Mama Engineering Team  
**Enforcement:** Code Review + Automated Testing
