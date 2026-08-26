/**
 * assets/js/core/supply-planning-recommendation-audit.js
 * F1-7N-FB-4B §E.8 / §F.6 — READ-ONLY recommendation & order-quantity AUTHORITY AUDIT.
 *
 * WHAT THIS IS FOR. Two live reports could not be answered from the UI:
 *   · CO1100-R showed a T3 Suggested of 5,280 against a raw gap of 5,276 — the owner asserts an order quantity
 *     may never exceed the gap.
 *   · CO1150-N showed Order Qty T1 = 400 while the database held 360, with no user edit, and Send Request was
 *     correctly blocked with QUANTITY_DRIFT.
 * Neither could be diagnosed because the several quantities involved — raw gap, recommendation, cartonized
 * recommendation, persisted order_qty, the user_edit flag, what the UI displays, what Send asserts, and what the
 * database returns on read-back — were never shown side by side. This puts them in one table.
 *
 * IT CHANGES NO RULE AND WRITES NOTHING. It computes no quantity of its own: it is handed the values the real
 * owners produced and reports them, plus the arithmetic relationship between them. In particular it does NOT
 * decide whether CEILING or FLOOR is correct — see kmRecoCartonAudit's `rounding_mode` and `excess_over_gap`,
 * and the F1-7N-FB-4B completion record for why that question is a frozen-spec conflict and not a bug fix.
 *
 * Pure, deterministic, no clock, no randomness, no DOM, no network.
 */
(function (root) {
  'use strict';

  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function bool(v) {
    if (v === true) return true;
    if (v === false) return false;
    var t = String(v == null ? '' : v).trim().toLowerCase();
    if (t === 'true' || t === 'yes' || t === 'y' || t === '1') return true;
    if (t === 'false' || t === 'no' || t === 'n' || t === '0') return false;
    return null;   // MISSING is never silently false — an unknown flag is reported as unknown
  }

  /**
   * §F.6 — the cartonization audit for ONE tier.
   * Inputs are the values the OWNERS produced; nothing is recomputed here except the reported relationship.
   *   raw_gap             the calculated gap before any rounding
   *   allocatable_supply  supply that may cover the gap (null when not applicable to this path)
   *   pre_carton_qty      the quantity fed to the cartonizer (Net Order Need for the ORDER path)
   *   units_per_carton    UPC used
   *   rounding_mode       'CEILING' (ORDER path, §14/§31) | 'FLOOR' (SHIPPING path, §2C.1/§31) | 'NONE'
   *   final_recommended_qty  what the owner returned
   */
  function cartonAudit(input) {
    var i = input || {};
    var rawGap = num(i.raw_gap);
    var upc = num(i.units_per_carton);
    var pre = num(i.pre_carton_qty);
    var final_ = num(i.final_recommended_qty);
    var mode = String(i.rounding_mode == null ? '' : i.rounding_mode).trim().toUpperCase() || 'NONE';

    var excess = (rawGap !== null && final_ !== null) ? (final_ - rawGap) : null;
    var cartons = (upc && final_ !== null) ? (final_ / upc) : null;

    return {
      raw_gap: rawGap,
      allocatable_supply: num(i.allocatable_supply),
      pre_carton_qty: pre,
      units_per_carton: upc,
      rounding_mode: mode,
      final_recommended_qty: final_,
      excess_over_gap: excess,
      exceeds_gap: excess !== null ? excess > 0 : null,
      whole_cartons: cartons,
      is_whole_carton_multiple: (upc && final_ !== null) ? (final_ % upc === 0) : null,
      // The two documented alternatives, reported so a business decision can be taken on numbers rather than
      // adjectives. NEITHER is applied — the live formula is unchanged.
      alternative_floor_qty: (upc && pre !== null) ? Math.floor(pre / upc) * upc : null,
      alternative_capped_at_gap_qty: (upc && pre !== null && rawGap !== null)
        ? Math.min(Math.ceil(pre / upc) * upc, Math.floor(rawGap / upc) * upc) : null,
      authority: mode === 'CEILING'
        ? 'SUPPLY_PLANNING_CALCULATION_RULES.md §14 / §31 — "Suggested Order Qty = CEILING(Net Order Need ÷ Units Per Carton) × Units Per Carton". Owner: KMCALC.calculateSuggestedOrderQty.'
        : (mode === 'FLOOR'
          ? 'SUPPLY_PLANNING_CALCULATION_RULES.md §2C.1 / §31 — shipping rounds DOWN to whole cartons of what is actually available. Owner: KMCALC.calculateShippingAndResidual.recommendedShippingQty.'
          : 'no carton rounding applied on this path'),
      note: (mode === 'CEILING' && excess !== null && excess > 0)
        ? 'This quantity EXCEEDS the raw gap by ' + excess + ' unit(s). Under the frozen specification that is the INTENDED behaviour of the ORDER path (a partial carton cannot be ordered, so the order rounds UP to cover the whole need). It contradicts the owner assertion that an order may never exceed the gap. That conflict is a FROZEN-SPEC DECISION, not a defect, and is reported rather than silently changed.'
        : ''
    };
  }

  /**
   * §E.8 — every quantity authority for ONE tier, side by side, with the divergences named.
   * Nothing here recomputes a quantity; it reports what each owner said and where they disagree.
   */
  function authorityMatrix(input) {
    var i = input || {};
    var rawGap = num(i.raw_gap);
    var recommendation = num(i.recommendation);
    var cartonized = num(i.cartonized_recommendation);
    var persisted = num(i.persisted_order_qty);
    var displayed = num(i.ui_displayed_order_qty);
    var intent = num(i.send_intent_qty);
    var readback = num(i.send_persisted_readback_qty);
    var userEdit = bool(i.user_edit);

    var rows = [
      { authority: 'raw_gap', value: rawGap, kind: 'CALCULATION', binding: false, note: 'the demand shortfall before any rounding' },
      { authority: 'recommendation', value: recommendation, kind: 'CALCULATION', binding: false, note: 'advisory output; never a send authority' },
      { authority: 'cartonized_recommendation', value: cartonized, kind: 'CALCULATION', binding: false, note: 'the Suggested column; still advisory' },
      { authority: 'persisted_order_qty', value: persisted, kind: 'PERSISTED', binding: true, note: 'THE send authority (§E.3)' },
      { authority: 'ui_displayed_order_qty', value: displayed, kind: 'DISPLAY', binding: false, note: 'must equal persisted_order_qty whenever a canonical draft exists' },
      { authority: 'send_intent_qty', value: intent, kind: 'ASSERTED', binding: false, note: 'what the page asserted to the server' },
      { authority: 'send_persisted_readback_qty', value: readback, kind: 'PERSISTED', binding: true, note: 'what the database returned on read-back' }
    ];

    var divergences = [];
    function diff(a, b, code, why) {
      var x = num(i[a]), y = num(i[b]);
      if (x === null || y === null) return;
      if (x !== y) divergences.push({ code: code, left: a, left_value: x, right: b, right_value: y, why: why });
    }
    diff('ui_displayed_order_qty', 'persisted_order_qty', 'DISPLAY_DIVERGES_FROM_PERSISTED',
      'the UI is showing a number the database does not hold. If user_edit is false this is an ephemeral recommendation masquerading as the persisted quantity — the CO1150-N defect.');
    diff('send_intent_qty', 'persisted_order_qty', 'INTENT_DIVERGES_FROM_PERSISTED',
      'the page asserted a quantity that is not the persisted one; the Send barrier will refuse this as QUANTITY_DRIFT, correctly.');
    diff('send_persisted_readback_qty', 'persisted_order_qty', 'READBACK_DIVERGES_FROM_PERSISTED',
      'the database changed between read and read-back — a concurrent write.');

    var verdict;
    if (!divergences.length) verdict = 'CONSISTENT';
    else if (userEdit === true && divergences.every(function (d) { return d.code === 'DISPLAY_DIVERGES_FROM_PERSISTED'; })) verdict = 'USER_EDIT_PENDING_SAVE';
    else verdict = 'AUTHORITY_CONFLICT';

    return {
      sku: String(i.sku == null ? '' : i.sku),
      tier: String(i.tier == null ? '' : i.tier),
      user_edit: userEdit,
      rows: rows,
      divergences: divergences,
      verdict: verdict,
      rules: [
        'recommendation is advisory calculation output; order_qty is the persisted send authority',
        'an existing persisted draft hydrates Order Qty from the database',
        'no ephemeral recommendation may stand in for a persisted Order Qty',
        'user_edit=true always preserves the user quantity; recalculation may update the recommendation but not a user-edited order_qty',
        'a persisted zero is a real decision and is excluded from Send by the zero-quantity rule, not overwritten'
      ],
      // §E.3 last clause: a non-user-edited row refreshed to a new default must persist BOTH and read back before
      // the UI may claim success. Reported so the caller can see whether that happened.
      refresh_contract: (userEdit === false && displayed !== null && persisted !== null && displayed !== persisted)
        ? 'VIOLATED — user_edit is false and the display differs from the persisted value, so a recalculated default was rendered without being persisted and read back first.'
        : 'OK'
    };
  }

  var API = { cartonAudit: cartonAudit, authorityMatrix: authorityMatrix };
  if (root) { root.KMRECAUDIT = API; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : null);
