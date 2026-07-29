// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 17_carrier_handlers.gs — Carrier Rate Card v1.1 (template import)
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/CARRIER_AND_ROUTE_SPEC.md §4C (v1.7 template modes).
//   - importCarrierRateCards : import a Carrier Rate Template into carrier_rate_cards.
//        * Existing row  (has rate_card_id) → UPDATE. In 'update' mode only the carrier-editable fields
//          are applied; locked route/method/structure edits are IGNORED (kept at DB value) + reported.
//          In 'master' mode every stored field may be updated.
//        * New row       (blank rate_card_id + required route/rate values) → CREATE (new rate_card_id).
//          carrier_id defaults to the template carrier scope when blank.
//        * Blank row     (no rate_card_id, no meaningful values) → skipped (blank_skipped_count).
// READS (carriers / carrier_rate_cards / carrier_lead_times) go through getOperationDb (validTabs in
// 03_). Export template is built CLIENT-SIDE (no handler). NO pricing engine, NO carrier ranking.
// carrier_rate_cards NEVER stores Lead Time — `transit_days` and lead-time columns are REJECTED.
// FIELD LOCKING IS ENFORCED HERE (the importer), NOT by the CSV — a CSV cannot protect cells.
// Reuses procurement* helpers (procurementEnsureSheet_ / procurementAppendByHeader_ / procurementTimestamp_)
// and sheetEnsureColumns_ from the shared global scope. Table auto-creates with the documented header.
// ============================================================

// Canonical carrier_rate_cards header (2026-07-28 DB sync — adds import_duty_treatment; NO transit_days;
// Lead Time lives in carrier_lead_times). import_duty_treatment sits after customs_type_label; note moves
// after status (canonical order).
var CARRIER_RATE_CARDS_HEADERS_ = [
  'rate_card_id', 'carrier_id', 'origin_country', 'origin_city', 'destination_country', 'destination_city',
  'destination_postal_code_start', 'destination_postal_code_end', 'destination_warehouse_code',
  'marketplace', 'shipping_method', 'last_mile_delivery', 'shipping_method_label', 'charge_type', 'charge_unit', 'dim_divisor',
  'min_box_weight', 'min_box_weight_unit', 'weight_tier', 'weight_tier_unit',
  'currency', 'unit_rate', 'min_charge', 'fuel_surcharge', 'customs_fee', 'doc_fee',
  'transit_type', 'battery_type', 'customs_type', 'customs_type_label', 'import_duty_treatment',
  'effective_from', 'effective_to', 'status', 'note', 'source_file_name', 'import_batch_id',
  'created_at', 'updated_at'
];

// Enums (v1.4). Lowercased for validation.
var CRC_CHARGE_TYPES_ = { weight: 1, volume: 1, container: 1, shipment: 1, carton: 1 };
var CRC_CHARGE_UNITS_ = { kg: 1, lb: 1, cbm: 1, '20gp': 1, '40hq': 1, shipment: 1, carton: 1 };
var CRC_STATUSES_ = { active: 1, inactive: 1 };
// import_duty_treatment enum. Blank is a VALID stored state = "needs data completion" (never auto-derived
// from customs_type; a blank must never be treated as a known cross-border result).
var CRC_IMPORT_DUTY_TREATMENTS_ = { included_in_rate: 1, excluded_in_rate: 1 };
// Columns that MUST NOT appear in a Carrier Rate Template (Lead Time is maintained separately).
var CRC_FORBIDDEN_COLS_ = ['transit_days', 'min_days', 'max_days', 'avg_days', 'lead_time_id'];

// Update-Template EDITABLE fields on EXISTING rows (everything else stored is LOCKED).
// NOTE: min_charge is editable per the Carrier Update UI task (Part C/D) — extends §4C.3A (which had it
// locked); keep the Update template's editable set and this list in sync.
var CRC_UPDATE_EDITABLE_ = { unit_rate: 1, min_charge: 1, effective_from: 1, effective_to: 1, fuel_surcharge: 1, customs_fee: 1, doc_fee: 1, import_duty_treatment: 1, status: 1, note: 1 };
// Stored data columns that are LOCKED on existing rows in 'update' mode (identity / route / method / structure).
var CRC_LOCKED_COLS_ = [
  'carrier_id', 'origin_country', 'origin_city', 'destination_country', 'destination_city',
  'destination_postal_code_start', 'destination_postal_code_end', 'destination_warehouse_code',
  'marketplace', 'shipping_method', 'last_mile_delivery', 'shipping_method_label', 'charge_type', 'charge_unit', 'dim_divisor',
  'min_box_weight', 'min_box_weight_unit', 'weight_tier', 'weight_tier_unit', 'currency',
  'transit_type', 'battery_type', 'customs_type', 'customs_type_label'
];
// System columns never taken from the template.
var CRC_SYSTEM_COLS_ = { rate_card_id: 1, source_file_name: 1, import_batch_id: 1, created_at: 1, updated_at: 1, carrier_name: 1, row_type: 1 };

// Canonical customs_type enum → localized (中文) Label. SINGLE SOURCE OF TRUTH for the customs Label
// (shared global scope; also used by 12_shipment_handlers.gs shipmentCustomsTypeLabel_). Enum names are
// FROZEN; only the display Labels live here. If a Label ever changes, only this map changes and NO document
// or downstream code changes — the shipments_customs_type_label snapshot re-derives on the next write.
var CUSTOMS_TYPE_LABELS_ = {
  third_party_customs: '買單報關',
  formal_customs: '正式報關',
  tax_refund_customs: '退稅報關'
};
// Resolve the canonical Label for a customs_type enum. Unknown/blank → '' (nullable; never invents text).
function customsTypeLabel_(code) {
  var key = String(code == null ? '' : code).trim().toLowerCase();
  return CUSTOMS_TYPE_LABELS_.hasOwnProperty(key) ? CUSTOMS_TYPE_LABELS_[key] : '';
}

function crcNorm_(v) { return String(v == null ? '' : v).trim(); }
function crcLower_(v) { return crcNorm_(v).toLowerCase(); }
function crcIsNum_(v) { return v !== '' && v != null && !isNaN(parseFloat(v)); }
// Accept yyyy-mm-dd (and common variants); returns '' when invalid.
function crcParseDate_(v) {
  var s = crcNorm_(v);
  if (!s) return '';
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!m) return null;   // present but invalid
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}
// True when two cell values are meaningfully different (numeric-aware; trims strings).
function crcValsDiffer_(a, b) {
  var an = crcNorm_(a), bn = crcNorm_(b);
  if (an === bn) return false;
  if (crcIsNum_(an) && crcIsNum_(bn)) return parseFloat(an) !== parseFloat(bn);
  return true;
}

/**
 * Import a Carrier Rate Template into carrier_rate_cards. Body:
 *   { rows: [ { row_type?, rate_card_id?, carrier_id?, shipping_method?, ...fields... } ],
 *     columns?: [header names], source_file_name?,
 *     mode?: 'update' | 'master'   (default 'update' — enforce locked fields on existing rows),
 *     carrier_scope?: { carrier_id?, carrier_name? }  (fallback carrier for new rows w/ blank carrier_id) }
 *
 * Per row:
 *   - row_type='example' → skipped_examples.
 *   - has rate_card_id → UPDATE that row (must exist). 'update' mode writes only CRC_UPDATE_EDITABLE_ and
 *     ignores+reports locked-field edits; 'master' mode may write any stored field.
 *   - blank rate_card_id + meaningful values → CREATE new row (new rate_card_id; carrier scope default).
 *   - blank rate_card_id + no meaningful values → blank_skipped_count.
 * Forbidden columns (transit_days / min_days / max_days / avg_days / lead_time_id) → REJECT whole import.
 * Returns { mode, batch_id, updated_existing_count, created_new_count, blank_skipped_count,
 *           rejected_count, locked_fields_ignored_count, skipped_examples, warnings, errors,
 *           imported (=created+updated, back-compat) }.
 */
function handleImportCarrierRateCards_(body) {
  var rows = (body && body.rows) || [];
  if (!rows.length) return jsonResponse_({ success: false, error: 'No rows provided' });
  var mode = (body && crcLower_(body.mode) === 'master') ? 'master' : 'update';

  // Guard: the template must NOT carry Lead Time / transit_days columns.
  var cols = (body && body.columns) || [];
  if (!cols.length && rows[0]) cols = Object.keys(rows[0]);
  var badCols = [];
  cols.forEach(function (c) { if (CRC_FORBIDDEN_COLS_.indexOf(crcLower_(c)) !== -1) badCols.push(crcNorm_(c)); });
  if (badCols.length) {
    return jsonResponse_({ success: false, error: 'Rejected: Lead Time / transit columns are not allowed in a Carrier Rate Template (' + badCols.join(', ') + '). Lead Time is maintained separately in carrier_lead_times.' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'carrier_rate_cards', CARRIER_RATE_CARDS_HEADERS_);
  // Additive migration on tabs that predate the canonical column (no reorder, no data shift, no dup).
  sheetEnsureColumns_(sh, ['import_duty_treatment']);

  // Known carriers (validation + carrier_name → carrier_id resolution). We NEVER create carriers here —
  // the carrier master is maintained separately (avoid polluting it with typos / inconsistent names).
  var carrierIds = {};                 // carrier_id -> 1
  var carrierNameById = {};            // carrier_id -> carrier_name (for mismatch warnings)
  var carrierIdsByNameKey = {};        // normalized(carrier_name) -> [carrier_id, ...] (ambiguity detection)
  var cSheet = ss.getSheetByName('carriers');
  if (cSheet) {
    var cData = cSheet.getDataRange().getValues();
    if (cData.length >= 1) {
      var cHead = cData[0].map(function (h) { return crcNorm_(h); });
      var cIdCol = cHead.indexOf('carrier_id');
      var cNameCol = cHead.indexOf('carrier_name');
      if (cIdCol !== -1) {
        for (var i = 1; i < cData.length; i++) {
          var cid = crcNorm_(cData[i][cIdCol]);
          if (!cid) continue;
          carrierIds[cid] = 1;
          var cname = cNameCol !== -1 ? crcNorm_(cData[i][cNameCol]) : '';
          carrierNameById[cid] = cname;
          if (cname) {
            var nk = cname.toLowerCase();
            (carrierIdsByNameKey[nk] = carrierIdsByNameKey[nk] || []).push(cid);
          }
        }
      }
    }
  }

  // Index existing rate cards by rate_card_id (captured once; appends go to the bottom so indices stay valid).
  var data = sh.getDataRange().getValues();
  var headers = data[0].map(function (h) { return crcNorm_(h); });
  function hcol(n) { return headers.indexOf(n); }
  var idCol = hcol('rate_card_id');
  var byId = {};
  if (idCol !== -1) {
    for (var e = 1; e < data.length; e++) {
      var eid = crcNorm_(data[e][idCol]);
      if (eid) byId[eid] = { rowIndex: e + 1, vals: data[e] };
    }
  }

  // Carrier scope for NEW rows with a blank carrier_id: explicit body scope, else the single distinct
  // carrier_id present on the file's existing (rate_card_id-bearing) rows.
  var scopeCarrierId = crcNorm_(body && body.carrier_scope && body.carrier_scope.carrier_id);
  if (!scopeCarrierId) {
    var seen = {};
    rows.forEach(function (rr) {
      if (crcNorm_(rr.rate_card_id) && crcNorm_(rr.carrier_id)) seen[crcNorm_(rr.carrier_id)] = 1;
    });
    var distinct = Object.keys(seen);
    if (distinct.length === 1) scopeCarrierId = distinct[0];
  }

  // Resolve a NEW row's carrier from carrier_id (authoritative) or carrier_name (Master Template).
  // Returns { carrier_id, error, warning }. NEVER creates a carrier (item 3).
  //   - carrier_id present  → must exist in carriers; if carrier_name also given & mismatched → warning (id wins).
  //   - carrier_id blank + carrier_name given → resolve by name (unique = use; none = reject; multiple = reject).
  //   - carrier_id blank + carrier_name blank → fall back to the Update-Template carrier scope (if any).
  function crcResolveNewRowCarrier_(row) {
    var explicitId = crcNorm_(row.carrier_id);
    var name = crcNorm_(row.carrier_name);
    if (explicitId) {
      if (!carrierIds[explicitId]) return { error: 'carrier_id "' + explicitId + '" does not exist in carriers.' };
      var warn = '';
      if (name && crcValsDiffer_(name.toLowerCase(), String(carrierNameById[explicitId] || '').toLowerCase())) {
        warn = 'carrier_name does not match carrier_id; carrier_id was used.';
      }
      return { carrier_id: explicitId, warning: warn };
    }
    if (name) {
      var ids = carrierIdsByNameKey[name.toLowerCase()] || [];
      if (ids.length === 1) return { carrier_id: ids[0] };
      if (ids.length === 0) return { error: 'carrier_name not found. Please create carrier first.' };
      return { error: 'carrier_name is ambiguous. Please provide carrier_id.' };
    }
    if (scopeCarrierId) return { carrier_id: scopeCarrierId };   // Update-Template carrier scope fallback
    return { error: 'carrier_id is required (blank carrier_id and carrier_name, and no carrier scope could be resolved).' };
  }

  var now = procurementTimestamp_();
  var batchId = 'CRCB-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  var sourceFile = crcNorm_(body && body.source_file_name) || 'carrier_rate_template';
  var updatedExisting = 0, createdNew = 0, blankSkipped = 0, rejected = 0, lockedIgnored = 0, skippedExamples = 0;
  var errors = [], warnings = [];

  // Fields that make a blank-rate_card_id row "meaningful" (i.e. a new row rather than an empty row).
  var MEANINGFUL_ = ['carrier_id', 'origin_country', 'destination_country', 'destination_city', 'destination_warehouse_code',
    'destination_postal_code_start', 'shipping_method', 'last_mile_delivery', 'charge_type', 'charge_unit', 'currency', 'unit_rate', 'weight_tier'];

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r] || {};
    var rowNo = (row.__row != null) ? row.__row : (r + 2);
    var rowType = crcLower_(row.row_type);
    if (rowType === 'example') { skippedExamples++; continue; }

    // Per-row forbidden-value guard (defensive; column guard above already fails fast).
    var hasForbidden = false;
    CRC_FORBIDDEN_COLS_.forEach(function (k) { if (row.hasOwnProperty(k) && crcNorm_(row[k]) !== '') hasForbidden = true; });
    if (hasForbidden) { rejected++; errors.push({ row: rowNo, message: 'Lead Time / transit_days values are not allowed in the Rate Template.' }); continue; }

    var rateCardId = crcNorm_(row.rate_card_id);

    // ---- (A) EXISTING ROW — update ----
    if (rateCardId) {
      var target = byId[rateCardId];
      if (!target) { rejected++; errors.push({ row: rowNo, message: 'rate_card_id "' + rateCardId + '" not found in carrier_rate_cards (cannot update a non-existent row).' }); continue; }

      // In 'update' mode: detect + ignore locked-field edits.
      if (mode === 'update') {
        var ignoredHere = [];
        CRC_LOCKED_COLS_.forEach(function (lc) {
          if (!row.hasOwnProperty(lc)) return;
          var tv = crcNorm_(row[lc]);
          if (tv === '') return;   // carrier left it as-is / blank → nothing to ignore
          var c = hcol(lc);
          var dbv = c !== -1 ? target.vals[c] : '';
          if (crcValsDiffer_(tv, dbv)) { ignoredHere.push(lc); lockedIgnored++; }
        });
        if (ignoredHere.length) {
          warnings.push({ row: rowNo, rate_card_id: rateCardId, message: 'Locked field(s) ignored (kept DB values): ' + ignoredHere.join(', ') });
        }
      }

      // Validate the fields we are about to write, then apply them.
      var updErrors = [];
      var writable = (mode === 'master') ? crcMasterWritableForExisting_(row) : CRC_UPDATE_EDITABLE_;
      // Resolve effective dates using DB fallback when only one side is provided.
      var newEf, newEt;
      if (writable.effective_from && row.hasOwnProperty('effective_from') && crcNorm_(row.effective_from) !== '') {
        newEf = crcParseDate_(row.effective_from); if (newEf === null) updErrors.push('effective_from is not a valid date');
      }
      if (writable.effective_to && row.hasOwnProperty('effective_to') && crcNorm_(row.effective_to) !== '') {
        newEt = crcParseDate_(row.effective_to); if (newEt === null) updErrors.push('effective_to is not a valid date');
      }
      var efCheck = (newEf !== undefined && newEf) ? newEf : (hcol('effective_from') !== -1 ? crcNorm_(target.vals[hcol('effective_from')]) : '');
      var etCheck = (newEt !== undefined && newEt) ? newEt : (hcol('effective_to') !== -1 ? crcNorm_(target.vals[hcol('effective_to')]) : '');
      if (efCheck && etCheck && efCheck > etCheck) updErrors.push('effective_from > effective_to');
      if (writable.status && row.hasOwnProperty('status') && crcNorm_(row.status) !== '' && !CRC_STATUSES_[crcLower_(row.status)]) updErrors.push('status invalid (active/inactive)');
      if (writable.unit_rate && row.hasOwnProperty('unit_rate') && crcNorm_(row.unit_rate) !== '' && !crcIsNum_(row.unit_rate)) updErrors.push('unit_rate is not numeric');
      // import_duty_treatment: only the two enum values are accepted; blank is allowed (data-completion
      // state). NEVER auto-derived from customs_type.
      if (writable.import_duty_treatment && row.hasOwnProperty('import_duty_treatment') && crcNorm_(row.import_duty_treatment) !== '' && !CRC_IMPORT_DUTY_TREATMENTS_[crcLower_(row.import_duty_treatment)]) updErrors.push('import_duty_treatment invalid (included_in_rate/excluded_in_rate)');
      if (updErrors.length) { rejected++; errors.push({ row: rowNo, message: 'rate_card_id ' + rateCardId + ': ' + updErrors.join('; ') }); continue; }

      function setCell(name, value) { var c = hcol(name); if (c !== -1) sh.getRange(target.rowIndex, c + 1).setValue(value); }
      Object.keys(writable).forEach(function (f) {
        if (!row.hasOwnProperty(f)) return;
        var raw = row[f];
        if (crcNorm_(raw) === '' && (f === 'unit_rate')) return;   // never blank a required numeric on update
        if (f === 'effective_from') { if (newEf) setCell(f, newEf); }
        else if (f === 'effective_to') { if (newEt) setCell(f, newEt); }
        else if (f === 'status') { setCell(f, crcLower_(raw) || 'active'); }
        else if (f === 'unit_rate' || f === 'fuel_surcharge' || f === 'customs_fee' || f === 'doc_fee' || f === 'min_charge' || f === 'dim_divisor' || f === 'min_box_weight' || f === 'weight_tier') {
          setCell(f, crcIsNum_(raw) ? parseFloat(raw) : (crcNorm_(raw) === '' ? '' : crcNorm_(raw)));
        }
        else if (f === 'charge_type') { setCell(f, crcLower_(raw)); }
        else if (f === 'import_duty_treatment') { setCell(f, crcLower_(raw)); }   // enum lowercased; blank stays blank
        else { setCell(f, crcNorm_(raw)); }
      });
      setCell('updated_at', now);
      updatedExisting++;
      continue;
    }

    // ---- (B/C) NO rate_card_id → new row or blank ----
    var meaningful = false;
    for (var mi = 0; mi < MEANINGFUL_.length; mi++) { if (crcNorm_(row[MEANINGFUL_[mi]]) !== '') { meaningful = true; break; } }
    if (!meaningful) { blankSkipped++; continue; }   // (C) blank row → skip silently (counted)

    // Update Template = UPDATE ONLY — it must NEVER create new rate cards. A meaningful row without
    // rate_card_id is rejected with a clear message (new rate cards are added via the Master Template).
    // Only Master Template import (mode='master') inserts new rows (upsert: blank rate_card_id → create).
    if (mode !== 'master') {
      rejected++;
      errors.push({ row: rowNo, message: 'Update Template requires rate_card_id (update-only) — new rate cards must be added via the Master Template. Row skipped.' });
      continue;
    }

    // (B) NEW ROW (Master upsert only) — all fields editable; resolve carrier from carrier_id (authoritative) or carrier_name.
    var carrierRes = crcResolveNewRowCarrier_(row);
    var carrierId = carrierRes.carrier_id || '';
    var method = crcNorm_(row.shipping_method);
    var lastMile = crcNorm_(row.last_mile_delivery);
    var chargeType = crcLower_(row.charge_type);
    var chargeUnit = crcLower_(row.charge_unit);
    var currency = crcNorm_(row.currency);
    var unitRate = row.unit_rate;
    var status = crcLower_(row.status) || 'active';
    var originCountry = crcNorm_(row.origin_country);
    var destCountry = crcNorm_(row.destination_country);

    var rowErrors = [];
    if (carrierRes.error) rowErrors.push(carrierRes.error);   // carrier not found / ambiguous / missing (never auto-created)
    if (!originCountry) rowErrors.push('origin_country is required');
    if (!destCountry) rowErrors.push('destination_country is required');
    if (!method) rowErrors.push('shipping_method is required');
    if (!lastMile) rowErrors.push('last_mile_delivery is required');
    if (!CRC_CHARGE_TYPES_[chargeType]) rowErrors.push('charge_type invalid (weight/volume/container/shipment/carton)');
    if (!CRC_CHARGE_UNITS_[chargeUnit]) rowErrors.push('charge_unit invalid (kg/lb/cbm/20GP/40HQ/shipment/carton)');
    if (!currency) rowErrors.push('currency is required');
    if (!crcIsNum_(unitRate)) rowErrors.push('unit_rate is not numeric');
    if (status && !CRC_STATUSES_[status]) rowErrors.push('status invalid (active/inactive)');

    // effective_from is REQUIRED (blank '' or invalid null → error).
    // effective_to is OPTIONAL: blank ('') = open-ended / active until replaced (allowed);
    // only a present-but-invalid value (null) is rejected. crcParseDate_ → '' for blank, null for invalid.
    var ef = crcParseDate_(row.effective_from);
    var et = crcParseDate_(row.effective_to);
    if (ef === null || ef === '') rowErrors.push('effective_from is not a valid date');
    if (et === null) rowErrors.push('effective_to is not a valid date');   // '' (blank) is allowed — open-ended
    if (ef && et && ef > et) rowErrors.push('effective_from > effective_to');
    // import_duty_treatment: enum-only when present; blank allowed (needs-data-completion). NEVER derived.
    var importDutyTreatment = crcLower_(row.import_duty_treatment);
    if (importDutyTreatment && !CRC_IMPORT_DUTY_TREATMENTS_[importDutyTreatment]) rowErrors.push('import_duty_treatment invalid (included_in_rate/excluded_in_rate)');

    if (rowErrors.length) { rejected++; errors.push({ row: rowNo, message: rowErrors.join('; ') }); continue; }

    procurementAppendByHeader_(sh, {
      rate_card_id: 'CRC-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
      carrier_id: carrierId,
      origin_country: originCountry,
      origin_city: crcNorm_(row.origin_city),
      destination_country: destCountry,
      destination_city: crcNorm_(row.destination_city),
      destination_postal_code_start: crcNorm_(row.destination_postal_code_start),
      destination_postal_code_end: crcNorm_(row.destination_postal_code_end),
      destination_warehouse_code: crcNorm_(row.destination_warehouse_code),
      marketplace: crcNorm_(row.marketplace),
      shipping_method: method,
      last_mile_delivery: lastMile,
      shipping_method_label: crcNorm_(row.shipping_method_label),   // display metadata (admin-set; blank allowed; Master only)
      charge_type: chargeType,
      charge_unit: crcNorm_(row.charge_unit),   // preserve original casing for display (20GP/40HQ)
      dim_divisor: crcIsNum_(row.dim_divisor) ? parseFloat(row.dim_divisor) : '',
      min_box_weight: crcIsNum_(row.min_box_weight) ? parseFloat(row.min_box_weight) : '',
      min_box_weight_unit: crcNorm_(row.min_box_weight_unit),
      weight_tier: crcIsNum_(row.weight_tier) ? parseFloat(row.weight_tier) : '',
      weight_tier_unit: crcNorm_(row.weight_tier_unit),
      currency: currency,
      unit_rate: parseFloat(unitRate),
      min_charge: crcIsNum_(row.min_charge) ? parseFloat(row.min_charge) : '',
      fuel_surcharge: crcIsNum_(row.fuel_surcharge) ? parseFloat(row.fuel_surcharge) : '',
      customs_fee: crcIsNum_(row.customs_fee) ? parseFloat(row.customs_fee) : '',
      doc_fee: crcIsNum_(row.doc_fee) ? parseFloat(row.doc_fee) : '',
      transit_type: crcNorm_(row.transit_type),
      battery_type: crcNorm_(row.battery_type),
      customs_type: crcNorm_(row.customs_type),
      // Localized customs Label — canonical enum→Label derivation (row override honored if present). Mirrors
      // shipping_method_label as display metadata; shipments snapshot copies this at Execution Commit.
      customs_type_label: crcNorm_(row.customs_type_label) || customsTypeLabel_(row.customs_type),
      // import_duty_treatment: stored EXACTLY as provided (enum or blank). NEVER auto-derived from customs_type.
      import_duty_treatment: importDutyTreatment,
      note: crcNorm_(row.note),
      effective_from: ef,
      effective_to: et,
      status: status,
      source_file_name: sourceFile,
      import_batch_id: batchId,
      created_at: now,
      updated_at: now
    });
    createdNew++;
    // carrier_id authoritative over carrier_name — surface a warning (not a silent overwrite) on mismatch.
    if (carrierRes.warning) warnings.push({ row: rowNo, carrier_id: carrierId, message: carrierRes.warning });
  }

  // DATA-QUALITY (2026-07-28): carrier_rate_cards keeps shipping_method_label / customs_type_label as DISPLAY
  // metadata ONLY — they are NEVER a matching key (matching uses carrier_id + shipping_method + last_mile_delivery
  // + customs_type CODES). If one CODE carries inconsistent labels across the batch, warn — the codes are the
  // SAME method / customs type, not different ones.
  (function () {
    function scan(codeField, labelField, kind) {
      var seen = {};
      for (var i = 0; i < rows.length; i++) {
        var code = crcLower_(rows[i] && rows[i][codeField]); if (!code) continue;
        var label = crcNorm_(rows[i] && rows[i][labelField]); if (!label) continue;
        (seen[code] = seen[code] || {})[label] = 1;
      }
      Object.keys(seen).forEach(function (code) {
        var labels = Object.keys(seen[code]);
        if (labels.length > 1) warnings.push({ data_quality: kind, code: code, message: 'Code "' + code + '" has inconsistent ' + labelField + ' values (' + labels.join(' | ') + ') — SAME ' + kind + ', not different types; labels are display-only and are NOT a matching key.' });
      });
    }
    scan('shipping_method', 'shipping_method_label', 'shipping_method');
    scan('customs_type', 'customs_type_label', 'customs_type');
  })();

  return jsonResponse_({
    success: true,
    data: {
      mode: mode,
      batch_id: batchId,
      updated_existing_count: updatedExisting,
      created_new_count: createdNew,
      blank_skipped_count: blankSkipped,
      rejected_count: rejected,
      locked_fields_ignored_count: lockedIgnored,
      skipped_examples: skippedExamples,
      warnings: warnings,
      errors: errors,
      imported: updatedExisting + createdNew   // back-compat with the old summary field
    }
  });
}

// Master-mode: every stored (non-system) column present on an existing-row update is writable.
function crcMasterWritableForExisting_(row) {
  var w = {};
  Object.keys(row || {}).forEach(function (k) {
    var key = crcNorm_(k);
    if (!key || CRC_SYSTEM_COLS_[key] || CRC_FORBIDDEN_COLS_.indexOf(key) !== -1) return;
    if (key === '__row') return;
    w[key] = 1;
  });
  return w;
}

// ============================================================
// Shipping Cost + Rate-Card Matching Engine (Phase 1). Shared global scope — used by
//   11_shipping_plan_handlers.gs (Weekly Plan ROUGH estimate) and
//   12_shipment_handlers.gs   (Shipment Draft EXACT match).
// Phase 1 Estimated Cost = Freight (+ fuel_surcharge%) + Customs Fee (ONCE) + Duty (series-based).
//   • doc_fee is stored on the rate card but is NOT added to Phase 1 total (and no Estimated Doc Fee col).
//   • Overseas warehouse → FBA (no carrier rate system yet) → Not Applied: every estimated_* stays BLANK
//     (never 0 — 0 would read as "free"). detected via a warehouse-code/route lacking a rate candidate.
//   • customs_type NEVER decides duty; import_duty_treatment does. A blank import_duty_treatment = unknown
//     → duty Not Applied (blank), never silently 0.
// Reads are all missing-tab/column/row safe; nothing here throws into the Submit / Approval flow.
// ============================================================

function shippingCostNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function shippingCostLower_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function shippingCostRound_(v, d) { var f = Math.pow(10, d); return Math.round((parseFloat(v) || 0) * f) / f; }

// Battery class for a set of SKUs: 'lithium_battery' if ANY sku is a lithium battery (whole shipment is
// then quoted with the lithium candidate), else '' (non-lithium). Reads sku_details.battery_type.
function shippingBatteryClass_(ss, skus) {
  var sh = ss.getSheetByName('sku_details');
  if (!sh) return '';
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return '';
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cSku = h.indexOf('sku'), cBat = h.indexOf('battery_type');
  if (cSku === -1 || cBat === -1) return '';
  var want = {}; (skus || []).forEach(function (s) { want[String(s || '').trim().toLowerCase()] = 1; });
  for (var i = 1; i < data.length; i++) {
    var s = String(data[i][cSku] || '').trim().toLowerCase();
    if (!want[s]) continue;
    if (shippingCostLower_(data[i][cBat]).indexOf('lithium') !== -1) return 'lithium_battery';
  }
  return '';
}

// Read carrier_rate_cards as row objects (missing-safe). Returns [] when tab/header absent.
function shippingReadRateCards_(ss) {
  var sh = ss.getSheetByName('carrier_rate_cards');
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var h = data[0].map(function (x) { return String(x).trim(); });
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = data[i][c];
    out.push(o);
  }
  return out;
}

// Active + effective-date filter for a rate card at quoteDate (yyyy-mm-dd). Blank effective_to = open.
function shippingRateActive_(rc, quoteDate) {
  if (shippingCostLower_(rc.status) !== 'active') return false;
  var q = String(quoteDate || '').trim();
  var ef = String(rc.effective_from || '').trim();
  var et = String(rc.effective_to || '').trim();
  if (ef && q && ef > q) return false;
  if (et && q && et < q) return false;
  return true;
}

/**
 * UNIFIED Rate Matcher (single shared service — no per-page duplication). All matching uses CODE / ID,
 * never Label / Name. criteria = {
 *   mode: 'recommendation' | 'rough' | 'exact',
 *   originCountry, destinationCountry, batteryType, quoteDate,           // all modes
 *   shippingMethod, lastMile, customsType,                              // rough + exact
 *   carrierId, originCity, destinationCity, destinationPostalCode,      // exact
 *   destinationWarehouseCode, marketplace                              // exact
 * }
 *   recommendation → status=active + effective + origin_country + destination_country + battery. method /
 *                    last_mile / customs are the OUTPUT (not filters). Used by Execution Plan + Weekly L1.
 *   rough          → recommendation set + shipping_method + last_mile_delivery + customs_type. (City / postal
 *                    / warehouse / marketplace / weight-tier NOT required — Weekly Plan rough.)
 *   exact          → rough set + carrier_id + city/postal/warehouse_code/marketplace (each: match or the card
 *                    leaves it blank = applies broadly). Shipment Draft precise match.
 * Battery: a lithium shipment (batteryType='lithium_battery') requires battery_type=lithium_battery cards;
 * a non-lithium shipment skips lithium-only cards (uses blank/non-lithium cards — never invents an enum).
 * Returns an array sorted newest effective_from first.
 */
function shippingRateMatch_(ss, criteria) {
  var cr = criteria || {};
  var mode = String(cr.mode || 'rough').trim();
  function eqi(a, b) { return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); }
  function cardHas(rc, f) { return String(rc[f] == null ? '' : rc[f]).trim() !== ''; }
  var wantLithium = shippingCostLower_(cr.batteryType) === 'lithium_battery';
  var cards = shippingReadRateCards_(ss).filter(function (rc) {
    if (!shippingRateActive_(rc, cr.quoteDate)) return false;
    if (cr.originCountry && !eqi(rc.origin_country, cr.originCountry)) return false;
    if (cr.destinationCountry && !eqi(rc.destination_country, cr.destinationCountry)) return false;
    var rcBat = shippingCostLower_(rc.battery_type);
    if (wantLithium) { if (rcBat !== 'lithium_battery') return false; }
    else { if (rcBat === 'lithium_battery') return false; }
    if (mode === 'recommendation') return true;   // method/last_mile/customs are OUTPUT here
    if (cr.shippingMethod && !eqi(rc.shipping_method, cr.shippingMethod)) return false;
    if (cr.lastMile && !eqi(rc.last_mile_delivery, cr.lastMile)) return false;
    if (cr.customsType && cardHas(rc, 'customs_type') && !eqi(rc.customs_type, cr.customsType)) return false;
    if (mode !== 'exact') return true;
    // exact-only precise filters (a blank card field = broad applicability, not a mismatch)
    if (cr.carrierId && !eqi(rc.carrier_id, cr.carrierId)) return false;
    if (cr.originCity && cardHas(rc, 'origin_city') && !eqi(rc.origin_city, cr.originCity)) return false;
    if (cr.destinationCity && cardHas(rc, 'destination_city') && !eqi(rc.destination_city, cr.destinationCity)) return false;
    if (cr.marketplace && String(cr.marketplace).trim().toUpperCase() !== 'MULTI' && cardHas(rc, 'marketplace') && !eqi(rc.marketplace, cr.marketplace)) return false;
    if (cr.destinationWarehouseCode && cardHas(rc, 'destination_warehouse_code') && !eqi(rc.destination_warehouse_code, cr.destinationWarehouseCode)) return false;
    var pc = String(cr.destinationPostalCode || '').trim();
    var ps = String(rc.destination_postal_code_start || '').trim(), pe = String(rc.destination_postal_code_end || '').trim();
    if (pc && ps && pe && !(pc >= ps && pc <= pe)) return false;
    return true;
  });
  cards.sort(function (a, b) { return String(b.effective_from || '').localeCompare(String(a.effective_from || '')); });
  return cards;
}

// Back-compat wrapper (existing callers pass a boolean `exact`). Delegates to the unified matcher.
function shippingMatchRateCards_(ss, criteria, exact) {
  var cr = {}; for (var k in (criteria || {})) if (criteria.hasOwnProperty(k)) cr[k] = criteria[k];
  cr.mode = exact ? 'exact' : 'rough';
  return shippingRateMatch_(ss, cr);
}

// Recommendation-mode Method candidates: DISTINCT { shipping_method, last_mile_delivery } combos available
// for the origin/destination country + battery scope. Label is NEVER included (display resolved at render).
function shippingMethodCandidates_(ss, criteria) {
  var cards = shippingRateMatch_(ss, {
    mode: 'recommendation', originCountry: criteria.originCountry, destinationCountry: criteria.destinationCountry,
    batteryType: criteria.batteryType, quoteDate: criteria.quoteDate
  });
  var seen = {}, out = [];
  cards.forEach(function (rc) {
    var m = String(rc.shipping_method || '').trim(); if (!m) return;
    var lm = String(rc.last_mile_delivery || '').trim();
    var key = m.toLowerCase() + '||' + lm.toLowerCase();
    if (seen[key]) return; seen[key] = 1;
    out.push({ shipping_method: m, last_mile_delivery: lm });
  });
  return out;
}

// DISTINCT last_mile_delivery values compatible with a chosen shipping_method (recommendation cascade).
function shippingLastMileCandidates_(ss, criteria) {
  var out = [], seen = {};
  shippingMethodCandidates_(ss, criteria).forEach(function (c) {
    if (criteria.shippingMethod && c.shipping_method.toLowerCase() !== String(criteria.shippingMethod).trim().toLowerCase()) return;
    var lm = c.last_mile_delivery; var k = lm.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(lm);
  });
  return out;
}

// DISTINCT customs_type CODES available for a chosen method+last_mile (rough scope). Codes only — the UI
// dictionary renders the 中文 label; the customs_type is NEVER used to decide duty.
function shippingCustomsCandidates_(ss, criteria) {
  var cards = shippingRateMatch_(ss, {
    mode: 'rough', originCountry: criteria.originCountry, destinationCountry: criteria.destinationCountry,
    batteryType: criteria.batteryType, quoteDate: criteria.quoteDate,
    shippingMethod: criteria.shippingMethod, lastMile: criteria.lastMile
  });
  var seen = {}, out = [];
  cards.forEach(function (rc) { var c = String(rc.customs_type || '').trim(); if (!c || seen[c.toLowerCase()]) return; seen[c.toLowerCase()] = 1; out.push(c); });
  return out;
}

// carrier_id → carrier_name (read-only). carrier_name is NEVER stored on plans / shipments / rate_cards —
// it is resolved live from the carriers master at display/candidate time.
function shippingCarrierNameById_(ss, carrierId) {
  var id = String(carrierId || '').trim(); if (!id) return '';
  var sh = ss.getSheetByName('carriers'); if (!sh) return '';
  var d = sh.getDataRange().getValues(); if (d.length < 2) return '';
  var h = d[0].map(function (x) { return String(x).trim(); });
  var ci = h.indexOf('carrier_id'), cn = h.indexOf('carrier_name');
  if (ci === -1) return '';
  for (var i = 1; i < d.length; i++) { if (String(d[i][ci]).trim() === id) return cn === -1 ? '' : String(d[i][cn] == null ? '' : d[i][cn]).trim(); }
  return '';
}

// Rough rate CANDIDATES for Weekly Plan L2 (the user PICKS — never auto-selected / never auto-cheapest).
// Each exposes carrier + charge structure + rate + import_duty_treatment. rate_card_id is a TRANSIENT
// reference for the follow-up select call ONLY (it is NOT persisted on the plan). carrier_name resolved live.
function shippingRoughRateCandidates_(ss, criteria) {
  var cards = shippingRateMatch_(ss, {
    mode: 'rough', originCountry: criteria.originCountry, destinationCountry: criteria.destinationCountry,
    batteryType: criteria.batteryType, quoteDate: criteria.quoteDate,
    shippingMethod: criteria.shippingMethod, lastMile: criteria.lastMile, customsType: criteria.customsType
  });
  return cards.map(function (rc) {
    return {
      rate_card_id: String(rc.rate_card_id || '').trim(),   // transient reference for selectCarrier (NOT persisted)
      carrier_id: String(rc.carrier_id || '').trim(),
      carrier_name: shippingCarrierNameById_(ss, rc.carrier_id),
      charge_type: String(rc.charge_type || '').trim(),
      charge_unit: String(rc.charge_unit || '').trim(),
      unit_rate: shippingCostNum_(rc.unit_rate),
      min_charge: (rc.min_charge === '' || rc.min_charge == null) ? '' : shippingCostNum_(rc.min_charge),
      fuel_surcharge: (rc.fuel_surcharge === '' || rc.fuel_surcharge == null) ? '' : shippingCostNum_(rc.fuel_surcharge),
      customs_fee: (rc.customs_fee === '' || rc.customs_fee == null) ? '' : shippingCostNum_(rc.customs_fee),
      import_duty_treatment: String(rc.import_duty_treatment || '').trim(),
      customs_type: String(rc.customs_type || '').trim(),
      currency: String(rc.currency || '').trim()
    };
  });
}

// ---- READ handler: Method / Last-Mile / Customs candidates (Execution Plan recommendation + Weekly L1 cascade)
/**
 * Body: { origin_country?, destination_country?, country?, planning_date?, skus?: [ ... ],
 *         shipping_method?, last_mile_delivery? }
 * Returns { battery_class, methods: [ { shipping_method, last_mile_delivery } ],
 *           last_miles: [ ... ] (when shipping_method given),
 *           customs_types: [ ... ] (when shipping_method + last_mile_delivery given) }.
 * READ-ONLY: no persistence, no carrier/rate selection, no shipping_allocation_drafts. Codes only (display
 * text resolved at render). Used by Inventory Replenishment Execution Plan (methods) AND Weekly Plan L1.
 */
function handleGetShippingMethodCandidates_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var destCountry = String((body && (body.destination_country || body.country)) || '').trim();
  var criteria = {
    originCountry: String((body && body.origin_country) || '').trim(),
    destinationCountry: destCountry,
    quoteDate: String((body && body.planning_date) || '').trim(),
    batteryType: shippingBatteryClass_(ss, (body && body.skus) || []),
    shippingMethod: String((body && body.shipping_method) || '').trim(),
    lastMile: String((body && body.last_mile_delivery) || '').trim()
  };
  var data = {
    battery_class: criteria.batteryType || 'non_lithium',
    methods: shippingMethodCandidates_(ss, criteria)
  };
  if (criteria.shippingMethod) data.last_miles = shippingLastMileCandidates_(ss, criteria);
  if (criteria.shippingMethod && criteria.lastMile) data.customs_types = shippingCustomsCandidates_(ss, criteria);
  return jsonResponse_({ success: true, data: data });
}

/**
 * Freight for ONE rate card given the shipment measures { grossWeightKg, cbm, cartons }.
 * base by charge_type/charge_unit (weight kg/lb, volume cbm, carton, shipment; container = per-shipment
 * unit_rate as a Phase-1 rough, container-count not modelled), floored by min_charge; fuel = base ×
 * fuel_surcharge/100 (a percentage — 15 means 15%, never a flat 15). Returns { base, fuel, freight }.
 */
function shippingFreight_(rc, measures) {
  var m = measures || {};
  var rate = shippingCostNum_(rc.unit_rate);
  var ct = shippingCostLower_(rc.charge_type), cu = shippingCostLower_(rc.charge_unit);
  var base = 0;
  if (ct === 'weight') {
    var w = shippingCostNum_(m.grossWeightKg);
    if (cu === 'lb') w = w * 2.20462;
    base = rate * w;
  } else if (ct === 'volume') {
    base = rate * shippingCostNum_(m.cbm);
  } else if (ct === 'carton') {
    base = rate * shippingCostNum_(m.cartons);
  } else if (ct === 'shipment' || ct === 'container') {
    base = rate;   // per-shipment (container count not modelled in Phase 1 rough)
  } else {
    base = rate;   // unknown charge_type → treat as per-shipment
  }
  var minCharge = shippingCostNum_(rc.min_charge);
  if (minCharge > 0 && base < minCharge) base = minCharge;
  var fuelPct = shippingCostNum_(rc.fuel_surcharge);   // percentage value
  var fuel = base * fuelPct / 100;
  return { base: shippingCostRound_(base, 2), fuel: shippingCostRound_(fuel, 2), freight: shippingCostRound_(base + fuel, 2) };
}

// Customs fee = the rate card's per-shipment customs_fee, charged ONCE. Never × qty / lines / cartons /
// marketplaces. Blank/0 → 0.
function shippingCustomsFee_(rc) { return shippingCostRound_(shippingCostNum_(rc && rc.customs_fee), 2); }

// Duty via the Tax SSOT. import_duty_treatment:
//   included_in_rate → 0 (never double-added).
//   excluded_in_rate → Σ over lines of declared_value × duty_rate, resolved by sku_details.series →
//                      tax_referral_rates (series + duty_country [+ origin] + effective window).
//   blank/unknown    → '' (Not Applied — never silently 0).
// lines = [{ sku, qty }]. Uses sku_details.series (NEVER category). Missing tax row → that line contributes 0.
function shippingDuty_(ss, lines, importDutyTreatment, destinationCountry, quoteDate) {
  var treat = shippingCostLower_(importDutyTreatment);
  if (treat === 'included_in_rate') return 0;
  if (treat !== 'excluded_in_rate') return '';   // blank/unknown → Not Applied
  // sku → series
  var seriesBySku = {};
  var sd = ss.getSheetByName('sku_details');
  if (sd) {
    var sdd = sd.getDataRange().getValues();
    if (sdd.length >= 2) {
      var sh = sdd[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cS = sh.indexOf('sku'), cSer = sh.indexOf('series');
      if (cS !== -1 && cSer !== -1) for (var i = 1; i < sdd.length; i++) seriesBySku[String(sdd[i][cS] || '').trim().toLowerCase()] = String(sdd[i][cSer] || '').trim();
    }
  }
  // tax_referral_rates rows (series + duty_country + effective) → { duty_rate, declared_value }
  var taxRows = [];
  var tr = ss.getSheetByName('tax_referral_rates');
  if (tr) {
    var trd = tr.getDataRange().getValues();
    if (trd.length >= 2) {
      var th = trd[0].map(function (x) { return String(x).trim().toLowerCase(); });
      function tc(n) { return th.indexOf(n); }
      for (var r = 1; r < trd.length; r++) {
        taxRows.push({
          series: String(trd[r][tc('series')] || '').trim(),
          duty_country: String(trd[r][tc('duty_country')] || '').trim(),
          country_of_origin: tc('country_of_origin') !== -1 ? String(trd[r][tc('country_of_origin')] || '').trim() : '',
          duty_rate: tc('duty_rate') !== -1 ? shippingCostNum_(trd[r][tc('duty_rate')]) : 0,
          declared_value: tc('declared_value') !== -1 ? shippingCostNum_(trd[r][tc('declared_value')]) : 0,
          effective_from: tc('effective_from') !== -1 ? String(trd[r][tc('effective_from')] || '').trim() : '',
          effective_to: tc('effective_to') !== -1 ? String(trd[r][tc('effective_to')] || '').trim() : ''
        });
      }
    }
  }
  function matchTax(series) {
    var q = String(quoteDate || '').trim();
    var cand = taxRows.filter(function (t) {
      if (String(t.series || '').trim().toLowerCase() !== String(series || '').trim().toLowerCase()) return false;
      if (destinationCountry && t.duty_country && t.duty_country.toLowerCase() !== String(destinationCountry).trim().toLowerCase()) return false;
      if (t.effective_from && q && t.effective_from > q) return false;
      if (t.effective_to && q && t.effective_to < q) return false;
      return true;
    });
    cand.sort(function (a, b) { return String(b.effective_from || '').localeCompare(String(a.effective_from || '')); });
    return cand[0] || null;
  }
  var total = 0;
  (lines || []).forEach(function (ln) {
    var series = seriesBySku[String(ln.sku || '').trim().toLowerCase()] || '';
    if (!series) return;
    var t = matchTax(series);
    if (!t) return;
    // Declared value is per-unit in the Tax SSOT; duty = declared_value × qty × duty_rate (rate as %).
    total += shippingCostNum_(t.declared_value) * shippingCostNum_(ln.qty) * shippingCostNum_(t.duty_rate) / 100;
  });
  return shippingCostRound_(total, 2);
}

// ============================================================
// 中外運 Sinotrans (CAR_SINOTRANS), CN → JP Air + Parcel.
// STATUS (2026-07-23): the carrier, its rate card (CRC-…), and its lead time (CLT-000017) are already
// ENTERED IN THE LIVE SHEET and ACTIVE — the live data is authoritative (see CARRIER_AND_ROUTE_SPEC
// "Provisioned Carriers"). This seed is now only an idempotent NO-OP FALLBACK: it skips the existing
// carrier + lead-time rows, never creates a rate card, never edits/deletes existing carrier data, and
// invents NO price. Do NOT use it to rebuild CRC-… / CLT-000017. Reuses the shared fcWrite* helpers.
// ============================================================

var CARRIERS_HEADERS_ = [
  'carrier_id', 'carrier_code', 'carrier_name', 'carrier_type', 'scac_code', 'default_currency',
  'contact_name', 'contact_email', 'contact_phone', 'website', 'is_active', 'note',
  'created_by', 'created_at', 'updated_by', 'updated_at'
];
var CARRIER_LEAD_TIMES_HEADERS_ = [
  'lead_time_id', 'carrier_id', 'origin_country', 'destination_country',
  'shipping_method', 'last_mile_delivery', 'min_days', 'max_days', 'avg_days',
  'created_at', 'updated_at'
];

// Next CLT-###### lead-time id (immutable global 6-digit sequence; business dims NOT encoded in the PK).
function carrierNextLeadTimeId_(s) {
  var iId = s.col('lead_time_id');
  var maxN = 0;
  if (iId !== -1) {
    for (var i = 1; i < s.rows.length; i++) {
      var m = String(s.rows[i][iId] || '').trim().match(/^CLT-(\d{1,})$/i);
      if (m) { var n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
    }
  }
  var next = maxN + 1;
  var padded = String(next);
  while (padded.length < 6) padded = '0' + padded;
  return 'CLT-' + padded;
}

/**
 * Idempotent one-time seed of CAR_SINOTRANS (CN→JP Air + Parcel). Body: {} (optional actor).
 * Creates the carrier row if absent, and the single CN→JP Air/Parcel lead time (5/8/7) if absent.
 * No rate card, no price. Safe to re-run (existing rows are skipped, not duplicated).
 */
function handleSeedSinotransCarrier_(body) {
  body = body || {};
  var actor = String(body.actor || 'carrier-provisioning').trim();
  var now = fcWriteTimestamp_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { carrier: 'skipped_exists', lead_time: 'skipped_exists', rate_card: 'not_created_no_price' };

  function up(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function lo(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  // ---- carriers ----
  var cSheet = fcWriteEnsureSheet_(ss, 'carriers', CARRIERS_HEADERS_);
  fcWriteEnsureColumns_(cSheet, CARRIERS_HEADERS_);
  var cs = fcWriteReadSheet_(cSheet);
  var iCid = cs.col('carrier_id');
  var carrierExists = false;
  if (iCid !== -1) {
    for (var i = 1; i < cs.rows.length; i++) { if (up(cs.rows[i][iCid]) === 'CAR_SINOTRANS') { carrierExists = true; break; } }
  }
  if (!carrierExists) {
    fcWriteAppendByHeader_(cSheet, {
      carrier_id: 'CAR_SINOTRANS', carrier_code: 'SINOTRANS', carrier_name: '中外運',
      carrier_type: '', scac_code: '', default_currency: 'RMB',
      contact_name: '', contact_email: '', contact_phone: '', website: '',
      is_active: 'TRUE',
      note: '中外運 Sinotrans — Active. CN(Shenzhen)→JP Air + Parcel (空派). Rate card + lead time (CLT-000017) live. Fallback-only seed; do not rebuild existing rows.',
      created_by: actor, created_at: now, updated_by: actor, updated_at: now
    });
    out.carrier = 'created';
  }

  // ---- carrier_lead_times (CN → JP, Air + Parcel; 5 / 8 / 7 calendar days) ----
  var lSheet = fcWriteEnsureSheet_(ss, 'carrier_lead_times', CARRIER_LEAD_TIMES_HEADERS_);
  fcWriteEnsureColumns_(lSheet, CARRIER_LEAD_TIMES_HEADERS_);
  var ls = fcWriteReadSheet_(lSheet);
  var iLCid = ls.col('carrier_id'), iOc = ls.col('origin_country'), iDc = ls.col('destination_country'),
      iSm = ls.col('shipping_method'), iLm = ls.col('last_mile_delivery');
  var ltExists = false;
  for (var j = 1; j < ls.rows.length; j++) {
    var r = ls.rows[j];
    if (up(r[iLCid]) === 'CAR_SINOTRANS' && up(r[iOc]) === 'CN' && up(r[iDc]) === 'JP' &&
        lo(r[iSm]) === 'air' && lo(r[iLm]) === 'parcel') { ltExists = true; break; }
  }
  if (!ltExists) {
    var leadTimeId = carrierNextLeadTimeId_(ls);
    fcWriteAppendByHeader_(lSheet, {
      lead_time_id: leadTimeId, carrier_id: 'CAR_SINOTRANS',
      origin_country: 'CN', destination_country: 'JP',
      shipping_method: 'Air', last_mile_delivery: 'Parcel',
      min_days: 5, max_days: 8, avg_days: 7,
      created_at: now, updated_at: now
    });
    out.lead_time = 'created';
    out.lead_time_id = leadTimeId;
  }

  return jsonResponse_({ success: true, data: out });
}
