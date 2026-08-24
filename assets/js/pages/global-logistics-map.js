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
  var RUNTIME_SET = { shipped: 1, in_transit: 1, arrived: 1, partial_received: 1, partially_received: 1, received: 1, completed: 1, delivered: 1 };

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

  // ---------- pure helpers (F1-SHIPMENT-MAP-R8; dependency-free — mirrored/extracted by the test) ----------
  // §13 status summary: bucket shipments by their BACKEND status (never an invented lifecycle). Conservative
  // grouping — In Transit (shipped/in_transit/arrived/ready_to_ship), Partially Received (partially_received +
  // legacy partial_received), Received (received/completed/delivered). Any status outside the known vocabulary
  // falls into Other (surfaced with its raw status list, never silently reclassified). Pure; input never mutated.
  var GLM_STATUS_BUCKETS_ = [
    { key: 'inTransit', label: 'In Transit', match: { shipped: 1, in_transit: 1, arrived: 1, ready_to_ship: 1 } },
    { key: 'partiallyReceived', label: 'Partially Received', match: { partially_received: 1, partial_received: 1 } },
    { key: 'received', label: 'Received', match: { received: 1, completed: 1, delivered: 1 } }
  ];
  function glmStatusSummary(vms) {
    var counts = { inTransit: 0, partiallyReceived: 0, received: 0, other: 0 }, otherStatuses = {};
    (vms || []).forEach(function (v) {
      var st = String(v && v.status != null ? v.status : '').trim().toLowerCase(), placed = false;
      for (var i = 0; i < GLM_STATUS_BUCKETS_.length; i++) { if (GLM_STATUS_BUCKETS_[i].match[st]) { counts[GLM_STATUS_BUCKETS_[i].key]++; placed = true; break; } }
      if (!placed) { counts.other++; if (st) otherStatuses[st] = (otherStatuses[st] || 0) + 1; }
    });
    var out = GLM_STATUS_BUCKETS_.map(function (b) { return { key: b.key, label: b.label, count: counts[b.key] }; });
    out.push({ key: 'other', label: 'Other', count: counts.other, statuses: Object.keys(otherStatuses).sort() });
    return out;
  }
  // §9.1 receipt Save collects ONLY the lines whose cumulative received value actually changed (a resend of the
  // same cumulative is a backend idempotent no-op — never queued). pairs = [{ shipment_line_id, value, prev }].
  // Non-finite value → skipped (nothing to write). Returns the backend line payload for changed lines only.
  function glmReceiptChangedLines(pairs) {
    var out = [];
    (pairs || []).forEach(function (p) {
      if (!p || !p.shipment_line_id) return;
      var v = parseFloat(p.value); if (!isFinite(v)) return;
      var prev = parseFloat(p.prev); if (!isFinite(prev)) prev = 0;
      if (v === prev) return;   // unchanged cumulative → not submitted
      out.push({ shipment_line_id: p.shipment_line_id, shipment_received_qty: v });
    });
    return out;
  }
  // §12 PER-SHIPMENT ISSUE AUTHORITY (R8C) — derive a shipment's data/route-completeness issues from the SAME facts
  // already computed elsewhere (route-node count + resolved placement kind). This is NOT a new validation engine:
  // it only re-expresses existing detected gaps (no shipment_routes rows; no drawable coordinate). Pure + testable.
  // facts = { nodeCount:Number, placementKind:'current'|'destination'|'origin'|'pending' }.
  function glmShipmentIssues(facts) {
    facts = facts || {};
    var types = [];
    if (!facts.nodeCount) types.push({ code: 'NO_ROUTE_NODES', label: 'Route Issue', detail: 'Route history incomplete — no route nodes are currently available for this shipment.' });
    if (facts.placementKind === 'pending') types.push({ code: 'COORDINATE_PENDING', label: 'Coordinate Pending', detail: 'No map coordinates are available yet, so this shipment cannot be plotted. It stays listed and selectable.' });
    return { hasIssue: types.length > 0, types: types };
  }

  // ---------- data ----------
  // F1-7F · scoped Shipment workspace read cutover. The On-the-Way map primary read sources shipments/lines + route/
  // event/location/template tables from ONE scoped `shipment` workspace (map includes) — no broad Operation DB. Kill
  // switch: setWorkspaceEnabled('shipment', false). Canonical default ON.
  function _glmEffectiveWorkspace() {
    return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
      window.KM.api.workspaceApiActive('shipment'));
  }
  var _glmReadModel = null;   // adapted shipment workspace arrays, or null = Legacy (broad cache)
  var _glmReadSeq = 0;
  function ensureDb(force, cb) {
    if (_glmEffectiveWorkspace()) {
      if (!force && _glmReadModel) { cb(true); return; }
      if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { state.error = 'Shipment Workspace API unavailable [WORKSPACE_UNAVAILABLE].'; cb(false); return; }
      var mySeq = ++_glmReadSeq;
      Promise.resolve(window.KM.api.getWorkspace('shipment', { include: { routes: true, events: true, locations: true, templates: true }, page: { number: 1, size: 3000 } })).then(function (env) {
        if (mySeq !== _glmReadSeq) return;
        if (env && env.success) { _glmReadModel = window.KM.DB.adaptShipmentWorkspace(env.data); cb(true); }
        else { var e0 = (env && env.errors && env.errors[0]) || {}; state.error = 'Shipment workspace request failed [' + (e0.code || 'WORKSPACE_ERROR') + '].'; cb(false); }   // fail-closed: NO silent legacy broad fallback
      }).catch(function (e) { if (mySeq !== _glmReadSeq) return; state.error = 'Shipment map read failed: ' + String(e && e.message || e) + ' [MAP_READ_FAILED].'; cb(false); });
      return;
    }
    // Legacy broad-DB path (kill-switch only) — the ONLY place a broad Operation DB load happens.
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
    // F1-7F: source from the scoped shipment workspace read-model when canonical; else the Legacy broad-cache getters.
    var m = _glmReadModel;
    var rm = m ? {
      shipments: m.shipments, shipmentLines: m.shipmentLines, shipmentRoutes: m.shipmentRoutes,
      shipmentEvents: m.shipmentEvents, warehouses: m.warehouses, locations: m.logisticsLocations,
      routeTemplates: m.shipmentRouteTemplates, routeTemplateNodes: m.shipmentRouteTemplateNodes
    } : {
      shipments: (db.getShipments && db.getShipments()) || [],
      shipmentLines: (db.getShipmentLines && db.getShipmentLines()) || [],
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
    var linesByShip = {}; rm.shipmentLines.forEach(function (l) { (linesByShip[l.shipmentId] = linesByShip[l.shipmentId] || []).push(l); });
    state.rm = rm;
    state.idx = { locById: locById, locByWh: locByWh, locByFactory: locByFactory, whById: whById, eventsByShip: eventsByShip, nodesByShip: nodesByShip, linesByShip: linesByShip };
    state.vms = buildShipmentViewModels();
    var missing = [];
    if (!rm.shipmentRoutes.length) missing.push('shipment_routes');
    if (!rm.shipmentEvents.length) missing.push('shipment_events');
    // F1-SMALL-NAV-IA-R1: describe DATA COMPLETENESS (not system wiring — route/event owners are wired since
    // R8/R9). Condition unchanged: no shipment_routes and/or no shipment_events rows in the current dataset.
    state.partial = missing.length ? ('Historical or partially configured shipments may not yet have route nodes, events, or coordinates (' + missing.join(', ') + '). Shipment records remain available — shown with a drawable position when coordinates resolve, otherwise in the Coordinate Pending tray. No demo data is substituted.') : '';
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
  // Route nodes that are recognized TRANSIT GATEWAYS are never a destination facility. This is a recognized-INCOMPATIBLE
  // guard (not a destination whitelist): node_type is an unfrozen user-maintained vocabulary, so a terminal node is
  // rejected only when it positively looks like a gateway/transit leg. Structural position + lineage prove the destination.
  var GATEWAY_NODE_RE = /port|airport|air_?cargo|seaport|harbou?r|vessel|customs|clearance|bonded|border|frontier|rail|railway|truck_?terminal|motor_?carrier|cross_?dock|terminal|hub|transship|tranship|sort_?center|sortation|consolidation|parcel|courier|carrier_?facility|centroid|waypoint|midpoint|transit_?point|gateway/i;
  function isGatewayNode(n) { if (!n) return false; return GATEWAY_NODE_RE.test(String(n.nodeType || '') + ' ' + String(n.nodeCode || '') + ' ' + String(n.plannedEventType || '')); }
  // The shipment's FINAL destination route row, accepted ONLY when every lineage gate proves it is the destination of THIS
  // shipment for THIS destination warehouse. No arbitrary last-element pick: sequence_no ordering must be verifiable and the
  // terminal node unambiguous. Fails closed (null) on any doubt. Reads only rows already loaded — no geocoding, no network.
  function resolveDestinationRouteNode(vm) {
    if (!vm || !vm.destWarehouseId) return null;                                   // no destination authority to bind to
    var nodes = vm.nodes || []; if (!nodes.length) return null;
    // (a) verified ordering: every node needs a real positive sequence_no and the maximum must be UNIQUE.
    var maxSeq = -Infinity, maxCount = 0;
    for (var i = 0; i < nodes.length; i++) {
      var sq = nodes[i].sequenceNo;
      if (typeof sq !== 'number' || !isFinite(sq) || sq <= 0) return null;          // ambiguous/unordered route → fail closed
      if (sq > maxSeq) { maxSeq = sq; maxCount = 1; } else if (sq === maxSeq) maxCount++;
    }
    if (maxCount !== 1) return null;                                               // duplicate terminal sequence → fail closed
    var terminal = nodes[nodes.length - 1];                                        // nodesByShip is sorted by sequenceNo asc
    if (terminal.sequenceNo !== maxSeq) return null;                               // ordering assumption not proven
    // (b) it must belong to THIS shipment (defensive: the index groups by shipmentId).
    if (String(terminal.shipmentId) !== String(vm.shipmentId)) return null;
    // (c) it must not be a recognized transit gateway, and must not be the CURRENT marker.
    if (isGatewayNode(terminal)) return null;
    if (nodeStatusClass(terminal.status) === 'current') return null;
    // (d) exact logistics lineage: location_ref_type = logistics_location + a location_ref_id that resolves to a
    //     logistics_locations row whose warehouse_id IS this shipment's destination warehouse.
    if (low(terminal.locationRefType) !== 'logistics_location' || !terminal.locationRefId) return null;
    var loc = state.idx.locById[terminal.locationRefId];
    if (!loc || !loc.warehouseId || String(loc.warehouseId) !== String(vm.destWarehouseId)) return null;
    // (e) the coordinate itself must be real (blank/(0,0)/out-of-range rejected by validCoord).
    if (!validCoord(terminal.latitude, terminal.longitude)) return null;
    return { node: terminal, loc: loc };
  }
  // Destination endpoint (real coord only). Precedence: (1) the logistics_location bound to the destination warehouse by
  // exact warehouse_id, when it carries a valid coordinate — UNCHANGED, still highest priority; (2) otherwise this
  // shipment's proven final destination route row coordinate (full lineage gates above). Never fabricated, never geocoded,
  // never a gateway/current/origin coordinate, never a centroid.
  function resolveDestinationCoord(vm) {
    var l = state.idx.locByWh[vm.destWarehouseId];
    if (l && validCoord(l.latitude, l.longitude)) return { lat: l.latitude, lng: l.longitude, src: 'DEST_WAREHOUSE_LOCATION', name: l.locationName || vm.destWarehouse };
    var t = resolveDestinationRouteNode(vm);
    if (t) return { lat: t.node.latitude, lng: t.node.longitude, src: 'DEST_ROUTE_TERMINAL_NODE', name: t.loc.locationName || t.node.locationName || vm.destWarehouse };
    return null;
  }
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

  // ---------- render shell ----------
  function render() {
    var b = body(); if (!b) return;
    detachGlobe();                              // preserve the persistent WebGL host across the innerHTML rewrite
    var r = root(); var meta = r.querySelector('[data-glm="meta"]');
    if (state.loading) { b.innerHTML = '<div class="glm-state"><div class="glm-spinner"></div><p>Loading shipment runtime…</p></div>'; return; }
    if (state.error) { b.innerHTML = '<div class="glm-state glm-state--error"><p class="glm-state__title">Could not load data</p><p class="glm-state__msg">' + esc(state.error) + '</p><button type="button" class="glm-btn" data-act="retry">Retry</button></div>'; var rb = r.querySelector('[data-act="retry"]'); if (rb) rb.onclick = function () { boot(true); }; return; }
    if (meta) { var vms = allVms(); meta.textContent = vms.length + ' shipments · ' + state.rm.shipmentRoutes.length + ' route nodes · ' + state.rm.shipmentEvents.length + ' events · ' + state.rm.locations.length + ' logistics locations.'; }

    // Phase-1 frozen IA (F1-SHIPMENT-MAP-R8B): Title → compact Filter Bar → Status Summary → Main Workspace
    // (LEFT shipment cards start at the top; RIGHT world map). Filters no longer sit in the left column above
    // the list; the On the Way / Route Template / Global Reference modes move into the map surface.
    var isRuntime = state.mode === 'runtime';
    var sideHtml = (state.mode === 'template') ? renderTemplateSide() : (state.mode === 'global') ? renderGlobalRefSide() : renderShipmentList();
    // R12 — filters relocated into the in-map Map Control Panel (renderMapControlPanel). The page body now leads
    // with the FULL-WIDTH Shipment Status + Attention rail, then the LEFT list / RIGHT map workspace. Refresh stays
    // in the page header (top-right); per-shipment issues surface on each card (no page-wide banner).
    b.innerHTML =
      renderSourceBanner() +
      (state.debug ? renderDiagPanel() : '') +
      (isRuntime ? renderSummaryRegion() : '') +
      '<div class="glm-main">' +
        '<div class="glm-side">' + sideHtml + '</div>' +
        '<div class="glm-mapwrap">' + renderMapShell() + '</div>' +
      '</div>' +
      renderDrawerShell();
    attachGlobe();
    bindRuntime();
  }

  var MODE_TABS = [{ id: 'runtime', label: 'On the Way' }, { id: 'template', label: 'Route Template' }, { id: 'global', label: 'Global Reference' }];
  // R8C — Refresh moved into the page header (glm-head__bar, top-right). The map-layer modes live inside the map
  // surface (renderMapShell → data-mode-select), so there is no longer a separate top bar in the body.
  function renderSourceBanner() {
    if (state.sourceMode === 'mock') return '<div class="glm-warn glm-warn--danger">⚠ Operation DB API failed — showing <strong>FALLBACK data (not production)</strong>' + ((window._opDbCache && window._opDbCache._apiError) ? (': ' + esc(window._opDbCache._apiError)) : '') + '. Click <strong>↻ Refresh</strong> to retry the live API.</div>';
    return '';
  }
  // R8C §11 — the former page-wide route-completeness banner is removed; per-shipment issues are surfaced on each
  // shipment card + explained in the drawer (glmShipmentIssues). state.partial is retained as an internal
  // completeness signal only (no longer rendered as a page-level warning).
  function renderDiagPanel() {
    var d = state.diag; if (!d) return '<div class="glm-warn">Diagnostics: no data-chain diagnostics captured yet.</div>';
    var rows = Object.keys(d.tables || {}).map(function (t) { var x = d.tables[t]; return '<tr><td>' + esc(t) + '</td><td class="glm-num">' + x.raw + '</td><td class="glm-num">' + x.kept + '</td><td class="glm-muted" style="font-size:10px;">' + esc((x.sampleKeys || []).join(', ') || '—') + '</td></tr>'; }).join('');
    return '<div class="glm-panel" style="margin-bottom:12px;"><h3 class="glm-panel__title">Data-chain diagnostics (source: ' + esc(d.sourceMode) + ')</h3>' +
      '<div class="glm-table-wrap"><table class="glm-table" style="width:100%;font-size:11.5px;"><thead><tr><th>table</th><th class="glm-num">raw</th><th class="glm-num">kept</th><th>raw column keys (first row)</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="glm-hint glm-muted">raw 0 → getter/sheet/router; raw N &amp; kept 0 → normalizer/column-name filter (compare the raw keys to the expected canonical columns); source mock → API failed.</p></div>';
  }
  // R8C §7/§8/§9 — Attention is a LOW-visual-weight chip row (not six equal big cards). "On the Way" is dropped
  // (see attentionIndicators — it is the baseline active population already surfaced by Shipment Status, not an
  // alert). Priority-ordered; only nonzero ALERT chips show by default; "Delivered Today" + any zero-value
  // indicators live under a restrained "More ▾" so nothing is lost. Chips reuse the EXISTING data-kpi filter (§16).
  var ATTENTION_ORDER = ['delayed', 'exception', 'arrivingSoon', 'customs', 'deliveredToday'];
  function attentionIndicators() {
    var all = computeKpis().filter(function (k) { return k.id !== 'onTheWay'; });   // §8 On the Way removed from Attention
    all.sort(function (a, b) { return ATTENTION_ORDER.indexOf(a.id) - ATTENTION_ORDER.indexOf(b.id); });
    return all;
  }
  // R11 §1 — ONE shared compact KPI tile used by BOTH Shipment Status and Attention (same height/radius/border/
  // typography/padding; only the semantic accent differs). `clickable` renders a data-kpi filter button (Attention);
  // otherwise a display-only div (Shipment Status). Data logic stays separate — only presentation is unified.
  function glmKpiTileHtml(opts) {
    var accent = ' glm-kpi-tile--' + opts.accent;
    var title = opts.title ? ' title="' + esc(opts.title) + '"' : '';
    var inner = '<span class="glm-kpi-tile__value">' + num(opts.value) + '</span><span class="glm-kpi-tile__label">' + esc(opts.label) + '</span>';
    if (opts.clickable) {
      var active = state.filters.kpi === opts.kpi;
      return '<button type="button" class="glm-kpi-tile glm-kpi-tile--clickable' + accent + (active ? ' is-active' : '') + '" data-kpi="' + opts.kpi + '" aria-pressed="' + active + '"' + title + '>' + inner + '</button>';
    }
    return '<div class="glm-kpi-tile' + accent + '"' + title + '>' + inner + '</div>';
  }
  // §2 — Attention shows ALL categories, ALWAYS (no More/collapse); each is a clickable KPI-filter tile (§16).
  function renderAttentionRow() {
    var all = attentionIndicators();
    var tiles = all.map(function (k) { return glmKpiTileHtml({ accent: k.tone, value: k.value, label: k.label, clickable: true, kpi: k.id }); }).join('');
    var clear = state.filters.kpi ? '<button type="button" class="glm-btn glm-btn--small" data-act="clear-kpi">Clear</button>' : '';
    return '<div class="glm-kpirail" role="group" aria-label="Attention indicators">' + tiles + clear + '</div>';
  }

  // §13 backend-status summary (reflects the SAME filtered collection that drives list + map). Display-only tiles
  // (no filter — R8C §16), rendered in the SAME shared KPI-tile family as Attention.
  function renderStatusSummary() {
    var sm = glmStatusSummary(filteredVms()).filter(function (b) { return b.key !== 'other' || b.count > 0; });
    return '<div class="glm-kpirail glm-kpirail--status" role="group" aria-label="Shipment lifecycle status summary">' + sm.map(function (b) {
      return glmKpiTileHtml({ accent: b.key, value: b.count, label: b.label, title: (b.key === 'other' && b.statuses && b.statuses.length) ? b.statuses.join(', ') : '' });
    }).join('') + '</div>';
  }

  // R8C §5/§6/§7/§17 — Shipment Status is the PRIMARY summary (backend shipment.status); Attention is the SECONDARY
  // alert row. They stay DIFFERENT data concepts (never merged semantically) — renamed for non-technical clarity.
  function renderSummaryRegion() {
    return '<div class="glm-summary">' +
      '<div class="glm-summary__group glm-summary__group--status"><span class="glm-summary__label">Shipment Status</span>' + renderStatusSummary() + '</div>' +
      '<div class="glm-summary__group glm-summary__group--attention"><span class="glm-summary__label">Attention</span>' + renderAttentionRow() + '</div>' +
      '</div>';
  }

  // ---------- filters (compact horizontal bar; presentation only — SAME data-filter keys + semantics) ----------
  function selHtml(label, key, opts, cur, cls) {
    return '<label class="glm-field' + (cls ? ' ' + cls : '') + '"><span>' + esc(label) + '</span><select data-filter="' + key + '"><option value="">All</option>' +
      opts.map(function (o) { return '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
  }
  // R12 — ONE consolidated in-map control panel (upper-left, collapsible): View · Filters · Layers · Legend. It
  // REPLACES the page-level filter bar + the separate in-map Map View selector, layer toggles and bottom legend.
  // Every existing data-* owner is preserved verbatim (data-mode-select, data-filter keys, data-toggle, the legend
  // renderer) so the existing handlers in bindRuntime bind unchanged. The right-side zoom controls
  // (.glm-map-controls) stay SEPARATE (§11) so the panel never covers them. Collapsed → only the ☰ header renders
  // (no hidden focusable children — §14). Default collapsed on narrow viewports.
  function renderMapControlPanel() {
    if (state.mapPanelCollapsed == null) state.mapPanelCollapsed = (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < 1024);
    var collapsed = !!state.mapPanelCollapsed;
    var isRuntime = state.mode === 'runtime';
    var head =
      '<button type="button" class="glm-mcp__toggle" data-act="toggle-map-panel" aria-expanded="' + (!collapsed) + '" aria-controls="glm-mcp-body" title="' + (collapsed ? 'Expand map controls' : 'Collapse map controls') + '">' +
        '<span class="glm-mcp__icon" aria-hidden="true">☰</span><span class="glm-mcp__title">Map Controls</span>' +
      '</button>';
    if (collapsed) return '<div class="glm-mcp is-collapsed" data-glm="map-panel">' + head + '</div>';
    var mapView =
      '<div class="glm-mcp__sec"><span class="glm-mcp__lbl">View</span>' +
        '<label class="glm-field glm-field--panel"><span>Map View</span><select data-mode-select aria-label="Map view / layer">' +
          MODE_TABS.map(function (m) { return '<option value="' + m.id + '"' + (state.mode === m.id ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('') +
        '</select></label></div>';
    var filters = isRuntime ? '<div class="glm-mcp__sec glm-mcp__sec--filters"><span class="glm-mcp__lbl">Filters</span>' + renderPanelFilters() + '</div>' : '';
    var layers = isRuntime ?
      '<div class="glm-mcp__sec"><span class="glm-mcp__lbl">Layers</span>' +
        '<label class="glm-check glm-check--map"><input type="checkbox" data-toggle="showPlannedRoute"' + (state.showPlannedRoute ? ' checked' : '') + '> Route arcs</label>' +
        '<label class="glm-check glm-check--map"><input type="checkbox" data-toggle="showReference"' + (state.showReference ? ' checked' : '') + '> Reference pins</label>' +
      '</div>' : '';
    // §12 legend RELOCATED into the panel — reuse the SAME legendHtml() renderer (no duplicate, no second legend).
    var legend = '<div class="glm-mcp__sec"><span class="glm-mcp__lbl">Legend</span><div class="glm-mcp__legend">' + legendHtml() + '</div></div>';
    return '<div class="glm-mcp" data-glm="map-panel">' + head +
      '<div class="glm-mcp__body" id="glm-mcp-body">' + mapView + filters + layers + legend + '</div></div>';
  }
  // R12 — the approved filter controls, relocated into the panel with IDENTICAL data-filter keys + semantics as the
  // retired filter bar: search · company · destWarehouse (canonical Destination) · carrier · method · etaFrom/etaTo
  // (frozen ETA range) · clear-filters. Removed controls (Origin / Status / Stage / Exception·Delayed·Arriving
  // checkboxes) are NOT reintroduced. Stacked full-width for the panel (no horizontal overflow).
  function renderPanelFilters() {
    var vms = allVms(), f = state.filters, PC = 'glm-field--panel';
    return '<div class="glm-pfilters" role="group" aria-label="Shipment filters">' +
      '<label class="glm-field glm-field--panel glm-field--search"><span>Search</span><input type="text" data-filter="search" value="' + esc(f.search) + '" placeholder="Shipment / Tracking / Container…"></label>' +
      selHtml('Company', 'company', optSet(vms, function (v) { return v.company; }), f.company, PC) +
      selHtml('Destination', 'destWarehouse', optSet(vms, function (v) { return v.destWarehouse; }), f.destWarehouse, PC) +
      selHtml('Carrier', 'carrier', optSet(vms, function (v) { return v.carrier; }), f.carrier, PC) +
      selHtml('Method', 'method', optSet(vms, function (v) { return v.method; }), f.method, PC) +
      '<label class="glm-field glm-field--panel glm-field--eta"><span>ETA Date</span><span class="glm-eta-range">' +
        '<input type="date" data-filter="etaFrom" value="' + esc(f.etaFrom) + '" aria-label="ETA from">' +
        '<span class="glm-eta-range__sep" aria-hidden="true">–</span>' +
        '<input type="date" data-filter="etaTo" value="' + esc(f.etaTo) + '" aria-label="ETA to"></span></label>' +
      '<button type="button" class="glm-btn glm-btn--small glm-pfilters__clear" data-act="clear-filters">Clear Filters</button>' +
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
      // §12/§13 — restrained per-shipment issue pill (route history incomplete). Coordinate-pending keeps its own
      // Coord Pending badge (above); this pill flags the route-data gap so the user sees WHICH shipment has it.
      var issues = glmShipmentIssues({ nodeCount: v.nodes.length, placementKind: pl.kind });
      var issueBadge = issues.types.some(function (t) { return t.code === 'NO_ROUTE_NODES'; }) ? '<span class="glm-badge glm-badge--issue" title="Route history incomplete">⚠ Route Issue</span>' : '';
      // backend-derived shipment status (never computed here) — Partially Received / Received are visibly distinct.
      var st = low(v.status), stCls = st ? st.replace(/[^a-z0-9]+/g, '-') : 'unknown';
      var statusPill = '<span class="glm-ship__status glm-ship__status--' + stCls + '">' + esc(v.status || '—') + '</span>';
      // R11 §9/§12 — ROW 1: Shipment ID alone (full card width). ROW 2: compact badges (status · flags · issue ·
      // coord pending) — never competing with the ID width. ROW 3+: route / method / stage · ETA.
      return '<div class="glm-ship' + (state.selectedShipmentId === v.shipmentId ? ' is-selected' : '') + '" data-ship="' + esc(v.shipmentId) + '" tabindex="0" role="button" aria-label="Shipment ' + esc(v.shipmentNo) + '">' +
        '<div class="glm-ship__idrow"><span class="glm-ship__no">' + esc(v.shipmentNo) + '</span></div>' +
        '<div class="glm-ship__badges">' + statusPill + flag + issueBadge + posBadge + '</div>' +
        '<div class="glm-ship__route">' + esc(v.originCountry || v.shipFrom || '?') + ' → ' + esc(v.destCountry || v.destWarehouse || '?') + '</div>' +
        '<div class="glm-ship__meta">' + esc(v.carrier || '—') + ' · ' + esc(shipMode(v)) + '</div>' +
        '<div class="glm-ship__meta">Stage: <strong>' + esc(v.stage) + '</strong> · ETA: ' + esc(v.eta || '—') + '</div>' +
        '</div>';
    }).join('');
    return '<div class="glm-panel"><h3 class="glm-panel__title">Shipments (' + vms.length + ')</h3><div class="glm-shiplist">' + rows + '</div></div>';
  }

  // ---------- map shell (persistent WebGL globe host) ----------
  function renderMapShell() {
    // R12 — the map surface holds: the WebGL globe, the tooltip, ONE consolidated Map Control Panel (upper-left:
    // View · Filters · Layers · Legend), and the right-side zoom controls (kept SEPARATE from the panel — §11).
    // The former standalone Map View selector, layer toggles and bottom-left legend are consolidated into the panel.
    return '' +
      '<div class="glm-globe-slot" data-glm="globe-slot"></div>' +
      '<div class="glm-tip" data-glm="tip" aria-hidden="true"></div>' +
      renderMapControlPanel() +
      '<div class="glm-map-controls">' +
        '<button type="button" class="glm-btn" data-act="zoom-in" aria-label="Zoom in">+</button>' +
        '<button type="button" class="glm-btn" data-act="zoom-out" aria-label="Zoom out">&minus;</button>' +
        '<button type="button" class="glm-btn" data-act="reset" aria-label="Reset view">⤢</button>' +
      '</div>';
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
  // ---------- Receipt + Route-Progress (F1-SHIPMENT-RECEIPT-R1B) ----------
  // Actor identity for backend writes (best-effort; backend defaults to system_user when absent).
  function glmActor() { try { return (window.KM && (KM.currentUserEmail || (KM.currentUser && KM.currentUser.email))) || 'global-logistics-map'; } catch (e) { return 'global-logistics-map'; } }
  // Rebuild the read model from the (already-refreshed) DB cache and re-open the shipment, so the drawer
  // reflects the new receipt / route state. The write adapters force-reload the cache, so NO extra fetch.
  function afterShipmentWrite(shipmentId) {
    // F1-7F: in Workspace mode, re-read the SCOPED shipment workspace (the write adapters reloaded the broad cache,
    // which the map now ignores) — never a page-level broad reload. Legacy mode rebuilds from the refreshed cache.
    var _rebuild = function () {
      try { buildReadModel(); } catch (e) {}
      if (state.vms[shipmentId]) selectShipment(shipmentId); else { state.selectedShipmentId = ''; render(); }
    };
    if (_glmEffectiveWorkspace()) {
      // F1-7M-B2-1: bounded post-write readback — re-read ONLY the written shipment (filters.shipmentId; routes+events
      // scoped to it server-side) and merge its mutable facts into the held read-model, RETAINING the static reference
      // tables (locations / route templates / nodes) already loaded — instead of the full size-3000 workspace + all
      // includes. Server stays authoritative for the shipment's rows. First load (no held model) / any failure / a
      // not-found bounded result → full ensureDb refresh (fresh, never a silent stale).
      if (_glmReadModel) { _glmBoundedReadback_(shipmentId, _rebuild); return; }
      ensureDb(true, function (ok) { if (ok) _rebuild(); else render(); }); return;
    }
    _rebuild();
  }
  function _glmBoundedReadback_(shipmentId, rebuild) {
    if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { ensureDb(true, function (ok) { if (ok) rebuild(); else render(); }); return; }
    var mySeq = ++_glmReadSeq;
    Promise.resolve(window.KM.api.getWorkspace('shipment', { filters: { shipmentId: shipmentId }, include: { routes: true, events: true } })).then(function (env) {
      if (mySeq !== _glmReadSeq) return;   // superseded by a newer read
      if (env && env.success && _glmReadModel && _glmMergeShipment_(shipmentId, window.KM.DB.adaptShipmentWorkspace(env.data))) { rebuild(); }
      else { ensureDb(true, function (ok) { if (ok) rebuild(); else render(); }); }   // not-found / miss → fresh full refresh
    }).catch(function () { if (mySeq !== _glmReadSeq) return; ensureDb(true, function (ok) { if (ok) rebuild(); else render(); }); });
  }
  // Merge ONE shipment's mutable facts (its shipments row + lines + routes + events) into the held read-model, RETAINING
  // the static reference tables (locations / route templates / nodes / warehouses / carrier rate cards). Returns false if
  // the bounded read did not contain the shipment (→ caller degrades to a full refresh). Old rows for the id are removed
  // before the fresh rows are added, so a route/event that disappeared server-side does not linger.
  function _glmMergeShipment_(shipmentId, mini) {
    if (!_glmReadModel || !mini) return false;
    var sid = String(shipmentId);
    var one = (mini.shipments || []).filter(function (s) { return String(s.shipmentId) === sid; })[0];
    if (!one) return false;
    function repl(arr, rows) { return (arr || []).filter(function (r) { return String(r.shipmentId) !== sid; }).concat((rows || []).filter(function (r) { return String(r.shipmentId) === sid; })); }
    _glmReadModel.shipments = (_glmReadModel.shipments || []).filter(function (s) { return String(s.shipmentId) !== sid; }).concat([one]);
    _glmReadModel.shipmentLines = repl(_glmReadModel.shipmentLines, mini.shipmentLines);
    _glmReadModel.shipmentRoutes = repl(_glmReadModel.shipmentRoutes, mini.shipmentRoutes);
    _glmReadModel.shipmentEvents = repl(_glmReadModel.shipmentEvents, mini.shipmentEvents);
    return true;   // logisticsLocations / route templates / nodes / warehouses / carrierRateCards → RETAINED (not overwritten)
  }
  function receiptMsg(text, tone) {
    var el = document.querySelector('[data-glm="receipt-msg"]'); if (!el) return;
    el.textContent = text || ''; el.className = 'glm-receipt-msg' + (tone ? ' glm-receipt-msg--' + tone : '');
  }
  // The current node's sequence (the one flagged `current` in shipment_routes), else -1.
  function currentNodeSeq(vm) { return vm.currentNode ? vm.currentNode.sequenceNo : -1; }
  // Canonical node identity used for a route advance (template node id preferred; route id fallback).
  function nodeIdentity(n) { return n.routeTemplateNodeId || n.shipmentRouteId || ''; }
  // Deterministic receiving-capable node = terminal (max sequence) node, refined by warehouse/receiving/
  // arrival/delivery semantics when the LAST such node exists. Mirrors backend shipReceivingCapableNodeId_.
  function receivingCapableSeq(vm) {
    var nodes = (vm.nodes || []).slice().sort(function (a, b) { return a.sequenceNo - b.sequenceNo; });
    if (!nodes.length) return -1;
    var rx = /warehouse|receiv|arriv|deliver|destination|fba|fulfil|\bfc\b/i, semantic = -1;
    nodes.forEach(function (n) { if (rx.test((n.nodeType || '') + ' ' + (n.nodeCode || '') + ' ' + (n.plannedEventType || ''))) semantic = n.sequenceNo; });
    return semantic >= 0 ? semantic : nodes[nodes.length - 1].sequenceNo;
  }
  function shipmentLinesFor(id) { return (state.idx.linesByShip && state.idx.linesByShip[id]) || []; }
  // Derived receipt status (display mirror of the backend deriver) from the shipment's authoritative lines.
  function derivedReceiptStatus(lines) {
    if (!lines.length) return '';
    var anyReceived = false, allFull = true;
    lines.forEach(function (l) { var s = parseFloat(l.shipmentQty) || 0, r = parseFloat(l.shipmentReceivedQty) || 0; if (r > 0) anyReceived = true; if (r < s) allFull = false; });
    if (!anyReceived) return '';
    return allFull ? 'received' : 'partially_received';
  }
  // ETA coerced to a date-input value (YYYY-MM-DD) when possible; else blank (raw shown as a hint).
  function etaInputValue(eta) { var s = String(eta == null ? '' : eta).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
  function receiptPanelHtml(vm) {
    var nodes = (vm.nodes || []).slice().sort(function (a, b) { return a.sequenceNo - b.sequenceNo; });
    var curSeq = currentNodeSeq(vm);
    var recvCapSeq = receivingCapableSeq(vm);
    // ---- Current Position: canonical route-node selector (forward-only; backend-owned) ----
    var routeSection;
    if (!nodes.length) {
      routeSection = '<p class="glm-muted">No route nodes snapshotted for this shipment — position advance is unavailable until the route is created (Confirm & Dispatch).</p>';
    } else {
      var opts = nodes.map(function (n) {
        var backward = n.sequenceNo < curSeq;   // backward moves are blocked by the backend; disable in UI
        var lbl = '#' + n.sequenceNo + ' · ' + (n.nodeName || n.locationName || n.nodeCode || ('Node ' + n.sequenceNo)) + (n.status ? ' (' + n.status + ')' : '');
        return '<option value="' + esc(nodeIdentity(n)) + '"' + (low(n.status) === 'current' ? ' selected' : '') + (backward ? ' disabled' : '') + '>' + esc(lbl) + '</option>';
      }).join('');
      routeSection = '<label class="glm-field"><span>Current Position (route node)</span><select data-route-select>' + opts + '</select></label>' +
        '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-advance">Update Position</button></div>';
    }
    // ---- ETA: editable canonical shipments.eta; a past date stays valid + visible (overdue) ----
    var etaVal = etaInputValue(vm.eta);
    var etaSection = '<label class="glm-field"><span>ETA</span><input type="date" data-eta-input value="' + esc(etaVal) + '"></label>' +
      (!etaVal && vm.eta ? '<p class="glm-muted">Current ETA: ' + esc(vm.eta) + ' (non-standard format — pick a date to normalize).</p>' : '') +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="eta-update">Update ETA</button></div>';

    // ---- Receiving (collapsible; shipment_qty read-only; received editable cumulative; remaining derived) ----
    var lines = shipmentLinesFor(vm.shipmentId);
    var derived = derivedReceiptStatus(lines);
    var fullyReceived = lines.length > 0 && derived === 'received';
    var totalRemaining = lines.reduce(function (a, l) { return a + Math.max((parseFloat(l.shipmentQty) || 0) - (parseFloat(l.shipmentReceivedQty) || 0), 0); }, 0);
    var recvRows = lines.length ? lines.map(function (l) {
      var shipped = parseFloat(l.shipmentQty) || 0, recv = parseFloat(l.shipmentReceivedQty) || 0, remain = Math.max(shipped - recv, 0);
      return '<tr>' +
        '<td>' + esc(l.sku || l.shipmentLineId) + '</td>' +
        '<td class="glm-num">' + num(shipped) + '</td>' +
        '<td class="glm-num"><input type="number" class="glm-recv-input" min="' + recv + '" max="' + shipped + '" step="1" value="' + recv + '" data-recv-line="' + esc(l.shipmentLineId) + '" data-shipped="' + shipped + '" data-prev="' + recv + '"' + (fullyReceived ? ' readonly' : '') + '></td>' +
        '<td class="glm-num" data-remain-line="' + esc(l.shipmentLineId) + '">' + num(remain) + '</td>' +
        '</tr>';
    }).join('') : '';
    // Receive All: enabled only when there is remaining AND the shipment is at/after its receiving-capable node
    // (never auto-receives — it only fills the DRAFT inputs; the user still clicks Save Receipt to commit).
    var atReceiving = !(recvCapSeq >= 0 && curSeq >= 0 && curSeq < recvCapSeq);
    var receiveAllEnabled = totalRemaining > 0 && atReceiving && !fullyReceived;
    var receiveAll = lines.length
      ? '<div class="glm-recv__hdrow"><button type="button" class="glm-btn glm-btn--small" data-act="receive-all"' + (receiveAllEnabled ? '' : ' disabled') + '>Receive All</button>' +
        (!atReceiving && !fullyReceived ? '<span class="glm-muted glm-recv__hint">Not yet at the receiving node — receipt is still allowed, but Receive All is enabled at the destination.</span>' : '') + '</div>'
      : '';
    var recvSection = lines.length
      ? receiveAll +
        '<table class="glm-recv-table"><thead><tr><th>SKU</th><th class="glm-num">Shipped</th><th class="glm-num">Received</th><th class="glm-num">Remaining</th></tr></thead><tbody>' + recvRows + '</tbody></table>' +
        '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="receipt-save"' + (fullyReceived ? ' disabled' : '') + '>Save Receipt</button></div>' +
        (fullyReceived ? '<p class="glm-muted">Fully received — inputs are locked.</p>' : '') +
        '<p class="glm-muted glm-receipt-note">Status is system-derived from received quantities — reaching the final route node does NOT by itself mark a shipment received.</p>'
      : '<p class="glm-muted">No shipment lines loaded for this shipment.</p>';
    // Default COLLAPSED; auto-expand when partially received or at/after the receiving-capable node.
    var autoExpand = (derived === 'partially_received') || (recvCapSeq >= 0 && curSeq >= 0 && curSeq >= recvCapSeq);
    var summaryText = lines.length ? ('Receiving — ' + lines.length + ' SKU' + (lines.length !== 1 ? 's' : '') + ' · ' + num(totalRemaining) + ' units remaining') : 'Receiving';

    return '<section class="glm-dsec"><h4>Current Position</h4>' + routeSection + etaSection +
        kv('Shipment Status', vm.status || '—') +
        '<p class="glm-muted">Shipment Status is system-derived (never set directly on the map).</p>' +
      '</section>' +
      '<section class="glm-dsec"><details class="glm-recv"' + (autoExpand ? ' open' : '') + ' data-glm="receiving-details">' +
        '<summary class="glm-recv__summary">' + esc(summaryText) + '</summary>' +
        '<div class="glm-recv__body">' + recvSection + '</div>' +
      '</details>' +
      '<p class="glm-receipt-msg" data-glm="receipt-msg" role="status" aria-live="polite"></p>' +
      '</section>';
  }
  function wireReceiptControls(vm) {
    var r = root(); if (!r) return;
    // live Remaining recompute as the user types (no write)
    r.querySelectorAll('[data-recv-line]').forEach(function (inp) {
      inp.oninput = function () {
        var shipped = parseFloat(inp.getAttribute('data-shipped')) || 0;
        var v = parseFloat(inp.value); if (!isFinite(v)) v = 0;
        var cell = r.querySelector('[data-remain-line="' + cssEsc(inp.getAttribute('data-recv-line')) + '"]');
        if (cell) cell.textContent = num(Math.max(shipped - v, 0));
      };
    });
    // Receive All — fills every line's DRAFT input to its shipped qty (NO DB write); the user still Saves.
    var recvAllBtn = r.querySelector('[data-act="receive-all"]');
    if (recvAllBtn) recvAllBtn.onclick = function () {
      r.querySelectorAll('[data-recv-line]').forEach(function (inp) {
        if (inp.readOnly) return;
        inp.value = parseFloat(inp.getAttribute('data-shipped')) || 0;
        if (typeof inp.oninput === 'function') inp.oninput();   // recompute the Remaining cell
      });
      receiptMsg('All lines filled to shipped — click Save Receipt to commit.', '');
    };
    function keepReceivingOpen() { var d = r.querySelector('[data-glm="receiving-details"]'); if (d) d.open = true; }
    var saveBtn = r.querySelector('[data-act="receipt-save"]');
    if (saveBtn) saveBtn.onclick = function () {
      if (!(window.KM.DB && window.KM.DB.updateShipmentReceipt)) { receiptMsg('Receipt API unavailable.', 'error'); keepReceivingOpen(); return; }
      var pairs = [];
      r.querySelectorAll('[data-recv-line]').forEach(function (inp) {
        pairs.push({ shipment_line_id: inp.getAttribute('data-recv-line'), value: inp.value, prev: inp.getAttribute('data-prev') });
      });
      var lines = glmReceiptChangedLines(pairs);   // §9.1 — only changed cumulative values are submitted
      if (!lines.length) { receiptMsg('No changes to save.', ''); return; }
      saveBtn.disabled = true; receiptMsg('Saving receipt…', '');
      window.KM.DB.updateShipmentReceipt({ shipment_id: vm.shipmentId, lines: lines, actor: glmActor() }).then(function (resp) {
        if (resp && resp.success) { afterShipmentWrite(vm.shipmentId); }
        else {
          saveBtn.disabled = false; keepReceivingOpen();   // §17.L keep expanded + values preserved on validation error
          var detail = (resp && resp.invalid_lines && resp.invalid_lines.length) ? (' [' + resp.invalid_lines.map(function (x) { return (x.shipment_line_id || '?') + ':' + x.code; }).join(', ') + ']') : '';
          receiptMsg((resp && resp.error ? resp.error : 'Receipt save failed.') + detail, 'error');
        }
      });
    };
    // ETA update — bounded canonical shipments.eta writer (never status/route/receipt).
    var etaBtn = r.querySelector('[data-act="eta-update"]');
    if (etaBtn) etaBtn.onclick = function () {
      if (!(window.KM.DB && window.KM.DB.updateShipmentEta)) { receiptMsg('ETA API unavailable.', 'error'); return; }
      var inp = r.querySelector('[data-eta-input]'); var v = inp ? String(inp.value || '').trim() : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { receiptMsg('Enter a valid ETA date (YYYY-MM-DD).', 'error'); return; }
      etaBtn.disabled = true; receiptMsg('Updating ETA…', '');
      window.KM.DB.updateShipmentEta({ shipment_id: vm.shipmentId, eta: v, actor: glmActor() }).then(function (resp) {
        if (resp && resp.success) { afterShipmentWrite(vm.shipmentId); }
        else { etaBtn.disabled = false; receiptMsg((resp && resp.error ? resp.error : 'ETA update failed.'), 'error'); }
      });
    };
    var advBtn = r.querySelector('[data-act="route-advance"]');
    if (advBtn) advBtn.onclick = function () {
      if (!(window.KM.DB && window.KM.DB.advanceShipmentRoutePoint)) { receiptMsg('Route API unavailable.', 'error'); return; }
      var sel = r.querySelector('[data-route-select]'); if (!sel || !sel.value) { receiptMsg('Select a route point.', 'error'); return; }
      advBtn.disabled = true; receiptMsg('Updating route point…', '');
      window.KM.DB.advanceShipmentRoutePoint({ shipment_id: vm.shipmentId, route_template_node_id: sel.value, actor: glmActor() }).then(function (resp) {
        if (resp && resp.success) { afterShipmentWrite(vm.shipmentId); }
        else { advBtn.disabled = false; receiptMsg((resp && resp.error ? resp.error : 'Route update failed.'), 'error'); }
      });
    };
  }

  function openShipmentDrawer(id) {
    var vm = state.vms[id]; var els = drawerEls(); if (!vm || !els) return;
    openDrawerCommon();
    var pos = resolveCurrentPosition(vm), pl = resolveShipmentPlacement(vm);
    var posLine = pos.drawable ? (pos.lat.toFixed(3) + ', ' + pos.lng.toFixed(3) + ' · ' + esc(pos.source))
      : '<span class="glm-badge glm-badge--pending">Coordinate Pending</span>' + (pl.kind !== 'pending' ? ' <span class="glm-muted">(shown at ' + esc(pl.kind) + ' endpoint)</span>' : '');
    // §14 — explain the shipment's data/route issues in the drawer (same detector as the card badge; no page banner).
    var issues = glmShipmentIssues({ nodeCount: vm.nodes.length, placementKind: pl.kind });
    var issueSection = issues.hasIssue
      ? '<section class="glm-dsec glm-dsec--issue"><h4>⚠ Attention</h4>' + issues.types.map(function (t) { return '<p class="glm-issue__line"><strong>' + esc(t.label) + '</strong><br>' + esc(t.detail) + '</p>'; }).join('') + '</section>'
      : '';
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
      '<section class="glm-dsec"><h4>Live Position</h4>' +
        kv('Current Stage', vm.stage) +
        '<div class="glm-kv"><span class="glm-kv__k">Map Position</span><span class="glm-kv__v">' + posLine + '</span></div>' +
        kv('Latest Event', vm.latestEvent ? (vm.latestEvent.eventType || vm.latestEvent.eventStatus) : '') + kv('Latest Updated', vm.latestUpdated) +
        (vm.flags.exception ? '<div class="glm-warn">Exception / delayed — needs attention.</div>' : (vm.flags.delayed ? '<div class="glm-warn">Past ETA and not yet delivered (still active — remains visible).</div>' : '')) + '</section>' +
      issueSection +
      receiptPanelHtml(vm) +
      '<section class="glm-dsec"><h4>Route (shipment_routes)</h4><div class="glm-steps">' + routeSteps + '</div></section>' +
      '<section class="glm-dsec"><h4>Event Timeline (actual only)</h4><div class="glm-steps">' + timeline + '</div></section>';
    openDrawer();
    wireReceiptControls(vm);
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
    // R8B: map-layer mode now lives inside the map surface as a compact selector.
    r.querySelectorAll('[data-mode-select]').forEach(function (sel) { sel.onchange = function () { var m = sel.value; if (m === state.mode) return; state.mode = m; state.selectedShipmentId = ''; state.didFocus = false; render(); }; });
    r.querySelectorAll('[data-kpi]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-kpi'); state.filters.kpi = (state.filters.kpi === k) ? '' : k; state.selectedShipmentId = ''; render(); }; });
    r.querySelectorAll('[data-filter]').forEach(function (el) {
      var key = el.getAttribute('data-filter');
      if (el.tagName === 'INPUT' && el.type === 'text') { el.oninput = function () { state.filters[key] = el.value; debouncedSearchRender('[data-filter="' + key + '"]'); }; }
      else { el.onchange = function () { state.filters[key] = (el.type === 'checkbox') ? el.checked : el.value; render(); }; }
    });
    r.querySelectorAll('[data-ref]').forEach(function (el) {
      var key = el.getAttribute('data-ref');
      if (el.tagName === 'INPUT' && el.type === 'text') { el.oninput = function () { state.ref[key] = el.value; debouncedSearchRender('[data-ref="' + key + '"]'); }; }
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
      // R12 — collapse/expand the in-map Map Control Panel (canonical UI state; no duplicate DOM). Focus returns to
      // the toggle after the re-render (§14 keyboard/focus behavior).
      'toggle-map-panel': function () { state.mapPanelCollapsed = !state.mapPanelCollapsed; render(); var rr = root(); var tb = rr && rr.querySelector('[data-act="toggle-map-panel"]'); if (tb) try { tb.focus(); } catch (e) {} },
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
  // F1-7M-D2 · the search boxes filter ALREADY-LOADED data client-side (no mutation, latest-input-wins). Each keystroke
  // used to run the FULL render() — whole-body innerHTML rewrite + bindRuntime re-bind + globe setMarkers/setArcs, with
  // filteredVms() computed 3×. Coalesce a burst of keystrokes into ONE trailing render (~180ms) so the expensive globe
  // recompute runs once for the final input. The filter STATE is still updated synchronously per keystroke (both the list
  // and the globe read the SAME state.filters/state.ref at render time → they can never disagree); the native input keeps
  // focus/caret during the debounce window; the trailing renderKeepFocus restores focus after the coalesced render — same
  // observable behavior as before, minus the per-keystroke render storms. The discrete select/date onchange stay immediate.
  var SEARCH_RENDER_DEBOUNCE_MS = 180;
  var _searchRenderTimer = null;
  function debouncedSearchRender(selector) {
    if (_searchRenderTimer) clearTimeout(_searchRenderTimer);
    _searchRenderTimer = setTimeout(function () { _searchRenderTimer = null; renderKeepFocus(selector); }, SEARCH_RENDER_DEBOUNCE_MS);
  }
  function clearFilters() { state.filters = { search: '', company: '', originCountry: '', destCountry: '', destWarehouse: '', carrier: '', method: '', status: '', stage: '', routeTemplateId: '', etaFrom: '', etaTo: '', exceptionOnly: false, delayedOnly: false, arrivingSoon: false, kpi: '' }; state.selectedShipmentId = ''; render(); }

  // ---------- boot / lifecycle ----------
  function boot(force) {
    state.loading = true; state.error = ''; render();
    ensureDb(!!force, function (ok) {
      state.loading = false;
      // Fail-closed: ensureDb sets a specific state.error in Workspace mode; preserve it (no silent broad fallback).
      if (!ok) { if (!state.error) state.error = 'Operation database is not loaded.'; render(); return; }
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
