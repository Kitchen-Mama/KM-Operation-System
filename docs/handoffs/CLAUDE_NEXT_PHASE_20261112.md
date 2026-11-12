# Claude 接續指令：Production IU3 後續任務

日期：2026-11-12。這份文件是接續工作說明，不是新的遠端發布或刪除授權。

## 先讀這段

請先盤點目前 Git、部署、候選與證據，向 Vic 簡短回報後再做指定工作。不要重跑全部歷史測試，也不要把「試建／替身／靜態檢查」寫成實機驗收。

本輪使用者授權 Codex 更新指定 Production 檔案並 push；此授權不代表下一輪可以自行發布。後續依 `CLAUDE.md`：預設止於本地提交，遠端更新、發布與刪除需有對應的明確授權。

## 接手基底

- 專案根目錄：`C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/Operation System`。
- Production 後端：原部署更新至 **318 版**；網址、執行身分與權限不變。
- Production profile：`KM-PRODUCTION-PHASE1-20261112-R2-AV1-IU3`。
- 本輪前端提交：`c7778d55`，已 push `origin/main`。
- GitHub Pages：`https://kitchen-mama.github.io/KM-Operation-System/`。
- Sandbox 後端：原部署更新至 **31 版**；驗收網址 `http://127.0.0.1:59470/`。
- Pages 發布工作已成功；11 個變更的靜態檔案全部與候選 LF hash 相符，證據是本機 `PUBLIC_ASSETS_VERIFIED.json`。這不是正式庫存交易驗收。

下列路徑均從專案根目錄起算：

| 用途 | 路徑 |
| --- | --- |
| 本輪封存根目錄 | `output/codex-phase1-20261109/import-update-r1-20261112/release-r3` |
| 正式候選 | 上述目錄的 `Production/candidate` |
| 沙盒候選 | 上述目錄的 `Sandbox/candidate` |
| 正式保存後讀回 | `Production/READBACK_FRESH_TAB.json` |
| 正式部署證據 | `Production/DEPLOYED_AX.txt`、`deployed-318.png` |
| 正式發布核對 | `Production/PUBLIC_ASSETS_VERIFIED.json` |
| 沙盒讀回與依賴審查 | `Sandbox/READBACK_UI_LF.json`、`TEMP_STATIC_AUDIT.json` |

Production MANIFEST SHA256：`e612adf1090e2ae30d398753fdd7f835aef226553e29aaf9f6e7a91fe0b74586`。

Sandbox MANIFEST SHA256：`2635657bad6332374d716cf3ba42a691d884f8a62615d8755c474035b7390c92`。

**不要直接把根目錄舊的 GS 鏡像當成目前雲端基底。** 正式 GS 的交付基準是封存候選及 MANIFEST；候選僅含增量 GS，其餘檔案由既有 manifest 的完整清單繼承。資料夾／正式來源統整仍是第 6 項待辦，不能用整包覆蓋來解決。不要修改封存候選；修正時另建新候選。

## Codex 已完成的範圍

1. PO／Factory 共用匯入兩入口使用相同流程、檔案與收據。New receipt 新增已收貨數量，同時增加 PO completed／remaining 與工廠實體庫存。同批跨入口重送不再增加。
2. Update current data 的 quantity 是「更新後剩餘量」，不是訂購量或新增量。同步調整 PO 與工廠庫存差額；已出貨量不變，檔案未列資料不動，低於預留、超過訂購量、版本過期或原帳不平都拒絕，不自動補平。新增空白列先限定新 PO，可含多 SKU，不替既有 PO 加新 SKU。
3. 匯出只取可更新、尚有 remaining 的資料。舊 PO 的公司無法確認時不讓整份匯出失敗，該列公司留空並明列警告；上傳前須由使用者提供合法公司，程式不猜測、不回填 DB。
4. 匯入日期選填：空白按匯入當日，Validate 預覽顯示。純數量匯入 currency 選填，既有 PO 沿用，新增未知不猜 USD、不算金額。技術 ID 由系統產生；更新檔保留隱藏 ID／版本。
5. 海外倉匯入改成 Overwrite／Add to available 兩個流程。SET 數量是扣預留前倉庫數量；ADD 是增量。模板明確標出可編輯數量，不更改預留或其他未指定欄位。
6. **本輪 IU3：海外倉未知 SKU 跳過而非阻擋整批**。不建立 SKU、不改其庫存或異動帳；預覽明列跳過筆數與清單。所有列都未知時拒絕為 `NO_APPLICABLE_SKUS`。缺少／讀不到 SKU 主檔仍拒絕；倉庫、公司、版本、預留防護不放寬。此政策僅適用海外倉，不套用到 PO／Factory。
7. 匯入預覽改為重點資訊：新增／更新／不變／待修正／跳過計數，SKU 數量前後比較；技術表名、批次與原始細節折疊，不隱藏錯誤。
8. 工廠／海外倉選項快取按環境隔離，未知環境不快取。第 11 項 Site Inventory 返回頁面競態已修：保留已套用站點，舊 mount／晚回應不得清空新搜尋結果。
9. Sales Trend 顯示實際 scoped DB 最新日期 `Through YYYY-MM-DD`。已唯讀複製雲端 Amazon 06–10 GS 並驗證執行邏輯：90 個完整曆日的補缺範圍、最近 3 個來源可用日期對帳，截止昨天；不把今天當完整日。此次未更動 Amazon GS、排程，未執行 BQ 查詢或匯入；不保證來源每天已到最新。
10. 早前已處理：Forecast 正常新增預設 active；不替 Vic 修改既有 DB。共用密碼登入、重新整理保留登入、1Password 可按填入；密碼管理網站僅提供本人 Apps Script 操作入口，沒有一般使用者可換總密碼的 API。Weekly Draft 可改數量／增刪 SKU，Pending 須 Reject 回 Draft 再改與重新 Submit；新增行有站點統計及可用庫存防護。Shipment Expand 固定右側，Draft 隱藏重複狀態，Overview 保留。
11. 早前出貨主線有跨公司、逐行歸屬、同 SKU 文件匯總與 FIFO PO 件數呈現修正。不要為了報關 Series 匯總而改出貨明細或帳務行。各國／貨代的通過狀態須引用原本單號與證據，不宣稱「所有站點都已通過」。PDF 仍依 Vic 指示暫不作為本輪阻擋。

## 本輪證據與限制

- Sandbox 與 Production 各跑 99 項合成後端測試，全部通過，包含共同匯入、剩餘量更新、未知 SKU 跳過與保護。
- Production profile／登入拒絕／錯環境／半部署安全測試 107 項通過；公開匯入 gate 19 項、action policy 6 項通過。
- 新預覽桌面／手機 19 項、共用流程與快取 19 項瀏覽器替身測試通過。Amazon 實際讀回 GS 的合成日期測試 14 項通過。
- 舊 IU2 對照會在新增跳過政策斷言失敗，失敗輸出已保留。第一次正式讀回仍看到舊檔，停止部署、完成保存後重新讀回四檔一致才部署。不能拿貼入 buffer 比對取代保存後讀回。
- 實機 Sandbox 已登入、有效海外倉選項與 126 列匯出成功。原失敗檔的自動選檔被 Chrome 檔案權限阻擋，**未完成本輪實機 Validate／Apply**；不得宣稱該檔已成功入帳。
- Vic 早前親測 New receipt 與跨入口重送 PASS。Update current data 的 1→2→1、海外 ADD／SET 還原的本輪最終實機結果仍須補驗，不能用合成測試替代。
- 使用者提供的 PO 匯出與 DB 逐 ID 核對有 35 列 remaining 相符；但有 16 列公司缺失、26 列 completed/shipped 關係不一致，兩群有重疊。這些是舊資料問題，不自動補平，也不能據此說全庫存已對平。
- 本輪正式 DB 寫入 0；未改 schema、密碼、權限、排程。未刪 TEMP、資料列或備份分頁。

## 一律保留的業務與安全規則

- PO remaining 應對應已完工、尚未出貨庫存；部分完工只配已完工未出貨量，不把尚未完工量當庫存。FIFO 不變，預留後可用量不可超配。
- 工廠貨權／PO company 不等於強制鎖死出貨公司；維持既有可跨公司出貨規則，不因模板 company 加新限制。
- 跨公司合票只限工廠出發；共用目的地用精確 warehouse ID 映射，不做名稱模糊比對。保留每行公司、站點、倉與血緣，incoming／收貨各自歸屬。未知血緣顯示無法判定，不退回表頭、不當零。
- 合併辨識預設方案 A；方案 D 未經盤點與額外核准不得切換。保留取消／拆出／重試的防重送與部分失敗恢復。
- 過期版本不能偷偷抓最新版補送。UNKNOWN 先停止診斷，不重按 Confirm、不重送猜結果。已出貨票的補文件不再扣庫，需特定授權。
- Sandbox 測試集中到一包；Production 只放正式交付物。設定、DB、文件目錄、快取與登入環境必須隔離。不得把 Sandbox 業務資料複製到正式 DB。
- `00_config`、pin、密碼 verifier、session、webhook URL 都不讀取／輸出／提交。私人設定由 Vic 操作。不要用 dump Properties 或整份日誌找密碼。
- 新增欄位與改業務資料是兩件事。不得刪改正式資料、回填時間、重排欄位、刪備份，或重跑正式交易來測試，除非對應範圍明確核准。
- 改過的 GS 必須列入貼檔、完整 SHA256、讀回；有 health 項目的，版本戳與預期值同一次建置更新。90_ 從同一份核心來源重建並測前後端一致。

## 後續工作順序

先做 **9、10、8** 的方案／查核與可獨立的 Sandbox 工作，再處理 **5**；之後 **7、6**，最後 **12**。第 9／12 要先和 Vic 定調 UI／規則，不直接做全站重寫。

### 9：Rate Card 快速批次更新，先提方案

建議保留目前系統安靜、密集的工作介面：上方 carrier／起訖國／method／customs／battery／currency／生效日期篩選，下方可展開分組表格。相同價格條件的多倉卡可群組顯示「倉庫數＋展開清單」，勾選後批次修改價格，再呈現每張卡 before→after 預覽與影響範圍。

群組必須確認幣別、計價單位、級距、稅費模式、服務與有效期一致，不因價格數字相同就合併。保留卡 ID 唯一、版本衝突、稽核與歷史；不能回寫已使用歷史卡造成舊單變價。先讀實際 17_、頁面與使用者提供模板，提出線框／互動方案給 Vic；改價格或建新版本的業務語意先確認。

### 10：AI Plan 與兩種 Gap 計算打通

先畫實際資料鏈：來源→站點計算→快照／版本→建議→Draft→人工改量→Submit→Approve。查 Inventory Gap、Order Planning Gap、Weekly AI Plan 的真實觸發器、最近成功／失敗、分站批次、超時恢復、重跑冪等與來源日期。畫面顯示 Enabled 不等於排程成功。

使用者設定目標為每天 Inventory Gap 13:30、Order Planning Gap 14:00、週一 Weekly 14:30（台北）；先核對實際設定與時區，不自行新增或啟用觸發器。Production 曾有 Weekly recommendation 100% 失敗，唯讀錯誤是儲存空間 INTERNAL、無行號，尚未證實根因。AI Plan 網站動作目前仍關閉，不可因這份交接擅自開放。

Avg sales 目前是 90 個完整曆日內往回取最多 30 個正常銷售日，排除適用 campaign／special event；正常樣本少於 7 日提示驚嘆號，不是使用者最初猜的 14 日。先驗證程式與資料日界、缺資料不當 0，再討論要不要改公式。新舊公式／補貨量／舍入／缺貨與預留等計算改動一律先提方案，不自行決策。

效能先量分站耗時、讀表次數與重複資料，不猜省幾秒。優先單次請求共用讀取、批次寫入、可恢復分站 job；快取綁定環境及資料版本，不能讓舊資料掩蓋庫存不足或用快取版本接受過期寫入。使用者預期是每站看建議後加減，不要每次互動重算全部站點。

### 8：Google Chat

Vic 已建立專用 Space 與 webhook，尚未接系統。不要索取或把 URL 放 Git。先確認既有通知程式與私人設定方式，由 Vic 存入設定。只在 Plan 確實 Submit 成 Pending Approval 後通知；重送不重複通知，失敗不回滾已提交 Plan，不把傳訊失敗說成提交失敗。先 Sandbox 測試 Space，再核准正式通知，避免發送測試訊息到正式群組。

### 5：Sales Outlook

篩選器／Choose sites 選項與查詢互動未通，不要只看空畫面就宣稱功能完成。先修 bounded metadata→可選站點→實際讀取→合計；多幣別分開，不自行換匯或把估計值稱為營收。

### 7：TEMP GS 與 DB backup tabs

已有盤點，不代表已刪。先驗證依賴、觸發器、復原／維護入口，列精確名稱、理由、備份與刪除影響，取得對應核准。真正被正式功能使用的 helper 要轉成正式模組並測試，不能僅因 TEMP 名稱刪除；不得刪正常業務表或唯一復原備份。

### 6：Production／Sandbox 兩個資料夾

最後整理，以 manifest 鎖定來源，建立清楚 release/test 邊界與啟動說明。保留 Git 歷史、私人設定與既有 worktree，不把一萬個歷史測試輸出全加到 main。搬移前確認絕對路徑與引用，不能用 hard reset 或大量刪除收尾。

### 12：全站層級與深淺模式，先討論

以既有品牌色 `#f04f5e` 為已知主色；其他品牌 token 不確定時問 Vic。提出文字、標題、表格、主次／危險／disabled／loading 按鈕、hover／focus、對話框置中等一致規範，再提 light/dark 語意色 token。不要只交換黑白；檢查品牌按鈕白字對比、暗色輸入／表格／選單可讀性、長文字與手機排版，取得定調後才逐模組更新。

## 下一次開始時最少需要做的事

1. 讀此文件、`CLAUDE.md`、最近 release proof 與 git status，確認沒有另一位代理同時修改。
2. 回報真實的已發布／待實機驗收／待決事項，不沿用早期 ETA 或「全部完成」說法。
3. 優先提出第 9 的具體 UI 方案；第 10 先出計算／排程診斷，第 8 先出私人設定與測試計畫。可共享一次本機盤點，避免多代理重複讀整個 repo。
4. 每一小批附針對性測試與必要回歸；保存失敗紀錄，凍結後再驗，不做沒有意義的全包重跑。
