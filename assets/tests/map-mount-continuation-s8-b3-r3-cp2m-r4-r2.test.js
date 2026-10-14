// =============================================================================================================
// S8-B3-R3-CP2M-R4-R2 — THE MAP'S MOUNT CONTINUATION
// -------------------------------------------------------------------------------------------------------------
// CP2M-R4-R1 closed two continuations on this page: boot()'s read callback, which now drops a superseded
// answer, and render(), which no longer tears the host off the document during a refresh. It left the one
// continuation that starts everything:
//
//     mount: function () { ensureMarkup().then(function (loaded) { ...add('active'); boot(); resize(); }); }
//
// That `.then` asked nothing at all. AND boot()'s OWN guard cannot stand in for it: `var myNav = _glmNavGen`
// is captured when boot is CALLED, which in this path is already after the navigation, so the generation
// matches, the guard passes, and the page proceeds as though it owned the screen.
//
// WHAT THE BEFORE CAPTURE ACTUALLY FOUND — worse than the `.active` flag everyone looks at:
//
//     the operator goes Home while the markup is in flight; the markup lands; the map dispatches a
//     workspace read, renders twice, and BUILDS A WEBGL GLOBE for a page nobody is on.
//     staleRendersBlocked: 0 — the existing guard never fired, because it never could.
//
// AND THE CASE NO MUTATIONOBSERVER CAN LAUNDER. Leave and come straight back: both mounts join the SAME
// in-flight partial, so both continuations fire in one tick and BOTH call boot(). The section is legitimately
// active the whole time, so `.active` is CORRECT and there is nothing for an observer to revert — the defect
// is that one navigation performed two loads. Measured: boots 2, renders 3, and the transport's own counter
// recording coalesced 1, which is what proves the duplicate read was ISSUED and absorbed by another layer
// rather than never made.
//
// WHAT THIS SUITE WILL NOT DO. It does not pass on a late `.active` correction, it does not raise a wait, and
// it does not pick a run. It asserts a BEFORE capture containing the defect and an AFTER capture without it,
// from the same runner, at the same markup delay, with the sources hashed.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

const BEFORE = JSON.parse(read('docs/evidence/cp2m-r4r2-mount/before.json'));
const AFTER = JSON.parse(read('docs/evidence/cp2m-r4r2-mount/after.json'));
const PAGE = read('assets/js/pages/global-logistics-map.js');
const CODE = PAGE.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const S = ['away-home', 'away-lazy', 'leave-return'];
const sum = (ev, s) => ev.scenarios[s].summary;

// -------------------------------------------------------------------------------------------------------------
section('A. both captures describe the same experiment, and the window they describe is real');

[['before', BEFORE], ['after', AFTER]].forEach(([n, ev]) => {
  eq(ev.ok, true, 'A1 ' + n + ' the capture succeeded');
  S.forEach((s) => {
    const sc = ev.scenarios[s];
    ok(!!sc, 'A1a ' + n + ' has scenario ' + s);
    ok(!sc.fatal, 'A1b ' + n + '/' + s + ' with no fatal page error', sc.fatal);
    ok(sc.summary.samples > 25, 'A1c ' + n + '/' + s + ' and a dense timeline', sc.summary.samples);
  });
});
eq(BEFORE.markupDelayMs, AFTER.markupDelayMs, 'A2 both runs answered the page partial at the SAME delay');

/* THE EXPERIMENT IS ONLY MEANINGFUL IF THE MARKUP REALLY WAS STILL IN FLIGHT WHEN THE OPERATOR LEFT.
   If it had already landed, every continuation would have run before the navigation and all the numbers
   below would describe nothing. This is checked in BOTH captures, for every scenario. */
[['before', BEFORE], ['after', AFTER]].forEach(([n, ev]) => {
  S.forEach((s) => {
    eq(sum(ev, s).markupArrivedAfterLeaving, true,
      'A3 ' + n + '/' + s + ' the markup arrived AFTER the operator navigated away');
    eq(sum(ev, s).mapPartialRequests, 1,
      'A3a ' + n + '/' + s + ' and it was fetched exactly once — both mounts joined one flight');
  });
});

const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(AFTER.sources || {}).forEach((rel) => {
  eq(sha(rel), AFTER.sources[rel], 'A4 ' + rel.split('/').pop() + ' is unchanged since the after capture');
});
ok(Object.prototype.hasOwnProperty.call(AFTER.sources || {}, 'assets/js/core/lifecycle.js'),
  'A4a the hash covers the REAL lifecycle authority the scenarios ran against');
ok(Object.prototype.hasOwnProperty.call(AFTER.sources || {}, 'assets/js/core/partial-loader.js'),
  'A4b and the real partial loader whose in-flight join makes leave-return a single fetch');
ok(BEFORE.sources['assets/js/pages/global-logistics-map.js']
   !== AFTER.sources['assets/js/pages/global-logistics-map.js'],
  'A5 and the two captures were taken against DIFFERENT page source');
eq(BEFORE.sources['assets/js/core/lifecycle.js'], AFTER.sources['assets/js/core/lifecycle.js'],
  'A5a while the lifecycle authority itself was NOT touched — this round changed the page, not the shell');

// -------------------------------------------------------------------------------------------------------------
section('B. BEFORE — a continuation that outlived its navigation did the whole mount anyway');

['away-home', 'away-lazy'].forEach((s) => {
  ok(sum(BEFORE, s).boots >= 1, 'B1 ' + s + ' the page booted after the operator had left', sum(BEFORE, s).boots);
  ok(sum(BEFORE, s).workspaceReads >= 1,
    'B2 ' + s + ' and dispatched a workspace read — counted at the SERVER, not taken from the page',
    sum(BEFORE, s).workspaceReads);
  ok(sum(BEFORE, s).renders >= 1, 'B3 ' + s + ' and rewrote the map body', sum(BEFORE, s).renders);
  // THE PART THAT IS WORSE THAN A STRAY CLASS: a WebGL context and a globe instance, for a page nobody is on.
  eq(sum(BEFORE, s).globeCreates, 1, 'B4 ' + s + ' and BUILT A GLOBE for a page the operator was not on');
  eq(sum(BEFORE, s).attaches, 1, 'B4a ' + s + ' attaching the host into a section that is not the active one');
});

/* AND THE EXISTING GUARD NEVER FIRED, which is the whole reason this needed its own fix rather than a
   wider version of CP2M-R4-R1's. `myNav` is captured inside boot(), i.e. AFTER the navigation, so it
   matches and the read proceeds. A fix that merely added more checks inside boot would have changed
   nothing at all. */
['away-home', 'away-lazy'].forEach((s) => {
  eq(sum(BEFORE, s).staleRendersBlocked, 0,
    'B5 ' + s + " boot's own navigation guard did not fire — it is captured too late to");
});

eq(sum(BEFORE, 'away-home').finalSection, 'home-section', 'B6 and the operator really was on Home');
eq(sum(BEFORE, 'away-lazy').finalSection, 'site-priority-section', 'B6a or on the other route');

// -------------------------------------------------------------------------------------------------------------
section('C. BEFORE — leave-and-return ran the mount TWICE, and no observer could have seen it');

eq(sum(BEFORE, 'leave-return').boots, 2, 'C1 one navigation produced TWO boots');
ok(sum(BEFORE, 'leave-return').renders >= 3, 'C1a and an extra render cycle with it', sum(BEFORE, 'leave-return').renders);
/* THE SECOND READ WAS ISSUED AND ABSORBED, not avoided. The transport shares an OPEN read between identical
   callers, so the server saw one request; its own counter says the duplicate existed. Reporting "one request,
   so no duplicate" would have credited the page with something another layer did for it. */
eq(sum(BEFORE, 'leave-return').txCoalesced, 1,
  'C2 the duplicate read WAS issued — the transport coalesced it, which is a fact about the transport');
eq(sum(BEFORE, 'leave-return').workspaceReads, 1, 'C2a so the server still saw one request');
// NOTHING FOR AN OBSERVER TO REVERT: the map IS the active section here, so `.active` is correct throughout.
eq(sum(BEFORE, 'leave-return').finalSection, 'global-logistics-map-section',
  'C3 and the map was legitimately the active section the whole time');
ok((sum(BEFORE, 'leave-return').finalActiveIds || []).indexOf('global-logistics-map-section') !== -1,
  'C3a so a late `.active` correction has nothing to correct and cannot see this at all');

// -------------------------------------------------------------------------------------------------------------
section('D. AFTER — a superseded mount does nothing, and says that it did nothing');

['away-home', 'away-lazy'].forEach((s) => {
  eq(sum(AFTER, s).boots, 0, 'D1 ' + s + ' NO boot');
  eq(sum(AFTER, s).workspaceReads, 0, 'D2 ' + s + ' NO workspace read reached the server');
  eq(sum(AFTER, s).renders, 0, 'D3 ' + s + ' NO render — the map body was never touched');
  eq(sum(AFTER, s).globeCreates, 0, 'D4 ' + s + ' and NO globe was built');
  eq(sum(AFTER, s).attaches, 0, 'D4a ' + s + ' nothing was attached anywhere');
  // OBSERVABLE, not merely absent. A page that silently does nothing is indistinguishable from one that
  // crashed before it got there.
  eq(sum(AFTER, s).staleMountsBlocked, 1,
    'D5 ' + s + ' and the page RECORDED refusing exactly one superseded mount');
  eq(sum(AFTER, s).finalSection, BEFORE.scenarios[s].summary.finalSection,
    'D6 ' + s + ' while the operator ended up on the same page as before');
});

// -------------------------------------------------------------------------------------------------------------
section('E. AFTER — and the page the operator DID ask for still works');

const lr = sum(AFTER, 'leave-return');
eq(lr.boots, 1, 'E1 leave-and-return now boots ONCE, not twice');
eq(lr.staleMountsBlocked, 1, 'E1a with the first mount recorded as superseded');
eq(lr.txCoalesced, 0, 'E2 and no duplicate read for the transport to absorb');
eq(lr.workspaceReads, 1, 'E3 the read the operator asked for still goes out');
eq(lr.globeCreates, 1, 'E4 the globe is still built — once');
eq(lr.globeDestroys, 0, 'E4a and never destroyed');
ok(lr.renders >= 2, 'E5 and the page still renders its loading state and its data', lr.renders);
eq(lr.finalSection, 'global-logistics-map-section', 'E6 ending on the map, which is where the operator went');
// THE FIX IS NOT "DO LESS": the one mount that is still current does everything it did before.
eq(lr.attaches, BEFORE.scenarios['leave-return'].summary.attaches,
  'E7 the surviving mount attaches the host exactly as many times as before');

// -------------------------------------------------------------------------------------------------------------
section('F. the source carries the fix, in the shape the rest of the application already uses');

ok(/function mountSuperseded\(myNav, epoch\)/.test(CODE), 'F1 the mount has a named supersession test');
ok(/mount: function \(epoch\)/.test(CODE), 'F2 and mount accepts the navigation epoch the shell passes it');
ok(/var myNav = _glmNavGen;\n\s*ensureMarkup\(\)/.test(CODE.replace(/\r\n/g, '\n')),
  'F3 the identity is captured at the ORIGINAL mount, before the markup is awaited');
ok(/if \(mountSuperseded\(myNav, epoch\)\) \{ _glmDiag\.staleMountsBlocked\+\+; return; \}/.test(CODE),
  'F4 and the continuation returns before touching anything');
ok(/staleMountsBlocked: _glmDiag\.staleMountsBlocked/.test(CODE), 'F5 the refusal is reported by the diagnostic');

/* THE EXISTING AUTHORITY, NOT A NEW ONE. commitGuard(epoch, sectionId) is the shared contract; the local
   generation is what holds where the shell's guard is absent. Neither is invented here. */
ok(/lc\.commitGuard === 'function'/.test(CODE), 'F6 it consults the shell lifecycle authority');
ok(/commitGuard\(epoch, 'global-logistics-map-section'\)/.test(CODE), 'F6a for THIS section');
ok(/myNav !== _glmNavGen\) return true/.test(CODE), 'F6b and the page-local navigation generation as well');
const LC = read('assets/js/core/lifecycle.js');
ok(/commitGuard = function\(epoch, sectionId\)/.test(LC),
  'F7 and that contract is the lifecycle manager’s own, not a method invented for this page');
['assets/js/pages/site-priority.js', 'assets/js/pages/fc-summary.js', 'assets/js/pages/request-order.js']
  .forEach((rel) => {
    ok(read(rel).indexOf('commitGuard') !== -1,
      'F7a ' + rel.split('/').pop() + ' already uses the same contract');
  });

// THE ORDER MATTERS: `.active` must be inside the guard, not before it.
const mountBody = CODE.split('mount: function (epoch)')[1] || '';
const guardAt = mountBody.indexOf('mountSuperseded');
const activeAt = mountBody.indexOf("classList.add('active')");
ok(guardAt > -1 && activeAt > -1 && guardAt < activeAt,
  'F8 the guard runs BEFORE the section is marked active, so there is nothing to undo later');
const bootAt = mountBody.indexOf('boot();');
ok(bootAt > guardAt, 'F8a and before boot() is called');

/* NOT A MUTATIONOBSERVER FIX, and this round was told explicitly not to deliver one. The observer in
   lifecycle.js is older than this round and is left exactly as it was; nothing was added to it, and the
   page does not lean on it. */
ok(/MutationObserver/.test(LC), 'F9 (the shell observer still exists, as belt-and-suspenders)');
ok(!/MutationObserver/.test(PAGE), 'F9a but this page does not use one — the mount refuses at the source');

// -------------------------------------------------------------------------------------------------------------
section('G. and nothing that was not asked for moved');

eq(AFTER.scenarios['leave-return'].summary.globeDestroys, 0, 'G1 the globe engine is still never destroyed');
ok(/function detachGlobe\(\)/.test(CODE), 'G2 detachGlobe still exists');
ok(/removeChild\(state\.globeHost\)/.test(CODE), 'G2a and still only removes the host');
ok(/if \(state\.loading && _glmDiag\.everRendered\)/.test(CODE), 'G3 CP2M-R4-R1’s refresh guard is intact');
eq((CODE.match(/myNav !== _glmNavGen/g) || []).length, 4,
  'G4 boot’s three read-callback checks are still there, plus the new mount check');
const GLOBE = read('assets/js/lib/km-globe.js');
ok(!/_glmDiag|_glmNavGen|mountSuperseded/.test(GLOBE), 'G5 the globe engine contains none of this round’s additions');
ok(!/getWorkspace\(|adaptShipmentWorkspace/.test(
     CODE.split('function render()')[1] ? CODE.split('function render()')[1].slice(0, 3000) : ''),
  'G6 and render() still does no reading of its own');

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('MAP MOUNT CONTINUATION (S8-B3-R3-CP2M-R4-R2): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
