// ============================================================
// Shared Category Tab Rail behavior (2026-07-28). ONE reusable horizontal-scroll behavior for the
// category/series tab rails across pages — so no page maintains its own h-scroll code. Pairs with the
// `.km-tab-rail` CSS component in components.css. Dependency-free, idempotent, defensive.
//
//   KM.ui.tabRail.enhance(railEl)            — wire wheel→horizontal scroll + focus-into-view on a rail
//   KM.ui.tabRail.scrollActiveIntoView(rail) — scroll the active tab into the rail's visible range
//   KM.ui.tabRail.enhanceAll(root?)          — enhance every .km-tab-rail under root (default document)
//
// The rail element is a single-row, horizontally-scrollable container; its children are the tabs. This
// helper NEVER changes selection, counts, or filter state — it only manages scroll/visibility, so it is
// safe to attach to any existing tab markup that adds the `km-tab-rail` class.
// ============================================================
(function () {
  'use strict';
  window.KM = window.KM || {};
  if (window.KM.ui && window.KM.ui.tabRail) return;   // already defined
  window.KM.ui = window.KM.ui || {};

  var ACTIVE_SELECTOR = '.is-active, .km-tab-rail__tab--active, .ro-tab--active, .replen-category-tab.is-active';

  function activeTab(rail) {
    if (!rail) return null;
    return rail.querySelector(ACTIVE_SELECTOR) || null;
  }

  // Scroll `tab` fully into the rail's visible horizontal range (no vertical page jump).
  function scrollTabIntoView(rail, tab) {
    if (!rail || !tab) return;
    var rRect = rail.getBoundingClientRect();
    var tRect = tab.getBoundingClientRect();
    if (tRect.left < rRect.left) {
      rail.scrollLeft -= (rRect.left - tRect.left) + 16;
    } else if (tRect.right > rRect.right) {
      rail.scrollLeft += (tRect.right - rRect.right) + 16;
    }
  }

  function scrollActiveIntoView(rail) {
    scrollTabIntoView(rail, activeTab(rail));
  }

  function enhance(rail) {
    if (!rail || rail.__kmTabRailEnhanced) return;
    rail.__kmTabRailEnhanced = true;

    // Vertical wheel / trackpad → horizontal scroll (only consume the event when there IS overflow, so a
    // normal page scroll still works when the rail fits). Shift+wheel (native horizontal) passes through.
    rail.addEventListener('wheel', function (e) {
      var overflow = rail.scrollWidth - rail.clientWidth;
      if (overflow <= 1) return;
      if (e.deltaX !== 0) return;   // already horizontal (trackpad / shift+wheel) — let it scroll natively
      var atStart = rail.scrollLeft <= 0;
      var atEnd = rail.scrollLeft >= overflow - 1;
      // Only hijack when we can actually move in the wheel direction (avoids trapping page scroll).
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      rail.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    // Keyboard focus onto an off-screen tab → bring it into view.
    rail.addEventListener('focusin', function (e) {
      if (e.target && rail.contains(e.target)) scrollTabIntoView(rail, e.target);
    });
  }

  function enhanceAll(root) {
    var scope = root || document;
    var rails = scope.querySelectorAll('.km-tab-rail');
    for (var i = 0; i < rails.length; i++) enhance(rails[i]);
  }

  window.KM.ui.tabRail = {
    enhance: enhance,
    enhanceAll: enhanceAll,
    scrollActiveIntoView: scrollActiveIntoView
  };
})();
