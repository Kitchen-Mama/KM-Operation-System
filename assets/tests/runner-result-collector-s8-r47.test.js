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
console.log('\n§D — ROLL-UP');

var RU = C.rollup([CLEAN, SILENT, ZEROEXIT, INDENTED]);
eq([RU.total, RU.clean, RU.not_clean], [4, 1, 3], 'D1 the roll-up counts clean and not-clean');
eq(RU.by_reason[C.REASONS.NONZERO_EXIT], 2, 'D2 ... and tallies each reason code');
ok(C.report(RU).indexOf('NOT_CLEAN 3') !== -1, 'D3 the human report states the not-clean count');
ok(C.report(RU).indexOf('silent-death') !== -1, 'D4 ... and names every not-clean suite');

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

ok(mutants >= 7, 'X9 the mutant set is non-empty (' + mutants + ' mutants) — not vacuous');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed, '
    + mutants + ' mutants, ' + survived + ' survived, ' + (mutants >= 7 ? 'vacuity clean' : 'VACUOUS'));
if (failed > 0) process.exitCode = 1;
