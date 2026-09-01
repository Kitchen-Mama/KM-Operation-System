/**
 * TEMP_shipping_allocation_post_schema_identity_b5_dry_run.gs — F1-7N-FB-4F-B5
 * PASTE · RUN · REMOVE. STRICTLY READ-ONLY. There is no COMMIT, no execute argument, and no write path.
 *
 *   TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN()
 *
 * B4 appended the two columns. They are BLANK on every existing row, and that is the whole question this file
 * exists to answer: now that there is somewhere to put a route destination, what ARE the four live headers, and
 * what would happen if someone saved the route the operator has been trying to save?
 *
 * ================================================================================================================
 * READ-ONLY IS ENFORCED BY CONSTRUCTION, NOT BY INTENTION
 * ================================================================================================================
 * The spreadsheet is opened once and every sheet is immediately wrapped in a FAÇADE that exposes exactly one
 * capability: getDataRange().getValues(). No other method survives the wrapper, so setValue, appendRow,
 * insertColumnsAfter, deleteRow and every ensure/create helper are not merely unused here — they are UNREACHABLE
 * from the objects this diagnostic holds. A promise not to write is worth less than an object that cannot.
 *
 * ================================================================================================================
 * IT REQUIRES THE B3 AUTHORITY AND CARRIES NO COPY OF IT
 * ================================================================================================================
 * Every identity rule comes from 16_shipping_allocation_handlers.gs and 69_api_v1_route_identity_contract.gs.
 * There is NO local fallback for ricK4GroupKey_, ricDestinationIdentity_, ricCanonicalService_ or sadK2GroupKey_.
 * A second implementation of an identity rule is a second answer waiting to disagree with production, and the
 * entire value of this diagnostic is that its verdict is the verdict the writer would reach. Missing symbols →
 * AUTHORITY_NOT_LOADED, and nothing is classified.
 *
 * ================================================================================================================
 * WHAT IT WILL NEVER DO
 * ================================================================================================================
 * It creates no K4 id as a stored fact (it computes PROPOSED keys and labels them proposed), rewrites no K2/K3
 * id, changes no quantity, status or FK, reconciles no legacy row, and backfills nothing. It never promotes a
 * plan-scope marketplace, a filter selection, a UI label, a warehouse code snapshot, a carrier lead-time result,
 * a calculated ETA, the attempted 2026-10-16, or the attempted sea_express/Amazon/400 into persisted identity.
 * Those are reported as EVIDENCE, at their real rank, and never as truth.
 */

var TEMP_B5_BUILD_VERSION_ = 'F1-7N-FB-4F-B5';
var TEMP_B5_OPERATION_ = 'FB4F-B5-POST-SCHEMA-IDENTITY-1';
var TEMP_B5_CHECKSUM_PREFIX_ = 'fb4b5-1';

// Same control separators the B2/B4 fingerprints use, written as escapes so they survive a copy-paste.
var TEMP_B5_FS_ = '\x01';
var TEMP_B5_RS_ = '\x02';

var TEMP_B5_DRAFTS_ = 'shipping_allocation_drafts';
var TEMP_B5_LINES_ = 'shipping_allocation_draft_lines';
var TEMP_B5_PLANS_ = 'shipping_plans';
var TEMP_B5_PLAN_LINES_ = 'shipping_plan_lines';

/**
 * EVERY TABLE THIS FILE READS, AND WHY. Four, and no more — a whole-database read would be both slower and
 * dishonest about what the question actually depends on.
 *
 * The two plan tables are read to MEASURE a negative rather than assume it. 16_ states the contract outright:
 * idempotent Submit retry "would require a NEW allocation_draft lineage column on shipping_plans (prohibited)",
 * so no committed plan row stores an allocation_draft_id. That is exactly the claim on which "re-keying a header
 * cannot orphan anything downstream" rests, and a claim that load-bearing is worth confirming against the live
 * header rows instead of quoting.
 */
var TEMP_B5_TABLES_READ_ = [
  { table: 'shipping_allocation_drafts', why: 'the subject — the four live allocation headers being classified' },
  { table: 'shipping_allocation_draft_lines', why: 'the ONLY table that stores a foreign key to an allocation header (allocation_draft_id); re-keying a header would orphan these rows' },
  { table: 'shipping_plans', why: 'downstream consumer — read to CONFIRM it stores no allocation_draft_id (16_ contract: a lineage column is prohibited), and to detect a submit binding by execution key' },
  { table: 'shipping_plan_lines', why: 'downstream consumer — same negative, at line grain' }
];

// The evidence ranks, strongest first. A classification that cannot name its rank is not a classification.
var TEMP_B5_EVIDENCE_RANKS_ = [
  'PERSISTED_CANONICAL', 'PERSISTED_LEGACY', 'DOWNSTREAM_AUTHORITATIVE_REFERENCE',
  'USER_ATTEMPT_EVIDENCE_ONLY', 'UI_DERIVED_NOT_AUTHORITATIVE', 'NO_EVIDENCE'
];

/**
 * NEVER PROMOTED INTO PERSISTED IDENTITY. Nothing in this file reads any of these as a source of truth; the list
 * exists so a reviewer can search for each term and find it here, in the report's own refusal vocabulary.
 *
 * The first entry is not hypothetical. The shipped page hydrate sets
 *     destination_marketplace: hTo ? '' : (ctx.marketplace || '')
 * which SYNTHESISES a marketplace destination from the plan scope whenever the header stores no destination
 * warehouse. That value is UI_DERIVED_NOT_AUTHORITATIVE. It is why the panel can look like it holds an Amazon
 * route while the database holds a route with no destination at all.
 */
var TEMP_B5_NEVER_PROMOTED_ = [
  'plan scope marketplace (client hydrate synthesises this from ctx.marketplace)',
  'filter selection', 'UI display label', 'destination label', 'warehouse code snapshot',
  'carrier lead-time result', 'calculated ETA', 'attempted 2026-10-16',
  'attempted sea_express / Amazon / qty 400', 'any client-only payload that never committed'
];

// The route the operator has been trying to save, and the route that is actually stored. Held apart on purpose:
// conflating them is the entire defect this workstream exists for.
var TEMP_B5_TARGET_ = {
  label: 'ResUS / US / Amazon / CO1100-R',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R',
  persisted: { service: 'sea', planned_qty: 800, destination: '(blank — unpersisted)' },
  attempted: { service: 'sea_express', destination_marketplace: 'Amazon', planned_qty: 400, expected_arrival: '2026-10-16' }
};

var TEMP_B5_RECORDED_ = {
  drafts: { header_count: 35, row_count: 4, fingerprint: 'sf:870364de' },
  lines: { header_count: 31, row_count: 6, fingerprint: 'sf:122f48c3' },
  planned_qty_total: 1020, matched_lines: 6, orphan_lines: 0
};

// -------------------------------------------------------------------------------------------------- primitives

function tb5Str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function tb5Lc_(v) { return tb5Str_(v).toLowerCase(); }
function tb5Log_(o) { try { Logger.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2)); } catch (e) {} }

function tb5Hash_(s) {
  if (typeof sadFnv1a_ === 'function') return sadFnv1a_(String(s == null ? '' : s));
  return null;
}

// Byte-identical to the B2/B4 fingerprint, so a digest printed here compares directly with one printed there.
function tb5Fingerprint_(headers) {
  var h = (headers || []).slice();
  var d = tb5Hash_(h.length + TEMP_B5_FS_ + h.join(TEMP_B5_FS_));
  return { count: h.length, ordered: h.slice(), digest: d === null ? null : 'sf:' + d };
}

// Business ids are MASKED but DETERMINISTIC: the last four characters (how duplicate groups are already
// discussed in this system) plus a stable full-value hash, so two reports can be compared and a specific row can
// still be found by re-running. A bare truncation would not be reversible-by-lookup; a bare hash would not be
// recognisable.
function tb5Mask_(v) {
  var s = tb5Str_(v);
  if (!s) return '(blank)';
  return (s.length <= 4 ? s : '…' + s.slice(-4)) + '#' + tb5Hash_(s);
}
// Free text is never printed. Presence, length and a hash prove a later migration preserved it.
function tb5TextRef_(v) {
  var s = tb5Str_(v);
  return s ? { present: true, length: s.length, hash: tb5Hash_(s) } : { present: false, length: 0, hash: null };
}
function tb5Qty_(v) {
  var s = tb5Str_(v);
  if (s === '') return null;                       // blank is UNKNOWN, never zero
  var n = Number(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

// -------------------------------------------------------------------------------------------------- authority

/**
 * The dependency contract, one `typeof` at a time. `typeof` never invokes anything, and being explicit means
 * this list reads AS the contract. There is no fallback for any entry.
 */
function tb5MissingAuthorities_() {
  var missing = [];
  function need(n, ok) { if (!ok) missing.push(n); }
  need('prodExpectedDbId_', typeof prodExpectedDbId_ === 'function');
  need('sadFnv1a_', typeof sadFnv1a_ === 'function');
  need('sadK2GroupKey_', typeof sadK2GroupKey_ === 'function');
  need('sadK2DeterministicHeaderId_', typeof sadK2DeterministicHeaderId_ === 'function');
  need('sadK4ResolveActiveDraft_', typeof sadK4ResolveActiveDraft_ === 'function');
  need('sadExactSchemaReason_', typeof sadExactSchemaReason_ === 'function');
  need('SAD_TERMINAL_STATUSES_', typeof SAD_TERMINAL_STATUSES_ !== 'undefined');
  need('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_', typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ !== 'undefined');
  need('SAD_HEADER_OPTIONAL_TAIL_COLUMNS_', typeof SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ !== 'undefined');
  need('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_', typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ !== 'undefined');
  need('SAD_LINE_ETA_TAIL_COLUMNS_', typeof SAD_LINE_ETA_TAIL_COLUMNS_ !== 'undefined');
  // The K4 authority. Its absence is the "not synced to B3" signal, and there is no local substitute.
  need('ricK4GroupKey_', typeof ricK4GroupKey_ === 'function');
  need('ricK4DeterministicHeaderId_', typeof ricK4DeterministicHeaderId_ === 'function');
  need('ricDestinationIdentity_', typeof ricDestinationIdentity_ === 'function');
  need('ricCanonicalService_', typeof ricCanonicalService_ === 'function');
  need('ricRoutePersistability_', typeof ricRoutePersistability_ === 'function');
  return missing;
}

// ------------------------------------------------------------------------------------------------ read-only IO

/**
 * THE FAÇADE. One capability, nothing else. Everything below this line holds one of these and therefore
 * physically cannot write, append, create or ensure.
 */
function tb5ReadOnlySheet_(sh, name) {
  return {
    __readonly: true,
    name: name,
    getDataRange: function () {
      var v = sh.getDataRange().getValues();
      return { getValues: function () { return v.map(function (r) { return r.slice(); }); } };
    }
  };
}

function tb5OpenReadOnly_() {
  // The exact-id target guard, from the shipped production-safety adapter — never a literal in this file.
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  return {
    getSheetByName: function (n) {
      var sh = null;
      try { sh = ss.getSheetByName(n); } catch (e) { sh = null; }
      return sh ? tb5ReadOnlySheet_(sh, n) : null;
    }
  };
}

function tb5ReadTable_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return { name: name, present: false, headers: [], rows: [], row_count: 0 };
  var data = sh.getDataRange().getValues();
  var raw = (data && data.length ? data[0] : []).map(function (h) { return tb5Str_(h); });
  while (raw.length && raw[raw.length - 1] === '') raw.pop();
  var rows = [];
  for (var r = 1; r < (data ? data.length : 0); r++) {
    var o = {}, blank = true;
    for (var c = 0; c < raw.length; c++) {
      if (!raw[c]) continue;
      if (!o.hasOwnProperty(raw[c])) o[raw[c]] = data[r][c];   // FIRST wins; duplicates are reported, not merged
      if (tb5Str_(data[r][c]) !== '') blank = false;
    }
    if (!blank) { o.__row = r + 1; rows.push(o); }
  }
  return { name: name, present: true, headers: raw, rows: rows, row_count: rows.length };
}

// ------------------------------------------------------------------------------------------------ schema state

function tb5SchemaState_(ss) {
  var H = tb5ReadTable_(ss, TEMP_B5_DRAFTS_), L = tb5ReadTable_(ss, TEMP_B5_LINES_);
  function probe(headerRow) {
    var row = (headerRow || []).slice();
    return { getDataRange: function () { return { getValues: function () { return [row.slice()]; } }; } };
  }
  var hGate = H.present ? sadExactSchemaReason_(probe(H.headers), SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_, SAD_HEADER_OPTIONAL_TAIL_COLUMNS_) : 'SHEET_MISSING';
  var lGate = L.present ? sadExactSchemaReason_(probe(L.headers), SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_, SAD_LINE_ETA_TAIL_COLUMNS_) : 'SHEET_MISSING';
  var hFp = tb5Fingerprint_(H.headers), lFp = tb5Fingerprint_(L.headers);
  return {
    H: H, L: L,
    drafts: {
      table: TEMP_B5_DRAFTS_, present: H.present, header_count: H.headers.length, row_count: H.row_count,
      fingerprint: hFp.digest, expected_fingerprint: TEMP_B5_RECORDED_.drafts.fingerprint,
      fingerprint_matches_recorded: hFp.digest === TEMP_B5_RECORDED_.drafts.fingerprint,
      destination_marketplace_column_present: H.headers.indexOf('destination_marketplace') === 34,
      runtime_gate: hGate === '' ? 'ACCEPTED' : ('REJECTED: ' + hGate)
    },
    lines: {
      table: TEMP_B5_LINES_, present: L.present, header_count: L.headers.length, row_count: L.row_count,
      fingerprint: lFp.digest, expected_fingerprint: TEMP_B5_RECORDED_.lines.fingerprint,
      fingerprint_matches_recorded: lFp.digest === TEMP_B5_RECORDED_.lines.fingerprint,
      expected_arrival_column_present: L.headers.indexOf('expected_arrival') === 30,
      runtime_gate: lGate === '' ? 'ACCEPTED' : ('REJECTED: ' + lGate)
    },
    schema_ready: hGate === '' && lGate === '' &&
      H.headers.indexOf('destination_marketplace') === 34 && L.headers.indexOf('expected_arrival') === 30
  };
}

// -------------------------------------------------------------------------------------------- downstream refs

/**
 * §Downstream. Measured, not assumed: does ANY committed plan row carry a column that names an allocation
 * header or line? 16_ says a lineage column is prohibited; this confirms it against the live header rows.
 */
function tb5DownstreamRefs_(ss, headerIds, lineIds) {
  var out = { tables: [], any_stored_allocation_fk: false, references: [], contract_note:
    '16_shipping_allocation_handlers.gs: idempotent Submit retry "would require a NEW allocation_draft lineage ' +
    'column on shipping_plans (prohibited)". Lineage is returned in the RESPONSE only and never persisted.' };
  var hSet = {}, lSet = {};
  (headerIds || []).forEach(function (i) { if (i) hSet[i] = 1; });
  (lineIds || []).forEach(function (i) { if (i) lSet[i] = 1; });

  [TEMP_B5_PLANS_, TEMP_B5_PLAN_LINES_].forEach(function (name) {
    var t = tb5ReadTable_(ss, name);
    var fkCols = t.headers.filter(function (h) {
      return h === 'allocation_draft_id' || h === 'allocation_draft_line_id' ||
        h.indexOf('allocation_draft') !== -1;
    });
    var hits = [];
    if (fkCols.length) {
      t.rows.forEach(function (r) {
        fkCols.forEach(function (c) {
          var v = tb5Str_(r[c]);
          if (v && (hSet[v] || lSet[v])) hits.push({ table: name, row: r.__row, column: c, value_masked: tb5Mask_(v) });
        });
      });
    }
    if (hits.length) { out.any_stored_allocation_fk = true; out.references = out.references.concat(hits); }
    out.tables.push({
      table: name, present: t.present, header_count: t.headers.length, row_count: t.row_count,
      allocation_fk_columns_found: fkCols,
      stores_allocation_fk: fkCols.length > 0,
      matching_references: hits.length
    });
  });
  return out;
}

// ------------------------------------------------------------------------------------------- per-header report

function tb5ClassifyHeader_(h, lines, allActive, downstream) {
  var id = tb5Str_(h.allocation_draft_id);
  var dest = ricDestinationIdentity_(h);
  var svcRaw = tb5Str_(h.recommended_shipping_method);
  var svcCanon = ricCanonicalService_(svcRaw);
  var mine = (lines || []).filter(function (l) { return tb5Str_(l.allocation_draft_id) === id; });

  var qty = 0, qtyUnknown = 0;
  mine.forEach(function (l) { var q = tb5Qty_(l.planned_qty); if (q === null) qtyUnknown++; else qty += q; });

  var k2Key = sadK2GroupKey_(h);
  var classifiable = dest.ok === true;
  var k4Key = classifiable ? ricK4GroupKey_(h) : null;

  // Identity family from the STORED id, never from a guess about what it should have been.
  var family = id.indexOf('SADH-K2-') === 0 ? 'K2'
    : id.indexOf('SADH-K4-') === 0 ? 'K4'
      : id.indexOf('SADH-') === 0 ? 'K3_OR_LEGACY' : 'UNRECOGNISED';

  // A natural-key collision is two ACTIVE headers claiming one shipment group. Under K2 that is the frozen
  // rule the workspace handler already enforces; under K4 it is the successor rule.
  var k2Rivals = (allActive || []).filter(function (o) {
    return tb5Str_(o.allocation_draft_id) !== id && sadK2GroupKey_(o) === k2Key;
  }).map(function (o) { return tb5Mask_(o.allocation_draft_id); });
  var k4Rivals = !classifiable ? [] : (allActive || []).filter(function (o) {
    return tb5Str_(o.allocation_draft_id) !== id && ricDestinationIdentity_(o).ok && ricK4GroupKey_(o) === k4Key;
  }).map(function (o) { return tb5Mask_(o.allocation_draft_id); });

  var refs = (downstream.references || []).filter(function (r) {
    return r.value_masked === tb5Mask_(id) ||
      mine.some(function (l) { return r.value_masked === tb5Mask_(l.allocation_draft_line_id); });
  });

  // ONE typed decision per header, and the order is the reasoning.
  var decision, decisionWhy;
  if (refs.length) {
    decision = 'DOWNSTREAM_REFERENCE_BLOCKED';
    decisionWhy = 'a committed downstream row stores this allocation id; re-keying it would orphan that reference';
  } else if (k2Rivals.length || k4Rivals.length) {
    decision = 'CONTESTED_IDENTITY_BLOCKED';
    decisionWhy = 'another active header claims the same shipment group — a business decision, not something a writer settles by picking one';
  } else if (!classifiable) {
    decision = 'UNCLASSIFIABLE_ROUTE_DESTINATION_MISSING';
    decisionWhy = dest.code + ' — the header stores neither a destination warehouse nor a destination marketplace, ' +
      'so it has no K4 identity. The column now exists and is BLANK; only an explicit user save may fill it.';
  } else {
    decision = 'SAFE_TO_RETAIN_AS_IS';
    decisionWhy = 'a resolvable destination, a canonical service and no rival — this header already has a K4 identity';
  }
  // A row that is only missing the destination, with no rival and no downstream reference, is adoptable —
  // but ONLY when a human supplies the missing dimension. That is not migration authorization.
  var adoptable = !classifiable && !k2Rivals.length && !k4Rivals.length && !refs.length && !!svcCanon;
  if (decision === 'UNCLASSIFIABLE_ROUTE_DESTINATION_MISSING' && adoptable) {
    decision = 'SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE';
    decisionWhy = 'the ONLY missing dimension is the route destination. If a user explicitly supplies it and no ' +
      'rival appears, this stored id can be retained and updated in place. No automated backfill is authorised.';
  }
  if (!svcCanon && svcRaw) {
    decision = 'USER_CONFIRMATION_REQUIRED';
    decisionWhy = 'the stored service "' + svcRaw + '" is not one of the canonical services, so it cannot be keyed';
  }

  return {
    allocation_draft_id: tb5Mask_(id),
    identity_family: family,
    status: tb5Str_(h.status),
    active: !SAD_TERMINAL_STATUSES_[tb5Lc_(h.status)],
    scope: { company: tb5Str_(h.company), country: tb5Str_(h.country), marketplace: tb5Str_(h.marketplace) },
    planning_cycle: tb5Str_(h.planning_cycle),
    source_page: tb5Str_(h.source_page),
    source_warehouse_id: tb5Mask_(h.recommended_source_warehouse_id),
    destination_warehouse_id: tb5Str_(h.recommended_destination_warehouse_id) ? tb5Mask_(h.recommended_destination_warehouse_id) : '(blank)',
    destination_marketplace: tb5Str_(h.destination_marketplace) || '(blank)',
    destination_identity: { ok: dest.ok, type: dest.type || '(none)', id: dest.id || '(none)', code: dest.code || '' },
    shipping_service_raw: svcRaw || '(blank)',
    shipping_service_canonical: svcCanon || '(NOT CANONICAL)',
    last_mile_delivery: tb5Str_(h.recommended_last_mile_delivery) || '(blank)',
    recommendation_group_no: tb5Str_(h.recommendation_group_no) || '(blank)',
    line_count: mine.length,
    line_ids: mine.map(function (l) { return tb5Mask_(l.allocation_draft_line_id); }),
    line_natural_keys: mine.map(function (l) {
      return { sku: tb5Str_(l.sku), site_sku: tb5Str_(l.site_sku) || '(blank)', window_code: tb5Str_(l.window_code) || '(blank)' };
    }),
    planned_qty_total: qty,
    planned_qty_unknown_cells: qtyUnknown,
    expected_arrival_values: mine.map(function (l) { return tb5Str_(l.expected_arrival) || '(blank)'; }),
    note_ref: tb5TextRef_(h.note),
    downstream_references: refs.length,
    k2_group_key_hash: tb5Hash_(k2Key),
    k2_deterministic_id: tb5Mask_(sadK2DeterministicHeaderId_(h)),
    k2_id_matches_stored: sadK2DeterministicHeaderId_(h) === id,
    k4_classifiable: classifiable,
    k4_group_key_hash: classifiable ? tb5Hash_(k4Key) : null,
    k4_proposed_id: classifiable ? tb5Mask_(ricK4DeterministicHeaderId_(h)) : null,
    k4_proposed_id_is_a_proposal_only: true,
    natural_key_collision: { k2_rivals: k2Rivals, k4_rivals: k4Rivals },
    contested_identity: (k2Rivals.length > 0 || k4Rivals.length > 0),
    stored_id_can_be_retained: !refs.length && decision !== 'CONTESTED_IDENTITY_BLOCKED',
    explicit_user_input_required: !classifiable || decision === 'USER_CONFIRMATION_REQUIRED',
    evidence_rank: classifiable ? 'PERSISTED_CANONICAL' : (id ? 'PERSISTED_LEGACY' : 'NO_EVIDENCE'),
    decision: decision,
    decision_why: decisionWhy
  };
}

// ------------------------------------------------------------------------------------- the target route analysis

/**
 * §Target — ResUS / US / Amazon / CO1100-R. The persisted route and the attempted route are held APART and
 * proven to be different identities, because the whole failure mode is treating them as one.
 */
function tb5TargetAnalysis_(activeRows, lines, schema) {
  var T = TEMP_B5_TARGET_;
  var scoped = (activeRows || []).filter(function (h) {
    return tb5Lc_(h.company) === tb5Lc_(T.company) && tb5Lc_(h.country) === tb5Lc_(T.country) &&
      tb5Lc_(h.marketplace) === tb5Lc_(T.marketplace);
  });
  var withSku = scoped.filter(function (h) {
    var id = tb5Str_(h.allocation_draft_id);
    return (lines || []).some(function (l) { return tb5Str_(l.allocation_draft_id) === id && tb5Str_(l.sku) === T.sku; });
  });
  var persistedRow = withSku[0] || scoped[0] || null;

  var out = {
    target: T.label,
    persisted_route: null,
    attempted_route: {
      evidence_rank: 'USER_ATTEMPT_EVIDENCE_ONLY',
      service: T.attempted.service, destination_marketplace: T.attempted.destination_marketplace,
      planned_qty: T.attempted.planned_qty, expected_arrival: T.attempted.expected_arrival,
      persisted_anywhere: false,
      statement: 'None of these four values is persisted. They are what the operator tried to save and what the ' +
        'writer refused, and this diagnostic neither creates nor backfills any of them.'
    },
    proofs: {}, future_save_simulation: {}
  };

  if (!persistedRow) {
    out.persisted_route = { found: false, note: 'no active header in this scope' };
    out.proofs.persisted_route_found = false;
    return out;
  }

  var id = tb5Str_(persistedRow.allocation_draft_id);
  var mine = (lines || []).filter(function (l) { return tb5Str_(l.allocation_draft_id) === id; });
  var qty = 0;
  mine.forEach(function (l) { var q = tb5Qty_(l.planned_qty); if (q !== null) qty += q; });
  var dest = ricDestinationIdentity_(persistedRow);
  var svc = ricCanonicalService_(persistedRow.recommended_shipping_method);

  out.persisted_route = {
    evidence_rank: dest.ok ? 'PERSISTED_CANONICAL' : 'PERSISTED_LEGACY',
    allocation_draft_id: tb5Mask_(id),
    service_canonical: svc || '(NOT CANONICAL)',
    planned_qty_total: qty,
    destination_identity: { ok: dest.ok, type: dest.type || '(none)', code: dest.code || '' },
    destination_marketplace_cell: tb5Str_(persistedRow.destination_marketplace) || '(blank)',
    expected_arrival_cells: mine.map(function (l) { return tb5Str_(l.expected_arrival) || '(blank)'; })
  };

  // The attempted header, EXACTLY as an explicit user save would present it — same scope, same source
  // warehouse, same last-mile and group, but the attempted service and the attempted destination.
  function attemptedHeader(service, marketplace) {
    return {
      planning_cycle: tb5Str_(persistedRow.planning_cycle), company: tb5Str_(persistedRow.company),
      country: tb5Str_(persistedRow.country), marketplace: tb5Str_(persistedRow.marketplace),
      source_page: tb5Str_(persistedRow.source_page),
      recommended_source_warehouse_id: tb5Str_(persistedRow.recommended_source_warehouse_id),
      recommended_destination_warehouse_id: '',
      destination_marketplace: marketplace,
      recommended_shipping_method: service,
      recommended_last_mile_delivery: tb5Str_(persistedRow.recommended_last_mile_delivery),
      recommendation_group_no: tb5Str_(persistedRow.recommendation_group_no)
    };
  }

  var attempted = attemptedHeader(T.attempted.service, T.attempted.destination_marketplace);
  var sameServiceRepaired = attemptedHeader(svc || 'sea', T.attempted.destination_marketplace);

  // ---- PROOFS -------------------------------------------------------------------------------------------
  var svcA = ricCanonicalService_(T.attempted.service), svcP = ricCanonicalService_(T.persisted.service);
  out.proofs = {
    persisted_route_found: true,
    sea_is_not_sea_express: svcA !== svcP && svcA === 'sea_express' && svcP === 'sea',
    both_are_canonical_services: !!svcA && !!svcP,
    k2_keys_differ: sadK2GroupKey_(persistedRow) !== sadK2GroupKey_(attempted),
    k4_key_of_attempted_hash: tb5Hash_(ricK4GroupKey_(attempted)),
    persisted_has_no_k4_identity: !dest.ok,
    not_the_same_route_identity: sadK2GroupKey_(persistedRow) !== sadK2GroupKey_(attempted),
    persisted_qty_unchanged: qty,
    persisted_qty_is_read_only_here: true,
    attempted_qty_not_created: true,
    attempted_eta_not_backfilled: mine.every(function (l) { return tb5Str_(l.expected_arrival) === ''; }),
    scope_marketplace_does_not_repair_the_route:
      'the header scope marketplace is "' + tb5Str_(persistedRow.marketplace) + '" and the route destination cell is "' +
      (tb5Str_(persistedRow.destination_marketplace) || '(blank)') + '". Scope is a PLAN axis; destination is a ROUTE ' +
      'axis. ricDestinationIdentity_ reads only the route axis, which is why this row is still ' + (dest.code || 'ok') + '.',
    attempted_route_must_not_adopt_the_persisted_row: true
  };

  // ---- FUTURE SAVE SIMULATION (READ-ONLY, through the SHIPPED resolver) ----------------------------------
  // sadK4ResolveActiveDraft_ is the production resolver. Calling it with rows read read-only computes a
  // verdict without writing anything and without this file owning a copy of the rule.
  function simulate(hdr, label) {
    var r4 = sadK4ResolveActiveDraft_(activeRows, hdr);
    // The B3 rival rule: only rows K4 CANNOT classify are rivals. A classifiable row with a different key is a
    // DIFFERENT ROUTE and is entitled to its own header.
    var legacyRivals = (activeRows || []).filter(function (r) { return !ricDestinationIdentity_(r).ok; });
    var k2Want = sadK2GroupKey_(hdr);
    var rivalHit = legacyRivals.filter(function (r) { return sadK2GroupKey_(r) === k2Want; });
    var verdict, why;
    if (r4.status === 'REUSE') { verdict = 'REUSE_EXISTING_K4_HEADER'; why = 'an existing header already has this exact K4 identity'; }
    else if (r4.status === 'BLOCKED_CONFLICT') { verdict = 'BLOCKED_CONFLICT'; why = 'more than one active header already claims this K4 identity'; }
    else if (rivalHit.length) {
      verdict = 'K4_IDENTITY_RECONCILIATION_REQUIRED';
      why = 'no K4 match, but an active row K4 CANNOT CLASSIFY would be claimed by K2 for this same route. ' +
        'Creating beside it would duplicate the route; adopting it would migrate a legacy row in place. Both are refused.';
    } else { verdict = 'CREATE_DISTINCT_K4_HEADER'; why = 'no K4 match and no unclassifiable rival — a genuinely new route'; }
    return {
      label: label, k4_status: r4.status, verdict: verdict, why: why,
      k4_key_hash: tb5Hash_(ricK4GroupKey_(hdr)),
      proposed_id: tb5Mask_(ricK4DeterministicHeaderId_(hdr)),
      unclassifiable_rivals_matching_by_k2: rivalHit.map(function (r) { return tb5Mask_(r.allocation_draft_id); }),
      persistable: ricRoutePersistability_(hdr, schema.H.headers, schema.L.headers)
    };
  }

  out.future_save_simulation = {
    zero_write: true,
    attempted_sea_express_amazon: simulate(attempted, 'attempted route: sea_express + Amazon'),
    same_sea_route_with_amazon_supplied: simulate(sameServiceRepaired, 'the PERSISTED sea route, with Amazon explicitly supplied'),
    reading_note: 'These two differ, and the difference IS the safety property. sea_express is a different ' +
      'service, so its K2 key differs from the stored sea row and it can be created beside it. Supplying Amazon ' +
      'on the SAME sea route produces the stored row\'s own K2 key, so it is refused for reconciliation instead ' +
      'of silently adopting or duplicating a legacy row.'
  };
  return out;
}

// ------------------------------------------------------------------------------------------- hydration boundary

/**
 * §Hydration — the SERVER half, measured. Where the client half is concerned this reports the INPUTS the shipped
 * page reads, never a re-implementation of its rules, and flags the one place the page manufactures a value.
 *
 * The boundaries:
 *   1. sheet rows                — what is physically stored
 *   2. active-scope selection    — what the workspace read would return for the station
 *   3. route-identity completeness — whether each returned header can name its own destination
 *   4. client route model        — the inputs the page hydrate maps, and what it SYNTHESISES
 */
function tb5HydrationTrace_(H, L, target) {
  var T = target || TEMP_B5_TARGET_;
  var b = [];

  var allHeaders = H.rows || [];
  var allLines = L.rows || [];
  function qtyOf(rows) { var q = 0; rows.forEach(function (l) { var n = tb5Qty_(l.planned_qty); if (n !== null) q += n; }); return q; }

  b.push({ boundary: '1_sheet_rows', header_count: allHeaders.length, line_count: allLines.length,
    quantity_total: qtyOf(allLines), route_identity_complete: allHeaders.filter(function (h) { return ricDestinationIdentity_(h).ok; }).length,
    accepted: allHeaders.length, dropped: 0, drop_reasons: [] });

  // 2. ACTIVE + STATION SCOPE — the same predicate the workspace handler applies (SAD_TERMINAL_STATUSES_ plus
  // company/country/marketplace/source_page equality). Read from the shipped constant, not restated.
  var dropped2 = [];
  var active = allHeaders.filter(function (h) {
    if (SAD_TERMINAL_STATUSES_[tb5Lc_(h.status)]) { dropped2.push({ id: tb5Mask_(h.allocation_draft_id), reason: 'TERMINAL_STATUS:' + tb5Str_(h.status) }); return false; }
    return true;
  });
  var scoped = active.filter(function (h) {
    if (tb5Lc_(h.company) !== tb5Lc_(T.company) || tb5Lc_(h.country) !== tb5Lc_(T.country) || tb5Lc_(h.marketplace) !== tb5Lc_(T.marketplace)) {
      dropped2.push({ id: tb5Mask_(h.allocation_draft_id), reason: 'OUT_OF_STATION_SCOPE' }); return false;
    }
    return true;
  });
  var scopedIds = {};
  scoped.forEach(function (h) { scopedIds[tb5Str_(h.allocation_draft_id)] = 1; });
  var scopedLines = allLines.filter(function (l) { return scopedIds[tb5Str_(l.allocation_draft_id)]; });
  b.push({ boundary: '2_active_station_scope', header_count: scoped.length, line_count: scopedLines.length,
    quantity_total: qtyOf(scopedLines),
    route_identity_complete: scoped.filter(function (h) { return ricDestinationIdentity_(h).ok; }).length,
    accepted: scoped.length, dropped: dropped2.length, drop_reasons: dropped2 });

  // 3. ROUTE IDENTITY COMPLETENESS — a header that cannot name its destination has no K4 identity. NOTE: the
  // workspace read does NOT drop these; they are returned. This boundary measures the truth, not a filter.
  var incomplete = scoped.filter(function (h) { return !ricDestinationIdentity_(h).ok; });
  b.push({ boundary: '3_route_identity', header_count: scoped.length, line_count: scopedLines.length,
    quantity_total: qtyOf(scopedLines),
    route_identity_complete: scoped.length - incomplete.length,
    accepted: scoped.length, dropped: 0,
    drop_reasons: incomplete.map(function (h) {
      return { id: tb5Mask_(h.allocation_draft_id), reason: ricDestinationIdentity_(h).code,
        note: 'RETURNED, not dropped — the API hands this row to the client with no destination identity' };
    }) });

  // 4. CLIENT ROUTE MODEL — the exact header fields the shipped hydrate reads, plus the one it invents.
  var clientRows = scoped.map(function (h) {
    var id = tb5Str_(h.allocation_draft_id);
    var mine = allLines.filter(function (l) { return tb5Str_(l.allocation_draft_id) === id; });
    var hTo = tb5Str_(h.recommended_destination_warehouse_id);
    return {
      allocation_draft_id: tb5Mask_(id),
      source_warehouse_id_present: !!tb5Str_(h.recommended_source_warehouse_id),
      destination_warehouse_id_present: !!hTo,
      shipping_method_present: !!tb5Str_(h.recommended_shipping_method),
      planned_qty_total: qtyOf(mine),
      line_count: mine.length,
      persisted_destination_marketplace: tb5Str_(h.destination_marketplace) || '(blank)',
      client_would_synthesise_destination_marketplace: !hTo,
      synthesised_value_source: !hTo ? 'ctx.marketplace (PLAN SCOPE)' : '(none)',
      synthesised_value_rank: !hTo ? 'UI_DERIVED_NOT_AUTHORITATIVE' : null,
      client_would_emit_destination_token: false,
      client_would_emit_destination_display_name: false
    };
  });
  b.push({ boundary: '4_client_route_model', header_count: clientRows.length,
    line_count: scopedLines.length, quantity_total: qtyOf(scopedLines),
    route_identity_complete: scoped.length - incomplete.length,
    accepted: clientRows.length, dropped: 0,
    drop_reasons: [],
    note: 'The shipped hydrate keeps EVERY line it reads — completeness gates PERSISTENCE, not hydration — so no ' +
      'route is dropped here. Quantity is therefore conserved across all four boundaries.',
    rows: clientRows });

  var quantities = b.map(function (x) { return x.quantity_total; });
  return {
    boundaries: b,
    quantity_conserved_across_boundaries: quantities.slice(1).every(function (q, i) { return i === 0 ? true : q === quantities[i]; }),
    scoped_quantity_total: qtyOf(scopedLines),
    headers_returned_without_destination_identity: incomplete.length
  };
}

// ------------------------------------------------------------------------------------------- quantity + FK proof

function tb5QuantityAndFk_(H, L, downstream) {
  var ids = {};
  (H.rows || []).forEach(function (h) { var k = tb5Str_(h.allocation_draft_id); if (k) ids[k] = 1; });
  var qty = 0, unknown = 0, matched = 0, orphans = [], dupPk = {};
  (L.rows || []).forEach(function (l) {
    var n = tb5Qty_(l.planned_qty); if (n === null) unknown++; else qty += n;
    var fk = tb5Str_(l.allocation_draft_id);
    if (fk && ids[fk]) matched++; else orphans.push({ line: tb5Mask_(l.allocation_draft_line_id), fk: tb5Mask_(fk) });
    var pk = tb5Str_(l.allocation_draft_line_id);
    if (pk) (dupPk[pk] = dupPk[pk] || []).push(l.__row);
  });
  var duplicates = Object.keys(dupPk).filter(function (k) { return dupPk[k].length > 1; })
    .map(function (k) { return { line_id: tb5Mask_(k), physical_rows: dupPk[k].length }; });
  var lineFks = {};
  (L.rows || []).forEach(function (l) { lineFks[tb5Str_(l.allocation_draft_id)] = 1; });
  var headersWithoutLines = (H.rows || []).filter(function (h) { return !lineFks[tb5Str_(h.allocation_draft_id)]; })
    .map(function (h) { return tb5Mask_(h.allocation_draft_id); });

  return {
    planned_qty_before: qty,
    planned_qty_proposed: qty,                       // this diagnostic proposes NO quantity change at all
    quantity_conserved: true,
    planned_qty_unknown_cells: unknown,
    matched_lines: matched,
    orphans: orphans.length,
    orphan_lines: orphans,
    headers_without_lines: headersWithoutLines,
    lines_without_headers: orphans.map(function (o) { return o.line; }),
    duplicate_line_identities: duplicates,
    duplicate_risk: duplicates.length > 0,
    orphan_risk: orphans.length > 0,
    downstream_references: downstream.references.length,
    submit_idempotency_binding: 'shipping_plans.submit_batch_id === execution_key. It does NOT reference an ' +
      'allocation_draft_id, so a header id is not part of any submit idempotency key.',
    source_reason_binding: 'shipping_plan_lines.source_reason is a free-text provenance token, not a foreign key.',
    retaining_current_ids_required: true,
    retaining_current_ids_why: 'shipping_allocation_draft_lines stores allocation_draft_id. Re-keying a header ' +
      'would orphan every line pointing at it, and lines are the only stored FK consumer.',
    matches_recorded: qty === TEMP_B5_RECORDED_.planned_qty_total &&
      matched === TEMP_B5_RECORDED_.matched_lines && orphans.length === TEMP_B5_RECORDED_.orphan_lines
  };
}

// ------------------------------------------------------------------------------------------------- entry point

/**
 * THE ONLY PUBLIC FUNCTION. No arguments, no modes, no COMMIT. Read-only on every path including every refusal.
 */
function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN() {
  var out = {
    mode: 'DRY_RUN (READ-ONLY)', read_only: true, has_commit_mode: false,
    build_version: TEMP_B5_BUILD_VERSION_, operation: TEMP_B5_OPERATION_,
    tables_read: TEMP_B5_TABLES_READ_,
    evidence_ranks: TEMP_B5_EVIDENCE_RANKS_,
    never_promoted_into_persisted_identity: TEMP_B5_NEVER_PROMOTED_,
    schema: null, headers: [], target: null, hydration: null, quantity_and_fk: null, downstream: null,
    readiness: null, verdict: null, blocking_reasons: [], checksum: null,
    DB_WRITES: 0, ROWS_CHANGED: 0, COLUMNS_APPENDED: 0, IDS_CREATED: 0, BACKFILLS: 0
  };

  var missing = tb5MissingAuthorities_();
  if (missing.length) {
    out.verdict = 'STOP_UNCLASSIFIABLE_LEGACY_STATE';
    out.blocking_reasons.push('AUTHORITY_NOT_LOADED:' + missing.join(',') +
      ' — this project is not running the F1-7N-FB-4F-B3 authority. Nothing was classified, because a diagnostic ' +
      'that guesses an identity rule reaches a different verdict than the writer would.');
    out.readiness = { schemaReady: false, runtimeAuthorityReady: false, existingRouteHydrationReady: false,
      newDistinctRouteSaveReady: false, legacyAdoptionReady: false, submitReady: false };
    tb5Log_(out); return out;
  }

  var ss = null;
  try { ss = tb5OpenReadOnly_(); } catch (e) { ss = null; }
  if (!ss) {
    out.verdict = 'STOP_UNCLASSIFIABLE_LEGACY_STATE';
    out.blocking_reasons.push('DB_NOT_REACHABLE — the configured production database could not be opened read-only.');
    out.readiness = { schemaReady: false, runtimeAuthorityReady: true, existingRouteHydrationReady: false,
      newDistinctRouteSaveReady: false, legacyAdoptionReady: false, submitReady: false };
    tb5Log_(out); return out;
  }

  var schema = tb5SchemaState_(ss);
  out.schema = { drafts: schema.drafts, lines: schema.lines, schema_ready: schema.schema_ready };
  var H = schema.H, L = schema.L;

  if (!H.present || !L.present) {
    out.verdict = 'STOP_UNCLASSIFIABLE_LEGACY_STATE';
    out.blocking_reasons.push('SHEET_MISSING — one of the two allocation tables is absent.');
    out.readiness = { schemaReady: false, runtimeAuthorityReady: true, existingRouteHydrationReady: false,
      newDistinctRouteSaveReady: false, legacyAdoptionReady: false, submitReady: false };
    tb5Log_(out); return out;
  }

  var activeRows = (H.rows || []).filter(function (h) { return !SAD_TERMINAL_STATUSES_[tb5Lc_(h.status)]; });
  var downstream = tb5DownstreamRefs_(ss,
    (H.rows || []).map(function (h) { return tb5Str_(h.allocation_draft_id); }),
    (L.rows || []).map(function (l) { return tb5Str_(l.allocation_draft_line_id); }));
  out.downstream = downstream;

  out.headers = (H.rows || []).map(function (h) { return tb5ClassifyHeader_(h, L.rows, activeRows, downstream); });
  out.target = tb5TargetAnalysis_(activeRows, L.rows, schema);
  out.hydration = tb5HydrationTrace_(H, L, TEMP_B5_TARGET_);
  out.quantity_and_fk = tb5QuantityAndFk_(H, L, downstream);

  // ---- READINESS: six independent booleans, never collapsed into one -----------------------------------------
  var contested = out.headers.some(function (x) { return x.contested_identity; });
  var downstreamBlocked = out.headers.some(function (x) { return x.decision === 'DOWNSTREAM_REFERENCE_BLOCKED'; });
  var unclassifiable = out.headers.filter(function (x) { return x.active && !x.k4_classifiable; });
  var sim = (out.target.future_save_simulation || {}).attempted_sea_express_amazon || null;

  var readiness = {
    schemaReady: schema.schema_ready === true,
    runtimeAuthorityReady: true,
    // Hydration is READY only when every active header can name its OWN destination. A route the page can only
    // render by inventing a marketplace from the plan scope is not hydrated, it is decorated.
    existingRouteHydrationReady: unclassifiable.length === 0,
    newDistinctRouteSaveReady: !!sim && sim.verdict === 'CREATE_DISTINCT_K4_HEADER' && sim.persistable.persistable === true,
    legacyAdoptionReady: out.headers.some(function (x) { return x.decision === 'SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE'; }) &&
      !contested && !downstreamBlocked,
    submitReady: !contested && !downstreamBlocked &&
      out.quantity_and_fk.orphans === 0 && out.quantity_and_fk.duplicate_line_identities.length === 0 &&
      unclassifiable.length === 0
  };
  out.readiness = readiness;

  // ---- ONE global verdict -------------------------------------------------------------------------------------
  if (downstreamBlocked) out.verdict = 'STOP_DOWNSTREAM_REFERENCE_RISK';
  else if (contested) out.verdict = 'STOP_CONTESTED_IDENTITY';
  else if (!schema.schema_ready) out.verdict = 'STOP_UNCLASSIFIABLE_LEGACY_STATE';
  else if (unclassifiable.length) {
    // The route cannot be hydrated from persisted data, but the path forward is a REVIEWED user-confirmation
    // plan rather than a defect hunt — every unclassifiable row is adoptable on an explicit save.
    out.verdict = readiness.legacyAdoptionReady
      ? 'READY_FOR_REVIEWED_USER-CONFIRMATION_PLAN' : 'STOP_UNCLASSIFIABLE_LEGACY_STATE';
    out.blocking_reasons.push('EXISTING_ROUTE_HYDRATION_NOT_READY: ' + unclassifiable.length +
      ' active header(s) store no route destination. The page can only render them by synthesising a marketplace ' +
      'from the PLAN SCOPE, which is UI_DERIVED_NOT_AUTHORITATIVE and must never be promoted.');
  } else if (!readiness.existingRouteHydrationReady) out.verdict = 'STOP_HYDRATION_CONTRACT_DEFECT';
  else out.verdict = 'READY_FOR_CONTROLLED_UI_SAVE_TEST';

  var hFp = tb5Fingerprint_(H.headers), lFp = tb5Fingerprint_(L.headers);
  out.checksum = TEMP_B5_CHECKSUM_PREFIX_ + ':' + tb5Hash_([
    TEMP_B5_OPERATION_, hFp.digest, H.row_count, lFp.digest, L.row_count,
    out.quantity_and_fk.planned_qty_before, out.quantity_and_fk.matched_lines, out.quantity_and_fk.orphans,
    out.verdict
  ].join(TEMP_B5_RS_));
  out.checksum_scope = 'IDENTIFIES THIS READ. It authorises nothing — this file has no writer to authorise.';

  out.footer = 'DB_WRITES=0 · ROWS_CHANGED=0 · COLUMNS_APPENDED=0 · BACKFILLS=0 · IDS_CREATED=0 · K4_IDS_CREATED=0 · ' +
    'ID_REWRITES=0 · QUANTITY_CHANGES=0 · FK_CHANGES=0 · STATUS_TRANSITIONS=0 · PROPERTY_WRITES=0 · DRIVE_WRITES=0 · EMAILS=0';
  tb5Log_(out);
  return out;
}
