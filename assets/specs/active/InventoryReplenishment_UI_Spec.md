# Inventory Replenishment System - UI Structure Specification

**Version:** 1.1  
**Related:** ReplenishmentSystem_PRD.md v1.1  
**Last Updated:** 2025-01-XX

**Changelog v1.1:**
- Changed to single vertical scroll source (Main Content Area only)
- Changed to single horizontal scroll source (unified scroll container)
- Restructured Expand Panel to fixed + scrollable sections (avoid colspan issues)
- Moved virtualization/lazy-load to Stage 2/3 considerations
- Added Stage 1 Definition of Done (DoD)

---

## 1. Page Layer Architecture

### Layer 0: Page Container
**Responsibility:** Overall page layout and navigation
```
├─ Global Header (fixed)
├─ Sidebar Navigation (fixed)
└─ Main Content Area (single vertical scroll source)
```

**Scroll Behavior:**
- **Vertical:** Main Content Area ONLY (single source)
- **Horizontal:** None at this layer

---

### Layer 1: Control Panel + Table Wrapper
**Responsibility:** Filters, actions, and table structure

```
Main Content Area (scrollable vertical)
├─ Control Panel (sticky top)
│  ├─ Country Selector
│  ├─ Marketplace Selector
│  ├─ Target Days Input
│  └─ Bulk Actions (Submit Batch, Export)
│
└─ Table Wrapper (no independent scroll)
   └─ Replenishment Table (Layer 2)
```

**Scroll Behavior:**
- **Vertical:** Inherits from Main Content Area (no independent scroll)
- **Horizontal:** None (handled in Layer 2)

**Sticky Elements:**
- Control Panel sticks to top of Main Content Area

---

### Layer 2: Replenishment Table
**Responsibility:** Data display with fixed + scrollable columns

```
Table Wrapper
├─ Table Structure
│  ├─ Fixed Column Area (SKU, sticky left)
│  │  ├─ Fixed Header Cell
│  │  └─ Fixed Body Cells
│  │
│  └─ Scrollable Column Area (single horizontal scroll source)
│     ├─ Scrollable Header Row (sticky top)
│     └─ Scrollable Body Rows
│
└─ Expand Panels (Layer 3, when triggered)
   ├─ Expand Panel Fixed Section (aligned with SKU column)
   └─ Expand Panel Scrollable Section (within horizontal scroll area)
```

**Scroll Behavior:**
- **Vertical:** Inherits from Main Content Area
- **Horizontal:** Single scroll container for all scrollable columns

**Fixed/Sticky Elements:**
- **Table Header (scrollable part):** Sticky to top of Main Content Area
- **SKU Column:** Sticky to left (both header and body)

---

## 2. Column Structure & Scroll Responsibility

### 2.1 Fixed Column (Sticky Left)
**Column:** SKU  
**Width:** 120px (fixed)  
**Behavior:**
- Always visible during horizontal scroll
- Z-index above scrollable area
- Shadow/border to indicate separation

### 2.2 Scrollable Columns (Single Horizontal Scroll Source)
**Columns:**
1. Lifecycle Type (100px)
2. Product Name (200px)
3. Current Inventory (120px)
4. Avg Daily Sales (120px)
5. Forecast (120px)
6. Days of Supply (120px)
7. On the Way (120px)
8. Suggested Replenishment (150px)
9. Planned Replenishment (150px, editable)
10. Status (100px)

**Total Width:** ~1,400px (requires horizontal scroll on most screens)

**Scroll Container:**
- Single horizontal scroll wrapper contains:
  - Scrollable header row
  - All scrollable body rows
  - Scrollable sections of expand panels
- Native browser scroll (no manual synchronization needed)

---

## 3. Layer 3: SKU Expand Panel

### 3.1 Trigger
**Action:** User clicks anywhere on a table row

### 3.2 Structure (Fixed + Scrollable Side-by-Side)
```
Expanded Row
├─ Collapsed Row (still visible, highlighted)
│
└─ Expand Panel Container (inserted below row)
   ├─ Expand Panel Fixed Section (width: 120px, aligned with SKU column)
   │  ├─ SKU Info
   │  ├─ Product Image
   │  └─ Quick Actions
   │
   └─ Expand Panel Scrollable Section (within horizontal scroll area)
      ├─ Section 1: Sales Trend Chart (400px)
      ├─ Section 2: Forecast Breakdown (400px)
      └─ Section 3: Existing Plans List (400px+)
```

**Why This Structure:**
- Avoids `colspan` issues with sticky columns
- Fixed section naturally aligns with SKU column
- Scrollable section naturally scrolls with table columns
- No manual scroll synchronization needed

### 3.3 Scroll Behavior
**Vertical:**
- Expand Panel scrolls with Main Content Area (no independent scroll)
- Panel content does NOT have internal vertical scroll

**Horizontal:**
- Fixed Section: Does NOT scroll (aligned with SKU column)
- Scrollable Section: Scrolls with table columns (same scroll container)

### 3.4 Width Calculation
```
Fixed Section Width = 120px (matches SKU column)
Scrollable Section Width = 1200px (3 sections × 400px)
Total Panel Width = 1320px
```

**Responsive Behavior:**
- On narrow screens, sections within scrollable area remain side-by-side
- User scrolls horizontally to view all sections

---

## 4. Detailed Component Responsibilities

### 4.1 Control Panel (Layer 1)
**Position:** Sticky top within Main Content Area  
**Height:** 60px  
**Z-index:** 100  

**Components:**
- Country Dropdown (150px)
- Marketplace Dropdown (150px)
- Target Days Input (120px)
- Bulk Actions Button (120px)
- Export Button (100px)

**Behavior:**
- Sticks to top when Main Content Area scrolls
- Always visible during vertical scroll

---

### 4.2 Table Header (Layer 2)
**Position:** Sticky top within Main Content Area  
**Height:** 48px  
**Z-index:** 90  

**Structure:**
```
├─ Fixed Header Cell: SKU (sticky left, z-index 95)
└─ Scrollable Header Row (within horizontal scroll container)
```

**Behavior:**
- Sticks to top of Main Content Area (below Control Panel)
- Scrollable part scrolls horizontally with body
- SKU header cell stays fixed left

---

### 4.3 Table Body (Layer 2)
**Position:** Within Main Content Area scroll  
**Row Height:** 48px (collapsed), dynamic (expanded)  

**Row States:**
1. **Default:** White background
2. **Hover:** Light gray background
3. **Expanded:** Highlighted background, expand panel visible
4. **Selected:** (for bulk actions) Checkbox checked, blue tint

**Behavior:**
- Scrolls vertically with Main Content Area
- Scrollable cells scroll horizontally within single scroll container
- Expand panel pushes subsequent rows down

---

### 4.4 Expand Panel (Layer 3)
**Position:** Inserted below expanded row  
**Height:** Fixed 400px  
**Z-index:** 85  

**Fixed Section (120px width):**
- SKU identifier
- Product thumbnail
- Quick action buttons

**Scrollable Section (1200px width):**
1. **Sales Trend Chart (400px)**
   - Canvas/SVG chart
   - Fixed height: 350px

2. **Forecast Breakdown (400px)**
   - Base forecast display
   - Promo impact (if any)
   - Total forecast calculation

3. **Existing Plans List (400px+)**
   - Plan cards (each 80px height)
   - Internal vertical scroll if >4 plans
   - "+ Create New Plan" button

**Behavior:**
- Animates in/out (slide down/up, 200ms)
- Closes when clicking row again or another row
- Scrolls vertically with Main Content Area
- Scrollable section scrolls horizontally with table

---

## 5. Scroll Behavior Summary

### 5.1 Vertical Scroll (Single Source)
| Element | Scrolls? | Container |
|---------|----------|-----------|
| Global Header | ❌ Fixed | - |
| Sidebar | ❌ Fixed | - |
| Control Panel | ❌ Sticky | Main Content Area |
| Table Header | ❌ Sticky | Main Content Area |
| Table Body | ✅ Yes | Main Content Area |
| Expand Panel | ✅ Yes | Main Content Area |

**Key Point:** Main Content Area is the ONLY vertical scroll source.

### 5.2 Horizontal Scroll (Single Source)
| Element | Scrolls? | Container |
|---------|----------|-----------|
| SKU Column (Header) | ❌ Fixed | - |
| SKU Column (Body) | ❌ Fixed | - |
| Scrollable Columns (Header) | ✅ Yes | Horizontal Scroll Container |
| Scrollable Columns (Body) | ✅ Yes | Horizontal Scroll Container |
| Expand Panel Fixed Section | ❌ Fixed | - |
| Expand Panel Scrollable Section | ✅ Yes | Horizontal Scroll Container |

**Key Point:** Single horizontal scroll container wraps all scrollable elements. No manual synchronization needed.

---

## 6. Fixed/Sticky Elements Reference

### 6.1 Fixed Elements (Always Visible)
```
Global Header (z-index: 1000)
Sidebar (z-index: 900)
SKU Column (z-index: 95, sticky left)
```

### 6.2 Sticky Elements (Scroll-Dependent)
```
Control Panel (z-index: 100, sticky top within Main Content)
Table Header (z-index: 90, sticky top within Main Content)
```

### 6.3 Z-Index Hierarchy
```
1000: Global Header
900: Sidebar
100: Control Panel
95: Fixed SKU Column (Header & Body)
90: Table Header (Scrollable Part)
85: Expand Panel
1: Table Body (default)
```

---

## 7. Responsive Breakpoints

### 7.1 Desktop (>1440px)
- Minimal horizontal scroll
- All expand panel sections visible with slight scroll

### 7.2 Laptop (1024px - 1440px)
- Horizontal scroll required
- Expand panel sections require scrolling to view all

### 7.3 Tablet (768px - 1024px)
- Significant horizontal scroll
- Consider hiding less critical columns

### 7.4 Mobile (<768px)
- Not primary use case for Stage 1
- Future: Card-based layout

---

## 8. Interaction States

### 8.1 Row States
1. **Default:** No interaction
2. **Hover:** Cursor pointer, background highlight
3. **Expanded:** Row highlighted, expand panel visible
4. **Selected:** Checkbox checked (for bulk actions)
5. **Editing:** Inline edit mode (Planned Replenishment field)

### 8.2 Expand Panel States
1. **Closed:** Not visible
2. **Opening:** Slide-down animation (200ms)
3. **Open:** Fully visible, interactive
4. **Closing:** Slide-up animation (200ms)

### 8.3 Scroll States
1. **Top:** Control Panel visible, no shadow
2. **Scrolling:** Control Panel sticky, shadow appears
3. **Bottom:** End of content

---

## 9. Stage 2/3 Considerations (Not Stage 1 Requirements)

### 9.1 Performance Optimization (Stage 2)
- **Virtual Scrolling:** For >100 SKUs, render only visible rows + buffer
- **Lazy Loading:** Load expand panel content on demand
- **Debounced Scroll:** Optimize scroll event handling

### 9.2 Advanced Scroll Features (Stage 3)
- **Smooth Scroll Sync:** If multiple scroll containers needed
- **Scroll Position Memory:** Remember scroll position per session
- **Keyboard Navigation:** Arrow keys for row navigation

### 9.3 Enhanced Expand Panel (Stage 2/3)
- **Tabbed Interface:** Switch between chart/forecast/plans
- **Inline Editing:** Edit plans directly in expand panel
- **Drag-to-Reorder:** Reorder plans by priority

---

## 10. Structure Pseudo-Code (Structural Level Only)

```
<div class="page-container">
  <!-- Layer 0 -->
  <header class="global-header fixed"></header>
  <aside class="sidebar fixed"></aside>
  
  <!-- Main Content Area: SINGLE VERTICAL SCROLL SOURCE -->
  <main class="main-content scrollable-vertical">
    
    <!-- Layer 1: Control Panel -->
    <section class="control-panel sticky-top">
      <div class="filters"></div>
      <div class="actions"></div>
    </section>
    
    <!-- Layer 2: Table Wrapper -->
    <div class="table-wrapper">
      
      <!-- Fixed Column Area -->
      <div class="fixed-column-area sticky-left">
        <div class="fixed-header-cell sticky-top">SKU</div>
        <div class="fixed-body-cells">
          <div class="fixed-cell">KM-001</div>
          <div class="fixed-cell">KM-002</div>
        </div>
      </div>
      
      <!-- Scrollable Column Area: SINGLE HORIZONTAL SCROLL SOURCE -->
      <div class="scrollable-column-area horizontal-scroll">
        
        <!-- Scrollable Header -->
        <div class="scrollable-header sticky-top">
          <div class="header-cell">Lifecycle</div>
          <div class="header-cell">Product Name</div>
          <!-- ... more headers ... -->
        </div>
        
        <!-- Scrollable Body -->
        <div class="scrollable-body">
          <div class="body-row">
            <div class="body-cell">Mature</div>
            <div class="body-cell">Product A</div>
            <!-- ... more cells ... -->
          </div>
        </div>
        
      </div>
      
      <!-- Layer 3: Expand Panel (when row expanded) -->
      <div class="expand-panel-container">
        
        <!-- Fixed Section (aligned with SKU column) -->
        <div class="expand-panel-fixed sticky-left">
          <div class="sku-info">KM-001</div>
          <div class="product-image"></div>
          <div class="quick-actions"></div>
        </div>
        
        <!-- Scrollable Section (within horizontal scroll area) -->
        <div class="expand-panel-scrollable horizontal-scroll">
          <section class="panel-section chart"></section>
          <section class="panel-section forecast"></section>
          <section class="panel-section plans"></section>
        </div>
        
      </div>
      
    </div>
  </main>
</div>
```

**Key Structural Points:**
- No `<table>` element to avoid `colspan` issues with sticky columns
- Fixed and scrollable areas are sibling divs (side-by-side)
- Single horizontal scroll container wraps all scrollable content
- Expand panel follows same fixed + scrollable pattern

---

## 11. Stage 1 Definition of Done (DoD)

### 11.1 Vertical Scroll Requirements
✅ Main Content Area is the ONLY vertical scroll container  
✅ Control Panel sticks to top during scroll  
✅ Table Header sticks to top during scroll  
✅ No nested vertical scroll containers  

### 11.2 Horizontal Scroll Requirements
✅ Single horizontal scroll container for all scrollable columns  
✅ SKU column remains fixed (does not scroll)  
✅ Header, body, and expand panel scrollable sections scroll together naturally  
✅ No manual scroll synchronization code required  

### 11.3 Fixed/Sticky Requirements
✅ SKU column sticky left (header and body)  
✅ Table header sticky top  
✅ Control panel sticky top  
✅ Z-index hierarchy prevents overlap issues  

### 11.4 Expand Panel Requirements
✅ Panel splits into fixed section (120px) + scrollable section (1200px+)  
✅ Fixed section aligns with SKU column  
✅ Scrollable section scrolls with table columns  
✅ Panel does not break layout when expanded  
✅ Panel animates smoothly (slide down/up)  

### 11.5 Performance Baseline (Stage 1)
✅ Table loads in <2s for 100 SKUs  
✅ Scroll feels smooth (no jank)  
✅ Expand panel opens in <200ms  
⚠️ Virtual scrolling NOT required for Stage 1  

### 11.6 Browser Compatibility (Stage 1)
✅ Chrome/Edge (latest)  
✅ Firefox (latest)  
✅ Safari (latest)  
⚠️ Mobile browsers NOT required for Stage 1  

### Table Usability (Stage 1 Required)

- Header row must remain visible during vertical scroll
- SKU column must remain visible during horizontal scroll
- No advanced header grouping or resizing in Stage 1


---

**End of UI Structure Specification v1.1**
