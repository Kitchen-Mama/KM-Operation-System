// ========================================
// Kitchen Mama - Page Lifecycle Manager
// 頁面生命週期管理
// ========================================

/**
 * 頁面生命週期管理系統
 * 負責頁面的掛載(mount)、卸載(unmount)，確保資源正確清理
 *
 * F1-7N-FA-3C-R6C — LATEST-NAVIGATION-WINS + SINGLE-VISIBLE-SECTION authority.
 * Every SPA navigation gets a monotonically increasing epoch. switchTo passes the epoch into mount(epoch)/unmount(epoch)
 * so an async page mount can DISCARD its late `.then` when a newer navigation has superseded it (KM.lifecycle.isCurrent /
 * commitGuard). enforceSingleActiveSection() is the page-agnostic invariant: at all times EXACTLY ONE .module-section may
 * carry `.active`; any late/superseded mount that re-adds `.active` to a stale section is reverted (directly, and via a
 * browser MutationObserver as belt-and-suspenders). This closes the "two pages visible at once" race (Order Planning
 * appearing above FC Summary) without per-page timers. Backward-compatible: pages that ignore the mount(epoch) arg keep
 * working; the invariant still protects them.
 */
(function() {
    const registry = {}; // 頁面註冊表
    let currentPage = null; // 當前活躍頁面

    // ---- F1-7N-FA-3C-R6C navigation-authority state -------------------------------------------------
    let _navEpoch = 0;                 // monotonic navigation token (latest wins)
    let _activeSectionId = null;       // the ONE section id permitted to be visible/active
    let _pendingNav = 0;               // navigations currently executing (transient; 0 between navigations)
    let _lastCommitted = null;         // { sectionId, epoch } of the most recent committed navigation
    let _lastDiscarded = null;         // { sectionId, epoch } of the most recent superseded nav a page bailed on
    let _lastError = null;             // last mount/unmount error message (no secrets)
    const _mounted = Object.create(null); // sectionId -> true while considered mounted

    /**
     * 註冊頁面生命週期
     * @param {string} pageName - 頁面名稱 (對應 section id)
     * @param {Object} hooks - 生命週期鉤子 { mount, unmount }
     */
    KM.lifecycle.register = function(pageName, hooks) {
        if (!pageName || typeof hooks !== 'object') {
            console.warn('[Lifecycle] Invalid registration:', pageName);
            return;
        }

        registry[pageName] = {
            mount: hooks.mount || function() {},
            unmount: hooks.unmount || function() {}
        };

        console.log(`[Lifecycle] Registered: ${pageName}`);
    };

    // F1-7N-FA-3C-R6C — enforce "exactly one .module-section is .active". Page-agnostic: reverts any late/superseded
    // `.active` re-add and guarantees the current target is the only active section. Idempotent + convergent (a removal
    // is itself a class mutation that re-invokes this via the observer, which then finds a consistent state and stops).
    function enforceSingleActiveSection() {
        if (typeof document === 'undefined' || !document.querySelectorAll) return;
        var secs = document.querySelectorAll('.module-section');
        for (var i = 0; i < secs.length; i++) {
            var el = secs[i]; if (!el.classList) continue;
            var shouldBeActive = !!(el.id && el.id === _activeSectionId);
            if (shouldBeActive && !el.classList.contains('active')) el.classList.add('active');
            else if (!shouldBeActive && el.classList.contains('active')) el.classList.remove('active');
        }
        // The Home shell is shown via `.hidden` (not `.active`); a non-Home target must not leave it visible.
        if (_activeSectionId && _activeSectionId !== 'home-section' && typeof window !== 'undefined' && typeof window.setHomeShellVisible === 'function') {
            try { window.setHomeShellVisible(false); } catch (e) {}
        }
        KM.lifecycle._activeSectionId = _activeSectionId;
    }
    KM.lifecycle.enforceSingleActiveSection = enforceSingleActiveSection;

    /**
     * 切換到指定頁面
     * @param {string} pageName - 目標頁面名稱
     * @returns {number} the navigation epoch assigned to this switch
     */
    KM.lifecycle.switchTo = function(pageName) {
        // 如果切換到相同頁面，不執行任何操作 — re-click current page must not duplicate mount/DOM/listeners.
        if (currentPage === pageName) {
            return _navEpoch;
        }

        var my = ++_navEpoch;          // latest-navigation-wins token
        _activeSectionId = pageName;   // set the single permitted-active section BEFORE mount so late callbacks can compare
        _pendingNav++;

        // 卸載當前頁面 (exactly once)
        if (currentPage && registry[currentPage]) {
            try {
                registry[currentPage].unmount(my);
                _mounted[currentPage] = false;
                console.log(`[Lifecycle] Unmounted: ${currentPage}`);
            } catch (error) {
                _lastError = 'unmount(' + currentPage + '): ' + String(error && error.message || error);
                console.error(`[Lifecycle] Unmount error (${currentPage}):`, error);
            }
        }

        // 掛載新頁面 (exactly once; pass the epoch so an async mount can discard a superseded .then)
        if (registry[pageName]) {
            try {
                registry[pageName].mount(my);
                _mounted[pageName] = true;
                console.log(`[Lifecycle] Mounted: ${pageName}`);
            } catch (error) {
                _lastError = 'mount(' + pageName + '): ' + String(error && error.message || error);
                console.error(`[Lifecycle] Mount error (${pageName}):`, error);
            }
        }

        currentPage = pageName;
        _lastCommitted = { sectionId: pageName, epoch: my };
        enforceSingleActiveSection();   // synchronous first pass (the observer + page guards handle late arrivals)
        _pendingNav = Math.max(0, _pendingNav - 1);
        return my;
    };

    // ---- F1-7N-FA-3C-R6C navigation guards (used by async page mounts) ------------------------------
    KM.lifecycle.currentEpoch = function() { return _navEpoch; };
    KM.lifecycle.isCurrent = function(epoch) { return epoch === _navEpoch; };
    KM.lifecycle.activeSectionId = function() { return _activeSectionId; };
    /**
     * A page's async mount `.then` calls this before committing DOM/init: returns true ONLY if this navigation is still
     * the newest (and, when a sectionId is given, still the active target). A superseded navigation is recorded as the
     * last-discarded stale nav and returns false so the page bails (no stale render, no wasteful re-init).
     */
    KM.lifecycle.commitGuard = function(epoch, sectionId) {
        var ok = (epoch === _navEpoch) && (!sectionId || sectionId === _activeSectionId);
        if (!ok) _lastDiscarded = { sectionId: sectionId || null, epoch: (epoch == null ? null : epoch) };
        return ok;
    };
    KM.lifecycle.noteError = function(msg) { _lastError = String(msg); };

    /**
     * 取得當前活躍頁面
     * @returns {string|null} 當前頁面名稱
     */
    KM.lifecycle.getCurrentPage = function() {
        return currentPage;
    };

    /**
     * 取消註冊頁面（用於動態頁面管理）
     * @param {string} pageName - 頁面名稱
     */
    KM.lifecycle.unregister = function(pageName) {
        if (registry[pageName]) {
            delete registry[pageName];
            console.log(`[Lifecycle] Unregistered: ${pageName}`);
        }
    };

    // ---- F1-7N-FA-3C-R6C — ONE safe, read-only global diagnostic (Objective I). No secrets. ---------
    KM.lifecycle.__debug = function() {
        var visible = [];
        if (typeof document !== 'undefined' && document.querySelectorAll) {
            var secs = document.querySelectorAll('.module-section.active');
            for (var i = 0; i < secs.length; i++) visible.push(secs[i].id || '(no-id)');
        }
        var provider = null;
        try { if (window.KM && window.KM.dbProvider) provider = { state: window.KM.dbProvider.state(), generation: window.KM.dbProvider.generation() }; } catch (e) {}
        var autosave = 0;
        try { if (typeof window !== 'undefined' && typeof window.__roDebug === 'function') { var rs = window.__roDebug(); autosave = (rs && rs.pendingAutosaveCount) || 0; } } catch (e2) {}
        return {
            release: (typeof window !== 'undefined' && window.KM && window.KM.RELEASE) || null,
            currentSection: currentPage,
            navEpoch: _navEpoch,
            pendingNav: _pendingNav,
            lastCommitted: _lastCommitted,
            lastDiscarded: _lastDiscarded,
            activeSectionId: _activeSectionId,
            activeVisibleSectionIds: visible,
            activeVisibleSectionCount: visible.length,
            dbProviderState: provider ? provider.state : null,
            dbProviderGeneration: provider ? provider.generation : null,
            mountedSections: Object.keys(_mounted).filter(function (k) { return _mounted[k]; }),
            pendingAutosaveCount: autosave,
            lastError: _lastError
        };
    };
    if (typeof window !== 'undefined') { window.__kmLifecycleDebug = KM.lifecycle.__debug; }

    // Browser-only belt-and-suspenders: revert any late/superseded `.active` re-add on a .module-section (covers pages
    // that do not adopt the epoch guard). Cheap: enforce runs only when a mutation target IS a .module-section.
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
        try {
            var _obs = new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    var t = muts[i].target;
                    if (t && t.classList && t.classList.contains('module-section')) { enforceSingleActiveSection(); return; }
                }
            });
            var _startObs = function () {
                var root = document.body || document.documentElement;
                if (root) { try { _obs.observe(root, { attributes: true, subtree: true, attributeFilter: ['class'] }); } catch (e) {} }
            };
            if (document.body) _startObs();
            else if (document.addEventListener) document.addEventListener('DOMContentLoaded', _startObs);
        } catch (e) { /* observer unavailable → the synchronous enforce in switchTo + page epoch guards still hold */ }
    }

    console.log('[KM] Lifecycle manager initialized');
})();
