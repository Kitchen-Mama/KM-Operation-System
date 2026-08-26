// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 66_api_v1_request_order_send.gs — F1-7N-FB-3C  SEND REQUEST orchestration: sliced, leased, frozen, verified
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script project. Copy them into the
//       project TOGETHER. No imports.
// ------------------------------------------------------------
// WHY THIS FILE EXISTS (FB-3B) — the browser must not own a business transaction.
//   1. THE WORKSET WAS A VIEW. handleSendRequest built its rows from _applyRequestOrderFilters, so Country,
//      Marketplace, Category, Risk and SKU search silently truncated a command defined as comprehensive.
//   2. PROGRESS WAS OWNED BY A TAB. Closing the page abandoned a half-advanced lifecycle.
//   3. QUANTITY AUTHORITY WAS ASSERTED, NOT PROVEN.
//
// WHAT FB-3C FIXES IN THIS FILE. Every one of these was a real defect in FB-3B, not a refinement:
//
//   A. THE 90 s / 240 s CONTRADICTION (§D). FB-3B yielded voluntarily at 240 000 ms while the ONLY transport that
//      reaches it — _kmWeeklyCommand_ -> _kmFetchBounded_(…, 'write') — aborts at KM_WRITE_TIMEOUT_MS_ = 90 000 ms.
//      So the browser declared REQUEST_TIMEOUT_WRITE_INDETERMINATE while this handler was, BY DESIGN, still
//      writing for another 150 seconds. AbortController closes the socket; it does NOT stop an Apps Script
//      execution. Worse, the PARTIAL_RESUMABLE answer could never arrive, so the one honest intermediate state
//      was unreachable code. The budget is now DERIVED from the real client bound with explicit margin, and the
//      relationship is asserted by a regression test rather than described in prose.
//
//   B. THE LEASE WAS NOT ATOMIC (§E). journalGet -> decide -> journalPut is a read-modify-write race: two
//      concurrent Sends could both read "no lease" and both proceed. And a lease keyed by the EXECUTION KEY
//      cannot stop two DIFFERENT keys from owning overlapping drafts. Ownership is now asserted under a short
//      ScriptLock held ONLY for the compare-and-set, over a per-planning-cycle ACTIVE-EXECUTION registry.
//
//   C. THE WORKSET WAS NOT FROZEN ACROSS THE CONFIRMATION (§F). FB-3B's dry run journaled nothing, so the plan
//      the user approved and the plan that executed were two independent computations of the same query. They
//      agree almost always — and "almost always" is not a contract. The preview now PERSISTS its checksum, and
//      the commit must present it back; a changed source is SEND_WORKSET_DRIFT, never a silently larger Send.
//
//   D. success:true FROM A WRITER IS NOT PROOF (§G). FB-3B verified that each Request Order header existed and
//      that its LINE COUNT was not short. It never checked that a line carried the right quantity, tier, month,
//      SKU or source draft — so a writer that wrote the correct NUMBER of wrong lines would have passed. Every
//      expected line is now matched field by field before any allocation is marked submitted.
//
//   E. DUPLICATE BUSINESS IDENTITY WAS INVISIBLE (§H). FB-3B refused a duplicated draft ID. It could not see TWO
//      DIFFERENT IDs for the SAME business scope — exactly the shape the retired RAD-M path created. That is now
//      a fail-closed blocking conflict, not a silent pick-one.
//
// USER-FROZEN SCOPE (FB-3B §B, unchanged): the ONLY BUSINESS_SEND_SCOPE control is the tier scope
// (ALL / T1 / T2 / T3). Country, Marketplace, Category, Risk, Show mode, SKU search, pagination, the visible
// page and expanded/collapsed state are DISPLAY_ONLY. rosBuildWorkset_ accepts NO such parameter AT ALL — the
// capability is absent, not disabled, so it cannot be re-enabled by passing a flag.
//
// NOT A WRITER. Every mutation is delegated to an EXISTING canonical writer:
//   Request Orders    -> 13_ handleCreateRequestOrderDraft_ (its own ScriptLock + execution-key idempotency)
//   lifecycle advance -> 15_ handleSubmitRequestOrderAllocationDrafts_
// This file provisions no sheet, appends no column and writes no business cell of its own. It takes a ScriptLock
// ONLY for the journal/lease compare-and-set, and NEVER holds it while a canonical writer runs — that would make
// this handler contend with its own callee's tryLock(30000).
// ============================================================

var ROS_BUILD_VERSION_ = 'F1-7N-FB-4A';

// The flat V2 canonical tables. The child line table is RETIRED under the cutover and is never read here.
var ROS_DRAFTS_TABLE_ = 'request_order_allocation_drafts';
var ROS_SKU_DETAILS_TABLE_ = 'sku_details';

// BUSINESS_SEND_SCOPE — the complete, closed set. Anything not in this map is not a Send scope.
var ROS_TIER_SCOPES_ = { ALL: ['T1', 'T2', 'T3'], T1: ['T1'], T2: ['T2'], T3: ['T3'] };
// DISPLAY_ONLY controls, named so the contract is machine-readable by the health/diagnostic surfaces and by the
// regression suite. Nothing in this file consumes any of them.
var ROS_DISPLAY_ONLY_CONTROLS_ = ['country', 'marketplace', 'category', 'risk', 'show_mode', 'sku_search',
  'pagination', 'visible_page', 'expanded_state'];

var ROS_ACTIVE_STATUSES_ = { draft: 1, site_confirmed: 1, partially_submitted: 1 };
var ROS_TERMINAL_STATUSES_ = { submitted: 1, cancelled: 1 };
var ROS_TERMINAL_TIER_STATUSES_ = { submitted: 1, cancelled: 1 };

var ROS_PHASES_ = ['validate', 'load_workset', 'verify_quantities', 'freeze', 'group', 'write_orders',
  'verify_output', 'transition', 'reconcile'];

// ------------------------------------------------------------------------------------------------------------
// §D — THE SLICE BUDGET, DERIVED FROM THE REAL CLIENT BOUND.
//
// ROS_CLIENT_WRITE_TIMEOUT_MS_ MUST equal KM_WRITE_TIMEOUT_MS_ in assets/js/api/operation-system-db-api.js. It is
// restated here because Apps Script cannot read the frontend, and a regression test asserts the two are equal —
// so the pair cannot drift silently. DO NOT raise either value to make a slow Send fit; add a slice instead.
//
// The arithmetic, and why each term is what it is:
//   ROS_MAX_SINGLE_WRITE_MS_ — the worst case for ONE canonical writer call. handleCreateRequestOrderDraft_ does
//     tryLock(30000) before it writes anything, so a single Series can legitimately cost 30 s of lock wait plus
//     the write itself. The budget is therefore checked BEFORE admitting each Series, never mid-write.
//   ROS_RESERVE_MS_ — Apps Script cold start, request/response transit, and the final journal write. This is the
//     margin that must still exist AFTER the last admitted Series finishes.
//   ROS_SLICE_BUDGET_MS_ = client bound − worst single write − reserve. A slice stops ADMITTING work at this
//     point, so the worst-case wall clock is (budget + one write + reserve) = exactly the client bound, and the
//     realistic case is far under it.
// A test proves budget + max-single-write + reserve <= client bound, so the invariant cannot be edited away.
// ------------------------------------------------------------------------------------------------------------
var ROS_CLIENT_WRITE_TIMEOUT_MS_ = 90000;   // == KM_WRITE_TIMEOUT_MS_ (asserted by the regression suite)
var ROS_MAX_SINGLE_WRITE_MS_ = 35000;       // canonical writer worst case: 30 s lock wait + the write
var ROS_RESERVE_MS_ = 12000;                // cold start + transit + the final journal write + the response
var ROS_SLICE_BUDGET_MS_ = ROS_CLIENT_WRITE_TIMEOUT_MS_ - ROS_MAX_SINGLE_WRITE_MS_ - ROS_RESERVE_MS_;   // 43000

// A lease must outlive the worst-case slice (budget + one write = 78 s) but expire soon enough that a genuinely
// dead execution can be taken over without human intervention. 150 s satisfies both.
var ROS_LEASE_MS_ = 150000;
var ROS_JOURNAL_TTL_MS_ = 86400000;   // 24 h — long enough to resume a working day, short enough to expire
// A single Script Property holds ~9 KB, so the journal is CHUNKED. See rosChunk_ for why the frozen workset is
// pinned by CHECKSUM rather than stored row by row.
var ROS_JOURNAL_PREFIX_ = 'ROSEND_J_';
var ROS_ACTIVE_PREFIX_ = 'ROSEND_ACTIVE_';
var ROS_CHUNK_CHARS_ = 8000;
var ROS_MAX_CHUNKS_ = 40;
// A user click may fan out into several technical continuations, but never without bound.
var ROS_MAX_CONTINUATIONS_ = 40;

// ============================================================================================================
// __ROS_PURE_START__
// Everything between the PURE markers is deterministic and free of SpreadsheetApp / PropertiesService /
// LockService / Date / Utilities, so the regression suite executes THESE functions rather than a copy of them.
// ============================================================================================================

function rosStr_(v) { return String(v == null ? '' : v).trim(); }
function rosLc_(v) { return rosStr_(v).toLowerCase(); }
function rosUc_(v) { return rosStr_(v).toUpperCase(); }
// Blank / non-numeric -> null (ABSENT), never 0. A missing quantity and a zero quantity are different facts, and
// collapsing them is how "0 was persisted" becomes indistinguishable from "nothing was persisted".
function rosQty_(v) {
  var s = rosStr_(v);
  if (s === '') return null;
  var n = Number(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

// Pure 32-bit FNV-1a as lowercase hex. Used for the orchestration key and the source checksum so both are
// reproducible in Node with no Utilities dependency — the determinism authority must be testable.
function rosFnv1a_(s) {
  var h = 0x811c9dc5, str = String(s == null ? '' : s);
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) & 0xff;
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// The ONLY business scope selector. Anything else — a country, a marketplace, a series — is refused, so a caller
// cannot smuggle a display filter in through this parameter.
function rosNormalizeTierScope_(v) {
  var s = rosUc_(v);
  if (s === 'ALL' || s === 'T1' || s === 'T2' || s === 'T3') return s;
  return null;
}
function rosTiersForScope_(scope) { return (ROS_TIER_SCOPES_[scope] || []).slice(); }

// Flat V2 tier column accessor: tier 'T1' + field 'order_qty' -> row.t1_order_qty. One place, so a tier column
// name is never spelled out inline anywhere else in this file.
function rosTierCol_(tier, field) { return rosLc_(tier) + '_' + field; }
function rosTierField_(row, tier, field) { return (row || {})[rosTierCol_(tier, field)]; }

// The natural BUSINESS identity of an allocation draft, independent of its primary key. §H depends on this: two
// different primary keys carrying the same natural key are a duplicate-identity conflict, not two work items.
function rosNaturalKey_(company, country, marketplace, sku) {
  return [rosUc_(company), rosUc_(country), rosLc_(marketplace), rosUc_(sku)].join('|');
}
function rosRowNaturalKey_(row) {
  return rosNaturalKey_((row || {}).company, (row || {}).country, (row || {}).marketplace, (row || {}).sku);
}

function rosDraftStatus_(row) { return rosLc_((row || {}).status); }
function rosDraftIsActive_(row) { return ROS_ACTIVE_STATUSES_[rosDraftStatus_(row)] === 1; }
function rosDraftIsTerminal_(row) { return ROS_TERMINAL_STATUSES_[rosDraftStatus_(row)] === 1; }
// §H — the canonical Flat-V2 identity shape. A row whose id does not match it was minted by a retired or legacy
// path (the RAD-M case), which is why it can collide on business identity with a canonical row.
function rosIsCanonicalDraftId_(id) { return /^RD::MONTHLY_ORDER::\d{4}-\d{2}::/.test(rosStr_(id)); }

// ------------------------------------------------------------------------------------------------------------
// FB-3B §B/§D — THE WORKSET. Pure over the persisted draft rows.
//
// PARAMETERS, EXHAUSTIVELY: planning_cycle and tier_scope. That is the whole business input. There is NO
// country, marketplace, category, risk, sku-search, show-mode, page, page-size or visible-row parameter, and
// adding one would be a source change a regression test refuses.
//
// UNITS. Every count states what it counts, because FB-3A's "234" incident was a LABEL defect: a SKU-row count
// printed under the word "allocation drafts". These names are the vocabulary the confirmation dialog and the
// progress display must use verbatim.
//
// §H FAIL-CLOSED ADDITION: blocking_conflicts. Two rows sharing one natural business key are NOT two work items
// and the right one cannot be guessed, so BOTH are withheld and the Send refuses. Silently picking the canonical
// one would send a quantity the operator may never have seen.
// ------------------------------------------------------------------------------------------------------------
function rosBuildWorkset_(draftRows, opts) {
  opts = opts || {};
  var cycle = rosStr_(opts.planning_cycle);
  var scope = rosNormalizeTierScope_(opts.tier_scope);
  var tiers = rosTiersForScope_(scope);
  var seriesBySku = opts.series_by_sku || {};
  var upcBySku = opts.units_per_carton_by_sku || {};

  var out = {
    planning_cycle: cycle,
    tier_scope: scope,
    tiers_in_scope: tiers.slice(),
    // ---- units (each name says what it counts) --------------------------------------------------------
    persisted_drafts_in_cycle: 0,           // rows for this planning_cycle, any status
    active_persisted_drafts: 0,             // ... whose header status is ACTIVE
    drafts_with_positive_selected_tier: 0,  // ... carrying >=1 positive, non-terminal tier IN SCOPE
    selected_tier_allocations: 0,           // tier cells in scope that exist on an active draft (any qty)
    positive_selected_tier_allocations: 0,  // ... whose order_qty > 0  (the Request Order LINE count)
    distinct_skus: 0,
    distinct_series: 0,
    expected_request_order_headers: 0,      // = distinct Series groups
    expected_request_order_lines: 0,        // = positive_selected_tier_allocations
    total_units: 0,
    // ---- typed exclusions (never a silent drop) ------------------------------------------------------
    excluded: {
      wrong_planning_cycle: 0,
      status_submitted: 0,
      status_cancelled: 0,
      status_unknown: 0,
      tier_out_of_scope: 0,
      tier_terminal_already_sent: 0,
      tier_absent: 0,
      tier_zero_or_blank_qty: 0,
      draft_id_missing: 0,
      duplicate_draft_id: 0,
      duplicate_business_identity: 0,
      non_canonical_draft_id: 0
    },
    rows: [],                // one entry per sendable tier cell (the true unit of a Request Order line)
    drafts: [],              // one entry per sendable draft header
    blocking_conflicts: [],  // §H — must be empty for a Send to run
    diagnostics: []
  };
  if (!scope) { out.error = 'INVALID_TIER_SCOPE'; return out; }
  if (!cycle) { out.error = 'PLANNING_CYCLE_REQUIRED'; return out; }

  var tierSet = {}; tiers.forEach(function (t) { tierSet[t] = 1; });

  // PASS 1 — cycle + status admission, and the natural-key census §H needs. Nothing is emitted yet, because a
  // duplicate identity found later must be able to withhold a row that pass 1 already accepted.
  var admitted = [], seenId = {}, byNatural = {};
  (draftRows || []).forEach(function (row) {
    if (rosStr_(row && row.planning_cycle) !== cycle) { out.excluded.wrong_planning_cycle++; return; }
    out.persisted_drafts_in_cycle++;
    var st = rosDraftStatus_(row);
    if (st === 'submitted') { out.excluded.status_submitted++; return; }
    if (st === 'cancelled') { out.excluded.status_cancelled++; return; }
    if (!rosDraftIsActive_(row)) { out.excluded.status_unknown++; return; }
    out.active_persisted_drafts++;
    var draftId = rosStr_(row.request_allocation_draft_id);
    if (!draftId) { out.excluded.draft_id_missing++; return; }
    if (seenId[draftId]) {
      out.excluded.duplicate_draft_id++;
      out.diagnostics.push({ code: 'DUPLICATE_DRAFT_ID', request_allocation_draft_id: draftId });
      return;
    }
    seenId[draftId] = 1;
    var nk = rosRowNaturalKey_(row);
    (byNatural[nk] = byNatural[nk] || []).push({ id: draftId, row: row, canonical: rosIsCanonicalDraftId_(draftId) });
    admitted.push({ id: draftId, row: row, natural_key: nk });
  });

  // PASS 2 — §H fail-closed duplicate-business-identity gate. This is the case the retired RAD-M path created:
  // one canonical 'RD::MONTHLY_ORDER::…' row and one legacy 'RAD-M-…' row for the SAME company/country/
  // marketplace/sku. Which quantity is authoritative is a BUSINESS question, so neither is sent.
  var blockedNatural = {};
  Object.keys(byNatural).forEach(function (nk) {
    var group = byNatural[nk];
    if (group.length < 2) return;
    blockedNatural[nk] = 1;
    out.blocking_conflicts.push({
      code: 'DUPLICATE_BUSINESS_IDENTITY', natural_key: nk,
      draft_ids: group.map(function (g) { return g.id; }).sort(),
      canonical_count: group.filter(function (g) { return g.canonical; }).length,
      non_canonical_count: group.filter(function (g) { return !g.canonical; }).length,
      resolution: 'Reconcile the duplicate allocation drafts for this scope before sending. Run the allocation-draft identity diagnostic; neither row is sent while both exist.'
    });
  });

  // PASS 3 — emit the sendable tier cells.
  var skuSeen = {}, seriesSeen = {};
  admitted.forEach(function (a) {
    if (blockedNatural[a.natural_key]) { out.excluded.duplicate_business_identity++; return; }
    var row = a.row, draftId = a.id;
    if (!rosIsCanonicalDraftId_(draftId)) out.excluded.non_canonical_draft_id++;   // counted, not refused alone
    var sku = rosStr_(row.sku);
    var series = rosStr_(seriesBySku[rosUc_(sku)] || '');
    var upc = rosQty_(row.units_per_carton);
    if (upc == null) upc = rosQty_(upcBySku[rosUc_(sku)]);

    var sendable = [];
    ['T1', 'T2', 'T3'].forEach(function (tier) {
      if (!tierSet[tier]) { out.excluded.tier_out_of_scope++; return; }
      var month = rosStr_(rosTierField_(row, tier, 'month'));
      var qty = rosQty_(rosTierField_(row, tier, 'order_qty'));
      var tierStatus = rosLc_(rosTierField_(row, tier, 'status'));
      if (month === '' && qty == null) { out.excluded.tier_absent++; return; }
      out.selected_tier_allocations++;
      if (ROS_TERMINAL_TIER_STATUSES_[tierStatus] === 1) { out.excluded.tier_terminal_already_sent++; return; }
      // FB-3C §B.7 — the canonical zero-quantity rule. A persisted 0 is a REAL, saved decision, and it produces
      // NO Request Order line. It is counted so the dialog can show that the tier was considered and excluded.
      if (qty == null || qty <= 0) { out.excluded.tier_zero_or_blank_qty++; return; }
      out.positive_selected_tier_allocations++;
      out.total_units += qty;
      sendable.push({
        request_allocation_draft_id: draftId,
        natural_key: a.natural_key,
        company: rosStr_(row.company), country: rosStr_(row.country), marketplace: rosStr_(row.marketplace),
        sku: sku, series: series, request_bucket: tier, request_month: month,
        order_qty: qty, units_per_carton: (upc == null ? '' : upc),
        recommended_qty: rosQty_(rosTierField_(row, tier, 'recommended_qty')),
        user_edited: rosLc_(rosTierField_(row, tier, 'user_edited')) === 'true',
        tier_status: tierStatus
      });
    });
    if (!sendable.length) return;

    out.drafts_with_positive_selected_tier++;
    if (!skuSeen[rosUc_(sku)]) { skuSeen[rosUc_(sku)] = 1; out.distinct_skus++; }
    var seriesKey = series || '(no series)';
    if (!seriesSeen[seriesKey]) { seriesSeen[seriesKey] = 1; out.distinct_series++; }
    out.drafts.push({ request_allocation_draft_id: draftId, natural_key: a.natural_key,
      company: rosStr_(row.company), country: rosStr_(row.country), marketplace: rosStr_(row.marketplace),
      sku: sku, series: series, status: rosDraftStatus_(row), draft_version: rosStr_(row.draft_version),
      canonical_identity: rosIsCanonicalDraftId_(draftId), tier_count: sendable.length });
    sendable.forEach(function (r) { out.rows.push(r); });
  });

  out.expected_request_order_lines = out.positive_selected_tier_allocations;
  out.expected_request_order_headers = out.distinct_series;
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// FB-3B §C — THE QUANTITY READ-BACK BARRIER.
// The client sends INTENTS: the quantities the user believes are current. Every intent must be matched by a
// PERSISTED tier cell holding the SAME number. Anything else blocks the WHOLE Send:
//   UNSAVED_NO_PERSISTED_DRAFT — the intent names a scope with no active persisted canonical draft;
//   UNSAVED_TIER_ABSENT        — the draft exists but that tier was never persisted;
//   QUANTITY_DRIFT             — the database holds a DIFFERENT number than the user's latest edit.
// QUANTITY_DRIFT is fatal, and the DB value is never substituted: "do not silently use the prior DB quantity
// when a newer UI edit failed to save".
//
// FB-3C: an intent of 0 is a REAL assertion (the §B.7 positive->0 case) and must match a persisted 0. Because a
// 0-quantity tier is deliberately absent from workset.rows, it is verified against the ZERO INDEX the caller
// supplies rather than against rows — otherwise a correctly saved 0 would look like an unsaved edit and block
// every Send that contained one.
// ------------------------------------------------------------------------------------------------------------
function rosVerifyQuantities_(workset, intents, zeroIndex) {
  var out = { verified: 0, blocked: false, failures: [], verified_keys: {},
    intents_total: 0, intents_matched: 0, zero_intents_matched: 0, workset_rows_without_intent: 0 };
  var byKey = {};
  (workset && workset.rows ? workset.rows : []).forEach(function (r) {
    byKey[r.natural_key + '::' + r.request_bucket] = r;
  });
  var zeros = zeroIndex || {};
  var intentKeys = {};

  (intents || []).forEach(function (it) {
    var nk = rosNaturalKey_(it && it.company, it && it.country, it && it.marketplace, it && it.sku);
    var tiers = (it && it.tiers) || {};
    Object.keys(tiers).forEach(function (tier) {
      var t = rosUc_(tier);
      if (t !== 'T1' && t !== 'T2' && t !== 'T3') return;   // T4 is visibility-only, never an order commitment
      var want = rosQty_(tiers[tier] && tiers[tier].order_qty !== undefined ? tiers[tier].order_qty : tiers[tier]);
      if (want == null) return;                             // no asserted intent -> the persisted value stands
      out.intents_total++;
      var key = nk + '::' + t;
      intentKeys[key] = 1;
      var row = byKey[key];
      if (!row) {
        // A 0 intent matching a persisted 0 is a SUCCESSFUL verification of a deliberate positive->0 edit.
        if (Number(want) === 0 && zeros[key] === true) { out.intents_matched++; out.zero_intents_matched++; out.verified++; out.verified_keys[key] = 1; return; }
        var anyTier = false;
        ['T1', 'T2', 'T3'].forEach(function (x) { if (byKey[nk + '::' + x] || zeros[nk + '::' + x] === true) anyTier = true; });
        out.failures.push({ code: anyTier ? 'UNSAVED_TIER_ABSENT' : 'UNSAVED_NO_PERSISTED_DRAFT',
          sku: rosStr_(it.sku), country: rosStr_(it.country), marketplace: rosStr_(it.marketplace),
          request_bucket: t, intended_qty: want, persisted_qty: null });
        return;
      }
      if (Number(row.order_qty) !== Number(want)) {
        out.failures.push({ code: 'QUANTITY_DRIFT', sku: rosStr_(it.sku), country: rosStr_(it.country),
          marketplace: rosStr_(it.marketplace), request_bucket: t,
          intended_qty: want, persisted_qty: Number(row.order_qty),
          request_allocation_draft_id: row.request_allocation_draft_id });
        return;
      }
      out.intents_matched++;
      out.verified++;
      out.verified_keys[key] = 1;
    });
  });

  (workset && workset.rows ? workset.rows : []).forEach(function (r) {
    if (!intentKeys[r.natural_key + '::' + r.request_bucket]) out.workset_rows_without_intent++;
  });
  out.blocked = out.failures.length > 0;
  return out;
}

// The index of tier cells that are PERSISTED WITH A NON-POSITIVE quantity — the §B.7 positive->0 case. Built
// from the same rows the workset saw, so it cannot disagree with it.
function rosZeroQtyIndex_(draftRows, opts) {
  opts = opts || {};
  var cycle = rosStr_(opts.planning_cycle);
  var tiers = rosTiersForScope_(rosNormalizeTierScope_(opts.tier_scope));
  var tierSet = {}; tiers.forEach(function (t) { tierSet[t] = 1; });
  var out = {};
  (draftRows || []).forEach(function (row) {
    if (rosStr_(row && row.planning_cycle) !== cycle) return;
    if (!rosDraftIsActive_(row)) return;
    var nk = rosRowNaturalKey_(row);
    ['T1', 'T2', 'T3'].forEach(function (tier) {
      if (!tierSet[tier]) return;
      var q = rosQty_(rosTierField_(row, tier, 'order_qty'));
      if (q != null && q <= 0) out[nk + '::' + tier] = true;
    });
  });
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// FB-3B §E — deterministic Series grouping. Sorted by series key, then by draft id + tier inside the group, so
// two runs over the same workset produce byte-identical groups and therefore byte-identical execution keys.
// SKU / tier / station lineage is CARRIED, never merged away: one output line per tier cell.
// ------------------------------------------------------------------------------------------------------------
function rosGroupBySeries_(workset) {
  var groups = {};
  (workset && workset.rows ? workset.rows : []).forEach(function (r) {
    var key = r.series || '(no series)';
    (groups[key] = groups[key] || []).push(r);
  });
  return Object.keys(groups).sort().map(function (key) {
    var lines = groups[key].slice().sort(function (a, b) {
      if (a.request_allocation_draft_id !== b.request_allocation_draft_id) return a.request_allocation_draft_id < b.request_allocation_draft_id ? -1 : 1;
      return a.request_bucket < b.request_bucket ? -1 : (a.request_bucket > b.request_bucket ? 1 : 0);
    });
    var ids = {}, skus = {};
    lines.forEach(function (l) { ids[l.request_allocation_draft_id] = 1; skus[rosUc_(l.sku)] = 1; });
    return { series: (key === '(no series)' ? '' : key), series_key: key, lines: lines,
      allocation_draft_ids: Object.keys(ids).sort(), line_count: lines.length,
      distinct_skus: Object.keys(skus).length,
      total_units: lines.reduce(function (s, l) { return s + Number(l.order_qty || 0); }, 0) };
  });
}

// The frozen source checksum: a canonical string over exactly the facts that define this execution's output.
// Timestamps, actors, row order and any display state are excluded BY CONSTRUCTION, so re-running an unchanged
// workset reproduces the same checksum and a changed quantity does not.
function rosWorksetChecksum_(workset) {
  var parts = (workset && workset.rows ? workset.rows : []).map(function (r) {
    return [r.request_allocation_draft_id, r.request_bucket, r.request_month, String(r.order_qty), r.natural_key].join('~');
  }).sort();
  return 'ROSCHK-' + rosFnv1a_([rosStr_(workset && workset.planning_cycle), rosStr_(workset && workset.tier_scope),
    String(parts.length), parts.join(';')].join('|')).toUpperCase();
}

// The orchestration/idempotency key. PURE FUNCTION OF THE REQUEST BODY, so an identical re-invocation (a
// continuation, a double-click, a second tab, a reload) computes the same key and lands on the same journal.
function rosOrchestrationKey_(payload) {
  payload = payload || {};
  var intents = (payload.intents || []).map(function (it) {
    var tiers = (it && it.tiers) || {};
    var tp = Object.keys(tiers).sort().map(function (t) {
      var v = tiers[t] && tiers[t].order_qty !== undefined ? tiers[t].order_qty : tiers[t];
      var q = rosQty_(v);
      return rosUc_(t) + '=' + (q == null ? '' : String(q));
    }).join(',');
    return rosNaturalKey_(it && it.company, it && it.country, it && it.marketplace, it && it.sku) + '{' + tp + '}';
  }).sort();
  var canon = [rosStr_(payload.planning_cycle), rosNormalizeTierScope_(payload.tier_scope) || '',
    rosStr_(payload.execution_planning_cycle), String(intents.length), intents.join(';')].join('|');
  return 'ROSEXEC-' + rosFnv1a_(canon).toUpperCase() + rosFnv1a_('salt:' + canon).toUpperCase();
}

// A journal is resumable only when it belongs to the same frozen source. A changed checksum means the underlying
// quantities moved since the interrupted run, so the old journal is superseded rather than continued.
function rosJournalResumable_(journal, checksum, nowMs) {
  if (!journal || !journal.orchestration_key) return { resumable: false, reason: 'NO_JOURNAL' };
  if (rosStr_(journal.status) === 'COMPLETED') return { resumable: false, reason: 'ALREADY_COMPLETED' };
  if (rosStr_(journal.workset_checksum) && rosStr_(checksum) && journal.workset_checksum !== checksum) {
    return { resumable: false, reason: 'SOURCE_CHANGED_SINCE_INTERRUPTION' };
  }
  if (journal.started_at && nowMs && (nowMs - Number(journal.started_at)) > ROS_JOURNAL_TTL_MS_) {
    return { resumable: false, reason: 'JOURNAL_EXPIRED' };
  }
  return { resumable: true, reason: 'RESUMABLE' };
}
// A lease held by a still-running execution blocks a concurrent one. An older lease is an abandoned execution.
function rosLeaseHeld_(record, nowMs) {
  if (!record || !record.lease_at) return false;
  if (rosStr_(record.status) === 'COMPLETED') return false;
  return (Number(nowMs) - Number(record.lease_at)) < ROS_LEASE_MS_;
}

// ------------------------------------------------------------------------------------------------------------
// §E — THE PURE OWNERSHIP DECISION. Separated from the lock so it is exhaustively testable: given the current
// active-execution record for a planning cycle and an incoming key, who owns the workset?
//
// Ownership is per PLANNING CYCLE, not per execution key. A key-scoped lease cannot stop two DIFFERENT keys from
// writing overlapping drafts — which is exactly test 2 of §E — and the workset is cycle-scoped by construction,
// so the cycle is the correct ownership grain.
// ------------------------------------------------------------------------------------------------------------
function rosOwnershipDecision_(activeRecord, key, nowMs) {
  if (!activeRecord || !rosStr_(activeRecord.execution_key)) return { verdict: 'GRANT', reason: 'NO_ACTIVE_EXECUTION' };
  if (rosStr_(activeRecord.execution_key) === rosStr_(key)) {
    return { verdict: 'GRANT', reason: rosLeaseHeld_(activeRecord, nowMs) ? 'RENEW_OWN_LEASE' : 'REACQUIRE_OWN_EXPIRED_LEASE' };
  }
  if (rosLeaseHeld_(activeRecord, nowMs)) {
    return { verdict: 'REFUSE', reason: 'SEND_WORKSET_OWNED_BY_ANOTHER_EXECUTION', owner: rosStr_(activeRecord.execution_key) };
  }
  return { verdict: 'GRANT', reason: 'TAKEOVER_EXPIRED_LEASE', previous_owner: rosStr_(activeRecord.execution_key) };
}

// Split a JSON string into Script-Property-sized chunks.
//
// WHY THE FROZEN WORKSET IS PINNED BY CHECKSUM RATHER THAN STORED ROW BY ROW. A Script Property holds ~9 KB. A
// frozen workset of a few hundred tier lines is tens of kilobytes, so storing the rows would exceed the storage
// contract. The journal therefore stores the CHECKSUM, the immutable Series ORDER and the per-Series completion
// records, and every continuation re-reads the drafts and re-verifies the checksum against the frozen one. An
// unchanged checksum PROVES the executed set is the approved set; a changed one is SEND_WORKSET_DRIFT. This is a
// deliberate design decision with the same guarantee as row storage, not an omission.
function rosChunk_(s, size) {
  var out = [], str = String(s == null ? '' : s), n = size || ROS_CHUNK_CHARS_;
  for (var i = 0; i < str.length; i += n) out.push(str.slice(i, i + n));
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// §G — EXACT OUTPUT VERIFICATION. A writer returning success:true is insufficient, and FB-3B's line-COUNT check
// was insufficient too: a writer that wrote the correct NUMBER of wrong lines would have passed it.
//
// For every expected line, matched by (request_order_id, sku, request_bucket, request_month):
//   · exactly ONE request_order_lines row exists (a duplicate is a failure, not a tolerance);
//   · request_order_line_id is present;
//   · requested_qty equals the FROZEN persisted user quantity — not "close to", not "at least";
//   · series and company match the grouping the orchestration chose;
//   · the request_order_line_sources row for that line carries the source allocation draft id, the station
//     (country + marketplace) and the tier/month lineage.
// Then, per header: total_qty equals the sum of the VERIFIED lines, total_sku equals the distinct SKU count, and
// there is NO unexpected line — which is how "zero-quantity tiers created no line" is actually proven.
// PURE over the read rows, so the suite executes this rather than trusting it.
// ------------------------------------------------------------------------------------------------------------
function rosVerifyRequestOrderOutput_(expected, orderRow, lineRows, sourceRows) {
  var out = { ok: true, failures: [], verified_lines: 0, verified_qty: 0, matched_line_ids: [] };
  var roId = rosStr_(expected && expected.request_order_id);
  if (!roId) { out.ok = false; out.failures.push({ code: 'REQUEST_ORDER_ID_MISSING' }); return out; }
  if (!orderRow) { out.ok = false; out.failures.push({ code: 'REQUEST_ORDER_HEADER_NOT_FOUND', request_order_id: roId }); return out; }

  var mine = (lineRows || []).filter(function (l) { return rosStr_(l && l.request_order_id) === roId; });
  var byKey = {};
  mine.forEach(function (l) {
    var k = [rosUc_(l.sku), rosUc_(l.request_bucket), rosStr_(l.request_month)].join('|');
    (byKey[k] = byKey[k] || []).push(l);
  });
  var srcByLine = {};
  (sourceRows || []).forEach(function (s) {
    var k = rosStr_(s && s.request_order_line_id); if (!k) return;
    (srcByLine[k] = srcByLine[k] || []).push(s);
  });

  var expectedKeys = {};
  (expected.lines || []).forEach(function (e) {
    var k = [rosUc_(e.sku), rosUc_(e.request_bucket), rosStr_(e.request_month)].join('|');
    expectedKeys[k] = true;
    var found = byKey[k] || [];
    if (found.length === 0) { out.failures.push({ code: 'LINE_MISSING', sku: e.sku, request_bucket: e.request_bucket, request_month: e.request_month, expected_qty: e.order_qty }); return; }
    if (found.length > 1) { out.failures.push({ code: 'LINE_DUPLICATED', sku: e.sku, request_bucket: e.request_bucket, request_month: e.request_month, count: found.length }); return; }
    var l = found[0];
    var lineId = rosStr_(l.request_order_line_id);
    if (!lineId) { out.failures.push({ code: 'LINE_ID_MISSING', sku: e.sku, request_bucket: e.request_bucket }); return; }
    var got = rosQty_(l.requested_qty);
    if (got == null || Number(got) !== Number(e.order_qty)) {
      out.failures.push({ code: 'LINE_QUANTITY_MISMATCH', sku: e.sku, request_bucket: e.request_bucket,
        request_month: e.request_month, expected_qty: Number(e.order_qty), found_qty: (got == null ? null : Number(got)),
        request_allocation_draft_id: e.request_allocation_draft_id });
      return;
    }
    if (rosUc_(l.series) !== rosUc_(e.series)) {
      out.failures.push({ code: 'LINE_SERIES_MISMATCH', sku: e.sku, expected_series: rosStr_(e.series), found_series: rosStr_(l.series) });
      return;
    }
    if (rosUc_(l.company) !== rosUc_(e.company)) {
      out.failures.push({ code: 'LINE_COMPANY_MISMATCH', sku: e.sku, expected_company: rosStr_(e.company), found_company: rosStr_(l.company) });
      return;
    }
    var srcs = srcByLine[lineId] || [];
    if (srcs.length === 0) { out.failures.push({ code: 'LINE_SOURCE_MISSING', sku: e.sku, request_order_line_id: lineId }); return; }
    var lineageOk = false;
    for (var si = 0; si < srcs.length; si++) {
      var s = srcs[si];
      if (rosStr_(s.request_allocation_draft_id) !== rosStr_(e.request_allocation_draft_id)) continue;
      if (rosUc_(s.country) !== rosUc_(e.country)) continue;
      if (rosLc_(s.marketplace) !== rosLc_(e.marketplace)) continue;
      if (rosUc_(s.tier_type) !== rosUc_(e.request_bucket)) continue;
      if (rosStr_(s.source_month) !== rosStr_(e.request_month)) continue;
      lineageOk = true; break;
    }
    if (!lineageOk) {
      out.failures.push({ code: 'LINE_LINEAGE_MISMATCH', sku: e.sku, request_bucket: e.request_bucket,
        request_order_line_id: lineId, expected_allocation_draft_id: rosStr_(e.request_allocation_draft_id),
        expected_station: rosStr_(e.country) + ' / ' + rosStr_(e.marketplace) });
      return;
    }
    out.verified_lines++;
    out.verified_qty += Number(e.order_qty);
    out.matched_line_ids.push(lineId);
  });

  // No UNEXPECTED line may exist on this header. This is the proof that a zero-quantity tier created no line: a
  // line for a tier that is not in the expected (positive) set shows up here.
  mine.forEach(function (l) {
    var k = [rosUc_(l.sku), rosUc_(l.request_bucket), rosStr_(l.request_month)].join('|');
    if (!expectedKeys[k]) {
      out.failures.push({ code: 'UNEXPECTED_LINE', sku: rosStr_(l.sku), request_bucket: rosStr_(l.request_bucket),
        request_month: rosStr_(l.request_month), found_qty: rosQty_(l.requested_qty),
        detail: 'A line exists that the frozen workset did not authorise (a zero-quantity tier must create no line).' });
    }
  });

  // Header totals must equal the verified line sum — not the writer's own arithmetic taken on trust.
  if (out.failures.length === 0) {
    var hdrQty = rosQty_(orderRow.total_qty);
    if (hdrQty == null || Number(hdrQty) !== out.verified_qty) {
      out.failures.push({ code: 'HEADER_TOTAL_QTY_MISMATCH', request_order_id: roId,
        header_total_qty: (hdrQty == null ? null : Number(hdrQty)), verified_line_sum: out.verified_qty });
    }
    var distinct = {};
    (expected.lines || []).forEach(function (e) { distinct[rosUc_(e.sku)] = 1; });
    var hdrSku = rosQty_(orderRow.total_sku);
    if (hdrSku != null && Number(hdrSku) !== Object.keys(distinct).length) {
      out.failures.push({ code: 'HEADER_TOTAL_SKU_MISMATCH', request_order_id: roId,
        header_total_sku: Number(hdrSku), expected_distinct_sku: Object.keys(distinct).length });
    }
  }
  out.ok = out.failures.length === 0;
  return out;
}

// §H — the current-run authority, stated as one string so the wire, the dialog and the docs cannot disagree.
// There is NO calculation_run_id on the flat draft rows (a pre-existing gap documented in 47_), so the run is
// identified by the planning cycle plus the lifecycle statuses. Under the flat V2 model that IS sufficient, and
// the reason is structural rather than hopeful: the primary key is
// 'RD::MONTHLY_ORDER::<cycle>::company=..|country=..|draft_purpose=..|marketplace=..|sku=..', so ONE canonical
// row can exist per business identity per cycle, draft_version increments IN PLACE, and no superseded version
// row is ever retained. The only way to get two non-terminal rows for one identity is a NON-canonical id from a
// retired path — which rosBuildWorkset_ now refuses as DUPLICATE_BUSINESS_IDENTITY instead of choosing one.
function rosCurrentRunAuthority_(cycle) {
  return 'planning_cycle=' + rosStr_(cycle) + ' AND header status IN (draft, site_confirmed, partially_submitted)'
    + ' AND tier status NOT IN (submitted, cancelled) AND exactly ONE active draft per canonical business identity'
    + ' (RD::MONTHLY_ORDER::<cycle>::<scope> is the primary key; draft_version increments in place; no superseded'
    + ' version row is retained, so no older same-cycle draft can re-enter a Send)';
}
// ------------------------------------------------------------------------------------------------------------
// FB-4A §B — PLANNING-CYCLE CENSUS (PURE). The editor wrappers below are fail-closed: they refuse to guess a
// planning cycle. Refusing is correct, but a bare refusal made the operator guess, and the live attempt proved
// the guess lands somewhere worse — a Script Property that NOTHING reads. So when the constant is still the
// placeholder the wrapper now ANSWERS the question instead: which cycles actually carry persisted rows, how many
// are active in each, and what the latest calculation evidence for each one is.
//
// It is a census of ONE table's cycle column. It builds no workset, resolves no series, and never becomes an
// input to a write — rosBuildWorkset_ still demands an explicit exact cycle (PLANNING_CYCLE_REQUIRED) and this
// function is never consulted to supply one. `recommended` is a REPORT of the busiest active cycle, never a
// default: nothing reads it back.
function rosPlanningCycleCensus_(draftRows) {
  var byCycle = {}, order = [];
  (draftRows || []).forEach(function (row) {
    var cycle = rosStr_(row && row.planning_cycle);
    if (!cycle) { cycle = '(blank)'; }
    if (!byCycle[cycle]) {
      byCycle[cycle] = { planning_cycle: cycle, persisted_drafts: 0, active_drafts: 0, terminal_drafts: 0,
        latest_calculated_at: '', latest_source_data_as_of: '' };
      order.push(cycle);
    }
    var c = byCycle[cycle];
    c.persisted_drafts++;
    if (rosDraftIsActive_(row)) c.active_drafts++;
    else if (rosDraftIsTerminal_(row)) c.terminal_drafts++;
    var calc = rosStr_(row && row.calculated_at);
    if (calc > c.latest_calculated_at) c.latest_calculated_at = calc;
    var asOf = rosStr_(row && row.source_data_as_of);
    if (asOf > c.latest_source_data_as_of) c.latest_source_data_as_of = asOf;
  });
  // Most ACTIVE rows first (that is what a Send would consume), then the newest calculation, then the cycle
  // label descending — fully deterministic, so the same DB always yields the same recommendation.
  var cycles = order.map(function (k) { return byCycle[k]; }).sort(function (a, b) {
    return (b.active_drafts - a.active_drafts)
      || (a.latest_calculated_at < b.latest_calculated_at ? 1 : a.latest_calculated_at > b.latest_calculated_at ? -1 : 0)
      || (a.planning_cycle < b.planning_cycle ? 1 : a.planning_cycle > b.planning_cycle ? -1 : 0);
  });
  var withActive = cycles.filter(function (c) { return c.active_drafts > 0 && /^\d{4}-\d{2}$/.test(c.planning_cycle); });
  return {
    cycles: cycles,
    active_cycles: withActive.map(function (c) { return c.planning_cycle; }),
    recommended: withActive.length ? withActive[0].planning_cycle : '',
    recommendation_basis: withActive.length
      ? 'the cycle with the most ACTIVE persisted allocation drafts (ties broken by the newest calculated_at)'
      : 'NONE — no planning cycle currently has an active persisted allocation draft'
  };
}

// FB-4A ADDENDUM §F — AUTOMATIC PLANNING-CYCLE RESOLUTION (PURE). THE MANUAL SOURCE-EDIT TRAP IS REMOVED.
//
// Requiring an operator to hand-edit a source constant before a READ-ONLY probe will run is a trap, and the live
// attempt proved it: the constant was never edited, a Script Property of the same name was created instead, and
// the property is read by nothing — so the probe stayed blocked with no way to tell why. A diagnostic that
// cannot run without a code change is a diagnostic that does not run.
//
// THE AUTHORITY IS THE SAME PERSISTED ONE THE WEBSITE USES. request-order.js `_roSendPlanningCycle_` resolves the
// cycle from the PERSISTED allocation drafts the page hydrated — "the cycle the drafts are actually keyed by,
// so the Send targets the same run the page is displaying rather than a computed guess". This mirrors exactly
// that: the distinct planning_cycle values carried by ACTIVE persisted rows of the SAME table the Send consumes.
//
// THE PAGE'S SECOND FALLBACK IS DELIBERATELY NOT MIRRORED. `_roSendPlanningCycle_` falls back to the Asia/Taipei
// calendar cycle when no draft is hydrated yet. That fallback exists so a Send can be ATTEMPTED before hydration;
// it is a clock, not a persisted authority. Mirroring it here would let a diagnostic over PERSISTED work report a
// cycle with zero rows, which is worse than reporting nothing. So a cycle with no active drafts BLOCKS.
//
// AMBIGUITY BLOCKS AND REPORTS, IT NEVER PICKS. More than one cycle carrying active drafts is a real business
// condition (an unfinished previous run), and choosing the busiest or the newest would silently target a run the
// operator did not mean. Every candidate is reported and the caller is blocked, with zero writes.
//
// There is NO Script Property read anywhere in this resolution, and the optional override is a single named
// constant owned by TEMP_request_order_send_diagnostics.gs — passed IN as an argument, never read from here,
// so this function has exactly one input and no hidden configuration authority.
var ROS_CYCLE_SOURCE_OVERRIDE_ = 'EXPLICIT_OVERRIDE_CONSTANT';
var ROS_CYCLE_SOURCE_PERSISTED_ = 'PERSISTED_ACTIVE_ALLOCATION_DRAFTS';
var ROS_CYCLE_SOURCE_NONE_ = 'NONE';

function rosResolveCurrentPlanningCycle_(draftRows, overrideValue) {
  var census = rosPlanningCycleCensus_(draftRows);
  var candidates = census.cycles.filter(function (c) { return c.active_drafts > 0 && /^\d{4}-\d{2}$/.test(c.planning_cycle); });
  var out = {
    resolved_planning_cycle: '',
    resolution_source: ROS_CYCLE_SOURCE_NONE_,
    status: '',
    blocked: true,
    reason: '',
    candidate_count: candidates.length,
    candidates: candidates,
    all_cycles: census.cycles,
    override: { supplied: false, value: '', valid: false, has_persisted_rows: false }
  };

  var ov = rosStr_(overrideValue);
  if (ov && ov.indexOf('PASTE_') !== 0) {
    out.override.supplied = true;
    out.override.value = ov;
    out.override.valid = /^\d{4}-\d{2}$/.test(ov);
    if (!out.override.valid) {
      out.status = 'OVERRIDE_INVALID';
      out.reason = 'the explicit override constant is not a YYYY-MM planning cycle; nothing was read from the workset and nothing was written';
      return out;
    }
    out.override.has_persisted_rows = census.cycles.some(function (c) { return c.planning_cycle === ov && c.persisted_drafts > 0; });
    out.resolved_planning_cycle = ov;
    out.resolution_source = ROS_CYCLE_SOURCE_OVERRIDE_;
    out.status = 'RESOLVED';
    out.blocked = false;
    // An override to a cycle with no persisted rows is HONOURED (that is what an override is for) but reported
    // loudly, because it is otherwise indistinguishable from a working probe that finds nothing.
    out.reason = out.override.has_persisted_rows
      ? 'resolved from the explicit override constant, which does carry persisted rows'
      : 'resolved from the explicit override constant — WARNING: this cycle carries NO persisted allocation drafts, so the probe will legitimately report an empty workset';
    return out;
  }

  if (candidates.length === 1) {
    out.resolved_planning_cycle = candidates[0].planning_cycle;
    out.resolution_source = ROS_CYCLE_SOURCE_PERSISTED_;
    out.status = 'RESOLVED';
    out.blocked = false;
    out.reason = 'exactly one planning cycle carries ACTIVE persisted allocation drafts — the same persisted authority the website resolves from';
    return out;
  }
  if (candidates.length === 0) {
    out.status = 'NO_ACTIVE_DRAFTS';
    out.reason = 'no planning cycle carries an ACTIVE persisted allocation draft, so there is no current run to probe. Run AI Plan / Search on the website first, or set the explicit override constant for a controlled test. Nothing was written.';
    return out;
  }
  out.status = 'AMBIGUOUS';
  out.reason = candidates.length + ' planning cycles carry ACTIVE persisted allocation drafts, so the current run cannot be resolved without a decision. Every candidate is listed above. Set the explicit override constant to the ONE you mean. Nothing was read from the workset and nothing was written.';
  return out;
}

// __ROS_PURE_END__

// ============================================================================================================
// IMPURE layer — injectable io so the suite exercises the orchestration against fixtures with ZERO Apps Script.
// ============================================================================================================

function rosBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', build: ROS_BUILD_VERSION_ };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// Series + units-per-carton authority = sku_details (the SAME canonical authority 56_ uses). The flat V2 draft
// row carries NO series column, so series must be resolved here rather than invented.
function rosSeriesIndex_(skuDetailRows) {
  var series = {}, upc = {};
  (skuDetailRows || []).forEach(function (d) {
    var k = rosUc_(rosStr_(d && d.sku)); if (!k) return;
    if (series[k] === undefined) series[k] = rosStr_(d.series);
    if (upc[k] === undefined) upc[k] = d.units_per_carton;
  });
  return { series: series, upc: upc };
}

function rosDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    openDb: function () { return SpreadsheetApp.openById(prodExpectedDbId_()); },
    readTable: function (ss, name) { return gapReadObjects_(ss, name); },
    // The canonical writers, reached ONLY through these two seams. There is no third write seam in this file.
    createRequestOrderDraft: function (body) { return rosUnwrap_(handleCreateRequestOrderDraft_(body)); },
    submitAllocationDrafts: function (body) { return rosUnwrap_(handleSubmitRequestOrderAllocationDrafts_(body)); },
    propGet: function (name) { try { return PropertiesService.getScriptProperties().getProperty(name); } catch (e) { return null; } },
    propSet: function (name, value) { try { PropertiesService.getScriptProperties().setProperty(name, value); return true; } catch (e) { return false; } },
    propDelete: function (name) { try { PropertiesService.getScriptProperties().deleteProperty(name); return true; } catch (e) { return false; } },
    // §E — the ONLY lock this file takes, and it wraps a compare-and-set over two Script Properties. It is NEVER
    // held across a canonical writer call: handleCreateRequestOrderDraft_ does its own tryLock(30000), so holding
    // this across it would make the orchestrator contend with its own callee and time out.
    withCasLock: function (fn) {
      var lock = LockService.getScriptLock(), got = false;
      try { got = lock.tryLock(15000); } catch (e) { return { locked: false, error: String(e && e.message || e) }; }
      if (!got) return { locked: false, error: 'CAS_LOCK_UNAVAILABLE' };
      try { return { locked: true, value: fn() }; } finally { try { lock.releaseLock(); } catch (e2) {} }
    }
  };
}
// FB-4A §B — READ-ONLY census reader. Opens the DB and reads exactly ONE table. It performs no property read,
// no property write, no lock, no business read (no workset build, no series resolution, no sku_details read) and
// no write of any kind. A failure to read is reported, never silently swallowed into "no cycles".
function rosReadPlanningCycleCensus_(io) {
  io = io || rosDefaultIo_();
  try {
    var ss = io.openDb();
    return rosPlanningCycleCensus_(io.readTable(ss, ROS_DRAFTS_TABLE_));
  } catch (e) {
    return { cycles: [], active_cycles: [], recommended: '',
      recommendation_basis: 'UNAVAILABLE — ' + ROS_DRAFTS_TABLE_ + ' could not be read: ' + String(e && e.message || e) };
  }
}

// FB-4A ADDENDUM §F/§G — READ-ONLY resolution reader. One table, no property read, no property write, no lock,
// no business read and no write of any kind. A failure to read is reported, never swallowed into "no cycles".
function rosReadResolvedPlanningCycle_(overrideValue, io) {
  io = io || rosDefaultIo_();
  try {
    var ss = io.openDb();
    return rosResolveCurrentPlanningCycle_(io.readTable(ss, ROS_DRAFTS_TABLE_), overrideValue);
  } catch (e) {
    return { resolved_planning_cycle: '', resolution_source: ROS_CYCLE_SOURCE_NONE_, status: 'WORKSET_UNREADABLE',
      blocked: true, reason: ROS_DRAFTS_TABLE_ + ' could not be read: ' + String(e && e.message || e),
      candidate_count: 0, candidates: [], all_cycles: [],
      override: { supplied: false, value: '', valid: false, has_persisted_rows: false } };
  }
}

// The canonical handlers answer with a ContentService response. Unwrap without re-implementing anything.
function rosUnwrap_(resp) {
  if (resp && typeof resp.getContent === 'function') {
    try { return JSON.parse(resp.getContent()); } catch (e) { return { success: false, error: 'CANONICAL_WRITER_RESPONSE_UNPARSEABLE' }; }
  }
  return resp || { success: false, error: 'CANONICAL_WRITER_NO_RESPONSE' };
}

// ---- chunked journal read/write (see rosChunk_ for the storage rationale) -----------------------------------
function rosJournalWrite_(io, key, journal) {
  var json = JSON.stringify(journal || {});
  var chunks = rosChunk_(json, ROS_CHUNK_CHARS_);
  if (chunks.length > ROS_MAX_CHUNKS_) return { ok: false, reason: 'JOURNAL_TOO_LARGE', chunks: chunks.length };
  var base = ROS_JOURNAL_PREFIX_ + key;
  for (var i = 0; i < chunks.length; i++) io.propSet(base + '__' + i, chunks[i]);
  io.propSet(base, JSON.stringify({ chunks: chunks.length, len: json.length }));
  // Remove any stale tail from a previously longer journal, so a read can never splice two generations together.
  for (var j = chunks.length; j < ROS_MAX_CHUNKS_; j++) {
    var stale = base + '__' + j;
    if (io.propGet(stale) == null) break;
    io.propDelete(stale);
  }
  return { ok: true, chunks: chunks.length, bytes: json.length };
}
function rosJournalRead_(io, key) {
  var base = ROS_JOURNAL_PREFIX_ + key;
  var man = io.propGet(base);
  if (!man) return null;
  var m; try { m = JSON.parse(man); } catch (e) { return null; }
  var parts = [];
  for (var i = 0; i < Number(m.chunks || 0); i++) {
    var c = io.propGet(base + '__' + i);
    if (c == null) return null;   // an incomplete journal is NO journal — never a half-read plan
    parts.push(c);
  }
  var json = parts.join('');
  if (json.length !== Number(m.len)) return null;
  try { return JSON.parse(json); } catch (e2) { return null; }
}

// §E — ATOMIC ownership + journal transition. The pure decision (rosOwnershipDecision_) is applied INSIDE the
// CAS lock over a freshly-read record, so two concurrent calls cannot both observe "no owner".
function rosOwnershipTransact_(io, cycle, key, nowMs, journalMutator) {
  var activeName = ROS_ACTIVE_PREFIX_ + rosStr_(cycle);
  var res = io.withCasLock(function () {
    var raw = io.propGet(activeName);
    var rec = null;
    if (raw) { try { rec = JSON.parse(raw); } catch (e) { rec = null; } }
    var decision = rosOwnershipDecision_(rec, key, nowMs);
    if (decision.verdict === 'REFUSE') return { granted: false, decision: decision };
    var journal = rosJournalRead_(io, key);
    var next = journalMutator ? journalMutator(journal) : journal;
    if (next) {
      next.lease_at = nowMs;
      var w = rosJournalWrite_(io, key, next);
      if (!w.ok) return { granted: false, decision: { verdict: 'REFUSE', reason: w.reason } };
    }
    io.propSet(activeName, JSON.stringify({ execution_key: key, lease_at: nowMs,
      status: (next && next.status) || 'RUNNING', planning_cycle: rosStr_(cycle) }));
    return { granted: true, decision: decision, journal: next };
  });
  if (!res.locked) return { granted: false, decision: { verdict: 'REFUSE', reason: res.error || 'CAS_LOCK_UNAVAILABLE' } };
  return res.value;
}
// Release ownership (terminal states only). Keeps the journal for replay; clears the cycle's active record.
function rosOwnershipRelease_(io, cycle, key, nowMs, journal) {
  var activeName = ROS_ACTIVE_PREFIX_ + rosStr_(cycle);
  io.withCasLock(function () {
    if (journal) { journal.lease_at = 0; rosJournalWrite_(io, key, journal); }
    var raw = io.propGet(activeName);
    var rec = null;
    if (raw) { try { rec = JSON.parse(raw); } catch (e) { rec = null; } }
    if (!rec || rosStr_(rec.execution_key) === rosStr_(key)) io.propDelete(activeName);
    return true;
  });
}

// The labelled count block, in one place, so the wire shape and the confirmation dialog cannot drift apart.
function rosCountsOf_(ws) {
  return {
    persisted_drafts_in_cycle: ws.persisted_drafts_in_cycle,
    active_persisted_drafts: ws.active_persisted_drafts,
    drafts_with_positive_selected_tier: ws.drafts_with_positive_selected_tier,
    selected_tier_allocations: ws.selected_tier_allocations,
    positive_selected_tier_allocations: ws.positive_selected_tier_allocations,
    distinct_skus: ws.distinct_skus, distinct_series: ws.distinct_series,
    expected_request_order_headers: ws.expected_request_order_headers,
    expected_request_order_lines: ws.expected_request_order_lines,
    total_units: ws.total_units
  };
}

// ------------------------------------------------------------------------------------------------------------
// FB-3B §F — requestOrder.sendWorkset.get   INCLUDE-GATED SLIM READ.  STRICTLY READ-ONLY.
// Two tables instead of the eleven aiPlanFirstLayer.get reads, so Send Request never depends on refreshing the
// AI-Plan payload. Server phases are timed individually, so a live run names WHICH phase is slow.
// ------------------------------------------------------------------------------------------------------------
var ROS_SLIM_DRAFT_PROJECTION_ = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country',
  'marketplace', 'sku', 'series', 'status', 'draft_version', 'units_per_carton', 'updated_at',
  't1_month', 't1_order_qty', 't1_status', 't1_user_edited',
  't2_month', 't2_order_qty', 't2_status', 't2_user_edited',
  't3_month', 't3_order_qty', 't3_status', 't3_user_edited'];
var ROS_SLIM_FORBIDDEN_INCLUDES_ = ['forecast', 'gap', 'recommendation', 'inventory', 'sales', 'risk',
  'lead_time', 'open_po', 'presentation'];

function rosProjectSlimDraft_(row, seriesBySku) {
  var o = {};
  ROS_SLIM_DRAFT_PROJECTION_.forEach(function (f) {
    if (f === 'series') { o.series = rosStr_((seriesBySku || {})[rosUc_(rosStr_(row && row.sku))] || ''); return; }
    var v = (row || {})[f];
    o[f] = (v == null ? '' : (typeof v === 'number' ? v : rosStr_(v)));
  });
  return o;
}
// An unknown or forbidden include is REFUSED by name (never silently ignored — a silently-ignored include is how
// a slim API grows back into a fat one).
function rosResolveIncludes_(requested) {
  var allowed = { drafts: 1, counts: 1, groups: 1 };
  var out = { includes: {}, rejected: [] };
  var list = (requested && requested.length) ? requested : ['counts'];
  list.forEach(function (r) {
    var k = rosLc_(r);
    if (allowed[k]) { out.includes[k] = true; return; }
    out.rejected.push({ include: k, reason: (ROS_SLIM_FORBIDDEN_INCLUDES_.indexOf(k) !== -1) ? 'FORBIDDEN_NOT_A_SEND_FIELD' : 'UNKNOWN_INCLUDE' });
  });
  return out;
}

function handleRequestOrderSendWorksetGet_(body, io) {
  io = io || rosDefaultIo_();
  var t0 = io.now(), phases = [];
  function mark(name, from) { phases.push({ phase: name, ms: io.now() - from }); return io.now(); }
  try {
    var payload = (body && body.payload) || body || {};
    var scope = rosNormalizeTierScope_(payload.tier_scope);
    if (!scope) return rosBuildEnvelope_(false, null, [{ code: 'INVALID_TIER_SCOPE', message: 'tier_scope must be one of ALL / T1 / T2 / T3 — the only BUSINESS_SEND_SCOPE control.' }], { serverDurationMs: io.now() - t0 });
    var cycle = rosStr_(payload.planning_cycle);
    if (!cycle) return rosBuildEnvelope_(false, null, [{ code: 'PLANNING_CYCLE_REQUIRED', message: 'planning_cycle (YYYY-MM) is the current-run authority and must be supplied by the caller.' }], { serverDurationMs: io.now() - t0 });
    var inc = rosResolveIncludes_(payload.include);

    var tOpen = io.now();
    var ss = io.openDb();
    var tAfterOpen = mark('sheet_open', tOpen);
    var draftRows = io.readTable(ss, ROS_DRAFTS_TABLE_);
    var tAfterDrafts = mark('row_read_drafts', tAfterOpen);
    var detailRows = io.readTable(ss, ROS_SKU_DETAILS_TABLE_);
    var tAfterDetails = mark('row_read_sku_details', tAfterDrafts);
    var idx = rosSeriesIndex_(detailRows);
    var tAfterIndex = mark('header_resolution', tAfterDetails);

    var ws = rosBuildWorkset_(draftRows, { planning_cycle: cycle, tier_scope: scope,
      series_by_sku: idx.series, units_per_carton_by_sku: idx.upc });
    var tAfterBuild = mark('current_run_filtering', tAfterIndex);
    if (ws.error) return rosBuildEnvelope_(false, null, [{ code: ws.error, message: 'workset could not be built' }], { serverDurationMs: io.now() - t0, phases: phases });

    var data = {
      planning_cycle: cycle, tier_scope: scope, tiers_in_scope: ws.tiers_in_scope,
      current_run_authority: rosCurrentRunAuthority_(cycle),
      business_send_scope_controls: ['tier_scope'],
      display_only_controls: ROS_DISPLAY_ONLY_CONTROLS_.slice(),
      counts: rosCountsOf_(ws),
      excluded: ws.excluded,
      blocking_conflicts: ws.blocking_conflicts,
      workset_checksum: rosWorksetChecksum_(ws),
      includes_rejected: inc.rejected,
      projection: ROS_SLIM_DRAFT_PROJECTION_.slice()
    };
    if (inc.includes.drafts) {
      var byId = {};
      (draftRows || []).forEach(function (r) { byId[rosStr_(r && r.request_allocation_draft_id)] = r; });
      data.drafts = ws.drafts.map(function (d) { return rosProjectSlimDraft_(byId[d.request_allocation_draft_id] || {}, idx.series); });
    }
    if (inc.includes.groups) {
      data.groups = rosGroupBySeries_(ws).map(function (g) {
        return { series: g.series, line_count: g.line_count, distinct_skus: g.distinct_skus, total_units: g.total_units,
          allocation_draft_ids: g.allocation_draft_ids };
      });
    }
    mark('mapping', tAfterBuild);
    var json = JSON.stringify(data);
    phases.push({ phase: 'serialization', ms: 0, response_bytes: json.length });
    return rosBuildEnvelope_(true, data, [], { serverDurationMs: io.now() - t0, phases: phases,
      response_bytes: json.length, tablesRead: 2, writes_performed: 0 });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode)) || 'REQUEST_ORDER_SEND_WORKSET_READ_FAILED';
    return rosBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e) }], { serverDurationMs: io.now() - t0, phases: phases });
  }
}

// ------------------------------------------------------------------------------------------------------------
// §D/§E/§F/§G — requestOrder.send.orchestrate
//
// body.payload:
//   { tier_scope: 'ALL'|'T1'|'T2'|'T3',        // the ONLY business scope control
//     planning_cycle: 'YYYY-MM',               // current-run authority
//     execution_planning_cycle?: string,       // the value fed to the EXISTING per-series execution key (13_),
//                                              //   kept caller-supplied so a Send interrupted under an older
//                                              //   client converges on the SAME Request Order on continuation
//     intents?: [ { company, country, marketplace, sku, tiers:{ T1:{order_qty}, ... } } ],
//     mode?: 'preview' | 'execute',            // preview FREEZES and journals the plan; it writes no business row
//     confirmed_checksum?: string,             // REQUIRED to execute: the checksum the user actually approved
//     actor?, continuation?: number }
//
// A user click produces ONE preview and then ONE OR MORE execute calls. Every execute call carries the SAME
// immutable execution key and the SAME confirmed checksum; the SERVER decides the next work item from its
// journal. The browser never groups, orders or selects business work — it only asks "continue".
// ------------------------------------------------------------------------------------------------------------
function handleRequestOrderSendOrchestrate_(body, io) {
  io = io || rosDefaultIo_();
  var t0 = io.now();
  var payload = (body && body.payload) || body || {};
  var trace = [];
  function phase(name, extra) { trace.push(Object.assign({ phase: name, at_ms: io.now() - t0 }, extra || {})); }

  // ---- PHASE 1 · validate -----------------------------------------------------------------------------
  phase('validate');
  var scope = rosNormalizeTierScope_(payload.tier_scope);
  if (!scope) return rosBuildEnvelope_(false, null, [{ code: 'INVALID_TIER_SCOPE',
    message: 'tier_scope must be ALL / T1 / T2 / T3. Country, Marketplace, Category, Risk, Show mode, SKU search and pagination are DISPLAY_ONLY and are not accepted here.',
    details: { display_only_controls: ROS_DISPLAY_ONLY_CONTROLS_.slice() } }], { zero_write: true, trace: trace });
  var cycle = rosStr_(payload.planning_cycle);
  if (!cycle) return rosBuildEnvelope_(false, null, [{ code: 'PLANNING_CYCLE_REQUIRED', message: 'planning_cycle (YYYY-MM) is required — it is the current-run authority.' }], { zero_write: true, trace: trace });
  var actor = rosStr_(payload.actor) || 'request-order';
  var execCycle = rosStr_(payload.execution_planning_cycle) || cycle;
  var key = rosOrchestrationKey_(payload);
  // dry_run is accepted as the FB-3B alias so a client mid-deploy cannot accidentally execute.
  var preview = payload.mode === 'preview' || payload.dry_run === true;
  var continuation = Math.max(0, Number(payload.continuation) || 0);
  if (continuation > ROS_MAX_CONTINUATIONS_) {
    return rosBuildEnvelope_(false, null, [{ code: 'SEND_CONTINUATION_LIMIT_REACHED',
      message: 'This Send has already used ' + continuation + ' continuations. Stopping so a runaway loop cannot keep writing. Run the interrupted-Send reconciliation and resume deliberately.',
      details: { orchestration_key: key, limit: ROS_MAX_CONTINUATIONS_ } }], { trace: trace });
  }

  try {
    // ---- PHASE 1b · idempotent replay, BEFORE anything is read ---------------------------------------
    // This must not depend on the current row state: after a successful Send the drafts are terminal, so a
    // workset-first check would answer a duplicate click with "nothing eligible" — true, and exactly the wrong
    // thing to tell an operator who lost the response. The key is derivable from the request alone.
    var priorJournal = rosJournalRead_(io, key);
    if (priorJournal && rosStr_(priorJournal.status) === 'COMPLETED' && !preview) {
      phase('replay_completed');
      return rosBuildEnvelope_(true, Object.assign({}, priorJournal.result || {}, { status: 'ALREADY_COMPLETED',
        orchestration_key: key, replayed: true, writes_performed: 0,
        next_action: 'This exact Send already completed. Nothing was written again. Open Request Order Draft to Approve / Convert to PO.' }), [],
        { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- PHASE 2 · load_workset (SERVER-OWNED; no site/display parameter exists) ---------------------
    phase('load_workset');
    var ss = io.openDb();
    var draftRows = io.readTable(ss, ROS_DRAFTS_TABLE_);
    var idx = rosSeriesIndex_(io.readTable(ss, ROS_SKU_DETAILS_TABLE_));
    var wsOpts = { planning_cycle: cycle, tier_scope: scope, series_by_sku: idx.series, units_per_carton_by_sku: idx.upc };
    var ws = rosBuildWorkset_(draftRows, wsOpts);
    if (ws.error) return rosBuildEnvelope_(false, null, [{ code: ws.error, message: 'workset could not be built' }], { zero_write: true, trace: trace });
    phase('load_workset_done', { active_persisted_drafts: ws.active_persisted_drafts,
      positive_selected_tier_allocations: ws.positive_selected_tier_allocations });

    // §H fail-closed: a duplicated business identity is never resolved by guessing.
    if (ws.blocking_conflicts.length) {
      return rosBuildEnvelope_(false, null, [{ code: 'DUPLICATE_BUSINESS_IDENTITY',
        message: ws.blocking_conflicts.length + ' business scope(s) have more than one active allocation draft. Neither row is sent, because which quantity is authoritative is a business decision. Nothing was written.',
        details: { conflicts: ws.blocking_conflicts.slice(0, 25),
          next_action: 'Run the allocation-draft identity diagnostic (system.allocationDraftIdentityDiagnostic) and resolve the duplicates.' } }],
        { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }

    if (!ws.rows.length) {
      return rosBuildEnvelope_(true, { status: 'NO_ELIGIBLE_PERSISTED_ALLOCATION', orchestration_key: key,
        counts: rosCountsOf_(ws), excluded: ws.excluded, writes_performed: 0,
        next_action: 'Nothing is eligible. Enter a positive tier quantity (which persists a canonical draft) or run AI Plan, then Send again.' },
        [], { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- PHASE 3 · verify_quantities (the read-after-write barrier) -----------------------------------
    phase('verify_quantities');
    var zeroIdx = rosZeroQtyIndex_(draftRows, wsOpts);
    var verify = rosVerifyQuantities_(ws, payload.intents || [], zeroIdx);
    if (verify.blocked) {
      return rosBuildEnvelope_(false, null, [{ code: 'QUANTITY_VERIFICATION_FAILED',
        message: verify.failures.length + ' quantity assertion(s) do not match the persisted allocation. The ENTIRE Send was blocked and nothing was written.',
        details: { failures: verify.failures.slice(0, 50), failure_count: verify.failures.length,
          intents_total: verify.intents_total, intents_matched: verify.intents_matched } }],
        { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }
    phase('verify_quantities_done', { verified: verify.verified, zero_verified: verify.zero_intents_matched,
      rows_without_intent: verify.workset_rows_without_intent });

    // ---- PHASE 4 · freeze -----------------------------------------------------------------------------
    phase('freeze');
    var checksum = rosWorksetChecksum_(ws);
    var nowMs = io.now();
    var groups = rosGroupBySeries_(ws);
    var counts = rosCountsOf_(ws);
    var plan = {
      status: preview ? 'PREVIEW' : 'PLANNED',
      orchestration_key: key, workset_checksum: checksum,
      planning_cycle: cycle, tier_scope: scope, tiers_in_scope: ws.tiers_in_scope,
      current_run_authority: rosCurrentRunAuthority_(cycle),
      business_send_scope_controls: ['tier_scope'], display_only_controls: ROS_DISPLAY_ONLY_CONTROLS_.slice(),
      counts: counts, excluded: ws.excluded,
      quantity_verification: { asserted: verify.intents_total, verified: verify.verified,
        zero_verified: verify.zero_intents_matched,
        persisted_without_assertion: verify.workset_rows_without_intent, failures: 0 },
      series_groups: groups.map(function (g) { return { series: g.series, line_count: g.line_count,
        distinct_skus: g.distinct_skus, total_units: g.total_units, allocation_draft_ids: g.allocation_draft_ids }; })
    };

    // ---- §F PREVIEW: freeze the plan IN THE JOURNAL and hand back the checksum the user must confirm ---
    if (preview) {
      var pj = { orchestration_key: key, status: 'PREVIEW', phase: 'freeze', started_at: nowMs,
        workset_checksum: checksum, planning_cycle: cycle, tier_scope: scope,
        counts: counts, series_order: groups.map(function (g) { return g.series_key; }),
        series_done: {}, transitioned: [], continuation: 0 };
      var pw = rosJournalWrite_(io, key, pj);
      plan.writes_performed = 0;
      plan.journal_persisted = pw.ok;
      plan.journal_bytes = pw.bytes || 0;
      plan.confirm_with_checksum = checksum;
      plan.slice_budget_ms = ROS_SLICE_BUDGET_MS_;
      plan.safe_to_close = true;
      plan.next_action = 'Confirm this plan and re-invoke with mode=execute and confirmed_checksum=' + checksum + '. If the persisted allocation changes in between, the execute call is refused with SEND_WORKSET_DRIFT.';
      return rosBuildEnvelope_(true, plan, [], { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- §F EXECUTE: the approved checksum is mandatory and must still hold ---------------------------
    var confirmed = rosStr_(payload.confirmed_checksum);
    if (!confirmed) {
      return rosBuildEnvelope_(false, null, [{ code: 'SEND_CONFIRMATION_REQUIRED',
        message: 'An execute call must carry confirmed_checksum from a preview. Nothing was written.',
        details: { orchestration_key: key, current_checksum: checksum } }], { zero_write: true, trace: trace });
    }
    if (confirmed !== checksum) {
      // The source moved between preview and confirmation. NEVER silently execute a different (possibly larger)
      // Send than the one the operator approved.
      return rosBuildEnvelope_(false, null, [{ code: 'SEND_WORKSET_DRIFT',
        message: 'The persisted allocation changed after the plan was previewed, so the approved plan no longer matches the data. Nothing was written. Preview again and re-confirm.',
        details: { orchestration_key: key, confirmed_checksum: confirmed, current_checksum: checksum,
          next_action: 'Request a new preview and confirm the new counts.' } }],
        { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }
    if (priorJournal && rosStr_(priorJournal.workset_checksum) && priorJournal.workset_checksum !== checksum) {
      return rosBuildEnvelope_(false, null, [{ code: 'SEND_WORKSET_DRIFT',
        message: 'The journal for this Send was frozen against a different source. Nothing was written. Preview again.',
        details: { orchestration_key: key, journal_checksum: rosStr_(priorJournal.workset_checksum), current_checksum: checksum } }],
        { zero_write: true, trace: trace });
    }

    // ---- §E ATOMIC OWNERSHIP. Compare-and-set under a SHORT lock, released before any writer runs. ----
    var own = rosOwnershipTransact_(io, cycle, key, nowMs, function (j) {
      var next = j || { orchestration_key: key, status: 'RUNNING', started_at: nowMs, workset_checksum: checksum,
        planning_cycle: cycle, tier_scope: scope, counts: counts,
        series_order: groups.map(function (g) { return g.series_key; }), series_done: {}, transitioned: [] };
      next.status = 'RUNNING';
      next.phase = 'write_orders';
      next.continuation = continuation;
      next.workset_checksum = checksum;
      next.series_done = next.series_done || {};
      next.transitioned = next.transitioned || [];
      return next;
    });
    if (!own.granted) {
      var refuseCode = own.decision.reason === 'SEND_WORKSET_OWNED_BY_ANOTHER_EXECUTION'
        ? 'SEND_WORKSET_OWNED_BY_ANOTHER_EXECUTION' : 'SEND_LEASE_UNAVAILABLE';
      return rosBuildEnvelope_(false, null, [{ code: refuseCode,
        message: refuseCode === 'SEND_WORKSET_OWNED_BY_ANOTHER_EXECUTION'
          ? 'Another Send execution currently owns this planning cycle. Do NOT retry — wait for it to finish, or read back by execution key. Nothing was written.'
          : 'The Send ownership lease could not be acquired. Nothing was written; retry in a moment.',
        details: { orchestration_key: key, owner: own.decision.owner || '', reason: own.decision.reason } }],
        { zero_write: true, trace: trace });
    }
    var journal = own.journal;
    phase('freeze_done', { workset_checksum: checksum, series_groups: groups.length,
      ownership: own.decision.reason, continuation: continuation });

    // ---- PHASE 6 · write_orders — DELEGATED, one Series at a time, inside the SLICE budget ------------
    phase('write_orders');
    var created = [], reused = [], writeErrors = [], deferred = [], verifiedGroups = [];
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      if (journal.series_done[g.series_key]) { reused.push(journal.series_done[g.series_key]); continue; }
      // §D — stop ADMITTING work at the derived budget, never mid-write. The worst case from here is
      // ROS_MAX_SINGLE_WRITE_MS_, and ROS_RESERVE_MS_ still remains before the client bound.
      if ((io.now() - t0) > ROS_SLICE_BUDGET_MS_) { deferred = groups.slice(gi).map(function (x) { return x.series_key; }); break; }

      var writerBody = {
        company: '', source: 'manual', source_ref_type: 'request_order_allocation_batch',
        planning_cycle: execCycle, series: g.series,
        note: 'Send Request — series ' + (g.series || '(no series)') + ' · ' + scope + ' · exec ' + key,
        created_by: actor,
        lines: g.lines.map(function (l) {
          return { sku: l.sku, series: l.series, company: l.company, requested_qty: l.order_qty,
            request_bucket: l.request_bucket, request_month: l.request_month,
            country: l.country, marketplace: l.marketplace,
            request_allocation_draft_id: l.request_allocation_draft_id,
            units_per_carton: l.units_per_carton,
            calculation_method: 'server_orchestrated_allocation', line_status: 'draft',
            need_reason: l.company + ' / ' + l.country + ' / ' + l.marketplace + ' · ' + l.request_bucket + ' ' + l.request_month };
        })
      };
      var w = io.createRequestOrderDraft(writerBody);
      if (!w || w.success !== true) {
        writeErrors.push({ series: g.series, error: rosStr_(w && (w.error || w.message)) || 'CREATE_REQUEST_ORDER_FAILED', stage: rosStr_(w && w.stage) });
        break;   // stop at the first failure: nothing is advanced, and the journal holds what landed
      }
      var d = (w.data || {});
      var rec = { series: g.series, series_key: g.series_key, request_order_id: rosStr_(d.request_order_id),
        request_order_no: rosStr_(d.request_order_no), reused: d.reused === true,
        execution_key: rosStr_(d.execution_key), line_count: g.line_count,
        allocation_draft_ids: g.allocation_draft_ids };
      journal.series_done[g.series_key] = rec;
      // Renew the lease and journal AFTER each Series, so a kill loses no proven work and a concurrent caller
      // still sees a live owner. The CAS lock is taken and released here — never held across the writer above.
      rosOwnershipTransact_(io, cycle, key, io.now(), function () { return journal; });
      (rec.reused ? reused : created).push(rec);
    }
    phase('write_orders_done', { created: created.length, reused: reused.length, deferred: deferred.length });

    if (writeErrors.length) {
      journal.status = 'FAILED'; journal.errors = writeErrors;
      rosOwnershipRelease_(io, cycle, key, io.now(), journal);
      return rosBuildEnvelope_(false, null, [{ code: 'REQUEST_ORDER_WRITE_FAILED',
        message: 'A Request Order could not be created. No allocation draft was advanced; the Request Orders already created for this execution are recorded and will be REUSED (not duplicated) when you continue.',
        details: { orchestration_key: key, failed: writeErrors,
          request_orders_created: created.map(function (x) { return x.request_order_no; }),
          resume_action: 'Fix the reported cause, then re-invoke mode=execute with the SAME confirmed_checksum.' } }],
        { trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- PHASE 7 · verify_output — EXACT quantity + lineage proof, per Series -------------------------
    phase('verify_output');
    var orderRows = io.readTable(ss, 'request_orders');
    var lineRows = io.readTable(ss, 'request_order_lines');
    var sourceRows = io.readTable(ss, 'request_order_line_sources');
    var orderById = {};
    (orderRows || []).forEach(function (r) { var k = rosStr_(r && r.request_order_id); if (k) orderById[k] = r; });
    var groupByKey = {};
    groups.forEach(function (g) { groupByKey[g.series_key] = g; });

    var allRecs = created.concat(reused), outputFailures = [], provenDraftIds = {};
    allRecs.forEach(function (rec) {
      var g = groupByKey[rec.series_key];
      if (!g) { outputFailures.push({ series: rec.series, code: 'FROZEN_GROUP_MISSING' }); return; }
      var v = rosVerifyRequestOrderOutput_({ request_order_id: rec.request_order_id, lines: g.lines },
        orderById[rec.request_order_id], lineRows, sourceRows);
      rec.verified_lines = v.verified_lines;
      rec.verified_qty = v.verified_qty;
      rec.output_verified = v.ok;
      if (!v.ok) { outputFailures.push({ series: rec.series, request_order_no: rec.request_order_no, failures: v.failures.slice(0, 20) }); return; }
      verifiedGroups.push(rec);
      (rec.allocation_draft_ids || []).forEach(function (id) { provenDraftIds[id] = 1; });
    });
    phase('verify_output_done', { orders: allRecs.length, verified: verifiedGroups.length, failed: outputFailures.length });

    if (outputFailures.length) {
      // §G — journal the exact mismatch, PRESERVE already-proven output, advance NOTHING for the failed group,
      // and never manufacture a compensating quantity.
      journal.status = 'OUTPUT_VERIFICATION_FAILED';
      journal.output_failures = outputFailures;
      rosOwnershipRelease_(io, cycle, key, io.now(), journal);
      return rosBuildEnvelope_(false, null, [{ code: 'REQUEST_ORDER_OUTPUT_VERIFICATION_FAILED',
        message: outputFailures.length + ' Request Order(s) do not match the frozen workset field by field. NO allocation draft was advanced for them, so nothing is marked sent without a verified output. No compensating quantity was written.',
        details: { orchestration_key: key, failures: outputFailures,
          proven_request_orders: verifiedGroups.map(function (x) { return x.request_order_no; }),
          next_action: 'Run system.requestOrderSendReconcile for this planning cycle. Correct the cause, then preview and confirm a fresh Send; already-proven Request Orders are reused by execution key.' } }],
        { trace: trace, serverDurationMs: io.now() - t0 });
    }

    if (deferred.length) {
      // §D — a voluntary slice boundary. NOT a failure and NOT indeterminate: every Series either has a
      // journalled Request Order or has not been started. The lease stays live so the continuation owns it.
      journal.status = 'PARTIAL'; journal.phase = 'write_orders';
      rosOwnershipTransact_(io, cycle, key, io.now(), function () { return journal; });
      return rosBuildEnvelope_(true, { status: 'PARTIAL_RESUMABLE', orchestration_key: key,
        workset_checksum: checksum, confirm_with_checksum: checksum, counts: counts,
        request_orders_created: created, request_orders_reused: reused,
        verified_headers: verifiedGroups.length,
        verified_lines: verifiedGroups.reduce(function (s, x) { return s + (x.verified_lines || 0); }, 0),
        series_total: groups.length, series_done: Object.keys(journal.series_done).length,
        series_remaining: deferred.length, lifecycle_advanced: false,
        continuation: continuation, safe_to_close: true, resumable: true,
        slice_budget_ms: ROS_SLICE_BUDGET_MS_, elapsed_ms: io.now() - t0,
        next_action: 'CONTINUE: re-invoke mode=execute with the SAME confirmed_checksum and continuation=' + (continuation + 1) + '. Do NOT start a new Send: the server picks the next Series and completed ones are skipped by execution key. It is safe to close the page — the journal owns the progress.' },
        [], { trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- PHASE 8 · transition — canonical lifecycle advance, ONLY over PROVEN output ------------------
    phase('transition');
    var ids = Object.keys(provenDraftIds).sort();
    var submitBuckets = (scope === 'ALL') ? null : [scope];   // a tier-scoped Send advances ONLY that tier
    var sub = ids.length ? io.submitAllocationDrafts({ draft_ids: ids, submitted_by: actor, submit_buckets: submitBuckets }) : { success: true, data: { submitted: 0 } };
    if (!sub || sub.success !== true) {
      journal.status = 'TRANSITION_FAILED';
      rosOwnershipRelease_(io, cycle, key, io.now(), journal);
      return rosBuildEnvelope_(false, null, [{ code: 'ALLOCATION_TRANSITION_FAILED',
        message: 'The Request Orders exist and are field-verified, but the allocation lifecycle could not be advanced. Continue with the SAME confirmed_checksum: the Request Orders are reused by execution key and only the transition is retried.',
        details: { orchestration_key: key, request_orders: verifiedGroups.map(function (x) { return x.request_order_no; }),
          error: rosStr_(sub && (sub.error || sub.message)) } }],
        { trace: trace, serverDurationMs: io.now() - t0 });
    }
    journal.transitioned = ids;
    phase('transition_done', { drafts_advanced: ids.length, submit_buckets: submitBuckets });

    // ---- PHASE 9 · reconcile — ONE scoped final answer ------------------------------------------------
    phase('reconcile');
    var afterRows = io.readTable(ss, ROS_DRAFTS_TABLE_);
    var byId = {}; (afterRows || []).forEach(function (r) { byId[rosStr_(r && r.request_allocation_draft_id)] = r; });
    var stillActive = [];
    ids.forEach(function (id) {
      var r = byId[id];
      if (!r) { stillActive.push({ request_allocation_draft_id: id, reason: 'DRAFT_ROW_MISSING_AFTER_TRANSITION' }); return; }
      if (scope === 'ALL' && !rosDraftIsTerminal_(r) && rosDraftStatus_(r) !== 'partially_submitted') {
        stillActive.push({ request_allocation_draft_id: id, reason: 'STATUS_NOT_ADVANCED', status: rosDraftStatus_(r) });
      }
    });
    var result = {
      status: stillActive.length ? 'COMPLETED_WITH_UNVERIFIED_TRANSITIONS' : 'COMPLETED',
      orchestration_key: key, workset_checksum: checksum,
      planning_cycle: cycle, tier_scope: scope, continuation: continuation,
      counts: counts, excluded: ws.excluded,
      quantity_verification: plan.quantity_verification,
      request_orders_created: created, request_orders_reused: reused,
      request_order_count: allRecs.length,
      verified_headers: verifiedGroups.length,
      verified_lines: verifiedGroups.reduce(function (s, x) { return s + (x.verified_lines || 0); }, 0),
      verified_units: verifiedGroups.reduce(function (s, x) { return s + (x.verified_qty || 0); }, 0),
      allocation_drafts_advanced: ids.length,
      unverified_transitions: stillActive,
      writes_performed: created.length,
      safe_to_close: true, resumable: false,
      next_action: stillActive.length
        ? 'Run system.requestOrderSendReconcile — the Request Orders are field-verified but some lifecycle rows could not be re-read.'
        : 'Open Request Order Draft to Approve / Convert to PO. No Purchase Order was issued and no email was sent by this Send.'
    };
    journal.status = 'COMPLETED'; journal.phase = 'reconcile'; journal.result = result;
    rosOwnershipRelease_(io, cycle, key, io.now(), journal);
    phase('reconcile_done');
    return rosBuildEnvelope_(true, result, [], { trace: trace, serverDurationMs: io.now() - t0 });

  } catch (e) {
    return rosBuildEnvelope_(false, null, [{ code: (e && (e.safetyToken || e.apiCode)) || 'SEND_ORCHESTRATION_ERROR',
      message: String(e && e.message || e),
      details: { orchestration_key: key,
        next_action: 'Run system.requestOrderSendReconcile before any retry — an interrupted orchestration is never assumed to be a zero-write.' } }],
      { trace: trace, serverDurationMs: io.now() - t0 });
  }
}

// ------------------------------------------------------------------------------------------------------------
// §D/§E — requestOrder.send.status   STRICTLY READ-ONLY journal status, so a RELOAD can resume.
// A page that reloads mid-Send has lost its in-memory state but not the execution: this answers "what does the
// server think is happening, and may I continue?" without writing, locking or touching a business row.
// ------------------------------------------------------------------------------------------------------------
function handleRequestOrderSendStatus_(body, io) {
  io = io || rosDefaultIo_();
  var t0 = io.now();
  var payload = (body && body.payload) || body || {};
  var key = rosStr_(payload.orchestration_key) || rosOrchestrationKey_(payload);
  var cycle = rosStr_(payload.planning_cycle);
  var j = rosJournalRead_(io, key);
  var activeRaw = cycle ? io.propGet(ROS_ACTIVE_PREFIX_ + cycle) : null;
  var active = null;
  if (activeRaw) { try { active = JSON.parse(activeRaw); } catch (e) { active = null; } }
  var nowMs = io.now();
  if (!j) {
    return rosBuildEnvelope_(true, { status: 'NO_JOURNAL', orchestration_key: key,
      cycle_owner: active ? rosStr_(active.execution_key) : '', writes_performed: 0, safe_to_close: true,
      next_action: 'No Send is recorded for this execution key. Preview a fresh Send.' }, [],
      { zero_write: true, serverDurationMs: io.now() - t0 });
  }
  var done = Object.keys(j.series_done || {}).length;
  var total = (j.series_order || []).length;
  return rosBuildEnvelope_(true, {
    status: rosStr_(j.status) || 'UNKNOWN', phase: rosStr_(j.phase), orchestration_key: key,
    workset_checksum: rosStr_(j.workset_checksum), confirm_with_checksum: rosStr_(j.workset_checksum),
    planning_cycle: rosStr_(j.planning_cycle), tier_scope: rosStr_(j.tier_scope),
    counts: j.counts || null, series_total: total, series_done: done,
    series_remaining: Math.max(0, total - done),
    lifecycle_advanced: (j.transitioned || []).length > 0,
    request_orders: Object.keys(j.series_done || {}).map(function (k) { return j.series_done[k]; }),
    lease_held: rosLeaseHeld_(j, nowMs), cycle_owner: active ? rosStr_(active.execution_key) : '',
    owned_by_this_key: !!(active && rosStr_(active.execution_key) === key),
    result: j.result || null, output_failures: j.output_failures || [],
    resumable: rosStr_(j.status) !== 'COMPLETED', safe_to_close: true, writes_performed: 0,
    next_action: rosStr_(j.status) === 'COMPLETED'
      ? 'This Send already completed. Open Request Order Draft to Approve / Convert to PO.'
      : (rosStr_(j.status) === 'PREVIEW'
        ? 'A plan is frozen but not executed. Confirm it with mode=execute and confirmed_checksum=' + rosStr_(j.workset_checksum) + '.'
        : 'Continue with mode=execute and confirmed_checksum=' + rosStr_(j.workset_checksum) + '. The server picks the next Series.')
  }, [], { zero_write: true, serverDurationMs: io.now() - t0 });
}

// ============================================================================================================
// FB-4A ADDENDUM §C/§D — THE EDITOR-RUNNABLE TEMP WRAPPERS NO LONGER LIVE HERE.
//
// TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE, TEMP_REQUEST_ORDER_SEND_PREVIEW and the tier-scope / cycle-override
// constants are owned by ONE file: TEMP_request_order_send_diagnostics.gs. Every .gs file shares a single global
// scope, so a duplicated entrypoint or constant in a second file would not be a harmless copy — whichever file
// loaded last would silently win, which is precisely the class of confusion this addendum exists to end.
//
// 66_ keeps only what the PRODUCTION Send owns: the workset builder, the orchestration, the journal, and the
// planning-cycle AUTHORITY (rosPlanningCycleCensus_ / rosResolveCurrentPlanningCycle_) that both the diagnostics
// and this file's own fail-closed validation are derived from. Preview and Execute still require an explicit
// exact planning_cycle and neither consults the resolver — a diagnostic convenience must never become a
// production default.
// ============================================================================================================
