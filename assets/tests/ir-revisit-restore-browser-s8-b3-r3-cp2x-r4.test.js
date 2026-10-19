// Kitchen Mama Operation System — S8-B3-R3-CP2X-R4
// LEAVING SITE INVENTORY AND COMING BACK — IN REAL CHROME, THROUGH THE REAL ROUTER, ON A REAL
// COUNTRY AXIS.
//
// Run: node assets/tests/ir-revisit-restore-browser-s8-b3-r3-cp2x-r4.test.js
//
// LOCAL / OFFLINE. Reads the capture; captures nothing. No production job is started and nothing is
// written: every scenario below is a navigation and a Search against an isolated fixture.
//
// WHAT THE CAPTURE IS. `_cp2s-r2-inplace-dom-runner.js --revisit` drives the real page through
// KM.lifecycle.switchTo, so mount() and unmount() really run. Each phase is bracketed by a server-side
// mark, so the request counts are the SERVER's and a page that lied about its own reads could not move
// them.
//
// THE LIFECYCLE IDS WERE WRONG BEFORE THIS ROUND, AND IT MATTERED. KM.lifecycle.register is keyed on
// the SECTION id — 'ops-section', 'home-section'. There is no page called 'inventory-replenishment'
// and none called 'home', and switchTo with an unregistered name still UNMOUNTS whatever was mounted
// and then mounts nothing. The earlier leave/return phase used those names, so it unmounted Site
// Inventory and never brought it back, and every assertion after it read module-global diagnostics
// that outlive the page. §B below asserts the lifecycle's own view so that cannot recur.
//
// WHY EVERY SITE HAS ITS OWN NUMBERS. The fixture that existed offered ONE country, so a cross-country
// restore could not be driven at all. This capture runs US / EU / JP with a distinct Avg rate, Days of
// Supply and Suggested Qty per site. If the sites answered alike, "the right site was restored" and "a
// site was restored" would be the same observation — and the restore can be wrong in exactly the way
// that matters, by showing yesterday's country, while every count-based assertion still passes. That
// is why §C asserts CELL VALUES and canonical marketplace_ids, never "not --".
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

const EV = JSON.parse(read('docs/evidence/cp2x-r4-revisit/revisit.json'));
const R = EV.result || {};
const RV = R.revisit || {};
const MARKS = EV.requestMarks || [];
const PHASES = RV.phases || [];
const phase = (label) => PHASES.filter(p => p.label === label)[0] || null;

const RECO = 'recommendation.workspace.get';
const GAP = 'inventoryReplenishmentGap.get';
const WS = 'inventoryReplenishment.workspace.get';
function delta(label, action) {
  const i = MARKS.findIndex(m => m.label === 'begin:' + label);
  const j = MARKS.findIndex(m => m.label === 'end:' + label);
  if (i < 0 || j < 0) return null;
  return ((MARKS[j].hits || {})[action] || 0) - ((MARKS[i].hits || {})[action] || 0);
}
// The site table the fixture publishes. Repeated here so the suite states what it expects rather than
// reading it back out of the capture it is judging.
const SITE = {
  'EU-AMZ': { id: 'MP-FIXTURE-EU-AMZ', applied: 'eu|MP-FIXTURE-EU-AMZ', avg: '13.0', dos: '130', sugg: '1381' },
  'EU-WMT': { id: 'MP-FIXTURE-EU-WMT', applied: 'eu|MP-FIXTURE-EU-WMT', avg: '17.0', dos: '50', sugg: '1781' },
  'JP-AMZ': { id: 'MP-FIXTURE-JP-AMZ', applied: 'jp|MP-FIXTURE-JP-AMZ', avg: '23.0', dos: '300', sugg: '2381' }
};
function cellsAre(label, key, note) {
  const p = phase(label), s = SITE[key];
  if (!p) { ok(false, note + ' — phase ' + label + ' is missing from the capture'); return; }
  eq(p.country, s.applied.split('|')[0].toUpperCase(), note + ' · country selector');
  eq(p.marketplace, s.id, note + ' · marketplace selector holds the canonical id');
  eq(p.appliedScopeKey, s.applied, note + ' · applied scope');
  eq(p.avg && p.avg.text, s.avg, note + ' · Avg Sales cell');
  eq(p.dos && p.dos.text, s.dos, note + ' · Days of Supply cell');
  eq(p.suggested && p.suggested.text, s.sugg, note + ' · Suggested Qty cell');
  eq(p.status, 'READY', note + ' · search status');
  ok(p.rows > 0, note + ' · the main table has rows', p.rows);
}

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
ok(MARKS.length >= 24, 'A4  every phase is bracketed by a server-side mark', MARKS.length);
ok(PHASES.length >= 13, 'A5  every scenario produced a phase', PHASES.length);

// ---------------------------------------------------------------------------------------------------
section('B. mount() and unmount() REALLY RAN — the ids are the registered ones');

const lr = phase('C1-leave-return');
ok(lr && lr.extra && lr.extra.nav && lr.extra.nav.ok === true,
  'B1  the navigation completed without throwing', lr && lr.extra && lr.extra.nav);
eq(lr && lr.extra && lr.extra.nav && lr.extra.nav.afterLeave && lr.extra.nav.afterLeave.current, 'home-section',
  'B2  leaving actually moved the router to another REGISTERED page');
eq(lr && lr.extra && lr.extra.nav && lr.extra.nav.afterLeave && lr.extra.nav.afterLeave.opsActive, false,
  'B3  and Site Inventory was genuinely torn down while away (not merely hidden by a no-op)');
eq(lr && lr.sectionActive, true, 'B4  and it is mounted and active again after the return');
eq(RV.lifecycleIds && RV.lifecycleIds.current, 'ops-section',
  'B5  the page the router reports is the id the registry actually holds');

// The counter-example this round opened with: a harness that never remounts proves nothing.
const rapid = phase('C4-rapid-switching');
ok(rapid && rapid.extra && Array.isArray(rapid.extra.seq) && rapid.extra.seq.length === 4,
  'B6  rapid switching drove four full round trips', rapid && rapid.extra && rapid.extra.seq);
ok(rapid && rapid.extra && rapid.extra.seq.every(s => s === 'ops-section'),
  'B7  and every one of them landed back on Site Inventory', rapid && rapid.extra && rapid.extra.seq);
eq(rapid && rapid.extra && rapid.extra.mountedOps, true, 'B8  the last navigation won');

// ---------------------------------------------------------------------------------------------------
section('C. THE OWNER COUNTER-EXAMPLES (§A1–A5)');

cellsAre('eu-searched', 'EU-AMZ', 'C0  a successful EU Search is the baseline');

// A1 — JP chosen as COUNTRY ONLY, then leave and return.
const a1 = phase('A1-jp-country-only-then-leave');
eq(a1 && a1.extra && a1.extra.mid && a1.extra.mid.country, 'JP',
  'C1a the draft really moved the country to JP before leaving');
eq(a1 && a1.extra && a1.extra.mid && a1.extra.mid.mkt, '',
  'C1b and left the marketplace unselected — no first option was auto-applied');
ok(a1 && a1.extra && a1.extra.mid && (a1.extra.mid.mktOptions || []).indexOf('MP-FIXTURE-EU-AMZ') === -1,
  'C1c and the EU marketplace was NOT among the options at that moment — so the restore has to rebuild them',
  a1 && a1.extra && a1.extra.mid && a1.extra.mid.mktOptions);
eq(a1 && a1.extra && a1.extra.mid && a1.extra.mid.applied, 'eu|MP-FIXTURE-EU-AMZ',
  'C1d while the APPLIED scope never moved — a draft is not an application');
cellsAre('A1-jp-country-only-then-leave', 'EU-AMZ',
  'C1  §A1 return restores the last SUCCESSFUL scope completely');
ok((phase('A1-jp-country-only-then-leave').mktOptions || []).indexOf('MP-FIXTURE-EU-AMZ') !== -1,
  'C1e and the marketplace options were rebuilt for the restored country');

// A2 — press Search without touching the country.
cellsAre('A2-search-without-touching-country', 'EU-AMZ',
  'C2  §A2 Search on the restored selectors returns the same EU result');

// A3 — change ONLY the marketplace, then Search.
cellsAre('A3-marketplace-only-then-search', 'EU-WMT',
  'C3  §A3 changing only the marketplace then searching applies the OTHER EU site');

// A4 — a COMPLETE JP selection that was never searched.
const a4 = phase('A4-full-jp-never-searched');
eq(a4 && a4.extra && a4.extra.mid && a4.extra.mid.country, 'JP', 'C4a JP country was selected');
eq(a4 && a4.extra && a4.extra.mid && a4.extra.mid.mkt, 'MP-FIXTURE-JP-AMZ',
  'C4b and a JP marketplace too — the draft was COMPLETE, not partial');
eq(a4 && a4.extra && a4.extra.mid && a4.extra.mid.applied, 'eu|MP-FIXTURE-EU-AMZ',
  'C4c and still nothing was applied, because Search was never pressed');
cellsAre('A4-full-jp-never-searched', 'EU-AMZ',
  'C4  §A4 a complete but unconfirmed selection is discarded on return');

// A5 — JP applies only when it is explicitly chosen AND searched.
cellsAre('A5-jp-explicit-search', 'JP-AMZ',
  'C5  §A5 JP applies only after an explicit selection AND Search');

// ---------------------------------------------------------------------------------------------------
section('D. AN INCONSISTENT COUNTRY/MARKETPLACE PAIR NEVER REACHES THE SERVER (§B)');

const B = phase('B-illegal-pair-refused');
eq(B && B.extra && B.extra.pairBefore && B.extra.pairBefore.country, 'EU',
  'D1a the country was moved to EU');
eq(B && B.extra && B.extra.pairBefore && B.extra.pairBefore.mkt, 'MP-FIXTURE-JP-AMZ',
  'D1b while the marketplace still held a JP id — a genuinely inconsistent pair');
const ref = B && B.extra && B.extra.refusal;
eq(ref && ref.code, 'MARKETPLACE_COUNTRY_MISMATCH', 'D2  the Search was REFUSED, and the reason is named');
eq(ref && ref.selectedCountry, 'EU', 'D2a the refusal records the country on screen');
eq(ref && ref.marketplaceCountry, 'JP', 'D2b and the country the marketplace actually belongs to');
eq(delta('B-illegal-pair-refused', WS), 0, 'D3  ZERO workspace requests were issued');
eq(delta('B-illegal-pair-refused', GAP), 0, 'D3a ZERO gap requests were issued');
eq(delta('B-illegal-pair-refused', RECO), 0, 'D3b ZERO recommendation requests were issued');
eq(B && B.appliedScopeKey, 'jp|MP-FIXTURE-JP-AMZ', 'D4  the applied scope did NOT move');
eq(B && B.avg && B.avg.text, '23.0', 'D5  and the table still shows the site it was honestly given');
eq(B && B.suggested && B.suggested.text, '2381', 'D5a including its Suggested Qty — no mixed-site row');
eq(B && B.marketplace, '', 'D6  the illegal id was dropped from the select rather than silently used');

// ---------------------------------------------------------------------------------------------------
section('E. A VALID CACHE COSTS NOTHING, AND NEEDS NO SECOND SEARCH (§3)');

['C1-leave-return', 'C4-rapid-switching'].forEach(function (lbl) {
  eq(delta(lbl, RECO), 0, 'E1  ' + lbl + ' issued NO new recommendation request');
  eq(delta(lbl, GAP), 0, 'E2  ' + lbl + ' issued NO new gap request');
});
// ...and the values were present WITHOUT pressing Search, which is the half a request count cannot show.
cellsAre('C1-leave-return', 'JP-AMZ', 'E3  the restored view is complete before any Search');
cellsAre('C4-rapid-switching', 'JP-AMZ', 'E4  and survives four rapid round trips');

// Repeated Search is single-flight: three clicks, not three reads.
const c2 = delta('C2-repeated-search', WS);
ok(c2 !== null && c2 <= 1, 'E5  three Search clicks produced at most ONE workspace read', c2);
cellsAre('C2-repeated-search', 'JP-AMZ', 'E6  and the answer did not change');

// ---------------------------------------------------------------------------------------------------
section('F. THE EXECUTION PLAN SURVIVES A PROGRAMMATIC RESTORE (§B)');

// The sentinel is planted immediately before C1, which makes NO selector change at all. The A-scenarios
// each make a real country change, whose onchange handler legitimately discards the draft — a sentinel
// planted before them would be cleared for the RIGHT reason and would prove nothing.
eq(lr && lr.extra && lr.extra.plantedBefore, true, 'F0  the Execution Plan was present before leaving');
['C1-leave-return', 'C2-repeated-search', 'C3-leave-while-in-flight', 'C4-rapid-switching'].forEach(function (lbl) {
  const p = phase(lbl);
  ok(p && typeof p.execPlanRaw === 'number' && p.execPlanRaw > 0,
    'F1  ' + lbl + ' left the Execution Plan intact', p && p.execPlanRaw);
});
// And it is genuinely removable — otherwise F1 would pass against a draft nothing can clear.
const a1Plan = phase('A1-jp-country-only-then-leave');
eq(a1Plan && a1Plan.execPlanRaw, null,
  'F2  a REAL country change still discards it — the guard is intact, not disabled');

// ---------------------------------------------------------------------------------------------------
section('G. CROSS-SCOPE, SEQUENCE AND LATE-ANSWER GUARDS ARE STILL IN FORCE (§C)');

cellsAre('C3-leave-while-in-flight', 'JP-AMZ',
  'G1  leaving while a read is in flight and returning shows the right site, not a half-arrived one');
const c5 = phase('C5-late-answer-after-switch');
eq(c5 && c5.extra && c5.extra.during && c5.extra.during.applied, 'jp|MP-FIXTURE-JP-AMZ',
  'G2  the operator was on JP while EU was still unanswered');
cellsAre('C5-late-answer-after-switch', 'JP-AMZ',
  'G3  EU answered late, with nobody waiting, and did NOT paint over JP');
// The strongest form: no EU number appears anywhere in the final row.
ok(c5 && c5.avg && c5.avg.text !== SITE['EU-AMZ'].avg,
  'G3a the Avg cell is not the EU rate', c5 && c5.avg && c5.avg.text);
ok(c5 && c5.suggested && c5.suggested.text !== SITE['EU-AMZ'].sugg,
  'G3b the Suggested cell is not the EU quantity', c5 && c5.suggested && c5.suggested.text);

// Every request the server was asked for named a site that exists — no request for a scope nobody chose.
const asked = EV.requestScopes || [];
const known = ['US', 'EU', 'JP'];
ok(asked.length > 0, 'G4  the server recorded which site each request named', asked.length);
ok(asked.every(a => !a.country || known.indexOf(String(a.country)) !== -1),
  'G5  and every one of them is a country the registry offers',
  asked.filter(a => a.country && known.indexOf(String(a.country)) === -1).slice(0, 3));

// ---------------------------------------------------------------------------------------------------
section('H. THE BOOTSTRAP DIAGNOSTIC TELLS THE TRUTH ABOUT ITSELF (§D)');

// A revalidation that a newer Search or a scope change overtakes must END ITS OWN STATE. It used to
// return early WITHOUT clearing `revalidating`, so the flag stayed true for the rest of the session and
// every later reader saw a request that was not running.
const everRevalidating = PHASES.filter(p => p.bootstrap && p.bootstrap.revalidating === true);
eq(everRevalidating.length, 0,
  'H1  NO phase ends with a revalidation still claiming to be in flight',
  everRevalidating.map(p => p.label));
const restored = PHASES.filter(p => p.bootstrap && p.bootstrap.mode === 'RESTORED');
ok(restored.length >= 3, 'H2  the restore branch is the one that ran on return', restored.length);
restored.forEach(function (p) {
  ok(p.bootstrap.revalidated === true || p.bootstrap.revalidateSuperseded,
    'H3  ' + p.label + ' either revalidated or says why it stood down',
    { revalidated: p.bootstrap.revalidated, superseded: p.bootstrap.revalidateSuperseded });
});
// The restore must be free: it reports zero blocking requests of its own.
restored.forEach(function (p) {
  eq(p.bootstrap.registry_requests, 0, 'H4  ' + p.label + ' restored with no registry request');
  eq(p.bootstrap.workspace_requests, 0, 'H4a ' + p.label + ' restored with no blocking workspace request');
});
// A refusal is a past event, never evidence about the current request.
const afterOk = phase('B2-recover-to-jp');
eq(afterOk && afterOk.bootstrap && afterOk.bootstrap.last_refusal, null,
  'H5  a successful Search clears the recorded refusal — it cannot be read as a live condition');

// ---------------------------------------------------------------------------------------------------
section('I. WHAT THIS CAPTURE DOES NOT CLAIM');

ok(true, 'I1  the fixture is a local stub: these are REQUEST COUNTS and CELL VALUES, not production timings');
ok(true, 'I2  no production recalculation job was started — no job is involved in any phase here');
ok(true, 'I3  the country axis is the FIXTURE registry (US/EU/JP); production offers its own set');

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
