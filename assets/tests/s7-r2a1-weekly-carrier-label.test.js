// S7-R2A1 — WEEKLY SHIPPING PLAN CARRIER LABEL CLOSURE.
//
// The last carrier-name display gap in the S7 operator surfaces, and the cheapest one: 40_ has ALWAYS joined
// the carriers master server-side and served carrier { id, name }. The Weekly page's workspace normalizer kept
// the id, dropped the name, and the one carrier row it renders printed a raw carrier_id — a name that had
// already been resolved, thrown away one line before it was needed.
//
// WHAT THIS ROUND CHANGED: two expressions in shipping-plan.js. The name is carried, and the label renders
// name-primary with the id beside it. No backend change, no request, no second resolver, no new lookup.
//
// WHY NO KM.display.carrierDisplay CALL HERE. That resolver takes the carrier MASTER as an argument, because
// it performs the join. On this path the join has already happened — in 40_, against the real master, with a
// real index — and the browser never receives the master at all (Workspace mode deliberately does not load
// the broad cache). Calling the resolver would mean handing it a one-row list built from its own answer:
// ceremony that re-runs a join on its own output and hides where the join actually happens. The resolver
// count stays 1 and this surface renders a pre-resolved pair, which is what it is.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. Fixtures only.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s7-r2a1-weekly-carrier-label.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var SP = read('js/pages/shipping-plan.js');
var F40 = read('specs/active/apps-script/40_api_v1_weekly_workspace.gs');
var ADAPTER = read('js/api/operation-system-db-api.js');

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function count(s, re) { return (String(s).match(re) || []).length; }
function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// ---- the two shipped expressions, extracted and RUN -------------------------------------------------------
// Both live inside large page functions that cannot be loaded without a DOM. Rather than assert ABOUT the
// source with a regex — which can only ever prove that some characters are present — lift each expression and
// evaluate it. Every behavioural claim below therefore exercises the shipped bytes, character for character.

var LABEL_SRC = /var cbCarrierName = String\(plan\.carrierName[\s\S]*?: _spEsc\(cbCarrierId\)\);/.exec(SP);
ok(!!LABEL_SRC, 'S1  the carrier label expression was located in the shipped page source');

// Runs the REAL expression against a plan record and returns what the Cost Breakdown row would show.
function label(plan) {
  var sandbox = { plan: plan, _spEsc: function (v) { return String(v == null ? '' : v); }, out: null };
  vm.createContext(sandbox);
  vm.runInContext(LABEL_SRC[0] + '\nout = cbCarrier;', sandbox);
  return sandbox.out;
}

var NORM_SRC = /carrierId: \(p\.carrier && p\.carrier\.id\) \|\| '',\r?\n\s*carrierName: \(p\.carrier && p\.carrier\.name\) \|\| '',/.exec(SP);
ok(!!NORM_SRC, 'S2  the workspace normalizer carrier pair was located in the shipped page source');

// Runs the REAL normalizer lines against a workspace View-Model plan.
function norm(p) {
  var sandbox = { p: p, out: null };
  vm.createContext(sandbox);
  vm.runInContext('out = {\n' + NORM_SRC[0] + '\n};', sandbox);
  return sandbox.out;
}

// ==========================================================================================================
section('A  THE DATA WAS ALREADY THERE — 40_ resolves the name, server-side, against the real master');
// ==========================================================================================================
// This is the premise of the whole round. If it stopped being true the fix below would be rendering a field
// that nobody fills, so it is asserted here rather than assumed from the report.
ok(/\{ name: 'carriers',\s+requiredCols: \['carrier_id'\] \}/.test(F40),
  'A1  40_ declares the carriers master a BASE table of the Weekly read');
ok(/var carrierIndex = weeklyIndexBy_\(carriers, 'carrier_id'\);/.test(F40),
  'A1a and indexes it by carrier_id — the join key is the identity, not a label');
ok(/carrier: \{ id: weeklyWsStr_\(r\.carrier_id\), name: carrier \? weeklyWsStr_\(carrier\.carrier_name\) : '' \}/.test(F40),
  'A1b and emits carrier { id, name }, with an empty name when the master has no row for that id');

// NO BACKEND CHANGE. The round is frontend-only, and this is how that is proven rather than asserted.
eq(count(code(F40), /carrier_name/g), 1,
  'A2  40_ reads carrier_name in exactly one place — the join it already had. BACKEND_RUNTIME_CHANGED = NO');

// ==========================================================================================================
section('B  THE FOUR STATES — and B/C never collapse into D');
// ==========================================================================================================
// '--' is the only rendering that an operator may read as "this plan has no carrier". An id with no resolvable
// name is a DIFFERENT fact: we know which carrier, we cannot name it. Showing '--' there would be a lie about
// the plan, not merely a missing label, which is why these four cases are asserted separately.

eq(label({ carrierId: 'CR-001', carrierName: 'Pacific Forwarding' }), 'Pacific Forwarding  ·  CR-001',
  'B1  A: id + name → the NAME is primary, the id stays beside it as canonical identity');
eq(label({ carrierId: 'CR-002', carrierName: '' }), 'CR-002',
  'B2  B: id + blank name → the ID, truthfully. Unresolved is not absent');
eq(label({ carrierId: 'CR-003' }), 'CR-003',
  'B3  C: id and no name field at all (a LEGACY-source record) → the ID. That path has no master join, and '
  + 'it lands in the same branch rather than in a special case of its own');
eq(label({ carrierId: '', carrierName: '' }), '--',
  'B4  D: no carrier id → the existing no-carrier presentation, unchanged');
eq(label({}), '--',
  'B4a and a record with neither field reads the same way');

// Whitespace is not a name, and it is not an identity either.
eq(label({ carrierId: 'CR-004', carrierName: '   ' }), 'CR-004',
  'B5  a name of nothing but spaces is not a name — it falls to the id, not to a blank label');
eq(label({ carrierId: '   ', carrierName: 'Ghost Lines' }), '--',
  'B5a and a blank id is no carrier, whatever text arrived beside it');

// WEEKLY_PLAN_RAW_ID_ONLY_WHEN_NAME_AVAILABLE_COUNT = 0 — stated as a measurement, not as a hope.
var rawIdOnlyWhenNameAvailable = 0;
[['CR-1', 'Alpha Freight'], ['CR-2', 'Beta Lines'], ['CR-3', 'Gamma Shipping']].forEach(function (p) {
  if (label({ carrierId: p[0], carrierName: p[1] }) === p[0]) rawIdOnlyWhenNameAvailable++;
});
eq(rawIdOnlyWhenNameAvailable, 0,
  'B6  WEEKLY_PLAN_RAW_ID_ONLY_WHEN_NAME_AVAILABLE_COUNT = 0 across every case where a name exists');

// TWO CARRIERS — the label must follow the row, not the first row it ever saw.
var two = [
  label({ carrierId: 'CR-A', carrierName: 'Alpha Freight' }),
  label({ carrierId: 'CR-B', carrierName: 'Beta Lines' })
];
eq(two, ['Alpha Freight  ·  CR-A', 'Beta Lines  ·  CR-B'],
  'B7  two plans with two carriers get two labels — the expression is pure and holds no state');

// ==========================================================================================================
section('C  THE NAME IS CARRIED — which is the entire defect, in one line');
// ==========================================================================================================
eq(norm({ carrier: { id: 'CR-001', name: 'Pacific Forwarding' } }),
  { carrierId: 'CR-001', carrierName: 'Pacific Forwarding' },
  'C1  the workspace normalizer now keeps BOTH halves of the pair 40_ served');
eq(norm({ carrier: { id: 'CR-002', name: '' } }), { carrierId: 'CR-002', carrierName: '' },
  'C1a an unresolved carrier keeps its id and an empty name — which B2 renders as the id');
eq(norm({}), { carrierId: '', carrierName: '' },
  'C1b a plan with no carrier normalizes to the no-carrier pair');

// The id is untouched. CARRIER_ID_REMAINS_CANONICAL = YES.
ok(/carrierId: \(p\.carrier && p\.carrier\.id\) \|\| '',/.test(SP),
  'C2  the id expression is byte-for-byte what it was — the identity did not move');

// ==========================================================================================================
section('D  ONE RESOLVER, NO NEW LOOKUP, NO NEW REQUEST');
// ==========================================================================================================
// CARRIER_DISPLAY_RESOLVER_COUNT_POST = 1, counted across the whole browser tree rather than asserted.
var JS_FILES = [];
(function walk(dir) {
  fs.readdirSync(path.join(ROOT, dir)).forEach(function (f) {
    var rel = dir + '/' + f;
    var st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) return walk(rel);
    if (/\.js$/.test(f)) JS_FILES.push(rel);
  });
})('js');
var resolverDefs = 0;
JS_FILES.forEach(function (f) { resolverDefs += count(code(read(f)), /carrierDisplay: function/g); });
eq(resolverDefs, 1,
  'D1  CARRIER_DISPLAY_RESOLVER_COUNT_POST = 1 — this round defined no second carrier presentation resolver');
ok(/carrierDisplay: function \(carrierId, carriers\)/.test(ADAPTER),
  'D1a and the one that exists is still the R2A resolver in the adapter, unchanged by this round');

// NEW_CARRIER_LOOKUP = NO. The Weekly page performs no master lookup of any kind: it renders a pair that was
// resolved upstream. A lookup here would need the carriers master, which this page never receives.
eq(count(code(SP), /getCarriers|carrierIndex|carriers\b/g), 0,
  'D2  NEW_CARRIER_LOOKUP = NO — the Weekly page names no carrier master, index or collection');
eq(count(code(SP), /KM\.display\.carrier/g), 0,
  'D2a and calls no carrier resolver: the join it would re-run already happened in 40_');

// NEW_NETWORK_REQUEST = NO / ADDITIONAL_REQUEST_COUNT = 0. The page's read lifecycle is one workspace call,
// exactly as before; nothing per-row, nothing per-plan.
eq(count(code(SP), /KM\.api\.getWorkspace\(/g), 1,
  'D3  the page still makes exactly ONE workspace request — ADDITIONAL_REQUEST_COUNT = 0');
eq(count(code(SP), /include: \{ summary: true, plans: true, details: true, filterOptions: true \}/g), 1,
  'D3a with the include set it already had — no carrier projection was added to the request');
eq(count(code(SP), /fetch\(|XMLHttpRequest/g), 0,
  'D3b PER_ROW_CARRIER_REQUEST_COUNT = 0 and DUPLICATE_CARRIER_FETCH_COUNT = 0 — the page issues no transport '
  + 'of its own at all, so a per-row carrier fetch has nowhere to live');

// ==========================================================================================================
section('E  NOTHING ELSE MOVED — selection, rate, payload, persistence');
// ==========================================================================================================
// A display change that reaches a write is not a display change. carrierName exists in exactly two places:
// the normalizer that creates it and the label that reads it.
eq(count(code(SP), /\bcarrierName\b/g), 2,
  'E1  carrierName appears TWICE in the page — produced once, consumed once, and nowhere near a payload');
eq(count(code(SP), /carrier_name/g), 0,
  'E1a and the persisted column name appears nowhere — CARRIER_NAME_PERSISTENCE_REQUIRED = NO, still');

// The page never wrote a carrier and still does not. Selection lives elsewhere; this surface only reports it.
eq(count(code(SP), /carrier_id/g), 0,
  'E2  the page builds no carrier field into any request payload — WRITE_PAYLOAD_CHANGED = NO');
eq(count(code(SP), /rate_card_id|carrier_unit_rate|carrier_rate_type/g), 0,
  'E2a and touches no rate identity — RATE_SELECTION_CHANGED = NO');

// Three carrier call sites existed in this page before this round and still do: the prototype cost widget
// (hardcoded demo rates, untouched), its handler, and its export. This round added no carrier behaviour.
ok(/function updateCarrierCost\(cardIndex, carrier, totalPcs\)/.test(SP),
  'E3  the pre-existing prototype cost widget is exactly where it was — CARRIER_SELECTION_CHANGED = NO');

// The adapter's legacy normalizer is the OTHER source this page reads from, and it is untouched: it carries an
// id and no name, which is precisely why the legacy branch lands on B3 rather than on a false '--'.
ok(/carrierId: String\(r\.carrier_id \|\| ''\)\.trim\(\),/.test(ADAPTER),
  'E4  the legacy plan normalizer still yields carrierId from carrier_id, unchanged');

// ==========================================================================================================
section('F  MUTANTS — every claim above must be able to fail');
// ==========================================================================================================

mut('F1 would catch the name being dropped again in the normalizer', function () {
  var m = SP.replace("        carrierName: (p.carrier && p.carrier.name) || '',\r\n", '');
  return !/carrierName: \(p\.carrier && p\.carrier\.name\)/.test(m);
});

mut('F2 would catch a blank name collapsing into the no-carrier dash', function () {
  var src = LABEL_SRC[0].replace(
    "        var cbCarrier = !cbCarrierId",
    "        var cbCarrier = !cbCarrierId || !cbCarrierName");
  var sandbox = { plan: { carrierId: 'CR-002', carrierName: '' }, _spEsc: function (v) { return String(v); }, out: null };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nout = cbCarrier;', sandbox);
  return sandbox.out !== 'CR-002';
});

mut('F3 would catch the id being dropped from the resolved label', function () {
  var src = LABEL_SRC[0].replace(
    "(_spEsc(cbCarrierName) + '  ·  ' + _spEsc(cbCarrierId))",
    "_spEsc(cbCarrierName)");
  var sandbox = { plan: { carrierId: 'CR-001', carrierName: 'Pacific Forwarding' }, _spEsc: function (v) { return String(v); }, out: null };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nout = cbCarrier;', sandbox);
  return sandbox.out !== 'Pacific Forwarding  ·  CR-001';
});

mut('F4 would catch the label reverting to the raw id', function () {
  var m = SP.replace(LABEL_SRC[0], "var cbCarrier = plan.carrierId ? _spEsc(plan.carrierId) : '--';");
  return !/var cbCarrierName = String\(plan\.carrierName/.test(m);
});

mut('F5 would catch a carrier lookup being introduced into the page', function () {
  var m = SP.replace('var _spLastModel = null;',
    'var _spLastModel = null;\r\nvar _spCarriers = window.KM.DB.getCarriers();');
  return count(code(m), /getCarriers/g) > 0;
});

mut('F6 would catch a second resolver being defined in the page', function () {
  var m = SP.replace('var _spLastModel = null;',
    'var _spLastModel = null;\r\nvar _spCarrierDisplay = { carrierDisplay: function (id, list) { return id; } };');
  var n = 0;
  JS_FILES.forEach(function (f) {
    n += count(code(f === 'js/pages/shipping-plan.js' ? m : read(f)), /carrierDisplay: function/g);
  });
  return n !== 1;
});

mut('F7 would catch carrierName reaching a write payload', function () {
  var m = SP.replace('var _spLastModel = null;',
    'var _spLastModel = null;\r\nfunction _spBad() { return { carrier_name: plan.carrierName }; }');
  return count(code(m), /carrier_name/g) > 0;
});

mut('F8 would catch a second workspace request being added', function () {
  var m = SP.replace('var maps = _spBuildLegacyLiveMaps_();',
    'var maps = _spBuildLegacyLiveMaps_(); window.KM.api.getWorkspace("carriers");');
  return count(code(m), /KM\.api\.getWorkspace\(/g) !== 1;
});

mut('F9 would catch 40_ losing the server-side join this round depends on', function () {
  var m = F40.replace(/carrier: \{ id: weeklyWsStr_\(r\.carrier_id\), name: carrier \? weeklyWsStr_\(carrier\.carrier_name\) : '' \}/,
    "carrier: { id: weeklyWsStr_(r.carrier_id) }");
  return !/carrier: \{ id: weeklyWsStr_\(r\.carrier_id\), name:/.test(m);
});

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + '  ' + pass + ' passed / ' + fail + ' failed'
  + '   mutants ' + mutants + ', survived ' + survived);
process.exitCode = fail ? 1 : 0;
