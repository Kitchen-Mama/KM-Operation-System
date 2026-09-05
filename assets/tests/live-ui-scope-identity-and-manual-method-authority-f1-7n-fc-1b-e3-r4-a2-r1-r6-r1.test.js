// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R1 — LIVE UI SCOPE IDENTITY, MANUAL METHOD AUTHORITY, ADVICE/PLAN RECONCILIATION
// ----------------------------------------------------------------------------------------------------------------
// A live smoke test produced one screen with three separate defects on it, and each of them had been invisible to
// every offline suite because each lived in a place no suite was looking.
//
//   1. TWO ROUTES with "No eligible method" on a CN -> US lane that has perfectly good transit data. R5 removed
//      the rate-card coupling from the SERVER's route derivation and never touched method-registry.js, which is
//      what the manual composer asks. The old rule survived in the one place an operator actually clicks.
//
//   2. 760 ADVISED, 520 PLANNED, and nothing on screen relating the two. Every reading available to an operator
//      was wrong in a different direction: that the 760 had been applied, that the 520 was what the AI had just
//      produced, or that only a carrier was missing.
//
//   3. A HUNDRED-SKU RUN announced by its own reason code. R6 rewrote the notice on the DB-generation path; the
//      flag is off, so the live click has never reached a line of it.
//
// AND ONE THING THAT WAS NOT WRONG, WHICH MATTERS AS MUCH. §1 asks whether the page collapses KM/US/Amazon and
// ResUS/US/Amazon into one row. IT DOES NOT: option values are marketplace_ids, distinct ids are never merged,
// and `_replenSelectedScope` derives the company from the selected id. Reporting that as a defect would have been
// inventing work. What WAS wrong is narrower and worse: the hydrate treated company as OPTIONAL in both
// directions, so one legacy header with a blank company could be adopted into whichever company was on screen.
//
// Run: node assets/tests/live-ui-scope-identity-and-manual-method-authority-f1-7n-fc-1b-e3-r4-a2-r1-r6-r1.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');

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
function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src); if (!m) throw new Error('not found: ' + name);
  var start = m.index, i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function swap(src, find, repl) {
  if (src.indexOf(find) < 0) throw new Error('mutation target absent: ' + String(find).slice(0, 90));
  return src.replace(find, repl);
}
var PAGE = read('assets/js/pages/inventory-replenishment.js');
var REG_SRC = read('assets/js/core/method-registry.js');
var CSS = read('assets/css/pages/inventory-replenishment.css');
var INDEX = read('index.html');
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var RO = require('./_release-order.js');
var MR = require('../js/core/method-registry.js');

// The live evidence, verbatim. Nothing in this file may restate these numbers from anywhere else.
var SUGGESTED = 760, PLANNED_A = 320, PLANNED_B = 200, PLANNED = PLANNED_A + PLANNED_B, DIFFERENCE = SUGGESTED - PLANNED;

// ================================================================================================================
section('A. §4/§5 — a price list was still deciding whether a shipping method exists');
// ================================================================================================================
// The lane from the screenshot: a CN factory to a US destination, with transit data and NO rate card.
var CN_US = [
  { carrierId: 'CAR-A', originCountry: 'CN', destinationCountry: 'US', shippingMethod: 'sea', lastMileDelivery: 'truck', minDays: 30, avgDays: 38, maxDays: 45 },
  { carrierId: 'CAR-B', originCountry: 'CN', destinationCountry: 'US', shippingMethod: 'sea', lastMileDelivery: 'truck', minDays: 20, avgDays: 25, maxDays: 60 },
  { carrierId: 'CAR-A', originCountry: 'CN', destinationCountry: 'US', shippingMethod: 'sea', lastMileDelivery: 'parcel', minDays: 32, avgDays: 40, maxDays: 47 },
  { carrierId: 'CAR-C', originCountry: 'CN', destinationCountry: 'US', shippingMethod: 'sea_express', lastMileDelivery: 'truck', minDays: 18, avgDays: 22, maxDays: 26 },
  { carrierId: 'CAR-C', originCountry: 'CN', destinationCountry: 'US', shippingMethod: 'air', lastMileDelivery: 'parcel', minDays: 5, avgDays: 8, maxDays: 12 },
  { carrierId: 'CAR-D', originCountry: 'US', destinationCountry: 'US', shippingMethod: 'truck', lastMileDelivery: 'truck', minDays: 2, avgDays: 3, maxDays: 5 }
];
var LANE = { originCountry: 'CN', destinationCountry: 'US' };

ok(/carrier_lead_times/.test(REG_SRC) && /serviceProfilesForRoute/.test(REG_SRC),
  'A1  the registry consults the TRANSIT authority — it loaded carrier_lead_times all along and never read them');
var profiles = MR.serviceProfilesForRoute(CN_US, LANE);
eq(profiles.map(function (p) { return p.label; }),
   ['air + parcel', 'sea + parcel', 'sea + truck', 'sea_express + truck'],
  'A2  one profile per (method, last mile) — the pairs §4 lists, from real data only');
eq(profiles.filter(function (p) { return p.method === 'truck'; }).length, 0,
  'A2a and a US→US domestic service is NOT offered on a CN→US lane — the ORIGIN is matched, not just the destination');

// The conservative fold, which is the whole reason several carriers may share a profile.
var seaTruck = profiles.filter(function (p) { return p.profileKey === 'sea|truck'; })[0];
eq([seaTruck.minDays, seaTruck.avgDays, seaTruck.maxDays], [20, 38, 60],
  'A3  SLOWEST max and SLOWEST avg, FASTEST min — one quick carrier cannot make a service look quicker than ' +
  'the slowest operator who actually runs it');
eq(seaTruck.carrierIds, ['CAR-A', 'CAR-B'], 'A3a with every carrier carried as PROVENANCE');
eq(seaTruck.carrierSelection, 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN',
  'A4  §5 the carrier is DEFERRED — a carrier_id in a lead-time row is evidence a service exists, never a ' +
  'commercial decision');
ok(profiles.every(function (p) { return p.carrierSelection === 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN'; }),
  'A4a on every profile, without exception');

// MARKETPLACE IS NOT A JOIN KEY, and cannot become one: the table has no such column.
eq(MR.serviceProfilesForRoute(CN_US, { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon' }).length,
   profiles.length,
  'A5  §4 Amazon and the unspecified lane resolve the SAME services');
eq(MR.serviceProfilesForRoute(CN_US, { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Shopify' }).map(function (p) { return p.label; }),
   profiles.map(function (p) { return p.label; }),
  'A5a and Shopify resolves them too — one transit authority, shared by construction');
ok(!/marketplace/i.test(extractFn(REG_SRC, 'leadTimeOnLane')),
  'A5b because the lane match has no marketplace clause at all — not a rule someone remembered to write');

// A blank is not a zero. This is the KMRA defect class, in a second consumer.
var BLANK_MAX = [{ carrierId: 'C', originCountry: 'CN', destinationCountry: 'US', shippingMethod: 'sea',
  lastMileDelivery: 'truck', minDays: 30, avgDays: 38, maxDays: '' }];
eq(MR.serviceProfilesForRoute(BLANK_MAX, LANE)[0].maxDays, null,
  'A6  §6 a blank max_days is NULL, never 0 — Number("") is 0 and passes isFinite, which would make an empty ' +
  'cell the fastest service on the lane');
eq(MR.serviceProfilesForRoute([{ carrierId: 'C', originCountry: 'CN', destinationCountry: 'US',
  shippingMethod: 'sea', lastMileDelivery: 'truck', minDays: null, avgDays: undefined, maxDays: 45 }], LANE)[0],
   { profileKey: 'sea|truck', value: 'sea', method: 'sea', lastMileDelivery: 'truck', label: 'sea + truck',
     minDays: null, avgDays: null, maxDays: 45, carrierIds: ['C'],
     carrierSelection: 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN', source: 'CARRIER_LEAD_TIMES' },
  'A6a null and undefined likewise');

// The method options, in the shape the picker consumes.
var methods = MR.methodsFromLeadTimes(CN_US, LANE);
eq(methods.map(function (m) { return m.value; }), ['air', 'sea', 'sea_express'],
  'A7  distinct METHODS for the dropdown, under the canonical token the header persists');
eq(methods.filter(function (m) { return m.value === 'sea'; })[0].lastMileOptions, ['parcel', 'truck'],
  'A8  §5 carrying every last mile the method runs on');
eq(methods.filter(function (m) { return m.value === 'sea'; })[0].lastMileAmbiguous, true,
  'A8a and saying when there is a real choice to make');
eq(methods.filter(function (m) { return m.value === 'air'; })[0].lastMileDelivery, 'parcel',
  'A8b while an unambiguous one is resolved rather than left blank');
eq(methods.filter(function (m) { return m.value === 'sea_express'; })[0].lastMileAmbiguous, false,
  'A8c one profile, one last mile, no picker needed');

// ================================================================================================================
section('B. §4 — the registry resolution, end to end');
// ================================================================================================================
function reg(cards, leadTimes) {
  var r = MR.create({});
  r.adopt({ company: 'ResUS', country: 'US', marketplace: 'Amazon' },
    { getCarrierRateCards: cards, getCarrierLeadTimes: leadTimes });
  return r;
}
var rNoCard = reg([], CN_US).resolve({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }, LANE);
eq(rNoCard.status, 'READY', 'B1  a lane with transit data and NO rate card is READY — the reported defect is closed');
eq(rNoCard.method_source, 'CARRIER_LEAD_TIMES', 'B1a and it names the authority the answer came from');
eq(rNoCard.carrier_selection, 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN', 'B1b with the carrier deferred');
eq(rNoCard.pricing.available, false, 'B1c and pricing reported as unavailable, separately');
eq(rNoCard.pricing.reason, 'NO_RATE_CARD_FOR_LANE', 'B1d by name');
ok(rNoCard.methods.length === 3, 'B1e offering the three services the lane actually has');

// A lane that DOES have rate cards keeps its existing answer byte-for-byte: this is a fallback, not a takeover.
var CARDS = [{ carrierId: 'C1', originCountry: 'CN', destinationCountry: 'US', marketplace: '', shippingMethod: 'SEA',
  shippingMethodLabel: 'Sea', status: 'ACTIVE', effectiveFrom: '2026-01-01', effectiveTo: '2027-12-31' }];
var rCard = reg(CARDS, CN_US).resolve({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }, LANE);
eq(rCard.method_source, 'CARRIER_RATE_CARDS', 'B2  a lane WITH a rate card still answers from the rate card');
eq(rCard.methods.map(function (m) { return m.value; }), ['SEA'], 'B2a with exactly what the card holds');

// Both silent: the sentence must name the table that is actually missing.
var rNone = reg([], []).resolve({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }, LANE);
eq(rNone.status, 'EMPTY_CONFIGURATION', 'B3  both authorities silent → an EMPTY CONFIGURATION, not an error');
eq(rNone.transit_authority.missing_table, 'carrier_lead_times',
  'B3a and it names carrier_lead_times — sending an operator to add a rate card would be the wrong table');
ok(/carrier_lead_times has no row for it either/.test(PAGE),
  'B3b and the page says so in the option itself');

// ================================================================================================================
section('C. §1 — company was the one axis the hydrate treated as optional');
// ================================================================================================================
var NLCH = String.fromCharCode(10);
var hydrate = extractFn(PAGE, '_hydrateAllocationDraftFromDb');
// The old clause is QUOTED in the comment that explains why it was wrong, so a naive search finds it and
// reports the defect as still present — the same prose-matching mistake this round keeps catching elsewhere.
// The assertion runs on the code with its comments removed.
var hydrateCode = hydrate.split(NLCH).filter(function (l) { return l.trim().indexOf('//') !== 0; }).join(NLCH);
ok(!/\(!ctx\.company \|\| !d\.company \|\| lo\(d\.company\) === lo\(ctx\.company\)\)/.test(hydrateCode),
  'C1  the permissive company clause is GONE — a blank on either side was a wildcard in both directions');
ok(/if \(!lo\(d\.company\)\) \{ _excludedNoRowCompany\+\+; return false; \}/.test(hydrate),
  'C2  a stored row that names NO company is never adopted into a named company');
ok(/if \(lo\(d\.company\) !== _scopeCompany\) \{ _excludedOtherCompany\+\+; return false; \}/.test(hydrate),
  'C3  and another company’s row is never adopted either');
ok(/if \(!_scopeCompany\) return false;/.test(hydrate),
  'C4  an unknown page company hydrates NOTHING — fail-closed, because the alternative is adopting anything');
ok(/_irHydrateScopeAudit/.test(hydrate),
  'C5  and both exclusions are COUNTED and published — a route that vanishes without explanation is the ' +
  'failure mode this page keeps being asked about');
// The three-part identity, everywhere it matters.
ok(/company \+ country \+ marketplace, all three EXACT/.test(hydrate), 'C6  the rule is stated in the code');
ok(/company: s\.company, country: s\.country, marketplace: s\.marketplace/.test(extractFn(PAGE, '_replenCtx')),
  'C7  and the page context carries all three, which it always did');
ok(/marketplaceDisplayName \|\| m\.marketplace \|\| m\.marketplaceId/.test(PAGE),
  'C8  §1 the selector value is a marketplace_id — KM/US/Amazon and ResUS/US/Amazon are two options, never one');
ok(/labelCount\[o\.label\] > 1 && o\.company/.test(PAGE),
  'C8a with a company hint when two labels collide');
// And now the company is SHOWN, which is what §1 requires before Submit.
ok(/function _irScopeCompanyBadgeHtml_/.test(PAGE), 'C9  the company is rendered on the Execution Plan');
ok(/ir-scope-company--unknown/.test(PAGE) && /ir-scope-company--unknown/.test(CSS),
  'C9a including the unknown-company state, which is the one that hydrates nothing');
ok(/#ops-section \.ir-scope-company \{/.test(CSS), 'C9b and the stylesheet actually has the rule');

// ================================================================================================================
section('D. §3 — 760 and 520 on one screen, with nothing saying how they relate');
// ================================================================================================================
var vpCtx = vm.createContext({ Number: Number, String: String, Math: Math, JSON: JSON, isFinite: isFinite,
  document: null, window: {}, console: console });
vm.runInContext('var _irRecoByKey = {}; var _irIsComposerEl_ = function () { return false; };', vpCtx);
vm.runInContext(extractFn(PAGE, '_irAdviceVsPlan_'), vpCtx, { filename: 'ir:advicevsplan' });
function advice(recommended, qtys) {
  vpCtx._irRecoByKey = { 'CO1100-R': { suggestedQty: recommended } };
  vpCtx.document = { getElementById: function () {
    return { querySelectorAll: function () {
      return qtys.map(function (q) { return { querySelector: function () { return { value: q }; } }; });
    } };
  } };
  vpCtx.window = {};
  return vm.runInContext('_irAdviceVsPlan_("CO1100-R")', vpCtx);
}
var live = advice(SUGGESTED, [PLANNED_A, PLANNED_B]);
eq(live.recommended_quantity, SUGGESTED, 'D1  the live case: AI recommends 760');
eq(live.currently_planned_quantity, PLANNED, 'D2  currently planned 520 — the two routes ALREADY on screen');
eq(live.route_count, 2, 'D2a two of them');
eq(live.remaining_unplanned, DIFFERENCE, 'D3  difference 240, stated as a number rather than left to be computed');
eq(live.over_planned, 0, 'D3a and nothing over-planned');
eq(live.execution_plan_changed_by_this_run, false,
  'D4  §3 this run changed nothing — a FACT the page measured, not a reassurance');
eq(live.materialization_enabled, false, 'D4a with materialization off');
// The difference is never added on its own.
ok(/is not added automatically/.test(extractFn(PAGE, '_irAdviceVsPlanHtml_')),
  'D5  §3 and the strip says the difference is NOT added automatically');
ok(/has NOT been applied/.test(extractFn(PAGE, '_irAdviceVsPlanHtml_')),
  'D5a nor has the recommendation been applied');
ok(/These route\(s\) were already here/.test(extractFn(PAGE, '_irAdviceVsPlanHtml_')),
  'D6  §3 the 520 is named as pre-existing — it must never read as this run’s output');
// Over-planned is a real state and is reported as one.
var over = advice(200, [300]);
eq([over.remaining_unplanned, over.over_planned], [0, 100], 'D7  over-planning is its own number, not a negative remainder');
eq(advice(0, []).remaining_unplanned, 0, 'D7a and nothing recommended with nothing planned is not a difference');
ok(/Current Execution Plan/.test(PAGE), 'D8  the card is titled CURRENT — the word is load-bearing');
ok(/Currently planned total/.test(PAGE), 'D8a and so is the total’s label');

// ================================================================================================================
section('E. §6 — the arrival was the average, and the lane was half a lane');
// ================================================================================================================
var etaFn = extractFn(PAGE, '_irComputeRouteEta');
ok(/originCountry/.test(etaFn), 'E1  the lookup matches the ORIGIN country as well as the destination');
ok(/MAX_DAYS_CONSERVATIVE/.test(etaFn), 'E2  and the arrival is the CONSERVATIVE one');
ok(/maxDays = \(maxDays === null\) \? mx : Math\.max\(maxDays, mx\)/.test(etaFn),
  'E2a folded to the SLOWEST max across the carriers that run the service');
ok(/if \(typeof v === 'string' && v\.trim\(\) === ''\) return null;/.test(etaFn),
  'E3  a blank is checked BEFORE coercion — an empty max_days would otherwise arrive today');
ok(/NO_USABLE_MAX_DAYS/.test(etaFn),
  'E3a and a row that cannot answer says so rather than answering with a zero');
ok(/buffer_excluded_note/.test(etaFn) && /is NOT part/.test(etaFn),
  'E4  §6 the 7-day buffer is EXCLUDED from the displayed transit — it is our caution, not the carrier’s promise');
ok(!/\+ 7|buffer/.test(etaFn.replace(/buffer_excluded_note[\s\S]*?source: 'COMPUTED'/, '')),
  'E4a and it is not added anywhere in the calculation');
ok(/Lead time unavailable/.test(etaFn), 'E5  §6 no method or no lead time stays an explicit unavailable state');
ok(/range_text/.test(etaFn) && /earliest_date/.test(etaFn),
  'E6  §6 with the arrival RANGE available beside the single conservative date');

// ================================================================================================================
section('F. §5 — the last mile had nowhere to go, and now it does');
// ================================================================================================================
ok(/recommended_last_mile_delivery/.test(read('assets/js/core/supply-planning-weekly-route-derivation.js')),
  'F1  the ROUTE SCHEMA can hold a last mile — the K2 header builder writes it');
ok(/recommended_last_mile_delivery/.test(read('assets/specs/active/apps-script/69_api_v1_route_identity_contract.gs')),
  'F1a and it is a K4 route-IDENTITY dimension, so dropping it merges two distinct routes into one');
ok(/data-field="last_mile_delivery"/.test(PAGE), 'F2  the ROW can now hold it too — that was the missing half');
ok(/function _execLastMileOptionsHtml/.test(PAGE), 'F3  a picker appears when the method offers more than one');
ok(/if \(!m \|\| !m\.lastMileAmbiguous\) return '';/.test(extractFn(PAGE, '_execLastMileOptionsHtml')),
  'F3a and ONLY then — an unambiguous method carries its single value invisibly');
ok(/last_mile_delivery: fieldVal\('last_mile_delivery'\)/.test(PAGE),
  'F4  and the collect reads it back into the model');
ok(/#ops-section \.replen-card__method-cell \{/.test(CSS),
  'F5  the control sits INSIDE the existing Method track — no grid column was guessed at');
ok(/data-last-mile="/.test(PAGE), 'F6  every option carries the last mile it belongs to');

// ================================================================================================================
section('G. §7 — a hundred-SKU run announced by its own reason code');
// ================================================================================================================
var runFn = extractFn(PAGE, '_irAiPlanRun_');
ok(/AI recommendations refreshed for/.test(runFn), 'G1  the notice leads with WHAT RAN');
ok(/Advice generation COMPLETED/.test(runFn), 'G1a and says the advice half completed');
ok(/this is not a failure/.test(runFn), 'G1b §7 in as many words');
ok(/Execution Plans are UNCHANGED/.test(runFn), 'G2  §7 current Execution Plans unchanged');
ok(/nothing was written to the database/.test(runFn), 'G2a and nothing written');
ok(/feature flag/.test(runFn) && /OFF/.test(runFn), 'G3  §7 the materialization flag is named — AFTER the outcome');
ok(/need a route with a shipping/.test(runFn), 'G4  §7 with the count of SKUs needing a manual method');
ok(/Expand a SKU to see its recommended quantity/.test(runFn), 'G5  §7 and per-SKU detail is in the expanded row');
ok(runFn.indexOf('AI recommendations refreshed for') < runFn.indexOf('feature flag'),
  'G6  the reason code is no longer the headline — the outcome is stated first');
// The count is the BATCH's, and a single SKU's quantity is never presented as the total.
ok(/_nReco/.test(runFn) && !/760/.test(runFn),
  'G7  §7 one count, and it is the batch’s — no per-SKU quantity appears in a batch notice at all');
ok(/replen-ai-plan-result--warn|_irAiPlanTerminal_\('warn'/.test(runFn),
  'G8  §7 and the tone is warn/info, never a generic failure');

// ================================================================================================================
section('H. §2 — the census said zero and the screen showed two, and both were honest');
// ================================================================================================================
ok(/function CENSUS_uiVisibleDrafts_/.test(CENSUS), 'H1  the census reports the PAGE’s set as well as its own');
ok(/function CENSUS_draftScopeDifference_/.test(CENSUS), 'H1a and the difference between them');
['STATUS', 'COMPANY', 'MARKETPLACE', 'SOURCE'].forEach(function (axis, i) {
  ok(new RegExp('//\\s+' + axis + '\\s').test(CENSUS), 'H2.' + (i + 1) + ' the ' + axis + ' difference is named');
});
ok(/why_not_in_census_active_set/.test(CENSUS),
  'H3  §2 with the reason each row falls on each side — a difference with no reason is not a diagnosis');
['generation_run_id', 'created_by', 'created_at', 'draft_version', 'line_ids', 'quantity', 'status',
 'source_warehouse_id', 'destination_marketplace'].forEach(function (f, i) {
  ok(new RegExp(f + ':').test(CENSUS), 'H4.' + (i + 1) + ' §2 provenance field reported: ' + f);
});
ok(/STORED_AI_DRAFT \(carries a generation_run_id\)/.test(CENSUS)
  && /STORED_MANUAL_DRAFT/.test(CENSUS),
  'H5  §2 and each row is CLASSIFIED from stored fields — never guessed from what is on screen');
ok(/was ALREADY in the database before this run/.test(CENSUS),
  'H6  §2 stated plainly: these rows predate the run, and the census constructs no writer');
ok(!/appendRow|setValue|deleteRow|insertRow/.test(extractFn(CENSUS, 'CENSUS_uiVisibleDrafts_')),
  'H7  §8 and the new reader writes nothing');

// ================================================================================================================
section('I. §8 — the safety envelope');
// ================================================================================================================
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(CFG), 'I1  the materialization flag is still false');
eq((CFG.match(/INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[[\s\S]*?\]/) || [''])[0].split('{').length - 1, 1,
  'I1a and the allowlist is still the single scope');
var reconSrc = extractFn(PAGE, '_irAdviceVsPlan_') + extractFn(PAGE, '_irAdviceVsPlanHtml_');
ok(!/addExecutionRoute|_persistAllocationDraft|appendChild/.test(reconSrc),
  'I2  §8 nothing in the reconciliation adds a route, or writes anything at all');
ok(!/remaining_unplanned[\s\S]{0,400}?(qty|planned_qty)\s*=/.test(extractFn(PAGE, '_irAdviceVsPlanHtml_')),
  'I2a and the 240 is never written into a quantity field');
ok(!/appendRow|setValue|\.save\(|POST/.test(REG_SRC),
  'I3  §8 and the method registry only ever READS — resolving a method writes nothing');
// Submit is untouched.
ok(/aiPlanUnreconciled/.test(PAGE), 'I4  §8 the Submit preflight guard is unchanged');
ok(/confirmRegenerateOverUserEdits/.test(PAGE), 'I4a and the regenerate-over-edits confirmation is still asked');

// ================================================================================================================
section('J. release discipline — three families rotated, because three files changed');
// ================================================================================================================
eq(RO.appTokenRefCount(INDEX), 19, 'J1  every application-token reference moved together');
eq(RO.staleAppTokenRefs(INDEX), [], 'J1a and none was left behind');
eq(RO.currentAppToken(), 'fc1be3r4a2r1r6r1-scopeidentity-20260905', 'J1b on this round’s token');
ok(INDEX.indexOf('method-registry.js?v=' + RO.currentMethodRegistryToken()) !== -1,
  'J2  method-registry.js carries its OWN family’s current token');
ok(RO.methodRegistryTokenAtOrAfter(RO.currentMethodRegistryToken(), 'fc1be3r4a1-method-registry-20260904'),
  'J2a which is at or after the previous round’s');
ok(INDEX.indexOf('inventory-replenishment.css?v=' + RO.currentIrCssToken()) !== -1,
  'J3  and the stylesheet family rotated too — three rules here are NEW');
ok(RO.irCssTokenAtOrAfter(RO.currentIrCssToken(), 'irroutehint-20260903'), 'J3a at or after R2’s');
ok(RO.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A2-R1-R6-R1', 'F1-7N-FC-1B-E3-R4-A2-R1-R6'),
  'J4  and this round’s owner stamp is in the shared ledger');

// ================================================================================================================
section('K. §9 — mutation coverage');
// ================================================================================================================
mut('K1  KM and ResUS collapse on company → one station answers for the other', function () {
  // The whole hydrate closes over a dozen page helpers, so it is the PREDICATE that is lifted and run —
  // which is what the mutation is about. Two rows country and marketplace cannot tell apart: another
  // company's, and one that names no company at all.
  function predicate(src) {
    // Anchored on _inStation: the FIRST  in the hydrate is the STATION pass, and a
    // non-greedy match from there runs straight through it into the company pass.
    var body = /_inStation\.filter\(function \(d\) \{([\s\S]*?)\}\)\.sort\(/.exec(src);
    if (!body) throw new Error('company predicate not found');
    return new Function('d', '_scopeCompany', 'lo', '_excludedNoRowCompany', '_excludedOtherCompany', body[1]);
  }
  var lo = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  var clean = predicate(hydrate);
  // MEASURED FIRST, and my first mutation was EQUIVALENT: removing only the blank-company guard changes
  // nothing, because the exact-match check below rejects a blank too ('' !== 'resus'). The defect was the
  // DISJUNCTION — `!d.company ||` — which let a blank satisfy the clause outright. So the mutation restores
  // exactly that, which is what a regression to the old wildcard behaviour would look like.
  var mutated = predicate(swap(swap(hydrate,
    'if (!lo(d.company)) { _excludedNoRowCompany++; return false; }', ''),
    'if (lo(d.company) !== _scopeCompany)',
    'if (lo(d.company) && lo(d.company) !== _scopeCompany)'));
  var blank = { company: '', country: 'US', marketplace: 'Amazon', status: 'draft' };
  var other = { company: 'KM', country: 'US', marketplace: 'Amazon', status: 'draft' };
  // Clean: neither is adopted into ResUS. Mutant: the blank-company row is.
  return clean(blank, 'resus', lo, 0, 0) !== true && clean(other, 'resus', lo, 0, 0) !== true
    && mutated(blank, 'resus', lo, 0, 0) === true;
});
mut('K2  the recommendation is reported as APPLIED → an operator believes 760 is planned', function () {
  var h = extractFn(PAGE, '_irAdviceVsPlanHtml_');
  return /has NOT been applied/.test(h) && !/has been applied/.test(h.replace('has NOT been applied', ''));
});
mut('K3  the 520 is attributed to THIS run → pre-existing routes read as the AI’s output', function () {
  return /These route\(s\) were already here/.test(extractFn(PAGE, '_irAdviceVsPlanHtml_'));
});
mut('K4  the difference is auto-planned → 240 units are added while the flag is off', function () {
  var h = extractFn(PAGE, '_irAdviceVsPlanHtml_') + extractFn(PAGE, '_irAdviceVsPlan_');
  return !/addExecutionRoute|appendChild|\.value =/.test(h);
});
mut('K5  the method dropdown requires a rate card again → R5’s coupling returns to the UI', function () {
  var mutated = swap(REG_SRC, '      var viaTransit = methodsFromLeadTimes(entry.leadTimes, route);',
                              '      var viaTransit = [];');
  var ctx = vm.createContext({ module: { exports: {} }, window: undefined, console: console });
  vm.runInContext(mutated, ctx, { filename: 'reg-mutant' });
  var R = ctx.module.exports.create({});
  R.adopt({ company: 'ResUS', country: 'US', marketplace: 'Amazon' },
    { getCarrierRateCards: [], getCarrierLeadTimes: CN_US });
  return R.resolve({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }, LANE).status === 'EMPTY_CONFIGURATION';
});
mut('K6  marketplace becomes a lead-time join key → Amazon and Shopify stop sharing CN→US transit', function () {
  var mutated = swap(REG_SRC, "    if (rd && qd && rd !== qd) return false;",
                              "    if (rd && qd && rd !== qd) return false;\n    if (lo(route.marketplace) === 'shopify') return false;");
  var ctx = vm.createContext({ module: { exports: {} }, window: undefined, console: console });
  vm.runInContext(mutated, ctx, { filename: 'reg-mutant-mkt' });
  var a = ctx.module.exports.serviceProfilesForRoute(CN_US, { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon' });
  var b = ctx.module.exports.serviceProfilesForRoute(CN_US, { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Shopify' });
  return a.length !== b.length;
});
mut('K7  the origin country stops constraining the lane → a domestic row answers for an ocean one', function () {
  var mutated = swap(REG_SRC, "    if (ro && qo && ro !== qo) return false;", "");
  var ctx = vm.createContext({ module: { exports: {} }, window: undefined, console: console });
  vm.runInContext(mutated, ctx, { filename: 'reg-mutant-origin' });
  return ctx.module.exports.serviceProfilesForRoute(CN_US, LANE).some(function (p) { return p.method === 'truck'; });
});
mut('K8  the last mile is dropped → sea+truck and sea+parcel merge into one route identity', function () {
  var mutated = swap(REG_SRC, "      var k = method.toLowerCase() + '|' + lastMile.toLowerCase();",
                              "      var k = method.toLowerCase();");
  var ctx = vm.createContext({ module: { exports: {} }, window: undefined, console: console });
  vm.runInContext(mutated, ctx, { filename: 'reg-mutant-lm' });
  return ctx.module.exports.serviceProfilesForRoute(CN_US, LANE).length < profiles.length;
});
mut('K9  the carrier is locked by the picker → a lead-time carrier_id becomes a commercial decision', function () {
  var mutated = swap(REG_SRC, "  var DEFERRED_ = 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN';",
                              "  var DEFERRED_ = 'LOCKED_BY_METHOD_PICKER';");
  var ctx = vm.createContext({ module: { exports: {} }, window: undefined, console: console });
  vm.runInContext(mutated, ctx, { filename: 'reg-mutant-carrier' });
  return ctx.module.exports.serviceProfilesForRoute(CN_US, LANE)[0].carrierSelection !== 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN';
});
mut('K10 a blank max_days becomes 0 → an empty cell is the fastest service on the lane', function () {
  var mutated = swap(REG_SRC, "    if (typeof v === 'string' && v.trim() === '') return null;", "");
  var ctx = vm.createContext({ module: { exports: {} }, window: undefined, console: console });
  vm.runInContext(mutated, ctx, { filename: 'reg-mutant-blank' });
  return ctx.module.exports.serviceProfilesForRoute(BLANK_MAX, LANE)[0].maxDays === 0;
});
mut('K11 the fold takes the FASTEST max → one quick carrier speaks for the slowest', function () {
  var mutated = swap(REG_SRC, "      if (mx !== null) p.maxDays = (p.maxDays === null) ? mx : Math.max(p.maxDays, mx);",
                              "      if (mx !== null) p.maxDays = (p.maxDays === null) ? mx : Math.min(p.maxDays, mx);");
  var ctx = vm.createContext({ module: { exports: {} }, window: undefined, console: console });
  vm.runInContext(mutated, ctx, { filename: 'reg-mutant-fold' });
  var st = ctx.module.exports.serviceProfilesForRoute(CN_US, LANE)
    .filter(function (p) { return p.profileKey === 'sea|truck'; })[0];
  return st.maxDays === 45;
});
mut('K12 the ETA goes back to avg_days → a coin-flip date is presented as the expected arrival', function () {
  return /MAX_DAYS_CONSERVATIVE/.test(etaFn) && !/var days = Math\.round\(avgDays\)/.test(etaFn);
});
mut('K13 the buffer is added to the displayed arrival → our caution becomes the carrier’s promise', function () {
  return !/var days = Math\.round\(maxDays \+/.test(etaFn) && /is NOT part/.test(etaFn);
});
mut('K14 the aggregate notice quotes ONE SKU’s quantity → 760 reads as the hundred-SKU total', function () {
  return !/760/.test(runFn);
});
mut('K15 the aggregate notice reverts to a failure tone → a completed advice run reads as broken', function () {
  return /this is not a failure/.test(runFn) && !/could not complete/.test(runFn.split('_matReason')[1] || '');
});
mut('K16 the flag-off path writes → a run that reported "nothing written" wrote', function () {
  var tail = runFn.split('_matReason =')[1] || '';
  return !/generateWeeklyAiPlanDraft|_persistAllocationDraftToDb/.test(tail);
});
mut('K17 the Submit gate is relaxed → advice readiness becomes permission to submit', function () {
  return /aiPlanUnreconciled/.test(PAGE) && /Submit Plan is BLOCKED until a run reconciles/.test(PAGE);
});
mut('K18 the census stops reporting the UI’s set → 0 vs 2 becomes unanswerable again', function () {
  var mutated = swap(CENSUS, '  out.draft_scope_difference = (typeof CENSUS_draftScopeDifference_ === \'function\')',
                             '  out.draft_scope_difference = (typeof __GONE__ === \'function\')');
  return mutated.indexOf('__GONE__') !== -1 && /CENSUS_draftScopeDifference_/.test(CENSUS);
});

// ================================================================================================================
console.log('\n' + '='.repeat(112));
console.log('passed ' + pass + '  failed ' + fail + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
console.log('='.repeat(112));
process.exit(fail ? 1 : 0);
