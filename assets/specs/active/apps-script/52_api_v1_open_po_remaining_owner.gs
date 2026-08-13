/**
 * 52_api_v1_open_po_remaining_owner.gs
 * Kitchen Mama Operation System — API v1 · AI-Plan Layer-1 RAW read owner (Phase API / F1-7E-PREREQ-1).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped backend read owner for ONE AI-Plan Layer-1 RAW OPERATIONAL
 * FACT:  open_po_remaining_raw_qty  (per SKU).  Action = "openPoRemaining.raw.get" (body-carrying READ, no write).
 *
 * WHY A DEDICATED OWNER (not folded into 50_ purchaseOrder.workspace):
 *   - 50_ owns the CANONICAL PO-line remaining_qty = max(0, completed - shipped). THIS owner exposes a DIFFERENT,
 *     Layer-1 INFORMATIONAL fact with a DIFFERENT per-line rule (the AI-Plan browser semantic: persisted remaining_qty
 *     preferred, else the CURRENT browser fallback max(0, ordered - max(shipped, completed))) and a DIFFERENT grain
 *     (per SKU, restricted to OPEN-PO statuses, company-independent). Sharing 50_'s helper would blur two authority
 *     classes (see F1_7E_PREREQ_0_AI_PLAN_FACT_AUTHORITY_DECISION_R1.md). 50_ is NOT modified by this round.
 *
 * FROZEN FACT CONTRACT (extracted verbatim from request-order.js `ongoing()` — the current browser behavior; this is a
 * TRANSPORT migration, BEFORE FACT == AFTER FACT):
 *   - Group purchase_order_lines by UPPER(TRIM(sku)) (company-INDEPENDENT — the raw factory pipeline is a shared pool
 *     per SKU, exactly like factory stock; scope.company/country/marketplace are contextual echo only and MUST NOT
 *     filter the aggregate).
 *   - Keep a line only if its parent PO's status (LOWER(TRIM(order_status || status))) is in the frozen OPEN set.
 *   - Per line remaining = persisted remaining_qty when present (raw cell not '' / null), ELSE the CURRENT browser
 *     fallback max(0, ordered_qty - max(shipped_qty, completed_qty)). (PDR-1 = OPTION a: preserve current behavior;
 *     do NOT globally substitute the canonical max(0, completed - shipped) for blank rows.)
 *   - Add the per-line remaining to the SKU total only when it is > 0.
 *   - openPoRemainingRawQty = that SKU total (0 when no OPEN-PO line contributes — ZERO contract; ERROR != EMPTY != 0).
 *
 * READ-ONLY. Reads ONLY purchase_orders + purchase_order_lines. NEVER getOperationDb. Authors NO business logic: no
 * FIFO, no shipment/allocation read, no shipped_qty derivation, no PO write, no persisted remaining_qty change.
 *
 * Testability: pure `oprBuild_` is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handleOpenPoRemainingRawGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO SpreadsheetApp.
 */

var OPR_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

var OPR_TABLES_ = [
  { name: 'purchase_orders',      requiredCols: ['purchase_order_id'] },
  { name: 'purchase_order_lines', requiredCols: ['purchase_order_id'] }
];

// FROZEN AI-Plan OPEN-PO status set (== request-order.js RO_OPEN_PO_STATUS). Keys are the lowercased status. If the
// source set ever diverges, the equivalence test fails and this must be re-frozen deliberately (never silently).
var OPR_OPEN_STATUS_ = { issued: 1, in_production: 1, partial_completed: 1, partial_shipped: 1, ready_to_ship: 1, confirmed: 1 };

var OPR_MAX_SKUS_ = 5000;   // bound the response (Phase-1 SKU volumes); count/echo lets the caller detect an overflow

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock / no Spreadsheet). Match the db-api normalizer coercions exactly so
// backend(raw) == browser(normalize(raw)).
// --------------------------------------------------------------------------------------------------------
function oprStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function oprUpper_(v) { return oprStr_(v).toUpperCase(); }
function oprLower_(v) { return oprStr_(v).toLowerCase(); }
// parseFloat(v) || 0 — the exact normalizer coercion (NaN/blank -> 0; finite negatives/zero kept).
function oprNum_(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
// raw remaining_qty is "present" iff the cell is neither '' nor null/undefined (matches the normalizer's blank test).
function oprHasPersisted_(v) { return !(v === '' || v === null || v === undefined); }

// Per-line remaining — the EXACT AI-Plan browser `ongoing()` per-line semantic (NOT the F1-7C canonical definition).
function oprLineRemaining_(line) {
  if (oprHasPersisted_(line.remaining_qty)) return oprNum_(line.remaining_qty);   // persisted preferred (unclamped; >0 gate applies upstream)
  return Math.max(0, oprNum_(line.ordered_qty) - Math.max(oprNum_(line.shipped_qty), oprNum_(line.completed_qty)));   // browser fallback (PDR-1 a)
}

function oprBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'openPoRemaining.raw.get', workspace: 'openPoRemaining', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// The pure orchestrator: raw PO tables + payload -> bounded per-SKU raw-fact View Model.
//   payload.skus (optional array): return exactly these SKUs (0 for no OPEN-PO contribution). When omitted/empty,
//     return every SKU that has an OPEN-PO line (deterministic full set, bounded by OPR_MAX_SKUS_).
//   payload.scope (optional): echoed for the caller's context ONLY — it does NOT filter the aggregate (the fact is
//     per-SKU, company-independent, matching the current browser behavior).
function oprBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var pos = tables.purchase_orders || [], lines = tables.purchase_order_lines || [];

  // Index PO by id (LAST-wins, matching the browser `poById[p.purchaseOrderId] = p` forEach).
  var poById = {}; for (var i = 0; i < pos.length; i++) { var pid = oprStr_(pos[i].purchase_order_id); if (pid !== '') poById[pid] = pos[i]; }
  // Group lines by UPPER(TRIM(sku)).
  var linesBySku = {}; for (var j = 0; j < lines.length; j++) { var sk = oprUpper_(lines[j].sku); if (sk === '') continue; (linesBySku[sk] = linesBySku[sk] || []).push(lines[j]); }

  // Determine the SKU list to answer.
  var reqSkus = Array.isArray(payload.skus) ? payload.skus : null;
  var keys, echoBySku;
  if (reqSkus && reqSkus.length) {
    // preserve the caller's SKU spellings in the output; aggregate by the uppercased key.
    keys = []; echoBySku = {}; var seenK = {};
    for (var s = 0; s < reqSkus.length && keys.length < OPR_MAX_SKUS_; s++) {
      var orig = oprStr_(reqSkus[s]); if (orig === '') continue;
      var k = orig.toUpperCase(); if (seenK[k]) continue; seenK[k] = 1; keys.push(k); echoBySku[k] = orig;
    }
  } else {
    keys = Object.keys(linesBySku).slice(0, OPR_MAX_SKUS_); echoBySku = null;   // full set (already uppercased keys)
  }

  var items = [];
  for (var ki = 0; ki < keys.length; ki++) {
    var key = keys[ki];
    var skuLines = linesBySku[key] || [];
    var total = 0;
    for (var li = 0; li < skuLines.length; li++) {
      var line = skuLines[li];
      var po = poById[oprStr_(line.purchase_order_id)];
      var st = oprLower_(po ? (po.order_status || po.status) : '');   // (order_status || status), matching normalizePurchaseOrderRecord
      if (OPR_OPEN_STATUS_[st] !== 1) continue;
      var rem = oprLineRemaining_(line);
      if (rem > 0) total += rem;
    }
    items.push({ sku: (echoBySku ? echoBySku[key] : key), openPoRemainingRawQty: total });
  }

  return {
    scope: (payload.scope && typeof payload.scope === 'object') ? payload.scope : null,   // echo only; never filters
    statusSet: Object.keys(OPR_OPEN_STATUS_),
    fallbackFormula: 'max(0, ordered_qty - max(shipped_qty, completed_qty))',   // documented; blank-remaining rows only
    items: items,
    count: items.length,
    truncated: (!(reqSkus && reqSkus.length)) && (Object.keys(linesBySku).length > OPR_MAX_SKUS_)
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
function oprRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}

function oprDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { OPR_SEQ_++; return OPR_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols) {
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return oprRowsToObjects_(sheet);
    }
  };
}

function handleOpenPoRemainingRawGet_(body, io) {
  io = io || oprDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = oprStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  try {
    var payload = (body && body.payload) || {};
    var ss = io.openTarget();
    var tables = {}, readCount = 0;
    for (var i = 0; i < OPR_TABLES_.length; i++) { var spec = OPR_TABLES_[i]; tables[spec.name] = io.readTable(ss, spec.name, spec.requiredCols); readCount++; }
    var vm = oprBuild_(tables, payload);
    return oprBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'OPEN_PO_REMAINING_BUILD_FAILED';
    return oprBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
