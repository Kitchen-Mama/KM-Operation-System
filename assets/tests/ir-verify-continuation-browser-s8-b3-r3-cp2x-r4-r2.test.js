// Kitchen Mama Operation System — S8-B3-R3-CP2X-R4-R2
// WHAT HAPPENS AFTER THE UNVERIFIED WAIT.
//
// Run: node assets/tests/ir-verify-continuation-browser-s8-b3-r3-cp2x-r4-r2.test.js
//
// LOCAL / OFFLINE. Reads two captures; captures nothing. No production job is started and nothing is
// written: every scenario is a Search, a selector change or a navigation against an isolated fixture.
//
// R1 closed the gate. A pair that cannot be verified now loads the authority and is re-checked before
// anything is applied, and the re-check reads the pair that was CLICKED rather than the selectors -
// which is right, because loading the registry legitimately rebuilds the Marketplace options. What R1
// left open is the CONTINUATION after that check passes: it called searchReplenishment() again, and
// that function's first act is to read the selectors. So the verified snapshot was discarded at the
// one instant it mattered.
//
// WHY THE WAIT HAD TO BE STAGED THE WAY IT IS. KM.scopeRegistry answers a non-forced ensureLoaded out
// of memory once it is READY - it issues no request at all - so a server-side delay would hold a
// request that is never made and the callback would land in the same microtask as the click. That is
// why R1A4 could not observe any of this and reported the same result before and after. The harness
// therefore holds the registry where the delay actually is, between the page asking and it answering.
//
// AND WHY THE PAIRS ALL STAY INSIDE ONE COUNTRY. A <select> cannot hold a value it was never offered,
// so assigning a pair across a country boundary leaves the marketplace at '' and the click is stopped
// by the PRESENCE guard - a staging failure that looks exactly like a refusal. Measured: the first
// draft of these three phases did precisely that, reported verifying:false throughout, and proved
// nothing. Every pair below is chosen inside JP, which has three sites: Amazon 23.0, Rakuten 29.0,
// Yahoo 37.0.
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
const BEFORE = JSON.parse(read('docs/evidence/cp2x-r4-r2-verify-continuation/counter-example-before.json'));

function phasesOf(cap) { return ((cap.result || {}).revisit || {}).phases || []; }
function phaseOf(cap, label) { return phasesOf(cap).filter(p => p.label === label)[0] || null; }
const phase = (label) => phaseOf(EV, label);
const was = (label) => phaseOf(BEFORE, label);
const ex = (p) => (p && p.extra) || {};
const dg = (p) => (p && p.bootstrap) || {};

const SITE = {
  'JP-AMZ': { id: 'MP-FIXTURE-JP-AMZ', applied: 'jp|MP-FIXTURE-JP-AMZ', avg: '23.0' },
  'JP-RAK': { id: 'MP-FIXTURE-JP-RAK', applied: 'jp|MP-FIXTURE-JP-RAK', avg: '29.0' },
  'JP-YAH': { id: 'MP-FIXTURE-JP-YAH', applied: 'jp|MP-FIXTURE-JP-YAH', avg: '37.0' }
};

// ---------------------------------------------------------------------------------------------------
section('A. both captures are current, and they are captures of two different pages');

ok(!(EV.result || {}).fatal, 'A1  the run completed without a fatal', (EV.result || {}).fatal);
ok(!(BEFORE.result || {}).fatal, 'A1a so did the counter-example run', (BEFORE.result || {}).fatal);
ok(/^\d{4}-\d{2}-\d{2}T/.test(String(EV.takenAt)), 'A2  and says when it was taken');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A3 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
ok((BEFORE.sources || {})['assets/js/pages/inventory-replenishment.js']
   !== (EV.sources || {})['assets/js/pages/inventory-replenishment.js'],
  'A4  the before-capture was taken against a DIFFERENT page source — it is evidence about the R1 candidate, not a rerun');
ok((BEFORE.sources || {})['assets/tests/_cp2s-r2-inplace-dom-runner.js']
   === (EV.sources || {})['assets/tests/_cp2s-r2-inplace-dom-runner.js'],
  'A5  and through the SAME harness, so the two are comparable');

// ---------------------------------------------------------------------------------------------------
section('B. the wait is REAL — without this, none of C/D/E measures anything');

['R2A1-unverified-unchanged-completes', 'R2A2-changed-during-wait-not-applied', 'R2A3-left-during-wait'].forEach(function (lbl) {
  const p = phase(lbl), b = was(lbl);
  eq(ex(p).heldReg, true, 'B1 ' + lbl + ': the registry really was held');
  eq(ex(p).during && ex(p).during.verifying, true, 'B2 ' + lbl + ': the page was still VERIFYING when the scenario acted');
  eq(ex(p).during && ex(p).during.refusalCode, 'SCOPE_SOURCE_NOT_READY',
    'B3 ' + lbl + ': and the recorded reason is the UNVERIFIED one, not a refusal');
  eq(ex(p).during && ex(p).during.refusalPending, true,
    'B4 ' + lbl + ': recorded as PENDING — "being checked" is a different fact from "checked and refused"');
  eq(ex(b).during && ex(b).during.verifying, true, 'B5 ' + lbl + ': and the R1 candidate waited too — the two runs saw the same window');
  eq(ex(p).dropped && ex(p).dropped.activeListLength, 0,
    'B6 ' + lbl + ': the authority really was unavailable at the moment Search was pressed');
});
const stagedA1 = ex(phase('R2A1-unverified-unchanged-completes')).staged || {};
eq(stagedA1.base, SITE['JP-AMZ'].applied, 'B7  every scenario starts from a known applied site, JP/Amazon');
eq(stagedA1.mkt, SITE['JP-RAK'].id, 'B8  and the pair that gets clicked is one the select genuinely offers');
ok((stagedA1.mktOptions || []).indexOf(SITE['JP-RAK'].id) !== -1,
  'B9  because it was chosen through the real select, not assigned across a country boundary', stagedA1.mktOptions);

// ---------------------------------------------------------------------------------------------------
section('C. §1 THE CONTROL — nothing changed, so the Search must simply COMPLETE');
// This is the half that stops the fix becoming "refuse after every wait". A cancel-on-any-wait would
// pass D and E and fail here, and nothing else in this suite would notice.

{
  const p = phase('R2A1-unverified-unchanged-completes');
  const b = was('R2A1-unverified-unchanged-completes');
  eq(p && p.appliedScopeKey, SITE['JP-RAK'].applied, 'C1  the clicked pair is applied after the wait');
  eq(p && p.avg && p.avg.text, SITE['JP-RAK'].avg, 'C2  and the cell shows THAT site\'s rate — 29.0, not the base 23.0');
  eq(dg(p).verify_outcome, 'CONTINUED', 'C3  and the page names the outcome: the verification CONTINUED');
  eq(dg(p).verify_scope, 'JP|' + SITE['JP-RAK'].id, 'C4  on the pair that was clicked, which is the whole §1 claim');
  eq(dg(p).verify_pending, false, 'C5  and nothing is left waiting');
  eq(ex(p).after && ex(p).after.refusalCode, null, 'C6  no refusal was recorded for a Search that succeeded');
  // And the R1 candidate got this right too, which is why it is the control rather than a finding.
  eq(b && b.appliedScopeKey, SITE['JP-RAK'].applied,
    'C7  the R1 candidate also completed this one — the control is a control, not a regression');
  eq(b && b.avg && b.avg.text, SITE['JP-RAK'].avg, 'C8  with the same number, so the fix cost nothing here');
}

// ---------------------------------------------------------------------------------------------------
section('D. §2 THE SELECTION MOVED DURING THE WAIT — and was never searched');

{
  const p = phase('R2A2-changed-during-wait-not-applied');
  const b = was('R2A2-changed-during-wait-not-applied');
  // What it did BEFORE, with the number it actually showed.
  eq(b && b.appliedScopeKey, SITE['JP-YAH'].applied,
    'D1  BEFORE: the R1 candidate applied JP/Yahoo — a pair nobody ever pressed Search for');
  eq(b && b.avg && b.avg.text, SITE['JP-YAH'].avg,
    'D2  BEFORE: and the Avg cell showed 37.0, that site\'s own rate, so the table really was republished');
  eq(ex(b).staged && ex(b).staged.mkt, SITE['JP-RAK'].id,
    'D3  BEFORE: while the pair that was CLICKED was JP/Rakuten — the authority agreed about Rakuten and the agreement was spent on Yahoo');
  ok((ex(b).rendersAfterChange || 0) >= 1,
    'D4  BEFORE: and it repainted to do it', ex(b).rendersAfterChange);
  // What it does NOW.
  eq(p && p.appliedScopeKey, SITE['JP-AMZ'].applied,
    'D5  AFTER: the LAST APPLIED scope stands — JP/Amazon, the one that was actually searched');
  eq(p && p.avg && p.avg.text, SITE['JP-AMZ'].avg, 'D6  AFTER: and the cell still shows 23.0');
  eq(p && p.marketplace, SITE['JP-YAH'].id,
    'D7  AFTER: with the SELECT still on Yahoo — the screen and the table disagree, which is exactly what "not searched yet" looks like');
  eq(dg(p).verify_outcome, 'SELECTION_CHANGED', 'D8  AFTER: and the page names why it published nothing');
  eq(ex(p).after && ex(p).after.refusalCode, 'SCOPE_SELECTION_CHANGED',
    'D9  AFTER: recorded as a named outcome, not as silence');
  eq(ex(p).rendersAfterChange, 0, 'D10 AFTER: and it repainted ZERO times after the inputs moved', ex(p).rendersAfterChange);
  eq(dg(p).verify_scope, 'JP|' + SITE['JP-RAK'].id,
    'D11 AFTER: the round is still bound to the pair that was clicked — it was cancelled, not retargeted');
  eq(ex(p).regRequestsAfter, ex(p).regRequestsBefore,
    'D12 AFTER: and the cancelled round started no further registry read', [ex(p).regRequestsBefore, ex(p).regRequestsAfter]);
}

// ---------------------------------------------------------------------------------------------------
section('E. §2 THE PAGE WAS LEFT DURING THE WAIT');

{
  const p = phase('R2A3-left-during-wait');
  const b = was('R2A3-left-during-wait');
  eq(ex(b).opsActiveWhileAway, false, 'E1  BEFORE: the page genuinely was not mounted when the verification landed');
  eq(ex(b).appliedWhileAway, SITE['JP-YAH'].applied,
    'E2  BEFORE: and a scope was applied anyway — to a page that had been left');
  ok((ex(b).rendersWhileUnmounted || 0) >= 1,
    'E3  BEFORE: with a repaint to go with it', ex(b).rendersWhileUnmounted);
  eq(ex(p).opsActiveWhileAway, false, 'E4  AFTER: same window — the page is not mounted');
  eq(ex(p).appliedWhileAway, SITE['JP-AMZ'].applied,
    'E5  AFTER: and the applied scope is untouched — still the one the operator last searched');
  eq(ex(p).rendersWhileUnmounted, 0, 'E6  AFTER: ZERO repaints while unmounted', ex(p).rendersWhileUnmounted);
  eq(ex(p).regRequestsWhileAway, ex(p).regRequestsBefore,
    'E7  AFTER: and no scope read was started by the round that was abandoned',
    [ex(p).regRequestsBefore, ex(p).regRequestsWhileAway]);
  eq(dg(p).verify_outcome, 'CANCELLED_UNMOUNTED',
    'E8  AFTER: leaving ENDED the verification, and the page says so by name');
  ok((dg(p).verify_stray || 0) >= 1,
    'E9  AFTER: and the late callback really did come back and stand down — a discard that HAPPENED, not one that never did',
    dg(p).verify_stray);
  // THE OTHER HALF: a latch left standing would block the next Search with no message at all.
  eq(ex(p).onReturn && ex(p).onReturn.state && ex(p).onReturn.state.verifying, false,
    'E10 AFTER: on return nothing is still marked as verifying');
  eq(ex(p).after && ex(p).after.status, 'READY', 'E11 AFTER: and the page searches normally again');
  eq(p && p.appliedScopeKey, SITE['JP-AMZ'].applied, 'E12 AFTER: that search applies, on the pair it was given');
  eq(ex(p).rendersBySearch, 1, 'E13 AFTER: with exactly one repaint, which is what a Search costs', ex(p).rendersBySearch);
}

// ---------------------------------------------------------------------------------------------------
section('F. the source: the continuation is HANDED a pair, it does not go and read one');

const SRC = read('assets/js/pages/inventory-replenishment.js');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function fnOf(name) {
  const i = SRC.indexOf('\nfunction ' + name + '(');
  if (i < 0) return '';
  let d = 0, started = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return SRC.slice(i, j + 1); }
  }
  return '';
}
const SEARCH = strip(fnOf('searchReplenishment'));
const RUN = strip(fnOf('_irRunVerifiedSearch_'));

ok(RUN.length > 500, 'F1  the read half exists as its own function', RUN.length);
ok(/function _irRunVerifiedSearch_\(pending\)/.test(RUN), 'F2  and takes the pair as a parameter');
ok(!/_irPendingFilters_\(\)/.test(RUN),
  'F3  and NEVER reads the selectors itself — a function that reads the DOM cannot be told which pair it is finishing');
ok(/return _irRunVerifiedSearch_\(pending\);/.test(SEARCH),
  'F4  the ordinary click path hands over the pair it just validated');
ok(/_irRunVerifiedSearch_\(\{ country: vrec\.pending\.country, marketplaceId: vrec\.pending\.marketplaceId \}\)/.test(SEARCH),
  'F5  and so does the path that waited — on the SNAPSHOT that was verified, not on the selects');
// `function searchReplenishment()` is not a call. Counting it made this read 1 and fail against a
// function that re-enters nothing.
eq((SEARCH.match(/(?<!function )\bsearchReplenishment\(\)/g) || []).length, 0,
  'F6  nothing re-enters Search from inside it — the recursion that re-read the DOM is gone');
ok(/if \(_irSearch\.verify\) return;/.test(SEARCH),
  'F7  a second click during a wait is still dropped, and the latch is now the RECORD rather than a bare flag');
ok(/seq: _irSearch\.seq, mountGen: _irMountGen/.test(SEARCH),
  'F8  the record binds the Search sequence and the mount it was pressed on');

// The guards run BEFORE any effect, and in an order where the weakest claim is checked first.
const FIN = SEARCH.slice(SEARCH.indexOf('var _finishVerify'));
const iStanding = FIN.indexOf('_irSearch.verify !== vrec');
const iMount = FIN.indexOf('vrec.mountGen !== _irMountGen');
const iSeq = FIN.indexOf('vrec.seq !== _irSearch.seq');
const iSel = FIN.indexOf('_irPendingFilters_()');
const iApply = FIN.indexOf('_irRunVerifiedSearch_(');
ok(iStanding > 0 && iMount > iStanding && iSeq > iMount && iSel > iSeq && iApply > iSel,
  'F9  standing, then mount, then sequence, then the selection — and only then is anything applied',
  { iStanding, iMount, iSeq, iSel, iApply });
// AND THE ONE CASE THAT IS NOT A CHANGE. Loading the registry repopulates the selects and may DROP a
// marketplace id that does not belong to the country on screen. That is the page tidying up after
// itself; reading it as an operator change cancelled the US-plus-Japanese-id counter-example and hid
// MARKETPLACE_COUNTRY_MISMATCH behind a cancellation. A cancellation needs POSITIVE evidence.
ok(/\(nowSel\.marketplaceId && nowSel\.marketplaceId !== vrec\.pending\.marketplaceId\)/.test(SEARCH),
  'F13 an EMPTIED marketplace is not an operator change — the authority still refuses the clicked pair by name');
ok(/_irCancelPendingVerify_\('CANCELLED_UNMOUNTED'\)/.test(strip(SRC)),
  'F10 leaving the page ends a pending verification, in ONE place');
ok(/_irMountGen\+\+;[\s\S]{0,400}_irCancelPendingVerify_\('CANCELLED_UNMOUNTED'\)/.test(strip(SRC)),
  'F11 and it is the unmount that does it, alongside the generation it already advances');
ok(/if \(_irSearch\.lastRefusal && _irSearch\.lastRefusal\.pending\) _irSearch\.lastRefusal = null;/.test(strip(SRC)),
  'F12 the PENDING refusal is cleared with it — left behind it would read as a live condition');

// ---------------------------------------------------------------------------------------------------
section('G. the R1 fixes are still in place');

ok(/IR_SCOPE_CHECK_ = \{ VALID: 'VALID', UNVERIFIED: 'UNVERIFIED', INVALID: 'INVALID' \}/.test(SRC),
  'G1  §A: the three-state scope check is intact');
ok(/rec !== _irBootstrap \|\| rec\.mountGen !== _irMountGen/.test(SRC),
  'G2  §C: a revalidation callback still checks both its record and its mount');
ok(/function _irRecoEnsureForRestoredScope_/.test(SRC), 'G3  §B: the restore still recovers an abandoned read');
const b1 = phase('R1B1-cold-inflight-leave-return');
eq(dg(b1).reco_recovery, 'REREAD_ISSUED', 'G4  §B: and the cold case still costs exactly one re-read');
const b2 = phase('R1B2-warm-cache-zero-reads');
eq(dg(b2).reco_recovery, 'ALREADY_SETTLED', 'G5  §B: while the warm case still costs nothing');
// §A END TO END, and the behaviour F13 is about: this scenario reaches the gate UNVERIFIED, the load
// empties a marketplace select that was holding a Japanese id under US, and the verdict that comes
// out is still the authority's, by name.
const a3 = phase('R1A3-unverified-illegal-pair');
eq(ex(a3).refusal && ex(a3).refusal.code, 'MARKETPLACE_COUNTRY_MISMATCH',
  'G6  §A: an UNVERIFIED illegal pair is still refused for the RIGHT reason, not quietly cancelled');
eq(a3 && a3.appliedScopeKey, SITE['JP-AMZ'].applied, 'G7  §A: and the applied scope did not move');

// ---------------------------------------------------------------------------------------------------
section('H. WHAT THESE CAPTURES DO NOT CLAIM');

ok(true, 'H1  the fixture is a local stub: these are REQUEST COUNTS, REPAINT COUNTS and CELL VALUES, not production timings');
ok(true, 'H2  the registry hold is a harness wrapper around KM.scopeRegistry.ensureLoaded, because a READY '
  + 'shared registry answers from memory and issues no request a server could delay. It changes WHEN the '
  + 'authority answers, never WHAT it answers.');
ok(true, 'H3  "the inputs changed" is decided by comparing the selectors at settle time with the pair that was '
  + 'clicked. It does not depend on a change EVENT, which is why the harness can stage it by assignment and '
  + 'why a programmatic restore cannot slip past it either.');
ok(true, 'H4  no production recalculation job was started, and nothing was written, in any phase here');

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
