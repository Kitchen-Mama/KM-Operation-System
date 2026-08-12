// F1-SHIPMENT-MAP-R12 — map control panel + full-width status rail + responsive UI (frontend, presentation-only).
// Guards: ONE consolidated in-map Map Control Panel owns View + Filters + Layers + Legend; the page-level filter bar
// is retired (one filter owner); the standalone Map View selector, layer toggles and bottom legend are relocated
// (no duplicates); right-side zoom controls stay SEPARATE; Status + Attention share one visual family on a
// full-width, responsive rail; the panel is collapsible (collapsed hides internal controls). No backend/DOM-duplication.
// Run: node assets/tests/shipment-map-control-panel-r12.test.js
// NOTE: source/DOM guards only (no live globe / WebGL).

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function count(src, sub) { return src.split(sub).length - 1; }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var SRC = read('js/pages/global-logistics-map.js');
var CSS = read('css/pages/global-logistics-map.css');
var render = extractFn(SRC, 'render');
var mapShell = extractFn(SRC, 'renderMapShell');
var panel = extractFn(SRC, 'renderMapControlPanel');
var pfilters = extractFn(SRC, 'renderPanelFilters');
var status = extractFn(SRC, 'renderStatusSummary');
var attention = extractFn(SRC, 'renderAttentionRow');
var tile = extractFn(SRC, 'glmKpiTileHtml');

console.log('\n== A/B — one filter owner, inside the map control panel ==');
ok(SRC.indexOf('function renderFilterBar(') === -1, 'A the page-level filter bar (renderFilterBar) is retired — one filter UI owner');
ok(!/renderFilterBar\(\)/.test(render), 'A render() no longer emits a page-level filter bar');
ok(/renderPanelFilters\(\)/.test(panel) && /glm-mcp__sec--filters/.test(panel), 'B filters live inside the Map Control Panel');
ok(count(SRC, 'data-filter="search"') === 1, 'A/B exactly one Search filter control exists in the page (no duplicate owner)');

console.log('\n== C — Map View inside panel ==');
ok(/data-mode-select/.test(panel) && /Map View/.test(panel), 'C Map View selector lives inside the panel');
ok(!/data-mode-select/.test(mapShell), 'C map shell no longer emits a standalone Map View selector');
ok(!/glm-map-view/.test(mapShell) && !/glm-map-view/.test(panel), 'C old standalone .glm-map-view container is gone');

console.log('\n== D — Layers (Route Arcs / Reference Pins) inside panel ==');
ok(/data-toggle="showPlannedRoute"/.test(panel) && /data-toggle="showReference"/.test(panel), 'D Route Arcs + Reference Pins toggles live inside the panel');
ok(!/data-toggle="showPlannedRoute"/.test(mapShell), 'D map shell no longer emits the layer toggles directly');

console.log('\n== E/F — Legend inside panel; old standalone legend removed ==');
ok(/legendHtml\(\)/.test(panel) && /glm-mcp__legend/.test(panel), 'E legend relocated into the panel, reusing legendHtml()');
ok(SRC.indexOf('<details class="glm-legend"') === -1 && SRC.indexOf('data-glm="legend"') === -1, 'F old standalone bottom-left legend removed (no <details class="glm-legend">)');
ok(/glm-mcp__legend">' \+ legendHtml\(\)/.test(panel) && !/legendHtml\(\)/.test(mapShell), 'F single legend renderer call site (in the panel) — no duplicate legend on the map');

console.log('\n== G/H — Status + Attention share ONE visual family; all 8 indicators ==');
ok(/glmKpiTileHtml\(/.test(status) && /glmKpiTileHtml\(/.test(attention), 'G Shipment Status + Attention both render through the shared glmKpiTileHtml family');
ok(!/glm-statcard/.test(status) && !/glm-chip\b/.test(attention), 'G no divergent button family for Attention');
var ATTN = extractFn(SRC, 'attentionIndicators');
ok(/ATTENTION_ORDER = \['delayed', 'exception', 'arrivingSoon', 'customs', 'deliveredToday'\]/.test(SRC), 'H Attention keeps its 5 indicators (delayed/exception/arrivingSoon/customs/deliveredToday)');
ok(/glmStatusSummary/.test(status), 'H Shipment Status retains its 3 backend buckets (In Transit / Partially Received / Received) → 3 + 5 = 8');

console.log('\n== I/J — collapsible panel; collapsed hides internal controls ==');
ok(/state\.mapPanelCollapsed/.test(panel) && /is-collapsed/.test(panel), 'I panel collapse state exists (state.mapPanelCollapsed + is-collapsed)');
ok(/toggle-map-panel/.test(panel) && /aria-expanded="/.test(panel), 'I toggle has aria-expanded (accessible)');
ok(/'toggle-map-panel': function/.test(SRC), 'I toggle-map-panel action wired in bindRuntime');
ok(/if \(collapsed\) return '<div class="glm-mcp is-collapsed" data-glm="map-panel">' \+ head \+ '<\/div>';/.test(panel), 'J collapsed → only the ☰ header (head) renders, no body');
var collapsedBranch = panel.slice(panel.indexOf('if (collapsed) return'), panel.indexOf('var mapView'));
ok(!/data-filter=|data-mode-select|data-toggle=/.test(collapsedBranch), 'J collapsed panel exposes NO internal focusable controls (no hidden focus traps)');

console.log('\n== K — all current filter data keys preserved ==');
['search', 'company', 'destWarehouse', 'carrier', 'method', 'etaFrom', 'etaTo'].forEach(function (k) {
  ok(new RegExp("'" + k + "'|\"" + k + "\"|data-filter=\"" + k + "\"").test(pfilters), 'K filter key preserved: ' + k);
});
ok(/data-act="clear-filters"/.test(pfilters), 'K Clear Filters preserved');
ok(!/originCountry|'destCountry'|selHtml\('Status'|selHtml\('Stage'|exceptionOnly|delayedOnly/.test(pfilters), 'K removed controls (Origin/Status/Stage/Exception/Delayed) NOT reintroduced');

console.log('\n== L — map controls stay separate from right-side zoom ==');
ok(/glm-map-controls/.test(mapShell) && /data-act="zoom-in"/.test(mapShell) && /data-act="zoom-out"/.test(mapShell) && /data-act="reset"/.test(mapShell), 'L zoom/reset controls remain in the map shell (separate .glm-map-controls)');
ok(!/data-act="zoom-in"/.test(panel), 'L the Map Control Panel does NOT contain the zoom controls');
ok(/\.glm-map-controls\s*\{[^}]*right:\s*14px/.test(CSS) && /\.glm-mcp\s*\{[^}]*left:\s*14px/.test(CSS), 'L CSS: zoom controls right, control panel left (no overlap — §11)');

console.log('\n== M — no backend/API/business change on the map page ==');
ok(!/getShipments\s*=|updateShipment\s*=|shipment_events\s*=|\.gs|apps-script/.test(SRC), 'M presentation-only: no backend writer / Apps Script reference introduced');
ok(!/filteredVms\s*=\s*function[\s\S]{0,400}recompute|glmStatusSummary\s*=\s*function/.test(panel + pfilters), 'M no status/attention/filter LOGIC redefined in the new UI owners');

console.log('\n== N — one canonical UI state, no duplicated desktop/mobile DOM ==');
ok(count(SRC, 'function renderMapControlPanel(') === 1 && SRC.indexOf('renderMapControlPanelMobile') === -1, 'N single panel builder — no separate mobile DOM tree');
ok(count(SRC, 'data-glm="map-panel"') === 2, 'N one panel authority (collapsed + expanded branches of the SAME builder)');

console.log('\n== O — responsive CSS present + bounded ==');
ok(/@media \(max-width: 1100px\)[\s\S]{0,200}\.glm-mcp/.test(CSS) || /@media \(max-width: 640px\)[\s\S]{0,200}\.glm-mcp/.test(CSS), 'O panel width adapts at existing breakpoints (1100 / 640)');
ok(/@media \(max-width: 900px\)[\s\S]{0,200}flex-basis: 100%/.test(CSS), 'O status/attention groups wrap to full-row on small (balanced 2-row)');
ok(/\.glm-kpi-tile\s*\{[^}]*flex:\s*1 1 116px/.test(CSS), 'O KPI tiles flex to consume the full row width (no fixed giant widths)');
ok(/\.glm-summary__group--status\s*\{[^}]*flex:\s*3 1/.test(CSS) && /\.glm-summary__group--attention\s*\{[^}]*flex:\s*5 1/.test(CSS), 'O groups grow proportionally (3:5) for equal tile widths across the full-width rail');

console.log('\n----------------------------------------');
console.log('SHIPMENT MAP CONTROL PANEL (F1-SHIPMENT-MAP-R12): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
