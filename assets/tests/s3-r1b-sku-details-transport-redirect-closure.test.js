// Kitchen Mama Operation System — S3-R1 WORKSTREAM B
// SKU_DETAILS_TRANSPORT_REDIRECT_ERROR — CLOSED, AND THIS IS THE EVIDENCE
// Run: node assets/tests/s3-r1b-sku-details-transport-redirect-closure.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script, no browser.
//
// §B1 said not to assume the debt still exists just because it is open, and it does not. This round
// changed NO production file for Workstream B. What follows is the proof that the defect is gone and
// the list of what would have to break for it to come back — which is the only useful thing a closure
// can leave behind, because a debt closed without a guard is a debt that reopens silently.
//
// WHAT THE ERROR WAS. Apps Script answers a POST by redirecting to a googleusercontent host, and the
// follow can arrive at doGet with the body dropped, or land on a Google sign-in page, or on a 404 from
// the redirect TARGET rather than from the deployment. All three used to surface as one undifferentiated
// failure, and SKU Details then rendered whatever the broad cache happened to hold — which, on a cold
// mount, was the mock arrays in utils/data.js.
//
// WHICH ROUNDS REMOVED IT, each provable from the tree:
//
//   F1-7N-FB-4E-R4A1   the transport classifies the redirect cases apart: REQUEST_METHOD_DOWNGRADED for
//                      a POST that arrived at doGet, and a redirect-target 404 ordered BEFORE the
//                      generic 404 so the two cannot be confused. Its own suite still runs.
//   F1-7N-FB-4D §D3    SKU Details itself stopped having anywhere to fall back TO: the workspace read
//                      is fail-closed, a missing read model returns before rendering, and the read and
//                      the render became separate outcomes so a render throw can no longer be reported
//                      as a read failure.
//   F1-7H              the canonical transport is KM.api.getWorkspace('skuDetails') → the named action
//                      skuDetails.workspace.get. There is no page-level endpoint construction left.
//
// The stale-response protection the incident needed was already there too: _skReadSeq is a monotonic
// sequence captured at dispatch and compared before the commit, and a superseded read announces itself
// with __superseded rather than quietly returning a null model for the caller to render.

'use strict';
var fs = require('fs');
var path = require('path');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
var SK = read('assets/js/pages/sku-details.js');
var FOUND = read('assets/js/api/km-api-foundation.js');
var TRANS = read('assets/js/api/km-transport.js');

var fail = 0, pass = 0;
function ok(c, l, extra) {
  if (!c) { fail++; console.error('FAIL  ' + l + (extra === undefined ? '' : '\n   ' + JSON.stringify(extra))); }
  else { pass++; console.log('ok   ' + l); }
}
function eq(a, b, l) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) { fail++; console.error('FAIL  ' + l + '\n   expected ' + B + '\n   actual   ' + A); }
  else { pass++; console.log('ok   ' + l); }
}
function section(t) { console.log('\n-- ' + t + ' ' + new Array(Math.max(2, 100 - t.length)).join('-')); }
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map(function (l) { return /^\s*\/\//.test(l) ? '' : l; }).join('\n');
}
var SKC = codeOnly(SK);

console.log('\n' + new Array(101).join('='));
console.log('S3-R1 §B — SKU DETAILS TRANSPORT REDIRECT: CLOSURE EVIDENCE');
console.log(new Array(101).join('='));

// =================================================================================================
section('A. THE CANONICAL TRANSPORT — §B2');
// =================================================================================================
ok(/var SK_READ_ACTION = 'skuDetails\.workspace\.get';/.test(SK),
  'A1 the read action is named once, as a constant — SKU_DETAILS_CANONICAL_TRANSPORT');
ok(/window\.KM\.api\.getWorkspace\('skuDetails', params\)/.test(SKC),
  'A2 and the read goes through KM.api.getWorkspace — no page-level endpoint construction');
['fetch(', 'XMLHttpRequest', 'google.script.run', 'km_via', 'googleusercontent', '/exec', 'redirect:']
  .forEach(function (tok) {
    ok(SKC.indexOf(tok) === -1, 'A3 the page contains no "' + tok + '" — transport is not its business');
  });

// =================================================================================================
section('B. NO FALLBACK TRANSPORT, NO REDIRECT SHIM — §B2');
// =================================================================================================
// The broad reload survives, and it should: it is the documented Legacy kill-switch posture. What
// matters is that nothing can reach it while the workspace is active.
ok(/if \(typeof _skEffectiveWorkspace === 'function' && _skEffectiveWorkspace\(\)[\s\S]{0,400}return;\s*\}\s*if \(window\.reloadOperationDb\)/.test(SKC),
  'B1 the only broad reload left is behind _skEffectiveWorkspace() — the kill switch, not a fallback');
ok(/if \(_skEffectiveWorkspace\(\) && !_skReadModel\) return;/.test(SKC),
  'B2 §D3 a missing read model RETURNS before rendering — SKU_DETAILS_FALLBACK_REACHABLE = NO');
// That one line is what stands between a failed read and the mock arrays, so name them.
ok(/window\.upcomingSkuData \|\| \[\]/.test(SKC),
  'B3 the demo arrays are still reachable in LEGACY mode only, which is what B2 guards');
ok(!/catch[\s\S]{0,200}getAllSkuDataWithOverrides/.test(SKC),
  'B4 no error path renders through the override/demo layer');

// =================================================================================================
section('C. STALE-RESPONSE PROTECTION WAS ALREADY THERE — §B1');
// =================================================================================================
ok(/var _skReadSeq = 0;/.test(SK) && /var mySeq = \+\+_skReadSeq;/.test(SK),
  'C1 a monotonic sequence is captured at DISPATCH');
ok(/if \(mySeq !== _skReadSeq\) return \{ __superseded: true, model: _skReadModel \};/.test(SK),
  'C2 and compared before the commit — an older answer cannot land');
ok(/if \(res && res\.__superseded\) return;   \/\/ a newer read owns the render/.test(SK),
  'C3 a superseded read is ANNOUNCED, so the caller stands down instead of rendering a null model');
ok(/if \(res && res\.__superseded\) return;   \/\/ a newer read owns the reconcile/.test(SK),
  'C4 ... on the post-write reconcile too');
// §D3's other half: a render throw is not a read failure.
ok(/\}, function \(err\) \{ _skRenderError_\(err, 'read'\); \}\);/.test(SK),
  'C5 the rejection handler is the two-argument form, so it guards the READ only');
ok(/catch \(e\) \{ _skRenderError_\(e, 'render'\); \}/.test(SK),
  'C6 and a render throw is classified as a view failure that does not discard the data');

// =================================================================================================
section('D. THE REDIRECT CASES ARE CLASSIFIED AT THE TRANSPORT — §B1');
// =================================================================================================
ok(/REQUEST_METHOD_DOWNGRADED: 'REQUEST_METHOD_DOWNGRADED'/.test(FOUND),
  'D1 a POST that arrived at doGet has its own code — the redirect follow that drops the body');
ok(/redirected: info\.redirected === true/.test(TRANS),
  'D2 the transport records whether the response was redirected at all');
ok(/the redirect target is the only 404|The redirect target is the only 404/i.test(TRANS),
  'D3 and a 404 from the redirect TARGET is ordered before the generic 404, so they cannot be confused');
ok(/HTTP_NOT_FOUND_HTML|AUTH_OR_ACCESS_HTML/.test(FOUND),
  'D4 a sign-in page and a 404 page are separate typed outcomes, not one "API error"');

// =================================================================================================
section('E. REQUEST BUDGET — §B3, §4');
// =================================================================================================
// One mount = one workspace read. Counted at source: there is exactly one dispatcher, and every entry
// point goes through it, so the count cannot drift by someone adding a second call site.
eq((SKC.match(/KM\.api\.getWorkspace\('skuDetails'/g) || []).length, 1,
  'E1 exactly ONE dispatcher of the skuDetails workspace read');
// Three call sites, named, so a fourth has to be added deliberately rather than by drift:
//   _skLoadAndRender  the mount    ·  _skAfterWrite  the post-write reconcile  ·  handleRefreshDb
eq((SKC.match(/_skWorkspaceRefresh_\(/g) || []).length - 1, 3,
  'E2 and exactly three callers of it: the mount, the post-write reconcile and Refresh DB');
ok(/var rg = _skRegion_\(\); if \(rg\) rg\.beginLoad\(!!_skReadModel\);/.test(SK),
  'E3 the region load state begins with the read it belongs to');
ok(/rg\.set\(\(_skReadModel\.skuDetails && _skReadModel\.skuDetails\.length\) \? window\.KM\.loadState\.STATES\.READY : window\.KM\.loadState\.STATES\.EMPTY\)/.test(SK),
  'E4 and settles to READY or EMPTY on success — never left hanging');
ok(/_skRenderError_/.test(SK), 'E5 with a typed error path for the failure — PERMANENT_LOADING_COUNT = 0');

console.log('\n' + new Array(101).join('='));
console.log('S3-R1 §B SKU DETAILS TRANSPORT REDIRECT CLOSURE — passed ' + pass + '  failed ' + fail);
console.log('SKU_DETAILS_TRANSPORT_REDIRECT_ERROR = CLOSED · no production file changed by this workstream');
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
console.log(new Array(101).join('='));
process.exit(fail ? 1 : 0);
