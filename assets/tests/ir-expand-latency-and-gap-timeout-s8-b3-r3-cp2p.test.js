// S8-B3-R3-CP2P — WHERE THE EXPAND LATENCY GOES, AND WHY THE OBVIOUS FIX WAS NOT SHIPPED.
//
// §A  THE EXPAND. The Owner reports about a second between clicking a row and seeing it open. Measured on
//     the real page with a 100-SKU fixture, the dispatch was never the cost: click to handler entry is
//     under a millisecond. The cost is that `toggleReplenRow` builds the whole panel synchronously, and the
//     panel needs `getReplenishmentData()` — which re-assembles EVERY row of the station from twelve source
//     tables. It runs nine times per expand, at about 20 ms each.
//
//     A SHELL-FIRST VARIANT WAS BUILT AND IS NOT SHIPPED. It inserted a loading shell in the click pass and
//     built the panel on a later frame. First paint went from an 83 ms median to 8 ms — and the Execution
//     panel resolved LATER in TEN of TEN back-to-back interleaved pairs, by a median of 39.5 ms, a 15%
//     regression in total completion. The round forbids exactly that trade: a first paint bought by a later
//     finish is an appearance, not a fix. Deferring by a frame costs a frame by construction, so no variant
//     of the approach escapes it. The decision belongs to the Owner, and the numbers are kept either way.
//
//     THE PAIRING IS WHY THIS IS KNOWN. An earlier four-run comparison, POOLED rather than paired, showed
//     the variant 22% faster and would have shipped it. The machine drifts between runs by more than the
//     effect; only interleaved pairs, each its own control, separated the two.
//
// §B  THE RECOMMENDATION SUMMARY'S REQUEST_TIMEOUT. Traced, and nothing on that path was changed.
//
// Run: node assets/tests/ir-expand-latency-and-gap-timeout-s8-b3-r3-cp2p.test.js

'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var pass = 0, fail = 0;
function ok(c, l, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + l + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.log('FAIL ' + l + '  (got ' + A + ', expected ' + E + ')'); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function med(a) { var b = a.slice().sort(function (x, y) { return x - y; }); var n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CSSSRC = read('assets/css/pages/inventory-replenishment.css');
var API = read('assets/js/api/operation-system-db-api.js');
var TRANSPORT = read('assets/js/api/km-transport.js');
var CMP = read('assets/js/utils/inventory-compat.js');
var EVDIR = 'docs/evidence/cp2p-ir-expand';
function ev(name) { return JSON.parse(read(EVDIR + '/' + name)); }

var SHIPPED = [], VARIANT = [];
for (var i = 1; i <= 10; i++) { SHIPPED.push(ev('shipped-' + i + '.json')); VARIANT.push(ev('deferred-variant-' + i + '.json')); }
function expands(r) { return (r.measurement.expands || []).filter(function (e) { return e.tag !== 'collapse'; }); }
function runMed(r, f) { return med(expands(r).map(f)); }

// ==============================================================================================================
section('A. THE CAPTURES DESCRIBE THE PAGE THAT IS ON DISK');
// ==============================================================================================================
Object.keys(SHIPPED[0].sources).forEach(function (rel) {
  eq(sha(rel), SHIPPED[0].sources[rel], 'A1 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
ok(VARIANT[0].sources['assets/js/pages/inventory-replenishment.js']
   !== SHIPPED[0].sources['assets/js/pages/inventory-replenishment.js'],
  'A2 the variant captures describe DIFFERENT page source — they are not a copy of the shipped run');
ok(VARIANT[0].sources['assets/js/pages/inventory-replenishment.js'] !== sha('assets/js/pages/inventory-replenishment.js'),
  'A3 and that source is NOT what is on disk, because the variant was withdrawn');
ok(SHIPPED.every(function (r) { return r.measurement.rowCount === 100; }),
  'A4 every capture rendered the 100-SKU station');
ok(SHIPPED.every(function (r) { return !r.measurement.fatal; }) && VARIANT.every(function (r) { return !r.measurement.fatal; }),
  'A5 and none of them threw');
eq(SHIPPED[0].config.skus, 100, 'A6 the fixture size is recorded beside the numbers');

// ==============================================================================================================
section('B. §A — WHERE THE TIME GOES IN THE SHIPPED HANDLER');
// ==============================================================================================================
var dispatch = [].concat.apply([], SHIPPED.map(function (r) { return expands(r).map(function (e) { return e.ms_click_to_handler; }); }));
ok(Math.max.apply(null, dispatch) < 5,
  'B1 click to handler entry is under 5 ms — the dispatch was never the cost', { maxMs: Math.max.apply(null, dispatch) });

var callsPerRun = SHIPPED.map(function (r) { return r.measurement.getCalls.length; });
ok(med(callsPerRun) >= 50,
  'B2 a capture of five expands makes fifty-plus full-table assemblies', { medianCalls: med(callsPerRun) });
var meanCall = med(SHIPPED.map(function (r) {
  var c = r.measurement.getCalls; return c.reduce(function (s, x) { return s + x.ms; }, 0) / c.length;
}));
ok(meanCall > 10, 'B2a each one costs real time at 100 SKUs', { meanMs: meanCall });

ok(/getReplenishmentData\(\)/.test(code(extractFn(PAGE, 'toggleReplenRow'))),
  'B3 the expand handler assembles the whole station to find ONE row');
ok(/getReplenishmentData\(\)/.test(code(extractFn(PAGE, '_irRevealSkuData_'))),
  'B3a the reveal does it again for the same row');
ok(/getReplenishmentData\(\)/.test(code(extractFn(PAGE, '_irRecoRerenderSummariesRender_'))),
  'B3b and every recommendation transition does it again for the whole card set');
ok(/_getCloudReplenishmentData/.test(code(extractFn(PAGE, 'getReplenishmentData'))),
  'B4 and the function behind them is the full cloud assembly, with no memo of any kind');

// ==============================================================================================================
section('C. §A — THE DEFERRED VARIANT: measured, paired, and NOT shipped');
// ==============================================================================================================
var pairs = [];
for (var p = 0; p < 10; p++) {
  pairs.push({
    dExec: runMed(VARIANT[p], function (e) { return e.ms_click_to_exec_resolved; })
         - runMed(SHIPPED[p], function (e) { return e.ms_click_to_exec_resolved; }),
    dPaint: runMed(VARIANT[p], function (e) { return e.ms_click_to_paint; })
          - runMed(SHIPPED[p], function (e) { return e.ms_click_to_paint; })
  });
}
eq(pairs.length, 10, 'C1 ten interleaved pairs, each its own control');
ok(pairs.every(function (x) { return x.dPaint < -30; }),
  'C2 the variant painted much sooner in EVERY pair', { medianDeltaMs: med(pairs.map(function (x) { return x.dPaint; })) });
eq(pairs.filter(function (x) { return x.dExec > 0; }).length, 10,
  'C3 and finished LATER in ten of ten — a consistent result, not a noisy one');
ok(med(pairs.map(function (x) { return x.dExec; })) > 20,
  'C3a by a median of tens of milliseconds', { medianDeltaMs: med(pairs.map(function (x) { return x.dExec; })) });

var shippedExec = SHIPPED.map(function (r) { return runMed(r, function (e) { return e.ms_click_to_exec_resolved; }); });
ok(Math.max.apply(null, shippedExec) / Math.min.apply(null, shippedExec) > 1.15,
  'C4 the SHIPPED side alone varies run to run by more than the effect — which is why the comparison is '
  + 'paired and not pooled',
  { minMs: Math.min.apply(null, shippedExec), maxMs: Math.max.apply(null, shippedExec) });

var REJ = ev('rejected-single-frame.json');
ok(REJ.variant === 'single-rAF' && REJ.verdict === 'REJECTED',
  'C5 an earlier single-frame variant is recorded as rejected too');
ok(REJ.perCallMeanMs.after > REJ.perCallMeanMs.before,
  'C5a with its own reason: it forced a layout the shipped handler does not', REJ.perCallMeanMs);

// ==============================================================================================================
section('D. §A — WHAT THE VARIANT DID GET RIGHT, recorded so it is not re-derived');
// ==============================================================================================================
var SC = ev('scenarios-ok.json');
eq(SC.measurement.abPanels, 1, 'D1 expanding B while A was open left exactly ONE panel');
eq(SC.measurement.afterSwitch.panelsOpen, 0, 'D2 switching station left no panel open');
eq(SC.measurement.afterLeave.panels, 0, 'D3 leaving the page mid-build left no panel');
eq(SC.measurement.afterLeave.shells, 0, 'D3a and no orphaned shell');
eq(SC.measurement.afterLeave.fatal, null, 'D3b and nothing threw');
eq(SC.measurement.dialogs.length, 0, 'D4 and the page raised no dialog at any point');
ok(SC.sources['assets/js/pages/inventory-replenishment.js'] !== sha('assets/js/pages/inventory-replenishment.js'),
  'D5 these guards were exercised against the VARIANT, and this says so rather than implying otherwise');

// ==============================================================================================================
section('E. §B — THE GAP READ HAS ITS OWN BOUND, AND IT IS NOT THE SHARED TRANSPORT BOUND');
// ==============================================================================================================
ok(/var KM_READ_TIMEOUT_MS_ = 45000;/.test(API), 'E1 the scoped-read bound is 45 000 ms');
ok(/_readTimeoutMs = \(deps\.readTimeoutMs > 0\) \? deps\.readTimeoutMs : 60000/.test(TRANSPORT),
  'E1a while the shared transport bound is 60 000 ms — a different clock, and the Summary runs on the first');
var GAPREAD = code(extractFn(API, '_kmGapRead_'));
ok(/_kmFetchBounded_\(url, init, 'read'\)/.test(GAPREAD),
  'E2 the gap read goes through the bounded fetch, not the shared transport run()');
ok(/_kmTimeoutError_\(action, 'read', netErr\.timeoutMs\)/.test(GAPREAD),
  'E2a and a timeout is reported with the bound that produced it');
ok(/code: 'REQUEST_TIMEOUT'/.test(code(extractFn(API, '_kmTimeoutError_'))), 'E3 whose code is REQUEST_TIMEOUT');
ok(/status: 'READ_ERROR'/.test(code(extractFn(PAGE, 'loadInventoryGap_'))),
  'E4 a failed gap read lands as READ_ERROR on the materialized state');
ok(/c\.indexOf\('TIMEOUT'\) !== -1/.test(code(extractFn(CMP, 'classifyReadFailure'))),
  'E5 which the readiness classifier turns into the REQUEST_TIMEOUT code');
ok(/REQUEST_TIMEOUT: 'No answer arrived before the request timed out\.'/.test(PAGE),
  'E6 and that is the sentence shown beside it');
ok(/readiness\.error\.code/.test(code(extractFn(PAGE, '_irRevealErrorHtml_'))),
  'E7 the panel prints the error CODE — which is where the Owner read REQUEST_TIMEOUT');

// ==============================================================================================================
section('F. §B — THE FOUR OUTCOMES STAY FOUR');
// ==============================================================================================================
var RECO = code(extractFn(CMP, 'recommendationReadiness'));
ok(/case 'READ_ERROR': return mk\(S\.ERROR/.test(RECO), 'F1 a read error is an ERROR');
ok(/case 'EMPTY': return mk\(S\.EMPTY/.test(RECO), 'F2 an empty result is EMPTY — a different thing, with its own code');
ok(!/case 'READ_ERROR': return mk\(S\.EMPTY/.test(RECO), 'F3 and an ERROR is never degraded into an EMPTY or a zero');
ok(/case 'IDLE': case 'LOADING': return mk\(S\.LOADING/.test(RECO), 'F4 while a read still in flight is LOADING, not either of them');
ok(/if \(code === CODES\.REQUEST_TIMEOUT\) return false;/.test(TRANSPORT),
  'F5 a read timeout is NOT auto-retried — asking again doubles the wait');
ok((GAPREAD.match(/attemptN <= 2/g) || []).length === 1 && /redirectTarget404/.test(GAPREAD),
  'F6 the only second attempt on this path is the redirect-target recovery, not a retry of a timeout');

var gapReqs = SC.requestLog.filter(function (r) { return r.action === 'inventoryReplenishmentGap.get'; });
eq(gapReqs.length, 2, 'F7 the gap read was dispatched ONCE PER SEARCH — two searches, two reads');
ok(/if \(typeof _irRecoTrigger === 'function'\) _irRecoTrigger\(\);/.test(code(PAGE)),
  'F8 because the trigger belongs to the Search path');
ok(!/_irRecoTrigger\(\)/.test(code(extractFn(PAGE, 'toggleReplenRow'))),
  'F8a and expanding a row dispatches no gap read at all');

// ==============================================================================================================
section('G. §B — WHAT THE PASSIVE EVIDENCE CAN AND CANNOT SAY');
// ==============================================================================================================
function gapSamples(r) {
  return ((r.measurement.transport && r.measurement.transport.samples) || [])
    .filter(function (s) { return s.action === 'inventoryReplenishmentGap.get'; });
}
var ERR = ev('scenarios-gap-error.json'), SLOW = ev('scenarios-gap-slow.json');
var errSamples = gapSamples(ERR);
ok(errSamples.length > 0 && errSamples.every(function (s) { return s.phase === 'SUCCESS'; }),
  'G1 a REFUSED gap read still records phase SUCCESS — the sample reports the TRANSPORT, not readiness', errSamples);
eq(gapSamples(SLOW).length, 0,
  'G2 a read still in flight records NO sample — so "no sample" must not be read as "never dispatched"');
ok(/if \(_metrics\.samples\.length < 400\)/.test(TRANSPORT),
  'G3 and the sample log is bounded at 400, so a long session can lose the one being looked for');

// ==============================================================================================================
section('H. WHAT THIS ROUND DOES NOT CLAIM');
// ==============================================================================================================
var worstPaint = Math.max.apply(null, [].concat.apply([], SHIPPED.map(function (r) {
  return expands(r).map(function (e) { return e.ms_click_to_paint; }); })));
ok(worstPaint < 1000,
  'H1 the ~1 s the Owner reports was NOT reproduced at 100 SKUs — the worst first paint measured is far below it',
  { worstMs: worstPaint });
ok(!/REQUEST_TIMEOUT/.test(code(extractFn(PAGE, 'toggleReplenRow'))),
  'H2 nothing in the expand path interprets a gap timeout — the two subjects stayed separate');
ok(!/_irInsertExpandShell_|_irScheduleExpandBuild_|replen-expand-panel--shell/.test(PAGE),
  'H3 the shell-first variant is NOT in the shipped page — it was withdrawn, not quietly left in');
ok(!/replen-expand-shell__status/.test(CSSSRC), 'H3a and neither is its stylesheet rule');

console.log('\n----------------------------------------');
console.log('IR EXPAND LATENCY + GAP READ TIMEOUT (S8-B3-R3-CP2P): ' + pass + ' passed, ' + fail + ' failed');
console.log('----------------------------------------');
if (fail > 0) process.exitCode = 1;
