// Overseas Inbound / Outbound — shared Operation Workspace PREVIEW controller.
//
// PREVIEW MODE (honest scope): the operation lifecycle tables + Apps Script handlers described in
// OVERSEAS_INBOUND_SPEC.md §10 / OVERSEAS_OUTBOUND_SPEC.md are SPEC-ONLY — they are NOT implemented
// (no overseas_inbound_operations / overseas_outbound_operations tables, no writer, no DB-API method).
// Therefore this controller renders a FULLY INTERACTIVE workspace whose lifecycle state lives in an
// in-memory session store (NOT localStorage, NOT the backend). It does NOT post inventory movements
// and never claims a transaction succeeded. Selectors (warehouses / shipments / SKU lines) and the
// Movement / Inventory Impact panel read REAL data from KM.DB so the preview is grounded, but every
// mutating step is clearly badged "Preview — not persisted / not posted". When the runtime handlers
// are built (SHIPMENT_CENTER_SPEC §23.11), the same drawer wires to KM.DB writers with no UI rework.
//
// createController(cfg) returns { mount, unmount } used by each page's KM.lifecycle.register.

(function () {
  'use strict';
  window.KM = window.KM || {};
  var OO = (window.KM.OverseasOps = window.KM.OverseasOps || {});

  // Session store — survives page switches within one browser session; cleared on reload.
  // Shape: _sessions[direction][opKey] = { status, lines:{sku:{...}}, note, createdInPreview, log:[] }
  OO._sessions = OO._sessions || { inbound: {}, outbound: {} };

  // ---- pure helpers ----
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) {
    var v = parseFloat(n);
    if (!isFinite(v)) return '0';
    return v.toLocaleString('en-US');
  }
  function signed(n) {
    var v = parseFloat(n) || 0;
    return (v > 0 ? '+' : '') + num(v);
  }
  OO.esc = esc; OO.num = num;

  // F1-7J-A3 · bounded scoped read cutover (read-only PREVIEW page — no writes). Canonical mode sources the 4 tables this
  // preview reads (warehouses, overseas_inventory_snapshot, shipments, shipment_lines) from ONE bounded getTable-based
  // scoped read — NO whole-DB loadOperationDb, NO app-prime dependency. Kill switch: window.KM_SCOPED_PAGE_READS = false →
  // Legacy. BEFORE == AFTER (same normalizers + filters). Nothing is written or posted (preview only).
  var _oopReadModel = null;
  function _oopScopedActive() {
    return typeof window !== 'undefined' && window.KM_SCOPED_PAGE_READS !== false &&
      window.KM && window.KM.DB && typeof window.KM.DB.loadScopedTables === 'function' &&
      window.KM.DB.getDataSourceMode && window.KM.DB.getDataSourceMode() === 'google-sheet';
  }
  function _oopGet(key) {
    if (_oopReadModel) return _oopReadModel[key] || [];
    var g = 'get' + key.charAt(0).toUpperCase() + key.slice(1);
    return (window.KM && window.KM.DB && window.KM.DB[g]) ? (window.KM.DB[g]() || []) : [];
  }

  // Load the page data once. cb() is called on success or failure.
  function ensureDb(cb) {
    if (_oopScopedActive()) {
      if (_oopReadModel) { cb(true); return; }
      window.KM.DB.loadScopedTables(['warehouses', 'overseas_inventory_snapshot', 'shipments', 'shipment_lines'])
        .then(function (m) { _oopReadModel = m; cb(true); })
        .catch(function () { cb(false); });
      return;
    }
    if (window._opDbCache) { cb(true); return; }
    var loader = (window.KM && window.KM.DB && window.KM.DB.loadOperationDb) ? window.KM.DB.loadOperationDb
      : (window.reloadOperationDb || null);
    if (!loader) { cb(false); return; }
    loader({ force: true }).then(function () { cb(true); }).catch(function () { cb(!!window._opDbCache); });
  }

  // Qualifying overseas warehouses: active, NOT a factory warehouse (spec §9 / §1 classification).
  function qualifyingWarehouses() {
    var whs = _oopGet('warehouses');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    return whs.filter(function (w) {
      return w && w.warehouseId && w.isFactoryWarehouse !== true && w.isActive !== false;
    });
  }
  function warehouseById(id) {
    var whs = _oopGet('warehouses');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    for (var i = 0; i < whs.length; i++) if (whs[i].warehouseId === id) return whs[i];
    return null;
  }
  function warehouseLabel(id) {
    var w = warehouseById(id);
    if (!w) return id || '—';
    return (w.warehouseName ? w.warehouseName + ' ' : '') + '(' + w.warehouseId + ')';
  }

  // Real current overseas inventory at (warehouse, sku) — used by the Movement Impact projection.
  function snapshotAt(warehouseId, sku) {
    var snap = _oopGet('overseasInventorySnapshot');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    for (var i = 0; i < snap.length; i++) {
      if (snap[i].warehouseId === warehouseId && snap[i].sku === sku) return snap[i];
    }
    return null;
  }

  // Build candidate operations from REAL shipments whose destination warehouse qualifies as an
  // overseas (non-factory) warehouse. Each is the draft the Formal Shipment orchestrator would
  // auto-create (§9). Session overrides (status / entered qty) are overlaid on top.
  function buildOps(cfg) {
    var shipments = _oopGet('shipments');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var lines = _oopGet('shipmentLines');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
    var linesByShipment = {};
    lines.forEach(function (l) {
      if (!l.shipmentId) return;
      (linesByShipment[l.shipmentId] = linesByShipment[l.shipmentId] || []).push(l);
    });
    var store = OO._sessions[cfg.direction];
    var ops = [];

    shipments.forEach(function (s) {
      var w = warehouseById(s.warehouseId);
      if (!w || w.isFactoryWarehouse === true || w.isActive === false) return; // must be a managed overseas WH
      var key = s.shipmentId + '::' + s.warehouseId;
      var shipLines = linesByShipment[s.shipmentId] || [];
      ops.push(makeOp(cfg, key, s, w, shipLines, store[key]));
    });

    // Preview-created operations that don't map to a listed shipment candidate.
    Object.keys(store).forEach(function (key) {
      if (store[key] && store[key].createdInPreview && !ops.some(function (o) { return o.key === key; })) {
        ops.push(makeOp(cfg, key, store[key].shipmentSnap || {}, warehouseById(store[key].warehouseId), store[key].lineSeed || [], store[key]));
      }
    });
    return ops;
  }

  function makeOp(cfg, key, shipment, warehouse, shipLines, override) {
    override = override || {};
    var lines = (override.lines) ? cloneLines(override.lines) : shipLines.map(function (l) {
      return {
        sku: l.sku,
        siteSku: (l.raw && l.raw.site_sku) ? String(l.raw.site_sku).trim() : '',
        plannedQty: l.qty || 0,
        unitsPerCarton: l.unitsPerCarton || 0,
        // actual-entry buckets (preview): inbound uses good/damaged; outbound uses reserved/shipped
        goodQty: 0, damagedQty: 0, reservedQty: 0, shippedQty: 0
      };
    });
    return {
      key: key,
      direction: cfg.direction,
      shipmentId: shipment ? (shipment.shipmentId || '') : '',
      shipmentNo: shipment ? (shipment.shipmentNo || shipment.shipmentId || '') : '',
      warehouseId: warehouse ? warehouse.warehouseId : (override.warehouseId || ''),
      company: (shipment && shipment.company) || (override.company || ''),
      country: (shipment && shipment.country) || '',
      marketplace: (shipment && shipment.marketplace) || '',
      shipmentStatus: (shipment && shipment.status) || '',
      etd: (shipment && shipment.etd) || '',
      eta: (shipment && shipment.eta) || '',
      status: override.status || cfg.initialStatus,
      apiStatus: override.apiStatus || 'not_submitted',
      note: override.note || '',
      lines: lines,
      log: (override.log || []).slice(),
      createdInPreview: !!override.createdInPreview
    };
  }
  function cloneLines(ls) { return ls.map(function (l) { return Object.assign({}, l); }); }

  // Persist an op's editable state back into the session store (preview only).
  function saveOp(cfg, op) {
    OO._sessions[cfg.direction][op.key] = {
      status: op.status, apiStatus: op.apiStatus, note: op.note,
      lines: cloneLines(op.lines), log: op.log.slice(),
      createdInPreview: op.createdInPreview, warehouseId: op.warehouseId, company: op.company,
      shipmentSnap: { shipmentId: op.shipmentId, shipmentNo: op.shipmentNo, company: op.company, country: op.country },
      lineSeed: cloneLines(op.lines)
    };
  }

  OO.buildOps = buildOps;
  OO.saveOp = saveOp;
  OO.qualifyingWarehouses = qualifyingWarehouses;
  OO.warehouseById = warehouseById;
  OO.warehouseLabel = warehouseLabel;
  OO.snapshotAt = snapshotAt;
  OO.signed = signed;
  OO.ensureDb = ensureDb;

  // =========================================================================================
  // createController(cfg) — the interactive workspace (list → drawer → lifecycle → impact).
  // cfg keys:
  //   direction, sectionId, mountSelector, partialUrl, partialKey, initialStatus,
  //   plannedLabel, actualLabel, newOpLabel, actualNoun,
  //   statusMeta: { status: {label, tone} }, actions: [{id,label,from:[],to,kind}],
  //   kpis(ops) -> [{label,value,tone}], movementImpact(op) -> {title, rows:[...], note}
  // =========================================================================================
  OO.createController = function (cfg) {
    var state = { loading: true, error: '', ops: [], selectedKey: null, mode: 'list' };

    function root() { return document.getElementById(cfg.sectionId); }

    function ensureMarkup() {
      if (document.getElementById(cfg.sectionId)) return Promise.resolve(true);
      if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader.loadPartial(cfg.partialKey, cfg.partialUrl, cfg.mountSelector)
          .then(function () { return true; })
          .catch(function (e) { console.warn('[' + cfg.partialKey + '] partial load failed:', e); return false; });
      }
      return Promise.resolve(false);
    }

    function opByKey(key) { for (var i = 0; i < state.ops.length; i++) if (state.ops[i].key === key) return state.ops[i]; return null; }

    function reloadOps() {
      try { state.ops = OO.buildOps(cfg); state.error = ''; }
      catch (e) { console.error('[' + cfg.partialKey + '] buildOps failed:', e); state.error = String(e && e.message || e); state.ops = []; }
    }

    // ---------- render: shell ----------
    function render() {
      var r = root(); if (!r) return;
      var body = r.querySelector('.oow-body');
      if (!body) return;
      if (state.loading) { body.innerHTML = renderLoading(); return; }
      if (state.error) { body.innerHTML = renderError(state.error); bindError(r); return; }
      renderKpis(r);
      if (state.mode === 'drawer' && state.selectedKey) { body.innerHTML = renderDrawer(opByKey(state.selectedKey)); bindDrawer(r); }
      else { body.innerHTML = renderList(); bindList(r); }
    }

    function renderLoading() {
      return '<div class="oow-state oow-state--loading"><div class="oow-spinner"></div><p>Loading real shipment &amp; warehouse data…</p></div>';
    }
    function renderError(msg) {
      return '<div class="oow-state oow-state--error"><p class="oow-state__title">Could not load data</p>' +
        '<p class="oow-state__msg">' + esc(msg || 'Unknown error') + '</p>' +
        '<button type="button" class="oow-btn" data-oow="retry">Retry</button></div>';
    }
    function bindError(r) { var b = r.querySelector('[data-oow="retry"]'); if (b) b.onclick = function () { boot(true); }; }

    // ---------- render: KPI strip ----------
    function renderKpis(r) {
      var host = r.querySelector('.oow-kpis'); if (!host) return;
      var cards = cfg.kpis(state.ops) || [];
      host.innerHTML = cards.map(function (k) {
        return '<div class="oow-kpi oow-kpi--' + (k.tone || 'neutral') + '"><div class="oow-kpi__value">' + esc(k.value) +
          '</div><div class="oow-kpi__label">' + esc(k.label) + '</div></div>';
      }).join('');
    }

    // ---------- render: operation list ----------
    function renderList() {
      if (!state.ops.length) {
        return '<div class="oow-state oow-state--empty">' +
          '<p class="oow-state__title">No overseas ' + esc(cfg.direction) + ' operations</p>' +
          '<p class="oow-state__msg">No shipment currently maps to a managed overseas warehouse. A ' +
          cfg.direction + ' operation is auto-created when a Formal Shipment resolves to a qualifying overseas warehouse (spec §9). You can also start a preview below.</p>' +
          '<button type="button" class="oow-btn oow-btn--primary" data-oow="new">' + esc(cfg.newOpLabel) + '</button></div>';
      }
      var rows = state.ops.map(function (o) {
        var planned = sumPlanned(o), actual = sumActual(o);
        return '<tr data-key="' + esc(o.key) + '" class="oow-row">' +
          '<td class="oow-td-mono">' + esc(o.shipmentNo || o.shipmentId || '(preview)') + '</td>' +
          '<td>' + esc(OO.warehouseLabel(o.warehouseId)) + '</td>' +
          '<td>' + esc(o.company || '—') + (o.country ? ' · ' + esc(o.country) : '') + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '<td class="oow-num">' + num(planned) + '</td>' +
          '<td class="oow-num">' + num(actual) + '</td>' +
          '<td class="oow-num">' + o.lines.length + '</td>' +
          '<td><button type="button" class="oow-btn oow-btn--small" data-open="' + esc(o.key) + '">Open</button></td>' +
          '</tr>';
      }).join('');
      return '' +
        '<div class="oow-listbar">' +
          '<span class="oow-count">' + state.ops.length + ' operation' + (state.ops.length === 1 ? '' : 's') +
          ' <span class="oow-muted">(derived from real shipments to overseas warehouses)</span></span>' +
          '<span class="oow-listbar__actions">' +
            '<button type="button" class="oow-btn" data-oow="refresh">Refresh</button>' +
            '<button type="button" class="oow-btn oow-btn--primary" data-oow="new">' + esc(cfg.newOpLabel) + '</button>' +
          '</span>' +
        '</div>' +
        '<div class="oow-table-wrap"><table class="oow-table"><thead><tr>' +
          '<th>Shipment</th><th>Warehouse</th><th>Company / Country</th><th>Status</th>' +
          '<th class="oow-num">' + esc(cfg.plannedLabel) + '</th>' +
          '<th class="oow-num">' + esc(cfg.actualLabel) + '</th>' +
          '<th class="oow-num">Lines</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function bindList(r) {
      r.querySelectorAll('[data-open]').forEach(function (b) {
        b.onclick = function () { state.selectedKey = b.getAttribute('data-open'); state.mode = 'drawer'; render(); };
      });
      r.querySelectorAll('.oow-row').forEach(function (tr) {
        tr.onclick = function (e) { if (e.target.closest('[data-open]')) return; state.selectedKey = tr.getAttribute('data-key'); state.mode = 'drawer'; render(); };
      });
      var nb = r.querySelector('[data-oow="new"]'); if (nb) nb.onclick = openCreate;
      var rf = r.querySelector('[data-oow="refresh"]'); if (rf) rf.onclick = function () { boot(true); };
    }

    // ---------- create (preview) ----------
    function openCreate() {
      var shipments = _oopGet('shipments');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
      var whs = OO.qualifyingWarehouses();
      var shipOpts = shipments.map(function (s) {
        return '<option value="' + esc(s.shipmentId) + '">' + esc((s.shipmentNo || s.shipmentId) + ' — ' + (s.company || '') + ' → ' + OO.warehouseLabel(s.warehouseId)) + '</option>';
      }).join('');
      var whOpts = whs.map(function (w) { return '<option value="' + esc(w.warehouseId) + '">' + esc(OO.warehouseLabel(w.warehouseId)) + '</option>'; }).join('');
      var body = root().querySelector('.oow-body');
      body.innerHTML =
        '<div class="oow-drawer">' +
          '<div class="oow-drawer__head"><button type="button" class="oow-btn oow-btn--small" data-oow="back">&larr; Back</button>' +
          '<h3>' + esc(cfg.newOpLabel) + '</h3></div>' +
          '<div class="oow-preview-note">Preview only — selecting a shipment maps its real SKU lines. Nothing is written to the database.</div>' +
          '<div class="oow-form-grid">' +
            '<label class="oow-field"><span>Shipment mapping</span><select data-cf="shipment">' + (shipOpts || '<option value="">(no shipments)</option>') + '</select></label>' +
            '<label class="oow-field"><span>' + (cfg.direction === 'inbound' ? 'Destination' : 'Origin') + ' warehouse</span><select data-cf="warehouse">' + (whOpts || '<option value="">(no overseas warehouses)</option>') + '</select></label>' +
          '</div>' +
          '<div class="oow-actions"><button type="button" class="oow-btn oow-btn--primary" data-cf="make">Create Preview Operation</button></div>' +
        '</div>';
      var r = root();
      r.querySelector('[data-oow="back"]').onclick = function () { state.mode = 'list'; render(); };
      r.querySelector('[data-cf="make"]').onclick = function () {
        var shipId = r.querySelector('[data-cf="shipment"]').value;
        var whId = r.querySelector('[data-cf="warehouse"]').value;
        if (!shipId || !whId) return;
        var shipments2 = _oopGet('shipments');   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
        var s = null; for (var i = 0; i < shipments2.length; i++) if (shipments2[i].shipmentId === shipId) { s = shipments2[i]; break; }
        var lines = (_oopGet('shipmentLines') || []).filter(function (l) { return l.shipmentId === shipId; });
        var key = shipId + '::' + whId;
        var op = makeOp(cfg, key, s || {}, OO.warehouseById(whId), lines, null);
        op.createdInPreview = true; op.status = cfg.initialStatus;
        op.log.push(logEntry('Created in preview'));
        OO.saveOp(cfg, op);
        reloadOps();
        state.selectedKey = key; state.mode = 'drawer'; render();
      };
    }

    // ---------- render: drawer (view + lifecycle + lines + impact) ----------
    function renderDrawer(op) {
      if (!op) { return '<div class="oow-state"><p>Operation not found.</p><button type="button" class="oow-btn" data-oow="back">Back</button></div>'; }
      var actionable = availableActions(op);
      return '' +
        '<div class="oow-drawer">' +
          '<div class="oow-drawer__head">' +
            '<button type="button" class="oow-btn oow-btn--small" data-oow="back">&larr; Back to list</button>' +
            '<h3>' + esc(op.shipmentNo || op.shipmentId || '(preview operation)') + '</h3>' +
            statusBadge(op.status) + apiBadge(op.apiStatus) +
          '</div>' +
          '<div class="oow-preview-note">Preview Mode — lifecycle runs in memory only. No inventory movement is posted; nothing is persisted. Runtime handlers are not yet implemented (spec §10 / §11).</div>' +

          '<section class="oow-panel"><h4 class="oow-panel__title">Operation Header</h4>' +
            '<div class="oow-kv-grid">' +
              kv('Shipment', op.shipmentNo || op.shipmentId || '—') +
              kv(cfg.direction === 'inbound' ? 'Destination warehouse' : 'Origin warehouse', OO.warehouseLabel(op.warehouseId)) +
              kv('Company', op.company || '—') + kv('Country', op.country || '—') +
              kv('ETD', op.etd || '—') + kv('ETA', op.eta || '—') +
              kv('Shipment status', op.shipmentStatus || '—') +
              kv('Operation status', (cfg.statusMeta[op.status] && cfg.statusMeta[op.status].label) || op.status) +
            '</div>' +
          '</section>' +

          '<section class="oow-panel"><h4 class="oow-panel__title">Lifecycle</h4>' +
            renderLifecycleRail(op) +
            '<div class="oow-actions">' +
              (actionable.length ? actionable.map(function (a) {
                return '<button type="button" class="oow-btn ' + (a.kind === 'cancel' ? 'oow-btn--danger' : 'oow-btn--primary') + '" data-act="' + esc(a.id) + '">' + esc(a.label) + '</button>';
              }).join('') : '<span class="oow-muted">No further lifecycle action from this state.</span>') +
            '</div>' +
          '</section>' +

          '<section class="oow-panel"><h4 class="oow-panel__title">SKU Lines — ' + esc(cfg.plannedLabel) + ' vs ' + esc(cfg.actualLabel) + '</h4>' +
            renderLinesEditor(op) +
          '</section>' +

          '<section class="oow-panel oow-panel--impact"><h4 class="oow-panel__title">Movement / Inventory Impact <span class="oow-tag">Projected — not posted</span></h4>' +
            renderImpact(op) +
          '</section>' +

          (op.log.length ? '<section class="oow-panel"><h4 class="oow-panel__title">Preview Activity</h4><ul class="oow-log">' +
            op.log.slice().reverse().map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></section>' : '') +
        '</div>';
    }

    function renderLifecycleRail(op) {
      var steps = cfg.lifecycleSteps || [];
      var curIdx = steps.indexOf(op.status);
      return '<div class="oow-rail">' + steps.map(function (st, i) {
        var cls = 'oow-rail__step';
        if (i < curIdx) cls += ' is-done'; else if (i === curIdx) cls += ' is-current';
        return '<span class="' + cls + '">' + esc((cfg.statusMeta[st] && cfg.statusMeta[st].label) || st) + '</span>';
      }).join('<span class="oow-rail__arrow">›</span>') + '</div>';
    }

    // Editable actual-qty entry becomes active only in the "entry" statuses (receiving / picking→ship).
    function renderLinesEditor(op) {
      var entryOpen = cfg.entryStatuses.indexOf(op.status) >= 0;
      var head = cfg.direction === 'inbound'
        ? '<th>SKU</th><th>Site SKU</th><th class="oow-num">Expected</th><th class="oow-num">Good</th><th class="oow-num">Damaged</th><th class="oow-num">Over / Short</th><th class="oow-num">Line status</th>'
        : '<th>SKU</th><th>Site SKU</th><th class="oow-num">Requested</th><th class="oow-num">Reserved</th><th class="oow-num">Shipped</th><th class="oow-num">Remaining</th><th class="oow-num">Line status</th>';
      if (!op.lines.length) return '<p class="oow-muted">No SKU lines mapped from the shipment.</p>';
      var rows = op.lines.map(function (l, idx) {
        if (cfg.direction === 'inbound') {
          var good = l.goodQty || 0, dmg = l.damagedQty || 0, os = (good + dmg) - (l.plannedQty || 0);
          return '<tr>' +
            '<td class="oow-td-mono">' + esc(l.sku) + '</td><td>' + esc(l.siteSku || '—') + '</td>' +
            '<td class="oow-num">' + num(l.plannedQty) + '</td>' +
            '<td class="oow-num">' + qtyCell(entryOpen, idx, 'goodQty', good) + '</td>' +
            '<td class="oow-num">' + qtyCell(entryOpen, idx, 'damagedQty', dmg) + '</td>' +
            '<td class="oow-num ' + (os < 0 ? 'oow-short' : os > 0 ? 'oow-over' : '') + '">' + (os === 0 ? '0' : signed(os)) + '</td>' +
            '<td class="oow-num">' + esc(lineStatus(op, l)) + '</td></tr>';
        } else {
          var rsv = l.reservedQty || 0, shp = l.shippedQty || 0, rem = (l.plannedQty || 0) - shp;
          return '<tr>' +
            '<td class="oow-td-mono">' + esc(l.sku) + '</td><td>' + esc(l.siteSku || '—') + '</td>' +
            '<td class="oow-num">' + num(l.plannedQty) + '</td>' +
            '<td class="oow-num">' + num(rsv) + '</td>' +
            '<td class="oow-num">' + qtyCell(entryOpen, idx, 'shippedQty', shp) + '</td>' +
            '<td class="oow-num">' + num(rem < 0 ? 0 : rem) + '</td>' +
            '<td class="oow-num">' + esc(lineStatus(op, l)) + '</td></tr>';
        }
      }).join('');
      var hint = entryOpen
        ? '<p class="oow-hint">Enter actual ' + esc(cfg.actualNoun) + ' quantities, then use the lifecycle action above to ' + (cfg.direction === 'inbound' ? 'confirm the receipt' : 'confirm the shipout') + ' (preview).</p>'
        : '<p class="oow-hint oow-muted">Actual quantity entry unlocks at the ' + esc(cfg.direction === 'inbound' ? 'Receiving' : 'Picking → Ship Confirm') + ' stage.</p>';
      return '<div class="oow-table-wrap"><table class="oow-table oow-table--lines"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>' + hint;
    }

    function qtyCell(open, idx, field, val) {
      if (!open) return num(val);
      return '<input type="number" min="0" step="1" class="oow-qty" data-line="' + idx + '" data-field="' + field + '" value="' + (val || 0) + '">';
    }

    function lineStatus(op, l) {
      if (cfg.direction === 'inbound') {
        var recv = (l.goodQty || 0) + (l.damagedQty || 0);
        if (op.status === 'closed') return 'closed';
        if (recv <= 0) return 'pending';
        if (recv < (l.plannedQty || 0)) return 'partially_received';
        return 'received';
      } else {
        var shp = l.shippedQty || 0;
        if (op.status === 'closed') return 'closed';
        if (shp <= 0) return op.status === 'locked' || op.status === 'submitted' ? 'reserved' : 'pending';
        if (shp < (l.plannedQty || 0)) return 'partially_shipped';
        return 'shipped';
      }
    }

    // ---------- render: movement / inventory impact (real current snapshot + projected delta) ----------
    function renderImpact(op) {
      var data = cfg.movementImpact(op);
      var rows = (data.rows || []).map(function (row) {
        return '<tr>' +
          '<td class="oow-td-mono">' + esc(row.sku) + '</td>' +
          '<td>' + esc(row.bucket) + '</td>' +
          '<td class="oow-num">' + num(row.current) + '</td>' +
          '<td class="oow-num ' + (row.delta < 0 ? 'oow-short' : row.delta > 0 ? 'oow-over' : '') + '">' + (row.delta === 0 ? '0' : OO.signed(row.delta)) + '</td>' +
          '<td class="oow-num oow-strong">' + num(row.projected) + '</td>' +
          '<td>' + (row.missing ? '<span class="oow-tag oow-tag--warn">no snapshot row</span>' : '') + '</td>' +
        '</tr>';
      }).join('');
      var table = (data.rows && data.rows.length)
        ? '<div class="oow-table-wrap"><table class="oow-table"><thead><tr><th>SKU</th><th>Bucket</th><th class="oow-num">Current (real)</th><th class="oow-num">Δ (projected)</th><th class="oow-num">Projected</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="oow-muted">' + esc(data.emptyText || 'No projected movement at this stage.') + '</p>';
      return table + '<p class="oow-hint">' + esc(data.note) + '</p>';
    }

    // ---------- lifecycle engine (in-memory) ----------
    function availableActions(op) {
      return (cfg.actions || []).filter(function (a) { return a.from.indexOf(op.status) >= 0; });
    }
    function logEntry(msg) { return msg + '  ·  ' + new Date().toISOString().replace('T', ' ').slice(0, 19); }

    function applyAction(op, action) {
      // Roll up actual quantities from current inputs before transitions that consume them.
      if (action.kind === 'lock') {
        op.lines.forEach(function (l) { l.reservedQty = l.plannedQty || 0; });
        op.log.push(logEntry('Locked — reserved ' + sumField(op, 'reservedQty') + ' units (preview reserve; available → reserved)'));
      } else if (action.kind === 'receive' || action.kind === 'ship') {
        var moved = cfg.direction === 'inbound' ? sumField(op, 'goodQty') : sumField(op, 'shippedQty');
        op.log.push(logEntry((cfg.direction === 'inbound' ? 'Receipt confirmed' : 'Shipout confirmed') + ' — ' + moved + ' units (PREVIEW: no overseas_inventory_movements posted)'));
      } else if (action.kind === 'submit') {
        op.apiStatus = 'submitted';
        op.log.push(logEntry('Submitted to WMS (preview) — api_status = submitted'));
      } else if (action.kind === 'ack') {
        op.apiStatus = 'acknowledged';
        op.log.push(logEntry('WMS acknowledged (preview)'));
      } else if (action.kind === 'cancel') {
        op.lines.forEach(function (l) { l.reservedQty = 0; });
        op.log.push(logEntry('Cancelled (preview) — reserve released'));
      } else {
        op.log.push(logEntry(action.label + ' (preview) — status → ' + action.to));
      }
      op.status = action.to;
      OO.saveOp(cfg, op);
    }

    function bindDrawer(r) {
      var back = r.querySelector('[data-oow="back"]'); if (back) back.onclick = function () { state.mode = 'list'; reloadOps(); render(); };
      var op = opByKey(state.selectedKey);
      if (!op) return;
      // qty inputs
      r.querySelectorAll('.oow-qty').forEach(function (inp) {
        inp.oninput = function () {
          var idx = parseInt(inp.getAttribute('data-line'), 10);
          var field = inp.getAttribute('data-field');
          var v = parseInt(inp.value, 10); if (!isFinite(v) || v < 0) v = 0;
          if (op.lines[idx]) { op.lines[idx][field] = v; OO.saveOp(cfg, op); refreshImpactOnly(r, op); }
        };
      });
      // lifecycle actions
      r.querySelectorAll('[data-act]').forEach(function (b) {
        b.onclick = function () {
          var act = null, id = b.getAttribute('data-act');
          (cfg.actions || []).forEach(function (a) { if (a.id === id) act = a; });
          if (!act) return;
          applyAction(op, act);
          render();
        };
      });
    }

    function refreshImpactOnly(r, op) {
      var host = r.querySelector('.oow-panel--impact');
      if (host) {
        var h4 = host.querySelector('.oow-panel__title');
        host.innerHTML = (h4 ? h4.outerHTML : '') + renderImpact(op);
      }
      // also refresh line-derived cells (over/short, remaining, line status) without losing focus is
      // complex; the impact panel is the key live feedback, lines re-render on next full render.
    }

    // ---------- shared line math ----------
    function sumPlanned(op) { return op.lines.reduce(function (a, l) { return a + (l.plannedQty || 0); }, 0); }
    function sumActual(op) {
      return op.lines.reduce(function (a, l) {
        return a + (cfg.direction === 'inbound' ? (l.goodQty || 0) + (l.damagedQty || 0) : (l.shippedQty || 0));
      }, 0);
    }
    function sumField(op, f) { return op.lines.reduce(function (a, l) { return a + (l[f] || 0); }, 0); }

    // ---------- small html helpers ----------
    function statusBadge(status) {
      var m = cfg.statusMeta[status] || { label: status, tone: 'neutral' };
      return '<span class="oow-badge oow-badge--' + (m.tone || 'neutral') + '">' + esc(m.label) + '</span>';
    }
    function apiBadge(api) {
      if (!api || api === 'not_submitted') return '';
      return '<span class="oow-badge oow-badge--api">API: ' + esc(api) + '</span>';
    }
    function kv(k, v) { return '<div class="oow-kv"><span class="oow-kv__k">' + esc(k) + '</span><span class="oow-kv__v">' + esc(v) + '</span></div>'; }

    // expose the line-math helpers to cfg.movementImpact via closure-free access
    OO._sumField = sumField;

    // ---------- boot ----------
    function boot(force) {
      state.loading = true; state.error = ''; render();
      OO.ensureDb(function (ok) {
        state.loading = false;
        if (!ok && !window._opDbCache) { state.error = 'Operation database is not loaded.'; render(); return; }
        reloadOps();
        render();
      });
    }

    return {
      mount: function () {
        ensureMarkup().then(function (loaded) {
          var sec = root();
          if (sec) sec.classList.add('active');
          if (!loaded || !sec) return;
          state.mode = 'list'; state.selectedKey = null;
          boot(false);
        });
      },
      unmount: function () {}
    };
  };
})();

