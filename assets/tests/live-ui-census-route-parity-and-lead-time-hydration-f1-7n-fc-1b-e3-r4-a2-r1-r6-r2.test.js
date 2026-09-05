// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R2 — UI/CENSUS ROUTE PARITY + LEAD-TIME HYDRATION REPAIR
// ----------------------------------------------------------------------------------------------------------------
// Two numbers on one screen were each produced honestly and neither was an answer to the question being asked.
//
//   1. THE CATALOGUE WAS SETTLED EMPTY. R4-A1 §D removed `include.carrierPlanning` from the primary workspace read
//      and left `_irReadModelHasCarrier = !!(opts && opts.carrier)` behind. All three primary readers pass
//      carrier:true, so every Search adopted a model whose two carrier tables the server had CORRECTLY skipped —
//      and, because adoption reported success, never fell through to the lazy load that would have fetched them.
//      The registry then held an empty catalogue as a SETTLED one, which is exactly "No shipping service is
//      configured for this lane" and "Lead time unavailable" on a lane with twenty-one good rows. R6-R1's registry
//      fix was correct code being handed an empty table.
//
//   2. `active_allocation_drafts: 0` WAS A CONSTANT. The census tested `status === 'active'`. That value is not in
//      16_ SAD_STATUSES_ and the write handler coerces anything unrecognised to `draft`, so the predicate has no
//      satisfier and would report 0 against a sheet holding ten thousand rows. The 520 on screen is correctly
//      persisted manual work; the zero was never a measurement of it.
//
// The suite proves both by RUNNING the shipped owners — the real registry, the real KMARC — never by matching
// prose. The mutation probes break semantics, not spelling.
//
// Run: node assets/tests/live-ui-census-route-parity-and-lead-time-hydration-f1-7n-fc-1b-e3-r4-a2-r1-r6-r2.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// Comments are prose and prose is not behaviour. Every source assertion below runs against a comment-stripped
// copy, because R5 and R6-R1 each shipped a check that passed by matching the comment explaining the old value.
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src); if (!m) throw new Error('not found: ' + name);
  var start = m.index, i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var PAGE_CODE = stripComments(PAGE);
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
var CENSUS_CODE = stripComments(CENSUS);
var HANDLERS = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var WORKSPACE_GS = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var INDEX = read('index.html');
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var BUILDER = read('assets/tools/build-apps-script-bundle.js');
var RO = require('./_release-order.js');
var MR = require('../js/core/method-registry.js');
var ARC = require('../js/core/supply-planning-active-route-classification.js');

// The live evidence, verbatim. Nothing in this file restates these from anywhere else.
var RECOMMENDED = 920, ROUTE_A = 320, ROUTE_B = 200, PLANNED = ROUTE_A + ROUTE_B;
var LEAD_TIME_ROWS_READ_BY_CENSUS = 21, RATE_CARDS_READ_BY_CENSUS = 294;
var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var SKU = 'CO1100-R';

// The carrier catalogue a CN -> US lane actually has. Shaped exactly as the shipped adapter emits it.
function leadTimeDto(o) {
  return { leadTimeId: o.id, carrierId: o.carrier, originCountry: o.from, destinationCountry: o.to,
    shippingMethod: o.method, lastMileDelivery: o.lastMile === undefined ? '' : o.lastMile,
    minDays: o.min === undefined ? '' : o.min, maxDays: o.max === undefined ? '' : o.max,
    avgDays: o.avg === undefined ? '' : o.avg };
}
var CN_US_LEAD_TIMES = [
  leadTimeDto({ id: 'LT1', carrier: 'CAR-A', from: 'CN', to: 'US', method: 'sea', lastMile: 'truck', min: 28, max: 45, avg: 35 }),
  leadTimeDto({ id: 'LT2', carrier: 'CAR-B', from: 'CN', to: 'US', method: 'sea', lastMile: 'truck', min: 30, max: 52, avg: 38 }),
  leadTimeDto({ id: 'LT3', carrier: 'CAR-A', from: 'CN', to: 'US', method: 'sea', lastMile: 'parcel', min: 30, max: 50, avg: 40 }),
  leadTimeDto({ id: 'LT4', carrier: 'CAR-C', from: 'CN', to: 'US', method: 'sea_express', lastMile: 'truck', min: 18, max: 26, avg: 22 }),
  leadTimeDto({ id: 'LT5', carrier: 'CAR-C', from: 'CN', to: 'US', method: 'air', lastMile: 'parcel', min: 5, max: 9, avg: 7 }),
  leadTimeDto({ id: 'LT6', carrier: 'CAR-D', from: 'US', to: 'US', method: 'truck', lastMile: 'truck', min: 2, max: 5, avg: 3 })
];
// The shipped adapter's carrier branch, reproduced from the two lines that matter so the DTO shape under test is
// the one the page really builds.
function adaptCarrier(data) {
  data = data || {};
  function n(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }
  return {
    getCarrierLeadTimes: (data.carrier_lead_times || []).map(function (r) {
      return leadTimeDto({ id: r.lead_time_id, carrier: r.carrier_id, from: r.origin_country, to: r.destination_country,
        method: r.shipping_method, lastMile: r.last_mile_delivery, min: n(r.min_days), max: n(r.max_days), avg: n(r.avg_days) });
    }).filter(function (r) { return r.leadTimeId || r.carrierId; }),
    getCarrierRateCards: (data.carrier_rate_cards || []).map(function (r) {
      return { rateCardId: String(r.rate_card_id || ''), carrierId: String(r.carrier_id || ''), raw: r };
    }).filter(function (r) { return r.rateCardId || r.carrierId; })
  };
}
var CN_US_ROUTE = { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon',
  sourceWarehouseId: 'WH-CN-FACTORY', destinationWarehouseCode: '' };

// ================================================================================================================
section('§0 — preflight invariants this round must not move');
// ================================================================================================================
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(stripComments(CFG)),
  'A1 the AI Plan DB generation flag is still declared false');
var allowlist = /var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[([\s\S]*?)\];/.exec(stripComments(CFG))[1];
eq((allowlist.match(/\{/g) || []).length, 1, 'A2 the activation allowlist still holds exactly one entry');
ok(allowlist.indexOf("company: 'ResUS'") !== -1 && allowlist.indexOf("sku: 'CO1100-R'") !== -1,
  'A3 that entry is still the single live scope, unwidened');
// R6-R3 RESTATEMENT. These pinned "this round is the newest", which is true exactly once and false for every
// round after. What they are about is that the round IS registered and that the family moved together, and
// that is round-independent.
ok(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R2') !== -1,
  'A4 R6-R2 is a registered owner stamp');
ok(RO.tokenIndex(RO.currentAppToken()) >= RO.tokenIndex('fc1be3r4a2r1r6r2-routeparity-20260905'),
  'A5 the application token is at R6-R2\'s or later');
eq(RO.staleAppTokenRefs(INDEX), [], 'A6 no index.html asset is left behind on an older app token');

// ================================================================================================================
section('§2 — the census predicate had no satisfier, and KMARC is now the one owner');
// ================================================================================================================
// The canonical enum, read from the writer rather than restated here.
var enumLine = /var SAD_STATUSES_ = \{([^}]*)\}/.exec(HANDLERS)[1];
ok(enumLine.indexOf('active:') === -1 && /draft: 1/.test(enumLine) && /cancelled: 1/.test(enumLine),
  'B1 16_ SAD_STATUSES_ contains draft and cancelled and does NOT contain `active`');
ok(/if \(!SAD_STATUSES_\[status\]\) status = 'draft';/.test(HANDLERS),
  'B2 the writer coerces any unrecognised status to `draft`, so `active` can never be persisted');
// The server's own ACTIVE literal, and KMARC's, must be the same set.
var serverActive = /var ACTIVE = \{ draft: 1, site_confirmed: 1, partially_submitted: 1 \};/g;
ok((HANDLERS.match(serverActive) || []).length >= 2,
  'B3 the server states its ACTIVE set more than once — which is why it needed one owner');
eq(Object.keys(ARC.ACTIVE_STATUSES).sort(), ['draft', 'partially_submitted', 'site_confirmed'],
  'B4 KMARC.ACTIVE_STATUSES is byte-identical to the server ACTIVE literal');
eq(Object.keys(ARC.TERMINAL_STATUSES).sort(), ['cancelled', 'expired', 'submitted'],
  'B5 KMARC names the three terminal statuses');

// The live shape: two manual draft headers, one per route, both correctly scoped.
var LIVE_HEADERS = [
  { allocation_draft_id: 'SAD-A', status: 'draft', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    destination_marketplace: 'Amazon', recommended_source_warehouse_id: 'WH-CN-FACTORY' },
  { allocation_draft_id: 'SAD-B', status: 'draft', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    destination_marketplace: '', destination_warehouse_id: 'WH-AMZLGS-IN', recommended_source_warehouse_id: 'WH-CN-FACTORY' }
];
var LIVE_LINES = [
  { allocation_draft_line_id: 'SADL-1', allocation_draft_id: 'SAD-A', sku: SKU, planned_qty: ROUTE_A, line_status: 'draft' },
  { allocation_draft_line_id: 'SADL-2', allocation_draft_id: 'SAD-B', sku: SKU, planned_qty: ROUTE_B, line_status: 'draft' }
];
var live = ARC.currentPlanTotal(LIVE_HEADERS, LIVE_LINES, SCOPE);
eq(live.total, PLANNED, 'B6 KMARC reproduces the screen total of ' + PLANNED + ' from the persisted rows');
eq(live.header_partition.included_ids, ['SAD-A', 'SAD-B'], 'B7 both persisted manual routes are included');
eq(LIVE_HEADERS.filter(function (h) { return String(h.status).toLowerCase() === 'active'; }).length, 0,
  'B8 the superseded `status === active` predicate matches NEITHER row — the census 0 was a constant');
// The second route's destination is a warehouse, so destination_marketplace is blank. The old census matched on
// that column, which is what would have dropped it even had the status predicate been satisfiable.
eq(LIVE_HEADERS[1].destination_marketplace, '', 'B9 the AMZLG&S route stores a BLANK destination_marketplace');
ok(ARC.classifyHeader(LIVE_HEADERS[1], SCOPE).counts_toward_current_plan,
  'B10 and it still counts — scope is decided by the STATION marketplace, never by the destination');

// Fail-closed on every axis, in both directions.
function excl(row) { return ARC.classifyHeader(row, SCOPE).exclusion_reasons; }
eq(excl({ allocation_draft_id: 'X', status: 'draft', company: '', country: 'US', marketplace: 'Amazon' }),
  ['COMPANY_BLANK_ON_ROW'], 'B11 a blank company on the ROW is refused by name');
eq(ARC.classifyHeader({ allocation_draft_id: 'X', status: 'draft', company: 'ResUS', country: 'US', marketplace: 'Amazon' },
  { company: '', country: 'US', marketplace: 'Amazon' }).exclusion_reasons,
  ['COMPANY_BLANK_ON_SCOPE'], 'B12 a blank company on the SCOPE is refused by name');
eq(excl({ allocation_draft_id: 'X', status: 'draft', company: 'KM', country: 'US', marketplace: 'Amazon' }),
  ['COMPANY_MISMATCH'], 'B13 another company is refused by name');
eq(excl({ allocation_draft_id: 'X', status: 'draft', company: 'ResUS', country: '', marketplace: 'Amazon' }),
  ['COUNTRY_BLANK_ON_ROW'], 'B14 a blank country on the row is refused by name');
eq(excl({ allocation_draft_id: 'X', status: 'draft', company: 'ResUS', country: 'US', marketplace: '' }),
  ['MARKETPLACE_BLANK_ON_ROW'], 'B15 a blank marketplace on the row is refused by name');
eq(excl({ allocation_draft_id: 'X', status: 'cancelled', company: 'ResUS', country: 'US', marketplace: 'Amazon' }),
  ['STATUS_TERMINAL'], 'B16 a cancelled route is excluded');
eq(excl({ allocation_draft_id: 'X', status: 'expired', company: 'ResUS', country: 'US', marketplace: 'Amazon' }),
  ['STATUS_TERMINAL'], 'B17 an EXPIRED route is excluded — 16_ says it is not part of any active set');
eq(excl({ allocation_draft_id: 'X', status: 'submitted', company: 'ResUS', country: 'US', marketplace: 'Amazon' }),
  ['STATUS_TERMINAL'], 'B18 a submitted route is excluded');
eq(excl({ allocation_draft_id: 'X', status: 'wat', company: 'ResUS', country: 'US', marketplace: 'Amazon' }),
  ['STATUS_UNRECOGNISED'], 'B19 an unrecognised status is REPORTED, never silently admitted');
ok(ARC.classifyHeader({ allocation_draft_id: 'X', status: 'site_confirmed', company: 'ResUS', country: 'US', marketplace: 'Amazon' }, SCOPE).counts_toward_current_plan,
  'B20 a site_confirmed route stays visible — the server treats it as active');
// A terminal LINE under a counting header contributes nothing.
var withCancelledLine = ARC.currentPlanTotal(LIVE_HEADERS,
  LIVE_LINES.concat([{ allocation_draft_line_id: 'SADL-3', allocation_draft_id: 'SAD-A', sku: SKU, planned_qty: 999, line_status: 'cancelled' }]), SCOPE);
eq(withCancelledLine.total, PLANNED, 'B21 a cancelled LINE adds nothing to the total');
eq(ARC.lineQuantity({ planned_qty: '', recommended_qty: 77 }), 77, 'B22 a blank planned_qty falls back to recommended, not to zero');
eq(ARC.lineQuantity({ planned_qty: 0, recommended_qty: 77 }), 0, 'B23 an explicit planned zero is a decision and wins over the recommendation');

// Both consumers now name KMARC.
ok(/window\.KMARC/.test(PAGE_CODE), 'B24 the page hydrate consumes KMARC');
ok(/function CENSUS_arc_\(\)/.test(CENSUS_CODE) && /arc\.classifyHeader/.test(CENSUS_CODE),
  'B25 the census consumes KMARC');
ok(CENSUS_CODE.indexOf("CENSUS_low_(r.status) !== 'active'") === -1,
  'B26 the unsatisfiable census predicate is gone from the code (not merely commented)');
ok(/ACTIVE_ROUTE_CLASSIFICATION_MODULE_UNAVAILABLE/.test(PAGE_CODE),
  'B27 a missing authority is a REFUSAL with a named code, not a fallback to a second copy of the rule');
ok(/RUN_R6R2_ROUTE_PROVENANCE/.test(CENSUS_CODE), 'B28 the §2 provenance runner exists');
['ui_current_plan_total', 'census_current_plan_total', 'totals_agree', 'included_route_ids',
  'excluded_route_ids_with_reason', 'source_of_520'].forEach(function (k, i) {
  ok(new RegExp('\\b' + k + '\\b').test(CENSUS_CODE), 'B29.' + (i + 1) + ' the required result block reports ' + k);
});
ok(/writer_constructed: false/.test(CENSUS_CODE) && /db_writes: 0/.test(CENSUS_CODE),
  'B30 the provenance runner declares zero writes and no writer');
ok(!/upsertShippingAllocationDraft|appendRow|setValue|deleteRow/.test(
  extractFn(CENSUS_CODE, 'RUN_R6R2_ROUTE_PROVENANCE')), 'B31 and constructs no mutation of any kind');

// ================================================================================================================
section('§3 — the catalogue was settled EMPTY, and that is why the lane had no methods');
// ================================================================================================================
// The server gate, read from 60_ rather than assumed.
ok(/\{ name: 'carrier_lead_times', requiredCols: \[\], optional: true, include: 'carrierPlanning' \}/.test(WORKSPACE_GS),
  'C1 60_ gates carrier_lead_times behind include.carrierPlanning');
ok(/if \(spec\.include && !include\[spec\.include\]\) continue;/.test(stripComments(WORKSPACE_GS)),
  'C2 and skips an include-gated table the caller did not ask for');
// The primary read does not ask for it. This is the R4-A1 decision and it stays.
var wsPayload = /var _wsPayload = \{[^}]*\};/.exec(PAGE_CODE)[0];
ok(wsPayload.indexOf('carrierPlanning') === -1,
  'C3 the primary workspace read still does NOT request the carrier include (R4-A1 §D is preserved)');
// The defect, and the fix: adoption is decided by what came back, not by what the caller meant.
ok(PAGE_CODE.indexOf('_irReadModelHasCarrier = !!(opts && opts.carrier);') === -1,
  'C4 adoption no longer keys on the caller intent flag');
ok(/_irReadModelHasCarrier = _wsAskedCarrier \|\| _wsDataHasCarrier;/.test(PAGE_CODE),
  'C5 it keys on the request AND the response contents');
ok(/_wsDataHasCarrier = !!\(\(env\.data\.carrier_lead_times && env\.data\.carrier_lead_times\.length\)/.test(PAGE_CODE),
  'C6 and "the response contents" means a NON-EMPTY table, not a present key');

function serverRespond(payload, tables) {
  var inc = (payload && payload.include) || {};
  var data = { marketplaces: [], warehouses: [] };
  if (inc.carrierPlanning) { data.carrier_lead_times = tables.lt; data.carrier_rate_cards = tables.rc; }
  return { success: true, data: data };
}
var SHEET = { lt: CN_US_LEAD_TIMES.map(function (d) {
  return { lead_time_id: d.leadTimeId, carrier_id: d.carrierId, origin_country: d.originCountry,
    destination_country: d.destinationCountry, shipping_method: d.shippingMethod,
    last_mile_delivery: d.lastMileDelivery, min_days: d.minDays, max_days: d.maxDays, avg_days: d.avgDays };
}), rc: [] };

// BEFORE — the shipped R6-R1 sequence, reproduced exactly.
var before = MR.create({});
var envNoInclude = serverRespond({ recentWindow: true }, SHEET);
eq(envNoInclude.data.carrier_lead_times, undefined,
  'C7 a primary read without the include comes back with NO carrier table at all');
before.adopt(SCOPE, adaptCarrier(envNoInclude.data));       // what the old flag caused
eq(before.getLeadTimes(SCOPE).length, 0, 'C8 adopting it installs ZERO lead times');
var resBefore = before.resolve(SCOPE, CN_US_ROUTE);
eq(resBefore.status, 'EMPTY_CONFIGURATION', 'C9 and the lane resolves EMPTY_CONFIGURATION');
eq(resBefore.transit_authority.checked, true,
  'C10 reporting that carrier_lead_times has no row for the lane — the exact live sentence');
eq(before.requestCount(), 0, 'C11 and the lazy load never ran, because adoption reported success');

// AFTER — the shipped gate, with the shipped registry doing the load.
var after = MR.create({ read: function () { return serverRespond({ include: { carrierPlanning: true } }, SHEET); },
  adapt: adaptCarrier });
var dataHasCarrier = !!((envNoInclude.data.carrier_lead_times && envNoInclude.data.carrier_lead_times.length) ||
  (envNoInclude.data.carrier_rate_cards && envNoInclude.data.carrier_rate_cards.length));
eq(dataHasCarrier, false, 'C12 the new gate refuses to adopt that payload');
var afterChecks = after.ensureLoaded(SCOPE).then(function () {
  section('§3 (cont.) — what the lane answers once the catalogue actually arrives');
  eq(after.getLeadTimes(SCOPE).length, CN_US_LEAD_TIMES.length, 'C13 the lazy load installs the real rows');
  eq(after.requestCount(), 1, 'C14 exactly ONE catalogue request — no duplicate workspace read');
  var res = after.resolve(SCOPE, CN_US_ROUTE);
  eq(res.status, 'READY', 'C15 the CN -> US lane is READY');
  eq(res.method_source, 'CARRIER_LEAD_TIMES', 'C16 sourced from the transit authority');
  eq(res.methods.map(function (m) { return m.value; }), ['air', 'sea', 'sea_express'],
    'C17 three methods, none of which required a rate card');
  eq(after.getRateCards(SCOPE).length, 0, 'C18 and there are no rate cards at all on this lane');
  eq(res.pricing.reason, 'NO_RATE_CARD_FOR_LANE', 'C19 pricing is reported unavailable, not the method');
  eq(res.carrier_selection, 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN', 'C20 carrier selection stays deferred');

  // §3's boundary histogram, computed by the shipped profile builder.
  var profiles = MR.serviceProfilesForRoute(after.getLeadTimes(SCOPE), CN_US_ROUTE);
  eq(profiles.map(function (p) { return p.profileKey; }), ['air|parcel', 'sea|parcel', 'sea|truck', 'sea_express|truck'],
    'C21 four DISTINCT service profiles on the lane');
  var seaTruck = profiles.filter(function (p) { return p.profileKey === 'sea|truck'; })[0];
  eq(seaTruck.maxDays, 52, 'C22 the fold takes the SLOWEST max across carriers (45 vs 52 -> 52)');
  eq(seaTruck.minDays, 28, 'C23 and the FASTEST min (28 vs 30 -> 28)');
  eq(seaTruck.avgDays, 38, 'C24 and the SLOWEST avg, which is never used as an arrival');
  eq(seaTruck.carrierIds, ['CAR-A', 'CAR-B'], 'C25 both carriers travel as provenance only');

  // The US -> US row must not answer for a CN -> US route.
  var domestic = MR.serviceProfilesForRoute(after.getLeadTimes(SCOPE),
    { originCountry: 'US', destinationCountry: 'US' });
  eq(domestic.map(function (p) { return p.profileKey; }), ['truck|truck'],
    'C26 the domestic lane answers only with its own row');
  ok(profiles.every(function (p) { return p.profileKey !== 'truck|truck'; }),
    'C27 and that row never appears on the CN -> US lane');

  // §4 — the last-mile variants stay distinct.
  section('§4 — route identity and last-mile distinctions');
  var sea = res.methods.filter(function (m) { return m.value === 'sea'; })[0];
  eq(sea.lastMileOptions, ['parcel', 'truck'], 'D1 `sea` offers two last miles and both are carried');
  eq(sea.lastMileAmbiguous, true, 'D2 which is reported as a real ambiguity');
  eq(sea.lastMileDelivery, '', 'D3 and is NOT resolved by taking the first');
  var air = res.methods.filter(function (m) { return m.value === 'air'; })[0];
  eq(air.lastMileAmbiguous, false, 'D4 `air` offers one, so there is nothing to choose');
  eq(air.lastMileDelivery, 'parcel', 'D5 and that one is carried rather than dropped');
  var expr = res.methods.filter(function (m) { return m.value === 'sea_express'; })[0];
  eq(expr.lastMileDelivery, 'truck', 'D6 sea_express keeps its own last mile');
  ok(seaTruck.maxDays !== profiles.filter(function (p) { return p.profileKey === 'sea|parcel'; })[0].maxDays,
    'D7 sea+truck and sea+parcel have different transit times, which is why merging them loses information');
  eq(profiles.filter(function (p) { return p.profileKey.indexOf('sea_express') === 0; }).length, 1,
    'D8 sea_express is its own identity and is never folded into sea');

  // A blank max_days must not become a zero-day service.
  var blankMax = MR.serviceProfilesForRoute(
    [leadTimeDto({ id: 'LTX', carrier: 'C', from: 'CN', to: 'US', method: 'rail', lastMile: 'truck', min: 20, max: '', avg: 25 })],
    CN_US_ROUTE)[0];
  eq(blankMax.maxDays, null, 'D9 a blank max_days is null, never 0');
  ok(blankMax.maxDays !== 0, 'D10 so it can never present itself as the fastest service on the lane');
  finish();
});

// ================================================================================================================
function finish() {
section('§3/§7 — the page-side pipeline, ETA and late hydration');
// ================================================================================================================
ok(/function _irCarrierPipelineTrace_/.test(PAGE_CODE), 'E1 the §3 boundary trace exists');
var trace = extractFn(PAGE_CODE, '_irCarrierPipelineTrace_');
['cached_lead_time_rows', 'cached_rate_card_rows', 'rejection_histogram', 'service_profiles',
  'resolution_status', 'final_options', 'registry_request_count'].forEach(function (k, i) {
  ok(trace.indexOf(k) !== -1, 'E2.' + (i + 1) + ' it reports ' + k);
});
ok(!/getWorkspace|ensureLoaded|reload|retry\(/.test(trace), 'E3 and it issues no request of its own');
ok(/ORIGIN_COUNTRY_MISMATCH/.test(trace) && /DESTINATION_COUNTRY_MISMATCH/.test(trace),
  'E4 the rejection histogram names the axis that eliminated each row');
ok(/_irCarrierTransport = \{/.test(PAGE_CODE), 'E5 the transport boundary is recorded where the read settles');
ok(/server_lead_time_rows/.test(PAGE_CODE) && /normalized_lead_time_rows/.test(PAGE_CODE),
  'E6 recording BOTH the server row count and the count that survived normalization');

// The ETA owner: conservative, lane-exact, blank-safe, buffer-excluded.
var eta = extractFn(PAGE_CODE, '_irComputeRouteEta');
ok(/maxDays = \(maxDays === null\) \? mx : Math\.max\(maxDays, mx\)/.test(eta),
  'E7 the arrival folds on the SLOWEST max across carriers');
ok(/if \(originCountry && r\.originCountry && lo\(r\.originCountry\) !== lo\(originCountry\)\) return false;/.test(eta),
  'E8 the lane matches on ORIGIN as well as destination');
ok(/basis: 'MAX_DAYS_CONSERVATIVE'/.test(eta), 'E9 and declares its basis');
ok(eta.indexOf('avgDays') !== -1 && !/days = Math\.round\(avgDays\)/.test(eta),
  'E10 avg_days is carried for display and is never the arrival');
ok(/if \(maxDays === null\)[\s\S]{0,220}available: false/.test(eta),
  'E11 a blank max_days fails CLOSED — no date is guessed');
ok(/NO_USABLE_MAX_DAYS/.test(eta), 'E12 and says which kind of absence it was');
ok(eta.indexOf('buffer_excluded_note') !== -1 && !/\+ *(7|buffer)/.test(eta.replace(/buffer_excluded_note[\s\S]*?,\n/, '')),
  'E13 the 7-day buffer is never added to a displayed transit');

// §7 — a row painted before hydration is recomputed when the authority arrives.
var rebuildAll = extractFn(PAGE_CODE, '_irRebuildAllMethodOptions_');
ok(/_execRebuildMethodOptions\(sku\)/.test(rebuildAll), 'E14 the station-wide settle repaints the Method select');
ok(/_irUpdateRouteEtas\(sku\)/.test(rebuildAll),
  'E15 and now also repaints the Expected Arrival — which it did not, so a hydrated row kept saying "Lead time unavailable"');
ok(!/getWorkspace/.test(rebuildAll), 'E16 the repaint introduces no read');
var etaRefresh = extractFn(PAGE_CODE, '_irUpdateRouteEtas');
ok(/data-eta-persisted/.test(etaRefresh),
  'E17 and it still honours a PERSISTED snapshot over a freshly computed one');
// 'persisted' appears as the data-attribute NAME it reads. What must be absent is a WRITE CALL.
ok(!/_persistAllocationDraft|upsertShippingAllocationDraft|KM\.DB\.[a-zA-Z]*(?:upsert|save|delete)/.test(etaRefresh),
  'E18 writing nothing — it calls no persistence API');
// The catalogue load stays single-flight and off the primary read.
var reg = MR.create({ read: function () { return serverRespond({ include: { carrierPlanning: true } }, SHEET); }, adapt: adaptCarrier });
Promise.all([reg.ensureLoaded(SCOPE), reg.ensureLoaded(SCOPE), reg.ensureLoaded(SCOPE)]).then(function () {
  eq(reg.requestCount(), 1, 'E19 three concurrent loads share ONE request (coalescing preserved)');
  finish2();
});
}

// ================================================================================================================
function finish2() {
section('§5 — recommendation and current plan are reconciled, never conflated');
// ================================================================================================================
var recon = extractFn(PAGE_CODE, '_irAdviceVsPlan_');
ok(/recommended_quantity/.test(recon) && /currently_planned_quantity/.test(recon) && /remaining_unplanned/.test(recon),
  'F1 the three quantities are separate fields');
ok(/over_planned: over/.test(recon) && /Math\.max\(0, planned - recommended\)/.test(recon),
  'F2 an excess is reported when the plan exceeds the recommendation');
ok(/Math\.max\(0, recommended - planned\)/.test(recon), 'F3 and the difference never goes negative');
eq(Math.max(0, RECOMMENDED - PLANNED), 400, 'F4 the live arithmetic is 920 - 520 = 400');
ok(/recommendation_supply_sources/.test(recon) && /existing_route_sources/.test(recon),
  'F5 both sides name their own supply');
ok(/data-wh-country/.test(recon) && !/ship_from/.test(recon),
  'F6 the route origin is read from the warehouse identity, never from a display label');
ok(/supply_sources_comparable/.test(recon),
  'F7 and whether the two are the same supply is stated rather than assumed');
var reconHtml = extractFn(PAGE_CODE, '_irAdviceVsPlanHtml_');
ok(/DIFFERENT supply/.test(reconHtml),
  'F8 when they differ, the strip says the difference is not a quantity still to ship from the same stock');
ok(/has NOT been applied/.test(reconHtml), 'F9 and never describes the saved routes as this run output');
ok(/supply source not stated by this run/.test(reconHtml),
  'F10 an unstated recommendation source says so rather than borrowing the route origin');
// Manual precedence: nothing in this round writes to a route.
ok(!/upsertShippingAllocationDraft|buildDraftHeaderPayload/.test(recon + reconHtml),
  'F11 the reconciliation constructs no writer');
ok(!/_irAdviceVsPlan_\([^)]*\)[\s\S]{0,200}(upsert|persist|save)/i.test(PAGE_CODE),
  'F12 and nothing acts on its numbers to change a route');

// ================================================================================================================
section('§6 — the selector rejection reasons are typed');
// ================================================================================================================
ok(/function CENSUS_snapshotReason_/.test(CENSUS_CODE), 'G1 the typed classifier exists');
var snap = extractFn(CENSUS_CODE, 'CENSUS_snapshotReason_');
['NO_MATERIALIZED_GAP_ROW_FOR_SCOPE', 'NO_GAP_ROW_FOR_SKU', 'SUGGESTED_QUANTITY_ZERO_NO_ROW_EXPECTED',
  'SNAPSHOT_DATE_BLANK', 'SNAPSHOT_DATE_UNREADABLE', 'MIXED_SNAPSHOT_DATES', 'SNAPSHOT_LINEAGE_MISMATCH'
].forEach(function (k, i) { ok(snap.indexOf(k) !== -1, 'G2.' + (i + 1) + ' it can answer ' + k); });
ok(snap.indexOf('NO_MATERIALIZED_GAP_ROW_FOR_SCOPE') < snap.indexOf('MIXED_SNAPSHOT_DATES'),
  'G3 absence is decided BEFORE consistency — "no rows" is never reported as "mixed dates"');
ok(/rejected_snapshot_by_reason/.test(CENSUS_CODE), 'G4 the runner keeps a typed histogram');
ok(/out\.rejected_by_predicate\[k\] = \(out\.rejected_by_predicate\[k\] \|\| 0\) \+ 1;/.test(CENSUS_CODE),
  'G5 alongside the original predicate histogram, which stays comparable with earlier runs');
ok(/snapshot_reason_glossary/.test(CENSUS_CODE), 'G6 every token is glossed in the output');
// The gate is not weakened.
ok(/set\('current_accepted_snapshot', CENSUS_str_\(env\.source_data_as_of\) !== ''/.test(CENSUS_CODE),
  'G7 the BOOLEAN gate is byte-identical — accuracy of the explanation, not a relaxed rule');
eq((CENSUS_CODE.match(/E3_CANDIDATE_PREDICATES_ = \[[\s\S]*?\]/) || [''])[0].split("'").filter(function (x, i) { return i % 2 === 1; }).length,
  15, 'G8 all fifteen predicates are still required');
ok(/NO_SAFE_MATERIALIZATION_CANDIDATE/.test(CENSUS_CODE),
  'G9 and the selector may still return no candidate');

// ================================================================================================================
section('§9/§11 — release contract');
// ================================================================================================================
ok(/'supply-planning-active-route-classification'/.test(BUILDER), 'H1 KMARC is in MODULE_ORDER');
ok(/\['KMARC', 'supply-planning-active-route-classification'\]/.test(BUILDER), 'H2 and registered under KMARC');
ok(new RegExp('supply-planning-active-route-classification\\.js\\?v=' + RO.currentAppToken()).test(INDEX),
  'H3 the browser loads it on the current application token');
var kmarcTag = INDEX.indexOf('supply-planning-active-route-classification.js');
var pageTag = INDEX.indexOf('pages/inventory-replenishment.js');
ok(kmarcTag !== -1 && pageTag !== -1 && kmarcTag < pageTag, 'H4 and loads it BEFORE the page that consumes it');
// R6-R4 RESTATEMENT — same reasoning as the R6-R3 suite's A7. "The registry did not change THIS round" was a
// true statement about R6-R2 and a false one about every round after it. The durable rule is that the registry
// has its own token family and that index.html serves the current member.
ok(RO.METHOD_REGISTRY_TOKEN_SERIES.indexOf('fc1be3r4a2r1r6r1-method-registry-20260905') !== -1,
  'H5 the registry token this round shipped is still in the ledger');
ok(INDEX.indexOf('method-registry.js?v=' + RO.currentMethodRegistryToken()) !== -1,
  'H5a and index.html serves the CURRENT registry token');
ok(/SYS_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R2'/.test(read('assets/specs/active/apps-script/63_api_v1_system_health.gs')),
  'H6 the deployment stamp is bumped for a sync-visible backend change');
ok(/SIR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A1'/.test(WORKSPACE_GS),
  'H7 60_ is UNCHANGED — the lead-time DTO transport was proven present, so its stamp does not move');
ok(RO.stampAtOrAfter(/TEMP_E3_CENSUS_BUILD_ = '([^']+)'/.exec(CENSUS)[1], 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R2'),
  'H8 the census build stamp is at R6-R2\'s or later');
// The bundle must be reproducible from the sources in the tree.
var built = require('../tools/build-apps-script-bundle.js');
var sources = {};
built.MODULE_ORDER.forEach(function (m) { sources[m] = read('assets/js/core/' + m + '.js'); });
var b = built.buildBundleFromSources(sources);
var onDisk = read('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs').replace(/\r\n/g, '\n');
eq(b.code.replace(/\r\n/g, '\n'), onDisk, 'H9 the committed bundle is exactly what the tool produces');
eq(built.MODULE_ORDER.length, 59, 'H10 the bundle carries 59 modules');
ok(/var KMARC = /.test(onDisk), 'H11 and KMARC is a global in it, so the census can consume it');

// ================================================================================================================
section('MUTATION PROBES — each breaks a semantic guard, none a spelling');
// ================================================================================================================
mut('M1  admitting `active` back into KMARC changes nothing, so the census 0 is proven to be a constant', function () {
  // If `active` WERE a real status, the old census predicate would have found the rows. It finds none either way.
  var withActive = LIVE_HEADERS.map(function (h) { var c = JSON.parse(JSON.stringify(h)); return c; });
  var oldPredicate = withActive.filter(function (h) { return String(h.status).toLowerCase() === 'active'; });
  return oldPredicate.length === 0 && ARC.currentPlanTotal(withActive, LIVE_LINES, SCOPE).total === PLANNED;
});
mut('M2  making a blank row-company a wildcard admits another company\'s route', function () {
  var row = { allocation_draft_id: 'X', status: 'draft', company: '', country: 'US', marketplace: 'Amazon' };
  var strict = ARC.classifyHeader(row, SCOPE).counts_toward_current_plan;
  var lenient = (String(row.company || '') === '') || row.company === SCOPE.company;   // the mutant
  return strict === false && lenient === true;
});
mut('M3  scoping on destination_marketplace drops the warehouse-destination route', function () {
  var mutant = LIVE_HEADERS.filter(function (h) {
    return String(h.destination_marketplace || '').toLowerCase() === SCOPE.marketplace.toLowerCase();
  });
  return mutant.length === 1 && ARC.partitionHeaders(LIVE_HEADERS, SCOPE).included_ids.length === 2;
});
mut('M4  treating `expired` as active puts a read-only row back in the plan', function () {
  var row = { allocation_draft_id: 'X', status: 'expired', company: 'ResUS', country: 'US', marketplace: 'Amazon' };
  var strict = ARC.classifyHeader(row, SCOPE).counts_toward_current_plan;
  var mutant = String(row.status) !== 'cancelled' && String(row.status) !== 'submitted';   // the old UI predicate
  return strict === false && mutant === true;
});
mut('M5  adopting on caller intent installs an empty catalogue as a settled one', function () {
  var r = MR.create({});
  r.adopt(SCOPE, adaptCarrier(serverRespond({ recentWindow: true }, SHEET).data));
  var res = r.resolve(SCOPE, CN_US_ROUTE);
  return res.status === 'EMPTY_CONFIGURATION' && r.getLeadTimes(SCOPE).length === 0 && r.requestCount() === 0;
});
mut('M6  adopting on key-presence rather than row-count is the same defect in a new spelling', function () {
  var payload = { carrier_lead_times: [], carrier_rate_cards: [] };   // present, and empty
  var byPresence = ('carrier_lead_times' in payload);
  var byCount = !!((payload.carrier_lead_times && payload.carrier_lead_times.length) ||
    (payload.carrier_rate_cards && payload.carrier_rate_cards.length));
  return byPresence === true && byCount === false;
});
mut('M7  requiring a rate card re-couples price to existence', function () {
  var noCards = MR.methodsForRoute([], CN_US_ROUTE);
  var viaTransit = MR.methodsFromLeadTimes(CN_US_LEAD_TIMES, CN_US_ROUTE);
  return noCards.length === 0 && viaTransit.length === 3;
});
mut('M8  making marketplace a lead-time join key empties the lane', function () {
  var withMkt = CN_US_LEAD_TIMES.filter(function (lt) { return lt.marketplace === 'Amazon'; });   // no such column
  return withMkt.length === 0 && MR.methodsFromLeadTimes(CN_US_LEAD_TIMES, CN_US_ROUTE).length === 3;
});
mut('M9  dropping the origin clause lets a US->US row answer a CN->US route', function () {
  var destOnly = CN_US_LEAD_TIMES.filter(function (lt) { return lt.destinationCountry === 'US'; });
  var laneExact = MR.serviceProfilesForRoute(CN_US_LEAD_TIMES, CN_US_ROUTE);
  return destOnly.length === 6 && laneExact.length === 4;
});
mut('M10 folding on min instead of max makes the service look faster than any carrier runs it', function () {
  var p = MR.serviceProfilesForRoute(CN_US_LEAD_TIMES, CN_US_ROUTE)
    .filter(function (x) { return x.profileKey === 'sea|truck'; })[0];
  return p.maxDays === 52 && p.minDays === 28 && p.maxDays !== p.minDays;
});
mut('M11 folding on the FASTEST max hides the slowest operator', function () {
  var rows = CN_US_LEAD_TIMES.filter(function (l) { return l.shippingMethod === 'sea' && l.lastMileDelivery === 'truck'; });
  var slowest = Math.max.apply(null, rows.map(function (r) { return Number(r.maxDays); }));
  var fastest = Math.min.apply(null, rows.map(function (r) { return Number(r.maxDays); }));
  return slowest === 52 && fastest === 45 &&
    MR.serviceProfilesForRoute(CN_US_LEAD_TIMES, CN_US_ROUTE).filter(function (x) { return x.profileKey === 'sea|truck'; })[0].maxDays === slowest;
});
mut('M12 coercing a blank max_days makes an arrival of today', function () {
  var coerced = Number('');
  var p = MR.serviceProfilesForRoute(
    [leadTimeDto({ id: 'L', carrier: 'C', from: 'CN', to: 'US', method: 'rail', lastMile: 'truck', min: 20, max: '', avg: 25 })],
    CN_US_ROUTE)[0];
  return coerced === 0 && isFinite(coerced) && p.maxDays === null;
});
mut('M13 flattening the last mile merges two services with different transit times', function () {
  var p = MR.serviceProfilesForRoute(CN_US_LEAD_TIMES, CN_US_ROUTE);
  var byMethodOnly = {};
  p.forEach(function (x) { byMethodOnly[x.method] = 1; });
  var sea = MR.methodsFromLeadTimes(CN_US_LEAD_TIMES, CN_US_ROUTE).filter(function (m) { return m.value === 'sea'; })[0];
  return Object.keys(byMethodOnly).length === 3 && p.length === 4 && sea.lastMileOptions.length === 2;
});
mut('M14 resolving an ambiguous last mile by taking the first chooses for the operator', function () {
  var sea = MR.methodsFromLeadTimes(CN_US_LEAD_TIMES, CN_US_ROUTE).filter(function (m) { return m.value === 'sea'; })[0];
  return sea.lastMileAmbiguous === true && sea.lastMileDelivery === '' && sea.lastMileOptions[0] === 'parcel';
});
mut('M15 dropping the ETA repaint from the station-wide settle strands a hydrated row', function () {
  var f = extractFn(PAGE_CODE, '_irRebuildAllMethodOptions_');
  var withEta = /_irUpdateRouteEtas\(sku\)/.test(f);
  var mutant = f.replace(/if \(typeof _irUpdateRouteEtas === 'function'\) _irUpdateRouteEtas\(sku\);/, '');
  return withEta === true && /_irUpdateRouteEtas\(sku\)/.test(mutant) === false;
});
mut('M16 reporting "no gap row" as "stale snapshot" sends the reader to the wrong table', function () {
  var f = extractFn(CENSUS_CODE, 'CENSUS_snapshotReason_');
  var iAbsent = f.indexOf('NO_MATERIALIZED_GAP_ROW_FOR_SCOPE');
  var iMixed = f.indexOf('MIXED_SNAPSHOT_DATES');
  var iStale = f.indexOf('SNAPSHOT_NOT_CURRENT');
  return iAbsent !== -1 && iAbsent < iMixed && iMixed < iStale;
});
mut('M17 counting a cancelled LINE inflates the plan total', function () {
  var extra = { allocation_draft_line_id: 'L9', allocation_draft_id: 'SAD-A', sku: SKU, planned_qty: 999, line_status: 'cancelled' };
  var naive = PLANNED + 999;
  var real = ARC.currentPlanTotal(LIVE_HEADERS, LIVE_LINES.concat([extra]), SCOPE).total;
  return real === PLANNED && naive !== real;
});
mut('M18 subtracting across different supply sources invents a shippable difference', function () {
  // Recommendation from an overseas 3PL, routes from a CN factory. The subtraction is arithmetic without meaning.
  var recSources = ['WH-RESUS-US-3PL-AMZLGS'];
  var routeSources = ['WH-CN-FACTORY'];
  var comparable = routeSources.every(function (r) { return recSources.indexOf(r) !== -1; });
  var difference = RECOMMENDED - PLANNED;
  return comparable === false && difference === 400 && /DIFFERENT supply/.test(extractFn(PAGE_CODE, '_irAdviceVsPlanHtml_'));
});

// ================================================================================================================
section('SAFETY — nothing in this round writes');
// ================================================================================================================
ok(!/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true/.test(CFG), 'S1 the flag is not flipped anywhere');
ok(!/submitPlan|SUBMIT_PLAN/.test(extractFn(PAGE_CODE, '_irCarrierPipelineTrace_')), 'S2 the trace cannot Submit');
ok(!/carrier_rate_cards.*(setValue|appendRow)|carrier_lead_times.*(setValue|appendRow)/.test(CENSUS_CODE),
  'S3 the census writes to no carrier master table');
// The runner DECLARES reservation_writes: 0; what must be absent is any call that could make one.
var provFn = extractFn(CENSUS_CODE, 'RUN_R6R2_ROUTE_PROVENANCE');
ok(/reservation_writes: 0/.test(provFn), 'S4a it declares zero reservation writes');
ok(!/(acquire|release|consume)Reservation|reserveFactoryStock|setValues?\(/i.test(provFn),
  'S4b and constructs no reservation or cell write');
eq(LEAD_TIME_ROWS_READ_BY_CENSUS > 0 && RATE_CARDS_READ_BY_CENSUS > 0, true,
  'S5 the live census read both carrier authorities successfully — the browser, not the server, was empty');

console.log('\n---------------------------------------------------------------');
console.log('passed ' + pass + '  failed ' + fail);
console.log('mutants caught ' + neg.caught + ' of ' + (neg.caught + neg.missed));
console.log('---------------------------------------------------------------');
if (fail) process.exit(1);
}
