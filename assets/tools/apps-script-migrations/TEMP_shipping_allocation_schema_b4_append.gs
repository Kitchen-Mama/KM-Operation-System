/**
 * TEMP_shipping_allocation_schema_b4_append.gs — F1-7N-FB-4F-B4
 * PASTE · RUN · REMOVE. A migration helper that appends EXACTLY TWO BLANK HEADER CELLS and nothing else.
 *
 *   shipping_allocation_drafts!AI1      = destination_marketplace   (index 34, column 35)
 *   shipping_allocation_draft_lines!AE1 = expected_arrival          (index 30, column 31)
 *
 * Two public entry points, BOTH ARGUMENT-FREE so they can be run straight from the Apps Script Run selector:
 *
 *   TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN()   READ-ONLY. Prints the plan and the confirmation checksum.
 *   TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT()    THE ONLY WRITER. Refuses until a human pastes the checksum
 *                                                  into TEMP_B4_REVIEWED_CHECKSUM_ below.
 *
 * ==============================================================================================================
 * WHY THE CONFIRMATION IS AN EDITED CONSTANT AND NOT AN ARGUMENT
 * ==============================================================================================================
 * The Apps Script Run selector cannot pass arguments, so the established `COMMIT({mode,checksum})` shape of
 * TEMP_migrate_shipping_allocation_ai_lifecycle.gs is not reachable from the toolbar — a user running it from
 * the selector gets the MODE_REQUIRED refusal every time and has to open the editor console anyway. The
 * confirmation therefore lives where the user already is: ONE constant, edited by hand, in the file being run.
 *
 * That keeps the property the argument was protecting. The checksum is RECOMPUTED LIVE at commit time from the
 * database itself, twice — once before the lock and once under it — and must equal the reviewed constant
 * EXACTLY. A reviewed plan that has gone stale cannot authorise anything, because the value that authorised it
 * no longer exists. What it deliberately does NOT do is read the confirmation from Script Properties: a
 * persisted confirmation outlives the intent that recorded it, and this file is meant to be deleted.
 *
 * There is no default, no fallback, no `||`, no argument override and no environment lookup. A blank constant
 * is a refusal. A constant carrying another operation's checksum is a refusal, INCLUDING B2's `fb4fb2-…`
 * diagnostic checksum, which authorises a review and not a write.
 *
 * ==============================================================================================================
 * WHY THIS FILE REFUSES TO RUN AGAINST A PROJECT THAT HAS NOT BEEN SYNCED TO B3
 * ==============================================================================================================
 * Every rule here is READ FROM THE SHIPPED RUNTIME AUTHORITY — SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_,
 * SAD_HEADER_OPTIONAL_TAIL_COLUMNS_, SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_, SAD_LINE_ETA_TAIL_COLUMNS_
 * and sadExactSchemaReason_ — and there is NO local fallback copy of any of them. That is not tidiness, it is
 * the ordering guard.
 *
 * B2 measured, against the runtime's own gate, that the header write gate is POSITIONAL AND EXACT: a column the
 * authority has never heard of is not an inert blank, it is a mismatch at an index, and every allocation read
 * and write fails closed the moment it appears.
 *
 *     drafts 34 + destination_marketplace, PRE-B3 authority  ->  COL_COUNT_35_EXPECTED_30_TO_34
 *     lines  30 + expected_arrival,        PRE-B3 authority  ->  COL_COUNT_31_EXPECTED_30
 *
 * Those symbols exist ONLY in a project that has been synced to F1-7N-FB-4F-B3. So if this file is pasted into
 * a project that has not been, it cannot find its authority and it STOPS — it does not guess, and it does not
 * fall back to a hardcoded list that would let it append the very column that takes the page down. A tool that
 * carries its own copy of the schema is a tool that can disagree with production; this one cannot.
 *
 * ==============================================================================================================
 * WHAT THIS FILE WILL NEVER DO
 * ==============================================================================================================
 * It writes to ROW 1 ONLY. The plan is asserted to contain no cell outside row 1 before the lock is taken, and
 * the commit verifies afterwards that every pre-existing data cell is byte-identical and that every cell under
 * the two new columns is BLANK.
 *
 * It never populates a value. `destination_marketplace` and `expected_arrival` stay blank on all existing rows
 * until an authoritative save supplies them. There is no code path here that reads the plan marketplace, a UI
 * filter, a destination display label, a warehouse code snapshot, a carrier lead time, a shipping method, a
 * creation or update timestamp, the attempted 2026-10-16 payload, or any non-persisted client payload. The only
 * two values it ever writes are the two literal column names, and the commit proves that.
 *
 * It never touches identity or business state: no K2/K3 id is rewritten, no K4 id is minted, no legacy draft is
 * reconciled, no quantity, status or FK is changed, and LEGACY_ROUTE_RECONCILIATION_REQUIRED is not weakened.
 * `sea` and `sea_express` are distinct services and neither is rewritten into the other — no service value is
 * read as a source or written at all, and the commit censuses them before and after to prove it.
 *
 * There is NO automatic delete and NO automatic rollback. Both are refused deliberately, for the same reason
 * the lifecycle migration refuses them: an automatic reversal of a partially applied structural change is a
 * second unreviewed write on top of a failure nobody has looked at yet. What is provided instead is an ordered
 * JOURNAL, recorded BEFORE anything is applied, so a human has an exact record to reverse deliberately.
 */

var TEMP_B4_BUILD_VERSION_ = 'F1-7N-FB-4F-B4';
var TEMP_B4_OPERATION_ = 'FB4F-B4-TWO-COLUMN-APPEND-1';

// The checksum prefix is OPERATION-SPECIFIC. B2's diagnostic prefix is `fb4fb2-1`; this one is `fb4b4-1`, so a
// checksum produced by the review tool is not even shaped like an authorisation to write.
var TEMP_B4_CHECKSUM_PREFIX_ = 'fb4b4-1';

// ==============================================================================================================
// THE ONE LINE A REVIEWER EDITS.
//
// Run TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN(), read every line of the output, and if — and only if — the
// plan is exactly the two header cells you expect, paste its confirmation_checksum between the quotes below and
// run TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT(). Change NOTHING else in this file.
// ==============================================================================================================
var TEMP_B4_REVIEWED_CHECKSUM_ = '';

var TEMP_B4_DRAFTS_ = 'shipping_allocation_drafts';
var TEMP_B4_LINES_ = 'shipping_allocation_draft_lines';

var TEMP_B4_LOCK_TIMEOUT_MS_ = 20000;

// The recorded pre-migration state this plan was reviewed against (F1-7N-FB-4F-B4 task, live run of the B2
// diagnostic). Reported as a COMPARISON, never as a gate on its own: the gates are the runtime authority and
// the checksum. A mismatch here is surfaced loudly so a human can decide whether the world moved.
var TEMP_B4_RECORDED_ = {
  drafts: { header_count: 34, row_count: 4, fingerprint: 'sf:3e83e85c' },
  lines: { header_count: 30, row_count: 6, fingerprint: 'sf:2226df13' },
  expected_after: { drafts_fingerprint: 'sf:870364de', lines_fingerprint: 'sf:122f48c3' },
  b2_checksum: 'fb4fb2-1:42a1b1ed',
  planned_qty_total: 1020, matched_lines: 6, orphan_lines: 0
};

// Written down so the refusal can name them. Nothing in this file reads any of these; the list exists so that a
// reviewer can check the claim by searching for each term and finding it ONLY here.
var TEMP_B4_FORBIDDEN_BACKFILL_SOURCES_ = [
  'plan marketplace scope', 'UI filter', 'destination display label', 'warehouse code snapshot',
  'carrier lead time', 'shipping method', 'creation timestamp', 'update timestamp',
  'attempted 2026-10-16 payload', 'non-persisted client payload'
];

// -------------------------------------------------------------------------------------------------- primitives

function tb4Str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

// Reporting must never be able to destroy a result. A failure to LOG is not a failure to migrate, and an
// exception thrown out of the report would hide what actually happened to the database.
// The ONE place this is deliberately not used is the journal, where a failure to record intent MUST block.
function tb4Log_(o) { try { Logger.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2)); } catch (e) {} }

// The SAME FNV-1a the rest of this stack uses, taken from the runtime rather than reimplemented, so a
// fingerprint printed here is directly comparable with one printed by the B2 diagnostic.
function tb4Hash_(s) {
  if (typeof sadFnv1a_ === 'function') return sadFnv1a_(String(s == null ? '' : s));
  if (typeof epcFnv1a_ === 'function') return epcFnv1a_(String(s == null ? '' : s));
  return null;
}

// The field separators the B2 diagnostic uses. They are CONTROL characters, and deliberately so: joining with a
// printable delimiter lets two different header rows hash to the same string (['a','b'] and ['a|b'] under '|'),
// which is precisely the collision a fingerprint exists to rule out. Written as escapes rather than as the raw
// bytes so they survive a copy-paste and are visible to a reader.
var TEMP_B4_FS_ = '\x01';
var TEMP_B4_RS_ = '\x02';

// BYTE-IDENTICAL to the B2 diagnostic's fingerprint — same separator, same order, same hash — so `sf:3e83e85c`
// here and `sf:3e83e85c` there mean the same header row. Count AND order, because a reordering that preserves
// the column set still moves the value.
function tb4Fingerprint_(headers) {
  var h = (headers || []).slice();
  var d = tb4Hash_(h.length + TEMP_B4_FS_ + h.join(TEMP_B4_FS_));
  return { count: h.length, ordered: h.slice(), digest: d === null ? null : 'sf:' + d };
}

// 1-based column number -> A1 letter. 35 -> AI, 31 -> AE.
function tb4ColLetter_(index1) {
  var s = '', n = Number(index1);
  if (!(n > 0)) return '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

// -------------------------------------------------------------------------------------------------- authority

/**
 * The dependency contract, written out one `typeof` at a time. A dynamic lookup would need eval or a walk of
 * the global object; being explicit means this list reads AS the contract, and `typeof` never invokes anything.
 * There is no fallback for any entry — see the header note on why a local copy would defeat the ordering guard.
 */
function tb4MissingAuthorities_() {
  var missing = [];
  function need(name, present) { if (!present) missing.push(name); }
  need('prodExpectedDbId_', typeof prodExpectedDbId_ === 'function');
  need('sadExactSchemaReason_', typeof sadExactSchemaReason_ === 'function');
  need('sadFnv1a_', typeof sadFnv1a_ === 'function');
  need('SHIPPING_ALLOCATION_DRAFTS_HEADERS_', typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined');
  need('SAD_LIFECYCLE_TAIL_COLUMNS_', typeof SAD_LIFECYCLE_TAIL_COLUMNS_ !== 'undefined');
  need('SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_', typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ !== 'undefined');
  // The four B3 symbols. Their absence IS the "not synced to B3 yet" signal.
  need('SAD_ROUTE_IDENTITY_TAIL_COLUMNS_', typeof SAD_ROUTE_IDENTITY_TAIL_COLUMNS_ !== 'undefined');
  need('SAD_HEADER_OPTIONAL_TAIL_COLUMNS_', typeof SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ !== 'undefined');
  need('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_', typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ !== 'undefined');
  need('SAD_LINE_ETA_TAIL_COLUMNS_', typeof SAD_LINE_ETA_TAIL_COLUMNS_ !== 'undefined');
  need('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_', typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ !== 'undefined');
  need('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_', typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ !== 'undefined');
  return missing;
}

/**
 * The two frozen decisions, DERIVED from the runtime authority rather than restated beside it, plus the frozen
 * position each one was reviewed at. Deriving and then ASSERTING is the point: if a future edit moves a column
 * in the authority, the assertion fails and this tool refuses, instead of appending a name at a position
 * production no longer expects.
 */
function tb4Spec_() {
  return [
    {
      key: 'header',
      table: TEMP_B4_DRAFTS_,
      column: 'destination_marketplace',
      frozen_index0: 34,
      frozen_a1: 'AI1',
      pre_authority: SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_,
      full_authority: SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_,
      optional_tail: SAD_HEADER_OPTIONAL_TAIL_COLUMNS_,
      // The lifecycle tail must PHYSICALLY be in place first: destination_marketplace lives at 34, which only
      // exists once 30..33 do. An incomplete tail is a refusal, not something to append around.
      must_precede: SAD_LIFECYCLE_TAIL_COLUMNS_,
      must_precede_base: SHIPPING_ALLOCATION_DRAFTS_HEADERS_.length
    },
    {
      key: 'line',
      table: TEMP_B4_LINES_,
      column: 'expected_arrival',
      frozen_index0: 30,
      frozen_a1: 'AE1',
      pre_authority: SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_,
      full_authority: SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_,
      optional_tail: SAD_LINE_ETA_TAIL_COLUMNS_,
      must_precede: [],
      must_precede_base: SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.length
    }
  ];
}

// Every way the frozen decision and the live authority could have drifted apart, checked before anything reads
// the database. A failure here is a code problem, not a data problem, and it must never become a write.
function tb4SpecDisagreements_(spec) {
  var bad = [];
  spec.forEach(function (s) {
    var full = s.full_authority || [], pre = s.pre_authority || [];
    if (full.length !== pre.length + 1) {
      bad.push('SPEC_DISAGREES_WITH_AUTHORITY:' + s.table + ':FULL_' + full.length + '_IS_NOT_PRE_' + pre.length + '_PLUS_1');
    }
    if (s.frozen_index0 !== pre.length) {
      bad.push('SPEC_DISAGREES_WITH_AUTHORITY:' + s.table + ':FROZEN_INDEX_' + s.frozen_index0 + '_IS_NOT_PRE_LENGTH_' + pre.length);
    }
    if (full[s.frozen_index0] !== s.column) {
      bad.push('SPEC_DISAGREES_WITH_AUTHORITY:' + s.table + ':AUTHORITY_INDEX_' + s.frozen_index0 +
        '_IS_' + (full[s.frozen_index0] || '(absent)') + '_EXPECTED_' + s.column);
    }
    if (tb4ColLetter_(s.frozen_index0 + 1) + '1' !== s.frozen_a1) {
      bad.push('SPEC_DISAGREES_WITH_AUTHORITY:' + s.table + ':A1_' + tb4ColLetter_(s.frozen_index0 + 1) + '1_IS_NOT_' + s.frozen_a1);
    }
    for (var i = 0; i < pre.length; i++) {
      if (full[i] !== pre[i]) {
        bad.push('SPEC_DISAGREES_WITH_AUTHORITY:' + s.table + ':FULL_IS_NOT_A_SUPERSET_AT_' + i);
        break;
      }
    }
  });
  return bad;
}

/**
 * Ask the PRODUCTION gate whether it accepts a header row, by handing it a read-only stub that exposes exactly
 * the one call it makes. Copying the rule into this file would produce a second implementation, and a second
 * implementation is a second answer waiting to disagree with the first.
 * Returns '' when the gate accepts.
 */
function tb4HeaderProbe_(headerRow) {
  var row = (headerRow || []).slice();
  return { getDataRange: function () { return { getValues: function () { return [row.slice()]; } }; } };
}
function tb4GateReason_(headerRow, spec) {
  return sadExactSchemaReason_(tb4HeaderProbe_(headerRow), spec.full_authority, spec.optional_tail);
}

// ------------------------------------------------------------------------------------------------------ read

// Read a table as FACTS. A missing sheet or a drifted header must arrive here as something reportable, never as
// a thrown token that loses the rest of the diagnosis.
function tb4ReadTable_(ss, name) {
  var sh = null;
  try { sh = ss.getSheetByName(name); } catch (e) { sh = null; }
  if (!sh) {
    return { name: name, present: false, sheet: null, headers: [], rows: [], values: [],
      row_count: 0, duplicates: [], ci_collisions: [], blank_indexes: [] };
  }
  var data = sh.getDataRange().getValues();
  var raw = (data && data.length ? data[0] : []).map(function (h) { return tb4Str_(h); });
  // Trailing blanks are Google Sheets' default empty grid, not schema. INTERVENING blanks are schema damage and
  // are kept, reported and refused.
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

  var rows = [], values = [];
  for (var r = 1; r < (data ? data.length : 0); r++) {
    var o = {}, allBlank = true;
    for (var c = 0; c < raw.length; c++) {
      if (!raw[c]) continue;
      if (!o.hasOwnProperty(raw[c])) o[raw[c]] = data[r][c];   // FIRST wins; a duplicate is reported, not merged
      if (tb4Str_(data[r][c]) !== '') allBlank = false;
    }
    if (!allBlank) { o.__row = r + 1; rows.push(o); values.push(data[r]); }
  }
  // `row_count` counts POPULATED rows and is what the census and the report talk about. `total_rows` is the raw
  // grid extent below the header, and it is what the byte-equivalence snapshot must use: a positional range
  // built from a filtered count would silently compare the wrong rows the moment a blank row sits between two
  // populated ones.
  return { name: name, present: true, sheet: sh, headers: raw, rows: rows, values: values,
    row_count: rows.length, total_rows: Math.max(0, (data ? data.length : 0) - 1),
    duplicates: dup, ci_collisions: ci, blank_indexes: blanks };
}

// ------------------------------------------------------------------------------------------- per-table analysis

/**
 * Everything this tool knows about one table, and every reason it might refuse to touch it.
 *
 * The refusal order is deliberate. Structural damage (duplicate, case collision, blank hole) is reported before
 * position, because a positional message computed over a damaged row would be misleading. The TARGET's own
 * position is then checked before the generic order comparison, so "destination_marketplace is at 30" says that
 * rather than the true-but-unhelpful "index 30 should have been generation_run_id".
 */
function tb4AnalyzeTable_(ss, spec) {
  var t = tb4ReadTable_(ss, spec.table);
  var out = {
    table: spec.table, column: spec.column, present: t.present,
    headers: t.headers.slice(), header_count: t.headers.length, row_count: t.row_count,
    duplicates: t.duplicates, ci_collisions: t.ci_collisions, blank_indexes: t.blank_indexes,
    first_order_drift_index: -1,
    fingerprint_pre: tb4Fingerprint_(t.headers), fingerprint_post: null,
    gate_pre: null, gate_post: null,
    expected_pre_count: spec.pre_authority.length, expected_post_count: spec.full_authority.length,
    target_index: -1, state: null, proposed_write: null, blocking: [], __table: t
  };

  if (!t.present) {
    out.state = 'REFUSED';
    out.blocking.push('SHEET_MISSING:' + spec.table);
    return out;
  }

  t.duplicates.forEach(function (d) {
    out.blocking.push('DUPLICATE_COLUMN:' + d.column + '@' + d.first_index + '_AND_' + d.repeat_index);
  });
  t.ci_collisions.forEach(function (c) {
    out.blocking.push('CASE_INSENSITIVE_COLLISION:' + c.first + '@' + c.first_index + '_VS_' + c.second + '@' + c.second_index);
  });
  t.blank_indexes.forEach(function (i) { out.blocking.push('BLANK_HEADER_AT_INDEX:' + i); });

  // The lifecycle tail must already be in place, in order, before a column can be appended past it.
  (spec.must_precede || []).forEach(function (c, i) {
    var want = spec.must_precede_base + i;
    var at = t.headers.indexOf(c);
    if (at === -1) out.blocking.push('LIFECYCLE_TAIL_INCOMPLETE:MISSING_' + c);
    else if (at !== want) out.blocking.push('LIFECYCLE_TAIL_INCOMPLETE:' + c + '_AT_' + at + '_EXPECTED_' + want);
  });

  // The target's own position.
  var at = t.headers.indexOf(spec.column);
  out.target_index = at;
  if (at !== -1 && at !== spec.frozen_index0) {
    out.blocking.push('TARGET_AT_WRONG_INDEX:' + spec.column + '@' + at + '_EXPECTED_' + spec.frozen_index0);
  }

  // Generic positional comparison against the FULL authority. This one rule refuses an unknown extra column, a
  // renamed column, a reordered column and a 36th column, without four separate checks that could disagree.
  for (var i = 0; i < t.headers.length; i++) {
    if (i >= spec.full_authority.length || t.headers[i] !== spec.full_authority[i]) {
      out.first_order_drift_index = i;
      out.blocking.push('ORDER_DRIFT_AT_INDEX:' + i + '_IS_' + (t.headers[i] || '(blank)') +
        '_EXPECTED_' + (spec.full_authority[i] || '(nothing — beyond the authority)'));
      break;
    }
  }

  // Length must be exactly the reviewed PRE state or exactly the reviewed POST state. Anything between or
  // beyond is a schema this plan was not reviewed against.
  if (t.headers.length !== spec.pre_authority.length && t.headers.length !== spec.full_authority.length) {
    out.blocking.push('COL_COUNT_' + t.headers.length + '_EXPECTED_' +
      spec.pre_authority.length + '_OR_' + spec.full_authority.length);
  }

  // The runtime gate must already accept the live schema. If it does not, this is not a table to append to.
  out.gate_pre = tb4GateReason_(t.headers, spec);
  if (out.gate_pre !== '') out.blocking.push('RUNTIME_GATE_REJECTS_LIVE:' + out.gate_pre);

  if (out.blocking.length) { out.state = 'REFUSED'; return out; }

  if (at === spec.frozen_index0) {
    out.state = 'ALREADY_PRESENT';
    out.fingerprint_post = out.fingerprint_pre;
    out.gate_post = out.gate_pre;
    return out;
  }

  // Nothing to refuse and the column is absent: propose the single header cell.
  var proposed = t.headers.slice();
  proposed[spec.frozen_index0] = spec.column;
  out.gate_post = tb4GateReason_(proposed, spec);
  if (out.gate_post !== '') {
    out.state = 'REFUSED';
    out.blocking.push('RUNTIME_GATE_REJECTS_PROPOSED:' + out.gate_post);
    return out;
  }
  out.fingerprint_post = tb4Fingerprint_(proposed);
  out.state = 'APPEND';
  out.proposed_write = {
    kind: 'ADD_COLUMN', table: spec.table, row: 1, col: spec.frozen_index0 + 1,
    a1: spec.table + '!' + spec.frozen_a1, column: spec.column, value: spec.column,
    at_index0: spec.frozen_index0, pre_header_count: t.headers.length, post_header_count: proposed.length
  };
  return out;
}

// ---------------------------------------------------------------------------------- quantity / FK / service census

/**
 * The invariants this migration promises not to disturb, measured rather than asserted. Included in the
 * checksum so that a plan reviewed against one data state cannot be committed against another, and recomputed
 * after the write so "no row changed" is PROVEN rather than claimed.
 */
function tb4Census_(H, L) {
  var ids = {};
  (H.rows || []).forEach(function (r) { var k = tb4Str_(r.allocation_draft_id); if (k) ids[k] = 1; });
  var qty = 0, qtyUnknown = 0, matched = 0, orphans = 0, services = {};
  (L.rows || []).forEach(function (r) {
    var s = tb4Str_(r.planned_qty);
    if (s === '') { qtyUnknown++; }
    else {
      var n = Number(s.replace(/,/g, ''));
      if (isFinite(n)) qty += n; else qtyUnknown++;
    }
    var fk = tb4Str_(r.allocation_draft_id);
    if (fk && ids[fk]) matched++; else orphans++;
  });
  // Service values are censused ONLY to prove none of them moved. `sea` and `sea_express` are separate
  // services with separate identities; nothing here reads one as a prefix of the other.
  (H.rows || []).forEach(function (r) {
    var m = tb4Str_(r.recommended_shipping_method);
    services[m || '(blank)'] = (services[m || '(blank)'] || 0) + 1;
  });
  var idHash = tb4Hash_((H.rows || []).map(function (r) { return tb4Str_(r.allocation_draft_id); }).join(TEMP_B4_FS_) + TEMP_B4_RS_ +
    (L.rows || []).map(function (r) {
      return tb4Str_(r.allocation_draft_line_id) + TEMP_B4_FS_ + tb4Str_(r.allocation_draft_id);
    }).join(TEMP_B4_RS_));
  return {
    header_rows: H.row_count, line_rows: L.row_count,
    planned_qty_total: qty, planned_qty_unknown_cells: qtyUnknown,
    matched_lines: matched, orphan_lines: orphans,
    service_counts: services, id_and_fk_digest: idHash
  };
}

function tb4CensusSignature_(c) {
  return [c.header_rows, c.line_rows, c.planned_qty_total, c.planned_qty_unknown_cells,
    c.matched_lines, c.orphan_lines, c.id_and_fk_digest,
    Object.keys(c.service_counts).sort().map(function (k) { return k + '=' + c.service_counts[k]; }).join(TEMP_B4_FS_)
  ].join(TEMP_B4_RS_);
}

// ------------------------------------------------------------------------------------------------------ plan

function tb4OpenDb_() {
  // The exact-id target guard. A migration that ran against the wrong spreadsheet would be unrecoverable, so
  // the id comes from the shipped production-safety adapter and never from a literal in this file.
  return SpreadsheetApp.openById(prodExpectedDbId_());
}

/**
 * The whole decision, in one place, computed twice by COMMIT — once before the lock and once under it.
 */
function tb4BuildPlan_(ss) {
  var plan = {
    operation: TEMP_B4_OPERATION_, build_version: TEMP_B4_BUILD_VERSION_,
    state: null, tables: [], writes: [], blocking_reasons: [],
    census: null, confirmation_checksum: null
  };

  var missing = tb4MissingAuthorities_();
  if (missing.length) {
    plan.state = 'REFUSED';
    plan.blocking_reasons.push('AUTHORITY_NOT_LOADED:' + missing.join(',') +
      ' — this project has not been synced to F1-7N-FB-4F-B3. Appending either column before the runtime knows ' +
      'it makes every allocation read and write fail closed. Sync 16_/69_/63_ first.');
    return plan;
  }

  var spec = tb4Spec_();
  var disagree = tb4SpecDisagreements_(spec);
  if (disagree.length) {
    plan.state = 'REFUSED';
    plan.blocking_reasons = disagree.slice();
    return plan;
  }

  var analyses = spec.map(function (s) { return tb4AnalyzeTable_(ss, s); });
  plan.tables = analyses;
  analyses.forEach(function (a) {
    a.blocking.forEach(function (b) { plan.blocking_reasons.push(a.table + ': ' + b); });
    if (a.proposed_write) plan.writes.push(a.proposed_write);
  });

  // Nothing outside row 1 may EVER appear in this plan. Asserted rather than assumed, before the lock.
  plan.writes.forEach(function (w) {
    if (w.row !== 1) plan.blocking_reasons.push('DATA_ROW_WRITE_IN_PLAN:' + w.a1);
    if (w.kind !== 'ADD_COLUMN') plan.blocking_reasons.push('NON_STRUCTURAL_WRITE_IN_PLAN:' + w.a1);
    if (w.value !== w.column) plan.blocking_reasons.push('WRITE_VALUE_IS_NOT_THE_COLUMN_NAME:' + w.a1);
  });
  if (plan.writes.length > 2) plan.blocking_reasons.push('WRITE_PLAN_TOO_LARGE:' + plan.writes.length);

  var H = analyses[0].__table, L = analyses[1].__table;
  if (H.present && L.present) plan.census = tb4Census_(H, L);

  // A REFUSAL PROPOSES NOTHING. The two tables are analysed independently, so a clean line table will happily
  // produce a write while the header table is refusing — and a plan that still lists a write is a plan someone
  // can approve. Refusal is about the operation, not about one of its halves.
  if (plan.blocking_reasons.length) { plan.state = 'REFUSED'; plan.writes = []; return plan; }

  plan.state = plan.writes.length === 0 ? 'NOTHING_TO_DO'
    : (plan.writes.length === 2 ? 'READY_TO_APPEND' : 'READY_TO_APPEND_PARTIAL');

  // The checksum covers everything that would make a reviewed plan stale: both header rows IN ORDER, both row
  // counts, the quantity/FK/service census, the exact write plan, and the operation name. A checksum from
  // another operation, another data state or another plan shape therefore cannot authorise this one.
  var writeSig = plan.writes.map(function (w) { return w.a1 + '=' + w.value; }).join(';');
  plan.confirmation_checksum = TEMP_B4_CHECKSUM_PREFIX_ + ':' + tb4Hash_([
    TEMP_B4_OPERATION_,
    analyses[0].fingerprint_pre.digest, analyses[0].row_count,
    analyses[1].fingerprint_pre.digest, analyses[1].row_count,
    tb4CensusSignature_(plan.census),
    plan.state, writeSig
  ].join(TEMP_B4_RS_));
  return plan;
}

// ---------------------------------------------------------------------------------------------------- DRY RUN

/**
 * READ-ONLY. Zero writes on every path, including every refusal path.
 */
function TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN() {
  var out = {
    mode: 'DRY_RUN (READ-ONLY)', read_only: true,
    build_version: TEMP_B4_BUILD_VERSION_, operation: TEMP_B4_OPERATION_,
    tables: [], decision: null, blocking_reasons: [],
    proposed_writes: [], confirmation_checksum: null,
    reviewed_checksum_constant: tb4Str_(TEMP_B4_REVIEWED_CHECKSUM_) === '' ? '(blank — COMMIT will refuse)' : tb4Str_(TEMP_B4_REVIEWED_CHECKSUM_),
    census: null, recorded_comparison: null, backfill: null,
    DB_WRITES: 0, COLUMNS_APPENDED: 0, ROWS_CHANGED: 0, next_action: null
  };

  var ss = null;
  try { ss = tb4OpenDb_(); } catch (e) { ss = null; }
  if (!ss) {
    out.decision = 'STOP';
    out.blocking_reasons.push('DB_NOT_REACHABLE — the configured production database could not be opened.');
    tb4Log_(out);
    return out;
  }

  var plan = tb4BuildPlan_(ss);

  // A LIVE RE-READ. If a header row moved while this ran, every verdict above describes a sheet that no longer
  // exists, and the only honest output is a refusal.
  if (plan.state !== 'REFUSED' || plan.tables.length) {
    var again = tb4BuildPlan_(ss);
    var stable = again.state === plan.state &&
      String(again.confirmation_checksum) === String(plan.confirmation_checksum) &&
      (again.tables || []).length === (plan.tables || []).length &&
      (again.tables || []).every(function (a, i) {
        return a.fingerprint_pre.digest === plan.tables[i].fingerprint_pre.digest;
      });
    if (!stable) {
      out.decision = 'STOP';
      out.blocking_reasons.push('LIVE_SCHEMA_CHANGED — a target table changed between two reads in the same run. Nothing was read that can be trusted, and nothing was written.');
      tb4Log_(out);
      return out;
    }
  }

  out.tables = (plan.tables || []).map(function (a) {
    return {
      table: a.table, target_column: a.column, present: a.present,
      current_header_count: a.header_count, current_row_count: a.row_count,
      current_headers_ordered: a.headers,
      expected_pre_count: a.expected_pre_count, expected_post_count: a.expected_post_count,
      fingerprint_pre: a.fingerprint_pre ? a.fingerprint_pre.digest : null,
      fingerprint_post_proposed: a.fingerprint_post ? a.fingerprint_post.digest : null,
      duplicate_columns: a.duplicates, case_insensitive_collisions: a.ci_collisions,
      blank_header_indexes: a.blank_indexes, first_order_drift_index: a.first_order_drift_index,
      target_index_live: a.target_index,
      runtime_gate_before: a.gate_pre === '' ? 'ACCEPTED' : ('REJECTED: ' + a.gate_pre),
      runtime_gate_after_proposed: a.gate_post === null ? '(not evaluated)' : (a.gate_post === '' ? 'ACCEPTED' : ('REJECTED: ' + a.gate_post)),
      state: a.state, blocking: a.blocking
    };
  });
  out.proposed_writes = (plan.writes || []).map(function (w) {
    return { kind: w.kind, cell: w.a1, value: w.value, at_index0: w.at_index0,
      header_count_before: w.pre_header_count, header_count_after: w.post_header_count };
  });
  out.blocking_reasons = plan.blocking_reasons.slice();
  out.census = plan.census;
  out.confirmation_checksum = plan.confirmation_checksum;

  if (plan.census) {
    var R = TEMP_B4_RECORDED_;
    out.recorded_comparison = {
      drafts_fingerprint_matches_recorded: out.tables[0] && out.tables[0].fingerprint_pre === R.drafts.fingerprint,
      lines_fingerprint_matches_recorded: out.tables[1] && out.tables[1].fingerprint_pre === R.lines.fingerprint,
      drafts_post_matches_expected: !out.tables[0] || out.tables[0].fingerprint_post_proposed === null ||
        out.tables[0].fingerprint_post_proposed === R.expected_after.drafts_fingerprint,
      lines_post_matches_expected: !out.tables[1] || out.tables[1].fingerprint_post_proposed === null ||
        out.tables[1].fingerprint_post_proposed === R.expected_after.lines_fingerprint,
      planned_qty_total_matches_recorded: plan.census.planned_qty_total === R.planned_qty_total,
      matched_lines_matches_recorded: plan.census.matched_lines === R.matched_lines,
      orphan_lines_matches_recorded: plan.census.orphan_lines === R.orphan_lines,
      recorded: R
    };
  }

  out.backfill = {
    rows_to_populate: 0,
    values_written_below_row_1: 0,
    statement: 'No data row is read as a source and no data row is written. Both new columns stay BLANK on every ' +
      'existing row until an authoritative save supplies a value.',
    forbidden_sources_none_of_which_are_consulted: TEMP_B4_FORBIDDEN_BACKFILL_SOURCES_.slice()
  };

  if (plan.state === 'REFUSED') {
    out.decision = 'STOP';
    out.next_action = 'Resolve every blocking reason above. COMMIT would refuse with zero writes.';
  } else if (plan.state === 'NOTHING_TO_DO') {
    out.decision = 'NOTHING_TO_DO';
    out.next_action = 'Both columns are already present at their canonical indexes. Nothing to do; remove this file.';
  } else {
    out.decision = 'MECHANICALLY_SAFE_TO_APPEND';
    out.next_action = 'Review every line above. If the plan is exactly the ' + plan.writes.length +
      ' header cell(s) shown, set TEMP_B4_REVIEWED_CHECKSUM_ = \'' + plan.confirmation_checksum +
      '\' in this file, save, then run TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT().';
  }
  out.footer = 'DB_WRITES=0 · COLUMNS_APPENDED=0 · ROWS_CHANGED=0 · BACKFILLS=0 · IDS_CREATED=0 · ' +
    'STATUS_TRANSITIONS=0 · PROPERTY_WRITES=0 · DRIVE_WRITES=0 · EMAILS=0';
  tb4Log_(out);
  return out;
}

// ----------------------------------------------------------------------------------------------------- COMMIT

/**
 * The ONLY writer. Argument-free; the confirmation is TEMP_B4_REVIEWED_CHECKSUM_, edited by a human.
 *
 * Order is the safety property: check the constant, read, recompute, compare, lock, RE-READ UNDER THE LOCK,
 * recompute and compare AGAIN, snapshot, journal, write one cell at a time verifying each before attempting the
 * next, read back, verify, release in `finally`.
 */
function TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT() {
  var result = {
    mode: 'COMMIT', build_version: TEMP_B4_BUILD_VERSION_, operation: TEMP_B4_OPERATION_,
    committed: false, state: null, reviewed_checksum: null, live_checksum: null,
    journal: [], writes_applied: [], verification: null, blocking_reasons: [],
    DB_WRITES: 0, COLUMNS_APPENDED: 0, ROWS_CHANGED: 0
  };

  function done() { tb4Log_(result); return result; }

  // (1) THE REVIEWED CONSTANT. No argument, no default, no fallback, no Script Property.
  var reviewed = tb4Str_(TEMP_B4_REVIEWED_CHECKSUM_);
  result.reviewed_checksum = reviewed || '(blank)';
  if (reviewed === '') {
    result.state = 'REFUSED';
    result.blocking_reasons.push('REVIEWED_CHECKSUM_REQUIRED — TEMP_B4_REVIEWED_CHECKSUM_ is blank. Run ' +
      'TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN(), review every line, paste its confirmation_checksum into ' +
      'that constant, and run this again. Nothing was written.');
    return done();
  }
  if (reviewed.indexOf(TEMP_B4_CHECKSUM_PREFIX_ + ':') !== 0) {
    result.state = 'REFUSED';
    result.blocking_reasons.push('REVIEWED_CHECKSUM_FROM_ANOTHER_OPERATION — "' + reviewed + '" is not a ' +
      TEMP_B4_CHECKSUM_PREFIX_ + ' checksum. A checksum produced by another tool (the B2 diagnostic prints ' +
      '"fb4fb2-…") authorises a review, not a write. Nothing was written.');
    return done();
  }

  var ss = null;
  try { ss = tb4OpenDb_(); } catch (e) { ss = null; }
  if (!ss) {
    result.state = 'REFUSED';
    result.blocking_reasons.push('DB_NOT_REACHABLE — the configured production database could not be opened. Nothing was written.');
    return done();
  }

  // (2)(3) read, recompute, compare — all BEFORE any lock is taken.
  var pre = tb4BuildPlan_(ss);
  result.live_checksum = pre.confirmation_checksum;
  result.state = pre.state;
  if (pre.state === 'REFUSED') {
    result.blocking_reasons = pre.blocking_reasons.slice();
    result.blocking_reasons.push('REFUSED — the plan is not safe. Nothing was written.');
    return done();
  }
  if (pre.state === 'NOTHING_TO_DO') {
    // Idempotent replay. Both columns already sit at their canonical indexes; there is nothing to authorise.
    result.committed = true;
    result.verification = { already_complete: true,
      drafts_fingerprint: pre.tables[0].fingerprint_pre.digest,
      lines_fingerprint: pre.tables[1].fingerprint_pre.digest };
    result.blocking_reasons.push('NOTHING_TO_DO — both columns are already present at their canonical indexes. ' +
      'Zero additional writes, zero rows modified, no duplicate column created.');
    return done();
  }
  if (pre.confirmation_checksum !== reviewed) {
    result.state = 'REFUSED';
    result.blocking_reasons.push('CHECKSUM_MISMATCH — the database no longer matches the dry run that produced "' +
      reviewed + '". The live checksum is "' + pre.confirmation_checksum + '". Re-run the dry run, review it ' +
      'again, and paste the new value. Nothing was written.');
    return done();
  }

  // (4) one short lock.
  var lock = null;
  try { lock = LockService.getScriptLock(); } catch (e) { lock = null; }
  if (!lock || !lock.tryLock(TEMP_B4_LOCK_TIMEOUT_MS_)) {
    result.state = 'REFUSED';
    result.blocking_reasons.push('LOCK_UNAVAILABLE — could not acquire the script lock; zero columns appended, zero rows written.');
    return done();
  }

  try {
    // (5) re-read and recompute UNDER the lock. Between the match above and the lock, another writer may have moved.
    var post = tb4BuildPlan_(ss);
    result.state = post.state;
    if (post.state === 'REFUSED') {
      result.blocking_reasons = post.blocking_reasons.slice();
      result.blocking_reasons.push('REFUSED_UNDER_LOCK — nothing was written.');
      return result;
    }
    if (post.state === 'NOTHING_TO_DO') {
      result.committed = true;
      result.blocking_reasons.push('NOTHING_TO_DO_UNDER_LOCK — another run completed the append. Zero additional writes.');
      return result;
    }
    if (post.confirmation_checksum !== reviewed) {
      result.state = 'REFUSED';
      result.blocking_reasons.push('CHECKSUM_MISMATCH_UNDER_LOCK — the database changed between confirmation and ' +
        'the lock. The live checksum is "' + post.confirmation_checksum + '". Nothing was written.');
      return result;
    }

    var spec = tb4Spec_();
    var A = post.tables;
    var censusBefore = post.census;

    // (11-prep) capture EVERY pre-existing data cell over the PRE column range of both tables, so
    // byte-equivalence can be PROVEN afterwards rather than assumed.
    var snapshots = A.map(function (a) {
      var t = a.__table;
      if (!t.total_rows || !a.header_count) return { rows: 0, cols: 0, values: [] };
      var v = t.sheet.getRange(2, 1, t.total_rows, a.header_count).getValues()
        .map(function (r) { return r.map(function (x) { return String(x); }); });
      return { rows: t.total_rows, cols: a.header_count, values: v };
    });

    // (6) JOURNAL FIRST — every intended change recorded, in order, BEFORE any of them is applied. If the
    // journal cannot be written, nothing is applied: an unjournalled structural change is exactly the thing
    // there is no automatic rollback for.
    var journalOk = true;
    try {
      post.writes.forEach(function (w) {
        result.journal.push({
          seq: result.journal.length + 1, kind: w.kind, table: w.table, cell: w.a1,
          row: w.row, col: w.col, column: w.column, value: w.value, at_index0: w.at_index0,
          applied: false, verified: false
        });
      });
      if (result.journal.length !== post.writes.length) journalOk = false;
      Logger.log('B4 JOURNAL (intent, before any write): ' + JSON.stringify(result.journal));
    } catch (eJ) {
      journalOk = false;
      result.blocking_reasons.push('JOURNAL_EXCEPTION: ' + String(eJ && eJ.message || eJ));
    }
    if (!journalOk) {
      result.state = 'REFUSED';
      result.blocking_reasons.push('JOURNAL_WRITE_FAILED — the intended changes could not be journalled, so none ' +
        'of them was applied. Zero columns appended, zero rows written.');
      return result;
    }

    // (7) apply ONE header cell at a time, verifying each before attempting the next. A second write on top of
    // an unverified first would turn one recoverable failure into two.
    var failed = null;
    for (var k = 0; k < post.writes.length; k++) {
      var w = post.writes[k];
      var j = result.journal[k];
      // Resolve the sheet from the write's OWN table name. Indexing the analyses by the write's position would
      // be right only while both writes are outstanding: in a partial run — one column already appended — the
      // single remaining write would be applied to the wrong sheet, at the right column number.
      var a = null;
      for (var q = 0; q < A.length; q++) if (A[q].table === w.table) { a = A[q]; break; }
      if (!a || !a.__table || !a.__table.sheet) {
        j.applied = false; j.verified = false;
        failed = 'WRITE_TARGET_UNRESOLVED:' + w.a1;
        break;
      }
      var sh = a.__table.sheet;
      try {
        if (sh.getMaxColumns() < w.col) sh.insertColumnsAfter(sh.getMaxColumns(), w.col - sh.getMaxColumns());
        sh.getRange(w.row, w.col).setValue(w.value);
        SpreadsheetApp.flush();
        j.applied = true;
        var readBack = tb4Str_(sh.getRange(w.row, w.col).getValue());
        if (readBack !== w.value) {
          j.verified = false;
          failed = 'WRITE_VERIFICATION_FAILED:' + w.a1 + '_READ_BACK_' + (readBack || '(blank)') + '_EXPECTED_' + w.value;
          break;
        }
        j.verified = true;
        result.DB_WRITES++;
        result.COLUMNS_APPENDED++;
        result.writes_applied.push({ cell: w.a1, value: w.value, at_index0: w.at_index0 });
      } catch (eW) {
        j.applied = false; j.verified = false;
        failed = 'WRITE_FAILED:' + w.a1 + ':' + String(eW && eW.message || eW);
        break;
      }
    }

    if (failed) {
      result.state = 'FAILED';
      result.committed = false;
      result.blocking_reasons.push(failed);
      result.blocking_reasons.push('PARTIAL_OR_NO_STRUCTURAL_CHANGE — ' + result.COLUMNS_APPENDED + ' of ' +
        post.writes.length + ' header cell(s) were applied and verified. NO automatic rollback was performed and ' +
        'no data row was touched. Use `journal` to see exactly what was attempted, in order, and reverse it ' +
        'deliberately if you choose to.');
      return result;
    }

    // (8)(9) read back and verify: exact final header order, both runtime gates, byte-equivalence of every
    // pre-existing data cell, and BLANK in every cell of each new column.
    var verify = { tables: [], preexisting_cells_compared: 0, preexisting_cell_mismatches: [],
      new_column_non_blank_cells: [], census_before: censusBefore, census_after: null, census_unchanged: null };

    var afterTables = spec.map(function (s) { return tb4ReadTable_(ss, s.table); });
    afterTables.forEach(function (t, i) {
      var s = spec[i], a = A[i];
      var exact = t.headers.length === s.full_authority.length &&
        t.headers.every(function (h, ix) { return h === s.full_authority[ix]; });
      var gate = tb4GateReason_(t.headers, s);
      var fp = tb4Fingerprint_(t.headers);
      verify.tables.push({
        table: s.table, header_count: t.headers.length, header_order_exact: exact,
        header_order: t.headers, fingerprint_after: fp.digest,
        fingerprint_after_matches_expected: fp.digest === (i === 0
          ? TEMP_B4_RECORDED_.expected_after.drafts_fingerprint
          : TEMP_B4_RECORDED_.expected_after.lines_fingerprint),
        runtime_gate_after: gate === '' ? 'ACCEPTED' : ('REJECTED: ' + gate),
        row_count: t.row_count
      });

      // every pre-existing cell, byte for byte
      var snap = snapshots[i];
      if (snap.rows && snap.cols) {
        var now = t.sheet.getRange(2, 1, snap.rows, snap.cols).getValues()
          .map(function (r) { return r.map(function (x) { return String(x); }); });
        for (var r0 = 0; r0 < snap.rows; r0++) {
          for (var c0 = 0; c0 < snap.cols; c0++) {
            verify.preexisting_cells_compared++;
            if (snap.values[r0][c0] !== now[r0][c0]) {
              verify.preexisting_cell_mismatches.push({ table: s.table, row: r0 + 2, column: a.headers[c0],
                before_hash: tb4Hash_(snap.values[r0][c0]), after_hash: tb4Hash_(now[r0][c0]) });
            }
          }
        }
      }

      // the new column must be BLANK all the way down
      if (t.total_rows) {
        var col = t.sheet.getRange(2, s.frozen_index0 + 1, t.total_rows, 1).getValues();
        col.forEach(function (row, ix) {
          if (tb4Str_(row[0]) !== '') {
            verify.new_column_non_blank_cells.push({ table: s.table, row: ix + 2, column: s.column });
          }
        });
      }
    });

    verify.census_after = tb4Census_(afterTables[0], afterTables[1]);
    verify.census_unchanged = tb4CensusSignature_(verify.census_after) === tb4CensusSignature_(censusBefore);
    result.verification = verify;
    result.ROWS_CHANGED = verify.preexisting_cell_mismatches.length;

    result.committed = verify.tables.every(function (t) { return t.header_order_exact && t.runtime_gate_after === 'ACCEPTED'; }) &&
      verify.preexisting_cell_mismatches.length === 0 &&
      verify.new_column_non_blank_cells.length === 0 &&
      verify.census_unchanged === true;
    result.state = result.committed ? 'COMMITTED' : 'FAILED';
    if (!result.committed) {
      result.blocking_reasons.push('POST_WRITE_VERIFICATION_FAILED — see `verification`. The structural change ' +
        'may be applied; NO automatic rollback was performed. Use `journal` to review exactly what was written.');
    }
    result.footer = 'ROWS_CHANGED=' + result.ROWS_CHANGED + ' · BACKFILLS=0 · IDS_CREATED=0 · K4_IDS_CREATED=0 · ' +
      'STATUS_TRANSITIONS=0 · FK_CHANGES=0 · SERVICE_REWRITES=0 · PROPERTY_WRITES=0 · DRIVE_WRITES=0 · EMAILS=0 · ROWS_DELETED=0';
    return result;
  } catch (e) {
    result.state = 'FAILED';
    result.blocking_reasons.push('EXCEPTION: ' + String(e && e.message || e));
    return result;
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
    tb4Log_(result);
  }
}
