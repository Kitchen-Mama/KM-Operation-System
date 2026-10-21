// PSB-DEMO-R2 — the two boundaries the review found, and nothing more.
// Run: node assets/tests/product-strategy-demo-currency-and-drag-lifecycle-psb-demo-r2.test.js
//
//   A  the renderer, read from the shipped source: a competitor's identity includes the panel currency;
//      every demo control is one panel's; a drag ends through ONE idempotent cancel that every teardown
//      calls, that removes only what the drag added and commits nothing
//   B  the real-browser run (docs/evidence/psb-demo-r2/demo-r2.json) on the shipped source: every check held
//   C  the counter-example: the SAME runner against the UI as it was before this round FAILS the checks
//      this round is about — so B is not a run that could not have failed
//   D  six browser mutants, each removing one piece of the fix, each caught by at least one check
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var UI = 'assets/js/product-strategy/psb-board-ui.js';
var EVD = 'docs/evidence/psb-demo-r2/';
var PRE_SHA = 'c0f0f6fa';
var passed = 0, failed = 0;
function ok(c, l, got) { if (c) { passed++; console.log('ok   ' + l); } else { failed++; console.log('FAIL ' + l + (got !== undefined ? '  ' + JSON.stringify(got).slice(0, 300) : '')); } }
function eq(a, b, l) { ok(JSON.stringify(a) === JSON.stringify(b), l, { got: a, want: b }); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function sha(rel) { return crypto.createHash('sha256').update(read(rel)).digest('hex').slice(0, 16); }
function shaText(s) { return crypto.createHash('sha256').update(String(s).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SRC = read(UI);
var DEMO = SRC.slice(SRC.indexOf('6A  PSB-DEMO-R1'), SRC.indexOf('function renderChart(panel, thrC, findings)'));
function fnBody(name) {
  var i = SRC.indexOf('function ' + name + '(');
  if (i < 0) return '';
  var j = SRC.indexOf('{', i), depth = 0;
  for (var k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) return SRC.slice(i, k + 1); }
  }
  return '';
}

section('A. the renderer, read from the shipped source');
ok(/function demoCompCtx\(category, currency\) \{\n\s+return demoSiteKey\(\) \+ '\|' \+ \(category \|\| ''\) \+ '\|' \+ \(currency \|\| ''\) \+ '\|' \+ demoPriceCtx\(\);/.test(SRC),
  'A1  a competitor is filed under site + category + CURRENCY + price context');
ok(/\.filter\(function \(c\) \{ return c\.currency === currency; \}\)/.test(fnBody('demoCompetitors')),
  'A2  and a panel reads only entries recorded in its own currency — nothing is converted or borrowed');
var compCalls = SRC.split('\n').filter(function (l) { return /demoCompetitors\(/.test(l); });
ok(compCalls.length >= 4 && compCalls.every(function (l) {
  return /demoCompetitors\(.*, (CUR|currency|panel\.currency|p\.currency)\)/.test(l);
}), 'A3  every read of the competitors names a currency (' + compCalls.length + ' lines)', compCalls);
var ctxCalls = SRC.match(/demoCompCtx\([^)]*\)/g) || [];
ok(ctxCalls.length >= 4 && ctxCalls.every(function (c) { return c.indexOf(',') !== -1; }), 'A4  every competitor key is built with a currency', ctxCalls);
var CTL = fnBody('demoControls');
ok(/function cid\(node, role\) \{ node\.id = role \+ '-' \+ CUR; node\.setAttribute\('data-demo-ctl', role\);/.test(CTL),
  'A5  every demo control id names its panel, and its role is carried separately');
ok(!/\.id = '/.test(CTL.replace(/function cid\([^}]*\}/, '')), 'A6  and no demo control assigns a bare, panel-less id');
ok(/var formHere = DEMO\.compFormOpen && DEMO\.compFormCur === CUR;/.test(CTL), 'A7  the competitor form opens in the one panel that asked for it');
ok(/if \(n && \(n\.currency \|\| ''\) !== CUR\) n = null;/.test(CTL), 'A8  the simulation editor shows only in the selected product’s panel');
ok(/demoUndo\(CUR\)/.test(CTL) && /demoResetAll\(CUR\)/.test(CTL) && /demoUndoAvailable\(CUR\)/.test(CTL),
  'A9  Undo and Reset all act on this panel’s products, not the other currency’s');
var CANCEL = fnBody('demoCancelDrag');
eq((SRC.match(/function demoCancelDrag\(/g) || []).length, 1, 'A10 one cancel');
ok(/if \(!d\) return false;/.test(CANCEL) && /DEMO\.drag = null;/.test(CANCEL), 'A11 it is idempotent: a second call finds no drag and does nothing');
ok(!/renderData\(|demoSetSim\(/.test(CANCEL), 'A12 it commits nothing and does not redraw');
ok(/document\.removeEventListener\('keydown', d\.onKey, true\)/.test(CANCEL)
  && (CANCEL.match(/removeEventListener/g) || []).length === 1, 'A13 it removes exactly one listener: the one this drag registered, by its own reference');
ok(/releasePointerCapture\(d\.pointerId\)/.test(CANCEL) && /removeChild\(d\.readout\)/.test(CANCEL) && /removeAttribute\('transform'\)/.test(CANCEL),
  'A14 it releases the drag’s pointer capture and removes its readout and offset');
ok(/^\s*demoCancelDrag\(\);/m.test(fnBody('paintView').split('\n').slice(1, 3).join('\n')), 'A15 every chart rebuild (paintView) ends a drag first');
ok(/demoCancelDrag\(\);/.test(fnBody('unmount')), 'A16 leaving the page (unmount) ends a drag');
ok(/demoCancelDrag\(\);/.test(fnBody('demoClearAll')), 'A17 a site change (demoClearAll) ends a drag');
ok((CTL.match(/demoCancelDrag\(\);/g) || []).length === 2, 'A18 a price-view or activity change ends the drag that belonged to the old context');
var DRAG = fnBody('demoAttachDrag');
ok(/if \(!d \|\| d\.handle !== handle\) return;/.test(DRAG) && /d\.ctx === demoSimCtx\(\)/.test(DRAG),
  'A19 a release commits only its own handle’s drag, and only into the context it started in');
ok(/if \(DEMO\.drag !== mine\) return;/.test(DRAG), 'A20 Escape is consumed only while this drag is the one under way');
ok(!/DEMO\.drag = null/.test(DRAG), 'A21 the drag never clears itself around the cancel');

section('B. the real-browser run, on the shipped source');
var EV = JSON.parse(read(EVD + 'demo-r2.json'));
Object.keys(EV.sources).forEach(function (f) { eq(EV.sources[f], sha(f), 'B0  ' + f + ' is unchanged since the run'); });
ok(EV.complete === true && EV.failed === 0 && EV.passed >= 50 && !EV.mutant, 'B1  the whole sequence ran in Chrome and every check held (' + EV.passed + ')', { failed: EV.failed, error: EV.error });
function has(ev, name, wantOk) { return ev.checks.some(function (c) { return c.ok === wantOk && c.name.indexOf(name) === 0; }); }
var NAMED = [
  'one site and one category draw a USD panel and a EUR panel',
  'every demo control id is unique',
  'Add competitor in the USD panel opens a form in the USD panel only',
  'add: the EUR panel shows no competitor and no chip',
  'add: the EUR axis did not move',
  'add: the competitor is filed under a key that names its currency',
  'edit: the EUR panel still shows no competitor and its axis did not move',
  'delete: the EUR panel and axis are as they were',
  'activity: the EUR competitor is in the EUR panel only',
  'activity: the USD axis did not move for a EUR competitor',
  'left mid-drag: no drag is left behind',
  'left mid-drag: the document keydown listeners are back',
  'left mid-drag: the next Escape reaches the page and nothing prevents it',
  'left mid-drag: another component’s document capture listener still fires',
  'returned: the release while away committed nothing',
  'returned: an ordinary drag works again and commits',
  'context switched mid-drag: the next Escape reaches the page',
  'context switched: the release committed nothing in either context',
  'chart rebuilt mid-drag: no drag is left behind',
  'rebuilt: the release committed nothing',
  'during a drag Escape still cancels it, and is consumed by the drag',
  'zero write requests on the wire',
  'the canonical rows are byte-identical after everything',
  'nothing was written to browser storage or the URL',
  'after a reload: no simulation, no competitor, both axes as first drawn'];
NAMED.forEach(function (n) { ok(has(EV, n, true), 'B2  browser: ' + n); });

section('C. the counter-example: the same runner, the UI before this round');
var PRE = JSON.parse(read(EVD + 'mutant-PREFIX.json'));
var preUi = cp.execFileSync('git', ['show', PRE_SHA + ':' + UI], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
eq(PRE.mutantSourceSha, shaText(preUi), 'C0  the counter-example ran the UI exactly as it was at ' + PRE_SHA);
eq(PRE.sources['assets/tests/_psb-demo-r2-runner.js'], EV.sources['assets/tests/_psb-demo-r2-runner.js'], 'C1  with the same runner as B');
ok(PRE.complete === true && PRE.failed >= 15, 'C2  it ran to the end and failed ' + PRE.failed + ' checks', { failed: PRE.failed, error: PRE.error });
['add: the EUR panel shows no competitor and no chip', 'add: the EUR axis did not move',
  'every demo control id is unique', 'Add competitor in the USD panel opens a form in the USD panel only',
  'left mid-drag: no drag is left behind', 'left mid-drag: the next Escape reaches the page and nothing prevents it',
  'context switched mid-drag: no drag is left behind', 'chart rebuilt mid-drag: the next Escape reaches the page']
  .forEach(function (n) { ok(has(PRE, n, false), 'C3  before the fix this FAILED: ' + n); });

section('D. browser mutants — each removes one piece of the fix');
var R2 = require('./_psb-demo-r2-runner.js');
Object.keys(R2.MUTANTS).filter(function (k) { return k !== 'PREFIX'; }).forEach(function (k) {
  var p = EVD + 'mutant-' + k + '.json';
  if (!fs.existsSync(path.join(ROOT, p))) { ok(false, 'D  ' + k + ' was run (' + p + ')'); return; }
  var m = JSON.parse(read(p));
  var fixed = read(UI).replace(R2.MUTANTS[k].find, R2.MUTANTS[k].repl);
  ok(m.mutantSourceSha === shaText(fixed) && m.sources['assets/tests/_psb-demo-r2-runner.js'] === EV.sources['assets/tests/_psb-demo-r2-runner.js'],
    'D0  ' + k + ' ran the shipped UI with exactly that one change, under the same runner');
  ok(m.failed >= 1, 'D1  ' + k + ' CAUGHT (' + m.failed + ' checks failed): ' + R2.MUTANTS[k].why,
    m.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).slice(0, 3));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
