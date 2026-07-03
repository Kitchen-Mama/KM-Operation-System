// ============================================================
// KM Operation System — Sticky Header helper (core, reusable)
// ------------------------------------------------------------
// Measures the height of a page's sticky toolbar/control panel and writes it
// into the `--km-sticky-top-base` CSS variable so table headers pin exactly
// below it — no hard-coded `top: 72px` magic numbers, and it self-corrects when
// the toolbar WRAPS on small screens.
//
// Pairs with assets/css/core/km-sticky-header.css (variable definitions + the
// reusable .km-sticky-row-1/2/3 classes).
//
// Usage (typically in a page's lifecycle mount):
//     var h = KM.stickyHeader.bindToolbar(pageRootEl, toolbarEl);
//     // ...later, on unmount: h.destroy();
//
//   pageRootEl : element the `--km-sticky-top-base` variable is set on (its
//                descendants — the sticky table headers — inherit it). Falls
//                back to <html> when omitted.
//   toolbarEl  : the sticky control panel / filter bar whose height is the base.
//                Pass null for pages with no sticky toolbar (base = extraOffset).
//   opts.extraOffset : extra px added to the measured height (default 0).
//
// Re-measures on ResizeObserver (toolbar height change) + window resize (wrap).
// ============================================================

(function () {
    'use strict';
    window.KM = window.KM || {};

    function measure(entry) {
        var h = 0;
        if (entry.toolbar && entry.toolbar.getBoundingClientRect) {
            h = Math.ceil(entry.toolbar.getBoundingClientRect().height);
        }
        var total = h + (entry.extra || 0);
        var root = entry.root || document.documentElement;
        root.style.setProperty('--km-sticky-top-base', total + 'px');
    }

    /**
     * Bind a sticky toolbar so its height drives --km-sticky-top-base on pageRoot.
     * Returns { refresh(), destroy() }. Safe to call with a null toolbar.
     */
    function bindToolbar(pageRoot, toolbar, opts) {
        opts = opts || {};
        var entry = {
            root: pageRoot || document.documentElement,
            toolbar: toolbar || null,
            extra: opts.extraOffset || 0,
            ro: null,
            handler: null
        };

        measure(entry);

        // Re-measure after layout settles (fonts / async content can change height).
        try {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(function () { measure(entry); });
            }
        } catch (e) { /* no-op */ }

        if (window.ResizeObserver && entry.toolbar) {
            try {
                entry.ro = new ResizeObserver(function () { measure(entry); });
                entry.ro.observe(entry.toolbar);
            } catch (e) { entry.ro = null; }
        }

        entry.handler = function () { measure(entry); };
        window.addEventListener('resize', entry.handler);

        return {
            refresh: function () { measure(entry); },
            destroy: function () {
                if (entry.ro) { try { entry.ro.disconnect(); } catch (e) {} entry.ro = null; }
                if (entry.handler) { window.removeEventListener('resize', entry.handler); entry.handler = null; }
            }
        };
    }

    window.KM.stickyHeader = { bindToolbar: bindToolbar };

    if (window.console && console.log) console.log('[KM] stickyHeader helper ready');
})();
