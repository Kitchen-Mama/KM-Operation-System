// Kitchen Mama Operation System — Recommendation Persistence production REPOSITORY logic (Phase 2C, Round 1D).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC implementation of the frozen §Persist-Adapter contract in
// docs/planning/RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md (FROZEN 2026-08-03, Round 1C). This is the
// CANONICAL, Node-testable algorithm authority for the production repository (model B): it operates over a
// plain in-memory "sheet set" ({ tableName: { headers:[...], rows:[[...]] } }) so it can be exercised with a
// fake sheet in Node. The Apps Script wrapper (assets/specs/active/apps-script/23_recommendation_persistence_
// repository.gs) is a THIN Sheet-I/O adapter over these same helpers — no algorithm is duplicated there.
//
// Implements (Round 1D Slice 1): additive-header ensure, recommendation_calculation_runs schema, Active-Draft
// reader, draft-snapshot reader, incomplete-run reader, PersistencePlan validation, {draft_version,
// userEditFingerprint} token, natural-key line upsert (INSERT/UPDATE/SUPERSEDE) with user-edit preservation +
// conservative legacy protection, run-stage journal, idempotent replay + partial-write recovery, totals.
//
// NOT in scope (Round 1D §25): NO LockService, NO Scheduler/Trigger, NO calc engine, NO Request writer, NO
// Weekly-Plan promotion, NO Submit, NO B-6/B-8, NO deploy/migration. `applyPersistencePlan` is NOT race-safe
// without LockService (next round). No clock / no Math.random: timestamps + actor come in via opts.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistenceRepository = api; }
})(this, function () {
  'use strict';

  // ---- frozen constants (Round 1C PA-4/-5/-6/-8) ----------------------------
  var LINE_ADDITIVE_HEADERS = ['user_edited', 'user_edited_by'];
  var RUN_JOURNAL_HEADERS = [
    'calculation_run_id', 'recommendation_type', 'draft_id', 'planning_cycle', 'business_scope_key',
    'draft_version', 'run_status', 'current_stage', 'formula_version', 'source_data_as_of',
    'started_by', 'started_at', 'completed_by', 'completed_at', 'error_summary', 'attempt_count'
  ];
  var RUN_STATUSES = { RUNNING: 1, PARTIAL: 1, COMPLETED: 1, FAILED: 1 };
  var STAGES = ['RUN_METADATA', 'HEADER', 'LINES', 'RECONCILE', 'LINEAGE', 'TOTALS', 'COMPLETED'];
  var LINE_OPS = { INSERT: 1, UPDATE: 1, SUPERSEDE: 1 };
  // additive line_status values on top of the existing draft/submitted/cancelled
  var LINE_STATES = { active: 1, blocked: 1, superseded: 1, superseded_user_review: 1, draft: 1, submitted: 1, cancelled: 1 };
  var ACTIVE_DRAFT_STATUSES = { draft: 1, site_confirmed: 1 };
  var RUN_JOURNAL_TABLE = 'recommendation_calculation_runs';

  // Per recommendation_type: source tables, business-scope columns, line natural-key columns, user-qty column.
  var TABLES = {
    WEEKLY_SHIPPING: {
      header: 'shipping_allocation_drafts', lines: 'shipping_allocation_draft_lines',
      headerId: 'allocation_draft_id', lineDraftId: 'allocation_draft_id', lineId: 'allocation_draft_line_id',
      scope: ['planning_cycle', 'company', 'country', 'marketplace', 'source_page'],
      // F1-4B-FM6-R3C2: the WEEKLY line grain gains a per-source execution axis so ONE recommendation (one
      // aggregate recommended_qty per sku/site/window) can persist MULTIPLE physical-source execution lines
      // (Overseas / Factory) without changing the recommendation formula. source_warehouse_id + route_no are
      // NULLABLE key parts (Phase 3 deterministic nullable-key normalization): a single-source, unsourced/
      // all-uncovered, or historical line carries a BLANK value — a genuinely empty source, NOT a fake warehouse —
      // and blank normalizes deterministically to the same key part (never rejected, never a duplicate-by-format).
      lineKey: ['sku', 'site_sku', 'window_code', 'source_warehouse_id', 'route_no'],
      nullableLineKey: { source_warehouse_id: 1, route_no: 1 }, userQty: 'planned_qty'
    },
    MONTHLY_ORDER: {
      header: 'request_order_allocation_drafts', lines: 'request_order_allocation_draft_lines',
      headerId: 'request_allocation_draft_id', lineDraftId: 'request_allocation_draft_id', lineId: 'request_allocation_line_id',
      scope: ['planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku'],
      lineKey: ['request_month', 'request_bucket'], userQty: 'order_qty'
    }
  };

  // ---- helpers --------------------------------------------------------------
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function tableCfg(type) { aRange(TABLES[type], 'unknown recommendationType: ' + type); return TABLES[type]; }
  function isBool(v) { return v === true || v === 'TRUE' || v === 'true'; }
  function boolCell(v) { return v ? 'TRUE' : 'FALSE'; }

  // deterministic 32-bit FNV-1a hash → hex (no clock/random/locale)
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // additive-only header ensure: append any missing REQUIRED columns; never reorder/remove existing.
  function ensureHeaders(existing, required) {
    aType(Array.isArray(existing) && Array.isArray(required), 'ensureHeaders needs arrays');
    var out = existing.slice(), added = [];
    required.forEach(function (h) { if (out.indexOf(h) === -1) { out.push(h); added.push(h); } });
    return { headers: out, added: added, changed: added.length > 0 };
  }

  function buildBusinessScopeKey(type, scopeObj) {
    var cfg = tableCfg(type);
    aType(isObj(scopeObj), 'businessScope must be an object');
    return cfg.scope.map(function (c) { return c + '=' + String(scopeObj[c] === undefined || scopeObj[c] === null ? '' : scopeObj[c]); }).join('|');
  }

  // fingerprint over user-owned state: sorted (lineKey, userQty, userEdited). Legacy-protected rows participate.
  function buildUserEditFingerprint(lineTuples) {
    aType(Array.isArray(lineTuples), 'lineTuples must be an array');
    var canon = lineTuples.map(function (t) {
      return String(t.lineKey) + '' + String(t.userQty === undefined || t.userQty === null ? '' : t.userQty) + '' + (isBool(t.userEdited) ? '1' : '0');
    }).sort(cmpStr).join('');
    return fnv1a(canon);
  }
  function computeExpectedToken(draftVersion, lineTuples) {
    return { draft_version: draftVersion, userEditFingerprint: buildUserEditFingerprint(lineTuples) };
  }
  function tokensMatch(a, b) {
    return !!a && !!b && String(a.draft_version) === String(b.draft_version) && String(a.userEditFingerprint) === String(b.userEditFingerprint);
  }

  // ---- sheet-set primitives (fake sheet = { headers:[], rows:[[]] }) ---------
  function getTable(sheetSet, name) {
    var t = sheetSet[name];
    aType(t && Array.isArray(t.headers) && Array.isArray(t.rows), 'missing/invalid table: ' + name);
    return t;
  }
  function rowObj(headers, row) { var o = {}; for (var i = 0; i < headers.length; i++) o[headers[i]] = row[i]; return o; }
  function objRow(headers, obj) { return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }); }
  function tableObjects(t) { return t.rows.map(function (r) { return rowObj(t.headers, r); }); }
  function matchesScope(o, cfg, query) { for (var i = 0; i < cfg.scope.length; i++) { var c = cfg.scope[i]; if (String(o[c] === undefined ? '' : o[c]) !== String(query[c] === undefined ? '' : query[c])) return false; } return true; }
  function naturalKeyStr(cols, o) { return cols.map(function (c) { return String(o[c] === undefined || o[c] === null ? '' : o[c]); }).join(''); }

  // ---- PA-2/PA-11: Active Draft reader (literal scope, no latest-wins) -------
  function loadActiveDraftContext(sheetSet, query) {
    aType(isObj(query) && typeof query.recommendationType === 'string', 'query needs recommendationType');
    var cfg = tableCfg(query.recommendationType);
    aType(typeof query.planningCycle === 'string' && query.planningCycle.length > 0, 'query.planningCycle required');
    aType(isObj(query.businessScope), 'query.businessScope required');
    var scopeQ = {}; scopeQ.planning_cycle = query.planningCycle;
    cfg.scope.forEach(function (c) { if (c !== 'planning_cycle') scopeQ[c] = query.businessScope[c] === undefined ? '' : query.businessScope[c]; });
    var t = getTable(sheetSet, cfg.header);
    var scopeKey = buildBusinessScopeKey(query.recommendationType, scopeQ);
    var matches = tableObjects(t).filter(function (o) {
      return ACTIVE_DRAFT_STATUSES[String(o.status || '').trim()] === 1 && matchesScope(o, cfg, scopeQ);
    });
    if (matches.length === 0) return { status: 'CREATE', activeKey: query.recommendationType + '::' + scopeKey, draftId: null, businessScopeKey: scopeKey };
    if (matches.length === 1) return { status: 'REUSE', activeKey: query.recommendationType + '::' + scopeKey, draftId: matches[0][cfg.headerId], draft: matches[0], businessScopeKey: scopeKey };
    return { status: 'BLOCKED_CONFLICT', activeKey: query.recommendationType + '::' + scopeKey, draftId: null, matchCount: matches.length, businessScopeKey: scopeKey };
  }

  // ---- PA-2: draft snapshot reader (legacy rows conservatively protected) ----
  function loadDraftSnapshot(sheetSet, draftId, recommendationType) {
    var cfg = tableCfg(recommendationType);
    aType(typeof draftId === 'string' && draftId.length > 0, 'draftId required');
    var hT = getTable(sheetSet, cfg.header), lT = getTable(sheetSet, cfg.lines);
    var draft = tableObjects(hT).filter(function (o) { return String(o[cfg.headerId]) === draftId; })[0] || null;
    var hasUserEditedCol = lT.headers.indexOf('user_edited') !== -1;
    var lines = tableObjects(lT).filter(function (o) { return String(o[cfg.lineDraftId]) === draftId; }).map(function (o) {
      var lineKey = naturalKeyStr(cfg.lineKey, o);
      // Legacy rows without an explicit user_edited column/value are treated as PROTECTED (never value-comparison).
      var explicit = hasUserEditedCol && (o.user_edited === true || o.user_edited === false || o.user_edited === 'TRUE' || o.user_edited === 'FALSE');
      var userEdited = explicit ? isBool(o.user_edited) : true; // conservative protect when unknown
      return { lineKey: lineKey, raw: o, userQty: o[cfg.userQty], userEdited: userEdited, legacyProtected: !explicit, lineStatus: String(o.line_status || '').trim() };
    });
    lines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
    var runs = [];
    if (sheetSet[RUN_JOURNAL_TABLE]) runs = tableObjects(getTable(sheetSet, RUN_JOURNAL_TABLE)).filter(function (o) { return String(o.draft_id) === draftId; });
    return { draft: draft, lines: lines, runs: runs };
  }

  // ---- PA-2: incomplete-run reader ------------------------------------------
  function loadIncompleteRun(sheetSet, draftId) {
    aType(typeof draftId === 'string' && draftId.length > 0, 'draftId required');
    if (!sheetSet[RUN_JOURNAL_TABLE]) return { status: 'NOT_FOUND' };
    var runs = tableObjects(getTable(sheetSet, RUN_JOURNAL_TABLE)).filter(function (o) {
      return String(o.draft_id) === draftId && (o.run_status === 'RUNNING' || o.run_status === 'PARTIAL');
    });
    if (runs.length === 0) return { status: 'NOT_FOUND' };
    if (runs.length === 1) return { status: 'FOUND', run: runs[0] };
    return { status: 'BLOCKED_CONFLICT', matchCount: runs.length };
  }

  // ---- PA-7: PersistencePlan validation (structural throws) ------------------
  function hasSheetRef(v) {
    if (typeof v === 'function') return true;
    if (v && typeof v === 'object') { if (typeof v.getRange === 'function' || typeof v.getValues === 'function' || typeof v.getSheetByName === 'function' || typeof v.getA1Notation === 'function') return true; }
    return false;
  }
  function validatePersistencePlan(plan) {
    aType(isObj(plan), 'plan must be an object');
    aRange(TABLES[plan.recommendationType], 'plan.recommendationType invalid');
    aType(isObj(plan.sourceTables) && typeof plan.sourceTables.header === 'string' && typeof plan.sourceTables.lines === 'string', 'plan.sourceTables invalid');
    aType(typeof plan.draftId === 'string' && plan.draftId.length > 0, 'plan.draftId required');
    aType(typeof plan.activeKey === 'string' && plan.activeKey.length > 0, 'plan.activeKey required');
    aType(typeof plan.calculationRunId === 'string' && plan.calculationRunId.length > 0, 'plan.calculationRunId required');
    aType(plan.draftVersion !== undefined, 'plan.draftVersion required');
    aType(isObj(plan.expectedToken) && plan.expectedToken.draft_version !== undefined && typeof plan.expectedToken.userEditFingerprint === 'string', 'plan.expectedToken invalid');
    aType(isObj(plan.runMeta), 'plan.runMeta required');
    aType(isObj(plan.headerOp) && (plan.headerOp.op === 'INSERT' || plan.headerOp.op === 'UPDATE'), 'plan.headerOp op must be INSERT|UPDATE');
    aType(isObj(plan.headerOp.row), 'plan.headerOp.row required');
    aType(Array.isArray(plan.lineOps), 'plan.lineOps must be an array');
    aType(Array.isArray(plan.lineageOps), 'plan.lineageOps must be an array');
    aType(isObj(plan.totals), 'plan.totals required');
    aType(Array.isArray(plan.stages), 'plan.stages must be an array');
    aRange(plan.stages.length === STAGES.length && plan.stages.every(function (s, i) { return s === STAGES[i]; }), 'plan.stages must equal the frozen stage sequence');
    aType(Array.isArray(plan.auditEvents), 'plan.auditEvents must be an array');
    aType(!hasSheetRef(plan.headerOp.row) && Object.keys(plan.headerOp.row).every(function (k) { return !hasSheetRef(plan.headerOp.row[k]); }), 'headerOp.row has a Sheet/Range/function reference');
    var cfg = TABLES[plan.recommendationType], seen = {};
    plan.lineOps.forEach(function (op, i) {
      aType(isObj(op), 'lineOps[' + i + '] must be object');
      aRange(LINE_OPS[op.op] === 1, 'lineOps[' + i + '].op must be INSERT|UPDATE|SUPERSEDE');
      aType(isObj(op.naturalKey), 'lineOps[' + i + '].naturalKey required');
      // F1-4B-FM6-R3C2: a NULLABLE key part (source_warehouse_id / route_no) may be blank (deterministic
      // normalization — blank is a valid "unsourced" key part, not missing identity); non-nullable parts stay required.
      var nlk = cfg.nullableLineKey || {};
      cfg.lineKey.forEach(function (kc) { if (nlk[kc] === 1) { aType(op.naturalKey[kc] !== undefined && op.naturalKey[kc] !== null, 'lineOps[' + i + '] nullable natural-key part must be defined (may be blank): ' + kc); } else { aType(op.naturalKey[kc] !== undefined && op.naturalKey[kc] !== null && op.naturalKey[kc] !== '', 'lineOps[' + i + '] missing natural-key part: ' + kc); } });
      var nk = naturalKeyStr(cfg.lineKey, op.naturalKey);
      aRange(seen[nk] !== 1, 'duplicate lineOps natural key: ' + nk); seen[nk] = 1;
      if (op.op !== 'SUPERSEDE') {
        aType(isObj(op.row), 'lineOps[' + i + '].row required for ' + op.op);
        aType(Object.keys(op.row).every(function (k) { return !hasSheetRef(op.row[k]); }), 'lineOps[' + i + '].row has a Sheet/Range/function reference');
        if (op.targetLineStatus === 'blocked') { /* blocked → qty may be null */ }
        else if (op.row[cfg.userQty] !== undefined && op.row[cfg.userQty] !== null && op.row[cfg.userQty] !== '') {
          var q = Number(op.row[cfg.userQty]); aRange(isFinite(q) && q >= 0, 'lineOps[' + i + '] user qty must be finite ≥ 0');
        }
      }
      if (op.targetLineStatus !== undefined) aRange(LINE_STATES[op.targetLineStatus] === 1, 'lineOps[' + i + '].targetLineStatus invalid');
    });
    return true;
  }

  // ---- PA-8: applyPersistencePlan (idempotent, resumable, token-guarded) -----
  // opts = { now, actor, startedBy, failBeforeStage, failBeforeMark } (all optional; no clock/random inside)
  function upsertRow(t, keyCols, keyObj, valueObj, mode) {
    // mode: 'insert' | 'update' | 'blind' ; returns {action, index} ; BLOCKED_CONFLICT on duplicate key
    var target = -1, dup = 0, i, o;
    for (i = 0; i < t.rows.length; i++) { o = rowObj(t.headers, t.rows[i]); if (naturalKeyStr(keyCols, o) === naturalKeyStr(keyCols, keyObj)) { dup++; if (target === -1) target = i; } }
    if (dup > 1) return { action: 'BLOCKED_CONFLICT' };
    if (target === -1) { t.rows.push(objRow(t.headers, valueObj)); return { action: 'INSERT', index: t.rows.length - 1 }; }
    var cur = rowObj(t.headers, t.rows[target]);
    for (var k in valueObj) if (valueObj.hasOwnProperty(k)) cur[k] = valueObj[k];
    t.rows[target] = objRow(t.headers, cur);
    return { action: 'UPDATE', index: target };
  }

  function applyPersistencePlan(sheetSet, plan, expectedToken, opts) {
    validatePersistencePlan(plan);
    opts = opts || {};
    var cfg = TABLES[plan.recommendationType];
    var hT = getTable(sheetSet, cfg.header), lT = getTable(sheetSet, cfg.lines), rT = getTable(sheetSet, RUN_JOURNAL_TABLE);
    var now = opts.now !== undefined ? opts.now : '', actor = opts.actor !== undefined ? opts.actor : '';

    // Token revalidation against the CURRENTLY loaded snapshot — no writes on mismatch (NOT race-safe w/o lock).
    var snap = loadDraftSnapshot(sheetSet, plan.draftId, plan.recommendationType);
    var liveFingerprint = buildUserEditFingerprint(snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
    // draft_version component: compare the header's persisted draft_version when the draft already exists
    var persistedVersion = snap.draft ? snap.draft.draft_version : (plan.headerOp.op === 'INSERT' ? plan.draftVersion : undefined);
    var liveToken = { draft_version: persistedVersion === undefined ? expectedToken.draft_version : persistedVersion, userEditFingerprint: liveFingerprint };
    if (!tokensMatch(liveToken, expectedToken)) {
      return { runStatus: 'CONFLICT', conflict: true, stageReached: null, reason: 'TOKEN_MISMATCH', expected: expectedToken, live: liveToken };
    }

    // resolve run + resume point (idempotent replay: re-run from the stage AFTER the last completed one)
    var runFind = null, ri;
    for (ri = 0; ri < rT.rows.length; ri++) { var ro = rowObj(rT.headers, rT.rows[ri]); if (String(ro.calculation_run_id) === plan.calculationRunId) { runFind = ro; break; } }
    var startIdx = 0, attempt = 1;
    if (runFind) {
      attempt = (parseInt(runFind.attempt_count, 10) || 1) + 1;
      if (runFind.run_status === 'PARTIAL' || runFind.run_status === 'RUNNING') {
        // resume the in-flight run from the stage AFTER the last successfully-completed one
        startIdx = runFind.current_stage ? STAGES.indexOf(runFind.current_stage) + 1 : 0;
        if (startIdx < 0 || startIdx >= STAGES.length) startIdx = 0;
      } else {
        // COMPLETED / FAILED → re-drive from the start; every stage is an idempotent natural-key upsert,
        // so a same-content replay is a no-op and a changed-content refresh applies the new content.
        startIdx = 0;
      }
    }

    function markStage(stage, status, err) {
      var run = {
        calculation_run_id: plan.calculationRunId, recommendation_type: plan.recommendationType, draft_id: plan.draftId,
        planning_cycle: (plan.runMeta.planning_cycle !== undefined ? plan.runMeta.planning_cycle : ''), business_scope_key: (plan.runMeta.business_scope_key !== undefined ? plan.runMeta.business_scope_key : ''),
        draft_version: plan.draftVersion, run_status: status, current_stage: stage,
        formula_version: (plan.runMeta.formulaVersion !== undefined ? plan.runMeta.formulaVersion : ''), source_data_as_of: (plan.runMeta.sourceDataAsOf !== undefined ? plan.runMeta.sourceDataAsOf : ''),
        started_by: (runFind ? runFind.started_by : (opts.startedBy !== undefined ? opts.startedBy : actor)), started_at: (runFind ? runFind.started_at : now),
        completed_by: status === 'COMPLETED' ? actor : (runFind ? runFind.completed_by : ''), completed_at: status === 'COMPLETED' ? now : (runFind ? runFind.completed_at : ''),
        error_summary: err || '', attempt_count: attempt
      };
      var res = upsertRow(rT, ['calculation_run_id'], run, run, 'blind');
      if (res.action === 'INSERT' || res.action === 'UPDATE') runFind = run;
      return res;
    }

    var counts = { inserted: 0, updated: 0, superseded: 0, blocked: 0, skipped: 0 };
    var i;
    for (i = startIdx; i < STAGES.length; i++) {
      var stage = STAGES[i];
      if (opts.failBeforeStage === stage) { markStage(i > 0 ? STAGES[i - 1] : null, 'PARTIAL', 'failBeforeStage:' + stage); return { runStatus: 'PARTIAL', stageReached: i > 0 ? STAGES[i - 1] : null, applied: counts }; }

      if (stage === 'RUN_METADATA') { markStage('RUN_METADATA', 'RUNNING'); }
      else if (stage === 'HEADER') {
        var hrow = defObj(cfg.headerId, plan.draftId, plan.headerOp.row);
        var hres = upsertRow(hT, [cfg.headerId], hrow, hrow, plan.headerOp.op === 'INSERT' ? 'insert' : 'update');
        if (hres.action === 'BLOCKED_CONFLICT') { markStage('RUN_METADATA', 'FAILED', 'DUPLICATE_HEADER'); return { runStatus: 'FAILED', stageReached: 'RUN_METADATA', reason: 'DUPLICATE_HEADER' }; }
      }
      else if (stage === 'LINES') {
        var lr = applyLineOps(lT, cfg, plan.lineOps, ['INSERT', 'UPDATE'], now, actor, snap, counts);
        if (lr) { markStage('HEADER', 'FAILED', lr); return { runStatus: 'FAILED', stageReached: 'HEADER', reason: lr }; }
      }
      else if (stage === 'RECONCILE') {
        var rr = applyLineOps(lT, cfg, plan.lineOps, ['SUPERSEDE'], now, actor, snap, counts);
        if (rr) { markStage('LINES', 'FAILED', rr); return { runStatus: 'FAILED', stageReached: 'LINES', reason: rr }; }
      }
      else if (stage === 'LINEAGE') {
        if (lT.headers.indexOf('calculation_run_id') !== -1 || lT.headers.indexOf('source_data_as_of') !== -1) {
          plan.lineageOps.forEach(function (op) {
            var v = {}; if (lT.headers.indexOf('calculation_run_id') !== -1) v.calculation_run_id = plan.calculationRunId; if (lT.headers.indexOf('source_data_as_of') !== -1) v.source_data_as_of = plan.runMeta.sourceDataAsOf || '';
            upsertRow(lT, cfg.lineKey, op.naturalKey, mergeKey(cfg.lineKey, op.naturalKey, v), 'update');
          });
        }
      }
      else if (stage === 'TOTALS') {
        // Header totals: request/shipping draft headers have NO persisted total columns → validate-only (honest skip).
        // (If a future total column is added, write it here; today none exists.)
      }
      else if (stage === 'COMPLETED') { markStage('COMPLETED', 'COMPLETED'); }

      if (stage !== 'RUN_METADATA' && stage !== 'COMPLETED') {
        if (opts.failBeforeMark === stage) { /* writes done, marker NOT written → run stays at prior stage (crash) */ return { runStatus: 'PARTIAL', stageReached: STAGES[i - 1], applied: counts, crashedAt: stage }; }
        markStage(stage, i === STAGES.length - 1 ? 'COMPLETED' : 'PARTIAL');
      }
    }
    return { runStatus: 'COMPLETED', stageReached: 'COMPLETED', applied: counts };
  }

  function defObj(idCol, idVal, row) { var o = {}; for (var k in row) o[k] = row[k]; if (o[idCol] === undefined) o[idCol] = idVal; return o; }
  function mergeKey(keyCols, keyObj, extra) { var o = {}; keyCols.forEach(function (c) { o[c] = keyObj[c]; }); for (var k in extra) o[k] = extra[k]; return o; }

  // apply a subset of line ops (INSERT/UPDATE or SUPERSEDE) with user-edit preservation + legacy protection
  function applyLineOps(lT, cfg, lineOps, allowed, now, actor, snap, counts) {
    var protectedKeys = {}; snap.lines.forEach(function (l) { if (l.userEdited || l.legacyProtected) protectedKeys[l.lineKey] = 1; });
    for (var i = 0; i < lineOps.length; i++) {
      var op = lineOps[i]; if (allowed.indexOf(op.op) === -1) continue;
      var nk = naturalKeyStr(cfg.lineKey, op.naturalKey);
      if (op.op === 'SUPERSEDE') {
        var sres = supersedeLine(lT, cfg, op.naturalKey, op.targetLineStatus || (protectedKeys[nk] ? 'superseded_user_review' : 'superseded'), now, actor);
        if (sres === 'BLOCKED_CONFLICT') return 'DUPLICATE_LINE_KEY:' + nk;
        if (sres === 'INSERT' || sres === 'UPDATE') counts.superseded++;
        continue;
      }
      // INSERT / UPDATE
      var blocked = op.targetLineStatus === 'blocked';
      var row = {}; for (var k in op.row) row[k] = op.row[k];
      cfg.lineKey.forEach(function (c) { row[c] = op.naturalKey[c]; });
      if (lT.headers.indexOf(cfg.lineDraftId) !== -1 && op.naturalKey[cfg.lineDraftId] !== undefined) row[cfg.lineDraftId] = op.naturalKey[cfg.lineDraftId];
      row.line_status = blocked ? 'blocked' : (op.targetLineStatus || 'active');
      // user-edit preservation: on a system refresh over a protected/edited row, DO NOT touch the user-qty column
      var preserve = op.preserveUserQty === true || (op.op === 'UPDATE' && protectedKeys[nk]);
      if (preserve && row[cfg.userQty] !== undefined) delete row[cfg.userQty];
      // provenance columns
      if (lT.headers.indexOf('user_edited') !== -1) {
        if (op.setUserEdited === true) { row.user_edited = 'TRUE'; row.user_edited_by = op.userEditedBy || actor || 'user'; }
        else if (op.op === 'INSERT') { row.user_edited = 'FALSE'; row.user_edited_by = ''; }
        // UPDATE without setUserEdited: leave provenance untouched (omit from row)
      }
      var mode = op.op === 'INSERT' ? 'insert' : 'update';
      var res = upsertRow(lT, cfg.lineKey, op.naturalKey, row, mode);
      if (res.action === 'BLOCKED_CONFLICT') return 'DUPLICATE_LINE_KEY:' + nk;
      if (res.action === 'INSERT') { blocked ? counts.blocked++ : counts.inserted++; }
      else counts.updated++;
    }
    return null;
  }

  function supersedeLine(lT, cfg, keyObj, targetStatus, now, actor) {
    var target = -1, dup = 0;
    for (var i = 0; i < lT.rows.length; i++) { var o = rowObj(lT.headers, lT.rows[i]); if (naturalKeyStr(cfg.lineKey, o) === naturalKeyStr(cfg.lineKey, keyObj)) { dup++; if (target === -1) target = i; } }
    if (dup > 1) return 'BLOCKED_CONFLICT';
    if (target === -1) return 'MISSING'; // nothing to supersede (idempotent no-op)
    var cur = rowObj(lT.headers, lT.rows[target]);
    if (cur.line_status === targetStatus) return 'NOOP';
    cur.line_status = targetStatus; if (lT.headers.indexOf('updated_at') !== -1) cur.updated_at = now;
    lT.rows[target] = objRow(lT.headers, cur);
    return 'UPDATE';
  }

  function createSheetSet(seed) {
    var s = {};
    ['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines', RUN_JOURNAL_TABLE].forEach(function (n) { s[n] = { headers: [], rows: [] }; });
    if (seed) for (var k in seed) s[k] = { headers: seed[k].headers.slice(), rows: seed[k].rows.map(function (r) { return r.slice(); }) };
    return s;
  }

  // ---- Round 1H: canonical terminal-status vocabulary (SINGLE SOURCE) --------
  // Header fully-terminal — block ALL mutation (generation + user edit) through the locked boundary.
  var TERMINAL_DRAFT_STATUSES = { submitted: 1, cancelled: 1 };
  // Line-terminal — a line in one of these states is committed/retired and is NEVER mutated.
  var LINE_TERMINAL_STATUSES = { submitted: 1, cancelled: 1, superseded: 1, superseded_user_review: 1 };
  // Generation-blocked header — the engine must not (re)generate over a header carrying committed lines.
  // `partially_submitted` (owner: 15_ handler — a header state where SOME lines are submitted, others still
  // draft) is generation-blocked but line-level editable on its remaining non-terminal lines.
  var GENERATION_BLOCKED_STATUSES = { submitted: 1, cancelled: 1, partially_submitted: 1 };
  function nstat(s) { return String(s === undefined || s === null ? '' : s).trim().toLowerCase(); }
  function isTerminalDraftStatus(s) { return TERMINAL_DRAFT_STATUSES[nstat(s)] === 1; }
  function isLineTerminalStatus(s) { return LINE_TERMINAL_STATUSES[nstat(s)] === 1; }
  function isGenerationBlockedStatus(s) { return GENERATION_BLOCKED_STATUSES[nstat(s)] === 1; }

  // Editable decision-field allowlist per type. recommended_qty + calculation lineage + status are NOT editable
  // through a user decision edit (frozen boundary: recommended_qty is an immutable per-version snapshot).
  var EDITABLE_DECISION_FIELDS = {
    WEEKLY_SHIPPING: { planned_qty: 1, selected_source_warehouse_id: 1, selected_destination_warehouse_id: 1, selected_shipping_method: 1, expected_arrival: 1, note: 1 },
    MONTHLY_ORDER: { order_qty: 1, carton_qty: 1, allocation_method: 1, note: 1 }
  };

  // applyUserDecisionEdits(sheetSet, command, opts) — targeted natural-key line edits, applied UNDER a lock held
  // by the caller (the KMUE user-edit orchestrator). Supports INSERT (new manual line + initial recommended
  // snapshot), UPDATE (allowlisted decision fields + provenance; recommended_qty + lineage PRESERVED), and
  // optional SUPERSEDE-reconcile (draft lines absent from the edit set → superseded / _user_review; line-terminal
  // rows are NEVER touched). Writes NO run journal. Fail-closed: an out-of-allowlist field or a duplicate natural
  // key returns a conflict status with ZERO mutation. command = { recommendationType, draftId, edits:[{ naturalKey,
  // fields, recommendedSnapshot? }], reconcile? }.
  function applyUserDecisionEdits(sheetSet, command, opts) {
    opts = opts || {};
    aType(isObj(command), 'command must be an object');
    var cfg = tableCfg(command.recommendationType);
    aType(typeof command.draftId === 'string' && command.draftId.length > 0, 'command.draftId required');
    aType(Array.isArray(command.edits) && command.edits.length > 0, 'command.edits must be a non-empty array');
    var allow = EDITABLE_DECISION_FIELDS[command.recommendationType];
    var lT = getTable(sheetSet, cfg.lines);
    var now = opts.now !== undefined ? opts.now : '', actor = opts.actor !== undefined ? opts.actor : 'user';
    var counts = { inserted: 0, updated: 0, superseded: 0, skippedTerminal: 0 };

    // ---- validate ALL edits first (fail closed → zero writes on any invalid field / duplicate key) ----------
    var seen = {}, i, k;
    for (i = 0; i < command.edits.length; i++) {
      var e = command.edits[i];
      aType(isObj(e) && isObj(e.naturalKey), 'edits[' + i + '] needs a naturalKey object');
      var nlkE = cfg.nullableLineKey || {};
      cfg.lineKey.forEach(function (kc) { if (nlkE[kc] === 1) { aType(e.naturalKey[kc] !== undefined && e.naturalKey[kc] !== null, 'edits[' + i + '] nullable natural-key part must be defined (may be blank): ' + kc); } else { aType(e.naturalKey[kc] !== undefined && e.naturalKey[kc] !== null && String(e.naturalKey[kc]).length > 0, 'edits[' + i + '] missing natural-key part: ' + kc); } });
      var nk = naturalKeyStr(cfg.lineKey, e.naturalKey);
      if (seen[nk] === 1) return { status: 'DUPLICATE_LINE_KEY', reason: 'DUPLICATE_LINE_KEY:' + nk, counts: counts };
      seen[nk] = 1;
      var fields = isObj(e.fields) ? e.fields : {};
      for (k in fields) { if (fields.hasOwnProperty(k) && allow[k] !== 1) return { status: 'INVALID_EDIT_FIELD', reason: 'INVALID_EDIT_FIELD:' + k, counts: counts }; }
    }
    var editByKey = {};
    command.edits.forEach(function (e2) { editByKey[naturalKeyStr(cfg.lineKey, e2.naturalKey)] = e2; });
    function findRows(nk) { var idxs = []; for (var r = 0; r < lT.rows.length; r++) { var o = rowObj(lT.headers, lT.rows[r]); if (String(o[cfg.lineDraftId]) === String(command.draftId) && naturalKeyStr(cfg.lineKey, o) === nk) idxs.push(r); } return idxs; }

    // ---- INSERT / UPDATE ------------------------------------------------------
    for (i = 0; i < command.edits.length; i++) {
      var ed = command.edits[i], nk2 = naturalKeyStr(cfg.lineKey, ed.naturalKey), rowsFound = findRows(nk2);
      if (rowsFound.length > 1) return { status: 'DUPLICATE_LINE_KEY', reason: 'DUPLICATE_LINE_KEY:' + nk2, counts: counts };
      var f = isObj(ed.fields) ? ed.fields : {};
      if (rowsFound.length === 0) {
        // a focused edit of a non-existent line is a conflict; only the batch adapter (allowInsert) may INSERT.
        if (command.allowInsert !== true) return { status: 'LINE_NOT_FOUND', reason: 'LINE_NOT_FOUND:' + nk2, counts: counts };
        var ins = {}; cfg.lineKey.forEach(function (c) { ins[c] = ed.naturalKey[c]; }); ins[cfg.lineDraftId] = command.draftId;
        if (isObj(ed.recommendedSnapshot)) for (k in ed.recommendedSnapshot) if (ed.recommendedSnapshot.hasOwnProperty(k)) ins[k] = ed.recommendedSnapshot[k];
        for (k in f) if (f.hasOwnProperty(k)) ins[k] = f[k];
        ins.line_status = 'active';
        if (lT.headers.indexOf('user_edited') !== -1) { ins.user_edited = 'TRUE'; ins.user_edited_by = actor; }
        if (lT.headers.indexOf('updated_at') !== -1) ins.updated_at = now;
        if (lT.headers.indexOf('created_at') !== -1) ins.created_at = now;
        lT.rows.push(objRow(lT.headers, ins)); counts.inserted++;
      } else {
        var ri = rowsFound[0], cur = rowObj(lT.headers, lT.rows[ri]);
        if (isLineTerminalStatus(cur.line_status)) { counts.skippedTerminal++; continue; }  // NEVER mutate a terminal line
        for (k in f) if (f.hasOwnProperty(k)) cur[k] = f[k];            // allowlisted decision fields only → recommended_qty + lineage preserved
        if (lT.headers.indexOf('user_edited') !== -1) { cur.user_edited = 'TRUE'; cur.user_edited_by = actor; }
        if (lT.headers.indexOf('updated_at') !== -1) cur.updated_at = now;
        lT.rows[ri] = objRow(lT.headers, cur); counts.updated++;
      }
    }
    // ---- SUPERSEDE-reconcile (optional; never hard-deletes; terminal lines untouched) ----------------------
    if (command.reconcile === true) {
      for (var r3 = 0; r3 < lT.rows.length; r3++) {
        var o3 = rowObj(lT.headers, lT.rows[r3]);
        if (String(o3[cfg.lineDraftId]) !== String(command.draftId)) continue;
        if (editByKey[naturalKeyStr(cfg.lineKey, o3)]) continue;
        if (isLineTerminalStatus(o3.line_status)) continue;
        o3.line_status = isBool(o3.user_edited) ? 'superseded_user_review' : 'superseded';
        if (lT.headers.indexOf('updated_at') !== -1) o3.updated_at = now;
        lT.rows[r3] = objRow(lT.headers, o3); counts.superseded++;
      }
    }
    return { status: 'APPLIED', counts: counts };
  }

  return {
    TERMINAL_DRAFT_STATUSES: (function () { var o = {}; for (var k in TERMINAL_DRAFT_STATUSES) o[k] = 1; return o; })(),
    LINE_TERMINAL_STATUSES: (function () { var o = {}; for (var k in LINE_TERMINAL_STATUSES) o[k] = 1; return o; })(),
    GENERATION_BLOCKED_STATUSES: (function () { var o = {}; for (var k in GENERATION_BLOCKED_STATUSES) o[k] = 1; return o; })(),
    EDITABLE_DECISION_FIELDS: EDITABLE_DECISION_FIELDS,
    isTerminalDraftStatus: isTerminalDraftStatus,
    isLineTerminalStatus: isLineTerminalStatus,
    isGenerationBlockedStatus: isGenerationBlockedStatus,
    applyUserDecisionEdits: applyUserDecisionEdits,
    LINE_ADDITIVE_HEADERS: LINE_ADDITIVE_HEADERS.slice(),
    RUN_JOURNAL_HEADERS: RUN_JOURNAL_HEADERS.slice(),
    RUN_JOURNAL_TABLE: RUN_JOURNAL_TABLE,
    STAGES: STAGES.slice(),
    TABLES: TABLES,
    ensureHeaders: ensureHeaders,
    buildBusinessScopeKey: buildBusinessScopeKey,
    buildUserEditFingerprint: buildUserEditFingerprint,
    computeExpectedToken: computeExpectedToken,
    tokensMatch: tokensMatch,
    loadActiveDraftContext: loadActiveDraftContext,
    loadDraftSnapshot: loadDraftSnapshot,
    loadIncompleteRun: loadIncompleteRun,
    validatePersistencePlan: validatePersistencePlan,
    applyPersistencePlan: applyPersistencePlan,
    createSheetSet: createSheetSet
  };
});
