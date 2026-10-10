// Kitchen Mama Operation System — S8-R49-M2 CROSS-CHECKOUT REPRODUCIBILITY GATE
// Run: node assets/tests/worktree-blob-reproducibility-s8-r49-m2.test.js
//
// LOCAL / OFFLINE. READ-ONLY: it opens tracked files and asks git for blob ids. It writes nothing, in the
// repository or anywhere else, and it asserts that fact at the end by comparing `git status` before/after.
//
// WHAT THIS IS FOR, AND WHY IT IS NOT A LINE-ENDING PREFERENCE.
//
// S8-R49-M0 measured two checkouts of ONE commit, both reported clean by git, and found 840 files whose
// bytes differed. Every one was CRLF-vs-LF; there were zero encoding, zero whitespace-beyond-EOL and zero
// content differences, and every tracked file in both checkouts LF-normalized to its own blob. The content
// was never in question. What differed was the TEST RESULT — 631/631 in one checkout, 628/631 in the other —
// because mutation anchors written with \n cannot be found in a CRLF working copy.
//
// That is a bad failure mode twice over: it is invisible (`core.autocrlf=true` compares the normalized form,
// so git calls both trees clean) and it is silent in the wrong direction (a suite can pass because its
// mutants never applied). This gate makes the invisible half loud. It does NOT enforce a line ending — it
// enforces that the working tree says the same THING as the commit, which is the property every other suite
// in this registry implicitly assumes when it reads a file off disk.
//
// THE RULE, STATED ONCE:
//   * a text file may differ from its blob by CRLF/LF ONLY;
//   * a file marked `-text` in .gitattributes, or holding a NUL byte, must match its blob EXACTLY, because
//     for those the bytes ARE the content and several are pinned by SHA-256 elsewhere in this registry;
//   * anything else — a BOM that appeared or vanished, trailing whitespace, a changed character — FAILS,
//     and is reported with the class it belongs to rather than as a generic mismatch.
//
// HOW IT AVOIDS DEPENDING ON ONE DEVELOPER'S GIT SETTINGS. It never reads core.autocrlf, core.eol or
// core.safecrlf, and it never asks git to convert anything. It recomputes the git blob id itself —
// sha1("blob " + length + "\0" + bytes) — from the working copy, raw and LF-normalized, and compares those
// against the id `git ls-tree` reports. A checkout configured for LF and a checkout configured for CRLF both
// satisfy it, which is exactly the portability claim being made. It is also why this costs one git process
// rather than 6,789: no `git show` per file.
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
var pass = 0, fail = 0;
function ok(c, label, detail) {
  if (c) { pass++; console.log('ok   ' + label); }
  else { fail++; console.error('FAIL ' + label + (detail === undefined ? '' : '\n      ' + detail)); }
}
function eq(a, e, label) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + label); }
  else { fail++; console.error('FAIL ' + label + '\n      expected ' + E + '\n      actual   ' + A); }
}
function section(n) { console.log('\n== ' + n + ' ' + new Array(Math.max(2, 100 - n.length)).join('=')); }
function git(args, opts) {
  return cp.execFileSync('git', args, Object.assign({ cwd: ROOT, maxBuffer: 1 << 28 }, opts || {}));
}

// ----------------------------------------------------------------------------------------------------
// THE CLASSIFIER. Pure, and exercised by the negative tests in section D against hand-built buffers, so
// its verdicts are proven on faults this repository does not currently have.
// ----------------------------------------------------------------------------------------------------
var CRLF_RE = /\r\n/g;
function toLf(buf) { return Buffer.from(buf.toString('latin1').split('\r\n').join('\n'), 'latin1'); }
function hasBOM(b) { return b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf; }
function hasNUL(b) { return b.indexOf(0) !== -1; }
function stripWS(b) {
  var out = Buffer.allocUnsafe(b.length), n = 0;
  for (var i = 0; i < b.length; i++) {
    var c = b[i];
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) continue;
    out[n++] = c;
  }
  return out.slice(0, n);
}
/** The git object name for a blob, computed without asking git. */
function blobId(buf) {
  return crypto.createHash('sha1')
    .update(Buffer.concat([Buffer.from('blob ' + buf.length + '\0', 'latin1'), buf])).digest('hex');
}
/**
 * classify(work, expectedBlobId, { binary }) -> verdict string.
 *   OK_EXACT      bytes identical to the blob.
 *   OK_EOL        identical after CRLF->LF; allowed for text, REFUSED for binary/-text.
 *   BOM           a byte-order mark appeared or vanished.
 *   WHITESPACE    differs only in whitespace that is not a line ending.
 *   CONTENT       a real difference.
 *   BINARY_EOL    a -text/binary file that matches only after EOL conversion — a corrupted checkout.
 */
function classify(work, expectedBlobId, opts) {
  var binary = !!(opts && opts.binary);
  if (blobId(work) === expectedBlobId) return 'OK_EXACT';
  var lf = toLf(work);
  if (blobId(lf) === expectedBlobId) return binary ? 'BINARY_EOL' : 'OK_EOL';
  return { bom: 'BOM', ws: 'WHITESPACE', content: 'CONTENT' }[opts && opts.probe ? opts.probe(lf) : 'content']
    || 'CONTENT';
}
/** Second pass, only for files that already failed, so the report names the fault instead of guessing. */
function diagnose(work, blobBuf) {
  if (hasBOM(work) !== hasBOM(blobBuf)) return 'BOM';
  if (stripWS(work).equals(stripWS(blobBuf))) return 'WHITESPACE';
  return 'CONTENT';
}

console.log('CROSS-CHECKOUT REPRODUCIBILITY GATE (S8-R49-M2)');
console.log('root: ' + ROOT);

// ----------------------------------------------------------------------------------------------------
section('A  the worktree is clean BEFORE the gate runs, and the gate is the only thing that could change that');
// ----------------------------------------------------------------------------------------------------
var STATUS_BEFORE = git(['status', '--porcelain']).toString('utf8');
console.log('   `git status --porcelain` entries before: ' + (STATUS_BEFORE.trim() ? STATUS_BEFORE.trim().split('\n').length : 0));

// ----------------------------------------------------------------------------------------------------
section('B  every tracked file says the same THING as its blob');
// ----------------------------------------------------------------------------------------------------
// -z: NUL-delimited, so a CJK filename is handed over verbatim. With the default core.quotepath, `ls-files`
// escapes non-ASCII names into C-style literals and a naive reader then looks for a file that is not there —
// M0's first pass reported 18 files "absent" for exactly that reason, which was a measurement bug.
var tree = git(['ls-tree', '-r', '-z', 'HEAD']).toString('utf8').split('\0').filter(Boolean);
var entries = tree.map(function (rec) {
  // "<mode> <type> <sha>\t<path>"
  var tab = rec.indexOf('\t');
  var meta = rec.slice(0, tab).split(/\s+/);
  return { mode: meta[0], type: meta[1], sha: meta[2], rel: rec.slice(tab + 1) };
}).filter(function (e) { return e.type === 'blob'; });

ok(entries.length > 1000, 'B1  the tree enumerates a substantial file set', entries.length + ' blobs');
var nonAscii = entries.filter(function (e) { return /[^\x00-\x7f]/.test(e.rel); });
ok(nonAscii.length > 0,
  'B1a and it includes non-ASCII paths, so the NUL-delimited reader is actually exercised rather than '
  + 'merely declared', nonAscii.length + ' paths');

// .gitattributes `-text` files are pinned by content elsewhere in this registry, so EOL conversion on them
// is a defect rather than an allowance. Asked through git so the rules stay in one place.
var attrOut = '';
try {
  attrOut = cp.execFileSync('git', ['check-attr', '--stdin', '-z', 'text'],
    { cwd: ROOT, maxBuffer: 1 << 28, input: entries.map(function (e) { return e.rel; }).join('\0') })
    .toString('utf8');
} catch (e) { attrOut = ''; }
var noText = {};
(function () {
  var f = attrOut.split('\0');
  for (var i = 0; i + 2 < f.length; i += 3) { if (f[i + 2] === 'unset') noText[f[i]] = true; }
})();
ok(Object.keys(noText).length > 0,
  'B2  the `-text` pins in .gitattributes are read from git rather than restated here',
  Object.keys(noText).length + ' paths pinned');

// A file the developer is CURRENTLY editing differs from its blob on purpose, and saying so is not a
// finding. Those are excluded by name and counted, so the census stays a census: on a clean tree — CI, a
// release cut, a fresh clone — the exclusion set is empty and every tracked blob is examined.
var DIRTY = {};
git(['status', '--porcelain', '-z']).toString('utf8').split('\0').filter(Boolean).forEach(function (rec) {
  // "XY <path>"; a rename carries the old path in the next record, which is also legitimately dirty.
  var p = rec.slice(3);
  if (p) DIRTY[p] = rec.slice(0, 2);
});
var dirtyCount = 0;

var counts = { OK_EXACT: 0, OK_EOL: 0, BINARY_EOL: 0, BOM: 0, WHITESPACE: 0, CONTENT: 0, UNREADABLE: 0 };
var offenders = [];
entries.forEach(function (e) {
  if (DIRTY[e.rel]) { dirtyCount++; return; }
  var work;
  try { work = fs.readFileSync(path.join(ROOT, e.rel)); }
  catch (err) { counts.UNREADABLE++; offenders.push({ rel: e.rel, verdict: 'UNREADABLE', why: err.code }); return; }
  var binary = !!noText[e.rel] || hasNUL(work);
  var v = classify(work, e.sha, { binary: binary });
  if (v === 'OK_EXACT' || v === 'OK_EOL') { counts[v]++; return; }
  // Only a failing file costs a blob read, which is what keeps this gate cheap on a clean tree.
  var blobBuf;
  try { blobBuf = git(['cat-file', 'blob', e.sha]); } catch (err) { blobBuf = Buffer.alloc(0); }
  var why = (v === 'BINARY_EOL') ? 'BINARY_EOL' : diagnose(work, blobBuf);
  counts[why] = (counts[why] || 0) + 1;
  offenders.push({ rel: e.rel, verdict: why,
    work: work.length + ' B', blob: blobBuf.length + ' B',
    crlf: (work.toString('latin1').match(CRLF_RE) || []).length });
});

console.log('   exact match to blob          : ' + counts.OK_EXACT);
console.log('   match after CRLF->LF (text)  : ' + counts.OK_EOL);
console.log('   BOM differences              : ' + counts.BOM);
console.log('   whitespace beyond EOL        : ' + counts.WHITESPACE);
console.log('   REAL content differences     : ' + counts.CONTENT);
console.log('   -text/binary converted       : ' + counts.BINARY_EOL);
console.log('   unreadable                   : ' + counts.UNREADABLE);

eq(counts.CONTENT, 0, 'B3  NO tracked file differs from its blob in content');
eq(counts.BOM, 0, 'B4  NO tracked file gained or lost a byte-order mark');
eq(counts.WHITESPACE, 0, 'B5  NO tracked file differs in whitespace that is not a line ending');
eq(counts.BINARY_EOL, 0,
  'B6  NO `-text`/binary file was line-ending converted — those are pinned by content and a conversion '
  + 'would break a SHA-256 the registry asserts elsewhere');
eq(counts.UNREADABLE, 0, 'B7  every tracked file was readable through its NUL-delimited path');
if (offenders.length) {
  console.error('   --- offenders ---');
  offenders.slice(0, 20).forEach(function (o) {
    console.error('   ' + o.verdict + '  ' + o.rel + '  work=' + (o.work || '?') + ' blob=' + (o.blob || '?'));
  });
}
console.log('   excluded (dirty, being edited): ' + dirtyCount
  + (dirtyCount ? '  [' + Object.keys(DIRTY).slice(0, 6).join(', ') + (dirtyCount > 6 ? ', …' : '') + ']' : ''));
ok(counts.OK_EXACT + counts.OK_EOL + dirtyCount === entries.length,
  'B8  and every blob is accounted for — ACCEPTED, or excluded by name as a file currently being edited. '
  + 'The pass is a census, not a sample',
  (counts.OK_EXACT + counts.OK_EOL) + ' examined + ' + dirtyCount + ' dirty = ' + entries.length);
// The exclusion must never become the escape hatch: on a clean tree it is empty, and that is the state a
// release is cut from. Reported rather than asserted, so the gate stays usable mid-round.
if (dirtyCount === 0) {
  ok(true, 'B8a the tree is CLEAN, so nothing was excluded and the census covered every tracked blob');
} else {
  console.log('   (B8a not claimed: ' + dirtyCount + ' file(s) are being edited, so this run is not a '
    + 'clean-tree census. Re-run after committing for the release-grade result.)');
}

// ----------------------------------------------------------------------------------------------------
section('C  the gate does not require one line ending — only one meaning');
// ----------------------------------------------------------------------------------------------------
// A CRLF checkout and an LF checkout must BOTH satisfy this gate, or it is a style rule wearing a
// correctness costume. Proven on buffers rather than on whichever checkout happens to be running.
var bodyLf = Buffer.from('var a = 1;\nvar b = 2;\n', 'latin1');
var bodyCrlf = Buffer.from('var a = 1;\r\nvar b = 2;\r\n', 'latin1');
var idLf = blobId(bodyLf);
eq(classify(bodyLf, idLf, { binary: false }), 'OK_EXACT', 'C1  an LF working copy matches an LF blob exactly');
eq(classify(bodyCrlf, idLf, { binary: false }), 'OK_EOL', 'C2  a CRLF working copy of the SAME file is ACCEPTED');
eq(classify(bodyCrlf, idLf, { binary: true }), 'BINARY_EOL',
  'C3  but the same conversion on a `-text`/binary file is REFUSED');

// ----------------------------------------------------------------------------------------------------
section('D  NEGATIVE — the gate rejects differences that are not line endings');
// ----------------------------------------------------------------------------------------------------
function neg(label, workBuf, blobBuf, expected) {
  var v = classify(workBuf, blobId(blobBuf), { binary: false });
  var why = (v === 'OK_EXACT' || v === 'OK_EOL') ? v : diagnose(workBuf, blobBuf);
  eq(why, expected, label);
}
neg('D1  a changed character is CONTENT, not an EOL allowance',
  Buffer.from('var a = 2;\n', 'latin1'), Buffer.from('var a = 1;\n', 'latin1'), 'CONTENT');
neg('D2  an added line is CONTENT',
  Buffer.from('var a = 1;\nvar c = 3;\n', 'latin1'), Buffer.from('var a = 1;\n', 'latin1'), 'CONTENT');
neg('D3  a BOM that appeared is reported as BOM',
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('var a = 1;\n', 'latin1')]),
  Buffer.from('var a = 1;\n', 'latin1'), 'BOM');
neg('D4  a BOM that vanished is reported as BOM',
  Buffer.from('var a = 1;\n', 'latin1'),
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('var a = 1;\n', 'latin1')]), 'BOM');
neg('D5  trailing whitespace is WHITESPACE, which is NOT waved through as an EOL difference',
  Buffer.from('var a = 1;   \n', 'latin1'), Buffer.from('var a = 1;\n', 'latin1'), 'WHITESPACE');
neg('D6  a changed indent is WHITESPACE',
  Buffer.from('\t\tvar a = 1;\n', 'latin1'), Buffer.from('  var a = 1;\n', 'latin1'), 'WHITESPACE');
// A lone CR is NOT a line ending here: toLf collapses only the CRLF pair, so a CR/LF swap is NOT waved
// through as an EOL conversion. It lands in the whitespace class and is REJECTED, which is the property
// that matters — the allowance is narrow by construction rather than by a looser rule being written down.
neg('D7  a lone CR is NOT accepted as an EOL conversion — it is rejected as a whitespace difference',
  Buffer.from('var a = 1;\r', 'latin1'), Buffer.from('var a = 1;\n', 'latin1'), 'WHITESPACE');
eq(classify(Buffer.from('var a = 1;\r', 'latin1'), blobId(Buffer.from('var a = 1;\n', 'latin1')), {}), 'CONTENT',
  'D7a and classify() refuses it outright rather than returning OK_EOL — the narrowness is in the ACCEPT '
  + 'path, where it has to be');
// The positive control: the negative tests above must not be passing because `classify` fails everything.
eq(classify(Buffer.from('same\n', 'latin1'), blobId(Buffer.from('same\n', 'latin1')), {}), 'OK_EXACT',
  'D8  and an identical file still passes — the rejections above are discriminating, not blanket');

// ----------------------------------------------------------------------------------------------------
section('E  the gate wrote nothing');
// ----------------------------------------------------------------------------------------------------
var STATUS_AFTER = git(['status', '--porcelain']).toString('utf8');
eq(STATUS_AFTER, STATUS_BEFORE,
  'E1  `git status --porcelain` is byte-identical before and after — this gate reads, and only reads');

console.log('\n' + new Array(101).join('='));
console.log('CROSS-CHECKOUT REPRODUCIBILITY: ' + pass + ' passed, ' + fail + ' failed'
  + '   (' + entries.length + ' tracked blobs: ' + counts.OK_EXACT + ' exact, ' + counts.OK_EOL + ' EOL-only)');
console.log(new Array(101).join('='));
if (fail) process.exitCode = 1;
