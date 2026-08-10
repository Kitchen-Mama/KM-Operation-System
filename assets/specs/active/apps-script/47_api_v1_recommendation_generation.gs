// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 47_api_v1_recommendation_generation.gs — F1-4B-FM6 Recommendation Generation (automatic entry points)
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script project. Copy them together and
//       REDEPLOY. No imports. Structure-only split. Requires the bundle (KMREC) + 43 (gap read owners) loaded.
// ============================================================
//
// AUTOMATIC recommendation generation entry points. They READ the already-materialized gap tables and run the
// SAME canonical Phase-1 generator (KMREC, bundled) that the manual "AI Plan" buttons use — one owner, manual +
// automatic. This layer is DECISION OUTPUT only: it recalculates NO gap, owns NO formula, invokes NO
// KMHP/KMTPP/KMCALC/KMALLOC/KMMSA, and writes NO PO / shipment / execution / inventory / forecast / gap row.
// Phase-1 is UNSCHEDULED and NON-PERSISTENT — these callables produce a compact deterministic summary (counts +
// lineage), the future scheduler/persistence hook. The gap tables remain the single calculation authority.
//
// HARD LIMITS (F1-4B-FM6): NO gap recalculation, NO second formula engine, NO DB/schema change, NO downstream
// write, NO scheduler wiring this round. READY rows only yield actionable recommendations; BLOCKED/ERROR never
// fabricate a quantity (enforced inside KMREC).

// Read the STORED gap rows for a product (READ ONLY; header-mapped objects; [] when the table is absent/empty).
// ORDER_PLANNING: additively stamp units_per_carton onto each row from sku_details — the single UPC authority the
// manual page also uses (F1-4B-FM5-R1) — so KMREC can cartonize the actionable total ONCE. READ ONLY: no gap
// recalculation, no schema change (units_per_carton is NOT persisted to order_planning_gap), parity with manual.
function recGenReadGapRows_(product) {
  var io = gapMaterializationDefaultIo_();
  var ss = io.openTarget();
  var table = (product === 'ORDER_PLANNING') ? OP_GAP_TABLE_ : INV_GAP_TABLE_;
  var rows = gapReadObjects_(ss, table);   // reuses the 43 read helper — no calculation, no whole-DB load
  if (product === 'ORDER_PLANNING' && rows && rows.length) {
    var upcBySku = recGenUpcBySku_(ss);
    for (var i = 0; i < rows.length; i++) {
      var u = upcBySku[String(rows[i] && rows[i].sku)];
      if (u != null && rows[i].units_per_carton == null) rows[i].units_per_carton = u;   // additive; never overwrite
    }
  }
  return rows;
}
// sku → units_per_carton map from sku_details (READ ONLY). Only finite, positive values are kept.
function recGenUpcBySku_(ss) {
  var map = {};
  var rows = gapReadObjects_(ss, 'sku_details');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]; if (!r || r.sku == null) continue;
    var n = Number(r.units_per_carton);
    if (isFinite(n) && n > 0) map[String(r.sku)] = n;
  }
  return map;
}

// Shared canonical owner (§8): manual AI Plan (client-side KMREC over the loaded gap rows) and this automatic path
// BOTH call KMREC — one generator. Returns a compact summary envelope; NO per-SKU payload is written anywhere.
function runRecommendationGeneration(product) {
  var p = String(product == null ? '' : product).trim().toUpperCase();
  if (p === 'INV' || p === 'INVENTORY_REPLENISHMENT') p = 'INVENTORY';
  if (p === 'OP' || p === 'ORDERPLANNING') p = 'ORDER_PLANNING';
  if (p !== 'INVENTORY' && p !== 'ORDER_PLANNING') return { ok: false, code: 'INVALID_PRODUCT', message: 'product required (INVENTORY|ORDER_PLANNING)' };
  if (typeof KMREC === 'undefined' || !KMREC || typeof KMREC.generateBatch !== 'function') return { ok: false, code: 'KMREC_NOT_BUNDLED', message: 'recommendation generator not bundled' };
  try {
    var rows = recGenReadGapRows_(p);
    var res = KMREC.generateBatch(p, rows, {});   // SAME owner + rules as the manual button (earliest-window / per-tier / no-total)
    var summary = res.summary || {};
    try { Logger.log('[recGen] ' + JSON.stringify(summary)); } catch (_l) {}
    return { ok: true, product: p, sourceType: (p === 'ORDER_PLANNING' ? KMREC.SOURCE_TYPE.ORDER_PLANNING : KMREC.SOURCE_TYPE.INVENTORY), summary: summary };
  } catch (e) {
    return { ok: false, code: 'RECOMMENDATION_GENERATION_ERROR', message: (e && e.message ? String(e.message) : String(e)) };
  }
}
// Named entry points (attach to a FUTURE time trigger; NOT scheduled this round). Both delegate to the one owner.
function runInventoryRecommendationGeneration() { return runRecommendationGeneration('INVENTORY'); }
function runOrderPlanningRecommendationGeneration() { return runRecommendationGeneration('ORDER_PLANNING'); }
