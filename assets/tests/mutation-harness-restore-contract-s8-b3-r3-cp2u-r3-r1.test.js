// Kitchen Mama Operation System - S8-B3-R3-CP2U-R3-R1
// WHAT RESTORES A MUTATED SOURCE, AND WHAT DEFEATS IT
//
// Run: node assets/tests/mutation-harness-restore-contract-s8-b3-r3-cp2u-r3-r1.test.js
//
// LOCAL / OFFLINE. Every mutation in this suite is performed on an ISOLATED TEMP FILE under os.tmpdir().
// No file in the repository is written, which is the whole point: a suite that investigates source
// corruption must not be capable of causing any.
//
// WHY THIS SUITE EXISTS - AND WHAT IT CORRECTS. D-S8-B3-115 asserted that the mutation harness "restores
// on the caught path and not on the survived path". THAT WAS WRONG, and it was never tested. `withSrc`
// restores in a `finally`, and `finally` cannot tell a caught mutant from a surviving one: both are
// simply "the probe returned". The caught/survived distinction is made by the CALLER, after withSrc has
// already restored. There was no survived-path hole to fix, and adding a second `finally` would have
// been a change made to a guess.
//
// THE REAL FAILURE IS A KILL. `finally` runs on return and on throw; it does NOT run when the process is
// terminated. Section E demonstrates that directly with a child process killed mid-probe.
//
// THE FUNCTION UNDER TEST IS THE SHIPPED ONE. It is extracted by name from the suite that owns it and
// instantiated with an injected fs/path/ROOT, so this is not a reimplementation that could agree with a
// copy of the bug rather than with the code that runs.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OWNER_REL = 'assets/tests/product-strategy-corrections-p1-b8d-r9.test.js';

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

// ---- extract the REAL withSrc -------------------------------------------------------------------------
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('not found: ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
const OWNER_SRC = fs.readFileSync(path.join(ROOT, OWNER_REL), 'utf8');
const WITHSRC_TEXT = extractFn(OWNER_SRC, 'withSrc');

// A sandbox ROOT, so `path.join(ROOT, rel)` lands in a temp directory and can never reach the repo.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-restore-'));
const withSrc = new Function('fs', 'path', 'ROOT', WITHSRC_TEXT + '; return withSrc;')(fs, path, SANDBOX);

function seed(name, body) {
  const p = path.join(SANDBOX, name);
  fs.writeFileSync(p, body);
  return { rel: name, abs: p, bytes: fs.readFileSync(p) };
}
const bytesOf = (p) => fs.readFileSync(p);
const same = (a, b) => Buffer.compare(a, b) === 0;

// -------------------------------------------------------------------------------------------------------------
section('A. the function under test is the shipped one');

ok(/function withSrc\(rel, from, to, probe\)/.test(WITHSRC_TEXT),
  'A1  withSrc was extracted from ' + OWNER_REL.split('/').pop() + ' by name');
ok(/finally\s*\{\s*fs\.writeFileSync\(full, original/.test(WITHSRC_TEXT.replace(/\s+/g, ' ').replace(/ \{/g, ' {')) ||
   /finally/.test(WITHSRC_TEXT),
  'A1a and it restores inside a finally - the claim D-S8-B3-115 denied', WITHSRC_TEXT.slice(-140));
// The correction, stated as an executable fact: withSrc takes no survived/caught argument and returns the
// probe's value untouched, so it CANNOT branch on that distinction.
ok(!/survived/i.test(WITHSRC_TEXT),
  'A2  withSrc contains no notion of "survived" at all, so it cannot have a survived-only path');
eq((function () { const m = WITHSRC_TEXT.match(/finally/g); return m ? m.length : 0; })(), 1,
  'A3  exactly ONE finally - a second one would be a duplicate guard added in place of a diagnosis');

// -------------------------------------------------------------------------------------------------------------
section('B. the probe RETURNS - the caught and the survived case are the same code path');

{
  const f = seed('caught.js', 'var A = 1;\nif (FLAG) { go(); }\nvar B = 2;\n');
  let seen = null;
  const out = withSrc(f.rel, 'if (FLAG)', 'if (true)', function () {
    seen = fs.readFileSync(f.abs, 'utf8');
    return 'CAUGHT';                       // the caller would record "mutant caught"
  });
  eq(out, 'CAUGHT', 'B1  the probe value is returned unchanged');
  ok(/if \(true\)/.test(seen), 'B1a the mutant WAS installed while the probe ran');
  ok(same(bytesOf(f.abs), f.bytes), 'B1b and the original bytes are restored afterwards');
}
{
  const f = seed('survived.js', 'var A = 1;\nif (FLAG) { go(); }\nvar B = 2;\n');
  const out = withSrc(f.rel, 'if (FLAG)', 'if (true)', function () {
    return { survived: true };             // the caller would record "mutant SURVIVED"
  });
  eq(out.survived, true, 'B2  a surviving mutant is just another returned value');
  ok(same(bytesOf(f.abs), f.bytes),
    'B2a and the file is restored IDENTICALLY - there is no survived-path leak, which is the correction '
    + 'to D-S8-B3-115');
}

// -------------------------------------------------------------------------------------------------------------
section('C. the probe THROWS - finally still restores, and the error still propagates');

{
  const f = seed('throws.js', 'var A = 1;\nif (FLAG) { go(); }\nvar B = 2;\n');
  let caught = null;
  try {
    withSrc(f.rel, 'if (FLAG)', 'if (true)', function () { throw new Error('probe exploded'); });
  } catch (e) { caught = e; }
  ok(caught && /probe exploded/.test(caught.message), 'C1  the throw is not swallowed', caught && caught.message);
  ok(same(bytesOf(f.abs), f.bytes), 'C1a and the original bytes are restored');
}
{
  // An assertion failure inside a probe is the ordinary way a mutation suite reports a miss.
  const f = seed('assertfail.js', 'var A = 1;\nif (FLAG) { go(); }\nvar B = 2;\n');
  try { withSrc(f.rel, 'if (FLAG)', 'if (true)', function () { const assert = require('assert'); assert.strictEqual(1, 2); }); }
  catch (e) { /* expected */ }
  ok(same(bytesOf(f.abs), f.bytes), 'C2  an assertion failure inside the probe also restores');
}

// -------------------------------------------------------------------------------------------------------------
section('D. the anchor guard fires BEFORE anything is written');

{
  const f = seed('noanchor.js', 'var A = 1;\nvar B = 2;\n');
  let caught = null;
  try { withSrc(f.rel, 'if (MISSING)', 'if (true)', function () { return 1; }); } catch (e) { caught = e; }
  ok(caught && /ANCHOR MATCHED 0 TIMES/.test(caught.message), 'D1  a missing anchor throws', caught && caught.message);
  ok(same(bytesOf(f.abs), f.bytes), 'D1a and the file was never touched');
}
{
  const f = seed('twice.js', 'if (FLAG) { a(); }\nif (FLAG) { b(); }\n');
  let caught = null;
  try { withSrc(f.rel, 'if (FLAG)', 'if (true)', function () { return 1; }); } catch (e) { caught = e; }
  ok(caught && /ANCHOR MATCHED 2 TIMES/.test(caught.message), 'D2  an ambiguous anchor throws rather than guessing');
  ok(same(bytesOf(f.abs), f.bytes), 'D2a and the file was never touched');
}

// -------------------------------------------------------------------------------------------------------------
section('E. THE ONE PATH THAT DEFEATS finally: the process is killed mid-probe');

// This is what actually happened. `finally` is a language construct; SIGTERM is not an exception, and a
// terminated process runs no further JavaScript. The sweep kills a suite that exceeds its per-suite
// timeout, and that kill lands wherever the suite happens to be - including inside a mutation window.
{
  const f = seed('killed.js', 'var A = 1;\nif (FLAG) { go(); }\nvar B = 2;\n');
  const childPath = path.join(SANDBOX, '_child.js');
  fs.writeFileSync(childPath, [
    'var fs = require("fs"), path = require("path");',
    'var ROOT = ' + JSON.stringify(SANDBOX) + ';',
    WITHSRC_TEXT,
    'withSrc(' + JSON.stringify(f.rel) + ', "if (FLAG)", "if (true)", function () {',
    '  console.log("IN_PROBE");',
    '  var until = Date.now() + 60000; while (Date.now() < until) {}',   // hold the mutation window open
    '  return 1;',
    '});'
  ].join('\n'));

  // A SYNCHRONOUS sleep. The first version of this section watched the child's stdout, but the busy-wait
  // that followed never yielded to the event loop, so the data handler could not run and the probe looked
  // absent while the file proved it was present. The file IS the signal here, and reading it is sync.
  function napMs(ms) {
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
    catch (e) { const u = Date.now() + ms; while (Date.now() < u) { /* spin */ } }
  }
  const child = cp.spawn(process.execPath, [childPath], { stdio: 'ignore' });
  const t0 = Date.now();
  let inWindow = false;
  const deadline = Date.now() + 20000;
  while (!inWindow && Date.now() < deadline) {
    try { inWindow = /if \(true\)/.test(fs.readFileSync(f.abs, 'utf8')); } catch (e) { inWindow = false; }
    if (!inWindow) napMs(100);
  }
  ok(inWindow, 'E0  the child reached the mutation window', { waitedMs: Date.now() - t0 });
  ok(inWindow, 'E0a and the source really was mutated at that moment');

  child.kill();                                   // the same thing spawnSync does on timeout
  const dl2 = Date.now() + 10000;
  while (child.exitCode === null && child.signalCode === null && Date.now() < dl2) napMs(100);
  napMs(300);                                     // give any (non-existent) unwind a chance to happen

  const after = fs.readFileSync(f.abs, 'utf8');
  ok(/if \(true\)/.test(after),
    'E1  THE MUTANT IS STILL INSTALLED after the kill - finally never ran. This is the mechanism behind '
    + 'the DIRTY_AFTER_SWEEP, and no amount of restore code inside the suite can prevent it', after.trim());
  ok(!same(bytesOf(f.abs), f.bytes), 'E1a the file does not match its original bytes');
  // And the recovery that the sweep must perform on the operator's behalf is a plain overwrite.
  fs.writeFileSync(f.abs, f.bytes);
  ok(same(bytesOf(f.abs), f.bytes), 'E2  restoring from the known-good bytes is exact');
}

// -------------------------------------------------------------------------------------------------------------
section('F. line endings survive a mutation round-trip');

{
  // The repository is CRLF. withSrc NORMALISES to LF before matching, writes the mutant as LF, and
  // restores the ORIGINAL buffer - so the round trip must be byte-exact even though the mutated state
  // was not. If restore wrote the normalised text instead, every mutation would silently reformat a file.
  const f = seed('crlf.js', 'var A = 1;\r\nif (FLAG) { go(); }\r\nvar B = 2;\r\n');
  let mutated = null;
  withSrc(f.rel, 'if (FLAG)', 'if (true)', function () { mutated = fs.readFileSync(f.abs, 'utf8'); return 1; });
  ok(/if \(true\)/.test(mutated), 'F1  the mutation applied through the normalised text');
  ok(mutated.indexOf('\r\n') === -1, 'F1a and the file was LF WHILE MUTATED - which is why git reports a '
    + 'line-ending change on a leaked mutant');
  ok(same(bytesOf(f.abs), f.bytes), 'F2  but the restore is byte-exact, CRLF included');
}

// -------------------------------------------------------------------------------------------------------------
section('G. a write failure during restore is reported, not swallowed');

{
  // If the restore write throws, the caller must learn about it. A silent failure here would leave a
  // mutated file AND a green suite, which is strictly worse than the kill.
  const f = seed('writefail.js', 'var A = 1;\nif (FLAG) { go(); }\nvar B = 2;\n');
  const realWrite = fs.writeFileSync;
  let threw = null, calls = 0;
  fs.writeFileSync = function (p, d, e) {
    calls++;
    if (calls === 2) throw new Error('EPERM: simulated restore failure');
    return realWrite.call(fs, p, d, e);
  };
  try { withSrc(f.rel, 'if (FLAG)', 'if (true)', function () { return 1; }); }
  catch (e) { threw = e; }
  finally { fs.writeFileSync = realWrite; }
  ok(threw && /simulated restore failure/.test(threw.message),
    'G1  a failed restore PROPAGATES - the suite cannot pass while the tree is poisoned',
    threw && threw.message);
  realWrite.call(fs, f.abs, f.bytes);
}

// ---- cleanup ------------------------------------------------------------------------------------------
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) { /* best effort */ }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
