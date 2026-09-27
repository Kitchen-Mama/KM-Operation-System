// =================================================================================================================
// S4-R1 — GUARDS FOR A CENSUS, NOT FOR A REPAIR.
//
// This round changed no production behaviour, so there are no mutants: there is nothing planted that could be
// wrongly survived. What CAN go wrong with a measurement round is subtler and worse — a conclusion that outlives
// the thing it was measured on. Three ways that happens, and this suite exists to close all three:
//
//   1. THE CENSUS STOPS BEING COMPLETE. A route added to index.html that nobody adds to the runner's table is a
//      route the next round will believe was measured and found cheap. §A derives the expected route set FROM
//      index.html and from app.js's section maps, so the census cannot quietly fall behind the application.
//
//   2. A NUMBER IS READ OUT OF THE WRONG RUN. Round counts at serverMs 0 are WRONG — with instant settles every
//      pooled read looks sequential, and campaign-risk reads 5 rounds at 0 ms against 3 at 400 ms. §C pins the
//      caveat to the evidence so a later reader cannot quote the convenient figure.
//
//   3. A NOT_OBSERVABLE BECOMES AN OBSERVATION. The millisecond fields in this round are refused, and refused for
//      a measured reason: single-entry route deltas fall inside the baseline run's own spread. §D asserts that
//      the refusal is still justified BY THE RECORDED NUMBERS rather than by the sentence describing them — if a
//      future instrument resolves above its noise floor, this fails and the claim gets rewritten.
//
// The evidence is the subject here. A suite that only read the source would pass over a stale measurements.json,
// which is exactly the failure it is supposed to prevent.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }

const INDEX = read('index.html');
const APP = read('assets/js/app.js');
const CENSUS = require('./_s4r1-route-census-runner.js');
const EV = JSON.parse(read('docs/evidence/s4-r1-performance-baseline/measurements.json'));
const DOC = read('docs/evidence/s4-r1-performance-baseline/ARCHITECTURE_CENSUS.md');
const BOARD = read('docs/evidence/s4-r1-performance-baseline/DECISION_BOARD.md');
const R400 = EV.runs.serverMs400;
const R0 = EV.runs.serverMs0;

// =================================================================================================================
section('A — THE CENSUS COVERS THE APPLICATION, derived rather than trusted');
// =================================================================================================================
{
  // Every route the menu can reach, taken from the markup that reaches it.
  const fromMenu = Array.from(new Set((INDEX.match(/showSection\('([a-zA-Z-]+)'\)/g) || [])
    .map((s) => /'([a-zA-Z-]+)'/.exec(s)[1])));
  // Plus the two the Shipment Center reaches through named helpers, and the staged board.
  const viaHelpers = ['shipment-draft', 'shipment-overview', 'product-strategy'];
  const covered = CENSUS.ROUTES.map((r) => r.key);

  const missing = fromMenu.filter((k) => covered.indexOf(k) === -1);
  // The two disabled "coming later" items are refused by showSection itself, so they are not routes.
  const DISABLED = ['overseas-inbound', 'overseas-outbound'];
  eq(missing.filter((k) => DISABLED.indexOf(k) === -1), [],
    'A1  every menu-reachable route is in the census table', { missing });
  ok(DISABLED.every((k) => new RegExp("section === '" + k + "'").test(APP)),
    'A2  and the two that are missing are the ones showSection refuses by name — not an oversight');

  viaHelpers.forEach((k) => {
    ok(covered.indexOf(k) !== -1, 'A3  the non-menu route ' + k + ' is censused too');
  });

  // A4 — and the census actually RAN over all of them. A table entry nobody entered proves nothing.
  const ran = Object.keys(R400.routes || {});
  eq(covered.filter((k) => ran.indexOf(k) === -1), [],
    'A4  every route in the table was actually entered by the run', { ran: ran.length });
  eq(EV.runs.serverMs400.done, true, 'A5  and the 400 ms run completed rather than being read part-way');
  eq(EV.runs.serverMs0.done, true, 'A5a as did the 0 ms run');

  // A6 — THE PRODUCT STRATEGY BOARD HAS NO MENU ITEM, which the census reports and which is easy to
  //      "fix" by accident later. Asserted in both directions so the census entry and the markup agree.
  const psb = CENSUS.ROUTES.filter((r) => r.key === 'product-strategy')[0];
  eq(!!psb.notInMenu, !/showSection\('product-strategy'\)/.test(INDEX),
    'A6  the census flags Product Strategy as menu-less exactly when index.html has no item for it');
}

// =================================================================================================================
section('B — THE ARCHITECTURE THE CENSUS DESCRIBES IS THE ONE THAT SHIPPED');
// =================================================================================================================
{
  ok(/function showSection\(section\)/.test(APP), 'B1  showSection is the route owner named in the census');
  ok(/assets\/js\/core\/lifecycle\.js/.test(INDEX), 'B2  lifecycle.js is loaded by the shell');
  ok(/assets\/js\/core\/partial-loader\.js/.test(INDEX), 'B3  and partial-loader.js');

  // B4 — THE TWO SECTION MAPS. The census records that showSection carries the map twice and that the
  //      copies already disagree; if someone reconciles them, this should fail and the census be updated.
  const maps = APP.match(/const sectionMap = \{/g) || [];
  eq(maps.length, 2, 'B4  showSection still carries TWO section maps, as the census describes');
  const mountMap = APP.slice(APP.indexOf('const sectionMap = {'), APP.indexOf('const targetSectionId = sectionMap[section];'));
  ok(/'global-logistics-map'/.test(mountMap),
    'B4a the mount map carries global-logistics-map, which the visibility map does not — the disagreement the file itself records');

  // B5 — the read pool is the number every round count in this evidence is arithmetic over.
  const DBAPI = read('assets/js/api/operation-system-db-api.js');
  ok(/var KM_SCOPED_READ_CONCURRENCY_ = 2;/.test(DBAPI),
    'B5  the read pool is 2, which is what turns a table count into a round count');
  ok(/read pool is 2/.test(DOC) || /KM_SCOPED_READ_CONCURRENCY_/.test(DOC),
    'B5a and the census says so rather than leaving the arithmetic unexplained');
}

// =================================================================================================================
section('C — THE INSTRUMENT CAVEATS ARE RECORDED WITH THE NUMBERS THEY QUALIFY');
// =================================================================================================================
{
  ok(Array.isArray(EV.instrument_caveats) && EV.instrument_caveats.length >= 4,
    'C1  the evidence records its own caveats rather than only its results');

  // C2 — THE ONE THAT MATTERS. Round counts at serverMs 0 over-report sequencing, and the proof is in
  //      the evidence itself: the same route, the same request count, a different number of rounds.
  const cr0 = R0.routes['campaign-risk'].cold, cr4 = R400.routes['campaign-risk'].cold;
  eq(cr0.api, cr4.api, 'C2  campaign-risk issues the same number of requests at 0 ms and 400 ms');
  ok(cr0.rounds > cr4.rounds,
    'C2a but MORE rounds at 0 ms — instant settles make a pooled read look sequential',
    { at0: cr0.rounds, at400: cr4.rounds });
  eq(cr4.rounds, Math.ceil(cr4.api / 2),
    'C2b and the 400 ms figure is exactly ceil(requests / read pool), which is the pool working');
  ok(EV.instrument_caveats.some((c) => /serverMs 0 ARE WRONG/i.test(c)),
    'C2c the caveat is written down, so the convenient figure cannot be quoted later');

  // C3 — request COUNTS are latency-independent, which is what makes them the authoritative half.
  const drift = Object.keys(R400.routes).filter((k) => {
    const a = (R0.routes[k] || {}).cold || {}, b = R400.routes[k].cold || {};
    return a.api !== b.api;
  });
  eq(drift, ['sku-handbook'],
    'C3  exactly one route changes request count between 0 ms and 400 ms', { drift });
  ok(EV.instrument_caveats.some((c) => /sku-handbook/.test(c) && /coalesce/i.test(c)),
    'C3a and it is explained — overlapping reads become eligible for the in-flight share');

  // C4 — the fixture cannot populate every page, and the census must not read that as a verdict.
  ok(EV.instrument_caveats.some((c) => /fixture world does not carry/i.test(c)),
    'C4  routes this world cannot populate are recorded as such, not scored as never-useful');
}

// =================================================================================================================
section('D — EVERY REFUSED NUMBER IS STILL REFUSED BY ITS OWN EVIDENCE');
// =================================================================================================================
{
  const T = EV.shell_timing;
  ok(T && typeof T.noiseFloorMs === 'number', 'D1  the timing run publishes its noise floor');

  // D2 — THE REFUSAL, RE-DERIVED. Not "the report says NOT_OBSERVABLE" but "no delta beats the control's
  //      own spread". If a future instrument resolves above it, this fails and the claim must be rewritten.
  const beat = Object.keys(T.deltasOverBaselineMs || {})
    .filter((k) => T.deltasOverBaselineMs[k] > T.noiseFloorMs);
  eq(beat, [], 'D2  no stop point exceeds the baseline spread — the ms refusal is earned, not asserted',
    { noiseFloorMs: T.noiseFloorMs, deltas: T.deltasOverBaselineMs });
  ok(/NO stop point exceeds the baseline spread/.test(T.verdict || ''),
    'D2a and the runner says so in its own verdict');

  // D3 — a loop that did not finish its cycles publishes a refusal, never a quotient.
  Object.keys(T.stops).forEach((k) => {
    if (!T.stops[k].cycles) return;
    if (!T.stops[k].reached) {
      ok(/NOT_OBSERVABLE/.test(String(T.perEntryMs[k])),
        'D3  ' + k + ' did not complete its cycles and publishes NOT_OBSERVABLE, not a per-entry number');
    }
  });

  // D4 — the census document does not quietly contain a millisecond the evidence refuses.
  ok(/NOT_OBSERVABLE/.test(DOC), 'D4  the census marks the ms fields NOT_OBSERVABLE');
  ok(!/MENU_CLICK_TO_ROUTE_SHELL_MS\s*=\s*\d/.test(DOC),
    'D4a and none of them was filled in with a number anyway');

  // D5 — the reason is the MEASURED one, not a shrug.
  ok(EV.what_is_not_observable.some((s) => /NEVER TERMINATES/.test(s)),
    'D5  the frozen-clock finding is recorded as something that was run, not something assumed');
}

// =================================================================================================================
section('E — THE FINDINGS THE NEXT ROUND WILL ACT ON ARE BACKED BY THE RUN');
// =================================================================================================================
{
  // E1 — shell-before-data, on every route that reads anything. This is the census's strongest positive
  //      claim and the one most likely to be broken by a future change.
  const reading = Object.keys(R400.routes).filter((k) => ((R400.routes[k].cold || {}).shell || {}).api > 0);
  ok(reading.length >= 15, 'E1  most routes issue at least one read before their shell appears', reading.length);
  const waited = reading.filter((k) => R400.routes[k].cold.shell.settled !== 0);
  eq(waited, [], 'E1a and NONE of them waited for a response before showing its shell', { waited });

  // E2 — the warm-re-entry split, counted from the run rather than from the prose.
  const refetch = Object.keys(R400.routes).filter((k) => (R400.routes[k].warm || {}).api > 0);
  eq(refetch.length, 9, 'E2  nine routes re-read on warm re-entry', refetch);
  ok(refetch.indexOf('skuDetails') !== -1 && refetch.indexOf('sku-regional-details') === -1,
    'E2a including the pair that share one action and disagree — the census’s sharpest example');

  // E3 — listener drift. Named pages, from the run, in BOTH runs, because a leak that appears once is noise.
  const drifters = Object.keys(R400.routes).filter((k) => {
    const a = (R0.routes[k] || {}).warm || {}, b = R400.routes[k].warm || {};
    return a.listenersAdded > 20 && b.listenersAdded > 20;
  });
  ok(drifters.length >= 4, 'E3  at least four pages re-bind listeners on re-entry in BOTH runs', drifters);
  ok(drifters.indexOf('fc-summary') !== -1, 'E3a FC Summary among them, which is the largest');
  ok(R0.shell.finalListeners > 1000,
    'E3b and the run ends holding over a thousand listeners', R0.shell.finalListeners);

  // E4 — the clean results, asserted so a regression cannot pass as "unchanged".
  const leaks = Object.keys(R400.routes).filter((k) => ((R400.routes[k].onLeave || {}).openRequests || 0) > 0);
  eq(leaks, [], 'E4  no route left a request open on leave', { leaks });
  const doubles = Object.keys(R400.routes).filter((k) => ((R400.routes[k].onLeave || {}).mountedSections || 0) > 1);
  eq(doubles, [], 'E4a and no route left a second section mounted', { doubles });
  const reloads = Object.keys(R400.routes).filter((k) => ((R400.routes[k].warm || {}).partial || 0) > 0);
  eq(reloads, [], 'E4b and no route re-fetched its HTML partial on re-entry', { reloads });

  // E5 — the boot payload, checked against index.html rather than remembered.
  const local = (INDEX.match(/<script[^>]+src="(assets\/[^"?]+)/g) || []).length;
  eq(EV.boot_payload.scripts_local, local, 'E5  the recorded local script count matches index.html today');
  ok(EV.boot_payload.js_total_kb > 4000,
    'E5a and the boot bundle is still measured in megabytes', EV.boot_payload.js_total_kb);
}

// =================================================================================================================
section('F — THE ROUND STAYED INSIDE ITS MANDATE');
// =================================================================================================================
{
  // F1 — every loading-order change is a DECISION, not an implementation. The board is the deliverable.
  ok(/DECISION_REQUIRED_COUNT = 7/.test(BOARD), 'F1  the decision board states how many decisions it holds');
  const decisions = (BOARD.match(/^### DECISION \d/gm) || []).length;
  eq(decisions, 7, 'F1a and carries that many', decisions);
  ok((BOARD.match(/OPERATOR_DECISION_REQUIRED = YES/g) || []).length >= 7,
    'F1b each one ending in an operator decision rather than a plan');

  // F2 — NOTHING on the §11 no-go list was built. Asserted against the source, not against intent.
  const ALL_JS = ['assets/js/app.js', 'assets/js/core/partial-loader.js', 'assets/js/core/lifecycle.js']
    .map(read).join('\n');
  ok(!/serviceWorker/.test(ALL_JS), 'F2  no service worker');
  ok(!/\bTTL\b|ttlMs|maxAge/.test(ALL_JS), 'F2a no TTL introduced into the shell or loader');
  ok(!/prefetch/i.test(ALL_JS), 'F2b no speculative prefetch');

  // F3 — and the one defect found is RECORDED rather than repaired, which §11 asks for by name.
  ok(/forecastReviewData/.test(DOC) && /recorded for S4-R2/i.test(DOC),
    'F3  the undefined-global defect is carried forward, not fixed in a census round');
  const DATA = read('assets/js/utils/data.js');
  ok(/forecastReviewData\.map/.test(DATA),
    'F3a and it is still there — the census describes the tree it was taken from');
}

console.log('\n' + (fail ? 'FAIL  ' : 'PASS  ') + pass + ' passed, ' + fail + ' failed');
console.log('ROUTES_CENSUSED = ' + CENSUS.ROUTES.length + ' · SHELL_WAITS_FOR_DATA = 0 · '
  + 'WARM_REFETCH_ROUTES = 9 · MS_FIELDS = NOT_OBSERVABLE (earned) · DECISIONS_OPEN = 7');
if (fail) process.exitCode = 1;
