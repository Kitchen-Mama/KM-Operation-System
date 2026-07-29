// ============================================================
// dual-layer-resize.js (2026-07-28) — thin adapter that reuses the SKU Details column-resize engine
// (KM.ui.resizableColumns, resizable-columns.js) on the standard "dual-layer" tables that do NOT carry
// per-cell data-col attributes (Factory Inventory / Overseas Inventory / FC Summary).
//
// Those tables are laid out as: a flat `.scroll-header` of `.header-cell` divs (one row, no group/leaf
// nesting) + a `.scroll-body` of `.scroll-row > .scroll-cell` rows. Because there are no data-col hooks,
// columns are addressed by their :nth-child position. One injected CSS rule per column applies the width
// to BOTH the header cell and every same-position body cell, so header and body stay aligned exactly
// like SKU Details. Only the scrollable (leaf) data columns are made resizable; the sticky SKU identity
// column is intentionally left fixed (keeps the sticky column + horizontal scroll intact).
//
//   KM.ui.dualLayerResize.init({ sectionId, scrollHeaderSel, scrollBodySel, page, group, min, max, def })
//     sectionId       — id of the page section element (scope root), e.g. 'factory-stock-section'
//     scrollHeaderSel — id selector of the flat scroll header, e.g. '#factory-stock-scroll-header'
//     scrollBodySel   — id selector of the scroll body,      e.g. '#factory-stock-scroll-body'
//     page / group    — localStorage identity (shares the SKU key 'km.ui.tableWidths.v1'; page+group
//                       keep each table's widths isolated so they never overwrite each other)
//     min/max/def     — column width bounds + default (px); defaults 80 / 720 / 120
//
// Idempotent + re-mount-safe: one controller per `group`; a re-init tears the previous one down first
// (removing its <style> + handles) so a lifecycle re-mount never stacks handles or leaves a stale rule.
// Filter / pagination / body re-renders do NOT call init (the header persists, so handles persist and
// new body cells inherit the injected width rule) — matching the "no duplicate handles" requirement.
// ============================================================
(function () {
  'use strict';
  window.KM = window.KM || {};
  window.KM.ui = window.KM.ui || {};
  if (window.KM.ui.dualLayerResize) return;

  var _ctls = {};   // group -> resizableColumns controller (one per logical table)

  function init(opts) {
    var lib = window.KM && window.KM.ui && window.KM.ui.resizableColumns;
    if (!lib || !opts || !opts.sectionId || !opts.scrollHeaderSel || !opts.scrollBodySel || !opts.group) return null;
    var root = document.getElementById(opts.sectionId);
    if (!root) return null;
    var header = root.querySelector(opts.scrollHeaderSel);
    if (!header) return null;
    var cells = header.querySelectorAll(':scope > .header-cell');
    if (!cells.length) return null;

    var min = opts.min || 80, max = opts.max || 720, def = opts.def || 120;
    var columns = [];
    for (var i = 0; i < cells.length; i++) {
      columns.push({
        key: 'c' + (i + 1),
        col: i + 1,                 // 1-based :nth-child position within the scroll row
        min: min, max: max, def: def,
        label: (cells[i].textContent || '').replace(/\s+/g, ' ').trim() || ('Column ' + (i + 1))
      });
    }

    var hSel = opts.scrollHeaderSel, bSel = opts.scrollBodySel;

    // Fresh controller per init — tear down any prior one for this group first (removes its <style> +
    // handles) so a re-mount can never leave duplicates or a stale rule behind.
    if (_ctls[opts.group]) { try { _ctls[opts.group].destroy(); } catch (e) {} _ctls[opts.group] = null; }

    var ctl = lib.create({
      root: root,
      storage: { key: 'km.ui.tableWidths.v1', page: opts.page || opts.sectionId, group: opts.group },
      columns: columns,
      getHeaderCells: function (c) {
        var h = root.querySelector(hSel);
        if (!h) return [];
        var list = h.querySelectorAll(':scope > .header-cell');
        var cell = list[c.col - 1];
        return cell ? [cell] : [];
      },
      cssRule: function (c, w) {
        var wpx = w + 'px';
        // Both selectors are id-anchored (#...-scroll-header / #...-scroll-body) so they out-specify the
        // base `#section .header-cell` / `.scroll-cell` width rules without needing !important.
        return hSel + ' > .header-cell:nth-child(' + c.col + '), ' +
               bSel + ' .scroll-row > .scroll-cell:nth-child(' + c.col + ') ' +
               '{ width:' + wpx + '; min-width:' + wpx + '; max-width:' + wpx + '; }';
      }
    });
    _ctls[opts.group] = ctl;
    if (ctl) ctl.init();
    return ctl;
  }

  window.KM.ui.dualLayerResize = { init: init };
})();
