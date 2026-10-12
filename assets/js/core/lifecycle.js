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
    // S8-B3-R3-CP2M — THE NAVIGATION *INTENT* TOKEN, AND WHY IT IS NOT _navEpoch.
    //
    // _navEpoch is bumped by switchTo, which is the COMMIT. A lazy route spends its whole download
    // before reaching switchTo, so during that window there was no token saying "a navigation has
    // begun" — app.js kept a private one (`_kmRouteNavSeq_`) and bumped it in exactly ONE branch.
    // Every PLAIN page, Home, and every direct switchTo call therefore left it untouched, so a route
    // whose code was still in flight still believed it owned the screen when it landed and called
    // switchTo on itself — pulling the operator back to the page they had already left.
    //
    // This counter is bumped at the START of every valid navigation, before any async work. It lives
    // here because switchTo is the one function every navigation reaches, which lets the DEFAULT be
    // safe: a switchTo called WITHOUT a token is a fresh intent and supersedes whatever is in flight.
    let _navIntent = 0;
    // S8-B3-R3-CP2M-R1 — THE INTENT THAT HAS ACTUALLY BEEN COMMITTED, which is what closes race C.
    //
    // A lazy route declares its intent and then spends its whole download before reaching switchTo. During
    // that gap `_navEpoch` and `_activeSectionId` still name the OLD page, so the old page's own async `.then`
    // passed commitGuard and painted over a navigation already under way. Comparing the declared intent with
    // the committed one is the question nobody was asking: "is a newer navigation already running?"
    let _committedIntent = 0;
    // Whether the OPERATOR has navigated. The boot's Home route is not a navigation and must never override a
    // choice already made — see switchToInitial.
    let _userNavStarted = false;

    /** Begin a navigation. Returns the token to carry through async work and hand back to switchTo. */
    KM.lifecycle.beginNavigation = function() { _userNavStarted = true; return ++_navIntent; };
    KM.lifecycle.currentNavigation = function() { return _navIntent; };
    KM.lifecycle.isCurrentNavigation = function(token) { return token === _navIntent; };
    /** True while a navigation has been declared but has not yet committed. */
    KM.lifecycle.navigationPending = function() { return _navIntent !== _committedIntent; };
    /**
     * Release a navigation that will never reach switchTo — showSection resolving to no section, for example.
     * Without this a dead intent would leave navigationPending() true for ever and freeze EVERY page out of
     * committing, turning a harmless mis-click into an application-wide stall.
     */
    KM.lifecycle.abandonNavigation = function(token) {
        if (token === _navIntent) { _committedIntent = _navIntent; return true; }
        return false;
    };
    /**
     * The BOOT's route. It takes the page only when the operator has not already chosen one, and it does not
     * count as a user navigation — so a later boot step can never revoke a route someone is waiting for, nor
     * drag them back to Home from the page they picked while the script chain was still arriving.
     */
    KM.lifecycle.switchToInitial = function(pageName) {
        if (_userNavStarted) return _navEpoch;
        var r = KM.lifecycle.switchTo(pageName);
        _userNavStarted = false;      // the boot took the initial route; the operator still has not navigated
        return r;
    };
    let _activeSectionId = null;       // the ONE section id permitted to be visible/active
    let _pendingNav = 0;               // navigations currently executing (transient; 0 between navigations)
    let _lastCommitted = null;         // { sectionId, epoch } of the most recent committed navigation
    let _lastDiscarded = null;         // { sectionId, epoch } of the most recent superseded nav a page bailed on
    let _lastError = null;             // last mount/unmount error message (no secrets)
    const _mounted = Object.create(null); // sectionId -> true while considered mounted

    // ---- S4-R2 §7 — LISTENER OWNERSHIP ------------------------------------------------------------
    // The contract §7 states is: mount owns the listener, unmount releases it, and a remount produces
    // ONE equivalent active set. Three pages were measured binding on elements that OUTLIVE the route
    // (a search input, a scroll column, document itself) without ever releasing them, so ten return
    // trips left ten live copies and one keystroke ran ten handlers.
    //
    // This is the lifecycle manager's job rather than each page's, because unmount is the only moment
    // that knows a route is over, and it already lives here. A page asks for its scope and binds
    // through it; switchTo releases the scope AFTER the page's own unmount hook, so a page that
    // already removes a listener by hand keeps working and the scope simply finds nothing left.
    //
    // NOT a general event bus, and deliberately not clever: it remembers (target, type, handler,
    // options) and calls removeEventListener with the same four. AbortController would be shorter,
    // but a handler removed by hand before release must not then be double-counted, and an explicit
    // ledger is what lets the regression suite COUNT what is live.
    const _scopes = Object.create(null);      // pageName -> [{ target, type, handler, options }]
    function _scopeList(pageName) {
        if (!_scopes[pageName]) _scopes[pageName] = [];
        return _scopes[pageName];
    }
    /**
     * A page's listener scope. Everything bound through it is released when the page unmounts.
     * @param {string} pageName - the section id the page registered under
     */
    KM.lifecycle.listenerScope = function(pageName) {
        const name = String(pageName || '');
        return {
            on: function(target, type, handler, options) {
                if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') return false;
                target.addEventListener(type, handler, options);
                _scopeList(name).push({ target: target, type: type, handler: handler, options: options });
                return true;
            },
            // Release early (a page that tears a panel down before unmount). Idempotent.
            release: function() { return KM.lifecycle.releaseListenerScope(name); },
            size: function() { return _scopeList(name).length; }
        };
    };
    /**
     * Remove every listener the named page bound through its scope. Safe to call twice.
     * @returns {number} how many registrations were released
     */
    KM.lifecycle.releaseListenerScope = function(pageName) {
        const name = String(pageName || '');
        const list = _scopes[name];
        if (!list || !list.length) return 0;
        let n = 0;
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            try { e.target.removeEventListener(e.type, e.handler, e.options); n++; } catch (err) {}
        }
        _scopes[name] = [];
        return n;
    };
    // Read-only, for the regression suite and the diagnostic.
    KM.lifecycle.listenerScopeSize = function(pageName) { return _scopeList(String(pageName || '')).length; };

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
    KM.lifecycle.switchTo = function(pageName, navToken) {
        // S8-B3-R3-CP2M — THE INTENT CHECK, BEFORE ANYTHING ELSE, AND SAFE BY DEFAULT.
        //
        // No token = a fresh navigation (a plain page, Home, a direct call). It REVOKES whatever is
        // still in flight, which is the behaviour every caller already assumed it had. This is why the
        // default is the safe one: a future entry point that forgets to declare a token still cancels
        // the pending route rather than silently racing it.
        //
        // A token = a navigation that began earlier and carried its claim through async work. If a
        // newer intent has since arrived, this one has LOST and must not commit — not the unmount, not
        // the mount, not the `.active` flag. Returning the current epoch leaves the screen exactly as
        // the newer navigation left it.
        if (navToken === undefined || navToken === null) {
            _navIntent++;
            _userNavStarted = true;
        } else if (navToken !== _navIntent) {
            _lastDiscarded = { sectionId: pageName, epoch: null };
            return _navEpoch;
        }

        // 如果切換到相同頁面，不執行任何操作 — re-click current page must not duplicate mount/DOM/listeners.
        // NOTE: the intent above is bumped BEFORE this returns, deliberately. Re-clicking the page you
        // are already on is still an instruction to be on it, so it must cancel a pending lazy route.
        if (currentPage === pageName) {
            // The navigation resolved to "stay here", which IS a commit of that intent. Leaving it pending
            // would freeze every page out of committing for the rest of the session.
            _committedIntent = _navIntent;
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
                // AFTER the page's own hook: an explicit removeEventListener there still wins, and
                // this only mops up what the page left bound through its scope.
                KM.lifecycle.releaseListenerScope(currentPage);
                console.log(`[Lifecycle] Unmounted: ${currentPage}`);
            } catch (error) {
                _lastError = 'unmount(' + currentPage + '): ' + String(error && error.message || error);
                // A hook that threw still loses its listeners — otherwise one broken teardown
                // reintroduces the drift this exists to prevent.
                try { KM.lifecycle.releaseListenerScope(currentPage); } catch (e2) {}
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
        _committedIntent = _navIntent;
        _lastCommitted = { sectionId: pageName, epoch: my };
        enforceSingleActiveSection();   // synchronous first pass (the observer + page guards handle late arrivals)
        _pendingNav = Math.max(0, _pendingNav - 1);
        return my;
    };

    // ---- F1-7N-FA-3C-R6C navigation guards (used by async page mounts) ------------------------------
    KM.lifecycle.currentEpoch = function() { return _navEpoch; };
    // S8-B3-R3-CP2M-R1: a DECLARED-but-uncommitted navigation makes every older epoch stale too. Without
    // this the gap between declaring a lazy route and reaching switchTo was a window in which the page being
    // replaced was still told it owned the screen.
    KM.lifecycle.isCurrent = function(epoch) { return epoch === _navEpoch && _navIntent === _committedIntent; };
    KM.lifecycle.activeSectionId = function() { return _activeSectionId; };
    /**
     * A page's async mount `.then` calls this before committing DOM/init: returns true ONLY if this navigation is still
     * the newest (and, when a sectionId is given, still the active target). A superseded navigation is recorded as the
     * last-discarded stale nav and returns false so the page bails (no stale render, no wasteful re-init).
     */
    KM.lifecycle.commitGuard = function(epoch, sectionId) {
        var ok = (epoch === _navEpoch) && (_navIntent === _committedIntent)
            && (!sectionId || sectionId === _activeSectionId);
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
            listenerScopes: (function () { var o = {}; for (var k in _scopes) if (_scopes[k].length) o[k] = _scopes[k].length; return o; }()),
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
