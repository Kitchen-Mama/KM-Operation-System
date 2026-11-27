#!/usr/bin/env node
'use strict';
// PO200 - is the file installed in the Sandbox the one the candidate was reviewed against?
//
//   node po200-source-check.cjs --file <a .gs file saved from the Sandbox editor> --as 82|82a [--diff-out <file>] [--candidate <git rev>]
//   node po200-source-check.cjs --self-test
//
// The saved file is normalised (BOM removed, CRLF/CR -> LF, blank space at the very end of the file ignored) and its sha256 is
// compared with the reviewed BASE of that file (commit 939e6365) and with the candidate (HEAD of this checkout), both read with
// `git show` and normalised the same way. Exactly one line is the verdict:
//   MATCHES_BASE        safe to replace the whole file with the candidate
//   MATCHES_CANDIDATE   the candidate is already installed
//   DIFFERENT           STOP - do not overwrite. A unified diff against the base is written to a file; only its line count is printed.
// File contents are never printed (the installed file may hold environment-specific lines). Files whose name marks them as
// configuration or secrets are refused unread.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const BASE = '939e6365';
const GS = 'assets/specs/active/apps-script/';
const FILES = { '82': '82_api_v1_po_factory_import.gs', '82a': '82a_factory_atomic_commit.gs' };
const FORBIDDEN = [/^00_config/i, /^84_/, /^66_/, /pin.*\.local\.js$/i, /^\.env/i];

class Refusal extends Error { constructor(message) { super(message); this.refusal = true; } }
const refuse = message => { throw new Refusal(message); };
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
function normalise(textIn) { return String(textIn).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/, '') + '\n'; }
function forbidden(file) {
  const parts = path.resolve(file).split(/[\\/]/), name = parts[parts.length - 1];
  return FORBIDDEN.some(re => re.test(name)) || parts.slice(0, -1).some(p => p.toLowerCase() === 'decoys');
}
function gitShow(rev, name) {
  try { return execFileSync('git', ['-C', ROOT, 'show', rev + ':' + GS + name], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return refuse('git cannot read ' + name + ' at ' + rev + ' in this checkout. Run this tool from the checkout that holds the candidate.'); }
}
// a plain line diff (longest common subsequence), 3 lines of context - only ever written to a file
function unifiedDiff(a, b, labelA, labelB) {
  const A = a.split('\n'), B = b.split('\n'); A.pop(); B.pop();
  let head = 0; while (head < A.length && head < B.length && A[head] === B[head]) head++;
  let tail = 0; while (tail < A.length - head && tail < B.length - head && A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail++;
  const x = A.slice(head, A.length - tail), y = B.slice(head, B.length - tail), n = x.length, m = y.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  for (let k = 0; k < head; k++) ops.push([' ', A[k]]);
  let i = 0, j = 0;
  while (i < n && j < m) { if (x[i] === y[j]) { ops.push([' ', x[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', x[i++]]); else ops.push(['+', y[j++]]); }
  while (i < n) ops.push(['-', x[i++]]);
  while (j < m) ops.push(['+', y[j++]]);
  for (let k = A.length - tail; k < A.length; k++) ops.push([' ', A[k]]);
  const out = ['--- ' + labelA, '+++ ' + labelB], C = 3; let p = 0, la = 1, lb = 1, changed = 0;
  while (p < ops.length) {
    if (ops[p][0] === ' ') { p++; la++; lb++; continue; }
    let start = Math.max(0, p - C), end = p, last = p;
    while (end < ops.length && end - last <= 2 * C) { if (ops[end][0] !== ' ') last = end; end++; }
    end = Math.min(ops.length, last + C + 1);
    const back = p - start, sa = la - back, sb = lb - back; let ca = 0, cb = 0; const body = [];
    for (let q = start; q < end; q++) { const o = ops[q]; if (o[0] !== '+') ca++; if (o[0] !== '-') cb++; if (o[0] !== ' ') changed++; body.push(o[0] + o[1]); }
    out.push('@@ -' + sa + ',' + ca + ' +' + sb + ',' + cb + ' @@', ...body);
    la = sa + ca; lb = sb + cb; p = end;
  }
  return { text: out.join('\n') + '\n', changed };
}

function compare(o) {
  const as = String(o.as || ''), name = FILES[as];
  if (!name) refuse('--as must be 82 or 82a.');
  if (!o.file) refuse('--file <saved .gs file> is required.');
  if (forbidden(o.file)) refuse('This file name is a configuration / secret file and is never read by this tool. Only the saved 82_ or 82a file may be checked.');
  if (!fs.existsSync(o.file) || !fs.statSync(o.file).isFile()) refuse('--file: the file does not exist.');
  const candidateRev = o.candidate || 'HEAD';
  const base = normalise(gitShow(BASE, name)), candidate = normalise(gitShow(candidateRev, name));
  const hb = sha256(base), hc = sha256(candidate);
  if (hb === hc) refuse('In this checkout the candidate (' + candidateRev + ') of ' + name + ' is the same as the base: this is not the checkout that holds the PO200 candidate. Nothing was compared.');
  const raw = fs.readFileSync(o.file), installed = normalise(raw.toString('utf8')), hi = sha256(installed);
  const result = { as, name, lines: installed.split('\n').length - 1, sha256_installed: hi, sha256_base: hb, sha256_candidate: hc, base: BASE, candidate: candidateRev,
    line_endings: /\r\n/.test(raw.toString('utf8')) ? 'CRLF (normalised)' : 'LF', bom: raw.length >= 3 && raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF };
  if (hi === hb) return Object.assign(result, { verdict: 'MATCHES_BASE' });
  if (hi === hc) return Object.assign(result, { verdict: 'MATCHES_CANDIDATE' });
  const diff = unifiedDiff(base, installed, 'reviewed base ' + BASE + ' ' + name, 'installed file (normalised)');
  const target = o.diffOut || path.join(ROOT, 'output', 'po200-20261127', 'source-check', 'installed-vs-base-' + as + '.diff');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, diff.text);
  return Object.assign(result, { verdict: 'DIFFERENT', diff_file: target, diff_lines: diff.text.split('\n').length - 1, changed_lines: diff.changed });
}
function report(r, say) {
  say(r.verdict);
  say('file checked as ' + r.name + ': ' + r.lines + ' lines, ' + r.line_endings + (r.bom ? ', BOM removed' : ''));
  say('sha256 installed  ' + r.sha256_installed);
  say('sha256 base       ' + r.sha256_base + '  (' + r.base + ')');
  say('sha256 candidate  ' + r.sha256_candidate + '  (' + r.candidate + ')');
  if (r.verdict === 'MATCHES_BASE') say('The installed file is the reviewed base. It is safe to replace the WHOLE file with the candidate.');
  if (r.verdict === 'MATCHES_CANDIDATE') say('The candidate is already installed. Do not paste anything for this file.');
  if (r.verdict === 'DIFFERENT') {
    say('STOP: do not overwrite this file. It is neither the reviewed base nor the candidate.');
    say('A unified diff against the base was written (' + r.diff_lines + ' lines, ' + r.changed_lines + ' changed): ' + r.diff_file);
    say('It may hold environment-specific lines: read it yourself, keep it out of chat and Git, and ask for a rebased change.');
  }
}
function selfTest(say) {
  const os = require('node:os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'po200-source-check-')); let n = 0;
  const ok = (label, value) => { if (!value) throw new Error('SELF-TEST FAILED: ' + label); n++; say('ok ' + label); };
  try {
    for (const as of Object.keys(FILES)) {
      const base = gitShow(BASE, FILES[as]), candidate = gitShow('HEAD', FILES[as]), f = path.join(dir, 'saved-' + as + '.gs'), d = path.join(dir, as + '.diff');
      fs.writeFileSync(f, base); ok(as + ': the base is MATCHES_BASE', compare({ file: f, as, diffOut: d }).verdict === 'MATCHES_BASE');
      fs.writeFileSync(f, '\uFEFF' + normalise(base).replace(/\n/g, '\r\n') + '\r\n\r\n  \r\n'); ok(as + ': the base with a BOM, CRLF and blank lines at the end is still MATCHES_BASE', compare({ file: f, as, diffOut: d }).verdict === 'MATCHES_BASE');
      fs.writeFileSync(f, normalise(candidate).replace(/\n/g, '\r\n')); ok(as + ': the candidate is MATCHES_CANDIDATE', compare({ file: f, as, diffOut: d }).verdict === 'MATCHES_CANDIDATE');
      const lines = normalise(base).split('\n'); lines.splice(3, 0, '// one local line'); fs.writeFileSync(f, lines.join('\n'));
      const r = compare({ file: f, as, diffOut: d });
      ok(as + ': one added line is DIFFERENT, with a diff file of one changed line', r.verdict === 'DIFFERENT' && r.changed_lines === 1 && fs.readFileSync(d, 'utf8').includes('+// one local line'));
      fs.writeFileSync(f, normalise(base).replace(/\n/, ' \n')); ok(as + ': a space added inside the file is DIFFERENT (only the end of the file is forgiven)', compare({ file: f, as, diffOut: d }).verdict === 'DIFFERENT');
    }
    for (const name of ['00_config.gs', '84_anything.gs', '66_anything.gs', 'a-pin.local.js', '.env.local']) {
      let refused = false; try { compare({ file: path.join(dir, name), as: '82' }); } catch (e) { refused = !!e.refusal && /never read/.test(e.message); }
      ok('a forbidden name is refused unread (' + name.replace(/[a-z]+/g, 'x') + ')', refused);
    }
    let decoy = false; try { compare({ file: path.join(dir, 'decoys', 'saved.gs'), as: '82' }); } catch (e) { decoy = !!e.refusal; } ok('a file in a decoys folder is refused unread', decoy);
    let badAs = false; try { compare({ file: path.join(dir, 'saved-82.gs'), as: '81' }); } catch (e) { badAs = !!e.refusal; } ok('an unknown --as is refused', badAs);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  say('SELF_TEST_PASS ' + n);
  return n;
}
function main(argv, print) {
  const say = print || (line => console.log(line));
  try {
    const o = {}, names = { '--file': 'file', '--as': 'as', '--diff-out': 'diffOut', '--candidate': 'candidate' };
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--self-test') o.selfTest = true;
      else if (names[argv[i]]) { if (argv[i + 1] == null) refuse(argv[i] + ' needs a value.'); o[names[argv[i]]] = argv[++i]; }
      else refuse('Unknown option ' + argv[i] + '. Usage: po200-source-check.cjs --file <saved .gs> --as 82|82a   |   --self-test');
    }
    if (o.selfTest) { selfTest(say); return 0; }
    const r = compare(o); report(r, say);
    return r.verdict === 'DIFFERENT' ? 3 : 0;
  } catch (e) {
    if (e && e.refusal) { say('REFUSED: ' + e.message); return 2; }
    say('FAILED: ' + (e && e.message || e)); return 1;
  }
}
module.exports = { main, compare, normalise, unifiedDiff, selfTest, BASE, FILES };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
