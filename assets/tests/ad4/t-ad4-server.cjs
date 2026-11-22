'use strict';
// AD4 server test: the REAL work 12_ + 11_ and the frozen c2 22_ evaluated in one vm context with a synthetic in-memory spreadsheet
// (labelled fixture; no 00_config / 84_ loaded; no network, no DB).   node t-ad4-server.cjs <Sandbox|Production>
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const ENV = process.argv[2] || 'Sandbox', W = path.join(process.env.AD4_CANDIDATE || path.resolve('output/ad4-codex-20261122/release-final/candidate'), ENV, 'apps-script');
const C2 = 'C:/Users/viczh/kmc/pkg/phase1-next-20261113/joint-afinal-ad3-install-c2/candidate/' + ENV + '/apps-script';
// KMCID lives in the 90_ bundle (not loaded here): a labelled stand-in with the one function the helper reads. 'XG' is a synthetic planning group.
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(C2, '../site/assets/js/core/supply-planning-country-identity.js'), 'utf8'), ctx);
const realPlanningSet = ctx.KMCID.planningSetMembers;
ctx.KMCID.planningSetMembers = (c) => c === 'XG' ? ['US', 'CA'] : realPlanningSet(c);
for (const f of [path.join(C2, '22_shipment_dispatch_handlers.gs'), path.join(W, '12_shipment_handlers.gs'), path.join(W, '11_shipping_plan_handlers.gs')]) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });
const WH = ['warehouse_id', 'warehouse_code', 'warehouse_name', 'company', 'country', 'warehouse_type', 'is_active', 'is_factory_warehouse', 'marketplace'];
const wh = (id, co, ct, type, o) => Object.assign({ warehouse_id: id, warehouse_code: id, warehouse_name: id, company: co, country: ct, warehouse_type: type, is_active: true, is_factory_warehouse: type === 'FACTORY', marketplace: '' }, o || {});
const WAREHOUSES = [
  wh('US-3PL-A', 'ResUS', 'US', '3PL'), wh('US-3PL-B', 'ResUS', 'US', '3PL'), wh('US-FBA-1', 'ResUS', 'US', 'FBA', { marketplace: 'Amazon' }),
  wh('WH-RESUS-US-WFS-WALMART', 'ResUS', 'US', 'FBA', { marketplace: 'Walmart' }), wh('US-3PL-OFF', 'ResUS', 'US', '3PL', { is_active: false }),
  wh('CA-FBA-1', 'ResUS', 'CA', 'FBA'), wh('CA-3PL-A', 'ResUS', 'CA', '3PL'), wh('CA-3PL-B', 'ResUS', 'CA', '3PL'),
  wh('DE-3PL-A', 'ResUS', 'DE', '3PL'), wh('FR-FBA-1', 'ResUS', 'FR', 'FBA'), wh('EU-3PL', 'ResUS', 'EU', '3PL'), wh('EU-FBA', 'ResUS', 'EU', 'FBA'),
  wh('KM-FBA-1', 'KM', 'US', 'FBA'), wh('CN-FAC', 'ResUS', 'CN', 'FACTORY'), wh('US-NOCTRY-3PL', 'ResUS', '', '3PL'), wh('US-RET', 'ResUS', 'US', 'RETURN'),
  wh('US-DUP', 'ResUS', 'US', 'FBA'), wh('US-DUP', 'ResUS', 'US', 'FBA'), wh('XG-3PL', 'ResUS', 'XG', '3PL'), wh('XG-FBA', 'ResUS', 'XG', 'FBA')
];
const CARDS = [{ customs_type: 'third_party_customs', customs_type_label: 'Third-party customs' }, { customs_type: 'self_customs', customs_type_label: 'Self customs' }];
const sheet = (head, rows) => ({ getDataRange: () => ({ getValues: () => [head].concat(rows.map((r) => head.map((h) => r[h] === undefined ? '' : r[h]))) }), getLastRow: () => rows.length + 1, getLastColumn: () => head.length });
const ss = { getSheetByName: (n) => n === 'warehouses' ? sheet(WH, WAREHOUSES) : n === 'carrier_rate_cards' ? sheet(['customs_type', 'customs_type_label'], CARDS) : null };
let pass = 0, fail = 0; const ok = (n, c, d) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(d))); };
const A = (src, dst, co, extra) => ctx.shipCustomsApplicability_(ss, Object.assign({ company: co || 'ResUS', country: 'US', marketplace: 'Amazon', source_warehouse_id: src, destination_warehouse_id: dst }, extra || {}));
const na = (r) => r && r.applicable === false, app = (r, why) => r && r.applicable === true && (!why || r.reason === why);
ok('S1 US 3PL -> US FBA same company: customs NOT applicable', na(A('US-3PL-A', 'US-FBA-1')) && A('US-3PL-A', 'US-FBA-1').country === 'US', A('US-3PL-A', 'US-FBA-1'));
ok('S2 US 3PL -> US 3PL same company (approved US branch): NOT applicable', na(A('US-3PL-A', 'US-3PL-B')), A('US-3PL-A', 'US-3PL-B'));
ok('S3 [NEG] factory source: applicable', app(A('CN-FAC', 'US-FBA-1'), 'SOURCE_NOT_OVERSEAS_3PL'), A('CN-FAC', 'US-FBA-1'));
ok('S4 [NEG] cross-border US -> CA: applicable', app(A('US-3PL-A', 'CA-FBA-1'), 'NOT_SAME_COUNTRY'), A('US-3PL-A', 'CA-FBA-1'));
ok('S5 [NEG] cross-border DE -> FR: applicable', app(A('DE-3PL-A', 'FR-FBA-1'), 'NOT_SAME_COUNTRY'), A('DE-3PL-A', 'FR-FBA-1'));
ok('S6 [NEG] EU planning group is not a country: applicable', app(A('EU-3PL', 'EU-FBA')), A('EU-3PL', 'EU-FBA'));
ok('S6b [NEG] a two-letter planning group (synthetic XG) and a missing country authority: applicable', (function () { var r1 = A('XG-3PL', 'XG-FBA'); var k = ctx.KMCID; ctx.KMCID = undefined; var r2 = A('US-3PL-A', 'US-FBA-1'); ctx.KMCID = k; return app(r1, 'PLANNING_GROUP_NOT_A_COUNTRY') && app(r2, 'COUNTRY_AUTHORITY_UNAVAILABLE_OR_GROUP'); })(), null);
ok('S7 [NEG] other company destination: applicable', app(A('US-3PL-A', 'KM-FBA-1'), 'COMPANY_MISMATCH'), A('US-3PL-A', 'KM-FBA-1'));
ok('S8 [NEG] inactive source: applicable', app(A('US-3PL-OFF', 'US-FBA-1'), 'WAREHOUSE_INACTIVE'), A('US-3PL-OFF', 'US-FBA-1'));
ok('S9 [NEG] unknown warehouse / duplicate master row: applicable', app(A('NOPE', 'US-FBA-1'), 'WAREHOUSE_NOT_UNIQUE_IN_MASTER') && app(A('US-3PL-A', 'US-DUP'), 'WAREHOUSE_NOT_UNIQUE_IN_MASTER'), [A('NOPE', 'US-FBA-1'), A('US-3PL-A', 'US-DUP')]);
ok('S10 [NEG] logical WFS row: applicable', app(A('US-3PL-A', 'WH-RESUS-US-WFS-WALMART'), 'DESTINATION_LOGICAL_OR_UNVERIFIED'), A('US-3PL-A', 'WH-RESUS-US-WFS-WALMART'));
ok('S11 [NEG] non-US 3PL -> 3PL (CA not enabled): applicable', app(A('CA-3PL-A', 'CA-3PL-B', 'ResUS', { country: 'CA' }), 'TRANSFER_COUNTRY_NOT_ENABLED'), null);
ok('S12 [NEG] blank source country / RETURN destination / blank identity: applicable', app(A('US-NOCTRY-3PL', 'US-FBA-1')) && app(A('US-3PL-A', 'US-RET'), 'DESTINATION_TYPE_NOT_ELIGIBLE') && app(A('', 'US-FBA-1')) && app(A('US-3PL-A', 'US-FBA-1', ' ')), null);
ok('S13 [NEG] source = destination: applicable', app(A('US-3PL-A', 'US-3PL-A')), A('US-3PL-A', 'US-3PL-A'));
ok('S14 CA 3PL -> CA FBA (same country platform transfer): NOT applicable', na(A('CA-3PL-A', 'CA-FBA-1', 'ResUS', { country: 'CA' })), A('CA-3PL-A', 'CA-FBA-1'));
const planDom = { company: 'ResUS', country: 'US', marketplace: 'Amazon', source_warehouse_id: 'US-3PL-A', destination_warehouse_id: 'US-FBA-1', customs_type: '' };
const planIntl = { company: 'ResUS', country: 'US', source_warehouse_id: 'CN-FAC', destination_warehouse_id: 'US-FBA-1', customs_type: '' };
const planOld = Object.assign({}, planDom, { customs_type: 'third_party_customs' });
ok('S15 [NEG] saved country and actual warehouses disagree', app(A('US-3PL-A', 'US-FBA-1', 'ResUS', { country: 'CA' }), 'SAVED_COUNTRY_MISMATCH'), null);
ok('S16 [NEG] wrong platform cannot waive customs', app(A('US-3PL-A', 'US-FBA-1', 'ResUS', { marketplace: 'Walmart' }), 'DESTINATION_PLATFORM_MISMATCH'), null);
WAREHOUSES.push(wh('ZZ-3PL', 'ResUS', 'ZZ', '3PL'), wh('ZZ-FBA', 'ResUS', 'ZZ', 'FBA'));
ok('S17 [NEG] an unknown two-letter country cannot waive customs', app(A('ZZ-3PL', 'ZZ-FBA', 'ResUS', { country: 'ZZ' }), 'PHYSICAL_COUNTRY_NOT_SUPPORTED'), null);
WAREHOUSES.push(wh('GB-3PL', 'ResUS', 'GB', '3PL'), wh('GB-FBA', 'ResUS', 'GB', 'FBA'));
ok('S18 canonical UK scope / GB physical country', na(A('GB-3PL', 'GB-FBA', 'ResUS', { country: 'UK' })), null);
ok('S19 read failure cannot waive customs', app(ctx.shipCustomsApplicability_({ getSheetByName() { throw Error('denied'); } }, planDom), 'NOT_PROVEN_ERROR'), null);
ok('S20 a group scope may identify a real DE domestic leg, never a group warehouse', (function () { WAREHOUSES.push(wh('DE-FBA', 'ResUS', 'DE', 'FBA')); return na(A('DE-3PL-A', 'DE-FBA', 'ResUS', { country: 'EU' })); })(), null);
const lo = ctx.sc13PlanLaneOptions_(ss, planDom), li = ctx.sc13PlanLaneOptions_(ss, planIntl);
ok('L1 lane options, domestic: customs_applicable false, empty list, basis country US', lo.customs_applicable === false && lo.customs.length === 0 && lo.customs_basis && lo.customs_basis.country === 'US', lo);
ok('L2 lane options, international: customs_applicable true, list of 2 as before', li.customs_applicable === true && li.customs.length === 2 && li.customs_basis === null, li);
const K = (p, body) => ctx.spRcWk1Customs_(ss, p, body);
ok('W1 domestic + blank customs asked: ok, nothing changed (plan untouched)', K(planDom, { customs_type: '' }).ok === true && K(planDom, { customs_type: '' }).asked === false && K(planDom, { customs_type: '' }).plan === planDom, K(planDom, { customs_type: '' }));
ok('W2 [NEG] domestic + a NEW customs value: refused PLAN_CUSTOMS_NOT_APPLICABLE', K(planDom, { customs_type: 'self_customs' }).code === 'PLAN_CUSTOMS_NOT_APPLICABLE', K(planDom, { customs_type: 'self_customs' }));
ok('W3 old domestic plan carrying a customs value: same value or blank accepted, stored value kept', K(planOld, { customs_type: 'third_party_customs' }).ok && K(planOld, { customs_type: '' }).ok && K(planOld, { customs_type: '' }).plan.customs_type === 'third_party_customs', null);
ok('W4 [NEG] international + blank customs asked: PLAN_CUSTOMS_REQUIRED (unchanged)', K(planIntl, { customs_type: '' }).code === 'PLAN_CUSTOMS_REQUIRED', K(planIntl, { customs_type: '' }));
ok('W5 international + valid customs: ok asked (unchanged); invalid: PLAN_CUSTOMS_NOT_VALID', K(planIntl, { customs_type: 'self_customs' }).ok && K(planIntl, { customs_type: 'self_customs' }).asked === true && K(planIntl, { customs_type: 'bogus' }).code === 'PLAN_CUSTOMS_NOT_VALID', null);
ok('W6 no customs_type in the request: ok not asked (unchanged, both lanes)', K(planDom, {}).ok && K(planIntl, {}).ok && K(planIntl, {}).asked === false, null);
ok('W7 legacy customs is explicitly returned for the service writer, never undefined', K(planOld, { customs_type: '' }).customs_type === 'third_party_customs' && K(planDom, { customs_type: '' }).customs_type === '', null);

ctx.jsonResponse_ = x => x;
ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
ctx.SpreadsheetApp = { getActiveSpreadsheet: () => ss, flush() {} };
ctx.shipWriteReadStage_ = () => ({ ss, close() {} });
ctx.editP1Gate15f2_ = () => null; ctx.editTokWritten15f2_ = x => x;
ctx.editTokSame_ = (a, b) => a === b ? 'SAME' : 'DIFFERENT';
ctx.editNextStamp_ = () => 'v2'; ctx.shippingPlanTimestamp_ = () => 'now'; ctx.shippingPlanToday_ = () => '2026-11-22';
ctx.spRcExplicitService_ = () => ({ c: 'CAR_BESTWAY', m: 'truck', l: 'truck' });
ctx.spRcPlanLines_ = () => []; ctx.spRcTotals_ = () => ({});
ctx.spRcLaneCards_ = () => ({ cards: [], unclassified: [], origin: 'US' });
let servicePlan;
const serviceWrites = [];
const serviceHeaders = ['shipping_plan_id', 'status', 'updated_at', 'company', 'country', 'marketplace', 'source_warehouse_id', 'destination_warehouse_id', 'customs_type', 'carrier_id', 'shipping_method', 'last_mile_delivery', 'carrier_unit_rate', 'carrier_rate_type', 'currency', 'estimated_freight_cost', 'estimated_duty', 'estimated_duty_currency', 'estimated_customs_fee', 'estimated_total_cost', 'updated_by'];
ctx.spRcPlanRow_ = () => ({ v: servicePlan, headers: serviceHeaders, row: 2, sheet: { getRange: (row, col) => ({ setValue: v => { servicePlan[serviceHeaders[col - 1]] = v; serviceWrites.push([col, v]); } }) } });
const serviceBody = { shipping_plan_id: 'PLAN-SVC', expected_current_carrier_id: '', expected_updated_at: 'v1', service_only: true, explicit_service: true, carrier_id: 'CAR_BESTWAY', shipping_method: 'truck', last_mile_delivery: 'truck', delivery_type: 'LTL' };
for (const legacy of [false, true]) {
  servicePlan = Object.assign({}, legacy ? planOld : planDom, { shipping_plan_id: 'PLAN-SVC', status: 'draft', updated_at: 'v1', carrier_id: '' }); serviceWrites.length = 0;
  const answer = ctx.spRcWk1CustomsOnly_(serviceBody);
  ok('H0 real service-save, legacy=' + legacy + ': verified pending, no fake zero or undefined customs', answer.success && answer.verified && answer.priced === false && servicePlan.estimated_total_cost === '' && servicePlan.customs_type === (legacy ? 'third_party_customs' : '') && serviceWrites.every(x => x[1] !== undefined), answer);
}
servicePlan = Object.assign({}, planIntl, { shipping_plan_id: 'PLAN-SVC', status: 'draft', updated_at: 'v1', carrier_id: '' }); serviceWrites.length = 0;
const missingInternational = ctx.spRcWk1CustomsOnly_(serviceBody);
ok('H0b actual omitted-customs request is still refused on international lane, zero writes', missingInternational.code === 'CUSTOMS_SAVE_INCOMPLETE' && serviceWrites.length === 0, missingInternational);

// Exercise the real locked lane-save handler with a labelled in-memory write/read-back adapter.
let saved = Object.assign({ shipping_plan_id: 'PLAN-TEST', status: 'draft', updated_at: 'v1', carrier_rate_type: '' }, planDom);
const writes = [];
const header = Object.keys(saved).concat(['destination_type', 'destination', 'carrier_unit_rate', 'estimated_freight_cost', 'estimated_duty', 'estimated_duty_currency', 'estimated_customs_fee', 'estimated_total_cost', 'updated_by']);
const realRead = ctx.sc13Read_;
ctx.sc13Read_ = (book, name, cols) => name === 'shipping_plans' ? { headers: header, rows: [saved] } : realRead(book, name, cols);
ctx.sc13Set_ = (table, row, k, value) => { saved[k] = value; writes.push([k, value]); };
ctx.sc13One_ = (rows, k, id) => rows.find(r => r[k] === id);
ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
ctx.SpreadsheetApp = { getActiveSpreadsheet: () => ss, flush() {} };
ctx.editTokSame_ = (a, b) => a === b ? 'SAME' : 'DIFFERENT';
ctx.editNextStamp_ = () => 'v2'; ctx.shipmentTimestamp_ = () => 'now'; ctx.editTokWritten15f2_ = x => x;
ctx.jsonResponse_ = x => x;
const save = dst => ctx.sc13SavePlanLane_({ action: 'test', shipping_plan_id: saved.shipping_plan_id, save_lane: true, destination_warehouse_id: dst, customs_type: '', expected_updated_at: saved.updated_at, actor: 'fixture' });
const savedResult = save('US-3PL-B');
ok('H1 real lane-save accepts domestic destination without customs and verifies readback', savedResult.success && saved.destination_warehouse_id === 'US-3PL-B' && saved.customs_type === '', savedResult);
saved = Object.assign({}, saved, planIntl, { destination_warehouse_id: 'US-FBA-1' }); writes.length = 0;
const requiredResult = save('US-3PL-B');
ok('H2 real lane-save keeps factory customs required, no writes', requiredResult.code === 'PLAN_CUSTOMS_REQUIRED' && writes.length === 0, requiredResult);
console.log('SUMMARY t-ad4-server env=' + ENV + ' pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0);
