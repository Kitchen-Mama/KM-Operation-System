// ================================================================================================================
// F1-7N-FC-1B-E3-R3-R1 — MISSING FORECAST MEANS ZERO + SHIPPING AI PLAN MAINLINE UNBLOCK
// ----------------------------------------------------------------------------------------------------------------
// ONE FACT WAS BEING READ TWO OPPOSITE WAYS BY TWO CONSUMERS OF THE SAME TABLE.
//
// The §7 demand-weight window for RECO-2026-09 is 2026-10..2027-01, and nobody had created the 2027 base rows.
//
//   • The recommendation workspace (42_) SKIPS a month it cannot resolve and carries on — its basis loop adds
//     nothing for it, its per-month override loop `return`s. That is how Site Inventory showed a materialized
//     Suggested Qty of 520 for a SKU with no 2027 row at all.
//   • The weekly Shipping AI Plan (61_) required all four months to be PRESENT and dropped the whole site
//     otherwise. At a year boundary that is EVERY site: all 495 active scopes dropped, the receiver universe
//     empty, KMAF ready:false, and the operator told HARVEST_NOT_READY.
//
// Neither side named what it was doing, so the divergence was invisible. The user has now set the rule — an
// explicit zero, a blank cell and a missing year row are all ZERO, and none of them may block Inventory
// Summary, Shipping AI Plan or Ordering — and KMFCN is the one authority that applies it.
//
// WHAT MUST STILL BLOCK is the other half of the contract and is what keeps a zero honest: a zero is only
// legitimate when the system actually LOOKED and found nothing. A failed read, a missing table or header, an
// incomplete scope, a non-numeric value or two rows that disagree all mean the month is UNKNOWN, and unknown
// never becomes zero.
//
// THE 495-ROW ROLLOVER MIGRATION IS NOT RUN AND IS NO LONGER A PREREQUISITE. R3 hardened its runner and that
// work is kept — as OPTIONAL data maintenance, not as an AI Plan activation gate.
//
// Run: node assets/tests/forecast-missing-means-zero-and-ai-plan-unblock-f1-7n-fc-1b-e3-r3-r1.test.js
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
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
// Comments AND string literals removed — a keyword sweep that cannot tell a CALL from a SENTENCE has produced a
// false answer several times in this feature's history.
function ops(src) {
  return code(src).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function swap(src, find, repl) {
  var re = new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));
  if (!re.test(src)) throw new Error('swap anchor not found: ' + String(find).slice(0, 90));
  return String(src).replace(re, repl);
}

var KMFCN = require(path.join(ROOT, 'assets/js/core/supply-planning-forecast-normalization.js'));
var KMAF = require(path.join(ROOT, 'assets/js/core/supply-planning-allocation-facts.js'));
var KMWHA = require(path.join(ROOT, 'assets/js/core/supply-planning-weekly-harvest-adapter.js'));
var KMPCX = require(path.join(ROOT, 'assets/js/core/supply-planning-planning-context.js'));
var FCNSRC = read('assets/js/core/supply-planning-forecast-normalization.js');
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G42 = read('assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var G43 = read('assets/specs/active/apps-script/43_api_v1_gap_materialization.gs');
var HLTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var ROUTER = read('assets/specs/active/apps-script/01_router.gs');
var BUNDLE = read('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var ROLL = read('assets/tools/apps-script-diagnostics/TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER_2027.gs');
var PAGE = read('assets/js/pages/inventory-replenishment.js');
var BUILDER = read('assets/tools/build-apps-script-bundle.js');

var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var SKU = 'CO1100-R';
var CYCLE = 'RECO-2026-09';
var MONTHS = KMPCX._forecastWeightMonths('2026-09');
var HEADERS = ['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku'].concat(KMFCN.MONTH_ABBR);
var CTX_OK = { readSucceeded: true, tableMissing: false, schemaValid: true, headers: HEADERS };
function fcRow(o) {
  var r = { forecast_id: o.id || 'FC-X', year: o.year, company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: o.sku || SKU };
  KMFCN.MONTH_ABBR.forEach(function (m) { r[m] = (o[m] === undefined) ? '' : o[m]; });
  return r;
}
// The LIVE shape: a 2026 row with real months, and NO 2027 row at all.
var LIVE_ROWS = [fcRow({ id: 'FC-2026-1', year: 2026, oct: 200, nov: 180, dec: 140 })];
function win(rows, ctx, scope, sku) {
  return KMFCN.normalizeWindow({ context: ctx || CTX_OK, scope: scope || SCOPE, sku: sku || SKU,
    months: MONTHS, matchingRows: KMFCN.rowsForScope(rows, scope || SCOPE, sku || SKU) });
}

// ================================================================================================================
section('§1 — FORECAST SEMANTICS: the four zeros, and the eight refusals');
// ================================================================================================================
eq(MONTHS, ['2026-10', '2026-11', '2026-12', '2027-01'], 'S0  the window spans a year boundary — that is the whole setting');

// 1. a valid positive number is itself
var m1 = KMFCN.normalizeMonth({ context: CTX_OK, scope: SCOPE, sku: SKU, month: '2026-10', matchingRows: LIVE_ROWS });
eq([m1.ok, m1.value, m1.provenance], [true, 200, 'ACTUAL'], 'S1  §1.1 a positive number is used verbatim');
// 2. an explicit numeric zero
var m2 = KMFCN.normalizeMonth({ context: CTX_OK, scope: SCOPE, sku: SKU, month: '2026-10',
  matchingRows: [fcRow({ year: 2026, oct: 0 })] });
eq([m2.ok, m2.value, m2.provenance], [true, 0, 'EXPLICIT_ZERO'], 'S2  §1.2 an explicit 0 is 0, and says so');
// 3. a blank month cell in a row that exists
var m3 = KMFCN.normalizeMonth({ context: CTX_OK, scope: SCOPE, sku: SKU, month: '2026-10',
  matchingRows: [fcRow({ year: 2026, nov: 5 })] });
eq([m3.ok, m3.value, m3.provenance], [true, 0, 'DEFAULT_ZERO_BLANK_MONTH'], 'S3  §1.3 a blank cell is 0');
// 4. no row for the required year — THE live case
var m4 = KMFCN.normalizeMonth({ context: CTX_OK, scope: SCOPE, sku: SKU, month: '2027-01', matchingRows: LIVE_ROWS });
eq([m4.ok, m4.value, m4.provenance], [true, 0, 'DEFAULT_ZERO_MISSING_YEAR'], 'S4  §1.4 no row for the year is 0 — the live case');

// 5-11. the refusals. Each one is a state where nothing is KNOWN, and unknown never becomes zero.
function blocked(label, ctx, rows, scope, sku) {
  var r = win(rows || LIVE_ROWS, ctx, scope, sku);
  return r;
}
eq(blocked('t', { timedOut: true }).reason, 'REQUEST_TIMEOUT', 'S5  §1 a timeout BLOCKS — it never becomes 0');
eq(blocked('t', { readSucceeded: true, transportFailed: true }).reason, 'TRANSPORT_FAILURE', 'S6  a transport failure BLOCKS');
eq(blocked('t', { readSucceeded: true, tableMissing: true }).reason, 'TABLE_MISSING', 'S7  a missing table BLOCKS');
eq(blocked('t', { readSucceeded: true, schemaValid: true, headers: ['year', 'company', 'sku'] }).reason,
  'REQUIRED_HEADER_MISSING', 'S8  a missing required header BLOCKS');
eq(blocked('t', CTX_OK, [fcRow({ year: 2026, oct: 'n/a', nov: 1, dec: 1 })]).reason,
  'INVALID_NUMERIC_VALUE', 'S9  a present but non-numeric value BLOCKS — somebody typed something unknown');
eq(blocked('t', CTX_OK, [], { company: 'ResUS', country: '', marketplace: 'Amazon' }).reason,
  'SCOPE_IDENTITY_INCOMPLETE', 'S10 an incomplete scope identity BLOCKS');
eq(blocked('t', CTX_OK, [fcRow({ id: 'A', year: 2026, oct: 200, nov: 1, dec: 1 }), fcRow({ id: 'B', year: 2026, oct: 999, nov: 1, dec: 1 })]).reason,
  'DUPLICATE_CONFLICTING_ROWS', 'S11 two rows that DISAGREE BLOCK — no tool may pick a winner');
eq(blocked('t', { readOutcomeUnknown: true }).reason, 'READ_OUTCOME_UNKNOWN', 'S11a an unknown outcome BLOCKS');
// A caller that forgot to state the outcome is NOT a caller that observed success.
eq(blocked('t', {}).reason, 'READ_OUTCOME_UNKNOWN', 'S11b and so does a caller that never said the read succeeded');
eq(KMFCN.BLOCK_CODES.slice().sort(),
  ['DUPLICATE_CONFLICTING_ROWS', 'INVALID_NUMERIC_VALUE', 'READ_OUTCOME_UNKNOWN', 'REQUEST_TIMEOUT',
   'REQUIRED_HEADER_MISSING', 'SCOPE_IDENTITY_INCOMPLETE', 'TABLE_MISSING', 'TRANSPORT_FAILURE'],
  'S12 §1 the refusal vocabulary is exactly the eight codes the contract names');

// The duplicate policy is INHERITED, not invented: agreeing rows already resolved under the shipped rule.
var agree = win([fcRow({ id: 'A', year: 2026, oct: 200, nov: 180, dec: 140 }), fcRow({ id: 'B', year: 2026, oct: 200, nov: 180, dec: 140 })]);
eq([agree.ok, agree.basis], [true, 520], 'S13 §1 AGREEING duplicates resolve to their single value (inherited policy, no merge invented)');
ok(/exactly one distinct finite value|ONE distinct/i.test(FCNSRC),
  'S13a and the module records that it inherited that rule rather than choosing it');

// The audit counters §1 requires.
var live = win(LIVE_ROWS);
eq(live.counters, { actual_count: 3, explicit_zero_count: 0, default_zero_blank_count: 0, default_zero_missing_year_count: 1 },
  'S14 §1 every default-to-zero is counted, by provenance');
eq(live.basis, 520, 'S14a and the live basis is 520 — the three real months plus a zero for the missing year');
// §1 — normalization NEVER writes.
eq(['appendRow', 'setValue', 'setValues', 'getRange', 'SpreadsheetApp', 'insertRow']
  .filter(function (w) { return ops(FCNSRC).indexOf(w) !== -1; }), [],
  'S15 §1 the authority contains NO write call — this is runtime normalization, not a migration');
ok(!/new Date\(\)|Date\.now/.test(ops(FCNSRC)), 'S15a and reads no clock');

// ================================================================================================================
section('§2 — THE CANONICAL DEMAND AUTHORITY (measured from the shipped chain)');
// ================================================================================================================
// 1. Where the 520 on screen comes from: the MATERIALIZED gap table, not a DOM computation.
ok(/_irMatNum\(row\.d90_suggested_qty\)/.test(code(PAGE)),
  'D1  §2.1 the screen reads inventory_replenishment_gap.d90_suggested_qty — a DB-backed value');
ok(/INV_GAP_TABLE_ = 'inventory_replenishment_gap'/.test(G43) && /d90_suggested_qty/.test(G43),
  'D1a and 43_ is the owner that persists it');
// 2. Its lineage: calculation_date + status come from the frozen planning config, never a browser clock.
ok(/calculation_date/.test(G43) && /calculation_status/.test(G43),
  'D2  §2.2 the materialized row carries calculation_status and calculation_date...');
ok(/come from the frozen planning config \(server\), NOT a browser clock/.test(G43),
  'D2a ...resolved from the frozen planning config, not a clock');
// 3/6. The AI Plan's DEMAND is the canonical gap, taken from the same engine that feeds the materialization.
var enumFn = code(extractFn(G61, 'weeklyAiPlanEnumerateSites_'));
ok(/handleRecommendationWorkspaceGet_/.test(enumFn),
  'D3  §2.3/§2.6 the AI Plan takes its demand from the CANONICAL recommendation workspace...');
ok(/cumulativeGapByWindow: cum/.test(enumFn) && /cum\[wc\] = h\.gapQty/.test(enumFn),
  'D3a ...as horizons[].gapQty — the same authority 43_ materializes');
ok(/gapCalcResolveContext_\('INVENTORY'\)/.test(enumFn),
  'D3b under the server-resolved calculation context, never a clock');
// 4/5. The forecast re-read is NOT a second gap calculation — it is the §7 allocation WEIGHT.
var recvFn = code(extractFn(G61, 'weeklyAiPlanBuildKmafReceivers_'));
ok(/forecastBasis: \{ forecastShareQty: shareSum/.test(recvFn),
  'D4  §2.4 the forecast re-read produces forecastShareQty — the §7 WEIGHT basis');
ok(/demandWeight = s\.basis \/ totalBasis/.test(code(read('assets/js/core/supply-planning-allocation-facts.js'))),
  'D4a which KMAF uses ONLY as a proportional share (basis ÷ Σ basis)');
ok(!/gapQty\s*=|calculateGap\(/.test(recvFn),
  'D5  §2.5 it computes NO gap — there is no second demand calculation in the allocation stage');
// The DOM can never be the SSOT.
ok(!/document\.|querySelector|getElementById/.test(ops(G61)),
  'D6  §2 the server-side AI Plan chain cannot read the DOM at all');

// ================================================================================================================
section('§3/§4 — CO1100-R: the block is gone, and the allocator runs');
// ================================================================================================================
function receiver(sku, basis, dest) {
  return { receiverKey: 'ResUS|US|Amazon|' + sku + '|' + dest, demandRef: 'ResUS|US|Amazon|' + sku + '|' + dest,
    demandKey: 'ResUS|US|Amazon|' + sku + '|' + dest, demandDriver: 'FORECAST_DRIVEN',
    company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: sku, masterSku: sku, siteSku: sku,
    fulfillmentModel: 'platform_fulfilled', allocationPriority: 1, unitsPerCarton: 20,
    windowCode: CYCLE, destinationWarehouseId: dest,
    forecastBasis: { forecastShareQty: basis, forecastMonth1: { month: MONTHS[0], baseForecast: 200 },
      forecastMonth2: { month: MONTHS[1], baseForecast: 180 }, targetRules: {}, specialEventDemand: 0 } };
}
var WH = [
  { warehouse_id: 'WH-CN-F1', warehouse_type: 'factory', is_factory_warehouse: true, is_active: true, country: 'CN' },
  { warehouse_id: 'MKT-AMZ-US', warehouse_type: 'marketplace', is_factory_warehouse: false, is_active: true, country: 'US' }
];
function kmafFor(basis) {
  return KMAF.projectAllocationFacts({
    recommendationType: 'WEEKLY_SHIPPING', planningCycle: CYCLE,
    businessScope: { company: 'ResUS', country: 'US' }, calculationDate: '2026-09-01',
    receivers: [receiver(SKU, basis, 'MKT-AMZ-US')], warehouses: WH });
}
function mapFor(kmaf, gap) {
  return KMWHA.mapWeeklyHarvestToBatchRequest({
    planningCycle: CYCLE, businessScope: { company: 'ResUS', country: 'US', source_page: 'inventory_replenishment' },
    mode: 'GENERATE', confirmRegenerateOverUserEdits: false, actor: 'user', now: '2026-09-04T00:00:00Z',
    sourceDataAsOf: '2026-09-01', formulaVersion: 'WEEKLY_AI_PLAN_V1', errors: [],
    factoryIdentityConfig: { CN: 'WH-CN-F1' },
    warehousesById: { 'WH-CN-F1': WH[0], 'MKT-AMZ-US': WH[1] }, kmaf: kmaf,
    horizonsByDemandRef: { 'ResUS|US|Amazon|CO1100-R|MKT-AMZ-US': { cumulativeGapByWindow: { D90: gap }, requiredByByWindow: { D90: '2026-12-01' } } },
    poolsBySku: { 'CO1100-R': { overseasSupplyPools: [], factoryPools: [{ warehouseId: 'WH-CN-F1', availableQty: 5000 }] } } });
}
// PRE: the site was dropped BEFORE KMAF, so the universe was empty.
var pre = KMAF.projectAllocationFacts({ recommendationType: 'WEEKLY_SHIPPING', planningCycle: CYCLE,
  businessScope: { company: 'ResUS', country: 'US' }, calculationDate: '2026-09-01', receivers: [], warehouses: WH });
eq([pre.ready, (pre.receiverFacts || []).length, pre.reason], [false, 0, 'PLANNING_FACTS_NOT_READY'],
  'A1  §3 PRE: with the site dropped, KMAF is not ready and the reason is the empty universe');
var preMapped = mapFor(pre, 520);
eq(preMapped.ready, false, 'A1a and the readiness answer refuses');

// POST: the normalized basis lets the receiver survive.
var k = kmafFor(live.basis);
eq(k.ready, true, 'A2  §4 POST: KMAF_READY = true');
eq((k.receiverFacts || []).length, 1, 'A2a receiverFacts > 0');
eq((k.issues || []).map(function (i) { return i.code; }), [], 'A2b with no issues');
eq(k.receiverFacts[0].demandWeight, 1, 'A2c and a resolved demandWeight');
var mapped = mapFor(k, 520);
eq(mapped.ready, true, 'A3  §4 the canonical readiness answer is READY');
eq(mapped.reason, null, 'A3a with no blocking reason');
ok(!!mapped.request, 'A3b and a request is produced');
var lane = mapped.request.skus[0].lanes[0];
eq(mapped.request.skus.length, 1, 'A4  §4 a complete payload: one SKU...');
eq(lane.cumulativeGapByWindow.D90, 520,
  'A4a ...carrying the CANONICAL DB-backed demand of 520 — the same number the screen shows');
eq(lane.destinationWarehouseId, 'MKT-AMZ-US', 'A4b with its resolved destination');
eq(lane.demandWeight, 1, 'A4c and its share');
eq(mapped.request.skus[0].factoryPools.length, 1, 'A4d and the factory pool it may draw from');
eq(mapped.request.businessScope.company, 'ResUS', 'A4e under the requested scope');
eq(mapped.request.sourceDataAsOf, '2026-09-01',
  'A5  §3 source_data_as_of comes from the harvest lineage, never from a clock');
ok(!/new Date\(\)|Date\.now/.test(ops(extractFn(G61, 'weeklyAiPlanBuildKmafReceivers_'))),
  'A5a and the receiver builder reads no clock at all');
// DETERMINISM: the same inputs twice give the same answer.
eq(JSON.stringify(mapFor(kmafFor(live.basis), 520).request), JSON.stringify(mapped.request),
  'A6  §4 the result is deterministic — identical inputs, identical payload');
// QUANTITY CONSERVED: the lane's demand is exactly the canonical gap, not a re-derivation.
eq(lane.cumulativeGapByWindow.D90, 520, 'A7  §4 requested = allocated basis = the canonical 520, not recomputed');

// §3 — zero demand produces NO demand, never a fabricated gap.
var zeroWin = win([fcRow({ year: 2026, oct: 0, nov: 0, dec: 0 })]);
eq([zeroWin.ok, zeroWin.basis], [true, 0], 'A8  §3 an all-zero window resolves, with a basis of 0');
eq(zeroWin.counters.explicit_zero_count + zeroWin.counters.default_zero_missing_year_count, 4,
  'A8a every month accounted for by provenance');
// A zero window must not manufacture demand. Measured through KMAF: a receiver whose basis is 0 gets a
// demandWeight of 0 when the GROUP still has demand, and never a share it did not earn.
var zeroK = KMAF.projectAllocationFacts({ recommendationType: 'WEEKLY_SHIPPING', planningCycle: CYCLE,
  businessScope: { company: 'ResUS', country: 'US' }, calculationDate: '2026-09-01',
  receivers: [receiver(SKU, 520, 'MKT-AMZ-US'), receiver('CO9999-R', 0, 'MKT-AMZ-US')], warehouses: WH });
eq(zeroK.ready, true, 'A8b a zero-demand SKU beside a real one does not break the group');
var zf = zeroK.receiverFacts.filter(function (f) { return /CO9999-R/.test(f.receiverKey); })[0];
eq(zf.demandWeight, 0, 'A8c and it earns a share of exactly ZERO — no gap is invented for it');
eq(zeroK.receiverFacts.filter(function (f) { return /CO1100-R/.test(f.receiverKey); })[0].demandWeight, 1,
  'A8d while the SKU that does have demand keeps the whole share');

// §3 — the block that remains is TYPED, and names which refusal it is.
ok(/FORECAST_BASIS_UNRESOLVED/.test(G61) && /win\.reason/.test(recvFn),
  'A9  §4 a genuine data fault still blocks, and now names WHICH of the eight refusals');
// On the RAW source and anchored on the CALL. My first draft searched ops(G61), which blanks every string
// literal — so it could never match and passed no matter what the file said. A probe that cannot fail is
// worse than no probe.
ok(!/weeklyAiPlanErr_\('FORECAST_SHARE_INCOMPLETE'/.test(G61),
  'A9a and the old catch-all that covered a year boundary and a corrupt table alike is no longer RAISED');
ok(/weeklyAiPlanErr_\('FORECAST_BASIS_UNRESOLVED'/.test(G61),
  'A9b while the typed replacement is raised in its place');
ok(/FORECAST_BASIS_UNRESOLVED: READINESS_CODES\.SUGGESTED_QTY_UNRESOLVED/.test(read('assets/js/core/supply-planning-weekly-harvest-adapter.js')),
  'A10 §3 the new engine code is mapped to an EXISTING readiness code, not a synonym');
ok(/FORECAST_SHARE_INCOMPLETE: READINESS_CODES\.SUGGESTED_QTY_UNRESOLVED/.test(read('assets/js/core/supply-planning-weekly-harvest-adapter.js')),
  'A10a and the old one is KEPT, so a mixed deployment still maps');

// The read-context gate: a missing table can NEVER become a plan for nothing.
var ctxFn = code(extractFn(G61, 'weeklyAiPlanForecastReadContext_'));
ok(/tableMissing: true/.test(ctxFn), 'A11 §1 61_ detects a MISSING forecast tab explicitly...');
ok(/readOutcomeUnknown: true/.test(ctxFn), 'A11a ...and a throw is an UNKNOWN outcome, not an empty table');
ok(/getLastColumn\(\) < 1/.test(ctxFn), 'A11b and a header-less tab is a schema fault');
ok(!/appendRow|setValue/.test(ops(ctxFn)), 'A11c while reading nothing but the header row');

// ================================================================================================================
section('§5 — SHIPPING vs ORDERING: one authority, so they cannot drift');
// ================================================================================================================
// 42_ (Inventory Summary / Ordering basis) ALREADY skips an unresolved month — that is the behaviour Shipping
// now matches, rather than the other way round.
var a2Fn = code(extractFn(G42, 'recoWsOngoingIncomingForReceiver_'));
ok(/if \(typeof v === 'number' && isFinite\(v\)\) basis \+= v;/.test(a2Fn),
  'B1  §5.A/§5.C Inventory Summary already contributes nothing for an unresolved month — it never blocked');
ok(/var fcMonth = fcByMonth\[mm\]; if \(fcMonth == null\) return;/.test(code(G42)),
  'B1a and its per-month demand override skips one too');
// Shipping now reads the same absence the same way.
eq(win(LIVE_ROWS).values['2027-01'], 0, 'B2  §5.B Shipping reads the missing 2027 month as 0...');
eq(win(LIVE_ROWS).basis, 520, 'B2a ...so its basis matches what Inventory Summary computes from the same rows');
// ONE authority, and it is the only forecast reader in the harvest.
eq((ops(recvFn).match(/KMFCN\.normalizeWindow/g) || []).length, 1,
  'B3  §5 the harvest has exactly ONE forecast reading, through the shared authority');
ok(!/recoWsRegularForecastByMonth_/.test(ops(recvFn)),
  'B3a and no second reader beside it');
// D. Submit / Weekly Shipping Plan must not re-read raw forecast.
var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
ok(!/fc_regular_forecast/.test(ops(G11)),
  'B4  §5.D the Submit / Weekly Shipping Plan owner never re-reads raw forecast');
// §5 — the untouchable formulas are untouched this round.
// §5 forbids touching the demand/supply/pooling formulas this round. `fs.existsSync` on those files would be
// trivially true and prove nothing; what IS provable is that the new authority cannot reach them — it has no
// dependency on any of them, so it cannot have changed how any of them computes.
['supply-planning-ledgers', 'supply-planning-qualified-incoming', 'supply-planning-allocations',
 'supply-planning-time-phased-projection', 'supply-planning-horizon-projection'].forEach(function (m, i) {
  ok(ops(FCNSRC).indexOf(m) === -1 && ops(FCNSRC).indexOf('require(') === -1,
    'B5.' + (i + 1) + ' §5 KMFCN has no dependency on ' + m + ' — it cannot have changed that formula');
});
var _fcnOrderLine = (BUILDER.split(/\r?\n/).filter(function (l) {
  return l.indexOf("'supply-planning-forecast-normalization'") !== -1; })[0]) || '';
ok(/no deps/.test(_fcnOrderLine),
  'B5a and the bundle order records it as SELF-CONTAINED');

// ================================================================================================================
section('§6 — the 495-row migration is OPTIONAL and was NOT run');
// ================================================================================================================
ok(/var TEMP_FCROLL_DRY_RUN = true;/.test(ROLL), 'M1  §6 DRY_RUN still ships true');
ok(/var TEMP_FCROLL_BATCH_SIZE_ = 25;/.test(ROLL), 'M2  §6 R3\'s fixed batch size is preserved');
ok(/TEMP_FCROLL_verify_/.test(ops(ROLL)) && /non_zero_months/.test(ROLL), 'M3  §6 per-business-key readback preserved');
ok(/RESUME_REQUIRED/.test(ROLL), 'M4  §6 resume-required preserved');
ok(/UNEXPECTED_UPDATE_EXISTING_ROW_MAY_HAVE_BEEN_OVERWRITTEN/.test(ROLL), 'M5  §6 the updated>0 hard STOP preserved');
ok(/outcome_unknown = true/.test(ops(ROLL)), 'M6  §6 partial-outcome reconciliation preserved');
ok(!/TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER|TEMP_FC_FORECAST_YEAR_ROLLOVER/.test(HLTH),
  'M7  §6 neither TEMP is in the deployment manifest');
ok(!/TEMP_FC_/.test(ops(ROUTER)), 'M7a nor routed as an action');
// The migration is no longer an activation prerequisite anywhere in the code.
ok(!/rollover|2027 row|year_rollover/i.test(ops(extractFn(G61, 'weeklyAiPlanBuildKmafReceivers_'))),
  'M8  §6 the harvest does not depend on the rollover in any way');

// ================================================================================================================
section('§7 — the flag, and the deployment contract');
// ================================================================================================================
eq(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = (\w+);/.exec(CFG)[1], 'false',
  'F1  §7 the AI Plan flag is FALSE at the end of this round');
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_/.test(CFG), 'F1a and the rollback switch is preserved');
// Build stamps move together with the manifest that expects them.
var wap = /var WAP_BUILD_VERSION_ = '([^']+)'/.exec(G61)[1];
var sys = /var SYS_BUILD_VERSION_ = '([^']+)'/.exec(HLTH)[1];
var wapExpect = (HLTH.match(/\{ file: '61_api_v1_weekly_ai_plan\.gs',[^}]*expected: '([^']+)'/) || [])[1];
var sysExpect = (HLTH.match(/\{ file: '63_api_v1_system_health\.gs',[^}]*expected: '([^']+)'/) || [])[1];
eq(wap, wapExpect, 'F2  §7 61_ declares exactly the build its manifest entry expects (' + wap + ')');
eq(sys, sysExpect, 'F2a and 63_ does the same (' + sys + ')');
// RESTATED (F1-7N-FC-1B-E3-R4): this pinned the literal build R3-R1 happened to mint, so the next round to
// change 61_ turned an assertion about "this round moved it" into one about "R3-R1 was the last to move it".
// The DEFECT it guards is 61_ shipping at a stamp EARLIER than the round that changed its behaviour, and that
// is what a FLOOR states. F2/F2a above still prove the stamp and the manifest AGREE, which is the live check.
ok(require(path.join(ROOT, 'assets/tests/_release-order.js')).stampAtOrAfter(wap, 'F1-7N-FC-1B-E3-R3-R1'),
  'F2b and 61_ is stamped at or after the round whose behaviour it carries (' + wap + ')');
// KMFCN is registered as a bundle module and is actually IN the generated bundle.
ok(/'supply-planning-forecast-normalization'/.test(BUILDER), 'F3  §7 KMFCN is registered in the bundle module order');
ok(/\['KMFCN', 'supply-planning-forecast-normalization'\]/.test(BUILDER), 'F3a and bound to the KMFCN global');
ok(/DEFAULT_ZERO_MISSING_YEAR/.test(BUNDLE), 'F3b and the generated bundle really carries it');
ok(/KMFCN/.test(BUNDLE), 'F3c under that name');

// ================================================================================================================
section('§7 — EXECUTED: the health handler, with every .gs in one context');
// ================================================================================================================
(function healthMirror() {
  var DIR = path.join(ROOT, 'assets/specs/active/apps-script');
  var files = fs.readdirSync(DIR).filter(function (f) { return /\.gs$/.test(f); }).sort();
  function sheet() {
    return { getDataRange: function () { return { getValues: function () { return [[]]; } }; },
      getLastRow: function () { return 1; }, getLastColumn: function () { return 1; },
      getRange: function () { return { getValues: function () { return [[]]; }, setValue: function () {} }; },
      appendRow: function () {} };
  }
  var sb = {
    console: { log: function () {} }, Date: Date, Math: Math, JSON: JSON, RegExp: RegExp, String: String,
    Number: Number, Boolean: Boolean, Array: Array, Object: Object, Error: Error, isFinite: isFinite,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    Logger: { log: function () {} },
    Utilities: { getUuid: function () { return 'aaaaaaaa-bbbb'; }, formatDate: function () { return '2026-09-04'; },
      computeDigest: function () { return [1]; }, DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
      base64Encode: function (x) { return String(x); }, sleep: function () {} },
    Session: { getScriptTimeZone: function () { return 'Asia/Taipei'; },
      getActiveUser: function () { return { getEmail: function () { return 'x@y.z'; } }; } },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return { getId: function () { return 'SS-1'; }, getSheetByName: function () { return sheet(); }, getSheets: function () { return []; } }; },
      openById: function () { return { getId: function () { return 'SS-1'; }, getSheetByName: function () { return sheet(); }, getSheets: function () { return []; } }; },
      flush: function () {} },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {}, deleteProperty: function () {} }; } },
    CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
    ContentService: { createTextOutput: function (t) { return { setMimeType: function () { return this; }, getContent: function () { return t; } }; }, MimeType: { JSON: 'application/json' } },
    ScriptApp: { getService: function () { return { getUrl: function () { return 'https://example/exec'; } }; } },
    UrlFetchApp: { fetch: function () { throw new Error('NO NETWORK'); } }, DriveApp: {}, MailApp: {}
  };
  sb.global = sb; sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  var loaded = 0;
  files.forEach(function (f) {
    try { vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f }); loaded++; } catch (e) {}
  });
  eq(loaded, files.length, 'H1  EXECUTED: every one of the ' + files.length + ' .gs files loads in one shared scope');
  var h = vm.runInContext('JSON.parse(handleSystemHealth_({}).getContent())', ctx);
  eq(h.inventory_ai_plan_db_generation_enabled, false, 'H2  §7 flag_effective = false');
  eq(h.mixed_deployment, false, 'H3  §7 mixed_deployment = false');
  eq(h.missing_actions, [], 'H4  §7 missing_actions = []');
  eq((h.module_build_stamps || {}).stale_modules, [], 'H5  §7 stale_modules = []');
  ok(/^UNIFORM/.test(String(h.deployment_uniformity_verdict)), 'H6  §7 deployment uniformity = UNIFORM');
  eq(h.deployed_action_contract_version, 11, 'H7  §7 deployed_action_contract_version = 11');
  eq(h.required_action_list_version, 12, 'H7a required_action_list_version = 12');
  eq(h.transport_contract_version, 1, 'H7b transport_contract_version = 1');
  eq(h.build_id, sys, 'H8  and the deployment build is 63_\'s own stamp');
  // KMFCN really is reachable from the Apps Script global scope.
  eq(vm.runInContext('typeof KMFCN.normalizeWindow', ctx), 'function',
    'H9  §1 KMFCN is reachable as an Apps Script global — the bundle binding works');
  var liveWin = vm.runInContext('KMFCN.normalizeWindow({ context: { readSucceeded: true, schemaValid: true, headers: ' +
    JSON.stringify(HEADERS) + ' }, scope: ' + JSON.stringify(SCOPE) + ', sku: "' + SKU + '", months: ' +
    JSON.stringify(MONTHS) + ', matchingRows: ' + JSON.stringify(LIVE_ROWS) + ' })', ctx);
  eq([liveWin.ok, liveWin.basis], [true, 520],
    'H9a and IN Apps Script it resolves the live CO1100-R window to 520 with the missing year at 0');
  // Generation is still refused while the flag is false — zero writes in this round, by construction.
  var gen = vm.runInContext('JSON.parse(handleGenerateWeeklyAiPlanDraft_({ company: "ResUS", country: "US", marketplace: "Amazon", planningCycle: "' + CYCLE + '" }).getContent())', ctx);
  eq(gen.success, false, 'H10 §7 generation with the flag false is refused');
  eq(((gen.errors || [])[0] || {}).code, 'INVENTORY_AI_PLAN_DB_GENERATION_DISABLED', 'H10a with the flag\'s own code');
})();

// ================================================================================================================
section('§8 - the recurring first-attempt timeout is MEASURED, and nothing about the request path moved');
// ================================================================================================================
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var INDEX = read('index.html');
var API = read('assets/js/api/operation-system-db-api.js');
var TRANSPORT = read('assets/js/api/km-transport.js');
var stageFn = code(extractFn(PAGE, '_irReadStageReport_'));

ok(/window\._irReadStageReport_ = _irReadStageReport_;/.test(PAGE),
  'T1  §8 a per-stage report exists and is reachable by name');
['page_boot_elapsed_ms', 'client_total_elapsed_ms', 'server_execution_ms', 'request_count',
 'coalesced_count', 'retry_count', 'first_attempt', 'retry_attempt'].forEach(function (f, i) {
  ok(stageFn.indexOf(f) !== -1, 'T2.' + (i + 1) + ' §8 it reports ' + f);
});
['deployment_contract', 'inventory_workspace', 'recommendation_read', 'allocation_hydration'].forEach(function (st, i) {
  ok(/IR_READ_STAGES_/.test(PAGE) && PAGE.indexOf("stage: '" + st + "'") !== -1,
    'T3.' + (i + 1) + ' §8 with a named stage for ' + st);
});
ok(/first_vs_retry_delta_ms/.test(stageFn),
  'T4  §8 and the FIRST vs RETRY difference, which is the actual question');
// RESTATED (F1-7N-FC-1B-E3-R4): THE UNDERLYING CLAIM WAS WRONG, not merely pinned.
//
// R3-R1 asserted a hard `= null` and justified it as "the transport records client elapsed only". That was
// true of the TRANSPORT and false of the ANSWER: the inventory workspace envelope has always carried
// meta.serverDurationMs, and the page was discarding it. R4 captures it, so the constant is gone and the
// assertion that pinned the constant had to go with it.
//
// What must STILL hold is the thing the original was protecting: server time is REPORTED, never INFERRED from
// the client number. So this now checks the two properties that actually encode that — the value is read from
// the server's own meta, and no arithmetic on a client elapsed time can reach it.
ok(/_irLastReadMeta[\s\S]{0,120}server_execution_ms/.test(stageFn),
  'T5  §8 server execution time comes from the SERVER envelope meta, not from a client measurement');
ok(!/server_execution_ms\s*=\s*[^;]*(client_total|reads\[|\.ms\b)/.test(stageFn),
  'T5a and it is never derived from the client elapsed number — reported or null, never estimated');
ok(/server_execution_ms:\s*\(typeof _m\.serverDurationMs === 'number'\)/.test(PAGE),
  'T5b the capture requires an actual number from the envelope — a missing field stays null, not 0');
ok(/RECURRING_FIRST_ATTEMPT_TIMEOUT/.test(PAGE),
  'T6  §8 the status is RECURRING, not a single transient occurrence');
ok(!/NOT REPRODUCED/i.test(code(PAGE)),
  'T6a and the page no longer carries the NOT REPRODUCED reading anywhere');
// §8 - nothing about the request path was touched.
ok(/KM_READ_TIMEOUT_MS_/.test(API), 'T7  §8 the read bound still exists...');
ok(!/_irReadStageReport_|IR_READ_STAGES_/.test(API),
  'T7a ...and the measurement is not wired into the request path at all');
// The first version searched for the word `retry` and matched `retry_count` — a FIELD IT REPORTS, not a
// retry it performs. Reading how many retries happened is the whole point; the claim is that it never causes
// one. So the probe names the constructs that would actually issue or schedule a request.
ok(!/setTimeout\(|setInterval\(|fetch\(|XMLHttpRequest|KM\.DB\.|\.request\(|sessionStorage|localStorage/.test(stageFn),
  'T8  §8 the report issues no request, schedules nothing, and reads no cache');
ok(/metrics\(\)/.test(stageFn) && /retry_count = m\.retries/.test(stageFn),
  'T8a it only READS the retry count the transport already keeps');
ok(/samples: _metrics\.samples\.slice\(\)/.test(TRANSPORT),
  'T9  §8 it reads samples the transport ALREADY records - no new collection was added');
ok(/if \(_metrics\.samples\.length < 400\)/.test(TRANSPORT),
  'T9a which are bounded at 400, so the measurement cannot grow without limit');
// §8 - the timeout is NOT attributed to the forecast.
ok(!/forecast/i.test(stageFn),
  'T10 §8 and the stage report does not mention the forecast - they are unrelated causes');

// ================================================================================================================
section('§10 - release identity');
// ================================================================================================================
// RESTATED (F1-7N-FC-1B-E3-R4): the EIGHTH consecutive round to pin its own token as "the current one", and it
// has now broken in exactly the same way eight times. Every round writes an assertion about the PRESENT, the
// next round rotates the series, and the assertion silently becomes one about the past. What R3-R1 actually
// needed to guarantee is a FLOOR: it minted its own token, that token came after R2's, and the series has
// never moved behind it. All three still fail if R3-R1's rotation is undone, which is the defect.
ok(RO.tokenIndex('fc1b-e3r3r1-forecastzero-20260904') !== -1, 'R1  this round minted its own application token');
ok(RO.tokenIndex('fc1b-e3r3r1-forecastzero-20260904') > RO.tokenIndex('fc1b-e3r2-composerstate-20260903'),
  'R1a strictly after R2\'s, which was PUBLISHED (origin/main carries 4979903)');
ok(RO.tokenIndex(RO.currentAppToken()) >= RO.tokenIndex('fc1b-e3r3r1-forecastzero-20260904'),
  'R1b and the series has not moved behind it (current: ' + RO.currentAppToken() + ')');
eq((INDEX.match(/\?v=fc1b-e3r2-composerstate-20260903/g) || []).length, 0,
  'R2  zero production refs remain on R2\'s token');
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '', 'R2a and nothing is left behind on any superseded token');
var IX = RO.parseIndexTokens(INDEX);
eq(IX['assets/js/pages/inventory-replenishment.js'], RO.currentAppToken(),
  'R3  the page carries it - it is the ONE browser asset this round changes');
eq(IX[RO.IR_CSS_FILE], RO.currentIrCssToken(),
  'R4  and the stylesheet stays on its own family token: it did NOT change this round');
// RESTATED (A2-R1-R6-R1): a pinned stylesheet-token literal. R6-R1 adds `.ir-scope-company`,
// `.ir-plan-recon` and `.replen-card__method-cell`, so the family legitimately rotated again. The
// durable claim is a FLOOR against the shared ledger, not equality with one round's value.
ok(RO.irCssTokenAtOrAfter(RO.currentIrCssToken(), 'irroutehint-20260903'),
  'R4a which is at or after R2\'s');
ok(RO.stampAtOrAfter('F1-7N-FC-1B-E3-R3-R1', 'F1-7N-FC-1B-E3-R2'), 'R5  the owner stamp is recorded, after R2\'s');
ok(RO.BUILD_STAMP_RE.test('F1-7N-FC-1B-E3-R3-R1'), 'R5a and the shared stamp validator accepts it');

// ================================================================================================================
section('MUTATIONS');
// ================================================================================================================
var NORMFN = extractFn(FCNSRC, 'normalizeMonth');
var CTXFN = extractFn(G61, 'weeklyAiPlanForecastReadContext_');

mut('N1  a missing year row hard-blocks again', function () {
  var m = swap(NORMFN, "      return { ok: true, value: 0, provenance: PROVENANCE.DEFAULT_ZERO_MISSING_YEAR, code: null, rowCount: 0, distinctCount: 0 };",
    "      return { ok: false, value: null, provenance: null, code: BLOCK.TABLE_MISSING, rowCount: 0, distinctCount: 0 };");
  return !/DEFAULT_ZERO_MISSING_YEAR, code: null/.test(m);
});
mut('N2  a timeout is defaulted to zero', function () {
  var m = swap(extractFn(FCNSRC, 'checkContext'), "    if (ctx.timedOut === true) return BLOCK.REQUEST_TIMEOUT;", '    ');
  return !/BLOCK\.REQUEST_TIMEOUT/.test(m);
});
mut('N3  conflicting rows are defaulted to zero', function () {
  var m = swap(NORMFN, "      return { ok: false, value: null, provenance: null, code: BLOCK.DUPLICATE_CONFLICTING_ROWS, rowCount: rows.length, distinctCount: keys.length };",
    "      return { ok: true, value: 0, provenance: PROVENANCE.DEFAULT_ZERO_BLANK_MONTH, code: null, rowCount: rows.length, distinctCount: keys.length };");
  return !/BLOCK\.DUPLICATE_CONFLICTING_ROWS/.test(m);
});
mut('N4  an unknown read outcome is treated as success', function () {
  var m = swap(extractFn(FCNSRC, 'checkContext'), "    if (ctx.readSucceeded !== true) return BLOCK.READ_OUTCOME_UNKNOWN;",
    "    if (ctx.readSucceeded === false) return BLOCK.READ_OUTCOME_UNKNOWN;");
  return /readSucceeded === false/.test(m) && !/readSucceeded !== true/.test(m);
});
mut('N5  a non-numeric value becomes zero', function () {
  var m = swap(NORMFN, "      if (typeof v === 'boolean' || !isFinite(n)) { invalid++; return; }", '      ');
  return !/invalid\+\+/.test(m);
});
mut('N6  a missing table becomes a plan for nothing', function () {
  var m = swap(CTXFN, "    if (!sh) return { readSucceeded: true, tableMissing: true, schemaValid: false, headers: [] };",
    "    if (!sh) return { readSucceeded: true, tableMissing: false, schemaValid: true, headers: [] };");
  return !/tableMissing: true/.test(m);
});
mut('N7  a throw while reading the table is reported as an empty table', function () {
  var m = swap(CTXFN, "    return { readSucceeded: false, readOutcomeUnknown: true, transportFailed: true, headers: [] };",
    "    return { readSucceeded: true, tableMissing: false, schemaValid: true, headers: [] };");
  return !/readOutcomeUnknown: true/.test(m);
});
mut('N8  the harvest goes back to requiring every month to be present', function () {
  var m = swap(recvFn, 'if (!win.ok) {', 'if (false) {');
  return !/if \(!win\.ok\) \{/.test(m);
});
mut('N9  Shipping and Ordering read the same absence differently', function () {
  // The divergence returns the moment the harvest stops using the shared authority.
  var m = swap(recvFn, 'KMFCN.normalizeWindow(', 'localForecastWindow(');
  return /localForecastWindow\(/.test(m) && !/KMFCN\.normalizeWindow\(/.test(m);
});
mut('N10 the migration becomes an activation prerequisite again', function () {
  var m = swap(recvFn, 'var fcCtx = weeklyAiPlanForecastReadContext_(ss);',
    'if (!rolloverCommitted_(ss)) { errors.push(weeklyAiPlanErr_("ROLLOVER_REQUIRED", "run the 2027 migration")); return { fatal: true }; }\n  var fcCtx = weeklyAiPlanForecastReadContext_(ss);');
  return /ROLLOVER_REQUIRED/.test(m);
});
mut('N11 the rollover COMMIT is wired to run automatically', function () {
  var m = swap(ROLL, 'var TEMP_FCROLL_DRY_RUN = true;', 'var TEMP_FCROLL_DRY_RUN = false;');
  return /var TEMP_FCROLL_DRY_RUN = false;/.test(m);
});
mut('N12 the AI Plan flag is opened early', function () {
  var m = swap(CFG, 'var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;',
    'var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true;');
  return /var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true;/.test(m);
});
mut('N13 the canonical gap is replaced by a re-derived one', function () {
  var m = swap(enumFn, 'cum[wc] = h.gapQty;', 'cum[wc] = recomputeGapFromForecast_(line);');
  return /recomputeGapFromForecast_/.test(m) && !/cum\[wc\] = h\.gapQty;/.test(m);
});
mut('N14 the audit counters are dropped', function () {
  var m = swap(recvFn, 'fcNorm.default_zero_missing_year += win.counters.default_zero_missing_year_count;', '    ');
  return !/default_zero_missing_year \+=/.test(m);
});
mut('N15 the normalization writes its zeros back to the database', function () {
  var m = swap(FCNSRC, '  function rowsForScope(rows, scope, sku) {',
    '  function persistZero(sheet, row) { sheet.appendRow(row); }\n  function rowsForScope(rows, scope, sku) {');
  return /appendRow/.test(ops(m));
});
mut('N16 the new engine code is left unmapped, so the refusal loses its readiness code', function () {
  var A = read('assets/js/core/supply-planning-weekly-harvest-adapter.js');
  var m = swap(A, '    FORECAST_BASIS_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,', '    ');
  return !/FORECAST_BASIS_UNRESOLVED/.test(m);
});
// RESTATED (F1-7N-FC-1B-E3-R4): the mutation swapped R3-R1's literal manifest entry, so it stopped applying
// the moment 61_ moved again and the probe threw instead of catching. The defect is unchanged — 61_ declaring
// a build its manifest does not expect — and the anchor is now derived from whatever the manifest holds.
mut('N17 61_ ships without moving its build stamp', function () {
  var m = swap(HLTH, "expected: '" + wapExpect + "', owns: 'weekly AI Plan harvest",
    "expected: 'F1-7N-FC-1B-E3-R1', owns: 'weekly AI Plan harvest");
  var e = (m.match(/\{ file: '61_api_v1_weekly_ai_plan\.gs',[^}]*expected: '([^']+)'/) || [])[1];
  return e !== wap;
});

console.log('\n----------------------------------------');
console.log('MISSING FORECAST MEANS ZERO + AI PLAN UNBLOCK (F1-7N-FC-1B-E3-R3-R1): ' + pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail) process.exitCode = 1;
