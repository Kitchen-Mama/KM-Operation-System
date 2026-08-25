// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 67_api_v1_allocation_draft_identity.gs — F1-7N-FB-3C §C  RAD-M / duplicate-identity reconciliation (READ ONLY)
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER. No imports.
// ------------------------------------------------------------
// WHY THIS EXISTS. Under the LIVE flat-V2 cutover a canonical allocation draft has a DETERMINISTIC primary key:
//     RD::MONTHLY_ORDER::<YYYY-MM>::company=..|country=..|draft_purpose=..|marketplace=..|sku=..
// The retired R4E5B Send path minted a DIFFERENT id for the same business scope —
//     RAD-M-<COMPANY>-<COUNTRY>-<MARKETPLACE>-<SKU>-<YEAR>
// so rows written by it are invisible to KMRDV2P.readActiveFlatForScope (which addresses rows by the canonical
// identity), and they can coexist with a canonical row for the SAME company/country/marketplace/sku. FB-3C makes
// that collision a fail-closed DUPLICATE_BUSINESS_IDENTITY refusal in the Send workset rather than a silent
// pick-one, which is safe — and immediately raises the operator's real question: WHICH rows are affected, and
// what should happen to each one?
//
// This file answers that question and NOTHING else. It is STRICTLY READ-ONLY, and structurally so rather than by
// promise: it contains no appendRow, no setValue(s), no insertSheet, no deleteRow, no sheet-ensure, no
// LockService, no DriveApp, no MailApp and no call to any business handler. A regression test asserts every one
// of those absences against comment- and string-stripped source.
//
// IT PROPOSES; IT NEVER MIGRATES. §C is explicit: "Do not migrate or delete live rows in this task." The
// migration plan it emits is idempotent BY DESIGN (every step is addressed by a deterministic canonical id, so
// re-running it converges) but executing it stays a separate, USER-AUTHORIZED action.
//
// IDENTIFIER MASKING. Draft ids embed the company, country, marketplace and SKU, so a full id is business data.
// Ids are therefore MASKED in every output: the shape and enough of the tail to correlate a row by eye, never
// the whole string. The scope is reported in its own named fields instead, which is what an operator actually
// needs to find the row.
// ============================================================

var ADI_BUILD_VERSION_ = 'F1-7N-FB-3C';
var ADI_DRAFTS_TABLE_ = 'request_order_allocation_drafts';
var ADI_TIERS_ = ['T1', 'T2', 'T3'];
// The statuses that make a row a live participant in a Send. Mirrors ROS_ACTIVE_STATUSES_ (66_) deliberately —
// a diagnostic that used a different notion of "active" would answer a different question than the Send asks.
var ADI_ACTIVE_STATUSES_ = { draft: 1, site_confirmed: 1, partially_submitted: 1 };

function adiStr_(v) { return String(v == null ? '' : v).trim(); }
function adiLc_(v) { return adiStr_(v).toLowerCase(); }
function adiUc_(v) { return adiStr_(v).toUpperCase(); }
function adiQty_(v) {
  var s = adiStr_(v);
  if (s === '') return null;
  var n = Number(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

// Mask an id: keep its recognizable PREFIX (which is the classification) plus a short tail for eyeball
// correlation. Never emit the embedded company/country/marketplace/sku through this field.
function adiMaskId_(id) {
  var s = adiStr_(id);
  if (!s) return '';
  var prefix = s.indexOf('RD::MONTHLY_ORDER::') === 0 ? s.slice(0, 30)
    : (s.indexOf('RAD-M-') === 0 ? 'RAD-M-' : (s.indexOf('RAD-') === 0 ? 'RAD-' : s.slice(0, 6)));
  var tail = s.length > 6 ? s.slice(-6) : '';
  return prefix + '…' + tail + ' (len ' + s.length + ')';
}

// The identity CLASSES this diagnostic distinguishes. Each one implies a different disposition.
function adiClassifyId_(id, cycle) {
  var s = adiStr_(id);
  if (/^RD::MONTHLY_ORDER::\d{4}-\d{2}::/.test(s)) {
    var m = s.match(/^RD::MONTHLY_ORDER::(\d{4}-\d{2})::/);
    var idCycle = m ? m[1] : '';
    if (cycle && idCycle && idCycle !== adiStr_(cycle)) return 'CANONICAL_CYCLE_MISMATCH';
    return 'CANONICAL_FLAT_V2';
  }
  if (/^RAD-M-/.test(s)) return 'RETIRED_MANUAL_SEND_PATH';       // the R4E5B 'RAD-M-…' shape
  if (/^RAD-/.test(s)) return 'LEGACY_PRE_V2';                    // the pre-cutover 'RAD-…' uuid shape
  if (s === '') return 'MISSING';
  return 'UNRECOGNIZED';
}

// The canonical identity a row's OWN scope + cycle would produce. Delegated to KMRDV2 — never re-implemented,
// because a second copy of the identity rule is exactly how a "corresponding canonical id" becomes wrong.
function adiCanonicalIdFor_(row, cycle) {
  try {
    if (typeof rpoFlatBundle_ === 'function') rpoFlatBundle_();
    return KMRDV2.draftId({
      company: adiStr_(row.company), country: adiStr_(row.country), marketplace: adiStr_(row.marketplace),
      sku: adiStr_(row.sku), draft_purpose: adiStr_(row.draft_purpose) || 'regular'
    }, adiStr_(cycle) || adiStr_(row.planning_cycle));
  } catch (e) { return ''; }
}

function adiNaturalKey_(row) {
  return [adiUc_(row.company), adiUc_(row.country), adiLc_(row.marketplace), adiUc_(row.sku),
    adiLc_(row.draft_purpose) || 'regular', adiStr_(row.planning_cycle)].join('|');
}

function adiTierSummary_(row) {
  var out = {}, positive = 0, total = 0;
  ADI_TIERS_.forEach(function (t) {
    var p = t.toLowerCase() + '_';
    var q = adiQty_(row[p + 'order_qty']);
    out[t] = { order_qty: q, recommended_qty: adiQty_(row[p + 'recommended_qty']),
      month: adiStr_(row[p + 'month']), status: adiLc_(row[p + 'status']),
      user_edited: adiLc_(row[p + 'user_edited']) === 'true' };
    if (q != null && q > 0) { positive++; total += q; }
  });
  out._positive_tiers = positive;
  out._total_units = total;
  return out;
}

// Is this row currently IGNORED by Send? Two independent reasons, reported separately because they lead to
// different operator actions:
//   · terminal / unknown status  -> not a Send participant at all;
//   · duplicate business identity -> the row IS active but 66_ withholds BOTH rows of the pair (fail closed).
function adiSendVisibility_(row, isDuplicate) {
  var st = adiLc_(row.status);
  if (!ADI_ACTIVE_STATUSES_[st]) {
    return { ignored_by_send: true, reason: 'STATUS_NOT_ACTIVE:' + (st || 'blank') };
  }
  if (isDuplicate) {
    return { ignored_by_send: true, reason: 'DUPLICATE_BUSINESS_IDENTITY_WITHHELD',
      detail: 'The row is active, but the Send workset refuses BOTH rows of a duplicated business identity rather than guessing which quantity is authoritative.' };
  }
  var t = adiTierSummary_(row);
  if (t._positive_tiers === 0) {
    return { ignored_by_send: true, reason: 'NO_POSITIVE_TIER_QTY',
      detail: 'Active, but every tier is 0 or blank. Under the canonical zero-quantity rule a 0 produces no Request Order line.' };
  }
  return { ignored_by_send: false, reason: 'ELIGIBLE' };
}

// ------------------------------------------------------------------------------------------------------------
// The PURE analyser. Given the raw draft rows (and an optional cycle filter), classify every non-canonical row,
// pair it with its canonical counterpart, describe the differences, and propose an idempotent disposition.
// Pure so the regression suite runs THIS function over fixtures rather than a mirrored copy.
// ------------------------------------------------------------------------------------------------------------
function adiAnalyse_(draftRows, opts) {
  opts = opts || {};
  var cycleFilter = adiStr_(opts.planning_cycle);
  var out = {
    build_version: ADI_BUILD_VERSION_,
    planning_cycle_filter: cycleFilter || '(all cycles)',
    rows_scanned: 0,
    by_identity_class: {},
    non_canonical_count: 0,
    rad_m_count: 0,
    rad_m_ids_masked: [],
    duplicate_identity_groups: 0,
    findings: [],
    migration_plan: [],
    counters: { read_only: true, db_writes: 0, rows_migrated: 0, rows_deleted: 0, drive_writes: 0, emails: 0 }
  };

  var rows = (draftRows || []).filter(function (r) {
    if (!r) return false;
    if (cycleFilter && adiStr_(r.planning_cycle) !== cycleFilter) return false;
    return adiStr_(r.request_allocation_draft_id) !== '' || adiStr_(r.sku) !== '';
  });
  out.rows_scanned = rows.length;

  // index by natural business key so a non-canonical row can be paired with its canonical counterpart
  var byNatural = {}, byId = {};
  rows.forEach(function (r) {
    var nk = adiNaturalKey_(r);
    (byNatural[nk] = byNatural[nk] || []).push(r);
    byId[adiStr_(r.request_allocation_draft_id)] = r;
  });
  Object.keys(byNatural).forEach(function (nk) {
    var group = byNatural[nk].filter(function (r) { return ADI_ACTIVE_STATUSES_[adiLc_(r.status)] === 1; });
    if (group.length > 1) out.duplicate_identity_groups++;
  });

  rows.forEach(function (r) {
    var id = adiStr_(r.request_allocation_draft_id);
    var cls = adiClassifyId_(id, adiStr_(r.planning_cycle));
    out.by_identity_class[cls] = (out.by_identity_class[cls] || 0) + 1;
    if (cls === 'CANONICAL_FLAT_V2') return;   // canonical rows need no reconciliation

    out.non_canonical_count++;
    if (cls === 'RETIRED_MANUAL_SEND_PATH') {
      out.rad_m_count++;
      out.rad_m_ids_masked.push(adiMaskId_(id));
    }

    var nk = adiNaturalKey_(r);
    var siblings = (byNatural[nk] || []).filter(function (x) { return adiStr_(x.request_allocation_draft_id) !== id; });
    var canonicalId = adiCanonicalIdFor_(r, adiStr_(r.planning_cycle));
    var canonicalRow = canonicalId ? byId[canonicalId] : null;
    var activeSiblings = siblings.filter(function (x) { return ADI_ACTIVE_STATUSES_[adiLc_(x.status)] === 1; });
    var isDuplicate = ADI_ACTIVE_STATUSES_[adiLc_(r.status)] === 1 && activeSiblings.length > 0;

    var mine = adiTierSummary_(r);
    var theirs = canonicalRow ? adiTierSummary_(canonicalRow) : null;
    var tierDiff = [];
    if (theirs) {
      ADI_TIERS_.forEach(function (t) {
        var a = mine[t], b = theirs[t];
        if (Number(a.order_qty) === Number(b.order_qty) && adiStr_(a.month) === adiStr_(b.month)) return;
        tierDiff.push({ tier: t, non_canonical_order_qty: a.order_qty, canonical_order_qty: b.order_qty,
          non_canonical_month: a.month, canonical_month: b.month,
          non_canonical_user_edited: a.user_edited, canonical_user_edited: b.user_edited });
      });
    }

    // ---- DISPOSITION. Every branch is idempotent and none of them is executed here. -----------------------
    var disposition, rationale;
    if (!canonicalId) {
      disposition = 'MANUAL_REVIEW_REQUIRED';
      rationale = 'The canonical identity for this row could not be derived (its scope or cycle is incomplete), so no safe automatic disposition exists.';
    } else if (!canonicalRow) {
      if (mine._positive_tiers > 0) {
        disposition = 'ADOPT_AS_CANONICAL';
        rationale = 'No canonical row exists for this scope and cycle, and this row carries a positive quantity. Re-key it to its canonical identity (an insert of the canonical id carrying these quantities, then cancel this row) so the Send can see it. Idempotent: the canonical id is deterministic, so a re-run finds the row already present.';
      } else {
        disposition = 'CANCEL_AS_EMPTY';
        rationale = 'No canonical row exists and this row carries no positive quantity, so it represents no order decision. Soft-cancel it; nothing is lost and no Send is affected.';
      }
    } else if (!isDuplicate) {
      disposition = 'CANCEL_AS_SUPERSEDED';
      rationale = 'A canonical row exists for this scope and this row is not an active Send participant. Soft-cancel it to remove the ambiguity. Idempotent: an already-cancelled row is a no-op.';
    } else if (tierDiff.length === 0) {
      disposition = 'CANCEL_AS_DUPLICATE_IDENTICAL';
      rationale = 'A canonical row exists with IDENTICAL tier quantities and months, so cancelling this row loses no decision and immediately unblocks the Send for this scope.';
    } else {
      disposition = 'BUSINESS_DECISION_REQUIRED';
      rationale = 'A canonical row exists but the quantities differ. Which number is authoritative is a business decision and must not be guessed; the Send is correctly blocked for this scope until an operator chooses.';
    }

    var finding = {
      identity_class: cls,
      request_allocation_draft_id_masked: adiMaskId_(id),
      canonical_identity_masked: adiMaskId_(canonicalId),
      canonical_replacement_exists: !!canonicalRow,
      scope: { company: adiStr_(r.company), country: adiStr_(r.country), marketplace: adiStr_(r.marketplace),
        sku: adiStr_(r.sku), draft_purpose: adiStr_(r.draft_purpose) || 'regular',
        planning_cycle: adiStr_(r.planning_cycle) },
      status: adiLc_(r.status), draft_version: adiStr_(r.draft_version),
      generation_type: adiStr_(r.generation_type), updated_at: adiStr_(r.updated_at),
      positive_tiers: mine._positive_tiers, total_units: mine._total_units,
      canonical_positive_tiers: theirs ? theirs._positive_tiers : null,
      canonical_total_units: theirs ? theirs._total_units : null,
      canonical_status: canonicalRow ? adiLc_(canonicalRow.status) : null,
      tier_differences: tierDiff,
      duplicate_conflict: isDuplicate ? 'ACTIVE_DUPLICATE_BUSINESS_IDENTITY' : 'NONE',
      active_sibling_count: activeSiblings.length,
      send_visibility: adiSendVisibility_(r, isDuplicate),
      disposition: disposition,
      rationale: rationale
    };
    out.findings.push(finding);
    out.migration_plan.push({
      step: out.migration_plan.length + 1,
      action: disposition,
      target_masked: adiMaskId_(id),
      canonical_masked: adiMaskId_(canonicalId),
      scope: finding.scope,
      idempotent: disposition !== 'BUSINESS_DECISION_REQUIRED' && disposition !== 'MANUAL_REVIEW_REQUIRED',
      requires_user_authorization: true,
      writer_to_use: (disposition === 'ADOPT_AS_CANONICAL')
        ? 'requestOrder.allocationDraft.ensureAndEdit (canonical create + quantity write, then cancelShippingAllocation-equivalent soft-cancel of the old row)'
        : 'the canonical allocation-draft cancel path (soft-cancel; never a row delete)',
      note: rationale
    });
  });

  out.verdict = out.non_canonical_count === 0 ? 'CLEAN_NO_NON_CANONICAL_ROWS'
    : (out.findings.some(function (f) { return f.disposition === 'BUSINESS_DECISION_REQUIRED'; })
      ? 'BUSINESS_DECISION_REQUIRED'
      : 'MECHANICAL_RECONCILIATION_AVAILABLE');
  out.next_action = out.non_canonical_count === 0
    ? 'No non-canonical allocation-draft identities exist. Nothing to reconcile.'
    : 'Review each finding, then execute the proposed steps deliberately. THIS DIAGNOSTIC PERFORMED NO MIGRATION: it wrote nothing, deleted nothing and cancelled nothing.';
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// system.allocationDraftIdentityDiagnostic — READ-ONLY router action.
// ------------------------------------------------------------------------------------------------------------
function handleAllocationDraftIdentityDiagnostic_(body) {
  var started = Date.now();
  var payload = (body && body.payload) || body || {};
  var cycle = adiStr_(payload.planning_cycle);
  if (cycle.indexOf('PASTE_') === 0) cycle = '';
  var ss = null;
  try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); } catch (e) { ss = null; }
  if (!ss) {
    return jsonResponse_({ success: false, error: 'DB_NOT_REACHABLE', code: 'DB_NOT_REACHABLE',
      build_version: ADI_BUILD_VERSION_, read_only: true, db_writes: 0, server_ms: Date.now() - started });
  }
  var rows = gapReadObjects_(ss, ADI_DRAFTS_TABLE_);
  var result = adiAnalyse_(rows, { planning_cycle: cycle });
  result.success = true;
  result.server_ms = Date.now() - started;
  result.table = ADI_DRAFTS_TABLE_;
  return jsonResponse_(result);
}

// ============================================================================================================
// EDITOR-RUNNABLE WRAPPER. Read-only; leave the cycle blank to scan every cycle.
// ============================================================================================================
var TEMP_ADI_PLANNING_CYCLE_ = '';   // '' = all cycles, or 'YYYY-MM' for one

function TEMP_ALLOCATION_DRAFT_IDENTITY_DIAGNOSE() {
  var resp = handleAllocationDraftIdentityDiagnostic_({ payload: { planning_cycle: TEMP_ADI_PLANNING_CYCLE_ } });
  var d;
  try { d = JSON.parse(resp.getContent()); } catch (e) { Logger.log('[ADI] response unparseable'); return; }
  if (!d.success) { Logger.log('[ADI] FAILED ' + adiStr_(d.error) + ' | 0 writes.'); return; }
  Logger.log('[ADI] cycle=' + d.planning_cycle_filter + ' rows_scanned=' + d.rows_scanned
    + ' | classes=' + JSON.stringify(d.by_identity_class)
    + ' | non_canonical=' + d.non_canonical_count + ' RAD-M=' + d.rad_m_count
    + ' duplicate_identity_groups=' + d.duplicate_identity_groups
    + ' | VERDICT=' + d.verdict
    + ' | READ-ONLY: db_writes=' + d.counters.db_writes + ' rows_migrated=' + d.counters.rows_migrated
    + ' rows_deleted=' + d.counters.rows_deleted + ' emails=' + d.counters.emails);
  (d.rad_m_ids_masked || []).slice(0, 40).forEach(function (m) { Logger.log('[ADI][rad-m] ' + m); });
  (d.findings || []).slice(0, 40).forEach(function (f) {
    Logger.log('[ADI][finding] ' + f.identity_class + ' ' + f.request_allocation_draft_id_masked
      + ' scope=' + f.scope.company + '/' + f.scope.country + '/' + f.scope.marketplace + '/' + f.scope.sku
      + ' cycle=' + f.scope.planning_cycle + ' status=' + f.status
      + ' | canonical_exists=' + f.canonical_replacement_exists + ' canonical=' + f.canonical_identity_masked
      + ' | mine positive_tiers=' + f.positive_tiers + ' units=' + f.total_units
      + ' canonical positive_tiers=' + f.canonical_positive_tiers + ' units=' + f.canonical_total_units
      + ' | tier_diffs=' + (f.tier_differences || []).length
      + ' | conflict=' + f.duplicate_conflict
      + ' | ignored_by_send=' + f.send_visibility.ignored_by_send + ' (' + f.send_visibility.reason + ')'
      + ' | DISPOSITION=' + f.disposition);
  });
  (d.migration_plan || []).slice(0, 40).forEach(function (s) {
    Logger.log('[ADI][plan#' + s.step + '] ' + s.action + ' target=' + s.target_masked
      + ' idempotent=' + s.idempotent + ' requires_user_authorization=' + s.requires_user_authorization);
  });
  Logger.log('[ADI][next] ' + adiStr_(d.next_action));
}
