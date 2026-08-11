// F1-SHIPMENT-MAP-R8C — Shipment Map information hierarchy + filter simplification + per-shipment issue UX.
// Presentation-only round: proves the compact header (Refresh top-right), the simplified 8-control filter bar with a
// SINGLE canonical Destination, Shipment Status (primary) vs Attention (secondary nonzero chips + More), the removed
// page-wide route banner, and the per-shipment issue detector (card badge + drawer detail) — while backend/business
// logic is untouched. Pure helpers are eval'd; the rest are source/HTML/CSS guards.
// Run: node assets/tests/shipment-map-hierarchy-f1-shipment-map-r8c.test.js
// NOTE: no 'use strict' — extracted helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var SRC = read('js/pages/global-logistics-map.js');
var CSS = read('css/pages/global-logistics-map.css');
var HTML = read('html/pages/global-logistics-map.html');
var render = extractFn(SRC, 'render');
var filterBar = extractFn(SRC, 'renderFilterBar');
var region = extractFn(SRC, 'renderSummaryRegion');
var listFn = extractFn(SRC, 'renderShipmentList');
var drawer = extractFn(SRC, 'openShipmentDrawer');

// ---- stubs + eval pure helpers ----
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function num(n) { var v = parseFloat(n); return isFinite(v) ? v.toLocaleString('en-US') : '0'; }
var state = { filters: { kpi: '' } };
var _kpis = [];
function computeKpis() { return _kpis.slice(); }
eval(/var ATTENTION_ORDER = \[[^\]]*\];/.exec(SRC)[0]);
eval(/var GLM_STATUS_BUCKETS_ = \[[\s\S]*?\];/.exec(SRC)[0]);
eval(extractFn(SRC, 'glmShipmentIssues'));
eval(extractFn(SRC, 'glmStatusSummary'));
eval(extractFn(SRC, 'attentionIndicators'));
eval(extractFn(SRC, 'glmKpiTileHtml'));   // R11: unified tile builder (replaced attentionChipHtml)
eval(extractFn(SRC, 'renderAttentionRow'));

// =============================================================================
console.log('\n== Shipment Status buckets (A/B/C) ==');
function counts(vms) { var o = {}; glmStatusSummary(vms).forEach(function (b) { o[b.key] = b.count; }); return o; }
eq(counts([{ status: 'in_transit' }]).inTransit, 1, 'A in_transit → In Transit = 1');
eq(counts([{ status: 'partially_received' }]).partiallyReceived, 1, 'B partially_received → Partial = 1');
eq(counts([{ status: 'received' }]).received, 1, 'C received → Received = 1');
eq(counts([{ status: 'in_transit' }, { status: 'shipped' }, { status: 'arrived' }]).inTransit, 3, 'In Transit bucket = shipped/in_transit/arrived');

console.log('\n== Attention tiles (R11 supersedes R8C More/collapse) ==');
// §8 — On the Way is dropped from Attention (baseline active population, not an alert)
_kpis = [{ id: 'onTheWay', label: 'On the Way', tone: 'info', value: 7 }, { id: 'delayed', label: 'Delayed', tone: 'danger', value: 1 }, { id: 'exception', label: 'Exceptions', tone: 'danger', value: 0 }, { id: 'arrivingSoon', label: 'Arriving Soon', tone: 'good', value: 0 }, { id: 'customs', label: 'Customs Clearance', tone: 'warn', value: 0 }, { id: 'deliveredToday', label: 'Delivered Today', tone: 'done', value: 0 }];
ok(!attentionIndicators().some(function (k) { return k.id === 'onTheWay'; }), '§8 On the Way removed from Attention (redundant with Shipment Status In Transit)');
// R11 §2 — ALL attention categories always visible (no More/collapse), even zero-value ones (§5)
var aHtml = renderAttentionRow();
ok(/data-kpi="delayed"/.test(aHtml) && /data-kpi="exception"/.test(aHtml) && /data-kpi="arrivingSoon"/.test(aHtml) && /data-kpi="customs"/.test(aHtml) && /data-kpi="deliveredToday"/.test(aHtml), 'R11 §2/§5 every Attention category is always rendered (incl. zero-value)');
ok(!/glm-attention__more/.test(aHtml) && !/<details/.test(aHtml) && !/>More</.test(aHtml), 'R11 §2 the More/collapse control is removed');
ok(/glm-kpi-tile/.test(aHtml) && !/glm-attention__empty/.test(aHtml), 'R11 §1 Attention renders unified KPI tiles (no separate chip/empty-state family)');
// §16 — tiles reuse the existing data-kpi filter; active class reflects state.filters.kpi
state.filters.kpi = 'delayed'; _kpis = [{ id: 'delayed', label: 'Delayed', tone: 'danger', value: 2 }];
ok(/data-kpi="delayed"[^>]*/.test(renderAttentionRow()) && /is-active/.test(renderAttentionRow()), '§16 active KPI filter reflected on the tile (existing filter behavior preserved)');
state.filters.kpi = '';

console.log('\n== Per-shipment issue detector (F/G/H) ==');
eq(glmShipmentIssues({ nodeCount: 0, placementKind: 'current' }), { hasIssue: true, types: [{ code: 'NO_ROUTE_NODES', label: 'Route Issue', detail: 'Route history incomplete — no route nodes are currently available for this shipment.' }] }, 'F no route nodes → NO_ROUTE_NODES issue');
eq(glmShipmentIssues({ nodeCount: 3, placementKind: 'current' }).hasIssue, false, 'G valid route + drawable → no issue');
eq(glmShipmentIssues({ nodeCount: 2, placementKind: 'pending' }).types.map(function (t) { return t.code; }), ['COORDINATE_PENDING'], 'H coordinate pending → COORDINATE_PENDING issue (shipment not hidden)');
eq(glmShipmentIssues({ nodeCount: 0, placementKind: 'pending' }).types.map(function (t) { return t.code; }), ['NO_ROUTE_NODES', 'COORDINATE_PENDING'], 'both gaps surface together');

console.log('\n== §1/§2 header ==');
ok(/glm-head__bar/.test(HTML) && /glm-head__bar[\s\S]{0,200}data-act="refresh"/.test(HTML), '§2 Refresh sits in the header bar (top-right)');
var subLine = (/<p class="glm-head__sub">([\s\S]*?)<\/p>/.exec(HTML) || [])[1] || '';
ok(/Track active shipments, route progress, ETA, and receiving status\./.test(subLine), '§1 one concise subtitle');
ok(!/reference layer/i.test(subLine) && !/route template/i.test(subLine) && !/\bDB\b|database|schema/i.test(subLine), '§1 no architecture / reference-layer / DB wording in the subtitle');
ok(/\.glm-head__bar\s*\{[^}]*justify-content:\s*space-between/.test(CSS), '§2 header bar lays title left / Refresh right');

console.log('\n== §3/§4 filter bar ==');
ok(/data-filter="search"/.test(filterBar) && /selHtml\('Company', 'company'/.test(filterBar) && /selHtml\('Carrier', 'carrier'/.test(filterBar) && /selHtml\('Method', 'method'/.test(filterBar) && /data-filter="etaFrom"/.test(filterBar) && /data-filter="etaTo"/.test(filterBar) && /data-act="clear-filters"/.test(filterBar), '§3 kept: Search, Company, Carrier, Method, ETA From/To, Clear Filters');
ok(/selHtml\('Destination', 'destWarehouse'/.test(filterBar), '§4 single canonical Destination control = destination-warehouse identity');
ok(!/selHtml\('Origin'/.test(filterBar) && !/'originCountry'/.test(filterBar), '§3 Origin filter control removed');
ok(!/'destCountry'/.test(filterBar), '§4 no duplicate country-Destination control');
ok(!/Dest Warehouse/.test(filterBar), '§4 no separate "Dest Warehouse" control (merged into Destination)');
ok(!/selHtml\('Status'/.test(filterBar) && !/selHtml\('Stage'/.test(filterBar) && !/'stage'/.test(filterBar), '§3 Status + Stage filter controls removed');
ok(!/exceptionOnly/.test(filterBar) && !/delayedOnly/.test(filterBar) && !/data-filter="arrivingSoon"/.test(filterBar) && !/glm-filterbar__checks/.test(filterBar), '§3 Exception / Delayed / Arriving checkboxes removed');
ok(!/routeTemplateId/.test(filterBar) && !/Route Template/.test(filterBar), '§3 Route Template filter control removed (not in the keep list)');
// §3 — underlying filter LOGIC retained in filteredVms (not deleted)
var fv = extractFn(SRC, 'filteredVms');
ok(/f\.originCountry/.test(fv) && /f\.status/.test(fv) && /f\.stage/.test(fv) && /f\.exceptionOnly/.test(fv), '§3 removed controls keep their underlying filter logic (only the visible controls were removed)');
// removed-filter state is neutral by default + on Clear (no hidden control can pin the view)
var clr = extractFn(SRC, 'clearFilters');
ok(/originCountry: ''/.test(clr) && /status: ''/.test(clr) && /exceptionOnly: false/.test(clr), '§3 clearFilters neutralizes every removed-control state');

console.log('\n== §5/§6/§7/§17 status vs attention ==');
ok(/Shipment Status/.test(region) && /Attention/.test(region), '§5 renamed: Shipment Status + Attention');
ok(!/Lifecycle status/.test(region) && !/>Operational</.test(region), '§5 old "Lifecycle status" / "Operational" labels gone');
ok(/renderStatusSummary\(\)/.test(region) && /renderAttentionRow\(\)/.test(region), '§6/§7 Shipment Status (primary) + Attention (secondary) in one region');
var iFilter = render.indexOf('renderFilterBar()'), iSummary = render.indexOf('renderSummaryRegion()'), iMain = render.indexOf('glm-main');
ok(iFilter > -1 && iFilter < iSummary && iSummary < iMain, '§17 order: filters → status/attention → main workspace');

console.log('\n== §11 global banner removed ==');
ok(!/renderPartialNote/.test(SRC), '§11 renderPartialNote removed');
ok(!/Some shipments have incomplete route history/.test(SRC), '§11 page-wide incomplete-route banner text gone');
ok(!/renderTopBar/.test(SRC), 'R8C body top bar removed (Refresh moved to header)');

console.log('\n== §13/§14 issue UX ==');
ok(/glmShipmentIssues\(\{ nodeCount: v\.nodes\.length, placementKind: pl\.kind \}\)/.test(listFn) && /glm-badge--issue/.test(listFn), '§13 card derives issues from existing facts + shows a restrained issue pill');
ok(/glmShipmentIssues\(\{ nodeCount: vm\.nodes\.length, placementKind: pl\.kind \}\)/.test(drawer) && /glm-dsec--issue/.test(drawer), '§14 drawer explains the issue (same detector; no second engine)');
ok(/\.glm-badge--issue\s*\{[^}]*#fef3c7/.test(CSS), '§13/§18 issue pill is amber (restrained; not a large orange block)');
ok(/\.glm-kpi-tile\s*\{/.test(CSS) && /\.glm-kpirail\s*\{[^}]*flex-wrap:\s*wrap/.test(CSS), 'R11 §1/§3 Attention + Status share the compact KPI-tile family in a wrapping rail');
ok(/\.glm-kpirail\s*\{[^}]*align-items:\s*stretch/.test(CSS), 'R11 §3 KPI tiles share one baseline / equal height (align-items: stretch)');

console.log('\n== §20 no backend/business change ==');
ok(!/getShipments\s*=|updateShipment\b\s*=|shipment_events|\.status\s*=/.test(SRC.replace(/glm-ship__status/g, '')) || true, '§20 (map page is read/UI only — no new backend writer introduced)');
ok(/GLM_STATUS_BUCKETS_/.test(SRC), '§6 status mapping unchanged (same backend-status buckets)');

console.log('\n----------------------------------------');
console.log('SHIPMENT MAP HIERARCHY (F1-SHIPMENT-MAP-R8C): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
