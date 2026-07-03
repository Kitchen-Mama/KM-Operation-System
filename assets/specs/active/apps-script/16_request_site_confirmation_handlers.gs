// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 16_request_site_confirmation_handlers.gs — Request Order Site Confirmation persistence
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md §3.5 / §12.10.
//   - upsertRequestOrderSiteConfirmations : batch create/update site-confirmation records.
//     Upsert key = planning_cycle + company + country + marketplace + series + bucket
//     (same scope+bucket → UPDATE in place, never duplicate).
// Confirm Site ONLY records approval state — it does NOT create request_orders and does NOT
// reserve / deduct stock (guardrail). Send Request (13_) is the layer that creates request_orders.
// Reuses procurement* helpers (procurementEnsureSheet_/procurementAppendByHeader_/procurementTimestamp_)
// from the shared global scope. Table auto-creates with the documented header (missing-header safe).
// ============================================================

var REQUEST_ORDER_SITE_CONFIRMATIONS_HEADERS_ = [
  'site_confirmation_id', 'planning_cycle', 'company', 'country', 'marketplace', 'series', 'bucket',
  'status', 'confirmed_by', 'confirmed_at', 'note', 'created_at', 'updated_at'
];

var RSC_STATUSES_ = { pending: 1, confirmed: 1, cancelled: 1 };

// Composite upsert key. Two confirmations with the same cycle+company+country+marketplace+series+bucket
// are the SAME record (update instead of duplicate).
var RSC_KEY_COLS_ = ['planning_cycle', 'company', 'country', 'marketplace', 'series', 'bucket'];

// ---- upsertRequestOrderSiteConfirmations --------------------------
/**
 * Batch upsert site-confirmation records. Body:
 *   { confirmations: [ { planning_cycle, company, country, marketplace, series, bucket,
 *                        status?, note? } ], confirmed_by? }
 * status defaults to `confirmed` (must be pending/confirmed/cancelled). Each record upserts by
 * RSC_KEY_COLS_. Returns { upserted, updated, created }.
 * Does NOT create request_orders (Confirm Site ≠ Send Request — spec §12.10).
 */
function handleUpsertRequestOrderSiteConfirmations_(body) {
  var list = (body && body.confirmations) || [];
  if (!list.length) return jsonResponse_({ success: false, error: 'confirmations required' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'request_order_site_confirmations', REQUEST_ORDER_SITE_CONFIRMATIONS_HEADERS_);
  var now = procurementTimestamp_();
  var actor = String((body && body.confirmed_by) || 'request-order').trim();

  // Index existing rows by composite key for upsert (sheet row = dataIdx + 2; header is row 1).
  var data = sh.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  function ci(name) { return headers.indexOf(name); }
  function keyOf(getVal) { return RSC_KEY_COLS_.map(function (c) { return String(getVal(c) || '').trim(); }).join('||'); }

  var idx = {};   // key -> 1-based sheet row
  for (var i = 1; i < data.length; i++) {
    var k = keyOf(function (c) { var p = ci(c); return p === -1 ? '' : data[i][p]; });
    if (k) idx[k] = i + 1;
  }

  var created = 0, updated = 0;
  for (var j = 0; j < list.length; j++) {
    var r = list[j] || {};
    var status = String(r.status || 'confirmed').trim();
    if (!RSC_STATUSES_[status]) status = 'confirmed';
    var rec = {
      planning_cycle: String(r.planning_cycle || '').trim(),
      company: String(r.company || '').trim(),
      country: String(r.country || '').trim(),
      marketplace: String(r.marketplace || '').trim(),
      series: String(r.series || '').trim(),
      bucket: String(r.bucket || '').trim()
    };
    var key = keyOf(function (c) { return rec[c]; });

    if (idx[key]) {
      var row = idx[key];
      function setCol(name, val) { var c = ci(name); if (c !== -1) sh.getRange(row, c + 1).setValue(val); }
      setCol('status', status);
      setCol('confirmed_by', actor);
      setCol('confirmed_at', now);
      if (r.note != null) setCol('note', String(r.note));
      setCol('updated_at', now);
      updated++;
    } else {
      procurementAppendByHeader_(sh, {
        site_confirmation_id: 'SC-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
        planning_cycle: rec.planning_cycle,
        company: rec.company,
        country: rec.country,
        marketplace: rec.marketplace,
        series: rec.series,
        bucket: rec.bucket,
        status: status,
        confirmed_by: actor,
        confirmed_at: now,
        note: String(r.note || '').trim(),
        created_at: now,
        updated_at: now
      });
      idx[key] = sh.getLastRow();   // so a duplicate later in the same batch updates instead of re-appending
      created++;
    }
  }
  return jsonResponse_({ success: true, data: { upserted: created + updated, created: created, updated: updated } });
}
