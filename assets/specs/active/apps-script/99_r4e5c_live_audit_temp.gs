// F1-4B-FM6-R4E5C-LIVE — TEMPORARY read-only production diagnostic.
//
// PURPOSE: run the R4E5C historical collision audit against the LIVE spreadsheet. Reads + Logger.log
// ONLY — no cell writes, no appendRow/deleteRow/insertColumn, no sheetEnsureColumns_, no status change,
// no draft/Request-Order create/cancel, no PropertiesService/Lock/API mutation. Logic is reused verbatim
// from docs/planning/R4E5C_HISTORICAL_COLLISION_AUDIT.md (no redesign).
//
// NOT wired to the web-app router (no doGet/doPost action) — run MANUALLY from the Apps Script editor.
// Because these run manually and are never dispatched through the web app, NO new deployment version is
// required. DELETE this file after the audit is closed (it is a temporary tool, never shipped runtime code).

// §7 — verify ONLY whether request_order_line_sources physically has request_allocation_draft_id.
// Never adds the column (no insertColumn / no sheetEnsureColumns_).
function r4e5cSchemaColumnCheck() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('request_order_line_sources');
  if (!sh) { Logger.log('LIVE_SCHEMA_COLUMN_NOT_VERIFIED (sheet absent)'); return; }
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  Logger.log(h.indexOf('request_allocation_draft_id') !== -1
    ? 'LIVE_SCHEMA_COLUMN_PRESENT'
    : 'LIVE_SCHEMA_COLUMN_NOT_VERIFIED (column absent — runtime ensure will add it on next allocation Send)');
}

// §1-§5 — READ-ONLY historical collision audit. Reads + Logger.log only. Delete after running.
function r4e5cCollisionAudit() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function rows(name) {
    var sh = ss.getSheetByName(name); if (!sh) return { headers: [], data: [] };
    var v = sh.getDataRange().getValues(); if (v.length < 2) return { headers: (v[0] || []).map(String), data: [] };
    var h = v[0].map(function (x) { return String(x).trim(); });
    var out = []; for (var i = 1; i < v.length; i++) { var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = v[i][c]; out.push(o); }
    return { headers: h, data: out };
  }
  function s(v) { return String(v == null ? '' : v).trim(); }
  function lc(v) { return s(v).toLowerCase(); }

  var drafts = rows('request_order_allocation_drafts').data;
  var orders = rows('request_orders');
  var srcs   = rows('request_order_line_sources');
  var ACTIVE = { draft: 1, site_confirmed: 1 };

  // §1 ACTIVE collision by proven grain (company+country+marketplace+sku+planning_cycle)
  var byGrain = {};
  drafts.forEach(function (d) {
    if (!ACTIVE[lc(d.status)]) return;
    var k = [lc(d.company), lc(d.country), lc(d.marketplace), lc(d.sku), s(d.planning_cycle)].join('|');
    (byGrain[k] = byGrain[k] || []).push(d);
  });
  var collisions = [];
  Object.keys(byGrain).forEach(function (k) { if (byGrain[k].length > 1) collisions.push({ grain: k, rows: byGrain[k] }); });

  // §2 Request Order duplicate audit — split NEW (ROEXEC) vs LEGACY (blank source_ref_id, never weak-deduped)
  var ROTYPE = 'request_order_allocation_batch';
  var execGroups = {}, legacyUnresolved = 0, roexecCount = 0;
  orders.data.forEach(function (r) {
    var t = s(r.source_ref_type), id = s(r.source_ref_id), st = lc(r.request_status);
    if (st === 'cancelled') return;
    if (t === ROTYPE && id.indexOf('ROEXEC-') === 0) { roexecCount++; (execGroups[id] = execGroups[id] || []).push(r); }
    else if (!id) { legacyUnresolved++; } // LEGACY_EXECUTION_IDENTITY_UNRESOLVED
  });
  var dupExec = Object.keys(execGroups).filter(function (id) { return execGroups[id].length > 1; })
    .map(function (id) { return { execution_key: id, request_order_nos: execGroups[id].map(function (r) { return s(r.request_order_no); }) }; });

  // §3 lineage integrity
  var draftIdSet = {}; drafts.forEach(function (d) { draftIdSet[s(d.request_allocation_draft_id)] = 1; });
  var lineageByDraft = {}, dangling = [], roWithSources = {};
  srcs.data.forEach(function (r) {
    var did = s(r.request_allocation_draft_id), roId = s(r.request_order_id);
    if (roId) roWithSources[roId] = 1;
    if (!did) return;
    if (!draftIdSet[did]) dangling.push({ request_order_line_source_id: s(r.request_order_line_source_id), request_allocation_draft_id: did });
    (lineageByDraft[did] = lineageByDraft[did] || {})[roId] = 1;
  });
  var draftInMultiRO = Object.keys(lineageByDraft).filter(function (d) { return Object.keys(lineageByDraft[d]).length > 1; })
    .map(function (d) { return { request_allocation_draft_id: d, request_order_ids: Object.keys(lineageByDraft[d]) }; });
  var roexecRoIds = {}; orders.data.forEach(function (r) { if (s(r.source_ref_type) === ROTYPE && s(r.source_ref_id).indexOf('ROEXEC-') === 0) roexecRoIds[s(r.request_order_id)] = 1; });
  var roexecNoSources = Object.keys(roexecRoIds).filter(function (id) { return !roWithSources[id]; });

  // §4 lifecycle anomalies
  var submittedNoLineage = drafts.filter(function (d) { return lc(d.status) === 'submitted' && !lineageByDraft[s(d.request_allocation_draft_id)]; })
    .map(function (d) { return s(d.request_allocation_draft_id); });
  var draftBesideConfirmed = collisions.filter(function (c) {
    var hasDraft = false, hasConf = false; c.rows.forEach(function (r) { if (lc(r.status) === 'draft') hasDraft = true; if (lc(r.status) === 'site_confirmed') hasConf = true; });
    return hasDraft && hasConf;
  });
  var multiManualActive = collisions.filter(function (c) { return c.rows.filter(function (r) { return lc(r.generation_type) === 'user_created'; }).length > 1; });

  Logger.log('=== R4E5C READ-ONLY AUDIT ===');
  Logger.log('canonical active grain: company+country+marketplace+sku+planning_cycle | ACTIVE={draft,site_confirmed}');
  Logger.log('§1 active-draft collisions (ACTIVE_COUNT>1): %s', collisions.length);
  collisions.forEach(function (c) { Logger.log('  COLLISION %s :: %s', c.grain, c.rows.map(function (r) { return s(r.request_allocation_draft_id) + '[' + lc(r.status) + '/' + lc(r.generation_type) + ']'; }).join(', ')); });
  Logger.log('§2 ROEXEC request_orders (non-cancelled): %s', roexecCount);
  Logger.log('§2 duplicate execution-key groups (>1): %s', dupExec.length);
  dupExec.forEach(function (g) { Logger.log('  REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT %s -> %s', g.execution_key, g.request_order_nos.join(',')); });
  Logger.log('§2 LEGACY_EXECUTION_IDENTITY_UNRESOLVED (blank source_ref_id): %s', legacyUnresolved);
  Logger.log('§3 dangling lineage rows: %s', dangling.length);
  Logger.log('§3 draft referenced by >1 distinct Request Order: %s', draftInMultiRO.length);
  draftInMultiRO.forEach(function (x) { Logger.log('  MULTI-RO-LINEAGE %s -> %s', x.request_allocation_draft_id, x.request_order_ids.join(',')); });
  Logger.log('§3 ROEXEC Request Orders with zero source rows: %s', roexecNoSources.length);
  Logger.log('§4A submitted allocation w/o lineage: %s', submittedNoLineage.length);
  Logger.log('§4C draft beside site_confirmed (same grain): %s', draftBesideConfirmed.length);
  Logger.log('§4D multiple active manual drafts (same grain): %s', multiManualActive.length);
  var catA = draftBesideConfirmed.length, catD = dupExec.length, catC = legacyUnresolved > 0 ? 1 : 0;
  Logger.log('CLASSIFICATION → CAT-A(safe supersession candidates)=%s CAT-D(dup ROEXEC, CRITICAL)=%s CAT-C(legacy unresolved present)=%s',
    catA, catD, catC);
  Logger.log('DESTRUCTIVE MIGRATION PERFORMED = NO (read-only)');

  return {
    activeCollisions: collisions.length, roexecCount: roexecCount, dupExecKeys: dupExec.length,
    legacyUnresolved: legacyUnresolved, danglingLineage: dangling.length, draftInMultiRO: draftInMultiRO.length,
    roexecNoSources: roexecNoSources.length, submittedNoLineage: submittedNoLineage.length,
    draftBesideConfirmed: draftBesideConfirmed.length, multiManualActive: multiManualActive.length
  };
}
