/**
 * ==================================================================================================
 * P1-B8D-R7 — SCRIPTED INTERACTIONS, AND A TRACE OF WHAT THE SCREEN DID
 * ==================================================================================================
 *
 * WHY THIS FILE EXISTS. Every browser run this project has taken so far performs ONE act — choose a
 * site — and then photographs the result. That is a steady-state instrument, and the USER's report
 * is not about steady state: *"在 Company／Country／Marketplace 選定過程中，有時控制項會被重建，
 * 造成已選值跳回，必須再選一次。"* A value that jumps back is a SECOND act disagreeing with a FIRST,
 * and a harness that only ever performs a first act cannot see one. So this performs sequences.
 *
 * WHAT A STEP RECORDS, AND WHY BOTH HALVES. Every step writes down two things that are supposed to
 * be the same fact:
 *
 *   canonical — what the controller believes the scope is  (`lastController.narrowed.scope`)
 *   dom       — what the three controls on the screen are showing
 *
 * A defect of this family is precisely a divergence between those two, and either one alone is
 * consistent with itself. The controller can be perfectly right about a site nobody can see selected;
 * the screen can show a site the controller has already discarded. Only the PAIR is evidence.
 *
 * IT DRIVES REAL CONTROLS. Every pick sets a real `<select>`'s value and dispatches a real, bubbling
 * `change` — the same event a person's click produces — and every step RE-QUERIES the document
 * instead of holding a node, because the thing under investigation is whether the node survived.
 * Nothing here calls `select()`, `loadWorkspace()`, `setCapability()` or touches STATE.
 *
 * THE RAPID SEQUENCES DO NOT AWAIT. `rapid-*` dispatches the second change WITHOUT waiting for the
 * first to settle, because waiting is what makes a race disappear. `await` between two clicks is a
 * harness quietly fixing the defect it was sent to find.
 * ==================================================================================================
 */
'use strict';

(function (root) {

  var A = {};
  var TIERS = ['company', 'country', 'marketplace'];

  function page() {
    return root.KM && root.KM.pages && root.KM.pages.productStrategyBoard;
  }
  function controller() { var p = page(); return p && p.lastController; }

  /** What the CONTROLLER thinks the scope is. */
  function canonical() {
    var c = controller();
    var s = c && c.narrowed && c.narrowed.scope;
    if (!s) return { company: null, country: null, marketplace: null };
    return { company: s.company, country: s.country, marketplace: s.marketplace };
  }

  /**
   * What the SCREEN is showing, per tier, and in which shape.
   *
   * A resolved tier renders as read-only context rather than as a dropdown holding the value it
   * already has, so "there is no <select> for Country" is a legitimate answer and NOT a missing
   * control. The shape is recorded beside the value so the two can never be confused: a tier that
   * has become `none` when it should be `select` is a control that went away.
   */
  function domScope(doc) {
    var out = {};
    TIERS.forEach(function (dim) {
      var sel = doc.querySelector('[data-psb-site-dim="' + dim + '"]');
      if (sel) {
        out[dim] = { shape: sel.disabled ? 'select-disabled' : 'select',
          value: String(sel.value || ''), options: sel.options.length,
          id: sel.id || null };
        return;
      }
      var ctx = doc.querySelector('[data-psb-site-value="' + dim + '"]');
      if (ctx) { out[dim] = { shape: 'context', value: String(ctx.textContent || '') }; return; }
      out[dim] = { shape: 'none', value: '' };
    });
    return out;
  }

  /** Do the canonical scope and the screen agree, tier by tier? */
  function agreement(doc) {
    var can = canonical();
    var dom = domScope(doc);
    var bad = [];
    TIERS.forEach(function (dim) {
      var c = can[dim] === null || can[dim] === undefined ? '' : String(can[dim]);
      var d = dom[dim].shape === 'none' ? '' : dom[dim].value;
      if (c !== d) bad.push(dim + ': canonical=' + JSON.stringify(c) + ' dom=' + JSON.stringify(d)
        + ' (' + dom[dim].shape + ')');
    });
    return bad;
  }

  function wire() { return root.__wire || null; }
  function requestCount(action) {
    var w = wire();
    return w && typeof w.countOf === 'function' ? w.countOf(action) : -1;
  }

  function stateHostText(doc) {
    var h = doc.getElementById('psb-state-host');
    return h ? String(h.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  /** The site the BOARD is currently showing, read off its own context row rather than inferred. */
  function renderedSite(doc) {
    var out = {};
    ['fCompany', 'fCountry', 'fMarketplace'].forEach(function (id) {
      var n = doc.querySelector('[data-context-for="' + id + '"]');
      var s = doc.getElementById(id);
      out[id] = n ? String(n.textContent || '').trim() : (s ? String(s.value || '') : null);
    });
    return out;
  }

  /**
   * WHERE THE FOCUS IS. A control that is destroyed and rebuilt takes the focus ring with it and
   * hands it back to `<body>`, and to a person operating the page from the keyboard that is
   * indistinguishable from "my choice was thrown away": the next keystroke does nothing, so they
   * go back and choose it again. Recorded as a first-class field, not inferred from the value.
   */
  function focusNow(doc) {
    var el = doc.activeElement;
    if (!el || el === doc.body || el === doc.documentElement) return 'body';
    return (el.tagName || '?').toLowerCase()
      + (el.id ? '#' + el.id : '')
      + (el.getAttribute && el.getAttribute('data-psb-site-dim')
        ? '[' + el.getAttribute('data-psb-site-dim') + ']' : '');
  }

  /** One row of the trace. Every field is measured, none is assumed. */
  function step(doc, label) {
    var c = controller();
    return {
      step: label,
      focus: focusNow(doc),
      canonical: canonical(),
      dom: domScope(doc),
      disagreements: agreement(doc),
      complete: !!(c && c.narrowed && c.narrowed.complete),
      mounted: !!(c && c.mounted),
      inFlight: !!(c && c.inFlight),
      dropped: c ? c.dropped : null,
      state: c ? c.state : null,
      stateText: stateHostText(doc),
      renderedSite: renderedSite(doc),
      workspaceRequests: requestCount('productPricing.workspace.get'),
      universeRequests: requestCount('productPricing.siteUniverse.get'),
      /* WHAT IS STILL ON SCREEN BELOW THE NOTICE. A state host that says "choose a site" proves
         nothing on its own; the question is whether the PREVIOUS site's board is still sitting
         under it with its own copy of the three values. Both are measured, never inferred. */
      /* CATEGORY AND SERIES, WHICH BELONG TO THE SITE THAT IS LOADED. Carried across a site change
         they would be a filter naming something the new site does not have. */
      boardFilters: (function () {
        function readOne(selId, ctxId, triggerId) {
          var sel = doc.getElementById(selId);
          if (sel) {
            return { shape: 'select', value: String(sel.value || ''),
              options: Array.prototype.map.call(sel.options, function (o) { return o.value; }) };
          }
          var ctx = doc.getElementById(ctxId);
          if (ctx) return { shape: 'context', value: String(ctx.textContent || '').trim() };
          var trg = triggerId ? doc.getElementById(triggerId) : null;
          if (trg) return { shape: 'trigger', value: String(trg.textContent || '').trim() };
          return { shape: 'none', value: '' };
        }
        return {
          category: readOne('fCategory', 'fCategoryContext', 'catMore'),
          series: readOne('fSeries', 'fSeriesContext', null)
        };
      }()),
      /* HOW MANY CONTROLS CLAIM TO SET A SITE. One panel, one owner: the answer is 3 (the page's
         three tiers) and never 6. */
      /* THE CATEGORY OPTIONS THE BOARD IS ACTUALLY OFFERING, read by opening the menu the way a
         person does. The trigger's label alone cannot answer "is this category legal on the site
         that is now loaded" - it shows whatever STATE.category says, which is exactly the value
         under suspicion after a site change. */
      categoryMenu: (function () {
        var trg = doc.getElementById('catMore');
        if (!trg) return null;
        var wasOpen = trg.getAttribute('aria-expanded') === 'true';
        if (!wasOpen) trg.click();
        var items = Array.prototype.map.call(
          doc.querySelectorAll('.catmenu-item'),
          function (b) { return String(b.textContent || '').trim().replace(/\s+\(\d+\)$/, ''); });
        var on = Array.prototype.map.call(
          doc.querySelectorAll('.catmenu-item.is-on'),
          function (b) { return String(b.textContent || '').trim().replace(/\s+\(\d+\)$/, ''); });
        if (!wasOpen) trg.click();
        return { offered: items, selected: on };
      }()),
      siteControlCount: doc.querySelectorAll('[data-psb-site-dim], [data-psb-site-value]').length
        + doc.querySelectorAll('#scopeFields #fCompany, #scopeFields #fCountry,'
          + ' #scopeFields #fMarketplace, #scopeFields [data-context-for="fCompany"],'
          + ' #scopeFields [data-context-for="fCountry"],'
          + ' #scopeFields [data-context-for="fMarketplace"]').length,
      filterPanels: doc.querySelectorAll('.psb-filters').length,
      chartHelpIcons: doc.querySelectorAll('.info-btn').length,
      pageHelpButtons: doc.querySelectorAll('.psb-help__btn').length,
      axisPriceRows: (function () {
        var out = [];
        Array.prototype.slice.call(doc.querySelectorAll('#view .xsub')).forEach(function (t) {
          var v = String(t.textContent || '').trim();
          if (v !== '') out.push(v);
        });
        return out;
      }()),
      boardOnScreen: (function () {
        var v = doc.getElementById('view');
        var sc = doc.getElementById('scope');
        function vis(n) {
          if (!n) return false;
          var r = n.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && String(n.textContent || '').trim() !== '';
        }
        return { view: vis(v), scope: vis(sc),
          charts: doc.querySelectorAll('#view svg.chart, #view svg').length,
          siteEchoes: doc.querySelectorAll('[data-context-for=\"fCompany\"],'
            + ' #fCompany').length };
      }())
    };
  }

  /**
   * Set one tier and dispatch a real change. Returns false when there is no control to use — which
   * is a finding, not an error: the ten-step sequence has to be able to say "the screen offered no
   * way to do this" in the same voice it says everything else.
   */
  /**
   * DID THE CONTROL SURVIVE? A mark put on the live node before the pick and looked for afterwards.
   *
   * FOCUS ALONE CANNOT ANSWER THIS any more, because the repaint now PLACES the focus when it has
   * to replace a control - which is the right behaviour and which would hide a renderer that went
   * back to rebuilding everything. Node identity is the property; focus is a consequence of it.
   * The mark is an expando this file owns, so nothing in the shipped code carries a test affordance.
   */
  var MARK = 0;
  function markControls(doc) {
    MARK++;
    TIERS.forEach(function (d) {
      var n = doc.querySelector('[data-psb-site-dim="' + d + '"]')
        || doc.querySelector('[data-psb-site-value="' + d + '"]');
      if (n) n.__psbMark = MARK;
    });
    return MARK;
  }
  function survivors(doc, mark) {
    var out = [];
    TIERS.forEach(function (d) {
      var n = doc.querySelector('[data-psb-site-dim="' + d + '"]')
        || doc.querySelector('[data-psb-site-value="' + d + '"]');
      if (n && n.__psbMark === mark) out.push(d);
    });
    return out;
  }
  A.markControls = markControls;
  A.survivors = survivors;

  function pick(doc, dim, value) {
    var sel = doc.querySelector('[data-psb-site-dim="' + dim + '"]');
    if (!sel || sel.disabled) return false;
    var has = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (String(sel.options[i].value) === String(value)) has = true;
    }
    if (!has) return false;
    /* A PERSON FOCUSES A CONTROL BEFORE THEY CHANGE IT, and that is not decoration here: the whole
       question is whether the control SURVIVES the change. Setting `.value` from a script leaves the
       focus on <body>, so a run that skipped this would report "focus: body" before and after and
       conclude, from its own omission, that nothing was lost. */
    if (typeof sel.focus === 'function') sel.focus();
    sel.value = value;
    sel.dispatchEvent(new root.Event('change', { bubbles: true }));
    return true;
  }

  /** Open the board's category menu, click the named option, and let it close itself. */
  function pickCategory(doc, value) {
    var trg = doc.getElementById('catMore');
    if (!trg) return false;
    if (trg.getAttribute('aria-expanded') !== 'true') trg.click();
    var items = Array.prototype.slice.call(doc.querySelectorAll('.catmenu-item'));
    var hit = null;
    items.forEach(function (b) {
      var t = String(b.textContent || '').trim().replace(/\s+\(\d+\)$/, '');
      if (t === value) hit = b;
    });
    if (!hit) { trg.click(); return false; }
    hit.click();
    return true;
  }

  /** A real turn of the event loop. Not a fixed wait for a fix — a wait for the browser. */
  function tick(ms) {
    return new Promise(function (res) { setTimeout(res, ms === undefined ? 60 : ms); });
  }

  /* ================================================================================================
     THE SEQUENCES
     ============================================================================================== */

  var ACTS = {};

  /**
   * §4 — THE TEN STEPS, IN ORDER, THROUGH THE SCREEN.
   *
   * Company, then the auto-convergence, then Marketplace, then the load, then a switch, then a
   * failure, then a retry, then a route change. `args.first` and `args.second` are two real sites
   * from the replayed universe.
   */
  ACTS['selection-stability'] = function (doc, args) {
    var T = [];
    var A1 = args.first, A2 = args.second;
    T.push(step(doc, '1 mounted, nothing chosen'));

    pick(doc, 'company', A1.company);
    return tick().then(function () {
      T.push(step(doc, '2 company chosen (country may auto-converge)'));
      pick(doc, 'country', A1.country);
      return tick();
    }).then(function () {
      T.push(step(doc, '3 country chosen'));
      pick(doc, 'marketplace', A1.marketplace);
      T.push(step(doc, '4 marketplace chosen — workspace loading'));
      return tick(500);
    }).then(function () {
      T.push(step(doc, '5 workspace ready'));
      /* 6 — THE SWITCH. A different site, chosen from the top, the way a person changes their mind. */
      pick(doc, 'company', A2.company);
      return tick();
    }).then(function () {
      T.push(step(doc, '6a switched company'));
      pick(doc, 'country', A2.country);
      return tick();
    }).then(function () {
      pick(doc, 'marketplace', A2.marketplace);
      return tick(500);
    }).then(function () {
      T.push(step(doc, '6b switched site loaded'));
      /* 10 — A ROUTE CHANGE. The sidebar child for another view of THIS page. The selection must
         survive it: moving between views of one board is not leaving the board. */
      var tab = doc.querySelectorAll('#nav .km-tab-rail__tab')[3];
      if (tab) tab.click();
      return tick(200);
    }).then(function () {
      T.push(step(doc, '10 after an in-page view change'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * RAPID, AND DELIBERATELY WITHOUT AWAITING. Three picks dispatched back to back inside one task,
   * the way a person who knows what they want operates three dropdowns. Nothing here waits for the
   * page to settle between them, because a wait is how a race stops being one.
   */
  ACTS['rapid-picks'] = function (doc, args) {
    var T = [];
    var S = args.first;
    T.push(step(doc, '1 before'));
    pick(doc, 'company', S.company);
    T.push(step(doc, '2 right after company, no await'));
    pick(doc, 'country', S.country);
    T.push(step(doc, '3 right after country, no await'));
    pick(doc, 'marketplace', S.marketplace);
    T.push(step(doc, '4 right after marketplace, no await'));
    return tick(600).then(function () {
      T.push(step(doc, '5 settled'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * THE STALE ANSWER. Choose the SLOW site completely, then — before its workspace lands — choose
   * the fast one. The slow answer arrives last and must not be rendered, must not move the chooser,
   * and must not be counted.
   */
  ACTS['stale-response'] = function (doc, args) {
    var T = [];
    var slow = args.first, fast = args.second;
    return Promise.resolve().then(function () {
      pick(doc, 'company', slow.company); return tick();
    }).then(function () {
      pick(doc, 'country', slow.country); return tick();
    }).then(function () {
      pick(doc, 'marketplace', slow.marketplace);
      T.push(step(doc, '1 slow site requested'));
      return tick(40);
    }).then(function () {
      /* SUPERSEDE IT WHILE IT IS STILL IN THE AIR. */
      pick(doc, 'company', fast.company); return tick();
    }).then(function () {
      pick(doc, 'country', fast.country); return tick();
    }).then(function () {
      pick(doc, 'marketplace', fast.marketplace);
      T.push(step(doc, '2 fast site requested while the slow one is outstanding'));
      return tick(200);
    }).then(function () {
      T.push(step(doc, '3 fast answer in'));
      return tick(600);
    }).then(function () {
      T.push(step(doc, '4 after the slow answer has had time to land'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * A FAILURE, THEN A RETRY. The workspace read is refused; the chooser must still show the site
   * that was chosen, and re-picking the same marketplace must be allowed to ask again — the
   * same-site guard exists to stop an unbounded queue, not to strand a person on a failure.
   */
  ACTS['failure-retry'] = function (doc, args) {
    var T = [];
    var S = args.first;
    return Promise.resolve().then(function () {
      pick(doc, 'company', S.company); return tick();
    }).then(function () {
      pick(doc, 'country', S.country); return tick();
    }).then(function () {
      pick(doc, 'marketplace', S.marketplace); return tick(300);
    }).then(function () {
      T.push(step(doc, '1 workspace refused'));
      /* THE SERVER RECOVERS. Nothing in the page is touched; the transport stops failing. */
      if (root.__wire && typeof root.__wire.stopFailing === 'function') {
        root.__recovered = true;
        root.__wire.stopFailing();
      }
      /* RE-PICK THE SAME MARKETPLACE — which is the only control a person has after a failure. */
      var sel = doc.querySelector('[data-psb-site-dim="marketplace"]');
      if (sel) { sel.dispatchEvent(new root.Event('change', { bubbles: true })); }
      T.push(step(doc, '2 re-picked the same marketplace'));
      return tick(400);
    }).then(function () {
      T.push(step(doc, '3 after the retry'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * THE SAME SITE, REPEATEDLY. Ten changes dispatched on the marketplace control that already
   * carries that value. The request count must not climb.
   */
  ACTS['repeat-same-site'] = function (doc, args) {
    var T = [];
    var S = args.first;
    return Promise.resolve().then(function () {
      pick(doc, 'company', S.company); return tick();
    }).then(function () {
      pick(doc, 'country', S.country); return tick();
    }).then(function () {
      pick(doc, 'marketplace', S.marketplace); return tick(400);
    }).then(function () {
      T.push(step(doc, '1 loaded once'));
      var sel = doc.querySelector('[data-psb-site-dim="marketplace"]');
      for (var i = 0; i < 10; i++) {
        if (sel) sel.dispatchEvent(new root.Event('change', { bubbles: true }));
      }
      return tick(400);
    }).then(function () {
      T.push(step(doc, '2 after ten more changes on the same value'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * THE ROUTE, THROUGH THE SIDEBAR THE SHELL BUILT. §2 asks whether a route change clears the
   * selection, and the only honest way to ask is to click the thing a person clicks: the
   * Product Strategy child in the real sidebar, which calls `showProductStrategyView` ->
   * `showSection` -> the lifecycle. Clicking the in-page tab rail would be asking a different
   * question, because the rail never leaves the page.
   */
  ACTS['route-change'] = function (doc, args) {
    var T = [];
    var S = args.first;
    function children() {
      return doc.querySelectorAll('.menu-children[data-parent="product-strategy"] .menu-item');
    }
    return Promise.resolve().then(function () {
      pick(doc, 'company', S.company); return tick();
    }).then(function () {
      pick(doc, 'country', S.country); return tick();
    }).then(function () {
      pick(doc, 'marketplace', S.marketplace); return tick(500);
    }).then(function () {
      T.push(step(doc, '1 site loaded'));
      var kids = children();
      T.push({ step: 'sidebar children found', count: kids.length,
        labels: Array.prototype.map.call(kids, function (k) {
          return String(k.textContent || '').trim();
        }) });
      if (kids[2]) kids[2].click();
      return tick(400);
    }).then(function () {
      T.push(step(doc, '2 after clicking a sidebar child of this page'));
      var kids = children();
      if (kids[4]) kids[4].click();
      return tick(400);
    }).then(function () {
      T.push(step(doc, '3 after clicking a second sidebar child'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * THE PRODUCTION SHAPE, WHICH IS NOT THE DETERMINISTIC ONE. The live universe has three companies
   * whose ladders are all different: one company with a single country and three marketplaces, one
   * with five countries and a single marketplace each, one with a single country and two
   * marketplaces. Every AUTO-CONVERGENCE this page can perform is in that set, and the deterministic
   * capture contains none of them — which is why every suite was green about a screen the USER
   * could not keep a selection in.
   */
  ACTS['ladder-shapes'] = function (doc, args) {
    var T = [];
    var seq = args.sequence || [];
    var i = 0;
    T.push(step(doc, '0 start'));
    function next() {
      if (i >= seq.length) { root.__trace = T; return Promise.resolve(T); }
      var act = seq[i++];
      var mark = markControls(doc);
      /* CATEGORY IS NOT A SITE TIER, and it is not a <select> either — it is the board's searchable
         menu. Driven here the way a person drives it, because "does an illegal category survive a
         site change" cannot be asked without first choosing a legal one. */
      var done = act.dim === 'category' ? pickCategory(doc, act.value)
        : pick(doc, act.dim, act.value);
      return tick(act.wait === undefined ? 350 : act.wait).then(function () {
        var s = step(doc, i + ' ' + act.dim + '=' + act.value
          + (done ? '' : '  [NO CONTROL TO USE]'));
        /* WHICH OF THE THREE CONTROLS IS THE SAME NODE IT WAS BEFORE THIS PICK. A tier whose
           OPTIONS changed is legitimately rebuilt; a tier that only changed VALUE must not be. */
        s.survivedThePick = survivors(doc, mark);
        s.pickedDim = act.dim;
        T.push(s);
        return next();
      });
    }
    return next();
  };

  /**
   * THE PRICE-ADJUSTMENT DRAWER: open it, apply a scenario, close it, open it again.
   *
   * Six questions in one sequence, and each of them is a measurement rather than a click that did
   * not throw: is there exactly one control that closes it; does closing actually close it or only
   * hide it; where does the focus go; is the scenario still applied afterwards; is the unsubmitted
   * form still there when it reopens; and can anything inside it still take a click or a tab stop
   * while it is shut.
   */
  ACTS['drawer-close'] = function (doc, args) {
    var T = [];
    var S = args.first;
    function drawerState(label) {
      var d = doc.getElementById('scenarioDrawer');
      var closers = Array.prototype.slice.call(doc.querySelectorAll('#scenarioDrawer button'))
        .filter(function (b) {
          var t = String(b.textContent || '').trim();
          return t === '×' || /close/i.test(b.getAttribute('aria-label') || '');
        });
      var box = d ? d.getBoundingClientRect() : null;
      var cs = d ? root.getComputedStyle(d) : null;
      /* CLOSED MEANS NOT THERE. A panel that is merely transparent or moved off-screen still takes
         a click at its old coordinates and still holds tab stops, and both of those are how a
         "closed" drawer swallows the next thing a person does. */
      var atCentre = (box && box.width > 0)
        ? doc.elementFromPoint(Math.round(box.left + box.width / 2),
          Math.round(box.top + box.height / 2)) : null;
      var focusables = d
        ? doc.querySelectorAll('#scenarioDrawer button, #scenarioDrawer select,'
          + ' #scenarioDrawer input, #scenarioDrawer [tabindex]').length : 0;
      var reachable = 0;
      if (d) {
        Array.prototype.slice.call(doc.querySelectorAll('#scenarioDrawer button,'
          + ' #scenarioDrawer select, #scenarioDrawer input')).forEach(function (n2) {
          var r = n2.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) reachable++;
        });
      }
      var scenRow = doc.querySelector('[data-layer="scenario"]');
      return {
        step: label,
        present: !!d,
        hiddenAttr: d ? d.hidden : null,
        display: cs ? cs.display : null,
        visibility: cs ? cs.visibility : null,
        pointerEvents: cs ? cs.pointerEvents : null,
        boxW: box ? Math.round(box.width) : 0,
        boxH: box ? Math.round(box.height) : 0,
        elementAtDrawerCentre: atCentre
          ? (atCentre.id || atCentre.className || atCentre.tagName) : null,
        insideDrawer: !!(atCentre && d && d.contains(atCentre)),
        closeButtons: closers.map(function (b) {
          var r = b.getBoundingClientRect();
          return { id: b.id, text: String(b.textContent || '').trim(),
            label: b.getAttribute('aria-label'), type: b.getAttribute('type'),
            w: Math.round(r.width), h: Math.round(r.height) };
        }),
        focusablesInDom: focusables,
        focusablesWithABox: reachable,
        focus: focusNow(doc),
        scenarioApplied: !!scenRow,
        scenarioChip: (function () {
          var c = doc.getElementById('scenarioChip');
          return c ? String(c.textContent || '').trim() : null;
        }()),
        formValues: (function () {
          var out = {};
          ['scSeries', 'scField', 'scAdjust', 'scValue'].forEach(function (id) {
            var n2 = doc.getElementById(id);
            out[id] = n2 ? String(n2.value || '') : null;
          });
          return out;
        }())
      };
    }
    return Promise.resolve().then(function () {
      pick(doc, 'company', S.company); return tick();
    }).then(function () {
      pick(doc, 'country', S.country); return tick();
    }).then(function () {
      pick(doc, 'marketplace', S.marketplace); return tick(500);
    }).then(function () {
      T.push(drawerState('1 loaded, drawer untouched'));
      var tg = doc.getElementById('meetingToggle');
      if (tg) { if (tg.focus) tg.focus(); tg.click(); }
      return tick(200);
    }).then(function () {
      T.push(drawerState('2 drawer open'));
      /* AN UNSUBMITTED EDIT, so "it keeps what you had" is about something. */
      var ss = doc.getElementById('scSeries');
      if (ss && ss.options.length > 1) {
        ss.value = ss.options[1].value;
        ss.dispatchEvent(new root.Event('change', { bubbles: true }));
      }
      var iv = doc.getElementById('scValue');
      if (iv) { iv.value = '17.50'; iv.dispatchEvent(new root.Event('input', { bubbles: true })); }
      return tick(150);
    }).then(function () {
      T.push(drawerState('3 a value typed, nothing applied'));
      var cl = doc.getElementById('scenarioDrawerClose');
      if (cl) cl.click();
      return tick(250);
    }).then(function () {
      T.push(drawerState('4 closed with the x'));
      var tg = doc.getElementById('meetingToggle');
      if (tg) tg.click();
      return tick(250);
    }).then(function () {
      T.push(drawerState('5 reopened'));
      root.__trace = T;
      return T;
    });
  };

  A.ACTS = ACTS;
  A.step = step;
  A.pick = pick;
  A.canonical = canonical;
  A.domScope = domScope;

  A.run = function (name, doc, args) {
    var fn = ACTS[name];
    if (typeof fn !== 'function') {
      root.__trace = [{ step: 'STOP_UNKNOWN_INTERACTION: ' + name }];
      return Promise.resolve(root.__trace);
    }
    return Promise.resolve(fn(doc, args || {}));
  };

  root.P1B8C_ACTS = A;
  if (typeof module !== 'undefined' && module.exports) { module.exports = A; }

}(typeof globalThis !== 'undefined' ? globalThis : this));
