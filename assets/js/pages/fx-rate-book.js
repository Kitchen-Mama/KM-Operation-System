// FX1 — FX Rate Book (Administration page controller).
//
// PREPARED, NOT ROUTED. index.html does not reference this file, there is no menu entry and no section
// id is registered, so nothing loads it. It exists so the backend change list in
// docs/planning/FX_RATE_BOOK_CONTRACT_FX1.md is reviewed against a real surface rather than a sketch,
// and so the IR release is not waiting on FX work.
//
// READ-ONLY ON LOAD. Opening the page calls the read action and nothing else. Only "Save changes"
// writes, and a write carries the version it read.
//
// NO RULES LIVE HERE. Validation, resolution, the frozen direction, the identity, the effective period,
// the active status, version conflict and the change record are defined ONCE in
// assets/tests/_fx-rate-book-contract.js. This file renders and submits; it decides nothing. When the
// contract moves to a shipped location the require below becomes that path and nothing else changes.
//
// AND IT PRICES NOTHING. 73_ stays the one writer of pricing_list — the invariant that makes its
// field-level ownership flags trustworthy. This page produces the `rates: [...]` INPUT that
// pricing.fxReconcile already accepts.
(function () {
  'use strict';

  // The two actions this page needs. NEITHER EXISTS YET; they are the first two items of the backend
  // change list. Named here so the list and the page cannot drift apart.
  var READ_ACTION = 'fx.rateBook.get';
  var WRITE_ACTION = 'fx.rateBook.save';

  var _state = { book: [], required: [], loaded: false, busy: false };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(id) { return document.getElementById(id); }

  // The contract module, resolved at runtime so this file carries no second copy of the rules.
  function contract() {
    return (typeof window !== 'undefined' && window.KM && window.KM.fxRateBookContract) || null;
  }

  // ------------------------------------------------------------------------------------------------
  // COVERAGE — which pairs the live pricing_list needs, and which of them the book can answer.
  //
  // The question is answered by the DATABASE, never by this page: base_currency is a per-row column, so
  // a list derived in the browser would be a guess. `required_pairs` comes back from a DRY-RUN
  // reconciliation, which writes nothing.
  // ------------------------------------------------------------------------------------------------
  function renderCoverage() {
    var host = el('fx-book-coverage');
    if (!host) return;
    var C = contract();
    if (!C) { host.innerHTML = '<div class="fx-book-err">The FX contract module is not loaded; no coverage can be computed.</div>'; return; }
    if (!_state.required.length) {
      host.innerHTML = '<div class="fx-book-note">No required pairs reported yet. Run a dry-run reconciliation to populate this.</div>';
      return;
    }
    var today = (_state.runDate || '');
    var rows = _state.required.map(function (p) {
      var r = C.resolveRate(_state.book, p.base_currency, p.quote_currency, today);
      var cls = r.ok ? 'fx-ok' : 'fx-missing';
      // A HOLE IS NAMED, NOT COUNTED. 73_ will skip exactly these rows as MISSING_FX_RATE, and the
      // operator has to see which ones before running, not discover them in the result.
      var why = r.ok ? (r.identity ? 'identity (1)' : esc(String(r.rate)) + ' &middot; ' + esc(r.source))
        : esc(r.reason) + (r.detail ? ' — ' + esc(r.detail) : '');
      return '<tr class="' + cls + '"><td>' + esc(p.base_currency) + '&gt;' + esc(p.quote_currency)
        + '</td><td>' + why + '</td></tr>';
    }).join('');
    var missing = _state.required.filter(function (p) {
      return !C.resolveRate(_state.book, p.base_currency, p.quote_currency, today).ok; }).length;
    host.innerHTML = '<table class="fx-book-coverage-table"><caption>'
      + (missing ? ('<strong>' + missing + ' required pair(s) have no rate for ' + esc(today) + '.</strong> '
        + 'A reconciliation run now would SKIP those rows, not fail.')
        : 'Every required pair resolves for ' + esc(today) + '.')
      + '</caption><thead><tr><th>Pair</th><th>Resolves to</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // ------------------------------------------------------------------------------------------------
  // THE BOOK
  // ------------------------------------------------------------------------------------------------
  function renderBook() {
    var host = el('fx-book-table');
    if (!host) return;
    if (!_state.loaded) { host.innerHTML = '<div class="fx-book-loading">Loading rate book&hellip;</div>'; return; }
    if (!_state.book.length) {
      host.innerHTML = '<div class="fx-book-note">The rate book is empty. Nothing can be reconciled until a rate is entered.</div>';
      return;
    }
    var rows = _state.book.map(function (e, i) {
      // effective_to EMPTY is open-ended, and it is rendered as a WORD rather than as a blank cell, so
      // "until further notice" is not read as "somebody forgot".
      var to = String(e.effective_to || '').trim() ? esc(e.effective_to) : '<em>open-ended</em>';
      return '<tr data-i="' + i + '" class="' + (String(e.status).toLowerCase() === 'active' ? 'fx-active' : 'fx-inactive') + '">'
        + '<td>' + esc(e.base_currency) + '&gt;' + esc(e.quote_currency) + '</td>'
        + '<td class="fx-num">' + esc(String(e.rate)) + '</td>'
        + '<td>' + esc(e.source) + '</td>'
        + '<td>' + esc(e.as_of) + '</td>'
        + '<td>' + esc(e.effective_from) + ' &rarr; ' + to + '</td>'
        + '<td>' + esc(e.status) + '</td>'
        + '<td class="fx-num">v' + esc(String(e.version)) + '</td>'
        + '<td>' + esc(e.changed_by) + ' ' + esc(e.changed_at) + '</td>'
        + '</tr>';
    }).join('');
    host.innerHTML = '<table class="fx-book-rates"><thead><tr>'
      + '<th>Pair</th><th>Rate</th><th>Source</th><th>As of</th><th>Effective</th>'
      + '<th>Status</th><th>Ver</th><th>Last changed</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function showWarnings(errors) {
    var host = el('fx-book-warnings');
    if (!host) return;
    if (!errors || !errors.length) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    host.innerHTML = '<ul class="fx-book-errs">' + errors.map(function (e) {
      return '<li><code>' + esc(e.code) + '</code> ' + esc(e.detail || '') + '</li>';
    }).join('') + '</ul>';
  }

  // ------------------------------------------------------------------------------------------------
  // LOAD — one read, no write, and a failure that says so
  // ------------------------------------------------------------------------------------------------
  function load() {
    if (!(window.KM && window.KM.DB && typeof window.KM.DB.call === 'function')) {
      showWarnings([{ code: 'FX_BACKEND_UNAVAILABLE',
        detail: 'The rate book actions (' + READ_ACTION + ' / ' + WRITE_ACTION + ') are not deployed. '
          + 'This page is prepared ahead of them; nothing is missing from the database.' }]);
      _state.loaded = true;
      renderBook(); renderCoverage();
      return;
    }
    return Promise.resolve(window.KM.DB.call(READ_ACTION, {})).then(function (res) {
      if (!res || !res.success) {
        showWarnings([{ code: (res && res.error && res.error.code) || 'FX_READ_FAILED',
          detail: (res && res.error && res.error.detail) || 'The rate book could not be read. Nothing was changed.' }]);
        _state.loaded = true; renderBook(); return;
      }
      _state.book = (res.data && res.data.rates) || [];
      _state.required = (res.data && res.data.required_pairs) || [];
      _state.runDate = (res.data && res.data.as_of_today) || '';
      _state.loaded = true;
      var C = contract();
      if (C) showWarnings(C.validateBook(_state.book).errors);
      renderBook(); renderCoverage();
      var btn = el('fx-book-save'); if (btn) btn.disabled = false;
    }).catch(function (err) {
      showWarnings([{ code: 'FX_READ_THREW', detail: String(err && err.message || err) }]);
      _state.loaded = true; renderBook();
    });
  }

  function mount() { renderBook(); renderCoverage(); load(); }

  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.fxRateBookPage = { mount: mount, _state: _state };
  }
}());
