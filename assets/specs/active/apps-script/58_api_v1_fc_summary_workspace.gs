/**
 * 58_api_v1_fc_summary_workspace.gs
 * Kitchen Mama Operation System — API v1 · FC Summary READ-ONLY Workspace (Phase API / F1-7G).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped read owner for the active FC Summary page primary render:
 *   - fc-summary.js  (Regular Forecast tab + Special Event tab + Target Rules tab; the filter/year universes)
 * Action = "fcSummary.workspace.get" (a body-carrying READ, no write).
 *
 * SCOPE — PRIMARY RENDER ONLY. This is the FULL fcSummary page WORKSPACE (distinct from the bounded raw-fact owner
 * 53_ "fcSummary.raw.get", which exposes only the AI-Plan Layer-1 basicFcRawT3Qty / specialEventFcRawQty and is NOT a
 * page read). It reads the FOUR tables the page's primary tables + filters render from — never getOperationDb:
 *     fc_regular_forecast   (Regular Forecast table + the Year dropdown distinct years)
 *     fc_special_events     (Special Event table)
 *     fc_target_rules       (Target Rules table)
 *     marketplaces          (marketplace key -> display label; reference only)
 * The page's SECONDARY write/edit surfaces (Regular Builder, Special Event Builder incl. Event Assist, Target Rule
 * editor, CSV import) are NOT served here — they keep reading the broad cache lazily (marketplace_skus / sku_details /
 * campaigns / campaign_sku_lines / pricing_list). Migrating those is a documented follow-up.
 *
 * FULL-SET (NOT server-filtered) BY DESIGN — BEFORE == AFTER. fc-summary is deliberately NON-CASCADING: the Year
 * dropdown lists ALL distinct fc_regular_forecast years and every filter dimension keeps its FULL distinct option set,
 * built client-side from the COMPLETE dataset (_fcSyncFilterOptions / _populateFcYearFromDb). Server-side year/scope
 * narrowing would shrink those universes -> a user-visible behavior change. So this workspace returns raw passthrough of
 * the ENTIRE FC tables (bounded by a generous safety cap that is NEVER silently applied — see `capped`), and the client
 * keeps ALL filtering / SKU search / pagination exactly as before. The workspace's win is table SCOPE (4 tables, never
 * the ~44-tab getOperationDb), not server pagination. (Scoped/paginated server reads are a documented follow-up that
 * would change the filter-universe/year behavior and therefore are NOT part of this pure transport cutover.)
 *
 * AUTHORITY — reads only; authors NO business logic. No Target% is applied to any forecast here (the page itself never
 * multiplies raw forecast by Target% for display/write — that multiply is debug-only, unwired). RAW forecast and
 * ADJUSTED planning forecast retain DISTINCT authorities: this owner emits ONLY raw persisted forecast rows; it never
 * blends, never Target%-adjusts, never computes Gap/Recommendation/allocation. It does NOT touch the Special Event WRITE
 * path (Event Assist authority is unchanged — flagged separately as EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED).
 *
 * Testability: pure `fcsWorkspaceBuild_` is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handleFcSummaryWorkspaceGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

var FCS_WS_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

// Primary-render tables — fail-closed on missing schema (core Phase-1 tables, always provisioned). requiredCols are a
// representative presence check (target-DB assertion), deliberately minimal so no legitimate row shape is rejected.
var FCS_WORKSPACE_TABLES_ = [
  { name: 'fc_regular_forecast', requiredCols: ['sku'] },
  { name: 'fc_special_events',   requiredCols: [] },
  { name: 'fc_target_rules',     requiredCols: [] },
  { name: 'marketplaces',        requiredCols: ['marketplace'] }
];

// Generous safety backstop. In real data the FC tables (SKUs x marketplaces x years) are well under this; the cap only
// guards against a runaway payload and is reported via `capped` so truncation is NEVER silent (would break BEFORE==AFTER).
var FCS_WS_ROW_MAX_ = 50000;

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock / no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function fcsWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function fcsBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'fcSummary.workspace.get', workspace: 'fcSummary', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// Cap an array to FCS_WS_ROW_MAX_, reporting whether truncation occurred (never silent).
function fcsCap_(rows) {
  rows = rows || [];
  if (rows.length <= FCS_WS_ROW_MAX_) return { rows: rows, capped: false, total: rows.length };
  return { rows: rows.slice(0, FCS_WS_ROW_MAX_), capped: true, total: rows.length };
}

// Distinct fc_regular_forecast years (informational summary only — the page rebuilds its own year list from the rows).
function fcsDistinctYears_(regularRows) {
  var out = [], seen = {};
  for (var i = 0; i < regularRows.length; i++) {
    var y = fcsWsStr_(regularRows[i].year);
    if (y !== '' && !seen[y]) { seen[y] = 1; out.push(y); }
  }
  out.sort(function (a, b) { return Number(b) - Number(a); });
  return out;
}

// The pure orchestrator: raw tables + request payload → ONE bounded FC Summary View Model. Every array is RAW passthrough
// (each source row unmodified) so a page adapter reproduces the existing render byte-for-byte via the SAME db-api
// normalizers (normalizeFcRegularForecastRecord / …SpecialEvent / …TargetRule / normalizeMarketplaceRecord).
function fcsWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var regular = fcsCap_(tables.fc_regular_forecast || []);
  var events  = fcsCap_(tables.fc_special_events || []);
  var rules   = fcsCap_(tables.fc_target_rules || []);
  var markets = fcsCap_(tables.marketplaces || []);

  var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};
  var summary = (include.summary === false) ? null : {
    regularCount: regular.total,
    eventCount: events.total,
    targetRuleCount: rules.total,
    marketplaceCount: markets.total,
    years: fcsDistinctYears_(regular.rows)   // informational; page derives its own from the rows
  };

  return {
    summary: summary,
    fcRegularForecast: regular.rows,   // raw passthrough
    fcSpecialEvents: events.rows,      // raw passthrough
    fcTargetRules: rules.rows,         // raw passthrough
    marketplaces: markets.rows,        // raw passthrough (reference — label resolution only)
    capped: { fcRegularForecast: regular.capped, fcSpecialEvents: events.capped, fcTargetRules: rules.capped, marketplaces: markets.capped },
    counts: { fcRegularForecast: regular.total, fcSpecialEvents: events.total, fcTargetRules: rules.total, marketplaces: markets.total }
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function fcsWsRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function fcsWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { FCS_WS_SEQ_++; return FCS_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      if (optional && !ss.getSheetByName(name)) return [];
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return fcsWsRowsToObjects_(sheet);
    }
  };
}

function handleFcSummaryWorkspaceGet_(body, io) {
  io = io || fcsWorkspaceDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = fcsWsStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < FCS_WORKSPACE_TABLES_.length; i++) {
      var spec = FCS_WORKSPACE_TABLES_[i];
      tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols, spec.optional === true);
      readCount++;
    }
    var vm = fcsWorkspaceBuild_(tables, payload);
    return fcsBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'FC_SUMMARY_WORKSPACE_BUILD_FAILED';
    return fcsBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
