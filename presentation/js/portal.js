/* ============================================================
   Kitchen Mama Operation System — Presentation Portal
   Standalone renderer. No backend, no DB, no ERP runtime.
   Renders all UI + content from window.I18N[lang].
   Features: language toggle (zh default) · theme · sidebar active
             state · search · expand-all · LocalStorage memo CRUD.
   ============================================================ */
(function () {
    'use strict';

    var LANG_KEY = 'km-portal-lang';
    var THEME_KEY = 'km-portal-theme';
    var MEMO_KEY = 'km-portal-memos';
    var root = document.documentElement;

    /* Executive Blueprint drawer state (lightweight, no framework) */
    var execState = { selected: null };
    var execClose = null;

    /* ---------------- helpers ---------------- */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function get(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; } }
    function set(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

    /* ---------------- state ---------------- */
    var lang = get(LANG_KEY, 'zh');
    if (!window.I18N[lang]) lang = 'zh';

    /* ---------------- theme ---------------- */
    var themeBtn = document.getElementById('themeToggle');
    var themeLabel = document.getElementById('themeLabel');
    function applyTheme(t) {
        root.setAttribute('data-theme', t);
        var L = window.I18N[lang].ui;
        if (themeLabel) themeLabel.textContent = (t === 'dark') ? L.themeToLight : L.themeToDark;
    }
    (function initTheme() {
        var saved = get(THEME_KEY, '');
        if (saved) applyTheme(saved);
        else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
        else applyTheme('light');
    })();
    if (themeBtn) themeBtn.addEventListener('click', function () {
        var next = (root.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
        applyTheme(next); set(THEME_KEY, next);
    });

    /* ---------------- builders ---------------- */
    function buildSidebar(L) {
        var n = L.ui.nav;
        return '' +
        '<div class="sidebar__group"><div class="sidebar__label">' + esc(L.ui.navOverview) + '</div>' +
            '<a href="#vision">' + esc(n.vision) + '</a>' +
            '<a href="#execblueprint">' + esc(n.execblueprint) + '</a>' +
            '<a href="#blueprint">' + esc(n.blueprint) + '</a></div>' +
        '<div class="sidebar__group"><div class="sidebar__label">' + esc(L.ui.navFlows) + '</div>' +
            '<a href="#supplychain">' + esc(n.supplychain) + '</a>' +
            '<a href="#shipment">' + esc(n.shipment) + '</a>' +
            '<a href="#request">' + esc(n.request) + '</a>' +
            '<a href="#documents">' + esc(n.documents) + '</a></div>' +
        '<div class="sidebar__group"><div class="sidebar__label">' + esc(L.ui.navExplore) + '</div>' +
            '<a href="#details">' + esc(n.details) + '</a>' +
            '<a href="#memo">' + esc(n.memo) + '</a></div>' +
        '<div class="sidebar__group"><div class="sidebar__label">' + esc(L.ui.navReference) + '</div>' +
            '<a href="#sources">' + esc(n.sources) + '</a></div>';
    }

    function flowSteps(steps) {
        return '<div class="flow">' + steps.map(function (s, i) {
            var chips = (s.chips && s.chips.length) ? '<div class="flow__chips">' + s.chips.map(function (c) {
                var cls = /^[a-z_]+(\.[a-z_]+)*$/.test(c) ? 'badge badge--db' : 'badge';
                return '<span class="' + cls + '">' + esc(c) + '</span>';
            }).join('') + '</div>' : '';
            return '<div class="flow__step"><div class="flow__num">' + (i + 1) + '</div>' +
                '<div class="flow__body"><div class="flow__title">' + s.title + '</div>' +
                '<div class="flow__desc">' + s.desc + '</div>' + chips + '</div></div>';
        }).join('') + '</div>';
    }

    function disclose(summary, innerHtml) {
        return '<details class="disclose"><summary>' + esc(summary) + '</summary>' +
            '<div class="disclose__body">' + innerHtml + '</div></details>';
    }

    /* Executive Blueprint — a clean business capability map (NOT technical).
       Root node + 8 domain cards (icon · name · purpose · count · first 3 modules · +N more).
       Clicking a card opens the right-side drawer (wired in wireExecBlueprint). */
    function buildExecBlueprint(L) {
        var e = L.sections.execblueprint;
        var cards = e.domains.map(function (d, i) {
            var shown = d.mods.slice(0, 3);
            var more = d.mods.length - shown.length;
            var moreHtml = more > 0 ? '<li class="exec-card__more">' + esc(e.more(more)) + '</li>' : '';
            return '<button type="button" class="exec-card exec-card--' + d.cat + '" data-domain="' + i + '">' +
                '<div class="exec-card__head"><span class="exec-card__icon">' + esc(d.icon) + '</span>' +
                    '<span class="exec-pill exec-pill--' + d.cat + '">' + esc(d.catLabel) + '</span></div>' +
                '<div class="exec-card__name">' + esc(d.name) + '</div>' +
                '<div class="exec-card__purpose">' + esc(d.purpose) + '</div>' +
                '<div class="exec-card__count">' + esc(e.moduleCount(d.mods.length)) + '</div>' +
                '<ul class="exec-card__mods">' + shown.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + moreHtml + '</ul>' +
            '</button>';
        }).join('');
        return '<section class="section" id="execblueprint">' +
            '<span class="section__kicker">' + esc(e.kicker) + '</span>' +
            '<h2>' + esc(e.h2) + '</h2>' +
            '<div class="exec-subtitle">' + esc(e.subtitle) + '</div>' +
            '<p class="section__lead">' + esc(e.mainMessage) + '</p>' +
            '<div class="exec-root"><span class="exec-root__logo">KM</span>' + esc(e.rootNode) + '</div>' +
            '<div class="exec-map">' + cards + '</div>' +
            '<div class="note exec-colornote">' + esc(e.colorNote) + '</div>' +
            buildExecLoop(e) +
        '</section>';
    }

    /* Simplified executive-level "Core Operating Loop" shown below the capability cards.
       NOT the detailed supply-chain flow: no DB names, no formulas, no technical mapping.
       7 connected step cards + a return-to-start indicator. Color bands reflect the three
       routing groups (order → factory → shipment), reusing the domain palette tokens. */
    function buildExecLoop(e) {
        var lp = e.loop;
        if (!lp) return '';
        var bands = ['green', 'green', 'orange', 'orange', 'cyan', 'cyan', 'cyan'];
        var steps = lp.steps.map(function (s, i) {
            return '<div class="exec-loop__step exec-card--' + (bands[i] || 'teal') + '">' +
                '<div class="exec-loop__num">' + (i + 1) + '</div>' +
                '<div class="exec-loop__icon">' + esc(s.icon) + '</div>' +
                '<div class="exec-loop__t">' + esc(s.t) + '</div>' +
                '<div class="exec-loop__d">' + esc(s.d) + '</div>' +
            '</div>';
        }).join('<div class="exec-loop__arrow" aria-hidden="true">→</div>');
        return '<h3 class="exec-loop__title">' + esc(lp.title) + '</h3>' +
            '<p class="exec-loop__subtitle">' + esc(lp.subtitle) + '</p>' +
            '<div class="exec-loop">' + steps +
                '<div class="exec-loop__return"><span class="exec-loop__returnicon">↻</span>' + esc(lp.backLabel) + '</div>' +
            '</div>' +
            '<div class="note exec-loop__note">' + esc(lp.note) + '</div>' +
            '<p class="exec-loop__note2">' + esc(lp.note2) + '</p>';
    }

    function buildExecDrawer(L) {
        var e = L.sections.execblueprint;
        return '<div class="exec-scrim" id="execScrim" hidden></div>' +
            '<aside class="exec-drawer" id="execDrawer" hidden role="dialog" aria-modal="true" aria-labelledby="execDrawerName">' +
                '<div class="exec-drawer__head">' +
                    '<span class="exec-drawer__icon" id="execDrawerIcon"></span>' +
                    '<h3 id="execDrawerName"></h3>' +
                    '<button class="iconbtn" id="execDrawerClose" aria-label="' + esc(e.drawer.close) + '">✕</button>' +
                '</div>' +
                '<div class="exec-drawer__body" id="execDrawerBody"></div>' +
                '<div class="exec-drawer__foot"><button class="btn btn--primary" id="execDrawerDetails"></button></div>' +
            '</aside>';
    }

    function buildContent(L) {
        var S = L.sections;
        var html = '<p class="searchinfo" id="searchInfo" style="display:none;"></p>';

        /* A. VISION */
        var v = S.vision;
        html += '<section class="section" id="vision">' +
            '<div class="hero"><span class="section__kicker">' + esc(v.kicker) + '</span>' +
            '<h1>' + esc(v.h1) + '</h1><p>' + v.p1 + '</p>' +
            '<p class="hero__quote">' + esc(v.quote) + '</p></div>' +
            '<h3>' + esc(v.h3problem) + '</h3><p class="section__lead">' + v.problemLead + '</p>' +
            '<h3>' + esc(v.h3ba) + '</h3>' +
            '<div class="ba"><div class="ba__col"><div class="ba__head ba__head--before">' + esc(v.beforeHead) + '</div><ul>' +
                v.before.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>' +
            '<div class="ba__col"><div class="ba__head ba__head--after">' + esc(v.afterHead) + '</div><ul>' +
                v.after.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div></div>' +
            '<h3>' + esc(v.h3chain) + '</h3><div class="grid grid--3">' +
                v.chain.map(function (c) { return '<div class="card"><h4>' + esc(c.h) + '</h4><p>' + esc(c.p) + '</p></div>'; }).join('') +
            '</div></section>';

        /* B. EXECUTIVE BLUEPRINT (clean business capability map) */
        html += buildExecBlueprint(L);

        /* C. TECHNICAL BLUEPRINT (was "System Blueprint" — detailed roadmap / modules; id stays #blueprint) */
        var b = S.blueprint;
        function modCard(m) {
            var badge = m.badge ? '<div class="card__meta"><span class="badge badge--accent">' + esc(m.badge) + '</span></div>' : '';
            return '<div class="card"><h4>' + esc(m.t) + '</h4><p>' + esc(m.p) + '</p>' + badge + '</div>';
        }
        // Phase 1: top-level module cards with an expandable sub-item list (grouped, not flat).
        // Numbering is auto-derived from order (strips any embedded "N · " prefix in the data),
        // so adding/splitting a module never requires renumbering the rest.
        function moduleBlock(m, i) {
            var title = String(m.t).replace(/^\s*\d+\s*·\s*/, '');
            var badge = m.badge ? '<span class="badge badge--accent">' + esc(m.badge) + '</span>' : '';
            var subs = (m.sub || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
            return '<details class="disclose module"><summary>' +
                '<span class="module__title">' + esc((i + 1) + ' · ' + title) + '</span>' + badge +
                '</summary><div class="disclose__body"><p>' + esc(m.p) + '</p>' +
                '<ul class="subitems">' + subs + '</ul></div></details>';
        }
        html += '<section class="section" id="blueprint">' +
            '<span class="section__kicker">' + esc(b.kicker) + '</span><h2>' + esc(b.h2) + '</h2>' +
            '<p class="section__lead">' + b.lead + '</p>' +
            '<div class="note">' + b.note + '</div>' +
            '<h3>' + esc(b.p1head) + ' <span class="badge badge--p1">' + esc(b.p1badge) + '</span></h3>' +
            '<div class="modlist">' + b.phase1.map(moduleBlock).join('') + '</div>' +
            disclose(b.spotlight1Summary, b.spotlight1Body) +
            '<h3>' + esc(b.p2head) + ' <span class="badge badge--p2">' + esc(b.p2badge) + '</span></h3>' +
            '<div class="grid grid--2">' + b.phase2.map(function (m) { return modCard(m); }).join('') + '</div>' +
            disclose(b.spotlight2Summary, b.spotlight2Body) +
            '</section>';

        /* C. SUPPLY CHAIN */
        var sc = S.supplychain;
        html += '<section class="section" id="supplychain">' +
            '<span class="section__kicker">' + esc(sc.kicker) + '</span><h2>' + esc(sc.h2) + '</h2>' +
            '<p class="section__lead">' + sc.lead + '</p>' +
            '<h3>' + esc(sc.h3main) + '</h3><pre class="flowdiagram">' + esc(sc.mainDiagram) + '</pre>' +
            '<h3>' + esc(sc.h3order) + '</h3><pre class="flowdiagram">' + esc(sc.orderDiagram) + '</pre>' +
            '<div class="note">' + sc.note + '</div></section>';

        /* D. SHIPMENT */
        var sh = S.shipment;
        html += '<section class="section" id="shipment">' +
            '<span class="section__kicker">' + esc(sh.kicker) + '</span><h2>' + esc(sh.h2) + '</h2>' +
            '<p class="section__lead">' + sh.lead + '</p>' +
            flowSteps(sh.steps) +
            disclose(sh.discloseSummary, '<ul>' + sh.discloseItems.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>') +
            '</section>';

        /* E. REQUEST */
        var rq = S.request;
        var relRows = rq.relRows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
        }).join('');
        html += '<section class="section" id="request">' +
            '<span class="section__kicker">' + esc(rq.kicker) + '</span><h2>' + esc(rq.h2) + '</h2>' +
            '<p class="section__lead">' + rq.lead + '</p>' +
            flowSteps(rq.steps) +
            '<h3>' + esc(rq.h3rel) + '</h3>' +
            '<table class="rel"><thead><tr>' + rq.relHead.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>' +
            '<tbody>' + relRows + '</tbody></table>' +
            disclose(rq.discloseSummary, '<ul>' + rq.discloseItems.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>') +
            '</section>';

        /* F. DOCUMENTS */
        var dc = S.documents;
        html += '<section class="section" id="documents">' +
            '<span class="section__kicker">' + esc(dc.kicker) + '</span><h2>' + esc(dc.h2) + '</h2>' +
            '<p class="section__lead">' + dc.lead + '</p>' +
            '<div class="grid grid--3">' + dc.docs.map(function (d) { return '<div class="card"><h4>' + esc(d.t) + '</h4><p>' + d.p + '</p></div>'; }).join('') + '</div>' +
            '<h3>' + esc(dc.h3flow) + '</h3><pre class="flowdiagram">' + esc(dc.flowDiagram) + '</pre>' +
            '<div class="note">' + dc.note + '</div>' +
            disclose(dc.discloseSummary, dc.discloseBody) +
            '</section>';

        /* G. DETAILS (module cards) */
        var dt = S.details;
        var cardLabels = L.ui.cardLabels;
        var cards = L.cards.map(function (m) {
            return '<div class="card"><h4>' + esc(m.t) + '</h4>' +
                '<p><strong>' + esc(cardLabels.what) + ':</strong> ' + esc(m.what) + '</p>' +
                '<p style="margin-top:6px;"><strong>' + esc(cardLabels.why) + ':</strong> ' + esc(m.why) + '</p>' +
                '<p style="margin-top:6px;"><strong>' + esc(cardLabels.flow) + ':</strong> ' + esc(m.flow) + '</p>' +
                '<div class="card__meta"><span class="badge badge--accent">' + esc(cardLabels.demo) + ': ' + esc(m.talk) + '</span></div></div>';
        }).join('');
        html += '<section class="section" id="details">' +
            '<span class="section__kicker">' + esc(dt.kicker) + '</span><h2>' + esc(dt.h2) + '</h2>' +
            '<p class="section__lead">' + dt.lead + '</p>' +
            '<div class="grid grid--2">' + cards + '</div></section>';

        /* H. MEMO */
        var mm = S.memo;
        var M = L.ui.memo;
        var catOptions = M.categories.map(function (c, i) { return '<option value="' + i + '">' + esc(c) + '</option>'; }).join('');
        html += '<section class="section" id="memo">' +
            '<span class="section__kicker">' + esc(mm.kicker) + '</span><h2>' + esc(mm.h2) + '</h2>' +
            '<p class="section__lead">' + mm.lead + '</p>' +
            '<div class="memo-toolbar">' +
                '<button class="btn btn--primary" id="memoNewBtn">' + esc(M.newBtn) + '</button>' +
                '<select class="btn" id="memoFilterStatus" style="font-weight:500;">' +
                    '<option value="">' + esc(M.allStatuses) + '</option>' +
                    '<option value="open">' + esc(M.statusOpen) + '</option>' +
                    '<option value="in_review">' + esc(M.statusInReview) + '</option>' +
                    '<option value="done">' + esc(M.statusDone) + '</option>' +
                    '<option value="deferred">' + esc(M.statusDeferred) + '</option>' +
                '</select><span class="topbar__spacer"></span>' +
                '<button class="btn btn--ghost btn--sm" id="memoExportBtn">' + esc(M.exportBtn) + '</button>' +
            '</div>' +
            '<form class="memo-form hidden" id="memoForm"><input type="hidden" id="memoId">' +
                '<div class="row"><div><label>' + esc(M.title) + '</label><input id="memoTitle" required placeholder="' + esc(M.titlePlaceholder) + '"></div>' +
                '<div><label>' + esc(M.category) + '</label><select id="memoCategory">' + catOptions + '</select></div></div>' +
                '<div class="row"><div><label>' + esc(M.priority) + '</label><select id="memoPriority">' +
                    '<option value="high">' + esc(M.priorities.high) + '</option>' +
                    '<option value="medium" selected>' + esc(M.priorities.medium) + '</option>' +
                    '<option value="low">' + esc(M.priorities.low) + '</option></select></div>' +
                '<div><label>' + esc(M.status) + '</label><select id="memoStatus">' +
                    '<option value="open" selected>' + esc(M.statusOpen) + '</option>' +
                    '<option value="in_review">' + esc(M.statusInReview) + '</option>' +
                    '<option value="done">' + esc(M.statusDone) + '</option>' +
                    '<option value="deferred">' + esc(M.statusDeferred) + '</option></select></div></div>' +
                '<div><label>' + esc(M.note) + '</label><textarea id="memoNote" placeholder="' + esc(M.notePlaceholder) + '"></textarea></div>' +
                '<div class="memo-toolbar" style="margin-top:12px;">' +
                    '<button type="submit" class="btn btn--primary">' + esc(M.save) + '</button>' +
                    '<button type="button" class="btn btn--ghost" id="memoCancelBtn">' + esc(M.cancel) + '</button>' +
                '</div></form>' +
            '<div class="memo-list" id="memoList"></div></section>';

        /* SOURCES */
        var so = S.sources;
        var soRows = so.tableRows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('');
        html += '<section class="section" id="sources">' +
            '<span class="section__kicker">' + esc(so.kicker) + '</span><h2>' + esc(so.h2) + '</h2>' +
            '<p class="section__lead">' + so.lead + '</p>' +
            '<table class="rel"><thead><tr><th>' + esc(so.tableHead[0]) + '</th><th>' + esc(so.tableHead[1]) + '</th></tr></thead>' +
            '<tbody>' + soRows + '</tbody></table>' +
            '<div class="note note--warn">' + so.note + '</div></section>';

        html += buildExecDrawer(L);
        html += '<footer class="portal-footer">' + esc(L.ui.footer) + '</footer>';
        return html;
    }

    /* ---------------- Executive Blueprint drawer interaction ---------------- */
    function wireExecBlueprint(L) {
        var e = L.sections.execblueprint;
        var section = document.getElementById('execblueprint');
        var drawer = document.getElementById('execDrawer');
        var scrim = document.getElementById('execScrim');
        if (!drawer || !scrim) return;
        var iconEl = document.getElementById('execDrawerIcon');
        var nameEl = document.getElementById('execDrawerName');
        var bodyEl = document.getElementById('execDrawerBody');
        var detailsBtn = document.getElementById('execDrawerDetails');
        var closeBtn = document.getElementById('execDrawerClose');

        function openDomain(i) {
            var d = e.domains[i];
            if (!d) return;
            iconEl.textContent = d.icon;
            nameEl.textContent = d.name;
            drawer.className = 'exec-drawer exec-drawer--' + d.cat;
            var modsHtml = d.mods.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('');
            bodyEl.innerHTML =
                '<span class="exec-pill exec-pill--' + d.cat + ' exec-drawer__pill">' + esc(d.catLabel) + '</span>' +
                '<h4>' + esc(e.drawer.purposeLabel) + '</h4><p>' + esc(d.purpose) + '</p>' +
                '<h4>' + esc(e.drawer.explanationLabel) + '</h4><p>' + esc(d.explain) + '</p>' +
                '<h4>' + esc(e.drawer.modulesLabel) + ' (' + d.mods.length + ')</h4>' +
                '<ul class="exec-drawer__mods">' + modsHtml + '</ul>' +
                '<h4>' + esc(e.drawer.flowLabel) + '</h4><p>' + esc(d.flow) + '</p>';
            detailsBtn.textContent = e.drawer.viewDetails;
            drawer.hidden = false; scrim.hidden = false;
            requestAnimationFrame(function () { drawer.classList.add('is-open'); scrim.classList.add('is-open'); });
            execState.selected = i;
        }
        function closeDrawer() {
            drawer.classList.remove('is-open'); scrim.classList.remove('is-open');
            setTimeout(function () { drawer.hidden = true; scrim.hidden = true; }, 200);
            execState.selected = null;
        }
        execClose = closeDrawer;

        if (section) section.addEventListener('click', function (ev) {
            var card = ev.target.closest ? ev.target.closest('.exec-card') : null;
            if (!card) return;
            openDomain(parseInt(card.getAttribute('data-domain'), 10));
        });
        closeBtn.addEventListener('click', closeDrawer);
        scrim.addEventListener('click', closeDrawer);
        detailsBtn.addEventListener('click', function () {
            closeDrawer();
            var bp = document.getElementById('blueprint'); // renamed to "Technical Blueprint" (id unchanged)
            if (bp) {
                try { history.replaceState(null, '', '#blueprint'); } catch (e2) {}
                bp.scrollIntoView({ behavior: 'smooth', block: 'start' });
                bp.classList.add('section--highlight');
                setTimeout(function () { bp.classList.remove('section--highlight'); }, 2200);
            }
        });
    }

    /* ---------------- memo (LocalStorage CRUD) ---------------- */
    function loadMemos() { try { return JSON.parse(localStorage.getItem(MEMO_KEY)) || []; } catch (e) { return []; } }
    function saveMemos(a) { try { localStorage.setItem(MEMO_KEY, JSON.stringify(a)); } catch (e) {} }
    function nowISO() { return new Date().toISOString(); }
    function uid() { return 'memo_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
    function fmt(iso) {
        if (!iso) return '';
        var d = new Date(iso); if (isNaN(d.getTime())) return iso;
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function renderMemoList() {
        var L = window.I18N[lang], M = L.ui.memo;
        var listHost = document.getElementById('memoList');
        if (!listHost) return;
        var filterStatus = document.getElementById('memoFilterStatus');
        var memos = loadMemos();
        var f = filterStatus ? filterStatus.value : '';
        var shown = f ? memos.filter(function (m) { return m.status === f; }) : memos;
        shown.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

        if (!shown.length) {
            listHost.innerHTML = '<div class="memo-empty">' + esc(memos.length ? M.emptyFilter : M.emptyNone) + '</div>';
            return;
        }
        var statusLabel = { open: M.statusOpen, in_review: M.statusInReview, done: M.statusDone, deferred: M.statusDeferred };
        listHost.innerHTML = shown.map(function (m) {
            var catIdx = (typeof m.category === 'number') ? m.category : 0;
            var catTxt = M.categories[catIdx] != null ? M.categories[catIdx] : (m.category || '');
            var pri = M.priorities[m.priority] || m.priority;
            return '<div class="memo-item"><div class="memo-item__top">' +
                '<span class="memo-item__title">' + esc(m.title) + '</span>' +
                '<span class="badge">' + esc(catTxt) + '</span>' +
                '<span class="badge pri-' + esc(m.priority) + '">' + esc(pri) + '</span>' +
                '<span class="badge st-' + esc(m.status) + '">' + esc(statusLabel[m.status] || m.status) + '</span></div>' +
                (m.note ? '<div class="memo-item__note">' + esc(m.note) + '</div>' : '') +
                '<div class="memo-item__foot"><span>' + esc(M.created) + ' ' + esc(fmt(m.createdAt)) + '</span>' +
                (m.updatedAt && m.updatedAt !== m.createdAt ? '<span>· ' + esc(M.updated) + ' ' + esc(fmt(m.updatedAt)) + '</span>' : '') +
                '<span style="flex:1"></span>' +
                '<button class="btn btn--ghost btn--sm" data-edit="' + esc(m.id) + '">' + esc(M.edit) + '</button>' +
                '<button class="btn btn--ghost btn--sm" data-del="' + esc(m.id) + '" style="color:var(--danger)">' + esc(M.delete) + '</button>' +
                '</div></div>';
        }).join('');
    }

    function wireMemo() {
        var L = window.I18N[lang], M = L.ui.memo;
        var form = document.getElementById('memoForm');
        var listHost = document.getElementById('memoList');
        var filterStatus = document.getElementById('memoFilterStatus');
        if (!form || !listHost) return;
        var els = {
            id: document.getElementById('memoId'), title: document.getElementById('memoTitle'),
            category: document.getElementById('memoCategory'), priority: document.getElementById('memoPriority'),
            status: document.getElementById('memoStatus'), note: document.getElementById('memoNote')
        };
        function openForm(memo) {
            form.classList.remove('hidden');
            if (memo) {
                els.id.value = memo.id; els.title.value = memo.title;
                els.category.value = (typeof memo.category === 'number') ? memo.category : 0;
                els.priority.value = memo.priority; els.status.value = memo.status; els.note.value = memo.note;
            } else {
                els.id.value = ''; els.title.value = ''; els.category.value = '6'; /* Module Detail */
                els.priority.value = 'medium'; els.status.value = 'open'; els.note.value = '';
            }
            els.title.focus();
        }
        function closeForm() { form.classList.add('hidden'); }

        document.getElementById('memoNewBtn').addEventListener('click', function () { openForm(null); });
        document.getElementById('memoCancelBtn').addEventListener('click', closeForm);
        filterStatus.addEventListener('change', renderMemoList);
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var memos = loadMemos(), id = els.id.value;
            var data = {
                title: els.title.value.trim() || M.untitled,
                category: parseInt(els.category.value, 10) || 0,
                priority: els.priority.value, status: els.status.value, note: els.note.value.trim()
            };
            if (id) {
                memos = memos.map(function (m) { return m.id === id ? Object.assign({}, m, data, { updatedAt: nowISO() }) : m; });
            } else {
                var t = nowISO();
                memos.push(Object.assign({ id: uid(), createdAt: t, updatedAt: t }, data));
            }
            saveMemos(memos); closeForm(); renderMemoList();
        });
        listHost.addEventListener('click', function (e) {
            var editId = e.target.getAttribute('data-edit'), delId = e.target.getAttribute('data-del');
            if (editId) { var m = loadMemos().filter(function (x) { return x.id === editId; })[0]; if (m) openForm(m); }
            else if (delId) { if (confirm(M.confirmDelete)) { saveMemos(loadMemos().filter(function (x) { return x.id !== delId; })); renderMemoList(); } }
        });
        document.getElementById('memoExportBtn').addEventListener('click', function () {
            var json = JSON.stringify(loadMemos(), null, 2), btn = this;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(json).then(function () { btn.textContent = M.copied; setTimeout(function () { btn.textContent = M.exportBtn; }, 1500); });
            } else { window.prompt('Copy memo JSON:', json); }
        });
        renderMemoList();
    }

    /* ---------------- sidebar active state ---------------- */
    var io = null;
    function wireSidebarObserver() {
        if (io) io.disconnect();
        var sections = Array.prototype.slice.call(document.querySelectorAll('.section'));
        var navLinks = Array.prototype.slice.call(document.querySelectorAll('.sidebar a'));
        if (!('IntersectionObserver' in window) || !sections.length) return;
        io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) {
                    navLinks.forEach(function (a) { a.classList.remove('active'); });
                    var l = navLinks.filter(function (a) { return a.getAttribute('href') === '#' + en.target.id; })[0];
                    if (l) l.classList.add('active');
                }
            });
        }, { rootMargin: '-60px 0px -70% 0px', threshold: 0 });
        sections.forEach(function (s) { io.observe(s); });
    }

    /* ---------------- search ---------------- */
    function wireSearch() {
        var input = document.getElementById('searchInput');
        var info = document.getElementById('searchInfo');
        var L = window.I18N[lang];
        if (!input) return;
        function run(q) {
            q = (q || '').trim().toLowerCase();
            var sections = Array.prototype.slice.call(document.querySelectorAll('.section'));
            var cards = Array.prototype.slice.call(document.querySelectorAll('.card, .ba, table.rel, details.disclose'));
            if (!q) {
                cards.forEach(function (el) { el.classList.remove('search-hidden'); });
                sections.forEach(function (s) { s.classList.remove('search-hidden'); });
                if (info) info.style.display = 'none';
                return;
            }
            cards.forEach(function (el) {
                el.classList.toggle('search-hidden', el.textContent.toLowerCase().indexOf(q) === -1);
            });
            var visible = 0;
            sections.forEach(function (s) {
                var match = s.textContent.toLowerCase().indexOf(q) !== -1;
                s.classList.toggle('search-hidden', !match);
                if (match) { visible++; s.classList.remove('search-hidden'); }
            });
            if (info) { info.style.display = 'block'; info.textContent = L.ui.searchInfo(q, visible); }
        }
        input.addEventListener('input', function () { run(this.value); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { this.value = ''; run(''); this.blur(); } });
    }

    /* ---------------- expand all ---------------- */
    function wireExpand() {
        var btn = document.getElementById('expandAll');
        if (!btn) return;
        var L = window.I18N[lang];
        btn.innerHTML = L.ui.expand;
        btn.onclick = function () {
            var all = Array.prototype.slice.call(document.querySelectorAll('details.disclose'));
            var anyClosed = all.some(function (d) { return !d.open; });
            all.forEach(function (d) { d.open = anyClosed; });
            btn.innerHTML = anyClosed ? L.ui.collapse : L.ui.expand;
        };
    }

    /* ---------------- top bar labels ---------------- */
    function applyChrome(L) {
        root.setAttribute('lang', L.ui.htmlLang);
        document.getElementById('brandSub').textContent = L.ui.brandSub;
        document.getElementById('brandTag').textContent = L.ui.tag;
        document.getElementById('searchInput').placeholder = L.ui.searchPlaceholder;
        var langBtn = document.getElementById('langToggle');
        langBtn.textContent = L.ui.langButton;
        langBtn.title = L.ui.langTitle;
        applyTheme(root.getAttribute('data-theme') || 'light');
    }

    /* ---------------- full render ---------------- */
    function renderAll() {
        var L = window.I18N[lang];
        applyChrome(L);
        document.getElementById('sidebar').innerHTML = buildSidebar(L);
        document.getElementById('content').innerHTML = buildContent(L);
        wireSidebarObserver();
        wireSearch();
        wireExpand();
        wireMemo();
        wireExecBlueprint(L);
        // reset search box
        var si = document.getElementById('searchInput'); if (si) si.value = '';
    }

    /* ---------------- language toggle ---------------- */
    document.getElementById('langToggle').addEventListener('click', function () {
        lang = (lang === 'zh') ? 'en' : 'zh';
        set(LANG_KEY, lang);
        renderAll();
        window.scrollTo({ top: 0, behavior: 'auto' });
    });

    /* ---------------- boot ---------------- */
    // Single persistent Escape handler closes the exec drawer (renderAll rebuilds the drawer,
    // so we keep one global listener that calls the current closeDrawer via execClose).
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && execClose) execClose(); });
    renderAll();
})();
