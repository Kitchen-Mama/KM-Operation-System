// S8-R47-D — THE REGRESSION SWEEP DRIVER, WIRED THROUGH THE R47-B COLLECTOR.
//
// Run: node assets/tools/run-regression-sweep.js [--out <json>] [--only <substring>]
//
// WHY A TRACKED DRIVER. The sweep had been a shell loop plus `grep '^FAIL'`, living in a scratch
// directory. That detector reported 6 not-clean suites when the truth was 17, and because it was
// never committed, nothing about how the baseline was measured could be reviewed or repeated. Both
// problems are the same problem: the measurement was not part of the repository.
//
// EVERY suite goes through `_suite-result-collector.js`. There is no second path and no
// short-circuit: a suite cannot be reported CLEAN because its exit code was zero, because the
// verdict is the union of seven signals and the exit code is only one of them.
//
// stdout AND stderr are both captured and concatenated before classification. The ten F1A harnesses
// died with a ReferenceError on stderr while stdout stayed empty; a driver that reads only stdout
// sees nothing at all and has no idea the suite never ran.
//
// SERIAL, AND NEVER INTERRUPTED. Suites rewrite real source files during mutation testing and
// restore them afterwards. Two at once corrupt each other, and a killed run leaves a mutant behind,
// which is why the sweep verifies worktree integrity when it finishes.

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var TESTS_DIR = path.join(ROOT, 'assets', 'tests');
var COLLECTOR = require(path.join(TESTS_DIR, '_suite-result-collector.js'));

var PER_SUITE_TIMEOUT_MS = 10 * 60 * 1000;

/** The registry: every *.test.js, sorted, so two runs enumerate identically. */
function enumerateSuites(dir) {
    return fs.readdirSync(dir || TESTS_DIR)
        .filter(function (f) { return /\.test\.js$/.test(f); })
        .sort();
}

/**
 * Run one suite and classify it. Returns the collector's record, unmodified.
 * stderr is merged into stdout because a suite that dies writes only there.
 */
function runOne(file, dir) {
    var full = path.join(dir || TESTS_DIR, file);
    var r = cp.spawnSync(process.execPath, [full], {
        encoding: 'utf8', cwd: ROOT, timeout: PER_SUITE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024
    });
    // status is null on timeout or signal kill. The collector treats a null exit code as nonzero,
    // which is the fail-closed answer: a suite that did not finish did not pass.
    var merged = String(r.stdout || '') + String(r.stderr || '');
    var rec = COLLECTOR.classify({ name: file.replace(/\.test\.js$/, ''), exitCode: r.status, stdout: merged });
    rec.timed_out = (r.status === null && !!r.error && /timeout|ETIMEDOUT/i.test(String(r.error.message || '')));
    rec.duration_ms = null;
    return rec;
}

/** Worktree integrity. A dirty tree after a sweep means a suite died mid-mutation. */
function worktreeDirty() {
    try {
        var out = cp.execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
        return out.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    } catch (e) { return ['<git status failed: ' + e.message + '>']; }
}

function sweep(opts) {
    opts = opts || {};
    var dir = opts.dir || TESTS_DIR;
    var files = enumerateSuites(dir);
    if (opts.only) files = files.filter(function (f) { return f.indexOf(opts.only) !== -1; });

    var before = worktreeDirty();
    var records = [];
    files.forEach(function (f, i) {
        var t0 = Date.now();
        var rec = runOne(f, dir);
        rec.duration_ms = Date.now() - t0;
        records.push(rec);
        if (!opts.quiet) {
            process.stdout.write(String(i + 1) + '/' + files.length + '  '
                + (rec.verdict === 'CLEAN' ? 'CLEAN    ' : 'NOT_CLEAN') + '  ' + rec.suite_name
                + (rec.reason_codes.length ? '  [' + rec.reason_codes.join(',') + ']' : '') + '\n');
        }
    });
    var after = worktreeDirty();

    var ru = COLLECTOR.rollup(records);
    ru.registered_count = files.length;
    ru.worktree_dirty_before = before;
    ru.worktree_dirty_after = after;
    // A sweep that left the tree dirty cannot be trusted as a baseline, whatever the verdicts say.
    ru.worktree_integrity = (after.length === before.length) ? 'INTACT' : 'DIRTY_AFTER_SWEEP';
    return ru;
}

if (require.main === module) {
    var argv = process.argv.slice(2);
    function arg(name) { var i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; }
    var ru = sweep({ only: arg('--only') });
    console.log('\n' + COLLECTOR.report(ru));
    console.log('\nregistered: ' + ru.registered_count + '   worktree: ' + ru.worktree_integrity);
    var out = arg('--out');
    if (out) { fs.writeFileSync(out, JSON.stringify(ru, null, 1), 'utf8'); console.log('wrote ' + out); }
    if (ru.not_clean > 0 || ru.worktree_integrity !== 'INTACT') process.exitCode = 1;
}

module.exports = { enumerateSuites: enumerateSuites, runOne: runOne, sweep: sweep, worktreeDirty: worktreeDirty };
