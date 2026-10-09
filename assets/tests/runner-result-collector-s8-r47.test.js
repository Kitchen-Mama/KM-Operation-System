// S8-R47-B — THE RESULT COLLECTOR'S OWN GATE.
//
// Run: node assets/tests/runner-result-collector-s8-r47.test.js
//
// The collector is a DETECTOR, and an undetected broken detector is the exact failure this round
// exists to end: for several rounds the sweep reported 6 not-clean suites when the truth was 17.
// So this suite does two things. §A-§D feed it fixtures shaped like output this repository really
// produces, including the two cases that defeated the old detector. §X then MUTATES the collector
// itself and requires every mutant to be caught — because a collector that cannot fail is just the
// old `grep '^FAIL'` with more code.
//
// Nothing here runs a suite or writes a file. Mutants are applied to an in-memory copy of the
// collector source, so a killed run cannot leave damage behind.

var fs = require('fs'), path = require('path');
var COLLECTOR_PATH = path.join(__dirname, '_suite-result-collector.js');
var C = require('./_suite-result-collector.js');

var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function has(rec, code, m) { ok(rec.reason_codes.indexOf(code) !== -1, m + '  (reasons: ' + rec.reason_codes.join(',') + ')'); }

// =============================================================================================
// §A — THE CLEAN CASE.  If this is not CLEAN, every verdict below is noise.
// =============================================================================================
console.log('\n§A — A GENUINELY CLEAN SUITE');

var CLEAN = C.classify({ name: 'clean', exitCode: 0, stdout:
    'ok   A1 something\nok   A2 something else\n\nPASS  33 passed, 0 failed, 5 mutants, 0 survived, vacuity clean' });
eq(CLEAN.verdict, 'CLEAN', 'A1 a passing suite with mutants and a vacuity verdict is CLEAN');
eq(CLEAN.reason_codes, [], 'A2 ... with no reason codes at all');
eq([CLEAN.passed_assertions, CLEAN.failed_assertions], [33, 0], 'A3 ... and its counts are parsed');
eq([CLEAN.mutant_count, CLEAN.survived_mutants], [5, 0], 'A4 ... as are its mutants');

eq(C.classify({ name: 'slash', exitCode: 0, stdout: 'PASSED  106 passed / 0 failed   mutants 12, survived 0' }).verdict,
    'CLEAN', 'A5 the "passed / failed" dialect parses too');
eq(C.classify({ name: 'spaced', exitCode: 0, stdout: 'passed 186  failed 0  |  mutants caught 12  survived 0' }).verdict,
    'CLEAN', 'A6 ... and the "passed N failed N" dialect');

// =============================================================================================
// §B — THE TWO BLIND SPOTS THAT COST SEVERAL ROUNDS.  Both are real, both are captured shapes.
// =============================================================================================
console.log('\n§B — THE BLIND SPOTS, IN BOTH DIRECTIONS');

// B1 — the ten F1A harnesses: ReferenceError before any output. Exit 1, no FAIL line, no summary.
var SILENT = C.classify({ name: 'silent-death', exitCode: 1, stdout:
    'ReferenceError: _irAppliedScopeKey_ is not defined\n    at eval (eval at <anonymous>)' });
eq(SILENT.verdict, 'NOT_CLEAN', 'B1 a silent nonzero exit is NOT_CLEAN though it prints no FAIL line');
has(SILENT, C.REASONS.NONZERO_EXIT, 'B1a ... by NONZERO_EXIT');
has(SILENT, C.REASONS.MISSING_SUMMARY, 'B1b ... and MISSING_SUMMARY — nothing ran');

// B2 — s2-r4b-shipping-history-and-fc-warm-race: a FAIL line and exit 0.
var ZEROEXIT = C.classify({ name: 'fail-exit-0', exitCode: 0, stdout:
    'FAIL  the warm race left a stale row\n\n12 passed, 1 failed' });
eq(ZEROEXIT.verdict, 'NOT_CLEAN', 'B2 a FAIL line with exit 0 is NOT_CLEAN');
has(ZEROEXIT, C.REASONS.FAIL_WITH_ZERO_EXIT, 'B2a ... and the inverse case is named, so a roll-up can count it');

// B3 — live-readback: INDENTED FAIL lines. `^FAIL` never matched these while the suite failed.
var INDENTED = C.classify({ name: 'indented', exitCode: 1, stdout:
    '\n§A — SITE INVENTORY COMPLETED-RESULT RESTORATION\n'
  + '  FAIL A8 the restore branch exists\n'
  + '  FAIL A8 ... and it never assigns `applied`\n'
  + '  FAIL A8 ... and its revalidation is quiet\n\n78 passed, 3 failed' });
eq(INDENTED.verdict, 'NOT_CLEAN', 'B3 INDENTED FAIL lines are detected');
eq(INDENTED.fail_lines, 3, 'B3a ... all three of them');
has(INDENTED, C.REASONS.SUMMARY_FAILED, 'B3b ... and the summary count agrees');

// =============================================================================================
// §C — THE REMAINING SIGNALS
// =============================================================================================
console.log('\n§C — SUMMARY, VACUITY AND MUTANT SIGNALS');

var FAILCOUNT = C.classify({ name: 'summary-failed', exitCode: 0, stdout: '40 passed, 2 failed' });
eq(FAILCOUNT.verdict, 'NOT_CLEAN', 'C1 a failed-summary count with exit 0 is NOT_CLEAN');
has(FAILCOUNT, C.REASONS.SUMMARY_FAILED, 'C1a ... by SUMMARY_FAILED');

var NOSUM = C.classify({ name: 'no-summary', exitCode: 0, stdout: 'ok   did a thing\nok   did another' });
eq(NOSUM.verdict, 'NOT_CLEAN', 'C2 output with NO parseable summary is NOT_CLEAN, never clean-by-default');
has(NOSUM, C.REASONS.MISSING_SUMMARY, 'C2a ... by MISSING_SUMMARY');

var EMPTY = C.classify({ name: 'empty', exitCode: 0, stdout: '' });
eq(EMPTY.verdict, 'NOT_CLEAN', 'C3 empty output at exit 0 is NOT_CLEAN');
eq(EMPTY.output_classification, 'EMPTY', 'C3a ... and is classified EMPTY rather than hidden');

var NOASSERT = C.classify({ name: 'no-assertions', exitCode: 0, stdout: 'PASS  0 passed, 0 failed' });
eq(NOASSERT.verdict, 'NOT_CLEAN', 'C4 a suite that ran NO assertions is NOT_CLEAN even at exit 0');
has(NOASSERT, C.REASONS.NO_ASSERTIONS, 'C4a ... "nothing ran" is not "nothing wrong"');

var CONTRADICT = C.classify({ name: 'contradicts', exitCode: 0, stdout:
    'section one: 5 passed, 2 failed\nfinal: 40 passed, 0 failed' });
eq(CONTRADICT.verdict, 'NOT_CLEAN', 'C5 a summary that contradicts an earlier one is NOT_CLEAN');
has(CONTRADICT, C.REASONS.AMBIGUOUS_SUMMARY, 'C5a ... by AMBIGUOUS_SUMMARY');

var VAC = C.classify({ name: 'vacuous', exitCode: 0, stdout: 'PASS  10 passed, 0 failed, 0 mutants, 0 survived' });
eq(VAC.verdict, 'NOT_CLEAN', 'C6 a declared-but-EMPTY mutant set is vacuous, not clean');
has(VAC, C.REASONS.VACUOUS, 'C6a ... by VACUOUS');
has(C.classify({ name: 'v2', exitCode: 0, stdout: 'PASS  10 passed, 0 failed, 3 mutants, 0 survived, VACUOUS' }),
    C.REASONS.VACUOUS, 'C6b ... and a self-reported VACUOUS is honoured');

var SURV = C.classify({ name: 'survived', exitCode: 0, stdout: 'PASS  10 passed, 0 failed, 4 mutants, 1 survived' });
eq(SURV.verdict, 'NOT_CLEAN', 'C7 a surviving mutant is NOT_CLEAN even with zero failed assertions');
has(SURV, C.REASONS.MUTANTS_SURVIVED, 'C7a ... by MUTANTS_SURVIVED');
has(C.classify({ name: 'missed', exitCode: 0, stdout: '20 passed, 0 failed\nmutations: 11 caught, 2 missed' }),
    C.REASONS.MUTANTS_SURVIVED, 'C7b ... and "missed" is the same signal under another name');

// C8 — THE COUNT-POSITION REGRESSION. An earlier draft read `mutants caught 12  survived 0` as
// TWELVE SURVIVORS, because the caught count sits in front of the word. A perfect mutation score
// was reported NOT_CLEAN. Each shipped dialect is pinned here so that cannot recur.
var D1 = C.classify({ name: 'd1', exitCode: 0, stdout: 'passed 186  failed 0  |  mutants caught 12  survived 0' });
eq([D1.mutant_count, D1.survived_mutants], [12, 0], 'C8a "mutants caught 12  survived 0" → 12 declared, 0 survived');
eq(D1.verdict, 'CLEAN', 'C8b ... and the suite is CLEAN, not falsely accused');
var D2 = C.classify({ name: 'd2', exitCode: 0, stdout: 'PASSED  106 passed / 0 failed   mutants 12, survived 0' });
eq([D2.mutant_count, D2.survived_mutants], [12, 0], 'C8c "mutants 12, survived 0" → 12 declared, 0 survived');
var D3 = C.classify({ name: 'd3', exitCode: 0, stdout: 'PASS  23 passed, 0 failed, 5 mutants, 0 survived, vacuity clean' });
eq([D3.mutant_count, D3.survived_mutants], [5, 0], 'C8d "5 mutants, 0 survived" → 5 declared, 0 survived');
var D4 = C.classify({ name: 'd4', exitCode: 0, stdout: '20 passed, 0 failed\nmutations: 13 caught, 0 missed' });
eq([D4.mutant_count, D4.survived_mutants], [13, 0], 'C8e "mutations: 13 caught, 0 missed" → 13 declared, 0 survived');

// C9 — PROSE IS NOT A VERDICT. co1100r prints a section heading containing the word VACUOUS; an
// any-occurrence match read it as a vacuity verdict and failed a clean 147-assertion suite.
var PROSE = C.classify({ name: 'prose', exitCode: 0, stdout:
    '== A - THE PRODUCTION BROWSER TOKEN CHECK, AND IT IS NOT VACUOUS ==\n'
  + 'PASSED - 147 passed, 0 failed, mutations 11 caught / 0 missed' });
eq(PROSE.vacuity_verdict, 'NOT_REPORTED', 'C9a the word VACUOUS in a heading is NOT a vacuity verdict');
eq([PROSE.mutant_count, PROSE.survived_mutants], [11, 0], 'C9b ... and "mutations 11 caught / 0 missed" parses');
eq(PROSE.verdict, 'CLEAN', 'C9c ... so the suite is CLEAN');

// C10 — THE R47-D SWEEP REGRESSION. Mutant counts were read from the WHOLE transcript, first match
// wins, so a line of prose far above the summary became the mutation score. b1-product-first-layer
// prints "16 mutants, 0 survived, vacuity clean" and was classified mutants=0 -> VACUOUS ->
// NOT_CLEAN. Thirteen clean suites were accused that way in the full sweep.
var FARPROSE = C.classify({ name: 'farprose', exitCode: 0, stdout:
    'section: zero mutants were needed here, see the note\n'
  + 'ok   some assertion\n'
  + 'PASS  141 passed, 0 failed, 16 mutants, 0 survived, vacuity clean' });
eq([FARPROSE.mutant_count, FARPROSE.survived_mutants], [16, 0],
    'C10a mutant counts come from the SUMMARY line, not from prose earlier in the transcript');
eq(FARPROSE.verdict, 'CLEAN', 'C10b ... so a suite with 16 killed mutants is CLEAN, not VACUOUS');
// And an explicit vacuity verdict outranks a zero-count heuristic.
eq(C.classify({ name: 'explicit', exitCode: 0, stdout: 'PASS 10 passed, 0 failed, vacuity clean' }).verdict,
    'CLEAN', 'C10c an explicit "vacuity clean" is not overruled by an unparsed mutant count');

// C11 — "mutants killed 6/6". With "killed" between the word and the number, the fallbacks skid
// past and match the `failed 0` in FRONT of "mutants" — declaring nine 6/6 suites vacuous in the
// R47-D sweep. killed/total also means survivors are the REMAINDER, not a separate count.
var KILLED = C.classify({ name: 'killed', exitCode: 0, stdout: 'passed 35  failed 0  mutants killed 6/6' });
eq([KILLED.mutant_count, KILLED.survived_mutants], [6, 0], 'C11a "mutants killed 6/6" → 6 declared, 0 survived');
eq(KILLED.verdict, 'CLEAN', 'C11b ... so a 6-of-6 suite is CLEAN, not vacuous');
var PARTIAL = C.classify({ name: 'partial', exitCode: 0, stdout: 'passed 35  failed 0  mutants killed 4/6' });
eq([PARTIAL.mutant_count, PARTIAL.survived_mutants], [6, 2], 'C11c "killed 4/6" → 2 survivors, the remainder');
ok(PARTIAL.reason_codes.indexOf('MUTANTS_SURVIVED') !== -1, 'C11d ... and those survivors are NOT_CLEAN');

// =============================================================================================
// §D — ROLL-UP
// =============================================================================================
console.log('\n§E — R48-A SUMMARY DIALECTS (each with a near-miss that must NOT parse)');
// =============================================================================================
function dia(label, out, wantP, wantF) {
    var r = C.classify({ name: 'd', exitCode: 0, stdout: out });
    eq([r.passed_assertions, r.failed_assertions], [wantP, wantF], label);
    return r;
}

// (A) "PASS 20  FAIL 0"  — and (G), the same line sitting above trailing separator rules.
dia('E-A  "PASS 20  FAIL 0"', 'ok one\nPASS 20  FAIL 0', 20, 0);
dia('E-G  the summary one line above trailing separators is still found',
    'ok one\n----------------------------------------\nPASS 622   FAIL 0\n----------------------------------------', 622, 0);
eq(C.classify({ name: 'n', exitCode: 0, stdout: 'ok one\nPASS 20  FAIL 2' }).reason_codes.indexOf('SUMMARY_FAILED') !== -1,
    true, 'E-A2 ... and a nonzero FAIL in that dialect is still a failure');

// (B) "PASS — passed 253, failed 0, mutants caught 17, survived 0"
var rB = dia('E-B  "passed 253, failed 0, mutants caught 17, survived 0"',
    'PASS — passed 253, failed 0, mutants caught 17, survived 0', 253, 0);
eq([rB.mutant_count, rB.survived_mutants], [17, 0], 'E-B2 ... with the mutant counts read from the SAME line, not confused with the failed count');
eq(rB.verdict, 'CLEAN', 'E-B3 ... and the suite is CLEAN');

// (C) "✓ 21 passed" — the glyph is the suite's own encoding of failed === 0.
dia('E-C  "✓ 21 passed"', 'ok one\n\n✓ 21 passed', 21, 0);
// ... and its failure branch prints the counts in the OPPOSITE order.
dia('E-C2 "✗ 3 FAILED, 18 passed" reads failed FIRST', 'ok one\n\n✗ 3 FAILED, 18 passed', 18, 3);
ok(C.classify({ name: 'c3', exitCode: 1, stdout: '✗ 3 FAILED, 18 passed' }).reason_codes.indexOf('SUMMARY_FAILED') !== -1,
    'E-C3 ... and is reported as a failure, not read as a clean 18');

// (D) "OK — all 22 assertions passed"
dia('E-D  "OK — all 22 assertions passed"', 'ok one\nOK — all 22 assertions passed', 22, 0);
// (E) "All X assertions passed (28 assertions)"
dia('E-E  "All Amazon daily-sales assertions passed (28 assertions)"',
    'ok one\nAll Amazon daily-sales date-key assertions passed (28 assertions)', 28, 0);

// --- NEAR MISSES: none of these may yield a count ------------------------------------------------
function noCount(label, out) {
    var r = C.classify({ name: 'nm', exitCode: 0, stdout: out });
    ok(r.passed_assertions === null && r.reason_codes.indexOf('MISSING_SUMMARY') !== -1, label);
}
noCount('E-N1 "ALL PASS" carries NO number and must never yield one', 'ok one\nALL PASS');
noCount('E-N2 "ALL PASS  (fast path)" likewise', 'ok one\nALL PASS  (fast path)');
noCount('E-N3 "All scope-isolation assertions passed." without a count yields none', 'ok\nAll scope-isolation assertions passed.');
noCount('E-N4 a bare success sentence is not evidence', 'ok\nEverything looks fine');

// Requirement 10 — the one-sided phrases are read ONLY in the terminal region, and the window never
// grows. A success phrase buried far above a long tail is not a summary.
var buried = ['✓ 99 passed'].concat(new Array(30).join('x').split('x').map(function (_, i) { return 'trailing line ' + i; })).join('\n');
noCount('E-N5 a success phrase 30 lines above the end is OUT of the terminal window', buried);

// Requirement 9 — an incomplete matrix can never be CLEAN, whatever else it printed.
var inc = C.classify({ name: 'inc', exitCode: 0, stdout: 'ok one\nPASS 40  FAIL 0\nFULL 40-SCENARIO MATRIX NOT COMPLETE' });
eq(inc.verdict, 'NOT_CLEAN', 'E-N6 an incomplete scenario matrix is NOT_CLEAN even with a clean count');
ok(inc.reason_codes.indexOf('INCOMPLETE') !== -1, 'E-N6b ... named INCOMPLETE');

// Requirement 12 — conflicting counts are unusable.
ok(C.classify({ name: 'cf', exitCode: 0, stdout: 'ok\n✓ 10 passed\n✓ 44 passed' }).reason_codes.indexOf('AMBIGUOUS_SUMMARY') !== -1,
    'E-N7 two success phrases disagreeing on the count are AMBIGUOUS');
// Printed counts outrank a phrase rather than competing with it.
dia('E-N8 a printed count outranks a success phrase in the same output', 'ok\n✓ 10 passed\n7 passed, 1 failed', 7, 1);

// =============================================================================================
console.log('\n§D — ROLL-UP');

var RU = C.rollup([CLEAN, SILENT, ZEROEXIT, INDENTED]);
eq([RU.total, RU.clean, RU.not_clean], [4, 1, 3], 'D1 the roll-up counts clean and not-clean');
eq(RU.by_reason[C.REASONS.NONZERO_EXIT], 2, 'D2 ... and tallies each reason code');
ok(C.report(RU).indexOf('NOT_CLEAN 3') !== -1, 'D3 the human report states the not-clean count');
ok(C.report(RU).indexOf('silent-death') !== -1, 'D4 ... and names every not-clean suite');

// =============================================================================================
// §F — THE TERMINAL-WINDOW BOUNDARY ITSELF
// =============================================================================================
// The window is the riskiest part of this parser: everything inside it is treated as result and
// everything outside it does not exist. §E proved the dialects; this proves the EDGE. The window
// keeps the last 15 non-blank, non-result lines, so "inside" and "outside" are exact and testable
// rather than approximate.
console.log('\n§F — TERMINAL-WINDOW BOUNDARY');

var SUMM = 'PASS  33 passed, 0 failed, 5 mutants, 0 survived, vacuity clean';
function filler(n) { var a = []; for (var i = 0; i < n; i++) a.push('-- diagnostic ' + i + ' --'); return a.join('\n'); }

// (1) + (2) — the boundary is EXACT, and falls closed one line past it.
var ATEDGE = C.classify({ name: 'edge', exitCode: 0, stdout: 'ok a\n' + SUMM + '\n' + filler(14) });
eq([ATEDGE.passed_assertions, ATEDGE.verdict], [33, 'CLEAN'], 'F1 a summary 15th-from-last is INSIDE the window');
var PASTEDGE = C.classify({ name: 'past', exitCode: 0, stdout: 'ok a\n' + SUMM + '\n' + filler(15) });
eq(PASTEDGE.passed_assertions, null, 'F2 ... and 16th-from-last is OUTSIDE it — no number is borrowed');
has(PASTEDGE, 'MISSING_SUMMARY', 'F2a ... which is reported, not guessed');

// (3) — an assertion LABEL may quote anything, including a summary. This suite's own labels do.
var LABELS = C.classify({ name: 'labels', exitCode: 0, stdout:
    'ok   X13 killed — "✗ 3 FAILED, 18 passed" read in the wrong order\n'
  + 'ok   X11 killed — an incomplete scenario matrix allowed to pass\n' + SUMM });
eq([LABELS.passed_assertions, LABELS.verdict], [33, 'CLEAN'], 'F3 a summary quoted in an assertion label is narration, not result');
eq(LABELS.reason_codes, [], 'F3a ... and raises neither AMBIGUOUS nor INCOMPLETE');

// (4) — prose carrying pass/fail numbers in no dialect at all is simply not a summary.
var PROSENUM = C.classify({ name: 'prosenum', exitCode: 0, stdout:
    'note: the R47-D baseline reported 499 clean and 6 failing suites\n' + SUMM });
eq([PROSENUM.passed_assertions, PROSENUM.verdict], [33, 'CLEAN'], 'F4 prose numbers in no dialect are ignored');

// (5) — prose that DOES match a dialect is the honest limit of this parser. It is not silently
// accepted and it does not win: it makes the evidence unusable, which is the fail-closed answer.
var PROSEDIALECT = C.classify({ name: 'prosed', exitCode: 0, stdout:
    'in R47-D the sweep logged 499 passed, 6 failed\n' + SUMM });
has(PROSEDIALECT, 'AMBIGUOUS_SUMMARY', 'F5 prose matching a dialect is AMBIGUOUS, never silently accepted');
ok(PROSEDIALECT.passed_assertions !== 499, 'F5a ... and the prose count never becomes the suite total');

// (6) + (7) — trailing noise below the summary must not displace it.
eq(C.classify({ name: 'sep', exitCode: 0, stdout: SUMM + '\n' + '='.repeat(60) + '\n' + '-'.repeat(60) }).passed_assertions,
    33, 'F6 trailing separator lines do not displace the summary');
eq(C.classify({ name: 'diag', exitCode: 0, stdout: SUMM + '\ncleaning temp dir\ndone in 1.2s' }).passed_assertions,
    33, 'F7 trailing harmless diagnostics do not displace it either');

// (8) + (9) — the two refusals.
has(C.classify({ name: 'none', exitCode: 0, stdout: 'ok a\nok b\n' + filler(3) }), 'MISSING_SUMMARY',
    'F8 output with no summary in its terminal region reports MISSING_SUMMARY');
has(C.classify({ name: 'inc', exitCode: 0, stdout: SUMM + '\nFULL 40-SCENARIO MATRIX NOT COMPLETE' }), 'INCOMPLETE',
    'F9 an incomplete matrix below a clean summary is still INCOMPLETE');

// (10) — MUTATION COUNTS IN UNRELATED PROSE. Found by this round's boundary probe: parseMutants
// still scanned the whole transcript and took the LAST mutant-bearing line, so narration printed
// BELOW the summary outranked it. Each of these three was a NOT_CLEAN suite reading CLEAN.
var HIDDEN = C.classify({ name: 'hidden', exitCode: 0, stdout:
    'ok a\nPASS  33 passed, 0 failed, 4 mutants, 2 survived\n'
  + 'note: 6 mutants were reviewed, 0 survived the review' });
eq([HIDDEN.mutant_count, HIDDEN.survived_mutants], [4, 2], 'F10 trailing prose cannot overwrite the summary mutation score');
has(HIDDEN, 'MUTANTS_SURVIVED', 'F10a ... so real survivors stay visible');
var RESCUED = C.classify({ name: 'rescued', exitCode: 0, stdout:
    'ok a\nPASS  33 passed, 0 failed, 0 mutants, 0 survived\nnote: mutants caught 12  survived 0' });
has(RESCUED, 'VACUOUS', 'F11 ... nor rescue a vacuous run with a borrowed score');
var BYLABEL = C.classify({ name: 'bylabel', exitCode: 0, stdout:
    'PASS  33 passed, 0 failed, 4 mutants, 2 survived\nok   X9 all mutants killed 6/6' });
has(BYLABEL, 'MUTANTS_SURVIVED', 'F12 ... and an assertion LABEL below the summary cannot do it either');

// The split dialect this precedence must NOT break: the score on its own line (C8e).
eq([C.classify({ name: 'split', exitCode: 0, stdout: '20 passed, 0 failed\nmutations: 13 caught, 0 missed' }).mutant_count,
    C.classify({ name: 'split', exitCode: 0, stdout: '20 passed, 0 failed\nmutations: 13 caught, 0 missed' }).survived_mutants],
    [13, 0], 'F13 a score on its OWN line is still read when the summary carries none');

// =============================================================================================
// §X — MUTANTS AGAINST THE COLLECTOR ITSELF
// =============================================================================================
console.log('\n§X — COLLECTOR MUTANTS');

var SRC = fs.readFileSync(COLLECTOR_PATH, 'utf8');
var mutants = 0, survived = 0;

function loadMutated(find, repl) {
    if (SRC.indexOf(find) === -1) throw new Error('mutation anchor absent: ' + find);
    var m = { exports: {} };
    new Function('module', 'exports', 'require', SRC.replace(find, repl))(m, m.exports, require);
    return m.exports;
}
function mutant(label, find, repl, probe) {
    mutants++;
    var killed = false, crashed = false;
    try { killed = probe(loadMutated(find, repl)); } catch (e) { crashed = true; }
    // A crash is NOT a kill: a collector that cannot load tells us nothing about its logic.
    if (crashed) { survived++; failed++; console.log('FAIL X' + mutants + ' CRASHED (not a valid kill) — ' + label); }
    else if (!killed) { survived++; failed++; console.log('FAIL X' + mutants + ' SURVIVED — ' + label); }
    else { passed++; console.log('ok   X' + mutants + ' killed — ' + label); }
}

// X1 — the historical bug, restored: drop `[ \t]*` so indented FAIL lines stop matching.
mutant('anchored ^FAIL misses INDENTED fail lines (the live-readback bug)',
    'var FAIL_LINE = /^[ \\t]*FAIL\\b/;', 'var FAIL_LINE = /^FAIL\\b/;',
    function (M) { return M.classify({ name: 'x', exitCode: 0, stdout: '  FAIL a\n\n5 passed, 0 failed' }).verdict === 'CLEAN'; });

// X2 — drop the exit-code signal: the ten silent deaths come back.
mutant('exit-code signal removed — silent nonzero exits go unnoticed',
    'if (exitCode === null || exitCode !== 0) reasons.push(R.NONZERO_EXIT);', '/* removed */',
    function (M) { return M.classify({ name: 'x', exitCode: 1, stdout: 'ReferenceError: boom\n7 passed, 0 failed' }).verdict === 'CLEAN'; });

// X3 — treat an unparseable result as clean.
mutant('missing summary treated as clean — unparseable results hidden',
    'reasons.push(R.MISSING_SUMMARY);', '/* removed */',
    function (M) { return M.classify({ name: 'x', exitCode: 0, stdout: 'ok did a thing' }).verdict === 'CLEAN'; });

// X4 — stop counting the summary's own failed count.
//
// This one does NOT flip the verdict, and that is the union working as designed: at exit 0 a
// failed count also trips FAIL_WITH_ZERO_EXIT, so the suite is still caught. Requiring a flipped
// verdict here would be asserting that the collector has NO redundancy — the opposite of the goal.
// The kill criterion is therefore the loss of the specific signal, which is a real degradation:
// the roll-up can no longer tell WHY the suite is not clean.
mutant('summary failed-count ignored (signal lost; the union still catches the suite)',
    'if (authoritative.failed > 0) reasons.push(R.SUMMARY_FAILED);', '/* removed */',
    function (M) {
        var r = M.classify({ name: 'x', exitCode: 0, stdout: '3 passed, 9 failed' });
        return r.reason_codes.indexOf('SUMMARY_FAILED') === -1 && r.verdict === 'NOT_CLEAN';
    });
// X4b — and at NONZERO exit the same removal must still leave the suite not-clean.
mutant('summary failed-count ignored at nonzero exit — still caught by the union',
    'if (authoritative.failed > 0) reasons.push(R.SUMMARY_FAILED);', '/* removed */',
    function (M) { return M.classify({ name: 'x', exitCode: 1, stdout: '3 passed, 9 failed' }).verdict === 'NOT_CLEAN'; });

// X5 — let a zero-assertion run pass.
mutant('zero-assertion run treated as clean',
    'if (authoritative.passed === 0 && authoritative.failed === 0) reasons.push(R.NO_ASSERTIONS);', '/* removed */',
    function (M) { return M.classify({ name: 'x', exitCode: 0, stdout: '0 passed, 0 failed' }).verdict === 'CLEAN'; });

// X6 — let a vacuous mutant set pass.
mutant('vacuous (zero-mutant) execution treated as clean',
    "else if (mut.declared === 0 && vacuity !== 'CLEAN') reasons.push(R.VACUOUS);", '/* removed */',
    function (M) { return M.classify({ name: 'x', exitCode: 0, stdout: '9 passed, 0 failed, 0 mutants, 0 survived' }).verdict === 'CLEAN'; });

// X7 — let surviving mutants pass.
mutant('surviving mutants treated as clean',
    'if (mut.survived != null && mut.survived > 0) reasons.push(R.MUTANTS_SURVIVED);', '/* removed */',
    function (M) { return M.classify({ name: 'x', exitCode: 0, stdout: '9 passed, 0 failed, 4 mutants, 2 survived' }).verdict === 'CLEAN'; });

// X8 — the inversion guard: a mutant that must NOT change the clean verdict.
mutants++;
(function () {
    var M = loadMutated("var R = {", "var R = {\n    __UNUSED: 'X',");
    if (M.classify({ name: 'x', exitCode: 0, stdout: 'PASS 5 passed, 0 failed, 2 mutants, 0 survived' }).verdict === 'CLEAN') {
        passed++; console.log('ok   X' + mutants + ' killed by inversion — a harmless edit does not flip a CLEAN verdict');
    } else { survived++; failed++; console.log('FAIL X' + mutants + ' SURVIVED — the collector is verdict-unstable'); }
})();

// --- R48-A mutants: one per way the new dialects could be made to lie ---------------------------

// X9 — drop the terminal-window restriction so success phrases are hunted through the whole
// transcript. A number in prose then becomes an assertion count.
// (The window is the single lever: widening it is exactly the "silently expand until a match
// appears" failure the contract forbids, and it is what re-reads narration as result.)
mutant('the terminal window silently expanded to cover the whole transcript',
    'var TERMINAL_WINDOW_LINES = 15;', 'var TERMINAL_WINDOW_LINES = 100000;',
    function (M) {
        var buried = '✓ 99 passed\n' + new Array(40).join('filler line\n');
        return M.classify({ name: 'x', exitCode: 0, stdout: buried }).passed_assertions === 99;
    });

// X10 — accept a bare success phrase with no number as evidence.
mutant('"ALL PASS" accepted as numeric evidence',
    '/✓\\s*(\\d+)\\s+passed\\b/,', '/\\bALL\\s+PASS\\b()/i, /✓\\s*(\\d+)\\s+passed\\b/,',
    function (M) { return M.classify({ name: 'x', exitCode: 0, stdout: 'ok\nALL PASS' }).reason_codes.indexOf('MISSING_SUMMARY') === -1; });

// X11 — ignore the INCOMPLETE signal.
mutant('an incomplete scenario matrix allowed to pass',
    'reasons.push(R.INCOMPLETE);', '/* removed */',
    function (M) { return M.classify({ name: 'x', exitCode: 0, stdout: 'PASS 40  FAIL 0\nFULL 40-SCENARIO MATRIX NOT COMPLETE' }).verdict === 'CLEAN'; });

// X12 — let a success phrase outrank printed counts, so a stale phrase hides a real failure.
mutant('success phrase allowed to outrank printed counts',
    'var phraseSummaries = summaries.length ? [] : parseTerminalSuccess(text);',
    'var phraseSummaries = parseTerminalSuccess(text); summaries = phraseSummaries.length ? phraseSummaries : summaries;',
    function (M) { return M.classify({ name: 'x', exitCode: 0, stdout: '✓ 10 passed\n7 passed, 1 failed' }).failed_assertions === 0; });

// X13 — read the failure branch of the ✓ dialect in the wrong order, turning 3 failures into 3 passes.
mutant('"✗ 3 FAILED, 18 passed" read in the wrong order',
    'out.push({ passed: Number(fm[2]), failed: Number(fm[1]), line: line.trim(), source: \'counts\' }); return;',
    'out.push({ passed: Number(fm[1]), failed: Number(fm[2]), line: line.trim(), source: \'counts\' }); return;',
    function (M) { return M.classify({ name: 'x', exitCode: 1, stdout: '✗ 3 FAILED, 18 passed' }).passed_assertions === 3; });

// X15 — restore the whole-transcript scan for mutant evidence (the S8-R48-G defect).
// PROBED THROUGH THE SPLIT DIALECT DELIBERATELY. In the common shape the summary line carries the
// score itself, so X16's precedence rule also blocks this mutant and it survives — masked by a
// second defence rather than absent. Here the score sits on its OWN line, precedence does not
// apply, and the scope restriction is the only thing standing between a 2-survivor suite and CLEAN.
mutant('mutant evidence read from the whole transcript — a LABEL outranks the score',
    'return terminalRegion(text).filter(function (l) {', 'return String(text).split(/\\r?\\n/).filter(function (l) {',
    function (M) {
        return M.classify({ name: 'x', exitCode: 0,
            stdout: '20 passed, 0 failed\nmutations: 2 caught, 2 missed\nok   X9 all mutants killed 6/6'
        }).verdict === 'CLEAN';
    });

// X16 — remove the summary-line precedence, so trailing prose hides real survivors again.
mutant('summary-line precedence removed — trailing prose hides surviving mutants',
    'function carriesMutantInfo(line) { return !!line && MUTANT_WORDS.test(line); }',
    'function carriesMutantInfo(line) { return false; }',
    function (M) {
        return M.classify({ name: 'x', exitCode: 0,
            stdout: 'ok a\nPASS  33 passed, 0 failed, 4 mutants, 2 survived\nnote: 6 mutants were reviewed, 0 survived the review'
        }).verdict === 'CLEAN';
    });

ok(mutants >= 13, 'X' + (mutants + 1) + ' the mutant set is non-empty (' + mutants + ' mutants) — not vacuous');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed, '
    + mutants + ' mutants, ' + survived + ' survived, ' + (mutants >= 13 ? 'vacuity clean' : 'VACUOUS'));
if (failed > 0) process.exitCode = 1;
