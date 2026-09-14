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

  /* ================================================================================================
     P1-B8D-R8 — WHAT IS STILL ON SCREEN, AND WHO PUT IT THERE

     Every act below asks the same question in a different place: when the page has decided it is no
     longer showing a site, IS IT STILL SHOWING ONE? R7 answered that at the one moment a promise
     settles. These answer it at the moments in between — while a read is outstanding, one animation
     frame after a host was emptied, and across an unmount the renderer was never told about.
     ============================================================================================== */

  /** What the BOARD has drawn, measured rather than inferred from the controller. */
  function boardPresence(doc) {
    function txt(id) {
      var n = doc.getElementById(id);
      return n ? String(n.textContent || '').replace(/\s+/g, ' ').trim() : null;
    }
    var view = doc.getElementById('view');
    var vb = view ? view.getBoundingClientRect() : null;
    var sec = doc.getElementById('product-strategy-board-section');
    return {
      /* IS THE PAGE EVEN ON SCREEN? A host that has been hidden rather than emptied still holds a
         board, and a renderer watching its size is told the moment it is hidden and the moment it
         comes back - which is a redraw nobody asked for, at a moment nobody is watching. */
      sectionActive: !!(sec && sec.classList && sec.classList.contains('active')),
      sectionDisplay: sec ? root.getComputedStyle(sec).display : null,
      viewW: vb ? Math.round(vb.width) : -1,
      viewChildren: view ? view.children.length : -1,
      viewH: vb ? Math.round(vb.height) : -1,
      charts: doc.querySelectorAll('#view svg').length,
      navTabs: doc.querySelectorAll('#nav li, #nav button').length,
      crumbs: txt('crumbs'),
      scopeChildren: (function () {
        var n = doc.getElementById('scope');
        return n ? n.children.length : -1;
      }()),
      /* THE BOARD'S OWN NAME FOR THE SITE IT IS DRAWING. When this disagrees with the chooser, the
         label nearest the numbers is the one naming a site nobody selected. */
      boardSite: (function () {
        var out = [];
        ['fCompany', 'fCountry', 'fMarketplace'].forEach(function (id) {
          var c = doc.querySelector('[data-context-for="' + id + '"]');
          var s = doc.getElementById(id);
          if (c) out.push(String(c.textContent || '').trim());
          else if (s) out.push(String(s.value || ''));
        });
        return out;
      }()),
      contextLine: (function () {
        var n = doc.querySelector('.cmd-context, .cmdbar-context');
        return n ? String(n.textContent || '').replace(/\s+/g, ' ').trim() : null;
      }())
    };
  }
  A.boardPresence = boardPresence;

  /** Everything the chart toolbar row offers, and whether any of it can be reached. */
  function toolbarPresence(doc) {
    var SEL = '#chartControls button, .chartctl button, .chartctl .ctl-label';
    var nodes = Array.prototype.slice.call(doc.querySelectorAll(SEL));
    var focusable = nodes.filter(function (b) {
      if (b.disabled) return false;
      if (b.hasAttribute('hidden')) return false;
      var cs = root.getComputedStyle(b);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      var ti = b.getAttribute('tabindex');
      if (ti !== null && Number(ti) < 0) return false;
      return true;
    });
    var ids = {};
    ['chartControls', 'mode-auto', 'mode-comfortable', 'mode-fullscreen', 'view-clean',
      'view-detail', 'layersToggle', 'zoom-reset', 'densityNote']
      .forEach(function (id) { ids[id] = !!doc.getElementById(id); });
    return {
      controls: nodes.length,
      focusables: focusable.length,
      labels: nodes.map(function (b) { return String(b.textContent || '').trim(); }),
      ids: ids,
      groups: doc.querySelectorAll('.chartctl .ctl-group').length,
      emptyContainers: doc.querySelectorAll('.chartctl:empty, .ctl-group:empty').length
    };
  }
  A.toolbarPresence = toolbarPresence;

  /** The sentence that used to sit under Category, wherever it was written. */
  function categoryHelperText(doc) {
    var out = [];
    Array.prototype.slice.call(doc.querySelectorAll(
      /* P1-B8D-R9 — `.chartctl .ctl-note` LEAVES THIS SELECTOR. R8 put it here because the density
         note was being removed along with the row it lives in; §4 restores that row, and the note
         is advice about Comfortable sitting inside the chart toolbar rather than a sentence hanging
         under the Category control. It is not dropped from the run: `toolbarPresence().ids` still
         reports it by name, and the R9 block measures its text. Measuring it HERE would make every
         future §3 check fail for a reason §3 is not about. */
      '.psb-filters .scope-empty, .psb-filters .scope-state, .psb-filters .cmd-context,'
      + ' .psb-filters > p, #catEmpty, #catProvenance, #scope p'))
      .forEach(function (n) {
        if (n.closest && n.closest('#scenarioDrawer')) return;
        var t = String(n.textContent || '').replace(/\s+/g, ' ').trim();
        var r = n.getBoundingClientRect();
        /* ONLY WHAT IS ON THE SCREEN. A paragraph inside a closed drawer is not a sentence under
           the Category control, and counting it would make the removal look incomplete. */
        if (r.width === 0 && r.height === 0) return;
        out.push({ id: n.id || null, cls: n.className, text: t.slice(0, 120),
          w: Math.round(r.width), h: Math.round(r.height) });
      });
    return out;
  }
  A.categoryHelperText = categoryHelperText;

  /** The scenario, in every place it shows. */
  function scenarioPresence(doc) {
    var chip = doc.getElementById('scenarioChip');
    var banner = doc.getElementById('banner');
    return {
      chip: chip ? String(chip.textContent || '').trim() : null,
      banner: banner ? String(banner.textContent || '').replace(/\s+/g, ' ').trim() : '',
      bodyClass: String(doc.body.className || ''),
      ghostRows: doc.querySelectorAll('#view [data-layer="scenario"]').length,
      formValues: (function () {
        var out = {};
        ['scSeries', 'scField', 'scAdjust', 'scValue'].forEach(function (id) {
          var n = doc.getElementById(id);
          out[id] = n ? String(n.value || '') : null;
        });
        return out;
      }()),
      /* HOW MANY SIMULATIONS ARE BEING HELD, read off the drawer's own footer rather than out of
         STATE. The count is what a person in a meeting sees; a private field is not. */
      activeOverrides: (function () {
        var n = doc.getElementById('scenarioNote');
        var m = n ? /Active overrides:\s*(\d+)/.exec(String(n.textContent || '')) : null;
        return m ? Number(m[1]) : null;
      }()),
      chipActive: (function () {
        var c = doc.getElementById('scenarioChip');
        return c ? c.getAttribute('data-active') : null;
      }()),
      simulatedMarkers: doc.querySelectorAll('#view [data-scenario="true"],'
        + ' #view .marker-scenario, #view .mk-scenario').length,
      overrideSiteKeys: (function () {
        var d = root.__psbDevState ? root.__psbDevState() : null;
        var o = d && d.overrides;
        return o ? Object.keys(o) : null;
      }())
    };
  }
  A.scenarioPresence = scenarioPresence;

  /* ================================================================================================
     P1-B8D-R9 §4 — WHAT A CONTROL ACTUALLY DID, not whether it is in the document.

     "不接受「按鈕存在」作為功能驗收" is the whole requirement, and it is a fair one: R8 removed
     nine controls and every suite stayed green, which means no suite had ever pressed one. This
     reads the properties each control is supposed to move — the drawn size of the chart, which
     layers are on, whether the Size group exists at all — so a button wired to nothing fails.
     ================================================================================================ */
  function chartShape(doc) {
    var svg = doc.querySelector('#view svg');
    var r = svg ? svg.getBoundingClientRect() : null;
    var plate = doc.querySelector('#view svg .mk-img-plate');
    var pr = plate ? plate.getBoundingClientRect() : null;
    var lc = doc.getElementById('layersCount');
    var pressed = {};
    ['mode-auto', 'mode-comfortable', 'view-clean', 'view-detail'].forEach(function (id) {
      var n = doc.getElementById(id);
      pressed[id] = n ? n.getAttribute('aria-pressed') : null;
    });
    return {
      svgW: r ? Math.round(r.width) : null,
      svgH: r ? Math.round(r.height) : null,
      /* THE PLATE IS THE ONE THING COMFORTABLE EXISTS TO CHANGE — "larger product images" is what
         the note promises, so the plate's drawn box is what proves it happened. */
      plateW: pr ? Math.round(pr.width) : null,
      layersCount: lc ? String(lc.textContent || '').trim() : null,
      layersPanel: doc.querySelectorAll('#layersPanel input[type=checkbox]').length,
      layersExpanded: (function () {
        var t = doc.getElementById('layersToggle');
        return t ? t.getAttribute('aria-expanded') : null;
      }()),
      zoomButtons: doc.querySelectorAll('#chartControls [data-zoom]').length,
      /* HOW MANY KINDS OF MARKER ARE DRAWN. Clean and Detail differ by which layers are painted,
         and a count of element classes is the only thing that separates them from outside. */
      propMarks: doc.querySelectorAll('#view svg .mk-prop').length,
      dealMarks: doc.querySelectorAll('#view svg .mk-deal').length,
      minMarks: doc.querySelectorAll('#view svg .mk-min').length,
      msrpMarks: doc.querySelectorAll('#view svg .mk-msrp').length,
      pressed: pressed,
      densityNote: !!doc.getElementById('densityNote'),
      pageOverflow: Math.round((doc.documentElement.scrollWidth || 0)
        - (doc.documentElement.clientWidth || 0)),
      toolbarOverflow: (function () {
        var c = doc.getElementById('chartControls');
        return c ? Math.round(c.scrollWidth - c.clientWidth) : null;
      }())
    };
  }
  A.chartShape = chartShape;

  /* §3 — THE SCENARIO NOTICE AS PAINTED. Computed colour, because a class name proves what the
     stylesheet says and this requirement is about what the operator sees. The stop-state's own
     border is read in the same breath so "not styled like a refusal" is a comparison. */
  function scenarioLook(doc) {
    var ban = doc.getElementById('banner');
    var cs = ban ? root.getComputedStyle(ban) : null;
    var tag = doc.querySelector('.badge-scenario-tag');
    var chip = doc.querySelector('.cmd-chip--on');
    var stop = doc.querySelector('.psb-state--stop');
    var stopCs = stop ? root.getComputedStyle(stop) : null;
    var ghost = doc.querySelector('.scen-ghost');
    return {
      bannerText: ban ? String(ban.textContent || '').replace(/\s+/g, ' ').trim() : '',
      tag: tag ? String(tag.textContent || '').trim() : null,
      tagBg: tag ? root.getComputedStyle(tag).backgroundColor : null,
      display: cs ? cs.display : null,
      bg: cs ? cs.backgroundColor : null,
      color: cs ? cs.color : null,
      borderLeftWidth: cs ? cs.borderLeftWidth : null,
      borderLeftStyle: cs ? cs.borderLeftStyle : null,
      borderLeftColor: cs ? cs.borderLeftColor : null,
      chipBg: chip ? root.getComputedStyle(chip).backgroundColor : null,
      chipColor: chip ? root.getComputedStyle(chip).color : null,
      ghostStroke: ghost ? root.getComputedStyle(ghost).stroke : null,
      stopBorder: stopCs
        ? (stopCs.borderLeftWidth + ' ' + stopCs.borderLeftStyle + ' ' + stopCs.borderLeftColor)
        : null
    };
  }
  A.scenarioLook = scenarioLook;

  function r8step(doc, label) {
    var s = step(doc, label);
    s.board = boardPresence(doc);
    s.toolbar = toolbarPresence(doc);
    s.categoryHelper = categoryHelperText(doc);
    s.scenario = scenarioPresence(doc);
    return s;
  }
  A.r8step = r8step;

  /** Every R8 measurement plus the two R9 added. */
  function r9step(doc, label) {
    var s = r8step(doc, label);
    s.shape = chartShape(doc);
    s.look = scenarioLook(doc);
    return s;
  }
  A.r9step = r9step;

  function loadSite(doc, S) {
    return Promise.resolve().then(function () {
      pick(doc, 'company', S.company); return tick();
    }).then(function () {
      pick(doc, 'country', S.country); return tick();
    }).then(function () {
      pick(doc, 'marketplace', S.marketplace); return tick(500);
    });
  }
  A.loadSite = loadSite;

  /**
   * CHANGE THE VIEWPORT, the way a person changes a window.
   *
   * WHY IT HAS TO BE DONE ON PURPOSE HERE. The harness runs with `--hide-scrollbars`, so the page
   * getting shorter never takes a scrollbar away and the content column never changes width. On a
   * real machine it does: removing two thousand pixels of board removes the scrollbar and every
   * column gets fifteen pixels wider. That is a size change nobody asked for, delivered to anything
   * watching the host, one frame after the teardown - which is the difference between this harness
   * and the operator's screen, and the reason a defect they can see was invisible here.
   *
   * The frame IS the viewport (see the runner's note on --window-size), so resizing it is a window
   * resize and not a poke at the page: no class is added, no style is written on any element the
   * product owns, and nothing inside the page is told.
   */
  function resizeViewport(px) {
    var fe = null;
    try { fe = root.frameElement; } catch (e) { fe = null; }
    if (!fe) return false;
    var cur = parseInt(String(fe.style.width || ''), 10);
    if (!cur) cur = Math.round(fe.getBoundingClientRect().width);
    fe.style.width = (cur + px) + 'px';
    return true;
  }
  A.resizeViewport = resizeViewport;

  /**
   * §5 — THE OLD BOARD MUST BE GONE BEFORE THE NEW SITE'S ANSWER ARRIVES.
   *
   * `args.slow` is served late by the replay, so the in-flight window is a real one that can be
   * measured from inside rather than a wait for a fix. Three readings: the synchronous instant
   * after the change, one animation frame later — which is where a re-entrant renderer would put
   * the board back — and after the answer lands.
   */
  /**
   * P1-B8D-R10C — THE SIX VIEWS, CLICKED BEFORE ANY CANONICAL DATA EXISTS.
   *
   * NO SITE IS CHOSEN AND NONE IS WAITED FOR. That is the whole point: production loads the scripts,
   * wires the view rail and leaves `CANON` null until a mount succeeds, so a refused or slow read
   * leaves a live rail over a board that has no data. R10B measured five uncaught TypeErrors there,
   * on the deployed bytes, while the page was showing a correct refusal.
   *
   * THE CLICK GOES THROUGH THE RAIL BUTTON, not through `PSB_BOARD.showView`. A throw inside a real
   * click handler is an UNCAUGHT error and lands in `__jsErrors`; the same throw from a probe's own
   * call would be caught by the probe and counted as nothing. The seam call is kept only as a
   * fallback for a page whose rail has not been drawn, and it records that it used it.
   */
  ACTS['null-canonical-views'] = function (doc, args) {
    var T = [];
    var VIEWS = ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'];
    function errCount() { try { return (root.__jsErrors || []).length; } catch (e) { return 0; } }
    return tick(400).then(function () {
      var s0 = step(doc, '0 loaded, no site chosen');
      s0.jsErrors = errCount();
      s0.mounted = !!(root.PSB_BOARD && root.PSB_BOARD.isMounted && root.PSB_BOARD.isMounted());
      T.push(s0);
      var i = 0;
      function next() {
        if (i >= VIEWS.length) return Promise.resolve();
        var id = VIEWS[i];
        i++;
        var before = errCount();
        var via = 'rail';
        var btn = doc.getElementById('nav-' + id);
        if (btn && typeof btn.click === 'function') { btn.click(); }
        else {
          via = 'seam';
          try {
            if (root.PSB_BOARD && typeof root.PSB_BOARD.showView === 'function') {
              root.PSB_BOARD.showView('product-strategy/' + id);
            } else { via = 'unavailable'; }
          } catch (e) {
            via = 'seam-threw';
            try { root.__jsErrors.push(String((e && e.message) || e)); } catch (x) {}
          }
        }
        return tick(140).then(function () {
          var s = step(doc, i + ' view ' + id);
          s.view = id;
          s.via = via;
          s.newJsErrors = errCount() - before;
          s.mounted = !!(root.PSB_BOARD && root.PSB_BOARD.isMounted && root.PSB_BOARD.isMounted());
          s.currentRoute = (root.PSB_BOARD && typeof root.PSB_BOARD.currentRoute === 'function')
            ? root.PSB_BOARD.currentRoute() : null;
          T.push(s);
          return next();
        });
      }
      return next();
    }).then(function () { root.__trace = T; return T; });
  };
  ACTS['deferred-teardown'] = function (doc, args) {
    var T = [];
    var A1 = args.first, A2 = args.second;
    return loadSite(doc, A1).then(function () {
      T.push(r8step(doc, '1 site A loaded'));
      /* THE SWITCH: one control, both sites complete, so there is no incomplete step in between. */
      pick(doc, 'marketplace', A2.marketplace);
      T.push(r8step(doc, '2 site B chosen — SAME TURN, nothing awaited'));
      return tick(0);
    }).then(function () {
      T.push(r8step(doc, '3 one tick later, B still outstanding'));
      return tick(120);
    }).then(function () {
      T.push(r8step(doc, '4 a frame later, B still outstanding'));
      /* THE VIEWPORT MOVES WHILE B IS STILL OUTSTANDING. Nothing about the SITE has changed; only
         the window has. A board that comes back here is a board redrawing itself for a site the
         page has already stopped believing in. */
      var resized = resizeViewport(-40);
      return tick(250).then(function () { return resized; });
    }).then(function (resized) {
      var s4b = r8step(doc, '4b viewport changed while B is outstanding');
      s4b.viewportResized = resized;
      T.push(s4b);
      return tick(900);
    }).then(function () {
      T.push(r8step(doc, '5 B answered'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * §7 — LEAVE AND COME BACK, THROUGH THE LIFECYCLE THE SHELL ACTUALLY CALLS.
   *
   * `onUnmount()` then `onMount()` — the same two functions `KM.lifecycle` invokes when a person
   * clicks another page and clicks back. Nothing here reaches into the controller.
   */
  ACTS['leave-return'] = function (doc, args) {
    var T = [];
    var P = page();
    var S = args.first;
    return loadSite(doc, S).then(function () {
      T.push(r8step(doc, '1 site loaded, board up'));
      P.onUnmount();
      return tick(200);
    }).then(function () {
      T.push(r8step(doc, '2 unmounted (another page is showing)'));
      /* A LIVE HANDLER ON A NODE THE UNMOUNT DOES NOT REMOVE.
         `#btnPresent` lives in the PARTIAL, not in anything the board redraws, and the partial is
         fetched once and stays in the document for the life of the page. `boot()` binds it once,
         and its handler calls `render()`. So after an unmount there is still a live path from an
         ordinary event into the renderer — and a renderer that has not been told to stop answers
         it by repainting the whole board into hosts the page has just emptied.

         THIS IS THE DETERMINISTIC ROUTE INTO THE SAME DEFECT the size observer produces. The
         observer answers on an animation frame, and a headless browser under a virtual-time budget
         does not deliver those reliably: the trace that FOUND this saw it three runs in six. A
         click is delivered every time. */
      var bp = doc.getElementById('btnPresent');
      if (bp) bp.click();
      return tick(200);
    }).then(function () {
      T.push(r8step(doc, '2b a live handler fires while the page is away'));
      return tick(300);
    }).then(function () {
      T.push(r8step(doc, '3 still away, a frame or two later'));
      var resized = resizeViewport(-40);
      return tick(250).then(function () {
        var s3b = r8step(doc, '3b viewport changed while away');
        s3b.viewportResized = resized;
        T.push(s3b);
        return P.onMount();
      });
    }).then(function () {
      return tick(600);
    }).then(function () {
      T.push(r8step(doc, '4 back on Product Strategy'));
      return tick(400);
    }).then(function () {
      T.push(r8step(doc, '5 settled'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * §8 — A SIMULATION BELONGS TO THE SITE IT WAS SIMULATED ON.
   *
   * Apply a scenario on A, then walk the three things that must NOT clear it (a view, a category,
   * a leave-and-return) and the one that must (a different site).
   */
  /* P1-B8D-R9 — LIFTED OUT OF `scenario-site-scope` SO TWO ACTS APPLY THE SAME SIMULATION.
     It was a local function; §3 needs to apply a scenario too, and two copies of "open the drawer,
     pick a series, type a number, press Apply" would be two chances for the runs to diverge on what
     `a scenario` even means. */
  function applyScenarioOn(doc) {
    var tg = doc.getElementById('meetingToggle');
    if (tg) tg.click();
    return tick(200).then(function () {
      var ss = doc.getElementById('scSeries');
      if (ss && ss.options.length > 1) {
        ss.value = ss.options[1].value;
        ss.dispatchEvent(new root.Event('change', { bubbles: true }));
      }
      var iv = doc.getElementById('scValue');
      if (iv) { iv.value = '19.99'; iv.dispatchEvent(new root.Event('input', { bubbles: true })); }
      return tick(120);
    }).then(function () {
      var ap = doc.getElementById('scApply');
      if (ap) ap.click();
      return tick(250);
    });
  }
  A.applyScenarioOn = applyScenarioOn;

  ACTS['scenario-site-scope'] = function (doc, args) {
    var T = [];
    var A1 = args.first, A2 = args.second;
    var applyScenario = function () { return applyScenarioOn(doc); };
    return loadSite(doc, A1).then(applyScenario).then(function () {
      T.push(r8step(doc, '1 scenario applied on site A'));
      if (root.PSB_BOARD) root.PSB_BOARD.showView('product-strategy/risk');
      return tick(200);
    }).then(function () {
      T.push(r8step(doc, '2 another VIEW of the same site — must keep it'));
      if (root.PSB_BOARD) root.PSB_BOARD.showView('product-strategy/category');
      return tick(200);
    }).then(function () {
      if (args.category) pickCategory(doc, args.category);
      return tick(250);
    }).then(function () {
      T.push(r8step(doc, '3 a CATEGORY on the same site — must keep it'));
      pick(doc, 'marketplace', A2.marketplace);
      return tick(900);
    }).then(function () {
      T.push(r8step(doc, '4 a DIFFERENT SITE — must clear it'));
      pick(doc, 'marketplace', A1.marketplace);
      return tick(900);
    }).then(function () {
      T.push(r8step(doc, '5 back to site A — must NOT come back'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * §6 — THE CLOSE CONTROL, MEASURED AS A THING ON A SCREEN.
   *
   * Not "is there a button in the DOM" — R7 answered that, and the operator still could not see one.
   * Box, computed style, what is actually painted at its centre, and both ways of pressing it.
   */
  ACTS['drawer-visibility'] = function (doc, args) {
    var T = [];
    var S = args.first;
    function closeBtnState(label) {
      var d = doc.getElementById('scenarioDrawer');
      var b = doc.getElementById('scenarioDrawerClose');
      var r = b ? b.getBoundingClientRect() : null;
      var cs = b ? root.getComputedStyle(b) : null;
      var hdr = doc.querySelector('#scenarioDrawer .scn-drawer-head, #scenarioDrawer header');
      var hr = hdr ? hdr.getBoundingClientRect() : null;
      var cx = r ? Math.round(r.left + r.width / 2) : -1;
      var cy = r ? Math.round(r.top + r.height / 2) : -1;
      var hit = (r && r.width > 0) ? doc.elementFromPoint(cx, cy) : null;
      return {
        step: label,
        drawerOpen: !!(d && !d.hidden),
        count: doc.querySelectorAll('#scenarioDrawerClose').length,
        present: !!b,
        display: cs ? cs.display : null,
        visibility: cs ? cs.visibility : null,
        opacity: cs ? Number(cs.opacity) : null,
        color: cs ? cs.color : null,
        background: cs ? cs.backgroundColor : null,
        borderColor: cs ? cs.borderTopColor : null,
        zIndex: cs ? cs.zIndex : null,
        text: b ? String(b.textContent || '').trim() : null,
        codePoint: b && String(b.textContent || '').trim()
          ? String(b.textContent || '').trim().codePointAt(0) : null,
        ariaLabel: b ? b.getAttribute('aria-label') : null,
        type: b ? b.getAttribute('type') : null,
        /* IS IT IN THE TAB ORDER? Not "can it be focused" — `focus()` works on a node with
           `tabindex="-1"`, so a probe that called it would report a control a keyboard user can
           never reach as reachable. A native <button> is in the order unless something took it
           out, and taking it out is exactly the half-working state §6 rules out: still clickable,
           no longer reachable. */
        inTabOrder: (function () {
          if (!b) return false;
          var ti = b.getAttribute('tabindex');
          if (ti !== null && Number(ti) < 0) return false;
          if (b.disabled) return false;
          var rr = b.getBoundingClientRect();
          return rr.width > 0 && rr.height > 0;
        }()),
        box: r ? { x: Math.round(r.left), y: Math.round(r.top),
          w: Math.round(r.width), h: Math.round(r.height) } : null,
        insideViewport: !!(r && r.top >= 0 && r.left >= 0
          && r.bottom <= root.innerHeight && r.right <= root.innerWidth),
        insideHeader: !!(r && hr && r.top >= hr.top - 1 && r.bottom <= hr.bottom + 1
          && r.right <= hr.right + 1),
        elementAtCentre: hit ? (hit.id || hit.className || hit.tagName) : null,
        hitIsTheButton: !!(hit && b && (hit === b || b.contains(hit))),
        focus: focusNow(doc),
        scenarioApplied: doc.querySelectorAll('#view [data-layer="scenario"]').length,
        chip: (function () {
          var c = doc.getElementById('scenarioChip');
          return c ? String(c.textContent || '').trim() : null;
        }()),
        activeOverrides: (function () {
          var n2 = doc.getElementById('scenarioNote');
          var mm = n2 ? /Active overrides:\s*(\d+)/.exec(String(n2.textContent || '')) : null;
          return mm ? Number(mm[1]) : null;
        }()),
        chipActive: (function () {
          var c = doc.getElementById('scenarioChip');
          return c ? c.getAttribute('data-active') : null;
        }()),
        drawerBox: (function () {
          if (!d) return null;
          var dr = d.getBoundingClientRect();
          return { w: Math.round(dr.width), h: Math.round(dr.height) };
        }()),
        drawerFocusablesWithABox: (function () {
          if (!d) return 0;
          var n = 0;
          Array.prototype.slice.call(d.querySelectorAll('button, select, input, [tabindex]'))
            .forEach(function (x) {
              var xr = x.getBoundingClientRect();
              if (xr.width > 0 && xr.height > 0) n++;
            });
          return n;
        }())
      };
    }
    return loadSite(doc, S).then(function () {
      T.push(closeBtnState('1 loaded, drawer shut'));
      var tg = doc.getElementById('meetingToggle');
      if (tg) { if (tg.focus) tg.focus(); tg.click(); }
      return tick(250);
    }).then(function () {
      /* A SIMULATION IS APPLIED BEFORE ANYTHING IS CLOSED, so "closing neither applies nor clears
         it" is a statement about something rather than about an empty form. */
      var ss = doc.getElementById('scSeries');
      if (ss && ss.options.length > 1) {
        ss.value = ss.options[1].value;
        ss.dispatchEvent(new root.Event('change', { bubbles: true }));
      }
      var iv = doc.getElementById('scValue');
      if (iv) { iv.value = '19.99'; iv.dispatchEvent(new root.Event('input', { bubbles: true })); }
      return tick(150);
    }).then(function () {
      var ap = doc.getElementById('scApply');
      if (ap) ap.click();
      return tick(300);
    }).then(function () {
      T.push(closeBtnState('2 drawer open — the close control as painted'));
      var b = doc.getElementById('scenarioDrawerClose');
      if (b) b.click();
      return tick(250);
    }).then(function () {
      T.push(closeBtnState('3 closed by POINTER'));
      var tg = doc.getElementById('meetingToggle');
      if (tg) tg.click();
      return tick(250);
    }).then(function () {
      T.push(closeBtnState('4 reopened'));
      /* KEYBOARD, and through the control rather than around it: focus it, then Enter. A real Enter
         on a focused <button> also produces a click, which browsers do natively and a synthetic
         keydown does not — both are sent, so this measures the control and not the harness. */
      var b = doc.getElementById('scenarioDrawerClose');
      if (b) {
        if (b.focus) b.focus();
        b.dispatchEvent(new root.KeyboardEvent('keydown',
          { key: 'Enter', bubbles: true, cancelable: true }));
        b.dispatchEvent(new root.KeyboardEvent('keyup',
          { key: 'Enter', bubbles: true, cancelable: true }));
        b.click();
      }
      return tick(250);
    }).then(function () {
      T.push(closeBtnState('5 closed by KEYBOARD'));
      root.__trace = T;
      return T;
    });
  };

  /** §4 + §3 — the production chart with no toolbar above it, and no sentence under Category. */
  ACTS['production-chrome'] = function (doc, args) {
    var T = [];
    return loadSite(doc, args.first).then(function () {
      T.push(r8step(doc, '1 loaded (Executive Overview)'));
      /* THE VIEW THAT HAS THE CHART. The toolbar under investigation is drawn above the Price
         architecture chart, and the default view does not draw one — measuring the default only
         would report zero controls and prove nothing. */
      if (root.PSB_BOARD) root.PSB_BOARD.showView('product-strategy/category');
      return tick(400);
    }).then(function () {
      T.push(r8step(doc, '2 Category Analysis — the chart and its toolbar'));
      /* TAB THROUGH THE PANEL AND THE CHART. A control that is invisible and still in the tab order
         is a control a keyboard reader meets; only walking the order can say so. */
      var all = Array.prototype.slice.call(doc.querySelectorAll(
        '#product-strategy-board-section button, #product-strategy-board-section select,'
        + ' #product-strategy-board-section input, #product-strategy-board-section a[href],'
        + ' #product-strategy-board-section [tabindex]'));
      var reachable = all.filter(function (n) {
        if (n.disabled) return false;
        var ti = n.getAttribute('tabindex');
        if (ti !== null && Number(ti) < 0) return false;
        var cs = root.getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        var r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      T.push({ step: '3 tab order',
        tabbables: reachable.map(function (n) {
          return (n.id || n.className || n.tagName) + ':'
            + String(n.textContent || '').trim().slice(0, 24);
        }),
        toolbarTabbables: reachable.filter(function (n) {
          return !!(n.closest && n.closest('.chartctl'));
        }).length });
      root.__trace = T;
      return T;
    });
  };

  /**
   * §5 — A FAILED SITE B MUST NOT BRING SITE A'S BOARD BACK.
   *
   * "B 失敗時顯示 B 的 error，不能恢復 A board". The replay refuses only the workspace read, so the
   * universe is still there and the chooser is still usable — which is what makes the retry a real
   * one rather than a second refusal.
   */
  ACTS['teardown-failure'] = function (doc, args) {
    var T = [];
    var A1 = args.first, A2 = args.second;
    var wire = root.__wire;
    return loadSite(doc, A1).then(function () {
      T.push(r8step(doc, '1 site A loaded'));
      /* THE SERVER STARTS REFUSING NOW, not at the beginning: a run that could never load site A
         cannot ask whether site A is still underneath site B's error. */
      if (wire && typeof wire.startFailing === 'function') {
        wire.startFailing(new Error('the site refused'), 'workspace');
      }
      pick(doc, 'marketplace', A2.marketplace);
      return tick(700);
    }).then(function () {
      T.push(r8step(doc, '2 site B refused — A must not be underneath it'));
      if (wire && typeof wire.stopFailing === 'function') wire.stopFailing();
      /* THE SAME MARKETPLACE AGAIN. After a failure this has to be able to ask again — the
         same-site guard is about a site already loaded or already coming, not about one that was
         refused. */
      pick(doc, 'marketplace', A2.marketplace);
      return tick(900);
    }).then(function () {
      T.push(r8step(doc, '3 retried, and B is up'));
      root.__trace = T;
      return T;
    });
  };

  /** §7 + §8 — leave and come back to the SAME site, with a simulation applied. */
  ACTS['scenario-leave-return'] = function (doc, args) {
    var T = [];
    var P = page();
    var S = args.first;
    return loadSite(doc, S).then(function () {
      var tg = doc.getElementById('meetingToggle');
      if (tg) tg.click();
      return tick(200);
    }).then(function () {
      var ss = doc.getElementById('scSeries');
      if (ss && ss.options.length > 1) {
        ss.value = ss.options[1].value;
        ss.dispatchEvent(new root.Event('change', { bubbles: true }));
      }
      var iv = doc.getElementById('scValue');
      if (iv) { iv.value = '19.99'; iv.dispatchEvent(new root.Event('input', { bubbles: true })); }
      return tick(150);
    }).then(function () {
      var ap = doc.getElementById('scApply');
      if (ap) ap.click();
      return tick(300);
    }).then(function () {
      T.push(r8step(doc, '1 scenario applied'));
      /* THE VIEW IS MOVED BEFORE LEAVING, so "the same page came back" means something more than
         "a board came back". */
      if (root.PSB_BOARD) root.PSB_BOARD.showView('product-strategy/quality');
      return tick(250);
    }).then(function () {
      T.push(r8step(doc, '2 on Data Quality, about to leave'));
      P.onUnmount();
      return tick(300);
    }).then(function () {
      T.push(r8step(doc, '3 away'));
      return P.onMount();
    }).then(function () {
      return tick(600);
    }).then(function () {
      T.push(r8step(doc, '4 back — same site, same view, same scenario, no new read'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * P1-B8D-R9 §4 — PRESS EVERY RESTORED CONTROL AND MEASURE WHAT MOVED.
   *
   * One step per control, each recording the shape BEFORE and AFTER, so the suite asserts a
   * DIFFERENCE rather than a presence. The order is the order a person would use them: make it
   * bigger, change the detail, open the layers, scale it, put it back.
   */
  ACTS['toolbar-functions'] = function (doc, args) {
    var T = [];
    var hit = function (id) {
      var n = doc.getElementById(id);
      if (n) n.click();
      return !!n;
    };
    return loadSite(doc, args.first).then(function () {
      /* THE VIEW THAT HAS THE CHART. The default view draws none, so a toolbar run against it
         would measure an empty row and call every control fine. */
      if (root.PSB_BOARD) root.PSB_BOARD.showView('product-strategy/category');
      return tick(400);
    }).then(function () {
      T.push(r9step(doc, '1 Category Analysis, Auto Fit (the default)'));
      T.push({ step: '1a clicked', id: 'mode-comfortable', found: hit('mode-comfortable') });
      return tick(350);
    }).then(function () {
      T.push(r9step(doc, '2 Comfortable — larger images, and a Size group that did not exist'));
      T.push({ step: '2a clicked', id: 'zoom-1.25', found: hit('zoom-1-25') });
      return tick(350);
    }).then(function () {
      T.push(r9step(doc, '3 Size 125%'));
      T.push({ step: '3a clicked', id: 'view-clean', found: hit('view-clean') });
      return tick(350);
    }).then(function () {
      T.push(r9step(doc, '4 Clean — fewer layers drawn'));
      T.push({ step: '4a clicked', id: 'view-detail', found: hit('view-detail') });
      return tick(350);
    }).then(function () {
      T.push(r9step(doc, '5 Detail — all of them back'));
      T.push({ step: '5a clicked', id: 'layersToggle', found: hit('layersToggle') });
      return tick(350);
    }).then(function () {
      T.push(r9step(doc, '6 Layers open — six switches'));
      T.push({ step: '6a clicked', id: 'zoom-reset', found: hit('zoom-reset') });
      return tick(400);
    }).then(function () {
      T.push(r9step(doc, '7 Reset view — back to Auto Fit, Detail, closed'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * P1-B8D-R9 §3 — THE SCENARIO NOTICE, AND A REAL REFUSAL, MEASURED IN THE SAME RUN.
   *
   * Measuring the scenario alone could only ever say what colour it is. The requirement is that it
   * is not the colour of a FAULT and that a real fault is not restyled to match it, and neither
   * half is checkable without the other one on the screen in the same browser.
   */
  ACTS['scenario-appearance'] = function (doc, args) {
    var T = [];
    var wire = root.__wire;
    return loadSite(doc, args.first).then(function () {
      T.push(r9step(doc, '1 loaded, no scenario'));
      applyScenarioOn(doc);
      return tick(400);
    }).then(function () {
      T.push(r9step(doc, '2 a scenario is applied — an outcome, not a fault'));
      /* AND NOW A GENUINE REFUSAL, on the same page, in the same run. */
      if (wire && typeof wire.startFailing === 'function') {
        wire.startFailing(new Error('the site refused'), 'workspace');
      }
      pick(doc, 'marketplace', args.second.marketplace);
      return tick(700);
    }).then(function () {
      T.push(r9step(doc, '3 a real refusal — and it must not look like the scenario'));
      if (wire && typeof wire.stopFailing === 'function') wire.stopFailing();
      root.__trace = T;
      return T;
    });
  };

  /* ================================================================================================
     P1-B8D-R10 §8 — THE PRODUCTION-LIKE TRANSPORT MATRIX.

     Each of these drives the SHIPPED page through a named network fault and records what the
     operator is told and how many physical requests it cost. The faults are injected at `fetch`,
     beneath a REAL transport instance, so the classification and the bounded recovery under test
     are production's.
     ================================================================================================ */
  function faultStep(doc, label) {
    var s = r8step(doc, label);
    var w = root.__wire;
    s.physical = (w && w.physical) ? {
      attempts: w.physical.attempts,
      byAction: JSON.parse(JSON.stringify(w.physical.byAction)),
      methods: w.physical.methods.slice(0, 8),
      maxUrl: w.physical.urls
    } : null;
    return s;
  }
  A.faultStep = faultStep;

  /** §8 — one fault, one site, and what the page says about it. */
  ACTS['transport-fault'] = function (doc, args) {
    var T = [];
    return loadSite(doc, args.first).then(function () {
      T.push(faultStep(doc, '1 the read under the injected fault'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * §6/§8 — THE FIRST ATTEMPT FAILS AND THE SECOND SUCCEEDS, WHICH IS THE WHOLE POINT.
   *
   * §6 is explicit that the UI must stay in LOADING across the recovery — "retry期間UI維持 loading,
   * 不先畫錯誤再跳回成功". So this records the state DURING the outstanding read as well as after it:
   * a run that only looked at the end could not tell a clean recovery from an error that flashed.
   */
  ACTS['transport-recovery'] = function (doc, args) {
    var T = [];
    var S = args.first;
    /* BUILT ON `loadSite`, WHICH IS THE PROVEN LADDER. An earlier version drove the three controls
       by hand and recorded nothing at all: with the fault consuming the universe read there was no
       marketplace control to pick, the chain settled early, and the run reported an empty trace —
       which would have read as a passing measurement of nothing. */
    T.push(faultStep(doc, '0 before any selection'));
    return loadSite(doc, S).then(function () {
      /* The FIRST snapshot after the ladder: if a recovery were being drawn as an error and then
         replaced, this is where the error would still be on screen. */
      T.push(faultStep(doc, '1 immediately after the site is complete'));
      return tick(900);
    }).then(function () {
      T.push(faultStep(doc, '2 settled — the recovery has answered'));
      root.__trace = T;
      return T;
    });
  };

  /**
   * §6 — SITE A IS STILL FAILING WHEN SITE B IS CHOSEN, AND A'S ANSWER MUST NOT LAND.
   *
   * THE FIRST VERSION OF THIS ACT COULD NOT FAIL HONESTLY. It called `wire.stopFailing()`, which
   * belongs to the OLD capture-level fault and does nothing to a network-level one — so site B's own
   * read failed too, and "A's error is on the screen" was indistinguishable from "B legitimately
   * refused". A test that cannot tell those apart is not evidence about superseding.
   *
   * It is driven by attempt COUNT now. Site A's read and its one bounded recovery are attempts 1 and
   * 2 and both fail; site B's read is attempt 3 and succeeds. The faulted attempts are also SLOW, so
   * B is genuinely chosen while A is still outstanding rather than after A has already settled —
   * which is the only arrangement in which a stale answer has anything to overwrite.
   */
  ACTS['fault-site-switch'] = function (doc, args) {
    var T = [];
    var A1 = args.first, A2 = args.second;
    return Promise.resolve().then(function () {
      pick(doc, 'company', A1.company); return tick();
    }).then(function () {
      pick(doc, 'country', A1.country); return tick();
    }).then(function () {
      pick(doc, 'marketplace', A1.marketplace);
      return tick(60);
    }).then(function () {
      /* A is in flight and failing RIGHT NOW. */
      T.push(faultStep(doc, '1 site A outstanding under the fault'));
      pick(doc, 'marketplace', A2.marketplace);
      return tick(2500);
    }).then(function () {
      T.push(faultStep(doc, '2 site B chosen; A late answer must not land here'));
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
