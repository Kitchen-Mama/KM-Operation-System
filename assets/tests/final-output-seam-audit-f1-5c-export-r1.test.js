// F1-5C-EXPORT-R1 — Final-output / Shipping-Detail / Export canonical-seam AUDIT guards (source-scan only).
// This round is audit-first: NO output runtime is built. These guards LOCK the audited authorities so a later
// R2 (which builds the final-output snapshot + document renderers) cannot silently drift off them, and prove the
// two HALT findings (no output-snapshot/document engine exists yet; company/shipper/consignee has no owner) are
// real as of this commit. Every assertion is a static source/header scan — no live globe / fetch / Apps Script.
// Run: node assets/tests/final-output-seam-audit-f1-5c-export-r1.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function gs(name) { return read('specs/active/apps-script/' + name); }
var AS_DIR = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
function allGs() { return fs.readdirSync(AS_DIR).filter(function (f) { return /\.gs$/.test(f); }); }

var SHIP = gs('12_shipment_handlers.gs');
var ALLOC = gs('32_shipment_line_allocation_handlers.gs');
var POH = gs('13_procurement_handlers.gs');
var SKU = gs('03_master_data_handlers.gs');
var TAX = gs('19_tax_handlers.gs');
var ROUTER = gs('01_router.gs');
var PLAN = gs('11_shipping_plan_handlers.gs');

function headerBlock(src, constName) {
  var i = src.indexOf('var ' + constName);
  if (i < 0) throw new Error('const not found: ' + constName);
  var j = src.indexOf('];', i);
  return src.slice(i, j + 2);
}
var SHIP_LINES_H = headerBlock(SHIP, 'SHIPMENT_LINES_HEADERS_');
var SHIP_H = headerBlock(SHIP, 'SHIPMENTS_HEADERS_');
var ALLOC_H = headerBlock(ALLOC, 'SHIPMENT_LINE_ALLOCATIONS_HEADERS_');
var POL_H = headerBlock(POH, 'PURCHASE_ORDER_LINES_HEADERS_');
var SKU_UPSERT = headerBlock(SKU, 'SKU_DETAILS_UPSERT_FIELDS_');
var TAX_H = headerBlock(TAX, 'TAX_REFERRAL_RATES_HEADERS_');

console.log('\n== §A / §7 physical shipment qty owner = shipment_lines.shipment_qty ==');
ok(/'shipment_qty'/.test(SHIP_LINES_H), '§A shipment_lines owns shipment_qty (physical shipment truth)');
ok(!/'declared_value'|'hscode'|'gs1_code'|'country_of_origin'/.test(SHIP_LINES_H), '§7 shipment_lines does NOT carry customs/commercial fields (not the customs authority)');
ok(!/'declared_value'|'hscode'|'gs1_code'/.test(SHIP_H), '§7 shipments header does NOT carry HS/declared/barcode (customs authority lives elsewhere)');

console.log('\n== §B / §6 multi-PO lineage owner = shipment_line_allocations (14-col) ==');
var allocCols = (ALLOC_H.match(/'[a-z_]+'/g) || []);
ok(allocCols.length === 14, 'shipment_line_allocations is exactly 14 columns (live schema), got ' + allocCols.length);
ok(/'purchase_order_line_id'/.test(ALLOC_H), '§B allocations carries purchase_order_line_id (Shipment Line -> N PO Lines lineage)');
ok(/'allocated_qty'/.test(ALLOC_H) && /'allocation_status'/.test(ALLOC_H), '§B allocations carries allocated_qty + allocation_status (executed = PO-consumption authority)');
ok(/'sku'/.test(ALLOC_H), '§B allocations carries sku (denormalized readback for output join)');

console.log('\n== §7 PO ordered/completed are NOT the physical shipment qty (distinct owners) ==');
ok(/'ordered_qty'/.test(POL_H) && /'completed_qty'/.test(POL_H) && /'shipped_qty'/.test(POL_H) && /'remaining_qty'/.test(POL_H), 'purchase_order_lines owns ordered/completed/shipped/remaining (PO ledger, not shipment physical qty)');

console.log('\n== §4 / §G barcode (real UPC) authority = sku_details.gs1_code/gs1_type (single owner) ==');
ok(/'gs1_code'/.test(SKU_UPSERT) && /'gs1_type'/.test(SKU_UPSERT), '§G sku_details owns gs1_code + gs1_type (canonical barcode)');
ok(/'units_per_carton'/.test(SKU_UPSERT), 'sku_details owns units_per_carton (the overloaded "UPC" = units/carton, distinct from barcode)');
ok(!/'gs1_code'/.test(SHIP_LINES_H) && !/'gs1_code'/.test(SHIP_H), '§G barcode has ONE owner — not duplicated onto shipment schema');
ok(/'item_length'/.test(SKU_UPSERT) && /'carton_weight'/.test(SKU_UPSERT) && /'product_name'/.test(SKU_UPSERT), 'sku_details owns dimensions / weights / product name (physical/logistics master)');

console.log('\n== §15 / §H HS code + §14 / §I declared value/currency authority = tax_referral_rates ==');
ok(/'hscode'/.test(TAX_H), '§H HS code owner = tax_referral_rates.hscode');
ok(/'country_of_origin'/.test(TAX_H) && /'duty_country'/.test(TAX_H), '§16 country-specific HS is deterministic (series + country_of_origin + duty_country key)');
ok(/'declared_value'/.test(TAX_H) && /'declared_currency'/.test(TAX_H), '§I declared value + currency owner = tax_referral_rates (returned values, not lookup keys)');
ok(!/'hscode'|'declared_value'/.test(SKU_UPSERT), '§4 sku_details does NOT own HS/declared (customs authority is separate — no split-brain)');

console.log('\n== §16 / §J existing snapshot = shipping_plan_lines.snapshot_* (PLANNING, upstream) ==');
ok(/snapshot_current_stock/.test(PLAN), '§J planning snapshot lives on shipping_plan_lines.snapshot_* (SKU Shipping Details display source)');
ok(/snapshot_current_stock/.test(SHIP), 'execution snapshot copied onto shipment_lines (verbatim, never recalculated)');

console.log('\n== §K / §16-D binary file-renderer is confined to ONE sanctioned owner (R3C 37_) — no second engine ==');
// Evolution: R2B (34_) DATA snapshot; R3A (35_) presentation model; R3B (36_) persisted template/generated-document
// runtime; R3C (37_) the ONE binary file renderer. The raw Drive/PDF primitives (DriveApp/getAs/makeCopy/createFile)
// must live ONLY in 37_shipment_document_file_renderer.gs — never a second file engine elsewhere. Comments stripped.
var docEngineHits = [];
allGs().forEach(function (f) {
  if (f === '37_shipment_document_file_renderer.gs') return;   // the sanctioned R3C renderer
  var code = gs(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  if (/DriveApp|DocumentApp|exportPdf|\.getAs\(|renderTemplate|createFile\(|makeCopy\(/i.test(code)) docEngineHits.push(f);
});
ok(docEngineHits.length === 0, '§K binary file-renderer confined to 37_ only (no second file engine); hits=' + docEngineHits.join(','));
ok(!/'generateDocument'|'exportDocument'|'exportShippingDetail'|'generatePackingList'|'generateCommercialInvoice'/.test(ROUTER), '§12 router exposes NO document RENDERER/export action (Export Center absent)');

console.log('\n== §13 / §16-C party-authority owner (R1 gap CLOSED by R2A — exactly ONE owner) ==');
// R1 verdict C proved this authority had NO owner. F1-5C-EXPORT-R2A closed it in 33_party_authority_handlers.gs.
// This sentinel now guards the OTHER direction: the party authority must be DEFINED in exactly ONE canonical owner
// — never zero (regression) and never a second competing owner. Consumers (e.g. R2B's 34_ aggregator) call the
// resolver but must NOT redefine it, so match the DEFINITION (function/header-const), not call-sites.
var entityHits = [];
allGs().forEach(function (f) {
  var src = gs(f);
  if (/function partyResolveShipmentShipper_|var COMPANY_LEGAL_ENTITIES_HEADERS_/.test(src)) entityHits.push(f);
});
ok(entityHits.length === 1 && entityHits[0] === '33_party_authority_handlers.gs', '§13 party authority DEFINED in exactly ONE canonical owner = 33_ (R2A); consumers may reference it; hits=' + entityHits.join(','));

console.log('\n== §F factory is resolved from warehouse, never inferred from company (shared-factory rule) ==');
ok(/procurementResolveFactoryId_/.test(ALLOC) || /procurementResolveFactoryId_/.test(POH), '§F factory resolved via procurementResolveFactoryId_(warehouse) — not derived from company');
ok(!/'factory_id'/.test(SHIP_H), 'shipments header has no factory_id — origin is source_warehouse_id/ship_from (factory resolved, not stored on shipment)');

console.log('\n----------------------------------------');
console.log('FINAL-OUTPUT SEAM AUDIT (F1-5C-EXPORT-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
