// F1-SHIPMENT-MAP-R10 — Current Position + ETA edit + Receiving UX. Extracts the real pure validators
// (shipEtaValidate_, shipDeriveReceiptStatus_) and source-guards the bounded ETA writer, the router route,
// the DB adapter, and the drawer UX (Receive All = draft-only, collapsible Receiving, read-only status,
// overdue visibility, reload-on-success). Run: node assets/tests/shipment-map-route-eta-receiving-f1-shipment-map-r10.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var GS = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '31_shipment_receipt_route_handlers.gs'), 'utf8');
var ROUTER = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '01_router.gs'), 'utf8');
var DBAPI = fs.readFileSync(path.join(__dirname, '..', 'js', 'api', 'operation-system-db-api.js'), 'utf8');
var MAP = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'global-logistics-map.js'), 'utf8');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
eval(/var SHIP_RECEIPT_PARTIAL_ = '[^']*';/.exec(GS)[0]);
eval(/var SHIP_RECEIPT_FULL_ = '[^']*';/.exec(GS)[0]);
eval(extractFn(GS, 'shipReceiptNum_'));
eval(extractFn(GS, 'shipEtaValidate_'));
eval(extractFn(GS, 'shipDeriveReceiptStatus_'));

// ===== ETA validation (D future valid, E past valid, malformed invalid) =====
eq(shipEtaValidate_('2026-12-01'), { ok: true, value: '2026-12-01', code: 'OK' }, 'D future ETA valid');
eq(shipEtaValidate_('2020-01-15').ok, true, 'E past ETA is VALID (overdue stays legitimate, not rejected)');
eq(shipEtaValidate_('2026-13-01').ok, false, 'invalid month rejected');
eq(shipEtaValidate_('2026-02-30').ok, false, 'invalid calendar day rejected');
eq(shipEtaValidate_('').code, 'INVALID_ETA', 'blank ETA rejected (must supply a date)');
eq(shipEtaValidate_('12/01/2026').ok, false, 'non-ISO format rejected (no parse-guess)');

// ===== FINAL NODE != RECEIVED — status is receipt-derived, route-independent =====
eq(shipDeriveReceiptStatus_([{ shippedQty: 500, received: 500 }, { shippedQty: 600, received: 300 }]).status, 'partially_received', 'H final-node partial set → partially_received (NOT received)');
eq(shipDeriveReceiptStatus_([{ shippedQty: 500, received: 500 }, { shippedQty: 600, received: 600 }]).status, 'received', 'G all lines full → received');
eq(shipDeriveReceiptStatus_([{ shippedQty: 500, received: 0 }, { shippedQty: 600, received: 0 }]).status, '', 'I zero receipt → no status (final node alone never auto-receives)');

// ===== bounded ETA writer (31_) — only eta + audit stamps; no status/route/receipt =====
var etaFn = extractFn(GS, 'handleUpdateShipmentEta_');
ok(/shipEtaValidate_\(/.test(etaFn), 'ETA writer validates via the canonical pure validator');
ok(/getRange\(row, sEtaCol \+ 1\)\.setValue\(etaCheck\.value\)/.test(etaFn), 'ETA writer writes ONLY the eta cell (normalized value)');
ok(/LockService\.getScriptLock/.test(etaFn), 'ETA writer runs under a ScriptLock');
ok(!/\bstatus\b/.test(etaFn) && !/shipment_received_qty/.test(etaFn) && !/shipment_routes/.test(etaFn), 'ETA writer never touches status / receipt / route');
ok(/sUpdAt !== -1[\s\S]{0,60}updated_at/.test(GS) || /col\('updated_at'\)/.test(etaFn), 'ETA writer stamps updated_at/updated_by where present');
ok(/action === 'shipment\.eta\.update'[\s\S]{0,80}handleUpdateShipmentEta_/.test(ROUTER), 'router routes shipment.eta.update → handleUpdateShipmentEta_');
var etaAdapter = DBAPI.slice(DBAPI.indexOf('updateShipmentEta = async function'), DBAPI.indexOf('updateShipmentEta = async function') + 1400);
ok(/action: 'shipment\.eta\.update'/.test(etaAdapter) && /if \(json && json\.success\) \{ await _kmWriterPostWrite_\(\); \}/.test(etaAdapter), 'DB adapter posts shipment.eta.update + runs the post-write seam on success (F1-7K: page owns scoped readback; no whole-DB reload)');

// ===== drawer UX (source guards) =====
var wire = extractFn(MAP, 'wireReceiptControls');
// Receive All fills DRAFT inputs only — no immediate DB write in its handler
var raStart = wire.indexOf("data-act=\"receive-all\""), raEnd = wire.indexOf('keepReceivingOpen');
var raBlock = wire.slice(raStart, raEnd);
ok(/inp\.value = parseFloat\(inp\.getAttribute\('data-shipped'\)\)/.test(raBlock), '§8 Receive All fills each input to its shipped qty (draft)');
ok(!/updateShipmentReceipt/.test(raBlock), '§8/§16 Receive All performs NO immediate DB write (Save Receipt commits)');
ok(/data-act="receipt-save"/.test(wire) && /updateShipmentReceipt\(\{ shipment_id: vm\.shipmentId, lines: lines/.test(wire), 'Save Receipt commits through the canonical shipment.receipt.update owner');
ok(/keepReceivingOpen\(\);[\s\S]{0,200}Receipt save failed|saveBtn\.disabled = false; keepReceivingOpen\(\)/.test(wire), '§17.L receipt validation error keeps Receiving expanded (values preserved)');
ok(/updateShipmentEta\(\{ shipment_id: vm\.shipmentId, eta: v/.test(wire), 'ETA control commits through the bounded ETA adapter');
ok(/advanceShipmentRoutePoint\(\{ shipment_id: vm\.shipmentId, route_template_node_id: sel\.value/.test(wire), 'Current Position commits through the canonical route.advance owner');

var panel = extractFn(MAP, 'receiptPanelHtml');
ok(/details class="glm-recv"' \+ \(autoExpand \? ' open' : ''\)/.test(panel), '§6 Receiving is a collapsible <details>, default collapsed (open only when autoExpand)');
ok(/autoExpand = \(derived === 'partially_received'\)/.test(panel) && /curSeq >= recvCapSeq/.test(panel), '§6 auto-expand when partially_received OR at/after the receiving-capable node');
ok(/Current Position \(route node\)/.test(panel) && /data-route-select/.test(panel), '§2 Current Position selector uses canonical route nodes');
ok(/data-eta-input/.test(panel) && /type="date"/.test(panel), '§4 ETA is an editable date control');
ok(/Shipment Status is system-derived/.test(panel) && !/status.?dropdown/i.test(panel) && !/<select[^>]*status/i.test(panel), '§3 status shown read-only (no status dropdown; backend-derived)');
ok(/Receive All/.test(panel) && /receiveAllEnabled = totalRemaining > 0 && atReceiving/.test(panel), '§9 Receive All gated on remaining>0 AND at receiving-capable node');

// frontend never authors shipments.status (no updateShipment status write from the map)
ok(!/updateShipment\(\{[^}]*status/.test(MAP) && !/status:\s*(?:'|")(?:received|partially_received)/.test(MAP), 'frontend never writes shipments.status (backend-derived only)');

// overdue visibility: only `cancelled` is excluded; a past ETA drives the `delayed` flag, never a drop
ok(/EXCLUDE_SET = \{ cancelled: 1 \}/.test(MAP), '§5 only cancelled shipments are excluded (overdue never removes a shipment)');
ok(/delayed: !delivered && etaMs != null && etaMs < today/.test(MAP), '§5 past ETA surfaces as delayed (shipment remains visible)');

// reload-on-success owner unchanged (route/ETA/receipt all call afterShipmentWrite)
ok(/function afterShipmentWrite/.test(MAP) && /buildReadModel\(\)/.test(extractFn(MAP, 'afterShipmentWrite')), '§13 single reload owner rebuilds canonical DB truth after any successful mutation');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
