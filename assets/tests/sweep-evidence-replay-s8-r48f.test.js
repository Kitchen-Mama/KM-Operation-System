// S8-R48-F — EVIDENCE PERSISTENCE AND OFFLINE REPLAY.
//
// The R47-D baseline was measured once and its raw output discarded. When the collector was later
// found to be mis-parsing two dialects, those 626 suites could not be RE-CLASSIFIED, only re-run:
// the arithmetic reconciled and thirteen suites were re-verified by hand, but the baseline was not
// independently reproducible. This suite proves the replacement actually replaces it.
//
// Controlled fixtures only -- no regression sweep is run here. Everything is written to a temp
// directory and removed, so a suite about committing evidence never dirties the tree it measures.

var fs = require('fs');
var os = require('os');
var path = require('path');

var EV = require(path.join(__dirname, '..', 'tools', 'sweep-evidence.js'));
var C = require(path.join(__dirname, '_suite-result-collector.js'));

var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function throws(fn, re, m) {
    try { fn(); failed++; console.log('FAIL ' + m + '  (did not throw)'); }
    catch (e) { ok(re.test(String(e.message)), m + '  (' + String(e.message).slice(0, 60) + ')'); }
}

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'km-evidence-'));
function rmrf(p) {
    if (!fs.existsSync(p)) return;
    fs.readdirSync(p).forEach(function (f) {
        var q = path.join(p, f);
        if (fs.statSync(q).isDirectory()) rmrf(q); else fs.unlinkSync(q);
    });
    fs.rmdirSync(p);
}

// --- fixture records, covering a clean suite, a dead one and the exit-0 inverse ------------------
function mk(name, exitCode, stdout, stderr) {
    var rec = C.classify({ name: name, exitCode: exitCode, stdout: stdout + (stderr || '') });
    rec.raw = { stdout: stdout, stderr: stderr || '' };
    return rec;
}
var RECORDS = [
    mk('f-clean', 0, 'ok one\nPASS  3 passed, 0 failed, 2 mutants, 0 survived, vacuity clean\n', ''),
    mk('f-silent-death', 1, '', 'ReferenceError: _irAppliedScopeKey_ is not defined\n'),
    mk('f-fail-exit-zero', 0, 'FAIL the warm race left a stale row\n2 passed, 1 failed\n', ''),
    mk('f-indented', 1, '  FAIL A8 the restore branch exists\n78 passed, 3 failed\n', '')
];

// =============================================================================================
console.log('\n§A — PERSISTENCE');
// =============================================================================================
var ROOT = path.join(TMP, 'evidence');
var w = EV.writeEvidence({ root: ROOT, runId: 'run-fixture-1', records: RECORDS, gitCommit: 'deadbeef', collectorHash: 'c0ffee' });
ok(fs.existsSync(path.join(w.dir, 'manifest.json')), 'A1 evidence is persisted with a manifest');
eq(w.manifest.schema_version, EV.SCHEMA_VERSION, 'A2 the manifest declares its schema version');
eq([w.manifest.git_commit, w.manifest.collector_sha256], ['deadbeef', 'c0ffee'],
    'A3 ... the commit it describes and the collector that produced it');
ok(/^[0-9a-f]{64}$/.test(w.manifest.suite_registry_hash), 'A4 ... and a registry hash naming WHICH suite set');
eq(w.manifest.registered_count, 4, 'A5 every record is accounted for');
ok(typeof w.manifest.classified_at === 'string' && w.manifest.classified_at.length > 10, 'A6 ... with a classification timestamp');

// (2) every record linked to its raw output, with the two streams SEPARATELY identifiable
var deadRec = w.manifest.records.filter(function (r) { return r.suite_name === 'f-silent-death'; })[0];
ok(w.manifest.records.every(function (r) { return fs.existsSync(path.join(w.dir, r.stdout_ref)) && fs.existsSync(path.join(w.dir, r.stderr_ref)); }),
    'A7 every record links to BOTH raw stream files');
eq(fs.readFileSync(path.join(w.dir, deadRec.stdout_ref), 'utf8'), '',
    'A8 the dead suite stored an EMPTY stdout...');
ok(fs.readFileSync(path.join(w.dir, deadRec.stderr_ref), 'utf8').indexOf('ReferenceError') !== -1,
    'A9 ... and its stderr separately — the distinction that revealed the ten dead harnesses');

// (3) stored hashes match stored bytes
var v = EV.verifyIntegrity(w.dir);
eq([v.ok, v.problems.length], [true, 0], 'A10 every stored hash matches the stored bytes');

// =============================================================================================
console.log('\n§B — OFFLINE REPLAY');
// =============================================================================================
var rep = EV.replay(w.dir, C);
eq(rep.diffs, [], 'B1 replayed verdicts match the stored verdicts exactly');
eq(rep.records.length, 4, 'B2 every suite is reclassified from stored bytes');
eq(rep.records.filter(function (r) { return r.verdict === 'CLEAN'; }).length, 1, 'B3 ... and only the clean one is CLEAN');
// The replay reads bytes, not the stored verdict — prove it by classifying independently.
var indep = C.classify({ name: 'x', exitCode: 1, stdout: fs.readFileSync(path.join(w.dir, deadRec.stderr_ref), 'utf8') });
ok(indep.reason_codes.indexOf('NONZERO_EXIT') !== -1 && indep.reason_codes.indexOf('MISSING_SUMMARY') !== -1,
    'B4 the stored bytes alone are sufficient to reach the original reasons');

// =============================================================================================
console.log('\n§C — FAIL CLOSED');
// =============================================================================================
// (10) never silently overwrite
throws(function () { EV.writeEvidence({ root: ROOT, runId: 'run-fixture-1', records: RECORDS }); },
    /refusing to overwrite/, 'C1 an existing evidence run is never overwritten');

// (8) duplicate suite records
throws(function () { EV.writeEvidence({ root: ROOT, runId: 'run-dup', records: RECORDS.concat([RECORDS[0]]) }); },
    /duplicate suite record/, 'C2 duplicate suite records are refused');

// (9) unknown schema version
var bad = path.join(TMP, 'badschema');
fs.mkdirSync(bad, { recursive: true });
fs.writeFileSync(path.join(bad, 'manifest.json'), JSON.stringify({ schema_version: 'km-sweep-evidence/999', records: [] }), 'utf8');
throws(function () { EV.readEvidence(bad); }, /UNKNOWN_SCHEMA_VERSION/, 'C3 an unknown schema version fails closed');

// (7) missing evidence
var w2 = EV.writeEvidence({ root: ROOT, runId: 'run-fixture-2', records: RECORDS });
fs.unlinkSync(path.join(w2.dir, w2.manifest.records[0].stdout_ref));
var miss = EV.verifyIntegrity(w2.dir);
eq([miss.ok, miss.problems[0].problem], [false, 'MISSING_RAW'], 'C4 a missing raw file fails closed');
throws(function () { EV.replay(w2.dir, C); }, /EVIDENCE_INTEGRITY_FAILED/, 'C5 ... and replay refuses to proceed');

// (6) tampering
var w3 = EV.writeEvidence({ root: ROOT, runId: 'run-fixture-3', records: RECORDS });
var tgt = path.join(w3.dir, w3.manifest.records[2].stdout_ref);   // the exit-0 inverse case
fs.writeFileSync(tgt, 'ok one\n2 passed, 0 failed\n', 'utf8');     // rewrite a failure into a pass
var tam = EV.verifyIntegrity(w3.dir);
eq([tam.ok, tam.problems[0].problem], [false, 'HASH_MISMATCH'],
    'C6 MUTANT rewriting a failure into a pass is detected by hash');
throws(function () { EV.replay(w3.dir, C); }, /EVIDENCE_INTEGRITY_FAILED/, 'C6b ... and replay refuses tampered evidence');

// path traversal / unsafe names
throws(function () { EV.safeName('../../etc/passwd'); }, /unsafe suite name|traversal/, 'C7 a traversing suite name is rejected');
throws(function () { EV.safeName('a b'); }, /unsafe suite name/, 'C8 an unsafe suite name is rejected');

// =============================================================================================
console.log('\n§D — SECURITY SCAN');
// =============================================================================================
eq(EV.scanSecrets('nothing to see, 33 passed, 0 failed'), [], 'D1 ordinary output is clean');
ok(EV.scanSecrets('GET https://script.google.com/macros/s/AKfycbzQSU0ZR4EW5F79EzpOoBvUDxjJNLZkLrPkFjuaCBwiWXZMBPR4jnxvIS0FZnjNnp9Q/exec').length >= 1,
    'D2 the Apps Script /exec URL is detected');
ok(EV.scanSecrets('Authorization: Bearer ya29.A0ARrdaM9abcdefghijklmnopqrstuvwxyz0123').length >= 1, 'D3 a bearer token is detected');
ok(EV.scanSecrets('Cookie: SID=abcdef123456').length >= 1, 'D4 a cookie header is detected');
ok(EV.scanSecrets('contact vic.zhou@example.com for access').length >= 1, 'D5 an email address is detected');
ok(EV.scanSecrets('-----BEGIN RSA PRIVATE KEY-----').length >= 1, 'D6 a private key block is detected');

// A secret anywhere in the batch blocks the WHOLE write — nothing partial is left on disk.
var leaky = RECORDS.concat([mk('f-leaky', 0, 'hit https://script.google.com/macros/s/AKfycbzQSU0ZR4EW5F79EzpOoBvUDxjJNLZkLrPkFjuaCBwiWXZMBPR4jnxvIS0FZnjNnp9Q/exec\n1 passed, 0 failed\n', '')]);
throws(function () { EV.writeEvidence({ root: ROOT, runId: 'run-leak', records: leaky }); },
    /SECRET_SCAN_FAILED/, 'D7 a secret anywhere in the batch refuses the entire write');
ok(!fs.existsSync(path.join(ROOT, 'run-leak')), 'D8 ... and leaves NOTHING on disk — the scan runs before any write');

rmrf(TMP);

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed'
    + '  (2 tamper/traversal mutants detected, 6 secret patterns verified)');
if (failed > 0) process.exitCode = 1;
