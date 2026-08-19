// Kitchen Mama Operation System — Warehouse Allocation config owner (F1-7N-D-2k-R1).
// -----------------------------------------------------------------------------------------------------------------
// Canonical persistence owner : PropertiesService.getScriptProperties()  (NOT the spreadsheet DB, NOT a Sheet tab).
//
// USER DECISION (F1-7N-D-2k): Warehouse Allocation ratios are configured through the Operation System UI (Site
// Inventory → More Options → Warehouse Allocation) but must NOT require a user-managed
// `replenishment_demand_allocation_rules` Google Sheet tab. The setting must still be persistent AND backend/
// scheduler-readable with NO browser session (Weekly AI Plan + scheduled automation consume the same settings).
//
// CASE B (reconciliation): the frozen KMDA calc engine (supply-planning-demand-allocation.js) is intrinsically
// ROW/ruleset-oriented (cross-row ratio-sum = 100%, per-warehouse fan-out, largest-remainder) but STORAGE-AGNOSTIC —
// it consumes an INJECTED array of flat rule rows and `_toRuleRow` already accepts either the snake or the DB-
// normalized camel shape. So the RULE MODEL is preserved unchanged; only the STORAGE OWNER moves from the Sheet tab
// to a single Script-Property JSON blob, materialized on read into the SAME snake-case rule rows KMDA expects. There
// is exactly ONE planning authority — the server planning path (42_ recoWsExpandWarehouse_) now sources rule rows
// from `warehouseAllocationRuleRows_()` (this file), never the `replenishment_demand_allocation_rules` snapshot key.
//
// This mirrors the established Script-Property config precedent (45_api_v1_automation_schedule.gs: one JSON blob under
// one key, read headlessly by time-driven triggers via the default IO seam). It authors NO business formula, touches
// NO spreadsheet DB, creates NO DB table, and never pools/transfers demand. PropertiesService is touched ONLY in the
// default IO (warehouseAllocationConfigIo_) so the pure helpers stay Node-testable. Backend + scheduler read the exact
// same blob (Phase-5 automation parity). Ratios follow the frozen contract: forecast & sales each sum to 100% (bp).

var WAREHOUSE_ALLOCATION_CONFIG_PROP_KEY_ = 'KM_WAREHOUSE_ALLOCATION_CONFIG';   // ONE Script Property; ONE JSON blob
var WAREHOUSE_ALLOCATION_CONFIG_VERSION_ = 1;

function waStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function waScopeKey_(company, country, marketplace) { return [waStr_(company), waStr_(country), waStr_(marketplace)].join('||'); }
function waRuleId_(company, country, marketplace, whId) {
  return 'RDAR-' + waStr_(company).toUpperCase() + '-' + waStr_(country).toUpperCase() + '-' + waStr_(marketplace).toUpperCase().replace(/\s+/g, '_') + '-' + waStr_(whId);
}
function waNumOrNull_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }

// ---- CONFIG owner (Script Properties) — the ONLY place a Spreadsheet-free Apps Script service is touched ----------
function warehouseAllocationConfigIo_() {
  return {
    getConfig: function () { return PropertiesService.getScriptProperties().getProperty(WAREHOUSE_ALLOCATION_CONFIG_PROP_KEY_); },
    setConfig: function (v) { PropertiesService.getScriptProperties().setProperty(WAREHOUSE_ALLOCATION_CONFIG_PROP_KEY_, v); },
    stamp: function () { try { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) { return ''; } }
  };
}

// ---- PURE — parse the stored blob. Absent/empty/corrupt → { version, scopes:{} }. NEVER throws. ------------------
function warehouseAllocationParseConfig_(raw) {
  var cfg = { version: WAREHOUSE_ALLOCATION_CONFIG_VERSION_, scopes: {} };
  try { var p = JSON.parse(raw); if (p && p.scopes && typeof p.scopes === 'object') cfg.scopes = p.scopes; } catch (e) { cfg.scopes = {}; }
  return cfg;
}
function warehouseAllocationSerializeConfig_(cfg) {
  return JSON.stringify({ version: WAREHOUSE_ALLOCATION_CONFIG_VERSION_, scopes: (cfg && cfg.scopes) || {} });
}

// ---- PURE — materialize the config into snake-case allocation-rule rows KMDA consumes (all scopes, or one scope). --
// One row per (scope × configured warehouse). status is always 'active' (the blob holds only the current membership;
// deactivation = removal from the blob, not a retained inactive row). effective_from/_to are open so the injected
// effectiveDate always matches (the config is the current authority; no historical periods stored in the blob).
function warehouseAllocationConfigToRuleRows_(cfg, scope) {
  cfg = cfg || { scopes: {} };
  var rows = [];
  var scoped = scope && (waStr_(scope.company) || waStr_(scope.country) || waStr_(scope.marketplace));
  Object.keys(cfg.scopes || {}).forEach(function (k) {
    var sc = cfg.scopes[k];
    if (!sc || !Array.isArray(sc.warehouses)) return;
    if (scoped) {
      if (waStr_(sc.company) !== waStr_(scope.company) || waStr_(sc.country) !== waStr_(scope.country) || waStr_(sc.marketplace) !== waStr_(scope.marketplace)) return;
    }
    sc.warehouses.forEach(function (w) {
      var whId = waStr_(w.warehouse_id || w.warehouseId);
      if (!whId) return;
      rows.push({
        allocation_rule_id: waRuleId_(sc.company, sc.country, sc.marketplace, whId),
        company: waStr_(sc.company), country: waStr_(sc.country), marketplace: waStr_(sc.marketplace),
        destination_warehouse_id: whId,
        forecast_allocation_ratio: waNumOrNull_(w.forecast_ratio !== undefined ? w.forecast_ratio : w.forecastRatio),
        sales_allocation_ratio: waNumOrNull_(w.sales_ratio !== undefined ? w.sales_ratio : w.salesRatio),
        status: 'active', effective_from: '', effective_to: ''
      });
    });
  });
  return rows;
}

// ---- PURE — upsert ONE scope's warehouses into the config, returning a NEW config object (atomic scope replace). ---
// `warehouses` = the planner's upserts [{destinationWarehouseId, forecastRatio, salesRatio}]. The scope's warehouse
// list is REPLACED wholesale (the save is a full-scope reconciliation): warehouses not in `warehouses` are dropped
// (deactivated). An empty warehouses array is never written here — the writer guards NO_WAREHOUSE_SELECTED upstream.
function warehouseAllocationUpsertScope_(cfg, scope, warehouses, actor, stamp) {
  var scopes = (cfg && cfg.scopes && typeof cfg.scopes === 'object') ? cfg.scopes : {};
  var next = {};
  Object.keys(scopes).forEach(function (k) { next[k] = scopes[k]; });   // shallow clone (never mutate input)
  var key = waScopeKey_(scope.company, scope.country, scope.marketplace);
  next[key] = {
    company: waStr_(scope.company), country: waStr_(scope.country), marketplace: waStr_(scope.marketplace),
    warehouses: (warehouses || []).map(function (w) {
      return { warehouse_id: waStr_(w.destinationWarehouseId || w.warehouse_id || w.warehouseId), forecast_ratio: Number(w.forecastRatio !== undefined ? w.forecastRatio : w.forecast_ratio), sales_ratio: Number(w.salesRatio !== undefined ? w.salesRatio : w.sales_ratio) };
    }),
    updated_by: waStr_(actor) || 'operation-system', updated_at: waStr_(stamp)
  };
  return { version: WAREHOUSE_ALLOCATION_CONFIG_VERSION_, scopes: next };
}

// ---- Backend materializer — the SOLE server planning authority (used by 42_ recoWsExpandWarehouse_). --------------
// Reads the config ONCE and returns ALL-scope rule rows (the caller filters by scope via KMDA.readActiveAllocationRules).
// Headless: PropertiesService only — no browser session, no Sheet tab. io injectable for tests.
function warehouseAllocationRuleRows_(io) {
  io = io || warehouseAllocationConfigIo_();
  return warehouseAllocationConfigToRuleRows_(warehouseAllocationParseConfig_(io.getConfig()), null);
}

// Server planning snapshot — the config materialized into the SAME {headers, rows} 2D shape KMPS.readCanonicalSnapshots
// produces for the `replenishmentDemandAllocationRules` key, so the recommendation workspace can override that snapshot
// with the config at its read boundary (42_) WITHOUT changing the storage-agnostic expander. Headless (Script Property
// only). Column order matches the canonical rule-row header contract.
function warehouseAllocationSnapshot_(io) {
  var rows = warehouseAllocationRuleRows_(io);
  var headers = ['allocation_rule_id', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'forecast_allocation_ratio', 'sales_allocation_ratio', 'status', 'effective_from', 'effective_to'];
  var values = rows.map(function (r) { return [r.allocation_rule_id, r.company, r.country, r.marketplace, r.destination_warehouse_id, r.forecast_allocation_ratio, r.sales_allocation_ratio, r.status, r.effective_from, r.effective_to]; });
  return { headers: headers, rows: values };
}

// ---- READ handler — router action `warehouseAllocation.get`. Returns the saved allocations for ONE scope (for the ---
// modal hydrate). body = { payload:{ scope:{company,country,marketplace} } } | { scope }. READ-ONLY (opening the
// modal mutates nothing). Absent config / absent scope → empty allocations (never a fabricated default ratio).
function handleWarehouseAllocationConfigGet_(body) {
  body = body || {};
  var scope = (body.payload && body.payload.scope) || body.scope || {};
  var cfg = warehouseAllocationParseConfig_(warehouseAllocationConfigIo_().getConfig());
  var rows = warehouseAllocationConfigToRuleRows_(cfg, scope);
  return jsonResponse_({
    success: true, data: {
      company: waStr_(scope.company), country: waStr_(scope.country), marketplace: waStr_(scope.marketplace),
      allocations: rows.map(function (r) {
        return { destination_warehouse_id: r.destination_warehouse_id, forecast_ratio: r.forecast_allocation_ratio, sales_ratio: r.sales_allocation_ratio, status: 'active', allocation_rule_id: r.allocation_rule_id };
      })
    }
  });
}
