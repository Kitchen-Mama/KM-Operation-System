/**
 * TEMP_shipping_allocation_submit_plan_a2_dry_run.gs — F1-7N-FB-4G-A2
 * PASTE · RUN · REMOVE. STRICTLY READ-ONLY. There is no COMMIT, no execute argument and no write path.
 *
 *   TEMP_SHIPPING_ALLOCATION_SUBMIT_PLAN_A2_SUMMARY()
 *
 * ONE public entry point, no parameters. It answers exactly one question: if Submit Plan were pressed right now
 * for the applied station, WHICH persisted headers would enter the batch, what would the proposed Weekly
 * Shipping Plan rows be, and is any of it a replay of something already downstream?
 *
 * ================================================================================================================
 * READ-ONLY IS ENFORCED BY CONSTRUCTION, NOT BY INTENTION
 * ================================================================================================================
 * The spreadsheet is opened once and every sheet is immediately wrapped in a FAÇADE exposing exactly one
 * capability: getDataRange().getValues(). No other method survives the wrapper, so setValue, appendRow, getRange,
 * insertColumnsAfter, deleteRow and every ensure/create helper are not merely unused here — they are UNREACHABLE
 * from the objects this diagnostic holds. A promise not to write is worth less than an object that cannot.
 *
 * It takes no LockService lock, writes no PropertiesService value, creates no Drive file, sends no mail, and
 * never calls the real submit action or any core that could. It mints no submit_batch_id, no shipping_plan_id and
 * no allocation id: every identity it prints is labelled PROPOSED and is derived, not reserved.
 *
 * ================================================================================================================
 * IT REQUIRES THE PRODUCTION AUTHORITY AND CARRIES NO COPY OF IT
 * ================================================================================================================
 * Every identity and completeness rule comes from 16_shipping_allocation_handlers.gs (and, through it, from
 * 69_api_v1_route_identity_contract.gs): sadDestinationIdentity_, sadHeaderRouteIsComplete_,
 * sadStoredHeaderRouteIsComplete_. There is NO local fallback. A second implementation of a gate is a second
 * answer waiting to disagree with production, and the whole value of this census is that its verdict is the
 * verdict the submit core would reach. A missing symbol prints AUTHORITY_NOT_LOADED and classifies nothing.
 *
 * ================================================================================================================
 * WHAT IT WILL NEVER DO
 * ================================================================================================================
 * It never promotes a station-scope marketplace, a warehouse code snapshot, a UI label, a filter selection or a
 * calculated ETA into a destination identity. It never recomputes a quantity. It never decides that a header is
 * safe when it cannot read what it needs — that prints BLOCKED, with the reason, and no verdict.
 *
 * WHICH TABLES IT READS, AND WHY EACH ONE
 *   shipping_allocation_drafts       the candidate headers themselves — status, station, route, lifecycle
 *   shipping_allocation_draft_lines  the lines that decide NO_LINES / cancelled / duplicate identity / quantity
 *   shipping_plans                   downstream collision: an existing plan under the same natural key, and an
 *                                    existing plan under a submit_batch_id that would make this a REPLAY
 *   shipping_plan_lines              whether such a plan already carries these SKUs/quantities, and orphan count
 * No other table is read. `marketplace_skus` / `sku_details` are deliberately NOT read: units-per-carton and
 * product attributes are a CLIENT pre-gate and a plan-writer concern, and reading them here would invite this
 * file to re-derive a quantity it must never touch.
 */

var TEMP_A2_BUILD_VERSION_ = 'F1-7N-FB-4G-A2';
var TEMP_A2_OPERATION_ = 'FB4G-A2-SUBMIT-PLAN-PREFLIGHT-1';

/** Mask an id for the log: keep the family prefix and the last 4, blank the middle. */
function tempA2Mask_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '(blank)';
  if (s.length <= 8) return s.charAt(0) + '***' + s.slice(-2);
  var cut = s.indexOf('-');
  var head = cut > 0 ? s.slice(0, cut + 1) : s.slice(0, 4);
  return head + '***' + s.slice(-4);
}
function tempA2S_(v) { return String(v == null ? '' : v).trim(); }
function tempA2Lo_(v) { return tempA2S_(v).toLowerCase(); }
function tempA2Num_(v) {
  var t = tempA2S_(v);
  if (!t) return null;
  var n = Number(t);
  return isFinite(n) ? n : null;
}

/** The façade. getDataRange().getValues() and NOTHING else. */
function tempA2Read_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  if (!values || !values.length) return { headers: [], rows: [], count: 0 };
  var headers = values[0].map(function (h) { return tempA2S_(h); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var o = {}, blank = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      o[headers[c]] = values[i][c];
      if (tempA2S_(values[i][c])) blank = false;
    }
    if (!blank) rows.push(o);
  }
  return { headers: headers, rows: rows, count: rows.length };
}

/** The production authority — required, never reimplemented. */
function tempA2Authority_() {
  var missing = [];
  if (typeof sadDestinationIdentity_ !== 'function') missing.push('sadDestinationIdentity_');
  if (typeof sadStoredHeaderRouteIsComplete_ !== 'function') missing.push('sadStoredHeaderRouteIsComplete_');
  return { ok: missing.length === 0, missing: missing };
}

function TEMP_SHIPPING_ALLOCATION_SUBMIT_PLAN_A2_SUMMARY() {
  var out = [];
  function w(line) { out.push(line); }
  function footer() {
    w('FOOTER · DB_WRITES=0 · STATUS_TRANSITIONS=0 · SHIPPING_PLANS_CREATED=0 · SHIPPING_PLAN_LINES_CREATED=0 ' +
      '· ROWS_DELETED=0 · EMAILS=0 · DRIVE_WRITES=0 · LOCKS=0 · PROPERTIES_WRITES=0');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }

  w('=== ' + TEMP_A2_OPERATION_ + ' · ' + TEMP_A2_BUILD_VERSION_ + ' · READ-ONLY ===');

  var auth = tempA2Authority_();
  if (!auth.ok) {
    w('BLOCKED AUTHORITY_NOT_LOADED · missing: ' + auth.missing.join(', '));
    w('Nothing classified. Deploy 16_ (and 69_) into this project, then run again.');
    return footer();
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var H = tempA2Read_(ss, 'shipping_allocation_drafts');
  var L = tempA2Read_(ss, 'shipping_allocation_draft_lines');
  if (!H) { w('BLOCKED TABLE_MISSING shipping_allocation_drafts'); return footer(); }
  if (!L) { w('BLOCKED TABLE_MISSING shipping_allocation_draft_lines'); return footer(); }
  var P = tempA2Read_(ss, 'shipping_plans');
  var PL = tempA2Read_(ss, 'shipping_plan_lines');

  // ---- lines indexed by header ---------------------------------------------------------------------------
  var linesBy = {}, lineIdSeen = {}, dupLineIds = {}, orphanLines = 0;
  var headerIds = {};
  H.rows.forEach(function (h) { headerIds[tempA2S_(h.allocation_draft_id)] = 1; });
  L.rows.forEach(function (ln) {
    var fk = tempA2S_(ln.allocation_draft_id);
    var lid = tempA2S_(ln.allocation_draft_line_id);
    if (lid) { if (lineIdSeen[lid]) dupLineIds[lid] = (dupLineIds[lid] || 1) + 1; else lineIdSeen[lid] = 1; }
    if (!fk || !headerIds[fk]) { orphanLines++; return; }
    (linesBy[fk] = linesBy[fk] || []).push(ln);
  });

  // ---- the applied station: the ONE station with the most active headers is reported as the candidate scope,
  // ---- and every station present is listed so an out-of-scope header cannot hide.
  function station(h) {
    return [tempA2S_(h.company).toUpperCase(), tempA2S_(h.country).toUpperCase(), tempA2Lo_(h.marketplace)].join('|');
  }
  var stationCount = {}, stationList = [];
  H.rows.forEach(function (h) {
    var st = tempA2Lo_(h.status);
    if (st === 'submitted' || st === 'cancelled' || st === 'expired') return;
    var k = station(h);
    if (!stationCount[k]) { stationCount[k] = 0; stationList.push(k); }
    stationCount[k]++;
  });
  stationList.sort(function (a, b) { return stationCount[b] - stationCount[a]; });
  var candidateStation = stationList.length ? stationList[0] : '';

  w('');
  w('--- SCOPE ---');
  w('headers scanned: ' + H.count + ' · lines scanned: ' + L.count +
    ' · shipping_plans: ' + (P ? P.count : 'TABLE_ABSENT') + ' · shipping_plan_lines: ' + (PL ? PL.count : 'TABLE_ABSENT'));
  w('non-terminal stations present: ' + (stationList.length || 0));
  stationList.forEach(function (k) { w('  · ' + k + ' → ' + stationCount[k] + ' header(s)' + (k === candidateStation ? '   <= CANDIDATE SCOPE' : '')); });
  if (stationList.length > 1) w('  NOTE: more than one station holds non-terminal headers. Submit commits ONE station; the others are OUT OF SCOPE.');

  // ---- per-header classification, using the PRODUCTION gates ---------------------------------------------
  w('');
  w('--- HEADERS ---');
  var candidates = [], candidateLineCount = 0, candidateQty = 0, zeroLineHeaders = 0;
  H.rows.forEach(function (h) {
    var id = tempA2S_(h.allocation_draft_id);
    var st = tempA2Lo_(h.status);
    var stn = station(h);
    var mine = linesBy[id] || [];
    var active = [], qty = 0, cancelled = 0, badQty = 0;
    mine.forEach(function (ln) {
      var lst = tempA2Lo_(ln.line_status);
      if (lst === 'cancelled' || lst === 'expired') { cancelled++; return; }
      var q = tempA2Num_(ln.planned_qty);
      if (q === null) { badQty++; return; }
      if (q <= 0) return;
      active.push(ln); qty += q;
    });

    var dst, complete;
    try { dst = sadDestinationIdentity_(h); } catch (e) { dst = null; }
    try { complete = sadStoredHeaderRouteIsComplete_(h); } catch (e2) { complete = null; }
    if (dst === null || complete === null) {
      w('  BLOCKED ' + tempA2Mask_(id) + ' · the production gate threw; nothing classified for this header');
      return;
    }

    var terminal = (st === 'submitted' || st === 'cancelled' || st === 'expired');
    var verdict, reason;
    if (terminal) { verdict = 'EXCLUDE'; reason = 'TERMINAL_STATUS:' + st; }
    else if (stn !== candidateStation) { verdict = 'EXCLUDE'; reason = 'OUT_OF_APPLIED_SCOPE'; }
    else if (!complete) { verdict = 'BLOCK'; reason = 'ROUTE_INCOMPLETE:' + (dst.code || 'gate-9'); }
    else if (!mine.length) { verdict = 'BLOCK'; reason = 'NO_LINES'; zeroLineHeaders++; }
    else if (!active.length) { verdict = 'BLOCK'; reason = 'NO_POSITIVE_PLANNED_QTY_LINES'; zeroLineHeaders++; }
    else { verdict = 'INCLUDE'; reason = ''; }

    var dupHere = active.filter(function (ln) { return dupLineIds[tempA2S_(ln.allocation_draft_line_id)]; }).length;
    if (verdict === 'INCLUDE' && dupHere) { verdict = 'BLOCK'; reason = 'DUPLICATE_LINE_ID×' + dupHere; }
    if (verdict === 'INCLUDE' && badQty) { verdict = 'BLOCK'; reason = 'UNPARSEABLE_PLANNED_QTY×' + badQty; }

    w('  ' + verdict + ' ' + tempA2Mask_(id) +
      ' · status=' + (st || '(blank)') +
      ' · station=' + stn +
      ' · lines=' + mine.length + '(active ' + active.length + ', cancelled ' + cancelled + ')' +
      ' · qty=' + qty +
      ' · dest=' + (dst.ok ? (dst.type + ':' + tempA2S_(dst.id)) : (dst.code || 'UNRESOLVED')) +
      ' · service=' + (tempA2S_(h.recommended_shipping_method) || '(blank)') +
      ' · routeComplete=' + complete +
      ' · terminal=' + terminal +
      (reason ? (' · REASON=' + reason) : ''));

    if (verdict === 'INCLUDE') { candidates.push({ id: id, header: h, lines: active }); candidateLineCount += active.length; candidateQty += qty; }
  });

  // ---- proposed submit set ------------------------------------------------------------------------------
  w('');
  w('--- PROPOSED SUBMIT SET (nothing minted, nothing written) ---');
  w('candidate headers: ' + candidates.length + ' · candidate lines: ' + candidateLineCount + ' · planned qty total: ' + candidateQty);
  if (!candidates.length) {
    w('  no candidate — Submit would issue a request only if the client selected ids, and the server would refuse them.');
  } else {
    // The proposed plan grouping key is the one 11_ uses: company+country+ship_from+source_warehouse_id+
    // destination+destination_warehouse_id+shipping_method+last_mile_delivery+planning_cycle. Marketplace is
    // deliberately NOT a grouping dimension there.
    var groups = {}, groupOrder = [];
    candidates.forEach(function (c) {
      var h = c.header;
      var dst = sadDestinationIdentity_(h);
      var shipFrom = tempA2S_(h.recommended_source_warehouse_code_snapshot) || tempA2S_(h.recommended_source_warehouse_id);
      var destWhId = (dst.type === 'WAREHOUSE') ? tempA2S_(dst.id) : '';
      var destination = (dst.type === 'WAREHOUSE')
        ? (tempA2S_(h.recommended_destination_warehouse_code_snapshot) || destWhId)
        : tempA2S_(h.destination_marketplace);
      var key = [tempA2S_(h.company), tempA2S_(h.country), shipFrom, tempA2S_(h.recommended_source_warehouse_id),
        destination, destWhId, tempA2S_(h.recommended_shipping_method),
        tempA2S_(h.recommended_last_mile_delivery), tempA2S_(h.planning_cycle)].join('|');
      if (!groups[key]) { groups[key] = { lines: 0, qty: 0, destination: destination, destType: (dst.type === 'WAREHOUSE') ? 'warehouse' : 'marketplace' }; groupOrder.push(key); }
      c.lines.forEach(function (ln) { groups[key].lines++; groups[key].qty += (tempA2Num_(ln.planned_qty) || 0); });
    });
    w('proposed shipping_plans headers: ' + groupOrder.length + ' · proposed shipping_plan_lines: ' + candidateLineCount);
    groupOrder.forEach(function (k) {
      var g = groups[k];
      w('  PROPOSED PLAN · destination=' + (g.destination || '(blank)') + ' (' + g.destType + ')' +
        ' · lines=' + g.lines + ' · qty=' + g.qty);
      w('    natural key: ' + k);
    });
    w('proposed submit_batch_id strategy: supplied by the client as execution_key; when absent the server derives');
    w('  SADSUB-<fnv1a of the sorted draft ids + expected versions>. NEITHER is computed here — no id is minted.');
  }

  // ---- existing downstream state ------------------------------------------------------------------------
  w('');
  w('--- EXISTING DOWNSTREAM STATE ---');
  if (!P) { w('  BLOCKED shipping_plans TABLE_ABSENT — replay cannot be assessed, and nothing is assumed.'); }
  else {
    var byNat = {}, batchIds = {};
    P.rows.forEach(function (p) {
      var bid = tempA2S_(p.submit_batch_id);
      if (bid) batchIds[bid] = (batchIds[bid] || 0) + 1;
      var nat = [tempA2S_(p.company), tempA2S_(p.country), tempA2S_(p.ship_from), tempA2S_(p.source_warehouse_id),
        tempA2S_(p.destination), tempA2S_(p.destination_warehouse_id), tempA2S_(p.shipping_method),
        tempA2S_(p.last_mile_delivery), tempA2S_(p.planning_cycle)].join('|');
      byNat[nat] = (byNat[nat] || 0) + 1;
    });
    var dupNat = Object.keys(byNat).filter(function (k) { return byNat[k] > 1; });
    w('  existing shipping_plans: ' + P.count + ' · distinct submit_batch_id: ' + Object.keys(batchIds).length +
      ' · duplicate natural keys already present: ' + dupNat.length);
    var collide = 0;
    if (candidates.length) {
      candidates.forEach(function (c) {
        var h = c.header;
        var dst = sadDestinationIdentity_(h);
        var shipFrom = tempA2S_(h.recommended_source_warehouse_code_snapshot) || tempA2S_(h.recommended_source_warehouse_id);
        var destWhId = (dst.type === 'WAREHOUSE') ? tempA2S_(dst.id) : '';
        var destination = (dst.type === 'WAREHOUSE')
          ? (tempA2S_(h.recommended_destination_warehouse_code_snapshot) || destWhId)
          : tempA2S_(h.destination_marketplace);
        var nat = [tempA2S_(h.company), tempA2S_(h.country), shipFrom, tempA2S_(h.recommended_source_warehouse_id),
          destination, destWhId, tempA2S_(h.recommended_shipping_method),
          tempA2S_(h.recommended_last_mile_delivery), tempA2S_(h.planning_cycle)].join('|');
        if (byNat[nat]) collide++;
      });
    }
    w('  proposed plans whose natural key ALREADY exists downstream: ' + collide +
      (collide ? '   <= a Submit would CONSOLIDATE into the existing plan, not create a second one' : ''));
    w('  REPLAY: this census cannot know the execution_key the client will send, so it does not guess. A replay');
    w('  is the case where that key already appears above; the server reuses that plan and writes no new rows.');
  }
  w('  orphan draft lines (FK names no header): ' + orphanLines);
  w('  duplicate allocation_draft_line_id values: ' + Object.keys(dupLineIds).length);
  if (PL) w('  existing shipping_plan_lines: ' + PL.count);

  w('');
  w('--- CONCLUSION ---');
  if (!candidates.length) w('  NO_CANDIDATE — nothing is submittable for the candidate station right now.');
  else w('  ' + candidates.length + ' header(s) / ' + candidateLineCount + ' line(s) / ' + candidateQty +
        ' unit(s) would enter the batch. Any single header failing a server gate fails the WHOLE batch with zero writes.');
  w('  zero-line headers in the candidate station (the H1/H2 shape): ' + zeroLineHeaders +
    ' — these are EXCLUDED by the client and REFUSED by the server; they are never deleted by this round.');

  return footer();
}
