// Kitchen Mama Operation System — API FOUNDATION (Phase API-1, Round A).
// -----------------------------------------------------------------------------
// A PURE, DEPENDENCY-FREE, ZERO-BUSINESS-LOGIC transport-foundation layer that becomes the base of the
// future Workspace API. It ONLY routes; it authors no domain calculation, no allocation, no recommendation,
// no submit, no formula. Every existing page keeps working unchanged: with the feature flag OFF
// (USE_WORKSPACE_API = false, the production default) every request delegates to the legacy surface
// (`window.KM.DB.*` / `WEB_APP_FETCH`) exactly as today.
//
// Architecture (each layer is independent + separately testable):
//     ApiClient  →  ApiTransport  →  ApiDispatcher  →  WorkspaceResolver  →  ResponseEnvelope
//                              ↘  ErrorEnvelope   ↘  Cache (memory only, TTL=0)  ↘  LegacyAdapter
//
// Contracts frozen here:
//   • Response envelope : { success, data, meta, errors }
//   • Error envelope    : errors[] of { code, message, details }  — NEVER a raw thrown String.
//   • Feature flag       : USE_WORKSPACE_API (default false → legacy).
//   • Workspace Registry : the 7 domain workspaces are REGISTERED only (not implemented this round).
//   • Security           : forbidden schema/structural operations (create sheet / append header /
//                          modify schema / migrate) are refused at the API boundary, mirroring KMSAFE
//                          (S0.5). The server-side KMSAFE gate remains the ultimate authority; this is a
//                          redundant client-side fail-closed guard.
//
// Determinism: no wall-clock reads, no RNG, no locale collation. Input is never mutated. Envelopes are JSON-safe.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.apiFoundation = api;                       // the factory/namespace
    if (!window.KM.api) { window.KM.api = api.createDefault(); }   // the default live instance (inert while flag is off)
  }
  if (typeof root !== 'undefined' && root) { root.KMAPI = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var API_VERSION = '1';

  // ---- feature flag (production default = legacy) --------------------------------------------------------
  var FEATURE_FLAGS_DEFAULT = { USE_WORKSPACE_API: false };

  // ---- enums ---------------------------------------------------------------------------------------------
  var REQUEST_KIND = { WORKSPACE: 'workspace', COMMAND: 'command' };
  var SOURCE = { LEGACY: 'legacy', WORKSPACE: 'workspace', GUARD: 'guard' };
  var WORKSPACE_STATUS = { REGISTERED: 'REGISTERED', IMPLEMENTED: 'IMPLEMENTED' };

  // ---- canonical error taxonomy (structured; never a bare string) ---------------------------------------
  var API_ERROR_CODES = {
    INVALID_REQUEST: 'INVALID_REQUEST',
    UNKNOWN_ACTION: 'UNKNOWN_ACTION',
    UNKNOWN_WORKSPACE: 'UNKNOWN_WORKSPACE',
    WORKSPACE_NOT_IMPLEMENTED: 'WORKSPACE_NOT_IMPLEMENTED',
    FORBIDDEN_OPERATION: 'FORBIDDEN_OPERATION',
    LEGACY_ADAPTER_MISSING: 'LEGACY_ADAPTER_MISSING',
    TRANSPORT_NOT_CONFIGURED: 'TRANSPORT_NOT_CONFIGURED',
    TRANSPORT_URL_INVALID: 'TRANSPORT_URL_INVALID',
    TRANSPORT_ERROR: 'TRANSPORT_ERROR',
    TRANSPORT_NON_JSON_RESPONSE: 'TRANSPORT_NON_JSON_RESPONSE',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
  };

  // ---- forbidden schema/structural operations (mirror of KMSAFE S0/S0.5 STRUCTURAL_OPS + schema verbs) ---
  // Authority is server-side KMSAFE (supply-planning-production-safety.js). This frozen mirror lets the API
  // boundary fail-closed WITHOUT a load-order dependency on the safety bundle; a caller may inject extra
  // forbidden tokens. Matching is exact (case-insensitive) OR by a forbidden verb prefix.
  var FORBIDDEN_ACTIONS = [
    // ── exact KMSAFE STRUCTURAL_OPS mirror (structural / destructive sheet APIs) ──
    'clear', 'clearContent', 'clearContents', 'deleteRow', 'deleteRows', 'deleteColumn', 'deleteColumns',
    'insertRowsBefore', 'insertRowsAfter', 'insertColumnsBefore', 'insertColumnsAfter', 'insertColumns', 'insertColumn',
    'deleteSheet', 'insertSheet', 'copyTo', 'moveTo', 'setName', 'renameSheet', 'resetSheet', 'reinitializeSheet',
    // ── KMSAFE WHOLE_SHEET_OPS mirror ──
    'wholeSheetSetValues', 'replaceSheet', 'rebuildSheet',
    // ── header-write + schema-migration verbs (S0.5 barriers) ──
    'createSheet', 'insertRow', 'insertRows', 'appendHeader', 'writeHeader', 'setHeader',
    'modifySchema', 'alterSchema', 'migrate', 'migrateSchema', 'runMigration', 'provisionSchema', 'clearSheet'
  ];
  var FORBIDDEN_VERB_PREFIXES = ['createsheet', 'insertsheet', 'deletesheet', 'appendheader', 'writeheader',
    'modifyschema', 'alterschema', 'migrate', 'provisionschema', 'insertcolumn', 'deletecolumn',
    'clearsheet', 'replacesheet', 'rebuildsheet'];

  // ---- the 7 domain workspaces (REGISTERED only this round) ---------------------------------------------
  var DEFAULT_WORKSPACES = [
    { name: 'weeklyShipping', label: 'Weekly Shipping',
      tables: ['shipping_plans', 'shipping_plan_lines', 'carriers', 'carrier_rate_cards', 'sku_details'], legacyRead: 'getOperationDb' },
    { name: 'inventoryReplenishment', label: 'Inventory Replenishment',
      tables: ['marketplace_skus', 'sku_details', 'overseas_inventory_snapshot', 'amazon_inventory_snapshot', 'fc_regular_forecast', 'shipping_allocation_drafts'], legacyRead: 'getOperationDb' },
    { name: 'requestOrder', label: 'Request Order',
      tables: ['request_orders', 'request_order_lines', 'request_order_line_sources', 'fc_regular_forecast', 'marketplace_skus'], legacyRead: 'getOperationDb' },
    { name: 'purchaseOrder', label: 'Purchase Order',
      tables: ['purchase_orders', 'purchase_order_lines', 'request_orders'], legacyRead: 'getOperationDb' },
    { name: 'shipment', label: 'Shipment',
      tables: ['shipments', 'shipment_lines', 'shipping_plans', 'carriers', 'warehouses'], legacyRead: 'getOperationDb' },
    { name: 'fcSummary', label: 'FC Summary',
      tables: ['fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'campaigns', 'campaign_sku_lines', 'marketplace_skus'], legacyRead: 'getOperationDb' },
    { name: 'skuDetails', label: 'SKU Details',
      tables: ['sku_details', 'tax_referral_rates', 'tax_rate_components', 'marketplace_skus', 'sku_regional_details'], legacyRead: 'getOperationDb' },
    // Recommendation READ-ONLY workspace (F1-4B-A) — targeted canonical tables consumed by KMPA/KMPS (never getOperationDb).
    { name: 'recommendation', label: 'Recommendation',
      tables: ['sku_details', 'marketplace_skus', 'warehouses', 'marketplaces', 'fc_regular_forecast', 'fc_special_events',
        'amazon_inventory_snapshot', 'overseas_inventory_snapshot', 'factory_stock', 'shipping_plans', 'shipments'], legacyRead: 'getOperationDb' }
  ];

  // ---- small helpers -------------------------------------------------------------------------------------
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function normName(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function lc(v) { return normName(v).toLowerCase(); }

  // =======================================================================================================
  // FACTORY — every dependency is injectable so the whole layer is deterministically testable.
  // =======================================================================================================
  function createApiFoundation(deps) {
    deps = deps || {};

    var flags = {};
    (function () { for (var k in FEATURE_FLAGS_DEFAULT) flags[k] = FEATURE_FLAGS_DEFAULT[k]; })();
    if (isObj(deps.flags)) { for (var f in deps.flags) flags[f] = deps.flags[f]; }

    // Legacy authority is resolved at CALL TIME (never captured once) unless a fixed instance is injected
    // (tests). This prevents a stale-KM.DB reference if window.KM.DB is attached/replaced after the
    // Foundation loads — the LegacyAdapter always delegates to the currently-active KM.DB. (API-1.5 fix.)
    var injectedLegacy = deps.legacy || null;
    function resolveLegacy() {
      if (injectedLegacy) return injectedLegacy;
      return (typeof window !== 'undefined' && window.KM && window.KM.DB) || {};
    }

    // ---- forbidden set (frozen mirror + optional injected extras) --------------------------------------
    var _forbidden = {};
    FORBIDDEN_ACTIONS.forEach(function (a) { _forbidden[lc(a)] = true; });
    if (Array.isArray(deps.forbidden)) { deps.forbidden.forEach(function (a) { _forbidden[lc(a)] = true; }); }
    function isForbiddenAction(action) {
      var a = lc(action);
      if (a === '') return false;
      if (_forbidden[a] === true) return true;
      for (var i = 0; i < FORBIDDEN_VERB_PREFIXES.length; i++) { if (a.indexOf(FORBIDDEN_VERB_PREFIXES[i]) === 0) return true; }
      return false;
    }

    // ---- ResponseEnvelope + ErrorEnvelope (the ONLY shapes crossing the boundary) ---------------------
    function buildMeta(extra) {
      var m = { apiVersion: API_VERSION, source: null, mode: null, workspace: null, action: null, cached: false };
      if (isObj(extra)) { for (var k in extra) m[k] = extra[k]; }
      return m;
    }
    function buildResponse(data, meta) {
      return { success: true, data: (data === undefined ? null : data), meta: buildMeta(meta), errors: [] };
    }
    function buildError(code, message, details, meta) {
      return {
        success: false, data: null, meta: buildMeta(meta),
        errors: [{ code: normName(code) || API_ERROR_CODES.INTERNAL_ERROR, message: String(message == null ? code : message), details: (details === undefined ? null : details) }]
      };
    }
    // Map any thrown value → structured error envelope (NEVER re-throw a string).
    function errorFromException(err, meta) {
      var code = API_ERROR_CODES.INTERNAL_ERROR, msg = 'internal error', details = null;
      if (err && typeof err === 'object') {
        if (err.apiCode) code = err.apiCode;
        else if (err.safetyToken) { code = API_ERROR_CODES.FORBIDDEN_OPERATION; details = { safetyToken: err.safetyToken }; }
        else code = API_ERROR_CODES.TRANSPORT_ERROR;
        msg = err.message ? String(err.message) : code;
        // A non-JSON transport response carries SAFE diagnostic fields (status / content-type / sanitized
        // prefix) — surfaced in details so the page can show an honest cause, never the full HTML / secrets.
        if (code === API_ERROR_CODES.TRANSPORT_NON_JSON_RESPONSE) {
          details = { httpStatus: (err.transportStatus === undefined ? null : err.transportStatus),
            contentType: err.transportContentType || null, responsePrefix: err.responsePrefix || null };
        }
      } else if (typeof err === 'string') { code = API_ERROR_CODES.TRANSPORT_ERROR; msg = err; }
      return buildError(code, msg, details, meta);
    }

    // ---- SAFE response parsing (Hotfix — non-JSON never reaches a blind JSON.parse) --------------------
    // The single guard between the network Response and the canonical envelope. Apps Script can return an
    // HTML page instead of JSON — a Google login/redirect page (wrong "who has access"), an exception page,
    // a stale/wrong deployment, or a GitHub Pages fallback. A blind resp.json() would then throw the opaque
    // "Unexpected token '<' … is not valid JSON" and surface as a bare TRANSPORT_ERROR. Instead we read the
    // body as TEXT, detect a non-JSON/HTML body, and throw a STRUCTURED TRANSPORT_NON_JSON_RESPONSE carrying
    // ONLY safe diagnostics (HTTP status, Content-Type, a sanitized ≤200-char prefix). Never the full HTML.
    function _safeResponsePrefix(s) {
      var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
      if (t.length > 200) t = t.slice(0, 200) + '…';
      return t;
    }
    function _nonJsonError(status, ctype, body) {
      var e = new Error('Server returned a non-JSON response (HTTP ' + (status == null ? '?' : status) + ', ' +
        (ctype || 'unknown content-type') + '). The endpoint likely returned an HTML page (login / redirect / ' +
        'error / wrong URL) instead of the JSON API envelope.');
      e.apiCode = API_ERROR_CODES.TRANSPORT_NON_JSON_RESPONSE;
      e.transportStatus = (typeof status === 'number') ? status : null;
      e.transportContentType = ctype || null;
      e.responsePrefix = _safeResponsePrefix(body);
      return e;
    }
    function _parseJsonTextOrThrow(raw, status, ctype) {
      var text = (typeof raw === 'string') ? raw : (raw == null ? '' : String(raw));
      var trimmed = text.replace(/^﻿/, '').trim();
      if (trimmed === '' || /^<(!doctype|html|\?xml|head|body)/i.test(trimmed)) throw _nonJsonError(status, ctype, trimmed);
      try { return JSON.parse(trimmed); } catch (e) { throw _nonJsonError(status, ctype, trimmed); }
    }
    function safeReadJsonResponse(resp) {
      if (!resp || typeof resp !== 'object') return resp;   // already a parsed value (some injected fetchers)
      var status = (typeof resp.status === 'number') ? resp.status : null;
      var ctype = '';
      try { if (resp.headers && typeof resp.headers.get === 'function') ctype = resp.headers.get('content-type') || ''; } catch (e0) { /* ignore */ }
      // Prefer text() so a non-JSON body never throws an opaque SyntaxError inside json().
      if (typeof resp.text === 'function') {
        return Promise.resolve(resp.text()).then(function (raw) { return _parseJsonTextOrThrow(raw, status, ctype); });
      }
      // Response-like with only json() (e.g. injected test fetchers) → guard the parse so a non-JSON/HTML
      // body still becomes a structured TRANSPORT_NON_JSON_RESPONSE instead of an opaque rejection.
      if (typeof resp.json === 'function') {
        return Promise.resolve().then(function () { return resp.json(); }).then(function (v) { return v; },
          function (err) { throw _nonJsonError(status, ctype, (err && err.message) || ''); });
      }
      return resp;   // plain object → already the parsed envelope
    }

    // ---- Cache Layer (memory only; TTL = 0 → interface present, never actually caches) -----------------
    var _cacheStore = {};
    var cache = {
      ttl: 0,
      get: function (/* key */) { return null; },                 // TTL=0 ⇒ always a miss (no stale data)
      set: function (key, val) { if (this.ttl > 0 && key != null) { _cacheStore[String(key)] = val; } return val; },
      invalidate: function (key) { if (key != null) delete _cacheStore[String(key)]; },
      clear: function () { _cacheStore = {}; },
      size: function () { return Object.keys(_cacheStore).length; }
    };

    // ---- Workspace Registry + WorkspaceResolver --------------------------------------------------------
    var _registry = {};
    function register(name, def) {
      var n = normName(name);
      if (n === '') { var e = new Error('workspace name required'); e.apiCode = API_ERROR_CODES.INVALID_REQUEST; throw e; }
      def = def || {};
      _registry[n] = {
        name: n, label: def.label || n, status: def.status || WORKSPACE_STATUS.REGISTERED,
        tables: Array.isArray(def.tables) ? def.tables.slice() : [],
        legacyRead: def.legacyRead || 'getOperationDb',
        resolver: (typeof def.resolver === 'function') ? def.resolver : null
      };
      return _registry[n];
    }
    function getWorkspace(name) { return _registry[normName(name)] || null; }
    function hasWorkspace(name) { return Object.prototype.hasOwnProperty.call(_registry, normName(name)); }
    function listWorkspaces() { return Object.keys(_registry).map(function (k) {
      var d = _registry[k]; return { name: d.name, label: d.label, status: d.status, tables: d.tables.slice(), implemented: d.status === WORKSPACE_STATUS.IMPLEMENTED }; }); }
    function resolveWorkspace(name) {
      var d = getWorkspace(name);
      if (!d) return { found: false, status: null, implemented: false, def: null };
      return { found: true, status: d.status, implemented: d.status === WORKSPACE_STATUS.IMPLEMENTED, def: d };
    }
    // seed the 7 registered workspaces (a caller may override with deps.workspaces)
    (Array.isArray(deps.workspaces) ? deps.workspaces : DEFAULT_WORKSPACES).forEach(function (w) { register(w.name, w); });

    // ---- LegacyAdapter — the backward-compatibility bridge to KM.DB.* / WEB_APP_FETCH ------------------
    var legacyAdapter = {
      resolve: resolveLegacy,
      hasCommand: function (action) { return typeof resolveLegacy()[normName(action)] === 'function'; },
      command: function (action, payload) {
        var lg = resolveLegacy(), a = normName(action);
        if (typeof lg[a] !== 'function') { var e = new Error('legacy command not found: ' + a); e.apiCode = API_ERROR_CODES.UNKNOWN_ACTION; return Promise.reject(e); }
        try { return Promise.resolve(lg[a](payload)); } catch (err) { return Promise.reject(err); }   // preserve a legacy throw as a rejection (→ structured error)
      },
      read: function (name, params) {
        var lg = resolveLegacy(), d = getWorkspace(name);
        var reader = (d && d.legacyRead) || 'getOperationDb';
        if (typeof lg[reader] !== 'function') { var e = new Error('legacy reader not found: ' + reader); e.apiCode = API_ERROR_CODES.LEGACY_ADAPTER_MISSING; return Promise.reject(e); }
        try { return Promise.resolve(lg[reader](params)); } catch (err) { return Promise.reject(err); }
      }
    };

    // ---- ApiTransport (Hotfix T1) — Workspace POST/GET over the EXISTING canonical Web App endpoint. --------
    // The URL is resolved AT CALL TIME (never captured once) from the single frontend authority — no duplicate
    // literal URL lives here. Priority: injected deps.baseUrl / deps.getBaseUrl (tests) → window.KM.DB.getApiBaseUrl()
    // → window.KM.config.operationDbWebAppUrl. Blank → TRANSPORT_NOT_CONFIGURED; present-but-malformed → TRANSPORT_URL_INVALID.
    var _fetcher = (typeof deps.fetch === 'function') ? deps.fetch : (typeof fetch !== 'undefined' ? fetch : null);
    function txErr(code, msg) { var e = new Error(msg || code); e.apiCode = code; return e; }
    function resolveBaseUrl() {
      if (typeof deps.baseUrl === 'string' && deps.baseUrl) return deps.baseUrl;
      if (typeof deps.getBaseUrl === 'function') { try { var u0 = deps.getBaseUrl(); if (u0) return String(u0); } catch (e) { /* fall through */ } }
      if (typeof window !== 'undefined' && window.KM) {
        if (window.KM.DB && typeof window.KM.DB.getApiBaseUrl === 'function') { try { var u1 = window.KM.DB.getApiBaseUrl(); if (u1) return String(u1); } catch (e2) { /* fall through */ } }
        if (window.KM.config && window.KM.config.operationDbWebAppUrl) return String(window.KM.config.operationDbWebAppUrl);
      }
      return '';
    }
    function classifyUrl(u) {
      var s = (typeof u === 'string') ? u.trim() : '';
      if (s === '') return { ok: false, code: API_ERROR_CODES.TRANSPORT_NOT_CONFIGURED };
      var isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(s);
      var isHttps = s.indexOf('https://') === 0;
      if (!isHttps && !isLocal) return { ok: false, code: API_ERROR_CODES.TRANSPORT_URL_INVALID };
      if (!/^https?:\/\/[^\s]+$/.test(s)) return { ok: false, code: API_ERROR_CODES.TRANSPORT_URL_INVALID };
      return { ok: true, url: s };
    }
    function maskEndpoint(u) {
      if (!u) return '';
      var m = String(u).match(/^(https?:\/\/[^/]+)\//);
      var origin = m ? m[1] : String(u);
      return /script\.google\.com/.test(u) ? (origin + '/.../exec') : (origin + '/...');   // never expose the Script ID
    }
    var transport = {
      resolveBaseUrl: resolveBaseUrl,
      safeReadJsonResponse: safeReadJsonResponse,   // SAFE parse: non-JSON/HTML → structured TRANSPORT_NON_JSON_RESPONSE
      configured: function () { return typeof _fetcher === 'function' && classifyUrl(resolveBaseUrl()).ok; },
      get: function (params) {
        if (typeof _fetcher !== 'function') return Promise.reject(txErr(API_ERROR_CODES.TRANSPORT_NOT_CONFIGURED, 'no fetch available'));
        var c = classifyUrl(resolveBaseUrl());
        if (!c.ok) return Promise.reject(txErr(c.code));
        var qs = isObj(params) ? params : {};
        var url = c.url + (c.url.indexOf('?') < 0 ? '?' : '&') + Object.keys(qs).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]); }).join('&');
        return _fetcher(url, { method: 'GET', cache: 'no-store' });
      },
      post: function (body, opts) {
        if (typeof _fetcher !== 'function') return Promise.reject(txErr(API_ERROR_CODES.TRANSPORT_NOT_CONFIGURED, 'no fetch available'));
        var c = classifyUrl(resolveBaseUrl());
        if (!c.ok) return Promise.reject(txErr(c.code));
        var init = { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(isObj(body) ? body : {}) };
        if (opts && opts.signal) init.signal = opts.signal;   // AbortSignal end-to-end (no client double-request)
        return _fetcher(c.url, init);
      }
    };
    function getTransportStatus() {
      var u = resolveBaseUrl(), c = classifyUrl(u);
      var source = (typeof deps.baseUrl === 'string' && deps.baseUrl) ? 'deps'
        : (typeof deps.getBaseUrl === 'function') ? 'deps.getBaseUrl'
        : (typeof window !== 'undefined' && window.KM && window.KM.DB && typeof window.KM.DB.getApiBaseUrl === 'function') ? 'KM.DB'
        : (typeof window !== 'undefined' && window.KM && window.KM.config && window.KM.config.operationDbWebAppUrl) ? 'KM.config' : 'none';
      return { configured: (typeof _fetcher === 'function') && c.ok, source: source, maskedEndpoint: c.ok ? maskEndpoint(c.url) : '', urlStatus: c.ok ? 'ok' : c.code, weeklyEnabled: workspaceApiActive('weeklyShipping') };
    }

    // ---- API-2 · per-workspace feature flag (global master AND per-workspace enable) --------------------
    // CANONICAL (production-cutover) workspaces have completed their READ cutover and are ACTIVE BY DEFAULT,
    // INDEPENDENT of the global master USE_WORKSPACE_API flag. For a canonical workspace the ONLY gate — and
    // the single emergency kill switch — is its per-workspace flag: setWorkspaceEnabled(name, false). This is
    // NOT a second overlapping flag; it REMOVES the master-flag dependency for that one workspace so normal
    // page usage reaches the canonical Runtime without any console command (F1-4B-FM2B production cutover).
    // Non-canonical workspaces keep the hybrid gate (master AND per-workspace, both default false).
    // F1-7B-R1: weeklyShipping READ is now production-canonical (its API-3A read cutover is complete + verified).
    // Canonical = master-flag-independent; the ONLY gate/kill-switch is setWorkspaceEnabled('weeklyShipping', false).
    // F1-7C: purchaseOrder READ is now production-canonical too.
    var WORKSPACE_CANONICAL = { recommendation: true, weeklyShipping: true, purchaseOrder: true, requestOrder: true, shipment: true, fcSummary: true, skuDetails: true, inventoryReplenishment: true };
    var WORKSPACE_ENABLED_DEFAULT = { weeklyShipping: true, inventoryReplenishment: true, requestOrder: true, purchaseOrder: true, shipment: true, fcSummary: true, skuDetails: true, recommendation: true };
    var wsEnabled = {}; for (var _w in WORKSPACE_ENABLED_DEFAULT) wsEnabled[_w] = WORKSPACE_ENABLED_DEFAULT[_w];
    if (isObj(deps.workspaceFlags)) { for (var _wf in deps.workspaceFlags) wsEnabled[_wf] = deps.workspaceFlags[_wf] === true; }
    function getWorkspaceFlags() { var o = {}; for (var k in wsEnabled) o[k] = wsEnabled[k]; return o; }
    function isCanonicalWorkspace(name) { return WORKSPACE_CANONICAL[normName(name)] === true; }
    function setWorkspaceEnabled(name, on) { var n = normName(name); wsEnabled[n] = !!on; return wsEnabled[n]; }
    // F1-7N-FA-3C-R6E-P0 — Request Order "Site Confirm required" capability. Backend-owned flag (00_config.gs
    // REQUEST_ORDER_SITE_CONFIRM_REQUIRED_), MIRRORED here so the UI reflects backend authority — the exact pattern used
    // for the workspace-enabled defaults above. Default-of-record is TRUE; it is set FALSE for the R6E controlled
    // Request-Order-Send test so Send does not reject SOLELY because Site Confirm is absent (every OTHER Send gate stays
    // mandatory). Reversible: setRequestOrderSiteConfirmRequired(true) restores the original Site Confirm gate exactly.
    // ONE logical flag across layers — keep this default in sync with 00_config.gs (same value).
    var _siteConfirmRequired = (typeof deps.requestOrderSiteConfirmRequired === 'boolean') ? deps.requestOrderSiteConfirmRequired : false;
    function requestOrderSiteConfirmRequired() { return _siteConfirmRequired === true; }
    function setRequestOrderSiteConfirmRequired(on) { _siteConfirmRequired = (on === true); return _siteConfirmRequired; }
    function workspaceApiActive(name) {
      var n = normName(name);
      var d = getWorkspace(n); var impl = d && d.status === WORKSPACE_STATUS.IMPLEMENTED && typeof d.resolver === 'function';
      if (!impl) return false;
      // canonical workspace → master-flag-independent; gate is solely the per-workspace kill switch.
      if (WORKSPACE_CANONICAL[n] === true) return wsEnabled[n] === true;
      return flags.USE_WORKSPACE_API === true && wsEnabled[n] === true;
    }
    // Gate: CANONICAL → per-workspace flag ONLY (default ON; kill switch = setWorkspaceEnabled(name,false)).
    // Non-canonical → master OFF → legacy always; master ON + IMPLEMENTED → needs the per-workspace flag;
    // master ON + UNIMPLEMENTED → workspace path (→ WORKSPACE_NOT_IMPLEMENTED, no silent legacy fallback).
    // No dual execution: exactly one branch runs.
    function effectiveMode(name) {
      var n = normName(name);
      var d = getWorkspace(n);
      var impl = d && d.status === WORKSPACE_STATUS.IMPLEMENTED && typeof d.resolver === 'function';
      if (WORKSPACE_CANONICAL[n] === true) {
        if (!impl) return SOURCE.LEGACY;   // canonical but somehow unimplemented → fail safe to legacy
        return wsEnabled[n] === true ? SOURCE.WORKSPACE : SOURCE.LEGACY;
      }
      if (flags.USE_WORKSPACE_API !== true) return SOURCE.LEGACY;
      if (!impl) return SOURCE.WORKSPACE;
      return wsEnabled[n] === true ? SOURCE.WORKSPACE : SOURCE.LEGACY;
    }

    // ---- API-2 · requestId (correlation, NOT idempotency) + call sequence (stale-response protection) ---
    var _idSeq = 0, _callSeq = 0;
    var _idGen = (typeof deps.idGen === 'function') ? deps.idGen : function () { _idSeq++; return 'REQ-C' + ('000000' + _idSeq).slice(-6); };
    function makeRequestId(provided) { var p = normName(provided); return /^REQ-[A-Za-z0-9_-]{1,40}$/.test(p) ? p : _idGen(); }

    // ---- API-2 · workspace transport invoke → parsed canonical envelope (tests inject deps.workspaceInvoke) --
    var _workspaceInvoke = (typeof deps.workspaceInvoke === 'function') ? deps.workspaceInvoke : function (action, dto, signal) {
      // transport.post resolves the canonical URL at call time and rejects with the specific transport code
      // (TRANSPORT_NOT_CONFIGURED / TRANSPORT_URL_INVALID) — surfaced verbatim via errorFromException.
      return transport.post(dto, { signal: signal }).then(function (resp) { return safeReadJsonResponse(resp); });
    };

    // ---- API-2 · Weekly Shipping READ workspace resolver (the FIRST implemented workspace) ---------------
    function buildWeeklyRequestDTO(params) {
      params = params || {};
      return {
        apiVersion: API_VERSION, action: 'weeklyShipping.workspace.get', requestId: makeRequestId(params.requestId),
        payload: {
          filters: isObj(params.filters) ? params.filters : {},
          search: (params.search == null || params.search === '') ? null : String(params.search),
          sort: (Array.isArray(params.sort) && params.sort.length) ? params.sort : [{ field: 'updated_at', direction: 'desc' }],
          page: { number: (params.page && params.page.number) || 1, size: (params.page && params.page.size) || 25 },
          include: Object.assign({ summary: true, plans: true, details: true, filterOptions: true }, isObj(params.include) ? params.include : {})
        },
        context: { actor: (params.context && params.context.actor) || null, clientVersion: (params.context && params.context.clientVersion) || null }
      };
    }
    function normalizeWorkspaceEnvelope(serverEnv, dto, seq) {
      var meta = { source: SOURCE.WORKSPACE, mode: SOURCE.WORKSPACE, workspace: 'weeklyShipping', action: dto.action, requestId: dto.requestId, sequence: seq, cached: false };
      if (!isObj(serverEnv) || serverEnv.success === undefined) {
        return buildError(API_ERROR_CODES.TRANSPORT_ERROR, 'malformed workspace response', { received: (serverEnv === undefined ? null : serverEnv) }, meta);
      }
      var outMeta = buildMeta(meta);
      if (isObj(serverEnv.meta)) { for (var k in serverEnv.meta) { if (outMeta[k] === null || outMeta[k] === undefined) outMeta[k] = serverEnv.meta[k]; } }
      outMeta.requestId = dto.requestId; outMeta.source = SOURCE.WORKSPACE; outMeta.workspace = 'weeklyShipping'; outMeta.action = dto.action; outMeta.sequence = seq;
      // A server business failure MUST stay success:false (never masked); a nested {success:false} is not a success.
      if (serverEnv.success !== true) {
        // F1-7K-HOTFIX-ROUTER-CLOSURE-R1 — error-envelope hardening. Precedence (unchanged errors[] behavior first):
        //   1. serverEnv.errors[] (array)      → surfaced verbatim (byte-compatible with prior behavior)
        //   2. serverEnv.error (non-empty str) → { code:'BACKEND_ERROR', message: <that string> } — previously DROPPED,
        //      which masked real router-level failures (unknown action / top-level catch) as the generic WORKSPACE_ERROR.
        //   3. neither                         → the generic WORKSPACE_ERROR (unchanged fallback).
        // No stack/secret is exposed beyond the already-returned safe message; success behavior is untouched.
        var _outErrs;
        if (Array.isArray(serverEnv.errors) && serverEnv.errors.length) {
          _outErrs = serverEnv.errors;
        } else if (typeof serverEnv.error === 'string' && serverEnv.error.trim()) {
          _outErrs = [{ code: 'BACKEND_ERROR', message: serverEnv.error, details: null }];
        } else {
          _outErrs = [{ code: 'WORKSPACE_ERROR', message: 'workspace returned failure', details: null }];
        }
        return { success: false, data: null, meta: outMeta, errors: _outErrs };
      }
      return { success: true, data: (serverEnv.data === undefined ? null : serverEnv.data), meta: outMeta, errors: [] };
    }
    function weeklyShippingResolver(params, helpers, opts) {
      var signal = opts && opts.signal, seq = opts && opts.sequence;
      if (signal && signal.aborted) { var e = new Error('aborted'); e.apiCode = 'ABORTED'; return Promise.reject(e); }
      var dto = buildWeeklyRequestDTO(params);
      return Promise.resolve(_workspaceInvoke(dto.action, dto, signal)).then(function (serverEnv) { return normalizeWorkspaceEnvelope(serverEnv, dto, seq); });
    }
    // graduate weeklyShipping from REGISTERED → IMPLEMENTED (keeps its seeded table set)
    register('weeklyShipping', { label: 'Weekly Shipping', tables: getWorkspace('weeklyShipping').tables, legacyRead: 'getOperationDb', status: WORKSPACE_STATUS.IMPLEMENTED, resolver: weeklyShippingResolver });

    // ---- F1-4B-FM1-T · Recommendation READ workspace resolver — SCOPE-ONLY (server owns destination + calc context) --
    // The client sends ONLY the business scope + filters + pagination + include. It NEVER sends destinationWarehouseId,
    // calculationMonth, or planningCycle — the server owns destination fanout (MARKETPLACE vs WAREHOUSE) and the
    // calculation-month authority. No client formula / demandDriver override (Phase-1 driver stays FORECAST server-side).
    function buildRecommendationRequestDTO(params) {
      params = params || {};
      var scope = isObj(params.scope) ? params.scope : {};
      var f = isObj(params.filters) ? params.filters : {};
      return {
        apiVersion: API_VERSION, action: 'recommendation.workspace.get', requestId: makeRequestId(params.requestId),
        payload: {
          scope: {
            company: normName(scope.company) || null, country: normName(scope.country) || null, marketplace: normName(scope.marketplace) || null,
            sku: normName(scope.sku) || null, siteSku: normName(scope.siteSku) || null
          },
          filters: { lts: normName(f.lts) || null, series: normName(f.series) || null, category: normName(f.category) || null, sku: normName(f.sku) || null, siteSku: normName(f.siteSku) || null },
          pagination: { page: (params.pagination && params.pagination.page) || 1, size: (params.pagination && params.pagination.size) || 100 },
          include: Object.assign({ diagnostics: true }, isObj(params.include) ? params.include : {})
        },
        context: { actor: (params.context && params.context.actor) || null, clientVersion: (params.context && params.context.clientVersion) || null }
      };
    }
    function recommendationResolver(params, helpers, opts) {
      var signal = opts && opts.signal, seq = opts && opts.sequence;
      if (signal && signal.aborted) { var e = new Error('aborted'); e.apiCode = 'ABORTED'; return Promise.reject(e); }
      var dto = buildRecommendationRequestDTO(params);
      return Promise.resolve(_workspaceInvoke(dto.action, dto, signal)).then(function (serverEnv) {
        // reuse the canonical normalizer, then relabel the workspace/action for this resolver.
        var env = normalizeWorkspaceEnvelope(serverEnv, dto, seq);
        env.meta.workspace = 'recommendation'; env.meta.action = dto.action;
        recordRecoDiag_(dto, env);   // F1-4B-FM2A: capture safe last-request telemetry for the console diagnostic
        return env;
      });
    }
    register('recommendation', { label: 'Recommendation', tables: getWorkspace('recommendation').tables, legacyRead: 'getOperationDb', status: WORKSPACE_STATUS.IMPLEMENTED, resolver: recommendationResolver });

    // ---- F1-7C · Purchase Order READ workspace resolver -----------------------------------------------------
    // Scoped read for the PO pages. The client sends filters/sort/page/include; the server (50_) owns the read-model,
    // including the CANONICAL remaining_qty = max(0, completed - shipped). No client formula, no FIFO, no shipment calc.
    function buildPurchaseOrderRequestDTO(params) {
      params = params || {};
      return {
        apiVersion: API_VERSION, action: 'purchaseOrder.workspace.get', requestId: makeRequestId(params.requestId),
        payload: {
          filters: isObj(params.filters) ? params.filters : {},
          search: (params.search == null || params.search === '') ? null : String(params.search),
          sort: (Array.isArray(params.sort) && params.sort.length) ? params.sort : [{ field: 'order_date', direction: 'desc' }],
          page: { number: (params.page && params.page.number) || 1, size: (params.page && params.page.size) || 2000 },
          include: Object.assign({ summary: true, orders: true, details: true, filterOptions: true }, isObj(params.include) ? params.include : {})
        },
        context: { actor: (params.context && params.context.actor) || null, clientVersion: (params.context && params.context.clientVersion) || null }
      };
    }
    function purchaseOrderResolver(params, helpers, opts) {
      var signal = opts && opts.signal, seq = opts && opts.sequence;
      if (signal && signal.aborted) { var e = new Error('aborted'); e.apiCode = 'ABORTED'; return Promise.reject(e); }
      var dto = buildPurchaseOrderRequestDTO(params);
      return Promise.resolve(_workspaceInvoke(dto.action, dto, signal)).then(function (serverEnv) {
        var env = normalizeWorkspaceEnvelope(serverEnv, dto, seq);
        env.meta.workspace = 'purchaseOrder'; env.meta.action = dto.action;
        return env;
      });
    }
    register('purchaseOrder', { label: 'Purchase Order', tables: getWorkspace('purchaseOrder').tables, legacyRead: 'getOperationDb', status: WORKSPACE_STATUS.IMPLEMENTED, resolver: purchaseOrderResolver });

    // ---- F1-7D · Request Order READ workspace resolver ------------------------------------------------------
    // Scoped read for the Request Order Draft page (persisted Draft/Pending/Approved cards). The client sends
    // filters/search/sort/page/include; the server (51_) composes ONLY persisted request_orders/request_order_lines
    // (+ the masters the page consumes). NO Gap/Forecast/Recommendation, NO draft generation/persistence, NO RO->PO.
    function buildRequestOrderRequestDTO(params) {
      params = params || {};
      return {
        apiVersion: API_VERSION, action: 'requestOrder.workspace.get', requestId: makeRequestId(params.requestId),
        payload: {
          filters: isObj(params.filters) ? params.filters : {},
          search: (params.search == null || params.search === '') ? null : String(params.search),
          sort: (Array.isArray(params.sort) && params.sort.length) ? params.sort : [{ field: 'created_at', direction: 'desc' }],
          page: { number: (params.page && params.page.number) || 1, size: (params.page && params.page.size) || 2000 },
          include: Object.assign({ summary: true, orders: true, details: true, filterOptions: true }, isObj(params.include) ? params.include : {})
        },
        context: { actor: (params.context && params.context.actor) || null, clientVersion: (params.context && params.context.clientVersion) || null }
      };
    }
    function requestOrderResolver(params, helpers, opts) {
      var signal = opts && opts.signal, seq = opts && opts.sequence;
      if (signal && signal.aborted) { var e = new Error('aborted'); e.apiCode = 'ABORTED'; return Promise.reject(e); }
      var dto = buildRequestOrderRequestDTO(params);
      return Promise.resolve(_workspaceInvoke(dto.action, dto, signal)).then(function (serverEnv) {
        var env = normalizeWorkspaceEnvelope(serverEnv, dto, seq);
        env.meta.workspace = 'requestOrder'; env.meta.action = dto.action;
        return env;
      });
    }
    register('requestOrder', { label: 'Request Order', tables: getWorkspace('requestOrder').tables, legacyRead: 'getOperationDb', status: WORKSPACE_STATUS.IMPLEMENTED, resolver: requestOrderResolver });

    // ---- F1-7F · Shipment READ workspace resolver -----------------------------------------------------------
    // Scoped read for the Shipment Draft/Overview + On-the-Way Map. The client sends filters/search/sort/page/include;
    // the server (57_) composes persisted shipment facts only (no FIFO, no allocation/PO/receipt/factory authority).
    // The MAP-extra tables (routes/events/locations/templates) are fetched only when the include flag is set.
    function buildShipmentRequestDTO(params) {
      params = params || {};
      return {
        apiVersion: API_VERSION, action: 'shipment.workspace.get', requestId: makeRequestId(params.requestId),
        payload: {
          filters: isObj(params.filters) ? params.filters : {},
          search: (params.search == null || params.search === '') ? null : String(params.search),
          sort: (Array.isArray(params.sort) && params.sort.length) ? params.sort : [{ field: 'updated_at', direction: 'desc' }],
          page: { number: (params.page && params.page.number) || 1, size: (params.page && params.page.size) || 3000 },
          include: Object.assign({ summary: true, filterOptions: true }, isObj(params.include) ? params.include : {})
        },
        context: { actor: (params.context && params.context.actor) || null, clientVersion: (params.context && params.context.clientVersion) || null }
      };
    }
    function shipmentResolver(params, helpers, opts) {
      var signal = opts && opts.signal, seq = opts && opts.sequence;
      if (signal && signal.aborted) { var e = new Error('aborted'); e.apiCode = 'ABORTED'; return Promise.reject(e); }
      var dto = buildShipmentRequestDTO(params);
      return Promise.resolve(_workspaceInvoke(dto.action, dto, signal)).then(function (serverEnv) {
        var env = normalizeWorkspaceEnvelope(serverEnv, dto, seq);
        env.meta.workspace = 'shipment'; env.meta.action = dto.action;
        return env;
      });
    }
    register('shipment', { label: 'Shipment', tables: getWorkspace('shipment').tables, legacyRead: 'getOperationDb', status: WORKSPACE_STATUS.IMPLEMENTED, resolver: shipmentResolver });

    // ---- F1-7G · FC Summary READ workspace resolver ---------------------------------------------------------
    // Scoped read for the FC Summary page primary render (Regular/Special-Event/Target-Rule tables + filter/year
    // universes). The server (58_) returns raw passthrough of the FULL four primary-render tables (fc_regular_forecast,
    // fc_special_events, fc_target_rules, marketplaces); the client keeps ALL filtering/SKU-search/pagination (the
    // page is deliberately non-cascading, so it needs the complete set). Emits ONLY raw persisted forecast rows — no
    // Target% adjustment, no blending, no Gap/Recommendation. The page's SECONDARY builder/import surfaces are NOT
    // served here (they stay on the broad cache, lazy). NOT the bounded 53_ fcSummary.raw.get owner.
    function buildFcSummaryRequestDTO(params) {
      params = params || {};
      return {
        apiVersion: API_VERSION, action: 'fcSummary.workspace.get', requestId: makeRequestId(params.requestId),
        payload: {
          include: Object.assign({ summary: true }, isObj(params.include) ? params.include : {})
        },
        context: { actor: (params.context && params.context.actor) || null, clientVersion: (params.context && params.context.clientVersion) || null }
      };
    }
    function fcSummaryResolver(params, helpers, opts) {
      var signal = opts && opts.signal, seq = opts && opts.sequence;
      if (signal && signal.aborted) { var e = new Error('aborted'); e.apiCode = 'ABORTED'; return Promise.reject(e); }
      var dto = buildFcSummaryRequestDTO(params);
      return Promise.resolve(_workspaceInvoke(dto.action, dto, signal)).then(function (serverEnv) {
        var env = normalizeWorkspaceEnvelope(serverEnv, dto, seq);
        env.meta.workspace = 'fcSummary'; env.meta.action = dto.action;
        return env;
      });
    }
    register('fcSummary', { label: 'FC Summary', tables: getWorkspace('fcSummary').tables, legacyRead: 'getOperationDb', status: WORKSPACE_STATUS.IMPLEMENTED, resolver: fcSummaryResolver });

    // ---- F1-7H · SKU Details READ workspace resolver --------------------------------------------------------
    // Scoped read for the SKU Details master-data surface. The server (59_) returns raw passthrough of the master/
    // reference tables: BASE = sku_details + tax_referral_rates + tax_rate_components (sku-details.js primary render +
    // Tax subpage); include.regional adds marketplace_skus + sku_regional_details (the SECONDARY regional page — a
    // deferred, trivial follow-up). Emits ONLY raw persisted master/reference rows — NO write side effects, NO Factory
    // Stock initialization (that stays with master-SKU creation), NO Forecast/Gap/Recommendation. The client keeps ALL
    // filtering/search/pagination (the page needs the complete set for its lifecycle sections + option universes).
    function buildSkuDetailsRequestDTO(params) {
      params = params || {};
      return {
        apiVersion: API_VERSION, action: 'skuDetails.workspace.get', requestId: makeRequestId(params.requestId),
        payload: {
          include: Object.assign({ summary: true }, isObj(params.include) ? params.include : {})
        },
        context: { actor: (params.context && params.context.actor) || null, clientVersion: (params.context && params.context.clientVersion) || null }
      };
    }
    function skuDetailsResolver(params, helpers, opts) {
      var signal = opts && opts.signal, seq = opts && opts.sequence;
      if (signal && signal.aborted) { var e = new Error('aborted'); e.apiCode = 'ABORTED'; return Promise.reject(e); }
      var dto = buildSkuDetailsRequestDTO(params);
      return Promise.resolve(_workspaceInvoke(dto.action, dto, signal)).then(function (serverEnv) {
        var env = normalizeWorkspaceEnvelope(serverEnv, dto, seq);
        env.meta.workspace = 'skuDetails'; env.meta.action = dto.action;
        return env;
      });
    }
    register('skuDetails', { label: 'SKU Details', tables: getWorkspace('skuDetails').tables, legacyRead: 'getOperationDb', status: WORKSPACE_STATUS.IMPLEMENTED, resolver: skuDetailsResolver });

    // ---- F1-7I · Inventory Replenishment READ workspace resolver -------------------------------------------
    // Scoped read for the Inventory Replenishment page primary render (the main-table assembly). The server (60_) returns
    // raw passthrough of the 19 primary-render tables; the client keeps ALL scope-derivation / filtering / assembly and
    // the incoming reconstruction (presentation-side). Gap (inventoryReplenishmentGap.get), Recommendation
    // (recommendation.workspace.get) and the allocation-draft SSOT (getShippingAllocationDraftWorkspace) stay on their
    // EXISTING separate scoped owners — this workspace does NOT duplicate them and creates NO Request Order (FLOW-A).
    function buildInventoryReplenishmentRequestDTO(params) {
      params = params || {};
      return {
        apiVersion: API_VERSION, action: 'inventoryReplenishment.workspace.get', requestId: makeRequestId(params.requestId),
        payload: {
          include: Object.assign({ summary: true }, isObj(params.include) ? params.include : {})
        },
        context: { actor: (params.context && params.context.actor) || null, clientVersion: (params.context && params.context.clientVersion) || null }
      };
    }
    function inventoryReplenishmentResolver(params, helpers, opts) {
      var signal = opts && opts.signal, seq = opts && opts.sequence;
      if (signal && signal.aborted) { var e = new Error('aborted'); e.apiCode = 'ABORTED'; return Promise.reject(e); }
      var dto = buildInventoryReplenishmentRequestDTO(params);
      return Promise.resolve(_workspaceInvoke(dto.action, dto, signal)).then(function (serverEnv) {
        var env = normalizeWorkspaceEnvelope(serverEnv, dto, seq);
        env.meta.workspace = 'inventoryReplenishment'; env.meta.action = dto.action;
        return env;
      });
    }
    register('inventoryReplenishment', { label: 'Inventory Replenishment', tables: getWorkspace('inventoryReplenishment').tables, legacyRead: 'getOperationDb', status: WORKSPACE_STATUS.IMPLEMENTED, resolver: inventoryReplenishmentResolver });

    // ---- F1-4B-FM2A · Recommendation Workspace console diagnostic (SAFE, bounded; no network, no secrets) ------
    // A single read-only view for a controlled single-tester activation. It reflects the ACTUAL last request
    // state (never invented success); unavailable fields stay null. NEVER exposes a Spreadsheet ID, raw sheet
    // rows, a full request/response payload, a token, or personal data — the recorder whitelists safe keys only.
    // F1-4B-FM2B · deployment/runtime version guard. FRONTEND_CONSUMER_VERSION + RECOMMENDATION_TRANSPORT_VERSION
    // are client-side constants baked into THIS bundle (they prove the browser loaded the expected frontend).
    // lastRuntimeVersion / lastBundleHash are surfaced from the server response meta when present (they prove
    // Apps Script loaded the expected handler/bundle) and stay null otherwise — never invented, never a secret.
    var RECOMMENDATION_TRANSPORT_VERSION = 'reco-transport-1';   // scope-only DTO + canonical-envelope contract
    var FRONTEND_CONSUMER_VERSION = 'reco-consumers-fm2b';       // Inventory + Order Planning READ consumer contract
    var _recoDiag = {
      lastRequestId: null, lastScope: null, lastHttpStatus: null, lastErrorCode: null, lastDataVersion: null,
      lastCalculationMonth: null, lastPlanningCycle: null, lastDestinationCount: null, lastLineCount: null,
      lastClientDurationMs: null, lastRuntimeVersion: null, lastBundleHash: null
    };
    var _RECO_DIAG_KEYS = { lastRequestId: 1, lastScope: 1, lastHttpStatus: 1, lastErrorCode: 1, lastDataVersion: 1,
      lastCalculationMonth: 1, lastPlanningCycle: 1, lastDestinationCount: 1, lastLineCount: 1, lastClientDurationMs: 1,
      lastRuntimeVersion: 1, lastBundleHash: 1 };
    // Whitelisted merge — a caller (consumer page) may push only safe timing/scope fields; unknown keys ignored.
    function recordRecommendationDiagnostic(patch) {
      if (!isObj(patch)) return;
      for (var k in patch) { if (_RECO_DIAG_KEYS[k] === 1) _recoDiag[k] = (patch[k] === undefined ? null : patch[k]); }
    }
    // Auto-record the safe, response-derived fields on every resolved recommendation request.
    function recordRecoDiag_(dto, env) {
      var meta = (env && env.meta) || {}, data = (env && env.data) || null;
      var lines = (data && Array.isArray(data.lines)) ? data.lines : [];
      var destKeys = {}; lines.forEach(function (l) { if (l && l.destinationKey) destKeys[l.destinationKey] = 1; });
      var sc = (dto && dto.payload && dto.payload.scope) ? dto.payload.scope : null;
      recordRecommendationDiagnostic({
        lastRequestId: meta.requestId || null,
        lastScope: sc ? { company: sc.company || null, country: sc.country || null, marketplace: sc.marketplace || null, sku: sc.sku || null, siteSku: sc.siteSku || null } : null,
        lastErrorCode: (env && env.success === false && Array.isArray(env.errors) && env.errors[0]) ? (env.errors[0].code || null) : null,
        lastDataVersion: (data && data.dataVersion) ? data.dataVersion : null,
        lastCalculationMonth: meta.calculationMonth || (data && data.scope && data.scope.calculationMonth) || null,
        lastPlanningCycle: meta.planningCycle || (data && data.scope && data.scope.planningCycle) || null,
        lastDestinationCount: lines.length ? Object.keys(destKeys).length : ((env && env.success === true) ? 0 : null),
        lastLineCount: (env && env.success === true) ? lines.length : null,
        lastRuntimeVersion: meta.runtimeVersion || meta.recommendationRuntimeVersion || (data && data.dataVersion && data.dataVersion.runtimeVersion) || null,
        lastBundleHash: meta.bundleHash || (data && data.dataVersion && data.dataVersion.bundleHash) || null
      });
    }
    function getRecommendationWorkspaceDiagnostic() {
      var d = resolveWorkspace('recommendation');
      var w = (typeof window !== 'undefined') ? window : null;
      var out = {
        masterFlagEnabled: flags.USE_WORKSPACE_API === true,
        recommendationFlagEnabled: wsEnabled.recommendation === true,
        recommendationCanonical: WORKSPACE_CANONICAL.recommendation === true,   // FM2B: active-by-default, master-flag-independent
        effectiveMode: effectiveMode('recommendation'),
        endpointImplemented: !!(d && d.implemented),
        inventoryConsumerReady: !!(w && typeof w.loadRecommendationWorkspace_ === 'function'),
        orderPlanningConsumerReady: !!(w && typeof w._opLoadRecommendation === 'function'),
        orderPlanningOptIn: !!(w && typeof w._opGetRecommendationOptIn === 'function' && w._opGetRecommendationOptIn() === true),
        frontendConsumerVersion: FRONTEND_CONSUMER_VERSION,
        recommendationTransportVersion: RECOMMENDATION_TRANSPORT_VERSION
      };
      for (var k in _recoDiag) out[k] = _recoDiag[k];
      return out;
    }

    // ---- ApiDispatcher — routes a normalized request → envelope. Catches EVERYTHING (never throws). ----
    function dispatchCommand(req) {
      var action = normName(req.name);
      var baseMeta = { action: action, mode: req.mode };
      // security fail-closed (defense in depth; client also checks up front)
      if (isForbiddenAction(action)) {
        return Promise.resolve(buildError(API_ERROR_CODES.FORBIDDEN_OPERATION,
          'forbidden schema/structural operation refused at the API boundary (KMSAFE mirror): ' + action,
          { action: action }, { action: action, mode: req.mode, source: SOURCE.GUARD }));
      }
      if (req.mode === SOURCE.WORKSPACE) {
        return Promise.resolve(buildError(API_ERROR_CODES.WORKSPACE_NOT_IMPLEMENTED,
          'workspace command runtime not implemented in API-1 foundation', { action: action },
          Object.assign(baseMeta, { source: SOURCE.WORKSPACE })));
      }
      if (!legacyAdapter.hasCommand(action)) {
        return Promise.resolve(buildError(API_ERROR_CODES.UNKNOWN_ACTION,
          'no legacy command registered for action: ' + action, { action: action },
          Object.assign(baseMeta, { source: SOURCE.LEGACY })));
      }
      return legacyAdapter.command(action, req.payload)
        .then(function (data) { return buildResponse(data, { source: SOURCE.LEGACY, action: action, mode: req.mode }); })
        .catch(function (err) { return errorFromException(err, Object.assign(baseMeta, { source: SOURCE.LEGACY })); });
    }
    function dispatchWorkspace(req) {
      var name = normName(req.name);
      var baseMeta = { workspace: name, mode: req.mode };
      var d = getWorkspace(name);
      if (!d) {
        return Promise.resolve(buildError(API_ERROR_CODES.UNKNOWN_WORKSPACE, 'unknown workspace: ' + name, { workspace: name }, baseMeta));
      }
      if (req.mode === SOURCE.WORKSPACE) {
        if (d.status !== WORKSPACE_STATUS.IMPLEMENTED || !d.resolver) {
          return Promise.resolve(buildError(API_ERROR_CODES.WORKSPACE_NOT_IMPLEMENTED,
            'workspace registered but not implemented (API-1 foundation): ' + name, { workspace: name },
            Object.assign(baseMeta, { source: SOURCE.WORKSPACE })));
        }
        return Promise.resolve().then(function () { return d.resolver(req.params, { buildResponse: buildResponse, buildError: buildError }, { signal: req.signal, sequence: req.sequence }); })
          .then(function (data) { return (data && data.success !== undefined) ? data : buildResponse(data, { source: SOURCE.WORKSPACE, workspace: name, mode: req.mode }); })
          .catch(function (err) { return errorFromException(err, Object.assign(baseMeta, { source: SOURCE.WORKSPACE, sequence: req.sequence })); });
      }
      // legacy mode → preserve today's behavior (whole-DB read via legacy reader)
      return legacyAdapter.read(name, req.params)
        .then(function (data) { return buildResponse(data, { source: SOURCE.LEGACY, workspace: name, mode: req.mode }); })
        .catch(function (err) { return errorFromException(err, Object.assign(baseMeta, { source: SOURCE.LEGACY })); });
    }
    function dispatch(req) {
      try {
        if (!isObj(req)) return Promise.resolve(buildError(API_ERROR_CODES.INVALID_REQUEST, 'request object required', null));
        if (req.kind === REQUEST_KIND.COMMAND) return dispatchCommand(req);
        if (req.kind === REQUEST_KIND.WORKSPACE) return dispatchWorkspace(req);
        return Promise.resolve(buildError(API_ERROR_CODES.INVALID_REQUEST, 'unknown request kind: ' + req.kind, { kind: req.kind }));
      } catch (err) { return Promise.resolve(errorFromException(err, null)); }
    }

    // ---- ApiClient — the public facade. Per-workspace flag decides legacy vs workspace (§effectiveMode). --
    function commandMode() { return flags.USE_WORKSPACE_API ? SOURCE.WORKSPACE : SOURCE.LEGACY; }   // no workspace command implemented yet
    var client = {
      getWorkspace: function (name, params, opts) {
        if (!hasWorkspace(name)) {
          return Promise.resolve(buildError(API_ERROR_CODES.UNKNOWN_WORKSPACE, 'unknown workspace: ' + normName(name), { workspace: normName(name) }, { workspace: normName(name) }));
        }
        var seq = ++_callSeq, signal = opts && opts.signal;
        if (signal && signal.aborted) {
          return Promise.resolve(buildError('ABORTED', 'request aborted before dispatch', { workspace: normName(name) }, { workspace: normName(name), sequence: seq, source: SOURCE.GUARD }));
        }
        return dispatch({ kind: REQUEST_KIND.WORKSPACE, name: name, params: params, mode: effectiveMode(name), signal: signal, sequence: seq });
      },
      executeCommand: function (action, payload) {
        // SECURITY: forbidden schema/structural ops are refused in BOTH modes, before anything runs.
        if (isForbiddenAction(action)) {
          return Promise.resolve(buildError(API_ERROR_CODES.FORBIDDEN_OPERATION,
            'forbidden schema/structural operation refused at the API boundary (KMSAFE mirror): ' + normName(action),
            { action: normName(action) }, { action: normName(action), source: SOURCE.GUARD }));
        }
        return dispatch({ kind: REQUEST_KIND.COMMAND, name: action, payload: payload, mode: commandMode() });
      }
    };

    // ---- flags API (production stays false; tests flip) ------------------------------------------------
    function getFlags() { var out = {}; for (var k in flags) out[k] = flags[k]; return out; }
    function setWorkspaceApiEnabled(on) { flags.USE_WORKSPACE_API = !!on; return flags.USE_WORKSPACE_API; }

    return {
      // constants / enums
      API_VERSION: API_VERSION, WORKSPACE_STATUS: WORKSPACE_STATUS, REQUEST_KIND: REQUEST_KIND, SOURCE: SOURCE,
      API_ERROR_CODES: API_ERROR_CODES, FORBIDDEN_ACTIONS: FORBIDDEN_ACTIONS.slice(),
      // flags (global master + per-workspace map — API-2)
      flags: flags, getFlags: getFlags, setWorkspaceApiEnabled: setWorkspaceApiEnabled,
      getWorkspaceFlags: getWorkspaceFlags, setWorkspaceEnabled: setWorkspaceEnabled,
      workspaceApiActive: workspaceApiActive, effectiveMode: effectiveMode, isCanonicalWorkspace: isCanonicalWorkspace,
      // F1-7N-FA-3C-R6E-P0 — Request Order Site Confirm capability (backend-owned flag mirror; reversible).
      requestOrderSiteConfirmRequired: requestOrderSiteConfirmRequired, setRequestOrderSiteConfirmRequired: setRequestOrderSiteConfirmRequired,
      // Weekly workspace helpers (API-2)
      weekly: { buildRequestDTO: buildWeeklyRequestDTO, normalizeEnvelope: normalizeWorkspaceEnvelope, makeRequestId: makeRequestId },
      // Recommendation workspace helpers (F1-4B-A)
      recommendation: { buildRequestDTO: buildRecommendationRequestDTO, makeRequestId: makeRequestId },
      // Recommendation Workspace console diagnostic (F1-4B-FM2A) — safe, bounded, read-only.
      getRecommendationWorkspaceDiagnostic: getRecommendationWorkspaceDiagnostic,
      recordRecommendationDiagnostic: recordRecommendationDiagnostic,
      // ApiClient (facade)
      client: client, getWorkspace: client.getWorkspace, executeCommand: client.executeCommand,
      // independent layers (each testable in isolation)
      transport: transport, getTransportStatus: getTransportStatus,
      dispatcher: { dispatch: dispatch, dispatchCommand: dispatchCommand, dispatchWorkspace: dispatchWorkspace },
      workspaceResolver: { resolve: resolveWorkspace, register: register, get: getWorkspace, has: hasWorkspace, list: listWorkspaces },
      registry: { register: register, get: getWorkspace, has: hasWorkspace, list: listWorkspaces },
      responseEnvelope: { build: buildResponse, buildMeta: buildMeta },
      errorEnvelope: { build: buildError, fromException: errorFromException },
      cache: cache,
      legacyAdapter: legacyAdapter,
      // security predicate
      isForbiddenAction: isForbiddenAction
    };
  }

  function createDefault() { return createApiFoundation({}); }

  return {
    createApiFoundation: createApiFoundation,
    createDefault: createDefault,
    API_VERSION: API_VERSION,
    FEATURE_FLAGS_DEFAULT: FEATURE_FLAGS_DEFAULT,
    WORKSPACE_STATUS: WORKSPACE_STATUS,
    REQUEST_KIND: REQUEST_KIND,
    SOURCE: SOURCE,
    API_ERROR_CODES: API_ERROR_CODES,
    FORBIDDEN_ACTIONS: FORBIDDEN_ACTIONS.slice(),
    DEFAULT_WORKSPACES: DEFAULT_WORKSPACES.map(function (w) { return { name: w.name, label: w.label, tables: w.tables.slice(), legacyRead: w.legacyRead }; })
  };
});
