// S8-R4D-F1A — site-switch stale derived-field guard. NO_SCOPE_CROSS_CONTAMINATION.
// Deterministic Node tests of the SHIPPED guard, source-sliced out of the page IIFE and EXECUTED.
// Run: node assets/tests/site-switch-stale-scope-guard-s8-r4d-f1a.test.js
//
// THE DEFECT. Two scope authorities advance at different times:
//   the TABLE renders _irSearch.applied        (advances on a successful Search)
//   the reco/gap chain asks the LIVE SELECTORS (advances the moment a dropdown changes)
// _irApplySearch_ renders ONE STATEMENT BEFORE _irRecoTrigger(), so the first paint of a new scope read a
// recommendation/gap state still holding the PREVIOUS site's result. Both consumers guarded on "a scope is
// loaded", never on WHICH — so US Avg Sales/day, Days of Supply and Suggested Qty rendered under a CA header.
//
// Every function below is the SHIPPED function, sliced and run. The guard is tested by its BEHAVIOUR under a
// scope flip, not by asserting that a line of source exists.
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0;
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
  else console.log('ok   ' + l);
}
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else console.log('ok   ' + l); }

var SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
function sliceFn(src, name, indent) {
  var NL = src.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  var start = src.indexOf(indent + 'function ' + name + '(');
  if (start < 0) throw new Error('could not locate ' + name);
  var endMarker = NL + indent + '}' + NL;
  var end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error('could not close ' + name);
  return src.slice(start, end + endMarker.length);
}

// ---- the shipped guard + the four consumers, in ONE scope with controllable state ---------------------
function buildHarness() {
  var src = [
    'var _irSearch = { applied: null };',
    'var _irRecoState = null, _irMatState = null, _irRecoSeq = 0;',
    'var _matMode = true, _wsEnabled = true;',
    'function _irUseMaterializedGapRead() { return _matMode; }',
    'function _irRecommendationWorkspaceEnabled() { return _wsEnabled; }',
    'function _irMatNum(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }',
    'function _irAggregateActionableRecommendedQty(lines) {',
    '  var t = 0, c = 0; (lines || []).forEach(function (l) { if (l && l.recommendedQty != null) { t += l.recommendedQty; c++; } });',
    '  return { total: t, actionableCount: c };',
    '}',
    sliceFn(SRC, '_irAppliedScopeKey_', ''),
    sliceFn(SRC, '_irResultMatchesAppliedScope_', ''),
    sliceFn(SRC, '_irCanonicalSalesBasis_', ''),
    sliceFn(SRC, '_irRecoLinesForSku', ''),
    sliceFn(SRC, '_irRecoHasCanonicalBasis_', ''),
    sliceFn(SRC, '_irSuggestedQtyState_', ''),
    'return { set: function (k, v) { if (k === "search") _irSearch = v; if (k === "reco") _irRecoState = v;',
    '           if (k === "mat") _irMatState = v; if (k === "matMode") _matMode = v; if (k === "ws") _wsEnabled = v; },',
    '  appliedKey: _irAppliedScopeKey_, matches: _irResultMatchesAppliedScope_,',
    '  basis: _irCanonicalSalesBasis_, lines: _irRecoLinesForSku,',
    '  hasCanonical: _irRecoHasCanonicalBasis_, suggested: _irSuggestedQtyState_ };'
  ].join('\n');
  return (new Function('window', src))({});
}
var H = buildHarness();

var US = { country: 'US', marketplaceId: 'MK-US-AMZ' };
var CA = { country: 'CA', marketplaceId: 'MK-CA-AMZ' };
var EU = { country: 'EU', marketplaceId: 'MK-EU-AMZ' };
var JP = { country: 'JP', marketplaceId: 'MK-JP-AMZ' };
function keyOf(a) { H.set('search', { applied: a }); return H.appliedKey(); }

function recoFor(applied, rate) {
  H.set('search', { applied: applied });
  return { status: 'READY', scope: { company: 'KM', country: applied.country, marketplace: 'Amazon' },
    appliedScopeKey: H.appliedKey(), linesBySku: { 'SKU-X': [
      { destinationType: 'MARKETPLACE', recommendedQty: rate * 10,
        horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: rate } }] } };
}
function matFor(applied, qty) {
  H.set('search', { applied: applied });
  return { status: 'READY', scopeKey: JSON.stringify(applied), appliedScopeKey: H.appliedKey(),
    bySku: { 'SKU-X': { calculation_status: 'READY', d90_suggested_qty: qty } }, rows: [], loadedOk: true, error: null };
}

// ============================================================ A — the scope identity
console.log('\n-- A: one scope identity --');
eq(keyOf(US), 'us|MK-US-AMZ', 'A1  applied scope key is country + marketplaceId');
ok(keyOf(US) !== keyOf(CA), 'A2  US and CA produce different keys');
eq(keyOf(null), '', 'A3  never searched -> empty key');
// An UNSTAMPED result must be refused, not waved through. This is the fail-closed half of the guard.
H.set('search', { applied: US });
eq(H.matches({ status: 'READY' }), false, 'A4  a result with NO stamp is REFUSED (fail closed)');
eq(H.matches(null), false, 'A5  a null state is refused');
eq(H.matches({ appliedScopeKey: 'us|MK-US-AMZ' }), true, 'A6  a matching stamp is accepted');

// ============================================================ B — fixture 1: the reported defect
console.log('\n-- B: fixture 1 — US completes, operator switches to CA --');
var recoUS = recoFor(US, 7.5);
var matUS = matFor(US, 900);
H.set('reco', recoUS); H.set('mat', matUS);
H.set('search', { applied: US });
eq(H.basis('SKU-X').avgSalesPerDay, 7.5, 'B1  under US, the US canonical rate IS used');
eq(H.suggested({ sku: 'SKU-X' }), { state: 'READY', value: 900 }, 'B2  under US, the US suggested qty IS used');
// The operator searches CA. _irApplySearch_ assigns applied, renders, and only THEN triggers the reco read,
// so at first paint the state below is still the US one. This is the exact instant of the defect.
H.set('search', { applied: CA });
eq(H.basis('SKU-X'), null, 'B3  under CA with US state loaded -> NO canonical rate  [AVG_SALES_STALE_SCOPE]');
eq(H.suggested({ sku: 'SKU-X' }), { state: 'PENDING', value: null },
  'B4  under CA with US state loaded -> Suggested Qty is PENDING, not 900  [SUGGESTED_QTY_STALE_SCOPE]');
eq(H.hasCanonical(), false, 'B5  and the velocity re-render does NOT fire on a foreign result - the scope guard is '
  + 'checked BEFORE the basis, so R46 publishing a rate for both Planning Models cannot weaken it');
eq(H.lines({ sku: 'SKU-X' }), null, 'B6  reco lines read as NOT LOADED (null), never another site\'s lines');

// ============================================================ C — fixture 2: the late response
console.log('\n-- C: fixture 2 — slow US response lands after CA is active --');
H.set('search', { applied: CA });
H.set('reco', recoFor(CA, 2.0)); H.set('search', { applied: CA });
H.set('mat', matFor(CA, 100)); H.set('search', { applied: CA });
eq(H.basis('SKU-X').avgSalesPerDay, 2.0, 'C1  CA result under CA commits');
// a late US envelope overwrites the state (the seq guard is the first line of defence; this is the second)
H.set('reco', recoUS); H.set('mat', matUS); H.set('search', { applied: CA });
eq(H.basis('SKU-X'), null, 'C2  a late US result does NOT commit under CA  [LATE_RESPONSE_WRONG_SCOPE_COMMIT]');
eq(H.suggested({ sku: 'SKU-X' }), { state: 'PENDING', value: null }, 'C3  nor does its suggested qty');

// ============================================================ D — fixture 3: rapid CA -> EU -> JP
console.log('\n-- D: fixture 3 — rapid switching, only the final scope may commit --');
var states = [recoFor(CA, 1), recoFor(EU, 2), recoFor(JP, 3)];
H.set('search', { applied: JP });
eq(states.map(function (s) { H.set('reco', s); return H.basis('SKU-X') ? H.basis('SKU-X').avgSalesPerDay : null; }),
  [null, null, 3], 'D1  under JP only the JP result commits; CA and EU are refused');

// ============================================================ E — fixtures 6 & 7: lazy Suggested Qty
console.log('\n-- E: fixtures 6 & 7 — lazy Suggested Qty across a scope change --');
H.set('search', { applied: EU });
H.set('mat', matUS);
eq(H.suggested({ sku: 'SKU-X' }).state, 'PENDING', 'E1  old-scope lazy completion is DISCARDED (fixture 6)');
H.set('mat', matFor(EU, 42)); H.set('search', { applied: EU });
eq(H.suggested({ sku: 'SKU-X' }), { state: 'READY', value: 42 }, 'E2  current-scope lazy completion COMMITS (fixture 7)');
// PENDING is not NONE and neither is zero — the §9 three-state rule the page already holds elsewhere.
H.set('search', { applied: JP });
eq(H.suggested({ sku: 'SKU-X' }).value, null, 'E3  a refused result yields NO value — never 0');
eq(H.suggested({ sku: 'SKU-X' }).state === 'NONE', false, 'E4  and is PENDING, not NONE (nothing is known yet)');
// LOADING / IDLE still answer PENDING, unchanged.
H.set('mat', { status: 'LOADING', appliedScopeKey: H.appliedKey(), bySku: {} });
eq(H.suggested({ sku: 'SKU-X' }).state, 'PENDING', 'E5  LOADING is still PENDING (behaviour unchanged)');

// ============================================================ F — fixture 8: the future field inherits it
console.log('\n-- F: fixture 8 — a future async field inherits the same guard --');
// The predicate is state-shaped, not reco-specific: any future aggregate (On-the-Way, F2) stamps the same
// field and is refused by the same rule. Proven on a synthetic state, which is what a future caller is.
H.set('search', { applied: US });
eq(H.matches({ appliedScopeKey: keyOf(US) }), true, 'F1  a future On-the-Way state stamped for US passes under US');
H.set('search', { applied: CA });
eq(H.matches({ appliedScopeKey: 'us|MK-US-AMZ' }), false, 'F2  and is refused under CA');
ok(SRC.indexOf('window._irResultMatchesAppliedScope_ = _irResultMatchesAppliedScope_;') !== -1,
  'F3  the predicate is exported, so F2 cannot quietly invent a second one');

// ============================================================ G — what was NOT changed
console.log('\n-- G: the contracts this round must not move --');
ok(SRC.indexOf('_irSearch.applied = { country: pending.country, marketplaceId: pending.marketplaceId };') !== -1,
  'G1  `applied` is still assigned in exactly one place (_irApplySearch_)');
ok(SRC.indexOf('if (mySeq !== _irSearch.seq) return;') !== -1,
  'G2  the Search sequence guard is intact (fixture 4: bootstrap cannot overwrite a manual Search)');
ok(SRC.indexOf('if (my !== _irRecoSeq) return;') !== -1, 'G3  the recommendation sequence guard is intact');
ok(SRC.indexOf('if (my !== _irMatSeq) return;') !== -1, 'G4  the materialized-gap sequence guard is intact');
// fixture 5 — a FAILED Search never reaches _irApplySearch_, so old rows are never relabelled.
ok(SRC.indexOf("_irSearch.status = 'ERROR';") !== -1 && SRC.indexOf('function _irApplySearch_(pending, mySeq) {') !== -1,
  'G5  a failed Search sets ERROR and never assigns `applied` (fixture 5)');
// The Search UX contract (option B: the last confirmed result stays, marked stale, until a new Search) is
// unchanged — asserted on the MECHANISM, not on prose that can be rewrapped.
ok(/function _irRenderScope_\(\) \{\s*var a = _irSearch\.applied;/.test(SRC)
  && SRC.indexOf('function _irMarkSearchStale_()') !== -1
  && SRC.indexOf('_irSearch.stale = _irFiltersDiffer_(_irPendingFilters_(), _irSearch.applied);') !== -1,
  'G6  the explicit-Search gate is unchanged — the table still renders APPLIED and a selector change only marks stale');
// The first layer is untouched: still the frozen thirteen, still no exposure table.
ok(/var IR_FIRST_LAYER_TABLES_ = \[[\s\S]*?\];/.test(SRC), 'G7  IR_FIRST_LAYER_TABLES_ still present');
eq((SRC.match(/var _wsPayload = \{ recentWindow: true, only: IR_FIRST_LAYER_TABLES_\.slice\(\) \};/g) || []).length, 1,
  'G8  the first-layer request is unchanged — 13 tables, no new mandatory read');
// The WRITE path is deliberately NOT guarded (see the F1A report §write-path).
var wp = SRC.slice(SRC.indexOf('function _irExpectedDemandFromSnapshot_'));
wp = wp.slice(0, wp.indexOf('\r\n}\r\n') + 1);
eq(wp.indexOf('_irResultMatchesAppliedScope_'), -1,
  'G9  the Submit declared-demand path is NOT guarded — refusing there would suppress a server conflict check');

// ============================================================ H — mutations
console.log('\n-- H: mutants --');
function mutate(find, replace, label, probe) {
  var c = SRC.split(find).length - 1;
  if (c !== 1) { fail++; console.error('FAIL ' + label + ' — anchor matched ' + c + ' times'); return; }
  var M = SRC.replace(find, replace);
  var saved = SRC;
  SRC = M;
  var h;
  try { h = buildHarness(); } catch (e) { SRC = saved; fail++; console.error('FAIL ' + label + ' — mutant did not build'); return; }
  SRC = saved;
  var caught = false;
  try { caught = probe(h); } catch (e) { caught = true; }
  if (caught) console.log('ok   ' + label + ' — CAUGHT');
  else { fail++; console.error('FAIL ' + label + ' — SURVIVED'); }
}
// M1 — drop the Avg Sales guard: the US rate reappears under CA.
mutate('  if (!_irResultMatchesAppliedScope_(_irRecoState)) return null;\r\n  var lines = _irRecoState.linesBySku[String(sku)];',
  '  var lines = _irRecoState.linesBySku[String(sku)];', 'H1 Avg Sales guard removed',
  function (h) { h.set('reco', recoUS); h.set('search', { applied: CA }); var b = h.basis('SKU-X'); return !!(b && b.avgSalesPerDay === 7.5); });
// M2 — drop the Suggested Qty guard: the US quantity reappears under CA.
mutate('    if (!_irResultMatchesAppliedScope_(_irMatState)) return { state: \'PENDING\', value: null };\r\n',
  '', 'H2 Suggested Qty guard removed',
  function (h) { h.set('mat', matUS); h.set('search', { applied: CA }); return h.suggested({ sku: 'SKU-X' }).value === 900; });
// M3 — compare the LOADED scope instead of the APPLIED one: every result then matches itself and the guard
// becomes a tautology. This is the subtle wrong fix, and it must not pass.
mutate('    return st.appliedScopeKey === _irAppliedScopeKey_();',
  '    return st.appliedScopeKey === st.appliedScopeKey;', 'H3 guard compares a result to itself',
  function (h) { h.set('reco', recoUS); h.set('search', { applied: CA }); var b = h.basis('SKU-X'); return !!(b && b.avgSalesPerDay === 7.5); });
// M4 — accept an unstamped state: a state that predates the stamp would be trusted.
mutate("    if (!st || typeof st.appliedScopeKey !== 'string') return false;",
  '    if (!st) return false;\n    if (st.appliedScopeKey === undefined) return true;', 'H4 unstamped state accepted',
  function (h) { h.set('search', { applied: CA }); return h.matches({ status: 'READY' }) === true; });

console.log('\n' + (fail ? 'FAILURES: ' + fail : 'ALL PASS'));
process.exitCode = fail ? 1 : 0;
