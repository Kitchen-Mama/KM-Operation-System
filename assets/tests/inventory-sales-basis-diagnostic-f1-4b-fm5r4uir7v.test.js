// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R7V sales-basis self-diagnosing BLOCKED note.
// Run: node assets/tests/inventory-sales-basis-diagnostic-f1-4b-fm5r4uir7v.test.js
// -----------------------------------------------------------------------------
// R7 surfaced the SPECIFIC sales reason (SALES_BASIS_UNAVAILABLE / SALES_BASIS_AMBIGUOUS) instead of the generic
// HORIZONS_NOT_AVAILABLE. R7V goes one step further so the LIVE BLOCKED note NAMES the exact data cause without a
// server-log dive: each fail-closed reason now carries a compact `detail` (matched daily-row count, distinct
// channel set, resolved country). Diagnostic ONLY — no threshold moved, no fail-closed rule relaxed, the reason
// TOKEN is unchanged. gapInvMapFromLines_ still surfaces whatever string it is given verbatim.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var WS = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var GAP_SRC = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

section('§1 recoWsResolveSalesRate_ attaches a compact diagnostic detail to every fail-closed reason');
ok(/reason: 'SALES_BASIS_UNAVAILABLE', detail: 'no daily rows @ '/.test(WS), 'D1 zero-scoped-rows → detail names the resolved country/marketplace');
ok(/reason: 'SALES_BASIS_AMBIGUOUS', detail: 'channels=' \+ chKeys\.length/.test(WS), 'D2 ambiguous channel → detail names the distinct channel count + the channel set');
ok(/\(blank\)/.test(WS), 'D3 a blank channel is shown as (blank) so an unlabeled-channel data gap is obvious');
ok(/reason: 'SALES_BASIS_UNAVAILABLE', detail: 'non-finite avg \(' \+ daily\.length/.test(WS), 'D4 a non-finite run-rate → detail names the matched daily-row count');

section('§1 the reason + detail is stamped verbatim onto the line (marketplace + warehouse)');
ok(/salesReason = \(sr\.reason \|\| 'SALES_BASIS_UNAVAILABLE'\) \+ \(sr\.detail \? ': ' \+ sr\.detail : ''\)/.test(WS), 'S1 marketplace path appends the detail to the reason');
ok(/whSalesReason = \(wsr\.reason \|\| 'SALES_BASIS_UNAVAILABLE'\) \+ \(wsr\.detail \? ': ' \+ wsr\.detail : ''\)/.test(WS), 'S2 warehouse path appends the detail too');
ok(/mLine\.horizonsBlockedReason = salesReason/.test(WS), 'S3 the enriched reason flows into line.horizonsBlockedReason (→ the materialized note)');

section('§1 the diagnostic is metadata only — no threshold moved, no rule relaxed');
ok(/if \(chKeys\.length !== 1\) return \{ ok: false, reason: 'SALES_BASIS_AMBIGUOUS'/.test(WS), 'R1 the single-channel fail-closed rule is unchanged (still !== 1)');
ok(/if \(!daily\.length\) return \{ ok: false, reason: 'SALES_BASIS_UNAVAILABLE'/.test(WS), 'R2 the no-rows fail-closed rule is unchanged');

section('§1 materialization surfaces the full enriched string verbatim (round-trip)');
var gap = (new Function(GAP_SRC + '\n;return { map: gapInvMapFromLines_ };'))();
var row = gap.map([{ horizons: [], horizonsBlockedReason: 'SALES_BASIS_AMBIGUOUS: channels=2 [FBA,(blank)]' }],
  { company: 'ResUS', country: 'US', marketplace: 'Amazon' }, 'CO1100-R', '2026-08-08');
eq(row.calculation_status, 'BLOCKED', 'M1 empty horizons → BLOCKED');
eq(row.note, 'SALES_BASIS_AMBIGUOUS: channels=2 [FBA,(blank)]', 'M2 the note carries the SPECIFIC reason + live diagnostic detail verbatim (self-explaining BLOCKED)');

console.log('\n----------------------------------------');
console.log('R7V SALES-BASIS DIAGNOSTIC (F1-4B-FM5-R4UI-R7V): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
