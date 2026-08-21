// Kitchen Mama Operation System — AI Plan reason distribution + persistent result panel — F1-7N-FA-3C-PRE3-R2.
// Run: node assets/tests/ai-plan-reason-distribution-and-result-panel-f1-7n-fa-3c-pre3-r2.test.js
//
// PRE3-R1 surfaced coarse terminal counts but (a) the toast was not reliably seen and (b) coarse counts cannot say WHY
// 99 SKUs produced 0 drafts. This slice adds: BACKEND (48_) a bounded diagnostic reason histogram + SKU samples on the
// job state/public envelope; FRONTEND a PERSISTENT result panel that survives re-render and hides on a scope change.
// Diagnostic/observability ONLY — no recommendation math, Suggested Qty, order_qty, carton, schema, or router change.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var F48 = fs.readFileSync(path.join(GS, '48_api_v1_request_order_draft_job.gs'), 'utf8');
var RO = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');

// ==========================================================================
section('BACKEND 48_ — bounded reason histogram + SKU samples');
var B = (new Function(F48 + '\n return {' +
  ' reasonCode: reqDraftJobReasonCode_, foldReason: reqDraftJobFoldReason_,' +
  ' newState: reqDraftJobNewState_, publicState: reqDraftJobPublicState_, foldCount: reqDraftJobFoldCount_,' +
  ' MAXC: REQ_DRAFT_JOB_MAX_REASON_CODES_, MAXS: REQ_DRAFT_JOB_MAX_REASON_SAMPLES_ };'))();

ok(B.reasonCode({ status: 'CREATED', code: 'x' }) === '', 'success (CREATED) carries no diagnostic reason');
ok(B.reasonCode({ status: 'REUSED' }) === '' && B.reasonCode({ status: 'REGENERATED' }) === '', 'REUSED/REGENERATED carry no reason');
ok(B.reasonCode({ status: 'NOT_READY', code: 'UNITS_PER_CARTON_UNAVAILABLE' }) === 'UNITS_PER_CARTON_UNAVAILABLE', 'NOT_READY keeps its canonical code');
ok(B.reasonCode({ status: 'FAILED' }) === 'FAILED', 'missing code → falls back to status');
ok(B.reasonCode({ status: 'FAILED', code: '  a  b  ' }) === 'a b', 'code whitespace normalized');
ok(B.reasonCode({ status: 'FAILED', code: new Array(80).join('Z') }).length === 48, 'long code truncated to 48 chars (bounded)');

var st = B.newState('run1', { company: 'ResUS', country: 'US', marketplace: 'Amazon' }, ['S0', 'S1'], null, 't', 1, 'AUG', {});
eq(st.reasonCounts, {}, 'newState seeds empty reasonCounts');
eq(st.reasonSamples, {}, 'newState seeds empty reasonSamples');

// 99 identical NOT_READY outcomes → count 99, samples bounded to MAXS distinct SKUs
(function () {
  var s = B.newState('r', { company: 'ResUS', country: 'US', marketplace: 'Amazon' }, [], null, 't', 1, 'AUG', {});
  for (var i = 0; i < 99; i++) B.foldReason(s, { status: 'NOT_READY', code: 'UNITS_PER_CARTON_UNAVAILABLE', sku: 'CO-' + i });
  ok(s.reasonCounts.UNITS_PER_CARTON_UNAVAILABLE === 99, '99 folds → reasonCounts.UNITS_PER_CARTON_UNAVAILABLE === 99');
  ok(s.reasonSamples.UNITS_PER_CARTON_UNAVAILABLE.length === B.MAXS, 'reasonSamples bounded to MAXS (' + B.MAXS + ')');
  ok(s.reasonSamples.UNITS_PER_CARTON_UNAVAILABLE[0] === 'CO-0', 'first affected SKUs sampled deterministically');
})();

// distinct-code cap → overflow folds into OTHER (never unbounded keys)
(function () {
  var s = B.newState('r', { company: 'c', country: 'x', marketplace: 'y' }, [], null, 't', 1, 'AUG', {});
  for (var i = 0; i < B.MAXC + 6; i++) B.foldReason(s, { status: 'FAILED', code: 'CODE_' + i, sku: 'S' + i });
  var keys = Object.keys(s.reasonCounts);
  ok(keys.length <= B.MAXC + 1, 'distinct reason codes capped at MAXC(+OTHER) = ' + keys.length);
  ok(keys.indexOf('OTHER') !== -1, 'overflow folded into OTHER bucket');
})();

// success outcomes never add a reason bucket
(function () {
  var s = B.newState('r', { company: 'c', country: 'x', marketplace: 'y' }, [], null, 't', 1, 'AUG', {});
  B.foldReason(s, { status: 'CREATED', sku: 'S0' });
  eq(s.reasonCounts, {}, 'CREATED adds no reason bucket');
})();

// public envelope surfaces the distribution
(function () {
  var s = B.newState('r', { company: 'ResUS', country: 'US', marketplace: 'Amazon' }, ['S0'], null, 't', 1, 'AUG', {});
  B.foldReason(s, { status: 'NOT_READY', code: 'ORDER_PLANNING_GAP_NOT_READY', sku: 'S0' });
  var pub = B.publicState(s);
  ok(pub.reasonCounts && pub.reasonCounts.ORDER_PLANNING_GAP_NOT_READY === 1, 'publicState exposes reasonCounts');
  ok(pub.reasonSamples && pub.reasonSamples.ORDER_PLANNING_GAP_NOT_READY[0] === 'S0', 'publicState exposes reasonSamples');
})();

ok(/reqDraftJobFoldReason_\(s, outcome\);/.test(F48), '48_ commit step folds the reason per SKU');

// ==========================================================================
section('FRONTEND — persistent result panel state (no DOM in Node → render no-ops safely)');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); var e = src.indexOf('\n}\n', s); return src.slice(s, e + 2); }
var _roAiPlanResult = null, _testScope = null;
function _roCanonicalScope_() { return _testScope; }
// top-level eval so each function binds to module scope (eval inside a callback would scope them to the callback)
eval(extractFn(RO, '_roAiPlanScopeKey_'));
eval(extractFn(RO, '_roAiPlanNum_'));
eval(extractFn(RO, '_roAiPlanResultVisibleFor_'));
eval(extractFn(RO, '_roAiPlanResultEl_'));
eval(extractFn(RO, '_roRenderAiPlanResult_'));
eval(extractFn(RO, '_roClearAiPlanResult_'));
eval(extractFn(RO, '_roSetAiPlanResult_'));

ok(_roAiPlanScopeKey_({ company: 'ResUS', country: 'us', marketplace: 'Amazon' }) === 'RESUS||US||AMAZON', 'scopeKey normalizes case + joins');
ok(_roAiPlanScopeKey_(null) === '', 'null scope → empty key');

var scope = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var doneDisp = { action: 'DONE', done: 99, total: 99, counts: { created: 0, notReady: 99 }, reasonCounts: { UNITS_PER_CARTON_UNAVAILABLE: 99 }, reasonSamples: { UNITS_PER_CARTON_UNAVAILABLE: ['CO1100-R'] } };
_roSetAiPlanResult_('DONE', doneDisp, scope);
ok(_roAiPlanResult && _roAiPlanResult.counts.notReady === 99 && _roAiPlanResult.counts.created === 0, 'result stores canonical counts');
ok(_roAiPlanResult.reasonCounts.UNITS_PER_CARTON_UNAVAILABLE === 99, 'result stores reasonCounts');
ok(_roAiPlanResult.scopeKey === 'RESUS||US||AMAZON', 'result stamped with scopeKey');

// persists across re-render for the same scope; hidden on scope change
ok(_roAiPlanResultVisibleFor_(_roAiPlanResult, scope) === true, 'result VISIBLE for same scope (survives re-render)');
ok(_roAiPlanResultVisibleFor_(_roAiPlanResult, { company: 'KM', country: 'US', marketplace: 'Amazon' }) === false, 'result HIDDEN on scope change');
ok(_roAiPlanResultVisibleFor_(null, scope) === false, 'no result → nothing shown');

// new-run / dismiss clears
_roClearAiPlanResult_();
ok(_roAiPlanResult === null, 'clear removes the result (new run / dismiss / scope reset)');

// count scenarios stored truthfully (success = created+reused+regenerated)
function successOf(disp) { _roSetAiPlanResult_('DONE', disp, scope); var c = _roAiPlanResult.counts; return c.created + c.reused + c.regenerated; }
ok(successOf({ counts: { created: 99 }, total: 99 }) === 99, 'all-created → success 99');
ok(successOf({ counts: { notReady: 99 }, total: 99 }) === 0, 'all-not-ready → success 0 (not a success)');
ok(successOf({ counts: { failed: 99 }, total: 99 }) === 0, 'all-failed → success 0');
ok(successOf({ counts: { blockedConflict: 99 }, total: 99 }) === 0, 'all-conflict → success 0');
ok(successOf({ counts: { created: 40, notReady: 59 }, total: 99 }) === 40, 'partial → success 40');

// ==========================================================================
section('SOURCE — wiring + no math/qty/carton surface');
ok(/_roClearAiPlanResult_\(\);/.test(RO), 'new run clears the prior result (_roRunAiPlanJob_)');
ok(/_roSetAiPlanResult_\('DONE', disp, scope\)/.test(RO), 'DONE sets a persistent result');
ok(/_roSetAiPlanResult_\('FAILED', disp, scope\)/.test(RO) && /_roSetAiPlanResult_\('INCOMPLETE', disp, scope\)/.test(RO), 'FAILED + NONE/unknown also surface a truthful result (no silent idle)');
ok(/if \(typeof _roRenderAiPlanResult_ === 'function'\) _roRenderAiPlanResult_\(\);/.test(RO), '_roRenderAll re-renders the panel (persist across re-render / hide on scope change)');
ok(/window\._roClearAiPlanResult_ = _roClearAiPlanResult_;/.test(RO), 'dismiss handler exposed on window');
var panelSrc = extractFn(RO, '_roRenderAiPlanResult_') + extractFn(RO, '_roSetAiPlanResult_');
ok(!/suggested_qty|recommended_qty|calculateGap|units_per_carton\s*=/.test(panelSrc), 'panel touches no recommendation/qty/carton math');

// ==========================================================================
console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
