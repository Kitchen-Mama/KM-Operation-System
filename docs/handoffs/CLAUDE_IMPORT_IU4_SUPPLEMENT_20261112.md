# Claude 接續補充：匯入 IU4、Sales Trend 與後續工作

更新日期：2026-11-12。這份補充優先於先前交接中相衝突的描述。
請先讀完、回報實際工作範圍與版本，不要直接發布或覆蓋 Codex 候選。

## 0. 最新發布與分工補充（IU4N1，優先於下方歷史描述）

使用者已確認 Claude 無雲端／同檔寫入，並授權 Codex 單獨發布本批。下方「尚未安裝」是原始 IU4 的歷史狀態，不再是最新發布狀態。

- Sandbox 原部署已更新為 32 版；Production 原部署已更新為 319 版，網址與權限不變。GS 儲存後重新載入，透過編輯器讀回完整 LF-normalized 內容相符；不是原始 API 位元組證據。
- 本批未寫入任何 DB 資料列、未改 schema／密碼／權限／排程，未執行正式匯入交易。
- 最終兩環境基底位於專案根目錄下 `output/codex-phase1-20261109/import-receipt-r4-20261112/release-iu4n1/`。不要使用舊的 root GS mirror 或 Sandbox 整包覆蓋 Production。
- Sandbox：`Sandbox/candidate/MANIFEST.json` SHA-256 `866cd2441584fcebf7e754d96621514d01dd4efdaeb6308f596a2366fb8c3b46`。
- Production：`Production/candidate/MANIFEST.json` SHA-256 `467766665e030d9c38b05dd0be152b4049de13356e07f585aaacecb67313abac`。
- 13_ 本輪未改。Sandbox SHA-256 `b6dd49c47ec5d8e161353956b1d05463bc96979d4b0698a7cd1cef19bf06aff2`；Production SHA-256 `59bc18b8a7b6896a8f32d049fb92b3365ee8e9f6e6639ab90f548d59317ae00b`。差異包含正式環境相容需求，須先比較，不可直接統一。
- 本批 GS：Sandbox 63_／82_；Production 01_／63_／82_。Production 01_ 僅更新發布 profile／版本綁定，動作清單、匯入 scopes、登入及 Administration／AI 閘門不變。
- 名稱已套用兩環境：Forecast Management、Shipping Plan Review、Shipment Workspace、Global Shipment Tracking；Site Inventory 沿用。Sales Performance 改名並在選單反灰。Order Planning 移到 Procurement Center 第一項；內部 section／action ID 不變。
- 沒有把日期只顯示年月日、恢復其他 Administration 頁面、Sales Trend、採購防重或新功能混入本批。這些保留為後續任務。
- 本機兩環境匯入回歸各為 54/54、27/27、5/5、13/13；Production 真實 router／登入負向套件 107/107，前端 profile 閘門 19/19，名稱／選單 DOM 檢查 28/28。功能測試有明示合成 actor，不作真實登入或雲端交易證據。失敗輪次均保留。
- 原 IU4 32/32 Chrome／ExcelJS 證據只涵蓋位元組相同的匯入前端與 API 替身，不宣稱本批已完成雲端匯入 Apply 驗收。使用者將於線上驗收。

### Claude 現在可以做什麼

1. 批次 A Sales Trend：可先開始唯讀程式診斷，查明 BQ → DB → API → 畫面五個日期；現場未知列明未知，不重跑匯入或改排程。
2. **使用者已明確核准批次 B**：收到 Codex 本批發布完成通知與上述基底後，開始 G-1／G-2 最小本機修正，只改自己固定副本中的 13_，兩環境分開差異與測試，不改雲端／DB、不部署／push。先交 13_ 兩基底差異說明，再修正。
3. G-1 鎖內拒絕取消已有收貨、剩餘庫存或有效配貨的 PO。G-2 收貨需有效版本，鎖內重讀比對，缺失／無效／過期拒絕，收據重播不得先抓最新版本繞過衝突。
4. G-3 共用實體收貨識別、DP-6 出貨端重查 PO 狀態仍先交方案；不直接修改 82_、32_、34_、共用 UI 或新增 schema。
5. 保留 Codex 整合權：01_、63_、82_、import-batch.js、app.js、index.html、db-api 與相關頁面只交精確差異，不直接寫入本批候選。13_ 若需要前端傳遞版本，也要一併交差異方案，不能只改後端就稱完整驗收。
6. 任務 9 D1–D7、AI Plan／Gap 決策、Chat scopes／觸發器仍未核准實作。下方建議不等於核准。
7. 交回完整 hash、受測基底、指令／計數／結束碼、反向對照、失敗／NOT_RUN 與替身範圍。已知 G-1／G-2／G-3 未因 IU4N1 發布而關閉。

## 1. 現在的分工與發布關卡

- Codex 本輪只修匯入；IU4 是獨立本機候選，尚未安裝 Sandbox，也未發布 Production。
- 使用者要求：Production 同步前，先把 Claude 最新修改交回 Codex 核對。這項核對完成前，不可自行部署、推送 main 或沿用上一輪發布授權。
- 不能假設 Claude 只改 Sandbox。請回報每個工作目錄、精確基底、修改檔案及完整 SHA-256、是否動過雲端，以及仍在執行的工作。
- 不修改或清除正式 DB 資料。使用者會自行清除以前的測試資料，本輪不要再展開歷史清帳、補公司或回填。
- 不讀 00_config、私人 pin、密碼設定、登入憑證或 webhook URL；不把它們加入檔案、日誌、Git。

## 2. Codex IU4 已完成的本機工作

候選目錄（相對於目前專案根目錄）：
`output/codex-phase1-20261109/import-receipt-r4-20261112/candidate`

候選 MANIFEST SHA-256：
`63cfe5c04a30e7ef9fc42d42ba80ae342e88a523540c67bfe49a7170849a1a91`

基底：已發布的 Sandbox 31 / IU3 候選；其 MANIFEST SHA-256：
`2635657bad6332374d716cf3ba42a691d884f8a62615d8755c474035b7390c92`

Production 目前已知發布基底是 318；不是這份 Sandbox 候選。主工作區舊 GS mirror 不應當作已部署的權威來源。

功能規則：

1. New receipt：quantity 是本批新增收貨量。新增 PO，或對有正確 ID／版本的既有有效 PO 收貨；PO completed／remaining 與工廠實體庫存加相同數量。
2. 其他舊 PO 的公司空白、計數不平或既存 PO／庫存差異，不再全面阻擋正常新增。保留舊差異並在預覽警告，不自動修復。
3. Update current data：quantity 是目標剩餘量。只改檔案列出的有效目標，實體庫存同步差額，已出貨量與預留量不變。
4. 未改數量的歷史問題列可保持原樣、附警告，不阻擋其他有效列。不能藉此變更舊公司歸屬。
5. 真正修改到的舊列仍檢查 ID、版本、公司、計數、訂購上限與配貨／預留下限。空白公司不猜成 ResTW；有問題會列明 PO、SKU、檔案列。
6. 同批防重、鎖內預覽重算、失敗回滾、UNKNOWN 不自動重送等保護保留。新增 PO／明細寫後加上讀回檢查。
7. PO company 是 PO 歸屬，不因此把 ResTW 工廠庫存鎖死為只能 ResTW 出貨；既有跨公司配貨規則不變。
8. 可以直接選 .xlsx，不必先按模式按鈕下載。選模式與下載解耦；檔案有 _SYSTEM 時核對 domain／mode／schema／warehouse，無 metadata 的舊檔需明確選模式。矛盾時拒絕，不能靠檔名猜 ADD 或 SET。
9. 沒有把匯入冪等誇稱為「同一批實體貨跨 UI／匯入永不重複」。G-3 尚待共用收貨識別設計。

真正邏輯修改：82_、import-batch.js。63_ 只更新相依版本戳。
另有純載入版本更新：po-factory-import.js、factory-stock.js、overseas-stock.js、purchase-order-list.js、shipping-history.js、app.js、index.html。
01_、81_、13_、11_、32_、Sales Trend／BQ／公式／排程未修改。

凍結位元組上的本機結果：54/54 既有共用匯入、13/13 新情境、27/27 剩餘量更新、5/5 公司／跨公司／海外範本、32/32 headless Chrome。
兩個舊測試的「既存差異必須全面拒絕」斷言依使用者新規則明確改版，舊檔及失敗輪次保留。沒有偷偷降低其他預期值。
Chrome 測試封鎖網路、API 為明示替身、使用真實 ExcelJS 解析；不是雲端交易證據。Sandbox 實機匯入與 Production 整合均未完成。

## 3. 避免雙方修改同檔

- Codex 暫持 82_、63_、共用 import-batch.js 與匯入入口的整合權；不得直接覆蓋這些檔案。
- Claude 可在自己的固定副本分析／製作 13_、15_、32_ 採購修正，或 17_ 費率卡方案、85_／11_ 通知修正；每批仍需回報精確變更範圍。
- 01_、63_、db-api、共用 UI／app／index、82_、shipping-plan.js 的需求，先交「對精確基底的差異方案」，由單一整合者套用。
- 交回時附：完整 hash、測試指令／計數／結束碼、失敗與 NOT_RUN、測試替身、雲端是否有變更。不要只說全綠。
- 先比較兩邊基底與最終檔，不可拿任一方舊整包蓋過另一方新增修正。

## 4. Sales Trend：交給 Claude 的額外支線

先做唯讀診斷，不混進 IU4。使用者看到 CA Amazon 圖到 11/08，畫面日期為 11/12；不能直接判成圖表或 BQ 的錯。

1. 查 06_–10_ Amazon 匯入鏈、來源 SQL／日期範圍／時區、增量回補策略，以及實際呼叫入口；再查 60_ 與前端圖表的日期選取。
2. 分別列出：BQ 來源最新完整日、DB 最新日、匯入最後成功日、API 回傳最新日、畫面 Through 日期。讀不到的項目明列未知，不可從程式靜態推定現場資料新鮮度。
3. 檢查延遲到資料是否被「只抓昨天」漏掉、過去失敗是否有缺日、是否被舊 recommendation date 限制。
4. 不把缺日填 0、不把圖表硬標成今天／昨天、不換成另一個站點的日期。
5. 不自行重跑正式匯入、回填銷售、改排程或來源設定。先交最小原因與修法，必要現場唯讀請求另列。

## 5. 採購完整鏈：優先於新功能的安全修補

G-1／G-2／G-3 已有本機獨立重現，但尚非完整現場驗收。請優先交最小本機修正計畫與檔案邊界；這份交接不代替使用者核准新增寫入入口、schema 或正式發布。

- G-1：鎖內拒絕取消已有收貨／剩餘庫存／有效配貨的 PO；出貨端也要重查 PO 狀態（DP-6）。不可清掉數量來達成取消。
- G-2：僅選填 expected_completed_qty 不足。需定義必帶的有效版本／前置條件，鎖內重讀後比對；缺失、無效、過期拒絕。先處理同請求收據重播，不從送出前重讀最新版掩蓋衝突。
- G-3：僅選填 supplier_receipt_ref 不足。先提出 UI 與匯入共用的實體收貨識別、唯一性範圍、多 SKU／分批規則、部分失敗恢復。涉及 82_ 時與 Codex 協調；若需新欄／表，列精確 schema 另請核准。
- G-6：對照 IU4 的限定目標／差額同步規則，不要恢復「一列舊壞資料擋全部正常新增」。目標列本身的無效資料仍不得自動修。
- G-9：先釐清已完工未出貨、未生產、預留與實體庫存的定義及呼叫端。公式、扣預留及加總變更先提出，不直接調整。
- Sandbox DP-1：列出每個必要的 PO／RO 動作與副作用、守門同步及反向測試，等使用者明確核准；不要概括開放全部採購動作。

修好前的操作限制：已收貨 PO 不取消；一批實體收貨只用 UI 或匯入一條路；不從兩分頁同時收貨。

## 6. 費率卡任務 9：建議值，尚未視為使用者核准

- D1：一律建新版本，不原地改價。
- D2：明確選生效日，不能早於當日且嚴格晚於同條件舊卡；同日多次改版先提出處理方案，不自行回溯或偷改日期。
- D3：既存估價保留，列出受影響草稿並提供使用者主動重新報價；不靜默改已保存金額。
- D4：既然不原地改價，就不用靠推測 Plan 是否用卡來允許原地修改；相符條件僅作影響提示，不說成確定引用。
- D5：建議稽核表，但先交精確欄位、容量與保留規則，兩環境分開核准建表。
- D6：首版每批同一 carrier、同一幣別，建議最多 50 張；不能跨幣別加總。
- D7：共享密碼階段沒有個人角色；停用舊卡先限 Owner 維護，鎖內確認沒有未出貨引用，不開放無差別強制停用。

UI 先做可討論的設計，不擴成全站改版：篩選列、可展開的同條件倉庫群、價格／有效期／使用中欄、選取後批次編輯面板、逐卡改前後預覽與收據。分組不只看價格相同。

## 7. AI Plan／Gap 任務 10：先分析與本機驗證

- 分清「計算基準日」與「最新完整銷售日」。建議兩種 Gap 共用 as_of=D，銷售取已完成且實際可取得的日期；改既有 D-1 語意需先取得使用者確認。
- 不把間隔 30 分鐘當成前一工作已成功。設計來源版本、成功狀態、執行中隔離、續跑／超時；先量測後優化。
- Weekly 自動產生僅限 Draft，不可自動 Submit／Approve／預留／扣庫；Sandbox 通過後另核准 Production 開關與觸發器。
- 90 天／最多 30 正常日、活動排除、缺值不當 0 的既有規則保留。EU 缺值、過舊週資料 fallback、時區偏移先交反例和公式提案，不偷改。
- 現場先申請時區、Triggers、Executions、Automation 與錯誤全文的最小唯讀證據；不能把會寫入的查工作狀態函式稱為唯讀。

## 8. Chat 任務 8：建議 A，實際設定與權限仍需核准

- 先維持本機候選與假 HTTP 測試；建議鎖內排入通知、鎖外立即送一次，失敗不回滾 Plan，也不引導重新 Submit。
- 不未驗證就宣稱 webhook 的 message ID 能保證 exactly-once；請查 Google 官方支援方式，對結果不明不自動重送。
- 重試 429／5xx 的設計需說明可能重複與是否冪等；佇列要有容量／保留／恢復策略，不能無上限寫 Properties。
- 先唯讀確認各環境 manifest。新增 external_request 只代表新增 HTTP 能力，不代表 PDF 匯出已授權或驗收通過。
- Production scope、新觸發器、真實測試訊息與 webhook 設定均須另核准。網址只由 Owner 私下設定，不寫日誌。

## 9. 其他仍要保留的待辦

- 名稱已同意：Forecast Management、Sales Performance、Shipping Plan Review、Shipment Workspace、Global Shipment Tracking；Site Inventory 沿用。
- Administration 其他頁面是否只是隱藏需比對原程式；不要聲稱已刪除或直接放行寫入設定。
- 訂單／Shipment 日期只顯示年月日：只改呈現，不改 DB 時間、版本 token、排序或時區計算。
- 任務 5 Sales Outlook 不可漏掉，排在安全修補與先前優先事項之後。
- 任務 7 TEMP／DB backup tab 清理：先列出精確名稱、依賴／排程、備份與恢復證據，不憑 TEMP 或 backup 字樣刪除。
- 任務 6：最後完成 Production／Sandbox 實體目錄分離；測試與證據集中 Sandbox，正式發佈物不夾測試／私密設定。
- 任務 12：全站視覺層級與深淺色模式在任務 6 後討論定案；品牌色 #f04f5e，登入按鈕白字。未核准前不全站改色或改字級。

請先回覆：收到分工、現在實際有無雲端／同檔寫入，以及下一個最小本機修正批次。不要把上述建議與待確認項目當成全面上線授權。
