// On-the-Way / Shipment Runtime — operational shipment tracking center on a REAL 3D Earth globe.
//
// Reads REAL data via the API Adapter: shipments + shipment_routes (runtime route NODES, one row per node,
// grouped by shipment_id + ordered by sequence_no) + shipment_events (actual events only) + warehouses +
// logistics_locations (location_ref resolution + Global Reference layer) + route templates. No writes, no
// fabricated coordinates, no demo fallback, no planned shipment_events.
//
// The map is a genuine WebGL sphere rendered by km-globe.js (self-contained; land/ocean texture rasterized
// from the vendored Natural Earth outline — no runtime CDN). The globe instance is created ONCE and PERSISTS
// across page re-renders (its host node is detached before each innerHTML rewrite and re-attached after), so
// the WebGL context is never lost. Markers/arcs update imperatively. If WebGL or the land asset is missing,
// an explicit Globe Error is shown — never a flat blue grid masquerading as Earth.
//
// Canonical rules honored: KPIs are Shipment-grain; Current Position priority = latest Event coord → current
// Route Node coord → last completed Node coord → location_ref Location → Coordinate Pending (never 0,0);
// a shipment with no drawable position is NOT dropped — it appears in the Coordinate Pending tray; Event
// Timeline shows ACTUAL events only; Upcoming route comes from shipment_routes, never planned events.

(function () {
  'use strict';
  if (!(window.KM && window.KM.lifecycle)) { return; }

  var DELIVERED_SET = { received: 1, completed: 1, delivered: 1, closed: 1 };
  var EXCLUDE_SET = { cancelled: 1 };
  var MOVING_SET = { shipped: 1, in_transit: 1 };
  var RUNTIME_SET = { shipped: 1, in_transit: 1, arrived: 1, partial_received: 1, received: 1, completed: 1, delivered: 1 };

  // marker colors (rgb 0..1)
  var COL = {
    pos: [0.0, 0.50, 0.73], exc: [0.86, 0.15, 0.15], done: [0.09, 0.64, 0.29], cur: [0.0, 0.50, 0.73],
    upcoming: [0.58, 0.64, 0.72], origin: [0.06, 0.09, 0.16], dest: [0.0, 0.50, 0.73],
    customs: [0.48, 0.23, 0.93], ref: [0.60, 0.66, 0.74], endpoint: [0.40, 0.47, 0.56]
  };

  var KPIS = [
    { id: 'onTheWay', label: 'On the Way', tone: 'info' },
    { id: 'customs', label: 'Customs Clearance', tone: 'warn' },
    { id: 'exception', label: 'Exceptions', tone: 'danger' },
    { id: 'arrivingSoon', label: 'Arriving Soon', tone: 'good' },
    { id: 'delayed', label: 'Delayed', tone: 'danger' },
    { id: 'deliveredToday', label: 'Delivered Today', tone: 'done' }
  ];

  var state = {
    loading: true, error: '', partial: '',
    mode: 'runtime',                 // 'runtime' (primary) | 'template' | 'global'
    rm: null, idx: null, vms: null,
    filters: { search: '', company: '', originCountry: '', destCountry: '', destWarehouse: '', carrier: '', method: '', status: '', stage: '', routeTemplateId: '', etaFrom: '', etaTo: '', exceptionOnly: false, delayedOnly: false, arrivingSoon: false, kpi: '' },
    selectedShipmentId: '',
    selectedTemplateId: '',
    ref: { search: '', country: '', type: '' },
    showPlannedRoute: true,
    showReference: false,
    sourceMode: 'not-loaded', diag: null,
    debug: (function () { try { return /(?:[?&])glmdebug=1/.test(location.search) || !!window.KM_GLM_DEBUG; } catch (e) { return false; } })(),
    globe: null, globeHost: null, globeError: '', didFocus: false,
    lastFocusEl: null, escInstalled: false
  };

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { var v = parseFloat(n); return isFinite(v) ? v.toLocaleString('en-US') : '0'; }
  function low(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function validCoord(lat, lng) { return (typeof lat === 'number') && (typeof lng === 'number') && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0); }
  function root() { return document.getElementById('global-logistics-map-section'); }
  function body() { var r = root(); return r ? r.querySelector('[data-glm="body"]') : null; }
  function parseDate(s) { s = String(s == null ? '' : s).trim(); if (!s) return null; var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]); var t = Date.parse(s); return isNaN(t) ? null : t; }
  function tpeTodayMs() { var d; try { d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { d = new Date().toISOString().slice(0, 10); } return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); }
  function prefersReducedMotion() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  // ---------- data ----------
  function ensureDb(force, cb) {
    var mode = (window.KM.DB && window.KM.DB.getDataSourceMode) ? window.KM.DB.getDataSourceMode() : (window._opDbCache ? 'unknown' : 'not-loaded');
    if (!force && window._opDbCache && mode === 'google-sheet') { cb(true); return; }
    var loader = (window.KM.DB && window.KM.DB.loadOperationDb) ? window.KM.DB.loadOperationDb : (window.reloadOperationDb || null);
    if (!loader) { cb(!!window._opDbCache); return; }
    loader({ force: true }).then(function () { cb(true); }).catch(function () { cb(!!window._opDbCache); });
  }

  function nodeStatusClass(st) {
    st = low(st);
    if (/exception|delay|hold|problem|stuck|fail/.test(st)) return 'exception';
    if (/current|in_progress|active|transit|ongoing/.test(st)) return 'current';
    if (/complete|done|departed|arrived|received|cleared|delivered/.test(st)) return 'completed';
    return 'planned';
  }
  function dedupeEvents(evs) {
    var seen = {}, out = [];
    evs.forEach(function (e) { var k = (e.source || '') + '|' + (e.sourceEventId || ''); if (e.source && e.sourceEventId) { if (seen[k]) return; seen[k] = 1; } out.push(e); });
    return out;
  }

  function buildReadModel() {
    var db = window.KM.DB;
    var rm = {
      shipments: (db.getShipments && db.getShipments()) || [],
      shipmentRoutes: (db.getShipmentRoutes && db.getShipmentRoutes()) || [],
      shipmentEvents: (db.getShipmentEvents && db.getShipmentEvents()) || [],
      warehouses: (db.getWarehouses && db.getWarehouses()) || [],
      locations: (db.getLogisticsLocations && db.getLogisticsLocations()) || [],
      routeTemplates: (db.getShipmentRouteTemplates && db.getShipmentRouteTemplates()) || [],
      routeTemplateNodes: (db.getShipmentRouteTemplateNodes && db.getShipmentRouteTemplateNodes()) || []
    };
    var locById = {}, locByWh = {}, locByFactory = {};
    rm.locations.forEach(function (l) {
      if (l.logisticsLocationId) locById[l.logisticsLocationId] = l;
      if (l.warehouseId && validCoord(l.latitude, l.longitude) && !locByWh[l.warehouseId]) locByWh[l.warehouseId] = l;
      if (l.factoryId && validCoord(l.latitude, l.longitude) && !locByFactory[l.factoryId]) locByFactory[l.factoryId] = l;
    });
    var whById = {}; rm.warehouses.forEach(function (w) { if (w.warehouseId) whById[w.warehouseId] = w; });
    var eventsByShip = {}; rm.shipmentEvents.forEach(function (e) { (eventsByShip[e.shipmentId] = eventsByShip[e.shipmentId] || []).push(e); });
    Object.keys(eventsByShip).forEach(function (k) { eventsByShip[k].sort(function (a, b) { return (a.eventSequence - b.eventSequence) || String(a.eventTime).localeCompare(String(b.eventTime)); }); eventsByShip[k] = dedupeEvents(eventsByShip[k]); });
    var nodesByShip = {}; rm.shipmentRoutes.forEach(function (n) { (nodesByShip[n.shipmentId] = nodesByShip[n.shipmentId] || []).push(n); });
    Object.keys(nodesByShip).forEach(function (k) { nodesByShip[k].sort(function (a, b) { return a.sequenceNo - b.sequenceNo; }); });
    state.rm = rm;
    state.idx = { locById: locById, locByWh: locByWh, locByFactory: locByFactory, whById: whById, eventsByShip: eventsByShip, nodesByShip: nodesByShip };
    state.vms = buildShipmentViewModels();
    var missing = [];
    if (!rm.shipmentRoutes.length) missing.push('shipment_routes');
    if (!rm.shipmentEvents.length) missing.push('shipment_events');
    state.partial = missing.length ? ('Runtime route/event data not yet populated (' + missing.join(', ') + '). Shipments still appear — with a drawable position when coordinates resolve, otherwise in the Coordinate Pending tray. No demo data is substituted.') : '';
  }

  function buildShipmentViewModels() {
    var idx = state.idx, rm = state.rm;
    var today = tpeTodayMs(), soon = today + 7 * 86400000;
    var out = {};
    rm.shipments.forEach(function (s) {
      var events = idx.eventsByShip[s.shipmentId] || [];
      var nodes = idx.nodesByShip[s.shipmentId] || [];
      var status = low(s.status);
      if (EXCLUDE_SET[status]) return;
      var isRuntime = RUNTIME_SET[status] || events.length > 0 || nodes.length > 0;
      if (!isRuntime) return;
      if (status === 'closed') return;
      var latestEvent = events.length ? events[events.length - 1] : null;
      var currentNode = null, lastCompleted = null;
      nodes.forEach(function (n) { var c = nodeStatusClass(n.status); if (c === 'current' && !currentNode) currentNode = n; if (c === 'completed') lastCompleted = n; });
      var delivered = !!DELIVERED_SET[status] || !!s.deliveredDate || (latestEvent && /deliver|received/.test(low(latestEvent.eventType) + ' ' + low(latestEvent.eventStatus)));
      var etaMs = parseDate(s.eta);
      var stage = currentNode ? (currentNode.nodeType || currentNode.nodeCode || 'In Transit')
        : (lastCompleted ? ('After ' + (lastCompleted.nodeType || lastCompleted.nodeCode)) : (latestEvent ? (latestEvent.eventType || latestEvent.eventStatus || 'In Transit') : (s.status || 'Unknown')));
      var custHay = low((currentNode && currentNode.nodeType) || '') + ' ' + low((latestEvent && latestEvent.eventType) || '') + ' ' + low((latestEvent && latestEvent.eventStatus) || '');
      var excHay = low(s.status) + ' ' + (nodes.some(function (n) { return nodeStatusClass(n.status) === 'exception'; }) ? 'exception ' : '') + low((latestEvent && latestEvent.eventType) || '') + ' ' + low((latestEvent && latestEvent.eventStatus) || '') + ' ' + low((latestEvent && latestEvent.rawStatus) || '');
      var deliveredMs = parseDate(s.deliveredDate) || parseDate(s.actualArrivalDate) || (delivered && latestEvent ? parseDate(latestEvent.eventTime) : null);
      var originCountry = (nodes[0] && nodes[0].country) || '';
      var vm = {
        shipmentId: s.shipmentId, shipmentNo: s.shipmentNo || s.shipmentId, company: s.company || '',
        carrier: s.carrierId || '', method: s.shippingMethodDisplay || s.shippingMethod || '',
        originCountry: originCountry, destCountry: s.country || '', destWarehouseId: s.warehouseId || '',
        destWarehouse: (idx.whById[s.warehouseId] && idx.whById[s.warehouseId].warehouseName) || s.warehouseId || (s.destination || ''),
        shipFrom: s.shipFrom || '', destination: s.destination || '', status: s.status || '',
        tracking: s.trackingNumber || '', container: s.containerNo || '', eta: s.eta || '', etaMs: etaMs,
        delivered: delivered, events: events, latestEvent: latestEvent,
        latestUpdated: (latestEvent && latestEvent.eventTime) || s.updatedAt || s.createdAt || '',
        nodes: nodes, currentNode: currentNode, lastCompleted: lastCompleted,
        routeTemplateId: (nodes.filter(function (n) { return n.routeTemplateId; })[0] || {}).routeTemplateId || '',
        stage: stage,
        flags: {
          onTheWay: !delivered && (!!MOVING_SET[status] || (!!latestEvent && !delivered)),
          customs: !delivered && /customs|clearance|import/.test(custHay),
          exception: (status === 'stuck') || /exception|delay|hold|problem|stuck/.test(excHay),
          arrivingSoon: !delivered && etaMs != null && etaMs >= today && etaMs <= soon,
          delayed: !delivered && etaMs != null && etaMs < today,
          deliveredToday: delivered && deliveredMs != null && deliveredMs === today
        }
      };
      out[s.shipmentId] = vm;
    });
    return out;
  }
  function allVms() { return Object.keys(state.vms).map(function (k) { return state.vms[k]; }); }

  // ---------- position resolution ----------
  function resolveCurrentPosition(vm) {
    for (var i = vm.events.length - 1; i >= 0; i--) { var e = vm.events[i]; if (validCoord(e.latitude, e.longitude)) return { lat: e.latitude, lng: e.longitude, source: 'LATEST_EVENT', drawable: true }; }
    if (vm.currentNode && validCoord(vm.currentNode.latitude, vm.currentNode.longitude)) return { lat: vm.currentNode.latitude, lng: vm.currentNode.longitude, source: 'CURRENT_NODE', drawable: true };
    if (vm.lastCompleted && validCoord(vm.lastCompleted.latitude, vm.lastCompleted.longitude)) return { lat: vm.lastCompleted.latitude, lng: vm.lastCompleted.longitude, source: 'LAST_COMPLETED_NODE', drawable: true };
    var refNode = vm.currentNode || vm.lastCompleted;
    if (refNode && refNode.locationRefId) { var loc = state.idx.locById[refNode.locationRefId]; if (loc && validCoord(loc.latitude, loc.longitude)) return { lat: loc.latitude, lng: loc.longitude, source: 'LOCATION_REF', drawable: true }; }
    return { lat: null, lng: null, source: 'COORDINATE_PENDING', drawable: false };
  }
  function resolveNodeCoord(n) {
    if (validCoord(n.latitude, n.longitude)) return { lat: n.latitude, lng: n.longitude, drawable: true, src: 'NODE' };
    if (n.locationRefId) { var loc = state.idx.locById[n.locationRefId]; if (loc && validCoord(loc.latitude, loc.longitude)) return { lat: loc.latitude, lng: loc.longitude, drawable: true, src: 'LOCATION_REF' }; }
    return { lat: null, lng: null, drawable: false, src: 'PENDING' };
  }
  // Destination endpoint (real coord only): logistics_location bound to the destination warehouse. Never fabricated.
  function resolveDestinationCoord(vm) { var l = state.idx.locByWh[vm.destWarehouseId]; if (l && validCoord(l.latitude, l.longitude)) return { lat: l.latitude, lng: l.longitude, src: 'DEST_WAREHOUSE_LOCATION', name: l.locationName || vm.destWarehouse }; return null; }
  function resolveOriginCoord(vm) { if (vm.nodes[0]) { var c = resolveNodeCoord(vm.nodes[0]); if (c.drawable) return { lat: c.lat, lng: c.lng, src: 'ORIGIN_NODE' }; } return null; }
  // Overall placement for the runtime layer. Endpoints are labeled endpoints — NEVER "current position".
  function resolveShipmentPlacement(vm) {
    var pos = resolveCurrentPosition(vm);
    if (pos.drawable) return { kind: 'current', lat: pos.lat, lng: pos.lng, source: pos.source };
    var d = resolveDestinationCoord(vm); if (d) return { kind: 'destination', lat: d.lat, lng: d.lng, source: d.src };
    var o = resolveOriginCoord(vm); if (o) return { kind: 'origin', lat: o.lat, lng: o.lng, source: o.src };
    return { kind: 'pending' };
  }

  // ---------- KPIs / filters ----------
  function computeKpis() { var vms = allVms(); return KPIS.map(function (k) { return { id: k.id, label: k.label, tone: k.tone, value: vms.filter(function (v) { return v.flags[k.id]; }).length }; }); }
  function optSet(vms, fn) { var s = {}; vms.forEach(function (v) { var x = (fn(v) || '').toString().trim(); if (x) s[x] = 1; }); return Object.keys(s).sort(); }
  function filteredVms() {
    var f = state.filters, q = f.search.trim().toLowerCase();
    return allVms().filter(function (v) {
      if (f.kpi && !v.flags[f.kpi]) return false;
      if (q) { var hay = (v.shipmentNo + ' ' + v.tracking + ' ' + v.container).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      if (f.company && v.company !== f.company) return false;
      if (f.originCountry && v.originCountry !== f.originCountry) return false;
      if (f.destCountry && v.destCountry !== f.destCountry) return false;
      if (f.destWarehouse && v.destWarehouse !== f.destWarehouse) return false;
      if (f.carrier && v.carrier !== f.carrier) return false;
      if (f.method && v.method !== f.method) return false;
      if (f.status && v.status !== f.status) return false;
      if (f.stage && v.stage !== f.stage) return false;
      if (f.routeTemplateId && v.routeTemplateId !== f.routeTemplateId) return false;
      if (f.etaFrom && (v.etaMs == null || v.etaMs < parseDate(f.etaFrom))) return false;
      if (f.etaTo && (v.etaMs == null || v.etaMs > parseDate(f.etaTo))) return false;
      if (f.exceptionOnly && !v.flags.exception) return false;
      if (f.delayedOnly && !v.flags.delayed) return false;
      if (f.arrivingSoon && !v.flags.arrivingSoon) return false;
      return true;
    });
  }
  // Shipments in the runtime view with no drawable placement → Coordinate Pending tray.
  function pendingShipments() { return filteredVms().filter(function (v) { return resolveShipmentPlacement(v).kind === 'pending'; }); }

  // ---------- render shell ----------
  function render() {
    var b = body(); if (!b) return;
    detachGlobe();                              // preserve the persistent WebGL host across the innerHTML rewrite
    var r = root(); var meta = r.querySelector('[data-glm="meta"]');
    if (state.loading) { b.innerHTML = '<div class="glm-state"><div class="glm-spinner"></div><p>Loading shipment runtime…</p></div>'; return; }
    if (state.error) { b.innerHTML = '<div class="glm-state glm-state--error"><p class="glm-state__title">Could not load data</p><p class="glm-state__msg">' + esc(state.error) + '</p><button type="button" class="glm-btn" data-act="retry">Retry</button></div>'; var rb = r.querySelector('[data-act="retry"]'); if (rb) rb.onclick = function () { boot(true); }; return; }
    if (meta) { var vms = allVms(); meta.textContent = vms.length + ' shipments · ' + state.rm.shipmentRoutes.length + ' route nodes · ' + state.rm.shipmentEvents.length + ' events · ' + state.rm.locations.length + ' logistics locations.'; }

    var sideHtml = (state.mode === 'template') ? renderTemplateSide() : (state.mode === 'global') ? renderGlobalRefSide() : (renderFilters() + renderShipmentList());
    b.innerHTML =
      renderTopBar() +
      renderSourceBanner() +
      (state.partial ? renderPartialNote() : '') +
      (state.debug ? renderDiagPanel() : '') +
      (state.mode === 'runtime' ? renderKpiStrip() : '') +
      '<div class="glm-main">' +
        '<div class="glm-side">' + sideHtml + '</div>' +
        '<div class="glm-mapwrap">' + renderMapShell() + '</div>' +
      '</div>' +
      renderDrawerShell();
    attachGlobe();
    bindRuntime();
  }

  var MODE_TABS = [{ id: 'runtime', label: 'On the Way' }, { id: 'template', label: 'Route Template' }, { id: 'global', label: 'Global Reference' }];
  function renderTopBar() {
    return '<div class="glm-topbar">' +
      '<div class="glm-modebar" role="tablist" aria-label="Map layer">' + MODE_TABS.map(function (m) {
        return '<button type="button" role="tab" aria-selected="' + (state.mode === m.id) + '" class="glm-mode' + (state.mode === m.id ? ' is-active' : '') + '" data-mode="' + m.id + '">' + esc(m.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="glm-topbar__admin"><button type="button" class="glm-btn" data-act="refresh">↻ Refresh</button></div>' +
      '</div>';
  }
  function renderSourceBanner() {
    if (state.sourceMode === 'mock') return '<div class="glm-warn glm-warn--danger">⚠ Operation DB API failed — showing <strong>FALLBACK data (not production)</strong>' + ((window._opDbCache && window._opDbCache._apiError) ? (': ' + esc(window._opDbCache._apiError)) : '') + '. Click <strong>↻ Refresh</strong> to retry the live API.</div>';
    return '';
  }
  // Compact, collapsible runtime-data note (never a big bar covering the globe).
  function renderPartialNote() {
    return '<details class="glm-note"><summary>⚠ Runtime route/event data incomplete</summary><p>' + esc(state.partial) + '</p></details>';
  }
  function renderDiagPanel() {
    var d = state.diag; if (!d) return '<div class="glm-warn">Diagnostics: no data-chain diagnostics captured yet.</div>';
    var rows = Object.keys(d.tables || {}).map(function (t) { var x = d.tables[t]; return '<tr><td>' + esc(t) + '</td><td class="glm-num">' + x.raw + '</td><td class="glm-num">' + x.kept + '</td><td class="glm-muted" style="font-size:10px;">' + esc((x.sampleKeys || []).join(', ') || '—') + '</td></tr>'; }).join('');
    return '<div class="glm-panel" style="margin-bottom:12px;"><h3 class="glm-panel__title">Data-chain diagnostics (source: ' + esc(d.sourceMode) + ')</h3>' +
      '<div class="glm-table-wrap"><table class="glm-table" style="width:100%;font-size:11.5px;"><thead><tr><th>table</th><th class="glm-num">raw</th><th class="glm-num">kept</th><th>raw column keys (first row)</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="glm-hint glm-muted">raw 0 → getter/sheet/router; raw N &amp; kept 0 → normalizer/column-name filter (compare the raw keys to the expected canonical columns); source mock → API failed.</p></div>';
  }
  function renderKpiStrip() {
    var f = state.filters;
    return '<div class="glm-kpis" role="group" aria-label="Shipment KPIs">' + computeKpis().map(function (k) {
      var active = f.kpi === k.id;
      return '<button type="button" class="glm-kpi glm-kpi--' + k.tone + (active ? ' is-active' : '') + '" data-kpi="' + k.id + '" aria-pressed="' + active + '">' +
        '<span class="glm-kpi__value">' + num(k.value) + '</span><span class="glm-kpi__label">' + esc(k.label) + '</span></button>';
    }).join('') + (f.kpi ? '<button type="button" class="glm-btn glm-btn--small" data-act="clear-kpi">Clear KPI filter</button>' : '') + '</div>';
  }

  // ---------- filters panel ----------
  function selHtml(label, key, opts, cur) {
    return '<label class="glm-field"><span>' + esc(label) + '</span><select data-filter="' + key + '"><option value="">All</option>' +
      opts.map(function (o) { return '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
  }
  function renderFilters() {
    var vms = allVms(), f = state.filters;
    var tplOpts = optSet(vms, function (v) { return v.routeTemplateId; });
    return '<div class="glm-panel"><h3 class="glm-panel__title">Shipment Runtime Filters</h3>' +
      '<label class="glm-field"><span>Search — Shipment / Tracking / Container</span><input type="text" data-filter="search" value="' + esc(f.search) + '" placeholder="Search…"></label>' +
      selHtml('Company', 'company', optSet(vms, function (v) { return v.company; }), f.company) +
      selHtml('Origin Country', 'originCountry', optSet(vms, function (v) { return v.originCountry; }), f.originCountry) +
      selHtml('Destination Country', 'destCountry', optSet(vms, function (v) { return v.destCountry; }), f.destCountry) +
      selHtml('Destination Warehouse', 'destWarehouse', optSet(vms, function (v) { return v.destWarehouse; }), f.destWarehouse) +
      selHtml('Carrier', 'carrier', optSet(vms, function (v) { return v.carrier; }), f.carrier) +
      selHtml('Shipping Method / Transport Mode', 'method', optSet(vms, function (v) { return v.method; }), f.method) +
      selHtml('Shipment Status', 'status', optSet(vms, function (v) { return v.status; }), f.status) +
      selHtml('Current Stage', 'stage', optSet(vms, function (v) { return v.stage; }), f.stage) +
      (tplOpts.length ? selHtml('Route Template', 'routeTemplateId', tplOpts, f.routeTemplateId) : '') +
      '<div class="glm-field-row"><label class="glm-field"><span>ETA From</span><input type="date" data-filter="etaFrom" value="' + esc(f.etaFrom) + '"></label>' +
      '<label class="glm-field"><span>ETA To</span><input type="date" data-filter="etaTo" value="' + esc(f.etaTo) + '"></label></div>' +
      '<label class="glm-check"><input type="checkbox" data-filter="exceptionOnly"' + (f.exceptionOnly ? ' checked' : '') + '> Exception only</label>' +
      '<label class="glm-check"><input type="checkbox" data-filter="delayedOnly"' + (f.delayedOnly ? ' checked' : '') + '> Delayed only</label>' +
      '<label class="glm-check"><input type="checkbox" data-filter="arrivingSoon"' + (f.arrivingSoon ? ' checked' : '') + '> Arriving within 7 days</label>' +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn" data-act="clear-filters">Clear Filters</button></div>' +
      '</div>';
  }

  // ---------- shipment list + pending tray ----------
  function shipMode(vm) { var m = low(vm.method); if (/air|flight|空/.test(m)) return 'Air'; if (/sea|ocean|vessel|海|fcl|lcl/.test(m)) return 'Sea'; if (/truck|ground|road|land|陸/.test(m)) return 'Ground'; return vm.method || '—'; }
  function renderShipmentList() {
    var vms = filteredVms();
    vms.sort(function (a, b) { return (b.flags.exception - a.flags.exception) || (b.flags.delayed - a.flags.delayed) || ((a.etaMs || Infinity) - (b.etaMs || Infinity)); });
    if (!vms.length) {
      var anyUniverse = allVms().length;
      return '<div class="glm-panel"><h3 class="glm-panel__title">Shipments (0)</h3><p class="glm-muted">' +
        (anyUniverse ? 'No shipments match the current filters.' : 'No shipments are on the way yet. This is a formal empty state — no demo shipment is drawn.') + '</p></div>';
    }
    var rows = vms.map(function (v) {
      var pl = resolveShipmentPlacement(v);
      var flag = v.flags.exception ? '<span class="glm-badge glm-badge--danger">Exception</span>' : (v.flags.delayed ? '<span class="glm-badge glm-badge--danger">Delayed</span>' : (v.flags.arrivingSoon ? '<span class="glm-badge glm-badge--good">Arriving Soon</span>' : ''));
      var posBadge = pl.kind === 'pending' ? '<span class="glm-badge glm-badge--pending">Coord Pending</span>' : (pl.kind !== 'current' ? '<span class="glm-badge glm-badge--neutral">' + esc(pl.kind) + '</span>' : '');
      return '<div class="glm-ship' + (state.selectedShipmentId === v.shipmentId ? ' is-selected' : '') + '" data-ship="' + esc(v.shipmentId) + '" tabindex="0" role="button" aria-label="Shipment ' + esc(v.shipmentNo) + '">' +
        '<div class="glm-ship__hd"><span class="glm-ship__no">' + esc(v.shipmentNo) + '</span>' + flag + '</div>' +
        '<div class="glm-ship__route">' + esc(v.originCountry || v.shipFrom || '?') + ' → ' + esc(v.destCountry || v.destWarehouse || '?') + ' ' + posBadge + '</div>' +
        '<div class="glm-ship__meta">' + esc(v.carrier || '—') + ' · ' + esc(shipMode(v)) + '</div>' +
        '<div class="glm-ship__meta">Stage: <strong>' + esc(v.stage) + '</strong> · ETA: ' + esc(v.eta || '—') + '</div>' +
        '</div>';
    }).join('');
    return '<div class="glm-panel"><h3 class="glm-panel__title">Shipments (' + vms.length + ')</h3><div class="glm-shiplist">' + rows + '</div></div>';
  }

  // ---------- map shell (persistent WebGL globe host) ----------
  function renderMapShell() {
    var pend = (state.mode === 'runtime') ? pendingShipments() : [];
    return '' +
      '<div class="glm-globe-slot" data-glm="globe-slot"></div>' +
      '<div class="glm-tip" data-glm="tip" aria-hidden="true"></div>' +
      '<div class="glm-map-controls">' +
        '<button type="button" class="glm-btn" data-act="zoom-in" aria-label="Zoom in">+</button>' +
        '<button type="button" class="glm-btn" data-act="zoom-out" aria-label="Zoom out">&minus;</button>' +
        '<button type="button" class="glm-btn" data-act="reset" aria-label="Reset view">⤢</button>' +
      '</div>' +
      (state.mode === 'runtime' ?
        '<div class="glm-map-toggles">' +
          '<label class="glm-check glm-check--map"><input type="checkbox" data-toggle="showPlannedRoute"' + (state.showPlannedRoute ? ' checked' : '') + '> Route arcs</label>' +
          '<label class="glm-check glm-check--map"><input type="checkbox" data-toggle="showReference"' + (state.showReference ? ' checked' : '') + '> Reference pins</label>' +
        '</div>' : '') +
      (pend.length ? renderPendingTray(pend) : '') +
      '<details class="glm-legend" data-glm="legend"><summary>Legend</summary>' + legendHtml() + '</details>';
  }
  function renderPendingTray(pend) {
    var items = pend.map(function (v) {
      return '<button type="button" class="glm-tray__item' + (state.selectedShipmentId === v.shipmentId ? ' is-selected' : '') + '" data-ship="' + esc(v.shipmentId) + '" aria-label="Coordinate pending shipment ' + esc(v.shipmentNo) + '">' +
        '<span class="glm-tray__ico" aria-hidden="true">◌</span>' +
        '<span class="glm-tray__no">' + esc(v.shipmentNo) + '</span>' +
        '<span class="glm-tray__meta">' + esc(v.status || '—') + ' · ' + esc(shipMode(v)) + ' · ETA ' + esc(v.eta || '—') + '</span></button>';
    }).join('');
    return '<div class="glm-tray" role="group" aria-label="Coordinate Pending shipments"><div class="glm-tray__hd">◌ Coordinate Pending (' + pend.length + ')</div><div class="glm-tray__list">' + items + '</div></div>';
  }
  function legendHtml() {
    function row(c, lbl) { return '<div class="glm-legend__row"><span class="glm-legend__dot glm-mk--' + c + '"></span>' + esc(lbl) + '</div>'; }
    return row('pos', 'Current position') + row('done', 'Completed node') + row('upcoming', 'Upcoming node') +
      row('customs', 'Customs') + row('exc', 'Exception / delayed') + row('endpoint', 'Origin / destination endpoint') + row('ref', 'Reference location');
  }

  // ---------- globe management (persist across re-renders) ----------
  function detachGlobe() { if (state.globeHost && state.globeHost.parentNode) { try { state.globeHost.parentNode.removeChild(state.globeHost); } catch (e) {} } }
  function attachGlobe() {
    var r = root(); if (!r) return;
    var slot = r.querySelector('[data-glm="globe-slot"]'); if (!slot) return;
    if (!state.globeHost) { state.globeHost = document.createElement('div'); state.globeHost.className = 'glm-globe-host'; bindGlobeTooltip(state.globeHost); }
    slot.appendChild(state.globeHost);
    if (!state.globe && !state.globeError) {
      if (!(window.KMGlobe && window.KMGlobe.isSupported && window.KMGlobe.isSupported())) {
        state.globeError = 'This browser/GPU does not support WebGL, so the 3D Earth cannot be rendered.';
      } else {
        state.globe = window.KMGlobe.create(state.globeHost, {
          reducedMotion: prefersReducedMotion(),
          onError: function (kind, msg) { state.globe = null; state.globeError = globeErrText(kind, msg); showGlobeError(); },
          onMarkerClick: function (id) { onPinClick(id); },
          onMarkerHover: function (id) { showTip(id); }
        });
      }
    }
    if (state.globe) { state.globe.resize(); updateGlobeLayers(); }
    else showGlobeError();
  }
  function globeErrText(kind, msg) {
    if (kind === 'webgl' || kind === 'contextlost') return 'WebGL is unavailable or was lost — the 3D Earth cannot render. ' + esc(msg || '');
    if (kind === 'asset') return 'Globe Asset Error — the Earth land/ocean texture could not be built (land outline asset missing). ' + esc(msg || '');
    return 'Globe engine error. ' + esc(msg || '');
  }
  function showGlobeError() {
    var host = state.globeHost; if (!host) return;
    host.innerHTML = '<div class="glm-globe-err" role="alert"><div class="glm-globe-err__icon">🌐</div>' +
      '<p class="glm-globe-err__title">3D globe unavailable</p>' +
      '<p class="glm-globe-err__msg">' + (state.globeError || 'Unknown error.') + '</p>' +
      '<button type="button" class="glm-btn" data-act="globe-retry">Retry</button></div>';
    var b = host.querySelector('[data-act="globe-retry"]'); if (b) b.onclick = function () { state.globeError = ''; state.globe = null; host.innerHTML = ''; attachGlobe(); };
  }
  // Build the marker + arc sets for the current mode and push them to the globe.
  function updateGlobeLayers() {
    if (!state.globe) return;
    var markers = [], arcs = [], focusPts = [];
    if (state.mode === 'global') {
      refFilteredLocations().forEach(function (l) {
        if (!validCoord(l.latitude, l.longitude)) return;
        var kind = /port|airport|rail|border|gateway|customs/i.test(l.locationType || '') ? 'customs' : (/factory/i.test(l.locationType || '') ? 'origin' : 'ref');
        markers.push({ id: 'loc:' + (l.logisticsLocationId || l.locationCode), lat: l.latitude, lng: l.longitude, color: COL[kind] || COL.ref, size: 9, elev: 1.012 });
        focusPts.push([l.latitude, l.longitude]);
      });
    } else if (state.mode === 'template') {
      var tnodes = state.selectedTemplateId ? templateNodes(state.selectedTemplateId) : [];
      var seq = [];
      tnodes.forEach(function (n, i) {
        var c = refNodeCoord(n); if (!c) return;
        var isEnd = i === tnodes.length - 1;
        markers.push({ id: 'tnode:' + n.nodeSequence, lat: c.lat, lng: c.lng, color: isEnd ? COL.dest : (i === 0 ? COL.origin : COL.upcoming), size: 12, elev: 1.014 });
        seq.push([c.lat, c.lng]); focusPts.push([c.lat, c.lng]);
      });
      if (seq.length > 1) arcs.push({ points: seq, color: COL.upcoming });
    } else {
      // runtime
      if (state.showReference) state.rm.locations.forEach(function (l) { if (validCoord(l.latitude, l.longitude)) markers.push({ id: 'loc:' + (l.logisticsLocationId || l.locationCode), lat: l.latitude, lng: l.longitude, color: COL.ref, size: 6, elev: 1.006 }); });
      var sel = state.selectedShipmentId ? state.vms[state.selectedShipmentId] : null;
      if (sel) { buildSelectedShipment(sel, markers, arcs, focusPts); }
      else {
        filteredVms().forEach(function (v) {
          var pl = resolveShipmentPlacement(v); if (pl.kind === 'pending') return;
          var isCur = pl.kind === 'current';
          var color = v.flags.exception || v.flags.delayed ? COL.exc : (isCur ? COL.pos : COL.endpoint);
          markers.push({ id: v.shipmentId, lat: pl.lat, lng: pl.lng, color: color, size: isCur ? 16 : 13, elev: 1.024, ring: false });   // runtime priority: larger + higher elev than reference
          focusPts.push([pl.lat, pl.lng]);
        });
      }
    }
    state.globe.setMarkers(markers);
    state.globe.setArcs(state.showPlannedRoute || state.mode !== 'runtime' ? arcs : []);
    // one-time initial framing per data load: focus the primary distribution, else global overview
    if (!state.didFocus) {
      state.didFocus = true;
      if (focusPts.length) { var c = centroid(focusPts); state.globe.focus(c.lat, c.lng, { dist: focusPts.length > 1 ? 2.9 : 2.4 }); }
      else state.globe.overview();
    }
  }
  function buildSelectedShipment(vm, markers, arcs, focusPts) {
    var seq = [];
    vm.nodes.forEach(function (n) {
      var c = resolveNodeCoord(n); if (!c.drawable) return;
      var sc = nodeStatusClass(n.status), t = low(n.nodeType);
      var color = sc === 'exception' ? COL.exc : (/customs|clearance/.test(t) ? COL.customs : (sc === 'completed' || sc === 'current' ? COL.done : COL.upcoming));
      markers.push({ id: 'node:' + n.shipmentRouteId, lat: c.lat, lng: c.lng, color: color, size: 11, elev: 1.02 });
      seq.push([c.lat, c.lng]); focusPts.push([c.lat, c.lng]);
    });
    if (state.showPlannedRoute && seq.length > 1) arcs.push({ points: seq, color: vm.flags.exception ? COL.exc : COL.pos });
    var pos = resolveCurrentPosition(vm);
    if (pos.drawable) { markers.push({ id: 'pos:' + vm.shipmentId, lat: pos.lat, lng: pos.lng, color: vm.flags.exception || vm.flags.delayed ? COL.exc : COL.pos, size: 18, elev: 1.03, ring: true }); focusPts.push([pos.lat, pos.lng]); }
  }
  function centroid(pts) {
    var x = 0, y = 0, z = 0;
    pts.forEach(function (p) { var la = p[0] * Math.PI / 180, lo = p[1] * Math.PI / 180, cl = Math.cos(la); x += cl * Math.cos(lo); y += cl * Math.sin(lo); z += Math.sin(la); });
    var n = pts.length || 1; x /= n; y /= n; z /= n;
    var lng = Math.atan2(y, x) * 180 / Math.PI, hyp = Math.hypot(x, y), lat = Math.atan2(z, hyp) * 180 / Math.PI;
    return { lat: lat, lng: lng };
  }

  // ---------- tooltip ----------
  function bindGlobeTooltip(host) {
    host.addEventListener('pointermove', function (e) {
      var tip = tipEl(); if (!tip || tip.getAttribute('aria-hidden') === 'true') return;
      var wrap = host.parentNode ? host.parentNode.getBoundingClientRect() : host.getBoundingClientRect();
      tip.style.left = (e.clientX - wrap.left + 14) + 'px'; tip.style.top = (e.clientY - wrap.top + 14) + 'px';
    });
    host.addEventListener('pointerleave', function () { showTip(null); });
  }
  function tipEl() { var r = root(); return r ? r.querySelector('[data-glm="tip"]') : null; }
  function showTip(id) {
    var tip = tipEl(); if (!tip) return;
    if (!id) { tip.setAttribute('aria-hidden', 'true'); tip.innerHTML = ''; return; }
    var html = '';
    if (id.indexOf('loc:') === 0) { var l = lookupLoc(id.slice(4)); if (l) html = '<strong>' + esc(l.locationName || l.locationCode) + '</strong><br>' + esc([l.country, l.locationType].filter(Boolean).join(' · ')); }
    else if (id.indexOf('tnode:') === 0) { html = '<strong>Route template node</strong>'; }
    else { var sid = id.replace(/^(node:|pos:)/, ''); var vm = state.vms[sid] || (state.selectedShipmentId ? state.vms[state.selectedShipmentId] : null); if (vm) html = '<strong>' + esc(vm.shipmentNo) + '</strong><br>' + esc(vm.company || '') + '<br>' + esc((vm.originCountry || vm.shipFrom || '?') + ' → ' + (vm.destCountry || vm.destWarehouse || '?')) + '<br>' + esc(vm.status || '') + ' · ' + esc(shipMode(vm)) + '<br>ETA ' + esc(vm.eta || '—'); }
    if (!html) { tip.setAttribute('aria-hidden', 'true'); return; }
    tip.innerHTML = html; tip.setAttribute('aria-hidden', 'false');
  }
  function lookupLoc(idOrCode) { return state.idx.locById[idOrCode] || state.rm.locations.filter(function (x) { return x.locationCode === idOrCode; })[0]; }

  // ---------- marker click routing ----------
  function onPinClick(pin) {
    if (pin.indexOf('loc:') === 0) { openLocationDrawer(pin.slice(4)); return; }
    if (pin.indexOf('tnode:') === 0) { return; }
    if (pin.indexOf('node:') === 0 || pin.indexOf('pos:') === 0) { if (state.selectedShipmentId) openShipmentDrawer(state.selectedShipmentId); return; }
    if (state.vms[pin]) selectShipment(pin);
  }

  // ---------- selection + drawer ----------
  function selectShipment(id) {
    state.selectedShipmentId = id;
    render();
    var vm = state.vms[id];
    if (vm && state.globe) { var pos = resolveCurrentPosition(vm); if (pos.drawable) state.globe.focus(pos.lat, pos.lng, { dist: 2.2 }); else { var pl = resolveShipmentPlacement(vm); if (pl.kind !== 'pending') state.globe.focus(pl.lat, pl.lng, { dist: 2.4 }); } }
    openShipmentDrawer(id);
  }
  function renderDrawerShell() {
    return '<div class="glm-drawer" data-glm="drawer" role="dialog" aria-modal="false" aria-hidden="true" aria-labelledby="glmDrawerTitle">' +
      '<div class="glm-drawer__head"><h3 class="glm-drawer__title" id="glmDrawerTitle" data-glm="drawer-title">Shipment Detail</h3>' +
      '<button type="button" class="glm-drawer__close" data-act="drawer-close" aria-label="Close shipment details" title="Close (Esc)">&times;</button></div>' +
      '<div class="glm-drawer__body" data-glm="drawer-body"></div></div>';
  }
  function kv(k, v) { if (v === '' || v == null) return ''; return '<div class="glm-kv"><span class="glm-kv__k">' + esc(k) + '</span><span class="glm-kv__v">' + esc(v) + '</span></div>'; }
  function drawerEls() { var r = root(); if (!r) return null; return { dr: r.querySelector('[data-glm="drawer"]'), title: r.querySelector('[data-glm="drawer-title"]'), body: r.querySelector('[data-glm="drawer-body"]') }; }
  function openDrawerCommon() {
    // remember what to return focus to (E→F.8): the shipment list/tray item if present, else the globe canvas
    var r = root();
    state.lastFocusEl = (state.selectedShipmentId && r && r.querySelector('[data-ship="' + cssEsc(state.selectedShipmentId) + '"]')) || (state.globeHost && state.globeHost.querySelector('canvas')) || null;
    installEsc();
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function openLocationDrawer(locId) {
    var l = lookupLoc(locId); var els = drawerEls(); if (!l || !els) return;
    openDrawerCommon();
    var drawable = validCoord(l.latitude, l.longitude);
    els.title.textContent = l.locationName || l.locationCode || l.logisticsLocationId;
    els.body.innerHTML = '<section class="glm-dsec"><h4>Logistics Location</h4>' +
      kv('ID', l.logisticsLocationId) + kv('Code', l.locationCode) + kv('Type', l.locationType) +
      kv('Country / Region / City', [l.country, l.region, l.city].filter(Boolean).join(' · ')) +
      '<div class="glm-kv"><span class="glm-kv__k">Coordinates</span><span class="glm-kv__v">' + (drawable ? (l.latitude + ', ' + l.longitude + (l.coordinateAccuracy ? ' · ' + esc(l.coordinateAccuracy) : '')) : '<span class="glm-badge glm-badge--pending">Coordinate Pending</span>') + '</span></div>' +
      kv('Verification', l.verificationStatus) + kv('Warehouse', l.warehouseId) + kv('Factory', l.factoryId) + '</section>';
    openDrawer();
  }
  function openShipmentDrawer(id) {
    var vm = state.vms[id]; var els = drawerEls(); if (!vm || !els) return;
    openDrawerCommon();
    var pos = resolveCurrentPosition(vm), pl = resolveShipmentPlacement(vm);
    var posLine = pos.drawable ? (pos.lat.toFixed(3) + ', ' + pos.lng.toFixed(3) + ' · ' + esc(pos.source))
      : '<span class="glm-badge glm-badge--pending">Coordinate Pending</span>' + (pl.kind !== 'pending' ? ' <span class="glm-muted">(shown at ' + esc(pl.kind) + ' endpoint)</span>' : '');
    var routeSteps = vm.nodes.map(function (n) {
      var sc = nodeStatusClass(n.status), c = resolveNodeCoord(n);
      return '<div class="glm-step glm-step--' + sc + '"><div class="glm-step__seq">#' + n.sequenceNo + ' <span class="glm-tag glm-tag--' + sc + '">' + esc(sc) + '</span></div>' +
        '<div class="glm-step__name">' + esc(n.nodeName || n.locationName || n.nodeCode || ('Node ' + n.sequenceNo)) + '</div>' +
        '<div class="glm-step__meta">' + esc(n.nodeType || '') + (n.country ? ' · ' + esc(n.country) : '') + (n.transportMode ? ' · ' + esc(n.transportMode) : '') +
        (n.plannedArrivalDate ? ' · plan arr ' + esc(n.plannedArrivalDate) : '') + (n.actualArrivalDate ? ' · act arr ' + esc(n.actualArrivalDate) : '') +
        (c.drawable ? '' : ' · <span class="glm-badge glm-badge--pending">coord pending</span>') + '</div></div>';
    }).join('') || '<p class="glm-muted">No route nodes for this shipment (shipment_routes empty).</p>';
    var timeline = vm.events.length ? vm.events.map(function (e) {
      return '<div class="glm-step"><div class="glm-step__seq">#' + (e.eventSequence || '') + '</div>' +
        '<div class="glm-step__name">' + esc(e.eventType || e.eventStatus || 'event') + '</div>' +
        '<div class="glm-step__meta">' + esc(e.eventTime || '') + (e.locationName ? ' · ' + esc(e.locationName) : '') + (e.rawStatus ? ' · raw: ' + esc(e.rawStatus) : '') + (e.source ? ' · ' + esc(e.source) : '') + '</div></div>';
    }).join('') : '<p class="glm-muted">No actual events yet. Upcoming nodes are shown in the Route above (never as planned events).</p>';

    els.title.textContent = vm.shipmentNo;
    els.body.innerHTML =
      '<section class="glm-dsec"><h4 class="glm-dsec__h--close">Identity<button type="button" class="glm-dsec__close" data-act="drawer-close" aria-label="Close shipment details" title="Close (Esc)">&times;</button></h4>' +
        kv('Shipment No.', vm.shipmentNo) + kv('Company', vm.company) + kv('Carrier', vm.carrier) + kv('Shipping Method', vm.method) +
        kv('Origin → Destination', (vm.originCountry || vm.shipFrom || '?') + ' → ' + (vm.destCountry || vm.destWarehouse || '?')) +
        kv('Destination Warehouse', vm.destWarehouse) + kv('Tracking / Container', [vm.tracking, vm.container].filter(Boolean).join(' / ')) +
        kv('Status', vm.status) + kv('Route Template', vm.routeTemplateId) + '</section>' +
      '<section class="glm-dsec"><h4>Current State</h4>' +
        kv('Current Stage', vm.stage) +
        '<div class="glm-kv"><span class="glm-kv__k">Current Position</span><span class="glm-kv__v">' + posLine + '</span></div>' +
        kv('ETA', vm.eta) + kv('Latest Event', vm.latestEvent ? (vm.latestEvent.eventType || vm.latestEvent.eventStatus) : '') + kv('Latest Updated', vm.latestUpdated) +
        (vm.flags.exception ? '<div class="glm-warn">Exception / delayed — needs attention.</div>' : (vm.flags.delayed ? '<div class="glm-warn">Past ETA and not yet delivered.</div>' : '')) + '</section>' +
      '<section class="glm-dsec"><h4>Route (shipment_routes)</h4><div class="glm-steps">' + routeSteps + '</div></section>' +
      '<section class="glm-dsec"><h4>Event Timeline (actual only)</h4><div class="glm-steps">' + timeline + '</div></section>';
    openDrawer();
  }
  function openDrawer() {
    var els = drawerEls(); if (!els || !els.dr) return;
    els.dr.classList.add('is-open'); els.dr.setAttribute('aria-hidden', 'false');
    // Wire ALL close buttons in the drawer (header X + the in-body Identity-row X) — the body is populated
    // after render(), so bindRuntime hasn't seen the body one.
    els.dr.querySelectorAll('[data-act="drawer-close"]').forEach(function (b) { b.onclick = closeDrawer; });
    var x = els.dr.querySelector('.glm-drawer__close') || els.dr.querySelector('[data-act="drawer-close"]'); if (x) try { x.focus(); } catch (e) {} }
  function closeDrawer() {
    var els = drawerEls(); if (!els || !els.dr) return;
    els.dr.classList.remove('is-open'); els.dr.setAttribute('aria-hidden', 'true');
    if (state.lastFocusEl && document.contains(state.lastFocusEl)) { try { state.lastFocusEl.focus(); } catch (e) {} }
    state.lastFocusEl = null;
  }
  function drawerOpen() { var els = drawerEls(); return !!(els && els.dr && els.dr.classList.contains('is-open')); }
  function installEsc() {
    if (state.escInstalled) return; state.escInstalled = true;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawerOpen()) { e.preventDefault(); closeDrawer(); } });
  }

  // ---------- Global Reference layer ----------
  function refFilteredLocations() {
    var f = state.ref, q = (f.search || '').trim().toLowerCase();
    return state.rm.locations.filter(function (l) {
      if (f.country && l.country !== f.country) return false;
      if (f.type && l.locationType !== f.type) return false;
      if (q) { var hay = ((l.locationName || '') + ' ' + (l.locationCode || '') + ' ' + (l.logisticsLocationId || '') + ' ' + (l.city || '')).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      return l.isActive !== false;
    });
  }
  function renderGlobalRefSide() {
    var locs = state.rm.locations, f = state.ref;
    if (!locs.length) return '<div class="glm-panel"><h3 class="glm-panel__title">Global Reference</h3><p class="glm-muted">No logistics_locations rows loaded' + (state.sourceMode === 'mock' ? ' (API in FALLBACK mode — Refresh to retry).' : '. If the table has data, open ?glmdebug=1 to see raw vs kept counts + column keys.') + '</p></div>';
    var filt = refFilteredLocations();
    var mapped = filt.filter(function (l) { return validCoord(l.latitude, l.longitude); });
    var pending = filt.length - mapped.length;
    var list = filt.slice(0, 500).map(function (l) {
      var drawable = validCoord(l.latitude, l.longitude);
      return '<div class="glm-locrow" data-loc="' + esc(l.logisticsLocationId || l.locationCode) + '" tabindex="0" role="button">' +
        '<span class="glm-locrow__name">' + esc(l.locationName || l.locationCode || l.logisticsLocationId) + '</span>' +
        '<span class="glm-locrow__meta">' + esc(l.country || '') + ' · ' + (drawable ? esc(l.locationType || 'loc') : '<span class="glm-badge glm-badge--pending">coord pending</span>') + '</span></div>';
    }).join('');
    function sel(label, key, opts) { return '<label class="glm-field"><span>' + label + '</span><select data-ref="' + key + '"><option value="">All</option>' + opts.map(function (o) { return '<option value="' + esc(o) + '"' + (f[key] === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>'; }
    return '<div class="glm-panel"><h3 class="glm-panel__title">Global Reference Filters</h3>' +
      '<label class="glm-field"><span>Search name / code / ID</span><input type="text" data-ref="search" value="' + esc(f.search) + '" placeholder="Search locations…"></label>' +
      sel('Country', 'country', optSet(locs, function (l) { return l.country; })) +
      sel('Location Type', 'type', optSet(locs, function (l) { return l.locationType; })) +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn" data-act="ref-clear">Clear</button><button type="button" class="glm-btn" data-act="ref-fit">Focus pins</button></div></div>' +
      '<div class="glm-panel"><h3 class="glm-panel__title">Locations (' + filt.length + ')' + (pending ? ' · <span class="glm-muted">' + pending + ' coord pending</span>' : '') + '</h3><div class="glm-shiplist">' + (list || '<p class="glm-muted">No locations match.</p>') + '</div></div>';
  }
  function templateNodes(templateId) { return state.rm.routeTemplateNodes.filter(function (n) { return n.routeTemplateId === templateId; }).sort(function (a, b) { return a.nodeSequence - b.nodeSequence; }); }
  function renderTemplateSide() {
    var tpls = state.rm.routeTemplates;
    if (!tpls.length) return '<div class="glm-panel"><h3 class="glm-panel__title">Route Template</h3><p class="glm-muted">No shipment_route_templates rows loaded' + (state.sourceMode === 'mock' ? ' (API fallback — Refresh).' : '. Open ?glmdebug=1 for raw vs kept counts.') + '</p></div>';
    var opts = tpls.map(function (t) { return '<option value="' + esc(t.routeTemplateId) + '"' + (state.selectedTemplateId === t.routeTemplateId ? ' selected' : '') + '>' + esc(t.routeTemplateName || t.routeTemplateId) + '</option>'; }).join('');
    var head = '<div class="glm-panel"><h3 class="glm-panel__title">Route Template (' + tpls.length + ')</h3>' +
      '<label class="glm-field"><span>Select template</span><select data-tpl="select"><option value="">— Select —</option>' + opts + '</select></label>' +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn" data-act="ref-fit">Focus route</button></div></div>';
    if (!state.selectedTemplateId) return head + '<p class="glm-muted">Select a template to preview its reference nodes.</p>';
    var nodes = templateNodes(state.selectedTemplateId);
    var steps = nodes.map(function (n) {
      var drawable = validCoord(n.latitude, n.longitude) || (n.logisticsLocationId && state.idx.locById[n.logisticsLocationId] && validCoord(state.idx.locById[n.logisticsLocationId].latitude, state.idx.locById[n.logisticsLocationId].longitude));
      return '<div class="glm-step"><div class="glm-step__seq">#' + n.nodeSequence + (drawable ? '' : ' <span class="glm-badge glm-badge--pending">coord pending</span>') + '</div>' +
        '<div class="glm-step__name">' + esc(n.nodeName || n.nodeCode || ('Node ' + n.nodeSequence)) + '</div>' +
        '<div class="glm-step__meta">' + esc(n.nodeType || '') + (n.country ? ' · ' + esc(n.country) : '') + (n.transportModeToNext ? ' · → ' + esc(n.transportModeToNext) : '') + '</div></div>';
    }).join('');
    return head + '<div class="glm-panel"><h3 class="glm-panel__title">Template Nodes (' + nodes.length + ')</h3><div class="glm-shiplist">' + (steps || '<p class="glm-muted">This template has no nodes.</p>') + '</div></div>';
  }
  function refNodeCoord(n) {
    if (validCoord(n.latitude, n.longitude)) return { lat: n.latitude, lng: n.longitude };
    if (n.logisticsLocationId && state.idx.locById[n.logisticsLocationId]) { var l = state.idx.locById[n.logisticsLocationId]; if (validCoord(l.latitude, l.longitude)) return { lat: l.latitude, lng: l.longitude }; }
    return null;
  }

  // ---------- bind ----------
  function bindRuntime() {
    var r = root(); if (!r) return;
    r.querySelectorAll('[data-mode]').forEach(function (b) { b.onclick = function () { var m = b.getAttribute('data-mode'); if (m === state.mode) return; state.mode = m; state.selectedShipmentId = ''; state.didFocus = false; render(); }; });
    r.querySelectorAll('[data-kpi]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-kpi'); state.filters.kpi = (state.filters.kpi === k) ? '' : k; state.selectedShipmentId = ''; render(); }; });
    r.querySelectorAll('[data-filter]').forEach(function (el) {
      var key = el.getAttribute('data-filter');
      if (el.tagName === 'INPUT' && el.type === 'text') { el.oninput = function () { state.filters[key] = el.value; renderKeepFocus('[data-filter="' + key + '"]'); }; }
      else { el.onchange = function () { state.filters[key] = (el.type === 'checkbox') ? el.checked : el.value; render(); }; }
    });
    r.querySelectorAll('[data-ref]').forEach(function (el) {
      var key = el.getAttribute('data-ref');
      if (el.tagName === 'INPUT' && el.type === 'text') { el.oninput = function () { state.ref[key] = el.value; renderKeepFocus('[data-ref="' + key + '"]'); }; }
      else { el.onchange = function () { state.ref[key] = el.value; render(); }; }
    });
    r.querySelectorAll('[data-tpl]').forEach(function (el) { el.onchange = function () { state.selectedTemplateId = el.value; state.didFocus = false; render(); }; });
    r.querySelectorAll('[data-toggle]').forEach(function (el) { el.onchange = function () { state[el.getAttribute('data-toggle')] = el.checked; updateGlobeLayers(); }; });
    r.querySelectorAll('[data-ship]').forEach(function (el) {
      el.onclick = function () { selectShipment(el.getAttribute('data-ship')); };
      el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectShipment(el.getAttribute('data-ship')); } };
    });
    r.querySelectorAll('[data-loc]').forEach(function (el) {
      function go() { var id = el.getAttribute('data-loc'); var l = lookupLoc(id); if (l && validCoord(l.latitude, l.longitude) && state.globe) state.globe.focus(l.latitude, l.longitude, { dist: 2.0 }); openLocationDrawer(id); }
      el.onclick = go; el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    var acts = {
      'zoom-in': function () { if (state.globe) state.globe.zoomIn(); }, 'zoom-out': function () { if (state.globe) state.globe.zoomOut(); }, 'reset': function () { if (state.globe) state.globe.reset(); },
      'drawer-close': closeDrawer, 'clear-filters': clearFilters, 'clear-kpi': function () { state.filters.kpi = ''; render(); },
      'refresh': function () { boot(true); },
      'ref-clear': function () { state.ref = { search: '', country: '', type: '' }; render(); },
      'ref-fit': function () {
        if (!state.globe) return;
        var pts = state.mode === 'global' ? refFilteredLocations().filter(function (l) { return validCoord(l.latitude, l.longitude); }).map(function (l) { return [l.latitude, l.longitude]; })
          : (state.mode === 'template' && state.selectedTemplateId ? templateNodes(state.selectedTemplateId).map(refNodeCoord).filter(Boolean).map(function (c) { return [c.lat, c.lng]; }) : []);
        if (pts.length) { var c = centroid(pts); state.globe.focus(c.lat, c.lng, { dist: pts.length > 1 ? 2.9 : 2.2 }); } else state.globe.overview();
      }
    };
    Object.keys(acts).forEach(function (a) { r.querySelectorAll('[data-act="' + a + '"]').forEach(function (b) { b.onclick = acts[a]; }); });
  }
  function renderKeepFocus(selector) { render(); var r = root(); var el = r && r.querySelector(selector); if (el) { el.focus(); try { var v = el.value; el.setSelectionRange(v.length, v.length); } catch (e) {} } }
  function clearFilters() { state.filters = { search: '', company: '', originCountry: '', destCountry: '', destWarehouse: '', carrier: '', method: '', status: '', stage: '', routeTemplateId: '', etaFrom: '', etaTo: '', exceptionOnly: false, delayedOnly: false, arrivingSoon: false, kpi: '' }; state.selectedShipmentId = ''; render(); }

  // ---------- boot / lifecycle ----------
  function boot(force) {
    state.loading = true; state.error = ''; render();
    ensureDb(!!force, function (ok) {
      state.loading = false;
      if (!ok && !window._opDbCache) { state.error = 'Operation database is not loaded.'; render(); return; }
      state.sourceMode = (window.KM.DB && window.KM.DB.getDataSourceMode) ? window.KM.DB.getDataSourceMode() : 'unknown';
      state.diag = (window.KM.DB && window.KM.DB.getDataDiagnostics) ? window.KM.DB.getDataDiagnostics() : null;
      try { buildReadModel(); } catch (e) { state.error = String(e && e.message || e); render(); return; }
      state.didFocus = false;
      render();
      if (window._glmPendingSelect && state.vms && state.vms[window._glmPendingSelect]) { var sid = window._glmPendingSelect; window._glmPendingSelect = ''; selectShipment(sid); }
    });
  }
  function ensureMarkup() {
    if (document.getElementById('global-logistics-map-section')) return Promise.resolve(true);
    if (window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
      return window.KM.partialLoader.loadPartial('global-logistics-map', 'assets/html/pages/global-logistics-map.html', '#global-logistics-map-mount')
        .then(function () { return true; }).catch(function (e) { console.warn('[ShipmentRuntime] partial load failed:', e); return false; });
    }
    return Promise.resolve(false);
  }
  KM.lifecycle.register('global-logistics-map-section', {
    mount: function () { ensureMarkup().then(function (loaded) { var sec = root(); if (sec) sec.classList.add('active'); if (!loaded || !sec) return; boot(); if (state.globe) state.globe.resize(); }); },
    unmount: function () { closeDrawer(); }
  });
})();
