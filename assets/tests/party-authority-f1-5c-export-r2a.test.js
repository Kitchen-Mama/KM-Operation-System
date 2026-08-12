// F1-5C-EXPORT-R2A — Party / Legal-Entity authority closure. Proves the pure resolvers:
//   shipper/seller-of-record = shipment.company -> company_legal_entities (NEVER factory/warehouse/destination);
//   consignee = destination_warehouse_id -> logistics_locations (identity = warehouse_id, NOT warehouse_code);
//   fail-closed tokens SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED / DESTINATION_LOCATION_NOT_CONFIGURED /
//   DESTINATION_LOCATION_AMBIGUOUS / LEGAL_IMPORTER_AUTHORITY_GAP. Pure block eval'd; module source-guarded.
// Run: node assets/tests/party-authority-f1-5c-export-r2a.test.js
// NOTE: no 'use strict' — extracted pure helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var GS = read('specs/active/apps-script/33_party_authority_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');

// ---- eval the pure resolver block ----
eval(slice(GS, '// __PARTY_PURE_START__', '// __PARTY_PURE_END__'));

// fixture builders
function ent(o) { return { company_legal_entity_id: o.id || ('CLE-' + o.company), company: o.company,
  legal_name: o.legal || (o.company + ' Legal Co.'), display_name: o.display || '', country: o.country || 'US',
  address_line_1: o.addr || '1 Main St', city: o.city || 'Town', state_or_region: o.state || 'CA', postal_code: o.zip || '90001',
  tax_or_business_id: o.tax || '', is_active: o.active == null ? true : o.active,
  effective_from: o.from || '', effective_to: o.to || '' }; }
function loc(o) { return { logistics_location_id: o.id || ('LL-' + (o.wid || 'X')), warehouse_id: o.wid,
  location_name: o.name || ('Recipient ' + o.wid), local_name: o.local || '', location_type: o.type || 'FBA',
  address_line_1: o.addr || '10 Dock Rd', city: o.city || 'Port', subdivision_code: o.sub || 'NJ', region: o.region || '',
  postal_code: o.zip || '07001', country: o.country || 'US', is_active: o.active == null ? true : o.active,
  verification_status: o.vs || 'verified', effective_from: o.from || '', effective_to: o.to || '' }; }
function ship(o) { return { company: o.company, destination_warehouse_id: o.dwid, warehouse_id: o.wid, destination: o.dest || 'free text' }; }

var ENTITIES = [ent({ company: 'KM', legal: 'Kitchen Mama LLC', country: 'US' }),
  ent({ company: 'ResTW', legal: 'Res Taiwan Ltd', country: 'TW' }),
  ent({ company: 'ResUS', legal: 'Res US Inc', country: 'US' })];

console.log('\n== A/B/C shipment.company -> correct legal entity ==');
eq(partyResolveShipmentShipper_(ENTITIES, ship({ company: 'KM' }), null).shipper.legal_name, 'Kitchen Mama LLC', 'A KM shipment resolves KM legal entity');
eq(partyResolveShipmentShipper_(ENTITIES, ship({ company: 'ResTW' }), null).shipper.legal_name, 'Res Taiwan Ltd', 'B ResTW shipment resolves ResTW legal entity');
eq(partyResolveShipmentShipper_(ENTITIES, ship({ company: 'ResUS' }), null).shipper.legal_name, 'Res US Inc', 'C ResUS shipment resolves ResUS legal entity');
ok(partyResolveShipmentShipper_(ENTITIES, ship({ company: 'km' }), null).ok, 'company match is case-insensitive');

console.log('\n== §5 seller-of-record = shipment company legal entity (Phase 1) ==');
eq(partyResolveSellerOfRecord_(ENTITIES, ship({ company: 'KM' }), null).seller_of_record.legal_name,
   partyResolveShipmentShipper_(ENTITIES, ship({ company: 'KM' }), null).shipper.legal_name, '§5 seller-of-record identity == shipper identity');

console.log('\n== D shared factory does NOT change shipper (structural — resolver takes no factory input) ==');
// Two shipments from the SAME factory but different companies must resolve DIFFERENT shippers, purely from company.
var kmFromFacA = partyResolveShipmentShipper_(ENTITIES, ship({ company: 'KM' }), null).shipper.legal_name;
var twFromFacA = partyResolveShipmentShipper_(ENTITIES, ship({ company: 'ResTW' }), null).shipper.legal_name;
ok(kmFromFacA !== twFromFacA, 'D same-factory shipments for KM vs ResTW resolve different shippers (company-driven, not factory)');

console.log('\n== E missing legal entity -> fail closed ==');
eq(partyResolveShipmentShipper_(ENTITIES, ship({ company: 'ResJP' }), null).error, 'SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED', 'E unconfigured company -> SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED');
eq(partyResolveShipmentShipper_(ENTITIES, ship({ company: '' }), null).error, 'SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED', 'blank company -> SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED');
// ambiguity: two active KM entities
eq(partyResolveShipmentShipper_(ENTITIES.concat([ent({ company: 'KM', id: 'CLE-KM2', legal: 'KM Dup' })]), ship({ company: 'KM' }), null).error, 'SHIPPER_LEGAL_ENTITY_AMBIGUOUS', 'two active KM entities -> SHIPPER_LEGAL_ENTITY_AMBIGUOUS');
// inactive entity is ignored
ok(!partyResolveShipmentShipper_([ent({ company: 'KM', active: false })], ship({ company: 'KM' }), null).ok, 'inactive legal entity is not selected');

console.log('\n== §2 effective window ==');
var winEnt = [ent({ company: 'KM', from: '2026-01-01', to: '2026-12-31', legal: 'KM 2026' })];
ok(partyResolveShipmentShipper_(winEnt, ship({ company: 'KM' }), Date.parse('2026-06-01')).ok, 'in-window entity selected');
eq(partyResolveShipmentShipper_(winEnt, ship({ company: 'KM' }), Date.parse('2025-06-01')).error, 'SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED', 'before effective_from -> not configured');

console.log('\n== F destination warehouse -> exactly one logistics location -> address ==');
var LOCS = [loc({ wid: 'WH-KM-US-FBA-1', name: 'Amazon FTW1', addr: '33 Logistics Blvd', city: 'Fort Worth', sub: 'TX', zip: '76177' })];
var f = partyResolveConsignee_(LOCS, ship({ company: 'KM', dwid: 'WH-KM-US-FBA-1' }), null);
ok(f.ok, 'F destination resolves to one location');
eq(f.consignee.recipient_name, 'Amazon FTW1', 'F recipient name from location_name');
eq(f.consignee.state_or_region, 'TX', 'F state_or_region from subdivision_code');
eq(f.consignee.postal_code, '76177', 'F postal from location');

console.log('\n== G warehouse_code collision must NOT override warehouse_id identity ==');
var collide = [loc({ wid: 'WH-KM-US-FBA-1', name: 'Correct KM' }), loc({ wid: 'WH-RESUS-US-FBA-1', name: 'Wrong ResUS' })];
// both could share a similar warehouse_code, but resolver keys on warehouse_id only:
eq(partyResolveConsignee_(collide, ship({ company: 'KM', dwid: 'WH-KM-US-FBA-1' }), null).consignee.recipient_name, 'Correct KM', 'G identity is warehouse_id, not warehouse_code');

console.log('\n== H missing location / I ambiguous ==');
eq(partyResolveConsignee_(LOCS, ship({ company: 'KM', dwid: 'WH-KM-US-FBA-NONE' }), null).error, 'DESTINATION_LOCATION_NOT_CONFIGURED', 'H no matching active location -> DESTINATION_LOCATION_NOT_CONFIGURED');
eq(partyResolveConsignee_(LOCS, ship({ company: 'KM' }), null).error, 'DESTINATION_LOCATION_NOT_CONFIGURED', 'blank destination_warehouse_id -> DESTINATION_LOCATION_NOT_CONFIGURED');
var amb = [loc({ wid: 'WH-KM-US-FBA-1', id: 'LL-a' }), loc({ wid: 'WH-KM-US-FBA-1', id: 'LL-b' })];
eq(partyResolveConsignee_(amb, ship({ company: 'KM', dwid: 'WH-KM-US-FBA-1' }), null).error, 'DESTINATION_LOCATION_AMBIGUOUS', 'I two active locations -> DESTINATION_LOCATION_AMBIGUOUS');
// retired/inactive excluded so a single active survives
var oneActive = [loc({ wid: 'WH-KM-US-FBA-1', id: 'LL-live' }), loc({ wid: 'WH-KM-US-FBA-1', id: 'LL-old', vs: 'retired' }), loc({ wid: 'WH-KM-US-FBA-1', id: 'LL-x', active: false })];
eq(partyResolveConsignee_(oneActive, ship({ company: 'KM', dwid: 'WH-KM-US-FBA-1' }), null).consignee.logistics_location_id, 'LL-live', 'retired + inactive excluded -> single active resolves');

console.log('\n== J platform (FBA) destination uses the SAME resolver (no destination_type branch) ==');
var fba = partyResolveConsignee_([loc({ wid: 'WH-KM-US-FBA-9', type: 'FBA' })], ship({ company: 'KM', dwid: 'WH-KM-US-FBA-9' }), null);
var threePL = partyResolveConsignee_([loc({ wid: 'WH-KM-US-3PL-9', type: '3PL' })], ship({ company: 'KM', dwid: 'WH-KM-US-3PL-9' }), null);
ok(fba.ok && threePL.ok, 'J FBA and 3PL destinations both resolve through the one warehouse_id chain');
ok(!/destination_type|warehouse_type|location_type/.test(slice(GS, 'function partyResolveDestinationLocation_', '// Phase-1 CONSIGNEE')), 'J destination resolver does not branch on destination/warehouse/location type');

console.log('\n== K legal importer required but unsupported -> fail closed ==');
eq(partyResolveLegalImporter_(ship({ company: 'KM', dwid: 'WH-KM-US-FBA-1' })).error, 'LEGAL_IMPORTER_AUTHORITY_GAP', 'K separate legal importer -> LEGAL_IMPORTER_AUTHORITY_GAP');
eq(partyResolveConsignee_(LOCS, ship({ company: 'KM', dwid: 'WH-KM-US-FBA-1' }), null).legal_importer, null, 'K Phase-1 consignee never fabricates a legal importer (null)');

console.log('\n== L / §9 FACTORY IS NOT SHIPPER — source guards ==');
var shipperSrc = slice(GS, 'function partyResolveShipmentShipper_', 'function partyResolveSellerOfRecord_');
var entitySrc = slice(GS, 'function partyResolveCompanyLegalEntity_', '// SHIPPER / EXPORTER');
ok(!/factory|procurementResolveFactoryId_|warehouse|destination|marketplace|carrier|\bsku\b/i.test(shipperSrc), 'L shipper resolver references NO factory/warehouse/destination/marketplace/sku/carrier');
ok(/shipment\s*&&\s*shipment\.company|shipment\.company/.test(shipperSrc), 'shipper resolver keys on shipment.company only');
ok(!/factory|warehouse|destination|marketplace|carrier/i.test(entitySrc), 'company legal-entity resolver keys on company only (no location/factory)');

console.log('\n== §13 governance: sheet creation is USER-owned migration; runtime stays validate-only ==');
// strip comments the same way the production-safety INIT.4 invariant does, then assert no twin INVOCATION.
var codeOnly = GS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/prodMigrateCreateSheet_\s*\(|prodMigrateAppendColumns_\s*\(/.test(codeOnly), '§13 handler NEVER invokes a migration twin (matches production-safety INIT.4)');
ok(!/SpreadsheetApp\.(openById|getActive|create)/.test(codeOnly), '§13 handler does not open/create a spreadsheet itself (no runtime auto-create)');
ok(!/company_legal_entities/.test(ROUTER), '§13 router exposes NO party/company-entity action (authority closure is not runtime-reachable)');
ok(/prodRequireSheet_\(ss, 'company_legal_entities'/.test(GS), 'runtime read is validate-only (prodRequireSheet_) — fail closed until the USER creates + seeds the sheet');
ok(/prodRequireSheet_\(ss, 'logistics_locations', \[\]\)/.test(GS), 'logistics_locations read is validate-only existence (columns owned by the Map master)');

console.log('\n== §2 minimum legal-entity contract present in the new owner ==');
var H = slice(GS, 'var COMPANY_LEGAL_ENTITIES_HEADERS_', '// __PARTY_PURE_START__');
['company', 'legal_name', 'display_name', 'country', 'address_line_1', 'city', 'state_or_region', 'postal_code', 'tax_or_business_id', 'is_active', 'effective_from', 'effective_to'].forEach(function (c) {
  ok(new RegExp("'" + c + "'").test(H), 'company_legal_entities owns ' + c);
});

console.log('\n----------------------------------------');
console.log('PARTY AUTHORITY (F1-5C-EXPORT-R2A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
