/**
 * 35_shipment_document_renderer.gs
 * Kitchen Mama Operation System — F1-5C-EXPORT-R3A Final-Output Snapshot → Shipping Detail / Packing List renderer.
 *
 * SOURCE MIRROR / requires Apps Script sync. The FIRST document-output layer. It is PRESENTATION ONLY: it consumes
 * the frozen R2B Final Output Snapshot (shipment_final_output_snapshots / _lines / _line_pos) and produces a canonical
 * document MODEL (header block + line rows + PO lineage + totals) for Shipping Detail (SHIPDETAIL) and Packing List
 * (PL). It NEVER reads live shipment/master/PO tables, never recomputes a business fact, never runs FIFO/gap/forecast,
 * never re-resolves shipper/consignee/GS1/HS/factory. Immutable: master edits after finalization cannot change output
 * because the renderer's only input is the persisted snapshot.
 *
 * PARTIAL HALT (F1-5C-EXPORT-R3A §9/§14): the PERSISTED document layer is spec-only — no runtime tables/owner for
 * document_templates / document_template_fields / generated_documents. Therefore R3A does NOT persist a generated
 * document, does NOT implement placeholder mapping, and does NOT version/store output. The renderer emits a neutral
 * canonical model keyed by data-model field names (NOT template placeholders); the placeholder mapping + file record
 * are the reported gaps GENERATED_DOCUMENT_RUNTIME_SCHEMA_GAP / DOCUMENT_TEMPLATE_RUNTIME_SCHEMA_GAP /
 * DOCUMENT_TEMPLATE_FIELD_MAPPING_GAP (see docs/planning/F1_5C_EXPORT_R3A_*.md), left for R3B. No second aggregator,
 * no second template engine, no live-master shortcut.
 *
 * Readiness (R2B, §11): SHIPDETAIL renders only when the snapshot's shipping_detail readiness is READY; PL only when
 * packing_list is READY; CI only when commercial_invoice is READY. Blocked → fail closed with the exact reason; a
 * required frozen field that is blank → FINAL_OUTPUT_REQUIRED_FIELD_GAP.
 *
 * F1-7N-FB-1B §I —  DESTINATION CUSTOMS DOCUMENTS ARE NOT A LEGAL IMPORTER CLAIM. The snapshot's `customs` family is
 * permanently BLOCKED by LEGAL_IMPORTER_AUTHORITY_GAP, and that gate is CORRECT for any workflow that asserts who the
 * legal Importer of Record is (customs admission, duty/tax liability, receiving authority). It is NOT correct for the
 * outbound paperwork Kitchen Mama itself prepares for the destination side. COMMERCIAL_INVOICE_IMPORT_* and
 * PACKING_LIST_IMPORT_* are destination customs DOCUMENT ARTIFACTS produced from the finalized OUTBOUND shipment
 * snapshot: they grant no import authority, change no customs/tax responsibility, authorize no receiving and prove no
 * importer identity. They are therefore gated by their own document family (commercial_invoice / packing_list) exactly
 * like their export twins — never by `customs`. The legal gate is preserved untouched for the workflows it governs.
 */

// __DOC_PURE_START__
// Pure presentation helpers/renderers (eval'd verbatim by the test harness). No sheet / clock / router / master.
function docStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function docLc_(v) { return docStr_(v).toLowerCase(); }
function docUc_(v) { return docStr_(v).toUpperCase(); }
function docNum_(v) { if (v === null || v === undefined || v === '') return 0; var n = Number(String(v).replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; }
function docAddr_(p, pre) {
  return {
    line1: docStr_(p[pre + 'address_line_1']), line2: docStr_(p[pre + 'address_line_2']),
    city: docStr_(p[pre + 'city']), state_or_region: docStr_(p[pre + 'state_or_region']),
    postal_code: docStr_(p[pre + 'postal_code']), country: docUc_(p[pre + 'country'])
  };
}
// first blank required field name, or null
function docRequire_(obj, fields) {
  for (var i = 0; i < fields.length; i++) { if (!docStr_(obj[fields[i]])) return fields[i]; }
  return null;
}
// PO lineage rows for a shipment line — frozen from shipment_final_output_line_pos (multi-PO preserved, not collapsed).
function docLinePos_(shipmentLineId, poLineage) {
  return (poLineage || []).filter(function (p) { return docStr_(p.shipment_line_id) === docStr_(shipmentLineId); })
    .map(function (p) { return { po_no: docStr_(p.po_no), allocated_qty: docNum_(p.allocated_qty), purchase_order_line_id: docStr_(p.purchase_order_line_id), purchase_order_id: docStr_(p.purchase_order_id) }; });
}
function docDistinctPoNos_(poLineage) {
  var seen = {}, out = [];
  (poLineage || []).forEach(function (p) { var n = docStr_(p.po_no); if (n && !seen[n]) { seen[n] = 1; out.push(n); } });
  return out;
}
// readiness family gate: prefer the parsed readiness object; fall back to the persisted per-family column.
function docFamilyStatus_(snap, family, headerCol) {
  var r = snap.readiness && snap.readiness[family];
  if (r && r.status) return { status: docUc_(r.status), reason: docStr_(r.reason) };
  return { status: docUc_(snap.header[headerCol]) || 'BLOCKED', reason: '' };
}

// Totals are DERIVED here (LEAN-R1 §3) as a pure Σ over the FROZEN snapshot lines — never persisted, never read from
// the live shipments totals, never re-multiplied by cartons. Deterministic and immutable (input is snapshot-only).
function docTotals_(lines) {
  var t = { qty: 0, cartons: 0, gross_weight: 0, net_weight: 0, cbm: 0 };
  (lines || []).forEach(function (l) {
    t.qty += docNum_(l.shipment_qty); t.cartons += docNum_(l.shipment_carton_qty);
    t.gross_weight += docNum_(l.gross_weight); t.net_weight += docNum_(l.net_weight); t.cbm += docNum_(l.cbm);
  });
  return t;
}

// Shared header block (identity + shipper + seller + consignee + carrier + factory + totals + PO numbers) — party/
// carrier/factory values are FROZEN snapshot fields (no lookup); totals are derived from the frozen lines (§3).
function docHeaderBlock_(h, lines, poLineage) {
  return {
    shipment_id: docStr_(h.shipment_id), shipment_no: docStr_(h.shipment_no), reference_id: docStr_(h.reference_id),
    dispatch_date: docStr_(h.dispatch_date), etd: docStr_(h.etd), eta: docStr_(h.eta),
    company: docUc_(h.company), country: docUc_(h.country), marketplace: docStr_(h.marketplace),
    shipper: { legal_name: docStr_(h.shipper_legal_name), display_name: docStr_(h.shipper_display_name), country: docUc_(h.shipper_country), tax_or_business_id: docStr_(h.shipper_tax_or_business_id), address: docAddr_(h, 'shipper_') },
    seller_of_record: { legal_name: docStr_(h.seller_of_record_legal_name) },
    consignee: { name: docStr_(h.consignee_name), warehouse_id: docStr_(h.consignee_warehouse_id), location_id: docStr_(h.consignee_location_id), address: docAddr_(h, 'consignee_') },
    carrier_name: docStr_(h.carrier_name), shipping_method: docStr_(h.shipping_method),
    factory: { id: docStr_(h.factory_id), name: docStr_(h.factory_name) },
    po_numbers: docDistinctPoNos_(poLineage),
    totals: docTotals_(lines)
  };
}

// SHIPPING DETAIL — commercial + logistics view. Physical qty = snapshot shipment_qty ONLY.
function docRenderShippingDetail_(snap) {
  var gate = docFamilyStatus_(snap, 'shipping_detail', 'shipping_detail_ready');
  if (gate.status !== 'READY') return { ok: false, blocked: true, document_type: 'SHIPDETAIL', reason: gate.reason || 'NOT_READY' };
  var h = snap.header;
  var miss = docRequire_(h, ['shipment_id', 'shipper_legal_name', 'consignee_name']);
  if (miss || !(snap.lines && snap.lines.length)) return { ok: false, error: 'FINAL_OUTPUT_REQUIRED_FIELD_GAP', document_type: 'SHIPDETAIL', missing: miss || 'lines' };
  var lines = snap.lines.map(function (l) {
    return {
      sku: docStr_(l.sku), site_sku: docStr_(l.site_sku),
      product_name_en: docStr_(l.product_name_en), product_name_cn: docStr_(l.product_name_cn),
      shipment_qty: docNum_(l.shipment_qty),
      units_per_carton: docNum_(l.units_per_carton), carton_qty: docNum_(l.shipment_carton_qty),
      carton_no_start: docStr_(l.carton_no_start), carton_no_end: docStr_(l.carton_no_end),
      gs1_code: docStr_(l.gs1_code), gs1_type: docStr_(l.gs1_type),
      country_of_origin: docUc_(l.country_of_origin), hs_code: docStr_(l.hs_code),
      // declared_total_value DERIVED (LEAN-R1 §5): unit × physical qty — both frozen; never persisted as a duplicate.
      declared_currency: docUc_(l.declared_currency), declared_unit_value: docNum_(l.declared_unit_value), declared_total_value: docNum_(l.declared_unit_value) * docNum_(l.shipment_qty),
      gross_weight: docNum_(l.gross_weight), net_weight: docNum_(l.net_weight), cbm: docNum_(l.cbm),
      carton_length: docNum_(l.carton_length), carton_width: docNum_(l.carton_width), carton_height: docNum_(l.carton_height),
      po_allocations: docLinePos_(l.shipment_line_id, snap.po_lineage)
    };
  });
  return { ok: true, document_type: 'SHIPDETAIL', template_key: 'SHIPDETAIL_STANDARD',
    shipment_id: docStr_(h.shipment_id), snapshot_id: docStr_(h.snapshot_id), snapshot_version: docNum_(h.snapshot_version),
    header: docHeaderBlock_(h, snap.lines, snap.po_lineage), lines: lines };
}

// PACKING LIST — physical / logistics view only (no commercial/declared/HS). Physical qty = snapshot shipment_qty.
function docRenderPackingList_(snap) {
  var gate = docFamilyStatus_(snap, 'packing_list', 'packing_list_ready');
  if (gate.status !== 'READY') return { ok: false, blocked: true, document_type: 'PL', reason: gate.reason || 'NOT_READY' };
  var h = snap.header;
  var miss = docRequire_(h, ['shipment_id', 'consignee_name']);
  if (miss || !(snap.lines && snap.lines.length)) return { ok: false, error: 'FINAL_OUTPUT_REQUIRED_FIELD_GAP', document_type: 'PL', missing: miss || 'lines' };
  var lines = snap.lines.map(function (l) {
    return {
      sku: docStr_(l.sku), product_name_en: docStr_(l.product_name_en),
      shipment_qty: docNum_(l.shipment_qty),
      units_per_carton: docNum_(l.units_per_carton), carton_qty: docNum_(l.shipment_carton_qty),
      carton_no_start: docStr_(l.carton_no_start), carton_no_end: docStr_(l.carton_no_end),
      gross_weight: docNum_(l.gross_weight), net_weight: docNum_(l.net_weight), cbm: docNum_(l.cbm),
      carton_length: docNum_(l.carton_length), carton_width: docNum_(l.carton_width), carton_height: docNum_(l.carton_height),
      po_allocations: docLinePos_(l.shipment_line_id, snap.po_lineage)
    };
  });
  return { ok: true, document_type: 'PL', template_key: 'PL_STANDARD',
    shipment_id: docStr_(h.shipment_id), snapshot_id: docStr_(h.snapshot_id), snapshot_version: docNum_(h.snapshot_version),
    header: docHeaderBlock_(h, snap.lines, snap.po_lineage), lines: lines };
}
// COMMERCIAL INVOICE — commercial/customs declaration view. F1-7N-FB-1B §J. Every value is FROZEN in the snapshot
// (party authority R2A, customs facts from tax_referral_rates at finalization) or DERIVED from frozen values; nothing
// is invented. Price, HS code, origin, currency, consignee and declared value are read, never computed from a rate
// card or guessed, and example_value is never consulted. Gate = the commercial_invoice family (which requires a
// declared value on every line), NOT the legal-importer `customs` family — see the header note.
// Used for BOTH usages: COMMERCIAL_INVOICE_EXPORT and COMMERCIAL_INVOICE_IMPORT_* render the same factual model; the
// export/import DIFFERENCE lives in the template's own fixed content and its document_template_fields mapping.
function docRenderCommercialInvoice_(snap) {
  var gate = docFamilyStatus_(snap, 'commercial_invoice', 'commercial_invoice_ready');
  if (gate.status !== 'READY') return { ok: false, blocked: true, document_type: 'CI', reason: gate.reason || 'NOT_READY' };
  var h = snap.header;
  var miss = docRequire_(h, ['shipment_id', 'shipper_legal_name', 'consignee_name']);
  if (miss || !(snap.lines && snap.lines.length)) return { ok: false, error: 'FINAL_OUTPUT_REQUIRED_FIELD_GAP', document_type: 'CI', missing: miss || 'lines' };
  var invoiceTotal = 0;
  var lines = snap.lines.map(function (l) {
    var qty = docNum_(l.shipment_qty), unit = docNum_(l.declared_unit_value), total = unit * qty;
    invoiceTotal += total;
    return {
      sku: docStr_(l.sku), site_sku: docStr_(l.site_sku),
      description: docStr_(l.product_name_en), product_name_cn: docStr_(l.product_name_cn),
      shipment_qty: qty, units_per_carton: docNum_(l.units_per_carton), carton_qty: docNum_(l.shipment_carton_qty),
      carton_no_start: docStr_(l.carton_no_start), carton_no_end: docStr_(l.carton_no_end),
      hs_code: docStr_(l.hs_code), country_of_origin: docUc_(l.country_of_origin),
      declared_currency: docUc_(l.declared_currency), declared_unit_value: unit, declared_total_value: total,
      gross_weight: docNum_(l.gross_weight), net_weight: docNum_(l.net_weight), cbm: docNum_(l.cbm),
      po_allocations: docLinePos_(l.shipment_line_id, snap.po_lineage)
    };
  });
  // A CI is a currency document: a mixed-currency invoice is a real business error, not something to average away.
  var currencies = {}; lines.forEach(function (l) { if (l.declared_currency) currencies[l.declared_currency] = 1; });
  var curList = Object.keys(currencies);
  if (curList.length > 1) return { ok: false, error: 'COMMERCIAL_INVOICE_CURRENCY_CONFLICT', document_type: 'CI', currencies: curList };
  var header = docHeaderBlock_(h, snap.lines, snap.po_lineage);
  header.invoice_no = docStr_(h.invoice_no);
  header.invoice_date = docStr_(h.dispatch_date) || docStr_(h.etd);
  header.currency = docUc_(h.currency) || curList[0] || '';
  header.invoice_total_value = invoiceTotal;
  header.booking_no = docStr_(h.booking_no);
  header.container_no = docStr_(h.container_no);
  return { ok: true, document_type: 'CI', template_key: 'COMMERCIAL_INVOICE_STANDARD',
    shipment_id: docStr_(h.shipment_id), snapshot_id: docStr_(h.snapshot_id), snapshot_version: docNum_(h.snapshot_version),
    header: header, lines: lines };
}

// F1-7N-FB-1B §J — the Commercial Invoice fields that have NO canonical owner anywhere in the system today. They are
// named here so a diagnostic can report them by name instead of a document silently rendering a blank cell, and so
// nobody is tempted to fabricate them. If an ACTIVE template marks one of these `required`, its required-field check
// fails and that CI is reported CONFIGURATION_REQUIRED — never GENERATED, and never silently omitted.
var DOC_CI_UNRESOLVED_AUTHORITY_ = {
  INCOTERM: 'No canonical owner. Not on shipments, carriers, carrier_rate_cards or the R2B snapshot.',
  PAYMENT_TERMS: 'No canonical owner. purchase_orders carries factory payment terms, which are not the export sale terms.',
  PORT_OF_LOADING: 'No canonical owner in the frozen snapshot. shipment_routes holds nodes but is not a snapshot input.',
  PORT_OF_DISCHARGE: 'No canonical owner in the frozen snapshot. Same limitation as PORT_OF_LOADING.',
  IMPORTER_OF_RECORD: 'Genuinely governed by LEGAL_IMPORTER_AUTHORITY_GAP (R2A) — a legal-authority boundary, not a document limitation.'
};
function docCiUnresolvedFields_(fieldRows) {
  var out = [];
  (fieldRows || []).forEach(function (f) {
    var p = docUc_(f.placeholder);
    if (DOC_CI_UNRESOLVED_AUTHORITY_[p] && docStr_(f.required) && docLc_(f.required) !== 'false' && docLc_(f.required) !== '0') {
      out.push({ placeholder: p, reason: 'DOCUMENT_FIELD_AUTHORITY_MISSING', detail: DOC_CI_UNRESOLVED_AUTHORITY_[p] });
    }
  });
  return out;
}
// __DOC_PURE_END__

// ---- read the FROZEN snapshot ONLY (the R2B authority tables) — no masters, no re-resolution ----
function docReadSnapshot_(ss, shipmentId) {
  var sid = docStr_(shipmentId);
  var heads = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_snapshots', SFO_SNAPSHOT_HEADERS_))
    .filter(function (r) { return docStr_(r.shipment_id) === sid && docLc_(r.status) !== 'superseded'; });
  if (!heads.length) return null;
  var header = heads[0], snapId = docStr_(header.snapshot_id);
  var lines = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_lines', SFO_LINE_HEADERS_)).filter(function (r) { return docStr_(r.snapshot_id) === snapId; });
  var pos = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_line_pos', SFO_LINE_PO_HEADERS_)).filter(function (r) { return docStr_(r.snapshot_id) === snapId; });
  var readiness = {}; try { readiness = JSON.parse(header.readiness_detail || '{}'); } catch (e) {}
  return { header: header, lines: lines, po_lineage: pos, readiness: readiness };
}

var DOC_SUPPORTED_ = { SHIPDETAIL: 1, PL: 1, CI: 1 };
// The ONE dispatcher from a render class key to its render model. 39_ chooses the class; this maps it.
function docRenderByClass_(renderKey, snap) {
  if (renderKey === 'SHIPDETAIL') return docRenderShippingDetail_(snap);
  if (renderKey === 'PL') return docRenderPackingList_(snap);
  if (renderKey === 'CI') return docRenderCommercialInvoice_(snap);
  return { ok: false, error: 'UNSUPPORTED_DOCUMENT_TYPE', document_type: String(renderKey || ''),
    note: 'Carrier Booking (BOOKING) has no render model yet - CARRIER_BOOKING_MAPPING_SPEC.md defines the mapping, the runtime is deferred.' };
}

// The document read/render API. Reads the frozen snapshot and returns a canonical document MODEL. R3A does NOT
// persist a generated document (persisted layer HALTed); repeated calls are naturally idempotent (same snapshot →
// same model). No template placeholder mapping here (that is document_template_fields — the reported gap).
function handleRenderShipmentDocument_(body) {
  var shipmentId = docStr_(body && body.shipment_id);
  var docType = docUc_(body && body.document_type);
  if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
  if (!DOC_SUPPORTED_[docType]) return jsonResponse_({ success: false, error: 'UNSUPPORTED_DOCUMENT_TYPE', supported: ['SHIPDETAIL', 'PL', 'CI'], note: 'BOOKING / CUSTOMS renderers remain deferred.' });
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var snap = docReadSnapshot_(ss, shipmentId);
  if (!snap) return jsonResponse_({ success: true, finalized: false, shipment_id: shipmentId, note: 'No finalized final-output snapshot — run finalizeShipmentFinalOutput first.' });
  var model = docRenderByClass_(docType, snap);
  if (!model.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docType, blocked: model.blocked || false, error: model.error || 'DOCUMENT_NOT_READY', reason: model.reason, missing: model.missing });
  // Persisted generated-document record is intentionally NOT written in R3A (spec-only schema — see doc gaps).
  return jsonResponse_({ success: true, shipment_id: shipmentId, document: model, persisted: false,
    note: 'Rendered from the frozen R2B snapshot (presentation only). Persisted document record + placeholder mapping deferred to R3B.' });
}
