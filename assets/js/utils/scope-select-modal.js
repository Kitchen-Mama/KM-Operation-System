// Kitchen Mama Operation System — Scope Selection Modal (F1-AI-SUPPORT-SCOPE-R1).
// -----------------------------------------------------------------------------
// A small, SHARED, page-agnostic modal that lets a manual user pick a CONCRETE Country / Marketplace scope
// BEFORE running "AI Plan" or "Recalculate Current Scope" on the Inventory Replenishment or Order Planning page.
//
// It owns NO business logic: it neither recalculates a gap nor generates a recommendation. It only resolves a
// { company, country, marketplace, marketplaceId } DTO from the canonical marketplace source
// (window.KM.DB.getMarketplaces) and hands it to the caller's onConfirm — which delegates to the EXISTING
// CURRENT_SCOPE gap job / EXISTING AI Plan handler. No new API route, no new calc/recommendation engine, no
// per-SKU loop, no DB/schema/formula change. Country selection filters Marketplace; Marketplace selection
// resolves company + marketplaceId off the SAME canonical row (never invented from a frontend label — the same
// marketplace name can belong to two companies, so company+marketplaceId is the real identity). "All"/unselected
// never auto-confirms: Confirm stays disabled until a concrete single-marketplace scope resolves.
//
// The pure decision helpers are exported for Node tests; the DOM open/close is guarded (typeof document).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.scopeModal = api; }
})(this, function () {
  'use strict';

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function lc(v) { return str(v).toLowerCase(); }

  // ---- pure helpers (no DOM; unit-testable) ---------------------------------------------------------------
  // Active marketplaces only (respects marketplaces.status; blank status is treated as active). Must carry a
  // marketplaceId (the company-safe identity). Never hardcodes any country/marketplace list.
  function activeMarketplaces(list) {
    return (Array.isArray(list) ? list : []).filter(function (m) {
      if (!m || !str(m.marketplaceId)) return false;
      var s = lc(m.status);
      return s === '' || s === 'active' || s === 'true' || s === 'enabled' || s === '1' || s === 'yes';
    });
  }
  // Distinct, sorted countries across the active marketplaces.
  function countriesOf(list) {
    var seen = {}, out = [];
    activeMarketplaces(list).forEach(function (m) { var c = str(m.country); if (c && !seen[c]) { seen[c] = 1; out.push(c); } });
    out.sort();
    return out;
  }
  // Active marketplaces for one country (the Country → Marketplace filter). Deterministic order by display then id.
  function marketplacesForCountry(list, country) {
    var c = str(country);
    return activeMarketplaces(list).filter(function (m) { return str(m.country) === c; }).sort(function (a, b) {
      var an = str(a.marketplaceDisplayName || a.marketplace), bn = str(b.marketplaceDisplayName || b.marketplace);
      return an < bn ? -1 : (an > bn ? 1 : (str(a.marketplaceId) < str(b.marketplaceId) ? -1 : 1));
    });
  }
  // Resolve the scope DTO from a chosen marketplaceId, off the SAME canonical row (company owned by the row).
  function resolveScope(list, marketplaceId) {
    var id = str(marketplaceId);
    if (!id) return null;
    var rows = activeMarketplaces(list).filter(function (m) { return str(m.marketplaceId) === id; });
    if (rows.length !== 1) return null;   // ambiguous or missing → not a concrete scope
    var row = rows[0];
    return { company: str(row.company), country: str(row.country), marketplace: str(row.marketplace), marketplaceId: str(row.marketplaceId) };
  }
  // Confirm-enablement gate: a concrete single-marketplace scope (company + country + marketplace all present).
  function isConcreteScope(scope) {
    return !!(scope && str(scope.company) && str(scope.country) && str(scope.marketplace));
  }

  // The broad-cache reader that used to seed this modal is GONE. Leaving it as a "defensive fallback" is what
  // let an unprimed cache masquerade as "no countries configured"; there is now exactly one source.

  // F1-7N-FB-4C §B2 — THE SINGLE CANONICAL SCOPE AUTHORITY.
  //
  // This modal used to carry its OWN second source: a synchronous seed from the broad `_opDbCache` (which no
  // longer exists on a cold session, so it returned []) followed by `getMarketplaceReference()` — a WHOLE-TABLE
  // `marketplaces` read through a different owner. Meanwhile the Site Inventory filter row read the slim,
  // bounded registry action and worked. Two sources, two caches, two failure modes.
  //
  // The failure mode that produced the live symptom was silent: the async path swallowed a rejection and fell
  // back to the empty seed, and filling the select from [] renders "Select country…" and nothing else — AN
  // EMPTY SELECT PRESENTED AS SUCCESS. The user cannot tell "nothing is configured" from "the read failed".
  //
  // Both surfaces now go through KM.scopeRegistry. Consequences that are contract:
  //   · already loaded  -> opening this modal costs ZERO requests;
  //   · not yet loaded  -> exactly ONE request, shared with any other consumer asking at the same time;
  //   · Country change  -> read from the loaded index, ZERO requests;
  //   · READY / EMPTY / ERROR are distinct, and ERROR shows its code with a Retry that issues ONE request.
  function registry_() {
    return (typeof window !== 'undefined' && window.KM && window.KM.scopeRegistry) ? window.KM.scopeRegistry : null;
  }

  function ensureDom() {
    if (typeof document === 'undefined') return null;
    if (_dom && document.body.contains(_dom.modal)) return _dom;
    var overlay = document.createElement('div');
    overlay.className = 'km-scope-modal-overlay';
    overlay.id = 'km-scope-modal-overlay';
    var modal = document.createElement('div');
    modal.className = 'km-scope-modal';
    modal.id = 'km-scope-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<h3 class="km-scope-modal__title" id="km-scope-modal-title"></h3>' +
      '<p class="km-scope-modal__subtitle" id="km-scope-modal-subtitle"></p>' +
      '<div class="km-scope-modal__body">' +
      '  <div class="km-scope-modal__field"><label for="km-scope-country">Country *</label>' +
      '    <select id="km-scope-country"></select></div>' +
      '  <div class="km-scope-modal__field"><label for="km-scope-marketplace">Marketplace *</label>' +
      '    <select id="km-scope-marketplace"></select></div>' +
      '  <div class="km-scope-modal__context" id="km-scope-context" hidden></div>' +
      '</div>' +
      '<div class="km-scope-modal__actions">' +
      '  <button type="button" class="km-scope-modal__btn km-scope-modal__btn--cancel" id="km-scope-cancel">Cancel</button>' +
      '  <button type="button" class="km-scope-modal__btn km-scope-modal__btn--primary" id="km-scope-confirm" disabled aria-disabled="true">Confirm</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    _dom = {
      overlay: overlay, modal: modal,
      title: modal.querySelector('#km-scope-modal-title'),
      subtitle: modal.querySelector('#km-scope-modal-subtitle'),
      country: modal.querySelector('#km-scope-country'),
      marketplace: modal.querySelector('#km-scope-marketplace'),
      context: modal.querySelector('#km-scope-context'),
      cancel: modal.querySelector('#km-scope-cancel'),
      confirm: modal.querySelector('#km-scope-confirm')
    };
    overlay.addEventListener('click', function () { close(); });
    _dom.cancel.addEventListener('click', function () { close(); });
    _dom.country.addEventListener('change', onCountryChange);
    _dom.marketplace.addEventListener('change', onMarketplaceChange);
    _dom.confirm.addEventListener('click', onConfirmClick);
    document.addEventListener('keydown', onKeydown);
    return _dom;
  }

  function onKeydown(ev) {
    if (!_state) return;
    if (ev.key === 'Escape' || ev.keyCode === 27) { close(); }
  }

  function fillCountries(list, prefillCountry) {
    var d = _dom, cs = countriesOf(list);
    d.country.innerHTML = '<option value="">Select country…</option>' + cs.map(function (c) {
      return '<option value="' + c + '"' + (str(prefillCountry) === c ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
  }
  function fillMarketplaces(list, country, prefillMarketplaceId) {
    var d = _dom, ms = marketplacesForCountry(list, country);
    var enabled = !!str(country);
    d.marketplace.disabled = !enabled;
    d.marketplace.innerHTML = '<option value="">' + (enabled ? 'Select marketplace…' : 'Select a country first') + '</option>' +
      ms.map(function (m) {
        var label = str(m.marketplaceDisplayName || m.marketplace) + ' (' + str(m.company) + ')';
        return '<option value="' + str(m.marketplaceId) + '"' + (str(prefillMarketplaceId) === str(m.marketplaceId) ? ' selected' : '') + '>' + label + '</option>';
      }).join('');
  }
  function currentScope() {
    return resolveScope(_state.list, _dom.marketplace.value);
  }
  function refreshConfirm() {
    var scope = currentScope();
    var ok = isConcreteScope(scope);
    _dom.confirm.disabled = !ok;
    if (ok) { _dom.confirm.removeAttribute('aria-disabled'); } else { _dom.confirm.setAttribute('aria-disabled', 'true'); }
    if (ok) {
      _dom.context.hidden = false;
      _dom.context.textContent = 'Company: ' + scope.company + '  ·  Scope: ' + scope.country + ' / ' + scope.marketplace;
    } else {
      _dom.context.hidden = true; _dom.context.textContent = '';
    }
    _state.scope = ok ? scope : null;
  }
  function onCountryChange() {
    fillMarketplaces(_state.list, _dom.country.value, '');
    refreshConfirm();
  }
  function onMarketplaceChange() { refreshConfirm(); }
  function onConfirmClick() {
    var scope = currentScope();
    if (!isConcreteScope(scope)) return;               // never auto-confirm All/unselected
    var cb = _state.onConfirm;
    close();
    if (typeof cb === 'function') cb(scope);
  }

  // Apply a resolved marketplace universe to the two selects (Country → Marketplace), honoring a prefill/kept selection.
  function _applyList(list, prefill) {
    _state.list = Array.isArray(list) ? list : [];
    var p = prefill || {};
    fillCountries(_state.list, p.country);
    fillMarketplaces(_state.list, _dom.country.value, p.marketplaceId);
    refreshConfirm();
  }

  // The modal's own scope-state line. It sits above the selects and is the ONLY place that reports why the
  // Country list is not usable — so "no scopes are configured" and "the registry could not be read" can never
  // look alike, and neither can look like success.
  function _stateHost_() {
    var d = _dom; if (!d || !d.modal) return null;
    var el = d.modal.querySelector('[data-scope-state]');
    if (el) return el;
    el = document.createElement('div');
    el.setAttribute('data-scope-state', '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'font-size:12px;margin:0 0 8px;display:none;';
    if (d.country && d.country.parentNode) d.country.parentNode.insertBefore(el, d.country);
    else d.modal.insertBefore(el, d.modal.firstChild);
    return el;
  }
  function _renderScopeState(status, error) {
    var el = _stateHost_(); if (!el) return;
    var d = _dom;
    var disable = (status !== 'READY');
    if (d.country) d.country.disabled = disable;
    if (d.marketplace) d.marketplace.disabled = disable;
    if (status === 'READY') { el.style.display = 'none'; el.innerHTML = ''; refreshConfirm(); return; }
    var html = '';
    if (status === 'LOADING') {
      html = '<span style="color:#64748B;">Loading Country / Marketplace options…</span>';
    } else if (status === 'EMPTY') {
      // A REAL, successful configuration answer — not a failure, and never rendered as one.
      html = '<span style="color:#92400E;">No active marketplace scopes are configured, so there is no scope to run against. Nothing was read or written.</span>';
    } else {
      var e = error || {};
      var codeTxt = str(e.code) || 'SCOPE_REGISTRY_READ_FAILED';
      var stale = (codeTxt === 'DEPLOYMENT_CONTRACT_MISMATCH');
      var lead = stale
        ? 'Country / Marketplace options unavailable — the deployed Apps Script is out of date.'
        : 'Could not load the Country / Marketplace options.';
      html = '<span role="alert" style="color:#B91C1C;">' +
        '<strong>' + esc_(lead) + '</strong> ' + esc_(str(e.message)) +
        ' <code>' + esc_(codeTxt) + '</code>' +
        ' <button type="button" data-scope-retry style="margin-left:6px;padding:2px 8px;border:1px solid #EF4444;' +
        'background:#fff;color:#B91C1C;border-radius:3px;cursor:pointer;font-size:11px;">' +
        (stale ? 'Re-check' : 'Retry') + '</button></span>';
    }
    el.innerHTML = html;
    el.style.display = '';
    var btn = el.querySelector('[data-scope-retry]');
    if (btn) btn.addEventListener('click', function () { _loadScopes(_state && _state.prefill, true); });
  }
  function esc_(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Resolve the scope universe through the shared registry. `retry` is the ONLY way a previous ERROR re-issues
  // a request — simply reopening the modal never silently re-drives a failed read.
  function _loadScopes(prefill, retry) {
    var reg = registry_();
    var myToken = _openToken;
    if (!reg) {
      _renderScopeState('ERROR', { code: 'SCOPE_REGISTRY_MODULE_UNAVAILABLE', message: 'The shared scope registry is not loaded on this page.' });
      return Promise.resolve();
    }
    // ALREADY RESOLVED → paint from the cache with ZERO requests.
    if (!retry && reg.isReady && reg.isReady()) {
      var snap0 = reg.getState();
      _applyList((snap0.model && snap0.model.getMarketplaces) || [], prefill);
      _renderScopeState(snap0.status === reg.STATUS.EMPTY ? 'EMPTY' : 'READY', null);
      return Promise.resolve();
    }
    _renderScopeState('LOADING', null);
    return Promise.resolve(reg.ensureLoaded(retry ? { retry: true } : {})).then(function (snap) {
      if (myToken !== _openToken) return;                 // modal closed or reopened → drop this stale fill
      if (!snap || snap.status === reg.STATUS.ERROR) { _renderScopeState('ERROR', snap && snap.error); return; }
      _applyList((snap.model && snap.model.getMarketplaces) || [], prefill);
      _renderScopeState(snap.status === reg.STATUS.EMPTY ? 'EMPTY' : 'READY', null);
    })['catch'](function (err) {
      if (myToken !== _openToken) return;
      _renderScopeState('ERROR', { code: (err && err.code) || 'SCOPE_REGISTRY_READ_FAILED', message: (err && err.message) || String(err) });
    });
  }

  // open({ title, subtitle, confirmLabel, prefill:{country, marketplaceId}, onConfirm })
  function open(opts) {
    opts = opts || {};
    var d = ensureDom();
    if (!d) return;
    var prefill = opts.prefill || {};
    // NO broad-cache seed and NO whole-table read. The shared registry is the only source; when it is already
    // resolved this paints synchronously from its cache with zero requests, and when it is not the modal shows
    // an honest LOADING state rather than an empty select.
    _state = { list: [], onConfirm: opts.onConfirm, scope: null, prefill: prefill };
    d.title.textContent = str(opts.title) || 'AI Support';
    d.subtitle.textContent = str(opts.subtitle) || 'Select the scope';
    // F1-7N — distinct per-action confirm label so "AI Plan" and "Recalculate" read as different workflows.
    d.confirm.textContent = str(opts.confirmLabel) || 'Confirm';
    d.overlay.classList.add('is-open');
    d.modal.classList.add('is-open');
    var myToken = ++_openToken;
    _loadScopes(prefill, false);
    try { if (d.country.value) { (d.marketplace.value ? d.marketplace : d.country).focus(); } else { d.country.focus(); } } catch (e) { }
  }

  function close() {
    _state = null;
    if (!_dom) return;
    _dom.overlay.classList.remove('is-open');
    _dom.modal.classList.remove('is-open');
  }

  return {
    // pure (tested directly)
    activeMarketplaces: activeMarketplaces,
    countriesOf: countriesOf,
    marketplacesForCountry: marketplacesForCountry,
    resolveScope: resolveScope,
    isConcreteScope: isConcreteScope,
    // F1-7N-FB-4C — the scope source is now the ONE shared registry (tested directly through it).
    _registry: registry_,
    _loadScopes: _loadScopes,
    // DOM
    open: open,
    close: close,
    _version: 'f1-7n-fb-4c-shared-registry-r1'
  };
});
