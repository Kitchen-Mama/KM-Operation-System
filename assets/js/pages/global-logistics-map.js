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
    { id: 'deliveredToday', label: 'Received Today', tone: 'done' }
  ];

  // ==========================================================================================================
  // TEXTURE-3-R9 §B — THE LABEL MODE AUTHORITY (read half). Declared before `state` because `state` restores the
  // preference at construction, and the alternative was a second copy of the key and the accepted values inside
  // the initializer. The write half sits with the other helpers below.
  //
  // 'zh-TW' | 'code'. Deliberately NOT a boolean: `isEnglish` / `useCode` / `showZh` spread across a page, an
  // engine and a resolver is how two callers end up disagreeing about which of them means "the other one", and
  // it is also how a third mode gets bolted on later by inverting a flag. Two named values cannot be inverted.
  //
  // AND IT IS NOT CALLED ENGLISH, because it is not English. `CN`, `US`, `BC` and `TX` are geographic codes:
  // ISO 3166-1 alpha-2 for countries and ISO 3166-2 subdivision codes for divisions. Labelling the control "EN"
  // would promise `China` and `British Columbia` and deliver something else.
  //
  // PRESENTATION STATE ONLY. It is read by the globe's two geographic label layers and by this one control. It
  // never enters an API request, a route key, a shipment record or a DB write — there is no code path from here
  // into the adapter, and the R9 suite asserts that by scanning for one.
  // ==========================================================================================================
  var LABEL_MODE_KEY = 'km.map.labelMode.v1';
  var LABEL_MODES = ['zh-TW', 'code'];
  var LABEL_MODE_DEFAULT = 'zh-TW';
  function validLabelMode(v) { var t = String(v == null ? '' : v); return LABEL_MODES.indexOf(t) !== -1 ? t : ''; }
  // A deterministic default, and recovery from a value this version does not accept. The stored garbage is
  // DROPPED rather than carried: the key is versioned precisely so that a future vocabulary uses .v2, which means
  // an unrecognised .v1 value is not a newer preference to preserve — it is noise that would otherwise be
  // re-read and re-rejected on every load. Every access is guarded: a browser with storage disabled, a private
  // window, or a quota error must cost the map nothing at all.
  function readLabelMode() {
    var raw = null;
    try { raw = window.localStorage.getItem(LABEL_MODE_KEY); } catch (e) { return LABEL_MODE_DEFAULT; }
    var v = validLabelMode(raw);
    if (v) return v;
    if (raw != null) { try { window.localStorage.removeItem(LABEL_MODE_KEY); } catch (e2) {} }
    return LABEL_MODE_DEFAULT;
  }

  var state = {
    loading: true, error: '', partial: '',
    mode: 'runtime',                 // 'runtime' (primary) | 'template' | 'global'
    rm: null, idx: null, vms: null,
    filters: { search: '', company: '', originCountry: '', destCountry: '', carrier: '', method: '', status: '', stage: '', routeTemplateId: '', etaFrom: '', etaTo: '', exceptionOnly: false, delayedOnly: false, arrivingSoon: false, kpi: '' },
    selectedShipmentId: '',
    selectedTemplateId: '',
    ref: { search: '', country: '', type: '' },
    showPlannedRoute: true,
    showReference: false,
    // MAP-COUNTRY-BOUNDARY-1 §H — two INDEPENDENT geographic-reference layers, both ON by default. They are
    // presentation state only: no DB row, no Script Property, no new preference table.
    showCountryBorders: true,
    showCountryLabels: true,
    // MAP-VISUAL-REAL-EARTH-LOD-1 §G — the ADM1 layers are three-state ('auto' | 'on' | 'off') and default to
    // AUTO, which is the requirement that an ordinary user must never have to flip a switch to get a correct
    // picture: AUTO shows them exactly when the zoom level makes them meaningful.
    admin1BordersMode: 'auto',
    admin1LabelsMode: 'auto',
    admin1Lod: 0,
    admin1AssetState: 'IDLE',      // IDLE | LOADING | READY | FAILED
    admin1AssetError: '',
    // TEXTURE-3-R9 — restored from local storage at construction, so a reload paints the chosen mode on the
    // FIRST frame rather than flashing Chinese and correcting itself. The read half of the authority is declared
    // ABOVE this object for exactly that reason: a second inline copy of the key and the accepted vocabulary
    // here would be two places to change, which is the duplication R8 spent its round removing from the token
    // rules. One key, one vocabulary, one reader.
    labelMode: readLabelMode(),
    labelModePersisted: true,
    sourceMode: 'not-loaded', diag: null,
    debug: (function () { try { return /(?:[?&])glmdebug=1/.test(location.search) || !!window.KM_GLM_DEBUG; } catch (e) { return false; } })(),
    globe: null, globeHost: null, globeError: '', didFocus: false, selectSeq: 0, lastFocus: null,   // MAP-FOCUS-1
    lastFocusEl: null, escInstalled: false
  };

  // TEXTURE-3-R9 §B — THE LABEL MODE AUTHORITY (write half). The read half, the key and the accepted values are
  // declared above `state`; nothing is restated here.
  var labelModeSubs = [];
  function writeLabelMode(v) {
    try { window.localStorage.setItem(LABEL_MODE_KEY, v); return true; } catch (e) { return false; }
  }
  function getLabelMode() { return validLabelMode(state.labelMode) || LABEL_MODE_DEFAULT; }
  // WRITE. Validate, keep, persist, notify. A refused value changes nothing and says so by returning false, so a
  // caller cannot half-apply a typo: the UI would then show one mode and the globe paint the other.
  function setLabelMode(v) {
    var t = validLabelMode(v);
    if (!t) return false;
    if (t === getLabelMode()) return true;
    state.labelMode = t;
    state.labelModePersisted = writeLabelMode(t);
    for (var i = 0; i < labelModeSubs.length; i++) { try { labelModeSubs[i](t); } catch (e) {} }
    return true;
  }
  function onLabelModeChange(fn) {
    if (typeof fn !== 'function') return function () {};
    labelModeSubs.push(fn);
    return function () { var i = labelModeSubs.indexOf(fn); if (i !== -1) labelModeSubs.splice(i, 1); };
  }
  // The two subscribers, registered ONCE at module scope rather than per render — which is why a remount cannot
  // accumulate them. They are the whole reason the subscription exists; it is not decoration.
  onLabelModeChange(function (m) {
    if (state.globe && typeof state.globe.setLabelMode === 'function') { try { state.globe.setLabelMode(m); } catch (e) {} }
  });
  onLabelModeChange(function () { paintLabelModeControl(); });

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { var v = parseFloat(n); return isFinite(v) ? v.toLocaleString('en-US') : '0'; }
  function low(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function enumDisplay(kind, code) {
    var d = window.KM && window.KM.display;
    return d && typeof d[kind] === 'function' ? d[kind](code) : String(code == null ? '' : code);
  }
  function validCoord(lat, lng) { return (typeof lat === 'number') && (typeof lng === 'number') && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0); }
  function root() { return document.getElementById('global-logistics-map-section'); }
  function body() { var r = root(); return r ? r.querySelector('[data-glm="body"]') : null; }
  function parseDate(s) { s = String(s == null ? '' : s).trim(); if (!s) return null; var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]); var t = Date.parse(s); return isNaN(t) ? null : t; }
  function glmDisplayDate_(value) {
    var s = String(value == null ? '' : value).trim();
    if (!s) return '';
    // Unzoned Sheets values are system wall time, not the browser's local time.
    var wall = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
    if (wall) {
      var day = wall[1] + '-' + ('0' + wall[2]).slice(-2) + '-' + ('0' + wall[3]).slice(-2);
      var d0 = new Date(day + 'T00:00:00Z');
      return isFinite(d0.getTime()) && d0.toISOString().slice(0, 10) === day &&
        (!wall[4] || (+wall[4] < 24 && +wall[5] < 60 && +(wall[6] || 0) < 60)) ? day : '';
    }
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s) && !/\bGMT/i.test(s)) return '';
    var isoDay = s.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (isoDay) {
      var check = new Date(isoDay[1] + 'T00:00:00Z');
      if (!isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== isoDay[1]) return '';
    }
    var d = new Date(s);
    if (!isFinite(d.getTime())) return '';
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    function part(type) { return parts.filter(function (p) { return p.type === type; })[0].value; }
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function tpeTodayMs() { var d; try { d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { d = new Date().toISOString().slice(0, 10); } return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); }
  function prefersReducedMotion() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  // ---------- pure helpers (F1-SHIPMENT-MAP-R8; dependency-free — mirrored/extracted by the test) ----------
  // §13 status summary: bucket shipments by their BACKEND status (never an invented lifecycle). Conservative
  // grouping — In Transit (shipped/in_transit/arrived/ready_to_ship), Partially Received (partially_received +
  // legacy partial_received), Received (received/completed/delivered). Any status outside the known vocabulary
  // falls into Other (surfaced with its raw status list, never silently reclassified). Pure; input never mutated.
  var GLM_STATUS_BUCKETS_ = [
    { key: 'inTransit', label: 'In Transit', match: { shipped: 1, in_transit: 1, ready_to_ship: 1 } },
    { key: 'arrived', label: 'Delivered · 已送達（待收貨）', match: { arrived: 1 } },   // A-DELTA1 P0-1: persisted arrival at the true destination, not received
    { key: 'partiallyReceived', label: 'Partially Received', match: { partially_received: 1, partial_received: 1 } },
    { key: 'received', label: 'Received', match: { received: 1, completed: 1, delivered: 1 } }
  ];
  function glmStatusSummary(vms) {
    var counts = { inTransit: 0, arrived: 0, partiallyReceived: 0, received: 0, other: 0 }, otherStatuses = {};
    (vms || []).forEach(function (v) {
      var st = String(v && v.status != null ? v.status : '').trim().toLowerCase(), placed = false;
      if (v && v.display && v.display.key === 'arrived') st = 'arrived';   // A-DELTA1 C2 item 1: a proven arrival is never counted In Transit
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
  // R71-FE-1 (receipt resend, LOCAL CANDIDATE): the HELD receipt of a shipment - one whose answer never arrived. Memory + sessionStorage
  // (survives a reload of this tab). The cumulative values ARE the receipt's identity on the server (31_ shipReceiptMovementRef_(line,
  // cumulative)), so holding the exact lines is holding the key.
  var _glmRcvHeldMem = {};
  function glmRcvHeld_(sid) {
    if (_glmRcvHeldMem[sid]) return _glmRcvHeldMem[sid];
    try { var s = sessionStorage.getItem('km.shipment.receipt.pending.' + sid); if (s) _glmRcvHeldMem[sid] = JSON.parse(s); } catch (e) {}
    return _glmRcvHeldMem[sid] || null;
  }
  function glmRcvHold_(sid, op) {
    if (op) _glmRcvHeldMem[sid] = op; else delete _glmRcvHeldMem[sid];
    try { if (op) sessionStorage.setItem('km.shipment.receipt.pending.' + sid, JSON.stringify(op)); else sessionStorage.removeItem('km.shipment.receipt.pending.' + sid); } catch (e) {}
  }
  // §12 PER-SHIPMENT ISSUE AUTHORITY (R8C) — derive a shipment's data/route-completeness issues from the SAME facts
  // already computed elsewhere (route-node count + resolved placement kind). This is NOT a new validation engine:
  // it only re-expresses existing detected gaps (no shipment_routes rows; no drawable coordinate). Pure + testable.
  // facts = { nodeCount:Number, placementKind:'current'|'destination'|'origin'|'pending' }.
  function glmShipmentIssues(facts) {
    facts = facts || {};
    var types = [];
    // SHIP-OPEN (Owner Q7): an opening record has no route history by design - it is labelled, not flagged, and nothing is fabricated
    if (!facts.nodeCount && facts.opening) types.push({ code: 'OPENING_NO_ROUTE_HISTORY', label: '無路線資料', detail: '此單沒有路線節點；系統不補造路線或事件。' + (facts.displayOnly ? ' Amazon 收貨紀錄不增加庫存 · 資料時間 ' + (facts.asOf || '未提供') + '。' : '') });
    else if (!facts.nodeCount) types.push({ code: 'NO_ROUTE_NODES', label: 'Route Issue', detail: 'Route history incomplete — no route nodes are currently available for this shipment.' });
    if (facts.placementKind === 'pending') types.push({ code: 'COORDINATE_PENDING', label: 'Coordinate Pending', detail: 'No map coordinates are available yet, so this shipment cannot be plotted. It stays listed and selectable.' });
    return { hasIssue: types.some(function (t) { return t.code !== 'OPENING_NO_ROUTE_HISTORY'; }), types: types };
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

  /* ---- S8-B3-R3-CP2M-R4-R1 / TEXTURE-3-R12 — GLOBE LIFECYCLE DIAGNOSTICS (observation only) ----------
     The map canvas is reported to disappear during loading, on re-render and on leave-and-return. Before
     anything is changed, the page has to be able to say WHICH of those happened, because the symptom is
     the same in every case and the causes are not:
       * the HOST removed from the document but kept alive (detachGlobe does exactly this on purpose)
       * the globe INSTANCE destroyed and rebuilt
       * the WebGL context lost
       * a late response rendering over a page the operator has left
     "The canvas is gone" distinguishes none of them. `detachGlobe` keeps the host and keeps `state.globe`,
     so a disappearance is NOT evidence that the engine was rebuilt, and this counts both separately so the
     difference is measured rather than assumed. */
  var _glmInstanceSeq = 0;
  var _glmNavGen = 0;
  var _glmDiag = {
    renders: 0, boots: 0,
    attaches: 0, detaches: 0,
    globeCreates: 0, globeDestroys: 0,
    contextLost: 0,
    staleRendersBlocked: 0, teardownsAvoided: 0,
    staleMountsBlocked: 0,
    everRendered: false
  };
  function ensureDb(force, cb) {
    if (_glmEffectiveWorkspace()) {
      if (!force && _glmReadModel) { cb(true); return; }
      if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { state.error = 'Shipment Workspace API unavailable [WORKSPACE_UNAVAILABLE].'; cb(false); return; }
      var mySeq = ++_glmReadSeq;
      Promise.resolve(window.KM.api.getWorkspace('shipment', { include: { routes: true, events: true, locations: true, templates: true, planDates: true }, page: { number: 1, size: 3000 } })).then(function (env) {
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

  // ---------- A final3 (Owner 2026-11-20 items 2 / 4): origin + position lineage, read-only, pure where possible ----------
  // ORIGIN. Order: (1) the shipment route snapshot's first node country (the existing explicit source, unchanged); (2) the EXACT source
  // warehouse master row (shipments.source_warehouse_id -> warehouses.warehouse_id, exactly one row) and its country. Both present and
  // different -> ORIGIN_CONFLICT: the route value is kept and the conflict is shown, never silently replaced. Countries are legal 2-letter
  // codes (trimmed, upper-cased); anything else is not a country. Never from an id string, a name, the company or a free-text address.
  // Missing -> '' + the reason + the master field to fill (shown as 待補資料). The cross-company factory rule is not touched here.
  function glmLegalCountry_(v) { var s = String(v == null ? '' : v).trim().toUpperCase(); return /^[A-Z]{2}$/.test(s) ? s : ''; }
  function glmOriginOf_(s, nodes, whRowsById) {
    var routeRaw = nodes && nodes[0] ? String(nodes[0].country == null ? '' : nodes[0].country).trim() : '', route = glmLegalCountry_(routeRaw);
    var sid = String((s && s.sourceWarehouseId) || '').trim(), rows = sid ? ((whRowsById || {})[sid] || []) : [];
    var w = rows.length === 1 ? rows[0] : null, masterRaw = w ? String(w.country == null ? '' : w.country).trim() : '', master = glmLegalCountry_(masterRaw);
    var out = { country: '', source: '', issue: '', route: route, master: master, missing_field: '' };
    if (route && master && route !== master) { out.country = route; out.source = 'ROUTE'; out.issue = 'ORIGIN_CONFLICT'; return out; }
    if (route) { out.country = route; out.source = 'ROUTE'; return out; }
    if (master) { out.country = master; out.source = 'SOURCE_WAREHOUSE_MASTER'; return out; }
    if (!sid) { out.issue = 'SOURCE_WAREHOUSE_MISSING'; out.missing_field = 'shipments.source_warehouse_id'; }
    else if (rows.length > 1) { out.issue = 'SOURCE_WAREHOUSE_AMBIGUOUS'; out.missing_field = 'warehouses.warehouse_id ' + sid + ' (more than one row)'; }
    else if (!w) { out.issue = 'SOURCE_WAREHOUSE_NOT_IN_MASTER'; out.missing_field = 'warehouses row ' + sid; }
    else { out.issue = masterRaw ? 'SOURCE_WAREHOUSE_COUNTRY_INVALID' : 'SOURCE_WAREHOUSE_COUNTRY_MISSING'; out.missing_field = 'warehouses.country (' + sid + ')'; }
    if (routeRaw && !route) out.issue += '+ROUTE_COUNTRY_INVALID';
    return out;
  }
  function glmOriginText_(v) {
    var o = v && v.origin;
    if (o && o.issue === 'ORIGIN_CONFLICT') return '衝突：路線 ' + o.route + ' / 主檔 ' + o.master;
    return (v && v.originCountry) || '待補資料';
  }
  // POSITION LINEAGE of one route node (exact only): a typed location reference (logistics_location / warehouse / factory - exactly ONE
  // logistics_locations row), else the route row's own template node (route_template_node_id, exactly one row) and its coordinate or
  // logistics_location_id. Returns { coord } | { loc, via } | { miss: '<the master field that is missing>' }. Never 0,0, never a centroid,
  // never an ETD / ETA interpolation, never a name match.
  function glmNodeLocation_(n, idx) {
    idx = idx || {};
    if (!n) return { miss: 'shipment_routes (no node)' };
    var locById = idx.locById || {}, owners = idx.locRowsByOwner || { warehouse: {}, factory: {} }, tpl = idx.tplNodeRows || {};
    if (n.locationRefId) {
      var t = String(n.locationRefType || '').trim().toLowerCase();
      if (!t || t === 'logistics_location') { var l = locById[n.locationRefId]; return l ? { loc: l, via: 'LOCATION_REF' } : { miss: 'logistics_locations.logistics_location_id = ' + n.locationRefId }; }
      if (t === 'warehouse' || t === 'factory') { var m = (owners[t] || {})[n.locationRefId] || [];
        return m.length === 1 ? { loc: m[0], via: 'LOCATION_REF_' + t.toUpperCase() } : { miss: m.length ? 'logistics_locations: more than one row for ' + t + ' ' + n.locationRefId : 'logistics_locations.' + t + '_id = ' + n.locationRefId }; }
      return { miss: 'shipment_routes.location_ref_type (' + t + ' is not a known type)' };
    }
    if (n.routeTemplateNodeId) {
      var tn = tpl[n.routeTemplateNodeId] || [];
      if (tn.length !== 1) return { miss: tn.length ? 'shipment_route_template_nodes: more than one row ' + n.routeTemplateNodeId : 'shipment_route_template_nodes row ' + n.routeTemplateNodeId };
      if (validCoord(tn[0].latitude, tn[0].longitude)) return { coord: { lat: tn[0].latitude, lng: tn[0].longitude }, via: 'TEMPLATE_NODE' };
      if (tn[0].logisticsLocationId) { var l2 = locById[tn[0].logisticsLocationId]; return l2 ? { loc: l2, via: 'TEMPLATE_NODE_LOCATION' } : { miss: 'logistics_locations.logistics_location_id = ' + tn[0].logisticsLocationId }; }
      return { miss: 'shipment_route_template_nodes.logistics_location_id / latitude / longitude (template node ' + n.routeTemplateNodeId + ')' };
    }
    return { miss: 'shipment_routes.location_ref_id (and no route_template_node_id)' };
  }
  // A-delta2 R (Owner rule 4) = 31_ shipArrivalPlaceholder_: a route terminal with NO reference of its own whose route_template_node_id is ONE template
  // row flagged is_destination_placeholder resolves to THIS shipment's destination only when that row has no reference of its own, is not a gateway,
  // is its template's ONLY placeholder and the single maximum of positive sequences, and the destination is exactly one logistics_locations row
  // (or, with none, exactly one warehouses row). Two location rows refuse. Never a name or a label.
  function glmPlaceholderLoc_(t, dest, idx) {
    idx = idx || {}; var tplRows = idx.tplNodeRows || {}, s0 = function (v) { return String(v == null ? '' : v).trim(); };
    if (!t || s0(t.locationRefId) || !t.routeTemplateNodeId) return { ok: false };
    var tn = tplRows[t.routeTemplateNodeId] || []; if (tn.length !== 1) return { ok: false };
    var x = tn[0], id = s0(x.routeTemplateNodeId);
    if (x.isDestinationPlaceholder !== true) return { ok: false };
    if (s0(x.logisticsLocationId) || s0(x.locationRefId)) return { ok: false, miss: 'shipment_route_template_nodes ' + id + ' carries its own reference' };
    if (isGatewayNode(x)) return { ok: false, miss: 'shipment_route_template_nodes ' + id + ' is a transit gateway' };
    var tid = s0(x.routeTemplateId); if (!tid) return { ok: false, miss: 'shipment_route_template_nodes.route_template_id (' + id + ')' };
    var maxSeq = -Infinity, cnt = 0, phN = 0, bad = false;
    Object.keys(tplRows).forEach(function (k) { (tplRows[k] || []).forEach(function (r) { if (s0(r.routeTemplateId) !== tid) return;
      var q = r.nodeSequence; if (typeof q !== 'number' || !isFinite(q) || q <= 0) { bad = true; return; }
      if (q > maxSeq) { maxSeq = q; cnt = 1; } else if (q === maxSeq) cnt++;
      if (r.isDestinationPlaceholder === true) phN++; }); });
    if (bad || cnt !== 1 || x.nodeSequence !== maxSeq) return { ok: false, miss: 'shipment_route_template_nodes: ' + id + ' is not the single last node of ' + tid };
    if (phN !== 1) return { ok: false, miss: 'shipment_route_template_nodes: ' + tid + ' has ' + phN + ' destination placeholders' };
    if (!dest) return { ok: false, miss: 'shipments.destination_warehouse_id' };
    var m = ((idx.locRowsByOwner || {}).warehouse || {})[dest] || [];
    if (m.length > 1) return { ok: false, miss: 'logistics_locations: more than one row for warehouse ' + dest };
    if (m.length === 1) return { ok: true, loc: m[0] };
    var w = (idx.whRowsById || {})[dest] || [];
    return w.length === 1 ? { ok: true, loc: null } : { ok: false, miss: w.length > 1 ? 'warehouses: more than one row ' + dest : 'logistics_locations.warehouse_id / warehouses row = ' + dest };
  }
  // ONE lineage test for the arrival, the destination node and the diagnostic chain: { ok, mapped, via, miss }
  function glmTerminalLineage_(t, dest, idx) {
    var tp = low(t.locationRefType), ref = String(t.locationRefId || '').trim(), r = glmNodeLocation_(t, idx || {});
    var mapped = (tp === 'warehouse' && ref) ? ref : (r.loc ? String(r.loc.warehouseId || '').trim() : '');
    var ok = !!dest && ((tp === 'warehouse' && ref === dest) || (!!r.loc && String(r.loc.warehouseId || '').trim() === dest));
    if (ok) return { ok: true, mapped: mapped, via: r.via || '', miss: '' };
    if (!r.loc && !ref) { var tn = ((idx || {}).tplNodeRows || {})[t.routeTemplateNodeId] || [];
      if (tn.length === 1 && !String(tn[0].logisticsLocationId || '').trim()) { var ph = glmPlaceholderLoc_(t, dest, idx);
        if (ph.ok) return { ok: true, mapped: dest, via: 'TEMPLATE_DESTINATION_PLACEHOLDER', miss: '', loc: ph.loc };
        if (ph.miss) return { ok: false, mapped: mapped, via: r.via || '', miss: ph.miss }; } }
    return { ok: false, mapped: mapped, via: r.via || '', miss: r.miss || '' };
  }
  // CLASSIFICATION of one shipment (coordinate-free): DRAWABLE / NO_ROUTE / NO_CURRENT_POSITION / UNMATCHED_LOCATION /
  // LOCATION_WITHOUT_VALID_COORDS / RENDER_FAILURE / RENDER_UNAVAILABLE, with the master field that is missing.
  function glmPositionClass_(vm, idx, pos, render) {
    render = render || {};
    if (pos && pos.drawable) {
      if (render.globe === false) return { cls: 'RENDER_UNAVAILABLE', source: pos.source, missing_field: '' };
      if (render.expected && !render.rendered) return { cls: 'RENDER_FAILURE', source: pos.source, missing_field: '', render_error: render.error || '' };
      return { cls: 'DRAWABLE', source: pos.source, missing_field: '' };
    }
    if (!vm.nodes || !vm.nodes.length) return { cls: 'NO_ROUTE', missing_field: 'shipment_routes (no route node for this shipment)' };
    var ref = vm.currentNode || vm.lastCompleted;
    if (!ref) return { cls: 'NO_CURRENT_POSITION', missing_field: 'shipment_routes.status (no node is current or completed)' };
    var r = glmNodeLocation_(ref, idx), base = { node_sequence: ref.sequenceNo, node_status: String(ref.status || ''), location_ref_type: ref.locationRefType || '', location_ref_id: ref.locationRefId || '', route_template_node_id: ref.routeTemplateNodeId || '' };
    if (r.loc) return Object.assign(base, { cls: 'LOCATION_WITHOUT_VALID_COORDS', missing_field: 'logistics_locations.latitude / longitude (' + (r.loc.logisticsLocationId || r.loc.locationCode || '') + ')' });
    return Object.assign(base, { cls: 'UNMATCHED_LOCATION', missing_field: r.miss || '' });
  }
  // READ-ONLY export of the classification of EVERY loaded shipment (no coordinates, no URL, no payload) - for the Owner to hand back.
  // A-DELTA1 P0-1: the minimum arrival chain of one shipment for the read-only position diagnostic (no token, URL, address or raw payload):
  // terminal node id / sequence / status / location_ref_type / location_ref_id / mapped warehouse_id, the shipment's destination warehouse,
  // the arrival reason code and the data version (shipments.updated_at this page read).
  function glmArrivalChain_(v) {
    var nodes = (v && v.nodes) || [], t = null, maxSeq = -Infinity;
    nodes.forEach(function (n) { var sq = n.sequenceNo; if (typeof sq === 'number' && isFinite(sq) && sq > maxSeq) { maxSeq = sq; t = n; } });
    var dch_ = String((v && (v.destCanonWarehouseId || v.destWarehouseId)) || '').trim(), x = t ? glmTerminalLineage_(t, dch_, state.idx) : null;   // A-delta2 R: same lineage as the arrival
    return { terminal_node: t ? { node_id: nodeIdentity(t), sequence_no: t.sequenceNo, status: String(t.status || ''), location_ref_type: t.locationRefType || '', location_ref_id: t.locationRefId || '',
        mapped_warehouse_id: x ? x.mapped : '', resolved_via: x ? (x.via || '') : '', missing_field: x ? (x.miss || '') : '' } : null,
      route_nodes: nodes.length, manual_route: !!nodes.length && nodes.every(function (n) { return String((n && n.routeTemplateId) || '').trim() === 'MANUAL'; }), shipment_destination_warehouse_id: (v && (v.destCanonWarehouseId || v.destWarehouseId)) || '', shipment_status: (v && v.status) || '',
      arrival_code: (v && v.arrival && v.arrival.code) || '', arrival_basis: (v && v.arrival && v.arrival.basis) || (v && v.arrival && v.arrival.arrived ? 'route' : ''), data_version: (v && v.rowVersion) || '' };
  }
  function glmPositionDiagExport_() {
    var fv = {}; try { filteredVms().forEach(function (v) { fv[v.shipmentId] = 1; }); } catch (e) { fv = {}; }
    var rendered = state.renderedIds || null, counts = {};
    var rows = allVms().map(function (v) {
      var pos = resolveCurrentPosition(v), pl = resolveShipmentPlacement(v);
      var c = glmPositionClass_(v, state.idx, pos, { globe: !!state.globe, expected: !!rendered && state.mode === 'runtime' && !state.selectedShipmentId && !!fv[v.shipmentId], rendered: !!(rendered && rendered[v.shipmentId]), error: state.renderError || '' });
      counts[c.cls] = (counts[c.cls] || 0) + 1;
      return { shipment_no: v.displayNo, shipment_id: v.shipmentId, company: v.company, status: v.status, map_placement: pl.kind, active_tracking: v.track ? { active: v.track.active, code: v.track.code, receipt: v.track.receipt, diag: v.track.diag } : null, arrival: v.arrival || null, arrival_chain: glmArrivalChain_(v),
        origin: { country: v.origin ? v.origin.country : v.originCountry, source: v.origin ? v.origin.source : '', issue: v.origin ? v.origin.issue : '', missing_field: v.origin ? v.origin.missing_field : '' },
        position: c };
    });
    var out = { kind: 'KM_MAP_POSITION_DIAG_V1', captured_at: new Date().toISOString(), map_mode: state.mode, globe_ready: !!state.globe, render_error: state.renderError || '', shipments_loaded: rows.length, counts: counts, shipments: rows,
      note: 'Read-only classification of the loaded shipments. No coordinates, addresses or URLs are included. DRAWABLE = a reported node / location coordinate exists.' };
    var text = JSON.stringify(out, null, 2), name = 'km-map-position-diag-' + new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-') + '.json';
    try { var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); } catch (e2) {} }, 1500); } catch (e3) {}
    return { name: name, text: text };
  }
  // ---------- A final3 (Owner 2026-11-20 "Shipment 到目的地、全數收貨與追蹤退場"): three separate facts, read-only ----------
  // (1) LOGISTICS ARRIVAL - glmArrival_: the shipment's route is verifiably ordered (every sequence_no a positive number, ONE maximum), its
  //     terminal node is current or completed, it is not a transit gateway, and its exact lineage reaches THIS shipment's destination
  //     warehouse (location_ref_type warehouse = shipments.warehouse_id, or the referenced / template logistics location's warehouse_id).
  //     Never a label, a node name or an event text. Arrival writes nothing and never touches quantities, stock, supply mode or the ledger.
  // (2) RECEIPT PROGRESS - glmReceiptFacts_: the display mirror of 31_ shipDeriveReceiptStatus_ over the shipment's lines (removed lines
  //     skipped as 31_ does); an unreadable quantity or no line read is NOT "remaining 0". Multi-SKU never nets: every line must be full.
  // (3) ACTIVE-TRACKING VISIBILITY - glmTrackingOf_: ONE predicate for map icons, route arcs / endpoints, Coordinate Pending, the left
  //     Shipment cards and the counts. A shipment leaves active tracking ONLY on authoritative full receipt: every line full, the server-
  //     written status received / completed, the server's 'received' lifecycle event present (31_ writes it last; a receipt that stopped part
  //     way has none), and no receipt of this page still held (unanswered / incomplete). Anything else stays visible with its reason code.
  //     Amazon opening records use the same receipt confirmation; DISPLAY_ONLY excludes stock/supply posting, not receipt tracking.
  // r8b: a recorded shipments.delivered_date (an explicit, Owner-typed logistics date - the r5.2 Owner decision H9 item 2) also counts as
  // arrival when the route cannot prove it (route-less imports: route initialisation is not in final3). It is still NOT a receipt and it never
  // gives a position. A label, a node name, a status word or an event text never does.
  // AD3 A (Owner rule 6): a MANUAL logistics snapshot = every route row of the shipment has route_template_id MANUAL (22_ Confirm route_mode MANUAL /
  // 87_ ROUTE_INIT route_mode MANUAL): origin bound to the source warehouse, destination bound to the saved destination, no intermediate node.
  // Arrival, position, Coordinate Pending and receipt visibility use the SAME rules as any route (glmArrivalNode_ / resolveCurrentPosition);
  // only the stage text says it is manual. Its position is reported with the manual report, never with the route-node selector.
  function glmIsManualRoute_(nodes) { return !!(nodes && nodes.length) && nodes.every(function (n) { return String((n && n.routeTemplateId) || '').trim() === 'MANUAL'; }); }
  function glmManualStage_(v) {
    var a = v && v.arrival && v.arrival.arrived;
    return 'Manual logistics / 手動物流 · ' + (a ? 'Arrived at destination warehouse / 已到目的倉' : (low(v && v.status) === 'in_transit' ? 'In transit / 運送中' : 'Shipped / 已出貨')) + ' (no route template)';
  }
  function glmArrival_(vm, idx) {
    var r = glmArrivalNode_(vm, idx);
    // TEXTURE-3-R17 (AD3): manual logistics / ROUTE_INIT manual / one manual-position channel (Authors A + D) - this round's change to global-logistics-map.js (round marker, comment only)
    // TEXTURE-3-R16 (AD2): destination placeholder lineage (Author R) - this round's change to global-logistics-map.js (round marker, comment only)
    // TEXTURE-3-R15 (AD1b): REVIEW_AD1 fixes by Author C (c3) - this round's change to global-logistics-map.js (round marker, comment only)
    // TEXTURE-3-R14 (A delta 1 / AD1): persisted arrival + arrival projection - this round's change to global-logistics-map.js (round marker, comment only)
    if (!r.arrived && low(vm && vm.status) === 'arrived') return { arrived: true, at_last: r.at_last, code: 'STATUS_ARRIVED', node_code: r.code, basis: 'shipments.status' };   // A-DELTA1 P0-1: the server persisted it from a verified destination
    if (!r.arrived && String((vm && vm.deliveredDate) || '').trim()) return { arrived: true, at_last: r.at_last, code: 'DELIVERED_DATE_RECORDED', node_code: r.code, basis: 'shipments.delivered_date' };
    return r;
  }
  function glmArrivalNode_(vm, idx) {
    var nodes = (vm && vm.nodes) || [], dest = String((vm && vm.destWarehouseId) || '').trim();
    if (!nodes.length) return { arrived: false, at_last: false, code: 'NO_ROUTE' };
    var maxSeq = -Infinity, cnt = 0, t = null;
    for (var i = 0; i < nodes.length; i++) { var sq = nodes[i].sequenceNo;
      if (typeof sq !== 'number' || !isFinite(sq) || sq <= 0) return { arrived: false, at_last: false, code: 'ROUTE_ORDER_UNVERIFIED' };
      if (sq > maxSeq) { maxSeq = sq; cnt = 1; t = nodes[i]; } else if (sq === maxSeq) cnt++; }
    if (cnt !== 1) return { arrived: false, at_last: false, code: 'ROUTE_ORDER_UNVERIFIED' };
    var ts = nodeStatusClass(t.status), nid = nodeIdentity(t);
    if (ts !== 'current' && ts !== 'completed') return { arrived: false, at_last: false, code: 'NOT_AT_LAST_NODE', node_id: nid };
    if (isGatewayNode(t)) return { arrived: false, at_last: true, code: 'LAST_NODE_IS_GATEWAY', node_id: nid };
    if (!dest) return { arrived: false, at_last: true, code: 'DESTINATION_WAREHOUSE_MISSING', node_id: nid, missing_field: 'shipments.warehouse_id' };
    var r = glmTerminalLineage_(t, dest, idx || {});   // A-delta2 R: + the template destination placeholder (= 31_ shipArrivalVerdict_)
    if (!r.ok) return { arrived: false, at_last: true, code: 'LAST_NODE_NOT_DESTINATION', node_id: nid, missing_field: r.miss || ('logistics_locations.warehouse_id = ' + dest + ' for the last route node') };
    return r.via === 'TEMPLATE_DESTINATION_PLACEHOLDER' ? { arrived: true, at_last: true, code: 'AT_DESTINATION', node_id: nid, resolved_via: r.via } : { arrived: true, at_last: true, code: 'AT_DESTINATION', node_id: nid };
  }
  function glmReceiptFacts_(lines) {
    var L = (lines || []).filter(function (l) { return !l.lineRemoved; });
    if (!L.length) return { status: '', code: 'NO_LINES_READ', lines: 0 };
    if (L.some(function (l) { return !!l.qtyInvalid; })) return { status: '', code: 'LINE_QTY_INVALID', lines: L.length };
    var any = false, all = true;
    L.forEach(function (l) { var s = Number(l.shipmentQty) || 0, q = Number(l.shipmentReceivedQty) || 0; if (q > 0) any = true; if (q < s) all = false; });
    if (!any) return { status: '', code: 'NONE_RECEIVED', lines: L.length };
    return all ? { status: 'received', code: 'ALL_LINES_FULL', lines: L.length } : { status: 'partially_received', code: 'PARTIAL', lines: L.length };
  }
  function glmTrackingOf_(vm, lines, held) {
    var st = low(vm.status), rf = glmReceiptFacts_(lines);
    var out = { active: true, receipt: rf.status === 'received' ? 'full' : (rf.status ? 'partial' : 'none'), code: rf.code, diag: '' };
    if (held) { out.code = held.incomplete ? 'RECEIPT_INCOMPLETE_HELD' : 'RECEIPT_UNCONFIRMED_HELD'; return out; }
    if (rf.status === 'received') {
      if (st !== 'received' && st !== 'completed') { out.code = 'RECEIPT_STATUS_NOT_CONFIRMED'; return out; }
      var ev = (vm.events || []).some(function (e) { return low(e.eventType) === 'received' && low(e.eventStatus) === 'received'; });
      if (!ev) { out.code = 'RECEIPT_EVENT_MISSING'; return out; }
      out.active = false; out.code = 'FULLY_RECEIVED';
      if (vm.arrival && !vm.arrival.arrived) out.diag = 'FULL_RECEIPT_BEFORE_DESTINATION_NODE (' + vm.arrival.code + ')';   // diagnostic only: no logistics history is made up
      return out;
    }
    if ((st === 'received' || st === 'completed') && (rf.code === 'NONE_RECEIVED' || rf.code === 'PARTIAL')) out.code = 'STATUS_LINES_CONFLICT';   // the status says done, the lines do not: never hidden (an unread / unreadable line keeps its own reason)
    return out;
  }
  // "Received Today" is counted on its own from the server's 'received' lifecycle event (never from a logistics arrival), over EVERY loaded
  // shipment - the active-tracking filter does not turn it into 0.
  function glmReceivedToday_(vm, todayMs) {
    if (!vm.track || vm.track.code !== 'FULLY_RECEIVED') return false;
    return (vm.events || []).some(function (e) { return low(e.eventType) === 'received' && low(e.eventStatus) === 'received' && parseDate(e.eventTime) === todayMs; });
  }
  // A-DELTA1 C2 item 1: the ONE status mapping (shipping-history.js KMLogisticsArrival, loaded by index.html), fed with THIS page's own arrival
  // verdict (glmArrival_: same rule). Projection only. Fallback (shared module absent: half-synced site) = the same mapping, inline.
  function glmDisplayState_(v) {
    var A = (typeof window !== 'undefined' && window.KMLogisticsArrival) || null, ship = { status: v.status, displayOnly: !!v.openingDisplayOnly };
    if (A && typeof A.stateFromVerdict === 'function') return A.stateFromVerdict(ship, v.arrival || null, null);
    var st = low(v.status);
    if (st === 'arrived') return { key: 'arrived', label: 'Delivered / 已送達（待收貨）', projected: false };
    if ((st === 'shipped' || st === 'in_transit') && v.arrival && v.arrival.arrived) return { key: 'arrived', label: 'Delivered / 已送達（待收貨）', projected: true, display_only: !!v.openingDisplayOnly };
    return { key: st, label: v.status || '—', projected: false };
  }
  function glmTrackBadge_(v) {
    var t = v.track || {}, a = v.arrival || {};
    if (t.code === 'STATUS_LINES_CONFLICT' || t.code === 'RECEIPT_STATUS_NOT_CONFIRMED' || t.code === 'RECEIPT_EVENT_MISSING' || t.code === 'LINE_QTY_INVALID')
      return '<span class="glm-badge glm-badge--issue" title="' + esc(t.code) + '">收貨待確認</span>';
    if (t.receipt === 'partial') return '<span class="glm-badge glm-badge--neutral">部分收貨</span>';
    if (a.arrived) return '<span class="glm-badge glm-badge--good">已送達（待收貨）</span>';
    return '';
  }
  function buildReadModel() {
    var db = window.KM.DB;
    // F1-7F: source from the scoped shipment workspace read-model when canonical; else the Legacy broad-cache getters.
    var m = _glmReadModel;
    var rm = m ? {
      shipments: m.shipments, shipmentLines: m.shipmentLines, shipmentRoutes: m.shipmentRoutes,
      shipmentEvents: m.shipmentEvents, warehouses: m.warehouses, locations: m.logisticsLocations,
      routeTemplates: m.shipmentRouteTemplates, routeTemplateNodes: m.shipmentRouteTemplateNodes, shippingPlans: null
    } : {
      shipments: (db.getShipments && db.getShipments()) || [],
      shipmentLines: (db.getShipmentLines && db.getShipmentLines()) || [],
      shipmentRoutes: (db.getShipmentRoutes && db.getShipmentRoutes()) || [],
      shipmentEvents: (db.getShipmentEvents && db.getShipmentEvents()) || [],
      warehouses: (db.getWarehouses && db.getWarehouses()) || [],
      locations: (db.getLogisticsLocations && db.getLogisticsLocations()) || [],
      routeTemplates: (db.getShipmentRouteTemplates && db.getShipmentRouteTemplates()) || [],
      routeTemplateNodes: (db.getShipmentRouteTemplateNodes && db.getShipmentRouteTemplateNodes()) || [],
      shippingPlans: (db.getShippingPlans && db.getShippingPlans()) || []
    };
    var locById = {}, locByWh = {}, locByFactory = {};
    rm.locations.forEach(function (l) {
      if (l.logisticsLocationId) locById[l.logisticsLocationId] = l;
      if (l.warehouseId && validCoord(l.latitude, l.longitude) && !locByWh[l.warehouseId]) locByWh[l.warehouseId] = l;
      if (l.factoryId && validCoord(l.latitude, l.longitude) && !locByFactory[l.factoryId]) locByFactory[l.factoryId] = l;
    });
    var whById = {}; rm.warehouses.forEach(function (w) { if (w.warehouseId) whById[w.warehouseId] = w; });
    // A final3 (Owner items 2 / 4): exact-lineage indexes - every row per id (a duplicated id is ambiguous, never a pick)
    var whRowsById = {}; rm.warehouses.forEach(function (w) { if (w.warehouseId) (whRowsById[w.warehouseId] = whRowsById[w.warehouseId] || []).push(w); });
    var tplNodeRows = {}; (rm.routeTemplateNodes || []).forEach(function (n) { if (n.routeTemplateNodeId) (tplNodeRows[n.routeTemplateNodeId] = tplNodeRows[n.routeTemplateNodeId] || []).push(n); });
    var locRowsByOwner = { warehouse: {}, factory: {} }; rm.locations.forEach(function (l) { if (l.warehouseId) (locRowsByOwner.warehouse[l.warehouseId] = locRowsByOwner.warehouse[l.warehouseId] || []).push(l); if (l.factoryId) (locRowsByOwner.factory[l.factoryId] = locRowsByOwner.factory[l.factoryId] || []).push(l); });
    // TEXTURE-3-R11 — the carrier master, held as the ARRAY the shared resolver takes rather than as an index,
    // so null (unread) survives the trip. An index would turn "not read" into an empty object, which reads as
    // "no carrier matches" and is the one answer this must never invent.
    var carriersRm = (rm.carriers === undefined) ? null : rm.carriers;
    var eventsByShip = {}; rm.shipmentEvents.forEach(function (e) { (eventsByShip[e.shipmentId] = eventsByShip[e.shipmentId] || []).push(e); });
    Object.keys(eventsByShip).forEach(function (k) { eventsByShip[k].sort(function (a, b) { return (a.eventSequence - b.eventSequence) || String(a.eventTime).localeCompare(String(b.eventTime)); }); eventsByShip[k] = dedupeEvents(eventsByShip[k]); });
    var nodesByShip = {}; rm.shipmentRoutes.forEach(function (n) { (nodesByShip[n.shipmentId] = nodesByShip[n.shipmentId] || []).push(n); });
    Object.keys(nodesByShip).forEach(function (k) { nodesByShip[k].sort(function (a, b) { return a.sequenceNo - b.sequenceNo; }); });
    var linesByShip = {}; rm.shipmentLines.forEach(function (l) { (linesByShip[l.shipmentId] = linesByShip[l.shipmentId] || []).push(l); });
    state.rm = rm;
    state.idx = { whRowsById: whRowsById, tplNodeRows: tplNodeRows, locRowsByOwner: locRowsByOwner, locById: locById, locByWh: locByWh, locByFactory: locByFactory, whById: whById, carriers: carriersRm, eventsByShip: eventsByShip, nodesByShip: nodesByShip, linesByShip: linesByShip };
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
      var arrival = glmArrival_({ nodes: nodes, destWarehouseId: s.destinationWarehouseId || s.warehouseId || '', deliveredDate: s.deliveredDate, status: s.status }, idx), delivered = arrival.arrived;   // A final3 (TC-A): logistics arrival = the verified destination node; was DELIVERED_SET[status] || deliveredDate || /deliver|received/ on the latest event (partially_received matched it)
      var etaMs = parseDate(s.eta);
      var stage = currentNode ? (currentNode.nodeType || currentNode.nodeCode || 'In Transit')
        : (lastCompleted ? ('After ' + (lastCompleted.nodeType || lastCompleted.nodeCode)) : (latestEvent ? (latestEvent.eventType || latestEvent.eventStatus || 'In Transit') : (s.status || 'Unknown')));
      var custHay = low((currentNode && currentNode.nodeType) || '') + ' ' + low((latestEvent && latestEvent.eventType) || '') + ' ' + low((latestEvent && latestEvent.eventStatus) || '');
      var excHay = low(s.status) + ' ' + (nodes.some(function (n) { return nodeStatusClass(n.status) === 'exception'; }) ? 'exception ' : '') + low((latestEvent && latestEvent.eventType) || '') + ' ' + low((latestEvent && latestEvent.eventStatus) || '') + ' ' + low((latestEvent && latestEvent.rawStatus) || '');
      var deliveredMs = parseDate(s.deliveredDate) || parseDate(s.actualArrivalDate) || (delivered && latestEvent ? parseDate(latestEvent.eventTime) : null);
      var origin = glmOriginOf_(s, nodes, idx.whRowsById), originCountry = origin.country;   // A final3 (Owner item 2): was nodes[0].country only ('?' for every route-less import)
      var planDates = s.shippingPlanDates;
      if (!Array.isArray(planDates)) {
        var planRows = (rm.shippingPlans || []).filter(function (p) { return p.shippingPlanId === s.shippingPlanId; });
        planDates = s.shippingPlanId ? [{ shippingPlanId: s.shippingPlanId, createdAt: planRows.length === 1 ? planRows[0].createdAt : '' }] : [];
      }
      var vm = {
        shipmentId: s.shipmentId, shipmentNo: s.shipmentNo || s.shipmentId, company: s.company || '',
        // FE-EXT-1 — what a person reads is the external shipment number; shipmentId stays the key for
        // selection, indexes, route/event joins and every payload. originalNo keeps shipment_no searchable.
        externalShipmentId: glmTrim_(s.externalShipmentId), originalNo: glmTrim_(s.shipmentNo), displayNo: glmDisplayNo_(s),
        opening: glmTrim_(s.recordOrigin) === 'IMPORT_HISTORICAL' && glmTrim_(s.openingSupplyMode) !== '',   // SHIP-OPEN; r5.4: a blank mode = legacy row = base display (no opening label, base Route Issue flag)
        openingDisplayOnly: glmTrim_(s.recordOrigin) === 'IMPORT_HISTORICAL' && glmTrim_(s.openingSupplyMode).toUpperCase() === 'DISPLAY_ONLY', openingAsOf: glmTrim_(s.openingAsOf),
        // TEXTURE-3-R11 — `carrier` REMAINS the carrier_id: it is the filter key and the join key, and
        // filteredVms compares it. carrierLabel is what a person reads; it falls back to the id, never to a
        // blank, so an unresolved carrier is still identified.
        carrier: s.carrierId || '', carrierLabel: glmCarrierLabel_(s.carrierId, idx.carriers),
        method: s.shippingMethod || s.shippingMethodDisplay || '',
        originCountry: originCountry, origin: origin, destCountry: glmDestinationCountry_(s, idx), destWarehouseId: s.warehouseId || '',
        destWarehouse: (idx.whById[s.warehouseId] && idx.whById[s.warehouseId].warehouseName) || s.warehouseId || (s.destination || ''),
        shipFrom: s.shipFrom || '', destination: s.destination || '', status: s.status || '',
        tracking: s.trackingNumber || '', container: s.containerNo || '', eta: s.eta || '', etaMs: etaMs,
        etd: s.etd || '', shippingPlanDates: planDates,
        delivered: delivered, events: events, latestEvent: latestEvent,
        latestUpdated: (latestEvent && latestEvent.eventTime) || s.updatedAt || s.createdAt || '',
        rowVersion: String(s.updatedAt == null ? '' : s.updatedAt).trim(),   // N1: the shipments.updated_at this page read - the receipt's version token
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
      vm.destCanonWarehouseId = s.destinationWarehouseId || s.warehouseId || '';   // A final4
      vm.arrival = arrival; vm.track = glmTrackingOf_(vm, idx.linesByShip ? (idx.linesByShip[s.shipmentId] || []) : [], glmRcvHeld_(s.shipmentId)); vm.flags.deliveredToday = glmReceivedToday_(vm, today);   // A final3 (TC-B/C)
      vm.display = glmDisplayState_(vm);   // A-DELTA1 C2 item 1
      vm.manualRoute = glmIsManualRoute_(nodes);   // AD3 A: manual logistics snapshot (route_template_id MANUAL) - same arrival / position rules, own stage text
      if (vm.manualRoute) vm.stage = glmManualStage_(vm);
      out[s.shipmentId] = vm;
    });
    // FE-EXT-1 — an external number can repeat across shipments; a shared one also names the internal id,
    // so two rows that read the same are still told apart.
    var seen = {};
    Object.keys(out).forEach(function (k) { var d = out[k].displayNo; seen[d] = (seen[d] || 0) + 1; });
    Object.keys(out).forEach(function (k) { out[k].displayNoShared = seen[out[k].displayNo] > 1; });
    return out;
  }
  function allVms() { return Object.keys(state.vms).map(function (k) { return state.vms[k]; }); }

  // ---------- position resolution ----------
  function resolveCurrentPosition(vm) {
    // A final3 (TC-A): after a Current Position update the icon follows THAT saved node; a coordinate event older than it is never used
    var k8_ = -1; for (var j8_ = vm.events.length - 1; j8_ >= 0; j8_--) { if (low(vm.events[j8_].eventType) === 'route_node_reached') { k8_ = j8_; break; } }
    for (var i = vm.events.length - 1; i >= Math.max(k8_, 0); i--) { var e = vm.events[i]; if (validCoord(e.latitude, e.longitude)) return { lat: e.latitude, lng: e.longitude, source: 'LATEST_EVENT', drawable: true, at: String(e.eventTime || '').trim() }; }
    if (k8_ >= 0 && vm.currentNode) { var c8_ = resolveNodeCoord(vm.currentNode); return c8_.drawable ? { lat: c8_.lat, lng: c8_.lng, source: 'CURRENT_NODE' + (c8_.src === 'NODE' ? '' : '_' + c8_.src), drawable: true, at: String(vm.currentNode.actualArrivalDate || '').trim() } : { lat: null, lng: null, source: 'COORDINATE_PENDING', drawable: false, reason: 'CURRENT_NODE_NO_COORD' }; }
    if (vm.currentNode && validCoord(vm.currentNode.latitude, vm.currentNode.longitude)) return { lat: vm.currentNode.latitude, lng: vm.currentNode.longitude, source: 'CURRENT_NODE', drawable: true, at: String(vm.currentNode.actualArrivalDate || '').trim() };
    if (vm.lastCompleted && validCoord(vm.lastCompleted.latitude, vm.lastCompleted.longitude)) return { lat: vm.lastCompleted.latitude, lng: vm.lastCompleted.longitude, source: 'LAST_COMPLETED_NODE', drawable: true, at: String(vm.lastCompleted.actualArrivalDate || '').trim() };
    var refNode = vm.currentNode || vm.lastCompleted;
    if (refNode && refNode.locationRefId) { var loc = state.idx.locById[refNode.locationRefId]; if (loc && validCoord(loc.latitude, loc.longitude)) return { lat: loc.latitude, lng: loc.longitude, source: 'LOCATION_REF', drawable: true, at: String(refNode.actualArrivalDate || '').trim() }; }
    if (refNode) { var r3 = glmNodeLocation_(refNode, state.idx), c3 = r3.coord || (r3.loc && validCoord(r3.loc.latitude, r3.loc.longitude) ? { lat: r3.loc.latitude, lng: r3.loc.longitude } : null); if (c3) return { lat: c3.lat, lng: c3.lng, source: r3.via, drawable: true, at: String(refNode.actualArrivalDate || '').trim() }; }   // A final3 (Owner item 4): exact lineage only
    return { lat: null, lng: null, source: 'COORDINATE_PENDING', drawable: false };
  }
  function resolveNodeCoord(n) {
    if (validCoord(n.latitude, n.longitude)) return { lat: n.latitude, lng: n.longitude, drawable: true, src: 'NODE' };
    if (n.locationRefId) { var loc = state.idx.locById[n.locationRefId]; if (loc && validCoord(loc.latitude, loc.longitude)) return { lat: loc.latitude, lng: loc.longitude, drawable: true, src: 'LOCATION_REF' }; }
    var r4 = glmNodeLocation_(n, state.idx), c4 = r4.coord || (r4.loc && validCoord(r4.loc.latitude, r4.loc.longitude) ? { lat: r4.loc.latitude, lng: r4.loc.longitude } : null); if (c4) return { lat: c4.lat, lng: c4.lng, drawable: true, src: r4.via };   // A final3 (Owner item 4)
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
  function computeKpis() { var all = allVms(), vms = all.filter(function (v) { return !v.track || v.track.active; }); return KPIS.map(function (k) { return { id: k.id, label: k.label, tone: k.tone, value: (k.id === 'deliveredToday' ? all : vms).filter(function (v) { return v.flags[k.id]; }).length }; }); }   // A final3 (TC-C): counts = active tracking; Received Today counted on its own
  function optSet(vms, fn) { var s = {}; vms.forEach(function (v) { var x = (fn(v) || '').toString().trim(); if (x) s[x] = 1; }); return Object.keys(s).sort(); }
  // TEXTURE-3-R11 — options whose VALUE and LABEL differ, for a field whose identity is not its display text.
  // Values stay unique; the label of the first vm carrying a value wins (they agree, both deriving from the
  // same master row).
  function optPairs(vms, valFn, labFn) {
    var seen = {}, out = [];
    vms.forEach(function (v) {
      var val = (valFn(v) || '').toString().trim(); if (!val || seen[val]) return;
      seen[val] = 1; out.push({ v: val, l: ((labFn(v) || '').toString().trim() || val) });
    });
    return out.sort(function (a, b) { return a.l.localeCompare(b.l); });
  }
  // TEXTURE-3-R11 — the map's ONLY carrier-name call, into the one shared presentation resolver
  // (KM.display.carrierDisplay). No second resolver and no second data source: `carriers` is the master the
  // 57_ workspace now returns. null means UNREAD and the resolver answers with the id, not with a blank.
  function glmCarrierLabel_(carrierId, carriers) {
    if (window.KM && window.KM.display && window.KM.display.carrierDisplay) {
      return window.KM.display.carrierDisplay(carrierId, carriers).text;
    }
    return String(carrierId == null ? '' : carrierId);
  }
  // FE-EXT-1 — display number: external shipment id, else shipment_no, else the internal id (blank = whitespace).
  function glmTrim_(v) { return v == null ? '' : String(v).trim(); }
  function glmDestinationCountry_(s, idx) {
    var id = glmTrim_(s.destinationWarehouseId || s.warehouseId), rows = (idx.whRowsById || {})[id] || [];
    var country = glmTrim_(rows.length === 1 ? rows[0].country : '') || glmTrim_(s.country);
    country = country.toUpperCase(); return country === 'UK' ? 'GB' : country;
  }
  function glmDisplayNo_(s) { return glmTrim_(s.externalShipmentId) || glmTrim_(s.shipmentNo) || glmTrim_(s.shipmentId); }
  function glmAccessibleName_(v) { return 'Shipment ' + v.displayNo + (v.displayNoShared ? ' (internal ' + v.shipmentId + ')' : ''); }
  // search keeps every number a person may hold: external, shipment_no and the internal id
  function glmSearchHay_(v) { return [v.displayNo, v.externalShipmentId, v.originalNo, v.shipmentId, v.tracking, v.container].join(' ').toLowerCase(); }
  function filteredVms() {
    var f = state.filters, q = f.search.trim().toLowerCase();
    return allVms().filter(function (v) {
      if (Array.isArray(f.shipmentIds) && f.shipmentIds.length && f.shipmentIds.indexOf(v.shipmentId) < 0) return false;
      if (v.track && !v.track.active) return false;   // Fully received records belong to Overview, never the active map list.
      if (f.kpi && !v.flags[f.kpi]) return false;
      if (q) { var hay = glmSearchHay_(v); if (hay.indexOf(q) < 0) return false; }
      if (f.company && v.company !== f.company) return false;
      if (f.originCountry && v.originCountry !== f.originCountry) return false;
      if (f.destCountry && v.destCountry !== f.destCountry) return false;
      if (f.carrier && v.carrier !== f.carrier) return false;
      if (f.method && v.method !== f.method) return false;
      if (f.status && low((v.display && v.display.key) || v.status) !== low(f.status)) return false;   // A-DELTA1 C2 item 1: the same key as the summary
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
  /* A non-destructive busy indicator. It touches only an aria attribute and the meta line, so there is no
     new element, no new stylesheet rule and no layout change — the workspace underneath is left exactly as
     the operator left it. */
  function setRefreshing(on) {
    var r = root(); if (!r) return;
    try { if (on) r.setAttribute('aria-busy', 'true'); else r.removeAttribute('aria-busy'); } catch (e) {}
    var meta = r.querySelector('[data-glm="meta"]');
    if (meta && on) meta.textContent = 'Refreshing\u2026';
  }

  function render() {
    var b = body(); if (!b) return;
    _glmDiag.renders++;

    /* S8-B3-R3-CP2M-R4-R1 — A REFRESH MUST NOT TEAR THE MAP DOWN.
       MEASURED, not inferred: during a forced refresh the lifecycle probe found the globe host REMOVED
       FROM THE DOCUMENT in 13 of 40 samples — exactly the 13 samples where `state.loading` was true, i.e.
       the whole server round trip — while globeCreates stayed 1, globeDestroys 0 and contextLost 0. The
       engine was never rebuilt and the context was never lost; the host was simply taken off the page and
       not put back, because `detachGlobe()` ran before the `state.loading` early-return and only the FULL
       render path calls `attachGlobe()` again.
       The operator sees the map vanish and a spinner take the workspace, for as long as the read takes.
       So a load that has something to preserve no longer replaces anything: the previous workspace stays,
       with a quiet busy marker, and the full render happens when the data actually arrives. The first load
       still gets the spinner, because then there genuinely is nothing to show. */
    if (state.loading && _glmDiag.everRendered) {
      _glmDiag.teardownsAvoided++;
      setRefreshing(true);
      return;
    }
    setRefreshing(false);
    detachGlobe();                              // preserve the persistent WebGL host across the innerHTML rewrite
    var r = root(); var meta = r.querySelector('[data-glm="meta"]');
    if (state.loading) { b.innerHTML = '<div class="glm-state"><div class="glm-spinner"></div><p>Loading shipment runtime…</p></div>'; return; }
    if (state.error) { b.innerHTML = '<div class="glm-state glm-state--error"><p class="glm-state__title">Could not load data</p><p class="glm-state__msg">' + esc(state.error) + '</p><button type="button" class="glm-btn" data-act="retry">Retry</button></div>'; var rb = r.querySelector('[data-act="retry"]'); if (rb) rb.onclick = function () { boot(true); }; return; }
    if (meta) { var vms = allVms(); meta.textContent = vms.filter(function (v) { return !v.track || v.track.active; }).length + ' active of ' + vms.length + ' shipments · ' + state.rm.shipmentRoutes.length + ' route nodes · ' + state.rm.shipmentEvents.length + ' events · ' + state.rm.locations.length + ' logistics locations.'; }

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
    _glmDiag.everRendered = true;
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
  // Received Today remains a statistic; completed shipments are never returned to the active map list.
  function renderAttentionRow() {
    var all = attentionIndicators();
    var tiles = all.map(function (k) { return glmKpiTileHtml({ accent: k.tone, value: k.value, label: k.label, clickable: k.id !== 'deliveredToday', kpi: k.id }); }).join('');
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
  // TEXTURE-3-R11 — an option may now be a plain string (value === label, every existing caller) or a
  // { v, l } pair for a field whose identity is not its display text. The SELECTED value is compared against
  // `v` in both forms, so filtering never depends on what is painted.
  function selHtml(label, key, opts, cur, cls) {
    return '<label class="glm-field' + (cls ? ' ' + cls : '') + '"><span>' + esc(label) + '</span><select data-filter="' + key + '"><option value="">All</option>' +
      opts.map(function (o) {
        var val = (o && typeof o === 'object') ? o.v : o;
        var lab = (o && typeof o === 'object') ? o.l : o;
        return '<option value="' + esc(val) + '"' + (cur === val ? ' selected' : '') + '>' + esc(lab) + '</option>';
      }).join('') + '</select></label>';
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
    // TEXTURE-3-R9 §A — the label switch sits with the View controls and BEFORE the filters, because it changes
    // how the map READS rather than what it shows. Ungated by map mode: the geographic label layers exist in
    // every view, so a control that vanished in two of them would look broken.
    var labelModeCtl = renderLabelModeControl();
    var filters = isRuntime ? '<div class="glm-mcp__sec glm-mcp__sec--filters"><span class="glm-mcp__lbl">Filters</span>' + renderPanelFilters() + '</div>' : '';
    var layers = isRuntime ?
      '<div class="glm-mcp__sec"><span class="glm-mcp__lbl">Layers</span>' +
        '<label class="glm-check glm-check--map"><input type="checkbox" data-toggle="showPlannedRoute"' + (state.showPlannedRoute ? ' checked' : '') + '> Route arcs</label>' +
        '<label class="glm-check glm-check--map"><input type="checkbox" data-toggle="showReference"' + (state.showReference ? ' checked' : '') + '> Reference pins</label>' +
        // MAP-COUNTRY-BOUNDARY-1 §H — independent country-reference toggles. Native checkboxes inside <label>, so
        // they are keyboard-reachable and expose checked state to assistive technology without extra ARIA.
        '<label class="glm-check glm-check--map"><input type="checkbox" data-toggle="showCountryBorders"' + (state.showCountryBorders ? ' checked' : '') + '> Country borders</label>' +
        '<label class="glm-check glm-check--map"><input type="checkbox" data-toggle="showCountryLabels"' + (state.showCountryLabels ? ' checked' : '') + '> Country labels</label>' +
        // MAP-VISUAL-REAL-EARTH-LOD-1 §G — the two ADM1 layers are INDEPENDENT of each other and of the country
        // layers, and they are tri-state rather than checkboxes because Auto is a real third behaviour, not the
        // absence of a choice. Native <select> inside <label> stays keyboard-reachable and screen-reader-labelled.
        adm1Select('admin1BordersMode', 'State / province borders') +
        adm1Select('admin1LabelsMode', 'State / province labels') +
        '<div class="glm-mcp__note" data-glm="adm1-note">' + esc(admin1StatusText()) + '</div>' +
      '</div>' : '';
    // §12 legend RELOCATED into the panel — reuse the SAME legendHtml() renderer (no duplicate, no second legend).
    var legend = '<div class="glm-mcp__sec"><span class="glm-mcp__lbl">Legend</span><div class="glm-mcp__legend">' + legendHtml() + '</div></div>';
    return '<div class="glm-mcp" data-glm="map-panel">' + head +
      '<div class="glm-mcp__body" id="glm-mcp-body">' + mapView + labelModeCtl + filters + layers + legend +
      '<div class="glm-mcp__sec"><button type="button" class="glm-btn glm-btn--small" data-act="pos-diag-export">下載位置診斷 JSON（唯讀）</button></div>' + '</div></div>';   // A final3 (Owner item 4)
  }
  // A two-state segmented control with real radiogroup semantics: ONE tab stop for the group (roving tabindex),
  // arrows to move between options, Space/Enter to choose, aria-checked carrying the state and an aria-label
  // naming the group. Not a checkbox — a checkbox would have to mean "code: on/off", which says nothing about
  // what the other state is.
  //
  // TEXTURE-3-R9A — THE VISIBLE COPY, AND WHAT IT IS CAREFUL NOT TO SAY. R9 shipped `Label Display` / `中文` /
  // `Code`; live validation asked for `Labels` / `Names` / `Code`, which is shorter and reads as a map control
  // rather than a settings row. The internal vocabulary did NOT move with it: the values are still 'zh-TW' and
  // 'code', the storage key is still km.map.labelMode.v1, and a preference saved before this round restores
  // unchanged — the copy is a presentation of the mode, not the mode.
  //
  // The second option is NOT called English, EN or Language, and the first is not called Full Names. `CN`, `US`,
  // `CA` and `BC` are geographic codes, and code mode falls back to the reviewed name for the 39% of divisions
  // that carry no certified code — so a language label would promise `China` and `British Columbia` and a
  // "full names" label would describe something the first mode does not always show either. `Names` and `Code`
  // are the two things actually painted.
  function renderLabelModeControl() {
    var cur = getLabelMode();
    function seg(v, txt, hint) {
      var on = cur === v;
      return '<button type="button" class="glm-seg__btn' + (on ? ' is-on' : '') + '" role="radio"' +
        ' aria-checked="' + (on ? 'true' : 'false') + '" tabindex="' + (on ? '0' : '-1') + '"' +
        ' data-labelmode="' + v + '" title="' + esc(hint) + '">' + esc(txt) + '</button>';
    }
    return '<div class="glm-mcp__sec"><span class="glm-mcp__lbl">Labels</span>' +
      '<div class="glm-seg" role="radiogroup" aria-label="Map labels: names or codes" data-glm="labelmode">' +
        seg('zh-TW', 'Names', 'Country and state / province labels in Traditional Chinese') +
        seg('code', 'Code', 'Country and state / province labels as geographic codes (CN, US, BC, TX)') +
      '</div></div>';
  }
  // Repaints the control IN PLACE. Deliberately not a render(): re-rendering the page would rebuild the panel,
  // drop focus, reset its scroll position and re-run every binding — for a change that affects two attributes
  // and one class on two buttons.
  function paintLabelModeControl() {
    var r = root(); if (!r) return;
    var cur = getLabelMode();
    try {
      r.querySelectorAll('[data-labelmode]').forEach(function (el) {
        var on = el.getAttribute('data-labelmode') === cur;
        el.setAttribute('aria-checked', on ? 'true' : 'false');
        el.setAttribute('tabindex', on ? '0' : '-1');
        if (el.classList) { if (on) el.classList.add('is-on'); else el.classList.remove('is-on'); }
      });
    } catch (e) {}
  }
  // MAP-VISUAL-REAL-EARTH-LOD-1 §H — ONE read-only diagnostics accessor for the whole map visual stack, so the
  // active tier, the active LOD, the label counts and any degradation reason are OBSERVABLE rather than guessed.
  // Pure read: it starts nothing, changes nothing, and calls no business API.
  function mapGlobeDiagnostics() {
    var g = state.globe;
    if (!g) return { available: false, reason: state.globeError || 'globe not created' };
    function safe(fn) { try { return fn(); } catch (e) { return null; } }
    return {
      available: true,
      render: safe(function () { return g.getRenderInfo(); }),
      texture: safe(function () { return g.getTextureInfo(); }),
      // MAP-VISUAL-REAL-EARTH-TEXTURE-2 §I - the Earth MATERIAL reports itself: the live tier and why it was
      // chosen, the source asset and its real dimensions, the decoded and GPU dimensions, whether a resample
      // happened, the estimated GPU cost, MAX_TEXTURE_SIZE, filter/mipmap/anisotropy state, the WebGL version,
      // how gamma is handled, the active layers, the high-detail load time, the effective magnification and the
      // resolution-derived zoom limit - plus any fallback reason and the context-loss counters. A blurred globe
      // then has an ANSWER instead of a guess about which of those went wrong.
      material: safe(function () { return g.getMaterialInfo(); }),
      lod: safe(function () { return g.getLodInfo(); }),
      country_layer: safe(function () { return g.getCountryLayerInfo(); }),
      admin1_layer: safe(function () { return g.getAdmin1LayerInfo(); }),
      admin1_asset: { state: state.admin1AssetState, error: state.admin1AssetError || null,
        borders_mode: state.admin1BordersMode, labels_mode: state.admin1LabelsMode },
      status: safe(function () { return g.getStatus(); })
    };
  }
  if (typeof window !== 'undefined') window.KM_MAP_GLOBE_DIAGNOSTICS = mapGlobeDiagnostics;

  function adm1Select(key, label) {
    var v = state[key];
    return '<label class="glm-field glm-field--panel"><span>' + esc(label) + '</span>' +
      '<select data-adm1="' + key + '" aria-label="' + esc(label) + '">' +
      ['auto', 'on', 'off'].map(function (o) {
        return '<option value="' + o + '"' + (v === o ? ' selected' : '') + '>' + (o === 'auto' ? 'Auto (by zoom)' : (o === 'on' ? 'Always on' : 'Off')) + '</option>';
      }).join('') + '</select></label>';
  }
  // A plain-language line so the operator can tell "not zoomed in far enough" apart from "the data did not load".
  function admin1StatusText() {
    if (state.admin1AssetState === 'FAILED') return 'State / province detail unavailable (' + (state.admin1AssetError || 'asset failed to load') + '). The map, routes and shipments are unaffected.';
    if (state.admin1AssetState === 'LOADING') return 'Loading state / province detail…';
    var auto = state.admin1BordersMode === 'auto' || state.admin1LabelsMode === 'auto';
    if (state.admin1AssetState === 'READY') return 'State / province detail ready.';
    if (auto) return 'State / province detail appears automatically as you zoom in.';
    return '';
  }

  // §H.4/§H.5 — LAZY, DECOUPLED ASSET LOAD. The ADM1 file is ~0.5 MB and is fetched only when the zoom level
  // first calls for it, as a same-origin <script> — so it is nowhere near the initial shipment workspace read,
  // it touches no business API, and a failure degrades this one reference layer and nothing else.
  // TEXTURE-3-R8 §A/§B — THE ADM1 URL IS THE ASSET'S OWN CONTENT DIGEST.
  //
  // This asset is the one browser file the page fetches that index.html never mentions, so it never received a
  // cache-busting token when the rest of the map set was versioned. It then CHANGED on the Map Texture 3 line
  // (18e46bb rebuilt the boundaries), which means a returning browser holding the old copy would keep drawing
  // the old divisions for as long as its cache lived, against a globe and a resolver that had both moved. R7
  // found this and could only recommend a hard refresh, which is advice, not a deployment policy.
  //
  // The token is the SHA-256 of the asset's committed bytes rather than a round label, because a round label
  // would have to be remembered and this cannot be forgotten: change the asset and the digest changes, so the
  // URL changes, so the browser refetches. Change nothing and the URL is stable, so nobody refetches 0.58 MB
  // for a round that did not touch it. `sha256sum assets/js/data/world-admin1-10m.js` reproduces it, which is
  // why .gitattributes now pins this file's line endings — see the R8 note there.
  //
  // The PATH stays a bare relative literal so the deployed GitHub Pages application resolves it same-origin
  // from whatever directory it is served under, exactly as before.
  var ADM1_ASSET_PATH = 'assets/js/data/world-admin1-10m.js';
  var ADM1_ASSET_TOKEN = 'adm1-10m-4d61535a9116';
  function adm1AssetUrl() { return ADM1_ASSET_PATH + '?v=' + encodeURIComponent(ADM1_ASSET_TOKEN); }

  // WHICH identity's bytes are in memory. `window.KM_WORLD_ADMIN1` cannot answer that question: the asset is
  // inert data that assigns one global, and EVERY version of it assigns the same global under the same name. A
  // stale unversioned <script> left in the document by an older deployment would therefore satisfy a plain
  // "is the global defined?" test with old boundaries and suppress the fetch of the new ones forever. So the
  // loader records what IT loaded, and trusts nothing it did not load itself.
  var adm1LoadedToken = '';

  // An existing element satisfies this request only if its src is EXACTLY the versioned URL. A path-only match
  // is the bug this guard exists to refuse: an unversioned tag, or one carrying a superseded digest, is a
  // DIFFERENT asset that happens to share a filename.
  //
  // INVARIANT that makes reuse safe: every failure path below removes its own element, so an element found here
  // is either still in flight or loaded successfully — and loaded successfully means adm1LoadedToken is already
  // set and the in-memory branch returned before we got here. Finding one therefore means IN FLIGHT, and the
  // right move is to wait on it rather than fetch half a megabyte twice.
  function adm1ScriptEl(url) {
    try {
      var all = document.querySelectorAll('script[src*="world-admin1-10m.js"]');
      for (var i = 0; i < all.length; i++) {
        if ((all[i].getAttribute('src') || '') === url) return all[i];
      }
    } catch (e) {}
    return null;
  }

  function ensureAdmin1Asset() {
    if (state.admin1AssetState === 'LOADING' || state.admin1AssetState === 'READY') return;
    // Reuse data already in memory ONLY when this loader put it there at the CURRENT identity.
    if (typeof window !== 'undefined' && window.KM_WORLD_ADMIN1 && adm1LoadedToken === ADM1_ASSET_TOKEN) {
      attachAdmin1(window.KM_WORLD_ADMIN1); return;
    }
    if (typeof document === 'undefined') return;
    var url = adm1AssetUrl();
    function dropAdm1El() {
      // Leaving a failed element behind would break the in-flight invariant above and let a corpse answer the
      // next request. Removing it also means a retry injects exactly one script, never a second.
      try { var e = adm1ScriptEl(url); if (e && e.parentNode) e.parentNode.removeChild(e); } catch (e2) {}
    }
    function onLoaded() {
      if (window.KM_WORLD_ADMIN1) { adm1LoadedToken = ADM1_ASSET_TOKEN; attachAdmin1(window.KM_WORLD_ADMIN1); return; }
      dropAdm1El(); state.admin1AssetState = 'FAILED';
      state.admin1AssetError = 'asset loaded but defined no data'; renderAdmin1Note();
    }
    function onFailed() {
      dropAdm1El(); state.admin1AssetState = 'FAILED';
      state.admin1AssetError = 'asset could not be fetched'; renderAdmin1Note();
    }
    // A deliberate retry after a failure must not inherit the previous attempt's reason, or the note would
    // report the old cause and attachAdmin1's `!state.admin1AssetError` guard would decline to set the new one.
    state.admin1AssetError = '';
    state.admin1AssetState = 'LOADING'; renderAdmin1Note();
    // SINGLE FLIGHT ACROSS THE DOM, not only across `state`. `state` already coalesces callers within one page
    // instance (it is set to LOADING synchronously, before the append below, so a second synchronous caller
    // returns at the first line). This covers the case `state` cannot see: a load still in flight from an
    // earlier mount, where re-injecting would fetch the same half-megabyte twice.
    var existing = adm1ScriptEl(url);
    if (existing) { existing.onload = onLoaded; existing.onerror = onFailed; return; }
    var el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.onload = onLoaded;
    el.onerror = onFailed;
    try { document.head.appendChild(el); } catch (e) { state.admin1AssetState = 'FAILED'; state.admin1AssetError = 'script injection blocked'; }
  }
  function attachAdmin1(data) {
    var ok = false;
    try { ok = !!(state.globe && state.globe.setAdmin1Data && state.globe.setAdmin1Data(data)); } catch (e) { ok = false; }
    state.admin1AssetState = ok ? 'READY' : 'FAILED';
    if (!ok && !state.admin1AssetError) state.admin1AssetError = 'boundary buffer could not be built';
    renderAdmin1Note();
  }
  function renderAdmin1Note() {
    try {
      var el = document.querySelector('[data-glm="adm1-note"]');
      if (el) el.textContent = admin1StatusText();
    } catch (e) {}
  }

  // Map filters: destination country replaces the old warehouse-name filter.
  // Search, company, carrier, method and ETA retain their existing semantics.
  // (frozen ETA range) · clear-filters. Removed controls (Origin / Status / Stage / Exception·Delayed·Arriving
  // checkboxes) are NOT reintroduced. Stacked full-width for the panel (no horizontal overflow).
  function renderPanelFilters() {
    var vms = allVms(), f = state.filters, PC = 'glm-field--panel';
    return '<div class="glm-pfilters" role="group" aria-label="Shipment filters">' +
      '<label class="glm-field glm-field--panel glm-field--search"><span>Search</span><input type="text" data-filter="search" value="' + esc(f.search) + '" placeholder="Shipment / Tracking / Container…"></label>' +
      selHtml('Company', 'company', optSet(vms, function (v) { return v.company; }), f.company, PC) +
      selHtml('Destination Country', 'destCountry', optSet(vms, function (v) { return v.destCountry; }), f.destCountry, PC) +
      selHtml('Carrier', 'carrier', optPairs(vms, function (v) { return v.carrier; }, function (v) { return v.carrierLabel; }), f.carrier, PC) +
      selHtml('Method', 'method', optPairs(vms, function (v) { return v.method; }, function (v) { return enumDisplay('shippingMethod', v.method); }), f.method, PC) +
      '<label class="glm-field glm-field--panel glm-field--eta"><span>ETA Date</span><span class="glm-eta-range">' +
        '<input type="date" data-filter="etaFrom" value="' + esc(f.etaFrom) + '" aria-label="ETA from">' +
        '<span class="glm-eta-range__sep" aria-hidden="true">–</span>' +
        '<input type="date" data-filter="etaTo" value="' + esc(f.etaTo) + '" aria-label="ETA to"></span></label>' +
      '<button type="button" class="glm-btn glm-btn--small glm-pfilters__clear" data-act="clear-filters">Clear Filters</button>' +
      '</div>';
  }

  // ---------- shipment list + pending tray ----------
  /* =================================================================================================
     TEXTURE-3-R10 — TRANSPORT MODE ICONS. PRESENTATION ONLY.

     WHAT THIS READS. `shipment_routes.transport_mode` (normalized to `node.transportMode`) is the
     canonical LEG-level field: SHIPMENT_DATABASE_SCHEMA lists it as an enum of air / sea / truck, and a
     route carries one row per node, so an ocean leg followed by an inland leg really are two values on
     one shipment. Where a leg has none, the shipment-level shipping method (`vm.method`) answers instead.
     Nothing here is written back, and no stored value is changed to match a label.

     WHY THE TOKEN LIST LOOKS LIKE THIS. It mirrors the server-side transport classifier that already owns
     this exact question for the seeded route data, rather than inventing a second vocabulary for the same
     field. (Named generically on purpose: this page carries no backend reference, and a guard enforces
     that.) ONE DELIBERATE DIFFERENCE: that classifier folds parcel / courier / last-mile into `truck`,
     because for ITS purpose — which corridor a leg uses — they are the same thing. For a map icon they are
     not, so parcel is split out and is tested FIRST, since every parcel token would otherwise be caught by
     the truck branch.

     THE CJK FRAGMENTS are the ones `shipMode` below has always used. They are single characters used as
     classification hints, never operator method labels: A0 §G.9 bans spelling the labels themselves
     (co1100r-live-hydration-closure E12), and nothing here does.

     WHY THIS IS NOT MERGED INTO `shipMode`. `shipMode` owns the tooltip's DISPLAY TEXT and returns the
     raw method verbatim when it recognises nothing. Routing it through these classes would change the
     tooltip wording for parcel and rail methods that currently print raw — a tooltip regression this
     task forbids. They read the same field and answer different questions, so they stay separate. */
  var TRANSPORT_ICONS = { air: '\u2708\uFE0F', rail: '\uD83D\uDE86', parcel: '\uD83D\uDCE6',
                          truck: '\uD83D\uDE9A', sea: '\uD83D\uDEA2' };

  function transportClass(mode) {
    var m = low(mode);
    if (!m) return 'unknown';
    if (/air|flight|\u7a7a/.test(m)) return 'air';
    if (/rail|train/.test(m)) return 'rail';
    // BEFORE truck, deliberately — see above.
    if (/parcel|courier|express|last.?mile|small.?package/.test(m)) return 'parcel';
    if (/truck|road|inland|land|ground|ltl|ftl|drayage|\u9678/.test(m)) return 'truck';
    if (/sea|ocean|maritime|vessel|container|fcl|lcl|barge|\u6d77/.test(m)) return 'sea';
    return 'unknown';
  }

  /* One glyph for a transport mode, or '' when the mode is blank or unrecognised.
     '' IS THE FALLBACK AND IT IS THE POINT: the renderer draws no glyph, so the shipment keeps the
     generic marker it has always had. No shipment can leave the map because its mode is unreadable. */
  function getShipmentTransportIcon(mode) {
    return TRANSPORT_ICONS[transportClass(mode)] || '';
  }

  /* The mode of the leg the marker STANDS ON, which is the whole of §3. A shipment in ocean transit with
     an inland leg still to come is on the ocean leg, and collapsing it to one shipment-level mode would
     draw the wrong icon for most of its journey. The current node's own transport_mode is therefore
     preferred, then the last completed one, and only then the shipment-level method. */
  function legMode(vm) {
    if (!vm) return '';
    var cur = vm.currentNode && vm.currentNode.transportMode;
    if (cur) return cur;
    var done = vm.lastCompleted && vm.lastCompleted.transportMode;
    if (done) return done;
    return vm.method || '';
  }
  function shipMode(vm) { var m = low(vm.method); if (/air|flight|空/.test(m)) return 'Air'; if (/sea|ocean|vessel|海|fcl|lcl/.test(m)) return 'Sea'; if (/truck|ground|road|land|陸/.test(m)) return 'Ground'; return vm.method || '—'; }
  function renderShipmentList() {
    var vms = filteredVms();
    vms.sort(function (a, b) { return (b.flags.exception - a.flags.exception) || (b.flags.delayed - a.flags.delayed) || ((a.etaMs || Infinity) - (b.etaMs || Infinity)); });
    if (!vms.length) {
      var anyUniverse = allVms().filter(function (v) { return !v.track || v.track.active; }).length;   // A final3 (TC-C)
      return '<div class="glm-panel"><h3 class="glm-panel__title">Shipments (0)</h3>' + (state.doneNotice ? '<p class="glm-muted" role="status">' + esc(state.doneNotice) + '</p>' : '') + '<p class="glm-muted">' +
        (anyUniverse ? 'No shipments match the current filters.' : 'No shipments are on the way yet. This is a formal empty state — no demo shipment is drawn.') + '</p></div>';
    }
    var rows = vms.map(function (v) {
      var pl = resolveShipmentPlacement(v);
      var flag = v.flags.exception ? '<span class="glm-badge glm-badge--danger">Exception</span>' : (v.flags.delayed ? '<span class="glm-badge glm-badge--danger">Delayed</span>' : (v.flags.arrivingSoon ? '<span class="glm-badge glm-badge--good">Arriving Soon</span>' : ''));
      var posBadge = pl.kind === 'pending' ? '<span class="glm-badge glm-badge--pending">Coord Pending</span>' : (pl.kind !== 'current' ? '<span class="glm-badge glm-badge--neutral">' + esc(pl.kind) + '</span>' : '');
      // §12/§13 — restrained per-shipment issue pill (route history incomplete). Coordinate-pending keeps its own
      // Coord Pending badge (above); this pill flags the route-data gap so the user sees WHICH shipment has it.
      var issues = glmShipmentIssues({ nodeCount: v.nodes.length, placementKind: pl.kind, opening: v.opening, displayOnly: v.openingDisplayOnly, asOf: glmDisplayDate_(v.openingAsOf) });
      var issueBadge = issues.types.some(function (t) { return t.code === 'NO_ROUTE_NODES'; }) ? '<span class="glm-badge glm-badge--issue" title="Route history incomplete">⚠ Route Issue</span>'
        : (issues.types.some(function (t) { return t.code === 'OPENING_NO_ROUTE_HISTORY'; }) ? '<span class="glm-badge glm-badge--neutral" title="No route data">無路線資料</span>' : '');
      var receiptLines = shipmentLinesFor(v.shipmentId), receiptFacts = glmReceiptFacts_(receiptLines), receiptProgress = '';
      if (receiptFacts.lines && receiptFacts.code !== 'LINE_QTY_INVALID') {
        var shippedTotal = 0, receivedTotal = 0, remainingTotal = 0;
        receiptLines.filter(function (l) { return !l.lineRemoved; }).forEach(function (l) {
          var q = Number(l.shipmentQty) || 0, r = Number(l.shipmentReceivedQty) || 0;
          shippedTotal += q; receivedTotal += r; remainingTotal += Math.max(q - r, 0);
        });
        receiptProgress = '<div class="glm-ship__meta" data-glm="receipt-progress">Received ' + num(receivedTotal) + ' / ' + num(shippedTotal) + ' · Remaining ' + num(remainingTotal) + '</div>';
      }
      // backend-derived shipment status (never computed here) — Partially Received / Received are visibly distinct.
      var st = low(v.status), stCls = st ? st.replace(/[^a-z0-9]+/g, '-') : 'unknown';
      if (v.display && v.display.key === 'arrived') stCls = 'arrived';   // A-DELTA1 C2 item 1
      var statusPill = '<span class="glm-ship__status glm-ship__status--' + stCls + '"' + (v.display && v.display.projected ? ' title="依路線判定（狀態欄未寫入）"' : '') + '>' + esc((v.display && v.display.key === 'arrived') ? v.display.label : (enumDisplay('status', v.status) || '—')) + '</span>';
      // R11 §9/§12 — ROW 1: Shipment ID alone (full card width). ROW 2: compact badges (status · flags · issue ·
      // coord pending) — never competing with the ID width. ROW 3+: route / method / stage · ETA.
      return '<div class="glm-ship' + (state.selectedShipmentId === v.shipmentId ? ' is-selected' : '') + '" data-ship="' + esc(v.shipmentId) + '" tabindex="0" role="button" aria-label="' + esc(glmAccessibleName_(v)) + '">' +
        '<div class="glm-ship__idrow"><span class="glm-ship__no">' + esc(v.displayNo) + '</span>' + (v.displayNoShared ? ' <span class="glm-muted">· ' + esc(v.shipmentId) + '</span>' : '') + '</div>' +
        '<div class="glm-ship__badges">' + statusPill + flag + glmTrackBadge_(v) + issueBadge + posBadge + '</div>' +
        '<div class="glm-ship__route">' + esc(glmOriginText_(v)) + ' → ' + esc(v.destCountry || v.destWarehouse || '?') + '</div>' +
        '<div class="glm-ship__meta">' + esc(v.carrierLabel || '—') + ' · ' + esc(enumDisplay('shippingMethod', shipMode(v))) + '</div>' +
        receiptProgress +
        '<div class="glm-ship__meta">Stage: <strong>' + esc(v.stage) + '</strong> · ETA: ' + esc(glmDisplayDate_(v.eta) || (v.opening ? '未知 (unknown)' : '—')) + '</div>' +
        '</div>';
    }).join('');
    return '<div class="glm-panel"><h3 class="glm-panel__title">Shipments (' + vms.length + ')</h3>' + (state.doneNotice ? '<p class="glm-muted" role="status">' + esc(state.doneNotice) + '</p>' : '') + '<div class="glm-shiplist">' + rows + '</div></div>';   // A final3 (TC-C)
  }

  // ---------- map shell (persistent WebGL globe host) ----------
  function renderMapShell() {
    // R12 — the map surface holds: the WebGL globe, the tooltip, ONE consolidated Map Control Panel (upper-left:
    // View · Filters · Layers · Legend), and the right-side zoom controls (kept SEPARATE from the panel — §11).
    // The former standalone Map View selector, layer toggles and bottom-left legend are consolidated into the panel.
    return '' +
      '<div class="glm-globe-slot" data-glm="globe-slot"></div>' +
      '<div class="glm-tip" data-glm="tip" aria-hidden="true"></div>' +
      glmSelectionChipHtml_() +   // MAP-FOCUS-1
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
      row('customs', 'Customs') + row('exc', 'Exception / delayed') + row('endpoint', 'Origin / destination endpoint') + row('ref', 'Reference location') +
      // MAP-COUNTRY-BOUNDARY-1 §H — say what the country layer IS, so an ISO label is never read as a shipment node.
      '<p class="glm-legend__note">Country borders and ISO labels (US, CN, …) are a geographic reference only — ' +
      'they are not shipment nodes, warehouses or route points, and they carry no shipment data.</p>';
  }

  // ---------- globe management (persist across re-renders) ----------
  function detachGlobe() { if (state.globeHost && state.globeHost.parentNode) { _glmDiag.detaches++; try { state.globeHost.parentNode.removeChild(state.globeHost); } catch (e) {} } }
  function attachGlobe() {
    var r = root(); if (!r) return;
    var slot = r.querySelector('[data-glm="globe-slot"]'); if (!slot) return;
    if (!state.globeHost) { state.globeHost = document.createElement('div'); state.globeHost.className = 'glm-globe-host'; bindGlobeTooltip(state.globeHost); }
    slot.appendChild(state.globeHost);
    _glmDiag.attaches++;
    if (!state.globe && !state.globeError) {
      if (!(window.KMGlobe && window.KMGlobe.isSupported && window.KMGlobe.isSupported())) {
        state.globeError = 'This browser/GPU does not support WebGL, so the 3D Earth cannot be rendered.';
      } else {
        _glmDiag.globeCreates++;
        state.globeInstanceId = ++_glmInstanceSeq;
        state.globe = window.KMGlobe.create(state.globeHost, {
          reducedMotion: prefersReducedMotion(),
          onError: function (kind, msg) {
            if (kind === 'contextlost') _glmDiag.contextLost++;
            _glmDiag.globeDestroys++;
            state.globe = null; state.globeInstanceId = 0;
            state.globeError = globeErrText(kind, msg); showGlobeError();
          },
          onMarkerClick: function (id) { onPinClick(id); },
          onMarkerHover: function (id) { showTip(id); },
          admin1Borders: state.admin1BordersMode,
          admin1Labels: state.admin1LabelsMode,
          // §H.3 — fires ONLY when the level actually changes, never per frame.
          onLodChange: function (lod) {
            state.admin1Lod = lod;
            if (lod >= 2) ensureAdmin1Asset();
          }
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
    var b = host.querySelector('[data-act="globe-retry"]'); if (b) b.onclick = function () { if (state.globe) _glmDiag.globeDestroys++; state.globeError = ''; state.globe = null; state.globeInstanceId = 0; host.innerHTML = ''; attachGlobe(); };
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
      if (sel && sel.track && !sel.track.active) sel = null;   // A final3 (TC-C): an exited shipment is never drawn as the selection
      if (sel) { buildSelectedShipment(sel, markers, arcs, focusPts); }
      else {
        state.renderedIds = {};   // A final3 (Owner item 4): which shipments were handed to the globe (render-failure classification)
        filteredVms().forEach(function (v) {
          var pl = resolveShipmentPlacement(v); if (pl.kind === 'pending') return; state.renderedIds[v.shipmentId] = true;
          var isCur = pl.kind === 'current';
          var color = v.flags.exception || v.flags.delayed ? COL.exc : (isCur ? COL.pos : COL.endpoint);
          markers.push({ id: v.shipmentId, lat: pl.lat, lng: pl.lng, color: color, size: isCur ? 16 : 13, elev: 1.024, ring: false,
            icon: getShipmentTransportIcon(legMode(v)) });   // runtime priority: larger + higher elev than reference
          focusPts.push([pl.lat, pl.lng]);
        });
      }
    }
    try { state.globe.setMarkers(markers); state.renderError = ''; } catch (eR3_) { state.renderError = String((eR3_ && eR3_.name) || 'Error'); state.renderedIds = {}; throw eR3_; }   // A final3 (Owner item 4)
    state.globe.setArcs(state.showPlannedRoute || state.mode !== 'runtime' ? arcs : []);
    updateCountryLayers();
    // one-time initial framing per data load: focus the primary distribution, else global overview
    if (!state.didFocus) {
      state.didFocus = true;
      var selVm15 = (state.mode === 'runtime' && state.selectedShipmentId) ? state.vms[state.selectedShipmentId] : null;   // MAP-FOCUS-1
      if (selVm15) { state.lastFocus = { shipmentId: selVm15.shipmentId, result: glmFocusSelected_(selVm15), refresh: true }; }
      else if (focusPts.length) { var c = centroid(focusPts); state.globe.focus(c.lat, c.lng, { dist: focusPts.length > 1 ? 2.9 : 2.4 }); }
      else state.globe.overview();
    }
  }
  // MAP-COUNTRY-BOUNDARY-1 §F/§G — hand the globe the two independent toggles and the country PRIORITY sets.
  // This reads country FIELDS that already exist on the shipment view-model; it never writes one, never derives a
  // coordinate from one, and a value that does not resolve to a dataset ISO code is simply dropped.
  function updateCountryLayers() {
    if (!state.globe || typeof state.globe.setCountryLayers !== 'function') return;
    state.globe.setCountryLayers({ borders: !!state.showCountryBorders, labels: !!state.showCountryLabels });
    // TEXTURE-3-R9 — pushed HERE rather than at create time, so one line covers globe creation, every remount
    // and every layer update. The setter is idempotent and returns early when the mode has not moved, so this
    // costs nothing on the paths where nothing changed.
    if (typeof state.globe.setLabelMode === 'function') {
      try { state.globe.setLabelMode(getLabelMode()); } catch (e) {}
    }
    if (typeof state.globe.setAdmin1Layers === 'function') {
      state.globe.setAdmin1Layers({ borders: state.admin1BordersMode, labels: state.admin1LabelsMode });
      // "Always on" is a request to see the layer NOW, so it must fetch the asset regardless of zoom.
      if (state.admin1BordersMode === 'on' || state.admin1LabelsMode === 'on') ensureAdmin1Asset();
    }
    var active = [], selected = [], nodes = [];
    try {
      var sel = state.selectedShipmentId ? state.vms[state.selectedShipmentId] : null;
      if (sel) {
        [sel.originCountry, sel.destCountry].forEach(function (c) { if (c) selected.push(c); });
        (sel.nodes || []).forEach(function (n) { if (n && n.country) nodes.push(n.country); });
      }
      // "Active" = the origin/destination of every shipment currently ON the map, so an operator can always read
      // where the live work is even when zoomed out past the normal label tier.
      filteredVms().forEach(function (v) {
        if (v.originCountry) active.push(v.originCountry);
        if (v.destCountry) active.push(v.destCountry);
      });
    } catch (e) {}
    state.globe.setCountryPriority({ active: active, selected: selected, nodes: nodes, high: [] });
  }

  function buildSelectedShipment(vm, markers, arcs, focusPts) {
    var seq = [];
    vm.nodes.forEach(function (n) {
      var c = resolveNodeCoord(n); if (!c.drawable) return;
      var sc = nodeStatusClass(n.status), t = low(n.nodeType);
      var color = sc === 'exception' ? COL.exc : (/customs|clearance/.test(t) ? COL.customs : (sc === 'completed' || sc === 'current' ? COL.done : COL.upcoming));
      // Each node carries its OWN leg mode, so a multi-leg route draws a different icon per leg.
      markers.push({ id: 'node:' + n.shipmentRouteId, lat: c.lat, lng: c.lng, color: color, size: 11, elev: 1.02,
        icon: getShipmentTransportIcon(n.transportMode) });
      seq.push([c.lat, c.lng]); focusPts.push([c.lat, c.lng]);
    });
    if (state.showPlannedRoute && seq.length > 1) arcs.push({ points: seq, color: vm.flags.exception ? COL.exc : COL.pos });
    var pos = resolveCurrentPosition(vm);
    if (pos.drawable) { markers.push({ id: 'pos:' + vm.shipmentId, lat: pos.lat, lng: pos.lng, color: vm.flags.exception || vm.flags.delayed ? COL.exc : COL.pos, size: 18, elev: 1.03, ring: true,
      icon: getShipmentTransportIcon(legMode(vm)) }); focusPts.push([pos.lat, pos.lng]); }
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
    else { var sid = id.replace(/^(node:|pos:)/, ''); var vm = state.vms[sid] || (state.selectedShipmentId ? state.vms[state.selectedShipmentId] : null); if (vm) html = '<strong>' + esc(vm.displayNo) + '</strong>' + (vm.displayNoShared ? ' (' + esc(vm.shipmentId) + ')' : '') + '<br>' + esc(vm.company || '') + '<br>' + esc((vm.originCountry || vm.shipFrom || '?') + ' → ' + (vm.destCountry || vm.destWarehouse || '?')) + '<br>' + esc(enumDisplay('status', vm.status)) + ' · ' + esc(enumDisplay('shippingMethod', shipMode(vm))) + '<br>ETA ' + esc(glmDisplayDate_(vm.eta) || '—'); }
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
  // MAP-FOCUS-1 (Owner): a card click selects at once and focuses the CURRENT position into the part of the globe the side
  // panel leaves visible. With no current position the camera does NOT move to the destination / origin (an endpoint is never
  // a position): the selection chip says "尚無位置資訊", and a separately labelled button may show the planned route.
  // Every key stays the internal shipmentId; the same globe instance and its focus() are reused; nothing is read or polled.
  function selectShipment(id) {
    var seq = ++state.selectSeq;
    var beforeRoot = root(), beforeList = beforeRoot && beforeRoot.querySelector('.glm-shiplist');
    var listTop = beforeList ? beforeList.scrollTop : 0, scrolls = [], parent = beforeRoot;
    while (parent) { if (parent.scrollHeight > parent.clientHeight) scrolls.push({ node: parent, top: parent.scrollTop, left: parent.scrollLeft }); parent = parent.parentElement; }
    function restoreScroll() {
      if (seq !== state.selectSeq) return;
      var list = root() && root().querySelector('.glm-shiplist'); if (list) list.scrollTop = listTop;
      scrolls.forEach(function (s) { s.node.scrollTop = s.top; s.node.scrollLeft = s.left; });
    }
    var ae = document.activeElement, cardHadFocus = !!(ae && ae.getAttribute && ae.getAttribute('data-ship') !== null);
    state.selectedShipmentId = id; state.doneNotice = '';
    render();
    if (seq !== state.selectSeq) return;
    var vm = state.vms[id], r = root();
    if (cardHadFocus && r) { var card = r.querySelector('[data-ship="' + cssEsc(id) + '"]'); if (card) try { card.focus({ preventScroll: true }); } catch (e) {} }
    // The side panel opens only when the globe keeps a visible area beside it. Measured at 1280 px: the panel (420) plus the map control panel
    // leave NO visible globe, so there - as on a phone - the selection stays on the map and the panel opens from the chip's Details.
    if (!glmNarrow_() && glmRoomBesidePanel_()) openShipmentDrawer(id);
    else { if (typeof drawerOpen === 'function' && drawerOpen()) closeDrawer(); }
    if (vm) state.lastFocus = { shipmentId: id, result: glmFocusSelected_(vm) };
    restoreScroll();
    if (window.requestAnimationFrame) window.requestAnimationFrame(restoreScroll);
  }
  function glmNarrow_() { try { return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches); } catch (e) { return false; } }
  function glmRevealMap_() { var r = root(), w = r && r.querySelector('.glm-mapwrap'); if (w && w.scrollIntoView) try { w.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
  // The part of the globe canvas that is on screen and covered by neither the open side panel nor the in-map control panel, inset by a margin.
  // (Measured in a real browser: at 1280 px the map column is ~615 px wide and the control panel alone covers the canvas centre.)
  function glmRoomBesidePanel_() { var cv = state.globeHost && state.globeHost.querySelector('canvas'); if (!cv) return false; var f = glmFreeRect_(cv.getBoundingClientRect(), true); return !!(f && f.w >= 160 && f.h >= 160); }
  function glmFreeRect_(cr, assumePanelOpen) {
    var vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    var L = Math.max(cr.left, 0), R = Math.min(cr.right, vw), T = Math.max(cr.top, 0), B = Math.min(cr.bottom, vh), r = root();
    var dr = r && r.querySelector('[data-glm="drawer"]');
    if (dr && (assumePanelOpen === true || dr.classList.contains('is-open')) && dr.offsetWidth) R =Math.min(R, Math.max(L, vw - dr.offsetWidth));   // fixed right:0; its FINAL edge, not mid-slide
    var mcp = r && r.querySelector('.glm-mcp');
    if (mcp && mcp.offsetWidth) { var m = mcp.getBoundingClientRect();
      if (m.right > L && m.left < R && m.bottom > T && m.top < B) {   // the panel overlaps what is left: keep the larger of "right of it" and "below it"
        var right = { L: Math.max(L, m.right), R: R, T: T, B: B }, below = { L: L, R: R, T: Math.max(T, m.bottom), B: B };
        var area = function (q) { return Math.max(0, q.R - q.L) * Math.max(0, q.B - q.T); }, best = area(right) >= area(below) ? right : below;
        L = best.L; R = best.R; T = best.T; B = best.B; } }
    var g = 24; L += g; R -= g; T += g; B -= g;
    return (R - L >= 60 && B - T >= 60) ? { x: L, y: T, w: R - L, h: B - T } : null;
  }
  // The aim point whose focus() puts (lat,lng) at the centre of the free rect - solved with the engine's OWN math (KMGlobe.math).
  function glmAimFor_(lat, lng, dist) {
    var M = window.KMGlobe && window.KMGlobe.math, cv = state.globeHost && state.globeHost.querySelector('canvas');
    if (!M || !M.projectToScreen || !cv) return null;
    var cr = cv.getBoundingClientRect(); if (cr.width < 40 || cr.height < 40) return null;
    var fr = glmFreeRect_(cr); if (!fr) return null;
    var W = cr.width, H = cr.height, D = Math.PI / 180, tx = fr.x + fr.w / 2 - cr.left, ty = fr.y + fr.h / 2 - cr.top;
    var v = M.latLngToVec3(lat, lng, 1.03), pv = M.mat4Mul(M.mat4Perspective(45 * D, W / H, 0.01, 100), M.mat4Translate(0, 0, -dist));
    function at(a, b) { var model = M.modelMatrix(-b * D, Math.max(-1.5, Math.min(1.5, a * D))), p = M.projectToScreen(M.mat4Mul(pv, model), model, v, W, H); return p && p.front ? p : null; }
    var a = lat, b = lng, h = 0.25;
    for (var i = 0; i < 14; i++) {
      var p = at(a, b); if (!p) return null;
      var ex = p.x - tx, ey = p.y - ty; if (Math.abs(ex) < 1 && Math.abs(ey) < 1) break;
      var pa = at(a + h, b), pb = at(a, b + h); if (!pa || !pb) return null;
      var j11 = (pa.x - p.x) / h, j21 = (pa.y - p.y) / h, j12 = (pb.x - p.x) / h, j22 = (pb.y - p.y) / h, det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-9) return null;
      var da = (j22 * ex - j12 * ey) / det, db = (-j21 * ex + j11 * ey) / det, st = Math.max(Math.abs(da), Math.abs(db));
      if (st > 15) { da *= 15 / st; db *= 15 / st; }
      a = Math.max(-85, Math.min(85, a - da)); b = b - db;
    }
    var f = at(a, b);
    return (f && Math.abs(f.x - tx) < 6 && Math.abs(f.y - ty) < 6) ? { lat: a, lng: b, x: Math.round(cr.left + tx), y: Math.round(cr.top + ty) } : null;
  }
  function glmFocusSelected_(vm) {
    if (!state.globe || !vm) return 'NO_GLOBE';
    var pos = resolveCurrentPosition(vm); if (!pos.drawable) return 'NO_POSITION';   // never an endpoint, never a centroid
    var d = 2.2, aim = glmAimFor_(pos.lat, pos.lng, d);
    if (aim) state.globe.focus(aim.lat, aim.lng, { dist: d }); else state.globe.focus(pos.lat, pos.lng, { dist: d });
    return aim ? 'FOCUSED_VISIBLE' : 'FOCUSED_CENTRE';
  }
  function glmReportedAge_(at) {
    var t = Date.parse(String(at || '').trim().replace(' ', 'T')); if (!isFinite(t)) t = parseDate(at); if (!isFinite(t) || t == null) return '';
    var hrs = (Date.now() - t) / 3600000; if (hrs < 0) return '';
    return hrs < 1 ? ' (within 1 h)' : hrs < 48 ? ' (' + Math.round(hrs) + ' h ago' + (hrs >= 6 ? ' - may be outdated' : '') + ')' : ' (' + Math.round(hrs / 24) + ' d ago - outdated, not live)';
  }
  function glmSelectionChipHtml_() {
    if (state.mode !== 'runtime' || !state.selectedShipmentId) return '';
    var vm = state.vms[state.selectedShipmentId]; if (!vm) return '';
    var pos = resolveCurrentPosition(vm), hasRoute = vm.nodes.some(function (n) { return resolveNodeCoord(n).drawable; });
    var line = pos.drawable ? ('Last reported: ' + (pos.at ? esc(glmDisplayDate_(pos.at) || '--') : 'time unknown')) : '尚無位置資訊';
    var btn = 'style="font-size:11px;padding:3px 8px;"';
    return '<div class="glm-selchip" data-glm="selchip" role="status" aria-live="polite" data-sel="' + esc(vm.shipmentId) + '" data-pos="' + (pos.drawable ? '1' : '0') + '" ' +
      'style="position:absolute;left:12px;bottom:12px;z-index:7;max-width:calc(100% - 24px);box-sizing:border-box;background:rgba(10,14,23,0.94);color:#E2E8F0;border:1px solid rgba(148,163,184,0.35);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;">' +
      '<strong>' + esc(vm.displayNo) + '</strong>' + (vm.displayNoShared ? ' <span style="opacity:.75;">(' + esc(vm.shipmentId) + ')</span>' : '') +
      '<br><span data-glm="selchip-pos">' + line + '</span>' +
      '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">' +
      (!pos.drawable && hasRoute ? '<button type="button" class="glm-btn" data-act="sel-route" ' + btn + '>View planned route (not a position)</button>' : '') +
      '<button type="button" class="glm-btn" data-act="sel-details" ' + btn + '>Details</button></div></div>';
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
      var keepDrawerOpen = drawerOpen();
      try { buildReadModel(); } catch (e) {}
      if (_glmBusy[shipmentId]) _glmBusy[shipmentId].readOk = true;   // A final4: the scoped re-read succeeded
      if (_glmPosChecks[shipmentId]) _glmPosChecks[shipmentId].readOk = true;   // a3 (REVIEW_A1 MAJOR-1) / a4 (MAJOR-A): only THIS shipment's successful re-read lets ITS position check decide
      var v8_ = state.vms[shipmentId], sel4_ = !state.selectedShipmentId || state.selectedShipmentId === shipmentId;
      if (v8_ && v8_.track && !v8_.track.active && sel4_) { state.selectedShipmentId = ''; state.doneNotice = '已全數收貨，可至 Shipment Overview 查看'; if (drawerOpen()) closeDrawer(); render(); }   // A final3 (TC-C): only after the re-read shows the authoritative full receipt
      else if (v8_ && sel4_) { selectShipment(shipmentId); if (keepDrawerOpen && !drawerOpen()) openShipmentDrawer(shipmentId); }
      else if (v8_) render(); else { if (sel4_) state.selectedShipmentId = ''; render(); }   // Never switch to a different selected shipment.
    };
    if (_glmEffectiveWorkspace()) {
      // F1-7M-B2-1: bounded post-write readback — re-read ONLY the written shipment (filters.shipmentId; routes+events
      // scoped to it server-side) and merge its mutable facts into the held read-model, RETAINING the static reference
      // tables (locations / route templates / nodes) already loaded — instead of the full size-3000 workspace + all
      // includes. Server stays authoritative for the shipment's rows. First load (no held model) / any failure / a
      // not-found bounded result → full ensureDb refresh (fresh, never a silent stale).
      if (_glmReadModel) { _glmBoundedReadback_(shipmentId, _rebuild); return; }
      ensureDb(true, function (ok) { if (ok) _rebuild(); else glmReadFailed_(shipmentId); }); return;   // a4 (MINOR-A)
    }
    if (_glmBusy[shipmentId] || _glmPosChecks[shipmentId]) { ensureDb(true, function (ok) { if (ok && !(window._opDbCache && window._opDbCache._apiFailed)) _rebuild(); else glmReadFailed_(shipmentId); }); return; }   // a3 (REVIEW_A1 MAJOR-1): a pending outcome is decided only by a FRESH read (legacy mode too); a4 (MINOR-B): a cache kept after a failed reload is not a read
    _rebuild();
  }
  function _glmBoundedReadback_(shipmentId, rebuild) {
    if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { ensureDb(true, function (ok) { if (ok) rebuild(); else glmReadFailed_(shipmentId); }); return; }
    var mySeq = ++_glmReadSeq;
    Promise.resolve(window.KM.api.getWorkspace('shipment', { filters: { shipmentId: shipmentId }, include: { routes: true, events: true, planDates: true } })).then(function (env) {
      if (mySeq !== _glmReadSeq) return;   // superseded by a newer read
      if (env && env.success && _glmReadModel && _glmMergeShipment_(shipmentId, window.KM.DB.adaptShipmentWorkspace(env.data))) { rebuild(); }
      else { ensureDb(true, function (ok) { if (ok) rebuild(); else glmReadFailed_(shipmentId); }); }   // not-found / miss → fresh full refresh
    }).catch(function () { if (mySeq !== _glmReadSeq) return; ensureDb(true, function (ok) { if (ok) rebuild(); else glmReadFailed_(shipmentId); }); });
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
    return true;   // logisticsLocations / templates / nodes / warehouses / carrierRateCards / carriers → RETAINED
  }
  function receiptMsg(text, tone) {
    if (_glmMsgFor !== null && _glmMsgFor !== state.selectedShipmentId) return;   // A final4: a late answer never writes into another shipment's panel
    var el = document.querySelector('[data-glm="receipt-msg"]'); if (!el) return;
    el.textContent = text || ''; el.className = 'glm-receipt-msg' + (tone ? ' glm-receipt-msg--' + tone : '');
  }
  // F1-7N-FB-4A §G — ETA status line, rendered at the ETA control itself.
  function etaMsg(text, tone) {
    if (_glmMsgFor !== null && _glmMsgFor !== state.selectedShipmentId) return;   // A final4
    var el = document.querySelector('[data-glm="eta-msg"]'); if (!el) return;
    el.textContent = text || '';
    el.className = 'glm-eta-msg' + (tone ? ' glm-eta-msg--' + tone : '');
    el.style.color = tone === 'error' ? '#dc2626' : (tone === 'ok' ? '#15803d' : '');
  }
  // A successful ETA write triggers a bounded re-read and a full drawer re-render, which destroys the node the
  // message was written into. The outcome is therefore parked here and replayed once the new drawer is wired, so
  // a success state is actually SEEN rather than flashing for one frame.
  var _glmEtaFlash = null;
  function etaFlash(text, tone) { _glmEtaFlash = text ? { text: text, tone: tone, sid: _glmMsgFor } : null; }
  function etaFlashReplay() { if (_glmEtaFlash && (!_glmEtaFlash.sid || _glmEtaFlash.sid === state.selectedShipmentId)) { etaMsg(_glmEtaFlash.text, _glmEtaFlash.tone); _glmEtaFlash = null; } }
  // A final3 b9 (REVIEW_AFINAL3 MINOR-1): after a lost route.advance answer the page re-reads the shipment and says what the database holds
  // ---------- A final4 (Owner 2026-11-20 P1 buttons): ONE write at a time per shipment, unknown outcomes held, late answers scoped ----------
  // Update ETA / Update Position / Save Receipt share one busy record per shipment, set SYNCHRONOUSLY on click: the clicked button shows
  // Updating… / Saving… itself (disabled, aria-busy); the other two writes of that shipment are disabled too (no ETA and receipt with the same
  // version at once). A re-render repaints from the record, so a rebuilt panel cannot re-enable a running write; Enter and double clicks hit
  // the same guard. Success / an explicit refusal ends it. No answer (or no answer within GLM_WRITE_WAIT_MS_) = UNKNOWN: nothing is resent, the
  // shipment is re-read (scoped); the re-read decides; if it cannot be read the panel stays blocked with 「結果待確認」 and offers 重新讀取.
  // The wait only classifies; it never cancels the server write. A late answer never writes into another selected shipment's panel.
  var GLM_WRITE_WAIT_MS_ = 90000, GLM_UNKNOWN_MSG_ = '結果待確認：沒有收到回應，不會自動重送。正在重新讀取…';
  var _glmBusy = {}, _glmMsgFor = null, _glmMsgFlash = null, _glmPosChecks = {};   // a4 (REVIEW_A1_A3 MAJOR-A): one pending position check PER SHIPMENT
  function glmBusyOf_(sid) { return _glmBusy[sid] || null; }
  function glmBounded_(p) { var t = null; return Promise.race([Promise.resolve(p), new Promise(function (res) { t = setTimeout(function () { res({ success: false, code: 'GLM_NO_ANSWER_IN_TIME', error: 'no answer within ' + (GLM_WRITE_WAIT_MS_ / 1000) + ' s' }); }, GLM_WRITE_WAIT_MS_); })]).then(function (v) { if (t) clearTimeout(t); return v; }); }
  function glmBusyStart_(sid, kind, btn, intended) { _glmBusy[sid] = { kind: kind, state: 'busy', intended: intended, readOk: false }; _glmMsgFor = sid; glmBusyPaint_(root(), { shipmentId: sid }); }
  function glmBusyEnd_(sid) { delete _glmBusy[sid]; glmBusyPaint_(root(), { shipmentId: sid }); }
  function glmBusyUnknown_(sid) { var b = _glmBusy[sid]; if (b) { b.state = 'unknown'; b.readOk = false; } glmBusyPaint_(root(), { shipmentId: sid }); }
  function glmMsgFlash_(sid, text, tone) { _glmMsgFlash = { sid: sid, text: text, tone: tone }; }
  var GLM_BTN_ = { eta: ['eta-update', 'Update ETA', 'Updating…'], route: ['route-advance', 'Update Position', 'Updating…'], receipt: ['receipt-save', 'Save Receipt', 'Saving…'], manual: ['manual-report-save', 'Report Position', 'Reporting…'] };   // AD3 A: + manual report
  var _glmManualOp = {};   // AD3 A: per shipment, the operation id of an unanswered manual report - re-sent unchanged so the server never writes twice
  function glmBusyPaint_(r, vm) {
    if (!r || !vm || state.selectedShipmentId !== vm.shipmentId) return;   // the panel on screen belongs to another shipment
    var b = _glmBusy[vm.shipmentId];
    Object.keys(GLM_BTN_).forEach(function (k) {
      var el = r.querySelector('[data-act="' + GLM_BTN_[k][0] + '"]'); if (!el) return;
      if (b) { if (el.getAttribute('data-glm-was') === null) el.setAttribute('data-glm-was', el.disabled ? '1' : '0'); el.disabled = true; el.setAttribute('aria-busy', b.kind === k ? 'true' : 'false');
        el.textContent = b.kind === k ? (b.state === 'unknown' ? '結果待確認' : GLM_BTN_[k][2]) : GLM_BTN_[k][1]; el.style.opacity = '0.55'; el.style.cursor = 'not-allowed'; }
      else { if (el.getAttribute('data-glm-was') !== null) { el.disabled = el.getAttribute('data-glm-was') === '1'; el.removeAttribute('data-glm-was'); } el.removeAttribute('aria-busy'); el.textContent = GLM_BTN_[k][1]; el.style.opacity = ''; el.style.cursor = ''; }
    });
    var rr = r.querySelector('[data-act="glm-reread"]');
    if (b && b.state === 'unknown' && b.readOk === false && b.failed) { if (!rr) { var host = r.querySelector('[data-glm="receipt-msg"]'); if (host && host.parentNode) { rr = document.createElement('button'); rr.type = 'button'; rr.className = 'glm-btn glm-btn--small'; rr.setAttribute('data-act', 'glm-reread'); rr.textContent = '重新讀取'; host.parentNode.insertBefore(rr, host.nextSibling); } }
      if (rr) rr.onclick = function () { rr.disabled = true; afterShipmentWrite(vm.shipmentId); }; }
    else if (rr && rr.parentNode) rr.parentNode.removeChild(rr);
  }
  // a4 (REVIEW_A1_A3 MINOR-A): a FAILED re-read repaints the open panel: 結果待確認 and an ENABLED 重新讀取 (a fresh wire) for a pending write
  function glmReadFailed_(sid) {
    var b = _glmBusy[sid]; if (b) { b.failed = true; b.readOk = false; if (b.state === 'busy') b.state = 'unknown'; }
    if (b && state.selectedShipmentId === sid && state.vms && state.vms[sid]) selectShipment(sid); else render();
  }
  // after a SUCCESSFUL scoped re-read (wireReceiptControls of the rebuilt panel): an unknown ETA / receipt is decided by what the read shows
  function glmBusyResolveAfterRead_(vm, held) {
    var b = _glmBusy[vm.shipmentId];
    if (b && b.awaitRead) { if (b.readOk) { var cd4_ = b.awaitCode; glmBusyEnd_(vm.shipmentId); receiptMsg('收貨未確認（' + (cd4_ || 'POSTING_UNKNOWN') + '）：請勿重新輸入收貨；請 Owner 檢查此單目的倉的庫存。', 'error'); } else { b.state = 'unknown'; b.failed = true; glmBusyPaint_(root(), vm); } return; }   // a3 (REVIEW_A1 MINOR-2): POSTING / BOOKS_UNKNOWN stays locked until the re-read
    if (!b || b.state !== 'unknown') return;
    if (!b.readOk) { b.failed = true; return; }
    if (b.kind === 'eta') { var now = etaInputValue(vm.eta); glmBusyEnd_(vm.shipmentId); etaMsg(now === b.intended ? '已儲存 ETA：' + now + '（重新讀取確認，沒有重送）。' : '未儲存：重新讀取顯示 ETA 仍為 ' + (now || '（空白）') + '。可再按 Update ETA。', now === b.intended ? 'ok' : 'error'); return; }
    if (b.kind === 'receipt') { glmBusyEnd_(vm.shipmentId); if (held) receiptMsg('未記錄：重新讀取後收貨數量未變。可再按 Save Receipt（送出相同數量，不會重複入庫）。', 'error'); return; }
  }
  function glmMsgFlashReplay_(vm) { var f = _glmMsgFlash; if (f && f.sid === vm.shipmentId) { _glmMsgFlash = null; receiptMsg(f.text, f.tone); } }
  // readable route-node names (the identity stays nodeIdentity(n))
  function glmNodeName_(n) {
    if (!n) return '';
    var r = n.nodeName || n.locationName || '';
    if (!r) { try { var x = glmNodeLocation_(n, state.idx); r = (x.loc && (x.loc.locationName || x.loc.name || x.loc.locationCode)) || ''; } catch (e) { r = ''; } }
    return r || n.nodeCode || ('Node ' + n.sequenceNo);
  }
  // the shipment's REAL destination node: the unique terminal node whose lineage reaches this shipment's destination warehouse (any status)
  function glmDestinationNodeOf_(vm) {
    var nodes = (vm && vm.nodes) || [], dest = String((vm && (vm.destCanonWarehouseId || vm.destWarehouseId)) || '').trim();
    if (!nodes.length) return { id: '', why: 'NO_ROUTE' };
    var maxSeq = -Infinity, cnt = 0, t = null;
    for (var i = 0; i < nodes.length; i++) { var sq = nodes[i].sequenceNo; if (typeof sq !== 'number' || !isFinite(sq) || sq <= 0) return { id: '', why: 'ROUTE_ORDER_UNVERIFIED' }; if (sq > maxSeq) { maxSeq = sq; cnt = 1; t = nodes[i]; } else if (sq === maxSeq) cnt++; }
    if (cnt !== 1) return { id: '', why: 'ROUTE_ORDER_UNVERIFIED' };
    if (!dest) return { id: '', why: 'DESTINATION_WAREHOUSE_MISSING' };
    if (isGatewayNode(t)) return { id: '', why: 'LAST_NODE_IS_GATEWAY' };
    var ok = glmTerminalLineage_(t, dest, state.idx).ok;   // A-delta2 R: same lineage as glmArrivalNode_
    return ok ? { id: nodeIdentity(t), node: t } : { id: '', why: 'LAST_NODE_NOT_DESTINATION' };
  }
  function glmDownloadJson_(name, obj) {
    try { var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); } catch (e2) {} }, 1500); return true; } catch (e) { return false; }
  }
  var _glmPosCheck = null;
  function glmPosCheckReplay_(vm) {
    var c = vm ? _glmPosChecks[vm.shipmentId] : null; if (!c) return;   // a4 (REVIEW_A1_A3 MAJOR-A): per shipment
    if (!c.readOk) { var b5_ = _glmBusy[vm.shipmentId] || (_glmBusy[vm.shipmentId] = { kind: 'route', state: 'unknown', readOk: false }); b5_.state = 'unknown'; b5_.failed = true; glmBusyPaint_(root(), vm);
      receiptMsg(c.ok ? '伺服器回覆已更新，但尚未重新讀取到此單的位置：結果待確認。請按「重新讀取」，不要再按 Update Position。' : '結果待確認：尚未重新讀取到此單的位置，不會自動重送。請按「重新讀取」。', 'error'); return; }   // a3 (REVIEW_A1 MAJOR-1)
    delete _glmPosChecks[vm.shipmentId];
    var cur = vm.currentNode, at = cur ? ('#' + cur.sequenceNo + ' ' + glmNodeName_(cur)) : '（無目前節點）';
    if (_glmBusy[vm.shipmentId] && _glmBusy[vm.shipmentId].kind === 'route') glmBusyEnd_(vm.shipmentId);   // A final4: the re-read decided
    if (cur && nodeIdentity(cur) === c.target && c.arrival && c.arrival.persisted && low(vm.status) !== 'arrived') receiptMsg('位置已更新為 ' + at + '，但重新讀取的 Shipment Status 是 ' + (vm.status || '—') + '：已送達狀態待確認，請按「重新讀取」，不要重送。', 'error');   // A-DELTA1 P0-1: arrival is shown only from the fresh read
    else if (cur && nodeIdentity(cur) === c.target && c.arrival && (c.arrival.code === 'ARRIVAL_WRITE_FAILED' || c.arrival.reason === 'ARRIVAL_READBACK_MISMATCH')) receiptMsg('位置已更新為 ' + at + '；已送達狀態寫入失敗（' + (c.arrival.code === 'ARRIVAL_WRITE_FAILED' ? 'ARRIVAL_WRITE_FAILED' : 'ARRIVAL_READBACK_MISMATCH') + '）：狀態待確認，請按「重新讀取」。再次更新到同一個目的節點可補寫狀態（不會重複寫入）。', 'error');   // A-delta1 C3 (REVIEW_AD1 L-2)
    else if (cur && nodeIdentity(cur) === c.target) receiptMsg((c.ok ? '已更新位置：' : '已儲存（重新讀取確認）：') + at + (low(vm.status) === 'arrived' ? '　· 已送達（待收貨）（Shipment Status: arrived）' : (vm.display && vm.display.projected && vm.display.display_only ? '　· 已送達（待收貨）' : '')) + '。', 'ok');
    else receiptMsg('未儲存：重新讀取顯示目前位置仍為 ' + at + '。可再按 Update Position。', 'error');
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
    if (vm.manualRoute) {   // AD3 A: the route-node selector would be refused (ROUTE_MANUAL_REPORT_REQUIRED); the manual report (shipment.route.advance + manual_report) is the only position entry
      routeSection = '<p class="glm-muted" data-glm="route-manual">手動物流（無路線模板）：起點 ' + esc(glmNodeName_(nodes[0])) + ' → 目的倉 ' + esc(glmNodeName_(nodes[nodes.length - 1])) +
        '。位置以「手動回報」記錄（運送中 / 已到目的倉），需填回報時間與原因；到倉不會自動收貨。</p>' +
        '<div data-glm="manual-report"><label class="glm-field"><span>Manual position / 手動回報</span><select data-manual-kind><option value="">—</option><option value="IN_TRANSIT">In transit / 運送中</option>' +
        '<option value="ARRIVED_AT_DESTINATION">Arrived at destination warehouse / 已到目的倉</option></select></label>' +
        '<label class="glm-field"><span>Report time / 回報時間</span><input type="datetime-local" data-manual-time></label>' +
        '<label class="glm-field"><span>Reason / reference / 原因或依據</span><input type="text" maxlength="200" data-manual-reason></label>' +
        '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="manual-report-save">Report Position</button></div></div>';
    } else if (!nodes.length) {
      routeSection = vm.opening ? glmRtiSectionHtml_(vm)   // A2 entry B: the 建立追蹤路線 helper replaces the A1 wording (imported records only; never Confirm)
        : '<p class="glm-muted" data-glm="route-none">No route nodes snapshotted for this shipment — position advance is unavailable until the route is created (Confirm & Dispatch).</p>';
    } else {
      var dst4_ = glmDestinationNodeOf_(vm);   // A final4 P1: the REAL destination node (lineage), not the highest sequence or a label
      var opts = nodes.map(function (n) {
        var backward = n.sequenceNo < curSeq;   // backward moves are blocked by the backend; disable in UI
        var lbl = '#' + n.sequenceNo + ' · ' + glmNodeName_(n) + (dst4_.id && nodeIdentity(n) === dst4_.id ? ' · 目的倉' : '') + (n.status ? ' (' + enumDisplay('status', n.status) + ')' : '');   // A final4: readable name; the value stays nodeIdentity(n)
        return '<option value="' + esc(nodeIdentity(n)) + '"' + (low(n.status) === 'current' ? ' selected' : '') + (backward ? ' disabled' : '') + '>' + esc(lbl) + '</option>';
      }).join('');
      routeSection = '<label class="glm-field"><span>Current Position (route node)</span><select data-route-select>' + opts + '</select></label>' +
        (dst4_.id ? '' : '<p class="glm-muted" data-glm="dest-unverified">最後一個節點未驗證為此單的目的倉（' + esc(dst4_.why) + '），到那裡不會顯示已送達。</p>') +
        '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-advance">Update Position</button></div>';
    }
    // ---- ETA: editable canonical shipments.eta; a past date stays valid + visible (overdue) ----
    var etaVal = etaInputValue(vm.eta);
    // F1-7N-FB-4A §G — the ETA control carries its OWN status line. It previously reported through receiptMsg,
    // whose node lives in the RECEIVING section further down the drawer, so an ETA failure was announced somewhere
    // the operator was not looking. A write must state its outcome where the operator clicked.
    var etaSection = '<label class="glm-field"><span>ETA</span><input type="date" data-eta-input value="' + esc(etaVal) + '"></label>' +
      (!etaVal && vm.eta ? '<p class="glm-muted">Current ETA: ' + esc(glmDisplayDate_(vm.eta) || '--') + ' (non-standard format — pick a date to normalize).</p>' : '') +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="eta-update">Update ETA</button></div>' +
      '<p class="glm-eta-msg" data-glm="eta-msg" role="status" aria-live="polite"></p>';

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
    if (vm.openingDisplayOnly) {
      recvSection = '<p class="glm-muted" data-glm="opening-receipt-tracking">Amazon 收貨紀錄 · 不增加 Current Stock · 資料時間 ' + esc(glmDisplayDate_(vm.openingAsOf) || '未提供') + '</p>' + recvSection;
    }
    var summaryText = lines.length ? ('Receiving — ' + lines.length + ' SKU' + (lines.length !== 1 ? 's' : '') + ' · ' + num(totalRemaining) + ' units remaining') : 'Receiving';

    return '<section class="glm-dsec"><h4>Current Position</h4>' + routeSection + etaSection +
        kv('物流狀態', vm.arrival && vm.arrival.arrived ? ('Delivered · 已送達（' + (vm.track && vm.track.receipt === 'partial' ? '部分收貨' : '待收貨') + '）') : (vm.nodes && vm.nodes.length ? 'In Transit · 運送中' : '—')) +   // A final4 P1: display only - shipments.status is never set to delivered
        kv('Shipment Status', low(vm.status) === 'arrived' ? 'Arrived · Delivered / 已送達（待收貨）' : (vm.display && vm.display.projected ? vm.display.label + '（依路線判定；狀態欄未寫入' + (vm.display.display_only ? '：僅顯示的匯入紀錄' : '') + '）' : (enumDisplay('status', vm.status) || '—'))) +   // A-DELTA1 P0-1 + C2 item 1
        '<p class="glm-muted">Shipment Status is system-derived (never set directly on the map).</p>' +
      '</section>' +
      '<section class="glm-dsec"><details class="glm-recv"' + (autoExpand ? ' open' : '') + ' data-glm="receiving-details">' +
        '<summary class="glm-recv__summary">' + esc(summaryText) + '</summary>' +
        '<div class="glm-recv__body">' + recvSection + '</div>' +
      '</details>' +
      '<p class="glm-receipt-msg" data-glm="receipt-msg" role="status" aria-live="polite"></p>' +
      (vm.openingDisplayOnly ? '' : '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="rcv-diag">收貨診斷（唯讀下載）</button></div>') +   // A final4 P0
      '</section>';
  }
  function wireReceiptControls(vm) {
    var r = root(); if (!r) return;
    _glmMsgFor = vm.shipmentId;   // a3 (REVIEW_A1 MINOR-1): the panel being wired owns the messages; late answers re-scope themselves
    etaFlashReplay();   // §G — a proven ETA outcome survives the post-write re-render
    glmPosCheckReplay_(vm);   // A final3 b9: the re-read decides what a lost route.advance answer did
    glmRtiWire_(r, vm);   // A2 entry B (建立追蹤路線): only on an imported record without route rows
    glmMsgFlashReplay_(vm);   // A final4
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
    var diagBtn = r.querySelector('[data-act="rcv-diag"]');   // A final4 P0: read-only download, nothing written
    if (diagBtn) diagBtn.onclick = function () {
      if (!(window.KM.DB && window.KM.DB.getShipmentReceiptDiagnostic)) { receiptMsg('收貨診斷無法使用（沒有讀取功能）。', 'error'); return; }
      diagBtn.disabled = true; _glmMsgFor = vm.shipmentId;
      window.KM.DB.getShipmentReceiptDiagnostic(vm.shipmentId, vm.company).then(function (resp) {
        diagBtn.disabled = false; _glmMsgFor = vm.shipmentId;
        if (!(resp && resp.success && resp.data)) { receiptMsg('收貨診斷讀取失敗' + (resp && resp.code ? '（' + resp.code + '）' : '') + '。沒有寫入任何資料。', 'error'); return; }
        var stamp4_ = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
        glmDownloadJson_('km-receipt-diag-' + String(vm.shipmentId).replace(/[^A-Za-z0-9_-]/g, '_') + '-' + stamp4_ + '.json', resp.data);
        receiptMsg(resp.data.receipt_allowed_by_existing_rules ? '收貨診斷已下載：依現有規則可以收貨。' : ('收貨診斷已下載：目前不能收貨（' + ((resp.data.refusal && resp.data.refusal.code) || '原因見檔案') + '）。'), resp.data.receipt_allowed_by_existing_rules ? 'ok' : 'error');
      }).catch(function () { diagBtn.disabled = false; _glmMsgFor = vm.shipmentId; receiptMsg('收貨診斷讀取失敗。沒有寫入任何資料。', 'error'); });   // a3 (REVIEW_A1 MINOR-4)
    };
    var recvAllBtn = r.querySelector('[data-act="receive-all"]');
    if (recvAllBtn) recvAllBtn.onclick = function () {
      r.querySelectorAll('[data-recv-line]').forEach(function (inp) {
        if (inp.readOnly) return;
        inp.value = parseFloat(inp.getAttribute('data-shipped')) || 0;
        if (typeof inp.oninput === 'function') inp.oninput();   // recompute the Remaining cell
      });
      _glmMsgFor = vm.shipmentId; receiptMsg('All lines filled to shipped — click Save Receipt to commit.', '');   // a4 (INFO-1)
    };
    function keepReceivingOpen() { var d = r.querySelector('[data-glm="receiving-details"]'); if (d) d.open = true; }
    var saveBtn = r.querySelector('[data-act="receipt-save"]');
    // R71-FE-1: a held receipt (no answer) is settled by THIS re-read when the saved values now equal it (recorded); otherwise its values are
    // put back, locked, and Save resends exactly them. A new receipt can be entered only after that.
    var held = glmRcvHeld_(vm.shipmentId);
    function heldInput(hl) { return r.querySelector('[data-recv-line="' + cssEsc(hl.shipment_line_id) + '"]'); }
    function pinHeld() { (held ? held.lines : []).forEach(function (hl) { var hi = heldInput(hl); if (hi) { hi.value = hl.shipment_received_qty; hi.readOnly = true; if (typeof hi.oninput === 'function') hi.oninput(); } }); }
    if (held && saveBtn) {
      // R71-FE-2 (review m-4): a receipt the server reported INCOMPLETE is never settled by a re-read - only the server's answer to the resend ends it
      if (!held.incomplete && held.lines.every(function (hl) { var hi = heldInput(hl); return !!hi && parseFloat(hi.getAttribute('data-prev')) === Number(hl.shipment_received_qty); })) {
        glmRcvHold_(vm.shipmentId, null); held = null; if (_glmBusy[vm.shipmentId] && _glmBusy[vm.shipmentId].kind === 'receipt') glmBusyEnd_(vm.shipmentId);   // A final4
        // R71-FE-2 (review M-1): equal saved quantities prove the LINES only, never the stock posting (final-cand5 writes the lines before it posts)
        receiptMsg('The earlier receipt that got no answer: the received quantities are saved (this re-read shows them). This page cannot confirm the stock posting - if a receipt error was reported, tell the owner.', '');
      } else {
        pinHeld(); keepReceivingOpen();
        receiptMsg(held.incomplete ? 'The last receipt STOPPED PART WAY (SHIPMENT_RECEIPT_INCOMPLETE). Save Receipt resends exactly the same received values to complete it (it never posts twice).' :
          'The last receipt got NO ANSWER, so it may already be recorded. Save Receipt resends exactly the same received values (they cannot be counted twice). Reload to see whether it was recorded.', 'error');
      }
    }
    glmBusyResolveAfterRead_(vm, held);   // A final4: an UNKNOWN write is decided by this re-read
    if (saveBtn) saveBtn.onclick = function () {
      if (glmBusyOf_(vm.shipmentId)) return;   // A final4: one write per shipment at a time
      _glmMsgFor = vm.shipmentId;
      if (!(window.KM.DB && window.KM.DB.updateShipmentReceipt)) { receiptMsg('Receipt API unavailable.', 'error'); keepReceivingOpen(); return; }
      var pairs = [];
      r.querySelectorAll('[data-recv-line]').forEach(function (inp) {
        pairs.push({ shipment_line_id: inp.getAttribute('data-recv-line'), value: inp.value, prev: inp.getAttribute('data-prev') });
      });
      var lines = held ? held.lines.slice() : glmReceiptChangedLines(pairs);   // §9.1 — only changed cumulative values are submitted; R71-FE-1: a held receipt exactly
      if (!lines.length) { receiptMsg('No changes to save.', ''); return; }
      glmBusyStart_(vm.shipmentId, 'receipt', saveBtn); receiptMsg('', '');   // A final4: Saving… is on the button
      // N1 / TEXTURE-3-R13: the version this receipt was entered against travels with it and is HELD with it - a resend sends the SAME token (a recorded
      // receipt is answered REPLAYED before the version gate; an unrecorded one is checked against the version it was entered on).
      // N1 r2: a held receipt the server refused for its VERSION while it was INCOMPLETE is re-bound ONLY by this explicit Save after the re-read
      // (held.rebind): it then carries the version the page has just read. Never automatic; the server checks that version like any other.
      var rcvTok = held ? (held.rebind ? String(vm.rowVersion || '') : String(held.token || '')) : String(vm.rowVersion || '');
      glmRcvHold_(vm.shipmentId, { lines: lines, token: rcvTok });   // R71-FE-1: held BEFORE dispatch
      glmBounded_(window.KM.DB.updateShipmentReceipt({ shipment_id: vm.shipmentId, lines: lines, actor: glmActor(), expected_updated_at: rcvTok || undefined })).then(function (resp) {
        _glmMsgFor = vm.shipmentId;
        // R71-FE-2 (review m-4): rcv's SHIPMENT_RECEIPT_INCOMPLETE (retry_safe, nothing undone) takes the lost-answer path: held, locked, resent unchanged
        var incomplete = !!resp && resp.code === 'SHIPMENT_RECEIPT_INCOMPLETE', inc_ = incomplete || !!(held && held.incomplete);
        var unanswered = !resp || resp.code === 'network' || resp.code === 'GLM_NO_ANSWER_IN_TIME' || incomplete;   // the db-api answers 'network' for a dropped / failed / non-JSON / timed-out response
        if (!unanswered) glmRcvHold_(vm.shipmentId, null);   // any other server answer settles the held receipt
        else glmRcvHold_(vm.shipmentId, { lines: lines, incomplete: inc_ || undefined, token: rcvTok });
        if (resp && resp.success) { glmBusyEnd_(vm.shipmentId); glmMsgFlash_(vm.shipmentId, '已儲存收貨。', 'ok'); afterShipmentWrite(vm.shipmentId); }
        else if (unanswered) {
          held = { lines: lines, incomplete: inc_ || undefined, token: rcvTok }; pinHeld(); keepReceivingOpen();
          if (!incomplete) { glmBusyUnknown_(vm.shipmentId); receiptMsg(GLM_UNKNOWN_MSG_, 'error'); afterShipmentWrite(vm.shipmentId); return; }   // A final4: no answer = unknown: scoped re-read, no resend
          glmBusyEnd_(vm.shipmentId);   // an explicit INCOMPLETE answer: resending the same values completes it
          receiptMsg(incomplete ? ('Receipt STOPPED PART WAY (' + resp.code + (resp.data && resp.data.stage ? ' at ' + resp.data.stage : '') + '). Nothing was undone. Save Receipt resends exactly the same received values to complete it (it never posts twice).') :
            ('Receipt got NO ANSWER (' + ((resp && resp.error) || 'no response') + '), so it may already be recorded. Save Receipt resends exactly the same received values (they cannot be counted twice). Reload to see whether it was recorded.'), 'error');
        }
        else if (resp && (resp.code === 'SHIPMENT_RECEIPT_POSTING_UNKNOWN' || resp.code === 'SHIPMENT_RECEIPT_BOOKS_UNKNOWN')) {
          // FE-RECEIPT-1 (candidate): the server could not prove the stock posting (31_ RCV31): Save stays disabled, the shipment is reloaded
          var b7_ = _glmBusy[vm.shipmentId]; if (b7_) { b7_.awaitRead = true; b7_.readOk = false; b7_.awaitCode = resp.code; }   /* a3 (REVIEW_A1 MINOR-2): Save stays locked until the re-read */ receiptMsg('Receipt NOT CONFIRMED - do not re-enter it; ask the owner to review the stock of this shipment at its destination (' + resp.code + ').', 'error');
          afterShipmentWrite(vm.shipmentId);
        }
        else if (resp && /^EDIT_(CONFLICT|TOKEN_REQUIRED|TOKEN_UNREADABLE|VERSION_COLUMN_MISSING)$/.test(String(resp.code || ''))) {
          // N1: the shipment changed after this receipt was entered (or the page held no version): nothing was written; re-read before re-entering
          glmBusyEnd_(vm.shipmentId);
          receiptMsg(inc_ ? ('The receipt that STOPPED PART WAY was not finished - this shipment changed since it started (' + resp.code + '). Nothing more was written. The shipment is being reloaded: check it, then press Save Receipt to finish THE SAME receipt against the current version.') : ('Receipt NOT saved - this shipment changed after it was loaded (' + resp.code + '). Nothing was received or posted. The shipment is being reloaded: check the received quantities, then enter the receipt again.'), 'error');
          // N1 r2: an INCOMPLETE receipt stays HELD (same lines), marked for re-binding: the next Save, after this re-read, sends the current version
          if (inc_) glmRcvHold_(vm.shipmentId, { lines: lines, incomplete: true, rebind: true });
          afterShipmentWrite(vm.shipmentId);
        }
        else {
          glmBusyEnd_(vm.shipmentId); keepReceivingOpen();   // §17.L keep expanded + values preserved on validation error
          if (/^DISPATCH_STATE_|^SHIPMENT_NOT_DISPATCHED$/.test(String((resp && resp.code) || ''))) { receiptMsg('無法收貨：出貨證據不完整（' + resp.code + '）。這與物流「已送達」是兩件事；請按「收貨診斷（唯讀下載）」查看原因。沒有寫入。', 'error'); return; }   // A final4 P1
          var detail = (resp && resp.invalid_lines && resp.invalid_lines.length) ? (' [' + resp.invalid_lines.map(function (x) { return (x.shipment_line_id || '?') + ':' + x.code; }).join(', ') + ']') : '';
          receiptMsg((resp && resp.error ? resp.error : 'Receipt save failed.') + detail, 'error');
        }
      });
    };
    // ETA update — THE canonical shipments.eta writer (never status / route / current position / receipt /
    // events). F1-7N-FB-4A §G: the identity sent is the INTERNAL shipment_id; the raw date-input value is sent
    // verbatim (no locale parsing, no Date object, no toISOString — any of which can shift the calendar day);
    // success is claimed ONLY from the server's read-back value; and an INDETERMINATE timeout RECONCILES the
    // persisted ETA before it offers a retry, because repeating an indeterminate write is how a double-apply
    // happens.
    var etaBtn = r.querySelector('[data-act="eta-update"]');
    if (etaBtn) etaBtn.onclick = function () {
      if (glmBusyOf_(vm.shipmentId)) return; _glmMsgFor = vm.shipmentId;   // A final4
      if (!(window.KM.DB && window.KM.DB.updateShipmentEta)) { etaMsg('ETA API unavailable — nothing was sent.', 'error'); return; }
      var inp = r.querySelector('[data-eta-input]'); var v = inp ? String(inp.value || '').trim() : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { etaMsg('Enter a valid ETA date (YYYY-MM-DD). Nothing was sent.', 'error'); return; }
      glmBusyStart_(vm.shipmentId, 'eta', etaBtn, v); etaMsg('', '');   // A final4: Updating… is on the button
      glmBounded_(window.KM.DB.updateShipmentEta({ shipment_id: vm.shipmentId, eta: v, actor: glmActor(), expected_updated_at: vm.rowVersion || undefined })).then(function (resp) {
        _glmMsgFor = vm.shipmentId;
        if (resp && resp.success) {
          // The server returns the PERSISTED, re-read value. Show that, never the value that was typed.
          var d = resp.data || {};
          var shown = glmDisplayDate_(d.eta || v) || '--';
          glmBusyEnd_(vm.shipmentId);
          etaFlash('已儲存 ETA：' + shown + (d.status_unchanged === false ? '（警告：狀態也變了，請回報）' : '') + '。', 'ok');
          afterShipmentWrite(vm.shipmentId);
          return;
        }
        var code = String((resp && resp.code) || '');
        if (/^EDIT_(CONFLICT|TOKEN_REQUIRED|TOKEN_UNREADABLE|VERSION_COLUMN_MISSING)$/.test(code)) { glmBusyEnd_(vm.shipmentId); etaFlash('未儲存：此單在你開啟後已被修改，沒有寫入。已重新讀取，請確認目前的 ETA 後再改。', 'error'); afterShipmentWrite(vm.shipmentId); return; }   // A final3 b9 (M01): stale -> zero write, re-read
        if ((!resp || code === 'REQUEST_TIMEOUT_WRITE_INDETERMINATE' || code === 'HTTP_TRANSPORT_ERROR' || code === 'GLM_NO_ANSWER_IN_TIME') && window.KM.DB.reconcileShipmentEta) {   // A final3 b9: a lost answer is UNKNOWN too - reconcile, never resend
          glmBusyUnknown_(vm.shipmentId); etaMsg(GLM_UNKNOWN_MSG_, 'error');   // A final4
          window.KM.DB.reconcileShipmentEta(vm.shipmentId, v).then(function (rec) {
            _glmMsgFor = vm.shipmentId;
            if (rec && rec.success && rec.matches_intended) { glmBusyEnd_(vm.shipmentId); etaFlash('已儲存 ETA：' + rec.persisted_eta + '（重新讀取確認，沒有重送）。', 'ok'); afterShipmentWrite(vm.shipmentId); return; }
            if (rec && rec.success) { glmBusyEnd_(vm.shipmentId); etaMsg('未儲存：重新讀取顯示 ETA 仍為 ' + (rec.persisted_eta || '（空白）') + '。可再按 Update ETA。', 'error'); return; }
            var b4_ = _glmBusy[vm.shipmentId]; if (b4_) { b4_.failed = true; } glmBusyPaint_(root(), vm); etaMsg('結果待確認：無法重新讀取，暫時不能再送出。請按「重新讀取」。', 'error');
          });
          return;
        }
        glmBusyEnd_(vm.shipmentId);
        etaMsg('未儲存：' + (code ? '[' + code + '] ' : '') + ((resp && resp.error) ? resp.error : 'ETA 更新失敗。'), 'error');
      });
    };
    var advBtn = r.querySelector('[data-act="route-advance"]');
    if (advBtn) advBtn.onclick = function () {
      if (glmBusyOf_(vm.shipmentId)) return; _glmMsgFor = vm.shipmentId;   // A final4
      if (!(window.KM.DB && window.KM.DB.advanceShipmentRoutePoint)) { receiptMsg('Route API unavailable.', 'error'); return; }
      var sel = r.querySelector('[data-route-select]'); if (!sel || !sel.value) { receiptMsg('Select a route point.', 'error'); return; }
      glmBusyStart_(vm.shipmentId, 'route', advBtn, sel.value); receiptMsg('', '');   // A final4: Updating… is on the button
      glmBounded_(window.KM.DB.advanceShipmentRoutePoint({ shipment_id: vm.shipmentId, route_template_node_id: sel.value, actor: glmActor() })).then(function (resp) {
        _glmMsgFor = vm.shipmentId;
        if (resp && resp.success) { var b8_ = _glmBusy[vm.shipmentId]; if (b8_) b8_.readOk = false; _glmPosChecks[vm.shipmentId] = { sid: vm.shipmentId, target: sel.value, ok: true, arrival: (resp.data && resp.data.arrival) || null }; try { if (typeof window.KMLogisticsArrivalInvalidate === 'function') window.KMLogisticsArrivalInvalidate(); } catch (eI3) {}   /* C3 L-4 */ afterShipmentWrite(vm.shipmentId); }   // A final4: the read-back states the current node; a3 (REVIEW_A1 MAJOR-1): the lock ends only when THAT re-read lands
        else { var c5_ = String((resp && resp.code) || ''); if (!resp || c5_ === 'network' || c5_ === 'HTTP_TRANSPORT_ERROR' || c5_ === 'GLM_NO_ANSWER_IN_TIME' || /INDETERMINATE|OUTCOME_UNKNOWN|UNKNOWN_OUTCOME/.test(c5_)) { glmBusyUnknown_(vm.shipmentId); receiptMsg(GLM_UNKNOWN_MSG_, 'error'); _glmPosChecks[vm.shipmentId] = { sid: vm.shipmentId, target: sel.value }; afterShipmentWrite(vm.shipmentId); return; }   /* A final3 b9 (REVIEW_AFINAL3 MINOR-1): db-api answers 'network' for a lost answer - never NOT SAVED, never a resend */   // A final3 (Owner item A)
          glmBusyEnd_(vm.shipmentId); receiptMsg('未儲存：' + (c5_ ? '[' + c5_ + '] ' : '') + (resp && resp.error ? resp.error : '位置更新失敗。'), 'error'); }
      });
    };
    var mBtn = r.querySelector('[data-act="manual-report-save"]');   // AD3 A: manual position report (shipment.route.advance + manual_report)
    if (mBtn) mBtn.onclick = function () {
      if (glmBusyOf_(vm.shipmentId)) return; _glmMsgFor = vm.shipmentId;
      if (!(window.KM.DB && window.KM.DB.advanceShipmentRoutePoint)) { receiptMsg('Route API unavailable.', 'error'); return; }
      var q = function (s) { var e = r.querySelector(s); return e ? String(e.value == null ? '' : e.value).trim() : ''; };
      var kind = q('[data-manual-kind]'), t = q('[data-manual-time]').replace('T', ' ').slice(0, 16), why = q('[data-manual-reason]');
      if (!kind || t.length < 16 || why.length < 2) { receiptMsg('請選擇回報類型、填回報時間與原因（至少 2 字）。', 'error'); return; }
      var h0 = _glmManualOp[vm.shipmentId];   // an unanswered earlier report: QUERY first (the re-read events) - recorded -> say so, never send again
      if (h0 && (vm.events || []).some(function (e) { return String(e.sourceEventId || '') === 'manual:' + vm.shipmentId + ':' + h0.op; })) { delete _glmManualOp[vm.shipmentId]; try { if (window.KMManualPositionOp) window.KMManualPositionOp.clear(vm.shipmentId); } catch (eC0) {} receiptMsg('先前的手動回報（' + h0.kind + '）已記錄，未重送。', 'ok'); return; }   // AD3 D r3: + the shared hold
      var MPO_ = window.KMManualPositionOp || null, mh_ = MPO_ ? MPO_.get(vm.shipmentId) : null;   // AD3 D r2: ONE hold per shipment, shared with the Shipment card
      if (MPO_ && MPO_.busy(vm.shipmentId)) { receiptMsg('此單的手動位置回報正在送出中（Shipment 卡片），未送出。', 'error'); return; }
      if (mh_ && mh_.src !== 'map' && !_glmManualOp[vm.shipmentId]) { receiptMsg('Shipment 卡片上有一筆手動位置回報結果待確認（' + String(mh_.kind || '') + '，操作 ' + String(mh_.op || '') + '）。請先在 Shipment Overview 卡片按 Re-check；未送出。', 'error'); return; }
      var hU_ = _glmManualOp[vm.shipmentId];   // AD3 D r3 (Owner: never a new id after an unknown outcome): an unanswered report is re-sent UNCHANGED or not at all
      if (hU_ && !(hU_.kind === kind && hU_.t === t && hU_.why === why)) { receiptMsg('先前的手動回報（' + hU_.kind + '，' + hU_.t + '）結果未確認：請以相同內容重送（同一操作編號，伺服器不會重複寫入），或重新讀取後再回報。未送出。', 'error'); return; }
      var h = _glmManualOp[vm.shipmentId], op = (h && h.kind === kind && h.t === t && h.why === why) ? h.op :('MPR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase());
      _glmManualOp[vm.shipmentId] = { op: op, kind: kind, t: t, why: why };
      if (MPO_) { MPO_.put(vm.shipmentId, { op: op, kind: kind, reason: why, time: t, at: new Date().toISOString(), checked: false, src: 'map' }); MPO_.mapSending(vm.shipmentId, true); }
      glmBusyStart_(vm.shipmentId, 'manual', mBtn, kind); receiptMsg('', '');
      glmBounded_(window.KM.DB.advanceShipmentRoutePoint({ shipment_id: vm.shipmentId, manual_report: kind, operation_id: op, report_time: t, reason: why, actor: glmActor(), expected_updated_at: vm.rowVersion })).then(function (resp) {
        _glmMsgFor = vm.shipmentId; var c6_ = String((resp && resp.code) || '');
        if (MPO_) { MPO_.mapSending(vm.shipmentId, false); var unk6_ = !resp || c6_ === 'network' || c6_ === 'HTTP_TRANSPORT_ERROR' || c6_ === 'GLM_NO_ANSWER_IN_TIME' || /INDETERMINATE|OUTCOME_UNKNOWN|UNKNOWN_OUTCOME/.test(c6_) || c6_ === 'WRITE'; if (!unk6_) MPO_.clear(vm.shipmentId); }   // AD3 D r2: a definitive answer releases the shared hold; an unknown keeps it
        if (resp && resp.success) { delete _glmManualOp[vm.shipmentId]; glmBusyEnd_(vm.shipmentId); var a6_ = (resp.data && resp.data.arrival) || {};
          glmMsgFlash_(vm.shipmentId, kind === 'ARRIVED_AT_DESTINATION' ? (a6_.persisted || a6_.reason === 'ALREADY_ARRIVED' ? '已記錄：已到目的倉（待收貨，不會自動收貨）。' : '已記錄到倉回報；狀態未改為已送達（' + String(a6_.reason || a6_.code || '') + '）。') : '已記錄：運送中。', 'ok');
          try { if (typeof window.KMLogisticsArrivalInvalidate === 'function') window.KMLogisticsArrivalInvalidate(); } catch (eI6) {}
          afterShipmentWrite(vm.shipmentId); return; }
        if (!resp || c6_ === 'network' || c6_ === 'HTTP_TRANSPORT_ERROR' || c6_ === 'GLM_NO_ANSWER_IN_TIME' || /INDETERMINATE|OUTCOME_UNKNOWN|UNKNOWN_OUTCOME/.test(c6_) || c6_ === 'WRITE') {
          glmBusyEnd_(vm.shipmentId); receiptMsg('結果待確認：沒有收到確定回應。重新讀取中；再按一次會用同一個操作編號送出，伺服器不會重複寫入。', 'error'); afterShipmentWrite(vm.shipmentId); return; }
        delete _glmManualOp[vm.shipmentId]; glmBusyEnd_(vm.shipmentId); receiptMsg('未儲存：' + (c6_ ? '[' + c6_ + '] ' : '') + ((resp && resp.error) ? resp.error : '手動回報失敗。'), 'error');
      });
    };
    glmBusyPaint_(r, vm);   // A final4: a rebuilt panel shows the running / unknown write of this shipment
  }
  // ===== A2 entry B (a2-route b5): 建立追蹤路線 for an imported shipment without route rows =====
  // Shown only on an imported (opening) record whose held read model has no route row. Pressing the button first does its OWN scoped
  // read of this shipment WITH routes; only a successful read whose raw answer carries a shipmentRoutes array with 0 rows for this
  // shipment counts as "no route" (loading / error / an answer without the routes table never does). Then the import framework's
  // ROUTE_INIT mode (80_/87_) lists the applicable templates and checks the choice; Preview validates, Create commits with the preview
  // digest (the server re-checks nodes = 0, template digest and the shipment row under the lock). One batch id per shipment session:
  // a resend of it is a replay, never a second route. A lost answer is resolved by the batch receipt, never by a blind resend.
  // b5 (REVIEW_A2 m-2): the state is kept PER SHIPMENT (it survives drawer switches) and a Create in flight / with an unknown outcome is
  // registered in A1's per-shipment busy layer (kind 'route_init'), so ETA / receipt / position of that shipment wait for it.
  // b5 (REVIEW_A2 m-3): a definitive refusal (the server answered, or the guard / sign-in refused before anything was sent) is shown with
  // its reason and needs a fresh Preview; only a lost / unclassifiable answer is 結果待確認.
  var _glmRtiBy = {};
  function glmRtiSt_(sid) { return _glmRtiBy[sid] || (_glmRtiBy[sid] = { sid: sid, busy: false, batch: '', facts: null, cand: null, unknown: false, note: '' }); }   // b6: note = the last definitive message of THIS shipment
  function glmRtiSectionHtml_(vm) {
    return '<p class="glm-muted" data-glm="route-none">此匯入單尚無追蹤路線。可依既有來源工廠、目的倉、carrier 與 method 建立（只建立追蹤，不扣庫存、不收貨）。</p>' +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-init-open">建立追蹤路線</button></div>' +
      '<div data-glm="route-init" aria-live="polite"></div>';
  }
  function glmRtiMsg_(r, html) { var p = r.querySelector('[data-glm="route-init"]'); if (p) p.innerHTML = html; }
  function glmRtiNewBatch_() { return 'RTI-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
  function glmRtiBody_(st, rows) { var f = st.facts; return { domain: 'shipment', mode: 'ROUTE_INIT', schema_version: 'SHIPMENT-IMPORT-2', import_batch_id: st.batch, scope: { company: f.company, source_import_batch_id: f.batch }, sheets: { Header: rows, Lines: [] }, actor: glmActor() }; }
  function glmRtiUnknownCode_(resp) { var c = String((resp && resp.code) || ''); return !resp || c === 'network' || c === 'HTTP_TRANSPORT_ERROR' || /INDETERMINATE|OUTCOME_UNKNOWN|UNKNOWN_OUTCOME|TIMEOUT/.test(c); }
  // an exception that proves NOTHING was sent: the Sandbox guard (sandboxCode), sign-in (AUTH_REQUIRED, zero_write), the Production guard (PRODUCTION_*)
  function glmRtiNotSent_(e) { return !!(e && (e.sandboxCode || (e.apiCode === 'AUTH_REQUIRED' && e.zero_write) || /^PRODUCTION_[A-Z_]+$/.test(String(e.message || '')))); }
  function glmRtiNotSentCode_(e) { return String((e && (e.sandboxCode || e.apiCode)) || (e && e.message) || 'REFUSED'); }
  function glmRtiIssues_(v) { return ((v && v.issues) || []).map(function (i) { return '<li>' + esc(i.code || '') + ' — ' + esc(i.message || '') + '</li>'; }).join(''); }
  function glmRtiSkipped_(rt) { var u = (rt && rt.origin_undeclared) || []; return u.length ? '<p class="glm-muted" data-glm="route-init-skipped">已略過 ' + u.length + ' 個起點國家未填的模板（' + u.slice(0, 5).map(esc).join(', ') + '）：補上 origin_country 後才會列出。</p>' : ''; }   // b5 (REVIEW_A2 m-4)
  // b6 (REVIEW_A2_B5 n-1): 78_ receipt states are COMMITTING, COMMITTED, FAILED_ROLLED_BACK, UNKNOWN_OUTCOME (IMB_STATUS_). The terminal states
  // that prove ZERO writes are listed here; COMMITTED is success; everything else (COMMITTING, UNKNOWN_OUTCOME, unrecognised) stays 結果待確認.
  var GLM_RTI_ZERO_WRITE_ = { FAILED_ROLLED_BACK: 1 };
  function glmRtiBusyMine_(sid) { var b = typeof glmBusyOf_ === 'function' ? glmBusyOf_(sid) : null; return !!(b && b.kind === 'route_init'); }
  function glmRtiWire_(r, vm) {
    var b = r.querySelector('[data-act="route-init-open"]'); if (!b) return;
    var st = glmRtiSt_(vm.shipmentId);
    if (st.unknown) { glmRtiUnknownView_(r, vm); return; }
    if (st.note) glmRtiMsg_(r, st.note);   // b6 (doc nit): a definitive result survives a rebuilt panel
    b.onclick = function () {
      if (st.busy || st.unknown) return;
      st.note = '';
      if (typeof glmBusyOf_ === 'function' && glmBusyOf_(vm.shipmentId)) { glmRtiMsg_(r, '<p class="glm-muted">此單有其他更新進行中或結果待確認，請等它完成後再建立路線。未寫入。</p>'); return; }   // A1 per-shipment write exclusion respected
      if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function' && window.KM.DB && window.KM.DB.importValidate && window.KM.DB.importCommit)) { glmRtiMsg_(r, '<p class="glm-muted">無法確認路線狀態（讀取或匯入功能不可用），未建立任何資料。</p>'); return; }
      st.busy = true; b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = '確認中...';
      glmRtiMsg_(r, '<p class="glm-muted">讀取此單的最新路線狀態…</p>');
      var done = function () { st.busy = false; b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = '建立追蹤路線'; };
      Promise.resolve(window.KM.api.getWorkspace('shipment', { filters: { shipmentId: vm.shipmentId }, include: { routes: true, events: true } })).then(function (env) {
        var d = env && env.success && env.data;
        if (!d || !Array.isArray(d.shipments) || !Array.isArray(d.shipmentRoutes)) { done(); glmRtiMsg_(r, '<p class="glm-muted">無法確認此單是否已有路線（讀取未完成），未建立任何資料。請稍後再試。</p>'); return; }
        var raw = (d.shipments.filter(function (s) { var x = (s && s.raw) || s || {}; return String(x.shipment_id || s.shipmentId || '') === String(vm.shipmentId); })[0] || {});
        raw = raw.raw || raw;
        var mine = d.shipmentRoutes.filter(function (x) { var y = (x && x.raw) || x || {}; return String(y.shipment_id || y.shipmentId || '') === String(vm.shipmentId); });
        if (!raw.shipment_id) { done(); glmRtiMsg_(r, '<p class="glm-muted">讀取結果不含此單，未建立任何資料。</p>'); return; }
        if (mine.length) { done(); glmRtiMsg_(r, '<p class="glm-muted">此單已有路線，改用 Current Position 更新。</p>'); afterShipmentWrite(vm.shipmentId); return; }
        st.facts = { company: String(raw.company || ''), batch: String(raw.import_batch_id || ''), source: String(raw.source_warehouse_id || ''), dest: String(raw.destination_warehouse_id || raw.warehouse_id || ''), carrier: String(raw.carrier_id || ''), method: String(raw.shipping_method || '') };
        if (!st.facts.batch) { done(); glmRtiMsg_(r, '<p class="glm-muted">此單沒有匯入批次編號，無法用此入口建立路線。</p>'); return; }
        st.batch = st.batch || glmRtiNewBatch_();
        return Promise.resolve(window.KM.DB.importValidate(glmRtiBody_(st, [{ __row: 1, shipment_id: vm.shipmentId }]))).then(function (v) {
          done();
          var row = v && v.preview && v.preview.rows && v.preview.rows[0], rt = row && row.route;
          var other = ((v && v.issues) || []).filter(function (i) { return i.code !== 'ROUTE_INIT_POSITION_REQUIRED'; });
          if (!v || v.success === false || other.length || !rt) { glmRtiMsg_(r, '<p class="glm-muted">無法建立路線：</p><ul>' + (glmRtiIssues_({ issues: other }) || '<li>' + esc((v && (v.code || v.error)) || '讀取失敗') + '</li>') + '</ul>'); return; }
          if (!rt.candidates || !rt.candidates.length) {
            var mv_ = rt.manual || {};
            if (mv_.available === true) { glmRtiManualOffer_(r, vm, rt); return; }   // AD3 D r2: the explicit manual-logistics choice (A contract 2), never automatic
            glmRtiMsg_(r, '<p class="glm-muted">沒有適用的路線模板（' + esc(rt.reason || 'NONE') + '）。系統不套用其他模板。' + (mv_.reason ? '人工物流也不可用（' + esc(mv_.reason) + '）。' : '') + '</p>'); return; }
          st.cand = rt.candidates; glmRtiForm_(r, vm, rt);
        });
      }).catch(function (e) { done(); glmRtiMsg_(r, '<p class="glm-muted">' + (glmRtiNotSent_(e) ? '未送出（' + esc(glmRtiNotSentCode_(e)) + '）' : '讀取失敗（' + esc(e && e.message || e) + '）') + '，未建立任何資料。</p>'); });
    };
  }
  function glmRtiForm_(r, vm, rt) {
    var st = glmRtiSt_(vm.shipmentId), f = st.facts, multi = rt.candidates.length > 1;
    var tpl = '<select data-rti="tpl">' + (multi ? '<option value="">請選擇路線（' + rt.candidates.length + ' 個適用）</option>' : '') + rt.candidates.map(function (c) { return '<option value="' + esc(c.route_template_id) + '">' + esc(c.template_name || c.route_template_id) + ' (' + esc(c.route_template_id) + ')</option>'; }).join('') + '</select>';
    glmRtiMsg_(r, '<div class="glm-dsec"><p class="glm-muted">來源 ' + esc(f.source || '—') + ' → 目的倉 ' + esc(f.dest || '—') + ' · carrier ' + esc(f.carrier || '—') + ' · method ' + esc(enumDisplay('shippingMethod', f.method) || '—') + '</p>' + glmRtiSkipped_(rt) +
      '<label class="glm-field"><span>路線</span>' + tpl + '</label><label class="glm-field"><span>目前位置（節點）</span><select data-rti="node"></select></label>' +
      '<label class="glm-field"><span>回報時間（以系統時區解讀；不可晚於現在、不可早於 ETD）</span><input type="datetime-local" data-rti="at"></label><label class="glm-field"><span>位置來源（例如貨代通知）</span><input type="text" maxlength="200" data-rti="src"></label>' +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-init-preview">預覽</button></div><div data-rti="out"></div></div>');
    var sel = r.querySelector('[data-rti="tpl"]'), node = r.querySelector('[data-rti="node"]');
    var fill = function () { var c = rt.candidates.filter(function (x) { return x.route_template_id === sel.value; })[0]; node.innerHTML = c ? c.nodes.map(function (n) { return '<option value="' + esc(n.route_template_node_id) + '">#' + esc(n.sequence_no) + ' ' + esc(n.label) + (n.country ? ' · ' + esc(n.country) : '') + (n.coordinates === 'PENDING' ? ' · 座標待補' : '') + '</option>'; }).join('') : ''; };
    sel.onchange = fill; fill();
    r.querySelector('[data-act="route-init-preview"]').onclick = function () { glmRtiPreview_(r, vm); };
  }
  // AD3 D r2 - ROUTE_INIT MANUAL LOGISTICS (A contract 2): offered only when the preview row says no template applies AND route.manual.available.
  // The operator presses the button, fills the position time and the reason / reference, previews (no write), then confirms; the row sent is
  // { shipment_id, route_mode: 'MANUAL', position_as_of, position_source } with no template / node / digest. Create, unknown outcome and replay
  // use the existing glmRtiCreate_ / receipt check (one batch id per shipment session).
  function glmRtiManualOffer_(r, vm, rt) {
    var mv = rt.manual || {};
    glmRtiMsg_(r, '<div class="glm-dsec" data-glm="route-init-manual-offer"><p class="glm-muted">沒有適用的路線模板（' + esc(rt.reason || 'NONE') + '）。系統不套用其他模板。</p>' +
      '<p class="glm-muted">可改用「人工物流（無路線範本）」：只記錄真實來源 ' + esc(mv.origin_warehouse_id || '—') + ' 與目的倉 ' + esc(mv.destination_warehouse_id || '—') + '，不虛構沿途節點、掃描、清關或日期；之後由人工回報位置。' +
      ((mv.coordinates && (mv.coordinates.origin === 'PENDING' || mv.coordinates.destination === 'PENDING')) ? '（倉庫座標待補：地圖顯示 Coordinate Pending）' : '') + '</p>' +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-init-manual">使用人工物流（無路線）</button></div><div data-rti="out"></div></div>');
    var b = r.querySelector('[data-act="route-init-manual"]');
    if (b) b.onclick = function () { glmRtiManualForm_(r, vm, mv); };
  }
  function glmRtiManualForm_(r, vm, mv) {
    glmRtiMsg_(r, '<div class="glm-dsec" data-glm="route-init-manual"><p class="glm-muted">人工物流（無路線範本）：來源 ' + esc(mv.origin_warehouse_id || '—') + ' → 目的倉 ' + esc(mv.destination_warehouse_id || '—') + '。建立時記錄一筆「運送中」人工回報。</p>' +
      '<label class="glm-field"><span>回報時間（以系統時區解讀；不可晚於現在、不可早於 ETD）</span><input type="datetime-local" data-rti="m-at"></label>' +
      '<label class="glm-field"><span>原因 / 參考（2-200 字，例如貨代通知）</span><input type="text" maxlength="200" data-rti="m-src"></label>' +
      '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-init-manual-preview">預覽</button></div><div data-rti="out"></div></div>');
    r.querySelector('[data-act="route-init-manual-preview"]').onclick = function () { glmRtiManualPreview_(r, vm); };
  }
  function glmRtiManualPreview_(r, vm) {
    var st = glmRtiSt_(vm.shipmentId); if (st.busy || st.unknown) return;
    var g = function (k) { var x = r.querySelector('[data-rti="' + k + '"]'); return x ? String(x.value || '').trim() : ''; };
    var at = g('m-at').replace('T', ' ').slice(0, 16), src = g('m-src'), out = r.querySelector('[data-rti="out"]');
    if (at.length < 16 || src.length < 2 || src.length > 200) { out.innerHTML = '<p class="glm-muted">請填回報時間與原因 / 參考（2-200 字）。未送出。</p>'; return; }
    if (!st.batch) st.batch = glmRtiNewBatch_();
    st.busy = true; out.innerHTML = '<p class="glm-muted">預覽中…（未寫入）</p>';
    var body = glmRtiBody_(st, [{ __row: 1, shipment_id: vm.shipmentId, route_mode: 'MANUAL', position_as_of: at, position_source: src }]);
    Promise.resolve(window.KM.DB.importValidate(body)).then(function (v) {
      st.busy = false;
      if (!v || v.success === false || !v.valid) { out.innerHTML = '<p class="glm-muted">不能建立（未寫入）：</p><ul>' + (glmRtiIssues_(v) || '<li>' + esc((v && (v.code || v.error)) || '驗證失敗') + '</li>') + '</ul>'; return; }
      var w = ((v.preview.rows[0] || {}).warnings || []).map(function (x) { return '<li>' + esc(x.message || x.code) + '</li>'; }).join('');
      out.innerHTML = '<p>將建立人工物流路線（來源、目的倉 2 個節點）與 1 筆「運送中」人工回報（' + esc(glmDisplayDate_(at) || '--') + '）。不扣庫存、不收貨、不改狀態。</p>' + (w ? '<ul>' + w + '</ul>' : '') +
        '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-init-create">確認建立</button></div>';
      var cb = r.querySelector('[data-act="route-init-create"]');
      cb.onclick = function () { glmRtiCreate_(r, vm, body, v.preview_digest, cb); };
    }).catch(function (e) { st.busy = false; out.innerHTML = '<p class="glm-muted">' + (glmRtiNotSent_(e) ? '未送出（' + esc(glmRtiNotSentCode_(e)) + '）' : '預覽失敗（' + esc(e && e.message || e) + '）') + '，未寫入。</p>'; });
  }
  function glmRtiChoice_(r, st) {
    var g = function (k) { var x = r.querySelector('[data-rti="' + k + '"]'); return x ? String(x.value || '').trim() : ''; };
    var c = (st.cand || []).filter(function (x) { return x.route_template_id === g('tpl'); })[0];
    return { tpl: g('tpl'), node: g('node'), at: g('at').replace('T', ' ').slice(0, 16), src: g('src'), digest: c ? c.template_digest : '' };
  }
  function glmRtiPreview_(r, vm) {
    var st = glmRtiSt_(vm.shipmentId);
    if (st.busy || st.unknown) return;
    var ch = glmRtiChoice_(r, st), out = r.querySelector('[data-rti="out"]');
    if (!ch.tpl || !ch.node || !ch.at || !ch.src) { out.innerHTML = '<p class="glm-muted">請選擇路線、節點，並填回報時間與來源。</p>'; return; }
    if (!st.batch) st.batch = glmRtiNewBatch_();   // b6 (n-2): a definitive answer retired the previous id; this Preview starts a NEW batch
    st.busy = true; out.innerHTML = '<p class="glm-muted">預覽中…（未寫入）</p>';
    var row = { __row: 1, shipment_id: vm.shipmentId, route_template_id: ch.tpl, route_template_node_id: ch.node, route_template_digest: ch.digest, position_as_of: ch.at, position_source: ch.src };
    var body = glmRtiBody_(st, [row]);
    Promise.resolve(window.KM.DB.importValidate(body)).then(function (v) {
      st.busy = false;
      if (!v || v.success === false || !v.valid) { out.innerHTML = '<p class="glm-muted">不能建立（未寫入）：</p><ul>' + (glmRtiIssues_(v) || '<li>' + esc((v && (v.code || v.error)) || '驗證失敗') + '</li>') + '</ul>'; return; }
      var im = (v.preview && v.preview.impacts) || {}, w = ((v.preview.rows[0] || {}).warnings || []).map(function (x) { return '<li>' + esc(x.message || x.code) + '</li>'; }).join('');
      out.innerHTML = '<p>將建立 ' + esc(im.shipment_routes) + ' 個計畫節點與 1 筆位置回報（' + esc(glmDisplayDate_(ch.at) || '--') + '）。不扣庫存、不收貨、不改狀態；之前的節點不記錄實際到站時間。</p>' + (w ? '<ul>' + w + '</ul>' : '') +
        '<div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-init-create">確認建立</button></div>';
      var cb = r.querySelector('[data-act="route-init-create"]');
      cb.onclick = function () { glmRtiCreate_(r, vm, body, v.preview_digest, cb); };
    }).catch(function (e) { st.busy = false; out.innerHTML = '<p class="glm-muted">' + (glmRtiNotSent_(e) ? '未送出（' + esc(glmRtiNotSentCode_(e)) + '）' : '預覽失敗（' + esc(e && e.message || e) + '）') + '，未寫入。</p>'; });
  }
  function glmRtiCreate_(r, vm, body, digest, btn) {
    var st = glmRtiSt_(vm.shipmentId), sid = vm.shipmentId;
    if (st.busy || st.unknown) return;
    if (typeof glmBusyOf_ === 'function' && glmBusyOf_(sid)) return;   // A1 per-shipment write exclusion respected
    st.busy = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = '建立中...';
    if (typeof glmBusyStart_ === 'function') glmBusyStart_(sid, 'route_init', btn, digest);   // b5 (m-2): ETA / receipt / position of THIS shipment wait
    var refused = function (code, why, issuesHtml, answered) {   // b5 (m-3): definitive - nothing written; the preview digest is spent, a fresh Preview is required
      st.busy = false; if (glmRtiBusyMine_(sid) && typeof glmBusyEnd_ === 'function') glmBusyEnd_(sid);
      if (answered) st.batch = '';   // b6 (n-2): the SERVER answered - this id is spent; the next Preview starts a new batch (no IMPORT_BATCH_CONFLICT loop)
      var html = '<p class="glm-muted" data-glm="route-init-refused">未建立（' + esc(code) + '）：' + esc(why) + '。請重新按「預覽」。</p>' + (issuesHtml ? '<ul>' + issuesHtml + '</ul>' : '');
      st.note = html;   // b6 (doc nit): kept in the shipment's state, not only in a panel that may be detached
      var o = r.querySelector('[data-rti="out"]'); if (o) o.innerHTML = html;
    };
    Promise.resolve(window.KM.DB.importCommit(Object.assign({}, body, { preview_digest: digest }))).then(function (res) {
      st.busy = false;
      if (res && res.success && (res.status === 'COMMITTED' || res.replayed)) { st.batch = ''; if (glmRtiBusyMine_(sid) && typeof glmBusyEnd_ === 'function') glmBusyEnd_(sid); afterShipmentWrite(sid); return; }
      if (glmRtiUnknownCode_(res)) { st.unknown = true; if (typeof glmBusyUnknown_ === 'function') glmBusyUnknown_(sid); glmRtiUnknownView_(r, vm); return; }
      refused((res && res.code) || 'REFUSED', (res && res.error) || '伺服器拒絕', glmRtiIssues_(res), true);
    }).catch(function (e) {
      if (glmRtiNotSent_(e)) { refused(glmRtiNotSentCode_(e), '沒有送出'); return; }
      st.busy = false; st.unknown = true; if (typeof glmBusyUnknown_ === 'function') glmBusyUnknown_(sid); glmRtiUnknownView_(r, vm);
    });
  }
  function glmRtiUnknownView_(r, vm, extra) {
    var st = glmRtiSt_(vm.shipmentId), sid = vm.shipmentId;
    glmRtiMsg_(r, '<p class="glm-muted">結果待確認：沒有收到建立結果，系統不會自動重送。' + (extra || '') + '</p><div class="glm-filter-actions"><button type="button" class="glm-btn glm-btn--small" data-act="route-init-check">查詢結果</button></div>');
    var c = r.querySelector('[data-act="route-init-check"]'); if (!c) return;
    c.onclick = function () {
      if (st.busy) return; st.busy = true; c.disabled = true; c.textContent = '查詢中...';
      Promise.resolve(window.KM.DB.importReceiptGet({ import_batch_id: st.batch, domain: 'shipment' })).then(function (x) {
        st.busy = false;
        if (x && x.success && x.receipt && x.receipt.status === 'COMMITTED') { st.unknown = false; st.batch = ''; if (glmRtiBusyMine_(sid) && typeof glmBusyEnd_ === 'function') glmBusyEnd_(sid); afterShipmentWrite(sid); return; }
        var rs_ = (x && x.success && x.receipt) ? String(x.receipt.status || '') : '';
        if (GLM_RTI_ZERO_WRITE_[rs_]) { st.unknown = false; st.batch = ''; if (glmRtiBusyMine_(sid) && typeof glmBusyEnd_ === 'function') glmBusyEnd_(sid); st.note = '<p class="glm-muted" data-glm="route-init-refused">確認未建立（批次狀態 ' + esc(rs_) + '，未寫入任何資料）。請重新按「建立追蹤路線」並重新「預覽」。</p>'; glmRtiWire_(r, vm); return; }   // b6 (n-1): definitive zero write - released, new batch next time
        if (x && x.code === 'IMPORT_BATCH_NOT_FOUND') { st.unknown = false; if (glmRtiBusyMine_(sid) && typeof glmBusyEnd_ === 'function') glmBusyEnd_(sid); st.note = '<p class="glm-muted">確認未建立（無批次紀錄）。可重新按「建立追蹤路線」；同一批次重送不會重複建立。</p>'; glmRtiWire_(r, vm); return; }   // b6: the button is wired again (same id kept)
        glmRtiUnknownView_(r, vm, '目前批次狀態 ' + esc((x && x.receipt && x.receipt.status) || (x && x.code) || 'unknown') + '（批次 ' + esc(st.batch) + '）；請勿重送，可稍後再查詢或請管理者核對。');
      }).catch(function () { st.busy = false; c.disabled = false; c.textContent = '查詢結果'; });
    };
  }
  function openShipmentDrawer(id) {
    var vm = state.vms[id]; var els = drawerEls(); if (!vm || !els) return;
    openDrawerCommon();
    var pos = resolveCurrentPosition(vm), pl = resolveShipmentPlacement(vm);
    var posLine = pos.drawable ? (pos.lat.toFixed(3) + ', ' + pos.lng.toFixed(3) + ' · ' + esc(pos.source) + ' · last reported ' + (pos.at ? esc(glmDisplayDate_(pos.at) || '--') : 'time unknown'))
      : '尚無位置資訊 · <span class="glm-badge glm-badge--pending">Coordinate Pending</span>' + (pl.kind !== 'pending' ? ' <span class="glm-muted">(shown at ' + esc(pl.kind) + ' endpoint)</span>' : '');
    // §14 — explain the shipment's data/route issues in the drawer (same detector as the card badge; no page banner).
    var issues = glmShipmentIssues({ nodeCount: vm.nodes.length, placementKind: pl.kind, opening: vm.opening, displayOnly: vm.openingDisplayOnly, asOf: glmDisplayDate_(vm.openingAsOf) });
    var issueSection = issues.types.length
      ? '<section class="glm-dsec glm-dsec--issue"><h4>⚠ Attention</h4>' + issues.types.map(function (t) { return '<p class="glm-issue__line"><strong>' + esc(t.label) + '</strong><br>' + esc(t.detail) + '</p>'; }).join('') + '</section>'
      : '';
    var rtiRep_ = (vm.events || []).filter(function (e9) { return String(e9.source || '') === 'import' && String(e9.eventType || '') === 'route_node_reached'; })[0], rtiRepSeq_ = -Infinity;   // A2 b5 (REVIEW_A2 m-1): the node reported at import
    if (rtiRep_) (vm.nodes || []).forEach(function (x9) { if (String(x9.shipmentRouteId || '') === String(rtiRep_.shipmentRouteId || '')) rtiRepSeq_ = x9.sequenceNo; });
    var routeSteps = vm.nodes.map(function (n) {
      var sc = nodeStatusClass(n.status), c = resolveNodeCoord(n);
      return '<div class="glm-step glm-step--' + sc + '"><div class="glm-step__seq">#' + n.sequenceNo + ' <span class="glm-tag glm-tag--' + sc + '">' + esc(sc) + '</span></div>' +
        '<div class="glm-step__name">' + esc(n.nodeName || n.locationName || n.nodeCode || ('Node ' + n.sequenceNo)) + '</div>' +
        '<div class="glm-step__meta">' + esc(n.nodeType || '') + (n.country ? ' · ' + esc(n.country) : '') + (n.transportMode ? ' · ' + esc(n.transportMode) : '') +
        (n.plannedArrivalDate ? ' · plan arr ' + esc(glmDisplayDate_(n.plannedArrivalDate) || '--') : '') + (n.actualArrivalDate ? ' · act arr ' + esc(glmDisplayDate_(n.actualArrivalDate) || '--') : '') +
        (c.drawable ? '' : ' · <span class="glm-badge glm-badge--pending">coord pending</span>') + (/^SRI-/.test(String(n.shipmentRouteId || '')) && sc === 'completed' && !n.actualArrivalDate && n.sequenceNo < rtiRepSeq_ ? ' · <span class="glm-badge glm-badge--neutral" data-glm="inferred-passed" title="匯入時回報的位置之前的節點：系統推定已經過，不是逐站確認，沒有實際到站時間">依匯入位置推定已經過</span>' : '') + '</div></div>';   // A2 b3 (Owner D3)
    }).join('') || '<p class="glm-muted">No route nodes for this shipment (shipment_routes empty).</p>';
    var timeline = vm.events.length ? vm.events.map(function (e) {
      return '<div class="glm-step"><div class="glm-step__seq">#' + (e.eventSequence || '') + '</div>' +
        '<div class="glm-step__name">' + esc(e.eventType || e.eventStatus || 'event') + '</div>' +
        '<div class="glm-step__meta">' + esc(glmDisplayDate_(e.eventTime) || '--') + (e.locationName ? ' · ' + esc(e.locationName) : '') + (e.rawStatus ? ' · raw: ' + esc(e.rawStatus) : '') + (e.source ? ' · ' + esc(e.source) : '') + '</div></div>';
    }).join('') : '<p class="glm-muted">No actual events yet. Upcoming nodes are shown in the Route above (never as planned events).</p>';

    els.title.textContent = vm.displayNo;
    els.body.innerHTML =
      '<section class="glm-dsec"><h4 class="glm-dsec__h--close">Identity<button type="button" class="glm-dsec__close" data-act="drawer-close" aria-label="Close shipment details" title="Close (Esc)">&times;</button></h4>' +
        // The drawer is the identity section, so it shows BOTH: the name an operator recognises and the id
        // every join and support conversation is actually about.
        kv('Shipment ID (external)', vm.externalShipmentId) + kv('Shipment No.', vm.originalNo) + kv('Internal ID', vm.shipmentId) + kv('Company', vm.company) +
        kv('Carrier', vm.carrierLabel === vm.carrier ? vm.carrier : (vm.carrierLabel + '  ·  ' + vm.carrier)) +
        kv('Shipping Method', enumDisplay('shippingMethod', vm.method)) +
        kv('Origin → Destination', glmOriginText_(vm) + ' → ' + (vm.destCountry || vm.destWarehouse || '?')) +
        kv('Destination Warehouse', vm.destWarehouse) + kv('Tracking / Container', [vm.tracking, vm.container].filter(Boolean).join(' / ')) +
        kv('ETD', glmDisplayDate_(vm.etd)) +
        kv('Shipping Plan Created', (vm.shippingPlanDates || []).map(function (p, i, rows) { return (rows.length > 1 ? p.shippingPlanId + ': ' : '') + (glmDisplayDate_(p.createdAt) || '--'); }).join(' · ')) +
        kv('Status', enumDisplay('status', vm.status)) + kv('Route Template', vm.routeTemplateId) + '</section>' +
      '<section class="glm-dsec"><h4>Live Position</h4>' +
        kv('Current Stage', vm.stage) +
        '<div class="glm-kv"><span class="glm-kv__k">Map Position</span><span class="glm-kv__v">' + posLine + '</span></div>' +
        kv('Latest Event', vm.latestEvent ? (vm.latestEvent.eventType || vm.latestEvent.eventStatus) : '') + kv('Latest Updated', glmDisplayDate_(vm.latestUpdated)) +
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
    syncDrawerHeader_();
    els.dr.classList.add('is-open'); els.dr.setAttribute('aria-hidden', 'false');
    // Wire ALL close buttons in the drawer (header X + the in-body Identity-row X) — the body is populated
    // after render(), so bindRuntime hasn't seen the body one.
    els.dr.querySelectorAll('[data-act="drawer-close"]').forEach(function (b) { b.onclick = closeDrawer; });
    var x = els.dr.querySelector('.glm-drawer__close') || els.dr.querySelector('[data-act="drawer-close"]'); if (x) try { x.focus({ preventScroll: true }); } catch (e) {} }
  function closeDrawer() {
    var els = drawerEls(); if (!els || !els.dr) return;
    els.dr.classList.remove('is-open'); els.dr.setAttribute('aria-hidden', 'true');
    if (state.lastFocusEl && document.contains(state.lastFocusEl)) { try { state.lastFocusEl.focus({ preventScroll: true }); } catch (e) {} }
    state.lastFocusEl = null;
  }
  function drawerOpen() { var els = drawerEls(); return !!(els && els.dr && els.dr.classList.contains('is-open')); }
  function syncDrawerHeader_() {
    var els = drawerEls(), header = document.querySelector('.top-header');
    if (els && els.dr && header) els.dr.style.setProperty('--glm-header-offset', Math.max(0, header.getBoundingClientRect().bottom) + 'px');
  }
  function installEsc() {
    if (state.escInstalled) return; state.escInstalled = true;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawerOpen()) { e.preventDefault(); closeDrawer(); } });
    window.addEventListener('resize', function () { if (drawerOpen()) syncDrawerHeader_(); });
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
    r.querySelectorAll('[data-adm1]').forEach(function (el) { el.onchange = function () { state[el.getAttribute('data-adm1')] = el.value; updateGlobeLayers(); renderAdmin1Note(); }; });
    // TEXTURE-3-R9 §A/§F — the label switch. `el.onclick = fn` ASSIGNS rather than adds, so re-binding after a
    // render REPLACES the handler and a remount cannot accumulate listeners. That is the existing convention in
    // this function, and R9 does not introduce an addEventListener that would break it.
    r.querySelectorAll('[data-labelmode]').forEach(function (el) {
      function choose(target) {
        if (!target) return;
        setLabelMode(target.getAttribute('data-labelmode'));
        try { target.focus(); } catch (e) {}
      }
      el.onclick = function () { choose(el); };
      el.onkeydown = function (e) {
        var k = e.key;
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); choose(el); return; }
        // Radiogroup arrow behaviour. With exactly two options every arrow moves to — and selects — the other,
        // which is what a two-option group means; Home and End would name the same two buttons.
        if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'Home' || k === 'End') {
          e.preventDefault();
          var group = el.parentNode ? el.parentNode.querySelectorAll('[data-labelmode]') : null;
          if (!group || group.length < 2) return;
          var other = null;
          for (var i = 0; i < group.length; i++) { if (group[i] !== el) { other = group[i]; break; } }
          choose(other);
        }
      };
    });
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
      'drawer-close': closeDrawer, 'clear-filters': clearFilters, 'pos-diag-export': function () { glmPositionDiagExport_(); },   // A final3 (Owner item 4)
      'sel-details': function () { if (state.selectedShipmentId && state.vms[state.selectedShipmentId]) openShipmentDrawer(state.selectedShipmentId); },   // MAP-FOCUS-1
      'sel-route': function () {   // MAP-FOCUS-1: the planned route on request, labelled as NOT a position
        var vm = state.vms[state.selectedShipmentId]; if (!vm || !state.globe) return;
        var pts = vm.nodes.map(resolveNodeCoord).filter(function (c) { return c.drawable; }).map(function (c) { return [c.lat, c.lng]; }); if (!pts.length) return;
        var c = centroid(pts); state.globe.focus(c.lat, c.lng, { dist: pts.length > 1 ? 2.9 : 2.4 });
        var el = root() && root().querySelector('[data-glm="selchip-pos"]'); if (el) el.textContent = '尚無位置資訊 - showing the planned route, not a position';
      }, 'clear-kpi': function () { state.filters.kpi = ''; render(); },
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
  function clearFilters(skipRender) { state.filters = { search: '', company: '', originCountry: '', destCountry: '', carrier: '', method: '', status: '', stage: '', routeTemplateId: '', etaFrom: '', etaTo: '', exceptionOnly: false, delayedOnly: false, arrivingSoon: false, kpi: '' }; state.selectedShipmentId = ''; if (skipRender !== true) render(); }

  // ---------- boot / lifecycle ----------
  function boot(force) {
    _glmDiag.boots++;
    // THE NAVIGATION THIS LOAD BELONGS TO. `ensureDb` already drops a superseded READ (`_glmReadSeq`), but
    // nothing stopped a load that survived a navigation from rendering onto the page the operator went to
    // next — including calling attachGlobe() against a section that is no longer the active one.
    var myNav = _glmNavGen;
    state.loading = true; state.error = ''; render();
    ensureDb(!!force, function (ok) {
      if (myNav !== _glmNavGen) { _glmDiag.staleRendersBlocked++; return; }
      state.loading = false;
      // Fail-closed: ensureDb sets a specific state.error in Workspace mode; preserve it (no silent broad fallback).
      if (!ok) { if (!state.error) state.error = 'Operation database is not loaded.'; render(); return; }
      if (myNav !== _glmNavGen) { _glmDiag.staleRendersBlocked++; return; }
      state.sourceMode = (window.KM.DB && window.KM.DB.getDataSourceMode) ? window.KM.DB.getDataSourceMode() : 'unknown';
      state.diag = (window.KM.DB && window.KM.DB.getDataDiagnostics) ? window.KM.DB.getDataDiagnostics() : null;
      try { buildReadModel(); } catch (e) { state.error = String(e && e.message || e); render(); return; }
      if (myNav !== _glmNavGen) { _glmDiag.staleRendersBlocked++; return; }
      state.didFocus = false;
      if (Array.isArray(window._glmPendingShipmentIds)) {
        clearFilters(true);
        state.filters.shipmentIds = window._glmPendingShipmentIds.filter(function (id) { return typeof id === 'string'; });
        window._glmPendingShipmentIds = null;
      }
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
  /* The observation surface. Read-only: it reports what the page already knows and changes nothing. The
     runner reads it before, during and after a load, and across a navigation, so "the canvas vanished" can
     be attributed rather than merely noticed. */
  window.KM = window.KM || {};
  window.KM.glmSelectionDiag = function () { return { selectedShipmentId: state.selectedShipmentId || '', selectSeq: state.selectSeq, lastFocus: state.lastFocus }; };   // MAP-FOCUS-1 (read-only)
  window.KM.glmDiag = function () {
    var host = state.globeHost || null;
    var inDoc = !!(host && (document.contains ? document.contains(host) : host.parentNode));
    var canvas = host ? host.querySelector('canvas') : null;
    var box = (canvas && canvas.getBoundingClientRect) ? canvas.getBoundingClientRect() : null;
    return {
      navGen: _glmNavGen,
      renders: _glmDiag.renders, boots: _glmDiag.boots,
      attaches: _glmDiag.attaches, detaches: _glmDiag.detaches,
      globeCreates: _glmDiag.globeCreates, globeDestroys: _glmDiag.globeDestroys,
      contextLost: _glmDiag.contextLost,
      staleRendersBlocked: _glmDiag.staleRendersBlocked,
      staleMountsBlocked: _glmDiag.staleMountsBlocked,
      teardownsAvoided: _glmDiag.teardownsAvoided,
      hostExists: !!host,
      hostInDocument: inDoc,
      hostParentClass: (host && host.parentNode && host.parentNode.className) ? String(host.parentNode.className) : null,
      canvasPresent: !!canvas,
      canvasW: box ? Math.round(box.width) : 0,
      canvasH: box ? Math.round(box.height) : 0,
      globeAlive: !!state.globe,
      globeInstanceId: state.globeInstanceId || 0,
      globeError: String(state.globeError || ''),
      loading: !!state.loading,
      error: String(state.error || ''),
      dataReady: !!_glmReadModel,
      shipments: (state.rm && state.rm.shipments) ? state.rm.shipments.length : 0
    };
  };

  /* S8-B3-R3-CP2M-R4-R2 — THE MOUNT CONTINUATION NOW ASKS WHAT EVERY OTHER CONTINUATION ON THIS PAGE ASKS.

     `mount()`'s `.then` asked nothing. If the markup arrived after the operator had gone somewhere else it
     added `.active` to a section nobody was on, called `boot()` and resized the globe. AND boot's OWN guard
     cannot cover this: `var myNav = _glmNavGen` is captured when boot is CALLED, which here is already after
     the navigation, so the generation matches, the read goes out, the spinner is written and — measured —
     a WebGL globe is built for a page the operator left. The identity has to be captured at the ORIGINAL
     mount, which is the only moment that knows which navigation this continuation belongs to.

     WHY THE MARKUP IS LATE AT ALL, since on loopback it never is: app.js sends a route's partial and its
     scripts out together, `loadPartial` fetches with { cache: 'no-store' }, and the scripts are ordinary
     cacheable assets. On a return visit the scripts come from the cache and the partial is a real round
     trip, so the markup is routinely the LAST thing to arrive.

     TWO AUTHORITIES, NEITHER OF THEM NEW. The local navigation generation this page already keeps (bumped by
     unmount), and the shell's own `commitGuard(epoch, sectionId)` — the same contract site-priority.js,
     fc-summary.js and request-order.js use. Nothing per-page is invented, and when the shell's guard is
     absent the local generation still holds. */
  function mountSuperseded(myNav, epoch) {
    if (myNav !== _glmNavGen) return true;
    var lc = window.KM && window.KM.lifecycle;
    if (epoch !== undefined && lc && typeof lc.commitGuard === 'function'
        && !lc.commitGuard(epoch, 'global-logistics-map-section')) return true;
    return false;
  }

  KM.lifecycle.register('global-logistics-map-section', {
    /* LEAVE-AND-RETURN IS THE CASE NO OBSERVER CAN CLEAN UP. Both mounts join the SAME in-flight partial,
       so both continuations fire in one tick and both call boot(): two loads for one navigation, with the
       section legitimately active throughout. `.active` is CORRECT there — the duplication is the defect,
       and a late `.active` correction cannot see it. */
    mount: function (epoch) {
      var myNav = _glmNavGen;
      ensureMarkup().then(function (loaded) {
        if (mountSuperseded(myNav, epoch)) { _glmDiag.staleMountsBlocked++; return; }
        var sec = root(); if (sec) sec.classList.add('active');
        if (!loaded || !sec) return;
        boot();
        if (state.globe) state.globe.resize();
      });
    },
    /* Leaving retires the navigation AND the in-flight read. Without the first, a load started before the
       operator left still rendered on return; without the second, `ensureDb`'s own sequence guard was the
       only thing dropping the response, and it does not run until the promise settles. The globe instance
       and its host are deliberately NOT destroyed — they are what makes coming back cheap, and the probe
       shows the engine is created exactly once across a full leave-and-return. */
    unmount: function () { _glmNavGen++; _glmReadSeq++; closeDrawer(); }
  });
})();
