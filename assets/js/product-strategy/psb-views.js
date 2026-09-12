/* ===================================================================================================
   PRODUCT STRATEGY BOARD — THE SIX VIEWS, AND THE ONE PLACE THEY ARE DECLARED   (P1-B8B §2)

   P1-B8B PUTS THE SAME SIX NAMES IN TWO PLACES ON THE SCREEN: the Operation System sidebar, where
   `Product Strategy` is a parent with six children, and the in-page tab rail, which is what a person
   actually clicks while the board is open. That is the information architecture §2 asks for, and it
   is also exactly the shape that goes wrong quietly — two lists of six labels, written twice,
   agreeing on the day they were written.

   P1-B8A REMOVED FIFTY DUPLICATED DESIGN TOKENS FOR PRECISELY THIS REASON. A second definition site
   that agrees today is still a second definition site. So the six are declared ONCE, here, and both
   surfaces render FROM this file. The sidebar builder in app.js reads it; `renderNav()` in
   psb-board-ui.js reads it; the suite asserts that neither has its own copy of a label.

   ---------------------------------------------------------------------------------------------------
   ROUTE IDENTITY, AND THE HONEST LIMIT OF IT IN THIS SHELL

   §2 asks that a sub-tab not be "a fake tab that exists only in memory with no route identity". So
   every view has a CANONICAL ROUTE — a stable string, `product-strategy/<view>`, which is the name of
   the view in every layer: the sidebar child carries it in `data-route`, the tab carries it in
   `data-route`, the controller accepts it (`mount({ route })`) and reports it (`currentRoute()`), and
   an unknown route resolves to the canonical default rather than to whatever the dispatch happened to
   fall through to.

   WHAT IS DELIBERATELY NOT HERE IS A URL, AND THAT IS A MEASURED DECISION RATHER THAN AN OMISSION.
   The Operation System shell has NO router: `location.hash`, `history.pushState`, `popstate` and
   `hashchange` appear NOWHERE in assets/js. Every page in the application is reached by calling
   `showSection(...)`, a reload always returns to Home, and Back leaves the application.

   So writing `#/product-strategy/risk` into the address bar here would produce a URL that cannot be
   pasted, cannot survive a reload, and would sit in the address bar while the shell displayed Home —
   A ROUTE THAT DOES NOT SURVIVE BEING PASTED IS NOT A ROUTE, IT IS A DECORATION THAT LIES. And making
   it true would mean installing a global router — changing Back and reload for all twenty-odd pages
   in the application — in the same round, for a feature that is switched off. P1-B8A is one round old
   and it was exactly that mistake: a stylesheet for a disabled page restyling every page a person
   could actually open. A disabled page does not get to change the reload behaviour of the application.

   The identity is therefore complete and the URL binding is one function call away, in ONE place
   (`KM.pages.productStrategyBoard.applyRoute`). The shell-level decision is P1-B8C's to make.
   =================================================================================================== */
(function (root) {
  'use strict';

  var V = {};

  V.BUILD = 'PRODUCT-STRATEGY-P1-B8B';

  /** The route namespace. The sidebar parent, the section and every child share this one prefix. */
  V.ROUTE_BASE = 'product-strategy';

  /**
   * MATURITY IS RECORDED, NOT ASSUMED (§2). §2 asks whether any of the six is still a placeholder, and
   * the answer had to be measured rather than believed: each `id` below was checked against the render
   * function `paintView()` actually dispatches to in psb-board-ui.js, and the suite re-checks it.
   *
   *   built   a real render function with its own content
   *
   * All six are `built`. None is a stub, and none renders a "coming soon". Two of them are worth a
   * sentence because their maturity is not the same KIND of thing:
   *
   *   - `risk` and `quality` share one findings renderer with different inputs. That is one
   *     implementation serving two views, which is the opposite of a placeholder.
   *   - `advanced` was ALSO the dispatch's fallthrough — `else viewAdvanced(host)` — so an
   *     unrecognised view id silently rendered Advanced Details. P1-B8B fixed that at the source:
   *     an unknown view is not a view, and it resolves to the canonical default instead of to
   *     whichever branch happened to be last.
   */
  V.MATURITY = { BUILT: 'built' };

  /**
   * THE SIX. Order is the information architecture: where you are, then the category you are in, then
   * the two findings ledgers, then the workspace you act in, then the machinery underneath.
   *
   * `icon` is the inline-SVG path the in-page rail draws. It lives here rather than in the renderer
   * because the sidebar child and the tab must be able to show the same glyph without one of them
   * copying it from the other.
   */
  V.VIEWS = [
    { id: 'overview', label: 'Executive Overview', maturity: V.MATURITY.BUILT,
      renderer: 'viewOverview',
      icon: 'M3 10.5 10 4l7 6.5M5.5 9.5V16h9V9.5' },
    { id: 'category', label: 'Category Analysis', maturity: V.MATURITY.BUILT,
      renderer: 'viewCategory',
      icon: 'M3.5 16V8M8 16V4.5M12.5 16v-5M17 16V6.5' },
    { id: 'risk', label: 'Deal Risk', maturity: V.MATURITY.BUILT,
      renderer: 'viewFindings',
      icon: 'M10 3.5 17.5 16.5h-15zM10 8.5v3.5M10 14.2v.1' },
    { id: 'quality', label: 'Data Quality', maturity: V.MATURITY.BUILT,
      renderer: 'viewEligibility+viewFindings',
      icon: 'M4 5.5h12M4 10h12M4 14.5h7M14.2 13.4l1.6 1.6 2.6-3' },
    { id: 'workspace', label: 'Strategy Workspace', maturity: V.MATURITY.BUILT,
      renderer: 'viewWorkspace',
      icon: 'M3 5.5h14v9H3zM3 8.5h14M7.5 8.5v6' },
    { id: 'advanced', label: 'Advanced Details', maturity: V.MATURITY.BUILT,
      renderer: 'viewAdvanced',
      icon: 'M8 3.5h4l.4 2 1.8 1 1.9-.8 2 3.4-1.5 1.3v2.2l1.5 1.3-2 3.4-1.9-.8-1.8 1-.4 2H8'
        + 'l-.4-2-1.8-1-1.9.8-2-3.4L3.4 12.7v-2.2L1.9 9.2l2-3.4 1.9.8 1.8-1z' }
  ];

  /** The canonical landing view. Named once; every "unknown route" answer resolves to it. */
  V.DEFAULT_VIEW = 'overview';

  V.ids = function () { return V.VIEWS.map(function (v) { return v.id; }); };

  V.get = function (id) {
    var out = null;
    V.VIEWS.forEach(function (v) { if (v.id === id) out = v; });
    return out;
  };

  /** `overview` -> `product-strategy/overview`. An unknown id has no route, and null says so. */
  V.routeOf = function (id) {
    return V.get(id) ? (V.ROUTE_BASE + '/' + id) : null;
  };

  /**
   * `product-strategy/risk` -> `risk`. Anything else -> null.
   *
   * NULL RATHER THAN THE DEFAULT, on purpose. A parser that answers `overview` to a misspelling
   * cannot tell its caller that the route was wrong, and a caller that cannot tell cannot log it,
   * refuse it, or test for it. `resolve()` below is the one that substitutes, and it is a separate
   * function so that substituting is a decision made at a call site rather than a property of reading.
   */
  V.viewOfRoute = function (route) {
    var r = String(route === undefined || route === null ? '' : route).trim();
    if (r === '') return null;
    r = r.replace(/^[#/]+/, '').replace(/\/+$/, '');
    var parts = r.split('/');
    if (parts.length !== 2 || parts[0] !== V.ROUTE_BASE) return null;
    return V.get(parts[1]) ? parts[1] : null;
  };

  /** A view id for anything — the canonical default when the input does not name one of the six. */
  V.resolve = function (idOrRoute) {
    var s = String(idOrRoute === undefined || idOrRoute === null ? '' : idOrRoute).trim();
    if (V.get(s)) return s;
    var viaRoute = V.viewOfRoute(s);
    return viaRoute || V.DEFAULT_VIEW;
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = { PSB_VIEWS: V }; }
  root.PSB_VIEWS = V;
}(typeof globalThis !== 'undefined' ? globalThis : this));
