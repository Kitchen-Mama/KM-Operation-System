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
ok(/getRange\(row, sEtaCol \+ 1\)\.setValue\(intended\)/.test(etaFn), 'ETA writer writes the eta cell from the NORMALIZED intended value');
// F1-7N-FB-4A §G — STRICTLY STRONGER than the old single-line pin. Enumerate EVERY setValue target in the
// handler and require each one to be the eta cell or an audit stamp. A new write to any other column now fails
// this suite, which the old "the eta line is present" assertion could never have caught.
var etaSetTargets = (etaFn.match(/getRange\([^)]*\)\.setValue\(/g) || []).map(function (m) { return m.replace(/\s+/g, ''); });
ok(etaSetTargets.length === 3, 'ETA writer performs exactly THREE cell writes (got ' + etaSetTargets.length + ')');
ok(etaSetTargets.every(function (t) { return /sEtaCol\+1|sUpdAt\+1|sUpdBy\+1/.test(t); }),
  'ETA writer writes ONLY eta + updated_at + updated_by — no other column is addressed');
// read-after-write is MANDATORY: success may not be claimed from the echoed input
ok(/getRange\(row, sEtaCol \+ 1\)\.getValue\(\)/.test(etaFn) && /shipEtaDateOnly_\(/.test(etaFn),
  'ETA writer READS THE CELL BACK and normalizes it before judging the outcome');
ok(/ETA_READBACK_MISMATCH/.test(etaFn) && /ETA_WRITE_NOT_ACKNOWLEDGED/.test(etaFn),
  'ETA writer has typed failures for an unreadable and a mismatched read-back');
ok(/persisted !== intended/.test(etaFn), 'ETA writer compares the PERSISTED value against the intended one');
ok(/eta: persisted/.test(etaFn), 'ETA writer returns the PERSISTED value, never the echoed input');
ok(/SHIPMENT_NOT_FOUND/.test(etaFn) && /SHIPMENT_IDENTITY_AMBIGUOUS/.test(etaFn) && /ETA_HEADER_MISSING/.test(etaFn),
  'ETA writer types not-found, ambiguous-identity and missing-header separately');
ok(/matches\.length > 1/.test(etaFn), 'ETA writer refuses to guess when more than one row carries the id');
// date-only round trip authority
var dOnly = extractFn(GS, 'shipEtaDateOnly_');
ok(/Session\.getScriptTimeZone\(\)/.test(dOnly) && !/UTC/.test(dOnly),
  'the ETA normalizer uses the named script timezone and never UTC (no UTC day shift)');
ok(!/new Date\(s\)/.test(dOnly), 'the ETA normalizer never locale-parses a string into a Date');
ok(/LockService\.getScriptLock/.test(etaFn), 'ETA writer runs under a ScriptLock');
// F1-7N-FB-4A §G/§H — the handler now READS status to PROVE it did not change, so a bare "the word status does
// not appear" test is no longer the right contract (and was never the strong one). The real guarantee is that no
// status / receipt / route / event cell is WRITTEN and no event helper is called.
// Strip comments first: an ABSENCE claim must be about the code, never about the prose that documents it.
function noComments(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
var etaCode = noComments(etaFn);
var etaSheets = (etaCode.match(/getSheetByName\((['"])[^'"]*\1\)/g) || []);
eq(etaSheets, ["getSheetByName('shipments')"], 'ETA writer opens EXACTLY ONE sheet, and it is shipments');
ok(!/shipment_received_qty/.test(etaCode) && !/shipment_routes/.test(etaCode),
  'ETA writer addresses no receipt or route column');
ok(!/shipAppendLifecycleEvent_/.test(etaFn) && !/shipPromoteOnProgress_/.test(etaFn),
  'ETA writer appends no shipment_event and runs no status promotion — the canonical event enum has no ETA member');
ok(!/sStatus \+ 1\)\.setValue/.test(etaFn), 'ETA writer never WRITES the status cell (it only reads it back as proof)');
ok(/status_unchanged/.test(etaFn) && /shipment_events_appended: 0/.test(etaFn),
  'ETA writer reports status_unchanged and a zero event count as part of its success envelope');
ok(/sUpdAt !== -1[\s\S]{0,60}updated_at/.test(GS) || /col\('updated_at'\)/.test(etaFn), 'ETA writer stamps updated_at/updated_by where present');
ok(/action === 'shipment\.eta\.update'[\s\S]{0,80}handleUpdateShipmentEta_/.test(ROUTER), 'router routes shipment.eta.update → handleUpdateShipmentEta_');
var etaAdapter = DBAPI.slice(DBAPI.indexOf('updateShipmentEta = async function'), DBAPI.indexOf('updateShipmentEta = async function') + 2600);
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
