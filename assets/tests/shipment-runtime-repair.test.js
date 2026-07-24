// On-the-Way / Global Reference data-runtime repair logic test (pure Node). Mirrors the fixes in
// operation-system-db-api.js (resilient filters, _geoNum coord parsing incl. numeric-strings & 0-lat,
// diagnostics) and global-logistics-map.js (ref filtering, cache gating). Run: node assets/tests/shipment-runtime-repair.test.js

var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }

// _geoNum mirror (adapter): numeric-string ok, blank/NaN/out-of-range → null; 0 kept.
function geoNum(v, kind) { if (v === '' || v == null) return null; var n = parseFloat(v); if (!isFinite(n)) return null; if (kind === 'lat' && (n < -90 || n > 90)) return null; if (kind === 'lng' && (n < -180 || n > 180)) return null; return n; }
function validCoord(lat, lng) { return typeof lat === 'number' && typeof lng === 'number' && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0); }

// --- coordinate parsing (B.14/B.15/B.16) ---
eq(geoNum('25.0330', 'lat'), 25.033, 'coord: numeric STRING parsed to number');
eq(geoNum('121.5654', 'lng'), 121.5654, 'coord: numeric string lng parsed');
eq(geoNum('', 'lat'), null, 'coord: blank → null (Coordinate Pending)');
eq(geoNum('abc', 'lat'), null, 'coord: non-numeric → null');
eq(geoNum('999', 'lat'), null, 'coord: out-of-range lat → null');
eq(geoNum(0, 'lat'), 0, 'coord: 0 latitude is KEPT (not treated as falsy)');
eq(validCoord(0, 121.5), true, 'coord: (0, 121.5) is a valid coordinate — 0-lat not excluded');
eq(validCoord(0, 0), false, 'coord: (0,0) rejected — never a fabricated origin');

// --- resilient logistics_locations filter (keep row with ANY id/name/coord; drop truly empty) ---
function keepLoc(r) { return r.logisticsLocationId || r.locationCode || r.locationName || r.warehouseId || r.factoryId || r.latitude !== null; }
eq(!!keepLoc({ logisticsLocationId: '', locationCode: '', locationName: 'Yantian Port', latitude: null }), true, 'resilient filter: row with only a NAME is kept (PK column mismatch survivable)');
eq(!!keepLoc({ logisticsLocationId: '', locationCode: '', locationName: '', warehouseId: '', factoryId: '', latitude: 22.5 }), true, 'resilient filter: coordinate-only row kept');
eq(!!keepLoc({ logisticsLocationId: '', locationCode: '', locationName: '', warehouseId: '', factoryId: '', latitude: null }), false, 'resilient filter: truly-empty row dropped');
eq(!!keepLoc({ logisticsLocationId: 'LOC-1', latitude: null }), true, 'resilient filter: PK present, no coord → kept (Coordinate Pending, still listed)');

// --- Global Reference filtering (active per existing rule; blank/true kept, explicit false hidden) ---
function refKeep(l, f) {
  if (f.country && l.country !== f.country) return false;
  if (f.type && l.locationType !== f.type) return false;
  if (f.search) { var hay = ((l.locationName || '') + ' ' + (l.locationCode || '')).toLowerCase(); if (hay.indexOf(f.search.toLowerCase()) < 0) return false; }
  return l.isActive !== false;
}
eq(refKeep({ country: 'US', locationType: 'port', isActive: true }, {}), true, 'ref filter: active kept');
eq(refKeep({ country: 'US', isActive: false }, {}), false, 'ref filter: explicit inactive hidden');
eq(refKeep({ country: 'US', isActive: undefined }, {}), true, 'ref filter: blank active treated as active (string/true/number tolerant)');
eq(refKeep({ country: 'CN', locationType: 'port', locationName: 'Yantian' }, { country: 'US' }), false, 'ref filter: country filter excludes');
eq(refKeep({ country: 'US', locationName: 'Long Beach Port' }, { search: 'beach' }), true, 'ref filter: search matches name');

// --- one bad row must not remove the rest ---
function mapLocations(rows) { return rows.map(function (r) { return { name: r.locationName, lat: geoNum(r.latitude, 'lat'), lng: geoNum(r.longitude, 'lng') }; }).filter(keepLocMapped); }
function keepLocMapped(m) { return m.name || m.lat !== null; }
eq(mapLocations([{ locationName: 'A', latitude: '23.0', longitude: '113.0' }, { locationName: '', latitude: 'BAD', longitude: '' }, { locationName: 'C', latitude: '34.0', longitude: '-118.0' }]).length, 2, 'one bad-coord row does not drop the valid rows (A + C survive; empty dropped)');

// --- cache gating (ensureDb): reuse only fresh google-sheet; mock/force → reload ---
function shouldReload(force, cached, mode) { return force || !cached || mode !== 'google-sheet'; }
eq(shouldReload(false, true, 'google-sheet'), false, 'cache: fresh production cache reused (no reload)');
eq(shouldReload(false, true, 'mock'), true, 'cache: mock cache NOT trusted → reload (no silent mock)');
eq(shouldReload(true, true, 'google-sheet'), true, 'cache: manual Refresh forces reload (bypass stale empty cache)');
eq(shouldReload(false, false, 'not-loaded'), true, 'cache: no cache → load');

// --- diagnostics evidence classification ---
function classify(raw, kept, mode) { if (mode === 'mock') return 'API_FAILED_FALLBACK'; if (raw === 0) return 'GETTER_OR_SHEET_OR_ROUTER'; if (kept === 0) return 'NORMALIZER_COLUMN_FILTER'; return 'OK'; }
eq(classify(0, 0, 'google-sheet'), 'GETTER_OR_SHEET_OR_ROUTER', 'diag: raw 0 → getter/sheet/router');
eq(classify(300, 0, 'google-sheet'), 'NORMALIZER_COLUMN_FILTER', 'diag: raw N & kept 0 → normalizer/column filter');
eq(classify(300, 300, 'google-sheet'), 'OK', 'diag: raw N & kept N → OK');
eq(classify(0, 0, 'mock'), 'API_FAILED_FALLBACK', 'diag: mock → API failed');

// --- shipment placement (globe layer): current → destination endpoint → origin endpoint → pending tray ---
// Mirrors resolveShipmentPlacement in global-logistics-map.js. Endpoints are NEVER labeled "current".
function placement(vm, locByWh) {
  // 1 current position (latest event / current node / etc. — pre-resolved as vm.curPos here)
  if (vm.curPos && validCoord(vm.curPos.lat, vm.curPos.lng)) return 'current';
  // 2 destination warehouse location (real coord only)
  var d = locByWh[vm.destWarehouseId]; if (d && validCoord(d.lat, d.lng)) return 'destination';
  // 3 origin node
  if (vm.origin && validCoord(vm.origin.lat, vm.origin.lng)) return 'origin';
  return 'pending';
}
var LOC_BY_WH = { 'WH-KM-US-3PL-LA': { lat: 34.05, lng: -118.25 } };
eq(placement({ curPos: { lat: 30, lng: -160 }, destWarehouseId: 'WH-KM-US-3PL-LA' }, LOC_BY_WH), 'current', 'placement: drawable current position → current marker');
eq(placement({ curPos: null, destWarehouseId: 'WH-KM-US-3PL-LA' }, LOC_BY_WH), 'destination', 'placement: no current, dest warehouse has coord → destination endpoint');
eq(placement({ curPos: null, destWarehouseId: 'WH-RESUS-UNKNOWN', origin: null }, LOC_BY_WH), 'pending', 'placement: SHP-...230A style (no coord anywhere) → Coordinate Pending TRAY (never dropped, never 0,0)');
eq(placement({ curPos: { lat: 0, lng: 0 }, destWarehouseId: 'WH-RESUS-UNKNOWN' }, LOC_BY_WH), 'pending', 'placement: (0,0) current is NOT drawable → falls through to pending (no fabricated origin)');

// --- pending shipments are still counted/visible (must appear in the tray, not disappear) ---
function pendingList(vms, locByWh) { return vms.filter(function (v) { return placement(v, locByWh) === 'pending'; }); }
eq(pendingList([{ shipmentNo: 'A', curPos: { lat: 30, lng: -160 }, destWarehouseId: 'WH-KM-US-3PL-LA' }, { shipmentNo: 'B', curPos: null, destWarehouseId: 'WH-RESUS-UNKNOWN' }], LOC_BY_WH).length, 1, 'tray: the 1 coordinate-pending shipment is retained (visible), not silently removed');

// --- centroid of drawable points returns a sane lat/lng (initial framing, never 0,0 for real clusters) ---
function centroid(pts) {
  var x = 0, y = 0, z = 0;
  pts.forEach(function (p) { var la = p[0] * Math.PI / 180, lo = p[1] * Math.PI / 180, cl = Math.cos(la); x += cl * Math.cos(lo); y += cl * Math.sin(lo); z += Math.sin(la); });
  var n = pts.length || 1; x /= n; y /= n; z /= n;
  return { lat: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, lng: Math.atan2(y, x) * 180 / Math.PI };
}
var c1 = centroid([[33.75, -118.2], [34.05, -118.25]]);
eq(Math.abs(c1.lat - 33.9) < 0.5 && Math.abs(c1.lng - (-118.22)) < 0.5, true, 'centroid: LA-area cluster → ~34N,118W (sensible initial focus)');
var c2 = centroid([[23.02, 113.75], [33.75, -118.2]]);
eq(c2.lat > 20 && c2.lat < 70 && !(c2.lat === 0 && c2.lng === 0), true, 'centroid: trans-Pacific CN+US pair yields a sensible northern focus (not 0,0)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
