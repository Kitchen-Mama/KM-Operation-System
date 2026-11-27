# PO 顯示與日期排序：Codex 完成交接

日期：2026-11-27，Asia/Taipei。來源基準：Main `75e9024f`。

## Owner 最新確認

Owner 已實測 Workspace 的 Update 可以更新，並提供 Sheet 日期已寫入的截圖。原本「無法編輯」的疑問已解除；本次不新增或重寫編輯後端，不宣稱修復了一個未重現的編輯缺陷。

## 本次修改

- 匯入 quantity=0、未生產=ordered 的 PO，原始 `order_status=issued` 是既有設計：已下單，可在生產中 Workspace 執行 Update／Receive。**不是缺少 inspection／completion／ship 日期造成。**
- 將前端 `issued` 的顯示名稱統一成 `In Production`。Overview 狀態選單保留 raw value，標為 `In Production (Issued PO)`，與 raw `in_production` 選項區分。
- Workspace 與 Overview 在各自既有分組／tab 中按 `order_date` 由早到晚，先排序再分頁。同日按 PO 編號、再按 ID 穩定排列；缺日期放最後。
- Workspace 不再用 created_at 假裝 Order Date。保留 Draft／In Production 分組與 completed 離開 Workspace 的規則。
- 更新兩個頁面在 index.html 的 cache tokens；不變更共用 importer 本體。
- 不回寫既有 PO status，不動數量、庫存、收貨、日期資料或 GAS。

`APPS_SCRIPT_SYNC_REQUIRED = NONE`；`BUNDLE_REBUILD_REQUIRED = NO`；`SCHEMA_CHANGE = NONE`。

## 驗證

| 本輪實跑 | 結果 |
|---|---|
| 新 imported-PO／排序／Update browser，1440、390 | 32 checks，exit 0 |
| Active PO Workspace browser | 12 checks，exit 0 |
| Request→PO→Update→Receive 主線 browser | 66 checks，exit 0 |
| PO 200-row browser | 40 checks，exit 0 |
| PO release-cache | 3 tests，exit 0 |

新測試使用真實匯入程式在記憶體建立 31 張零收貨 PO，涵蓋兩頁、跨狀態、相同日期、空日期、日期編輯與 bounded readback。確認 UI sorting/render 無業務寫入、保留 issued 且沒有增加 stock/movement。瀏覽器攔截網路，outbound=0。桌機與手機截圖已檢視。

以上是本機合成服務邊界，不是代理對正式庫的讀寫或 native 200-row 認證；Owner 成功更新日期是另一筆使用者實測證據。

## 給 Claude

Codex 已獨立完成這項前端窄修正，並依 Owner 本輪要求提交與 push。實際完成 commit 以 Main／origin 的 Git log 為準。請先唯讀核對此文件及目前 tip，不要重做此任務。

- 保留這次 Order Date 升冪及 issued 顯示映射；後續 B/C 整合不可蓋回 created_at 降冪或 status 優先排序。
- Update 功能正常，不再列待修；不要因為 Sheet 還是 issued 就補跑 status migration。
- 前一輪額外安排的 Receive 等按鈕進行式／disabled／未知結果防重送，**仍是獨立待辦**，本次沒有納入。
- Chat R3、B/C 與 Local Server 的分支／核准界線維持既有交接，不夾帶未驗收候選至 Main。
