// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 64_api_v1_scope_registry.gs — F1-7N-FB-3 §C slim, bounded, read-only SCOPE REGISTRY
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER.
// ------------------------------------------------------------
// WHY THIS EXISTS. Site Inventory's Country / Marketplace selectors were populated from `marketplaces` INSIDE
// the full `inventoryReplenishment.workspace.get` payload — the same payload that carries marketplace_skus,
// four Amazon snapshots, forecasts, factory stock, shipments, shipping plans and the allocation drafts (20
// tables). Rendering two dropdowns therefore cost a whole-workspace read, and — because that read is the
// PRIMARY table read — it also drove the inventory table's own load state, so opening a selector printed
// "Loading Inventory Replenishment…" into the table body while Country and Marketplace were still unselected.
// That is the F1-7N-FB-3 B1/B2 defect: selector loading and inventory loading were the same request.
//
// This action answers ONLY the question "what scopes may the user choose?" — one table, a six-column bounded
// projection, deterministic order. It is STRICTLY READ-ONLY: no write, no lock, no Drive, no Script Property,
// no whole-workbook read, and no business calculation of any kind.
//
// It deliberately contains NO: inventory rows · sales history · forecasts · recommendations · factory stock ·
// shipping/allocation drafts · shipping plans · shipments · documents · pricing · unrelated masters.
// ============================================================

var SCOPEREG_CONTRACT_VERSION_ = '1';
// Bumped by hand when the projection changes. It is a cache-invalidation authority, not a secret: a client
// holding a registry stamped with an older version must discard it rather than trust it.
var SCOPEREG_PROJECTION_VERSION_ = 'FB-3.1';

// The ONLY table this action reads, and the ONLY columns it projects. Anything not listed here cannot leave
// this module — that is the bounded-projection guarantee, enforced by construction rather than by review.
var SCOPEREG_SOURCE_TABLE_ = 'marketplaces';
var SCOPEREG_PROJECTION_ = ['marketplace_id', 'company', 'country', 'marketplace', 'marketplace_display_name', 'status'];

// Backstop only; a scope registry is orders of magnitude below this. Truncation is never silent (`capped`).
var SCOPEREG_ROW_MAX_ = 5000;

function scopeRegStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function scopeRegEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: SCOPEREG_CONTRACT_VERSION_, source: 'registry', action: 'inventoryScope.registry.get',
    projection_version: SCOPEREG_PROJECTION_VERSION_, cached: false };
  if (meta) { for (var k in meta) { if (Object.prototype.hasOwnProperty.call(meta, k)) m[k] = meta[k]; } }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// --------------------------------------------------------------------------------------------------------
// PURE core — rows in, registry out. Deterministic, side-effect free, unit-testable with ZERO SpreadsheetApp.
// --------------------------------------------------------------------------------------------------------
// `rows` is an array of objects already restricted to SCOPEREG_PROJECTION_ by the io layer.
// An "eligible" scope is an ACTIVE marketplace that carries a marketplace_id (the selector's identity) and a
// country (the selector's grouping). A blank status is treated as active, matching the page's existing
// _replenActiveMarketplaces predicate EXACTLY — this module introduces no new eligibility rule.
function scopeRegBuild_(rows) {
  rows = rows || [];
  var capped = rows.length > SCOPEREG_ROW_MAX_;
  if (capped) rows = rows.slice(0, SCOPEREG_ROW_MAX_);

  var countrySeen = {}, countries = [], marketplaces = [], idSeen = {};
  var skippedInactive = 0, skippedNoId = 0, skippedNoCountry = 0;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var status = scopeRegStr_(r.status).toLowerCase();
    if (status !== '' && status !== 'active') { skippedInactive++; continue; }
    var id = scopeRegStr_(r.marketplace_id);
    if (!id) { skippedNoId++; continue; }
    var country = scopeRegStr_(r.country);
    if (!country) { skippedNoCountry++; continue; }
    if (idSeen[id]) continue;                     // marketplace_id is the identity — never duplicated
    idSeen[id] = 1;
    if (!countrySeen[country]) { countrySeen[country] = 1; countries.push(country); }
    marketplaces.push({
      marketplace_id: id,
      country: country,
      company: scopeRegStr_(r.company),
      marketplace: scopeRegStr_(r.marketplace),
      // The selector LABEL authority. Falls back exactly as the page does: display name → channel → id.
      marketplace_display_name: scopeRegStr_(r.marketplace_display_name) || scopeRegStr_(r.marketplace) || id
    });
  }

  // Deterministic output: countries alphabetical; marketplaces by (country, display name, id) so a tie can
  // never reorder between calls and a client diff/cache key is stable.
  countries.sort();
  marketplaces.sort(function (a, b) {
    if (a.country !== b.country) return a.country < b.country ? -1 : 1;
    if (a.marketplace_display_name !== b.marketplace_display_name) return a.marketplace_display_name < b.marketplace_display_name ? -1 : 1;
    return a.marketplace_id < b.marketplace_id ? -1 : (a.marketplace_id > b.marketplace_id ? 1 : 0);
  });

  // country -> [marketplace_id] so the client can re-scope the Marketplace selector with NO further request.
  var byCountry = {};
  for (var j = 0; j < marketplaces.length; j++) {
    var m = marketplaces[j];
    (byCountry[m.country] = byCountry[m.country] || []).push(m.marketplace_id);
  }

  return {
    countries: countries,
    marketplaces: marketplaces,
    marketplace_ids_by_country: byCountry,
    counts: { countries: countries.length, marketplaces: marketplaces.length },
    // Truthful about what was excluded and why — an empty registry must be explainable, never a mystery.
    excluded: { inactive: skippedInactive, missing_marketplace_id: skippedNoId, missing_country: skippedNoCountry },
    capped: capped,
    // Safe when NOTHING is eligible: an explicit flag + reason, not an error and not a silent empty payload.
    empty: marketplaces.length === 0,
    empty_reason: marketplaces.length === 0
      ? ((rows.length === 0) ? 'NO_MARKETPLACE_ROWS' : 'NO_ELIGIBLE_MARKETPLACE_ROWS')
      : ''
  };
}
// __SCOPEREG_PURE_END__ (test marker — everything above is pure; everything below touches io)

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
// Reads ONE tab and ONLY the projected columns. It resolves each projected column's index from the header row
// and pulls the values by index, so an unrelated column can never be carried out of the sheet even by accident
// — and a table with 40 columns costs the same as one with 6.
function scopeRegDefaultIo_() {
  return {
    readProjection: function (ss, table, columns) {
      var sheet = ss.getSheetByName(table);
      if (!sheet) return { rows: [], missing_table: true, missing_columns: columns.slice() };
      var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
      if (lastRow < 2 || lastCol < 1) return { rows: [], missing_table: false, missing_columns: [] };
      var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return scopeRegStr_(h).toLowerCase(); });
      var idx = {}, missing = [];
      for (var c = 0; c < columns.length; c++) {
        var at = header.indexOf(String(columns[c]).toLowerCase());
        if (at === -1) missing.push(columns[c]); else idx[columns[c]] = at;
      }
      // ONE bounded getValues over the data region; no per-row getRange (that would be the N+1).
      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      var out = [];
      for (var r = 0; r < values.length; r++) {
        var row = values[r], o = {};
        for (var k = 0; k < columns.length; k++) {
          var name = columns[k];
          o[name] = Object.prototype.hasOwnProperty.call(idx, name) ? row[idx[name]] : '';
        }
        out.push(o);
      }
      return { rows: out, missing_table: false, missing_columns: missing };
    }
  };
}

// The canonical action. GET-safe and POST-safe (registered on both verbs): it is a pure read.
function handleInventoryScopeRegistryGet_(body, io) {
  var started = Date.now();
  io = io || scopeRegDefaultIo_();
  var payload = (body && (body.payload || body)) || {};
  var requestId = scopeRegStr_(payload.requestId || payload.request_id) ||
    ('SCOPEREG-' + Utilities.getUuid().substring(0, 8).toUpperCase());
  var ss;
  try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); }
  catch (e) {
    // Never echo the id or a message that could contain it.
    return jsonResponse_(scopeRegEnvelope_(false, null,
      [{ code: 'DB_NOT_REACHABLE', message: 'The configured production database could not be opened.' }],
      { request_id: requestId, server_ms: Date.now() - started, read_only: true, db_writes: 0 }));
  }

  var read;
  try { read = io.readProjection(ss, SCOPEREG_SOURCE_TABLE_, SCOPEREG_PROJECTION_); }
  catch (e2) {
    return jsonResponse_(scopeRegEnvelope_(false, null,
      [{ code: 'SCOPE_REGISTRY_READ_FAILED', message: 'The scope registry table could not be read.' }],
      { request_id: requestId, server_ms: Date.now() - started, read_only: true, db_writes: 0 }));
  }
  if (read.missing_table) {
    return jsonResponse_(scopeRegEnvelope_(false, null,
      [{ code: 'SCOPE_REGISTRY_TABLE_ABSENT', message: 'The marketplaces registry table is not present.',
        details: { table: SCOPEREG_SOURCE_TABLE_ } }],
      { request_id: requestId, server_ms: Date.now() - started, read_only: true, db_writes: 0 }));
  }
  // A missing projected column is reported by NAME (not guessed, not defaulted silently) but is not fatal on
  // its own: the identity columns are what make a scope selectable, so only those block.
  var blocking = [];
  for (var i = 0; i < (read.missing_columns || []).length; i++) {
    var col = read.missing_columns[i];
    if (col === 'marketplace_id' || col === 'country') blocking.push(col);
  }
  if (blocking.length) {
    return jsonResponse_(scopeRegEnvelope_(false, null,
      [{ code: 'SCOPE_REGISTRY_COLUMN_MISSING', message: 'A scope identity column is missing from the registry table.',
        details: { table: SCOPEREG_SOURCE_TABLE_, missing: blocking } }],
      { request_id: requestId, server_ms: Date.now() - started, read_only: true, db_writes: 0 }));
  }

  var data = scopeRegBuild_(read.rows);
  data.optional_columns_missing = (read.missing_columns || []).filter(function (c) { return c !== 'marketplace_id' && c !== 'country'; });
  return jsonResponse_(scopeRegEnvelope_(true, data, [], {
    request_id: requestId,
    server_timestamp: (typeof shipmentTimestamp_ === 'function') ? shipmentTimestamp_() : new Date().toISOString(),
    server_ms: Date.now() - started,
    rows_read: (read.rows || []).length,
    source_table: SCOPEREG_SOURCE_TABLE_,
    projected_columns: SCOPEREG_PROJECTION_.length,
    read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0
  }));
}

// ---- editor-runnable read-only check --------------------------------------------------------------------
// Confirms the registry is answerable and reports its SHAPE — never the rows themselves.
//
// F1-7N-FB-3A §C — READ THIS BEFORE TRUSTING A GREEN RESULT. This wrapper calls the handler DIRECTLY inside
// the editor, against the code currently SAVED in the project. It therefore proves only that the code is saved
// and that the data is readable. It proves NOTHING about the deployed /exec Web App, which serves whichever
// DEPLOYMENT VERSION was last published. A green result here alongside a failing website is the classic
// signature of exactly that: saved but not deployed. Publish a new deployment version.
function TEMP_INVENTORY_SCOPE_REGISTRY_CHECK() {
  var env = {};
  try { env = JSON.parse(handleInventoryScopeRegistryGet_({}).getContent()); }
  catch (e) { Logger.log('[SCOPE-REG] UNPARSEABLE'); return; }
  if (!env.success) {
    Logger.log('[SCOPE-REG] FAILED code=' + ((env.errors && env.errors[0] && env.errors[0].code) || 'UNKNOWN') +
      ' request_id=' + (env.meta && env.meta.request_id));
    Logger.log('READ_ONLY = true'); Logger.log('DB_WRITES = 0'); Logger.log('DRIVE_WRITES = 0');
    Logger.log('STATUS_TRANSITIONS = 0'); Logger.log('EMAILS = 0'); Logger.log('DEMO_MUTATIONS = 0');
    return;
  }
  var d = env.data || {}, m = env.meta || {};
  Logger.log('[SCOPE-REG] countries=' + d.counts.countries + ' marketplaces=' + d.counts.marketplaces +
    ' empty=' + d.empty + (d.empty_reason ? (' reason=' + d.empty_reason) : '') + ' capped=' + d.capped);
  Logger.log('[SCOPE-REG] excluded inactive=' + d.excluded.inactive + ' no_id=' + d.excluded.missing_marketplace_id +
    ' no_country=' + d.excluded.missing_country + ' optional_columns_missing=[' + (d.optional_columns_missing || []).join(',') + ']');
  Logger.log('[SCOPE-REG] source_table=' + m.source_table + ' projected_columns=' + m.projected_columns +
    ' rows_read=' + m.rows_read + ' server_ms=' + m.server_ms + ' projection_version=' + m.projection_version +
    ' request_id=' + m.request_id);
  Logger.log('READ_ONLY = ' + m.read_only);
  Logger.log('DB_WRITES = ' + m.db_writes);
  Logger.log('DRIVE_WRITES = ' + m.drive_writes);
  Logger.log('STATUS_TRANSITIONS = ' + m.status_transitions);
  Logger.log('EMAILS = ' + m.emails);
  Logger.log('DEMO_MUTATIONS = ' + m.demo_mutations);
}
