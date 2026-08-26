// ============================================================================================================
// Kitchen Mama Operation System — PORTABLE DATA-ACCESS BOUNDARY (F1-7N-FB-4E §G)
// ------------------------------------------------------------------------------------------------------------
//                 UI / page  →  domain query|command  →  data access  →  transport  →  adapter
//
// WHAT THIS IS FOR. Today's only adapter is Apps Script. The point of the boundary is that the NEXT one —
// Supabase/Postgres for transactional work, BigQuery for read/reporting — can be added without a page changing,
// and that the claim "it can" is TESTED rather than asserted. §G6 is explicit that a renamed wrapper around the
// current functions is not acceptable, so the boundary is proven the only way it can be: a CONTRACT TEST runs
// the SAME QuerySpec and CommandSpec objects against an in-memory adapter and against the Apps Script adapter
// (over an injected transport) and requires identical envelope semantics from both.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not migrate anything, does not dual-write, opens no Supabase or
// BigQuery connection, and carries no credential of any kind — a frontend is the wrong place for one, and
// BigQuery is not a transactional-write target and is never presented as one (see `CAPABILITIES`).
//
// THE FOUR RULES THAT MAKE IT PORTABLE RATHER THAN DECORATIVE:
//   1. A page names a RESOURCE and a SCOPE. It never names a URL, a sheet, a tab, a row index or a column.
//      The mapping from resource → Apps Script action lives in ONE table here and nowhere else.
//   2. The envelope is identical across adapters: { ok, state, data, error, meta }. `state` is one of the seven
//      §F UI states, so a page renders from the envelope alone.
//   3. Transport failure and business rejection are SEPARATE fields with separate codes — the distinction the
//      current pages lose when they print "read error" for both.
//   4. A command carries an explicit idempotency key and returns a verification envelope. Replay of the same
//      key is a REPLAY (not a second write), which is the property a future transactional backend must also
//      honour and which the contract test checks on both adapters.
// ============================================================================================================
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.KM = root.KM || {}; root.KM.dataAccess = root.KM.dataAccess || api; }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var BOUNDARY_CONTRACT_VERSION = 1;

  // The seven §F states, restated here so an adapter can produce one without importing the transport.
  var STATE = {
    READY_WITH_DATA: 'READY_WITH_DATA',
    READY_EMPTY: 'READY_EMPTY',
    EMPTY_CONFIGURATION: 'EMPTY_CONFIGURATION',
    TRANSIENT_ERROR: 'TRANSIENT_ERROR',
    NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR: 'NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR',
    ABORTED_SUPERSEDED: 'ABORTED_SUPERSEDED'
  };
  var ERROR_KIND = { TRANSPORT: 'TRANSPORT', BUSINESS: 'BUSINESS', CONFIGURATION: 'CONFIGURATION' };

  // What each adapter may be asked to do. Recorded as data so a caller can refuse an operation an adapter
  // cannot honour INSTEAD of discovering it at runtime — and so "BigQuery is not a write target" is a machine
  // fact rather than a sentence in a document.
  var CAPABILITIES = {
    APPS_SCRIPT: { read: true, transactionalWrite: true, idempotentReplay: true, readAfterWrite: true, analyticsScale: false },
    IN_MEMORY: { read: true, transactionalWrite: true, idempotentReplay: true, readAfterWrite: true, analyticsScale: false },
    SUPABASE_POSTGRES: { read: true, transactionalWrite: true, idempotentReplay: true, readAfterWrite: true, analyticsScale: false },
    BIGQUERY: { read: true, transactionalWrite: false, idempotentReplay: false, readAfterWrite: false, analyticsScale: true }
  };

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // ==========================================================================================================
  // THE REQUEST DTOs (§G4). Scope, filters, pagination and projection are EXPLICIT and normalized, so two
  // adapters cannot disagree about what was asked, and a page cannot smuggle a backend detail through.
  // ==========================================================================================================
  function querySpec(o) {
    o = o || {};
    var p = isObj(o.page) ? o.page : {};
    return {
      kind: 'QUERY',
      resource: str(o.resource),
      scope: normScope(o.scope),
      filters: normMap(o.filters),
      projection: Array.isArray(o.projection) ? o.projection.map(str).filter(Boolean).slice().sort() : [],
      page: { number: posInt(p.number, 1), size: posInt(p.size, 100) },
      include: normMap(o.include),
      requestId: str(o.requestId) || null
    };
  }
  function commandSpec(o) {
    o = o || {};
    return {
      kind: 'COMMAND',
      resource: str(o.resource),
      operation: str(o.operation),
      payload: isObj(o.payload) ? o.payload : {},
      idempotencyKey: str(o.idempotencyKey),
      verify: o.verify === true,
      requestId: str(o.requestId) || null
    };
  }
  function posInt(v, d) { var n = Number(v); return (isFinite(n) && n > 0) ? Math.floor(n) : d; }
  function normScope(s) {
    s = isObj(s) ? s : {};
    return { company: str(s.company) || null, country: str(s.country) || null, marketplace: str(s.marketplace) || null,
      marketplaceId: str(s.marketplaceId) || null, sku: str(s.sku) || null, siteSku: str(s.siteSku) || null };
  }
  function normMap(m) {
    var out = {}; if (!isObj(m)) return out;
    Object.keys(m).sort().forEach(function (k) { var v = m[k]; if (v !== undefined) out[k] = v; });
    return out;
  }

  // ==========================================================================================================
  // THE RESPONSE ENVELOPE. Byte-shape identical across every adapter — that IS the portability contract.
  // ==========================================================================================================
  function okEnvelope(spec, rows, meta) {
    var list = Array.isArray(rows) ? rows : [];
    return {
      ok: true,
      state: list.length ? STATE.READY_WITH_DATA : STATE.READY_EMPTY,
      data: { rows: list, rowCount: list.length,
        page: (spec.kind === 'QUERY') ? { number: spec.page.number, size: spec.page.size } : null },
      error: null,
      meta: Object.assign({ boundary_contract_version: BOUNDARY_CONTRACT_VERSION, resource: spec.resource,
        kind: spec.kind, requestId: spec.requestId }, meta || {})
    };
  }
  function errEnvelope(spec, kind, code, message, details, state, meta) {
    return {
      ok: false,
      state: state || (kind === ERROR_KIND.BUSINESS ? STATE.TRANSIENT_ERROR : STATE.TRANSIENT_ERROR),
      data: { rows: [], rowCount: 0, page: null },
      error: { kind: kind, code: code, message: message, details: details || {},
        retryable: !!(details && details.retryable) },
      meta: Object.assign({ boundary_contract_version: BOUNDARY_CONTRACT_VERSION, resource: spec.resource,
        kind: spec.kind, requestId: spec.requestId }, meta || {})
    };
  }
  function commandEnvelope(spec, applied, verification, meta) {
    return {
      ok: true,
      state: STATE.READY_WITH_DATA,
      data: { rows: [], rowCount: 0, page: null,
        // §G5 — a write answers with what it DID, keyed by the idempotency key, plus the verification the
        // caller asked for. `replayed` is the field a caller uses to avoid double-counting a retry.
        command: { resource: spec.resource, operation: spec.operation, idempotencyKey: spec.idempotencyKey,
          applied: applied === true, replayed: applied === false, verification: verification || null } },
      error: null,
      meta: Object.assign({ boundary_contract_version: BOUNDARY_CONTRACT_VERSION, resource: spec.resource,
        kind: spec.kind, requestId: spec.requestId }, meta || {})
    };
  }

  // ==========================================================================================================
  // THE RESOURCE MAP — the ONLY place a domain resource meets an Apps Script action name.
  // A page that wants site inventory asks for 'siteInventory'. It does not know, and must not know, that this
  // is currently `inventoryReplenishment.workspace.get` over a Google Sheet.
  // ==========================================================================================================
  var RESOURCES = {
    siteInventory: { read: 'inventoryReplenishment.workspace.get', rowsAt: 'rows' },
    orderPlanning: { read: 'aiPlanFirstLayer.get', rowsAt: 'rows' },
    fcSummary: { read: 'weeklyShipping.workspace.get', rowsAt: 'rows' },
    shipmentDraft: { read: 'shipment.workspace.get', rowsAt: 'rows' },
    skuDetails: { read: 'skuDetails.workspace.get', rowsAt: 'rows' },
    scopeRegistry: { read: 'inventoryScope.registry.get', rowsAt: 'marketplaces' },
    executionPlan: {
      read: 'getShippingAllocationDraftWorkspace', rowsAt: 'headers',
      commands: { upsertHeader: 'upsertShippingAllocationDraft', upsertLines: 'upsertShippingAllocationDraftLines',
        submit: 'submitAllocationDraftsToShippingPlans' }
    }
  };
  function resourceDef(name) { return RESOURCES[str(name)] || null; }

  // ==========================================================================================================
  // ADAPTER 1 — APPS SCRIPT. Its whole job is: resource → action, spec → payload, typed transport result →
  // the shared envelope. It contains no query engine of its own; the server owns that.
  // ==========================================================================================================
  function appsScriptAdapter(opts) {
    opts = opts || {};
    var transport = opts.transport;
    var NAME = 'APPS_SCRIPT';
    function mapTransportError(spec, res) {
      var C = (transport && transport.CODES) || {};
      var d = res.details || {};
      var configish = (res.code === C.API_ENDPOINT_CONFIGURATION_INVALID || res.code === C.DEPLOYMENT_CONTRACT_MISMATCH
        || res.code === C.AUTH_OR_ACCESS_HTML || res.code === C.HTTP_NOT_FOUND_HTML);
      if (res.code === C.REQUEST_ABORTED) {
        return errEnvelope(spec, ERROR_KIND.TRANSPORT, res.code, res.message, d, STATE.ABORTED_SUPERSEDED, { adapter: NAME });
      }
      if (res.code === C.BACKEND_BUSINESS_REJECTION) {
        // A business rejection is NOT a transport fault. Keeping them apart is §G3, and it is the difference
        // between "the API is broken" and "the backend said no, here is why".
        return errEnvelope(spec, ERROR_KIND.BUSINESS, d.business_code || res.code, res.message, d, STATE.TRANSIENT_ERROR, { adapter: NAME });
      }
      return errEnvelope(spec, configish ? ERROR_KIND.CONFIGURATION : ERROR_KIND.TRANSPORT, res.code, res.message, d,
        configish ? STATE.NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR : STATE.TRANSIENT_ERROR,
        { adapter: NAME, phase: res.phase, masked_endpoint: res.maskedEndpoint || null, timings: res.timings || null });
    }
    function rowsFrom(data, at) {
      if (!isObj(data)) return [];
      var v = data[at];
      if (Array.isArray(v)) return v;
      if (Array.isArray(data.rows)) return data.rows;
      return [];
    }
    return {
      name: NAME,
      capabilities: CAPABILITIES.APPS_SCRIPT,
      query: function (spec, io) {
        var def = resourceDef(spec.resource);
        if (!def || !def.read) {
          return Promise.resolve(errEnvelope(spec, ERROR_KIND.CONFIGURATION, 'RESOURCE_NOT_MAPPED',
            'No read is mapped for the resource "' + spec.resource + '".', { retryable: false },
            STATE.NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR, { adapter: NAME }));
        }
        return Promise.resolve(transport.request({
          action: def.read, requestId: spec.requestId, kind: 'read', signal: io && io.signal,
          payload: { payload: { scope: spec.scope, filters: spec.filters, projection: spec.projection,
            pagination: { page: spec.page.number, size: spec.page.size }, include: spec.include } }
        })).then(function (res) {
          if (!res.success) return mapTransportError(spec, res);
          return okEnvelope(spec, rowsFrom(res.data, def.rowsAt),
            { adapter: NAME, masked_endpoint: res.maskedEndpoint || null, timings: res.timings || null,
              responseBytes: (res.details && res.details.responseBytes) || 0 });
        });
      },
      command: function (spec, io) {
        var def = resourceDef(spec.resource);
        var action = def && def.commands && def.commands[spec.operation];
        if (!action) {
          return Promise.resolve(errEnvelope(spec, ERROR_KIND.CONFIGURATION, 'OPERATION_NOT_MAPPED',
            'No command is mapped for ' + spec.resource + '.' + spec.operation + '.', { retryable: false },
            STATE.NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR, { adapter: NAME }));
        }
        if (!spec.idempotencyKey) {
          return Promise.resolve(errEnvelope(spec, ERROR_KIND.CONFIGURATION, 'IDEMPOTENCY_KEY_REQUIRED',
            'A command must carry an idempotency key, so no request was issued.', { retryable: false, zero_write: true },
            STATE.NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR, { adapter: NAME }));
        }
        return Promise.resolve(transport.request({
          action: action, requestId: spec.requestId, kind: 'write', signal: io && io.signal,
          payload: Object.assign({}, spec.payload, { idempotency_key: spec.idempotencyKey, verify: spec.verify })
        })).then(function (res) {
          if (!res.success) return mapTransportError(spec, res);
          var d = isObj(res.data) ? res.data : {};
          return commandEnvelope(spec, d.replayed === true ? false : true,
            spec.verify ? (d.verification || null) : null,
            { adapter: NAME, masked_endpoint: res.maskedEndpoint || null, timings: res.timings || null });
        });
      }
    };
  }

  // ==========================================================================================================
  // ADAPTER 2 — IN MEMORY. A REAL adapter, not a stub: it implements scope filtering, projection, pagination,
  // idempotency-key replay and read-after-write over plain objects. That is what lets the contract test prove
  // the boundary means something — if the envelope shape were only produced by one implementation, the
  // "abstraction" would be a rename.
  // ==========================================================================================================
  function inMemoryAdapter(opts) {
    opts = opts || {};
    var tables = {};                                    // resource -> rows[]
    Object.keys(isObj(opts.seed) ? opts.seed : {}).forEach(function (k) { tables[k] = (opts.seed[k] || []).slice(); });
    var applied = {};                                   // idempotencyKey -> { resource, operation, rowsBefore, rowsAfter }
    var NAME = 'IN_MEMORY';
    var failWith = opts.failWith || null;               // inject a typed failure to compare error envelopes

    function scopeMatches(row, scope) {
      var keys = ['company', 'country', 'marketplace', 'marketplaceId', 'sku', 'siteSku'];
      for (var i = 0; i < keys.length; i++) {
        var want = scope[keys[i]];
        if (want === null || want === undefined || want === '') continue;
        if (str(row[keys[i]]) !== str(want)) return false;
      }
      return true;
    }
    function project(row, fields) {
      if (!fields.length) return Object.assign({}, row);
      var out = {}; fields.forEach(function (f) { if (Object.prototype.hasOwnProperty.call(row, f)) out[f] = row[f]; });
      return out;
    }
    return {
      name: NAME,
      capabilities: CAPABILITIES.IN_MEMORY,
      tables: function () { return JSON.parse(JSON.stringify(tables)); },
      query: function (spec) {
        if (failWith) return Promise.resolve(errEnvelope(spec, failWith.kind, failWith.code, failWith.message,
          failWith.details || { retryable: false }, failWith.state, { adapter: NAME }));
        if (!resourceDef(spec.resource)) {
          return Promise.resolve(errEnvelope(spec, ERROR_KIND.CONFIGURATION, 'RESOURCE_NOT_MAPPED',
            'No read is mapped for the resource "' + spec.resource + '".', { retryable: false },
            STATE.NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR, { adapter: NAME }));
        }
        var all = (tables[spec.resource] || []).filter(function (r) { return scopeMatches(r, spec.scope); });
        Object.keys(spec.filters).forEach(function (f) {
          var want = spec.filters[f];
          if (want === null || want === undefined || want === '') return;
          all = all.filter(function (r) { return str(r[f]) === str(want); });
        });
        var start = (spec.page.number - 1) * spec.page.size;
        var rows = all.slice(start, start + spec.page.size).map(function (r) { return project(r, spec.projection); });
        return Promise.resolve(okEnvelope(spec, rows, { adapter: NAME, totalBeforePage: all.length }));
      },
      command: function (spec) {
        if (failWith) return Promise.resolve(errEnvelope(spec, failWith.kind, failWith.code, failWith.message,
          failWith.details || { retryable: false }, failWith.state, { adapter: NAME }));
        var def = resourceDef(spec.resource);
        if (!def || !def.commands || !def.commands[spec.operation]) {
          return Promise.resolve(errEnvelope(spec, ERROR_KIND.CONFIGURATION, 'OPERATION_NOT_MAPPED',
            'No command is mapped for ' + spec.resource + '.' + spec.operation + '.', { retryable: false },
            STATE.NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR, { adapter: NAME }));
        }
        if (!spec.idempotencyKey) {
          return Promise.resolve(errEnvelope(spec, ERROR_KIND.CONFIGURATION, 'IDEMPOTENCY_KEY_REQUIRED',
            'A command must carry an idempotency key, so no request was issued.', { retryable: false, zero_write: true },
            STATE.NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR, { adapter: NAME }));
        }
        // §G5/§G11 — the SAME key never writes twice. This is the semantic a future Postgres cutover has to
        // preserve, so it is exercised here rather than described.
        if (applied[spec.idempotencyKey]) {
          return Promise.resolve(commandEnvelope(spec, false,
            spec.verify ? applied[spec.idempotencyKey].verification : null, { adapter: NAME }));
        }
        var rows = tables[spec.resource] || (tables[spec.resource] = []);
        var row = Object.assign({}, spec.payload, { idempotencyKey: spec.idempotencyKey });
        rows.push(row);
        var verification = { rowsAfter: rows.length, identityPresent: true, quantityTotal: rows.reduce(function (a, r) { return a + (Number(r.quantity) || 0); }, 0) };
        applied[spec.idempotencyKey] = { verification: verification };
        return Promise.resolve(commandEnvelope(spec, true, spec.verify ? verification : null, { adapter: NAME }));
      }
    };
  }

  // ==========================================================================================================
  // THE REPOSITORY — what a page holds. One adapter at a time; swapping it is the whole migration surface.
  // ==========================================================================================================
  function createRepository(adapter) {
    if (!adapter) throw new Error('createRepository requires an adapter');
    return {
      adapterName: adapter.name,
      capabilities: adapter.capabilities,
      query: function (spec, io) { return adapter.query(querySpec(spec), io); },
      command: function (spec, io) {
        var s = commandSpec(spec);
        // A read-only adapter must REFUSE a write rather than silently pretend. This is the check that keeps
        // BigQuery from ever being wired up as a transactional target by accident.
        if (adapter.capabilities && adapter.capabilities.transactionalWrite === false) {
          return Promise.resolve(errEnvelope(s, ERROR_KIND.CONFIGURATION, 'ADAPTER_IS_READ_ONLY',
            'The "' + adapter.name + '" adapter is a read/reporting adapter and cannot perform transactional writes.',
            { retryable: false, zero_write: true }, STATE.NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR,
            { adapter: adapter.name }));
        }
        return adapter.command(s, io);
      }
    };
  }

  return {
    BOUNDARY_CONTRACT_VERSION: BOUNDARY_CONTRACT_VERSION,
    STATE: STATE, ERROR_KIND: ERROR_KIND, CAPABILITIES: CAPABILITIES, RESOURCES: RESOURCES,
    querySpec: querySpec, commandSpec: commandSpec, resourceDef: resourceDef,
    okEnvelope: okEnvelope, errEnvelope: errEnvelope, commandEnvelope: commandEnvelope,
    appsScriptAdapter: appsScriptAdapter, inMemoryAdapter: inMemoryAdapter, createRepository: createRepository
  };
});
