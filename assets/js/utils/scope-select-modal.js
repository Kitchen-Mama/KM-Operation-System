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

  // Legacy synchronous read of the BROAD cache. After F1-7L zero-prime this is null/[] on a cold session — kept only
  // as a warm-session seed / defensive fallback, never the authoritative cold source (see getMarketplacesAsync).
  function getMarketplaces() {
    try { return (typeof window !== 'undefined' && window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? (window.KM.DB.getMarketplaces() || []) : []; }
    catch (e) { return []; }
  }

  // F1-7N — COLD-ELIGIBLE marketplace source. The Country/Marketplace universe must survive a cold F1-7L session
  // where the broad _opDbCache is unprimed. Route through the EXISTING scoped reference owner
  // window.KM.DB.getMarketplaceReference() (F1-7J-A2: bounded getTable('marketplaces') read, same normalizer+filter as
  // getMarketplaces() → BEFORE==AFTER row universe, session-cached via KM.referenceCache, NEVER the broad cache / never
  // getOperationDb). No new API/route. Falls back to the broad getter only if the reference owner is unavailable or
  // returns empty (defensive; warm-session parity). Always resolves a Promise.
  function getMarketplacesAsync() {
    try {
      if (typeof window !== 'undefined' && window.KM && window.KM.DB && typeof window.KM.DB.getMarketplaceReference === 'function') {
        var p = window.KM.DB.getMarketplaceReference();
        if (p && typeof p.then === 'function') {
          return p.then(function (list) { return (list && list.length) ? list : getMarketplaces(); })
                  .catch(function () { return getMarketplaces(); });
        }
        if (p && p.length) return Promise.resolve(p);              // defensive: a synchronous return
      }
    } catch (e) {}
    return Promise.resolve(getMarketplaces());
  }

  // ---- DOM (singleton; guarded) ---------------------------------------------------------------------------
  var _dom = null, _state = null, _openToken = 0;

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

  // open({ title, subtitle, confirmLabel, prefill:{country, marketplaceId}, onConfirm })
  function open(opts) {
    opts = opts || {};
    var d = ensureDom();
    if (!d) return;
    var prefill = opts.prefill || {};
    // Synchronous seed from the broad cache — populates instantly on a WARM session; [] on a cold F1-7L session.
    var seed = getMarketplaces();
    _state = { list: seed, onConfirm: opts.onConfirm, scope: null };
    d.title.textContent = str(opts.title) || 'AI Support';
    d.subtitle.textContent = str(opts.subtitle) || 'Select the scope';
    // F1-7N — distinct per-action confirm label so "AI Plan" and "Recalculate" read as different workflows.
    d.confirm.textContent = str(opts.confirmLabel) || 'Confirm';
    _applyList(seed, prefill);
    // F1-7N — cold affordance: when the broad seed is empty, show a transient loading hint until the reference resolves.
    if (!seed.length) { d.country.innerHTML = '<option value="">Loading…</option>'; d.country.disabled = true; d.marketplace.disabled = true; }
    d.overlay.classList.add('is-open');
    d.modal.classList.add('is-open');
    // F1-7N — authoritative COLD-ELIGIBLE refill from the scoped marketplace reference owner (never the broad cache).
    // Guarded by an open token so a stale async fill from a prior open cannot clobber a reopened modal.
    var myToken = ++_openToken;
    getMarketplacesAsync().then(function (list) {
      if (!_state || myToken !== _openToken) return;               // modal closed or reopened → drop this stale fill
      d.country.disabled = false;
      // preserve any selection the user already made against the warm seed; else honor the prefill.
      var keep = { country: d.country.value || prefill.country, marketplaceId: d.marketplace.value || prefill.marketplaceId };
      _applyList((list && list.length) ? list : seed, keep);
    });
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
    // F1-7N cold-eligible marketplace source (tested directly)
    _resolveMarketplacesAsync: getMarketplacesAsync,
    // DOM
    open: open,
    close: close,
    _version: 'f1-7n-cold-ref-r1'
  };
});
