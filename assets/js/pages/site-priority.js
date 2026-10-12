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
// 1. NO SECOND WRITER — AND, FROM R52, A WRITER THAT CAN DO NOTHING ELSE.
//    `KM.DB.setMarketplaceAllocationPriority` is the only path by which this page changes anything, and the
//    handler behind it (`marketplace.allocationPriority.set`, owner 03_) writes exactly three cells:
//    allocation_priority, updated_by, updated_at. It never appends, merges, renumbers or backfills.
//
// 2. THE ECHO PAYLOAD IS GONE, AND ITS ABSENCE IS THE POINT.
//    Until R52 this page saved through `upsertMarketplace`, which resolved its target by RAW TRIMMED
//    case-sensitive company + country + marketplace, APPENDED A NEW ROW when it matched nothing, and wrote
//    `status`, `currency` and `marketplace_display_name` unconditionally while auto-filling a blank
//    `marketplace_alias`. So a priority save had to echo five unrelated fields back verbatim just to avoid
//    disturbing them — and a single stale field, or a country spelling the sheet had since changed, could
//    reactivate a disabled marketplace, blank a display name, or create a duplicate marketplace outright.
//
//    None of that is defended against any more; it is simply unreachable. The payload carries the identity,
//    the new value and the compare-and-set, and nothing else. `upsertMarketplace` now REFUSES any request that
//    contains allocation_priority at all, so the old door is closed rather than merely unused.
//
// 2a. EVERY SAVE IS A COMPARE-AND-SET. The payload states what the page believes is stored — SET with a
//    number, or MISSING — and the handler refuses if the sheet disagrees. Two operators holding stale pages
//    can no longer silently overwrite each other: the second one is told to Refresh. MISSING and 0 are
//    different expectations and are never folded together.
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
  var _busy = false;       // a write is in flight — one click, one save
  // S8-B3-R3-CP2D — EVERY read is now ASYNC, so three things that used to be impossible are now possible:
  // a second read finishing after a first, a response arriving after the operator left the page, and a
  // click landing while a read is still in flight. Each gets its own guard rather than one shared flag.
  var _readGen = 0;        // bumped per read; a response from an older generation is DROPPED, never rendered
  var _reading = false;    // a read is in flight — Refresh does not stack
  var _mounted = false;    // false after unmount; no late response may touch status or DOM
  var _saveGen = 0;        // same idea for writes: a superseded save never writes the banner
  var _mountGen = 0;       // bumped by unmount; a mount continuation from an older navigation bails out

  function setStatus(kind, text) {
    var el = $('sp-status');
    if (!el) return;
    if (!kind) { el.hidden = true; el.textContent = ''; el.className = 'sp-status'; return; }
    el.hidden = false;
    el.className = 'sp-status sp-status--' + kind;
    el.textContent = text;
  }

  // ---- data ---------------------------------------------------------------------------------------------
  // THE READ OWNER IS `KM.DB.getMarketplaceReference()`, NOT the `_opDbCache` slice.
  //
  // WHY THIS CHANGED (S8-B3-R3-CP2D). The page used to read `KM.DB.getMarketplaces()`, which returns
  // `window._opDbCache.marketplaces` — a cache slice that is documented as "NOT canonical startup state …
  // only an on-demand bounded scratch". Three consequences, all of them observed:
  //   1. On a cold boot with no primed cache the page read ZERO rows and told the operator to press Refresh.
  //   2. Refresh called `db.refreshOperationDb()`, WHICH DOES NOT EXIST in the shipped API — the guard made
  //      it a silent no-op, so the empty state could not be cleared from the UI at all.
  //   3. The post-save read-after-write compared against that same unchanged slice. When scoped posture is
  //      active `_kmWriterPostWrite_` deliberately does NOT reload it, so a SUCCESSFUL save reported
  //      "the stored value does not match" — and re-saving the value the cache already held reported
  //      SUCCESS while proving nothing.
  //
  // `getMarketplaceReference()` fixes all three WITHOUT a new API: it loads through the existing getTable
  // path with the IDENTICAL normalizer and `marketplaceId || marketplace` filter (so the row universe is
  // byte-identical to the old getter), it is shared per session by `KM.referenceCache`, it is already
  // invalidated by `upsertMarketplace` — the only writer of this master — and a FAILED load is never cached,
  // so the next attempt genuinely retries instead of serving a stale answer.
  function hasReferenceReader() {
    var db = window.KM && window.KM.DB;
    return !!(db && typeof db.getMarketplaceReference === 'function');
  }

  // Resolves to an array, or REJECTS. An empty table and an unreadable table are different answers and this
  // function refuses to collapse them — that collapse is what made the cold-boot state unrecoverable.
  function loadRows() {
    if (!hasReferenceReader()) {
      return Promise.reject(new Error('The marketplace reference reader is unavailable.'));
    }
    return Promise.resolve(window.KM.DB.getMarketplaceReference()).then(function (raw) {
      if (!raw || typeof raw.length !== 'number') {
        throw new Error('The marketplace reference returned no usable rows.');
      }
      return Array.prototype.slice.call(raw).filter(function (r) { return str(r.marketplace) !== ''; });
    });
  }

  // A manual Refresh must REALLY re-read. The only supported way to make the shared reference cache refetch
  // is its own `invalidate(key)` — ONE key, this page's own resource, never `clear()` and never another
  // consumer's key. After a Save we do NOT call this: `upsertMarketplace` has already invalidated the same
  // key, and invalidating twice would hide a regression in that writer behind this page's own call.
  function invalidateMarketplaceReference() {
    var rc = window.KM && window.KM.referenceCache;
    if (rc && typeof rc.invalidate === 'function') { rc.invalidate('marketplaces'); return true; }
    return false;
  }

  function refresh(opts) {
    opts = opts || {};
    // CONSERVATIVE MUTUAL EXCLUSION. A Refresh that overlaps a Save is the race K1/K2 pin: the Refresh
    // captured the OLD rows, the Save then verified the NEW one, and whichever answer lands LAST wins the
    // screen. Rather than reconcile two truths, the page admits only one read at a time and lets the Save -
    // which is the operator's own action and ends in a verified read anyway - finish first.
    if (_busy && !opts.internal) return Promise.resolve(-1);      // never read across a write
    if (_reading && !opts.internal) return Promise.resolve(-1);   // Refresh does not stack
    if (opts.force) invalidateMarketplaceReference();
    var gen = ++_readGen;
    _reading = true;
    // A read that is superseded, or that lands after the operator left, must change nothing.
    var live = function () { return _mounted && gen === _readGen; };
    if (live()) setStatus('loading', 'Loading marketplace sites…');
    return loadRows().then(function (rows) {
      if (!live()) return -1;
      _rows = rows;
      if (!_rows.length) {
        // READ SUCCEEDED and the table is genuinely empty. Distinct from a failure, and worded so.
        setStatus('error', 'The marketplace reference was read successfully but contains no sites.');
      } else {
        setStatus(null);
      }
      renderFilters();
      render();
      return _rows.length;
    }).catch(function (err) {
      if (!live()) return -1;
      // READ FAILED. The previously loaded rows are LEFT ALONE: replacing real data with an empty grid on a
      // transient failure is how a page reports "no sites" for a problem that has nothing to do with sites.
      setStatus('error', 'Could not read the marketplace reference. Nothing was changed. '
        + (err && err.message ? err.message : String(err)) + ' Use Refresh to try again.');
      renderFilters();
      render();
      return -1;
    }).then(function (n) {
      if (gen === _readGen) _reading = false;
      return n;
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
    if (!db || typeof db.setMarketplaceAllocationPriority !== 'function') {
      // NO FALLBACK TO upsertMarketplace. A frontend that cannot reach the bounded writer must refuse, because
      // the writer it would fall back to is the unguarded one this round exists to stop using.
      setStatus('error', 'The bounded priority writer is unavailable in this build. Nothing was saved, and this '
        + 'page will not fall back to the general marketplace writer.');
      return Promise.resolve(false);
    }

    // THE TARGET MUST BE IDENTIFIABLE BEFORE ANYTHING IS SENT. A row with no marketplace_id cannot be the
    // subject of an identity-guarded write, and guessing is exactly what the guard exists to prevent.
    var expectedId = str(row.marketplaceId);
    if (!expectedId) {
      setStatus('error', 'This marketplace row has no identifier in the reference data, so a priority cannot be '
        + 'saved against it safely. Nothing was sent. Add a marketplace_id to the row first.');
      return Promise.resolve(false);
    }

    // THE COMPARE-AND-SET. `before` is what THIS page last read, and it is what the handler will require the
    // sheet to still hold. MISSING is sent as a state and never as a number: a blank cell is not a zero, and
    // encoding it as one is the §45.A failure every layer below this has already been repaired for.
    var before = classify(row.allocationPriority);
    var payload = {
      company: str(row.company),
      country: str(row.country),                        // RAW, never canonical — this is the match key
      marketplace: str(row.marketplace),
      expected_marketplace_id: expectedId,
      allocation_priority: v.value,
      expected_allocation_priority_state: (before.state === 'SET') ? 'SET' : 'MISSING',
      updated_by: 'site-priority-page'
    };
    if (before.state === 'SET') payload.expected_allocation_priority = before.value;
    // An INVALID stored value is deliberately sent as MISSING=false rather than SET: the handler will refuse
    // with PRIORITY_CHANGED, which is the correct answer. An unreadable cell is not an empty one, and this page
    // must not be able to overwrite the evidence of a bad row without someone seeing it first.

    _busy = true;
    // RETIRE EVERY READ ALREADY IN FLIGHT. A Refresh issued before this click is carrying a pre-write
    // snapshot; bumping the read generation makes its late answer a no-op instead of a silent revert of the
    // value this save is about to verify.
    _readGen++;
    _reading = false;
    var label = str(row.company) + ' / ' + str(row.country) + ' / ' + str(row.marketplace);
    var myGen = ++_saveGen;
    var liveSave = function () { return _mounted && myGen === _saveGen; };
    function msgOf(e) { return (e && e.message) ? String(e.message) : String(e); }
    function done(kind, text, ret) {
      if (!liveSave()) return ret;
      _editingKey = null;
      render();
      setStatus(kind, text);
      return ret;
    }
    setStatus('loading', 'Saving ' + label + '…');

    // ---- READ-BACK: IDENTITY-SAFE, NOT VALUE-SHAPED --------------------------------------------------------
    // A read-back that asks only "does some row now show 90?" proves almost nothing: it would be satisfied by a
    // different marketplace, by a duplicate row, or by a value somebody else wrote. So it checks FOUR things,
    // and all four have to hold before the word "verified" is used anywhere:
    //
    //   1. CANONICAL UNIQUENESS — exactly one row answers to this identity under canonical country. A second
    //      one appearing between the save and the read is a collision, not a success.
    //   2. RAW IDENTITY — that row's company / country / marketplace are the ones the save was sent for,
    //      compared the way the sheet compares them.
    //   3. marketplace_id — it is the SAME ROW, not a row that merely looks the same.
    //   4. VALUE — the stored priority is numerically what was requested.
    //
    // The read goes through the reference owner. After a CONFIRMED write the wrapper has already invalidated
    // the 'marketplaces' key, so the load refetches and this page does NOT invalidate again — doing so would
    // mask a regression in that wrapper behind this page's own call. After an UNKNOWN outcome nothing
    // invalidated anything, so a read could be answered from the memo and would "prove" the value was not
    // stored without ever asking the server. That case forces the refetch itself. Still ONE key, still the
    // existing mechanism.
    function readBack(forceFresh) {
      if (forceFresh) invalidateMarketplaceReference();
      return loadRows().then(function (rows) {
        if (!liveSave()) return { state: 'STALE' };
        _rows = rows;
        renderFilters();
        var canon = [];
        for (var i = 0; i < rows.length; i++) if (identityOf(rows[i]) === key) canon.push(rows[i]);
        if (canon.length === 0) return { state: 'READ_OK', verdict: 'ABSENT' };
        if (canon.length > 1) return { state: 'READ_OK', verdict: 'COLLISION', n: canon.length };
        var after = canon[0];
        if (str(after.company) !== str(row.company)
            || str(after.country) !== str(row.country)
            || str(after.marketplace) !== str(row.marketplace)) {
          return { state: 'READ_OK', verdict: 'IDENTITY_CHANGED' };
        }
        if (str(after.marketplaceId) !== expectedId) {
          return { state: 'READ_OK', verdict: 'ROW_CHANGED', storedId: str(after.marketplaceId) };
        }
        var c = classify(after.allocationPriority);
        if (c.state === 'SET' && Number(c.value) === Number(v.value)) {
          return { state: 'READ_OK', verdict: 'MATCH' };
        }
        return { state: 'READ_OK', verdict: 'VALUE_MISMATCH', c: c };
      }).catch(function (e) { return { state: 'READ_FAILED', err: e }; });
    }

    // The sentence a failed read-back is allowed to end with. It never suggests saving again.
    var ADVICE = ' Do NOT re-save — press Refresh, then check the marketplaces sheet. Nothing was re-sent.';

    function describe(rb) {
      if (rb.verdict === 'ABSENT') return label + ' is no longer present in the marketplace reference.';
      if (rb.verdict === 'COLLISION') return label + ' now matches ' + rb.n + ' rows under canonical country '
        + 'identity, so no single row can be confirmed.';
      if (rb.verdict === 'IDENTITY_CHANGED') return 'the row answering to ' + label + ' no longer carries the '
        + 'same company / country / marketplace values.';
      if (rb.verdict === 'ROW_CHANGED') return 'the row answering to ' + label + ' is a DIFFERENT record than '
        + 'the one this save was prepared against.';
      return 'a fresh read shows ' + (rb.c && rb.c.state === 'SET' ? rb.c.value : String(rb.c && rb.c.state).toLowerCase())
        + ' rather than ' + v.value + '.';
    }

    // ---- THE FOUR OUTCOMES ---------------------------------------------------------------------------------
    // The wrapper returns a typed outcome and never throws, so there is no path on which a lost answer and a
    // refusal arrive wearing the same shape. The two sentences this code may never say remain:
    //   (a) "nothing was written" about anything the server did not PROVE was a zero-write;
    //   (b) "verified" without a successful fresh read that passed all four identity checks.
    return Promise.resolve().then(function () {
      return db.setMarketplaceAllocationPriority(payload);
    }).then(function (w) { return w || { outcome: 'OUTCOME_UNKNOWN', code: 'NO_RESULT', message: '' }; },
            function (err) {
              // The wrapper is documented never to reject. If it somehow does, the request may already have been
              // dispatched, so the only honest classification is UNKNOWN.
              return { outcome: 'OUTCOME_UNKNOWN', code: 'WRAPPER_THREW', message: msgOf(err) };
            })
    .then(function (w) {
      if (!liveSave()) return false;
      var why = w.message ? String(w.message) : '';

      // NOT STARTED — the request was never dispatched. This is the ONE failure class on which the page may
      // state flatly that nothing was written, because nothing left the browser.
      if (w.outcome === 'CONFIRMED_NOT_STARTED') {
        return done('error', 'NOT SENT — nothing was written. ' + why
          + (w.code === 'DEPLOYMENT_CONTRACT_MISMATCH'
            ? ' This is a deployment problem, not a data problem: retrying cannot publish a deployment.' : ''), false);
      }
      // REJECTED — the server answered no AND proved it wrote nothing.
      if (w.outcome === 'CONFIRMED_REJECTED') {
        return done('error', 'REFUSED — the server rejected this save and confirmed nothing was written. '
          + why + ' Refresh to see the current value before trying again.', false);
      }

      var unknown = (w.outcome !== 'CONFIRMED_COMMITTED');
      return readBack(unknown).then(function (rb) {
        if (!liveSave() || rb.state === 'STALE') return false;

        if (rb.state === 'READ_FAILED') {
          if (!unknown) {
            return done('error', 'The write was CONFIRMED but the read-back FAILED, so persistence is not '
              + 'verified.' + ADVICE + ' ' + msgOf(rb.err), false);
          }
          return done('error', 'The write outcome is UNKNOWN (' + why + ') and the read-back also failed, so it '
            + 'is not known whether the value was stored.' + ADVICE + ' ' + msgOf(rb.err), false);
        }

        if (rb.verdict === 'MATCH') {
          if (!unknown) {
            return done('success', 'Saved and VERIFIED by re-reading the reference. ' + label
              + ' now has priority ' + v.value + '.', true);
          }
          // A MATCH AFTER AN UNKNOWN OUTCOME IS NOT A CONFIRMED SAVE, AND IS NOT LABELLED AS ONE.
          // The answer was lost, so this read cannot attribute the stored value to THIS request rather than to
          // a concurrent one, and it cannot say whether updated_by / updated_at completed — the handler writes
          // the priority first precisely so this case is recoverable rather than invisible.
          return done('warn', 'The write outcome was UNKNOWN (' + why + '). A fresh read now shows ' + label
            + ' at priority ' + v.value + ', which is the intended value — but this does NOT prove this request '
            + 'is what stored it, and the audit fields may be incomplete. Nothing was re-sent. Treat the value '
            + 'as correct and the save as unconfirmed.', true);
        }

        var prefix = unknown
          ? 'The write outcome is UNKNOWN (' + why + ') and the read-back does not confirm it — it may still be '
            + 'applied. Specifically, '
          : 'NOT VERIFIED — ';
        return done('error', prefix + describe(rb) + ADVICE, false);
      });
    }).then(function (r) {
      if (myGen === _saveGen) _busy = false;
      return r;
    });
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

  // `mount(epoch)` receives the navigation epoch from KM.lifecycle, which passes it into mount()/unmount()
  // exactly so an async mount can discard a late `.then`. We check BOTH authorities: the shell's own
  // commitGuard when it is available, and a local mount generation that unmount bumps — the local one is what
  // holds in any environment where the guard is absent, and neither invents a method the shell does not have.
  function mount(epoch) {
    var myMountGen = _mountGen;
    return ensureMarkup().then(function (ok) {
      if (!ok) return false;
      var lc = window.KM && window.KM.lifecycle;
      var superseded = (myMountGen !== _mountGen)
        || (epoch !== undefined && lc && typeof lc.commitGuard === 'function'
            && !lc.commitGuard(epoch, SECTION_ID));
      // The operator navigated away while the markup was loading. Do not re-mark this page mounted, do not
      // start a read, do not touch the DOM — the section on screen now belongs to someone else.
      if (superseded) return false;
      var sec = $(SECTION_ID);
      if (sec) sec.classList.add('active');
      bind();
      _mounted = true;
      return refresh();            // READ-ONLY on mount. This page never writes without a click.
    });
  }

  if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register(SECTION_ID, {
      mount: mount,
      // Edit state is discarded on leave rather than kept: a half-typed priority restored on return is a value
      // nobody can tell apart from a saved one. The delegated listeners stay — they are bound once, to a node
      // that persists, and rebinding is what would duplicate them.
      // Leaving the page also RETIRES every in-flight response: `_mounted` false makes each completion a
      // no-op, and bumping both generations means a read or a save that settles later cannot write a banner
      // onto whatever page the operator is looking at now.
      unmount: function () {
        _mounted = false; _editingKey = null; _busy = false; _reading = false;
        _readGen++; _saveGen++; _mountGen++;
      }
    });
  }

  // Exposed for tests and for the inline handler bridge the shell uses elsewhere.
  window.initSitePriorityPage = mount;
  window.KM = window.KM || {};
  window.KM.sitePriority = {
    classify: classify, validateInput: validateInput, identityOf: identityOf, canonCountry: canonCountry,
    _state: function () {
      return { rows: _rows.slice(), editingKey: _editingKey, busy: _busy,
        reading: _reading, mounted: _mounted, readGen: _readGen, saveGen: _saveGen };
    }
  };

})();
