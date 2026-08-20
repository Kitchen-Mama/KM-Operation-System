// Kitchen Mama Operation System — Ongoing-Order → Time-Phased (KMTPP) Incoming Adapter (KMOTA) — F1-7N-FA-3B2.
// =============================================================================================================
// PURE / DETERMINISTIC boundary adapter. It converts already-canonical KMOOP Ongoing-Order site allocations
// (§42 future factory supply) into KMTPP incoming facts. It OWNS no quantity and no allocation:
//   • notYetReceivedCommittedQty and its per-site split are produced by KMOOP (do NOT recompute here).
//   • the running balance / tier rollup is produced by KMTPP (do NOT project time here).
// The ONLY thing this adapter owns is the narrow TIMING/SHAPE translation at the boundary:
//   availableDate  ← the PHASE-1 Ongoing-Order timing anchor (see resolveOngoingAvailableDate_)
//   qty            ← KMOOP siteAllocation.allocatedQty (verbatim; 0 → no event)
//   incomingId     ← purchase_order_line_id || receiverKey   (count-once distinct lineage)
//   sourceType     ← 'ONGOING_ORDER'
//   tier           ← caller-owned tierByMonth[availableDate month] (null when outside M+1..M+4; KMTPP carries
//                    the balance but attributes no tier — never invent T5+)
//
// LIFECYCLE (frozen, do NOT collapse):
//   PURCHASE ORDER → ONGOING PO / FUTURE FACTORY SUPPLY → (Receive) → FACTORY CURRENT STOCK → (Dispatch) → SHIPMENT.
// This adapter materializes ONLY the ONGOING_ORDER state. Received units already left KMOOP (KMOOP projects only
// MAX(0, ordered − completed)), so a received unit can never appear here AND as Factory Current → count-once holds.
// availableDate here is a FUTURE-FACTORY-AVAILABILITY date, NOT a destination/shipment/carrier arrival ETA.
// No shipment, carrier, transit, route, FBA, or destination-ETA input is required or consulted.
//
// PHASE-1 vs PHASE-2 (see resolveOngoingAvailableDate_): the timing anchor is deliberately isolated behind one
// resolver so a future logistics model (cargo-ready / sailing / transit / destination receiving) can REPLACE the
// timing authority WITHOUT touching KMOOP quantity/site math, KMTPP time-phased math, KMFSR, count-once identity,
// or persistence identity. Do not hard-code the anchor anywhere else.
//
// No DB/API/clock/random/persistence/mutation; same input ⇒ identical output; input never mutated; JSON-safe.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.core = window.KM.core || {};
    window.KM.core.supplyPlanningOngoingOrderTppAdapter = api;
    window.KMOTA = api; // reserved namespace of record (§42.5)
  }
})(this, function () {
  'use strict';

  var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;   // strict YYYY-MM-DD (same grammar as KMTPP)
  var SOURCE_TYPE = 'ONGOING_ORDER';

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function requireObject(v, name) { if (!isObject(v)) throw new TypeError('KMOTA: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')'); return v; }
  function requireArray(v, name) { if (!Array.isArray(v)) throw new TypeError('KMOTA: ' + name + ' must be an array (got ' + describe(v) + ')'); return v; }
  function s(v) { return String(v == null ? '' : v).trim(); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function isIso(v) { return typeof v === 'string' && DATE_RE.test(v); }

  // ---- PHASE-1 BASELINE TIMING AUTHORITY (the single Phase-2 swap point) --------------------------------------
  // Ongoing-Order future-factory availability date = purchase_order_lines.expected_completion_date, VERBATIM.
  //   • expected_completion_date = expected production-complete / factory-ready date (request expected_ready_date
  //     at PO creation; supplier-confirmed ready date at confirmation). It is NOT a destination arrival ETA.
  //   • no added transit / no clock / no expected_ship_date / no request_bucket / no supplier lead_time_days.
  //   • blank or non-strict-ISO → unresolved (fail closed) — never fabricated.
  // PHASE 2+ may replace THIS function's body (cargo-ready / sailing / transit / destination receiving) without
  // changing any other module. Callers must not read the anchor field directly — they must go through here.
  function resolveOngoingAvailableDate_(timingFact) {
    var raw = s(timingFact && timingFact.expectedCompletionDate);
    if (!raw) return { ok: false, code: 'ONGOING_ORDER_ETA_UNRESOLVED', detail: 'expected_completion_date is blank (future-factory availability date unresolved)' };
    if (!isIso(raw)) return { ok: false, code: 'ONGOING_ORDER_ETA_UNRESOLVED', detail: 'expected_completion_date is not strict YYYY-MM-DD (got ' + raw + ')' };
    return { ok: true, availableDate: raw, authority: 'PHASE_1_BASELINE_TIMING_AUTHORITY' };
  }

  // input = {
  //   ongoingProjection: <KMOOP.projectOngoingOrderSupply output> { lines: [...] },
  //   poLineTiming:      [{ purchaseOrderLineId, expectedCompletionDate }],   // per-line Phase-1 timing facts
  //   tierByMonth:       { 'YYYY-MM': 'T1'..'T4' }                            // caller-frozen KMPCX M+1..M+4 map
  // }
  function projectOngoingOrderIncoming(input) {
    var root = requireObject(input, 'input');
    var proj = requireObject(root.ongoingProjection, 'input.ongoingProjection');
    var lines = requireArray(proj.lines, 'input.ongoingProjection.lines');
    var timingArr = requireArray(root.poLineTiming || [], 'input.poLineTiming');
    var tierByMonth = isObject(root.tierByMonth) ? root.tierByMonth : {};

    var timingByLine = {};
    timingArr.forEach(function (t) {
      var id = s(t && t.purchaseOrderLineId);
      if (id) timingByLine[id] = { expectedCompletionDate: s(t.expectedCompletionDate) };
    });

    var incomingEvents = [], issues = [];
    var unresolvedLines = 0, blockedLines = 0, emittedLines = 0;

    lines.forEach(function (l) {
      var poLineId = s(l.purchaseOrderLineId);

      // Upstream BLOCKED KMOOP line → never materialize (fail closed; carry the reason).
      if (l.allocationMode === 'BLOCKED') {
        blockedLines++;
        issues.push({ code: 'ONGOING_ORDER_LINE_BLOCKED_UPSTREAM', purchaseOrderLineId: poLineId, detail: 'KMOOP allocationMode=BLOCKED; no incoming emitted' });
        return;
      }

      var allocs = Array.isArray(l.siteAllocations) ? l.siteAllocations : [];
      var positive = allocs.filter(function (a) { return Number(a.allocatedQty) > 0; });
      if (!positive.length) return;   // nothing committed to a site (notYetReceived==0 or all-residual): no event

      // Resolve the PHASE-1 timing anchor for the whole line (line-level schedule date governs its remaining qty).
      var timed = resolveOngoingAvailableDate_(timingByLine[poLineId]);
      if (!timed.ok) {
        unresolvedLines++;
        issues.push({ code: timed.code, purchaseOrderLineId: poLineId, detail: timed.detail });
        return;   // fail closed — this committed qty gets NO timely KMTPP coverage; never counted as available
      }

      var tier = tierByMonth[timed.availableDate.slice(0, 7)];
      tier = (tier == null) ? null : String(tier);   // outside M+1..M+4 → null (KMTPP carries balance, no tier)

      positive.forEach(function (a) {
        var receiverKey = s(a.receiverKey);
        incomingEvents.push({
          availableDate: timed.availableDate,
          qty: Number(a.allocatedQty),
          incomingId: poLineId + '||' + receiverKey,   // count-once distinct lineage (PO line × site receiver)
          sourceType: SOURCE_TYPE,
          tier: tier,
          // passthrough receiver/lineage identity (KMTPP ignores extras; caller may route per destination):
          purchaseOrderLineId: poLineId,
          purchaseOrderId: s(l.purchaseOrderId),
          receiverKey: receiverKey,
          company: s(a.company), country: s(a.country), marketplace: s(a.marketplace), siteSku: s(a.siteSku),
          timingAuthority: timed.authority
        });
      });
      emittedLines++;
    });

    incomingEvents.sort(function (a, b) { return cmpStr(a.incomingId, b.incomingId); });

    var totalIncomingQty = 0;
    incomingEvents.forEach(function (e) { totalIncomingQty += e.qty; });

    return {
      ready: true,
      incomingEvents: incomingEvents,
      issues: issues,
      totals: {
        eventCount: incomingEvents.length,
        totalIncomingQty: totalIncomingQty,
        emittedLines: emittedLines,
        unresolvedLines: unresolvedLines,
        blockedLines: blockedLines
      }
    };
  }

  return {
    projectOngoingOrderIncoming: projectOngoingOrderIncoming,
    resolveOngoingAvailableDate_: resolveOngoingAvailableDate_,
    SOURCE_TYPE: SOURCE_TYPE,
    VERSION: 'kmota-fa3b2-1'
  };
});
