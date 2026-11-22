// STAGE 2 ROUTE_INIT (joint-a2s-route1, LOCAL CANDIDATE - not installed): the "imported-tracking" contract.
// An imported shipment (record_origin IMPORT_HISTORICAL) may carry ONE route snapshot of ONE validated route template plus ONE event that
// records only the position the user reported (node, time, source). Written only through the import framework (78_ validate / commit:
// lock, preview digest, journal undo, receipt, audit, replay) - never through Confirm & Dispatch: no stock, reservation, PO, allocation,
// status, quantity, supply-mode, receipt or document write. Design: ROUTE_INIT_DESIGN.md.
//   - Applicability = 22_ csdResolveTemplate_ itself (read through a per-request read cache, 22_ unchanged) + the origin rule below.
//   - Route rows: shipment_route_id SRI-xxxxxxxx; nodes before the reported node 'completed', the reported node 'current', later 'planned'
//     (what an advance to that node produces); actual_arrival_date / actual_departure_date are NEVER written (no fabricated arrival).
//   - The event uses the advance identity (route_node_reached, source_event_id route:<shipment_id>:<shipment_route_id>) so the map and a
//     later advance read one contract; source 'import', event_time = the REPORTED time (never the import time), created_by import:<batch>.
//   - Audit: one import_batch_changes row per route row (ROUTE_SNAPSHOT_CREATED) and per event (POSITION_REPORTED); never deleted.
//   - Readers prove an imported route with rtiImportedTrackingProof_ (31_ receipt gate). No new sheet or column; nothing is auto-created.
var RTI_BUILD_VERSION_ = 'ROUTE-INIT-A2ROUTE-OD1-RV1-AD2-AD3';   // b5: REVIEW_A2 m-4 / m-5 / m-7 / C-3   // b3: Owner route decisions D1-D4 (2026-11-20)
var RTI_PASSED_MARK_ = '依匯入位置推定已經過';   // D3: shown wherever an earlier node reads completed (never a per-station confirmation)
var RTI_KEYS_ = ['route_template_id', 'route_template_node_id', 'route_template_digest', 'position_as_of', 'position_source'];
var RTI_ROUTE_ID_PREFIX_ = 'SRI-';
var RTI_ROUTE_REQUIRED_ = ['shipment_route_id', 'shipment_id', 'route_template_id', 'route_template_node_id', 'sequence_no', 'status', 'created_at', 'updated_at'];
var RTI_EVENT_REQUIRED_ = ['shipment_event_id', 'shipment_id', 'shipment_route_id', 'event_sequence', 'event_time', 'event_type', 'event_status', 'source', 'source_event_id', 'note', 'created_by', 'created_at'];
var RTI_OPEN_STATUSES_ = { shipped: 1, in_transit: 1, arrived: 1, partially_received: 1, partial_received: 1 };
var RTI_RESULT_ROUTE_ = 'ROUTE_SNAPSHOT_CREATED', RTI_RESULT_EVENT_ = 'POSITION_REPORTED';

// ---- read cache: every sheet read once per request; 22_ readers run unchanged on it (getSheetByName -> getDataRange -> getValues) ----
function rtiCache_(ss) {
  var memo = Object.create(null);
  return { getSheetByName: function (n) {
    if (Object.prototype.hasOwnProperty.call(memo, n)) return memo[n];
    var sh = ss.getSheetByName(n); if (!sh) { memo[n] = null; return null; }
    var v = sh.getDataRange().getValues();
    memo[n] = { getDataRange: function () { return { getValues: function () { return v; } }; } };   // b5 (m-5): read-only callers (22_ resolver / nodes / destination, 87_) - no per-call copy
    return memo[n];
  } };
}
function rtiRows_(C, name) {
  var sh = C.getSheetByName(name); if (!sh) return null;
  var d = sh.getDataRange().getValues(), h = (d[0] || []).map(imbStr_), rows = [];
  for (var i = 1; i < d.length; i++) { var o = {}; for (var c = 0; c < h.length; c++) if (h[c]) o[h[c]] = d[i][c]; rows.push(o); }
  return { headers: h, rows: rows };
}
function rtiNum_(v) { if (v === '' || v === null || v === undefined) return null; var n = typeof v === 'number' ? v : parseFloat(String(v).trim()); return isFinite(n) ? n : null; }
function rtiCoordOk_(lat, lng) { var a = rtiNum_(lat), b = rtiNum_(lng); return a !== null && b !== null && a >= -90 && a <= 90 && b >= -180 && b <= 180 && !(a === 0 && b === 0); }

// ---- request split: the five route keys leave the Header rows BEFORE the existing column check (a file without them is the old contract) ----
function rtiSplitRequest_(req) {
  var choices = {}, any = false, header = (req.sheets && req.sheets.Header) || [];
  var stripped = header.map(function (r) {
    var o = {}, c = {}, has = false;
    Object.keys(r).forEach(function (k) { if (RTI_KEYS_.indexOf(k) >= 0) { c[k] = r[k]; has = true; } else o[k] = r[k]; });
    if (has) { choices[String(r.__row)] = c; any = true; }
    return o;
  });
  if (!any) return { req: req, choices: {} };
  var sheets = {}; Object.keys(req.sheets).forEach(function (k) { sheets[k] = req.sheets[k]; }); sheets.Header = stripped;
  return { req: Object.assign({}, req, { sheets: sheets }), choices: choices };
}
// a choice cell set -> { blank } | { incomplete, missing } | { choice }
function rtiReadChoice_(c) {
  if (!c) return { blank: true };
  var v = {}, filled = 0; RTI_KEYS_.forEach(function (k) { v[k] = imbStr_(c[k] instanceof Date ? shiCutoff_(c[k]) : c[k]); if (v[k]) filled++; });
  if (!filled) return { blank: true };
  if (filled < RTI_KEYS_.length) return { incomplete: true, missing: RTI_KEYS_.filter(function (k) { return !v[k]; }) };
  return { choice: v };
}

// ---- schema: the existing sheets / columns, never created here ----
function rtiSchema_(C) {
  var miss = [];
  [['shipment_routes', RTI_ROUTE_REQUIRED_], ['shipment_events', RTI_EVENT_REQUIRED_], ['shipment_route_templates', ['route_template_id']], ['shipment_route_template_nodes', ['route_template_id', 'route_template_node_id', 'node_sequence']]].forEach(function (p) {
    var t = rtiRows_(C, p[0]); if (!t) { miss.push(p[0] + ' (sheet)'); return; }
    p[1].forEach(function (k) { if (t.headers.indexOf(k) < 0) miss.push(p[0] + '.' + k); });
  });
  return miss;
}

// ---- template digest: the template row + its node rows, canonical (any edit between Validate and Apply changes it) ----
function rtiTemplateDigest_(C, templateId) {
  C.__dig = C.__dig || Object.create(null); if (C.__dig[templateId] !== undefined) return C.__dig[templateId];   // b5 (m-5)
  return (C.__dig[templateId] = rtiTemplateDigestRaw_(C, templateId));
}
function rtiTemplateDigestRaw_(C, templateId) {
  var t = rtiRows_(C, 'shipment_route_templates'), n = rtiRows_(C, 'shipment_route_template_nodes');
  if (!t || !n) return '';
  function canon(r) { var o = {}; Object.keys(r).sort().forEach(function (k) { o[k] = shiCanonCell_(r[k]); }); return o; }
  var tr = t.rows.filter(function (r) { return imbStr_(r.route_template_id) === templateId; }).map(canon);
  var nr = n.rows.filter(function (r) { return imbStr_(r.route_template_id) === templateId; }).map(canon).sort(function (a, b) { return a.route_template_node_id < b.route_template_node_id ? -1 : (a.route_template_node_id > b.route_template_node_id ? 1 : 0); });
  return 'rt1:' + imbSha_(JSON.stringify({ t: tr, n: nr })).slice(0, 16);
}

// ---- candidates: 22_ csdResolveTemplate_ (unchanged) answers applicability; the origin rule is added on top ----
// facts = { source_warehouse_id, destination_warehouse_id, country, carrier_id, shipping_method, last_mile_delivery, warehouse_code }
function rtiCandidates_(C, facts) {   // b5 (m-5): one computation per facts tuple per request; an exception fails only this row (UNAVAILABLE + reason)
  var k_ = ['source_warehouse_id', 'destination_warehouse_id', 'warehouse_id', 'country', 'carrier_id', 'shipping_method', 'last_mile_delivery', 'warehouse_code'].map(function (x) { return imbStr_(facts[x]); }).join('\u0001');
  C.__cand = C.__cand || Object.create(null); if (C.__cand[k_]) return C.__cand[k_];
  var r_; try { r_ = rtiCandidatesRaw_(C, facts); } catch (e) { r_ = { status: 'UNAVAILABLE', reason: 'ROUTE_INIT_CANDIDATES_FAILED: ' + String(e && e.message || e).slice(0, 200), candidates: [] }; }
  return (C.__cand[k_] = r_);
}
function rtiCandidatesRaw_(C, facts) {
  var out = { status: 'NONE', reason: '', candidates: [] };
  if (typeof csdResolveTemplate_ !== 'function' || typeof csdTemplateNodes_ !== 'function' || typeof csdRouteDestination16_ !== 'function') { out.status = 'UNAVAILABLE'; out.reason = 'DEPLOYMENT_HALF_SYNCED (22_ resolver absent)'; return out; }
  if (!imbStr_(facts.carrier_id)) { out.reason = 'ROUTE_INIT_CARRIER_REQUIRED'; return out; }
  if (!imbStr_(facts.shipping_method)) { out.reason = 'ROUTE_INIT_METHOD_REQUIRED'; return out; }
  var sc = function (name) { var x = facts[name]; return x === undefined || x === null ? '' : String(x).trim(); };
  var dest; try { dest = csdRouteDestination16_(C, sc); } catch (eD) { dest = { ok: false, error: 'ROUTE_DESTINATION_READ_FAILED' }; }
  if (!dest.ok) { out.reason = 'ROUTE_INIT_DESTINATION_INVALID: ' + dest.error; return out; }
  var tt = rtiRows_(C, 'shipment_route_templates'); if (!tt) { out.status = 'UNAVAILABLE'; out.reason = 'shipment_route_templates sheet not found'; return out; }
  // AD3 A (integration fix, t-route-init): pass 1 = the resolver WITHOUT the origin-first filter (skipOrigin), so the D1 rule below still names the
  // specific reason (ORIGIN_MISMATCH / TEMPLATE_ORIGIN_UNDECLARED / SOURCE_COUNTRY_UNKNOWN) exactly as before; pass 2 (origin-first, = Confirm) is added
  // after D1 so a domestic template outranked by a foreign one in pass 1 is still listed. Listed templates always satisfy the origin rule.
  var idsOf = function (o) { var b; try { b = csdResolveTemplate_(C, sc, '', o); } catch (eR) { b = { ok: false, error: 'ROUTE_RESOLVER_FAILED ' + String(eR && eR.message || eR) }; }
    var r = []; if (b.ok) r = [b.templateId];
    else if (/^Multiple route templates match/.test(String(b.error))) { var seen = {}; tt.rows.forEach(function (x0) { var id = imbStr_(x0.route_template_id); if (id && !seen[id]) { seen[id] = 1; var x; try { x = csdResolveTemplate_(C, sc, id, o); } catch (e2) { x = { ok: false }; } if (x.ok) r.push(id); } }); }
    return { base: b, ids: r }; };
  var p1 = idsOf({ skipOrigin: true }), base = p1.base, ids = p1.ids;
  if (base.ok || /^Multiple route templates match/.test(String(base.error))) { /* listed below */ }
  else { out.reason = /^No active route template|^No route templates exist/.test(String(base.error)) ? 'ROUTE_INIT_NO_TEMPLATE' : ('ROUTE_INIT_RESOLVER_REFUSED: ' + base.error); return out; }
  // D1 (Owner 2026-11-20): origin compatibility must be PROVEN. The source warehouse's master country is ONE legal 2-letter code (never guessed
  // from an id or a name); a template is listed only with a NON-blank origin_country equal to it (+ origin_warehouse_id when set). Confirm (22_) unchanged.
  var wh = rtiRows_(C, 'warehouses'), src = wh ? wh.rows.filter(function (r) { return imbStr_(r.warehouse_id) === imbStr_(facts.source_warehouse_id); }) : [];
  var srcRaw = src.length === 1 ? imbStr_(src[0].country) : '', srcCountry = /^[A-Za-z]{2}$/.test(srcRaw) ? srcRaw.toUpperCase() : '';
  if (!srcCountry) { out.reason = 'ROUTE_INIT_SOURCE_COUNTRY_UNKNOWN: ' + (src.length === 1 ? 'warehouses.country of ' + imbStr_(facts.source_warehouse_id) + ' is ' + (srcRaw ? 'not a 2-letter country code (' + srcRaw + ')' : 'blank') : (src.length ? 'warehouse ' + imbStr_(facts.source_warehouse_id) + ' appears ' + src.length + ' times in warehouses' : 'source warehouse ' + imbStr_(facts.source_warehouse_id) + ' is not in warehouses')) + ' - fix the warehouse master; no route is guessed'; return out; }
  var dropped = [], undeclared = [];
  ids = ids.filter(function (id) {
    var row = tt.rows.filter(function (r) { return imbStr_(r.route_template_id) === id; })[0] || {};
    var oc = imbStr_(row.origin_country).toUpperCase(), ow = imbStr_(row.origin_warehouse_id);
    if (ow && ow !== imbStr_(facts.source_warehouse_id)) { dropped.push(id + ' origin_warehouse_id ' + ow); return false; }
    if (!oc) { undeclared.push(id); return false; }   // D1: a blank template origin never skips the origin check (shipment_route_templates.origin_country)
    if (oc && oc !== srcCountry) { dropped.push(id + ' origin_country ' + oc + ' vs factory ' + srcCountry); return false; }
    return true;
  });
  idsOf({}).ids.forEach(function (id) { if (ids.indexOf(id) >= 0) return; var row = tt.rows.filter(function (r) { return imbStr_(r.route_template_id) === id; })[0] || {}, ow = imbStr_(row.origin_warehouse_id);   // AD3 A pass 2
    if (imbStr_(row.origin_country).toUpperCase() === srcCountry && (!ow || ow === imbStr_(facts.source_warehouse_id))) ids.push(id); });
  ids.forEach(function (id) {
    var row = tt.rows.filter(function (r) { return imbStr_(r.route_template_id) === id; })[0] || {};
    var nodes = csdTemplateNodes_(C, id), bd = typeof csdBindDestinationPlaceholder_ === 'function' ? csdBindDestinationPlaceholder_(C, sc, nodes) : null;   // A-delta2 R: the preview shows the SAME per-shipment binding the writer uses
    if (bd) nodes = bd.nodes;
    if (typeof csdBindSourcePickup3_ === 'function') nodes = csdBindSourcePickup3_(C, sc, nodes).nodes;   // AD3 A: the preview shows the bound source pickup too
    if (typeof csdDomesticTerminalCheck3_ === 'function') { var dt3 = csdDomesticTerminalCheck3_(C, sc, nodes); if (!dt3.ok) { dropped.push(id + ' terminal not the saved destination (' + dt3.why + ')'); return; } }   // AD3 A: domestic snapshot must end at the destination
    out.candidates.push({ route_template_id: id, template_name: imbStr_(row.route_template_name) || id, route_version: imbStr_(row.route_version), template_digest: rtiTemplateDigest_(C, id),
      nodes: nodes.map(function (n) { var b = bd && bd.binding.applied && bd.binding.node_id === n.nodeId; return { route_template_node_id: n.nodeId, sequence_no: n.seq, label: (b ? n.locationName + ' (' + bd.binding.warehouse_id + ')' : (n.locationName || n.nodeCode || ('#' + n.seq))), node_type: n.nodeType, country: n.country, coordinates: rtiNodeCoordKind_(C, n),
        destination_binding: b ? { warehouse_id: bd.binding.warehouse_id, name: n.locationName, source: bd.binding.source } : undefined }; }) });
  });
  out.status = out.candidates.length === 0 ? 'NONE' : (out.candidates.length === 1 ? 'ONE' : 'MULTIPLE');
  if (!out.candidates.length) out.reason = dropped.length ? 'ROUTE_INIT_ORIGIN_MISMATCH: ' + dropped.slice(0, 5).join('; ') + (undeclared.length ? '; origin_country blank on ' + undeclared.slice(0, 5).join(', ') : '')
    : (undeclared.length ? 'ROUTE_INIT_TEMPLATE_ORIGIN_UNDECLARED: shipment_route_templates.origin_country is blank on ' + undeclared.slice(0, 10).join(', ') + ' - set it to the template\'s real origin country (2-letter code) to list it; no template is assumed to fit' : 'ROUTE_INIT_NO_TEMPLATE');
  if (dropped.length) out.origin_excluded = dropped.slice(0, 20);
  if (undeclared.length) out.origin_undeclared = undeclared.slice(0, 20);
  return out;
}
function rtiNodeCoordKind_(C, n) {
  if (rtiCoordOk_(n.latitude, n.longitude)) return 'INLINE';
  if (n.logisticsLocationId) { var L = rtiRows_(C, 'logistics_locations'); var hit = L ? L.rows.filter(function (r) { return imbStr_(r.logistics_location_id) === n.logisticsLocationId; }) : [];
    if (hit.length === 1 && rtiCoordOk_(hit[0].latitude, hit[0].longitude)) return 'LOCATION_REF'; }
  return 'PENDING';
}

// ---- one chosen position, checked against the CURRENT masters (Validate and again at Apply under the lock) ----
// -> { ok, templateId, digest, nodes, target, positionAt, source, coord } or pushes issues and returns { ok: false }
function rtiResolveChoice_(C, facts, choice, cands, issues, sn, rowNo, warnings) {
  var bad = function (field, code, msg, val) { imbIssue_(issues, sn, rowNo, field, code, msg, val); return { ok: false }; };
  if (cands.status === 'UNAVAILABLE') return bad('route_template_id', 'ROUTE_INIT_UNAVAILABLE', 'route templates cannot be read (' + cands.reason + ') - no position can be set', choice.route_template_id);
  var c = cands.candidates.filter(function (x) { return x.route_template_id === choice.route_template_id; })[0];
  if (!c) return bad('route_template_id', cands.candidates.length ? 'ROUTE_INIT_TEMPLATE_NOT_APPLICABLE' : (cands.reason.split(':')[0] || 'ROUTE_INIT_NO_TEMPLATE'),
    'route template ' + choice.route_template_id + ' is not an applicable template for this shipment (' + (cands.candidates.length ? 'applicable: ' + cands.candidates.map(function (x) { return x.route_template_id; }).join(', ') : cands.reason || 'none applicable') + '); nothing is guessed', choice.route_template_id);
  if (c.template_digest !== choice.route_template_digest) return bad('route_template_digest', 'ROUTE_INIT_TEMPLATE_CHANGED', 'route template ' + c.route_template_id + ' changed since the preview - validate again and choose the position again', choice.route_template_digest);
  var nodes = csdTemplateNodes_(C, c.route_template_id), ids = {}, seqs = {}, dupe = false;
  nodes.forEach(function (n) { if (!n.nodeId || ids[n.nodeId] || seqs[n.seq]) dupe = true; ids[n.nodeId] = 1; seqs[n.seq] = 1; });
  if (nodes.length < 2 || dupe) return bad('route_template_id', 'ROUTE_INIT_TEMPLATE_INVALID', 'route template ' + c.route_template_id + ' needs at least 2 nodes with unique node ids and sequences (found ' + nodes.length + (dupe ? ', duplicates' : '') + ')', c.route_template_id);
  // A-delta2 R (Owner rule 4): the destination placeholder is bound PER SHIPMENT on a copy (22_ csdBindDestinationPlaceholder_); the template is unchanged
  var bind = { applied: false, reason: 'BINDER_ABSENT', source: '' };
  if (typeof csdBindDestinationPlaceholder_ === 'function') { var sc0 = function (name) { var x = facts[name]; return x === undefined || x === null ? '' : String(x).trim(); }; var b0 = csdBindDestinationPlaceholder_(C, sc0, nodes); nodes = b0.nodes; bind = b0.binding; }
  var srcBind = { applied: false, reason: 'BINDER_ABSENT', source: '' };   // AD3 A: the pickup node bound to the real source on a copy (22_ csdBindSourcePickup3_)
  if (typeof csdBindSourcePickup3_ === 'function') { var sc1 = function (name) { var x = facts[name]; return x === undefined || x === null ? '' : String(x).trim(); }; var b1 = csdBindSourcePickup3_(C, sc1, nodes); nodes = b1.nodes; srcBind = b1.binding; }
  var tIdx = -1; nodes.forEach(function (n, i) { if (n.nodeId === choice.route_template_node_id) tIdx = i; });
  if (tIdx < 0) return bad('route_template_node_id', 'ROUTE_INIT_NODE_NOT_IN_TEMPLATE', 'node ' + choice.route_template_node_id + ' is not a node of route template ' + c.route_template_id, choice.route_template_node_id);
  var at = shiCutoff_(choice.position_as_of);
  // D4 (Owner 2026-11-20): ONE rule - yyyy-MM-dd HH:mm read in the project time zone (shiTz_ = Session.getScriptTimeZone); not in the future; its DATE not before the ETD date
  if (!at) return bad('position_as_of', 'ROUTE_INIT_POSITION_TIME_INVALID', '回報時間須為 yyyy-MM-dd HH:mm，以系統時區 ' + shiTz_() + ' 解讀（收到：' + imbStr_(choice.position_as_of) + '）', choice.position_as_of);
  if (at + ':00' > imbNow_()) return bad('position_as_of', 'ROUTE_INIT_POSITION_TIME_IN_FUTURE', '回報時間 ' + at + '（' + shiTz_() + '）晚於現在 ' + imbNow_().slice(0, 16) + '：位置回報不能是未來時間', at);
  var etd = shiDateText_(facts.etd); if (etd && at.slice(0, 10) < etd) return bad('position_as_of', 'ROUTE_INIT_POSITION_TIME_BEFORE_ETD', '回報時間 ' + at + '（' + shiTz_() + '）早於工廠出貨日 ETD ' + etd + '：貨物出廠前不會在路上。請確認回報時間或這票的 ETD（兩者矛盾，未寫入）', at);
  var src = imbStr_(choice.position_source);
  if (src.length < 2 || src.length > 200) return bad('position_source', 'ROUTE_INIT_POSITION_SOURCE_INVALID', 'say where the position comes from (2-200 characters), e.g. the forwarder message', src);
  if (/\[SC13_/.test(src)) return bad('position_source', 'IMPORT_LINEAGE_MARKER_PROTECTED', 'the source text may not contain a system marker [SC13_...]', '');
  var coord = rtiNodeCoordKind_(C, nodes[tIdx]);
  if (coord === 'PENDING' && warnings) warnings.push({ code: 'ROUTE_INIT_NODE_COORDINATES_PENDING', message: 'node ' + nodes[tIdx].nodeId + ' has no map coordinates (node or logistics location): the shipment is listed as Coordinate Pending, never drawn at a guessed point' });
  return { ok: true, templateId: c.route_template_id, digest: c.template_digest, nodes: nodes, target: tIdx, positionAt: at, source: src, coord: coord, binding: bind, srcBinding: srcBind };
}

// ---- ADD_NEW hook (80_ shiValidateAdd_): candidates for every header, the choices checked; plan / preview attached by rtiPlanAdd_ / rtiPreviewAdd_ ----
function rtiValidateAdd_(ss, heads, order, choices, issues, state) {
  var C = rtiCache_(ss), anyChoice = false, schema = null;
  order.forEach(function (k0) {
    var h = heads[k0], v = h.v || {}, ch = rtiReadChoice_(choices[String(h.row)]);
    var facts = { source_warehouse_id: v.source_warehouse_id, destination_warehouse_id: v.destination_warehouse_id, warehouse_id: '', country: v.country, carrier_id: v.carrier_id, shipping_method: v.shipping_method, last_mile_delivery: v.last_mile_delivery, warehouse_code: h.warehouse_code || '', etd: v.etd };
    var cands = (v.source_warehouse_id && v.destination_warehouse_id && v.country) ? rtiCandidates_(C, facts) : { status: 'NONE', reason: 'ROUTE_INIT_ROW_INCOMPLETE', candidates: [] };
    h.routeInfo = { status: cands.status, reason: cands.reason, candidates: cands.candidates, chosen: null, origin_undeclared: cands.origin_undeclared || [], origin_excluded: cands.origin_excluded || [] };   // b5 (m-4)
    if (ch.blank) return;
    anyChoice = true;
    if (ch.incomplete) { imbIssue_(issues, 'Header', h.row, ch.missing[0], 'ROUTE_INIT_CHOICE_INCOMPLETE', 'a Current Position needs all of ' + RTI_KEYS_.join(', ') + ' (missing ' + ch.missing.join(', ') + ')', ''); return; }
    if (schema === null) { schema = rtiSchema_(C); if (schema.length) imbIssue_(issues, '', '', schema.join(','), 'ROUTE_INIT_SCHEMA_MISSING', 'a Current Position cannot be recorded: missing ' + schema.join(', ') + ' (an approved schema change adds them; nothing is auto-created)'); }
    if (schema.length) return;
    if (h.unchanged) { imbIssue_(issues, 'Header', h.row, 'route_template_id', 'ROUTE_INIT_ON_EXISTING_SHIPMENT', 'this row is already imported as ' + h.unchanged + ' - set its Current Position with the separate per-batch entry (ROUTE_INIT), never by re-importing', h.ext); return; }
    var r = rtiResolveChoice_(C, facts, ch.choice, cands, issues, 'Header', h.row, h.warnings);
    if (!r.ok) return;
    h.route = r; h.routeInfo.chosen = { route_template_id: r.templateId, route_template_node_id: r.nodes[r.target].nodeId, sequence_no: r.nodes[r.target].seq, position_as_of: r.positionAt, coordinates: r.coord };
    state.routes = state.routes || {}; state.routes[k0] = [r.templateId, r.digest, r.nodes[r.target].nodeId, r.positionAt, r.source];
  });
  return anyChoice;
}
function rtiPlanAdd_(plan, heads) { plan.shipments.forEach(function (s) { var h = heads[s.ref]; s.route = h && h.route ? h.route : null; }); }
function rtiPreviewAdd_(preview, heads, order, issues) {
  var nR = 0, nE = 0;
  order.forEach(function (k0) { var h = heads[k0];
    (preview.rows || []).forEach(function (p) { if (p.sheet === 'Header' && p.row === h.row) p.route = h.routeInfo || null; });
    if (h.route && !h.unchanged) { nR += h.route.nodes.length; nE++; } });
  if (issues.length) { nR = 0; nE = 0; }
  if (preview.impacts) { preview.impacts.shipment_routes = nR; preview.impacts.shipment_events = nE; }
  if (preview.counts && nE) preview.counts.positions_set = nE;   // absent when no position is set: a no-choice receipt row_counts_json stays byte-identical
}

// ---- the writer (ADD_NEW and ROUTE_INIT): events first (one append), routes last (one append), audit via the 78_ journal ----
// items = [{ sid, etd, r (rtiResolveChoice_ result) }]
function rtiWrite_(ss, items, ctx) {
  if (!items.length) return { routes: 0, events: 0, positions: [] };
  var J = ctx.journal, now = ctx.now, actor = 'import:' + ctx.batch_id;
  var rt = shiTable_(ss, 'shipment_routes'), ev = shiTable_(ss, 'shipment_events');
  if (!rt || !ev) throw new Error('ROUTE_INIT_SCHEMA_MISSING shipment_routes / shipment_events');
  var miss = RTI_ROUTE_REQUIRED_.filter(function (k) { return !rt.has(k); }).concat(RTI_EVENT_REQUIRED_.filter(function (k) { return !ev.has(k); }));
  if (miss.length) throw new Error('ROUTE_INIT_SCHEMA_MISSING ' + miss.join(','));
  var taken = {}; rt.rows.forEach(function (r) { taken[imbStr_(r.shipment_route_id)] = 1; }); ev.rows.forEach(function (r) { taken[imbStr_(r.shipment_event_id)] = 1; });
  function mint(prefix) { for (var i = 0; i < 20; i++) { var id = prefix + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase(); if (!taken[id]) { taken[id] = 1; return id; } } throw new Error('ROUTE_INIT_ID_SPACE_EXHAUSTED'); }
  var routeRows = [], eventRows = [], positions = [];
  items.forEach(function (it) {
    var sid = it.sid, r = it.r;
    if (rt.rows.some(function (x) { return imbStr_(x.shipment_id) === sid; })) throw new Error('ROUTE_INIT_ALREADY_INITIALISED ' + sid);
    var seq = 0; ev.rows.forEach(function (x) { if (imbStr_(x.shipment_id) === sid) { var n = rtiNum_(x.event_sequence); if (n !== null && n > seq) seq = n; } });
    var targetSrid = '', tn = r.nodes[r.target];
    r.nodes.forEach(function (n, i) {
      var srid = mint(RTI_ROUTE_ID_PREFIX_), ok = rtiCoordOk_(n.latitude, n.longitude), st = r.manual ? (i === 0 ? 'completed' : 'planned') : (i < r.target ? 'completed' : (i === r.target ? 'current' : 'planned'));   // AD3 A: manual = origin completed, destination planned
      if (i === r.target) targetSrid = srid;
      var row = { shipment_route_id: srid, shipment_id: sid, route_template_id: r.templateId, route_template_node_id: n.nodeId, sequence_no: n.seq, node_type: n.nodeType, node_code: n.nodeCode,
        location_ref_type: n.locationRefType ? n.locationRefType : (n.logisticsLocationId ? 'logistics_location' : ''), location_ref_id: n.locationRefType ? n.locationRefId : (n.logisticsLocationId || ''), location_name: n.locationName, country: n.country, region: n.region, city: n.city,
        latitude: ok ? rtiNum_(n.latitude) : '', longitude: ok ? rtiNum_(n.longitude) : '', transport_mode: n.transportMode, planned_event_type: n.plannedEventType,
        planned_arrival_date: typeof csdOffsetDate_ === 'function' ? csdOffsetDate_(shiDateText_(it.etd), n.offsetDays) : '', planned_departure_date: '', actual_arrival_date: '', actual_departure_date: '',
        status: st, created_at: now, updated_at: now };
      routeRows.push(row);
      J.change({ entity_table: 'shipment_routes', entity_id: sid, line_id: srid, field: '(row)', before: '', after: [r.templateId, n.nodeId, n.seq, st, r.digest].concat(st === 'completed' ? [RTI_PASSED_MARK_] : []).concat(n.locationRefType === 'warehouse' && r.binding && r.binding.applied && r.binding.node_id === n.nodeId ? ['DESTINATION_PLACEHOLDER=' + r.binding.source] : []).concat(r.srcBinding && r.srcBinding.applied && r.srcBinding.node_id === n.nodeId ? ['SOURCE_PICKUP=' + r.srcBinding.source] : []).concat(r.manual ? ['MANUAL_LOGISTICS', 'BOUND=warehouse:' + n.locationRefId] : []).join('|'), result: RTI_RESULT_ROUTE_ });   // AD3 A: + source pickup / manual marks   // D3: the audit says the earlier node is inferred
    });
    var okT = rtiCoordOk_(tn.latitude, tn.longitude), sevId = mint('SEV-');
    if (r.manual) eventRows.push({ shipment_event_id: sevId, shipment_id: sid, shipment_route_id: targetSrid, event_sequence: seq + 1, event_time: r.positionAt + ':00', event_type: 'manual_in_transit', event_status: 'in_transit',   // AD3 A: manual snapshot, reported in transit
      location_name: '', country: '', city: '', latitude: '', longitude: '', source: 'manual', source_event_id: 'manual-init:' + sid, raw_status: 'MANUAL POSITION: IN TRANSIT (ROUTE_INIT)',
      note: ('Manual logistics (no route template) set at import (' + r.positionAt + ', ' + shiTz_() + ') | destination ' + r.nodes[1].locationRefId + ' | ' + r.source).slice(0, 500), created_by: actor, created_at: now, updated_by: actor, updated_at: now });
    else eventRows.push({ shipment_event_id: sevId, shipment_id: sid, shipment_route_id: targetSrid, event_sequence: seq + 1, event_time: r.positionAt + ':00', event_type: 'route_node_reached', event_status: 'current',
      location_name: tn.locationName, country: tn.country, city: tn.city, latitude: okT ? rtiNum_(tn.latitude) : '', longitude: okT ? rtiNum_(tn.longitude) : '',
      source: 'import', source_event_id: shipRouteEventSourceId_(sid, targetSrid), raw_status: 'POSITION REPORTED AT IMPORT',
      note: ('Position reported at import (' + r.positionAt + ', ' + shiTz_() + '): ' + r.source + (r.target > 0 ? ' | 較早的 ' + r.target + ' 個節點：' + RTI_PASSED_MARK_ + '（非逐站確認，無實際到站時間）' : '')).slice(0, 500), created_by: actor, created_at: now, updated_by: actor, updated_at: now });
    J.change({ entity_table: 'shipment_events', entity_id: sid, line_id: sevId, field: '(row)', before: '', after: [tn.nodeId, r.positionAt, r.source].join('|').slice(0, 1000), result: RTI_RESULT_EVENT_ });
    positions.push({ shipment_id: sid, route_template_id: r.templateId, route_template_node_id: tn.nodeId, sequence_no: tn.seq, shipment_route_id: targetSrid, shipment_event_id: sevId, position_as_of: r.positionAt, coordinates: r.coord });
  });
  J.appendRows(ev.sheet, ev.headers, eventRows);
  J.appendRows(rt.sheet, rt.headers, routeRows);
  return { routes: routeRows.length, events: eventRows.length, positions: positions };
}
function rtiApplyAdd_(ss, plan, ctx, created) {
  var items = [];
  plan.shipments.forEach(function (s, i) { if (s.route) items.push({ sid: created[i].shipment_id, etd: s.v.etd, r: s.route }); });
  return rtiWrite_(ss, items, ctx);
}

// ---- AD3 A (Owner rule 6): the MANUAL logistics snapshot for an imported shipment (22_ csdManualRouteNodes3_: 2 nodes bound to the saved source /
// destination). Offered only when no template applies; position time + source text follow the same D4 rules as a template position. ----
function rtiManualInfo_(C, facts, cands) {
  var v = { available: false, reason: '', origin_warehouse_id: '', destination_warehouse_id: '', coordinates: null }, out = { view: v, built: null };
  if (typeof csdManualRouteNodes3_ !== 'function') { v.reason = 'DEPLOYMENT_HALF_SYNCED (22_ manual builder absent)'; return out; }
  if (cands.status === 'ONE' || cands.status === 'MULTIPLE') { v.reason = 'ROUTE_INIT_MANUAL_NOT_ALLOWED_TEMPLATE_APPLIES'; return out; }
  if (cands.status === 'UNAVAILABLE') { v.reason = 'ROUTE_INIT_UNAVAILABLE'; return out; }
  var sc = function (name) { var x = facts[name]; return x === undefined || x === null ? '' : String(x).trim(); };
  // Owner supplement 1: a manual snapshot needs a non-blank LEGAL carrier (ONE active carriers row) or the server-owned to-be-assigned marker
  if (sc('carrier_id')) { var cl = typeof csdCarrierLegal3_ === 'function' ? csdCarrierLegal3_(C, sc('carrier_id')) : { ok: false, why: 'DEPLOYMENT_HALF_SYNCED' };
    if (!cl.ok) { v.reason = 'ROUTE_INIT_MANUAL_CARRIER_NOT_LEGAL: carrier ' + sc('carrier_id') + ' (' + cl.why + ')'; return out; } }
  else if (!(typeof csdCarrierToBeAssigned3_ === 'function' && csdCarrierToBeAssigned3_(sc))) { v.reason = 'ROUTE_INIT_MANUAL_CARRIER_REQUIRED: the carrier is blank and the shipment has no to-be-assigned marker'; return out; }
  var mp; try { mp = csdManualRouteNodes3_(C, sc); } catch (e) { mp = { ok: false, code: 'ROUTE_MANUAL_BUILD_FAILED', missing_field: String(e && e.message || e).slice(0, 200) }; }
  if (!mp.ok) { v.reason = 'ROUTE_INIT_' + String(mp.code || '').replace(/^ROUTE_/, '') + (mp.missing_field ? ': ' + mp.missing_field : ''); return out; }
  v.available = true; v.origin_warehouse_id = mp.info.origin_warehouse_id; v.destination_warehouse_id = mp.info.destination_warehouse_id; v.coordinates = mp.info.coordinates;
  out.built = mp; return out;
}
function rtiManualChoice_(C, facts, r, mInfo, issues, sn, rowNo, warnings) {
  var bad = function (field, code, msg, val) { imbIssue_(issues, sn, rowNo, field, code, msg, val); return { ok: false }; };
  if (!mInfo.built) return bad('route_mode', String(mInfo.view.reason || 'ROUTE_INIT_MANUAL_UNAVAILABLE').split(':')[0], 'manual logistics cannot be set for this shipment (' + mInfo.view.reason + ')', 'MANUAL');
  var at = shiCutoff_(r.position_as_of);
  if (!at) return bad('position_as_of', 'ROUTE_INIT_POSITION_TIME_INVALID', '回報時間須為 yyyy-MM-dd HH:mm，以系統時區 ' + shiTz_() + ' 解讀（收到：' + imbStr_(r.position_as_of) + '）', r.position_as_of);
  if (at + ':00' > imbNow_()) return bad('position_as_of', 'ROUTE_INIT_POSITION_TIME_IN_FUTURE', '回報時間 ' + at + '（' + shiTz_() + '）晚於現在 ' + imbNow_().slice(0, 16) + '：位置回報不能是未來時間', at);
  var etd = shiDateText_(facts.etd); if (etd && at.slice(0, 10) < etd) return bad('position_as_of', 'ROUTE_INIT_POSITION_TIME_BEFORE_ETD', '回報時間 ' + at + '（' + shiTz_() + '）早於工廠出貨日 ETD ' + etd + '：貨物出廠前不會在路上。請確認回報時間或這票的 ETD（兩者矛盾，未寫入）', at);
  var src = imbStr_(r.position_source);
  if (src.length < 2 || src.length > 200) return bad('position_source', 'ROUTE_INIT_POSITION_SOURCE_INVALID', 'say why there is no route and where the position comes from (2-200 characters)', src);
  if (/\[SC13_/.test(src)) return bad('position_source', 'IMPORT_LINEAGE_MARKER_PROTECTED', 'the source text may not contain a system marker [SC13_...]', '');
  var mp = mInfo.built, nodes = mp.nodes;
  var digest = 'manual1:' + imbSha_(JSON.stringify(nodes.map(function (n) { return [n.nodeId, n.seq, n.locationRefId, n.locationName, n.country, n.region, n.city, n.latitude, n.longitude]; }))).slice(0, 16);
  if ((mp.info.coordinates.origin === 'PENDING' || mp.info.coordinates.destination === 'PENDING') && warnings) warnings.push({ code: 'ROUTE_INIT_NODE_COORDINATES_PENDING', message: 'manual logistics: a bound warehouse has no map coordinates - listed as Coordinate Pending, never drawn at a guessed point' });
  return { ok: true, manual: true, templateId: mp.templateId, digest: digest, nodes: nodes, target: 0, positionAt: at, source: src, coord: mp.info.coordinates.origin === 'MASTER' ? 'LOCATION_REF' : 'PENDING', binding: { applied: false, reason: 'MANUAL_ROUTE', source: '' } };
}
// ---- ROUTE_INIT mode: existing imported shipments, one source import batch per request, explicit preview then Apply ----
function rtiValidateInit_(ss, req) {
  var issues = [], scope = req.scope || {}, C = rtiCache_(ss), plan = { mode: 'ROUTE_INIT', items: [] }, rows = [];
  var co = shiCompanyCheck_(ss, scope.company), company = co.code ? '' : co.company, src = imbStr_(scope.source_import_batch_id);
  var state = { mode: 'ROUTE_INIT', company: imbStr_(scope.company), source: src, ships: {}, routes: {} };
  if (co.code) imbIssue_(issues, '', '', 'scope.company', co.code, co.message, imbStr_(scope.company));
  var S = typeof imbSheets_ === 'function' ? imbSheets_(ss) : null, rc = S && src ? imbFindReceipt_(S, src) : null;
  if (!src) imbIssue_(issues, '', '', 'scope.source_import_batch_id', 'ROUTE_INIT_SOURCE_BATCH_REQUIRED', 'name the import batch whose shipments get a position (one batch per approval)');
  else if (!rc) imbIssue_(issues, '', '', 'scope.source_import_batch_id', 'ROUTE_INIT_SOURCE_BATCH_NOT_FOUND', 'no import batch ' + src, src);
  else if (imbStr_(rc.domain) !== 'shipment' || imbStr_(rc.mode) !== 'ADD_NEW') imbIssue_(issues, '', '', 'scope.source_import_batch_id', 'ROUTE_INIT_SOURCE_BATCH_NOT_ADD_NEW', 'batch ' + src + ' is not a shipment Add New batch', src);
  else if (imbStr_(rc.status) !== 'COMMITTED') imbIssue_(issues, '', '', 'scope.source_import_batch_id', 'ROUTE_INIT_SOURCE_BATCH_NOT_COMMITTED', 'batch ' + src + ' reads ' + imbStr_(rc.status) + ' - reconcile it first; nothing is initialised on an unresolved batch', src);
  state.batch_status = rc ? imbStr_(rc.status) : '';
  if ((req.sheets.Lines || []).length) imbIssue_(issues, 'Lines', '', '', 'ROUTE_INIT_LINES_NOT_ALLOWED', 'a position request has Header rows only');
  var schema = rtiSchema_(C); if (schema.length) imbIssue_(issues, '', '', schema.join(','), 'ROUTE_INIT_SCHEMA_MISSING', 'a Current Position cannot be recorded: missing ' + schema.join(', ') + ' (nothing is auto-created)');
  var db = shiDb_(ss), rt = rtiRows_(C, 'shipment_routes'), ev = rtiRows_(C, 'shipment_events'), seenSid = {};
  (req.sheets.Header || []).forEach(function (r) {
    var sn = 'Header', n0 = issues.length;
    Object.keys(r).forEach(function (k) { if (k !== '__row' && k !== 'shipment_id' && k !== 'route_mode' && RTI_KEYS_.indexOf(k) < 0) imbIssue_(issues, sn, r.__row, k, 'IMPORT_COLUMN_UNKNOWN', 'a position request reads shipment_id + route_mode + ' + RTI_KEYS_.join(', ') + ' only (' + k + ')'); });   // AD3 A: + route_mode
    var sid = imbStr_(r.shipment_id), hs = db.byId[sid] || [], h = hs[0] || {}, row = { sheet: sn, row: r.__row, shipment_id: sid, shipment_no: imbStr_(h.shipment_no), external_shipment_id: imbStr_(h.external_shipment_id), action: 'set_position', warnings: [] };
    rows.push(row);
    if (!sid) { imbIssue_(issues, sn, r.__row, 'shipment_id', 'REQUIRED', 'shipment_id is required'); row.action = 'reject'; return; }
    if (seenSid[sid]) imbIssue_(issues, sn, r.__row, 'shipment_id', 'ROUTE_INIT_DUPLICATE_ROW', 'shipment ' + sid + ' is already on row ' + seenSid[sid], sid); seenSid[sid] = r.__row;
    var routes = rt ? rt.rows.filter(function (x) { return imbStr_(x.shipment_id) === sid; }).length : 0;
    var evs = ev ? ev.rows.filter(function (x) { return imbStr_(x.shipment_id) === sid; }) : [];
    state.ships[sid] = [hs.length ? shiRowVersion_(db, sid) : '', routes, evs.map(function (x) { return imbStr_(x.shipment_event_id); }).sort().join(',')];
    var mode = imbStr_(h.opening_supply_mode).toUpperCase(), st = shiLc_(h.status), why = '';
    if (hs.length !== 1) why = hs.length ? 'ROUTE_INIT_SHIPMENT_AMBIGUOUS' : 'ROUTE_INIT_SHIPMENT_NOT_FOUND';
    else if (company && imbStr_(h.company) !== company) why = 'ROUTE_INIT_COMPANY_MISMATCH';
    else if (imbStr_(h.record_origin) !== SHI_ORIGIN_HISTORICAL_) why = 'ROUTE_INIT_NOT_IMPORTED';
    else if (mode !== 'COUNTED' && mode !== 'DISPLAY_ONLY') why = mode ? 'ROUTE_INIT_IMPORT_NOT_FINISHED' : 'ROUTE_INIT_LEGACY_ROW';
    else if (src && imbStr_(h.import_batch_id) !== src) why = 'ROUTE_INIT_OTHER_BATCH';
    else if (!RTI_OPEN_STATUSES_[st]) why = 'ROUTE_INIT_STATUS_NOT_OPEN';
    else if (routes > 0) why = 'ROUTE_INIT_ALREADY_INITIALISED';
    else if (evs.some(function (x) { return /^(route|confirm|manual|manual-init):/.test(imbStr_(x.source_event_id)); })) why = 'ROUTE_INIT_ROUTE_EVENT_EXISTS';   // AD3 A: + manual events
    else { try { if (typeof csdMovementExists_ === 'function' && csdMovementExists_(C, sid)) why = 'ROUTE_INIT_DISPATCH_EVIDENCE'; } catch (eM) { why = 'ROUTE_INIT_DISPATCH_STATE_UNKNOWN'; } }
    if (why) { imbIssue_(issues, sn, r.__row, 'shipment_id', why, 'shipment ' + sid + (h.shipment_no ? ' (' + imbStr_(h.shipment_no) + ')' : '') + ' cannot get a position here: ' + why + (st ? ' (status ' + st + ', mode ' + (mode || 'blank') + ', batch ' + (imbStr_(h.import_batch_id) || 'blank') + ')' : ''), sid); row.action = 'reject'; return; }
    var facts = { source_warehouse_id: h.source_warehouse_id, destination_warehouse_id: h.destination_warehouse_id, warehouse_id: imbStr_(h.warehouse_id), country: h.country, carrier_id: h.carrier_id, shipping_method: h.shipping_method, last_mile_delivery: h.last_mile_delivery, warehouse_code: h.warehouse_code, etd: h.etd };
    facts.shipment_id = sid; facts.rate_card_version = h.rate_card_version;   // AD3 A (B v1.2 sec.11): B's to-be-assigned marker, read by 22_ csdCarrierToBeAssigned3_ -> 12_ shipCarrierTbaState_ (re-read again under the 78_ apply lock)
    var cands = rtiCandidates_(C, facts);
    row.route = { status: cands.status, reason: cands.reason, candidates: cands.candidates, chosen: null, origin_undeclared: cands.origin_undeclared || [], origin_excluded: cands.origin_excluded || [] };   // b5 (m-4)
    var mInfo = rtiManualInfo_(C, facts, cands); row.route.manual = mInfo.view;   // AD3 A: whether the explicit manual fallback is available for this shipment
    var rMode = imbStr_(r.route_mode).toUpperCase();
    if (rMode && rMode !== 'MANUAL') { imbIssue_(issues, sn, r.__row, 'route_mode', 'ROUTE_INIT_MODE_INVALID', 'route_mode is blank (a route template) or MANUAL (manual logistics, no route)', rMode); row.action = 'reject'; return; }
    if (rMode === 'MANUAL') {
      if (imbStr_(r.route_template_id) || imbStr_(r.route_template_node_id) || imbStr_(r.route_template_digest)) { imbIssue_(issues, sn, r.__row, 'route_mode', 'ROUTE_INIT_MANUAL_FIELDS_CONFLICT', 'manual logistics takes no route template, node or digest', sid); row.action = 'reject'; return; }
      if (schema.length) { row.action = 'reject'; return; }
      var mres = rtiManualChoice_(C, facts, r, mInfo, issues, sn, r.__row, row.warnings);
      if (!mres.ok || issues.length > n0) { row.action = 'reject'; return; }
      row.route.chosen = { route_template_id: mres.templateId, route_mode: 'MANUAL', route_template_node_id: mres.nodes[0].nodeId, sequence_no: 1, position_as_of: mres.positionAt, coordinates: mres.coord };
      state.routes[sid] = [mres.templateId, mres.digest, 'MANUAL', mres.positionAt, mres.source];
      plan.items.push({ sid: sid, etd: h.etd, r: mres });
      return;
    }
    var ch = rtiReadChoice_(r);
    if (ch.blank) { imbIssue_(issues, sn, r.__row, 'route_template_node_id', 'ROUTE_INIT_POSITION_REQUIRED', 'choose the route template and the node the shipment is at, with the time and source of that report', sid); row.action = 'reject'; return; }
    if (ch.incomplete) { imbIssue_(issues, sn, r.__row, ch.missing[0], 'ROUTE_INIT_CHOICE_INCOMPLETE', 'a Current Position needs all of ' + RTI_KEYS_.join(', ') + ' (missing ' + ch.missing.join(', ') + ')', sid); row.action = 'reject'; return; }
    if (schema.length) { row.action = 'reject'; return; }
    var res = rtiResolveChoice_(C, facts, ch.choice, cands, issues, sn, r.__row, row.warnings);
    if (!res.ok || issues.length > n0) { row.action = 'reject'; return; }
    row.route.chosen = { route_template_id: res.templateId, route_template_node_id: res.nodes[res.target].nodeId, sequence_no: res.nodes[res.target].seq, position_as_of: res.positionAt, coordinates: res.coord };
    state.routes[sid] = [res.templateId, res.digest, res.nodes[res.target].nodeId, res.positionAt, res.source];
    plan.items.push({ sid: sid, etd: h.etd, r: res });
  });
  if (!(req.sheets.Header || []).length) imbIssue_(issues, 'Header', '', '', 'IMPORT_EMPTY', 'no shipment named');
  var ok = !issues.length, nR = 0; plan.items.forEach(function (it) { nR += it.r.nodes.length; });
  var preview = { counts: { route_init: ok ? plan.items.length : 0, reject: rows.filter(function (x) { return x.action === 'reject'; }).length }, rows: rows, warnings: [],
    impacts: { timezone: shiTz_(), shipment_routes: ok ? nR : 0, shipment_events: ok ? plan.items.length : 0, shipments: 0, shipment_lines: 0, status_changes: 0, quantity_changes: 0, executed_allocations: 0, factory_stock_movements: 0,
      overseas_inventory_movements: 0, reservations: 0, purchase_order_lines: 0, receipts: 0, documents: 0, emails: 0 } };
  return { issues: issues, plan: plan, preview: preview, state: state };
}
function rtiApplyInit_(ss, plan, ctx) {
  // 78_ re-validated this plan under the lock with the same preview digest; the writer refuses a shipment that gained a route meanwhile
  var w = rtiWrite_(ss, plan.items, ctx);
  return { result: { route_init: plan.items.length, routes: w.routes, events: w.events, positions: w.positions, stock_movements: 0, reservations: 0, allocations: 0, po_lines: 0, status_changes: 0, quantity_changes: 0, documents: 0, emails: 0 } };
}
// read-only residue of a ROUTE_INIT batch that is not COMMITTED (78_ receipt get): what its id left in the rows
function rtiResidue_(ss, batchId, receipt, out) {
  var actor = 'import:' + imbStr_(batchId), ev = shiRowsOf_(ss, 'shipment_events') || [], rt = shiRowsOf_(ss, 'shipment_routes') || [];
  var mine = ev.filter(function (e) { return imbStr_(e.created_by) === actor; }), sids = {}; mine.forEach(function (e) { sids[imbStr_(e.shipment_id)] = 1; });
  out.event_rows = mine.length;
  out.route_rows_of_those_shipments = rt.filter(function (r) { return sids[imbStr_(r.shipment_id)] && imbStr_(r.shipment_route_id).indexOf(RTI_ROUTE_ID_PREFIX_) === 0; }).length;
  out.verdict = mine.length ? 'POSITION_ROWS_PRESENT_AWAITING_MANUAL_RECONCILIATION' : 'NO_POSITION_ROWS_FOUND_FOR_THIS_BATCH';
  out.advance = 'Update Position (31_ shipment.route.advance) and receipts refuse these routes (ROUTE_INIT_NOT_COMMITTED / ROUTE_ROWS_ON_HISTORICAL) until the batch is COMMITTED; do not keep advancing an unresolved batch.';   // b5 (m-7)
  out.rule = 'Read-only. Route / event rows are never deleted to recover; a batch that is not COMMITTED is never shown as applied and never re-applied automatically.';
  return out;
}
// add a ROUTE_INIT residue section to an ADD_NEW residue (same batch id)
function rtiResidueAdd_(ss, batchId, ids, out) {
  var actor = 'import:' + imbStr_(batchId);
  out.position_event_rows = (shiRowsOf_(ss, 'shipment_events') || []).filter(function (e) { return ids[imbStr_(e.shipment_id)] && imbStr_(e.created_by) === actor; }).length;
  out.position_route_rows = (shiRowsOf_(ss, 'shipment_routes') || []).filter(function (r) { return ids[imbStr_(r.shipment_id)] && imbStr_(r.shipment_route_id).indexOf(RTI_ROUTE_ID_PREFIX_) === 0; }).length;
}

// ---- b5 (REVIEW_A2 C-3): READ-ONLY rollback impact. Run from the Apps Script editor BEFORE any rollback to A1: the COUNTED, still-open
// imported shipments whose routes came from a COMMITTED route-init (A1's receipt gate would refuse them). Writes nothing; never routed.
function rtiRollbackImpactList() {
  var ss = imbDb_(), S = typeof imbSheets_ === 'function' ? imbSheets_(ss) : null, out = { mode: 'READ_ONLY', writes_performed: 0, shipments: [] };
  if (!S) { out.error = 'IMPORT_SCHEMA_NOT_PROVISIONED'; try { Logger.log(JSON.stringify(out)); } catch (e0) {} return out; }
  var st = {}; imbRows_(S.receipts).forEach(function (r) { st[imbStr_(r.import_batch_id)] = imbStr_(r.domain) === 'shipment' ? imbStr_(r.status) : 'OTHER'; });
  var ids = {}; imbRows_(S.changes).forEach(function (c) { if (imbStr_(c.entity_table) === 'shipment_routes' && imbStr_(c.result) === RTI_RESULT_ROUTE_ && st[imbStr_(c.import_batch_id)] === 'COMMITTED') ids[imbStr_(c.entity_id)] = 1; });
  (shiRowsOf_(ss, 'shipments') || []).forEach(function (h) { var sid = imbStr_(h.shipment_id); if (!ids[sid]) return; var mode = imbStr_(h.opening_supply_mode).toUpperCase(), s0 = shiLc_(h.status);
    out.shipments.push({ shipment_id: sid, shipment_no: imbStr_(h.shipment_no), external_shipment_id: imbStr_(h.external_shipment_id), company: imbStr_(h.company), mode: mode, status: s0, receipt_blocked_under_A1: mode === 'COUNTED' && !!RTI_OPEN_STATUSES_[s0] }); });
  out.with_routes = out.shipments.length; out.receipt_blocked_under_A1 = out.shipments.filter(function (x) { return x.receipt_blocked_under_A1; }).length;
  out.rule = 'A rollback to A1 keeps these rows; A1 refuses a receipt on every receipt_blocked_under_A1 shipment until A2 is back. Production: prefer a forward fix; a rollback after any ROUTE_INIT write needs an explicit Owner decision.';
  try { Logger.log(JSON.stringify(out)); } catch (e1) {}
  return out;
}
// ---- the proof every reader uses: are this historical shipment's route rows the imported-tracking snapshot of a COMMITTED batch? ----
// -> { ok: true } or { ok: false, why }. Fail closed: anything unreadable or unexplained is NOT proven.
function rtiImportedTrackingProof_(ss, shipmentId) {
  try {
    var sid = imbStr_(shipmentId), rt = shiRowsOf_(ss, 'shipment_routes');
    if (!rt) return { ok: false, why: 'ROUTES_UNREADABLE' };
    var mine = rt.filter(function (r) { return imbStr_(r.shipment_id) === sid; });
    if (!mine.length) return { ok: false, why: 'NO_ROUTE_ROWS' };
    var tpl = {}, ids = {};
    for (var i = 0; i < mine.length; i++) { var id = imbStr_(mine[i].shipment_route_id);
      if (id.indexOf(RTI_ROUTE_ID_PREFIX_) !== 0) return { ok: false, why: 'ROUTE_ROW_NOT_IMPORTED ' + (id || '(blank id)') };
      if (ids[id]) return { ok: false, why: 'ROUTE_ROW_DUPLICATE ' + id }; ids[id] = 1; tpl[imbStr_(mine[i].route_template_id)] = 1; }
    if (Object.keys(tpl).length !== 1 || tpl['']) return { ok: false, why: 'ROUTE_TEMPLATE_NOT_SINGLE' };
    var S = typeof imbSheets_ === 'function' ? imbSheets_(ss) : null; if (!S) return { ok: false, why: 'AUDIT_UNREADABLE' };
    var st = {}; imbRows_(S.receipts).forEach(function (r) { st[imbStr_(r.import_batch_id)] = imbStr_(r.domain) === 'shipment' ? imbStr_(r.status) : 'OTHER_DOMAIN'; });
    var proven = {};
    imbRows_(S.changes).forEach(function (c) { if (imbStr_(c.entity_table) === 'shipment_routes' && imbStr_(c.entity_id) === sid && imbStr_(c.result) === RTI_RESULT_ROUTE_ && st[imbStr_(c.import_batch_id)] === 'COMMITTED') proven[imbStr_(c.line_id)] = 1; });
    var miss = Object.keys(ids).filter(function (k) { return !proven[k]; });
    return miss.length ? { ok: false, why: 'ROUTE_ROW_NOT_AUDITED_BY_A_COMMITTED_IMPORT ' + miss.slice(0, 3).join(',') } : { ok: true };
  } catch (e) { return { ok: false, why: 'PROOF_READ_FAILED ' + String(e && e.message || e) }; }
}
