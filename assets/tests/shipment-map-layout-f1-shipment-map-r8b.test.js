// F1-SHIPMENT-MAP-R8B — Phase-1 page information-architecture guards (frontend layout only).
// Source-scans global-logistics-map.js (+ CSS) to prove the approved IA is implemented WITHOUT touching any
// route/receipt/shipment/map behavior: filters relocated to a top compact bar (list no longer nested below a
// filter panel), one coherent status-summary region, map-layer modes moved INTO the map surface (all three
// preserved, no duplicate page-level tab row), and every R1B–R9 handler/authority preserved.
// Run: node assets/tests/shipment-map-layout-f1-shipment-map-r8b.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }

var SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'global-logistics-map.js'), 'utf8');
var CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'pages', 'global-logistics-map.css'), 'utf8');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
var render = extractFn(SRC, 'render');
var topbar = extractFn(SRC, 'renderTopBar');
var mapshell = extractFn(SRC, 'renderMapShell');
var listFn = extractFn(SRC, 'renderShipmentList');

// A/B — Title → compact Filter Bar → Status Summary → Main (order proven by position in render()).
var iFilter = render.indexOf('renderFilterBar()'), iSummary = render.indexOf('renderSummaryRegion()'), iMain = render.indexOf('glm-main');
ok(iFilter > -1 && iSummary > -1 && iMain > -1, 'render() composes filter bar + summary region + main workspace');
ok(iFilter < iSummary && iSummary < iMain, 'A/B order: compact filters → status summary → main workspace');

// C — Shipment list is the LEFT workspace content and is NOT nested below a filter panel.
ok(/:\s*renderShipmentList\(\);/.test(render), 'C runtime side renders the shipment list directly (list starts top-left)');
ok(!/renderFilters\b/.test(SRC), 'C legacy tall renderFilters panel removed (filters no longer above the list)');
ok(!/renderFilterBar\(\)\s*\+\s*renderShipmentList/.test(SRC), 'C filters are not concatenated into the left list column');
ok(/data-filter="search"/.test(extractFn(SRC, 'renderFilterBar')) && /glm-filterbar/.test(SRC), 'C filters live in the compact glm-filterbar');

// E — list has its own bounded scroll region (CSS).
ok(/\.glm-shiplist\s*\{[^}]*overflow-y:\s*auto/.test(CSS) && /\.glm-shiplist\s*\{[^}]*max-height/.test(CSS), 'E shipment list has bounded independent scroll');

// F/G — map-layer modes moved INTO the map; no primary page-level tab row; all three preserved.
ok(!/glm-modebar/.test(SRC), 'F no primary page-level mode tab row (glm-modebar removed)');
ok(!/data-mode="/.test(SRC), 'F no page-level data-mode tab buttons emitted');
ok(/data-mode-select/.test(mapshell) && /MODE_TABS\.map/.test(mapshell), 'G map surface owns the Map View selector (built from MODE_TABS)');
ok(/glm-map-view/.test(mapshell) && /glm-map-view/.test(CSS), 'G Map View selector overlays the map surface');
ok(/runtime/.test(SRC) && /template/.test(SRC) && /global/.test(SRC), 'G all three modes (runtime/template/global) preserved');
ok(/data-mode-select/.test(extractFn(SRC, 'bindRuntime')), 'G Map View selector is wired (mode change → render)');
ok(!/glm-modebar/.test(topbar) && !/data-mode/.test(topbar), 'F top bar carries no mode control (only admin Refresh)');

// §3 — ONE coherent summary region containing BOTH lifecycle status + operational KPIs (distinct concepts).
var region = extractFn(SRC, 'renderSummaryRegion');
ok(/renderStatusSummary\(\)/.test(region) && /renderKpiStrip\(\)/.test(region), '§3 one region nests lifecycle status + operational indicators');
ok(/glmStatusSummary\(filteredVms\(\)\)/.test(SRC), '§3 status summary consumes the SAME filtered collection as list + map');

// §5 — card shows backend-derived status (never computed in JS); partial/received visibly distinct.
ok(/glm-ship__status/.test(listFn) && /esc\(v\.status/.test(listFn), '§5 card renders backend shipment.status pill');
ok(/glm-ship__status--received/.test(CSS) && /glm-ship__status--partially_received/.test(CSS), '§5 received vs partially_received visually distinct');

// §8/§9 — R1B–R9 drawer/receipt/route authorities preserved (frontend authors NO shipments.status).
ok(/updateShipmentReceipt\(\{ shipment_id: vm\.shipmentId, lines: lines, actor:/.test(SRC), '§9 receipt Save submits shipment_id + lines + actor only (no frontend status authoring)');
ok(/glmReceiptChangedLines\(pairs\)/.test(SRC), '§8 changed-only receipt collection preserved (R8)');
ok(/advanceShipmentRoutePoint\(\{ shipment_id: vm\.shipmentId, route_template_node_id:/.test(SRC), '§8 canonical route-point mutation preserved');
ok(/Math\.max\(shipped - recv, 0\)/.test(SRC), '§8 Remaining = MAX(0, shipped - received) display arithmetic preserved');

// selection + map/list sync preserved.
ok(/function selectShipment\(id\)/.test(SRC) && /state\.selectedShipmentId = id;/.test(SRC) && /openShipmentDrawer\(id\)/.test(SRC), 'selectedShipmentId authority + drawer open preserved');
ok(/buildSelectedShipment\(sel, markers/.test(SRC), 'map/list selection highlight preserved');

// no backend/second-store drift
ok(!/updateShipment\b|createShipment\b/.test(SRC), 'no new shipment CRUD writer introduced on the map page');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
