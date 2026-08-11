// Kitchen Mama Operation System — F1-SMALL-GAP-JOB-DONE-NOTICE-R1 manual recalc completion-notice guard.
// Run: node assets/tests/gap-job-done-notice-f1-small-r1.test.js
// -----------------------------------------------------------------------------
// Proves the shared transport helper announces a MANUAL gap-recalc completion EXACTLY ONCE per runId, only via the
// manual runJob done() (which the transport calls only on terminal DONE, AFTER refresh), and that the resume/mount
// path stays silent (scheduled/resumed jobs never pop success). Pure dedupe + message formatting are unit-tested;
// the wiring (manual-only, once-per-run, FAILED/STALLED/CANCELLED/POLL_TIMEOUT never announce) is asserted structurally.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');   // = assets/
var GR = require('../js/utils/gap-recalc-transport.js');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (a !== e) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }

var INV = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');
var TRANSPORT = read('js/utils/gap-recalc-transport.js');

// =============================================================================
section('API present');
ok(typeof GR.announceManualDone === 'function', 'announceManualDone exported');
ok(typeof GR.formatDoneMessage === 'function', 'formatDoneMessage exported');

section('§7 exactly one notice per manual runId (dedupe); different runId notifies; injectable notify');
var calls = []; var notify = function (m) { calls.push(m); };
ok(GR.announceManualDone('RUN-DN-1', 'msg-a', notify) === true, 'first announce for RUN-DN-1 → true (notifies)');
ok(GR.announceManualDone('RUN-DN-1', 'msg-a-again', notify) === false, 'repeated DONE for the SAME runId → false (no second notice)');
ok(GR.announceManualDone('RUN-DN-2', 'msg-b', notify) === true, 'a different runId → true (notifies)');
eq(calls.length, 2, 'exactly TWO notifications for two distinct runIds (the duplicate was suppressed)');
eq(calls[0], 'msg-a', 'message passed through verbatim (1)');
eq(calls[1], 'msg-b', 'message passed through verbatim (2)');
// a missing runId cannot be de-duped but must still deliver the single manual notice the caller intends
var c2 = []; ok(GR.announceManualDone('', 'no-run', function (m) { c2.push(m); }) === true && c2.length === 1, 'missing runId still delivers one notice');

section('formatDoneMessage — page supplies label; scope counts only when present on the DONE payload');
eq(GR.formatDoneMessage('Inventory', { mode: 'ALL_SITES' }, { scopesProcessed: 10, scopesTotal: 10 }),
  'Inventory recalculation completed successfully.\n10 / 10 scopes processed.', 'Inventory ALL_SITES → N / N scopes processed');
eq(GR.formatDoneMessage('Order Planning', { mode: 'ALL_SITES' }, { scopesProcessed: 34, scopesTotal: 34 }),
  'Order Planning recalculation completed successfully.\n34 / 34 scopes processed.', 'Order Planning ALL_SITES → 34 / 34');
eq(GR.formatDoneMessage('Inventory', { mode: 'CURRENT_SCOPE', country: 'US', marketplace: 'AMAZON_US' }, {}),
  'Inventory recalculation completed — US / AMAZON_US.', 'CURRENT_SCOPE with a locally-resolved label');
eq(GR.formatDoneMessage('Inventory', { mode: 'CURRENT_SCOPE' }, { scopesProcessed: 1, scopesTotal: 1 }),
  'Inventory recalculation completed successfully.\n1 / 1 scope processed.', 'CURRENT_SCOPE no label → singular scope count');
eq(GR.formatDoneMessage('Inventory', null, null), 'Inventory recalculation completed successfully.', 'no scope/state → base success line only');
ok(GR.formatDoneMessage('Order Planning', { mode: 'ALL_SITES' }, {}).indexOf('debug') === -1, 'no debug payload in message');

section('§4/§5 transport calls done() only on terminal DONE, AFTER refresh (refresh-before-notify); non-DONE → failed/cancelled');
ok(/status === JOB_STATUS\.DONE \|\| status === JOB_STATUS\.CANCELLED[\s\S]{0,200}opts\.refresh[\s\S]{0,400}ui\.done\(finalState\)/.test(TRANSPORT), 'runJob: refresh() runs before ui.done(finalState)');
ok(/if \(typeof ui\.failed === 'function'\) ui\.failed\(finalState/.test(TRANSPORT), 'non-DONE terminal routes to ui.failed (never ui.done)');
ok(!/announceManualDone/.test(TRANSPORT.replace(/announceManualDone: announceManualDone|function announceManualDone|var _announcedRuns[\s\S]*?return true;\n  \}/g, '')), 'transport never self-invokes announceManualDone (page-invoked only)');

section('Inventory wiring — MANUAL done announces once; resume/cancelled/failed stay silent');
eq(count(INV, 'gr.announceManualDone('), 1, 'Inventory: announceManualDone called EXACTLY once (only the manual runJob done)');
ok(/done: function \(finalState\) \{[\s\S]{0,240}gr\.announceManualDone\(_irActiveRunId, gr\.formatDoneMessage\('Inventory', scopeSpec, finalState\)\)/.test(INV), 'Inventory manual done → announceManualDone(runId, formatDoneMessage(Inventory,...))');
// the announce sits in the runJob block (product: 'INVENTORY'), NOT in the resume-on-mount block
ok(/product: 'INVENTORY'[\s\S]{0,2500}gr\.announceManualDone\(/.test(INV), 'Inventory announce lives inside the manual runJob (product INVENTORY) block');
ok(/resumeIfRunning[\s\S]*?done: function \(\) \{(?:(?!announceManualDone)[\s\S])*?\},/.test(INV), 'Inventory resume-on-mount done() does NOT announce (scheduled/resumed silent)');
ok(!/cancelled: function \([\s\S]{0,200}announceManualDone/.test(INV), 'Inventory cancelled() does NOT announce success');

section('Order Planning wiring — parity');
eq(count(RO, 'gr.announceManualDone('), 1, 'Order Planning: announceManualDone called EXACTLY once');
ok(/done: function \(finalState\) \{[\s\S]{0,240}gr\.announceManualDone\(_roActiveRunId, gr\.formatDoneMessage\('Order Planning', scopeSpec, finalState\)\)/.test(RO), 'OP manual done → announceManualDone(runId, formatDoneMessage(Order Planning,...))');
ok(/product: 'ORDER_PLANNING'[\s\S]{0,1200}gr\.announceManualDone\(/.test(RO), 'OP announce lives inside the manual runJob (product ORDER_PLANNING) block');
ok(/resumeIfRunning[\s\S]*?done: function \(\) \{(?:(?!announceManualDone)[\s\S])*?\},/.test(RO), 'OP resume-on-mount done() does NOT announce');

section('cache-version bump — changed assets refetch');
var INDEX = read(path.join('..', 'index.html'));
ok(/gap-recalc-transport\.js\?v=donenotice-20260811/.test(INDEX), 'index.html loads gap-recalc-transport.js with the bumped token');
ok(!/\?v=aiscope-20260811/.test(INDEX), 'no stale ?v=aiscope-20260811 remains');

console.log('\n----------------------------------------');
console.log('GAP JOB DONE NOTICE (F1-SMALL-GAP-JOB-DONE-NOTICE-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
