/**
 * 34_shipment_final_output_handlers.gs
 * Kitchen Mama Operation System — F1-5C-EXPORT-R2B Canonical Final-Output Aggregator + Immutable Snapshot.
 *
 * SOURCE MIRROR / requires Apps Script sync. Builds ONE canonical, IMMUTABLE final-output snapshot for a DISPATCHED
 * shipment, from persisted canonical truth only. This is the single frozen data authority that later renderers
 * (Shipping Detail / Packing List / Commercial Invoice / Booking / Customs / Export Center — R3) consume. R2B builds
 * NO renderer and NO Export Center.
 *
 * Boundary (F1-5C-EXPORT-R2B §4/§26): finalization is a SEPARATE idempotent post-dispatch action — NOT inside the
 * R3B Confirm & Dispatch transaction (upstream execution is untouched, §28). It is BOUND to dispatch: it refuses to
 * finalize a shipment that is not dispatched (`shipments.status = in_transit`). A physical dispatch is NEVER rolled
 * back because a snapshot write fails — the shipment stays truthfully dispatched and finalization retries.
 *
 * Immutability (§5/§23): every document-significant party / SKU / customs / PO-number fact is FROZEN (copied) into
 * the snapshot at finalization. The read owner returns persisted rows and NEVER re-resolves masters — so later edits
 * to company/legal-entity, logistics_locations, sku_details, or tax_referral_rates cannot change historical output.
 *
 * Authorities (all reused, none recomputed): physical qty = shipment_lines.shipment_qty; multi-PO lineage = executed
 * shipment_line_allocations (R3A/R3B); shipper/seller = shipment.company -> company_legal_entities (R2A);
 * consignee = destination_warehouse_id -> logistics_locations (R2A); GS1 = sku_details.gs1_code/gs1_type;
 * HS/origin/declared = tax_referral_rates (series + duty_country + effective window, mirroring 17_ shippingDuty_ /
 * 19_ taxActiveOn_ — additionally surfacing hscode + declared_currency, existing columns; NO new customs formula).
 * Factory = procurementResolveFactoryId_ (warehouse_id -> factory_id; NEVER company). NO FIFO here (owner = R3A).
 *
 * Schema = 3 new tables (verdict C). Multi-PO lineage genuinely needs its own grain (shipment_line grain != PO
 * allocation grain), so a normalized child is required per §3 (no CSV / no JSON-pack). Names are new and do NOT
 * collide with the frozen document layer (generated_documents / document_templates / document_template_fields /
 * "Shipment Document Dataset"). Snapshot column names are data-model-based (independent of template placeholders —
 * document_template_fields owns that mapping, §20).
 */

var SFO_SNAPSHOT_HEADERS_ = [
  'snapshot_id', 'shipment_id', 'snapshot_version', 'status', 'superseded_by', 'superseded_reason',
  // status_at_finalization REMOVED (LEAN-R2 §5) — finalization is bound to the dispatch/in_transit boundary
  // (sfoIsDispatched_), so the shipment status at finalize is a fixed, derivable fact with no runtime/document/history
  // consumer. snapshot.status (final/superseded) is the snapshot lifecycle itself and is retained below.
  'shipment_no', 'reference_id', 'company', 'country', 'marketplace',
  'source_warehouse_id', 'destination_warehouse_id', 'destination_type', 'warehouse_code', 'ship_from', 'ship_to',
  'carrier_id', 'carrier_name', 'shipping_method', 'etd', 'eta', 'dispatch_date',
  'booking_no', 'container_no', 'invoice_no', 'currency',
  'shipper_legal_entity_id', 'shipper_company', 'shipper_legal_name', 'shipper_display_name', 'shipper_country',
  'shipper_address_line_1', 'shipper_address_line_2', 'shipper_city', 'shipper_state_or_region', 'shipper_postal_code', 'shipper_tax_or_business_id',
  'seller_of_record_legal_entity_id', 'seller_of_record_legal_name',
  'consignee_location_id', 'consignee_warehouse_id', 'consignee_name',
  'consignee_address_line_1', 'consignee_address_line_2', 'consignee_city', 'consignee_state_or_region', 'consignee_postal_code', 'consignee_country',
  'factory_id', 'factory_name',
  // F1-5C-FINAL-OUTPUT-SCHEMA-LEAN-R1: the 5 header totals (shipment_total_qty/cartons/gross/net/cbm) are DERIVABLE
  // (Σ over the frozen snapshot LINES) and are no longer persisted (§3/§11 — never store a pure aggregate). The
  // renderer (35_) computes them from shipment_final_output_lines; it never re-reads the live shipments totals.
  'shipping_detail_ready', 'packing_list_ready', 'commercial_invoice_ready', 'booking_ready', 'customs_ready', 'readiness_detail',
  'finalized_by', 'finalized_at', 'created_at', 'updated_at'
];

var SFO_LINE_HEADERS_ = [
  'snapshot_line_id', 'snapshot_id', 'shipment_id', 'shipment_line_id', 'sku', 'site_sku',
  'product_name_en', 'product_name_cn', 'shipment_qty', 'shipment_carton_qty', 'carton_no_start', 'carton_no_end', 'units_per_carton',
  'gross_weight', 'net_weight', 'cbm', 'carton_length', 'carton_width', 'carton_height',
  // declared_total_value REMOVED (F1-5C-FINAL-OUTPUT-SCHEMA-LEAN-R1 §5) — it is pure arithmetic
  // (declared_unit_value × shipment_qty, both frozen here); the renderer derives it. Frozen customs facts
  // (country_of_origin / hs_code / declared_currency / declared_unit_value) STAY: tax_referral_rates has no fully
  // immutable identity (correction mode mutates values in place), so the exact resolved values must remain frozen.
  // material / product_use REMOVED (LEAN-R2 §2) — descriptive SKU master attributes NOT rendered by any Phase-1
  // document (SHIPDETAIL / PL); their later mutation does not falsify an issued Phase-1 document. Relationship-
  // resolve from sku_details if a future customs/CI document needs them (see FINAL_OUTPUT_RELATIONSHIP_RESOLVED_
  // DISPLAY_AUDIT). The renderer-consumed display facts (product_name_en/cn, site_sku, gs1_code/type, carton dims)
  // are RETAINED frozen — removing them would force the snapshot-only renderer to re-read live masters (a redesign).
  'gs1_code', 'gs1_type', 'country_of_origin', 'hs_code', 'declared_currency', 'declared_unit_value',
  'note', 'created_at'
];

var SFO_LINE_PO_HEADERS_ = [
  'snapshot_line_po_id', 'snapshot_id', 'shipment_id', 'shipment_line_id', 'shipment_line_allocation_id',
  'purchase_order_line_id', 'purchase_order_id', 'po_no', 'allocated_qty', 'created_at'
];

// A shipment is eligible for final-output finalization once it has been DISPATCHED.
//
// F1-7N-FB-1B (E) - `shipped` ADDED. F1-7N-FB-1 corrected the lifecycle so Confirm Shipment ends at `shipped`
// (formal hand-over) and `in_transit` is reached later, only when a real non-origin Current Position event
// arrives. This list still said in_transit, so a correctly confirmed shipment was NOT snapshot-eligible and its
// documents could not be generated until the map happened to advance it - a regression, and the exact reason a
// confirmed shipment showed an empty Document Panel. The business meaning of this gate is "the dispatch
// transaction has COMMITTED, so executed allocations and lineage are final", and that is true at `shipped`.
//
// ready_to_ship is deliberately NOT here: before the dispatch transaction the PO allocations are still `draft`,
// so shipment_final_output_line_pos would have no executed lineage to freeze and sfoConservation_ could not
// balance. That is a real data prerequisite, not a policy choice, and it is why document generation for a
// shipment is a POST-dispatch step (F1-7N-FB-1B D/D2).
var SFO_DISPATCHED_STATUS_ = { shipped: 1, in_transit: 1, arrived: 1, received: 1, completed: 1, closed: 1 };
// The states that are explicitly NOT eligible, kept as an executable statement of intent rather than a comment.
var SFO_NOT_DISPATCHED_STATUS_ = { draft: 1, ready_to_ship: 1, cancelled: 1 };

// __SFO_PURE_START__
// Pure, dependency-free builders/validators (eval'd verbatim by the test harness). No sheet / clock / router.
function sfoStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function sfoLc_(v) { return sfoStr_(v).toLowerCase(); }
function sfoUc_(v) { return sfoStr_(v).toUpperCase(); }
function sfoNum_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = Number(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}
function sfoIsDispatched_(shipment) { return !!SFO_DISPATCHED_STATUS_[sfoLc_(shipment && shipment.status)]; }

// Conservation: per shipment line, SUM(executed allocated_qty) MUST equal shipment_lines.shipment_qty (physical
// authority). A finalized commercial snapshot must NEVER be built from inconsistent execution data (§12).
function sfoConservation_(shipmentLines, executedAllocs) {
  var byLine = {};
  (executedAllocs || []).forEach(function (a) {
    var k = sfoStr_(a.shipment_line_id);
    byLine[k] = (byLine[k] || 0) + sfoNum_(a.allocated_qty);
  });
  var mism = [];
  (shipmentLines || []).forEach(function (l) {
    var k = sfoStr_(l.shipment_line_id);
    var q = sfoNum_(l.shipment_qty), alloc = byLine[k] || 0;
    if (alloc !== q) mism.push({ shipment_line_id: k, shipment_qty: q, executed_allocated: alloc });
  });
  if (mism.length) return { ok: false, error: 'FINAL_OUTPUT_PO_ALLOCATION_QTY_MISMATCH', mismatches: mism };
  return { ok: true };
}

// Customs freeze — mirrors 17_ shippingDuty_/matchTax key (series + duty_country + effective window) and the
// 19_ taxActiveOn_ predicate; additionally surfaces hscode + declared_currency (existing columns shippingDuty_
// never read). NO new customs formula, no retail-price fallback, no destination-currency assumption, no global HS
// fallback. duty_country = shipment destination country. declared_value is per-unit.
function sfoResolveCustoms_(taxRows, series, dutyCountry, asOf) {
  var s = sfoLc_(series), dc = sfoLc_(dutyCountry), q = sfoStr_(asOf);
  var cand = (taxRows || []).filter(function (t) {
    if (!s || sfoLc_(t.series) !== s) return false;
    if (dc && sfoStr_(t.duty_country) && sfoLc_(t.duty_country) !== dc) return false;
    var from = sfoStr_(t.effective_from), to = sfoStr_(t.effective_to);
    if (from && q && from > q) return false;   // effective_from <= asOf
    if (to && q && to < q) return false;        // asOf <= effective_to (blank = open)
    return true;
  });
  cand.sort(function (a, b) { return sfoStr_(b.effective_from).localeCompare(sfoStr_(a.effective_from)); }); // latest wins
  var row = cand[0];
  if (!row) return { resolved: false, country_of_origin: '', hs_code: '', declared_currency: '', declared_unit_value: 0 };
  return {
    resolved: true,
    country_of_origin: sfoStr_(row.country_of_origin),
    hs_code: sfoStr_(row.hscode),
    declared_currency: sfoStr_(row.declared_currency),
    declared_unit_value: sfoNum_(row.declared_value)
  };
}

// One output LINE per shipment_line (shipment_line grain; physical qty from shipment_lines.shipment_qty ONLY —
// never PO ordered/completed/shipped, never recommended/request qty). Freezes SKU master + customs facts.
function sfoBuildLine_(line, master, siteSku, customs, lineId) {
  var m = master || {}, c = customs || {};
  var qty = sfoNum_(line.shipment_qty);
  var declaredUnit = sfoNum_(c.declared_unit_value);
  return {
    snapshot_line_id: sfoStr_(lineId),
    shipment_line_id: sfoStr_(line.shipment_line_id),
    sku: sfoStr_(line.sku),
    site_sku: sfoStr_(siteSku),
    product_name_en: sfoStr_(m.product_name),
    product_name_cn: sfoStr_(m.product_name_cn),
    shipment_qty: qty,
    shipment_carton_qty: sfoNum_(line.shipment_carton_qty),
    carton_no_start: sfoStr_(line.carton_no_start),
    carton_no_end: sfoStr_(line.carton_no_end),
    units_per_carton: sfoNum_(line.units_per_carton) || sfoNum_(m.units_per_carton),
    gross_weight: sfoNum_(line.gross_weight),
    net_weight: sfoNum_(line.net_weight),
    cbm: sfoNum_(line.shipment_carton_cbm),
    carton_length: sfoNum_(m.carton_length), carton_width: sfoNum_(m.carton_width), carton_height: sfoNum_(m.carton_height),
    gs1_code: sfoStr_(m.gs1_code), gs1_type: sfoStr_(m.gs1_type),
    country_of_origin: sfoUc_(c.country_of_origin),
    hs_code: sfoStr_(c.hs_code),
    declared_currency: sfoUc_(c.declared_currency),
    declared_unit_value: declaredUnit,   // declared_total_value (= declaredUnit × qty) is DERIVED by the renderer, not persisted (LEAN-R1 §5)
    // material / product_use NOT frozen (LEAN-R2 §2) — no Phase-1 document renders them; relationship-resolve later if needed.
    note: sfoStr_(line.note)
  };
}

// Multi-PO lineage: one row per EXECUTED allocation for the line (never collapsed; no FIFO/sort/latest/first).
// Freezes the resolved PO number (mutable master) + allocated_qty.
function sfoBuildLinePos_(shipmentLineId, executedAllocsForLine, poByLineId, mkId) {
  return (executedAllocsForLine || []).map(function (a) {
    var pol = sfoStr_(a.purchase_order_line_id);
    var po = (poByLineId && poByLineId[pol]) || {};
    return {
      snapshot_line_po_id: mkId(),
      shipment_line_id: sfoStr_(shipmentLineId),
      shipment_line_allocation_id: sfoStr_(a.shipment_line_allocation_id),
      purchase_order_line_id: pol,
      purchase_order_id: sfoStr_(po.purchase_order_id),
      po_no: sfoStr_(po.po_no),
      allocated_qty: sfoNum_(a.allocated_qty)
    };
  });
}

// Header business facts — freezes shipper/seller (R2A), consignee (R2A), factory (warehouse-resolved, NOT company),
// and carrier. shipper is driven ONLY by shipment.company (no factory/warehouse/destination input). Shipment totals
// are NOT frozen here (LEAN-R1 §3) — they are a pure Σ over the frozen snapshot lines, derived by the renderer.
function sfoBuildHeader_(shipment, shipper, seller, consignee, factory, carrier) {
  var sp = shipper || {}, sl = seller || {}, cg = consignee || {}, fc = factory || {}, cr = carrier || {};
  return {
    shipment_id: sfoStr_(shipment.shipment_id),
    shipment_no: sfoStr_(shipment.shipment_no),
    reference_id: sfoStr_(shipment.reference_id),
    company: sfoUc_(shipment.company),
    country: sfoUc_(shipment.country),
    marketplace: sfoStr_(shipment.marketplace),
    source_warehouse_id: sfoStr_(shipment.source_warehouse_id),
    destination_warehouse_id: sfoStr_(shipment.destination_warehouse_id || shipment.warehouse_id),
    destination_type: sfoStr_(shipment.destination_type),
    warehouse_code: sfoStr_(shipment.warehouse_code),
    ship_from: sfoStr_(shipment.ship_from),
    ship_to: sfoStr_(shipment.destination),
    carrier_id: sfoStr_(shipment.carrier_id),
    carrier_name: sfoStr_(cr.carrier_name),
    shipping_method: sfoStr_(shipment.shipping_method),
    etd: sfoStr_(shipment.etd), eta: sfoStr_(shipment.eta),
    dispatch_date: sfoStr_(shipment.actual_departure_date),
    booking_no: sfoStr_(shipment.booking_no), container_no: sfoStr_(shipment.container_no),
    invoice_no: sfoStr_(shipment.invoice_no), currency: sfoUc_(shipment.currency),
    // shipper / exporter (frozen legal entity)
    shipper_legal_entity_id: sfoStr_(sp.company_legal_entity_id),
    shipper_company: sfoUc_(sp.company),
    shipper_legal_name: sfoStr_(sp.legal_name),
    shipper_display_name: sfoStr_(sp.display_name),
    shipper_country: sfoUc_(sp.country),
    shipper_address_line_1: sfoStr_(sp.address_line_1), shipper_address_line_2: sfoStr_(sp.address_line_2),
    shipper_city: sfoStr_(sp.city), shipper_state_or_region: sfoStr_(sp.state_or_region), shipper_postal_code: sfoStr_(sp.postal_code),
    shipper_tax_or_business_id: sfoStr_(sp.tax_or_business_id),
    // seller of record (Phase 1 = shipper legal entity)
    seller_of_record_legal_entity_id: sfoStr_(sl.company_legal_entity_id),
    seller_of_record_legal_name: sfoStr_(sl.legal_name),
    // consignee / ship-to (frozen destination location)
    consignee_location_id: sfoStr_(cg.logistics_location_id),
    consignee_warehouse_id: sfoStr_(cg.warehouse_id),
    consignee_name: sfoStr_(cg.recipient_name),
    consignee_address_line_1: sfoStr_(cg.address_line_1), consignee_address_line_2: sfoStr_(cg.address_line_2),
    consignee_city: sfoStr_(cg.city), consignee_state_or_region: sfoStr_(cg.state_or_region),
    consignee_postal_code: sfoStr_(cg.postal_code), consignee_country: sfoUc_(cg.country),
    // factory (physical source; warehouse-resolved, never company)
    factory_id: sfoStr_(fc.factory_id), factory_name: sfoStr_(fc.factory_name)
  };
}

// LEAN-R1 §3: header totals are no longer persisted or built here. The document renderer (35_) computes the Σ over
// the frozen snapshot LINES on demand (physical authority) — never from live shipments, never re-multiplied.

// Per-document-family readiness. Missing legal importer blocks ONLY documents that require it (customs) — the base
// snapshot and Shipping Detail / Packing List still proceed (§15/§16). No hardcoding purely by document name:
// each family is gated on its required field groups.
function sfoDocumentReadiness_(h, lines) {
  var hasLines = !!(lines && lines.length);
  var hasShipper = !!(sfoStr_(h.shipper_legal_entity_id) || sfoStr_(h.shipper_legal_name));
  var hasConsignee = !!sfoStr_(h.consignee_location_id);
  var allDeclared = hasLines && lines.every(function (l) { return sfoStr_(l.declared_currency) && sfoNum_(l.declared_unit_value) > 0; });
  var hasCarrier = !!(sfoStr_(h.carrier_id) || sfoStr_(h.carrier_name)) && !!sfoStr_(h.shipping_method);
  function fam(ok, reason) { return ok ? { status: 'READY' } : { status: 'BLOCKED', reason: reason }; }
  return {
    shipping_detail: fam(hasLines && hasShipper && hasConsignee, 'MISSING_BASE_FACTS'),
    packing_list: fam(hasLines && hasConsignee, 'MISSING_CONSIGNEE_OR_LINES'),
    commercial_invoice: fam(hasLines && hasShipper && hasConsignee && allDeclared, 'MISSING_DECLARED_VALUE'),
    booking: fam(hasConsignee && hasCarrier, 'MISSING_CARRIER'),
    // Phase 1: customs requires a separate legal importer / importer-of-record with no canonical owner (R2A).
    customs: { status: 'BLOCKED', reason: 'LEGAL_IMPORTER_AUTHORITY_GAP' }
  };
}
// __SFO_PURE_END__

// ---- validate-only reads (fail closed; never create/repair) + index helpers ----
function sfoRowsAsObjects_(sheet) {
  var d = sheet.getDataRange().getValues();
  if (d.length < 2) return [];
  var h = d[0].map(function (x) { return String(x).trim(); });
  var out = [];
  for (var i = 1; i < d.length; i++) { var o = {}; for (var j = 0; j < h.length; j++) { o[h[j]] = d[i][j]; } out.push(o); }
  return out;
}
function sfoReadTable_(ss, name, headers) { return sfoRowsAsObjects_(prodRequireSheet_(ss, name, headers || [])); }

function sfoSkuMasterMap_(ss) {
  var rows = sfoReadTable_(ss, 'sku_details', []);
  var map = {};
  rows.forEach(function (r) {
    var sku = sfoStr_(r.sku); if (!sku) return;
    if (!map[sku]) map[sku] = {
      product_name: r.product_name, product_name_cn: r.product_name_cn, series: sfoStr_(r.series),
      gs1_code: r.gs1_code, gs1_type: r.gs1_type, units_per_carton: r.units_per_carton,
      carton_length: r.carton_length, carton_width: r.carton_width, carton_height: r.carton_height
      // material / product_use no longer loaded — not frozen into the snapshot (LEAN-R2 §2)
    };
  });
  return map;
}
function sfoCarrierNameMap_(ss) {
  var rows = sfoReadTable_(ss, 'carriers', []); var map = {};
  rows.forEach(function (r) { var id = sfoStr_(r.carrier_id); if (id) map[id] = { carrier_name: sfoStr_(r.carrier_name) }; });
  return map;
}
function sfoWarehouseNameMap_(ss) {
  var rows = sfoReadTable_(ss, 'warehouses', []); var map = {};
  rows.forEach(function (r) { var id = sfoUc_(r.warehouse_id); if (id) map[id] = { warehouse_name: sfoStr_(r.warehouse_name), warehouse_code: sfoStr_(r.warehouse_code) }; });
  return map;
}

// Executed allocations for a set of shipment_line_ids.
function sfoReadExecutedAllocations_(ss, lineIdSet) {
  var rows = sfoReadTable_(ss, 'shipment_line_allocations', []);
  return rows.filter(function (a) { return sfoLc_(a.allocation_status) === 'executed' && lineIdSet[sfoStr_(a.shipment_line_id)]; });
}

// The ONE backend aggregator (§17). Loads canonical truth, resolves reused authorities, validates conservation,
// and returns a deterministic snapshot DTO. Reads server-side (no browser fan-out). Persists nothing.
function sfoBuildSnapshot_(ss, shipmentId) {
  var sid = sfoStr_(shipmentId);
  if (!sid) return { ok: false, error: 'SHIPMENT_ID_REQUIRED' };
  var shipments = sfoReadTable_(ss, 'shipments', []);
  var shipment = null;
  for (var i = 0; i < shipments.length; i++) { if (sfoStr_(shipments[i].shipment_id) === sid) { shipment = shipments[i]; break; } }
  if (!shipment) return { ok: false, error: 'SHIPMENT_NOT_FOUND' };
  if (!sfoIsDispatched_(shipment)) return { ok: false, error: 'SHIPMENT_NOT_DISPATCHED', status: sfoLc_(shipment.status) };

  var allLines = sfoReadTable_(ss, 'shipment_lines', []);
  var lines = allLines.filter(function (l) { return sfoStr_(l.shipment_id) === sid; });
  if (!lines.length) return { ok: false, error: 'SHIPMENT_HAS_NO_LINES' };
  var lineIdSet = {}; lines.forEach(function (l) { lineIdSet[sfoStr_(l.shipment_line_id)] = 1; });

  var executed = sfoReadExecutedAllocations_(ss, lineIdSet);
  var cons = sfoConservation_(lines, executed);
  if (!cons.ok) return { ok: false, error: cons.error, mismatches: cons.mismatches };

  // PO lineage index (reuse R3A join): purchase_order_line_id -> { purchase_order_id, po_no, ... }
  var poJoined = slaLoadPoLinesJoined_(ss);
  var poByLineId = {};
  poJoined.forEach(function (p) { poByLineId[sfoStr_(p.purchase_order_line_id)] = p; });

  // Party authority (R2A) — asOf = dispatch date (falls back to null = active-only).
  var asOf = sfoStr_(shipment.actual_departure_date) || null;
  var asOfMs = asOf ? Date.parse(asOf) : null; if (asOf && isNaN(asOfMs)) asOfMs = null;
  var entities = partyReadCompanyLegalEntities_(ss);
  var locations = partyReadLogisticsLocations_(ss);
  var shipperR = partyResolveShipmentShipper_(entities, shipment, asOfMs);
  if (!shipperR.ok) return { ok: false, error: shipperR.error, stage: 'shipper' };
  var sellerR = partyResolveSellerOfRecord_(entities, shipment, asOfMs);
  var consigneeR = partyResolveConsignee_(locations, shipment, asOfMs);
  if (!consigneeR.ok) return { ok: false, error: consigneeR.error, stage: 'consignee' };

  var factoryId = procurementResolveFactoryId_(ss, sfoStr_(shipment.source_warehouse_id), '');
  var whNames = sfoWarehouseNameMap_(ss);
  var factory = { factory_id: factoryId, factory_name: (whNames[sfoUc_(shipment.source_warehouse_id)] || {}).warehouse_name || '' };
  var carrier = sfoCarrierNameMap_(ss)[sfoStr_(shipment.carrier_id)] || {};

  var master = sfoSkuMasterMap_(ss);
  var taxRows = sfoReadTable_(ss, 'tax_referral_rates', []);
  var dutyCountry = sfoStr_(shipment.country);

  var outLines = [], outPos = [];
  lines.forEach(function (l, idx) {
    var sku = sfoStr_(l.sku);
    var m = master[sku] || {};
    var series = sfoStr_(m.series);
    var site = ''; try { var rl = skuRegionalLookup_(ss, sku, sfoStr_(shipment.company), sfoStr_(shipment.country), sfoStr_(shipment.marketplace)); if (rl && rl.siteSku) site = rl.siteSku; } catch (e) {}
    if (!site) { var mm = procurementMarketplaceSkuMap_(ss)[sku + '|' + sfoStr_(shipment.company) + '|' + sfoStr_(shipment.country) + '|' + sfoStr_(shipment.marketplace)]; if (mm && mm.site_sku) site = mm.site_sku; }
    var customs = sfoResolveCustoms_(taxRows, series, dutyCountry, asOf);
    var lineId = 'SFOL-' + Utilities.getUuid().substring(0, 12).toUpperCase();
    outLines.push(sfoBuildLine_(l, m, site, customs, lineId));
    var execForLine = executed.filter(function (a) { return sfoStr_(a.shipment_line_id) === sfoStr_(l.shipment_line_id); });
    var pos = sfoBuildLinePos_(sfoStr_(l.shipment_line_id), execForLine, poByLineId, function () { return 'SFOP-' + Utilities.getUuid().substring(0, 12).toUpperCase(); });
    outPos = outPos.concat(pos);
  });

  var header = sfoBuildHeader_(shipment, shipperR.shipper, sellerR.seller_of_record, consigneeR.consignee, factory, carrier);
  var readiness = sfoDocumentReadiness_(header, outLines);
  return { ok: true, header: header, lines: outLines, line_pos: outPos, readiness: readiness };
}

function sfoDeleteRowsFor_(sheet, colName, value) {
  var d = sheet.getDataRange().getValues(); if (d.length < 2) return;
  var h = d[0].map(function (x) { return String(x).trim(); });
  var c = h.indexOf(colName); if (c === -1) return;
  var target = sfoStr_(value);
  for (var r = d.length - 1; r >= 1; r--) { if (sfoStr_(d[r][c]) === target) sheet.deleteRow(r + 1); }
}

// Idempotent post-dispatch finalization (§18): deterministic identity SFO-<shipment_id>, one active snapshot per
// shipment. ScriptLock + re-read inside lock. Re-run converges to the same snapshot (retry / two-tab / lost-response
// safe). NEVER touches the shipment/PO/allocation/factory execution state.
function handleFinalizeShipmentFinalOutput_(body) {
  var shipmentId = sfoStr_(body && body.shipment_id);
  var actor = sfoStr_(body && body.actor) || 'system';
  if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });

  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
  try {
    var ss = SpreadsheetApp.openById(prodExpectedDbId_());
    var snapId = 'SFO-' + shipmentId;
    var headSheet = prodRequireSheet_(ss, 'shipment_final_output_snapshots', SFO_SNAPSHOT_HEADERS_);

    // idempotency: existing active snapshot for this shipment -> reuse (no duplicate)
    var existing = sfoRowsAsObjects_(headSheet).filter(function (r) { return sfoStr_(r.shipment_id) === shipmentId && sfoLc_(r.status) !== 'superseded'; });
    if (existing.length) {
      return jsonResponse_({ success: true, already_finalized: true, snapshot_id: sfoStr_(existing[0].snapshot_id), shipment_id: shipmentId, note: 'Final-output snapshot already finalized (idempotent).' });
    }

    var built = sfoBuildSnapshot_(ss, shipmentId);
    if (!built.ok) return jsonResponse_({ success: false, error: built.error, detail: built, shipment_id: shipmentId, stage: 'aggregate' });

    var now = shipmentTimestamp_();
    var lineSheet = prodRequireSheet_(ss, 'shipment_final_output_lines', SFO_LINE_HEADERS_);
    var poSheet = prodRequireSheet_(ss, 'shipment_final_output_line_pos', SFO_LINE_PO_HEADERS_);
    // clean any orphan rows from a prior partial run (deterministic identity → safe replace)
    sfoDeleteRowsFor_(lineSheet, 'shipment_id', shipmentId);
    sfoDeleteRowsFor_(poSheet, 'shipment_id', shipmentId);

    var readiness = built.readiness;
    var headerRow = {};
    SFO_SNAPSHOT_HEADERS_.forEach(function (k) { if (built.header.hasOwnProperty(k)) headerRow[k] = built.header[k]; });
    headerRow.snapshot_id = snapId;
    headerRow.shipment_id = shipmentId;
    headerRow.snapshot_version = 1;
    headerRow.status = 'final';
    headerRow.shipping_detail_ready = readiness.shipping_detail.status;
    headerRow.packing_list_ready = readiness.packing_list.status;
    headerRow.commercial_invoice_ready = readiness.commercial_invoice.status;
    headerRow.booking_ready = readiness.booking.status;
    headerRow.customs_ready = readiness.customs.status;
    headerRow.readiness_detail = JSON.stringify(readiness);
    headerRow.finalized_by = actor; headerRow.finalized_at = now; headerRow.created_at = now; headerRow.updated_at = now;
    sfoAppendByHeader_(headSheet, headerRow);

    built.lines.forEach(function (l) { l.snapshot_id = snapId; l.shipment_id = shipmentId; l.created_at = now; sfoAppendByHeader_(lineSheet, l); });
    built.line_pos.forEach(function (p) { p.snapshot_id = snapId; p.shipment_id = shipmentId; p.created_at = now; sfoAppendByHeader_(poSheet, p); });

    return jsonResponse_({ success: true, finalized: true, snapshot_id: snapId, shipment_id: shipmentId,
      lines: built.lines.length, po_allocations: built.line_pos.length, readiness: readiness });
  } catch (err) {
    return jsonResponse_({ success: false, error: 'FINAL_OUTPUT_FINALIZATION_FAILED: ' + (err && err.message ? err.message : err), shipment_id: shipmentId, note: 'Shipment remains truthfully dispatched; retry can materialize the snapshot.' });
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

function sfoAppendByHeader_(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = new Array(headers.length).fill('');
  for (var i = 0; i < headers.length; i++) { if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) row[i] = obj[headers[i]]; }
  sheet.appendRow(row);
}

// The ONE read owner (§24). Returns the persisted, FROZEN snapshot — header + lines + PO lineage + readiness +
// meta — in a single call. It NEVER re-resolves masters (immutability): later master edits cannot change output.
function handleGetShipmentFinalOutput_(body) {
  var shipmentId = sfoStr_(body && body.shipment_id);
  if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var heads = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_snapshots', SFO_SNAPSHOT_HEADERS_))
    .filter(function (r) { return sfoStr_(r.shipment_id) === shipmentId && sfoLc_(r.status) !== 'superseded'; });
  if (!heads.length) return jsonResponse_({ success: true, finalized: false, shipment_id: shipmentId, note: 'No finalized final-output snapshot for this shipment.' });
  var header = heads[0];
  var snapId = sfoStr_(header.snapshot_id);
  var lines = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_lines', SFO_LINE_HEADERS_)).filter(function (r) { return sfoStr_(r.snapshot_id) === snapId; });
  var pos = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_line_pos', SFO_LINE_PO_HEADERS_)).filter(function (r) { return sfoStr_(r.snapshot_id) === snapId; });
  var readiness = {}; try { readiness = JSON.parse(header.readiness_detail || '{}'); } catch (e) {}
  return jsonResponse_({ success: true, finalized: true, snapshot_id: snapId, header: header, lines: lines, po_lineage: pos, readiness: readiness });
}
