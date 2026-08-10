// Kitchen Mama Operation System — Canonical Supply Recommendation generator (KMREC) — F1-4B-FM6.
// =============================================================================================
// ONE pure, deterministic Phase-1 Recommendation owner. It READS an already-MATERIALIZED gap row
// (inventory_replenishment_gap / order_planning_gap — the single calculation authority) and produces a
// SUPPLY_RECOMMENDATION DTO. It does NOT recalculate a gap, owns NO formula, invokes NO KMHP/KMTPP/KMCALC/
// KMALLOC/KMMSA, and NEVER writes a PO/shipment/execution/inventory/forecast row. It only SELECTS + FORMATS
// the stored values into an actionable decision output. No Date.now / no RNG / no input mutation / JSON-safe.
//
// HARD RULES (F1-4B-FM6):
//   • READY rows only produce an actionable recommendation; BLOCKED/ERROR never fabricate a quantity.
//   • Inventory: primary = the EARLIEST non-zero materialized shortage window (D18→D30→D45→D90) — never the
//     largest. All four windows are retained in `windows[]` for trace. All-zero → NO_ACTION.
//   • Order Planning: per-tier stored T1..T4 suggested quantities are surfaced VERBATIM in `tiers[]`. A single
//     TOTAL is NOT emitted — the stored per-tier suggested quantities are each carton-CEIL rounded independently
//     (42.gs recoWsBuildMonthlyProjection_ → KMCALC.calculateSuggestedOrderQty per tier), so Σ over-orders
//     (double-rounds). The total is therefore HALTED as ORDER_RECOMMENDATION_TOTAL_AUTHORITY_NOT_FROZEN.
//   • Source lineage (sourceType + business key + source_calculated_at + calc date/month) is mandatory; a
//     recommendation cannot exist without it. Staleness is a fingerprint mismatch on source_calculated_at.
//   • Valid ZERO (a stored 0) is a real value; MISSING ('' / null) stays null (renders "—", never a fabricated 0).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.recommendation = api; window.KMREC = api; }
  return api;
})(this, function () {
  'use strict';

  var SOURCE_TYPE = { INVENTORY: 'INVENTORY_GAP', ORDER_PLANNING: 'ORDER_PLANNING_GAP' };
  var STATUS = { READY: 'READY', NO_ACTION: 'NO_ACTION', BLOCKED: 'BLOCKED' };
  var INV_WINDOWS = ['D18', 'D30', 'D45', 'D90'];
  var OP_TIERS = ['T1', 'T2', 'T3', 'T4'];
  var ORDER_TOTAL_AUTHORITY = 'ORDER_RECOMMENDATION_TOTAL_AUTHORITY_NOT_FROZEN';

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  // MISSING vs ZERO: '' / null / undefined → null (never coerced to 0); a finite value (incl. 0) → that value.
  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function isActionableQty(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
  function businessKey(row) { return [str(row.company), str(row.country), str(row.marketplace), str(row.sku)].join('||'); }
  // Source fingerprint (§6): a recommendation is valid ONLY against the exact gap calculation it was generated
  // from. When the stored calculated_at advances, the fingerprint changes → the old recommendation is stale.
  function fingerprint(product, row) { return [str(product), businessKey(row), str(row && row.calculated_at)].join('#'); }

  function baseDto(sourceType, row, opts) {
    opts = opts || {};
    return {
      recommendationId: sourceType + ':' + businessKey(row),
      product: sourceType,
      company: str(row.company), country: str(row.country), marketplace: str(row.marketplace), sku: str(row.sku),
      sourceType: sourceType,
      sourceCalculatedAt: str(row.calculated_at) || null,
      sourceCalculationDate: (sourceType === SOURCE_TYPE.INVENTORY) ? (str(row.calculation_date) || null) : null,
      sourceCalculationMonth: (sourceType === SOURCE_TYPE.ORDER_PLANNING) ? (str(row.calculation_month) || null) : null,
      sourceFingerprint: fingerprint(sourceType, row),
      status: STATUS.BLOCKED,
      primaryWindow: null, primaryMonth: null,
      gapQty: null, suggestedQty: null,
      tiers: null, windows: null,
      totalRecommendedQty: null, totalAuthority: null,
      reason: '', generatedAt: (opts.now != null ? String(opts.now) : null)
    };
  }
  function blocked(dto, row) {
    dto.status = STATUS.BLOCKED;
    // user-safe reason (raw internal codes stay in the stored note / diagnostics, not the decision surface)
    dto.reason = 'Recommendation unavailable — the latest calculation for this SKU is ' + (str(row.calculation_status) || 'not READY') + '.';
    return dto;
  }

  // INVENTORY (§3): choose the EARLIEST window with a non-zero stored suggested qty (D18→D90). Never the largest.
  function generateInventoryRecommendation(row, opts) {
    if (!row) return null;
    var dto = baseDto(SOURCE_TYPE.INVENTORY, row, opts);
    dto.windows = INV_WINDOWS.map(function (w) {
      var lc = w.toLowerCase();
      return { window: w, gapQty: num(row[lc + '_gap_qty']), suggestedQty: num(row[lc + '_suggested_qty']) };
    });
    if (str(row.calculation_status) !== 'READY') return blocked(dto, row);
    var chosen = null;
    for (var i = 0; i < dto.windows.length; i++) { if (isActionableQty(dto.windows[i].suggestedQty)) { chosen = dto.windows[i]; break; } }
    if (!chosen) { dto.status = STATUS.NO_ACTION; dto.reason = 'No action required — no materialized replenishment shortage.'; return dto; }
    dto.status = STATUS.READY;
    dto.primaryWindow = chosen.window;
    dto.gapQty = chosen.gapQty;
    dto.suggestedQty = chosen.suggestedQty;
    dto.reason = 'Earliest replenishment shortage requiring action (' + chosen.window + ').';
    return dto;
  }

  // ORDER PLANNING (§4): surface stored T1..T4 verbatim; NO total (independent per-tier carton rounding → HALT).
  function generateOrderPlanningRecommendation(row, opts) {
    if (!row) return null;
    var dto = baseDto(SOURCE_TYPE.ORDER_PLANNING, row, opts);
    dto.tiers = OP_TIERS.map(function (t) {
      var lc = t.toLowerCase();
      return { tier: t, month: str(row[lc + '_month']) || null, gapQty: num(row[lc + '_gap_qty']), suggestedQty: num(row[lc + '_suggested_qty']) };
    });
    dto.primaryMonth = dto.tiers[0].month;
    // The total is intentionally NOT computed — the stored per-tier suggested quantities are each independently
    // carton-CEIL rounded, so a sum over-orders. Surface the authority token; keep totalRecommendedQty null.
    dto.totalAuthority = ORDER_TOTAL_AUTHORITY;
    if (str(row.calculation_status) !== 'READY') return blocked(dto, row);
    var anyAction = dto.tiers.some(function (t) { return isActionableQty(t.suggestedQty); });
    if (!anyAction) { dto.status = STATUS.NO_ACTION; dto.reason = 'No action required — no materialized order need across T1–T4.'; return dto; }
    dto.status = STATUS.READY;
    dto.reason = 'Order need across the T1–T4 planning horizon (review each tier; a single total is not auto-summed).';
    return dto;
  }

  // Shared dispatch used by BOTH the manual AI Plan button and the automatic backend generator (one owner).
  function generateForRow(product, row, opts) {
    var p = str(product).toUpperCase();
    if (p === SOURCE_TYPE.INVENTORY || p === 'INVENTORY') return generateInventoryRecommendation(row, opts);
    if (p === SOURCE_TYPE.ORDER_PLANNING || p === 'ORDER_PLANNING') return generateOrderPlanningRecommendation(row, opts);
    return null;
  }
  // Generate over a set of materialized gap rows → { recommendations:[...], summary:{counts} }. Deterministic.
  function generateBatch(product, rows, opts) {
    var out = [], ready = 0, noAction = 0, blockedN = 0;
    (rows || []).forEach(function (r) {
      var dto = generateForRow(product, r, opts);
      if (!dto) return;
      out.push(dto);
      if (dto.status === STATUS.READY) ready++;
      else if (dto.status === STATUS.NO_ACTION) noAction++;
      else blockedN++;
    });
    return { recommendations: out, summary: { product: str(product), total: out.length, ready: ready, noAction: noAction, blocked: blockedN } };
  }

  // Staleness (§6): a DTO is stale against the LATEST gap row when the source_calculated_at fingerprint differs.
  function isStale(dto, latestRow) {
    if (!dto || !latestRow) return false;
    return String(dto.sourceFingerprint) !== fingerprint(dto.sourceType, latestRow);
  }

  return {
    SOURCE_TYPE: SOURCE_TYPE, STATUS: STATUS, INV_WINDOWS: INV_WINDOWS.slice(), OP_TIERS: OP_TIERS.slice(),
    ORDER_TOTAL_AUTHORITY: ORDER_TOTAL_AUTHORITY,
    fingerprint: fingerprint,
    generateInventoryRecommendation: generateInventoryRecommendation,
    generateOrderPlanningRecommendation: generateOrderPlanningRecommendation,
    generateForRow: generateForRow, generateBatch: generateBatch, isStale: isStale,
    VERSION: 'kmrec-fm6-1'
  };
});
