# PO 200 列本機 Main 同步與 Claude 接續指令

日期：2026-11-27，Asia/Taipei。Owner 決策，Codex 複核／本次同步，Claude 接續實作。

## 1. 已完成與未完成

- Owner 本輪明確核准：在 native Sandbox 尚未執行前，先同步**本機 Main 程式來源**。
- Codex 已將 Main 從 `939e6365` fast-forward 到 PO-only 候選 `47019708816e8a885045b54d3b92ffd89a56a3f0`，納入五個 PO commits。
- 另補共同 importer 的 cache token，以及四個載入頁面與入口的 cache token；不改其他頁面的業務邏輯。新增 `po200-release-cache.test.cjs`。
- B/C、S1、S2、Chat 的候選實作**沒有**同步進 Main。既有 workspace 修改與未追蹤文件保留。
- **未 push、未部署 GAS、未寫正式資料、未發 Chat 訊息。** 本機來源同步不代表線上已能匯入 200 列。
- Native Sheets／Apps Script 200 列驗證仍為 `NOT_RUN`。Owner 本次只豁免本機來源整合門檻，沒有豁免正式啟用門檻。
- 本文件取代舊 R2 中「Main 仍在 939e6365／不得本機整合」的現況說明；舊測試紀錄保留為歷史，不回寫成新結果。

## 2. 本次來源範圍

前後端單檔最多 200 筆資料列，201 筆拒絕；保留單一 atomic business commit、完整 audit、receipt、版本檢查、重送與未知結果的保護。不是把一個檔偷偷拆成多次業務提交。

包含新增列 request 合併與每次 validation 的讀取快取，避免只改 25→200 後 payload／Sheet 讀取爆量。`PFA_MAX_BYTES_=8000000` 是待原生驗證的候選 guard，不是 Google 保證可用的上限。

包含 40 列／14 PO／31 SKU／quantity=0 的合成等價案例、200 列零收貨、200 列 internal opening、真 PO 與 Factory Stock 頁面的 XLSX／讀回驗證、操作工具與數字化 metrics。

Owner 的真實商業 XLSX 沒有被修改、匯入、加入 Git 或測試包。

## 3. 非作者複核

已在原候選 `47019708` 實跑：

| Suite | 結果 |
|---|---|
| PO 200 server | 14/14，exit 0 |
| PO browser，1440／390 | 40 checks，exit 0 |
| Factory Stock browser，1440／390 | 52 checks，exit 0 |
| Synthetic tools | 8/8，exit 0；10/10 generator mutants 被捕捉 |

Main 同步及 cache 修正後，Codex 再次實跑：

| Main suite | 結果 |
|---|---|
| Release-cache | 3/3，exit 0 |
| Factory atomic | 13/13，exit 0 |
| PO browser，1440／390 | 40 checks，exit 0 |
| Factory Stock browser，1440／390 | 52 checks，exit 0 |
| Synthetic tools browser | 78 checks，exit 0；outbound=0 |
| PO batch boundary | 8 checks，exit 0 |
| PO unproduced | 33/33，exit 0 |

這些是本輪非作者實跑，不是轉述作者結果。沒有執行全 repo regression sweep。

所有上述服務皆為記憶體替身，瀏覽器測試攔截網路；沒有實測 Google HTTP／router／session／Sheets 時間與容量。原生測試仍必須執行。

已知舊問題：Factory Stock 匯入後，In Production／Pending Shipout 暫顯示「—」，重新進頁才完整；Current／Reserved／Available 與明細正確。這次沒有擴寫修正此問題，也不把它宣稱為新增回歸。

## 4. GAS 更新清單與界線

本機來源在 `assets/specs/active/apps-script/`：

1. `82_api_v1_po_factory_import.gs`：200-row validation、template limits、validation cache。
2. `82a_factory_atomic_commit.gs`：request coalescing、8 MB guard、數字化 metrics。
3. `01_router.gs`：**只同步 PFI expected stamp 那一行**。
4. `63_api_v1_system_health.gs`：**只同步 PFI expected stamp 那一行**。

`APPS_SCRIPT_SYNC_REQUIRED = 上述四處`；`BUNDLE_REBUILD_REQUIRED = NO`。

PFI stamp：`PFI1-R2-SBX-20261111-AF1-IU1-IU2-IU4-PG12R3-JR4-PO200`。
PFA stamp：`FACTORY-ATOMIC-2-20261127-PO200`。

**不要**把 repo 的整份 router／health／Production config 貼進 Sandbox。保留各環境自己的 session、authority、allowlist、DB fingerprint 與部署權限。82／82a 也必須先與安裝版本比對，未知差異先停，不可盲目覆蓋。

原生測試操作單：`output/po200-sandbox-candidate-r2-20261127/instructions/PO200_NATIVE_TEST_STEPS.md`。該包 GAS 公開來源對應 47019708；其中舊 `site-cache-tokens.patch` 已被本次 Main cache 修正取代，**不可再當最新前端增量**。隔離 Sandbox 前端基準仍未知，不可直接用 Production 設定代替。

可從 Main 執行 `assets/tests/tools/po200-source-check.cjs`，明確加 `--candidate 47019708` 核對 82／82a；本次 cache 修正不變更它們。測試工具程式只是工具，不因貼入 Console 就證明環境隔離。

## 5. 給 Claude 的狀態同步

Codex 已依 Owner 本輪核准完成 **PO 200 列本機 Main 來源同步**，並補齊共用 importer 的版本入口。請不要再次 cherry-pick PO 五個 commits，也不要把 B/C 或 Chat 當成已同步。

先唯讀確認 Main 的 HEAD／status，閱讀本文件，保留所有現有修改。不要重新安裝舊 release 候選，不 push、不部署、不發正式訊息。若來源與本文件不符，先回報差異。

你可繼續準備 Sandbox 前端增量與原生測試支援，但要先取得隔離前端的實際公開來源／版本。不要要求 Owner 在正式庫用商業 XLSX 試驗。

## 6. Chat：Owner 最新規則取代逐票去重設計

Owner 已拒絕新增 notification table；本次允許的替代方向是少量 **Script Properties 冷卻狀態**，不是新表，也不是使用者修改稽核。

以下三項是已定政策，不再列待決：

1. 有新待審計畫時，以整個指定聊天室為單位，**3 小時內最多發一次**彙總通知，@指定審批人。冷卻不是逐票計算。
2. 同一票一直 Pending，不得每隔 3 小時再催；改為**每天台北時間上午 10 點**提醒仍未處理的待審。
3. 每日 10 點提醒同樣遵守 3 小時冷卻。例如 09:00 已發通知，當天 10:00 跳過，不例外插送，也不因跳過而在 12:00 補發舊單每日提醒。

再有新單進入待審，冷卻內不發；冷卻結束仍有未通知的新待審時，可在下一次排程檢查彙總。原先的逐票永久通知 log／exactly-once 請求不再是本版需求。

### 先交 R3 窄設計與純函式測試，再整合 GAS

請提交 `CHAT_APPROVAL_COOLDOWN_DESIGN_R3.md`。應比上一版更簡單，至少說明：

- 新待審 vs 已通知但仍 Pending 的識別；重新送審屬新輪次。取消 Shipment Draft 若使計畫再次進入 Pending，也由掃描真實 Pending 集合辨識，不依賴只有 Submit 的 hook。
- 一個彙總訊息只列待審數量、適量可辨識的計畫編號及網站入口即可；不為訊息估算運費／稅額／箱數，也不新增 deep-link 功能。
- 少量且有明確容量上界的 Properties；新單冷卻中不能被誤標成已通知。無限每輪新增 key、把「沒有紀錄」當作 SENT、CacheService 當永久記錄，都不接受。
- 排程以 `Asia/Taipei` 判日、3 小時以 epoch milliseconds 計時；需處理跨午夜、服務重啟、併發、重複 trigger。
- 同一個短鎖內核對冷卻並保存 attempt reservation，確認保存後才釋放鎖；外部 HTTP 不持有 business lock。逾時／失聯採 UNKNOWN，保留冷卻，不能立即重送；不同步清掉業務 source-write marker。
- 這只是提醒，不承諾 exactly-once，也不承諾審批人已閱讀。2xx 是 API 接受；失敗不回滾計畫、不變更提交成敗、不要求重 Submit。
- 冷卻／通知狀態僅允許寫 Properties；不得寫 shipping_plans、stock、PO、shipment_events 或任意表。OFF 預設完全不發，TEST／LIVE 狀態及目的地隔離。
- 明確說明定時掃描延遲及 10 點排程容差。Apps Script trigger 不是精準 cron，不可承諾 10:00:00；提出一個簡單排程方案並交 Codex 複核，不先裝排程。
- webhook secret 由 Owner 自己存入專案 Properties，不入程式／Git／console／log。Iris 的 email 與 Space 連結不是 webhook URL，也不能自行猜 numeric user id。
- mention 僅取已驗證的私密設定，不用 @all fallback；缺配置就明確 NOT_CONFIGURED。所有使用者文字要逃逸，例外不得洩露 URL。

純函式時間線至少測：0 待審、首次新單、3 小時內新單累積、剛好滿 3 小時、只有同一舊單、每日 10 點、09:00 已發而 10 點跳過、跨午夜、全部已處理、reject→resubmit、取消 draft 返回 Pending、兩個 worker 競爭、Properties 保存失敗、HTTP unknown、OFF／TEST／LIVE 隔離。

官方資料已由 Codex 核對：

- [Webhook](https://developers.google.com/workspace/chat/quickstart/webhooks)：完整 webhook URL 含憑證，不能以 Space 網址替代。
- [Message format](https://developers.google.com/workspace/chat/format-messages)：標準文字 mention 可用 `<users/USER_ID>`；email alias 的標準文字方案要求 user authentication，不直接假設 webhook 可用。
- [Properties quotas](https://developers.google.com/apps-script/guides/services/quotas)：目前每 value 9 KB、每 store 500 KB；不能無限累積通知 key。
- [Clock triggers](https://developers.google.com/apps-script/guides/triggers/installable#time-driven_triggers)：執行時間可能隨機偏移；`nearMinute()` 文件亦說明約 ±15 分鐘。

在全新的 `codex/chat-approval-20261127` 分支／隔離 worktree 準備設計與 tests；先核對 Main 最新 HEAD。不得切走或污染 Main，也不得碰還有背景工作的 B/C worktree。不要為了建立分支移動目前工作目錄或自動搬資料夾。

R3 經 Codex 複核後，再交獨立 Chat 實作 commit／GAS 清單／Owner 手動 Sandbox 操作單。不得自動建立 trigger、對現有 Space 試發或使用真實 webhook。首次真實測試另向 Owner 取得測試目的地與明確發送授權。

## 7. B/C 接續

Chat R3 設計獨立交件後，B/C 可在既有隔離候選分支繼續；不必等待正式 Chat 發訊驗收。每項獨立 commit、回報實際 tip／diff／測試，不 push、不部署。

1. F1 收緊：提供 ID 也要同時證明 stored ID 與完整 natural key 各唯一；任何歧義零寫入，不清洗或自動選第一列。
2. F2 收尾：第一筆 write 失敗時不可聲稱「有些已保存」；UI 顯示逐列 saved／refused／unknown 與 targeted readback，沒有自動重送。
3. 保留 F3 的實際修正與 accepted-input 測試，不用有缺陷 oracle 將安全拒收輸入誤判為遺失；S1／S2 全量合成回歸仍要覆核。
4. 落實 Owner 已核准三規則：空 ETD 可修改合法 ETA；既有 SKU 匯入省略 Status／Launch Date 要保留；新增 hybrid SKU 必填合法 fulfillment。不得再列成未決。
5. F5、真頁 XLSX、test guard 側分支先逐項 diff／測試／獨立 review，再整合；不能因 agent 宣布綠燈就直接全併。
6. F4 新回報的「rounding 不終止」先獨立最小重現，以 child process timeout 限住測試，區分 baseline／prototype。此缺陷目前只有作者回報，Codex 本輪未獨立重現，不能宣稱已驗證或已修復。終止性保護若需修 core，先交最小方案複核，不能順便採用新分配政策。
7. F4 整數 tie／新 allocation policy 仍是設計與 prototype；保留 expected-red，效能數字不得把 Node 當 GAS。需決策時交具體同一輸入的輸出差異，不擅自改日優先／rank／取整／貨權／到貨時間。
8. OP allocation、chunk/resume、資料 recovery 仍按原核准範圍留設計；不要自行改 schema。資料夾整理與 Local Server phase freeze 另案，不夾本次。

## 8. 發布與接管邊界

本次來源位於本機 Main。遠端最新版本未重新 fetch，`origin/main` 只是本機 tracking ref，不能宣稱它代表當前遠端。Codex 沒有使用任何 remote write。

Owner 後續 push 與 GAS 更新是兩個獨立手動步驟。本次授權沒有涵蓋自動發布。Sandbox 必須先完成真實 200-row／zero-receipt／opening／stale／replay／unknown／完整讀回，尤其 bytes、耗時、audit/grid 容量，不得只憑合成綠燈放行正式。

Claude 下一次回報請先列五行：Main HEAD、目前工作分支、PO native 狀態、Chat R3 狀態、B/C tip。然後只報新增變更／失敗／待決，不重貼已核准政策。
