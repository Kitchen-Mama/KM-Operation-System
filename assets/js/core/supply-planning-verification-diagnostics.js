// Kitchen Mama Operation System — READ-ONLY production verification diagnostics (Phase 2C, Round 1S-P4-U).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC read-only helpers that support USER-OPERATED live verification of the recommendation
// persistence path. They author NO business/persistence logic and NEVER write: no setValues / setValue /
// appendRow / insertRow(s) / deleteRow(s) / clear / LockService / persistence — they only INSPECT. The `.gs`
// wrapper (28_) passes SpreadsheetApp.getActiveSpreadsheet(); tests pass a fake. No SpreadsheetApp / Date.now /
// Math.random / locale here; input never mutated.
//
// Scope: (1) namespaceReport — verify the bundle exposes the required runtime namespaces + public functions;
// (2) auditDraftTables — verify the five authorized persistence tables exist with the exact frozen headers and
// report row counts + Active-Draft grouping by the B-7 Composite Natural Key + duplicate-active conflicts +
// submitted/cancelled counts (read-only); (3) activeDraftAudit — read-only Composite-Key audit for one scope.
// Expected headers are sourced from the frozen KMPW.DRAFT_HEADERS / KMPR (single source of truth; never redefined).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)),
    req ? req('./supply-planning-production-writer.js') : (root.KMPW || (root.KM && root.KM.productionWriter))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.verificationDiagnostics = api; }
})(this, function (KMPR, KMPW) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nstat(v) { return str(v).toLowerCase(); }

  var TERMINAL = { submitted: 1, cancelled: 1 };            // header-terminal (KMPR single-source vocabulary)

  // ---- (1) namespace + bundle load report (pure; the `.gs` passes the real globals) -----------------------
  function namespaceReport(env) {
    env = isObj(env) ? env : {};
    var required = ['KMSP', 'KMPS', 'KMPW', 'KMPR', 'KMPL', 'KMORCH', 'KMSRP', 'KMSR', 'KMSI', 'KMPB', 'KMPPB', 'KMPC'];
    var namespaces = {};
    required.forEach(function (n) { namespaces[n] = env[n] ? typeof env[n] : 'undefined'; });
    var functions = {
      'KMPW.persistProductionRecommendation': !!(env.KMPW && typeof env.KMPW.persistProductionRecommendation === 'function'),
      'KMPS.resolveProductionFacts': !!(env.KMPS && typeof env.KMPS.resolveProductionFacts === 'function'),
      'KMPS.buildProductionRecommendationSource': !!(env.KMPS && typeof env.KMPS.buildProductionRecommendationSource === 'function'),
      'KMSP.projectAndRead': !!(env.KMSP && typeof env.KMSP.projectAndRead === 'function'),
      'KMPR.applyPersistencePlan': !!(env.KMPR && typeof env.KMPR.applyPersistencePlan === 'function'),
      'KMPR.loadActiveDraftContext': !!(env.KMPR && typeof env.KMPR.loadActiveDraftContext === 'function'),
      'KMPL.executeLockedPersistence': !!(env.KMPL && typeof env.KMPL.executeLockedPersistence === 'function'),
      'KMORCH.runRecommendationGeneration': !!(env.KMORCH && typeof env.KMORCH.runRecommendationGeneration === 'function')
    };
    var info = env.KM_BUNDLE_INFO && isObj(env.KM_BUNDLE_INFO) ? env.KM_BUNDLE_INFO : null;
    var moduleCount = info && Array.isArray(info.modules) ? info.modules.length : null;
    var ready = required.every(function (n) { return namespaces[n] === 'object'; }) &&
      Object.keys(functions).every(function (k) { return functions[k]; });
    return { namespaces: namespaces, functions: functions, moduleCount: moduleCount, bundleInfo: info, ready: ready };
  }

  // ---- read-only raw table read (injected spreadsheet; getValues only; value-preserving) -------------------
  function readTable(spreadsheet, name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return { exists: false, headers: [], rows: [], rowCount: 0 };
    var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : null;
    if (lastRow === 0) return { exists: true, headers: [], rows: [], rowCount: 0 };
    var values = sheet.getDataRange().getValues();
    if (!values || !values.length) return { exists: true, headers: [], rows: [], rowCount: 0 };
    var headers = values[0].map(function (h) { return str(h); });
    var rows = []; for (var r = 1; r < values.length; r++) rows.push(values[r].slice());
    return { exists: true, headers: headers, rows: rows, rowCount: rows.length };
  }
  function dupHeaders(headers) { var seen = {}, dup = []; headers.forEach(function (h) { if (h === '') return; if (seen[h]) { if (dup.indexOf(h) < 0) dup.push(h); } else seen[h] = 1; }); return dup; }
  function missing(headers, required) { var have = {}; headers.forEach(function (h) { have[h] = 1; }); return required.filter(function (h) { return !have[h]; }); }
  function rowObj(headers, row) { var o = {}; for (var i = 0; i < headers.length; i++) if (headers[i] !== '') o[headers[i]] = row[i]; return o; }

  // ---- (2) five-table readiness + Active-Draft audit (READ-ONLY) ------------------------------------------
  function auditHeaderTable(spreadsheet, type, opts) {
    var cfg = KMPR.TABLES[type];
    var t = readTable(spreadsheet, cfg.header);
    var expected = KMPW.DRAFT_HEADERS[type].header;
    var out = { table: cfg.header, exists: t.exists, rowCount: t.rowCount, headers: t.headers,
      duplicateHeaders: dupHeaders(t.headers), missingRequiredHeaders: missing(t.headers, expected),
      activeByKey: {}, duplicateActiveConflicts: [], submittedCount: 0, cancelledCount: 0 };
    t.rows.forEach(function (row) {
      var o = rowObj(t.headers, row);
      var st = nstat(o.status);
      if (st === 'submitted') out.submittedCount++;
      if (st === 'cancelled') out.cancelledCount++;
      if (TERMINAL[st]) return;                                  // terminal rows are never Active
      var key;
      try { key = KMPR.buildBusinessScopeKey(type, o); } catch (e) { key = 'UNRESOLVED_SCOPE'; }
      out.activeByKey[key] = (out.activeByKey[key] || 0) + 1;
    });
    for (var k in out.activeByKey) if (out.activeByKey[k] > 1) out.duplicateActiveConflicts.push({ key: k, count: out.activeByKey[k] });
    return out;
  }
  function auditLineTable(spreadsheet, type) {
    var cfg = KMPR.TABLES[type];
    var t = readTable(spreadsheet, cfg.lines);
    return { table: cfg.lines, exists: t.exists, rowCount: t.rowCount, headers: t.headers,
      duplicateHeaders: dupHeaders(t.headers), missingRequiredHeaders: missing(t.headers, KMPW.DRAFT_HEADERS[type].lines) };
  }
  function auditRunJournal(spreadsheet) {
    var t = readTable(spreadsheet, KMPR.RUN_JOURNAL_TABLE);
    return { table: KMPR.RUN_JOURNAL_TABLE, exists: t.exists, rowCount: t.rowCount, headers: t.headers,
      duplicateHeaders: dupHeaders(t.headers), missingRequiredHeaders: missing(t.headers, KMPR.RUN_JOURNAL_HEADERS) };
  }
  function auditDraftTables(spreadsheet, opts) {
    aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'auditDraftTables: spreadsheet.getSheetByName required');
    var tables = {
      shipping_allocation_drafts: auditHeaderTable(spreadsheet, 'WEEKLY_SHIPPING', opts),
      shipping_allocation_draft_lines: auditLineTable(spreadsheet, 'WEEKLY_SHIPPING'),
      request_order_allocation_drafts: auditHeaderTable(spreadsheet, 'MONTHLY_ORDER', opts),
      request_order_allocation_draft_lines: auditLineTable(spreadsheet, 'MONTHLY_ORDER'),
      recommendation_calculation_runs: auditRunJournal(spreadsheet)
    };
    var issues = [];
    for (var name in tables) {
      var a = tables[name];
      if (!a.exists) issues.push({ table: name, reason: 'SHEET_MISSING' });
      if (a.duplicateHeaders.length) issues.push({ table: name, reason: 'DUPLICATE_HEADER', detail: a.duplicateHeaders });
      if (a.missingRequiredHeaders.length) issues.push({ table: name, reason: 'MISSING_REQUIRED_HEADER', detail: a.missingRequiredHeaders });
      if (a.duplicateActiveConflicts && a.duplicateActiveConflicts.length) issues.push({ table: name, reason: 'DUPLICATE_ACTIVE_DRAFT', detail: a.duplicateActiveConflicts });
    }
    return { tables: tables, issues: issues, ready: issues.length === 0 };
  }

  // ---- (3) single-scope Composite-Key audit (READ-ONLY; reuses the frozen KMPR active-draft resolver) ------
  function activeDraftAudit(spreadsheet, query) {
    aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'activeDraftAudit: spreadsheet.getSheetByName required');
    aType(isObj(query) && KMPR.TABLES[query.recommendationType], 'activeDraftAudit: query.recommendationType invalid');
    var type = query.recommendationType, cfg = KMPR.TABLES[type];
    var t = readTable(spreadsheet, cfg.header);
    var sheetSet = KMPR.createSheetSet();
    sheetSet[cfg.header] = { headers: t.headers.slice(), rows: t.rows.map(function (r) { return r.slice(); }) };
    var ctx = KMPR.loadActiveDraftContext(sheetSet, query);          // frozen resolver — never latest-wins
    var decision = ctx.status === 'CREATE' ? 'AUTHORIZED_CREATE_TEST'
      : ctx.status === 'REUSE' ? 'AUTHORIZED_REUSE_TEST'
        : 'BLOCKED_CONFLICT_HALT';                                    // >1 → HALT, no cleanup, no generation
    return { recommendationType: type, businessScopeKey: ctx.businessScopeKey, status: ctx.status,
      draftId: ctx.draftId || null, matchCount: ctx.matchCount !== undefined ? ctx.matchCount : (ctx.status === 'REUSE' ? 1 : 0), decision: decision };
  }

  return {
    namespaceReport: namespaceReport,
    auditDraftTables: auditDraftTables,
    activeDraftAudit: activeDraftAudit
  };
});
