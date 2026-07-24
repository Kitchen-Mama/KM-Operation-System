// Global Logistics Map — resolver / validation / antimeridian / classification logic test (pure Node).
// Mirrors the guards in assets/js/pages/global-logistics-map.js so the safety rules (§D resolver
// priority, §J coordinate validity + antimeridian, candidate≠selected, gateway≠exact, 0,0 guard)
// are regression-checked without a browser. Run: node assets/tests/global-logistics-map.test.js

var fail = 0;
function eq(a, e, label) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + label); }

var W = 1000, H = 500;
function validCoord(lat, lng) { return (typeof lat === 'number') && (typeof lng === 'number') && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0); }
function project(lat, lng) { return { x: (lng + 180) / 360 * W, y: (90 - lat) / 180 * H }; }
var GATEWAY_TYPES = ['port', 'airport', 'seaport', 'rail_terminal', 'railway_gateway', 'border_crossing', 'border_gateway', 'channel_gateway', 'gateway'];
function isGatewayLoc(loc) { if (!loc) return false; var t = (loc.locationType || '').toLowerCase(); if (GATEWAY_TYPES.indexOf(t) >= 0) return true; var acc = (loc.coordinateAccuracy || '').toUpperCase(); return acc.indexOf('GATEWAY') >= 0 || acc.indexOf('CENTROID') >= 0; }

var LOC = {};
function resolveMapCoordinate(ctx) {
  ctx = ctx || {}; var ev = ctx.shipmentEvent, sel = ctx.selectedLocation, nodeLoc = ctx.nodeLocation, node = ctx.routeNode;
  function make(lat, lng, source, acc, verif, locId, fb) { return { coordinateSource: source, isFallback: !!fb, isDrawable: validCoord(lat, lng), latitude: lat, longitude: lng }; }
  if (ev && validCoord(ev.latitude, ev.longitude)) return make(ev.latitude, ev.longitude, 'RUNTIME_EVENT', '', '', '', false);
  var selLoc = null;
  if (ev && ev.logisticsLocationId && LOC[ev.logisticsLocationId]) selLoc = LOC[ev.logisticsLocationId];
  if (!selLoc && sel) selLoc = sel;
  if (selLoc && validCoord(selLoc.latitude, selLoc.longitude)) return make(selLoc.latitude, selLoc.longitude, 'SELECTED_LOCATION', '', '', '', false);
  var nl = nodeLoc || (node && node.logisticsLocationId && LOC[node.logisticsLocationId] ? LOC[node.logisticsLocationId] : null);
  if (nl && validCoord(nl.latitude, nl.longitude)) return make(nl.latitude, nl.longitude, isGatewayLoc(nl) ? 'GATEWAY_REFERENCE' : 'CANONICAL_LOCATION', '', '', '', false);
  if (node && validCoord(node.latitude, node.longitude)) return make(node.latitude, node.longitude, 'TEMPLATE_DISPLAY', '', '', '', true);
  return make(null, null, 'UNRESOLVED', '', '', '', false);
}
function classifyNode(n) { var t = (n.locationResolutionType || '').toLowerCase(); if (t === 'candidate_set' || t === 'candidate') return 'candidate'; if (t === 'dynamic_by_shipment' || t === 'runtime_event') return 'dynamic'; if (t === 'virtual' || t === 'virtual_or_event') return 'virtual'; if (n.isDestinationPlaceholder) return 'dynamic'; return 'fixed'; }
function routePath(pts) { var c = pts.filter(function (p) { return p.connect; }); if (c.length < 2) return ''; var d = '', prev = null; c.forEach(function (p) { var pr = project(p.lat, p.lng); if (prev === null) d += 'M' + pr.x.toFixed(1) + ' ' + pr.y.toFixed(1); else if (Math.abs(p.lng - prev.lng) > 180) d += ' M' + pr.x.toFixed(1) + ' ' + pr.y.toFixed(1); else d += ' L' + pr.x.toFixed(1) + ' ' + pr.y.toFixed(1); prev = p; }); return d; }

// --- validCoord / 0,0 guard (§J, §O) ---
eq(validCoord(0, 0), false, 'validCoord: 0,0 is NOT a coordinate (blank guard)');
eq(validCoord(90, 180), true, 'validCoord: 90,180 valid');
eq(validCoord(91, 0), false, 'validCoord: lat out of range');
eq(validCoord(null, 10), false, 'validCoord: null lat');
eq(validCoord('12', 10), false, 'validCoord: string lat rejected');

// --- resolver priority (§D) ---
LOC = { 'L-CANON': { latitude: 31.2, longitude: 121.5 }, 'L-GATE': { latitude: 33.7, longitude: -118.2, locationType: 'port', coordinateAccuracy: 'GATEWAY_AREA_CENTROID' } };
eq(resolveMapCoordinate({ shipmentEvent: { latitude: 1.3, longitude: 103.8 }, routeNode: { latitude: 5, longitude: 5, logisticsLocationId: 'L-CANON' } }).coordinateSource, 'RUNTIME_EVENT', 'resolver: event coord wins');
eq(resolveMapCoordinate({ shipmentEvent: { logisticsLocationId: 'L-CANON' }, routeNode: { latitude: 5, longitude: 5 } }).coordinateSource, 'SELECTED_LOCATION', 'resolver: event selected location');
eq(resolveMapCoordinate({ routeNode: { latitude: 5, longitude: 5, logisticsLocationId: 'L-CANON' } }).coordinateSource, 'CANONICAL_LOCATION', 'resolver: node-bound canonical location');
eq(resolveMapCoordinate({ routeNode: { latitude: 5, longitude: 5, logisticsLocationId: 'L-GATE' } }).coordinateSource, 'GATEWAY_REFERENCE', 'resolver: gateway location → GATEWAY_REFERENCE');
var fb = resolveMapCoordinate({ routeNode: { latitude: 48.1, longitude: 11.6 } });
eq([fb.coordinateSource, fb.isFallback], ['TEMPLATE_DISPLAY', true], 'resolver: node template display is a fallback');
eq(resolveMapCoordinate({ routeNode: { latitude: null, longitude: null } }).coordinateSource, 'UNRESOLVED', 'resolver: no coord → UNRESOLVED');
// canonical outranks node template when both present but different
var both = resolveMapCoordinate({ routeNode: { latitude: 5, longitude: 5, logisticsLocationId: 'L-CANON' } });
eq([both.latitude, both.longitude], [31.2, 121.5], 'resolver: Location canonical outranks node display coord');

// --- classifyNode (§G) ---
eq(classifyNode({ locationResolutionType: 'candidate_set' }), 'candidate', 'classify: candidate_set');
eq(classifyNode({ locationResolutionType: 'dynamic_by_shipment' }), 'dynamic', 'classify: dynamic_by_shipment');
eq(classifyNode({ locationResolutionType: 'virtual' }), 'virtual', 'classify: virtual');
eq(classifyNode({ locationResolutionType: 'fixed_location' }), 'fixed', 'classify: fixed_location');
eq(classifyNode({ isDestinationPlaceholder: true }), 'dynamic', 'classify: destination placeholder → dynamic');

// --- antimeridian break (§J.10) ---
var cross = routePath([{ lat: 31, lng: 121, connect: true }, { lat: 34, lng: -118, connect: true }]);
eq((cross.match(/M/g) || []).length, 2, 'antimeridian: CN→US path breaks (two subpaths, no cross-map line)');
var near = routePath([{ lat: 31, lng: 121, connect: true }, { lat: 22, lng: 114, connect: true }]);
eq((near.match(/M/g) || []).length, 1, 'antimeridian: nearby leg is one continuous subpath');

// --- gateway ≠ exact (§F) ---
eq(isGatewayLoc({ locationType: 'port' }), true, 'gateway: port type');
eq(isGatewayLoc({ locationType: 'factory', coordinateAccuracy: 'EXACT_FACILITY' }), false, 'gateway: factory exact is not a gateway');

// --- candidate not connected into the route line (§G.2) ---
var candPts = [{ lat: 31, lng: 121, connect: true }, { lat: 34, lng: 118, connect: false /* candidate */ }, { lat: 40, lng: 116, connect: true }];
eq((routePath(candPts).match(/[ML]/g) || []).length, 2, 'candidate pin excluded from the route polyline');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
