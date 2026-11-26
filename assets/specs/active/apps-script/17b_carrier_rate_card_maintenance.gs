// Quick maintenance uses the existing importCarrierRateCards permission boundary.
// Add this module without replacing the installed 17_ pricing engine.
var CRC_QUICK_BUILD_VERSION_ = 'CRC-QUICK-V2-20261126';
function crcQuickVersion_(r) {
  var values=Object.keys(r).filter(function(k){return k!=='_row'&&k!=='rate_edit_version';}).sort().map(function(k){var v=r[k];
    if(Object.prototype.toString.call(v)==='[object Date]')v=isNaN(v.getTime())?'INVALID_DATE':v.toISOString();
    return [k,v==null?'':v];});
  return 'CRC1-'+Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(values),Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function crcQuickText_(v) { return String(v == null ? '' : v).trim(); }
function crcQuickMethod_(v) {
  var s = crcQuickText_(v).toLowerCase();
  return ({ 'sea express': 'sea_express', 'air freight': 'air' })[s] || s;
}
function crcQuickServiceKey_(r) {
  return JSON.stringify([crcQuickText_(r.carrier_id).toLowerCase(), crcQuickText_(r.origin_country).toUpperCase(),
    crcQuickText_(r.destination_country).toUpperCase(), crcQuickMethod_(r.shipping_method), crcQuickText_(r.last_mile_delivery).toLowerCase()]);
}
function crcQuickRateKey_(r) {
  var fields = ['origin_city', 'destination_city', 'destination_postal_code_start', 'destination_postal_code_end',
    'destination_warehouse_code', 'marketplace', 'charge_type', 'charge_unit', 'dim_divisor', 'min_box_weight',
    'min_box_weight_unit', 'weight_tier', 'weight_tier_unit', 'currency', 'transit_type', 'battery_type', 'customs_type',
    'import_duty_treatment', 'effective_from', 'effective_to'];
  return JSON.stringify([crcQuickServiceKey_(r)].concat(fields.map(function (f) { return crcQuickValue_(f, r[f]).toLowerCase(); })));
}
function crcQuickValue_(field, v) {
  if (v instanceof Date && /^effective_/.test(field)) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return crcQuickText_(v);
}
function crcQuickRead_(sh) {
  var values = sh.getDataRange().getValues(), headers = values[0].map(crcQuickText_);
  return { headers: headers, rows: values.slice(1).map(function (row, i) {
    var out = { _row: i + 2 }; headers.forEach(function (h, j) { out[h] = row[j]; }); return out;
  }) };
}
function crcQuickValidate_(r) {
  var required = ['carrier_id', 'origin_country', 'destination_country', 'shipping_method', 'last_mile_delivery',
    'shipping_method_label', 'charge_type', 'charge_unit', 'currency', 'unit_rate', 'effective_from', 'status'];
  required.forEach(function (k) { if (crcQuickText_(r[k]) === '') throw Error('REQUIRED:' + k); });
  if (!/^[A-Z]{2}$/.test(r.origin_country) || !/^[A-Z]{2}$/.test(r.destination_country)) throw Error('COUNTRY_INVALID');
  if (['sea', 'sea_express', 'air', 'express', 'truck', 'rail', 'ground', 'ocean', 'courier'].indexOf(r.shipping_method) < 0) throw Error('METHOD_INVALID');
  if (['parcel', 'truck', 'ups', 'fedex', 'dhl', 'ltl', 'ftl', 'spd', 'self_pickup', 'none'].indexOf(r.last_mile_delivery) < 0) throw Error('LAST_MILE_INVALID');
  if (['weight', 'volume', 'container', 'shipment', 'carton'].indexOf(r.charge_type) < 0 || ['kg', 'lb', 'cbm', '20gp', '40hq', 'shipment', 'carton'].indexOf(r.charge_unit) < 0) throw Error('CHARGE_BASIS_INVALID');
  var units = { weight: ['kg', 'lb'], volume: ['cbm'], container: ['20gp', '40hq'], shipment: ['shipment'], carton: ['carton'] };
  if (units[r.charge_type].indexOf(r.charge_unit) < 0) throw Error('CHARGE_BASIS_INVALID');
  ['min_box_weight_unit', 'weight_tier_unit'].forEach(function (k) { if (r[k] && ['kg', 'lb'].indexOf(r[k]) < 0) throw Error('WEIGHT_UNIT_INVALID'); });
  if (!/^[A-Z]{3}$/.test(r.currency) || ['active', 'inactive'].indexOf(r.status) < 0) throw Error('RATE_ENUM_INVALID');
  if (r.customs_type && ['third_party_customs', 'formal_customs', 'tax_refund_customs'].indexOf(r.customs_type) < 0) throw Error('CUSTOMS_INVALID');
  if (r.battery_type && ['no_battery', 'alkaline_battery', 'lithium_battery'].indexOf(r.battery_type) < 0) throw Error('BATTERY_INVALID');
  if (r.import_duty_treatment && ['included_in_rate', 'excluded_in_rate'].indexOf(r.import_duty_treatment) < 0) throw Error('DUTY_INVALID');
  ['unit_rate', 'dim_divisor', 'min_box_weight', 'weight_tier', 'min_charge', 'fuel_surcharge', 'customs_fee', 'doc_fee'].forEach(function (k) {
    if (crcQuickText_(r[k]) === '') return;
    if (!isFinite(Number(r[k])) || Number(r[k]) < 0 || (k === 'dim_divisor' && Number(r[k]) === 0)) throw Error('NUMBER_INVALID:' + k);
    r[k] = Number(r[k]);
  });
  ['effective_from', 'effective_to'].forEach(function (k) {
    if (!r[k] && k === 'effective_to') return;
    var s = crcQuickText_(r[k]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw Error('DATE_INVALID:' + k);
  });
  if (r.effective_to && r.effective_to < r.effective_from) throw Error('DATE_RANGE_INVALID');
  if (r.destination_postal_code_start && r.destination_postal_code_end && r.destination_postal_code_start > r.destination_postal_code_end) throw Error('POSTAL_RANGE_INVALID');
  Object.keys(r).forEach(function (k) { if (typeof r[k] === 'string' && /^[=+@]/.test(r[k])) throw Error('FORMULA_NOT_ALLOWED:' + k); });
}
function handleCarrierRateCardsQuick_(body) {
  var fail = function (code, extra) { var zero = !extra || extra.zero_write !== false; return jsonResponse_(Object.assign({ success: false, code: code, error: code, data: { zero_write: zero }, zero_write: zero }, extra || {})); };
  if (!body || !Array.isArray(body.quick_rows) || !body.quick_rows.length || body.quick_rows.length > 100) return fail('ROWS_REQUIRED_MAX_100');
  if (!/^[A-Za-z0-9-]{8,100}$/.test(crcQuickText_(body.request_id))) return fail('REQUEST_ID_REQUIRED');
  if (body.mode !== 'quick_maintenance' || body.quick_edit !== true) return fail('QUICK_MAINTENANCE_ENVELOPE_REQUIRED');
  var mode = body.maintenance_mode;
  if (['update', 'new_service', 'add_rate'].indexOf(mode) < 0 || (mode !== 'update' && body.quick_rows.length !== 1)) return fail('MODE_INVALID');
  var lock = LockService.getScriptLock(), attempted = false;
  if (!lock.tryLock(30000)) return fail('LOCK_TIMEOUT');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('carrier_rate_cards'), cs = ss.getSheetByName('carriers');
    if (!sh || !cs) return fail('REFERENCE_TABLE_REQUIRED');
    var table = crcQuickRead_(sh), h = table.headers, existing = table.rows, changes = [], ids = {};
    var cols = ['rate_card_id', 'updated_at', 'created_at', 'import_batch_id', 'source_file_name', 'unit_rate'];
    if (cols.some(function (k) { return h.indexOf(k) < 0; })) return fail('CARRIER_RATE_COLUMNS_MISSING');
    var carriers = crcQuickRead_(cs).rows;
    body.quick_rows.forEach(function (input) {
      var id = crcQuickText_(input.rate_card_id);
      if (!id || ids[id]) throw Error('RATE_CARD_ID_REQUIRED_OR_DUPLICATED'); ids[id] = true;
      var hit = existing.filter(function (r) { return crcQuickText_(r.rate_card_id) === id; });
      if (hit.length > 1) throw Error('RATE_CARD_ID_DUPLICATED');
      var next;
      if (mode === 'update') {
        if (hit.length !== 1) throw Error('RATE_CARD_NOT_FOUND');
        if (!crcQuickText_(input.expected_version) && !crcQuickText_(input.expected_updated_at)) throw Error('EXPECTED_UPDATED_AT_REQUIRED');
        var same = input.expected_version ? /^CRC1-[a-f0-9]{64}$/.test(input.expected_version) && crcQuickVersion_(hit[0])===input.expected_version :
          typeof editTokSame_ === 'function' ? editTokSame_(hit[0].updated_at, input.expected_updated_at) === 'SAME' : crcQuickText_(hit[0].updated_at) === crcQuickText_(input.expected_updated_at);
        if (!same) throw Error('EDIT_CONFLICT');
        if (Object.keys(input).some(function (k) { return ['rate_card_id', 'expected_updated_at', 'expected_version', 'unit_rate'].indexOf(k) < 0; })) throw Error('FIELD_LOCKED');
        if (crcQuickText_(input.unit_rate) === '' || !isFinite(Number(input.unit_rate)) || Number(input.unit_rate) < 0) throw Error('NUMBER_INVALID:unit_rate');
        next = Object.assign({}, hit[0], { unit_rate: Number(input.unit_rate) });
      } else {
        if (!/^CRC-Q-[A-Za-z0-9-]{8,80}$/.test(id)) throw Error('CREATE_ID_INVALID');
        next = {}; h.forEach(function (k) { next[k] = ''; });
        Object.keys(input).forEach(function (k) {
          if (h.indexOf(k) < 0 || ['created_at', 'updated_at', 'import_batch_id', 'source_file_name'].indexOf(k) >= 0) throw Error('FIELD_LOCKED:' + k);
          next[k] = crcQuickText_(input[k]);
        });
        next.origin_country = next.origin_country.toUpperCase(); next.destination_country = next.destination_country.toUpperCase();
        next.currency = next.currency.toUpperCase(); next.shipping_method = crcQuickMethod_(next.shipping_method); next.last_mile_delivery = next.last_mile_delivery.toLowerCase();
        crcQuickValidate_(next);
        var car = carriers.filter(function (c) { return crcQuickText_(c.carrier_id) === next.carrier_id && !/^(inactive|disabled|false|0)$/i.test(crcQuickText_(c.status || c.is_active)); });
        if (car.length !== 1) throw Error('ACTIVE_CARRIER_REQUIRED');
        if (hit.length) {
          if (hit[0].import_batch_id === body.request_id && Object.keys(input).every(function (k) { return crcQuickValue_(k, hit[0][k]) === crcQuickValue_(k, next[k]); })) {
            changes.push({ row: hit[0], reused: true }); return;
          }
          throw Error('RATE_CARD_ID_EXISTS');
        }
        var sameService = existing.filter(function (r) { return crcQuickServiceKey_(r) === crcQuickServiceKey_(next); });
        if (mode === 'new_service' && sameService.length) throw Error('SERVICE_ALREADY_EXISTS');
        if (mode === 'add_rate' && !sameService.length) throw Error('SERVICE_NOT_FOUND');
        if (sameService.some(function (r) { return crcQuickRateKey_(r) === crcQuickRateKey_(next); })) throw Error('RATE_ALREADY_EXISTS');
      }
      var stamp = typeof editNextStamp_ === 'function' ? editNextStamp_(procurementTimestamp_(), hit.length ? [hit[0].updated_at] : []) : new Date().toISOString();
      next.updated_at = stamp; if (!hit.length) next.created_at = stamp;
      next.import_batch_id = body.request_id; next.source_file_name = 'Quick maintenance';
      changes.push({ row: next, target: hit.length ? hit[0]._row : 0 });
    });
    // All validation precedes the first write. Only price and audit cells change on updates.
    changes.forEach(function (change) {
      if (change.reused) return;
      var r = change.row;
      attempted = true;
      if (change.target) ['unit_rate', 'updated_at', 'import_batch_id', 'source_file_name'].forEach(function (k) { sh.getRange(change.target, h.indexOf(k) + 1).setValue(r[k]); });
      else sh.appendRow(h.map(function (k) { return r[k] == null ? '' : r[k]; }));
    });
    SpreadsheetApp.flush();
    var after = crcQuickRead_(sh).rows, receipts = [];
    changes.forEach(function (change) {
      var matches = after.filter(function (r) { return r.rate_card_id === change.row.rate_card_id; });
      if (matches.length !== 1 || Number(matches[0].unit_rate) !== Number(change.row.unit_rate) || matches[0].import_batch_id !== body.request_id) throw Error('READBACK_MISMATCH');
      receipts.push({ rate_card_id: matches[0].rate_card_id, unit_rate: matches[0].unit_rate, rate_edit_version:crcQuickVersion_(matches[0]),updated_at: typeof editTok_ === 'function' ? editTok_(matches[0].updated_at) : crcQuickText_(matches[0].updated_at) });
    });
    return jsonResponse_({ success: true, data: { verified: true, rows: receipts, request_id: body.request_id } });
  } catch (e) { return fail(attempted ? 'RATE_MAINTENANCE_OUTCOME_UNKNOWN' : e.message, { zero_write: !attempted }); }
  finally { lock.releaseLock(); }
}
