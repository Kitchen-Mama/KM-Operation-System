// Kitchen Mama Operation System — Pure Qualified Incoming Engine (B-4 Minimal Runtime, batch B4-R6).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC engine. Consumes VERIFIED adapter outputs — B4-R4 KM Shipment Incoming Adapter results and
// B4-R5 External Incoming Authority results — plus a canonical Required-By date and explicit already-posted /
// other-bucket lineage evidence, and projects the frozen SUPPLY_PLANNING_CALCULATION_RULES.md §2E ten-gate
// Qualified-Incoming / count-once predicate. It does NOT rebuild B4-R3 candidates, NOT rerun B4-R4/B4-R5, NOT
// redefine the B4-R4 Shipment status allowlist (it PROJECTS B4-R4 outcomes), and NOT read raw Shipment rows.
//
// ADMISSION PRE-GATE (§38): every external result stays planningEligible=false / adapterEligibleQuantity=0; external
// observed quantity is reported SEPARATELY and never enters qualified / late-risk / KM-excluded totals. Linked
// external evidence is visible but never counted apart from its KM Shipment; an adopted external row stays zero —
// only the resulting KM Shipment candidate may qualify (count-once).
//
// DEDUP uses ONLY stable physical lineage (candidate.lineageKey) — never SKU+ETA / quantity / warehouse / status /
// label / address / row order / timestamp. Identical same-lineage duplicates count once; conflicting same-lineage
// duplicates fail closed (whole group contributes zero). DATE contract (§2F/§6): ETA and Required-By are strict
// YYYY-MM-DD, real-calendar validated, compared LEXICALLY — no Date constructor, no clock, no timezone, no locale.
//
// It modifies no Shipment, no inventory, no Ledger; resolves no PO/Plan Runtime; calls no calculateGap; creates no
// recommendation; persists nothing. No Sheet/DB/API/UI, no mutation.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.qualifiedIncoming = api;
  }
})(this, function () {
  'use strict';

  var KM_ADAPTER_TYPE = 'KM_SHIPMENT_INCOMING';
  var EXTERNAL_ADAPTER_TYPE = 'EXTERNAL_INCOMING_AUTHORITY';

  // The exact §2E ten gates, in canonical order. Each result carries a PASS / FAIL / REVIEW for every one.
  var GATE_KEYS = [
    'MASTER_SKU_MATCH',                   // 1
    'COMPANY_MATCH',                      // 2
    'DESTINATION_OR_SERVICE_SCOPE_MATCH', // 3
    'TABLE_STATUS_QUALIFIED',             // 4
    'ETA_RESOLVED',                       // 5
    'ETA_ON_OR_BEFORE_REQUIRED_BY',       // 6
    'REMAINING_QUANTITY_POSITIVE',        // 7
    'NOT_EXCLUDED_LIFECYCLE_STATE',       // 8
    'NOT_POSTED_TO_CURRENT_STOCK',        // 9
    'COUNT_ONCE_OWNERSHIP'                // 10
  ];
  // Non-time gates whose FAIL is a deterministic EXCLUDED (gate 6 is the time gate → LATE_RISK, not EXCLUDED).
  var EXCLUDING_GATES = [
    'MASTER_SKU_MATCH', 'COMPANY_MATCH', 'DESTINATION_OR_SERVICE_SCOPE_MATCH', 'TABLE_STATUS_QUALIFIED',
    'REMAINING_QUANTITY_POSITIVE', 'NOT_EXCLUDED_LIFECYCLE_STATE', 'NOT_POSTED_TO_CURRENT_STOCK', 'COUNT_ONCE_OWNERSHIP'
  ];

  // Canonical order for the B4-R6-specific reason tokens (upstream B4-R4/B4-R5 reasons are preserved first).
  var B4R6_EXCLUSION_ORDER = [
    'SOURCE_ADAPTER_NOT_ELIGIBLE', 'DUPLICATE_STABLE_LINEAGE', 'POSTED_TO_CURRENT_STOCK', 'ACTIVE_IN_OTHER_BUCKET'
  ];
  var B4R6_REVIEW_ORDER = ['ETA_MISSING', 'ETA_INVALID', 'DUPLICATE_LINEAGE_CONFLICT'];
  var B4R6_INFO_ORDER = ['ETA_AFTER_REQUIRED_BY', 'LINKED_EXTERNAL_EVIDENCE_PRESENT'];
  var SUMMARY_ORDER = B4R6_EXCLUSION_ORDER.concat(B4R6_REVIEW_ORDER).concat(B4R6_INFO_ORDER);

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function isFinitePositive(n) { return typeof n === 'number' && isFinite(n) && n > 0; }
  function finitePosOrZero(n) { return isFinitePositive(n) ? n : 0; }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  // ---- Strict date contract (§2F / §6): YYYY-MM-DD, real calendar, lexical comparison; NO Date constructor ----
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isRealCalendarDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var mdays = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= mdays[m - 1];
  }
  function isValidIsoDate(s) {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    return isRealCalendarDate(parseInt(s.slice(0, 4), 10), parseInt(s.slice(5, 7), 10), parseInt(s.slice(8, 10), 10));
  }

  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonBlankString(v, name) {
    if (v === null || v === undefined) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' is required (got ' + describe(v) + ')');
    if (typeof v !== 'string') throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (v.trim() === '') throw new RangeError('evaluateQualifiedIncoming: ' + name + ' must be a non-empty string');
    return v;
  }
  function requireStrictDate(v, name) {
    requireNonBlankString(v, name);
    if (!DATE_RE.test(v)) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
    if (!isValidIsoDate(v)) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' is not a real calendar date ("' + v + '")');
    return v;
  }

  function hasToken(arr, t) { return Array.isArray(arr) && arr.indexOf(t) >= 0; }

  // Merge preserving upstream order first, then appending new tokens in canonical order; unique.
  function mergeReasons(upstream, addSet, canonicalOrder) {
    var out = [], seen = {};
    if (Array.isArray(upstream)) {
      for (var i = 0; i < upstream.length; i++) { if (!seen[upstream[i]]) { seen[upstream[i]] = 1; out.push(upstream[i]); } }
    }
    for (var j = 0; j < canonicalOrder.length; j++) {
      var t = canonicalOrder[j];
      if (addSet[t] && !seen[t]) { seen[t] = 1; out.push(t); }
    }
    return out;
  }

  // Fresh shallow snapshot of an adapter's candidate object (does not expose the input candidate reference).
  function snapshotCandidate(c) {
    var out = {};
    for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k]; }
    return out;
  }

  // Decision-equivalent fingerprint for same-lineage duplicate detection (§12). Order-stable, business fields only.
  function fingerprint(res) {
    var c = res.candidate || {};
    return JSON.stringify([
      c.supplyCandidateId, c.sourceLineRef, c.linkedShipmentId, c.linkedShipmentLineId,
      c.company, c.country, c.marketplace, c.sku, c.destinationWarehouseId, c.status, c.eta, c.quantityRemaining,
      res.sourceEligible, res.adapterEligibleQuantity, res.statusClass,
      Array.isArray(res.exclusionReasons) ? res.exclusionReasons : null,
      Array.isArray(res.reviewReasons) ? res.reviewReasons : null
    ]);
  }

  /**
   * evaluateQualifiedIncoming(input) → one fresh, deterministic Qualified-Incoming engine result.
   * input = { requiredByDate, kmShipmentResults, externalAuthorityResults?, postedToCurrentStockLineageKeys?,
   *           activeOtherBucketLineageKeys? }. Consumes VERIFIED B4-R4 / B4-R5 adapter outputs (never raw rows).
   */
  function evaluateQualifiedIncoming(input) {
    requireObject(input, 'input');
    var requiredByDate = requireStrictDate(input.requiredByDate, 'input.requiredByDate');

    var kmResults = requireArray(input.kmShipmentResults, 'input.kmShipmentResults');
    var externalResults = input.externalAuthorityResults === undefined || input.externalAuthorityResults === null
      ? [] : requireArray(input.externalAuthorityResults, 'input.externalAuthorityResults');
    var postedKeysArr = input.postedToCurrentStockLineageKeys === undefined || input.postedToCurrentStockLineageKeys === null
      ? [] : requireArray(input.postedToCurrentStockLineageKeys, 'input.postedToCurrentStockLineageKeys');
    var otherBucketArr = input.activeOtherBucketLineageKeys === undefined || input.activeOtherBucketLineageKeys === null
      ? [] : requireArray(input.activeOtherBucketLineageKeys, 'input.activeOtherBucketLineageKeys');

    // Validate lineage-key evidence sets (exact-match only; nonblank strings).
    var postedSet = {}, otherSet = {};
    postedKeysArr.forEach(function (k, i) { requireNonBlankString(k, 'input.postedToCurrentStockLineageKeys[' + i + ']'); postedSet[k] = 1; });
    otherBucketArr.forEach(function (k, i) { requireNonBlankString(k, 'input.activeOtherBucketLineageKeys[' + i + ']'); otherSet[k] = 1; });

    // Validate KM adapter results structurally.
    kmResults.forEach(function (r, i) {
      requireObject(r, 'input.kmShipmentResults[' + i + ']');
      if (r.adapterType !== KM_ADAPTER_TYPE) throw new TypeError('evaluateQualifiedIncoming: kmShipmentResults[' + i + '].adapterType must be ' + KM_ADAPTER_TYPE + ' (got ' + describe(r.adapterType) + ')');
      requireObject(r.candidate, 'input.kmShipmentResults[' + i + '].candidate');
      requireNonBlankString(r.candidate.lineageKey, 'input.kmShipmentResults[' + i + '].candidate.lineageKey');
      requireNonBlankString(r.candidate.supplyCandidateId, 'input.kmShipmentResults[' + i + '].candidate.supplyCandidateId');
      requireNonBlankString(r.candidate.sourceLineRef, 'input.kmShipmentResults[' + i + '].candidate.sourceLineRef');
    });

    // Validate external results + enforce the §38 zero-contribution invariant (fail closed on any positive external).
    externalResults.forEach(function (r, i) {
      requireObject(r, 'input.externalAuthorityResults[' + i + ']');
      if (r.adapterType !== EXTERNAL_ADAPTER_TYPE) throw new TypeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].adapterType must be ' + EXTERNAL_ADAPTER_TYPE + ' (got ' + describe(r.adapterType) + ')');
      if (r.planningEligible !== false) throw new RangeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].planningEligible must be false (external records never contribute to planning)');
      if (r.adapterEligibleQuantity !== 0) throw new RangeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].adapterEligibleQuantity must be 0 (external records never contribute to planning)');
    });

    // ---- Dedup pass: group by exact lineageKey; classify each group single / identical-dup / conflict. ----
    var groups = {}, groupOrder = [];
    kmResults.forEach(function (r, i) {
      var key = r.candidate.lineageKey;
      if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push({ res: r, idx: i });
    });
    // Per original index → dedup role + which KM linkedShipmentIds are present (for external linkage marking).
    var dupRole = new Array(kmResults.length);       // 'SINGLE' | 'REP_IDENTICAL' | 'DUP_IDENTICAL' | 'CONFLICT'
    groupOrder.forEach(function (key) {
      var members = groups[key];
      if (members.length === 1) { dupRole[members[0].idx] = 'SINGLE'; return; }
      var fp0 = fingerprint(members[0].res), identical = true;
      for (var m = 1; m < members.length; m++) { if (fingerprint(members[m].res) !== fp0) { identical = false; break; } }
      if (identical) {
        // representative = the member with the lowest original index (order-independent aggregate result).
        var repIdx = members[0].idx;
        for (var n = 1; n < members.length; n++) { if (members[n].idx < repIdx) repIdx = members[n].idx; }
        members.forEach(function (mm) { dupRole[mm.idx] = (mm.idx === repIdx) ? 'REP_IDENTICAL' : 'DUP_IDENTICAL'; });
      } else {
        members.forEach(function (mm) { dupRole[mm.idx] = 'CONFLICT'; });
      }
    });

    // Which KM linkedShipmentIds exist (for LINKED_EXTERNAL_EVIDENCE_PRESENT informational marking).
    var kmLinkedShipmentIds = {};
    kmResults.forEach(function (r) { var sid = r.candidate.linkedShipmentId; if (!isBlank(sid)) kmLinkedShipmentIds[String(sid)] = 1; });
    var externalLinkedShipmentIds = {};
    externalResults.forEach(function (r) {
      if (r.linkedEvidence === true && r.candidate && !isBlank(r.candidate.linkedShipmentId)) externalLinkedShipmentIds[String(r.candidate.linkedShipmentId)] = 1;
    });

    // ---- Per-KM-result ten-gate evaluation + classification. ----
    var summarySet = {};
    var candidateResults = kmResults.map(function (r, i) {
      var c = r.candidate;
      var role = dupRole[i];
      var exclAdd = {}, reviewAdd = {}, infoAdd = {};
      var gate = {};

      var etaResolved = r.etaPresent === true && isValidIsoDate(c.eta);
      var etaMissing = r.etaPresent !== true || isBlank(c.eta);
      var etaInvalid = !etaMissing && !isValidIsoDate(c.eta);

      // Gate 1 — Master SKU.
      gate.MASTER_SKU_MATCH = (!hasToken(r.exclusionReasons, 'SKU_SCOPE_MISMATCH') && !isBlank(c.sku)) ? 'PASS' : 'FAIL';
      // Gate 2 — Company (mismatch = FAIL; missing = REVIEW).
      gate.COMPANY_MATCH = hasToken(r.exclusionReasons, 'COMPANY_SCOPE_MISMATCH') ? 'FAIL'
        : ((isBlank(c.company) || hasToken(r.reviewReasons, 'MISSING_COMPANY')) ? 'REVIEW' : 'PASS');
      // Gate 3 — Destination / service scope (mismatch = FAIL; missing = REVIEW). No service-scope path in minimal Shipment flow.
      gate.DESTINATION_OR_SERVICE_SCOPE_MATCH = hasToken(r.exclusionReasons, 'DESTINATION_SCOPE_MISMATCH') ? 'FAIL'
        : ((hasToken(r.reviewReasons, 'MISSING_DESTINATION_IDENTITY') || isBlank(c.destinationWarehouseId) || c.destinationIdentitySource === 'MISSING') ? 'REVIEW' : 'PASS');
      // Gate 4 — Table status qualified (PROJECT B4-R4; do not redefine the allowlist).
      gate.TABLE_STATUS_QUALIFIED = (r.statusEligible === true && r.statusClass === 'ELIGIBLE_INCOMING_STATUS') ? 'PASS'
        : ((r.statusClass === 'MISSING_STATUS' || r.statusClass === 'UNKNOWN_STATUS') ? 'REVIEW' : 'FAIL');
      // Gate 5 — ETA resolved.
      gate.ETA_RESOLVED = etaResolved ? 'PASS' : 'REVIEW';
      if (etaMissing) reviewAdd.ETA_MISSING = 1;
      else if (etaInvalid) reviewAdd.ETA_INVALID = 1;
      // Gate 6 — ETA <= Required-By (lexical, strict dates only).
      if (!etaResolved) gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'REVIEW';
      else if (c.eta <= requiredByDate) gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'PASS';
      else { gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'FAIL'; infoAdd.ETA_AFTER_REQUIRED_BY = 1; }
      // Gate 7 — Remaining unconsumed quantity > 0 (§2E.7). Projects the PHYSICAL quantity: B4-R4 quantityEligible +
      // candidate.quantityRemaining finite > 0. It deliberately does NOT require adapterEligibleQuantity > 0, because
      // adapterEligibleQuantity is itself zeroed whenever sourceEligible is false (ETA/status/scope) — folding it in
      // here would double-count those gates and force an ETA/status/scope REVIEW row into a false EXCLUDED. The
      // QUALIFIED quantity OUTPUT still uses adapterEligibleQuantity (which equals quantityRemaining once eligible).
      gate.REMAINING_QUANTITY_POSITIVE = (r.quantityEligible === true && isFinitePositive(c.quantityRemaining)) ? 'PASS' : 'FAIL';
      // Gate 8 — Not excluded lifecycle state.
      gate.NOT_EXCLUDED_LIFECYCLE_STATE = (r.statusClass === 'ELIGIBLE_INCOMING_STATUS' && !hasToken(r.exclusionReasons, 'STATUS_NOT_ELIGIBLE')) ? 'PASS'
        : ((r.statusClass === 'MISSING_STATUS' || r.statusClass === 'UNKNOWN_STATUS') ? 'REVIEW' : 'FAIL');
      // Gate 9 — Not posted to Current Stock (exact lineage evidence only).
      var posted = postedSet[c.lineageKey] === 1;
      gate.NOT_POSTED_TO_CURRENT_STOCK = posted ? 'FAIL' : 'PASS';
      if (posted) exclAdd.POSTED_TO_CURRENT_STOCK = 1;
      // Gate 10 — Count-once ownership (dedup conflict / nonrep duplicate / other-bucket evidence).
      var inOtherBucket = otherSet[c.lineageKey] === 1;
      var gate10Fail = false;
      if (role === 'CONFLICT') { gate10Fail = true; reviewAdd.DUPLICATE_LINEAGE_CONFLICT = 1; }
      if (role === 'DUP_IDENTICAL') { gate10Fail = true; exclAdd.DUPLICATE_STABLE_LINEAGE = 1; }
      if (inOtherBucket) { gate10Fail = true; exclAdd.ACTIVE_IN_OTHER_BUCKET = 1; }
      gate.COUNT_ONCE_OWNERSHIP = gate10Fail ? 'FAIL' : 'PASS';

      if (r.sourceEligible !== true) exclAdd.SOURCE_ADAPTER_NOT_ELIGIBLE = 1;
      if (!isBlank(c.linkedShipmentId) && externalLinkedShipmentIds[String(c.linkedShipmentId)] === 1) infoAdd.LINKED_EXTERNAL_EVIDENCE_PRESENT = 1;

      // ---- Classification precedence (§16): EXCLUDED > REVIEW > LATE_RISK > QUALIFIED. ----
      var anyExcludingFail = EXCLUDING_GATES.some(function (g) { return gate[g] === 'FAIL'; });
      var anyReview = GATE_KEYS.some(function (g) { return gate[g] === 'REVIEW'; });
      var state;
      if (anyExcludingFail) state = 'EXCLUDED';
      else if (anyReview) state = 'REVIEW';
      else if (gate.ETA_ON_OR_BEFORE_REQUIRED_BY === 'FAIL') state = 'LATE_RISK';
      else state = 'QUALIFIED';
      // §15 hard guard: a B4-R4 result the source adapter deemed ineligible can never become Qualified Incoming,
      // even if every projected gate happens to pass (e.g. a tampered authority/source/domain the gates don't test).
      if (state === 'QUALIFIED' && r.sourceEligible !== true) state = 'EXCLUDED';

      // ---- Quantity contract (§17). ----
      var qualifiedQuantity = 0, lateRiskQuantity = 0, excludedQuantity = 0, reviewQuantity = 0;
      if (state === 'QUALIFIED') qualifiedQuantity = r.adapterEligibleQuantity;
      else if (state === 'LATE_RISK') lateRiskQuantity = r.adapterEligibleQuantity;
      else if (state === 'REVIEW') reviewQuantity = finitePosOrZero(c.quantityRemaining);
      else /* EXCLUDED */ excludedQuantity = (role === 'DUP_IDENTICAL') ? 0 : finitePosOrZero(c.quantityRemaining);

      var exclusionReasons = mergeReasons(r.exclusionReasons, exclAdd, B4R6_EXCLUSION_ORDER);
      var reviewReasons = mergeReasons(r.reviewReasons, reviewAdd, B4R6_REVIEW_ORDER);
      var informationalReasons = mergeReasons([], infoAdd, B4R6_INFO_ORDER);
      [exclAdd, reviewAdd, infoAdd].forEach(function (set) { for (var t in set) { if (set[t]) summarySet[t] = 1; } });

      return {
        candidate: snapshotCandidate(c),
        lineageKey: c.lineageKey,
        qualificationState: state,
        qualifiedQuantity: qualifiedQuantity,
        lateRiskQuantity: lateRiskQuantity,
        excludedQuantity: excludedQuantity,
        reviewQuantity: reviewQuantity,
        gateResults: gate,
        exclusionReasons: exclusionReasons,
        reviewReasons: reviewReasons,
        informationalReasons: informationalReasons
      };
    });

    // ---- External results echo (fresh snapshots) + separate audit aggregates. ----
    var externalObservedQuantity = 0, linkedExternalEvidenceCount = 0, quarantinedExternalCount = 0,
        adoptedExternalCount = 0, adoptionPendingCount = 0;
    var externalResultsOut = externalResults.map(function (r) {
      var obs = finitePosOrZero(r.observedQuantity);
      externalObservedQuantity += obs;
      if (r.linkedEvidence === true) linkedExternalEvidenceCount++;
      if (r.quarantined === true) quarantinedExternalCount++;
      if (r.adoptedToKm === true) adoptedExternalCount++;
      if (r.stateClass === 'ADOPTION_REVIEW_PENDING') adoptionPendingCount++;
      return {
        candidate: r.candidate ? snapshotCandidate(r.candidate) : null,
        adapterType: EXTERNAL_ADAPTER_TYPE,
        planningEligible: false,
        adapterEligibleQuantity: 0,
        observedQuantity: obs,
        stateClass: r.stateClass,
        linkedEvidence: r.linkedEvidence === true,
        quarantined: r.quarantined === true,
        adoptedToKm: r.adoptedToKm === true,
        exclusionReasons: Array.isArray(r.exclusionReasons) ? r.exclusionReasons.slice() : [],
        reviewReasons: Array.isArray(r.reviewReasons) ? r.reviewReasons.slice() : []
      };
    });

    // ---- Engine aggregates. External observed quantity stays OUT of qualified / late / excluded KM totals. ----
    var qualifiedIncomingQuantity = 0, lateRiskQuantity = 0, excludedIncomingQuantity = 0, reviewIncomingQuantity = 0;
    candidateResults.forEach(function (cr) {
      qualifiedIncomingQuantity += cr.qualifiedQuantity;
      lateRiskQuantity += cr.lateRiskQuantity;
      excludedIncomingQuantity += cr.excludedQuantity;
      reviewIncomingQuantity += cr.reviewQuantity;
    });

    var summaryReasons = [];
    for (var s = 0; s < SUMMARY_ORDER.length; s++) { if (summarySet[SUMMARY_ORDER[s]]) summaryReasons.push(SUMMARY_ORDER[s]); }

    return {
      engineType: 'QUALIFIED_INCOMING',
      requiredByDate: requiredByDate,
      qualifiedIncomingQuantity: qualifiedIncomingQuantity, // canonical timely Incoming (B4-R7 → calculateGap.timelyQualifiedIncoming)
      lateRiskQuantity: lateRiskQuantity,
      excludedIncomingQuantity: excludedIncomingQuantity,
      reviewIncomingQuantity: reviewIncomingQuantity,
      kmCandidateCount: kmResults.length,
      deduplicatedKmCandidateCount: groupOrder.length,
      externalObservationCount: externalResults.length,
      externalObservedQuantity: externalObservedQuantity, // reported SEPARATELY; never summed into planning totals
      linkedExternalEvidenceCount: linkedExternalEvidenceCount,
      quarantinedExternalCount: quarantinedExternalCount,
      adoptedExternalCount: adoptedExternalCount,
      adoptionPendingCount: adoptionPendingCount,
      candidateResults: candidateResults,
      externalResults: externalResultsOut,
      summaryReasons: summaryReasons
    };
  }

  return { evaluateQualifiedIncoming: evaluateQualifiedIncoming };
});
