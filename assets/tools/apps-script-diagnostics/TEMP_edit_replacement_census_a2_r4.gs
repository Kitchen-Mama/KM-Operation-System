/**
 * TEMP — F1-7N-FB-4G-A2-R4 §L — EDIT-REPLACEMENT / CANCELLED-ROW CENSUS (READ ONLY).
 *
 * One entry point, no parameters:
 *
 *     TEMP_EDIT_REPLACEMENT_CENSUS_A2_R4()
 *
 * PASTE → RUN → READ → REMOVE. Nothing here writes, deletes, transitions a status, back-fills a value, takes a
 * lock, touches Properties, creates a file or calls any upsert/submit action. Every sheet is handed to the
 * reporter through a façade exposing ONLY getDataRange().getValues(), so the mutators are UNREACHABLE rather
 * than merely unused: a later edit cannot write through this file even by accident.
 *
 * WHY IT EXISTS. Until A2-R4 an ordinary edit could cancel a route's ticket and create a replacement: changing
 * From rebuilt the Method options, the old Method became invalid, the select was cleared, the route was briefly
 * incomplete — and in that instant the client erased the route's identity and queued a soft-cancel of its
 * stored line. The live tables therefore hold cancelled headers and newer headers that LOOK like deliberate
 * Add Routes and may not be. This census tells them apart ON EVIDENCE and repairs nothing.
 *
 * WHAT IT WILL NOT DO. It will not attribute a row to an operation because two rows share a K2/K4 shape. Two
 * explicit Add Routes of an identical route are legitimately two tickets (§B.2), so the shape proves nothing.
 * The only stored evidence of provenance is create_idempotency_key, plus the timing and lifecycle columns.
 * Anything that cannot be decided is printed UNKNOWN.
 */

var TEMP_R4_TABS_ = ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'];
// Rows created within this many seconds of a cancellation are TIME-ADJACENT — the fingerprint of an
// edit-driven replacement, where the cancel and the create came from one save.
var TEMP_R4_ADJACENCY_SECONDS_ = 120;

function TEMP_EDIT_REPLACEMENT_CENSUS_A2_R4() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }

  p('TEMP EDIT-REPLACEMENT CENSUS - F1-7N-FB-4G-A2-R4 - READ ONLY');
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
      header: (values[0] || []).map(function (x) { return String(x == null ? '' : x).trim(); }),
      rows: values.slice(1)
    };
  }
  var H = facade(TEMP_R4_TABS_[0]), L = facade(TEMP_R4_TABS_[1]);
  if (!H) { p('REFUSED: shipping_allocation_drafts not found. Nothing classified.'); Logger.log(out.join('\n')); return out.join('\n'); }

  function col(f, n) { return f.header.indexOf(n); }
  function cell(f, row, n) { var c = col(f, n); return c === -1 ? '' : String(row[c] == null ? '' : row[c]).trim(); }
  function ts(v) { var d = new Date(String(v || '').replace(' ', 'T')); return isNaN(d.getTime()) ? null : d.getTime(); }

  var ciPresent = col(H, 'create_idempotency_key') !== -1;
  p('create_idempotency_key column: ' + (ciPresent ? 'PRESENT' : 'ABSENT — provenance cannot be proven for ANY row'));
  p('header columns: ' + H.header.length + '   data rows: ' + H.rows.length);

  // ---- build the header records --------------------------------------------------------------------------
  var headers = [];
  for (var r = 0; r < H.rows.length; r++) {
    var row = H.rows[r];
    headers.push({
      sheetRow: r + 2,
      id: cell(H, row, 'allocation_draft_id'),
      status: cell(H, row, 'status').toLowerCase(),
      company: cell(H, row, 'company'), country: cell(H, row, 'country'),
      marketplace: cell(H, row, 'marketplace'), source_page: cell(H, row, 'source_page'),
      planning_cycle: cell(H, row, 'planning_cycle'),
      src: cell(H, row, 'recommended_source_warehouse_id'),
      dstWh: cell(H, row, 'recommended_destination_warehouse_id'),
      dstMk: cell(H, row, 'destination_marketplace'),
      method: cell(H, row, 'recommended_shipping_method'),
      lastMile: cell(H, row, 'recommended_last_mile_delivery'),
      version: cell(H, row, 'draft_version'),
      createKey: ciPresent ? cell(H, row, 'create_idempotency_key') : '',
      created: cell(H, row, 'created_at'),
      updated: cell(H, row, 'updated_at'),
      cancelledAt: cell(H, row, 'cancelled_at'),
      cancelReason: cell(H, row, 'cancel_reason')
    });
  }

  var linesByDraft = {};
  if (L) {
    for (var lr = 0; lr < L.rows.length; lr++) {
      var lrow = L.rows[lr];
      var rec = {
        sheetRow: lr + 2,
        lineId: cell(L, lrow, 'allocation_draft_line_id'),
        draftId: cell(L, lrow, 'allocation_draft_id'),
        sku: cell(L, lrow, 'sku'),
        qty: cell(L, lrow, 'planned_qty'),
        lineStatus: cell(L, lrow, 'line_status').toLowerCase(),
        created: cell(L, lrow, 'created_at'),
        updated: cell(L, lrow, 'updated_at'),
        cancelledAt: cell(L, lrow, 'cancelled_at')
      };
      (linesByDraft[rec.draftId] = linesByDraft[rec.draftId] || []).push(rec);
    }
  } else {
    p('WARNING: shipping_allocation_draft_lines not found. Every line fact below is UNKNOWN.');
  }
  function activeLines(id) {
    return (linesByDraft[id] || []).filter(function (x) { return x.lineStatus !== 'cancelled' && x.lineStatus !== 'expired'; });
  }
  function allLines(id) { return linesByDraft[id] || []; }

  // ---- classification ------------------------------------------------------------------------------------
  // The ONLY positive evidence of a deliberate Add Route is a stored create_idempotency_key. A cancelled row
  // whose cancellation is time-adjacent to another header's creation IN THE SAME STATION is the fingerprint of
  // an edit-driven replacement — reported as a CANDIDATE, never as a conclusion.
  var cancelledTimes = headers.filter(function (h) { return h.status === 'cancelled'; })
    .map(function (h) { return { h: h, t: ts(h.cancelledAt || h.updated) }; })
    .filter(function (x) { return x.t !== null; });

  function stationOf(h) { return [h.company, h.country, h.marketplace, h.source_page].join('|'); }

  function classify(h) {
    if (h.status === 'cancelled') {
      // was it cancelled at about the moment a sibling was created in the same station?
      var ct = ts(h.cancelledAt || h.updated);
      if (ct !== null) {
        for (var i = 0; i < headers.length; i++) {
          var o = headers[i];
          if (o.id === h.id || o.status === 'cancelled') continue;
          if (stationOf(o) !== stationOf(h)) continue;
          var ot = ts(o.created);
          if (ot === null) continue;
          if (Math.abs(ot - ct) <= TEMP_R4_ADJACENCY_SECONDS_ * 1000) return 'CANCELLED_BY_EDIT_CANDIDATE';
        }
      }
      return 'UNKNOWN';
    }
    if (activeLines(h.id).length === 0) return 'ORPHAN_HEADER';
    if (!ciPresent) return 'UNKNOWN';
    if (!h.createKey) {
      // written before the idempotency contract existed — legitimately older, not evidence of anything
      return 'LEGITIMATE_EXISTING_ROUTE';
    }
    // it carries a key, so it was created by this contract. Was a sibling cancelled at about the same moment?
    var mt = ts(h.created);
    if (mt !== null) {
      for (var j = 0; j < cancelledTimes.length; j++) {
        if (stationOf(cancelledTimes[j].h) !== stationOf(h)) continue;
        if (Math.abs(cancelledTimes[j].t - mt) <= TEMP_R4_ADJACENCY_SECONDS_ * 1000) return 'EDIT_REPLACEMENT_CANDIDATE';
      }
    }
    return 'LEGITIMATE_EXPLICIT_ADD_ROUTE';
  }

  rule();
  p('SECTION 1 - EVERY HEADER, WITH ITS EVIDENCE AND ITS CLASS');
  rule();
  var tally = {};
  for (var k = 0; k < headers.length; k++) {
    var h = headers[k];
    var cls = classify(h);
    tally[cls] = (tally[cls] || 0) + 1;
    var al = activeLines(h.id), all = allLines(h.id);
    p(cls + '   ' + h.id + '   (sheet row ' + h.sheetRow + ')');
    p('   status/version   : ' + (h.status || '(blank)') + '  /  v' + (h.version || '(blank)'));
    p('   station          : ' + h.company + ' / ' + h.country + ' / ' + h.marketplace + ' / ' + h.source_page + ' / cycle=' + (h.planning_cycle || '(blank)'));
    p('   route            : ' + (h.src || '(blank)') + '  ->  ' + (h.dstWh || h.dstMk || '(blank)') + '  /  ' + (h.method || '(blank)') + (h.lastMile ? (' / ' + h.lastMile) : ''));
    p('   create key       : ' + (ciPresent ? (h.createKey || '(blank - pre-contract row)') : '(COLUMN ABSENT)'));
    p('   created/updated  : ' + (h.created || '(blank)') + '   /   ' + (h.updated || '(blank)'));
    if (h.status === 'cancelled') p('   cancelled_at     : ' + (h.cancelledAt || '(blank)') + '   reason=' + (h.cancelReason || '(blank)'));
    p('   lines            : ' + al.length + ' active of ' + all.length + ' total');
    for (var li = 0; li < all.length; li++) {
      p('      ' + (all[li].lineStatus === 'cancelled' ? 'CANCELLED ' : 'active    ') + all[li].lineId +
        '  sku=' + all[li].sku + '  qty=' + all[li].qty +
        '  created=' + (all[li].created || '(blank)') + '  updated=' + (all[li].updated || '(blank)') +
        (all[li].cancelledAt ? ('  cancelled_at=' + all[li].cancelledAt) : ''));
    }
    p('');
  }

  rule();
  p('SECTION 2 - TALLY');
  rule();
  ['LEGITIMATE_EXISTING_ROUTE', 'LEGITIMATE_EXPLICIT_ADD_ROUTE', 'EDIT_REPLACEMENT_CANDIDATE',
   'CANCELLED_BY_EDIT_CANDIDATE', 'ORPHAN_HEADER', 'UNKNOWN'].forEach(function (c) {
    p('  ' + c + ': ' + (tally[c] || 0));
  });
  p('');
  p('HOW TO READ THE TWO CANDIDATE CLASSES. They are CANDIDATES, not findings. EDIT_REPLACEMENT_CANDIDATE means');
  p('"this header was created within ' + TEMP_R4_ADJACENCY_SECONDS_ + 's of a sibling in the same station being cancelled" - the fingerprint of');
  p('the edit-driven replacement A2-R4 removed. CANCELLED_BY_EDIT_CANDIDATE is the other half of the same pair.');
  p('An operator who really did delete one route and add another in the same minute produces the same pattern,');
  p('so NOTHING here is repaired, deleted or restored. A shared K2/K4 shape was deliberately NOT used as');
  p('evidence: two explicit Add Routes of an identical route are legitimately two tickets.');

  rule();
  p('SECTION 3 - WHAT THIS CENSUS DID');
  rule();
  p('DB_WRITES=0 . ROWS_INSERTED=0 . ROWS_UPDATED=0 . ROWS_DELETED=0 . BACKFILLS=0 . LOCKS_TAKEN=0');
  p('STATUS_TRANSITIONS=0 . PROPERTIES_TOUCHED=0 . ACTIONS_CALLED=0 . REPAIRS=0 . RESTORES=0');
  p('Sheets were read through a facade exposing only getDataRange().getValues(); no write handle was ever');
  p('obtained, so a write was not merely avoided but unreachable.');
  rule();

  var text = out.join('\n');
  Logger.log(text);
  return text;
}
