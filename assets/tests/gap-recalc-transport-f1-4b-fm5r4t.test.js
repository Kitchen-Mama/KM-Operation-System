// Kitchen Mama Operation System — F1-4B-FM5-R4T Gap Materialization long-running-request transport hardening.
// Run: node assets/tests/gap-recalc-transport-f1-4b-fm5r4t.test.js
// -----------------------------------------------------------------------------
// Transport failure != calculation failure. On a lost/broken response the client performs bounded READ-ONLY
// verification of the materialized gap table (never re-POSTs the write). Classifies SERVER_COMPLETED_RESPONSE_LOST
// / SUCCESS_RECOVERED / SERVER_COMPLETION_UNCONFIRMED. Inventory + Order Planning share ONE contract.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GR = require('../js/utils/gap-recalc-transport.js');
var INV = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');
var GAP = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var SCHED = read('specs/active/apps-script/44_gap_materialization_scheduler.gs');
var UTIL = read('js/utils/gap-recalc-transport.js');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
var immediate = function () { return Promise.resolve(); };   // fake clock: bounded schedule with zero real delay
var PRE = '2026-08-09 13:00:00', ADV = '2026-08-09 13:20:00';

// Verify helper: refetch is READ-ONLY (increments reads); maxFn returns ADV once reads >= advanceOnRead.
function scenario(advanceOnRead) {
  var reads = 0, writes = 0;
  var refetch = function () { reads++; return Promise.resolve({ readOnly: true }); };
  var maxFn = function () { return (advanceOnRead && reads >= advanceOnRead) ? ADV : PRE; };
  return { refetch: refetch, maxFn: maxFn, get reads() { return reads; }, get writes() { return writes; } };
}

// =============================================================================================================
section('C — fetch throws but calculated_at ALREADY advanced → SERVER_COMPLETED_RESPONSE_LOST');
var sC = scenario(1);
GR.verify(PRE, sC.refetch, sC.maxFn, { wait: immediate }).then(function (r) {
  ok(r.classification === GR.CLASSIFICATION.RESPONSE_LOST, 'C1 first read shows advancement → RESPONSE_LOST');
  ok(r.polls === 1 && sC.reads === 1, 'C2 exactly one (immediate) read; no polling needed');
  ok(r.postMax === ADV, 'C3 postMax reflects the advanced calculated_at');
});

section('D — fetch throws and materialized row advances on a LATER poll → SUCCESS_RECOVERED');
var sD = scenario(2);   // advances on the 2nd read
GR.verify(PRE, sD.refetch, sD.maxFn, { wait: immediate }).then(function (r) {
  ok(r.classification === GR.CLASSIFICATION.RECOVERED, 'D1 advances on a bounded poll → SUCCESS_RECOVERED');
  ok(r.polls === 2 && sD.reads === 2, 'D2 recovered on the second read (one bounded poll)');
});

section('E — fetch throws and never advances → SERVER_COMPLETION_UNCONFIRMED (bounded)');
var sE = scenario(0);   // never advances
GR.verify(PRE, sE.refetch, sE.maxFn, { wait: immediate, schedule: [1, 2, 3, 4] }).then(function (r) {
  ok(r.classification === GR.CLASSIFICATION.UNCONFIRMED, 'E1 never advances → UNCONFIRMED (never a fabricated success)');
  ok(sE.reads === 5, 'E2 bounded: exactly 1 immediate + 4 scheduled reads, then stop (no infinite poll)');
});

section('F/G — recovery is READ ONLY: no write function, no POST, bounded');
ok(GR.verify.length >= 3, 'F1 verify takes (preMax, refetchFn, maxFn) — no write parameter exists');
ok(!/fetch\(|XMLHttpRequest|\.update\(|recalculate\w*All|method:\s*'POST'|action\s*[:=]/.test(UTIL), 'G1 the shared module issues NO fetch/POST/write action (read-only verification only)');
ok(!/calculation_status\s*=/.test(UTIL), 'G2 the module never assigns calculation_status (READY/BLOCKED stay business state)');
ok(JSON.stringify(GR.DEFAULT_SCHEDULE) === JSON.stringify([2000, 5000, 10000, 20000]), 'G3 bounded default polling cadence = 2s/5s/10s/20s');

section('isTransportError classification (transport != business failure)');
ok(GR.isTransportError({ code: 'HTTP_TRANSPORT_ERROR' }) === true && GR.isTransportError({ code: 'NON_JSON_RESPONSE' }) === true, 'T1 transport codes classified as transport');
ok(GR.isTransportError({ code: 'VALIDATION_FAILED' }) === false && GR.isTransportError({ code: 'SALES_BASIS_UNAVAILABLE' }) === false, 'T2 a structured server/business error is NOT a transport error (→ FAILED, not recovery)');

section('recover — UX messages (never claims failure)');
var msgs = [];
GR.recover('Inventory', PRE, scenario(1).refetch, function () { return ADV; }, { wait: immediate, notify: function (m) { msgs.push(m); } }).then(function () {
  ok(/verifying/i.test(msgs[0]), 'R1 first message = "verifying" (not "failed")');
  ok(/completed/i.test(msgs[msgs.length - 1]), 'R2 recovered → "recalculation completed" message');
});
var msgs2 = [];
GR.recover('Order Planning', PRE, scenario(0).refetch, function () { return PRE; }, { wait: immediate, schedule: [1], notify: function (m) { msgs2.push(m); } }).then(function () {
  ok(/unable to confirm/i.test(msgs2[msgs2.length - 1]), 'R3 unconfirmed → "unable to confirm completion" (no false failure)');
});

section('A/B — page outcome mapping (success vs explicit server error)');
var invHandler = INV.slice(INV.indexOf('function handleRecalcAllInventoryGap'), INV.indexOf('window.handleRecalcAllInventoryGap'));
ok(/res && res\.success && res\.data/.test(invHandler) && /refreshInventoryGapAfterRecalc_\(\)/.test(invHandler), 'A1 success envelope → summary + READ refresh (SUCCESS)');
ok(/Recalculation failed:/.test(invHandler) && /_irIsTransportError_\(e\)/.test(invHandler), 'B1 a non-transport server error → explicit FAILED (only transport routes to recovery)');

section('F — the WRITE batch command is POSTed exactly ONCE (never retried in recovery)');
ok((invHandler.match(/recalculateInventoryReplenishmentGapAll\(/g) || []).length === 1, 'F2 Inventory handler calls the write command exactly once');
var roHandler = RO.slice(RO.indexOf('function handleRecalcAllOrderPlanningGap'), RO.indexOf('window.handleRecalcAllOrderPlanningGap'));
ok((roHandler.match(/recalculateOrderPlanningGapAll\(/g) || []).length === 1, 'F3 Order Planning handler calls the write command exactly once');
ok(!/recalculate\w*All/.test(UTIL), 'F4 the recovery module NEVER calls a recalculate/write command');

section('H/I/J — no per-SKU HTTP; both pages refresh via the READ after recovery');
ok(/_irRecalcTransportRecovery_\('Inventory', preMax, refreshInventoryGapAfterRecalc_, _irMaxCalculatedAt_/.test(INV) && /gapRecalc\.recover\(product, preMax, refetchFn, maxFn/.test(INV), 'I1 Inventory recovery refetches the materialized READ (refreshInventoryGapAfterRecalc_) via the shared contract');
ok(/gr\.recover\('Order Planning', preMax, refreshOrderPlanningGapAfterRecalc_, _roMaxCalculatedAt_/.test(RO), 'J1 Order Planning recovery refetches the materialized READ (refreshOrderPlanningGapAfterRecalc_) via the shared contract');
ok(!/for\s*\([^)]*sku[^)]*\)\s*\{[^}]*fetch\(/i.test(UTIL) && !/getInventoryReplenishmentGap[\s\S]{0,40}for\s*\(/.test(UTIL), 'H1 recovery issues ONE scope READ per poll — no per-SKU HTTP loop');

section('K/L/M/N — READY/BLOCKED untouched · formula untouched · payload compact · no new DB table');
ok(/materializationRunId: runId/.test(GAP) && /startedAt: startedAt/.test(GAP) && /finishedAt = summary\.calculatedAt/.test(GAP), 'M1 batch summary carries run identity + start/finish (compact meta)');
ok(!/env\.data\.lines[\s\S]{0,40}summary\.|summary\.[a-z]*rows\s*=\s*lines|summary\.skus/.test(GAP), 'M2 the summary carries COUNTS only — never the per-SKU line rows');
ok(!/KMHP|KMTPP|KMCALC|KMPD|KMALLOC|KMMSA/.test(UTIL) && !/KMHP|KMTPP|KMCALC/.test(GAP.slice(GAP.indexOf('function gapRunId_'), GAP.indexOf('function gapRunBatch_'))), 'L1 no formula owner referenced by the transport/run-id additions');
ok(/GAP-' \+ p \+ '-' \+ ts/.test(GAP) && !/SpreadsheetApp[\s\S]{0,40}insertSheet|new table/i.test(GAP.slice(GAP.indexOf('function gapRunId_'), GAP.indexOf('function gapRunBatch_'))), 'N1 run id is in-memory (io clock + seq) — no new DB table/schema');

section('O — manual + scheduled batch owners remain identical');
ok(/handleRecalculateInventoryReplenishmentGapBatch_\(\{ requestId: 'SCHED-INV-GAP' \}/.test(SCHED) && /handleRecalculateOrderPlanningGapBatch_\(\{ requestId: 'SCHED-OP-GAP' \}/.test(SCHED), 'O1 the scheduler invokes the SAME batch owners the manual buttons call (one pathway)');

section('wiring — shared module loaded once, both pages delegate');
ok(/utils\/gap-recalc-transport\.js/.test(INDEX), 'W1 the shared module is included in index.html');
ok(/window\.KM\.gapRecalc/.test(INV) && /window\.KM && window\.KM\.gapRecalc/.test(RO), 'W2 both pages delegate to the ONE shared contract');

// summary printed after the async verify/recover chains settle.
setTimeout(function () {
  console.log('\n----------------------------------------');
  console.log('R4T GAP RECALC TRANSPORT (F1-4B-FM5-R4T): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
}, 50);
