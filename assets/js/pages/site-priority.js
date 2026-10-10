// =============================================================================================================
// S8-B2-R1 — SITE PRIORITY MANAGEMENT PAGE
// -------------------------------------------------------------------------------------------------------------
// The editing surface `marketplaces.allocation_priority` never had. The column existed, `upsertMarketplace`
// could already write it, and fifteen core modules plus five server files read it — but the only way to SET one
// was to type into the spreadsheet. §45.C.4 sequenced this page last deliberately: it cannot display a blank
// priority honestly while the layers underneath invent 0 for it. R50 (D-S8-A1 / D-S8-B1) settled that.
//
// THREE RULES THIS FILE EXISTS TO KEEP
//
// 1. NO SECOND WRITER. `KM.DB.upsertMarketplace` is the one writer that mutates the `marketplaces` master, and
//    it already invalidates the reference cache after a confirmed success. This page calls it and adds nothing.
//
// 2. THE WRITE ECHOES THE STORED ROW, VERBATIM. `handleUpsertMarketplace_` finds its target by
//    company + country + marketplace compared as RAW TRIMMED, CASE-SENSITIVE strings — it does not canonicalize.
//    So a save must send the values the row actually holds. Sending a canonical 'GB' for a row stored 'UK' would
//    not match, and the handler would INSERT A SECOND ROW. That is why canonical country is used for grouping and
//    display ONLY, and never reaches the payload.
//
//    The same handler writes `status`, `currency` and `marketplace_display_name` UNCONDITIONALLY on update, and
//    defaults `status` to 'active' when absent. A payload carrying only a priority would therefore silently
//    reactivate a disabled marketplace and blank its display name. Every save here echoes those fields back from
//    the loaded row. This was measured in the handler, not assumed.
//
// 3. MISSING IS NOT ZERO, IN BOTH DIRECTIONS. A blank cell renders as MISSING and an explicit 0 renders as 0.
//    The editor refuses a negative, a non-numeric and a non-finite value rather than coercing it.
//
// WHAT THIS PAGE DELIBERATELY CANNOT DO: CLEAR A PRIORITY BACK TO MISSING.
// `handleUpsertMarketplace_` resolves `allocation_priority` to '' when the field is absent or empty, and then
// writes it only `if (allocationPriority !== '')`. A blank is a NO-OP, not a clear — the stored value survives.
// There is no supported way to un-set a priority through the existing API, and inventing one would mean either a
// sentinel value (which every reader would then have to learn) or a second writer. Both were refused. The page
// states the limitation where an operator meets it instead of offering a control that silently does nothing.
'use strict';

(function () {

  var SECTION_ID = 'site-priority-section';
  var PARTIAL_KEY = 'site-priority';
  var PARTIAL_URL = 'assets/html/pages/site-priority.html';
  var MOUNT = '#site-priority-mount';

  // ---- identity -----------------------------------------------------------------------------------------
  // The canonical country owner, BORROWED not restated. KMCID knows one alias (UK ≡ GB) because the database
  // carries both spellings; a second table here would drift from it, which is the defect D-S8-A1 repaired in
  // the producers. The fallback folds case only — it never guesses an alias it cannot know.
  function canonCountry(v) {
    var CID = window.KM && window.KM.countryIdentity;
    if (CID && typeof CID.canonicalCountryCode === 'function') return CID.canonicalCountryCode(v);
    return String(v == null ? '' : v).trim().toUpperCase();
  }
  function str(v) { return String(v == null ? '' : v).trim(); }
  // Display identity: canonical country, raw company and marketplace. Company and marketplace are NOT folded,
  // because 03_'s upsert compares them case-sensitively — folding would merge rows the database keeps apart.
  function identityOf(r) { return [str(r.company), canonCountry(r.country), str(r.marketplace)].join('\u0001'); }

  // ---- priority semantics (§45.A) -----------------------------------------------------------------------
  // The ONE place this page decides what a stored value means. Returns {state, value}.
  //   MISSING  absent, null or blank            — unresolved, never 0
  //   SET      a finite number >= 0, incl. 0    — 0 is the lowest VALID priority
  //   INVALID  negative, non-numeric, non-finite — stored but unusable; surfaced, never silently repaired
  function classify(raw) {
    if (raw === null || raw === undefined || str(raw) === '') return { state: 'MISSING', value: null };
    var n = Number(raw);
    if (!isFinite(n)) return { state: 'INVALID', value: null };
    if (n < 0) return { state: 'INVALID', value: n };
    return { state: 'SET', value: n };
  }

  // Validation for OPERATOR INPUT. Deliberately stricter than `classify`, which reads what is already stored:
  // a value someone is typing now has no reason to be invalid, so a refusal here is cheaper than a refusal
  // three layers down inside the allocator.
  function validateInput(text) {
    var t = str(text);
    if (t === '') return { ok: false, reason: 'Enter a number. A priority cannot be cleared here — see the note below the table.' };
    if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false, reason: 'Priority must be a plain number (no letters, symbols or spaces).' };
    var n = Number(t);
    if (!isFinite(n)) return { ok: false, reason: 'Priority must be a finite number.' };
    if (n < 0) return { ok: false, reason: 'Priority must be 0 or greater. 0 is valid and ranks last; a negative value is not a priority.' };
    return { ok: true, value: n };
  }

  // ---- DOM helpers --------------------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var _rows = [];          // normalized marketplace records, as loaded
  var _editingKey = null;  // identity of the row currently in edit mode, or null
  var _busy = false;

  function setStatus(kind, text) {
    var el = $('sp-status');
    if (!el) return;
    if (!kind) { el.hidden = true; el.textContent = ''; el.className = 'sp-status'; return; }
    el.hidden = false;
    el.className = 'sp-status sp-status--' + kind;
    el.textContent = text;
  }

  // ---- data ---------------------------------------------------------------------------------------------
  function loadRows() {
    var db = window.KM && window.KM.DB;
    if (!db || typeof db.getMarketplaces !== 'function') return [];
    var raw = db.getMarketplaces() || [];
    return raw.filter(function (r) { return str(r.marketplace) !== ''; });
  }

  function refresh(opts) {
    opts = opts || {};
    setStatus('loading', 'Loading marketplace sites…');
    var db = window.KM && window.KM.DB;
    var p = (opts.force && db && typeof db.refreshOperationDb === 'function')
      ? Promise.resolve(db.refreshOperationDb()).catch(function () { return null; })
      : Promise.resolve(null);
    return p.then(function () {
      _rows = loadRows();
      if (!_rows.length) {
        setStatus('error', 'No marketplace sites could be read. The reference data may not have loaded yet — use Refresh.');
      } else {
        setStatus(null);
      }
      renderFilters();
      render();
      return _rows.length;
    });
  }

  // ---- rendering ----------------------------------------------------------------------------------------
  function renderFilters() {
    var companySel = $('sp-filter-company'), countrySel = $('sp-filter-country');
    if (!companySel || !countrySel) return;
    var keepCo = companySel.value, keepCt = countrySel.value;

    var companies = {}, countries = {};
    _rows.forEach(function (r) {
      if (str(r.company)) companies[str(r.company)] = 1;
      // Countries are listed by CANONICAL code, so UK and GB are one entry rather than two that each show half
      // the sites. The raw spelling still renders in the row.
      if (str(r.country)) countries[canonCountry(r.country)] = 1;
    });
    function fill(sel, values, allLabel, keep) {
      var html = '<option value="">' + esc(allLabel) + '</option>';
      Object.keys(values).sort().forEach(function (v) {
        html += '<option value="' + esc(v) + '">' + esc(v) + '</option>';
      });
      sel.innerHTML = html;
      if (keep && values[keep]) sel.value = keep;
    }
    fill(companySel, companies, 'All companies', keepCo);
    fill(countrySel, countries, 'All countries', keepCt);
  }

  function visibleRows() {
    var co = $('sp-filter-company') ? $('sp-filter-company').value : '';
    var ct = $('sp-filter-country') ? $('sp-filter-country').value : '';
    return _rows.filter(function (r) {
      if (co && str(r.company) !== co) return false;
      if (ct && canonCountry(r.country) !== ct) return false;
      return true;
    }).sort(function (a, b) {
      return str(a.company).localeCompare(str(b.company))
        || canonCountry(a.country).localeCompare(canonCountry(b.country))
        || str(a.marketplace).localeCompare(str(b.marketplace));
    });
  }

  function render() {
    var tbody = $('sp-rows');
    if (!tbody) return;
    var rows = visibleRows();
    var empty = $('sp-empty');
    if (empty) empty.hidden = rows.length > 0;

    tbody.innerHTML = rows.map(function (r) {
      var key = identityOf(r);
      var c = classify(r.allocationPriority);
      var editing = (_editingKey === key);
      var priorityCell = editing
        ? '<input type="text" class="sp-input" data-sp-input="' + esc(key) + '" '
          + 'value="' + esc(c.state === 'SET' ? String(c.value) : '') + '" '
          + 'inputmode="decimal" aria-label="Allocation priority" />'
        : (c.state === 'SET' ? '<span class="sp-pri">' + esc(String(c.value)) + '</span>'
                             : '<span class="sp-pri sp-pri--none">—</span>');
      var stateCell = '<span class="sp-badge sp-badge--' + c.state.toLowerCase() + '">'
        + (c.state === 'SET' ? 'Set' : (c.state === 'MISSING' ? 'Missing' : 'Invalid')) + '</span>';
      var actions = editing
        ? '<button type="button" class="sp-btn sp-btn--primary" data-sp-save="' + esc(key) + '">Save</button>'
          + '<button type="button" class="sp-btn sp-btn--ghost" data-sp-cancel="1">Cancel</button>'
        : '<button type="button" class="sp-btn sp-btn--ghost" data-sp-edit="' + esc(key) + '">Edit</button>';
      // The COUNTRY CELL SHOWS THE STORED SPELLING, with the canonical code beside it only when they differ.
      // The operator edits the row the database holds; hiding its real value behind a canonical one would make
      // a UK row and a GB row look identical in the one place someone might need to tell them apart.
      var canon = canonCountry(r.country);
      var countryCell = esc(str(r.country))
        + (canon !== str(r.country).toUpperCase() || canon !== str(r.country)
            ? ' <span class="sp-canon" title="canonical identity">' + esc(canon) + '</span>' : '');
      return '<tr data-sp-row="' + esc(key) + '" class="' + (editing ? 'sp-row--editing' : '') + '">'
        + '<td>' + esc(str(r.company)) + '</td>'
        + '<td>' + countryCell + '</td>'
        + '<td>' + esc(str(r.marketplace)) + '</td>'
        + '<td class="sp-col-pri">' + priorityCell + '</td>'
        + '<td class="sp-col-state">' + stateCell + '</td>'
        + '<td class="sp-col-act">' + actions + '</td>'
        + '</tr>';
    }).join('');
  }

  function rowByKey(key) {
    for (var i = 0; i < _rows.length; i++) if (identityOf(_rows[i]) === key) return _rows[i];
    return null;
  }

  // ---- save ---------------------------------------------------------------------------------------------
  function save(key) {
    if (_busy) return Promise.resolve(false);
    var row = rowByKey(key);
    if (!row) { setStatus('error', 'That site is no longer in the loaded data. Refresh and try again.'); return Promise.resolve(false); }
    var input = document.querySelector('[data-sp-input="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    if (!input) { var all = document.querySelectorAll('[data-sp-input]'); input = all.length === 1 ? all[0] : null; }
    if (!input) { setStatus('error', 'The editor is no longer open for that site.'); return Promise.resolve(false); }

    var v = validateInput(input.value);
    if (!v.ok) { setStatus('error', v.reason); return Promise.resolve(false); }

    var db = window.KM && window.KM.DB;
    if (!db || typeof db.upsertMarketplace !== 'function') {
      setStatus('error', 'The marketplace writer is unavailable. Nothing was saved.');
      return Promise.resolve(false);
    }

    // ECHO THE STORED ROW. See rule 2 in the header: status / currency / display name are written
    // unconditionally by the handler, and an omitted status defaults to 'active'.
    var payload = {
      company: str(row.company),
      country: str(row.country),                        // RAW, never canonical — this is the match key
      marketplace: str(row.marketplace),
      currency: str(row.currency),                      // REQUIRED by the handler; a blank one is refused
      status: str(row.status) || 'active',
      marketplace_display_name: str(row.marketplaceDisplayName) || str(row.marketplace),
      allocation_priority: v.value,
      updated_by: 'site-priority-page'
    };
    if (str(row.fulfillmentModel)) payload.fulfillment_model = str(row.fulfillmentModel);

    _busy = true;
    setStatus('loading', 'Saving ' + str(row.company) + ' / ' + str(row.country) + ' / ' + str(row.marketplace) + '…');
    return Promise.resolve(db.upsertMarketplace(payload)).then(function () {
      // READ-AFTER-WRITE. The write resolving is not evidence that the value persisted: the handler skips the
      // column when it cannot find it, and a stale cache would happily show the number we just typed. So the
      // data is re-read and the stored value is compared against what was sent.
      return refresh({ force: true }).then(function () {
        var after = rowByKey(key);
        var c = after ? classify(after.allocationPriority) : { state: 'MISSING', value: null };
        if (c.state === 'SET' && Number(c.value) === Number(v.value)) {
          _editingKey = null;
          render();
          setStatus('success', 'Saved. ' + str(row.company) + ' / ' + str(row.country) + ' / '
            + str(row.marketplace) + ' now has priority ' + v.value + '.');
          return true;
        }
        _editingKey = null;
        render();
        setStatus('error', 'The save was accepted but the stored value does not match — it now reads '
          + (c.state === 'SET' ? c.value : c.state.toLowerCase())
          + '. Check the marketplaces sheet before retrying.');
        return false;
      });
    }).catch(function (err) {
      // A FAILURE IS NEVER SHOWN AS A SUCCESS. The writer throws on a non-ok response and on success:false,
      // so there is no path where a refused write leaves this banner green.
      _editingKey = null;
      render();
      setStatus('error', 'Save failed — nothing was written. ' + (err && err.message ? err.message : String(err)));
      return false;
    }).then(function (r) { _busy = false; return r; });
  }

  // ---- events -------------------------------------------------------------------------------------------
  // ONE delegated listener per event, attached ONCE to the section, with an idempotence flag. Re-mounting a
  // page is ordinary navigation here, so a listener attached on every mount would fire N times after N visits —
  // which for a writer means N saves from one click.
  function bind() {
    var sec = $(SECTION_ID);
    if (!sec || sec.getAttribute('data-sp-bound') === '1') return;
    sec.setAttribute('data-sp-bound', '1');

    sec.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var edit = t.getAttribute('data-sp-edit');
      if (edit) { _editingKey = edit; setStatus(null); render(); return; }
      if (t.getAttribute('data-sp-cancel')) { _editingKey = null; setStatus(null); render(); return; }
      var sv = t.getAttribute('data-sp-save');
      if (sv) { save(sv); return; }
      if (t.id === 'sp-refresh') { refresh({ force: true }); return; }
    });

    sec.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t && (t.id === 'sp-filter-company' || t.id === 'sp-filter-country')) { _editingKey = null; render(); }
    });
  }

  function ensureMarkup() {
    if (document.getElementById(SECTION_ID)) return Promise.resolve(true);
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
      return window.KM.partialLoader.loadPartial(PARTIAL_KEY, PARTIAL_URL, MOUNT)
        .then(function () { return true; })
        .catch(function (err) {
          try { console.warn('[SitePriority] partial load failed:', err); } catch (e) {}
          return false;
        });
    }
    return Promise.resolve(false);
  }

  function mount() {
    return ensureMarkup().then(function (ok) {
      if (!ok) return false;
      var sec = $(SECTION_ID);
      if (sec) sec.classList.add('active');
      bind();
      return refresh();            // READ-ONLY on mount. This page never writes without a click.
    });
  }

  if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register(SECTION_ID, {
      mount: mount,
      // Edit state is discarded on leave rather than kept: a half-typed priority restored on return is a value
      // nobody can tell apart from a saved one. The delegated listeners stay — they are bound once, to a node
      // that persists, and rebinding is what would duplicate them.
      unmount: function () { _editingKey = null; _busy = false; }
    });
  }

  // Exposed for tests and for the inline handler bridge the shell uses elsewhere.
  window.initSitePriorityPage = mount;
  window.KM = window.KM || {};
  window.KM.sitePriority = {
    classify: classify, validateInput: validateInput, identityOf: identityOf, canonCountry: canonCountry,
    _state: function () { return { rows: _rows.slice(), editingKey: _editingKey, busy: _busy }; }
  };

})();
