// ============================================================
// multi-select-filter.js (2026-07-28) — ONE shared multi-select checkbox FILTER component, generalised
// from the SKU Details `.skuf-*` filter (the canonical template). Every page's discrete option-list row
// filter uses this instead of maintaining its own copy: search + Select All + Clear + scrollable checkbox
// list, white floating panel, trigger summary, keyboard + outside-click/Esc, and viewport collision.
//
// It is UI-only: it never knows a page's business/query logic. The page owns the option universe and the
// query; the component just reports the selected values via onChange. Same-filter multiple selections are
// an OR set; cross-filter AND logic stays in the page. Empty selection = "All" (no filtering) — the page
// keeps its own empty/[]/'' runtime convention.
//
//   var ctl = KM.ui.multiFilter.create({
//     mount,            // container element (or id) to render the trigger + panel into
//     filterId,         // unique id within the page (used for aria ids)
//     label,            // filter name, e.g. 'Country'  → trigger reads "All Country" when nothing selected
//     options,          // [{value,label}] or [string]  (the current option universe for this dimension)
//     selectedValues,   // string[] initial selection ([] = All)
//     onChange,         // function(selectedValues) — called after any selection change
//     placeholder,      // optional search placeholder (default "Search {label}…")
//     disabled          // optional bool
//   });
//   ctl.setOptions(opts) / ctl.setSelected(vals) / ctl.getSelected() / ctl.setDisabled(b)
//      / ctl.open() / ctl.close() / ctl.refresh() / ctl.destroy()
//
// Idempotent: calling create() again on the same `mount` REUSES the existing controller (updates options/
// selection/label) instead of building a second panel or re-binding listeners — so page re-renders never
// duplicate handlers. Scoped `.kmf-*` CSS only (components.css); no global .dropdown/.button/.select rules.
// ============================================================
(function () {
  'use strict';
  window.KM = window.KM || {};
  window.KM.ui = window.KM.ui || {};
  if (window.KM.ui.multiFilter) return;

  // Registry of currently-open instances so ONE global outside-click / Esc handler serves them all.
  var OPEN = [];
  var _globalBound = false;
  function _bindGlobal() {
    if (_globalBound) return;
    _globalBound = true;
    document.addEventListener('click', function (e) {
      if (!OPEN.length) return;
      OPEN.slice().forEach(function (inst) {
        if (!inst.root.contains(e.target)) inst._close();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !OPEN.length) return;
      var inst = OPEN[OPEN.length - 1];
      if (inst) { inst._close(); if (inst.trigger) inst.trigger.focus(); }
    });
    // Re-clamp open panels on resize so a viewport change never leaves one off-screen.
    window.addEventListener('resize', function () { OPEN.slice().forEach(function (inst) { inst._position(); }); });
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function _normOptions(options) {
    return (options || []).map(function (o) {
      if (o && typeof o === 'object') return { value: String(o.value), label: String(o.label == null ? o.value : o.label) };
      return { value: String(o), label: String(o) };
    });
  }

  function create(cfg) {
    cfg = cfg || {};
    var mount = typeof cfg.mount === 'string' ? document.getElementById(cfg.mount) : cfg.mount;
    if (!mount) return null;

    // Idempotent reuse: a second create() on the same mount just updates the existing instance.
    if (mount.__kmfCtl) {
      var existing = mount.__kmfCtl;
      if (cfg.options) existing.setOptions(cfg.options, true);
      if (cfg.selectedValues) existing.setSelected(cfg.selectedValues, true);
      if (cfg.onChange) existing._onChange = cfg.onChange;
      if (cfg.label != null) existing.label = cfg.label;
      if (typeof cfg.disabled === 'boolean') existing.setDisabled(cfg.disabled);
      existing.refresh();
      return existing._api;
    }

    var inst = {
      label: cfg.label || 'Filter',
      placeholder: cfg.placeholder || ('Search ' + (cfg.label || '') + '…'),
      _onChange: cfg.onChange || function () {},
      options: _normOptions(cfg.options),
      selected: (cfg.selectedValues || []).map(String),
      disabled: !!cfg.disabled,
      // emptyMeansAll (default true): 0 selected → trigger reads the "all" text and the host treats [] as
      // "no filter". Pages whose runtime is positive-inclusion (e.g. FC Summary: none checked ⇒ show none)
      // pass emptyMeansAll:false → the 0-selected label reads the "none" text so the summary isn't misleading.
      emptyMeansAll: cfg.emptyMeansAll !== false,
      // Trigger summary text overrides (per §4). Defaults match the recommended rule: 0 → "All {label}",
      // 1 → that option's label, N → "N selected". A page can pass allText (e.g. Carrier uses "All",
      // SKU uses "All Categories") and noneText.
      allText: cfg.allText || ('All ' + (cfg.label || 'Filter')),
      noneText: cfg.noneText || 'None',
      singleShowsLabel: cfg.singleShowsLabel !== false,
      isOpen: false
    };
    var fid = cfg.filterId || ('kmf-' + Math.abs((inst.label + mount.id + inst.options.length).split('').reduce(function (a, c) { return (a * 31 + c.charCodeAt(0)) | 0; }, 7)));

    // ---- markup ----
    var root = document.createElement('div');
    root.className = 'kmf';
    root.innerHTML =
      '<button type="button" class="kmf-trigger" id="' + _esc(fid) + '-trigger" aria-haspopup="listbox" ' +
        'aria-expanded="false" aria-controls="' + _esc(fid) + '-panel">' +
        '<span class="kmf-trigger__label"></span><span class="kmf-trigger__icon" aria-hidden="true">▼</span>' +
      '</button>' +
      '<div class="kmf-panel" id="' + _esc(fid) + '-panel" role="group" aria-label="Filter by ' + _esc(inst.label) + '" hidden>' +
        '<input type="text" class="kmf-search" aria-label="Search ' + _esc(inst.label) + '" placeholder="' + _esc(inst.placeholder) + '">' +
        '<div class="kmf-tools">' +
          '<button type="button" class="kmf-link" data-kmf-act="all">Select All</button>' +
          '<button type="button" class="kmf-link" data-kmf-act="clear">Clear</button>' +
        '</div>' +
        '<div class="kmf-list" role="listbox" aria-multiselectable="true"></div>' +
      '</div>';
    mount.appendChild(root);

    inst.root = root;
    inst.trigger = root.querySelector('.kmf-trigger');
    inst.labelEl = root.querySelector('.kmf-trigger__label');
    inst.panel = root.querySelector('.kmf-panel');
    inst.searchEl = root.querySelector('.kmf-search');
    inst.listEl = root.querySelector('.kmf-list');

    // ---- helpers ----
    inst._labelFor = function (value) {
      var hit = inst.options.filter(function (o) { return o.value === value; })[0];
      return hit ? hit.label : value;
    };
    inst._updateTriggerLabel = function () {
      var n = inst.selected.length;
      inst.labelEl.textContent = n === 0 ? ('All ' + inst.label)
        : (n === 1 ? inst._labelFor(inst.selected[0]) : (n + ' selected'));
      inst.trigger.setAttribute('aria-expanded', inst.isOpen ? 'true' : 'false');
    };
    inst._renderList = function () {
      var sel = inst.selected;
      if (!inst.options.length) {
        inst.listEl.innerHTML = '<div class="kmf-empty">No options</div>';
      } else {
        inst.listEl.innerHTML = inst.options.map(function (o) {
          var checked = sel.indexOf(o.value) !== -1;
          return '<label class="kmf-item" role="option" aria-selected="' + (checked ? 'true' : 'false') + '">' +
            '<input type="checkbox" value="' + _esc(o.value) + '"' + (checked ? ' checked' : '') + '>' +
            '<span>' + _esc(o.label) + '</span></label>';
        }).join('');
      }
      // Re-apply the active search filter after a re-render.
      if (inst.searchEl.value) inst._applySearch(inst.searchEl.value);
    };
    inst._applySearch = function (q) {
      var low = String(q || '').toLowerCase();
      var items = inst.listEl.querySelectorAll('.kmf-item');
      var anyVisible = false;
      Array.prototype.forEach.call(items, function (item) {
        var show = !low || (item.textContent || '').toLowerCase().indexOf(low) !== -1;
        item.style.display = show ? '' : 'none';
        if (show) anyVisible = true;
      });
      var empty = inst.listEl.querySelector('.kmf-empty--search');
      if (!anyVisible && items.length) {
        if (!empty) {
          empty = document.createElement('div');
          empty.className = 'kmf-empty kmf-empty--search';
          empty.textContent = 'No matches';
          inst.listEl.appendChild(empty);
        }
        empty.style.display = '';
      } else if (empty) {
        empty.style.display = 'none';
      }
    };
    inst._collectSelection = function () {
      // Preserve already-selected values that are hidden by the current search (never silently uncheck).
      var checked = [];
      Array.prototype.forEach.call(inst.listEl.querySelectorAll('input[type="checkbox"]'), function (cb) {
        if (cb.checked) checked.push(cb.value);
      });
      inst.selected = checked;
      // sync aria-selected
      Array.prototype.forEach.call(inst.listEl.querySelectorAll('.kmf-item'), function (item) {
        var cb = item.querySelector('input'); if (cb) item.setAttribute('aria-selected', cb.checked ? 'true' : 'false');
      });
      inst._updateTriggerLabel();
      inst._onChange(inst.selected.slice());
    };
    inst._position = function () {
      if (!inst.isOpen) return;
      inst.panel.classList.remove('kmf-panel--right');
      var pr = inst.panel.getBoundingClientRect();
      var vw = document.documentElement.clientWidth;
      // If the left-anchored panel spills past the right edge, right-align it (collision adjust).
      if (pr.right > vw - 8 && pr.width < vw - 16) inst.panel.classList.add('kmf-panel--right');
    };
    inst._open = function () {
      if (inst.disabled || inst.isOpen) return;
      // Close any other open instance first (one panel at a time, like the page-local versions).
      OPEN.slice().forEach(function (o) { if (o !== inst) o._close(); });
      inst.panel.hidden = false;
      inst.isOpen = true;
      inst.trigger.setAttribute('aria-expanded', 'true');
      if (OPEN.indexOf(inst) === -1) OPEN.push(inst);
      inst._position();
      if (inst.searchEl) { try { inst.searchEl.focus(); } catch (e) {} }
    };
    inst._close = function () {
      if (!inst.isOpen) return;
      inst.panel.hidden = true;
      inst.isOpen = false;
      inst.trigger.setAttribute('aria-expanded', 'false');
      var i = OPEN.indexOf(inst); if (i !== -1) OPEN.splice(i, 1);
    };

    // ---- listeners (bound ONCE per instance) ----
    inst.trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (inst.isOpen) inst._close(); else inst._open();
    });
    inst.panel.addEventListener('click', function (e) { e.stopPropagation(); });
    inst.searchEl.addEventListener('input', function () { inst._applySearch(inst.searchEl.value); });
    inst.listEl.addEventListener('change', function (e) {
      if (e.target && e.target.matches && e.target.matches('input[type="checkbox"]')) inst._collectSelection();
    });
    root.querySelector('.kmf-tools').addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-kmf-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-kmf-act');
      if (act === 'all') inst.selected = inst.options.map(function (o) { return o.value; });
      else if (act === 'clear') inst.selected = [];
      inst._renderList();
      inst._updateTriggerLabel();
      inst._onChange(inst.selected.slice());
    });

    inst._applyDisabled = function () {
      inst.trigger.disabled = inst.disabled;
      inst.root.classList.toggle('kmf--disabled', inst.disabled);
      if (inst.disabled) inst._close();
    };

    // ---- public API ----
    inst._api = {
      setOptions: function (options, _skipRender) {
        inst.options = _normOptions(options);
        // Drop selections no longer in the universe (keeps empty=All semantics honest).
        var valid = {}; inst.options.forEach(function (o) { valid[o.value] = 1; });
        inst.selected = inst.selected.filter(function (v) { return valid[v]; });
        if (!_skipRender) { inst._renderList(); inst._updateTriggerLabel(); }
        return inst._api;
      },
      setSelected: function (values, _skipRender) {
        var valid = {}; inst.options.forEach(function (o) { valid[o.value] = 1; });
        inst.selected = (values || []).map(String).filter(function (v) { return !inst.options.length || valid[v]; });
        if (!_skipRender) { inst._renderList(); inst._updateTriggerLabel(); }
        return inst._api;
      },
      getSelected: function () { return inst.selected.slice(); },
      setDisabled: function (b) { inst.disabled = !!b; inst._applyDisabled(); return inst._api; },
      open: function () { inst._open(); return inst._api; },
      close: function () { inst._close(); return inst._api; },
      refresh: function () { inst._renderList(); inst._updateTriggerLabel(); inst._applyDisabled(); return inst._api; },
      destroy: function () {
        inst._close();
        if (inst.root && inst.root.parentNode) inst.root.parentNode.removeChild(inst.root);
        try { delete mount.__kmfCtl; } catch (e) { mount.__kmfCtl = null; }
      },
      el: root
    };

    mount.__kmfCtl = inst._api;
    _bindGlobal();
    inst._renderList();
    inst._updateTriggerLabel();
    inst._applyDisabled();
    return inst._api;
  }

  window.KM.ui.multiFilter = { create: create };
})();
