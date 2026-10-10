// =============================================================================================================
// S8-R49-G · G3 — WHAT THE SYSTEM ACTUALLY DOES WITH A MISSING, ZERO OR INVALID allocation_priority
// -------------------------------------------------------------------------------------------------------------
// READ THIS BEFORE READING A GREEN RESULT. This suite is CLEAN because it records CURRENT BEHAVIOUR, **not**
// because the candidate contract is met. Several layers collapse "missing" into 0 today, and every assertion
// that does so is tagged DEVIATION and counted in the summary. A deviation count above zero means the contract
// is NOT implemented; it does not mean this suite failed.
//
// THE CANDIDATE CONTRACT under verification (R49-G §2, not yet authorized for implementation):
//   · priority 0 is a valid numeric priority
//   · missing / null / blank is NOT priority 0
//   · a missing priority is never silently fabricated
//   · allocation operations that need an unresolved priority fail closed
//   · non-allocation marketplace reads stay available
//   · the company + country + marketplace identity (R49-F) is unchanged
//
// WHY A GREEN SUITE RATHER THAN A RED ONE. R49-G authorizes no production change, so a red suite would sit in
// the registry with no path to green and would corrupt the measured baseline — the thing R49-E went to some
// trouble to avoid. Recording the real behaviour, tagged, is the honest alternative: when a later round changes
// a layer, the DEVIATION assertion for that layer fails and must be re-tagged CONTRACT. The suite is the
// before-picture that the implementation rounds will be measured against.
//
// NO PRODUCTION FILE IS MODIFIED OR REQUIRED TO CHANGE BY THIS ROUND.
// =============================================================================================================
'use strict';
var fs = require('fs');
var path = require('path');

var SP = require(path.join(__dirname, '../js/core/supply-planning-source-projection.js'));
var KMMSA = require(path.join(__dirname, '../js/core/supply-planning-marketplace-supply-allocation.js'));
var KMALLOC = require(path.join(__dirname, '../js/core/supply-planning-allocations.js'));

var pass = 0, fail = 0;
var deviations = [];
function j(v) { return JSON.stringify(v); }
function section(t) { console.log('\n== ' + t + ' =='); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// `tag` is 'CONTRACT' when the observed behaviour already matches the candidate contract, 'DEVIATION' when it
// does not. Both are asserted against what the code does TODAY, so both are green; only the tag differs.
function obs(actual, expectedNow, label, tag) {
  if (j(actual) !== j(expectedNow)) {
    fail++;
    console.log('FAIL ' + label + '\n      RECORDED ' + j(expectedNow) + '\n      ACTUAL   ' + j(actual)
      + '\n      (behaviour changed since R49-G characterized it — re-tag this assertion)');
    return;
  }
  pass++;
  if (tag === 'DEVIATION') deviations.push(label);
}

// =============================================================================================================
section('L1 TRANSPORT — operation-system-db-api.js normalizeMarketplaceRecord');
// Browser page script: no module.exports, so the pure normalizer is read out of the SHIPPED bytes and executed.

// R49H_DBAPI_OVERRIDE lets the mutant harness substitute a mutated COPY; absent it this is the shipped file.
var DBAPI = fs.readFileSync(process.env.R49H_DBAPI_OVERRIDE
  || path.join(__dirname, '../js/api/operation-system-db-api.js'), 'utf8');
function extractShipped(src, name) {
  var sig = 'function ' + name + '(';
  var i = src.indexOf(sig);
  if (i < 0) throw new Error('FAIL-CLOSED: shipped function not found: ' + name);
  var jx = src.indexOf('{', i), d = 0;
  for (; jx < src.length; jx++) {
    var c = src[jx];
    if (c === '{') { d++; } else if (c === '}') { d--; if (d === 0) return src.slice(i, jx + 1); }
  }
  throw new Error('FAIL-CLOSED: unbalanced braces in ' + name);
}
var normalizeMarketplaceRecord = new Function(
  extractShipped(DBAPI, 'normalizeMarketplaceRecord') + '; return normalizeMarketplaceRecord;')();
function t(raw) { return normalizeMarketplaceRecord(raw).allocationPriority; }

var BASE = { company: 'KM', country: 'US', marketplace: 'Amazon' };
function row(extra) { var o = {}; Object.keys(BASE).forEach(function (k) { o[k] = BASE[k]; });
  Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }

// S8-R49-H REPAIRED THIS LAYER. G3-G8 were DEVIATION in R49-G and are CONTRACT now; the layers below are
// untouched and keep their original tags. Re-tagging here reflects an authorized repair at THIS layer only.
obs(t(row({ allocation_priority: 10 })), 10, 'G1 case 7 -- a POSITIVE priority passes through as 10', 'CONTRACT');
obs(t(row({ allocation_priority: 0 })), 0, 'G2 case 1 -- an explicit 0 survives as 0', 'CONTRACT');
obs(t(row({})), null, 'G3 case 2 -- a MISSING column is now null, distinguishable from an explicit 0', 'CONTRACT');
obs(t(row({ allocation_priority: '' })), null, 'G4 case 3 -- a BLANK string is null', 'CONTRACT');
obs(t(row({ allocation_priority: null })), null, 'G5 case 4 -- null stays null', 'CONTRACT');
obs(t(row({ allocation_priority: undefined })), null, 'G6 case 5 -- undefined is null', 'CONTRACT');
obs(t(row({ allocation_priority: 'high' })), null,
    'G7 case 6 -- INVALID text is null, never a fabricated number', 'CONTRACT');
// Negative is PRESERVED here by design (R49-H H1): §40 refuses it with a RangeError naming
// allocationPriority (G34), and that refusal is the one that should be seen. Nulling or clamping it here would
// hide a bad row instead of surfacing it. The layers that still pass a negative onward WITHOUT any downstream
// refusal (G16, G27) remain tagged DEVIATION.
obs(t(row({ allocation_priority: -5 })), -5,
    'G8 case 8 -- a NEGATIVE value is PRESERVED for §40 to refuse, not silently corrected here', 'CONTRACT');
obs(t(row({ allocation_priority: '7' })), 7, 'G9 a numeric STRING is parsed to 7', 'CONTRACT');
// parseFloat was prefix-tolerant and turned malformed cells into confident wrong numbers.
obs(t(row({ allocation_priority: '7abc' })), null,
    'G9b a prefix-numeric string is REFUSED (parseFloat would have read 7)', 'CONTRACT');
obs(t(row({ allocation_priority: '1,000' })), null,
    'G9c a comma-formatted value is REFUSED (parseFloat would have read 1, not 1000)', 'CONTRACT');
obs(t(row({ allocation_priority: ' 3 ' })), 3, 'G9d surrounding whitespace is trimmed, matching the DB owner', 'CONTRACT');
// A WHITESPACE-ONLY cell is the case that actually needs the explicit trim: Number() trims on its own, so
// without it String('   ') is not '' and Number('   ') would be 0 -- an empty cell silently ranked lowest.
obs(t(row({ allocation_priority: '   ' })), null,
    'G9e a WHITESPACE-ONLY cell is null, not 0', 'CONTRACT');
obs(t(row({ allocation_priority: '	' })), null, 'G9f and a tab-only cell likewise', 'CONTRACT');

// The non-allocation fields must keep working regardless — a marketplace LIST is not an allocation.
(function () {
  var n = normalizeMarketplaceRecord(row({ marketplace_display_name: 'KM Amazon', status: 'active',
    currency: 'USD', marketplace_id: 'MKT-KM-US-AMAZON', fulfillment_model: 'self_fulfilled',
    marketplace_alias: 'amz' }));
  obs([n.company, n.country, n.marketplace, n.marketplaceDisplayName, n.status, n.currency,
       n.marketplaceId, n.fulfillmentModel, n.marketplaceAlias],
      ['KM', 'US', 'Amazon', 'KM Amazon', 'active', 'USD', 'MKT-KM-US-AMAZON', 'self_fulfilled', 'amz'],
      'G10 case 12 — the ordinary marketplace listing fields are unaffected by any of this', 'CONTRACT');
})();

// =============================================================================================================
section('L2 CORE PRODUCER — supply-planning-source-projection.js (post R49-F)');

var KM_US = { company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 10 };
var RESUS_US = { company: 'ResUS', country: 'US', marketplace: 'Amazon', allocation_priority: 20 };
var KM_CA = { company: 'KM', country: 'CA', marketplace: 'Amazon', allocation_priority: 30 };

function canonical(mktRows) {
  return {
    recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40',
    businessScope: { company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'replen', sku: 'CO1100-R' },
    forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    sourceSnapshots: {
      skuDetails: [{ sku: 'CO1100-R', units_per_carton: 12 }],
      marketplaceSkus: [{ marketplace_sku_id: 'M1', sku: 'CO1100-R', company: 'KM', country: 'US',
        marketplace: 'Amazon', site_sku: 'ST-1', fulfillment_model: 'self_fulfilled' }],
      warehouses: [{ warehouse_id: 'WH-3PL', company: 'KM', country: 'US', warehouse_type: '3PL', is_active: true }],
      marketplaces: mktRows,
      fcRegularForecast: [{ forecast_id: 'F1', year: 2026, company: 'KM', country: 'US', marketplace: 'Amazon',
        sku: 'CO1100-R', sep: 100 }],
      overseasInventorySnapshot: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-R', site_sku: 'ST-1',
        wh_available_stock: 100, snapshot_date: '2026-08-01' }]
    },
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50,
      demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }]
  };
}
function projPriority(mktRows) {
  var p = SP.projectRecommendationProductionSources(canonical(mktRows));
  var row2 = null;
  Object.keys(p).forEach(function (k) {
    if (!row2 && Array.isArray(p[k]) && p[k].length && p[k][0] && has(p[k][0], 'allocation_priority')) row2 = p[k][0];
  });
  if (!row2) throw new Error('FAIL-CLOSED: no receiver row produced');
  return row2.allocation_priority;
}

obs(projPriority([KM_US]), 10, 'G11 case 7 — a positive priority resolves to 10', 'CONTRACT');
obs(projPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 0 }]), 0,
    'G12 case 1 — an explicit 0 is preserved as 0', 'CONTRACT');
obs(projPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon' }]), undefined,
    'G13 case 2 — a MISSING column stays MISSING (undefined), never fabricated as 0', 'CONTRACT');
obs(projPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: '' }]), '',
    'G14 case 3 — a BLANK string is carried through VERBATIM as empty string, not normalized and not refused '
    + 'at this layer', 'DEVIATION');
obs(projPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 'high' }]), 'high',
    'G15 case 6 — INVALID text is carried through verbatim; this producer validates nothing', 'DEVIATION');
obs(projPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: -5 }]), -5,
    'G16 case 8 — a NEGATIVE value is carried through verbatim here', 'DEVIATION');
obs(projPriority([KM_US, RESUS_US]), 10,
    'G17 case 9 — SAME marketplace name, different COMPANY: KM keeps its own 10 (R49-F)', 'CONTRACT');
obs(projPriority([KM_US, KM_CA]), 10,
    'G18 case 10 — SAME marketplace name, different COUNTRY: the US receiver keeps 10 (R49-F)', 'CONTRACT');
obs(projPriority([{ marketplace: 'Amazon', allocation_priority: 99 }]), undefined,
    'G19 case 11 — a row with NO company/country has no canonical identity and is not matched; the receiver '
    + 'gets MISSING rather than that row\'s 99', 'CONTRACT');
obs(projPriority([RESUS_US]), undefined,
    'G20 no matching marketplace record at all → MISSING, never another company\'s value', 'CONTRACT');

// COUNTRY ALIASING — the core producer compares raw strings; the .gs layer canonicalizes. Same data, two answers.
obs(projPriority([{ company: 'KM', country: 'USA', marketplace: 'Amazon', allocation_priority: 44 }]), undefined,
    'G21 the core producer does NOT canonicalize country: a row recorded as "USA" does not match a "US" '
    + 'receiver. 43_/71_/KMMSA canonicalize via KMCID, so the same row can resolve there and not here.', 'DEVIATION');

// =============================================================================================================
section('L3 ALLOCATION ADAPTER — KMMSA (frozen model-b DTO adapter)');

function kmmsa(priority) {
  var r = KMMSA.allocateMarketplaceReceiverSupply({
    company: 'KM', masterSku: 'CO1100-R',
    overseasPools: [{ poolKey: 'P1', poolType: 'THREE_PL', warehouseId: 'WH-3PL', effectiveSupplyQty: 50 }],
    factoryPools: [], eligibleFactoryWarehouseIds: [],
    receivers: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', demandQty: 100,
      allocationPriority: priority, requiredByDate: '2026-09-01' }]
  });
  return { ready: r.ready === true, blocked: r.blocked === true,
    issues: (r.issues || []).map(function (i) { return i.code; }) };
}
obs(kmmsa(10), { ready: true, blocked: false, issues: [] }, 'G22 a positive priority allocates normally', 'CONTRACT');
obs(kmmsa(0), { ready: true, blocked: false, issues: [] }, 'G23 case 1 — an explicit 0 is accepted and allocates', 'CONTRACT');
obs(kmmsa(null), { ready: true, blocked: false, issues: [] },
    'G24 case 4 — a NULL priority is silently defaulted to 0 and the allocation PROCEEDS. §40 would have '
    + 'refused it; the adapter supplies the value that prevents the refusal.', 'DEVIATION');
obs(kmmsa(undefined), { ready: true, blocked: false, issues: [] },
    'G25 case 5 — undefined is likewise defaulted to 0 and proceeds', 'DEVIATION');
obs(kmmsa('high'), { ready: true, blocked: false, issues: [] },
    'G26 case 6 — INVALID text is also defaulted to 0 and proceeds', 'DEVIATION');
obs(kmmsa(-5), { ready: true, blocked: false, issues: [] },
    'G27 case 8 — a NEGATIVE priority is accepted here (qty() returns it, so the 0-default never fires) and '
    + 'the allocation proceeds', 'DEVIATION');

// =============================================================================================================
section('L4/L5 FAIL-CLOSED LAYERS — §40 allocator and the facts validators');

// The driver returns the error NAME **and** whether the message names allocationPriority. Asserting the type
// alone would let an unrelated missing field masquerade as a priority refusal -- the first draft of this
// suite did exactly that, and a 'TypeError' that actually meant 'input.company is missing' would have been
// recorded as proof of a fail-closed priority gate.
function alloc(priority) {
  try {
    KMALLOC.allocateOverseasSharedPool({
      company: 'KM', country: 'US', masterSku: 'CO1100-R',
      supplyPools: [{ poolKey: 'P1', poolType: 'THREE_PL', warehouseId: 'WH-3PL', effectiveSupplyQty: 50 }],
      receivers: [{ receiverKey: 'R1', demandKey: 'D1', marketplace: 'Amazon', destinationWarehouseId: 'WH-3PL',
        fulfillmentModel: 'self_fulfilled', demandQty: 100, survivalNeedQty: 50,
        allocationPriority: priority, demandWeight: 1, eligiblePoolTypes: ['THREE_PL'] }]
    });
    return 'ALLOCATED';
  } catch (e) {
    var msg = String((e && e.message) || '');
    return String(e && e.name) + (msg.indexOf('allocationPriority') !== -1 ? ':allocationPriority' : ':OTHER(' + msg.slice(0, 60) + ')');
  }
}
obs(alloc(10), 'ALLOCATED', 'G28 §40 allocates with a positive priority', 'CONTRACT');
obs(alloc(0), 'ALLOCATED', 'G29 case 1 -- §40 accepts an explicit 0 as a valid priority', 'CONTRACT');
obs(alloc(null), 'TypeError:allocationPriority',
    'G30 case 4 -- §40 REFUSES a null priority, naming allocationPriority (fail-closed)', 'CONTRACT');
obs(alloc(undefined), 'TypeError:allocationPriority', 'G31 case 5 -- §40 refuses undefined', 'CONTRACT');
obs(alloc('high'), 'TypeError:allocationPriority', 'G32 case 6 -- §40 refuses invalid text', 'CONTRACT');
obs(alloc(''), 'TypeError:allocationPriority', 'G33 case 3 -- §40 refuses a blank string', 'CONTRACT');
obs(alloc(-5), 'RangeError:allocationPriority',
    'G34 case 8 -- §40 refuses a NEGATIVE priority outright. Negative is INVALID, not "lowest" -- the '
    + 'canonical rule, and the reason G8/G16/G27 are tagged as deviations.', 'CONTRACT');

// §24.7: a 0 priority still receives a weighted share. 0 means LOWEST, never 'gets nothing'.
(function () {
  var r = KMALLOC.allocateOverseasSharedPool({
    company: 'KM', country: 'US', masterSku: 'CO1100-R',
    supplyPools: [{ poolKey: 'P1', poolType: 'THREE_PL', warehouseId: 'WH-3PL', effectiveSupplyQty: 10 }],
    receivers: [
      { receiverKey: 'R0', demandKey: 'D0', marketplace: 'A', destinationWarehouseId: 'WH-3PL',
        fulfillmentModel: 'self_fulfilled', demandQty: 100, survivalNeedQty: 100, allocationPriority: 0,
        demandWeight: 1, eligiblePoolTypes: ['THREE_PL'] },
      { receiverKey: 'R9', demandKey: 'D9', marketplace: 'B', destinationWarehouseId: 'WH-3PL',
        fulfillmentModel: 'self_fulfilled', demandQty: 100, survivalNeedQty: 100, allocationPriority: 9,
        demandWeight: 1, eligiblePoolTypes: ['THREE_PL'] }]
  });
  // The allocator returns allocations[] keyed by demandKey, not a byReceiver map. Summing is the only honest
  // read; the first draft of this assertion guessed a byReceiver shape and recorded 'false' for a receiver
  // that had in fact been served.
  function allocatedFor(demandKey) {
    return (r.allocations || []).filter(function (a) { return a.demandKey === demandKey; })
      .reduce(function (n, a) { return n + Number(a.allocatedQty || 0); }, 0);
  }
  obs(r.allocationMode, 'SHORTAGE_ALLOCATION', 'G35 the fixture really is a shortage (10 supply vs 200 demand), '
      + 'so the §24.7 weighted path is the one being characterized', 'CONTRACT');
  obs(allocatedFor('D0') > 0, true,
      'G35b a receiver at priority 0 still receives a NON-ZERO weighted share under shortage '
      + '(§24.7 clamps the weight at max(priority,1)) -- 0 is the LOWEST priority, not an exclusion', 'CONTRACT');
  obs(allocatedFor('D9') >= allocatedFor('D0'), true,
      'G35c and the priority-9 receiver is served at least as well -- ordering still honours priority', 'CONTRACT');
  obs(allocatedFor('D0') + allocatedFor('D9'), 10,
      'G35d and the whole pool is conserved across both receivers', 'CONTRACT');
})();

// =============================================================================================================
section('L6 IDENTITY — who still keys priority by marketplace NAME alone');
// R49-F repaired the two bundled core producers. The .gs layer was outside that authorization, so it is
// characterized here rather than changed.

// R49I_OVERRIDE_<nn> lets the mutant harness substitute a mutated COPY of one .gs file; absent it these are
// the shipped files.
function gs(rel) {
  var ov = process.env['R49I_OVERRIDE_' + rel.split('_')[0]];
  return fs.readFileSync(ov || path.join(__dirname, '../specs/active/apps-script/' + rel), 'utf8');
}
var G43 = gs('43_api_v1_gap_materialization.gs');
var G61 = gs('61_api_v1_weekly_ai_plan.gs');
var G71 = gs('71_api_v1_factory_stock_guard.gs');

obs(/priorityByMkt\[key\] = ap/.test(G43)
    && /var key = gapStr_\(m\.company\) \+ '\|\|' \+ gapCanonCountry_\(m\.country\) \+ '\|\|' \+ gapStr_\(m\.marketplace\)/.test(G43),
    true, 'G36 43_ gap-materialization keys priority by the COMPOSITE identity (company||country||marketplace)', 'CONTRACT');
obs(/priorityByReceiver\[fsgStr_\(m\.company\) \+ '\|\|' \+ canon \+ '\|\|' \+ fsgStr_\(m\.marketplace\)\] = ap/.test(G71),
    true, 'G37 71_ factory-stock-guard also keys by the composite identity', 'CONTRACT');
// S8-R49-I REPAIRED THIS LAYER. G38 was DEVIATION in R49-G and is CONTRACT now.
obs(/prByMktKey\[weeklyAiPlanMktKey_\(r\.company, r\.country, r\.marketplace\)\] = r\.allocation_priority/.test(G61)
    && /prByMktKey\[weeklyAiPlanMktKey_\(scope\.company, scope\.country, marketplace\)\]/.test(G61),
    true, 'G38 61_ weekly-AI-plan now BUILDS AND LOOKS UP its priority map by the composite identity', 'CONTRACT');
obs(/prByMkt\[/.test(G61), false,
    'G38b and no name-only priority index or lookup remains in 61_', 'CONTRACT');

obs(/var ap = fsgNum_\(m\.allocation_priority\); if \(ap === null\) return;/.test(G71), true,
    'G39 71_ omits a missing priority from the map, so the guard STOPs with PRIORITY_UNRESOLVED — fail-closed', 'CONTRACT');
obs(/if \(ap !== null\) priorityByMkt\[key\] = ap;/.test(G43), true,
    'G40 43_ also omits a missing priority from its map …', 'CONTRACT');
obs(/allocationPriority: \(poolFacts\.priorityByMkt\[pkey\] != null \? poolFacts\.priorityByMkt\[pkey\] : 0\)/.test(G43),
    true, 'G41 … but then substitutes 0 at the point of use, so the omission never reaches a refusal', 'DEVIATION');

// =============================================================================================================
// =============================================================================================================
section('L7 61_ WEEKLY AI PLAN -- the repaired identity, EXECUTED (S8-R49-I)');
// The assertions above prove the composite key is WRITTEN. These execute it, and they execute the SHIPPED
// producer and consumer rather than a replay of them: an earlier draft re-implemented both in the test and
// three mutants walked straight through, because mutating 61_ cannot affect a copy living here. A mirror
// proves the mirror. Both fragments are sliced out of the shipped file and evaluated.
(function () {
  var api = new Function(extractShipped(G61, 'weeklyAiPlanStr_') + String.fromCharCode(10)
    + extractShipped(G61, 'weeklyAiPlanMktKey_')
    + '; return { key: weeklyAiPlanMktKey_, str: weeklyAiPlanStr_ };')();
  var K = api.key;
  var prodStart = G61.indexOf('var prByMktKey = {};');
  if (prodStart < 0) throw new Error('FAIL-CLOSED: 61_ priority map producer not found');
  var prodEnd = G61.indexOf('});', prodStart);
  if (prodEnd < 0) throw new Error('FAIL-CLOSED: 61_ producer end not found');
  var PRODUCER_SRC = G61.slice(prodStart, prodEnd + 3);
  var consAt = G61.indexOf('allocationPriority: prByMktKey');
  if (consAt < 0) consAt = G61.indexOf('allocationPriority: (prByMktKey');
  if (consAt < 0) throw new Error('FAIL-CLOSED: 61_ priority consumer not found');
  var consLineEnd = G61.indexOf(String.fromCharCode(10), consAt);
  // .trim() first: the file is CRLF, so the slice ends with a carriage return and a regex anchored at $
  // never saw the trailing comma.
  var CONSUMER_SRC = G61.slice(consAt + 'allocationPriority: '.length, consLineEnd).trim();
  if (CONSUMER_SRC.charAt(CONSUMER_SRC.length - 1) === ',') CONSUMER_SRC = CONSUMER_SRC.slice(0, -1);
  var resolveShipped = new Function('mkts', 'scope', 'marketplace', 'weeklyAiPlanStr_', 'weeklyAiPlanMktKey_',
    PRODUCER_SRC + '; return (' + CONSUMER_SRC + ');');
  function resolve(rows, sc) { return resolveShipped(rows, sc, sc.marketplace, api.str, K); }
  var SC = { company: 'KM', country: 'US', marketplace: 'Amazon' };
  var A = { company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 10 };
  var B = { company: 'ResUS', country: 'US', marketplace: 'Amazon', allocation_priority: 20 };
  var C = { company: 'KM', country: 'CA', marketplace: 'Amazon', allocation_priority: 30 };
  obs(resolve([A], SC), 10, 'G42 a unique-name row still resolves to its own 10', 'CONTRACT');
  obs(resolve([A, B], SC), 10, 'G43 SAME name, different COMPANY: the KM site keeps 10, never ResUS 20', 'CONTRACT');
  obs([resolve([A, B], SC), resolve([B, A], SC)], [10, 10], 'G44 ROW ORDER does not decide', 'CONTRACT');
  obs(resolve([A, C], SC), 10, 'G45 SAME name, different COUNTRY: the US site never takes the CA row 30', 'CONTRACT');
  obs([resolve([A, C], SC), resolve([C, A], SC)], [10, 10], 'G46 country isolation holds in both orders', 'CONTRACT');
  obs(resolve([B], SC), undefined, 'G47 only another company row present -> MISSING, never a substitute', 'CONTRACT');
  obs(resolve([{ company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 0 }], SC), 0,
      'G48 PRIORITY 0 is preserved as 0', 'CONTRACT');
  obs(resolve([{ company: 'KM', country: 'US', marketplace: 'Amazon' }], SC), undefined,
      'G49 a MISSING priority column stays missing, never fabricated', 'CONTRACT');
  var P1 = { company: 'A', country: 'B|C', marketplace: 'Amazon', allocation_priority: 11 };
  var P2 = { company: 'A', country: 'B', marketplace: 'C|Amazon', allocation_priority: 22 };
  obs([resolve([P1, P2], { company: 'A', country: 'B|C', marketplace: 'Amazon' }),
       resolve([P1, P2], { company: 'A', country: 'B', marketplace: 'C|Amazon' })], [11, 22],
      'G50 the composite key is INJECTIVE -- a separator in the data cannot forge a collision', 'CONTRACT');
  obs(K('KM', 'US', 'Amazon'), K(' KM ', ' US ', ' Amazon '), 'G51 surrounding whitespace is trimmed', 'CONTRACT');
  obs(K('KM', 'US', 'Amazon') === K('km', 'us', 'amazon'), false,
      'G52 and case is NOT folded -- 03_ treats Amazon and amazon as different rows, so merging them here '
      + 'would trade one collision for another', 'CONTRACT');
})();

// =============================================================================================================
section('L8 DEPLOYMENT MANIFEST CONSISTENCY (S8-R49-I)');
// 63_ pins an expected stamp per module owner. A rotated module stamp whose manifest entry was not updated is
// the exact shape that produced a mixed deployment before, so the two are asserted against each other here.
// Scoped to the owners THIS round rotated; 90_ is recorded separately because its expected value is a content
// hash owned by a different round.
(function () {
  var G63 = gs('63_api_v1_system_health.gs');
  function declared(src, symbol) {
    var m = new RegExp('var ' + symbol + " = '([^']*)'").exec(src);
    if (!m) throw new Error('FAIL-CLOSED: declaration not found: ' + symbol);
    return m[1];
  }
  function expected(file, symbol) {
    var m = new RegExp("\{ file: '" + file + "', symbol: '" + symbol + "', expected: '([^']*)'").exec(G63);
    if (!m) throw new Error('FAIL-CLOSED: manifest entry not found: ' + file);
    return m[1];
  }
  var wapDecl = declared(G61, 'WAP_BUILD_VERSION_');
  obs(expected('61_api_v1_weekly_ai_plan.gs', 'WAP_BUILD_VERSION_'), wapDecl,
      'G53 61_ declares the stamp its manifest entry expects -- a rotation without a manifest update is the '
      + 'mixed deployment this gate exists to catch', 'CONTRACT');
  var sysDecl = declared(G63, 'SYS_BUILD_VERSION_');
  obs(expected('63_api_v1_system_health.gs', 'SYS_BUILD_VERSION_'), sysDecl,
      'G54 63_ likewise declares the stamp its own manifest entry expects', 'CONTRACT');
  // S8-R49-L: this pinned R46 to record that R49-I and R49-J were rotations rather than cuts, which was
  // true of those rounds and is no longer true of this tree -- R49-L cut the release they had run ahead of.
  // The claim worth keeping is the one that was always underneath it: a release may move FORWARD and may
  // never move back, and the R46 Production acceptance still names R46 rather than being re-dated by a
  // later cut. An equality on R46 would now assert that no release may ever be cut again.
  var R = require(path.join(__dirname, '_release-order.js'));
  obs(R.stampAtOrAfter(declared(G63, 'SYS_DEPLOYMENT_RELEASE_'), 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R46'), true,
      'G55 SYS_DEPLOYMENT_RELEASE_ is at or after R46 -- a cut may move it forward, never back, and the R46 '
      + 'Production acceptance baseline still refers to the id it was written against', 'CONTRACT');
  // S8-R49-J: this asked whether WAP is at or after SYS, which held only because R49-I happened to leave
  // both owners on R47. They are INDEPENDENT owners - 61_ did not change in R49-J and correctly keeps R47
  // while 63_ moved to R48 - so an ordering between them was never the property worth asserting. What matters
  // is that each stamp is ANSWERABLE: stampAtOrAfter compares indexes and returns false for an unappended
  // stamp, so a stamp missing from the ledger is indistinguishable from an old one.
  obs([wapDecl, sysDecl].map(function (st) { return R.OWNER_STAMPS.indexOf(st) !== -1; }), [true, true],
      'G56 both rotated stamps are KNOWN ledger entries', 'CONTRACT');
  // 90_ is identified by CONTENT HASH and its expected value belongs to R49-F, not to this round.
  var bundleDecl = declared(gs('90_generated_supply_planning_bundle.gs'), 'KM_BUNDLE_CONTENT_HASH_');
  obs(expected('90_generated_supply_planning_bundle.gs', 'KM_BUNDLE_CONTENT_HASH_'), bundleDecl,
      'G57 the 90_ bundle hash in the manifest MATCHES the bundle that is on disk -- S8-R49-J repaired the row '
      + 'R49-F left at the pre-rebuild value. The bundle itself was NOT touched: the builder --check proves the '
      + 'declaration reproduces from the module sources.', 'CONTRACT');
  // G58 - CLOSED BY S8-R49-L. This recorded 63_ carrying a module stamp AHEAD of the release it declared
  // (R48 vs R46), the divergence R49-I introduced and R49-J widened because neither round was authorized to
  // move the release. R49-L cut R49 and the two now agree. The assertion is KEPT rather than deleted: it is
  // the shape the deployment-uniformity suite checks from the other side (H8), and a later rotation without
  // a cut would reopen it here, which is exactly where a reader of this file would look.
  obs(declared(G63, 'SYS_BUILD_VERSION_'), declared(G63, 'SYS_DEPLOYMENT_RELEASE_'),
      'G58 63_ declares the SAME id as its own module stamp and as the release -- a cut makes those two '
      + 'agree, and a rotation without a cut is what made them disagree', 'CONTRACT');
})();

var total = pass + fail;
console.log('\n----------------------------------------');
console.log('CANDIDATE CONTRACT DEVIATIONS: ' + deviations.length + ' of ' + total + ' characterized behaviours');
deviations.forEach(function (d) { console.log('  · ' + d.split(' — ')[0]); });
console.log('');
console.log('THIS SUITE IS CLEAN BECAUSE IT RECORDS CURRENT BEHAVIOUR, NOT BECAUSE THE CONTRACT IS MET.');
console.log('Deviations above are OPEN defects awaiting the R49-G implementation decision.');
if (total === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('MARKETPLACE PRIORITY NULL/ZERO CHARACTERIZATION (S8-R49-G): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
