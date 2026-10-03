/* ================================================================================================================
 * KMS8RUN — S8 FATIGUE RUN IDENTITY, LINEAGE, MANIFEST AND LEDGER  (S8-R2 §8/§9/§13)
 * ----------------------------------------------------------------------------------------------------------------
 * ONE RUN ID, ONE ACTOR, AND A MANIFEST THAT IS THE ONLY THING CLEANUP IS ALLOWED TO BELIEVE.
 *
 * The run id answers "which run made this row". The actor answers "was this made by a test at all". They are
 * two fields because they are two questions, and a guard that could only ask one of them would be satisfied by
 * a real row that happened to mention a test, or by a test row whose run could not be identified.
 *
 * THE MANIFEST IS THE AUTHORITY, NOT THE PREFIX. This is the single most important property in the file. A
 * fatigue run RECORDS every id it creates; cleanup removes what the run recorded. It does not scan for things
 * that look like test rows. The difference is not stylistic:
 *
 *   - a prefix scan deletes whatever currently matches, including rows written by something nobody has
 *     identified yet — which is precisely the situation in which deleting is the worst available move;
 *   - a manifest replay deletes a known list, and anything matching-but-unlisted is reported as a LEAK, which
 *     keeps the evidence needed to work out which side is wrong.
 *
 * So `planCandidates` (KMS8CLEAN) takes a manifest and will not accept a pattern. There is no function in this
 * harness that converts a prefix into a delete list, and `selectByPrefix` / `selectByTime` exist ONLY as
 * explicit refusals so that a future caller reaching for them gets a named error instead of silence.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * THE FORMAT IS DERIVED, NOT CHOSEN (S8-R1 §1).
 *
 *   S8T-<YYYYMMDD>-R<NNN>      canonical, e.g. S8T-20261006-R001
 *   S8T<YYYYMMDD>R<NNN>        compact, 15 chars, alphanumeric, e.g. S8T20261006R001
 *
 * The compact form exists because `factoryImportBatchId_` (21_:857) validates its tail as
 * /^FII-\d{8}-[A-Za-z0-9]{1,16}$/ — alphanumeric, at most 16. An underscore separator would be REJECTED there,
 * and a longer id would overflow. The compact form fits with one character to spare, so
 * `FII-20261006-S8T20261006R001` is a valid caller-supplied, self-identifying import batch id. Everywhere
 * without that constraint, the hyphenated form is canonical.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * CROSS-RUN ISOLATION (§13) HAS ONE REAL HOLE, AND IT IS NOT IN THE ID.
 *
 * Allocation-draft ids are DETERMINISTIC from the business key: `sadK2DeterministicHeaderId_` returns
 * 'SADH-K2-' + FNV1a(group key) (16_:936). Two runs that use the same business dimensions therefore compute the
 * SAME draft id, and `sadK2ResolveActiveDraft_` (16_:965-976) will answer REUSE — run B legitimately adopting
 * run A's row, with no bug anywhere. No id-based guard can prevent that, because the ids are equal by design.
 *
 * The only fix is to stop the collision happening: overlapping runs may not use the same business dimensions.
 * `dimensionConflict()` is that rule, and it is checked before a run starts rather than discovered afterwards.
 *
 * NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. Pure identity + bookkeeping.
 * ================================================================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KMS8RUN = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NAMESPACE = 'S8T';
  var TEST_ACTOR = 'S8_FATIGUE_TEST';
  var RUN_ID_RE = /^S8T-(\d{4})(\d{2})(\d{2})-R(\d{3})$/;
  var COMPACT_RE = /^S8T(\d{8})R(\d{3})$/;

  // ------------------------------------------------------------------------------------------------------
  // THE GUARD INPUT SET. These two lists are what G2 and G3 actually read, and the live collision census
  // scans EXACTLY these columns plus each table's primary key. That coupling is asserted by the suite, because
  // a lineage field the census does not scan is a lineage field whose collision risk has never been measured.
  //
  // `note` IS NOT HERE, and its removal is deliberate. It was a lineage carrier in the first draft, which meant
  // the census had to read every free-text column in the database to measure the risk — a far wider Production
  // read than the question needs. Every table that looked like it depended on `note` has a STRUCTURED carrier:
  // shipping_allocation_drafts has `create_idempotency_key`, request_order_allocation_drafts has
  // `request_allocation_draft_id`, and every child inherits through its FK. So dropping it costs nothing and
  // buys two things — a bounded census, and a guard that cannot be satisfied by something a human typed in a
  // comment box. `note` is still written for human readability; it is simply not evidence.
  var LINEAGE_FIELDS = ['source_ref_id', 'reference_id', 'external_shipment_id', 'submit_batch_id',
    'request_allocation_draft_id', 'allocation_draft_id', 'create_idempotency_key', 'idempotency_key',
    'import_batch_id', 'calculation_run_id'];
  var ACTOR_FIELDS = ['created_by', 'generated_by', 'started_by', 'updated_by'];
  // The §15 lineage-type marker a fatigue request order sets, kept here so the census and the harness agree on it.
  var LINEAGE_TYPE_FIELD = 'source_ref_type';
  var LINEAGE_TYPE_VALUE = 's8_fatigue_test';

  // S8-R1 §12 / S8-R2 §9. Only READY_FOR_CLEANUP is eligible for cleanup: FAILED_RETAINED is a refusal state,
  // because the point of retaining a failed run is that its evidence outlives the impulse to tidy up.
  var STATUS = {
    PLANNED: 'PLANNED', RUNNING: 'RUNNING', FAILED_RETAINED: 'FAILED_RETAINED',
    READY_FOR_CLEANUP: 'READY_FOR_CLEANUP', CLEANED: 'CLEANED', CLEANUP_FAILED: 'CLEANUP_FAILED'
  };
  var CLEANUP_ELIGIBLE_STATUS = [STATUS.READY_FOR_CLEANUP];

  var TIERS = { T1: 1, T2: 20, T3: 100, T4: 2, T5: 100 };        // §14 — cycles; T4 is max CONCURRENT, not cycles
  var TIER_MAX_CONCURRENT = { T1: 1, T2: 1, T3: 1, T4: 2, T5: 1 };

  function str(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }

  // ---- identity -------------------------------------------------------------------------------------------
  function mintRunId(ymd, serial) {
    var d = str(ymd).replace(/-/g, '');
    if (!/^\d{8}$/.test(d)) throw new Error('mintRunId: ymd must be YYYYMMDD or YYYY-MM-DD (got ' + ymd + ')');
    var n = Number(serial);
    if (!isFinite(n) || n < 1 || n > 999 || Math.floor(n) !== n) {
      throw new Error('mintRunId: serial must be an integer 1..999 (got ' + serial + ')');
    }
    return NAMESPACE + '-' + d + '-R' + pad(n, 3);
  }

  function isRunId(v) { return RUN_ID_RE.test(str(v)); }

  function parseRunId(v) {
    var m = RUN_ID_RE.exec(str(v));
    if (!m) return null;
    return { runId: str(v), ymd: m[1] + m[2] + m[3], date: m[1] + '-' + m[2] + '-' + m[3], serial: Number(m[4]) };
  }

  // The alphanumeric form for constrained tails (the FII- batch id). Round-trips exactly.
  function compact(runId) {
    var p = parseRunId(runId);
    if (!p) throw new Error('compact: not a canonical run id (' + runId + ')');
    return NAMESPACE + p.ymd + 'R' + pad(p.serial, 3);
  }
  function expand(compactId) {
    var m = COMPACT_RE.exec(str(compactId));
    if (!m) return null;
    return NAMESPACE + '-' + m[1] + '-R' + m[2];
  }

  // The derived constraint this format exists to satisfy. Asserted by the suite so that a later edit to the
  // format cannot silently break the one field that actually validates its input.
  function factoryImportBatchId(runId, ymd) {
    var tail = compact(runId);
    var d = str(ymd).replace(/-/g, '');
    if (!/^\d{8}$/.test(d)) throw new Error('factoryImportBatchId: ymd must be YYYYMMDD');
    var id = 'FII-' + d + '-' + tail;
    if (!/^FII-\d{8}-[A-Za-z0-9]{1,16}$/.test(id)) {
      throw new Error('factoryImportBatchId: the run id does not fit the 21_:857 pattern — ' + id);
    }
    return id;
  }

  // Scoped ids for the other embeddable fields (S8-R1 §2). `kind` keeps them readable; `seq` keeps them unique.
  function scopedId(runId, kind, seq) {
    if (!isRunId(runId)) throw new Error('scopedId: not a canonical run id (' + runId + ')');
    var k = str(kind).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!k) throw new Error('scopedId: kind required');
    return runId + '-' + k + pad(Number(seq) || 1, 2);
  }

  // Which run does an arbitrary S8T-prefixed string belong to? Used by the leak detector, never by cleanup.
  function runIdOf(value) {
    var m = /S8T-\d{8}-R\d{3}/.exec(str(value));
    return m ? m[0] : '';
  }
  function looksNamespaced(value) { return str(value).indexOf(NAMESPACE) !== -1; }

  // ---- lineage (§8) ----------------------------------------------------------------------------------------
  // DIRECT   the row's own designated lineage field carries this run id AND its actor field is TEST_ACTOR
  // INHERITED the row's declared parent resolves to EXACTLY ONE row that is itself attributable to this run
  //
  // Ambiguity is a refusal, never a tie-break. A child with two candidate parents aborts, because guessing is
  // how run A comes to delete run B's row while every individual check passes.
  function resolveLineage(row, ctx) {
    ctx = ctx || {};
    var runId = str(ctx.runId);
    if (!isRunId(runId)) return { ok: false, mode: 'NONE', code: 'RUN_ID_NOT_CANONICAL' };

    var actorFields = ctx.actorFields || ACTOR_FIELDS;
    var lineageFields = ctx.lineageFields || LINEAGE_FIELDS;

    var actorOk = false;
    for (var i = 0; i < actorFields.length; i++) {
      if (str(row && row[actorFields[i]]) === TEST_ACTOR) { actorOk = true; break; }
    }

    for (var j = 0; j < lineageFields.length; j++) {
      var v = str(row && row[lineageFields[j]]);
      if (v && runIdOf(v) === runId) {
        if (!actorOk) {
          return { ok: false, mode: 'DIRECT', code: 'ACTOR_NOT_TEST',
            detail: 'the run id is present on ' + lineageFields[j] + ' but no actor field equals ' + TEST_ACTOR };
        }
        return { ok: true, mode: 'DIRECT', field: lineageFields[j], runId: runId };
      }
    }

    // INHERITED — the parent lookup is injected, so this stays pure and testable against fixtures.
    var parentKey = str(ctx.parentKey);
    var lookup = ctx.lookupParents;
    if (!parentKey || typeof lookup !== 'function') {
      return { ok: false, mode: 'NONE', code: 'LINEAGE_UNRESOLVED',
        detail: 'no direct lineage field carried the run id and no parent resolver was supplied' };
    }
    var parentId = str(row && row[parentKey]);
    if (!parentId) return { ok: false, mode: 'INHERITED', code: 'LINEAGE_UNRESOLVED', detail: 'blank ' + parentKey };

    var parents = lookup(parentKey, parentId) || [];
    if (parents.length === 0) {
      return { ok: false, mode: 'INHERITED', code: 'LINEAGE_UNRESOLVED', detail: parentKey + '=' + parentId + ' resolved to no row' };
    }
    if (parents.length > 1) {
      return { ok: false, mode: 'INHERITED', code: 'LINEAGE_AMBIGUOUS',
        detail: parentKey + '=' + parentId + ' resolved to ' + parents.length + ' rows; a child with two candidate '
          + 'parents aborts rather than being assigned to one of them' };
    }
    var p = resolveLineage(parents[0], { runId: runId, actorFields: actorFields, lineageFields: lineageFields,
      parentKey: ctx.grandparentKey, lookupParents: ctx.grandparentKey ? lookup : null,
      grandparentKey: ctx.greatGrandparentKey });
    if (!p.ok) {
      return { ok: false, mode: 'INHERITED', code: p.code === 'LINEAGE_AMBIGUOUS' ? 'LINEAGE_AMBIGUOUS' : 'PARENT_NOT_THIS_RUN',
        detail: 'parent ' + parentKey + '=' + parentId + ' is not attributable to ' + runId + ' (' + p.code + ')' };
    }
    return { ok: true, mode: 'INHERITED', via: parentKey, parentId: parentId, runId: runId };
  }

  // ---- manifest (§9) ---------------------------------------------------------------------------------------
  // The manifest IS the cleanup authority. newManifest produces the full shape so a partially-filled run still
  // has every key cleanup expects, and a missing key is a validation failure rather than an undefined read.
  function newManifest(opts) {
    opts = opts || {};
    var runId = str(opts.runId);
    if (!isRunId(runId)) throw new Error('newManifest: runId must match ' + RUN_ID_RE);
    var tier = str(opts.tier) || 'T1';
    if (!TIERS.hasOwnProperty(tier)) throw new Error('newManifest: unknown tier ' + tier);
    return {
      run_id: runId,
      test_actor: TEST_ACTOR,
      status: STATUS.PLANNED,
      tier: tier,
      max_concurrent: TIER_MAX_CONCURRENT[tier],
      scope: opts.scope || {},                      // the business dimensions this run occupies (§13)
      frontend_sha: str(opts.frontendSha),
      backend_build_id: str(opts.backendBuildId),
      action_contract_version: (opts.actionContractVersion === undefined) ? null : opts.actionContractVersion,
      started_at: null,
      finished_at: null,
      action_counts: {},
      outcome_totals: { success: 0, refusal: 0, ack_unknown: 0, transport_error: 0 },
      created_entity_ids: {},                       // { table: [id, ...] } — THE cleanup authority
      touched_inventory_identities: [],             // { table, warehouse_id, sku, axis, before, after, evidence_movement_id }
      movement_ids: { factory_stock_movements: [], overseas_inventory_movements: [], factory_stock_override_audit: [] },
      document_ids: [],
      drive_folder_names: [],
      cleanup: {
        dry_run_at: null, executed_at: null, confirmation_checksum: '',
        candidates_by_table: {}, deleted_by_table: {},
        retained_by_policy: {}, reconciled_inventory_identities: 0, reservations_released: 0,
        guard_refusals: [], post_cleanup_candidate_count: null, status: null
      },
      leak_count: 0,
      leaked_rows: [],
      non_test_row_touched_count: 0,
      non_test_rows_touched: []
    };
  }

  function recordCreated(manifest, table, id) {
    var t = str(table), i = str(id);
    if (!t || !i) throw new Error('recordCreated: table and id required');
    if (!manifest.created_entity_ids[t]) manifest.created_entity_ids[t] = [];
    if (manifest.created_entity_ids[t].indexOf(i) === -1) manifest.created_entity_ids[t].push(i);
    return manifest;
  }

  function recordInventoryTouch(manifest, touch) {
    touch = touch || {};
    ['table', 'warehouse_id', 'sku', 'axis'].forEach(function (k) {
      if (!str(touch[k])) throw new Error('recordInventoryTouch: ' + k + ' required — an unrecorded inventory '
        + 'identity cannot be reconciled or handed to the operator re-import');
    });
    manifest.touched_inventory_identities.push({
      table: str(touch.table), warehouse_id: str(touch.warehouse_id), sku: str(touch.sku), axis: str(touch.axis),
      before: (touch.before === undefined) ? null : touch.before,
      after: (touch.after === undefined) ? null : touch.after,
      evidence_movement_id: str(touch.evidence_movement_id)
    });
    return manifest;
  }

  function recordMovement(manifest, table, movementId) {
    var t = str(table), i = str(movementId);
    if (!manifest.movement_ids.hasOwnProperty(t)) throw new Error('recordMovement: ' + t + ' is not a movement ledger');
    if (i && manifest.movement_ids[t].indexOf(i) === -1) manifest.movement_ids[t].push(i);
    return manifest;
  }

  function manifestIds(manifest, table) {
    var l = manifest && manifest.created_entity_ids && manifest.created_entity_ids[str(table)];
    return l ? l.slice() : [];
  }

  function manifestHas(manifest, table, id) { return manifestIds(manifest, table).indexOf(str(id)) !== -1; }

  function validateManifest(manifest) {
    var errs = [];
    if (!manifest || typeof manifest !== 'object') return { ok: false, errors: ['manifest is not an object'] };
    if (!isRunId(manifest.run_id)) errs.push('run_id is not canonical');
    if (str(manifest.test_actor) !== TEST_ACTOR) errs.push('test_actor must be ' + TEST_ACTOR);
    if (!STATUS.hasOwnProperty(str(manifest.status))) errs.push('unknown status ' + manifest.status);
    if (!TIERS.hasOwnProperty(str(manifest.tier))) errs.push('unknown tier ' + manifest.tier);
    ['created_entity_ids', 'cleanup', 'outcome_totals', 'movement_ids'].forEach(function (k) {
      if (!manifest[k] || typeof manifest[k] !== 'object') errs.push('missing object ' + k);
    });
    ['touched_inventory_identities', 'document_ids', 'leaked_rows', 'non_test_rows_touched'].forEach(function (k) {
      if (!Array.isArray(manifest[k])) errs.push('missing array ' + k);
    });
    // Every recorded id must itself be a string; a null in the list would silently match a blank cell.
    Object.keys(manifest.created_entity_ids || {}).forEach(function (t) {
      (manifest.created_entity_ids[t] || []).forEach(function (id) {
        if (typeof id !== 'string' || !id) errs.push('non-string id recorded under ' + t);
      });
    });
    return { ok: errs.length === 0, errors: errs };
  }

  function cleanupEligible(manifest) {
    var v = validateManifest(manifest);
    if (!v.ok) return { ok: false, code: 'MANIFEST_INVALID', errors: v.errors };
    if (CLEANUP_ELIGIBLE_STATUS.indexOf(str(manifest.status)) === -1) {
      return { ok: false, code: 'RUN_STATUS_NOT_ELIGIBLE', status: manifest.status,
        detail: str(manifest.status) === STATUS.FAILED_RETAINED
          ? 'FAILED_RETAINED is a refusal state — a failed run is kept for diagnosis and is released only by an '
            + 'explicit operator decision'
          : 'only ' + CLEANUP_ELIGIBLE_STATUS.join('/') + ' may be cleaned' };
    }
    return { ok: true, code: 'ELIGIBLE' };
  }

  // ---- cross-run isolation (§13) ----------------------------------------------------------------------------
  // Scope = the business dimensions a run occupies. Two runs conflict when any (company,country,marketplace,sku)
  // tuple appears in both, because the deterministic draft id is a function of exactly that key.
  function scopeKeys(scope) {
    var out = [];
    (scope && scope.dimensions ? scope.dimensions : []).forEach(function (d) {
      out.push([str(d.company), str(d.country), str(d.marketplace), str(d.sku)].join('|').toLowerCase());
    });
    return out;
  }

  function dimensionConflict(manifestA, manifestB) {
    var a = {}, hits = [];
    scopeKeys(manifestA && manifestA.scope).forEach(function (k) { a[k] = 1; });
    scopeKeys(manifestB && manifestB.scope).forEach(function (k) { if (a[k]) hits.push(k); });
    if (!hits.length) return { conflict: false, overlapping: [] };
    return {
      conflict: true, overlapping: hits,
      code: 'OVERLAPPING_BUSINESS_DIMENSIONS',
      detail: 'the deterministic allocation-draft id is FNV1a of the business key (16_:936), so these runs would '
        + 'compute the same SADH-K2- id and the resolver would answer REUSE — run B adopting run A\'s row with no '
        + 'bug anywhere. Overlapping fatigue runs may not share business dimensions.'
    };
  }

  // Can run A claim this row, given it belongs to run B? The answer is always no, and this states why.
  function canAdopt(manifestA, row, ctx) {
    var c = ctx || {}, sub = { runId: manifestA.run_id };
    ['actorFields', 'lineageFields', 'parentKey', 'lookupParents', 'grandparentKey'].forEach(function (k) {
      if (c[k] !== undefined) sub[k] = c[k];
    });
    var mine = resolveLineage(row, sub);
    if (!mine.ok) return { ok: false, code: mine.code, detail: mine.detail };
    // Lineage resolving is necessary but NOT sufficient — the manifest must also list it.
    var table = str(ctx && ctx.table), id = str(row && ctx && row[ctx.idField]);
    if (!manifestHas(manifestA, table, id)) {
      return { ok: false, code: 'ROW_NOT_IN_RUN_MANIFEST',
        detail: 'lineage resolved to ' + manifestA.run_id + ' but the run never recorded creating it — this is a '
          + 'LEAK for investigation, not a delete candidate' };
    }
    return { ok: true, mode: mine.mode };
  }

  return {
    NAMESPACE: NAMESPACE,
    TEST_ACTOR: TEST_ACTOR,
    LINEAGE_FIELDS: LINEAGE_FIELDS,
    ACTOR_FIELDS: ACTOR_FIELDS,
    LINEAGE_TYPE_FIELD: LINEAGE_TYPE_FIELD,
    LINEAGE_TYPE_VALUE: LINEAGE_TYPE_VALUE,
    RUN_ID_RE: RUN_ID_RE,
    STATUS: STATUS,
    CLEANUP_ELIGIBLE_STATUS: CLEANUP_ELIGIBLE_STATUS,
    TIERS: TIERS,
    TIER_MAX_CONCURRENT: TIER_MAX_CONCURRENT,
    mintRunId: mintRunId,
    isRunId: isRunId,
    parseRunId: parseRunId,
    compact: compact,
    expand: expand,
    factoryImportBatchId: factoryImportBatchId,
    scopedId: scopedId,
    runIdOf: runIdOf,
    looksNamespaced: looksNamespaced,
    resolveLineage: resolveLineage,
    newManifest: newManifest,
    recordCreated: recordCreated,
    recordInventoryTouch: recordInventoryTouch,
    recordMovement: recordMovement,
    manifestIds: manifestIds,
    manifestHas: manifestHas,
    validateManifest: validateManifest,
    cleanupEligible: cleanupEligible,
    scopeKeys: scopeKeys,
    dimensionConflict: dimensionConflict,
    canAdopt: canAdopt,
    _version: 's8-r2-run-identity'
  };
});
