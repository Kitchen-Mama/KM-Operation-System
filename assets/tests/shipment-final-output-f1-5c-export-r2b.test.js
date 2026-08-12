// F1-5C-EXPORT-R2B — canonical final-output aggregator + immutable snapshot.
// Proves: physical qty = shipment_lines.shipment_qty; multi-PO lineage preserved (never collapsed); executed-
// allocation conservation fail-closed; shipper=company legal entity (factory-independent); customs frozen from
// tax_referral_rates (HS + declared_currency); per-family document readiness (customs blocked by legal-importer
// gap); idempotent deterministic snapshot; immutable read (no master re-resolve); no FIFO / no recommendation
// recompute; upstream execution untouched. Pure block eval'd; persistence/immutability source-guarded.
// Run: node assets/tests/shipment-final-output-f1-5c-export-r2b.test.js
// NOTE: no 'use strict' — extracted pure helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var GS = read('specs/active/apps-script/34_shipment_final_output_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');

eval('var SFO_DISPATCHED_STATUS_ = { in_transit: 1, arrived: 1, received: 1, completed: 1, closed: 1 };');
eval(slice(GS, '// __SFO_PURE_START__', '// __SFO_PURE_END__'));

// builders
function line(o) { return { shipment_line_id: o.id || 'SL-1', sku: o.sku || 'GA0450', shipment_qty: o.qty,
  shipment_carton_qty: o.cartons || 0, gross_weight: o.gw || 0, net_weight: o.nw || 0, shipment_carton_cbm: o.cbm || 0,
  units_per_carton: o.upc || 0, note: o.note || '' }; }
function exc(o) { return { shipment_line_id: o.line, purchase_order_line_id: o.pol, allocated_qty: o.qty, allocation_status: 'executed' }; }
function tax(o) { return { series: o.series, duty_country: o.duty, country_of_origin: o.origin || 'CN', hscode: o.hs || '',
  declared_value: o.dv == null ? 0 : o.dv, declared_currency: o.dc || '', effective_from: o.from || '', effective_to: o.to || '' }; }

console.log('\n== dispatched predicate (finalization is bound to dispatch) ==');
ok(sfoIsDispatched_({ status: 'in_transit' }), 'in_transit is dispatched');
ok(sfoIsDispatched_({ status: 'received' }) && sfoIsDispatched_({ status: 'completed' }), 'arrived/received/completed are dispatched');
ok(!sfoIsDispatched_({ status: 'draft' }) && !sfoIsDispatched_({ status: 'pending' }) && !sfoIsDispatched_({ status: '' }), 'draft/pending/blank are NOT dispatched');

console.log('\n== A single-line shipment: physical qty from shipment_lines.shipment_qty ==');
eq(sfoConservation_([line({ qty: 600 })], [exc({ line: 'SL-1', pol: 'POL-1', qty: 600 })]).ok, true, 'A conservation holds (600 == 600)');
eq(sfoBuildLine_(line({ qty: 600 }), {}, '', {}, 'L1').shipment_qty, 600, 'A snapshot line physical qty = 600 (from shipment_qty)');

console.log('\n== B multi-PO lineage preserved (never collapsed) ==');
var bAllocs = [exc({ line: 'SL-1', pol: 'POL-1', qty: 300 }), exc({ line: 'SL-1', pol: 'POL-2', qty: 300 })];
eq(sfoConservation_([line({ qty: 600 })], bAllocs).ok, true, 'B conservation holds (300+300 == 600)');
var _n = 0; var bPos = sfoBuildLinePos_('SL-1', bAllocs, { 'POL-1': { purchase_order_id: 'PO-1', po_no: 'KM-PO-1' }, 'POL-2': { purchase_order_id: 'PO-2', po_no: 'KM-PO-2' } }, function () { _n++; return 'SFOP-' + _n; });
eq(bPos.length, 2, 'B two lineage rows (one per executed allocation)');
eq(bPos.map(function (p) { return p.po_no; }).sort(), ['KM-PO-1', 'KM-PO-2'], 'B both PO numbers preserved (not collapsed to one)');
eq(bPos.map(function (p) { return p.allocated_qty; }), [300, 300], 'B both allocated quantities preserved');

console.log('\n== C conservation failure -> fail closed, no snapshot ==');
var c = sfoConservation_([line({ qty: 600 })], [exc({ line: 'SL-1', pol: 'POL-1', qty: 500 })]);
eq(c.ok, false, 'C mismatch detected'); eq(c.error, 'FINAL_OUTPUT_PO_ALLOCATION_QTY_MISMATCH', 'C error token');
ok(/if \(!cons\.ok\) return \{ ok: false, error: cons\.error/.test(GS), 'C aggregator returns without building when conservation fails');
ok(/if \(!built\.ok\) return jsonResponse_\(\{ success: false, error: built\.error/.test(GS), 'C finalizer persists NOTHING when aggregate fails');

console.log('\n== D shared factory does NOT determine shipper (company-driven) ==');
var hKM = sfoBuildHeader_({ shipment_id: 'S1', company: 'KM', status: 'in_transit' }, { company: 'KM', legal_name: 'Kitchen Mama LLC', company_legal_entity_id: 'CLE-KM' }, {}, {}, { factory_id: 'FAC-A', factory_name: 'Factory A' }, {}, {});
var hTW = sfoBuildHeader_({ shipment_id: 'S2', company: 'ResTW', status: 'in_transit' }, { company: 'ResTW', legal_name: 'Res Taiwan Ltd' }, {}, {}, { factory_id: 'FAC-A', factory_name: 'Factory A' }, {}, {});
eq(hKM.shipper_legal_name, 'Kitchen Mama LLC', 'D KM shipper from company legal entity'); eq(hKM.factory_id, 'FAC-A', 'D factory frozen independently');
ok(hKM.shipper_legal_name !== hTW.shipper_legal_name && hKM.factory_id === hTW.factory_id, 'D same factory, different shipper (no factory→company inference)');
ok(/partyResolveShipmentShipper_\(entities, shipment, asOfMs\)/.test(GS) && /procurementResolveFactoryId_\(ss, sfoStr_\(shipment\.source_warehouse_id\)/.test(GS), 'D aggregator resolves shipper (company) and factory (warehouse) independently');

console.log('\n== §11 customs frozen from tax_referral_rates (HS + declared_currency; country-specific) ==');
var TR = [tax({ series: 'GA', duty: 'US', hs: '7323.99', dv: 5, dc: 'USD', from: '2026-01-01' }),
  tax({ series: 'GA', duty: 'CA', hs: '9999.00', dv: 4, dc: 'CAD', from: '2026-01-01' }),
  tax({ series: 'GA', duty: 'US', hs: '7323.10', dv: 6, dc: 'USD', from: '2026-06-01' })];
var us = sfoResolveCustoms_(TR, 'GA', 'US', '2026-07-01');
eq(us.hs_code, '7323.10', '§11 latest effective HS wins (7323.10)'); eq(us.declared_currency, 'USD', '§11 declared_currency surfaced');
eq(sfoResolveCustoms_(TR, 'GA', 'CA', '2026-07-01').hs_code, '9999.00', '§11 country-specific HS by duty_country (CA != US)');
eq(sfoResolveCustoms_(TR, 'GA', 'US', '2025-06-01').resolved, false, '§11 asOf before all effective_from -> no match (no fabricated fallback)');
eq(sfoResolveCustoms_(TR, 'ZZ', 'US', '2026-07-01').resolved, false, '§11 no match -> resolved:false (no global fallback)');
eq(sfoBuildLine_(line({ qty: 10 }), {}, '', { declared_unit_value: 5, declared_currency: 'USD', hs_code: '7323.10', country_of_origin: 'CN' }, 'L1').declared_total_value, 50, '§11 declared_total = unit x shipment_qty (5 x 10)');

console.log('\n== §9 GS1 frozen from sku_details (not units_per_carton) ==');
var gl = sfoBuildLine_(line({ qty: 10, upc: 24 }), { gs1_code: '0123456789012', gs1_type: 'UPC', units_per_carton: 24, product_name: 'Can Opener' }, '', {}, 'L1');
eq(gl.gs1_code, '0123456789012', '§9 gs1_code frozen'); eq(gl.gs1_type, 'UPC', '§9 gs1_type frozen'); eq(gl.units_per_carton, 24, '§9 units_per_carton is a separate field (not GS1)');

console.log('\n== §16 document readiness per family ==');
var rdyHeader = { shipper_legal_entity_id: 'CLE-KM', shipper_legal_name: 'KM', consignee_location_id: 'LL-1', carrier_id: 'C1', shipping_method: 'sea' };
var rdyLines = [{ declared_currency: 'USD', declared_unit_value: 5 }];
var R = sfoDocumentReadiness_(rdyHeader, rdyLines);
eq(R.shipping_detail.status, 'READY', 'shipping_detail READY with base facts');
eq(R.packing_list.status, 'READY', 'packing_list READY with lines+consignee');
eq(R.commercial_invoice.status, 'READY', 'commercial_invoice READY with declared value');
eq(R.booking.status, 'READY', 'booking READY with carrier+method');
eq(R.customs.status, 'BLOCKED', 'M customs BLOCKED'); eq(R.customs.reason, 'LEGAL_IMPORTER_AUTHORITY_GAP', 'M customs blocked by legal-importer gap (not fabricated)');
var R2 = sfoDocumentReadiness_({ shipper_legal_name: 'KM', consignee_location_id: 'LL-1' }, [{ declared_currency: '', declared_unit_value: 0 }]);
eq(R2.commercial_invoice.status, 'BLOCKED', 'commercial_invoice BLOCKED without declared value');
eq(R2.shipping_detail.status, 'READY', 'M base Shipping Detail still READY though CI/customs blocked');

console.log('\n== §17 aggregator loads server-side; site SKU is company/country/marketplace scoped ==');
ok(/skuRegionalLookup_\(ss, sku, sfoStr_\(shipment\.company\), sfoStr_\(shipment\.country\), sfoStr_\(shipment\.marketplace\)\)/.test(GS), 'I site SKU via regional resolver scoped by sku+company+country+marketplace');
ok(/procurementMarketplaceSkuMap_\(ss\)\[sku \+ '\|' \+ sfoStr_\(shipment\.company\)/.test(GS), 'I fallback marketplace_skus map is also scoped (not sku-only)');

console.log('\n== Q/§13 physical qty source guard (no PO ordered/completed as physical qty) ==');
var lineBuilder = slice(GS, 'function sfoBuildLine_', 'function sfoBuildLinePos_');
ok(/shipment_qty: qty/.test(lineBuilder) && /var qty = sfoNum_\(line\.shipment_qty\)/.test(lineBuilder), 'Q line physical qty = shipment_lines.shipment_qty');
ok(!/ordered_qty|completed_qty|recommended_qty|requested_qty/.test(lineBuilder), 'Q line builder never reads PO ordered/completed/recommended/requested qty');

console.log('\n== R no FIFO / S no recommendation recompute in the aggregator ==');
ok(!/slaFifoCompare_|order_date|\.sort\(function[\s\S]{0,60}po_no/.test(GS), 'R no FIFO ordering/allocation logic (owner = R3A)');
ok(!/\bgap\b|\bforecast\b|recommendation|avg_sales_per_day|averageSales/i.test(GS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')), 'S no Gap/Forecast/recommendation recompute');
var posBuilder = slice(GS, 'function sfoBuildLinePos_', 'function sfoBuildHeader_');
ok(!/\.sort\(/.test(posBuilder), 'R lineage builder does not sort/prioritize (preserves all executed allocations)');

console.log('\n== E/F/G/H/U immutability: read owner returns FROZEN rows, never re-resolves masters ==');
var readOwner = slice(GS, 'function handleGetShipmentFinalOutput_', 'function sfoAppendByHeader_'); // read fn precedes nothing after; take to EOF-ish
readOwner = GS.slice(GS.indexOf('function handleGetShipmentFinalOutput_'));
ok(!/partyResolve|sfoResolveCustoms_|skuRegionalLookup_|sfoSkuMasterMap_|sfoBuildSnapshot_|procurementResolveFactoryId_/.test(readOwner), 'U read owner NEVER calls a master resolver (immutable: later master edits cannot change output)');
ok(/prodRequireSheet_\(ss, 'shipment_final_output_snapshots'/.test(readOwner) && /prodRequireSheet_\(ss, 'shipment_final_output_lines'/.test(readOwner) && /prodRequireSheet_\(ss, 'shipment_final_output_line_pos'/.test(readOwner), 'read owner returns persisted header+lines+lineage');

console.log('\n== N/O/P retry/two-tab/lost-response: idempotent deterministic snapshot ==');
ok(/var snapId = 'SFO-' \+ shipmentId/.test(GS), 'N deterministic snapshot identity SFO-<shipment_id> (one per shipment)');
ok(/already_finalized: true/.test(GS) && /LockService\.getScriptLock\(\)/.test(GS), 'O ScriptLock + existing-snapshot short-circuit (no duplicate)');
ok(/sfoDeleteRowsFor_\(lineSheet, 'shipment_id', shipmentId\)/.test(GS), 'P orphan cleanup before append (deterministic replace on retry)');

console.log('\n== §26/§28 upstream execution untouched; separate post-dispatch owner ==');
ok(!/\.setValue\(/.test(GS), '§28 handler writes NO cell mutations (never edits shipments/PO/allocation state)');
eq((GS.match(/sfoAppendByHeader_\((headSheet|lineSheet|poSheet)\b/g) || []).length, 3, '§28 the 3 append call-sites target ONLY the final-output sheets');
ok(!/appendByHeader_\((?!headSheet|lineSheet|poSheet|sheet, obj)/.test(GS), '§28 no append to any shipments/PO/allocation sheet');
ok(/SHIPMENT_NOT_DISPATCHED/.test(GS), '§4 refuses to finalize a non-dispatched shipment (bound to dispatch)');
ok(/Shipment remains truthfully dispatched/.test(GS), '§26 dispatch never rolled back if snapshot write fails');

console.log('\n== §21 governance: 3 additive tables; migration-only twins never invoked; validate-only reads ==');
var codeOnly = GS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/prodMigrateCreateSheet_\s*\(|prodMigrateAppendColumns_\s*\(/.test(codeOnly), '§21 handler NEVER invokes a migration twin (production-safety INIT.4)');
ok(/var SFO_SNAPSHOT_HEADERS_ =/.test(GS) && /var SFO_LINE_HEADERS_ =/.test(GS) && /var SFO_LINE_PO_HEADERS_ =/.test(GS), '§3 three normalized tables (header / lines / line-PO lineage)');
ok(!/generated_documents|document_templates|document_template_fields/.test(codeOnly), 'names do not collide with the frozen document layer');
['snapshot_id', 'shipment_id', 'shipper_legal_name', 'consignee_location_id', 'shipment_total_qty', 'customs_ready'].forEach(function (c) { ok(new RegExp("'" + c + "'").test(GS), 'snapshot header owns ' + c); });
['shipment_line_id', 'shipment_qty', 'gs1_code', 'hs_code', 'declared_unit_value'].forEach(function (c) { ok(new RegExp("'" + c + "'").test(GS), 'snapshot line owns ' + c); });
['purchase_order_line_id', 'po_no', 'allocated_qty'].forEach(function (c) { ok(new RegExp("'" + c + "'").test(GS), 'lineage owns ' + c); });

console.log('\n== §24 router: one finalize + one read owner ==');
ok(/action === 'finalizeShipmentFinalOutput'/.test(ROUTER) && /handleFinalizeShipmentFinalOutput_\(body\)/.test(ROUTER), 'finalize action routed');
ok(/action === 'getShipmentFinalOutput'/.test(ROUTER) && /handleGetShipmentFinalOutput_\(body\)/.test(ROUTER), 'get action routed (single read owner — no browser fan-out)');

console.log('\n----------------------------------------');
console.log('SHIPMENT FINAL OUTPUT (F1-5C-EXPORT-R2B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
