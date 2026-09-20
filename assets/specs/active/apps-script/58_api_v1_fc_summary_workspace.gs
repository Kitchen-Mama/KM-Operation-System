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
 * AUTHORITY — reads only; authors NO business logic. No Target% is applied to any forecast here (the page itself never
 * multiplies raw forecast by Target% for display/write — that multiply is debug-only, unwired). RAW forecast and
 * ADJUSTED planning forecast retain DISTINCT authorities: this owner emits ONLY raw persisted forecast rows; it never
 * blends, never Target%-adjusts, never computes Gap/Recommendation/allocation. It does NOT touch the Special Event WRITE
 * path (Event Assist authority is unchanged — flagged separately as EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED).
 *
 * ==========================================================================================================
 * FC-SUMMARY-R3-R1 §B — SLICES, AND ONE READ PER SHEET
 *
 * WHAT PHASE A MEASURED, BECAUSE IT DECIDES THE SHAPE OF THIS FILE.
 *
 * A request that names no action, opens no spreadsheet and returns 0.2 KB costs a median 6,289 ms. Opening the
 * database and reading a two-row sheet adds 524 ms. The 496-row fc_regular_forecast and its 197 KB add 1,169 ms.
 * The fixed cost of ASKING is five times the cost of the largest table. So this round is not primarily about
 * making the payload smaller — it is about not asking twice for what is already known, and about not making the
 * one request we do send work harder than it has to.
 *
 * Two consequences are visible here:
 *
 *   1. ONE READ PER SHEET. The old IO read every sheet two or three times. prodRequireSheet_ reads the header row
 *      to validate it; prodRequireColumns_ reads the SAME header again whenever requiredCols is non-empty; and
 *      getDataRange().getValues() then returns that header a third time as row 0. Measured against a counting
 *      spreadsheet: 30 Sheets service calls, 10 of them transferring cells, SIX of those ten being header rows
 *      already contained in the full-sheet scan that followed. fcsReadTableOnce_ takes ONE getDataRange and
 *      validates the schema from the bytes it already holds. Every refusal token is preserved exactly —
 *      WRONG_SPREADSHEET_TARGET, SCHEMA_NOT_PROVISIONED, HEADER_MISSING, MISSING_REQUIRED_HEADER and whatever
 *      classifySchemaMismatch decides — because the validation is the same validation, applied to the same
 *      header, one round trip earlier. 29_production_safety_adapter.gs is NOT modified: it is shared by every
 *      read owner in the project, and this round has no business changing what they all depend on.
 *
 *   2. SLICES, THROUGH THE EXISTING ACTION. The page can now ask for what it is about to draw instead of for
 *      everything. This rides payload.include.slice on the SAME action, so there is no new routed action and
 *      01_router.gs does not change. FULL — an absent or unrecognised slice — returns EXACTLY what it always
 *      returned, so every existing caller, test and deployment keeps working and the backend can be deployed
 *      before the frontend that uses it.
 *
 * WHY BOOTSTRAP STILL READS fc_regular_forecast. The page is deliberately NON-CASCADING: the Year dropdown and
 * every filter dimension keep their FULL distinct option set, built from the COMPLETE dataset, and narrowing that
 * server-side would change what an operator can select. So bootstrap READS the table and emits only the FACETS
 * derived from it — never the rows. The universes are identical because the derivation is identical (the same
 * trim / drop-blank / sort the page applies); what changes is that ~197 KB of rows no longer crosses the wire to
 * populate six dropdowns. Reading is ~1.2 s; shipping is the rest.
 *
 * NO CACHE. Nothing here memoises across requests. A cache would need an authority, a version key, invalidation
 * on every related write and a stale label, and this round proved the win lies elsewhere.
 *
 * Testability: pure `fcsWorkspaceBuild_` is a `function` declaration (extract+eval friendly) and is UNCHANGED —
 * its FULL view model is byte-for-byte what it was. The impure orchestrator `handleFcSummaryWorkspaceGet_(body, io)`
 * takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

// F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R14 — this owner's first declared build stamp. It had none before, which meant a
// partial sync of this file was invisible to system.health: the page could be answered by last round's read owner
// and nothing in the deployment report would say so. The manifest in 63_ now carries a required row for it.
var FCSWS_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R14';

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

// ----------------------------------------------------------------------------------------------------------
// SLICE SPECS — what each slice READS, and what it EMITS. The two lists differ for bootstrap on purpose: the
// filter universes are derived from every Regular Forecast row, so the rows must be read; they must not be sent.
// ----------------------------------------------------------------------------------------------------------
var FCS_SLICE_SPECS_ = {
  // BOOTSTRAP CARRIES TARGET RULES AND NOT SPECIAL EVENTS, AND THE ASYMMETRY IS THE POINT.
  //
  // Target Rules are here because the Add Target Rule modal may not assert NEW — a new rule with twelve
  // 100% defaults — until an authoritative read has proved no matching rule exists. That proof has to be
  // in hand before the control is usable, so the two rows travel with the bootstrap that has to happen
  // anyway. Special Events are just as small, and are deliberately NOT here: nothing is blocked on them,
  // and fetching a tab nobody has opened is the eager read this round exists to stop. Both tables are
  // still READ, because the Event Type and year/filter universes are derived from the complete tables —
  // reading is what the facets cost, sending is what stops.
  bootstrap: {
    reads: ['fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'marketplaces'],
    emits: ['fcTargetRules', 'marketplaces'],
    facets: true
  },
  regular: { reads: ['fc_regular_forecast'], emits: ['fcRegularForecast'], facets: false },
  events:  { reads: ['fc_special_events'],   emits: ['fcSpecialEvents'],   facets: false },
  rules:   { reads: ['fc_target_rules'],     emits: ['fcTargetRules'],     facets: false }
};

var FCS_EMIT_SOURCE_ = {
  fcRegularForecast: 'fc_regular_forecast',
  fcSpecialEvents: 'fc_special_events',
  fcTargetRules: 'fc_target_rules',
  marketplaces: 'marketplaces'
};

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

// THE PAGE'S OWN distinct(): trim, drop blanks, default (lexicographic) sort. Spelled out rather than improved,
// because the point of computing a facet here is that it is the SAME set the page would have built from the rows.
// A "better" sort would be a user-visible change to every dropdown.
// `fields` may name more than one column, in which case the FIRST non-blank wins for that row — the same
// coalesce normalizeFcSpecialEventRecord applies when it resolves `event || event_name`. Taking one column and
// falling back to the other only if the first yielded nothing would silently drop rows in a table that uses both.
function fcsDistinctAsc_(rows, fields) {
  if (typeof fields === 'string') fields = [fields];
  var out = [], seen = {};
  for (var i = 0; i < rows.length; i++) {
    var v = '';
    for (var f = 0; f < fields.length && v === ''; f++) v = fcsWsStr_(rows[i][fields[f]]);
    if (v !== '' && !seen[v]) { seen[v] = 1; out.push(v); }
  }
  out.sort();
  return out;
}

// The complete filter universe, derived from the COMPLETE tables — never from a narrowed set. `years` keeps the
// year dropdown's descending-numeric order; every other dimension keeps the page's ascending default.
function fcsBuildFacets_(tables) {
  var regular = tables.fc_regular_forecast || [];
  var events = tables.fc_special_events || [];
  return {
    years: fcsDistinctYears_(regular),
    companies: fcsDistinctAsc_(regular, 'company'),
    marketplaces: fcsDistinctAsc_(regular, 'marketplace'),
    countries: fcsDistinctAsc_(regular, 'country'),
    categories: fcsDistinctAsc_(regular, 'category'),
    series: fcsDistinctAsc_(regular, 'series'),
    events: fcsDistinctAsc_(events, ['event', 'event_name'])
  };
}

// The pure orchestrator: raw tables + request payload → ONE bounded FC Summary View Model. Every array is RAW passthrough
// (each source row unmodified) so a page adapter reproduces the existing render byte-for-byte via the SAME db-api
// normalizers (normalizeFcRegularForecastRecord / …SpecialEvent / …TargetRule / normalizeMarketplaceRecord).
//
// UNCHANGED by R3-R1. This is the FULL view model and it stays exactly what it was: the slice path is a separate
// builder, so "the default answer is what it always was" is true by construction rather than by inspection.
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

// Which slice did the caller ask for? An absent, blank or unrecognised value is FULL — the backward-compatible
// default, and the reason this file can be deployed before the frontend that uses slices.
function fcsResolveSlice_(payload) {
  var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};
  var name = fcsWsStr_(include.slice || include.mode).toLowerCase();
  return FCS_SLICE_SPECS_[name] ? name : 'full';
}

// A SLICE view model. It carries the same raw passthrough rows under the same keys as the full model, so the page
// feeds them to the SAME normalizers — one row shape, one identity authority, no second normalization anywhere.
// Keys the slice does not own are ABSENT rather than empty: [] would claim "I read this and there was nothing",
// which is the exact confusion the Target Rule modal is being repaired for on the client side.
function fcsSliceBuild_(sliceName, tables, observedAt) {
  var spec = FCS_SLICE_SPECS_[sliceName];
  var out = { slice: sliceName, observed_at: observedAt, counts: {}, capped: {}, row_count: 0 };
  for (var i = 0; i < spec.emits.length; i++) {
    var key = spec.emits[i];
    var capped = fcsCap_(tables[FCS_EMIT_SOURCE_[key]] || []);
    out[key] = capped.rows;
    out.counts[key] = capped.total;
    out.capped[key] = capped.capped;
    out.row_count += capped.total;
  }
  if (spec.facets) {
    out.facets = fcsBuildFacets_(tables);
    // The facets are derived from every Regular Forecast row, so the count is stated even though the rows are
    // not sent. A client that sees 496 here and no fcRegularForecast key knows the rows exist and were not asked
    // for — which is a different fact from an empty table, and it must not be possible to confuse them.
    out.counts.fcRegularForecast = (tables.fc_regular_forecast || []).length;
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function fcsWsRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  return fcsRowsFromValues_(data);
}

// The header/row split, given values that have already been read. Separated from the sheet so the one read can be
// validated and converted without a second trip.
function fcsRowsFromValues_(data) {
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

// RULE S0-2, applied to bytes already in hand. Same checks, same deterministic tokens, same KMSAFE classifier as
// prodRequireSheet_ + prodRequireColumns_ — one round trip instead of two or three. Validate-only: it NEVER
// creates a sheet, NEVER writes or repairs a header, NEVER appends a column.
function fcsValidateHeader_(name, header, requiredCols) {
  var S = prodSafetyBundle_();
  var nonBlank = 0;
  for (var i = 0; i < header.length; i++) { if (header[i] !== '') nonBlank++; }
  if (!header.length || nonBlank === 0) throw prodSchemaError_('HEADER_MISSING', name, null);
  var report = S.classifySchemaMismatch({ exists: true, actualHeaders: header, expectedHeaders: [], extraColumnsPolicy: 'ALLOW' });
  if (!report.valid) throw prodSchemaError_(report.schemaStatus, name, report);
  if (requiredCols && requiredCols.length) {
    var have = {}; header.forEach(function (h) { have[h] = 1; });
    var missing = requiredCols.filter(function (n) { return !have[n]; });
    if (missing.length) throw prodSchemaError_('MISSING_REQUIRED_HEADER', name, { missing: missing });
  }
  return true;
}

// ONE getDataRange per sheet. The spreadsheet id is asserted once per REQUEST by openTarget rather than once per
// table: re-asserting it four times proved the same fact four times and cost four service calls.
function fcsReadTableOnce_(ss, name, requiredCols, optional) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    if (optional) return [];
    throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', name, null);
  }
  var data = sheet.getDataRange().getValues();
  var header = (data && data.length ? data[0] : []).map(function (h) { return String(h).trim(); });
  fcsValidateHeader_(name, header, requiredCols);
  return fcsRowsFromValues_(data);
}

function fcsWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nowIso: function () { return new Date().toISOString(); },
    nextSeq: function () { FCS_WS_SEQ_++; return FCS_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      return fcsReadTableOnce_(ss, name, requiredCols, optional);
    }
  };
}

function handleFcSummaryWorkspaceGet_(body, io) {
  io = io || fcsWorkspaceDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = fcsWsStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  var slice = 'full';
  try {
    var payload = (body && body.payload) || {};
    slice = fcsResolveSlice_(payload);
    var spec = FCS_SLICE_SPECS_[slice];
    var wanted = spec ? spec.reads : null;

    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < FCS_WORKSPACE_TABLES_.length; i++) {
      var t = FCS_WORKSPACE_TABLES_[i];
      // A slice reads only the sheets it needs. FULL keeps reading all four, in the same order, as before.
      if (wanted && wanted.indexOf(t.name) === -1) continue;
      tables[t.name] = io.readTable(ss, t.name, t.requiredCols, t.optional === true);
      readCount++;
    }

    var observedAt = (io && typeof io.nowIso === 'function') ? io.nowIso() : new Date(io.now()).toISOString();
    var vm = spec ? fcsSliceBuild_(slice, tables, observedAt) : fcsWorkspaceBuild_(tables, payload);
    return fcsBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0),
      tablesRead: readCount, slice: slice, observedAt: observedAt, workspaceBuild: FCSWS_BUILD_VERSION_ });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'FC_SUMMARY_WORKSPACE_BUILD_FAILED';
    return fcsBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0), slice: slice, workspaceBuild: FCSWS_BUILD_VERSION_ });
  }
}
