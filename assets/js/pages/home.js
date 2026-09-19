// ========================================
// Home Page Logic
// 從 app.js 搬移，不改行為
// ========================================

function renderHomepage() {
    renderEvents();
    renderGoal();
    renderRow2();
}

function renderRow2() {
    renderAnnouncements();
    renderUrgentIssues();
    renderPersonalTodos();
}

function renderAnnouncements() {
    const announcements = window.DataRepo.getAnnouncements();
    const announcementsList = document.getElementById('announcementsList');
    announcementsList.innerHTML = announcements.map(item => `
        <div class="announcement-item">
            <div class="item-title">${item.title}</div>
            <div class="item-time">${item.time}</div>
        </div>
    `).join('');
}

function renderUrgentIssues() {
    const urgentIssues = window.DataRepo.getUrgentIssues();
    const urgentIssuesList = document.getElementById('urgentIssuesList');
    urgentIssuesList.innerHTML = urgentIssues.map(item => `
        <div class="urgent-item">
            <div class="item-title">${item.title}</div>
        </div>
    `).join('');
}

function renderPersonalTodos() {
    const todos = window.DataRepo.getPersonalTodos();
    const todoList = document.getElementById('todoList');
    todoList.innerHTML = todos.map(todo => `
        <div class="todo-item">${todo.text}</div>
    `).join('');
}

function addTodo() {
    const input = document.getElementById('todoInput');
    const todoText = input.value.trim();
    if (todoText) {
        window.DataRepo.addPersonalTodo(todoText);
        input.value = '';
        renderPersonalTodos();
    }
}

function handleTodoEnter(event) {
    if (event.key === 'Enter') {
        addTodo();
    }
}

function renderEvents() {
    const events = window.DataRepo.getEvents();
    const eventsList = document.getElementById('eventsList');
    eventsList.innerHTML = events.map(event => `
        <div class="event-card">
            <div class="event-row">
                <span class="event-label">\u6d3b\u52d5\u540d\u7a31</span>
                <span>${event.name}</span>
            </div>
            <div class="event-row">
                <span class="event-label">\u6d3b\u52d5\u671f\u9593</span>
                <span>${event.startDate}~${event.endDate}</span>
            </div>
            <div class="event-row">
                <span class="event-label">Content</span>
                <span>${event.content}</span>
            </div>
        </div>
    `).join('');
}

function renderGoal() {
    const goal = window.DataRepo.getGoalData();
    const achievementRate = Math.round((goal.salesAmount / goal.goalAmount) * 100);
    document.getElementById('goalYear').textContent = `${goal.year} Goal`;
    document.getElementById('achievementRate').textContent = `${achievementRate}%`;
    document.getElementById('goalAmount').textContent = `Goal: $${goal.goalAmount.toLocaleString()}`;
    document.getElementById('salesAmount').textContent = `Sales: $${goal.salesAmount.toLocaleString()}`;
    document.getElementById('progressFill').style.width = `${achievementRate}%`;
    document.getElementById('progressText').textContent = `${achievementRate}%`;
}

function showHome() {
    // F1-7N-FA-3C-R6C1 — LOGO HOME FIX. Route the Logo through the SINGLE SPA navigation authority (the exact path the
    // sidebar menu uses), NOT a direct .active toggle. Before R6C1 this bypassed KM.lifecycle.switchTo, so after R6C the
    // latest-navigation-wins single-visible-section enforcer (which assumes ALL navigation sets _activeSectionId via
    // switchTo) still had _activeSectionId on the PRIOR page → enforceSingleActiveSection re-activated that page and
    // re-hid the Home shell, so the Logo appeared dead. switchTo('home-section') now unmounts the current page, mounts
    // Home (its mount restores the shell + renders), sets _activeSectionId='home-section', and enforce keeps ONLY Home
    // visible. No location.reload, no hard navigation, no second router; re-click while already Home early-returns in
    // switchTo (no duplicate mount/listeners); latest-navigation-wins + activeVisibleSectionCount=1 stay true.
    if (window.KM && window.KM.lifecycle && typeof window.KM.lifecycle.switchTo === 'function') {
        window.KM.lifecycle.switchTo('home-section');
    } else {
        // Fallback only when the lifecycle authority is unavailable (never the primary path) — legacy direct show.
        _ensureHomeMarkup().then(function() {
            if (window.setHomeShellVisible) window.setHomeShellVisible(true);
            document.querySelectorAll('.module-section').forEach(sec => sec.classList.remove('active'));
            renderHomepage();
        });
    }
    // Home has no sidebar menu item → clear any highlighted menu item (mirrors the pre-R6C1 behavior; idempotent).
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
}

// Ensure the Home section markup is present in the DOM before Home logic runs.
// Idempotent: if #home-section already exists, resolves immediately (no re-fetch, no duplicate).
// Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureHomeMarkup() {
    if (document.getElementById('home-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('home', 'assets/html/pages/home.html', '#home-mount')
            .then(function() {
                if (!document.getElementById('home-section')) {
                    console.warn('[Home] partial loaded but #home-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[Home] failed to load home partial:', err);
                return false;
            });
    }
    console.warn('[Home] KM.partialLoader unavailable; Home markup not loaded.');
    return Promise.resolve(false);
}

// 暴露到全域
window.renderHomepage = renderHomepage;
window.showHome = showHome;
window.addTodo = addTodo;
window.handleTodoEnter = handleTodoEnter;



// ========================================
// Demo Data Layer: Home Page
// ========================================

function _renderEmptyHomepage() {
    var msg = '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px;">\u5c1a\u672a\u9023\u63a5\u8cc7\u6599\u4f86\u6e90</div>';
    var el = document.getElementById('eventsList'); if (el) el.innerHTML = msg;
    var el2 = document.getElementById('announcementsList'); if (el2) el2.innerHTML = msg;
    var el3 = document.getElementById('urgentIssuesList'); if (el3) el3.innerHTML = msg;
    var el4 = document.getElementById('todoList'); if (el4) el4.innerHTML = msg;
    var el5 = document.getElementById('goalYear'); if (el5) el5.textContent = '-- Goal';
    var el6 = document.getElementById('achievementRate'); if (el6) el6.textContent = '--%';
    var el7 = document.getElementById('goalAmount'); if (el7) el7.textContent = 'Goal: --';
    var el8 = document.getElementById('salesAmount'); if (el8) el8.textContent = 'Sales: --';
    var el9 = document.getElementById('progressFill'); if (el9) el9.style.width = '0%';
    var el10 = document.getElementById('progressText'); if (el10) el10.textContent = '0%';
}

function _isDemoEnabled() {
    return window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
}

function _renderDemoHomepage() {
    var d = window.KM.DemoData;
    // Events
    var eventsList = document.getElementById('eventsList');
    if (eventsList) {
        eventsList.innerHTML = d.getHomeEvents().map(function(event) {
            return '<div class="event-card"><div class="event-row"><span class="event-label">\u6d3b\u52d5\u540d\u7a31</span><span>' + event.name + '</span></div><div class="event-row"><span class="event-label">\u6d3b\u52d5\u671f\u9593</span><span>' + event.startDate + '~' + event.endDate + '</span></div><div class="event-row"><span class="event-label">Content</span><span>' + event.content + '</span></div></div>';
        }).join('');
    }
    // Goal
    var goal = d.getHomeGoal();
    var achievementRate = Math.round((goal.salesAmount / goal.goalAmount) * 100);
    var el = document.getElementById('goalYear'); if (el) el.textContent = goal.year + ' Goal';
    el = document.getElementById('achievementRate'); if (el) el.textContent = achievementRate + '%';
    el = document.getElementById('goalAmount'); if (el) el.textContent = 'Goal: $' + goal.goalAmount.toLocaleString();
    el = document.getElementById('salesAmount'); if (el) el.textContent = 'Sales: $' + goal.salesAmount.toLocaleString();
    el = document.getElementById('progressFill'); if (el) el.style.width = achievementRate + '%';
    el = document.getElementById('progressText'); if (el) el.textContent = achievementRate + '%';
    // Announcements
    var announcementsList = document.getElementById('announcementsList');
    if (announcementsList) {
        announcementsList.innerHTML = d.getHomeAnnouncements().map(function(item) {
            return '<div class="announcement-item"><div class="item-title">' + item.title + '</div><div class="item-time">' + item.time + '</div></div>';
        }).join('');
    }
    // Urgent Issues
    var urgentList = document.getElementById('urgentIssuesList');
    if (urgentList) {
        urgentList.innerHTML = d.getHomeUrgentIssues().map(function(item) {
            return '<div class="urgent-item"><div class="item-title">' + item.title + '</div></div>';
        }).join('');
    }
    // Todos
    var todoList = document.getElementById('todoList');
    if (todoList) {
        todoList.innerHTML = d.getHomeTodos().map(function(todo) {
            return '<div class="todo-item">' + todo.text + '</div>';
        }).join('');
    }
}

// Patch renderHomepage
var _origRenderHomepage = renderHomepage;
renderHomepage = function() {
    if (_isDemoEnabled()) {
        _renderDemoHomepage();
    } else {
        _renderEmptyHomepage();
    }
    // Show/hide demo badge
    var section = document.getElementById('home-section');
    if (!section) return;
    var badge = section.querySelector('.demo-badge');
    if (_isDemoEnabled()) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'demo-badge';
            badge.style.cssText = 'background:#8b5cf6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:12px;vertical-align:middle;';
            badge.textContent = 'Demo Data Mode';
            var h1 = section.querySelector('h1');
            if (h1) h1.appendChild(badge);
        }
    } else {
        if (badge) badge.remove();
    }
};
window.renderHomepage = renderHomepage;

// ========================================
// INCIDENT-BOOT-FC-R2 §3 — THE WORLD CLOCK, AND WHY IT LIVES HERE
// ========================================
//
// Moved verbatim from app.js. The arithmetic is unchanged; what changed is WHO starts it and WHEN.
// Previously app.js started it from DOMContentLoaded, which waits for every render-blocking script —
// 38.2 s cold, measured. The clock needs none of that: the world-time bar is static markup in
// index.html, already parsed before any script runs, and the computation is seven offsets and a Date.
//
// Ownership is the Home mount, so there is exactly one interval per mount and unmount disposes of it.
// The guard is the TIMER HANDLE, not a boolean: a handle cannot claim an interval exists when it does
// not, and it is the thing clearInterval needs anyway.
var _homeClockTimer = null;

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

            // Each card is null-guarded above; the three cells are guarded individually because a
            // half-built card used to throw here, and the throw happened INSIDE initWorldTimes before
            // setInterval was reached — so one malformed card stopped the clock permanently.
            var d = card.querySelector('.local-date'); if (d) d.textContent = dateStr;
            var t = card.querySelector('.local-time'); if (t) t.textContent = timeStr;
            var o = card.querySelector('.timezone-offset'); if (o) o.textContent = offsetStr;
        }
    });
}

/* Start the clock. Idempotent: a second call while one is running is a no-op, so a remount, a stale
   caller and app.js's old boot path cannot between them produce two intervals ticking the same cards. */
function initWorldTimes() {
    updateWorldTimes();                      // paint immediately — never show `--/--` for a whole second
    if (_homeClockTimer !== null) return;
    _homeClockTimer = setInterval(updateWorldTimes, 1000);
}
/* Stop it. Called on unmount so a route change cannot leave the interval running. */
function stopWorldTimes() {
    if (_homeClockTimer === null) return;
    clearInterval(_homeClockTimer);
    _homeClockTimer = null;
}
window.initWorldTimes = initWorldTimes;
window.updateWorldTimes = updateWorldTimes;
window.stopWorldTimes = stopWorldTimes;

// ========================================
// Lifecycle 註冊
// ========================================
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('home-section', {
        mount() {
            console.log('[Home] mount');
            // PHASE 1 — THE LOCAL UI FIRST, SYNCHRONOUSLY.
            // The world-time bar is static markup in index.html, so it is already in the DOM here. The
            // clock therefore starts BEFORE the partial fetch below and without waiting for it, for the
            // capability read, for Chart.js, for ExcelJS or for any route module. Nothing local should
            // ever be queued behind something remote.
            initWorldTimes();
            // Ensure partial markup is injected before rendering (Phase 1). renderHomepage is
            // itself null-guarded, so the worst case (load failure) is an empty home, not a crash.
            _ensureHomeMarkup().then(function() {
                if (window.setHomeShellVisible) window.setHomeShellVisible(true);   // canonical Home entry restores the shell
                renderHomepage();
            });
        },
        unmount() {
            console.log('[Home] unmount');
            stopWorldTimes();   // an unmounted route must not keep a timer alive
        }
    });

    // PHASE 0 -> PHASE 1 HANDOFF. Take the initial Home route NOW, while the remaining 5.2 MB is still
    // arriving, instead of waiting for app.js's DOMContentLoaded handler at the end of the chain.
    //
    // This does NOT create a second router: it calls the one lifecycle authority, and app.js's boot still
    // calls switchTo('home-section') exactly as before. That later call early-returns on `currentPage ===
    // pageName`, so Home mounts once, there is one clock interval, and the boot sequence is unchanged for
    // every other page. It is guarded because a deep link may name another section, and hijacking that
    // would be a worse bug than a slow clock.
    if (!location.hash || location.hash === '#' || location.hash === '#home-section') {
        try { KM.lifecycle.switchTo('home-section'); }
        catch (e) { console.error('[Home] early mount failed; app.js boot will retry:', e); }
    }
}
