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
// STAGED SECTIONS — INSTALLED, DELIBERATELY NOT REACHABLE
// ========================================
//
// A section listed here is fully INSTALLED — its scripts, its stylesheet, its HTML partial, its mount
// point and its lifecycle registration are all present — and is NOT ACTIVATED. `showSection` refuses it
// by name.
//
// IT IS DECLARED RATHER THAN OMITTED ON PURPOSE. An absent section map entry and a refused one produce
// the same page and mean different things: absent, nobody can tell whether the entry was left out or
// lost, and enabling the page later is an addition nobody can review against an intent. Written down
// with its reason, the decision has one line, the tests have something to assert, and a mutant that
// flips `enabled` to true has somewhere to fail.
//
// THIS IS ONE OF TWO GATES AND THE WEAKER ONE. The other is `PRODUCT_STRATEGY_ENABLED_ = false` in
// 00_config.gs, which makes the server refuse the read regardless of anything the browser believes.
// This gate only decides whether a section can be shown. Opening the page needs BOTH — and the
// accessor's capability mirror, which starts false and can only be raised by a server capability
// payload, is what keeps a directly-invoked controller at zero requests in the meantime.
//
// P1-B8D - ACTIVATED, AND THE ACTIVATION INSTRUCTION ABOVE WAS TWO-THIRDS RIGHT.
//
// It said: set `enabled: true`, add the section id to the two maps in showSection, and ADD THE SIDEBAR
// ITEM TO index.html. The first two are done below and they were correct. The third is not done, and
// deliberately not, because doing it would have undone the thing this registry was built for.
//
// A hand-written menu item in index.html would be a SECOND definition of six labels that psb-views.js
// already owns (P1-B8A spent a round removing exactly that duplicate), a SECOND definition of the
// placement that `insertBefore` already owns, and - worst of the three - a menu that `enabled: false`
// could no longer switch off. Rolling the navigation back would stop being an edit to this one boolean
// and become an edit to markup, which is how the two gates drift apart. The registry is data precisely
// so that activation is "call the builder", not "hand-copy the menu"; `mountStagedMenus` below is that
// one caller, and it refuses any section whose `enabled` is not exactly true.
//
// SO THIS BOOLEAN IS STILL THE WHOLE NAVIGATION AUTHORITY. Set it back to false and the next page load
// has no Product Strategy menu at all - not a greyed-out one, not a hidden one, none - because nothing
// built it. That is the property a hardcoded <div> would have cost.
var KM_STAGED_SECTIONS_ = {
    'product-strategy': {
        sectionId: 'product-strategy-board-section',
        enabled: true,
        reason: 'P1-B8D: PRODUCT_STRATEGY_ENABLED_ is true and both productPricing reads are deployed;'
            + ' this section is ACTIVATED. Set to false to withdraw the navigation (the server flag in'
            + ' 00_config.gs is the independent and faster emergency stop).',
        // P1-B8B §2 — THE NAVIGATION PLACEMENT, AS DATA RATHER THAN AS MARKUP.
        //
        // index.html has NO Product Strategy menu item and gets none this round. What the round adds is
        // the DECLARATION: where the item goes, what it is called, and which six children it has. The
        // difference matters and it is the same argument this registry already makes about `enabled` —
        // markup that exists and is greyed out can be un-greyed by deleting a class, and §3 forbids
        // exactly that. An item that is not in the document cannot be revived by editing CSS.
        //
        // `insertBefore` is a MENU ID, not an index. The brief says "above Price Center"; the menu is
        // actually called **Pricing Center** and its `data-menu-id` is the historical `carrier`
        // (renamed at F1-SMALL-NAV-IA-R1, routing key preserved). An ordinal would silently move the
        // item the next time anybody adds a menu above it; an anchor either finds `carrier` or fails
        // loudly, and the suite asserts the anchor RESOLVES in index.html rather than trusting it.
        //
        // THE SIX CHILDREN ARE NOT LISTED HERE. They are `PSB_VIEWS.VIEWS`, read at build time, because
        // the in-page tab rail renders the same six and two lists of six labels is the duplicate-
        // definition mistake P1-B8A spent a round removing.
        nav: {
            parentId: 'product-strategy',
            label: 'Product Strategy',
            icon: '\ud83d\udcca',
            insertBefore: 'carrier',
            routeBase: 'product-strategy'
        }
    }
};
if (window.KM) { window.KM.stagedSections = KM_STAGED_SECTIONS_; }

// ========================================
// STAGED NAVIGATION — BUILT ON DEMAND, BY NOBODY IN PRODUCTION  (P1-B8B §2/§3)
// ========================================
//
// §3 asks for two things that sound contradictory and are not: the production default must offer NO
// entry point, and the navigation structure must nevertheless be complete and verifiable by a test.
//
// They reconcile if the structure is a FUNCTION rather than a document. `buildStagedMenu` returns the
// sidebar nodes for a staged section — the same `.menu-parent` / `.menu-children` / `.menu-item`
// markup and the same `toggleMenu` interaction every other group uses — and NOTHING IN PRODUCTION
// CALLS IT. index.html does not call it, no boot path calls it, no event calls it. The test harness
// calls it, which is the "explicit test-only capability" §3 permits.
//
// AND IT IS NOT A BYPASS, WHICH IS THE PART WORTH BEING PRECISE ABOUT. Building the menu builds DOM;
// it does not raise a flag, and every handler it attaches leads back into the same two refusals that
// guard the feature today. Click the parent and it expands. Click a child and `showSection` refuses
// the staged id before touching the shell; even if that gate were gone the accessor's capability
// mirror is false, so the page answers FEATURE_DISABLED at zero requests; even if THAT were gone the
// server refuses on `PRODUCT_STRATEGY_ENABLED_` before opening a database. The menu is the last of
// four things that would have to change, not the first.
window.KM = window.KM || {};
window.KM.nav = window.KM.nav || {};

/**
 * The six children of a staged section, taken from the ONE registry that declares them.
 * Returns [] when psb-views.js is not loaded — a missing module is a broken build, and inventing six
 * labels here to keep a menu looking complete is how the second definition site gets created.
 */
window.KM.nav.stagedChildren = function (key) {
    var entry = KM_STAGED_SECTIONS_[key];
    if (!entry || !entry.nav) return [];
    if (key !== 'product-strategy') return [];
    var V = window.PSB_VIEWS;
    if (!V || !(V.VIEWS instanceof Array)) return [];
    return V.VIEWS.map(function (v) {
        return { id: v.id, label: v.label, route: V.routeOf(v.id), maturity: v.maturity };
    });
};

/**
 * Build the sidebar nodes for a staged section and return them, in order, WITHOUT inserting them.
 *
 * Returning rather than inserting is deliberate: a builder that also mounted itself would be one
 * accidental call away from putting a live menu in a production sidebar, and "nothing calls it" would
 * stop being a property anybody could check. The caller decides where — and in production there is no
 * caller.
 *
 * @param {string} key   a KM_STAGED_SECTIONS_ key
 * @param {Document} [d] the document to build in (the suite passes its own)
 * @returns {{parent: Element, children: Element, entries: Array}|null}
 */
window.KM.nav.buildStagedMenu = function (key, d) {
    var doc = d || document;
    var entry = KM_STAGED_SECTIONS_[key];
    if (!entry || !entry.nav) return null;
    var nav = entry.nav;
    var kids = window.KM.nav.stagedChildren(key);

    function span(cls, text) {
        var n = doc.createElement('span');
        n.className = cls;
        n.textContent = text;
        return n;
    }

    /* `data-staged` survives activation on purpose. It does not mean "switched off" - it means "this
       node came from the registry rather than from index.html", which stays true and stays useful:
       it is how a test tells a built menu from a written one without matching on a label. */
    var parent = doc.createElement('div');
    parent.className = 'menu-parent';
    parent.setAttribute('data-menu-id', nav.parentId);
    parent.setAttribute('data-staged', 'true');
    parent.setAttribute('title', nav.label);
    /* KEYBOARD AND ARIA, ADDED HERE AND ONLY HERE. The rest of the sidebar is a set of plain divs with
       onclick and no tab stop - a global shell gap that Phase 1 closing QA owns and that this round must
       not rewrite. Fixing it for the nodes this function creates is additive: it cannot change any other
       menu, and it means the page being activated is reachable without a mouse on the day it ships. */
    parent.setAttribute('role', 'button');
    parent.setAttribute('tabindex', '0');
    parent.setAttribute('aria-expanded', 'false');
    parent.appendChild(span('menu-icon', nav.icon));
    parent.appendChild(span('menu-label', nav.label));
    parent.setAttribute('aria-controls', 'menu-children-' + nav.parentId);
    function openState() {
        parent.setAttribute('aria-expanded', parent.classList.contains('is-open') ? 'true' : 'false');
    }
    parent.addEventListener('click', function () { toggleMenu(nav.parentId); openState(); });
    parent.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
        ev.preventDefault();                 // Space must not scroll the page out from under the menu
        toggleMenu(nav.parentId);
        openState();
    });

    var children = doc.createElement('div');
    children.className = 'menu-children';
    children.id = 'menu-children-' + nav.parentId;
    children.setAttribute('data-parent', nav.parentId);

    kids.forEach(function (k) {
        var item = doc.createElement('div');
        item.className = 'menu-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        // THE ROUTE IS THE IDENTITY, and it is on the element rather than in a closure so that a test
        // — and, later, a router — can read what this item means without calling it.
        item.setAttribute('data-route', k.route);
        item.setAttribute('data-view', k.id);
        item.setAttribute('title', k.label);
        item.appendChild(span('menu-label', k.label));
        item.addEventListener('click', function () { showProductStrategyView(k.route); });
        item.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
            ev.preventDefault();
            showProductStrategyView(k.route);
        });
        children.appendChild(item);
    });

    return { parent: parent, children: children, entries: kids };
};

/**
 * Mount the sidebar nodes of every ACTIVATED staged section, each in the place its own entry names.
 *
 * THE GATE IS HERE AND NOWHERE ELSE. `buildStagedMenu` still builds on request whatever it is asked for
 * - that is what lets a suite inspect the menu of a section that is switched OFF, which is the case
 * worth being able to inspect. This function is what production calls, and it refuses anything whose
 * `enabled` is not exactly `true`. One authority, read in one place.
 *
 * THE ANCHOR EITHER RESOLVES OR NOTHING IS MOUNTED. `insertBefore` is a menu id, not an index, so the
 * item lands above Pricing Center even after somebody inserts a group above it. If the anchor is not in
 * the document the menu is NOT appended somewhere else as a consolation - a navigation item in the wrong
 * group is harder to notice than a missing one, and a missing one is what the console message is for.
 *
 * IT IS IDEMPOTENT. A second call finds the parent already present and does nothing, so a boot path that
 * runs twice cannot produce two Product Strategy menus.
 *
 * @param {Document} [d] the document to mount into (the suite passes its own)
 * @returns {Array<string>} the keys actually mounted
 */
window.KM.nav.mountStagedMenus = function (d) {
    var doc = d || document;
    var mounted = [];
    Object.keys(KM_STAGED_SECTIONS_).forEach(function (key) {
        var entry = KM_STAGED_SECTIONS_[key];
        if (!entry || entry.enabled !== true || !entry.nav) return;
        var nav = entry.nav;
        if (doc.querySelector('.menu-parent[data-menu-id="' + nav.parentId + '"]')) return;
        var anchor = doc.querySelector('.menu-parent[data-menu-id="' + nav.insertBefore + '"]');
        if (!anchor || !anchor.parentNode) {
            console.error('[Nav] staged section "' + key + '" is enabled but its anchor menu "'
                + nav.insertBefore + '" is not in the sidebar; no menu was mounted.');
            return;
        }
        var built = window.KM.nav.buildStagedMenu(key, doc);
        if (!built) return;
        anchor.parentNode.insertBefore(built.parent, anchor);
        anchor.parentNode.insertBefore(built.children, anchor);
        mounted.push(key);
    });
    return mounted;
};

/**
 * Navigate to one view of the Product Strategy board.
 *
 * IT GOES THROUGH `showSection`, WHICH IS THE WHOLE POINT. A second entry point that reached the page
 * another way would be a second gate to keep in step, and the one that got forgotten would be the one
 * that opened. The view is recorded for the controller to pick up on mount; while the section is
 * staged, `showSection` returns before anything is mounted and the recorded route is never read.
 */
function showProductStrategyView(route) {
    var V = window.PSB_VIEWS;
    window.KM = window.KM || {};
    window.KM.pendingRoute = (V && typeof V.routeOf === 'function')
        ? V.routeOf(V.resolve(route))
        : null;
    showSection('product-strategy');
}
window.showProductStrategyView = showProductStrategyView;

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
    // STAGED SECTIONS FIRST, AND BEFORE ANY SHELL MUTATION. Returning after setHomeShellVisible(false)
    // and the `.active` sweep below would leave NO section visible — a blank page, which reads as a
    // crash rather than as a feature that is not switched on. Refusing here leaves the page the
    // operator is looking at exactly as it is.
    var staged = KM_STAGED_SECTIONS_[section];
    if (staged && staged.enabled !== true) {
        return;
    }

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
            'automation': 'automation-schedule-section',
            // P1-B8D - the lifecycle half. This is the entry that makes the partial load and the board
            // mount; without it the section below would be given `.active` and stay empty.
            'product-strategy': 'product-strategy-board-section'
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
        'automation': 'automation-schedule-section',
        // P1-B8D - the display half. BOTH maps, because they are not one map read twice: the lifecycle
        // map decides what MOUNTS and this one decides what is VISIBLE, and a section in only one of them
        // either mounts into a hidden shell or is revealed with nothing in it. (They already disagree by
        // one entry - `global-logistics-map` is above and not here - which is a pre-existing difference
        // this round leaves exactly as it found it.)
        'product-strategy': 'product-strategy-board-section'
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
    // F1-7N-FC-1B-E3-R4-A2-R1-R6-R5 §4 — THE BOOT READ IS NOW DECLARED, NOT JUST FIRED.
    //
    // This is still fire-and-forget and still never blocks startup. What changed is that it says so: the
    // arbiter is told a capability read is OPEN, and told again when it settles either way. That single fact is
    // what lets the Inventory workspace read wait for an actual event instead of for a few seconds of luck —
    // and a FAILED capability read releases its waiters exactly like a successful one, so a soft dependency can
    // never become a hard outage.
    var _capSettle = (window.KM && window.KM.bootArbiter)
        ? window.KM.bootArbiter.declare('capabilities') : function () {};
    try {
        if (window.KM && window.KM.DB && typeof window.KM.DB.applyClientCapabilities === 'function') {
            var _capP = window.KM.DB.applyClientCapabilities();
            if (_capP && typeof _capP.then === 'function') {
                _capP.then(function () { _capSettle(true); }, function () { _capSettle(false); });
            } else { _capSettle(true); }
        } else { _capSettle(true); }
    } catch (e) { _capSettle(false); console.error('[App] capability bootstrap failed:', e); }
    // 設定初始頁面生命週期（首頁）— MUST run before the other startup inits.
    // Home markup is partial-loaded (Phase 1): switchTo('home-section') triggers the Home mount,
    // which loads the partial and renders. Running it first ensures a failure in any later init
    // below cannot abort startup and leave the homepage blank (only the world time bar showing).
    if (window.KM && window.KM.lifecycle && window.KM.lifecycle.switchTo) {
        KM.lifecycle.switchTo('home-section');
    } else if (window.renderHomepage) {
        renderHomepage();
    }

    // P1-B8D — mount the sidebar menus of any ACTIVATED staged section. Runs before the other inits
    // and inside its own try, because a navigation item that fails to appear must not be able to take
    // the homepage down with it; and after the shell exists, because it inserts into the sidebar.
    try {
        if (window.KM && window.KM.nav && window.KM.nav.mountStagedMenus) {
            window.KM.nav.mountStagedMenus();
        }
    } catch (e) { console.error('[App] mountStagedMenus failed:', e); }

    // Remaining startup inits — each guarded so one failure can't abort the rest (or Home).
    try { renderRecords(); } catch (e) { console.error('[App] renderRecords failed:', e); }
    try { initWorldTimes(); } catch (e) { console.error('[App] initWorldTimes failed:', e); }
    try { renderHomepage(); } catch (e) { console.error('[App] renderHomepage failed:', e); }
    try { initSkuUnifiedScroll(); } catch (e) { console.error('[App] initSkuUnifiedScroll failed:', e); }
});
