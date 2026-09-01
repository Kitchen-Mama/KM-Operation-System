/**
 * TEMP_shipping_allocation_schema_b2_dry_run.gs
 * F1-7N-FB-4F-B2 — APPEND-ONLY SCHEMA DRY RUN. UN-ROUTED. STRICTLY READ-ONLY. NO COMMIT MODE, NOT EVEN A
 * DISABLED ONE.
 *
 * WHAT THIS ROUND DISCOVERED, AND WHY IT IS THE WHOLE POINT OF A DRY RUN.
 *
 * B1's completion report stated the B2 ordering as: schema append -> Apps Script sync -> frontend push. That
 * ordering is WRONG, and this file exists because the repository can prove it is wrong without touching the
 * live sheet.
 *
 * 16_shipping_allocation_handlers.gs gates every allocation read and write on sadExactSchemaReason_, which
 * validates the live header row against SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ (34) with
 * SAD_LIFECYCLE_TAIL_COLUMNS_ (4) marked optional, and against SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ (30)
 * with NO optional tail at all. It accepts a live count in [30..34] for headers and EXACTLY 30 for lines, and it
 * requires positional equality at every index. So:
 *
 *   HEADER, live 30 (lifecycle tail not yet materialized): appending destination_marketplace puts it at index
 *     30, where the frozen canonical order says generation_run_id. The gate returns
 *     COL30_IS_destination_marketplace_EXPECTED_generation_run_id.
 *   HEADER, live 34 (lifecycle tail present): appending makes 35, and 35 > 34. The gate returns
 *     COL_COUNT_35_EXPECTED_30_TO_34.
 *   LINE, live 30: appending expected_arrival makes 31 against an authority of 30 with no tail. The gate returns
 *     COL_COUNT_31_EXPECTED_30.
 *
 * For EVERY reachable live state, appending either proposed column with 16_ unchanged makes every shipping
 * allocation read and write fail closed with PRODUCTION_SAFETY / SCHEMA_MISMATCH. The Execution Plan would stop
 * saving entirely. A blank column is not inert here: this table's write gate is positional and exact.
 *
 * This file does not FORM that opinion, it ASKS. sadExactSchemaReason_ reads its sheet only through
 * sh.getDataRange().getValues(), so the proposed post-append header row is handed to the REAL production gate
 * through a read-only stub (tb2HeaderProbe_). The verdict below is the shipped gate's own answer about a
 * hypothetical header, computed without writing anything. A second copy of the rule would have been a second
 * answer waiting to disagree.
 *
 * AND THERE IS A SECOND, INDEPENDENT APPEND-ONLY MIGRATION ALREADY QUEUED AGAINST THE SAME TABLE.
 * TEMP_migrate_shipping_allocation_ai_lifecycle.gs appends the four lifecycle columns at frozen indexes 30..33,
 * and its own safety check requires the live header to be an EXACT PREFIX of its canonical order with no unknown
 * extra column. So the two migrations are NOT independent and their order is not a preference:
 * destination_marketplace can only ever occupy index 34, which means the lifecycle tail must be physically
 * present FIRST. Appending destination_marketplace at index 30 would permanently block the lifecycle migration.
 * That ordering constraint is reported as a named precondition, not left to whoever runs the tools.
 *
 * SO THE CORRECT ORDER IS CODE FIRST, THEN SCHEMA — the reverse of B1's report, and the same conclusion 16_'s
 * own lifecycle-tail comment reached for the same reason: the canonical list must learn the column (as an
 * OPTIONAL tail entry, so a pre-append sheet stays valid) before the column exists, and then the append and the
 * sync are order-independent in both directions. Changing 16_ is a WRITER change and therefore not this round.
 *
 * ZERO WRITE, STRUCTURALLY. This file contains no cell write, no row append, no column insert, no row or column
 * removal, no sheet creation, no schema-ensure call, no lock, no Properties write, no Drive and no Mail. It
 * opens the production database by id and reads whole tabs. The regression suite asserts each absence against
 * comment- AND string-stripped source, because a name inside a message is not a call.
 *
 * IT PROPOSES; IT NEVER MIGRATES. There is no COMMIT function in this file. The confirmation checksum it prints
 * authorizes exactly one later, separately reviewed operation — adding BLANK columns — and it is invalidated by
 * any header change. It is NOT authorization to backfill a value, to mint a K4 id, or to wire the runtime; those
 * are reported as three separate decisions that are all false today.
 *
 * MASKING. Every draft / line id is reported masked (class prefix + short tail) with a stable hash for
 * correlation. Operator notes and free text are never printed — only presence, length and a hash.
 *
 * DEPENDENCIES, ALL READ-ONLY AND ALL REUSED RATHER THAN COPIED:
 *   16_shipping_allocation_handlers.gs   sadExactSchemaReason_, sadLifecycleTailState_, the schema constants,
 *                                        sadK2GroupKey_, sadK2DeterministicHeaderId_, sadHeaderRouteIsComplete_
 *   68_api_v1_execution_plan_conflict_diagnostic.gs   epcFnv1a_, epcIdRef_, epcIdentityFamily_
 *   69_api_v1_route_identity_contract.gs  the frozen B1 contract: ricCanonicalService_, ricDestinationIdentity_,
 *                                        ricK4GroupKey_, ricK4DeterministicHeaderId_, ricRoutePersistability_
 *
 * 69_ IS NOT DEPLOYED YET (B1 deliberately left it unrouted and unmanifested), so this diagnostic REFUSES with a
 * named code when the contract is absent rather than quietly answering without it. See the runbook in
 * docs/planning/LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md: both files are pasted temporarily, run,
 * and removed. Both are inert — unrouted, called by nothing — so a temporary paste changes no live behaviour and
 * no deployment version is created.
 *
 * HOW TO RUN. In the Apps Script editor: TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN(). The core below is named
 * TEMP_shippingAllocationSchemaB2DryRun_ exactly as the task specified, but a trailing underscore is Apps
 * Script's PRIVATE convention and such functions do not appear in the editor's Run selector — so the runnable
 * public wrapper exists as well, matching the convention FB-4F-A already proved in this project.
 */

var TEMP_FB4FB2_ROUND_ = 'F1-7N-FB-4F-B2';
var TEMP_FB4FB2_NAME_ = 'TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN';
var TEMP_FB4FB2_CHECKSUM_PREFIX_ = 'fb4fb2-1';

var TEMP_FB4FB2_DRAFTS_ = 'shipping_allocation_drafts';
var TEMP_FB4FB2_LINES_ = 'shipping_allocation_draft_lines';
var TEMP_FB4FB2_PLANS_ = 'shipping_plans';
var TEMP_FB4FB2_PLAN_LINES_ = 'shipping_plan_lines';

// The two proposed append-only columns. `expected_arrival` is spelled exactly as the canonical model already
// spells it (DATABASE_RELATIONSHIP_MAP §360) and lives on the LINE table — NOT `expected_arrival_date`, and not
// on the header. B1 fixed that naming; this file consumes the decision rather than restating it.
var TEMP_FB4FB2_PROPOSED_ = [
  {
    key: 'destination_marketplace', table: 'shipping_allocation_drafts',
    type: 'string', semantics: 'trimmed; compared case-insensitively; the reviewed display casing may be the ' +
      'persisted value; BLANK means the destination is not a marketplace; mutually exclusive with ' +
      'recommended_destination_warehouse_id',
    identity_dimension: true,
    blank_default: '',
    never: 'never a fake warehouse id, and never inferred from a UI label, a page filter or a code snapshot'
  },
  {
    key: 'expected_arrival', table: 'shipping_allocation_draft_lines',
    type: 'canonical date (yyyy-MM-dd)', semantics: 'LINE-owned; blank stays blank for legacy rows unless an ' +
      'exact persisted source exists',
    identity_dimension: false,
    blank_default: '',
    never: 'never reconstructed from the current date, a creation timestamp, a carrier lead time, a shipping ' +
      'method or UI-rendered Expected Arrival text'
  }
];

// The statuses that make a header a live participant — the SAME set 16_ treats as active, so this answers the
// question the guard asks rather than a similar one.
var TEMP_FB4FB2_ACTIVE_ = { draft: 1, site_confirmed: 1, partially_submitted: 1 };

// The live target FB-4F-A diagnosed, carried forward for the per-route report §"live target". `attempted_*` are
// EVIDENCE ONLY: they describe a request the user made on 2026-10-16 that the schema could not hold. They are
// never treated as persisted facts and never used as a backfill source.
var TEMP_FB4FB2_TARGET_ = {
  company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R',
  attempted_service: 'sea_express',
  attempted_destination_marketplace: 'Amazon',
  attempted_expected_arrival: '2026-10-16',
  attempted_quantity: 400
};

var TEMP_FB4FB2_SAMPLE_CAP_ = 25;

// ==============================================================================================================
// PURE helpers. Deliberately few — the identity rules come from 69_, the schema gate from 16_, the masking and
// the hash from 68_.
// ==============================================================================================================
function tb2Str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function tb2Lc_(v) { return tb2Str_(v).toLowerCase(); }
function tb2Hash_(s) { return epcFnv1a_(String(s == null ? '' : s)); }

// A quantity that is blank or non-numeric is NOT zero — it is UNKNOWN, and conservation must fail closed on it
// rather than quietly summing a hole as if it were a value.
function tb2Qty_(v) {
  var s = tb2Str_(v);
  if (s === '') return null;
  var n = Number(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}
// Free text is never printed. Presence, length and a hash are enough to prove a later migration preserved it.
function tb2TextRef_(v) {
  var s = tb2Str_(v);
  return { present: s !== '', length: s.length, hash: s === '' ? '' : ('h:' + tb2Hash_(s)) };
}
function tb2DateStr_(v) {
  if (v && typeof v === 'object' && typeof v.getFullYear === 'function') {
    try { return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2); }
    catch (e) { return String(v); }
  }
  return tb2Str_(v);
}

// A READ-ONLY sheet stub carrying nothing but a header row. This is how the proposed post-append schema is put
// to the PRODUCTION gate: sadExactSchemaReason_ touches its sheet only through getDataRange().getValues(), so a
// hypothetical header can be validated by the real rule without a sheet and without a write.
function tb2HeaderProbe_(headerRow) {
  var row = (headerRow || []).slice();
  return { getDataRange: function () { return { getValues: function () { return [row.slice()]; } }; } };
}

// Read a tab and keep the RAW header row. The shared reader in 68_ builds row objects keyed by header name,
// which means a DUPLICATE header silently loses the earlier column — the later one wins and the earlier is
// invisible. That is precisely why a duplicate header must fail closed here instead of being worked around, so
// duplicates are detected on the raw row and the row objects are built FIRST-WINS with the collision recorded.
function tb2ReadTable_(ss, name) {
  var sh = null;
  try { sh = ss.getSheetByName(name); } catch (e) { sh = null; }
  if (!sh) return { name: name, present: false, headers: [], rows: [], row_count: 0, duplicates: [], ci_collisions: [], blank_indexes: [] };
  var data = sh.getDataRange().getValues();
  var raw = (data && data.length ? data[0] : []).map(function (h) { return tb2Str_(h); });
  while (raw.length && raw[raw.length - 1] === '') raw.pop();

  var seen = {}, dup = [], ciSeen = {}, ci = [], blanks = [];
  raw.forEach(function (h, i) {
    if (h === '') { blanks.push(i); return; }
    if (seen[h] !== undefined) dup.push({ column: h, first_index: seen[h], repeat_index: i });
    else seen[h] = i;
    var lc = h.toLowerCase();
    if (ciSeen[lc] !== undefined && ciSeen[lc].exact !== h) {
      ci.push({ lower: lc, first: ciSeen[lc].exact, first_index: ciSeen[lc].index, second: h, second_index: i });
    } else if (ciSeen[lc] === undefined) ciSeen[lc] = { exact: h, index: i };
  });

  var rows = [];
  for (var r = 1; r < (data ? data.length : 0); r++) {
    var o = {}, allBlank = true;
    for (var c = 0; c < raw.length; c++) {
      if (!raw[c]) continue;
      if (!o.hasOwnProperty(raw[c])) o[raw[c]] = data[r][c];   // FIRST wins; the duplicate is reported, not merged
      if (tb2Str_(data[r][c]) !== '') allBlank = false;
    }
    if (!allBlank) rows.push(o);
  }
  return { name: name, present: true, headers: raw, rows: rows, row_count: rows.length,
    duplicates: dup, ci_collisions: ci, blank_indexes: blanks };
}

// SCHEMA FINGERPRINT. Order-sensitive by construction: the count and the ordered join both feed the hash, so a
// reordering that preserves the set still changes the value. "All the columns are present somewhere" is not the
// same claim as "the schema is right", and every positional reader in this stack depends on the difference.
function tb2SchemaFingerprint_(headers) {
  var h = (headers || []).slice();
  return { count: h.length, ordered: h.slice(), digest: 'sf:' + tb2Hash_(h.length + '' + h.join('')) };
}

// ==============================================================================================================
// AUTHORITY GATE. Every rule this diagnostic applies belongs to a shipped file. If one is not loaded, the honest
// answer is a named refusal — never a verdict computed from a local guess.
// ==============================================================================================================
// Written out one `typeof` at a time on purpose. A dynamic lookup would need eval or a walk of the global
// object, and both are worse here than being explicit: this list IS the dependency contract, and it should read
// as one. `typeof` never invokes anything.
function tb2MissingAuthorities_() {
  var missing = [];
  function need(name, present) { if (!present) missing.push(name); }
  need('prodExpectedDbId_', typeof prodExpectedDbId_ === 'function');
  need('sadExactSchemaReason_', typeof sadExactSchemaReason_ === 'function');
  need('sadLifecycleTailState_', typeof sadLifecycleTailState_ === 'function');
  need('sadK2GroupKey_', typeof sadK2GroupKey_ === 'function');
  need('sadK2DeterministicHeaderId_', typeof sadK2DeterministicHeaderId_ === 'function');
  need('sadHeaderRouteIsComplete_', typeof sadHeaderRouteIsComplete_ === 'function');
  need('SHIPPING_ALLOCATION_DRAFTS_HEADERS_', typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined');
  need('SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_', typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ !== 'undefined');
  need('SAD_LIFECYCLE_TAIL_COLUMNS_', typeof SAD_LIFECYCLE_TAIL_COLUMNS_ !== 'undefined');
  need('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_', typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ !== 'undefined');
  need('epcFnv1a_', typeof epcFnv1a_ === 'function');
  need('epcIdRef_', typeof epcIdRef_ === 'function');
  need('epcIdentityFamily_', typeof epcIdentityFamily_ === 'function');
  need('ricCanonicalService_', typeof ricCanonicalService_ === 'function');
  need('ricDestinationIdentity_', typeof ricDestinationIdentity_ === 'function');
  need('ricK4GroupKey_', typeof ricK4GroupKey_ === 'function');
  need('ricK4DeterministicHeaderId_', typeof ricK4DeterministicHeaderId_ === 'function');
  need('ricRoutePersistability_', typeof ricRoutePersistability_ === 'function');
  need('RIC_B2_REQUIRED_COLUMNS_', typeof RIC_B2_REQUIRED_COLUMNS_ !== 'undefined');
  return missing;
}

// ==============================================================================================================
// §1 — PER-TABLE SCHEMA CENSUS AND THE APPEND PROPOSAL.
// ==============================================================================================================
// The proposed position is the CANONICAL index, not "one past the last live column". Those differ, and the
// difference is the whole ordering hazard: appending destination_marketplace one past a 30-column live sheet
// would place it at index 30, where the frozen lifecycle order says generation_run_id belongs — permanently
// blocking a migration that is already queued.
function tb2TableCensus_(t, proposed, authority, optionalTail) {
  var out = {
    table: t.name, sheet_present: t.present,
    column_count: t.headers.length, row_count: t.row_count,
    header_order: t.headers.slice(),
    fingerprint_before: tb2SchemaFingerprint_(t.headers),
    duplicate_headers: t.duplicates.slice(),
    case_insensitive_collisions: t.ci_collisions.slice(),
    blank_header_indexes: t.blank_indexes.slice(),
    target_column: proposed.key,
    target_present: false, target_index: -1, target_exact_spelling: '',
    target_ci_variant_present: false, target_ci_variant: '',
    proposed_append_index: -1, proposed_append_column_1based: -1,
    proposed_header_after: [], fingerprint_after: null,
    gate_authority_count: (authority || []).length,
    gate_optional_tail: (optionalTail || []).slice(),
    gate_verdict_current: '', gate_verdict_after_append: '',
    append_only_mechanically_safe: false,
    blocking: []
  };
  if (!t.present) { out.blocking.push('SHEET_MISSING: ' + t.name); return out; }
  if (t.duplicates.length) out.blocking.push('DUPLICATE_HEADER: ' + t.duplicates.map(function (d) { return d.column; }).join(', ') +
    ' — a name-keyed reader silently loses the earlier column, so no schema claim can be made');
  if (t.blank_indexes.length) out.blocking.push('BLANK_HEADER_AT: ' + t.blank_indexes.join(', '));

  // Exact and case-insensitive presence of the target, reported separately: a differently-cased twin is a
  // COLLISION to stop on, never a match to reuse.
  var exactAt = t.headers.indexOf(proposed.key);
  if (exactAt !== -1) {
    out.target_present = true; out.target_index = exactAt; out.target_exact_spelling = t.headers[exactAt];
  } else {
    var lc = proposed.key.toLowerCase();
    for (var i = 0; i < t.headers.length; i++) {
      if (t.headers[i].toLowerCase() === lc) {
        out.target_ci_variant_present = true; out.target_ci_variant = t.headers[i]; out.target_index = i;
        out.blocking.push('CI_TARGET_COLLISION: the sheet already carries "' + t.headers[i] + '", which differs from "' +
          proposed.key + '" only by case — appending would create two columns for one field');
        break;
      }
    }
  }

  // The gate's verdict on the sheet AS IT IS. A live sheet that already fails the gate is an unsafe legacy state
  // and must be reported before any proposal is discussed.
  out.gate_verdict_current = sadExactSchemaReason_(tb2HeaderProbe_(t.headers), authority, optionalTail) || '(exact)';
  if (out.gate_verdict_current !== '(exact)') {
    out.blocking.push('LIVE_SCHEMA_ALREADY_REJECTED_BY_WRITE_GATE: ' + out.gate_verdict_current);
  }

  if (out.target_present) {
    // Already there. Validate placement against the canonical index; propose nothing and mutate nothing.
    var canonAt = (authority || []).indexOf(proposed.key);
    out.proposed_append_index = -1;
    out.placement_valid = canonAt === -1 ? null : (exactAt === canonAt);
    out.canonical_index_expected = canonAt;
    if (canonAt !== -1 && exactAt !== canonAt) {
      out.blocking.push('TARGET_MISPLACED: "' + proposed.key + '" is at index ' + exactAt +
        ' but the canonical order places it at ' + canonAt);
    }
    out.fingerprint_after = out.fingerprint_before;
    out.proposed_header_after = t.headers.slice();
    out.append_only_mechanically_safe = false;      // nothing to append
    out.note = 'the column already exists — no duplicate is proposed and it is not mutated';
    return out;
  }

  // The canonical append index. When the authority already knows the column, use ITS index; otherwise the
  // proposal is one past the authority's own length, which is where an append-only tail entry would go.
  var known = (authority || []).indexOf(proposed.key);
  out.canonical_index_expected = known;
  out.proposed_append_index = known !== -1 ? known : (authority || []).length;
  out.proposed_append_column_1based = out.proposed_append_index + 1;
  out.authority_knows_column = known !== -1;
  if (known === -1) {
    out.blocking.push('AUTHORITY_DOES_NOT_KNOW_COLUMN: ' + proposed.key + ' is absent from the schema authority ' +
      'that the write gate validates against, so the column cannot be appended before the owner file learns it ' +
      'as an OPTIONAL tail entry');
  }

  // The proposed post-append header row, then the REAL gate's verdict on it.
  var after = t.headers.slice();
  while (after.length < out.proposed_append_index) after.push('');       // never silently reorder
  after[out.proposed_append_index] = proposed.key;
  out.proposed_header_after = after.slice();
  out.fingerprint_after = tb2SchemaFingerprint_(after);
  out.gate_verdict_after_append = sadExactSchemaReason_(tb2HeaderProbe_(after), authority, optionalTail) || '(exact)';

  var gateOk = out.gate_verdict_after_append === '(exact)';
  if (!gateOk) {
    out.blocking.push('WRITE_GATE_REJECTS_PROPOSED_HEADER: ' + out.gate_verdict_after_append +
      ' — appending this column while the owner file is unchanged makes EVERY allocation read and write fail ' +
      'closed. The owner file must learn the column first; a blank column is not inert against a positional gate');
  }
  var gapFilled = out.proposed_header_after.filter(function (h) { return h === ''; }).length;
  if (gapFilled) out.blocking.push('APPEND_WOULD_LEAVE_BLANK_COLUMNS: ' + gapFilled +
    ' — the canonical index is beyond the live header, so an earlier append-only migration is still outstanding');

  out.append_only_mechanically_safe = gateOk && out.blocking.length === 0;
  return out;
}

// ==============================================================================================================
// §2 — DESTINATION CENSUS.
// ==============================================================================================================
// The classification is the B1 contract's, executed — never a second opinion about what a destination is.
//
// AND A BACKFILL CANDIDATE IS ALMOST NEVER PRODUCIBLE HERE, which is the finding rather than a limitation. A
// header whose destination warehouse is blank and whose SCOPE marketplace is Amazon is indistinguishable, in the
// persisted data, from a route the user simply never finished choosing a destination for. Both store exactly the
// same thing: nothing. The scope column answers "which marketplace is this plan for", not "where does this route
// deliver", so it cannot promote itself into a destination. Anything else on offer — the client payload, the UI
// label, the page filter, the warehouse code snapshot — is either not persisted or explicitly excluded.
function tb2DestinationCensus_(H) {
  var c = { warehouse_only: 0, marketplace_only: 0, both: 0, neither: 0 };
  var backfill_candidates = [], ambiguous = [], blocked = [], samples = [];
  (H.rows || []).forEach(function (h) {
    var d = ricDestinationIdentity_(h);
    var wid = tb2Str_(h.recommended_destination_warehouse_id);
    var mkt = tb2Str_(h.destination_marketplace);      // absent as a column today; present once B3 appends it
    if (wid && mkt) c.both++;
    else if (wid) c.warehouse_only++;
    else if (mkt) c.marketplace_only++;
    else c.neither++;

    var ref = epcIdRef_(h.allocation_draft_id);
    var active = !!TEMP_FB4FB2_ACTIVE_[tb2Lc_(h.status)];
    if (d.code === 'ROUTE_DESTINATION_AMBIGUOUS') {
      ambiguous.push({ id_ref: ref, status: tb2Str_(h.status), active: active });
    }
    if (d.code === 'ROUTE_DESTINATION_MISSING') {
      // Every scrap of evidence the row itself carries, listed so the exclusion is auditable rather than assumed.
      var evidence = {
        scope_marketplace: tb2Str_(h.marketplace),
        destination_code_snapshot: tb2Str_(h.recommended_destination_warehouse_code_snapshot),
        route_complete_per_16: !!sadHeaderRouteIsComplete_(h),
        persisted_destination_field: '(none)'
      };
      blocked.push({ id_ref: ref, status: tb2Str_(h.status), active: active, evidence: evidence,
        reason: 'NO_PERSISTED_DESTINATION_EVIDENCE — the scope marketplace answers which marketplace the PLAN ' +
          'is for, not where the ROUTE delivers; a blank destination is equally consistent with an unfinished ' +
          'route, and a code snapshot is an excluded source. No backfill is proposed.' });
    }
    if (samples.length < TEMP_FB4FB2_SAMPLE_CAP_) {
      samples.push({ id_ref: ref, status: tb2Str_(h.status), active: active,
        destination_type: d.type || '(none)', destination_identity_hash: d.id ? 'h:' + tb2Hash_(d.id) : '',
        destination_code: d.code || '', scope_marketplace: tb2Str_(h.marketplace),
        note_ref: tb2TextRef_(h.note) });
    }
  });
  return {
    counts: c,
    backfill_candidates: backfill_candidates,          // empty unless an exact persisted source appears
    backfill_candidate_count: backfill_candidates.length,
    ambiguous_legacy_rows: ambiguous,
    must_remain_blocked: blocked,
    must_remain_blocked_count: blocked.length,
    excluded_evidence_sources: ['UI labels', 'display text', 'warehouse code snapshots', 'page filters',
      'attempted client payloads not persisted in the row', 'the header scope marketplace on its own'],
    samples: samples,
    backfill_performed: false, rows_changed: 0
  };
}

// ==============================================================================================================
// §3 — EXPECTED-ARRIVAL CENSUS.
// ==============================================================================================================
// THE CLIENT'S expected_arrival IS NOT EVIDENCE, and this is measured rather than assumed. In
// assets/js/pages/inventory-replenishment.js the value sent with a save is read straight out of the rendered
// DOM cell:
//
//     var etaEl = rowEl.querySelector('[data-field="expected_arrival"]');
//     var expectedArrival = etaEl ? String(etaEl.textContent || '').trim() : '';
//
// So it is UI-CALCULATED text, produced from a carrier lead time — which is the one source the task names as
// forbidden, twice. Worse, until B1 fixed _irMethodToLeadKey, that computation used the REGULAR ocean lead time
// for every express-ocean route. Backfilling the attempted 2026-10-16 would therefore persist, as authoritative,
// a date derived from the wrong service's transit days. A blank ETA is a missing value; that would be a wrong
// one wearing a missing one's clothes.
function tb2ExpectedArrivalCensus_(L) {
  var CANDIDATE_SOURCES = ['expected_arrival', 'required_by_date', 'window_end_date'];
  var present = (L.headers || []).filter(function (h) { return CANDIDATE_SOURCES.indexOf(h) !== -1; });
  var withEta = 0, withoutEta = 0, ambiguous = [], mustBlank = [], samples = [];

  (L.rows || []).forEach(function (l) {
    var eta = tb2Str_(l.expected_arrival);
    if (eta) withEta++; else withoutEta++;
    if (!eta) {
      mustBlank.push({ line_ref: epcIdRef_(l.allocation_draft_line_id), parent_ref: epcIdRef_(l.allocation_draft_id) });
    }
    if (samples.length < TEMP_FB4FB2_SAMPLE_CAP_) {
      samples.push({
        line_ref: epcIdRef_(l.allocation_draft_line_id), parent_ref: epcIdRef_(l.allocation_draft_id),
        sku: tb2Str_(l.sku), window_code: tb2Str_(l.window_code),
        persisted_expected_arrival: tb2DateStr_(l.expected_arrival),
        required_by_date: tb2DateStr_(l.required_by_date),
        window_end_date: tb2DateStr_(l.window_end_date)
      });
    }
  });

  // required_by_date and window_end_date are PLANNING inputs, not arrival facts. They are enumerated so the
  // exclusion is on the record — a nearby date is the most tempting wrong answer available.
  (L.rows || []).forEach(function (l) {
    if (tb2Str_(l.expected_arrival)) return;
    var near = [];
    if (tb2Str_(l.required_by_date)) near.push('required_by_date');
    if (tb2Str_(l.window_end_date)) near.push('window_end_date');
    if (near.length && ambiguous.length < TEMP_FB4FB2_SAMPLE_CAP_) {
      ambiguous.push({ line_ref: epcIdRef_(l.allocation_draft_line_id), nearby_dates: near,
        reason: 'NOT_AN_ARRIVAL_FACT — a planning window bound is not a carrier arrival; using one would ' +
          'manufacture an ETA that no source asserts' });
    }
  });

  return {
    persisted_source_columns_present: present,
    exact_persisted_source_exists: present.indexOf('expected_arrival') !== -1,
    rows_with_persisted_eta: withEta,
    rows_with_no_persisted_eta_source: withoutEta,
    ambiguous_candidates: ambiguous,
    must_remain_blank_count: mustBlank.length,
    must_remain_blank: mustBlank.slice(0, TEMP_FB4FB2_SAMPLE_CAP_),
    // The attempted ETA is recorded as a QUESTION ASKED, not as a value held: it is what makes
    // STOP_UNPERSISTED_EXPECTED_ARRIVAL a reachable verdict rather than a decorative constant. Someone asked to
    // persist an arrival date, and there is nowhere to put it.
    attempted_expected_arrival: TEMP_FB4FB2_TARGET_.attempted_expected_arrival,
    attempted_expected_arrival_present: tb2Str_(TEMP_FB4FB2_TARGET_.attempted_expected_arrival) !== '',
    excluded_derivations: ['carrier lead time', 'shipping method', 'the current date', 'creation timestamp',
      'UI-calculated Expected Arrival (the client reads it out of the rendered DOM cell)',
      'the 2026-10-16 attempted payload, which is that same UI text and was computed from the WRONG service ' +
      'lead time until B1 fixed the mapper'],
    samples: samples,
    backfill_performed: false, rows_changed: 0
  };
}

// ==============================================================================================================
// §4 — ROUTE AND SERVICE CENSUS. sea !== sea_express, reported as two populations and never merged.
// ==============================================================================================================
function tb2ServiceCensus_(H, linesByDraft) {
  var byCanonical = {}, byRaw = {}, blank = 0, noncanonical = [];
  (H.rows || []).forEach(function (h) {
    var raw = tb2Str_(h.recommended_shipping_method);
    if (!raw) { blank++; return; }
    byRaw[raw] = (byRaw[raw] || 0) + 1;
    var canon = ricCanonicalService_(raw);
    if (!canon) {
      if (noncanonical.length < TEMP_FB4FB2_SAMPLE_CAP_) {
        noncanonical.push({ id_ref: epcIdRef_(h.allocation_draft_id), persisted_value: raw,
          reason: 'SERVICE_NOT_CANONICAL — refused, never mapped to a neighbouring service' });
      }
      byCanonical['(noncanonical)'] = (byCanonical['(noncanonical)'] || 0) + 1;
      return;
    }
    byCanonical[canon] = (byCanonical[canon] || 0) + 1;
  });

  // The distinctness proof, computed live from the contract rather than asserted in prose.
  var proof = {
    'ricCanonicalService_("sea")': ricCanonicalService_('sea'),
    'ricCanonicalService_("sea_express")': ricCanonicalService_('sea_express'),
    distinct: ricCanonicalService_('sea') !== ricCanonicalService_('sea_express'),
    sea_never_becomes_sea_express: ricCanonicalService_('sea') === 'sea',
    sea_express_never_falls_back_to_sea: ricCanonicalService_('sea_express') === 'sea_express',
    no_family_fallback: ricCanonicalService_('seafood') === '' && ricCanonicalService_('sea-express') === '' &&
      ricCanonicalService_('ocean') === ''
  };

  // The live target, reported on its own because it is the row that started FB-4F.
  var t = TEMP_FB4FB2_TARGET_;
  var targetHeaders = (H.rows || []).filter(function (h) {
    if (tb2Lc_(h.country) !== tb2Lc_(t.country)) return false;
    if (tb2Lc_(h.marketplace) !== tb2Lc_(t.marketplace)) return false;
    if (tb2Lc_(h.company) !== tb2Lc_(t.company)) return false;
    var mine = linesByDraft[tb2Str_(h.allocation_draft_id)] || [];
    for (var i = 0; i < mine.length; i++) if (tb2Lc_(mine[i].sku) === tb2Lc_(t.sku)) return true;
    return false;
  });
  var targetRows = targetHeaders.map(function (h) {
    var mine = (linesByDraft[tb2Str_(h.allocation_draft_id)] || []).filter(function (l) {
      return tb2Lc_(l.sku) === tb2Lc_(t.sku);
    });
    var qty = 0, unknown = 0;
    mine.forEach(function (l) { var q = tb2Qty_(l.planned_qty); if (q === null) unknown++; else qty += q; });
    var persistedSvc = ricCanonicalService_(h.recommended_shipping_method);
    var attemptedSvc = ricCanonicalService_(t.attempted_service);
    return {
      id_ref: epcIdRef_(h.allocation_draft_id), status: tb2Str_(h.status),
      persisted_service_raw: tb2Str_(h.recommended_shipping_method),
      persisted_service_canonical: persistedSvc,
      attempted_service_canonical: attemptedSvc,
      same_service: persistedSvc === attemptedSvc,
      same_identity: tb2Str_(ricK4DeterministicHeaderId_(h)) ===
        tb2Str_(ricK4DeterministicHeaderId_(tb2WithAttempt_(h, t))),
      current_quantity_total: qty, quantity_unknown_lines: unknown,
      attempted_quantity: t.attempted_quantity,
      // TWO SEPARATE FACTS, AND CONFLATING THEM IS HOW A MIGRATION REWRITES THE WRONG ROW.
      //
      // The persisted row is a `sea` route with no destination. The attempted request was a `sea_express` route
      // to Amazon. Service and destination are BOTH K4 dimensions, so those are two DIFFERENT routes -
      // same_identity is false, and a later reconciliation must NOT rewrite the sea row into a sea_express one.
      // The express route has simply never existed.
      //
      // Quantity is a different matter: it is not a K4 dimension at all, so 800 and 400 on the SAME route would
      // be one identity and would call for an UPDATE rather than a second route. That is why neither number is
      // touched here - the first fact says do not rewrite this row, and the second says do not duplicate it.
      identity_statement: 'same_identity=' + (tb2Str_(ricK4DeterministicHeaderId_(h)) ===
        tb2Str_(ricK4DeterministicHeaderId_(tb2WithAttempt_(h, t))) ? 'true' : 'false') +
        '. Service and destination are both K4 dimensions, so a differing service or destination is a ' +
        'DIFFERENT ROUTE, not the same route needing an update. A reconciliation must never normalize one into ' +
        'the other.',
      quantity_statement: 'NEITHER QUANTITY WAS CHANGED AND NEITHER WAS CREATED. The persisted total is read; ' +
        'the attempted quantity is evidence of a request the schema could not hold. Quantity is NOT a K4 ' +
        'dimension, so a quantity difference alone would call for an UPDATE of one route, never a second route.'
    };
  });

  return {
    persisted_by_canonical_service: byCanonical,
    persisted_by_raw_value: byRaw,
    blank_service_rows: blank,
    noncanonical_values: noncanonical,
    distinctness_proof: proof,
    live_target: { scope: t, headers_matched: targetRows.length, rows: targetRows },
    values_rewritten: 0
  };
}
// The attempted request expressed as a header, for an identity COMPARISON only. Nothing here is persisted.
function tb2WithAttempt_(h, t) {
  var o = {};
  Object.keys(h).forEach(function (k) { o[k] = h[k]; });
  o.recommended_shipping_method = t.attempted_service;
  o.destination_marketplace = t.attempted_destination_marketplace;
  return o;
}

// ==============================================================================================================
// §5 — K4 PREVIEW. Read-only, from the frozen B1 contract. No id is rewritten and no row is created.
// ==============================================================================================================
function tb2K4Preview_(H) {
  var rows = [], byK4 = {}, famByK4 = {}, unclassifiable = 0;
  (H.rows || []).forEach(function (h) {
    var d = ricDestinationIdentity_(h);
    var svc = ricCanonicalService_(h.recommended_shipping_method);
    var fam = epcIdentityFamily_(h, sadK2DeterministicHeaderId_, sadHeaderRouteIsComplete_);
    if (!d.ok || !svc) {
      unclassifiable++;
      if (rows.length < TEMP_FB4FB2_SAMPLE_CAP_) {
        rows.push({ current_id_ref: epcIdRef_(h.allocation_draft_id), identity_family: fam.family,
          destination_type: d.type || '(none)', destination_identity_hash: '',
          canonical_service: svc || '(none)', k4_key_hash: '', proposed_k4_id_ref: epcIdRef_(''),
          classifiable: false,
          reason: !d.ok ? d.code : 'SERVICE_NOT_CANONICAL',
          mechanically_safe_for_later_migration: false });
      }
      return;
    }
    var key = ricK4GroupKey_(h);
    var id = ricK4DeterministicHeaderId_(h);
    (byK4[id] = byK4[id] || []).push(tb2Str_(h.allocation_draft_id));
    (famByK4[id] = famByK4[id] || {})[fam.family] = (famByK4[id][fam.family] || 0) + 1;
    if (rows.length < TEMP_FB4FB2_SAMPLE_CAP_) {
      rows.push({ current_id_ref: epcIdRef_(h.allocation_draft_id), identity_family: fam.family,
        destination_type: d.type, destination_identity_hash: 'h:' + tb2Hash_(d.id),
        canonical_service: svc, k4_key_hash: 'h:' + tb2Hash_(key), proposed_k4_id_ref: epcIdRef_(id),
        classifiable: true, mechanically_safe_for_later_migration: false,
        reason: 'PREVIEW_ONLY — the identity columns do not exist yet, so no migration can be safe today' });
    }
  });

  var collapsing = [], contested = [];
  Object.keys(byK4).forEach(function (id) {
    if (byK4[id].length > 1) {
      collapsing.push({ proposed_k4_id_ref: epcIdRef_(id), legacy_header_count: byK4[id].length,
        legacy_refs: byK4[id].slice(0, 8).map(function (x) { return epcIdRef_(x); }),
        reason: 'MULTIPLE_LEGACY_HEADERS_COLLAPSE_TO_ONE_K4_IDENTITY — a later reconciliation must decide which ' +
          'header survives; it must never silently merge or duplicate them' });
    }
  });
  // CONTESTED: one proposed K4 identity claimed by legacy headers of DIFFERENT identity families — say a
  // CANONICAL K2 header and a LEGACY one. Collapsing those is not a merge of duplicates, it is a choice between
  // two differently-governed records, and a later reconciliation must be TOLD which survives rather than
  // discovering it from row order.
  Object.keys(famByK4).forEach(function (id) {
    var fams = Object.keys(famByK4[id]);
    if (fams.length > 1) {
      contested.push({ proposed_k4_id_ref: epcIdRef_(id), families: famByK4[id],
        reason: 'CONTESTED_IDENTITY — one proposed K4 identity is claimed by headers of more than one identity ' +
          'family, so which record survives is a reviewed decision and not a mechanical one' });
    }
  });

  // One legacy row needing MULTIPLE K4 identities cannot arise from a header alone — K4 is a header key and a
  // header carries exactly one route. It is reported as a checked-and-empty class rather than omitted, because
  // "we did not look" and "there are none" are different answers.
  var oneToMany = { count: 0, note: 'structurally impossible for a header key: one header carries one route, so ' +
    'one legacy header maps to exactly one K4 identity. Checked, not assumed.' };

  return {
    preview_only: true, rows_written: 0, ids_rewritten: 0, headers_created: 0, lines_moved: 0,
    quantities_changed: 0, fks_changed: 0, migration_journaled: false,
    classifiable_rows: Object.keys(byK4).length, unclassifiable_rows: unclassifiable,
    rows: rows,
    natural_key_collisions: collapsing, natural_key_collision_count: collapsing.length,
    one_legacy_row_needing_multiple_k4: oneToMany,
    contested_identities: contested, contested_identity_count: contested.length,
    mechanically_safe_for_migration: false,
    mechanically_safe_reason: 'the K4 identity columns are not in the live schema, so no K4 id can be persisted ' +
      'yet. k4MigrationSafe is a separate decision from schemaAppendSafe and is false.'
  };
}

// ==============================================================================================================
// §6 — FOREIGN-KEY AND QUANTITY PROOF. The proposed total must EQUAL the current total: this round transforms
// nothing, so any difference would be a bug in the diagnostic, not a finding about the data.
// ==============================================================================================================
function tb2FkAndQuantity_(H, L, P, PL, linesByDraft) {
  var headerIds = {};
  (H.rows || []).forEach(function (h) { var id = tb2Str_(h.allocation_draft_id); if (id) headerIds[id] = true; });

  var matched = 0, orphanLines = [], total = 0, unknownQty = 0;
  (L.rows || []).forEach(function (l) {
    var parent = tb2Str_(l.allocation_draft_id);
    if (parent && headerIds[parent]) matched++;
    else if (orphanLines.length < TEMP_FB4FB2_SAMPLE_CAP_) {
      orphanLines.push({ line_ref: epcIdRef_(l.allocation_draft_line_id), parent_ref: epcIdRef_(parent) });
    }
    var q = tb2Qty_(l.planned_qty);
    if (q === null) unknownQty++; else total += q;
  });

  var childless = 0;
  Object.keys(headerIds).forEach(function (id) { if (!(linesByDraft[id] || []).length) childless++; });

  // Downstream textual references: which tables quote an allocation_draft_id, and whether an identity
  // REPLACEMENT would strand them. This round proposes no replacement, so both columns are reported as facts.
  var downstream = [];
  [[P, TEMP_FB4FB2_PLANS_], [PL, TEMP_FB4FB2_PLAN_LINES_]].forEach(function (pair) {
    var T = pair[0], name = pair[1];
    if (!T || !T.present) { downstream.push({ table: name, present: false }); return; }
    (T.headers || []).forEach(function (col) {
      if (col.indexOf('allocation_draft') === -1) return;
      var n = 0;
      (T.rows || []).forEach(function (r) { if (tb2Str_(r[col])) n++; });
      downstream.push({ table: name, column: col, present: true, row_count: n,
        binds_to_current_header_id: n > 0,
        preserved_by_blank_column_append: true,
        preserved_by_identity_replacement: false,
        orphan_risk_if_rekeyed: n > 0 ? 'HIGH — these rows quote the CURRENT id as text and would be stranded' : 'none' });
    });
  });

  return {
    matched_lines: matched, orphan_lines: orphanLines, orphan_line_count: orphanLines.length,
    headers_with_no_lines: childless,
    planned_qty_total_before: total,
    planned_qty_total_proposed_after: total,
    quantity_unknown_lines: unknownQty,
    conservation_verdict: unknownQty > 0
      ? 'CANNOT_CONSERVE — at least one planned_qty is blank or non-numeric; unknown is not zero'
      : 'CONSERVED — identical, because this round performs no data transformation',
    conserved: unknownQty === 0,
    downstream_references: downstream,
    duplicate_risk: 'none from a blank column append; a later identity replacement carries the duplicate risk',
    rows_written: 0, fks_changed: 0
  };
}

// ==============================================================================================================
// THE DRY RUN. The name the task specified. Read-only, no mode argument, no commit path.
// ==============================================================================================================
function TEMP_shippingAllocationSchemaB2DryRun_() {
  var out = {
    diagnostic: TEMP_FB4FB2_NAME_, round: TEMP_FB4FB2_ROUND_,
    timestamp: '', readOnly: true,
    DB_WRITES: 0, DRIVE_WRITES: 0, LOCKS_ACQUIRED: 0, COLUMNS_APPENDED: 0, ROWS_CHANGED: 0,
    refused: null, proposed_columns: TEMP_FB4FB2_PROPOSED_, sections: {},
    live_schema_checksum: '', checksum_scope: '',
    schemaAppendSafe: false, destinationBackfillSafe: false, expectedArrivalBackfillSafe: false,
    k4MigrationSafe: false, runtimeWiringReady: false,
    blocking: [], decision: ''
  };
  try { out.timestamp = new Date().toISOString(); } catch (e) { out.timestamp = '(unavailable)'; }

  // ---- 0. AUTHORITY GATE -------------------------------------------------------------------------------------
  var missing = tb2MissingAuthorities_();
  if (missing.length) {
    out.refused = { code: 'AUTHORITY_NOT_LOADED', missing: missing,
      message: 'every rule this diagnostic applies belongs to a shipped file, and at least one is not loaded. ' +
        '69_api_v1_route_identity_contract.gs is UNSYNCED by design (B1 left it unrouted and unmanifested), so ' +
        'paste it alongside this file for the run and remove both afterwards. Nothing was read and nothing was ' +
        'computed from a local guess.' };
    out.decision = 'STOP_UNSAFE_LEGACY_STATE';
    return out;
  }

  var ss = null;
  try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); } catch (e) { ss = null; }
  if (!ss) {
    out.refused = { code: 'DB_NOT_REACHABLE', message: 'the configured production database could not be opened read-only' };
    out.decision = 'STOP_UNSAFE_LEGACY_STATE';
    return out;
  }

  var H = tb2ReadTable_(ss, TEMP_FB4FB2_DRAFTS_);
  var L = tb2ReadTable_(ss, TEMP_FB4FB2_LINES_);
  var P = tb2ReadTable_(ss, TEMP_FB4FB2_PLANS_);
  var PL = tb2ReadTable_(ss, TEMP_FB4FB2_PLAN_LINES_);

  // ---- 1. SCHEMA CENSUS + APPEND PROPOSAL --------------------------------------------------------------------
  // F1-7N-FB-4F-B3 - ASK THE AUTHORITIES THE WRITE GATE ACTUALLY USES. B2 read the pre-B3 constants, which was
  // correct then and became a lie the moment B3 taught the runtime the two columns: the diagnostic would have
  // gone on reporting the line append as refused while the gate had already been taught to accept it. The whole
  // value of this tool is that it does not hold a second opinion, so it follows the gate rather than a snapshot
  // of it. Where the file predates B3 (an unsynced deployment) the older constants are used, so it still runs.
  var hAuthority = (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ !== 'undefined')
    ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ : SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_;
  var hTail = (typeof SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ !== 'undefined')
    ? SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ : SAD_LIFECYCLE_TAIL_COLUMNS_;
  var lAuthority = (typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ !== 'undefined')
    ? SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ : SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_;
  var lTail = (typeof SAD_LINE_ETA_TAIL_COLUMNS_ !== 'undefined') ? SAD_LINE_ETA_TAIL_COLUMNS_ : [];

  var hCensus = tb2TableCensus_(H, TEMP_FB4FB2_PROPOSED_[0], hAuthority, hTail);
  var lCensus = tb2TableCensus_(L, TEMP_FB4FB2_PROPOSED_[1], lAuthority, lTail);
  out.sections['1_schema'] = { tables: [hCensus, lCensus] };

  // The lifecycle tail state, from 16_'s own authority. This is the ORDERING PRECONDITION: destination_marketplace
  // can only ever occupy the canonical index AFTER the frozen lifecycle tail at 30..33, so an outstanding
  // lifecycle migration blocks this one — and appending at index 30 instead would permanently block IT.
  var tail = null;
  try { tail = sadLifecycleTailState_(tb2HeaderProbe_(H.headers)); } catch (e) { tail = null; }
  out.sections['1b_ordering_precondition'] = {
    lifecycle_tail_expected_indexes: '30..33',
    lifecycle_tail: tail,
    lifecycle_tail_complete: !!(tail && tail.complete),
    other_queued_migration: 'TEMP_migrate_shipping_allocation_ai_lifecycle.gs',
    constraint: 'the lifecycle tail must be physically present BEFORE destination_marketplace is appended. Its ' +
      'own safety check requires the live header to be an exact prefix of ITS canonical order with no unknown ' +
      'extra column, so appending destination_marketplace first would refuse that migration permanently.',
    correct_order: ['1. owner file learns both columns as OPTIONAL tail entries (a WRITER change — not this round)',
      '2. Apps Script sync + a new deployment version',
      '3. lifecycle tail append (indexes 30..33) if still outstanding',
      '4. destination_marketplace append (header) and expected_arrival append (line)',
      '5. frontend'],
    b1_report_ordering_was_wrong: true,
    b1_report_ordering_correction: 'B1 reported "schema append -> Apps Script sync -> frontend". Measured here: ' +
      'the append BEFORE the sync makes every allocation read and write fail closed, because the write gate is ' +
      'positional and exact. Code first, then schema.'
  };
  if (tail && !tail.complete) {
    out.blocking.push('LIFECYCLE_TAIL_OUTSTANDING: ' + (tail.missing || []).join(', ') +
      ' — a second append-only migration against this table is queued and must land first');
  }

  // ---- 2..6 CENSUSES -----------------------------------------------------------------------------------------
  var linesByDraft = {};
  (L.rows || []).forEach(function (l) {
    var k = tb2Str_(l.allocation_draft_id);
    (linesByDraft[k] = linesByDraft[k] || []).push(l);
  });

  out.sections['2_destination'] = tb2DestinationCensus_(H);
  out.sections['3_expected_arrival'] = tb2ExpectedArrivalCensus_(L);
  out.sections['4_service'] = tb2ServiceCensus_(H, linesByDraft);
  out.sections['5_k4_preview'] = tb2K4Preview_(H);
  out.sections['6_fk_and_quantity'] = tb2FkAndQuantity_(H, L, P, PL, linesByDraft);

  // ---- 7. CHECKSUM -------------------------------------------------------------------------------------------
  // Deterministic and content-derived: the ordered header rows of both tables plus their row counts. Order
  // matters, so a reordering that preserves the column SET still moves the value.
  var hFp = tb2SchemaFingerprint_(H.headers), lFp = tb2SchemaFingerprint_(L.headers);
  var checksum = TEMP_FB4FB2_CHECKSUM_PREFIX_ + ':' + tb2Hash_(
    hFp.digest + '' + H.row_count + '' + lFp.digest + '' + L.row_count);

  // A LIVE RE-READ. If the schema moved while this ran, every verdict above describes a sheet that no longer
  // exists, and the only honest output is a refusal.
  var H2 = tb2ReadTable_(ss, TEMP_FB4FB2_DRAFTS_), L2 = tb2ReadTable_(ss, TEMP_FB4FB2_LINES_);
  var stable = tb2SchemaFingerprint_(H2.headers).digest === hFp.digest &&
    tb2SchemaFingerprint_(L2.headers).digest === lFp.digest;
  if (!stable) {
    out.refused = { code: 'LIVE_SCHEMA_CHANGED_DURING_DIAGNOSTIC',
      message: 'the header row of at least one target table changed between the first and second read' };
    out.decision = 'STOP_UNSAFE_LEGACY_STATE';
    return out;
  }
  if (!checksum || checksum === TEMP_FB4FB2_CHECKSUM_PREFIX_ + ':') {
    out.refused = { code: 'CHECKSUM_NOT_DETERMINISTIC', message: 'a checksum could not be produced' };
    out.decision = 'STOP_UNSAFE_LEGACY_STATE';
    return out;
  }
  out.live_schema_checksum = checksum;
  out.checksum_scope = 'AUTHORIZES AT MOST ONE LATER, SEPARATELY REVIEWED OPERATION: adding the BLANK columns ' +
    'named above. It is invalidated by any header change. It is NOT authorization to backfill a value, to mint ' +
    'a K4 id, to reconcile a legacy row, or to wire the runtime.';
  out.sections['7_checksum'] = {
    checksum: checksum, header_fingerprint: hFp, line_fingerprint: lFp,
    stable_across_two_reads: true,
    order_sensitive: true
  };

  // ---- 8. THE FIVE SEPARATE DECISIONS ------------------------------------------------------------------------
  [hCensus, lCensus].forEach(function (c) {
    (c.blocking || []).forEach(function (b) { out.blocking.push(c.table + ': ' + b); }); });

  var d2 = out.sections['2_destination'], d3 = out.sections['3_expected_arrival'],
    d5 = out.sections['5_k4_preview'], d6 = out.sections['6_fk_and_quantity'];

  var bothPresentAndValid = hCensus.target_present && lCensus.target_present &&
    hCensus.placement_valid !== false && lCensus.placement_valid !== false &&
    hCensus.gate_verdict_current === '(exact)' && lCensus.gate_verdict_current === '(exact)';

  out.schemaAppendSafe = out.blocking.length === 0 &&
    (hCensus.append_only_mechanically_safe || hCensus.target_present) &&
    (lCensus.append_only_mechanically_safe || lCensus.target_present);
  out.destinationBackfillSafe = d2.backfill_candidate_count > 0 && d2.ambiguous_legacy_rows.length === 0;
  out.expectedArrivalBackfillSafe = d3.exact_persisted_source_exists && d3.ambiguous_candidates.length === 0 &&
    d3.rows_with_persisted_eta > 0;
  out.k4MigrationSafe = false;      // requires the columns to exist AND a separately reviewed reconciliation
  out.runtimeWiringReady = false;   // 69_ is unrouted and unmanifested by design

  // ---- 9. THE TYPED DECISION ---------------------------------------------------------------------------------
  // Ordered most-structural first: a missing sheet or a duplicated header makes every later claim unsound, so it
  // is answered before anything about destinations or identities is allowed to matter.
  function gateRejects(c) { return !!c.gate_verdict_after_append && c.gate_verdict_after_append !== '(exact)'; }
  var schemaCollision = !H.present || !L.present ||
    H.duplicates.length > 0 || L.duplicates.length > 0 ||
    H.blank_indexes.length > 0 || L.blank_indexes.length > 0 ||
    hCensus.target_ci_variant_present || lCensus.target_ci_variant_present ||
    hCensus.placement_valid === false || lCensus.placement_valid === false ||
    gateRejects(hCensus) || gateRejects(lCensus) ||
    hCensus.gate_verdict_current !== '(exact)' || lCensus.gate_verdict_current !== '(exact)' ||
    !!(tail && !tail.complete);

  if (schemaCollision) out.decision = 'STOP_SCHEMA_COLLISION';
  else if (d2.ambiguous_legacy_rows.length) out.decision = 'STOP_AMBIGUOUS_DESTINATION';
  // AN ARRIVAL DATE WAS ASKED FOR AND NO ROW HOLDS ONE TO JUSTIFY IT.
  //
  // The first version of this clause asked whether the COLUMN existed, and was therefore unreachable in both
  // directions: with the column absent the positional gate already answers STOP_SCHEMA_COLLISION, and with it
  // present the clause is false by construction. The verdict is not about the schema at all - it is about a
  // BACKFILL. Once the schema is sound, a blank column plus an attempted date is exactly the state in which a
  // migration would have to INVENT the value, and that is what must stop.
  else if (d3.attempted_expected_arrival_present && d3.rows_with_persisted_eta === 0)
    out.decision = 'STOP_UNPERSISTED_EXPECTED_ARRIVAL';
  else if (!d6.conserved) out.decision = 'STOP_UNSAFE_LEGACY_STATE';
  else if (d5.natural_key_collision_count || d5.contested_identity_count) out.decision = 'STOP_IDENTITY_COLLISION';
  else if (bothPresentAndValid) out.decision = 'SCHEMA_ALREADY_PRESENT_AND_VALID';
  else if (out.schemaAppendSafe) out.decision = 'READY_FOR_REVIEWED_SCHEMA_APPEND';
  else out.decision = 'STOP_UNSAFE_LEGACY_STATE';

  out.decision_scope = 'READY_FOR_REVIEWED_SCHEMA_APPEND, if reached, means ONLY that BLANK append-only columns ' +
    'can be added later. It never means a backfill is safe, that a K4 migration is safe, that the runtime is ' +
    'wired, or that any live migration is authorized — those are the four separate decisions above.';
  out.zero_write_statement = 'NO COLUMN WAS APPENDED, NO ROW WAS CHANGED, NO ID WAS REWRITTEN, NO QUANTITY WAS ' +
    'CHANGED, NO FOREIGN KEY WAS CHANGED, NO LOCK WAS TAKEN AND NO MIGRATION WAS JOURNALED BY THIS DIAGNOSTIC.';
  return out;
}

// ==============================================================================================================
// THE EDITOR ENTRY POINT. A trailing underscore is Apps Script's private convention and such functions are not
// offered in the Run selector, so the runnable name has none — the same shape FB-4F-A already uses here. Output
// is a compact summary plus bounded numbered sections, because one oversized JSON blob is the reliable way to
// lose the answer to the execution-log cap.
// ==============================================================================================================
function TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN() {
  var d = TEMP_shippingAllocationSchemaB2DryRun_();
  function log(s) { Logger.log('[FB4FB2] ' + s); }
  log('=== ' + d.diagnostic + ' · ' + d.round + ' · ' + d.timestamp + ' ===');
  log('readOnly=' + d.readOnly + ' DB_WRITES=' + d.DB_WRITES + ' DRIVE_WRITES=' + d.DRIVE_WRITES +
    ' LOCKS_ACQUIRED=' + d.LOCKS_ACQUIRED + ' COLUMNS_APPENDED=' + d.COLUMNS_APPENDED + ' ROWS_CHANGED=' + d.ROWS_CHANGED);
  if (d.refused) {
    log('REFUSED ' + d.refused.code + ' — ' + (d.refused.message || ''));
    if (d.refused.missing) log('  missing=' + JSON.stringify(d.refused.missing));
    log('decision=' + d.decision);
    return d;
  }
  var s = d.sections;

  log('--- 1 schema ---');
  s['1_schema'].tables.forEach(function (c) {
    log('  [' + c.table + '] present=' + c.sheet_present + ' cols=' + c.column_count + ' rows=' + c.row_count +
      ' fp=' + c.fingerprint_before.digest);
    log('    duplicates=' + JSON.stringify(c.duplicate_headers) + ' ci_collisions=' + JSON.stringify(c.case_insensitive_collisions) +
      ' blank_at=' + JSON.stringify(c.blank_header_indexes));
    log('    target=' + c.target_column + ' present=' + c.target_present + ' at=' + c.target_index +
      ' ci_variant=' + c.target_ci_variant_present + (c.target_ci_variant ? ('("' + c.target_ci_variant + '")') : ''));
    log('    authority_cols=' + c.gate_authority_count + ' optional_tail=' + JSON.stringify(c.gate_optional_tail) +
      ' authority_knows_column=' + c.authority_knows_column);
    log('    proposed_append_index=' + c.proposed_append_index + ' (col ' + c.proposed_append_column_1based + ')' +
      ' fp_after=' + (c.fingerprint_after ? c.fingerprint_after.digest : '(none)'));
    log('    GATE now=' + c.gate_verdict_current + '  GATE after append=' + (c.gate_verdict_after_append || '(n/a)'));
    log('    append_only_mechanically_safe=' + c.append_only_mechanically_safe);
    (c.blocking || []).forEach(function (b) { log('    BLOCKING ' + b); });
    if (c.note) log('    note: ' + c.note);
  });

  var o = s['1b_ordering_precondition'];
  log('--- 1b ordering precondition ---');
  log('  lifecycle_tail_complete=' + o.lifecycle_tail_complete + ' missing=' +
    JSON.stringify(o.lifecycle_tail ? o.lifecycle_tail.missing : null));
  log('  other_queued_migration=' + o.other_queued_migration);
  log('  ' + o.constraint);
  o.correct_order.forEach(function (x) { log('    ' + x); });
  log('  B1_ORDERING_CORRECTION: ' + o.b1_report_ordering_correction);

  log('--- 2 destination census ---');
  log('  counts=' + JSON.stringify(s['2_destination'].counts));
  log('  backfill_candidates=' + s['2_destination'].backfill_candidate_count +
    ' ambiguous=' + s['2_destination'].ambiguous_legacy_rows.length +
    ' must_remain_blocked=' + s['2_destination'].must_remain_blocked_count +
    ' backfill_performed=' + s['2_destination'].backfill_performed);
  s['2_destination'].samples.forEach(function (x, i) {
    log('  [d' + (i + 1) + '] ' + x.id_ref.masked + ' ' + x.id_ref.hash + ' status=' + x.status +
      ' active=' + x.active + ' type=' + x.destination_type + ' code=' + x.destination_code +
      ' scope_mkt=' + x.scope_marketplace + ' note_present=' + x.note_ref.present);
  });

  log('--- 3 expected arrival census ---');
  log('  exact_persisted_source_exists=' + s['3_expected_arrival'].exact_persisted_source_exists +
    ' with_eta=' + s['3_expected_arrival'].rows_with_persisted_eta +
    ' without_source=' + s['3_expected_arrival'].rows_with_no_persisted_eta_source +
    ' must_remain_blank=' + s['3_expected_arrival'].must_remain_blank_count +
    ' backfill_performed=' + s['3_expected_arrival'].backfill_performed);
  s['3_expected_arrival'].excluded_derivations.forEach(function (x) { log('  EXCLUDED: ' + x); });

  log('--- 4 service census ---');
  log('  by_canonical=' + JSON.stringify(s['4_service'].persisted_by_canonical_service) +
    ' blank=' + s['4_service'].blank_service_rows + ' values_rewritten=' + s['4_service'].values_rewritten);
  log('  sea!==sea_express proof=' + JSON.stringify(s['4_service'].distinctness_proof));
  s['4_service'].live_target.rows.forEach(function (r, i) {
    log('  [t' + (i + 1) + '] ' + r.id_ref.masked + ' persisted=' + r.persisted_service_canonical +
      ' attempted=' + r.attempted_service_canonical + ' same_service=' + r.same_service +
      ' same_identity=' + r.same_identity + ' qty_now=' + r.current_quantity_total +
      ' qty_attempted=' + r.attempted_quantity);
    log('      ' + r.quantity_statement);
  });

  log('--- 5 k4 preview ---');
  log('  classifiable=' + s['5_k4_preview'].classifiable_rows + ' unclassifiable=' + s['5_k4_preview'].unclassifiable_rows +
    ' collisions=' + s['5_k4_preview'].natural_key_collision_count +
    ' rows_written=' + s['5_k4_preview'].rows_written + ' ids_rewritten=' + s['5_k4_preview'].ids_rewritten);
  s['5_k4_preview'].rows.forEach(function (r, i) {
    log('  [k' + (i + 1) + '] ' + r.current_id_ref.masked + ' fam=' + r.identity_family +
      ' dest=' + r.destination_type + ' svc=' + r.canonical_service + ' key=' + r.k4_key_hash +
      ' -> ' + (r.proposed_k4_id_ref.masked || '(none)') + ' classifiable=' + r.classifiable + ' ' + r.reason);
  });
  log('  ' + s['5_k4_preview'].mechanically_safe_reason);

  log('--- 6 fk + quantity ---');
  log('  matched_lines=' + s['6_fk_and_quantity'].matched_lines + ' orphans=' + s['6_fk_and_quantity'].orphan_line_count +
    ' headers_without_lines=' + s['6_fk_and_quantity'].headers_with_no_lines);
  log('  planned_qty before=' + s['6_fk_and_quantity'].planned_qty_total_before +
    ' proposed_after=' + s['6_fk_and_quantity'].planned_qty_total_proposed_after +
    ' unknown_lines=' + s['6_fk_and_quantity'].quantity_unknown_lines);
  log('  ' + s['6_fk_and_quantity'].conservation_verdict);
  s['6_fk_and_quantity'].downstream_references.forEach(function (r) {
    log('  ' + r.table + (r.column ? ('.' + r.column) : '') + ' present=' + r.present + ' rows=' + (r.row_count || 0) +
      ' binds_current_id=' + !!r.binds_to_current_header_id + ' orphan_risk_if_rekeyed=' + (r.orphan_risk_if_rekeyed || 'n/a'));
  });

  log('--- 7 checksum ---');
  log('  ' + d.live_schema_checksum);
  log('  ' + d.checksum_scope);

  log('=== DECISIONS ===');
  log('  schemaAppendSafe=' + d.schemaAppendSafe);
  log('  destinationBackfillSafe=' + d.destinationBackfillSafe);
  log('  expectedArrivalBackfillSafe=' + d.expectedArrivalBackfillSafe);
  log('  k4MigrationSafe=' + d.k4MigrationSafe);
  log('  runtimeWiringReady=' + d.runtimeWiringReady);
  (d.blocking || []).forEach(function (b) { log('  BLOCKING ' + b); });
  log('  DECISION=' + d.decision);
  log('  ' + d.decision_scope);
  log('  ' + d.zero_write_statement);
  return d;
}
