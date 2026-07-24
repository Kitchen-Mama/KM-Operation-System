// resizable-columns.js — small reusable "drag to resize table columns" capability (no third-party lib,
// no framework). ONE instance per logical table group; columns are addressed by a STABLE key (never by
// index/label), so widths survive Display hide/show, unit switches, filtering, and rerenders. Width is
// applied via a single injected <style> rule per column key so a header cell and ALL same-schema body
// cells stay aligned automatically (the caller supplies the CSS selector via cssRule()).
//
// Pilot: enabled ONLY by SKU Details (assets/js/pages/sku-details.js). This file defines the capability;
// it does not activate itself anywhere.
//
// Public: window.KM.ui.resizableColumns.create(config) -> controller { init, refresh, resetAll, resetColumn, destroy }
//   config = {
//     root: HTMLElement,                       // scope container (e.g. #sku-section)
//     storage: { key, page, group },           // localStorage identity (version is baked into `key`)
//     columns: [{ key, col, min, max, def, label }],  // key = stable id; col = data-col index (0 = fixed col)
//     getHeaderCells(colObj) -> NodeList/array, // header cells that receive a resize handle (one per section)
//     cssRule(colObj, widthPx) -> string,       // CSS rule that applies the width to header + body cells
//     afterApply() (optional)                   // e.g. recompute the unified horizontal-scroll width
//   }
//
// Node/test surface: module.exports = { clamp, readGroup, mergePersist, clearGroup, STORAGE_VERSION }.

(function () {
  'use strict';

  var STORAGE_VERSION = 'v1';

  // ---- pure helpers (unit-tested in Node; no DOM) ----
  function clamp(w, min, max) {
    w = Math.round(Number(w));
    if (!isFinite(w)) return min;
    if (typeof min === 'number') w = Math.max(min, w);
    if (typeof max === 'number') w = Math.min(max, w);
    return w;
  }
  // Read one page/group's saved widths from a parsed storage object; re-clamps every value to its column
  // min/max and drops non-numeric / unknown keys. Corrupt shapes → {} (safe default).
  function readGroup(parsed, page, group, columns) {
    var out = {};
    if (!parsed || typeof parsed !== 'object') return out;
    var p = parsed[page]; if (!p || typeof p !== 'object') return out;
    var g = p[group]; if (!g || typeof g !== 'object') return out;
    (columns || []).forEach(function (c) {
      var v = g[c.key];
      if (typeof v === 'number' && isFinite(v)) out[c.key] = clamp(v, c.min, c.max);
    });
    return out;
  }
  // Merge widths for ONE page/group into the parsed root, preserving every other page/group untouched.
  function mergePersist(parsed, page, group, widths) {
    var root = (parsed && typeof parsed === 'object') ? parsed : {};
    root[page] = (root[page] && typeof root[page] === 'object') ? root[page] : {};
    var g = {};
    Object.keys(widths || {}).forEach(function (k) { if (widths[k] != null) g[k] = widths[k]; });
    root[page][group] = g;
    return root;
  }
  // Remove ONLY this page/group (leaves all other preferences intact).
  function clearGroup(parsed, page, group) {
    var root = (parsed && typeof parsed === 'object') ? parsed : {};
    if (root[page] && typeof root[page] === 'object') {
      delete root[page][group];
      if (!Object.keys(root[page]).length) delete root[page];
    }
    return root;
  }

  // ---- DOM controller ----
  function create(cfg) {
    if (!cfg || !cfg.root || !cfg.storage || !cfg.columns) return null;
    var root = cfg.root, store = cfg.storage, cols = cfg.columns;
    var byKey = {}; cols.forEach(function (c) { byKey[c.key] = c; });
    var widths = {};       // key -> width px (absent = use column default)
    var styleEl = null;

    function readRoot() { try { return JSON.parse(localStorage.getItem(store.key) || '{}'); } catch (e) { return {}; } }
    function load() { widths = readGroup(readRoot(), store.page, store.group, cols); }
    function persist() { try { localStorage.setItem(store.key, JSON.stringify(mergePersist(readRoot(), store.page, store.group, widths))); } catch (e) {} }
    function wipe() { try { localStorage.setItem(store.key, JSON.stringify(clearGroup(readRoot(), store.page, store.group))); } catch (e) {} }

    function effective(c) { return widths[c.key] != null ? widths[c.key] : c.def; }

    function ensureStyle() {
      if (styleEl && styleEl.parentNode) return styleEl;
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-km-rescols', store.page + '/' + store.group);
      document.head.appendChild(styleEl);
      return styleEl;
    }
    function apply() {
      var css = '';
      cols.forEach(function (c) { if (widths[c.key] != null) css += cfg.cssRule(c, widths[c.key]) + '\n'; });
      ensureStyle().textContent = css;
      Array.prototype.forEach.call(root.querySelectorAll('[data-rescol-handle]'), function (h) {
        var c = byKey[h.getAttribute('data-rescol-handle')]; if (c) h.setAttribute('aria-valuenow', String(effective(c)));
      });
      if (cfg.afterApply) { try { cfg.afterApply(); } catch (e) {} }
    }
    function setWidth(c, w, doPersist) { widths[c.key] = clamp(w, c.min, c.max); apply(); if (doPersist) persist(); }
    function resetColumn(c) { delete widths[c.key]; apply(); persist(); }
    function resetAll() { widths = {}; apply(); wipe(); }

    function attachPointer(handle, c, cell) {
      var dragging = false, startX = 0, startW = 0, raf = 0, pending = null, pid = null;
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        dragging = true; startX = e.clientX; startW = effective(c); pid = e.pointerId;
        try { handle.setPointerCapture(pid); } catch (x) {}
        document.body.classList.add('km-rescol-active');
      });
      handle.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        pending = startW + (e.clientX - startX);
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (pending != null) { setWidth(c, pending, false); pending = null; } });
      });
      function end() {
        if (!dragging) return; dragging = false;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (pending != null) { setWidth(c, pending, false); pending = null; }
        try { handle.releasePointerCapture(pid); } catch (x) {}
        document.body.classList.remove('km-rescol-active');
        persist();
      }
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
      handle.addEventListener('click', function (e) { e.stopPropagation(); });      // never trigger sort
      handle.addEventListener('dblclick', function (e) { e.stopPropagation(); });   // never trigger row Edit
    }
    function attachKeyboard(handle, c) {
      handle.addEventListener('keydown', function (e) {
        var step = e.shiftKey ? 25 : 10, cur = effective(c), done = true;
        if (e.key === 'ArrowLeft') setWidth(c, cur - step, true);
        else if (e.key === 'ArrowRight') setWidth(c, cur + step, true);
        else if (e.key === 'Home') resetColumn(c);
        else done = false;
        if (done) { e.preventDefault(); e.stopPropagation(); }
      });
    }
    function mountHandles() {
      cols.forEach(function (c) {
        var cells = cfg.getHeaderCells(c) || [];
        Array.prototype.forEach.call(cells, function (cell) {
          if (cell.querySelector('[data-rescol-handle]')) return;           // idempotent — no duplicate handles
          if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
          var h = document.createElement('span');
          h.className = 'km-rescol-handle';
          h.setAttribute('data-rescol-handle', c.key);
          h.setAttribute('role', 'separator');
          h.setAttribute('tabindex', '0');
          h.setAttribute('aria-orientation', 'vertical');
          h.setAttribute('aria-label', 'Resize ' + (c.label || c.key) + ' column');
          h.setAttribute('aria-valuemin', String(c.min));
          h.setAttribute('aria-valuemax', String(c.max));
          h.setAttribute('aria-valuenow', String(effective(c)));
          attachPointer(h, c, cell);
          attachKeyboard(h, c);
          cell.appendChild(h);
        });
      });
    }

    load();
    var api = {
      init: function () { mountHandles(); apply(); return api; },
      refresh: function () { mountHandles(); apply(); return api; },     // after rerender (headers persist)
      resetAll: function () { resetAll(); return api; },
      resetColumn: function (key) { var c = byKey[key]; if (c) resetColumn(c); return api; },
      destroy: function () {
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        Array.prototype.forEach.call(root.querySelectorAll('[data-rescol-handle]'), function (h) { if (h.parentNode) h.parentNode.removeChild(h); });
      }
    };
    return api;
  }

  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.ui = window.KM.ui || {};
    if (!window.KM.ui.resizableColumns) {
      window.KM.ui.resizableColumns = { create: create, clamp: clamp, STORAGE_VERSION: STORAGE_VERSION };
    }
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { clamp: clamp, readGroup: readGroup, mergePersist: mergePersist, clearGroup: clearGroup, STORAGE_VERSION: STORAGE_VERSION };
  }
})();
