# Table Template: Sticky XY Freeze Panes (Wide Table)

**Version:** 1.0  
**Reference Implementation:** `SKU Test-2.html` + `sku-test-2.css`  
**Last Updated:** 2025-01-XX

---

## 1. Overview

### 1.1 Purpose
This template defines the standard structure and styling for **wide tables with fixed left column and sticky header**, similar to Excel/Monday.com "Freeze Panes" functionality.

### 1.2 Use Cases
- SKU management tables (SKU Details, Inventory Replenishment)
- Any data table requiring:
  - Fixed left column (e.g., SKU, ID, Name)
  - Sticky header row (remains visible during vertical scroll)
  - Horizontal scrolling for many columns
  - Perfect row alignment between fixed and scrollable areas

### 1.3 Reference Implementation
**Source of Truth:** `SKU Test-2.html` + `sku-test-2.css`

This template is based on a **tested and stable** implementation. Do NOT deviate from this structure unless explicitly required.

---

## 2. HTML Structure

### 2.1 Core Architecture

```html
<main class="main-content">
  <div class="content-pad">
    <div class="dual-layer-table">
      
      <!-- Sticky Header Bar (entire header row) -->
      <div class="table-header-bar">
        <!-- Left: Fixed SKU Header -->
        <div class="fixed-header">
          <div class="header-cell">SKU</div>
        </div>
        
        <!-- Right: Scrollable Headers -->
        <div class="scroll-header-viewport">
          <div class="scroll-header">
            <div class="header-cell">Column 1</div>
            <div class="header-cell">Column 2</div>
            <div class="header-cell">Column 3</div>
            <!-- ... more columns ... -->
          </div>
        </div>
      </div>
      
      <!-- Table Body -->
      <div class="table-body-bar">
        <!-- Left: Fixed Column (SKU) -->
        <div class="fixed-col">
          <div class="fixed-body" id="fixedBody">
            <!-- Rendered by JS: <div class="fixed-row">KM-001</div> -->
          </div>
        </div>
        
        <!-- Right: Scrollable Columns -->
        <div class="scroll-col">
          <div class="scroll-body" id="scrollBody">
            <!-- Rendered by JS: 
            <div class="scroll-row">
              <div class="scroll-cell">Value 1</div>
              <div class="scroll-cell">Value 2</div>
              ...
            </div>
            -->
          </div>
        </div>
      </div>
      
    </div>
  </div>
</main>
```

### 2.2 Key Structural Rules

#### ✅ DO
- `.main-content` is the **ONLY vertical scroll source** (no padding)
- `.content-pad` wraps the table and provides padding (prevents sticky offset)
- `.table-header-bar` contains **both** fixed and scrollable headers
- `.scroll-col` is the **ONLY horizontal scroll source**
- `.fixed-col` contains **ONLY** `.fixed-body` (no header inside)

#### ❌ DON'T
- Do NOT put header inside `.fixed-col`
- Do NOT add `overflow: hidden` to `.dual-layer-table` (breaks sticky)
- Do NOT use `<table>` elements or `colspan`
- Do NOT create multiple scroll containers that need JS sync
- Do NOT add padding to `.main-content` (use `.content-pad` instead)

---

## 3. CSS Architecture

### 3.1 CSS Variables

```css
:root {
    --scrollbar-h: 12px;  /* Horizontal scrollbar height compensation */
}
```

### 3.2 Core Selectors

#### Scroll Container
```css
.main-content {
    flex: 1;
    overflow-y: auto;      /* Single vertical scroll source */
    overflow-x: hidden;
    padding: 0;            /* NO padding here */
    position: relative;
}

.content-pad {
    padding: 2rem;         /* Padding moved here */
}
```

#### Table Container
```css
.dual-layer-table {
    display: flex;
    flex-direction: column;
    background: white;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    position: relative;
    /* NO overflow: hidden */
}
```

#### Sticky Header Bar
```css
.table-header-bar {
    position: sticky;
    top: 0;
    z-index: 120;          /* Highest z-index */
    display: flex;
    background: #7FB069;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
```

#### Fixed Header (Left)
```css
.fixed-header {
    width: 150px;          /* Must match .fixed-col width */
    flex-shrink: 0;
    background: #7FB069;
    border-right: 2px solid #CBD5E1;
    /* NO position: sticky */
    /* NO left: 0 */
}

.fixed-header .header-cell {
    height: 48px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    color: white;
    font-weight: 500;
    box-sizing: border-box;
}
```

#### Scroll Header Viewport (Right)
```css
.scroll-header-viewport {
    flex: 1;
    overflow: hidden;      /* Clipping container */
    position: relative;
    z-index: 90;           /* Lower than fixed-header */
}

.scroll-header {
    display: flex;
    background: #7FB069;
    min-width: max-content;
    /* Will be transformed by JS: translateX(-scrollLeft) */
}

.scroll-header .header-cell {
    height: 48px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    color: white;
    font-weight: 500;
    border-right: 1px solid rgba(255,255,255,0.2);
    white-space: nowrap;
    flex-shrink: 0;
    box-sizing: border-box;
    width: 120px;          /* Set explicit width per column */
}
```

#### Table Body
```css
.table-body-bar {
    display: flex;
}

.fixed-col {
    width: 150px;          /* Must match .fixed-header width */
    flex-shrink: 0;
    position: sticky;
    left: 0;
    z-index: 110;          /* Higher than scroll content */
    background: white;
    border-right: 2px solid #CBD5E1;
}

.fixed-body {
    background: white;
    padding-bottom: var(--scrollbar-h);  /* Compensate scrollbar */
}

.fixed-row {
    height: 48px;          /* Fixed height */
    padding: 0 12px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid #E2E8F0;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
}

.scroll-col {
    flex: 1;
    overflow-x: auto;      /* Single horizontal scroll source */
    overflow-y: hidden;
}

.scroll-body {
    background: white;
    padding-bottom: var(--scrollbar-h);  /* Compensate scrollbar */
}

.scroll-row {
    height: 48px;          /* Must match .fixed-row height */
    display: flex;
    min-width: max-content;
    border-bottom: 1px solid #E2E8F0;
    cursor: pointer;
    box-sizing: border-box;
}

.scroll-cell {
    padding: 0 12px;
    display: flex;
    align-items: center;
    border-right: 1px solid #E2E8F0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    box-sizing: border-box;
    width: 120px;          /* Must match header width */
}
```

### 3.3 Z-Index Hierarchy

```
120: .table-header-bar (sticky header)
110: .fixed-col (sticky left column)
 90: .scroll-header-viewport (scrollable header area)
  1: .scroll-col (scrollable content)
```

**Rule:** Fixed elements must have higher z-index than scrollable elements to ensure proper overlap.

---

## 4. JavaScript Requirements

### 4.1 Minimal JS (Header Scroll Sync)

```javascript
function syncHeaderScroll() {
    const scrollCol = document.querySelector('.scroll-col');
    const scrollHeader = document.querySelector('.scroll-header');
    
    if (!scrollCol || !scrollHeader) return;
    
    scrollCol.addEventListener('scroll', () => {
        scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
    });
}

window.addEventListener('DOMContentLoaded', () => {
    syncHeaderScroll();
});
```

**Purpose:** Sync horizontal scroll position from `.scroll-col` to `.scroll-header`.

**Critical:** This is the ONLY scroll synchronization needed. Do NOT add multiple scroll listeners or complex sync logic.

### 4.2 Row Rendering

```javascript
function renderTable(data) {
    const fixedBody = document.getElementById('fixedBody');
    const scrollBody = document.getElementById('scrollBody');
    
    // Render fixed column (SKU)
    fixedBody.innerHTML = data.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    
    // Render scrollable columns
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row">
            <div class="scroll-cell">${item.col1}</div>
            <div class="scroll-cell">${item.col2}</div>
            <div class="scroll-cell">${item.col3}</div>
        </div>
    `).join('');
}
```

### 4.3 Alignment Verification

```javascript
function verifyAlignment() {
    const fixedRows = document.querySelectorAll('.fixed-row');
    const scrollRows = document.querySelectorAll('.scroll-row');
    
    let allAligned = true;
    fixedRows.forEach((fixedRow, index) => {
        const scrollRow = scrollRows[index];
        if (fixedRow.offsetHeight !== scrollRow.offsetHeight) {
            console.error(`Row ${index} height mismatch`);
            allAligned = false;
        }
    });
    
    if (allAligned) {
        console.log('✅ All rows perfectly aligned!');
    }
}
```

---

## 5. Critical Rules & Common Pitfalls

### 5.1 Sticky Behavior

#### ✅ Correct
- `.table-header-bar` has `position: sticky; top: 0`
- `.fixed-col` has `position: sticky; left: 0`
- `.main-content` is the scroll container (no `overflow: hidden` ancestors)

#### ❌ Wrong
- Adding `overflow: hidden` to `.dual-layer-table` → breaks sticky
- Putting header inside `.fixed-col` → header scrolls away
- Using `position: sticky` on `.fixed-header` → conflicts with parent sticky

### 5.2 Row Alignment

#### ✅ Correct
- Both `.fixed-row` and `.scroll-row` have `height: 48px`
- Both use `box-sizing: border-box`
- Border is on the row level, not cell level
- Padding compensation: `padding-bottom: var(--scrollbar-h)`

#### ❌ Wrong
- Different heights between fixed and scroll rows
- Border on cells instead of rows → causes 1px mismatch
- Missing `box-sizing: border-box` → border adds to height

### 5.3 Scroll Sources

#### ✅ Correct
- **Vertical:** `.main-content` only
- **Horizontal:** `.scroll-col` only
- Header synced via JS `transform: translateX()`

#### ❌ Wrong
- Multiple vertical scroll containers
- Multiple horizontal scroll containers needing manual sync
- Using `scrollLeft` sync instead of `transform`

---

## 6. Customization Guide

### 6.1 Changing Fixed Column Width

```css
/* Update both selectors */
.fixed-header {
    width: 200px;  /* Change from 150px */
}

.fixed-col {
    width: 200px;  /* Must match */
}
```

### 6.2 Adding More Columns

```html
<!-- In .scroll-header -->
<div class="header-cell">New Column</div>
```

```css
/* Add width rule */
.scroll-header .header-cell:nth-child(11) { width: 150px; }
.scroll-cell:nth-child(11) { width: 150px; }
```

### 6.3 Changing Row Height

```css
/* Update all row-related heights */
.fixed-header .header-cell,
.scroll-header .header-cell,
.fixed-row,
.scroll-row {
    height: 56px;  /* Change from 48px */
}
```

---

## 7. Browser Compatibility

### 7.1 Tested Browsers
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)

### 7.2 Known Limitations
- `position: sticky` requires modern browsers (IE11 not supported)
- Scrollbar styling (`::-webkit-scrollbar`) is Chrome/Safari only

---

## 8. Performance Considerations

### 8.1 Rendering
- Use `innerHTML` batch rendering (not individual DOM operations)
- Avoid re-rendering entire table on scroll
- Consider virtual scrolling for >1000 rows (Stage 2)

### 8.2 Scroll Performance
- Use `transform` for header sync (GPU-accelerated)
- Avoid `scrollLeft` manipulation (causes reflow)
- Debounce scroll events if adding analytics

---

## 9. Validation Checklist

Before deploying a table using this template, verify:

- [ ] Vertical scroll: Header stays fixed at top
- [ ] Horizontal scroll: Fixed column stays at left
- [ ] Content is covered by header (not transparent)
- [ ] Fixed column covers scrollable content (not vice versa)
- [ ] All rows have identical height (run `verifyAlignment()`)
- [ ] No console errors about missing elements
- [ ] Scrollbar appears only on `.scroll-col` (not on body)
- [ ] No "jumping" or "jank" during scroll

---

## 10. Migration from Old Structure

If migrating from old dual-layer table structure:

### 10.1 HTML Changes
```diff
- <div class="fixed-col">
-   <div class="fixed-header">...</div>
-   <div class="fixed-body">...</div>
- </div>

+ <div class="table-header-bar">
+   <div class="fixed-header">...</div>
+   <div class="scroll-header-viewport">...</div>
+ </div>
+ <div class="table-body-bar">
+   <div class="fixed-col">
+     <div class="fixed-body">...</div>
+   </div>
+   ...
+ </div>
```

### 10.2 CSS Changes
```diff
.fixed-header {
-   position: sticky;
-   top: 0;
-   left: 0;
    width: 150px;
}

.table-header-bar {
+   position: sticky;
+   top: 0;
+   z-index: 120;
}
```

---

## 11. Troubleshooting

### Issue: Header not sticky
**Cause:** Ancestor has `overflow: hidden`  
**Fix:** Remove `overflow: hidden` from `.dual-layer-table`

### Issue: Rows misaligned
**Cause:** Different heights or box-sizing  
**Fix:** Ensure both `.fixed-row` and `.scroll-row` have same `height` and `box-sizing: border-box`

### Issue: Content shows through header
**Cause:** Low z-index or transparent background  
**Fix:** Set `.table-header-bar { z-index: 120; background: #7FB069; }`

### Issue: Fixed column doesn't cover scrollable content
**Cause:** Low z-index  
**Fix:** Set `.fixed-col { z-index: 110; }` (higher than scroll content)

### Issue: Header doesn't scroll horizontally
**Cause:** Missing JS sync  
**Fix:** Ensure `syncHeaderScroll()` is called on page load

---

## 12. Reference Files

- **HTML:** `SKU Test-2.html`
- **CSS:** `sku-test-2.css`
- **JS:** `sku-test-2.js`
- **Data:** `sku-test-2-data.js`

**When in doubt, refer to these files as the source of truth.**

---

**End of Table Template Specification v1.0**
