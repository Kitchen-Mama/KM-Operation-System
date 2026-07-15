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

// Canonical carrier_rate_cards header (v1.4 — NO transit_days; Lead Time lives in carrier_lead_times).
var CARRIER_RATE_CARDS_HEADERS_ = [
  'rate_card_id', 'carrier_id', 'origin_country', 'origin_city', 'destination_country', 'destination_city',
  'destination_postal_code_start', 'destination_postal_code_end', 'destination_warehouse_code',
  'marketplace', 'shipping_method', 'last_mile_delivery', 'shipping_method_label', 'charge_type', 'charge_unit', 'dim_divisor',
  'min_box_weight', 'min_box_weight_unit', 'weight_tier', 'weight_tier_unit',
  'currency', 'unit_rate', 'min_charge', 'fuel_surcharge', 'customs_fee', 'doc_fee',
  'transit_type', 'battery_type', 'customs_type', 'customs_type_label', 'note',
  'effective_from', 'effective_to', 'status', 'source_file_name', 'import_batch_id',
  'created_at', 'updated_at'
];

// Enums (v1.4). Lowercased for validation.
var CRC_CHARGE_TYPES_ = { weight: 1, volume: 1, container: 1, shipment: 1, carton: 1 };
var CRC_CHARGE_UNITS_ = { kg: 1, lb: 1, cbm: 1, '20gp': 1, '40hq': 1, shipment: 1, carton: 1 };
var CRC_STATUSES_ = { active: 1, inactive: 1 };
// Columns that MUST NOT appear in a Carrier Rate Template (Lead Time is maintained separately).
var CRC_FORBIDDEN_COLS_ = ['transit_days', 'min_days', 'max_days', 'avg_days', 'lead_time_id'];

// Update-Template EDITABLE fields on EXISTING rows (everything else stored is LOCKED).
// NOTE: min_charge is editable per the Carrier Update UI task (Part C/D) — extends §4C.3A (which had it
// locked); keep the Update template's editable set and this list in sync.
var CRC_UPDATE_EDITABLE_ = { unit_rate: 1, min_charge: 1, effective_from: 1, effective_to: 1, fuel_surcharge: 1, customs_fee: 1, doc_fee: 1, status: 1, note: 1 };
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
