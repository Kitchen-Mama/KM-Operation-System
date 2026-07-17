// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 19_tax_handlers.gs — Tax & Referral Rate Master V2 (parent + component)
// NOTE: All .gs files share ONE global scope. Copy them into the project TOGETHER. No imports.
// Implements TAX_AND_REFERRAL_RATES_SPEC.md V2 (SSOT).
//   - handleUpsertTaxReferralRate_ : create/update ONE tax_referral_rates row (parent).
//       * correction  = update existing row by tax_rate_id (preserve omitted, preserve created_at + id)
//       * new version = create a new row (new effective_from, new tax_rate_id, prior row preserved)
//   - handleUpsertTaxRateComponent_ : create/update ONE tax_rate_components row (child);
//       requires a valid parent tax_rate_id.
// Reuses shared global helpers: procurementEnsureSheet_ / procurementAppendByHeader_ /
//   procurementTimestamp_ / procurementToday_ / sheetEnsureColumns_.
// Rate convention: WHOLE-NUMBER PERCENT (25 = 25%) — see spec §7. NO engine / NO calculation here.
// ============================================================

// Canonical V2 headers (finalized physical columns — do NOT reintroduce extra_tax_rate/vat/port_tax/status).
var TAX_REFERRAL_RATES_HEADERS_ = [
  'tax_rate_id', 'series', 'country_of_origin', 'duty_country', 'hscode',
  'duty_rate', 'vat_no', 'vat_rate', 'eori_no', 'port_tax_rate', 'referral_fee_rate',
  'declared_value', 'declared_currency', 'effective_from', 'effective_to', 'note',
  'created_at', 'updated_at'
];

var TAX_RATE_COMPONENTS_HEADERS_ = [
  'tax_component_id', 'tax_rate_id', 'component_type', 'component_code', 'component_name',
  'rate_type', 'rate_value', 'amount_per_unit', 'amount_currency', 'quantity_unit',
  'effective_from', 'effective_to', 'source_url', 'note', 'created_at', 'updated_at'
];

// Fields a partial parent update MAY set (identity/key handled separately; created_at/id preserved).
var TAX_RATE_EDITABLE_FIELDS_ = [
  'series', 'country_of_origin', 'duty_country', 'hscode', 'duty_rate', 'vat_no', 'vat_rate',
  'eori_no', 'port_tax_rate', 'referral_fee_rate', 'declared_value', 'declared_currency',
  'effective_from', 'effective_to', 'note'
];
var TAX_COMPONENT_EDITABLE_FIELDS_ = [
  'component_type', 'component_code', 'component_name', 'rate_type', 'rate_value',
  'amount_per_unit', 'amount_currency', 'quantity_unit', 'effective_from', 'effective_to',
  'source_url', 'note'
];
var TAX_COMPONENT_RATE_TYPES_ = { percentage: 1, amount_per_unit: 1, fixed_amount: 1 };

function taxNorm_(v) { return String(v == null ? '' : v).trim(); }
function taxUpper_(v) { return taxNorm_(v).toUpperCase(); }
// ISO alpha-2 normalization: uppercase; when a nonblank value is not exactly 2 letters it is kept
// (uppercased) so the row still saves — the migration audit (spec §13) flags invalid codes separately.
function taxIso2_(v) { return taxUpper_(v); }
// Numeric normalize: blank stays blank (nullable); otherwise parsed number (invalid → blank).
function taxNum_(v) {
  var s = taxNorm_(v);
  if (s === '') return '';
  var n = parseFloat(s);
  return isNaN(n) ? '' : n;
}

// Normalize a date to yyyy-MM-dd. Blank stays blank (open-ended is valid). Returns null when a
// NONBLANK value cannot be parsed (caller raises a real validation error — never a false "invalid").
function taxDate_(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = taxNorm_(v).replace(/\//g, '-');
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    var mm = ('0' + m[2]).slice(-2), dd = ('0' + m[3]).slice(-2);
    return m[1] + '-' + mm + '-' + dd;
  }
  var t = new Date(s);
  if (!isNaN(t.getTime())) return Utilities.formatDate(t, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return null;   // sentinel: nonblank + unparseable
}

// Compact yyyyMMdd (for the ID). Assumes an already-normalized yyyy-MM-dd; blank → ''.
function taxCompactDate_(normDate) { return taxNorm_(normDate).replace(/-/g, ''); }

// active-date rule (spec §4): from <= target AND (to blank OR to >= target). Blank `from` → treat as
// always-started. Dates compared as yyyy-MM-dd strings (lexicographic works for a fixed format).
function taxActiveOn_(effFrom, effTo, target) {
  var f = taxNorm_(effFrom), t = taxNorm_(effTo), d = taxNorm_(target);
  if (!d) return true;                 // no target → do not date-filter
  if (f && f > d) return false;
  if (t && t < d) return false;
  return true;
}

// Read a sheet into { sheet, headers(lowercased), data, col(name) }. Missing tab → null.
function taxReadSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  var headers = (data[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  return { sheet: sh, headers: headers, data: data, col: function (n) { return headers.indexOf(n); } };
}

// Parent business key (spec §5.1): series + country_of_origin + duty_country (UPPERCASE-normalized).
function taxParentKey_(series, origin, duty) {
  return taxUpper_(series) + '||' + taxIso2_(origin) + '||' + taxIso2_(duty);
}

// Compute the next version number (V{NN}) for a business key + effective_from among existing rows.
// Also returns any overlapping rows (same business key, blank OR range-overlapping effective window).
function taxParentScan_(ss, series, origin, duty, effFrom, effTo) {
  var out = { nextVersion: 1, sameKeyRows: [], openEndedRows: [], overlaps: [] };
  var s = taxReadSheet_(ss, 'tax_referral_rates');
  if (!s || s.data.length < 2) return out;
  var cId = s.col('tax_rate_id'), cSe = s.col('series'), cO = s.col('country_of_origin'),
      cD = s.col('duty_country'), cF = s.col('effective_from'), cT = s.col('effective_to');
  if (cSe === -1 || cD === -1) return out;
  var key = taxParentKey_(series, origin, duty);
  var maxV = 0;
  for (var i = 1; i < s.data.length; i++) {
    var rowKey = taxParentKey_(s.data[i][cSe], cO !== -1 ? s.data[i][cO] : '', s.data[i][cD]);
    if (rowKey !== key) continue;
    var rid = cId !== -1 ? taxNorm_(s.data[i][cId]) : '';
    var rF = cF !== -1 ? taxDateCell_(s.data[i][cF]) : '';
    var rT = cT !== -1 ? taxDateCell_(s.data[i][cT]) : '';
    out.sameKeyRows.push({ rowIndex: i + 1, taxRateId: rid, effFrom: rF, effTo: rT });
    if (!rT) out.openEndedRows.push({ rowIndex: i + 1, taxRateId: rid, effFrom: rF });
    // version parse from a matching-effective_from id suffix (…-V{NN})
    if (rF === taxNorm_(effFrom)) {
      var mv = rid.match(/V(\d{1,3})$/i);
      if (mv) { var vnum = parseInt(mv[1], 10); if (vnum > maxV) maxV = vnum; }
    }
    if (taxRangesOverlap_(rF, rT, taxNorm_(effFrom), taxNorm_(effTo))) {
      out.overlaps.push({ taxRateId: rid, effFrom: rF, effTo: rT });
    }
  }
  out.nextVersion = maxV + 1;
  return out;
}

// Best-effort cell → yyyy-MM-dd (Date or string). Blank → ''. (Reader side; never throws.)
function taxDateCell_(v) { var d = taxDate_(v); return d == null ? taxNorm_(v) : d; }

// Two inclusive ranges overlap? Blank end = open-ended (+infinity); blank start = -infinity.
function taxRangesOverlap_(aF, aT, bF, bT) {
  var af = aF || '0000-00-00', at = aT || '9999-12-31';
  var bf = bF || '0000-00-00', bt = bT || '9999-12-31';
  return af <= bt && bf <= at;
}

// ---------------------------------------------------------------
// handleUpsertTaxReferralRate_ — parent rate create/update (spec §9/§12)
// Body:
//   { tax_rate_id?, series, country_of_origin, duty_country, hscode?, duty_rate?, vat_no?, vat_rate?,
//     eori_no?, port_tax_rate?, referral_fee_rate?, declared_value?, declared_currency?,
//     effective_from, effective_to?, note?,
//     create_version? (bool), close_previous? (bool) }
// Update mode  : tax_rate_id present AND found → update that row (preserve omitted / created_at / id).
// Version mode : create_version truthy OR no tax_rate_id → create a NEW row with a generated id.
// Returns { tax_rate_id, updated, created, version, warnings, previous_closed }.
// ---------------------------------------------------------------
function handleUpsertTaxReferralRate_(body) {
  body = body || {};
  var series = taxUpper_(body.series);
  var origin = taxIso2_(body.country_of_origin);
  var duty = taxIso2_(body.duty_country);

  // --- normalize + validate dates up front (blank effective_to is VALID) ---
  var effFrom = taxDate_(body.effective_from);
  var effTo = taxDate_(body.effective_to);
  if (effFrom === null) return jsonResponse_({ success: false, error: 'effective_from is not a valid date' });
  if (effTo === null) return jsonResponse_({ success: false, error: 'effective_to is not a valid date' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'tax_referral_rates', TAX_REFERRAL_RATES_HEADERS_);
  sheetEnsureColumns_(sh, TAX_REFERRAL_RATES_HEADERS_);   // additive only (never removes retired cols)
  var now = procurementTimestamp_();
  var warnings = [];

  // Build the normalized value map from provided fields (only keys present in body are considered).
  function normField(k, v) {
    if (k === 'series') return taxUpper_(v);
    if (k === 'country_of_origin' || k === 'duty_country') return taxIso2_(v);
    if (k === 'declared_currency') return taxUpper_(v);
    if (k === 'effective_from') return effFrom;
    if (k === 'effective_to') return effTo;
    if (k === 'duty_rate' || k === 'vat_rate' || k === 'port_tax_rate' || k === 'referral_fee_rate' || k === 'declared_value') return taxNum_(v);
    return taxNorm_(v);
  }

  var existing = taxRateFindById_(ss, body.tax_rate_id);
  var wantVersion = !!body.create_version;

  // ---------- UPDATE (correction within the same version) ----------
  if (existing && !wantVersion) {
    TAX_RATE_EDITABLE_FIELDS_.forEach(function (k) {
      if (body[k] === undefined) return;                 // preserve omitted
      var c = existing.col(k);
      if (c !== -1) existing.sheet.getRange(existing.rowIndex, c + 1).setValue(normField(k, body[k]));
    });
    var cU = existing.col('updated_at');
    if (cU !== -1) existing.sheet.getRange(existing.rowIndex, cU + 1).setValue(now);
    return jsonResponse_({ success: true, data: { tax_rate_id: existing.taxRateId, updated: true, created: false, warnings: warnings } });
  }

  // ---------- CREATE (new effective version) ----------
  if (!series) return jsonResponse_({ success: false, error: 'Missing series' });
  if (!duty) return jsonResponse_({ success: false, error: 'Missing duty_country' });
  if (!origin) return jsonResponse_({ success: false, error: 'Missing country_of_origin' });
  if (!effFrom) return jsonResponse_({ success: false, error: 'Missing effective_from' });

  var scan = taxParentScan_(ss, series, origin, duty, effFrom, effTo);
  if (scan.overlaps.length) {
    warnings.push('Overlapping effective period for ' + series + '/' + origin + '/' + duty +
      ' — existing: ' + scan.overlaps.map(function (o) { return (o.taxRateId || '?') + ' [' + (o.effFrom || '') + '..' + (o.effTo || '') + ']'; }).join(', '));
  }

  var version = scan.nextVersion;
  var vStr = 'V' + ('0' + version).slice(-2);
  var taxRateId = 'TRR-' + series + '-' + duty + '-' + origin + '-' + taxCompactDate_(effFrom) + '-' + vStr;
  if (taxRateFindById_(ss, taxRateId)) {
    return jsonResponse_({ success: false, error: 'Duplicate tax_rate_id would be created: ' + taxRateId + ' (adjust effective_from / version)' });
  }

  // Optional: auto-close a single open-ended prior row when the user confirms (spec §12).
  var previousClosed = '';
  if (body.close_previous && scan.openEndedRows.length) {
    var s2 = taxReadSheet_(ss, 'tax_referral_rates');
    var cT2 = s2.col('effective_to'), cU2 = s2.col('updated_at');
    var prevDay = taxDayMinusOne_(effFrom);
    // close only genuine predecessors (effective_from strictly before the new one)
    scan.openEndedRows.forEach(function (r) {
      if (r.taxRateId === taxRateId) return;
      if (r.effFrom && r.effFrom >= effFrom) return;
      if (cT2 !== -1) s2.sheet.getRange(r.rowIndex, cT2 + 1).setValue(prevDay);
      if (cU2 !== -1) s2.sheet.getRange(r.rowIndex, cU2 + 1).setValue(now);
      previousClosed = r.taxRateId || previousClosed;
    });
  }

  var rec = {
    tax_rate_id: taxRateId, series: series, country_of_origin: origin, duty_country: duty,
    hscode: taxNorm_(body.hscode),
    duty_rate: taxNum_(body.duty_rate), vat_no: taxNorm_(body.vat_no), vat_rate: taxNum_(body.vat_rate),
    eori_no: taxNorm_(body.eori_no), port_tax_rate: taxNum_(body.port_tax_rate),
    referral_fee_rate: taxNum_(body.referral_fee_rate), declared_value: taxNum_(body.declared_value),
    declared_currency: taxUpper_(body.declared_currency), effective_from: effFrom, effective_to: effTo,
    note: taxNorm_(body.note), created_at: now, updated_at: now
  };
  procurementAppendByHeader_(sh, rec);
  return jsonResponse_({ success: true, data: { tax_rate_id: taxRateId, updated: false, created: true, version: version, previous_closed: previousClosed, warnings: warnings } });
}

// yyyy-MM-dd minus one day. Blank → ''.
function taxDayMinusOne_(normDate) {
  var s = taxNorm_(normDate);
  if (!s) return '';
  var p = s.split('-');
  if (p.length !== 3) return '';
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  d.setDate(d.getDate() - 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Locate a parent row by tax_rate_id. Returns { sheet, rowIndex, col(name), taxRateId } or null.
function taxRateFindById_(ss, taxRateId) {
  var id = taxNorm_(taxRateId);
  if (!id) return null;
  var s = taxReadSheet_(ss, 'tax_referral_rates');
  if (!s || s.data.length < 2) return null;
  var cId = s.col('tax_rate_id');
  if (cId === -1) return null;
  for (var i = 1; i < s.data.length; i++) {
    if (taxNorm_(s.data[i][cId]) === id) {
      return { sheet: s.sheet, rowIndex: i + 1, col: s.col, taxRateId: id };
    }
  }
  return null;
}

// ---------------------------------------------------------------
// handleUpsertTaxRateComponent_ — child component create/update (spec §6/§12)
// Body:
//   { tax_component_id?, tax_rate_id, component_type, component_code, component_name?, rate_type,
//     rate_value?, amount_per_unit?, amount_currency?, quantity_unit?, effective_from?, effective_to?,
//     source_url?, note? }
// The parent tax_rate_id MUST exist. Returns { tax_component_id, updated, created, warnings }.
// ---------------------------------------------------------------
function handleUpsertTaxRateComponent_(body) {
  body = body || {};
  var parentId = taxNorm_(body.tax_rate_id);
  if (!parentId) return jsonResponse_({ success: false, error: 'Missing tax_rate_id (component parent)' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Validate the parent exists BEFORE writing (no orphan components — spec §B).
  var parent = taxRateFindById_(ss, parentId);
  if (!parent) return jsonResponse_({ success: false, error: 'Parent tax_rate_id not found: ' + parentId });

  var effFrom = taxDate_(body.effective_from);
  var effTo = taxDate_(body.effective_to);
  if (effFrom === null) return jsonResponse_({ success: false, error: 'effective_from is not a valid date' });
  if (effTo === null) return jsonResponse_({ success: false, error: 'effective_to is not a valid date' });

  var rateType = taxNorm_(body.rate_type).toLowerCase();
  if (rateType && !TAX_COMPONENT_RATE_TYPES_[rateType]) {
    return jsonResponse_({ success: false, error: 'Invalid rate_type: ' + body.rate_type + ' (percentage / amount_per_unit / fixed_amount)' });
  }

  var sh = procurementEnsureSheet_(ss, 'tax_rate_components', TAX_RATE_COMPONENTS_HEADERS_);
  sheetEnsureColumns_(sh, TAX_RATE_COMPONENTS_HEADERS_);
  var now = procurementTimestamp_();
  var warnings = [];

  function normCompField(k, v) {
    if (k === 'component_code') return taxUpper_(v);
    if (k === 'rate_type') return taxNorm_(v).toLowerCase();
    if (k === 'amount_currency') return taxUpper_(v);
    if (k === 'effective_from') return effFrom;
    if (k === 'effective_to') return effTo;
    if (k === 'rate_value' || k === 'amount_per_unit') return taxNum_(v);
    return taxNorm_(v);
  }

  // UPDATE by component id.
  var existing = taxComponentFindById_(ss, body.tax_component_id);
  if (existing) {
    // Reparenting is not allowed silently — keep the component under its stored parent.
    TAX_COMPONENT_EDITABLE_FIELDS_.forEach(function (k) {
      if (body[k] === undefined) return;
      var c = existing.col(k);
      if (c !== -1) existing.sheet.getRange(existing.rowIndex, c + 1).setValue(normCompField(k, body[k]));
    });
    var cU = existing.col('updated_at');
    if (cU !== -1) existing.sheet.getRange(existing.rowIndex, cU + 1).setValue(now);
    return jsonResponse_({ success: true, data: { tax_component_id: existing.taxComponentId, updated: true, created: false, warnings: warnings } });
  }

  // CREATE — generate a stable id: TRC-{parent-suffix}-{CODE}-V{NN}.
  var code = taxUpper_(body.component_code);
  if (!code) return jsonResponse_({ success: false, error: 'Missing component_code' });
  var suffix = parentId.replace(/^TRR-/, '').replace(/-V\d{1,3}$/i, '');
  var version = taxComponentNextVersion_(ss, parentId, code);
  var vStr = 'V' + ('0' + version).slice(-2);
  var componentId = 'TRC-' + suffix + '-' + code + '-' + vStr;
  if (taxComponentFindById_(ss, componentId)) {
    return jsonResponse_({ success: false, error: 'Duplicate tax_component_id would be created: ' + componentId });
  }

  var rec = {
    tax_component_id: componentId, tax_rate_id: parentId,
    component_type: taxNorm_(body.component_type), component_code: code,
    component_name: taxNorm_(body.component_name), rate_type: rateType,
    rate_value: taxNum_(body.rate_value), amount_per_unit: taxNum_(body.amount_per_unit),
    amount_currency: taxUpper_(body.amount_currency), quantity_unit: taxNorm_(body.quantity_unit),
    effective_from: effFrom, effective_to: effTo, source_url: taxNorm_(body.source_url),
    note: taxNorm_(body.note), created_at: now, updated_at: now
  };
  procurementAppendByHeader_(sh, rec);
  return jsonResponse_({ success: true, data: { tax_component_id: componentId, updated: false, created: true, warnings: warnings } });
}

// Locate a component row by tax_component_id. Returns { sheet, rowIndex, col, taxComponentId } or null.
function taxComponentFindById_(ss, componentId) {
  var id = taxNorm_(componentId);
  if (!id) return null;
  var s = taxReadSheet_(ss, 'tax_rate_components');
  if (!s || s.data.length < 2) return null;
  var cId = s.col('tax_component_id');
  if (cId === -1) return null;
  for (var i = 1; i < s.data.length; i++) {
    if (taxNorm_(s.data[i][cId]) === id) {
      return { sheet: s.sheet, rowIndex: i + 1, col: s.col, taxComponentId: id };
    }
  }
  return null;
}

// Next V{NN} for a (parent, component_code) pair (component versioning — spec §12).
function taxComponentNextVersion_(ss, parentId, code) {
  var s = taxReadSheet_(ss, 'tax_rate_components');
  if (!s || s.data.length < 2) return 1;
  var cP = s.col('tax_rate_id'), cC = s.col('component_code'), cId = s.col('tax_component_id');
  if (cP === -1) return 1;
  var maxV = 0;
  for (var i = 1; i < s.data.length; i++) {
    if (taxNorm_(s.data[i][cP]) !== taxNorm_(parentId)) continue;
    if (cC !== -1 && taxUpper_(s.data[i][cC]) !== taxUpper_(code)) continue;
    var rid = cId !== -1 ? taxNorm_(s.data[i][cId]) : '';
    var mv = rid.match(/V(\d{1,3})$/i);
    if (mv) { var vnum = parseInt(mv[1], 10); if (vnum > maxV) maxV = vnum; }
  }
  return maxV + 1;
}
