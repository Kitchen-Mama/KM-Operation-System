/* ============================================================
   Kitchen Mama Operation System — Presentation Portal
   i18n content map (Traditional Chinese + English).
   Default language: zh (Traditional Chinese).
   No external library. Standalone.
   Note: DB table names, file names, and technical terms
   (API / BigQuery / SKU / PO / Shipment / Request Order /
   status enum values) intentionally remain in Latin even in zh.
   ============================================================ */
window.I18N = {

/* ============================ 繁體中文 ============================ */
zh: {
  ui: {
    htmlLang: 'zh-Hant',
    brandSub: 'Operation System',
    tag: '簡報入口',
    searchPlaceholder: '搜尋主題、模組、流程…',
    expand: '⤢ 全部展開',
    collapse: '⤡ 全部收合',
    themeToDark: '深色',
    themeToLight: '淺色',
    langButton: 'EN',
    langTitle: '切換語言 / Switch language',
    navOverview: '總覽',
    navFlows: '流程',
    navExplore: '探索',
    navReference: '參考',
    nav: {
      vision: 'A · 總覽',
      execblueprint: 'B · 經營藍圖',
      blueprint: 'C · 技術藍圖',
      supplychain: 'D · 完整供應鏈流程',
      shipment: 'E · 出貨流程',
      request: 'F · 下單 / 採購流程',
      documents: 'G · 文件自動化',
      details: 'H · 模組細節',
      memo: 'I · 討論備忘錄',
      sources: '資料來源與權威'
    },
    searchInfo: function (q, n) { return '顯示「' + q + '」的搜尋結果 —— 共 ' + n + ' 個區塊。'; },
    cardLabels: { what: '顯示什麼', why: '為何重要', flow: '所屬流程', demo: 'Demo 重點' },
    memo: {
      newBtn: '+ 新增備忘',
      allStatuses: '全部狀態',
      statusOpen: 'Open', statusInReview: 'In review', statusDone: 'Done', statusDeferred: 'Deferred',
      exportBtn: '匯出 JSON', copied: '已複製！',
      title: '標題', category: '分類', priority: '優先序', status: '狀態', note: '內容',
      save: '儲存備忘', cancel: '取消',
      emptyNone: '尚無備忘。點「+ 新增備忘」記下討論筆記。資料僅存於你的瀏覽器。',
      emptyFilter: '沒有符合此篩選的備忘。',
      created: '建立於', updated: '更新於', edit: '編輯', delete: '刪除',
      confirmDelete: '確定刪除這則備忘?', untitled: '未命名',
      titlePlaceholder: '例:確認 COO 核准步驟', notePlaceholder: '討論筆記…',
      categories: ['系統願景', '系統藍圖', '供應鏈流程', '出貨流程', '下單 / 採購流程', '文件自動化', '模組細節', '其他'],
      priorities: { high: '高', medium: '中', low: '低' }
    },
    footer: 'Kitchen Mama Operation System — 簡報入口 · 完全獨立的說明網站 · 內容來自 Blueprint、Shipment Center Spec v2.3、Request Order & PO Spec v1.3 與 Presentation Portal Spec。'
  },

  sections: {
    vision: {
      kicker: 'A · 系統願景',
      h1: '為 Kitchen Mama 打造的一條連接式營運主幹',
      p1: 'Kitchen Mama Operation System 是一套<strong>整合全公司的營運系統 —— 不只是專案追蹤工具</strong>。它在單一真實來源上,串接 forecast、replenishment、factory stock、海外倉庫存、request order、purchase order、生產完工、shipment 執行、文件自動化、風險警示與知識庫。',
      quote: '「規劃、下單、出貨、追蹤、學習 —— 都在同一條連接式真實來源上。」',
      h3problem: '這套系統解決什麼問題?',
      problemLead: '現況下,營運資料散落在各個 Sheet 與手動檔案中,每一步都要重新 key-in,而 forecast / 下單 / 出貨 / 庫存彼此沒有完全連接 —— 導致狀態難以追蹤、風險太晚才被發現。本系統讓資料沿著單一鏈條向前流動,消除重複輸入與「這張單 / 這批貨到底在哪」的猜測。',
      h3ba: 'Before vs After',
      beforeHead: 'Before(導入前)',
      afterHead: 'After(導入後)',
      before: [
        '資料散落在各 Sheet 與手動檔案',
        '重複的人工 key-in',
        'forecast、下單、出貨、庫存未完全連接',
        'Shipment 與 PO 狀態難以追蹤',
        '文件靠人工製作',
        '風險太晚才發現',
        '工廠 / 海外倉 / 辦公室未必同步'
      ],
      after: [
        '<strong>單一系統、單一真實來源</strong>',
        'forecast → replenishment → request → PO → shipment → document 全程連接',
        '減少重複人工輸入',
        'PO 與 shipment 狀態可追蹤',
        '文件由既有紀錄自動產生',
        'factory stock / 海外庫存 / 在途貨物皆可見',
        '未來可做警示與 AI 分析',
        '工廠與倉庫 portal 共用同一資料骨幹'
      ],
      h3chain: '連接式鏈條',
      chain: [
        { h: '規劃 Plan', p: 'Forecast · replenishment · factory-stock 分配規劃。' },
        { h: '執行 Execute', p: 'Request order · purchase order · 生產 · shipment。' },
        { h: '追蹤與學習 Track & Learn', p: '在途可見性 · 文件 · 風險警示 · KM University · 未來 AI / API / BigQuery。' }
      ]
    },

    execblueprint: {
      kicker: 'B · 經營藍圖',
      h2: '經營藍圖',
      subtitle: '營運總覽',
      mainMessage: 'Kitchen Mama Operation System 透過一張共用的營運地圖,把整間公司連接在一起。',
      rootNode: 'Kitchen Mama Operation System',
      colorNote: '色彩標示僅用於能力分類,不代表即時系統狀態。',
      loop: {
        title: '核心營運閉環',
        subtitle: '從需求預測、下單、生產、出貨、收貨,再回到下一輪補貨下單。',
        steps: [
          { icon: '📊', t: 'Forecast 與庫存確認', d: '檢查需求、站點庫存、工廠庫存與在途貨物。' },
          { icon: '📝', t: '推送 Request Order', d: '系統建議下單數量,由團隊確認並送出下單需求。' },
          { icon: '🏭', t: 'Purchase Order 與工廠生產', d: '審核通過後轉成正式 PO,工廠開始生產。' },
          { icon: '✅', t: '完工確認', d: '完成數量變成可規劃出貨數量。' },
          { icon: '🚢', t: '出貨規劃', d: 'OP 依照庫存、需求與目的倉規劃出貨。' },
          { icon: '📦', t: 'Confirm & Ship', d: '確認出貨、扣除庫存,並產生出貨文件。' },
          { icon: '🏬', t: '收貨與庫存更新', d: '貨物到倉後更新庫存,進入下一輪補貨判斷。' }
        ],
        backLabel: '回到 Forecast 與庫存確認',
        note: '這個閉環把下單流程與出貨流程串成同一條持續運轉的營運循環。',
        note2: '詳細規則仍保留在出貨流程與下單 / 採購流程章節。'
      },
      moduleCount: function (n) { return n + ' 個模組'; },
      more: function (n) { return '+' + n + ' 更多'; },
      drawer: {
        purposeLabel: '目的',
        explanationLabel: '說明',
        modulesLabel: '模組',
        flowLabel: '相關業務流程',
        viewDetails: '查看細節 →',
        close: '關閉'
      },
      domains: [
        { icon: '🏠', cat: 'teal', catLabel: '指揮中心', name: '經營儀表板 (Executive Dashboard)',
          purpose: '掌握公司健康狀態的每日指揮中心。',
          explain: 'leadership 每天的進入點 —— 一眼看到公司健康、警訊、待辦與目標。',
          flow: '系統入口 —— 連結至其他所有領域。',
          mods: ['Home', 'Site Health Dashboard', 'Alerts', 'Tasks', 'Goals'] },
        { icon: '📦', cat: 'green', catLabel: '庫存', name: '供應鏈規劃 (Supply Chain Planning)',
          purpose: '在最小化庫存的同時防止缺貨。',
          explain: '以預測驅動的規劃,讓各站點庫存保持健康又不過量。',
          flow: '完整供應鏈流程(D 區)。',
          mods: ['Inventory Replenishment', 'Forecast Review', 'FC Summary', 'Warehouse Stock', 'Factory Stock', 'Overseas Stock'] },
        { icon: '📈', cat: 'purple', catLabel: '需求', name: '行銷與需求 (Marketing & Demand)',
          purpose: '連結需求、活動與未來的預測調整。',
          explain: '規劃促銷並監控促銷風險,讓需求訊號提早進入預測。',
          flow: '餵入供應鏈流程的 Forecast 步驟。',
          mods: ['Campaign Center', 'Promotion Risk Tracker', 'Campaign Calendar', 'Amazon Ads Intelligence Center', 'Marketing Performance Review'] },
        { icon: '📋', cat: 'blue', catLabel: '產品', name: '產品與供應商 (Product & Supplier)',
          purpose: '產品與供應商資料的單一真實來源。',
          explain: '幾乎所有模組都會 join 的產品與供應商主檔。',
          flow: '訂單與供應流程的基礎。',
          mods: ['SKU Details', 'Supplier Management', 'Supplier Price List', 'Payment Terms', 'Product Cost', 'Marketplace SKU'] },
        { icon: '🏭', cat: 'orange', catLabel: '工廠', name: '採購與工廠 (Procurement & Factory)',
          purpose: '標準化採購與生產追蹤。',
          explain: '把核准後的需求轉成採購單,並追蹤生產至完工。',
          flow: '下單 / 採購流程(F 區)。',
          mods: ['Request Order', 'Request Order Draft', 'Purchase Order Overview', 'Purchase Order List', 'Production Schedule', 'Factory Portal'] },
        { icon: '🚢', cat: 'cyan', catLabel: '出貨', name: '物流與出貨 (Logistics & Shipment)',
          purpose: '追蹤每一批貨從工廠到目的地。',
          explain: '規劃、執行並追蹤出貨,並由既有紀錄產生文件。',
          flow: '出貨流程(E 區)。',
          mods: ['Weekly Shipping Plan', 'Shipment Draft', 'Shipment Overview', 'On The Way', 'World Map', 'Export Center', 'Carrier', 'Shipment Documents'] },
        { icon: '💰', cat: 'amber', catLabel: '成本', name: '成本與分析 (Cost & Analytics)',
          purpose: '看懂成本、毛利與營運績效。',
          explain: '當營運鏈條連接之後,把成本、毛利與績效整合在一起。',
          flow: '供應鏈流程末端(成本與分析)。',
          mods: ['Cost Analysis Center', 'Product Cost Review', 'Margin Analysis', 'Forecast Accuracy', 'Inventory Health', 'BigQuery / Reporting'] },
        { icon: '📚', cat: 'indigo', catLabel: '知識', name: '知識與組織 (Knowledge & Organization)',
          purpose: '把營運經驗變成可重複使用的公司知識。',
          explain: '累積公司知識,並治理支撐一切的主檔與權限。',
          flow: '橫跨所有流程的知識與治理層。',
          mods: ['KM University', 'SKU Handbook', 'SOP Center', 'AI Assistant', 'Company Management', 'Warehouse Management', 'Role & Permission'] }
      ]
    },

    blueprint: {
      kicker: 'C · 技術藍圖',
      h2: 'Roadmap —— Phase 1 與 Phase 2',
      lead: 'Phase 1 是支撐每週供應循環的營運 MVP;Phase 2 在穩定骨幹之上疊加智慧、portal 與整合。<em>來源:Blueprint。</em>',
      note: '<strong>公司 / 工廠脈絡:</strong><strong>KM</strong> = 品牌 / 營運主體 · <strong>ResTW</strong> = 採購 / 供應鏈樞紐 · <strong>ResUS</strong> = 美國營運主體。KM 與 ResUS 透過 ResTW 下需求。工廠 <strong>CN_YOUXIN(東莞侑鑫)</strong> 與 <strong>TW_SHENGYI(南投勝一)</strong> 為生產資源 / 共享庫存池,非公司主體。',
      p1head: 'Phase 1 模組',
      p1badge: 'Phase 1',
      phase1: [
        { t: 'Home', p: '著陸頁與系統入口(下列區塊框架已完成,資料連動為 Phase 1 待完成項目)。', sub: ['首頁總覽', '世界時間', '快速進入各模組', 'Upcoming Event', '警訊通知', '待辦事項', '公佈欄', 'Goal'] },
        { t: 'Site Health Dashboard / 站點概況快速總覽', p: '跨站點一眼掌握的每日營運 control tower —— 獨立頁面,與 Home 分開。', sub: ['每日營運 control tower', "Today's Sales / 7-Day / 30-Day Sales Trend", 'Days of Supply', 'Stockout Risk / Overstock Risk', 'In-Transit Status', 'Forecast Accuracy', 'Promotion Risk'] },
        { t: '2 · Campaign Center', p: '促銷 / 活動管理與風險。', sub: ['Campaign Center', 'Promotion Risk Tracker', '活動成效檢視', '未來 Campaign Calendar / Gantt'] },
        { t: '3 · Inventory Replenishment / 貨物庫存表', p: '監控站點庫存並計算建議補貨。', sub: ['貨物庫存表', '站點層級庫存總覽', '建議補貨', 'Factory stock 分配顯示', '缺貨風險警示', '滯銷 / 過量風險警示'] },
        { t: '4 · Forecast Review / Forecast 成效監管中心', p: '預測管理與準確度監管。', sub: ['Forecast Review', 'FC Summary', 'Base Forecast', 'Special Event Forecast', 'Target % Rules', '預測準確度 / 檢視'] },
        { t: '5 · SKU Data Center', p: 'SKU 主檔與供應商 / 價目 / 付款條件。', sub: ['SKU Details', 'Supplier Management', 'Supplier Price List / 出廠價目表', 'Payment Terms', 'Product / Customs 主檔(未來)'] },
        { t: '6 · Warehouse Stock', p: '海外 / 3PL / FBA 庫存與異動。', sub: ['Overseas Stock', 'FBA Inventory', '3PL Inventory', '倉庫庫存快照', '倉庫庫存異動'] },
        { t: '7 · Factory Order Management', p: '工廠庫存、PO 與生產追蹤。', sub: ['Factory Stock', 'Factory Stock Movements', 'Purchase Order 追蹤', 'Production Schedule', '完工追蹤'] },
        { t: '8 · Request Order / Procurement Center', p: '下單計算與採購單執行。', sub: ['下單系統', 'Request Order Draft', 'Purchase Order Overview', 'Purchase Order List'] },
        { t: '9 · Shipping Center', p: '出貨規劃、執行與在途追蹤。', sub: ['Weekly Shipping Plan', 'Shipment Draft', 'Shipment Overview', 'Shipment On The Way', 'World Map'] },
        { t: '10 · Export Center', p: '由既有紀錄產生出貨 / 報關文件。', sub: ['Shipment Detail Sheet', 'Carrier Booking Form / 托單', 'Commercial Invoice', 'Packing List', 'Commercial Invoice + Packing Combined', '報關文件'] },
        { t: '11 · Cost Analysis Center', p: '成本、運費、毛利與 landed cost 分析。', sub: ['Shipment Cost', 'Carrier Cost', 'Product Cost', 'Landed Cost', 'Margin Analysis', 'Cost Trend / 未來 BQ 分析'] },
        { t: '12 · KM University', p: '教育訓練與知識庫(含產品知識)。', sub: ['Training Center', 'SOP', 'SKU Handbook', 'SKU 知識', '內部 onboarding'] },
        { t: '13 · Admin / Master Data Center', p: '支撐所有模組的主檔管理。', sub: ['Company Management', 'Site / Marketplace Management', 'Warehouse / Factory Management', 'People / Department Management', 'Template Management'] }
      ],
      spotlight1Summary: '★ 重點 —— Site Health Dashboard(站點概況快速總覽)',
      spotlight1Body: '<p><strong>目的:</strong>給 leadership 與 OP 一眼掌握跨站點的營運 control tower —— 每日管理入口。</p>' +
        '<p><strong>建議指標:</strong>Today\'s Sales · 7-Day Sales Trend · 30-Day Sales Trend · Days of Supply · Stockout Risk · Overstock Risk · In-Transit Status · Forecast Accuracy · Promotion Risk。</p>' +
        '<p><strong>維度:</strong>Company · Country · Marketplace · Warehouse。</p>' +
        '<p><strong>定位:</strong>最重要的 Home dashboard 能力之一;為讀取 / 彙總視圖,非新的紀錄表。</p>',
      p2head: 'Phase 2 模組',
      p2badge: 'Phase 2',
      phase2: [
        { t: 'AI 輔助需求預測', p: '由累積歷史驅動的預測與下單建議。' },
        { t: 'AI 營運助理', p: '讀取同一資料庫的自然語言助理。' },
        { t: 'Campaign 日曆 / Gantt', p: '完整促銷規劃時間軸。' },
        { t: '工廠 portal', p: '對同一骨幹的角色化工廠視圖。' },
        { t: '海外倉 portal', p: '對同一骨幹的角色化倉庫視圖。' },
        { t: 'New Product Monitoring Center', p: '追蹤新 SKU 上市表現與爬升。' },
        { t: '★ Amazon Ads Intelligence Center', p: '將 Amazon Ads API 資料與營運規劃連結(較單純的 marketplace/logistics API 更廣)。', badge: '藍圖新增' },
        { t: 'Marketplace / logistics API 整合', p: 'Amazon FBA 庫存即時同步、carrier 追蹤。' },
        { t: 'BigQuery / 資料倉儲', p: '分析 / 報表目標。' },
        { t: '權限 / 敏感資料控管', p: '管控成本 / 付款資料與 portal 範圍的角色模型。' }
      ],
      spotlight2Summary: '★ 重點 —— Amazon Ads Intelligence Center',
      spotlight2Body: '<p><strong>目的:</strong>將 Amazon Ads API 資料與營運規劃連結。</p>' +
        '<p><strong>潛在能力:</strong>Spend Analysis · ROAS Analysis · ACOS Analysis · TACOS Analysis · Campaign Performance Analysis · Keyword Analysis · Promotion Effectiveness Analysis · Ads-to-Sales Correlation Analysis。</p>' +
        '<p><strong>未來方向:</strong>AI Campaign Advisor · AI Budget Suggestion · AI Forecast Adjustment。</p>'
    },

    supplychain: {
      kicker: 'D · 完整供應鏈流程',
      h2: '供應鏈主幹',
      lead: '每一個箭頭都是一次向前的資料交接。計算預覽在使用者明確 submit / push / create 之前不會被保存。<em>來源:Blueprint §5。</em>',
      h3main: '主幹',
      mainDiagram:
'Forecast / FC Summary\n' +
'   ↓\n' +
'Inventory Projection\n' +
'   ↓\n' +
'Factory Stock Allocation Planning      (規劃層 —— 僅為 metadata)\n' +
'   ↓\n' +
'Inventory Replenishment / 貨物庫存表    (建議補貨;Submit → shipping_plans)\n' +
'   ↓\n' +
'Weekly Shipping Plan\n' +
'   ↓\n' +
'Shipment Draft\n' +
'   ↓\n' +
'Confirm & Ship                         (factory_stock.current_stock 扣帳點)\n' +
'   ↓\n' +
'Export Center / 文件產生\n' +
'   ↓\n' +
'Carrier / 工廠溝通                       (MVP 手動 email)\n' +
'   ↓\n' +
'Shipment Overview\n' +
'   ↓\n' +
'On The Way / World Map\n' +
'   ↓\n' +
'Receiving / 庫存更新\n' +
'   ↓\n' +
'Cost Analysis Center\n' +
'   ↓\n' +
'未來 AI / BQ / Analytics',
      h3order: '訂單分支',
      orderDiagram:
'Forecast / Inventory / Factory Stock / On The Way\n' +
'   ↓\n' +
'下單系統\n' +
'   ↓\n' +
'Request Order Draft\n' +
'   ↓\n' +
'Purchase Order Overview\n' +
'   ↓\n' +
'Purchase Order List\n' +
'   ↓\n' +
'Production Completion\n' +
'   ↓\n' +
'available_to_ship = completed_qty − shipped_qty\n' +
'   ↓\n' +
'Shipment 分配',
      note: '兩條分支在 <strong>factory stock / <code class="inline">available_to_ship</code></strong> 交會 —— 訂單產生供給,出貨消耗供給。'
    },

    shipment: {
      kicker: 'E · 出貨流程',
      h2: 'Weekly Shipping Plan → Shipment → Receiving',
      lead: '一份核准的計畫如何成為可追蹤、有文件的 shipment。<em>來源:Shipment Center Spec v2.3。</em>',
      steps: [
        { title: 'Inventory Replenishment 建議 → Weekly Shipping Plan', desc: 'OP 將選定需求推入計畫。', chips: ['shipping_plans', 'shipping_plan_lines'] },
        { title: 'Submit → Manager 核准 → COO 核准', desc: '規劃 / 審批層。', chips: [] },
        { title: '核准後建立 shipments + shipment_lines', desc: '執行快照;factory stock <strong>保留</strong>(reserved_stock ↑,current_stock 不變)。', chips: ['shipments', 'shipment_lines', 'status = draft', 'reserved_stock ↑'] },
        { title: 'Shipment Draft —— 補齊正式資料', desc: 'Amazon shipment ID / reference / warehouse code / ship date / ETD / ETA / carrier / shipping method / 備註。<strong>Shipment Draft = shipments.status = draft</strong>(無獨立表)。', chips: ['status = planned'] },
        { title: 'Confirm & Ship', desc: '<strong>實體執行觸發點</strong> —— factory_stock.current_stock ↓、reserved_stock 釋放;FIFO PO 分配定案。', chips: ['status = ready_to_ship', 'current_stock ↓', 'shipment_line_allocations'] },
        { title: 'Export Center / 文件產生', desc: '由既有紀錄產生 Detail Sheet · Carrier Booking / 托單 · Invoice · Packing List · AGL Combined。(在 Confirm & Ship 之後、carrier/工廠溝通之前。)', chips: ['generated_documents'] },
        { title: 'MVP —— 手動 email 給工廠 / carrier', desc: '下載文件 · 附上 shipping labels · 手動寄送。(未來:API / 自動 email。)', chips: [] },
        { title: 'Shipment Overview', desc: '讀 shipments + shipment_lines 的追蹤 / 歷史 / 搜尋。', chips: [] },
        { title: 'In Transit / On The Way', desc: '未來 shipment_events / shipment_routes 追蹤里程碑與路線。', chips: ['in_transit'] },
        { title: 'Receiving → Completed', desc: '非 Amazon 倉庫收貨後庫存增加;Amazon 由 API / 即時同步。', chips: ['partial_received', 'completed'] }
      ],
      discloseSummary: '展開細節 —— DB、狀態與規則',
      discloseItems: [
        '<strong>Shipment Draft = <code>shipments.status = draft</code></strong> —— 為可編輯的準備視圖,<strong>不是</strong>新 DB。不要建立 <code>shipment_drafts</code> 表。',
        '<strong>Confirm & Ship 是唯一的 <code>factory_stock.current_stock</code> 扣帳點。</strong>計畫建立 / 提交與 Shipment Draft 都不會扣 current_stock。',
        '<strong>reserved_stock</strong> 在核准 / 建立 shipment 後增加;取消時釋放 reserved_stock,且永不扣 current_stock。',
        '<strong>Shipment Overview / On The Way / World Map 讀 <code>shipments</code> + <code>shipment_lines</code></strong>(權威);<code>completed</code> / <code>cancelled</code> 不計入在途。',
        '<strong><code>shipment_events</code> / <code>shipment_routes</code> 僅為未來 enrichment</strong> —— 永不取代。',
        '<strong>Amazon FBA 庫存</strong>通常來自 API / 即時同步,而非手動增加。',
        '<strong>狀態生命週期:</strong><code>draft → planned → ready_to_ship → in_transit → partial_received → completed</code>(+ <code>cancelled</code>、<code>stuck</code>)。'
      ]
    },

    request: {
      kicker: 'F · 下單 / 採購流程',
      h2: '下單系統 → Request → Purchase Order → 生產 → Shipment',
      lead: '計算頁建立 Request 之後,訂單端如何運作。<em>來源:Request Order & PO Spec v1.3。</em>',
      steps: [
        { title: '下單系統計算', desc: '跨所有公司 / 站點 / marketplace 的建議下單量。', chips: [] },
        { title: '推送一個合併 Request', desc: '單一動作建立三層 request 結構。', chips: ['request_orders', 'request_order_lines', 'request_order_line_sources'] },
        { title: 'Request Order Draft → Manager → COO 核准', desc: '<strong>審批只存在於 request 層。</strong>', chips: ['draft → pending_approval → approved'] },
        { title: '核准的 Request 轉換為 Purchase Order', desc: 'PO 不擁有審批工作流。', chips: ['purchase_orders', 'purchase_order_lines', 'request → converted_to_po'] },
        { title: 'Purchase Order Overview → 產生 PO 文件 → issue', desc: 'PO <code>draft</code> = 已建立但尚未寄出;MVP 手動 email 給工廠;之後設為 <code>issued</code>。', chips: ['draft → issued', 'generated_documents'] },
        { title: '生產完工', desc: '更新 <code>purchase_order_lines.completed_qty</code>。', chips: ['in_production → completed'] },
        { title: 'Purchase Order List → Shipment 分配', desc: '<code>available_to_ship = completed_qty − shipped_qty</code> —— 不出貨未完工數量。', chips: [] }
      ],
      h3rel: '資料表關係',
      relHead: ['資料表', '粒度', '保存 / 連結'],
      relRows: [
        ['<code>request_orders</code>', 'Request header / batch', '一次 push 動作。header <strong>不存</strong> company/country/marketplace。擁有 submit/approve/reject/cancel。'],
        ['<code>request_order_lines</code>', 'SKU 級彙總', '每 SKU 彙總下單量。Series 由 SKU Details join(不儲存)。轉換後帶 <code>linked_purchase_order_line_id</code>。'],
        ['<code>request_order_line_sources</code>', '公司 / 站點來源', 'Company / country / marketplace / warehouse / site_sku 拆分。<code>ownership_company</code> 預設 ResTW(僅規劃 metadata)。'],
        ['<code>purchase_orders</code>', 'PO header(執行)', '<code>source_request_order_id</code>。狀態 <code>draft → issued → in_production → … → closed</code>。'],
        ['<code>purchase_order_lines</code>', 'PO 行(執行)', '<code>source_request_order_line_id</code>。<code>completed_qty</code>、<code>shipped_qty</code>;<code>available_to_ship = completed_qty − shipped_qty</code>。']
      ],
      discloseSummary: '展開細節 —— 審批 vs 執行',
      discloseItems: [
        '<strong><code>request_orders</code> 擁有審批</strong>(submit / approve / reject / cancel)。<strong>PO 不擁有審批工作流。</strong>',
        '<strong>PO <code>draft</code></strong> = 正式 PO 已存在但<strong>尚未 issue</strong> 給工廠(執行準備,非審批)。',
        '<strong>PO <code>issued</code></strong> = 已產生 / 寄出 / 向工廠確認。',
        '<strong><code>request_order_line_sources</code></strong> 保存公司 / 站點拆分;request 在 <code>request_order_lines</code> 維持 SKU 級彙總。',
        '<strong>Purchase Order List 為讀取 / 視圖</strong>,讀 <code>purchase_orders</code> + <code>purchase_order_lines</code>(以 <code>shipment_line_allocations</code> 呈現已出貨關係)—— 非獨立 DB。',
        '一個 request 轉多個 PO 由規劃中的 <code>request_order_po_links</code> 表設計(MVP 以 <code>converted_purchase_order_id</code> 對應一對一)。'
      ]
    },

    documents: {
      kicker: 'G · 文件自動化',
      h2: '文件為衍生輸出,非真實來源',
      lead: '文件由權威的 PO / shipment / SKU / warehouse 資料組裝;重新產生文件不會改動底層紀錄。<em>來源:Shipment Spec v2.2/v2.3 §16/§20、Request/PO Spec v1.3 §16。</em>',
      docs: [
        { t: 'Purchase Order', p: '來自 <code class="inline">purchase_orders</code> + lines。' },
        { t: 'Shipment Detail Sheet', p: 'Shipment ID、SKU、數量、cartons、重量、CBM、PO No、warehouse、ETD/ETA、carrier。' },
        { t: 'Carrier Booking Form / 托單', p: '收件人 + 報關區;cargo item no = shipment_no + 序號。' },
        { t: 'Commercial Invoice', p: 'Invoice 號 / 日期、ship to、SKU、數量、unit price、amount。' },
        { t: 'Packing List', p: 'PO no、SKU、數量、CTNS、gross/net 重量、CBM、carton size。' },
        { t: 'Amazon AGL Invoice + Packing', p: 'FBA Shipment ID、HTS code、country of origin、unit cost、totals。' }
      ],
      h3flow: '產生流程 —— 一份 dataset、多個模板',
      flowDiagram:
'權威 DB 紀錄\n' +
'        ↓\n' +
'建立 Shipment Document Dataset        (每筆 shipment 一份 dataset)\n' +
'        ↓\n' +
'渲染多個 document_templates           (Detail · Booking · Invoice · Packing · AGL)\n' +
'        ↓\n' +
'存入 generated_documents',
      note: '<strong>關鍵概念:</strong><strong>模板控制版面</strong>,<strong>dataset 控制數值</strong>。Invoice 與 Packing List 即使共用大部分資料,仍維持<strong>獨立 document type</strong>(貿易 / forwarder / 海關可能需分開)。同一份 Shipment Document Dataset 餵給所有文件。',
      discloseSummary: '展開細節 —— MVP DB 與未來 mapping',
      discloseBody: '<p><strong>MVP 文件 DB:</strong><code>document_templates</code>(template_id、template_name、document_type、carrier_id、country、marketplace、language、template_file_type…)與 <code>generated_documents</code>(document_id、template_id、related_entity_type、related_entity_id、document_type、file_name、file_url、generated_by、generated_at、status…)。</p>' +
        '<p><strong>Document-type 目錄:</strong><code>PURCHASE_ORDER</code>、<code>SHIPMENT_DETAIL_SHEET</code>、<code>CARRIER_BOOKING_FORM</code>、<code>COMMERCIAL_INVOICE</code>、<code>PACKING_LIST</code>、<code>COMMERCIAL_INVOICE_PACKING_COMBINED</code>、<code>CUSTOMS_DECLARATION</code>、<code>CERTIFICATE_OF_ORIGIN</code>、<code>MSDS</code>、<code>OTHER</code>。</p>' +
        '<ul>' +
        '<li>一筆 shipment 可產生多份文件(例:TW Invoice、TW Packing List、US Invoice、US Packing List)。</li>' +
        '<li><strong>確切的 token-to-DB mapping 屬未來 Export Center / Mapping Spec。</strong></li>' +
        '<li><code>country_of_origin</code> 可能需 SKU Details 或未來 customs / product master(現在不加 schema)。</li>' +
        '<li>Shipment Document Dataset 為產生時的 runtime / mapping 概念,MVP 不必然是 DB 表。</li>' +
        '</ul>'
    },

    details: {
      kicker: 'H · 模組細節',
      h2: '模組 Demo 卡片',
      lead: '每張卡片:顯示什麼 · 為何重要 · 所屬流程 · Demo 重點。未來實作時卡片可深連結至實際系統頁。'
    },

    memo: {
      kicker: 'I · 討論備忘錄',
      h2: '討論筆記',
      lead: '在 demo / 討論時記下筆記。儲存在你的瀏覽器(LocalStorage)—— 無資料庫、無伺服器。'
    },

    sources: {
      kicker: '參考',
      h2: '資料來源與權威',
      lead: '所有內容皆以下列文件為依據。若細節衝突,以較新的 domain spec 為準。本入口不發明任何流程、DB 或架構。',
      tableHead: ['作為…的權威', '文件'],
      tableRows: [
        ['願景 · Roadmap(Phase 1/2、Site Health Dashboard、Amazon Ads Intelligence Center)', '<code>docs/planning/KITCHEN_MAMA_OPERATION_SYSTEM_BLUEPRINT.md</code>'],
        ['出貨流程 · 文件 · 保留/扣帳時序 · dataset', '<code>docs/planning/SHIPMENT_CENTER_SPEC.md</code>(v2.3)'],
        ['下單 / PO 流程 · 三層 request · PO draft/issued', '<code>docs/planning/REQUEST_ORDER_AND_PO_SPEC.md</code>(v1.3)'],
        ['入口結構 · demo 卡片 · memo 概念', '<code>docs/presentation/KITCHEN_MAMA_SYSTEM_PRESENTATION_PORTAL_SPEC.md</code>']
      ],
      note: '<strong>範圍:</strong>本簡報入口是一個獨立的說明 / 介紹網站。它<strong>不是</strong> ERP runtime,在主 app 中沒有 route,也不會修改 <code>index.html</code> 或 <code>assets/</code>。'
    }
  },

  cards: [
    { t: 'Site Health Dashboard / 站點概況快速總覽', what: '跨站點一眼總覽:今日 / 7 日 / 30 日銷售、Days of Supply、stockout/overstock 風險、在途、預測準確度、促銷風險 —— 依 company/country/marketplace/warehouse。', why: '給 leadership 與 OP 的每日營運 control tower。', flow: 'Home / 橫跨整條供應骨幹', talk: '每天從這裡開始 —— 它告訴你該先看哪裡,再進個別頁面。' },
    { t: 'Amazon Ads Intelligence Center', what: '廣告數據連結營運:Spend / ROAS / ACOS / TACOS、campaign 與 keyword 績效、促銷成效、ads-to-sales 關聯。', why: '把行銷花費連到需求與規劃。', flow: 'Phase 2 · Campaign Center + Forecast/Replenishment', talk: '廣告花費如何餵入預測與下單決策 —— 也是未來 AI advisor/budget/forecast-adjustment 的落腳處。' },
    { t: 'Campaign Center', what: '促銷 / 活動管理 + Promotion Risk Tracker(滾動式促銷分析)。', why: '規劃促銷並及早抓出風險。', flow: 'Phase 1 · 餵入 Forecast event pull-forward', talk: '促銷在此規劃與風險檢查,再流入 forecast。' },
    { t: 'Inventory Replenishment / 貨物庫存表', what: '站點庫存 vs 覆蓋天數;建議補貨(submit 前僅為預覽)。', why: '把 forecast 轉成「要出什麼」。', flow: '主幹', talk: '只是建議 —— 在 Submit Plan 之前什麼都沒被保存。' },
    { t: 'Forecast Review / FC Summary', what: '預測準確度 + base / event / target 預測管理。', why: '驅動所有下游數量。', flow: '供應骨幹(最上游)', talk: '需求期望從這裡開始。' },
    { t: 'Request Order / 下單系統', what: '跨公司 / 站點 / marketplace 的建議下單量。', why: '把規劃轉成採購需求。', flow: '訂單分支', talk: '一次 push 建立一個合併 Request。' },
    { t: 'Request Order Draft', what: '下單審批:draft → pending → approved。', why: '審批在這裡,而非 PO。', flow: '訂單分支', talk: 'Manager 接著 COO 核准。' },
    { t: 'Purchase Order Overview', what: '正式 PO 執行 + 生產追蹤。', why: '僅在 request 核准 / 轉換後建立。', flow: '訂單分支', talk: 'PO draft → issued → in production。' },
    { t: 'Purchase Order List', what: 'PO 行狀態原始檢視(ordered / completed / shipped / remaining)。', why: '單一行級真實狀態。', flow: '訂單分支', talk: '這是即時視圖,不是另一個資料庫。' },
    { t: 'Factory Order Management', what: 'Factory Stock(current/reserved/available)、PO Overview、PO List、生產排程。', why: '共享實體供給池 + 採購執行。', flow: '兩條分支在此交會', talk: 'Available = current − reserved。' },
    { t: 'Weekly Shipping Plan', what: '已規劃出貨需求 + 審批。', why: '規劃 / 審批層。', flow: '出貨流程', talk: '核准後衍生 shipment drafts。' },
    { t: 'Shipment Draft', what: '補齊正式出貨資料(carrier / ETD / ETA / cartons)。', why: 'shipments.status = draft。', flow: '出貨流程', talk: 'Confirm & Ship 才是真正的執行時刻。' },
    { t: 'Shipment Overview', what: '跨所有 shipment 的追蹤 / 歷史 / 搜尋。', why: '權威的 shipment 視圖。', flow: '出貨流程', talk: '讀 shipments + shipment_lines,無平行 DB。' },
    { t: 'Shipment On The Way / World Map', what: '在途可見性與 ETA 分桶。', why: '即時看貨在哪。', flow: '出貨流程', talk: 'completed / cancelled 不計入在途。' },
    { t: 'Warehouse / Overseas Stock', what: '海外 / 3PL / FBA 庫存與異動。', why: '目的地端可見性。', flow: '主幹', talk: '收貨更新此處(Amazon 由 API 同步除外)。' },
    { t: 'Export Center', what: '產生 PO / shipment / invoice / packing 文件。', why: '免除人工製作文件。', flow: '兩條流程的末端', talk: '文件來自已捕捉的紀錄。' },
    { t: 'SKU Details / SKU Handbook', what: 'SKU 主檔 + 產品知識。', why: '幾乎所有東西的 join key。', flow: '基礎', talk: 'Series / category / units-per-carton 都在這裡。' },
    { t: 'KM University', what: '知識庫與教育訓練。', why: 'Onboarding 與參考。', flow: '知識層', talk: '新人與產品知識的連接點。' }
  ]
},

/* ============================ English ============================ */
en: {
  ui: {
    htmlLang: 'en',
    brandSub: 'Operation System',
    tag: 'Presentation Portal',
    searchPlaceholder: 'Search topics, modules, flows…',
    expand: '⤢ Expand',
    collapse: '⤡ Collapse',
    themeToDark: 'Dark',
    themeToLight: 'Light',
    langButton: '中文',
    langTitle: 'Switch language / 切換語言',
    navOverview: 'Overview',
    navFlows: 'Flows',
    navExplore: 'Explore',
    navReference: 'Reference',
    nav: {
      vision: 'A · Overview',
      execblueprint: 'B · Executive Blueprint',
      blueprint: 'C · Technical Blueprint',
      supplychain: 'D · Full Supply Chain Flow',
      shipment: 'E · Shipment Flow',
      request: 'F · Request Order Flow',
      documents: 'G · Document Automation',
      details: 'H · Go To Details',
      memo: 'I · Discussion Memo',
      sources: 'Sources & Authority'
    },
    searchInfo: function (q, n) { return 'Showing matches for "' + q + '" — ' + n + ' section(s).'; },
    cardLabels: { what: 'What', why: 'Why', flow: 'Flow', demo: 'Demo' },
    memo: {
      newBtn: '+ New Memo',
      allStatuses: 'All statuses',
      statusOpen: 'Open', statusInReview: 'In review', statusDone: 'Done', statusDeferred: 'Deferred',
      exportBtn: 'Export JSON', copied: 'Copied!',
      title: 'Title', category: 'Category', priority: 'Priority', status: 'Status', note: 'Note',
      save: 'Save Memo', cancel: 'Cancel',
      emptyNone: 'No memos yet. Click "+ New Memo" to capture a discussion note. Saved in your browser only.',
      emptyFilter: 'No memos match this filter.',
      created: 'Created', updated: 'Updated', edit: 'Edit', delete: 'Delete',
      confirmDelete: 'Delete this memo?', untitled: 'Untitled',
      titlePlaceholder: 'e.g. Confirm COO approval step', notePlaceholder: 'Discussion note…',
      categories: ['Vision', 'Blueprint', 'Supply Chain Flow', 'Shipment Flow', 'Request / PO Flow', 'Document Automation', 'Module Detail', 'Other'],
      priorities: { high: 'High', medium: 'Medium', low: 'Low' }
    },
    footer: 'Kitchen Mama Operation System — Presentation Portal · Standalone documentation site · Content sourced from Blueprint, Shipment Center Spec v2.3, Request Order & PO Spec v1.3, and the Presentation Portal Spec.'
  },

  sections: {
    vision: {
      kicker: 'A · System Vision',
      h1: 'One connected operating backbone for Kitchen Mama',
      p1: 'The Kitchen Mama Operation System is an <strong>all-in-one company operation system — not just a project tracker</strong>. It connects forecast, replenishment, factory stock, overseas warehouse stock, request order, purchase order, production completion, shipment execution, document automation, risk alerts, and the knowledge base — on one source of truth.',
      quote: '"Plan, order, ship, track, and learn — on one connected source of truth."',
      h3problem: 'What problem does it solve?',
      problemLead: 'Today operational data is scattered across Sheets and manual files, re-keyed at every step, and forecast / order / shipment / inventory are not fully connected — so status is hard to trace and risk is discovered late. The system removes re-keying and "where is this order/shipment?" guesswork by letting data flow forward through one chain.',
      h3ba: 'Before vs After',
      beforeHead: 'Before',
      afterHead: 'After',
      before: [
        'Data scattered in Sheets and manual files',
        'Repeated manual key-in',
        'Forecast, order, shipment, inventory not fully connected',
        'Shipment & PO status hard to trace',
        'Documents manually created',
        'Risks discovered late',
        'Factory / overseas / office not always aligned'
      ],
      after: [
        '<strong>One system, one source of truth</strong>',
        'Forecast → replenishment → request → PO → shipment → document connected',
        'Less repeated manual entry',
        'PO and shipment status traceable',
        'Documents generated from existing records',
        'Factory stock / overseas stock / on-the-way visible',
        'Future alerts & AI analysis become possible',
        'Factory & warehouse portals share the same data backbone'
      ],
      h3chain: 'The connected chain',
      chain: [
        { h: 'Plan', p: 'Forecast · replenishment · factory-stock allocation planning.' },
        { h: 'Execute', p: 'Request order · purchase order · production · shipment.' },
        { h: 'Track & Learn', p: 'On-the-way visibility · documents · risk alerts · KM University · future AI / API / BigQuery.' }
      ]
    },

    execblueprint: {
      kicker: 'B · Executive Blueprint',
      h2: 'Executive Blueprint',
      subtitle: 'Business Overview',
      mainMessage: 'Kitchen Mama Operation System connects the company through one shared operational map.',
      rootNode: 'Kitchen Mama Operation System',
      colorNote: 'Color indicators are used for capability grouping, not live status.',
      loop: {
        title: 'Core Operating Loop',
        subtitle: 'From demand planning to purchase, production, shipment, receiving, and the next replenishment cycle.',
        steps: [
          { icon: '📊', t: 'Forecast & Inventory Check', d: 'Demand, stock, factory inventory, and on-the-way goods are reviewed.' },
          { icon: '📝', t: 'Request Order', d: 'System recommends order quantities and teams submit purchasing requests.' },
          { icon: '🏭', t: 'Purchase Order & Production', d: 'Approved requests become purchase orders and factory production starts.' },
          { icon: '✅', t: 'Production Completion', d: 'Completed quantities become available for shipment planning.' },
          { icon: '🚢', t: 'Shipment Planning', d: 'OP plans shipments based on stock, demand, and destination needs.' },
          { icon: '📦', t: 'Confirm & Ship', d: 'Shipment is confirmed, stock is deducted, and documents are generated.' },
          { icon: '🏬', t: 'Receiving & Inventory Update', d: 'Goods arrive, warehouse inventory is updated, and the next cycle begins.' }
        ],
        backLabel: 'Back to Forecast & Inventory Check',
        note: 'This loop connects the ordering flow and shipment flow into one continuous operating cycle.',
        note2: 'Detailed workflow rules remain in the Shipment Flow and Request / Purchase Flow sections.'
      },
      moduleCount: function (n) { return n + ' modules'; },
      more: function (n) { return '+' + n + ' more'; },
      drawer: {
        purposeLabel: 'Purpose',
        explanationLabel: 'Overview',
        modulesLabel: 'Modules',
        flowLabel: 'Related business flow',
        viewDetails: 'View Details →',
        close: 'Close'
      },
      domains: [
        { icon: '🏠', cat: 'teal', catLabel: 'Command', name: 'Executive Dashboard',
          purpose: 'Daily command center for company health.',
          explain: 'The daily landing point for leadership — company health, alerts, tasks, and goals at a glance.',
          flow: 'System entry point — links into every other domain.',
          mods: ['Home', 'Site Health Dashboard', 'Alerts', 'Tasks', 'Goals'] },
        { icon: '📦', cat: 'green', catLabel: 'Inventory', name: 'Supply Chain Planning',
          purpose: 'Prevent stockouts while minimizing inventory.',
          explain: 'Forecast-driven planning that keeps inventory healthy across every site without over-stocking.',
          flow: 'Full Supply Chain Flow (Section D).',
          mods: ['Inventory Replenishment', 'Forecast Review', 'FC Summary', 'Warehouse Stock', 'Factory Stock', 'Overseas Stock'] },
        { icon: '📈', cat: 'purple', catLabel: 'Demand', name: 'Marketing & Demand',
          purpose: 'Connect demand, campaigns, and future forecast adjustment.',
          explain: 'Plans campaigns and watches promotion risk so demand signals reach forecasting early.',
          flow: 'Feeds the Forecast step of the supply chain flow.',
          mods: ['Campaign Center', 'Promotion Risk Tracker', 'Campaign Calendar', 'Amazon Ads Intelligence Center', 'Marketing Performance Review'] },
        { icon: '📋', cat: 'blue', catLabel: 'Product', name: 'Product & Supplier',
          purpose: 'Single source of truth for products and supplier data.',
          explain: 'The product and supplier master data that nearly every other module joins to.',
          flow: 'Foundation for the order and supply flows.',
          mods: ['SKU Details', 'Supplier Management', 'Supplier Price List', 'Payment Terms', 'Product Cost', 'Marketplace SKU'] },
        { icon: '🏭', cat: 'orange', catLabel: 'Factory', name: 'Procurement & Factory',
          purpose: 'Standardize purchasing and production tracking.',
          explain: 'Turns approved demand into purchase orders and tracks production to completion.',
          flow: 'Request Order Flow (Section F).',
          mods: ['Request Order', 'Request Order Draft', 'Purchase Order Overview', 'Purchase Order List', 'Production Schedule', 'Factory Portal'] },
        { icon: '🚢', cat: 'cyan', catLabel: 'Shipment', name: 'Logistics & Shipment',
          purpose: 'Track every shipment from factory to destination.',
          explain: 'Plans, executes, and tracks shipments from factory to destination, and generates the documents.',
          flow: 'Shipment Flow (Section E).',
          mods: ['Weekly Shipping Plan', 'Shipment Draft', 'Shipment Overview', 'On The Way', 'World Map', 'Export Center', 'Carrier', 'Shipment Documents'] },
        { icon: '💰', cat: 'amber', catLabel: 'Cost', name: 'Cost & Analytics',
          purpose: 'Understand cost, margin, and business performance.',
          explain: 'Brings cost, margin, and performance together once the operational chain is connected.',
          flow: 'End of the supply chain flow (cost & analytics).',
          mods: ['Cost Analysis Center', 'Product Cost Review', 'Margin Analysis', 'Forecast Accuracy', 'Inventory Health', 'BigQuery / Reporting'] },
        { icon: '📚', cat: 'indigo', catLabel: 'Knowledge', name: 'Knowledge & Organization',
          purpose: 'Turn operational experience into reusable company knowledge.',
          explain: 'Captures company knowledge and governs the master data and access that hold everything together.',
          flow: 'Knowledge & governance layer across all flows.',
          mods: ['KM University', 'SKU Handbook', 'SOP Center', 'AI Assistant', 'Company Management', 'Warehouse Management', 'Role & Permission'] }
      ]
    },

    blueprint: {
      kicker: 'C · Technical Blueprint',
      h2: 'Roadmap — Phase 1 & Phase 2',
      lead: 'Phase 1 is the operational MVP that runs the weekly supply cycle. Phase 2 layers intelligence, portals, and integrations on top of the stable backbone. <em>Source: Blueprint.</em>',
      note: '<strong>Company / factory context:</strong> <strong>KM</strong> = brand/operating entity · <strong>ResTW</strong> = procurement / supply-chain hub · <strong>ResUS</strong> = US operating entity. KM and ResUS place demand through ResTW. Factories <strong>CN_YOUXIN (東莞侑鑫)</strong> and <strong>TW_SHENGYI (南投勝一)</strong> are production resources / a shared stock pool — not company entities.',
      p1head: 'Phase 1 modules',
      p1badge: 'Phase 1',
      phase1: [
        { t: 'Home', p: 'Landing page and system entry point (the widgets below are UI-built; data wiring is a Phase 1 goal).', sub: ['Home overview', 'World time', 'Quick access to all modules', 'Upcoming Event', 'Alert Notifications', 'To-Do / Tasks', 'Bulletin Board', 'Goal'] },
        { t: 'Site Health Dashboard / 站點概況快速總覽', p: 'One-glance daily operational control tower across all sites — a standalone page, separate from Home.', sub: ['Daily operational control tower', "Today's Sales / 7-Day / 30-Day Sales Trend", 'Days of Supply', 'Stockout Risk / Overstock Risk', 'In-Transit Status', 'Forecast Accuracy', 'Promotion Risk'] },
        { t: '2 · Campaign Center', p: 'Promotion & campaign management and risk.', sub: ['Campaign Center', 'Promotion Risk Tracker', 'Campaign performance review', 'Future Campaign Calendar / Gantt'] },
        { t: '3 · Inventory Replenishment / 貨物庫存表', p: 'Monitor site inventory and compute suggested replenishment.', sub: ['貨物庫存表', 'Site-level inventory overview', 'Suggested replenishment', 'Factory stock allocation display', 'Stockout risk warning', 'Overstock risk warning'] },
        { t: '4 · Forecast Review / Forecast 成效監管中心', p: 'Forecast management and accuracy review.', sub: ['Forecast Review', 'FC Summary', 'Base Forecast', 'Special Event Forecast', 'Target % Rules', 'Forecast Accuracy / Review'] },
        { t: '5 · SKU Data Center', p: 'SKU master and supplier / pricing / payment terms.', sub: ['SKU Details', 'Supplier Management', 'Supplier Price List / 出廠價目表', 'Payment Terms', 'Product / Customs master data (future)'] },
        { t: '6 · Warehouse Stock', p: 'Overseas / 3PL / FBA inventory and movements.', sub: ['Overseas Stock', 'FBA Inventory', '3PL Inventory', 'Warehouse Inventory Snapshot', 'Warehouse Inventory Movements'] },
        { t: '7 · Factory Order Management', p: 'Factory stock, POs, and production tracking.', sub: ['Factory Stock', 'Factory Stock Movements', 'Purchase Order Tracking', 'Production Schedule', 'Completion Tracking'] },
        { t: '8 · Request Order / Procurement Center', p: 'Order calculation and purchase-order execution.', sub: ['下單系統', 'Request Order Draft', 'Purchase Order Overview', 'Purchase Order List'] },
        { t: '9 · Shipping Center', p: 'Shipment planning, execution, and in-transit tracking.', sub: ['Weekly Shipping Plan', 'Shipment Draft', 'Shipment Overview', 'Shipment On The Way', 'World Map'] },
        { t: '10 · Export Center', p: 'Generate shipment / customs documents from existing records.', sub: ['Shipment Detail Sheet', 'Carrier Booking Form / 托單', 'Commercial Invoice', 'Packing List', 'Commercial Invoice + Packing Combined', 'Customs documents'] },
        { t: '11 · Cost Analysis Center', p: 'Cost, freight, margin, and landed-cost analysis.', sub: ['Shipment Cost', 'Carrier Cost', 'Product Cost', 'Landed Cost', 'Margin Analysis', 'Cost Trend / Future BQ analytics'] },
        { t: '12 · KM University', p: 'Training and knowledge base (incl. product knowledge).', sub: ['Training Center', 'SOP', 'SKU Handbook', 'SKU knowledge', 'Internal onboarding'] },
        { t: '13 · Admin / Master Data Center', p: 'Master data underpinning every module.', sub: ['Company Management', 'Site / Marketplace Management', 'Warehouse / Factory Management', 'People / Department Management', 'Template Management'] }
      ],
      spotlight1Summary: '★ Spotlight — Site Health Dashboard (站點概況快速總覽)',
      spotlight1Body: '<p><strong>Purpose:</strong> give leadership and OP teams a one-glance operational control tower across all sites — a daily management entrance.</p>' +
        '<p><strong>Suggested metrics:</strong> Today\'s Sales · 7-Day Sales Trend · 30-Day Sales Trend · Days of Supply · Stockout Risk · Overstock Risk · In-Transit Status · Forecast Accuracy · Promotion Risk.</p>' +
        '<p><strong>Dimensions:</strong> Company · Country · Marketplace · Warehouse.</p>' +
        '<p><strong>Positioning:</strong> one of the most important Home dashboard capabilities; a read/aggregation view, not a new record store.</p>',
      p2head: 'Phase 2 modules',
      p2badge: 'Phase 2',
      phase2: [
        { t: 'AI-assisted demand prediction', p: 'Forecast & order recommendations from accumulated history.' },
        { t: 'AI operations assistant', p: 'Natural-language assistant reading the same DB.' },
        { t: 'Campaign calendar / Gantt', p: 'Full promotion planning timeline.' },
        { t: 'Factory portal', p: 'Role-scoped factory view over the same backbone.' },
        { t: 'Overseas warehouse portal', p: 'Role-scoped warehouse view over the same backbone.' },
        { t: 'New Product Monitoring Center', p: 'Track new SKU launch performance and ramp.' },
        { t: '★ Amazon Ads Intelligence Center', p: 'Connect Amazon Ads API data with operational planning (broader than a plain marketplace/logistics API pull).', badge: 'New in Blueprint' },
        { t: 'Marketplace / logistics API integration', p: 'Amazon FBA inventory live sync, carrier tracking.' },
        { t: 'BigQuery / data warehouse', p: 'Analytics / reporting target.' },
        { t: 'Permission / sensitive-data control', p: 'Role model gating cost / payment data + portal scope.' }
      ],
      spotlight2Summary: '★ Spotlight — Amazon Ads Intelligence Center',
      spotlight2Body: '<p><strong>Purpose:</strong> connect Amazon Ads API data with operational planning.</p>' +
        '<p><strong>Potential capabilities:</strong> Spend Analysis · ROAS Analysis · ACOS Analysis · TACOS Analysis · Campaign Performance Analysis · Keyword Analysis · Promotion Effectiveness Analysis · Ads-to-Sales Correlation Analysis.</p>' +
        '<p><strong>Future direction:</strong> AI Campaign Advisor · AI Budget Suggestion · AI Forecast Adjustment.</p>'
    },

    supplychain: {
      kicker: 'D · Full Supply Chain Flow',
      h2: 'The supply chain backbone',
      lead: 'Each arrow is a forward data hand-off. Calculation previews are not persisted until an explicit submit / push / create action. <em>Source: Blueprint §5.</em>',
      h3main: 'Main backbone',
      mainDiagram:
'Forecast / FC Summary\n' +
'   ↓\n' +
'Inventory Projection\n' +
'   ↓\n' +
'Factory Stock Allocation Planning      (planning layer — metadata only)\n' +
'   ↓\n' +
'Inventory Replenishment / 貨物庫存表    (suggested replenishment; Submit → shipping_plans)\n' +
'   ↓\n' +
'Weekly Shipping Plan\n' +
'   ↓\n' +
'Shipment Draft\n' +
'   ↓\n' +
'Confirm & Ship                         (factory_stock.current_stock deduction point)\n' +
'   ↓\n' +
'Export Center / Document Generation\n' +
'   ↓\n' +
'Carrier / Factory Communication        (MVP manual email)\n' +
'   ↓\n' +
'Shipment Overview\n' +
'   ↓\n' +
'On The Way / World Map\n' +
'   ↓\n' +
'Receiving / Inventory Update\n' +
'   ↓\n' +
'Cost Analysis Center\n' +
'   ↓\n' +
'Future AI / BQ / Analytics',
      h3order: 'Order branch',
      orderDiagram:
'Forecast / Inventory / Factory Stock / On The Way\n' +
'   ↓\n' +
'下單系統\n' +
'   ↓\n' +
'Request Order Draft\n' +
'   ↓\n' +
'Purchase Order Overview\n' +
'   ↓\n' +
'Purchase Order List\n' +
'   ↓\n' +
'Production Completion\n' +
'   ↓\n' +
'available_to_ship = completed_qty − shipped_qty\n' +
'   ↓\n' +
'Shipment allocation',
      note: 'The two branches meet at <strong>factory stock / <code class="inline">available_to_ship</code></strong> — orders produce supply; shipments consume it.'
    },

    shipment: {
      kicker: 'E · Shipment Flow',
      h2: 'Weekly Shipping Plan → Shipment → Receiving',
      lead: 'How an approved plan becomes a tracked, documented shipment. <em>Source: Shipment Center Spec v2.3.</em>',
      steps: [
        { title: 'Inventory Replenishment suggestion → Weekly Shipping Plan', desc: 'OP pushes selected needs into the plan.', chips: ['shipping_plans', 'shipping_plan_lines'] },
        { title: 'Submit → Manager approval → COO approval', desc: 'Planning / approval layer.', chips: [] },
        { title: 'Approved plan creates shipments + shipment_lines', desc: 'Execution snapshot; factory stock <strong>reserved</strong> (reserved_stock ↑, current_stock unchanged).', chips: ['shipments', 'shipment_lines', 'status = draft', 'reserved_stock ↑'] },
        { title: 'Shipment Draft — complete formal data', desc: 'Amazon shipment ID / reference / warehouse code / ship date / ETD / ETA / carrier / shipping method / note. <strong>Shipment Draft = shipments.status = draft</strong> (no separate table).', chips: ['status = planned'] },
        { title: 'Confirm & Ship', desc: '<strong>The physical execution trigger</strong> — factory_stock.current_stock ↓, reserved_stock released; FIFO PO allocation finalized.', chips: ['status = ready_to_ship', 'current_stock ↓', 'shipment_line_allocations'] },
        { title: 'Export Center / Document Generation', desc: 'Generate Detail Sheet · Carrier Booking / 托單 · Invoice · Packing List · AGL Combined from existing records. (After Confirm & Ship, before carrier/factory communication.)', chips: ['generated_documents'] },
        { title: 'MVP — manual email to factory / carrier', desc: 'Download docs · attach shipping labels · email manually. (Future: API / auto email.)', chips: [] },
        { title: 'Shipment Overview', desc: 'Tracking / history / search reading shipments + shipment_lines.', chips: [] },
        { title: 'In Transit / On The Way', desc: 'Future shipment_events / shipment_routes track milestones & route.', chips: ['in_transit'] },
        { title: 'Receiving → Completed', desc: 'Non-Amazon warehouse inventory increases on receipt; Amazon comes from API / live sync.', chips: ['partial_received', 'completed'] }
      ],
      discloseSummary: 'Expand details — DB, status & rules',
      discloseItems: [
        '<strong>Shipment Draft = <code>shipments.status = draft</code></strong> — an editable preparation view, <strong>not</strong> a new DB. Do not create a <code>shipment_drafts</code> table.',
        '<strong>Confirm & Ship is the single <code>factory_stock.current_stock</code> deduction point.</strong> Plan creation / submission and Shipment Draft never deduct current_stock.',
        '<strong>reserved_stock</strong> increases after approval / shipment creation; cancellation releases reserved_stock and never deducts current_stock.',
        '<strong>Shipment Overview / On The Way / World Map read <code>shipments</code> + <code>shipment_lines</code></strong> (authoritative); <code>completed</code> / <code>cancelled</code> do not count as on-the-way.',
        '<strong><code>shipment_events</code> / <code>shipment_routes</code> are future enrichment only</strong> — never replacements.',
        '<strong>Amazon FBA inventory</strong> should usually come from API / live sync, not manual increase.',
        '<strong>Status lifecycle:</strong> <code>draft → planned → ready_to_ship → in_transit → partial_received → completed</code> (+ <code>cancelled</code>, <code>stuck</code>).'
      ]
    },

    request: {
      kicker: 'F · Request Order Flow',
      h2: '下單系統 → Request → Purchase Order → Production → Shipment',
      lead: 'How the order side operates after the calculation page creates a Request. <em>Source: Request Order & PO Spec v1.3.</em>',
      steps: [
        { title: '下單系統 calculation', desc: 'Recommended order quantities across all companies / sites / marketplaces.', chips: [] },
        { title: 'One combined Request pushed', desc: 'Creates the three-layer request structure in a single action.', chips: ['request_orders', 'request_order_lines', 'request_order_line_sources'] },
        { title: 'Request Order Draft → Manager → COO approval', desc: '<strong>Approval lives only on the request layer.</strong>', chips: ['draft → pending_approval → approved'] },
        { title: 'Approved Request converts to Purchase Order', desc: 'PO does not own an approval workflow.', chips: ['purchase_orders', 'purchase_order_lines', 'request → converted_to_po'] },
        { title: 'Purchase Order Overview → generate PO document → issue', desc: 'PO <code>draft</code> = created but not sent; MVP manual email to factory; then set <code>issued</code>.', chips: ['draft → issued', 'generated_documents'] },
        { title: 'Production completion', desc: 'Updates <code>purchase_order_lines.completed_qty</code>.', chips: ['in_production → completed'] },
        { title: 'Purchase Order List → Shipment allocation', desc: '<code>available_to_ship = completed_qty − shipped_qty</code> — never ship uncompleted quantity.', chips: [] }
      ],
      h3rel: 'Table relationships',
      relHead: ['Table', 'Grain', 'Holds / links'],
      relRows: [
        ['<code>request_orders</code>', 'Request header / batch', 'One push action. <strong>No</strong> company/country/marketplace on header. Owns submit/approve/reject/cancel.'],
        ['<code>request_order_lines</code>', 'SKU-level aggregated', 'Aggregated order qty per SKU. Series joined from SKU Details (not stored). <code>linked_purchase_order_line_id</code> after conversion.'],
        ['<code>request_order_line_sources</code>', 'Company / site source', 'Company / country / marketplace / warehouse / site_sku breakdown. <code>ownership_company</code> default ResTW (planning metadata only).'],
        ['<code>purchase_orders</code>', 'PO header (execution)', '<code>source_request_order_id</code>. Status <code>draft → issued → in_production → … → closed</code>.'],
        ['<code>purchase_order_lines</code>', 'PO line (execution)', '<code>source_request_order_line_id</code>. <code>completed_qty</code>, <code>shipped_qty</code>; <code>available_to_ship = completed_qty − shipped_qty</code>.']
      ],
      discloseSummary: 'Expand details — approval vs execution',
      discloseItems: [
        '<strong><code>request_orders</code> owns approval</strong> (submit / approve / reject / cancel). <strong>PO does NOT own the approval workflow.</strong>',
        '<strong>PO <code>draft</code></strong> = formal PO exists but is <strong>not yet issued</strong> to factory (execution preparation, not approval).',
        '<strong>PO <code>issued</code></strong> = generated / sent / confirmed to factory.',
        '<strong><code>request_order_line_sources</code></strong> stores the company/site breakdown; the request stays SKU-level aggregated in <code>request_order_lines</code>.',
        '<strong>Purchase Order List is a read / view</strong> over <code>purchase_orders</code> + <code>purchase_order_lines</code> (with <code>shipment_line_allocations</code> for shipped relationship) — not a separate DB.',
        'One-request → many-PO is designed via the planned <code>request_order_po_links</code> table (MVP uses <code>converted_purchase_order_id</code> for one→one).'
      ]
    },

    documents: {
      kicker: 'G · Document Automation',
      h2: 'Documents are derived outputs, not source of truth',
      lead: 'Documents are assembled from authoritative PO / shipment / SKU / warehouse data; regenerating a document never changes underlying records. <em>Source: Shipment Spec v2.2/v2.3 §16/§20, Request/PO Spec v1.3 §16.</em>',
      docs: [
        { t: 'Purchase Order', p: 'From <code class="inline">purchase_orders</code> + lines.' },
        { t: 'Shipment Detail Sheet', p: 'Shipment ID, SKU, qty, cartons, weight, CBM, PO No, warehouse, ETD/ETA, carrier.' },
        { t: 'Carrier Booking Form / 托單', p: 'Recipient + customs section; cargo item no = shipment_no + sequence.' },
        { t: 'Commercial Invoice', p: 'Invoice no/date, ship to, SKU, qty, unit price, amount.' },
        { t: 'Packing List', p: 'PO no, SKU, qty, CTNS, gross/net weight, CBM, carton size.' },
        { t: 'Amazon AGL Invoice + Packing', p: 'FBA Shipment ID, HTS code, country of origin, unit cost, totals.' }
      ],
      h3flow: 'Generation flow — one dataset, many templates',
      flowDiagram:
'Authoritative DB records\n' +
'        ↓\n' +
'Build Shipment Document Dataset        (one dataset per shipment)\n' +
'        ↓\n' +
'Render multiple document_templates     (Detail · Booking · Invoice · Packing · AGL)\n' +
'        ↓\n' +
'Save generated_documents',
      note: '<strong>Key idea:</strong> the <strong>template controls layout</strong>, the <strong>dataset controls values</strong>. Invoice and Packing List remain <strong>separate document types</strong> even though they share most data (trade / forwarder / customs may need them separate). One shared Shipment Document Dataset feeds them all.',
      discloseSummary: 'Expand details — MVP DB & future mapping',
      discloseBody: '<p><strong>MVP document DB:</strong> <code>document_templates</code> (template_id, template_name, document_type, carrier_id, country, marketplace, language, template_file_type, …) and <code>generated_documents</code> (document_id, template_id, related_entity_type, related_entity_id, document_type, file_name, file_url, generated_by, generated_at, status, …).</p>' +
        '<p><strong>Document-type catalog:</strong> <code>PURCHASE_ORDER</code>, <code>SHIPMENT_DETAIL_SHEET</code>, <code>CARRIER_BOOKING_FORM</code>, <code>COMMERCIAL_INVOICE</code>, <code>PACKING_LIST</code>, <code>COMMERCIAL_INVOICE_PACKING_COMBINED</code>, <code>CUSTOMS_DECLARATION</code>, <code>CERTIFICATE_OF_ORIGIN</code>, <code>MSDS</code>, <code>OTHER</code>.</p>' +
        '<ul>' +
        '<li>A single shipment may generate multiple documents (e.g. TW Invoice, TW Packing List, US Invoice, US Packing List).</li>' +
        '<li><strong>Exact token-to-DB mapping is future Export Center / Mapping Spec work.</strong></li>' +
        '<li><code>country_of_origin</code> may require SKU Details or a future customs / product master (no schema added now).</li>' +
        '<li>The Shipment Document Dataset is a generated runtime / mapping concept, not necessarily a DB table in MVP.</li>' +
        '</ul>'
    },

    details: {
      kicker: 'H · Go To Details',
      h2: 'Module demo cards',
      lead: 'Each card: what it shows · why it matters · which flow it belongs to · demo talking point. Cards can deep-link to live system pages in a future implementation.'
    },

    memo: {
      kicker: 'I · Discussion Memo',
      h2: 'Discussion notes',
      lead: 'Capture discussion notes during a demo / review. Saved in your browser (LocalStorage) — no database, no server.'
    },

    sources: {
      kicker: 'Reference',
      h2: 'Sources & Authority',
      lead: 'All content is grounded in these documents. If details conflict, the newer domain spec wins. This portal invents no flows, no DB, and no architecture.',
      tableHead: ['Authority for…', 'Document'],
      tableRows: [
        ['Vision · Roadmap (Phase 1/2, Site Health Dashboard, Amazon Ads Intelligence Center)', '<code>docs/planning/KITCHEN_MAMA_OPERATION_SYSTEM_BLUEPRINT.md</code>'],
        ['Shipment Flow · documents · reservation/deduction timing · dataset', '<code>docs/planning/SHIPMENT_CENTER_SPEC.md</code> (v2.3)'],
        ['Request Order / PO Flow · three-layer request · PO draft/issued', '<code>docs/planning/REQUEST_ORDER_AND_PO_SPEC.md</code> (v1.3)'],
        ['Portal structure · demo cards · memo concept', '<code>docs/presentation/KITCHEN_MAMA_SYSTEM_PRESENTATION_PORTAL_SPEC.md</code>']
      ],
      note: '<strong>Scope:</strong> This Presentation Portal is a standalone documentation/intro site. It is <strong>not</strong> the ERP runtime, has no route in the main app, and does not modify <code>index.html</code> or <code>assets/</code>.'
    }
  },

  cards: [
    { t: 'Site Health Dashboard / 站點概況快速總覽', what: 'One-glance cross-site overview: today\'s/7-day/30-day sales, Days of Supply, stockout/overstock risk, in-transit, forecast accuracy, promotion risk — by company/country/marketplace/warehouse.', why: 'A daily operational control tower for leadership and OP.', flow: 'Home / spans the whole supply backbone', talk: 'Start every day here — it tells you where to look before opening any single page.' },
    { t: 'Amazon Ads Intelligence Center', what: 'Amazon Ads data tied to operations: Spend / ROAS / ACOS / TACOS, campaign & keyword performance, promotion effectiveness, ads-to-sales correlation.', why: 'Connects marketing spend to demand and planning.', flow: 'Phase 2 · Campaign Center + Forecast/Replenishment', talk: 'This is how ad spend feeds forecast and order decisions — and where AI advisor/budget/forecast-adjustment will live.' },
    { t: 'Campaign Center', what: 'Promotion & campaign management + Promotion Risk Tracker (rolling promotion analysis).', why: 'Plan promotions and catch risky ones early.', flow: 'Phase 1 · feeds Forecast event pull-forward', talk: 'Promotions are planned and risk-checked here, then flow into forecast.' },
    { t: 'Inventory Replenishment / 貨物庫存表', what: 'Site inventory vs coverage; suggested replenishment (preview only until submit).', why: 'Turns forecast into "what to ship".', flow: 'Main backbone', talk: 'Suggestions only — nothing is committed until Submit Plan.' },
    { t: 'Forecast Review / FC Summary', what: 'Forecast accuracy + base / event / target forecast management.', why: 'Drives every downstream quantity.', flow: 'Supply backbone (top)', talk: 'This is where demand expectations start.' },
    { t: 'Request Order / 下單系統', what: 'Recommended order qty across companies / sites / marketplaces.', why: 'Turns planning into procurement need.', flow: 'Order branch', talk: 'One push creates one combined Request.' },
    { t: 'Request Order Draft', what: 'Request approval: draft → pending → approved.', why: 'Approval lives here, not on the PO.', flow: 'Order branch', talk: 'Manager then COO approve.' },
    { t: 'Purchase Order Overview', what: 'Formal PO execution + production tracking.', why: 'Created only after request approval/conversion.', flow: 'Order branch', talk: 'PO draft → issued → in production.' },
    { t: 'Purchase Order List', what: 'Raw PO line status (ordered / completed / shipped / remaining).', why: 'Single line-level truth.', flow: 'Order branch', talk: 'A live view, not a separate database.' },
    { t: 'Factory Order Management', what: 'Factory Stock (current/reserved/available), PO Overview, PO List, production schedule.', why: 'The shared physical supply pool + procurement execution.', flow: 'Both branches meet here', talk: 'Available = current − reserved.' },
    { t: 'Weekly Shipping Plan', what: 'Planned shipping needs + approval.', why: 'Plan / approval layer.', flow: 'Shipment flow', talk: 'Approval spawns shipment drafts.' },
    { t: 'Shipment Draft', what: 'Complete formal shipment data (carrier / ETD / ETA / cartons).', why: 'shipments.status = draft.', flow: 'Shipment flow', talk: 'Confirm & Ship is the real execution moment.' },
    { t: 'Shipment Overview', what: 'Tracking / history / search across all shipments.', why: 'Authoritative shipment view.', flow: 'Shipment flow', talk: 'Reads shipments + shipment_lines, no parallel DB.' },
    { t: 'Shipment On The Way / World Map', what: 'In-transit visibility and ETA buckets.', why: 'See where goods are right now.', flow: 'Shipment flow', talk: 'completed / cancelled do not count as on-the-way.' },
    { t: 'Warehouse / Overseas Stock', what: 'Overseas / 3PL / FBA inventory + movements.', why: 'Destination-side visibility.', flow: 'Main backbone', talk: 'Receiving updates this (except Amazon API-synced).' },
    { t: 'Export Center', what: 'Generate PO / shipment / invoice / packing documents.', why: 'Removes manual document creation.', flow: 'End of both flows', talk: 'Documents come from records already captured.' },
    { t: 'SKU Details / SKU Handbook', what: 'SKU master + product knowledge.', why: 'The join key for nearly everything.', flow: 'Foundation', talk: 'Series / category / units-per-carton all live here.' },
    { t: 'KM University', what: 'Knowledge base & training.', why: 'Onboarding and reference.', flow: 'Knowledge layer', talk: 'Where new staff and product knowledge connect.' }
  ]
}

};
