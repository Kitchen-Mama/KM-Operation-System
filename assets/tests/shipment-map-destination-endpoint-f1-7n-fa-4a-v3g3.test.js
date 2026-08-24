// F1-7N-FA-4A V3G3 — DESTINATION ENDPOINT CONSUMER regression (pure Node, no browser).
// Run: node assets/tests/shipment-map-destination-endpoint-f1-7n-fa-4a-v3g3.test.js
//
// This test EXTRACTS THE REAL FUNCTIONS from assets/js/pages/global-logistics-map.js (it does NOT mirror a copy of the
// logic), so a regression in the shipped resolver fails here. Proves the closed destination-endpoint precedence:
//   1. exact warehouse_id -> warehouse-linked logistics_locations VALID coordinate   (unchanged, highest priority)
//   2. otherwise THIS shipment's proven final destination route row coordinate       (full lineage gates)
//   3. otherwise unresolved / fail closed
// and that a gateway, a current marker, another shipment's route, an unordered/ambiguous route, or a blank/(0,0)/
// out-of-range coordinate can NEVER become the labelled destination endpoint.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
var ROOT = path.join(__dirname, '..');
var SRC = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'global-logistics-map.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

// ---- load the REAL source under a controllable `state` -------------------------------------------------------------
var state = { idx: { locById: {}, locByWh: {} } };
var LOAD = [SRC.match(/var GATEWAY_NODE_RE = [^\n]*;/)[0]];
['low', 'validCoord', 'nodeStatusClass', 'isGatewayNode', 'resolveDestinationRouteNode', 'resolveDestinationCoord',
  'resolveNodeCoord', 'resolveCurrentPosition', 'resolveOriginCoord', 'resolveShipmentPlacement'].forEach(function (n) { LOAD.push(extractFn(SRC, n)); });
eval(LOAD.join('\n'));

// ---- fixtures: the three APPROVED live destination facilities (blank master coords = the real live condition) --------
var APPROVED = {
  BFI4: { wid: 'WH-KM-US-FBA-BFI4', lid: 'LOC-WH-KM-US-FBA-BFI4', lat: 47.4145, lng: -122.25778, name: 'Amazon BFI4' },
  AUS2: { wid: 'WH-KM-US-FBA-AUS2', lid: 'LOC-WH-KM-US-FBA-AUS2', lat: 30.43255, lng: -97.59852, name: 'Amazon AUS2' },
  ABE2: { wid: 'WH-KM-US-FBA-ABE2', lid: 'LOC-WH-KM-US-FBA-ABE2', lat: 40.55787890788748, lng: -75.61500997116448, name: 'Amazon ABE2' }
};
function locRow(id, whId, lat, lng, name) { return { logisticsLocationId: id, warehouseId: whId || '', locationName: name || id, latitude: lat, longitude: lng }; }
function node(shipId, seq, over) {
  over = over || {};
  return { shipmentRouteId: shipId + '-R' + seq, shipmentId: shipId, sequenceNo: seq, nodeType: over.nodeType || 'transit', nodeCode: over.nodeCode || ('N' + seq),
    plannedEventType: over.plannedEventType || 'main_transit', locationRefType: over.locationRefType === undefined ? 'logistics_location' : over.locationRefType,
    locationRefId: over.locationRefId === undefined ? '' : over.locationRefId, locationName: over.locationName || '', status: over.status || 'planned',
    latitude: over.latitude === undefined ? null : over.latitude, longitude: over.longitude === undefined ? null : over.longitude };
}
// a demo-shaped shipment: origin -> seaport gateway (the CURRENT marker) -> the approved destination facility.
function scenario(code, over) {
  over = over || {}; var A = APPROVED[code], ship = 'DEMO-SHIP-' + code;
  state.idx.locById = {};
  state.idx.locByWh = {};
  // the warehouse-linked logistics row EXISTS and joins exactly, but carries BLANK coordinates (live condition), so it is
  // deliberately absent from locByWh (which the source only fills for rows with a valid coordinate).
  state.idx.locById[A.lid] = locRow(A.lid, over.locWarehouseId === undefined ? A.wid : over.locWarehouseId, over.masterLat === undefined ? null : over.masterLat, over.masterLng === undefined ? null : over.masterLng, A.name);
  if (over.masterCoord) state.idx.locByWh[A.wid] = locRow(A.lid, A.wid, over.masterCoord[0], over.masterCoord[1], A.name + ' Master');
  state.idx.locById['LOC-PORT-SEA'] = locRow('LOC-PORT-SEA', '', 47.60, -122.33, 'Seattle Port');
  var nodes = [
    node(ship, 1, { nodeType: 'origin', plannedEventType: 'origin_departure', locationRefId: 'LOC-CN-FAC', latitude: 31.2, longitude: 121.5, status: 'completed' }),
    node(ship, 2, { nodeType: 'port', plannedEventType: 'port_transit', locationRefId: 'LOC-PORT-SEA', latitude: 47.60, longitude: -122.33, status: 'current' }),
    node(ship, 3, {
      nodeType: over.destNodeType || 'destination', nodeCode: over.destNodeCode || 'FBA-DEST', plannedEventType: over.destPlannedEventType || 'final_delivery',
      locationRefType: over.destLocationRefType === undefined ? 'logistics_location' : over.destLocationRefType,
      locationRefId: over.destLocationRefId === undefined ? A.lid : over.destLocationRefId,
      latitude: over.destLat === undefined ? A.lat : over.destLat, longitude: over.destLng === undefined ? A.lng : over.destLng,
      status: over.destStatus || 'planned', locationName: A.name
    })
  ];
  if (over.dropDest) nodes.pop();
  if (over.dupTerminalSeq) nodes.push(node(ship, 3, { nodeType: 'destination', plannedEventType: 'final_delivery', locationRefId: A.lid, latitude: A.lat, longitude: A.lng }));
  if (over.zeroSeq) nodes.forEach(function (n) { n.sequenceNo = 0; });
  if (over.nonNumericSeq) nodes[2].sequenceNo = '3';
  if (over.foreignShipment) nodes[2].shipmentId = 'DEMO-SHIP-OTHER';
  return { shipmentId: ship, destWarehouseId: over.destWarehouseId === undefined ? A.wid : over.destWarehouseId, destWarehouse: A.name, nodes: nodes, events: over.events || [], currentNode: nodes.filter(function (n) { return nodeStatusClass(n.status) === 'current'; })[0] || null, lastCompleted: null };
}

// ==================================================================================================================
section('V3G3-B1. the exact warehouse -> logistics master coordinate still WINS (production precedence unchanged)');
(function () {
  var vm = scenario('BFI4', { masterCoord: [47.10, -122.10] });
  var d = resolveDestinationCoord(vm);
  eq([d.src, d.lat, d.lng], ['DEST_WAREHOUSE_LOCATION', 47.10, -122.10], 'B1. a valid warehouse-linked master coordinate is used and reported as DEST_WAREHOUSE_LOCATION');
  ok(d.lat !== APPROVED.BFI4.lat, 'B1/B8. the master coordinate is NOT overridden by the route-row coordinate (existing behaviour unchanged)');
})();

section('V3G3-B2. the approved address-derived FINAL route coordinate supplies the labelled destination endpoint');
Object.keys(APPROVED).forEach(function (code) {
  var A = APPROVED[code], vm = scenario(code);
  var d = resolveDestinationCoord(vm);
  ok(d && d.src === 'DEST_ROUTE_TERMINAL_NODE', 'B2. ' + code + ' resolves the destination endpoint from its proven final route row');
  eq([d.lat, d.lng], [A.lat, A.lng], 'B2/B9. ' + code + ' endpoint coordinate is NUMERICALLY EQUAL to the approved route coordinate');
  var pl = resolveShipmentPlacement({ shipmentId: vm.shipmentId, destWarehouseId: vm.destWarehouseId, destWarehouse: vm.destWarehouse, nodes: vm.nodes, events: [], currentNode: null, lastCompleted: null });
  eq([pl.kind, pl.lat, pl.lng, pl.source], ['destination', A.lat, A.lng, 'DEST_ROUTE_TERMINAL_NODE'], 'B2. ' + code + ' is placed as a LABELLED destination endpoint (not "current position")');
});

section('V3G3-B3. a gateway route row can NEVER become the destination endpoint');
['port', 'airport', 'seaport', 'customs', 'border_crossing', 'rail_terminal', 'truck_terminal', 'transit_hub', 'gateway', 'city_centroid'].forEach(function (t) {
  var vm = scenario('BFI4', { destNodeType: t, destNodeCode: t.toUpperCase(), destPlannedEventType: 'port_transit' });
  eq(resolveDestinationCoord(vm), null, 'B3. a terminal row typed "' + t + '" is refused as the destination endpoint');
});
(function () {
  var vm = scenario('BFI4', { destNodeType: 'destination', destPlannedEventType: 'customs_clearance' });
  eq(resolveDestinationCoord(vm), null, 'B3. a gateway planned_event_type on the terminal row is refused');
  // and the gateway coordinate is never returned even though it is a perfectly valid coordinate on the route
  var vm2 = scenario('BFI4', { dropDest: true });
  eq(resolveDestinationCoord(vm2), null, 'B3. with no destination row the SEAPORT row is NOT promoted to the destination endpoint');
})();

section('V3G3-B4. a current-marker coordinate can NEVER become the destination endpoint');
(function () {
  var vm = scenario('BFI4', { destStatus: 'current' });
  eq(resolveDestinationCoord(vm), null, 'B4. a terminal row flagged CURRENT is refused (a current marker is not a proven destination)');
  var vm2 = scenario('BFI4', { dropDest: true });
  var pos = resolveCurrentPosition(vm2);
  ok(pos.drawable && pos.lat === 47.60 && resolveDestinationCoord(vm2) === null, 'B4. the current marker still resolves for the position layer while the destination endpoint stays unresolved');
})();

section('V3G3-B5. a route row from ANOTHER shipment can never be used');
(function () {
  var vm = scenario('BFI4', { foreignShipment: true });
  eq(resolveDestinationCoord(vm), null, 'B5. a terminal row whose shipment_id differs is refused (exact shipment relationship required)');
})();

section('V3G3-B6. invalid / blank / (0,0) / out-of-range route coordinates fail closed');
[[null, null, 'blank'], [0, 0, '(0,0)'], [91, 10, 'lat out of range'], [10, 181, 'lng out of range'], ['47.4145', '-122.25778', 'string coordinates']].forEach(function (c) {
  var vm = scenario('BFI4', { destLat: c[0], destLng: c[1] });
  eq(resolveDestinationCoord(vm), null, 'B6. a ' + c[2] + ' terminal coordinate fails closed');
});

section('V3G3-B7. unordered or ambiguous final-route evidence fails closed');
(function () {
  eq(resolveDestinationCoord(scenario('BFI4', { dupTerminalSeq: true })), null, 'B7. a DUPLICATE terminal sequence_no is ambiguous → fail closed');
  eq(resolveDestinationCoord(scenario('BFI4', { zeroSeq: true })), null, 'B7. a missing/zero sequence_no means ordering is unproven → fail closed');
  eq(resolveDestinationCoord(scenario('BFI4', { nonNumericSeq: true })), null, 'B7. a non-numeric sequence_no → fail closed (never an arbitrary last-element pick)');
  eq(resolveDestinationCoord(scenario('BFI4', { destLocationRefType: 'warehouse' })), null, 'B7. a terminal row that is not location_ref_type=logistics_location → fail closed');
  eq(resolveDestinationCoord(scenario('BFI4', { destLocationRefId: '' })), null, 'B7. a terminal row with no location_ref_id → fail closed');
  eq(resolveDestinationCoord(scenario('BFI4', { destLocationRefId: 'LOC-PORT-SEA' })), null, 'B7. a terminal row referencing a location NOT linked to the destination warehouse → fail closed');
  eq(resolveDestinationCoord(scenario('BFI4', { locWarehouseId: 'WH-OTHER' })), null, 'B7. a referenced location whose warehouse_id ≠ the shipment destination warehouse → fail closed');
  eq(resolveDestinationCoord(scenario('BFI4', { locWarehouseId: '' })), null, 'B7. a referenced location with NO warehouse lineage → fail closed (lineage cannot be inferred)');
  eq(resolveDestinationCoord(scenario('BFI4', { destWarehouseId: '' })), null, 'B7. a shipment with no destination warehouse → fail closed');
  eq(resolveDestinationCoord(scenario('BFI4', { destLocationRefId: 'LOC-UNKNOWN' })), null, 'B7. an unresolvable location_ref_id → fail closed');
})();

section('V3G3-B8. existing production behaviour is preserved');
(function () {
  // a production shipment with NO route rows at all and no master coordinate: still unresolved, exactly as before.
  var vm = { shipmentId: 'S-PROD', destWarehouseId: 'WH-PROD', destWarehouse: 'Prod WH', nodes: [], events: [], currentNode: null, lastCompleted: null };
  state.idx.locById = {}; state.idx.locByWh = {};
  eq(resolveDestinationCoord(vm), null, 'B8. a production shipment with no routes and no master coordinate stays unresolved (fail closed unchanged)');
  eq(resolveShipmentPlacement(vm).kind, 'pending', 'B8. it remains COORDINATE_PENDING (no fabricated placement)');
  state.idx.locByWh['WH-PROD'] = locRow('LOC-PROD', 'WH-PROD', 34.05, -118.25, 'Prod Loc');
  eq([resolveDestinationCoord(vm).src, resolveDestinationCoord(vm).lat], ['DEST_WAREHOUSE_LOCATION', 34.05], 'B8. once the master coordinate exists it resolves exactly as it always did');
})();

section('V3G3-B9. resolveNodeCoord is unchanged and consistent with the endpoint');
(function () {
  var vm = scenario('AUS2'), A = APPROVED.AUS2;
  var terminal = vm.nodes[vm.nodes.length - 1];
  var nc = resolveNodeCoord(terminal), d = resolveDestinationCoord(vm);
  eq([nc.drawable, nc.src, nc.lat, nc.lng], [true, 'NODE', A.lat, A.lng], 'B9. resolveNodeCoord still renders the inline route-node coordinate (not weakened)');
  eq([d.lat, d.lng], [nc.lat, nc.lng], 'B9. the destination ROUTE NODE and the labelled destination ENDPOINT are numerically identical');
  // resolveNodeCoord keeps its own location_ref fallback for a coordinate-less node
  state.idx.locById['LOC-REF-ONLY'] = locRow('LOC-REF-ONLY', '', 12.5, 34.5, 'Ref Only');
  eq(resolveNodeCoord({ latitude: null, longitude: null, locationRefId: 'LOC-REF-ONLY' }).src, 'LOCATION_REF', 'B9. resolveNodeCoord location_ref fallback intact');
})();

section('V3G3-B10. no runtime geocoder or network call is introduced');
(function () {
  // scan CODE only — comments legitimately mention the words they forbid ("never geocoded").
  var added = SRC.slice(SRC.indexOf('var GATEWAY_NODE_RE'), SRC.indexOf('function resolveOriginCoord')).replace(/^[ \t]*\/\/.*$/gm, '');
  ok(!/fetch\(|XMLHttpRequest|WebSocket|geocod|nominatim|googleapis|maps\.|https?:\/\//i.test(added), 'B10. the destination-endpoint consumer contains no fetch/XHR/geocoder/remote-host reference');
  ok(/state\.idx\.locById|state\.idx\.locByWh/.test(added) && !/Math\.random|Date\.now/.test(added), 'B10. it reads only already-loaded rows and is deterministic');
  ok((SRC.match(/function resolveDestinationCoord\(/g) || []).length === 1, 'B10. there is exactly ONE destination resolver (no second competing resolver)');
})();

console.log('\n' + '-'.repeat(40));
console.log('SHIPMENT MAP DESTINATION ENDPOINT (V3G3): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
