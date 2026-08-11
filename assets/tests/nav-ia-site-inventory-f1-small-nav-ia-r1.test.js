// F1-SMALL-NAV-IA-R1 — navigation IA + Site Inventory naming + Pricing Center + Map warning copy (source guards).
// Frontend-only; asserts labels/order/grouping + preserved internal routing keys + warning copy/condition.
// Run: node assets/tests/nav-ia-site-inventory-f1-small-nav-ia-r1.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var root = path.join(__dirname, '..', '..');
var NAV = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var REPLEN = fs.readFileSync(path.join(root, 'assets', 'html', 'pages', 'inventory-replenishment.html'), 'utf8');
var MAP = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'global-logistics-map.js'), 'utf8');

// ---- top-level nav order: labels that follow a menu-icon (children have no menu-icon) ----
var order = [], re = /menu-icon">[^<]*<\/span><span class="menu-label">([^<]+)<\/span>/g, m;
while ((m = re.exec(NAV))) order.push(m[1]);
eq(order, ['Site Inventory', 'Warehouse', 'Forecast Overview', 'Shipment Center', 'Procurement Center', 'Campaign Performance', 'SKU Management', 'Pricing Center', 'Training Center', 'Administration'],
  'E top-level nav order = frozen Phase-1 hierarchy');
ok(order.indexOf('Campaign Performance') < order.indexOf('SKU Management'), 'F/11 Campaign Performance before SKU Management');
ok(order.indexOf('SKU Management') < order.indexOf('Pricing Center') && order.indexOf('Pricing Center') < order.indexOf('Training Center'), 'G Pricing Center after SKU Management, before Training Center');

// ---- A/B Site Inventory naming; old generic top-level "Inventory" gone ----
ok(/showSection\('ops'\)" title="Site Inventory"[\s\S]{0,80}>Site Inventory<\/span>/.test(NAV), 'A/B top-level label = Site Inventory (route key ops preserved)');
ok(!/<span class="menu-label">Inventory<\/span>/.test(NAV), 'A old generic "Inventory" top-level label removed');

// ---- C page heading Site Inventory Monitor ----
ok(/<h2>Site Inventory Monitor<\/h2>/.test(REPLEN), 'C page heading = Site Inventory Monitor');
ok(!/<h2>Inventory Replenishment<\/h2>/.test(REPLEN), 'C old page heading removed');

// ---- D icon: Site Inventory uses a storefront/site icon, not the old box 📦 ----
ok(/<span class="menu-icon">🏬<\/span><span class="menu-label">Site Inventory<\/span>/.test(NAV), 'D Site Inventory icon communicates site/storefront (🏬), not the generic box');

// ---- Pricing Center rename; internal key 'carrier' preserved; Carrier Rate Card real route intact ----
ok(/data-menu-id="carrier"[\s\S]{0,120}title="Pricing Center"[\s\S]{0,80}>Pricing Center<\/span>/.test(NAV), 'H Pricing Center label with internal routing key data-menu-id="carrier" preserved');
ok(/onclick="toggleMenu\('carrier'\)"/.test(NAV), '23 toggleMenu(carrier) key unchanged');
ok(/onclick="showSection\('carrier-rate-card'\)" title="Carrier Rate Card"/.test(NAV), '14 Carrier Rate Card real route preserved under Pricing Center');
ok(!/menu-label">Carrier \/ Route<\/span>/.test(NAV), 'old "Carrier / Route" visible label removed (provenance comment may retain the name)');

// ---- Container Rate Card / Warehouse Pricing = disabled "Soon" (no fabricated route) ----
ok(/title="Container Rate Card \(planned\)"[\s\S]{0,120}<span class="stage-badge">Soon<\/span>/.test(NAV) && !/showSection\('container-rate-card'\)/.test(NAV), '15/I Container Rate Card = Soon placeholder (no fabricated route)');
ok(/title="Warehouse Pricing \(planned\)"[\s\S]{0,120}<span class="stage-badge">Soon<\/span>/.test(NAV) && !/showSection\('warehouse-pricing'\)/.test(NAV), '16/I Warehouse Pricing = Soon placeholder (no fabricated route)');

// ---- Stage-2 visible menu removed (no code deletion needed here — just the nav row) ----
ok(!/<span class="menu-label">Shipping Management<\/span>/.test(NAV) && !/stage-badge">Stage 2</.test(NAV), 'J Shipping Management "Stage 2" menu row removed');

// ---- routing keys still present (no internal rename) ----
['showSection\\(\'ops\'\\)', "showSection\\('global-logistics-map'\\)", "showSection\\('skuDetails'\\)", "showSection\\('campaign-risk'\\)", "showSection\\('request-order-draft'\\)"].forEach(function (rx) {
  ok(new RegExp(rx).test(NAV), '23 route key preserved: ' + rx);
});

// ---- On-the-Way warning copy (data completeness, not system wiring) + condition preserved ----
ok(/Some shipments have incomplete route history/.test(MAP), 'K new warning summary describes data incompleteness');
ok(/route nodes, events, or coordinates/.test(MAP), 'K secondary copy explains historical/partial data; records remain available');
ok(!/Runtime route\/event data not yet populated/.test(MAP) && !/Runtime route\/event data incomplete/.test(MAP), 'K old wiring-implying copy removed');
ok(/if \(!rm\.shipmentRoutes\.length\) missing\.push\('shipment_routes'\)/.test(MAP) && /if \(!rm\.shipmentEvents\.length\) missing\.push\('shipment_events'\)/.test(MAP), 'L/9 warning CONDITION unchanged (no shipment_routes and/or no shipment_events rows)');
ok(/state\.partial = missing\.length \?/.test(MAP), 'L warning visibility logic preserved (only fires when data is genuinely incomplete)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
