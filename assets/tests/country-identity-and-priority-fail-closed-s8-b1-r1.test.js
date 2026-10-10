// =============================================================================================================
// S8-B1-R1 — CANONICAL COUNTRY IDENTITY + MISSING-PRIORITY FAIL-CLOSED
// -------------------------------------------------------------------------------------------------------------
// The acceptance for two USER-APPROVED decisions. Both close a hole that the R49 rounds measured and recorded
// but were not authorized to repair; §45.C.1 required a named round for each, and this is it.
//
//   D-S8-A1  Country identity resolves through the canonical KMCID owner in the two core producers, applied to
//            BOTH operands. UK ≡ GB; case and whitespace fold; EU stays an independent region and is NEVER
//            expanded into its members; no alias is invented; stored and displayed values are never rewritten;
//            a canonical identity COLLISION is reported rather than settled by arrival order.
//
//   D-S8-B1  KMMSA refuses an unresolved receiver priority with blocked('RECEIVER_PRIORITY_UNRESOLVED') before
//            any allocation, instead of defaulting it to 0. Supersedes D-F1-4B-FM5-R2A in that ONE respect.
//            Explicit 0 stays a VALID lowest priority with its §24.7 share.
//
// WHY THE TWO TRAVEL TOGETHER. They are one defect seen from two ends. A producer that compared country as a
// raw string missed a row the consumers matched; the miss presented as "no priority"; and the missing→0
// fabrication then turned that miss into a real priority nobody had set. Fixing either alone leaves the other
// able to produce the same wrong allocation — repair the lookup and a genuinely absent priority still becomes 0;
// repair the fabrication and a UK/GB spelling mismatch still refuses a receiver that should have resolved.
//
// WHAT THIS SUITE MUST NOT BECOME. It asserts the two decisions and the numbers that must NOT move. It does not
// re-prove §40: the allocator is untouched this round, so the parity assertions here exist to catch a change in
// it, not to restate its contract. Golden #7-#11/#19 remain the owners of the allocation mathematics.
'use strict';

var path = require('path');
var CORE = path.join(__dirname, '..', 'js', 'core');
var MSA = require(path.join(CORE, 'supply-planning-marketplace-supply-allocation.js'));
var PROJ = require(path.join(CORE, 'supply-planning-source-projection.js'));
var CID = require(path.join(CORE, 'supply-planning-country-identity.js'));
var fs = require('fs');

var pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + label); } }
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

// -------------------------------------------------------------------------------------------------------------
// DRIVERS
// -------------------------------------------------------------------------------------------------------------

// The canonical producer fixture, deliberately the SAME shape R49-G drives, so the two suites are measuring one
// runtime and not two differently-built ones. `country` parameterizes the SCOPE: every row that is not under
// test is pinned to US, so a country assertion can only be answered by the identity resolution under test.
function canonical(mktRows, country) {
  country = country || 'US';
  return {
    recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40',
    businessScope: { company: 'KM', country: country, marketplace: 'Amazon', source_page: 'replen', sku: 'CO1100-R' },
    forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    sourceSnapshots: {
      skuDetails: [{ sku: 'CO1100-R', units_per_carton: 12 }],
      marketplaceSkus: [{ marketplace_sku_id: 'M1', sku: 'CO1100-R', company: 'KM', country: country,
        marketplace: 'Amazon', site_sku: 'ST-1', fulfillment_model: 'self_fulfilled' }],
      warehouses: [{ warehouse_id: 'WH-3PL', company: 'KM', country: country, warehouse_type: '3PL', is_active: true }],
      marketplaces: mktRows,
      fcRegularForecast: [{ forecast_id: 'F1', year: 2026, company: 'KM', country: country, marketplace: 'Amazon',
        sku: 'CO1100-R', sep: 100 }],
      overseasInventorySnapshot: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-R', site_sku: 'ST-1',
        wh_available_stock: 100, snapshot_date: '2026-08-01' }]
    },
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50,
      demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }]
  };
}
function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// The priority a receiver resolves to through the core producer, given a set of `marketplaces` rows.
function projPriority(mktRows, scopeCountry) {
  var p = PROJ.projectRecommendationProductionSources(canonical(mktRows, scopeCountry));
  var row = null;
  Object.keys(p).forEach(function (k) {
    if (!row && Array.isArray(p[k]) && p[k].length && p[k][0] && hasOwn(p[k][0], 'allocation_priority')) row = p[k][0];
  });
  if (!row) throw new Error('FAIL-CLOSED: no receiver row produced');
  return row.allocation_priority;
}

// A two-receiver allocation, so the allocator actually distributes rather than taking the single-receiver path.
// `priority` is applied to the FIRST receiver; the second always carries a valid 5.
function kmmsa(priority, opts) {
  opts = opts || {};
  return MSA.allocateMarketplaceReceiverSupply({
    company: 'KM', masterSku: 'CO1100-R',
    overseasPools: [{ poolKey: 'P1', poolType: 'THREE_PL', warehouseId: 'WH-3PL', effectiveSupplyQty: opts.supply === undefined ? 60 : opts.supply }],
    receivers: [
      { company: 'KM', country: opts.country || 'US', marketplace: 'Amazon', sku: 'CO1100-R',
        demandQty: 50, allocationPriority: priority, requiredByDate: '2026-11-01' },
      { company: 'KM', country: 'US', marketplace: 'EBay', sku: 'CO1100-R',
        demandQty: 50, allocationPriority: 5, requiredByDate: '2026-11-01' }
    ]
  });
}
function allocatedFor(res, marketplace) {
  var keys = Object.keys(res.byReceiver || {});
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('||' + marketplace + '||') !== -1) return res.byReceiver[keys[i]].allocatedOverseasQty;
  }
  return null;
}

// =============================================================================================================
section('A. D-S8-A1 — canonical country identity in the core producer');

// 1. UK/GB canonical equivalence — the pair the alias exists for. The scope spells it UK (as `marketplaces`
//    does); the row spells it GB (as amazon_inventory_snapshot does). Before this round these were two keys.
eq(projPriority([{ company: 'KM', country: 'GB', marketplace: 'Amazon', allocation_priority: 77 }],
   'UK'), 77,
   'A1 a GB row answers a UK-scoped receiver (UK ≡ GB)');
eq(projPriority([{ company: 'KM', country: 'UK', marketplace: 'Amazon', allocation_priority: 78 }],
   'GB'), 78,
   'A2 and the reverse — canonicalization is applied to BOTH operands, not one');

// 2. Case and whitespace. These are the everyday forms a hand-edited sheet produces.
eq(projPriority([{ company: 'KM', country: 'us', marketplace: 'Amazon', allocation_priority: 41 }]), 41,
   'A3 a lower-case country row resolves');
eq(projPriority([{ company: 'KM', country: '  US  ', marketplace: 'Amazon', allocation_priority: 42 }]), 42,
   'A4 a padded country row resolves');

// 3. EU stays an INDEPENDENT region. KMCID owns a second function (`sourceCountriesForScope`) that DOES expand
//    EU into IT/DE/ES/FR for SALES source membership; using it for identity would merge four distinct markets
//    into one receiver. The producer must not reach for it, and these two assertions are what would catch it.
eq(projPriority([{ company: 'KM', country: 'DE', marketplace: 'Amazon', allocation_priority: 55 }],
   'EU'), undefined,
   'A5 an EU-scoped receiver does NOT inherit a DE row — EU is never expanded into its members');
eq(projPriority([{ company: 'KM', country: 'EU', marketplace: 'Amazon', allocation_priority: 56 }],
   'EU'), 56,
   'A6 and an EU row answers an EU receiver — EU is an identity in its own right');

// 4. No invented aliases. "USA" is not an alias of "US" in any authority this system carries.
eq(projPriority([{ company: 'KM', country: 'USA', marketplace: 'Amazon', allocation_priority: 44 }]), undefined,
   'A7 an unsupported spelling still MISSES rather than being guessed into a match');

// =============================================================================================================
section('B. D-S8-A1 — canonical identity collision is detected, never resolved by arrival order');

// Canonicalization CREATES this case: a UK row and a GB row that were two keys are now one. If the map simply
// assigned, the answer would depend on which row the reader happened to see last — the S8-R49-F defect exactly.
var COLLIDE = [
  { company: 'KM', country: 'UK', marketplace: 'Amazon', allocation_priority: 10 },
  { company: 'KM', country: 'GB', marketplace: 'Amazon', allocation_priority: 20 }
];
eq(projPriority(COLLIDE, 'UK'), undefined,
   'B1 two rows on one canonical identity with DIFFERENT priorities yield MISSING, not an arbitrary winner');
eq(projPriority(COLLIDE.slice().reverse(), 'UK'), undefined,
   'B2 and reversing the row order gives the SAME answer — the defect was order-dependence, so order is the test');
// Agreement is not a conflict: two spellings of one market with the same priority is the ordinary case.
eq(projPriority([
  { company: 'KM', country: 'UK', marketplace: 'Amazon', allocation_priority: 30 },
  { company: 'KM', country: 'GB', marketplace: 'Amazon', allocation_priority: 30 }
], 'UK'), 30,
   'B3 two spellings AGREEING on a priority still resolve — only a disagreement is a conflict');
eq(projPriority([
  { company: 'KM', country: 'UK', marketplace: 'Amazon', allocation_priority: 30 },
  { company: 'KM', country: 'GB', marketplace: 'Amazon', allocation_priority: '30' }
], 'UK'), 30,
   'B3a and 30 vs "30" is agreement, not a dispute — the comparison is on the value, not its type');

// =============================================================================================================
section('C. Company and country isolation survive canonicalization');

var KM_US = { company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 10 };
var RESUS_US = { company: 'ResUS', country: 'US', marketplace: 'Amazon', allocation_priority: 20 };
var KM_CA = { company: 'KM', country: 'CA', marketplace: 'Amazon', allocation_priority: 30 };

// 5/6/7 — the three isolation axes. Production carries all three today: ResUS/US/Amazon=100 against
// KM/US/Amazon=50, and KM/CA/Amazon=100 against KM/US/Amazon=50.
eq(projPriority([KM_US, KM_CA]), 10, 'C1 same company, different country — the US receiver keeps the US value');
eq(projPriority([KM_US, RESUS_US]), 10, 'C2 same country, different company — KM does not inherit ResUS');
eq(projPriority([RESUS_US], 'US'), undefined,
   'C3 same marketplace NAME, different company — a name match alone resolves nothing');
eq(projPriority([KM_CA], 'US'), undefined,
   'C4 and a country-only mismatch resolves nothing either');

// =============================================================================================================
section('D. D-S8-B1 — the KMMSA priority matrix');

// 8/9 — the two VALID forms. Explicit 0 is the one that most needs stating: it is not "unknown", it is the
// lowest priority, and §40 still serves it a share through max(priority, 1).
ok(kmmsa(7).blocked === false, 'D1 a positive priority allocates');
ok(kmmsa(0).blocked === false, 'D2 an explicit 0 is VALID and allocates — 0 is the lowest priority, not "unset"');

// 10-14 — every unresolved form, refused through the SAME code.
[['missing', undefined], ['null', null], ['blank', ''], ['negative', -1],
 ['non-numeric', 'high'], ['non-finite', Infinity], ['NaN', NaN]].forEach(function (c, i) {
  var r = kmmsa(c[1]);
  ok(r.blocked === true && r.issues[0].code === 'RECEIVER_PRIORITY_UNRESOLVED',
     'D3.' + (i + 1) + ' a ' + c[0] + ' priority is REFUSED with RECEIVER_PRIORITY_UNRESOLVED');
});

// The refusal must be actionable: an operator has to know WHICH row to fix.
var msg = kmmsa(null).issues[0].message || '';
ok(msg.indexOf('KM') !== -1 && msg.indexOf('US') !== -1 && msg.indexOf('Amazon') !== -1 && msg.indexOf('CO1100-R') !== -1,
   'D4 the refusal names company / country / marketplace / sku, so the row to repair is identified');

// All-or-nothing. A blocked result must not carry a half-finished allocation that a caller could mistake for one.
var blockedRes = kmmsa(null);
eq(Object.keys(blockedRes.byReceiver || {}).length, 0, 'D5 a blocked result allocates NOTHING — no partial output');
eq(blockedRes.overseas, null, 'D5a and carries no allocator result at all');
eq(blockedRes.ready, false, 'D5b and is never reported ready');

// The SECOND receiver is valid. The refusal is for the whole call, not a quiet drop of the bad one — a partial
// allocation the operator never approved is precisely what 45.A.5 class C exists to prevent.
ok(kmmsa(null).blocked === true, 'D6 one unresolved receiver refuses the WHOLE call, not just its own line');

// =============================================================================================================
section('E. Valid-input parity — the numbers that must NOT move');

// 15 — producer → adapter → allocator, end to end, with valid input. 60 units of supply against two receivers
// demanding 50 each: a genuine shortage, so the allocator's weighting actually decides the split.
var base = kmmsa(5);
ok(base.blocked === false, 'E1 the baseline two-receiver shortage allocates');
var a = allocatedFor(base, 'Amazon'), b = allocatedFor(base, 'EBay');
eq(a + b, 60, 'E2 conservation — every available unit is allocated and none invented');
eq(a, b, 'E3 equal demand and equal priority split evenly (30/30)');

// Priority 0 keeps a REAL share, which is the whole reason 0 may not stand in for "missing". A receiver that is
// ranked last still competes; if 0 meant "excluded", substituting it for a missing value would have been a
// quietly DIFFERENT kind of wrong, and the §45 refusal would be unnecessary.
var zero = kmmsa(0);
var z0 = allocatedFor(zero, 'Amazon'), z5 = allocatedFor(zero, 'EBay');
eq(z0 + z5, 60, 'E4 priority 0 still conserves the pool');
ok(z0 > 0, 'E5 and a 0-priority receiver still RECEIVES — ranked last is never excluded');

// D-FM5-R2A-1 IS UNCHANGED, and this is the assertion that proves it rather than asserting it in prose.
// Under the MONTHLY protection mapping the adapter defaults survivalNeedQty to 0 (18-day survival is a WEEKLY
// concept) and demandWeight to demandQty, so the monthly split is driven by DEMAND WEIGHT and priority acts as
// an ordering input, not a scaler. Two receivers with equal demand therefore split 30/30 whatever their
// priorities are — measured, not assumed. If a future edit let priority scale the monthly share, or let
// survivalNeedQty default to anything but 0, these three numbers would move and this assertion would fail.
eq(z0, 30, 'E6 the monthly split is demandWeight-driven: equal demand splits evenly even at priority 0');
eq(allocatedFor(kmmsa(99), 'Amazon'), 30,
   'E6a and a far higher priority does NOT enlarge the monthly share — D-FM5-R2A-1 is untouched');
eq(allocatedFor(kmmsa(5), 'Amazon'), 30,
   'E6b nor does an equal priority change it — the three cases agree, so priority is not a monthly scaler');

// 17/18/19/20 — the frozen contracts this round must not have disturbed, asserted on the adapter's own source
// so a future edit that quietly changes them is caught here and not only in Golden.
var MSA_SRC = fs.readFileSync(path.join(CORE, 'supply-planning-marketplace-supply-allocation.js'), 'utf8');
ok(/survivalNeedQty: \(qty\(r\.survivalNeedQty\) === null \? 0 : qty\(r\.survivalNeedQty\)\)/.test(MSA_SRC),
   'E7 D-FM5-R2A-1 monthly protection mapping is unchanged (survivalNeedQty defaults 0 — 18-day survival is weekly)');
ok(/demandWeight: \(qty\(r\.demandWeight\) === null \? d : qty\(r\.demandWeight\)\)/.test(MSA_SRC),
   'E8 and demandWeight still defaults to demandQty — the proportional split is untouched');
ok(/CROSS_COMPANY_POOL_FORBIDDEN/.test(MSA_SRC),
   'E9 D-FM5-R2A-3 company isolation is unchanged');
ok(!/function allocate(Overseas|Factory)[A-Za-z]*\s*\(/.test(MSA_SRC),
   'E10 the adapter still owns NO allocation arithmetic of its own — §40 remains the only allocator');

// The §40 module itself must be byte-untouched by this round: it is explicitly do-not-touch, and every number
// above depends on it. Asserting the symbols are still exported is the cheap, non-circular form of that check.
var ALLOC = require(path.join(CORE, 'supply-planning-allocations.js'));
ok(typeof ALLOC.allocateOverseasSharedPool === 'function' && typeof ALLOC.allocateFactoryDeterministic === 'function',
   'E11 both frozen §40 allocators are present and exported');

// =============================================================================================================
section('F. KMCID is used, not re-implemented');

eq(CID.canonicalCountryCode('uk'), 'GB', 'F1 KMCID still canonicalizes UK → GB');
eq(CID.canonicalCountryCode(' us '), 'US', 'F2 and folds case and whitespace');
eq(CID.canonicalCountryCode('EU'), 'EU', 'F3 and leaves EU as itself');
var PROJ_SRC = fs.readFileSync(path.join(CORE, 'supply-planning-source-projection.js'), 'utf8');
var ASM_SRC = fs.readFileSync(path.join(CORE, 'supply-planning-production-assembly.js'), 'utf8');
ok(/supply-planning-country-identity\.js/.test(PROJ_SRC) && /supply-planning-country-identity\.js/.test(ASM_SRC),
   'F4 both producers take KMCID as a dependency rather than restating the alias table');
ok(!/['"]GB['"]\s*[:,]/.test(PROJ_SRC) && !/['"]GB['"]\s*[:,]/.test(ASM_SRC),
   'F5 and neither producer hard-codes a UK/GB alias of its own — a second table would drift from the first');

// =============================================================================================================
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('\n----------------------------------------');
console.log('COUNTRY IDENTITY + PRIORITY FAIL-CLOSED (S8-B1-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
