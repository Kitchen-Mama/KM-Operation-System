// S8-R47-B — THE RESULT COLLECTOR. A suite is NOT_CLEAN if ANY signal fires.
//
// WHY THIS EXISTS. The sweep's detector was `grep '^FAIL'`, and for several rounds it reported 6
// not-clean suites when the truth was 17. Two blind spots, in opposite directions:
//
//   • TEN suites threw a ReferenceError before printing anything. They exited 1 and printed no FAIL
//     line, so a FAIL-line detector counted them as neither passing nor failing.
//   • `s2-r4b-shipping-history-and-fc-warm-race` prints a FAIL line and EXITS 0. An exit-code
//     detector counts it clean.
//
// Neither detector is wrong; each is incomplete, and each misses exactly what the other catches.
// So the verdict is the UNION. One signal is never enough, and that is the whole design.
//
//   • `live-readback-and-display-closure-f1-7n-fb-4e-r4b` prints `  FAIL A8 ...` — INDENTED. The
//     anchored `^FAIL` never matched it while the suite failed in plain sight, for rounds. That is
//     why S2 is /^\s*FAIL\b/m and not /^FAIL/m. One missing `\s*` hid a live failing suite.
//
// FAIL CLOSED, ALWAYS. A result that cannot be parsed is NOT_CLEAN, never clean-by-default. A suite
// that printed no assertions is NOT_CLEAN even at exit 0, because "nothing ran" is not "nothing
// wrong" — that is precisely the state the ten dead suites were in.

// --- signal reason codes ------------------------------------------------------------------------
var R = {
    NONZERO_EXIT: 'NONZERO_EXIT',
    FAIL_LINES: 'FAIL_LINES',
    SUMMARY_FAILED: 'SUMMARY_FAILED',
    FAIL_WITH_ZERO_EXIT: 'FAIL_WITH_ZERO_EXIT',
    MISSING_SUMMARY: 'MISSING_SUMMARY',
    AMBIGUOUS_SUMMARY: 'AMBIGUOUS_SUMMARY',
    NO_ASSERTIONS: 'NO_ASSERTIONS',
    VACUOUS: 'VACUOUS',
    MUTANTS_SURVIVED: 'MUTANTS_SURVIVED'
};

// INDENTED FAIL LINES COUNT. See the header.
var FAIL_LINE = /^[ \t]*FAIL\b/;

// The summary dialects actually in use across this suite set.
var SUMMARY_FORMS = [
    /(\d+)\s+passed\s*,\s*(\d+)\s+failed/i,     // "33 passed, 0 failed"
    /(\d+)\s+passed\s*\/\s*(\d+)\s+failed/i,    // "106 passed / 0 failed"
    /passed\s+(\d+)\s+failed\s+(\d+)/i          // "passed 186  failed 0"
];

function parseSummaries(text) {
    var out = [];
    String(text).split(/\r?\n/).forEach(function (line) {
        for (var i = 0; i < SUMMARY_FORMS.length; i++) {
            var m = SUMMARY_FORMS[i].exec(line);
            if (m) { out.push({ passed: Number(m[1]), failed: Number(m[2]), line: line.trim() }); break; }
        }
    });
    return out;
}

// THE COUNT CAN SIT ON EITHER SIDE OF THE WORD, AND GETTING THAT WRONG INVERTS THE VERDICT.
// `mutants caught 12  survived 0` was read by an earlier draft as TWELVE SURVIVORS, because
// `(\d+)\s+survived` happily matched the CAUGHT count sitting in front of the word. A suite with a
// perfect mutation score was reported NOT_CLEAN. So the "word first" dialects are tried first, and
// the "number first" dialects only fill what they left null.
function parseMutants(text) {
    var t = String(text);
    var declared = null, survived = null;
    var m;

    // --- count AFTER the word:  "mutants caught 12  survived 0" | "mutants 12, survived 0"
    if ((m = /mutants?\s+caught\s+(\d+)/i.exec(t))) declared = Number(m[1]);
    else if ((m = /mutants?\s+(\d+)/i.exec(t))) declared = Number(m[1]);
    if ((m = /survived\s+(\d+)/i.exec(t))) survived = Number(m[1]);
    else if ((m = /missed\s+(\d+)/i.exec(t))) survived = Number(m[1]);

    // --- count BEFORE the word:  "5 mutants, 0 survived" | "mutations: 11 caught, 2 missed"
    if (declared === null && (m = /(\d+)\s+mutants?\b/i.exec(t))) declared = Number(m[1]);
    if (declared === null && (m = /mutations?\s*:?\s*(\d+)\s+caught/i.exec(t))) declared = Number(m[1]);
    if (survived === null && (m = /(\d+)\s+survived/i.exec(t))) survived = Number(m[1]);
    if (survived === null && (m = /(\d+)\s+missed/i.exec(t))) survived = Number(m[1]);

    return { declared: declared, survived: survived };
}

// ONLY SUMMARY-BEARING LINES CARRY A VACUITY VERDICT.
// An any-occurrence match for /VACUOUS/ read co1100r's section heading — "THE PRODUCTION BROWSER
// TOKEN CHECK, AND IT IS NOT VACUOUS" — as a verdict, and reported a 147-assertion suite with a
// perfect mutation score as NOT_CLEAN. A detector that cries wolf gets ignored, which is how a
// baseline rots. Prose is not a verdict; only the line that also carries the summary is.
function parseVacuity(text) {
    var lines = String(text).split(/\r?\n/);
    var candidates = lines.filter(function (l) {
        return /vacuit/i.test(l) || SUMMARY_FORMS.some(function (re) { return re.test(l); });
    });
    for (var i = candidates.length - 1; i >= 0; i--) {
        if (/vacuity\s+clean/i.test(candidates[i])) return 'CLEAN';
        if (/\bVACUOUS\b/.test(candidates[i])) return 'VACUOUS';
    }
    return 'NOT_REPORTED';
}

/**
 * Classify one suite run. `run` = { name, exitCode, stdout }.
 * stderr is expected to be merged into stdout by the driver; a suite that dies throws there.
 */
function classify(run) {
    var name = run && run.name ? String(run.name) : '(unnamed)';
    var text = String((run && run.stdout) == null ? '' : run.stdout);
    var exitCode = (run && run.exitCode == null) ? null : Number(run.exitCode);
    var lines = text.split(/\r?\n/);

    var failLines = lines.filter(function (l) { return FAIL_LINE.test(l); });
    var summaries = parseSummaries(text);
    var mut = parseMutants(text);
    var vacuity = parseVacuity(text);

    var reasons = [];

    // S1 — the exit code. A silent death is still a death.
    if (exitCode === null || exitCode !== 0) reasons.push(R.NONZERO_EXIT);

    // S2 — explicit FAIL lines, indented or not.
    if (failLines.length) reasons.push(R.FAIL_LINES);

    // S5 — the summary must exist and must not contradict itself.
    var authoritative = summaries.length ? summaries[summaries.length - 1] : null;
    if (!authoritative) {
        reasons.push(R.MISSING_SUMMARY);
    } else {
        // A suite that reported failures earlier and then claims a clean total is not trustworthy.
        var contradicts = summaries.some(function (s) { return s.failed > 0; }) && authoritative.failed === 0;
        if (contradicts) reasons.push(R.AMBIGUOUS_SUMMARY);
        // S3 — the summary's own failed count.
        if (authoritative.failed > 0) reasons.push(R.SUMMARY_FAILED);
        // "Nothing ran" is not "nothing wrong".
        if (authoritative.passed === 0 && authoritative.failed === 0) reasons.push(R.NO_ASSERTIONS);
    }

    // S4 — the inverse blind spot, named explicitly so a roll-up can count it.
    if (exitCode === 0 && (failLines.length || (authoritative && authoritative.failed > 0))) {
        reasons.push(R.FAIL_WITH_ZERO_EXIT);
    }

    // S6 — vacuity. A declared-but-empty mutant set proves nothing.
    if (vacuity === 'VACUOUS') reasons.push(R.VACUOUS);
    else if (mut.declared === 0) reasons.push(R.VACUOUS);

    // S7 — surviving mutants.
    if (mut.survived != null && mut.survived > 0) reasons.push(R.MUTANTS_SURVIVED);

    var uniq = reasons.filter(function (x, i) { return reasons.indexOf(x) === i; });

    return {
        suite_name: name,
        exit_code: exitCode,
        output_classification: text.trim() === '' ? 'EMPTY'
            : (authoritative ? 'SUMMARY_PRESENT' : 'NO_SUMMARY'),
        passed_assertions: authoritative ? authoritative.passed : null,
        failed_assertions: authoritative ? authoritative.failed : null,
        fail_lines: failLines.length,
        fail_line_samples: failLines.slice(0, 5).map(function (l) { return l.trim(); }),
        mutant_count: mut.declared,
        survived_mutants: mut.survived,
        vacuity_verdict: vacuity,
        verdict: uniq.length ? 'NOT_CLEAN' : 'CLEAN',
        reason_codes: uniq
    };
}

/** Machine-readable roll-up over many classified records. */
function rollup(records) {
    var byReason = {};
    records.forEach(function (r) {
        r.reason_codes.forEach(function (c) { byReason[c] = (byReason[c] || 0) + 1; });
    });
    return {
        total: records.length,
        clean: records.filter(function (r) { return r.verdict === 'CLEAN'; }).length,
        not_clean: records.filter(function (r) { return r.verdict === 'NOT_CLEAN'; }).length,
        by_reason: byReason,
        not_clean_suites: records.filter(function (r) { return r.verdict === 'NOT_CLEAN'; })
            .map(function (r) { return { suite: r.suite_name, reasons: r.reason_codes }; }),
        records: records
    };
}

/** Human-readable summary. Never hides an unparseable result. */
function report(ru) {
    var out = [];
    out.push('SUITES ' + ru.total + '   CLEAN ' + ru.clean + '   NOT_CLEAN ' + ru.not_clean);
    Object.keys(ru.by_reason).sort().forEach(function (k) {
        out.push('  ' + k + ': ' + ru.by_reason[k]);
    });
    if (ru.not_clean_suites.length) {
        out.push('  --- not clean ---');
        ru.not_clean_suites.forEach(function (s) {
            out.push('  ' + s.suite + '  [' + s.reasons.join(',') + ']');
        });
    }
    return out.join('\n');
}

module.exports = { classify: classify, rollup: rollup, report: report, REASONS: R, FAIL_LINE: FAIL_LINE };
