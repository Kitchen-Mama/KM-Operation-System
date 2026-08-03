// Kitchen Mama Operation System — Recommendation route-inventory audit (Phase 2C, Round 1H).
// Run: node assets/tests/supply-planning-route-inventory.test.js
// STATIC audit over the Apps Script router + handler source mirror. Classifies every Recommendation-related
// router action and FAILS if any FORBIDDEN_PUBLIC_WRITE remains (a recommendation-Draft header/line mutation
// route that neither acquires a ScriptLock nor delegates to a locked handler). Proves the Round 1H invariant:
// no production-reachable UNLOCKED recommendation-Draft mutation route exists.

'use strict';
var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var AS = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
function read(f) { return fs.readFileSync(path.join(AS, f), 'utf8'); }
var ROUTER = read('01_router.gs');
// concat every handler file so we can locate a handler body regardless of which file defines it
var HANDLERS = fs.readdirSync(AS).filter(function (f) { return /\.gs$/.test(f) && f !== '01_router.gs'; }).map(read).join('\n\n');

// action → handler name, parsed from the router
function routeMap() {
  var m = {}, re = /action === '([^']+)'\)\s*\{\s*return\s+(handle[A-Za-z0-9_]+)\(/g, x;
  while ((x = re.exec(ROUTER)) !== null) m[x[1]] = x[2];
  return m;
}
// extract a function body (from `function name(` up to the next top-level `function ` or EOF)
function bodyOf(name) {
  var i = HANDLERS.indexOf('function ' + name + '(');
  if (i === -1) return null;
  var rest = HANDLERS.slice(i + 1);
  var j = rest.indexOf('\nfunction ');
  return HANDLERS.slice(i, j === -1 ? undefined : i + 1 + j);
}
function acquiresLock(body) { return /LockService\.getScriptLock\s*\(/.test(body); }
function delegatesToLocked(body) { return /handleUpdateRecommendationDecisionLocked_\s*\(|handleGenerateRecommendationDraftLocked_\s*\(/.test(body); }

var MAP = routeMap();

// ==========================================================================
section('A. router parsed + recommendation actions present');
(function () {
  ['upsertRequestOrderAllocationDraft', 'upsertRequestOrderAllocationDraftLines', 'submitRequestOrderAllocationDrafts',
    'upsertShippingAllocationDraft', 'upsertShippingAllocationDraftLines', 'submitShippingAllocationDrafts',
    'generateRecommendationDraftLocked', 'updateRecommendationDecisionLocked', 'getRecommendationDraftToken'
  ].forEach(function (a) { ok(!!MAP[a], 'A: route present: ' + a); });
})();

section('B. classify every recommendation action; FAIL on FORBIDDEN_PUBLIC_WRITE');
(function () {
  // recommendation-DRAFT (allocation_draft header/line) mutation routes that MUST be lock-enforced
  var DRAFT_MUTATION = {
    upsertRequestOrderAllocationDraft: 1, upsertRequestOrderAllocationDraftLines: 1,
    upsertShippingAllocationDraft: 1, upsertShippingAllocationDraftLines: 1,
    generateRecommendationDraftLocked: 1, updateRecommendationDecisionLocked: 1
  };
  var SUBMIT = { submitRequestOrderAllocationDrafts: 1, submitShippingAllocationDrafts: 1 };
  var READ_ONLY = { getRecommendationDraftToken: 1 };
  var SEPARATE = { upsertRequestOrderSiteConfirmations: 1 };   // writes a DIFFERENT table (site confirmations)

  var inventory = {}, forbidden = [];
  Object.keys(MAP).forEach(function (action) {
    var handler = MAP[action], body = bodyOf(handler);
    var cls;
    if (READ_ONLY[action]) cls = 'READ_ONLY';
    else if (SUBMIT[action]) cls = 'EXPLICIT_SUBMIT_OR_HANDOFF';
    else if (DRAFT_MUTATION[action]) {
      if (!body) cls = 'FORBIDDEN_PUBLIC_WRITE';
      else if (acquiresLock(body) || delegatesToLocked(body)) cls = (action.indexOf('generate') === 0) ? 'LOCKED_GENERATION' : (action.indexOf('update') === 0 ? 'LOCKED_USER_EDIT' : 'LOCKED_USER_EDIT');
      else cls = 'FORBIDDEN_PUBLIC_WRITE';
    } else if (SEPARATE[action]) cls = 'INTERNAL_ONLY';
    else cls = 'OTHER';
    if (cls === 'FORBIDDEN_PUBLIC_WRITE') forbidden.push(action);
    if (DRAFT_MUTATION[action] || SUBMIT[action] || READ_ONLY[action] || SEPARATE[action]) inventory[action] = cls;
  });
  console.log('   route inventory: ' + JSON.stringify(inventory));
  eq(forbidden, [], 'B: NO FORBIDDEN_PUBLIC_WRITE recommendation-draft route exists');
  // every draft-mutation route classified LOCKED_*
  Object.keys(DRAFT_MUTATION).forEach(function (a) { ok(/^LOCKED_/.test(inventory[a] || ''), 'B: ' + a + ' is LOCKED (' + inventory[a] + ')'); });
})();

section('C. legacy line writers are now locked adapters (no raw unlocked Sheet write remains)');
(function () {
  var reqLines = bodyOf('handleUpsertRequestOrderAllocationDraftLines_');
  ok(delegatesToLocked(reqLines), 'C: 15_ lines route delegates to the locked user-edit command');
  ok(!/getDataRange\(\)\.getValues\(\)/.test(reqLines) && !/procurementAppendByHeader_/.test(reqLines), 'C: 15_ lines route contains NO direct Sheet read/append (retired unlocked body)');
  // header route is locked
  ok(acquiresLock(bodyOf('handleUpsertRequestOrderAllocationDraft_')), 'C: 15_ header route acquires ScriptLock');
  // shipping routes locked (deployment-gated scaffold, but lock+terminal enforced)
  ok(acquiresLock(bodyOf('handleUpsertShippingAllocationDraft_')), 'C: 16_ header route acquires ScriptLock');
  ok(acquiresLock(bodyOf('handleUpsertShippingAllocationDraftLines_')), 'C: 16_ lines route acquires ScriptLock');
})();

section('D. locked handlers terminal-guard + edit path token-checks');
(function () {
  var edit = bodyOf('handleUpdateRecommendationDecisionLocked_');
  ok(/KMUE\.runUserDecisionEdit/.test(edit), 'D: locked user-edit delegates to KMUE (lock+terminal+token)');
  ok(/rpoKeyedDeltaWrite_/.test(edit), 'D: locked user-edit uses keyed-delta write (not full-table)');
  var gen = bodyOf('handleGenerateRecommendationDraftLocked_');
  ok(/KMORCH\.runRecommendationGeneration/.test(gen), 'D: locked generation delegates to KMORCH');
  ok(/rpoKeyedDeltaWrite_/.test(gen), 'D: locked generation uses keyed-delta write');
  // header routes terminal-guard
  ok(/IMMUTABLE_TERMINAL_STATUS/.test(bodyOf('handleUpsertRequestOrderAllocationDraft_')), 'D: 15_ header terminal-guards');
  ok(/IMMUTABLE_TERMINAL_STATUS/.test(bodyOf('handleUpsertShippingAllocationDraftLines_')), 'D: 16_ lines terminal-guards');
})();

section('E. full-table writer not reachable from a locked production route');
(function () {
  // the only full-table setValues helper is 23_ rprWriteBack_; it must NOT be called by 24_/25_ locked routes
  var orch = read('24_recommendation_orchestrator.gs');
  var ue = read('25_recommendation_user_edit.gs');
  ok(!/rprWriteBack_\s*\(/.test(orch), 'E: 24_ locked route does NOT call the full-table writer');
  ok(!/rprWriteBack_\s*\(/.test(ue), 'E: 25_ locked route does NOT call the full-table writer');
  // rprWriteBack_ is only invoked from the unlocked source-mirror applyPersistencePlan (23_), which is NOT routed
  ok(MAP['applyPersistencePlan'] === undefined && MAP['applyPersistencePlanWithLock'] === undefined, 'E: raw repository writers are NOT routed');
})();

section('F. Submit routes remain visibly distinct (not folded into generation/edit)');
(function () {
  var sub = bodyOf('handleSubmitRequestOrderAllocationDrafts_');
  ok(sub && !delegatesToLocked(sub), 'F: submit route is a separate command (not routed through generation/edit)');
  ok(MAP['submitRequestOrderAllocationDrafts'] === 'handleSubmitRequestOrderAllocationDrafts_', 'F: submit action maps to its own handler');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1H Route Inventory assertions passed (' + pass + ' assertions).');
