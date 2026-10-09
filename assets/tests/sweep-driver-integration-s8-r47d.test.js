// S8-R47-D — THE SWEEP DRIVER'S INTEGRATION GATE.
//
// Run: node assets/tests/sweep-driver-integration-s8-r47d.test.js
//
// The R47-B collector was proved correct against strings. That is not the same as proving the
// DRIVER feeds it correctly, and the gap between those two is exactly where the old sweep lived: a
// correct idea about failure, wired to a `grep '^FAIL'` that could not see half of it.
//
// So this suite writes real fixture suites to a temp directory, runs the real driver over them as
// child processes, and checks the verdicts that come back. Every fixture is one of the failure
// shapes this repository has actually produced, including both historical inverse cases:
//
//   • exit 1, output ONLY on stderr, no FAIL line   — the ten dead F1A harnesses
//   • exit 0 with a FAIL line                        — s2-r4b-shipping-history-and-fc-warm-race
//   • an INDENTED FAIL line                          — live-readback-and-display-closure
//
// Nothing is written inside the repository. The fixtures live in the OS temp directory and are
// removed afterwards, so the sweep driver can never be tested by dirtying the tree it measures.

var fs = require('fs');
var os = require('os');
var path = require('path');

var DRIVER = require(path.join(__dirname, '..', 'tools', 'run-regression-sweep.js'));

var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// --- fixture suites, each a tiny real Node program -----------------------------------------------
var FIXTURES = {
    'a-clean.test.js':
        "console.log('ok one'); console.log('PASS  3 passed, 0 failed, 2 mutants, 0 survived, vacuity clean');",
    // THE TEN DEAD HARNESSES: dies on stderr, prints nothing on stdout, exits nonzero.
    'b-silent-nonzero.test.js':
        "throw new ReferenceError('_irAppliedScopeKey_ is not defined');",
    // THE INVERSE CASE: a FAIL line with exit 0.
    'c-fail-exit-zero.test.js':
        "console.log('FAIL the warm race left a stale row'); console.log('2 passed, 1 failed');",
    // LIVE-READBACK: the FAIL line is INDENTED.
    'd-indented-fail.test.js':
        "console.log('  FAIL A8 the restore branch exists'); console.log('78 passed, 3 failed'); process.exitCode = 1;",
    'e-failed-summary.test.js':
        "console.log('40 passed, 2 failed');",
    'f-missing-summary.test.js':
        "console.log('ok did a thing'); console.log('ok did another');",
    'g-vacuous.test.js':
        "console.log('PASS  9 passed, 0 failed, 0 mutants, 0 survived');",
    'h-mutant-survived.test.js':
        "console.log('PASS  9 passed, 0 failed, 4 mutants, 1 survived');",
    'i-no-assertions.test.js':
        "console.log('PASS  0 passed, 0 failed');"
};

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'km-sweep-'));
Object.keys(FIXTURES).forEach(function (n) { fs.writeFileSync(path.join(TMP, n), FIXTURES[n], 'utf8'); });

function cleanup() { try { Object.keys(FIXTURES).forEach(function (n) { fs.unlinkSync(path.join(TMP, n)); }); fs.rmdirSync(TMP); } catch (e) {} }

// =============================================================================================
console.log('\n§A — ENUMERATION');
// =============================================================================================
var listed = DRIVER.enumerateSuites(TMP);
eq(listed.length, Object.keys(FIXTURES).length, 'A1 every fixture suite is enumerated');
eq(listed, listed.slice().sort(), 'A2 ... in a deterministic sorted order');
eq(listed.filter(function (f, i, a) { return a.indexOf(f) !== i; }), [], 'A3 ... with no duplicates');

// =============================================================================================
console.log('\n§B — EVERY SUITE IS CLASSIFIED THROUGH THE COLLECTOR');
// =============================================================================================
var ru = DRIVER.sweep({ dir: TMP, quiet: true });
eq(ru.total, Object.keys(FIXTURES).length, 'B1 the roll-up accounts for every suite — none missing');
eq(ru.registered_count, Object.keys(FIXTURES).length, 'B2 ... and reports the registered count');
var names = ru.records.map(function (r) { return r.suite_name; });
eq(names.filter(function (n, i, a) { return a.indexOf(n) !== i; }), [], 'B3 ... with no duplicated records');
ok(ru.records.every(function (r) { return typeof r.verdict === 'string' && Array.isArray(r.reason_codes); }),
    'B4 every record carries a verdict and reason codes — nothing is unclassified');

function rec(n) { return ru.records.filter(function (r) { return r.suite_name === n; })[0]; }

// =============================================================================================
console.log('\n§C — THE TEN REQUIRED SIGNALS, END TO END THROUGH REAL PROCESSES');
// =============================================================================================
eq(rec('a-clean').verdict, 'CLEAN', 'C1 a genuinely clean suite is CLEAN');

// (1) exit-code capture + (2) stderr availability. This fixture prints NOTHING on stdout.
var silent = rec('b-silent-nonzero');
eq(silent.verdict, 'NOT_CLEAN', 'C2 a suite that dies on stderr with exit 1 is NOT_CLEAN');
ok(silent.exit_code !== 0 && silent.exit_code != null, 'C2a exit code is captured (' + silent.exit_code + ')');
ok(silent.reason_codes.indexOf('NONZERO_EXIT') !== -1, 'C2b ... by NONZERO_EXIT');
ok(silent.reason_codes.indexOf('MISSING_SUMMARY') !== -1, 'C2c ... and MISSING_SUMMARY — nothing ran');
ok(silent.output_classification !== 'EMPTY',
    'C2d STDERR REACHED THE CLASSIFIER — a stdout-only driver would have seen an empty suite');

// (5) zero exit with FAIL lines + (10) exit 0 alone can never mean CLEAN.
var inverse = rec('c-fail-exit-zero');
eq(inverse.exit_code, 0, 'C3 the inverse case really does exit 0');
eq(inverse.verdict, 'NOT_CLEAN', 'C3a ... and is still NOT_CLEAN');
ok(inverse.reason_codes.indexOf('FAIL_WITH_ZERO_EXIT') !== -1, 'C3b ... named FAIL_WITH_ZERO_EXIT');

// (3) indented FAIL lines.
var indented = rec('d-indented-fail');
eq(indented.verdict, 'NOT_CLEAN', 'C4 an INDENTED FAIL line is detected');
eq(indented.fail_lines, 1, 'C4a ... and counted');

// (6) failed-summary counts.
var fsum = rec('e-failed-summary');
eq(fsum.verdict, 'NOT_CLEAN', 'C5 a failed-summary count at exit 0 is NOT_CLEAN');
eq([fsum.passed_assertions, fsum.failed_assertions], [40, 2], 'C5a ... with both counts parsed');

// (7) missing / unparseable summaries fail closed.
eq(rec('f-missing-summary').verdict, 'NOT_CLEAN', 'C6 a missing summary FAILS CLOSED, never clean-by-default');

// (8) vacuity and surviving mutants.
eq(rec('g-vacuous').verdict, 'NOT_CLEAN', 'C7 a vacuous (zero-mutant) run is NOT_CLEAN');
eq(rec('h-mutant-survived').verdict, 'NOT_CLEAN', 'C8 a surviving mutant is NOT_CLEAN');
eq(rec('i-no-assertions').verdict, 'NOT_CLEAN', 'C9 a zero-assertion run is NOT_CLEAN');

// (10) restated as a population property: exactly one fixture is clean, eight are not.
eq([ru.clean, ru.not_clean], [1, 8], 'C10 exactly one fixture is CLEAN — exit 0 alone never earns it');

// =============================================================================================
console.log('\n§D — DETERMINISTIC MACHINE-READABLE ROLL-UP');
// =============================================================================================
ok(ru.by_reason && typeof ru.by_reason === 'object', 'D1 the roll-up carries a reason tally');
eq(ru.not_clean_suites.length, 8, 'D2 ... and names every not-clean suite');
var again = DRIVER.sweep({ dir: TMP, quiet: true });
eq(again.records.map(function (r) { return r.suite_name + ':' + r.verdict; }),
   ru.records.map(function (r) { return r.suite_name + ':' + r.verdict; }),
   'D3 two runs produce identical verdicts — the roll-up is deterministic');
ok(JSON.stringify(ru).length > 0 && typeof JSON.parse(JSON.stringify(ru)) === 'object',
    'D4 ... and serialises to JSON for machine consumption');

// =============================================================================================
console.log('\n§E — WORKTREE INTEGRITY REPORTING');
// =============================================================================================
ok(typeof ru.worktree_integrity === 'string', 'E1 the sweep reports worktree integrity');
ok(['INTACT', 'DIRTY_AFTER_SWEEP'].indexOf(ru.worktree_integrity) !== -1, 'E2 ... as a known verdict');
ok(Array.isArray(ru.worktree_dirty_after), 'E3 ... and lists any paths left dirty');

cleanup();

// This suite reports NO mutation score, deliberately. Its nine fixtures are negative FIXTURES, not
// mutants of its own code, and printing "9 mutants, 0 survived" would claim a kind of rigour it does
// not have -- to a collector that parses exactly that string. Overstating coverage to your own
// detector is the failure this round exists to end.
console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed'
    + '  (9 negative fixtures, all detected)');
if (failed > 0) process.exitCode = 1;
