# 安全可刪除名冊 (Safe Delete Manifest)
**Generated:** 2026-01-16  
**Project:** Kitchen Mama Operation System

---

## 📋 使用說明

本文件列出所有可安全刪除的檔案。刪除前請：
1. 備份整個專案
2. 逐批刪除並測試
3. 確認所有頁面功能正常

---

## ✅ 1) Safe to Delete (可安全刪除)

### CSS 檔案 (根目錄)

#### `style.css`
- **Reason:** 未被引用，已被 assets/css/base.css 取代
- **Replacement:** `assets/css/base.css`
- **Proof:** `grep -r "style.css" index.html` → 無結果
- **Risk:** 🟢 Low

#### `style-guide.css`
- **Reason:** 未被引用，樣式指南已整合至 components.css
- **Replacement:** `assets/css/components.css`
- **Proof:** `grep -r "style-guide.css" index.html` → 無結果
- **Risk:** 🟢 Low

#### `forecast.css`
- **Reason:** 未被引用，已被 assets/css/pages/fc-overview.css 取代
- **Replacement:** `assets/css/pages/fc-overview.css`
- **Proof:** `grep -r "forecast.css" index.html` → 無結果
- **Risk:** 🟢 Low

#### `fc-summary.css`
- **Reason:** 未被引用，已被 assets/css/pages/fc-raw-data.css 取代
- **Replacement:** `assets/css/pages/fc-raw-data.css`
- **Proof:** `grep -r "fc-summary.css" index.html` → 無結果
- **Risk:** 🟢 Low

#### `factory-stock.css`
- **Reason:** 未被引用，已被 assets/css/pages/factory-stock.css 取代
- **Replacement:** `assets/css/pages/factory-stock.css`
- **Proof:** `grep -r "factory-stock.css" index.html` → 無結果（根目錄版本）
- **Risk:** 🟢 Low

#### `shipping-plan.css`
- **Reason:** 未被引用，已被 assets/css/pages/shipping-plan.css 取代
- **Replacement:** `assets/css/pages/shipping-plan.css`
- **Proof:** `grep -r "shipping-plan.css" index.html` → 無結果（根目錄版本）
- **Risk:** 🟢 Low

#### `shipping-history.css`
- **Reason:** 未被引用，已被 assets/css/pages/shipping-history.css 取代
- **Replacement:** `assets/css/pages/shipping-history.css`
- **Proof:** `grep -r "shipping-history.css" index.html` → 無結果（根目錄版本）
- **Risk:** 🟢 Low

#### `sku-details.css`
- **Reason:** 未被引用，已被 assets/css/pages/sku-details.css 取代
- **Replacement:** `assets/css/pages/sku-details.css`
- **Proof:** `grep -r "sku-details.css" index.html` → 無結果（根目錄版本）
- **Risk:** 🟢 Low

#### `sku-details-sandbox.css`
- **Reason:** Sandbox 測試檔案，未被主系統引用
- **Replacement:** N/A (測試檔案)
- **Proof:** 僅被 `SKU Details SandBox.html` 使用
- **Risk:** 🟢 Low (若不需要 Sandbox)

#### `supplychain.css`
- **Reason:** 未被引用，已被 assets/css/pages/supply-chain-canvas.css 取代
- **Replacement:** `assets/css/pages/supply-chain-canvas.css`
- **Proof:** `grep -r "supplychain.css" index.html` → 無結果（根目錄版本）
- **Risk:** 🟢 Low

---

### JavaScript 檔案 (根目錄)

#### `app.js`
- **Reason:** 未被引用，已被 assets/js/app.js 取代
- **Replacement:** `assets/js/app.js`
- **Proof:** index.html 引用 `assets/js/app.js`
- **Risk:** 🟢 Low

#### `data.js`
- **Reason:** 未被引用，已被 assets/js/utils/data.js 取代
- **Replacement:** `assets/js/utils/data.js`
- **Proof:** index.html 引用 `assets/js/utils/data.js`
- **Risk:** 🟢 Low

#### `canvas.js`
- **Reason:** 未被引用，功能已整合至 assets/js/pages/supplychain.js
- **Replacement:** `assets/js/pages/supplychain.js`
- **Proof:** `grep -r "canvas.js" index.html` → 無結果
- **Risk:** 🟢 Low

#### `forecast.js`
- **Reason:** 未被引用，已被 assets/js/pages/forecast.js 取代
- **Replacement:** `assets/js/pages/forecast.js`
- **Proof:** index.html 引用 `assets/js/pages/forecast.js`
- **Risk:** 🟢 Low

#### `fc-summary.js`
- **Reason:** 未被引用，已被 assets/js/pages/fc-summary.js 取代
- **Replacement:** `assets/js/pages/fc-summary.js`
- **Proof:** index.html 引用 `assets/js/pages/fc-summary.js`
- **Risk:** 🟢 Low

#### `factory-stock-filter.js`
- **Reason:** 未被引用，功能已整合至 assets/js/pages/factory-stock.js
- **Replacement:** `assets/js/pages/factory-stock.js`
- **Proof:** `grep -r "factory-stock-filter.js" index.html` → 無結果
- **Risk:** 🟢 Low

#### `replen-add-sku.js`
- **Reason:** 未被引用，功能已整合至 assets/js/pages/inventory-replenishment.js
- **Replacement:** `assets/js/pages/inventory-replenishment.js`
- **Proof:** `grep -r "replen-add-sku.js" index.html` → 無結果
- **Risk:** 🟢 Low

#### `shipping-history.js`
- **Reason:** 未被引用，已被 assets/js/pages/shipping-history.js 取代
- **Replacement:** `assets/js/pages/shipping-history.js`
- **Proof:** index.html 引用 `assets/js/pages/shipping-history.js`
- **Risk:** 🟢 Low

#### `sku-data-sandbox.js`
- **Reason:** Sandbox 測試檔案
- **Replacement:** N/A (測試檔案)
- **Proof:** 僅被 `SKU Details SandBox.html` 使用
- **Risk:** 🟢 Low (若不需要 Sandbox)

#### `sku-sandbox.js`
- **Reason:** Sandbox 測試檔案
- **Replacement:** N/A (測試檔案)
- **Proof:** 僅被 `SKU Details SandBox.html` 使用
- **Risk:** 🟢 Low (若不需要 Sandbox)

#### `sku-scroll.js`
- **Reason:** 未被引用，功能已整合至 assets/js/pages/sku-details.js
- **Replacement:** `assets/js/pages/sku-details.js`
- **Proof:** `grep -r "sku-scroll.js" index.html` → 無結果
- **Risk:** 🟢 Low

---

## ⚠️ 2) Needs Review (需人工確認)

### `SKU Details SandBox.html`
- **Reason:** 測試/開發用 HTML
- **Status:** 需確認是否仍在使用
- **Action:** 
  - 若不需要 → 可刪除
  - 若需要 → 移至 `/dev/` 或 `/sandbox/` 資料夾
- **Risk:** 🟡 Medium

### `Oeration.code-workspace`
- **Reason:** VS Code workspace 設定檔
- **Status:** 開發環境設定
- **Action:** 保留（開發者個人設定）
- **Risk:** 🟢 Low

### `W1 筆記.txt`
- **Reason:** 開發筆記
- **Status:** 文件資料
- **Action:** 
  - 若內容重要 → 移至 `/docs/` 或 `assets/specs/logs/`
  - 若已過期 → 可刪除
- **Risk:** 🟡 Medium

### `螢幕擷取畫面 2025-12-21 141655.png`
- **Reason:** 截圖檔案
- **Status:** 可能為文件用圖片
- **Action:**
  - 若需要 → 移至 `assets/img/docs/`
  - 若不需要 → 可刪除
- **Risk:** 🟢 Low

---

## 🚫 3) Do Not Delete (不可刪除)

### 必要檔案

#### `index.html`
- **Reason:** 主入口檔案
- **Status:** 核心檔案

#### `README.md`
- **Reason:** 專案說明文件
- **Status:** 文件檔案

#### `KM_Red_LOGO (5).png`
- **Reason:** 目前被 index.html 引用
- **Status:** 需移動至 `assets/img/` 但不可刪除
- **Action:** 移動後更新 index.html 引用

### Assets 資料夾
- **Reason:** 所有功能資源
- **Status:** 核心資料夾
- **Action:** 保留所有內容

### 文件資料夾
- `Shipping Plan Submit/`
- `活動行事曆/`
- **Reason:** 專案文件
- **Status:** 保留

---

## 📦 批次刪除建議

### Batch 1: CSS 檔案 (低風險)
```bash
# 備份
mkdir backup_css
cp *.css backup_css/

# 刪除
rm style.css style-guide.css forecast.css fc-summary.css factory-stock.css
rm shipping-plan.css shipping-history.css sku-details.css supplychain.css
```

### Batch 2: JS 檔案 (低風險)
```bash
# 備份
mkdir backup_js
cp *.js backup_js/

# 刪除
rm app.js data.js canvas.js forecast.js fc-summary.js
rm factory-stock-filter.js replen-add-sku.js shipping-history.js sku-scroll.js
```

### Batch 3: Sandbox 檔案 (需確認)
```bash
# 若確認不需要
rm "SKU Details SandBox.html" sku-data-sandbox.js sku-sandbox.js sku-details-sandbox.css
```

---

## ✅ 驗證清單

刪除後請逐一驗證：

- [ ] 首頁載入正常
- [ ] 補貨試算器功能正常
- [ ] 貨物庫存表功能正常
- [ ] Factory Stock 功能正常
- [ ] Forecast 管理功能正常
- [ ] FC Summary 功能正常
- [ ] SKU Details 功能正常
- [ ] Shipping Plan 功能正常
- [ ] Shipping History 功能正常
- [ ] Supply Chain Canvas 功能正常
- [ ] 無 Console 錯誤
- [ ] 所有樣式正常顯示

---

## 🔄 回滾計畫

若刪除後出現問題：

1. 停止刪除
2. 從 backup_css / backup_js 還原檔案
3. 重新測試
4. 記錄問題檔案至 "Needs Review"

---

**總計可安全刪除:** 22 個檔案  
**需人工確認:** 4 個檔案  
**不可刪除:** 核心檔案 + assets/

**預估清理後專案大小減少:** ~30-40%
