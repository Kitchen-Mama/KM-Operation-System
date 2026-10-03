// =============================================================================================================
// S8-R3B — SAMPLE ANALYSIS
//
//   node assets/tools/s8-fatigue/s8-r3b-analyze.js <samples.json>
//
// Turns the runner's ledger into the §5 table. It classifies, it does not judge: a slow response is
// PERFORMANCE_DEBT and never a FUNCTIONAL_DEFECT, because §5 says so and because the two have different owners.
//
// IT INVENTS NO THRESHOLD. The repository has exactly one recorded acceptance number for a read surface — the
// client's own bounded-read timeout — and one historical observation set for FC Summary. Everything else is
// reported as a measurement with no verdict attached, which is the honest output of a first baseline.
// =============================================================================================================

'use strict';
var fs = require('fs');

var file = process.argv[2];
if (!file) { console.error('usage: s8-r3b-analyze.js <samples.json>'); process.exit(2); }
var R = JSON.parse(fs.readFileSync(file, 'utf8'));
var ALL = R.samples.filter(function (s) { return s.dispatched && !s.dry_run; });

// A SAMPLE THAT MEASURED THE VALIDATOR IS NOT A SAMPLE OF THE SURFACE.
// Two owners refuse an unscoped request in about a millisecond. A run that sent no scope therefore produced
// fast, failing samples that describe the parameter check and nothing else. Averaging them into the surface's
// timing would understate its cost, and classifying them as failures would report the harness's own missing
// parameter as a Production defect. They are separated here and counted on their own.
var UNSCOPED = ALL.filter(function (s) { return s.scope_required === true && s.scoped === false; });
var S = ALL.filter(function (s) { return !(s.scope_required === true && s.scoped === false); });

function med(a) {
  if (!a.length) return null;
  var b = a.slice().sort(function (x, y) { return x - y; });
  var m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : Math.round((b[m - 1] + b[m]) / 2);
}
function by(pred) { return S.filter(pred); }
function msOf(a) { return a.map(function (s) { return s.ms; }); }

var actions = [];
S.forEach(function (s) { if (actions.indexOf(s.action) === -1) actions.push(s.action); });

console.log('S8-R3B READ-PATH FATIGUE — MEASURED');
console.log('run ' + R.started + ' → ' + R.finished + '   cycles=' + R.cycles + ' warm=' + R.warm + ' concurrency=' + R.concurrency);
console.log('');

var rows = [];
actions.forEach(function (a) {
  var all = by(function (s) { return s.action === a; });
  var cold = by(function (s) { return s.action === a && /^cold/.test(s.phase); });
  var warm = by(function (s) { return s.action === a && s.phase === 'warm'; });
  var rep = by(function (s) { return s.action === a && s.phase === 'repeat'; });
  var steady = warm.concat(rep);
  var fails = all.filter(function (s) { return s.success !== true; });
  var timeouts = all.filter(function (s) { return s.error_code === 'CLIENT_TIMEOUT'; });
  var empties = all.filter(function (s) { return s.empty === true; });
  // A stale response is a SUCCESSFUL read whose row total differs from the run's modal total for that action.
  // Nothing wrote during the run, so a differing total is either a concurrent operator edit or a stale answer —
  // and either way it is a fact worth surfacing rather than smoothing away.
  var totals = {};
  all.forEach(function (s) { if (s.row_total !== null && s.row_total !== undefined) totals[s.row_total] = (totals[s.row_total] || 0) + 1; });
  var tk = Object.keys(totals);
  var modal = tk.sort(function (x, y) { return totals[y] - totals[x]; })[0];
  var drift = tk.length > 1 ? tk.length - 1 : 0;

  rows.push({
    action: a, surface: all[0].surface, owner: all[0].owner,
    coldN: cold.length, coldMs: msOf(cold), coldMed: med(msOf(cold)), coldMax: Math.max.apply(null, msOf(cold).concat([0])),
    warmN: steady.length, warmMed: med(msOf(steady)), warmMax: Math.max.apply(null, msOf(steady).concat([0])),
    warmMin: Math.min.apply(null, msOf(steady).concat([Infinity])),
    bytes: all[0].bytes, rows: modal === undefined ? null : Number(modal),
    fails: fails.length, timeouts: timeouts.length, empties: empties.length, drift: drift,
    codes: fails.map(function (s) { return s.error_code; }).filter(function (c, i, z) { return z.indexOf(c) === i; })
  });
});

rows.sort(function (x, y) { return (y.warmMed || 0) - (x.warmMed || 0); });

console.log('SURFACE'.padEnd(42) + 'COLD'.padStart(8) + 'WARMmed'.padStart(9) + 'WARMmax'.padStart(9) +
  'WARMmin'.padStart(9) + 'N'.padStart(5) + 'KB'.padStart(8) + 'ROWS'.padStart(8) + '  FAIL');
rows.forEach(function (r) {
  console.log(r.action.padEnd(42) +
    String(r.coldMed).padStart(8) + String(r.warmMed).padStart(9) + String(r.warmMax).padStart(9) +
    String(r.warmMin).padStart(9) + String(r.warmN).padStart(5) +
    (r.bytes ? (r.bytes / 1024).toFixed(0) : '-').padStart(8) +
    String(r.rows === null ? '-' : r.rows).padStart(8) +
    '  ' + (r.fails ? r.fails + ' ' + r.codes.join(',') : '0'));
});

// ---- phase totals -------------------------------------------------------------------------------------------
console.log('');
['cold-first', 'cold', 'warm', 'repeat', 'away-before', 'away-other', 'away-return'].forEach(function (p) {
  var a = by(function (s) { return s.phase === p; });
  if (!a.length) return;
  console.log('phase ' + p.padEnd(13) + 'n=' + String(a.length).padStart(3) +
    '  median=' + String(med(msOf(a))).padStart(7) + ' ms   max=' + String(Math.max.apply(null, msOf(a))).padStart(7) + ' ms');
});

// ---- cold vs warm, per action ------------------------------------------------------------------------------
console.log('\nCOLD PREMIUM (first execution minus steady-state median)');
rows.forEach(function (r) {
  if (r.coldMed === null || r.warmMed === null) return;
  var d = r.coldMed - r.warmMed;
  console.log('  ' + r.action.padEnd(42) + (d >= 0 ? '+' : '') + String(d).padStart(7) + ' ms' +
    (r.warmMed ? '   x' + (r.coldMed / r.warmMed).toFixed(2) : ''));
});

// ---- away / return ------------------------------------------------------------------------------------------
var away = by(function (s) { return /^away/.test(s.phase); });
if (away.length) {
  console.log('\nROUTE-AWAY / RETURN');
  var pairs = {};
  away.forEach(function (s) { (pairs[s.cycle] = pairs[s.cycle] || []).push(s); });
  Object.keys(pairs).forEach(function (k) {
    var g = pairs[k];
    var b = g.filter(function (s) { return s.phase === 'away-before'; })[0];
    var o = g.filter(function (s) { return s.phase === 'away-other'; })[0];
    var r = g.filter(function (s) { return s.phase === 'away-return'; })[0];
    if (!b || !r) return;
    console.log('  ' + b.action.padEnd(38) + 'before=' + String(b.ms).padStart(7) + ' ms   away(' +
      (o ? o.action.split('.')[0] : '-') + ')=' + String(o ? o.ms : '-').padStart(7) +
      ' ms   return=' + String(r.ms).padStart(7) + ' ms   delta=' + (r.ms - b.ms >= 0 ? '+' : '') + (r.ms - b.ms) + ' ms');
  });
}

// ---- the row-count invariant ---------------------------------------------------------------------------------
//
// COMPARED PER OWNER, NOT ACROSS OWNERS. Two owners publish different counts under the SAME key: overseasStock
// reports `warehouses: 5` (the factory subset its read needs) while inventoryReplenishment reports the full 361.
// Merging them produced a "CHANGED warehouses 5 → 361" that was this analyser's own key collision and not a row
// moving anywhere. An invariant that can raise a false alarm on a safety claim is worse than no invariant, so
// each action is compared only against its own earlier samples.
console.log('\nROW-COUNT INVARIANT (per owner, first sample vs every later one)');
var byAction = {};
S.forEach(function (s) { if (s.counts) (byAction[s.action] = byAction[s.action] || []).push(s.counts); });
var movedKeys = 0, totalKeys = 0, comparisons = 0;
Object.keys(byAction).sort().forEach(function (a) {
  var runs = byAction[a], base = runs[0], keys = Object.keys(base).sort();
  var unstable = keys.filter(function (k) { return runs.some(function (c) { return c[k] !== base[k]; }); });
  totalKeys += keys.length;
  movedKeys += unstable.length;
  comparisons += runs.length;
  console.log('  ' + a.padEnd(40) + 'samples=' + String(runs.length).padStart(3) +
    '  keys=' + String(keys.length).padStart(3) +
    '  moved=' + (unstable.length ? unstable.join(',') : '0'));
  if (unstable.length) {
    unstable.forEach(function (k) {
      console.log('      ' + k + ': ' + runs.map(function (c) { return c[k]; }).join(' → '));
    });
  }
});
console.log('  owners=' + Object.keys(byAction).length + '  successful reads compared=' + comparisons +
  '  count keys=' + totalKeys + '  keys that moved=' + movedKeys);

// ---- safety ---------------------------------------------------------------------------------------------------
console.log('\nSAFETY');
Object.keys(R.safety).forEach(function (k) { console.log('  ' + k.padEnd(30) + R.safety[k]); });
var zw = S.filter(function (s) { return s.zero_write === true; }).length;
var zwFalse = S.filter(function (s) { return s.zero_write === false; }).length;
console.log('  responses asserting zero_write   ' + zw + '   (explicit false: ' + zwFalse + ')');
var nonExec = S.filter(function (s) { return s.final_host && s.final_host !== 'script.googleusercontent.com'; });
console.log('  responses from an unexpected host ' + nonExec.length);

// ---- classification ---------------------------------------------------------------------------------------------
console.log('\nCLASSIFICATION');
var functional = rows.filter(function (r) { return r.fails > r.timeouts; });
var blocking = rows.filter(function (r) { return r.timeouts > 0; });
var empty = rows.filter(function (r) { return r.empties > 0; });
console.log('  FUNCTIONAL_DEFECT   ' + (functional.length ? functional.map(function (r) { return r.action + '(' + r.codes.join(',') + ')'; }).join(' ') : 'none'));
console.log('  BLOCKING_TIMEOUT    ' + (blocking.length ? blocking.map(function (r) { return r.action + '(' + r.timeouts + ')'; }).join(' ') : 'none'));
console.log('  FALSE_EMPTY         ' + (empty.length ? empty.map(function (r) { return r.action + '(' + r.empties + ')'; }).join(' ') : 'none'));
console.log('  ROW_TOTAL_DRIFT     ' + (rows.filter(function (r) { return r.drift; }).map(function (r) { return r.action + '(' + r.drift + ')'; }).join(' ') || 'none'));
// The repository's OWN acceptance number — not one invented here. A scoped read that exceeds it is a timeout in
// the browser regardless of what this harness's longer budget observed.
var CLIENT_READ_TIMEOUT_MS = 45000;
var over = S.filter(function (s) { return s.success === true && s.ms > CLIENT_READ_TIMEOUT_MS; });
var overBy = {};
over.forEach(function (s) { overBy[s.action] = (overBy[s.action] || 0) + 1; });
console.log('  OVER KM_READ_TIMEOUT_MS_ (' + CLIENT_READ_TIMEOUT_MS + ' ms) — these SUCCEEDED here but time out in the browser');
console.log('                      ' + (Object.keys(overBy).length
  ? Object.keys(overBy).map(function (a) { return a + '(' + overBy[a] + ')'; }).join(' ') : 'none'));

if (UNSCOPED.length) {
  console.log('\nEXCLUDED FROM THE TABLE — unscoped samples that measured the owner\'s validator, not the surface');
  var ub = {};
  UNSCOPED.forEach(function (s) { ub[s.action] = (ub[s.action] || 0) + 1; });
  Object.keys(ub).forEach(function (a) { console.log('  ' + a.padEnd(42) + ub[a] + ' samples'); });
  console.log('  These are a HARNESS fault, not a Production defect. Re-measure with --scope.');
}

console.log('');
console.log('MEASURED_REQUESTS = ' + S.length + '   FAILED = ' + S.filter(function (s) { return s.success !== true; }).length +
  '   UNSCOPED_DISCARDED = ' + UNSCOPED.length + '   DISPATCHED_TOTAL = ' + ALL.length);
