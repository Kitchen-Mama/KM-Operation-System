/**
 * assets/js/pages/sales-outlook.js — TARGET-SALES-R2, a LOCAL CANDIDATE. Forecast Overview › Sales Outlook.
 *
 * The page. It decides no number: KMSO (core/sales-outlook-calc.js) computes every line, KMSOP
 * (api/sales-outlook-provider.js) reads the three existing read owners, and every section here is a sum of the SAME
 * lines through KMSO.aggregate — so the site, Series, Category and SKU sections cannot disagree about a total.
 *
 * LIFECYCLE. Registered with KM.lifecycle as `sales-outlook-section` (mount / unmount). Every listener goes through
 * KM.lifecycle.listenerScope, so it is released on unmount; the provider is destroyed on unmount, so an answer that
 * lands after the operator has left is dropped. Only the LATEST request may paint: a provider generation plus the
 * lifecycle epoch, both checked before anything is committed.
 *
 * ISOLATION. Its own ids (so*), its own state object (created on mount, dropped on unmount), its own preset /
 * month-arrow classes. It never reads or writes Forecast Review's state, the shared Forecast date modal, or the
 * FC Summary tabs. It writes nothing and stores nothing — no DB, no localStorage — so no filter is saved anywhere.
 *
 * SITES ARE CHOSEN, NOT ASSUMED (review fix 1). The page no longer reads every site on entry. The system has no
 * current-site context to inherit (searched: app.js's siteSelect belongs to another page, the scope modal keeps its own),
 * so it opens on "choose sites" with nothing ticked and reads nothing; the operator ticks one, several or All — the
 * multi-site sums are unchanged, each site still its own company / country / marketplace. While a read runs, every chosen
 * site shows its own progress (waiting, page n, done, failed or partial). Any timing is the browser's, never an SLA.
 */
(function () {
  'use strict';
  var SECTION = 'sales-outlook-section';
  var PARTIAL = { key: 'sales-outlook', url: 'assets/html/pages/sales-outlook.html', target: '#sales-outlook-mount' };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var UNCLASSIFIED = '\u0000UNCLASSIFIED', NO_CURRENCY = '\u0000NO_CURRENCY';
  var SKU_PAGE = 50;
  var S = null;

  function KM_() { return window.KM || {}; }
  function SO() { return KM_().core && KM_().core.salesOutlook; }
  function esc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymParts(ym) { return { y: +ym.slice(0, 4), m: +ym.slice(5, 7) }; }
  function ymAdd(ym, k) { var p = ymParts(ym), i = p.y * 12 + p.m - 1 + k; return Math.floor(i / 12) + '-' + pad2(i % 12 + 1); }
  function ymLabel(ym) { var p = ymParts(ym); return MON[p.m - 1] + ' ' + p.y; }
  function rangeLabel(a, b) { if (a === b) return ymLabel(a); var x = ymParts(a), y = ymParts(b); return x.y === y.y ? MON[x.m - 1] + ' – ' + MON[y.m - 1] + ' ' + y.y : ymLabel(a) + ' – ' + ymLabel(b); }
  function nowYm() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  function dec(cur) { return /^(JPY|KRW|TWD)$/.test(String(cur || '').toUpperCase()) ? 0 : 2; }
  function fmtAmt(v, cur) { if (v === null || v === undefined) return '<span class="so-missing">—</span>'; var d = dec(cur); return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function fmtQty(v) { if (v === null || v === undefined) return '<span class="so-missing">—</span>'; var r = Math.round(v); return Math.abs(v - r) < 1e-9 ? r.toLocaleString('en-US') : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function curLabel(c) { return c === null || c === NO_CURRENCY ? '<span class="so-missing">no currency</span>' : esc(c); }
  function dimLabel(v) { return v === UNCLASSIFIED || v === null ? '<span class="so-missing">(unclassified)</span>' : esc(v); }
  function siteLabel(k) { var p = String(k).split('|'); return S && S.siteNames[k] ? esc(S.siteNames[k]) : esc(p.join(' · ')); }

  function newState() {
    var ym = nowYm();
    return { epoch: null, tab: 'raw', from: ym, to: ym, preset: 'this-month', temp: null, cal: null, universe: null, siteNames: {},
      sel: { company: null, country: null, site: null, category: null, series: null, currency: null }, skuQuery: '', skuPage: 0,
      calc: null, ly: null, unknownCur: {}, unknownLy: {}, evDim: 'series', read: null, phase: 'idle', error: null, expanded: {}, sort: { sites: ['amount', -1], series: ['amount', -1], category: ['amount', -1], sku: ['sku', 1] },
      provider: null, scope: null, loadGen: 0, lastFocus: null, opts: {}, progress: null, refreshing: false };
  }
  function current(epoch) {
    var LC = KM_().lifecycle;
    if (!S || S.epoch !== epoch) return false;
    return !(LC && typeof LC.commitGuard === 'function') || LC.commitGuard(epoch, SECTION) !== false;
  }
  function on(target, type, fn, opts) { if (S && S.scope && target) S.scope.on(target, type, fn, opts); }

  // ---- mount / unmount -------------------------------------------------------------------------------------------------
  function mount(epoch) {
    S = newState(); S.epoch = epoch;
    var LC = KM_().lifecycle, PL = KM_().partialLoader;
    S.scope = LC && LC.listenerScope ? LC.listenerScope(SECTION) : { on: function (t, ty, f, o) { t.addEventListener(ty, f, o); }, release: function () {} };
    var ready = $(SECTION) ? Promise.resolve(true) : (PL ? PL.loadPartial(PARTIAL.key, PARTIAL.url, PARTIAL.target) : Promise.resolve(null));
    return Promise.resolve(ready).then(function () {
      if (!current(epoch)) return;
      var sec = $(SECTION); if (!sec) return;
      sec.classList.add('active');
      if (!SO()) { status('<div class="so-banner so-banner--error">The Sales Outlook calculator did not load; nothing is shown rather than a guess.</div>'); return; }
      S.provider = KM_().salesOutlookProvider ? KM_().salesOutlookProvider.create({}) : null;
      bind(sec);
      updateTrigger();
      render();
      loadUniverse(epoch);
    });
  }
  function unmount() {
    if (!S) return;
    closeModal(true);
    if (S.provider) S.provider.destroy();
    if (S.scope && S.scope.release) S.scope.release();
    S = null;
  }

  // ---- reads (latest wins) ---------------------------------------------------------------------------------------------
  function loadUniverse(epoch) {
    if (!S.provider) { S.phase = 'error'; S.error = 'SALES_OUTLOOK_PROVIDER_UNAVAILABLE'; render(); return; }
    S.phase = 'loading'; render();
    S.provider.universe().then(function (u) {
      if (!current(epoch) || u.superseded) return;
      if (!u.ok) { S.phase = 'error'; S.error = u.code; render(); return; }
      S.universe = u.sites;
      u.sites.forEach(function (s) { S.siteNames[s.key] = s.company + ' · ' + s.country + ' · ' + s.marketplace; });
      S.sel.site = [];            // nothing ticked: no current-site context exists, and the first site is not a choice
      buildSiteFilters();
      load(epoch, false);         // reads nothing until a site is chosen
    });
  }
  function chosenSites() {
    if (!S.universe) return [];
    return S.universe.filter(function (s) {
      return (S.sel.company === null || S.sel.company.indexOf(s.company) >= 0) && (S.sel.country === null || S.sel.country.indexOf(s.country) >= 0)
        && (S.sel.site === null || S.sel.site.indexOf(s.key) >= 0);
    });
  }
  function load(epoch, refresh) {
    var sites = chosenSites(), gen = ++S.loadGen;
    // no site chosen: nothing is read, and an answer still on its way for an earlier choice is dropped (gen moved on)
    if (!sites.length) { S.phase = 'choose'; S.read = null; S.calc = null; S.ly = null; S.progress = null; render(); return; }
    S.progress = {}; sites.forEach(function (s) { S.progress[s.key] = { phase: 'WAITING' }; });
    S.refreshing = refresh === true;
    S.phase = 'loading'; render();
    S.provider.load({ sites: sites, refresh: refresh === true, onProgress: function (k, x) {
      if (!current(epoch) || gen !== S.loadGen || !S.progress) return;
      S.progress[k] = x; if (S.phase === 'loading') render();
    } }).then(function (r) {
      if (!current(epoch) || r.superseded || gen !== S.loadGen) return;   // a newer request owns the page
      S.read = r; S.refreshing = false;
      recompute();
    });
  }
  function progressHtml() {
    var p = S.progress || {}, keys = Object.keys(p), done = keys.filter(function (k) { return p[k].phase === 'DONE' || p[k].phase === 'CACHED'; }).length;
    function one(k) {
      var x = p[k], w = x.phase === 'WAITING' ? 'waiting' : x.phase === 'PAGE' ? 'reading page ' + x.page : x.phase === 'CACHED' ? 'already read' : x.state === 'READY' ? 'done' : 'done · ' + String(x.state || '').toLowerCase();
      return '<li>' + siteLabel(k) + ' — ' + esc(w) + '</li>';
    }
    return '<div class="so-banner so-banner--info">' + (S.refreshing ? 'Refreshing' : 'Reading') + ' the forecast and ' + keys.length + ' site(s): ' + done + ' of ' + keys.length + ' done.'
      + '<ul class="so-progress">' + keys.map(one).join('') + '</ul></div>';
  }
  function recompute() {
    var r = S.read;
    if (!r) return;
    if (!r.fc.ok) { S.phase = 'error'; S.error = r.fc.code; S.calc = null; render(); return; }
    var PD = KM_().core && KM_().core.planningDemand;
    var input = { from: S.from, to: S.to, regularRows: r.fc.regularRows, eventRows: r.fc.eventRows, targetRuleRows: r.fc.targetRuleRows,
      sites: r.sites, resolveTargetRule: PD && PD.resolveTargetRule, sourceCapped: r.fc.capped };
    S.calc = SO().compute(input);
    // R3 — the same months one year earlier, from the SAME rows already read: no extra request
    S.ly = S.calc.ok ? SO().computeLastYear(input) : null;
    S.unknownCur = S.calc.ok ? SO().eventUnknownKeys(S.calc) : {};
    S.unknownLy = S.ly && S.ly.ok ? SO().eventUnknownKeys(S.ly) : {};
    S.phase = S.calc.ok ? 'ready' : 'error'; S.error = S.calc.ok ? null : S.calc.reason;
    buildLineFilters();
    render();
  }

  // ---- filters ---------------------------------------------------------------------------------------------------------
  function mf(key, label, mountId, options) {
    var M = KM_().ui && KM_().ui.multiFilter, el = $(mountId);
    if (!M || !el) return;
    var all = options.map(function (o) { return String(o.value); });
    var keep = S.sel[key] === null ? all : S.sel[key].filter(function (v) { return all.indexOf(v) >= 0; });
    M.create({ mount: el, filterId: mountId, label: label, options: options, selectedValues: keep, emptyMeansAll: false, allText: 'All', noneText: 'None',
      onChange: function (vals) { onFilter(key, vals); } });
    S.opts[key] = all;
    S.sel[key] = keep.length === all.length ? null : keep;
  }
  function distinct(list) { var o = {}; list.forEach(function (v) { o[v] = 1; }); return Object.keys(o).sort(); }
  function buildSiteFilters() {
    mf('company', 'Company', 'so-f-company-mount', distinct(S.universe.map(function (s) { return s.company; })).map(function (v) { return { value: v, label: v }; }));
    mf('country', 'Country', 'so-f-country-mount', distinct(S.universe.map(function (s) { return s.country; })).map(function (v) { return { value: v, label: v }; }));
    mf('site', 'Marketplace', 'so-f-site-mount', S.universe.map(function (s) { return { value: s.key, label: s.company + ' · ' + s.country + ' · ' + s.marketplace }; }));
  }
  function buildLineFilters() {
    var L = S.calc && S.calc.ok ? S.calc.lines : [];
    function opts(get, lab) { return distinct(L.map(get)).map(function (v) { return { value: v, label: lab(v) }; }); }
    mf('category', 'Category', 'so-f-category-mount', opts(function (l) { return l.category === null ? UNCLASSIFIED : l.category; }, function (v) { return v === UNCLASSIFIED ? '(unclassified)' : v; }));
    mf('series', 'Series', 'so-f-series-mount', opts(function (l) { return l.series === null ? UNCLASSIFIED : l.series; }, function (v) { return v === UNCLASSIFIED ? '(unclassified)' : v; }));
    mf('currency', 'Currency', 'so-f-currency-mount', opts(function (l) { return l.currency === null ? NO_CURRENCY : String(l.currency).toUpperCase(); }, function (v) { return v === NO_CURRENCY ? '(no currency)' : v; }));
  }
  function onFilter(key, vals) {
    if (!S) return;
    var all = S.opts[key] || [];
    // every option ticked = no narrowing (null); a subset = that subset; none = nothing (emptyMeansAll:false)
    S.sel[key] = (all.length && all.every(function (v) { return vals.indexOf(v) >= 0; })) ? null : vals.slice();
    S.skuPage = 0;
    if (key === 'company' || key === 'country' || key === 'site') load(S.epoch, false);   // the sites read changes
    else render();                                                                           // a view of the same lines
  }
  function visibleLines(res) {
    if (!res || !res.ok) return [];
    var sel = S.sel;
    return res.lines.filter(function (l) {
      var c = l.category === null ? UNCLASSIFIED : l.category, s = l.series === null ? UNCLASSIFIED : l.series, cur = l.currency === null ? NO_CURRENCY : String(l.currency).toUpperCase();
      return (sel.category === null || sel.category.indexOf(c) >= 0) && (sel.series === null || sel.series.indexOf(s) >= 0) && (sel.currency === null || sel.currency.indexOf(cur) >= 0);
    });
  }

  // ---- binding ---------------------------------------------------------------------------------------------------------
  function bind(sec) {
    on($('soDateTrigger'), 'click', openModal);
    on($('soDateBackdrop'), 'click', function () { closeModal(false); });
    on($('soDateCancel'), 'click', function () { closeModal(false); });
    on($('soDateApply'), 'click', applyModal);
    on(document, 'keydown', function (e) { if (e.key === 'Escape' && $('soDateModal') && $('soDateModal').classList.contains('is-open')) closeModal(false); });
    on($('soDateModal'), 'click', function (e) {
      var p = e.target.closest && e.target.closest('[data-so-preset]'); if (p) { preset(p.getAttribute('data-so-preset')); return; }
      var n = e.target.closest && e.target.closest('[data-so-nav]'); if (n) { navCal(n.getAttribute('data-so-nav')); return; }
      var d = e.target.closest && e.target.closest('[data-so-day]'); if (d) dayClick(d.getAttribute('data-so-day'), d.getAttribute('data-so-cal'));
    });
    on($('soDateModal'), 'keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var p = e.target.closest && e.target.closest('[data-so-preset]'); if (p) { e.preventDefault(); preset(p.getAttribute('data-so-preset')); }
      var d = e.target.closest && e.target.closest('[data-so-day]'); if (d) { e.preventDefault(); dayClick(d.getAttribute('data-so-day'), d.getAttribute('data-so-cal')); }
    });
    on(sec, 'click', function (e) {
      var t = e.target.closest && e.target.closest('[data-so-tab],[data-so-expand],[data-so-sort],[data-so-page],[data-so-evdim]');
      if (!t || !S) return;
      if (t.hasAttribute('data-so-tab')) { setTab(t.getAttribute('data-so-tab')); return; }
      if (t.hasAttribute('data-so-expand')) { var k = t.getAttribute('data-so-expand'); S.expanded[k] = !S.expanded[k]; render(); return; }
      if (t.hasAttribute('data-so-sort')) { var p = t.getAttribute('data-so-sort').split(':'), cur = S.sort[p[0]]; S.sort[p[0]] = [p[1], cur && cur[0] === p[1] ? -cur[1] : (p[1] === 'sku' || p[1] === 'name' ? 1 : -1)]; render(); return; }
      if (t.hasAttribute('data-so-evdim')) { S.evDim = t.getAttribute('data-so-evdim'); render(); return; }
      if (t.hasAttribute('data-so-page')) { S.skuPage = Math.max(0, S.skuPage + (+t.getAttribute('data-so-page'))); render(); }
    });
    on($('soSkuSearch'), 'input', function (e) { if (!S || S.phase !== 'ready') return; S.skuQuery = String(e.target.value || '').trim().toUpperCase(); S.skuPage = 0;
      renderSku(visibleLines(S.calc).filter(isReg), visibleLines(S.ly).filter(isReg)); });   // this table only
    on($('soRefresh'), 'click', function () { if (S && S.universe) load(S.epoch, true); });
  }
  function setTab(tab) {
    if (tab !== 'raw' && tab !== 'target') return;
    S.tab = tab;                                    // same query, same lines: only the read-out changes
    [['soTabRaw', 'raw'], ['soTabTarget', 'target']].forEach(function (x) { var b = $(x[0]); if (!b) return; b.classList.toggle('so-tab--active', x[1] === tab); b.setAttribute('aria-selected', x[1] === tab ? 'true' : 'false'); });
    render();
  }

  // ---- the month picker: Forecast Review's interaction, whole months -------------------------------------------------------
  function updateTrigger() { var t = $('soDateTriggerText'); if (t && S) t.textContent = rangeLabel(S.from, S.to); }
  function openModal() {
    if (!S) return;
    S.lastFocus = document.activeElement;
    S.temp = { from: S.from, to: S.to, preset: S.preset };
    S.cal = { start: S.from, end: S.to === S.from ? ymAdd(S.from, 1) : S.to };
    $('soDateBackdrop').classList.add('is-open'); $('soDateModal').classList.add('is-open');
    renderModal();
    var first = $('soDateModal').querySelector('.so-preset-item'); if (first && first.focus) first.focus();
  }
  function closeModal(silent) {
    var m = $('soDateModal'), b = $('soDateBackdrop');
    if (m) m.classList.remove('is-open'); if (b) b.classList.remove('is-open');
    if (!silent && S && S.lastFocus && S.lastFocus.focus) S.lastFocus.focus();
  }
  function applyModal() {
    if (!S || !S.temp) return;
    var r = SO().monthRange(S.temp.from, S.temp.to);
    if (!r.ok) { $('soDateSummary').textContent = r.reason === 'RANGE_TOO_LONG' ? 'At most ' + SO().MONTH_RANGE_MAX + ' months' : 'Choose a valid range'; return; }
    S.from = S.temp.from; S.to = S.temp.to; S.preset = S.temp.preset;
    updateTrigger(); closeModal(false); S.skuPage = 0;
    if (S.read) recompute(); else render();       // months need no new read: the sources are per site, not per month
  }
  function preset(name) {
    var t = nowYm(), y = +t.slice(0, 4), map = { 'this-month': [t, t], 'next-month': [ymAdd(t, 1), ymAdd(t, 1)], 'next-3-months': [t, ymAdd(t, 2)], 'next-6-months': [t, ymAdd(t, 5)],
      'next-12-months': [t, ymAdd(t, 11)], 'rest-of-year': [t, y + '-12'], 'next-year': [(y + 1) + '-01', (y + 1) + '-12'] };
    if (!map[name]) return;
    S.temp = { from: map[name][0], to: map[name][1], preset: name };
    S.cal = { start: S.temp.from, end: S.temp.to === S.temp.from ? ymAdd(S.temp.from, 1) : S.temp.to };
    renderModal();
  }
  function navCal(n) { var k = n.indexOf('start') >= 0 ? 'start' : 'end'; S.cal[k] = ymAdd(S.cal[k], n.indexOf('prev') === 0 ? -1 : 1); renderModal(); }
  function dayClick(day, cal) {
    var ym = day.slice(0, 7), t = S.temp;
    if (cal === 'start') { if (ym > t.to) { t.from = t.to; t.to = ym; } else t.from = ym; }
    else { if (ym < t.from) { t.to = t.from; t.from = ym; } else t.to = ym; }
    t.preset = null; renderModal();
  }
  function renderModal() {
    var t = S.temp;
    $('soStartDisplay').value = ymLabel(t.from); $('soEndDisplay').value = ymLabel(t.to);
    var n = SO().monthRange(t.from, t.to);
    $('soDateSummary').textContent = n.ok ? rangeLabel(t.from, t.to) + ' · ' + n.months.length + (n.months.length === 1 ? ' month' : ' months') : (n.reason === 'RANGE_TOO_LONG' ? 'At most ' + SO().MONTH_RANGE_MAX + ' months' : '');
    Array.prototype.forEach.call($('soDateModal').querySelectorAll('.so-preset-item'), function (el) { el.classList.toggle('is-active', el.getAttribute('data-so-preset') === t.preset); });
    ['start', 'end'].forEach(function (k) {
      var ym = S.cal[k], p = ymParts(ym), cap = k === 'start' ? 'Start' : 'End';
      $('soCalendar' + cap + 'Title').textContent = MONTH_LONG[p.m - 1] + ' ' + p.y;
      var first = new Date(p.y, p.m - 1, 1).getDay(), days = new Date(p.y, p.m, 0).getDate(), today = new Date(), html = '';
      ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function (w) { html += '<div class="fr-calendar-weekday">' + w + '</div>'; });
      for (var i = 0; i < first; i++) html += '<div class="fr-calendar-day is-disabled"></div>';
      for (var d = 1; d <= days; d++) {
        var cls = ['fr-calendar-day'];
        // whole months: every day of the first month to every day of the last month is in the range
        if (ym === t.from && d === 1) cls.push('is-start');
        if (ym === t.to && d === days) cls.push('is-end');
        if (ym >= t.from && ym <= t.to && !(ym === t.from && d === 1) && !(ym === t.to && d === days)) cls.push('is-in-range');
        if (today.getFullYear() === p.y && today.getMonth() + 1 === p.m && today.getDate() === d) cls.push('is-today');
        html += '<div class="' + cls.join(' ') + '" role="button" tabindex="0" data-so-day="' + ym + '-' + pad2(d) + '" data-so-cal="' + k + '">' + d + '</div>';
      }
      $('soCalendar' + cap + 'Body').innerHTML = html;
    });
  }

  // ---- render (R3: overview, Regular Forecast, Special Event, data completeness) --------------------------------------------
  function status(html) { var el = $('soStatus'); if (el) el.innerHTML = html; }
  function isReg(l) { return l.component === 'REGULAR'; }
  function isEvt(l) { return l.component === 'EVENT'; }
  function curOf(l) { return l.currency === null ? NO_CURRENCY : String(l.currency).toUpperCase(); }
  function unitsWord() { return S.tab === 'target' ? 'Target Units' : 'FC Units'; }
  function salesWord() { return S.tab === 'target' ? 'Target Sales' : 'FC Sales'; }
  function lyRange() { var r = SO().comparisonRange(S.from, S.to); return rangeLabel(r.from, r.to); }
  // Units YoY for a group: this period's lines and last year's lines of the SAME group
  function yoy(cur, ly) { return SO().yoyUnits(cur, ly, S.tab, S.unknownCur, S.unknownLy); }
  function yoyCell(y) {
    var pct = y.pct === null ? null : (y.pct > 0 ? '+' : y.pct < 0 ? '−' : '') + Math.abs(y.pct).toFixed(1) + '%';
    var txt = { UP: '▲ ' + pct + ' up', DOWN: '▼ ' + pct + ' down', FLAT: '= 0.0% flat', NEW_ZERO_BASE: 'new (last year 0, no %)', FLAT_ZERO_BASE: 'flat (base 0, no %)', NOT_COMPARABLE: '— not comparable' }[y.state];
    var cls = { UP: 'up', DOWN: 'down', FLAT: 'flat' }[y.state] || 'na';
    var cov = (y.state !== 'NOT_COMPARABLE' && !y.complete) ? '<span class="so-cov" title="' + esc(Object.keys(y.reasons).map(function (k) { return k + ' ' + y.reasons[k]; }).join(', ')) + '">on ' + y.comparable + ' of ' + y.pairs + ' comparable month(s): ' + fmtQty(y.cur) + ' vs ' + fmtQty(y.ly) + '</span>' : '';
    return '<span class="so-yoy so-yoy--' + cls + '">' + esc(txt) + '</span>' + cov;
  }
  function lyCell(y) { return y.state === 'NOT_COMPARABLE' ? '<span class="so-missing">—</span>' : fmtQty(y.ly) + (y.complete ? '' : '<span class="so-cov">comparable part</span>'); }
  function render() {
    if (!S || !$(SECTION)) return;
    var note = $('soTabNote');
    if (note) note.textContent = S.tab === 'raw' ? 'Original FC estimate · Special Events at 100% · compared: this period FC vs last year FC'
      : 'Regular FC × the month’s Target % (SKU › Series › Category, default 100%) · Special Events at 100% · compared: Target Units vs last year FC';
    if (S.phase === 'idle' || (S.phase === 'loading' && !S.progress)) { status('<div class="so-banner so-banner--info">Reading the list of sites you may choose from…</div>'); clearTables('Loading…'); return; }
    if (S.phase === 'loading') { status(progressHtml()); clearTables('Loading…'); return; }
    if (S.phase === 'choose') { status('<div class="so-banner so-banner--info">Choose one or more sites with Company / Country / Marketplace above (or All). Nothing is read until you choose.</div>'); clearTables('Choose sites'); return; }
    if (S.phase === 'error') { status('<div class="so-banner so-banner--error">The data could not be read (' + esc(S.error) + '). Nothing is shown rather than a total that looks complete.</div>'); clearTables('—'); return; }
    var lines = visibleLines(S.calc), ly = visibleLines(S.ly), c = S.calc, r = S.read;
    var failed = c.sites.filter(function (s) { return s.state !== 'READY' && s.state !== 'SOURCE_EMPTY'; });
    var tot = SO().aggregate(lines, S.tab, []), incomplete = tot.some(function (g) { return !g.complete; }) || failed.length > 0;
    var fcAt = r.fc.observedAt ? String(r.fc.observedAt).replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown';
    var h = '<div>' + esc(rangeLabel(S.from, S.to)) + ' compared with ' + esc(lyRange()) + ' (FC Units only) · ' + c.sites.length + ' site(s) · forecast read ' + esc(fcAt) + ' · current prices (no historical price) · ' + (r.requests || []).length + ' read request(s) this time</div>';
    if (!c.sites.length) h += '<div class="so-banner so-banner--info">No site is selected.</div>';
    if (failed.length) h += '<div class="so-banner so-banner--error">' + failed.length + ' site(s) not fully read: ' + failed.map(function (s) { return esc(s.company + ' · ' + s.country + ' · ' + s.marketplace) + ' (' + esc(s.state + (s.reason ? ' ' + s.reason : '')) + ')'; }).join('; ') + '. Their amounts are not in any total.</div>';
    if (incomplete) h += '<div class="so-banner">Some lines have no amount or no quantity (see Data completeness): every total below is a <b>computable subtotal</b>, not the complete estimated sales.</div>';
    var unchecked = tot.reduce(function (n, g) { return n + g.priceUnverified; }, 0);
    if (unchecked) h += '<div class="so-banner">' + unchecked + ' line(s) use an automatic regular price. This server does not report whether a manual price beside it is invalid, so those amounts are counted but no total holding them is called verified (AUTO_PRICE_OVERRIDE_UNVERIFIABLE).</div>';
    if (!lines.length && c.sites.length) h += '<div class="so-banner so-banner--info">No forecast in this range for the selected sites and filters.</div>';
    status(h);
    renderOverview(lines, ly); renderTrend(lines); renderRegular(lines.filter(isReg), ly.filter(isReg)); renderEvents(lines.filter(isEvt), ly.filter(isEvt)); renderIssues(lines);
  }
  function clearTables(text) {
    ['soOverviewTable', 'soSeriesTable', 'soCategoryTable', 'soSkuTable', 'soEventTable', 'soEventCmpTable', 'soIssuesTable'].forEach(function (id) { var t = $(id); if (t) t.innerHTML = '<tbody><tr><td class="so-missing">' + esc(text) + '</td></tr></tbody>'; });
    ['soTrend', 'soSkuPager', 'soEventPresence'].forEach(function (id) { var t = $(id); if (t) t.innerHTML = ''; });
    ['soOverviewNote', 'soSeriesNote', 'soCategoryNote', 'soSkuNote', 'soIssuesNote', 'soRegularNote', 'soEventNote', 'soEventListNote', 'soEventCmpNote'].forEach(function (id) { var t = $(id); if (t) t.textContent = ''; });
    var ev = $('soSectionEvent'); if (ev) ev.hidden = true;
  }
  function completeCell(g) {
    if (g.complete && g.verified === false) return '<span class="so-complete so-complete--partial" title="' + g.priceUnverified + ' line(s) on an automatic price whose manual cell this server cannot check">complete · ' + g.priceUnverified + ' price(s) unchecked</span>';
    if (g.complete) return '<span class="so-complete">complete</span>';
    return '<span class="so-complete so-complete--partial" title="' + g.amountMissing + ' line(s) without an amount, ' + g.qtyMissing + ' without a quantity">' + (g.lines - g.amountMissing) + ' / ' + g.lines + ' lines priced</span>';
  }
  function sortRows(rows, spec, nameKey) {
    var k = spec[0], d = spec[1];
    return rows.slice().sort(function (a, b) {
      var x = k === 'name' ? String(a[nameKey]) : a[k], y = k === 'name' ? String(b[nameKey]) : b[k];
      if (x < y) return -d; if (x > y) return d; return String(a[nameKey]) < String(b[nameKey]) ? -1 : 1;
    });
  }
  function th(section, key, label, num) { var s = S.sort[section], arrow = s && s[0] === key ? (s[1] > 0 ? ' ▲' : ' ▼') : ''; return '<th' + (num ? ' class="km-num"' : '') + ' data-so-sort="' + section + ':' + key + '">' + esc(label) + arrow + '</th>'; }
  function byCurrency(groups) { var o = {}; groups.forEach(function (g) { var c = g.currency === null ? NO_CURRENCY : g.currency; (o[c] = o[c] || []).push(g); }); return o; }
  function pick(lines, pred) { return lines.filter(pred); }

  // OVERVIEW: per currency, then per site — Units and Sales, the Regular / Special Event split, last year's FC Units
  function renderOverview(lines, ly) {
    $('soOverviewTitle').textContent = S.tab === 'target' ? 'Overview — Target Units and Target Sales' : 'Overview — FC Units and FC Sales (original forecast, no Target %)';
    var t = $('soOverviewTable'), html = '<thead><tr>' + th('sites', 'name', 'Site') + '<th>Currency</th>' + th('sites', 'qty', unitsWord(), 1) + th('sites', 'amount', salesWord(), 1)
      + '<th class="km-num so-reg">Regular units / sales</th><th class="km-num so-evt">Special Event units / sales</th><th class="km-num">Last year FC Units</th><th>Units YoY</th><th>Completeness</th></tr></thead><tbody>';
    var byCur = byCurrency(SO().aggregate(lines, S.tab, []));
    var curs = distinct(lines.map(curOf));
    curs.forEach(function (cur) {
      var cl = pick(lines, function (l) { return curOf(l) === cur; }), cly = pick(ly, function (l) { return curOf(l) === cur; });
      sortRows(SO().aggregate(cl, S.tab, ['site']), S.sort.sites, 'site').forEach(function (g) {
        var y = yoy(pick(cl, function (l) { return l.site === g.site; }), pick(cly, function (l) { return l.site === g.site; }));
        html += '<tr><td>' + siteLabel(g.site) + '</td>' + row(g, y) + '</tr>';
      });
      var sub = (byCur[cur] || [])[0];
      if (sub) html += '<tr class="so-row--subtotal"><td>' + (sub.complete ? (sub.verified === false ? 'Total (prices not all checked)' : 'Total') : 'Computable subtotal') + '</td>' + row(sub, yoy(cl, cly)) + '</tr>';
    });
    function row(g, y) {
      return '<td>' + curLabel(g.currency) + '</td><td class="km-num">' + fmtQty(g.qty) + '</td><td class="km-num">' + fmtAmt(g.amount, g.currency) + '</td>'
        + '<td class="km-num so-reg">' + fmtQty(g.regularQty) + ' / ' + fmtAmt(g.regularAmount, g.currency) + '</td><td class="km-num so-evt">' + fmtQty(g.eventQty) + ' / ' + fmtAmt(g.eventAmount, g.currency) + '</td>'
        + '<td class="km-num">' + lyCell(y) + '</td><td>' + yoyCell(y) + '</td><td>' + completeCell(g) + '</td>';
    }
    if (!curs.length) html += '<tr><td colspan="9" class="so-missing">No forecast in this range.</td></tr>';
    t.innerHTML = html + '</tbody>';
    $('soOverviewNote').textContent = 'Per site and currency; currencies are never added together. Last year = the stored original FC Units of ' + lyRange() + '; the rate is computed from summed units, never averaged.';
  }
  function renderTrend(lines) {
    var el = $('soTrend'); if (!el) return;
    var months = S.calc.months, groups = byCurrency(SO().aggregate(lines, S.tab, ['month', 'component'])), html = '';
    Object.keys(groups).sort().forEach(function (cur) {
      var reg = {}, evt = {}, ru = {}, eu = {}; months.forEach(function (m) { reg[m] = 0; evt[m] = 0; ru[m] = 0; eu[m] = 0; });
      groups[cur].forEach(function (g) { if (g.component === 'EVENT') { evt[g.month] += g.amount; eu[g.month] += g.qty; } else { reg[g.month] += g.amount; ru[g.month] += g.qty; } });
      var max = Math.max.apply(null, months.map(function (m) { return reg[m] + evt[m]; }).concat([0])), W = 100 / Math.max(months.length, 1), svg = '';
      months.forEach(function (m, i) {
        var rh = max > 0 ? reg[m] / max * 80 : 0, eh = max > 0 ? evt[m] / max * 80 : 0, x = i * W + W * 0.15, bw = W * 0.7;
        var tip = ymLabel(m) + ' · Regular ' + fmtQty(ru[m]).replace(/<[^>]+>/g, '') + ' units / ' + fmtAmt(reg[m], cur).replace(/<[^>]+>/g, '') + ' · Special Event ' + fmtQty(eu[m]).replace(/<[^>]+>/g, '') + ' units / ' + fmtAmt(evt[m], cur).replace(/<[^>]+>/g, '');
        svg += '<rect x="' + x + '%" y="' + (90 - rh) + '" width="' + bw + '%" height="' + rh + '" fill="#475569"><title>' + esc(tip) + '</title></rect>';
        svg += '<rect x="' + x + '%" y="' + (90 - rh - eh) + '" width="' + bw + '%" height="' + eh + '" fill="#FF8C42"><title>' + esc(tip) + '</title></rect>';
      });
      // the month names sit in HTML under the bars: SVG text inside a stretched viewBox is stretched with it
      var axis = '<div class="so-trend-x">' + months.map(function (m) { var p = ymParts(m); return '<span>' + (months.length <= 12 ? MON[p.m - 1] + (p.m === 1 || m === months[0] ? ' ' + String(p.y).slice(2) : '') : '') + '</span>'; }).join('') + '</div>';
      html += '<div class="so-trend-cur"><h4>' + esc(salesWord()) + ' by month, ' + curLabel(cur) + ' <span class="so-legend"><i style="background:#475569"></i>Regular<i style="background:#FF8C42"></i>Special Event</span></h4><svg viewBox="0 0 100 92" preserveAspectRatio="none" role="img" aria-label="' + esc(salesWord()) + ' by month">' + svg + '</svg>' + axis + '</div>';
    });
    el.innerHTML = html;
  }

  // REGULAR FORECAST: Series, Category, SKU — this period / last year FC / Units YoY, plus this period's sales
  function renderRegular(lines, ly) {
    $('soRegularNote').textContent = (S.tab === 'target' ? 'Target Units (Regular FC × Target %)' : 'FC Units (original)') + ' vs last year’s stored FC Units, same months one year earlier';
    ['series', 'category'].forEach(function (dim) { renderDim(dim, lines, ly); });
    renderSku(lines, ly);
  }
  function dimCols(g, y, denom) {
    return '<td>' + curLabel(g.currency) + '</td><td class="km-num">' + fmtQty(g.qty) + '</td><td class="km-num">' + lyCell(y) + '</td><td>' + yoyCell(y) + '</td>'
      + '<td class="km-num">' + fmtAmt(g.amount, g.currency) + '</td><td class="km-num">' + (denom > 0 ? (g.amount / denom * 100).toFixed(1) + '%' : '—') + '</td><td>' + completeCell(g) + '</td>';
  }
  function dimHead(dim, label) { return '<thead><tr>' + th(dim, 'name', label) + '<th>Currency</th>' + th(dim, 'qty', unitsWord(), 1) + '<th class="km-num">Last year FC Units</th><th>Units YoY</th>' + th(dim, 'amount', salesWord(), 1) + '<th class="km-num">Share of sales</th><th>Completeness</th></tr></thead><tbody>'; }
  function renderDim(dim, lines, ly) {
    var t = $(dim === 'series' ? 'soSeriesTable' : 'soCategoryTable'), html = dimHead(dim, dim === 'series' ? 'Series' : 'Category'), anyPartial = false;
    function key(l) { return l[dim] === null ? UNCLASSIFIED : l[dim]; }
    distinct(lines.map(curOf)).forEach(function (cur) {
      var cl = pick(lines, function (l) { return curOf(l) === cur; }), cly = pick(ly, function (l) { return curOf(l) === cur; }), sub = SO().aggregate(cl, S.tab, [])[0];
      if (sub && !sub.complete) anyPartial = true;
      sortRows(SO().aggregate(cl, S.tab, [dim]), S.sort[dim], dim).forEach(function (g) {
        var k = 'reg:' + dim + ':' + g[dim] + ':' + cur, open = !!S.expanded[k];
        var gl = pick(cl, function (l) { return key(l) === g[dim]; }), gly = pick(cly, function (l) { return key(l) === g[dim]; });
        html += '<tr><td><button type="button" class="so-expand" data-so-expand="' + esc(k) + '" aria-expanded="' + open + '">' + (open ? '▾' : '▸') + '</button>' + dimLabel(g[dim]) + '</td>' + dimCols(g, yoy(gl, gly), sub ? sub.amount : 0) + '</tr>';
        if (open) sortRows(SO().aggregate(gl, S.tab, ['sku']), ['amount', -1], 'sku').forEach(function (s) {
          var sl = pick(gl, function (l) { return String(l.sku).toUpperCase() === s.sku; }), sly = pick(gly, function (l) { return String(l.sku).toUpperCase() === s.sku; });
          html += '<tr class="so-row--child"><td>' + esc(s.sku) + '</td>' + dimCols(s, yoy(sl, sly), sub ? sub.amount : 0) + '</tr>';
        });
      });
      if (sub) html += '<tr class="so-row--subtotal"><td>' + (sub.complete ? (sub.verified === false ? 'Total (prices not all checked)' : 'Total') : 'Computable subtotal') + '</td>' + dimCols(sub, yoy(cl, cly), sub.amount) + '</tr>';
    });
    if (!lines.length) html += '<tr><td colspan="8" class="so-missing">No Regular FC in this range.</td></tr>';
    t.innerHTML = html + '</tbody>';
    $(dim === 'series' ? 'soSeriesNote' : 'soCategoryNote').textContent = (anyPartial ? 'Share = of the computable subtotal in that currency. ' : 'Share = of the total in that currency. ') + 'Expand for SKUs; unclassified SKUs are their own group.';
  }
  function targetText(l) {
    if (l.component === 'EVENT') return '<span class="so-evt">event · 100%</span>';
    var t = l.target;
    if (t.pct === null) return '<span class="so-tag so-tag--warn">refused: ' + esc(t.reason) + '</span>';
    if (t.isDefault) return t.pct + '% <span class="so-tag so-tag--default">default · ' + esc(t.reason) + '</span>';
    return t.pct + '% <span class="so-tag">' + esc(t.scopeType + ' ' + t.scopeId) + '</span>';
  }
  function renderSku(lines, ly) {
    var t = $('soSkuTable'); if (!t || !S || !S.calc) return;
    var q = S.skuQuery, rows = lines.filter(function (l) { return !q || String(l.sku).toUpperCase().indexOf(q) >= 0; });
    var lyBy = {}; ly.forEach(function (l) { lyBy[l.site + '|' + String(l.sku).toUpperCase() + '|' + SO().shiftYm(l.month, 12)] = l; });
    var s = S.sort.sku, k = s[0], d = s[1];
    rows = rows.slice().sort(function (a, b) {
      var x = k === 'amount' ? (S.tab === 'target' ? a.amountTarget : a.amount) : k === 'qty' ? (S.tab === 'target' ? a.qtyTarget : a.qty) : String(a.sku).toUpperCase() + a.site + a.month;
      var y = k === 'amount' ? (S.tab === 'target' ? b.amountTarget : b.amount) : k === 'qty' ? (S.tab === 'target' ? b.qtyTarget : b.qty) : String(b.sku).toUpperCase() + b.site + b.month;
      if (x === null) x = -Infinity; if (y === null) y = -Infinity;
      return x < y ? -d : x > y ? d : 0;
    });
    var pages = Math.max(1, Math.ceil(rows.length / SKU_PAGE)); if (S.skuPage >= pages) S.skuPage = pages - 1;
    var view = rows.slice(S.skuPage * SKU_PAGE, (S.skuPage + 1) * SKU_PAGE);
    var html = '<thead><tr>' + th('sku', 'sku', 'SKU') + '<th>Site</th><th>Series</th><th>Category</th><th>Month</th>' + th('sku', 'qty', unitsWord(), 1) + '<th class="km-num">Last year FC Units</th><th>Units YoY</th><th class="km-num">Price</th><th>Cur.</th>' + th('sku', 'amount', salesWord(), 1) + '<th>Target</th><th>Notes</th></tr></thead><tbody>';
    view.forEach(function (l) {
      var id = 'sku:' + l.site + ':' + l.sku + ':' + l.month, open = !!S.expanded[id], m = lyBy[l.site + '|' + String(l.sku).toUpperCase() + '|' + l.month];
      var y = yoy([l], m ? [m] : []);
      html += '<tr><td><button type="button" class="so-expand" data-so-expand="' + esc(id) + '" aria-expanded="' + open + '">' + (open ? '▾' : '▸') + '</button>' + esc(l.sku) + '</td><td>' + siteLabel(l.site) + '</td><td>' + dimLabel(l.series) + '</td><td>' + dimLabel(l.category) + '</td><td>' + esc(ymLabel(l.month)) + '</td>'
        + '<td class="km-num">' + fmtQty(S.tab === 'target' ? l.qtyTarget : l.qty) + '</td><td class="km-num">' + lyCell(y) + '</td><td>' + yoyCell(y) + '</td><td class="km-num">' + fmtAmt(l.price, l.currency) + '</td><td>' + curLabel(l.currency) + '</td><td class="km-num">' + fmtAmt(S.tab === 'target' ? l.amountTarget : l.amount, l.currency) + '</td><td>' + targetText(l) + '</td><td>'
        + l.issues.map(function (c) { return '<span class="so-tag so-tag--warn">' + esc(c) + '</span>'; }).join('') + (m ? '' : '<span class="so-tag so-tag--warn">NO_LAST_YEAR_LINE</span>') + '</td></tr>';
      if (open) html += '<tr class="so-row--detail"><td colspan="13"><div class="so-formula">' + explain(l) + (m ? '<br>Last year (' + esc(ymLabel(m.month)) + '): stored FC ' + fmtQty(m.qty) + (m.qty === null ? ' (' + esc(m.base.state) + ')' : '') + ' — the original FC, never adjusted by this year’s Target %' : '') + '</div></td></tr>';
    });
    if (!view.length) html += '<tr><td colspan="13" class="so-missing">No line matches.</td></tr>';
    t.innerHTML = html + '</tbody>';
    var pg = $('soSkuPager');
    if (pg) pg.innerHTML = rows.length > SKU_PAGE ? '<button type="button" class="so-btn" data-so-page="-1"' + (S.skuPage ? '' : ' disabled') + '>‹</button><span>' + (S.skuPage + 1) + ' / ' + pages + '</span><button type="button" class="so-btn" data-so-page="1"' + (S.skuPage + 1 < pages ? '' : ' disabled') + '>›</button>' : '';
    var tot = SO().aggregate(rows, S.tab, []);
    $('soSkuNote').textContent = rows.length + ' Regular line(s)' + (q ? ' matching "' + q + '"' : '') + ' · ' + tot.map(function (g) { return (g.currency || 'no currency') + ' ' + fmtAmt(g.amount, g.currency).replace(/<[^>]+>/g, '') + (g.complete ? '' : ' (computable)'); }).join(' · ') + ' — this search narrows this table only.';
  }

  // SPECIAL EVENT: one item per real event (its own identity), the overlapping days only; a period comparison with last year
  function renderEvents(lines, ly) {
    var sec = $('soSectionEvent'), pres = $('soEventPresence'), evDiag = S.calc.diagnostics.filter(function (d) { return d.event; });
    var groups = SO().aggregate(lines, S.tab, ['campaign']);
    var p = groups.length ? groups.length + ' Special Event(s) overlap ' + esc(rangeLabel(S.from, S.to)) + ' — see the Special Event section.' : 'No eligible Special Event overlaps ' + esc(rangeLabel(S.from, S.to)) + '.';
    if (evDiag.length) p += ' <span class="so-tag so-tag--warn">' + evDiag.length + ' event row(s) could not be evaluated</span> (Data completeness) — this is not the same as "no event".';
    pres.innerHTML = p;
    sec.hidden = !groups.length;
    if (!groups.length) return;
    function ck(l) { return l.site + '|' + l.event.campaign_id; }
    var meta = {}; lines.forEach(function (l) { meta[ck(l)] = l; });
    var html = '<thead><tr><th>Event</th><th>Site</th><th>Window</th><th>Campaign</th><th>Currency</th><th class="km-num">Units in period</th><th class="km-num">Sales in period</th><th>Basis</th><th class="km-num">Last year</th></tr></thead><tbody>';
    groups.sort(function (a, b) { var x = meta[a.campaign].event.start + a.campaign, y = meta[b.campaign].event.start + b.campaign; return x < y ? -1 : 1; }).forEach(function (g) {
      var m = meta[g.campaign], e = m.event, k = 'evt:' + g.campaign + ':' + (g.currency || ''), open = !!S.expanded[k], mine = lines.filter(function (l) { return ck(l) === g.campaign; });
      var est = mine.some(function (l) { return l.event.estimate; });
      html += '<tr><td><button type="button" class="so-expand" data-so-expand="' + esc(k) + '" aria-expanded="' + open + '">' + (open ? '▾' : '▸') + '</button><span class="so-evt">' + esc(e.name || 'Special Event') + '</span> <span class="so-tag">' + esc(e.campaign_id) + '</span> <span class="so-block-note">' + distinct(mine.map(function (l) { return String(l.sku).toUpperCase(); })).length + ' SKU(s)</span></td>'
        + '<td>' + siteLabel(m.site) + '</td><td>' + esc(e.start) + ' → ' + esc(e.end) + '</td><td>' + esc(e.campaign_status) + '</td><td>' + curLabel(g.currency) + '</td>'
        + '<td class="km-num">' + fmtQty(g.qty) + '</td><td class="km-num">' + fmtAmt(g.amount, g.currency) + '</td><td>' + (est ? '<span class="so-tag so-tag--est">est. by days</span>' : (e.basis === 'EXPLICIT_MONTHLY' ? 'monthly allocation' : 'within one month')) + '</td>'
        + '<td class="km-num"><span class="so-missing" title="No field links a campaign to last year’s; see the period comparison below">no link</span></td></tr>';
      if (open) {
        sortRows(SO().aggregate(mine, S.tab, ['sku']), ['amount', -1], 'sku').forEach(function (s) {
          var one = mine.filter(function (l) { return String(l.sku).toUpperCase() === s.sku; })[0];
          html += '<tr class="so-row--child"><td>' + esc(s.sku) + '</td><td>' + dimLabel(one.series) + ' · ' + dimLabel(one.category) + '</td><td colspan="2">' + mine.filter(function (l) { return String(l.sku).toUpperCase() === s.sku; }).map(function (l) { return esc(ymLabel(l.month)) + ': ' + l.event.days + ' of ' + l.event.total_days + ' day(s)'; }).join(' · ') + '</td><td>' + curLabel(s.currency) + '</td><td class="km-num">' + fmtQty(s.qty) + '</td><td class="km-num">' + fmtAmt(s.amount, s.currency) + '</td><td colspan="2"></td></tr>';
        });
      }
    });
    $('soEventTable').innerHTML = html + '</tbody>';
    $('soEventNote').textContent = 'Event FC at 100% in both tabs; only the days inside the selected months are counted.';
    $('soEventListNote').textContent = groups.length + ' event(s), one item per campaign and site; an event across two selected months is one item; different campaigns stay separate even with the same name. Expand for its SKUs.';
    renderEventCmp(lines, ly);
  }
  function renderEventCmp(lines, ly) {
    var dim = S.evDim || 'series', t = $('soEventCmpTable');
    function key(l) { return dim === 'sku' ? String(l.sku).toUpperCase() : (l[dim] === null ? UNCLASSIFIED : l[dim]); }
    var html = '<thead><tr><th>' + esc(dim === 'sku' ? 'SKU' : dim === 'series' ? 'Series' : 'Category') + '</th><th>Currency</th><th class="km-num">Event units this period</th><th class="km-num">Event FC units, same months last year</th><th>Units YoY</th></tr></thead><tbody>';
    var all = lines.concat(ly), keys = {};
    all.forEach(function (l) { keys[curOf(l) + '\u0001' + key(l)] = 1; });
    Object.keys(keys).sort().forEach(function (kk) {
      var p = kk.split('\u0001'), cur = p[0], v = p[1];
      var a = lines.filter(function (l) { return curOf(l) === cur && key(l) === v; }), b = ly.filter(function (l) { return curOf(l) === cur && key(l) === v; }), y = yoy(a, b);
      html += '<tr><td>' + dimLabel(v) + '</td><td>' + curLabel(cur) + '</td><td class="km-num">' + fmtQty(a.reduce(function (s, l) { return s + (l.qty || 0); }, 0)) + '</td><td class="km-num">' + lyCell(y) + '</td><td>' + yoyCell(y) + '</td></tr>';
    });
    t.innerHTML = html + '</tbody>';
    $('soEventCmpNote').textContent = 'A comparison of PERIODS (' + rangeLabel(S.from, S.to) + ' vs ' + lyRange() + '): no field links one year’s campaign to the next, so this never claims "the same event".';
    Array.prototype.forEach.call(document.querySelectorAll('#soSectionEvent [data-so-evdim]'), function (b) { b.classList.toggle('so-seg-btn--on', b.getAttribute('data-so-evdim') === dim); });
  }
  function explain(l) {
    var p = [];
    p.push(esc(l.sku) + ' · ' + siteLabel(l.site) + ' · ' + esc(ymLabel(l.month)) + (l.marketplace_sku_id ? ' · listing ' + esc(l.marketplace_sku_id) : ' · no single listing on this site'));
    var b = l.base, t = l.target;
    p.push('Regular FC ' + (l.qty === null ? '— (' + esc(b.state) + (b.values ? ': ' + esc(b.values.join(' vs ')) : '') + ')' : fmtQty(l.qty)) + (b.rows > 1 ? ' from ' + b.rows + ' rows (' + esc(b.state) + ')' : ''));
    p.push('Target ' + (t.pct === null ? 'refused (' + esc(t.reason) + ') → no adjusted quantity' : t.pct + '% ' + (t.isDefault ? '(default, ' + esc(t.reason) + ')' : '(' + esc(t.scopeType + ' ' + t.scopeId) + ', rule ' + esc(t.ruleId) + ', column ' + esc(t.sourceMonth) + ')') + ' → round(' + fmtQty(l.qty) + ' × ' + t.pct + ' / 100) = ' + fmtQty(l.qtyTarget)));
    p.push('Price ' + (l.price === null ? '— ' : fmtAmt(l.price, l.currency) + ' ' + curLabel(l.currency)) + ' (current regular price' + (l.priceSource ? ', ' + esc(l.priceSource) : '') + ')');
    p.push('Original: ' + fmtQty(l.qty) + ' × ' + fmtAmt(l.price, l.currency) + ' = ' + fmtAmt(l.amount, l.currency) + ' · With Target: ' + fmtQty(l.qtyTarget) + ' × ' + fmtAmt(l.price, l.currency) + ' = ' + fmtAmt(l.amountTarget, l.currency));
    if (l.issues.length) p.push('Not counted / warnings: ' + l.issues.map(esc).join(', '));
    return p.join('<br>');
  }
  function renderIssues(lines) {
    var t = $('soIssuesTable'), c = S.calc, counts = {};
    function add(code, kind, ex) { var x = counts[code] = counts[code] || { code: code, kind: kind, n: 0, ex: [] }; x.n++; if (x.ex.length < 3 && ex) x.ex.push(ex); }
    lines.forEach(function (l) { l.issues.forEach(function (code) { add(code, 'line', l.sku + ' · ' + (S.siteNames[l.site] || l.site) + ' · ' + l.month); }); });
    c.diagnostics.forEach(function (d) { add(d.code, 'source', [d.sku, d.site && (S.siteNames[d.site] || d.site), d.event, d.year].filter(Boolean).join(' · ')); });
    var rows = Object.keys(counts).sort().map(function (k) { return counts[k]; }), html = '<thead><tr><th>Finding</th><th>Where</th><th class="km-num">Count</th><th>Examples</th></tr></thead><tbody>';
    rows.forEach(function (x) { html += '<tr><td><span class="so-tag so-tag--warn">' + esc(x.code) + '</span></td><td>' + (x.kind === 'line' ? 'a counted line (no amount or a warning)' : 'not counted') + '</td><td class="km-num">' + x.n + '</td><td>' + x.ex.map(esc).join('<br>') + '</td></tr>'; });
    c.notices.forEach(function (n) { html += '<tr><td><span class="so-tag">' + esc(n.code) + '</span></td><td>method</td><td></td><td>' + esc(n.detail) + '</td></tr>'; });
    html += '<tr><td><span class="so-tag">LAST_YEAR_IS_FC_UNITS_ONLY</span></td><td>method</td><td></td><td>' + esc('The comparison is last year’s stored original FC Units for ' + lyRange() + ' — no last-year sales, no actuals, no Target % applied to last year.') + '</td></tr>';
    if (!rows.length) html += '<tr><td colspan="4">No data gap in the selected range and filters.</td></tr>';
    t.innerHTML = html + '</tbody>';
    var priced = lines.filter(function (l) { return (S.tab === 'target' ? l.amountTarget : l.amount) !== null; }).length;
    $('soIssuesNote').textContent = priced + ' of ' + lines.length + ' line(s) carry an amount in this tab (' + (lines.length ? Math.round(priced / lines.length * 100) : 100) + '%).';
  }

  // ---- registration ----------------------------------------------------------------------------------------------------
  var LC = KM_().lifecycle;
  if (LC && typeof LC.register === 'function') LC.register(SECTION, { mount: mount, unmount: unmount });
  window.KM = window.KM || {};
  window.KM.salesOutlookPage = { SECTION: SECTION, PARTIAL: PARTIAL, _state: function () { return S; } };
})();
