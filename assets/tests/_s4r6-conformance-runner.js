/**
 * ==================================================================================================
 * S4-R6 — THE SYSTEM-WIDE CONFORMANCE RUNNER
 * ==================================================================================================
 *
 * S4-R1 asked every route ONE question — what does entering cost. R2, R3, R4 and R5 each answered a
 * deep question about a few pages. This runner asks EVERY route the questions those rounds proved
 * worth asking, so a page can be marked PASS on evidence rather than on not having been looked at.
 *
 * FOUR MODES, each a separate browser run over the same world:
 *
 *   probe    Ground truth for "useful". S4-R1's route table names a CSS selector per route, and
 *            several of those selectors are wrong: `#factory-stock-fixed-body tr` returns 0 on a
 *            page that renders forty `.fixed-row` DIVs, so R1 recorded `useful: 0` for a fully
 *            populated table. Rather than guess a replacement, this mode enters each route and
 *            reports a BATTERY of candidate selectors plus the section's own heaviest containers.
 *            The route table's `useful` selectors are then derived from what the pages actually
 *            render, and the derivation is on the record.
 *
 *   drift    §7 lifecycle, for all 21 routes, using S4-R2's target-classified probe rather than
 *            R1's net call ledger. Three mount/unmount cycles: the MARGINAL delta between cycle 2
 *            and cycle 3 is the drift, because first-mount registrations are a fixed cost that no
 *            amount of navigating repeats. Listeners on detached elements are reported and are NOT
 *            counted as drift — that distinction is the reason R2 replaced R1's counter.
 *
 *   expand   §6 / §1A. For every master-detail workspace: does the expanded row's data come from
 *            the model already in memory, or from the network. Measured by counting requests across
 *            the expand itself, and by whether the detail DOM exists in the same task as the click.
 *
 *   states   §7 error truth. One forced read failure per page that has a scoped read, then Retry.
 *            Asks three things a page can get wrong independently: does a failure render as EMPTY,
 *            does Retry dispatch exactly one real request, and does a failed REFRESH destroy a
 *            last-good model the page had already painted.
 *
 * WHAT IS AUTHORITATIVE, and it is the same list every S4 round has published: request counts,
 * dispatch counts, DOM outcomes, listener counts by target class. WHAT IS NOT: milliseconds. The
 * virtual clock freezes while a task runs, which S4-R1 measured rather than assumed.
 *
 * WHAT THIS RUNNER DOES NOT CLAIM: visual fidelity of anything. It counts and it reads the DOM.
 *
 * USAGE:  node assets/tests/_s4r6-conformance-runner.js <mode> [serverMs]   → one JSON blob
 * A helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const R11 = require('./_s3r11-interaction-runner.js');
const R2 = require('./_s4r2-reentry-runner.js');

const ROOT = path.join(__dirname, '..', '..');

/* ---------------------------------------------------------------------------------------------
   THE ROUTE TABLE.

   RE-DERIVED, not inherited. §2 asks for the current user-visible route set and says not to reuse
   S4-R1's number blindly, so this table is rebuilt from the two authorities that decide what a user
   can reach: the `onclick` handlers in index.html's sidebar, and `KM_STAGED_SECTIONS_` in app.js
   for the one section whose menu is built at boot rather than written in the markup.

   It agrees with S4-R1 at 21 and the agreement is a result, not an assumption. Excluded, with the
   reason beside each: Overseas Inbound and Overseas Outbound (markup disabled AND refused by name
   inside showSection — two gates, neither reachable), the three `menu-item--disabled` Pricing and
   SKU planned items (no handler at all), and `shippinghistory` (NOT a separate route: it is the
   section `shipment-overview` makes visible, and §2 says not to double-count shared route owners).

   `useful` is what it means for the page to have something to say. Derived from the `probe` mode
   below rather than guessed — see the comment there.
   --------------------------------------------------------------------------------------------- */
const ROUTES = [
  { key: 'ops',                     section: 'ops-section',                     label: 'Site Inventory (Inventory Replenishment)', menu: 'Warehouse Stock' },
  { key: 'factory-stock',           section: 'factory-stock-section',           label: 'Factory Inventory',        menu: 'Warehouse Stock' },
  { key: 'overseas-stock',          section: 'overseas-stock-section',          label: 'Overseas Inventory',       menu: 'Warehouse Stock' },
  { key: 'forecast',                section: 'forecast-section',                label: 'Forecast',                 menu: 'Forecast' },
  { key: 'fc-summary',              section: 'fc-summary-section',              label: 'FC Summary',               menu: 'Forecast' },
  { key: 'request-order',           section: 'request-order-section',           label: 'Order Planning',           menu: 'Forecast' },
  { key: 'shippingplan',            section: 'shippingplan-section',            label: 'Weekly Shipping Plan',     menu: 'Shipment' },
  { key: 'shipment-draft',          section: 'shipment-draft-section',          label: 'Shipment Draft',           menu: 'Shipment', via: 'showShipmentDraft()' },
  { key: 'shipment-overview',       section: 'shippinghistory-section',         label: 'Shipment Overview',        menu: 'Shipment', via: 'showShipmentOverview()' },
  { key: 'global-logistics-map',    section: 'global-logistics-map-section',    label: 'On-the-Way Map',           menu: 'Shipment' },
  { key: 'request-order-draft',     section: 'request-order-draft-section',     label: 'Request Order Draft',      menu: 'Procurement' },
  { key: 'purchase-order-overview', section: 'purchase-order-overview-section', label: 'Purchase Order Workspace', menu: 'Procurement' },
  { key: 'purchase-order-list',     section: 'purchase-order-list-section',     label: 'Purchase Order Overview',  menu: 'Procurement' },
  { key: 'campaign-risk',           section: 'campaign-risk-section',           label: 'Promotion Risk Tracker',   menu: 'Campaign' },
  { key: 'skuDetails',              section: 'sku-section',                     label: 'SKU Details',              menu: 'SKU Management' },
  { key: 'sku-regional-details',    section: 'sku-regional-details-section',    label: 'SKU Regional Details',     menu: 'SKU Management' },
  { key: 'carrier-rate-card',       section: 'carrier-rate-card-section',       label: 'Carrier Rate Card',        menu: 'Pricing Center' },
  { key: 'sku-handbook',            section: 'sku-handbook-section',            label: 'SKU Handbook',             menu: 'Training' },
  { key: 'supplychain',             section: 'supplychain-section',             label: 'Supply Chain Canvas',      menu: 'Training' },
  { key: 'automation',              section: 'automation-schedule-section',     label: 'Automation Schedule',      menu: 'Administration' },
  { key: 'product-strategy',        section: 'product-strategy-board-section',  label: 'Product Strategy Board',   menu: 'staged, mounted at boot by mountStagedMenus()' }
];

/* The candidate selectors the probe tries on every route. A page whose rows are TABLE ROWS and a
   page whose rows are DIVs are both ordinary here; the point is to find out which, per page, rather
   than to assume one shape and record the other as empty. */
const USEFUL_CANDIDATES = [
  'tbody tr', 'tr[data-sku]', '.fixed-row', '[data-sku]', '.srd-item', '.km-card', '.card',
  'canvas', 'select option', 'input', 'button', '[role=row]', 'li'
];

/* ---------------------------------------------------------------------------------------------
   SHARED DRIVER PRELUDE. Every mode needs the same handful of helpers, and three copies of
   `until()` that drifted apart would be worse than one that is a little general.
   --------------------------------------------------------------------------------------------- */
function prelude() {
  return [
    '  var P = window.__P, L = window.__L;',
    '  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
    '  function qa(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }',
    '  function nav(expr) { try { (0, eval)(expr); return null; } catch (e) { return String(e.message).slice(0, 140); } }',
    '  function go(r) { return nav(r.via || ("showSection(" + JSON.stringify(r.key).replace(/\\"/g, "\\u0027") + ")")); }',
    '  function away() { return nav("showSection(\\u0027supplychain\\u0027)"); }',
    '  async function until(fn, capMs) {',
    '    var t0 = performance.now(), cap = capMs || 20000;',
    '    while (performance.now() - t0 < cap) { try { if (fn()) return true; } catch (e) {} await tick(8); }',
    '    return false;',
    '  }',
    '  function sectionActive(id) { var s = document.getElementById(id); return !!(s && s.classList.contains("active")); }',
    '  function dbg() { try { return window.__kmLifecycleDebug ? window.__kmLifecycleDebug() : {}; } catch (e) { return {}; } }',
    '  function openReqs() {',
    '    try { return (window.KM && window.KM.transport && window.KM.transport.openRequestDetails)',
    '      ? window.KM.transport.openRequestDetails().length : null; } catch (e) { return null; }',
    '  }',
    '  function txt(el, n) { return el ? String(el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, n || 160) : null; }',
    '  function sec(r) { return document.getElementById(r.section); }',
    '  function copy(o) { return JSON.parse(JSON.stringify(o)); }',
    '  function rounds(marks) {',
    '    if (!marks.length) return 0;',
    '    var sorted = marks.slice().sort(function (a, b) { return a.sent - b.sent; });',
    '    var n = 1, boundary = null;',
    '    sorted.forEach(function (m, i) {',
    '      if (i === 0) { boundary = m.settled; return; }',
    '      if (boundary !== null && m.sent >= boundary) { n++; boundary = m.settled; }',
    '      else if (m.settled !== null && (boundary === null || m.settled < boundary)) boundary = m.settled;',
    '    });',
    '    return n;',
    '  }'
  ].join('\n');
}

/* ---------------------------------------------------------------------------------------------
   MODE: probe
   --------------------------------------------------------------------------------------------- */
function probeDriver() {
  const J = JSON.stringify;
  return [
    '  var ROUTES = ' + J(ROUTES_ACTIVE) + ', CAND = ' + J(USEFUL_CANDIDATES) + ';',
    '  OUT.probe = {};',
    '  async function runProbe() {',
    '    for (var i = 0; i < ROUTES.length; i++) {',
    '      var r = ROUTES[i];',
    '      OUT.progress = "probe:" + r.key; publish();',
    '      P.reset();',
    '      var navErr = go(r);',
    '      await until(function () { return sectionActive(r.section); }, 12000);',
    '      await tick(1200);',
    '      var s = sec(r);',
    '      var rec = { label: r.label, navErr: navErr, sectionPresent: !!s,',
    '        active: sectionActive(r.section), api: P.api, rounds: rounds(P.marks),',
    '        byAction: copy(P.byAction), nodes: s ? s.querySelectorAll("*").length : 0,',
    '        textLen: s ? String(s.textContent || "").replace(/\\s+/g, " ").trim().length : 0,',
    '        counts: {}, heavy: [] };',
    '      if (s) {',
    '        CAND.forEach(function (c) { var n = qa(c, s).length; if (n) rec.counts[c] = n; });',
    '        // THE HEAVIEST CONTAINERS, so a page whose rows are none of the candidates still names',
    '        // the element that holds them instead of being reported as empty.',
    '        var best = [];',
    '        qa("[id]", s).forEach(function (el) {',
    '          var n = el.children.length;',
    '          if (n >= 3) best.push({ id: el.id, children: n, tag: el.tagName });',
    '        });',
    '        best.sort(function (a, b) { return b.children - a.children; });',
    '        rec.heavy = best.slice(0, 6);',
    '      }',
    '      OUT.probe[r.key] = rec; publish();',
    '      away(); await tick(400);',
    '    }',
    '  }',
    '  await runProbe();'
  ].join('\n');
}

/* ---------------------------------------------------------------------------------------------
   MODE: drift   (§7 lifecycle, system-wide)

   THREE CYCLES, AND THE THIRD MINUS THE SECOND IS THE ANSWER. A page that binds its handlers once
   on first mount and never again has a large cycle-1 number and a zero marginal one; a page that
   re-binds to `window` on every mount has the same number every cycle. Only the second is drift,
   and only the second is something a user can accumulate by navigating.
   --------------------------------------------------------------------------------------------- */
function driftDriver() {
  const J = JSON.stringify;
  return [
    '  var ROUTES = ' + J(ROUTES_ACTIVE) + ';',
    '  OUT.drift = {};',
    '  async function cycle(r) {',
    '    go(r);',
    '    await until(function () { return sectionActive(r.section); }, 12000);',
    '    await tick(900);',
    '    away();',
    '    await tick(500);',
    '    var c = L.census();',
    '    return { live: c.live, intervals: c.intervals, detached: c.elementDetached,',
    '      byType: c.byType, open: openReqs() };',
    '  }',
    /* WHICH registrations, not merely how many. A drift of 4 is a number; "four more
       `document:keydown` every time you open this page" is something that can be found in a file. */
    '  function deltaByType(a, b) {',
    '    var out = {}, keys = {};',
    '    Object.keys(a || {}).forEach(function (k) { keys[k] = 1; });',
    '    Object.keys(b || {}).forEach(function (k) { keys[k] = 1; });',
    '    Object.keys(keys).forEach(function (k) {',
    '      var d = ((b || {})[k] || 0) - ((a || {})[k] || 0);',
    '      if (d !== 0) out[k] = d;',
    '    });',
    '    return out;',
    '  }',
    '  async function runDrift() {',
    '    for (var i = 0; i < ROUTES.length; i++) {',
    '      var r = ROUTES[i];',
    '      OUT.progress = "drift:" + r.key; publish();',
    '      var rec = { label: r.label };',
    '      try {',
    '        var base = L.census();',
    '        var c1 = await cycle(r);',
    '        var c2 = await cycle(r);',
    '        var c3 = await cycle(r);',
    '        rec.firstMountLive   = c1.live - base.live;',
    '        rec.cycle2Live       = c2.live - c1.live;',
    '        rec.cycle3Live       = c3.live - c2.live;',
    '        rec.listenerDrift    = c3.live - c2.live;        // the marginal cost of one more visit',
    '        rec.intervalDrift    = c3.intervals - c2.intervals;',
    '        rec.intervalsAfter   = c3.intervals;',
    '        rec.detachedAfter    = c3.detached;',
    '        rec.openRequests     = c3.open;',
    '        rec.driftByType      = deltaByType(c2.byType, c3.byType);',
    '        rec.cycle2ByType     = deltaByType(c1.byType, c2.byType);',
    '      } catch (e) { rec.threw = String(e && e.message).slice(0, 160); }',
    '      OUT.drift[r.key] = rec; publish();',
    '    }',
    '  }',
    '  await runDrift();'
  ].join('\n');
}

/* ---------------------------------------------------------------------------------------------
   MODE: expand  (§6 / §1A)

   The operator rule is about a USER WORKFLOW, so the measurement is a real click on a real control.
   Each workspace names the selector that opens a row and the selector that proves the detail
   arrived. The number that decides the rule is REQUESTS ACROSS THE CLICK: a workspace whose second
   level is already in the model pays zero, and one that fetches per SKU pays one per expand — which
   is the N+1 pattern §1A forbids, and which two expands rather than one can tell apart from a
   single shared read.
   --------------------------------------------------------------------------------------------- */
const EXPAND_TARGETS = [
  { key: 'skuDetails', section: 'sku-section', label: 'SKU Details',
    row: '#sku-section .fixed-row[data-sku]',
    click: '.fixed-row[data-sku] .expand-toggle, .fixed-row[data-sku] [class*=expand], .fixed-row[data-sku]',
    detail: '[class*=detail], [class*=expanded], .sku-detail-row' },
  { key: 'sku-regional-details', section: 'sku-regional-details-section', label: 'SKU Regional Details',
    row: '#srd-list .srd-item',
    click: '.srd-item [class*=toggle], .srd-item [class*=expand], .srd-item',
    detail: '[class*=detail], [class*=expanded], [class*=panel]' },
  /* SITE INVENTORY NEEDS A SCOPE BEFORE IT NEEDS A SEARCH. The Marketplace list is rebuilt from the
     scope registry once a Country is chosen, so the two selections are two steps with a wait between
     them, not one expression. Picking by VALUE rather than by index, because the markup ships a
     static ten-country list and the registry narrows it — an index would select whatever happened to
     be second. */
  { key: 'ops', section: 'ops-section', label: 'Site Inventory',
    pre: [
      { run: 'document.getElementById("replenCountry").value="US";'
           + 'document.getElementById("replenCountry").dispatchEvent(new Event("change",{bubbles:true}));', waitMs: 1500 },
      /* THE MARKETPLACE OPTION VALUE IS THE marketplace_id, not the marketplace name — it is the one
         identity that already encodes company+country+marketplace, which is what keeps two companies
         selling on the same site from merging. So the first real option is selected by POSITION; an
         attempt to select it by the name "Amazon" set nothing and left the page correctly refusing. */
      { run: 'var _m=document.getElementById("replenMarketplace");'
           + 'for(var i=0;i<_m.options.length;i++){if(_m.options[i].value){_m.selectedIndex=i;break;}}'
           + '_m.dispatchEvent(new Event("change",{bubbles:true}));', waitMs: 1200 },
      { run: 'searchReplenishment()', waitMs: 2500 }
    ],
    row: '#ops-section .fixed-row[data-sku], [data-sku]',
    click: '.replen-row-chevron, .fixed-row[data-sku]',
    detail: '.replen-expand-panel, [class*=expand-panel]' },
  /* ORDER PLANNING GATES ITS OWN ROWS BEHIND SEARCH, and that is a product rule rather than a
     latency: `renderRequestOrderTable` returns a neutral PRE_SEARCH state until `searched` is set,
     so async arrivals can never expose rows before the operator asked for them. A probe that did
     not press Search would record this page as having no rows and would have measured the gate. */
  { key: 'request-order', section: 'request-order-section', label: 'Order Planning',
    pre: [{ run: 'handleRequestOrderSearch()', waitMs: 2500 }],
    row: '.ro-fixed-wrapper .fixed-row, [data-rowkey]',
    click: '.ro-sku-expand-toggle, [data-rowkey] .fixed-row',
    detail: '.ro-sku-expand-panel, [class*=expand-panel], [class*=expanded]' },
  { key: 'request-order-draft', section: 'request-order-draft-section', label: 'Request Order Draft',
    row: '[data-sku], .fixed-row, tbody tr',
    click: '[class*=expand], [class*=toggle], [data-sku]',
    detail: '[class*=detail], [class*=expanded], [class*=sub]' },
  { key: 'factory-stock', section: 'factory-stock-section', label: 'Factory Inventory',
    row: '.fixed-row, tbody tr',
    click: '[class*=expand], [class*=toggle], .fixed-row',
    detail: '[class*=detail], [class*=expanded], [class*=sub]' }
];

function expandDriver() {
  const J = JSON.stringify;
  return [
    '  var TARGETS = ' + J(EXPAND_ACTIVE) + ';',
    '  OUT.expand = {};',
    '  function firstIn(section, sel) {',
    '    var s = document.getElementById(section); if (!s) return null;',
    '    var parts = sel.split(",");',
    '    for (var i = 0; i < parts.length; i++) {',
    '      var hit = qa(parts[i].trim(), s)[0];',
    '      if (hit) return { el: hit, by: parts[i].trim() };',
    '    }',
    '    return null;',
    '  }',
    '  async function runExpand() {',
    '    for (var i = 0; i < TARGETS.length; i++) {',
    '      var t = TARGETS[i];',
    '      OUT.progress = "expand:" + t.key; publish();',
    '      var rec = { label: t.label };',
    '      try {',
    '        P.reset();',
    '        go({ key: t.key });',
    '        await until(function () { return sectionActive(t.section); }, 12000);',
    '        if (t.pre) {',
    '          await tick(2000);',
    '          rec.preErrs = [];',
    '          for (var s2 = 0; s2 < t.pre.length; s2++) {',
    '            rec.preErrs.push(nav(t.pre[s2].run));',
    '            await tick(t.pre[s2].waitMs || 1200);',
    '          }',
    '          await until(function () { return openReqs() === 0; }, 30000);',
    '          rec.apiAfterPre = P.api;',
    '          rec.preByAction = copy(P.byAction);',
    /* WHERE THE CHAIN STOPPED. A scope page that renders no rows has failed at one of four points -
       the selector was never populated, the value did not take, the search did not fire, or the read
       came back empty - and only naming them separately says which. */
    '          rec.preDiag = (function () {',
    '            function selInfo(id) { var e = document.getElementById(id);',
    '              return e ? { value: e.value, options: e.options.length } : null; }',
    '            var s3 = sec({ section: t.section });',
    '            return { country: selInfo("replenCountry"), marketplace: selInfo("replenMarketplace"),',
    '              emptyText: (function () { var n = qa("[class*=empty], [class*=presearch], [class*=state]", s3)',
    '                .filter(function (e) { return !e.hidden && String(e.textContent || "").trim(); });',
    '                return n.length ? txt(n[0], 120) : null; }()) };',
    '          }());',
    '        }',
    '        await until(function () { return !!firstIn(t.section, t.row); }, 20000);',
    '        await tick(600);',
    '        var s = document.getElementById(t.section);',
    '        rec.rowsPresent = (function () { var f = firstIn(t.section, t.row); return f ? qa(f.by, s).length : 0; }());',
    '        rec.rowSelector = (function () { var f = firstIn(t.section, t.row); return f ? f.by : null; }());',
    '        if (!rec.rowsPresent) { rec.skipped = "no rows in this world"; OUT.expand[t.key] = rec; publish(); away(); await tick(400); continue; }',
    '        rec.detailBefore = qa(t.detail, s).length;',
    '        // EXPAND ONE. Requests are counted across the click itself, and the DOM is read in the',
    '        // SAME TASK so "appeared immediately" is a fact about ordering rather than about how',
    '        // long the harness was willing to wait.',
    '        var hit = firstIn(t.section, t.click);',
    '        rec.clickSelector = hit ? hit.by : null;',
    '        if (!hit) { rec.skipped = "no expand control found"; OUT.expand[t.key] = rec; publish(); away(); await tick(400); continue; }',
    '        P.reset();',
    '        try { hit.el.click(); } catch (e) { rec.clickThrew = String(e.message).slice(0, 120); }',
    '        rec.apiSameTask = P.api;',
    '        rec.detailSameTask = qa(t.detail, s).length;',
    /* WAIT FOR THE FIRST EXPAND TO SETTLE BEFORE ASKING WHAT THE SECOND COSTS.
       The first attempt at this fired the second expand 1.5 s after the first, while the first
       expand's seven-table read was still in flight at serverMs 400 - so the second expand was
       measured against a page that had not finished the first, and its seven requests said more
       about the harness than about the page. The settle is the condition, not a longer sleep: no
       open request, and a quiet period with no new dispatch. */
    '        await until(function () { return openReqs() === 0; }, 30000);',
    '        var _q = P.api; await tick(1200);',
    '        rec.settledQuiet = (P.api === _q);',
    '        rec.apiAfterFirstExpand = P.api;',
    /* THE FLAG ITSELF, not merely its consequence. A page that re-reads seven tables on every expand
       has either failed to set its "already loaded" flag or is resetting it, and only the flag can
       tell those apart. Read straight off `window`, since these are top-level `var`s in a classic
       script and are therefore globals. */
    '        rec.flags = { roL2Ready: window._roL2Ready, opMatCacheKey: (window._opMatCache || {}).key || null,',
    '          useDb: (typeof _roUseDb === "function") ? _roUseDb() : null,',
    '          hasRefresh: !!(window.KM && window.KM.DB && window.KM.DB.refreshCacheTables) };',
    '        rec.byActionFirstExpand = copy(P.byAction);',
    '        rec.detailAfterFirstExpand = qa(t.detail, s).length;',
    '        rec.openAfterFirstExpand = openReqs();',
    '        // EXPAND A SECOND, DIFFERENT ROW. One request on the first expand and none on the',
    '        // second is a page that loaded a shared table once; one on each is N+1.',
    '        var rows = qa(rec.rowSelector, s);',
    '        var second = rows[Math.min(3, rows.length - 1)];',
    '        if (second && rows.length > 1) {',
    '          var ctl = null, parts = t.click.split(",");',
    '          for (var p = 0; p < parts.length && !ctl; p++) { ctl = qa(parts[p].trim(), second)[0]; }',
    '          if (!ctl) ctl = second;',
    '          P.reset();',
    '          try { ctl.click(); } catch (e) {}',
    '          rec.apiSameTaskSecond = P.api;',
    '          await until(function () { return openReqs() === 0; }, 30000);',
    '          await tick(1200);',
    '          rec.apiAfterSecondExpand = P.api;',
    '          rec.byActionSecondExpand = copy(P.byAction);',
    '          rec.flagsAfterSecond = { roL2Ready: window._roL2Ready };',
    /* A THIRD EXPAND, on a page that is now unambiguously settled. Two data points can be a race;
       three that agree are a behaviour. */
    '          var third = rows[Math.min(6, rows.length - 1)];',
    '          if (third && third !== second) {',
    '            var c3 = null, pp = t.click.split(",");',
    '            for (var q = 0; q < pp.length && !c3; q++) { c3 = qa(pp[q].trim(), third)[0]; }',
    '            if (!c3) c3 = third;',
    '            P.reset();',
    '            try { c3.click(); } catch (e) {}',
    '            await until(function () { return openReqs() === 0; }, 30000);',
    '            await tick(1200);',
    '            rec.apiAfterThirdExpand = P.api;',
    '            rec.byActionThirdExpand = copy(P.byAction);',
    '          }',
    '        } else { rec.secondExpand = "only one row"; }',
    '      } catch (e) { rec.threw = String(e && e.message).slice(0, 160); }',
    '      OUT.expand[t.key] = rec; publish();',
    '      away(); await tick(400);',
    '    }',
    '  }',
    '  await runExpand();'
  ].join('\n');
}

/* ---------------------------------------------------------------------------------------------
   MODE: states  (§7 error truth)

   THE REFUSAL IS ARMED BEFORE THE ROUTE HAS EVER BEEN ENTERED. The first version of this mode
   entered each route healthy, armed its reads, and entered again — and measured almost nothing,
   because most routes here re-enter warm with ZERO reads. A page that never asks again cannot be
   refused, so fourteen of twenty-one routes recorded a failure pass that issued no request at all.
   What that version actually measured, where it measured anything, was a failed REFRESH.

   So the order is inverted: arm first, enter cold, and let the page meet a network that refuses its
   very first read. That is the case a user hits after a deploy or on a dropped connection, and it is
   the case §7 is about — FAILED must not render as EMPTY.

   THE ACTIONS ARE DECLARED, NOT DISCOVERED, for the same reason. A discovered list needs a healthy
   pass to discover it, which is what warmed the page. This table is the probe mode\u0027s output,
   copied deliberately; a route whose reads change will show up as `armedButNoRequest`, which is a
   visible disagreement rather than a silent zero.

   `system.health` and `getClientCapabilities` are NEVER armed. They are not the page\u0027s business
   read — they are the deployment probe — and refusing them would measure the health banner.
   --------------------------------------------------------------------------------------------- */
const ROUTE_READS = {
  'ops':                     ['inventoryScope.registry.get', 'inventoryReplenishment.workspace.get'],
  'factory-stock':           ['getTable:factory_stock', 'getTable:sku_details', 'getTable:warehouses'],
  'overseas-stock':          ['overseasStock.workspace.get'],
  'forecast':                [],
  'fc-summary':              ['fcSummary.workspace.get'],
  'request-order':           ['getTable:marketplaces', 'aiPlanFirstLayer.get'],
  'shippingplan':            ['weeklyShipping.workspace.get'],
  'shipment-draft':          ['shipment.workspace.get'],
  'shipment-overview':       [],
  'global-logistics-map':    ['shipment.workspace.get'],
  'request-order-draft':     ['requestOrder.workspace.get'],
  'purchase-order-overview': ['purchaseOrder.workspace.get'],
  'purchase-order-list':     ['purchaseOrder.workspace.get'],
  'campaign-risk':           ['getTable:marketplace_skus'],
  'skuDetails':              ['skuDetails.workspace.get'],
  'sku-regional-details':    ['skuDetails.workspace.get'],
  'carrier-rate-card':       ['getTable:carrier_rate_cards', 'getTable:carriers'],
  'sku-handbook':            ['getTable:sku_details', 'getTable:product_features', 'getTable:sku_handbook_summaries'],
  'supplychain':             [],
  'automation':              ['automationSchedule.get'],
  'product-strategy':        ['productPricing.siteUniverse.get']
};

function statesDriver() {
  const J = JSON.stringify;
  return [
    '  var ROUTES = ' + J(ROUTES_ACTIVE) + ', READS = ' + J(ROUTE_READS) + ';',
    '  OUT.states = {};',
    '  var EMPTYISH = /no data|no record|no result|no matching|nothing|empty|\\u5c1a\\u7121|\\u6c92\\u6709|\\u7121\\u8cc7\\u6599|\\u67e5\\u7121/i;',
    '  function arm(keys) {',
    '    (keys || []).forEach(function (k) {',
    '      P.failFor[k] = 999;',
    '      var bare = k.split(":")[0];',
    '      if (bare !== k) P.failFor[bare] = 999;',
    '    });',
    '    return (keys || []).length;',
    '  }',
    '  function disarm() { P.failFor = {}; }',
    /* AN ERROR SURFACE IS RECOGNISED BY WHAT IT SAYS, not by what it is called.

       The first version of this looked for `[class*=error]`, `[role=alert]` and friends, and it was
       wrong in both directions. SKU Details builds a read-failure banner with inline styles and NO
       CLASS AT ALL, so a page with a perfectly good error message was recorded as showing nothing;
       meanwhile three pages render a truthful failure message INSIDE an element whose class is
       `...-empty-state`, and were recorded as false empties for the sake of a class name.

       So the class selectors stay - they catch the styled boxes cheaply - and a TEXT pass is added
       over the leaf elements. A leaf, so one message is not also counted as its three ancestors. */
    '  var FAILISH = /could not|couldn.t|cannot|can.t|unable|failed|failure|error|not connected|unavailable|no server|\\u7121\\u6cd5|\\u5931\\u6557|\\u932f\\u8aa4/i;',
    '  function errorBoxes(s) {',
    '    if (!s) return [];',
    '    var byClass = qa("[class*=error], [class*=refus], [class*=fail], [role=alert], .km-route-script-error", s)',
    '      .filter(function (e) { return !e.hidden && String(e.textContent || "").trim().length > 3; });',
    '    var byText = qa("div, p, span, td, section", s).filter(function (e) {',
    '      if (e.hidden || e.children.length) return false;',
    '      var t = String(e.textContent || "").trim();',
    '      return t.length > 8 && FAILISH.test(t);',
    '    });',
    '    var seen = [], out = [];',
    '    byClass.concat(byText).forEach(function (e) { if (seen.indexOf(e) < 0) { seen.push(e); out.push(e); } });',
    '    return out;',
    '  }',
    '  function emptyBoxes(s) {',
    '    if (!s) return [];',
    '    return qa("[class*=empty], [class*=no-data], [class*=placeholder]", s)',
    '      .filter(function (e) { return !e.hidden && String(e.textContent || "").trim().length > 3; })',
    '      .filter(function (e) { return !FAILISH.test(String(e.textContent || "")); })',
    '      .concat(qa("td, div, p", s).filter(function (e) {',
    '        return e.children.length === 0 && EMPTYISH.test(String(e.textContent || ""));',
    '      }));',
    '  }',
    '  function retryControls(s) {',
    '    if (!s) return [];',
    '    return qa("button, a, [role=button], [onclick]", s).filter(function (e) {',
    '      return !e.hidden && /retry|\\u91cd\\u8a66|\\u91cd\\u65b0|try again|reload/i.test(String(e.textContent || "") + " " + String(e.getAttribute("onclick") || ""));',
    '    });',
    '  }',
    '  function spinners(s) {',
    '    if (!s) return 0;',
    '    return qa("[class*=skel], [data-state=loading], [class*=spinner], [class*=loading]", s)',
    '      .filter(function (e) { return !e.hidden && e.offsetParent !== null; }).length;',
    '  }',
    '  async function runStates() {',
    '    for (var i = 0; i < ROUTES.length; i++) {',
    '      var r = ROUTES[i];',
    '      OUT.progress = "states:" + r.key; publish();',
    '      var rec = { label: r.label, armed: (READS[r.key] || []).length };',
    '      try {',
    '        if (!rec.armed) { rec.noReadToFail = true; OUT.states[r.key] = rec; publish(); continue; }',
    '        // ---- COLD, WITH THE NETWORK ALREADY REFUSING ---------------------------------',
    '        arm(READS[r.key]);',
    '        P.reset(); go(r);',
    '        await until(function () { return sectionActive(r.section); }, 12000);',
    '        await tick(3000);',
    '        var s = sec(r);',
    '        var eb = errorBoxes(s), emb = emptyBoxes(s);',
    '        rec.failed = { api: P.api, failed: P.failed, errorBoxes: eb.length,',
    '          errorText: eb.length ? txt(eb[0]) : null, emptyBoxes: emb.length,',
    '          emptyText: emb.length ? txt(emb[0], 100) : null,',
    '          retryControls: retryControls(s).length, open: openReqs(), spinners: spinners(s),',
    '          nodes: s ? s.querySelectorAll("*").length : 0,',
    '          sample: s ? String(s.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 300) : null };',
    '        rec.armedButNoRequest = (P.api === 0);',
    '        // FAILED RENDERING AS EMPTY. Only a defect when the page says "nothing here" and says',
    '        // NOTHING about the failure; an empty region beside a truthful message is a layout.',
    '        rec.falseEmpty = (emb.length > 0) && (eb.length === 0) && (P.api > 0);',
    '        // ---- HEAL THE NETWORK, THEN RETRY -------------------------------------------',
    '        // A Retry pressed against a network that is STILL refusing measures the refusal.',
    '        // S4-R4 learned that the expensive way.',
    '        disarm();',
    '        var rc = retryControls(s);',
    '        if (rc.length) {',
    '          P.reset();',
    '          try { rc[0].click(); } catch (e) { rec.retryThrew = String(e.message).slice(0, 120); }',
    '          await until(function () { return openReqs() === 0 && P.api > 0; }, 20000);',
    '          await tick(2000);',
    '          s = sec(r);',
    '          rec.retry = { api: P.api, byAction: copy(P.byAction),',
    '            errorBoxes: errorBoxes(s).length, emptyBoxes: emptyBoxes(s).length,',
    '            spinners: spinners(s), open: openReqs(), nodes: s ? s.querySelectorAll("*").length : 0 };',
    '          rec.retryNoDispatch = (P.api === 0);',
    '          rec.retryStorm = (P.api > 2 * rec.armed + 2);',
    '          rec.recovered = (errorBoxes(s).length === 0);',
    '        } else { rec.retry = null; rec.retryNoDispatch = null; }',
    '        // PERMANENT LOADING: a visible spinner after everything has settled.',
    '        await until(function () { return openReqs() === 0; }, 20000);',
    '        await tick(2500);',
    '        rec.permanentLoading = spinners(sec(r));',
    '        // ---- AND NOW HEALTHY, for the empty-box baseline the failure is judged against --',
    '        away(); await tick(400);',
    '        P.reset(); go(r);',
    '        await until(function () { return sectionActive(r.section); }, 12000);',
    '        await tick(2500);',
    '        s = sec(r);',
    '        rec.healthy = { api: P.api, errorBoxes: errorBoxes(s).length,',
    '          emptyBoxes: emptyBoxes(s).length, spinners: spinners(s),',
    '          nodes: s ? s.querySelectorAll("*").length : 0 };',
    '      } catch (e) { rec.threw = String(e && e.message).slice(0, 160); }',
    '      disarm();',
    '      OUT.states[r.key] = rec; publish();',
    '      away(); await tick(400);',
    '    }',
    '  }',
    '  await runStates();'
  ].join('\n');
}

/* ---------------------------------------------------------------------------------------------
   MODE: l2race  (§14 — the duplicate the settle wait is designed NOT to see)

   The `expand` mode waits for each expand to settle before asking what the next one costs, because
   without that wait it measured a race instead of a page. This mode is the deliberate opposite: two
   rows expanded with NO wait between them, which is what a person double-clicking a list does.

   Order Planning loads seven bounded second-layer tables on the first expand. With an in-flight
   guard the second expand attaches to the read already running and costs nothing; without one it
   starts the whole set again. The two outcomes differ by seven requests, so this cannot be passed by
   a page that merely happens to be quick.
   --------------------------------------------------------------------------------------------- */
function l2raceDriver() {
  return [
    '  OUT.l2race = {};',
    '  async function runRace() {',
    '    OUT.progress = "l2race"; publish();',
    '    go({ key: "request-order" });',
    '    await until(function () { return sectionActive("request-order-section"); }, 12000);',
    '    await tick(2500);',
    '    nav("handleRequestOrderSearch()");',
    '    await until(function () { return qa("#request-order-section .ro-sku-expand-toggle").length > 1; }, 20000);',
    '    await until(function () { return openReqs() === 0; }, 20000);',
    '    await tick(1000);',
    '    var toggles = qa("#request-order-section .ro-sku-expand-toggle");',
    '    OUT.l2race.rows = toggles.length;',
    '    if (toggles.length < 2) { OUT.l2race.skipped = "fewer than two rows"; return; }',
    '    P.reset();',
    '    // BOTH CLICKS BEFORE ANYTHING IS AWAITED. A tick between them would let the guard be set by',
    '    // an early settle and the race would never happen.',
    '    try { toggles[0].click(); } catch (e) {}',
    '    try { toggles[1].click(); } catch (e) {}',
    '    OUT.l2race.sameTask = P.api;',
    '    await until(function () { return openReqs() === 0; }, 40000);',
    '    await tick(1500);',
    '    OUT.l2race.total = P.api;',
    '    OUT.l2race.byAction = copy(P.byAction);',
    '    // The seven second-layer tables, counted on their own: the gap read and anything else the',
    '    // page does on expand are not this rule\u0027s business.',
    '    var L2 = ["fc_regular_forecast", "fc_special_events", "fc_target_rules", "factory_stock",',
    '      "warehouses", "purchase_orders", "purchase_order_lines"];',
    '    var maxL2 = 0, l2Total = 0;',
    '    L2.forEach(function (t) {',
    '      var n = P.byAction["getTable:" + t] || 0;',
    '      l2Total += n; if (n > maxL2) maxL2 = n;',
    '    });',
    '    OUT.l2race.l2Requests = l2Total;',
    '    OUT.l2race.maxPerL2Table = maxL2;',
    '  }',
    '  await runRace();'
  ].join('\n');
}

/* ---------------------------------------------------------------------------------------------
   THE HARNESS.
   --------------------------------------------------------------------------------------------- */
/* The routes a run covers. `only` is a list of keys; absent means all of them. It narrows the two
   tables the drivers serialise into the page, so a focused run and a full run execute identical
   code over a different number of routes — rather than a second, simpler code path that could
   drift away from the one the round actually reported. */
let ROUTES_ACTIVE = ROUTES;
let EXPAND_ACTIVE = EXPAND_TARGETS;
function withOnly(only, fn) {
  if (!only || !only.length) return fn();
  const keep = {}; only.forEach(function (k) { keep[k] = 1; });
  const rPrev = ROUTES_ACTIVE, ePrev = EXPAND_ACTIVE;
  ROUTES_ACTIVE = ROUTES.filter(function (r) { return keep[r.key]; });
  EXPAND_ACTIVE = EXPAND_TARGETS.filter(function (t) { return keep[t.key]; });
  const unknown = only.filter(function (k) {
    return !ROUTES.some(function (r) { return r.key === k; });
  });
  // A typo in a key would otherwise narrow the run to nothing and report a serene all-clear.
  if (unknown.length) throw new Error('unknown route key(s): ' + unknown.join(', '));
  try { return fn(); } finally { ROUTES_ACTIVE = rPrev; EXPAND_ACTIVE = ePrev; }
}

function driver(mode) {
  const body = mode === 'probe' ? probeDriver()
    : mode === 'drift' ? driftDriver()
    : mode === 'expand' ? expandDriver()
    : mode === 'states' ? statesDriver()
    : mode === 'l2race' ? l2raceDriver()
    : null;
  if (!body) throw new Error('unknown mode: ' + mode);
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var OUT = { mode: ' + JSON.stringify(mode) + ', serverMs: window.__SERVER_MS, fatal: null, progress: null, done: false };',
    '  function publish() { try { document.getElementById("__measurements").textContent = JSON.stringify(OUT); } catch (e) {} }',
    prelude(),
    '  (async function () {',
    '    try {',
    '      await tick(700);',
    '      OUT.boot = { api: P.api, partial: P.partial, errors: P.errors.slice(0),',
    '        menuItems: qa(".menu-item").length, menuItemsDisabled: qa(".menu-item--disabled").length,',
    '        live: L.census().live, intervals: L.census().intervals };',
    '      publish();',
    body,
    '      OUT.windowErrors = L.errors; OUT.unhandled = L.unhandled;',
    '      OUT.undefinedGlobals = L.undefinedGlobals.slice(0);',
    '      OUT.progress = null; OUT.done = true; publish();',
    '    } catch (e) { OUT.fatal = String(e && e.message) + " @" + OUT.progress; publish(); }',
    '  }());',
    '}());',
    '</script>'
  ].join('\n');
}

function run(mode, serverMs, only) {
  return withOnly(only, function () { return _run(mode, serverMs, only); });
}
function _run(mode, serverMs, only) {
  const chrome = R11.findChrome();
  if (!chrome) return { chromeMissing: true };
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + R11.probeScript(serverMs) + R2.listenerProbe());
  html = html.replace(/<\/body>/i, driver(mode));
  const tag = (only && only.length) ? ('-' + only.slice(0, 3).join('_').replace(/[^a-zA-Z0-9_]/g, '')) : '';
  const file = path.join(ROOT, '__s4r6-' + mode + '-' + serverMs + tag + '.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files', '--js-flags=--expose-gc',
      '--virtual-time-budget=1500000', '--dump-dom', url],
      { encoding: 'utf8', timeout: parseInt(process.env.S4R6_TIMEOUT || '2400000', 10), maxBuffer: 256 * 1024 * 1024 });
    const m = /<pre id="__measurements">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    if (!m) return { noMeasurements: true, status: r.status, stderr: String(r.stderr || '').slice(0, 600) };
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try { return JSON.parse(raw); } catch (e) { return { parseError: String(e.message), raw: raw.slice(0, 900) }; }
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

module.exports = { run, ROUTES, EXPAND_TARGETS, USEFUL_CANDIDATES };

if (require.main === module) {
  const mode = process.argv[2] || 'probe';
  const ms = parseInt(process.argv[3] || '0', 10);
  const only = process.argv[4] ? process.argv[4].split(',').map(function (x) { return x.trim(); }).filter(Boolean) : null;
  console.log(JSON.stringify(run(mode, ms, only), null, 1));
}
