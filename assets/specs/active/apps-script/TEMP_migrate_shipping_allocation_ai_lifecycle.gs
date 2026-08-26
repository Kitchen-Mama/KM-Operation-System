/**
 * TEMP_migrate_shipping_allocation_ai_lifecycle.gs
 * F1-7N-FB-4C-ADDENDUM-MIGRATION §C-§G — USER-RUN schema migration for the Inventory AI Plan draft lifecycle.
 *
 * SCOPE, and nothing beyond it. This tool appends FOUR audit columns to `shipping_allocation_drafts` and, where
 * a row's generation lineage is SOURCE-PROVEN, backfills `generation_run_id` from the authority already stored on
 * that row. It changes no quantity, no route, no note, no user-edit flag and no business status. It creates no
 * table, deletes no row, merges no row, and touches no other table.
 *
 *   TEMP_AI_LIFECYCLE_SCHEMA_DIAGNOSE()        READ-ONLY. What the live schema is, and whether it is ready.
 *   TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN()        READ-ONLY. The complete plan + the confirmation checksum (§F).
 *   TEMP_AI_LIFECYCLE_MIGRATE_COMMIT(o)        THE ONLY WRITER. Requires { mode:'COMMIT', checksum:'...' }.
 *   TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE()        READ-ONLY. Post-migration proof, including the activation gate.
 *
 * NO ROLLBACK ENTRYPOINT IS PROVIDED, and that is a decision rather than an omission. §C permits one "only if
 * rollback can be proven safe", and it cannot be here: removing a column is a destructive structural edit whose
 * safety depends on nothing having written to it since, which this tool cannot know. Undoing a backfill is
 * likewise unprovable, because a later legitimate run may have set the same cell to the same value. What IS
 * provided instead is the thing rollback is wanted for: the commit journals every structural and value change
 * before writing it (§G.12), so a human has an exact, ordered record of what to undo and can do so deliberately.
 * See `rollback_contract` in every report.
 *
 * DEFAULT IS READ-ONLY. Three of the four entrypoints cannot write at all. The fourth refuses without an explicit
 * mode AND a checksum that is RECOMPUTED LIVE at commit time and must equal the one the caller passes — so a plan
 * that was reviewed against a database that has since changed cannot be applied to it.
 *
 * NO SCRIPT PROPERTIES are read for confirmation (§C): a persisted flag is a confirmation that outlives the
 * intent it recorded. The confirmation is a value the caller must copy from a fresh dry run.
 *
 * Owner of the canonical rule: docs/planning/INVENTORY_AI_PLAN_DRAFT_LIFECYCLE.md
 */

// Build stamp for the deployment-identity manifest in 63_api_v1_system_health.gs.
var TEMP_AIMIG_BUILD_VERSION_ = 'F1-7N-FB-4C-ADDENDUM-MIGRATION';
var TEMP_AIMIG_TABLE_ = 'shipping_allocation_drafts';
var TEMP_AIMIG_LINE_TABLE_ = 'shipping_allocation_draft_lines';

// ---------------------------------------------------------------------------------------------------- helpers
function tmigStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function tmigLo_(v) { return tmigStr_(v).toLowerCase(); }

// FNV-1a, the hash this repository already uses for canonical identities. Reused rather than reinvented so a
// masked id in this report is comparable with the same id masked anywhere else.
function tmigHash_(str) {
  if (typeof sadFnv1a_ === 'function') return sadFnv1a_(String(str));
  var h = 0x811c9dc5;
  var s = String(str);
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

// §F — MASK business-sensitive ids in the report while keeping them DETERMINISTIC, so two reports can be
// compared and a specific row can still be found by re-running with the same input. A bare truncation would not
// be reversible-by-lookup; a bare hash would not be recognisable. This keeps the last four characters, which is
// how the duplicate groups in this system are already discussed, plus a stable full-value hash.
function tmigMask_(v) {
  var s = tmigStr_(v);
  if (!s) return '(blank)';
  return (s.length <= 4 ? s : '…' + s.slice(-4)) + '#' + tmigHash_(s);
}

function tmigCanonicalHeaders_() {
  if (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ !== 'undefined') return SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_.slice();
  return [];
}
function tmigRequiredHeaders_() {
  if (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined') return SHIPPING_ALLOCATION_DRAFTS_HEADERS_.slice();
  return [];
}
function tmigTailColumns_() {
  if (typeof SAD_LIFECYCLE_TAIL_COLUMNS_ !== 'undefined') return SAD_LIFECYCLE_TAIL_COLUMNS_.slice();
  return ['generation_run_id', 'expired_at', 'expired_by_run_id', 'expiration_reason'];
}

// Exact-id target guard, reusing the frozen production-safety adapter. A migration that ran against the wrong
// spreadsheet would be unrecoverable, so this is checked before anything is read.
function tmigOpenDb_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (typeof prodAssertDbTarget_ === 'function') prodAssertDbTarget_(ss);
  return ss;
}

// Read a table WITHOUT the validate-only resolver: a missing table or a drifted header must arrive here as a
// reportable FACT, not as a thrown production-safety token that loses the rest of the diagnosis.
function tmigReadTable_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return { name: name, exists: false, headers: [], rows: [], row_count: 0 };
  var data = sh.getDataRange().getValues();
  var headers = (data && data.length ? data[0] : []).map(function (h) { return tmigStr_(h); });
  while (headers.length && headers[headers.length - 1] === '') headers.pop();
  var rows = [];
  for (var r = 1; r < (data ? data.length : 0); r++) {
    var o = { __row: r + 1 };
    var blank = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      o[headers[c]] = data[r][c];
      if (tmigStr_(data[r][c]) !== '') blank = false;
    }
    if (!blank) rows.push(o);
  }
  return { name: name, exists: true, sheet: sh, headers: headers, rows: rows, row_count: rows.length };
}

// ---------------------------------------------------------------------------------------------- schema compare
// §F — live vs expected, including the FIRST ORDER-DRIFT INDEX. Order matters because every positional reader in
// the stack trusts it; "the columns are all present somewhere" is not the same as "the schema is right".
function tmigCompareSchema_(liveHeaders) {
  var canon = tmigCanonicalHeaders_(), required = tmigRequiredHeaders_(), tail = tmigTailColumns_();
  var live = (liveHeaders || []).slice();
  var have = {}; live.forEach(function (h) { if (h) have[h] = 1; });
  var canonSet = {}; canon.forEach(function (h) { canonSet[h] = 1; });

  var missing = canon.filter(function (h) { return !have[h]; });
  var extra = live.filter(function (h) { return h !== '' && !canonSet[h]; });
  var dup = (function () { var seen = {}, d = []; live.forEach(function (h) { if (h && seen[h]) d.push(h); else if (h) seen[h] = 1; }); return d; })();
  var blanks = []; live.forEach(function (h, i) { if (h === '') blanks.push(i); });

  var firstDrift = -1;
  for (var i = 0; i < Math.min(live.length, canon.length); i++) { if (live[i] !== canon[i]) { firstDrift = i; break; } }
  if (firstDrift === -1 && live.length > canon.length) firstDrift = canon.length;

  // The one shape this migration is designed for: the live header is EXACTLY the required 30, in order, and the
  // only thing absent is a trailing suffix of the lifecycle tail.
  var prefixExact = true;
  for (var j = 0; j < Math.min(live.length, canon.length); j++) if (live[j] !== canon[j]) { prefixExact = false; break; }
  var appendOnly = prefixExact && live.length >= required.length && live.length <= canon.length && !extra.length && !dup.length && !blanks.length;

  return {
    live_count: live.length, live_order: live.slice(),
    expected_count: canon.length, expected_order: canon.slice(),
    required_count: required.length, lifecycle_tail: tail.slice(),
    missing_columns: missing, extra_columns: extra, duplicate_columns: dup, blank_column_indexes: blanks,
    first_order_drift_index: firstDrift,
    exact_match: firstDrift === -1 && live.length === canon.length,
    append_only_safe: appendOnly,
    columns_to_append: appendOnly ? canon.slice(live.length) : []
  };
}

// ------------------------------------------------------------------------------------- §E lineage classification
// THE MIGRATION MUST NOT INVENT generation_run_id.
//
// What makes a backfill source-proven here: 61_ derives the run id deterministically from fields that are all
// PERSISTED ON THE ROW ITSELF —
//     executionKey    = 'AIPLAN-' + FNV1a(planning_cycle | company | country | marketplace | calculation_run_id)
//     generationRunId = 'AIRUN-'  + FNV1a(executionKey)
// so for a row carrying a calculation_run_id the original id is RECOMPUTED from the shipped formula, not guessed.
// A timestamp is never used, and a row missing any input is left blank rather than approximated.
//
// The one honest limitation, stated rather than buried: if the original run was invoked with an explicit
// `execution_key`, that key is not persisted anywhere and the recomputed id will differ from the original. That
// is SAFE in both directions, and this is why: the id only ever answers "is this row from the current run?". A
// future run that recomputes the SAME id necessarily has the same cycle, company, country, marketplace and
// calculation_run_id — which means it resolves to the SAME deterministic K2 header identity, i.e. it is the same
// row, so treating it as "same run" is correct. A future run that recomputes a DIFFERENT id supersedes the row,
// which is exactly what should happen to a stale draft. Neither outcome can expire a row a run still owns,
// because the run's own committed ids are protected separately (CURRENT_RUN_OUTPUT).
function tmigRecomputeRunId_(row) {
  var cycle = tmigStr_(row.planning_cycle), company = tmigStr_(row.company);
  var country = tmigStr_(row.country), mkt = tmigStr_(row.marketplace);
  var calc = tmigStr_(row.calculation_run_id);
  if (!calc) return { ok: false, reason: 'NO_CALCULATION_RUN_ID' };
  if (!cycle || !company || !country || !mkt) {
    return { ok: false, reason: 'INCOMPLETE_SCOPE_FOR_DERIVATION',
      detail: { planning_cycle: !!cycle, company: !!company, country: !!country, marketplace: !!mkt } };
  }
  if (typeof sadFnv1a_ !== 'function') return { ok: false, reason: 'HASH_AUTHORITY_UNAVAILABLE' };
  var execKey = 'AIPLAN-' + sadFnv1a_([cycle, company, country, mkt, calc].join('|')).toUpperCase();
  return {
    ok: true, execution_key: execKey, generation_run_id: 'AIRUN-' + sadFnv1a_(execKey).toUpperCase(),
    source_columns: ['planning_cycle', 'company', 'country', 'marketplace', 'calculation_run_id'],
    formula: "AIRUN-<FNV1a('AIPLAN-' + FNV1a(planning_cycle|company|country|marketplace|calculation_run_id))>"
  };
}

function tmigIsAi_(row) {
  if (typeof aiplIsAiGenerated_ === 'function') return aiplIsAiGenerated_(row);
  var gt = tmigLo_(row.generation_type);
  if (gt === 'user_created') return false;
  return gt === 'scheduled' || gt === 'manual_refresh' || gt === 'system_generated' || !!tmigStr_(row.generation_run_id);
}
function tmigIsTerminal_(row) {
  var st = tmigLo_(row.status);
  var term = (typeof SAD_TERMINAL_STATUSES_ !== 'undefined') ? SAD_TERMINAL_STATUSES_ : { submitted: 1, cancelled: 1, expired: 1 };
  return !!term[st];
}
function tmigIdentityKey_(row) {
  return (typeof sadK2GroupKey_ === 'function') ? sadK2GroupKey_(row) : '';
}

// §E — classify EVERY row into exactly one bucket, and propose a write only for AI_LINEAGE_RESOLVED.
function tmigClassifyRows_(rows) {
  var out = { classes: {}, rows: [], backfills: [], untouched: [], identity_conflicts: [] };
  var CLASSES = ['AI_LINEAGE_RESOLVED', 'MANUAL_SOURCE', 'TERMINAL', 'LEGACY_AI_LINEAGE_UNRESOLVED', 'SOURCE_UNKNOWN', 'IDENTITY_CONFLICT'];
  CLASSES.forEach(function (c) { out.classes[c] = 0; });

  // Identity collisions are computed over ACTIVE rows only: a terminal row holds no live decision.
  var activeByKey = {};
  rows.forEach(function (r) {
    if (tmigIsTerminal_(r)) return;
    var k = tmigIdentityKey_(r);
    if (!k) return;
    (activeByKey[k] = activeByKey[k] || []).push(r);
  });
  var conflicted = {};
  Object.keys(activeByKey).forEach(function (k) {
    if (activeByKey[k].length > 1) {
      conflicted[k] = 1;
      out.identity_conflicts.push({
        identity_key_hash: tmigHash_(k), row_count: activeByKey[k].length,
        rows: activeByKey[k].map(function (r) {
          return { row: r.__row, allocation_draft_id: tmigMask_(r.allocation_draft_id), status: tmigLo_(r.status),
                   source: tmigIsAi_(r) ? 'AI' : 'MANUAL' };
        })
      });
    }
  });

  rows.forEach(function (r) {
    var rec = {
      row: r.__row, allocation_draft_id: tmigMask_(r.allocation_draft_id), status: tmigLo_(r.status),
      generation_type: tmigLo_(r.generation_type) || '(blank)',
      existing_generation_run_id: tmigStr_(r.generation_run_id) ? tmigMask_(r.generation_run_id) : null,
      identity_key_hash: tmigHash_(tmigIdentityKey_(r))
    };
    var key = tmigIdentityKey_(r);

    // Precedence is deliberate. An UNRESOLVED IDENTITY CONFLICT is reported first because nothing else about the
    // row can be acted on safely while two active decisions claim it.
    if (key && conflicted[key] && !tmigIsTerminal_(r)) {
      rec.classification = 'IDENTITY_CONFLICT';
      rec.action = 'NO_WRITE';
      rec.reason = 'another active row claims the same canonical identity; reconciliation is required before this scope can be activated';
    } else if (tmigIsTerminal_(r)) {
      // §E — a canonically expired row keeps whatever audit it has. Historical expiration timestamps are NEVER
      // manufactured: a blank expired_at on an already-expired row stays blank and is reported as such.
      rec.classification = 'TERMINAL';
      rec.action = 'NO_WRITE';
      rec.reason = 'terminal status (' + rec.status + '); no lifecycle backfill is applicable';
      if (rec.status === 'expired') {
        rec.audit_present = { expired_at: !!tmigStr_(r.expired_at), expired_by_run_id: !!tmigStr_(r.expired_by_run_id), expiration_reason: !!tmigStr_(r.expiration_reason) };
        rec.note = 'already expired; no historical expiration timestamp is manufactured for missing audit';
      }
    } else if (!tmigIsAi_(r)) {
      rec.classification = 'MANUAL_SOURCE';
      rec.action = 'NO_WRITE';
      rec.reason = 'manual/operator-owned row — the migration never touches it';
    } else if (tmigStr_(r.generation_run_id)) {
      rec.classification = 'AI_LINEAGE_RESOLVED';
      rec.action = 'NO_WRITE';
      rec.reason = 'already carries a generation_run_id; nothing to backfill';
    } else {
      var d = tmigRecomputeRunId_(r);
      if (d.ok) {
        rec.classification = 'AI_LINEAGE_RESOLVED';
        rec.action = 'BACKFILL_GENERATION_RUN_ID';
        rec.source_columns = d.source_columns;
        rec.derivation_formula = d.formula;
        rec.value_mapping = {
          from: { planning_cycle: tmigStr_(r.planning_cycle), company: tmigStr_(r.company),
                  country: tmigStr_(r.country), marketplace: tmigStr_(r.marketplace),
                  calculation_run_id: tmigMask_(r.calculation_run_id) },
          derived_execution_key: tmigMask_(d.execution_key),
          to_generation_run_id: tmigMask_(d.generation_run_id)
        };
        rec.__write = { row: r.__row, column: 'generation_run_id', value: d.generation_run_id };
        out.backfills.push(rec);
      } else if (d.reason === 'NO_CALCULATION_RUN_ID') {
        // §E — leave BLANK, report, do NOT expire, and block lifecycle activation for the conflicting scope.
        rec.classification = 'LEGACY_AI_LINEAGE_UNRESOLVED';
        rec.action = 'NO_WRITE';
        rec.reason = 'AI-provenance row with no calculation_run_id: there is no source-proven authority to derive a run id from, and a timestamp is not one. Left blank for user disposition.';
        rec.blocks_scope = { company: tmigStr_(r.company), country: tmigStr_(r.country), marketplace: tmigStr_(r.marketplace), planning_cycle: tmigStr_(r.planning_cycle) };
      } else {
        rec.classification = 'SOURCE_UNKNOWN';
        rec.action = 'NO_WRITE';
        rec.reason = 'AI-provenance row whose lineage cannot be derived (' + d.reason + ')';
        rec.detail = d.detail || null;
      }
    }
    if (rec.action === 'NO_WRITE') out.untouched.push(rec);
    out.classes[rec.classification] = (out.classes[rec.classification] || 0) + 1;
    out.rows.push(rec);
  });
  return out;
}

// ------------------------------------------------------------------------------------------- the plan + checksum
// §C/§G — the confirmation checksum covers everything that would make a reviewed plan stale: the live header
// shape, the row count, and every proposed write. Recomputed live at commit and required to match exactly, so a
// plan approved against one database state cannot be applied to another.
function tmigChecksum_(plan) {
  var parts = [
    'v=' + TEMP_AIMIG_BUILD_VERSION_,
    'ver=' + ((typeof AIPL_MIGRATION_VERSION_ !== 'undefined') ? AIPL_MIGRATION_VERSION_ : ''),
    'live=' + plan.schema.live_order.join(','),
    'expect=' + plan.schema.expected_order.join(','),
    'rows=' + plan.rows_scanned,
    'append=' + plan.schema.columns_to_append.join(',')
  ];
  plan.writes.forEach(function (w) { parts.push('w=' + w.table + ':' + w.row + ':' + w.column + ':' + tmigHash_(w.value)); });
  return 'AIMIG-' + tmigHash_(parts.join('||')).toUpperCase();
}

function tmigBuildPlan_(ss) {
  var h = tmigReadTable_(ss, TEMP_AIMIG_TABLE_);
  var l = tmigReadTable_(ss, TEMP_AIMIG_LINE_TABLE_);
  var schema = tmigCompareSchema_(h.headers);
  var cls = h.exists ? tmigClassifyRows_(h.rows) : { classes: {}, rows: [], backfills: [], untouched: [], identity_conflicts: [] };

  var statusCounts = {};
  (h.rows || []).forEach(function (r) { var st = tmigLo_(r.status) || '(blank)'; statusCounts[st] = (statusCounts[st] || 0) + 1; });

  var writes = [];
  schema.columns_to_append.forEach(function (c, i) {
    writes.push({ table: TEMP_AIMIG_TABLE_, kind: 'ADD_COLUMN', column: c,
                  at_index: schema.live_count + i, row: 1, value: c });
  });
  cls.backfills.forEach(function (b) {
    writes.push({ table: TEMP_AIMIG_TABLE_, kind: 'SET_CELL', column: b.__write.column,
                  row: b.__write.row, value: b.__write.value });
  });

  // §F — blocking reasons. Anything here means COMMIT is refused.
  var blocking = [];
  if (!h.exists) blocking.push('MISSING_TABLE: ' + TEMP_AIMIG_TABLE_);
  if (!l.exists) blocking.push('MISSING_TABLE: ' + TEMP_AIMIG_LINE_TABLE_);
  if (!tmigCanonicalHeaders_().length) blocking.push('SCHEMA_AUTHORITY_UNAVAILABLE: sync 16_shipping_allocation_handlers.gs — SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ is not defined in this project');
  if (h.exists && !schema.append_only_safe) {
    // §D — STOP rather than reorder. This is the one condition under which the migration refuses outright.
    blocking.push('HEADER_NOT_APPEND_ONLY_SAFE: the live header is not an exact prefix of the canonical order ' +
      '(first drift index ' + schema.first_order_drift_index + ', extra=[' + schema.extra_columns.join(',') +
      '], duplicate=[' + schema.duplicate_columns.join(',') + '], blanks=[' + schema.blank_column_indexes.join(',') +
      ']). NO live column is reordered or rewritten by this tool — resolve the drift first.');
  }
  if (cls.identity_conflicts.length) {
    blocking.push('UNRESOLVED_ACTIVE_IDENTITY_COLLISION: ' + cls.identity_conflicts.length +
      ' identity(ies) hold more than one ACTIVE row. The structural migration itself is safe, but the affected scope ' +
      'cannot be activated until a human reconciles them; see identity_conflicts. This tool never picks a survivor.');
  }

  var plan = {
    tool: 'TEMP_migrate_shipping_allocation_ai_lifecycle',
    build_version: TEMP_AIMIG_BUILD_VERSION_,
    migration_version: (typeof AIPL_MIGRATION_VERSION_ !== 'undefined') ? AIPL_MIGRATION_VERSION_ : null,
    table: TEMP_AIMIG_TABLE_,
    schema: schema,
    rows_scanned: h.row_count,
    line_rows_scanned: l.row_count,
    line_status_column_present: (l.headers || []).indexOf('line_status') !== -1,
    status_counts: statusCounts,
    classification_counts: cls.classes,
    ai_lineage_resolved: cls.classes.AI_LINEAGE_RESOLVED || 0,
    manual_count: cls.classes.MANUAL_SOURCE || 0,
    terminal_count: cls.classes.TERMINAL || 0,
    legacy_ai_unresolved_count: cls.classes.LEGACY_AI_LINEAGE_UNRESOLVED || 0,
    source_unknown_count: cls.classes.SOURCE_UNKNOWN || 0,
    identity_conflict_count: cls.identity_conflicts.length,
    identity_conflicts: cls.identity_conflicts,
    proposed_backfills: cls.backfills.map(function (b) {
      var c = {}; for (var k in b) if (k !== '__write' && Object.prototype.hasOwnProperty.call(b, k)) c[k] = b[k];
      return c;
    }),
    proposed_untouched: cls.untouched,
    writes: writes,
    blocking_reasons: blocking,
    migration_readiness: blocking.length ? 'BLOCKED' : (writes.length ? 'READY' : 'NOTHING_TO_DO'),
    rollback_feasibility: {
      structural: 'NOT_PROVEN_SAFE — dropping a column is destructive and its safety depends on nothing having written to it since; no automated rollback is offered.',
      value_backfill: 'NOT_PROVEN_SAFE — a later legitimate run may have written the same value, so an automated undo cannot distinguish its own change from a real one.',
      provided_instead: 'the commit journals every structural and value change, in order, BEFORE applying it (§G.12), so a human has an exact record to reverse deliberately.'
    },
    DB_WRITES: 0
  };
  plan.confirmation_checksum = tmigChecksum_(plan);
  return { plan: plan, header: h, line: l, classification: cls };
}

// ---------------------------------------------------------------------------------------------- §C entrypoints
function TEMP_AI_LIFECYCLE_SCHEMA_DIAGNOSE() {
  var ss = tmigOpenDb_();
  var built = tmigBuildPlan_(ss);
  var facts = (typeof aiplReadActivationFacts_ === 'function')
    ? aiplReadActivationFacts_(ss, { generation_run_id: 'DIAGNOSE-PROBE' }) : null;
  var gate = (facts && typeof aiplActivationGate_ === 'function') ? aiplActivationGate_(facts) : null;
  var out = {
    mode: 'DIAGNOSE (READ-ONLY)',
    build_version: TEMP_AIMIG_BUILD_VERSION_,
    migration_version_expected: built.plan.migration_version,
    migration_version_live: facts ? facts.migration_version || null : null,
    schema: built.plan.schema,
    line_status_column_present: built.plan.line_status_column_present,
    status_authority: facts ? {
      header_accepts_expired: facts.header_status_accepts_expired,
      line_accepts_expired: facts.line_status_accepts_expired
    } : null,
    rows_scanned: built.plan.rows_scanned,
    classification_counts: built.plan.classification_counts,
    identity_conflict_count: built.plan.identity_conflict_count,
    migration_readiness: built.plan.migration_readiness,
    blocking_reasons: built.plan.blocking_reasons,
    activation_gate: gate ? (gate.ready ? { ready: true } : gate.error) : { ready: false, reason: 'LIFECYCLE_MODULE_NOT_LOADED' },
    next_action: built.plan.migration_readiness === 'READY'
      ? 'Run TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN() and review the full plan.'
      : (built.plan.migration_readiness === 'NOTHING_TO_DO'
        ? 'No structural change is required. Run TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE() to confirm activation.'
        : 'Resolve blocking_reasons first.'),
    footer: 'DB_WRITES=0 · STATUS_TRANSITIONS=0 · PROPERTY_WRITES=0 · DRIVE_WRITES=0 · EMAILS=0 · DEMO_MUTATIONS=0'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN() {
  var ss = tmigOpenDb_();
  var built = tmigBuildPlan_(ss);
  var p = built.plan;
  var out = {
    mode: 'DRY_RUN (READ-ONLY)',
    build_version: p.build_version,
    migration_version: p.migration_version,
    table: p.table,
    live_header_count: p.schema.live_count, live_header_order: p.schema.live_order,
    expected_header_count: p.schema.expected_count, expected_header_order: p.schema.expected_order,
    missing_columns: p.schema.missing_columns, extra_columns: p.schema.extra_columns,
    duplicate_columns: p.schema.duplicate_columns, blank_column_indexes: p.schema.blank_column_indexes,
    first_order_drift_index: p.schema.first_order_drift_index,
    append_only_safe: p.schema.append_only_safe, columns_to_append: p.schema.columns_to_append,
    line_status_column_present: p.line_status_column_present,
    rows_scanned: p.rows_scanned, line_rows_scanned: p.line_rows_scanned,
    status_counts: p.status_counts,
    ai_lineage_resolved_count: p.ai_lineage_resolved,
    manual_count: p.manual_count,
    terminal_count: p.terminal_count,
    legacy_ai_lineage_unresolved_count: p.legacy_ai_unresolved_count,
    source_unknown_count: p.source_unknown_count,
    identity_conflict_count: p.identity_conflict_count,
    identity_conflicts: p.identity_conflicts,
    proposed_backfills: p.proposed_backfills,
    proposed_untouched_rows: p.proposed_untouched,
    exact_writes: p.writes.map(function (w) {
      return { table: w.table, kind: w.kind, row: w.row, column: w.column, value: tmigMask_(w.value) };
    }),
    write_count: p.writes.length,
    confirmation_checksum: p.confirmation_checksum,
    migration_readiness: p.migration_readiness,
    blocking_reasons: p.blocking_reasons,
    rollback_feasibility: p.rollback_feasibility,
    DB_WRITES: 0,
    next_action: p.migration_readiness === 'READY'
      ? "Review every line above, then run: TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ mode: 'COMMIT', checksum: '" + p.confirmation_checksum + "' })"
      : 'Not ready — resolve blocking_reasons. COMMIT will refuse.',
    footer: 'DB_WRITES=0 · STATUS_TRANSITIONS=0 · PROPERTY_WRITES=0 · DRIVE_WRITES=0 · EMAILS=0 · DEMO_MUTATIONS=0'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * §G — THE ONLY WRITER. Requires opts = { mode: 'COMMIT', checksum: '<from a FRESH dry run>' }.
 *
 * Order is the safety property: re-read, recompute, compare, lock, RE-READ AGAIN under the lock, journal, write,
 * read back, verify byte-equivalence of everything that was not supposed to change, release in `finally`.
 */
function TEMP_AI_LIFECYCLE_MIGRATE_COMMIT(opts) {
  opts = opts || {};
  var result = {
    mode: 'COMMIT', build_version: TEMP_AIMIG_BUILD_VERSION_, committed: false,
    columns_added: [], cells_written: 0, journal: [], verification: null,
    blocking_reasons: [], DB_WRITES: 0
  };

  // §C — an explicit mode. No default, no truthy shortcut, and NO Script Property: a persisted confirmation is a
  // confirmation that outlives the intent it recorded.
  if (tmigStr_(opts.mode) !== 'COMMIT') {
    result.blocking_reasons.push("MODE_REQUIRED — pass { mode: 'COMMIT', checksum: '...' }. Nothing was read for confirmation from Script Properties, and nothing was written.");
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }
  var claimed = tmigStr_(opts.checksum);
  if (!claimed) {
    result.blocking_reasons.push('CHECKSUM_REQUIRED — run TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN() and pass the confirmation_checksum it prints.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  var ss = tmigOpenDb_();

  // (1) re-read schema, (2) recompute checksum, (3) require exact match — BEFORE taking any lock.
  var pre = tmigBuildPlan_(ss);
  result.live_checksum = pre.plan.confirmation_checksum;
  if (pre.plan.blocking_reasons.length) {
    result.blocking_reasons = pre.plan.blocking_reasons.slice();
    result.blocking_reasons.push('REFUSED — the plan is not READY. Nothing was written.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }
  if (pre.plan.confirmation_checksum !== claimed) {
    result.blocking_reasons.push('CHECKSUM_MISMATCH — the database changed since the dry run that produced "' + claimed +
      '". The live checksum is "' + pre.plan.confirmation_checksum + '". Re-run the dry run, review it again, and use the new value. Nothing was written.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  // (4) ONE short lock.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    result.blocking_reasons.push('LOCK_UNAVAILABLE — could not acquire the migration lock; zero rows written.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }
  try {
    // (5) recheck under the lock. Between the checksum match and the lock, another writer may have moved.
    var post = tmigBuildPlan_(ss);
    if (post.plan.confirmation_checksum !== claimed) {
      result.blocking_reasons.push('CHECKSUM_MISMATCH_UNDER_LOCK — the database changed between confirmation and the lock. Nothing was written.');
      return result;
    }
    if (post.plan.blocking_reasons.length) {
      result.blocking_reasons = post.plan.blocking_reasons.slice();
      result.blocking_reasons.push('REFUSED_UNDER_LOCK — nothing was written.');
      return result;
    }

    var sh = post.header.sheet;
    var liveHeaders = post.header.headers.slice();

    // (11) capture EVERY pre-existing cell before touching anything, so byte-equivalence can be PROVEN rather
    // than assumed. The comparison is over the pre-migration column range only — the appended columns are new.
    var beforeSnapshot = null;
    if (post.header.row_count > 0 && liveHeaders.length > 0) {
      beforeSnapshot = sh.getRange(2, 1, post.header.row_count, liveHeaders.length).getValues()
        .map(function (r) { return r.map(function (v) { return String(v); }); });
    }

    // (12) JOURNAL FIRST — every structural and value change is recorded before it is applied.
    post.plan.writes.forEach(function (w) {
      result.journal.push({
        seq: result.journal.length + 1, kind: w.kind, table: w.table, row: w.row,
        column: w.column, at_index: (w.at_index !== undefined ? w.at_index : null),
        value_masked: tmigMask_(w.value), applied: false
      });
    });

    // (6) add ONLY the approved columns, append-only, in the canonical order.
    var appended = [];
    post.plan.schema.columns_to_append.forEach(function (col) {
      var at = liveHeaders.length + 1;                      // 1-based; strictly to the right of every live column
      if (sh.getMaxColumns() < at) sh.insertColumnsAfter(sh.getMaxColumns(), at - sh.getMaxColumns());
      sh.getRange(1, at).setValue(col);
      liveHeaders.push(col);
      appended.push({ column: col, at_index_1based: at });
      result.DB_WRITES++;
      var j = result.journal.filter(function (x) { return x.kind === 'ADD_COLUMN' && x.column === col; })[0];
      if (j) j.applied = true;
    });
    result.columns_added = appended;

    // (7) apply ONLY source-proven lineage backfills. (8)(9) nothing else is touched: no quantity, no route, no
    // note, no user-edit flag, and no business status is written anywhere in this function.
    var runCol = liveHeaders.indexOf('generation_run_id');
    var written = 0;
    if (runCol !== -1) {
      post.plan.writes.filter(function (w) { return w.kind === 'SET_CELL' && w.column === 'generation_run_id'; })
        .forEach(function (w) {
          var cur = tmigStr_(sh.getRange(w.row, runCol + 1).getValue());
          if (cur !== '') return;                            // never overwrite an existing lineage value
          sh.getRange(w.row, runCol + 1).setValue(w.value);
          written++; result.DB_WRITES++;
          var j = result.journal.filter(function (x) { return x.kind === 'SET_CELL' && x.row === w.row; })[0];
          if (j) j.applied = true;
        });
    }
    result.cells_written = written;
    SpreadsheetApp.flush();

    // (10) read back and verify the new header. (11) verify every pre-existing cell is byte-equivalent.
    var after = tmigReadTable_(ss, TEMP_AIMIG_TABLE_);
    var afterSchema = tmigCompareSchema_(after.headers);
    var mismatches = [];
    if (beforeSnapshot) {
      var afterValues = after.sheet.getRange(2, 1, post.header.row_count, post.header.headers.length).getValues()
        .map(function (r) { return r.map(function (v) { return String(v); }); });
      for (var r0 = 0; r0 < beforeSnapshot.length; r0++) {
        for (var c0 = 0; c0 < beforeSnapshot[r0].length; c0++) {
          if (beforeSnapshot[r0][c0] !== afterValues[r0][c0]) {
            mismatches.push({ row: r0 + 2, column: post.header.headers[c0], before_hash: tmigHash_(beforeSnapshot[r0][c0]), after_hash: tmigHash_(afterValues[r0][c0]) });
          }
        }
      }
    }
    var backfillVerified = 0;
    if (runCol !== -1) {
      post.plan.writes.filter(function (w) { return w.kind === 'SET_CELL'; }).forEach(function (w) {
        if (tmigStr_(after.sheet.getRange(w.row, runCol + 1).getValue()) === tmigStr_(w.value)) backfillVerified++;
      });
    }
    var facts = (typeof aiplReadActivationFacts_ === 'function') ? aiplReadActivationFacts_(ss, { generation_run_id: 'POST-MIGRATION-PROBE' }) : null;

    result.verification = {
      header_exact_match: afterSchema.exact_match,
      header_count: afterSchema.live_count,
      header_order: afterSchema.live_order,
      missing_columns_after: afterSchema.missing_columns,
      preexisting_cells_compared: beforeSnapshot ? beforeSnapshot.length * (beforeSnapshot[0] ? beforeSnapshot[0].length : 0) : 0,
      preexisting_cell_mismatches: mismatches,
      backfills_verified: backfillVerified,
      backfills_expected: post.plan.writes.filter(function (w) { return w.kind === 'SET_CELL'; }).length,
      migration_version_live: facts ? facts.migration_version || null : null
    };
    result.committed = afterSchema.exact_match && mismatches.length === 0 &&
      result.verification.backfills_verified === result.verification.backfills_expected;
    if (!result.committed) result.blocking_reasons.push('POST_WRITE_VERIFICATION_FAILED — see verification; the structural change may be partially applied. Use `journal` to review exactly what was attempted.');
    result.footer = 'STATUS_TRANSITIONS=0 · PROPERTY_WRITES=0 · DRIVE_WRITES=0 · EMAILS=0 · DEMO_MUTATIONS=0 · ROWS_DELETED=0 · ROWS_MERGED=0';
    return result;
  } catch (e) {
    result.blocking_reasons.push('EXCEPTION: ' + String(e && e.message || e));
    return result;
  } finally {
    // (14) always.
    try { lock.releaseLock(); } catch (eR) {}
    Logger.log(JSON.stringify(result, null, 2));
  }
}

function TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE() {
  var ss = tmigOpenDb_();
  var built = tmigBuildPlan_(ss);
  var facts = (typeof aiplReadActivationFacts_ === 'function')
    ? aiplReadActivationFacts_(ss, { generation_run_id: 'VALIDATE-PROBE', identity_collisions: built.plan.identity_conflicts }) : null;
  var gate = (facts && typeof aiplActivationGate_ === 'function') ? aiplActivationGate_(facts) : null;
  var out = {
    mode: 'VALIDATE (READ-ONLY)',
    build_version: TEMP_AIMIG_BUILD_VERSION_,
    header_exact_match: built.plan.schema.exact_match,
    live_header_count: built.plan.schema.live_count,
    expected_header_count: built.plan.schema.expected_count,
    missing_columns: built.plan.schema.missing_columns,
    first_order_drift_index: built.plan.schema.first_order_drift_index,
    line_status_column_present: built.plan.line_status_column_present,
    migration_version_expected: built.plan.migration_version,
    migration_version_live: facts ? facts.migration_version || null : null,
    status_authority: facts ? { header_accepts_expired: facts.header_status_accepts_expired, line_accepts_expired: facts.line_status_accepts_expired } : null,
    classification_counts: built.plan.classification_counts,
    legacy_ai_lineage_unresolved_count: built.plan.legacy_ai_unresolved_count,
    identity_conflict_count: built.plan.identity_conflict_count,
    identity_conflicts: built.plan.identity_conflicts,
    // The activation gate is the SAME function production uses. Validating with a different check would prove
    // something other than "the next real run will be allowed to proceed".
    activation_gate: gate ? (gate.ready ? { ready: true, migration_version: gate.migration_version } : gate.error) : { ready: false, reason: 'LIFECYCLE_MODULE_NOT_LOADED' },
    lifecycle_activated: !!(gate && gate.ready),
    DB_WRITES: 0,
    footer: 'DB_WRITES=0 · STATUS_TRANSITIONS=0 · PROPERTY_WRITES=0 · DRIVE_WRITES=0 · EMAILS=0 · DEMO_MUTATIONS=0'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
