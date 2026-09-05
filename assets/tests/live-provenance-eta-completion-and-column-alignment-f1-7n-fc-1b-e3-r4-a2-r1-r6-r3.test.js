// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R3 — PROVENANCE RELIABILITY · ETA COMPLETION · EXECUTION PLAN COLUMN ALIGNMENT
// ----------------------------------------------------------------------------------------------------------------
// R6-R2 restored the carrier catalogue, and the live retest then showed three things it had not reached.
//
//   1. THE DIAGNOSTIC DIED WITH THE HOST'S GENERIC MESSAGE. RUN_R6R2_ROUTE_PROVENANCE kept a full ~25-field
//      object for every header where `country === 'US' OR marketplace === 'Amazon'` — every company's, not this
//      station's — and handed the lot to the editor. Measured here at production scale: 4 005 objects, 3.98 MB.
//      It also had no stage boundaries, no timings, no top-level catch and no bound, so a timeout, a bad row and
//      an unrenderable return were one indistinguishable failure.
//
//   2. EVERY METHOD THE DROPDOWN OFFERS PRODUCED "Lead time unavailable". The option VALUE is
//      `carrier_lead_times.shipping_method` verbatim, and the ETA translated it away before looking the row back
//      up: 普船海卡 and 空派 mapped to nothing (NO_LEAD_KEY), 美森海卡 mapped to `Sea Express` and then no row on
//      the lane IS `Sea Express` (NO_LEAD_TIME). Two roads to the same wrong answer. The picker and the arrival
//      were reading one table in two vocabularies.
//
//   3. FOUR ROUTE ROWS, FOUR COLUMN LAYOUTS. The six-track template was already shared by the header and every
//      row kind — but track five was `minmax(100px, auto)`, a CONTENT-sized track. `auto` takes free space
//      before the flexible tracks resolve, so a row reading `2026-10-06 (latest, 31d)` left less for From / To /
//      Method than a row reading `Lead time unavailable`. The misalignment was one keyword.
//
// Everything below RUNS the shipped owners. The grid claims are resolved with a real implementation of the CSS
// Grid track algorithm, not by matching the stylesheet's text.
//
// Run: node assets/tests/live-provenance-eta-completion-and-column-alignment-f1-7n-fc-1b-e3-r4-a2-r1-r6-r3.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

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
// Comments are prose and prose is not behaviour. Three rounds running, a check has passed by matching the
// comment that explained the value it was meant to forbid.
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src); if (!m) throw new Error('not found: ' + name);
  var s = m.index, i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { var c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return src.slice(s, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var PAGEC = stripComments(PAGE);
var CSS = read('assets/css/pages/inventory-replenishment.css');
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
var CENSUSC = stripComments(CENSUS);
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var G60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var INDEX = read('index.html');
var RO = require('./_release-order.js');
var MR = require('../js/core/method-registry.js');
var CMP = require('../js/utils/inventory-compat.js');
var ARC = require('../js/core/supply-planning-active-route-classification.js');

// The live evidence, verbatim. Nothing in this file restates these from anywhere else.
var RECOMMENDED = 920, ROUTE_A_QTY = 320, ROUTE_B_QTY = 200, PLANNED = ROUTE_A_QTY + ROUTE_B_QTY;
var DIFFERENCE = RECOMMENDED - PLANNED;
var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var SKU = 'CO1100-R';
// The three options the live Method dropdown visibly contains.
var LIVE_METHODS = ['空派', '美森海卡', '普船海卡'];

// ================================================================================================================
section('§0 — invariants this round must not move');
// ================================================================================================================
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(stripComments(CFG)),
  'A1 the AI Plan DB generation flag is still declared false');
var allowlist = /var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[([\s\S]*?)\];/.exec(stripComments(CFG))[1];
eq((allowlist.match(/\{/g) || []).length, 1, 'A2 the activation allowlist still holds exactly one entry');
ok(allowlist.indexOf("sku: 'CO1100-R'") !== -1, 'A3 and it is still the single live scope');
// R6-R4 RESTATEMENT. The claim was never "R6-R3 is last for ever" — it was that this round's stamp is
// REGISTERED and ORDERED. A suite that pins itself to the tail of a growing list fails on the next round for
// a reason that has nothing to do with what it tests.
ok(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R3') !== -1,
  'A4 R6-R3 is a registered owner stamp');
ok(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R2') < RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R3'),
  'A4a and it is ordered after the round it followed');
eq(RO.staleAppTokenRefs(INDEX), [], 'A5 no index.html asset is left behind on an older app token');
ok(/SIR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A1'/.test(G60),
  'A6 60_ is UNCHANGED — no server defect was proven, so its stamp does not move');
// R6-R4 RESTATEMENT. R6-R3 did not change method-registry.js, and pinning its token was a fair way to say so
// AT THE TIME. It is not a property of R6-R3's work: R6-R4 changed the registry (resolve() now attaches the
// transit authority's last-mile facts to every option) and MUST rotate that token or a cached copy is served.
// What this round actually depends on is that the registry has its own token family and that index.html serves
// the current member of it — the rule the pin existed to protect.
ok(RO.METHOD_REGISTRY_TOKEN_SERIES.indexOf('fc1be3r4a2r1r6r1-method-registry-20260905') !== -1,
  'A7 the registry token R6-R2 shipped is still in the ledger');
ok(INDEX.indexOf('method-registry.js?v=' + RO.currentMethodRegistryToken()) !== -1,
  'A7a and index.html serves the CURRENT registry token, whatever round last moved it');

// ================================================================================================================
section('§1 — the carrier lazy-load R6-R2 fixed is still fixed');
// ================================================================================================================
ok(/_irReadModelHasCarrier = _wsAskedCarrier \|\| _wsDataHasCarrier;/.test(PAGEC),
  'B1 adoption still keys on what the response CONTAINS, not on the caller intent flag');
ok(PAGEC.indexOf('_irReadModelHasCarrier = !!(opts && opts.carrier);') === -1,
  'B2 and the flag that settled an empty catalogue has not come back');
var wsPayload = /var _wsPayload = \{[^}]*\};/.exec(PAGEC)[0];
ok(wsPayload.indexOf('carrierPlanning') === -1, 'B3 the primary read still does not ask for the include');

// ---- the lane the live screen shows, in the vocabulary it shows it in -----------------------------------------
function lt(o) {
  return { leadTimeId: o.id, carrierId: o.carrier, originCountry: o.from || 'CN', destinationCountry: o.to || 'US',
    shippingMethod: o.method, lastMileDelivery: o.lastMile === undefined ? '' : o.lastMile,
    minDays: o.min === undefined ? '' : o.min, maxDays: o.max === undefined ? '' : o.max,
    avgDays: o.avg === undefined ? '' : o.avg };
}
var TRUCK = '卡車', PARCEL = '快遞';
var LANE = [
  lt({ id: 'LT1', carrier: 'C1', method: LIVE_METHODS[0], lastMile: PARCEL, min: 6, max: 10, avg: 8 }),
  lt({ id: 'LT2', carrier: 'C2', method: LIVE_METHODS[1], lastMile: TRUCK, min: 18, max: 26, avg: 22 }),
  lt({ id: 'LT2b', carrier: 'C4', method: LIVE_METHODS[1], lastMile: TRUCK, min: 20, max: 31, avg: 25 }),
  lt({ id: 'LT3', carrier: 'C3', method: LIVE_METHODS[2], lastMile: TRUCK, min: 30, max: 45, avg: 38 }),
  lt({ id: 'LT4', carrier: 'C5', method: LIVE_METHODS[0], lastMile: TRUCK, min: 7, max: 12, avg: 9 }),
  lt({ id: 'LT5', carrier: 'C6', method: 'rail', lastMile: TRUCK, min: 20, max: '', avg: 24 }),
  lt({ id: 'LT6', carrier: 'C7', from: 'US', to: 'US', method: TRUCK, lastMile: TRUCK, min: 2, max: 5, avg: 3 })
];
var LANE_CTX = { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon' };
var opts = MR.methodsFromLeadTimes(LANE, LANE_CTX);
// The fixture carries one extra lane row (a blank-max_days `rail`, used by C10), so what is asserted is that
// all three LIVE options are offered — not that the fixture contains nothing besides them.
var offered = opts.map(function (m) { return m.value; });
eq(LIVE_METHODS.filter(function (m) { return offered.indexOf(m) !== -1; }), LIVE_METHODS,
  'B4  the dropdown offers all three live options');
eq(MR.methodsForRoute([], LANE_CTX).length, 0,
  'B4a with zero rate cards on the lane — every option came from the transit authority alone');
ok(opts.every(function (m) { return LANE.some(function (r) { return r.shippingMethod === m.value; }); }),
  'B5 every option VALUE is carrier_lead_times.shipping_method verbatim — which is what the ETA must match on');

// ---- the shipped ETA calculator, wired to the shipped registry ------------------------------------------------
function makeEta(rows, reg) {
  var win = { KM: { methodRegistry: reg === undefined ? { serviceProfilesForRoute: MR.serviceProfilesForRoute } : reg },
    IRService: CMP.IRService };
  function tableOf(n) { return new RegExp('var ' + n + ' = \\{[\\s\\S]*?\\};').exec(PAGE)[0]; }
  function obj(n) { return eval('(' + tableOf(n).replace(/^var [A-Z_]+ = /, '').replace(/;$/, '') + ')'); }
  var leadKey = new Function('IR_SERVICE_TO_LEAD_KEY_', 'IR_LABEL_TO_LEAD_KEY_',
    extractFn(PAGE, '_irMethodToLeadKey') + '\nreturn _irMethodToLeadKey;')(
    obj('IR_SERVICE_TO_LEAD_KEY_'), obj('IR_LABEL_TO_LEAD_KEY_'));
  var src = extractFn(PAGE, '_irLeadTimeProfileFor_') + '\n' + extractFn(PAGE, '_irComputeRouteEta') + '\n' +
    extractFn(PAGE, '_irRouteEtaFor') + '\n' + extractFn(PAGE, '_irProjectCalendarDay_') + '\n' +
    extractFn(PAGE, '_irIsoPlusDays_') + '\n' + extractFn(PAGE, '_irCanonicalDateOrBlank_') +
    '\nreturn { compute: _irComputeRouteEta, forRoute: _irRouteEtaFor, profile: _irLeadTimeProfileFor_ };';
  return new Function('window', '_irMethodToLeadKey', '_irCarrierGet', 'Intl', 'IR_ISO_DATE_RE_', src)(
    win, leadKey, function () { return rows; }, Intl, new RegExp('^\\d{4}-\\d{2}-\\d{2}$'));
}
var ETA = makeEta(LANE);

// ================================================================================================================
section('§3 — the arrival now answers in the vocabulary the picker offered');
// ================================================================================================================
// Route A: CN侑鑫 -> Amazon (a MARKETPLACE destination), method 美森海卡 — the exact live failure.
var routeA = ETA.compute('US', { shipping_method: LIVE_METHODS[1], last_mile_delivery: TRUCK }, 'CN');
eq(routeA.available, true, 'C1  Route A (marketplace destination, 美森海卡) resolves an arrival');
// `source` keeps its shipped value ('COMPUTED'), because it is published as data-eta-source and read back off
// the row; WHICH authority answered is reported beside it.
eq([routeA.source, routeA.resolved_by], ['COMPUTED', 'CARRIER_LEAD_TIMES_TRANSIT_PROFILE'],
  'C1a computed, and by the transit profile authority — named without changing a stored field');
eq(routeA.max_days, 31, 'C1b on the SLOWEST max across the carriers that run it (26 vs 31 -> 31)');
eq(routeA.basis, 'MAX_DAYS_CONSERVATIVE', 'C1c and it declares its basis');
eq(routeA.carrier_selection, 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN', 'C1d carrier selection stays deferred');
// Route B: the same lane reached through a WAREHOUSE destination.
var routeB = ETA.compute('US', { shipping_method: LIVE_METHODS[2], last_mile_delivery: TRUCK }, 'CN');
eq(routeB.available, true, 'C2  Route B (warehouse destination) resolves an arrival too');
eq(routeB.max_days, 45, 'C2a on its own conservative max');
ok(routeA.date !== routeB.date, 'C2b and the two routes get DIFFERENT dates — one is not answering for the other');
// Every option the operator can actually pick must produce an answer.
var answered = LIVE_METHODS.map(function (m) {
  var lm = (m === LIVE_METHODS[0]) ? TRUCK : TRUCK;           // 空派 is ambiguous until a last mile is chosen
  return ETA.compute('US', { shipping_method: m, last_mile_delivery: lm }, 'CN').available;
});
eq(answered, [true, true, true], 'C3  all three live options resolve — none is left "Lead time unavailable"');
// The failure the round started from, restated as the thing that must not come back.
ok(routeA.source !== 'NO_LEAD_KEY' && routeA.source !== 'NO_LEAD_TIME' && routeA.text !== 'Lead time unavailable',
  'C4  美森海卡 no longer falls to NO_LEAD_KEY or NO_LEAD_TIME');
// The label is never parsed, and the mapping table is a FALLBACK, not the gate.
var prof = extractFn(PAGEC, '_irLeadTimeProfileFor_');
ok(/serviceProfilesForRoute/.test(prof), 'C5  the resolver asks the SAME owner that built the option');
ok(!/IR_LABEL_TO_LEAD_KEY_|_irMethodToLeadKey/.test(prof),
  'C5a and it never consults a display-label translation table');
var etaFn = extractFn(PAGEC, '_irComputeRouteEta');
ok(etaFn.indexOf('_irLeadTimeProfileFor_') < etaFn.indexOf('_irMethodToLeadKey'),
  'C5b the transit authority is asked FIRST; the mapped vocabulary is the fallback beneath it');
// Chinese labels are presentation; identity is the token, compared through the ONE shared test.
eq(CMP.IRService.canonical('美森海卡'), 'sea_express',
  'C6  美森海卡 canonicalises to sea_express — never to sea');
ok(CMP.IRService.matches('美森海卡', 'sea_express'),
  'C6a and the shared identity test relates the label to the canonical service');
ok(!CMP.IRService.matches('美森海卡', 'sea'), 'C6b but never to a neighbouring service');
// A persisted legacy English token still resolves — the fallback is kept, not replaced.
var LEGACY = LANE.concat([lt({ id: 'LT9', carrier: 'C9', method: 'Sea Express', min: 10, max: 14, avg: 12 })]);
var legacy = makeEta(LEGACY).compute('US', { shipping_method: 'sea_express' }, 'CN');
eq(legacy.available, true, 'C7  a route persisted under `sea_express` still resolves');
eq(legacy.max_days, 31, 'C7a and conservatively: the SLOWER of the two spellings of one service (31 over 14)');

section('§3 (cont.) — last mile, blank days, lane exactness, and no rate card');
var ambiguous = ETA.compute('US', { shipping_method: LIVE_METHODS[0] }, 'CN');
eq(ambiguous.available, false, 'C8  空派 runs on two last miles, so an unchosen one yields no arrival');
eq(ambiguous.source, 'LAST_MILE_REQUIRED', 'C8a reported as a named state, not as missing data');
eq((ambiguous.last_mile_options || []).slice().sort(), [TRUCK, PARCEL].sort(),
  'C8b naming both, so a person can choose');
ok(ETA.compute('US', { shipping_method: LIVE_METHODS[0], last_mile_delivery: PARCEL }, 'CN').max_days === 10 &&
   ETA.compute('US', { shipping_method: LIVE_METHODS[0], last_mile_delivery: TRUCK }, 'CN').max_days === 12,
  'C9  and the two last miles give two different transit times, which is why merging them loses information');
var blank = ETA.compute('US', { shipping_method: 'rail', last_mile_delivery: TRUCK }, 'CN');
eq([blank.available, blank.max_days, blank.source], [false, null, 'NO_USABLE_MAX_DAYS'],
  'C10 a blank max_days fails CLOSED — null, not zero, and named');
eq(ETA.compute('US', { shipping_method: TRUCK, last_mile_delivery: TRUCK }, 'CN').available, false,
  'C11 the US->US row does not answer a CN->US route');
eq(ETA.compute('US', { shipping_method: TRUCK, last_mile_delivery: TRUCK }, 'US').max_days, 5,
  'C11a but it answers its own lane');
ok(!/rateCard|getCarrierRateCards|carrier_rate_cards/i.test(etaFn + prof),
  'C12 no rate card is read anywhere in the arrival calculation');
ok(/buffer_excluded_note/.test(etaFn) && !/\+\s*7\b/.test(etaFn.replace(/buffer_excluded_note[\s\S]*?source:/, '')),
  'C13 the 7-day buffer is declared excluded and is never added to a displayed transit');

section('§3 (cont.) — recompute on Method change and after late hydration');
var refresher = extractFn(PAGEC, '_irUpdateRouteEtas');
ok(/last_mile_delivery: _lmEl/.test(refresher),
  'C14 the refresher carries the LAST MILE, so a repaint can tell 美森海卡+卡車 from 美森海卡+快遞');
ok(/data-eta-persisted/.test(refresher), 'C14a while still honouring a persisted snapshot over a computed one');
ok(!/upsertShippingAllocationDraft|_persistAllocationDraft/.test(refresher), 'C14b and writing nothing');
var rebuildAll = extractFn(PAGEC, '_irRebuildAllMethodOptions_');
ok(/_irUpdateRouteEtas\(sku\)/.test(rebuildAll),
  'C15 a station-wide catalogue settle repaints the arrival as well as the method (R6-R2 §7, preserved)');
ok(/_irUpdateRouteEtas\(sku\)/.test(PAGEC.slice(PAGEC.indexOf('_irLoadCarrierPlanning_().then'))) ,
  'C15a and so does the per-SKU catalogue settle');
// The snapshot basis comparison must not treat two different unmapped methods as the same one.
var snapRoute = { shipping_method: LIVE_METHODS[2], last_mile_delivery: TRUCK,
  expected_arrival: '2026-09-19', expected_arrival_basis: LIVE_METHODS[0] };
var switched = ETA.forRoute('US', snapRoute, 'CN');
ok(switched.source !== 'PERSISTED',
  'C16 changing the Method away from the snapshot basis DISCARDS the snapshot — two unmapped labels are not one');
var sameBasis = ETA.forRoute('US', { shipping_method: LIVE_METHODS[2], last_mile_delivery: TRUCK,
  expected_arrival: '2026-09-19', expected_arrival_basis: LIVE_METHODS[2] }, 'CN');
eq(sameBasis.source, 'PERSISTED', 'C16a and a snapshot under the SAME service is still honoured');

// ================================================================================================================
section('§3 — destination country comes from authority, never from a label');
// ================================================================================================================
var renderFn = extractFn(PAGEC, '_renderExecutionRoute');
ok(/destCountry = sd \? sd\.country : ''/.test(renderFn) && /if \(!destCountry\) destCountry = scope\.country;/.test(renderFn),
  'D1  the destination country is the STATION\'s, taken from the applied scope');
ok(!/destCountry[^\n]*(indexOf|match|split)\(\s*['"]Amazon/.test(renderFn),
  'D2  and "Amazon" is never parsed to obtain it');
ok(/var originCountry = fromWh \? fromWh\.country : ''/.test(renderFn),
  'D3  the origin country is the FROM WAREHOUSE\'s own country, not a label');
ok(/data-wh-country="' \+ _execEsc\(w\.country/.test(extractFn(PAGEC, '_execWhOption')),
  'D3a and that country reaches the option from the warehouse row, never from its display name');
ok(!/originCountry[^\n]*(indexOf|match|split)\(/.test(renderFn),
  'D3b nothing parses the origin out of any string');
// The To candidates a station offers are same-company/same-country by construction, so a warehouse destination
// is in the station country — which is why one country answer serves both destination kinds.
var cand = CMP.IRWarehouse.buildCandidates([
  { warehouseId: 'WH-CN-YX', warehouseName: 'CN侑鑫', country: 'CN', isActive: true, warehouseType: 'FACTORY' },
  { warehouseId: 'WH-AMZLGS-IN', warehouseName: 'AMZLG&S IN', warehouseCode: 'AMZLGS', country: 'US',
    isActive: true, warehouseType: '3PL', company: 'ResUS' },
  { warehouseId: 'WH-TW-3PL', warehouseName: 'TW 3PL', country: 'TW', isActive: true, warehouseType: '3PL', company: 'ResUS' }
], SCOPE);
ok(cand.from.some(function (w) { return w.warehouseId === 'WH-CN-YX' && w.country === 'CN'; }),
  'D4  the CN factory resolves to country CN through the warehouse authority');
var amzlgs = cand.to.filter(function (w) { return w.warehouseId === 'WH-AMZLGS-IN'; })[0];
ok(!!amzlgs && amzlgs.country === 'US', 'D5  AMZLG&S IN resolves to country US through the warehouse authority');
ok(!cand.to.some(function (w) { return w.country === 'TW'; }),
  'D5a and a warehouse outside the station country is not a destination candidate at all');
ok(cand.isAmazon && cand.to.some(function (w) { return w.logicalDestination; }),
  'D6  the Amazon destination is a LOGICAL token on the station, not a warehouse row');

// ================================================================================================================
section('§4 — one column layout authority, resolved with the real grid algorithm');
// ================================================================================================================
// A deterministic implementation of the parts of CSS Grid §12 that decide these widths: base sizes from the
// minimum functions, `auto` maxima grow toward max-content FIRST, and the remaining free space goes to the
// flexible tracks by flex factor. The last two steps in that order are the entire defect.
function parseTracks(cssBlock) {
  var m = /grid-template-columns:([\s\S]*?);/.exec(cssBlock);
  if (!m) throw new Error('no grid-template-columns');
  var body = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
  var out = [], re = /minmax\(\s*(\d+)px\s*,\s*(auto|[\d.]+fr)\s*\)|(\d+)px/g, t;
  while ((t = re.exec(body))) {
    if (t[3] !== undefined) out.push({ kind: 'fixed', min: +t[3] });
    else if (t[2] === 'auto') out.push({ kind: 'auto', min: +t[1] });
    else out.push({ kind: 'flex', min: +t[1], flex: parseFloat(t[2]) });
  }
  return out;
}
function resolveTracks(tracks, containerPx, gapPx, contentWidths) {
  var base = tracks.map(function (t) { return t.min; });
  var free = containerPx - gapPx * (tracks.length - 1) - base.reduce(function (a, b) { return a + b; }, 0);
  if (free < 0) free = 0;
  tracks.forEach(function (t, i) {
    if (t.kind !== 'auto') return;
    var give = Math.min(Math.max(0, (contentWidths[i] || 0) - base[i]), free);
    base[i] += give; free -= give;
  });
  var totalFlex = tracks.reduce(function (a, t) { return a + (t.kind === 'flex' ? t.flex : 0); }, 0);
  if (totalFlex > 0 && free > 0) tracks.forEach(function (t, i) { if (t.kind === 'flex') base[i] += free * (t.flex / totalFlex); });
  return base.map(function (w) { return Math.round(w * 100) / 100; });
}
function trackOffsets(widths, gapPx) {
  var o = [], x = 0;
  for (var i = 0; i < widths.length; i++) { o.push(Math.round(x * 100) / 100); x += widths[i] + gapPx; }
  return o;
}
function textW(s) {
  var w = 0;
  for (var i = 0; i < String(s).length; i++) w += (String(s).charCodeAt(i) > 0x2e80) ? 11 : 6;
  return w + 2;
}
function gridBlock(css) {
  var i = css.indexOf('#ops-section .ir-exec-plan__grid {');
  if (i < 0) throw new Error('grid rule not found');
  return css.slice(i, css.indexOf('}', i));
}
var BLOCK = gridBlock(CSS);
var TRACKS = parseTracks(BLOCK);
// R6-R4 RESTATEMENT. §6 of the following round required a SEVENTH track (Last Mile), so the count is no
// longer the invariant — R6-R3's actual finding was that NO track may be content-sized and that the header
// resolves the identical widths every row does. Both of those are asserted below and still hold at seven.
ok(TRACKS.length >= 6, 'E1  the shared template still declares every column of the row');
eq(TRACKS.filter(function (t) { return t.kind === 'auto'; }).length, 0,
  'E2  NOT ONE of them is content-sized — that keyword is the whole defect');
// R6-R4: the SHAPE is the claim — Qty and Action are fixed because a digit count and a button must never move
// a column; every other track is a fraction of the container. Stated structurally so a new column does not
// look like a regression.
var KINDS = TRACKS.map(function (t) { return t.kind; });
eq(KINDS[2], 'fixed', 'E3  Qty is a fixed track — 1 to 5 digits must not move a column');
eq(KINDS[KINDS.length - 1], 'fixed', 'E3a Action is a fixed track — the button keeps its own column');
eq(KINDS.filter(function (k) { return k === 'flex'; }).length, TRACKS.length - 2,
  'E3b and every remaining track is a fraction of the container, not of its own text');
// The rows the live screen shows, plus the header, plus the cases §4 enumerates.
var GAP = 8;
var ROW_CASES = [
  { l: 'Route A (marketplace dest)', eta: '2026-10-06 (latest, 31d)', from: 'CN侑鑫', to: 'Amazon', qty: '320', method: LIVE_METHODS[1] },
  { l: 'Route B (warehouse dest)', eta: 'Lead time unavailable', from: 'CN侑鑫', to: 'AMZLG&S IN', qty: '200', method: LIVE_METHODS[2] },
  { l: 'Route C empty method', eta: '—', from: 'A', to: 'B', qty: '7', method: '' },
  { l: 'Route D long everything', eta: '2026-09-15 – 2026-10-06 (latest, 31d)',
    from: 'Shenzhen Consolidated Export Warehouse No. 4', to: 'AMZLG&S Indianapolis Receiving Dock 12',
    qty: '99999', method: 'Sea Express (weekly sailing)' },
  { l: 'HEADER', eta: 'Expected Arrival', from: 'From', to: 'To', qty: 'Qty', method: 'Method' }
];
[720, 620, 560].forEach(function (W) {
  var layouts = {};
  ROW_CASES.forEach(function (r) {
    var cw = [textW(r.from), textW(r.to), textW(r.qty), textW(r.method), textW(r.eta), 0];
    layouts[JSON.stringify(trackOffsets(resolveTracks(TRACKS, W, GAP, cw), GAP))] = 1;
  });
  eq(Object.keys(layouts).length, 1,
    'E4  at ' + W + 'px every row — header included — resolves ONE identical set of column offsets');
});
// And the header is genuinely part of the same authority rather than a second rule that happens to agree.
ok(/#ops-section \.ir-exec-plan__grid--head \{[\s\S]{0,400}?\}/.test(CSS) &&
   !/#ops-section \.ir-exec-plan__grid--head \{[^}]*grid-template-columns/.test(CSS),
  'E5  the header row declares NO template of its own — it inherits the shared one');
var headEl = /class="ir-exec-plan__grid ir-exec-plan__grid--head"|ir-exec-plan__grid--head/.test(PAGE);
ok(headEl, 'E5a and it carries the shared grid class');
ok(/row\.className = _isComposer \? 'exec-route-composer ir-exec-plan__grid' : 'exec-route-row ir-exec-plan__grid'/.test(PAGEC),
  'E6  a persisted route and a composer both carry the shared grid class, so neither can be styled apart');
// Controls fill their track and cannot push it.
var ctlRule = /#ops-section \.ir-exec-plan__grid \.replen-card__input,\s*\n#ops-section \.ir-exec-plan__grid \.replen-card__select \{([\s\S]*?)\}/.exec(CSS)[1];
ok(/box-sizing: border-box;/.test(ctlRule) && /width: 100%;/.test(ctlRule) && /min-width: 0;/.test(ctlRule),
  'E7  every control is border-box, full-width and min-width:0 — declared once, for all of them');
ok(/#ops-section \.ir-exec-plan__grid > \* \{ min-width: 0; \}/.test(CSS),
  'E7a and every grid child may shrink below its content');
ok(/\.replen-card__eta \{[^}]*text-overflow: ellipsis/.test(CSS),
  'E8  a long arrival CLIPS rather than widening its track');
ok(/title="' \+ _execEsc\(eta\.text \|\| ''\)/.test(PAGE),
  'E8a and the full value is preserved in the cell title');
ok(/cell\.setAttribute\('title', eta\.text \|\| ''\);/.test(PAGE),
  'E8b including after a repaint');
// The change is LOCAL: no shared select and no other page moved.
ok(BLOCK.indexOf('#ops-section') === 0, 'E9  the layout authority is scoped to #ops-section');
eq(/\.replen-card__select \{/.test(CSS.replace(/#ops-section [^\n{]*\{[^}]*\}/g, '')), false,
  'E9a and no unscoped .replen-card__select rule was introduced');

// ================================================================================================================
section('§2 — the provenance diagnostic, run at production scale');
// ================================================================================================================
var HEADER_COLS = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace',
  'marketplace_id', 'status', 'lifecycle_status', 'generation_type', 'generation_run_id', 'calculation_run_id',
  'source_data_as_of', 'destination_marketplace', 'destination_warehouse_id', 'recommended_destination_warehouse_id',
  'source_warehouse_id', 'recommended_source_warehouse_id', 'recommended_shipping_method',
  'recommended_last_mile_delivery', 'create_idempotency_key', 'created_at', 'created_by', 'updated_at',
  'updated_by', 'draft_version'];
var LINE_COLS = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'source_warehouse_id',
  'source_warehouse_code', 'destination_kind', 'destination_warehouse_id', 'destination_marketplace',
  'planned_qty', 'recommended_qty', 'shipping_method', 'last_mile_delivery', 'expected_arrival', 'line_status'];
function buildSheets(nOther, extraHeaders) {
  var H = [HEADER_COLS.slice()], L = [LINE_COLS.slice()];
  function h(o) { H.push(HEADER_COLS.map(function (c) { return o[c] === undefined ? '' : o[c]; })); }
  function l(o) { L.push(LINE_COLS.map(function (c) { return o[c] === undefined ? '' : o[c]; })); }
  h({ allocation_draft_id: 'SADH-A', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
      destination_marketplace: 'Amazon', recommended_source_warehouse_id: 'WH-CN-YX',
      recommended_shipping_method: LIVE_METHODS[1], created_at: new Date(2026, 7, 20), draft_version: 3 });
  l({ allocation_draft_line_id: 'SADL-A1', allocation_draft_id: 'SADH-A', sku: SKU, planned_qty: ROUTE_A_QTY,
      line_status: 'draft', source_warehouse_id: 'WH-CN-YX', destination_kind: 'MARKETPLACE',
      destination_marketplace: 'Amazon', shipping_method: LIVE_METHODS[1] });
  h({ allocation_draft_id: 'SADH-B', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
      recommended_destination_warehouse_id: 'WH-AMZLGS-IN', recommended_source_warehouse_id: 'WH-CN-YX',
      created_at: new Date(2026, 7, 22) });
  l({ allocation_draft_line_id: 'SADL-B1', allocation_draft_id: 'SADH-B', sku: SKU, planned_qty: ROUTE_B_QTY,
      line_status: 'draft', source_warehouse_id: 'WH-CN-YX', destination_kind: 'WAREHOUSE',
      destination_warehouse_id: 'WH-AMZLGS-IN', expected_arrival: '2026-09-19' });
  h({ allocation_draft_id: 'SADH-BLANK', company: '', country: 'US', marketplace: 'Amazon', status: 'draft' });
  h({ allocation_draft_id: 'SADH-KM', company: 'KM', country: 'US', marketplace: 'Amazon', status: 'draft' });
  h({ allocation_draft_id: 'SADH-CANC', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'cancelled' });
  for (var i = 0; i < nOther; i++) {
    var id = 'SADH-X' + i;
    h({ allocation_draft_id: id, company: (i % 3 ? 'KM' : 'ResTW'), country: 'US', marketplace: 'Amazon',
        status: (i % 5 ? 'draft' : 'submitted'), created_at: new Date(2026, 6, 1 + (i % 27)) });
    l({ allocation_draft_line_id: 'SADL-X' + i, allocation_draft_id: id, sku: 'OTHER-' + (i % 40),
        planned_qty: 100 + i, line_status: 'draft' });
  }
  (extraHeaders || []).forEach(function (row) { H.push(row); });
  return { shipping_allocation_drafts: H, shipping_allocation_draft_lines: L };
}
function runCensus(censusSrc, sheets, opts) {
  opts = opts || {};
  var LOG = [];
  var sb = { console: { log: function () {} }, JSON: JSON, Math: Math, Date: Date, String: String,
    Number: Number, Object: Object, Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat,
    parseInt: parseInt, Error: Error, RegExp: RegExp, Boolean: Boolean };
  sb.global = sb;
  sb.Logger = { log: function (m) { LOG.push(String(m)); } };
  var calls = { getDataRange: 0 };
  sb.SpreadsheetApp = { openById: function () { return { getSheetByName: function (n) {
    var rows = sheets[n]; if (!rows) return null;
    return { getDataRange: function () { calls.getDataRange++; return { getValues: function () { return rows; } }; } };
  } }; } };
  var ctx = vm.createContext(sb);
  if (!opts.withoutBundle) vm.runInContext(read('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs'), ctx);
  vm.runInContext([
    'function prodExpectedDbId_() { return "FAKE"; }',
    'function prodAssertDbTarget_() { return true; }',
    'function ricK4GroupKey_(r) { if (!r || !r.allocation_draft_id) throw new Error("no identity"); return "K4:" + r.allocation_draft_id; }'
  ].join('\n'), ctx);
  vm.runInContext(censusSrc, ctx);
  var t0 = Date.now(), res, threw = null;
  try { res = vm.runInContext('RUN_R6R2_ROUTE_PROVENANCE()', ctx); }
  catch (e) { threw = e; res = null; }
  var bytes = -1; try { bytes = JSON.stringify(res).length; } catch (e) {}
  return { res: res, threw: threw, bytes: bytes, logChars: LOG.join('\n').length, calls: calls.getDataRange,
    wall: Date.now() - t0 };
}
var BEFORE_CENSUS = cp.execSync('git show 7290ac0:assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs',
  { cwd: ROOT, encoding: 'buffer', maxBuffer: 1 << 28 }).toString('utf8');
var SHEETS = buildSheets(4000);
var before = runCensus(BEFORE_CENSUS, SHEETS);
var after = runCensus(CENSUS, SHEETS);

eq(before.res.headers.length, 4005,
  'F1  BEFORE: the diagnostic kept a full object for EVERY header in the sheet — 4 005 of them');
ok(before.bytes > 3000000, 'F1a which serialized to over 3 MB — more than the editor will render (' +
  Math.round(before.bytes / 1024) + ' KB)');
ok(after.res.headers.length <= 60, 'F2  AFTER: the reported set is bounded (' + after.res.headers.length + ' headers)');
ok(after.bytes < 250000, 'F2a and the output is bounded (' + Math.round(after.bytes / 1024) + ' KB)');
ok(after.bytes < before.bytes / 10, 'F2b an order of magnitude smaller');
eq(after.res.ui_current_plan_total, before.res.ui_current_plan_total,
  'F3  and the TOTAL is unchanged by the bound — a bound that moved a number would be worse than none');
eq(after.res.ui_current_plan_total, PLANNED, 'F3a the exact 520 remains measurable');
eq(after.res.included_route_ids, ['SADH-A', 'SADH-B'], 'F3b both persisted manual routes are named');
eq(after.res.totals_agree, true, 'F4  UI and census totals agree');
ok(/CORRECTLY PERSISTED MANUAL WORK/.test(after.res.source_of_520), 'F4a source_of_520 is answered');
eq([after.res.db_writes, after.res.writer_constructed, after.res.submit_calls, after.res.reservation_writes],
  [0, false, 0, 0], 'F5  zero writes, no writer, no Submit, no reservation');
eq(after.calls, 2, 'F6  each required sheet is read exactly once — two getDataRange calls in total');
eq(after.res.read_metrics.by_sheet.map(function (s) { return s.sheet; }),
  ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'],
  'F6a and only the two sheets it needs are opened');
ok(after.res.read_metrics.rows_read > 8000 && after.res.read_metrics.columns_read > 0,
  'F6b rows and columns read are reported');
ok(after.res.stage_timings.length >= 8, 'F7  every stage emits a timing (' + after.res.stage_timings.length + ' stages)');
ok(after.res.stage_timings.every(function (s) { return typeof s.elapsed_ms === 'number' && s.stage; }),
  'F7a each carries a name and elapsed milliseconds');
eq(after.res.stage_timings.map(function (s) { return s.stage; })[0], 'RESOLVE_SHARED_AUTHORITY',
  'F7b starting with the authority it cannot run without');
ok(typeof after.res.elapsed_ms === 'number', 'F8  and the run reports its own total elapsed_ms');
ok(after.res.elapsed_ms < 20000, 'F8a completing well inside a defined budget (' + after.res.elapsed_ms + 'ms simulated)');
ok(after.logChars < 6000, 'F9  the transcript is bounded (' + after.logChars + ' chars)');
ok(typeof after.res.output_bytes === 'number', 'F9a and the serialized size is measured, not discovered by failing');

section('§2 (cont.) — a failure becomes a TYPED result, never the host\'s generic message');
var noArc = runCensus(CENSUS, SHEETS, { withoutBundle: true });
eq(noArc.threw, null, 'G1  a missing shared authority does not throw out of the function');
eq(noArc.res.verdict, 'FAILED', 'G1a it returns a FAILED verdict');
eq(noArc.res.error.code, 'KMARC_UNAVAILABLE', 'G1b with a named code');
eq(noArc.res.error.failed_stage, 'RESOLVE_SHARED_AUTHORITY', 'G1c naming the stage that failed');
ok(typeof noArc.res.error.elapsed_ms === 'number' && typeof noArc.res.error.message === 'string',
  'G1d and carrying elapsed_ms and a message');
ok('stack' in noArc.res.error, 'G1e with a stack field present for a real exception');
eq([noArc.res.db_writes, noArc.res.writer_constructed], [0, false], 'G1f a failed run still writes nothing');
// A row the shared route-key helper cannot key must not end a diagnostic that exists to describe such rows.
var badRow = HEADER_COLS.map(function (c) {
  return c === 'company' ? 'ResUS' : c === 'country' ? 'US' : c === 'marketplace' ? 'Amazon'
    : c === 'status' ? 'draft' : '';
});
var withBad = runCensus(CENSUS, buildSheets(2, [badRow]));
eq(withBad.threw, null, 'G2  a row whose group key throws does not end the run');
eq(withBad.res.ui_current_plan_total, PLANNED, 'G2a the total still measures');
eq(withBad.res.headers.filter(function (h) { return h.route_group_key_error; }).length, 1,
  'G2b and the failure is recorded ON the row that caused it');
// The entry point stays parameterless and hard-scoped.
ok(/function RUN_R6R2_ROUTE_PROVENANCE\(\) \{/.test(CENSUSC),
  'G3  the runner still takes NO parameters, so it cannot be aimed at another scope');
ok(/R6R2_PROVENANCE_SCOPE_ = \{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' \}/.test(CENSUSC),
  'G3a and its scope is a hard-coded constant');
var runnerSrc = extractFn(CENSUSC, 'RUN_R6R2_ROUTE_PROVENANCE');
ok(!/appendRow|setValue|deleteRow|getRange\([^)]*\)\.set/.test(runnerSrc),
  'G4  it constructs no mutation of any kind');
// R6-R4 RESTATEMENT: "rotated" is a relationship to the OWNER STAMPS, not a constant. The census must carry
// a stamp this repo knows about, and the diagnostic must not ship under a stamp older than the round that last
// edited it.
var censusStamp = (/TEMP_E3_CENSUS_BUILD_ = '([^']+)'/.exec(CENSUS) || [])[1];
ok(RO.OWNER_STAMPS.indexOf(censusStamp) !== -1, 'G5  the census build stamp is a registered owner stamp');
ok(RO.OWNER_STAMPS.indexOf(censusStamp) >= RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R3'),
  'G5a and it is at least the round that rewrote this runner');


// ================================================================================================================
section('§5 — recommendation, current plan and difference stay three separate facts');
// ================================================================================================================
eq([RECOMMENDED, PLANNED, Math.max(0, RECOMMENDED - PLANNED)], [920, 520, 400],
  'H1  920 recommended · 520 planned · 400 not yet in a route');
eq(DIFFERENCE, 400, 'H1a and the difference is arithmetic, not an instruction');
var recon = extractFn(PAGEC, '_irAdviceVsPlan_');
ok(/recommended_quantity/.test(recon) && /currently_planned_quantity/.test(recon) && /remaining_unplanned/.test(recon),
  'H2  the three quantities are three separate fields');
ok(/recommendation_supply_sources/.test(recon) && /existing_route_sources/.test(recon),
  'H3  each side names its own supply');
ok(/supply_sources_comparable/.test(recon), 'H3a and whether they are the same supply is stated');
var reconHtml = extractFn(PAGEC, '_irAdviceVsPlanHtml_');
ok(/DIFFERENT supply/.test(reconHtml),
  'H4  when the sources differ, the strip refuses the reading that 400 ships from the same stock');
ok(/has NOT been applied/.test(reconHtml), 'H5  and never calls the saved routes this run\'s output');
ok(!/upsertShippingAllocationDraft|_persistAllocationDraft|buildDraftHeaderPayload/.test(recon + reconHtml),
  'H6  the manual 520 is never written to by the reconciliation');
// KMARC still owns which rows are the 520.
var live = ARC.currentPlanTotal(
  [{ allocation_draft_id: 'SADH-A', status: 'draft', company: 'ResUS', country: 'US', marketplace: 'Amazon' },
   { allocation_draft_id: 'SADH-B', status: 'draft', company: 'ResUS', country: 'US', marketplace: 'Amazon' }],
  [{ allocation_draft_line_id: 'L1', allocation_draft_id: 'SADH-A', sku: SKU, planned_qty: ROUTE_A_QTY, line_status: 'draft' },
   { allocation_draft_line_id: 'L2', allocation_draft_id: 'SADH-B', sku: SKU, planned_qty: ROUTE_B_QTY, line_status: 'draft' }],
  SCOPE);
eq(live.total, PLANNED, 'H7  and the shared authority still measures them at 520');

// ================================================================================================================
section('SAFETY');
// ================================================================================================================
ok(!/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true/.test(stripComments(CFG)), 'S1 the flag is not flipped');
ok(!/submitPlan|SUBMIT_PLAN|handleSubmit/.test(runnerSrc), 'S2 the diagnostic cannot Submit');
ok(!/(acquire|release|consume)Reservation|reserveFactoryStock/i.test(runnerSrc), 'S3 nor touch a reservation');
ok(!/carrier_rate_cards|carrier_lead_times/.test(runnerSrc), 'S4 nor read or write carrier master data');
ok(!/generateAiPlan|weeklyAiPlan\.generate/.test(runnerSrc), 'S5 nor start a generation');

// ================================================================================================================
section('MUTATION PROBES');
// ================================================================================================================
mut('M1  translating the option value away makes every live method unresolvable', function () {
  // The R6-R2 behaviour, reconstructed: map the label first, then demand a row spelled that way.
  var mapped = LIVE_METHODS.map(function (m) {
    var key = ({ '美森海卡': 'Sea Express' })[m] || '';
    return LANE.filter(function (r) { return String(r.shippingMethod).toLowerCase() === String(key).toLowerCase(); }).length;
  });
  var now = LIVE_METHODS.map(function (m) {
    return ETA.compute('US', { shipping_method: m, last_mile_delivery: TRUCK }, 'CN').available;
  });
  return JSON.stringify(mapped) === '[0,0,0]' && JSON.stringify(now) === '[true,true,true]';
});
mut('M2  asking the mapping table FIRST puts the old failure back', function () {
  var f = extractFn(PAGEC, '_irComputeRouteEta');
  var authorityFirst = f.indexOf('_irLeadTimeProfileFor_') < f.indexOf('_irMethodToLeadKey');
  var mutant = f.replace(/_irLeadTimeProfileFor_/g, '__disabled__');
  return authorityFirst === true && /_irLeadTimeProfileFor_/.test(mutant) === false;
});
mut('M3  widening to canonical identity when an exact token exists invents an ambiguity', function () {
  var mixed = LANE.concat([lt({ id: 'LTX', carrier: 'CX', method: 'Sea Express', lastMile: PARCEL, min: 9, max: 14, avg: 11 })]);
  var e = makeEta(mixed);
  var exactToken = e.compute('US', { shipping_method: LIVE_METHODS[1] }, 'CN');       // 美森海卡 — exact row exists
  // The mutant: collect by canonical identity in one pass, which pulls in `Sea Express` too.
  var profs = MR.serviceProfilesForRoute(mixed, LANE_CTX)
    .filter(function (p) { return CMP.IRService.matches(LIVE_METHODS[1], p.method); });
  var distinct = {};
  profs.forEach(function (p) { if (p.lastMileDelivery) distinct[p.lastMileDelivery] = 1; });
  return exactToken.available === true && Object.keys(distinct).length === 2;
});
mut('M4  resolving an ambiguous last mile by taking the first chooses for the operator', function () {
  var a = ETA.compute('US', { shipping_method: LIVE_METHODS[0] }, 'CN');
  var firstProfile = MR.serviceProfilesForRoute(LANE, LANE_CTX)
    .filter(function (p) { return p.method === LIVE_METHODS[0]; })[0];
  return a.available === false && a.source === 'LAST_MILE_REQUIRED' && !!firstProfile && firstProfile.maxDays !== null;
});
mut('M5  folding on the FASTEST max hides the slowest operator who runs the service', function () {
  var rows = LANE.filter(function (r) { return r.shippingMethod === LIVE_METHODS[1]; });
  var slow = Math.max.apply(null, rows.map(function (r) { return Number(r.maxDays); }));
  var fast = Math.min.apply(null, rows.map(function (r) { return Number(r.maxDays); }));
  return slow === 31 && fast === 26 && routeA.max_days === slow;
});
mut('M6  coercing a blank max_days produces an arrival of today', function () {
  var coerced = Number('');
  return coerced === 0 && isFinite(coerced) && blank.max_days === null && blank.available === false;
});
mut('M7  dropping the last mile from the refresher blinds a repaint', function () {
  var f = extractFn(PAGEC, '_irUpdateRouteEtas');
  var mutant = f.replace(/last_mile_delivery: _lmEl \? String\(_lmEl\.value \|\| ''\)\.trim\(\) : '',\s*\n/, '');
  var withLm = ETA.compute('US', { shipping_method: LIVE_METHODS[0], last_mile_delivery: PARCEL }, 'CN');
  var withoutLm = ETA.compute('US', { shipping_method: LIVE_METHODS[0] }, 'CN');
  return /last_mile_delivery: _lmEl/.test(f) && !/last_mile_delivery: _lmEl/.test(mutant)
    && withLm.available === true && withoutLm.available === false;
});
mut('M8  an unmapped basis equal to an unmapped method keeps a stale date under a new service', function () {
  // Both 空派 and 普船海卡 map to '' — the R6-R2 comparison would have called them the same basis.
  var oldWayNow = '', oldWayBasis = '';        // _irMethodToLeadKey returns '' for both
  var oldWaySaysSame = (!oldWayBasis || oldWayBasis === oldWayNow);
  return oldWaySaysSame === true && switched.source !== 'PERSISTED';
});
mut('M9  a content-sized ETA track makes every row resolve its own columns', function () {
  var mutantTracks = TRACKS.map(function (t, i) { return i === 4 ? { kind: 'auto', min: t.min } : t; });
  var strict = {}, loose = {};
  ROW_CASES.forEach(function (r) {
    var cw = [textW(r.from), textW(r.to), textW(r.qty), textW(r.method), textW(r.eta), 0];
    strict[JSON.stringify(trackOffsets(resolveTracks(TRACKS, 720, GAP, cw), GAP))] = 1;
    loose[JSON.stringify(trackOffsets(resolveTracks(mutantTracks, 720, GAP, cw), GAP))] = 1;
  });
  return Object.keys(strict).length === 1 && Object.keys(loose).length > 1;
});
mut('M10 a long To name moves another row\'s columns once any track is content-sized', function () {
  var mutantTracks = TRACKS.map(function (t, i) { return i === 1 ? { kind: 'auto', min: t.min } : t; });
  function off(tracks, to) {
    return JSON.stringify(trackOffsets(resolveTracks(tracks, 720, GAP,
      [textW('CN侑鑫'), textW(to), textW('320'), textW(LIVE_METHODS[1]), textW('2026-10-06 (latest, 31d)'), 0]), GAP));
  }
  var shortName = 'AMZ', longName = 'AMZLG&S Indianapolis Receiving Dock 12';
  return off(TRACKS, shortName) === off(TRACKS, longName)
    && off(mutantTracks, shortName) !== off(mutantTracks, longName);
});
mut('M11 keeping every near-miss header returns megabytes the editor cannot render', function () {
  return before.res.headers.length === 4005 && before.bytes > 3000000
    && after.res.headers.length <= 60 && after.bytes < 250000;
});
mut('M12 bounding the output by trimming the COUNTING rows would move the total', function () {
  var countingKept = after.res.headers.filter(function (h) { return h.counts_toward_current_plan; }).length;
  return countingKept === 2 && after.res.ui_current_plan_total === PLANNED
    && after.res.counts.omitted_for_size > 0;
});
mut('M13 swallowing the top-level exception restores the host\'s generic message', function () {
  return noArc.threw === null && noArc.res.error.code === 'KMARC_UNAVAILABLE'
    && noArc.res.error.failed_stage === 'RESOLVE_SHARED_AUTHORITY';
});
mut('M14 an unguarded route-key call ends a diagnostic that exists to describe bad rows', function () {
  var guarded = /try \{ gk = \(typeof ricK4GroupKey_ === 'function'\)/.test(CENSUSC);
  return guarded === true && withBad.threw === null
    && withBad.res.headers.filter(function (h) { return h.route_group_key_error; }).length === 1;
});
mut('M15 reading each sheet twice doubles the most expensive operation there is', function () {
  return after.calls === 2 && after.res.read_metrics.get_data_range_calls === 2;
});
mut('M16 a rate card becoming a prerequisite for an ARRIVAL', function () {
  var noCards = MR.methodsForRoute([], LANE_CTX);
  return noCards.length === 0 && routeA.available === true && routeA.max_days === 31;
});
mut('M17 the marketplace destination resolving its country from the word "Amazon"', function () {
  var f = extractFn(PAGEC, '_renderExecutionRoute');
  var fromScope = /if \(!destCountry\) destCountry = scope\.country;/.test(f);
  var parsesLabel = /destCountry\s*=\s*[^;]*['"]Amazon['"]/.test(f);
  return fromScope === true && parsesLabel === false;
});
mut('M18 the header row declaring its own template drifts from the rows it labels', function () {
  // R6-R4: the mutant is a header that re-declares the template, whatever the column COUNT is. Pinning the
  // count made this probe fail on the round that added a column, which is not the drift it was written to catch.
  var headBlock = /#ops-section \.ir-exec-plan__grid--head \{([\s\S]*?)\}/.exec(CSS)[1];
  return /grid-template-columns/.test(headBlock) === false && TRACKS.length >= 6;
});

console.log('\n---------------------------------------------------------------');
console.log('passed ' + pass + '  failed ' + fail);
console.log('mutants caught ' + neg.caught + ' of ' + (neg.caught + neg.missed));
console.log('---------------------------------------------------------------');
if (fail) process.exit(1);
