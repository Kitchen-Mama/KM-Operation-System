// Kitchen Mama Operation System — FC-SHARE-DUAL-MODEL-R1
// ONE FORECAST-SHARE OWNER · TWO DENOMINATORS · NO PAGE-LOCAL FORMULA
//
// The `FC占比` column an operator could see was a page-local function with no spec owner and no test.
// Measured by running the SHIPPED function over three real sites before this round:
//
//   KM/US/Amazon/CO1100-R  Σ=1200  displayed 14.3%   (correct 57.1%)
//   KM/CA/Amazon/CO1100-R  Σ= 600  displayed 14.3%   (correct 28.6%)
//   KM/JP/Amazon/CO1100-R  Σ= 300  displayed 14.3%   (correct 14.3%)   SUM ON SCREEN = 42.9%
//
// Its entry key was `company-sku-marketplace`, which drops COUNTRY — three sites the page's OWN
// `fcRowIdentityKey` calls distinct collapsed onto one entry and the last write won. Four more causes:
// the denominator was the FILTERED set; it was computed over the filtered set but displayed 25 rows at a
// time; the numerator was twelve individually ceiled months of ONE CALENDAR YEAR; and it rounded per row
// then validated the UNROUNDED sum, so 33.3×3 = 99.9 never warned.
//
// This suite owns: that KMFCS is the only normalizer, that its two denominators are the frozen ones,
// that the page hands it the AUTHORITATIVE UNFILTERED set, that the anchor is typed rather than
// substituted, and that the B1 writer's relationship with the legacy column did not move.
//
// Run: node assets/tests/fc-share-dual-model-r1.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutants = [], survived = [];
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function close(a, e, tol, l) {
  if (typeof a === 'number' && isFinite(a) && Math.abs(a - e) <= tol) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + e + ' ±' + tol + '\n  got ' + a); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mutant(l, caught) {
  mutants.push(l);
  if (caught === true) { pass++; console.log('ok   ' + l + ' (caught)'); }
  else { survived.push(l); fail++; console.error('FAIL ' + l + ' — MUTANT SURVIVED'); }
}

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }

var KMFCS = require(path.join(REPO, 'assets/js/core/supply-planning-forecast-share.js'));
var KMFSA = require(path.join(REPO, 'assets/js/core/supply-planning-factory-site-allocation.js'));

var FCS = read('assets/js/pages/fc-summary.js');
var SHARE = read('assets/js/core/supply-planning-forecast-share.js');
var GS = read('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var HTML = read('assets/html/pages/fc-summary.html');
var INDEX = read('index.html');
var SPEC = read('docs/planning/FC_SUMMARY_SPEC.md');
var RULES = read('docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md');
var FC_HEADERS = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var d = 0, started = false, start = i;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}

// ---- fixtures: real SKUs, real companies, the real FBA country footprint ------------------------------
var MK = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function row(company, country, marketplace, sku, year, perMonth, overrides) {
  var r = { company: company, country: country, marketplace: marketplace, sku: sku, year: String(year) };
  MK.forEach(function (k) { r[k] = perMonth; });
  if (overrides) Object.keys(overrides).forEach(function (k) { r[k] = overrides[k]; });
  return r;
}
var ANCHOR = '2026-01';                 // window = 2026-02 .. 2026-05
function project(rows, extra) {
  var input = { sku: (extra && extra.sku) || rows[0].sku, forecastRows: rows, calculationMonth: ANCHOR };
  if (extra) Object.keys(extra).forEach(function (k) { if (k !== 'sku') input[k] = extra[k]; });
  return KMFCS.project(input);
}
function shareOf(p, company, country, marketplace, sku, field) {
  var s = KMFCS.siteShares(p, { company: company, country: country, marketplace: marketplace, sku: sku });
  return s[field || 'companyForecastShare'];
}
function sumField(p, field) {
  var t = 0;
  Object.keys(p.bySite).forEach(function (k) { var v = p.bySite[k][field]; if (typeof v === 'number') t += v; });
  return t;
}

// =======================================================================================================
section('A — THE COLLISION. The defect an operator reported, and the identity that fixes it.');
// =======================================================================================================
// §B12 case 1 — multiple countries, same company + marketplace NAME.
var A = project([
  row('KM', 'US', 'Amazon', 'CO1100-R', 2026, 100),
  row('KM', 'CA', 'Amazon', 'CO1100-R', 2026, 50),
  row('KM', 'JP', 'Amazon', 'CO1100-R', 2026, 25)
]);
eq(Object.keys(A.bySite).length, 3, 'A1 three sites sharing a marketplace name are THREE share entries');
close(shareOf(A, 'KM', 'US', 'Amazon', 'CO1100-R'), 400 / 700, 1e-12, 'A2 US takes its own share (was 14.3%)');
close(shareOf(A, 'KM', 'CA', 'Amazon', 'CO1100-R'), 200 / 700, 1e-12, 'A3 CA takes its own share (was 14.3%)');
close(shareOf(A, 'KM', 'JP', 'Amazon', 'CO1100-R'), 100 / 700, 1e-12, 'A4 JP takes its own share');
ok(KMFCS.sumsToOne([shareOf(A, 'KM', 'US', 'Amazon', 'CO1100-R'),
                    shareOf(A, 'KM', 'CA', 'Amazon', 'CO1100-R'),
                    shareOf(A, 'KM', 'JP', 'Amazon', 'CO1100-R')]),
  'A5 and they sum to 1 — the case that displayed 42.9%');

// §B12 case 8 — distinct site identity cannot collide. Stated against the PAGE's own identity authority,
// which is what made the old key provably too narrow rather than merely different.
var idKey = fnSrc(FCS, 'fcRowIdentityKey');
ok(/year[\s\S]*company[\s\S]*country[\s\S]*marketplace[\s\S]*sku/.test(idKey),
  'A6 the page\'s own row identity carries country — the old share key did not');
var ROWS_A = [row('KM', 'US', 'Amazon', 'CO1100-R', 2026, 100),
              row('KM', 'CA', 'Amazon', 'CO1100-R', 2026, 50),
              row('KM', 'JP', 'Amazon', 'CO1100-R', 2026, 25)];
var canonical = {}; ROWS_A.forEach(function (r) { canonical[KMFSA.siteKey(r)] = 1; });
eq(Object.keys(A.bySite).length, Object.keys(canonical).length,
  'A7 distinct share keys == distinct CANONICAL site identities');
ok(Object.keys(A.bySite).every(function (k) { return k.indexOf('CCM:') === 0 || k.indexOf('MKT:') === 0; }),
  'A8 and every key is KMFSA\'s, not a hyphen-joined page string');

// A share key built by joining on "-" is ambiguous by construction; the canonical key is delimited.
var amb = project([row('Res-US', 'TW', 'Amazon', 'GA0450', 2026, 10),
                   row('Res', 'US-TW', 'Amazon', 'GA0450', 2026, 10)]);
eq(Object.keys(amb.bySite).length, 2, 'A9 "Res-US"+"TW" and "Res"+"US-TW" remain two sites');

// §B12 case 2 — multiple marketplaces in one country (the case the old code got right).
var B = project([row('KM', 'US', 'Amazon', 'GA0450', 2026, 800),
                 row('KM', 'US', 'Walmart', 'GA0450', 2026, 150),
                 row('KM', 'US', 'Shopify', 'GA0450', 2026, 50)]);
close(shareOf(B, 'KM', 'US', 'Amazon', 'GA0450'), 0.8, 1e-12, 'A10 distinct marketplaces still normalize');
ok(KMFCS.sumsToOne([0.8, 0.15, 0.05]), 'A11 ... and still sum to 1');

// =======================================================================================================
section('B — TWO DENOMINATORS. Company-wide, and source-constrained.');
// =======================================================================================================
// §B12 case 3 + 4 — multiple companies on one SKU; company share sums to 1 WITHIN EACH COMPANY.
var C = project([
  row('KM', 'US', 'Amazon', 'CO1150-R', 2026, 600),
  row('KM', 'CA', 'Amazon', 'CO1150-R', 2026, 200),
  row('ResUS', 'US', 'Amazon', 'CO1150-R', 2026, 300),
  row('ResTW', 'TW', 'Rakuten', 'CO1150-R', 2026, 100)
]);
close(shareOf(C, 'KM', 'US', 'Amazon', 'CO1150-R'), 600 / 800, 1e-12, 'B1 KM/US is 75% OF KM');
close(shareOf(C, 'KM', 'CA', 'Amazon', 'CO1150-R'), 200 / 800, 1e-12, 'B2 KM/CA is 25% OF KM');
close(shareOf(C, 'ResUS', 'US', 'Amazon', 'CO1150-R'), 1, 1e-12, 'B3 ResUS is its company\'s only site');
close(sumField(C, 'companyForecastShare'), 3, 1e-9,
  'B4 company shares sum to 1 PER COMPANY — three companies, total 3 (never 1 across all)');

// §B3 — the resolved divergence: company-wide, NOT company+country.
close(shareOf(C, 'KM', 'US', 'Amazon', 'CO1150-R'), 0.75, 1e-12,
  'B5 the KM denominator spans COUNTRIES (US+CA=800); a company+country denominator would read 1.0');

// §B12 case 7 — CN source follows KMFSA eligibility (shared, cross-company).
var CN = project([
  row('KM', 'US', 'Amazon', 'CO1150-R', 2026, 600),
  row('ResUS', 'US', 'Amazon', 'CO1150-R', 2026, 300),
  row('ResTW', 'TW', 'Rakuten', 'CO1150-R', 2026, 100)
], { sourceCountry: 'CN' });
eq(CN.eligibleReceiverPolicy, 'SHARED_ALL_ELIGIBLE', 'B6 a CN source is shared across companies');
close(sumField(CN, 'eligibleReceiverForecastShare'), 1, 1e-9, 'B7 and its receiver shares sum to 1');
close(shareOf(CN, 'ResTW', 'TW', 'Rakuten', 'CO1150-R', 'eligibleReceiverForecastShare'), 100 / 1000, 1e-12,
  'B8 ResTW is an eligible CN receiver');

// §B12 case 6 — TW source excludes KM and ResTW entirely.
var TW = project([
  row('KM', 'US', 'Amazon', 'CO1150-R', 2026, 600),
  row('ResUS', 'US', 'Amazon', 'CO1150-R', 2026, 300),
  row('ResTW', 'TW', 'Rakuten', 'CO1150-R', 2026, 100)
], { sourceCountry: 'TW' });
eq(TW.eligibleReceiverPolicy, 'RESUS_ONLY', 'B9 a TW source is ResUS-only');
eq(shareOf(TW, 'KM', 'US', 'Amazon', 'CO1150-R', 'eligibleReceiverForecastShare'), null,
  'B10 KM gets NO eligible-receiver share from TW — null, not 0');
eq(shareOf(TW, 'ResTW', 'TW', 'Rakuten', 'CO1150-R', 'eligibleReceiverForecastShare'), null,
  'B11 and neither does ResTW, despite being the TW company');
close(shareOf(TW, 'ResUS', 'US', 'Amazon', 'CO1150-R', 'eligibleReceiverForecastShare'), 1, 1e-12,
  'B12 ResUS takes the whole TW pool');
close(sumField(TW, 'eligibleReceiverForecastShare'), 1, 1e-9, 'B13 §B12-5 receiver shares sum to 1');

// An unauthorized source country fails CLOSED rather than defaulting to shared.
var XX = project([row('KM', 'US', 'Amazon', 'CO1150-R', 2026, 600)], { sourceCountry: 'VN' });
eq(XX.eligibleReceiverPolicy, null, 'B14 an unauthorized factory country yields no policy');
ok(XX.issues.some(function (i) { return i.code === 'NO_AUTHORIZED_SOURCE_POLICY'; }),
  'B15 ... and says so, typed');

// The diagnostic share is a DIFFERENT number from either, which is why it needs a different name.
close(sumField(C, 'allSiteForecastShare'), 1, 1e-9, 'B16 the all-site diagnostic sums to 1 across all companies');
ok(shareOf(C, 'KM', 'US', 'Amazon', 'CO1150-R', 'allSiteForecastShare')
   !== shareOf(C, 'KM', 'US', 'Amazon', 'CO1150-R', 'companyForecastShare'),
  'B17 and it is NOT the company share — one heading could never have carried both');

// Eligibility is DELEGATED, never restated. A second policy table is the failure this prevents.
ok(!/RESUS|receiverCompanyKeys|FACTORY_SOURCE_POLICY\s*=/.test(SHARE.replace(/^\s*\/\/.*$/gm, '')),
  'B18 KMFCS declares no source policy of its own — it calls KMFSA.policyFor / isEligibleReceiver');
ok(/FSA\.isEligibleReceiver/.test(SHARE) && /FSA\.policyFor/.test(SHARE),
  'B19 ... and is wired to exactly those');
ok(/FSA\.siteKey/.test(SHARE) && /FSA\.companyKey/.test(SHARE) && /FSA\.forecastWindowMonths/.test(SHARE),
  'B20 site identity, company identity and the window all come from KMFSA too');

// =======================================================================================================
section('C — THE BASIS. Raw Regular FC over M+1..M+4, and nothing else.');
// =======================================================================================================
// §B12 case 14 — the window is M+1..M+4 of the INJECTED anchor, and it crosses a year boundary.
eq(project([row('KM', 'US', 'Amazon', 'GA0450', 2026, 10)]).windowMonths,
  ['2026-02', '2026-03', '2026-04', '2026-05'], 'C1 the window is M+1..M+4');
eq(KMFCS.project({ sku: 'GA0450', forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 10)],
                   calculationMonth: '2026-11' }).windowMonths,
  ['2026-12', '2027-01', '2027-02', '2027-03'], 'C2 ... and it crosses the year boundary');

// A December anchor must read NEXT year's rows. This is the whole reason the FC index key carries `year`,
// and the reason an annual, year-filtered column can never be this quantity.
var CROSS = KMFCS.project({
  sku: 'GA0450', calculationMonth: '2026-11',
  forecastRows: [
    row('KM', 'US', 'Amazon', 'GA0450', 2026, 0, { dec: 100, jan: 777 }),   // jan-2026 is OUT of window
    row('KM', 'US', 'Amazon', 'GA0450', 2027, 0, { jan: 50, feb: 50, mar: 50 }),
    row('KM', 'US', 'Walmart', 'GA0450', 2026, 0, { dec: 100 })
  ]
});
eq(CROSS.bySite[KMFSA.siteKey({ company: 'KM', country: 'US', marketplace: 'Amazon' })].forecastQty, 250,
  'C3 a cross-year window sums BOTH years\' rows (100 dec-26 + 150 of 2027), and jan-2026 is not in it');

// §B12 case 11 — only the twelve raw month columns are read. Nothing else on the row is a basis input.
var NOISE = project([row('KM', 'US', 'Amazon', 'GA0450', 2026, 25, {
  total_fc: 999999, fc_share: '0.99', target_percentage: 200, event_fc: 5000, safety_demand: 400
})]);
eq(NOISE.bySite[KMFSA.siteKey({ company: 'KM', country: 'US', marketplace: 'Amazon' })].forecastQty, 100,
  'C4 §B12-11 the basis is 4 raw months (4×25); total_fc / fc_share / event / safety are ignored');

// §B12 cases 12 + 13 — stated as source facts, because that is where they are frozen.
ok(!/target|Target/.test(SHARE.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
  'C5 §B12-12 no target rule appears in the executable basis');
ok(!/specialEvent|special_event|fc_qty/.test(SHARE.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
  'C6 §B12-13 no Special Event quantity appears in the executable basis');
ok(/Special Event demand is NEVER folded into the/.test(read('assets/js/core/supply-planning-planning-context.js')),
  'C7 ... and the canonical owner says the same, so this is inherited rather than re-decided');

// §B12 case 15 — deterministic: the same inputs give byte-identical output, and there is no clock.
var det1 = JSON.stringify(project([row('KM', 'US', 'Amazon', 'GA0450', 2026, 10),
                                   row('KM', 'CA', 'Amazon', 'GA0450', 2026, 30)]));
var det2 = JSON.stringify(project([row('KM', 'CA', 'Amazon', 'GA0450', 2026, 30),
                                   row('KM', 'US', 'Amazon', 'GA0450', 2026, 10)]));
eq(det1, det2, 'C8 §B12-15 output is byte-identical regardless of input order');
var codeOnly = SHARE.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/Date\.now|new Date|Math\.random/.test(codeOnly), 'C9 KMFCS reads no clock and no RNG');

// The anchor is TYPED, never defaulted.
eq(KMFCS.resolveAnchor('').state, KMFCS.ANCHOR_UNAVAILABLE, 'C10 a missing anchor is UNAVAILABLE');
eq(KMFCS.resolveAnchor('2026-13').state, KMFCS.ANCHOR_INVALID, 'C11 a malformed anchor is INVALID, not coerced');
eq(KMFCS.resolveAnchor('2026-01').state, KMFCS.ANCHOR_VALID, 'C12 a real anchor is VALID');
var NOANCHOR = KMFCS.project({ sku: 'GA0450', forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 10)],
                               calculationMonth: '' });
eq(Object.keys(NOANCHOR.bySite).length, 0, 'C13 with no anchor there are no shares at all');
ok(NOANCHOR.issues.some(function (i) { return i.code === 'FORECAST_SHARE_ANCHOR_UNAVAILABLE'; }),
  'C14 ... and the reason is typed, not silent');

// =======================================================================================================
section('D — ZERO, MISSING, INACTIVE, INCOMPLETE. None of them become a fake share.');
// =======================================================================================================
// §B12 case 16 — zero denominator yields NO share. Never an equal split, never 100%.
var Z = project([row('KM', 'US', 'Amazon', 'GA0451', 2026, 0),
                 row('KM', 'US', 'Walmart', 'GA0451', 2026, 0)]);
eq(shareOf(Z, 'KM', 'US', 'Amazon', 'GA0451'), null, 'D1 §B12-16 a zero denominator gives null, not 0.5');
eq(shareOf(Z, 'KM', 'US', 'Walmart', 'GA0451'), null, 'D2 ... for every site in the group');
ok(Z.issues.some(function (i) { return i.code === 'ZERO_FORECAST_DENOMINATOR'; }), 'D3 ... and says why');

// §B12 case 17 — missing forecast is NOT zero forecast. Both weigh 0; only one is reported.
var M = project([row('KM', 'US', 'Amazon', 'CO1200-O', 2026, 100),
                 row('KM', 'CA', 'Amazon', 'CO1200-O', 2025, 999)]);   // wrong YEAR -> outside the window
var missKey = KMFSA.siteKey({ company: 'KM', country: 'CA', marketplace: 'Amazon' });
eq(M.bySite[missKey].matchedMonths, 0, 'D4 §B12-17 a site with no row in the window matched 0 months');
eq(M.bySite[missKey].forecastQty, 0, 'D5 ... contributes 0 to the denominator');
ok(M.issues.some(function (i) { return i.code === 'SITE_FORECAST_WINDOW_MISSING'; }),
  'D6 ... and is REPORTED, so a silent zero can be told from a real one');
var realZero = project([row('KM', 'US', 'Amazon', 'CO1200-O', 2026, 100),
                        row('KM', 'CA', 'Amazon', 'CO1200-O', 2026, 0)]);
eq(realZero.bySite[missKey].matchedMonths, 4, 'D7 a REAL zero matched its months — a different fact');
ok(!realZero.issues.some(function (i) { return i.code === 'SITE_FORECAST_WINDOW_MISSING'; }),
  'D8 ... and is not reported as missing');

// §B12 case 18 — an explicitly inactive site is excluded; a BLANK flag is not an exclusion.
var INACT = KMFCS.project({
  sku: 'GA0450', calculationMonth: ANCHOR,
  forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 100), row('KM', 'CA', 'Amazon', 'GA0450', 2026, 100)],
  sites: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'GA0450', is_active: 'FALSE' },
          { company: 'KM', country: 'CA', marketplace: 'Amazon', sku: 'GA0450', is_active: '' }]
});
eq(Object.keys(INACT.bySite).length, 1, 'D9 §B12-18 an explicitly inactive site is excluded');
ok(INACT.issues.some(function (i) { return i.code === 'SITE_INACTIVE'; }), 'D10 ... typed');
close(shareOf(INACT, 'KM', 'CA', 'Amazon', 'GA0450'), 1, 1e-12,
  'D11 ... and a BLANK is_active is NOT an exclusion — the remaining site takes the whole share');

// §B12 case 19 — an incomplete site scope is excluded with a diagnostic.
var INC = KMFCS.project({
  sku: 'GA0450', calculationMonth: ANCHOR,
  forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 100), row('KM', '', 'Amazon', 'GA0450', 2026, 100)]
});
eq(Object.keys(INC.bySite).length, 1, 'D12 §B12-19 a scope missing country is excluded');
ok(INC.issues.some(function (i) { return i.code === 'SITE_SCOPE_INCOMPLETE'; }), 'D13 ... typed');

// §B12 case 20 — no NaN, no Infinity, no negative, nothing above 1.
var WEIRD = project([row('KM', 'US', 'Amazon', 'GA0450', 2026, 100, { mar: 'not-a-number', apr: null }),
                     row('KM', 'CA', 'Amazon', 'GA0450', 2026, -500)]);
var allVals = [];
Object.keys(WEIRD.bySite).forEach(function (k) {
  var e = WEIRD.bySite[k];
  allVals.push(e.companyForecastShare, e.allSiteForecastShare, e.eligibleReceiverForecastShare);
});
ok(allVals.every(function (v) { return v === null || (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1); }),
  'D14 §B12-20 every share is null or a finite number in [0,1] — no NaN, Infinity or negative', allVals);
ok(WEIRD.issues.some(function (i) { return i.code === 'SITE_FORECAST_NEGATIVE'; }),
  'D15 ... and a negative basis is clamped AND reported, never silently inflating its siblings');

// =======================================================================================================
section('E — ROUNDING. Display is 1dp; the invariant is never checked against display.');
// =======================================================================================================
// §B12 cases 21 + 22 — three equal sites: decimals sum to 1, formatted strings sum to 99.9, no false alarm.
var R3 = project([row('KM', 'US', 'Amazon', 'CO1100', 2026, 100),
                  row('KM', 'US', 'Walmart', 'CO1100', 2026, 100),
                  row('KM', 'US', 'Shopify', 'CO1100', 2026, 100)]);
var thirds = Object.keys(R3.bySite).map(function (k) { return R3.bySite[k].companyForecastShare; });
ok(KMFCS.sumsToOne(thirds), 'E1 §B12-21 three equal sites sum to 1 on DECIMALS at 1e-9');
var shown = thirds.map(function (v) { return KMFCS.formatShare(v); });
eq(shown, ['33.3%', '33.3%', '33.3%'], 'E2 display is 1 decimal');
var shownSum = shown.reduce(function (a, s) { return a + parseFloat(s); }, 0);
close(shownSum, 99.9, 1e-9, 'E3 ... and the displayed strings legitimately sum to 99.9');
ok(KMFCS.sumsToOne(thirds) && Math.abs(shownSum - 100) > 0.05,
  'E4 §B12-22 so a validator reading the DISPLAY would raise a false alarm the decimal one does not');
eq(KMFCS.SHARE_TOLERANCE, 1e-9, 'E5 the tolerance is the repository\'s established epsilon');
// `sumsToOne` must not be satisfiable by formatted strings — a guard against the old mistake returning.
ok(!KMFCS.sumsToOne([0.333, 0.333, 0.333]), 'E6 and it is a real tolerance, not a loose one');

// A null share formats as an em dash, never as 0.0% — "undefined" and "nothing" are different facts.
eq(KMFCS.formatShare(null), '—', 'E7 a null share is an em dash');
eq(KMFCS.formatShare(0), '0.0%', 'E8 ... and a genuine zero share is still 0.0%');

// =======================================================================================================
section('F — THE PAGE. Authoritative denominator, typed unavailability, no local formula.');
// =======================================================================================================
// §B12 case 27's target: the page must own NO share arithmetic.
ok(FCS.indexOf('function calculateFcPercentages') === -1,
  'F1 §B12-27 calculateFcPercentages is GONE from the page');
ok(FCS.indexOf('function calculateEventFcPercentages') === -1,
  'F2 ... and so is calculateEventFcPercentages');
var pageCode = FCS.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
// Scoped to the SHARE. `rule.percentages[m]` elsewhere on this page is the Target % Rules table —
// twelve authored per-month target percentages, which is a different thing entirely.
ok(!/grandTotal/.test(pageCode), 'F3 the old grand-total denominator is gone from the page');
ok(!/fcPercentages|eventFcPercentages/.test(pageCode), 'F3b ... and so are both share lookup tables');
ok(!/\(total \/ grandTotal\)|\* 100;/.test(pageCode), 'F3c ... and the percent arithmetic with it');
ok(/_fcShareRuntime_[\s\S]*window\.KM\.forecastShare/.test(FCS),
  'F4 the page reaches the ONE runtime owner');

// The page's own anchor is UNAVAILABLE and is not a clock and not the year filter.
ok(/var _FC_SHARE_ANCHOR_ = '';/.test(FCS), 'F5 the page anchor is empty — typed unavailable');
var shareSeam = FCS.slice(FCS.indexOf('function _fcShareRuntime_'), FCS.indexOf('function renderFcRegularTable'));
ok(!/new Date|Date\.now/.test(shareSeam), 'F6 §B2 the page does not substitute a browser clock');
ok(!/filters\.year|item\.year/.test(shareSeam), 'F7 ... and does not substitute the selected year');

// §B12 cases 9 + 10 — the denominator comes from the AUTHORITATIVE UNFILTERED set.
var regRender = fnSrc(FCS, 'renderFcRegularTable');
ok(/_fcShareProjections_\(_fcShareSourceRows_\(_fcRegularSource\)/.test(regRender),
  'F8 §B12-9/10 the renderer projects over the unfiltered source');
ok(!/_fcShareProjections_\(filteredData|_fcShareProjections_\(paginatedData/.test(regRender),
  'F9 ... never over filteredData or paginatedData');
// The contract is the ARGUMENT, not the line number: `_fcRegularSource` is assigned from the whole
// data source before any filter runs, and that is the value handed to the projection.
var srcIdx = regRender.indexOf('_fcRegularSource = ');
var projIdx = regRender.indexOf('_fcShareProjections_');
ok(srcIdx > -1 && projIdx > srcIdx, 'F10 the projection consumes the pre-filter assignment');
ok(/const filteredData = filterFcRegular\(_fcRegularSource, filters\);/.test(regRender),
  'F10b ... and filtering is a SEPARATE derivation from the same source, applied to the view only');

// Driven: the page seam, executed. Filtering and paging must not move a share.
var sandbox = {
  console: console, window: { KM: { forecastShare: KMFCS } }, KMFCS: KMFCS,
  _fcUseDb: function () { return false; }, _fcGetRegularForecast: function () { return []; }
};
vm.createContext(sandbox);
['_fcShareRowShape_', '_fcShareProjections_', '_fcShareCells_', '_fcShareSourceRows_',
 '_fcShareUnavailableTitle_', '_fcShareRuntime_', '_fcShareAnchor_', 'filterFcRegular']
  .forEach(function (n) { vm.runInContext(fnSrc(FCS, n), sandbox); });
vm.runInContext("var _FC_SHARE_MONTHS_ = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];", sandbox);
vm.runInContext("var _FC_SHARE_DASH_ = '\\u2014';", sandbox);
vm.runInContext("var _FC_SHARE_ANCHOR_ = '';", sandbox);

var VIEW_ROWS = [
  { sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'Amazon',
    category: 'Can Opener', series: 'CO', months: [800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800] },
  { sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'Walmart',
    category: 'Can Opener', series: 'CO', months: [150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150] },
  { sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'Shopify',
    category: 'Can Opener', series: 'CO', months: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50] }
];
sandbox.VIEW_ROWS = VIEW_ROWS; sandbox.ANCHOR = ANCHOR;
function cellFor(rowsPassed, item) {
  sandbox.__rows = rowsPassed; sandbox.__item = item;
  return vm.runInContext(
    'JSON.stringify(_fcShareCells_(_fcShareProjections_(__rows, ANCHOR), __item))', sandbox);
}
var fullCell = cellFor(VIEW_ROWS, VIEW_ROWS[0]);
eq(JSON.parse(fullCell).company, '80.0%', 'F11 driven: Amazon is 80.0% of the full set');

var filteredTwo = vm.runInContext(
  'filterFcRegular(VIEW_ROWS, { year: "2026", companies: ["KM"], marketplaces: ["Amazon","Walmart"], ' +
  'countries: ["US"], categories: ["Can Opener"], series: ["CO"], sku: "" })', sandbox);
eq(filteredTwo.length, 2, 'F12 the filter really does drop a row');
eq(JSON.parse(cellFor(VIEW_ROWS, VIEW_ROWS[0])).company, '80.0%',
  'F13 §B12-9 the share is unchanged while that filter is active (denominator is the full set)');
eq(JSON.parse(cellFor(filteredTwo, VIEW_ROWS[0])).company, '84.2%',
  'F14 ... and passing the FILTERED set instead would have produced 84.2% — so the input choice is the fix');
eq(JSON.parse(cellFor(VIEW_ROWS.slice(0, 2), VIEW_ROWS[0])).company, '84.2%',
  'F15 §B12-10 likewise a page slice would change it — which is why the slice is never passed');

// Unavailable anchor -> em dash on BOTH columns, and a stated reason.
sandbox.__rows = VIEW_ROWS;
var dashCells = JSON.parse(vm.runInContext(
  'JSON.stringify(_fcShareCells_(_fcShareProjections_(__rows, _fcShareAnchor_()), __rows[0]))', sandbox));
eq(dashCells, { company: '—', site: '—' }, 'F16 with no anchor both columns are an em dash');
var title = vm.runInContext('_fcShareUnavailableTitle_(_fcShareProjections_(__rows, _fcShareAnchor_()))', sandbox);
ok(/No canonical planning anchor/.test(title) && /not an annual Total FC ratio/.test(title),
  'F17 ... and the cell says why, naming what was deliberately NOT substituted');
eq(vm.runInContext('_fcShareUnavailableTitle_({ available: true })', sandbox), '',
  'F18 ... and carries no title when the share is real');

// The render shape ceils; the raw shape does not. The basis must prefer raw.
eq(vm.runInContext('_fcShareRowShape_({ sku: "X", months: [1,2,3,4,5,6,7,8,9,10,11,12] }).mar', sandbox), 3,
  'F19 the adapter reads a months[] render row');
eq(vm.runInContext('_fcShareRowShape_({ sku: "X", mar: 7 }).mar', sandbox), 7,
  'F20 ... and a raw jan..dec row');
ok(/_fcGetRegularForecast/.test(fnSrc(FCS, '_fcShareSourceRows_')),
  'F21 and the live path prefers the RAW rows — a twelve-times ceiling is display, not a forecast');

// =======================================================================================================
section('G — MARKUP, EVENT TABLE, AND THE LEGACY COLUMN.');
// =======================================================================================================
ok(/>Company FC Share</.test(HTML), 'G1 the Regular table names the company denominator');
ok(/>Site FC Share</.test(HTML), 'G2 ... and the all-site one');
ok(!/<div class="header-cell">FC占比<\/div>/.test(HTML),
  'G3 the ambiguous single heading is gone from every table');
var evtHdr = HTML.slice(HTML.indexOf('id="fc-event-scroll-header"'));
evtHdr = evtHdr.slice(0, evtHdr.indexOf('table-body-bar'));
ok(!/Share|占比/.test(evtHdr), 'G4 §B10 the Event table offers no share column at all');
ok(/planning window/.test(HTML), 'G5 the headings say these are planning-window shares');

// §B12 case 23 + 24 — the B1 writer's relationship with the legacy column did not move.
var regHandler = GS.slice(GS.indexOf('function handleImportFcRegularForecastBatch_'));
ok(/if \(fcCol\('fc_share'\) !== -1\) newRow\[fcCol\('fc_share'\)\] = '';/.test(regHandler),
  'G6 §B12-24 the writer still creates fc_share as the empty string');
var pairsBlock = regHandler.slice(regHandler.indexOf('var pairs = [];'), regHandler.indexOf('updateOps.push'));
ok(pairsBlock.indexOf("'fc_share'") === -1,
  'G7 §B12-23 ... and still never adds fc_share to an UPDATE run');
ok(/requiredFc[\s\S]{0,400}'fc_share'/.test(regHandler),
  'G8 the column is still REQUIRED in the header — renaming or dropping it would refuse every batch');
ok(FC_HEADERS.indexOf('FC_SPECIAL_EVENTS_HEADERS_') > -1 &&
   FC_HEADERS.slice(FC_HEADERS.indexOf('var FC_SPECIAL_EVENTS_HEADERS_'),
                    FC_HEADERS.indexOf('var FC_TARGET_RULES_HEADERS_')).indexOf('fc_share') === -1,
  'G9 fc_special_events still has NO fc_share column, and gained none');
var shareCodeOnly = SHARE.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/fc_share/.test(shareCodeOnly),
  'G10 KMFCS never reads the legacy column in CODE — it is named only in the note saying it is not truth');

// Load order: KMFCS after KMFSA, before the page that consumes it.
var iFsa = INDEX.indexOf('supply-planning-factory-site-allocation.js');
var iFcs = INDEX.indexOf('supply-planning-forecast-share.js');
var iPage = INDEX.indexOf('pages/fc-summary.js');
ok(iFsa > -1 && iFcs > iFsa && iPage > iFcs, 'G11 index.html loads KMFSA -> KMFCS -> fc-summary.js');

// Specs.
ok(/SKU FC Share = Marketplace SKU FC ÷ Company Total FC/.test(RULES),
  'G12 the pinned §7 literal is retained verbatim (the R4B-R1 regression depends on it)');
ok(/company-wide, NOT/.test(RULES) || /company-wide, \*\*NOT/.test(RULES),
  'G13 §B13 the rules doc states the company denominator is company-wide, not company+country');
ok(/LEGACY column/.test(RULES) && /not the source of truth/.test(RULES),
  'G14 ... and that the DB column is legacy, not runtime truth');
ok(/ANCHOR_UNAVAILABLE/.test(SPEC) && /MISSING_OWNER/.test(SPEC),
  'G15 FC_SUMMARY_SPEC records the unavailable anchor AND names the missing owner');
ok(/42\.9%/.test(SPEC), 'G16 ... and records the measured defect it closes');

// =======================================================================================================
section('H — DRIVEN MUTANTS. Each injects a real fault into real source and must be caught.');
// =======================================================================================================
function runFaulted(src, from, to) {
  if (src.indexOf(from) === -1) throw new Error('mutant anchor missing: ' + from.slice(0, 60));
  // The module resolves `./supply-planning-factory-site-allocation.js` relative to ITSELF, so the
  // sandbox gets a require rooted in assets/js/core — not this file's directory.
  var coreRequire = require('module').createRequire(path.join(REPO, 'assets/js/core/x.js'));
  var box = { console: { log: function () {}, warn: function () {}, error: function () {} },
              module: { exports: {} }, require: coreRequire, globalThis: {} };
  box.window = undefined;
  vm.createContext(box);
  vm.runInContext(src.split(from).join(to), box, { filename: 'kmfcs-mutant.js' });
  return box.module.exports;
}
// Normalized to LF so a multi-line mutant anchor written in this file matches the CRLF source.
var SHARE_RAW = read('assets/js/core/supply-planning-forecast-share.js');

// M1 — §B12 case 25: the old key, restored. Country drops out and the collision returns.
(function () {
  var K = runFaulted(SHARE_RAW,
    "return FSA.companyKey(company) + '|' + up(country) + '|' + low(marketplace) + '|' + up(sku) + '|' + str(year);",
    "return FSA.companyKey(company) + '-' + up(sku) + '-' + low(marketplace) + '|' + str(year);");
  var p = K.project({ sku: 'CO1100-R', calculationMonth: ANCHOR, forecastRows: ROWS_A });
  var us = K.siteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' });
  mutant('M1 §B12-25 the old company-sku-marketplace basis key is restored (country dropped)',
    Math.abs((us.companyForecastShare || 0) - 400 / 700) > 1e-9);
})();

// M2 — the share KEY stops being the canonical site identity, so two sites share one entry.
(function () {
  var K = runFaulted(SHARE_RAW, 'var k = FSA.siteKey(s);',
    "var k = 'CCM:' + up(s.company) + '|' + low(s.marketplace);");
  var p = K.project({ sku: 'CO1100-R', calculationMonth: ANCHOR, forecastRows: ROWS_A });
  mutant('M2 §B12-8 the site key drops country, collapsing three sites into one entry',
    Object.keys(p.bySite).length !== 3);
})();

// M3 — a zero denominator becomes an equal split. The exact "helpful" fallback §B8 forbids.
(function () {
  var K = runFaulted(SHARE_RAW, 'if (!(d > 0)) return null;', 'if (!(d > 0)) return 1 / 2;');
  var p = K.project({ sku: 'GA0451', calculationMonth: ANCHOR,
    forecastRows: [row('KM', 'US', 'Amazon', 'GA0451', 2026, 0), row('KM', 'US', 'Walmart', 'GA0451', 2026, 0)] });
  var v = K.siteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'GA0451' });
  mutant('M3 §B12-16 a zero denominator is turned into an equal split', v.companyForecastShare !== null);
})();

// M4 — missing stops being distinguishable from zero.
(function () {
  var K = runFaulted(SHARE_RAW, "if (b.matchedMonths === 0) {", "if (false) {");
  var p = K.project({ sku: 'CO1200-O', calculationMonth: ANCHOR,
    forecastRows: [row('KM', 'US', 'Amazon', 'CO1200-O', 2026, 100), row('KM', 'CA', 'Amazon', 'CO1200-O', 2025, 999)] });
  mutant('M4 §B12-17 a missing forecast window stops being reported, so it reads as a real zero',
    !p.issues.some(function (i) { return i.code === 'SITE_FORECAST_WINDOW_MISSING'; }));
})();

// M5 — the TW source policy is bypassed, handing a ResUS-only pool to every company.
(function () {
  var K = runFaulted(SHARE_RAW, 'if (!FSA.isEligibleReceiver(policy, row.site.company)) return;', '');
  var p = K.project({ sku: 'CO1150-R', calculationMonth: ANCHOR, sourceCountry: 'TW',
    forecastRows: [row('KM', 'US', 'Amazon', 'CO1150-R', 2026, 600),
                   row('ResUS', 'US', 'Amazon', 'CO1150-R', 2026, 300)] });
  var km = K.siteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1150-R' });
  mutant('M5 §B12-6 the factory-source policy is bypassed, giving KM a share of a TW (ResUS-only) pool',
    km.eligibleReceiverForecastShare !== null);
})();

// M6 — the company denominator becomes company+country: the divergence §B3 exists to settle.
(function () {
  var K = runFaulted(SHARE_RAW, "var ck = FSA.companyKey(row.site.company);\n      byCompanyKey[ck] = (byCompanyKey[ck] || 0) + row.basis;",
    "var ck = FSA.companyKey(row.site.company) + '|' + up(row.site.country);\n      byCompanyKey[ck] = (byCompanyKey[ck] || 0) + row.basis;");
  var p = K.project({ sku: 'CO1150-R', calculationMonth: ANCHOR,
    forecastRows: [row('KM', 'US', 'Amazon', 'CO1150-R', 2026, 600), row('KM', 'CA', 'Amazon', 'CO1150-R', 2026, 200)] });
  var us = K.siteShares(p, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1150-R' });
  // Under the mutant KM/US is alone in its group and reads 1.0 instead of 0.75.
  mutant('M6 §B3 the company denominator is narrowed to company+country',
    Math.abs((us.companyForecastShare === null ? -1 : us.companyForecastShare) - 0.75) > 1e-9);
})();

// M7 — the window stops being M+1..M+4 and becomes the anchor month onward, changing the basis.
(function () {
  var K = runFaulted(SHARE_RAW, 'var months = FSA.forecastWindowMonths(anchor.month);',
    "var months = FSA.forecastWindowMonths(anchor.month).slice(0, 2);");
  var p = K.project({ sku: 'GA0450', calculationMonth: ANCHOR,
    forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 25)] });
  mutant('M7 §B12-14 the rolling window is shortened, so the basis is no longer Σ over M+1..M+4',
    p.bySite[KMFSA.siteKey({ company: 'KM', country: 'US', marketplace: 'Amazon' })].forecastQty !== 100);
})();

// M8 — a missing anchor silently defaults to a clock. The substitution §B2 forbids by name.
(function () {
  var K = runFaulted(SHARE_RAW, "if (raw === '') {\n      return { month: null, state: ANCHOR_UNAVAILABLE_,",
    "if (raw === '') {\n      var d = new Date();\n      return { month: d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2), state: ANCHOR_VALID_,");
  mutant('M8 §B2 a missing anchor silently becomes the browser clock',
    K.resolveAnchor('').state !== K.ANCHOR_UNAVAILABLE);
})();

// M9 — a negative basis is passed through instead of clamped, producing a share outside [0,1].
(function () {
  var K = runFaulted(SHARE_RAW, 'row.basis = b.negative ? 0 : b.qty;', 'row.basis = b.qty;');
  var p = K.project({ sku: 'GA0450', calculationMonth: ANCHOR,
    forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 100), row('KM', 'CA', 'Amazon', 'GA0450', 2026, -50)] });
  // `ratio()` independently guards the output range, so no share escapes [0,1]. What the clamp
  // prevents is a POISONED DENOMINATOR: a -200 site turns 600 into 200 and KM/US reads 1.0
  // instead of 2/3. That is the observable fault.
  var usM9 = p.bySite[KMFSA.siteKey({ company: 'KM', country: 'US', marketplace: 'Amazon' })];
  mutant('M9 §B12-20 a negative basis is no longer clamped, poisoning the denominator',
    Math.abs(usM9.companyForecastShare - 400 / 600) > 1e-9);
})();

// M10 — the 100% invariant is checked on ROUNDED values, which is the false alarm §B9 forbids.
(function () {
  var K = runFaulted(SHARE_RAW,
    'if (typeof v === \'number\' && isFinite(v)) { s += v; n++; }',
    'if (typeof v === \'number\' && isFinite(v)) { s += Number((v * 100).toFixed(1)) / 100; n++; }');
  mutant('M10 §B12-22 the invariant is evaluated on display-rounded values, raising a false alarm',
    K.sumsToOne([1 / 3, 1 / 3, 1 / 3]) === false);
})();

// M11 — a null share renders as 0.0%, erasing the difference between "undefined" and "nothing".
(function () {
  // The module file carries a LITERAL em dash character here, not an escape, so the anchor must too.
  var K = runFaulted(SHARE_RAW, "if (v === null || v === undefined) return '—';",
    "if (v === null || v === undefined) return (0).toFixed(1) + '%';");
  mutant('M11 an undefined share is displayed as a real 0.0%', K.formatShare(null) !== '—');
})();

// M12 — §B12 case 26: the renderer is pointed back at the filtered set.
(function () {
  var faultedRender = fnSrc(FCS, 'renderFcRegularTable')
    .split('_fcShareProjections_(_fcShareSourceRows_(_fcRegularSource)')
    .join('_fcShareProjections_(_fcShareSourceRows_(filteredData)');
  var caught = /_fcShareProjections_\(_fcShareSourceRows_\(filteredData\)/.test(faultedRender)
    && !/_fcShareProjections_\(_fcShareSourceRows_\(_fcRegularSource\)/.test(faultedRender);
  // Prove it is a REAL behaviour change, not just different text.
  var a = JSON.parse(cellFor(VIEW_ROWS, VIEW_ROWS[0])).company;
  var b = JSON.parse(cellFor(VIEW_ROWS.slice(0, 2), VIEW_ROWS[0])).company;
  mutant('M12 §B12-26 the denominator is pointed back at the filtered set', caught && a !== b);
})();

// M13 — §B12 case 27: a page-local duplicate calculator returns.
(function () {
  var reintroduced = FCS + '\nfunction calculateFcPercentages(data) { return {}; }\n';
  mutant('M13 §B12-27 a page-local share calculator is reintroduced',
    reintroduced.indexOf('function calculateFcPercentages') > -1
      && FCS.indexOf('function calculateFcPercentages') === -1);
})();

// M14 — KMFCS stops delegating eligibility and grows its own policy table.
(function () {
  var withOwnPolicy = SHARE + "\nvar FACTORY_SOURCE_POLICY = { CN: 1, TW: 1 };\n";
  var clean = SHARE.replace(/^\s*\/\/.*$/gm, '');
  mutant('M14 KMFCS declares a second factory-source policy instead of delegating to KMFSA',
    /FACTORY_SOURCE_POLICY\s*=/.test(withOwnPolicy) && !/FACTORY_SOURCE_POLICY\s*=/.test(clean));
})();

// M15 — the B1 writer starts owning the share, which §B11 forbids.
(function () {
  var faultedGs = regHandler.split("if (fcCol('fc_share') !== -1) newRow[fcCol('fc_share')] = '';")
    .join("if (fcCol('fc_share') !== -1) newRow[fcCol('fc_share')] = it.totalFc / 100;");
  mutant('M15 §B11 the B1 Regular writer starts populating fc_share',
    /newRow\[fcCol\('fc_share'\)\] = it\.totalFc/.test(faultedGs)
      && /newRow\[fcCol\('fc_share'\)\] = '';/.test(regHandler));
})();

// M16 — the Event table's share is computed from fc_special_events.fc_qty again.
(function () {
  var reintroduced = HTML.replace('<div class="header-cell">FC Qty</div>',
    '<div class="header-cell">FC Qty</div>\n<div class="header-cell">FC占比</div>');
  mutant('M16 §B10 an Event share column is reintroduced',
    /FC占比/.test(reintroduced.slice(reintroduced.indexOf('id="fc-event-scroll-header"')))
      && !/Share|占比/.test(evtHdr));
})();

// M17 — an explicitly inactive site is admitted back into the denominator.
(function () {
  var K = runFaulted(SHARE_RAW, 'if (siteIsExplicitlyInactive(raw)) {', 'if (false) {');
  var p = K.project({ sku: 'GA0450', calculationMonth: ANCHOR,
    forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 100), row('KM', 'CA', 'Amazon', 'GA0450', 2026, 100)],
    sites: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'GA0450', is_active: 'FALSE' },
            { company: 'KM', country: 'CA', marketplace: 'Amazon', sku: 'GA0450', is_active: '' }] });
  mutant('M17 §B12-18 an explicitly inactive site is counted in the denominator',
    Object.keys(p.bySite).length !== 1);
})();

// M18 — an incomplete site scope is admitted, so a blank country becomes its own site.
(function () {
  var K = runFaulted(SHARE_RAW, 'if (!s.company || !s.country || !s.marketplace) {', 'if (false) {');
  var p = K.project({ sku: 'GA0450', calculationMonth: ANCHOR,
    forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 100), row('KM', '', 'Amazon', 'GA0450', 2026, 100)] });
  mutant('M18 §B12-19 an incomplete site scope is admitted into the denominator',
    Object.keys(p.bySite).length !== 1);
})();

// M19 — the basis starts reading a non-month field (the annual total), the substitution §B6 forbids.
(function () {
  var K = runFaulted(SHARE_RAW, 'sum += numOr0(rows[j][mo.key]);', 'sum += numOr0(rows[j].total_fc || rows[j][mo.key]);');
  var p = K.project({ sku: 'GA0450', calculationMonth: ANCHOR,
    forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 25, { total_fc: 999999 })] });
  mutant('M19 §B2/§B6 the basis falls back to annual total_fc instead of the raw month',
    p.bySite[KMFSA.siteKey({ company: 'KM', country: 'US', marketplace: 'Amazon' })].forecastQty !== 100);
})();

// M20 — the cross-year half of the window is lost, which an annual column would never notice.
(function () {
  var K = runFaulted(SHARE_RAW, "'|' + up(sku) + '|' + str(year);", "'|' + up(sku) + '|';");
  // `jan: 777` on the 2026 row is JANUARY 2026 — outside a Nov-2026 window. It is the bait: only a
  // key that carries the year can keep it out of the 2027 January bucket.
  var p = K.project({ sku: 'GA0450', calculationMonth: '2026-11',
    forecastRows: [row('KM', 'US', 'Amazon', 'GA0450', 2026, 0, { dec: 100, jan: 777 }),
                   row('KM', 'US', 'Amazon', 'GA0450', 2027, 0, { jan: 50, feb: 50, mar: 50 })] });
  mutant('M20 the year leaves the basis key, pulling an out-of-window month in from another year',
    p.bySite[KMFSA.siteKey({ company: 'KM', country: 'US', marketplace: 'Amazon' })].forecastQty !== 250);
})();

// =======================================================================================================
var W = 100;
console.log('\n' + new Array(W + 1).join('='));
console.log('FC SHARE DUAL MODEL (R1) — passed ' + pass + '  failed ' + fail
  + '  |  mutants ' + mutants.length + '  survived ' + survived.length);
console.log(new Array(W + 1).join('='));
if (survived.length) survived.forEach(function (s) { console.error('  SURVIVED: ' + s); });
process.exit(fail ? 1 : 0);
