// S8-B3-R3-CP2W — FIXTURES FOR THE TWO PENDING FC HISTORICAL MODES.
//
// One fixture per pending mode, each built so that the WRONG implementation produces a VISIBLY
// different number rather than a slightly different one. Every quantity below was chosen for that:
// the activity days carry 100 against the normal days' 10, and the other company's rows carry 1000,
// so "the exclusion was dropped" and "company isolation was dropped" cannot hide in rounding.
//
// NO SOURCE IS CONNECTED. These are literals. The source contract still carries MISSING_OWNER_INPUT
// #1 (raw row → selling entity) and #3 (per-date completion signal + omit-zero rule + coverage
// evidence), and no BigQuery or historical API may be reached until they are answered.
'use strict';

var PORT = require('./_fc-historical-source-port.js');

var SCOPE = {
  company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'Amazon',
  sku: 'SKU-A', marketplaceSkuId: 'MSKU-A-US', marketplaceId: 'MP-US-AMZ'
};

// The SAME site, the SAME master SKU, a DIFFERENT selling entity. US/Amazon is operated by both KM
// and ResUS, which is the whole reason `company` is a required scope field and cannot be inferred.
var OTHER_COMPANY = 'ResUS';

function row(date, units, company) {
  return { date: date, sku: SCOPE.sku, units: units, company: company || SCOPE.company,
    country: SCOPE.country, marketplace: SCOPE.marketplace, channel: SCOPE.channel };
}
function rowsFor(dates, units, company) {
  return dates.map(function (d) { return row(d, units, company); });
}
function exclude(all, drop) {
  var gone = {}; drop.forEach(function (d) { gone[d] = 1; });
  return all.filter(function (d) { return !gone[d]; });
}

// ==================================================================================================
// FIXTURE A — "LAST YEAR, SAME MONTH: ACTUAL"
//
// Target 2026-11, so the base period is 2025-11. Thirty calendar days, of which TWO carry no row at
// all. Under a full attestation those two are CONFIRMED ZEROS and the month is answerable; strip any
// one of the three ingredients and the same two dates are MISSING and the month must be REFUSED.
// That pair of dates is the entire point of the fixture.
//
// The month also contains a two-day special event, because whether an ACTUAL excludes activity days
// is NOT decided (see OPEN_A1). Both figures are declared so that whichever the Owner chooses, the
// implementation is measured against a number that was written down first.
// ==================================================================================================
var A_MONTH = '2025-11';
var A_ALL_DATES = PORT.enumerateMonth(A_MONTH);                 // 30 dates
var A_ABSENT = ['2025-11-05', '2025-11-06'];                    // no row, either zero or missing
var A_EVENT_DATES = ['2025-11-28', '2025-11-29'];               // special event, 50 units each
var A_PLAIN_DATES = exclude(exclude(A_ALL_DATES, A_ABSENT), A_EVENT_DATES);   // 26 dates, 10 each

var FIXTURE_A = {
  label: 'last-year-same-month-actual',
  targetMonth: '2026-11',
  baseMonth: A_MONTH,
  scope: SCOPE,
  allDates: A_ALL_DATES,
  absentDates: A_ABSENT,
  eventDates: A_EVENT_DATES,
  rows: []
    .concat(rowsFor(A_PLAIN_DATES, 10))
    .concat(rowsFor(A_EVENT_DATES, 50))
    // The other entity, on this site, on dates where KM also traded AND on one date where it did not
    // (2025-11-05 is one of KM's absent dates). A company-blind consumer would both inflate the month
    // and turn a confirmed zero into 1,000 units.
    .concat(rowsFor(['2025-11-01', '2025-11-02', '2025-11-03', '2025-11-04', '2025-11-05'], 1000, OTHER_COMPANY)),
  events: [
    { status: 'active', sku: SCOPE.sku, marketplaceId: SCOPE.marketplaceId,
      start: A_EVENT_DATES[0], end: A_EVENT_DATES[1] }
  ],
  campaigns: [],
  attestation: {
    '2025-11': { completionSignal: 'PRESENT', omitZeroRule: 'OMITS_ZERO', scopeCoverage: 'COVERED' },
    // One ingredient short, and it is the one §4.2 says was missing from the first draft: nothing
    // states that this SKU was inside that date's reporting coverage.
    '2025-10': { completionSignal: 'PRESENT', omitZeroRule: 'OMITS_ZERO', scopeCoverage: 'UNKNOWN' }
  },
  // ---- the declared answers -------------------------------------------------------------------
  expect: {
    accountedDays: 30,                 // 28 rows + 2 confirmed zeros — an ENUMERATION, not a count
    rawActualUnits: 360,               // 26×10 + 2×50 + 2×0
    activityExcludedActualUnits: 260,  // the same month with the two event days removed
    otherCompanyUnitsIgnored: 5000,    // what a company-blind reader would have added
    refusedWhenUnattested: '2025-10'
  }
};

// A SECOND, DELIBERATELY UNANSWERABLE MONTH. 2025-10 carries rows for 20 of its 31 dates. A partial
// sum over those 20 is exactly the failure mode §4.2 forbids — it looks like an answer.
var A_OCT_DATES = PORT.enumerateMonth('2025-10').slice(0, 20);
FIXTURE_A.rows = FIXTURE_A.rows.concat(rowsFor(A_OCT_DATES, 10));
FIXTURE_A.expect.unattestedPartialSumIfGuardDropped = 200;

// ==================================================================================================
// FIXTURE B — "INTERVAL AVERAGE EXCLUDING ACTIVITY, TIMES A GROWTH RATE"
//
// 2026-09-01..2026-09-25. A campaign and an event OVERLAP on 2026-09-12, so the contaminated set is a
// DEDUPLICATED five dates and not six — the overlap is the assertion, not the decoration.
//
// A LONG variant reaches back to 2026-08-12 (45 days, 40 of them normal) for one specific purpose:
// the frozen owner caps its sample at the latest 30 normal days, and the contract states the interval
// mode must NOT inherit that ladder. Over the long interval the two answers DIVERGE, which is the
// only way to prove the cap was actually dropped rather than merely unexercised.
// ==================================================================================================
var B_FROM = '2026-09-01', B_TO = '2026-09-25';
var B_ALL = PORT.enumerateRange(B_FROM, B_TO);                  // 25 dates
var B_CAMPAIGN = { start: '2026-09-10', end: '2026-09-12' };
var B_EVENT = { start: '2026-09-12', end: '2026-09-14' };       // overlaps the campaign on the 12th
var B_CONTAMINATED = PORT.enumerateRange('2026-09-10', '2026-09-14');   // 5 dates, deduplicated
var B_ZERO_DATE = '2026-09-01';                                 // a CONFIRMED zero, with a real row
var B_HIGH_DATE = '2026-09-02';                                 // 20 units, so the mean is not uniform
var B_NORMAL_TENS = exclude(B_ALL, B_CONTAMINATED.concat([B_ZERO_DATE, B_HIGH_DATE]));   // 18 dates

var B_LONG_FROM = '2026-08-12';
var B_AUG = PORT.enumerateRange(B_LONG_FROM, '2026-08-31');     // 20 dates, 5 units each

var FIXTURE_B = {
  label: 'interval-average-excluding-activity-with-growth',
  scope: SCOPE,
  interval: { from: B_FROM, to: B_TO },
  longInterval: { from: B_LONG_FROM, to: B_TO },
  contaminatedDates: B_CONTAMINATED,
  growthPercent: 10,
  rows: []
    .concat([row(B_ZERO_DATE, 0), row(B_HIGH_DATE, 20)])
    .concat(rowsFor(B_NORMAL_TENS, 10))
    .concat(rowsFor(B_CONTAMINATED, 100))
    .concat(rowsFor(B_AUG, 5))
    .concat(rowsFor(['2026-09-03', '2026-09-04', '2026-09-05'], 1000, OTHER_COMPANY)),
  campaigns: [
    { status: 'active', start: B_CAMPAIGN.start, end: B_CAMPAIGN.end,
      skuLines: [{ marketplaceSkuId: SCOPE.marketplaceSkuId, sku: SCOPE.sku }] }
  ],
  events: [
    { status: 'active', sku: SCOPE.sku, marketplaceId: SCOPE.marketplaceId,
      start: B_EVENT.start, end: B_EVENT.end }
  ],
  attestation: {
    '2026-08': { completionSignal: 'PRESENT', omitZeroRule: 'OMITS_ZERO', scopeCoverage: 'COVERED' },
    '2026-09': { completionSignal: 'PRESENT', omitZeroRule: 'OMITS_ZERO', scopeCoverage: 'COVERED' }
  },
  expect: {
    normalDayCount: 20,                  // 25 − 5 contaminated
    normalUnits: 200,                    // 0 + 20 + 18×10
    intervalAverage: 10,                 // 200 / 20
    averageIfExclusionDropped: 28,       // 700 / 25 — the number the rule exists to prevent
    grownRate: 11,                       // 10 × (1 + 10%)
    grownMonthlyQty: 330,                // Math.round(10 × 30 × 1.1) — the OTHER reading, see OPEN_B1
    longNormalDayCount: 40,              // 20 August + 20 September
    longNormalUnits: 300,                // 20×5 + 200
    longIntervalAverage: 7.5,            // 300 / 40 — NO 30-day cap
    longFrozenLadderAverage: 250 / 30    // what the frozen owner answers over the same days
  }
};

// ==================================================================================================
// WHAT IS STILL OPEN. Each is a question only the Owner can close; none is answered here, and the
// fixtures carry the data for BOTH branches so that answering one does not require new data.
// ==================================================================================================
var OPEN_QUESTIONS = [
  { id: 'OPEN_A1', mode: 'last-year-same-month',
    question: 'Does the ACTUAL exclude campaign/event days, or is it the raw month as traded?',
    why: 'An "actual" that removes the biggest selling days of the month is not what the word usually '
       + 'means, but the regular-forecast basis it feeds is an activity-free baseline everywhere else. '
       + 'The fixture declares both figures (360 raw / 260 excluded) and chooses neither.' },
  { id: 'OPEN_A2', mode: 'last-year-same-month',
    question: 'What is published when the base month is REFUSED — no value, or the current behaviour?',
    why: 'D-S8-B3-61: the control labelled "Apply Growth Rate" is internally named `actual` and today '
       + 'reads the existing fc_regular_forecast row. A refused month must not silently fall back to '
       + 'that row under a label the operator will read as sales.' },
  { id: 'OPEN_B1', mode: 'interval-average',
    question: 'Does the growth rate multiply the DAILY RATE or a derived MONTHLY QUANTITY?',
    why: 'The Builder already rounds a quantity (Math.round(base × (1 + g/100))). A rate must not be '
       + 'rounded the same way. 11/day and 330/month are the two readings; they are not interchangeable.' },
  { id: 'OPEN_B2', mode: 'interval-average',
    question: 'Is there a minimum normal-day count below which the interval is refused?',
    why: 'The frozen owner has a ladder (<7 warns, <3 falls back to weekly_7d) and the contract says the '
       + 'interval mode inherits NEITHER rung. That leaves "two normal days" with no stated answer.' },
  { id: 'OPEN_B3', mode: 'both',
    question: 'Is the contaminated-date set clipped to the REQUESTED interval or to a fixed window?',
    why: 'The frozen owner clips exclusions to its own 90-day window (_addRangeWithinWindow). An '
       + 'interval mode reusing that machinery must clip to the interval instead, or an event that '
       + 'straddles the first day of the range would be half-counted.' }
];

module.exports = {
  SCOPE: SCOPE,
  OTHER_COMPANY: OTHER_COMPANY,
  FIXTURE_A: FIXTURE_A,
  FIXTURE_B: FIXTURE_B,
  OPEN_QUESTIONS: OPEN_QUESTIONS
};
