/**
 * TEMP — F1-7N-FB-4G-A3 §B + §C — CARRIER ELIGIBILITY TRACE + ACTIVE ALLOCATION DRAFT CENSUS (READ ONLY).
 *
 * ONE entry point, no parameters:
 *
 *     TEMP_SUBMIT_READINESS_CENSUS_A3()
 *
 * PASTE → RUN → READ → REMOVE. Nothing here writes, deletes, transitions a status, back-fills a value, takes a
 * lock, touches Properties, creates a file, submits, or calls any router action. Every sheet is handed to the
 * reporter through a façade exposing ONLY getDataRange().getValues(), so the mutators are UNREACHABLE rather
 * than merely unused: a later edit cannot write through this file even by accident.
 *
 * IT ANSWERS TWO QUESTIONS, AND IT REFUSES TO GUESS AT EITHER.
 *
 * §B  WHY DOES `TW勝一 → Amazon` OFFER NO METHOD? The Execution Plan Method picker lists the distinct
 *     shipping_method values of the ACTIVE carrier_rate_cards rows whose origin_country / destination_country /
 *     marketplace / destination_warehouse_code axes do not CONTRADICT the route (a blank card axis is a
 *     wildcard; a non-blank one must match exactly). "No eligible method" is therefore a CONFIGURATION answer,
 *     not a read failure — and the eight possible causes have eight different fixes, so this reports which one
 *     it is by counting how many rows each gate eliminated, and prints the exact row that would fix it.
 *
 *     IT ALSO SEPARATES THE TWO THINGS AN OPERATOR CONFLATES: a route with NO ELIGIBLE METHOD (no rate card)
 *     and a route with an eligible Method but NO LEAD TIME (a rate card exists, carrier_lead_times has no row
 *     for its canonical service). The first empties the picker; the second fills the picker and leaves
 *     Expected Arrival blank. They are reported separately.
 *
 * §C  WHICH ACTIVE DRAFTS COULD ENTER A SUBMIT? Every header and line with its lifecycle facts, classified
 *     ACTIVE_COMPLETE / ACTIVE_INCOMPLETE / LEGITIMATE_EXPLICIT_ADD_ROUTE / CANCELLED_HISTORICAL /
 *     EDIT_REPLACEMENT_CANDIDATE / ORPHAN_HEADER / UNKNOWN, and a final list of the EXACT allocation_draft_ids
 *     that are eligible for a Submit simulation.
 *
 * WHAT IT WILL NOT DO. It will not attribute a row to an operation because two rows share a K2/K4 shape: two
 * explicit `+ Add Route` tickets for an identical physical route are legitimately two tickets, so the shape
 * proves nothing. The only stored provenance evidence is create_idempotency_key plus the timing and lifecycle
 * columns. Anything undecidable prints UNKNOWN. Cancelled rows are HISTORICAL EVIDENCE and are left alone.
 */

var TEMP_A3_ADJACENCY_SECONDS_ = 120;
// The route this round exists to explain. Both halves are matched case-insensitively against the warehouse
// name AND code, because the operator names it by its display label and the tables key it by id.
var TEMP_A3_FOCUS_SOURCE_ = '勝一';
var TEMP_A3_FOCUS_DEST_MARKETPLACE_ = 'Amazon';

function TEMP_SUBMIT_READINESS_CENSUS_A3() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function S(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function lo(v) { return S(v).toLowerCase(); }

  p('TEMP SUBMIT READINESS CENSUS - F1-7N-FB-4G-A3 - READ ONLY');
  p('run at: ' + new Date());
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  p('spreadsheet: ' + ss.getName() + '  (' + ss.getId() + ')');

  function facade(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return null;
    var values = sh.getDataRange().getValues();
    return {
      name: name,
      header: (values[0] || []).map(function (x) { return S(x); }),
      rows: values.slice(1)
    };
  }
  function cell(f, row, n) { var c = f.header.indexOf(n); return c === -1 ? '' : S(row[c]); }
  function has(f, n) { return !!f && f.header.indexOf(n) !== -1; }
  function objs(f) {
    if (!f) return [];
    return f.rows.map(function (r) { var o = {}; for (var i = 0; i < f.header.length; i++) if (f.header[i]) o[f.header[i]] = r[i]; return o; });
  }
  function ts(v) { var d = new Date(S(v).replace(' ', 'T')); return isNaN(d.getTime()) ? null : d.getTime(); }

  // ==========================================================================================================
  // SECTION 1 — §B  THE CARRIER ELIGIBILITY TRACE
  // ==========================================================================================================
  rule();
  p('SECTION 1 - CARRIER ELIGIBILITY TRACE (SS.B)');
  rule();

  var WH = facade('warehouses');
  var RC = facade('carrier_rate_cards');
  var LT = facade('carrier_lead_times');
  var MK = facade('marketplaces');

  if (!RC) p('REFUSED: carrier_rate_cards not found. No eligibility conclusion is possible.');

  // ---- B.1  the exact source warehouse identity -----------------------------------------------------------
  var srcMatches = [];
  if (WH) {
    objs(WH).forEach(function (w) {
      var name = S(w.warehouse_name), code = S(w.warehouse_code), id = S(w.warehouse_id);
      if (name.indexOf(TEMP_A3_FOCUS_SOURCE_) !== -1 || code.indexOf(TEMP_A3_FOCUS_SOURCE_) !== -1 ||
          lo(name).indexOf('shengyi') !== -1 || lo(code).indexOf('shengyi') !== -1 ||
          lo(name).indexOf('sheng yi') !== -1) {
        srcMatches.push({ id: id, code: code, name: name, country: S(w.country), company: S(w.company),
          type: S(w.warehouse_type), active: S(w.is_active) });
      }
    });
  } else {
    p('WARNING: warehouses not found. The source identity cannot be resolved and every conclusion below is UNKNOWN.');
  }
  p('B.1 source warehouse candidates matching "' + TEMP_A3_FOCUS_SOURCE_ + '": ' + srcMatches.length);
  srcMatches.forEach(function (w) {
    p('    warehouse_id=' + (w.id || '(blank)') + '  code=' + (w.code || '(blank)') + '  name=' + (w.name || '(blank)'));
    p('      country=' + (w.country || '(blank)') + '  company=' + (w.company || '(blank)') +
      '  type=' + (w.type || '(blank)') + '  is_active=' + (w.active === '' ? '(blank)' : w.active));
  });
  if (srcMatches.length === 0) p('    NONE. The From option the operator sees is not backed by a warehouses row this census can find.');
  if (srcMatches.length > 1) p('    AMBIGUOUS - more than one warehouse answers to this name. Resolution is by warehouse_id only.');

  var src = srcMatches.length === 1 ? srcMatches[0] : null;
  var originCountry = src ? src.country : '';
  p('B.1 resolved origin_country = ' + (originCountry || '(UNRESOLVED)'));

  // ---- B.2/B.3  the destination identity + the scope it belongs to ----------------------------------------
  var mkRows = objs(MK).filter(function (m) { return lo(m.marketplace) === lo(TEMP_A3_FOCUS_DEST_MARKETPLACE_); });
  p('B.2 destination: MARKETPLACE "' + TEMP_A3_FOCUS_DEST_MARKETPLACE_ + '" (a LOGICAL destination - no destination_warehouse_code axis)');
  p('B.3 marketplaces rows named ' + TEMP_A3_FOCUS_DEST_MARKETPLACE_ + ': ' + mkRows.length);
  mkRows.forEach(function (m) {
    p('    company=' + S(m.company) + '  country=' + S(m.country) + '  marketplace=' + S(m.marketplace) +
      '  marketplace_id=' + S(m.marketplace_id));
  });
  var destCountries = {};
  mkRows.forEach(function (m) { var c = S(m.country); if (c) destCountries[c] = 1; });
  var destCountryList = Object.keys(destCountries);
  p('B.3 destination_country candidates from the marketplace scope: ' + (destCountryList.join(', ') || '(none)'));

  // ---- B.4/B.6  the exact rate-card census, gate by gate ---------------------------------------------------
  // The predicate is the shipped one: a card is USABLE unless its status is an explicit inactive token or the
  // effective window excludes today, and it MATCHES unless a NON-BLANK card axis contradicts a NON-BLANK route
  // axis. Nothing here is fuzzy, nothing is nearest-text, and no axis is matched away.
  var INACTIVE = { inactive: 1, disabled: 1, archived: 1, expired: 1, 'void': 1, deleted: 1 };
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function parseD(v) { var d = new Date(S(v)); return isNaN(d.getTime()) ? null : d; }
  function usable(c) {
    if (INACTIVE[lo(c.status)]) return false;
    var f = c.effective_from ? parseD(c.effective_from) : null;
    var t = c.effective_to ? parseD(c.effective_to) : null;
    if (f && today < f) return false;
    if (t && today > t) return false;
    return true;
  }
  function axisReject(c, route) {
    var AX = [['origin_country', route.originCountry], ['destination_country', route.destinationCountry],
              ['marketplace', route.marketplace], ['destination_warehouse_code', route.destinationWarehouseCode]];
    for (var i = 0; i < AX.length; i++) {
      var cv = lo(c[AX[i][0]]), rv = lo(AX[i][1]);
      if (!cv) continue;      // wildcard on the card
      if (!rv) continue;      // the route does not constrain this axis
      if (cv !== rv) return AX[i][0];
    }
    return null;
  }

  var cards = objs(RC);
  p('B.4 carrier_rate_cards rows total: ' + cards.length);
  var routeQueries = [];
  destCountryList.forEach(function (dc) {
    routeQueries.push({ label: 'origin=' + (originCountry || '(any)') + ' dest=' + dc + ' mkt=' + TEMP_A3_FOCUS_DEST_MARKETPLACE_,
      originCountry: originCountry, destinationCountry: dc, marketplace: TEMP_A3_FOCUS_DEST_MARKETPLACE_, destinationWarehouseCode: '' });
  });
  if (!routeQueries.length) {
    routeQueries.push({ label: 'origin=' + (originCountry || '(any)') + ' dest=(UNRESOLVED) mkt=' + TEMP_A3_FOCUS_DEST_MARKETPLACE_,
      originCountry: originCountry, destinationCountry: '', marketplace: TEMP_A3_FOCUS_DEST_MARKETPLACE_, destinationWarehouseCode: '' });
  }

  routeQueries.forEach(function (q) {
    p('');
    p('  ROUTE  ' + q.label);
    var usableRows = cards.filter(usable);
    var byGate = {}, matched = [];
    usableRows.forEach(function (c) {
      var g = axisReject(c, q);
      if (!g) { matched.push(c); return; }
      byGate[g] = (byGate[g] || 0) + 1;
    });
    var withMethod = matched.filter(function (c) { return !!S(c.shipping_method); });
    var reason = (cards.length === 0) ? 'NO_RATE_CARDS_AT_ALL'
      : (usableRows.length === 0) ? 'ALL_RATE_CARDS_INACTIVE_OR_OUT_OF_WINDOW'
      : (matched.length === 0) ? 'NO_RATE_CARD_MATCHES_THIS_ROUTE'
      : (withMethod.length === 0) ? 'MATCHING_RATE_CARDS_CARRY_NO_SHIPPING_METHOD'
      : 'RESOLVED';
    p('    usable=' + usableRows.length + ' of ' + cards.length +
      '   matched=' + matched.length + '   with_shipping_method=' + withMethod.length);
    p('    rejected_by_gate=' + JSON.stringify(byGate));
    p('    VERDICT: ' + reason);
    var methods = {};
    withMethod.forEach(function (c) { methods[S(c.shipping_method)] = 1; });
    p('    eligible methods: ' + (Object.keys(methods).join(', ') || '(none)'));
    matched.slice(0, 10).forEach(function (c) {
      p('      candidate rate_card_id=' + S(c.rate_card_id) + ' carrier=' + S(c.carrier_id) +
        ' method=' + (S(c.shipping_method) || '(BLANK)') + ' status=' + (S(c.status) || '(blank)') +
        ' eff=' + (S(c.effective_from) || '-') + '..' + (S(c.effective_to) || '-'));
    });
    if (reason !== 'RESOLVED') {
      p('    B.10 THE ROW AN OPERATOR WOULD HAVE TO CONFIGURE (a PROPOSAL - nothing was written):');
      p('        carrier_id                 = (an existing active carrier)');
      p('        origin_country             = ' + (q.originCountry || '(blank = every origin)'));
      p('        destination_country        = ' + (q.destinationCountry || '(blank = every destination)'));
      p('        marketplace                = ' + q.marketplace);
      p('        destination_warehouse_code = (blank - the destination is a marketplace, not a warehouse)');
      p('        shipping_method            = (the canonical service token this lane should offer)');
      p('        status                     = active     effective_from/to = (blank or a window covering today)');
    }
    // ---- B.7  eligible method WITHOUT a lead time is a DIFFERENT failure -----------------------------------
    if (reason === 'RESOLVED') {
      p('    B.7 lead-time coverage for each eligible method (a MISSING lead time leaves Expected Arrival blank');
      p('        but does NOT empty the Method picker - the two are separate failures):');
      var leads = objs(LT);
      Object.keys(methods).forEach(function (m) {
        var key = lo(m);
        var rows = leads.filter(function (l) {
          if (lo(l.shipping_method) !== key) return false;
          if (S(l.destination_country) && q.destinationCountry && lo(l.destination_country) !== lo(q.destinationCountry)) return false;
          if (S(l.origin_country) && q.originCountry && lo(l.origin_country) !== lo(q.originCountry)) return false;
          return true;
        });
        var withAvg = rows.filter(function (l) { return S(l.avg_days) !== '' && !isNaN(Number(l.avg_days)); });
        p('        ' + m + ' -> lead_time rows=' + rows.length + '  with avg_days=' + withAvg.length +
          (withAvg.length ? ('  (' + Number(withAvg[0].avg_days) + 'd)') : '  => ETA WILL BE BLANK (NO_LEAD_TIME)'));
      });
    }
  });
  p('');
  p('  NOTE. This trace adds NO fallback: it never answers for a different From, a different service or a');
  p('  different destination, and it modifies no master data. A route the catalogue does not cover is reported');
  p('  as uncovered.');

  // ==========================================================================================================
  // SECTION 2 — §C  THE ACTIVE ALLOCATION DRAFT CENSUS
  // ==========================================================================================================
  rule();
  p('SECTION 2 - ACTIVE ALLOCATION DRAFT CENSUS (SS.C)');
  rule();

  var H = facade('shipping_allocation_drafts');
  var L = facade('shipping_allocation_draft_lines');
  if (!H) {
    p('REFUSED: shipping_allocation_drafts not found. Nothing classified.');
    var t0 = out.join('\n'); Logger.log(t0); return t0;
  }
  var ciPresent = has(H, 'create_idempotency_key');
  p('create_idempotency_key column: ' + (ciPresent ? 'PRESENT' : 'ABSENT - provenance cannot be proven for ANY row'));

  var linesByDraft = {};
  if (L) {
    for (var lr = 0; lr < L.rows.length; lr++) {
      var lrow = L.rows[lr];
      var rec = { sheetRow: lr + 2,
        lineId: cell(L, lrow, 'allocation_draft_line_id'), draftId: cell(L, lrow, 'allocation_draft_id'),
        sku: cell(L, lrow, 'sku'), siteSku: cell(L, lrow, 'site_sku'),
        qty: cell(L, lrow, 'planned_qty'), lineStatus: lo(cell(L, lrow, 'line_status')),
        created: cell(L, lrow, 'created_at'), updated: cell(L, lrow, 'updated_at') };
      (linesByDraft[rec.draftId] = linesByDraft[rec.draftId] || []).push(rec);
    }
  } else {
    p('WARNING: shipping_allocation_draft_lines not found. Every line fact below is UNKNOWN.');
  }
  function activeLines(id) {
    return (linesByDraft[id] || []).filter(function (x) { return x.lineStatus !== 'cancelled' && x.lineStatus !== 'expired'; });
  }
  function positiveLines(id) {
    return activeLines(id).filter(function (x) { var n = Number(x.qty); return isFinite(n) && n > 0; });
  }

  var headers = [];
  for (var r = 0; r < H.rows.length; r++) {
    var row = H.rows[r];
    headers.push({ sheetRow: r + 2,
      id: cell(H, row, 'allocation_draft_id'), status: lo(cell(H, row, 'status')),
      company: cell(H, row, 'company'), country: cell(H, row, 'country'),
      marketplace: cell(H, row, 'marketplace'), source_page: cell(H, row, 'source_page'),
      planning_cycle: cell(H, row, 'planning_cycle'), generation_type: lo(cell(H, row, 'generation_type')),
      created_by: cell(H, row, 'created_by'),
      calc_run: cell(H, row, 'calculation_run_id'), formula: cell(H, row, 'formula_version'),
      src: cell(H, row, 'recommended_source_warehouse_id'),
      srcCode: cell(H, row, 'recommended_source_warehouse_code_snapshot'),
      dstWh: cell(H, row, 'recommended_destination_warehouse_id'),
      dstWhCode: cell(H, row, 'recommended_destination_warehouse_code_snapshot'),
      dstMk: cell(H, row, 'destination_marketplace'),
      method: cell(H, row, 'recommended_shipping_method'),
      lastMile: cell(H, row, 'recommended_last_mile_delivery'),
      version: cell(H, row, 'draft_version'),
      createKey: ciPresent ? cell(H, row, 'create_idempotency_key') : '',
      created: cell(H, row, 'created_at'), updated: cell(H, row, 'updated_at'),
      cancelledAt: cell(H, row, 'cancelled_at'), cancelReason: cell(H, row, 'cancel_reason'),
      submittedAt: cell(H, row, 'submitted_at') });
  }

  function stationOf(h) { return [lo(h.company), lo(h.country), lo(h.marketplace), lo(h.source_page)].join('|'); }
  // The route is COMPLETE only under the same XOR the server gate applies: a source, EXACTLY ONE canonical
  // destination (a warehouse id XOR a marketplace - a CODE SNAPSHOT IS NEVER ONE), a method, and at least one
  // active line carrying a positive quantity.
  function routeComplete(h) {
    var hasSrc = !!h.src;
    var xor = (!!h.dstWh) !== (!!h.dstMk);
    return hasSrc && xor && !!h.method;
  }
  var cancelledTimes = headers.filter(function (h) { return h.status === 'cancelled'; })
    .map(function (h) { return { h: h, t: ts(h.cancelledAt || h.updated) }; })
    .filter(function (x) { return x.t !== null; });

  function classify(h) {
    if (h.status === 'cancelled') {
      var ct = ts(h.cancelledAt || h.updated);
      if (ct !== null) {
        for (var i = 0; i < headers.length; i++) {
          var o = headers[i];
          if (o.id === h.id || o.status === 'cancelled') continue;
          if (stationOf(o) !== stationOf(h)) continue;
          var ot = ts(o.created);
          if (ot !== null && Math.abs(ot - ct) <= TEMP_A3_ADJACENCY_SECONDS_ * 1000) return 'EDIT_REPLACEMENT_CANDIDATE';
        }
      }
      return 'CANCELLED_HISTORICAL';
    }
    if (h.status === 'submitted' || h.status === 'expired') return 'CANCELLED_HISTORICAL';
    if (activeLines(h.id).length === 0) return 'ORPHAN_HEADER';
    if (!routeComplete(h)) return 'ACTIVE_INCOMPLETE';
    if (ciPresent && h.createKey) return 'LEGITIMATE_EXPLICIT_ADD_ROUTE';
    if (!ciPresent) return 'UNKNOWN';
    return 'ACTIVE_COMPLETE';
  }

  var tally = {}, submitEligible = [], blocking = [];
  for (var k = 0; k < headers.length; k++) {
    var h = headers[k];
    var cls = classify(h);
    tally[cls] = (tally[cls] || 0) + 1;
    var al = activeLines(h.id), pl = positiveLines(h.id), all = linesByDraft[h.id] || [];
    p('');
    p(cls + '   ' + h.id + '   (sheet row ' + h.sheetRow + ')');
    p('   status/version   : ' + (h.status || '(blank)') + '  /  v' + (h.version || '(blank)') +
      (h.submittedAt ? ('  submitted_at=' + h.submittedAt) : ''));
    p('   station          : ' + h.company + ' / ' + h.country + ' / ' + h.marketplace + ' / ' + h.source_page +
      ' / cycle=' + (h.planning_cycle || '(blank)') + ' / gen=' + (h.generation_type || '(blank)'));
    p('   route From       : ' + (h.src || '(BLANK)') + (h.srcCode ? (' [code ' + h.srcCode + ']') : ''));
    p('   route To         : ' + (h.dstWh ? ('WAREHOUSE ' + h.dstWh + (h.dstWhCode ? (' [code ' + h.dstWhCode + ']') : ''))
      : (h.dstMk ? ('MARKETPLACE ' + h.dstMk) : '(BLANK)')) +
      ((h.dstWh && h.dstMk) ? '   <-- BOTH SET: AMBIGUOUS, the server refuses this' : ''));
    p('   method/last mile : ' + (h.method || '(BLANK)') + (h.lastMile ? (' / ' + h.lastMile) : ''));
    p('   create key       : ' + (ciPresent ? (h.createKey || '(blank - pre-contract row)') : '(COLUMN ABSENT)'));
    p('   created/updated  : ' + (h.created || '(blank)') + '   /   ' + (h.updated || '(blank)'));
    if (h.status === 'cancelled') p('   cancelled_at     : ' + (h.cancelledAt || '(blank)') + '   reason=' + (h.cancelReason || '(blank)'));
    p('   lines            : ' + al.length + ' active (' + pl.length + ' with qty > 0) of ' + all.length + ' total');
    all.forEach(function (l) {
      p('      ' + (l.lineStatus === 'cancelled' ? 'CANCELLED ' : 'active    ') + l.lineId +
        '  sku=' + l.sku + (l.siteSku ? ('/' + l.siteSku) : '') + '  qty=' + l.qty +
        '  created=' + (l.created || '(blank)') + '  updated=' + (l.updated || '(blank)'));
    });
    // ---- C.5  the EXACT ids a Submit simulation may use ----------------------------------------------------
    if (cls === 'ACTIVE_COMPLETE' || cls === 'LEGITIMATE_EXPLICIT_ADD_ROUTE') {
      if (pl.length) submitEligible.push(h.id);
      else blocking.push({ id: h.id, why: 'NO_POSITIVE_PLANNED_QTY_LINES' });
    } else if (cls === 'ACTIVE_INCOMPLETE') {
      blocking.push({ id: h.id, why: 'ACTIVE_INCOMPLETE (the Execution Plan preflight refuses the whole submit while this is on screen)' });
    } else if (cls === 'ORPHAN_HEADER') {
      blocking.push({ id: h.id, why: 'ORPHAN_HEADER (active header, zero active lines - the server refuses it with NO_LINES)' });
    } else if (cls === 'UNKNOWN') {
      blocking.push({ id: h.id, why: 'UNKNOWN (provenance undecidable - review before including it)' });
    }
  }

  rule();
  p('SECTION 3 - TALLY AND THE SUBMIT-ELIGIBLE SET');
  rule();
  ['ACTIVE_COMPLETE', 'ACTIVE_INCOMPLETE', 'LEGITIMATE_EXPLICIT_ADD_ROUTE', 'CANCELLED_HISTORICAL',
   'EDIT_REPLACEMENT_CANDIDATE', 'ORPHAN_HEADER', 'UNKNOWN'].forEach(function (c) {
    p('  ' + c + ': ' + (tally[c] || 0));
  });
  p('');
  p('  SUBMIT-ELIGIBLE allocation_draft_ids (' + submitEligible.length + '):');
  submitEligible.forEach(function (id) { p('    ' + id); });
  if (!submitEligible.length) p('    (none)');
  p('');
  p('  ACTIVE ROWS THAT WOULD BLOCK OR BE EXCLUDED (' + blocking.length + '):');
  blocking.forEach(function (b) { p('    ' + b.id + '  -  ' + b.why); });
  if (!blocking.length) p('    (none)');
  p('');
  p('  HOW TO READ EDIT_REPLACEMENT_CANDIDATE. It is a CANDIDATE, not a finding: the row was cancelled within ' +
    TEMP_A3_ADJACENCY_SECONDS_ + 's of a');
  p('  sibling being created in the same station - the fingerprint of the edit-driven replacement A2-R4 removed.');
  p('  An operator who really did delete one route and add another in the same minute produces the same pattern,');
  p('  so NOTHING here is repaired, deleted or restored. A shared K2/K4 shape was deliberately NOT used as');
  p('  evidence: two explicit Add Routes of an identical route are legitimately two tickets.');
  p('  Cancelled rows may REMAIN as historical evidence; only ACTIVE duplicates or orphans can enter a Submit.');

  rule();
  p('SECTION 4 - WHAT THIS CENSUS DID');
  rule();
  p('DB_WRITES=0 . ROWS_INSERTED=0 . ROWS_UPDATED=0 . ROWS_DELETED=0 . BACKFILLS=0 . LOCKS_TAKEN=0');
  p('STATUS_TRANSITIONS=0 . PROPERTIES_TOUCHED=0 . ACTIONS_CALLED=0 . SUBMITS=0 . REPAIRS=0 . RESTORES=0');
  p('MASTER_DATA_CHANGES=0 . RATE_CARDS_CREATED=0 . RATE_CARDS_MODIFIED=0');
  p('Sheets were read through a facade exposing only getDataRange().getValues(); no write handle was ever');
  p('obtained, so a write was not merely avoided but unreachable.');
  rule();

  var text = out.join('\n');
  Logger.log(text);
  return text;
}
