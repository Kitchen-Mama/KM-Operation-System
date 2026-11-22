

























var WEEKLY_AI_PLAN_FACTORY_IDENTITY_ = { CN_YOUXIN: 'WH-TW-CN-FACTORY-YOUXIN', TW_SHENGYI: 'WH-TW-TW-FACTORY-RES' };
var WEEKLY_AI_PLAN_SOURCE_PAGE_ = 'inventory_replenishment';

function weeklyAiPlanStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }





function weeklyAiPlanMktKey_(company, country, marketplace) {
var SEP = String.fromCharCode(124);
var ESC = String.fromCharCode(92);
return [company, country, marketplace].map(function (v) {
return weeklyAiPlanStr_(v).split(ESC).join(ESC + ESC).split(SEP).join(ESC + SEP);
}).join(SEP);
}


function weeklyAiPlanNum_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function weeklyAiPlanErr_(code, message, extra) { var e = { code: code, message: message || code }; if (extra) for (var k in extra) e[k] = extra[k]; return e; }
















var WeeklyAiPlanControlledAuthority_ = (function () {
var minted = {};
function scopeKey(spec) { var s = (spec && spec.scope) || {}; return [String(s.company || ''), String(s.country || ''), String(s.marketplace || ''), String((spec && spec.planning_cycle) || '')].join('|'); }
return {
scopeKey: scopeKey,
mint: function (spec) { var nonce = Utilities.getUuid(); minted[nonce] = scopeKey(spec); return { __wap_controlled: true, nonce: nonce, spec: spec }; },
verify: function (cap, liveScopeSpec) {
if (!cap || cap.__wap_controlled !== true || !cap.nonce) return { ok: false, reason: 'NO_INTERNAL_CAPABILITY' };
var stored = minted[cap.nonce];
if (stored === undefined) return { ok: false, reason: 'CAPABILITY_NOT_MINTED_IN_EXECUTION' };
if (stored !== scopeKey(cap.spec)) return { ok: false, reason: 'CAPABILITY_TAMPERED' };
var live = scopeKey(liveScopeSpec);
if (scopeKey(cap.spec) !== live) return { ok: false, reason: 'CAPABILITY_SCOPE_MISMATCH' };
if (!((liveScopeSpec.scope || {}).marketplace)) return { ok: false, reason: 'CONTROLLED_REQUIRES_EXACT_MARKETPLACE' };
delete minted[cap.nonce];
return { ok: true, reason: null };
}
};
})();







function handleGenerateWeeklyAiPlanDraft_(body) {
try {
body = body || {};
var company = weeklyAiPlanStr_(body.company);
var country = weeklyAiPlanStr_(body.country);
var mode = weeklyAiPlanStr_(body.mode) || 'MANUAL_REGENERATE';
if (mode !== 'MANUAL_REGENERATE' && mode !== 'SCHEDULED_REFRESH') return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('INVALID_MODE', 'mode must be MANUAL_REGENERATE|SCHEDULED_REFRESH')] });
if (!company || !country) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('INVALID_SCOPE', 'company + country required (generation universe is company,country)')] });

if (typeof KMWHA === 'undefined' || typeof KMWRB === 'undefined' || typeof KMAF === 'undefined' || typeof KMWRR === 'undefined') {
return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('WEEKLY_AI_PLAN_NOT_BUNDLED', 'weekly AI plan core not present in bundle (KMWHA/KMWRB/KMAF/KMWRR)')] });
}





var genEnabled = (typeof inventoryAiPlanDbGenerationEnabled_ === 'function') && inventoryAiPlanDbGenerationEnabled_() === true;
if (!genEnabled) {
return jsonResponse_({ success: false, disabled: true, errors: [weeklyAiPlanErr_('INVENTORY_AI_PLAN_DB_GENERATION_DISABLED', 'Inventory AI Plan DB generation is staged OFF (INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false); zero rows written. Run TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY() before any controlled enablement.')] });
}

var ss = SpreadsheetApp.openById(prodExpectedDbId_());
if (typeof prodAssertDbTarget_ === 'function') prodAssertDbTarget_(ss, prodExpectedDbId_());

var planningCycle = weeklyAiPlanStr_(body.planningCycle);
if (!planningCycle) {
var ctx = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
if (ctx && ctx.ok) planningCycle = ctx.planningCycle;
}
if (!planningCycle) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('PLANNING_CYCLE_UNRESOLVED', 'could not resolve canonical planning cycle')] });





var expectedBySite = weeklyAiPlanExpectedDemand_(body, company, country);




var requestedMarketplace = weeklyAiPlanStr_(body.currentMarketplace) || weeklyAiPlanStr_(body.requestedMarketplace);
var h = weeklyAiPlanHarvest_(ss, { company: company, country: country, planningCycle: planningCycle,
marketplace: requestedMarketplace }, expectedBySite);
if (!h.ok) return weeklyAiPlanDiagResponse_(h, { success: false, errors: h.errors || [weeklyAiPlanErr_('HARVEST_FAILED', 'fact harvest failed')] });
// A2-D14C: nothing left outside the COMMITMENT DATE HOLD -> HOLD (no draft, no submit, no replacement, no expiry; db_writes 0)
var _chH = h.qualifyingPlanned && h.qualifyingPlanned.commitmentHold;
if (_chH && (_chH.active || _chH.a0_active) && _chH.blocks_run) return weeklyAiPlanDiagResponse_(h, weeklyAiPlanCommitmentHoldResponse_(_chH, { planning_cycle: planningCycle, scope: { company: company, country: country, marketplace: requestedMarketplace }, mode: mode }));



















var _naFast = weeklyAiPlanK2NoAction_(h);
if (_naFast.noAction) {
return weeklyAiPlanDiagResponse_(h, weeklyAiPlanNoActionResponse_(_naFast, {
planning_cycle: planningCycle,
scope: { company: company, country: country, marketplace: weeklyAiPlanStr_(body.currentMarketplace) },
mode: mode, site_count: h.site_count == null ? null : h.site_count,
source_data_as_of: weeklyAiPlanStr_(h.sourceDataAsOf) || null,
recommendation_authority: h.recommendationState || null }));
}


var mapped = KMWHA.mapWeeklyHarvestToBatchRequest({
planningCycle: planningCycle,
businessScope: { company: company, country: country, marketplace: requestedMarketplace,
source_page: WEEKLY_AI_PLAN_SOURCE_PAGE_ },
mode: mode, confirmRegenerateOverUserEdits: body.confirmRegenerateOverUserEdits === true,
actor: weeklyAiPlanStr_(body.actor) || 'user', now: procurementTimestamp_(),
sourceDataAsOf: h.sourceDataAsOf, formulaVersion: 'WEEKLY_AI_PLAN_V1',


errors: Array.isArray(h.errors) ? h.errors : [],
factoryIdentityConfig: WEEKLY_AI_PLAN_FACTORY_IDENTITY_, warehousesById: h.warehousesById,
kmaf: h.kmaf, horizonsByDemandRef: h.horizonsByDemandRef, poolsBySku: h.poolsBySku
});







if (!mapped.ready) {





var _na0 = weeklyAiPlanK2NoAction_(h);
if (_na0.noAction) {
return weeklyAiPlanDiagResponse_(h, weeklyAiPlanNoActionResponse_(_na0, {
planning_cycle: planningCycle,
scope: { company: company, country: country, marketplace: weeklyAiPlanStr_(body.currentMarketplace) },
mode: mode, site_count: h.site_count == null ? null : h.site_count,
source_data_as_of: weeklyAiPlanStr_(h.sourceDataAsOf) || null,
recommendation_authority: h.recommendationState || null }));
}
var _nd = weeklyAiPlanNoDemandVerdict_(h, mapped);
if (_nd.noDemand) {
return weeklyAiPlanDiagResponse_(h, {
success: true,
data: {
code: 'NO_REPLENISHMENT_REQUIRED',
message: 'No replenishment is required for this scope.',
planning_cycle: planningCycle,
scope: { company: company, country: country, marketplace: weeklyAiPlanStr_(body.currentMarketplace) },
site_count: h.site_count == null ? null : h.site_count,
receiver_count: _nd.receiverCount,
requested_qty: 0, allocated_qty: 0, route_count: 0, routes: [],



status: 'COMPLETED', zero_result: true, job_status: 'NO_DEMAND',
header_created: false, line_created: false, db_writes: 0,
demand_basis_total: _nd.basisTotal, canonical_demand_total: _nd.gapTotal,
source_data_as_of: weeklyAiPlanStr_(h.sourceDataAsOf),
forecast_normalization: h.forecast_normalization || null
},
errors: []
});
}
var _rdIssues = Array.isArray(mapped.issues) ? mapped.issues : [];
var _rdFirst = _rdIssues.filter(function (i) { return i && i.blocking !== false; })[0] || _rdIssues[0] || null;
var _rdMsg = _rdFirst
? ('canonical facts not ready: ' + _rdFirst.code + (_rdFirst.field ? ' (' + _rdFirst.field + ')' : '') +
(_rdFirst.actual ? ' — ' + _rdFirst.actual : ''))
: 'canonical §7 facts not ready (fail closed)';
return weeklyAiPlanDiagResponse_(h, {
success: false,
errors: [weeklyAiPlanErr_('HARVEST_NOT_READY', _rdMsg, {
details: {
stage: 'READINESS',
readiness_reason: mapped.reason || null,
issues: _rdIssues,
warnings: Array.isArray(mapped.warnings) ? mapped.warnings : [],
predicates: Array.isArray(mapped.predicates) ? mapped.predicates : [],
harvest: { ok: h.ok === true, site_count: h.site_count == null ? null : h.site_count,
pending_destination_suggestions: h.pendingDestination || [],
commitment_warnings: (h.qualifyingPlanned && h.qualifyingPlanned.warnings) || [],
pool_issues: h.poolIssues || [],
receiver_count: h.receiver_count == null ? null : h.receiver_count,
source_data_as_of: weeklyAiPlanStr_(h.sourceDataAsOf) },


no_demand_verdict: { no_demand: false, reason: _nd.reason, receiver_count: _nd.receiverCount,
demand_basis_total: _nd.basisTotal, canonical_demand_total: _nd.gapTotal,
positive_gap_refs: _nd.positiveGapRefs.slice(0, 20) },
planning_cycle: planningCycle,
scope: { company: company, country: country, marketplace: weeklyAiPlanStr_(body.currentMarketplace) },
db_writes: 0
}
})]
});
}


var deps = weeklyAiPlanPersistenceDeps_(ss);



return weeklyAiPlanGenerateK2_(ss, mapped.request, h, deps, body);
} catch (e) {
return weeklyAiPlanDiagResponse_(h, { success: false, errors: [weeklyAiPlanErr_('WEEKLY_AI_PLAN_ERROR', (e && e.message) ? String(e.message) : String(e))] });   // D5-V3-R4 (R3-5)
}
}


















var WAP_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64-V3B4-A2D14C-AD1B-AD3';









// AD3 C round 3 (review F1): the carrier_lead_times active rule, identical to 12_ shipLtActive_ / KMRA.leadTimeActive: status inactive /
// disabled -> excluded; is_active false / 0 / no / n -> excluded; blank or absent -> active.
function weeklyAiPlanLeadTimeActive_(r) {
  if (/^(inactive|disabled)$/i.test(String(r && r.status == null ? '' : r.status).trim())) return false;
  var a = r ? r.is_active : ''; if (a === false) return false;
  return !/^(false|0|no|n)$/i.test(String(a == null ? '' : a).trim());
}
function weeklyAiPlanReadCarrierAuthorities_(ss) {





function rows(name) {
try {
var o = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, name) : null;
return Array.isArray(o) ? o : ((o && Array.isArray(o.rows)) ? o.rows : []);
} catch (e) { return []; }
}
return { rateCards: rows('carrier_rate_cards'), leadTimes: rows('carrier_lead_times').filter(weeklyAiPlanLeadTimeActive_) };   // AD3 C round 3 (review F1): inactive lead-time rows never reach readiness / advice / routes
}

























function weeklyAiPlanCarrierReadiness_(rateCards, leadTimes, laneQuery, asOfOrdinal) {
var q = { origin_country: weeklyAiPlanStr_(laneQuery && laneQuery.originCountry),
destination_country: weeklyAiPlanStr_(laneQuery && laneQuery.destinationCountry),
marketplace: weeklyAiPlanStr_(laneQuery && laneQuery.marketplace) };
var out = { lane_key: q.origin_country + '|' + q.destination_country + '|' + (q.marketplace || '(any)'),
lane_query: q, as_of_ordinal: (asOfOrdinal === undefined ? null : asOfOrdinal),
rate_card: { authority: 'carrier_rate_cards', usable_on_lane: 0, canonical_methods: [] },
lead_time: { authority: 'carrier_lead_times', rows_on_lane: 0, keyed_methods: [] },
matched_methods: [], ready: false, missing: [], missing_fields: [], blocking_token: null };
var kmra = (typeof KMRA !== 'undefined' && KMRA) ? KMRA : null;
if (!kmra || typeof kmra.normalizeRateCard !== 'function') {
out.missing.push('KMRA_UNAVAILABLE');
out.blocking_token = 'KMRA_UNAVAILABLE';
return out;
}

var cardMethods = {};
(rateCards || []).forEach(function (raw) {
var dto = kmra.normalizeRateCard(raw);
if (!kmra.axisOk(dto.originCountry, q.origin_country)) return;
if (!kmra.axisOk(dto.destinationCountry, q.destination_country)) return;
if (!kmra.axisOk(dto.marketplace, q.marketplace)) return;
if (!kmra.rateCardUsable(dto, out.as_of_ordinal)) return;
out.rate_card.usable_on_lane++;
if (dto.methodKey) cardMethods[dto.methodKey] = 1;
});
out.rate_card.canonical_methods = Object.keys(cardMethods).sort();


var ltMethods = {};
(leadTimes || []).forEach(function (raw) {
var lt = kmra.normalizeLeadTime(raw);
if (!kmra.axisOk(lt.originCountry, q.origin_country)) return;
if (!kmra.axisOk(lt.destinationCountry, q.destination_country)) return;
out.lead_time.rows_on_lane++;
if (!lt.methodKey) return;
if (!isFinite(lt.avgDays) && !isFinite(lt.maxDays) && !isFinite(lt.minDays)) return;
ltMethods[lt.methodKey] = 1;
});
out.lead_time.keyed_methods = Object.keys(ltMethods).sort();

out.matched_methods = out.rate_card.canonical_methods.filter(function (m) { return ltMethods[m] === 1; });
if (!out.rate_card.usable_on_lane) {
out.missing.push('CARRIER_RATE_CARD');
out.blocking_token = 'NO_CARRIER_CARD_FOR_LANE';
} else if (!out.rate_card.canonical_methods.length) {
out.missing.push('CANONICAL_SHIPPING_METHOD_ON_CARD');
out.blocking_token = 'NO_CANONICAL_METHOD';
}
if (!out.lead_time.keyed_methods.length) {
out.missing.push('CARRIER_LEAD_TIME');
if (!out.blocking_token) out.blocking_token = 'NO_LEAD_TIME';
} else if (!out.matched_methods.length && out.rate_card.canonical_methods.length) {
out.missing.push('LEAD_TIME_FOR_A_METHOD_THE_CARD_OFFERS');
if (!out.blocking_token) out.blocking_token = 'NO_LEAD_TIME';
}
out.ready = out.missing.length === 0 && out.matched_methods.length > 0;


if (!out.ready) out.missing_fields = weeklyAiPlanCarrierMissingFields_(q, out.missing);
return out;
}




function weeklyAiPlanCarrierMissingFields_(q, missing) {
var out = [];
if (missing.indexOf('CARRIER_RATE_CARD') !== -1 || missing.indexOf('CANONICAL_SHIPPING_METHOD_ON_CARD') !== -1) {
out.push({ table: 'carrier_rate_cards',
created_by: 'Carrier Rate Card page -> Master Template (download -> fill -> upload). Import action ' +
'`importCarrierRateCards` with mode=master; a blank rate_card_id row CREATES. The Update Template ' +
'cannot create rows.',
fields: [
{ field: 'carrier_id', required: true, note: 'must already exist in `carriers`; never auto-created. carrier_name resolves to it only when unambiguous.' },
{ field: 'origin_country', required: true, value: q.origin_country },
{ field: 'destination_country', required: true, value: q.destination_country },
{ field: 'marketplace', required: false, note: 'blank = wildcard (matches any marketplace on this lane); ' + (q.marketplace ? 'or exactly "' + q.marketplace + '"' : 'no marketplace constraint needed') },
{ field: 'shipping_method', required: true, note: 'must map to a CANONICAL key or the lane cannot be lead-time joined. Mapped leading tokens: air / sea express / sea / express / courier / truck. Anything else (e.g. GROUND, RAIL) is deliberately unmapped.' },
{ field: 'last_mile_delivery', required: true, note: 'free text; must match the carrier_lead_times row below (or be blank on both).' },
{ field: 'charge_type', required: true, note: 'enum: weight | volume | container | shipment | carton' },
{ field: 'charge_unit', required: true, note: 'enum: kg | lb | cbm | 20GP | 40HQ | shipment | carton' },
{ field: 'currency', required: true, note: 'the carrier\u2019s quoted currency' },
{ field: 'unit_rate', required: true, note: 'numeric; the carrier\u2019s quoted rate' },
{ field: 'effective_from', required: true, note: 'yyyy-mm-dd; MUST cover the ship date or the card is not usable' },
{ field: 'effective_to', required: false, note: 'yyyy-mm-dd, or blank for open-ended' },
{ field: 'status', required: false, note: 'enum: active | inactive (blank is treated as active)' },
{ field: 'import_duty_treatment', required: false, note: 'enum: included_in_rate | excluded_in_rate; blank is a valid needs-completion state and is never derived' }
] });
}
if (missing.indexOf('CARRIER_LEAD_TIME') !== -1 || missing.indexOf('LEAD_TIME_FOR_A_METHOD_THE_CARD_OFFERS') !== -1) {
out.push({ table: 'carrier_lead_times',
created_by: 'NO GENERIC HANDLER EXISTS. `carrier_rate_cards` REJECTS transit columns by design and the ' +
'only lead-time writer in the project is the hard-coded CN->JP Sinotrans seed. This row must be ' +
'entered directly in the `carrier_lead_times` tab, or a maintenance handler must be added first.',
fields: [
{ field: 'lead_time_id', required: true, note: 'CLT-###### (6-digit); next value continues the existing sequence' },
{ field: 'carrier_id', required: true, note: 'the SAME carrier as the rate card above' },
{ field: 'origin_country', required: true, value: q.origin_country },
{ field: 'destination_country', required: true, value: q.destination_country },
{ field: 'shipping_method', required: true, note: 'must resolve to the SAME canonical key as the rate card\u2019s method, or the two never join' },
{ field: 'last_mile_delivery', required: true, note: 'must match the rate card\u2019s last_mile_delivery (or be blank on both)' },
{ field: 'avg_days', required: true, note: 'numeric calendar days. avg_days is preferred; max_days/min_days are used only as a conservative fallback, so a row with all three blank is NOT authority.' },
{ field: 'min_days', required: false, note: 'numeric calendar days' },
{ field: 'max_days', required: false, note: 'numeric calendar days' }
] });
}
return out;
}


















function weeklyAiPlanMethodAdvice_(allocatedLines, harvest, leadTimes, shipDate) {
var out = { authority: 'KMMR', buffer: null, ship_date: weeklyAiPlanStr_(shipDate) || null,
tranches: [], counted_quantity: 0, alternative_scenario_count: 0,
tranches_with_method: 0, tranches_needing_review: 0,
status: 'MANUAL_REVIEW_REQUIRED', review_reasons: [] };
var kmmr = (typeof KMMR !== 'undefined' && KMMR) ? KMMR : null;
if (!kmmr || typeof kmmr.recommend !== 'function') { out.authority = 'KMMR_UNAVAILABLE'; return out; }
var cfg = (typeof weeklyAiPlanTransitBuffer_ === 'function') ? weeklyAiPlanTransitBuffer_() : null;
var shipOrd = (typeof KMWRR !== 'undefined' && KMWRR && typeof KMWRR.dateToOrdinal === 'function')
? KMWRR.dateToOrdinal(shipDate) : null;
var whById = (harvest && harvest.warehousesById) || {};
var seenReason = {};

(allocatedLines || []).forEach(function (a) {
var srcId = weeklyAiPlanStr_(a.source_warehouse_id);
var srcWh = whById[srcId] || null;
var dest = a.destination || {};
var lane = { originCountry: weeklyAiPlanStr_(srcWh && srcWh.country),
destinationCountry: weeklyAiPlanStr_(dest.country) };
var reqOrd = (typeof KMWRR !== 'undefined' && KMWRR && typeof KMWRR.dateToOrdinal === 'function')
? KMWRR.dateToOrdinal(a.required_by_date) : null;

var dus = (reqOrd == null || shipOrd == null) ? null : (reqOrd - shipOrd);


var buf = kmmr.bufferFor(cfg, '');
if (!out.buffer) out.buffer = { days: buf.days, source: buf.source, provisional: buf.provisional === true,
authority: (cfg && cfg.authority) || null, rule: (cfg && cfg.rule) || null };
var rec = kmmr.recommend({ leadTimes: leadTimes, lane: lane, daysUntilStockout: dus,
buffer: buf, requiredByDate: a.required_by_date, shipDate: shipDate });
var qty = weeklyAiPlanNum_(a.recommended_qty != null ? a.recommended_qty : a.planned_qty) || 0;
var t = {
sku: weeklyAiPlanStr_(a.sku), site_sku: weeklyAiPlanStr_(a.site_sku),
window_code: weeklyAiPlanStr_(a.window_code), required_by_date: weeklyAiPlanStr_(a.required_by_date),
source_warehouse_id: srcId, destination: dest,
lane: rec.lane, days_until_stockout: rec.days_until_stockout,
quantity: qty,
method_status: rec.status, review_reason: rec.review_reason,

recommended_method: rec.recommended ? {
shipping_method: rec.recommended.shipping_method,
last_mile_delivery: rec.recommended.last_mile_delivery,
conservative_transit_days: rec.recommended.conservative_transit_days,
arrival_headroom_days: rec.recommended.arrival_headroom_days,
risk: rec.recommended.risk, quantity: qty, counted_in_shipment_total: true,
carrier_ids: rec.recommended.carrier_ids, carrier_selection: rec.recommended.carrier_selection,
estimated_cost: rec.recommended.estimated_cost, cost_basis: rec.recommended.cost_basis
} : null,

alternative_scenarios: (rec.alternatives || []).map(function (o) {
return { shipping_method: o.shipping_method, last_mile_delivery: o.last_mile_delivery,
conservative_transit_days: o.conservative_transit_days,
arrival_headroom_days: o.arrival_headroom_days, risk: o.risk,
quantity_if_chosen: qty, counted_in_shipment_total: false,
carrier_ids: o.carrier_ids, carrier_selection: o.carrier_selection,
estimated_cost: o.estimated_cost, cost_basis: o.cost_basis };
})
};
out.alternative_scenario_count += t.alternative_scenarios.length;
if (t.recommended_method) { out.counted_quantity += qty; out.tranches_with_method++; }
else {
out.tranches_needing_review++;
var rr = weeklyAiPlanStr_(rec.review_reason);
if (rr && !seenReason[rr]) { seenReason[rr] = 1; out.review_reasons.push(rr); }
}
out.tranches.push(t);
});

out.status = (out.tranches.length && out.tranches_needing_review === 0) ? 'AUTO_RECOMMENDED'
: (out.tranches_with_method > 0 ? 'PARTIAL_MANUAL_REVIEW_REQUIRED' : 'MANUAL_REVIEW_REQUIRED');
return out;
}


































function weeklyAiPlanAdviceSources_(allocatedLines, harvest) {
var whById = (harvest && harvest.warehousesById) || {};
var byWh = {}, order = [], factoryQty = 0, nonFactoryQty = 0;
(allocatedLines || []).forEach(function (a) {
var id = weeklyAiPlanStr_(a.source_warehouse_id);
var qty = weeklyAiPlanNum_(a.recommended_qty != null ? a.recommended_qty : a.planned_qty) || 0;
if (!byWh[id]) {
var w = whById[id] || null;
byWh[id] = { warehouse_id: id,
warehouse_code: weeklyAiPlanStr_(w && (w.warehouse_code || w.code)) || null,
warehouse_type: weeklyAiPlanStr_(w && w.warehouse_type) || null,
country: weeklyAiPlanStr_(w && w.country) || null,
is_factory: !!(w && (w.is_factory_warehouse === true
|| String(w.is_factory_warehouse).trim().toLowerCase() === 'true')),
quantity: 0 };
order.push(id);
}
byWh[id].quantity += qty;
});
var list = order.map(function (id) { return byWh[id]; });
list.forEach(function (r) { if (r.is_factory) factoryQty += r.quantity; else nonFactoryQty += r.quantity; });
return { by_warehouse: list, factory_quantity: factoryQty, non_factory_quantity: nonFactoryQty,
factory_quantity_is_measured_not_omitted: true };
}


















function weeklyAiPlanActivationManifest_() {
return {
contract: 'F1-7N-FC-1B-E3-R4-A2-R1-R6 §8 — the exact mutation surface of one controlled AI Plan activation',
flag: { name: 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_',
value: (typeof inventoryAiPlanDbGenerationEnabled_ === 'function') ? inventoryAiPlanDbGenerationEnabled_() : null,
scope_allowlist: (typeof INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ !== 'undefined')
? INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ : null },
tables_read: ['inventory_replenishment_gap', 'warehouses', 'sku_details', 'marketplace_skus', 'marketplaces',
'overseas_inventory_snapshot', 'factory_stock', 'fc_regular_forecast', 'carrier_rate_cards',
'carrier_lead_times', 'shipping_allocation_drafts', 'shipping_allocation_draft_lines'],
tables_written: ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'],
write_handler: 'handleUpsertShippingAllocationDraftAtomic_ (16_shipping_allocation_handlers.gs) — the ONLY '
+ 'path to a write; one lock, one header + its lines, all or nothing',
expected_rows_inserted: 'one shipping_allocation_drafts header per K2 route group whose identity does not '
+ 'already exist, plus one shipping_allocation_draft_lines row per (sku, window) in that group',
expected_rows_updated: 'an existing header with the SAME deterministic execution key is UPDATED in place, '
+ 'never duplicated; superseded AI headers of the same scope are marked expired AFTER this run verifies',
tables_guaranteed_zero_mutation: ['shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines',
'factory_stock_movements', 'reservations', 'purchase_orders', 'purchase_order_lines',
'carrier_rate_cards', 'carrier_lead_times', 'inventory_replenishment_gap', 'warehouses', 'sku_details'],
reservation_expected: false,
reservation_note: 'An AI Plan draft reserves NOTHING. Reservation belongs to the canonical shipment '
+ 'lifecycle downstream of Submit, and no code path here reaches it.',
submit_expected: false,
submit_note: 'Generation writes a DRAFT. Submit is a separate operator action with its own gate, and that '
+ 'gate is unchanged by this round.',
replay_behavior: 'IDEMPOTENT BY IDENTITY. A repeated generation for the same scope resolves the same '
+ 'deterministic execution key and REUSEs or UPDATEs the same header. A replay must not change '
+ 'created_headers, and must not raise the row count in either written table.',
readback_procedure: 'After the run, read shipping_allocation_drafts and shipping_allocation_draft_lines '
+ 'filtered to the scope and generation_run_id, and compare header count, line count and unit total '
+ 'against created_headers / created_lines / the advice quantities in this same response.',
rollback_procedure: 'Non-destructive. The written headers are DRAFTS and carry their generation_run_id: '
+ 'mark them expired through the same lifecycle that supersedes them (aiplExpireSupersededDrafts_). '
+ 'No row in any other table was changed, so nothing else needs undoing. Never delete rows by hand.',
comparison_points: ['before', 'generate', 'readback', 'replay', 'after']
};
}

function weeklyAiPlanAdviceStatus_(input) {
input = input || {};
var sharedBlockers = (input.shared_blockers || []).slice();
var completeness = input.completeness || null;
var advice = input.method_advice || null;
var out = {
contract: 'F1-7N-FC-1B-E3-R4-A2-R1-R5 §1 — AI Plan / Weekly Shipping Plan / Submit are three layers with '
+ 'three verdicts; a Carrier gap is a WARNING at layer 1 and a refusal only at layer 3',
shared_blockers: sharedBlockers,
carrier_coverage_is_not_a_shared_blocker: true,



shared_blocker_classes: ['DEPLOYMENT_OR_RUNTIME_AUTHORITY_MISMATCH', 'SNAPSHOT_UNAVAILABLE',
'FORECAST_NORMALIZATION_FAILURE', 'SCOPE_MAPPING_FAILURE', 'QUANTITY_CONSERVATION_FAILURE',
'SCHEMA_INCOMPATIBLE', 'CORRUPTED_DETERMINISTIC_IDENTITY'],


never_a_shared_blocker: ['NO_TRANSIT_AUTHORITY_FOR_LANE', 'NO_CARRIER_CARD_FOR_LANE',
'CARRIER_PRICING_DEFERRED', 'ROUTE_METHOD_MANUAL_REVIEW_REQUIRED', 'MANUAL_ROUTE_SELECTION_REQUIRED',
'MANUAL_CARRIER_SELECTION_REQUIRED', 'EXECUTION_ROUTE_NOT_MATERIALIZED', 'USER_MASTER_DATA_REQUIRED'],
supply_allocation_ready: !!(completeness && completeness.supply_allocation_conserved === true),
authorized_quantity: completeness ? completeness.authorized_quantity : null,
supply_allocated_quantity: completeness ? completeness.supply_allocated_quantity : null,
unresolved_supply_quantity: 0,


automatic_route_quantity: null,
manual_route_review_quantity: null,
unresolved_route_quantity: null,
execution_route_materialized_quantity: null,
route_materialization_complete: false,
recommendation_ready: false,
method_status: advice ? advice.status : 'MANUAL_REVIEW_REQUIRED',
method_review_reasons: advice ? (advice.review_reasons || []) : [],
carrier_pricing_ready: input.carrier_pricing_ready === true,
execution_route_materialized: false,
execution_route_blockers: [],
submit_ready: false,


recommendation_warnings: [],
recommendation_warning_codes: [],
route_materialization_warnings: [],
warnings: [],
verdict: 'STOP'
};

var auth = Number(out.authorized_quantity);
var alloc = Number(out.supply_allocated_quantity);
out.unresolved_supply_quantity = (isFinite(auth) && isFinite(alloc)) ? (auth - alloc) : null;


function q(name) {
if (!completeness) return null;
var v = Number(completeness[name]);
return isFinite(v) ? v : null;
}
out.automatic_route_quantity = q('automatic_route_quantity');
out.manual_route_review_quantity = q('manual_route_review_quantity');
out.unresolved_route_quantity = q('unresolved_route_quantity');
out.execution_route_materialized_quantity = q('execution_route_materialized_quantity');
out.route_materialization_complete = !!(completeness && completeness.route_materialization_complete === true);








out.recommendation_ready = sharedBlockers.length === 0
&& out.supply_allocation_ready === true
&& isFinite(auth) && auth > 0;

if (!advice || advice.authority === 'KMMR_UNAVAILABLE' || advice.authority === 'METHOD_ADVICE_AUTHORITY_UNAVAILABLE') {
out.method_status = 'MANUAL_REVIEW_REQUIRED';
out.method_review_reasons = ['METHOD_ADVICE_AUTHORITY_UNAVAILABLE'];
}


var routeCount = completeness ? Number(completeness.route_count) : 0;
out.execution_route_materialized = out.recommendation_ready && isFinite(routeCount) && routeCount > 0
&& completeness.fully_routable === true;
if (!out.execution_route_materialized && completeness) {
out.execution_route_blockers = (completeness.blocker_tokens || []).slice();
}

out.submit_ready = out.execution_route_materialized === true && out.carrier_pricing_ready === true;

















function warn(code, owner, detail) {
out.recommendation_warnings.push({ code: code, owner: owner, detail: detail });
if (out.recommendation_warning_codes.indexOf(code) === -1) out.recommendation_warning_codes.push(code);


out.warnings.push(code + ': ' + detail);
}




(out.execution_route_blockers || []).forEach(function (tok) {
if (tok === 'NO_TRANSIT_AUTHORITY_FOR_LANE') {
warn('NO_TRANSIT_AUTHORITY_FOR_LANE', 'CARRIER_MASTER_DATA',
'no carrier_lead_times row covers this lane, so no transit time exists to judge a method against. '
+ 'The quantity and source advice stand. That table has no generic write handler: the row is entered '
+ 'directly in the tab.');
} else if (tok === 'NO_CARRIER_CARD_FOR_LANE') {
warn('NO_CARRIER_CARD_FOR_LANE', 'WEEKLY_SHIPPING_PLAN',
'no carrier_rate_cards row covers this lane. Carrier comparison is unavailable; the method and the '
+ 'quantity advice do not depend on it.');
}
});
if (advice && advice.status !== 'AUTO_RECOMMENDED') {
warn('ROUTE_METHOD_MANUAL_REVIEW_REQUIRED', 'OPERATOR',
'the AI did not select a shipping method on its own evidence (' + advice.status
+ (advice.review_reasons.length ? '; ' + advice.review_reasons.join(',') : '')
+ '). A person chooses the method; nothing about the quantity or the source is in question.');
warn('MANUAL_ROUTE_SELECTION_REQUIRED', 'OPERATOR',
'the execution route for this scope is completed by hand once a method is chosen.');
}
if (!out.carrier_pricing_ready) {



warn('CARRIER_PRICING_DEFERRED', 'WEEKLY_SHIPPING_PLAN',
'no usable carrier_rate_cards row covers this lane, so no price is claimed and no carrier is named. '
+ 'Carrier choice belongs to the Weekly Shipping Plan and does NOT block the AI Plan recommendation.');
warn('MANUAL_CARRIER_SELECTION_REQUIRED', 'WEEKLY_SHIPPING_PLAN',
'a person selects the carrier for this lane until a rate card covers it.');
}
if (!out.execution_route_materialized) {
warn('EXECUTION_ROUTE_NOT_MATERIALIZED', 'OPERATOR',
(out.execution_route_blockers.join(',') || 'route identity incomplete')
+ '. Quantity and source advice stand; no partial execution route is written, and the Execution Plan '
+ 'already on screen is not changed.');
}
if (advice && advice.buffer && advice.buffer.provisional === true) {


warn('TRANSIT_BUFFER_PROVISIONAL', 'BUSINESS',
'safety used a provisional ' + advice.buffer.days + '-day operational buffer. R6 §1 confirmed 7 calendar '
+ 'days as the Phase 1 default; a provisional buffer here means the deployed config is behind.');
}


out.route_materialization_warnings = (out.execution_route_blockers || []).slice();
out.verdict = sharedBlockers.length ? 'STOP'
: (out.recommendation_ready
? (out.recommendation_warnings.length ? 'RECOMMENDATION_READY_WITH_WARNINGS' : 'RECOMMENDATION_READY')
: 'STOP');
return out;
}

function weeklyAiPlanShipDate_(harvest) {
var v = harvest && harvest.sourceDataAsOf ? String(harvest.sourceDataAsOf) : '';
var m = v.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : '';
}












function weeklyAiPlanWhActive_(w) {
if (!w) return false;
var a = String(w.is_active == null ? '' : w.is_active).trim().toLowerCase();
return !(a === 'false' || a === 'no' || a === '0' || w.is_active === false);
}
function weeklyAiPlanClassifyDestination_(l, whById) {
function s(v) { return String(v == null ? '' : v).trim(); }
var ref = s(l.destinationWarehouseId), mkt = s(l.marketplace), country = s(l.country);
if (ref) {
var w = whById[ref];
if (w && weeklyAiPlanWhActive_(w)) return { kind: 'WAREHOUSE', warehouse_id: ref, country: country || s(w.country), matched_by: 'active_warehouse_id' };
}
if (mkt) return { kind: 'MARKETPLACE', marketplace: mkt, marketplace_ref: ref, country: country, matched_by: 'marketplace_token' };
return { kind: '', reason: 'DESTINATION_UNRESOLVED' };
}






















function weeklyAiPlanWarehouseRole_(id, whById, factoryIdentity) {
var wid = weeklyAiPlanStr_(id);
if (!wid) return { role: '', reason: 'WAREHOUSE_ID_MISSING' };
var w = (whById || {})[wid];
if (!w) return { role: '', reason: 'WAREHOUSE_NOT_IN_MASTER' };
if (!weeklyAiPlanWhActive_(w)) return { role: '', reason: 'WAREHOUSE_INACTIVE' };


var declared = false;
for (var k in (factoryIdentity || {})) {
if (Object.prototype.hasOwnProperty.call(factoryIdentity, k) && weeklyAiPlanStr_(factoryIdentity[k]) === wid) { declared = true; break; }
}
var flagged = String(w.is_factory_warehouse) === 'true' || w.is_factory_warehouse === true
|| weeklyAiPlanStr_(w.warehouse_type).toUpperCase() === 'FACTORY';
if (declared && !flagged) return { role: 'FACTORY', reason: 'FACTORY_IDENTITY_MASTER_DISAGREEMENT', warehouse: w };
if (declared) return { role: 'FACTORY', reason: null, warehouse: w };
if (flagged) return { role: 'FACTORY_UNDECLARED', reason: 'FACTORY_NOT_IN_IDENTITY_CONFIG', warehouse: w };
return { role: 'NON_FACTORY', reason: null, warehouse: w };
}
























function weeklyAiPlanSplitBySource_(l, qty, upc) {
var bd = Array.isArray(l.allocationBreakdown) ? l.allocationBreakdown : [];
var agg = {}, order = [];
for (var i = 0; i < bd.length; i++) {
var b = bd[i] || {};
var id = weeklyAiPlanStr_(b.sourceWarehouseId);
if (!id) continue;
var q = Number(b.allocatedQty);
if (!isFinite(q) || q <= 0) continue;
if (agg[id] === undefined) { agg[id] = 0; order.push(id); }
agg[id] += q;
}
if (!order.length) return { ok: false, reason: 'NO_CONCRETE_SOURCE_IN_BREAKDOWN', parts: [] };
var u = Number(upc);
if (!isFinite(u) || u <= 0) return { ok: false, reason: 'UNITS_PER_CARTON_UNRESOLVED', parts: [] };
var cartonsTotal = Math.floor(Number(qty) / u);
if (!isFinite(cartonsTotal) || cartonsTotal <= 0) return { ok: false, reason: 'NO_WHOLE_CARTON_TO_SHIP', parts: [] };
var parts = [], assigned = 0;
order.forEach(function (id) {
var c = Math.floor(agg[id] / u);
if (c > cartonsTotal - assigned) c = cartonsTotal - assigned;
parts.push({ warehouse_id: id, allocated_qty: agg[id], cartons: c });
assigned += c;
});
var guard = 0;
while (assigned < cartonsTotal && guard < 1000) {
var progressed = false;
for (var pi = 0; pi < parts.length && assigned < cartonsTotal; pi++) {
if (parts[pi].allocated_qty - parts[pi].cartons * u > 0) { parts[pi].cartons++; assigned++; progressed = true; }
}
if (!progressed) break;
guard++;
}
if (assigned !== cartonsTotal) return { ok: false, reason: 'SOURCE_SPLIT_NOT_CONSERVING', parts: [] };
return { ok: true, reason: null, units_per_carton: u, cartons_total: cartonsTotal,
parts: parts.filter(function (p) { return p.cartons > 0; }).map(function (p) {
return { warehouse_id: p.warehouse_id, qty: p.cartons * u, cartons: p.cartons, allocated_qty: p.allocated_qty }; }) };
}












function weeklyAiPlanCarrierFunnel_(rateCards, laneQuery, asOfOrdinal) {
var out = { lane_query: { origin_country: weeklyAiPlanStr_(laneQuery && laneQuery.originCountry),
destination_country: weeklyAiPlanStr_(laneQuery && laneQuery.destinationCountry),
marketplace: weeklyAiPlanStr_(laneQuery && laneQuery.marketplace) },
as_of_ordinal: (asOfOrdinal === undefined ? null : asOfOrdinal),
total: 0, source_matched: 0, destination_matched: 0, marketplace_matched: 0,
route_matched: 0, status_and_effective_matched: 0, method_present: 0,
canonical_method_matched: 0, method_unmapped: 0, final_eligible: 0,
distinct_methods: [], unmapped_method_sample: [], nearest_candidates: [], authority: null };
var kmra = (typeof KMRA !== 'undefined' && KMRA) ? KMRA : null;
if (!kmra || typeof kmra.normalizeRateCard !== 'function' || typeof kmra.axisOk !== 'function') {
out.authority = 'KMRA_UNAVAILABLE';
return out;
}
out.authority = 'KMRA';
var q = out.lane_query, methods = {}, near = [];
(rateCards || []).forEach(function (raw) {
out.total++;
var dto = kmra.normalizeRateCard(raw);
var okO = kmra.axisOk(dto.originCountry, q.origin_country);
var okD = kmra.axisOk(dto.destinationCountry, q.destination_country);
var okM = kmra.axisOk(dto.marketplace, q.marketplace);
if (okO) out.source_matched++;
if (okD) out.destination_matched++;
if (okM) out.marketplace_matched++;
if (!(okO && okD && okM)) {

if (near.length < 10 && ((okO && okD) || (okO && okM) || (okD && okM))) {
near.push({ rate_card_id: dto.rateCardId, origin_country: dto.originCountry,
destination_country: dto.destinationCountry, marketplace: dto.marketplace,
shipping_method: dto.shippingMethod, status: dto.status,
effective_from: dto.effectiveFrom, effective_to: dto.effectiveTo,
failed_axis: !okO ? 'origin_country' : (!okD ? 'destination_country' : 'marketplace') });
}
return;
}
out.route_matched++;
if (!kmra.rateCardUsable(dto, out.as_of_ordinal)) {
if (near.length < 10) near.push({ rate_card_id: dto.rateCardId, origin_country: dto.originCountry,
destination_country: dto.destinationCountry, marketplace: dto.marketplace,
shipping_method: dto.shippingMethod, status: dto.status,
effective_from: dto.effectiveFrom, effective_to: dto.effectiveTo,
failed_axis: 'status_or_effective_window' });
return;
}
out.status_and_effective_matched++;
if (!dto.shippingMethod) return;
out.method_present++;





if (!dto.methodKey) {
out.method_unmapped++;
if (out.unmapped_method_sample.length < 10) {
out.unmapped_method_sample.push({ rate_card_id: dto.rateCardId, shipping_method: dto.shippingMethod });
}
} else {
out.canonical_method_matched++;
methods[dto.shippingMethod] = 1;
}
out.final_eligible++;
});
out.distinct_methods = Object.keys(methods).sort();
out.nearest_candidates = near;

out.missing_canonical_key = out.final_eligible ? null
: { origin_country: q.origin_country, destination_country: q.destination_country,
marketplace: q.marketplace, needs: 'an ACTIVE carrier_rate_cards row on this lane, effective on the ship date, carrying a canonical shipping_method',
cause: !out.route_matched ? 'NO_CARRIER_CARD_FOR_LANE'
: (!out.status_and_effective_matched ? 'CARD_INACTIVE_OR_OUTSIDE_EFFECTIVE_DATE' : 'NO_CANONICAL_METHOD') };

out.unmapped_method_only = (out.final_eligible > 0 && out.canonical_method_matched === 0) ? {
origin_country: q.origin_country, destination_country: q.destination_country, marketplace: q.marketplace,
cause: 'METHOD_TOKEN_NOT_CANONICAL', sample: out.unmapped_method_sample.slice(0, 5),
needs: 'a shipping_method the route authority maps (Air / Sea Express / Sea / Courier / Truck), or an alias rule for this token'
} : null;
return out;
}

function weeklyAiPlanK2AllocatedLines_(lines, harvest) {
var horizons = (harvest && harvest.horizonsByDemandRef) || {};
var whById = (harvest && harvest.warehousesById) || {};
var factoryIdentity = (typeof WEEKLY_AI_PLAN_FACTORY_IDENTITY_ !== 'undefined') ? WEEKLY_AI_PLAN_FACTORY_IDENTITY_ : {};
function s(v) { return String(v == null ? '' : v).trim(); }
var out = [];
var diag = { input_lines: 0, emitted_lines: 0, horizon_join_hits: 0, horizon_join_misses: 0,
horizon_miss_sample: [], window_blank: 0, split_lines: 0, split_parts: 0, split_refused: [],
source_roles: {}, destination_roles: {} };
(lines || []).forEach(function (l) {
if (!l || s(l.blockedReason)) return;
diag.input_lines++;
var qty = (typeof l.recommendedQty === 'number') ? l.recommendedQty : Number(l.recommendedQty);
if (!isFinite(qty) || qty <= 0) return;
























var windowCode = s(l.windowCode);
var ref = [s(l.company), s(l.country), s(l.marketplace), s(l.masterSku), s(l.destinationWarehouseId)].join('|');
var hz = horizons[ref] || null;
if (hz) diag.horizon_join_hits++;
else {
diag.horizon_join_misses++;
if (diag.horizon_miss_sample.length < 5) diag.horizon_miss_sample.push({ demand_ref: ref, sku: s(l.masterSku) });
}
var requiredBy = '';
if (hz && hz.requiredByByWindow && windowCode && hz.requiredByByWindow[windowCode] != null) {
requiredBy = String(hz.requiredByByWindow[windowCode]);
}
if (!windowCode) diag.window_blank++;

var destination = weeklyAiPlanClassifyDestination_(l, whById);


if (destination.kind === 'WAREHOUSE') {
var dRole = weeklyAiPlanWarehouseRole_(destination.warehouse_id, whById, factoryIdentity);
diag.destination_roles[dRole.role || '(unresolved)'] = (diag.destination_roles[dRole.role || '(unresolved)'] || 0) + 1;
if (dRole.role === 'FACTORY') {
destination = { kind: '', reason: 'DESTINATION_IS_A_FACTORY_WAREHOUSE' };
}
} else {
diag.destination_roles[destination.kind || '(unresolved)'] = (diag.destination_roles[destination.kind || '(unresolved)'] || 0) + 1;
}



var srcId = s(l.sourceWarehouseId);
var parts;
if (srcId) {
parts = [{ warehouse_id: srcId, qty: qty, cartons: null, allocated_qty: qty }];
} else {
var sp = weeklyAiPlanSplitBySource_(l, qty, l.unitsPerCarton);
if (sp.ok) { parts = sp.parts; diag.split_lines++; diag.split_parts += sp.parts.length; }
else {


diag.split_refused.push({ sku: s(l.masterSku), window_code: windowCode, reason: sp.reason });
out.push({
sku: s(l.masterSku), site_sku: s(l.siteSku || l.site_sku), window_code: windowCode,
window_start_date: '', window_end_date: '', required_by_date: requiredBy,
source_warehouse_id: '', source_warehouse_code_snapshot: '',
source_multi_pool: true, source_split_refused_reason: sp.reason,
planned_qty: qty, recommended_qty: qty, units_per_carton: (l.unitsPerCarton != null ? l.unitsPerCarton : ''),
marketplace: s(l.marketplace), destination: destination
});
diag.emitted_lines++;
return;
}
}
parts.forEach(function (p) {
var srcWh = whById[p.warehouse_id] || {};
var role = weeklyAiPlanWarehouseRole_(p.warehouse_id, whById, factoryIdentity);
diag.source_roles[role.role || '(unresolved)'] = (diag.source_roles[role.role || '(unresolved)'] || 0) + 1;
out.push({
sku: s(l.masterSku), site_sku: s(l.siteSku || l.site_sku), window_code: windowCode,
window_start_date: '', window_end_date: '', required_by_date: requiredBy,
source_warehouse_id: p.warehouse_id, source_warehouse_code_snapshot: s(srcWh.warehouse_code),
source_multi_pool: false,
source_role: role.role, source_role_reason: role.reason || null,
source_allocated_qty: p.allocated_qty, source_cartons: p.cartons,
planned_qty: p.qty, recommended_qty: p.qty, units_per_carton: (l.unitsPerCarton != null ? l.unitsPerCarton : ''),
marketplace: s(l.marketplace), destination: destination
});
diag.emitted_lines++;
});
});


out.diagnostics = diag;
return out;
}
function weeklyAiPlanParseResp_(resp) { try { return JSON.parse(resp && resp.getContent ? resp.getContent() : (typeof resp === 'string' ? resp : '{}')); } catch (e) { return { success: false, parse_error: true }; } }














function weeklyAiPlanResolveGapRunLineage_(planningCycle, harvest, request) {
var raw = null;
try { raw = PropertiesService.getScriptProperties().getProperty('GAP_JOB_INVENTORY'); } catch (e0) { raw = null; }
if (!raw) return { ok: false, reason: 'LINEAGE_GAP_RUN_UNRESOLVED' };
var st = null; try { st = JSON.parse(raw); } catch (ep) { st = null; }
if (!st) return { ok: false, reason: 'LINEAGE_GAP_RUN_UNPARSEABLE' };
if (String(st.product || '').toUpperCase() !== 'INVENTORY') return { ok: false, reason: 'LINEAGE_RUN_NOT_INVENTORY' };
var runId = String(st.runId || '').trim();
if (!/^GAP-INV-/.test(runId)) return { ok: false, reason: 'LINEAGE_RUN_ID_PREFIX_INVALID' };
if (String(st.status || '').toUpperCase() !== 'DONE') return { ok: false, reason: 'LINEAGE_GAP_RUN_NOT_DONE' };
var cyc = String(planningCycle || '').trim();
if (cyc && String(st.planningCycle || '').trim() !== cyc) return { ok: false, reason: 'LINEAGE_RUN_CYCLE_MISMATCH' };
var sourceDataAsOf = String(st.calculationDate || '').trim();
if (!sourceDataAsOf) return { ok: false, reason: 'LINEAGE_SOURCE_DATA_AS_OF_UNAVAILABLE' };
return {
ok: true, run_id: runId,
calculation_run_id: runId,
calculated_at: String(st.finishedAt || '').trim(),
source_data_as_of: sourceDataAsOf,
formula_version: String((request && request.formulaVersion) || 'WEEKLY_AI_PLAN_V1').trim(),
planning_cycle: String(st.planningCycle || '').trim()
};
}







function weeklyAiPlanK2NoAction_(harvest) {
var d = harvest && harvest.noActionDecision;
if (!d) return { noAction: false, reason: 'NO_ACTION_AUTHORITY_UNAVAILABLE', recommendation_state: null,
recommended_qty: null, qualifying_planned_qty: null, residual_qty: null, per_scope: [] };
return d;
}

function weeklyAiPlanGenerateK2_(ss, request, harvest, deps, body, controlledAuth) {
var src = KMWRB.buildWeeklySourceLines(request);
if (!src.ok) return weeklyAiPlanDiagResponse_(harvest, { success: false, errors: [weeklyAiPlanErr_(src.status || 'BLOCKED_INPUT', src.reason || 'source lines blocked')] });
var carriers = weeklyAiPlanReadCarrierAuthorities_(ss);
var shipDate = weeklyAiPlanShipDate_(harvest);
var scope0 = request.businessScope || {};
var allocated = weeklyAiPlanK2AllocatedLines_(src.lines, harvest);

var byMkt = {};
allocated.forEach(function (a) { var m = String(a.marketplace || '').trim(); (byMkt[m] = byMkt[m] || []).push(a); });




var requestedMkt = String(scope0.marketplace != null ? scope0.marketplace : '').trim();



if (!allocated.length) {
var _naAll = weeklyAiPlanK2NoAction_(harvest);
if (_naAll.noAction) {
return weeklyAiPlanDiagResponse_(harvest, weeklyAiPlanNoActionResponse_(_naAll, {
planning_cycle: request.planningCycle, scope: scope0, mode: request.mode || null,
site_count: harvest.site_count == null ? null : harvest.site_count,
source_data_as_of: weeklyAiPlanStr_(harvest.sourceDataAsOf) || null,
recommendation_authority: harvest.recommendationState || null }));
}
}
if (requestedMkt) {
if (/^all(_sites)?$/i.test(requestedMkt)) return weeklyAiPlanDiagResponse_(harvest, { success: false, errors: [weeklyAiPlanErr_('SCOPE_ALL_SITES_FORBIDDEN', 'a controlled run must target exactly one marketplace, never ALL_SITES')] });
if (!byMkt[requestedMkt]) {







var _na = weeklyAiPlanK2NoAction_(harvest);
if (_na.noAction) {
return weeklyAiPlanDiagResponse_(harvest, weeklyAiPlanNoActionResponse_(_na, {
planning_cycle: request.planningCycle, scope: scope0, mode: request.mode || null,
site_count: harvest.site_count == null ? null : harvest.site_count,
source_data_as_of: weeklyAiPlanStr_(harvest.sourceDataAsOf) || null,
recommendation_authority: harvest.recommendationState || null }));
}






return weeklyAiPlanDiagResponse_(harvest, weeklyAiPlanScopeEmptyRefusal_(_na, {
requested_marketplace: requestedMkt,
recommendation_authority: harvest.recommendationState || null }));
}
var only = {}; only[requestedMkt] = byMkt[requestedMkt]; byMkt = only;
}




var flagTrue = (typeof inventoryAiPlanDbGenerationEnabled_ === 'function') && inventoryAiPlanDbGenerationEnabled_() === true;















if (flagTrue) {
var _gateOn = (typeof inventoryAiPlanScopeEnabled_ === 'function');
if (!_gateOn) {
return weeklyAiPlanDiagResponse_(harvest, { success: false, errors: [weeklyAiPlanErr_('AI_PLAN_SCOPE_GUARD_UNAVAILABLE',
'the activation allowlist is not present in this deployment; generation is refused rather than run unguarded')] });
}
var _kept = {}, _keptCount = 0, _excluded = [];
for (var _mk in byMkt) {
if (!Object.prototype.hasOwnProperty.call(byMkt, _mk)) continue;
var _in = byMkt[_mk].filter(function (a) {
var okScope = inventoryAiPlanScopeEnabled_(scope0.company, scope0.country, _mk, a && a.sku);
if (!okScope) _excluded.push({ marketplace: _mk, sku: weeklyAiPlanStr_(a && a.sku) });
return okScope;
});
if (_in.length) { _kept[_mk] = _in; _keptCount += _in.length; }
}
if (!_keptCount) {
return weeklyAiPlanDiagResponse_(harvest, { success: false, errors: [weeklyAiPlanErr_('AI_PLAN_SCOPE_NOT_ENABLED',
'no line in this run is inside the controlled activation allowlist; zero rows written',
{ scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt || null },
excluded_count: _excluded.length, excluded_sample: _excluded.slice(0, 10),
allowlist: (typeof inventoryAiPlanActivationAllowlist_ === 'function') ? inventoryAiPlanActivationAllowlist_() : null,
db_writes: 0 })] });
}
byMkt = _kept;

harvest = harvest || {};
harvest.scope_guard = { enforced: true, kept_lines: _keptCount, excluded_lines: _excluded.length,
excluded_sample: _excluded.slice(0, 10) };
}
if (!flagTrue) {
var liveScopeSpec = { scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt }, planning_cycle: request.planningCycle };
var authRes = (typeof WeeklyAiPlanControlledAuthority_ !== 'undefined') ? WeeklyAiPlanControlledAuthority_.verify(controlledAuth, liveScopeSpec) : { ok: false, reason: 'AUTHORITY_MODULE_MISSING' };
if (!authRes.ok) return weeklyAiPlanDiagResponse_(harvest, { success: false, disabled: true, errors: [weeklyAiPlanErr_('CONTROLLED_GENERATION_UNAUTHORIZED', 'global flag is false and no valid INTERNAL controlled authority for this exact scope (' + authRes.reason + '); zero rows written', { auth_reason: authRes.reason })] });
}


var lineage = weeklyAiPlanResolveGapRunLineage_(request.planningCycle, harvest, request);
if (!lineage.ok) return weeklyAiPlanDiagResponse_(harvest, { success: false, errors: [weeklyAiPlanErr_(lineage.reason, 'K2 generation blocked: authoritative GAP-INV run lineage unavailable or mismatched (' + lineage.reason + '); zero rows written', { planning_cycle: request.planningCycle })] });





var _hAuth = (harvest && harvest.sourceDataAsOfAuthority) || null;
if (_hAuth && weeklyAiPlanStr_(_hAuth.run_id) && weeklyAiPlanStr_(_hAuth.run_id) !== weeklyAiPlanStr_(lineage.calculation_run_id)) {
return weeklyAiPlanDiagResponse_(harvest, { success: false, zero_write: true,
errors: [weeklyAiPlanErr_('GAP_RUN_LINEAGE_MOVED_MID_GENERATION',
'the GAP-INV run that dated this harvest is not the run the header would be stamped with; zero rows written',
{ harvest_run_id: _hAuth.run_id, writer_run_id: lineage.calculation_run_id,
harvest_source_data_as_of: _hAuth.date, writer_source_data_as_of: lineage.source_data_as_of, db_writes: 0 })] });
}

// D5-V3-R3 (P5): a run that writes must later expire the drafts it supersedes, and expiry advances the draft version
// through the shared 16_ helper (BV1). Without that helper nothing is written at all (never a run that cannot expire).
if (typeof aiplExpireSupersededDrafts_ === 'function' && typeof sadNextDraftVersion_ !== 'function') {
return weeklyAiPlanDiagResponse_(harvest, { success: false, zero_write: true,
errors: [weeklyAiPlanErr_('DRAFT_VERSION_HELPER_MISSING', 'the shared draft-version helper (16_ sadNextDraftVersion_) is not in this Apps Script project; zero rows written',
{ required_contract: 'sadNextDraftVersion_(currentDraftVersion) -> next positive integer version (> current)', db_writes: 0 })],
data: { job_status: 'BLOCKED_DRAFT_VERSION_HELPER_MISSING', created_headers: 0, created_lines: 0, expired_headers: 0, expired_lines: 0, groups: [] } });
}
var groupsWritten = [], blockedTotal = [], conservationAll = [], anyOk = false, anyFail = false;










var executionKey = weeklyAiPlanStr_(body && (body.execution_key || body.executionKey)) ||
('AIPLAN-' + sadFnv1a_([request.planningCycle, scope0.company, scope0.country, requestedMkt, lineage.calculation_run_id].join('|')).toUpperCase());
var generationRunId = 'AIRUN-' + sadFnv1a_(executionKey).toUpperCase();













var planned = [];
Object.keys(byMkt).sort().forEach(function (M) {
var plan = KMWRR.buildK2GenerationPlan({
scope: { planning_cycle: request.planningCycle, company: scope0.company, country: scope0.country, marketplace: M, source_page: scope0.source_page },
allocatedLines: byMkt[M], warehousesById: harvest.warehousesById,
rateCards: carriers.rateCards, leadTimes: carriers.leadTimes, shipDate: shipDate,
authorizedBySkuWindow: (function () { var a = {}; byMkt[M].forEach(function (x) { var k = String(x.sku).toLowerCase() + '|' + String(x.window_code).toLowerCase(); a[k] = (a[k] || 0) + (Number(x.planned_qty) || 0); }); return a; })(),
sourceCeilingById: {}
});



plan.blocked.forEach(function (b) {
blockedTotal.push({ marketplace: M, block: b.block,
reason: b.method_unresolved_reason || b.auto_ranking_insufficient_reason || null,
lane_query: b.lane_query || null,
quantity: (b.line && (b.line.planned_qty != null ? b.line.planned_qty : b.line.recommended_qty)) || 0 });
});




var _advice = (typeof weeklyAiPlanMethodAdvice_ === 'function')
? weeklyAiPlanMethodAdvice_(byMkt[M], harvest, carriers.leadTimes, shipDate) : null;
var _status = (typeof weeklyAiPlanAdviceStatus_ === 'function')
? weeklyAiPlanAdviceStatus_({ shared_blockers: [], completeness: plan.completeness || null,
method_advice: _advice,
carrier_pricing_ready: (function () {

if (typeof weeklyAiPlanCarrierReadiness_ !== 'function' || !KMWRR || typeof KMWRR.dateToOrdinal !== 'function') return false;
var asOf = KMWRR.dateToOrdinal(shipDate), any = false, seen = {};
(byMkt[M] || []).forEach(function (a) {
var w = (harvest.warehousesById || {})[weeklyAiPlanStr_(a.source_warehouse_id)] || null;
var d = a.destination || {};
var q = { originCountry: weeklyAiPlanStr_(w && w.country), destinationCountry: weeklyAiPlanStr_(d.country),
marketplace: weeklyAiPlanStr_(d.marketplace) };
var k = q.originCountry + '|' + q.destinationCountry + '|' + q.marketplace;
if (seen[k]) return; seen[k] = 1;
var r = weeklyAiPlanCarrierReadiness_(carriers.rateCards, carriers.leadTimes, q, asOf);
if (r.rate_card && r.rate_card.usable_on_lane > 0) any = true;
});
return any;
})() })
: null;
conservationAll.push({ marketplace: M, conserved: plan.conservation.conserved,
completeness: plan.completeness || null, method_advice: _advice, layered_status: _status });
plan.groups.forEach(function (g) {


g.header.calculation_run_id = lineage.calculation_run_id;
g.header.formula_version = lineage.formula_version;
g.header.calculated_at = lineage.calculated_at;
g.header.source_data_as_of = lineage.source_data_as_of;


g.header.generation_run_id = generationRunId;







g.header.generation_type = 'system_generated';
planned.push({
marketplace: M, groupNo: g.groupNo, header: g.header, lines: g.lines,
identity_key: (typeof sadK2GroupKey_ === 'function') ? sadK2GroupKey_(g.header) : '',
recommended_total: (g.lines || []).reduce(function (a, l) { return a + (Number(l.recommended_qty) || 0); }, 0)
});
});
});


var activeRows = [], activeHeaders = [];
try {
var _hs = ss.getSheetByName('shipping_allocation_drafts');
if (_hs) {
var _d = _hs.getDataRange().getValues();
if (_d && _d.length > 1) {
activeHeaders = _d[0].map(function (h) { return String(h == null ? '' : h).trim(); });
for (var _r = 1; _r < _d.length; _r++) {
var _o = { __row: _r + 1 };
for (var _c = 0; _c < activeHeaders.length; _c++) if (activeHeaders[_c]) _o[activeHeaders[_c]] = _d[_r][_c];
var _st = String(_o.status == null ? '' : _o.status).trim().toLowerCase();


var _term = (typeof SAD_TERMINAL_STATUSES_ !== 'undefined') ? SAD_TERMINAL_STATUSES_ : { submitted: 1, cancelled: 1, expired: 1 };
if (!_term[_st]) activeRows.push(_o);
}
}
}
} catch (eRead) { activeRows = []; }


var precedence = (typeof aiplManualPrecedence_ === 'function')
? aiplManualPrecedence_(activeRows, planned.map(function (pl) {
var held = null;
for (var i = 0; i < activeRows.length; i++) {
if ((typeof sadK2GroupKey_ === 'function' ? sadK2GroupKey_(activeRows[i]) : '') === pl.identity_key) { held = activeRows[i]; break; }
}
return { identity_key: pl.identity_key, recommendation: pl.recommended_total,
persisted_user_qty: held ? (held.__persisted_user_qty != null ? held.__persisted_user_qty : null) : null };
}), function (r) { return (typeof sadK2GroupKey_ === 'function') ? sadK2GroupKey_(r) : ''; })
: planned.map(function (pl) { return { identity_key: pl.identity_key, decision: 'PROCEED' }; });

var decisionByKey = {};
precedence.forEach(function (d) { decisionByKey[d.identity_key] = d; });
var collisions = precedence.filter(function (d) { return d.decision === 'ACTIVE_SOURCE_IDENTITY_COLLISION'; });
var suppressed = precedence.filter(function (d) { return d.decision === 'SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT'; });



if (typeof aiplActivationGate_ === 'function' && typeof aiplReadActivationFacts_ === 'function') {
var facts = aiplReadActivationFacts_(ss, { generation_run_id: generationRunId, identity_collisions: collisions });
var gate = aiplActivationGate_(facts);
if (!gate.ready) {
return weeklyAiPlanDiagResponse_(harvest, {
success: false, zero_write: true,
errors: [gate.error],
data: {
mode: 'K2_ROUTE_GROUP', job_status: 'BLOCKED_SCHEMA_NOT_READY',
planningCycle: request.planningCycle, businessScope: scope0,
generation_run_id: generationRunId, execution_key: executionKey,
created_headers: 0, updated_headers: 0, created_lines: 0, updated_lines: 0,
expired_headers: 0, expired_lines: 0, active_count: 0, expired_count: 0,
zero_result: false, groups: [], blocked: [],
lifecycle: { ran: false, reason: gate.error.code, expired_headers: 0, expired_lines: 0 },
schema_gate: gate.error
}
});
}
} else {


return weeklyAiPlanDiagResponse_(harvest, {
success: false, zero_write: true,
errors: [weeklyAiPlanErr_('AI_PLAN_LIFECYCLE_SCHEMA_NOT_READY',
'the AI Plan lifecycle module (69_api_v1_ai_plan_lifecycle.gs) is not present in this Apps Script project, so no run may write: it would create a new draft while leaving the previous one active.',
{ missing_table: [], missing_columns: [], invalid_status_authority: [],
expected_migration_version: 'FB4C-AI-LIFECYCLE-1', zero_write: true,
created_headers: 0, created_lines: 0, expired_headers: 0, expired_lines: 0,
next_action: 'Sync 69_api_v1_ai_plan_lifecycle.gs into the Apps Script project and publish a new deployment version.' })],
data: { job_status: 'BLOCKED_LIFECYCLE_MODULE_MISSING', created_headers: 0, created_lines: 0, expired_headers: 0, expired_lines: 0, groups: [] }
});
}































var fsgClaims = [], fsgClaimIndex = {}, fsgSkipped = [];
planned.forEach(function (pl) {
var d0 = decisionByKey[pl.identity_key] || { decision: 'PROCEED' };

if (d0.decision === 'SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT' || d0.decision === 'ACTIVE_SOURCE_IDENTITY_COLLISION') return;
(pl.lines || []).forEach(function (ln, li) {
var wh = weeklyAiPlanStr_(ln.source_warehouse_id) || weeklyAiPlanStr_(pl.header.recommended_source_warehouse_id);
var q = weeklyAiPlanQty_(ln.planned_qty);
if (q === null) q = weeklyAiPlanQty_(ln.recommended_qty);
if (q === null || q <= 0) return;











var whMeta = (harvest.warehousesById || {})[wh] || null;
var isFactoryWh = whMeta ? ((typeof gapTruthy_ === 'function') ? gapTruthy_(whMeta.is_factory_warehouse)
: /^(true|yes|1|y)$/i.test(weeklyAiPlanStr_(whMeta.is_factory_warehouse))) : false;
if (!isFactoryWh) {
fsgSkipped.push({ marketplace: pl.marketplace, sku: weeklyAiPlanStr_(ln.sku), warehouse_id: wh,
quantity: q,
reason: whMeta ? 'SOURCE_IS_NOT_A_FACTORY_WAREHOUSE' : (wh ? 'SOURCE_WAREHOUSE_UNKNOWN' : 'LINE_NAMES_NO_SOURCE_WAREHOUSE') });
return;
}
var canonC = (typeof gapCanonCountry_ === 'function') ? gapCanonCountry_(scope0.country) : scope0.country;
fsgClaims.push({ warehouse_id: wh, sku: weeklyAiPlanStr_(ln.sku), quantity: q,
receiver_key: weeklyAiPlanStr_(scope0.company) + '||' + weeklyAiPlanStr_(canonC) + '||' + weeklyAiPlanStr_(pl.marketplace),
company: scope0.company, country: scope0.country, marketplace: pl.marketplace,
identity_key: pl.identity_key,


submitted_index: fsgClaims.length });
fsgClaimIndex[fsgClaims.length - 1] = { pl: pl, line: ln, line_index: li };
});
});
var fsgReleaseSet = {}, fsgReleaseDetail = [];
if (typeof aiplExpirationCandidates_ === 'function') {


(requestedMkt ? [requestedMkt] : Object.keys(byMkt).sort()).forEach(function (M) {
var cand = aiplExpirationCandidates_(activeRows, {
company: scope0.company, country: scope0.country, marketplace: M,
planning_cycle: request.planningCycle,
source_page: (typeof WEEKLY_AI_PLAN_SOURCE_PAGE_ !== 'undefined') ? WEEKLY_AI_PLAN_SOURCE_PAGE_ : scope0.source_page,
generation_run_id: generationRunId, committed_ids: [] });
(cand.expire || []).forEach(function (e) {
if (fsgReleaseSet[e.allocation_draft_id]) return;
fsgReleaseSet[e.allocation_draft_id] = 1;
fsgReleaseDetail.push({ marketplace: M, allocation_draft_id: e.allocation_draft_id,
previous_status: e.previous_status, generation_run_id: e.generation_run_id });
});
});
}
var fsgVerdict = null;
if (fsgClaims.length) {
fsgVerdict = (typeof fsgEvaluateAiClaims_ === 'function' && typeof KMFSG !== 'undefined' && KMFSG)
? fsgEvaluateAiClaims_(ss, fsgClaims, { releaseSet: fsgReleaseSet })
: { ok: false, verdict: 'STOP', guard_unavailable: true, reason: 'FACTORY_STOCK_GUARD_SEAM_MISSING',
stops: [{ code: 'FACTORY_STOCK_GUARD_SEAM_MISSING' }] };


if (fsgVerdict.guard_unavailable || !fsgVerdict.ok) {
return weeklyAiPlanDiagResponse_(harvest, { success: false, zero_write: true,
errors: [weeklyAiPlanErr_(weeklyAiPlanStr_(fsgVerdict.reason) || 'FACTORY_STOCK_GUARD_UNAVAILABLE',
'the shared factory stock guard could not establish what is available, so no row may be written: an '
+ 'unguarded generation is exactly the over-commitment this gate exists to prevent',
{ db_writes: 0, guard: fsgVerdict })],
data: { job_status: 'BLOCKED_FACTORY_STOCK_GUARD_UNAVAILABLE', generation_run_id: generationRunId,
created_headers: 0, created_lines: 0, updated_headers: 0, updated_lines: 0,
expired_headers: 0, expired_lines: 0, reservations: 0, db_writes: 0, groups: [],
factory_stock_guard: fsgVerdict } });
}
if (fsgVerdict.verdict === KMFSG.VERDICT.STOP) {


return weeklyAiPlanDiagResponse_(harvest, { success: false, zero_write: true,
errors: [weeklyAiPlanErr_('FACTORY_STOCK_GUARD_STOP',
'this generation would commit more factory stock than the shared pool can supply, and the frozen '
+ 'allocation authority cannot decide how to divide the shortfall; zero rows written',
{ db_writes: 0, stops: fsgVerdict.stops })],
data: { job_status: 'BLOCKED_FACTORY_STOCK_INSUFFICIENT', generation_run_id: generationRunId,
created_headers: 0, created_lines: 0, updated_headers: 0, updated_lines: 0,
expired_headers: 0, expired_lines: 0, reservations: 0, db_writes: 0, groups: [],
factory_stock_guard: fsgVerdict,
factory_stock_release_set: fsgReleaseDetail } });
}
if (fsgVerdict.verdict === KMFSG.VERDICT.CLAMPED) {




fsgVerdict.claims.forEach(function (c) {
var ref = fsgClaimIndex[c.submitted_index]; if (!ref) return;
if (c.granted_qty === null || c.granted_qty === c.requested_qty) return;
ref.line.planned_qty = c.granted_qty;
ref.line.factory_stock_clamped_from = c.requested_qty;
});


var kept = [];
planned.forEach(function (pl) {
var live = (pl.lines || []).filter(function (ln) {
var q = weeklyAiPlanQty_(ln.planned_qty);
if (q === null) q = weeklyAiPlanQty_(ln.recommended_qty);
return q !== null && q > 0;
});
if (live.length) { pl.lines = live; kept.push(pl); return; }
groupsWritten.push({ marketplace: pl.marketplace, groupNo: pl.groupNo,
outcome: 'DROPPED_FACTORY_STOCK_EXHAUSTED', allocation_draft_id: null, draft_version: null,
line_count: 0, ok: true, suppressed: true, created: false, updated: false, blocks_run: false,
identity_key: pl.identity_key, error: null });
});
planned = kept;
}
}


planned.forEach(function (pl) {
var d = decisionByKey[pl.identity_key] || { decision: 'PROCEED' };


if (d.decision === 'SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT' || d.decision === 'ACTIVE_SOURCE_IDENTITY_COLLISION') {
groupsWritten.push({
marketplace: pl.marketplace, groupNo: pl.groupNo, outcome: d.decision,
allocation_draft_id: (d.manual_identity && d.manual_identity.allocation_draft_id) || null,
draft_version: null, line_count: 0, ok: true, suppressed: true,
created: false, updated: false, blocks_run: false,
identity_key: pl.identity_key, precedence: d, error: null
});
return;
}










var resp = weeklyAiPlanParseResp_(handleUpsertShippingAllocationDraftAtomic_({
header: pl.header, lines: pl.lines, enforce_k2_grouping: true,
intent: 'UPSERT_AI_GENERATED_K2_ROUTE', execution_key: executionKey }));
var dd = (resp && resp.data) ? resp.data : {};
var outcome = resp && resp.success ? (resp.reused ? 'REUSED' : (dd.outcome || 'CREATED')) : ((dd && dd.reason) ? dd.reason : (resp && /COMMITTED_UNVERIFIED/.test(resp.error || '') ? 'COMMITTED_UNVERIFIED' : (resp && /RECONCILIATION_REQUIRED/.test(resp.error || '') ? 'RECONCILIATION_REQUIRED' : 'BLOCKED')));
if (resp && resp.success) anyOk = true; else anyFail = true;
groupsWritten.push({ marketplace: pl.marketplace, groupNo: pl.groupNo, outcome: outcome, allocation_draft_id: dd.allocation_draft_id || null, draft_version: dd.draft_version || null, line_count: dd.line_count || 0, ok: !!(resp && resp.success), identity_key: pl.identity_key, error: (resp && !resp.success) ? resp.error : null });
});

var outcomeCounts = {};
groupsWritten.forEach(function (g) { outcomeCounts[g.outcome] = (outcomeCounts[g.outcome] || 0) + 1; });


var appliedMkts = {}; groupsWritten.forEach(function (g) { appliedMkts[String(g.marketplace || '')] = 1; }); blockedTotal.forEach(function (b) { appliedMkts[String(b.marketplace || '')] = 1; });
var appliedList = Object.keys(appliedMkts).filter(function (m) { return m !== ''; }).sort();
var scopeEqual = requestedMkt ? (appliedList.length <= 1 && (appliedList.length === 0 || appliedList[0] === requestedMkt)) : true;
if (requestedMkt && !scopeEqual) return weeklyAiPlanDiagResponse_(harvest, { success: false, errors: [weeklyAiPlanErr_('APPLIED_SCOPE_WIDENED', 'applied scope ' + JSON.stringify(appliedList) + ' != requested marketplace ' + requestedMkt + ' — refused (no out-of-scope rows)')] });




var writtenGroups = groupsWritten.filter(function (g) { return !g.suppressed; });
var jobStatus = writtenGroups.length === 0
? (blockedTotal.length ? 'ALL_BLOCKED' : (groupsWritten.length ? 'ALL_SUPPRESSED_BY_MANUAL' : 'NO_DEMAND'))
: (anyFail ? (anyOk ? 'PARTIAL' : 'FAILED') : 'COMPLETED');





var zeroResult = (jobStatus === 'NO_DEMAND');



var allSuppressed = (jobStatus === 'ALL_SUPPRESSED_BY_MANUAL');
var runSucceeded = zeroResult || allSuppressed || (anyOk && !anyFail);















var scopeWarnings = [], scopesWithWarnings = [], scopesReady = 0;
conservationAll.forEach(function (c) {
var ls = c.layered_status || null;
if (ls && ls.recommendation_ready === true) scopesReady++;
if (ls && ls.warnings && ls.warnings.length) {
scopesWithWarnings.push(c.marketplace);
ls.warnings.forEach(function (w) { scopeWarnings.push({ marketplace: c.marketplace, warning: w }); });
}
});

var batchStopReasons = [];
if (anyFail && !anyOk) batchStopReasons.push('EVERY_SCOPE_FAILED_TO_COMMIT');
conservationAll.forEach(function (c) {
if (c.conserved !== true) batchStopReasons.push('QUANTITY_CONSERVATION_FAILED:' + c.marketplace);
});
var batchVerdict = batchStopReasons.length ? 'STOP'
: (scopeWarnings.length ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS');
var batchReport = {
contract: 'F1-7N-FC-1B-E3-R4-A2-R1-R5 §9 — Carrier coverage may move a batch to SUCCESS_WITH_WARNINGS and '
+ 'may NEVER move it to STOP; one scope\'s gap never blocks another scope',
verdict: batchVerdict,
scope_count: conservationAll.length,
scopes_recommendation_ready: scopesReady,
scopes_with_warnings: scopesWithWarnings,
warnings: scopeWarnings,
stop_reasons: batchStopReasons,
may_stop_a_batch: ['SNAPSHOT_UNAVAILABLE', 'FORECAST_AUTHORITY_UNRESOLVED', 'SCHEMA_OR_RUNTIME_AUTHORITY_DIVERGENCE',
'DEMAND_MAPPING_FAILED', 'QUANTITY_CONSERVATION_FAILED', 'EVERY_SCOPE_FAILED_TO_COMMIT'],
never_stops_a_batch: ['NO_TRANSIT_AUTHORITY_FOR_LANE', 'NO_CARRIER_CARD_FOR_LANE',
'CARRIER_PRICING_DEFERRED', 'CARRIER_PRICING_UNAVAILABLE', 'ROUTE_METHOD_MANUAL_REVIEW_REQUIRED',
'MANUAL_ROUTE_SELECTION_REQUIRED', 'MANUAL_CARRIER_SELECTION_REQUIRED',
'EXECUTION_ROUTE_NOT_MATERIALIZED', 'USER_MASTER_DATA_REQUIRED'],



scopes_ready_and_warned: (function () {
var n = 0;
conservationAll.forEach(function (c) {
var ls = c.layered_status;
if (ls && ls.recommendation_ready === true && ls.recommendation_warning_codes
&& ls.recommendation_warning_codes.length) n++;
});
return n;
})()
};





var factoryStockGuardReport = fsgVerdict ? {
verdict: fsgVerdict.verdict, overridable: false,
requested_total: fsgVerdict.requested_total, granted_total: fsgVerdict.granted_total,
clamped_total: fsgVerdict.clamped_total,
inventory_snapshot_fingerprint: fsgVerdict.fingerprint || null,
pools: fsgVerdict.byPool || {}, stops: fsgVerdict.stops || [],
release_set: fsgReleaseDetail, release_set_size: fsgReleaseDetail.length,


not_factory_sourced_lines: fsgSkipped.length, not_factory_sourced_sample: fsgSkipped.slice(0, 10)
} : { verdict: 'NOT_APPLICABLE', overridable: false,
reason: fsgSkipped.length ? 'no proposed line draws on a factory warehouse pool'
: 'no positive quantity was proposed',
not_factory_sourced_lines: fsgSkipped.length, not_factory_sourced_sample: fsgSkipped.slice(0, 10),
requested_total: 0, granted_total: 0, clamped_total: 0, release_set: fsgReleaseDetail,
release_set_size: fsgReleaseDetail.length };
var lifecycle = { attempted: false, ok: null, expired_headers: 0, expired_lines: 0, reason: null, verification: null, manifest: null };
if (runSucceeded) {
if (typeof aiplExpireSupersededDrafts_ !== 'function') {
lifecycle.reason = 'AI_PLAN_LIFECYCLE_MODULE_MISSING';
} else {
lifecycle.attempted = true;
var committedIds = groupsWritten.filter(function (g) { return g.ok && g.allocation_draft_id; })
.map(function (g) { return String(g.allocation_draft_id); });
var expScopes = requestedMkt ? [requestedMkt] : appliedList;
var agg = { ok: true, expired_headers: 0, expired_lines: 0, verification: [], manifest: [], blockers: [] };
// D5-V3-R3 (P5 contract): the whole expiration (every scope) runs INSIDE one script lock; the held lock object is
// handed to 69_, which refuses to write without it and advances each expired draft's version via 16_ sadNextDraftVersion_.
var expLock = null, expHeld = false;
try { expLock = LockService.getScriptLock(); expHeld = expLock.tryLock(30000) === true; } catch (eLk) { expHeld = false; }
if (!expHeld) { agg.ok = false; agg.blockers.push({ marketplace: null, blockers: [{ code: 'EXPIRATION_LOCK_UNAVAILABLE' }] }); }
else { try {
expScopes.forEach(function (M) {
var r = aiplExpireSupersededDrafts_(ss, {
scope: { company: scope0.company, country: scope0.country, marketplace: M,
planning_cycle: request.planningCycle, source_page: WEEKLY_AI_PLAN_SOURCE_PAGE_ },
generation_run_id: generationRunId, committed_ids: committedIds,
actor: weeklyAiPlanStr_(body && body.actor) || 'inventory-ai-plan', lock: expLock
});
if (!r.ok) agg.ok = false;
agg.expired_headers += r.expired_headers || 0;
agg.expired_lines += r.expired_lines || 0;
if (r.verification) agg.verification.push({ marketplace: M, verification: r.verification });
if (r.manifest) agg.manifest.push({ marketplace: M, checksum: r.manifest.checksum, expire_count: r.manifest.expire_count, preserve_count: r.manifest.preserve_count });
if (r.blockers && r.blockers.length) agg.blockers.push({ marketplace: M, blockers: r.blockers });
if (r.version_advanced && r.version_advanced.length) (agg.version_advanced = agg.version_advanced || []).push({ marketplace: M, headers: r.version_advanced });
});
} finally { try { expLock.releaseLock(); } catch (eRl) { } } }
lifecycle.ok = agg.ok;
lifecycle.lock = { held: expHeld, kind: 'SCRIPT' };
lifecycle.version_advanced = agg.version_advanced || [];
lifecycle.expired_headers = agg.expired_headers;
lifecycle.expired_lines = agg.expired_lines;
lifecycle.verification = agg.verification;
lifecycle.manifest = agg.manifest;
if (!agg.ok) lifecycle.reason = agg.blockers.length ? 'EXPIRATION_BLOCKED' : 'EXPIRATION_VERIFICATION_FAILED';
if (agg.blockers.length) lifecycle.blockers = agg.blockers;
}
} else {
lifecycle.reason = 'RUN_NOT_SUCCESSFUL_NOTHING_EXPIRED';
}



















var adviceReport = (function () {
var scopes = [], codes = [], anyReady = false, allReady = conservationAll.length > 0;
var qty = { authorized: 0, supply_allocated: 0, unresolved_supply: 0,
automatic_route: 0, manual_route_review: 0, unresolved_route: 0, execution_route_materialized: 0 };
function add(t, v) { var n = Number(v); if (isFinite(n)) qty[t] += n; }
conservationAll.forEach(function (c) {
var ls = c.layered_status || null;
if (!ls) { allReady = false; return; }
if (ls.recommendation_ready === true) anyReady = true; else allReady = false;
(ls.recommendation_warning_codes || []).forEach(function (k) { if (codes.indexOf(k) === -1) codes.push(k); });
add('authorized', ls.authorized_quantity);
add('supply_allocated', ls.supply_allocated_quantity);
add('unresolved_supply', ls.unresolved_supply_quantity);
add('automatic_route', ls.automatic_route_quantity);
add('manual_route_review', ls.manual_route_review_quantity);
add('unresolved_route', ls.unresolved_route_quantity);
add('execution_route_materialized', ls.execution_route_materialized_quantity);
scopes.push({ marketplace: c.marketplace,
recommendation_ready: ls.recommendation_ready === true,
method_status: ls.method_status,
carrier_pricing_ready: ls.carrier_pricing_ready === true,
execution_route_materialized: ls.execution_route_materialized === true,
submit_ready: ls.submit_ready === true,
authorized_quantity: ls.authorized_quantity,
supply_allocated_quantity: ls.supply_allocated_quantity,
unresolved_supply_quantity: ls.unresolved_supply_quantity,
automatic_route_quantity: ls.automatic_route_quantity,
manual_route_review_quantity: ls.manual_route_review_quantity,
unresolved_route_quantity: ls.unresolved_route_quantity,
execution_route_materialized_quantity: ls.execution_route_materialized_quantity,
route_materialization_complete: ls.route_materialization_complete === true,


sources: weeklyAiPlanAdviceSources_(byMkt[c.marketplace] || [], harvest),
method_advice: c.method_advice || null,
recommendation_warnings: ls.recommendation_warnings || [],
recommendation_warning_codes: ls.recommendation_warning_codes || [],
shared_blockers: ls.shared_blockers || []
});
});
return {
contract: 'F1-7N-FC-1B-E3-R4-A2-R1-R6 §4 — the AI Plan advice, lifted to the top level so a consumer '
+ 'never has to reconstruct it from a per-marketplace diagnostic array',
outcome: batchVerdict === 'STOP' ? 'FAILURE'
: (anyReady ? (codes.length ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS') : 'FAILURE'),
recommendation_ready: anyReady,
all_scopes_recommendation_ready: allReady,
quantities: qty,
warning_codes: codes,


warnings_are_not_failures: true,


execution_plan_changed: (writtenGroups.filter(function (g) { return g.ok; }).length > 0)
|| lifecycle.expired_headers > 0,
scopes: scopes
};
})();

var activeCount = writtenGroups.filter(function (g) { return g.ok; }).length;
return weeklyAiPlanDiagResponse_(harvest, {
success: runSucceeded,
data: {
mode: 'K2_ROUTE_GROUP', job_status: jobStatus, planningCycle: request.planningCycle, businessScope: scope0,

generation_run_id: generationRunId, execution_key: executionKey,
scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt || null, planning_cycle: request.planningCycle },
created_headers: writtenGroups.filter(function (g) { return g.ok && g.outcome === 'CREATED'; }).length,
updated_headers: writtenGroups.filter(function (g) { return g.ok && (g.outcome === 'UPDATED' || g.outcome === 'REGENERATED' || g.outcome === 'REUSED'); }).length,
created_lines: writtenGroups.filter(function (g) { return g.ok && g.outcome === 'CREATED'; }).reduce(function (a, g) { return a + (g.line_count || 0); }, 0),
updated_lines: writtenGroups.filter(function (g) { return g.ok && g.outcome !== 'CREATED'; }).reduce(function (a, g) { return a + (g.line_count || 0); }, 0),
expired_headers: lifecycle.expired_headers, expired_lines: lifecycle.expired_lines,
active_count: activeCount, expired_count: lifecycle.expired_headers, zero_result: zeroResult,



all_suppressed_by_manual: allSuppressed,
suppressed_count: suppressed.length,
suppressed_by_active_manual_draft: suppressed,
identity_collision_count: collisions.length,
active_source_identity_collisions: collisions,










schema_gate: (function () {
var _r = null;
try {
if (typeof sadResolveHeaderSchema_ === 'function' && typeof sadLiveHeaderNames_ === 'function') {
_r = sadResolveHeaderSchema_(sadLiveHeaderNames_(ss.getSheetByName('shipping_allocation_drafts')));
}
} catch (eSG) { _r = null; }
return { ready: true,
migration_version: (_r && _r.ok && _r.version) ? _r.version : null,
resolved_from: _r ? 'LIVE_HEADER' : 'UNRESOLVED_AUTHORITY_UNAVAILABLE',
expected_migration_version: (typeof AIPL_MIGRATION_VERSION_ !== 'undefined') ? AIPL_MIGRATION_VERSION_ : null };
})(),


factory_stock_guard: factoryStockGuardReport,
verification: { lifecycle_ok: lifecycle.ok, lifecycle_reason: lifecycle.reason, detail: lifecycle.verification, manifest: lifecycle.manifest },
lifecycle: lifecycle,
requested_scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt || 'ALL_MARKETPLACES(company/country fan-out)' },
applied_scope: { company: scope0.company, country: scope0.country, marketplaces: appliedList }, applied_equals_requested: scopeEqual ? 'YES' : 'NO',
groups_written: groupsWritten.length, per_group_outcome_counts: outcomeCounts, groups: groupsWritten,
blocked_count: blockedTotal.length, blocked: blockedTotal,
conservation: conservationAll, batch: batchReport, advice: adviceReport,
activation_mutation_manifest: weeklyAiPlanActivationManifest_(),
skuCount: src.skuCount, unresolvedProductionNeedQty: src.unresolvedTotal,
atomicity_note: 'Each K2 group is atomic under its own lock; the job is NOT a single all-or-nothing transaction across groups — a PARTIAL job is reported truthfully per group, and a retry REUSEs committed groups by deterministic identity (no duplicates). Superseded AI drafts are expired ONLY after this run has committed and verified.'
},
errors: (anyFail ? [weeklyAiPlanErr_('K2_GENERATION_PARTIAL', 'one or more K2 groups did not commit; see data.groups (per-group outcome)')] : [])
.concat(lifecycle.attempted && lifecycle.ok === false
? [weeklyAiPlanErr_('AI_PLAN_EXPIRATION_INCOMPLETE', 'the current run committed, but superseded drafts were not fully expired; the previous plan may still be active. See data.lifecycle.', { reason: lifecycle.reason })]
: [])
});
}






function weeklyAiPlanHarvest_(ss, scope, expectedBySite) {
var errors = [];


var _cc = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
var calcDateForDemand = (_cc && _cc.ok) ? _cc.calculationDate : null;

var poolFacts = (typeof gapOpReadSupplyPoolFacts_ === 'function') ? gapOpReadSupplyPoolFacts_(ss) : null;
if (!poolFacts) return { ok: false, errors: [weeklyAiPlanErr_('SUPPLY_POOL_FACTS_UNAVAILABLE', 'gapOpReadSupplyPoolFacts_ unavailable')] };
var upcBySku = (typeof recGenUpcBySku_ === 'function') ? recGenUpcBySku_(ss) : {};
var warehousesById = weeklyAiPlanWarehousesById_(ss);






var canonical = weeklyAiPlanCanonicalDemand_(ss, scope, calcDateForDemand);
if (!canonical.ok) {


return { ok: false, errors: [weeklyAiPlanErr_('CANONICAL_DEMAND_UNAVAILABLE',
'the materialized demand snapshot could not be used: ' + canonical.reason,
{ table: WAP_GAP_TABLE_, reason: canonical.reason,
freshness: canonical.freshness || null, schedule: canonical.schedule || null,
distinct_dates: canonical.distinctDates || [],


date_normalization: canonical.dateNormalization || null })] };
}
var sites = weeklyAiPlanEnumerateSites_(ss, scope, upcBySku, errors, canonical, expectedBySite);
var _pendDest = (sites && sites.pendingDestination) || [], _sus3 = (sites && sites.supplyUnderstated) || [];   // P3PL-2 r3
var _a0 = (sites && sites.a0Blocked) || [];   // A2-Q1 (r4)
var _poolIssues = (poolFacts && poolFacts.poolIssues) || [];   // D5-V3-R2 (M1): surfaced, never guessed







var universeSiteCount = sites.length;
var target = weeklyAiPlanTargetScopes_(scope, scope.marketplace);
if (!target.ok) {
return { ok: false, errors: [weeklyAiPlanErr_(target.reason,
'the controlled activation scope could not be resolved, so no demand may enter the allocator',
{ scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace || null },
allowlist: (typeof inventoryAiPlanActivationAllowlist_ === 'function') ? inventoryAiPlanActivationAllowlist_() : null,
universe_site_count: universeSiteCount, db_writes: 0 })] };
}
var iso = weeklyAiPlanIsolateSites_(sites, target);

var coll = weeklyAiPlanCollapseCanonicalDemand_(iso.sites, scope, errors);
sites = coll.sites;






var _recState = weeklyAiPlanRecommendationState_(canonical, target);
// A2-Q1 (r4): SKUs whose live line is A0-BLOCKED (42_ WAREHOUSE_SHARE_UNKNOWN / WAREHOUSE_COMPANY_UNKNOWN) - their site's AI draft that holds them is never replaced
var _a0Keys = {}; _a0.forEach(function (x) { _a0Keys[weeklyAiPlanStr_(scope.company) + '|' + weeklyAiPlanStr_(scope.country) + '|' + x.marketplace + '|' + x.sku] = 1; });
var _planned = weeklyAiPlanQualifyingPlannedQty_(ss, scope, { marketplaces: ((target && target.scopes) || []).map(function (e) { return e && e.marketplace; }), a0Keys: _a0Keys });
var _holdC = weeklyAiPlanCommitmentHold_(_planned, scope, target, sites);   // A2-D14C: held keys / sites never reach the allocator
_planned.commitmentHold = _holdC.report;
if (_holdC.report.active || _holdC.report.a0_active) { sites = sites.filter(function (st0) { return !_holdC.isHeld(st0.marketplace, st0.sku); }); _pendDest = _pendDest.filter(function (pd0) { return !_holdC.isHeld(pd0.marketplace, pd0.sku); }); }
var _residual = weeklyAiPlanNetSitesByResidual_(sites, _planned.byKey, scope, _planned.datedByKey);
if (_pendDest.length) { var _pnSites = _pendDest.map(function (pd) { return { marketplace: pd.marketplace, sku: pd.sku, cumulativeGapByWindow: pd.suggestedByWindow,
netBasisGapByWindow: pd.gapByWindow || null, unitsPerCarton: pd.unitsPerCarton, requiredByByWindow: pd.requiredByByWindow || {} }; });
weeklyAiPlanNetSitesByResidual_(_pnSites, _planned.byKey, scope, _planned.datedByKey);
_pendDest.forEach(function (pd, ix) { pd.grossSuggestedByWindow = pd.suggestedByWindow; pd.suggestedByWindow = _pnSites[ix].cumulativeGapByWindow;
pd.netGapByWindow = _pnSites[ix].netGapByWindow || null; pd.netting_basis = 'GAP_THEN_CARTON_ROUND'; pd.netted = true; }); }
var _noAction = weeklyAiPlanNoActionDecision_(_recState, _planned);
var isolation = {
enforced: true, stage: 'PRE_CANONICAL_GROUPING',
target_scopes: target.scopes, requested_marketplace: target.requested_marketplace,
universe_site_count: universeSiteCount,
target_site_count: iso.target_site_count, target_sku_count: iso.target_sku_count,
foreign_site_count: iso.foreign_site_count, foreign_sku_count: iso.foreign_sku_count,
foreign_sample: iso.foreign_sample,
canonical_demand_count: coll.canonical_demand_count,
collapsed_site_count: coll.collapsed_site_count,
canonical_demand_conflicts: coll.conflicts, canonical_demand_conflict_count: coll.conflict_count
};

if (coll.conflict_count) {
return { ok: false, errors: errors.concat([weeklyAiPlanErr_('CANONICAL_DEMAND_QUANTITY_CONFLICT',
'one canonical demand carries two different quantities; zero rows written',
{ conflicts: coll.conflicts, isolation: isolation, db_writes: 0 })]) };
}


var asOf = weeklyAiPlanSourceDataAsOfAuthority_(scope.planningCycle);
if (!asOf.ok) {
return { ok: false, errors: [weeklyAiPlanErr_('SOURCE_DATA_AS_OF_UNRESOLVED',
'the authoritative GAP-INV run cutoff could not be resolved (' + asOf.reason + '); zero rows written',
{ reason: asOf.reason, planning_cycle: scope.planningCycle, isolation: isolation, db_writes: 0 })] };
}






if (!sites.length) return { ok: true, errors: errors, site_count: 0, pendingDestination: _pendDest, supplyUnderstated: _sus3, poolIssues: _poolIssues, heldOverseasPools: (poolFacts && poolFacts.heldOverseasPools) || [], kmaf: { ready: true, receiverFacts: [], planningFacts: [] }, horizonsByDemandRef: {}, poolsBySku: weeklyAiPlanPoolsBySku_(poolFacts, scope), warehousesById: warehousesById,
recommendationState: _recState, qualifyingPlanned: _planned, residual: _residual, noActionDecision: _noAction,
sourceDataAsOf: asOf.date, sourceDataAsOfAuthority: { run_id: asOf.run_id, date: asOf.date, source: 'GAP_INV_RUN_LINEAGE' },
gapLineage: asOf.lineage, isolation: isolation, snapshot_freshness: canonical.freshness || null,
accepted_snapshot_date: canonical.acceptedDate || null, gap_schedule: canonical.schedule || null,
gap_job_state: canonical.jobState || null, snapshot_distinct_dates: canonical.distinctDates || [],
snapshot_date_normalization: canonical.dateNormalization || null };




































if (_noAction && _noAction.noAction === true) {
return { ok: true, errors: errors, site_count: sites.length, pendingDestination: _pendDest, supplyUnderstated: _sus3, poolIssues: _poolIssues, heldOverseasPools: (poolFacts && poolFacts.heldOverseasPools) || [],
no_action_short_circuit: true,
kmaf: { ready: true, receiverFacts: [], planningFacts: [] }, horizonsByDemandRef: {},
poolsBySku: weeklyAiPlanPoolsBySku_(poolFacts, scope), warehousesById: warehousesById,
recommendationState: _recState, qualifyingPlanned: _planned, residual: _residual, noActionDecision: _noAction,
sourceDataAsOf: asOf.date, sourceDataAsOfAuthority: { run_id: asOf.run_id, date: asOf.date, source: 'GAP_INV_RUN_LINEAGE' },
gapLineage: asOf.lineage, isolation: isolation, snapshot_freshness: canonical.freshness || null,
accepted_snapshot_date: canonical.acceptedDate || null, gap_schedule: canonical.schedule || null,
gap_job_state: canonical.jobState || null, snapshot_distinct_dates: canonical.distinctDates || [],
snapshot_date_normalization: canonical.dateNormalization || null };
}



var built = weeklyAiPlanBuildKmafReceivers_(ss, scope, sites, upcBySku, errors);
if (built.fatal) return { ok: false, errors: errors };

var kmaf;
try {
kmaf = KMAF.projectAllocationFacts({
recommendationType: 'WEEKLY_SHIPPING', planningCycle: scope.planningCycle,
businessScope: { company: scope.company, country: scope.country },
calculationDate: built.calculationDate, receivers: built.receivers, warehouses: built.kmafWarehouses
});
} catch (e) {
return { ok: false, errors: [weeklyAiPlanErr_('KMAF_THREW', (e && e.message) ? String(e.message) : String(e))] };
}


var horizonsByDemandRef = {};
built.horizonRows.forEach(function (r) { horizonsByDemandRef[r.demandRef] = { cumulativeGapByWindow: r.cumulativeGapByWindow,
requiredByByWindow: r.requiredByByWindow, demandLineage: r.demandLineage || null, liveGapByWindow: r.liveGapByWindow || null }; });

return {
ok: true, kmaf: kmaf, horizonsByDemandRef: horizonsByDemandRef, pendingDestination: _pendDest, supplyUnderstated: _sus3, poolIssues: _poolIssues, heldOverseasPools: (poolFacts && poolFacts.heldOverseasPools) || [],
poolsBySku: weeklyAiPlanPoolsBySku_(poolFacts, scope), warehousesById: warehousesById,


sourceDataAsOf: asOf.date,
sourceDataAsOfAuthority: { run_id: asOf.run_id, date: asOf.date, source: 'GAP_INV_RUN_LINEAGE' },
workspaceSourceDataAsOf: built.sourceDataAsOf || null,
gapLineage: asOf.lineage,

isolation: isolation,


errors: errors, site_count: sites.length, receiver_count: (built.receivers || []).length,


builtReceivers: built.receivers || [],


forecast_normalization: built.forecastNormalization || null,


recommendationState: _recState, qualifyingPlanned: _planned, residual: _residual, noActionDecision: _noAction,

snapshot_freshness: canonical.freshness || null,
accepted_snapshot_date: canonical.acceptedDate || null,
gap_schedule: canonical.schedule || null,
gap_job_state: canonical.jobState || null,
snapshot_distinct_dates: canonical.distinctDates || [],
snapshot_date_normalization: canonical.dateNormalization || null
};
}






function weeklyAiPlanExpectedDemand_(body, company, country) {
var list = (body && Array.isArray(body.expectedDemand)) ? body.expectedDemand : null;
if (!list || !list.length) return null;
var out = {};
for (var i = 0; i < list.length; i++) {
var e = list[i] || {};
var mk = weeklyAiPlanStr_(e.marketplace), sku = weeklyAiPlanStr_(e.sku);
if (!mk || !sku) continue;
var key = company + '|' + country + '|' + mk + '|' + sku;
var byWin = {};
var src = (e.suggestedByWindow && typeof e.suggestedByWindow === 'object') ? e.suggestedByWindow : {};
for (var w in src) { if (Object.prototype.hasOwnProperty.call(src, w)) byWin[w] = src[w]; }
out[key] = byWin;
}
return out;
}


function weeklyAiPlanWarehousesById_(ss) {
var out = {};
if (typeof gapReadObjects_ !== 'function') return out;
var rows = gapReadObjects_(ss, 'warehouses') || [];
rows.forEach(function (r) {
var id = weeklyAiPlanStr_(r.warehouse_id);
if (!id) return;


out[id] = { warehouse_id: id, warehouse_code: weeklyAiPlanStr_(r.warehouse_code),
warehouse_type: weeklyAiPlanStr_(r.warehouse_type), is_factory_warehouse: r.is_factory_warehouse,
is_active: r.is_active, country: weeklyAiPlanStr_(r.country) };
});
return out;
}


function weeklyAiPlanPoolsBySku_(poolFacts, scope) {
var out = {}, canonCountry = (typeof gapCanonCountry_ === 'function') ? gapCanonCountry_(scope.country) : scope.country;
var factoryBySku = poolFacts.factoryPoolsBySku || {};
for (var sku in factoryBySku) { if (factoryBySku.hasOwnProperty(sku)) { out[sku] = out[sku] || { overseasSupplyPools: [], factoryPools: [] }; out[sku].factoryPools = factoryBySku[sku]; } }
var overseasByKey = poolFacts.overseasPoolsByKey || {};
for (var key in overseasByKey) {
if (!overseasByKey.hasOwnProperty(key)) continue;
var parts = key.split('||');
if (parts.length !== 3 || parts[0] !== scope.company || parts[1] !== canonCountry) continue;
var s = parts[2]; out[s] = out[s] || { overseasSupplyPools: [], factoryPools: [] }; out[s].overseasSupplyPools = overseasByKey[key];
}
return out;
}




















function weeklyAiPlanSourceDataAsOfAuthority_(planningCycle) {
var lin = weeklyAiPlanResolveGapRunLineage_(planningCycle, null, null);
if (!lin.ok) return { ok: false, reason: lin.reason, date: null, run_id: null, lineage: null };
var cd = weeklyAiPlanCanonicalDate_(lin.source_data_as_of);
if (!cd.ok) return { ok: false, reason: 'LINEAGE_SOURCE_DATA_AS_OF_UNREADABLE:' + cd.reason,
date: null, run_id: lin.run_id, lineage: lin };
return { ok: true, reason: null, date: cd.date, run_id: lin.run_id, lineage: lin };
}

























function weeklyAiPlanTargetScopes_(scope, requestedMarketplace) {
if (typeof inventoryAiPlanActivationAllowlist_ !== 'function' || typeof inventoryAiPlanScopeEnabled_ !== 'function') {
return { ok: false, reason: 'AI_PLAN_SCOPE_GUARD_UNAVAILABLE', scopes: [], requested_marketplace: null };
}
var mk = weeklyAiPlanStr_(requestedMarketplace);

if (/^all(_sites)?$/i.test(mk)) {
return { ok: false, reason: 'SCOPE_ALL_SITES_FORBIDDEN', scopes: [], requested_marketplace: mk };
}
var out = [];
(inventoryAiPlanActivationAllowlist_() || []).forEach(function (e) {
var c = weeklyAiPlanStr_(e.company), k = weeklyAiPlanStr_(e.country),
m = weeklyAiPlanStr_(e.marketplace), sk = weeklyAiPlanStr_(e.sku);
if (c !== weeklyAiPlanStr_(scope.company) || k !== weeklyAiPlanStr_(scope.country)) return;
if (mk && m !== mk) return;


if (!inventoryAiPlanScopeEnabled_(c, k, m, sk)) return;
out.push({ company: c, country: k, marketplace: m, sku: sk });
});
if (!out.length) {
return { ok: false, reason: 'AI_PLAN_SCOPE_NOT_ENABLED', scopes: [], requested_marketplace: mk || null };
}
return { ok: true, reason: null, scopes: out, requested_marketplace: mk || null };
}


function weeklyAiPlanTargetKeySet_(target) {
var keep = {};
((target && target.scopes) || []).forEach(function (e) { keep[e.marketplace + '|' + e.sku] = 1; });
return keep;
}





function weeklyAiPlanIsolateSites_(sites, target) {
var keep = weeklyAiPlanTargetKeySet_(target);
var kept = [], foreign = [], fSkus = {}, tSkus = {};
(sites || []).forEach(function (st) {
var m = weeklyAiPlanStr_(st.marketplace), sk = weeklyAiPlanStr_(st.sku);
if (keep[m + '|' + sk]) { kept.push(st); tSkus[sk] = 1; return; }
fSkus[sk] = 1;
if (foreign.length < 10) foreign.push({ marketplace: m, sku: sk });
});
return { sites: kept,
target_site_count: kept.length, target_sku_count: Object.keys(tSkus).length,
foreign_site_count: (sites || []).length - kept.length, foreign_sku_count: Object.keys(fSkus).length,
foreign_sample: foreign };
}
























function weeklyAiPlanCanonicalDemandRef_(scope, site) {
return [weeklyAiPlanStr_(scope.company), weeklyAiPlanStr_(scope.country), weeklyAiPlanStr_(site.marketplace),
weeklyAiPlanStr_(site.sku), weeklyAiPlanStr_(site.destinationWarehouseId)].join('|');
}
function weeklyAiPlanCollapseCanonicalDemand_(sites, scope, errors) {
var byRef = {}, order = [], collapsed = 0, conflicts = [];
(sites || []).forEach(function (st) {
var ref = weeklyAiPlanCanonicalDemandRef_(scope, st);
var held = byRef[ref];
if (!held) {
st.demandRef = ref;
st.siteSkus = [weeklyAiPlanStr_(st.siteSku)];
byRef[ref] = st; order.push(ref);
return;
}

var a = JSON.stringify(held.cumulativeGapByWindow || {}), b = JSON.stringify(st.cumulativeGapByWindow || {});
if (a !== b) {
conflicts.push({ demandRef: ref, sku: weeklyAiPlanStr_(st.sku), marketplace: weeklyAiPlanStr_(st.marketplace),
site_sku_a: held.siteSkus.join(','), site_sku_b: weeklyAiPlanStr_(st.siteSku), qty_a: a, qty_b: b });
return;
}
var ssk = weeklyAiPlanStr_(st.siteSku);
if (ssk && held.siteSkus.indexOf(ssk) < 0) held.siteSkus.push(ssk);
collapsed++;
});
var out = order.map(function (ref) {
var st = byRef[ref];
st.siteSkus = st.siteSkus.slice().sort();
st.siteSku = st.siteSkus[0] || weeklyAiPlanStr_(st.siteSku);
return st;
});
if (conflicts.length && Array.isArray(errors)) {
conflicts.forEach(function (c) {
errors.push(weeklyAiPlanErr_('CANONICAL_DEMAND_QUANTITY_CONFLICT',
'two sites of one canonical demand disagree about the quantity; refused rather than reconciled', c));
});
}
return { sites: out, collapsed_site_count: collapsed, conflict_count: conflicts.length,
conflicts: conflicts.slice(0, 10), canonical_demand_count: out.length };
}




























var WAP_RECOMMENDATION_STATES_ = {
VALID_ZERO: 'VALID_ZERO_RECOMMENDATION',
NONZERO: 'NONZERO_RECOMMENDATION',
MISSING: 'MISSING_RECOMMENDATION'
};




var WAP_NO_ACTION_CODE_ = 'AI_PLAN_NO_ACTION';


function weeklyAiPlanQty_(v) {
if (v === '' || v === null || v === undefined) return null;
var n = Number(v);
return isFinite(n) ? n : null;
}















function weeklyAiPlanRecommendationState_(canonical, target) {
var order = ['D18', 'D30', 'D45', 'D90'];
var windows = [];
order.forEach(function (w) { if (Object.prototype.hasOwnProperty.call(WAP_GAP_WINDOW_COL_, w)) windows.push(w); });
for (var extra in WAP_GAP_WINDOW_COL_) {
if (Object.prototype.hasOwnProperty.call(WAP_GAP_WINDOW_COL_, extra) && windows.indexOf(extra) === -1) windows.push(extra);
}
var furthest = windows.length ? windows[windows.length - 1] : null;
var out = {
state: WAP_RECOMMENDATION_STATES_.MISSING,
authority_rule: 'inventory_replenishment_gap, the row at the ACCEPTED snapshot date for the exact'
+ ' (company, country, marketplace, sku). The quantity is the FURTHEST cumulative window ('
+ (furthest || 'none configured') + '), which is the single actionable total; the windows are'
+ ' cumulative checkpoints and summing them would double-count need.',
windows_required: windows.slice(),
furthest_window: furthest,
accepted_calculation_date: (canonical && canonical.acceptedDate) || null,
snapshot_freshness_state: (canonical && canonical.freshnessState) || null,
current_run: null,
per_scope: [],
recommended_qty_total: null,
evaluated_scope_count: 0,
missing_reasons: []
};
if (!canonical || canonical.ok !== true) {
out.missing_reasons.push({ reason: 'CANONICAL_DEMAND_UNAVAILABLE', detail: (canonical && canonical.reason) || null });
return out;
}
out.current_run = {
calculation_date: canonical.acceptedDate || null,
freshness_state: canonical.freshnessState || null,
gap_job: canonical.jobState || null,
distinct_dates: canonical.distinctDates || []
};
var scopes = (target && target.scopes) || [];
if (!scopes.length) {
out.missing_reasons.push({ reason: 'NO_AUTHORIZED_SCOPE', detail: (target && target.reason) || null });
return out;
}
var total = 0, anyMissing = false, anyPositive = false;
scopes.forEach(function (s) {
var key = s.company + '|' + s.country + '|' + s.marketplace + '|' + s.sku;
var row = canonical.bySite ? canonical.bySite[key] : null;
var entry = { company: s.company, country: s.country, marketplace: s.marketplace, sku: s.sku,
key: key, evaluated: false, reason: null, calculation_status: null, calculation_date: null,
calculated_at: null, windows: {}, recommended_qty: null };
if (!row) {
entry.reason = 'NO_ROW_AT_THE_ACCEPTED_DATE';
anyMissing = true; out.per_scope.push(entry); out.missing_reasons.push({ key: key, reason: entry.reason });
return;
}
entry.calculation_status = row.calculation_status || null;
entry.calculation_date = row.calculation_date || null;
entry.calculated_at = row.calculated_at || null;
if (row.duplicate === true) {
entry.reason = 'DUPLICATE_ROW_FOR_THIS_KEY';
anyMissing = true; out.per_scope.push(entry); out.missing_reasons.push({ key: key, reason: entry.reason });
return;
}
if (weeklyAiPlanStr_(row.calculation_status) !== 'READY') {


entry.reason = 'NOT_READY:' + (weeklyAiPlanStr_(row.calculation_status) || '(blank)');
anyMissing = true; out.per_scope.push(entry); out.missing_reasons.push({ key: key, reason: entry.reason });
return;
}
var blank = null;
windows.forEach(function (w) {
var v = weeklyAiPlanQty_(row.suggestedByWindow ? row.suggestedByWindow[w] : null);
entry.windows[w] = v;
if (v === null && blank === null) blank = w;
});
if (blank !== null) {
entry.reason = 'WINDOW_VALUE_MISSING:' + blank;
anyMissing = true; out.per_scope.push(entry); out.missing_reasons.push({ key: key, reason: entry.reason });
return;
}
entry.evaluated = true;
entry.recommended_qty = furthest ? entry.windows[furthest] : null;
if (entry.recommended_qty === null) {
entry.evaluated = false;
entry.reason = 'NO_CONFIGURED_WINDOW';
anyMissing = true; out.per_scope.push(entry); out.missing_reasons.push({ key: key, reason: entry.reason });
return;
}


windows.forEach(function (w) { if (entry.windows[w] > 0) anyPositive = true; });
total += entry.recommended_qty;
out.evaluated_scope_count++;
out.per_scope.push(entry);
});
if (anyMissing) { out.state = WAP_RECOMMENDATION_STATES_.MISSING; return out; }
out.recommended_qty_total = total;
out.state = anyPositive ? WAP_RECOMMENDATION_STATES_.NONZERO : WAP_RECOMMENDATION_STATES_.VALID_ZERO;
return out;
}





















function weeklyAiPlanIsAiRow_(row) {
if (typeof aiplIsAiGenerated_ === 'function') return aiplIsAiGenerated_(row);
var gt = weeklyAiPlanStr_(row && row.generation_type).toLowerCase();
if (gt === 'user_created') return false;
if (gt === 'system_generated' || gt === 'scheduled' || gt === 'manual_refresh') return true;
return !!weeklyAiPlanStr_(row && row.generation_run_id);
}

// D5-V3 (approved D1 / D4 / D6 = C-4 spec; V3-4): VALID EXISTING COMMITMENTS are netted ONCE along their lineage.
//   (a) allocation-draft lines: header and line not terminal; manual AND AI drafts - EXCEPT the AI drafts this run replaces
//       (69_ aiplReplacementSetOf_: same scope + AI + status draft);
//   (b) shipping_plan lines whose plan is draft / pending_approval / approved and NOT yet transferred to a Shipment (a
//       submitted draft's lines are terminal, so the draft->plan step is counted once, by the plan; a transferred plan is
//       counted by its Shipment in the gap - D1 planned / D2 shipped - and is not netted again here).
//   Each commitment needs a valid quantity (> 0), ownership (company, country, marketplace, sku), a DESTINATION-AVAILABILITY
//   date (expected_arrival, else required_by_date; a plan line takes its date from the draft line named in its source_reason
//   'line:<id>') and a supply basis (source warehouse). Anything missing -> not counted and counted in `excluded` (warn).
//   byKey keeps the undated totals (the no-action decision reads them); datedByKey drives the per-window netting.
function weeklyAiPlanQualifyingPlannedQty_(ss, scope, replaceCtx) {
var termH = (typeof SAD_TERMINAL_STATUSES_ !== 'undefined') ? SAD_TERMINAL_STATUSES_ : { submitted: 1, cancelled: 1, expired: 1 };
var termL = (typeof SAD_TERMINAL_LINE_STATUSES_ !== 'undefined') ? SAD_TERMINAL_LINE_STATUSES_
: { submitted: 1, cancelled: 1, expired: 1, superseded: 1, superseded_user_review: 1 };
var out = { ok: false, reason: null, byKey: {}, datedByKey: {}, rows: [], warnings: [], header_count: 0, line_count: 0, plan_line_count: 0,
excluded: { terminal_header: 0, terminal_line: 0, scope_mismatch: 0, no_header: 0, blank_qty: 0, ai_replaced_header: 0,
no_owner: 0, no_date: 0, no_supply_basis: 0, plan_not_open: 0, plan_transferred: 0, plan_no_lineage: 0, draft_counted_by_plan: 0,
draft_counted_by_shipment: 0 },
authority: 'D5-V3 commitment set: non-terminal manual + AI drafts except the AI drafts this run replaces (69_ aiplReplacementSetOf_),'
+ ' plus open (draft/pending_approval/approved), not-transferred shipping_plan lines; each needs qty, ownership,'
+ ' destination-availability date and supply basis; netted per window by date.',
provenance_authority: (typeof aiplIsAiGenerated_ === 'function') ? 'aiplIsAiGenerated_ (69_)' : 'FALLBACK' };
if (typeof gapReadObjects_ !== 'function') { out.reason = 'SHEET_READER_UNAVAILABLE'; return out; }
var headers, lines, plans, planLines;
try {
headers = gapReadObjects_(ss, 'shipping_allocation_drafts') || [];
lines = gapReadObjects_(ss, 'shipping_allocation_draft_lines') || [];
plans = gapReadObjects_(ss, 'shipping_plans') || [];
planLines = gapReadObjects_(ss, 'shipping_plan_lines') || [];
} catch (e) { out.reason = 'ALLOCATION_DRAFT_READ_FAILED'; return out; }
function ymd(v) {
if (typeof recoWsYmd_ === 'function') { var y = recoWsYmd_(v); return /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : ''; }
var t = weeklyAiPlanStr_(v); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}
function availDate(l) { return ymd(l && l.expected_arrival) || ymd(l && l.required_by_date); }
// A2-D14C (Owner D14 = (c), 2026-11-19): a VALID commitment (quantity, ownership and supply basis present) whose
// destination-availability date cannot be determined by the approved order above (expected_arrival, else required_by_date;
// a plan line through the draft line its lineage names) puts its company|country|marketplace|sku key on HOLD. It stays
// out of the netting exactly as before (no date guessed, no window chosen). Nothing is written here.
out.hold = { byKey: {}, replacedHeldMarketplaces: {}, a0HeldMarketplaces: {}, datedByShipment: [] };
// A2-D14C r3 (Owner via Lead 2026-11-19): a PLAN line that has no approved date may be dated by Shipments ONLY for the quantity they
// truly cover. A Shipment line counts for this plan line when ALL hold: header company = this company, header marketplace = this site,
// line sku = this sku, header not cancelled and line not cancelled, and it belongs to this plan line (shipment_lines.shipping_plan_line_id
// = this plan line; a line without that id counts only when its header belongs to this plan - shipments.shipping_plan_id or an active
// shipment_plan_links row). Covered = the received part (arrived, no date needed) + the unreceived part of a Shipment with a valid ETA;
// an arrived/received/closed/completed/delivered header counts in full. Covered is capped at the plan-line quantity. The uncovered
// remainder has no approved date and stays on HOLD. Nothing is netted here (the gap counts each Shipment once, at its ETA), so supply is
// never deducted twice. The plan header (created/submitted/approved_at) and the plan line carry no availability date (SPEC_R2 s.4), and
// the BV1 PLAN_DATE fallback (42_ recoWsPlanDateOf_) dates only through the line:<draft line> lineage. Read lazily, once per call.
// A2-D14C r4 (pre-review M-2): a Shipment line's coverable quantity is CONSUMED once across all plan lines (rem[] per Shipment line,
// Shipment lines taken in stable id order), so the same Shipment never dates two plan lines. A Shipment line WITHOUT a plan-line id
// counts only when it is unambiguous: its header belongs to exactly ONE plan (shipments.shipping_plan_id + active shipment_plan_links)
// and that plan has exactly ONE plan line of this sku. Anything ambiguous is not coverage (the remainder stays on HOLD), never guessed.
var shipIdxH = null, SHIP_ARRIVED_H = { arrived: 1, received: 1, closed: 1, completed: 1, delivered: 1 };
function shipIndex() { if (shipIdxH) return shipIdxH; shipIdxH = { hdr: {}, lines: [], linksBySid: {}, rem: {}, plCount: null }; var shR = [], slR = [], lkR = [];
try { shR = gapReadObjects_(ss, 'shipments') || []; slR = gapReadObjects_(ss, 'shipment_lines') || []; lkR = gapReadObjects_(ss, 'shipment_plan_links') || []; } catch (eSh) { shR = []; slR = []; lkR = []; }
shR.forEach(function (s0) { var id0 = weeklyAiPlanStr_(s0.shipment_id); if (id0) shipIdxH.hdr[id0] = s0; });
lkR.forEach(function (k0) { var ls0 = weeklyAiPlanStr_(k0.link_status).toLowerCase(); if (ls0 && ls0 !== 'active') return; var s0 = weeklyAiPlanStr_(k0.shipment_id), p0 = weeklyAiPlanStr_(k0.shipping_plan_id); if (s0 && p0) (shipIdxH.linksBySid[s0] = shipIdxH.linksBySid[s0] || {})[p0] = 1; });
shipIdxH.lines = slR.map(function (sl, i) { return { sl: sl, key: weeklyAiPlanStr_(sl.shipment_id) + '#' + (weeklyAiPlanStr_(sl.shipment_line_id) || ('@' + i)) }; }).sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
shipIdxH.plCount = {}; planLines.forEach(function (x) { var k = weeklyAiPlanStr_(x.shipping_plan_id) + '|' + weeklyAiPlanStr_(x.sku); shipIdxH.plCount[k] = (shipIdxH.plCount[k] || 0) + 1; });
return shipIdxH; }
function planShipmentCover(pid, plId, mk, sku, need) { var ix = shipIndex(), out9 = { covered: 0, items: [], ambiguous: [] }; pid = weeklyAiPlanStr_(pid); plId = weeklyAiPlanStr_(plId);
ix.lines.forEach(function (e9) { if (out9.covered >= need) return; var sl = e9.sl, sid = weeklyAiPlanStr_(sl.shipment_id), h0 = ix.hdr[sid]; if (!h0) return;
var hst = weeklyAiPlanStr_(h0.status).toLowerCase(); if (hst === 'cancelled' || weeklyAiPlanStr_(sl.line_status).toLowerCase() === 'cancelled') return;
if (weeklyAiPlanStr_(h0.company) !== co || weeklyAiPlanStr_(h0.country) !== ct || weeklyAiPlanStr_(h0.marketplace) !== mk || weeklyAiPlanStr_(sl.sku) !== sku) return;   // r5 (m-7): + country
var lpl = weeklyAiPlanStr_(sl.shipping_plan_line_id);
if (lpl) { if (lpl !== plId) return; } else {
var pls = {}; var hp = weeklyAiPlanStr_(h0.shipping_plan_id); if (hp) pls[hp] = 1; Object.keys(ix.linksBySid[sid] || {}).forEach(function (p9) { pls[p9] = 1; });
if (!pls[pid]) return;
if (Object.keys(pls).length !== 1 || (ix.plCount[pid + '|' + sku] || 0) !== 1) { if (out9.ambiguous.length < 20) out9.ambiguous.push({ shipment_id: sid, plans: Object.keys(pls).sort(), plan_lines_of_sku: ix.plCount[pid + '|' + sku] || 0 }); return; } }
var qS = weeklyAiPlanQty_(sl.shipment_qty); if (qS === null || qS <= 0) return; var rcv = weeklyAiPlanQty_(sl.shipment_received_qty); rcv = (rcv === null || rcv < 0) ? 0 : Math.min(rcv, qS);
var eta9 = ymd(h0.eta), arrived = !!SHIP_ARRIVED_H[hst], c9 = arrived ? qS : (rcv + (eta9 ? qS - rcv : 0));
if (ix.rem[e9.key] === undefined) ix.rem[e9.key] = c9; var take = Math.min(ix.rem[e9.key], need - out9.covered); if (!(take > 0)) return; ix.rem[e9.key] -= take;
out9.covered += take; if (out9.items.length < 20) out9.items.push({ shipment_id: sid, shipment_line_id: weeklyAiPlanStr_(sl.shipment_line_id) || null, status: hst, qty: qS, received_qty: rcv, eta: eta9 || null, coverable_qty: c9, covered_qty: take }); });
return out9; }
function holdPlan(key, ref, q, reason, mk, sku, pid) { var cv = planShipmentCover(pid, ref, mk, sku, q), c = Math.min(q, cv.covered), rest = q - c;
if ((c > 0 || cv.ambiguous.length) && out.hold.datedByShipment.length < 50) out.hold.datedByShipment.push({ ref: ref, plan_qty: q, covered_qty: c, uncovered_qty: rest, reason: reason, shipments: cv.items, ambiguous_not_counted: cv.ambiguous });
if (rest > 0) hold(key, 'PLAN', ref, rest, reason, mk, sku, c > 0 ? { plan_qty: q, covered_by_shipment_qty: c } : null); }
function hold(key, kind, ref, q, reason, mk, sku, extra) { var a = (out.hold.byKey[key] = out.hold.byKey[key] || { key: key, marketplace: mk, sku: sku, commitments: [] }); if (a.commitments.length < 50) { var cm = { kind: kind, ref: ref, qty: q, reason: reason }; if (extra) for (var xk in extra) { if (Object.prototype.hasOwnProperty.call(extra, xk)) cm[xk] = extra[xk]; } a.commitments.push(cm); } }
var co = weeklyAiPlanStr_(scope && scope.company), ct = weeklyAiPlanStr_(scope && scope.country);
// the AI drafts this run replaces
var replaced = {};
var rc = replaceCtx || {};
var mkts = (rc.marketplaces || []).map(function (m) { return weeklyAiPlanStr_(m); }).filter(function (m) { return !!m; });
if (!mkts.length && weeklyAiPlanStr_(scope && scope.marketplace)) mkts = [weeklyAiPlanStr_(scope.marketplace)];
if (typeof aiplReplacementSetOf_ === 'function') {
mkts.forEach(function (m) {
var ids = aiplReplacementSetOf_(headers, { company: co, country: ct, marketplace: m, planning_cycle: weeklyAiPlanStr_(scope && scope.planningCycle),
source_page: (typeof WEEKLY_AI_PLAN_SOURCE_PAGE_ !== 'undefined') ? WEEKLY_AI_PLAN_SOURCE_PAGE_ : '' });
for (var id in ids) { if (Object.prototype.hasOwnProperty.call(ids, id)) replaced[id] = 1; }
});
}
function add(key, q, date, kind, ref) {
out.byKey[key] = (out.byKey[key] || 0) + q;
(out.datedByKey[key] = out.datedByKey[key] || []).push({ qty: q, date: date, kind: kind, ref: ref });
if (out.rows.length < 50) out.rows.push({ key: key, kind: kind, ref: ref, qty: q, date: date });
}
var lineById = {};
lines.forEach(function (l) { var id = weeklyAiPlanStr_(l.allocation_draft_line_id); if (id) lineById[id] = l; });
function warn(code, ref, qty, detail) { if (out.warnings.length < 200) out.warnings.push({ code: code, ref: ref, qty: qty, detail: detail || null }); }
// D5-V3-R2 (review m2): open plans are resolved FIRST; the draft lines they name are then counted through the plan only.
// D5-V3-R3 (review R2-E): ... and the draft lines named by a plan already TRANSFERRED to a Shipment (transfer stamp set, or
// status completed; not cancelled/rejected) are counted by that Shipment in the gap - never netted again here (D6, once).
var openPlan0 = { draft: 1, pending_approval: 1, approved: 1 }, openPlanIds = {}, draftByOpenPlan = {}, shippedPlanIds = {}, draftByShippedPlan = {};
plans.forEach(function (p) { var st = weeklyAiPlanStr_(p.status).toLowerCase();
var xfer = !!(weeklyAiPlanStr_(p.transferred_shipment_id) || weeklyAiPlanStr_(p.transferred_to_shipment_at));
if (openPlan0[st] && !xfer) openPlanIds[weeklyAiPlanStr_(p.shipping_plan_id)] = 1;
else if ((xfer || st === 'completed') && st !== 'cancelled' && st !== 'rejected') shippedPlanIds[weeklyAiPlanStr_(p.shipping_plan_id)] = weeklyAiPlanStr_(p.transferred_shipment_id) || 'TRANSFERRED'; });
planLines.forEach(function (pl) { var pid = weeklyAiPlanStr_(pl.shipping_plan_id); if (!openPlanIds[pid] && !shippedPlanIds[pid]) return;
var m0 = /(?:^|\|)line:([^|]+)/.exec(weeklyAiPlanStr_(pl.source_reason)); if (!m0) return;
if (openPlanIds[pid]) draftByOpenPlan[weeklyAiPlanStr_(m0[1])] = 1; else draftByShippedPlan[weeklyAiPlanStr_(m0[1])] = { plan: pid, shipment: shippedPlanIds[pid] }; });
var byId = {};
headers.forEach(function (h) {
var st = weeklyAiPlanStr_(h.status).toLowerCase();
if (termH[st]) { out.excluded.terminal_header++; return; }
if (weeklyAiPlanStr_(h.company) !== co || weeklyAiPlanStr_(h.country) !== ct) { out.excluded.scope_mismatch++; return; }
if (replaced[weeklyAiPlanStr_(h.allocation_draft_id)]) { out.excluded.ai_replaced_header++; return; }
byId[weeklyAiPlanStr_(h.allocation_draft_id)] = h;
out.header_count++;
});
lines.forEach(function (l) {
var h = byId[weeklyAiPlanStr_(l.allocation_draft_id)];
if (!h) { out.excluded.no_header++; return; }
var ls = weeklyAiPlanStr_(l.line_status).toLowerCase();
if (termL[ls]) { out.excluded.terminal_line++; return; }
if (draftByOpenPlan[weeklyAiPlanStr_(l.allocation_draft_line_id)]) { out.excluded.draft_counted_by_plan++; return; }
var _ds = draftByShippedPlan[weeklyAiPlanStr_(l.allocation_draft_line_id)];
if (_ds) { out.excluded.draft_counted_by_shipment++; warn('DRAFT_LINE_OPEN_AFTER_SHIPMENT', weeklyAiPlanStr_(l.allocation_draft_line_id), weeklyAiPlanQty_(l.planned_qty), { shipping_plan_id: _ds.plan, shipment_id: _ds.shipment }); return; }
var q = weeklyAiPlanQty_(l.planned_qty);
if (q === null || q <= 0) { out.excluded.blank_qty++; return; }
var mk = weeklyAiPlanStr_(h.marketplace), sku = weeklyAiPlanStr_(l.sku);
if (!mk || mk.toUpperCase() === 'MULTI' || !sku) { out.excluded.no_owner++; warn('COMMITMENT_OWNER_UNKNOWN', weeklyAiPlanStr_(l.allocation_draft_line_id), q); return; }
var d = availDate(l); if (!d) { out.excluded.no_date++; warn('COMMITMENT_DATE_UNKNOWN', weeklyAiPlanStr_(l.allocation_draft_line_id), q);
if (weeklyAiPlanStr_(l.source_warehouse_id) || weeklyAiPlanStr_(h.recommended_source_warehouse_id)) hold(co + '|' + ct + '|' + mk + '|' + sku, 'DRAFT', weeklyAiPlanStr_(l.allocation_draft_line_id), q, 'COMMITMENT_DATE_UNKNOWN', mk, sku);   // A2-D14C
return; }
if (!weeklyAiPlanStr_(l.source_warehouse_id) && !weeklyAiPlanStr_(h.recommended_source_warehouse_id)) { out.excluded.no_supply_basis++; warn('COMMITMENT_SUPPLY_BASIS_UNKNOWN', weeklyAiPlanStr_(l.allocation_draft_line_id), q); return; }
add(co + '|' + ct + '|' + mk + '|' + sku, q, d, 'DRAFT', weeklyAiPlanStr_(l.allocation_draft_line_id));
out.line_count++;
});
var openPlan = { draft: 1, pending_approval: 1, approved: 1 }, planById = {};
plans.forEach(function (p) {
var st = weeklyAiPlanStr_(p.status).toLowerCase();
if (!openPlan[st]) { out.excluded.plan_not_open++; return; }
if (weeklyAiPlanStr_(p.transferred_shipment_id) || weeklyAiPlanStr_(p.transferred_to_shipment_at)) { out.excluded.plan_transferred++; return; }
if (weeklyAiPlanStr_(p.company) !== co || weeklyAiPlanStr_(p.country) !== ct) { out.excluded.scope_mismatch++; return; }
planById[weeklyAiPlanStr_(p.shipping_plan_id)] = p;
});
planLines.forEach(function (pl) {
var p = planById[weeklyAiPlanStr_(pl.shipping_plan_id)]; if (!p) return;
var q = weeklyAiPlanQty_(pl.approved_qty);
if (q === null || q <= 0) { out.excluded.blank_qty++; return; }
var mk = weeklyAiPlanStr_(pl.marketplace) || weeklyAiPlanStr_(p.marketplace), sku = weeklyAiPlanStr_(pl.sku);
var plRef = weeklyAiPlanStr_(pl.shipping_plan_line_id);
if (!mk || mk.toUpperCase() === 'MULTI' || !sku) { out.excluded.no_owner++; warn('COMMITMENT_OWNER_UNKNOWN', plRef, q); return; }
var m = /(?:^|\|)line:([^|]+)/.exec(weeklyAiPlanStr_(pl.source_reason));
var src = m ? lineById[weeklyAiPlanStr_(m[1])] : null;
// D5-V3-R2 (review m3): a plan line without draft lineage (e.g. a manual submit) cannot be dated -> NOT netted and NOT
// guessed, but an explicit, user-visible warning (harvest.commitment_warnings) names it with its quantity.
if (!src) { out.excluded.plan_no_lineage++; warn('COMMITMENT_LINEAGE_UNKNOWN', plRef, q, { shipping_plan_id: weeklyAiPlanStr_(p.shipping_plan_id), sku: sku, marketplace: mk, source_reason: weeklyAiPlanStr_(pl.source_reason).slice(0, 80) });
if (weeklyAiPlanStr_(p.source_warehouse_id)) holdPlan(co + '|' + ct + '|' + mk + '|' + sku, plRef, q, 'COMMITMENT_LINEAGE_UNKNOWN', mk, sku, p.shipping_plan_id);   // A2-D14C r2: held only when no dated Shipment exists
return; }
var d = availDate(src); if (!d) { out.excluded.no_date++; warn('COMMITMENT_DATE_UNKNOWN', plRef, q);
if (weeklyAiPlanStr_(p.source_warehouse_id)) holdPlan(co + '|' + ct + '|' + mk + '|' + sku, plRef, q, 'COMMITMENT_DATE_UNKNOWN', mk, sku, p.shipping_plan_id);   // A2-D14C r2
return; }
if (!weeklyAiPlanStr_(p.source_warehouse_id)) { out.excluded.no_supply_basis++; warn('COMMITMENT_SUPPLY_BASIS_UNKNOWN', plRef, q); return; }
add(co + '|' + ct + '|' + mk + '|' + sku, q, d, 'PLAN', weeklyAiPlanStr_(pl.shipping_plan_line_id));
out.plan_line_count++;
});
// A2-D14C: the AI draft THIS run would replace holds a line of a held key -> that site (marketplace) is held as a whole: replacing
// the draft would replace the held key's plan, and the replace / expire unit is the site draft.
// A2-Q1 (r4): the same check for SKUs whose live line is A0-BLOCKED (replaceCtx.a0Keys, from the harvest): the site's AI draft is kept.
var a0K = (rc.a0Keys && typeof rc.a0Keys === 'object') ? rc.a0Keys : {};
if (Object.keys(out.hold.byKey).length || Object.keys(a0K).length) { var repHdr = {}; headers.forEach(function (h9) { var id9 = weeklyAiPlanStr_(h9.allocation_draft_id); if (replaced[id9] && !termH[weeklyAiPlanStr_(h9.status).toLowerCase()] && weeklyAiPlanStr_(h9.company) === co && weeklyAiPlanStr_(h9.country) === ct) repHdr[id9] = weeklyAiPlanStr_(h9.marketplace); });
lines.forEach(function (l9) { var m9 = repHdr[weeklyAiPlanStr_(l9.allocation_draft_id)]; if (m9 === undefined || termL[weeklyAiPlanStr_(l9.line_status).toLowerCase()]) return;
var k9 = co + '|' + ct + '|' + m9 + '|' + weeklyAiPlanStr_(l9.sku); if (out.hold.byKey[k9]) out.hold.replacedHeldMarketplaces[m9] = 1; if (a0K[k9]) out.hold.a0HeldMarketplaces[m9] = 1; }); }
out.ok = true;
return out;
}











// A2-D14C (Owner D14 = (c), 2026-11-19) - COMMITMENT DATE HOLD. One authority for every AI Plan entry point in this file:
// MANUAL_REGENERATE and SCHEDULED_REFRESH both enter through handleGenerateWeeklyAiPlanDraft_ (harvest -> HOLD filter ->
// K2 writer -> 69_ expiry), and the controlled decision reads the same decision builder. Read-only: it never writes,
// deletes a draft, releases a reservation or changes stock, and it never changes a netting quantity - the undated
// commitment stays out of the netting exactly as before. It only decides which demand produces NO suggestion:
//   * a held KEY (company|country|marketplace|sku with a valid commitment whose date cannot be determined): its site line
//     is removed before allocation - nothing is suggested, written, submitted or replaced for it;
//   * a held SITE (marketplace): the AI draft this run would replace holds a line of a held key, so no line of that
//     marketplace enters the run and its drafts are not expired (expiry follows the applied / requested marketplace;
//     a run with nothing left outside the HOLD returns AI_PLAN_COMMITMENT_HOLD before the writer).
// Filling the date and re-running releases the HOLD: it is recomputed from the current rows on every run, stored nowhere.
var WAP_COMMITMENT_HOLD_CODE_ = 'AI_PLAN_COMMITMENT_HOLD';
var WAP_COMMITMENT_HOLD_MESSAGE_ = 'Commitment date unknown — please fill dates (承諾日期未知，請補日期)';
function weeklyAiPlanCommitmentHold_(planned, scope, target, sites) {
var hb = (planned && planned.hold) || { byKey: {}, replacedHeldMarketplaces: {} };
var co = weeklyAiPlanStr_(scope && scope.company), ct = weeklyAiPlanStr_(scope && scope.country), tm = {}, anyT = false;
((target && target.scopes) || []).forEach(function (e) { var m = weeklyAiPlanStr_(e && e.marketplace); if (m) { tm[m] = 1; anyT = true; } });
var keys = Object.keys(hb.byKey || {}).sort().map(function (k) { return hb.byKey[k]; }).filter(function (x) { return !anyT || tm[x.marketplace]; });
var whole = Object.keys(hb.replacedHeldMarketplaces || {}).filter(function (m) { return !anyT || tm[m]; }).sort();
var a0Sites = Object.keys(hb.a0HeldMarketplaces || {}).filter(function (m) { return !anyT || tm[m]; }).sort();   // A2-Q1 (r4)
var keySet = {}, siteSet = {}; keys.forEach(function (x) { keySet[x.key] = 1; }); whole.concat(a0Sites).forEach(function (m) { siteSet[m] = 1; });
function isHeld(m, sku) { m = weeklyAiPlanStr_(m); return !!(siteSet[m] || keySet[co + '|' + ct + '|' + m + '|' + weeklyAiPlanStr_(sku)]); }
var all = sites || [], removed = all.filter(function (st) { return isHeld(st && st.marketplace, st && st.sku); }).length, active = keys.length > 0;
var a0Active = a0Sites.length > 0;
return { isHeld: isHeld, report: { active: active, code: active ? WAP_COMMITMENT_HOLD_CODE_ : (a0Active ? WAP_A0_SITE_HOLD_CODE_ : null), message: active ? WAP_COMMITMENT_HOLD_MESSAGE_ : (a0Active ? WAP_A0_SITE_HOLD_MESSAGE_ : null),
a0_active: a0Active, a0_held_sites: a0Sites,
held_keys: keys.map(function (x) { return { key: x.key, marketplace: x.marketplace, sku: x.sku, commitments: x.commitments.slice(0, 20), commitment_qty: x.commitments.reduce(function (a, c) { return a + (Number(c.qty) || 0); }, 0) }; }),
held_key_count: keys.length, held_sites: whole, not_held_dated_by_shipment: (hb.datedByShipment || []).slice(0, 20), site_lines_removed: removed, site_lines_remaining: all.length - removed,
// A2-D14C r3 (D17 = a, limited): a site HOLD covers only the site whose own AI draft (the replace unit) holds a line of a held key; every
// held site line is listed with its SKU and why (KEY = its own undated commitment, SITE = same site as such a key) - other sites run.
affected_site_lines: all.filter(function (st) { return isHeld(st && st.marketplace, st && st.sku); }).slice(0, 200).map(function (st) { var k9 = co + '|' + ct + '|' + weeklyAiPlanStr_(st.marketplace) + '|' + weeklyAiPlanStr_(st.sku); return { marketplace: weeklyAiPlanStr_(st.marketplace), sku: weeklyAiPlanStr_(st.sku), held_by: keySet[k9] ? 'KEY' : 'SITE' }; }),
blocks_run: (active || a0Active) && (all.length - removed) === 0, netting_unchanged: true, writes: 0,
rule: 'A2-D14C: a valid commitment without a determinable destination-availability date (expected_arrival, else required_by_date) holds its key; no suggestion, draft, submit or replacement for it until the date is filled and the plan is re-run' } };
}
// A2-Q1 (r4): a site whose existing AI draft holds a line of an A0-BLOCKED SKU (share / warehouse company unknown) is kept the same way.
var WAP_A0_SITE_HOLD_CODE_ = 'AI_PLAN_SITE_A0_BLOCKED';
var WAP_A0_SITE_HOLD_MESSAGE_ = 'Warehouse share unknown — this site is BLOCKED; its existing AI plan is kept (倉庫份額未知，此站已暫停；保留既有 AI 計畫)';
function weeklyAiPlanCommitmentHoldResponse_(hold, ctx) {
ctx = ctx || {};
var list = (hold.held_keys || []).slice(0, 10).map(function (x) { return x.marketplace + '/' + x.sku + ' (' + x.commitments.map(function (c) { return c.ref + ' ' + c.qty; }).join(', ') + ')'; }).join('; ');
var siteList = (hold.held_sites || []).map(function (m) { var sk = (hold.affected_site_lines || []).filter(function (x) { return x.marketplace === m; }).map(function (x) { return x.sku; }); return m + ' (whole site: its AI draft holds a held key' + (sk.length ? '; SKUs ' + sk.join(', ') : '') + ')'; }).join('; ');   // A2-D14C r3
var a0List = (hold.a0_held_sites || []).join(', ');   // A2-Q1 (r4)
var msg = (hold.active ? WAP_COMMITMENT_HOLD_MESSAGE_ + ': ' + list + (siteList ? ' | site HOLD: ' + siteList : '') : WAP_A0_SITE_HOLD_MESSAGE_) + (a0List ? ' | A0-BLOCKED site(s) kept: ' + a0List : '') + '. Nothing was created, changed, submitted or replaced.';
var codeR = hold.active ? WAP_COMMITMENT_HOLD_CODE_ : WAP_A0_SITE_HOLD_CODE_;   // A2-Q1 (r4)
return { success: false, errors: [weeklyAiPlanErr_(codeR, msg, { commitment_hold: hold, db_writes: 0 })],
data: { status: 'HOLD', job_status: 'COMMITMENT_HOLD', outcome: hold.active ? 'COMMITMENT_HOLD' : 'SITE_A0_BLOCKED', code: codeR, message: msg, commitment_hold: hold,
planning_cycle: ctx.planning_cycle || null, scope: ctx.scope || null, mode: ctx.mode || null,
header_created: false, line_created: false, writer_reached: false, db_writes: 0, expired_headers: 0, expired_lines: 0, routes: [], route_count: 0 } };
}
function weeklyAiPlanResidualQty_(recommendedQty, plannedQty) {
var r = weeklyAiPlanQty_(recommendedQty);
if (r === null) return null;
var p = weeklyAiPlanQty_(plannedQty);
if (p === null) p = 0;
var d = r - p;
return d > 0 ? d : 0;
}















// D5-V3: when datedByKey is supplied, a window is netted ONLY by the commitments available on or before that window's
// required-by date (a commitment arriving later cannot cover that window). Without it the undated total is used (legacy).
function weeklyAiPlanNetSitesByResidual_(sites, plannedByKey, scope, datedByKey) {
var report = { applied: true, netted_site_count: 0, fully_covered_site_count: 0, by_key: [] };
(sites || []).forEach(function (st) {
var key = weeklyAiPlanStr_(scope.company) + '|' + weeklyAiPlanStr_(scope.country) + '|'
+ weeklyAiPlanStr_(st.marketplace) + '|' + weeklyAiPlanStr_(st.sku);
var planned = weeklyAiPlanQty_((plannedByKey || {})[key]);
st.qualifyingPlannedQty = planned === null ? 0 : planned;
st.grossGapByWindow = st.cumulativeGapByWindow || {};
if (planned === null || planned <= 0) { st.residualGapByWindow = st.grossGapByWindow; return; }
var net = {}, netGap = {}, anyPositive = false, changed = false;
for (var w in st.grossGapByWindow) {
if (!Object.prototype.hasOwnProperty.call(st.grossGapByWindow, w)) continue;
var g = weeklyAiPlanQty_(st.grossGapByWindow[w]);
if (g === null) { net[w] = st.grossGapByWindow[w]; continue; }
var gb = (st.netBasisGapByWindow && st.netBasisGapByWindow[w] != null) ? weeklyAiPlanQty_(st.netBasisGapByWindow[w]) : null;
var plannedW = planned;
if (datedByKey) {
var rb = weeklyAiPlanStr_((st.requiredByByWindow || {})[w]);
if (/^\d{4}-\d{2}-\d{2}$/.test(rb)) { plannedW = 0; ((datedByKey || {})[key] || []).forEach(function (c) { if (c.date && c.date <= rb) plannedW += c.qty; }); }
}
var v;
if (!(plannedW > 0)) v = g;
else if (gb !== null) { var ng = gb - plannedW; if (ng < 0) ng = 0; netGap[w] = ng; v = weeklyAiPlanCartonRound_(ng, st.unitsPerCarton); if (v === null || v > g) v = Math.min(g, Math.max(0, g - plannedW)); }
else { v = g - plannedW; if (v < 0) v = 0; }
if (v !== g) changed = true;
net[w] = v;
if (v > 0) anyPositive = true;
}
st.residualGapByWindow = net;
st.netGapByWindow = netGap;
st.cumulativeGapByWindow = net;
if (changed) report.netted_site_count++;
if (!anyPositive) report.fully_covered_site_count++;
if (report.by_key.length < 50) {
report.by_key.push({ key: key, marketplace: st.marketplace, sku: st.sku,
qualifying_planned_qty: planned, gross: st.grossGapByWindow, residual: net });
}
});
return report;
}













function weeklyAiPlanNoActionDecision_(recState, planned) {
var out = { noAction: false, reason: null, code: WAP_NO_ACTION_CODE_,
recommendation_state: recState ? recState.state : null,
recommended_qty: recState ? recState.recommended_qty_total : null,
qualifying_planned_qty: 0, residual_qty: null, per_scope: [] };
if (!recState || recState.state === WAP_RECOMMENDATION_STATES_.MISSING) {
out.reason = 'MISSING_RECOMMENDATION';
out.missing_reasons = (recState && recState.missing_reasons) || [];
return out;
}
var totalPlanned = 0, totalResidual = 0, anyResidual = false;
var _chD = (planned && planned.commitmentHold && (planned.commitmentHold.active || planned.commitmentHold.a0_active)) ? planned.commitmentHold : null, _hkD = {}, _hsD = {}, _heldN = 0;   // A2-D14C
if (_chD) { (_chD.held_keys || []).forEach(function (x) { _hkD[x.key] = 1; }); (_chD.held_sites || []).concat(_chD.a0_held_sites || []).forEach(function (m) { _hsD[m] = 1; }); }
(recState.per_scope || []).forEach(function (s) {
var key = s.key;
if (_chD && (_hkD[key] || _hsD[weeklyAiPlanStr_(s.marketplace)])) { _heldN++; out.per_scope.push({ key: key, marketplace: s.marketplace, sku: s.sku, recommended_qty: s.recommended_qty, qualifying_planned_qty: null, residual_qty: null, held: true, hold_code: WAP_COMMITMENT_HOLD_CODE_ }); return; }
var p = weeklyAiPlanQty_((planned && planned.byKey) ? planned.byKey[key] : null);
if (p === null) p = 0;
var residual = weeklyAiPlanResidualQty_(s.recommended_qty, p);
totalPlanned += p;
if (residual !== null) { totalResidual += residual; if (residual > 0) anyResidual = true; }
out.per_scope.push({ key: key, marketplace: s.marketplace, sku: s.sku,
recommended_qty: s.recommended_qty, qualifying_planned_qty: p, residual_qty: residual,
over_planned_qty: (s.recommended_qty !== null && p > s.recommended_qty) ? (p - s.recommended_qty) : 0 });
});
out.qualifying_planned_qty = totalPlanned;
if (_chD) { out.commitment_hold = { held_scope_count: _heldN, code: WAP_COMMITMENT_HOLD_CODE_, message: WAP_COMMITMENT_HOLD_MESSAGE_, report: _chD }; if (!anyResidual && _heldN && _heldN === out.per_scope.length) { out.residual_qty = totalResidual; out.reason = 'COMMITMENT_DATE_HOLD'; return out; } }   // A2-D14C: all held -> never 'covered'
out.residual_qty = totalResidual;
if (anyResidual) { out.reason = 'RESIDUAL_REMAINS'; return out; }
out.noAction = true;
out.reason = (recState.state === WAP_RECOMMENDATION_STATES_.VALID_ZERO)
? 'VALID_ZERO_RECOMMENDATION' : 'FULLY_COVERED_BY_ACTIVE_PLAN';
return out;
}








// D5-V3-R3 (review R2-A): the three READ-ONLY harvest diagnostic groups - destination-choice suggestions (OD-2),
// commitment warnings (D6 / review m3) and factory pool issues (OD-3 / review M1) - ride on EVERY response that follows
// a harvest (generated, NO_ACTION, NO_DEMAND, not-ready, refusals), not only on HARVEST_NOT_READY. Success / data-bearing
// responses carry them as data.harvest_diagnostics; a response without a data object carries them at the top level.
// They never change an outcome, a quantity or a write.
function weeklyAiPlanHarvestDiagnostics_(h) {
h = h || {};
var pend = Array.isArray(h.pendingDestination) ? h.pendingDestination : [];
var qp = h.qualifyingPlanned || null;
var cw = (qp && Array.isArray(qp.warnings)) ? qp.warnings : [];
var pi = Array.isArray(h.poolIssues) ? h.poolIssues : [];
return { read_only: true, harvest_ok: h.ok === true,
pending_destination_suggestions: pend.slice(0, 500), pending_destination_count: pend.length,
commitment_warnings: cw.slice(0, 200), commitment_warning_count: cw.length,
commitment_excluded: (qp && qp.excluded) || null,
pool_issues: pi.slice(0, 200), pool_issue_count: pi.length,
supply_understated_warnings: (Array.isArray(h.supplyUnderstated) ? h.supplyUnderstated : []).slice(0, 200), supply_understated_count: Array.isArray(h.supplyUnderstated) ? h.supplyUnderstated.length : 0 };   // P3PL-2 r3
}
// A-delta1 C5 (Owner 2026-11-21): the AI user summary reads b4's line fields AS ORDER PLANNING MATERIALIZED THEM, so the AI dialog, the
// Order Planning table, the Request Order page (which renders this same stored note) and the 74_ allocation preview show the same numbers
// from the same source version. 43_ writes one order_planning_gap row per (company, country, marketplace, SKU) from the 42_ OP line:
// t*_gap_qty = remainingGapQty (platform need), t*_suggested_qty = suggestedOrderQty (factory net, carton-rounded), and the note segments
// OVERSEAS_TRANSFER_SUGGESTED = per-tier overseasCoveredQty; b5: FACTORY_SHIP = factoryShipQty, FROM_FACTORY_STOCK = factoryShipFromStockQty,
// NEW_PURCHASE = newPurchaseQty (= residualOrderNeedQty; a b4 row carries FACTORY_NET_NEED instead) (only when a transfer or factory stock
// exists), OVERSEAS_POOL_HELD = held pools; the leg marker is mLine.overseasTransfer (legDate UNKNOWN, FBA_LEG_UNDECIDED_B_Q1,
// platformSellable false). Read-only, one sheet read, on a SUCCESSFUL answer only. The AI path itself never builds the OP supply allocation
// (that is the OP batch's job), so the live AI workspace line carries no transfer: reading the stored row is the only same-version source.
// Nothing is computed beyond sums and per-tier parsing; a value the row does not store stays null (never guessed).
function weeklyAiPlanOpSeg_(note, code) {
  var n = String(note == null ? '' : note), i = n.indexOf(code); if (i < 0) return '';
  var r = n.slice(i + code.length), c = r.indexOf(': '); if (c < 0) return '';
  var v = r.slice(c + 2), e = v.indexOf(' | '); return (e < 0 ? v : v.slice(0, e)).trim();
}
function weeklyAiPlanOpTierMap_(seg) {
  var m = {}; String(seg || '').split(',').forEach(function (p) { var k = p.indexOf('='); if (k < 1) return; var t = p.slice(0, k).trim(), v = Number(p.slice(k + 1)); if (/^T[1-4]$/.test(t) && isFinite(v)) m[t] = v; });
  return m;
}
function weeklyAiPlanOpBasis_(ss, scope, marketplaces) {
  var out = { ok: false, reason: null, lines: [] }, rows;
  var S = function (v) { return String(v == null ? '' : v).trim(); }, N = function (v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; };
  try { rows = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'order_planning_gap') : null; } catch (e) { out.reason = 'ORDER_PLANNING_ROWS_UNREADABLE'; return out; }
  if (!Array.isArray(rows)) { out.reason = 'ORDER_PLANNING_ROWS_UNREADABLE'; return out; }
  var mk = {}, anyMk = false; (marketplaces || []).forEach(function (m) { if (S(m)) { mk[S(m)] = 1; anyMk = true; } });
  rows.forEach(function (r) {
    if (S(r.company) !== S(scope.company) || S(r.country) !== S(scope.country)) return;
    if (anyMk && !mk[S(r.marketplace)]) return;
    var note = S(r.note), st = S(r.calculation_status).toUpperCase();
    var seg = function (c) { return weeklyAiPlanOpSeg_(note, c); };
    var segT = seg('OVERSEAS_TRANSFER_SUGGESTED'), segS = seg('FACTORY_SHIP'), segK = seg('FROM_FACTORY_STOCK'), segN = seg('NEW_PURCHASE') || seg('FACTORY_NET_NEED'), segH = seg('OVERSEAS_POOL_HELD');
    var tm = weeklyAiPlanOpTierMap_(segT), sm = weeklyAiPlanOpTierMap_(segS), km = weeklyAiPlanOpTierMap_(segK), nm = weeklyAiPlanOpTierMap_(segN);
    // b5 field contract: no segment at all = no transfer and no factory stock in any tier, so ship = need, from stock 0, new purchase = need
    var derived = !segT && !segS && !segK && !segN;
    var cd = (/CALC D=(\d{4}-\d{2}-\d{2})/.exec(note) || [])[1] || null, run = (/RUN=([A-Za-z0-9_-]+)/.exec(note) || [])[1] || null;
    var L = { marketplace: S(r.marketplace), sku: S(r.sku), status: st, calculation_month: S(r.calculation_month) || null, calculation_date: cd, run_id: run, calculated_at: S(r.calculated_at) || null,
      layers_source: derived ? 'DERIVED_NO_TRANSFER_NO_STOCK' : 'NOTE_SEGMENTS', tiers: [], platform_need_qty: 0, overseas_transfer_qty: 0, factory_ship_qty: 0, factory_ship_from_stock_qty: 0, new_purchase_qty: 0, layers_known: true, suggested_qty: 0,
      leg: segT ? { legDate: 'UNKNOWN', reason: 'FBA_LEG_UNDECIDED_B_Q1', platformSellable: false } : null,
      note_segments: { OVERSEAS_TRANSFER_SUGGESTED: segT || null, FACTORY_SHIP: segS || null, FROM_FACTORY_STOCK: segK || null, NEW_PURCHASE: segN || null, OVERSEAS_POOL_HELD: segH || null } };
    if (st === 'READY') ['T1', 'T2', 'T3', 'T4'].forEach(function (T) {
      var t = T.toLowerCase(), g = N(r[t + '_gap_qty']), sg = N(r[t + '_suggested_qty']), ov = tm[T] || 0;
      var fs = derived ? g : (segS ? (sm[T] !== undefined ? sm[T] : null) : null), fk = derived ? 0 : ((segS || segK) ? (km[T] || 0) : null), np = derived ? g : (segN ? (nm[T] !== undefined ? nm[T] : null) : null);
      L.tiers.push({ tier: T, month: S(r[t + '_month']) || null, platform_need: g, overseas_transfer: ov, factory_ship: fs, from_factory_stock: fk, new_purchase: np, suggested: sg });
      L.platform_need_qty += g || 0; L.overseas_transfer_qty += ov; L.suggested_qty += sg || 0;
      if (fs === null || fk === null || np === null) L.layers_known = false; else { L.factory_ship_qty += fs; L.factory_ship_from_stock_qty += fk; L.new_purchase_qty += np; }
    });
    if (!L.layers_known) { L.factory_ship_qty = null; L.factory_ship_from_stock_qty = null; L.new_purchase_qty = null; }
    if (out.lines.length < 200) out.lines.push(L);
  });
  out.ok = true;
  if (!out.lines.length) out.reason = 'NO_ORDER_PLANNING_ROW_FOR_SCOPE';
  return out;
}
// A-delta1 C4 -> C5: the user summary (V2). Numbers for "overseas transfer / factory need" come from Order Planning (b4 line fields, above);
// what THIS AI run planned comes from its own route tranches (source warehouse x quantity) and its unresolved production need. When no READY
// Order Planning row exists for the scope, the summary falls back to the AI plan's own allocation and says so (basis AI_PLAN_LINES).
function weeklyAiPlanUserSummary_(h, d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  var whById = (h && h.warehousesById) || {}, num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; }, S = function (v) { return String(v == null ? '' : v).trim(); };
  var facIds = {}; try { Object.keys(WEEKLY_AI_PLAN_FACTORY_IDENTITY_ || {}).forEach(function (k) { facIds[WEEKLY_AI_PLAN_FACTORY_IDENTITY_[k]] = 1; }); } catch (eF) {}
  var isFac = function (wh, role) { if (role) return /^FACTORY/.test(role); var w = whById[wh] || null; return !!facIds[wh] || !!(w && (/^(true|yes|1|y)$/i.test(S(w.is_factory_warehouse)) || S(w.warehouse_type).toUpperCase() === 'FACTORY')); };
  // ---- this AI run: tranches (61_ conservation[].method_advice.tranches) - else the c4 line walk
  var pa = { overseas_qty: 0, factory_qty: 0, unsourced_qty: 0, overseas_sources: [], production_need_qty: num(d.unresolvedProductionNeedQty), tranches: [], source: 'NONE' }, bySrc = {}, seen = 0, risk = [];
  var take = function (wh, q, role, sku, win, refused) { if (q <= 0) return; seen++; if (!wh) { pa.unsourced_qty += q; return; } if (isFac(wh, role)) pa.factory_qty += q; else { pa.overseas_qty += q; bySrc[wh] = (bySrc[wh] || 0) + q; }
    if (pa.tranches.length < 50) pa.tranches.push({ sku: sku, window_code: win, source_warehouse_id: wh, quantity: q });
    if (refused) risk.push({ code: 'SOURCE_SPLIT_REFUSED', sku: sku, reason: refused }); };
  (Array.isArray(d.conservation) ? d.conservation : []).forEach(function (c) { var tr = c && c.method_advice && Array.isArray(c.method_advice.tranches) ? c.method_advice.tranches : [];
    tr.forEach(function (t) { pa.source = 'ROUTE_TRANCHES'; take(S(t && t.source_warehouse_id), num(t && t.quantity), '', S(t && t.sku), S(t && t.window_code), ''); }); });
  if (pa.source === 'NONE') {
    var walk = function (arr) { (Array.isArray(arr) ? arr : []).forEach(function (g) { (g && Array.isArray(g.lines) ? g.lines : [g]).forEach(function (ln) { if (!ln || typeof ln !== 'object') return;
      var q = num(ln.planned_qty != null ? ln.planned_qty : ln.qty); if (q > 0) pa.source = 'ANSWER_LINES'; take(S(ln.source_warehouse_id), q, S(ln.source_role).toUpperCase(), S(ln.sku), S(ln.window_code), S(ln.source_split_refused_reason)); }); }); };
    walk(d.routes); walk(d.groups); walk(d.lines);
  }
  pa.overseas_sources = Object.keys(bySrc).sort().map(function (k) { return { warehouse_id: k, warehouse_code: S((whById[k] || {}).warehouse_code), qty: bySrc[k] }; });
  // ---- Order Planning (b4 line fields as materialized)
  var sc = d.applied_scope || d.scope || {}, scope = { company: S(sc.company), country: S(sc.country) };
  var mks = Array.isArray(sc.marketplaces) ? sc.marketplaces : (sc.marketplace ? [sc.marketplace] : []);
  var ss = null; try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (eSs) { ss = null; }
  var op = (ss && scope.company && scope.country) ? weeklyAiPlanOpBasis_(ss, scope, mks) : { ok: false, reason: 'SCOPE_OR_SPREADSHEET_UNAVAILABLE', lines: [] };
  var ready = op.lines.filter(function (l) { return l.status === 'READY'; });
  var acc = (h && h.recommendationState && h.recommendationState.accepted_calculation_date) || d.accepted_calculation_date || null;
  var out = { kind: 'AI_PLAN_USER_SUMMARY_V2', basis: ready.length ? 'ORDER_PLANNING_ROW' : 'AI_PLAN_LINES', basis_reason: ready.length ? null : (op.reason || 'NO_READY_ORDER_PLANNING_ROW'),
    overseas_transfer_qty: 0, factory_need_before_overseas: null, factory_need_after_overseas: null, factory_suggested_after_overseas: null, platform_need_qty: null,
    factory_ship_qty: null, factory_ship_from_stock_qty: null, new_purchase_qty: null, new_purchase_suggested_qty: null,   // b5 layers (Order Planning row fields, never recomputed)
    leg_note: null, platform_sellable: false, held_pools_note: null,
    factory_qty: pa.factory_qty, unsourced_qty: pa.unsourced_qty, overseas_sources: pa.overseas_sources,
    order_planning: { lines: op.lines.slice(0, 50), reason: op.reason || null }, plan_allocation: pa,
    held_unknown_leg_qty: 0, held_unknown_leg: [], held_pools: [], shortage_risk: risk,
    rule: 'Order Planning layers (b5): platform need = overseas transfer + factory ship; factory ship = from factory stock + new purchase (carton-rounded = suggested, what RO/PO buy). The transfer (FBA leg date unknown) and factory stock are not platform sellable before arrival. This AI plan: overseas 3PL -> platform first from AVAILABLE overseas stock; factory covers the remainder.',
    source_version: { source_data_as_of: S(d.source_data_as_of || (h && h.sourceDataAsOf)), accepted_gap_calculation_date: acc, order_planning_calculation_date: null, order_planning_run_id: null, order_planning_calculated_at: null, same_calculation_date: null } };
  if (ready.length) {
    var known = ready.every(function (l) { return l.layers_known; }), dates = {}, runs = {};
    out.overseas_transfer_qty = 0; out.factory_suggested_after_overseas = 0; out.platform_need_qty = 0;
    ready.forEach(function (l) { out.overseas_transfer_qty += l.overseas_transfer_qty; out.factory_suggested_after_overseas += l.suggested_qty; out.platform_need_qty += l.platform_need_qty; dates[l.calculation_date || ''] = 1; runs[l.run_id || ''] = 1;
      if (!out.leg_note && l.leg) out.leg_note = { legDate: l.leg.legDate, reason: l.leg.reason, platformSellable: false, text: 'FBA leg date unknown (B-Q1): the transfer is not platform sellable and does not raise DoS; it only lowers the factory net need' };
      if (l.note_segments.OVERSEAS_POOL_HELD && !out.held_pools_note) out.held_pools_note = l.note_segments.OVERSEAS_POOL_HELD; });
    if (known) { var sum = function (k) { return ready.reduce(function (a, l) { return a + l[k]; }, 0); };
      out.factory_ship_qty = sum('factory_ship_qty'); out.factory_ship_from_stock_qty = sum('factory_ship_from_stock_qty'); out.new_purchase_qty = sum('new_purchase_qty');
      out.factory_need_before_overseas = out.platform_need_qty; out.factory_need_after_overseas = out.factory_ship_qty; }
    out.new_purchase_suggested_qty = out.factory_suggested_after_overseas;
    var dk = Object.keys(dates), rk = Object.keys(runs);
    out.source_version.order_planning_calculation_date = dk.length === 1 ? (dk[0] || null) : 'MIXED';
    out.source_version.order_planning_run_id = rk.length === 1 ? (rk[0] || null) : 'MIXED';
    out.source_version.order_planning_calculated_at = ready[0].calculated_at;
    out.source_version.same_calculation_date = !!(acc && dk.length === 1 && dk[0] === String(acc));
    if (!out.source_version.same_calculation_date) risk.push({ code: 'ORDER_PLANNING_VERSION_DIFFERS', note: 'Order Planning calculation date ' + dk.join('/') + ' vs accepted Gap calculation date ' + (acc || 'unknown') });
  } else {
    out.overseas_transfer_qty = pa.overseas_qty; out.factory_need_before_overseas = pa.factory_qty + pa.overseas_qty; out.factory_need_after_overseas = pa.factory_qty;
  }
  var su = (h && Array.isArray(h.supplyUnderstated)) ? h.supplyUnderstated : [];
  su.forEach(function (x) { var q = num(x && (x.held_qty != null ? x.held_qty : x.qty)); out.held_unknown_leg_qty += q; if (out.held_unknown_leg.length < 20) out.held_unknown_leg.push({ sku: S(x && x.sku), marketplace: S(x && x.marketplace), qty: q, warehouse_id: S(x && (x.warehouse_id || x.three_pl)), eta: S(x && (x.eta || x.three_pl_eta)) }); });
  if (out.held_unknown_leg_qty > 0) risk.push({ code: 'SUPPLY_MAY_BE_UNDERSTATED', qty: out.held_unknown_leg_qty, note: 'units on the way to a 3PL for a platform site are not counted as sellable (3PL -> FBA leg unknown, B-Q1)' });
  var hp = (h && Array.isArray(h.heldOverseasPools)) ? h.heldOverseasPools : [];
  hp.forEach(function (x) { var hk = S(x && x.key); if (scope.company && hk.indexOf(scope.company + '||') !== 0 && !(S(x && x.reason) === 'WAREHOUSE_COMPANY_UNKNOWN' && hk.indexOf('||') === 0)) return;
    if (out.held_pools.length < 50) out.held_pools.push({ warehouse_id: S(x && x.warehouseId), sku: S(x && x.sku), reason: S(x && x.reason), qty: (x && typeof x.physicalQty === 'number') ? x.physicalQty : null }); });
  var pi = (h && Array.isArray(h.poolIssues)) ? h.poolIssues.length : 0; if (pi) risk.push({ code: 'POOL_ISSUES', count: pi });
  if (pa.unsourced_qty > 0) risk.push({ code: 'UNSOURCED_QTY', qty: pa.unsourced_qty });
  out.result = { success: d.__c5_success === true, outcome: S(d.__c5_success === true ? ((d.advice && d.advice.outcome) || d.outcome || 'SUCCESS') : (d.job_status || (d.advice && d.advice.outcome) || d.outcome || 'NOT_SUCCESS')), blocked_count: num(d.blocked_count), job_status: S(d.job_status) };
  if (!out.result.success) risk.push({ code: 'AI_PLAN_NOT_COMPLETED', note: 'this AI run did not complete (' + (out.result.outcome || out.result.job_status || 'NOT_SUCCESS') + '); the Order Planning numbers above still apply' });
  out.platform_delivery_date = out.leg_note ? null : undefined;   // never promised while the FBA leg date is unknown (B-Q1)
  delete d.__c5_success;
  out.lines_seen = seen;
  return out;
}
function weeklyAiPlanDiagResponse_(h, resp) {
try {
if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
var dg = weeklyAiPlanHarvestDiagnostics_(h);
var chD = h && h.qualifyingPlanned && h.qualifyingPlanned.commitmentHold;   // A2-D14C: only when a HOLD is active (shape unchanged otherwise)
if (chD && (chD.active || chD.a0_active)) { dg.commitment_hold = chD; if (resp.data && typeof resp.data === 'object' && !Array.isArray(resp.data) && resp.data.commitment_hold === undefined) resp.data.commitment_hold = chD; else if (!resp.data && resp.commitment_hold === undefined) resp.commitment_hold = chD; }
if (resp.data && typeof resp.data === 'object' && !Array.isArray(resp.data)) { if (resp.data.harvest_diagnostics === undefined) resp.data.harvest_diagnostics = dg; if (resp.data.user_summary === undefined) { try { resp.data.__c5_success = (resp.success === true); resp.data.user_summary = weeklyAiPlanUserSummary_(h, resp.data); } catch (eUs) { try { delete resp.data.__c5_success; } catch (eD) {} } } }   // C4: user summary on success
else if (resp.harvest_diagnostics === undefined) resp.harvest_diagnostics = dg;
}
} catch (eDg) { }
return jsonResponse_(resp);
}
// D5-V3-R3 (review R2-B): one carton rule for every netted window - net the GAP first, then round UP to whole cartons
// (KMCALC.calculateSuggestedOrderQty, the same rule that made the suggestion from the gap). No valid carton size -> the
// netted gap is kept unrounded (as before).
function weeklyAiPlanCartonRound_(q, upc) {
var n = Number(q);
if (!isFinite(n)) return null;
if (n <= 0) return 0;
var u = Number(upc);
if (!(isFinite(u) && u > 0 && Math.floor(u) === u)) return n;
try { if (typeof KMCALC !== 'undefined' && KMCALC.calculateSuggestedOrderQty) return KMCALC.calculateSuggestedOrderQty({ netOrderNeed: n, unitsPerCarton: u }); } catch (eR) { }
return Math.ceil(n / u) * u;
}

// D5-V3-R3 (Owner m5 ruling, 2026-11-13): "seeing demand" is not "creating suggestions". The Gap table / chart keep every
// event at its prep date (start - 45); the AI may create the event's replenishment only from the event's first-suggestion
// Monday (the Monday on/before the prep date). 42_ hands the live line the same projection WITHOUT the events whose Monday
// is still ahead (aiHorizons + aiGatedEvents). Per window the event's effect = live gap - AI gap (exact, same projection);
// the canonical gap is reduced by that effect and re-rounded to cartons. From the Monday on nothing is gated (the full
// unmet demand is visible again) and existing commitments are netted once as before, so a rerun neither misses nor
// duplicates. No schema: the gate lives only in this run's memory.
function weeklyAiPlanAiHorizonsOf_(line) {
var ev = (line && Array.isArray(line.aiGatedEvents)) ? line.aiGatedEvents : [];
if (!ev.length) return { ok: true, gated: [], horizons: (line && line.horizons) || [] };
if (!Array.isArray(line.aiHorizons) || !line.aiHorizons.length) return { ok: false, reason: 'AI_HORIZONS_MISSING', gated: ev, horizons: [] };
return { ok: true, gated: ev, horizons: line.aiHorizons };
}
function weeklyAiPlanApplyEventGate_(site, line) {
var ev = (line && Array.isArray(line.aiGatedEvents)) ? line.aiGatedEvents : [];
if (!ev.length) return { ok: true, applied: false };
var ah = weeklyAiPlanAiHorizonsOf_(line); if (!ah.ok) return { ok: false, reason: ah.reason };
var fullBy = {}, aiBy = {};
(line.horizons || []).forEach(function (hz) { var wc = weeklyAiPlanStr_(hz.windowCode); if (wc) fullBy[wc] = weeklyAiPlanQty_(hz.gapQty); });
ah.horizons.forEach(function (hz) { var wc = weeklyAiPlanStr_(hz.windowCode); if (wc) aiBy[wc] = weeklyAiPlanQty_(hz.gapQty); });
var cum = site.cumulativeGapByWindow || {}, basis = site.netBasisGapByWindow || null, eff = {}, before = {};
for (var w in cum) {
if (!Object.prototype.hasOwnProperty.call(cum, w)) continue;
before[w] = cum[w];
var f = (fullBy[w] === undefined) ? null : fullBy[w], a = (aiBy[w] === undefined) ? null : aiBy[w];
if (f === null || a === null) { if (weeklyAiPlanQty_(cum[w]) === null) { eff[w] = null; continue; } return { ok: false, reason: 'AI_GATE_WINDOW_UNRESOLVED:' + w }; }
var e = f - a; if (e < 0) e = 0; eff[w] = e;
if (e <= 0) continue;
var gb = basis ? weeklyAiPlanQty_(basis[w]) : null, c0 = weeklyAiPlanQty_(cum[w]);
if (gb !== null) { var g2 = gb - e; if (g2 < 0) g2 = 0; basis[w] = g2; var r2 = weeklyAiPlanCartonRound_(g2, site.unitsPerCarton); cum[w] = (r2 === null || (c0 !== null && r2 > c0)) ? c0 : r2; }
else if (c0 !== null) { var c2 = c0 - e; cum[w] = c2 < 0 ? 0 : c2; }
}
site.aiEventGate = { applied: true, rule: 'EVENT_FIRST_SUGGESTION_MONDAY', events: ev, eventGapEffectByWindow: eff, beforeGateByWindow: before };
return { ok: true, applied: true };
}

function weeklyAiPlanNoActionResponse_(decision, ctx) {
ctx = ctx || {};
return {
success: true,
data: {
outcome: WAP_NO_ACTION_CODE_,
code: 'NO_REPLENISHMENT_REQUIRED',
no_action_reason: decision.reason,
message: decision.reason === 'FULLY_COVERED_BY_ACTIVE_PLAN'
? 'No action required: the recommended quantity for this scope is already covered by the active'
+ ' Execution Plan. Nothing was created, changed or cancelled.'
: 'No replenishment is required for this scope. Nothing was created, changed or cancelled.',
recommendation_state: decision.recommendation_state,
recommended_qty: decision.recommended_qty,
qualifying_planned_qty: decision.qualifying_planned_qty,
residual_qty: decision.residual_qty,
per_scope: decision.per_scope,
recommendation_authority: ctx.recommendation_authority || null,
planning_cycle: ctx.planning_cycle || null,
scope: ctx.scope || null,
mode: ctx.mode || null,
generation_run_id: ctx.generation_run_id || null,










created_headers: 0, updated_headers: 0, created_lines: 0, updated_lines: 0,
cancelled_headers: 0, cancelled_lines: 0, expired_headers: 0, expired_lines: 0,
reservations: 0,
header_created: false, line_created: false,
route_count: 0, routes: [], groups: [],
requested_qty: decision.recommended_qty, allocated_qty: 0,
db_writes: 0, writer_reached: false,

status: 'COMPLETED', zero_result: true, job_status: 'NO_DEMAND',
site_count: ctx.site_count == null ? null : ctx.site_count,
source_data_as_of: ctx.source_data_as_of || null
},
errors: []
};
}

















































function weeklyAiPlanScopeEmptyRefusal_(decision, ctx) {
ctx = ctx || {};
return { success: false, zero_write: true,
errors: [weeklyAiPlanErr_('REQUESTED_SCOPE_EMPTY',
'requested marketplace produced no allocated lines: ' + weeklyAiPlanStr_(ctx.requested_marketplace)
+ ' (and the canonical recommendation could not be read as a valid zero: ' + decision.reason + ')',
{ recommendation_state: decision.recommendation_state, no_action_reason: decision.reason,
missing_reasons: decision.missing_reasons || [], recommended_qty: decision.recommended_qty,
qualifying_planned_qty: decision.qualifying_planned_qty, residual_qty: decision.residual_qty,
recommendation_authority: ctx.recommendation_authority || null, db_writes: 0 })] };
}



var WAP_CONTROLLED_GATE_ORDER_ = [
'FLAG_GATE',
'HARVEST_AND_CANONICAL_AUTHORITY',
'VALID_ZERO_SHORT_CIRCUIT',
'REQUESTED_SCOPE_EMPTY_REFUSAL',
'ALLOCATOR_MARKETPLACE_FILTER',
'PASS_2_WRITER'
];









function weeklyAiPlanControlledDecisionFromParts_(decision, ctx) {
ctx = ctx || {};
var out = {
available: true, unavailable_reason: null,


entry_point: 'KM.DB.generateWeeklyAiPlanDraft -> POST action=weeklyAiPlan.generate (01_router.gs)'
+ ' -> handleGenerateWeeklyAiPlanDraft_ -> weeklyAiPlanGenerateK2_ (61_)',
decision_source: 'weeklyAiPlanControlledDecisionFromParts_ (61_) — the same builder the handler'
+ ' returns its envelope from; a caller reports these fields and maps nothing itself',
outcome: null, code: null, reason: decision ? decision.reason : null,
recommendation_state: decision ? decision.recommendation_state : null,
recommended_qty: decision ? decision.recommended_qty : null,
qualifying_active_planned_qty: decision ? decision.qualifying_planned_qty : null,

qualifying_planned_qty: decision ? decision.qualifying_planned_qty : null,
residual_qty: decision ? decision.residual_qty : null,
per_scope: (decision && decision.per_scope) || [],
missing_reasons: (decision && decision.missing_reasons) || [],
would_write: false, writer_reached: false, db_writes: 0,
requested_scope_empty_is_bypassed_by_valid_zero: false,
gate_order: WAP_CONTROLLED_GATE_ORDER_.slice(),
response: null, refusal: null
};
if (!decision) {
out.available = false;
out.unavailable_reason = 'NO_DECISION: the canonical authority produced nothing to report';
return out;
}
if (decision.noAction) {
out.response = weeklyAiPlanNoActionResponse_(decision, ctx);
out.outcome = out.response.data.outcome;
out.code = out.response.data.code;
out.writer_reached = out.response.data.writer_reached === true;
out.db_writes = out.response.data.db_writes;


out.requested_scope_empty_is_bypassed_by_valid_zero = true;
return out;
}
if (decision.recommendation_state === WAP_RECOMMENDATION_STATES_.MISSING) {
out.refusal = weeklyAiPlanScopeEmptyRefusal_(decision, ctx);
out.outcome = 'REFUSAL';
out.code = out.refusal.errors[0].code;
return out;
}
if (decision.commitment_hold) out.commitment_hold = decision.commitment_hold;   // A2-D14C
// A2-D14C r2 (V2, non-author review): the controlled path returns the SAME HOLD envelope as the handler (code, status HOLD, db_writes 0,
// writer_reached false, the affected keys, the bilingual message) - never a bare outcome with response null.
if (decision.reason === 'COMMITMENT_DATE_HOLD') { out.outcome = 'COMMITMENT_HOLD'; out.code = WAP_COMMITMENT_HOLD_CODE_; out.would_write = false; out.writer_reached = false; out.db_writes = 0;
out.response = weeklyAiPlanCommitmentHoldResponse_((decision.commitment_hold && decision.commitment_hold.report) || { active: true, code: WAP_COMMITMENT_HOLD_CODE_, message: WAP_COMMITMENT_HOLD_MESSAGE_, held_keys: [] }, { planning_cycle: ctx.planning_cycle, scope: ctx.scope, mode: 'CONTROLLED_DECISION' });
return out; }
out.outcome = 'WOULD_GENERATE';
out.would_write = weeklyAiPlanQty_(decision.residual_qty) > 0;
return out;
}








function weeklyAiPlanControlledDecision_(ss, scope, requestedMarketplace, calcDate) {
var canonical, target, recState, planned, decision;
try {
canonical = weeklyAiPlanCanonicalDemand_(ss, scope, calcDate || null);
target = weeklyAiPlanTargetScopes_(scope, requestedMarketplace
|| (scope && scope.marketplace) || '');
recState = weeklyAiPlanRecommendationState_(canonical, target);
planned = weeklyAiPlanQualifyingPlannedQty_(ss, scope, { marketplaces: ((target && target.scopes) || []).map(function (e) { return e && e.marketplace; }) });
planned.commitmentHold = weeklyAiPlanCommitmentHold_(planned, scope, target, null).report;   // A2-D14C: the same HOLD authority
decision = weeklyAiPlanNoActionDecision_(recState, planned);
} catch (e) {
return { available: false, unavailable_reason: 'PRODUCTION_AUTHORITY_THREW: '
+ weeklyAiPlanStr_(e && e.message), outcome: null, code: null, reason: null,
recommendation_state: null, recommended_qty: null, qualifying_active_planned_qty: null,
qualifying_planned_qty: null, residual_qty: null, per_scope: [], would_write: false,
writer_reached: false, db_writes: 0, requested_scope_empty_is_bypassed_by_valid_zero: false,
gate_order: WAP_CONTROLLED_GATE_ORDER_.slice(), response: null, refusal: null };
}
var out = weeklyAiPlanControlledDecisionFromParts_(decision, {
planning_cycle: scope && scope.planningCycle, scope: scope,
requested_marketplace: requestedMarketplace || (scope && scope.marketplace) || '',
recommendation_authority: recState });
out.authority = { rule: recState.authority_rule,
accepted_calculation_date: recState.accepted_calculation_date,
current_run: recState.current_run, per_scope: recState.per_scope,
qualification: planned.authority, planned_rows: planned.rows,
planned_excluded: planned.excluded, provenance_authority: planned.provenance_authority };
return out;
}

function weeklyAiPlanNoDemandVerdict_(h, mapped) {
var out = { noDemand: false, reason: null, receiverCount: 0, basisTotal: 0, gapTotal: 0, positiveGapRefs: [] };
var kmaf = (h && h.kmaf) || {};
var receivers = Array.isArray(h && h.builtReceivers) ? h.builtReceivers : [];
out.receiverCount = receivers.length;
if (!receivers.length) { out.reason = 'NO_RECEIVERS_BUILT'; return out; }
if (Array.isArray(h.errors) && h.errors.length) { out.reason = 'HARVEST_DROPPED_SITES'; return out; }


var issues = (Array.isArray(kmaf.issues) ? kmaf.issues : [])
.concat(Array.isArray(mapped && mapped.issues) ? mapped.issues : []);
var blocking = issues.filter(function (i) { return i && i.blocking !== false; });
if (!blocking.length) { out.reason = 'NOT_A_DEMAND_WEIGHT_REFUSAL'; return out; }






for (var i = 0; i < blocking.length; i++) {
var eng = weeklyAiPlanStr_(blocking[i].engine_code) || weeklyAiPlanStr_(blocking[i].code);
if (eng !== 'DEMAND_WEIGHT_UNRESOLVED') { out.reason = 'OTHER_BLOCKING_ISSUE:' + (eng || 'UNNAMED'); return out; }
}


for (var r = 0; r < receivers.length; r++) {
var fb = receivers[r] && receivers[r].forecastBasis;
var b = fb ? fb.forecastShareQty : undefined;
if (typeof b !== 'number' || !isFinite(b) || b < 0) { out.reason = 'BASIS_UNRESOLVED'; return out; }
out.basisTotal += b;
}
if (out.basisTotal !== 0) { out.reason = 'BASIS_TOTAL_NONZERO'; return out; }


var horizons = (h && h.horizonsByDemandRef) || {};
for (var ref in horizons) {
if (!Object.prototype.hasOwnProperty.call(horizons, ref)) continue;
var byWin = (horizons[ref] && horizons[ref].cumulativeGapByWindow) || {};
for (var w in byWin) {
if (!Object.prototype.hasOwnProperty.call(byWin, w)) continue;
var q = Number(byWin[w]);
if (!isFinite(q)) { out.reason = 'CANONICAL_DEMAND_UNRESOLVED'; return out; }
if (q > 0) { out.gapTotal += q; if (out.positiveGapRefs.indexOf(ref) === -1) out.positiveGapRefs.push(ref); }
}
}
if (out.positiveGapRefs.length) { out.reason = 'POSITIVE_CANONICAL_DEMAND_WITH_UNRESOLVED_WEIGHT'; return out; }

out.noDemand = true;
out.reason = 'NO_REPLENISHMENT_REQUIRED';
return out;
}





function weeklyAiPlanPersistenceDeps_(ss) {
var type = 'WEEKLY_SHIPPING';
var cfg = KMPR.TABLES[type], tables = [cfg.header, cfg.lines, KMPR.RUN_JOURNAL_TABLE];
return {
loadActiveContext: function (q) { var b = rprBuildSheetSet_(ss, [cfg.header]); return KMPR.loadActiveDraftContext(b.set, q); },
loadPriorSnapshot: function (id) { var b = rprBuildSheetSet_(ss, tables); return KMPR.loadDraftSnapshot(b.set, id, type); },
lockedApply: function (plan, expectedToken, opts) {
var lock = LockService.getScriptLock();
var d2 = {
validatePlan: function (p) { return KMPR.validatePersistencePlan(p); },
acquireLock: function () { return lock.tryLock(30000); },
releaseLock: function () { lock.releaseLock(); },
loadActiveDraftContext: function () { var b = rprBuildSheetSet_(ss, [cfg.header]); return KMPR.loadActiveDraftContext(b.set, { recommendationType: type, planningCycle: plan.planningCycle, businessScope: plan.businessScope }); },
reloadSnapshot: function () { d2._built = rprBuildSheetSet_(ss, tables); return KMPR.loadDraftSnapshot(d2._built.set, plan.draftId, type); },
recomputeToken: function (snap) {
var dv = snap.draft ? snap.draft.draft_version : plan.draftVersion;
return KMPR.computeExpectedToken(dv, (snap.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
},
applyPlan: function (tok, o) {
var built = d2._built, before = {};
for (var i = 0; i < tables.length; i++) before[tables[i]] = built.set[tables[i]].rows.map(function (r) { return r.slice(); });
var resR = KMPR.applyPersistencePlan(built.set, plan, tok, o || opts || {});
if (!resR.conflict && resR.runStatus !== 'FAILED') { rpoKeyedDeltaWrite_(built.meta, built.set, before, tables); }
return resR;
}
};
return KMPL.executeLockedPersistence({ plan: plan, expectedToken: expectedToken, opts: opts, generationType: opts.generationType, deps: d2 });
}
};
}
































var WAP_GAP_TABLE_ = 'inventory_replenishment_gap';
var WAP_GAP_REQUIRED_COLS_ = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date',
'd18_suggested_qty', 'd30_suggested_qty', 'd45_suggested_qty', 'd90_suggested_qty'];
var WAP_GAP_WINDOW_COL_ = { D18: 'd18_suggested_qty', D30: 'd30_suggested_qty', D45: 'd45_suggested_qty', D90: 'd90_suggested_qty' };
var WAP_GAP_WINDOW_GAP_COL_ = { D18: 'd18_gap_qty', D30: 'd30_gap_qty', D45: 'd45_gap_qty', D90: 'd90_gap_qty' };   // D5-V3-R3 (R2-B): the netting basis









function weeklyAiPlanGapSchedule_() {
var out = { hour: 13, minute: 30, enabled: true, source: 'DECLARED_DEFAULT',
driftMinutes: 15, completionBudgetMinutes: 240 };
try {
if (typeof AUTOMATION_JOBS_ !== 'undefined' && AUTOMATION_JOBS_) {
for (var i = 0; i < AUTOMATION_JOBS_.length; i++) {
if (AUTOMATION_JOBS_[i].key === 'inventoryGap' && AUTOMATION_JOBS_[i].defaults) {
out.hour = AUTOMATION_JOBS_[i].defaults.hour;
out.minute = AUTOMATION_JOBS_[i].defaults.minute;
out.enabled = AUTOMATION_JOBS_[i].defaults.enabled === true;
}
}
}

if (typeof automationReadConfig_ === 'function' && typeof automationDefaultIo_ === 'function') {
var cfg = automationReadConfig_(automationDefaultIo_());
var c = cfg && cfg.inventoryGap;
if (c && typeof c.hour === 'number' && typeof c.minute === 'number') {
out.hour = c.hour; out.minute = c.minute; out.enabled = c.enabled === true;
out.source = 'EFFECTIVE_CONFIG';
}
}
} catch (e) { out.source = 'DECLARED_DEFAULT_AFTER_ERROR'; }
return out;
}





function weeklyAiPlanGapJobState_() {
try {
if (typeof GAP_JOB_PROP_KEYS_ === 'undefined') return null;
var raw = PropertiesService.getScriptProperties().getProperty(GAP_JOB_PROP_KEYS_.INVENTORY);
if (!raw) return null;
var st = JSON.parse(raw);
if (!st) return null;









var startedDate = weeklyAiPlanStr_(st.startedAt).slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(startedDate)) startedDate = null;
return { status: weeklyAiPlanStr_(st.status), runId: weeklyAiPlanStr_(st.runId),
startedAtDate: startedDate, startedAt: weeklyAiPlanStr_(st.startedAt) || null,
scopesProcessed: st.scopesProcessed, scopesTotal: st.scopesTotal, product: 'INVENTORY' };
} catch (e) { return null; }
}















function weeklyAiPlanCanonicalDate_(v) {
if (typeof KMSNF === 'undefined' || !KMSNF || typeof KMSNF.canonicalDate !== 'function') {
return { ok: false, date: null, kind: 'UNKNOWN', reason: 'SNAPSHOT_DATE_AUTHORITY_UNAVAILABLE' };
}
if (typeof GAP_CALC_UTC_OFFSET_MIN_ === 'undefined') {
return { ok: false, date: null, kind: 'UNKNOWN', reason: 'TIMEZONE_AUTHORITY_UNAVAILABLE' };
}
return KMSNF.canonicalDate(v, GAP_CALC_UTC_OFFSET_MIN_);
}

function weeklyAiPlanCanonicalDemand_(ss, scope, calcDate) {
var out = { ok: false, reason: null, bySite: {}, byKeyDate: {}, dateIndex: {}, distinctDates: [],
rowCount: 0, calculationDate: calcDate || null, acceptedDate: null, freshness: null,
freshnessState: null, schedule: null, jobState: null,


dateNormalization: { by_kind: {}, unreadable: 0, unreadable_sample: [],
offset_minutes: (typeof GAP_CALC_UTC_OFFSET_MIN_ !== 'undefined') ? GAP_CALC_UTC_OFFSET_MIN_ : null } };
var sh;
try { sh = ss.getSheetByName(WAP_GAP_TABLE_); }
catch (e) { out.reason = 'CANONICAL_DEMAND_READ_FAILED'; return out; }


if (!sh) { out.reason = 'CANONICAL_DEMAND_TABLE_MISSING'; return out; }
var headers;
try { headers = (sh.getLastRow() > 0) ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return weeklyAiPlanStr_(h); }) : []; }
catch (e2) { out.reason = 'CANONICAL_DEMAND_READ_FAILED'; return out; }
for (var c = 0; c < WAP_GAP_REQUIRED_COLS_.length; c++) {
if (headers.indexOf(WAP_GAP_REQUIRED_COLS_[c]) === -1) {
out.reason = 'CANONICAL_DEMAND_HEADER_MISSING:' + WAP_GAP_REQUIRED_COLS_[c];
return out;
}
}
var rows = (typeof gapReadObjects_ === 'function') ? (gapReadObjects_(ss, WAP_GAP_TABLE_) || []) : [];
for (var i = 0; i < rows.length; i++) {
var r = rows[i];
if (weeklyAiPlanStr_(r.company) !== scope.company || weeklyAiPlanStr_(r.country) !== scope.country) continue;
var key = weeklyAiPlanStr_(r.company) + '|' + weeklyAiPlanStr_(r.country) + '|'
+ weeklyAiPlanStr_(r.marketplace) + '|' + weeklyAiPlanStr_(r.sku);
var rec = {
company: weeklyAiPlanStr_(r.company), country: weeklyAiPlanStr_(r.country),
marketplace: weeklyAiPlanStr_(r.marketplace), sku: weeklyAiPlanStr_(r.sku),
calculation_status: weeklyAiPlanStr_(r.calculation_status),

calculation_date: '',
calculated_at: weeklyAiPlanStr_(r.calculated_at), updated_at: weeklyAiPlanStr_(r.updated_at),
note: weeklyAiPlanStr_(r.note), source_table: WAP_GAP_TABLE_, suggestedByWindow: {}, gapByWindow: {}, duplicate: false
};



var _cd = weeklyAiPlanCanonicalDate_(r.calculation_date);
rec.calculation_date = _cd.ok ? _cd.date : weeklyAiPlanStr_(r.calculation_date);
rec.calculation_date_kind = _cd.kind;
out.dateNormalization.by_kind[_cd.kind] = (out.dateNormalization.by_kind[_cd.kind] || 0) + 1;
if (!_cd.ok) {
out.dateNormalization.unreadable++;
out.dateNormalization.unreadable_sample.push({ key: key, kind: _cd.kind, reason: _cd.reason,
raw: weeklyAiPlanStr_(r.calculation_date).slice(0, 60) });
}
for (var w in WAP_GAP_WINDOW_COL_) {
if (!Object.prototype.hasOwnProperty.call(WAP_GAP_WINDOW_COL_, w)) continue;
var raw = r[WAP_GAP_WINDOW_COL_[w]];
var v = (raw === '' || raw === null || raw === undefined) ? null : Number(raw);
rec.suggestedByWindow[w] = (v !== null && isFinite(v)) ? v : null;
var rawG = r[WAP_GAP_WINDOW_GAP_COL_[w]]; var vg = (rawG === '' || rawG === null || rawG === undefined) ? null : Number(rawG);
rec.gapByWindow[w] = (vg !== null && isFinite(vg) && vg >= 0) ? vg : null;
}




var dk = key + '@' + rec.calculation_date;
if (out.byKeyDate[dk]) { out.byKeyDate[dk].duplicate = true; continue; }
out.byKeyDate[dk] = rec;
if (!out.dateIndex[rec.calculation_date]) {
out.dateIndex[rec.calculation_date] = { date: rec.calculation_date, status: rec.calculation_status,
rowCount: 0, planningCycle: 'RECO-' + rec.calculation_date.slice(0, 7) };
}
out.dateIndex[rec.calculation_date].rowCount++;





if (rec.calculation_status === 'READY') out.dateIndex[rec.calculation_date].status = 'READY';
else if (out.dateIndex[rec.calculation_date].status !== 'READY') {
out.dateIndex[rec.calculation_date].status = rec.calculation_status;
}
out.rowCount++;
}


var dates = [];
for (var dkey in out.dateIndex) { if (Object.prototype.hasOwnProperty.call(out.dateIndex, dkey)) dates.push(out.dateIndex[dkey]); }
out.distinctDates = dates.map(function (d) { return d.date; }).sort();
if (typeof KMSNF === 'undefined' || !KMSNF || typeof KMSNF.assess !== 'function') {
out.reason = 'SNAPSHOT_FRESHNESS_AUTHORITY_UNAVAILABLE';
return out;
}


var latest = out.distinctDates.length ? out.distinctDates[out.distinctDates.length - 1] : null;



var offered = dates.filter(function (d) { return d.date === latest || out.distinctDates.length > 1; });
out.schedule = weeklyAiPlanGapSchedule_();
out.jobState = weeklyAiPlanGapJobState_();






if (typeof gapCalcNowMs_ !== 'function') {
out.reason = 'PLANNING_CLOCK_AUTHORITY_UNAVAILABLE';
return out;
}
var fresh = KMSNF.assess({
nowMs: gapCalcNowMs_(),
utcOffsetMinutes: (typeof GAP_CALC_UTC_OFFSET_MIN_ !== 'undefined') ? GAP_CALC_UTC_OFFSET_MIN_ : 480,
schedule: out.schedule,
snapshotDates: offered,
expectedPlanningCycle: scope.planningCycle,
jobState: out.jobState
});
out.freshness = fresh;
out.freshnessState = fresh.state;
if (!fresh.ok) { out.reason = fresh.state; return out; }
out.acceptedDate = fresh.acceptedDate;

for (var k2 in out.byKeyDate) {
if (!Object.prototype.hasOwnProperty.call(out.byKeyDate, k2)) continue;
var r2 = out.byKeyDate[k2];
if (r2.calculation_date !== out.acceptedDate) continue;
var sk = r2.company + '|' + r2.country + '|' + r2.marketplace + '|' + r2.sku;
if (out.bySite[sk] && out.bySite[sk] !== r2) { out.bySite[sk].duplicate = true; continue; }
out.bySite[sk] = r2;
}



var ogKeys = {}, ogList = [];
for (var sk2 in out.bySite) {
if (!Object.prototype.hasOwnProperty.call(out.bySite, sk2)) continue;
var ogk = out.bySite[sk2].company + '|' + out.bySite[sk2].sku;
if (!ogKeys[ogk]) { ogKeys[ogk] = 1; ogList.push(ogk); }
}


if (typeof recoWsOngoingAdmissionLive_ === 'function') out.ongoingLive = recoWsOngoingAdmissionLive_(ss, ogList);
out.ok = true;
return out;
}





function weeklyAiPlanAcceptCanonicalDemand_(snapshot, site, scope, calcDate, expectedBySite) {

var acceptedDate = (snapshot && snapshot.acceptedDate) || null;
var key = scope.company + '|' + scope.country + '|' + site.marketplace + '|' + site.sku;
var rec = snapshot.bySite[key];
if (!rec) return { ok: false, code: 'CANONICAL_DEMAND_ROW_MISSING', key: key };
if (rec.duplicate) return { ok: false, code: 'CANONICAL_DEMAND_DUPLICATE_ROWS', key: key };
if (rec.calculation_status !== 'READY') {
return { ok: false, code: 'CANONICAL_DEMAND_NOT_READY', key: key,
status: rec.calculation_status || '(blank)', note: rec.note || null };
}


var ogLive = snapshot.ongoingLive;
if (ogLive) {
if (ogLive.ok !== true) return { ok: false, code: 'ONGOING_SUPPLY_UNVERIFIED', key: key, reason: ogLive.code || null };
var ogV = (ogLive.byKey || {})[rec.company + '|' + rec.sku];
if (!ogV) return { ok: false, code: 'ONGOING_SUPPLY_UNVERIFIED', key: key, reason: 'ONGOING_CHECK_KEY_MISSING' };
if (ogV.complete === false) {
return { ok: false, code: 'ONGOING_SUPPLY_INCOMPLETE', key: key, note: (ogV.excluded || []).filter(function (x) {
return x.code !== 'ONGOING_PO_DRAFT' && x.code !== 'ONGOING_UNALLOCATED_RESIDUAL'; }).slice(0, 5).map(function (x) { return x.code + ' ' + x.line + ' ' + x.qty; }).join('; ') };
}
}










if (acceptedDate && rec.calculation_date && rec.calculation_date !== acceptedDate) {
return { ok: false, code: 'CANONICAL_DEMAND_LINEAGE_MISMATCH', key: key,
snapshotDate: rec.calculation_date, acceptedDate: acceptedDate };
}
if (!rec.calculation_date) return { ok: false, code: 'CANONICAL_DEMAND_LINEAGE_MISSING', key: key };

var out = {}, gapOut = {};
for (var w in site.cumulativeGapByWindow) {
if (!Object.prototype.hasOwnProperty.call(site.cumulativeGapByWindow, w)) continue;
var v = rec.suggestedByWindow[w];
if (v === null || v === undefined) return { ok: false, code: 'CANONICAL_DEMAND_WINDOW_UNRESOLVED', key: key, window: w };
if (v < 0) return { ok: false, code: 'CANONICAL_DEMAND_INVALID', key: key, window: w, value: v };
out[w] = v;
gapOut[w] = (rec.gapByWindow && rec.gapByWindow[w] != null) ? rec.gapByWindow[w] : null;
}



if (expectedBySite && Object.prototype.hasOwnProperty.call(expectedBySite, key)) {
var exp = expectedBySite[key];
for (var w2 in exp) {
if (!Object.prototype.hasOwnProperty.call(exp, w2)) continue;
var e = Number(exp[w2]);
if (!isFinite(e)) return { ok: false, code: 'EXPECTED_DEMAND_INVALID', key: key, window: w2 };
if (out[w2] !== undefined && out[w2] !== e) {
return { ok: false, code: 'EXPECTED_DEMAND_CONFLICT', key: key, window: w2, expected: e, canonical: out[w2] };
}
}
}
return { ok: true, suggestedByWindow: out, gapByWindow: gapOut, lineage: {
company: rec.company, country: rec.country, marketplace: rec.marketplace, sku: rec.sku,
planning_cycle: scope.planningCycle, calculation_status: rec.calculation_status,
calculation_date: rec.calculation_date, calculated_at: rec.calculated_at || null,
updated_at: rec.updated_at || null, source_table: rec.source_table, source_reason: 'MATERIALIZED_SNAPSHOT',


freshness_state: (snapshot && snapshot.freshnessState) || null,
accepted_snapshot_date: acceptedDate,
schedule_source: (snapshot && snapshot.schedule && snapshot.schedule.source) || null,
gap_run_id: (snapshot && snapshot.jobState && snapshot.jobState.runId) || null } };
}

function weeklyAiPlanEnumerateSites_(ss, scope, upcBySku, errors, canonical, expectedBySite) {
var pendingDest = [];   // D5-V3 (OD-2)
var a0Blocked = [], sus3_ = [];   // P3PL-2 r3: + understated-supply warnings   // A2-Q1 (r4): live lines BLOCKED by A0 (share / warehouse company unknown)
var sites = [];
var calcMonth = weeklyAiPlanStr_(scope.planningCycle).slice(5);
var calcCtx = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
var calcDate = (calcCtx && calcCtx.ok) ? calcCtx.calculationDate : (calcMonth + '-01');

var io = {
now: function () { return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0; },
nextSeq: function () { return 0; },
configMonth: function () { return calcMonth; },
configDate: function () { return calcDate; },
openTarget: function () { return ss; }
};


var scopes = (typeof gapEnumerateScopes_ === 'function') ? gapEnumerateScopes_(ss) : [];
var marketplaces = {}, mList = [];
scopes.forEach(function (s) { if (weeklyAiPlanStr_(s.company) === scope.company && weeklyAiPlanStr_(s.country) === scope.country) { var m = weeklyAiPlanStr_(s.marketplace); if (m && !marketplaces[m]) { marketplaces[m] = 1; mList.push(m); } } });
if (!mList.length) return sites;

var mkts = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'marketplaces') : [];












var prByMktKey = {}; mkts.forEach(function (r) {
if (!weeklyAiPlanStr_(r.marketplace)) return;
if (Object.prototype.hasOwnProperty.call(r, 'allocation_priority')) {
prByMktKey[weeklyAiPlanMktKey_(r.company, r.country, r.marketplace)] = r.allocation_priority;
}
});

for (var mi = 0; mi < mList.length; mi++) {
var marketplace = mList[mi];
var page = 1, totalPages = 1;
do {
var resp;
try { resp = handleRecommendationWorkspaceGet_({ payload: { scope: { company: scope.company, country: scope.country, marketplace: marketplace }, pagination: { page: page, size: 100 } } }, io); }
catch (e) { errors.push(weeklyAiPlanErr_('WORKSPACE_THREW', (e && e.message) ? String(e.message) : String(e), { marketplace: marketplace })); break; }
if (!resp || !resp.success || !resp.data) { errors.push(weeklyAiPlanErr_('WORKSPACE_NOT_OK', 'recommendation workspace not ok', { marketplace: marketplace, errors: resp && resp.errors })); break; }
var lines = resp.data.lines || [];
var pg = resp.data.pagination || {}; totalPages = pg.totalPages || 1;
for (var li = 0; li < lines.length; li++) {
var line = lines[li];




if (line && line.blocked === true && /^(WAREHOUSE_SHARE_UNKNOWN|WAREHOUSE_COMPANY_UNKNOWN)/.test(weeklyAiPlanStr_(line.blockedReason)) && a0Blocked.length < 500) a0Blocked.push({ marketplace: marketplace, sku: weeklyAiPlanStr_(line.sku), reason: weeklyAiPlanStr_(line.blockedReason).slice(0, 200) });   // A2-Q1 (r4)
// A-DELTA1 c2 item 2: a platform site line held because its own units go to a 3PL (42_ P3PL-2, B-Q1: the 3PL -> platform leg is UNKNOWN) has
// no horizons and used to be skipped silently. It is now NAMED in the AI result (typed error with the shipments, quantities, 3PL and 3PL ETA).
// Nothing is computed from it and no draft is written - the same outcome as before, now visible.
if (line && line.blocked === true && /^PLATFORM_INCOMING_VIA_3PL_LEG_UNKNOWN/.test(weeklyAiPlanStr_(line.blockedReason))) {
  var v3s_ = Array.isArray(line.platformVia3pl) ? line.platformVia3pl : [], q3_ = 0; v3s_.forEach(function (x) { q3_ += Number(x && x.qty) || 0; });
  errors.push(weeklyAiPlanErr_('PLATFORM_INCOMING_VIA_3PL_LEG_UNKNOWN', marketplace + ' / ' + weeklyAiPlanStr_(line.sku) + '：' + q3_ + ' 件送往 3PL（' + v3s_.slice(0, 5).map(function (x) { return weeklyAiPlanStr_(x && x.shipmentId) + ' → ' + weeklyAiPlanStr_(x && x.destinationWarehouseId) + ' 3PL ETA ' + (weeklyAiPlanStr_(x && x.threePlEta) || '未提供'); }).join('；') + '）· FBA 後段未定（B-Q1）— 此站可售到貨未計入，AI 不產生建議（HOLD）。3PL 實體庫存與在途不受影響。',
    { marketplace: marketplace, sku: weeklyAiPlanStr_(line.sku), reason: weeklyAiPlanStr_(line.blockedReason).slice(0, 200), held_qty: q3_, shipments: v3s_.slice(0, 20).map(function (x) { return { shipment_id: x && x.shipmentId, destination_warehouse_id: x && x.destinationWarehouseId, qty: x && x.qty, three_pl_eta: x && x.threePlEta, marketplace_available_date: null }; }) }));
  continue;
}
// P3PL-2 r3 (narrow): a READY platform line with held 3PL-bound rows is planned normally; its understated-supply warning is collected and
// returned in harvest_diagnostics.supply_understated_warnings (text + held qty). It never refuses, never writes, never changes a quantity.
if (line && line.blocked !== true && Array.isArray(line.platformVia3pl) && line.platformVia3pl.length && sus3_.length < 500) { var q3r_ = Number(line.supplyUnderstatedQty) || 0;
  sus3_.push({ code: 'SUPPLY_MAY_BE_UNDERSTATED_PLATFORM_VIA_3PL', marketplace: marketplace, sku: weeklyAiPlanStr_(line.sku), held_qty: q3r_, message: marketplace + ' / ' + weeklyAiPlanStr_(line.sku) + '：' + q3r_ + ' 件送往 3PL，FBA 後段未定（B-Q1）— 未計入此站可售到貨；供給可能低估最多 ' + q3r_ + '，建議量可能多最多 ' + q3r_ + '。',
    shipments: line.platformVia3pl.slice(0, 20).map(function (x) { return { shipment_id: x && x.shipmentId, destination_warehouse_id: x && x.destinationWarehouseId, qty: x && x.qty, three_pl_eta: x && x.threePlEta, marketplace_available_date: null }; }) }); }
var d = KMWHA.resolveWorkspaceLineDestination(line);
var dest = weeklyAiPlanStr_(d.destinationRef);
if (!dest) {
// D5-V3 (OD-2): a site with several valid destination warehouses -> the user chooses. The suggestion is SHOWN (pending
// list in the response) and never written as a draft; the existing Submit / Shipment guards therefore cannot be bypassed.
if (line && line.destinationChoiceRequired === true && Array.isArray(line.horizons) && line.horizons.length) {
var _hzP = weeklyAiPlanAiHorizonsOf_(line);   // D5-V3-R3 (m5): a pending suggestion is an AI suggestion -> gated too
if (!_hzP.ok) { errors.push(weeklyAiPlanErr_('AI_EVENT_GATE_UNAVAILABLE', 'AI-visible horizons missing for ' + marketplace + '/' + weeklyAiPlanStr_(line.sku), { marketplace: marketplace, sku: weeklyAiPlanStr_(line.sku), reason: _hzP.reason })); continue; }
var pg = {}, prb = {}, pgap = {}; _hzP.horizons.forEach(function (hz) { var wc0 = weeklyAiPlanStr_(hz.windowCode); if (wc0) { pg[wc0] = hz.suggestedOrderQty; prb[wc0] = hz.requiredByDate; pgap[wc0] = hz.gapQty; } });
pendingDest.push({ marketplace: marketplace, sku: weeklyAiPlanStr_(line.sku), siteSku: weeklyAiPlanStr_(line.siteSku),
candidates: (line.destinationCandidates || []).slice(), aiGatedEvents: _hzP.gated, suggestedByWindow: pg, gapByWindow: pgap, unitsPerCarton: (upcBySku || {})[weeklyAiPlanStr_(line.sku)], requiredByByWindow: prb, reason: 'DESTINATION_WAREHOUSE_USER_CHOICE', source: 'workspace_live' });
}
continue;
}
if (!Array.isArray(line.horizons) || !line.horizons.length) continue;
var cum = {}, reqBy = {};


line.horizons.forEach(function (h) { var wc = weeklyAiPlanStr_(h.windowCode); if (wc) { cum[wc] = h.gapQty; reqBy[wc] = h.requiredByDate; } });
var _site = {
marketplace: marketplace, sku: weeklyAiPlanStr_(line.sku), siteSku: weeklyAiPlanStr_(line.siteSku),
destinationWarehouseId: dest, destinationType: d.destinationType, cumulativeGapByWindow: cum, requiredByByWindow: reqBy,
fulfillmentModel: weeklyAiPlanStr_(line.fulfillmentModel),



allocationPriority: prByMktKey[weeklyAiPlanMktKey_(scope.company, scope.country, marketplace)],
unitsPerCarton: (upcBySku || {})[weeklyAiPlanStr_(line.sku)], sourceDataAsOf: line.sourceDataAsOf || null
};


if (canonical) {
var _acc = weeklyAiPlanAcceptCanonicalDemand_(canonical, _site, scope, canonical.calculationDate, expectedBySite);
if (!_acc.ok) {
errors.push(weeklyAiPlanErr_(_acc.code, 'canonical demand snapshot refused for ' + _acc.key,
{ marketplace: marketplace, sku: _site.sku, detail: _acc }));
continue;
}
_site.liveGapByWindow = cum;
_site.cumulativeGapByWindow = _acc.suggestedByWindow;
_site.netBasisGapByWindow = _acc.gapByWindow || null;   // D5-V3-R3 (R2-B)
_site.demandLineage = _acc.lineage;
}
var _gt = weeklyAiPlanApplyEventGate_(_site, line);   // D5-V3-R3 (m5)
if (!_gt.ok) { errors.push(weeklyAiPlanErr_('AI_EVENT_GATE_UNAVAILABLE', 'event first-suggestion gate could not be applied for ' + marketplace + '/' + _site.sku, { marketplace: marketplace, sku: _site.sku, reason: _gt.reason })); continue; }
sites.push(_site);
}
page++;
} while (page <= totalPages);
}
sites.pendingDestination = pendingDest;
sites.a0Blocked = a0Blocked; sites.supplyUnderstated = sus3_;   // P3PL-2 r3   // A2-Q1 (r4)
return sites;
}
















function weeklyAiPlanForecastReadContext_(ss) {
try {
var sh = ss.getSheetByName('fc_regular_forecast');
if (!sh) return { readSucceeded: true, tableMissing: true, schemaValid: false, headers: [] };
if (sh.getLastColumn() < 1) return { readSucceeded: true, tableMissing: false, schemaValid: false, headers: [] };
var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
.map(function (h) { return weeklyAiPlanStr_(h).toLowerCase(); });
return { readSucceeded: true, tableMissing: false, schemaValid: true, headers: hdr };
} catch (e) {

return { readSucceeded: false, readOutcomeUnknown: true, transportFailed: true, headers: [] };
}
}

function weeklyAiPlanBuildKmafReceivers_(ss, scope, sites, upcBySku, errors) {
var calcMonth = weeklyAiPlanStr_(scope.planningCycle).slice(5);
var months = (typeof KMPCX !== 'undefined' && KMPCX && typeof KMPCX._forecastWeightMonths === 'function') ? KMPCX._forecastWeightMonths(calcMonth) : null;
if (!months || months.length < 2) { errors.push(weeklyAiPlanErr_('FORECAST_MONTHS_UNRESOLVED', 'KMPCX._forecastWeightMonths unavailable')); return { fatal: true }; }
var fcRows = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'fc_regular_forecast') : [];
var warehouses = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'warehouses') : [];

var receivers = [], horizonRows = [], sourceDataAsOf = null;

















var fcCtx = weeklyAiPlanForecastReadContext_(ss);
var fcNorm = { explicit_zero: 0, default_zero_blank: 0, default_zero_missing_year: 0, actual: 0 };
for (var i = 0; i < sites.length; i++) {
var st = sites[i];
var demandRef = [scope.company, scope.country, st.marketplace, st.sku, st.destinationWarehouseId].join('|');
var fcScope = { company: scope.company, country: scope.country, marketplace: st.marketplace };
var win = KMFCN.normalizeWindow({ context: fcCtx, scope: fcScope, sku: st.sku, months: months,
matchingRows: KMFCN.rowsForScope(fcRows, fcScope, st.sku) });
if (!win.ok) {


errors.push(weeklyAiPlanErr_('FORECAST_BASIS_UNRESOLVED', 'forecast month cannot be resolved: ' + win.reason,
{ demandRef: demandRef, reason: win.reason, months: (win.issues || []).map(function (x) { return x.month; }) }));
continue;
}
fcNorm.actual += win.counters.actual_count;
fcNorm.explicit_zero += win.counters.explicit_zero_count;
fcNorm.default_zero_blank += win.counters.default_zero_blank_count;
fcNorm.default_zero_missing_year += win.counters.default_zero_missing_year_count;
var shareSum = win.basis;
var b0 = win.values[months[0]], b1 = win.values[months[1]];
receivers.push({
receiverKey: demandRef, demandRef: demandRef, demandKey: demandRef, demandDriver: 'FORECAST_DRIVEN',
company: scope.company, country: scope.country, marketplace: st.marketplace, sku: st.sku, masterSku: st.sku, siteSku: st.siteSku,
fulfillmentModel: st.fulfillmentModel, allocationPriority: st.allocationPriority, unitsPerCarton: (upcBySku || {})[st.sku],
windowCode: scope.planningCycle, destinationWarehouseId: st.destinationWarehouseId,
forecastBasis: { forecastShareQty: shareSum, forecastMonth1: { month: months[0], baseForecast: b0 }, forecastMonth2: { month: months[1], baseForecast: b1 }, targetRules: {}, specialEventDemand: 0 }
});



horizonRows.push({ demandRef: demandRef, cumulativeGapByWindow: st.cumulativeGapByWindow,
requiredByByWindow: st.requiredByByWindow, demandLineage: st.demandLineage || null,
liveGapByWindow: st.liveGapByWindow || null });
if (!sourceDataAsOf && st.sourceDataAsOf) sourceDataAsOf = st.sourceDataAsOf;
}


return { fatal: false, receivers: receivers, kmafWarehouses: warehouses, horizonRows: horizonRows,
calculationDate: calcMonth + '-01', sourceDataAsOf: sourceDataAsOf, forecastNormalization: fcNorm };
}
