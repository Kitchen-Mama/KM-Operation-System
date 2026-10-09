// S8-R48-F — SWEEP EVIDENCE PERSISTENCE.
//
// WHY. The R47-D baseline was measured once and its raw output was thrown away. The classified
// records survived in a session-scoped scratch file that was never committed, so when the collector
// was later found to be mis-parsing two dialects, the 626 suites could not be RE-CLASSIFIED -- only
// re-run. The arithmetic reconciled and thirteen suites were re-verified by hand, but the baseline
// itself was not independently reproducible. That is the gap this closes.
//
// RAW BYTES ARE KEPT SEPARATELY. Classification consumes stdout and stderr concatenated, because a
// suite that dies writes only to stderr. Evidence stores them as two files and hashes each, so a
// reader can still tell which stream said what -- the distinction that revealed the ten dead
// harnesses in the first place.
//
// FAIL CLOSED, EVERYWHERE. Unknown schema version, missing raw file, hash mismatch, duplicate suite
// record, or a secret in the output: every one of these refuses rather than degrades. Evidence that
// cannot be trusted is worse than no evidence, because it looks like proof.

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var SCHEMA_VERSION = 'km-sweep-evidence/1';

// ---------------------------------------------------------------------------------------------
// SECURITY. Test output is committed to the repository, so it is scanned first. The Apps Script
// /exec URL embeds the deployment id and is treated as sensitive per the project's standing rule
// that remote URLs do not go into committed agent artifacts.
// ---------------------------------------------------------------------------------------------
var SECRET_PATTERNS = [
    { name: 'apps_script_exec_url', re: /script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/g },
    { name: 'apps_script_deployment_id', re: /\bAKfycb[A-Za-z0-9_-]{20,}/g },
    { name: 'bearer_token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
    { name: 'authorization_header', re: /authorization["'\s:=]+[A-Za-z0-9._~+/-]{20,}/gi },
    { name: 'cookie', re: /\b(?:Set-)?Cookie:\s*\S+/gi },
    { name: 'google_api_key', re: /\bAIza[0-9A-Za-z_-]{30,}/g },
    { name: 'private_key_block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { name: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'email_address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g }
];

function scanSecrets(text) {
    var hits = [];
    SECRET_PATTERNS.forEach(function (p) {
        var m = String(text).match(p.re);
        if (m && m.length) hits.push({ pattern: p.name, count: m.length });
    });
    return hits;
}

// ---------------------------------------------------------------------------------------------
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/** Suite names become file names, so they are constrained rather than trusted. */
function safeName(name) {
    var s = String(name);
    if (!/^[A-Za-z0-9._-]+$/.test(s)) throw new Error('unsafe suite name for evidence path: ' + s);
    if (s === '.' || s === '..' || s.indexOf('..') !== -1) throw new Error('path traversal rejected: ' + s);
    return s;
}

function fileHash(p) { return sha256(fs.readFileSync(p)); }

/** Resolve a manifest ref (always POSIX) against the evidence directory, on any platform. */
function refPath(dir, ref) {
    var parts = String(ref).split('/');
    parts.forEach(function (seg) { if (seg === '..') throw new Error('path traversal in evidence ref: ' + ref); });
    return path.join.apply(path, [dir].concat(parts));
}

/** A registry hash, so evidence states WHICH suite set it describes. */
function registryHash(names) {
    return sha256(Buffer.from(names.slice().sort().join('\n'), 'utf8'));
}

/**
 * Persist one sweep. `records` carry `raw: {stdout, stderr}`.
 * Refuses to overwrite an existing run directory, and refuses outright on any secret hit.
 */
function writeEvidence(opts) {
    var root = opts.root;
    var runId = safeName(opts.runId);
    var dir = path.join(root, runId);
    if (fs.existsSync(dir)) throw new Error('evidence run already exists, refusing to overwrite: ' + dir);

    var records = opts.records || [];
    var seen = {};
    records.forEach(function (r) {
        if (seen[r.suite_name]) throw new Error('duplicate suite record: ' + r.suite_name);
        seen[r.suite_name] = 1;
    });

    // Security gate BEFORE anything is written.
    var findings = [];
    records.forEach(function (r) {
        var raw = r.raw || {};
        var hits = scanSecrets(String(raw.stdout || '') + String(raw.stderr || ''));
        if (hits.length) findings.push({ suite: r.suite_name, hits: hits });
    });
    if (findings.length && !opts.allowSecrets) {
        var e = new Error('SECRET_SCAN_FAILED: ' + findings.length + ' suite(s) carry sensitive patterns; nothing written');
        e.findings = findings;
        throw e;
    }

    fs.mkdirSync(path.join(dir, 'raw'), { recursive: true });
    var manifestRecords = records.map(function (r) {
        var n = safeName(r.suite_name);
        // POSIX separators in the manifest. path.join would bake in backslashes on Windows and the
        // evidence would only replay on the machine that wrote it — which is most of what was wrong
        // with the scratch file this replaces.
        var outP = 'raw/' + n + '.out.txt';
        var errP = 'raw/' + n + '.err.txt';
        var so = Buffer.from(String((r.raw && r.raw.stdout) || ''), 'utf8');
        var se = Buffer.from(String((r.raw && r.raw.stderr) || ''), 'utf8');
        fs.writeFileSync(refPath(dir, outP), so);
        fs.writeFileSync(refPath(dir, errP), se);
        return {
            suite_name: r.suite_name,
            exit_code: r.exit_code,
            stdout_ref: outP, stderr_ref: errP,
            stdout_sha256: sha256(so), stderr_sha256: sha256(se),
            combined_sha256: sha256(Buffer.concat([so, se])),
            passed_assertions: r.passed_assertions, failed_assertions: r.failed_assertions,
            fail_lines: r.fail_lines,
            mutant_count: r.mutant_count, survived_mutants: r.survived_mutants,
            vacuity_verdict: r.vacuity_verdict,
            verdict: r.verdict, reason_codes: r.reason_codes
        };
    });

    var manifest = {
        schema_version: SCHEMA_VERSION,
        run_id: runId,
        classified_at: opts.classifiedAt || new Date().toISOString(),
        git_commit: opts.gitCommit || null,
        collector_sha256: opts.collectorHash || null,
        suite_registry_hash: registryHash(records.map(function (r) { return r.suite_name; })),
        registered_count: records.length,
        secret_scan: findings.length ? 'FINDINGS_PRESENT' : 'CLEAN',
        records: manifestRecords
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');
    return { dir: dir, manifest: manifest };
}

function readEvidence(dir) {
    var mp = path.join(dir, 'manifest.json');
    if (!fs.existsSync(mp)) throw new Error('evidence manifest missing: ' + mp);
    var m = JSON.parse(fs.readFileSync(mp, 'utf8'));
    if (m.schema_version !== SCHEMA_VERSION) {
        throw new Error('UNKNOWN_SCHEMA_VERSION: ' + m.schema_version + ' (expected ' + SCHEMA_VERSION + ')');
    }
    var seen = {};
    m.records.forEach(function (r) {
        if (seen[r.suite_name]) throw new Error('duplicate suite record in manifest: ' + r.suite_name);
        seen[r.suite_name] = 1;
    });
    return m;
}

/** Recompute every stored hash against the stored bytes. Tampering and loss both surface here. */
function verifyIntegrity(dir) {
    var m = readEvidence(dir);
    var problems = [];
    m.records.forEach(function (r) {
        [['stdout', r.stdout_ref, r.stdout_sha256], ['stderr', r.stderr_ref, r.stderr_sha256]].forEach(function (t) {
            var p = refPath(dir, t[1]);
            if (!fs.existsSync(p)) { problems.push({ suite: r.suite_name, stream: t[0], problem: 'MISSING_RAW' }); return; }
            if (fileHash(p) !== t[2]) problems.push({ suite: r.suite_name, stream: t[0], problem: 'HASH_MISMATCH' });
        });
    });
    return { ok: problems.length === 0, problems: problems, manifest: m };
}

/** Offline reclassification: feed the stored bytes back through a collector and compare verdicts. */
function replay(dir, collector) {
    var v = verifyIntegrity(dir);
    if (!v.ok) { var e = new Error('EVIDENCE_INTEGRITY_FAILED'); e.problems = v.problems; throw e; }
    var diffs = [];
    var replayed = v.manifest.records.map(function (r) {
        var so = fs.readFileSync(refPath(dir, r.stdout_ref), "utf8");
        var se = fs.readFileSync(refPath(dir, r.stderr_ref), "utf8");
        var rec = collector.classify({ name: r.suite_name, exitCode: r.exit_code, stdout: so + se });
        if (rec.verdict !== r.verdict) {
            diffs.push({ suite: r.suite_name, stored: r.verdict, replayed: rec.verdict });
        }
        return rec;
    });
    return { records: replayed, diffs: diffs, manifest: v.manifest };
}

module.exports = {
    SCHEMA_VERSION: SCHEMA_VERSION, scanSecrets: scanSecrets, sha256: sha256, safeName: safeName,
    registryHash: registryHash, writeEvidence: writeEvidence, readEvidence: readEvidence,
    verifyIntegrity: verifyIntegrity, replay: replay, SECRET_PATTERNS: SECRET_PATTERNS
};
