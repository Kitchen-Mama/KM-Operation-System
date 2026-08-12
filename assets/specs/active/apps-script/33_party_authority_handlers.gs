/**
 * 33_party_authority_handlers.gs
 * Kitchen Mama Operation System — F1-5C-EXPORT-R2A Party / Legal-Entity Authority Closure.
 *
 * SOURCE MIRROR / requires Apps Script sync. Establishes the CANONICAL persisted owners + PURE resolvers for the
 * final-output party facts that R1 proved had no authority:
 *   - shipper / exporter / seller-of-record  = shipment.company -> company_legal_entities (NEW table, this round)
 *   - consignee / ship-to (Phase 1)          = shipments.destination_warehouse_id -> warehouses -> logistics_locations
 *   - legal importer / importer-of-record    = NO Phase-1 owner -> fail closed LEGAL_IMPORTER_AUTHORITY_GAP
 *
 * FROZEN Phase-1 party model (USER-approved, F1-5C-EXPORT-R2A §0):
 *   - Business company != factory. Factory is a SHARED physical source; it NEVER determines company / shipper /
 *     exporter / seller-of-record, and company NEVER determines factory. Shipper is resolved from shipment.company
 *     ONLY (never from factory / warehouse / destination / marketplace / sku / user / carrier).
 *   - Ship-to identity is warehouse_id (NEVER warehouse_code — that is display/reference only).
 *
 * This round builds AUTHORITY ONLY. It does NOT build the final-output snapshot, any document renderer, or Export
 * Center (those are R2B/R3). `partyResolveShipmentParties_` is the minimal interface contract R2B will consume; it
 * is intentionally NOT wired to any router action. Sheet creation is MIGRATION-ONLY (USER-run, §13 governance) via
 * the shared production-safety adapter (29_) — unreachable from the runtime router.
 */

// NEW canonical owner (verdict C — R1 proved no existing company/legal-entity master exists; `company` was only a
// scope token KM/ResTW/ResUS). Minimum Phase-1 legal-entity contract + effective window for future multi-entity.
var COMPANY_LEGAL_ENTITIES_HEADERS_ = [
  'company_legal_entity_id',   // PK  (CLE-…)
  'company',                   // resolver KEY — KM / ResTW / ResUS (maps to exactly one active legal entity)
  'legal_name', 'display_name', 'country',
  'address_line_1', 'address_line_2', 'city', 'state_or_region', 'postal_code',
  'tax_or_business_id', 'contact_name', 'contact_phone', 'contact_email',
  'is_active', 'effective_from', 'effective_to', 'note',
  'created_by', 'created_at', 'updated_by', 'updated_at'
];

// __PARTY_PURE_START__
// Pure, dependency-free resolvers (eval'd verbatim by the test harness). No sheet / clock / router access here.
function partyStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function partyLc_(v) { return partyStr_(v).toLowerCase(); }
function partyUc_(v) { return partyStr_(v).toUpperCase(); }
function partyBool_(v) {
  if (v === true) return true;
  var s = partyLc_(v);
  return s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'active';
}
function partyDateMs_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) { var t = v.getTime(); return isNaN(t) ? null : t; }
  var t2 = Date.parse(String(v)); return isNaN(t2) ? null : t2;
}
// Effective-window test: blank bounds are open. asOfMs null => no date filter (is_active only).
function partyInWindow_(row, asOfMs) {
  if (asOfMs === null || asOfMs === undefined) return true;
  var from = partyDateMs_(row.effective_from), to = partyDateMs_(row.effective_to);
  if (from !== null && asOfMs < from) return false;
  if (to !== null && asOfMs > to) return false;
  return true;
}
function partyEntityActive_(row, asOfMs) { return partyBool_(row.is_active) && partyInWindow_(row, asOfMs); }
// Logistics-location eligibility: active + in-window + verification not retired/rejected (blank/other = eligible).
function partyLocationEligible_(row, asOfMs) {
  if (!partyBool_(row.is_active)) return false;
  var vs = partyLc_(row.verification_status);
  if (vs === 'retired' || vs === 'rejected') return false;
  return partyInWindow_(row, asOfMs);
}

// COMPANY -> ONE active legal entity. Key = company ONLY. Deterministic: 0 => NOT_CONFIGURED, >1 => AMBIGUOUS.
function partyResolveCompanyLegalEntity_(entityRows, company, asOfMs) {
  var key = partyUc_(company);
  if (!key) return { ok: false, error: 'COMPANY_NOT_SPECIFIED' };
  var rows = (entityRows || []).filter(function (r) { return partyUc_(r.company) === key && partyEntityActive_(r, asOfMs); });
  if (rows.length === 0) return { ok: false, error: 'COMPANY_LEGAL_ENTITY_NOT_CONFIGURED' };
  if (rows.length > 1) return { ok: false, error: 'COMPANY_LEGAL_ENTITY_AMBIGUOUS', count: rows.length };
  var e = rows[0];
  return { ok: true, entity: {
    company_legal_entity_id: partyStr_(e.company_legal_entity_id),
    company: partyUc_(e.company),
    legal_name: partyStr_(e.legal_name),
    display_name: partyStr_(e.display_name) || partyStr_(e.legal_name),
    country: partyUc_(e.country),
    address_line_1: partyStr_(e.address_line_1), address_line_2: partyStr_(e.address_line_2),
    city: partyStr_(e.city), state_or_region: partyStr_(e.state_or_region), postal_code: partyStr_(e.postal_code),
    tax_or_business_id: partyStr_(e.tax_or_business_id),
    contact_name: partyStr_(e.contact_name), contact_phone: partyStr_(e.contact_phone), contact_email: partyStr_(e.contact_email)
  } };
}

// SHIPPER / EXPORTER = shipment.company legal entity. NO factory/warehouse/destination/marketplace/sku/carrier lookup.
function partyResolveShipmentShipper_(entityRows, shipment, asOfMs) {
  var company = partyStr_(shipment && shipment.company);
  var r = partyResolveCompanyLegalEntity_(entityRows, company, asOfMs);
  if (!r.ok) {
    return { ok: false, error: (r.error === 'COMPANY_LEGAL_ENTITY_AMBIGUOUS') ? 'SHIPPER_LEGAL_ENTITY_AMBIGUOUS' : 'SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED' };
  }
  return { ok: true, shipper: r.entity };
}

// SELLER OF RECORD = shipment company legal entity (Phase 1; identical authority to shipper — no separate table).
function partyResolveSellerOfRecord_(entityRows, shipment, asOfMs) {
  var r = partyResolveShipmentShipper_(entityRows, shipment, asOfMs);
  if (!r.ok) return { ok: false, error: (r.error === 'SHIPPER_LEGAL_ENTITY_AMBIGUOUS') ? 'SELLER_OF_RECORD_AMBIGUOUS' : 'SELLER_OF_RECORD_NOT_CONFIGURED' };
  return { ok: true, seller_of_record: r.shipper };
}

// DESTINATION LOCATION — identity = warehouse_id (NEVER warehouse_code). Deterministic single eligible row.
function partyResolveDestinationLocation_(locationRows, warehouseId, asOfMs) {
  var wid = partyUc_(warehouseId);
  if (!wid) return { ok: false, error: 'DESTINATION_LOCATION_NOT_CONFIGURED' };
  var rows = (locationRows || []).filter(function (r) { return partyUc_(r.warehouse_id) === wid && partyLocationEligible_(r, asOfMs); });
  if (rows.length === 0) return { ok: false, error: 'DESTINATION_LOCATION_NOT_CONFIGURED' };
  if (rows.length > 1) return { ok: false, error: 'DESTINATION_LOCATION_AMBIGUOUS', count: rows.length };
  var l = rows[0];
  return { ok: true, location: {
    logistics_location_id: partyStr_(l.logistics_location_id),
    warehouse_id: partyUc_(l.warehouse_id),
    recipient_name: partyStr_(l.location_name) || partyStr_(l.local_name),
    local_name: partyStr_(l.local_name),
    address_line_1: partyStr_(l.address_line_1), address_line_2: partyStr_(l.address_line_2),
    city: partyStr_(l.city), state_or_region: partyStr_(l.subdivision_code) || partyStr_(l.region),
    postal_code: partyStr_(l.postal_code), country: partyUc_(l.country),
    latitude: partyStr_(l.latitude), longitude: partyStr_(l.longitude), timezone: partyStr_(l.timezone)
  } };
}

// Phase-1 CONSIGNEE / SHIP-TO = destination logistics-location recipient. Uses destination_warehouse_id (legacy
// warehouse_id mirror as fallback). NEVER the free-text shipments.destination as legal identity. legal_importer is
// deliberately null — a separate legal importer is a different party (see partyResolveLegalImporter_).
function partyResolveConsignee_(locationRows, shipment, asOfMs) {
  var wid = partyStr_(shipment && (shipment.destination_warehouse_id || shipment.warehouse_id));
  var r = partyResolveDestinationLocation_(locationRows, wid, asOfMs);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, consignee: r.location, legal_importer: null };
}

// LEGAL IMPORTER / importer-of-record / tax consignee / customs declarant — NO canonical Phase-1 owner. Any document
// that explicitly requires this separate legal party FAILS CLOSED here; never fabricate an identity from the ship-to.
function partyResolveLegalImporter_(shipment) {
  return { ok: false, error: 'LEGAL_IMPORTER_AUTHORITY_GAP' };
}
// __PARTY_PURE_END__

// ---- Validate-only reads (fail closed; never create/repair) ----
function partyRowsAsObjects_(sheet) {
  var d = sheet.getDataRange().getValues();
  if (d.length < 2) return [];
  var h = d[0].map(function (x) { return String(x).trim(); });
  var out = [];
  for (var i = 1; i < d.length; i++) { var o = {}; for (var j = 0; j < h.length; j++) { o[h[j]] = d[i][j]; } out.push(o); }
  return out;
}
function partyReadCompanyLegalEntities_(ss) {
  var sheet = prodRequireSheet_(ss, 'company_legal_entities', COMPANY_LEGAL_ENTITIES_HEADERS_); // fail CLOSED if missing/invalid
  return partyRowsAsObjects_(sheet);
}
function partyReadLogisticsLocations_(ss) {
  var sheet = prodRequireSheet_(ss, 'logistics_locations', []); // validate-only existence; columns owned by the Map master
  return partyRowsAsObjects_(sheet);
}

// Minimal INTERFACE CONTRACT for the R2B final-output aggregator. Reads canonical masters + runs the pure resolvers.
// NOT routed and writes NOTHING — no snapshot here. asOfMs = the shipment's effective date (ms); null = active-only.
function partyResolveShipmentParties_(ss, shipment, asOfMs) {
  var entities = partyReadCompanyLegalEntities_(ss);
  var locations = partyReadLogisticsLocations_(ss);
  return {
    shipper: partyResolveShipmentShipper_(entities, shipment, asOfMs),
    seller_of_record: partyResolveSellerOfRecord_(entities, shipment, asOfMs),
    consignee: partyResolveConsignee_(locations, shipment, asOfMs)
  };
}

// SHEET CREATION IS USER-OWNED MIGRATION (§13 / RG-1). Per the frozen production-safety invariant, the migration
// twins (prodMigrateCreateSheet_ / prodMigrateAppendColumns_) must NEVER be invoked from a handler file — only the
// USER runs an authorized one-off migration. The exact snippet (build the KMSAFE authorization DTO with
// expectedNewHeaderHash = KMSAFE.headerHash(COMPANY_LEGAL_ENTITIES_HEADERS_) and call prodMigrateCreateSheet_) is
// provided in docs/planning/F1_5C_EXPORT_R2A_PARTY_AUTHORITY_CLOSURE.md and is pasted into the Apps Script editor
// once, then removed — it is intentionally NOT committed as runtime code. Runtime here stays validate-only
// (partyReadCompanyLegalEntities_ fails closed until the USER has created + seeded the sheet).
