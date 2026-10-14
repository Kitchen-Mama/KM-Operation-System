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
// 4. S8-B3-R3-CP2M-R4 — DRAG REORDERS BY COMPUTING A WEIGHT, AND THE WEIGHT IS THE ONLY THING STORED.
//    There is no rank column, no sequence and no renumbering. A drag works out ONE number that sits strictly
//    where the row was dropped, and saves it through the same single-row compare-and-set the editor uses.
//    Its neighbours are not touched, which is why one drag can never be a partial failure across rows.
//
//    A DROP IS A PROPOSAL, NOT A SAVE. The drop produces a draft and a preview; Save dispatches it; Cancel
//    writes nothing. Before dispatching, the page RE-READS the target and both neighbours — really re-reads,
//    invalidating the shared reference key first, because a check answered from the snapshot the preview was
//    computed from checks nothing. After it settles, the row shows the READ-BACK weight and the READ-BACK
//    position, never the previewed one. The one-round-trip race that survives this is §4.A's, and it is
//    accepted rather than hidden: the save protocol is in `preflightMove`, where its exact limit is restated.
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

  /* S8-B3-R3-CP2O - HOW A WEIGHT IS SHOWN. DISPLAY ONLY.
     ----------------------------------------------------------------------------------------------------
     `String(n)` put `0.30000000000000004` and `0.04400000000000001` in a table cell, because the drag rule
     is arithmetic on IEEE doubles and midpoints land on float tails. Rounding everything to two decimals
     would fix the width and introduce something far worse: two DIFFERENT stored weights printing the same
     string. A fake tie on this page is not cosmetic - the order IS the meaning, and two rows that read
     identically while ranking differently is the one thing the table must never show.

     THE RULE: print the two-decimal form ONLY when it IS the value. Otherwise print the shortest string
     that reads back as exactly this number, which is what `String(n)` already gives - including scientific
     notation for the extremes, which is kept rather than expanded.

     SO EVERY WEIGHT PRINTS EXACTLY, AND THAT IS WHAT MAKES A FAKE TIE IMPOSSIBLE RATHER THAN UNLIKELY:
     both branches return a string `s` with `Number(s) === n`, so two different numbers cannot produce the
     same string - if they did, `Number(s)` would have to equal both. Injective by construction, for
     adjacent rows and for any other pair, with no need to look at the neighbours.

     AND NOTHING HERE IS EVER APPROXIMATE, so nothing has to be LABELLED approximate. The round asked that
     an approximate display must not be misrepresented as the exact stored value; this meets that by not
     producing one. The exact value is additionally carried in the cell's `title` so it can be read
     without entering Edit.

     WHAT THIS IS NOT FOR: the payload, the compare-and-set, the ordering comparator and the midpoint
     arithmetic all take the NUMBER. Formatted text never reaches any of them - `commitPriority` is handed
     `v.value`, the CAS carries `before.value`, `weightOf` returns `c.value`, and this function is called
     nowhere near them. */
  function formatWeight(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    var full = String(n);
    var short = n.toFixed(2);
    if (short.indexOf('.') !== -1) short = short.replace(/0+$/, '').replace(/\.$/, '');
    // `Number(short) === n` is the whole test: it asks whether the shortened form IS the value, not whether
    // it looks close to it.
    if (Number(short) === n) return short.length <= full.length ? short : full;
    return full;
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

  // ---- S8-B3-R3-CP2M-R4 — THE DRAG RULE, AS ARITHMETIC AND NOTHING ELSE ----------------------------------
  //
  // This block decides ONE number. It touches no DOM, no network and no row but the dragged one. It is kept
  // separate so the rule can be tested as arithmetic, because every refusal below is a numeric fact rather
  // than a policy: the question is always "is there a representable non-negative weight that STRICTLY
  // satisfies the position just dropped into", and when there is not, the drag is refused.
  //
  // THE APPROVED RULES (S8-B3-R3-CP2M-R4). Four replace what Rev 3 listed as unapproved, and one WITHDRAWS
  // an entry Rev 3 listed as decided WITHOUT EVER HAVING BEEN APPROVED — called out here rather than quietly
  // applied, and corrected in CP2M-R4-R1 from the "reversal" this comment used to claim:
  //
  //   top          hi x 1.1          pure. No `+1`, no minimum increment (Rev 3 D3).
  //   bottom       lo x 0.9          pure. REPLACES Rev 3's `lo - max(1, lo x 0.1)`, which still carried the
  //                                  `max(1, ...)` term D3 had removed from the top. Both ends now agree.
  //   middle       lo + (hi-lo)/2    the midpoint of the two NEW neighbours. One drag moves one row.
  //   hi = 0       REFUSED           Rev 3 named a constant `TOP_FROM_ZERO = 1.0` for this case and listed
  //                                  it as DECIDED. IT WAS NEVER APPROVED — the proposal claimed an approval
  //                                  it did not have. A weight that cannot be derived from a comparison must
  //                                  be set EXPLICITLY. The constant is gone, not defaulted.
  //   lo = 0       REFUSED           there is no non-negative weight below zero.
  //   precision    none imposed      no 2dp rounding and no 0.01 minimum gap — Rev 3's U3 is NOT adopted.
  //                                  The computed double is the value stored.
  //
  // AND DROPPING THE ROUNDING IS WHAT DISSOLVED REV 3's U4, rather than resolving it. T29 — `hi x 1.1`
  // collapsing back onto `hi` for `hi <= 0.04` — existed ONLY because the value was rounded to 2dp before the
  // bracket check: `0.04 x 1.1 = 0.044` rounded back to `0.04`. Unrounded, `0.04 x 1.1` is
  // `0.044000000000000004`, strictly above `0.04`, so the case simply accepts. None of U4's three candidate
  // fixes was chosen; the rule that created the problem was not adopted.
  //
  // THE STRICT RE-CHECK IS NOT CEREMONY, AND IT GUARDS THE TOP AS WELL AS THE BOTTOM. It is tempting to
  // assume multiplying a positive number by 1.1 increases it. IT DOES NOT: at the bottom of the double range
  // `Number.MIN_VALUE * 1.1 === Number.MIN_VALUE`, because the exact product has nowhere to round except back
  // onto the operand. So every computed value — top, bottom and middle alike — is re-checked against the
  // neighbours it was derived from, and the arithmetic is never trusted to have moved.
  var TOP_FACTOR = 1.1;
  var BOTTOM_FACTOR = 0.9;

  // THE OVERFLOW-SAFE MIDPOINT, AND WHY THE OBVIOUS ONE IS WRONG. `(lo + hi) / 2` overflows to Infinity
  // whenever `lo + hi` exceeds Number.MAX_VALUE — which two large legal weights reach while each is still
  // perfectly finite, so the SUM is unrepresentable even though the ANSWER is not. `lo + (hi - lo) / 2` never
  // forms a quantity larger than `hi`, so it cannot overflow for any non-negative pair. Algebraically the
  // same midpoint, numerically survivable, which is the only reason to prefer it.
  function midpoint(lo, hi) { return lo + (hi - lo) / 2; }

  // A weight this page is willing to store: finite and non-negative. `0` is included — it is the lowest VALID
  // weight under §45.A and D4 opened the whole 0..1 range — and a negative one is not, because §45.A has no
  // state for it.
  function isStorableWeight(n) { return typeof n === 'number' && isFinite(n) && n >= 0; }

  // THE RULE. `upper` is the weight of the row that would sit directly ABOVE the drop slot, `lower` the one
  // directly BELOW it; either is null when the slot is at an end of the list. The list reads high-to-low, so
  // `upper >= lower` whenever both exist.
  //
  // Returns { ok: true, value, basis } or { ok: false, code, reason } — never a bare number, so a caller
  // cannot accidentally spend a refusal as a weight.
  function proposeWeight(upper, lower) {
    var hasUpper = (upper !== null && upper !== undefined);
    var hasLower = (lower !== null && lower !== undefined);

    // NO COMPARISON BASIS AT ALL: the ordered list is empty, so there is no weight to be above or below and
    // nothing to derive one from. Owner's rule is to require an explicit value rather than invent one.
    if (!hasUpper && !hasLower) {
      return { ok: false, code: 'NO_BASIS', reason: 'No other site in this company has a priority, so there '
        + 'is no weight to position this one against. Set a priority explicitly with Edit, then drag to '
        + 'reorder. Nothing is filled in automatically.' };
    }
    if ((hasUpper && !isStorableWeight(upper)) || (hasLower && !isStorableWeight(lower))) {
      return { ok: false, code: 'NEIGHBOUR_UNUSABLE', reason: 'A neighbouring site does not hold a usable '
        + 'weight, so no position can be computed against it.' };
    }

    var value, basis;
    if (!hasUpper) {
      // TOP OF THE LIST. The basis is the current leader, which is the row below the slot.
      if (lower === 0) {
        return { ok: false, code: 'TOP_FROM_ZERO', reason: 'The highest site in this company is at 0, and '
          + 'multiplying 0 cannot produce a weight above it. Set this site a priority explicitly with Edit — '
          + 'it will not be filled in automatically.' };
      }
      value = lower * TOP_FACTOR;
      basis = 'TOP';
    } else if (!hasLower) {
      // BOTTOM OF THE LIST. The basis is the current last place, which is the row above the slot.
      if (upper === 0) {
        return { ok: false, code: 'BOTTOM_AT_ZERO', reason: 'The lowest site in this company is already at 0, '
          + 'which is the lowest weight there is. Nothing can be placed below it.' };
      }
      value = upper * BOTTOM_FACTOR;
      basis = 'BOTTOM';
    } else {
      if (upper === lower) {
        return { ok: false, code: 'EQUAL_NEIGHBOURS', reason: 'The two sites here hold the SAME weight ('
          + upper + '), so no weight lies strictly between them. Change one of their weights first.' };
      }
      value = midpoint(lower, upper);
      basis = 'MIDDLE';
    }

    // (Note on wording: a weight of 0 does NOT switch a site off. It is the lowest VALID weight — the site
    //  still participates, still receives a share, and in a shortage receives the SAME multiplier as a site
    //  at 1, because Math.max(priority, 1) clamps both to 1. What 0 does is rank last among its company.)
    // THE RESULT IS RE-DERIVED FROM THE NEIGHBOURS, NOT FROM THE FORMULA'S INTENT. Three distinct ways the
    // arithmetic can fail to deliver what the formula promised, and each one ends the drag:
    //   NOT_FINITE        `hi x 1.1` overflowed, with `hi` near Number.MAX_VALUE
    //   NEGATIVE          never produced by these factors; checked rather than assumed
    //   INDISTINGUISHABLE the value rounded onto a neighbour, so the saved row would not hold the position
    if (!isFinite(value)) {
      return { ok: false, code: 'NOT_FINITE', reason: 'The weight needed here is larger than this system can '
        + 'hold as a number. Lower the weights at the top of this company first.' };
    }
    if (value < 0) {
      return { ok: false, code: 'NEGATIVE', reason: 'That position would need a negative weight, which is not '
        + 'a priority. 0 is the lowest a weight goes, and it still takes a share.' };
    }
    if ((hasUpper && !(value < upper)) || (hasLower && !(value > lower))) {
      return { ok: false, code: 'INDISTINGUISHABLE', reason: 'The weights on either side are so close '
        + 'together that no number fits strictly between them. Change one of the neighbouring weights first.' };
    }
    return { ok: true, value: value, basis: basis };
  }

  // ---- ORDER ---------------------------------------------------------------------------------------------
  // WITHIN A COMPANY, HIGH TO LOW, AND TIES BROKEN BY IDENTITY RATHER THAN BY ARRIVAL ORDER.
  //
  // `Array.prototype.sort` is only guaranteed stable from ES2019, and "stable" would anchor equal weights to
  // whatever order the reference read happened to return — which is the sheet's row order, and which moves
  // when someone inserts a row anywhere above. Two sites at 80 would then swap on screen for a reason that
  // has nothing to do with either of them. Canonical identity is a TOTAL order that does not move, so the
  // comparator never returns 0 for two different rows and the display order is reproducible.
  //
  // Note what this order is NOT: §1.C of the proposal records that equal priority falls through to
  // `demandWeight`, then marketplace, then receiverKey INSIDE the allocator. The screen's tiebreak is a
  // display decision and is not the allocator's; the page must never imply otherwise.
  function identityOrder(a, b) {
    return str(a.company).localeCompare(str(b.company))
      || canonCountry(a.country).localeCompare(canonCountry(b.country))
      || str(a.marketplace).localeCompare(str(b.marketplace));
  }

  // MISSING and INVALID have NO position: they are not comparable against a weight, so they cannot be ranked
  // among rows that are. They sort after the ordered block of their own company and are drawn under their own
  // sub-heading, which is also what makes "drag one in" an explicit first set rather than a nudge.
  function isOrdered(r) { return classify(r.allocationPriority).state === 'SET'; }
  function weightOf(r) { var c = classify(r.allocationPriority); return c.state === 'SET' ? c.value : null; }

  function displayOrder(a, b) {
    var byCompany = str(a.company).localeCompare(str(b.company));
    if (byCompany) return byCompany;
    var oa = isOrdered(a) ? 0 : 1, ob = isOrdered(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    if (oa === 0) {
      var wa = weightOf(a), wb = weightOf(b);
      if (wa !== wb) return wb - wa;            // DESC: higher weight first
    }
    return identityOrder(a, b);
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
    // The accepted filter scope, remembered so a change made while a move is pending can be PUT BACK rather
    // than merely refused — a select left showing a scope the table is not using is its own small lie.
    syncFilterState();
  }

  function visibleRows() {
    var co = $('sp-filter-company') ? $('sp-filter-company').value : '';
    var ct = $('sp-filter-country') ? $('sp-filter-country').value : '';
    return _rows.filter(function (r) {
      if (co && str(r.company) !== co) return false;
      if (ct && canonCountry(r.country) !== ct) return false;
      return true;
    }).sort(displayOrder);
  }

  // S8-B3-R3-CP2M — COMPANIES ARE SEPARATED BECAUSE THE ALLOCATOR SEPARATES THEM.
  //
  // This is not a layout preference. supply-planning-marketplace-supply-allocation.js enforces
  // "every receiver + pool in one call MUST share the company (cross-company -> BLOCKED)", so a
  // priority is only ever compared against OTHER SITES OF THE SAME COMPANY. A flat list invited the
  // operator to read two numbers side by side that never meet, and to conclude one outranks the other.
  //
  // The group header is a row of the SAME table rather than a second table: one <thead> keeps the
  // column meanings in one place, and screen readers keep a single column context. visibleRows()
  // already sorts by company first, so a change of company IS the group boundary.
  //
  // S8-B3-R3-CP2M-R4 — AND THE BAND IS ALSO THE DRAG BOUNDARY. A row may only be dropped among rows of its
  // own company, so the band is not decoration: it is the edge of the only set this row can be compared with.
  // When a filter hides part of a company the band says so and the whole company becomes undraggable, because
  // a midpoint computed against a neighbour that is on screen but not adjacent is simply the wrong number.
  function groupHeaderHtml(company, count, hiddenNote) {
    return '<tr class="sp-group" data-sp-group="' + esc(company) + '">'
      + '<th scope="colgroup" colspan="7" class="sp-group__cell">'
      + '<span class="sp-group__name">' + esc(company || '(no company)') + '</span>'
      + '<span class="sp-group__count">' + count + (count === 1 ? ' site' : ' sites') + '</span>'
      + (hiddenNote ? '<span class="sp-group__locked">' + esc(hiddenNote) + '</span>' : '')
      + '</th></tr>';
  }

  // The rows §45.A gives no position to. They are drawn BELOW their company's ordered block, under their own
  // sub-heading, and never interleaved with it — a MISSING row has no weight to be above or below anything,
  // and an INVALID one has a stored value nobody can rank. Dragging a MISSING row out of here is the explicit
  // first set (§3.5); an INVALID row has no grip at all, because repairing it would mean guessing.
  function subHeaderHtml(company, count) {
    return '<tr class="sp-group sp-group--unset" data-sp-unset="' + esc(company) + '">'
      + '<th scope="colgroup" colspan="7" class="sp-group__cell">'
      + '<span class="sp-group__name">No priority set</span>'
      + '<span class="sp-group__count">' + count + (count === 1 ? ' site' : ' sites') + '</span>'
      + '<span class="sp-group__hint">No position in the order. Drag a Missing site into the list above to '
      + 'set its first priority.</span>'
      + '</th></tr>';
  }

  // WHICH COMPANIES MAY BE REORDERED AT ALL.
  //
  // A drag computes its weight from the rows ADJACENT to the drop slot. If a filter has removed a row of the
  // same company, the row that LOOKS adjacent on screen may not be — and the midpoint of the wrong pair is a
  // wrong answer that would still save successfully. So a company whose rows are not all visible is locked
  // for reordering, and says why rather than offering a grip that refuses on drop.
  //
  // The COMPANY filter cannot cause this: it removes whole companies and never splits one. The COUNTRY filter
  // can, and does, which is why this is measured per company instead of assumed from which select is set.
  function hiddenCompanyNotes(visible) {
    var total = {}, shown = {}, notes = {};
    _rows.forEach(function (r) { var c = str(r.company); total[c] = (total[c] || 0) + 1; });
    visible.forEach(function (r) { var c = str(r.company); shown[c] = (shown[c] || 0) + 1; });
    Object.keys(shown).forEach(function (c) {
      var missing = (total[c] || 0) - shown[c];
      if (missing > 0) {
        notes[c] = 'Reordering is off: ' + missing + ' site' + (missing === 1 ? '' : 's')
          + ' of this company ' + (missing === 1 ? 'is' : 'are') + ' hidden by the Country filter, so the '
          + 'sites shown next to each other may not be neighbours. Clear the filter to reorder.';
      }
    });
    return notes;
  }

  // ONE ROW. `opts.rank` is the 1-based position within its company's ordered block, or null for an unordered
  // row. `opts.preview` carries the weight a DRAFT would store — drawn instead of the stored one, and clearly
  // marked, because a preview that looks like a saved value is the whole failure this page is written against.
  function rowHtml(r, opts) {
    opts = opts || {};
    var key = identityOf(r);
    var c = classify(r.allocationPriority);
    var editing = (_editingKey === key);
    var preview = opts.preview || null;

    var priorityCell;
    if (editing) {
      priorityCell = '<input type="text" class="sp-input" data-sp-input="' + esc(key) + '" '
        + 'value="' + esc(c.state === 'SET' ? String(c.value) : '') + '" '
        + 'inputmode="decimal" aria-label="Allocation priority" />';
    } else if (preview) {
      // A REFUSED SLOT STILL DRAWS THE ROW WHERE IT WAS DROPPED, with no weight. Snapping it back would hide
      // which position was refused, and inventing a weight to fill the cell would be the one thing this
      // page must never do.
      priorityCell = '<span class="sp-pri sp-pri--preview' + (preview.value === null ? ' sp-pri--refused' : '')
        + '">' + (preview.value === null ? '&#8212;' : esc(formatWeight(preview.value))) + '</span>'
        + '<span class="sp-prev-was">' + (c.state === 'SET' ? 'was ' + esc(formatWeight(c.value)) : 'was Missing')
        + '</span>';
    } else {
      // `title` carries the raw stored value. The text is already exact, so the two agree except in
      // presentation - but it means the precise figure is readable without opening Edit.
      priorityCell = (c.state === 'SET'
        ? '<span class="sp-pri" title="' + esc(String(c.value)) + '">' + esc(formatWeight(c.value)) + '</span>'
        : '<span class="sp-pri sp-pri--none">—</span>');
    }

    // THREE DIFFERENT THINGS THAT ARE ALL "NOT THE STORED VALUE", and they are never merged: a draft awaiting
    // Save, a slot that has no legal weight, and a dispatched write whose outcome is unknown.
    var previewBadge = preview
      ? (preview.unconfirmed ? { k: 'unconfirmed', t: 'Unconfirmed' }
        : (preview.value === null ? { k: 'nopos', t: 'No position' } : { k: 'preview', t: 'Not saved' }))
      : null;
    var stateCell = previewBadge
      ? '<span class="sp-badge sp-badge--' + previewBadge.k + '">' + previewBadge.t + '</span>'
      : '<span class="sp-badge sp-badge--' + c.state.toLowerCase() + '">'
        + (c.state === 'SET' ? 'Set' : (c.state === 'MISSING' ? 'Missing' : 'Invalid')) + '</span>';

    var actions = editing
      ? '<button type="button" class="sp-btn sp-btn--primary" data-sp-save="' + esc(key) + '">Save</button>'
        + '<button type="button" class="sp-btn sp-btn--ghost" data-sp-cancel="1">Cancel</button>'
      : '<button type="button" class="sp-btn sp-btn--ghost" data-sp-edit="' + esc(key) + '">Edit</button>';

    // THE GRIP. It is a real <button>, so it is in the tab order, reachable by keyboard and announced as
    // something that can be operated — not a <div> with a mousedown handler. A row that cannot be dragged
    // gets a disabled grip carrying the REASON rather than no control at all, because an absent control is
    // indistinguishable from a page that forgot to draw one.
    var lifted = !!(_move && _move.key === key && _move.live);
    var gripCell;
    if (opts.draggable) {
      gripCell = '<button type="button" class="sp-grip" data-sp-grip="' + esc(key) + '"'
        + ' aria-pressed="' + (lifted ? 'true' : 'false') + '"'
        + ' aria-describedby="sp-drag-help"'
        + ' aria-label="Reorder ' + esc(str(r.marketplace)) + ' in ' + esc(str(r.company))
        + (opts.rank ? ', position ' + opts.rank + ' of ' + opts.of : ', no priority set')
        + '">&#8942;&#8942;</button>';
    } else {
      gripCell = '<span class="sp-grip sp-grip--off" aria-hidden="true" title="'
        + esc(opts.notDraggable || 'This row cannot be reordered.') + '">&#8942;&#8942;</span>';
    }
    var rankCell = opts.rank ? '<span class="sp-rank">' + opts.rank + '</span>' : '';

    var canon = canonCountry(r.country);
    var countryCell = esc(str(r.country))
      + (canon !== str(r.country).toUpperCase() || canon !== str(r.country)
          ? ' <span class="sp-canon" title="canonical identity">' + esc(canon) + '</span>' : '');

    var cls = [];
    if (editing) cls.push('sp-row--editing');
    if (preview) cls.push('sp-row--preview');
    if (lifted) cls.push('sp-row--lifted');

    return '<tr data-sp-row="' + esc(key) + '" data-sp-company="' + esc(str(r.company)) + '"'
      + (opts.rank ? ' data-sp-ordered="1"' : '')
      + (preview ? ' data-sp-preview="1"' : '')
      + ' class="' + cls.join(' ') + '">'
      + '<td data-label="Order" class="sp-col-grip">' + gripCell + rankCell + '</td>'
      + '<td data-label="Company" class="sp-cell-company">' + esc(str(r.company)) + '</td>'
      + '<td data-label="Country">' + countryCell + '</td>'
      + '<td data-label="Marketplace">' + esc(str(r.marketplace)) + '</td>'
      + '<td data-label="Allocation priority" class="sp-col-pri">' + priorityCell + '</td>'
      + '<td data-label="Status" class="sp-col-state">' + stateCell + '</td>'
      + '<td data-label="Edit" class="sp-col-act">' + actions + '</td>'
      + '</tr>';
  }

  function render() {
    var tbody = $('sp-rows');
    if (!tbody) return;
    var rows = visibleRows();
    var empty = $('sp-empty');
    if (empty) empty.hidden = rows.length > 0;

    var locked = hiddenCompanyNotes(rows);
    var companies = [], byCo = {};
    rows.forEach(function (r) {
      var c = str(r.company);
      if (!byCo[c]) { byCo[c] = []; companies.push(c); }
      byCo[c].push(r);
    });

    var html = '';
    companies.forEach(function (co) {
      var all = byCo[co];
      var view = previewFor(co, all.filter(isOrdered), all.filter(function (r) { return !isOrdered(r); }));
      html += groupHeaderHtml(co, all.length, locked[co] || '');
      view.ordered.forEach(function (e, i) {
        html += rowHtml(e.row, {
          rank: i + 1, of: view.ordered.length, preview: e.preview,
          // A SINGLE WEIGHTED SITE HAS NOWHERE TO GO. Lifting it would leave an empty list to be positioned
          // against, which is NO_BASIS -- so the handle would exist only to refuse. It is withheld instead,
          // because a refusal belongs BEFORE the gesture, not after it.
          draggable: !locked[co] && view.ordered.length > 1,
          notDraggable: locked[co] || 'This is the only site with a priority in this company, so there is '
            + 'nothing to reorder it against. Use Edit to change its weight.'
        });
      });
      if (view.unordered.length) {
        html += subHeaderHtml(co, view.unordered.length);
        view.unordered.forEach(function (e) {
          var st = classify(e.row.allocationPriority).state;
          html += rowHtml(e.row, {
            rank: null, preview: e.preview,
            // A MISSING row may be dragged in — that IS the explicit first set. An INVALID one may not:
            // its stored value is unreadable, and placing it would mean choosing what it should have been.
            draggable: !locked[co] && st === 'MISSING' && view.ordered.length > 0,
            notDraggable: locked[co] ? locked[co]
              : (st === 'INVALID'
                  // S8-B3-R3-CP2M-R4-R1 — AND IT NO LONGER SENDS THE OPERATOR TO EDIT, because Edit
                  // cannot succeed here either. Every save from this page states an expected PRIOR state,
                  // and the contract has only two: SET and MISSING. An unreadable cell is neither, so the
                  // page sends MISSING, the handler compares it against a cell it reads as INVALID, and
                  // refuses with PRIORITY_CHANGED — correctly, and every single time. The refusal is the
                  // right answer and the advice was the wrong one: the value has to be corrected where it
                  // is stored.
                  ? 'This site holds a value that cannot be read as a priority, so it has no position in '
                    + 'the order. It cannot be repaired from this page: every save here states the value '
                    + 'it expects to replace, and there is no way to say "I expect an unreadable one" — so '
                    + 'the server refuses, correctly, without writing anything. Correct the cell in the '
                    + 'marketplaces spreadsheet, then Refresh.'
                  : 'There are no sites with a priority in this company yet. Use Edit to set the first one.')
          });
        });
      }
    });
    tbody.innerHTML = html;
    renderDragBar();
    restoreGripFocus();
  }

  function rowByKey(key) {
    for (var i = 0; i < _rows.length; i++) if (identityOf(_rows[i]) === key) return _rows[i];
    return null;
  }

  // ---- S8-B3-R3-CP2M-R4 — THE MOVE: LIFT, PREVIEW, DRAFT, SAVE -------------------------------------------
  //
  // ONE state object describes every stage, because the alternative — a "dragging" flag, a "draft" object and
  // an "unconfirmed" flag that must agree with each other — is three sources of truth for one fact.
  //
  //   live  = true   the row is LIFTED and following the pointer or the arrow keys. Nothing is written.
  //   live  = false  the row has been DROPPED. A draft exists, the preview is on screen, and Save is offered.
  //                  STILL nothing is written: a drop is a proposal, and Cancel from here is a zero write.
  //   unconfirmed    a save has been dispatched and its outcome is NOT KNOWN. The row HOLDS the dragged
  //                  position, visibly unconfirmed, and Save is withdrawn — see §3.5 T25.
  //
  // `slot` is an index into the company's ordered list WITH THE MOVED ROW TAKEN OUT: 0 is above everything,
  // `length` is below everything. Keeping it in reduced coordinates is what makes "dropped back where it
  // started" a single comparison (`slot === origRank`) instead of an off-by-one argument.
  var _move = null;
  var _focusGrip = null;     // grip to re-focus after a re-render, so the keyboard does not lose the row
  var _filterState = { co: '', ct: '' };
  var _pointer = null;       // in-flight pointer gesture, before it becomes a lift

  // ---- S8-B3-R3-CP2M-R4-R1 — WHICH OPERATION IS THIS ANSWER FOR? -----------------------------------------
  //
  // CP2M-R4's save continuation asked ONE question when its preflight resolved: `if (!_mounted)`. That is a
  // question about the PAGE, and every race here is a question about the OPERATION:
  //
  //   * Cancel leaves the page mounted. The write went out anyway, after the operator cancelled it.
  //   * Leaving and coming back sets `_mounted` true again, so a preflight that spanned the round trip
  //     dispatched a write for an operation the operator had walked away from.
  //   * A newer draft is also "mounted", so the stale continuation cleared its `_busy`, dropped it with
  //     `_move = null`, and wrote its banner over it.
  //
  // THREE IDENTITIES ARE NEEDED AND NONE OF THEM IS A BOOLEAN: the operation (a save attempt), the draft it
  // belongs to, and the mount generation it started in. Each draft carries an id, each save carries the id of
  // the draft it is saving, and `_op` names the one operation currently allowed to act. Anything else that
  // resolves is a late answer with no claim on the page.
  var _moveSeq = 0;          // identity per draft
  var _opSeq = 0;            // identity per save attempt
  var _op = null;            // the operation permitted to proceed, or null

  // The whole gate, in one place, so "is this answer still wanted" has exactly one definition.
  function opIsLive(op) {
    return !!(op && _mounted && _op === op && _mountGen === op.mountGen
              && _move && _move.id === op.moveId);
  }

  function moveRow() { return _move ? rowByKey(_move.key) : null; }

  // The company's ordered rows, with the moved row removed — the list every proposal is computed against.
  function reducedOrdered(company, exceptKey) {
    return visibleRows().filter(function (r) {
      return str(r.company) === company && isOrdered(r) && identityOf(r) !== exceptKey;
    });
  }

  // THE PROPOSAL FOR THE CURRENT SLOT. Recomputed rather than stored, so it cannot describe a list that has
  // since been re-read: every render and every save asks again.
  function proposalFromList(reduced) {
    var slot = Math.max(0, Math.min(_move.slot, reduced.length));
    // DROPPED WHERE IT ALREADY IS. Not an error and not a refusal to argue with — simply nothing to save, and
    // the page says so rather than dispatching a write that would store the value already stored.
    if (_move.origRank >= 0 && slot === _move.origRank) {
      return { ok: false, code: 'NO_CHANGE', slot: slot,
        reason: 'This site is already in that position. Nothing has been changed and nothing will be saved.' };
    }
    var upper = slot > 0 ? weightOf(reduced[slot - 1]) : null;
    var lower = slot < reduced.length ? weightOf(reduced[slot]) : null;
    var p = proposeWeight(upper, lower);
    p.slot = slot;
    p.upper = upper;
    p.lower = lower;
    p.upperKey = slot > 0 ? identityOf(reduced[slot - 1]) : null;
    p.lowerKey = slot < reduced.length ? identityOf(reduced[slot]) : null;
    return p;
  }

  function currentProposal() {
    if (!_move) return null;
    return proposalFromList(reducedOrdered(_move.company, _move.key));
  }

  // Splice the moved row into the view at its slot. The ordered and unordered lists arrive separately because
  // a MISSING row being dragged in crosses between them — which is the first set, and is why the row leaves
  // the "No priority set" block the moment it is lifted rather than on save.
  function previewFor(company, ordered, unordered) {
    var o = ordered.map(function (r) { return { row: r, preview: null }; });
    var u = unordered.map(function (r) { return { row: r, preview: null }; });
    if (!_move || _move.company !== company) return { ordered: o, unordered: u };

    var moved = null, i;
    for (i = 0; i < o.length; i++) {
      if (identityOf(o[i].row) === _move.key) { moved = o.splice(i, 1)[0]; break; }
    }
    if (!moved) {
      for (i = 0; i < u.length; i++) {
        if (identityOf(u[i].row) === _move.key) { moved = u.splice(i, 1)[0]; break; }
      }
    }
    // The row is no longer in the view at all — a re-read dropped it, or a filter hid it. The move cannot be
    // drawn, so it is not drawn; renderDragBar() reports the same fact in words.
    if (!moved) return { ordered: o, unordered: u };

    var p = proposalFromList(o.map(function (e) { return e.row; }));
    moved.preview = {
      value: p.ok ? p.value : null,
      unconfirmed: !!_move.unconfirmed,
      code: p.ok ? null : p.code
    };
    o.splice(Math.max(0, Math.min(p.slot, o.length)), 0, moved);
    return { ordered: o, unordered: u };
  }

  // ---- the move bar --------------------------------------------------------------------------------------
  // Save is only ever offered for a proposal that is ok AND dropped AND not awaiting an unknown outcome. The
  // three conditions are written out rather than folded into one flag, because each withdraws Save for a
  // different reason and the operator is told which.
  function renderDragBar() {
    var bar = $('sp-draft');
    if (!bar) return;
    if (!_move) { bar.hidden = true; bar.innerHTML = ''; return; }
    var row = moveRow();
    var p = currentProposal();
    bar.hidden = false;

    if (!row) {
      bar.className = 'sp-draft sp-draft--error';
      bar.innerHTML = '<p class="sp-draft__msg">The site being moved is no longer in the loaded data, so this '
        + 'move cannot be completed. Nothing was saved.</p>'
        + '<button type="button" class="sp-btn sp-btn--ghost" data-sp-move-cancel="1">Dismiss</button>';
      return;
    }

    var label = esc(str(row.marketplace)) + ' <span class="sp-draft__co">' + esc(str(row.company)) + '</span>';
    if (_move.unconfirmed) {
      bar.className = 'sp-draft sp-draft--warn';
      bar.innerHTML = '<p class="sp-draft__msg"><strong>Unconfirmed.</strong> ' + label + ' is shown in the '
        + 'position it was dragged to, but the server did not confirm the write and a fresh read did not '
        + 'settle it. This is NOT a saved value. Nothing will be re-sent. Press Refresh to read the current '
        + 'state.</p>'
        + '<button type="button" class="sp-btn sp-btn--ghost" data-sp-move-cancel="1">Dismiss</button>';
      return;
    }
    // SENT: the request is out and cannot be recalled, so no Cancel is offered here at all.
    if (_move.phase === 'sent') {
      bar.className = 'sp-draft sp-draft--warn';
      bar.innerHTML = '<p class="sp-draft__msg"><strong>Sent.</strong> ' + label + ' has been dispatched to '
        + 'the server and <strong>cannot be cancelled</strong> \u2014 nothing here can call a request back. '
        + 'The result will be reported as saved, refused, or unconfirmed.</p>';
      return;
    }
    // CHECKING: nothing has been dispatched yet, so Cancel still genuinely prevents the write.
    if (_move.phase === 'checking') {
      bar.className = 'sp-draft sp-draft--live';
      bar.innerHTML = '<p class="sp-draft__msg">Checking the sites around ' + label + ' before saving. '
        + 'Nothing has been sent yet.</p>'
        + '<button type="button" class="sp-btn sp-btn--ghost" data-sp-move-cancel="1">Cancel</button>';
      return;
    }
    if (_move.live) {
      bar.className = 'sp-draft sp-draft--live';
      bar.innerHTML = '<p class="sp-draft__msg">Moving ' + label + '. '
        + (p.ok ? 'Drop here to propose <strong>' + esc(formatWeight(p.value)) + '</strong>.'
                : '<span class="sp-draft__no">' + esc(p.reason) + '</span>')
        + ' Use the arrow keys to move, Space or Enter to drop, Escape to cancel.</p>';
      return;
    }
    if (!p.ok) {
      bar.className = 'sp-draft sp-draft--error';
      bar.innerHTML = '<p class="sp-draft__msg"><strong>Not saved.</strong> ' + esc(p.reason) + '</p>'
        + '<button type="button" class="sp-btn sp-btn--ghost" data-sp-move-cancel="1">Cancel</button>';
      return;
    }
    bar.className = 'sp-draft sp-draft--ready';
    bar.innerHTML = '<p class="sp-draft__msg"><strong>Proposed, not saved.</strong> ' + label
      + ' would be stored as <strong>' + esc(formatWeight(p.value)) + '</strong>'
      // THE FACTOR IS READ FROM THE CONSTANT, NOT SPELLED AGAIN. A sentence that says "x 1.1" beside a rule
      // that no longer multiplies by 1.1 is worse than no sentence, and two copies of a number is how that
      // happens. There is one copy, and the explanation quotes it.
      + (p.basis === 'TOP' ? ' — above the current highest (' + esc(formatWeight(p.lower)) + ' x ' + TOP_FACTOR + ').'
        : p.basis === 'BOTTOM' ? ' — below the current lowest (' + esc(formatWeight(p.upper)) + ' x ' + BOTTOM_FACTOR + ').'
        : ' — between ' + esc(formatWeight(p.upper)) + ' and ' + esc(formatWeight(p.lower)) + '.')
      + ' No other site is changed.</p>'
      + '<button type="button" class="sp-btn sp-btn--primary" data-sp-move-save="1">Save this move</button>'
      + '<button type="button" class="sp-btn sp-btn--ghost" data-sp-move-cancel="1">Cancel</button>';
  }

  function restoreGripFocus() {
    if (!_focusGrip) return;
    var sel = '[data-sp-grip="' + (window.CSS && CSS.escape ? CSS.escape(_focusGrip) : _focusGrip) + '"]';
    var el = document.querySelector(sel);
    _focusGrip = null;
    if (el && typeof el.focus === 'function') { try { el.focus(); } catch (e) {} }
  }

  // ---- lift / move / drop / cancel -----------------------------------------------------------------------
  function beginLift(key, keyboard) {
    if (_busy || _move) return false;
    var row = rowByKey(key);
    if (!row) return false;
    var company = str(row.company);
    // AN INVALID ROW HAS NO POSITION, so it cannot be given one by moving it. Placing it would mean choosing
    // a weight for a cell whose stored value nobody can read -- which is the guess §3.5 forbids.
    if (classify(row.allocationPriority).state === 'INVALID') {
      setStatus('error', 'This site holds a value that cannot be read as a priority, so it has no position '
        + 'in the order. It cannot be repaired from this page either \u2014 every save states the value it '
        + 'expects to replace, and there is no way to express an unreadable one, so the server refuses '
        + 'without writing. Correct the cell in the marketplaces spreadsheet, then Refresh.');
      return false;
    }
    // A FILTERED COMPANY CANNOT BE REORDERED, for the reason hiddenCompanyNotes states: the rows that look
    // adjacent may not be, and a midpoint computed from the wrong pair saves perfectly happily.
    var locked = hiddenCompanyNotes(visibleRows());
    if (locked[company]) { setStatus('error', locked[company]); return false; }
    var ordered = reducedOrdered(company, key);
    // A row cannot be positioned against an empty list, and saying so at the LIFT is better than letting the
    // operator drag something that can only ever refuse.
    if (!ordered.length) {
      setStatus('error', 'No other site in this company has a priority, so there is nothing to position this '
        + 'one against. Use Edit to set a priority explicitly.');
      return false;
    }
    var origRank = -1;
    if (isOrdered(row)) {
      var full = visibleRows().filter(function (r) { return str(r.company) === company && isOrdered(r); });
      for (var i = 0; i < full.length; i++) if (identityOf(full[i]) === key) { origRank = i; break; }
    }
    // `phase` is what Cancel has to read. 'draft' and 'checking' are both cancellable and both genuinely
    // prevent a write; 'sent' is not, because the request has left the browser and nothing here can call it
    // back. Conflating them is how a page comes to claim it undid something it cannot undo.
    _move = { id: ++_moveSeq, key: key, company: company, slot: origRank >= 0 ? origRank : ordered.length,
              live: true, unconfirmed: false, origRank: origRank, phase: 'draft' };
    _editingKey = null;
    setStatus(null);
    if (keyboard) _focusGrip = key;
    render();
    return true;
  }

  function nudge(delta) {
    if (!_move || !_move.live) return;
    var max = reducedOrdered(_move.company, _move.key).length;
    var next = Math.max(0, Math.min(_move.slot + delta, max));
    if (next === _move.slot) return;
    _move.slot = next;
    _focusGrip = _move.key;
    render();
  }

  function setSlot(slot) {
    if (!_move || !_move.live || slot === _move.slot) return;
    _move.slot = slot;
    render();
  }

  // A DROP IS NOT A SAVE. It freezes the slot and offers Save; it writes nothing.
  function dropLift() {
    if (!_move || !_move.live) return;
    _move.live = false;
    _focusGrip = _move.key;
    render();
  }

  // CANCEL IS A ZERO WRITE, ALWAYS — from a live lift, from a dropped draft, and from an unconfirmed hold.
  // In the last case it dismisses a MARKER, which is the one thing it must not be confused with: dismissing
  // an unconfirmed hold does not undo anything, because nothing here knows whether there is anything to undo.
  function cancelMove() {
    if (!_move) return;
    // ONCE THE WRITER HAS BEEN DISPATCHED THERE IS NOTHING TO CANCEL, and saying otherwise would be the
    // worst sentence this page could print: the request is on its way, its outcome may be
    // OUTCOME_UNKNOWN, and "cancelled" would assert a zero write nobody can prove. The control is not
    // offered in this phase (renderDragBar), and reaching it another way still refuses.
    if (_move.phase === 'sent') {
      setStatus('warn', 'This save has already been sent to the server, so it cannot be cancelled. Nothing '
        + 'here can call a request back. Wait for the result \u2014 it will be reported as saved, refused, or '
        + 'unconfirmed, and nothing will be re-sent either way.');
      return;
    }
    var key = _move.key;
    // RETIRE THE OPERATION, not just the draft. A preflight may be in flight for it; dropping `_op` is what
    // makes that answer a no-op instead of a write.
    var wasChecking = (_move.phase === 'checking');
    _op = null;
    _move = null;
    if (wasChecking) _busy = false;     // the operation it belonged to is over
    _focusGrip = key;
    setStatus(null);
    render();
  }

  // ---- the save ------------------------------------------------------------------------------------------
  // THE PRE-SAVE RE-READ IS A REAL READ, AND THAT IS ENFORCED RATHER THAN INTENDED. `loadRows()` goes through
  // the shared reference cache, which would happily answer from the memo it filled when the page loaded — and
  // a "re-read" answered from the same snapshot the preview was computed from proves exactly nothing. So the
  // key is invalidated first. One key, this page's own resource, the existing mechanism.
  //
  // WHAT IT CHECKS, and why each one is separate:
  //   1. the target is still a single row, still the same record, still holding the value the CAS will claim
  //   2. each neighbour still exists, in the same company, at the weight the proposal was computed from
  //   3. the two neighbours are still ADJACENT — a row inserted between them changes the position even when
  //      both their weights are untouched, which no weight comparison would catch
  //   4. the computed value still strictly brackets
  //
  // ITS EXACT LIMIT, restated where it is implemented: a read is not a latch (§4.A). A neighbour can change
  // between this check and the write. The window narrows from "however long the operator deliberated" to one
  // round trip. That residual is ACCEPTED (D5) and is not closed here.
  function preflightMove(intent, op) {
    invalidateMarketplaceReference();
    return loadRows().then(function (fresh) {
      // REJECT BEFORE COMMITTING ANYTHING. This function used to assign `_rows` and redraw the filters as
      // its first two acts, so a read belonging to a cancelled or superseded operation replaced the table
      // the operator was looking at before anyone asked whether it was still wanted.
      if (!opIsLive(op)) return { ok: false, stale: true, reason: 'superseded' };
      _rows = fresh;
      renderFilters();
      var mine = fresh.filter(function (r) { return identityOf(r) === intent.key; });
      if (mine.length !== 1) {
        return { ok: false, reason: mine.length === 0
          ? 'That site is no longer in the marketplace reference.'
          : 'That site now matches ' + mine.length + ' rows, so no single row can be moved.' };
      }
      var target = mine[0];
      if (str(target.marketplaceId) !== intent.marketplaceId) {
        return { ok: false, reason: 'The row for that site is a different record than the one this move was '
          + 'prepared against.' };
      }
      var now = classify(target.allocationPriority);
      if (now.state !== intent.beforeState
          || (now.state === 'SET' && Number(now.value) !== Number(intent.beforeValue))) {
        return { ok: false, reason: 'This site’s own priority changed while the move was being prepared.' };
      }
      var ordered = fresh.filter(function (r) {
        return str(r.company) === intent.company && isOrdered(r) && identityOf(r) !== intent.key;
      }).sort(displayOrder);

      function indexOfKey(k) {
        for (var i = 0; i < ordered.length; i++) if (identityOf(ordered[i]) === k) return i;
        return -1;
      }
      var ui = intent.upperKey === null ? -1 : indexOfKey(intent.upperKey);
      var li = intent.lowerKey === null ? -1 : indexOfKey(intent.lowerKey);
      if ((intent.upperKey !== null && ui === -1) || (intent.lowerKey !== null && li === -1)) {
        return { ok: false, reason: 'A site next to this position is no longer there.' };
      }
      if (intent.upperKey !== null && Number(weightOf(ordered[ui])) !== Number(intent.upper)) {
        return { ok: false, reason: 'The site above this position changed weight.' };
      }
      if (intent.lowerKey !== null && Number(weightOf(ordered[li])) !== Number(intent.lower)) {
        return { ok: false, reason: 'The site below this position changed weight.' };
      }
      // ADJACENCY. Both weights can be unchanged while a THIRD row has appeared between them, which moves the
      // position without moving either number. The ends are checked as ends: nothing above the top neighbour,
      // nothing below the bottom one.
      if (intent.upperKey !== null && intent.lowerKey !== null && li !== ui + 1) {
        return { ok: false, reason: 'Another site now sits between the two this move was placed between.' };
      }
      if (intent.upperKey === null && li !== 0) {
        return { ok: false, reason: 'Another site is now above the one this move was placed above.' };
      }
      if (intent.lowerKey === null && ui !== ordered.length - 1) {
        return { ok: false, reason: 'Another site is now below the one this move was placed below.' };
      }
      if ((intent.upperKey !== null && !(intent.value < intent.upper))
          || (intent.lowerKey !== null && !(intent.value > intent.lower))) {
        return { ok: false, reason: 'The computed weight no longer sits strictly between its neighbours.' };
      }
      return { ok: true, row: target };
    }).catch(function (e) {
      if (!opIsLive(op)) return { ok: false, stale: true, reason: 'superseded' };
      return { ok: false, reason: 'The check before saving could not read the marketplace reference. '
        + ((e && e.message) ? e.message : String(e)) };
    });
  }

  function saveMove() {
    if (_busy || !_move || _move.live || _move.unconfirmed || _move.phase !== 'draft') {
      return Promise.resolve(false);
    }
    var row = moveRow();
    var p = currentProposal();
    if (!row || !p || !p.ok) return Promise.resolve(false);
    var before = classify(row.allocationPriority);
    var intent = {
      key: _move.key, company: _move.company, value: p.value,
      marketplaceId: str(row.marketplaceId),
      beforeState: before.state === 'SET' ? 'SET' : before.state,
      beforeValue: before.value,
      upperKey: p.upperKey, lowerKey: p.lowerKey, upper: p.upper, lower: p.lower
    };
    if (!intent.marketplaceId) {
      setStatus('error', 'This marketplace row has no identifier in the reference data, so a priority cannot '
        + 'be saved against it safely. Nothing was sent.');
      return Promise.resolve(false);
    }
    // An INVALID stored value cannot be the subject of a drag at all (it has no position and no grip), so the
    // only states that reach here are SET and MISSING — which are exactly the two the CAS can express.
    // THE OPERATION IS NAMED BEFORE IT STARTS, and everything downstream is checked against this object
    // rather than against the page's liveness.
    var op = { id: ++_opSeq, moveId: _move.id, mountGen: _mountGen };
    _op = op;
    _move.phase = 'checking';
    _busy = true;
    setStatus('loading', 'Checking the sites around this one before saving\u2026');
    render();
    return preflightMove(intent, op).then(function (pre) {
      // A SUPERSEDED ANSWER TOUCHES NOTHING — not `_busy`, not `_move`, not the banner. Clearing `_busy`
      // here unconditionally is what used to unwedge a NEWER save's flag from an older operation.
      if (!opIsLive(op)) return false;
      _busy = false;
      if (!pre.ok) {
        // THE LIST ON SCREEN IS NOW THE FRESH ONE — the preflight already replaced it — so the operator is
        // looking at what the server actually holds while reading why the move was dropped.
        _op = null;
        _move = null;
        render();
        setStatus('error', 'NOT SAVED \u2014 nothing was sent. ' + pre.reason
          + ' The list now shows what the reference currently holds; drag again if you still want the move.');
        return false;
      }
      // CHECKED AGAIN, IMMEDIATELY BEFORE THE WRITER. Everything between the gate above and this line is
      // synchronous today, and that is exactly the kind of fact that stops being true when someone adds an
      // await. The dispatch is the irreversible step, so it gets its own check.
      if (!opIsLive(op)) return false;
      _move.phase = 'sent';
      render();
      return commitPriority(pre.row, intent.value, { source: 'drag', op: op });
    });
  }

  // ---- save ---------------------------------------------------------------------------------------------
  // S8-B3-R3-CP2M-R4 — THE WRITE PATH IS SHARED BY THE EDITOR AND THE DRAG, DELIBERATELY.
  //
  // A drag that saved through its own copy of this would be a SECOND WRITER in everything but name: two
  // payload builders, two compare-and-set constructions and two read-back verdicts, drifting apart one fix at
  // a time. There is one. The drag differs only in what happens BEFORE it (the neighbour preflight) and in
  // one line of what is reported after it (the read-back POSITION as well as the read-back value).
  function save(key) {
    if (_busy) return Promise.resolve(false);
    var row = rowByKey(key);
    if (!row) { setStatus('error', 'That site is no longer in the loaded data. Refresh and try again.'); return Promise.resolve(false); }
    var input = document.querySelector('[data-sp-input="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    if (!input) { var all = document.querySelectorAll('[data-sp-input]'); input = all.length === 1 ? all[0] : null; }
    if (!input) { setStatus('error', 'The editor is no longer open for that site.'); return Promise.resolve(false); }

    var v = validateInput(input.value);
    if (!v.ok) { setStatus('error', v.reason); return Promise.resolve(false); }
    return commitPriority(row, v.value, { source: 'edit' });
  }

  // THE ACTUAL READ-BACK POSITION, computed from the rows the read-back just loaded. D1 asks for the stored
  // weight AND the ordering to be shown from the read-back rather than from the preview, and a weight alone
  // does not answer "where did it land" when the operator's whole intent was a position.
  function rankOf(key) {
    var row = rowByKey(key);
    if (!row) return null;
    var co = str(row.company);
    var ordered = _rows.filter(function (r) { return str(r.company) === co && isOrdered(r); }).sort(displayOrder);
    for (var i = 0; i < ordered.length; i++) {
      if (identityOf(ordered[i]) === key) return { pos: i + 1, of: ordered.length };
    }
    return null;
  }

  function commitPriority(row, newValue, opts) {
    opts = opts || {};
    var isDrag = (opts.source === 'drag');
    var key = identityOf(row);
    var v = { value: newValue };

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
    // `hold` is the one case where the move SURVIVES the save: an unknown outcome that a fresh read did not
    // settle. Everywhere else the move object is dropped and the row is drawn from whatever the reference
    // actually holds — including both proven zero-writes, where returning to the stored position is correct.
    function done(kind, text, ret, hold) {
      if (!liveSave()) return ret;
      _editingKey = null;
      // A DRAG OUTCOME MAY ONLY TOUCH THE DRAFT IT WAS DISPATCHED FOR. Matching on the row key alone would
      // let a late answer re-open an unconfirmed hold on a DIFFERENT draft that happens to be the same row.
      if (opts.op && (!_move || _move.id !== opts.op.moveId)) {
        render();
        setStatus(kind, text);
        return ret;
      }
      if (_move && _move.key === key) {
        if (hold) { _move.live = false; _move.unconfirmed = true; _move.phase = 'draft'; }
        else { _move = null; _op = null; }
      }
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

    // The read-back POSITION, appended only where a read-back actually succeeded and matched. It is phrased as
    // what the re-read shows, not as what the drag asked for, because those are the two things D1 separates.
    function placed() {
      var r = rankOf(key);
      return r ? ' A fresh read places it ' + r.pos + ' of ' + r.of + ' by weight in ' + str(row.company) + '.' : '';
    }

    function describe(rb) {
      if (rb.verdict === 'ABSENT') return label + ' is no longer present in the marketplace reference.';
      if (rb.verdict === 'COLLISION') return label + ' now matches ' + rb.n + ' rows under canonical country '
        + 'identity, so no single row can be confirmed.';
      if (rb.verdict === 'IDENTITY_CHANGED') return 'the row answering to ' + label + ' no longer carries the '
        + 'same company / country / marketplace values.';
      if (rb.verdict === 'ROW_CHANGED') return 'the row answering to ' + label + ' is a DIFFERENT record than '
        + 'the one this save was prepared against.';
      return 'a fresh read shows ' + (rb.c && rb.c.state === 'SET' ? formatWeight(rb.c.value) : String(rb.c && rb.c.state).toLowerCase())
        + ' rather than ' + formatWeight(v.value) + '.';
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
            + 'is not known whether the value was stored.' + ADVICE + ' ' + msgOf(rb.err), false, isDrag);
        }

        if (rb.verdict === 'MATCH') {
          if (!unknown) {
            return done('success', 'Saved and VERIFIED by re-reading the reference. ' + label
              + ' now has priority ' + formatWeight(v.value) + '.' + placed(), true);
          }
          // A MATCH AFTER AN UNKNOWN OUTCOME IS NOT A CONFIRMED SAVE, AND IS NOT LABELLED AS ONE.
          // The answer was lost, so this read cannot attribute the stored value to THIS request rather than to
          // a concurrent one, and it cannot say whether updated_by / updated_at completed — the handler writes
          // the priority first precisely so this case is recoverable rather than invisible.
          return done('warn', 'The write outcome was UNKNOWN (' + why + '). A fresh read now shows ' + label
            + ' at priority ' + formatWeight(v.value) + ', which is the intended value — but this does NOT prove this request '
            + 'is what stored it, and the audit fields may be incomplete. Nothing was re-sent. Treat the value '
            + 'as correct and the save as unconfirmed.' + placed(), true);
        }

        var prefix = unknown
          ? 'The write outcome is UNKNOWN (' + why + ') and the read-back does not confirm it — it may still be '
            + 'applied. Specifically, '
          : 'NOT VERIFIED — ';
        return done('error', prefix + describe(rb) + ADVICE, false, isDrag && unknown);
      });
    }).then(function (r) {
      if (myGen === _saveGen) _busy = false;
      return r;
    });
  }

  // ---- S8-B3-R3-CP2M-R4 — POINTER, TOUCH AND KEYBOARD ARE ONE GESTURE ------------------------------------
  //
  // POINTER EVENTS, NOT HTML5 DRAG-AND-DROP, and not a mouse-only handler. `dragstart`/`drop` do not fire for
  // touch at all on any mobile browser, so an HTML5 implementation would be a desktop feature wearing a
  // general name. Pointer events deliver mouse, pen and touch through the SAME handler, which is also what
  // makes "the touch path is the mouse path" a fact about the code rather than a claim about testing.
  //
  // THE KEYBOARD IS NOT A FALLBACK. Lift with Space or Enter, move with the arrows, Home and End for the ends,
  // drop with Space or Enter, cancel with Escape. It goes through beginLift / nudge / dropLift — the identical
  // functions the pointer path calls — so a keyboard move produces the identical draft, the identical preview,
  // the identical refusals and the identical save. There is no second code path to keep in step.
  var DRAG_THRESHOLD_PX = 4;

  // WHICH SLOT IS THE POINTER OVER. Measured against the midpoints of the OTHER ordered rows of this company,
  // never against the moved row itself — including it would make the answer depend on where the preview was
  // already drawn, which is the input, so the slot would chase itself.
  function slotFromPoint(y) {
    if (!_move) return null;
    var trs = document.querySelectorAll('#sp-rows tr[data-sp-ordered="1"]');
    var n = 0, seen = 0;
    for (var i = 0; i < trs.length; i++) {
      var tr = trs[i];
      if (tr.getAttribute('data-sp-company') !== _move.company) continue;
      if (tr.getAttribute('data-sp-row') === _move.key) continue;
      seen++;
      var b = tr.getBoundingClientRect ? tr.getBoundingClientRect() : null;
      if (!b) continue;
      if (y > b.top + b.height / 2) n++;
    }
    return seen ? n : null;
  }

  function setSlotFocused(slot) { setSlot(slot); _focusGrip = _move ? _move.key : null; restoreGripFocus(); }

  function onPointerMove(ev) {
    if (!_pointer) return;
    if (_pointer.id !== undefined && ev.pointerId !== undefined && ev.pointerId !== _pointer.id) return;
    if (!_pointer.lifted) {
      // A THRESHOLD, SO A TAP IS NOT A DRAG. Without it every touch on the grip would lift the row and the
      // operator could not scroll a long table with a finger that happened to land on a handle.
      if (Math.abs(ev.clientY - _pointer.y0) < DRAG_THRESHOLD_PX) return;
      if (!beginLift(_pointer.key, false)) { _pointer = null; return; }
      _pointer.lifted = true;
    }
    if (ev.cancelable && typeof ev.preventDefault === 'function') ev.preventDefault();
    var s = slotFromPoint(ev.clientY);
    if (s !== null) setSlot(s);
  }

  function onPointerEnd() {
    if (!_pointer) return;
    var lifted = _pointer.lifted;
    _pointer = null;
    if (lifted) dropLift();      // a drop, which is a PROPOSAL. Nothing is written here.
  }

  function onGripKeyDown(grip, ev) {
    var key = grip.getAttribute('data-sp-grip');
    var k = ev.key;
    var mine = !!(_move && _move.key === key && _move.live);
    if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();   // Space must not scroll the page
      if (mine) dropLift();
      else if (!_move) beginLift(key, true);
      return;
    }
    if (!mine) return;
    if (k === 'ArrowUp' || k === 'Up') { ev.preventDefault(); nudge(-1); return; }
    if (k === 'ArrowDown' || k === 'Down') { ev.preventDefault(); nudge(1); return; }
    if (k === 'Home') { ev.preventDefault(); setSlotFocused(0); return; }
    if (k === 'End') { ev.preventDefault(); setSlotFocused(reducedOrdered(_move.company, _move.key).length); return; }
    if (k === 'Escape' || k === 'Esc') { ev.preventDefault(); cancelMove(); return; }
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
      // EDITING AND MOVING ARE ONE AT A TIME. Opening the editor on some other row while a move is proposed
      // would leave two unsaved intentions on screen with one Save button each and no stated order.
      if (edit) {
        if (_move) { setStatus('warn', MOVE_PENDING_MSG); return; }
        _editingKey = edit; setStatus(null); render(); return;
      }
      if (t.getAttribute('data-sp-cancel')) { _editingKey = null; setStatus(null); render(); return; }
      var sv = t.getAttribute('data-sp-save');
      if (sv) { save(sv); return; }
      if (t.getAttribute('data-sp-move-save')) { saveMove(); return; }
      if (t.getAttribute('data-sp-move-cancel')) { cancelMove(); return; }
      if (t.id === 'sp-refresh') {
        // A Refresh would replace the rows the preview was computed against. That is a silent discard, so it
        // is refused rather than performed, in the same words as a filter change.
        if (_move && !_move.unconfirmed) { setStatus('warn', MOVE_PENDING_MSG); return; }
        _move = null;
        refresh({ force: true });
        return;
      }
    });

    // THE GRIP, FOR POINTER AND TOUCH. Delegated like everything else; `pointerdown` only RECORDS the
    // gesture, because whether it is a drag or a tap is not known until it moves.
    sec.addEventListener('pointerdown', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var grip = t.getAttribute('data-sp-grip') ? t : null;
      if (!grip) return;
      if (_busy || _move) return;
      _pointer = { key: grip.getAttribute('data-sp-grip'), id: ev.pointerId, y0: ev.clientY, lifted: false };
    });

    sec.addEventListener('keydown', function (ev) {
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-sp-grip')) { onGripKeyDown(t, ev); return; }
      // ESCAPE CANCELS A LIFT FROM ANYWHERE INSIDE THE PAGE, because focus can legitimately be elsewhere
      // during a pointer drag. It is NOT claimed when no lift is in progress, so it still reaches whatever
      // else wants it — the navigation drawer among them.
      if ((ev.key === 'Escape' || ev.key === 'Esc') && _move && _move.live) {
        ev.preventDefault();
        cancelMove();
      }
    });

    sec.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || (t.id !== 'sp-filter-company' && t.id !== 'sp-filter-country')) return;
      // A FILTER CHANGE MAY NEITHER DISCARD THE MOVE NOR SAVE IT. Changing the scope would re-derive the
      // ordered list the preview was computed against, so the preview would silently come to mean something
      // else. The select is put back and the operator is asked to finish or cancel — which are the only two
      // ways a draft is allowed to end.
      if (_move) {
        t.value = (t.id === 'sp-filter-company') ? _filterState.co : _filterState.ct;
        setStatus('warn', MOVE_PENDING_MSG);
        return;
      }
      syncFilterState();
      _editingKey = null;
      render();
    });
  }

  var MOVE_PENDING_MSG = 'There is a proposed move that has not been saved. Save it or Cancel it first — it '
    + 'will not be saved automatically, and it will not be thrown away without you saying so.';

  function syncFilterState() {
    _filterState.co = $('sp-filter-company') ? $('sp-filter-company').value : '';
    _filterState.ct = $('sp-filter-country') ? $('sp-filter-country').value : '';
  }

  // THE POINTER STREAM IS ON THE DOCUMENT, not on the grip. The grip is destroyed and recreated by every
  // re-render — which happens on every slot change — so a listener attached to it, or a pointer capture held
  // by it, would be gone one frame into the drag. These are attached ONCE at module scope and are inert
  // whenever `_pointer` is null, which is every moment except an actual gesture.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerEnd);
    document.addEventListener('pointercancel', onPointerEnd);
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
      // S8-B3-R3-CP2M-R4 — AND A PROPOSED MOVE IS DISCARDED ON LEAVE, which is safe for exactly the reason
      // a half-typed priority is: it was never written. Leaving is the operator's own navigation, not a
      // silent discard by the page, and nothing can be saved from a page that is not on screen. An
      // UNCONFIRMED hold goes with it — it is a marker, and the fresh read on return is what settles it.
      unmount: function () {
        _mounted = false; _editingKey = null; _busy = false; _reading = false;
        _move = null; _pointer = null; _focusGrip = null; _op = null;
        _readGen++; _saveGen++; _mountGen++;
      }
    });
  }

  // Exposed for tests and for the inline handler bridge the shell uses elsewhere.
  window.initSitePriorityPage = mount;
  window.KM = window.KM || {};
  window.KM.sitePriority = {
    classify: classify, validateInput: validateInput, identityOf: identityOf, canonCountry: canonCountry,
    // THE RULE, EXPORTED AS ARITHMETIC. These are pure functions of their arguments, so the boundary cases
    // that matter — a product that cannot escape zero, a midpoint that overflows, a factor that fails to move
    // a denormal — are tested as numbers rather than inferred from a screenshot.
    proposeWeight: proposeWeight, midpoint: midpoint, isStorableWeight: isStorableWeight,
    // DISPLAY ONLY - exported so the suite can prove it is injective and that nothing it returns ever
    // reaches a payload, a compare-and-set, the comparator or the arithmetic.
    formatWeight: formatWeight,
    displayOrder: displayOrder, weightOf: weightOf, isOrdered: isOrdered,
    TOP_FACTOR: TOP_FACTOR, BOTTOM_FACTOR: BOTTOM_FACTOR,
    _state: function () {
      return { rows: _rows.slice(), editingKey: _editingKey, busy: _busy,
        reading: _reading, mounted: _mounted, readGen: _readGen, saveGen: _saveGen,
        move: _move ? { id: _move.id, key: _move.key, company: _move.company, slot: _move.slot,
                        live: _move.live, unconfirmed: _move.unconfirmed, origRank: _move.origRank,
                        phase: _move.phase } : null,
        opId: _op ? _op.id : null };
    },
    // THE GESTURE, EXPORTED FOR THE NODE SUITE ONLY — and the BROWSER evidence does not use it. A headless
    // DOM has no layout, so `getBoundingClientRect` returns zeros and a pointer path cannot be driven there
    // at all; the node suite therefore drives lift / nudge / drop directly, and the real pointer, touch and
    // keyboard gestures are exercised against a real browser in the viewport runner. Neither stands in for
    // the other, and saying which proves what is the point of exporting this under a name that admits it.
    _drag: {
      beginLift: beginLift, nudge: nudge, setSlot: setSlot, dropLift: dropLift,
      cancelMove: cancelMove, saveMove: saveMove, currentProposal: currentProposal,
      rankOf: rankOf, slotFromPoint: slotFromPoint
    }
  };

})();
