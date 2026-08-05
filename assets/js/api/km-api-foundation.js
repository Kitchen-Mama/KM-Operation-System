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
      tables: ['sku_details', 'marketplace_skus', 'tax_referral_rates', 'sku_regional_details'], legacyRead: 'getOperationDb' }
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
      } else if (typeof err === 'string') { code = API_ERROR_CODES.TRANSPORT_ERROR; msg = err; }
      return buildError(code, msg, details, meta);
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

    // ---- API-2 · per-workspace feature flag (global master AND per-workspace enable; default all false) --
    var WORKSPACE_ENABLED_DEFAULT = { weeklyShipping: false, inventoryReplenishment: false, requestOrder: false, purchaseOrder: false, shipment: false, fcSummary: false, skuDetails: false };
    var wsEnabled = {}; for (var _w in WORKSPACE_ENABLED_DEFAULT) wsEnabled[_w] = WORKSPACE_ENABLED_DEFAULT[_w];
    if (isObj(deps.workspaceFlags)) { for (var _wf in deps.workspaceFlags) wsEnabled[_wf] = deps.workspaceFlags[_wf] === true; }
    function getWorkspaceFlags() { var o = {}; for (var k in wsEnabled) o[k] = wsEnabled[k]; return o; }
    function setWorkspaceEnabled(name, on) { var n = normName(name); wsEnabled[n] = !!on; return wsEnabled[n]; }
    function workspaceApiActive(name) { var d = getWorkspace(name); var impl = d && d.status === WORKSPACE_STATUS.IMPLEMENTED && typeof d.resolver === 'function'; return flags.USE_WORKSPACE_API === true && !!impl && wsEnabled[normName(name)] === true; }
    // Hybrid gate: master OFF → legacy always. master ON + IMPLEMENTED → needs the per-workspace flag (else legacy →
    // "disabling Weekly restores Legacy"). master ON + UNIMPLEMENTED → workspace path (→ WORKSPACE_NOT_IMPLEMENTED,
    // no silent legacy fallback). No dual execution: exactly one branch runs.
    function effectiveMode(name) {
      if (flags.USE_WORKSPACE_API !== true) return SOURCE.LEGACY;
      var d = getWorkspace(name);
      var impl = d && d.status === WORKSPACE_STATUS.IMPLEMENTED && typeof d.resolver === 'function';
      if (!impl) return SOURCE.WORKSPACE;
      return wsEnabled[normName(name)] === true ? SOURCE.WORKSPACE : SOURCE.LEGACY;
    }

    // ---- API-2 · requestId (correlation, NOT idempotency) + call sequence (stale-response protection) ---
    var _idSeq = 0, _callSeq = 0;
    var _idGen = (typeof deps.idGen === 'function') ? deps.idGen : function () { _idSeq++; return 'REQ-C' + ('000000' + _idSeq).slice(-6); };
    function makeRequestId(provided) { var p = normName(provided); return /^REQ-[A-Za-z0-9_-]{1,40}$/.test(p) ? p : _idGen(); }

    // ---- API-2 · workspace transport invoke → parsed canonical envelope (tests inject deps.workspaceInvoke) --
    var _workspaceInvoke = (typeof deps.workspaceInvoke === 'function') ? deps.workspaceInvoke : function (action, dto, signal) {
      // transport.post resolves the canonical URL at call time and rejects with the specific transport code
      // (TRANSPORT_NOT_CONFIGURED / TRANSPORT_URL_INVALID) — surfaced verbatim via errorFromException.
      return transport.post(dto, { signal: signal }).then(function (resp) { return (resp && typeof resp.json === 'function') ? resp.json() : resp; });
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
        return { success: false, data: null, meta: outMeta, errors: (Array.isArray(serverEnv.errors) && serverEnv.errors.length) ? serverEnv.errors : [{ code: 'WORKSPACE_ERROR', message: 'workspace returned failure', details: null }] };
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
      workspaceApiActive: workspaceApiActive, effectiveMode: effectiveMode,
      // Weekly workspace helpers (API-2)
      weekly: { buildRequestDTO: buildWeeklyRequestDTO, normalizeEnvelope: normalizeWorkspaceEnvelope, makeRequestId: makeRequestId },
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
