/**
 * TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs — F1-7N-FC-1B-E3 §F
 * PASTE · RUN · REMOVE. Read-only activation census for the Inventory AI Plan.
 * ================================================================================================================
 *
 * WHAT THIS IS FOR
 * ----------------
 * §E flips INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ to true, which lets a "Generate AI Plan" click reach the
 * canonical writer. This answers the question that has to be answered BEFORE that deployment is published:
 * for one named scope and one named SKU, what would the authoritative allocator actually produce, and does it
 * agree with what the E2 round reported? If it does not agree, activation STOPS — the flag is not the thing to
 * debug, the allocator inputs are.
 *
 * WHAT MAKES IT READ-ONLY (§F.1/§F.2/§F.3)
 * ----------------------------------------
 *   • DB_WRITES = 0. There is no write in this file: no appendRow, no setValue(s), no deleteRow, no insertRow,
 *     no clear, no SpreadsheetApp.flush, no Drive, no MailApp, no property/trigger mutation.
 *   • It never obtains a writer. `weeklyAiPlanPersistenceDeps_(ss)` — the function that hands out the atomic
 *     Header+Lines writer — is NOT called, and `weeklyAiPlanGenerateK2_` (the only path from a plan to a write)
 *     is NOT called. The plan builder it does call, KMWRR.buildK2GenerationPlan, is PURE: 61_ splits its own
 *     generation into a compute pass and a write pass precisely because of that, and this file is the compute
 *     pass and nothing else.
 *   • No Sheet object escapes a read helper. `CENSUS_rows_` opens the sheet, takes values, and returns rows —
 *     the caller never holds anything with a write method on it.
 *   • It reads through the SAME production read contract the real generation reads (§F.3): the same harvest, the
 *     same mapper, the same source-line builder, the same carrier authorities, the same allocated-line adapter
 *     and the same route allocator. A census that read its own way would be measuring a different system.
 *
 * NOTHING IS HARDCODED (§F.5)
 * ---------------------------
 * Company, country, marketplace, SKU and the expected route are ALL parameters. No CO1100-R, no ResUS, no
 * Amazon, no 520, no CN factory, no sea_express appears anywhere in this file or in production.
 *
 * HOW TO RUN
 * ----------
 *   1. Paste this file into the Apps Script project (any name; it shares the one global scope).
 *   2. Edit nothing. Call the single entry point from the editor, e.g.
 *
 *        TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3({
 *          company: '<company>', country: '<country>', marketplace: '<marketplace>', sku: '<sku>',
 *          expect: { qty: <n>, method: '<service>', sourceWarehouseId: '<wh id>', destination: '<token>' }
 *        });
 *
 *      `expect` is OPTIONAL. Supplied, it turns the census into a go/no-go: the verdict is PROCEED only when
 *      the allocator's own output matches it (§F.6). Omitted, the verdict is REVIEW and a human compares.
 *   3. Read the Logger output (and the returned object).
 *   4. DELETE this file from the project. It is not part of the deployment.
 *
 * WHAT IT REPORTS (§F.4)
 * ----------------------
 *   scope · planning cycle · Suggested Qty and gap for the SKU · source warehouse candidates · available
 *   factory stock · destination resolution · matched carrier cards · the ranked route result · Method ·
 *   lead time and ETA · total allocated quantity · ambiguity/refusal codes · active allocation drafts already
 *   stored for the scope · would_create route count · and an activation verdict.
 */

var TEMP_E3_CENSUS_BUILD_ = 'F1-7N-FC-1B-E3';

/** Read-only row reader. The Sheet object stays inside this function — the caller gets values, never a writer. */
function CENSUS_rows_(ss, name) {
  try {
    var sh = ss.getSheetByName(name);
    if (!sh) return [];
    var v = sh.getDataRange().getValues();
    if (!v || v.length < 2) return [];
    var head = v[0].map(function (h) { return String(h == null ? '' : h).trim(); });
    var out = [];
    for (var r = 1; r < v.length; r++) {
      var o = {}, blank = true;
      for (var c = 0; c < head.length; c++) {
        if (!head[c]) continue;
        o[head[c]] = v[r][c];
        if (String(v[r][c] == null ? '' : v[r][c]).trim() !== '') blank = false;
      }
      if (!blank) out.push(o);
    }
    return out;
  } catch (e) { return []; }
}

function CENSUS_str_(v) { return String(v == null ? '' : v).trim(); }
function CENSUS_num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function CENSUS_low_(v) { return CENSUS_str_(v).toLowerCase(); }

function CENSUS_log_(label, value) {
  try {
    Logger.log('[E3-CENSUS] ' + label + ': ' +
      (value && typeof value === 'object' ? JSON.stringify(value) : String(value)));
  } catch (e) {}
}

/**
 * THE SINGLE PUBLIC ENTRY POINT. Read-only. Returns the census; also writes it to the log.
 * @param {{company:string,country:string,marketplace:string,sku:string,expect:Object}} args
 */
function TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(args) {
  var t0 = Date.now();
  var out = {
    census: 'TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3',
    build: TEMP_E3_CENSUS_BUILD_,
    read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0,
    // the writer is not merely unused, it is never constructed — see the header note
    writer_constructed: false,
    ok: false, verdict: 'STOP', blockers: []
  };
  args = args || {};
  var company = CENSUS_str_(args.company), country = CENSUS_str_(args.country);
  var marketplace = CENSUS_str_(args.marketplace), sku = CENSUS_str_(args.sku);
  out.scope = { company: company, country: country, marketplace: marketplace, sku: sku };

  if (!company || !country || !marketplace) {
    out.blockers.push('SCOPE_INCOMPLETE: company, country and marketplace are all required (this census never ' +
      'defaults a scope, and never runs ALL_SITES)');
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }
  if (/^all(_sites)?$/i.test(marketplace)) {
    out.blockers.push('SCOPE_ALL_SITES_FORBIDDEN: a controlled census targets exactly one marketplace');
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  // ---- the effective flag, as the answering deployment reports it (never the repository's copy) -------------
  out.flag = {
    symbol: 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_',
    effective: (typeof inventoryAiPlanDbGenerationEnabled_ === 'function')
      ? (inventoryAiPlanDbGenerationEnabled_() === true) : null,
    config_build: (typeof CONFIG_BUILD_VERSION_ !== 'undefined') ? CONFIG_BUILD_VERSION_ : null,
    note: 'the census is read-only and behaves identically either way; the flag is reported so the census result ' +
          'can be matched to the deployment it describes'
  };

  // ---- the production modules this census refuses to substitute for ----------------------------------------
  var need = [
    ['KMWHA', typeof KMWHA !== 'undefined' && KMWHA && typeof KMWHA.mapWeeklyHarvestToBatchRequest === 'function'],
    ['KMWRB', typeof KMWRB !== 'undefined' && KMWRB && typeof KMWRB.buildWeeklySourceLines === 'function'],
    ['KMWRR', typeof KMWRR !== 'undefined' && KMWRR && typeof KMWRR.buildK2GenerationPlan === 'function'],
    ['weeklyAiPlanHarvest_', typeof weeklyAiPlanHarvest_ === 'function'],
    ['weeklyAiPlanReadCarrierAuthorities_', typeof weeklyAiPlanReadCarrierAuthorities_ === 'function'],
    ['weeklyAiPlanK2AllocatedLines_', typeof weeklyAiPlanK2AllocatedLines_ === 'function'],
    ['weeklyAiPlanShipDate_', typeof weeklyAiPlanShipDate_ === 'function'],
    ['prodExpectedDbId_', typeof prodExpectedDbId_ === 'function']
  ];
  var missing = need.filter(function (p) { return !p[1]; }).map(function (p) { return p[0]; });
  out.production_modules = { required: need.map(function (p) { return p[0]; }), missing: missing };
  if (missing.length) {
    out.blockers.push('PRODUCTION_READ_CONTRACT_UNAVAILABLE: ' + missing.join(', ') +
      ' — this census calls the production allocator or it reports nothing; it never approximates one');
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(prodExpectedDbId_());
    if (typeof prodAssertDbTarget_ === 'function') prodAssertDbTarget_(ss, prodExpectedDbId_());
  } catch (e) {
    out.blockers.push('DB_NOT_REACHABLE_OR_WRONG_TARGET: ' + CENSUS_str_(e && e.message));
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  // ---- planning cycle: the canonical one, resolved the way production resolves it --------------------------
  var planningCycle = '';
  try {
    var ctx = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
    if (ctx && ctx.ok) planningCycle = CENSUS_str_(ctx.planningCycle);
  } catch (e) {}
  out.planning_cycle = planningCycle;
  if (!planningCycle) {
    out.blockers.push('PLANNING_CYCLE_UNRESOLVED');
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  // ---- harvest + map: the same two calls the generation makes ----------------------------------------------
  var h;
  try {
    h = weeklyAiPlanHarvest_(ss, { company: company, country: country, planningCycle: planningCycle });
  } catch (e) {
    out.blockers.push('HARVEST_THREW: ' + CENSUS_str_(e && e.message));
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }
  out.harvest = { ok: !!(h && h.ok), source_data_as_of: CENSUS_str_(h && h.sourceDataAsOf),
    warehouse_count: (function () { try { return Object.keys(h.warehousesById || {}).length; } catch (e) { return 0; } })() };
  if (!h || !h.ok) {
    out.blockers.push('HARVEST_FAILED (fail-closed, exactly as the generation would)');
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  var mapped;
  try {
    mapped = KMWHA.mapWeeklyHarvestToBatchRequest({
      planningCycle: planningCycle,
      businessScope: { company: company, country: country,
        source_page: (typeof WEEKLY_AI_PLAN_SOURCE_PAGE_ !== 'undefined') ? WEEKLY_AI_PLAN_SOURCE_PAGE_ : 'inventory_replenishment' },
      mode: 'MANUAL_REGENERATE', confirmRegenerateOverUserEdits: false,
      actor: 'temp-e3-census', now: (typeof procurementTimestamp_ === 'function') ? procurementTimestamp_() : new Date().toISOString(),
      sourceDataAsOf: h.sourceDataAsOf, formulaVersion: 'WEEKLY_AI_PLAN_V1',
      factoryIdentityConfig: (typeof WEEKLY_AI_PLAN_FACTORY_IDENTITY_ !== 'undefined') ? WEEKLY_AI_PLAN_FACTORY_IDENTITY_ : null,
      warehousesById: h.warehousesById, kmaf: h.kmaf,
      horizonsByDemandRef: h.horizonsByDemandRef, poolsBySku: h.poolsBySku
    });
  } catch (e) {
    out.blockers.push('MAP_THREW: ' + CENSUS_str_(e && e.message));
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }
  out.mapped = { ready: !!(mapped && mapped.ready), issues: (mapped && mapped.issues) || [] };
  if (!mapped || !mapped.ready) {
    out.blockers.push('HARVEST_NOT_READY (canonical facts incomplete — the generation would refuse here too)');
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  // ---- source lines → allocated lines → the requested marketplace only -------------------------------------
  var src = KMWRB.buildWeeklySourceLines(mapped.request);
  out.source_lines = { ok: !!(src && src.ok), status: CENSUS_str_(src && src.status),
    reason: CENSUS_str_(src && src.reason), count: (src && src.lines ? src.lines.length : 0) };
  if (!src || !src.ok) {
    out.blockers.push('SOURCE_LINES_BLOCKED: ' + (out.source_lines.status || 'BLOCKED_INPUT'));
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  var carriers = weeklyAiPlanReadCarrierAuthorities_(ss);
  var shipDate = weeklyAiPlanShipDate_(h);
  var allocated = weeklyAiPlanK2AllocatedLines_(src.lines, h);
  out.ship_date = shipDate;
  out.carrier_authorities = { rate_cards: (carriers.rateCards || []).length, lead_times: (carriers.leadTimes || []).length };

  var mine = (allocated || []).filter(function (a) { return CENSUS_str_(a.marketplace) === marketplace; });
  out.allocated_lines = { scope_total: (allocated || []).length, this_marketplace: mine.length };
  if (!mine.length) {
    out.blockers.push('REQUESTED_SCOPE_EMPTY: the marketplace produced no allocated lines (the generation ' +
      'fails closed with the same code — it never fans out to other marketplaces)');
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  // ---- the SKU under census: Suggested Qty, gap, sources, factory stock, destination ------------------------
  var skuLines = sku ? mine.filter(function (a) { return CENSUS_low_(a.sku) === CENSUS_low_(sku); }) : mine;
  out.sku_facts = {
    sku: sku, line_count: skuLines.length,
    suggested_qty_total: skuLines.reduce(function (s, a) { return s + CENSUS_num_(a.recommended_qty || a.planned_qty); }, 0),
    windows: skuLines.map(function (a) { return CENSUS_str_(a.window_code); }),
    required_by_dates: skuLines.map(function (a) { return CENSUS_str_(a.required_by_date); }),
    source_warehouse_candidates: (function () {
      var seen = {}, o = [];
      skuLines.forEach(function (a) {
        var id = CENSUS_str_(a.source_warehouse_id);
        if (!id || seen[id]) return;
        seen[id] = 1;
        var w = (h.warehousesById || {})[id] || null;
        o.push({ warehouse_id: id, warehouse_code: CENSUS_str_(w && (w.warehouse_code || w.code)),
          country: CENSUS_str_(w && w.country), multi_pool: a.source_multi_pool === true });
      });
      return o;
    })(),
    destination_resolution: skuLines.map(function (a) {
      return { type: CENSUS_str_(a.destination && a.destination.type),
        marketplace: CENSUS_str_(a.destination && a.destination.marketplace),
        warehouse_id: CENSUS_str_(a.destination && a.destination.warehouse_id) };
    })
  };
  if (sku && !skuLines.length) {
    out.blockers.push('SKU_NOT_IN_SCOPE: the named SKU produced no allocated line for this marketplace');
  }

  // factory stock available for the candidate sources — read-only, from the canonical table
  out.factory_stock = (function () {
    var rows = CENSUS_rows_(ss, 'factory_stock'), o = [];
    var ids = {}; (out.sku_facts.source_warehouse_candidates || []).forEach(function (c) { ids[c.warehouse_id] = 1; });
    rows.forEach(function (r) {
      if (sku && CENSUS_low_(r.master_sku || r.sku) !== CENSUS_low_(sku)) return;
      var wid = CENSUS_str_(r.warehouse_id);
      if (Object.keys(ids).length && !ids[wid]) return;
      o.push({ warehouse_id: wid, on_hand: CENSUS_num_(r.quantity_on_hand != null ? r.quantity_on_hand : r.on_hand_qty),
        reserved: CENSUS_num_(r.reserved_qty), available: CENSUS_num_(r.available_qty != null ? r.available_qty
          : (CENSUS_num_(r.quantity_on_hand != null ? r.quantity_on_hand : r.on_hand_qty) - CENSUS_num_(r.reserved_qty))) });
    });
    return o;
  })();

  // matched carrier cards for the lanes this SKU's candidates imply — reported, never chosen from
  out.matched_carrier_cards = (function () {
    var origins = {};
    (out.sku_facts.source_warehouse_candidates || []).forEach(function (c) { if (c.country) origins[CENSUS_low_(c.country)] = 1; });
    return (carriers.rateCards || []).filter(function (rc) {
      var oc = CENSUS_low_(rc.origin_country), dc = CENSUS_low_(rc.destination_country);
      var okO = !Object.keys(origins).length || origins[oc];
      var okD = !country || dc === CENSUS_low_(country);
      return okO && okD;
    }).map(function (rc) {
      return { carrier: CENSUS_str_(rc.carrier_name || rc.carrier), service: CENSUS_str_(rc.shipping_method || rc.service_level),
        origin_country: CENSUS_str_(rc.origin_country), destination_country: CENSUS_str_(rc.destination_country),
        is_active: rc.is_active, effective_from: CENSUS_str_(rc.effective_from), effective_to: CENSUS_str_(rc.effective_to) };
    });
  })();

  // ---- THE RANKED ROUTE. The production allocator, called exactly as the generation calls it. --------------
  // PURE by contract: 61_ computes every group with this call in a pass that writes nothing, then writes in a
  // second pass. This file is that first pass, and there is no second one here.
  var plan;
  try {
    plan = KMWRR.buildK2GenerationPlan({
      scope: { planning_cycle: planningCycle, company: company, country: country, marketplace: marketplace,
        source_page: (mapped.request.businessScope && mapped.request.businessScope.source_page) || 'inventory_replenishment' },
      allocatedLines: mine, warehousesById: h.warehousesById,
      rateCards: carriers.rateCards, leadTimes: carriers.leadTimes, shipDate: shipDate,
      authorizedBySkuWindow: (function () {
        var a = {};
        mine.forEach(function (x) {
          var k = CENSUS_low_(x.sku) + '|' + CENSUS_low_(x.window_code);
          a[k] = (a[k] || 0) + CENSUS_num_(x.planned_qty);
        });
        return a;
      })(),
      sourceCeilingById: {}
    });
  } catch (e) {
    out.blockers.push('ALLOCATOR_THREW: ' + CENSUS_str_(e && e.message));
    CENSUS_log_('BLOCKED', out.blockers); return out;
  }

  var groups = (plan && plan.groups) || [];
  var blocked = (plan && plan.blocked) || [];
  out.allocator = {
    group_count: groups.length,
    conserved: !!(plan && plan.conservation && plan.conservation.conserved),
    conservation: (plan && plan.conservation) || null,
    // §F.4 — ambiguity and refusal codes, verbatim. A tie is a REFUSAL in this allocator, not a coin flip, and
    // that is exactly the property activation depends on: it never picks the first row.
    refusals: blocked.map(function (b) { return b && b.block; }),
    routes: []
  };
  groups.forEach(function (g) {
    var head = (g && g.header) || {};
    var lines = (g && g.lines) || [];
    var mineLines = sku ? lines.filter(function (l) { return CENSUS_low_(l.master_sku || l.sku) === CENSUS_low_(sku); }) : lines;
    if (sku && !mineLines.length) return;
    out.allocator.routes.push({
      group_no: head.recommendation_group_no,
      source_warehouse_id: CENSUS_str_(head.source_warehouse_id),
      destination_type: CENSUS_str_(head.destination_type),
      destination: CENSUS_str_(head.destination_marketplace || head.destination_warehouse_id),
      method: CENSUS_str_(head.recommended_shipping_method),
      last_mile: CENSUS_str_(head.recommended_last_mile_delivery),
      expected_arrival: CENSUS_str_(head.expected_arrival_date || head.expected_arrival),
      lead_time_days: head.transit_days != null ? CENSUS_num_(head.transit_days) : null,
      estimated_cost: head.estimated_cost != null ? CENSUS_num_(head.estimated_cost) : null,
      line_count: mineLines.length,
      total_qty: mineLines.reduce(function (s, l) { return s + CENSUS_num_(l.recommended_qty); }, 0)
    });
  });
  out.total_allocated_quantity = out.allocator.routes.reduce(function (s, r) { return s + r.total_qty; }, 0);
  out.would_create_route_count = out.allocator.routes.length;

  // ---- what is ALREADY stored for this scope (so "would_create" is read against reality) -------------------
  out.active_allocation_drafts = (function () {
    var rows = CENSUS_rows_(ss, 'shipping_allocation_drafts'), o = [];
    rows.forEach(function (r) {
      if (CENSUS_low_(r.status) !== 'active') return;
      if (company && CENSUS_low_(r.company) !== CENSUS_low_(company)) return;
      if (country && CENSUS_low_(r.country) !== CENSUS_low_(country)) return;
      if (marketplace && CENSUS_str_(r.destination_marketplace) && CENSUS_low_(r.destination_marketplace) !== CENSUS_low_(marketplace)) return;
      o.push({ allocation_draft_id: CENSUS_str_(r.allocation_draft_id),
        source_warehouse_id: CENSUS_str_(r.source_warehouse_id),
        destination: CENSUS_str_(r.destination_marketplace || r.destination_warehouse_id),
        method: CENSUS_str_(r.recommended_shipping_method),
        planning_cycle: CENSUS_str_(r.planning_cycle),
        generation_run_id: CENSUS_str_(r.generation_run_id) });
    });
    return o;
  })();

  // ---- §F.6 — THE VERDICT. PROCEED only against a supplied expectation that the allocator actually meets. --
  var exp = args.expect;
  out.expectation = exp || null;
  if (out.blockers.length) {
    out.verdict = 'STOP';
  } else if (!out.allocator.routes.length) {
    out.verdict = 'STOP';
    out.blockers.push('NO_COMPLETE_ROUTE: the allocator produced no route for this SKU. Activation must not ' +
      'proceed on the assumption that a route exists — read `allocator.refusals` for the typed reason.');
  } else if (!exp) {
    out.verdict = 'REVIEW';
    out.ok = true;
    out.note = 'no `expect` supplied, so this census reports and does not judge. Compare the route above with ' +
      'the one the previous round reported before publishing the activation deployment.';
  } else {
    var r0 = out.allocator.routes[0];
    var diffs = [];
    if (exp.qty != null && CENSUS_num_(exp.qty) !== r0.total_qty) diffs.push('qty: expected ' + exp.qty + ', allocator says ' + r0.total_qty);
    if (CENSUS_str_(exp.method) && CENSUS_low_(exp.method) !== CENSUS_low_(r0.method)) diffs.push('method: expected ' + exp.method + ', allocator says ' + (r0.method || '(none)'));
    if (CENSUS_str_(exp.sourceWarehouseId) && CENSUS_low_(exp.sourceWarehouseId) !== CENSUS_low_(r0.source_warehouse_id)) diffs.push('source: expected ' + exp.sourceWarehouseId + ', allocator says ' + (r0.source_warehouse_id || '(none)'));
    if (CENSUS_str_(exp.destination) && CENSUS_low_(exp.destination) !== CENSUS_low_(r0.destination)) diffs.push('destination: expected ' + exp.destination + ', allocator says ' + (r0.destination || '(none)'));
    if (!r0.method) diffs.push('method is EMPTY — an incomplete route must never be materialized');
    if (!r0.expected_arrival) diffs.push('expected_arrival is EMPTY — no lead time resolved for this lane');
    if (!out.allocator.conserved) diffs.push('conservation NOT conserved — the allocated quantity does not match the authorized quantity');
    out.differences = diffs;
    out.verdict = diffs.length ? 'STOP' : 'PROCEED';
    out.ok = !diffs.length;
    if (diffs.length) {
      out.blockers.push('ALLOCATOR_DISAGREES_WITH_EXPECTATION: activation STOPS. ' + diffs.join(' · '));
    }
  }

  out.elapsed_ms = Date.now() - t0;
  CENSUS_log_('verdict', out.verdict);
  CENSUS_log_('scope', out.scope);
  CENSUS_log_('planning_cycle', out.planning_cycle);
  CENSUS_log_('flag', out.flag);
  CENSUS_log_('sku_facts', out.sku_facts);
  CENSUS_log_('factory_stock', out.factory_stock);
  CENSUS_log_('carrier_authorities', out.carrier_authorities);
  CENSUS_log_('matched_carrier_cards', out.matched_carrier_cards.length);
  CENSUS_log_('allocator', out.allocator);
  CENSUS_log_('total_allocated_quantity', out.total_allocated_quantity);
  CENSUS_log_('would_create_route_count', out.would_create_route_count);
  CENSUS_log_('active_allocation_drafts', out.active_allocation_drafts.length);
  CENSUS_log_('blockers', out.blockers);
  CENSUS_log_('db_writes', out.db_writes);
  return out;
}
