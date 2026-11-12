// Kitchen Mama Operation System — Canonical SHIPMENT-LINE incoming source (F1-SHIPMENT-INCOMING-R7C).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC. The ONE owner of shipment INCOMING physical truth + receiver attribution, shared by
// BOTH Planning qualification paths so they can never derive shipment quantity/receiver identity from different
// physical sources:
//   • WAREHOUSE_REPLENISHMENT — supply-planning-source-projection.js builds the KMSF shipment inputs from here.
//   • MARKETPLACE_ORDER_NEED  — the recommendation workspace feeds KMDR line-grain candidates built here.
//
// Physical grain = shipment_lines (NEVER the shipment header). remaining = MAX(0, shipment_qty −
// shipment_received_qty), owned by the R4 authority buildKmShipmentSupplyCandidate (reused verbatim — no second
// remaining calculator, no wh_on_the_way, no live FC Share, no destination-text parsing). Receiver attribution
// is FROZEN at dispatch via shipment_lines.shipping_plan_line_id → shipping_plan_lines → shipping_plans
// (company/country/marketplace); present-but-unresolvable lineage and header-MULTI-without-lineage FAIL CLOSED.
//
// No Sheet/DB/API/UI, no clock, no locale, no mutation, no persistence, no new table.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-supply-candidates.js') : (root.KMCAND || (root.KM && root.KM.supplyCandidates))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.shipmentLineSource = api; }
})(this, function (CAND) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }
  function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  // tolerant getter: snake_case primary, camelCase fallback (source-projection passes snake; a caller may pass camel)
  function g(o, snake, camel) { if (has(o, snake)) return o[snake]; if (camel && has(o, camel)) return o[camel]; return undefined; }

  // A marketplace value is "merged / non-specific" when blank or a combined-shipment sentinel. A combined SHIPMENT
  // header carries MULTI; each underlying single-marketplace PLAN header still carries its specific marketplace.
  function isMergedMarketplace(m) { var s = str(m).toLowerCase(); return s === '' || /multi|merged|mixed|combined/.test(s); }
  function isSpecificReceiver(company, country, marketplace) {
    return nonEmpty(company) && nonEmpty(country) && nonEmpty(marketplace) && !isMergedMarketplace(marketplace);
  }

  // ==========================================================================================================
  // resolveShipmentLineReceiver — ONE pure receiver-resolution owner. Authority order:
  //   1. FROZEN dispatch lineage: shipping_plan_line_id → shipping_plan_lines → shipping_plans{company,country,
  //      marketplace}. SKU consistency validated (mismatch → fail closed). Present-but-unresolvable → fail closed
  //      (NEVER a header fallback for a populated lineage).
  //   2. Historical blank lineage + a valid SPECIFIC (non-MULTI) shipment header → header fallback.
  //   3. Otherwise → UNRESOLVED (SHIPMENT_RECEIVER_LINEAGE_UNRESOLVED).
  // input = { shipmentLine, shipment, shippingPlanLineById, shippingPlanById }
  // returns { status:'RESOLVED'|'UNRESOLVED', source, reason, company, country, marketplace }
  // ==========================================================================================================
  function resolveShipmentLineReceiver(input) {
    input = input || {};
    var line = input.shipmentLine || {}, shipment = input.shipment || {};
    var planLineById = input.shippingPlanLineById || {}, planById = input.shippingPlanById || {};
    function resolved(source, co, cy, mk) { return { status: 'RESOLVED', source: source, reason: null, company: co, country: cy, marketplace: mk }; }
    function unresolved(reason) { return { status: 'UNRESOLVED', source: 'UNRESOLVED', reason: reason, company: '', country: '', marketplace: '' }; }

    var planLineId = str(g(line, 'shipping_plan_line_id', 'shippingPlanLineId'));
    var merged = Number(input.linkCount) >= 2 || lineageNamesOtherPlan(line, shipment);   // XCO-R15G E1C (B1-MAJOR-4): ever merged, or a foreign lineage
    if (merged && !planLineId) return unresolved('MERGED_LINE_LINEAGE_MISSING');   // XCO-R15G E1: never Priority 2 (the header)
    if (planLineId) {
      var pl = planLineById[planLineId];
      if (!pl) return unresolved('LINEAGE_PLAN_LINE_NOT_FOUND');                       // present but dangling → fail closed
      var plSku = str(g(pl, 'sku', 'sku')), lnSku = str(g(line, 'sku', 'sku'));
      if (plSku && lnSku && plSku !== lnSku) return unresolved('LINEAGE_SKU_MISMATCH'); // never silently remap
      var plan = planById[str(g(pl, 'shipping_plan_id', 'shippingPlanId'))];
      if (!plan) return unresolved('LINEAGE_PLAN_NOT_FOUND');
      var co = str(g(plan, 'company', 'company')), cy = str(g(plan, 'country', 'country')), mk = str(g(plan, 'marketplace', 'marketplace'));
      if (!isSpecificReceiver(co, cy, mk)) return unresolved('LINEAGE_RECEIVER_NOT_SPECIFIC');
      if (merged) {   // XCO-R15G E1: the line's own frozen lineage, re-signed and re-derived
        var lg = mergedLineage(line, shipment, pl, plan, planLineId, co);
        if (lg.reason) return unresolved(lg.reason);
        var rm = resolved('FROZEN_SHIPPING_PLAN_LINE', co, cy, mk); rm.destinationWarehouseId = lg.dest; return rm;
      }
      return resolved('FROZEN_SHIPPING_PLAN_LINE', co, cy, mk);
    }

    // Priority 2 — historical blank lineage + specific (non-MULTI) header.
    var hco = str(g(shipment, 'company', 'company')), hcy = str(g(shipment, 'country', 'country')), hmk = str(g(shipment, 'marketplace', 'marketplace'));
    if (isSpecificReceiver(hco, hcy, hmk)) return resolved('SHIPMENT_HEADER', hco, hcy, hmk);
    return unresolved('HEADER_MULTI_OR_MISSING');                                       // MULTI header w/o lineage → fail closed
  }

  // ---- XCO-R15G E1: lineage marker, sig (same algorithm as 12_ xcoSig_), pure synchronous sha256 ----
  var XCO_SIG_FIELDS = ['v', 'plan_id', 'plan_line_id', 'company', 'country', 'marketplace', 'site_sku', 'sku', 'qty', 'dest'];
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8Bytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { var d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;   // an unpaired surrogate encodes as U+FFFD (WHATWG / node); GS equality for it is NOT proven
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256Hex(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bits = bytes.length * 8, m = bytes.slice(), w = new Array(64), off, t;
    m.push(0x80); while (m.length % 64 !== 56) m.push(0);
    m.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
    for (off = 0; off < m.length; off += 64) {
      for (t = 0; t < 16; t++) w[t] = (m[off + 4 * t] << 24) | (m[off + 4 * t + 1] << 16) | (m[off + 4 * t + 2] << 8) | m[off + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        w[t] = (w[t - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[t - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], gg = H[6], hh = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & gg)) + K256[t] + w[t]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = gg; gg = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + gg) | 0; H[7] = (H[7] + hh) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }
  function lineageSig(o, shipmentId) {
    var text = XCO_SIG_FIELDS.map(function (k) { return String(o[k] === undefined || o[k] === null ? '' : o[k]); }).concat([String(shipmentId)]).join('\u001f');
    return sha256Hex(utf8Bytes(text)).slice(0, 16);
  }
  function parseLineageMarker(note) {
    var m = String(note === undefined || note === null ? '' : note).trim().match(/(?:^|\n)\[SC13_SOURCE:([^\]]+)\]/);
    if (!m) return null;
    try { var o = JSON.parse(decodeURIComponent(m[1])); return o && typeof o === 'object' ? o : { unreadable: true }; } catch (e) { return { unreadable: true }; }
  }
  function assignedDest(line, shipment) {
    var a = str(g(line, 'note', 'note')).match(/\[SC13_ASSIGN:[^\]\r\n]*\]/g) || [];
    if (!a.length) return '';   // XCO-R15G E1C: the LAST assignment record
    var d = ''; try { d = decodeURIComponent(a[a.length - 1].slice('[SC13_ASSIGN:'.length).split(':')[0]); } catch (e) { return ''; }
    return d && d === str(g(shipment, 'destination_warehouse_id', 'destinationWarehouseId')) ? d : '';
  }
  function lineRemoved(line) {   // XCO-R15G E1D (O-1): '' | 'REMOVED' | 'INVALID' - column OR note; an illegal status is never active
    var st = g(line, 'line_status', 'lineStatus');
    if (st !== undefined && st !== null && ['', 'active', 'removed'].indexOf(str(st)) < 0) return 'INVALID';
    return (str(st) === 'removed' || /(?:^|\n)\[SC13_REMOVED:/.test(str(g(line, 'note', 'note')))) ? 'REMOVED' : '';
  }   // XCO-R15G E1B: = 12_ sc13LineRemoved_
  function lineageNamesOtherPlan(line, shipment) {   // XCO-R15G E1C: a lineage marker naming a Plan other than the header's
    var m = parseLineageMarker(g(line, 'note', 'note')), hp = str(g(shipment, 'shipping_plan_id', 'shippingPlanId'));
    if (m && m.unreadable) return true;   // XCO-R15G P-1: unparseable = merged (strict), never "single-plan"
    return !!(m && str(m.plan_id) && hp && str(m.plan_id) !== hp);
  }
  function mergedLineage(line, shipment, pl, plan, planLineId, co) {
    var mkr = parseLineageMarker(g(line, 'note', 'note'));
    if (!mkr) return { reason: 'MERGED_LINE_LINEAGE_MISSING' };
    if (mkr.unreadable) return { reason: 'MERGED_LINE_LINEAGE_UNREADABLE' };
    if (mkr.v !== 2) return { reason: 'MERGED_LINE_LINEAGE_LEGACY' };
    var sid = str(g(shipment, 'shipment_id', 'shipmentId'));
    if (!sid || typeof mkr.sig !== 'string' || mkr.sig !== lineageSig(mkr, sid)) return { reason: 'MERGED_LINE_LINEAGE_TAMPERED' };
    var planDest = g(plan, 'destination_warehouse_id', 'destinationWarehouseId'), qty = g(line, 'shipment_qty', 'shipmentQty');
    if (planDest === undefined || qty === undefined || str(qty) === '') return { reason: 'MERGED_LINE_SOURCE_UNVERIFIABLE' };   // XCO-R15G E1C (B1-MINOR-1)
    var plMk = g(pl, 'marketplace', 'marketplace'), mk2 = str(plMk) || str(g(plan, 'marketplace', 'marketplace'));
    if (str(mkr.plan_line_id) !== planLineId || str(mkr.plan_id) !== str(g(pl, 'shipping_plan_id', 'shippingPlanId')) || str(mkr.company) !== co ||
        str(mkr.country) !== str(g(plan, 'country', 'country')) || str(mkr.marketplace) !== mk2 || str(mkr.site_sku) !== str(g(pl, 'site_sku', 'siteSku')) ||
        str(mkr.sku) !== str(g(line, 'sku', 'sku')) || str(mkr.dest) !== str(planDest) || Number(qty) !== Number(mkr.qty)) return { reason: 'MERGED_LINE_SOURCE_CHANGED' };
    var hasAssign = /\[SC13_ASSIGN:/.test(str(g(line, 'note', 'note'))), dest = hasAssign ? assignedDest(line, shipment) : str(mkr.dest);
    if (hasAssign && !dest) return { reason: 'MERGED_LINE_DEST_CONTRADICTS_SHIPMENT' };
    if (!dest) return { reason: 'MERGED_LINE_LINEAGE_DEST_MISSING' };
    return { reason: null, dest: dest };
  }

  // XCO-R15G E1E: { shipment_id: number of DISTINCT plans EVER linked } from shipment_plan_links row-objects (ended rows included)
  function shipmentLinkCountsFromRows(rows) {
    var by = {}, out = {};
    (rows || []).forEach(function (r) { if (!isObj(r)) return; var s = str(g(r, 'shipment_id', 'shipmentId')), p = str(g(r, 'shipping_plan_id', 'shippingPlanId')); if (!s || !p) return; (by[s] = by[s] || {})[p] = 1; });
    Object.keys(by).forEach(function (s) { out[s] = Object.keys(by[s]).length; });
    return out;
  }
  function indexBy(rows, snake, camel) {
    var m = {};
    (rows || []).forEach(function (r) { if (!isObj(r)) return; var k = str(g(r, snake, camel)); if (k && !m[k]) m[k] = r; });
    return m;
  }

  // ==========================================================================================================
  // buildShipmentLineCandidates — ONE canonical line-grain assembly (indexes built ONCE; O(n) over the inputs).
  //   input = { shipmentLines:[], shipments:[], shippingPlanLines:[], shippingPlans:[] } (arrays of row-objects)
  //   Optionally accepts pre-built indexes: { shipmentById, shippingPlanLineById, shippingPlanById }.
  //   returns {
  //     shipmentInputs: [{ shipment, line }],   // raw B4-R3 inputs for KMSF (WAREHOUSE path) — receiver on shipment
  //     candidates:     [{ candidate, resolution, shipmentStatus, headerScope }],  // built DTOs (MARKETPLACE path)
  //     issues:         [{ i, reason }]
  //   }
  // A shipment_line whose parent shipment is missing, or that cannot mint a candidate, fails closed as an issue.
  // ==========================================================================================================
  function buildShipmentLineCandidates(input) {
    input = input || {};
    var lines = input.shipmentLines || [];
    var shipmentById = input.shipmentById || indexBy(input.shipments, 'shipment_id', 'shipmentId');
    var planLineById = input.shippingPlanLineById || indexBy(input.shippingPlanLines, 'shipping_plan_line_id', 'shippingPlanLineId');
    var planById = input.shippingPlanById || indexBy(input.shippingPlans, 'shipping_plan_id', 'shippingPlanId');
    var linkCountById = input.shipmentLinkCountById || null;   // XCO-R15G E1: { shipment_id: live plan links } (opt-in)
    var dMerged = {};   // XCO-R15G option D: { shipment_id: why } "ever merged" from the rows already read (never weaker than the link map)
    lines.forEach(function (l) {
      if (!isObj(l)) return; var sid0 = str(g(l, 'shipment_id', 'shipmentId')), sh0 = shipmentById[sid0]; if (!sh0) return;
      var hp0 = str(g(sh0, 'shipping_plan_id', 'shippingPlanId')), m0 = parseLineageMarker(g(l, 'note', 'note'));
      if (m0 && (m0.unreadable || (str(m0.plan_id) && hp0 && str(m0.plan_id) !== hp0))) dMerged[sid0] = dMerged[sid0] || 'LINEAGE_MARKER';
      var pl0 = planLineById[str(g(l, 'shipping_plan_line_id', 'shippingPlanLineId'))];
      if (pl0 && hp0 && str(g(pl0, 'shipping_plan_id', 'shippingPlanId')) !== hp0) dMerged[sid0] = dMerged[sid0] || 'PLAN_LINE_OF_ANOTHER_PLAN';
      if (/\[SC13_(?:DONE:(?!register-)|PENDING:|UNLINKED:)/.test(str(g(sh0, 'note', 'note')))) dMerged[sid0] = dMerged[sid0] || 'HEADER_MERGE_RECORD';
    });

    var shipmentInputs = [], candidates = [], issues = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i]; if (!isObj(ln)) { issues.push({ i: i, reason: 'MALFORMED_LINE' }); continue; }
      var shipmentId = str(g(ln, 'shipment_id', 'shipmentId'));
      var shipment = shipmentById[shipmentId];
      if (!shipment) { issues.push({ i: i, reason: 'SHIPMENT_NOT_FOUND:' + shipmentId }); continue; }
      var lrm_ = lineRemoved(ln); if (lrm_) { issues.push({ i: i, reason: lrm_ === 'INVALID' ? 'LINE_STATUS_INVALID' : 'LINE_REMOVED' }); continue; }   // XCO-R15G E1D   // XCO-R15G E1B (H2)

      var mergedShip = (!!linkCountById && Number(linkCountById[shipmentId]) >= 2) || !!dMerged[shipmentId];   // XCO-R15G E1 + option D
      var rcv = resolveShipmentLineReceiver({ shipmentLine: ln, shipment: shipment, shippingPlanLineById: planLineById, shippingPlanById: planById, linkCount: mergedShip ? Math.max(2, Number(linkCountById && linkCountById[shipmentId]) || 0) : undefined });   // XCO-R15G option D

      // Raw B4-R3 input — receiver identity from the resolver (NOT the raw header); '' when UNRESOLVED (downstream
      // scope-match/identity then fails closed). Destination warehouse is carried but is NEVER the receiver identity.
      var shipObj = {
        shipmentId: nonEmpty(shipmentId) ? shipmentId : undefined,
        company: nonEmpty(rcv.company) ? rcv.company : undefined,
        country: nonEmpty(rcv.country) ? rcv.country : undefined,
        marketplace: nonEmpty(rcv.marketplace) ? rcv.marketplace : undefined,
        destinationWarehouseId: (mergedShip || lineageNamesOtherPlan(ln, shipment)) ? (nonEmpty(rcv.destinationWarehouseId) ? str(rcv.destinationWarehouseId) : undefined) : (nonEmpty(g(shipment, 'destination_warehouse_id', 'destinationWarehouseId')) ? str(g(shipment, 'destination_warehouse_id', 'destinationWarehouseId')) : undefined),   // XCO-R15G E1: a consolidated line's OWN destination
        legacyWarehouseId: nonEmpty(g(shipment, 'warehouse_id', 'warehouseId')) ? str(g(shipment, 'warehouse_id', 'warehouseId')) : undefined,
        eta: has(shipment, 'eta') ? shipment.eta : g(shipment, 'eta', 'eta'),
        status: has(shipment, 'status') ? shipment.status : g(shipment, 'status', 'status'),
        sourceUpdatedAt: nonEmpty(g(shipment, 'source_data_as_of', 'sourceUpdatedAt')) ? str(g(shipment, 'source_data_as_of', 'sourceUpdatedAt')) : undefined
      };
      var lineObj = {
        shipmentLineId: nonEmpty(g(ln, 'shipment_line_id', 'shipmentLineId')) ? str(g(ln, 'shipment_line_id', 'shipmentLineId')) : undefined,
        sku: nonEmpty(g(ln, 'sku', 'sku')) ? str(g(ln, 'sku', 'sku')) : undefined,
        shipmentQty: has(ln, 'shipment_qty') ? ln.shipment_qty : g(ln, 'shipment_qty', 'shipmentQty'),
        legacyQty: has(ln, 'qty') ? ln.qty : g(ln, 'qty', 'legacyQty'),
        shipmentReceivedQty: has(ln, 'shipment_received_qty') ? ln.shipment_received_qty : g(ln, 'shipment_received_qty', 'shipmentReceivedQty'),
        siteSku: nonEmpty(g(ln, 'site_sku', 'siteSku')) ? str(g(ln, 'site_sku', 'siteSku')) : undefined,
        shippingPlanLineId: nonEmpty(g(ln, 'shipping_plan_line_id', 'shippingPlanLineId')) ? str(g(ln, 'shipping_plan_line_id', 'shippingPlanLineId')) : undefined
      };

      var shipInput = { shipment: shipObj, line: lineObj };
      var built = null;
      try { built = CAND.buildKmShipmentSupplyCandidate(shipInput); }
      catch (e) { issues.push({ i: i, reason: 'ADAPT_FAILED:' + (e && e.message ? e.message : e) }); continue; }

      // decorate the DTO with the resolver verdict (used by the MARKETPLACE adapter + parity assertions)
      built.receiverResolutionSource = rcv.source;
      built.receiverResolutionStatus = rcv.status;
      built.receiverResolutionReason = rcv.reason;

      shipmentInputs.push(shipInput);
      candidates.push({
        candidate: built, resolution: rcv, shipmentStatus: str(g(shipment, 'status', 'status')),
        headerScope: { company: str(g(shipment, 'company', 'company')), country: str(g(shipment, 'country', 'country')), marketplace: str(g(shipment, 'marketplace', 'marketplace')) }
      });
    }
    return { shipmentInputs: shipmentInputs, candidates: candidates, issues: issues };
  }

  // ONE bounded adapter: canonical candidate DTO → the KMDR marketplace-incoming candidate shape. Sets
  // destinationType='MARKETPLACE' (the receiver IS a marketplace via frozen lineage) so KMDR resolves receiver by
  // company/country/marketplace and does NOT treat the shipment's destination warehouse as a non-marketplace
  // exclusion. quantity = the R4 remaining (KMDR/KMQI must NOT re-derive physical qty). UNRESOLVED → blank
  // marketplace → KMDR identity fails closed (no invented split). No second quantity engine.
  function toMarketplaceIncomingCandidate(entry) {
    var c = (entry && entry.candidate) || {};
    return {
      destinationType: 'MARKETPLACE',
      company: str(c.company), country: str(c.country), marketplace: str(c.marketplace),
      sku: str(c.sku), status: c.status, eta: c.eta,
      quantity: c.quantityRemaining, quantityRemaining: c.quantityRemaining,
      ref: str(c.sourceLineRef), shipmentId: str(c.linkedShipmentId), lineageKey: str(c.lineageKey),
      supplyCandidateId: str(c.supplyCandidateId), shipmentLineId: str(c.linkedShipmentLineId),
      shippingPlanLineId: str(c.linkedShippingPlanLineId),
      receiverResolutionStatus: c.receiverResolutionStatus, receiverResolutionSource: c.receiverResolutionSource
    };
  }

  return {
    resolveShipmentLineReceiver: resolveShipmentLineReceiver,
    buildShipmentLineCandidates: buildShipmentLineCandidates,
    toMarketplaceIncomingCandidate: toMarketplaceIncomingCandidate,
    isSpecificReceiver: isSpecificReceiver,
    isMergedMarketplace: isMergedMarketplace
    , lineageSig: lineageSig, parseLineageMarker: parseLineageMarker   // XCO-R15G E1
    , shipmentLinkCountsFromRows: shipmentLinkCountsFromRows   // XCO-R15G E1E
  };
});

// XCO-R15G E1: the helpers live inside the factory (before indexBy); nothing is appended outside it.
// XCO-R15G-E1-CORE (xco-r15g-impl): patched

// XCO-R15G E1B: a removed line is never incoming (the predicate lives inside the factory as lineRemoved).
// XCO-R15G-E1B-CORE (xco-r15g-impl): patched

// XCO-R15G E1C: review fixes (inside the factory).
// XCO-R15G-E1C-CORE (xco-r15g-impl): patched

// XCO-R15G E1D: line_status (O-1) joins the removed-line predicate inside the factory.
// XCO-R15G-E1D-CORE-O1 (xco-r15g-impl): patched

// XCO-R15G E1E: shipmentLinkCountsFromRows (inside the factory).
// XCO-R15G-E1E-CORE (xco-r15g-impl): patched

// XCO-R15G P-1: an unreadable lineage marker counts as merged (fail closed).
// XCO-R15G-E1F-CORE-P1 (xco-r15g-impl): patched

// XCO-R15G option D detection (shipment level, data already read; used in every mode).
// XCO-R15G-OPTD-CORE (xco-r15g-impl): patched
