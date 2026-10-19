// Kitchen Mama Operation System — S8-B3-R3-CP2X-R2 §B
// REUSE, DEDUP, RE-ENTRY, A RETURN WHILE PENDING AND A FINISHED RECALCULATION — IN REAL CHROME,
// COUNTED AT THE SERVER, ACROSS TWO SITES THAT REALLY EXIST.
//
// Run: node assets/tests/ir-scope-reuse-browser-s8-b3-r3-cp2x-r2.test.js
//
// LOCAL / OFFLINE. Reads the capture; captures nothing. No production job is started by the capture
// either: the recalculation is simulated at the page's own completion callback.
//
// WHAT THE CAPTURE IS. `_cp2s-r2-inplace-dom-runner.js --scopes` drives the real page in real Chrome
// through the real router, and brackets each scenario with a server-side mark. The request counts below
// are the SERVER's: a page that lied about its own reads could not move them.
//
// TWO NUMBERS PER READER, AND THAT IS THE POINT. A READER CALL is an entry into
// loadRecommendationWorkspace_ / loadInventoryGap_. A NETWORK REQUEST is a request the server served.
// Reuse and dedup are exactly the cases where the first moves and the second does not, and reporting
// only one of them makes a working cache indistinguishable from a dead page.
//
// WHAT CHANGED SINCE CP2X-R1, AND IT IS A CORRECTION. That round reported that the capture did NOT
// establish the cross-site switch: the Marketplace select never offered the second site, every phase
// after the first silently ran against the same scope, and §F asserted that limitation so it could not
// be forgotten. The cause was in the FIXTURE, not the page. `inventoryScope.registry.get` offered two
// marketplaces, but `inventoryReplenishment.workspace.get` described one — and
// `refreshReplenMarketplaceOptions` rebuilds the select from `_irWsGet('getMarketplaces')`, which
// prefers the read model that read hydrates over the registry. So the first search replaced a two-site
// select with a one-site one, before anything could select the second. The three sources now agree,
// both sites are driven, and §F below asserts the opposite of what it used to: the switch TOOK.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

const EV = JSON.parse(read('docs/evidence/cp2x-r2-scope-reuse/scope-reuse.json'));
const R = EV.result || {};
const SC = R.scopes || {};
const MARKS = EV.requestMarks || [];
const SCOPES_ASKED = EV.requestScopes || [];

// per-phase request deltas, recomputed here from the marks rather than trusted as a summary
function delta(label, action) {
  const i = MARKS.findIndex(m => m.label === 'begin:' + label);
  const j = MARKS.findIndex(m => m.label === 'end:' + label);
  if (i < 0 || j < 0) return null;
  return ((MARKS[j].hits || {})[action] || 0) - ((MARKS[i].hits || {})[action] || 0);
}
const RECO = 'recommendation.workspace.get';
const GAP = 'inventoryReplenishmentGap.get';
const phase = (label) => (SC.phases || []).filter(p => p.label === label)[0] || {};

// ---------------------------------------------------------------------------------------------------
section('A. the capture is current, and it is a capture');

ok(!R.fatal, 'A1  the run completed without a fatal', R.fatal);
ok(!!EV.browser, 'A1a and names the browser', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}T/.test(String(EV.takenAt)), 'A1b and when it was taken');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
ok(Object.prototype.hasOwnProperty.call(EV.sources || {}, 'assets/js/pages/inventory-replenishment.js'),
  'A3  and the page under test is one of the files it pins');
ok(MARKS.length >= 20, 'A4  every phase is bracketed by a server-side mark', MARKS.length);

// ---------------------------------------------------------------------------------------------------
section('B. THE TWO SITES EXIST, AND THE PAGE REALLY APPLIED BOTH');
// This section runs FIRST among the measurements on purpose. Every request count below is only worth
// reading if the scope actually moved; CP2X-R1 proved what happens when it did not.

const moves = SC.moves || [];
ok(moves.length >= 8, 'B1  the site moves were driven and recorded', moves.length);
const refused = moves.filter(m => m.result && m.result.mkt && m.result.mkt.ok === false);
eq(refused.length, 0, 'B2  NO site move was refused — the select held every value it was given');
const offered = moves[0] && moves[0].result && moves[0].result.mktOptions || [];
ok(offered.length >= 3, 'B3  the Marketplace select offers both sites plus the empty option', offered);
const appliedKeys = Array.from(new Set(moves.map(m => m.result && m.result.appliedScopeKey).filter(Boolean)));
eq(appliedKeys.length, 2, 'B4  and the page APPLIED two distinct scopes, not two selections of one', appliedKeys);
ok(appliedKeys.every(k => /^us\|MP-FIXTURE-US-(AMZ|WMT)$/.test(k)),
  'B5  both of them the fixture sites, keyed the way F1A keys them', appliedKeys);
const selectedMkts = Array.from(new Set(moves.map(m => m.result && m.result.selectedScope && m.result.selectedScope.marketplace).filter(Boolean)));
eq(selectedMkts.sort().join(','), 'Amazon,Walmart',
  'B6  the selection and the applied scope agree — a moved select that was never applied would show here');
// THE SERVER'S OWN WITNESS. The page cannot fake these: a switch that did not take cannot produce a
// request naming the second site.
const gapMkts = Array.from(new Set(SCOPES_ASKED.filter(x => x.action === GAP).map(x => x.marketplace))).sort();
eq(gapMkts.join(','), 'Amazon,Walmart', 'B7  and the SERVER was asked for both sites by name', gapMkts);

// ---------------------------------------------------------------------------------------------------
section('C. a cold scope costs one request, and a second site costs one more');

eq(delta('siteA-first', RECO), 1, 'C1  the cold recommendation read is ONE request');
eq(phase('siteA-first').diag.answer.source, 'SERVER', 'C2  and the answer came from the server');
eq(phase('siteA-first').diag.reco.cache.outcome, 'STORED', 'C3  and was stored, so reuse is possible at all');
eq(phase('siteA-first').diag.answer.revisionComplete, true,
  'C4  with a complete revision — the real handler meta, not a markerless fixture');
eq(delta('siteB-first', RECO), 1, 'C5  the SECOND SITE costs one recommendation request');
eq(delta('siteB-first', GAP), 1, 'C6  and one gap request — a scope the page has never read is read');
eq(phase('siteB-first').avg.text, '31.0', 'C7  and the cell shows the second site\'s number, not the first\'s');

// ---------------------------------------------------------------------------------------------------
section('D. coming BACK to the first site — the cross-site reuse CP2X-R1 could not drive');

eq(delta('siteA-again', RECO), 0, 'D1  returning to site A costs ZERO recommendation requests');
eq(delta('siteA-again', GAP), 0, 'D2  and ZERO gap requests');
eq(phase('siteA-again').diag.reco.cache.outcome, 'HIT', 'D3  the recommendation answer came from the session cache');
eq(phase('siteA-again').diag.gap.outcome, 'REUSE', 'D4  and the gap answer from the per-scope results');
eq(phase('siteA-again').diag.gap.reason, null,
  'D5  with a COMPLETE source revision — a reuse flagged incomplete would be measuring a fixture gap');
eq(phase('siteA-again').avg.text, '7.0', 'D6  and site A\'s number is back on screen, not site B\'s');

// ---------------------------------------------------------------------------------------------------
section('E. leaving the page and coming back, through the real router');

eq(delta('leave-return', RECO), 0, 'E1  a real route away and back costs ZERO recommendation requests');
eq(delta('leave-return', GAP), 0, 'E2  and ZERO gap requests');
ok(!SC.lifecycleAbsent, 'E3  and it really used the router rather than skipping the scenario');

// ---------------------------------------------------------------------------------------------------
section('F. re-entry while a read is pending');

eq(delta('pending-reentry', RECO), 1, 'F1  THREE loader calls during one flight produce ONE request');
eq(delta('pending-reentry', GAP), 0, 'F2  and two gap loader calls produce none');

// ---------------------------------------------------------------------------------------------------
section('G. CP2X-R2 §A1 — returning to a cached site while the other one is still in flight');
// The fixture holds site B's answers back for three seconds. The operator goes back to A inside that
// window; A is served from the per-scope results, and B's answers then arrive with nobody waiting.

eq(delta('pending-return-to-cached', RECO), 0,
  'G1  the return to the cached site costs no recommendation request');
eq(delta('pending-return-to-cached', GAP), 0, 'G2  and no gap request');
eq(SC.duringPending.appliedScopeKey, 'us|MP-FIXTURE-US-AMZ',
  'G3  the applied scope at the moment of return is site A');
eq(SC.duringPending.gap.outcome, 'REUSE', 'G4  and the gap answer was reused rather than re-read');
// THE ASSERTION THIS SCENARIO EXISTS FOR. The held site-B responses land after this point.
eq(SC.afterLateArrival.appliedScopeKey, 'us|MP-FIXTURE-US-AMZ',
  'G5  after site B\'s late answers arrive, the applied scope is STILL site A');
eq(SC.afterLateArrival.avg.text, '7.0',
  'G6  and the Avg cell still shows site A\'s rate — the superseded answer did not paint itself');
ok(Number(SC.afterLateArrival.suggested.text) < 500,
  'G7  as does Suggested Qty: the fixture gives site B a +500 offset, so a leak would be unmistakable',
  SC.afterLateArrival.suggested.text);

// ---------------------------------------------------------------------------------------------------
section('H. CP2X-R2 §A2 — a finished recalculation, simulated at the page\'s own callback');
// The control comes first and is what makes the experiment mean anything: BEFORE the job, revisiting
// site B costs nothing. The same revisit AFTER the job must cost a read.

eq(delta('revisit-B-before-job', GAP), 0,
  'H1  CONTROL: before the job, revisiting site B costs ZERO gap requests');
eq(phase('revisit-B-before-job').avg.text, '31.0', 'H1a and it really was site B that was revisited');
ok(!SC.recalcRefreshAbsent, 'H2  the page exposed its post-recalc refresh, so the job really was simulated');
eq(delta('job-complete', GAP), 1,
  'H3  the completion reads the CURRENT site once — not all three, not none');
eq(delta('job-complete', RECO), 0,
  'H4  and issues no recommendation request: 42_ does not read the gap table, so that cache is untouched');
eq(delta('after-job-other-site', GAP), 1,
  'H5  EXPERIMENT: after the job, the SAME revisit to site B costs a real gap read — the pre-recalc answer was dropped');
eq(phase('after-job-other-site').avg.text, '31.0', 'H5a and it is still site B being looked at');
eq(phase('after-job-other-site').diag.gap.outcome, 'READ',
  'H6  the page says it READ rather than reused, which is the same fact from the other side');

// ---------------------------------------------------------------------------------------------------
section('I. the two counters are different numbers, which is the point');

const lastGap = ((SC.phases || [])[(SC.phases || []).length - 1] || {}).diag.gap;
ok(lastGap.readerCalls > lastGap.networkReads,
  'I1  the gap reader was ENTERED more often than it reached the network', lastGap);
ok(lastGap.readerCalls >= 12, 'I2  by a wide margin', lastGap.readerCalls);
eq(lastGap.networkReads, 4,
  'I3  against four network reads: site A cold, site B cold, the recalculation, and site B again after it');
ok(/A reuse increments the first and not the second/.test(lastGap.note),
  'I4  and the reading says which is which, so neither can be quoted as the other');

// ---------------------------------------------------------------------------------------------------
section('J. CP2X-R2 §C — the paint figure is bound to its request, and is not called "visible"');

const timings = (SC.phases || []).map(p => p.diag.reco.timing).filter(Boolean);
const withPaint = timings.filter(t => typeof t.paintOpportunityMs === 'number');
ok(withPaint.length >= 2, 'J1  real Chrome produced frames, so the figure is measured and not theoretical', withPaint.length);
ok(withPaint.every(t => typeof t.forSeq === 'number'),
  'J2  and every figure names the request sequence it belongs to');
ok(withPaint.every(t => t.paintOpportunityMs >= t.domWorkMs),
  'J3  and never precedes the DOM work it follows', withPaint);
// The one that was superseded before its frames ran carries NO figure rather than someone else's.
const supersededPhase = timings.filter(t => t.responseMs !== null && t.paintOpportunityMs === null);
ok(supersededPhase.length >= 1,
  'J4  a response whose frames never ran as the current request carries NO figure at all', supersededPhase);
ok(supersededPhase.every(t => t.forSeq === null),
  'J5  and no sequence either — an unattributed number is not reported');
ok(!/visibleMs/.test(JSON.stringify(SC.phases)),
  'J6  nothing anywhere in the capture is called "visible": the page cannot observe the operator\'s screen');
ok(/opportunit/i.test(phase('siteA-first').diag.reco.note),
  'J7  and the reading names the figure a paint OPPORTUNITY');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
