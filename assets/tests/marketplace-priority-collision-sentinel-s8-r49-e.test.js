// =============================================================================================================
// S8-R49-E · E1 SENTINEL — the cross-company Marketplace Priority collision is STILL OPEN
// -------------------------------------------------------------------------------------------------------------
// WHAT THIS SUITE IS AND IS NOT. It is NOT an acceptance of the defect. It asserts that a KNOWN, DOCUMENTED,
// UNFIXED defect is still exactly where R49-E characterized it, and that its characterization still fails for
// exactly the known reasons and no others.
//
// WHY IT EXISTS. The characterization asserts the real contract, so it FAILS (exit 1). The sweep registry is
// `/\.test\.js$/` with no exclusion list, so shipping it as a `.test.js` would put a permanently-red suite into
// the measured baseline (R48-S: 627 CLEAN / 0 FAILING / 0 UNVERIFIABLE) and every later round would have to
// special-case it. Isolating it by extension alone, though, risks it being forgotten.
//
// So: the characterization is isolated and red; this registered sentinel runs it and proves it is still red for
// the known reasons. The defect stays visible in the registry, the baseline stays honest, and nothing claims the
// behaviour is correct.
//
// WHEN THE PRODUCERS ARE FIXED, THIS SUITE FAILS — deliberately. That failure is the promotion signal: the
// characterization goes green, is renamed to `.test.js`, and this sentinel is deleted. Read a failure here as
// "the defect was fixed and the scaffolding is now stale", never as a regression.
//
// Root cause, for a reader who lands here first:
//   supply-planning-source-projection.js:148   priorityByMkt[str(r.marketplace) || str(r.marketplace_id)]
//   supply-planning-production-assembly.js:115 prByMkt[str(r.marketplace)]
// Both omit company and country from a key whose canonical identity is company + country + marketplace, so the
// LAST marketplaces row sharing a name wins and a receiver can be handed another company's priority.
// =============================================================================================================
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { pass++; } else { fail++; console.log('FAIL ' + msg + '  got ' + A + ' want ' + B); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
var CHAR_REL = 'assets/tests/_known-defect-marketplace-priority-collision-s8-r49-e.characterization.js';
var CHAR_ABS = path.join(ROOT, CHAR_REL);

// The count R49-E measured. It is pinned so that the defect neither quietly widens nor quietly narrows without
// somebody looking at it.
var KNOWN_CONTRACT_VIOLATIONS = 8;

section('1 — the characterization exists and is isolated from the sweep registry');

ok(fs.existsSync(CHAR_ABS), 'S1 the known-defect characterization file is present at ' + CHAR_REL);
ok(!/\.test\.js$/.test(CHAR_REL),
   'S2 and it is NOT named *.test.js, so the sweep registry cannot enumerate it into the measured baseline');
ok(/\.characterization\.js$/.test(CHAR_REL),
   'S3 its extension says what it is, so the isolation is deliberate rather than incidental');

section('2 — it still FAILS, for exactly the known reasons');

var r = cp.spawnSync(process.execPath, [CHAR_ABS], { encoding: 'utf8', cwd: ROOT, maxBuffer: 1 << 28 });
var out = (r.stdout || '') + (r.stderr || '');
function num(re) { var m = re.exec(out); return m ? Number(m[1]) : null; }
var violations = num(/CONTRACT_VIOLATIONS (\d+)/);
var unexpected = num(/UNEXPECTED_FAILURES (\d+)/);
var passed = num(/passed (\d+)/);
var total = num(/assertions (\d+)/);

ok(!/SyntaxError|ReferenceError|FAIL-CLOSED/.test(out),
   'S4 the characterization RAN — it did not crash, so its verdict is a measurement and not an accident');
eq(r.status, 1,
   'S5 it exits NON-ZERO: the contract is not met, and it does not pretend otherwise');
eq(violations, KNOWN_CONTRACT_VIOLATIONS,
   'S6 exactly ' + KNOWN_CONTRACT_VIOLATIONS + ' CONTRACT VIOLATIONS — the defect is neither wider nor '
   + 'narrower than R49-E measured. IF THIS FAILS LOW, the producers may have been fixed: run the '
   + 'characterization, and if it is green, promote it to .test.js and delete this sentinel.');
eq(unexpected, 0,
   'S7 and ZERO unexpected failures — every red assertion is the KNOWN defect, so nothing else is hiding '
   + 'inside this file');
ok(total !== null && passed !== null && total > passed,
   'S8 the file is not vacuous: it executed ' + total + ' assertions, of which ' + passed + ' pass today');
ok(/STATUS: KNOWN_DEFECT_PRESENT/.test(out),
   'S9 and it reports its own status as KNOWN_DEFECT_PRESENT rather than as a pass');
ok(!/DEFECT_APPEARS_FIXED/.test(out),
   'S10 it does not report the defect as fixed (that line is its promotion signal)');

section('3 — the root cause is still in the shipped producers');
// Read from source, so this cannot be satisfied by the characterization alone. If either line changes shape,
// this sentinel fails and a human decides whether the defect was fixed or merely moved.

function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var PROJ = src('assets/js/core/supply-planning-source-projection.js');
var ASM = src('assets/js/core/supply-planning-production-assembly.js');

ok(/priorityByMkt\[k\] = r\.allocation_priority/.test(PROJ)
   && /var k = str\(r\.marketplace\) \|\| str\(r\.marketplace_id\)/.test(PROJ),
   'S11 source-projection still keys its priority map by the marketplace NAME (or id) alone');
ok(/prByMkt\[k\] = r\.allocation_priority/.test(ASM) && /var k = str\(r\.marketplace\);/.test(ASM),
   'S12 production-assembly still keys its priority map by the marketplace NAME alone');
ok(/priority: prByMkt\[vr\.scope\.marketplace\]/.test(ASM),
   'S13 and still looks it up by the scope\'s marketplace NAME, never by company + country + marketplace');

// The composite key the SAME file already builds for a neighbouring field. Its presence is what makes this a
// slip rather than a deliberate design, and it is also the shape the fix should copy.
ok(/\[str\(r\.company\), str\(r\.country\), str\(r\.marketplace\), str\(r\.sku\)\]\.join\('\|'\)/.test(PROJ),
   'S14 source-projection already builds a COMPOSITE key for fulfillment_model in the same function — '
   + 'the fix is to key the priority map the same way');

section('4 — the frozen allocator is NOT the defect');
// §40 is not at fault and must not be touched by the remediation: it consumes a priority already attached to a
// fully identified receiver, and it refuses rather than guessing when one is absent.
var ALLOC = src('assets/js/core/supply-planning-allocations.js');
ok(/requireQty\(r\.allocationPriority/.test(ALLOC),
   'S15 the §40 allocator REQUIRES a per-receiver allocationPriority and fails closed without one — the '
   + 'contamination happens upstream, so no allocator change is implied');

console.log('\n----------------------------------------');
console.log('KNOWN DEFECT: marketplace priority identity collision — STILL OPEN (characterized, not fixed)');
console.log('  characterization: ' + CHAR_REL);
console.log('  contract violations: ' + violations + '   unexpected failures: ' + unexpected);
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('MARKETPLACE PRIORITY COLLISION SENTINEL (S8-R49-E): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
