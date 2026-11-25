# Campaign Builder 交付與驗收

## 部署狀態

本輪是 Production 前端及公開 GS 原始碼修復，不是正式 DB 補資料作業。
Git push / GitHub Pages 不會替你部署 Apps Script；正式寫入驗收必須在相符 GS 部署後執行。
沒有執行正式 Campaign 建立、收貨、重新匯入 Shipment、重算或 DB 修改。

新建活動的正式資料模型：

- `campaigns`：公司、站點、Promotion Type、Event Flag、活動日期。
- `campaign_sku_lines`：參加 SKU、當時正式原價、促銷價、幣別、折扣。
- `fc_special_events`：唯一的期間 FC，帶 `campaign_id`、`campaign_sku_line_id`。不再另存第二份 FC。
- 兩個入口共用 Builder 與 journaled save。三表寫入經回讀核對；失敗嘗試補償，無法驗證補償則保留未知收據並擋同站點新建，不宣稱成功。

Site Inventory 既有活動需求公式保持不變：期間 FC 逐日分配，與既有基礎需求一起投影。
不把同一份 FC 從 Campaign 與 Special Event 各加一次。兩種 Driven 模式都有本機公式測試。
舊的本機 Promotion overlay 不會自動變成正式 DB 活動；沒有 FC 的紀錄不猜數量。

## 安裝

執行 `node assets/tools/package-campaign-builder.cjs` 產生公開 GS 包及 manifest。
本包包含本輪六個變更檔，另帶先前 Mixed Cartons / Warehouse Lifecycle 的相符累計依賴，共 15 個公開 GS。
以包內 AppsScript 的同名檔案更新 Production；不存在的 88 模組需新增。
不要把這包套去 Sandbox，也不要從其他目錄整批覆蓋專案。
保留 `00_config`、`84_*`、PIN、憑證、部署 ID 與本包外的模組。
尤其不要從目前 active 目錄額外複製 `66_api_v1_request_order_send.gs`：該本機來源有已知 R49 / 已部署版宣告 R64 的歷史差異。

全部檔案更新完成後，儲存並編輯原 Web App 部署，選新版本，維持原網址。
必須整組更新，不能只貼 router / health，否則模組版本閘會拒絕混版。
部署後重新整理前端。舊的已知正式版本仍可使用它原有的功能，但新 Builder 會明確要求相符後端，不會偷偷退回本機儲存。

新 action：`campaign.builder.get`、`campaign.builder.status`（唯讀）、`campaign.builder.save`（寫入）。
沒有開放 `import.commit` 的 campaign_builder domain 給一般匯入入口。

## 操作規則

- Normal 是一般促銷，也建立活動期間 FC；不是 regular monthly FC 的替代編輯。
- Normal 同年可多檔；相同公司／國家／Marketplace／SKU 的日期重疊會拒絕，包含同 Type 的重複活動，以免需求計入兩次。
- 原有大型節慶 SKU／flag／year 唯一性限制仍保留；此輪只放寬 Normal 的年度限制。
- 單 SKU 最多 8 列；批次最多 500 列。批次按 Category／Series／Currency 分卡，不把不同原價硬合併成一個價。
- 原價由當前 `pricing_list` 正式解析取得；缺價格、重複身份、缺幣別不以 0／USD 代替。
- 過往活動只能選同公司／國家／Marketplace、同 Promotion Type，且已結束並早於新活動的 Campaign。
- 所有當前仍有效的歷史參加 SKU 帶入；原價使用現在的正式價格，歷史折扣可保留或統一覆蓋；FC 成長比例另外套用。
- 價格、折扣、FC 仍可逐列修改。空白 FC 明確跳過；0、負值、小數或無效 FC 不可當成有效提報。
- Preview 後任一內容改動就需重做 Preview。風險警告沿用 Promotion Risk 計算。
- 未收到儲存確認時，只查收據，不自動重送；同分頁重新整理後會恢復待查收據。
- Existing Events 保留原有受版本控制的編輯流程；本輪新的三表補償命令用於新建活動。

## 待驗收清單

- [ ] 更新 GS 部署後，兩個入口都可開啟同一 Builder；沒有 backend update / module mismatch。
- [ ] Special Event 用 Normal + 正常 Promotion Type 建一檔未來活動，價格、折扣、FC 正確。
- [ ] Promotion Risk 用單 SKU 與 Category／Series 各建活動，重新進頁仍看得到正式紀錄。
- [ ] 同站點／同 Type 的過往活動可帶入；其他公司、站點、Type 及未結束活動不出現。
- [ ] 統一折扣、FC 成長比例可獨立套用；逐 SKU 修改後的值才是儲存值。
- [ ] 同 SKU 重疊日期被拒絕；不同檔期 Normal 可提報；缺價／缺 FC 不假裝成功。
- [ ] 檢查三表關聯與件數一致，FC 只在 fc_special_events 存一份。
- [ ] 重算 Site Inventory 後，兩種來源、兩種 Driven 的活動需求反映在期間與補貨建議；舊重算結果先刷新，不要拿未重算的 snapshot 當新結果。
- [ ] 手機的卡片可橫向查看，SKU 欄固定，沒有文字重疊或整頁水平溢出。
- [ ] 不確定儲存狀態時用 Check Save Status；COMMITTED 才顯示已儲存，無第二次建立。

## 已匯入 Shipment 在途數量

新版 Overseas Stock 在途數量 = 符合條件 Shipment line 的出貨量減累計收貨量，按 destination_warehouse_id + SKU 彙總。
snapshot 的 `wh_on_the_way_qty` 是獨立的舊匯入／盤點參考值，不是新畫面的自動在途帳，不應為了讓畫面顯示數量而手填。
手填 snapshot 不會建立 Shipment 關聯；現有收貨程式不會把這個手填欄位自動減掉。
有完整 Shipment 來源時，部分接收會讓動態在途下降，完整接收歸零；實際入庫只由收貨 ledger 負責。

已有匯入票不必重匯／重建庫存。先查 More Info 的 Shipment On The Way、Snapshot On The Way 與 Source Checks：

1. `destination_warehouse_id` 必須指向正確海外倉，不可把 source warehouse 當目的倉。
2. 公司與目的倉一致；3PL 的正式歷史匯入應已提交為 `IMPORT_HISTORICAL` / `COUNTED`，不能仍 PENDING。
3. 實際出貨狀態、SKU、shipment_qty、shipment_received_qty 必須完整，收貨量不得超過出貨量。
4. 收貨走 Shipment receipt，不另用 Available 手動增加同一批貨。
5. 如果歷史關聯或 import receipt 不完整，先逐票唯讀核對再安排專用修復，不直接改 snapshot 或重匯整票。

先前 Warehouse Lifecycle 盤點曾查到 AMZLGS 六票共 3,486 件未收；WINIT 已收不計。這是先前盤點時間的結果，不是本輪重新讀取的即時餘額。

## 下單鏈狀態

本機 Request → 審核／退回／重送 → Convert PO → 文件 → 部分／完整收貨的 112 項測試通過。
不能因此宣稱正式環境全鏈驗收完成：仍須核對 `/exec` 已部署版本、真實模板／Drive 權限與小數量端到端驗收。
安裝與驗收順序見 `ORDER_MAINLINE_C2_INSTALL_20261123.txt`。

## 本機證據

- Campaign command/core/入口 22 個測試；production policy / client single-flight 21 個測試。
- Playwright 桌面／手機 24 個檢查，連到真實 GS handler 的記憶體 fixture；無正式資料寫入。
- Site Inventory daily formula 392；Forecast year 62；Warehouse Lifecycle 69 + workspace 16。
- 下單鏈 112；四個既有 FC 鎖／關聯／讀回測試套件通過；Mixed Cartons command 11。
- source bundle 為 64 模組，AST 與發布版執行內容等價；policy、public config、health pins 一致。

這些是有界本機證據，不是零 bug 保證，也不等於正式環境 UAT。
