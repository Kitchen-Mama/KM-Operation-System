# Refactoring Guide (Optional Improvements)
**Project**: Kitchen Mama Operation System  
**Purpose**: 可選的代碼優化建議（非必要）

---

## ⚠️ Important Notice

**Current Status**: ✅ 專案架構已達到最佳實踐標準  
**Required Changes**: **0** (無需修改)  
**Optional Improvements**: 2 (代碼清晰度優化)

本文件僅包含**可選的優化建議**，不影響功能或隔離性。

---

## A. Optional Improvements

### 1️⃣ Function Naming Clarity (Optional)

#### Issue
兩個函數名稱可以更明確，但不影響功能：

| Current Name | Used In | Issue |
|--------------|---------|-------|
| `toggleSection()` | SKU Details | 名稱較泛用 |
| `renderRecords()` | Restock Calculator | 名稱不夠明確 |

**Current Impact**: ✅ None (functions only used in specific contexts)

---

#### Improvement 1: toggleSection → toggleSkuSection

**Current Code** (app.js):
```javascript
function toggleSection(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const arrow = section.querySelector('.arrow');
    
    section.classList.toggle('is-collapsed');
    
    if (section.classList.contains('is-collapsed')) {
        arrow.textContent = '▶';
    } else {
        arrow.textContent = '▼';
    }
}

window.toggleSection = toggleSection;
```

**Suggested Code**:
```javascript
function toggleSkuSection(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const arrow = section.querySelector('.arrow');
    
    section.classList.toggle('is-collapsed');
    
    if (section.classList.contains('is-collapsed')) {
        arrow.textContent = '▶';
    } else {
        arrow.textContent = '▼';
    }
}

window.toggleSkuSection = toggleSkuSection;
```

**HTML Changes** (index.html - 3 places):
```html
<!-- Before -->
<h3 class="sku-section-header" onclick="toggleSection('upcoming')">
<h3 class="sku-section-header" onclick="toggleSection('running')">
<h3 class="sku-section-header" onclick="toggleSection('phasing')">

<!-- After -->
<h3 class="sku-section-header" onclick="toggleSkuSection('upcoming')">
<h3 class="sku-section-header" onclick="toggleSkuSection('running')">
<h3 class="sku-section-header" onclick="toggleSkuSection('phasing')">
```

**Benefit**: 函數名稱更明確表示用途  
**Risk**: 🟢 Very Low  
**Time**: 5 minutes  
**Priority**: P3 (Nice to have)

---

#### Improvement 2: renderRecords → renderRestockRecords

**Current Code** (app.js):
```javascript
function renderRecords() {
    const recordsList = document.getElementById('recordsList');
    const records = window.DataRepo.getRecords();
    
    recordsList.innerHTML = records.map(record => 
        `<li>SKU: ${record.sku}, 目標天數: ${record.targetDays}, 建議補貨量: ${record.recommendQty}, 時間: ${record.created_at}</li>`
    ).join('');
}

window.renderRecords = renderRecords;
```

**Suggested Code**:
```javascript
function renderRestockRecords() {
    const recordsList = document.getElementById('recordsList');
    const records = window.DataRepo.getRecords();
    
    recordsList.innerHTML = records.map(record => 
        `<li>SKU: ${record.sku}, 目標天數: ${record.targetDays}, 建議補貨量: ${record.recommendQty}, 時間: ${record.created_at}</li>`
    ).join('');
}

window.renderRestockRecords = renderRestockRecords;
```

**Update Calls** (app.js - 2 places):
```javascript
// Before
window.addEventListener('DOMContentLoaded', () => {
    renderRecords();
    // ...
});

function calculateRestock() {
    // ...
    window.DataRepo.saveRecord(record);
    renderRecords();
}

// After
window.addEventListener('DOMContentLoaded', () => {
    renderRestockRecords();
    // ...
});

function calculateRestock() {
    // ...
    window.DataRepo.saveRecord(record);
    renderRestockRecords();
}
```

**Benefit**: 函數名稱更明確表示用途  
**Risk**: 🟢 Very Low  
**Time**: 5 minutes  
**Priority**: P3 (Nice to have)

---

### 2️⃣ DOM Query Specificity (Optional)

#### Issue
一個 DOM query 可以添加 container scope 提高明確性：

**Current Code** (app.js - toggleShippingPlanCard):
```javascript
function toggleShippingPlanCard(index) {
    const cards = document.querySelectorAll('.sp-card');
    const card = cards[index];
    const btn = card.querySelector('.sp-btn-expand');
    
    card.classList.toggle('is-expanded');
    btn.textContent = card.classList.contains('is-expanded') ? 'Collapse' : 'Expand';
}
```

**Suggested Code**:
```javascript
function toggleShippingPlanCard(index) {
    const container = document.getElementById('shippingplan-section');
    const cards = container.querySelectorAll('.sp-card');
    const card = cards[index];
    const btn = card.querySelector('.sp-btn-expand');
    
    card.classList.toggle('is-expanded');
    btn.textContent = card.classList.contains('is-expanded') ? 'Collapse' : 'Expand';
}
```

**Benefit**: 更明確的 scope，避免未來可能的衝突  
**Risk**: 🟢 Very Low  
**Time**: 5 minutes  
**Priority**: P3 (Nice to have)

---

## B. Implementation Guide (If Chosen)

### Step 1: Backup
```bash
git add .
git commit -m "Backup before optional refactoring"
```

### Step 2: Make Changes
按照上述建議逐一修改（可選）

### Step 3: Test
- [ ] SKU Details 收合功能
- [ ] 補貨試算器紀錄顯示
- [ ] Shipping Plan card 展開/收合

### Step 4: Commit
```bash
git add .
git commit -m "Optional: Improve function naming clarity"
```

---

## C. Decision Matrix

### Should You Implement These Changes?

| Factor | Yes | No |
|--------|-----|-----|
| Team has extra time | ✓ | |
| Code clarity is priority | ✓ | |
| No urgent features | ✓ | |
| Current code works fine | | ✓ |
| No complaints about naming | | ✓ |
| Tight deadline | | ✓ |

**Recommendation**: 
- ✅ If you have time and want perfect code clarity → Implement
- ✅ If current code works well and no issues → Skip

---

## D. Summary

### Current State
- ✅ Architecture: Excellent
- ✅ Isolation: Perfect
- ✅ Functionality: Working
- ✅ Maintainability: High

### Optional Improvements
- 🟡 Function naming: Could be more specific
- 🟡 DOM query: Could add container scope

### Recommendation
**Keep current code** unless you specifically want to improve naming clarity.

**Total Time if Implemented**: ~15 minutes  
**Impact**: Minimal (code clarity only)  
**Priority**: P3 (Nice to have)  
**Required**: ❌ No

---

**Document Version**: 2.0 (Updated)  
**Status**: Optional improvements only  
**Action Required**: None
