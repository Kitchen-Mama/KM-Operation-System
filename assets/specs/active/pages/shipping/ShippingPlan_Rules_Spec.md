# Shipping Rules by Country

此文件定義各國站點的出貨計算規範與運輸方式配置。在 AI 精準計算建議數量實作之前，所有出貨計算將依據此規範執行。

---

## 📋 目錄
- [Amazon US](#amazon-us)
- [Amazon UK](#amazon-uk-待補充)
- [Amazon DE](#amazon-de-待補充)
- [其他站點](#其他站點-待補充)

---

## Amazon US

### 基本資訊
- **Country Code**: `US`
- **Marketplace**: `amazon`
- **Target Days 預設值**: `90` 天

### 運輸方式配置

| 運輸方式 | Lead Time | Priority | Cost Level | 適用時段 |
|---------|-----------|----------|-----------|---------|
| 3rd Party | 7 天 | 1 (最高) | Medium | - |
| Air Freight | 12 天 | 4 | High | 18天內需求 |
| Private Ship | 25 天 | 3 | Medium | 30天內需求 |
| AGL Ship | 45 天 | 2 | Low | 45天以上需求 |

### 庫存計算邏輯

#### 1. Current Stock (當前庫存)
```
Current Stock = Available + FC Transfer + FC Processing
```

#### 2. On the Way (在途庫存)
根據 Target Days 動態計算：
- **≤ 18 天**: `Within 18 days`
- **≤ 30 天**: `Within 18 days + Within 30 days`
- **> 30 天**: `Within 18 days + Within 30 days + Within 45 days`

#### 3. 3rd Party Stock (第三方庫存)
```
3rd Party Stock = Winit Stock + ONUS Stock
```

#### 4. Avg. Sales/day (日均銷量)
```
Avg. Sales/day = Last Week Sales / 7
```

#### 5. Days of Supply (庫存可用天數)
```
Days of Supply = Current Stock / Avg. Sales/day
```

### 補貨數量計算 (Suggested Qty)

#### 產品生命週期：New (新品)
**計算基礎**: 60 days Forecast + 本月剩餘天數銷售

```
Total Demand = (FC Next Month + FC Next 2 Month) + (剩餘天數 × Avg. Sales/day)

分時段需求：
- Need 18天內 = Total Demand × (min(18, Target Days) / Target Days) - (Current Stock + Within 18 days)
- Need 30天內 = Total Demand × (min(30, Target Days) / Target Days) - (Current Stock + Within 18 days + Within 30 days) - Need 18天內
- Need 45天+ = Total Demand - (Current Stock + Within 18 days + Within 30 days + Within 45 days) - Need 18天內 - Need 30天內

Suggested Qty = Need 18天內 + Need 30天內 + Need 45天+
```

#### 產品生命週期：Mature / Phasing Out (成熟品/淘汰品)
**計算基礎**: Avg. Sales/day

```
分時段需求：
- Need 18天內 = (Avg. Sales/day × min(18, Target Days)) - (Current Stock + Within 18 days)
- Need 30天內 = (Avg. Sales/day × min(30, Target Days)) - (Current Stock + Within 18 days + Within 30 days) - Need 18天內
- Need 45天+ = (Avg. Sales/day × Target Days) - (Current Stock + Within 18 days + Within 30 days + Within 45 days) - Need 18天內 - Need 30天內

Suggested Qty = Need 18天內 + Need 30天內 + Need 45天+
```

### 整箱進位規則
所有補貨數量必須進位到整箱數量：
```
Final Qty = CEILING(Suggested Qty / Units Per Carton) × Units Per Carton
```

### Shipping Allocation 預設規則

當 SKU **未展開** 時，系統自動使用以下預設分配：

| 時段需求 | 預設運輸方式 | 說明 |
|---------|------------|------|
| Need 18天內 > 0 | Air Freight | 快速補貨，12天到達 |
| Need 30天內 > 0 | Private Ship | 中速補貨，25天到達 |
| Need 45天+ > 0 | AGL Ship | 經濟補貨，45天到達 |

**注意事項**：
- 每個時段的數量會自動進位到整箱
- 使用者可在展開 SKU 後手動調整 Shipping Allocation
- 只有 **US-Amazon** 站點有預設分配規則，其他站點需手動設定

### 紅燈警示條件
當同時滿足以下條件時，Days of Supply 欄位顯示紅色警示：
```
1. Days of Supply < 18
2. (Current Stock + Within 18 days) / Avg. Sales/day < 18
```

### 成本計算

#### 預設單位成本
- **Unit Cost**: `$2.5` / pcs

#### Carrier 費率
| Carrier | Unit Cost | 說明 |
|---------|-----------|------|
| DHL | $3.5 | - |
| FedEx | $3.2 | - |
| UPS | $3.0 | - |
| Maersk | $2.0 | 海運 |

#### 成本結構
```
Total Cost = Total Pcs × Unit Cost
Carrier Fee = Total Cost × 70%
Duty / Custom = Total Cost × 30%
```

---

## Amazon UK (待補充)

### 基本資訊
- **Country Code**: `UK`
- **Marketplace**: `amazon`
- **Target Days 預設值**: `90` 天

### 運輸方式配置

| 運輸方式 | Lead Time | Priority | Cost Level |
|---------|-----------|----------|-----------|
| 3rd Party | 7 天 | 1 | Medium |
| Air Freight | 10 天 | 4 | High |
| Sea Freight | 35 天 | 2 | Low |

**⚠️ 待補充**：
- 庫存計算邏輯
- 補貨數量計算規則
- Shipping Allocation 預設規則

---

## Amazon DE (待補充)

### 基本資訊
- **Country Code**: `DE`
- **Marketplace**: `amazon`
- **Target Days 預設值**: `90` 天

### 運輸方式配置

| 運輸方式 | Lead Time | Priority | Cost Level |
|---------|-----------|----------|-----------|
| 3rd Party | 7 天 | 1 | Medium |
| Air Freight | 10 天 | 4 | High |
| Sea Freight | 35 天 | 2 | Low |

**⚠️ 待補充**：
- 庫存計算邏輯
- 補貨數量計算規則
- Shipping Allocation 預設規則

---

## 其他站點 (待補充)

### 待新增站點
- Amazon CA (加拿大)
- Amazon JP (日本)
- Amazon AU (澳洲)
- Shopify
- Target

---

## 📝 更新記錄

| 日期 | 版本 | 更新內容 | 更新人 |
|------|------|---------|--------|
| 2025-01-XX | 1.0 | 初始版本，完成 Amazon US 規範 | - |

---

## 🔄 未來規劃

### Stage 2: AI 精準計算
- [ ] 整合歷史促銷數據
- [ ] 季節性銷售模型
- [ ] 多方案運輸優化
- [ ] 自動斷貨預警

### Stage 3: 全站點支援
- [ ] 補充 UK、DE 站點規則
- [ ] 新增其他國家站點
- [ ] 支援多 Marketplace (Shopify, Target)
- [ ] 跨站點庫存調撥建議

---

## 📌 注意事項

1. **整箱進位**: 所有補貨數量必須進位到整箱，避免散裝運輸
2. **工廠庫存檢查**: 系統會自動檢查 CN + TW 工廠庫存是否足夠
3. **手動調整優先**: 使用者手動調整的 Shipping Allocation 優先於系統預設
4. **資料來源**: 目前使用 sessionStorage 暫存，未來將改為後端 API

---

**文件維護**: 請在新增或修改任何站點規則時，同步更新此文件。
