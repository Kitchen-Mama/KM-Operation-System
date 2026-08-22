// Kitchen Mama Operation System — R5D manual-only AI Plan Result popup + user-facing semantics — F1-7N-FA-3C-R5D.
// Run: node assets/tests/ai-plan-result-popup-manual-only-f1-7n-fa-3c-r5d.test.js
// Extracts the REAL request-order.js result functions into a minimal fake DOM (mirrors the PRE3-R2 harness) and proves:
// manual-only result authority (a stale/older or non-manual ctx never owns the popup), the "No order needed" wording,
// the four-level severity (No order needed is NOT an error; Failed/committedUnverified IS), the fixed dismissible toast
// (close + Escape), and lifecycle (stale-after-reload, single keydown listener). Driver wiring is asserted at source
// level (the async START→CONTINUE loop is covered by the R4E2-B2 job tests).
// NOTE: no 'use strict' — the test relies on top-level eval() declaring the extracted functions into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function has(hay, needle, l) { ok(String(hay).indexOf(needle) !== -1, l + ' [contains "' + needle + '"]'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var RO = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');
var CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'pages', 'request-order.css'), 'utf8').replace(/\r\n/g, '\n');

// ---- minimal fake DOM ----
var addKeydownCount = { n: 0 }, keydownHandlers = [], els = {};
function makeEl(tag) { var attrs = {}; return { tagName: tag, id: '', className: '', hidden: true, innerHTML: '', style: {}, children: [],
  setAttribute: function (k, v) { attrs[k] = String(v); }, getAttribute: function (k) { return attrs[k] === undefined ? null : attrs[k]; },
  appendChild: function (c) { this.children.push(c); if (c.id) els[c.id] = c; return c; } }; }
var body = makeEl('body');
var document = { getElementById: function (id) { return els[id] || null; }, createElement: function (t) { return makeEl(t); }, body: body,
  addEventListener: function (type, fn) { if (type === 'keydown') { addKeydownCount.n++; keydownHandlers.push(fn); } } };
var window = {};

// ---- module state + collaborators the extracted functions reference ----
var _roAiPlanResult = null, _roAiPlanKeydownBound = false, _roAiPlanManualToken = 0, _testScope = null;
function _roCanonicalScope_() { return _testScope; }

// ---- extract real functions from request-order.js ----
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); var e = src.indexOf('\n}\n', s); return src.slice(s, e + 2); }
function extractLine(src, name) { return src.match(new RegExp('function ' + name + '\\([^\\n]*\\n'))[0]; }
// contiguous region: the reason-labels var + _roAiPlanReasonLabel_ + _roAiPlanSeverity_ + _roRenderAiPlanResult_
var regionStart = RO.indexOf('var _RO_AI_PLAN_REASON_LABELS_');
var rendStart = RO.indexOf('function _roRenderAiPlanResult_');
var region = RO.slice(regionStart, RO.indexOf('\n}\n', rendStart) + 2);
eval(extractFn(RO, '_roAiPlanScopeKey_'));
eval(extractLine(RO, '_roAiPlanNum_'));
eval(extractFn(RO, '_roAiPlanResultVisibleFor_'));
eval(extractLine(RO, '_roAiPlanShouldShowResult_'));
eval(extractFn(RO, '_roAiPlanResultEl_'));
eval(region);                                   // labels + reasonLabel + severity + render
eval(extractLine(RO, '_roClearAiPlanResult_'));
eval(extractFn(RO, '_roSetAiPlanResult_'));

var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
function setResult(counts, reasonCounts) { _testScope = SCOPE; _roSetAiPlanResult_('DONE', { done: 99, total: 99, counts: counts, reasonCounts: reasonCounts || {}, reasonSamples: {} }, SCOPE); }

// ==========================================================================
section('manual-only result authority (pure) — only a current-session manual token owns the popup');
_roAiPlanManualToken = 5;
ok(_roAiPlanShouldShowResult_({ manual: true, token: 5 }) === true, 'MANUAL_UI current-session click (newest token) → shows popup [1]');
ok(_roAiPlanShouldShowResult_({ manual: false, token: 5 }) === false, 'AUTOMATION/SCHEDULED/BACKGROUND (manual:false) → no popup [2,3,4]');
ok(_roAiPlanShouldShowResult_({ manual: false, token: -1 }) === false, 'SYSTEM_RESUME drive (manual:false, token:-1) → no popup [4]');
ok(_roAiPlanShouldShowResult_({ manual: true, token: 4 }) === false, 'older/superseded manual run (stale token) cannot replace a newer result [13]');
ok(_roAiPlanShouldShowResult_(null) === false, 'no ctx → no popup (page-open alone is NOT manual)');

section('8-11 + wording — render a successful manual result');
setResult({ created: 0, reused: 0, regenerated: 45, needsConfirmation: 0, blockedConflict: 0, notReady: 54, committedUnverified: 0, failed: 0 });
_roRenderAiPlanResult_();
var el = document.getElementById('ro-ai-plan-result');
ok(el && el.hidden === false, '11. popup is shown for the manual result');
has(el.innerHTML, 'AI Plan Result', 'title present');
has(el.innerHTML, 'Processed', '11. Processed row present'); has(el.innerHTML, '99', '11. Processed=99');
has(el.innerHTML, 'Regenerated', '11. Regenerated row'); has(el.innerHTML, '45', '11. Regenerated=45');
has(el.innerHTML, 'No order needed', '1/8. "Not ready" renamed to "No order needed"'); has(el.innerHTML, '54', '11. No order needed=54');
ok(el.innerHTML.indexOf('Not ready') === -1, 'the old "Not ready" label no longer appears');
eq(el.className, 'ro-ai-plan-result ro-ai-plan-result--ok', '9. Regenerated>0 + No order needed>0 → success (ok) styling, NOT error');
eq([el.getAttribute('role'), el.getAttribute('aria-live')], ['status', 'polite'], 'a11y: success → role=status, aria-live=polite');

section('9. No order needed ONLY → neutral INFO styling (never error)');
setResult({ created: 0, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 54, committedUnverified: 0, failed: 0 },
  { NON_ACTIONABLE_ZERO_RECOMMENDATION: 54 });
_roRenderAiPlanResult_();
eq(el.className, 'ro-ai-plan-result ro-ai-plan-result--info', '9. zero-recommendation-only → INFO (neutral), NOT --bad');
eq(el.getAttribute('role'), 'status', 'a11y: info → role=status (polite, not alert)');
has(el.innerHTML, 'No order needed — all recommended quantities are 0.', '8. NON_ACTIONABLE_ZERO_RECOMMENDATION → friendly primary message');

section('8. technical tokens stay under a collapsed <details>, never the primary message');
has(el.innerHTML, '<details', 'raw reason tokens live in a collapsed <details> section');
has(el.innerHTML, 'Technical details', 'collapsed "Technical details" summary present');
has(el.innerHTML, 'NON_ACTIONABLE_ZERO_RECOMMENDATION', 'raw token retained under diagnostics');
ok(el.innerHTML.indexOf('__msg">No order needed') !== -1, 'primary message is the friendly text, not the raw token');

section('10. Failed / committedUnverified → ERROR styling + reconciliation, assertive');
setResult({ created: 10, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, committedUnverified: 2, failed: 0 });
_roRenderAiPlanResult_();
eq(el.className, 'ro-ai-plan-result ro-ai-plan-result--bad', '10. committedUnverified>0 → error (bad) styling');
eq([el.getAttribute('role'), el.getAttribute('aria-live')], ['alert', 'assertive'], 'a11y: error → role=alert, aria-live=assertive');
has(el.innerHTML, 'Reconciliation required', '10. reconciliation is clearly indicated');
setResult({ created: 0, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, committedUnverified: 0, failed: 3 });
_roRenderAiPlanResult_();
eq(el.className, 'ro-ai-plan-result ro-ai-plan-result--bad', '10. failed>0 → error (bad) styling');

section('severity — warn for needs-confirmation / blocked');
eq(_roAiPlanSeverity_({ created: 5, needsConfirmation: 1 }), 'warn', 'needsConfirmation>0 → warn');
eq(_roAiPlanSeverity_({ created: 5, blockedConflict: 1 }), 'warn', 'blocked>0 → warn');
eq(_roAiPlanSeverity_({ created: 5 }), 'ok', 'clean success → ok');
eq(_roAiPlanSeverity_({ notReady: 3 }), 'info', 'no-order-needed only → info');
eq(_roAiPlanSeverity_({ failed: 1, created: 9 }), 'bad', 'any failed → bad regardless of successes');

section('6-7. dismissible — close button handler + Escape close');
setResult({ created: 5, notReady: 0, failed: 0 }); _roRenderAiPlanResult_();
ok(document.getElementById('ro-ai-plan-result').hidden === false, 'popup shown before close');
has(el.innerHTML, 'aria-label="Close AI Plan result"', 'close control has an accessible label');
ok(/<button /.test(el.innerHTML) && !/<div[^>]*onclick/.test(el.innerHTML), 'a11y: close is a real <button>, no inaccessible clickable div');
_roClearAiPlanResult_();   // the visible "×" button invokes this (a real <button> — keyboard accessible)
ok(document.getElementById('ro-ai-plan-result').hidden === true && _roAiPlanResult === null, '6. close removes/hides the popup without mutating the job');
// Escape closes when the popup is active
setResult({ created: 5 }); _roRenderAiPlanResult_();
ok(keydownHandlers.length >= 1, 'a keydown handler is registered');
keydownHandlers[0]({ key: 'Escape' });
ok(document.getElementById('ro-ai-plan-result').hidden === true, '7. Escape closes the active popup');
setResult({ created: 5 }); _roRenderAiPlanResult_();
keydownHandlers[0]({ key: 'a' });
ok(document.getElementById('ro-ai-plan-result').hidden === false, '7. a non-Escape key does not close the popup');

section('5 + 12. stale-after-reload = no popup; single keydown listener across repeated mounts');
_roAiPlanResult = null;   // a fresh module load (reload) starts with no result
_roRenderAiPlanResult_();
ok(document.getElementById('ro-ai-plan-result').hidden === true, '5. no stale result reopens after reload (module state is null → hidden)');
var before = addKeydownCount.n; _roAiPlanResultEl_(); _roAiPlanResultEl_(); _roAiPlanResultEl_();
eq(addKeydownCount.n, before, '12. repeated element access binds NO additional keydown listener (bound once)');

section('SOURCE — driver wiring for manual-only authority + automation suppression');
ok(/var ctx = \{ manual: true, token: \(\+\+_roAiPlanManualToken\) \};/.test(RO), '4. manual run stamps a fresh manual token [manual-only authority]');
ok(/_roAiPlanDriveContinue_\(scope, \{ manual: false, token: -1 \}\)/.test(RO), '4/5. resume drives with manual:false (no popup / no restore)');
ok(/function _roAiPlanFinishDone_\(scope, disp, ctx\)/.test(RO) && /var show = _roAiPlanShouldShowResult_\(ctx\);/.test(RO), 'DONE gates the popup/toast on the manual-only authority');
ok(/if \(show\) _roSetAiPlanResult_\('DONE', disp, scope\);/.test(RO), 'DONE popup shown only for a manual owner');
ok(/if \(show\) \{ _roSetAiPlanResult_\('FAILED', disp, scope\)/.test(RO) && /if \(show\) _roSetAiPlanResult_\('INCOMPLETE', disp, scope\)/.test(RO), 'FAILED/INCOMPLETE also manual-gated (automation silent)');
ok(/if \(show\) \{ _roRenderAiPlanResult_\(\); _roNotify_\(msg\); \}/.test(RO), '5. AUTOMATION/RESUME → read-back only, no toast');
ok(/_roAiPlanKeydownBound = true;/.test(RO), 'Escape listener bound once (no duplicate handlers)');

section('CSS — fixed, non-disruptive, dismissible toast + info tone + responsive');
ok(/\.ro-ai-plan-result \{ position: fixed;/.test(CSS), 'popup is position:fixed (no page reflow / layout shift)');
ok(/right: 16px; bottom: 16px;/.test(CSS), 'anchored bottom-right');
ok(/width: 360px; max-width: calc\(100vw - 32px\);/.test(CSS), 'desktop ~360px, mobile max-width calc(100vw - 32px)');
ok(/\.ro-ai-plan-result--info \{/.test(CSS), 'neutral INFO tone exists (No order needed ≠ error)');
ok(/@media \(max-width: 640px\)/.test(CSS), 'responsive rule present');

section('14-15. existing Order Planning UI + backend/API payload unchanged');
ok(/function renderRequestOrderTable/.test(RO), '14. Order Planning table renderer intact');
ok(/getAiPlanFirstLayer/.test(RO), '14. AI Plan first-layer read intact');
ok(/_roAiPlanContinueDisposition_/.test(RO) && !/payload|body\.mode\s*=/.test(region), '15. result popup adds no API/payload field (frontend-only)');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R5D AI PLAN RESULT POPUP (F1-7N-FA-3C-R5D): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
