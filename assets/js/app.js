// ========================================
// Menu Configuration
// ========================================
const menuConfig = [
    {
        id: "forecast",
        label: "Forecast Overview",
        icon: "📈",
        type: "parent",
        children: [
            { id: "forecast-review", label: "Forecast 管理", section: "forecast" },
            { id: "fc-summary", label: "FC Summary", section: "fc-summary" }
        ]
    }
];

// ========================================
// Menu Toggle Function
// ========================================
function toggleMenu(menuId) {
    const parent = document.querySelector(`[data-menu-id="${menuId}"]`);
    const children = document.querySelector(`.menu-children[data-parent="${menuId}"]`);

    if (!parent || !children) return;

    parent.classList.toggle("is-open");
    children.classList.toggle("is-open");
}

window.toggleMenu = toggleMenu;

// ========================================
// Sidebar Collapse/Expand
// ========================================
function toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('is-collapsed');
}
window.toggleSidebar = toggleSidebar;

// ========================================
// ========================================
// Homepage - 已搬移至 pages/home.js
// ========================================

// Centralized owner of the shared Home shell (Round 2 top-gap fix). The Home shell = the #home-mount WRAPPER, the
// world-time bar, and the injected #home-section. On every non-Home page the ENTIRE wrapper must leave layout —
// hiding only the inner #home-section left #home-mount in normal flow (it is never :empty; it holds #home-section),
// which exposed the Home goal-card cream gradient (home.css .goal-container #fff7ed→#ffedd5) as a strip between the
// header and the active page. Uses the native `hidden` attribute (guarantees display:none via the scoped
// `[hidden]` rule in layout.css, which also beats author rules like `.world-time-bar { display:flex }`), and clears
// any stale inline `display` so the attribute is authoritative. Every node is null-guarded (partial-loaded/optional).
function setHomeShellVisible(isVisible) {
    ['home-mount', 'world-time-bar', 'home-section'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.hidden = !isVisible;
        el.style.display = '';   // drop any legacy inline display so `hidden` (not an inline style) governs layout
    });
    var mount = document.getElementById('home-mount');
    if (mount) mount.setAttribute('aria-hidden', String(!isVisible));
}
window.setHomeShellVisible = setHomeShellVisible;

// 區塊切換函式
function showSection(section) {
    // TEMP Phase-2 disable: Overseas Inbound / Overseas Outbound sidebar nav is intentionally
    // non-interactive ("coming later"). This guard is SCOPED to only these two section ids so all
    // other sidebar navigation is unaffected. The pages/routes/section maps below are kept intact.
    // TO RE-ENABLE: remove this guard AND restore the onclick handlers + remove
    // menu-item--disabled/aria-disabled/tabindex on the two items in index.html.
    if (section === 'overseas-inbound' || section === 'overseas-outbound') {
        return;
    }

    // ---- Normalize the shared shell BEFORE mounting the next page (UI lifecycle ownership) --------------
    // Remove the ENTIRE Home shell (mount wrapper + world-time bar + section) from layout — not just its inner
    // children — so no Home wrapper stays in flow between the header and the active page. Then clear `.active`
    // from every section so exactly one page owns layout space. No colours/margins/offsets/overflow tricks.
    setHomeShellVisible(false);
    document.querySelectorAll('.module-section').forEach(function (sec) { sec.classList.remove('active'); });
    
    // 呼叫生命週期切換（如果已註冊）
    if (window.KM && window.KM.lifecycle && window.KM.lifecycle.switchTo) {
        const sectionMap = {
            'ops': 'ops-section',
            'factory-stock': 'factory-stock-section',
            'overseas-stock': 'overseas-stock-section',
            'overseas-inbound': 'overseas-inbound-section',
            'overseas-outbound': 'overseas-outbound-section',
            'forecast': 'forecast-section',
            'request-order': 'request-order-section',
            'fc-summary': 'fc-summary-section',
            'skuDetails': 'sku-section',
            'supplychain': 'supplychain-section',
            'sku-handbook': 'sku-handbook-section',
            'shippingplan': 'shippingplan-section',
            'shippinghistory': 'shippinghistory-section',
            'shipment-draft': 'shipment-draft-section',
            'shipment-overview': 'shippinghistory-section',
            'campaign-risk': 'campaign-risk-section',
            'request-order-draft': 'request-order-draft-section',
            'purchase-order-overview': 'purchase-order-overview-section',
            'purchase-order-list': 'purchase-order-list-section',
            'carrier-rate-card': 'carrier-rate-card-section',
            'sku-regional-details': 'sku-regional-details-section',
            'global-logistics-map': 'global-logistics-map-section',
            'automation': 'automation-schedule-section'
        };
        const targetSectionId = sectionMap[section];
        if (targetSectionId) {
            KM.lifecycle.switchTo(targetSectionId);
        }
    }

    // 顯示選擇的區塊
    const sectionMap = {
        'ops': 'ops-section',
        'factory-stock': 'factory-stock-section',
        'overseas-stock': 'overseas-stock-section',
        'overseas-inbound': 'overseas-inbound-section',
        'overseas-outbound': 'overseas-outbound-section',
        'forecast': 'forecast-section',
        'request-order': 'request-order-section',
        'fc-summary': 'fc-summary-section',
        'skuDetails': 'sku-section',
        'supplychain': 'supplychain-section',
        'sku-handbook': 'sku-handbook-section',
        'shippingplan': 'shippingplan-section',
        'shippinghistory': 'shippinghistory-section',
        'shipment-draft': 'shipment-draft-section',
        'shipment-overview': 'shippinghistory-section',
        'campaign-risk': 'campaign-risk-section',
        'request-order-draft': 'request-order-draft-section',
        'purchase-order-overview': 'purchase-order-overview-section',
        'purchase-order-list': 'purchase-order-list-section',
        'carrier-rate-card': 'carrier-rate-card-section',
        'sku-regional-details': 'sku-regional-details-section',
        'automation': 'automation-schedule-section'
    };

    const targetSectionId = sectionMap[section];
    if (targetSectionId) {
        const targetSection = document.getElementById(targetSectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        }
        // If the section isn't in the DOM yet, it's a partial-loaded page (e.g. shippinghistory):
        // its lifecycle mount injects the markup and applies the 'active' class after load.
    }
    
    // 更新選單狀態
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.target) {
        const menuItem = event.target.closest('.menu-item');
        if (menuItem) {
            menuItem.classList.add('active');
        }
    }
    
    // forecast: 已由 lifecycle mount 接管，手動 init 已移除 (Phase 2B-2)
    // request-order: 已由 lifecycle mount 接管，手動 init 已移除 (Phase 2B-1)
    // fc-summary: 已由 lifecycle mount 接管，手動 init 已移除 (Phase 2B-2)
    // factory-stock: 已由 lifecycle mount 接管，手動 init 已移除
    // skuDetails: 已由 lifecycle mount 接管，手動 init 已移除 (Phase 2B-2)
    //   (scroll height/width 由 scroll-sync.js / sku-details.js 的 MutationObserver 於 .active 時自動重算)
    // ops: 已由 lifecycle mount 接管，手動 init 已移除
    // supplychain: 已由 lifecycle mount 接管，手動 init 已移除 (Phase 2B-4)
    // sku-handbook: 已由 lifecycle mount 接管，手動 init 已移除 (Phase 2B-1)
    // shippinghistory: 已由 lifecycle mount 接管，手動 init 已移除 (Phase 2B-1)
    // campaign-risk: 已由 lifecycle mount 接管，手動 init 已移除 (Phase 2B-3)
}

// 清空運營管理表格
function clearOpsTable() {
    document.getElementById('opsTableBody').innerHTML = '';
}

// 渲染運營管理視圖
function renderOpsView() {
    const selectedSite = document.getElementById('siteSelect').value;
    const targetDays = parseFloat(document.getElementById('opsTargetDays').value) || 0;
    const tableBody = document.getElementById('opsTableBody');
    
    if (!selectedSite) {
        tableBody.innerHTML = '';
        return;
    }
    
    const siteData = window.DataRepo.getSiteSkus(selectedSite);
    tableBody.innerHTML = siteData.map(item => {
        const daysOfCover = Math.floor(item.stock / (item.weeklyAvgSales / 7));
        
        // 計算補貨數量
        const dailySales = item.weeklyAvgSales / 7;
        const targetSales = Math.ceil(dailySales * targetDays);
        const restockQty = Math.max(0, targetSales - item.stock);
        
        return `
            <tr>
                <td>${item.sku}</td>
                <td>${item.stock}</td>
                <td>${item.weeklyAvgSales}</td>
                <td>${daysOfCover}</td>
                <td>${restockQty}</td>
            </tr>
        `;
    }).join('');
}

// Forecast 查找和顯示函式
function showForecast() {
    const site = document.getElementById('forecastSiteSelect').value;
    const productType = document.getElementById('productTypeSelect').value;
    const selectedPeriod = document.getElementById('forecastPeriodSelect').value;
    const resultDiv = document.getElementById('forecastResult');
    
    if (!site || !productType) {
        resultDiv.innerHTML = '';
        return;
    }
    
    const forecastData = window.DataRepo.getForecastDataByMonth(site, productType, selectedPeriod);
    
    if (!forecastData) {
        resultDiv.innerHTML = '<p>找不到資料</p>';
        return;
    }
    
    resultDiv.innerHTML = `
        <h3>結果</h3>
        <p><strong>actualSales:</strong> ${forecastData.actualSales}</p>
        <p><strong>forecastSales:</strong> ${forecastData.forecastSales}</p>
    `;
}

// 渲染 Forecast 圖表
let forecastChartInstance = null;
function renderForecastChart() {
    const data = window.DataRepo.getForecastMonthly();
    const ctx = document.getElementById('forecastChart').getContext('2d');
    
    if (forecastChartInstance) {
        forecastChartInstance.destroy();
    }
    
    forecastChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.month),
            datasets: [
                {
                    label: 'Actual Sales',
                    data: data.map(item => item.actualSales),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                },
                {
                    label: 'Forecast Sales',
                    data: data.map(item => item.forecastSales),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Actual vs Forecast Sales (12 Months)'
                }
            },
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
}

// 渲染紀錄列表 - 使用本地資料
function renderRecords() {
    // #recordsList is an ORPHANED optional target (the records-list UI was removed; it exists in no page markup).
    // Guard it so this legacy startup helper no longer throws "Cannot set properties of null" — a narrow null
    // guard (not broad try/catch): a missing optional mount is a clean no-op, a missing required mount would still
    // surface elsewhere. Note: renderRecords runs at DOMContentLoaded startup, NOT in the navigation path, so it
    // does not touch the SPA shell/layout — the console error was cosmetic, not the source of the top gap.
    const recordsList = document.getElementById('recordsList');
    if (!recordsList) return;
    const records = window.DataRepo.getRecords();

    recordsList.innerHTML = records.map(record =>
        `<li>SKU: ${record.sku}, 目標天數: ${record.targetDays}, 建議補貨量: ${record.recommendQty}, 時間: ${record.created_at}</li>`
    ).join('');
}

// 計算補貨量函式 - 使用本地資料


// ========================================
// SKU Details - 已搬移至 pages/sku-details.js
// ========================================

// ========================================
// Inventory Replenishment (Stage 1)
// ========================================
// Inventory Replenishment (批次1: Mock Data+核心計算渲染) - 已搬移至 pages/inventory-replenishment.js
// ========================================
// Inventory Replenishment (批次2: 操作+Allocation) - 已搬移至 pages/inventory-replenishment.js
// ========================================

// ========================================
// Shipping Plan - 已搬移至 pages/shipping-plan.js
// ========================================

// ========================================
// 世界時間功能
// ========================================

function initWorldTimes() {
    updateWorldTimes();
    setInterval(updateWorldTimes, 1000);
}

function updateWorldTimes() {
    const timezones = [
        { id: 'AU', offset: 11, name: 'Australia' },
        { id: 'JP', offset: 9, name: 'Japan' },
        { id: 'DE', offset: 1, name: 'Germany' },
        { id: 'UK', offset: 0, name: 'UK' },
        { id: 'US-East', offset: -5, name: 'US East' },
        { id: 'US-Middle', offset: -6, name: 'US Central' },
        { id: 'US-West', offset: -8, name: 'US West' }
    ];
    
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    
    timezones.forEach(tz => {
        const localTime = new Date(utc + (3600000 * tz.offset));
        const card = document.getElementById(`card-${tz.id}`);
        
        if (card) {
            const dateStr = `${localTime.getMonth() + 1}/${localTime.getDate()}/${localTime.getFullYear().toString().slice(-2)}`;
            const timeStr = localTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            const offsetStr = `TP${tz.offset >= 0 ? '+' : ''}${tz.offset}`;
            
            card.querySelector('.local-date').textContent = dateStr;
            card.querySelector('.local-time').textContent = timeStr;
            card.querySelector('.timezone-offset').textContent = offsetStr;
        }
    });
}

window.initWorldTimes = initWorldTimes;
window.updateWorldTimes = updateWorldTimes;

// ========================================
// Replenishment Charts
// ========================================
// Replenishment Charts+Modals - 已搬移至 pages/inventory-replenishment.js
// ========================================

// ========================================
// Factory Stock - 已搬移至 pages/factory-stock.js (舊版殘留已移除)
// ========================================
// Initialize SKU FC Decision Section
if (typeof initFcSkuDecisionSection === 'function') {
    initFcSkuDecisionSection();
}


// 初始化時載入紀錄和世界時間
window.addEventListener('DOMContentLoaded', () => {
    // F1-7L: NO whole Operation DB startup prime. Startup no longer fetches/normalizes the entire Operation DB into
    // window._opDbCache. Each page/workspace loads its OWN bounded/scoped data on mount (canonical); the remaining
    // secondary surfaces (RO 2nd-layer expand, FC builder/import modals) + the IR allocation-draft hydrate load
    // their own bounded tables on demand (KM.DB.refreshCacheTables); Legacy kill-switch branches self-load the broad
    // DB on demand. _opDbCache is NO LONGER canonical startup state (see F1_7L doc §10). The legacy-localStorage
    // override warning is preserved here (it reads localStorage, never the Operation DB).
    try {
        var legacyData = JSON.parse(localStorage.getItem('km_sku_data_overrides_v1')) || {};
        if (Object.keys(legacyData).length > 0) {
            console.warn('[App] Legacy imported SKU records detected in localStorage (' + Object.keys(legacyData).length + ' records). Run debugLegacySkuOverrides() for details.');
        }
    } catch(e) {}
    // F1-7N-FA-3C-R6E1-R1 — apply the backend's EFFECTIVE feature flags through the ONE capability authority (the
    // getClientCapabilities read → the single apply path on the DB surface) so the frontend reads backend flag values
    // instead of three independently hardcoded booleans. app.js calls only the KM.DB legacy surface (never the API
    // Foundation directly). READ-ONLY, fire-and-forget; on any failure the documented fail-safe defaults apply (flat
    // V2 = true, site confirm = true, inventory generation = false). Never blocks startup.
    try {
        if (window.KM && window.KM.DB && typeof window.KM.DB.applyClientCapabilities === 'function') {
            window.KM.DB.applyClientCapabilities();
        }
    } catch (e) { console.error('[App] capability bootstrap failed:', e); }
    // 設定初始頁面生命週期（首頁）— MUST run before the other startup inits.
    // Home markup is partial-loaded (Phase 1): switchTo('home-section') triggers the Home mount,
    // which loads the partial and renders. Running it first ensures a failure in any later init
    // below cannot abort startup and leave the homepage blank (only the world time bar showing).
    if (window.KM && window.KM.lifecycle && window.KM.lifecycle.switchTo) {
        KM.lifecycle.switchTo('home-section');
    } else if (window.renderHomepage) {
        renderHomepage();
    }

    // Remaining startup inits — each guarded so one failure can't abort the rest (or Home).
    try { renderRecords(); } catch (e) { console.error('[App] renderRecords failed:', e); }
    try { initWorldTimes(); } catch (e) { console.error('[App] initWorldTimes failed:', e); }
    try { renderHomepage(); } catch (e) { console.error('[App] renderHomepage failed:', e); }
    try { initSkuUnifiedScroll(); } catch (e) { console.error('[App] initSkuUnifiedScroll failed:', e); }
});
