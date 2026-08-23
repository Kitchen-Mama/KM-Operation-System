// F1-7N-FA-3C-DRAFT-MODEL-R6F2F1-INTERNAL-CONTROLLED-AUTHORITY — controlled JP generation while the GLOBAL flag stays
// false, via an internal capability that no public/frontend request can forge.
//   A  WeeklyAiPlanControlledAuthority_ mint/verify — unforgeable, scope-bound, one-shot.
//   B  weeklyAiPlanGenerateK2_ immediate backend gate: flag true OR valid internal capability; else UNAUTHORIZED.
//   C  public-path proof: no 6th arg from the handler; a capability in `body` cannot authorize; spoofed fields ignored.
// Loads the ACTUAL 61_api_v1_weekly_ai_plan.gs in a vm sandbox with minimal stubs to reach the gate.
// Run: node assets/tests/inventory-internal-controlled-authority-f1-7n-fa-3c-r6f2f1.test.js
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GS61 = read('specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var uuidN = 0;
function makeSb(flagReturn) {
  var sandbox = {
    Logger: { log: function () {} },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSheetByName: function () { return null; } }; }, openById: function () { return { getSheetByName: function () { return null; } }; } },
    Utilities: { getUuid: function () { return 'uuid-' + (++uuidN); } },
    // stubs for globals 61_ references but does not define (set before load; not overwritten by the .gs):
    KMWRB: { buildWeeklySourceLines: function () { return { ok: true, lines: [{ masterSku: 'A', marketplace: 'Amazon', sourceWarehouseId: 'WH1', recommendedQty: 10 }], skuCount: 1, unresolvedTotal: 0 }; } },
    KMWRR: { buildK2GenerationPlan: function () { return { groups: [], blocked: [], conservation: { conserved: true } }; } },
    jsonResponse_: function (o) { return { getContent: function () { return JSON.stringify(o); } }; },
    JSON: JSON, Math: Math, String: String, Number: Number, Array: Array, Object: Object, Date: Date, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp
  };
  if (flagReturn !== undefined) sandbox.inventoryAiPlanDbGenerationEnabled_ = function () { return flagReturn; };
  sandbox.global = sandbox; vm.createContext(sandbox);
  vm.runInContext(GS61, sandbox, { filename: '61_api_v1_weekly_ai_plan.gs' });
  return sandbox;
}
var JPreq = { planningCycle: 'RECO-2026-08', businessScope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon', source_page: 'inventory_replenishment' } };
var JPspec = { freeze_checksum: 'e626e368', scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon' }, planning_cycle: 'RECO-2026-08', gap_fingerprint: 'len28:GAP-…0001:h9fe21969', expected_header_ids: ['SADH-K2-7F15DD7D'], expected_line_ids: ['a', 'b', 'c', 'd', 'e'] };
var harvest = { warehousesById: {}, sourceDataAsOf: '2026-08-01' };
function gen(sb, req, cap) { var r = sb.weeklyAiPlanGenerateK2_(sb.SpreadsheetApp.getActiveSpreadsheet(), req, harvest, {}, {}, cap); try { return JSON.parse(r.getContent()); } catch (e) { return { parse_error: true }; } }
function errCode(resp) { return (resp && resp.errors && resp.errors[0]) ? resp.errors[0].code : null; }

// =====================================================================================================
section('A — WeeklyAiPlanControlledAuthority_ mint/verify: unforgeable, scope-bound, one-shot');
var sb = makeSb(false);
var AUTH = sb.WeeklyAiPlanControlledAuthority_;
var liveJP = { scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon' }, planning_cycle: 'RECO-2026-08' };
var cap = AUTH.mint(JPspec);
ok(cap && cap.__wap_controlled === true && cap.nonce, 'A1 mint returns a capability with an unguessable nonce');
eq(AUTH.verify(cap, liveJP).ok, true, 'A2 a minted capability verifies for its exact scope');
// one-shot: a second verify of the same capability fails (nonce consumed)
eq(AUTH.verify(cap, liveJP).reason, 'CAPABILITY_NOT_MINTED_IN_EXECUTION', 'A3 one-shot — a consumed capability cannot be replayed');
// hand-built capability (never minted) → not in the in-execution minted set
eq(AUTH.verify({ __wap_controlled: true, nonce: 'forged', spec: JPspec }, liveJP).reason, 'CAPABILITY_NOT_MINTED_IN_EXECUTION', 'A4 a hand-built capability is rejected (not minted in this execution)');
eq(AUTH.verify(null, liveJP).reason, 'NO_INTERNAL_CAPABILITY', 'A5 a missing capability is rejected');
eq(AUTH.verify({ foo: 1 }, liveJP).reason, 'NO_INTERNAL_CAPABILITY', 'A6 a non-capability object is rejected');
// tampered spec (scope changed after mint) → mismatch vs the stored scopeKey
var capT = AUTH.mint(JPspec); capT.spec = { scope: { company: 'ResTW', country: 'CA', marketplace: 'Amazon' }, planning_cycle: 'RECO-2026-08' };
eq(AUTH.verify(capT, liveJP).reason, 'CAPABILITY_TAMPERED', 'A7 a tampered capability spec is rejected');
// live scope different from the (untampered) minted scope → scope mismatch
var capS = AUTH.mint(JPspec);
eq(AUTH.verify(capS, { scope: { company: 'ResTW', country: 'CA', marketplace: 'Amazon' }, planning_cycle: 'RECO-2026-08' }).reason, 'CAPABILITY_SCOPE_MISMATCH', 'A8 a capability cannot authorize a different/widened scope');
// missing marketplace in the live scope → controlled runs must be marketplace-exact
var capM = AUTH.mint({ scope: { company: 'ResTW', country: 'JP', marketplace: '' }, planning_cycle: 'RECO-2026-08' });
eq(AUTH.verify(capM, { scope: { company: 'ResTW', country: 'JP', marketplace: '' }, planning_cycle: 'RECO-2026-08' }).reason, 'CONTROLLED_REQUIRES_EXACT_MARKETPLACE', 'A9 controlled authority requires an exact marketplace');

// =====================================================================================================
section('B — weeklyAiPlanGenerateK2_ immediate backend gate (flag true OR internal capability; else UNAUTHORIZED)');
// flag false + no capability → blocked
var sbF = makeSb(false);
eq(errCode(gen(sbF, JPreq, undefined)), 'CONTROLLED_GENERATION_UNAUTHORIZED', 'B1 flag false + no capability → CONTROLLED_GENERATION_UNAUTHORIZED');
// flag false + valid minted JP capability → gate PASSES (no UNAUTHORIZED; proceeds to generation)
var sbC = makeSb(false);
var okCap = sbC.WeeklyAiPlanControlledAuthority_.mint(JPspec);
ok(errCode(gen(sbC, JPreq, okCap)) !== 'CONTROLLED_GENERATION_UNAUTHORIZED', 'B2 flag false + valid internal capability → gate passes');
// flag false + capability placed in BODY (arrives as 5th arg, never as controlledAuth) → blocked
var sbB = makeSb(false);
var bodyCap = sbB.WeeklyAiPlanControlledAuthority_.mint(JPspec);
var rBody = JSON.parse(sbB.weeklyAiPlanGenerateK2_(sbB.SpreadsheetApp.getActiveSpreadsheet(), JPreq, harvest, {}, bodyCap /* body, NOT controlledAuth */).getContent());
eq(errCode(rBody), 'CONTROLLED_GENERATION_UNAUTHORIZED', 'B3 a capability smuggled in body cannot authorize (it is the 5th arg, not the 6th)');
// flag true + no capability → normal production; gate passes
var sbT = makeSb(true);
ok(errCode(gen(sbT, JPreq, undefined)) !== 'CONTROLLED_GENERATION_UNAUTHORIZED', 'B4 flag true → normal production, gate passes without a capability');
// flag false + a capability minted for the WRONG scope (CA) but requesting JP → blocked (scope mismatch)
var sbW = makeSb(false);
var caCap = sbW.WeeklyAiPlanControlledAuthority_.mint({ scope: { company: 'ResTW', country: 'CA', marketplace: 'Amazon' }, planning_cycle: 'RECO-2026-08' });
eq(errCode(gen(sbW, JPreq, caCap)), 'CONTROLLED_GENERATION_UNAUTHORIZED', 'B5 a CA capability cannot authorize a JP request (scope-bound)');

// =====================================================================================================
section('C — public-path security proof (source contracts)');
// the public handler gates the flag BEFORE reaching generateK2, and calls it with FIVE args (no controlledAuth)
ok(/INVENTORY_AI_PLAN_DB_GENERATION_DISABLED/.test(GS61) && /if \(!genEnabled\)/.test(GS61), 'C1 the public handler blocks flag-false requests before generation (INVENTORY_AI_PLAN_DB_GENERATION_DISABLED)');
ok(/return weeklyAiPlanGenerateK2_\(ss, mapped\.request, h, deps, body\);/.test(GS61), 'C2 the public handler call site passes 5 args (no controlledAuth) — a client cannot inject the 6th');
// the gate authorizes ONLY from controlledAuth + verify(); it never reads actor/mode/body/checksum for authorization
var gateBlock = GS61.slice(GS61.indexOf('IMMEDIATE BACKEND GATE'), GS61.indexOf('var groupsWritten'));
ok(/WeeklyAiPlanControlledAuthority_\.verify\(controlledAuth, liveScopeSpec\)/.test(gateBlock), 'C3 the gate authorizes ONLY from the controlledAuth capability via verify()');
ok(!/body\.|actor|freeze_checksum|token/i.test(gateBlock), 'C4 the gate never treats actor/mode/body/checksum/token as authorization');
ok(/liveScopeSpec = \{ scope: \{ company: scope0\.company, country: scope0\.country, marketplace: requestedMkt \}/.test(gateBlock), 'C5 the gate re-derives the live scope from the ACTUAL request (no widening)');
// the capability is minted ONLY inside the internal executor path (TEMP), never in 61_'s public handler
ok(/WeeklyAiPlanControlledAuthority_\.mint\(/.test(TEMP) && !/WeeklyAiPlanControlledAuthority_\.mint\(/.test(GS61.slice(GS61.indexOf('function handleGenerateWeeklyAiPlanDraft_'), GS61.indexOf('function weeklyAiPlanGenerateK2_'))), 'C6 mint() is called only by the internal executor (TEMP), never by the public handler');
// minted-set is closure-private (declared inside the IIFE), not a global
ok(/var WeeklyAiPlanControlledAuthority_ = \(function \(\) \{\s*var minted = \{\}/.test(GS61), 'C7 the minted-nonce set is closure-private (empty for any public request execution)');

console.log('\n----------------------------------------');
console.log('R6F2F1 INTERNAL CONTROLLED AUTHORITY: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
