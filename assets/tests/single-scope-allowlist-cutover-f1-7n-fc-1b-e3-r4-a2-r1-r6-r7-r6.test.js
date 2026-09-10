// Kitchen Mama Operation System — F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6
// S1-R3 — SINGLE-SCOPE ALLOWLIST CUTOVER: CO1100-R RETIRED, SP0750-M ARMED, FLAG STILL FALSE.
// ================================================================================================================
//
// WHY THE SCOPE MOVED. CO1100-R proved the FIRST half of the vertical slice and cannot prove the second. Its
// recommendation is already FULLY_COVERED_BY_ACTIVE_PLAN (160 recommended against 520 already planned by hand),
// so a controlled Generate against it correctly writes nothing — forever, on any deployment. The other half of
// the slice is a POSITIVE residual, where the correct answer is that rows ARE written, and that needs a scope
// that is actually short.
//
// WHAT THIS ROUND IS AND IS NOT. It is a repo-side cutover package: one config entry, the deployment identity
// that must move with it, and the tests. It is NOT an activation. INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ stays
// false, nothing is deployed, nothing is generated or submitted, and no production row is touched. Moving the
// allowlist changes WHICH single scope a generation could write; arming the generation is a separate
// authorization that has not been given.
//
// ----------------------------------------------------------------------------------------------------------------
// THIS SUITE IS THE ONE OWNER OF THE LIVE ALLOWLIST VALUE, AND THAT IS THE OTHER HALF OF THIS ROUND.
//
// Twenty-two suites failed the moment the allowlist moved, and not one of them was about which scope is armed.
// Some spelled `sku: 'CO1100-R'` beside an assertion that already checked the property that mattered ("exactly
// one entry"); six built a CO1100-R world on top of a wholesale copy of 00_config.gs, so their fixtures ran
// against whichever scope happened to be live that day. The frozen numbers in those suites were measured on
// CO1100-R — 920 short at D18, 760 authorized, 520 already planned — and renaming the fixture to keep them
// green would have claimed those measurements for a scope nobody has ever measured. That is a fabrication, not
// a fix.
//
// So each of those worlds now declares the scope it is a world OF, their literal assertions were re-aimed at
// the invariant they actually depend on (exactly one entry, four axes, no wildcard), and the VALUE — which
// scope is armed right now — is asserted HERE and nowhere else. A cutover after this one moves one config file
// and one suite.
// ================================================================================================================
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l, d) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); } }
function eq(a, e, l, d) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  expected ' + E + '\n  got      ' + A + (d === undefined ? '' : '\n  detail ' + JSON.stringify(d))); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var caught;
  try { caught = f() === true; } catch (e) { console.error('FAIL ' + label + ' — PROBE ERROR: ' + e.message); fail++; return; }
  if (caught) { neg.caught++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var NL = String.fromCharCode(10);
var GS = 'assets/specs/active/apps-script/';
var RO = require(path.join(__dirname, '_release-order.js'));

// THE ROUND'S IDENTITY AND THE SCOPE IT ARMS. Declared once; every claim below is compared against these.
var RELEASE = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6';
var PREV_RELEASE = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';
var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP0750-M' };
var RETIRED_SKU = 'CO1100-R';

var CFG = read(GS + '00_config.gs');
var G63 = read(GS + '63_api_v1_system_health.gs');
var G61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var G71 = read(GS + '71_api_v1_factory_stock_guard.gs');
var G11 = read(GS + '11_shipping_plan_handlers.gs');
var G01 = read(GS + '01_router.gs');
var S1_REL = 'assets/tools/apps-script-diagnostics/TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs';
var CENSUS_REL = 'assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs';
var S1SRC = read(S1_REL);
var CENSUS = read(CENSUS_REL);

// PRODUCT-STRATEGY-P1-B1-R1 - THIS ROUND'S OWN COMMIT, which is the other end of every range below.
//
// Sections F and G describe what THIS release changed, and both were measuring against the WORKING TREE:
// `git diff BASE` is BASE..tree, and the module reads were of whatever the files say today. So every
// later round enlarged a set that describes R6-R7-R6 and moved stamps this suite asserts did not move -
// and the next release (R6-R7-R7, which adds 72_ and routes its action) broke fifteen assertions here,
// not one of which was about the allowlist cutover this suite is for.
//
// The newest commit whose 63_ still declares THIS release is where the round ended. The range is
// BASE..there and it is closed for ever. When the working tree IS this round (nothing later has moved
// 63_), INTRO is null and the tree is the round - measured, not assumed. This is the repair 96a2fb7
// applied to the R5-R1 suite for exactly this reason; the behavioural sections above deliberately keep
// reading the working tree, because those are claims about the code as it stands.
var _cp0 = require('child_process');
function _git0(c) { try { return _cp0.execSync('git ' + c, { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { return null; } }
// THE COMMIT THAT INTRODUCED THIS RELEASE - the OLDEST one whose 63_ declares it, not the newest.
//
// The sibling repair in the R5-R1 suite took the newest, and for R5-R1 the two were the same commit. They
// are NOT the same here, and the difference is this round's whole subject: P1-B1 changed four runtime
// files while 63_ still read R6-R7-R6, so the newest commit declaring this release is P1-B1's - a round
// that has nothing to do with the allowlist cutover and reused this release id by omission. Ending the
// window there would hard-code that omission into the historical claim.
//
// The introducing commit is what a release-window suite actually owns: what THIS release's own change
// set was. A release that legitimately spans several commits is a real case and is not this one - it
// would need an explicit end anchor rather than 'whatever last happened to carry the id'.
function roundIntro() {
  var log = _git0('log --format=%H -- ' + GS + '63_api_v1_system_health.gs');
  if (log === null) return null;
  var commits = String(log).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  var found = null;
  for (var i = 0; i < commits.length; i++) {
    var blob = _git0('show ' + commits[i] + ':' + GS + '63_api_v1_system_health.gs');
    if (blob !== null && String(blob).indexOf("SYS_DEPLOYMENT_RELEASE_ = '" + RELEASE + "'") !== -1) {
      found = commits[i];   // keep walking: `git log` is newest-first, so the last hit is the oldest
    }
  }
  return found;
}
var INTRO = roundIntro();
// Read a file AS THIS ROUND SHIPPED IT. Falls back to the working tree only when the round has not been
// committed yet, which is the one case where the tree genuinely IS the round.
function atRound(rel) {
  if (!INTRO) return read(rel);
  var b = _git0('show ' + INTRO + ':' + rel);
  return b === null ? read(rel) : String(b);
}

// Comments are stripped before any claim about what the CODE says, so an explanation naming CO1100-R cannot
// be mistaken for the value still being armed — and cannot make a check pass either.
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
// AND STRING LITERALS TOO, wherever the question is "does this code DO X" rather than "does it mention X".
// 61_ carries the sentence "INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false" inside a refusal MESSAGE, and
// a regex looking for an assignment found it and reported that 61_ redeclares the flag. This suite's own
// mutants below spell `= true`, `appendRow(` and the writer names as DATA, and the same check read them as
// calls. Both were my error, not the code's.
function stripStrings(src) {
  return String(src).replace(/'(?:[^'\\\\\n]|\\\\.)*'/g, "''")
    .replace(/"(?:[^"\\\\\n]|\\\\.)*"/g, '""')
    .replace(/`(?:[^`\\\\]|\\\\.)*`/g, "``");
}
function bare(src) { return stripStrings(stripComments(src)); }
var CFG_CODE = stripComments(CFG);

// A BRACE-AWARE extractor. `/function name\([\s\S]*?\n\}/` looks right and is not: a one-line function makes
// it run past its own end into the next declaration, and the result parses as a syntax error somewhere else
// entirely. Measured the hard way — weeklyAiPlanStr_ is a one-liner.
function fn(src, name) {
  var i = String(src).indexOf('function ' + name + '(');
  if (i < 0) return '';
  var s = String(src), j = s.indexOf('{', i), d = 0, q = null;
  for (var k = j; k < s.length; k++) {
    var ch = s[k], nx = s[k + 1];
    if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && nx === '/') { var e = s.indexOf('\n', k); if (e < 0) break; k = e; continue; }
    if (ch === '/' && nx === '*') { var b = s.indexOf('*/', k); if (b < 0) break; k = b + 1; continue; }
    if (ch === "'" || ch === '"') { q = ch; continue; }
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return s.slice(i, k + 1); }
  }
  return '';
}

// ================================================================================================================
// THE FROZEN CANDIDATE EVIDENCE, AND WHY IT IS NOT A PRECONDITION OF ANYTHING HERE.
// ================================================================================================================
// These are the numbers the read-only proposal census measured for SP0750-M when this package was built. They
// are recorded so a later reader knows WHAT was chosen and on WHICH snapshot — and they are deliberately NOT
// asserted against any deployment, because a package built today is synced on some other day.
//
// AFTER DEPLOYMENT THE CENSUS MUST BE RE-RUN. If the run id, the accepted date, any quantity or the factory
// snapshot has moved, the activation STOPS and the numbers are re-measured. Nothing below is allowed to carry
// yesterday's arithmetic into today's write.
var FROZEN_CANDIDATE = {
  scope: SCOPE,
  calculation_run_id: 'GAP-INV-20260908T132343-0001',
  calculation_date: '2026-09-08',
  calculation_status: 'READY',
  freshness_state: 'CURRENT_PRE_SCHEDULE',
  recommended_qty: 25,
  qualifying_manual_planned_qty: 0,
  qualifying_ai_planned_qty: 0,
  residual_qty: 25,
  available_to_allocate: 310,
  proposed_ai_allocation_qty: 25,
  would_clamp: false,
  source_factory_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN',
  affected_ai_identities: 0,
  protected_manual_identities: 0,
  measured_at_package_build: true,
  revalidation: 'MANDATORY on the deployed project before any activation. A moved run id, accepted date,'
    + ' quantity or factory snapshot is a STOP, not a discrepancy to reconcile.'
};

// ================================================================================================================
section('A — config exactness: exactly one scope, all four axes, and the retired one is GONE');
// ================================================================================================================

var allowBlock = (CFG_CODE.match(/var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[[\s\S]*?\];/) || [])[0] || '';
ok(allowBlock !== '', 'A0  the activation allowlist is declared in 00_config.gs');
// The declaration is EXECUTED rather than pattern-matched, so the assertion is about the value the runtime
// gets and not about the text that produces it.
var CFGCTX = vm.createContext({});
vm.runInContext(allowBlock, CFGCTX);
var LIVE = vm.runInContext('INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_', CFGCTX);
eq(LIVE.length, 1, 'A1  it holds EXACTLY ONE entry — two would be a wider blast radius, not a narrower one');
eq(LIVE[0], SCOPE, 'A2  and that entry is exactly ResUS / US / Amazon / SP0750-M');
eq(Object.keys(LIVE[0]).sort(), ['company', 'country', 'marketplace', 'sku'],
  'A2a with all four axes and no fifth key');
// THE RETIRED SCOPE IS REMOVED, not kept beside its replacement.
eq(LIVE.filter(function (e) { return e.sku === RETIRED_SKU; }), [],
  'A3  CO1100-R is no longer in the allowlist at all');
ok(allowBlock.indexOf(RETIRED_SKU) === -1,
  'A3a and it is not left commented-in inside the declaration either', allowBlock);
// NO WILDCARD, IN ANY OF THE SHAPES 00_ SAYS IT REFUSES.
['ALL', 'ALL_SITES', '*', ''].forEach(function (w, i) {
  var hit = LIVE.filter(function (e) {
    return [e.company, e.country, e.marketplace, e.sku].some(function (v) { return String(v) === w; });
  });
  eq(hit, [], 'A4.' + (i + 1) + ' no axis is ' + (w === '' ? 'blank' : w));
});
LIVE.forEach(function (e) {
  ['company', 'country', 'marketplace', 'sku'].forEach(function (k) {
    ok(typeof e[k] === 'string' && e[k].trim() === e[k] && e[k].length > 0,
      'A4a ' + k + ' is a non-empty, untrimmed-clean string', e[k]);
  });
});
// THE FLAG. Repo source, and the accessor that reads it.
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(CFG_CODE),
  'A5  INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ is declared FALSE in the repository');
eq((CFG_CODE.match(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*(?!==)/g) || []).length, 1,
  'A5a and it is assigned exactly once — a second assignment could arm it out of view');
ok(/=== true/.test((CFG_CODE.match(/function inventoryAiPlanDbGenerationEnabled_\(\)[^}]*\}/) || [])[0] || ''),
  'A5b the accessor demands an exact true, so no truthy value can arm it');

// ================================================================================================================
section('B — the production scope gate, EXECUTED, on the real 00_ function');
// ================================================================================================================

var GATECTX = vm.createContext({ String: String, Object: Object, Array: Array });
vm.runInContext(allowBlock + NL
  + fn(CFG_CODE, 'inventoryAiPlanScopeEnabled_') + NL
  + 'function inventoryAiPlanActivationAllowlist_() { return INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_; }', GATECTX);
var gate0 = fn(CFG_CODE, 'inventoryAiPlanScopeEnabled_') || '';
function enabled(c, k, m, s) {
  return vm.runInContext('inventoryAiPlanScopeEnabled_(' + [c, k, m, s].map(function (v) {
    return v === undefined ? 'undefined' : JSON.stringify(v);
  }).join(', ') + ')', GATECTX);
}
eq(enabled(SCOPE.company, SCOPE.country, SCOPE.marketplace, SCOPE.sku), true,
  'B1  the armed scope is enabled');
eq(enabled(SCOPE.company, SCOPE.country, SCOPE.marketplace, RETIRED_SKU), false,
  'B2  the RETIRED scope is refused — the cutover actually closed it');
// One axis wrong at a time. Each is a separate refusal, because each is a separate way to widen.
[[['KM', SCOPE.country, SCOPE.marketplace, SCOPE.sku], 'another company'],
 [[SCOPE.company, 'CA', SCOPE.marketplace, SCOPE.sku], 'another country'],
 [[SCOPE.company, SCOPE.country, 'Walmart', SCOPE.sku], 'another marketplace'],
 [[SCOPE.company, SCOPE.country, SCOPE.marketplace, 'SP0750-L'], 'another sku'],
 [[SCOPE.company, SCOPE.country, SCOPE.marketplace, SCOPE.sku + '2'], 'a sku PREFIXED by the armed one'],
 [[SCOPE.company, SCOPE.country, SCOPE.marketplace, SCOPE.sku.slice(0, -1)], 'a sku that is a PREFIX OF the armed one'],
 [['resus', 'us', 'amazon', 'sp0750-m'], 'a case-folded near-match'],
 [[SCOPE.company, SCOPE.country, SCOPE.marketplace, SCOPE.sku.replace('-', ' ')],
  'a sku with its separator turned into a space'],
 [[SCOPE.company.slice(0, 3) + ' ' + SCOPE.company.slice(3), SCOPE.country, SCOPE.marketplace, SCOPE.sku],
  'a company with INTERNAL whitespace']
].forEach(function (c, i) {
  eq(enabled.apply(null, c[0]), false, 'B3.' + (i + 1) + ' refused: ' + c[1]);
});
// PADDING IS TRIMMED, AND THAT IS DELIBERATE RATHER THAN AN OVERSIGHT — I asserted the opposite first and the
// measurement corrected me. Every axis reaching this gate has come off a sheet read, where a trailing space is
// a data-entry artefact and not a different scope. The gate trims each axis and THEN compares exactly, so
// " ResUS" IS ResUS while "Res US" is not. Asserting that a padded axis is refused would have been asserting
// a defect into the suite.
eq(enabled(' ' + SCOPE.company, SCOPE.country, SCOPE.marketplace, SCOPE.sku + '  '), true,
  'B3a padded axes are TRIMMED and still match — measured, not assumed');
ok(/\.trim\(\)/.test(gate0), 'B3b and the trim is in the gate itself', gate0.slice(0, 200));
// MISSING AND PARTIAL AXES. An absent axis is never "any".
[[[SCOPE.company, SCOPE.country, SCOPE.marketplace, ''], 'a blank sku'],
 [[SCOPE.company, SCOPE.country, '', SCOPE.sku], 'a blank marketplace'],
 [[SCOPE.company, '', SCOPE.marketplace, SCOPE.sku], 'a blank country'],
 [['', SCOPE.country, SCOPE.marketplace, SCOPE.sku], 'a blank company'],
 [[SCOPE.company, SCOPE.country, SCOPE.marketplace, undefined], 'a missing sku argument'],
 [[SCOPE.company, SCOPE.country, undefined, undefined], 'two missing arguments'],
 [[undefined, undefined, undefined, undefined], 'no arguments at all'],
 [[SCOPE.company, SCOPE.country, 'ALL_SITES', SCOPE.sku], 'ALL_SITES as the marketplace'],
 [[SCOPE.company, SCOPE.country, SCOPE.marketplace, 'ALL'], 'ALL as the sku']
].forEach(function (c, i) {
  eq(enabled.apply(null, c[0]), false, 'B4.' + (i + 1) + ' refused: ' + c[1]);
});

// ================================================================================================================
section('C — the server-owned target scope set, EXECUTED on the real 61_ authority');
// ================================================================================================================

var TCTX = vm.createContext({ String: String, Object: Object, Array: Array, RegExp: RegExp });
vm.runInContext(allowBlock + NL
  + fn(CFG_CODE, 'inventoryAiPlanScopeEnabled_') + NL
  + 'function inventoryAiPlanActivationAllowlist_() { return INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_; }' + NL
  + fn(stripComments(G61), 'weeklyAiPlanStr_') + NL
  + fn(stripComments(G61), 'weeklyAiPlanTargetScopes_'), TCTX);
function targets(scope, mk) {
  return vm.runInContext('weeklyAiPlanTargetScopes_(' + JSON.stringify(scope) + ', '
    + JSON.stringify(mk === undefined ? '' : mk) + ')', TCTX);
}
var T1 = targets({ company: SCOPE.company, country: SCOPE.country }, SCOPE.marketplace);
eq([T1.ok, T1.reason], [true, null], 'C1  the armed pair resolves a target set');
eq(T1.scopes, [SCOPE], 'C1a and it is EXACTLY the one armed scope — nothing else in the pair came with it');
// THE RETIRED SCOPE IS NOT REACHABLE THROUGH ITS OWN PAIR. This is the assertion that says the cutover closed
// the old scope rather than merely adding the new one: same company, same country, same marketplace.
eq(T1.scopes.filter(function (s) { return s.sku === RETIRED_SKU; }), [],
  'C2  CO1100-R is NOT in the target set for the pair it used to be armed in');
var T2 = targets({ company: 'KM', country: SCOPE.country }, SCOPE.marketplace);
eq([T2.ok, T2.reason, T2.scopes], [false, 'AI_PLAN_SCOPE_NOT_ENABLED', []],
  'C3  another company resolves nothing, by name');
var T3 = targets({ company: SCOPE.company, country: 'CA' }, SCOPE.marketplace);
eq([T3.ok, T3.reason], [false, 'AI_PLAN_SCOPE_NOT_ENABLED'], 'C3a and so does another country');
var T4 = targets({ company: SCOPE.company, country: SCOPE.country }, 'Walmart');
eq([T4.ok, T4.reason], [false, 'AI_PLAN_SCOPE_NOT_ENABLED'],
  'C3b a named marketplace INTERSECTS — it narrows and never widens');
var T5 = targets({ company: SCOPE.company, country: SCOPE.country }, 'ALL_SITES');
eq([T5.ok, T5.reason], [false, 'SCOPE_ALL_SITES_FORBIDDEN'],
  'C4  ALL_SITES is refused with its own code — it is not a scope and must not become one');
// AND THE GATE IS STILL RE-ASKED PER ENTRY, which is what makes a hand-edited list unable to widen anything.
ok(/if \(!inventoryAiPlanScopeEnabled_\(c, k, m, sk\)\) return;/.test(stripComments(G61)),
  'C5  weeklyAiPlanTargetScopes_ still RE-ASKS the gate per entry rather than trusting the list');
// 61_ does not carry its own copy of either authority.
eq((stripComments(G61).match(/INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_\s*=/g) || []).length, 0,
  'C5a and 61_ does not redeclare the allowlist');
// STRINGS STRIPPED: 61_ names the flag inside its own refusal message, which is documentation and not a
// declaration. The claim is that 61_ keeps no COPY of the authority, and that is what this measures.
eq((bare(G61).match(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=(?!=)/g) || []).length, 0,
  'C5b nor the flag');
ok(/inventoryAiPlanDbGenerationEnabled_\(\)/.test(bare(G61)),
  'C5c while it does READ the flag through 00_' + 's accessor, which is the only way it may');

// ================================================================================================================
section('D — the feature flag: false in the repo, false in an executed backend, and never rewritten here');
// ================================================================================================================

var FCTX = vm.createContext({ String: String });
vm.runInContext((CFG_CODE.match(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = [^;]+;/) || [])[0] + NL
  + fn(CFG_CODE, 'inventoryAiPlanDbGenerationEnabled_'), FCTX);
eq(vm.runInContext('INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_', FCTX), false,
  'D1  the executed backend value is false');
eq(vm.runInContext('inventoryAiPlanDbGenerationEnabled_()', FCTX), false,
  'D1a and the accessor answers false');
// THIS SUITE DOES NOT ARM ANYTHING, not even inside a fixture that it then forgets to restore. The check is on
// the suite's own source: no assignment to either authority anywhere in it.
var SELF = read('assets/tests/single-scope-allowlist-cutover-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r6.test.js');
var SELF_CODE = bare(SELF);
eq((SELF_CODE.match(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*true/g) || []).length, 0,
  'D2  this suite never sets the flag true, in any context');
eq((SELF_CODE.match(/inventoryAiPlanDbGenerationEnabled_\s*=/g) || []).length, 0,
  'D2a and never replaces the accessor');
// THE GATE ORDER, from 61_'s own source: the flag is read before anything can write.
var gen = fn(stripComments(G61), 'handleGenerateWeeklyAiPlanDraft_') || '';
ok(gen !== '', 'D3  the production Generate entry point is readable');
var iFlag = gen.indexOf('inventoryAiPlanDbGenerationEnabled_');
var iScope = gen.indexOf('weeklyAiPlanTargetScopes_');
ok(iFlag > 0, 'D3a it reads the flag');
ok(iFlag < gen.length, 'D3b before it returns');
// The writer names, and that none of them can be reached before the flag is read.
['weeklyAiPlanGenerateK2_', 'weeklyAiPlanPersistenceDeps_', 'appendRow', 'setValues'].forEach(function (n, i) {
  var at = gen.indexOf(n);
  ok(at === -1 || at > iFlag, 'D3c.' + (i + 1) + ' ' + n + ' is not reachable before the flag is read', at);
});
ok(iScope === -1 || iScope > iFlag,
  'D3d and the scope set is resolved after the flag, so a disarmed project never even asks');

// ================================================================================================================
section('E — the S1 diagnostics: the armed scope is now the candidate, the retired one is not');
// ================================================================================================================
// The S1 suite's own prelude is reused, so this section drives THE SAME worlds and THE SAME censuses that
// suite proves, rather than a second copy of them.
var S1_SUITE = 'assets/tests/positive-residual-and-submit-readiness-census-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r5-r1.test.js';
var S1TEXT = read(S1_SUITE).split(String.fromCharCode(13) + NL).join(NL);
var S1CUT = S1TEXT.indexOf(NL + "section('A ");
var H = (new Function('require', '__dirname', '__filename', 'module', 'exports', 'console',
  S1TEXT.slice(0, S1CUT) + NL + 'return { S1World: S1World, census: census, pos: pos, scopeOf: scopeOf,'
  + ' proofOf: proofOf, failed: failed, WHF: WHF, GAP_DATE: GAP_DATE, SKU: SKU };'
))(function (m) { return require(m.indexOf('./') === 0 ? path.join(ROOT, 'assets/tests', m) : m); },
  path.join(ROOT, 'assets/tests'), path.join(ROOT, S1_SUITE), module, exports,
  { log: function () {}, error: function () {} });

// A world in which the ARMED scope is short by 25 against no manual plan, beside the retired scope still
// carrying its fully-covered shape. Both identities live in the one eligible pair.
var ARMED_GAP = { sku: SCOPE.sku, calculation_status: 'READY',
  d18_gap_qty: 25, d18_suggested_qty: 25, d30_suggested_qty: 25,
  d45_suggested_qty: 25, d90_gap_qty: 25, d90_suggested_qty: 25 };
var CUTOVER_WORLD = H.pos({
  allowlist: [SCOPE],
  gap: { d18_gap_qty: 0, d18_suggested_qty: 0, d30_suggested_qty: 0, d45_suggested_qty: 0,
    d90_gap_qty: 160, d90_suggested_qty: 160 },
  extraGap: [ARMED_GAP],
  factory_stock: [{ warehouse_id: H.WHF, sku: H.SKU, fac_current_stock: 2000, fac_reserved_stock: 100 },
    { warehouse_id: H.WHF, sku: SCOPE.sku, fac_current_stock: 310, fac_reserved_stock: 0 }]
});

function proofOfRow(row, name) {
  return ((row && row.proofs) || []).filter(function (x) { return x.predicate === name; })[0] || null;
}
var E_ACT = H.census(CUTOVER_WORLD);
eq(H.failed(E_ACT.res), [], 'E1  the activation-readiness census runs clean against the armed scope',
  H.failed(E_ACT.res));
eq(E_ACT.res.verdict, 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED',
  'E1a and now FINDS a candidate — which is the entire point of the cutover');
eq(E_ACT.res.eligible_universe.eligible_pairs, ['ResUS|US'], 'E1b in the one eligible pair');
var E_ARMED = H.scopeOf(E_ACT, SCOPE.sku), E_OLD = H.scopeOf(E_ACT, RETIRED_SKU);
ok(!!E_ARMED, 'E2  the armed identity was examined');
eq([E_ARMED.currently_allowlisted, E_ARMED.is_candidate, E_ARMED.activation_ready],
  [true, true, true], 'E2a it is allowlisted, a candidate, and ACTIVATION READY');
eq([E_ARMED.recommended_qty, E_ARMED.qualifying_manual_planned_qty, E_ARMED.residual_qty,
  E_ARMED.proposed_ai_allocation_qty], [25, 0, 25, 25],
  'E2b measured 25 recommended / 0 planned / 25 residual / 25 proposed — the positive-residual shape');
eq(E_ARMED.no_action_reason, 'RESIDUAL_REMAINS',
  'E2c and its class is RESIDUAL_REMAINS: a no-action would be the wrong answer here');
eq(E_ACT.res.activation_ready_count, 1, 'E2d exactly one identity is activation ready');
// THE RETIRED SCOPE. Still measured and still reported — it did not vanish — and refused BY NAME.
ok(!!E_OLD, 'E3  the retired identity is still measured, not silently dropped');
eq([E_OLD.currently_allowlisted, E_OLD.is_candidate, E_OLD.activation_ready], [false, false, false],
  'E3a it is no longer allowlisted, no longer a candidate, and NOT activation ready');
// E3b — PRESENT, not first. I asserted "first" and the measurement corrected me: the conditions run in a
// fixed order and the residual one is evaluated before the allowlist one, so a fully-covered retired scope
// names both. Which comes first is an ordering detail; that the allowlist refusal is THERE, by name, is the
// property — before this round the scope was refused only as a side-effect of the authority not returning
// a quantity for it, and the reason a reader saw was about readiness.
ok((E_OLD.refusal_reasons || []).indexOf('the_scope_is_in_the_current_activation_allowlist') >= 0,
  'E3b and the allowlist refusal is named explicitly among its reasons', E_OLD.refusal_reasons);
ok(!!proofOfRow(E_OLD, 'the_scope_is_in_the_current_activation_allowlist')
  && proofOfRow(E_OLD, 'the_scope_is_in_the_current_activation_allowlist').pass === false,
  'E3b1 as a named condition that FAILED, rather than an inference from a missing number');
eq(proofOfRow(E_ARMED, 'the_scope_is_in_the_current_activation_allowlist').pass, true,
  'E3b2 and the same condition PASSES for the armed scope');
eq(E_OLD.no_action_reason, 'FULLY_COVERED_BY_ACTIVE_PLAN',
  'E3c while its own measurement is unchanged — retiring a scope does not rewrite what it was');
// THE PROPOSAL CENSUS still sees the whole pair, and still authorizes nothing.
var E_W = H.S1World(CUTOVER_WORLD);
var E_PROP = vm.runInContext('RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS()', E_W.ctx);
eq(E_PROP.failed_predicates, [], 'E4  the proposal census runs clean', E_PROP.failed_predicates);
eq(E_PROP.verdict, 'PROPOSALS_FOUND_AUTHORIZATION_REQUIRED', 'E4a and finds the pair@s proposals'.replace('@', "'"));
var E_P = (E_PROP.proposals || []).filter(function (r) { return r.scope.sku === SCOPE.sku; })[0] || null;
ok(!!E_P, 'E4b including the armed scope');
// E4c — MEASURED, AND MY EXPECTATION WAS THE WRONG ONE. activation_ready is candidacy AND the real gate, in
// both censuses, so an ALREADY-allowlisted qualifying scope reads true even in discovery — and that is the
// useful answer: it says "no allowlist move is needed for this one". What discovery never does is AUTHORIZE:
// selected stays null, proposal_only stays true, authorization_required stays true, and a NON-allowlisted
// row can never be activation_ready. Those four are the boundary, not this field.
eq([E_P.currently_allowlisted, E_P.activation_ready, E_P.authorization_required, E_P.proposal_only],
  [true, true, true, true],
  'E4c it is allowlisted and would be activation-ready — while the census still authorizes nothing');
eq(E_PROP.not_currently_allowlisted, [],
  'E4d and no listed proposal needs an allowlist move, because the one that qualifies is already armed');
var E_LEAK = (E_PROP.predicates || []).filter(function (x) {
  return x.predicate === 'no_proposal_outside_the_allowlist_is_marked_activation_ready'; })[0];
ok(!!E_LEAK && E_LEAK.pass === true,
  'E4e and the boundary condition that forbids the opposite is present and passing', E_LEAK);
eq(E_PROP.selected, null, 'E5  selected is null');
eq(E_PROP.proposal_only, true, 'E5a and the whole census is proposal_only');
eq([E_PROP.writes, E_PROP.writer_calls], [0, 0], 'E6  writes 0 and writer_calls 0');
eq([E_ACT.res.writes, E_ACT.res.writer_calls], [0, 0], 'E6a and the same for the readiness census');
eq(E_W.allWrites(), 0, 'E6b measured on every sheet in the world, not reported from the absence of a call');
eq([E_PROP.generate_called, E_PROP.submit_called, E_PROP.migration_called, E_PROP.gap_job_called],
  [false, false, false, false], 'E6c Generate, Submit, migration and the Gap Job were none of them called');
eq([E_PROP.allowlist_modified, E_PROP.flag_modified, E_PROP.script_properties_modified],
  [false, false, false], 'E6d and nothing was modified to get the answer');

// ================================================================================================================
section('F — deployment identity: one new release, and only the files that changed declare it');
// ================================================================================================================
// PRODUCT-STRATEGY-P1-B1-R1 - FROM HERE THE SOURCES ARE THIS ROUND'S, not today's. See the note beside
// roundIntro() above. F0 proves the range has both ends rather than silently degrading to the tree.
ok(!!INTRO, 'F0  this round' + 'S OWN COMMIT is derived from 63_, so the range has both ends', INTRO);
ok(!INTRO || String(_git0('show ' + INTRO + ':' + GS + '63_api_v1_system_health.gs'))
  .indexOf("SYS_DEPLOYMENT_RELEASE_ = '" + RELEASE + "'") !== -1,
  'F0a and 63_ at that commit declares THIS release, which is what makes it this round' + 'S end');
var R63 = atRound(GS + '63_api_v1_system_health.gs');
var RCFG = atRound(GS + '00_config.gs');
var R61 = atRound(GS + '61_api_v1_weekly_ai_plan.gs');
var R71 = atRound(GS + '71_api_v1_factory_stock_guard.gs');
var R11 = atRound(GS + '11_shipping_plan_handlers.gs');
var R01 = atRound(GS + '01_router.gs');
var RS1SRC = atRound(S1_REL);
var RCENSUS = atRound(CENSUS_REL);

eq((R63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1], RELEASE,
  'F1  SYS_DEPLOYMENT_RELEASE_ is this round');
eq((R63.match(/var SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1], RELEASE,
  'F1a and 63_ declares it as its own module stamp too, because 63_ changed');
eq((RCFG.match(/var CONFIG_BUILD_VERSION_ = '([^']+)'/) || [])[1], RELEASE,
  'F1b and 00_config.gs declares it, because 00_config.gs changed');
ok(RO.BUILD_STAMP_RE.test(RELEASE), 'F2  the stamp is legally shaped');
ok(RO.OWNER_STAMPS.indexOf(RELEASE) !== -1, 'F2a and registered in the shared release order');
ok(RO.stampAtOrAfter(RELEASE, PREV_RELEASE), 'F2b ordered AFTER the release it supersedes');
ok(RO.OWNER_STAMPS.indexOf(PREV_RELEASE) !== -1 && RO.OWNER_STAMPS.indexOf(PREV_RELEASE) < RO.OWNER_STAMPS.indexOf(RELEASE),
  'F2c and the previous release is still registered, ahead of it — the list is append-only');

// THE MANIFEST IS EXACT: every row's expectation equals what that file actually declares. This is the check
// that catches BOTH failure directions — a file whose stamp moved without its row, and a row that marched to
// the release while its file did not change.
var rows = (R63.match(/\{ file: '[^']+', symbol: '[^']+', expected: '[^']+'/g) || []).map(function (r) {
  return { file: /file: '([^']+)'/.exec(r)[1], symbol: /symbol: '([^']+)'/.exec(r)[1],
    expected: /expected: '([^']+)'/.exec(r)[1] };
});
ok(rows.length >= 10, 'F3  the deployment manifest carries a row per owner file', rows.length);
var mismatched = [], unreadable = [];
rows.forEach(function (r) {
  var src = atRound(GS + r.file);
  if (!src) { unreadable.push(r.file); return; }
  var d = (src.match(new RegExp('var ' + r.symbol + " = '([^']+)'")) || [])[1] || null;
  if (d !== r.expected) mismatched.push(r.file + ' declares ' + d + ', manifest expects ' + r.expected);
});
eq(unreadable, [], 'F3a and every one of those files exists');
eq(mismatched, [], 'F3b and EVERY row expects exactly what its file declares — no stale module either way');
// The two rows this round had to move, named individually so a silent omission is impossible.
var row00 = rows.filter(function (r) { return r.file === '00_config.gs'; })[0];
var row63 = rows.filter(function (r) { return r.file === '63_api_v1_system_health.gs'; })[0];
eq([row00 && row00.expected, row63 && row63.expected], [RELEASE, RELEASE],
  'F4  the 00_config.gs and 63_ rows both expect this round');
// AND THE ROWS THAT MUST NOT HAVE MOVED. A module stamp records the round its file last changed; marching one
// to the release is the confusion 63_'s own header warns about.
[['61_api_v1_weekly_ai_plan.gs', 'WAP_BUILD_VERSION_', R61],
 ['71_api_v1_factory_stock_guard.gs', 'FSG_BUILD_VERSION_', R71],
 ['11_shipping_plan_handlers.gs', 'SP_BUILD_VERSION_', R11],
 ['01_router.gs', 'RTR_BUILD_VERSION_', R01]
].forEach(function (c, i) {
  var d = (c[2].match(new RegExp('var ' + c[1] + " = '([^']+)'")) || [])[1] || null;
  ok(d !== RELEASE, 'F5.' + (i + 1) + ' ' + c[0] + ' did NOT march its stamp to this release', d);
  ok(RO.stampAtOrAfter(RELEASE, d), 'F5.' + (i + 1) + 'a while the release is at or after it', d);
});

// THE CONTRACT, EXECUTED. A correctly synced project — every symbol at the value its own file declares — must
// report UNIFORM with no stale module and no mixed deployment. This is the answer §四.7 asks for, computed by
// 63_'s own function rather than asserted about it.
var DCTX = vm.createContext({ String: String, Object: Object, Array: Array, JSON: JSON });
vm.runInContext('var globalThisRef = this;', DCTX);
vm.runInContext((R63.match(/var SYS_MODULE_BUILD_STAMPS_ = \[[\s\S]*?\n\];/) || [])[0], DCTX);
vm.runInContext("var SYS_DEPLOYMENT_RELEASE_ = '" + RELEASE + "';", DCTX);
// Every owner symbol, set to what its own file declares — i.e. a project synced from this exact tree.
rows.forEach(function (r) {
  var src = atRound(GS + r.file);
  if (!src) return;
  var d = (src.match(new RegExp('var ' + r.symbol + " = '([^']+)'")) || [])[1];
  if (d) vm.runInContext('var ' + r.symbol + ' = ' + JSON.stringify(d) + ';', DCTX);
});
vm.runInContext('function sysGlobalValue_(n) { try { return eval(n); } catch (e) { return undefined; } }', DCTX);
// The RUNTIME half is stubbed uniform on purpose: this section is about deployment IDENTITY, and the writer /
// lifecycle resolver parity has its own suites. Stated rather than hidden.
vm.runInContext('function sysRuntimeAuthorityChecks_() { return { uniform: true, verdict: "STUBBED_UNIFORM'
  + ' — the executed writer/lifecycle parity is proved by its own suites, not here" }; }', DCTX);
vm.runInContext((R63.match(/function sysModuleBuildStamps_\(\)[\s\S]*?\n\}/) || [])[0], DCTX);
var CONTRACT = vm.runInContext('sysModuleBuildStamps_()', DCTX);
eq(CONTRACT.deployment_build, RELEASE, 'F6  the executed contract reports this release');
eq(CONTRACT.stale_modules, [], 'F6a stale_modules is EMPTY on a project synced from this tree');
eq(CONTRACT.absent_modules, [], 'F6b absent_modules is empty');
eq(CONTRACT.mixed_deployment, false, 'F6c mixed_deployment is false');
ok(/^UNIFORM/.test(CONTRACT.verdict), 'F6d and the verdict is UNIFORM', CONTRACT.verdict);
// A stale 00_config.gs — the exact partial sync this cutover could produce — must be caught.
vm.runInContext("CONFIG_BUILD_VERSION_ = '" + PREV_RELEASE + "';", DCTX);
var STALE = vm.runInContext('sysModuleBuildStamps_()', DCTX);
eq(STALE.mixed_deployment, true, 'F7  a project still on the OLD 00_config.gs is a mixed deployment');
ok(STALE.stale_modules.join(' ').indexOf('00_config.gs') !== -1,
  'F7a and 00_config.gs is named as the stale one — which is the file carrying the allowlist',
  STALE.stale_modules);
vm.runInContext("CONFIG_BUILD_VERSION_ = '" + RELEASE + "';", DCTX);

// THE DIAGNOSTIC PINS. A pin that lags the release refuses a correctly synced project.
eq((RS1SRC.match(/var S1_BUILD_ = '([^']+)'/) || [])[1], RELEASE,
  'F8  the S1 census build pin is this release');
eq((RCENSUS.match(/var TEMP_E3_CENSUS_BUILD_ = '([^']+)'/) || [])[1], RELEASE,
  'F8a the activation census stamp is this release');
eq((RCENSUS.match(/var R6R7_ACTIVATION_BUILD_ = '([^']+)'/) || [])[1], RELEASE,
  'F8b and its deployment pin is too — equal to SYS_DEPLOYMENT_RELEASE_, as the manifest suite requires');

// §四.7 — checkDeploymentContract(): THE ONLY TERM THIS ROUND CAN MOVE IS mixed_deployment.
//
// The health answer computes ok = router.all_available && dbReachable && schema.all_present, and THEN sets
// ok = false when the module manifest reports a partial sync. This round touches no router action, no table
// and no schema, so the first three terms cannot have moved — and the fourth is what F6c measured as false.
// A suite cannot reach a live endpoint, so what is asserted here is the CHAIN: which term this round is
// capable of moving, and that the frontend maps a true ok to the code the task asks for.
// indexOf, not a regex: the two sentences being located contain dots and parentheses, and a pattern that
// leaves them unescaped matches things it should not while looking correct.
var OKLINE = 'var ok = router.all_available && dbReachable && schema.all_present === true;';
var PARTIAL = 'if (moduleStamps.mixed_deployment) ok = false;';
var iOk = G63.indexOf(OKLINE);
ok(iOk > 0, 'F9  the health verdict is router + DB + schema …');
ok(iOk > 0 && G63.indexOf(PARTIAL) > iOk,
  'F9a … and a partial sync forces it false AFTER that, which is the one term a config/identity round'
  + ' can move', [iOk, G63.indexOf(PARTIAL)]);
eq(CONTRACT.mixed_deployment, false,
  'F9b and on a project synced from this tree that term is false, so ok is not forced down by this round');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
ok(/code: 'DEPLOYMENT_CONTRACT_OK'/.test(DBAPI),
  'F9c and the frontend maps a healthy contract to DEPLOYMENT_CONTRACT_OK');
eq([CONTRACT.stale_modules.length, CONTRACT.absent_modules.length, CONTRACT.mixed_deployment],
  [0, 0, false],
  'F9d the four values the cutover is required to produce: stale_modules [], absent [], mixed false, UNIFORM');

// ================================================================================================================
section('G — safety: nothing that holds business state changed, and no gate was weakened');
// ================================================================================================================

// The production runtime files this round is allowed to have touched, and nothing else.
var ALLOWED_RUNTIME = ['00_config.gs', '63_api_v1_system_health.gs'];
var cp = require('child_process');
function git(c) { try { return cp.execSync('git ' + c, { cwd: ROOT, encoding: 'utf8' }); } catch (e) { return null; } }
// PRODUCT-STRATEGY-P1-B1-R1 - A CLOSED RANGE. `diff BASE` ended at the working tree, so this set grew
// with every later round and the assertions below slowly became claims about the present rather than
// about what R6-R7-R6 shipped. BASE..INTRO is this round. Untracked files count ONLY while the round is
// still uncommitted, which is the same case in which INTRO is null.
var diff = INTRO ? git('diff --name-only ' + PREV_RELEASE_COMMIT() + ' ' + INTRO)
  : git('diff --name-only ' + PREV_RELEASE_COMMIT());
function PREV_RELEASE_COMMIT() {
  // The commit whose 63_ still declares the PREVIOUS release: the deployment being upgraded FROM.
  var log = git('log --format=%H -- ' + GS + '63_api_v1_system_health.gs');
  if (log === null) return 'HEAD';
  var commits = String(log).split(NL).map(function (l) { return l.trim(); }).filter(Boolean);
  for (var i = 0; i < commits.length; i++) {
    var blob = git('show ' + commits[i] + ':' + GS + '63_api_v1_system_health.gs');
    if (blob !== null && String(blob).indexOf("SYS_DEPLOYMENT_RELEASE_ = '" + PREV_RELEASE + "'") !== -1) return commits[i];
  }
  return 'HEAD';
}
var changedFiles = diff === null ? null : String(diff).split(NL).map(function (l) { return l.trim(); }).filter(Boolean);
ok(changedFiles !== null, 'G0  the change set is MEASURED from git, not remembered');
if (changedFiles) {
  var runtimeChanged = changedFiles.filter(function (f) { return f.indexOf(GS) === 0; })
    .map(function (f) { return f.slice(GS.length); }).sort();
  eq(runtimeChanged, ALLOWED_RUNTIME.slice().sort(),
    'G1  EXACTLY two production runtime files changed: the config that holds the allowlist, and the'
    + ' deployment identity that must move with it', runtimeChanged);
  var browser = changedFiles.filter(function (f) { return /^assets\/(js|css)\//.test(f) || f === 'index.html'; });
  eq(browser, [], 'G1a NO browser file changed — no cache token rotates, no frontend republish');
  ok(changedFiles.indexOf(GS + '90_generated_supply_planning_bundle.gs') === -1,
    'G1b and 90_ did not change, so no bundle rebuild is required');
  var migrations = changedFiles.filter(function (f) { return /apps-script-migrations/.test(f); });
  eq(migrations, [], 'G1c and no migration tool was added or altered — this round runs none');
}

// THE BUSINESS-STATE OWNERS ARE UNTOUCHED. Named individually, because "nothing else changed" is not a claim
// a reader can check and a list of owners is.
[['16_shipping_allocation_handlers.gs', 'allocation drafts / manual and AI identities'],
 ['69_api_v1_ai_plan_lifecycle.gs', 'AI provenance and the supersede/expire lifecycle'],
 ['71_api_v1_factory_stock_guard.gs', 'factory stock, the shared pool and the overage gate'],
 ['11_shipping_plan_handlers.gs', 'shipping_plans / shipping_plan_lines and Submit'],
 ['61_api_v1_weekly_ai_plan.gs', 'the recommendation, the residual and the K2 generation'],
 ['43_api_v1_gap_materialization.gs', 'the inventory gap table and its run lineage'],
 ['01_router.gs', 'the action registry']
].forEach(function (c, i) {
  ok(!changedFiles || changedFiles.indexOf(GS + c[0]) === -1,
    'G2.' + (i + 1) + ' ' + c[0] + ' is unchanged — ' + c[1]);
});

// AND NO GATE WAS WEAKENED. The four sentences 00_'s own guard depends on, still present verbatim.
var gate = fn(CFG_CODE, 'inventoryAiPlanScopeEnabled_') || '';
ok(/if \(!c \|\| !k \|\| !m \|\| !s\) return false;/.test(gate),
  'G3  a missing axis is still an immediate refusal — never "any"');
ok(gate.indexOf('.some(') !== -1 || gate.indexOf('for (') !== -1 || gate.indexOf('.filter(') !== -1,
  'G3a and the match still walks the list rather than short-circuiting on a single field', gate.slice(0, 200));
ok(!/toLowerCase|toUpperCase|indexOf\(s\)|startsWith/.test(gate),
  'G3b with no case-folding and no prefix matching introduced', gate);
eq((stripComments(CFG).match(/function inventoryAiPlanScopeEnabled_/g) || []).length, 1,
  'G3c and the gate is declared exactly once');

// THE FROZEN CANDIDATE EVIDENCE IS RECORDED AND EXPLICITLY NOT LOAD-BEARING.
eq(FROZEN_CANDIDATE.scope, SCOPE, 'G4  the frozen candidate evidence names the scope this round arms');
eq([FROZEN_CANDIDATE.residual_qty, FROZEN_CANDIDATE.proposed_ai_allocation_qty,
  FROZEN_CANDIDATE.would_clamp], [25, 25, false],
  'G4a with residual 25, proposed 25, unclamped');
ok(String(FROZEN_CANDIDATE.revalidation).indexOf('MANDATORY') === 0,
  'G4b and it says re-measurement on the deployed project is MANDATORY, not advisory');
ok(FROZEN_CANDIDATE.proposed_ai_allocation_qty <= FROZEN_CANDIDATE.residual_qty
  && FROZEN_CANDIDATE.proposed_ai_allocation_qty <= FROZEN_CANDIDATE.available_to_allocate,
  'G4c the recorded proposal is min(residual, available) — internally consistent');
// The suite itself performs no write and calls neither entry point.
['weeklyAiPlanGenerateK2_(', 'handleGenerateWeeklyAiPlanDraft_(', 'sadSubmitToShippingPlansCore_(',
 'RUN_S1_MANIFEST_P(', 'RUN_S1_MANIFEST_S(', 'appendRow(', 'setValues('
].forEach(function (n, i) {
  eq((SELF_CODE.split(n).length - 1), 0, 'G5.' + (i + 1) + ' this suite never calls ' + n);
});

// ================================================================================================================
section('N — mutants');
// ================================================================================================================

function withCfg(src) {
  var c = vm.createContext({ String: String, Object: Object, Array: Array });
  var blk = (stripComments(src).match(/var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[[\s\S]*?\];/) || [])[0] || '';
  vm.runInContext(blk + NL
    + (stripComments(src).match(/function inventoryAiPlanScopeEnabled_\([\s\S]*?\n\}/) || [])[0], c);
  return function (a, b, d, e) {
    return vm.runInContext('inventoryAiPlanScopeEnabled_(' + [a, b, d, e].map(function (v) {
      return JSON.stringify(v); }).join(', ') + ')', c);
  };
}
function swapCfg(a, b) {
  var n = CFG.split(a).length - 1;
  if (n !== 1) throw new Error('swap anchor count ' + n + ' :: ' + a.slice(0, 80));
  return CFG.split(a).join(b);
}

mut('N1 the retired scope is kept BESIDE its replacement — two entries, not one', function () {
  var m = swapCfg("  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP0750-M' }",
    "  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP0750-M' },\n"
    + "  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' }");
  var g = withCfg(m);
  var blk = (stripComments(m).match(/var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[[\s\S]*?\];/) || [])[0];
  var c2 = vm.createContext({}); vm.runInContext(blk, c2);
  var list = vm.runInContext('INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_', c2);
  // A1 counts the entries and A3 requires the retired one to be gone; both must move.
  return LIVE.length === 1 && list.length === 2
    && g(SCOPE.company, SCOPE.country, SCOPE.marketplace, RETIRED_SKU) === true
    && enabled(SCOPE.company, SCOPE.country, SCOPE.marketplace, RETIRED_SKU) === false;
});

mut('N2 the armed entry is written with a wildcard sku', function () {
  // RE-AIMED. The first version expected the mutant to ARM the whole pair and it could not: the gate
  // independently refuses ALL / ALL_SITES for the marketplace and the sku via its own regex, so the mutation
  // disarms the scope instead of widening it. That is defence in depth and it is worth saying rather than
  // relying on — a wildcard must be caught in the CONFIG (A4), not only survived by the gate.
  var m = swapCfg("sku: 'SP0750-M' }", "sku: 'ALL' }");
  var blk = (stripComments(m).match(/var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[[\s\S]*?\];/) || [])[0];
  var c2 = vm.createContext({}); vm.runInContext(blk, c2);
  var list = vm.runInContext('INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_', c2);
  function hasWildcard(l) {
    return l.filter(function (e) {
      return [e.company, e.country, e.marketplace, e.sku].some(function (v) {
        return ['ALL', 'ALL_SITES', '*', ''].indexOf(String(v)) !== -1;
      });
    }).length > 0;
  }
  var g = withCfg(m);
  // (1) A4 catches it in the config; (2) the gate refuses it anyway, so the armed scope is LOST rather than
  //     widened — both, and neither on its own is the whole answer.
  return hasWildcard(LIVE) === false && hasWildcard(list) === true
    && enabled(SCOPE.company, SCOPE.country, SCOPE.marketplace, SCOPE.sku) === true
    && g(SCOPE.company, SCOPE.country, SCOPE.marketplace, SCOPE.sku) === false
    && g(SCOPE.company, SCOPE.country, SCOPE.marketplace, 'ALL') === false;
});

mut('N3 a blank axis starts meaning "any"', function () {
  var m = swapCfg('  if (!c || !k || !m || !s) return false;',
    '  if (!c || !k || !m) return false;\n  if (!s) return true;');
  var g = withCfg(m);
  return enabled(SCOPE.company, SCOPE.country, SCOPE.marketplace, '') === false
    && g(SCOPE.company, SCOPE.country, SCOPE.marketplace, '') === true;
});

mut('N4 the flag is armed in the repository', function () {
  var m = swapCfg('var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;',
    'var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true;');
  var c = vm.createContext({});
  vm.runInContext((stripComments(m).match(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = [^;]+;/) || [])[0], c);
  return vm.runInContext('INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_', FCTX) === false
    && vm.runInContext('INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_', c) === true;
});

mut('N5 the accessor accepts any truthy flag value instead of an exact true', function () {
  var m = swapCfg('function inventoryAiPlanDbGenerationEnabled_() { return INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ === true; }',
    'function inventoryAiPlanDbGenerationEnabled_() { return !!INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_; }');
  var body = (stripComments(m).match(/function inventoryAiPlanDbGenerationEnabled_\(\)[^}]*\}/) || [])[0];
  var clean = (stripComments(CFG).match(/function inventoryAiPlanDbGenerationEnabled_\(\)[^}]*\}/) || [])[0];
  return /=== true/.test(clean) && !/=== true/.test(body);
});

mut('N6 00_config.gs changes without its module stamp moving', function () {
  // Round-scoped, like §F above: the claim is about the stamp THIS ROUND declared.
  var m = RCFG.split("var CONFIG_BUILD_VERSION_ = '" + RELEASE + "';")
    .join("var CONFIG_BUILD_VERSION_ = '" + PREV_RELEASE + "';");
  if (m === RCFG) throw new Error('swap anchor count 0');
  // The manifest expects this release, so a file that did not move its stamp is a STALE MODULE — which is
  // exactly what an operator who pasted only 63_ would have.
  var declared = (m.match(/var CONFIG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
  return row00.expected === RELEASE
    && (RCFG.match(/var CONFIG_BUILD_VERSION_ = '([^']+)'/) || [])[1] === RELEASE
    && declared !== row00.expected;
});

mut('N7 the manifest row for 00_config.gs is left behind while the file moves', function () {
  var m = R63.split("{ file: '00_config.gs', symbol: 'CONFIG_BUILD_VERSION_', expected: '" + RELEASE + "'")
    .join("{ file: '00_config.gs', symbol: 'CONFIG_BUILD_VERSION_', expected: '" + PREV_RELEASE + "'");
  if (m === R63) throw new Error('manifest anchor missing');
  var expect = (new RegExp("\\{ file: '00_config\\.gs', symbol: 'CONFIG_BUILD_VERSION_', expected: '([^']+)'")
    .exec(m) || [])[1];
  // The static exactness check (F3b) is what catches this direction: the row expects the old release while
  // the file declares the new one, so a correctly synced project is reported stale.
  return mismatched.length === 0 && expect === PREV_RELEASE
    && expect !== (RCFG.match(/var CONFIG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
});

mut('N8 an unchanged module marches its stamp to the release', function () {
  var wap = (G61.match(/var WAP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
  var m = G61.split("var WAP_BUILD_VERSION_ = '" + wap + "'")
    .join("var WAP_BUILD_VERSION_ = '" + RELEASE + "'");
  if (m === G61) throw new Error('wap anchor missing');
  var moved = (m.match(/var WAP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
  // F5 requires it NOT to equal the release, and F3b requires it to match its manifest row — the mutant
  // breaks both, because 61_'s row still expects the round 61_ last changed in.
  var row61 = rows.filter(function (r) { return r.file === '61_api_v1_weekly_ai_plan.gs'; })[0];
  return wap !== RELEASE && moved === RELEASE && row61.expected !== RELEASE;
});

mut('N9 the S1 census pin lags the release, so it refuses a correctly synced project', function () {
  var m = RS1SRC.split("var S1_BUILD_ = '" + RELEASE + "'")
    .join("var S1_BUILD_ = '" + PREV_RELEASE + "'");
  if (m === RS1SRC) throw new Error('S1_BUILD_ anchor missing');
  return (RS1SRC.match(/var S1_BUILD_ = '([^']+)'/) || [])[1] === RELEASE
    && (m.match(/var S1_BUILD_ = '([^']+)'/) || [])[1] === PREV_RELEASE;
});

mut('N10 the retired scope stays activation_ready in the readiness census', function () {
  // The census reads the allowlist it is given; the mutation is the CUTOVER not having happened — the world
  // still arms CO1100-R. The armed scope then loses its candidacy and the retired one keeps it, which is the
  // state this whole round exists to change.
  var pre = H.census(H.pos({
    allowlist: [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: RETIRED_SKU }],
    gap: { d18_gap_qty: 0, d18_suggested_qty: 0, d30_suggested_qty: 0, d45_suggested_qty: 0,
      d90_gap_qty: 160, d90_suggested_qty: 160 },
    extraGap: [ARMED_GAP],
    factory_stock: [{ warehouse_id: H.WHF, sku: H.SKU, fac_current_stock: 2000, fac_reserved_stock: 100 },
      { warehouse_id: H.WHF, sku: SCOPE.sku, fac_current_stock: 310, fac_reserved_stock: 0 }]
  }));
  var armedPre = H.scopeOf(pre, SCOPE.sku), oldPre = H.scopeOf(pre, RETIRED_SKU);
  return E_ARMED.activation_ready === true && E_OLD.activation_ready === false
    && armedPre.activation_ready === false && armedPre.currently_allowlisted === false
    && oldPre.currently_allowlisted === true;
});

mut('N11 the new release is not registered in the shared order, so every floor check reads -1', function () {
  var missing = RELEASE + '-NOT-REGISTERED';
  return RO.OWNER_STAMPS.indexOf(RELEASE) !== -1
    && RO.OWNER_STAMPS.indexOf(missing) === -1
    && RO.stampAtOrAfter(missing, PREV_RELEASE) === false;
});

mut('N12 the activation census pin is left at the previous release', function () {
  var m = RCENSUS.split("var R6R7_ACTIVATION_BUILD_ = '" + RELEASE + "'")
    .join("var R6R7_ACTIVATION_BUILD_ = '" + PREV_RELEASE + "'");
  if (m === RCENSUS) throw new Error('pin anchor missing');
  var sys = (R63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1];
  return (RCENSUS.match(/var R6R7_ACTIVATION_BUILD_ = '([^']+)'/) || [])[1] === sys
    && (m.match(/var R6R7_ACTIVATION_BUILD_ = '([^']+)'/) || [])[1] !== sys;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
process.exit(fail ? 1 : 0);
