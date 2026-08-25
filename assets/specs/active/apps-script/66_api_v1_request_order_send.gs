// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 66_api_v1_request_order_send.gs — F1-7N-FB-3B §B/§C/§D/§E/§F  SEND REQUEST server orchestration + slim workset
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER. No imports.
// ------------------------------------------------------------
// WHY THIS FILE EXISTS
// FB-3A closed observability and left §G — the server orchestration — explicitly unimplemented, with the browser
// still owning a serial multi-write saga. That saga had three structural defects no amount of client polish fixes:
//
//   1. THE WORKSET WAS A VIEW. handleSendRequest built its rows from _applyRequestOrderFilters, so the Country,
//      Marketplace, Category tab, Risk and SKU-search DISPLAY controls silently truncated a business command that
//      is defined as comprehensive. A user who typed three characters into SKU search and pressed Send sent three
//      SKUs and was told the Send succeeded.
//   2. PROGRESS WAS OWNED BY A TAB. Closing the page, navigating, or a 45 s transport bound mid-loop left the
//      lifecycle half-advanced with no server-side record of intent.
//   3. QUANTITY AUTHORITY WAS ASSERTED, NOT PROVEN. The client read its own in-memory map and trusted it.
//
// THE FIX IS STRUCTURAL, NOT DEFENSIVE. The workset is now built ON THE SERVER from the PERSISTED allocation
// drafts. The browser cannot narrow it, because the browser no longer supplies it: the only business input is the
// tier scope (ALL / T1 / T2 / T3). A display filter cannot truncate a set it does not participate in producing.
//
// USER-FROZEN SCOPE (F1-7N-FB-3B §B) — the ONLY BUSINESS_SEND_SCOPE control is the tier scope:
//     ALL = the complete current eligible allocation population across ALL applicable countries, marketplaces
//           and tiers · T1 / T2 / T3 = the complete current eligible population of that tier, across all
//           countries and marketplaces.
//   Country, Marketplace, Category, Risk, Show mode, SKU search, pagination, the current visible page and
//   expanded/collapsed state are DISPLAY_ONLY and MUST NOT reduce the workset. rosBuildWorkset_ therefore accepts
//   NO country, marketplace, category, risk or sku-search parameter AT ALL — the capability is absent, not
//   disabled, so it cannot be re-enabled by passing a flag.
//
// WHAT THIS FILE DOES **NOT** DO
//   · It is NOT a second writer. Every mutation is delegated to an EXISTING canonical writer:
//       quantities        -> (already persisted incrementally by 25_ rpoEditMonthlyFlatResult_ via the locked
//                            decision writer; this file only VERIFIES them and never rewrites one)
//       Request Orders    -> 13_ handleCreateRequestOrderDraft_ (its own ScriptLock + execution-key idempotency)
//       lifecycle advance -> 15_ handleSubmitRequestOrderAllocationDrafts_
//     No sheet is provisioned here, no column appended, no cell written by this file's own hand.
//   · It does NOT create an allocation draft. See THE §C CANONICAL CONFLICT below.
//   · It issues NO Purchase Order, touches NO Drive, sends NO email, and reads NO Demo data.
//
// LOCK DISCIPLINE (deliberate, and the reason this is a saga rather than one transaction). Apps Script's
// ScriptLock is a single named lock: if this orchestrator held it while calling handleCreateRequestOrderDraft_,
// that writer's own tryLock(30000) would contend with its caller and time out. So the orchestrator holds NO
// ScriptLock. Single-flight is enforced instead by a JOURNAL LEASE in Script Properties keyed by the
// orchestration key, and each canonical writer keeps its own atomic lock over its own unit of work. This is the
// same staged discipline the document saga uses (prepare -> render -> finalize).
//
// RESUMABILITY. Apps Script kills an execution at ~6 minutes. Every phase result is journaled under the
// orchestration key BEFORE the next phase starts, and the write phase stops voluntarily at ROS_TIME_BUDGET_MS_
// and answers PARTIAL_RESUMABLE. Re-invoking with the SAME body recomputes the SAME orchestration key (it is a
// pure function of the body), reads the journal and continues where it stopped. That is a RESUME, not a retry:
// nothing already proven is repeated, and the response says exactly what is done and what is left. A blind retry
// after an indeterminate timeout is never advised by this handler — it answers with resume instructions instead.
//
// ------------------------------------------------------------
// THE §C CANONICAL CONFLICT — REPORTED, NOT SILENTLY RESOLVED
// ------------------------------------------------------------
// §C requires: "A raw AI Plan row without a persisted canonical draft may not enter the Send workset", and
// "If current architecture intentionally creates drafts only during Send, STOP and report the exact canonical
// conflict before changing it."  It does. There are THREE standing authorities and they disagree:
//
//   (A) 47_/request-order.js R4E4/R6B: "NO_DRAFT / conflict / foreign rows keep the existing in-memory planning
//       behavior and NEVER auto-create a draft (AI Plan remains the draft-creation boundary)."
//   (B) R4E5B (client handleSendRequest): a SKU with no canonical draft got a DETERMINISTIC MANUAL draft
//       (_roManualDraftId_ -> 'RAD-M-<company>-<country>-<marketplace>-<sku>-<year>') created DURING the Send
//       transition, immediately confirmed, and immediately sent.
//   (C) The LIVE flat V2 schema (00_config REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true) gives a draft a
//       DETERMINISTIC canonical identity: 'RD::MONTHLY_ORDER::<YYYY-MM>::company=..|country=..|draft_purpose=..
//       |marketplace=..|sku=..'. A 'RAD-M-…' id is NOT that identity, so (B) wrote rows into the canonical table
//       under a NON-canonical primary key — invisible to KMRDV2P.readActiveFlatForScope, and therefore invisible
//       to the very read-back the page uses to prove a draft exists.
//
// This file implements (A) + (C), which is what §C mandates: the workset is PERSISTED CANONICAL DRAFTS ONLY, and
// (B)'s create-inside-Send step is RETIRED FROM THE SEND TRANSITION. The consequence is stated plainly rather
// than buried: a SKU that has NEVER been materialized by AI Plan is NOT sendable in one click any more. It is
// reported as the typed exclusion NO_PERSISTED_CANONICAL_DRAFT with its identity, and the operator materializes
// it first. This is a DELIBERATE reduction in what a single Send does, required by §C, and it is the one place in
// this task where the frozen business volume changes. It is called out again in the completion report.
// ============================================================

var ROS_BUILD_VERSION_ = 'F1-7N-FB-3B';

// The flat V2 canonical tables. The child line table is RETIRED under the cutover and is never read here.
var ROS_DRAFTS_TABLE_ = 'request_order_allocation_drafts';
var ROS_SKU_DETAILS_TABLE_ = 'sku_details';

// BUSINESS_SEND_SCOPE — the complete, closed set. Anything not in this map is not a Send scope.
var ROS_TIER_SCOPES_ = { ALL: ['T1', 'T2', 'T3'], T1: ['T1'], T2: ['T2'], T3: ['T3'] };
// DISPLAY_ONLY controls, named here so the contract is machine-readable by the health/diagnostic surfaces and by
// the regression suite. Nothing in this file consumes any of them.
var ROS_DISPLAY_ONLY_CONTROLS_ = ['country', 'marketplace', 'category', 'risk', 'show_mode', 'sku_search',
  'pagination', 'visible_page', 'expanded_state'];

// ACTIVE = eligible to be sent. Terminal statuses are excluded and COUNTED, never silently dropped.
var ROS_ACTIVE_STATUSES_ = { draft: 1, site_confirmed: 1, partially_submitted: 1 };
var ROS_TERMINAL_STATUSES_ = { submitted: 1, cancelled: 1 };
// A tier cell is sendable only when its own tier status is non-terminal (a partially_submitted header can still
// carry one unsent tier — that tier is the work, and the already-sent tiers are excluded and counted).
var ROS_TERMINAL_TIER_STATUSES_ = { submitted: 1, cancelled: 1 };

var ROS_PHASES_ = ['validate', 'load_workset', 'verify_quantities', 'freeze', 'group', 'write_orders',
  'verify_output', 'transition', 'reconcile'];

var ROS_JOURNAL_PREFIX_ = 'ROSEND_JOURNAL_';
var ROS_JOURNAL_TTL_MS_ = 86400000;        // 24 h — long enough to resume a working day, short enough to expire
var ROS_TIME_BUDGET_MS_ = 240000;          // stop voluntarily at 4 min so the journal is always written
var ROS_LEASE_MS_ = 360000;                // a lease older than this is treated as an abandoned execution

// ============================================================================================================
// __ROS_PURE_START__
// Everything between the PURE markers is deterministic and free of SpreadsheetApp / PropertiesService / Date /
// Utilities, so the regression suite executes THESE functions rather than a mirrored copy of them.
// ============================================================================================================

function rosStr_(v) { return String(v == null ? '' : v).trim(); }
function rosLc_(v) { return rosStr_(v).toLowerCase(); }
function rosUc_(v) { return rosStr_(v).toUpperCase(); }
// Blank / non-numeric -> null (ABSENT), never 0. A missing quantity and a zero quantity are different facts and
// collapsing them is how a "0 was persisted" claim becomes indistinguishable from "nothing was persisted".
function rosQty_(v) {
  var s = rosStr_(v);
  if (s === '') return null;
  var n = Number(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

// Pure 32-bit FNV-1a as lowercase hex. Used for the orchestration key and the source checksum so both are
// reproducible in Node with no Utilities dependency (the determinism authority must be testable).
function rosFnv1a_(s) {
  var h = 0x811c9dc5, str = String(s == null ? '' : s);
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) & 0xff;
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// The ONLY business scope selector. Anything else — including a country or marketplace string — is refused, so a
// caller cannot smuggle a display filter in through this parameter.
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

// The natural business identity of an allocation draft, independent of its primary key. Used to match a client
// INTENT to a persisted row without trusting a client-supplied id.
function rosNaturalKey_(company, country, marketplace, sku) {
  return [rosUc_(company), rosUc_(country), rosLc_(marketplace), rosUc_(sku)].join('|');
}
function rosRowNaturalKey_(row) {
  return rosNaturalKey_((row || {}).company, (row || {}).country, (row || {}).marketplace, (row || {}).sku);
}

function rosDraftStatus_(row) { return rosLc_((row || {}).status); }
function rosDraftIsActive_(row) { return ROS_ACTIVE_STATUSES_[rosDraftStatus_(row)] === 1; }
function rosDraftIsTerminal_(row) { return ROS_TERMINAL_STATUSES_[rosDraftStatus_(row)] === 1; }

// ------------------------------------------------------------------------------------------------------------
// §B/§D — THE WORKSET. Pure over the persisted draft rows.
//
// PARAMETERS, EXHAUSTIVELY: planning_cycle and tier_scope. That is the whole business input. There is NO
// country, marketplace, category, risk, sku-search, show-mode, page, page-size or visible-row parameter, and
// adding one would be a source change a regression test refuses.
//
// UNITS. Every count below states what it counts, because FB-3A's "234" incident was a LABEL defect: a SKU-row
// count printed under the word "allocation drafts". These names are the vocabulary the confirmation dialog and
// the progress phases must use verbatim.
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
      duplicate_draft_id: 0
    },
    rows: [],            // one entry per sendable tier cell (the true unit of a Request Order line)
    drafts: [],          // one entry per sendable draft header
    diagnostics: []
  };
  if (!scope) { out.error = 'INVALID_TIER_SCOPE'; return out; }
  if (!cycle) { out.error = 'PLANNING_CYCLE_REQUIRED'; return out; }

  var tierSet = {}; tiers.forEach(function (t) { tierSet[t] = 1; });
  var seenId = {}, skuSeen = {}, seriesSeen = {};

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
    if (seenId[draftId]) { out.excluded.duplicate_draft_id++; out.diagnostics.push({ code: 'DUPLICATE_DRAFT_ID', request_allocation_draft_id: draftId }); return; }
    seenId[draftId] = 1;

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
      if (qty == null || qty <= 0) { out.excluded.tier_zero_or_blank_qty++; return; }
      out.positive_selected_tier_allocations++;
      out.total_units += qty;
      sendable.push({
        request_allocation_draft_id: draftId,
        natural_key: rosRowNaturalKey_(row),
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
    out.drafts.push({ request_allocation_draft_id: draftId, natural_key: rosRowNaturalKey_(row),
      company: rosStr_(row.company), country: rosStr_(row.country), marketplace: rosStr_(row.marketplace),
      sku: sku, series: series, status: st, draft_version: rosStr_(row.draft_version),
      tier_count: sendable.length });
    sendable.forEach(function (r) { out.rows.push(r); });
  });

  out.expected_request_order_lines = out.positive_selected_tier_allocations;
  out.expected_request_order_headers = out.distinct_series;
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// §C steps 3-5 — THE QUANTITY READ-BACK BARRIER.
// The client sends INTENTS: the quantities the user believes are current. Every intent must be matched by a
// PERSISTED tier cell holding the SAME number. Anything else blocks the WHOLE Send:
//   UNSAVED_NO_PERSISTED_DRAFT — the intent names a SKU with no active persisted canonical draft;
//   UNSAVED_TIER_ABSENT        — the draft exists but that tier was never persisted;
//   QUANTITY_DRIFT             — DB holds a DIFFERENT number than the user's latest edit.
// QUANTITY_DRIFT is the case FB-3A's addendum names explicitly: "Do not silently use the prior DB quantity when
// a newer UI edit failed to save." So it is fatal, not a warning, and the DB value is never substituted.
// ------------------------------------------------------------------------------------------------------------
function rosVerifyQuantities_(workset, intents) {
  var out = { verified: 0, blocked: false, failures: [], verified_keys: {},
    intents_total: 0, intents_matched: 0, workset_rows_without_intent: 0 };
  var byKey = {};
  (workset && workset.rows ? workset.rows : []).forEach(function (r) {
    byKey[r.natural_key + '::' + r.request_bucket] = r;
  });
  var intentKeys = {};

  (intents || []).forEach(function (it) {
    var nk = rosNaturalKey_(it && it.company, it && it.country, it && it.marketplace, it && it.sku);
    var tiers = (it && it.tiers) || {};
    Object.keys(tiers).forEach(function (tier) {
      var t = rosUc_(tier);
      if (t !== 'T1' && t !== 'T2' && t !== 'T3') return;   // T4 is visibility-only and is never an order commitment
      var want = rosQty_(tiers[tier] && tiers[tier].order_qty !== undefined ? tiers[tier].order_qty : tiers[tier]);
      if (want == null) return;                        // no asserted intent for this tier -> persisted value stands
      out.intents_total++;
      var key = nk + '::' + t;
      intentKeys[key] = 1;
      var row = byKey[key];
      if (!row) {
        // Distinguish "no draft at all" from "draft exists, tier not persisted" — different operator actions.
        var anyTier = false;
        ['T1', 'T2', 'T3'].forEach(function (x) { if (byKey[nk + '::' + x]) anyTier = true; });
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

// ------------------------------------------------------------------------------------------------------------
// §E — deterministic Series grouping. Sorted by series key, then by draft id + tier inside the group, so two
// runs over the same workset produce byte-identical groups and therefore byte-identical execution keys.
// SKU / tier / country / marketplace lineage is CARRIED, never merged away: one output line per tier cell.
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

// The orchestration/idempotency key. PURE FUNCTION OF THE REQUEST BODY, so an identical re-invocation (a resume
// after a timeout, a double-click, a second tab) computes the same key and lands on the same journal. It binds
// the tier scope and the planning cycle, and the ASSERTED intents — because two Sends that assert different
// quantities are different executions even at the same scope.
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
function rosLeaseHeld_(journal, nowMs) {
  if (!journal || !journal.lease_at) return false;
  if (rosStr_(journal.status) === 'COMPLETED') return false;
  return (Number(nowMs) - Number(journal.lease_at)) < ROS_LEASE_MS_;
}

// The slim §F projection. ONLY the fields the Send confirmation, the dirty/persisted verification, the tier
// selection, the Series grouping and the current-run authority need. NO forecast, NO gap, NO recommendation
// narrative, NO inventory presentation field, NO risk, NO category, NO lead time, NO open-PO remaining.
var ROS_SLIM_DRAFT_PROJECTION_ = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country',
  'marketplace', 'sku', 'series', 'status', 'draft_version', 'units_per_carton', 'updated_at',
  't1_month', 't1_order_qty', 't1_status', 't1_user_edited',
  't2_month', 't2_order_qty', 't2_status', 't2_user_edited',
  't3_month', 't3_order_qty', 't3_status', 't3_user_edited'];
// Fields a caller may NOT request through the include gate, named so the refusal is a contract and not an omission.
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
// Resolve the requested include set against the allow-list. An unknown or forbidden include is REFUSED by name
// (never silently ignored — a silently-ignored include is how a slim API grows back into a fat one).
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
// __ROS_PURE_END__

// ============================================================================================================
// IMPURE layer — injectable io so the suite exercises the orchestration against fixtures with ZERO Apps Script.
// ============================================================================================================

function rosBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', build: ROS_BUILD_VERSION_ };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

// Series + units-per-carton authority = sku_details (the SAME canonical authority 56_ uses for category/series).
// The flat V2 draft row carries NO series column, so series must be resolved here rather than invented.
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
    // The canonical writers, reached ONLY through these three seams. There is no fourth write seam in this file.
    createRequestOrderDraft: function (body) { return rosUnwrap_(handleCreateRequestOrderDraft_(body)); },
    submitAllocationDrafts: function (body) { return rosUnwrap_(handleSubmitRequestOrderAllocationDrafts_(body)); },
    executionKey: function (company, cycle, series, draftIds) { return roExecutionKey_(company, cycle, series, draftIds); },
    journalGet: function (key) {
      try { var raw = PropertiesService.getScriptProperties().getProperty(ROS_JOURNAL_PREFIX_ + key); return raw ? JSON.parse(raw) : null; }
      catch (e) { return null; }
    },
    journalPut: function (key, journal) {
      try { PropertiesService.getScriptProperties().setProperty(ROS_JOURNAL_PREFIX_ + key, JSON.stringify(journal)); return true; }
      catch (e) { return false; }
    }
  };
}
// The canonical handlers answer with a ContentService response. Unwrap without re-implementing anything.
function rosUnwrap_(resp) {
  if (resp && typeof resp.getContent === 'function') {
    try { return JSON.parse(resp.getContent()); } catch (e) { return { success: false, error: 'CANONICAL_WRITER_RESPONSE_UNPARSEABLE' }; }
  }
  return resp || { success: false, error: 'CANONICAL_WRITER_NO_RESPONSE' };
}

// ------------------------------------------------------------------------------------------------------------
// §F — requestOrder.sendWorkset.get   INCLUDE-GATED SLIM READ.  STRICTLY READ-ONLY.
//
// This exists so Send Request NEVER depends on refreshing the 495-row AI-Plan payload. It reads exactly TWO
// tables (the flat drafts + sku_details for the Series authority) instead of the eleven that
// aiPlanFirstLayer.get reads, and returns only ROS_SLIM_DRAFT_PROJECTION_. Server phases are timed
// individually, so a live run names WHICH phase is slow rather than reporting one opaque duration.
// ------------------------------------------------------------------------------------------------------------
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
      current_run_authority: 'planning_cycle=' + cycle + ' AND header status IN (draft, site_confirmed, partially_submitted) AND tier status NOT IN (submitted, cancelled)',
      business_send_scope_controls: ['tier_scope'],
      display_only_controls: ROS_DISPLAY_ONLY_CONTROLS_.slice(),
      counts: {
        persisted_drafts_in_cycle: ws.persisted_drafts_in_cycle,
        active_persisted_drafts: ws.active_persisted_drafts,
        drafts_with_positive_selected_tier: ws.drafts_with_positive_selected_tier,
        selected_tier_allocations: ws.selected_tier_allocations,
        positive_selected_tier_allocations: ws.positive_selected_tier_allocations,
        distinct_skus: ws.distinct_skus, distinct_series: ws.distinct_series,
        expected_request_order_headers: ws.expected_request_order_headers,
        expected_request_order_lines: ws.expected_request_order_lines,
        total_units: ws.total_units
      },
      excluded: ws.excluded,
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
// §E — requestOrder.send.orchestrate   ONE CLICK -> ONE REQUEST -> ONE JOURNALED SAGA.
//
// body.payload:
//   { tier_scope: 'ALL'|'T1'|'T2'|'T3',        // the ONLY business scope control
//     planning_cycle: 'YYYY-MM',               // current-run authority
//     execution_planning_cycle?: string,       // the value fed to the EXISTING per-series execution key (13_).
//                                              //   Kept separate and caller-supplied so a Send interrupted under
//                                              //   the pre-FB-3B client still converges to the SAME Request Order
//                                              //   on resume instead of creating a second one under a new key.
//     intents?: [ { company, country, marketplace, sku, tiers:{ T1:{order_qty}, ... } } ],
//     actor?, resume?: boolean, dry_run?: boolean }
//
// dry_run performs phases validate -> group and returns the frozen plan with ZERO writes. It is the honest
// answer to "what exactly would this Send do?" and it is what the confirmation dialog is built from.
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
  var orchestrationKey = rosOrchestrationKey_(payload);
  var dryRun = payload.dry_run === true;

  try {
    // ---- PHASE 1b · IDEMPOTENT REPLAY, checked BEFORE anything is read -------------------------------
    // This must NOT depend on the current row state. After a successful Send the drafts are terminal, so a
    // workset-first check would answer a duplicate click with "nothing eligible" — true, but it hides the fact
    // that the click ALREADY SUCCEEDED, which is exactly what an operator who lost the response needs to know.
    // The orchestration key is a pure function of the request, so the recorded result is addressable without
    // reading a single row.
    var priorJournal = io.journalGet(orchestrationKey);
    if (priorJournal && rosStr_(priorJournal.status) === 'COMPLETED' && !dryRun) {
      phase('replay_completed');
      return rosBuildEnvelope_(true, Object.assign({}, priorJournal.result || {}, { status: 'ALREADY_COMPLETED',
        orchestration_key: orchestrationKey, replayed: true, writes_performed: 0,
        next_action: 'This exact Send already completed. Nothing was written again. Open Request Order Draft to Approve / Convert to PO.' }), [],
        { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- PHASE 2 · load_workset (SERVER-OWNED; no site/display parameter exists) -----------------------
    phase('load_workset');
    var ss = io.openDb();
    var draftRows = io.readTable(ss, ROS_DRAFTS_TABLE_);
    var idx = rosSeriesIndex_(io.readTable(ss, ROS_SKU_DETAILS_TABLE_));
    var ws = rosBuildWorkset_(draftRows, { planning_cycle: cycle, tier_scope: scope,
      series_by_sku: idx.series, units_per_carton_by_sku: idx.upc });
    if (ws.error) return rosBuildEnvelope_(false, null, [{ code: ws.error, message: 'workset could not be built' }], { zero_write: true, trace: trace });
    phase('load_workset_done', { active_persisted_drafts: ws.active_persisted_drafts,
      positive_selected_tier_allocations: ws.positive_selected_tier_allocations });

    if (!ws.rows.length) {
      return rosBuildEnvelope_(true, { status: 'NO_ELIGIBLE_PERSISTED_ALLOCATION', orchestration_key: orchestrationKey,
        counts: rosCountsOf_(ws), excluded: ws.excluded, writes_performed: 0,
        next_action: 'Nothing is eligible. Materialize the allocation (AI Plan) or enter a positive tier quantity on a persisted draft, then Send again.' },
        [], { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- PHASE 3 · verify_quantities (§C — the read-after-write barrier) -------------------------------
    phase('verify_quantities');
    var verify = rosVerifyQuantities_(ws, payload.intents || []);
    if (verify.blocked) {
      // BLOCK THE ENTIRE SEND. Not the offending row — the whole thing. A partially-correct Request Order is a
      // worse outcome than none, and the DB value is never substituted for the user's unsaved edit.
      return rosBuildEnvelope_(false, null, [{ code: 'QUANTITY_VERIFICATION_FAILED',
        message: verify.failures.length + ' quantity assertion(s) do not match the persisted allocation. The ENTIRE Send was blocked and nothing was written.',
        details: { failures: verify.failures.slice(0, 50), failure_count: verify.failures.length,
          intents_total: verify.intents_total, intents_matched: verify.intents_matched } }],
        { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }
    phase('verify_quantities_done', { verified: verify.verified, rows_without_intent: verify.workset_rows_without_intent });

    // ---- PHASE 4 · freeze -----------------------------------------------------------------------------
    phase('freeze');
    var checksum = rosWorksetChecksum_(ws);
    var nowMs = io.now();
    var journal = priorJournal;
    var res = rosJournalResumable_(journal, checksum, nowMs);
    // A COMPLETED journal was already answered in PHASE 1b; reaching here with one means a DRY RUN, which is
    // allowed to re-plan freely because it writes nothing.
    if (journal && rosLeaseHeld_(journal, nowMs) && payload.resume !== true) {
      return rosBuildEnvelope_(false, null, [{ code: 'SEND_IN_PROGRESS_SAME_KEY',
        message: 'An execution for this exact Send is already running. Do NOT retry — read back by orchestration key, or re-invoke with resume=true after it stops.',
        details: { orchestration_key: orchestrationKey, phase: rosStr_(journal.phase) } }],
        { zero_write: true, trace: trace });
    }
    var resumed = !!(journal && res.resumable && payload.resume === true);
    if (journal && !res.resumable && res.reason === 'SOURCE_CHANGED_SINCE_INTERRUPTION') {
      return rosBuildEnvelope_(false, null, [{ code: 'SOURCE_CHANGED_SINCE_INTERRUPTION',
        message: 'The persisted allocation changed since the interrupted Send. Reconcile first (system.requestOrderSendReconcile), then Send again — resuming the old plan would write a stale workset.',
        details: { orchestration_key: orchestrationKey, journal_checksum: rosStr_(journal.workset_checksum), current_checksum: checksum } }],
        { zero_write: true, trace: trace });
    }
    var groups = rosGroupBySeries_(ws);
    phase('freeze_done', { workset_checksum: checksum, series_groups: groups.length, resumed: resumed });

    // ---- PHASE 5 · group (+ dry-run exit: the confirmation dialog's data source) ------------------------
    var plan = {
      status: dryRun ? 'DRY_RUN_PLAN' : 'PLANNED',
      orchestration_key: orchestrationKey, workset_checksum: checksum,
      planning_cycle: cycle, tier_scope: scope, tiers_in_scope: ws.tiers_in_scope,
      current_run_authority: 'planning_cycle=' + cycle + ' AND header status IN (draft, site_confirmed, partially_submitted) AND tier status NOT IN (submitted, cancelled)',
      business_send_scope_controls: ['tier_scope'], display_only_controls: ROS_DISPLAY_ONLY_CONTROLS_.slice(),
      counts: rosCountsOf_(ws), excluded: ws.excluded,
      quantity_verification: { asserted: verify.intents_total, verified: verify.verified,
        persisted_without_assertion: verify.workset_rows_without_intent, failures: 0 },
      series_groups: groups.map(function (g) { return { series: g.series, line_count: g.line_count,
        distinct_skus: g.distinct_skus, total_units: g.total_units, allocation_draft_ids: g.allocation_draft_ids }; })
    };
    if (dryRun) {
      plan.writes_performed = 0;
      return rosBuildEnvelope_(true, plan, [], { zero_write: true, trace: trace, serverDurationMs: io.now() - t0 });
    }

    // Take the journal lease and record the frozen plan BEFORE the first write, so an execution killed at any
    // point after this leaves durable evidence of exactly what it intended to do.
    journal = journal && res.resumable ? journal : { orchestration_key: orchestrationKey, started_at: nowMs,
      workset_checksum: checksum, planning_cycle: cycle, tier_scope: scope, series_done: {}, transitioned: [], status: 'RUNNING' };
    journal.lease_at = nowMs; journal.phase = 'write_orders'; journal.status = 'RUNNING';
    journal.series_done = journal.series_done || {}; journal.transitioned = journal.transitioned || [];
    io.journalPut(orchestrationKey, journal);

    // ---- PHASE 6 · write_orders — DELEGATED to the canonical writer, one Series at a time --------------
    phase('write_orders');
    var created = [], reused = [], writeErrors = [], processed = 0, deferred = [];
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      if (journal.series_done[g.series_key]) { reused.push(journal.series_done[g.series_key]); processed++; continue; }
      if ((io.now() - t0) > ROS_TIME_BUDGET_MS_) { deferred = groups.slice(gi).map(function (x) { return x.series_key; }); break; }

      var writerBody = {
        company: '', source: 'manual', source_ref_type: 'request_order_allocation_batch',
        planning_cycle: execCycle, series: g.series,
        note: 'Send Request — series ' + (g.series || '(no series)') + ' · ' + scope + ' · exec ' + orchestrationKey,
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
        break;   // stop at the first failure: the lifecycle is NOT advanced for anything, and the journal holds what landed
      }
      var d = (w.data || {});
      var rec = { series: g.series, request_order_id: rosStr_(d.request_order_id), request_order_no: rosStr_(d.request_order_no),
        reused: d.reused === true, execution_key: rosStr_(d.execution_key), line_count: g.line_count,
        allocation_draft_ids: g.allocation_draft_ids };
      journal.series_done[g.series_key] = rec;
      journal.lease_at = io.now();
      io.journalPut(orchestrationKey, journal);   // journal AFTER each Series -> a kill loses at most zero proven work
      (rec.reused ? reused : created).push(rec);
      processed++;
    }
    phase('write_orders_done', { processed: processed, created: created.length, reused: reused.length, deferred: deferred.length });

    if (writeErrors.length) {
      journal.phase = 'write_orders'; journal.status = 'FAILED'; journal.errors = writeErrors; journal.lease_at = 0;
      io.journalPut(orchestrationKey, journal);
      return rosBuildEnvelope_(false, null, [{ code: 'REQUEST_ORDER_WRITE_FAILED',
        message: 'A Request Order could not be created. No allocation draft was advanced; the Request Orders already created for this execution are recorded and will be REUSED (not duplicated) when you resume.',
        details: { orchestration_key: orchestrationKey, failed: writeErrors,
          request_orders_created: created.map(function (x) { return x.request_order_no; }),
          resume_action: 'Fix the reported cause, then re-invoke with resume=true and the same body.' } }],
        { trace: trace, serverDurationMs: io.now() - t0 });
    }

    if (deferred.length) {
      // Voluntary stop inside the Apps Script execution ceiling. This is NOT a failure and NOT indeterminate:
      // every Series either has a recorded Request Order or has not been started.
      journal.phase = 'write_orders'; journal.status = 'PARTIAL'; journal.lease_at = 0;
      io.journalPut(orchestrationKey, journal);
      return rosBuildEnvelope_(true, { status: 'PARTIAL_RESUMABLE', orchestration_key: orchestrationKey,
        workset_checksum: checksum, counts: plan.counts,
        request_orders_created: created, request_orders_reused: reused,
        series_remaining: deferred.length, lifecycle_advanced: false,
        next_action: 'Re-invoke requestOrder.send.orchestrate with the SAME body and resume=true. Completed Series are skipped by execution key; nothing is duplicated. Do NOT start a new Send.' },
        [], { trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- PHASE 7 · verify_output — output PROOF before any lifecycle transition -------------------------
    phase('verify_output');
    var orderRows = io.readTable(ss, 'request_orders');
    var lineRows = io.readTable(ss, 'request_order_lines');
    var linesByOrder = {};
    (lineRows || []).forEach(function (l) { var k = rosStr_(l && l.request_order_id); if (k) linesByOrder[k] = (linesByOrder[k] || 0) + 1; });
    var orderById = {};
    (orderRows || []).forEach(function (r) { var k = rosStr_(r && r.request_order_id); if (k) orderById[k] = r; });
    var all = created.concat(reused), unproven = [];
    all.forEach(function (rec) {
      var hdr = orderById[rec.request_order_id];
      var n = linesByOrder[rec.request_order_id] || 0;
      rec.verified_line_count = n;
      if (!hdr) { unproven.push({ series: rec.series, request_order_no: rec.request_order_no, reason: 'HEADER_NOT_FOUND_AFTER_WRITE' }); return; }
      if (n < rec.line_count) { unproven.push({ series: rec.series, request_order_no: rec.request_order_no, reason: 'LINE_COUNT_SHORT', expected: rec.line_count, found: n }); }
    });
    phase('verify_output_done', { orders: all.length, unproven: unproven.length });
    if (unproven.length) {
      journal.phase = 'verify_output'; journal.status = 'OUTPUT_UNPROVEN'; journal.lease_at = 0;
      io.journalPut(orchestrationKey, journal);
      return rosBuildEnvelope_(false, null, [{ code: 'REQUEST_ORDER_OUTPUT_UNPROVEN',
        message: 'A Request Order could not be verified after writing. NO allocation draft was advanced — the lifecycle stays where it was so nothing is marked sent without an output.',
        details: { orchestration_key: orchestrationKey, unproven: unproven,
          next_action: 'Run system.requestOrderSendReconcile for this planning cycle before any retry.' } }],
        { trace: trace, serverDurationMs: io.now() - t0 });
    }

    // ---- PHASE 8 · transition — canonical lifecycle advance, ONLY after output proof --------------------
    phase('transition');
    var draftIds = {};
    all.forEach(function (rec) { (rec.allocation_draft_ids || []).forEach(function (id) { draftIds[id] = 1; }); });
    var ids = Object.keys(draftIds).sort();
    var submitBuckets = (scope === 'ALL') ? null : [scope];   // a tier-scoped Send advances ONLY that tier
    var sub = ids.length ? io.submitAllocationDrafts({ draft_ids: ids, submitted_by: actor, submit_buckets: submitBuckets }) : { success: true, data: { submitted: 0 } };
    if (!sub || sub.success !== true) {
      journal.phase = 'transition'; journal.status = 'TRANSITION_FAILED'; journal.lease_at = 0;
      io.journalPut(orchestrationKey, journal);
      return rosBuildEnvelope_(false, null, [{ code: 'ALLOCATION_TRANSITION_FAILED',
        message: 'The Request Orders exist and are verified, but the allocation lifecycle could not be advanced. Resume with the SAME body: the Request Orders are reused by execution key and only the transition is retried.',
        details: { orchestration_key: orchestrationKey, request_orders: all.map(function (x) { return x.request_order_no; }),
          error: rosStr_(sub && (sub.error || sub.message)) } }],
        { trace: trace, serverDurationMs: io.now() - t0 });
    }
    journal.transitioned = ids;
    phase('transition_done', { drafts_advanced: ids.length, submit_buckets: submitBuckets });

    // ---- PHASE 9 · reconcile — ONE scoped final answer -------------------------------------------------
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
      orchestration_key: orchestrationKey, workset_checksum: checksum,
      planning_cycle: cycle, tier_scope: scope, resumed: resumed,
      counts: plan.counts, excluded: ws.excluded,
      quantity_verification: plan.quantity_verification,
      request_orders_created: created, request_orders_reused: reused,
      request_order_count: all.length,
      request_order_line_count: all.reduce(function (s, x) { return s + (x.line_count || 0); }, 0),
      allocation_drafts_advanced: ids.length,
      unverified_transitions: stillActive,
      writes_performed: created.length,
      next_action: stillActive.length
        ? 'Run system.requestOrderSendReconcile — the Request Orders are proven but some lifecycle rows could not be re-read.'
        : 'Open Request Order Draft to Approve / Convert to PO. No Purchase Order was issued and no email was sent by this Send.'
    };
    journal.status = 'COMPLETED'; journal.phase = 'reconcile'; journal.lease_at = 0; journal.result = result;
    io.journalPut(orchestrationKey, journal);
    phase('reconcile_done');
    return rosBuildEnvelope_(true, result, [], { trace: trace, serverDurationMs: io.now() - t0 });

  } catch (e) {
    return rosBuildEnvelope_(false, null, [{ code: (e && (e.safetyToken || e.apiCode)) || 'SEND_ORCHESTRATION_ERROR',
      message: String(e && e.message || e),
      details: { orchestration_key: orchestrationKey,
        next_action: 'Run system.requestOrderSendReconcile before any retry — an interrupted orchestration is never assumed to be a zero-write.' } }],
      { trace: trace, serverDurationMs: io.now() - t0 });
  }
}

// The labelled count block, in one place, so the wire shape and the confirmation dialog cannot drift apart.
function rosCountsOf_(ws) {
  return {
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

// ============================================================================================================
// EDITOR-RUNNABLE READ-ONLY WRAPPERS. A router action is not a runnable instruction; select one of these in the
// Apps Script editor and press Run. Both are read-only: the workset probe reads, and the orchestration probe is
// pinned to dry_run so it can NEVER write. There is no editor wrapper that performs a live Send — a business
// write belongs to the page, under a confirmation the operator has read.
// ============================================================================================================

var TEMP_ROSEND_TIER_SCOPE_ = 'ALL';                 // ALL | T1 | T2 | T3  (the only business scope control)
var TEMP_ROSEND_PLANNING_CYCLE_ = 'PASTE_YYYY-MM_HERE';

function TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE() {
  var cycle = rosStr_(TEMP_ROSEND_PLANNING_CYCLE_);
  if (!cycle || cycle.indexOf('PASTE_') === 0) { Logger.log('[ROSEND-WS] BLOCKED — set TEMP_ROSEND_PLANNING_CYCLE_ to the current planning cycle (YYYY-MM) and Run again. Nothing was read.'); return; }
  var r = handleRequestOrderSendWorksetGet_({ payload: { tier_scope: TEMP_ROSEND_TIER_SCOPE_, planning_cycle: cycle, include: ['counts', 'groups'] } });
  if (!r.success) { Logger.log('[ROSEND-WS] FAILED ' + JSON.stringify(r.errors)); return; }
  var d = r.data, c = d.counts;
  Logger.log('[ROSEND-WS] cycle=' + d.planning_cycle + ' scope=' + d.tier_scope + ' tiers=[' + d.tiers_in_scope.join(',') + ']'
    + ' | persisted_in_cycle=' + c.persisted_drafts_in_cycle + ' active=' + c.active_persisted_drafts
    + ' drafts_with_positive_tier=' + c.drafts_with_positive_selected_tier
    + ' selected_tier_allocations=' + c.selected_tier_allocations
    + ' POSITIVE_tier_allocations=' + c.positive_selected_tier_allocations
    + ' | skus=' + c.distinct_skus + ' series=' + c.distinct_series
    + ' | expected_headers=' + c.expected_request_order_headers + ' expected_lines=' + c.expected_request_order_lines
    + ' units=' + c.total_units
    + ' | checksum=' + d.workset_checksum
    + ' | scope_controls=[' + d.business_send_scope_controls.join(',') + '] display_only=[' + d.display_only_controls.join(',') + ']'
    + ' | phases=' + JSON.stringify(r.meta.phases) + ' bytes=' + r.meta.response_bytes + ' writes=' + r.meta.writes_performed);
  Logger.log('[ROSEND-WS][excluded] ' + JSON.stringify(d.excluded));
  (d.groups || []).slice(0, 25).forEach(function (g) {
    Logger.log('[ROSEND-WS][series] ' + (g.series || '(no series)') + ' lines=' + g.line_count + ' skus=' + g.distinct_skus + ' units=' + g.total_units);
  });
}

function TEMP_REQUEST_ORDER_SEND_DRY_RUN() {
  var cycle = rosStr_(TEMP_ROSEND_PLANNING_CYCLE_);
  if (!cycle || cycle.indexOf('PASTE_') === 0) { Logger.log('[ROSEND-DRY] BLOCKED — set TEMP_ROSEND_PLANNING_CYCLE_ (YYYY-MM) and Run again. Nothing was read or written.'); return; }
  var r = handleRequestOrderSendOrchestrate_({ payload: { tier_scope: TEMP_ROSEND_TIER_SCOPE_, planning_cycle: cycle, dry_run: true } });
  if (!r.success) { Logger.log('[ROSEND-DRY] BLOCKED ' + JSON.stringify(r.errors) + ' | 0 writes.'); return; }
  var d = r.data;
  Logger.log('[ROSEND-DRY] ' + d.status + ' key=' + d.orchestration_key + ' checksum=' + d.workset_checksum
    + ' | ' + JSON.stringify(d.counts) + ' | series_groups=' + d.series_groups.length
    + ' | writes_performed=' + d.writes_performed + ' (dry run — this wrapper cannot write)');
  Logger.log('[ROSEND-DRY][excluded] ' + JSON.stringify(d.excluded));
}
