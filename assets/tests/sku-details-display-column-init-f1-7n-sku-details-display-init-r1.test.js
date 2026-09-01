// Kitchen Mama Operation System — F1-7N-SKU-DETAILS-DISPLAY-INIT-R1
// SKU Details → Display column initialization (frontend-only).
// Run: node assets/tests/sku-details-display-column-init-f1-7n-sku-details-display-init-r1.test.js
// -----------------------------------------------------------------------------------------------------------
// THE BUG. On first load the Display control showed every column checked while the table applied only some of
// them; unchecking All and re-checking it made the rest appear. There was no column-visibility STATE at all —
// the checkboxes WERE the state, and the only thing that ever wrote visibility into the DOM was a handler
// firing. Underneath that, `.scroll-col` is `overflow-x: hidden`, so the synthetic `.sku-unified-scroll` bar is
// the ONLY way to reach the right-hand columns, and its width was measured from an EMPTY body ~100ms after
// mount while the scoped workspace read was still in flight. Nothing re-measured after the rows arrived, so
// every column past ~200px existed, was not hidden, and could not be scrolled to. Toggling Display "fixed" it
// only because both handlers happen to call updateScrollWidth() again.
//
// THIS SUITE EXECUTES THE SHIPPED FUNCTIONS. The column module and updateScrollWidth are extracted from
// assets/js/pages/sku-details.js and run against a DOM built from the SHIPPED markup — the header columns come
// from assets/html/pages/sku-details.html and the body columns from the shipped row template, so a fixture can
// never drift away from what the page actually renders.

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
    var A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// LF-normalised on the way in: this repository mixes line endings and core.autocrlf rewrites the working copy,
// so an anchor written with a bare \n matches nothing on a machine that checked the file out the other way.
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }
function read(rel) { return lf(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function swap(src, from, to) {
    if (src.indexOf(from) === -1) throw new Error('mutation anchor ABSENT: ' + from.slice(0, 80));
    var out = src.split(from).join(to);
    if (out === src) throw new Error('mutation changed NOTHING: ' + from.slice(0, 80));
    return out;
}
function stripComments(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}
function extractFn(src, name) {
    var start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('not found: ' + name);
    var i = src.indexOf('{', start), depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    throw new Error('unbalanced: ' + name);
}

var SRC = read('assets/js/pages/sku-details.js');
var HTML = read('assets/html/pages/sku-details.html');
var CSS = read('assets/css/pages/sku-details.css');
var INDEX = read('index.html');
var SRC_CODE = stripComments(SRC);

// ===========================================================================================================
// A MINIMAL DOM — only what the shipped code actually asks for, so the harness cannot quietly do more than a
// browser would. Every element carries a real `style` object, which is what the assertions read.
// ===========================================================================================================
function El(tag, cls, attrs) {
    this.tagName = tag; this.className = cls || ''; this.attrs = attrs || {};
    this.children = []; this.style = {}; this.checked = false; this.indeterminate = false;
    this.listeners = 0; this.scrollWidth = 0; this.offsetWidth = 0; this.clientWidth = 0;
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.getAttribute = function (a) { return this.attrs[a] == null ? null : String(this.attrs[a]); };
El.prototype.addEventListener = function () { this.listeners++; };
El.prototype.classList = null;
function parseSel(sel) {
    return String(sel).trim().split(/\s+/).map(function (part) {
        var classes = [], attr = null, id = null;
        part.replace(/\[([a-zA-Z-]+)="([^"]*)"\]/g, function (_, k, v) { attr = { k: k, v: v }; return ''; });
        var head = part.replace(/\[[^\]]*\]/g, '');
        head.replace(/#([A-Za-z0-9_-]+)/g, function (_, i) { id = i; return ''; });
        head.replace(/\.([A-Za-z0-9_-]+)/g, function (_, c) { classes.push(c); return ''; });
        return { classes: classes, attr: attr, id: id };
    });
}
function matches(el, p) {
    for (var i = 0; i < p.classes.length; i++) {
        if ((' ' + el.className + ' ').indexOf(' ' + p.classes[i] + ' ') === -1) return false;
    }
    if (p.id && el.attrs.id !== p.id) return false;
    if (p.attr && String(el.attrs[p.attr.k]) !== p.attr.v) return false;
    return true;
}
function descend(nodes, parts, idx) {
    if (idx >= parts.length) return nodes;
    var hit = [];
    function walk(n) {
        for (var i = 0; i < n.children.length; i++) {
            if (matches(n.children[i], parts[idx])) hit.push(n.children[i]);
            walk(n.children[i]);
        }
    }
    nodes.forEach(walk);
    return descend(hit, parts, idx + 1);
}
El.prototype.querySelectorAll = function (sel) { return descend([this], parseSel(sel), 0); };
El.prototype.querySelector = function (sel) { var r = this.querySelectorAll(sel); return r.length ? r[0] : null; };

// ---- the SHIPPED column set, read from the shipped files ---------------------------------------------------
function headerColsFromHtml() {
    var sections = HTML.split('<div class="sku-lifecycle-section"').slice(1);
    return sections.map(function (block) {
        var name = (block.match(/data-section="([a-z]+)"/) || [])[1];
        var head = (block.match(/<div class="scroll-header">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1] || block;
        var cols = [];
        head.replace(/class="header-cell"[^>]*data-col="(\d+)"/g, function (_, c) { cols.push(Number(c)); return ''; });
        return { section: name, cols: cols };
    });
}
function bodyColsFromJs() {
    var cols = [];
    var tmpl = SRC.slice(SRC.indexOf('scrollBody.innerHTML = data.map'), SRC.indexOf('// Re-apply selection highlight'));
    tmpl.replace(/class="scroll-cell" data-col="(\d+)"/g, function (_, c) { cols.push(Number(c)); return ''; });
    return cols;
}
var SECTIONS = headerColsFromHtml();
var BODY_COLS = bodyColsFromJs();

// ---- build a page ------------------------------------------------------------------------------------------
function buildPage(rowsPerSection) {
    var root = new El('div', 'sku-section-root', { id: 'sku-section' });
    var byId = { 'sku-section': root };

    // Display panel: one checkbox per registry column, exactly as the shipped markup declares them.
    var panel = new El('div', 'display-panel', { id: 'displayPanel' });
    var checkAll = new El('input', 'all-option-input', { id: 'checkAll' });
    checkAll.checked = true;
    byId.checkAll = checkAll;
    panel.appendChild(checkAll);
    var htmlCols = [];
    HTML.replace(/class="col-checkbox" data-col="(\d+)"/g, function (_, c) { htmlCols.push(Number(c)); return ''; });
    htmlCols.forEach(function (c) {
        var cb = new El('input', 'col-checkbox', { 'data-col': c });
        cb.checked = true;
        panel.appendChild(cb);
    });
    root.appendChild(panel);

    SECTIONS.forEach(function (sec) {
        var s = new El('div', 'sku-lifecycle-section', { 'data-section': sec.section });
        var headerViewport = new El('div', 'scroll-header-viewport', {});
        var header = new El('div', 'scroll-header', {});
        sec.cols.forEach(function (c) {
            header.appendChild(new El('div', 'header-cell', { 'data-col': c }));
        });
        // `.scroll-header` is `min-width: max-content`, so it reports the FULL width of every column.
        header.scrollWidth = 40 + sec.cols.length * 120;
        header.offsetWidth = header.scrollWidth;
        headerViewport.appendChild(header);
        s.appendChild(headerViewport);

        var scrollCol = new El('div', 'scroll-col', {});
        var scrollBody = new El('div', 'scroll-body', {});
        for (var r = 0; r < (rowsPerSection || 0); r++) {
            var row = new El('div', 'scroll-row', { 'data-sku': 'CO' + r, 'data-series': 'S1', 'data-category': 'C1' });
            BODY_COLS.forEach(function (c) { row.appendChild(new El('div', 'scroll-cell', { 'data-col': c })); });
            scrollBody.appendChild(row);
        }
        // An EMPTY `.scroll-col` reports its own clientWidth — this is the measurement that produced the bug.
        scrollCol.clientWidth = 600;
        scrollCol.scrollWidth = (rowsPerSection || 0) > 0 ? (40 + BODY_COLS.length * 120) : 600;
        scrollCol.appendChild(scrollBody);
        s.appendChild(scrollCol);
        root.appendChild(s);
    });

    var doc = {
        getElementById: function (id) { return byId[id] || null; },
        querySelectorAll: function (sel) { return root.querySelectorAll(sel); },
        querySelector: function (sel) { return root.querySelector(sel); }
    };
    return { root: root, doc: doc, byId: byId };
}

// ---- fake localStorage -------------------------------------------------------------------------------------
function fakeLS(opts) {
    opts = opts || {};
    var m = {};
    return {
        _m: m,
        getItem: function (k) { if (opts.throwRead) throw new Error('read blocked'); return k in m ? m[k] : null; },
        setItem: function (k, v) { if (opts.throwWrite) throw new Error('quota'); m[k] = String(v); },
        removeItem: function (k) { delete m[k]; }
    };
}

// ---- instantiate the SHIPPED column module ------------------------------------------------------------------
function makeCols(src, page, ls) {
    src = src || SRC;
    var start = src.indexOf("var SKU_COLPREF_KEY_ = ");
    var end = src.indexOf('// Display panel + More Options menu close on outside click / Escape.');
    if (start < 0 || end < 0 || end < start) throw new Error('column module block not found');
    var block = src.slice(start, end);
    var resize = src.slice(src.indexOf('var SKU_RESIZE_COLUMNS = ['), src.indexOf('var _skuResizeCtl'));
    var hasLs = extractFn(src, '_skuHasLocalStorage_');
    var expose = '\nreturn { registry: skuColumnRegistry_, resolve: skuResolveVisibleColumns_, ' +
        'apply: applySkuColumnVisibility_, toggle: toggleColumn, toggleAll: toggleAllColumns, ' +
        'updateAll: updateAllCheckbox, readPref: _skuColPrefRead_, writePref: _skuColPrefWrite_, ' +
        'KEY: SKU_COLPREF_KEY_, VERSION: SKU_COLPREF_VERSION_, ' +
        'reset: function () { _skuVisibleColsState = null; } };';
    var win = { updateSkuScrollWidth: function () { win.__widthCalls = (win.__widthCalls || 0) + 1; } };
    var api = new Function('document', 'window', 'localStorage', 'SKU_RESIZE_COLUMNS_SRC',
        resize + hasLs + block + expose)(page.doc, win, ls, null);
    api.__win = win;
    return api;
}

// ---- instantiate the SHIPPED updateScrollWidth ----------------------------------------------------------------
function makeWidth(src, page) {
    src = src || SRC;
    var body = extractFn(src, 'updateScrollWidth');
    var unified = new El('div', 'sku-unified-scroll', {});
    var content = new El('div', 'sku-unified-scroll-content', {});
    unified.appendChild(content);
    var scrollCols = page.root.querySelectorAll('.scroll-col');
    var fn = new Function('unifiedScroll', 'scrollCols', 'document',
        body + '\nreturn updateScrollWidth;')(unified, scrollCols, page.doc);
    return { run: fn, content: content, unified: unified };
}

function visibleHeaderCols(page, sectionName) {
    var sec = page.root.querySelectorAll('.sku-lifecycle-section').filter(function (s) {
        return !sectionName || s.attrs['data-section'] === sectionName;
    });
    var out = [];
    sec.forEach(function (s) {
        s.querySelectorAll('.scroll-header .header-cell').forEach(function (c) {
            if (c.style.display !== 'none') out.push(Number(c.attrs['data-col']));
        });
    });
    return out;
}
function visibleBodyColsFirstRow(page, sectionName) {
    var sec = page.root.querySelectorAll('.sku-lifecycle-section').filter(function (s) {
        return s.attrs['data-section'] === sectionName;
    })[0];
    if (!sec) return [];
    var row = sec.querySelectorAll('.scroll-row')[0];
    if (!row) return [];
    return row.querySelectorAll('.scroll-cell').filter(function (c) { return c.style.display !== 'none'; })
        .map(function (c) { return Number(c.attrs['data-col']); });
}

// ===========================================================================================================
section('A — the registry, and that it agrees with the shipped markup');
// ===========================================================================================================
(function () {
    var page = buildPage(3);
    var api = makeCols(null, page, fakeLS());
    var reg = api.registry();
    eq(reg.length, 23, 'A1 the registry has 23 hideable columns');
    eq(reg.map(function (c) { return c.col; }), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23],
        'A2 covering data-col 1..23 (col 0 is the frozen SKU column and has no checkbox)');
    ok(reg.every(function (c) { return typeof c.key === 'string' && c.key.length > 0; }), 'A3 every column has a stable string key');
    eq(reg.length, new Set(reg.map(function (c) { return c.key; })).size, 'A4 and the keys are unique');
    // The registry, the Display markup and the rendered row must all describe the same columns.
    var htmlCols = [];
    HTML.replace(/class="col-checkbox" data-col="(\d+)"/g, function (_, c) { htmlCols.push(Number(c)); return ''; });
    eq(htmlCols, reg.map(function (c) { return c.col; }), 'A5 the Display checkboxes match the registry exactly');
    eq(BODY_COLS, reg.map(function (c) { return c.col; }), 'A6 and so does the shipped row template');
    eq(SECTIONS.length, 4, 'A7 four lifecycle sections exist');
    SECTIONS.forEach(function (s) {
        eq(s.cols, reg.map(function (c) { return c.col; }), 'A8 section "' + s.section + '" header matches the registry');
    });
    // Persisted by KEY, never by index — inserting a column must not shift anyone's preference.
    ok(/hidden\.push\(cols\[i\]\.key\)/.test(SRC), 'A9 the preference is written by stable key');
    ok(!/hidden\.push\(cols\[i\]\.col\)/.test(SRC), 'A10 never by data-col index');
})();

// ===========================================================================================================
section('B — [tests 1, 2, 3, 4] first load with no preference: everything visible, no click needed');
// ===========================================================================================================
(function () {
    var page = buildPage(3);
    var api = makeCols(null, page, fakeLS());
    // Test 3 — the apply is the whole interaction. No click, no toggle, no second render.
    api.apply();
    var all = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
    // Test 1 — every column visible on first load.
    eq(visibleHeaderCols(page, 'upcoming'), all, 'B1 [test 1] Upcoming: all 23 header columns visible');
    eq(visibleBodyColsFirstRow(page, 'upcoming'), all, 'B2 [test 1] Upcoming: all 23 body columns visible');
    // Test 4 — the three (four) tables are consistent, from ONE resolved set.
    ['upcoming', 'running', 'phasing', 'closure'].forEach(function (s) {
        eq(visibleHeaderCols(page, s), all, 'B3 [test 4] ' + s + ': headers match');
        eq(visibleBodyColsFirstRow(page, s), all, 'B4 [test 4] ' + s + ': body matches');
    });
    // Test 2 — Select All is checked and NOT indeterminate.
    eq(page.byId.checkAll.checked, true, 'B5 [test 2] Select All is checked');
    eq(page.byId.checkAll.indeterminate, false, 'B6 [test 2] and NOT indeterminate');
    // Every per-column checkbox agrees.
    var boxes = page.root.querySelectorAll('.col-checkbox');
    eq(boxes.filter(function (b) { return b.checked; }).length, 23, 'B7 all 23 checkboxes checked');
    // Nothing hidden anywhere, in any section.
    eq(page.root.querySelectorAll('.header-cell').filter(function (c) { return c.style.display === 'none'; }).length, 0,
        'B8 [test 1] not one header cell is hidden');
    eq(page.root.querySelectorAll('.scroll-cell').filter(function (c) { return c.style.display === 'none'; }).length, 0,
        'B9 [test 1] not one body cell is hidden');
})();

// ===========================================================================================================
section('C — [tests 5, 6, 7, 8, 9] the persisted preference and its compatibility policy');
// ===========================================================================================================
(function () {
    // Test 5 — uncheck one column, "reload", the choice survives.
    var ls = fakeLS();
    var page1 = buildPage(2);
    var api1 = makeCols(null, page1, ls);
    api1.apply();
    api1.toggle(5);                                   // hide Series
    eq(visibleHeaderCols(page1, 'running').indexOf(5), -1, 'C1 [test 5] the column is hidden immediately');
    var stored = JSON.parse(ls._m['km.ui.skuDetails.hiddenColumns.v1']);
    eq(stored.hidden, ['series'], 'C2 [test 5] and the preference stores the HIDDEN key');
    eq(stored.v, 1, 'C3 with a schema version');

    var page2 = buildPage(2);                          // a fresh page = a reload
    var api2 = makeCols(null, page2, ls);
    api2.apply();
    eq(visibleHeaderCols(page2, 'upcoming').indexOf(5), -1, 'C4 [test 5] after reload the column is still hidden');
    eq(page2.byId.checkAll.checked, false, 'C5 Select All is not checked…');
    eq(page2.byId.checkAll.indeterminate, true, 'C6 …it is INDETERMINATE, derived from the visible set');
    eq(visibleBodyColsFirstRow(page2, 'phasing').indexOf(5), -1, 'C7 [test 4] and every table agrees');

    // Test 6 — re-select all, reload, everything visible again.
    page2.byId.checkAll.checked = true;
    api2.toggleAll();
    eq(JSON.parse(ls._m['km.ui.skuDetails.hiddenColumns.v1']).hidden, [], 'C8 [test 6] nothing is hidden any more');
    var page3 = buildPage(2);
    var api3 = makeCols(null, page3, ls);
    api3.apply();
    eq(visibleHeaderCols(page3, 'upcoming').length, 23, 'C9 [test 6] after reload all 23 are back');
    eq([page3.byId.checkAll.checked, page3.byId.checkAll.indeterminate], [true, false], 'C10 [test 6] and Select All is cleanly checked');

    // Test 7 — a preference written before a column existed must NOT hide the new column.
    // This is the exact failure the old design would have had if it stored the VISIBLE set.
    var lsOld = fakeLS();
    lsOld._m['km.ui.skuDetails.hiddenColumns.v1'] = JSON.stringify({ v: 1, hidden: ['image'] });
    var page4 = buildPage(2);
    var api4 = makeCols(null, page4, lsOld);
    api4.apply();
    var vis4 = visibleHeaderCols(page4, 'upcoming');
    eq(vis4.indexOf(1), -1, 'C11 [test 7] the genuinely hidden column stays hidden');
    eq(vis4.length, 22, 'C12 [test 7] and every other column — including any added later — is VISIBLE');
    eq(page4.byId.checkAll.indeterminate, true, 'C13 [test 7] Select All shows indeterminate, never a false "All"');
    ok(page4.byId.checkAll.checked === false, 'C14 [test 7] so the control can never claim All over a table missing a column');

    // Test 8 — unknown keys, duplicates and wrong types are handled safely.
    var lsJunk = fakeLS();
    lsJunk._m['km.ui.skuDetails.hiddenColumns.v1'] = JSON.stringify({
        v: 1, hidden: ['series', 'series', 'a_column_that_was_removed', 42, null, { k: 'x' }, 'msrp']
    });
    var page5 = buildPage(2);
    var api5 = makeCols(null, page5, lsJunk);
    api5.apply();
    var vis5 = visibleHeaderCols(page5, 'upcoming');
    eq(vis5.length, 21, 'C15 [test 8] exactly the two KNOWN keys are hidden; junk is dropped');
    eq([vis5.indexOf(5), vis5.indexOf(21)], [-1, -1], 'C16 [test 8] series and msrp hidden');
    // A wrong version, a wrong shape and corrupt JSON each fall back to "no preference".
    [JSON.stringify({ v: 999, hidden: ['series'] }), JSON.stringify({ v: 1, hidden: 'series' }),
        JSON.stringify({ v: 1 }), '{not json', JSON.stringify(['series'])].forEach(function (raw, i) {
        var l = fakeLS(); l._m['km.ui.skuDetails.hiddenColumns.v1'] = raw;
        var p = buildPage(1), a = makeCols(null, p, l);
        a.apply();
        eq(visibleHeaderCols(p, 'upcoming').length, 23, 'C17.' + i + ' [test 8] malformed preference → all visible (safe upgrade)');
    });

    // Test 9 — storage that throws on read or write leaves the page usable.
    var pr = buildPage(2), ar = makeCols(null, pr, fakeLS({ throwRead: true }));
    ar.apply();
    eq(visibleHeaderCols(pr, 'upcoming').length, 23, 'C18 [test 9] a read that throws → all columns visible');
    var pw = buildPage(2), aw = makeCols(null, pw, fakeLS({ throwWrite: true }));
    aw.apply();
    aw.toggle(5);
    eq(visibleHeaderCols(pw, 'upcoming').indexOf(5), -1, 'C19 [test 9] a write that throws still applies in-session');
    eq(pw.byId.checkAll.indeterminate, true, 'C20 [test 9] and the control still agrees with the table');
    // No storage object at all.
    var pn = buildPage(1), an = makeCols(null, pn, null);
    an.apply();
    eq(visibleHeaderCols(pn, 'upcoming').length, 23, 'C21 [test 9] no localStorage at all → all columns visible');
})();

// ===========================================================================================================
section('D — [tests 10, 11, 13, 14] one apply, no listeners, no side effects, no requests');
// ===========================================================================================================
(function () {
    var page = buildPage(3);
    var api = makeCols(null, page, fakeLS());
    // Test 10 — re-applying (a re-mount) accumulates no listener.
    var before = page.root.querySelectorAll('.header-cell').reduce(function (n, e) { return n + e.listeners; }, 0);
    api.apply(); api.apply(); api.apply();
    var after = page.root.querySelectorAll('.header-cell').reduce(function (n, e) { return n + e.listeners; }, 0);
    eq([before, after], [0, 0], 'D1 [test 10] the apply binds no listener, however many times it runs');
    ok(stripComments(colModuleSource()).indexOf('addEventListener') === -1, 'D2 [test 10] and the module contains no addEventListener at all');

    // Test 11 — applying columns must not disturb rows, search, series or category.
    var rowsBefore = page.root.querySelectorAll('.scroll-row').length;
    var attrsBefore = page.root.querySelectorAll('.scroll-row').map(function (r) {
        return [r.attrs['data-sku'], r.attrs['data-series'], r.attrs['data-category'], r.style.display].join('|');
    });
    api.toggle(7); api.toggle(7);
    eq(page.root.querySelectorAll('.scroll-row').length, rowsBefore, 'D3 [test 11] no row is added or removed');
    eq(page.root.querySelectorAll('.scroll-row').map(function (r) {
        return [r.attrs['data-sku'], r.attrs['data-series'], r.attrs['data-category'], r.style.display].join('|');
    }), attrsBefore, 'D4 [test 11] and no row identity, series, category or visibility changes');
    var mod = stripComments(colModuleSource());
    ['renderSkuDetailsTable', 'renderSkuLifecycleTable', 'applySkuFilters', 'populateSkuFilters', 'handleSkuSearch']
        .forEach(function (f) { ok(mod.indexOf(f) === -1, 'D5 [test 11] the module never calls ' + f); });

    // Test 13 — no API request, no DB write, no Apps Script call.
    ['fetch(', 'XMLHttpRequest', 'google.script', 'KM.DB', 'callApi', 'apiRequest', 'postToAppsScript']
        .forEach(function (f) { ok(mod.indexOf(f) === -1, 'D6 [test 13] the module never reaches ' + f); });

    // Test 14 — the first render and the Display handlers use the SAME core apply.
    var render = SRC.slice(SRC.indexOf('function renderSkuDetailsTable'), SRC.indexOf('function renderSkuDetailsTable') + 2200);
    ok(/applySkuColumnVisibility_\(\)/.test(render), 'D7 [test 14] renderSkuDetailsTable calls applySkuColumnVisibility_');
    ok(/function toggleColumn\(colIndex\)[\s\S]*?applySkuColumnVisibility_\(cols\)/.test(SRC), 'D8 [test 14] toggleColumn calls it');
    ok(/function toggleAllColumns\(\)[\s\S]*?applySkuColumnVisibility_\(cols\)/.test(SRC), 'D9 [test 14] toggleAllColumns calls it');
    ok(/function updateAllCheckbox\(\)\s*\{\s*applySkuColumnVisibility_\(\);\s*\}/.test(SRC), 'D10 [test 14] and so does updateAllCheckbox');
    // Exactly ONE function writes cell display for a column.
    var writers = (SRC_CODE.match(/style\.display = disp/g) || []).length;
    eq(writers, 2, 'D11 [test 14] exactly one apply writes header + body display (2 assignments, one function)');
    ok(!/cell\.style\.display !== 'none' \? 'none' : ''/.test(SRC), 'D12 the old relative per-cell toggle is gone');
    // Test 12 (contract half) — the mount no longer papers over the race with a delayed re-measure.
    ok(!/setTimeout\(function\(\) \{ window\.updateSkuScrollWidth\(\); \}, 50\)/.test(SRC),
        'D13 the 50ms post-toggle width timer is gone — the apply measures synchronously');
})();
// An "old build": the same source with the LAST registry column removed, so a preference written against it
// predates a column the shipped build has. This is how a schema change is simulated without inventing a fixture.
function dropLastRegistryColumn(src) {
    return swap(src,
        "  { key: 'selling_price',      col: 22, def: 100, min: 80,  max: 240, label: 'Selling Price' },\n" +
        "  { key: 'pm',                 col: 23, def: 80,  min: 70,  max: 220, label: '\u8ca0\u8cacPM' }\n];",
        "  { key: 'selling_price',      col: 22, def: 100, min: 80,  max: 240, label: 'Selling Price' }\n];");
}
function colModuleSource() {
    var start = SRC.indexOf('var SKU_COLPREF_KEY_ = ');
    var end = SRC.indexOf('// Display panel + More Options menu close on outside click / Escape.');
    return SRC.slice(start, end);
}

// ===========================================================================================================
section('E — [tests 12, 15] THE ROOT CAUSE: the reachable width must not depend on render timing');
// ===========================================================================================================
(function () {
    // The regression test. An EMPTY body is exactly the state the first measurement ran against, ~100ms after
    // mount, while the scoped workspace read was still in flight.
    var emptyPage = buildPage(0);
    var w = makeWidth(null, emptyPage);
    w.run();
    var full = 40 + 23 * 120;
    eq(w.content.style.width, (full + 200) + 'px',
        'E1 [test 15] with ZERO rows the reachable width is still the FULL width of all 23 columns');
    ok(parseInt(w.content.style.width, 10) > 600 + 200,
        'E2 [test 15] and not the empty .scroll-col clientWidth + 200 that produced the bug');

    // With rows, unchanged behaviour.
    var fullPage = buildPage(4);
    var w2 = makeWidth(null, fullPage);
    w2.run();
    eq(w2.content.style.width, (full + 200) + 'px', 'E3 [test 12] with rows the width is the same full width');

    // Test 12 — the rightmost column is reachable: the extent covers its right edge.
    var rightEdge = 40 + 23 * 120;
    ok(parseInt(w2.content.style.width, 10) >= rightEdge, 'E4 [test 12] the extent reaches the last column');

    // AND THE OLD CODE FAILS THIS. Reconstructing the pre-fix measurement proves the test is not vacuous.
    var OLD = swap(SRC, 'const skuSection = document.getElementById(\'sku-section\');\n        let maxScrollWidth = 0;',
        'let maxScrollWidth = 0;');
    OLD = swap(OLD, "        if (skuSection) {\n            Array.prototype.forEach.call(skuSection.querySelectorAll('.scroll-header'), function (h) {\n                const w = Math.max(h.scrollWidth || 0, h.offsetWidth || 0);\n                if (w > maxScrollWidth) maxScrollWidth = w;\n            });\n        }\n", '');
    var oldPage = buildPage(0);
    var wOld = makeWidth(OLD, oldPage);
    wOld.run();
    eq(wOld.content.style.width, (600 + 200) + 'px',
        'E5 [test 15] the PRE-FIX measurement returns the empty-body width — the bug, reproduced');
    ok(parseInt(wOld.content.style.width, 10) < rightEdge,
        'E6 [test 15] which cannot reach the rightmost column — this is what the user saw');
})();

// ===========================================================================================================
section('F — negative / mutation tests');
// ===========================================================================================================
(function () {
    var MUTATIONS = [
        {
            name: 'M1 the first render skips the apply',
            build: function () {
                return swap(SRC, "    applySkuColumnVisibility_();\n    setTimeout(() => { syncSkuHeaderScroll(); }, 100);",
                    "    setTimeout(() => { syncSkuHeaderScroll(); }, 100);");
            },
            probe: function (src) {
                var render = src.slice(src.indexOf('function renderSkuDetailsTable'), src.indexOf('function renderSkuDetailsTable') + 2200);
                return /applySkuColumnVisibility_\(\)/.test(render);
            }
        },
        {
            name: 'M2 Select All only changes the checkboxes',
            build: function () {
                return swap(SRC, "    for (var i = 0; i < cols.length; i++) cols[i].visible = on;\n    _skuColPrefWrite_(cols);\n    applySkuColumnVisibility_(cols);",
                    "    var boxes = document.querySelectorAll('.col-checkbox');\n    for (var i = 0; i < boxes.length; i++) boxes[i].checked = on;");
            },
            probe: function (src) {
                var p = buildPage(2), a = makeCols(src, p, fakeLS());
                a.apply();
                p.byId.checkAll.checked = false;
                a.toggleAll();
                // the TABLE must follow the control, not just the checkboxes
                return visibleHeaderCols(p, 'upcoming').length === 0 && visibleBodyColsFirstRow(p, 'running').length === 0;
            }
        },
        {
            name: 'M3 only Running in the Market gets the columns applied',
            build: function () {
                return swap(SRC, "    var sections = root.querySelectorAll('.sku-lifecycle-section');",
                    "    var sections = root.querySelectorAll('.sku-lifecycle-section[data-section=\"running\"]');");
            },
            probe: function (src) {
                var p = buildPage(2), a = makeCols(src, p, fakeLS());
                a.apply();
                a.toggle(9);
                return ['upcoming', 'running', 'phasing', 'closure'].every(function (s) {
                    return visibleHeaderCols(p, s).indexOf(9) === -1;
                });
            }
        },
        {
            name: 'M4 an old preference is treated as the complete schema (stores the VISIBLE set)',
            build: function () {
                return swap(SRC, "    for (var i = 0; i < cols.length; i++) if (!cols[i].visible) hidden.push(cols[i].key);",
                    "    for (var i = 0; i < cols.length; i++) if (cols[i].visible) hidden.push(cols[i].key);");
            },
            probe: function (src) {
                // A ROUND TRIP ACROSS A SCHEMA CHANGE, because only that exercises the WRITER. Reading a
                // hand-written preference would leave the mutation untouched - the first draft of this probe
                // did exactly that and reported a survivor as caught.
                //
                // Write the preference on an "old build" whose registry has no `pm` column, then read it back
                // on the shipped build that does. Storing HIDDEN keys leaves `pm` visible; storing VISIBLE keys
                // makes every column the old build knew about look hidden to the new one.
                var l = fakeLS();
                var oldBuild = dropLastRegistryColumn(src);
                var p0 = buildPage(1), a0 = makeCols(oldBuild, p0, l);
                a0.apply();
                a0.toggle(1);                       // the user hides exactly ONE column: Image
                var p = buildPage(2), a = makeCols(src, p, l);
                a.apply();
                var vis = visibleHeaderCols(p, 'upcoming');
                return vis.length === 22 && vis.indexOf(1) === -1 && vis.indexOf(23) !== -1 &&
                    p.byId.checkAll.checked === false && p.byId.checkAll.indeterminate === true;
            }
        },
        {
            name: 'M5 Select All keeps its own state instead of deriving it',
            build: function () {
                return swap(SRC, "        checkAll.checked = cols.length > 0 && vis === cols.length;\n        checkAll.indeterminate = vis > 0 && vis < cols.length;",
                    "        checkAll.indeterminate = false;");
            },
            probe: function (src) {
                var p = buildPage(2), a = makeCols(src, p, fakeLS());
                a.apply();
                a.toggle(5);
                // one column hidden -> the control must say indeterminate, never a confident "All"
                return p.byId.checkAll.checked === false && p.byId.checkAll.indeterminate === true;
            }
        },
        {
            name: 'M6 the apply binds a listener each time it initialises',
            build: function () {
                return swap(SRC, "        var cb = root.querySelector('.col-checkbox[data-col=\"' + c.col + '\"]');\n        if (cb) cb.checked = c.visible;",
                    "        var cb = root.querySelector('.col-checkbox[data-col=\"' + c.col + '\"]');\n        if (cb) { cb.addEventListener('change', function () {}); cb.checked = c.visible; }");
            },
            probe: function (src) {
                var p = buildPage(2), a = makeCols(src, p, fakeLS());
                a.apply(); a.apply(); a.apply();
                var n = p.root.querySelectorAll('.col-checkbox').reduce(function (t, e) { return t + e.listeners; }, 0);
                return n === 0;
            }
        },
        {
            name: 'M7 the reachable width is measured from the body only (the original defect)',
            build: function () {
                var o = swap(SRC, "const skuSection = document.getElementById('sku-section');\n        let maxScrollWidth = 0;", "let maxScrollWidth = 0;");
                return swap(o, "        if (skuSection) {\n            Array.prototype.forEach.call(skuSection.querySelectorAll('.scroll-header'), function (h) {\n                const w = Math.max(h.scrollWidth || 0, h.offsetWidth || 0);\n                if (w > maxScrollWidth) maxScrollWidth = w;\n            });\n        }\n", '');
            },
            probe: function (src) {
                var p = buildPage(0), w = makeWidth(src, p);
                w.run();
                return parseInt(w.content.style.width, 10) >= (40 + 23 * 120);
            }
        }
    ];

    var caught = 0;
    MUTATIONS.forEach(function (m) {
        // BASELINE — the probe must hold on the SHIPPED source, or it is testing nothing.
        var held = false;
        try { held = m.probe(SRC) === true; } catch (e) { held = false; console.error('  baseline threw: ' + e.message); }
        ok(held, 'F-baseline ' + m.name + ' — the probe holds on the shipped source');

        var mutated;
        try { mutated = m.build(); } catch (e) { ok(false, 'F ' + m.name + ' — ' + e.message); return; }
        ok(mutated !== SRC, 'F ' + m.name + ' — the mutation really changed the source');
        var survived;
        try { survived = m.probe(mutated) === true; } catch (e) { survived = false; }
        if (!survived) caught++;
        ok(!survived, 'F ' + m.name + ' — CAUGHT');
    });
    eq(caught, MUTATIONS.length, 'F-total all ' + MUTATIONS.length + ' mutations caught');
})();

// ===========================================================================================================
section('G — cache token and page wiring');
// ===========================================================================================================
(function () {
    // THE POLICY IS THE REPOSITORY'S, NOT THIS ROUND'S. sku-details.js sits in BOTH co-deployed sets the
    // FB-4D and FB-4E suites police, so "rotate only the file you changed" is not available here: a token
    // that moves for one member and not the others ships a half-updated page, which is the exact failure
    // those assertions exist for. The whole application set moves together, and the current token is
    // DERIVED from the append-only series in _release-order.js.
    var RO = require(require('path').join(__dirname, '_release-order.js'));
    var APP = RO.currentAppToken();
    var js = (INDEX.match(/assets\/js\/pages\/sku-details\.js\?v=([^"']+)/) || [])[1];
    var css = (INDEX.match(/assets\/css\/pages\/sku-details\.css\?v=([^"']+)/) || [])[1];
    ok(js === APP, 'G1 sku-details.js carries the current application token (' + js + ')');
    // F1-7N-FB-4F-B6 - RESTATED. This asserted that the CURRENT application token is the one THIS round
    // minted, which stops being true the moment any later application round rotates the set - and rotating it
    // together is the very contract the line above is defending. The durable statement is a FLOOR: sku-details.js
    // must never be served from a token OLDER than the round that changed it.
    ok(RO.tokenAtOrAfter(APP, 'skudisplayinit-20260901'),
        'G1b and that token is at or after the round that changed this file (' + APP + ')');
    eq((INDEX.match(new RegExp(APP, 'g')) || []).length, 18, 'G1c and all 18 application references share it');
    ok(!RO.isMapToken(APP), 'G1d it is not a map-series token');
    ok(css === 'donenotice-20260811', 'G2 sku-details.css token is UNCHANGED — the CSS was not modified');
    // The map family is untouched by an application round.
    eq((INDEX.match(new RegExp(RO.currentMapToken(), 'g')) || []).length >= 1, true, 'G2b the map token is still in use');
    ok(INDEX.indexOf('fb4er4br3-liveclosure-20260831') === -1, 'G2c and the previous application token is fully retired');
    // No duplicate references.
    eq((INDEX.match(/assets\/js\/pages\/sku-details\.js/g) || []).length, 1, 'G3 exactly one sku-details.js script reference');
    eq((INDEX.match(/assets\/css\/pages\/sku-details\.css/g) || []).length, 1, 'G4 exactly one sku-details.css style reference');
    // Unrelated tokens untouched.
    ['global-logistics-map', 'app', 'earth'].forEach(function (n) {
        var re = new RegExp('assets/js/(?:pages/)?' + n + '\\.js\\?v=([^"\']+)');
        var m = INDEX.match(re);
        if (m) ok(m[1].indexOf('skudisplayinit') === -1, 'G5 ' + n + ' token untouched');
    });
    // The CSS that makes the synthetic bar the only way to scroll is still in force — the fix depends on it.
    ok(/#sku-section \.scroll-col \{[^}]*overflow-x: hidden/.test(CSS), 'G6 .scroll-col is still overflow-x:hidden');
    ok(/#sku-section \.scroll-header \{[^}]*min-width: max-content/.test(CSS), 'G7 .scroll-header is still min-width:max-content — what makes it measurable');
    // No Apps Script / schema surface touched by this round.
    ok(!/SHIPPING_ALLOCATION|allocation_draft|sku_details_headers/i.test(colModuleSource()), 'G8 the module touches no schema surface');
})();

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
