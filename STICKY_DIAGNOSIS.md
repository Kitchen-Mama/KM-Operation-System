# SKU Sticky 失敗根因診斷報告

## 問題根源（已確認）

### 1. 致命問題：`.main-content { overflow-x: hidden; }`
**位置**: style.css 第 245 行
**影響**: 完全阻止內部所有 sticky 定位生效
**原因**: `position: sticky` 需要祖先層允許滾動，`overflow: hidden` 會裁切並禁用 sticky

### 2. 衝突的 CSS 選擇器
**問題**: 同一個表格有多組 sticky 規則互相覆蓋
- `.sku-details-table th.col-sku` (正確)
- `.unified-table-wrap .sku-details-table th:first-child` (已刪除但可能殘留)
- 通用 `table th` 規則可能影響

### 3. 水平滾動容器層級混亂
**當前結構**:
```
.main-content (overflow-x: hidden) ❌ 阻止滾動
  └─ .content-area
      └─ #sku-section
          └─ .sku-xscroll (overflow-x: auto) ✓ 正確
              └─ .unified-table-wrap
                  └─ .sku-details-table
                      └─ th.col-sku (sticky) ❌ 被祖先層阻止
```

## 驗證步驟（DevTools）

### A) 水平滾動條實際位置
- **應該在**: `.sku-xscroll` (overflow-x: auto)
- **實際**: 可能被 `.main-content` 的 overflow-x: hidden 阻止

### B) td.col-sku Computed Style
- **position**: 應為 `sticky`，實際可能被覆蓋為 `static`
- **left**: 應為 `0px`
- **z-index**: 應為 `10` (td) 或 `20` (th)

### C) 祖先層檢查
- ❌ `.main-content`: `overflow-x: hidden` (致命)
- ❌ `.content-area`: 曾有 `overflow-x: hidden` (已移除)
- ✓ `.sku-xscroll`: `overflow-x: auto` (正確)
- ✓ `.unified-table-wrap`: `overflow: visible` (正確)

### D) Table 設定
- ✓ `border-collapse: separate` (正確，sticky 需要)
- ✓ `border-spacing: 0` (正確)

## 最小修正方案

### 修正 1: 移除 .main-content 的 overflow-x
```css
.main-content {
    flex: 1;
    margin-left: 250px;
    background: white;
    /* overflow-x: hidden; */ /* 移除：阻止內部 sticky */
}
```

### 修正 2: 確保 .col-sku 樣式優先級
```css
.sku-details-table th.col-sku,
.sku-details-table td.col-sku {
    position: sticky !important;
    left: 0 !important;
    background: #fff !important;
    z-index: 10 !important;
}
```

### 修正 3: 移除所有衝突的 :first-child 規則
確保沒有其他選擇器覆蓋 .col-sku

## 預期結果

修正後，當用戶水平滾動 `.sku-xscroll` 時：
1. SKU 欄位（th.col-sku 和 td.col-sku）固定在左側
2. 其他欄位正常滾動
3. SKU 欄位有右側陰影作為視覺分隔
