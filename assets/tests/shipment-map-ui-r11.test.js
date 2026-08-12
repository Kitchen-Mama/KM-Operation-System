// F1-SHIPMENT-MAP-UI-R11 — compact status/ETA-date/shipment-card cleanup (frontend, presentation-only).
// Guards: Status + Attention share ONE compact KPI-tile family; Attention More/collapse removed + all categories
// always visible; ETA From/To → one ETA Date control with frozen shipments.eta semantics; shipment card gives the
// Shipment ID its own row with a separate compact badges row (issue badge preserved); the map-surface shipment
// overlay (Coordinate-Pending tray) is removed; left list stays the canonical selection owner; no backend change.
// Run: node assets/tests/shipment-map-ui-r11.test.js
// NOTE: no 'use strict' — extracted helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var SRC = read('js/pages/global-logistics-map.js');
var CSS = read('css/pages/global-logistics-map.css');
var status = extractFn(SRC, 'renderStatusSummary');
var attention = extractFn(SRC, 'renderAttentionRow');
var filterBar = extractFn(SRC, 'renderPanelFilters');   // R12 — filters relocated into the Map Control Panel (same keys/semantics)
var list = extractFn(SRC, 'renderShipmentList');
var mapShell = extractFn(SRC, 'renderMapShell');

console.log('\n== Part A — unified compact KPI family (A/B/C) ==');
// C — both summaries render via the ONE shared tile builder
ok(/glmKpiTileHtml\(/.test(status) && /glmKpiTileHtml\(/.test(attention), 'C Status + Attention both render through the shared glmKpiTileHtml builder (one visual family)');
ok(/function glmKpiTileHtml/.test(SRC) && /glm-kpi-tile/.test(SRC), 'shared KPI tile component exists (glm-kpi-tile)');
ok(!/glm-statcard/.test(status) && !/glm-chip\b/.test(attention), 'old divergent families (glm-statcard / glm-chip) no longer emitted by the summaries');
// A — Attention More/collapse removed
ok(!/glm-attention__more/.test(attention) && !/<details/.test(attention) && !/>More</.test(attention), 'A Attention More/collapse interaction removed');
// B — all Attention categories always visible (no nonzero-only filtering, no More split)
ok(!/value > 0/.test(attention) && /attentionIndicators\(\)\.map/.test(attention) || /all\.map\(function/.test(attention), 'B Attention renders ALL categories (no nonzero-only gate)');
var tileFn = extractFn(SRC, 'glmKpiTileHtml');
ok(/clickable: true, kpi: k\.id/.test(attention) && /data-kpi/.test(tileFn) && /aria-pressed/.test(tileFn), '§16 Attention tiles keep the clickable KPI-filter behavior (data-kpi via the shared builder)');
ok(!/clickable: true/.test(status), 'Status tiles are display-only (no filter) — R8C §16 preserved');

console.log('\n== Part A CSS — consistent, compact, aligned, zero-safe ==');
ok(/\.glm-kpi-tile\s*\{[^}]*min-width:\s*116px/.test(CSS) && /\.glm-kpi-tile__value\s*\{[^}]*font-size:\s*20px/.test(CSS), '§4 tiles shrunk ~10% (min-width 132→116, value 22→20) yet readable');
ok(/\.glm-kpirail\s*\{[^}]*flex-wrap:\s*wrap/.test(CSS) && /\.glm-kpirail\s*\{[^}]*align-items:\s*stretch/.test(CSS), '§3/§16 rail wraps cleanly with equal-height baseline');
ok(/\.glm-kpi-tile--inTransit::before/.test(CSS) && /\.glm-kpi-tile--danger::before/.test(CSS), '§1 only the accent differs across the shared family (status keys + attention tones)');

console.log('\n== Part B — one ETA Date control, semantics frozen (D/E/F) ==');
ok(/>ETA Date</.test(filterBar), 'D single "ETA Date" control label present');
ok(!/>ETA From</.test(filterBar) && !/>ETA To</.test(filterBar), 'D separate ETA From / ETA To labels removed');
ok(/glm-eta-range/.test(filterBar) && /data-filter="etaFrom"/.test(filterBar) && /data-filter="etaTo"/.test(filterBar), 'E one range field; F from/to semantics FROZEN (still etaFrom/etaTo)');
var fv = extractFn(SRC, 'filteredVms');
ok(/f\.etaFrom && \(v\.etaMs == null \|\| v\.etaMs < parseDate\(f\.etaFrom\)\)/.test(fv) && /f\.etaTo/.test(fv), 'F ETA filter still evaluates shipments.eta (etaMs) — no route/wh ETA, no new logic');
ok(/\.glm-eta-range\s*\{/.test(CSS) && /\.glm-field--eta\s*\{/.test(CSS), 'ETA Date styled as one compact field (Forecast-Review label parity)');

console.log('\n== Part C — shipment card hierarchy (G/H/I) ==');
ok(/glm-ship__idrow"><span class="glm-ship__no">' \+ esc\(v\.shipmentNo\)/.test(list), 'G Shipment ID sits alone on its own row (glm-ship__idrow)');
ok(/glm-ship__badges">' \+ statusPill \+ flag \+ issueBadge \+ posBadge/.test(list), 'H status/issue/coord chips are a SEPARATE row (not in the ID row)');
ok(!/glm-ship__hd"><span class="glm-ship__no">[\s\S]*?' \+ flag/.test(list), 'H badges no longer share the Shipment ID row');
ok(/glm-badge--issue/.test(list) && /Route Issue/.test(list), 'I per-shipment issue badge preserved on the affected card');
ok(/\.glm-ship__idrow\s*\{/.test(CSS) && /\.glm-ship__badges\s*\{/.test(CSS), 'card row structure styled (idrow + badges)');
ok(/\.glm-ship__badges \.glm-badge\s*\{[^}]*font-size:\s*10px/.test(CSS) && /\.glm-ship__status\s*\{[^}]*font-size:\s*10px/.test(CSS), '§10 card badges shrunk (compact chips, still readable)');

console.log('\n== §11/J — no page-wide route banner reintroduced ==');
ok(!/renderPartialNote/.test(SRC) && !/Some shipments have incomplete route history/.test(SRC), 'J the old global incomplete-route warning is NOT reintroduced');

console.log('\n== Part D — no shipment-card list inside the map (K/L/M) ==');
ok(!/renderPendingTray/.test(SRC) && !/glm-tray__item/.test(SRC), 'K the map-surface Coordinate-Pending shipment tray is removed');
ok(!/renderPendingTray/.test(mapShell) && !/glm-tray/.test(mapShell), 'K map shell renders no shipment-card list overlay');
var mcpPanel = extractFn(SRC, 'renderMapControlPanel');   // R12 — View/Layers relocated into the panel
ok(/renderMapControlPanel\(\)/.test(mapShell) && /data-act="zoom-in"/.test(mapShell), '§14/R12 map shell = globe + Map Control Panel + SEPARATE right-side zoom controls');
ok(/data-mode-select/.test(mcpPanel) && /data-toggle="showPlannedRoute"/.test(mcpPanel), 'R12 Map View + layer toggles live inside the Map Control Panel');
// L/M — canonical selection unchanged
var sel = extractFn(SRC, 'selectShipment');
ok(/state\.selectedShipmentId = id/.test(sel) && /openShipmentDrawer\(id\)/.test(sel) && /state\.globe/.test(sel), 'L/M left-list click → single selection → globe focus + drawer (unchanged)');
ok(/data-ship="' \+ esc\(v\.shipmentId\)/.test(list), 'L left shipment list remains the canonical selection owner');

console.log('\n== N/O — drawer + no backend change ==');
ok(/function openShipmentDrawer/.test(SRC) && /function receiptPanelHtml/.test(SRC), 'N drawer owner unchanged (openShipmentDrawer / receiptPanelHtml present)');
ok(!/getShipments\s*=|updateShipment\s*=|shipment_events\s*=/.test(SRC), 'O no backend writer/schema introduced on the map page (presentation-only)');

console.log('\n----------------------------------------');
console.log('SHIPMENT MAP UI (F1-SHIPMENT-MAP-UI-R11): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
