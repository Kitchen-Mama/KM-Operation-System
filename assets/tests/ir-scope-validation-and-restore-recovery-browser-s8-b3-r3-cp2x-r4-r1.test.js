// Kitchen Mama Operation System — S8-B3-R3-CP2X-R4-R1
// THE THREE BOUNDARIES CP2X-R4 LEFT OPEN: what "verified" means, what a read abandoned in flight
// leaves owing, and which mount a late callback is allowed to speak for.
//
// Run: node assets/tests/ir-scope-validation-and-restore-recovery-browser-s8-b3-r3-cp2x-r4-r1.test.js
//
// LOCAL / OFFLINE. Reads two captures; captures nothing. No production job is started and nothing is
// written: every scenario is a navigation, a selector change or a Search against an isolated fixture.
//
// TWO CAPTURES, AND THE SECOND ONE IS THE POINT. `revisit.json` is the current page.
// `counter-example-before.json` is the SAME harness run against the CP2X-R4 candidate, kept because a
// test that only ever saw the fixed code cannot say whether it would have caught anything. Every
// assertion in sections C, D and E has a companion that reads the before-capture and asserts the
// defect was really there, with the number it actually showed.
//
// WHY THE SCENARIOS LOOK THE WAY THEY DO. A <select> cannot be made to hold a value it was never
// offered - the assignment leaves it empty - so a stale marketplace_id cannot be staged by assignment.
// It is staged the way it happens: the operator picks a live site, the registry retires or drops it,
// and the page re-reads the authority without rebuilding the select. The fixture gained a seventh,
// complete site (JP/Yahoo, avg 37.0) for exactly this, and a status field it never carried.
//
// AND WHY NOT "ZERO REQUESTS". A Search over an already-loaded, scope-independent read model costs NO
// request at all, so "nothing was spent" is true of the defect as well as of the fix. What the defect
// did was PUBLISH: it moved `applied` to a retired site, to a site the registry no longer lists, and
// to a US/Japan pair nobody selected. The assertions below are about what the page published and
// which cells it showed, not about what it spent.
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

// ONE capture, two readers. The current capture is the canonical --revisit one that the CP2X-R4 suite
// also reads: the scenarios are appended phases of the same run, and keeping a second copy here would
// mean two files that have to be re-taken together and will eventually not be.
const EV = JSON.parse(read('docs/evidence/cp2x-r4-revisit/revisit.json'));
const BEFORE = JSON.parse(read('docs/evidence/cp2x-r4-r1-scope-and-recovery/counter-example-before.json'));

function phasesOf(cap) { return ((cap.result || {}).revisit || {}).phases || []; }
function phaseOf(cap, label) { return phasesOf(cap).filter(p => p.label === label)[0] || null; }
const phase = (label) => phaseOf(EV, label);
const was = (label) => phaseOf(BEFORE, label);
const MARKS = EV.requestMarks || [];

const RECO = 'recommendation.workspace.get';
const WS = 'inventoryReplenishment.workspace.get';
const REG = 'inventoryScope.registry.get';
function deltaIn(cap, fromLabel, toLabel, action) {
  const marks = cap.requestMarks || [];
  const i = marks.findIndex(m => m.label === fromLabel);
  const j = marks.findIndex(m => m.label === toLabel);
  if (i < 0 || j < 0) return null;
  return ((marks[j].hits || {})[action] || 0) - ((marks[i].hits || {})[action] || 0);
}
const delta = (label, action) => deltaIn(EV, 'begin:' + label, 'end:' + label, action);
const sinceClick = (label, action) => deltaIn(EV, 'preclick:' + label, 'end:' + label, action);

// The sites the fixture publishes, stated here rather than read back out of the capture being judged.
const SITE = {
  'US-WMT': { id: 'MP-FIXTURE-US-WMT', applied: 'us|MP-FIXTURE-US-WMT', avg: '31.0', dos: '100' },
  'EU-WMT': { id: 'MP-FIXTURE-EU-WMT', applied: 'eu|MP-FIXTURE-EU-WMT', avg: '17.0', dos: '50' },
  'JP-AMZ': { id: 'MP-FIXTURE-JP-AMZ', applied: 'jp|MP-FIXTURE-JP-AMZ', avg: '23.0', dos: '300' },
  'JP-YAH': { id: 'MP-FIXTURE-JP-YAH', applied: 'jp|MP-FIXTURE-JP-YAH', avg: '37.0' }
};

// ---------------------------------------------------------------------------------------------------
section('A. both captures are current, and they are captures');

ok(!(EV.result || {}).fatal, 'A1  the run completed without a fatal', (EV.result || {}).fatal);
ok(!(BEFORE.result || {}).fatal, 'A1a so did the counter-example run', (BEFORE.result || {}).fatal);
ok(!!EV.browser, 'A2  and names the browser', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}T/.test(String(EV.takenAt)), 'A3  and when it was taken');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A4 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
ok(Object.prototype.hasOwnProperty.call(EV.sources || {}, 'assets/js/pages/inventory-replenishment.js'),
  'A5  the page under test is one of the files it pins');
// The counter-example must be of a DIFFERENT page source, or it is not a counter-example.
ok((BEFORE.sources || {})['assets/js/pages/inventory-replenishment.js']
   !== (EV.sources || {})['assets/js/pages/inventory-replenishment.js'],
  'A6  the before-capture was taken against a DIFFERENT page source — it is evidence about the candidate, not a rerun');
ok((BEFORE.sources || {})['assets/tests/_cp2s-r2-inplace-dom-runner.js']
   === (EV.sources || {})['assets/tests/_cp2s-r2-inplace-dom-runner.js'],
  'A7  and through the SAME harness, so the two are comparable');
ok(phasesOf(EV).length >= 26, 'A8  every scenario produced a phase', phasesOf(EV).length);

// ---------------------------------------------------------------------------------------------------
section('B. the fixture can produce the three inputs §A is about');

const live = phase('R1A0-yahoo-live-then-amazon');
eq(live && live.extra && live.extra.yahoo && live.extra.yahoo.applied, SITE['JP-YAH'].applied,
  'B1  JP/Yahoo is a REAL site that can be searched while it is live');
eq(live && live.extra && live.extra.yahoo && live.extra.yahoo.avg && live.extra.yahoo.avg.text, SITE['JP-YAH'].avg,
  'B2  with its own Avg rate, so refusing it later refuses something real');
eq(live && live.appliedScopeKey, SITE['JP-AMZ'].applied,
  'B3  and the applied scope is then moved to JP/Amazon, so "did not move" is a comparison with another site');

const a1 = phase('R1A1-retired-id-refused');
eq(a1 && a1.extra && a1.extra.held && a1.extra.held.mkt, SITE['JP-YAH'].id,
  'B4  the select really is still holding the retired id at the moment Search is pressed');
ok(a1 && a1.extra && a1.extra.held && (a1.extra.held.mktOptions || []).indexOf(SITE['JP-YAH'].id) !== -1,
  'B5  because the options were NOT rebuilt — which is the whole of how a stale id survives',
  a1 && a1.extra && a1.extra.held && a1.extra.held.mktOptions);
ok(a1 && a1.extra && a1.extra.reRead && (a1.extra.reRead.activeIds || []).indexOf(SITE['JP-YAH'].id) === -1,
  'B6  while the re-read authority no longer offers it', a1 && a1.extra && a1.extra.reRead);

// ---------------------------------------------------------------------------------------------------
section('C. §A — a LOADED authority that contradicts the selection is a NAMED refusal');

eq(a1 && a1.extra && a1.extra.refusal && a1.extra.refusal.code, 'MARKETPLACE_INACTIVE',
  'C1  a RETIRED id is refused, and it is named as retired');
eq(a1 && a1.extra && a1.extra.refusal && a1.extra.refusal.marketplaceStatus, 'inactive',
  'C1a and the status that caused it is recorded, not inferred');
eq(a1 && a1.extra && a1.extra.afterApplied, SITE['JP-AMZ'].applied,
  'C2  the applied scope did not move to the retired site');
eq(a1 && a1.avg && a1.avg.text, SITE['JP-AMZ'].avg, 'C3  and the JP/Amazon result is still the one on screen');
eq(sinceClick('R1A1-retired-id-refused', WS), 0, 'C4  the refused Search issued no workspace read');
eq(sinceClick('R1A1-retired-id-refused', RECO), 0, 'C4a nor a recommendation read');

const a2 = phase('R1A2-removed-id-refused');
eq(a2 && a2.extra && a2.extra.refusal && a2.extra.refusal.code, 'MARKETPLACE_NOT_IN_REGISTRY',
  'C5  an id the registry no longer lists is refused — and named DIFFERENTLY from a retired one');
eq(a2 && a2.extra && a2.extra.afterApplied, SITE['JP-AMZ'].applied, 'C6  applied did not move to it either');
eq(a2 && a2.avg && a2.avg.text, SITE['JP-AMZ'].avg, 'C7  and the screen still shows JP/Amazon');
eq(sinceClick('R1A2-removed-id-refused', WS), 0, 'C8  no request from the refused Search');

// THE COUNTER-EXAMPLE. Both of these went through on the candidate.
const b1 = was('R1A1-retired-id-refused'), b2 = was('R1A2-removed-id-refused');
eq(b1 && b1.extra && b1.extra.refusal, null, 'C9  BEFORE: the retired site produced no refusal at all');
eq(b1 && b1.extra && b1.extra.afterApplied, SITE['JP-YAH'].applied,
  'C10 BEFORE: and the page PUBLISHED the retired site as the applied scope');
eq(b2 && b2.extra && b2.extra.refusal, null, 'C11 BEFORE: nor did the removed site');
eq(b2 && b2.extra && b2.extra.afterApplied, 'jp|MP-FIXTURE-JP-RAK',
  'C12 BEFORE: it was published too');
eq(b2 && b2.status, 'EMPTY', 'C13 BEFORE: and the operator was shown an EMPTY table for a site that was merely gone');
eq(b2 && b2.rows, 0, 'C13a with no rows at all', b2 && b2.rows);

// ---------------------------------------------------------------------------------------------------
section('D. §A — UNVERIFIED is not a verdict: load the source, then decide');

const a3 = phase('R1A3-unverified-illegal-pair');
eq(a3 && a3.extra && a3.extra.dropped && a3.extra.dropped.activeListLength, 0,
  'D1  the authority really was unavailable when Search was pressed');
eq(a3 && a3.extra && a3.extra.pair && a3.extra.pair.country, 'US', 'D2  and the pair on screen was US …');
eq(a3 && a3.extra && a3.extra.pair && a3.extra.pair.mkt, 'MP-FIXTURE-JP-RAK', 'D2a … with a JAPANESE marketplace id');
eq(a3 && a3.extra && a3.extra.refusal && a3.extra.refusal.code, 'MARKETPLACE_COUNTRY_MISMATCH',
  'D3  after loading the source the pair is INVALID, and is refused for the right reason');
eq(a3 && a3.extra && a3.extra.afterApplied, SITE['JP-AMZ'].applied,
  'D4  nothing was applied in between — the previous result is untouched');
eq(a3 && a3.avg && a3.avg.text, SITE['JP-AMZ'].avg, 'D5  and the cells are still JP/Amazon');
eq(delta('R1A3-unverified-illegal-pair', WS), 0, 'D6  and no inventory read was spent finding that out');

// THE OTHER HALF: cannot-verify must not become refuse-everything.
const a4 = phase('R1A4-unverified-legal-pair');
eq(a4 && a4.extra && a4.extra.dropped && a4.extra.dropped.activeListLength, 0,
  'D7  the authority was equally unavailable for a pair that is genuinely good');
eq(a4 && a4.extra && a4.extra.refusal, null, 'D8  and it was NOT refused');
eq(a4 && a4.extra && a4.extra.afterApplied, SITE['EU-WMT'].applied, 'D9  it loaded, re-validated and APPLIED');
eq(a4 && a4.avg && a4.avg.text, SITE['EU-WMT'].avg, 'D10 with EU/Walmart numbers, not another site’s');
eq(a4 && a4.dos && a4.dos.text, SITE['EU-WMT'].dos, 'D10a and its own Days of Supply');

const b3 = was('R1A3-unverified-illegal-pair');
eq(b3 && b3.extra && b3.extra.refusal, null, 'D11 BEFORE: the illegal pair produced no refusal');
eq(b3 && b3.extra && b3.extra.afterApplied, 'us|MP-FIXTURE-JP-RAK',
  'D12 BEFORE: it was committed as applied — a country on screen and a marketplace from another one');
const b4 = was('R1A4-unverified-legal-pair');
eq(b4 && b4.extra && b4.extra.afterApplied, SITE['EU-WMT'].applied,
  'D13 BEFORE: the legal pair also applied, so the fix did not buy D9 by refusing more');

// ---------------------------------------------------------------------------------------------------
section('E. §B — a read abandoned IN FLIGHT recovers without a second Search');

const e1 = phase('R1B1-cold-inflight-leave-return');
eq(e1 && e1.extra && e1.extra.mid && e1.extra.mid.recoStatus && e1.extra.mid.recoStatus.status, 'LOADING',
  'E1  the recommendation read was genuinely still in flight when the operator left');
eq(e1 && e1.extra && e1.extra.mid && e1.extra.mid.recoStatus && e1.extra.mid.recoStatus.loadedOk, false,
  'E1a with nothing settled to fall back on');
eq(e1 && e1.extra && e1.extra.mid && e1.extra.mid.avg && e1.extra.mid.avg.text, '…',
  'E1b and the cell said so rather than showing a number');
// The SERVER's view of the same moment: the request had not been answered when the page was torn down.
const heldReco = (EV.actionLog || []).filter(x => x.action === RECO && (x.respondedAt - x.t) > 3000);
ok(heldReco.length >= 1, 'E2  the fixture really held that answer back (server-side)', heldReco.length);
eq(e1 && e1.extra && e1.extra.afterLeave && e1.extra.afterLeave.opsActive, false,
  'E3  and the page was genuinely unmounted while it was outstanding');
eq(e1 && e1.extra && e1.extra.searchPressedAfterReturn, false, 'E4  no Search was pressed after the return');
eq(e1 && e1.avg && e1.avg.text, SITE['US-WMT'].avg, 'E5  and Avg Sales came back by itself');
eq(e1 && e1.dos && e1.dos.text, SITE['US-WMT'].dos, 'E5a so did Days of Supply');
eq(e1 && e1.recoStatus, 'READY', 'E6  the read state recovered to READY, not to a permanent DISABLED');
eq(e1 && e1.bootstrap && e1.bootstrap.reco_recovery, 'REREAD_ISSUED',
  'E7  and the capture says what that cost: one re-read, named');
eq(delta('R1B1-cold-inflight-leave-return', RECO), 2,
  'E8  which is exactly two recommendation reads in the phase — the abandoned one and the recovery');

// THE WARM HALF IS STILL FREE.
const e2 = phase('R1B2-warm-cache-zero-reads');
eq(e2 && e2.bootstrap && e2.bootstrap.reco_recovery, 'ALREADY_SETTLED',
  'E9  a settled result for the scope on screen is recognised as costing nothing');
eq(delta('R1B2-warm-cache-zero-reads', RECO), 0, 'E10 and the leave/return spends ZERO recommendation reads');
eq(e2 && e2.avg && e2.avg.text, SITE['US-WMT'].avg, 'E11 with the numbers unchanged');

const be1 = was('R1B1-cold-inflight-leave-return');
eq(be1 && be1.avg && be1.avg.text, '--', 'E12 BEFORE: Avg Sales was a dash after the return');
eq(be1 && be1.dos && be1.dos.text, '--', 'E12a BEFORE: so was Days of Supply');
eq(be1 && be1.recoStatus, 'DISABLED', 'E13 BEFORE: and the read state stayed DISABLED');
eq(deltaIn(BEFORE, 'begin:R1B1-cold-inflight-leave-return', 'end:R1B1-cold-inflight-leave-return', RECO), 1,
  'E14 BEFORE: nothing re-read it — one request, the abandoned one, and no recovery');
const bw = was('R1B1b-search-after-dashes');
eq(bw && bw.avg && bw.avg.text, SITE['US-WMT'].avg,
  'E15 BEFORE: and only a second Search for an unchanged scope brought it back — the cost of the defect');

// ---------------------------------------------------------------------------------------------------
section('F. §B — a late answer, success or failure, never replaces the current result');

const f1 = phase('R1B3-late-success-after-switch');
eq(f1 && f1.extra && f1.extra.afterJp && f1.extra.afterJp.applied, SITE['JP-AMZ'].applied,
  'F1  the operator ended on JP/Amazon after leaving an EU read in flight');
eq(f1 && f1.appliedScopeKey, SITE['JP-AMZ'].applied, 'F2  and the two held EU answers did not move it');
eq(f1 && f1.avg && f1.avg.text, SITE['JP-AMZ'].avg, 'F3  the Avg cell is JP/Amazon’s, not EU/Amazon’s');

const f2 = phase('R1B4-late-failure-after-recovery');
eq(f2 && f2.extra && f2.extra.afterRecovery && f2.extra.afterRecovery.recoStatus
   && f2.extra.afterRecovery.recoStatus.status, 'READY',
  'F4  the recovery read succeeded before the abandoned one failed');
eq(f2 && f2.extra && f2.extra.afterRecovery && f2.extra.afterRecovery.avg
   && f2.extra.afterRecovery.avg.text, SITE['EU-WMT'].avg, 'F4a with EU/Walmart numbers');
eq(f2 && f2.recoStatus, 'READY', 'F5  and the LATE FAILURE did not turn a good screen into an error one');
eq(f2 && f2.avg && f2.avg.text, SITE['EU-WMT'].avg, 'F6  the cells are unchanged by it');

const bf2 = was('R1B4-late-failure-after-recovery');
eq(bf2 && bf2.avg && bf2.avg.text, '--', 'F7  BEFORE: there was no recovery for the failure to arrive after');

// ---------------------------------------------------------------------------------------------------
section('G. §C — a callback may only finish its OWN record, and may not draw a page it has left');

const g1 = phase('R1C1-remount-generation-isolation');
const gA = g1 && g1.extra && g1.extra.afterA, gB = g1 && g1.extra && g1.extra.afterB, gL = g1 && g1.extra && g1.extra.afterLate;
eq(gA && gA.mode, 'RESTORED', 'G1  mount A took the branch that revalidates');
eq(gA && gA.revalidating, true, 'G1a and its revalidation was still outstanding');
eq(gB && gB.mode, 'REGISTRY_ONLY', 'G2  mount B took a branch that performs NO revalidation');
eq(gB && gB.revalidated, false, 'G2a so its record says it did not revalidate');
ok(gB && gA && gB.mount_generation > gA.mount_generation,
  'G3  and the generation advanced between the two mounts', [gA && gA.mount_generation, gB && gB.mount_generation]);
eq(gL && gL.mode, 'REGISTRY_ONLY', 'G4  after A’s held answer lands, the record is still B’s');
eq(gL && gL.revalidated, false, 'G5  and it still says it did not revalidate — A wrote nothing into it');
eq(gL && gL.revalidating, false, 'G5a nor is anything reported as still running');
// CP2X-R4-R2 — A DELTA, NOT A RUNNING TOTAL. `stray_callbacks` counts every late callback in the whole
// session, and the C4 rapid-switching phase earlier in the run produces them or does not depending on
// how the machine happened to schedule two navigations - measured at 0 in one capture and 2 in the
// next, with the same page source. Pinning the total made this assertion a statement about the whole
// run; what the scenario is about is the ONE dead attempt in THIS interleave.
eq((gL && gL.stray_callbacks) - (gB && gB.stray_callbacks), 1,
  'G6  the dead attempt is COUNTED as having stood down, not silently dropped',
  [gB && gB.stray_callbacks, gL && gL.stray_callbacks]);
eq(g1 && g1.extra && g1.extra.rendersByLateCallback, 0, 'G7  and it drove no repaint of the live page');

const bg1 = was('R1C1-remount-generation-isolation');
const bgL = bg1 && bg1.extra && bg1.extra.afterLate;
eq(bgL && bgL.mode, 'REGISTRY_ONLY', 'G8  BEFORE: the same second mount');
eq(bgL && bgL.revalidated, true,
  'G9  BEFORE: and it reported that it REVALIDATED — a mode that cannot revalidate, saying it did');
eq(bg1 && bg1.extra && bg1.extra.rendersByLateCallback, 1,
  'G10 BEFORE: the dead attempt also drove a repaint');
eq(bgL && bgL.stray_callbacks, 'ABSENT', 'G11 BEFORE: and nothing recorded that any of this had happened');

const g2 = phase('R1C2-late-answer-while-unmounted');
const wa = g2 && g2.extra && g2.extra.whileAway;
eq(wa && wa.opsActive, false, 'G12 the page was genuinely not mounted when the answer landed');
eq(g2 && g2.extra && g2.extra.rendersWhileUnmounted, 0, 'G13 and nothing was repainted while it was away');
eq(wa && wa.revalidate_superseded, 'MOUNT_SUPERSEDED', 'G14 the attempt recorded WHY it stood down');
eq(wa && wa.revalidated, false, 'G15 and did not claim the round as revalidated');
ok(wa && wa.record_mount_generation < wa.mount_generation,
  'G16 the record names a generation that is over', [wa && wa.record_mount_generation, wa && wa.mount_generation]);

const bg2 = was('R1C2-late-answer-while-unmounted');
eq(bg2 && bg2.extra && bg2.extra.rendersWhileUnmounted, 1,
  'G17 BEFORE: the unmounted page was repainted by the answer');
eq(bg2 && bg2.extra && bg2.extra.whileAway && bg2.extra.whileAway.revalidated, true,
  'G18 BEFORE: and the dead round was recorded as the one that revalidated');

// ---------------------------------------------------------------------------------------------------
section('H. the guards this round must not have relaxed');

const src = read('assets/js/pages/inventory-replenishment.js');
ok(/IR_SCOPE_CHECK_\s*=\s*\{\s*VALID[\s\S]{0,120}UNVERIFIED[\s\S]{0,120}INVALID/.test(src),
  'H1  the three states exist as one named vocabulary, not as scattered booleans');
ok(/state:\s*IR_SCOPE_CHECK_\.UNVERIFIED/.test(src), 'H2  UNVERIFIED is returned, never folded into ok:true');
// CP2X-R4-R2 — BOUND TO THE SHAPE, NOT TO A CHARACTER COUNT. The previous form was a fixed 2,000-
// character window after the UNVERIFIED branch; growing that branch would have moved the loader out of
// range and reported a missing caller that is in fact right there.
ok(/Promise\.resolve\(_irEnsureRegistryLoaded_\(\)\)\.then\(function \(\) \{\s*_finishVerify\(_irValidateScopeSelection_\(vrec\.pending\)\);/.test(src),
  'H3  and the caller answers it by LOADING the source it already owns, then re-checking the CLICKED pair');
ok(!/state:\s*IR_SCOPE_CHECK_\.UNVERIFIED[\s\S]{0,200}ok:\s*true/.test(src),
  'H4  an UNVERIFIED result is never also ok:true — there is no path that treats it as a pass');
ok(/_irResultMatchesAppliedScope_\(st\)/.test(src),
  'H5  the recovery asks the CROSS-SCOPE guard whether a result counts, not merely whether one exists');
ok(/rec !== _irBootstrap \|\| rec\.mountGen !== _irMountGen/.test(src),
  'H6  a revalidation callback checks BOTH that its record is still current and that its mount is');
ok(/_irMountGen\+\+/.test(src), 'H7  and the generation really advances');
ok(/rec\.revalidating = false;[\s\S]{0,400}if \(qSeq !== _irSearch\.seq\)/.test(src),
  'H8  the CP2X-R4 §D fix is intact: a superseded revalidation still ends its own state first');
ok(/_irRecoCancelInFlight_[\s\S]{0,400}if \(!_irRecoState \|\| !_irRecoState\.loadedOk\)/.test(src),
  'H9  the CP2X-R4 §B fix is intact: a SETTLED result is still kept across an unmount');

// ---------------------------------------------------------------------------------------------------
section('I. WHAT THESE CAPTURES DO NOT CLAIM');

ok(true, 'I1  the fixture is a local stub: these are REQUEST COUNTS and CELL VALUES, not production timings');
ok(true, 'I2  no production recalculation job was started — no job is involved in any phase here');
ok(true, 'I3  _irAdaptScopeRegistry_ hard-codes status active, so while the REGISTRY is the only authority in '
  + 'hand a retired record cannot be seen as retired. The workspace model carries the real status and is what '
  + 'is in hand after any Search, which is where a stale selection comes from. Unchanged by this round.');
ok(true, 'I4  the country axis is the FIXTURE registry (US/EU/JP + a retirable JP/Yahoo); production offers its own');

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
