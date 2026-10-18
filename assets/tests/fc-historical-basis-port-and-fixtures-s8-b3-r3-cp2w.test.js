// S8-B3-R3-CP2W — THE TWO PENDING FC HISTORICAL MODES: PORT, FIXTURES, AND AN EXECUTABLE SPEC.
//
// Run: node assets/tests/fc-historical-basis-port-and-fixtures-s8-b3-r3-cp2w.test.js
//
// NOTHING IS IMPLEMENTED AND NOTHING IS CONNECTED. There is no new handler, no new core module, no
// BigQuery, no historical API and not one byte added to the Apps Script load surface. The source
// contract still carries MISSING_OWNER_INPUT #1 and #3, so connecting anything would be exactly the
// thing the round forbids.
//
// What this suite DOES is make the preparation checkable:
//
//   §A  the PORT refuses what it must refuse — above all a scope with no company.
//   §B  §4.2 of the contract, encoded: three ingredients or the month is refused, and the default is
//       MISSING, never 0.
//   §C  FIXTURE A ("last year, same month ACTUAL") answered by arithmetic over the fixture, compared
//       against figures DECLARED IN THE FIXTURE rather than recomputed from the same expression.
//   §D  FIXTURE B ("interval average excluding activity × growth"), same discipline.
//   §E  the fixtures agree with the FROZEN owner. The exclusion set is not re-implemented here: it is
//       taken from supply-planning-calculations.js by EXECUTING it, which is the only way to prove
//       the new modes reuse the rule instead of a copy of it that can drift.
//   §F  the two blockers, executable rather than quoted: the frozen owner cannot see last year at
//       all, and two companies on one source key make it fail closed.
//   §G  nothing is wired, and the open questions are still open.
//   §X  mutants — each wrong implementation this fixture exists to catch, caught.
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var PORT = require('./_fc-historical-source-port.js');
var FX = require('./_fc-historical-fixtures.js');
var KMCALC = require('../js/core/supply-planning-calculations.js');

var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function near(a, b, m) { ok(Math.abs(a - b) < 1e-9, m + '  (got ' + a + ', want ' + b + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }
function threw(fn, needle, m) {
  var e = null;
  try { fn(); } catch (err) { e = err; }
  ok(!!e && String(e.message).indexOf(needle) !== -1,
    m + (e ? '  (threw "' + String(e.message).slice(0, 110) + '")' : '  (DID NOT THROW)'));
}

var A = FX.FIXTURE_A, B = FX.FIXTURE_B;

// --------------------------------------------------------------------------------------------------
// The consumer side of the port, written ONCE here so every section asks the same question the same
// way. This is the executable specification the future owner must satisfy — not an implementation of
// it: it has no source, no caching, no refusal taxonomy of its own, and it lives in a test file.
// --------------------------------------------------------------------------------------------------
function readMonth(fixture, port, month) {
  var dates = PORT.enumerateMonth(month);
  var res = port.readDailySales({ scope: fixture.scope, from: dates[0], to: dates[dates.length - 1] });
  var att = res.attestation.byMonth[month];
  var mine = {};
  res.rows.forEach(function (r) {
    if (r.company !== fixture.scope.company) return;          // company isolation — never inferred
    if (Object.prototype.hasOwnProperty.call(mine, r.date)) {
      throw new Error('FC_HIST_DUPLICATE_NATURAL_KEY: ' + r.date);
    }
    mine[r.date] = r.units;
  });
  var missing = dates.filter(function (d) {
    return !Object.prototype.hasOwnProperty.call(mine, d) && PORT.absentDateVerdict(att) === 'MISSING';
  });
  if (missing.length) {
    return { refused: true, code: 'FC_HIST_MONTH_NOT_ATTESTED', missingDates: missing,
      partialSumHadWeNotRefused: Object.keys(mine).reduce(function (s, d) { return s + mine[d]; }, 0) };
  }
  return { refused: false, accountedDays: dates.length, byDate: mine,
    units: dates.reduce(function (s, d) { return s + (mine[d] || 0); }, 0) };
}

function sumOver(fixture, dates, byDate) {
  return dates.reduce(function (s, d) { return s + (byDate[d] || 0); }, 0);
}

// ==================================================================================================
section('§A  the port contract');
// ==================================================================================================
var portA = PORT.makeFixturePort({ rows: A.rows, attestation: A.attestation });

eq(PORT.REQUIRED_SCOPE, ['company', 'country', 'marketplace', 'channel', 'sku'],
  'A1  the required scope is declared, and company is one of its members');

threw(function () {
  portA.readDailySales({ scope: { country: 'US', marketplace: 'Amazon', channel: 'Amazon', sku: 'SKU-A' },
    from: '2025-11-01', to: '2025-11-30' });
}, 'scope.company is required', 'A2  a request with no company is REFUSED, not answered for one of them');

threw(function () {
  portA.readDailySales({ scope: A.scope, from: '2025-11-30', to: '2025-11-01' });
}, 'is after to', 'A3  a reversed range is refused rather than silently emptied');

var shape = portA.readDailySales({ scope: A.scope, from: '2025-11-01', to: '2025-11-02' });
eq(Object.keys(shape.rows[0]).sort(), PORT.PORT_CONTRACT.row.slice().sort(),
  'A4  a row carries exactly the fields supply-planning-calculations.js already requires');
ok(shape.attestation && shape.attestation.byMonth && shape.attestation.byMonth['2025-11'],
  'A5  the attestation is returned per MONTH, because §4.2 refuses per month');

var twoMonths = portA.readDailySales({ scope: A.scope, from: '2025-10-25', to: '2025-11-05' });
eq(Object.keys(twoMonths.attestation.byMonth).sort(), ['2025-10', '2025-11'],
  'A6  a span across two months carries BOTH verdicts — one month may be answerable and the other not');

// ==================================================================================================
section('§B  §4.2 encoded — three ingredients, or the month is refused');
// ==================================================================================================
var FULL = { completionSignal: 'PRESENT', omitZeroRule: 'OMITS_ZERO', scopeCoverage: 'COVERED' };
eq(PORT.absentDateVerdict(FULL), 'CONFIRMED_ZERO', 'B1  all three present → an absent row is a confirmed zero');
['completionSignal', 'omitZeroRule', 'scopeCoverage'].forEach(function (k, i) {
  var one = JSON.parse(JSON.stringify(FULL));
  one[k] = 'UNKNOWN';
  eq(PORT.absentDateVerdict(one), 'MISSING', 'B' + (i + 2) + '  ' + k + ' alone missing → MISSING, and the month is refused');
});
eq(PORT.absentDateVerdict(null), 'MISSING', 'B5  no attestation at all → MISSING (the documented default), never 0');
eq(PORT.absentDateVerdict({ completionSignal: 'PRESENT', omitZeroRule: 'EMITS_ZERO', scopeCoverage: 'COVERED' }),
  'MISSING', 'B6  EMITS_ZERO is NOT silently read as a confirmed zero — that branch is still MISSING_OWNER_INPUT #3');

// ==================================================================================================
section('§C  FIXTURE A — last year, same month: ACTUAL');
// ==================================================================================================
var monthA = readMonth(A, portA, A.baseMonth);
ok(!monthA.refused, 'C1  the attested month is answerable');
eq(monthA.accountedDays, A.expect.accountedDays,
  'C2  every calendar date is ACCOUNTED FOR — an enumeration of 30, not a count of rows');
eq(Object.keys(monthA.byDate).length, 28, 'C3  and 28 of those 30 are physical rows; the other two are confirmed zeros');
A.absentDates.forEach(function (d) {
  eq(monthA.byDate[d], undefined, 'C4  ' + d + ' has no row, and is counted as a zero rather than invented');
});
eq(monthA.units, A.expect.rawActualUnits, 'C5  the RAW actual matches the figure the fixture declared first');

var excludedActual = monthA.units - sumOver(A, A.eventDates, monthA.byDate);
eq(excludedActual, A.expect.activityExcludedActualUnits,
  'C6  the activity-excluded actual is the other declared figure — OPEN_A1 chooses between them, this suite does not');
ok(A.expect.rawActualUnits !== A.expect.activityExcludedActualUnits,
  'C7  the two readings DIFFER, so OPEN_A1 is a real question and not a formality');

// company isolation, measured rather than asserted
var allRowsInMonth = portA.readDailySales({ scope: A.scope, from: '2025-11-01', to: '2025-11-30' }).rows;
var otherUnits = allRowsInMonth.filter(function (r) { return r.company === FX.OTHER_COMPANY; })
  .reduce(function (s, r) { return s + r.units; }, 0);
eq(otherUnits, A.expect.otherCompanyUnitsIgnored,
  'C8  the other entity really is in the port output — isolation is doing work, not describing an empty set');
ok(allRowsInMonth.some(function (r) { return r.date === A.absentDates[0] && r.company === FX.OTHER_COMPANY; }),
  'C9  and one of its rows sits on a date KM did not trade, so a company-blind reader would turn a zero into 1,000');

var monthOct = readMonth(A, portA, '2025-10');
ok(monthOct.refused, 'C10 the month missing one ingredient is REFUSED');
eq(monthOct.code, 'FC_HIST_MONTH_NOT_ATTESTED', 'C11 and it is refused BY NAME');
eq(monthOct.partialSumHadWeNotRefused, A.expect.unattestedPartialSumIfGuardDropped,
  'C12 a partial sum was available and was NOT published — that is the whole defect §4.2 forbids');

// ==================================================================================================
section('§D  FIXTURE B — interval average excluding activity, × growth');
// ==================================================================================================
var portB = PORT.makeFixturePort({ rows: B.rows, attestation: B.attestation });
var readB = portB.readDailySales({ scope: B.scope, from: B.interval.from, to: B.interval.to });
var mineB = {};
readB.rows.forEach(function (r) { if (r.company === B.scope.company) mineB[r.date] = r.units; });

// THE EXCLUSION SET IS NOT COMPUTED HERE. It is taken from the frozen owner in §E and reused.
var frozen = KMCALC.normalizedAvgSalesPerDay({
  calcDate: '2026-09-26', scope: B.scope, weekly7d: 0,
  dailySales: B.rows.filter(function (r) { return r.company === B.scope.company; }),
  campaigns: B.campaigns, events: B.events
});
var contaminated = {};
frozen.excludedDates.forEach(function (d) { contaminated[d] = 1; });

var normalDates = Object.keys(mineB).filter(function (d) { return !contaminated[d]; }).sort();
eq(normalDates.length, B.expect.normalDayCount, 'D1  the interval has the declared number of normal days');
var normalUnits = sumOver(B, normalDates, mineB);
eq(normalUnits, B.expect.normalUnits, 'D2  and the declared normal units');
near(normalUnits / normalDates.length, B.expect.intervalAverage, 'D3  the interval average');

var allDates = Object.keys(mineB);
near(sumOver(B, allDates, mineB) / allDates.length, B.expect.averageIfExclusionDropped,
  'D4  dropping the exclusion gives a VISIBLY different number — the fixture discriminates');

near(B.expect.intervalAverage * (1 + B.growthPercent / 100), B.expect.grownRate,
  'D5  growth on the RATE is exact and is not rounded');
eq(Math.round(B.expect.intervalAverage * 30 * (1 + B.growthPercent / 100)), B.expect.grownMonthlyQty,
  'D6  growth on a derived monthly QUANTITY rounds, as the Builder already does — OPEN_B1 is the choice');

// the ladder, which the interval mode must NOT inherit
var readLong = portB.readDailySales({ scope: B.scope, from: B.longInterval.from, to: B.longInterval.to });
var mineLong = {};
readLong.rows.forEach(function (r) { if (r.company === B.scope.company) mineLong[r.date] = r.units; });
var longNormal = Object.keys(mineLong).filter(function (d) { return !contaminated[d]; });
eq(longNormal.length, B.expect.longNormalDayCount, 'D7  the long interval has 40 normal days — more than the frozen cap of 30');
eq(sumOver(B, longNormal, mineLong), B.expect.longNormalUnits, 'D8  and the declared long-interval units');
near(sumOver(B, longNormal, mineLong) / longNormal.length, B.expect.longIntervalAverage,
  'D9  the interval average uses ALL of them — no 30-day cap');
ok(Math.abs(B.expect.longIntervalAverage - B.expect.longFrozenLadderAverage) > 0.5,
  'D10 and that answer DIFFERS from the frozen ladder, so "the cap was dropped" is provable rather than unexercised');

// ==================================================================================================
section('§E  the fixtures agree with the FROZEN owner (the rule is reused, not copied)');
// ==================================================================================================
eq(frozen.excludedDates, B.contaminatedDates,
  'E1  the frozen owner excludes exactly the dates the fixture declares contaminated');
eq(frozen.excludedDates.length, 5,
  'E2  FIVE, not six — the campaign and the event overlap on 2026-09-12 and that day is excluded ONCE');
var naive = PORT.enumerateRange(B.campaigns[0].start, B.campaigns[0].end).length
  + PORT.enumerateRange(B.events[0].start, B.events[0].end).length;
eq(naive, 6, 'E3  a double-counting implementation would have said six — the overlap is a real assertion');
// The call above was handed the LONG row set, so its ladder is already capped — reusing its average
// here would have compared two different questions. The short-interval agreement needs its own call,
// over September alone, where 20 normal days never reach the cap.
var frozenShort = KMCALC.normalizedAvgSalesPerDay({
  calcDate: '2026-09-26', scope: B.scope, weekly7d: 0,
  dailySales: B.rows.filter(function (r) {
    return r.company === B.scope.company && r.date >= B.interval.from && r.date <= B.interval.to;
  }),
  campaigns: B.campaigns, events: B.events
});
eq(frozenShort.normalDayCount, B.expect.normalDayCount, 'E4  over September alone the frozen owner samples 20 normal days');
near(frozenShort.avgSalesPerDay, B.expect.intervalAverage,
  'E4b and it answers exactly the interval average — below the cap the two modes agree, so D10\'s gap IS the cap');
near(250 / 30, B.expect.longFrozenLadderAverage, 'E5  over the long one it is the capped 30-day answer');

// ==================================================================================================
section('§F  the two blockers, executed rather than quoted');
// ==================================================================================================
var cannotSeeLastYear = KMCALC.normalizedAvgSalesPerDay({
  calcDate: '2026-11-15', scope: A.scope, weekly7d: 0,
  dailySales: A.rows.filter(function (r) { return r.company === A.scope.company; }),
  campaigns: [], events: A.events
});
eq(cannotSeeLastYear.normalDayCount, 0,
  'F1  asked for 2026-11, the frozen owner sees NOTHING of 2025-11 — its window is 90 days and the Sheet prunes at 90');
eq(cannotSeeLastYear.source, 'weekly_7d',
  'F2  so it falls to the weekly rung; "last year, same month" is unreachable without a new source (D-S8-B3-62)');

threw(function () {
  KMCALC.normalizedAvgSalesPerDay({
    calcDate: '2026-09-26', scope: B.scope, weekly7d: 0,
    dailySales: B.rows,                       // KM *and* ResUS, the same site, the same source key
    campaigns: B.campaigns, events: B.events
  });
}, 'ambiguous daily-sales company resolution',
  'F3  two companies on ONE source natural key FAIL CLOSED — a company-less snapshot cannot be averaged client-side');

// ==================================================================================================
section('§G  nothing is wired, and the open questions are still open');
// ==================================================================================================
var CONTRACT = fs.readFileSync(path.join(ROOT, 'docs/planning/FC_HISTORICAL_SALES_SOURCE_CONTRACT.md'), 'utf8');
ok(CONTRACT.indexOf('MISSING_OWNER_INPUT #1') !== -1, 'G1  the entity-mapping input is still open in the contract');
ok(CONTRACT.indexOf('MISSING_OWNER_INPUT #3') !== -1, 'G2  the month-completeness input is still open in the contract');

// COMMENTS ARE STRIPPED FIRST, and the distinction is the point rather than a convenience: both files
// NAME BigQuery and `Raw Daily Sales` in prose, because explaining why nothing is connected requires
// saying what is not connected. A scan of raw bytes would fail on its own documentation and would
// pass just as happily on a file that named nothing and called everything.
function codeOnly(src) {
  return src.split('\n').map(function (l) {
    var i = l.indexOf('//');
    if (i === -1) return l;
    var before = l.slice(0, i);
    return ((before.match(/'/g) || []).length % 2 === 0) ? before : l;
  }).join('\n');
}
var SRC = codeOnly(fs.readFileSync(path.join(__dirname, '_fc-historical-source-port.js'), 'utf8'))
  + codeOnly(fs.readFileSync(path.join(__dirname, '_fc-historical-fixtures.js'), 'utf8'));
ok(/BigQuery/i.test(fs.readFileSync(path.join(__dirname, '_fc-historical-source-port.js'), 'utf8')),
  'G2b the port DOES name the source in prose — the scan below is of code, and must not be vacuous');
['bigquery', 'amazon-database-', 'UrlFetchApp', 'fetch(', 'require(\'https', 'Raw Daily Sales']
  .forEach(function (tok, i) {
    ok(SRC.toLowerCase().indexOf(tok.toLowerCase()) === -1,
      'G' + (i + 3) + '  the port and the fixtures contain no "' + tok + '" — no source is reached');
  });

function scanFor(dir, ext) {
  var hits = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      var p = path.join(d, e.name);
      if (e.isDirectory()) return walk(p);
      if (e.name.slice(-ext.length) !== ext) return;
      if (fs.readFileSync(p, 'utf8').indexOf('_fc-historical') !== -1) hits.push(p);
    });
  })(dir);
  return hits;
}
eq(scanFor(path.join(ROOT, 'assets/js'), '.js'), [], 'G9  no shipped page or core module references the port');
eq(scanFor(path.join(ROOT, 'assets/specs/active/apps-script'), '.gs'), [], 'G10 no Apps Script file references it either');

eq(FX.OPEN_QUESTIONS.map(function (q) { return q.id; }),
  ['OPEN_A1', 'OPEN_A2', 'OPEN_B1', 'OPEN_C1', 'OPEN_B2', 'OPEN_B3'],
  'G11 the questions are declared, so "prepared" is not mistaken for "decided"');
ok(FX.OPEN_QUESTIONS.every(function (q) { return q.question && q.why; }),
  'G12 and each carries the reason it cannot be answered here');
eq(FX.OPEN_QUESTIONS.filter(function (q) { return q.resolved; }).map(function (q) { return q.id; }),
  ['OPEN_B1', 'OPEN_C1'],
  'G13 a settled question is marked resolved IN PLACE rather than deleted, so the decision keeps its trail');
ok(/restore/i.test(FX.OPEN_QUESTIONS.filter(function (q) { return q.id === 'OPEN_C1'; })[0].resolved),
  'G13a and OPEN_C1 records the order it was settled on, so it is not reopened as a question');

// ==================================================================================================
section('§J  FIXTURE C — complete months, monthly restoration, month equal weight, growth (CP2X §5)');
// ==================================================================================================
var C = FX.FIXTURE_C;
var portC = PORT.makeFixturePort({ rows: C.rows, attestation: C.attestation });

// The exclusion set comes from the frozen owner here too — the same rule, executed, not restated.
var frozenC = KMCALC.normalizedAvgSalesPerDay({
  calcDate: '2026-10-01', scope: C.scope, weekly7d: 0,
  dailySales: C.rows.filter(function (r) { return r.company === C.scope.company; }),
  campaigns: C.campaigns, events: C.events
});
var hotC = {};
frozenC.excludedDates.forEach(function (d) { hotC[d] = 1; });
eq(frozenC.excludedDates.length, 11, 'J1  the eleven July activity days are excluded by the frozen rule');

var perMonth = {};
C.months.forEach(function (m) {
  var got = readMonth(C, portC, m);
  ok(!got.refused, 'J2  ' + m + ' is a COMPLETE month and is answerable');
  eq(got.accountedDays, C.expect.daysInMonth[m], 'J3  ' + m + ' accounts for every calendar date');
  var normal = Object.keys(got.byDate).filter(function (d) { return !hotC[d]; });
  var units = normal.reduce(function (sum, d) { return sum + got.byDate[d]; }, 0);
  perMonth[m] = { days: normal.length, units: units, rate: units / normal.length };
  eq(perMonth[m].days, C.expect.normalDays[m], 'J4  ' + m + ' normal days');
  eq(perMonth[m].units, C.expect.normalUnits[m], 'J5  ' + m + ' normal units');
  near(perMonth[m].rate, C.expect.monthRate[m], 'J6  ' + m + ' rate');
  near(perMonth[m].rate * C.expect.daysInMonth[m], C.expect.monthRestoredQty[m],
    'J7  ' + m + ' restored to a month quantity over its OWN length');
});

var pooledUnits = C.months.reduce(function (s, m) { return s + perMonth[m].units; }, 0);
var pooledDays = C.months.reduce(function (s, m) { return s + perMonth[m].days; }, 0);
near(pooledUnits / pooledDays, C.expect.pooledDailyAverage,
  'J8  pooling the days gives the answer month-equal-weight exists to reject');

var ewRate = C.months.reduce(function (s, m) { return s + perMonth[m].rate; }, 0) / C.months.length;
near(ewRate, C.expect.monthEqualWeightRate, 'J9  MONTH EQUAL WEIGHT — every month counts once, whatever its length');
ok(Math.abs(ewRate - C.expect.pooledDailyAverage) > 0.5,
  'J10 and it DIFFERS from the pooled answer, so the rule is exercised rather than merely satisfied');

var ewQty = C.months.reduce(function (s, m) { return s + perMonth[m].rate * C.expect.daysInMonth[m]; }, 0) / C.months.length;
near(ewQty, C.expect.monthEqualWeightRestoredQty, 'J11 each month restored over its own length, then equal-weighted');
// THE RULE, in the order CP2X-R1 fixes it: restore -> equal-weight -> growth.
eq(Math.round(ewQty * (1 + C.growthPercent / 100)), C.expect.grownMonthlyQty,
  'J12 and growth applied LAST gives the expected monthly quantity');
// THE COUNTER-EXAMPLE, computed the other way round and asserted to be WRONG rather than alternative.
eq(Math.round(ewRate * C.expect.targetMonthDays * (1 + C.growthPercent / 100)), C.expect.wrongOrderGrownQty,
  'J13 equal-weighting the RATES first and restoring afterwards lands on the counter-example');
ok(C.expect.grownMonthlyQty !== C.expect.wrongOrderGrownQty,
  'J14 the two orders differ on this fixture, so J12 discriminates instead of merely being satisfiable');

var cAll = portC.readDailySales({ scope: C.scope, from: '2026-08-01', to: '2026-08-31' }).rows;
eq(cAll.filter(function (r) { return r.company === FX.OTHER_COMPANY; })
  .reduce(function (s, r) { return s + r.units; }, 0), 2000,
  'J15 the other entity is present in August and contributes nothing — isolation is doing work here too');

// ==================================================================================================
section('§X  mutants');
// ==================================================================================================
function mutant(id, what, fn) { ok(fn(), 'X  MUTANT CAUGHT — ' + id + ' ' + what); }

mutant('X1', 'the activity exclusion is dropped and the interval average absorbs the campaign days', function () {
  var all = Object.keys(mineB);
  return sumOver(B, all, mineB) / all.length !== B.expect.intervalAverage;
});
mutant('X2', 'company isolation is dropped and the other entity is summed into the month', function () {
  var blind = allRowsInMonth.reduce(function (s, r) { return s + r.units; }, 0);
  return blind !== A.expect.rawActualUnits && blind === A.expect.rawActualUnits + A.expect.otherCompanyUnitsIgnored;
});
mutant('X3', 'an unattested absent date is treated as a zero and the month publishes a partial sum', function () {
  var att = { completionSignal: 'PRESENT', omitZeroRule: 'OMITS_ZERO', scopeCoverage: 'UNKNOWN' };
  return PORT.absentDateVerdict(att) !== 'CONFIRMED_ZERO' && monthOct.refused === true;
});
mutant('X4', 'the interval mode inherits the frozen 30-day cap', function () {
  return Math.abs(B.expect.longFrozenLadderAverage - B.expect.longIntervalAverage) > 0.5;
});
mutant('X5', 'the campaign/event overlap is counted twice', function () {
  return naive === 6 && frozen.excludedDates.length === 5;
});
mutant('X9', 'the composition order is inverted - rates equal-weighted first, restored afterwards', function () {
  return C.expect.wrongOrderGrownQty !== C.expect.grownMonthlyQty;
});
mutant('X7', 'month equal weight is replaced by pooling every day', function () {
  return Math.abs(C.expect.monthEqualWeightRate - C.expect.pooledDailyAverage) > 0.5;
});
mutant('X8', 'a month is restored over the TARGET month length instead of its own', function () {
  return C.expect.monthRestoredQty['2026-07'] !== C.expect.monthRate['2026-07'] * C.expect.targetMonthDays;
});
mutant('X6', 'a scope without company is accepted and answered for whichever entity happens to be first', function () {
  var e = null;
  try { PORT.assertScope({ country: 'US', marketplace: 'Amazon', channel: 'Amazon', sku: 'SKU-A' }); } catch (err) { e = err; }
  return !!e;
});

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exitCode = 1;
