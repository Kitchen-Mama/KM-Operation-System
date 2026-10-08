// S8-R4D-F1B-R3 — NOTICE VISIBILITY AND RESTING LAYOUT.
//
// Run: node assets/tests/notice-visibility-and-resting-layout-s8-r4d-f1b-r3.test.js
//
// TWO DEFECTS, INDEPENDENT, BOTH PRODUCING THE SAME SYMPTOM — a band of blank space that appears when the
// operator changes Country and never goes away.
//
//   D1  PAINT.  `.table-header-bar` carries `box-shadow: …, 0 -100vh 0 100vh white` at z-index 120. That
//       shadow spans [headerTop - 200vh, headerBottom] at full width. Neither notice host has a stylesheet
//       rule anywhere in the repository, so both are position:static/z-index:auto and paint UNDER it. A
//       rendered banner therefore takes its height plus its 8px margin and paints WHITE.
//   D2  LIFECYCLE.  `_irRenderStaleNotice_` is reachable only from `_irMarkSearchStale_` and the tail of
//       `_irRenderSearchGate_`. A Search against an already-loaded model goes straight to `_irApplySearch_`
//       and never touches the gate, so `stale` was set false while the BANNER NODE stayed in the document.
//
// Neither is fixed by a margin. D1 is fixed by moving the hosts BELOW the header bar (the curtain ends at the
// header's bottom edge) rather than by raising a z-index, which would make the notice occlude the column
// headings while scrolling. D2 is fixed by rendering the notice from state at the single commit point.
//
// §A drives the REAL page module through the transition. §B observes where the node actually lands. Nothing
// here passes on a CSS declaration alone.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var IR = read('assets/js/pages/inventory-replenishment.js');
var CSS = read('assets/css/pages/inventory-replenishment.css');

// =============================================================================================================
// A DOM small enough to read in full. It models only what the notices need: ids, children, insertBefore with a
// reference node, class lookup and insertAdjacentHTML.
// =============================================================================================================
function makeDom() {
  function el(tag) {
    var e = {
      tagName: tag, id: '', className: '', style: {}, childNodes: [], parentNode: null, _html: '',
      get children() { return e.childNodes; },
      get firstChild() { return e.childNodes.length ? e.childNodes[0] : null; },
      get innerHTML() { return e._html + e.childNodes.map(function (c) { return c._outer || ''; }).join(''); },
      set innerHTML(v) { e._html = String(v); e.childNodes = parse(String(v), e); },
      setAttribute: function () {}, getAttribute: function () { return null; },
      appendChild: function (c) { c.parentNode = e; e.childNodes.push(c); return c; },
      insertBefore: function (c, ref) {
        c.parentNode = e;
        var i = ref ? e.childNodes.indexOf(ref) : -1;
        if (i < 0) e.childNodes.push(c); else e.childNodes.splice(i, 0, c);
        return c;
      },
      removeChild: function (c) { var i = e.childNodes.indexOf(c); if (i >= 0) e.childNodes.splice(i, 1); c.parentNode = null; return c; },
      remove: function () { if (e.parentNode) e.parentNode.removeChild(e); },
      insertAdjacentHTML: function (pos, html) {
        var nodes = parse(String(html), e);
        if (pos === 'afterbegin') e.childNodes = nodes.concat(e.childNodes);
        else e.childNodes = e.childNodes.concat(nodes);
      },
      querySelector: function (sel) { return find(e, String(sel)); },
      querySelectorAll: function () { return []; },
      textContent: ''
    };
    return e;
  }
  function parse(html, parent) {
    var out = [], re = /<div class="([^"]+)"/g, m;
    while ((m = re.exec(html))) {
      var n = el('div'); n.className = m[1].split(' ')[0]; n._outer = html; n.parentNode = parent; out.push(n);
    }
    return out;
  }
  function find(node, sel) {
    var cls = sel.replace(/^\./, '');
    for (var i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i].className === cls) return node.childNodes[i];
      var deep = find(node.childNodes[i], sel);
      if (deep) return deep;
    }
    return null;
  }
  function byId(node, id) {
    if (node.id === id) return node;
    for (var i = 0; i < node.childNodes.length; i++) { var h = byId(node.childNodes[i], id); if (h) return h; }
    return null;
  }

  // The shipped card: header bar then body bar, exactly as assets/html/pages/inventory-replenishment.html.
  var page = el('div'); page.id = 'opsSection';
  var shell = el('div'); shell.className = 'replen-category-shell';
  var table = el('div'); table.id = 'replen-detail-table'; table.className = 'dual-layer-table';
  var header = el('div'); header.className = 'table-header-bar';
  var bodyBar = el('div'); bodyBar.className = 'table-body-bar';
  var scrollBody = el('div'); scrollBody.id = 'replenScrollBody';
  var fixedBody = el('div'); fixedBody.id = 'replenFixedBody';
  bodyBar.appendChild(fixedBody); bodyBar.appendChild(scrollBody);
  table.appendChild(header); table.appendChild(bodyBar);
  page.appendChild(shell); page.appendChild(table);

  var selects = { replenCountry: el('select'), replenMarketplace: el('select'), replenLTSFilter: el('select') };
  Object.keys(selects).forEach(function (k) { selects[k].id = k; selects[k].value = ''; });

  return {
    page: page, table: table, header: header, bodyBar: bodyBar, shell: shell, selects: selects,
    doc: {
      getElementById: function (id) { return selects[id] || byId(page, id); },
      createElement: function (t) { return el(t); },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      addEventListener: function () {}, removeEventListener: function () {},
      readyState: 'complete', body: { classList: { add: function () {}, remove: function () {} } }
    }
  };
}

// =============================================================================================================
// The REAL page module, executed against that DOM.
// =============================================================================================================
function harness(srcOverride) {
  var dom = makeDom();
  var reads = [], store = {};
  var win = {
    KM: {
      loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY' }, bindElement: function () { return null; },
        createRegion: function () { return { beginLoad: function () {}, set: function () {} }; } },
      api: { workspaceApiActive: function () { return true; },
        getWorkspace: function (n) { reads.push(n); return Promise.resolve({ success: true, data: { rows: [] } }); } },
      DB: { adaptInventoryReplenishmentWorkspace: function () { return { getMarketplaceSkus: [{ sku: 'SKU-A' }] }; } },
      scopeRegistry: { STATUS: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' },
        ensureLoaded: function () { return Promise.resolve({ status: 'READY', model: { getMarketplaces: [
          { marketplace_id: 'MP-US', country: 'US', marketplace: 'Amazon' },
          { marketplace_id: 'MP-CA', country: 'CA', marketplace: 'Amazon' }] } }); },
        getState: function () { return { status: 'READY', requests: 1, from_cache: false }; } }
    },
    localStorage: { getItem: function (k) { return store[k] == null ? null : store[k]; },
      setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    location: { hash: '' }, alert: function () {}, addEventListener: function () {}, removeEventListener: function () {}
  };
  var sb = {
    console: { log: function () {}, warn: function () {}, error: function () {} }, alert: function () {},
    window: win, document: dom.doc,
    JSON: JSON, Math: Math, Promise: Promise, Array: Array, Object: Object, String: String, Number: Number,
    Boolean: Boolean, RegExp: RegExp, Error: Error, Set: Set, Map: Map, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function () {}, clearInterval: function () {}, Date: { now: function () { return 1000000; } },
    localStorage: win.localStorage, fetch: function () { return Promise.reject(new Error('none')); }
  };
  sb.globalThis = sb; sb.self = sb;
  var ctx = vm.createContext(sb);
  try { vm.runInContext(srcOverride || IR, ctx, { filename: 'inventory-replenishment.js' }); }
  catch (e) { return { loadError: String(e && e.message) }; }
  vm.runInContext('renderReplenishment = function () {};', ctx);
  return {
    dom: dom, reads: reads,
    run: function (c) { return vm.runInContext(c, ctx); },
    pick: function (s) { dom.selects.replenCountry.value = s.country; dom.selects.replenMarketplace.value = s.marketplaceId; },
    host: function () { return dom.doc.getElementById('replenSearchState'); },
    banner: function () { var h = dom.doc.getElementById('replenSearchState'); return h ? h.querySelector('.replen-search-stale') : null; }
  };
}
function settle(n) { var p = Promise.resolve(); for (var i = 0; i < (n || 12); i++) p = p.then(function () {}); return p; }

var US = { country: 'US', marketplaceId: 'MP-US' };
var CA = { country: 'CA', marketplaceId: 'MP-CA' };
var checks = [];

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('A — THE TRANSITION, DRIVEN ON THE REAL MODULE (mount -> Search -> change -> Search)');
  var h = harness();
  ok(!h.loadError, 'A0  the shipped page module loads (' + (h.loadError || 'ok') + ')');
  if (h.loadError) return;

  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () { return settle(); }).then(function () {
    // 1 — FIRST SEARCH
    h.pick(US); h.run('searchReplenishment()');
    return settle().then(function () {
      eq(h.run('_irSearch.applied'), US, 'A1  the first Search commits US');
      eq(!!h.banner(), false, 'A2  and no stale notice exists after a fresh Search');

      // 2 — COUNTRY CHANGED, NO SEARCH.  This is the operator's reproduction.
      //
      // S8-RENDER-INTEGRITY-R2 / GATE 1 = A1 — RESTATED. The visible banner is removed by product decision.
      // A4/A5 asserted that it RENDERS; they now assert that it does not, while A3 and A6-A9 — the stale
      // STATE, which is what protects the data — are unchanged and still have to hold. The banner going away
      // must not take the guard with it, and that is exactly what this section now proves.
      h.pick(CA); h.run('_irMarkSearchStale_()');
      eq(h.run('_irSearch.stale'), true, 'A3  changing Country still marks the displayed result stale');
      eq(!!h.banner(), false, 'A4  ... and NO visible notice is rendered (Gate 1 = A1)');
      eq(h.host().style.display, 'none', 'A5  ... so the host stays empty and reserves no space');
      eq(h.run('_irSearch.applied'), US, 'A5a ... and the APPLIED scope has not moved — nothing was committed');

      // 3 — SEARCH AGAIN.  D2: the flag used to clear while the NODE stayed.
      h.run('searchReplenishment()');
      return settle().then(function () {
        eq(h.run('_irSearch.applied'), CA, 'A6  the second Search commits CA');
        eq(h.run('_irSearch.stale'), false, 'A7  ... and clears the stale FLAG');
        eq(!!h.banner(), false, 'A8  ... with still no notice node anywhere');
        eq(h.host().style.display, 'none', 'A9  ... leaving the host empty and reserving nothing');

        // 4 — REPEAT.  No accumulation, no drift.
        var seq = Promise.resolve();
        [US, CA, US].forEach(function (s) {
          seq = seq.then(function () {
            h.pick(s); h.run('_irMarkSearchStale_()');
            h.run('searchReplenishment()');
            return settle();
          });
        });
        return seq.then(function () {
          eq(h.run('_irSearch.applied'), US, 'A10 three more change+Search cycles end applied to the last one');
          eq(!!h.banner(), false, 'A11 ... with no notice left behind');
          eq(h.host().children.length, 0, 'A12 ... and NOTHING accumulated in the host');
          eq(h.host().style.display, 'none', 'A13 ... which therefore still reserves nothing');
        });
      });
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('B — WHERE THE NODE LANDS: below the sticky header, outside the white curtain');
  var h = harness();
  if (h.loadError) return;
  var host = h.run('_irStateHost_()');
  var kids = h.dom.table.children.map(function (c) { return c.id || c.className; });
  ok(!!host, 'B0  the host is created');
  eq(host.parentNode === h.dom.table, true, 'B1  it is a child of the table card');
  var iHost = h.dom.table.children.indexOf(host);
  var iHdr = h.dom.table.children.indexOf(h.dom.header);
  var iBody = h.dom.table.children.indexOf(h.dom.bodyBar);
  ok(iHdr >= 0 && iHost > iHdr, 'B2  it is AFTER .table-header-bar — outside the curtain, which ends at the header\'s bottom edge  [' + kids.join(', ') + ']');
  ok(iBody >= 0 && iHost < iBody, 'B3  and BEFORE .table-body-bar, so it reads as a notice bar above the rows');
  eq(h.dom.table.firstChild === host, false, 'B4  it is NOT the first child any more (F1B put it there, inside the curtain)');
  eq(h.run('_irStateHost_()') === host, true, 'B5  still idempotent — one node however many producers ask');
  // The integrity notice takes the same position by the same anchor.
  ok(/tbl\.insertBefore\(host, \(typeof _irNoticeAnchor_ === 'function'\) \? _irNoticeAnchor_\(tbl\) : null\)/.test(IR),
    'B6  the render-integrity notice uses the SAME anchor, so the two cannot drift apart');
  ok(/function _irNoticeAnchor_\(table\)/.test(IR), 'B7  and the anchor is ONE named owner, not two copies of a selector');
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('C — THE CURTAIN IS INTACT AND WAS NOT FOUGHT WITH A Z-INDEX');
  function block(sel) { var i = CSS.indexOf(sel); if (i === -1) return ''; var o = CSS.indexOf('{', i), c = CSS.indexOf('}', o); return CSS.slice(o, c); }
  var hdr = block('#ops-section .table-header-bar {');
  ok(/0 -100vh 0 100vh white/.test(hdr), 'C1  the header bar still paints its white curtain (nothing was weakened)');
  ok(/z-index:\s*var\(--km-sticky-z-header-1, 120\)/.test(hdr), 'C2  ... still at z-index 120');
  ok(/z-index:\s*var\(--km-sticky-z-cat-rail, 125\)/.test(block('#ops-section .replen-category-shell {')),
    'C3  the category shell still escapes it at 125 — the existing, correct arrangement is preserved');
  // The fix is a POSITION. If a z-index had been used instead, the notice would occlude the column headings
  // while scrolling past them, which is the trade this round deliberately refused.
  ok(!/#replenSearchState/.test(CSS) && !/#replen-render-integrity/.test(CSS),
    'C4  NO stylesheet rule was added for either notice host — the repair is where the node sits, not what it paints over');
  ok(/position:\s*sticky/.test(hdr), 'C5  the table header is still sticky');
  ok(/top:\s*calc\(var\(--km-sticky-top-base[^)]*\)\s*\+\s*var\(--km-replen-cat-rail-h/.test(hdr),
    'C6  ... and still pins below the toolbar PLUS the live category-rail height');
  ok(/position:\s*sticky/.test(block('#ops-section .replen-control-panel {')), 'C7  the control panel is still sticky');
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('D — RESTING GEOMETRY UNCHANGED: no margin moved, no height invented');
  function block(sel) { var i = CSS.indexOf(sel); if (i === -1) return ''; var o = CSS.indexOf('{', i), c = CSS.indexOf('}', o); return CSS.slice(o, c); }
  var a = (block('#ops-section .replen-control-panel {').match(/margin-bottom:\s*([^;]+);/) || [])[1];
  var b = (block('#ops-section .replen-category-shell {').match(/margin-bottom:\s*([^;]+);/) || [])[1];
  ok(!!a && !!b, 'D1  both inter-block gaps are still declared');
  eq(String(a).trim(), String(b).trim(), 'D2  and still declared IDENTICALLY (' + String(a).trim() + ')');
  ok(/var\(--space-lg/.test(String(a)), 'D3  from the design token, not a literal');
  ok(/margin-top:\s*0/.test(block('#ops-section .dual-layer-table {')), 'D4  the table still adds no margin of its own');
  ok(!/min-height|height:/.test(block('#ops-section .replen-category-shell {')), 'D5  no fixed height was introduced on the shell');
  ok(/scrollbar-gutter:\s*stable/.test(block('#ops-section .replen-category-rail {')), 'D6  the rail still reserves its scrollbar gutter');
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('E — WARNINGS COEXIST AND SURVIVE, AT THE NEW POSITION');
  var h = harness();
  if (h.loadError) return;
  var host = h.run('_irStateHost_()');
  // A data-loss warning, placed exactly as _irRenderUnsavedBanner_ places it.
  host.insertAdjacentHTML('afterbegin', '<div class="replen-unsaved-banner">unsaved</div>');
  host.style.display = '';
  h.run('_irSearch.applied = { country: "US", marketplaceId: "MP-US" }; _irSearch.stale = true;');
  h.run('_irRenderStaleNotice_()');
  // S8-RENDER-INTEGRITY-R2 — RESTATED for Gate 1 = A1. The stale notice no longer renders, so E2/E3 can no
  // longer be about it standing beside the warning. What this section exists to protect is the OTHER
  // direction, and it matters more: the data-loss warning must survive a Country change. Removing the
  // informational notice must not take the "Unsaved — database update failed" banner with it.
  ok(!!host.querySelector('.replen-unsaved-banner'), 'E1  the unsaved-write warning SURVIVES a Country change');
  eq(!!host.querySelector('.replen-search-stale'), false, 'E2  and no stale notice is rendered beside it (Gate 1 = A1)');
  eq(host.children.map(function (c) { return c.className; }), ['replen-unsaved-banner'],
    'E3  the host holds the data-loss warning and nothing else');
  // A Search clears ONLY the stale notice.
  h.run('_irSearch.stale = false;');
  h.run('_irRenderStaleNotice_()');
  ok(!!host.querySelector('.replen-unsaved-banner'), 'E4  clearing the stale notice does not clear the warning');
  ok(!host.querySelector('.replen-search-stale'), 'E5  ... and the stale notice itself is gone');
  eq(host.style.display, '', 'E6  the host stays visible while any warning remains');
  host.removeChild(host.querySelector('.replen-unsaved-banner'));
  h.run('_irRenderStaleNotice_()');
  eq(host.style.display, 'none', 'E7  and hides only when it is genuinely empty');
  // The host is still below the header in this arrangement, so a VISIBLE warning is a readable one.
  ok(h.dom.table.children.indexOf(host) > h.dom.table.children.indexOf(h.dom.header),
    'E8  every one of these warnings now sits outside the curtain');
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('F — THE SCOPE GUARD AND THE SEARCH COMMIT ARE UNTOUCHED');
  var h = harness();
  if (h.loadError) return;
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () { return settle(); }).then(function () {
    h.pick(US); h.run('searchReplenishment()');
    return settle().then(function () {
      eq(h.run('_irAppliedScopeKey_()'), 'us|MP-US', 'F1  the F1A scope key still tracks the applied scope');
      eq(h.run('_irResultMatchesAppliedScope_({ appliedScopeKey: "ca|MP-CA" })'), false, 'F2  a foreign stamp is still refused');
      eq(h.run('_irResultMatchesAppliedScope_({})'), false, 'F3  an unstamped result is still refused');
      eq((IR.match(/_irSearch\.applied = \{/g) || []).length, 1, 'F4  `applied` is still assigned in exactly ONE place');
      // F1B: a selector change still never commits, and a warm Search still costs no read.
      var before = h.reads.length;
      h.pick(CA); h.run('_irMarkSearchStale_()');
      eq(h.run('_irSearch.applied'), US, 'F5  a selector change still commits nothing');
      eq(h.reads.length, before, 'F6  ... and still issues no read');
      h.run('searchReplenishment()');
      return settle().then(function () {
        eq(h.reads.length, before, 'F7  and the warm Search still commits with ZERO further reads (F1B preserved)');
        eq(h.run('_irSearch.applied'), CA, 'F8  ... having committed the new scope');
      });
    });
  });
}));

// =============================================================================================================
checks.push(Promise.all(checks.slice()).then(function () {
  section('X — MUTATION COVERAGE');
  var survivors = [];
  function mut(find, replace, label, probe) {
    if (IR.indexOf(find) === -1) { survivors.push(label + ' (anchor not found)'); ok(false, 'X-' + label + ' anchor'); return Promise.resolve(); }
    var m = IR.replace(find, replace);
    return Promise.resolve().then(function () { return probe(m); }).then(function (caught) {
      ok(caught, 'X-' + label); if (!caught) survivors.push(label);
    }, function () { ok(true, 'X-' + label + ' (mutant threw — caught)'); });
  }
  var muts = [];

  // X1 — put the host back above the header bar, where the curtain reaches it.
  muts.push(mut('table.insertBefore(el, _irNoticeAnchor_(table));', 'table.insertBefore(el, table.firstChild);',
    'X1 returning the notice host into the curtain is caught', function (src) {
      var h = harness(src); if (h.loadError) return true;
      var host = h.run('_irStateHost_()');
      return h.dom.table.children.indexOf(host) <= h.dom.table.children.indexOf(h.dom.header);
    }));

  // X2 — D2 again: clear the flag, leave the node.
  // Anchored on ONE line. A multi-line anchor would carry \n and this repository is CRLF, so it would never
  // match and the mutant would report itself "not found" instead of being run.
  muts.push(mut("    _irStateHostSync_(host);\r\n}",
    "    if (_irSearch.stale) host.insertAdjacentHTML('beforeend', '<div class=\"replen-search-stale\">stale</div>');\r\n    _irStateHostSync_(host);\r\n}",
    'X2 re-introducing the visible stale banner is caught', function (src) {
      // S8-RENDER-INTEGRITY-R2 — RETARGETED. The old mutant removed the commit-point re-render and proved it
      // by the banner outliving its flag. With the banner gone (Gate 1 = A1) that probe can never fire, so
      // the mutant now attacks the DECISION instead: put the emission back and the suite must notice.
      var h = harness(src); if (h.loadError) return true;
      return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () { return settle(); }).then(function () {
        h.pick(US); h.run('searchReplenishment()');
        return settle().then(function () {
          h.pick(CA); h.run('_irMarkSearchStale_()');
          return !!h.banner();                 // a visible notice reappeared -> A4 would fail
        });
      });
    }));

  // X3 — the anchor made to return the first child again.
  muts.push(mut("return (table.querySelector ? table.querySelector('.table-body-bar') : null) || null;",
    'return table.firstChild;',
    'X3 an anchor that points back above the header is caught', function (src) {
      var h = harness(src); if (h.loadError) return true;
      var host = h.run('_irStateHost_()');
      return h.dom.table.children.indexOf(host) <= h.dom.table.children.indexOf(h.dom.header);
    }));

  // X4 — the curtain removed from the stylesheet (C1 must notice; nothing here may silently "fix" the defect
  // by deleting the thing that made it).
  muts.push(Promise.resolve().then(function () {
    var mutated = CSS.replace(', 0 -100vh 0 100vh white', '');
    var i = mutated.indexOf('#ops-section .table-header-bar {');
    var o = mutated.indexOf('{', i), c = mutated.indexOf('}', o);
    var caught = i !== -1 && !/0 -100vh 0 100vh white/.test(mutated.slice(o, c));
    ok(caught, 'X-X4 deleting the white curtain is caught'); if (!caught) survivors.push('X4');
  }));

  // X5 — "fixing" it with a z-index rule instead of a position (C4 must refuse it).
  muts.push(Promise.resolve().then(function () {
    var mutated = CSS + '\n#ops-section #replenSearchState { position: relative; z-index: 130; }\n';
    var caught = /#replenSearchState/.test(mutated);
    ok(caught, 'X-X5 a z-index patch on the notice host would be caught by C4'); if (!caught) survivors.push('X5');
  }));

  return Promise.all(muts).then(function () { eq(survivors, [], 'X0  NO mutant survived'); });
}));

Promise.all(checks).then(function () {
  console.log('\nPASS ' + passed + '  FAIL ' + failed);
  if (failed) process.exitCode = 1;
}, function (e) {
  console.log('FAIL harness threw: ' + (e && e.stack || e));
  process.exitCode = 1;
});
