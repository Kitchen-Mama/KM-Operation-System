// Kitchen Mama Operation System — External Incoming Authority Fail-Closed Adapter (B-4 Minimal Runtime, batch B4-R5).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC adapter. Consumes ONE normalized external incoming observation (3PL / OMS / WMS inbound)
// and returns ONE deterministic fail-closed authority classification. It answers only: stable external identity,
// external authority/admission state, KM linkage presence, quarantine/pending/rejected/ignored/superseded/reversed
// classification, deterministic exclusion/review reasons, the external quantity still visible for audit, and the
// planning quantity allowed to proceed.
//
// AUTHORITY CONTRACT (SUPPLY_PLANNING_CALCULATION_RULES.md §38 · SUPPLY_CHAIN_SYSTEM_FLOW.md §12): the KM Operation
// System is the sole internal planning authority. An external record NEVER contributes to planning independently —
// not because it is fresh, complete, known-SKU, known-warehouse, positive-qty, has-ETA, in a valid external status,
// or has a stable external id. For EVERY external record: planningEligible = false and adapterEligibleQuantity = 0.
// Linked external records are execution evidence only (the KM Shipment stays the sole Incoming owner). Adopted rows
// still contribute 0 directly — only the resulting KM canonical Shipment/Operation may enter planning (count-once).
//
// This adapter CLASSIFIES ONLY. It performs no Link/Adopt/Reject/Ignore write, no KM Shipment/Operation creation,
// no notification, no ingestion, no reconciliation update, no state transition, no dedup, no ownership precedence,
// no Required-By/ETA-late comparison, no final Qualified Incoming, no calculateGap, no persistence. No Sheet/DB/API/
// UI, no clock, no locale, no mutation. It does NOT accept a KM Shipment candidate (KM_SHIPMENT_LINE fails closed).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.externalIncomingAdapters = api;
  }
})(this, function () {
  'use strict';

  // Accepted external inbound source types (this B-4 Incoming adapter — NOT outbound, NOT platform/FBA, NOT KM).
  var SUPPORTED_SOURCE_TYPES = { EXTERNAL_INBOUND_RECORD: 1, EXTERNAL_WMS_INBOUND: 1, EXTERNAL_OMS_INBOUND: 1 };
  var SUPPORTED_DOMAIN = 'EXTERNAL_3PL_OVERSEAS';

  // Normalized authority/admission state → { cls: deterministic stateClass, excl: state-specific exclusion reason }.
  var STATE_MAP = {
    LINKED_EXTERNAL_EVIDENCE:      { cls: 'LINKED_EVIDENCE_ONLY',             excl: 'LINKED_EXTERNAL_EVIDENCE_ONLY' },
    EXTERNAL_UNLINKED_QUARANTINED: { cls: 'QUARANTINED_UNLINKED',            excl: 'EXTERNAL_UNLINKED_QUARANTINED' },
    ADOPTION_PENDING:              { cls: 'ADOPTION_REVIEW_PENDING',         excl: 'ADOPTION_PENDING' },
    ADOPTED_TO_KM:                 { cls: 'ADOPTED_USE_KM_CANONICAL_RECORD', excl: 'ADOPTED_USE_KM_CANONICAL_RECORD' },
    REJECTED_EXTERNAL_RECORD:      { cls: 'REJECTED',                        excl: 'REJECTED_EXTERNAL_RECORD' },
    IGNORED_FOR_PLANNING:          { cls: 'IGNORED',                         excl: 'IGNORED_FOR_PLANNING' },
    SUPERSEDED:                    { cls: 'SUPERSEDED',                      excl: 'SUPERSEDED_EXTERNAL_RECORD' },
    REVERSED:                      { cls: 'REVERSED',                        excl: 'REVERSED_EXTERNAL_RECORD' }
  };

  // Deterministic canonical ordering for reason arrays (output is always emitted in this order, unique).
  var EXCLUSION_ORDER = [
    'EXTERNAL_RECORD_NOT_PLANNING_AUTHORITY',
    'SOURCE_TYPE_NOT_SUPPORTED', 'DOMAIN_NOT_SUPPORTED',
    'LINKED_EXTERNAL_EVIDENCE_ONLY', 'EXTERNAL_UNLINKED_QUARANTINED', 'ADOPTION_PENDING',
    'ADOPTED_USE_KM_CANONICAL_RECORD', 'REJECTED_EXTERNAL_RECORD', 'IGNORED_FOR_PLANNING',
    'SUPERSEDED_EXTERNAL_RECORD', 'REVERSED_EXTERNAL_RECORD'
  ];
  var REVIEW_ORDER = [
    'EXTERNAL_IDENTITY_INCOMPLETE', 'MISSING_AUTHORITY_STATE', 'UNKNOWN_AUTHORITY_STATE',
    'LINKAGE_MISSING', 'ADOPTED_KM_LINK_MISSING', 'QUARANTINE_LINKAGE_CONFLICT',
    'INVALID_EXTERNAL_QUANTITY', 'MISSING_EXTERNAL_ETA', 'MISSING_EXTERNAL_SOURCE_TIMESTAMP',
    'NEEDS_RECONCILIATION'
  ];

  // Input reconciliation/review tokens that legitimately request reconciliation (NEEDS_RECONCILIATION review reason).
  var NEEDS_RECON_TOKENS = { needs_reconciliation: 1, discrepancy: 1, mismatch: 1, reconcile: 1 };

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

  function requireObject(v, name) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new TypeError('adaptExternalIncomingAuthority: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    }
    return v;
  }
  // Minimal cross-adapter anchor: SKU. Non-string → TypeError; missing/blank → RangeError.
  function requireStringField(v, name) {
    if (v === null || v === undefined) throw new RangeError('adaptExternalIncomingAuthority: ' + name + ' is required (got ' + describe(v) + ')');
    if (typeof v !== 'string') throw new TypeError('adaptExternalIncomingAuthority: ' + name + ' must be a string (got ' + describe(v) + ')');
    var t = v.trim();
    if (t === '') throw new RangeError('adaptExternalIncomingAuthority: ' + name + ' must be a non-empty string');
    return t;
  }

  // Authority state normalized by trim ONLY (canonical enum tokens are UPPERCASE; never lowercased or defaulted).
  function classifyAuthorityState(raw) {
    if (raw === null || raw === undefined) return { cls: 'MISSING_AUTHORITY_STATE', excl: null, known: false, missing: true };
    var s = String(raw).trim();
    if (s === '') return { cls: 'MISSING_AUTHORITY_STATE', excl: null, known: false, missing: true };
    if (STATE_MAP[s]) return { cls: STATE_MAP[s].cls, excl: STATE_MAP[s].excl, known: true, missing: false };
    return { cls: 'UNKNOWN_AUTHORITY_STATE', excl: null, known: false, missing: false };
  }

  function orderUnique(order, set) {
    var out = [];
    for (var i = 0; i < order.length; i++) { if (set[order[i]]) out.push(order[i]); }
    return out;
  }

  /**
   * adaptExternalIncomingAuthority({ candidate }) → one fresh, deterministic, fail-closed external authority result.
   * candidate = one normalized external incoming observation (supplied by a future external-source adapter/fixture;
   * B4-R5 does NOT implement the importer/source-row mapper). Structural input/candidate shape and a blank/non-string
   * SKU anchor throw TypeError/RangeError; every OTHER external defect (incomplete identity, missing/unknown authority,
   * unsupported source/domain, linkage defects, invalid quantity) fails CLOSED via deterministic classification — the
   * external record stays visible and auditable, never disappears. planningEligible is ALWAYS false;
   * adapterEligibleQuantity is ALWAYS 0.
   */
  function adaptExternalIncomingAuthority(input) {
    requireObject(input, 'input');
    var candidate = requireObject(input.candidate, 'input.candidate');

    // Minimal structural anchor (blank/non-string → throw). Everything external-specific below fails closed instead.
    requireStringField(candidate.sku, 'input.candidate.sku');

    var exSet = {}, rvSet = {};
    function excl(t) { exSet[t] = 1; }
    function review(t) { rvSet[t] = 1; }

    // Every structurally accepted external record is, by contract, NEVER a planning authority.
    excl('EXTERNAL_RECORD_NOT_PLANNING_AUTHORITY');

    // Source type + domain boundary (unsupported / outbound / platform-FBA / KM_SHIPMENT_LINE → fail closed).
    if (!SUPPORTED_SOURCE_TYPES[candidate.sourceType]) excl('SOURCE_TYPE_NOT_SUPPORTED');
    if (candidate.supplyDomain !== SUPPORTED_DOMAIN) excl('DOMAIN_NOT_SUPPORTED');

    // Stable external identity completeness (identity is NEVER minted from SKU+ETA/qty/label/address/row/timestamp).
    var identityIncomplete =
      isBlank(candidate.externalCandidateId) || isBlank(candidate.provider) ||
      isBlank(candidate.externalAccountRef) || isBlank(candidate.externalOperationRef) ||
      isBlank(candidate.externalLineRef);
    if (identityIncomplete) review('EXTERNAL_IDENTITY_INCOMPLETE');

    // Authority/admission state classification (missing/unknown fail closed; no default to linked/adopted/admitted).
    var st = classifyAuthorityState(candidate.authorityState);
    var stateClass = st.cls;
    if (st.excl) excl(st.excl);
    if (st.missing) review('MISSING_AUTHORITY_STATE');
    else if (!st.known) review('UNKNOWN_AUTHORITY_STATE');

    // Linkage presence (stable KM linkage only; the adapter performs NO state transition).
    var hasShipmentLink = !isBlank(candidate.linkedShipmentId);
    var hasOperationLink = !isBlank(candidate.linkedOperationId);
    var hasAnyLink = hasShipmentLink || hasOperationLink;
    if (stateClass === 'LINKED_EVIDENCE_ONLY' && !hasAnyLink) review('LINKAGE_MISSING');
    if (stateClass === 'ADOPTED_USE_KM_CANONICAL_RECORD' && !hasAnyLink) review('ADOPTED_KM_LINK_MISSING');
    if (stateClass === 'QUARANTINED_UNLINKED' && hasAnyLink) review('QUARANTINE_LINKAGE_CONFLICT');

    // Observed quantity — audit projection ONLY (never planning-eligible, never coerced from a string).
    var rawQty = candidate.quantityObserved;
    var observedQuantity = 0;
    if (rawQty === null || rawQty === undefined) {
      // absent — no positive planning effect, not flagged invalid
    } else if (typeof rawQty === 'number' && isFinite(rawQty) && rawQty >= 0) {
      observedQuantity = rawQty;
    } else {
      review('INVALID_EXTERNAL_QUANTITY'); // negative / NaN / Infinity / string / other non-number
    }

    // ETA / source timestamp — preserved only; NEVER parsed, compared to Required-By, or freshness-evaluated.
    if (isBlank(candidate.eta)) review('MISSING_EXTERNAL_ETA');
    if (isBlank(candidate.sourceUpdatedAt)) review('MISSING_EXTERNAL_SOURCE_TIMESTAMP');

    // Reconciliation — only when the input reconciliation/review state legitimately requests it.
    if (NEEDS_RECON_TOKENS[normToken(candidate.reconciliationState)] || NEEDS_RECON_TOKENS[normToken(candidate.reviewStatus)]) {
      review('NEEDS_RECONCILIATION');
    }

    var linkedEvidence = stateClass === 'LINKED_EVIDENCE_ONLY';
    var quarantined = stateClass === 'QUARANTINED_UNLINKED';
    var adoptedToKm = stateClass === 'ADOPTED_USE_KM_CANONICAL_RECORD';

    var reviewReasons = orderUnique(REVIEW_ORDER, rvSet);
    // Human review: any review reason, OR an inherently unresolved state (quarantine / adoption-pending / missing /
    // unknown authority). A clean linked-evidence / decided / adopted row with no defect needs no review — but even
    // then it stays planning-ineligible with quantity 0.
    var requiresHumanReview = reviewReasons.length > 0 ||
      stateClass === 'QUARANTINED_UNLINKED' || stateClass === 'ADOPTION_REVIEW_PENDING' ||
      stateClass === 'MISSING_AUTHORITY_STATE' || stateClass === 'UNKNOWN_AUTHORITY_STATE';

    return {
      // Fresh isolated snapshot of the normalized external observation (does NOT expose the input candidate ref).
      // Values are preserved VERBATIM as normalized upstream — no parse, no clock, no locale, no coercion here.
      candidate: {
        externalCandidateId: candidate.externalCandidateId,
        sourceType: candidate.sourceType,
        supplyDomain: candidate.supplyDomain,
        authorityState: candidate.authorityState,
        provider: candidate.provider,
        externalAccountRef: candidate.externalAccountRef,
        externalOperationRef: candidate.externalOperationRef,
        externalLineRef: candidate.externalLineRef,
        company: candidate.company,
        country: candidate.country,
        marketplace: candidate.marketplace,
        sku: candidate.sku,
        siteSku: candidate.siteSku,
        destinationWarehouseId: candidate.destinationWarehouseId,
        quantityObserved: candidate.quantityObserved, // raw observed value retained unchanged (audit)
        eta: candidate.eta,
        sourceUpdatedAt: candidate.sourceUpdatedAt,
        linkedShipmentId: candidate.linkedShipmentId,
        linkedShipmentLineId: candidate.linkedShipmentLineId,
        linkedOperationId: candidate.linkedOperationId,
        reviewStatus: candidate.reviewStatus,
        reconciliationState: candidate.reconciliationState
      },
      adapterType: 'EXTERNAL_INCOMING_AUTHORITY',
      planningEligible: false,          // INVARIANT — an external record is never independently planning-eligible
      adapterEligibleQuantity: 0,       // INVARIANT — external planning contribution is always 0
      observedQuantity: observedQuantity, // audit-visible only; never a planning quantity
      stateClass: stateClass,
      linkedEvidence: linkedEvidence,
      quarantined: quarantined,
      adoptedToKm: adoptedToKm,
      requiresHumanReview: requiresHumanReview,
      exclusionReasons: orderUnique(EXCLUSION_ORDER, exSet),
      reviewReasons: reviewReasons
    };
  }

  return { adaptExternalIncomingAuthority: adaptExternalIncomingAuthority };
});
