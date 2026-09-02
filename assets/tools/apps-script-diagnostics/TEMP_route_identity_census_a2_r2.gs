/**
 * TEMP — F1-7N-FB-4G-A2-R2 §10 + ADDENDUM §5 — ROUTE IDENTITY / ACCIDENTAL-HEADER CENSUS.
 *
 * READ ONLY. One entry point, no parameters:
 *
 *     TEMP_ROUTE_IDENTITY_CENSUS_A2_R2()
 *
 * PASTE → RUN → REMOVE. Nothing here writes, deletes, transitions a status, back-fills a value, takes a lock,
 * touches Properties, creates a Drive file, sends mail, or calls a submit/upsert action. Every sheet is handed
 * to the reporter wrapped in a façade that exposes ONLY getDataRange().getValues(), so the mutators are
 * UNREACHABLE rather than merely unused — a later edit cannot accidentally write through this file.
 *
 * It requires the PRODUCTION identity functions and carries no copy of them. If a symbol is missing it prints
 * AUTHORITY_NOT_LOADED and classifies nothing, because a census that guesses is worse than no census.
 *
 * WHAT IT ANSWERS (and where it refuses to guess, it prints UNKNOWN):
 *   · the five named headers, their route fields, versions, timestamps, natural key and stored-vs-deterministic id
 *   · every CO1100-R line, its FK, its qty, and which header it actually sits under
 *   · whether a qty of 120 exists anywhere (the Add Route the operator believed failed)
 *   · whether either 800 was rewritten
 *   · whether any line was placed under a zero-line legacy header
 *   · a write count DERIVED FROM THE CELLS (created_at vs updated_at), never assumed to be zero
 *   · whether anything downstream references these drafts
 */

var TEMP_A2R2_HEADER_IDS_ = [
  'SADH-K2-E7AF9242',
  'SADH-K2-179FBB0E',
  'SADH-K2-C3E2031A',
  'SAD-C787D1B1-D',
  'SAD-27976058-2'
];
var TEMP_A2R2_SKU_ = 'CO1100-R';

function TEMP_ROUTE_IDENTITY_CENSUS_A2_R2() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }

  p('TEMP ROUTE IDENTITY CENSUS - F1-7N-FB-4G-A2-R2 - READ ONLY');
  p('generated_at (script clock): ' + new Date().toISOString());
  rule();

  // ---- the production authorities this census refuses to reimplement ---------------------------------------
  var need = ['sadK2GroupKey_', 'sadK2DeterministicHeaderId_', 'sadDestinationIdentity_',
    'sadHeaderRouteIsComplete_', 'sadRowToObject_'];
  var missing = [];
  for (var n = 0; n < need.length; n++) {
    try { if (typeof this[need[n]] !== 'function' && eval('typeof ' + need[n]) !== 'function') missing.push(need[n]); }
    catch (e) { missing.push(need[n]); }
  }
  if (missing.length) {
    p('AUTHORITY_NOT_LOADED: ' + missing.join(', '));
    p('This census classifies NOTHING without the production identity functions. Open the Apps Script project');
    p('that contains 16_shipping_allocation_handlers.gs and run it there.');
    p('BLOCKED');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Read-only façade: the ONLY thing a caller can do with a sheet here is read all of its values.
  function readOnly(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return null;
    return { getDataRange: function () { return { getValues: function () { return sh.getDataRange().getValues(); } }; } };
  }
  function table(name) {
    var ro = readOnly(name);
    if (!ro) return null;
    var v = ro.getDataRange().getValues();
    if (!v || v.length < 1) return { headers: [], rows: [] };
    var hdr = v[0].map(function (x) { return String(x).trim(); });
    var rows = [];
    for (var r = 1; r < v.length; r++) {
      var o = {}, blank = true;
      for (var c = 0; c < hdr.length; c++) {
        if (!hdr[c]) continue;
        o[hdr[c]] = v[r][c];
        if (String(v[r][c]).trim() !== '') blank = false;
      }
      if (!blank) { o.__row = r + 1; rows.push(o); }
    }
    return { headers: hdr, rows: rows };
  }
  function S(v) { return String(v == null ? '' : v).trim(); }
  function mask(id) { var s = S(id); return s.length <= 8 ? s : (s.substring(0, 6) + '...' + s.substring(s.length - 4)); }

  var H = table('shipping_allocation_drafts');
  var L = table('shipping_allocation_draft_lines');
  if (!H || !L) {
    p('BLOCKED - shipping_allocation_drafts or shipping_allocation_draft_lines is not present in this spreadsheet.');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }
  p('shipping_allocation_drafts      : ' + H.rows.length + ' data row(s), ' + H.headers.length + ' column(s)');
  p('shipping_allocation_draft_lines : ' + L.rows.length + ' data row(s), ' + L.headers.length + ' column(s)');
  var hasVersion = H.headers.indexOf('draft_version') !== -1;
  var hasDestMkt = H.headers.indexOf('destination_marketplace') !== -1;
  p('header has draft_version column          : ' + hasVersion);
  p('header has destination_marketplace column: ' + hasDestMkt);
  rule();

  // ============================================================================================================
  p('SECTION 1 - THE FIVE NAMED HEADERS');
  // ============================================================================================================
  var byId = {};
  H.rows.forEach(function (h) {
    var id = S(h.allocation_draft_id);
    if (!id) return;
    (byId[id] = byId[id] || []).push(h);
  });

  TEMP_A2R2_HEADER_IDS_.forEach(function (id) {
    p('');
    p('HEADER ' + id);
    var hits = byId[id] || [];
    if (!hits.length) { p('  NOT PRESENT in shipping_allocation_drafts.'); return; }
    if (hits.length > 1) p('  WARNING: ' + hits.length + ' PHYSICAL ROWS share this primary key.');
    hits.forEach(function (h, i) {
      var det = '', nat = '', complete = '', dest = '';
      try { nat = sadK2GroupKey_(h); } catch (e) { nat = 'UNKNOWN'; }
      try { det = sadK2DeterministicHeaderId_(h); } catch (e) { det = 'UNKNOWN'; }
      try { complete = String(sadHeaderRouteIsComplete_(h)); } catch (e) { complete = 'UNKNOWN'; }
      try { var d = sadDestinationIdentity_(h); dest = d.ok ? (d.type + ':' + S(d.id)) : ('UNRESOLVED:' + S(d.code)); }
      catch (e) { dest = 'UNKNOWN'; }
      p('  physical row            : ' + h.__row + (hits.length > 1 ? (' (copy ' + (i + 1) + ' of ' + hits.length + ')') : ''));
      p('  status                  : ' + S(h.status));
      p('  company/country/mkt     : ' + S(h.company) + ' / ' + S(h.country) + ' / ' + S(h.marketplace));
      p('  From (id / code)        : ' + S(h.recommended_source_warehouse_id) + ' / ' + S(h.recommended_source_warehouse_code_snapshot));
      p('  To warehouse (id / code): ' + S(h.recommended_destination_warehouse_id) + ' / ' + S(h.recommended_destination_warehouse_code_snapshot));
      p('  To marketplace          : ' + (hasDestMkt ? S(h.destination_marketplace) : 'COLUMN ABSENT'));
      p('  canonical destination   : ' + dest);
      p('  Method / Last Mile      : ' + S(h.recommended_shipping_method) + ' / ' + S(h.recommended_last_mile_delivery));
      p('  route complete          : ' + complete);
      p('  draft_version           : ' + (hasVersion ? S(h.draft_version) : 'COLUMN ABSENT'));
      p('  generation_type         : ' + S(h.generation_type) + '   source_page: ' + S(h.source_page));
      p('  created_by / created_at : ' + S(h.created_by) + ' / ' + S(h.created_at));
      p('  updated_by / updated_at : ' + S(h.updated_by) + ' / ' + S(h.updated_at));
      p('  natural (K4) key        : ' + nat);
      p('  deterministic id of key : ' + det);
      // §4 - REPORTED, NEVER A VERDICT OF CORRUPTION. After a legitimate UPDATE an entity id is EXPECTED not to
      // hash to its own current fields, because the id names the entity and not its contents.
      p('  id === hash(key)        : ' + (det === id) +
        (det === id ? '' : '   <- EXPECTED after a legal route edit; NOT evidence of corruption (A2-R2 §4)'));
      // A write count derived from the cells themselves. It is a LOWER BOUND: the sheet records only the last
      // update, so "written at least twice" is provable and "written exactly N times" is not.
      var ca = S(h.created_at), ua = S(h.updated_at);
      p('  writes provable from cells: ' + (!ca && !ua ? 'UNKNOWN (no timestamps)'
        : (ca === ua ? 'created only (created_at === updated_at) - at least 1'
          : 'created THEN updated at least once (created_at !== updated_at) - at least 2')));
    });
  });

  // ============================================================================================================
  rule();
  p('SECTION 2 - EVERY ' + TEMP_A2R2_SKU_ + ' LINE, AND THE HEADER IT ACTUALLY SITS UNDER');
  // ============================================================================================================
  var mine = L.rows.filter(function (l) { return S(l.sku) === TEMP_A2R2_SKU_; });
  p('lines for ' + TEMP_A2R2_SKU_ + ': ' + mine.length);
  var pkSeen = {}, qty120 = [], qty800 = [], linesByHeader = {};
  mine.forEach(function (l) {
    var pk = S(l.allocation_draft_line_id);
    var fk = S(l.allocation_draft_id);
    (pkSeen[pk] = pkSeen[pk] || []).push(l.__row);
    (linesByHeader[fk] = linesByHeader[fk] || []).push(l);
    var q = S(l.planned_qty);
    if (q === '120') qty120.push(l);
    if (q === '800') qty800.push(l);
    var host = (byId[fk] || [])[0];
    p('');
    p('  LINE ' + pk + '   (physical row ' + l.__row + ')');
    p('    FK allocation_draft_id : ' + fk + (host ? '' : '   <- ORPHAN: no such header row'));
    p('    line_status            : ' + S(l.line_status));
    p('    planned_qty            : ' + S(l.planned_qty) + '   recommended_qty: ' + S(l.recommended_qty));
    p('    site_sku / window_code : ' + S(l.site_sku) + ' / ' + S(l.window_code));
    p('    route_no               : ' + S(l.route_no));
    p('    line source_warehouse  : ' + S(l.source_warehouse_id));
    p('    created_at / updated_at: ' + S(l.created_at) + ' / ' + S(l.updated_at));
    if (host) {
      p('    host header route      : ' + S(host.recommended_source_warehouse_id) + ' -> ' +
        (hasDestMkt && S(host.destination_marketplace) ? ('MKT:' + S(host.destination_marketplace))
          : ('WH:' + S(host.recommended_destination_warehouse_id))) +
        ' / ' + S(host.recommended_shipping_method));
      p('    host header status     : ' + S(host.status));
      var hostComplete = 'UNKNOWN';
      try { hostComplete = String(sadHeaderRouteIsComplete_(host)); } catch (e) {}
      p('    host route complete    : ' + hostComplete +
        (hostComplete === 'false' ? '   <- A LINE UNDER A ROUTE-INCOMPLETE (legacy/zero-line-shaped) HEADER' : ''));
    }
  });
  var dupPk = Object.keys(pkSeen).filter(function (k) { return pkSeen[k].length > 1; });
  p('');
  p('  duplicate line primary keys: ' + (dupPk.length ? dupPk.map(function (k) { return k + ' x' + pkSeen[k].length + ' (rows ' + pkSeen[k].join(',') + ')'; }).join('; ') : 'none'));

  // ============================================================================================================
  rule();
  p('SECTION 3 - THE ADDENDUM QUESTIONS, ANSWERED FROM CELLS ONLY');
  // ============================================================================================================
  p('Q. Does a planned_qty of 120 exist on ANY ' + TEMP_A2R2_SKU_ + ' line?');
  p('   ' + (qty120.length
    ? ('YES - ' + qty120.length + ' line(s): ' + qty120.map(function (l) { return S(l.allocation_draft_line_id) + ' under ' + S(l.allocation_draft_id) + ' (row ' + l.__row + ')'; }).join('; '))
    : 'NO - the Add Route quantity reached no line in this table.'));
  p('');
  p('Q. Were the two 800s rewritten?');
  if (!qty800.length) {
    p('   NO 800 line is present. UNKNOWN whether one was rewritten to another value - this table records only');
    p('   the current value, so a previous quantity cannot be recovered from it.');
  } else {
    qty800.forEach(function (l) {
      var ca = S(l.created_at), ua = S(l.updated_at);
      p('   ' + S(l.allocation_draft_line_id) + ' = 800, ' + (ca === ua ? 'never updated since creation'
        : 'UPDATED after creation (created ' + ca + ', updated ' + ua + ') - the value is 800 NOW; whether it changed and returned is UNKNOWN'));
    });
  }
  p('');
  p('Q. Was any line placed under a zero-line legacy header?');
  var legacyHosts = [];
  Object.keys(linesByHeader).forEach(function (fk) {
    var host = (byId[fk] || [])[0];
    if (!host) return;
    var ok = true;
    try { ok = !!sadHeaderRouteIsComplete_(host); } catch (e) { return; }
    if (!ok) legacyHosts.push(fk);
  });
  p('   ' + (legacyHosts.length ? ('YES - ' + legacyHosts.join(', ')) : 'NO - every host header carries a complete route.'));
  p('');
  p('Q. How many headers does this station hold with NO active line of their own?');
  var zeroLine = [];
  H.rows.forEach(function (h) {
    var id = S(h.allocation_draft_id);
    var st = S(h.status).toLowerCase();
    if (!id || st === 'cancelled' || st === 'expired' || st === 'submitted') return;
    var any = L.rows.filter(function (l) {
      return S(l.allocation_draft_id) === id && S(l.line_status).toLowerCase() !== 'cancelled';
    });
    if (!any.length) zeroLine.push(id + ' (' + S(h.company) + '/' + S(h.country) + '/' + S(h.marketplace) + ', ' + S(h.recommended_shipping_method) + ')');
  });
  p('   ' + (zeroLine.length ? zeroLine.join('; ') : 'none'));

  // ============================================================================================================
  rule();
  p('SECTION 3b - F1-7N-FB-4G-A2-R3 SS.J - CLASSIFICATION BY EVIDENCE, NEVER BY K2/K4 SHAPE');
  // ============================================================================================================
  p('Four buckets. A row goes in one only when the CELLS prove it; everything else is UNKNOWN, and an UNKNOWN');
  p('row is not a candidate for anything. Two headers sharing a K4 shape is NOT evidence of a duplicate -');
  p('A2-R3 SS.B.2 makes two identical tickets legal - so shape is deliberately not used to classify.');
  var buckets = { ZERO_LINE_HEADER: [], EXPLICIT_ADD_ROUTE: [], EDIT_ARTEFACT_CANDIDATE: [], UNKNOWN: [] };
  var hasCreateKey = H.headers.indexOf('create_idempotency_key') !== -1;
  p('');
  p('  header has create_idempotency_key column: ' + hasCreateKey +
    (hasCreateKey ? '' : '   <- pre-migration: NO row can prove it was an explicit Add Route'));
  // Every SKU that is LIVE (non-cancelled line) under some header, so a cancelled-only header can be checked
  // for "its SKU is alive somewhere else" - the exact trace the old identity-erasing edit left behind.
  var liveSkuHeaders = {};
  L.rows.forEach(function (l) {
    if (S(l.line_status).toLowerCase() === 'cancelled') return;
    var k = S(l.sku).toLowerCase(); if (!k) return;
    (liveSkuHeaders[k] = liveSkuHeaders[k] || {})[S(l.allocation_draft_id)] = 1;
  });
  H.rows.forEach(function (h) {
    var id = S(h.allocation_draft_id); if (!id) return;
    var st = S(h.status).toLowerCase();
    if (st === 'submitted' || st === 'expired') return;             // history, not a repair candidate
    var mineL = L.rows.filter(function (l) { return S(l.allocation_draft_id) === id; });
    var activeL = mineL.filter(function (l) { return S(l.line_status).toLowerCase() !== 'cancelled'; });
    var key = hasCreateKey ? S(h.create_idempotency_key) : '';
    var why = '';
    if (!mineL.length) {
      why = 'no line row of ANY status references this header';
      buckets.ZERO_LINE_HEADER.push(id + ' [' + st + '] - ' + why);
    } else if (!activeL.length) {
      // Only cancelled lines. If one of those SKUs is ALIVE under a different header, the line was released
      // from here and re-created there - which is precisely what the pre-A2-R2 edit path did.
      var moved = [];
      mineL.forEach(function (l) {
        var sk = S(l.sku).toLowerCase();
        var hosts = Object.keys(liveSkuHeaders[sk] || {}).filter(function (x) { return x && x !== id; });
        if (hosts.length) moved.push(S(l.sku) + ' -> ' + hosts.join(','));
      });
      if (moved.length) {
        buckets.EDIT_ARTEFACT_CANDIDATE.push(id + ' [' + st + '] - every line here is CANCELLED and its SKU is live elsewhere: ' + moved.join('; '));
      } else {
        buckets.UNKNOWN.push(id + ' [' + st + '] - only cancelled lines, and no SKU of theirs is live elsewhere: cannot prove why');
      }
    } else if (key) {
      buckets.EXPLICIT_ADD_ROUTE.push(id + ' [' + st + '] - carries create_idempotency_key ' + mask(key) + ', so a click created it');
    } else {
      buckets.UNKNOWN.push(id + ' [' + st + '] - ' + activeL.length + ' active line(s) and NO create key' +
        (hasCreateKey ? ' (created before the key contract, or by another path)' : ' (column absent)'));
    }
  });
  ['ZERO_LINE_HEADER', 'EXPLICIT_ADD_ROUTE', 'EDIT_ARTEFACT_CANDIDATE', 'UNKNOWN'].forEach(function (b) {
    p('');
    p('  ' + b + ' (' + buckets[b].length + ')');
    if (!buckets[b].length) p('    (none)');
    else buckets[b].forEach(function (x) { p('    . ' + x); });
  });
  p('');
  p('  NOTE: EDIT_ARTEFACT_CANDIDATE is a CANDIDATE, not a verdict. The evidence is stated beside each row so a');
  p('  human can agree or disagree with it. No row is repaired, and none may be repaired from this output alone.');

  // ============================================================================================================
  rule();
  p('SECTION 4 - DOWNSTREAM REFERENCES (is any of this already committed?)');
  // ============================================================================================================
  var SP = table('shipping_plan_lines') || table('shipping_plan_line');
  if (!SP) {
    p('shipping_plan_lines is not present in this spreadsheet - downstream state UNKNOWN.');
  } else {
    var refs = [];
    SP.rows.forEach(function (r) {
      var blob = '';
      Object.keys(r).forEach(function (k) { if (k !== '__row') blob += ' ' + S(r[k]); });
      TEMP_A2R2_HEADER_IDS_.forEach(function (id) { if (blob.indexOf(id) !== -1) refs.push(id + ' <- shipping_plan_lines row ' + r.__row); });
      mine.forEach(function (l) {
        var pk = S(l.allocation_draft_line_id);
        if (pk && blob.indexOf(pk) !== -1) refs.push(pk + ' <- shipping_plan_lines row ' + r.__row);
      });
    });
    p('references found: ' + (refs.length ? refs.join('; ') : 'none - nothing here has been submitted downstream'));
  }

  // ============================================================================================================
  rule();
  p('SECTION 5 - WHAT THIS CENSUS DID');
  // ============================================================================================================
  p('DB_WRITES=0 . STATUS_TRANSITIONS=0 . ROWS_DELETED=0 . ROWS_INSERTED=0 . CELLS_WRITTEN=0');
  p('BACKFILLS=0 . MERGES=0 . IDS_MINTED=0 . LOCKS=0 . PROPERTIES_WRITES=0 . DRIVE_WRITES=0 . EMAILS=0');
  p('Every sheet was read through a façade exposing only getDataRange().getValues(); no mutator was reachable.');
  p('');
  p('NO REPAIR WAS PERFORMED AND NONE IS AUTHORISED BY THIS OUTPUT. Any repair needs a separate, reviewed plan');
  p('and its own explicit authorisation. Remove this file from the project when you have copied the output.');

  Logger.log(out.join('\n'));
  return out.join('\n');
}
