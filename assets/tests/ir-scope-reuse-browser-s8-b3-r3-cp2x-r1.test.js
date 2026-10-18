// Kitchen Mama Operation System — S8-B3-R3-CP2X-R1 §B
// REUSE, DEDUP AND RE-ENTRY, COUNTED AT THE SERVER, IN REAL CHROME
//
// Run: node assets/tests/ir-scope-reuse-browser-s8-b3-r3-cp2x-r1.test.js
//
// LOCAL / OFFLINE. Reads the capture; captures nothing.
//
// WHAT THE CAPTURE IS. `_cp2s-r2-inplace-dom-runner.js --scopes` drives the real page in real Chrome
// through the real router, and brackets each scenario with a server-side mark. The request counts below
// are therefore the SERVER's, not the page's: a page that lied about its own reads could not move them.
//
// THE DISTINCTION THE ROUND ASKS FOR, and it is the reason there are two numbers per reader. A READER
// CALL is an entry into loadRecommendationWorkspace_ / loadInventoryGap_. A NETWORK REQUEST is a request
// the server actually served. Reuse and dedup are exactly the cases where the first moves and the second
// does not, and reporting only one of them makes a working cache indistinguishable from a dead page.
//
// WHAT THIS CAPTURE DOES **NOT** ESTABLISH, stated here rather than left to be assumed: the cross-SITE
// switch. Both the country axis and the marketplace axis were attempted and neither select ever offered
// the second site in this harness — the capture records `mktMoved: false` — so every phase after the
// first ran against the SAME scope. The reuse those phases show is therefore same-scope reuse, which is
// real and is what leave/return and re-entry are about, but it is NOT evidence about switching sites.
// Cross-scope reuse is established offline instead, in
// ir-scope-reuse-and-inflight-dedup-s8-b3-r3-cp2x.test.js, where the scope key is built directly.
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

const EV = JSON.parse(read('docs/evidence/cp2x-r1-scope-reuse/scope-reuse.json'));
const R = EV.result || {};
const SC = R.scopes || {};
const MARKS = EV.requestMarks || [];

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
ok(MARKS.length >= 12, 'A4  every phase is bracketed by a server-side mark', MARKS.length);

// ---------------------------------------------------------------------------------------------------
section('B. a cold scope costs one request, and the server says so');

eq(delta('siteA-first', RECO), 1, 'B1  the cold recommendation read is ONE request');
eq(phase('siteA-first').diag.answer.source, 'SERVER', 'B2  and the answer came from the server');
eq(phase('siteA-first').diag.reco.cache.outcome, 'STORED', 'B3  and was stored, so reuse is possible at all');
eq(phase('siteA-first').diag.answer.revisionComplete, true,
  'B4  with a complete revision — the real handler meta, not a markerless fixture');

// ---------------------------------------------------------------------------------------------------
section('C. leaving the page and coming back, through the real router');

eq(delta('leave-return', RECO), 0, 'C1  a real route away and back costs ZERO recommendation requests');
eq(delta('leave-return', GAP), 0, 'C2  and ZERO gap requests');
ok(!SC.lifecycleAbsent, 'C3  and it really used the router rather than skipping the scenario');

// ---------------------------------------------------------------------------------------------------
section('D. re-entry while a read is pending');

eq(delta('pending-reentry', RECO), 1,
  'D1  THREE loader calls during one flight produce ONE request');
eq(delta('pending-reentry', GAP), 0,
  'D2  and two gap loader calls produce none — the in-flight dedup this round added, in real Chrome');

// ---------------------------------------------------------------------------------------------------
section('E. the two counters are different numbers, which is the point');

const lastGap = ((SC.phases || [])[(SC.phases || []).length - 1] || {}).diag.gap;
ok(lastGap.readerCalls > lastGap.networkReads,
  'E1  the gap reader was ENTERED more often than it reached the network', lastGap);
eq(lastGap.networkReads, 1, 'E2  one network read served the whole session');
ok(lastGap.readerCalls >= 7, 'E3  against at least seven reader calls', lastGap.readerCalls);
ok(/A reuse increments the first and not the second/.test(lastGap.note),
  'E4  and the reading says which is which, so neither can be quoted as the other');

// ---------------------------------------------------------------------------------------------------
section('F. what this capture does not establish, asserted so it cannot be forgotten');

const moves = SC.moves || [];
ok(moves.length >= 2, 'F1  the site moves were attempted and recorded', moves.length);
const switched = moves.filter(m => m.result && m.result.mkt && m.result.mkt.ok === true);
const refused = moves.filter(m => m.result && m.result.mkt && m.result.mkt.ok === false);
ok(refused.length >= 1,
  'F2  at least one site switch did NOT take — the harness never offered the second site');
ok(!!SC.countryAxisNote, 'F3  and the capture carries the note saying so');
ok(/offline/.test(String(SC.countryAxisNote)),
  'F4  pointing at where the cross-scope axis IS established instead');
ok(switched.length >= 1, 'F5  while the moves that DID take are recorded as such, so F2 is not vacuous');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
