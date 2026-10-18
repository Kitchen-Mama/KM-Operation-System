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
//
// CP2U-R3-R1 - AND AFTER EVERY SUITE, NOT ONLY AT THE END. A mutation suite restores in a `finally`,
// which covers returning and throwing but NOT being killed: this driver kills a suite that exceeds
// PER_SUITE_TIMEOUT_MS, and that kill lands wherever the suite happens to be, including inside a
// mutation window. It happened: `product-strategy-corrections-p1-b8d-r9` ran 629 s against a 600 s
// limit, was killed mid-mutation, and left `if (SHOW_CHART_FULLSCREEN)` rewritten to `if (true)`. The
// two product-strategy suites that ran AFTERWARDS then failed on fullscreen assertions and were
// recorded as defects. They were not defects; they were reading a source no commit contains.
//
// An end-of-run integrity check cannot prevent that, because by then every later suite has already
// run against the poisoned file. So the check now runs after EACH suite and ABORTS the sweep at the
// first sign of pollution. The polluted file is deliberately NOT auto-restored: it is the evidence,
// and a tool that quietly rewrites the operator's working tree is a worse hazard than the one it is
// fixing. The abort names the paths and prints the exact restore command.

var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var TESTS_DIR = path.join(ROOT, 'assets', 'tests');
var COLLECTOR = require(path.join(TESTS_DIR, '_suite-result-collector.js'));

var PER_SUITE_TIMEOUT_MS = 10 * 60 * 1000;

/* ONE SWEEP PER WORKTREE. Two sweeps in the same tree mutate the same files, and each would restore
   the other's source from its own stale copy. The lock is keyed by the worktree path and held in the
   OS temp directory, so taking it never dirties the tree it protects. A lock whose owner is gone is
   stale and is reclaimed - a crashed sweep must not block the next one forever. */
function lockPath() {
    var key = crypto.createHash('sha256').update(path.resolve(ROOT)).digest('hex').slice(0, 16);
    return path.join(os.tmpdir(), 'km-regression-sweep-' + key + '.lock');
}
function pidAlive(pid) {
    try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === 'EPERM'; }
}
function acquireLock() {
    var lp = lockPath();
    if (fs.existsSync(lp)) {
        var held = null;
        try { held = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch (e) { held = null; }
        if (held && held.pid && pidAlive(held.pid)) {
            var e2 = new Error('ANOTHER SWEEP IS RUNNING in this worktree (pid ' + held.pid
                + ', started ' + held.startedAt + ').\n'
                + 'Two sweeps mutate the same sources and restore them from different snapshots.\n'
                + 'Lock: ' + lp);
            e2.code = 'SWEEP_LOCKED';
            throw e2;
        }
        try { fs.unlinkSync(lp); } catch (e) { /* stale, best effort */ }
    }
    fs.writeFileSync(lp, JSON.stringify({ pid: process.pid, root: path.resolve(ROOT),
        startedAt: new Date().toISOString() }), 'utf8');
    return lp;
}
function releaseLock(lp) {
    try {
        if (!lp || !fs.existsSync(lp)) return;
        var held = JSON.parse(fs.readFileSync(lp, 'utf8'));
        if (held && held.pid === process.pid) fs.unlinkSync(lp);
    } catch (e) { /* best effort */ }
}

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
    var out = String(r.stdout || ''), err = String(r.stderr || '');
    var rec = COLLECTOR.classify({ name: file.replace(/\.test\.js$/, ''), exitCode: r.status, stdout: out + err });
    rec.timed_out = (r.status === null && !!r.error && /timeout|ETIMEDOUT/i.test(String(r.error.message || '')));
    rec.duration_ms = null;
    // S8-R48-F — the two streams are kept APART even though classification reads them joined. A
    // suite that dies writes only to stderr, and that distinction is what revealed the ten dead
    // harnesses; evidence that merges the streams throws it away.
    rec.raw = { stdout: out, stderr: err };
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

    // The dirty probe is injectable for ONE reason: the abort path below must be testable without
    // dirtying the repository it exists to protect. Production callers never pass it.
    var dirtyProbe = (typeof opts.dirtyProbe === 'function') ? opts.dirtyProbe : worktreeDirty;
    /* THE GUARDS PROTECT THE REPOSITORY'S SOURCES, so they apply to the sweep that can damage them: the
       one over the real tests directory. A sweep over a temp directory of synthetic fixtures (the driver
       integration suite does exactly this) mutates nothing in the tree, and refusing to run it because
       the developer has uncommitted work would be a guard firing where there is nothing to guard. An
       injected dirtyProbe means a test is exercising the guard deliberately, so it counts too. */
    var sweepsRepoSources = path.resolve(dir) === path.resolve(TESTS_DIR);
    var guardsOn = sweepsRepoSources || (typeof opts.dirtyProbe === 'function');
    var before = dirtyProbe();
    // A DIRTY TREE IS NOT A BASELINE. Mutation suites overwrite real sources from a snapshot taken at
    // probe time; starting from uncommitted work means a crashed suite restores the operator's edits
    // to whatever they were mid-run, and it also makes pollution undetectable - we could no longer tell
    // our own leak from the work that was already there.
    if (guardsOn && before.length && !opts.allowDirty) {
        var e = new Error('REFUSING TO SWEEP A DIRTY WORKTREE (' + before.length + ' entr'
            + (before.length === 1 ? 'y' : 'ies') + '):\n  ' + before.join('\n  ')
            + '\nCommit or stash first. --allow-dirty overrides, and forfeits pollution detection.');
        e.code = 'SWEEP_DIRTY_START';
        throw e;
    }

    var lock = (sweepsRepoSources && !opts.noLock) ? acquireLock() : null;
    var records = [], aborted = null;
    try {
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var t0 = Date.now();
            var rec = runOne(f, dir);
            rec.duration_ms = Date.now() - t0;
            records.push(rec);
            if (!opts.quiet) {
                process.stdout.write(String(i + 1) + '/' + files.length + '  '
                    + (rec.verdict === 'CLEAN' ? 'CLEAN    ' : 'NOT_CLEAN') + '  ' + rec.suite_name
                    + (rec.reason_codes.length ? '  [' + rec.reason_codes.join(',') + ']' : '') + '\n');
            }
            // THE POLLUTION CHECK, after every suite. Anything dirty now that was not dirty before is a
            // source this suite failed to restore, and every suite after it would read that file.
            var now = dirtyProbe();
            var fresh = now.filter(function (l) { return before.indexOf(l) === -1; });
            if (guardsOn && fresh.length) {
                var diff = '';
                try { diff = cp.execSync('git diff --stat', { cwd: ROOT, encoding: 'utf8' }); }
                catch (e2) { diff = '<git diff failed: ' + e2.message + '>'; }
                aborted = {
                    after_suite: rec.suite_name,
                    suite_index: i + 1,
                    of: files.length,
                    suite_timed_out: !!rec.timed_out,
                    suite_exit_code: rec.exit_code,
                    polluted_entries: fresh,
                    diff_stat: String(diff).trim(),
                    remaining_suites: files.length - (i + 1),
                    restore_command: 'git checkout -- ' + fresh.map(function (l) {
                        return l.replace(/^\s*\S+\s+/, ''); }).join(' ')
                };
                if (!opts.quiet) {
                    process.stdout.write('\n*** SWEEP ABORTED - a suite left a source unrestored ***\n');
                    process.stdout.write('    after : ' + rec.suite_name
                        + (rec.timed_out ? '  (TIMED OUT - a killed process runs no finally)' : '') + '\n');
                    fresh.forEach(function (l) { process.stdout.write('    dirty : ' + l + '\n'); });
                    process.stdout.write('    ' + aborted.remaining_suites + ' suites were NOT run, so that '
                        + 'none of them reads the polluted source.\n');
                    process.stdout.write('    restore with: ' + aborted.restore_command + '\n');
                }
                break;
            }
        }
    } finally {
        releaseLock(lock);
    }
    var after = dirtyProbe();

    var ru = COLLECTOR.rollup(records);
    ru.registered_count = files.length;
    ru.executed_count = records.length;
    ru.worktree_dirty_before = before;
    ru.worktree_dirty_after = after;
    ru.aborted = aborted;
    // A sweep that left the tree dirty cannot be trusted as a baseline, whatever the verdicts say.
    ru.worktree_integrity = (after.length === before.length) ? 'INTACT' : 'DIRTY_AFTER_SWEEP';
    // An aborted sweep is not a verdict on anything - it stopped early BECAUSE the remaining results
    // would have been measured against a source no commit contains.
    ru.complete = !aborted && records.length === files.length;
    return ru;
}

if (require.main === module) {
    var argv = process.argv.slice(2);
    function arg(name) { var i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; }
    var ru;
    try {
        ru = sweep({ only: arg('--only'), allowDirty: argv.indexOf('--allow-dirty') !== -1 });
    } catch (e) {
        console.error('\n' + (e && e.message || e));
        process.exitCode = 2;
        return;
    }
    console.log('\n' + COLLECTOR.report(ru));
    console.log('\nregistered: ' + ru.registered_count + '   executed: ' + ru.executed_count
        + '   worktree: ' + ru.worktree_integrity + '   complete: ' + ru.complete);
    if (ru.aborted) {
        console.log('ABORTED after ' + ru.aborted.after_suite + ' (' + ru.aborted.suite_index + '/'
            + ru.aborted.of + '); ' + ru.aborted.remaining_suites + ' suites not run');
        process.exitCode = 3;
    }
    var out = arg('--out');
    if (out) {
        // The JSON summary carries no raw bytes; evidence is where those live.
        var slim = JSON.parse(JSON.stringify(ru, function (k, v) { return k === 'raw' ? undefined : v; }));
        fs.writeFileSync(out, JSON.stringify(slim, null, 1), 'utf8'); console.log('wrote ' + out);
    }
    var ev = arg('--evidence');
    if (ev) {
        var EV = require(path.join(__dirname, 'sweep-evidence.js'));
        var head = '';
        try { head = cp.execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) {}
        // --quarantine diverts a secret-bearing batch OUT of the repository rather than losing it.
        // The sweep is authorized once; the scan can only run after it. See sweep-evidence.js.
        var w = EV.writeEvidenceQuarantined({
            root: ev,
            quarantineRoot: arg('--quarantine'),
            runId: arg('--run-id') || ('run-' + new Date().toISOString().replace(/[:.]/g, '-')),
            records: ru.records,
            gitCommit: head,
            collectorHash: EV.sha256(fs.readFileSync(path.join(TESTS_DIR, '_suite-result-collector.js')))
        });
        console.log('evidence: ' + w.result.dir);
        if (w.quarantined) {
            console.log('SECRET_SCAN_FAILED — evidence QUARANTINED outside the repository, not committable.');
            w.findings.forEach(function (f) {
                console.log('  ' + f.suite + ': ' + f.hits.map(function (h) { return h.pattern + '×' + h.count; }).join(', '));
            });
            process.exitCode = 1;
        }
    }
    if (ru.not_clean > 0 || ru.worktree_integrity !== 'INTACT') process.exitCode = 1;
}

module.exports = { enumerateSuites: enumerateSuites, runOne: runOne, sweep: sweep, worktreeDirty: worktreeDirty,
    // CP2U-R3-R1 - the worktree lock and the per-suite pollution abort are exported so they can be
    // tested directly, which is the only way to prove a guard fires without staging a real disaster.
    acquireLock: acquireLock, releaseLock: releaseLock, lockPath: lockPath, pidAlive: pidAlive,
    PER_SUITE_TIMEOUT_MS: PER_SUITE_TIMEOUT_MS };
