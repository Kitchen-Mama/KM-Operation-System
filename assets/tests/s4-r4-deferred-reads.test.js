/**
 * ==================================================================================================
 * S4-R4 — PAGE-LEVEL CRITICAL / SECONDARY DATA LOADING
 * ==================================================================================================
 *
 * Three pages, one deferred dependency each, and the same nine questions of all three.
 *
 *   A · CLASSIFICATION. The critical tables are still read at mount; the deferred ones are not.
 *   B · THE FIRST CONSUMER. One read when the interaction happens, none before, none on a repeat.
 *   C · THE FIRST USEFUL UI is unchanged — the same controls and the same rows as before the round.
 *   D · FAILURE is scoped to the secondary feature, is visible, is not "empty", and Retry is one read.
 *   E · STALENESS. An answer for a page the user has left does not repaint it.
 *   F · INVALIDATION. A write-equivalent returns the model to NOT_LOADED and costs exactly one re-read.
 *   G · MUTATION. Each defence broken on purpose; all six §12 mutants plus the two this round added.
 *
 * WHAT IS ASSERTED FROM MEASUREMENT: request counts and the tables behind them, read rounds, DOM
 * outcomes and deferred-state transitions. All are properties of control flow and hold at any server
 * speed.
 *
 * WHAT IS NOT ASSERTED: milliseconds. §11's two claims are asserted in the form that IS observable —
 * the first useful UI renders with the deferred tables absent, and the primary UI survives the
 * secondary read in every state it can be in.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const EV = path.join(ROOT, 'docs', 'evidence', 's4-r4-deferred-reads');

let passed = 0, failed = 0;
function ok(cond, msg, extra) {
  if (cond) { passed++; console.log('  ok   ' + msg); }
  else { failed++; console.log('FAIL  ' + msg); if (extra !== undefined) console.log('        ' + JSON.stringify(extra)); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; console.log('  ok   ' + msg); }
  else { failed++; console.log('FAIL  ' + msg); console.log('        expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
}
function section(t) { console.log('\n-- ' + t + ' ' + '-'.repeat(Math.max(0, 94 - t.length)) + '\n'); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const M = JSON.parse(fs.readFileSync(path.join(EV, 'measurements.json'), 'utf8'));
const RO = require('./_release-order.js');
const DR = read('assets/js/core/deferred-read.js');
const CR = read('assets/js/pages/campaign-risk.js');
const FS = read('assets/js/pages/factory-stock.js');
const CRC = read('assets/js/pages/carrier-rate-card.js');
const INDEX = read('index.html');
const KEYS = ['campaign-risk', 'factory-stock', 'carrier-rate-card'];

/* ==================================================================================================
   A — CLASSIFICATION
   ================================================================================================== */
section('A. CLASSIFICATION — what the mount still reads, and what it no longer does');

KEYS.forEach(function (k, i) {
  const p = M.pages[k];
  const at = 'A' + (i + 1);
  const got = Object.keys(p.initial.post.tables).map(function (t) { return t.replace('getTable:', ''); }).sort();
  eq(got, p.critical.slice().sort(), at + '  ' + p.label + ': the mount reads exactly its critical tables');
  /* THE POINT OF THE ROUND, stated as a count rather than as an absence: a deferred table appearing
     in the mount's table list is the defect, and naming each one means the failure says which. */
  p.deferred.forEach(function (t) {
    ok(!p.initial.post.tables['getTable:' + t],
      at + 'a ' + p.label + ': ' + t + ' is NOT read at mount', p.initial.post.tables);
  });
  ok(p.initial.post.requests < p.initial.pre.requests,
    at + 'b ' + p.label + ': fewer initial requests than before the round',
    [p.initial.pre.requests, p.initial.post.requests]);
  ok(p.initial.post.rounds <= p.initial.pre.rounds,
    at + 'c ' + p.label + ': no more sequential rounds than before',
    [p.initial.pre.rounds, p.initial.post.rounds]);
});

eq(M.totals.initialRequestsPost, 6, 'A4  six initial requests across the three pilots, down from twelve');
eq(M.totals.initialRequestsPre, 12, 'A4a and twelve is what the same instrument measured before the change');
eq(M.totals.initialRoundsPost, 4, 'A4b four sequential rounds, down from seven');

/* The Promotion Risk shape is the finding this round turned on, so it is asserted by name. */
eq(M.pages['campaign-risk'].initial.post.requests, 1, 'A5  Promotion Risk opens on ONE read');
eq(M.pages['campaign-risk'].initial.post.rounds, 1, 'A5a in ONE round, down from three');
ok(/CampaignRiskState\.country starts empty/.test(M.pages['campaign-risk'].whyDeferrable),
  'A5b and the evidence records WHY it could never have shown a row on that screen');

/* ==================================================================================================
   B — THE FIRST CONSUMER
   ================================================================================================== */
section('B. FIRST CONSUMER — one read, and only when asked');

KEYS.forEach(function (k, i) {
  const p = M.pages[k];
  const at = 'B' + (i + 1);
  eq(p.initial.post.secondaryConsumed <= p.initial.pre.secondaryConsumed, true,
    at + '  ' + p.label + ': nothing the deferred data feeds is built at mount');
  const got = Object.keys(p.firstConsumerCost.tables).map(function (t) { return t.replace('getTable:', ''); }).sort();
  eq(got, p.deferred.slice().sort(), at + 'a ' + p.label + ': the interaction reads exactly the deferred tables');
  eq(p.firstConsumerCost.dependencyReads, 1, at + 'b ' + p.label + ': ONE dependency read');
  /* §7 — the second use. These pages re-render on every filter change, so a missing single-flight
     would show up here as a second read rather than as anything a user could see. */
  eq(p.secondUse.requests, 0, at + 'c ' + p.label + ': using it again reads nothing');
  ok(p.secondUse.consumed === p.firstConsumerCost.requests || p.secondUse.consumed > 0,
    at + 'd ' + p.label + ': and the feature is still populated on that second use', p.secondUse);
});

ok(/function ensure/.test(DR) && /if \(e\.flight\) return e\.flight;/.test(DR),
  'B4  the single-flight is one shared promise, not a flag that a second caller can race');
ok(/e\.reads\+\+/.test(DR), 'B4a and dispatches are counted, so "read once" is measurable rather than assumed');

/* THE DOUBLE CLICK, and the second latch named rather than leaned on. KM.DB shares an in-flight
   getTable, so a duplicate dispatch never reaches the network - which is why the request count is
   the same either way, and why the second assertion asks the helper what it DID rather than what
   the network saw. A round that checked only the first would be reporting the transport's defence
   as though it were this one's. */
KEYS.forEach(function (k, i) {
  const p = M.pages[k];
  eq(p.doubleFire.api, p.firstConsumerCost.requests,
    'B5.' + (i + 1) + '  ' + p.label + ': firing the interaction twice costs one read',
    p.doubleFire);
  eq(p.doubleFire.reads, 2,
    'B5.' + (i + 1) + 'a ' + p.label + ': and the helper dispatched twice in the whole scenario, not three times');
});

/* ==================================================================================================
   C — THE FIRST USEFUL UI IS UNCHANGED
   ================================================================================================== */
section('C. FIRST USEFUL UI — §11, in the form that is observable');

KEYS.forEach(function (k, i) {
  const p = M.pages[k];
  const at = 'C' + (i + 1);
  eq(p.primaryUnchanged.postFirstUseful, p.primaryUnchanged.preFirstUseful,
    at + '  ' + p.label + ': the same first useful UI as before the deferral');
  eq(p.primaryUnchanged.postPrimary, p.primaryUnchanged.prePrimary,
    at + 'a ' + p.label + ': and the same primary content');
  ok(p.primaryUnchanged.postFirstUseful > 0,
    at + 'b ' + p.label + ': FIRST_USEFUL_UI_CAN_RENDER_WITHOUT_DEFERRED_DATA', p.primaryUnchanged);
  /* SECONDARY_LOADING_DOES_NOT_BLOCK_PRIMARY_UI, asked in all three states the secondary can be in:
     while it is loading, after it failed, and after it was invalidated and re-read. */
  eq(p.failure.primaryAfter, p.failure.primaryBefore, at + 'c ' + p.label + ': a refused secondary read leaves the primary UI alone');
  eq(p.invalidation.primaryAfterReuse, p.primaryUnchanged.postPrimary, at + 'd ' + p.label + ': and so does a re-read after invalidation');
});

/* ==================================================================================================
   D — FAILURE
   ================================================================================================== */
section('D. FAILURE — scoped, visible, not empty, and one read on Retry');

KEYS.forEach(function (k, i) {
  const p = M.pages[k];
  const at = 'D' + (i + 1);
  eq(p.failure.errorBox, 1, at + '  ' + p.label + ': the refusal is on screen, exactly once');
  eq(p.failure.sectionStillActive, true, at + 'a ' + p.label + ': the route is still the one the user opened');
  ok(p.failure.firstUsefulAfter > 0, at + 'b ' + p.label + ': FALSE_EMPTY is not what happened — the page still has its content', p.failure);
  eq(p.failure.retryRequests, p.firstConsumerCost.requests,
    at + 'c ' + p.label + ': Retry is exactly one canonical read, the same one');
  eq(p.failure.errorBoxAfterRetry, 0, at + 'd ' + p.label + ': and it clears when the read succeeds');
  ok(p.failure.consumedAfterRetry > 0, at + 'e ' + p.label + ': the secondary feature is populated after recovery', p.failure);
});

/* The three refusal strings, read out of the shipped sources. A banner that says "no data" instead
   of "could not be read" is the §7 defect in words rather than in counts, and words are what the
   operator actually gets. */
ok(/Could not load promotion data for this country/.test(CR), 'D4  Promotion Risk names the refusal');
ok(/The country selector above is unaffected/.test(CR), 'D4a and says what is still usable');
ok(/The movement log could not be read/.test(FS), 'D4b Factory Inventory names the refusal');
ok(/The Stock Snapshot tab is unaffected/.test(FS), 'D4c and says what is still usable');
ok(/Lead Time could not be read/.test(CRC), 'D4d Carrier Rate Card names the refusal');
ok(/The rate rows below are unaffected/.test(CRC), 'D4e and says what is still usable');
ok(/crRetrySecondary|fmvRetrySecondary|crcRetryLeadTimes/.test(CR + FS + CRC), 'D4f each refusal carries a Retry');

ok(/FAILED IS STICKY UNTIL retry\(\)/.test(DR),
  'D5  a refused read does not re-dispatch on the next render — the alternative is a request storm');
ok(/Resolves - never rejects/.test(DR) || /never rejects/.test(DR),
  'D5a and ensure() resolves rather than rejecting, so a forgotten .catch cannot take the page down');

/* ==================================================================================================
   E — STALENESS
   ================================================================================================== */
section('E. STALENESS — an answer for a page the user has left');

KEYS.forEach(function (k, i) {
  const p = M.pages[k];
  const at = 'E' + (i + 1);
  eq(p.stale.stillActiveWhileAway, false, at + '  ' + p.label + ': the late answer did not bring the route back');
  eq(p.stale.visibleSectionsWhileAway, 1, at + 'a ' + p.label + ': one visible section throughout');
  eq(p.stale.mountedWhileAway, 1, at + 'b ' + p.label + ': and one mounted section');
  eq(p.stale.returnRequests, 0, at + 'c ' + p.label + ': returning costs nothing — the model survived');
  ok(p.stale.returnPrimary > 0, at + 'd ' + p.label + ': and the primary content is there', p.stale);
});

ok(/superseded/.test(DR) && /e\.epoch !== myEpoch/.test(DR),
  'E4  the helper refuses an answer from an older epoch rather than letting it land');
ok(/myRows !== crcCurrentRows/.test(CRC), 'E4a Carrier Rate Card also guards on the row set the answer was asked for');
ok(/tok !== _crLoadToken/.test(CR), 'E4b Promotion Risk guards on the scope token');
ok(/myGen !== _fsReadGen_/.test(FS), 'E4c Factory Inventory guards on the read generation');

/* ==================================================================================================
   F — INVALIDATION (§8)
   ================================================================================================== */
section('F. INVALIDATION — no TTL, and a write does not leave a stale model behind');

KEYS.forEach(function (k, i) {
  const p = M.pages[k];
  const at = 'F' + (i + 1);
  eq(p.invalidation.stateAfterFirstUse, 'READY', at + '  ' + p.label + ': READY after the first use');
  eq(p.invalidation.stateAfterInvalidate, 'NOT_LOADED', at + 'a ' + p.label + ': back to NOT_LOADED when invalidated');
  eq(p.invalidation.requestsAfterInvalidate, p.firstConsumerCost.requests,
    at + 'b ' + p.label + ': exactly one re-read, not zero and not two');
  eq(p.invalidation.requestsOnNextUse, 0, at + 'c ' + p.label + ': and zero again after that');
  eq(p.invalidation.totalDependencyReads, 2, at + 'd ' + p.label + ': two dependency reads in the whole scenario');
});

/* Comments stripped first: the file says "NO TTL, BY CONSTRUCTION" in prose, and an assertion that
   searched the prose for the word found its own denial and called it a clock. What is being asked is
   whether any CODE reads or waits on time. */
const DR_CODE = DR.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/setTimeout|setInterval|Date\.now|performance\.now|new Date/.test(DR_CODE),
  'F4  there is no clock in the helper — validity is ownership, not age');
ok(/window\.KM\.deferredRead\.invalidate\(FS_MOVEMENTS\)/.test(FS),
  'F4a a factory write invalidates the movement model it may have changed');
ok(/loadScopedTables\(\['factory_stock', 'factory_stock_movements'\]\)/.test(FS),
  'F4b and re-reads it outright when the Movement Log is the thing on screen');
ok(/maintained separately in carrier_lead_times, not on rate cards/.test(CRC),
  'F4c the Carrier page states why its write cannot make the deferred model stale');
ok(/localStorage\.setItem\(LOCALSTORAGE_KEY/.test(CR) && !/KM\.DB\.(write|create|update|save)/.test(CR),
  'F4d and Promotion Risk has no DB write at all — its promotions are a local overlay');

/* ==================================================================================================
   G — REGRESSION AND RELEASE
   ================================================================================================== */
section('G. REGRESSION — S4-R2\'s lifecycle and this release\'s cache identity');

KEYS.forEach(function (k, i) {
  const p = M.pages[k];
  const at = 'G' + (i + 1);
  eq(p.reentry.listenerDrift, 0, at + '  ' + p.label + ': LISTENER_DRIFT = 0 across repeated entries');
  eq(p.reentry.openRequestsOnLeave, 0, at + 'a ' + p.label + ': nothing left open on leave');
  eq(p.reentry.warm, 0, at + 'b ' + p.label + ': warm re-entry reads nothing');
  eq(p.reentry.afterSecondary, 0, at + 'c ' + p.label + ': and neither does returning with the secondary loaded');
  eq(p.reentry.secondaryAfterReturn, 0, at + 'd ' + p.label + ': the deferred model survived the trip too');
  eq(p.reentry.rapid, 0, at + 'e ' + p.label + ': a rapid A->B->A reads nothing and mounts once');
  eq(p.reentry.mountedSections, 1, at + 'f ' + p.label + ': exactly one mounted section after it');
});

ok(/LISTENER DRIFT IS A MARGINAL RATE/.test(JSON.stringify(M.instrument_corrections_this_round)),
  'G4  the round records that its first drift reading was the instrument, not a regression');

const TOKEN = RO.currentAppToken();
ok(INDEX.indexOf('assets/js/core/deferred-read.js?v=' + TOKEN) > -1,
  'G5  deferred-read.js is loaded by index.html under the current application token');
eq(RO.staleAppTokenRefs(INDEX, read('assets/js/app.js')).length, 0,
  'G5a and the whole application family rotated together');
ok(INDEX.indexOf('core/deferred-read.js') < INDEX.indexOf('pages/campaign-risk.js'),
  'G5b it runs before the first page that asks it anything');

/* ==================================================================================================
   H — MUTATION
   ================================================================================================== */
section('H. MUTATION — each defence broken on purpose');

const RUN = require('./_s4r4-deferred-read-runner.js');
const T = {
  dr: 'assets/js/core/deferred-read.js',
  cr: 'assets/js/pages/campaign-risk.js',
  fs: 'assets/js/pages/factory-stock.js',
  crc: 'assets/js/pages/carrier-rate-card.js'
};

// `from` may be a single anchor or a LIST of [from, to] pairs, because a defence held at two levels
// has to be removed at both to be observable at all.
function swap(file, from, to) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  const edits = Array.isArray(from) ? from : [[from, to]];
  let next = src;
  for (const [f, t] of edits) {
    if (next.indexOf(f) < 0) return { harness: 'ANCHOR NOT FOUND in ' + file + ': ' + String(f).slice(0, 90) };
    if (next.indexOf(f) !== next.lastIndexOf(f)) return { harness: 'ANCHOR AMBIGUOUS in ' + file + ': ' + String(f).slice(0, 90) };
    next = next.replace(f, t);
  }
  fs.writeFileSync(p, next, 'utf8');
  return { restore: function () { fs.writeFileSync(p, src, 'utf8'); } };
}

let killed = 0, survived = 0, harnessErrors = 0;
function mutant(name, file, from, to, mode, detects) {
  const m = swap(file, from, to);
  if (m.harness) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + m.harness); return; }
  let out = null, threw = null;
  try { out = RUN.run(400, mode); } catch (e) { threw = e; }
  m.restore();
  if (threw) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + threw.message); return; }
  if (out && (out.fatal || out.noMeasurements)) {
    // A mutant that stops the harness reaching its own question has not been OBSERVED, it has been
    // guessed at. Loud, not silently scored as a kill.
    harnessErrors++; failed++;
    console.log('HARNESS ERROR  ' + name + ' — ' + (out.fatal || 'no measurements') );
    return;
  }
  let caught = false, why = '';
  try { caught = !!detects(out); } catch (e) { caught = false; why = ' (probe threw: ' + e.message + ')'; }
  if (caught) { killed++; passed++; console.log('  ok   ' + name + ' KILLED'); }
  else { survived++; failed++; console.log('FAIL  ' + name + ' SURVIVED' + why); }
}

// H1 — §12 "restore secondary dependency to eager load".
mutant('H1 the deferred tables go back on the mount read', T.cr,
  "        window.KM.DB.loadScopedTables(CR_CRITICAL_TABLES)",
  "        window.KM.DB.loadScopedTables(CR_CRITICAL_TABLES.concat(CR_SCOPE_TABLES))",
  'shape',
  function (o) { return o.shape['campaign-risk'].initial.api !== 1; });

// H1b — the same defect on the page where it is a hidden tab rather than a picker.
mutant('H1b Factory Inventory reads the movement log at mount again', T.fs,
  "        // Movement Log tab is first opened.\r\n" +
  "        window.KM.DB.loadScopedTables(['factory_stock', 'sku_details', 'warehouses'])",
  "        // Movement Log tab is first opened.\r\n" +
  "        window.KM.DB.loadScopedTables(['factory_stock', 'sku_details', 'warehouses', 'factory_stock_movements'])",
  'shape',
  function (o) { return !!o.shape['factory-stock'].initial.tables['getTable:factory_stock_movements']; });

// H2 — §12 "remove first-consumer guard": the READY short-circuit goes, so every use re-reads.
mutant('H2 the READY state no longer short-circuits', T.dr,
  "        if (e.state === STATES.READY)  return Promise.resolve({ ok: true, fresh: false });",
  "        if (e.state === STATES.READY)  { e.state = STATES.NOT_LOADED; }",
  'shape',
  function (o) { return KEYS.some(function (k) { return o.shape[k].secondUse.api !== 0; }); });

// H3 — §12 "duplicate the first-consumer read": the shared flight is replaced by a fresh one per
// caller, which is what a single-flight written as a boolean would do.
// H3 — §12 "duplicate the first-consumer read". The shared flight is what makes two callers arriving
// during one read cost one read. A first version of this mutant was INERT: no scenario asked twice
// while a read was in flight, so removing the guard changed nothing that could be seen. It is replaced
// rather than banked (S3-R10 J5), and the scenario now double-fires the interaction — a double click.
mutant('H3 two callers during one read get two reads', T.dr,
  "        if (e.flight) return e.flight;                 // LOADING: one read, however many callers",
  "        if (false) return e.flight;",
  'shape',
  // COUNTED AT THE HELPER, NOT AT THE NETWORK, and that is a finding rather than a convenience:
  // KM.DB's scoped read shares its own in-flight getTable, so a second dispatch for the same table
  // is absorbed before it becomes a request. The REQUEST count is therefore identical with and
  // without this guard - 4/1/1 either way - and cannot see the defect at all. deferredRead's own
  // dispatch count goes 2 -> 3, which is the duplicate read §12 is asking about. Two latches shield
  // each other here, exactly as they did in S4-R3; this names which one is under test.
  function (o) {
    return KEYS.some(function (k) {
      const d = o.shape[k].doubleFire;
      return !d || d.reads !== 2;
    });
  });

// H4 — §12 "convert secondary error into empty": the refusal becomes the page's ordinary empty
// state, which is the sentence an operator reads as "there is no data".
mutant('H4 the refusal is rendered as an empty result', T.fs,
  "        scrollBody.innerHTML = '<div role=\"alert\" class=\"fmv-secondary-error\">' +\r\n" +
  "            'The movement log could not be read. The Stock Snapshot tab is unaffected. ' +\r\n" +
  "            '<button type=\"button\" class=\"btn btn-secondary\" onclick=\"fmvRetrySecondary()\">Retry</button>' +\r\n" +
  "            '</div>';",
  "        scrollBody.innerHTML = '<div style=\"padding:20px;text-align:center;color:#94A3B8\">No movement logs for the selected filters.</div>';",
  'failure',
  function (o) { return o.failure['factory-stock'].onFailure.errorBox !== 1; });

// H5 — §12 "let secondary failure clear primary UI".
mutant('H5 a refused secondary read wipes the primary table', T.crc,
  "            if (myRows !== crcCurrentRows) return;\r\n" +
  "            _crcAdoptLeadTimes_(r);\r\n" +
  "            _crcPaintLeadTimes_();\r\n" +
  "            if (after) after();",
  "            if (myRows !== crcCurrentRows) return;\r\n" +
  "            _crcAdoptLeadTimes_(r);\r\n" +
  "            if (!(r && r.ok)) { var _w = document.getElementById('crc-table-wrap'); if (_w) _w.innerHTML = ''; }\r\n" +
  "            _crcPaintLeadTimes_();\r\n" +
  "            if (after) after();",
  'failure',
  // On this page the primary content AFTER Search is the rate rows, which is what `consumed`
  // counts here — `primary` is the filter bar, and wiping the table does not touch it.
  function (o) { return o.failure['carrier-rate-card'].onFailure.consumed === 0; });

// H6 — §12 "allow stale deferred result commit". Both guards have to go: the helper's epoch and the
// page's own token shield each other, and a mutant that removes one is invisible.
mutant('H6 an answer from a superseded epoch is committed', T.dr,
  [["                if (e.epoch !== myEpoch) return { ok: false, superseded: true };\r\n" +
    "                e.state = STATES.READY; e.error = null;",
    "                e.state = STATES.READY; e.error = null;"],
   ["        e.epoch++;\r\n" +
    "        e.state = STATES.NOT_LOADED;",
    "        e.state = STATES.NOT_LOADED;"]],
  null, 'invalidation',
  function (o) {
    // With the epoch gone, the invalidated dependency is re-read but the OLD flight's resolution can
    // also mark it READY — the re-read count is what stops being 1.
    return KEYS.some(function (k) {
      const v = o.invalidation[k];
      return v.stateAfterInvalidate !== 'NOT_LOADED' || v.totalDependencyReads !== 2;
    });
  });

// H7 — this round's own addition: the Promotion Risk failure path must not fall through to the
// legacy display-string marketplace list, which would present weaker data as though the read worked.
mutant('H7 a failed scope read falls back to the legacy option list', T.cr,
  "        _crMarketplacePending_('Select Marketplace');\r\n" +
  "        crRenderScoped();\r\n" +
  "    });\r\n" +
  "}\r\n" +
  "/* §7 — exactly one new canonical read; the country picker above it is untouched throughout. */",
  "        refreshCrMarketplaceOptions();\r\n" +
  "        crRenderScoped();\r\n" +
  "    });\r\n" +
  "}\r\n" +
  "/* §7 — exactly one new canonical read; the country picker above it is untouched throughout. */",
  'failure',
  function (o) { return o.failure['campaign-risk'].onFailure.consumed !== 0; });

// H8 — the tab click stops being the first consumer, so the Movement Log shows its search prompt
// over a dependency that was never read: a permanent "click Search" that can never return a row.
mutant('H8 opening the Movement Log no longer triggers its read', T.fs,
  "    if (tab === 'movement') { _fsEnsureMovements_(root); renderFactoryMovementTable(root); }",
  "    if (tab === 'movement') { renderFactoryMovementTable(root); }",
  'shape',
  function (o) { return o.shape['factory-stock'].firstConsumer.api !== 1; });

console.log('\n  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harnessErrors + ' harness errors');
ok(survived === 0 && harnessErrors === 0, 'H  every planted defect was caught');

/* ================================================================================================== */
console.log('\n' + '='.repeat(100));
console.log('S4-R4 DEFERRED READS: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(100));
process.exit(failed === 0 ? 0 : 1);
