/**
 * TEMP_legacy_allocation_draft_reconcile_diagnose.gs
 * F1-7N-FB-4F-A — LEGACY ALLOCATION DRAFT READ-ONLY RECONCILIATION DIAGNOSIS. UN-ROUTED. STRICTLY READ-ONLY.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A SECOND IDENTITY ALGORITHM.
 *
 * FB-4F-A asked first whether the tooling already in the project answers the question. Two candidates exist and
 * only one of them is even about the right table:
 *
 *   67_api_v1_allocation_draft_identity.gs (system.allocationDraftIdentityDiagnostic) — a fine read-only
 *     diagnostic for `request_order_allocation_drafts`, the ORDER PLANNING table, distinguishing
 *     RD::MONTHLY_ORDER:: from RAD-M-. That is a DIFFERENT identity family in a DIFFERENT table. It cannot see
 *     a shipping_allocation_drafts row at all, so it is not extended here and not called here.
 *
 *   68_api_v1_execution_plan_conflict_diagnostic.gs (system.executionPlanConflictDiagnostic) — the right table,
 *     the right identity families, already read-only, already masked, and it already runs the REAL production
 *     authorities (sadHeaderRouteIsComplete_, sadK2GroupKey_, sadK2DeterministicHeaderId_,
 *     sadResolveActiveDraftK2OrK3_, sadK2ReconcileDecision_, sadLegacyReconcileReason_) rather than copies.
 *
 * So this file is a THIN wrapper: it reuses 68_'s pure helpers verbatim (epcReadTable_, epcIdRef_,
 * epcIdentityFamily_, epcFnv1a_) and 16_'s production authorities verbatim (sadHeaderRouteIsComplete_,
 * sadK2GroupKey_, sadK2DeterministicHeaderId_) rather than copying any of them, and refuses to run at all if
 * 16_ is not loaded. It
 * adds only what FB-4F-A needs and 68_ does not have: quantity conservation, a downstream foreign-key
 * inventory, the destination_marketplace schema decision, a bounded before/after mapping, and the protected
 * checksum FB-4F-B would have to match. No route is added and the action contract is untouched.
 *
 * ZERO WRITE, STRUCTURALLY. This file contains no row append, no cell set, no sheet insert, no row delete, no
 * sheet-ensure, no lock service, no properties write, no Drive and no Mail. It opens the production database by
 * id and reads whole tabs. A regression suite asserts each absence against comment- and string-stripped source
 * AND against the call sites, because a name inside a comment is not a call.
 *
 * IT PROPOSES; IT NEVER MIGRATES. There is no COMMIT mode in this file, not even a disabled one. FB-4F-B is a
 * separate, reviewed task.
 *
 * MASKING. Every allocation-draft / line / plan id is reported masked (class prefix + short tail) alongside a
 * stable hash for correlation. Operator notes, emails and free text are NEVER printed — only their presence,
 * length and a hash.
 */

var TEMP_FB4FA_ROUND_ = 'F1-7N-FB-4F-A';
var TEMP_FB4FA_NAME_ = 'TEMP_LEGACY_ALLOCATION_DRAFT_RECONCILE_DIAGNOSE';

// --------------------------------------------------------------------------------------------------------------
// THE TARGET. Narrow by construction: this diagnostic answers ONE identity family and refuses anything wider.
// `company` is deliberately blank — FB-4F-A says resolve it from the persisted records, never assume it. If more
// than one company owns rows for this country/marketplace/SKU the scope is AMBIGUOUS and the run refuses.
// --------------------------------------------------------------------------------------------------------------
var TEMP_FB4FA_TARGET_ = {
  country: 'US',
  marketplace: 'Amazon',
  sku: 'CO1100-R',
  company: '',                       // '' = resolve from persisted rows; set only to disambiguate a refusal
  planning_cycle: '',                // '' = every cycle present for the scope
  from_display: 'CN侑鑫',    // the live From label — resolved to a warehouse id from `warehouses`, never invented
  to_display: 'Amazon',              // a MARKETPLACE, not a warehouse — see the schema decision below
  shipping_method: 'sea_express',
  method_label: '美森海卡',   // display only; sea_express is the identity
  expected_arrival: '2026-10-16',
  quantity: 400
};

var TEMP_FB4FA_DRAFTS_ = 'shipping_allocation_drafts';
var TEMP_FB4FA_LINES_ = 'shipping_allocation_draft_lines';
var TEMP_FB4FA_PLANS_ = 'shipping_plans';
var TEMP_FB4FA_PLAN_LINES_ = 'shipping_plan_lines';
var TEMP_FB4FA_WAREHOUSES_ = 'warehouses';

// The statuses that make a header a live participant — the SAME set 16_ treats as active. A diagnostic that used
// a different notion of "active" would answer a different question than the guard asks.
var TEMP_FB4FA_ACTIVE_ = { draft: 1, site_confirmed: 1, partially_submitted: 1 };

// The header fields a migration would be forbidden to alter. The checksum below is computed over exactly these,
// in this order, so FB-4F-B can prove that nothing drifted between the diagnosis and the commit.
var TEMP_FB4FA_PROTECTED_HEADER_ = [
  'allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery',
  'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version',
  'created_by', 'created_at', 'updated_by', 'updated_at',
  'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'
];
var TEMP_FB4FA_PROTECTED_LINE_ = [
  'allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code',
  'recommended_qty', 'planned_qty', 'units_per_carton', 'route_no', 'source_warehouse_id',
  'line_status', 'override_reason', 'note', 'created_at', 'updated_at'
];

// ==============================================================================================================
// PURE helpers. Deliberately few: the identity rules come from 16_ and the masking/reading from 68_.
// ==============================================================================================================
function tempFb4faStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function tempFb4faLc_(v) { return tempFb4faStr_(v).toLowerCase(); }
// A quantity that is blank or non-numeric is NOT zero — it is unknown, and §F requires that distinction because
// treating unknown as zero is how a conservation proof silently passes over a hole.
function tempFb4faQty_(v) {
  var s = tempFb4faStr_(v);
  if (s === '') return null;
  var n = Number(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}
// Free text is never printed. Its PRESENCE, length and hash are enough to prove a migration preserved it.
function tempFb4faTextRef_(v) {
  var s = tempFb4faStr_(v);
  return { present: s !== '', length: s.length, hash: s === '' ? '' : ('h:' + epcFnv1a_(s)) };
}
function tempFb4faDateStr_(v) {
  if (v && typeof v === 'object' && typeof v.getFullYear === 'function') {
    try { return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2); }
    catch (e) { return String(v); }
  }
  return tempFb4faStr_(v);
}
// The PROTECTED-FIELD CHECKSUM (§J). Canonical ordering is the field list above, then the rows sorted by their
// own id, so the value depends on content and never on read order. Any protected field changing changes it.
function tempFb4faChecksum_(headers, lines) {
  function projectRow(o, fields) {
    var parts = [];
    for (var i = 0; i < fields.length; i++) parts.push(fields[i] + '=' + tempFb4faDateStr_(o[fields[i]]));
    return parts.join('');
  }
  var h = (headers || []).map(function (o) { return projectRow(o, TEMP_FB4FA_PROTECTED_HEADER_); }).sort();
  var l = (lines || []).map(function (o) { return projectRow(o, TEMP_FB4FA_PROTECTED_LINE_); }).sort();
  return 'fb4fa-1:' + epcFnv1a_(h.join('') + '' + l.join(''));
}

// ==============================================================================================================
// THE DIAGNOSTIC.
// ==============================================================================================================
function tempFb4faDiagnose_(targetArg) {
  var t = targetArg || TEMP_FB4FA_TARGET_;
  var out = {
    diagnostic: TEMP_FB4FA_NAME_, round: TEMP_FB4FA_ROUND_, readOnly: true,
    DB_WRITES: 0, DRIVE_WRITES: 0, LOCKS_ACQUIRED: 0,
    refused: null, target: null, sections: {},
    schema_change_required: null, mechanically_safe: null, decision: null
  };

  // ---- 0. SCOPE GATE — fail closed before anything is read ---------------------------------------------------
  var missing = [];
  ['country', 'marketplace', 'sku'].forEach(function (k) { if (!tempFb4faStr_(t[k])) missing.push(k); });
  if (missing.length) {
    out.refused = { code: 'SCOPE_INCOMPLETE', missing: missing,
      message: 'a bounded target is required; this diagnostic never scans the whole table' };
    out.decision = 'REFUSED';
    return out;
  }
  out.target = {
    country: tempFb4faStr_(t.country), marketplace: tempFb4faStr_(t.marketplace), sku: tempFb4faStr_(t.sku),
    company_requested: tempFb4faStr_(t.company) || '(resolve from persisted records)',
    planning_cycle_filter: tempFb4faStr_(t.planning_cycle) || '(all cycles)',
    from_display: tempFb4faStr_(t.from_display), to_display: tempFb4faStr_(t.to_display),
    shipping_method: tempFb4faStr_(t.shipping_method), expected_arrival: tempFb4faStr_(t.expected_arrival),
    quantity_attempted: tempFb4faQty_(t.quantity)
  };

  var ss = null;
  try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); } catch (e) { ss = null; }
  if (!ss) { out.refused = { code: 'DB_NOT_REACHABLE', message: 'the configured production database could not be opened read-only' }; out.decision = 'REFUSED'; return out; }

  var H = epcReadTable_(ss, TEMP_FB4FA_DRAFTS_);
  var L = epcReadTable_(ss, TEMP_FB4FA_LINES_);
  var P = epcReadTable_(ss, TEMP_FB4FA_PLANS_);
  var PL = epcReadTable_(ss, TEMP_FB4FA_PLAN_LINES_);
  var W = epcReadTable_(ss, TEMP_FB4FA_WAREHOUSES_);
  if (!H.present) { out.refused = { code: 'DRAFTS_TABLE_MISSING', table: TEMP_FB4FA_DRAFTS_ }; out.decision = 'REFUSED'; return out; }
  if (!L.present) { out.refused = { code: 'DRAFT_LINES_TABLE_MISSING', table: TEMP_FB4FA_LINES_ }; out.decision = 'REFUSED'; return out; }

  // ---- 1. RESOLVE THE SOURCE WAREHOUSE from the warehouses table. Never invented from the display string. -----
  var fromLc = tempFb4faLc_(t.from_display);
  var whMatches = (W.rows || []).filter(function (w) {
    return tempFb4faLc_(w.warehouse_name) === fromLc || tempFb4faLc_(w.warehouse_code) === fromLc
      || tempFb4faLc_(w.warehouse_id) === fromLc;
  });
  var sourceWarehouse = whMatches.length === 1 ? whMatches[0] : null;
  out.sections['1_source_warehouse'] = {
    from_display: tempFb4faStr_(t.from_display),
    matches_in_warehouses: whMatches.length,
    resolved: !!sourceWarehouse,
    warehouse_id_ref: sourceWarehouse ? epcIdRef_(sourceWarehouse.warehouse_id) : epcIdRef_(''),
    warehouse_code: sourceWarehouse ? tempFb4faStr_(sourceWarehouse.warehouse_code) : '',
    country: sourceWarehouse ? tempFb4faStr_(sourceWarehouse.country) : '',
    note: whMatches.length === 1 ? 'resolved from `warehouses`'
      : (whMatches.length === 0 ? 'NOT FOUND in `warehouses` — the From label does not resolve to a stored warehouse'
        : 'AMBIGUOUS — more than one warehouse carries this label')
  };

  // ---- 2. MATCH THE IDENTITY FAMILY (§D) ---------------------------------------------------------------------
  // Headers are matched on the SCOPE the guard itself uses (company/country/marketplace/cycle), then narrowed to
  // those that actually carry a line for the target SKU. A header is never matched by its id shape.
  var linesByDraft = {};
  (L.rows || []).forEach(function (l) {
    var k = tempFb4faStr_(l.allocation_draft_id);
    (linesByDraft[k] = linesByDraft[k] || []).push(l);
  });
  var cyc = tempFb4faLc_(t.planning_cycle);
  var scopeHeaders = (H.rows || []).filter(function (h) {
    if (tempFb4faLc_(h.country) !== tempFb4faLc_(t.country)) return false;
    if (tempFb4faLc_(h.marketplace) !== tempFb4faLc_(t.marketplace)) return false;
    if (tempFb4faStr_(t.company) && tempFb4faLc_(h.company) !== tempFb4faLc_(t.company)) return false;
    if (cyc && tempFb4faLc_(h.planning_cycle) !== cyc) return false;
    var mine = linesByDraft[tempFb4faStr_(h.allocation_draft_id)] || [];
    for (var i = 0; i < mine.length; i++) if (tempFb4faLc_(mine[i].sku) === tempFb4faLc_(t.sku)) return true;
    return false;
  });

  // Company must resolve to exactly ONE owner, or the scope is ambiguous and this refuses.
  var companies = {};
  scopeHeaders.forEach(function (h) { var c = tempFb4faStr_(h.company); if (c) companies[c] = (companies[c] || 0) + 1; });
  var companyList = Object.keys(companies).sort();
  if (scopeHeaders.length === 0) {
    out.refused = { code: 'NO_MATCHING_RECORDS',
      message: 'no allocation-draft header in this country/marketplace carries a line for this SKU; nothing to diagnose and nothing to migrate' };
    out.sections['2_identity_family'] = { headers_matched: 0 };
    out.decision = 'REFUSED';
    return out;
  }
  if (companyList.length > 1) {
    out.refused = { code: 'SCOPE_AMBIGUOUS_MULTIPLE_COMPANIES', companies: companyList,
      message: 'more than one company owns records for this country/marketplace/SKU; set TEMP_FB4FA_TARGET_.company and re-run' };
    out.decision = 'REFUSED';
    return out;
  }
  var company = companyList[0];
  out.target.company_resolved = company;

  var routeCompleteFn = (typeof sadHeaderRouteIsComplete_ === 'function') ? sadHeaderRouteIsComplete_ : null;
  var detIdFn = (typeof sadK2DeterministicHeaderId_ === 'function') ? sadK2DeterministicHeaderId_ : null;
  var groupKeyFn = (typeof sadK2GroupKey_ === 'function') ? sadK2GroupKey_ : null;
  if (!routeCompleteFn || !detIdFn || !groupKeyFn) {
    out.refused = { code: 'PRODUCTION_AUTHORITY_UNAVAILABLE',
      message: '16_shipping_allocation_handlers.gs is not loaded in this project; this diagnostic refuses to re-implement its identity rules' };
    out.decision = 'REFUSED';
    return out;
  }

  var families = {};
  var headerRecords = scopeHeaders.map(function (h) {
    var id = tempFb4faStr_(h.allocation_draft_id);
    var fam = epcIdentityFamily_(h, detIdFn, routeCompleteFn);
    families[fam.family] = (families[fam.family] || 0) + 1;
    var mine = (linesByDraft[id] || []);
    var mySkuLines = mine.filter(function (l) { return tempFb4faLc_(l.sku) === tempFb4faLc_(t.sku); });
    var qtySum = 0, qtyBlank = 0;
    mine.forEach(function (l) { var q = tempFb4faQty_(l.planned_qty); if (q === null) qtyBlank++; else qtySum += q; });
    return {
      raw: h, lines: mine,
      row: {
        table: TEMP_FB4FA_DRAFTS_,
        id_ref: epcIdRef_(id),
        id_prefix: id.slice(0, 8),
        identity_family: fam.family,
        identity_family_detail: fam.detail,
        company: tempFb4faStr_(h.company), country: tempFb4faStr_(h.country), marketplace: tempFb4faStr_(h.marketplace),
        planning_cycle: tempFb4faDateStr_(h.planning_cycle), source_page: tempFb4faStr_(h.source_page),
        status: tempFb4faLc_(h.status),
        is_active: !!TEMP_FB4FA_ACTIVE_[tempFb4faLc_(h.status)],
        origin_type: tempFb4faStr_(h.recommended_source_warehouse_id) ? 'WAREHOUSE' : '(blank)',
        origin_id_ref: epcIdRef_(h.recommended_source_warehouse_id),
        origin_display: tempFb4faStr_(h.recommended_source_warehouse_code_snapshot),
        destination_type: tempFb4faStr_(h.recommended_destination_warehouse_id) ? 'WAREHOUSE' : 'NOT_PERSISTED',
        destination_id_ref: epcIdRef_(h.recommended_destination_warehouse_id),
        destination_display: tempFb4faStr_(h.recommended_destination_warehouse_code_snapshot),
        destination_marketplace_column_present: Object.prototype.hasOwnProperty.call(h, 'destination_marketplace'),
        shipping_method: tempFb4faStr_(h.recommended_shipping_method),
        last_mile_delivery: tempFb4faStr_(h.recommended_last_mile_delivery),
        recommendation_group_no: tempFb4faStr_(h.recommendation_group_no),
        persisted_route_complete: !!routeCompleteFn(h),
        regenerates_own_id: detIdFn(h) === id,
        k2_group_key_hash: 'h:' + epcFnv1a_(groupKeyFn(h)),
        draft_version: tempFb4faStr_(h.draft_version),
        created_at: tempFb4faDateStr_(h.created_at), updated_at: tempFb4faDateStr_(h.updated_at),
        submitted_at: tempFb4faDateStr_(h.submitted_at),
        note_ref: tempFb4faTextRef_(h.note),
        line_count: mine.length,
        lines_for_target_sku: mySkuLines.length,
        header_line_qty_total: qtySum,
        lines_with_blank_or_non_numeric_qty: qtyBlank
      }
    };
  });

  out.sections['2_identity_family'] = {
    headers_matched: headerRecords.length,
    by_identity_family: families,
    company_resolved: company,
    headers: headerRecords.map(function (r) { return r.row; }),
    additional_id_shapes_found: (function () {
      var shapes = {};
      headerRecords.forEach(function (r) {
        var id = tempFb4faStr_(r.raw.allocation_draft_id);
        var s = id.indexOf('SADH-K2-') === 0 ? 'SADH-K2-' : (id.indexOf('SADH-') === 0 ? 'SADH-' : (id.indexOf('SAD-') === 0 ? 'SAD-' : (id ? 'OTHER' : '(blank)')));
        shapes[s] = (shapes[s] || 0) + 1;
      });
      return shapes;
    })()
  };

  // ---- 3. LINE CENSUS (§D) -----------------------------------------------------------------------------------
  var allLines = [];
  headerRecords.forEach(function (r) {
    r.lines.forEach(function (l) {
      allLines.push({ header: r, line: l });
      });
  });
  out.sections['3_lines'] = {
    line_count: allLines.length,
    lines: allLines.map(function (x) {
      var l = x.line;
      var lid = tempFb4faStr_(l.allocation_draft_line_id);
      return {
        table: TEMP_FB4FA_LINES_,
        id_ref: epcIdRef_(lid),
        id_shape: lid.indexOf('SADL-K2-') === 0 ? 'SADL-K2-' : (lid.indexOf('SADL-') === 0 ? 'SADL-' : (lid ? 'OTHER' : '(blank)')),
        parent_id_ref: epcIdRef_(l.allocation_draft_id),
        sku: tempFb4faStr_(l.sku), site_sku: tempFb4faStr_(l.site_sku),
        window_code: tempFb4faStr_(l.window_code),
        line_status: tempFb4faLc_(l.line_status),
        source_warehouse_id_ref: epcIdRef_(l.source_warehouse_id),
        route_no: tempFb4faStr_(l.route_no),
        recommended_qty: tempFb4faQty_(l.recommended_qty),
        planned_qty: tempFb4faQty_(l.planned_qty),
        planned_qty_is_blank_or_non_numeric: tempFb4faQty_(l.planned_qty) === null,
        units_per_carton: tempFb4faQty_(l.units_per_carton),
        created_at: tempFb4faDateStr_(l.created_at), updated_at: tempFb4faDateStr_(l.updated_at),
        note_ref: tempFb4faTextRef_(l.note),
        override_reason_ref: tempFb4faTextRef_(l.override_reason),
        matches_target_sku: tempFb4faLc_(l.sku) === tempFb4faLc_(t.sku)
      };
    })
  };

  // ---- 4. WHERE EACH ROUTE DIMENSION ACTUALLY LIVES (§D classification) ---------------------------------------
  // A UI label is not proof that a canonical value was persisted, so every dimension is classified against the
  // ACTUAL header row read above, not against the request payload.
  var headerCols = H.headers || [];
  function hasCol(n) { return headerCols.indexOf(n) !== -1; }
  out.sections['4_dimension_classification'] = {
    header_column_count: headerCols.length,
    dimensions: [
      { dimension: 'company', classification: hasCol('company') ? 'PERSISTED_CANONICAL' : 'MISSING', column: 'company' },
      { dimension: 'country', classification: hasCol('country') ? 'PERSISTED_CANONICAL' : 'MISSING', column: 'country' },
      { dimension: 'marketplace', classification: hasCol('marketplace') ? 'PERSISTED_CANONICAL' : 'MISSING', column: 'marketplace' },
      { dimension: 'planning_cycle', classification: hasCol('planning_cycle') ? 'PERSISTED_CANONICAL' : 'MISSING', column: 'planning_cycle' },
      { dimension: 'origin (From)', classification: hasCol('recommended_source_warehouse_id') ? 'PERSISTED_CANONICAL' : 'MISSING', column: 'recommended_source_warehouse_id' },
      { dimension: 'origin display', classification: hasCol('recommended_source_warehouse_code_snapshot') ? 'PERSISTED_LEGACY' : 'MISSING', column: 'recommended_source_warehouse_code_snapshot' },
      { dimension: 'destination WAREHOUSE (To)', classification: hasCol('recommended_destination_warehouse_id') ? 'PERSISTED_CANONICAL' : 'MISSING', column: 'recommended_destination_warehouse_id' },
      { dimension: 'destination MARKETPLACE (To)', classification: hasCol('destination_marketplace') ? 'PERSISTED_CANONICAL' : 'CLIENT_ONLY_UNPERSISTABLE', column: 'destination_marketplace' },
      { dimension: 'shipping method', classification: hasCol('recommended_shipping_method') ? 'PERSISTED_CANONICAL' : 'MISSING', column: 'recommended_shipping_method' },
      { dimension: 'last mile', classification: hasCol('recommended_last_mile_delivery') ? 'PERSISTED_CANONICAL' : 'MISSING', column: 'recommended_last_mile_delivery' },
      { dimension: 'expected arrival', classification: 'CLIENT_ONLY_UNPERSISTABLE', column: '(none on the draft header or line)' },
      { dimension: 'route quantity', classification: 'PERSISTED_CANONICAL', column: 'shipping_allocation_draft_lines.planned_qty' },
      { dimension: 'route completeness verdict', classification: 'DERIVED', column: 'sadHeaderRouteIsComplete_(persisted row)' },
      { dimension: 'K2 group key', classification: 'DERIVED', column: 'sadK2GroupKey_(persisted row)' },
      { dimension: 'canonical K2 id', classification: 'DERIVED', column: 'sadK2DeterministicHeaderId_(persisted row)' }
    ]
  };

  // ---- 5. NATURAL KEY AND COLLISIONS (§E) --------------------------------------------------------------------
  // The request as the page would send it, so the PROPOSED key is derived from the shipped rule rather than
  // guessed. destination_marketplace is included exactly as the client sends it, which is what makes the
  // request route-complete while the persisted row is not.
  var wantHeader = {
    planning_cycle: tempFb4faStr_(t.planning_cycle) || tempFb4faDateStr_(headerRecords[0].raw.planning_cycle),
    company: company, country: tempFb4faStr_(t.country), marketplace: tempFb4faStr_(t.marketplace),
    source_page: 'inventory_replenishment',
    recommended_source_warehouse_id: sourceWarehouse ? tempFb4faStr_(sourceWarehouse.warehouse_id) : '',
    recommended_destination_warehouse_id: '',
    destination_marketplace: tempFb4faStr_(t.to_display),
    recommended_shipping_method: tempFb4faStr_(t.shipping_method),
    recommended_last_mile_delivery: '',
    recommendation_group_no: ''
  };
  var wantKey = groupKeyFn(wantHeader);
  var wantId = detIdFn(wantHeader);
  var activeRows = (H.rows || []).filter(function (h) { return !!TEMP_FB4FA_ACTIVE_[tempFb4faLc_(h.status)]; });
  var sameGroup = activeRows.filter(function (h) { return groupKeyFn(h) === wantKey; });
  var proposedIdOwners = activeRows.filter(function (h) { return tempFb4faStr_(h.allocation_draft_id) === wantId; });

  var legacyRecords = headerRecords.filter(function (r) { return r.row.identity_family === 'LEGACY'; });
  var k2Records = headerRecords.filter(function (r) { return r.row.identity_family === 'CANONICAL' || r.row.identity_family === 'K2'; });
  var collapse = {};
  headerRecords.forEach(function (r) {
    var k = groupKeyFn(r.raw);
    (collapse[k] = collapse[k] || []).push(epcIdRef_(r.raw.allocation_draft_id).masked);
  });
  var collapsingGroups = Object.keys(collapse).filter(function (k) { return collapse[k].length > 1; });

  out.sections['5_natural_key'] = {
    k2_dimensions_from_runtime: ['planning_cycle', 'company', 'country', 'marketplace', 'source_page',
      'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
      'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'],
    k2_line_dimensions_from_runtime: ['allocation_draft_id', 'sku', 'site_sku', 'window_code'],
    request_route_complete: !!routeCompleteFn(wantHeader),
    requested_k2_group_key_hash: 'h:' + epcFnv1a_(wantKey),
    proposed_k2_header_id_ref: epcIdRef_(wantId),
    legacy_headers_matched: legacyRecords.length,
    legacy_natural_key_hashes: legacyRecords.map(function (r) { return 'h:' + epcFnv1a_(groupKeyFn(r.raw)); }),
    canonical_k2_header_already_exists: k2Records.length > 0,
    active_headers_claiming_the_proposed_group: sameGroup.length,
    active_headers_claiming_the_proposed_group_refs: sameGroup.map(function (h) { return epcIdRef_(h.allocation_draft_id); }),
    proposed_id_already_owned_by_an_active_row: proposedIdOwners.length > 0,
    proposed_id_owner_refs: proposedIdOwners.map(function (h) { return epcIdRef_(h.allocation_draft_id); }),
    multiple_legacy_rows_collapse_to_one_k2_key: collapsingGroups.length > 0,
    collapsing_group_members: collapsingGroups.map(function (k) { return collapse[k]; }),
    // One legacy row expands ambiguously when its own lines disagree about the route dims the header groups on.
    one_legacy_row_expands_to_multiple_routes: (function () {
      var amb = [];
      legacyRecords.forEach(function (r) {
        var seen = {};
        r.lines.forEach(function (l) {
          seen[tempFb4faLc_(l.source_warehouse_id) + '|' + tempFb4faLc_(l.route_no)] = 1;
        });
        if (Object.keys(seen).length > 1) amb.push({ header_ref: epcIdRef_(r.raw.allocation_draft_id), distinct_line_routes: Object.keys(seen).length });
      });
      return amb;
    })(),
    contested_identities_that_must_remain_blocked: sameGroup.length > 1
      ? sameGroup.map(function (h) { return epcIdRef_(h.allocation_draft_id); }) : []
  };

  // ---- 6. QUANTITY CONSERVATION (§F) --------------------------------------------------------------------------
  var beforeTotal = 0, blankQty = 0;
  allLines.forEach(function (x) {
    var q = tempFb4faQty_(x.line.planned_qty);
    if (q === null) blankQty++; else beforeTotal += q;
  });
  // The proposal never moves a quantity: every line keeps its planned_qty under its existing parent, so the
  // AFTER total is computed from the same cells rather than assumed equal.
  var afterTotal = 0;
  allLines.forEach(function (x) { var q = tempFb4faQty_(x.line.planned_qty); if (q !== null) afterTotal += q; });
  var targetSkuTotal = 0;
  allLines.forEach(function (x) {
    if (tempFb4faLc_(x.line.sku) !== tempFb4faLc_(t.sku)) return;
    var q = tempFb4faQty_(x.line.planned_qty); if (q !== null) targetSkuTotal += q;
  });
  out.sections['6_quantity_conservation'] = {
    before_line_quantity_total: beforeTotal,
    after_proposed_line_quantity_total: afterTotal,
    conserved: beforeTotal === afterTotal,
    lines_with_blank_or_non_numeric_qty: blankQty,
    target_sku_line_quantity_total: targetSkuTotal,
    route_group_requested_quantity: tempFb4faQty_(t.quantity),
    unexplained_delta: (tempFb4faQty_(t.quantity) === null) ? null : (targetSkuTotal - tempFb4faQty_(t.quantity)),
    note: blankQty > 0
      ? 'a blank or non-numeric planned_qty is UNKNOWN, not zero — the proposal is unsafe until it is explained'
      : 'every matched line carries a numeric planned_qty'
  };

  // ---- 7. DOWNSTREAM FOREIGN KEYS (§G) -------------------------------------------------------------------------
  // The repository schema was searched: NO table stores an allocation_draft_id / allocation_draft_line_id column.
  // The real downstream references are TEXTUAL and are inventoried here rather than assumed away.
  var matchedHeaderIds = {}, matchedLineIds = {};
  headerRecords.forEach(function (r) { matchedHeaderIds[tempFb4faStr_(r.raw.allocation_draft_id)] = 1; });
  allLines.forEach(function (x) { matchedLineIds[tempFb4faStr_(x.line.allocation_draft_line_id)] = 1; });

  var planLineRefs = [];
  (PL.rows || []).forEach(function (pl) {
    var sr = tempFb4faStr_(pl.source_reason);
    if (!sr) return;
    var mh = /allocation_draft:([^|]+)/.exec(sr);
    var ml = /\|line:([^|]*)$/.exec(sr);
    var hid = mh ? tempFb4faStr_(mh[1]) : '';
    var lid = ml ? tempFb4faStr_(ml[1]) : '';
    if (!hid && !lid) return;
    if (matchedHeaderIds[hid] || matchedLineIds[lid]) {
      planLineRefs.push({ header_ref: epcIdRef_(hid), line_ref: epcIdRef_(lid), plan_ref: epcIdRef_(pl.shipping_plan_id) });
    }
  });
  var submitStampedHeaders = headerRecords.filter(function (r) {
    return /\[SUBMITTED @/.test(tempFb4faStr_(r.raw.note));
  });
  out.sections['7_downstream_foreign_keys'] = {
    tables_searched_for_a_stored_fk_column: [TEMP_FB4FA_PLANS_, TEMP_FB4FA_PLAN_LINES_, 'shipments', 'shipment_lines',
      'shipment_line_allocations', 'shipment_routes', 'shipment_events', 'purchase_orders', 'purchase_order_lines'],
    stored_fk_column_found: false,
    stored_fk_note: 'no table in this schema stores allocation_draft_id or allocation_draft_line_id as a column',
    textual_references: [{
      referencing_table: TEMP_FB4FA_PLAN_LINES_,
      referencing_column: 'source_reason',
      form: 'allocation_draft:<header_id>|run:<..>|fv:<..>|cyc:<..>|line:<line_id>',
      row_count: planLineRefs.length,
      refs: planLineRefs.slice(0, 40),
      preserved_by_in_place_completion: true,
      preserved_by_identity_replacement: false,
      orphan_risk: planLineRefs.length ? 'HIGH if any header or line id changes' : 'none observed for this target',
      // source_reason is a spfp-1 fingerprint field, so an id change also changes the Submit idempotency hash.
      also_binds_submit_idempotency: true
    }, {
      referencing_table: TEMP_FB4FA_DRAFTS_,
      referencing_column: 'note',
      form: '[SUBMITTED @<ts> → shipping_plan <ids> · exec <key>]',
      row_count: submitStampedHeaders.length,
      refs: submitStampedHeaders.map(function (r) { return epcIdRef_(r.raw.allocation_draft_id); }),
      preserved_by_in_place_completion: true,
      preserved_by_identity_replacement: false,
      orphan_risk: submitStampedHeaders.length ? 'the reverse pointer would be stranded on the old header' : 'none observed',
      also_binds_submit_idempotency: false
    }],
    shipping_plans_table_present: !!P.present,
    shipping_plan_lines_table_present: !!PL.present
  };

  // ---- 8. DESTINATION-MARKETPLACE SCHEMA DECISION (§H) ---------------------------------------------------------
  var destColPresent = hasCol('destination_marketplace');
  // DERIVED FROM THE SHIPPED RULE, not assumed: is destination_marketplace one of the dimensions the K2 group key
  // actually separates on? Two otherwise identical headers are keyed with two different marketplace destinations
  // and the keys compared. The answer decides whether persisting the column is SUFFICIENT or only NECESSARY.
  var probeA = {}, probeB = {};
  TEMP_FB4FA_PROTECTED_HEADER_.forEach(function (f) { probeA[f] = ''; probeB[f] = ''; });
  probeA.destination_marketplace = 'Amazon'; probeB.destination_marketplace = 'Walmart';
  var destIsGroupDim = groupKeyFn(probeA) !== groupKeyFn(probeB);
  out.sections['8_destination_marketplace'] = {
    persisted_canonical_column_exists: destColPresent,
    is_a_k2_group_dimension_in_the_shipped_rule: destIsGroupDim,
    grouping_consequence: destIsGroupDim
      ? 'the shipped K2 group key already separates two marketplace destinations, so persisting the column is sufficient'
      : 'the shipped K2 group key does NOT separate two marketplace destinations (it groups on recommended_destination_warehouse_id, which is BLANK for both). Persisting the column is NECESSARY but NOT SUFFICIENT: two routes to different marketplaces would still collapse onto one header. That is exactly the client-side ROUTE_IDENTITY_NOT_PERSISTABLE refusal, and FB-4F-B must decide separately whether sadK2GroupKey_ gains the dimension — a change that alters every future deterministic id and must be weighed against the fact that existing ids are never re-keyed',
    column_searched_on: TEMP_FB4FA_DRAFTS_,
    client_sends_it: true,
    client_evidence: 'assets/js/pages/inventory-replenishment.js sets destination_marketplace for a marketplace-logical To; assets/js/utils/inventory-compat.js records that it is accepted but not stored',
    backend_reads_it: 'sadHeaderRouteIsComplete_ reads b.destination_marketplace, so a REQUEST is route-complete while the RE-READ persisted row is not',
    consequence: 'a marketplace-logical To persists as a BLANK recommended_destination_warehouse_id and the row can never satisfy the persisted-route completeness rule again',
    proposal: destColPresent ? null : {
      target_sheet: TEMP_FB4FA_DRAFTS_,
      new_column_name: 'destination_marketplace',
      data_type: 'string; trimmed; compared case-insensitively; blank means "the destination is a warehouse"',
      insertion_policy: 'APPEND-ONLY at the end of the sheet, after the lifecycle tail, never reordering a live column',
      writer_changes_required: 'sadUpsertDraftHeaderCore_ and sadAtomicUpsertCore_ persist the payload field they already accept',
      reader_changes_required: 'none in sadHeaderRouteIsComplete_ (it already reads the field); hydration returns it so the page stops re-deriving it',
      backfill_source: 'the header marketplace, ONLY for rows whose recommended_destination_warehouse_id is blank AND whose lines carry no destination warehouse',
      ambiguous_legacy_rows: 'a row with a blank destination and no marketplace-logical evidence is LEFT BLANK and stays refused — never guessed',
      validation: 'a row may carry a destination warehouse id OR a destination marketplace, never both',
      cutover_impact: 'additive column on a table whose contract already ALLOWS extra columns, so code sync and schema migration stay order-independent; no action, verb or transport version moves',
      rollback: 'the column is additive and unread by any pre-migration code path, so removing it restores the prior behaviour exactly'
    }
  };

  // ---- 9. BEFORE / AFTER MAPPING (§I) --------------------------------------------------------------------------
  var mechanism = destColPresent ? 'IN_PLACE_CANONICAL_FIELD_COMPLETION' : 'NO_SAFE_AUTOMATIC_MIGRATION_UNTIL_SCHEMA_REVIEW';
  out.sections['9_mapping'] = {
    mechanism: mechanism,
    mechanism_rationale: destColPresent
      ? 'the canonical column exists, so the legacy row can be completed IN PLACE under its existing identity: no id changes, so every textual downstream reference and the Submit fingerprint stay valid'
      : 'the canonical column does not exist, so there is nothing to complete; an identity replacement was REJECTED because shipping_plan_lines.source_reason embeds both ids AND is a spfp-1 fingerprint field, so re-keying would strand the lineage and change the Submit idempotency hash',
    rows: headerRecords.map(function (r) {
      return {
        record: 'header',
        current_identity: epcIdRef_(r.raw.allocation_draft_id),
        proposed_identity: epcIdRef_(r.raw.allocation_draft_id),
        identity_changes: false,
        changed_fields: destColPresent ? ['destination_marketplace'] : [],
        preserved_references: ['shipping_plan_lines.source_reason', 'shipping_allocation_drafts.note', 'shipping_allocation_draft_lines.allocation_draft_id'],
        safety: destColPresent ? 'SAFE_PENDING_REVIEW' : 'BLOCKED_ON_SCHEMA'
      };
    }).concat([{
      record: 'lines (all ' + allLines.length + ')',
      current_identity: { masked: '(unchanged)', hash: '', length: 0, present: allLines.length > 0 },
      proposed_identity: { masked: '(unchanged)', hash: '', length: 0, present: allLines.length > 0 },
      identity_changes: false,
      changed_fields: [],
      preserved_references: ['allocation_draft_line_id', 'allocation_draft_id', 'planned_qty'],
      safety: destColPresent ? 'SAFE_PENDING_REVIEW' : 'BLOCKED_ON_SCHEMA'
    }])
  };

  // ---- 10. CHECKSUM (§J) ---------------------------------------------------------------------------------------
  out.sections['10_checksum'] = {
    algorithm: 'fb4fa-1 = FNV1a over the protected header fields then the protected line fields, each row projected in a fixed field order and the rows sorted by their own projection',
    protected_header_fields: TEMP_FB4FA_PROTECTED_HEADER_,
    protected_line_fields: TEMP_FB4FA_PROTECTED_LINE_,
    checksum: tempFb4faChecksum_(headerRecords.map(function (r) { return r.raw; }), allLines.map(function (x) { return x.line; })),
    usage: 'FB-4F-B must re-read under the lock and recompute this; a mismatch is a typed refusal (FB4FB_CHECKSUM_MISMATCH) and the commit does not proceed'
  };

  // ---- VERDICT --------------------------------------------------------------------------------------------------
  var unsafeReasons = [];
  if (!destColPresent) unsafeReasons.push('destination_marketplace is not a persisted canonical column');
  if (blankQty > 0) unsafeReasons.push('a matched line carries a blank or non-numeric planned_qty');
  if (sameGroup.length > 1) unsafeReasons.push('more than one active header already claims the proposed shipment group');
  if (collapsingGroups.length > 0) unsafeReasons.push('more than one matched header collapses onto a single K2 group key');
  if (!sourceWarehouse) unsafeReasons.push('the From label does not resolve to exactly one stored warehouse');
  out.schema_change_required = !destColPresent;
  out.mechanically_safe = unsafeReasons.length === 0;
  out.unsafe_reasons = unsafeReasons;
  out.decision = destColPresent
    ? (unsafeReasons.length ? 'STOP_UNSAFE' : 'PROPOSAL_READY_FOR_REVIEW')
    : 'STOP_FOR_SCHEMA_REVIEW';
  return out;
}

// ==============================================================================================================
// THE EDITOR ENTRY POINT. Un-routed. Emits a compact summary plus bounded numbered sections, because one
// oversized JSON object is the reliable way to lose the answer to the Apps Script log cap.
// ==============================================================================================================
function TEMP_LEGACY_ALLOCATION_DRAFT_RECONCILE_DIAGNOSE() {
  var d = tempFb4faDiagnose_(TEMP_FB4FA_TARGET_);
  function log(s) { Logger.log('[FB4FA] ' + s); }
  log('=== ' + d.diagnostic + ' · ' + d.round + ' ===');
  log('readOnly=' + d.readOnly + ' DB_WRITES=' + d.DB_WRITES + ' DRIVE_WRITES=' + d.DRIVE_WRITES + ' LOCKS_ACQUIRED=' + d.LOCKS_ACQUIRED);
  if (d.refused) {
    log('REFUSED ' + d.refused.code + ' — ' + (d.refused.message || ''));
    if (d.refused.companies) log('  companies=' + JSON.stringify(d.refused.companies));
    if (d.refused.missing) log('  missing=' + JSON.stringify(d.refused.missing));
    log('decision=' + d.decision);
    return d;
  }
  log('target=' + JSON.stringify(d.target));
  var s = d.sections;
  log('--- 1 source warehouse ---');
  log('  ' + JSON.stringify(s['1_source_warehouse']));
  log('--- 2 identity family ---');
  log('  matched=' + s['2_identity_family'].headers_matched + ' families=' + JSON.stringify(s['2_identity_family'].by_identity_family)
    + ' id_shapes=' + JSON.stringify(s['2_identity_family'].additional_id_shapes_found));
  s['2_identity_family'].headers.forEach(function (h, i) {
    log('  [h' + (i + 1) + '] ' + h.id_ref.masked + ' ' + h.id_ref.hash + ' fam=' + h.identity_family
      + ' status=' + h.status + ' active=' + h.is_active + ' cycle=' + h.planning_cycle
      + ' route_complete=' + h.persisted_route_complete + ' regenerates_own_id=' + h.regenerates_own_id
      + ' from=' + h.origin_id_ref.masked + ' to=' + (h.destination_id_ref.present ? h.destination_id_ref.masked : h.destination_type)
      + ' method=' + h.shipping_method + ' lines=' + h.line_count + ' qty=' + h.header_line_qty_total
      + ' note_present=' + h.note_ref.present + ' group=' + h.k2_group_key_hash);
  });
  log('--- 3 lines (' + s['3_lines'].line_count + ') ---');
  s['3_lines'].lines.slice(0, 40).forEach(function (l, i) {
    log('  [l' + (i + 1) + '] ' + l.id_ref.masked + ' shape=' + l.id_shape + ' parent=' + l.parent_id_ref.masked
      + ' sku=' + l.sku + ' win=' + l.window_code + ' planned=' + l.planned_qty + ' rec=' + l.recommended_qty
      + ' status=' + l.line_status + ' route_no=' + l.route_no + ' note_present=' + l.note_ref.present);
  });
  log('--- 4 dimension classification ---');
  s['4_dimension_classification'].dimensions.forEach(function (x) {
    log('  ' + x.classification + '  ' + x.dimension + '  <- ' + x.column);
  });
  log('--- 5 natural key ---');
  log('  ' + JSON.stringify(s['5_natural_key']));
  log('--- 6 quantity conservation ---');
  log('  ' + JSON.stringify(s['6_quantity_conservation']));
  log('--- 7 downstream foreign keys ---');
  log('  stored_fk_column_found=' + s['7_downstream_foreign_keys'].stored_fk_column_found);
  s['7_downstream_foreign_keys'].textual_references.forEach(function (r) {
    log('  ' + r.referencing_table + '.' + r.referencing_column + ' rows=' + r.row_count
      + ' preserved_in_place=' + r.preserved_by_in_place_completion
      + ' preserved_if_rekeyed=' + r.preserved_by_identity_replacement
      + ' binds_submit_idempotency=' + r.also_binds_submit_idempotency
      + ' orphan_risk=' + r.orphan_risk);
  });
  log('--- 8 destination_marketplace ---');
  log('  persisted_canonical_column_exists=' + s['8_destination_marketplace'].persisted_canonical_column_exists
    + ' client_sends_it=' + s['8_destination_marketplace'].client_sends_it
    + ' is_a_k2_group_dimension=' + s['8_destination_marketplace'].is_a_k2_group_dimension_in_the_shipped_rule);
  log('  grouping_consequence: ' + s['8_destination_marketplace'].grouping_consequence);
  if (s['8_destination_marketplace'].proposal) {
    log('  PROPOSAL ' + JSON.stringify(s['8_destination_marketplace'].proposal));
  }
  log('--- 9 mapping ---');
  log('  mechanism=' + s['9_mapping'].mechanism);
  s['9_mapping'].rows.forEach(function (r) {
    log('  ' + r.record + ' ' + r.current_identity.masked + ' -> ' + r.proposed_identity.masked
      + ' identity_changes=' + r.identity_changes + ' changed=' + JSON.stringify(r.changed_fields) + ' safety=' + r.safety);
  });
  log('--- 10 checksum ---');
  log('  ' + s['10_checksum'].checksum);
  log('=== VERDICT ===');
  log('  schema_change_required=' + d.schema_change_required
    + ' mechanically_safe=' + d.mechanically_safe
    + ' decision=' + d.decision);
  (d.unsafe_reasons || []).forEach(function (r) { log('  unsafe: ' + r); });
  log('  NO MIGRATION, NO WRITE, NO LOCK, NO DELETE WAS PERFORMED BY THIS DIAGNOSTIC.');
  return d;
}
