// S8-R47-E — TRACKED DOCUMENT ENCODING INTEGRITY.
//
// Run: node assets/tests/utf8-document-integrity-s8-r47.test.js            (full tracked census)
//      node assets/tests/utf8-document-integrity-s8-r47.test.js --changed  (this round's diff only)
//      node assets/tests/utf8-document-integrity-s8-r47.test.js --changed=<ref>
//
// WHY THIS EXISTS. Commit 4065ba3 appended the R46 release ledger entry through a Node write that
// defaulted to latin1. `§` (U+00A7) was written as a lone 0xA7 instead of C2 A7, and every `—`
// (U+2014) was truncated to the 0x14 control byte. The lone 0xA7 is not valid UTF-8, so Jekyll
// aborted reading the file and GitHub Pages failed at "Build with Jekyll" for two consecutive runs
// (#598, #599) with artifact upload and deploy skipped. Nothing in the suite, the deploy-surface
// gate or the release-stamp gate noticed. It was found only by tracing a failed deployment
// backwards. This is the gate that would have caught it in the round that caused it.
//
// THREE CHECKS, AND WHY NONE OF THEM IS REDUNDANT.
//
//   C1  strict UTF-8 decode            catches the lone 0xA7 and any truncated sequence.
//   C2  standalone 0xA7                a NAMED diagnostic for the latin1-§ signature. C1 already
//                                      rejects the file, but "invalid byte at offset 337285" does
//                                      not tell you what happened; "latin1 § at line 4693" does.
//                                      It must NOT fire on a legitimate C2 A7 pair — 75 of the 77
//                                      0xA7 bytes in the ledger are the second half of a valid
//                                      pair, and a blanket 0xA7 rule corrupts every one of them.
//                                      That exact mistake was made and caught during the repair.
//   C3  C0 control bytes               THE CHECK C1 CANNOT MAKE. 0x14 is VALID UTF-8. A decode-only
//                                      gate passes all fourteen mojibake em-dashes without a word.
//
// MUTANTS RUN AGAINST IN-MEMORY BUFFERS, NEVER AGAINST REAL FILES. This suite is a gate on document
// integrity; a gate that corrupts documents to test itself is self-defeating, and a suite killed
// mid-mutation would leave the damage behind. Nothing here opens a file for writing.

var fs = require('fs');
var cp = require('child_process');

var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// =============================================================================================
// THE SCANNER
// =============================================================================================

// C0 controls that are legitimate in a text document. Everything else in 0x00..0x1F is damage.
var ALLOWED_C0 = { 0x09: 1, 0x0A: 1, 0x0D: 1 };

function lineOf(buf, off) { var n = 1; for (var i = 0; i < off; i++) if (buf[i] === 0x0A) n++; return n; }

// WHY C2 IS POSITIONAL AND NOT "0xA7 NOT PRECEDED BY 0xC2".
//
// The first draft of this gate used that simpler rule and reported 1295 defects across the
// Chinese-language spec documents — every one of them false. 0xA7 is a legal CONTINUATION byte
// (10xxxxxx), so it occurs inside perfectly valid multi-byte sequences: plenty of CJK characters
// encode as E7 A7 xx and similar. `iconv` calls those files clean because they ARE clean.
//
// What is actually diagnostic is POSITION. A continuation byte can never START a character, so a
// 0xA7 sitting where a new character must begin is latin1 damage and nothing else. That is exactly
// the shape 4065ba3 produced, and it is the only shape C2 may fire on.
function seqLen(b) { return b >= 0xF0 ? 4 : b >= 0xE0 ? 3 : b >= 0xC0 ? 2 : 0; }

/** Returns [] for a clean buffer, or one finding per defect. Pure; never writes. */
function scanBuffer(buf, path) {
    var out = [];

    // C1 — strict decode is the authoritative validity verdict: it also catches overlong forms and
    // surrogate halves that a hand-rolled length walk would wave through.
    try { new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { out.push({ check: 'C1', path: path, line: null, detail: 'invalid UTF-8: ' + e.message }); }

    var i = 0;
    while (i < buf.length) {
        var b = buf[i];
        if (b < 0x80) {
            // C3 — C0 control corruption. 0x14 is the em-dash signature and is VALID UTF-8.
            if (b < 0x20 && !ALLOWED_C0[b]) {
                out.push({ check: 'C3', path: path, line: lineOf(buf, i),
                    detail: 'control byte 0x' + b.toString(16).toUpperCase().padStart(2, '0') + ' at byte ' + i });
            }
            i++; continue;
        }
        var len = seqLen(b);
        if (len === 0) {
            // A continuation byte where a character must start.
            if (b === 0xA7) {
                out.push({ check: 'C2', path: path, line: lineOf(buf, i),
                    detail: 'standalone 0xA7 (latin1 §) at byte ' + i });
            }
            i++; continue;                       // C1 already reported the file as invalid
        }
        var good = (i + len <= buf.length);
        if (good) for (var k = 1; k < len; k++) if ((buf[i + k] & 0xC0) !== 0x80) { good = false; break; }
        if (!good) { i++; continue; }            // truncated — C1 owns the verdict
        i += len;                                // a valid sequence: skip its continuations whole
    }
    return out;
}

/** NUL-safe tracked enumeration. One tracked path already contains a space. */
function trackedMarkdown() {
    var raw = cp.execSync('git ls-files -z -- "*.md"', { maxBuffer: 64 * 1024 * 1024 });
    return raw.toString('utf8').split('\0').filter(function (s) { return s.length > 0; });
}

/** Changed-file mode: this round's diff plus anything uncommitted. */
function changedMarkdown(baseRef) {
    var a = cp.execSync('git diff --name-only -z ' + baseRef + ' HEAD -- "*.md"', { maxBuffer: 64 * 1024 * 1024 });
    var b = cp.execSync('git diff --name-only -z HEAD -- "*.md"', { maxBuffer: 64 * 1024 * 1024 });
    var seen = {}, out = [];
    (a.toString('utf8') + '\0' + b.toString('utf8')).split('\0').forEach(function (s) {
        if (s.length > 0 && !seen[s] && fs.existsSync(s)) { seen[s] = 1; out.push(s); }
    });
    return out;
}

// =============================================================================================
// §A — THE LIVE CENSUS
// =============================================================================================
console.log('\n§A — TRACKED DOCUMENT CENSUS');

var argChanged = process.argv.filter(function (a) { return a.indexOf('--changed') === 0; })[0];
var files = null, mode = 'FULL', scanError = null;
try {
    if (argChanged) {
        mode = 'CHANGED';
        var parts = argChanged.split('=');
        files = changedMarkdown(parts.length > 1 && parts[1] ? parts[1] : 'HEAD~1');
    } else {
        files = trackedMarkdown();
    }
} catch (e) { scanError = e; }

// FAIL CLOSED. An enumeration that threw proves nothing about the tree, and reporting "0 invalid"
// from a scan that never ran is exactly the shape of failure this whole round exists to end.
ok(scanError === null, 'A1 the ' + mode + ' enumeration completed' + (scanError ? ' — ' + scanError.message : ''));
ok(files !== null && files.length > 0, 'A2 the enumeration returned files (' + (files ? files.length : 0) + ')');

var findings = [], unreadable = [];
(files || []).forEach(function (f) {
    var buf;
    try { buf = fs.readFileSync(f); } catch (e) { unreadable.push(f + ': ' + e.message); return; }
    scanBuffer(buf, f).forEach(function (x) { findings.push(x); });
});

eq(unreadable, [], 'A3 every enumerated document was readable');
if (findings.length) {
    console.log('  --- findings ---');
    findings.slice(0, 40).forEach(function (x) {
        console.log('  ' + x.check + '  ' + x.path + (x.line ? ':' + x.line : '') + '  ' + x.detail);
    });
    if (findings.length > 40) console.log('  … and ' + (findings.length - 40) + ' more');
}

// THE ONE JUSTIFIED EXCEPTION, FROZEN BYTE-EXACTLY.
//
// LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md documents a projection format whose field
// separator IS the SOH control character, and writes it literally inside a code span:
//     projected in a fixed field order (`field=value`, `\x01`-separated)
// That byte is deliberate content, not damage. It predates this gate (introduced by f3302e0) and
// this round is not authorised to edit that document.
//
// It is recorded as an EQUALITY, not filtered out. A filter would let a second defect hide behind
// the first; an equality fails on anything new AND notices if this one is ever repaired, which is
// the same discipline BASELINE_FAILURE_SET uses for the frozen six.
var KNOWN_PREEXISTING = [
    { check: 'C3', path: 'docs/planning/LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md', byte: 10765 }
];
function key(x) { var m = /at byte (\d+)/.exec(x.detail); return { check: x.check, path: x.path, byte: m ? Number(m[1]) : null }; }
var actual = findings.map(key).sort(function (a, b) { return (a.path + a.byte).localeCompare(b.path + b.byte); });
var expect = KNOWN_PREEXISTING.slice().sort(function (a, b) { return (a.path + a.byte).localeCompare(b.path + b.byte); });

if (mode === 'FULL') {
    eq(actual, expect, 'A4 the ' + files.length + ' tracked documents carry exactly the one frozen exception and nothing else');
} else {
    eq(findings, [], 'A4 no encoding defect in ' + files.length + ' CHANGED documents');
}
eq(findings.filter(function (x) { return x.check === 'C1' || x.check === 'C2'; }).length, 0,
    'A4b ... and ZERO of them are C1/C2 — no invalid UTF-8 and no latin1 § anywhere in the tree');

// A path containing a space must survive enumeration intact rather than splitting into two.
var spaced = (files || []).filter(function (f) { return f.indexOf(' ') !== -1; });
ok(mode === 'CHANGED' || spaced.length > 0,
    'A5 NUL-safe enumeration preserved ' + spaced.length + ' path(s) containing spaces');
(files || []).forEach(function (f) { if (f.indexOf(' ') !== -1 && !fs.existsSync(f)) failed++; });
ok(spaced.every(function (f) { return fs.existsSync(f); }), 'A6 ... and each one resolves to a real file');

// =============================================================================================
// §B — THE SCANNER'S POSITIVE CONTRACT  (what it must NOT flag)
// =============================================================================================
console.log('\n§B — LEGITIMATE CONTENT IS NOT FLAGGED');

eq(scanBuffer(Buffer.from('plain ascii\r\nsecond line\r\n', 'utf8'), 'x'), [], 'B1 clean ASCII with CRLF');
eq(scanBuffer(Buffer.from('§22 and §23 are canonical rungs\r\n', 'utf8'), 'x'), [],
    'B2 legitimate § (C2 A7) is NOT reported — the blanket-replace trap');
eq(scanBuffer(Buffer.from('an em dash — and a CJK run 品牌資源\r\n', 'utf8'), 'x'), [],
    'B3 real em dashes and multi-byte CJK are clean');

// THE 1295-FALSE-POSITIVE REGRESSION. 秘 is E7 A7 98 — a legitimate 0xA7 CONTINUATION byte. The
// first draft of C2 flagged every one of these across the spec documents. It must never fire here.
var cjkA7 = Buffer.from('秘密 and 稅 and 移動', 'utf8');
ok(cjkA7.indexOf(0xA7) !== -1, 'B3a the CJK fixture really does contain a 0xA7 continuation byte');
eq(scanBuffer(cjkA7, 'x'), [], 'B3b ... and C2 does NOT flag it — continuation bytes are not latin1 damage');
eq(scanBuffer(Buffer.from('tab\there\r\nnewline\n', 'utf8'), 'x'), [], 'B4 tab, CR and LF are allowed C0');

// The ledger is the file that caused this gate. It must now be clean on all three checks.
var LEDGER = 'docs/planning/DEPLOYMENT_RELEASE_LOG.md';
var ledgerBuf = fs.readFileSync(LEDGER);
eq(scanBuffer(ledgerBuf, LEDGER), [], 'B5 the repaired release ledger is clean on C1+C2+C3');
var pairCount = 0;
for (var li = 1; li < ledgerBuf.length; li++) if (ledgerBuf[li] === 0xA7 && ledgerBuf[li - 1] === 0xC2) pairCount++;
ok(pairCount > 50, 'B6 ... while still containing ' + pairCount + ' legitimate § pairs the gate left alone');

// =============================================================================================
// §X — MUTANTS.  Each reconstructs the 4065ba3 damage in memory and must be KILLED.
// =============================================================================================
console.log('\n§X — MUTATION FIXTURES');

var mutants = 0, survived = 0;
function mutant(label, buf, expectCheck) {
    mutants++;
    var f = scanBuffer(buf, 'mutant');
    var killed = f.some(function (x) { return x.check === expectCheck; });
    if (!killed) { survived++; failed++; console.log('FAIL X-' + mutants + ' SURVIVED: ' + label); }
    else { passed++; console.log('ok   X-' + mutants + ' killed by ' + expectCheck + ' — ' + label); }
    return f;
}

// X1 — REQUIRED: standalone 0xA7. The exact byte that broke Pages.
var m1 = Buffer.concat([Buffer.from('The canonical ', 'utf8'), Buffer.from([0xA7]), Buffer.from('22 resolver\r\n', 'utf8')]);
mutant('standalone 0xA7 (latin1 §)', m1, 'C2');
ok(scanBuffer(m1, 'm').some(function (x) { return x.check === 'C1'; }),
    'X1b ... and C1 independently rejects it as invalid UTF-8');

// X2 — REQUIRED: a truncated multi-byte sequence (lead byte, no continuation).
var m2 = Buffer.concat([Buffer.from('truncated ', 'utf8'), Buffer.from([0xE2, 0x80]), Buffer.from('\r\n', 'utf8')]);
mutant('truncated UTF-8 sequence (E2 80, no continuation)', m2, 'C1');

// X3 — REQUIRED, AND THE ONE THAT MATTERS. 0x14 is VALID UTF-8: C1 passes it. Only C3 sees it.
var m3 = Buffer.concat([Buffer.from('a dash ', 'utf8'), Buffer.from([0x14]), Buffer.from(' here\r\n', 'utf8')]);
var f3 = mutant('0x14 mojibake em dash (VALID UTF-8)', m3, 'C3');
eq(f3.filter(function (x) { return x.check === 'C1'; }).length, 0,
    'X3b ... and C1 does NOT fire on it — which is precisely why C3 exists');

// X4 — the guard against over-reach: a mutant that must NOT be reported.
mutants++;
if (scanBuffer(Buffer.from('§ alone is fine', 'utf8'), 'm').length === 0) { passed++; console.log('ok   X-4 killed by inversion — a valid § is not mistaken for damage'); }
else { survived++; failed++; console.log('FAIL X-4 SURVIVED: the scanner flags legitimate §'); }

// X5 — THE EXCEPTION SET MUST NOT BE A HIDING PLACE. Inject a SECOND control byte into the very
// file that owns the frozen exception. If A4's equality could be satisfied by "the known one is
// present", this survives. It must not.
mutants++;
var excPath = KNOWN_PREEXISTING[0].path;
var excBuf = Buffer.from(fs.readFileSync(excPath));
excBuf[excBuf.length - 1] = 0x0B;                       // a vertical tab — damage, not content
var excFindings = scanBuffer(excBuf, excPath).map(key);
if (excFindings.length === 2 && JSON.stringify(excFindings.sort(function (a, b) { return a.byte - b.byte; })) !== JSON.stringify(expect)) {
    passed++; console.log('ok   X-' + mutants + ' killed — a second defect in the exception file is not absorbed by the exception');
} else { survived++; failed++; console.log('FAIL X-' + mutants + ' SURVIVED: the exception set absorbed a new defect'); }

// Vacuity: a mutant set that is empty proves nothing and must fail rather than pass quietly.
ok(mutants >= 5, 'X6 the mutant set is non-empty (' + mutants + ' mutants) — not vacuous');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed, '
    + mutants + ' mutants, ' + survived + ' survived, ' + (mutants >= 5 ? 'vacuity clean' : 'VACUOUS'));
if (failed > 0) process.exitCode = 1;
