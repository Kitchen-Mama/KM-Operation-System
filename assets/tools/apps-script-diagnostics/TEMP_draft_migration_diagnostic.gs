/**
 * TEMP_draft_migration_diagnostic.gs — F1-7N-FA-3C-DRAFT-MODEL-R3 (paste-ready, READ-ONLY).
 *
 * PASTE-READY / NOT PART OF THE RUNTIME BUNDLE. The USER pastes this ONE function into the bound Apps Script project
 * and runs TEMP_diagnoseDraftMigrationReadiness_() once, in R3, to assess whether the live legacy
 * request_order_allocation_drafts / request_order_allocation_draft_lines data can be flattened to the V2 model.
 *
 * It is FULLY SELF-CONTAINED: it does NOT depend on KMRDV2 / KMRDV2P / any generated bundle being present (so it runs
 * even before the V2 bundle is synced). It is strictly READ-ONLY — getSheetByName + getDataRange().getValues() only;
 * it NEVER creates, writes, or repairs any Sheet, and it changes NO live data. After R3 it is deleted (never committed
 * as runtime). The classifier logic mirrors KMRDV2.summarizeMigration but is inlined here so nothing external is needed.
 */
function TEMP_diagnoseDraftMigrationReadiness_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function readObjects_(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return { present: false, headers: [], rows: [] };
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 1) return { present: true, headers: [], rows: [] };
    var headers = values[0].map(function (h) { return String(h).trim(); });
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var o = {}, blank = true;
      for (var c = 0; c < headers.length; c++) { o[headers[c]] = values[r][c]; if (String(values[r][c]).trim() !== '') blank = false; }
      if (!blank) rows.push(o);
    }
    return { present: true, headers: headers, rows: rows };
  }
  function s_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nn_(v) { var n = Number(v); return (isFinite(n) && n > 0) ? n : 0; }
  function idFamily_(id) { var s = s_(id); if (/^RD::/.test(s)) return 'RD'; if (/^RAD-/.test(s)) return 'RAD'; if (/^RAL-/.test(s)) return 'RAL'; return s ? 'UNKNOWN' : 'BLANK'; }
  function classify_(header, lines) {
    lines = lines || []; var byTier = { T1: [], T2: [], T3: [], T4: [], OTHER: [] };
    lines.forEach(function (l) { var b = s_(l.request_bucket).toUpperCase(); (byTier[b] || byTier.OTHER).push(l); });
    var reasons = [];
    if (!header) reasons.push('ORPHAN_LINE_NO_HEADER');
    if (byTier.T4.length > 0) reasons.push('T4_PRESENT');
    ['T1', 'T2', 'T3'].forEach(function (t) { if (byTier[t].length > 1) reasons.push('DUPLICATE_' + t); });
    var fam = idFamily_(header && header.request_allocation_draft_id);
    if (fam === 'RAL' || fam === 'UNKNOWN') reasons.push('UNRECOGNIZED_ID_' + fam);
    var upcs = {}; lines.forEach(function (l) { var u = s_(l.units_per_carton); if (u !== '') upcs[u] = 1; });
    if (Object.keys(upcs).length > 1) reasons.push('INCONSISTENT_UNITS_PER_CARTON');
    var actionable = false; lines.forEach(function (l) { if (nn_(l.recommended_qty) > 0 || nn_(l.order_qty) > 0) actionable = true; });
    if (header && lines.length === 0 && actionable) reasons.push('ACTIONABLE_HEADER_ZERO_LINES');
    var klass = reasons.length ? 'NEEDS_MANUAL_REVIEW' : 'MIGRATION_SAFE';
    if (fam === 'RAL') klass = 'NEEDS_MANUAL_REVIEW';
    return { classification: klass, reasons: reasons, idFamily: fam };
  }
  var ACTIVE_HEADER = { draft: 1, partially_submitted: 1, site_confirmed: 1 };
  function detectConflicts_(headers) {
    var byKey = {}, conflicts = [];
    (headers || []).forEach(function (h) {
      if (!ACTIVE_HEADER[s_(h.status)]) return;
      var k = [s_(h.company), s_(h.country), s_(h.marketplace), s_(h.sku), s_(h.draft_purpose), s_(h.planning_cycle)].join('|');
      (byKey[k] = byKey[k] || []).push(s_(h.request_allocation_draft_id));
    });
    Object.keys(byKey).forEach(function (k) { if (byKey[k].length > 1) conflicts.push({ naturalScope: k, draftIds: byKey[k] }); });
    return conflicts;
  }

  var H = readObjects_('request_order_allocation_drafts');
  var L = readObjects_('request_order_allocation_draft_lines');
  var headers = H.rows, linesByDraftId = {};
  L.rows.forEach(function (l) { var id = s_(l.request_allocation_draft_id); (linesByDraftId[id] = linesByDraftId[id] || []).push(l); });

  var out = { GENERATED_AT_NOTE: 'read-only R3 diagnostic; no mutation performed',
    DRAFTS_TAB_PRESENT: H.present, LINES_TAB_PRESENT: L.present,
    TOTAL_HEADERS: headers.length, RD_HEADERS: 0, RAD_HEADERS: 0, UNKNOWN_HEADERS: 0,
    HEADERS_WITH_0_LINES: 0, HEADERS_WITH_1_LINE: 0, HEADERS_WITH_2_LINES: 0, HEADERS_WITH_3_LINES: 0, HEADERS_WITH_GT3_LINES: 0,
    DUPLICATE_T1: 0, DUPLICATE_T2: 0, DUPLICATE_T3: 0, T4_PRESENT: 0, ORPHAN_LINES: 0,
    ACTIVE: 0, PARTIALLY_SUBMITTED: 0, SUBMITTED: 0, CANCELLED: 0, ALL_ZERO: 0, ACTIONABLE: 0, USER_EDITED: 0,
    MIGRATION_SAFE: 0, NEEDS_MANUAL_REVIEW: 0, BLOCKED_CONFLICT: 0, review: [], conflicts: [] };

  var conflicts = detectConflicts_(headers), conflictIds = {};
  conflicts.forEach(function (c) { c.draftIds.forEach(function (id) { conflictIds[id] = c.naturalScope; }); });
  out.conflicts = conflicts; out.BLOCKED_CONFLICT = conflicts.reduce(function (a, c) { return a + c.draftIds.length; }, 0);

  headers.forEach(function (h) {
    var id = s_(h.request_allocation_draft_id), fam = idFamily_(id), lines = linesByDraftId[id] || [];
    if (fam === 'RD') out.RD_HEADERS++; else if (fam === 'RAD') out.RAD_HEADERS++; else out.UNKNOWN_HEADERS++;
    var n = lines.length;
    out['HEADERS_WITH_' + (n === 0 ? '0_LINES' : n === 1 ? '1_LINE' : n === 2 ? '2_LINES' : n === 3 ? '3_LINES' : 'GT3_LINES')]++;
    var byTier = { T1: 0, T2: 0, T3: 0, T4: 0 };
    lines.forEach(function (l) { var b = s_(l.request_bucket).toUpperCase(); if (byTier[b] !== undefined) byTier[b]++; });
    if (byTier.T1 > 1) out.DUPLICATE_T1++; if (byTier.T2 > 1) out.DUPLICATE_T2++; if (byTier.T3 > 1) out.DUPLICATE_T3++;
    if (byTier.T4 > 0) out.T4_PRESENT++;
    var st = s_(h.status);
    if (st === 'cancelled') out.CANCELLED++; else if (st === 'submitted') out.SUBMITTED++;
    else if (st === 'partially_submitted') out.PARTIALLY_SUBMITTED++; else out.ACTIVE++;
    var actionable = false, edited = false;
    lines.forEach(function (l) { if (nn_(l.recommended_qty) > 0 || nn_(l.order_qty) > 0) actionable = true; if (l.user_edited === true || s_(l.user_edited).toUpperCase() === 'TRUE') edited = true; });
    if (actionable) out.ACTIONABLE++; else out.ALL_ZERO++;
    if (edited) out.USER_EDITED++;
    var c = classify_(h, lines);
    if (conflictIds[id]) { out.review.push({ id: id, scope: conflictIds[id], classification: 'BLOCKED_CONFLICT', reasons: ['ACTIVE_DUPLICATE'] }); }
    else if (c.classification === 'MIGRATION_SAFE') out.MIGRATION_SAFE++;
    else { out.NEEDS_MANUAL_REVIEW++; out.review.push({ id: id, scope: [s_(h.company), s_(h.country), s_(h.marketplace), s_(h.sku), s_(h.planning_cycle)].join('|'), classification: c.classification, reasons: c.reasons }); }
  });

  var headerIdSet = {}; headers.forEach(function (h) { headerIdSet[s_(h.request_allocation_draft_id)] = 1; });
  out.ORPHAN_LINES = Object.keys(linesByDraftId).filter(function (id) { return !headerIdSet[id] && (linesByDraftId[id] || []).length > 0; }).length;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
