/* P1-B7E §7 — the non-activation regression, run in a real browser.
   Installed as the FIRST script in <head>. It observes; it does not change what the page does. */
(function () {
  var P = { errors: [], rejections: [], fetches: [], assertions: [] };
  window.__KM_PROBE = P;

  window.addEventListener('error', function (e) {
    P.errors.push(String((e && e.message) || e) + ' @ ' + String((e && e.filename) || '?'));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    P.rejections.push(String((e && e.reason && e.reason.message) || e.reason || e));
  });
  (function (orig) {
    console.error = function () {
      P.errors.push('console.error: ' + Array.prototype.join.call(arguments, ' '));
      return orig.apply(console, arguments);
    };
  }(console.error));

  /* THE ONE BEHAVIOURAL STUB, AND IT IS THE NETWORK. The shell's boot capability read goes to the
     Apps Script /exec, which takes ~30s through its redirect and would either hang this load or make
     another live request. §7 is about the shell and the stylesheet, and says explicitly not to read
     live data. Every call is still RECORDED, which is what the zero-request assertion needs. */
  var realFetch = window.fetch;
  window.fetch = function (input) {
    var u = String((input && input.url) || input || '');
    P.fetches.push(u);
    if (/script\.google\.com|googleusercontent\.com/.test(u)) {
      return Promise.reject(new TypeError('blocked by P1-B7E probe'));
    }
    return realFetch.apply(window, arguments);
  };
  var RealXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    var x = new RealXHR();
    var open = x.open;
    x.open = function (m, u) { P.fetches.push(String(u)); return open.apply(x, arguments); };
    return x;
  };

  function A(name, okv, detail) { P.assertions.push({ name: name, ok: !!okv, detail: detail }); }

  function run() {
    var cs = window.getComputedStyle;

    // ---- the nine modules are loaded ------------------------------------------------------------
    A('scripts_loaded', !!(window.KM && window.KM.pages && window.KM.pages.productStrategyBoard
      && window.KM.productPricingWorkspace && window.KM_PRODUCT_STRATEGY_SITE_UNIVERSE
      && window.KM_PRODUCT_STRATEGY_LIVE_ADAPTER && window.PSB_BOARD && window.PSB_SELECTORS
      && window.PSB_CHART_LAYOUT && window.PSB_CONTRACT && window.KM_PRODUCT_PRICING_ADAPTER),
      { board: typeof window.PSB_BOARD, page: typeof (window.KM && window.KM.pages
        && window.KM.pages.productStrategyBoard) });

    // ---- no console error / no thrown script ----------------------------------------------------
    var psbErrors = P.errors.filter(function (e) { return /psb|product-strategy|productPricing/i.test(e); });
    A('no_product_strategy_errors', psbErrors.length === 0, psbErrors.slice(0, 5));
    A('no_page_errors_at_all', P.errors.length === 0, P.errors.slice(0, 5));

    // ---- navigation is invisible -----------------------------------------------------------------
    var sidebar = document.getElementById('appSidebar');
    A('no_nav_text', !!sidebar && sidebar.innerText.indexOf('Product Strategy') < 0,
      sidebar ? sidebar.innerText.replace(/\s+/g, ' ').slice(0, 160) : 'NO SIDEBAR');
    var items = Array.prototype.slice.call(document.querySelectorAll('.menu-item, .menu-parent'));
    var hits = items.filter(function (n) {
      return /product.?strategy/i.test(n.textContent + ' ' + (n.getAttribute('onclick') || ''));
    });
    A('no_nav_item', hits.length === 0, hits.length);

    // ---- the section is unreachable ---------------------------------------------------------------
    A('staged_registry', !!(window.KM && window.KM.stagedSections
      && window.KM.stagedSections['product-strategy']
      && window.KM.stagedSections['product-strategy'].enabled === false),
      window.KM && window.KM.stagedSections ? window.KM.stagedSections['product-strategy'] : null);

    var before = document.querySelectorAll('.module-section.active').length;
    var beforeIds = Array.prototype.map.call(document.querySelectorAll('.module-section.active'),
      function (n) { return n.id; });
    var threw = null;
    try { window.showSection('product-strategy'); } catch (e) { threw = String(e && e.message); }
    var afterIds = Array.prototype.map.call(document.querySelectorAll('.module-section.active'),
      function (n) { return n.id; });
    A('showSection_refused_no_throw', threw === null, threw);
    A('showSection_changed_nothing', JSON.stringify(beforeIds) === JSON.stringify(afterIds),
      { before: beforeIds, after: afterIds });
    A('section_not_injected', !document.getElementById('product-strategy-board-section'), null);
    var mount = document.getElementById('product-strategy-board-mount');
    A('mount_point_present_and_empty', !!mount && mount.children.length === 0,
      mount ? mount.children.length : 'absent');
    A('home_still_visible', before > 0 || !!document.getElementById('home-section'), beforeIds);

    // ---- zero Product Strategy requests -----------------------------------------------------------
    var psbReq = P.fetches.filter(function (u) { return /productPricing|siteUniverse/i.test(u); });
    A('zero_product_strategy_requests', psbReq.length === 0, psbReq);
    A('capability_mirror_false',
      !!(window.KM && window.KM.productPricingWorkspace
        && window.KM.productPricingWorkspace.isEnabled() === false),
      window.KM && window.KM.productPricingWorkspace
        ? window.KM.productPricingWorkspace.isEnabled() : 'no accessor');

    // ---- the stylesheet did not restyle the shell --------------------------------------------------
    // Measured against base.css's own declared values, read from the cascade rather than assumed.
    var b = cs(document.body);
    A('body_font_not_psb', b.fontFamily.indexOf('Segoe UI') !== 0 || b.lineHeight !== 'normal',
      { fontFamily: b.fontFamily, lineHeight: b.lineHeight, background: b.backgroundColor });
    A('body_line_height_is_shell', Math.abs(parseFloat(b.lineHeight) / parseFloat(b.fontSize) - 1.6) < 0.02,
      { lineHeight: b.lineHeight, fontSize: b.fontSize });

    /* THE DECISIVE MEASUREMENT: THE SAME SHELL, WITH THIS STYLESHEET ON AND OFF.
       Asserting that .filter-group is 160px was me guessing which shell rule wins — and it is 150px,
       from a rule I had not read. The question §7 actually asks is not "what is the value" but "does
       loading this sheet CHANGE it", and that is answerable without knowing any value: measure every
       shell surface, disable the sheet, measure again, and require the two to be identical. */
    var sheet = null;
    for (var i = 0; i < document.styleSheets.length; i++) {
      var href = document.styleSheets[i].href || '';
      if (href.indexOf('product-strategy-board.css') >= 0) { sheet = document.styleSheets[i]; break; }
    }
    A('psb_sheet_loaded', !!sheet, sheet ? sheet.href.split('/').pop() : 'NOT LOADED');

    var probeShell = document.createElement('div');
    probeShell.innerHTML = '<div class="filter-group"><label>x</label>'
      + '<button class="btn btn-primary" type="button">x</button>'
      + '<div class="kmf"><button class="kmf-trigger"><span class="kmf-trigger__label">a</span></button>'
      + '<div class="kmf-panel"><div class="kmf-tools"><button class="kmf-link">c</button></div>'
      + '<div class="filter-checkbox-item"><input type="checkbox"></div></div></div></div>';
    /* OUT OF FLOW. Measured in flow, these two probes changed the document height by 1.4px between
       the sheet-on and sheet-off passes — the board probe's own footprint, reported as a shell
       regression. An instrument that appears in its own reading is not measuring the page. */
    probeShell.style.cssText = 'position:absolute;left:-10000px;top:0;width:900px';
    document.body.appendChild(probeShell);
    var probeBoard = document.createElement('div');
    probeBoard.className = 'psb-page';
    probeBoard.style.cssText = probeShell.style.cssText;
    probeBoard.innerHTML = probeShell.innerHTML;
    document.body.appendChild(probeBoard);

    var WATCH = ['.filter-group', '.btn', '.kmf', '.kmf-trigger', '.kmf-panel', '.kmf-tools',
      '.kmf-link', '.filter-checkbox-item'];
    var PROPS = ['position', 'display', 'minWidth', 'maxWidth', 'flexBasis', 'height', 'padding',
      'margin', 'border', 'borderRadius', 'fontSize', 'fontFamily', 'lineHeight', 'color',
      'backgroundColor', 'transitionDuration', 'boxShadow', 'gap', 'zIndex', 'whiteSpace'];
    function snapshot() {
      var out = {};
      ['body', 'html', '.top-header', '.sidebar', '.content-area', '.menu-item'].forEach(function (sel) {
        var n = sel === 'body' ? document.body : (sel === 'html' ? document.documentElement
          : document.querySelector(sel));
        if (n) out[sel] = PROPS.map(function (p) { return cs(n)[p]; }).join('|');
      });
      WATCH.forEach(function (sel) {
        var n = probeShell.querySelector(sel);
        if (n) out['shell ' + sel] = PROPS.map(function (p) { return cs(n)[p]; }).join('|');
      });
      return out;
    }

    var withSheet = snapshot();
    if (sheet) sheet.disabled = true;
    var withoutSheet = snapshot();
    if (sheet) sheet.disabled = false;

    var changed = Object.keys(withSheet).filter(function (k) {
      return withSheet[k] !== withoutSheet[k];
    }).map(function (k) { return k + ': ' + withoutSheet[k] + '  ->  ' + withSheet[k]; });
    A('sheet_changes_nothing_in_the_shell', changed.length === 0, changed.slice(0, 10));
    A('snapshot_is_not_empty', Object.keys(withSheet).length >= 12, Object.keys(withSheet).length);

    /* THE CUSTOM PROPERTIES, UNDER THE RULE THAT ACTUALLY APPLIES TO THEM. The sheet's two `:root`
       blocks define variables on <html>, which is outside every .psb-page — so a selector scan flags
       them and a byte-comparison calls them a change. Neither is the question. A variable styles
       nothing by itself; what would matter is a SHELL variable redefined to a different value. So:
       adding a name the shell does not define is allowed, and changing one it does is not. */
    var rootOn = cs(document.documentElement);
    var declared = [];
    (sheet ? Array.prototype.slice.call(sheet.cssRules) : []).forEach(function (r) {
      if (!r.selectorText || r.selectorText.indexOf(':root') < 0 || !r.style) return;
      for (var k = 0; k < r.style.length; k++) {
        if (r.style[k].indexOf('--') === 0 && declared.indexOf(r.style[k]) < 0) declared.push(r.style[k]);
      }
    });
    var onVals = {};
    declared.forEach(function (n) { onVals[n] = rootOn.getPropertyValue(n).trim(); });
    if (sheet) sheet.disabled = true;
    var rootOff = cs(document.documentElement);
    var overridden = declared.filter(function (n) {
      var off = rootOff.getPropertyValue(n).trim();
      return off !== '' && off !== onVals[n];
    });
    var added = declared.filter(function (n) { return rootOff.getPropertyValue(n).trim() === ''; });
    if (sheet) sheet.disabled = false;
    A('sheet_declares_root_variables', declared.length > 20, declared.length);
    A('no_shell_variable_is_redefined', overridden.length === 0, overridden.slice(0, 8));
    /* THREE BUCKETS, NOT TWO. Some names only this sheet defines (added); some the shell also defines
       with the SAME value (the deliberate base.css mirror the P1-B2A suite pins, confirmed here in the
       live cascade rather than in the source); and none is redefined to a different value, which is the
       only one of the three that would be a regression. */
    var mirrored = declared.filter(function (n) {
      return added.indexOf(n) < 0 && overridden.indexOf(n) < 0;
    });
    A('token_mirror_matches_the_shell', mirrored.length > 0 && overridden.length === 0,
      { declared: declared.length, added_by_this_sheet: added.length,
        mirrored_identically: mirrored.length, redefined: overridden.length });

    /* AND IT DOES REACH THE BOARD — otherwise the assertion above would pass for a sheet that had
       simply failed to load, which is the one way to be perfectly safe and completely useless. */
    var bfg = cs(probeBoard.querySelector('.filter-group'));
    var sfg = cs(probeShell.querySelector('.filter-group'));
    A('sheet_does_reach_the_board', bfg.minWidth !== sfg.minWidth,
      { board: bfg.minWidth, shell: sfg.minWidth });
    probeShell.remove(); probeBoard.remove();

    /* No rule in the sheet matches a shell element. `:root` is excluded HERE because it is compared
       by value above; everything else must match nothing outside a .psb-page subtree. */
    var leaks = [], printBody = [], scanned = 0;
    function scan(rules, inPrint) {
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        if (r.type === 4) { scan(r.cssRules, /print/.test(r.conditionText || r.media.mediaText)); continue; }
        if (!r.selectorText) continue;
        scanned++;
        if (inPrint && /(^|,)\s*body\s*(,|$)/.test(r.selectorText)) printBody.push(r.selectorText);
        r.selectorText.split(',').forEach(function (sel) {
          sel = sel.trim();
          if (!sel || sel.indexOf('.psb-') >= 0 || sel.indexOf('#product-strategy') >= 0) return;
          if (sel === ':root' || sel === 'html' && false) return;
          if (sel.indexOf(':root') >= 0) return;
          var m;
          try { m = document.querySelectorAll(sel); } catch (e) { return; }
          for (var k = 0; k < m.length; k++) {
            if (!m[k].closest || !m[k].closest('.psb-page')) {
              leaks.push(sel + ' -> ' + (m[k].id || m[k].className || m[k].tagName));
              return;
            }
          }
        });
      }
    }
    if (sheet) { try { scan(sheet.cssRules, false); } catch (e) { leaks.push('CSSOM: ' + e.message); } }
    A('psb_sheet_rules_scanned', scanned > 200, scanned);
    A('psb_sheet_reaches_nothing_outside_board', leaks.length === 0, leaks.slice(0, 8));
    A('psb_sheet_has_no_print_body_rule', printBody.length === 0, printBody);

    var pre = document.createElement('pre');
    pre.id = 'km-probe-result';
    pre.textContent = JSON.stringify({ assertions: P.assertions, errors: P.errors,
      rejections: P.rejections, fetchCount: P.fetches.length }, null, 1);
    document.documentElement.appendChild(pre);
  }

  window.addEventListener('load', function () { setTimeout(run, 400); });
}());
