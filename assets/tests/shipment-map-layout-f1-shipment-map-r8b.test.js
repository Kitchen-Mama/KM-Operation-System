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
// R8C supersedes the R8B body top bar: Refresh moved into the page header (glm-head__bar); the body no longer
// renders a glm-topbar. renderTopBar was removed, so there is nothing to extract here.
var mapshell = extractFn(SRC, 'renderMapShell');
var listFn = extractFn(SRC, 'renderShipmentList');

// A/B — R12: Title → full-width Status/Attention rail → Main (filters relocated into the in-map Map Control Panel).
var iSummary = render.indexOf('renderSummaryRegion()'), iMain = render.indexOf('glm-main');
ok(iSummary > -1 && iMain > -1, 'render() composes the status/attention rail + main workspace');
ok(iSummary < iMain, 'A/B order (R12): status/attention rail → main workspace (filters now inside the map panel)');

// C — Shipment list is the LEFT workspace content and is NOT nested below a filter panel.
ok(/:\s*renderShipmentList\(\);/.test(render), 'C runtime side renders the shipment list directly (list starts top-left)');
ok(!/renderFilters\b/.test(SRC), 'C legacy tall renderFilters panel removed (filters no longer above the list)');
ok(!/renderFilterBar\(\)\s*\+\s*renderShipmentList/.test(SRC), 'C filters are not concatenated into the left list column');
ok(/data-filter="search"/.test(extractFn(SRC, 'renderPanelFilters')) && /glm-pfilters/.test(SRC), 'C filters live in the Map Control Panel (glm-pfilters) — R12 relocation');

// E — list has its own bounded scroll region (CSS).
ok(/\.glm-shiplist\s*\{[^}]*overflow-y:\s*auto/.test(CSS) && /\.glm-shiplist\s*\{[^}]*max-height/.test(CSS), 'E shipment list has bounded independent scroll');

// F/G — map-layer modes moved INTO the map; no primary page-level tab row; all three preserved.
ok(!/glm-modebar/.test(SRC), 'F no primary page-level mode tab row (glm-modebar removed)');
ok(!/data-mode="/.test(SRC), 'F no page-level data-mode tab buttons emitted');
// R12 — the Map View selector moved from the map shell into the in-map Map Control Panel (still map-surface-owned:
// renderMapShell embeds renderMapControlPanel()).
var mcp = extractFn(SRC, 'renderMapControlPanel');
ok(/data-mode-select/.test(mcp) && /MODE_TABS\.map/.test(mcp), 'G the Map View selector (built from MODE_TABS) lives in the map-surface control panel');
ok(/renderMapControlPanel\(\)/.test(mapshell) && /\.glm-mcp\s*\{/.test(CSS), 'G the Map Control Panel overlays the map surface');
ok(/runtime/.test(SRC) && /template/.test(SRC) && /global/.test(SRC), 'G all three modes (runtime/template/global) preserved');
ok(/data-mode-select/.test(extractFn(SRC, 'bindRuntime')), 'G Map View selector is wired (mode change → render)');
ok(!/glm-topbar/.test(render) && !/data-mode="/.test(render), 'F body render carries no top bar / mode control (Map View lives in the map surface; Refresh moved to the page header — R8C)');

// §3 — ONE coherent summary region containing BOTH Shipment Status + Attention (distinct concepts; R8C names).
var region = extractFn(SRC, 'renderSummaryRegion');
ok(/renderStatusSummary\(\)/.test(region) && /renderAttentionRow\(\)/.test(region), '§3 one region nests Shipment Status + Attention (R8C: renderKpiStrip → renderAttentionRow)');
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
