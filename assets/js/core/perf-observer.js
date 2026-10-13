// ========================================
// Kitchen Mama - Bounded Navigation Performance Observer  (S8-B3-R3-CP2M-R2)
// ========================================
//
// WHAT THIS ANSWERS, AND WHY THE OLD ANSWER WAS NOT GOOD ENOUGH
//
//   S4-R1 measured route navigations from OUTSIDE the page and recorded one number per route. Its own
//   report says the decomposition was impossible from there -- "SHELL vs PARTIAL vs JS vs RENDER cannot
//   be separated from outside the process" -- and that the single-entry deltas it did produce (-82 to
//   +154 ms) sat INSIDE the baseline run's own 840 ms spread, two of them negative. A number whose
//   error bar is wider than the effect cannot find a bottleneck.
//
//   That limit was the INSTRUMENT'S, not the question's. From inside the process every boundary is
//   observable, and two of them are observable without touching anything at all.
//
// THE THREE SOURCES, IN ORDER OF HOW MUCH THEY INTERFERE
//
//   1. NOTHING AT ALL -- PerformanceObserver on 'resource'. The browser already records when every
//      script, partial and API request started and when its last byte arrived. This is where the
//      DOWNLOAD half of every phase comes from. It is the browser's own ledger; reading it cannot
//      perturb what it describes.
//
//   2. PASS-THROUGH WRAPPERS ON KM'S OWN SEAMS -- partialLoader.loadPartial, scriptLoader.ensure/load,
//      lifecycle.beginNavigation/switchTo. Each wrapper takes a timestamp, calls the original with
//      `apply(this, arguments)` and returns what it returned. No argument is rewritten, no promise is
//      replaced, nothing is ordered, delayed, retried or cached differently. Combined with (1) this is
//      what separates DOWNLOAD from EXECUTE: scriptLoader resolves on the script element's `onload`,
//      which fires after the script has RUN, and Resource Timing says when its last byte LANDED. The
//      difference between those two instants is execution, and it is a measurement rather than a guess.
//
//   3. A MutationObserver + a double requestAnimationFrame -- for the only question that matters.
//
// "REQUEST FINISHED" IS NOT "SCREEN SHOWN", AND THIS FILE REFUSES TO CONFLATE THEM
//
//   Every phase above ends when some promise resolves. A promise resolving means the data is in a
//   variable. The operator is not looking at a variable. So the terminal metric here is taken after
//   TWO animation frames: a rAF callback runs BEFORE the paint it belongs to, so a second rAF scheduled
//   from inside the first cannot run until the first frame has actually been painted.
//
//   And it is taken TWICE, because the difference between the two is the whole point:
//
//     t_shell_visible -- the first frame on which the route's section is on screen with ANY content.
//                        A spinner satisfies this. Adding a loading state improves THIS number and
//                        nothing else.
//     t_data_visible  -- the first frame on which the section holds real content and NO loading
//                        indicator is visible. This is the number an operator experiences as "the
//                        page is up", and it is the one a spinner cannot move.
//
//   Reporting only the first is how "we added a skeleton" gets written up as "we fixed the latency".
//   Both are recorded on every sample, separately, and the suite asserts both exist.
//
// WHAT IT IS NOT ALLOWED TO DO (the approved bounds, enforced here rather than promised in a report)
//
//   - NO business request is added. This file issues no fetch, no XHR, no script and no image.
//   - NO upload, NO persistence. Samples live in ONE in-memory array, capped, and are lost on reload.
//     There is no localStorage write, no sessionStorage write, no network sink, and no global sink
//     other than KM.perf itself.
//   - NO full rows, NO personal data, NO credentials and NO sensitive URLs. Resource URLs are reduced
//     to a basename with the query string REMOVED before being stored (see `tag`), so a cache token or
//     a signed URL cannot reach a sample. Nothing reads a cell, a field value or a response body.
//   - NO change to the Loader, IR 13+6, the Boot Read Arbiter, the transport, timeouts, caching or
//     hydration. The wrappers call through; `disable()` restores the exact original function objects.
//   - DEFAULT OFF, and off harder than that: index.html does NOT load this file. A release candidate
//     therefore carries zero bytes of it, registers zero listeners and has nothing to switch off. The
//     Sandbox harness injects it deliberately. `enabled` is additionally false until enable() is called,
//     so merely loading it does nothing either. A regression test asserts index.html never names it.
//
// PUBLIC API (window.KM.perf)
//   enable(opts)        install the observers and wrappers; returns true if newly installed
//   disable()           restore every wrapped function and disconnect every observer; returns a report
//   isEnabled()
//   samples()           a copy of the recorded samples
//   clear()
//   summary()           per-route medians, sample counts, cold/warm split
//   installedCount()    how many wrappers + listeners are currently live (for the no-duplicate test)
// ========================================

(function () {
    'use strict';

    window.KM = window.KM || {};
    if (window.KM.perf && window.KM.perf.__cp2mR2) return;   // idempotent: a second load must not double-install

    var CAP = 400;                 // hard ceiling on retained samples; the oldest is dropped
    var QUIET_MS = 450;            // no mutation for this long => the section has settled
    var enabled = false;
    var samples = [];
    var current = null;            // the navigation sample being filled, or null
    var resObs = null;             // PerformanceObserver('resource')
    var mutObs = null;             // MutationObserver on the active section
    var resources = [];            // reduced resource records for the open sample
    var originals = null;          // { ownerPath -> fn } captured at enable()
    var listeners = [];            // [{ target, type, handler, options }]
    var readySelectors = Object.create(null);  // sectionId -> selector proving DATA (not shell) is drawn
    var quietTimer = null;
    var pendingClick = null;       // performance.now() of the most recent capture-phase click
    var pendingClickAt = 0;        // Date.now() of it, used only to expire a stale one

    function now() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    /**
     * A resource URL reduced to something safe to retain: the basename, with the query string removed.
     * A cache token, a signed URL or an id in a query string must never reach a sample, and the only
     * reliable way to guarantee that is to never store the query at all.
     */
    function tag(url) {
        var s = String(url || '');
        var q = s.indexOf('?');
        if (q >= 0) s = s.slice(0, q);
        var slash = s.lastIndexOf('/');
        if (slash >= 0) s = s.slice(slash + 1);
        return s.slice(0, 60);
    }

    /** Is this element visibly a loading affordance? Matched by class/role, never by text content. */
    function isLoadingEl(el) {
        var c = ' ' + String(el.className || '') + ' ';
        if (/\b(skeleton|spinner|loading|is-loading|km-loading|placeholder-shimmer)\b/i.test(c)) return true;
        if (el.getAttribute && el.getAttribute('aria-busy') === 'true') return true;
        return false;
    }

    function visibleBox(el) {
        if (!el || !el.getBoundingClientRect) return false;
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    /** ANY content at all is on screen inside this section -- a spinner counts. */
    function hasShell(sec) {
        if (!sec || !visibleBox(sec)) return false;
        var kids = sec.querySelectorAll('*');
        for (var i = 0; i < kids.length; i++) { if (visibleBox(kids[i])) return true; }
        return false;
    }

    /**
     * REAL content is on screen and nothing is still declaring itself busy.
     * The harness names the proving selector per route; without one, "no visible loading affordance and
     * some visible element that is not one" is the fallback, which is weaker and is recorded as such.
     */
    function hasData(sec, sectionId) {
        if (!sec || !visibleBox(sec)) return { ok: false, basis: null };
        var sel = readySelectors[sectionId];
        var loaders = sec.querySelectorAll('[aria-busy="true"],[class*="skeleton"],[class*="spinner"],[class*="loading"]');
        for (var j = 0; j < loaders.length; j++) { if (visibleBox(loaders[j])) return { ok: false, basis: null }; }
        if (sel) {
            var hit = sec.querySelectorAll(sel);
            for (var k = 0; k < hit.length; k++) { if (visibleBox(hit[k])) return { ok: true, basis: 'selector' }; }
            return { ok: false, basis: null };
        }
        var kids = sec.querySelectorAll('*');
        for (var i = 0; i < kids.length; i++) {
            if (visibleBox(kids[i]) && !isLoadingEl(kids[i])) return { ok: true, basis: 'heuristic' };
        }
        return { ok: false, basis: null };
    }

    /**
     * Run fn after the next frame has been PAINTED.
     * One rAF is not enough: its callback runs before the paint of the frame it was scheduled for, so a
     * timestamp taken there describes a screen that has not been drawn yet. The second rAF cannot run
     * until that frame is done, which is the cheapest honest "it is on screen now" the platform offers.
     */
    function afterPaint(fn) {
        if (typeof requestAnimationFrame !== 'function') { fn(); return; }
        requestAnimationFrame(function () { requestAnimationFrame(function () { fn(); }); });
    }

    // ---- sample lifecycle --------------------------------------------------------------------------

    function openSample(label, cold) {
        closeSample('superseded');
        resources = [];
        current = {
            label: label || null,
            cold: !!cold,
            t_click: null, t_nav: now(),
            t_shell_start: null, t_shell_end: null,
            t_js_start: null, t_js_end: null,
            t_switch_start: null, t_switch_end: null,
            t_shell_visible: null, t_data_visible: null, t_settled: null,
            dataBasis: null,
            /* A NULL RENDER TIME MUST SAY WHY IT IS NULL. Without these, "never became visible" and
               "was never watched" are the same answer, and they call for opposite fixes. */
            watched: false, sectionFound: null, probes: 0, lastShellCheck: null,
            scripts: [], api: [], partials: [],
            closed: null
        };
        /* THE CLICK BELONGS TO THIS NAVIGATION ONLY IF IT IS RECENT. A capture-phase click that is more
           than a second old is some other interaction -- a filter, a sort, a stray press -- and
           attributing it here would silently inflate every number by the operator's thinking time. An
           unclaimed sample falls back to t_nav and says so by leaving t_click null. */
        if (pendingClick !== null && (Date.now() - pendingClickAt) < 1000) {
            current.t_click = pendingClick;
            pendingClick = null;
        }
        return current;
    }

    function closeSample(reason) {
        if (!current) return;
        if (quietTimer) { clearTimeout(quietTimer); quietTimer = null; }
        if (mutObs) { try { mutObs.disconnect(); } catch (e) {} }
        current.closed = reason || 'done';
        /* ONLY THE RESOURCES THIS NAVIGATION CAUSED.
           PerformanceObserver({ buffered: true }) delivers every entry recorded BEFORE it was installed, and
           it delivers them asynchronously -- so the boot's ~99 entries arrived after the first navigation had
           already opened its sample and filled the retained slice with base.css and friends. The route's own
           scripts fell off the end of the cap, and the JS download/execute split came back empty for every
           cold route. Filtering by the sample's own start instant is what makes the retained set describe
           this navigation instead of the page load. */
        var from = (current.t_click !== null ? current.t_click : current.t_nav) - 5;
        current.resources = resources.filter(function (r) { return r.startAt >= from; }).slice(0, 80);
        current.resourcesSeenTotal = resources.length;
        samples.push(current);
        while (samples.length > CAP) samples.shift();
        current = null;
        resources = [];
    }

    /** Watch the target section until it shows a shell, then until it shows data, then until it is quiet. */
    function watchRender(sectionId) {
        if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return;
        var sec = document.getElementById(sectionId);
        if (current) { current.watched = true; current.sectionFound = !!sec; }

        /* THE SECTION MAY NOT EXIST YET, AND THAT IS NORMAL. A partial-loaded page's markup is injected
           by its own mount, which for several routes has not run by the time switchTo returns. Giving up
           here recorded Carrier Rate Card as "never rendered" when what actually happened is that the
           observer looked one tick too early -- the page rendered perfectly. So the lookup is retried on
           frames for a bounded window, and the watch begins the moment the element appears. */
        if (!sec) {
            var waited = 0;
            var smp = current;
            (function awaitSection() {
                if (!current || current !== smp || waited++ > 180) return;
                if (document.getElementById(sectionId)) { current.sectionFound = true; watchRender(sectionId); return; }
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(awaitSection);
            }());
            return;
        }
        if (mutObs) { try { mutObs.disconnect(); } catch (e) {} }

        function probe() {
            if (!current) return;
            var s = document.getElementById(sectionId);
            if (!s) return;
            current.probes++;
            current.lastShellCheck = hasShell(s);
            if (current.t_shell_visible === null && hasShell(s)) {
                var at = now();
                afterPaint(function () { if (current && current.t_shell_visible === null) current.t_shell_visible = at; });
            }
            if (current.t_data_visible === null) {
                var d = hasData(s, sectionId);
                if (d.ok) {
                    var at2 = now();
                    afterPaint(function () {
                        if (current && current.t_data_visible === null) {
                            current.t_data_visible = at2;
                            current.dataBasis = d.basis;
                        }
                    });
                }
            }
            if (quietTimer) clearTimeout(quietTimer);
            quietTimer = setTimeout(function () {
                var at3 = now();
                afterPaint(function () {
                    if (current) { current.t_settled = at3; closeSample('settled'); }
                });
            }, QUIET_MS);
        }

        mutObs = new MutationObserver(probe);
        try {
            mutObs.observe(sec, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-busy'] });
        } catch (e) { return; }

        /* A MUTATION OBSERVER ALONE MISSES TWO REAL CASES, both measured rather than imagined.
           A plain section already present in index.html is revealed by adding `.active` TO ITSELF, which
           mutates the observed node's own attribute but produces nothing in its subtree, and a WARM
           revisit may re-show markup that is already there and never mutate at all. Both render perfectly
           and both would have been recorded as "never became visible". So the probe also runs on its own
           frames for a bounded window; it is idempotent, and whichever route reaches a condition first
           wins. The window is bounded, so an idle page costs nothing once it closes. */
        var frames = 0;
        (function poll() {
            if (!current || frames++ > 180) return;      // ~3s at 60fps, then it stops for good
            probe();
            if (current && current.t_data_visible !== null) return;
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(poll);
        }());

        probe();   // the section may already be populated (a warm revisit renders synchronously)
    }

    // ---- wrappers ----------------------------------------------------------------------------------

    function wrap(owner, name, make) {
        if (!owner || typeof owner[name] !== 'function') return null;
        var orig = owner[name];
        owner[name] = make(orig);
        owner[name].__kmPerfWrapped = true;
        return { owner: owner, name: name, orig: orig };
    }

    function install() {
        var w = [];

        // THE NAVIGATION BEGINS. beginNavigation is the one function every valid navigation reaches
        // before any async work (CP2M made that true), so it is where a sample opens.
        w.push(wrap(window.KM.lifecycle, 'beginNavigation', function (orig) {
            return function () {
                var token = orig.apply(this, arguments);
                openSample(null, true);
                if (current) current.navToken = token;
                return token;
            };
        }));

        // THE SHELL. loadPartial's promise resolves when the markup has been injected -- that is the
        // PARTIAL phase end; Resource Timing supplies when its bytes arrived.
        w.push(wrap(window.KM.partialLoader, 'loadPartial', function (orig) {
            return function (pageKey, url) {
                var t0 = now();
                if (current && current.t_shell_start === null) current.t_shell_start = t0;
                var p = orig.apply(this, arguments);
                var c = current;
                try {
                    p.then(function (r) {
                        if (c) { c.t_shell_end = now(); c.partials.push({ key: String(pageKey || ''), ms: +(now() - t0).toFixed(1) }); }
                        return r;
                    });
                } catch (e) {}
                return p;
            };
        }));

        /* ONE SCRIPT, WHEN SOMETHING CALLS THE EXPORT.
           NOTE, MEASURED RATHER THAN ASSUMED: scriptLoader.ensure() calls its module-local `load`, not
           `window.KM.scriptLoader.load`, so wrapping the export does NOT intercept a route set -- the first
           matrix run recorded zero per-script timings for every route for exactly this reason. The wrapper is
           kept because a direct KM.scriptLoader.load() call still goes through it, and the route-set split is
           taken from Resource Timing instead (which is the browser's own record and needs no seam at all).
           Reaching into the module to wrap the internal function would be a change to the Loader, which this
           observation is not permitted to make -- and would not be worth it for a number already available. */
        w.push(wrap(window.KM.scriptLoader, 'load', function (orig) {
            return function (url) {
                var t0 = now();
                var p = orig.apply(this, arguments);
                var c = current;
                try {
                    p.then(function (ok) {
                        if (!c) return ok;
                        var t1 = now();
                        var dl = null;
                        try {
                            var e = performance.getEntriesByName(new URL(url, location.href).href);
                            if (e && e.length) dl = e[e.length - 1].responseEnd;
                        } catch (err) {}
                        c.scripts.push({
                            file: tag(url), ok: ok === true,
                            totalMs: +(t1 - t0).toFixed(1),
                            downloadEndedAt: dl === null ? null : +dl.toFixed(1),
                            execMs: (dl === null || dl < t0) ? null : +(t1 - dl).toFixed(1)
                        });
                        return ok;
                    });
                } catch (e2) {}
                return p;
            };
        }));

        // THE WHOLE ROUTE SET.
        w.push(wrap(window.KM.scriptLoader, 'ensure', function (orig) {
            return function (key) {
                var alreadyLoaded = false;
                try { alreadyLoaded = this.isLoaded(key) === true; } catch (e) {}
                if (current) {
                    current.label = current.label || String(key || '');
                    current.cold = !alreadyLoaded;      // the route's code is not here yet => a COLD route entry
                    if (current.t_js_start === null) current.t_js_start = now();
                }
                var p = orig.apply(this, arguments);
                var c = current;
                try { p.then(function (ok) { if (c) c.t_js_end = now(); return ok; }); } catch (e2) {}
                return p;
            };
        }));

        // THE COMMIT. switchTo is where mount runs; the render watch starts the moment the target id is
        // known. `apply(this, arguments)` is required, not stylistic: switchTo reads `navToken ===
        // undefined` to mean "a fresh intent", so a wrapper that forwarded a fixed arity would turn
        // every tokenless call into a tokened one and silently rewrite the navigation authority.
        w.push(wrap(window.KM.lifecycle, 'switchTo', function (orig) {
            return function (pageName) {
                /* A TOKENLESS switchTo IS A NAVIGATION TOO, and nothing else was opening a sample for it.
                   Home is reached through showHome(), which calls switchTo directly rather than going
                   through showSection -- so beginNavigation is never called and the whole Home navigation
                   was invisible to this observer. CP2M made a tokenless switchTo mean "a fresh intent";
                   this is the same rule, read from the measuring side. */
                if (!current) openSample(String(pageName || ''), false);
                if (current) {
                    current.t_switch_start = now();
                    current.label = current.label || String(pageName || '');
                    current.sectionId = String(pageName || '');
                }
                var r = orig.apply(this, arguments);
                if (current) { current.t_switch_end = now(); watchRender(String(pageName || '')); }
                return r;
            };
        }));

        originals = w.filter(Boolean);

        // THE CLICK. Capture phase, so the timestamp is taken before any handler runs. It records WHEN,
        // never WHAT: no text, no value, no id beyond the route key already present in the DOM attribute.
        if (typeof document !== 'undefined') {
            var onClick = function (ev) {
                var t = now();
                pendingClick = t;
                pendingClickAt = Date.now();
                void ev;
            };
            document.addEventListener('click', onClick, true);
            listeners.push({ target: document, type: 'click', handler: onClick, options: true });
        }

        // THE NETWORK, read from the browser's own ledger. Nothing is intercepted.
        if (typeof PerformanceObserver === 'function') {
            try {
                resObs = new PerformanceObserver(function (list) {
                    var ents = list.getEntries();
                    for (var i = 0; i < ents.length; i++) {
                        var e = ents[i];
                        var rec = {
                            name: tag(e.name), kind: e.initiatorType,
                            startAt: +e.startTime.toFixed(1),
                            endAt: +e.responseEnd.toFixed(1),
                            ms: +e.duration.toFixed(1),
                            bytes: e.transferSize || e.encodedBodySize || 0
                        };
                        resources.push(rec);
                        if (current && (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest')) {
                            current.api.push({ ms: rec.ms, startAt: rec.startAt, endAt: rec.endAt });
                        }
                    }
                });
                resObs.observe({ type: 'resource', buffered: true });
            } catch (e) { resObs = null; }
        }
    }

    function uninstall() {
        if (originals) {
            for (var i = 0; i < originals.length; i++) {
                var o = originals[i];
                if (o && o.owner && o.owner[o.name] && o.owner[o.name].__kmPerfWrapped) o.owner[o.name] = o.orig;
            }
        }
        originals = null;
        for (var j = 0; j < listeners.length; j++) {
            var l = listeners[j];
            try { l.target.removeEventListener(l.type, l.handler, l.options); } catch (e) {}
        }
        listeners = [];
        if (resObs) { try { resObs.disconnect(); } catch (e2) {} resObs = null; }
        if (mutObs) { try { mutObs.disconnect(); } catch (e3) {} mutObs = null; }
        if (quietTimer) { clearTimeout(quietTimer); quietTimer = null; }
        current = null;
        resources = [];
    }

    // ---- public API --------------------------------------------------------------------------------

    function med(a) {
        if (!a.length) return null;
        var s = a.slice().sort(function (x, y) { return x - y; });
        var m = Math.floor(s.length / 2);
        return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1);
    }

    window.KM.perf = {
        __cp2mR2: true,

        enable: function (opts) {
            if (enabled) return false;
            opts = opts || {};
            if (opts.readySelectors) {
                for (var k in opts.readySelectors) readySelectors[k] = opts.readySelectors[k];
            }
            install();
            enabled = true;
            return true;
        },

        disable: function () {
            if (!enabled) return { wasEnabled: false, installed: 0 };
            var n = (originals ? originals.length : 0) + listeners.length + (resObs ? 1 : 0) + (mutObs ? 1 : 0);
            uninstall();
            enabled = false;
            return { wasEnabled: true, installed: n, samples: samples.length };
        },

        isEnabled: function () { return enabled; },
        installedCount: function () {
            return (originals ? originals.length : 0) + listeners.length + (resObs ? 1 : 0) + (mutObs ? 1 : 0);
        },

        /**
         * MEASURE AN IN-PAGE INTERACTION, which is not a navigation and so opens no sample of its own.
         * The six Product Strategy views are switched INSIDE one mounted page: no route is entered, no
         * script is loaded and no partial is fetched, so every seam this observer wraps stays silent.
         * The operator still waits for a redraw, so it still has a cost, and this is how it is taken.
         * @param {string} label   what the interaction is
         * @param {string} sectionId  the section whose repaint ends it
         */
        markInteraction: function (label, sectionId) {
            if (!enabled) return false;
            var smp = openSample(label, false);
            smp.interaction = true;
            smp.sectionId = String(sectionId || '');
            watchRender(String(sectionId || ''));
            return true;
        },

        /** Name the element whose presence proves a route's DATA (not its shell) is on screen. */
        setReadySelector: function (sectionId, selector) { readySelectors[sectionId] = selector; },

        /** Force the open sample closed -- used by the harness between iterations. */
        flush: function () { closeSample('flushed'); return samples.length; },

        samples: function () { return samples.slice(); },
        clear: function () { samples = []; return 0; },

        summary: function () {
            var by = Object.create(null);
            for (var i = 0; i < samples.length; i++) {
                var s = samples[i];
                var key = (s.label || '?') + '|' + (s.cold ? 'cold' : 'warm');
                if (!by[key]) by[key] = { label: s.label, cold: s.cold, n: 0, shell: [], data: [], js: [], settled: [] };
                var b = by[key];
                b.n++;
                var base = (s.t_click !== null ? s.t_click : s.t_nav);
                if (s.t_shell_visible !== null) b.shell.push(s.t_shell_visible - base);
                if (s.t_data_visible !== null) b.data.push(s.t_data_visible - base);
                if (s.t_js_end !== null && s.t_js_start !== null) b.js.push(s.t_js_end - s.t_js_start);
                if (s.t_settled !== null) b.settled.push(s.t_settled - base);
            }
            var out = [];
            for (var k in by) {
                var v = by[k];
                out.push({
                    label: v.label, cold: v.cold, n: v.n,
                    shellVisibleMs: med(v.shell), dataVisibleMs: med(v.data),
                    jsMs: med(v.js), settledMs: med(v.settled),
                    // The gap a spinner cannot close: between the shell appearing and the data appearing.
                    shellToDataMs: (med(v.shell) !== null && med(v.data) !== null) ? +(med(v.data) - med(v.shell)).toFixed(1) : null
                });
            }
            return out;
        }
    };

    // Deliberately NOT enabled here, and deliberately not referenced by index.html. See the header.
    if (typeof console !== 'undefined' && console.log) console.log('[KM] perf observer loaded (OFF)');
})();
