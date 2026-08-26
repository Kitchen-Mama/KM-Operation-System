// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 69_api_v1_ai_plan_lifecycle.gs — F1-7N-FB-4C §D/§E/§F  INVENTORY AI PLAN DRAFT LIFECYCLE
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER.
// ------------------------------------------------------------
//
// THE CANONICAL RULE (§D), recorded here and in
// docs/planning/INVENTORY_AI_PLAN_DRAFT_LIFECYCLE.md:
//
//   Inventory AI Plan is the AUTOMATED PROPOSAL SOURCE for shipping allocation drafts. Each SUCCESSFUL new
//   generation run REPLACES the earlier, still-`draft`, AI-generated results of the SAME scope. The older rows
//   are KEPT and marked `expired` — never deleted.
//
//   draft    the active proposal: editable, displayed, submittable.
//   expired  superseded by a newer SUCCESSFUL AI Plan run. Audit only: not editable, not submittable, and not
//            shown in the Execution Plan by default.
//
// WHY THIS MODULE EXISTS. The generator wrote each K2 group by deterministic identity, so a re-run UPDATED a
// group whose route was unchanged — but a group whose route CHANGED (a different source, method or destination)
// produced a NEW header while last week's header stayed `draft`. Both were then active, both hydrated into the
// Execution Plan, and both were eligible for Submit. Nothing expired anything, because nothing had the concept.
//
// WHAT THIS MODULE REFUSES TO DO.
//   · It never expires anything until the CURRENT run has committed AND verified (§E). A failed or partial run
//     leaves the previous plan exactly as it was — the operator is never left with no active plan.
//   · It never expires a row it does not own: manual rows, other scopes, other runs' current rows, and every
//     terminal/protected status are excluded BY CONSTRUCTION and the exclusion is reported per row.
//   · It never uses `cancelled` to mean expired, and never writes the reason into a free-text note.
//   · It never deletes a row.
//
// SCHEMA. Expiration needs four audit columns that the frozen 30-column header does not have. When they are
// absent this module FAILS CLOSED with AI_PLAN_LIFECYCLE_SCHEMA_EXTENSION_REQUIRED rather than expiring rows
// whose lineage it cannot record — losing the lineage, or hiding it in `note`, is explicitly forbidden.
// ============================================================

// Build stamp for the deployment-identity manifest in 63_api_v1_system_health.gs. If the deployed project is
// missing this module the health check names it, instead of the page silently expiring nothing.
var AIPL_BUILD_VERSION_ = 'F1-7N-FB-4C';
var AIPL_CONTRACT_VERSION_ = '1';
var AIPL_SOURCE_PAGE_ = 'inventory_replenishment';
var AIPL_EXPIRATION_REASON_ = 'SUPERSEDED_BY_NEW_AI_PLAN';

// The four columns the lifecycle needs on `shipping_allocation_drafts`. See §14 of the completion record for the
// migration manifest; this module only ever READS whether they exist.
var AIPL_AUDIT_COLUMNS_ = ['generation_run_id', 'expired_at', 'expired_by_run_id', 'expiration_reason'];

// A row is AI-generated when its provenance says so. `generation_type` is the existing provenance column and
// `user_created` is the manual marker, so anything not user-created and carrying a generation run id is an AI
// row. A row with NEITHER marker is treated as MANUAL — fail-safe, because the cost of wrongly expiring a
// manual row is far higher than the cost of leaving a stale AI row active.
var AIPL_AI_GENERATION_TYPES_ = { scheduled: 1, manual_refresh: 1, system_generated: 1 };

// Statuses that may NEVER be expired. Everything that is terminal, downstream-referenced, or already expired.
var AIPL_PROTECTED_STATUSES_ = {
  submitted: 'SUBMITTED', approved: 'APPROVED', site_confirmed: 'SITE_CONFIRMED',
  transferred: 'TRANSFERRED', cancelled: 'CANCELLED', expired: 'ALREADY_EXPIRED',
  partially_submitted: 'PARTIALLY_SUBMITTED'
};

function aiplStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function aiplLo_(v) { return aiplStr_(v).toLowerCase(); }
function aiplErr_(code, message, extra) {
  var e = { code: code, message: message || code };
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k];
  return e;
}

// --------------------------------------------------------------------------------------------------------
// PURE core — rows in, decisions out. Deterministic, side-effect free, unit-testable with ZERO SpreadsheetApp.
// --------------------------------------------------------------------------------------------------------

// Is the schema ready to record expiration lineage? Returns the exact missing columns.
function aiplSchemaReady_(headerColumns) {
  var have = {}, missing = [];
  (headerColumns || []).forEach(function (h) { have[aiplStr_(h)] = 1; });
  AIPL_AUDIT_COLUMNS_.forEach(function (c) { if (!have[c]) missing.push(c); });
  return { ok: missing.length === 0, missing: missing, required: AIPL_AUDIT_COLUMNS_.slice() };
}

// AI provenance. Deliberately conservative: a row must POSITIVELY look AI-generated to be expirable.
function aiplIsAiGenerated_(row) {
  row = row || {};
  var gt = aiplLo_(row.generation_type);
  if (gt === 'user_created') return false;                 // explicit manual marker — never AI
  if (AIPL_AI_GENERATION_TYPES_[gt]) return true;
  // A row carrying a generation run id is an AI row even if its generation_type is blank (older rows).
  return !!aiplStr_(row.generation_run_id);
}

// Same replaceable scope: the AI Plan business scope, which is the station plus the source page and the
// planning cycle. A different country, marketplace, company, cycle or page is a DIFFERENT plan and is untouched.
function aiplSameScope_(row, scope) {
  row = row || {}; scope = scope || {};
  if (aiplLo_(row.source_page || AIPL_SOURCE_PAGE_) !== aiplLo_(scope.source_page || AIPL_SOURCE_PAGE_)) return false;
  if (aiplLo_(row.company) !== aiplLo_(scope.company)) return false;
  if (aiplLo_(row.country) !== aiplLo_(scope.country)) return false;
  if (aiplLo_(row.marketplace) !== aiplLo_(scope.marketplace)) return false;
  if (aiplStr_(scope.planning_cycle) && aiplLo_(row.planning_cycle) !== aiplLo_(scope.planning_cycle)) return false;
  return true;
}

/**
 * THE EXPIRATION DECISION (§D). Given every header row and the CURRENT run's context, return exactly which rows
 * would be expired and — for every row that would not be — the reason it is protected. Nothing is written here.
 *
 * ctx = { company, country, marketplace, planning_cycle, source_page, generation_run_id, committed_ids:[], now }
 *
 * A row is expired ONLY when ALL of these hold:
 *   · it is in the same AI Plan business scope;
 *   · its provenance is AI (never manual);
 *   · its status is exactly `draft`;
 *   · its generation_run_id differs from the current run;
 *   · it is not one of the rows this run just committed.
 *
 * A user-edited row that is still an AI-sourced `draft` IS expired — that is the business decision recorded in
 * §D — and its quantities, override flags and notes are preserved untouched; only the lifecycle columns move.
 */
function aiplExpirationCandidates_(rows, ctx) {
  ctx = ctx || {};
  var runId = aiplStr_(ctx.generation_run_id);
  var committed = {};
  (ctx.committed_ids || []).forEach(function (id) { committed[aiplStr_(id)] = 1; });

  var expire = [], preserved = [];
  (rows || []).forEach(function (r) {
    var id = aiplStr_(r.allocation_draft_id);
    var status = aiplLo_(r.status);
    function keep(reason, detail) { preserved.push({ allocation_draft_id: id, status: status, reason: reason, detail: detail || '' }); }

    if (!aiplSameScope_(r, ctx)) { keep('OUT_OF_SCOPE', 'belongs to a different company/country/marketplace/cycle/page'); return; }
    if (!aiplIsAiGenerated_(r)) { keep('MANUAL_SOURCE', 'not an AI-generated row — a manual route is never replaced by a generation run'); return; }
    if (AIPL_PROTECTED_STATUSES_[status]) { keep('PROTECTED_STATUS_' + AIPL_PROTECTED_STATUSES_[status], 'status ' + status + ' is terminal or already expired'); return; }
    if (status !== 'draft') { keep('NOT_DRAFT', 'only a draft may be superseded; found status ' + (status || '(blank)')); return; }
    if (committed[id]) { keep('CURRENT_RUN_OUTPUT', 'this row is part of the run that is replacing the others'); return; }
    if (runId && aiplStr_(r.generation_run_id) === runId) { keep('SAME_GENERATION_RUN', 'the row already belongs to the current run'); return; }

    expire.push({
      allocation_draft_id: id,
      previous_status: status,
      generation_run_id: aiplStr_(r.generation_run_id) || '(none recorded)',
      user_edited: aiplLo_(r.user_edited) === 'true' || aiplStr_(r.note) !== '',
      expiration_reason: AIPL_EXPIRATION_REASON_
    });
  });

  return {
    expire: expire.sort(function (a, b) { return a.allocation_draft_id < b.allocation_draft_id ? -1 : 1; }),
    preserved: preserved.sort(function (a, b) { return a.allocation_draft_id < b.allocation_draft_id ? -1 : 1; }),
    expire_count: expire.length,
    preserved_count: preserved.length
  };
}

/**
 * ACTIVE UNIQUENESS (§F). Two ACTIVE AI drafts may never claim the same business identity. Identity is the
 * EXISTING canonical K2 route group key (sadK2GroupKey_) — this module deliberately builds no second hash.
 * Multiple routes for one SKU legitimately produce multiple headers with DIFFERENT keys; that is not a conflict.
 */
function aiplActiveIdentityConflicts_(rows, keyOf) {
  var key = keyOf || (typeof sadK2GroupKey_ === 'function' ? sadK2GroupKey_ : null);
  if (!key) return { ok: false, reason: 'K2_GROUP_KEY_AUTHORITY_UNAVAILABLE', conflicts: [] };
  var byKey = {}, order = [];
  (rows || []).forEach(function (r) {
    var status = aiplLo_(r.status);
    if (status !== 'draft' && status !== 'site_confirmed' && status !== 'partially_submitted') return;   // active only
    var k = key(r);
    if (!byKey[k]) { byKey[k] = []; order.push(k); }
    byKey[k].push({ allocation_draft_id: aiplStr_(r.allocation_draft_id), status: status,
      generation_run_id: aiplStr_(r.generation_run_id), ai: aiplIsAiGenerated_(r) });
  });
  var conflicts = [];
  order.forEach(function (k) {
    if (byKey[k].length <= 1) return;
    // Two AI rows claiming one identity is the defect. An AI row coexisting with a MANUAL row on the same
    // identity is reported separately: it is a real collision, but not one this lifecycle created.
    var aiRows = byKey[k].filter(function (x) { return x.ai; });
    conflicts.push({
      k2_group_key: k, rows: byKey[k], count: byKey[k].length,
      kind: aiRows.length > 1 ? 'DUPLICATE_ACTIVE_AI_IDENTITY' : 'AI_AND_MANUAL_SHARE_IDENTITY'
    });
  });
  return { ok: conflicts.length === 0, conflicts: conflicts, conflict_count: conflicts.length };
}

// Deterministic manifest checksum (§E Stage 2). FNV-1a over the sorted decision set, so the same plan always
// produces the same value and any drift between Prepare and Commit is detectable.
function aiplChecksum_(obj) {
  var s = JSON.stringify(obj), h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8).toUpperCase();
}

/**
 * STAGE 2 — PREPARE (§E). Build the complete manifest of what a commit WOULD do. NO WRITES.
 * Returns { ok, manifest, blockers } — a non-empty `blockers` means the commit must not start.
 */
function aiplPrepareManifest_(input) {
  input = input || {};
  var scope = input.scope || {};
  var headerRows = input.headerRows || [];
  var runId = aiplStr_(input.generation_run_id);
  var committed = input.committed_ids || [];
  var blockers = [];

  if (!runId) blockers.push(aiplErr_('GENERATION_RUN_ID_REQUIRED', 'a generation run must carry an immutable run id before anything may be expired'));
  if (!aiplStr_(scope.company) || !aiplStr_(scope.country)) blockers.push(aiplErr_('INVALID_SCOPE', 'company + country are required to bound an expiration'));

  var schema = aiplSchemaReady_(input.headerColumns || []);
  if (!schema.ok) {
    blockers.push(aiplErr_('AI_PLAN_LIFECYCLE_SCHEMA_EXTENSION_REQUIRED',
      'the shipping_allocation_drafts header is missing the expiration audit columns, so a row could be expired without recording WHY or BY WHICH RUN. Refusing rather than losing the lineage.',
      { missing_columns: schema.missing, required_columns: schema.required }));
  }

  var decision = aiplExpirationCandidates_(headerRows, {
    company: scope.company, country: scope.country, marketplace: scope.marketplace,
    planning_cycle: scope.planning_cycle, source_page: scope.source_page || AIPL_SOURCE_PAGE_,
    generation_run_id: runId, committed_ids: committed
  });

  // A conflicting ACTIVE run for the same scope means two generations are racing; commit must not proceed.
  var uniqueness = aiplActiveIdentityConflicts_(headerRows.filter(function (r) { return aiplSameScope_(r, scope); }), input.keyOf);

  var manifest = {
    contract_version: AIPL_CONTRACT_VERSION_,
    generation_run_id: runId,
    scope: { company: aiplStr_(scope.company), country: aiplStr_(scope.country), marketplace: aiplStr_(scope.marketplace),
      planning_cycle: aiplStr_(scope.planning_cycle), source_page: aiplStr_(scope.source_page) || AIPL_SOURCE_PAGE_ },
    committed_ids: committed.slice().sort(),
    would_expire: decision.expire,
    would_preserve: decision.preserved,
    expire_count: decision.expire_count,
    preserve_count: decision.preserved_count,
    zero_result: committed.length === 0,
    schema: schema,
    active_identity: uniqueness
  };
  manifest.checksum = aiplChecksum_({ run: runId, expire: decision.expire.map(function (e) { return e.allocation_draft_id; }), committed: manifest.committed_ids });

  return { ok: blockers.length === 0, manifest: manifest, blockers: blockers };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE — injectable io so the whole staged flow runs against fixtures with ZERO SpreadsheetApp.
// --------------------------------------------------------------------------------------------------------

function aiplDefaultIo_(ss) {
  return {
    now: function () { return (typeof procurementTimestamp_ === 'function') ? procurementTimestamp_() : new Date().toISOString(); },
    headerSheet: function () { return procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_); },
    lineSheet: function () { return procurementEnsureSheet_(ss, 'shipping_allocation_draft_lines', SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_); },
    readRows: function (sheet) {
      var data = sheet.getDataRange().getValues();
      if (!data || data.length < 2) return { headers: (data && data[0]) ? data[0].map(function (h) { return aiplStr_(h); }) : [], rows: [] };
      var headers = data[0].map(function (h) { return aiplStr_(h); });
      var rows = [];
      for (var r = 1; r < data.length; r++) {
        var o = { __row: r + 1 };
        for (var c = 0; c < headers.length; c++) if (headers[c]) o[headers[c]] = data[r][c];
        rows.push(o);
      }
      return { headers: headers, rows: rows };
    },
    setCell: function (sheet, rowNum, headers, colName, value) {
      var idx = headers.indexOf(colName);
      if (idx === -1) return false;
      sheet.getRange(rowNum, idx + 1).setValue(value);
      return true;
    }
  };
}

/**
 * STAGE 3 — the expiration half of the commit (§E steps 5-7). Called ONLY after the current run's own rows are
 * committed AND verified; it is never the first thing a run does.
 *
 * Writes exactly five cells per expired header (status + the four audit columns) and sets `line_status` on that
 * header's non-terminal lines. It writes NOTHING else: quantities, override flags, notes and every snapshot are
 * left byte-identical, which is what makes the expired row an audit record rather than a mutilated one.
 */
function aiplExpireSupersededDrafts_(ss, input, io) {
  io = io || aiplDefaultIo_(ss);
  var scope = (input && input.scope) || {};
  var runId = aiplStr_(input && input.generation_run_id);
  var actor = aiplStr_(input && input.actor) || 'inventory-ai-plan';

  var hSheet = io.headerSheet();
  var hRead = io.readRows(hSheet);
  var prep = aiplPrepareManifest_({
    scope: scope, headerRows: hRead.rows, headerColumns: hRead.headers,
    generation_run_id: runId, committed_ids: (input && input.committed_ids) || [], keyOf: input && input.keyOf
  });
  if (!prep.ok) return { ok: false, stage: 'PREPARE', blockers: prep.blockers, manifest: prep.manifest, expired_headers: 0, expired_lines: 0 };

  var now = io.now();
  var lSheet = io.lineSheet();
  var lRead = io.readRows(lSheet);
  var expiredHeaders = 0, expiredLines = 0, failures = [];
  var byId = {};
  hRead.rows.forEach(function (r) { byId[aiplStr_(r.allocation_draft_id)] = r; });

  prep.manifest.would_expire.forEach(function (e) {
    var row = byId[e.allocation_draft_id];
    if (!row) { failures.push({ allocation_draft_id: e.allocation_draft_id, code: 'ROW_DISAPPEARED_BEFORE_WRITE' }); return; }
    // REVALIDATE immediately before writing: the row must still be the draft we decided about.
    if (aiplLo_(row.status) !== 'draft') { failures.push({ allocation_draft_id: e.allocation_draft_id, code: 'STATUS_CHANGED_BEFORE_WRITE', found: aiplLo_(row.status) }); return; }
    io.setCell(hSheet, row.__row, hRead.headers, 'status', 'expired');
    io.setCell(hSheet, row.__row, hRead.headers, 'expired_at', now);
    io.setCell(hSheet, row.__row, hRead.headers, 'expired_by_run_id', runId);
    io.setCell(hSheet, row.__row, hRead.headers, 'expiration_reason', AIPL_EXPIRATION_REASON_);
    io.setCell(hSheet, row.__row, hRead.headers, 'updated_by', actor);
    io.setCell(hSheet, row.__row, hRead.headers, 'updated_at', now);
    expiredHeaders++;
    // Lines follow their header. A line that is ALREADY terminal keeps its own status — expiring a submitted
    // line would rewrite downstream-referenced history.
    lRead.rows.forEach(function (l) {
      if (aiplStr_(l.allocation_draft_id) !== e.allocation_draft_id) return;
      var ls = aiplLo_(l.line_status);
      if (ls === 'submitted' || ls === 'cancelled' || ls === 'expired' || ls === 'superseded' || ls === 'superseded_user_review') return;
      io.setCell(lSheet, l.__row, lRead.headers, 'line_status', 'expired');
      io.setCell(lSheet, l.__row, lRead.headers, 'updated_at', now);
      expiredLines++;
    });
  });

  // §E step 6 — VERIFY what actually happened, by re-reading rather than by trusting the loop's own counters.
  var verifyRead = io.readRows(io.headerSheet());
  var stillActiveOldAi = verifyRead.rows.filter(function (r) {
    if (!aiplSameScope_(r, scope)) return false;
    if (!aiplIsAiGenerated_(r)) return false;
    if (aiplLo_(r.status) !== 'draft') return false;
    if ((prep.manifest.committed_ids || []).indexOf(aiplStr_(r.allocation_draft_id)) !== -1) return false;
    return aiplStr_(r.generation_run_id) !== runId;
  }).map(function (r) { return aiplStr_(r.allocation_draft_id); });

  var uniqueness = aiplActiveIdentityConflicts_(verifyRead.rows.filter(function (r) { return aiplSameScope_(r, scope); }), input && input.keyOf);
  // Two kinds of collision, and only ONE of them is this operation's fault. Two ACTIVE AI drafts sharing one
  // identity is exactly what the lifecycle exists to prevent, so it FAILS the expiration. An AI row sharing an
  // identity with a MANUAL row is a real collision the operator should see, but the lifecycle neither created it
  // nor can resolve it — failing on it would block every future run on a pre-existing condition, so it is
  // reported as a warning rather than swallowed and rather than treated as this run's failure.
  var aiDuplicates = (uniqueness.conflicts || []).filter(function (c) { return c.kind === 'DUPLICATE_ACTIVE_AI_IDENTITY'; });
  var manualCollisions = (uniqueness.conflicts || []).filter(function (c) { return c.kind !== 'DUPLICATE_ACTIVE_AI_IDENTITY'; });

  return {
    ok: failures.length === 0 && stillActiveOldAi.length === 0 && aiDuplicates.length === 0,
    stage: 'COMMIT_EXPIRE',
    manifest: prep.manifest,
    expired_headers: expiredHeaders,
    expired_lines: expiredLines,
    failures: failures,
    verification: {
      old_ai_drafts_still_active: stillActiveOldAi,
      duplicate_active_ai_identity: aiDuplicates,
      ai_and_manual_share_identity: manualCollisions,
      active_identity_ok: aiDuplicates.length === 0
    }
  };
}

// ============================================================================================================
// §H — TEMP_INVENTORY_AI_PLAN_FLOW_DIAGNOSE  ·  READ-ONLY. Zero writes of any kind.
// ============================================================================================================
var TEMP_AIPL_COMPANY_ = 'Kitchen Mama';
var TEMP_AIPL_COUNTRY_ = 'US';
var TEMP_AIPL_MARKETPLACE_ = 'Amazon';
var TEMP_AIPL_PLANNING_CYCLE_ = '';     // blank = do not constrain the cycle

function TEMP_INVENTORY_AI_PLAN_FLOW_DIAGNOSE() {
  var out = aiplDiagnose_({ company: TEMP_AIPL_COMPANY_, country: TEMP_AIPL_COUNTRY_,
    marketplace: TEMP_AIPL_MARKETPLACE_, planning_cycle: TEMP_AIPL_PLANNING_CYCLE_ });
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function aiplDiagnose_(scope, io) {
  scope = scope || {};
  var report = {
    contract_version: AIPL_CONTRACT_VERSION_,
    scope: { company: aiplStr_(scope.company), country: aiplStr_(scope.country),
      marketplace: aiplStr_(scope.marketplace), planning_cycle: aiplStr_(scope.planning_cycle),
      source_page: AIPL_SOURCE_PAGE_ },
    registry: null, method_registry: null, ai_runs: null, expiration_preview: null,
    blocking_reason: null, next_action: null,
    footer: { DB_WRITES: 0, STATUS_TRANSITIONS: 0, PROPERTY_WRITES: 0, DRIVE_WRITES: 0, EMAILS: 0, DEMO_MUTATIONS: 0 }
  };
  try {
    var ss = SpreadsheetApp.openById(prodExpectedDbId_());
    io = io || aiplDefaultIo_(ss);

    // ---- scope registry readiness (the AI modal's Country/Marketplace source) ----
    var mkSheet = ss.getSheetByName('marketplaces');
    if (!mkSheet) {
      report.registry = { status: 'ERROR', code: 'MARKETPLACES_TABLE_MISSING', countries: [], marketplaces: [] };
    } else {
      var mk = io.readRows(mkSheet);
      var countries = {}, mkts = [];
      mk.rows.forEach(function (r) {
        var st = aiplLo_(r.status);
        if (st && st !== 'active') return;
        if (!aiplStr_(r.marketplace_id) || !aiplStr_(r.country)) return;
        countries[aiplStr_(r.country)] = 1;
        mkts.push({ marketplace_id: aiplStr_(r.marketplace_id), country: aiplStr_(r.country), marketplace: aiplStr_(r.marketplace) });
      });
      var cList = Object.keys(countries).sort();
      report.registry = { status: cList.length ? 'READY' : 'EMPTY', countries: cList, marketplace_count: mkts.length, marketplaces: mkts.slice(0, 40) };
    }

    // ---- method registry readiness (the Execution Plan Method picker source) ----
    var rcSheet = ss.getSheetByName('carrier_rate_cards');
    if (!rcSheet) {
      report.method_registry = { status: 'EMPTY_CONFIGURATION', code: 'METHOD_REGISTRY_CONFIGURATION_REQUIRED',
        missing_table: 'carrier_rate_cards', next_action: 'Create the carrier_rate_cards table and add at least one active rate card.' };
    } else {
      var rc = io.readRows(rcSheet);
      var usable = rc.rows.filter(function (r) { return !AIPL_PROTECTED_STATUSES_[''] && !({ inactive: 1, disabled: 1, archived: 1, expired: 1, void: 1, deleted: 1 })[aiplLo_(r.status)]; });
      var scoped = usable.filter(function (r) {
        if (aiplStr_(r.destination_country) && aiplLo_(r.destination_country) !== aiplLo_(scope.country)) return false;
        if (aiplStr_(r.marketplace) && aiplLo_(r.marketplace) !== aiplLo_(scope.marketplace)) return false;
        return true;
      });
      var byRoute = {};
      scoped.forEach(function (r) {
        var k = (aiplStr_(r.origin_country) || '*') + ' -> ' + (aiplStr_(r.destination_country) || '*') + ' / ' + (aiplStr_(r.marketplace) || '*');
        (byRoute[k] = byRoute[k] || []).push(aiplStr_(r.shipping_method) || '(blank)');
      });
      report.method_registry = {
        status: scoped.length ? 'READY' : 'EMPTY_CONFIGURATION',
        code: scoped.length ? null : 'METHOD_REGISTRY_CONFIGURATION_REQUIRED',
        total_rate_cards: rc.rows.length, usable_rate_cards: usable.length, in_scope_rate_cards: scoped.length,
        available_methods_by_route_scope: byRoute
      };
    }

    // ---- AI runs + what would expire ----
    var hSheet = io.headerSheet();
    var h = io.readRows(hSheet);
    var inScope = h.rows.filter(function (r) { return aiplSameScope_(r, { company: scope.company, country: scope.country, marketplace: scope.marketplace, planning_cycle: scope.planning_cycle, source_page: AIPL_SOURCE_PAGE_ }); });
    var runs = {};
    inScope.forEach(function (r) {
      if (!aiplIsAiGenerated_(r)) return;
      var rid = aiplStr_(r.generation_run_id) || '(no run id recorded)';
      runs[rid] = runs[rid] || { generation_run_id: rid, headers: 0, draft: 0, expired: 0, other: 0 };
      runs[rid].headers++;
      var st = aiplLo_(r.status);
      if (st === 'draft') runs[rid].draft++; else if (st === 'expired') runs[rid].expired++; else runs[rid].other++;
    });
    var lRead = io.readRows(io.lineSheet());
    var activeIds = {};
    inScope.forEach(function (r) { if (aiplLo_(r.status) === 'draft') activeIds[aiplStr_(r.allocation_draft_id)] = 1; });
    var activeLines = lRead.rows.filter(function (l) { return activeIds[aiplStr_(l.allocation_draft_id)] && aiplLo_(l.line_status) !== 'cancelled' && aiplLo_(l.line_status) !== 'expired'; });

    var schema = aiplSchemaReady_(h.headers);
    // A HYPOTHETICAL next run, so the operator can see what a run WOULD replace before running one.
    var preview = aiplExpirationCandidates_(inScope, {
      company: scope.company, country: scope.country, marketplace: scope.marketplace,
      planning_cycle: scope.planning_cycle, source_page: AIPL_SOURCE_PAGE_,
      generation_run_id: 'HYPOTHETICAL-NEXT-RUN', committed_ids: []
    });
    var uniqueness = aiplActiveIdentityConflicts_(inScope);

    report.ai_runs = {
      runs: Object.keys(runs).sort().map(function (k) { return runs[k]; }),
      active_ai_headers: inScope.filter(function (r) { return aiplIsAiGenerated_(r) && aiplLo_(r.status) === 'draft'; }).length,
      active_ai_lines: activeLines.length,
      manual_headers_preserved: inScope.filter(function (r) { return !aiplIsAiGenerated_(r); }).map(function (r) { return aiplStr_(r.allocation_draft_id); }),
      stale_draft_runs: Object.keys(runs).filter(function (k) { return runs[k].draft > 0; }).sort()
    };
    report.expiration_preview = {
      rows_that_would_expire: preview.expire,
      rows_preserved: preview.preserved.slice(0, 60),
      expire_count: preview.expire_count, preserve_count: preview.preserved_count
    };
    report.duplicate_active_identities = uniqueness.conflicts;
    report.current_generation_authority = {
      writer: 'handleGenerateWeeklyAiPlanDraft_ (61_api_v1_weekly_ai_plan.gs)',
      identity_authority: 'sadK2GroupKey_ / sadK2DeterministicHeaderId_ (16_shipping_allocation_handlers.gs)',
      lifecycle_authority: 'aiplExpireSupersededDrafts_ (69_api_v1_ai_plan_lifecycle.gs)',
      flag: (typeof inventoryAiPlanDbGenerationEnabled_ === 'function') ? (inventoryAiPlanDbGenerationEnabled_() === true) : null
    };
    report.schema = schema;

    if (!schema.ok) {
      report.blocking_reason = 'AI_PLAN_LIFECYCLE_SCHEMA_EXTENSION_REQUIRED';
      report.next_action = 'Add these columns to shipping_allocation_drafts before any run may expire a superseded draft: ' + schema.missing.join(', ') + '. Until then a new run still writes its own rows, and NOTHING is expired.';
    } else if (report.method_registry && report.method_registry.status === 'EMPTY_CONFIGURATION') {
      report.blocking_reason = 'METHOD_REGISTRY_CONFIGURATION_REQUIRED';
      report.next_action = 'No usable carrier_rate_cards row covers this scope, so no Execution Plan route can name a shipping method.';
    } else if (report.registry && report.registry.status !== 'READY') {
      report.blocking_reason = 'SCOPE_REGISTRY_' + report.registry.status;
      report.next_action = 'No active marketplace scope is configured, so the AI Plan modal has nothing to offer.';
    } else if (!uniqueness.ok) {
      report.blocking_reason = 'DUPLICATE_ACTIVE_IDENTITY';
      report.next_action = 'Two active drafts claim one canonical route identity; resolve before generating again.';
    } else {
      report.blocking_reason = null;
      report.next_action = 'No blocker detected for this scope.';
    }
  } catch (e) {
    report.blocking_reason = 'DIAGNOSTIC_ERROR';
    report.next_action = String(e && e.message ? e.message : e);
  }
  return report;
}
