// S7-R2A — SHIPMENT CARRIER NAME READ-MODEL COMPLETION.
//
// carrier_id is the identity and carrier_name is never stored beside it, so every surface that wants to SHOW a
// carrier has to resolve the id against the `carriers` master. One read already did (40_, Weekly). The read
// serving Shipment Draft, the Confirm summary and the On-the-Way Map did not, and the browser resolver built
// for exactly that gap — KM.display.carrierName — asked KM.DB.getOperationDb, a member the API migration
// removed and nothing ever reassigned. Its typeof guard was permanently false, so it returned '' for every
// carrier that has ever existed; no page called it, which is the only reason that stayed invisible.
//
// WHAT THIS ROUND CHANGED: 57_ carries the master, the adapter passes it through its canonical normalizer, and
// the resolver is PURE — the caller hands it the master its own read model holds. A resolver with a private
// cache can answer from one page's stale data on another, and can answer at all when nothing has been read.
// Passing the data in makes "nothing was read" an argument rather than an indistinguishable empty result.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. Fixtures only.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s7-r2a-shipment-carrier-name.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var GS = 'specs/active/apps-script/';
var F57 = read(GS + '57_api_v1_shipment_workspace.gs');
var F40 = read(GS + '40_api_v1_weekly_workspace.gs');
var F12 = read(GS + '12_shipment_handlers.gs');
var ADAPTER = read('js/api/operation-system-db-api.js');
var SH = read('js/pages/shipping-history.js');
var MAP = read('js/pages/global-logistics-map.js');

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

// ---- the resolver, extracted and RUN (not merely matched) ------------------------------------------------
// KM.display is assigned inside a `if (typeof window !== 'undefined')` block in the adapter. Rather than load
// 7000 lines of browser code, lift that one object literal and evaluate it against a window stub — so every
// assertion below exercises the SHIPPED source, character for character.
function loadDisplay(src) {
  var m = /window\.KM\.display = \{[\s\S]*?\n    \};/.exec(src);
  if (!m) throw new Error('KM.display block not found');
  // The block names codeDisplay_ for its three enum projections, which live elsewhere in the adapter and are
  // not this round subject. Stubbed so the CARRIER member is evaluated from the shipped source verbatim.
  var sandbox = { window: { KM: {} }, codeDisplay_: { shippingMethod: 0, lastMileDelivery: 0, customsType: 0 } };
  vm.createContext(sandbox);
  vm.runInContext('window.KM = window.KM || {};\n' + m[0], sandbox);
  return sandbox.window.KM.display;
}
var D = loadDisplay(ADAPTER);

var CARRIERS = [
  { carrierId: 'CR-001', carrierName: 'Sinotrans' },
  { carrierId: 'CR-002', carrierName: 'Yang Ming' },
  { carrierId: 'CR-003', carrierName: '' }           // a master row that cannot name its carrier
];

// ==========================================================================================================
section('A  THE DEFECT, CONFIRMED BEFORE IT IS CLAIMED FIXED');
// ==========================================================================================================
eq(count(code(ADAPTER), /KM\.DB\.getOperationDb\s*=[^=]/g), 0,
  'A1  KM.DB.getOperationDb is assigned NOWHERE — the member the old resolver asked for does not exist');
eq(count(code(ADAPTER), /typeof window\.KM\.DB\.getOperationDb === 'function'/g), 0,
  'A2  and the resolver no longer asks for it');
eq(count(code(F12), /carrier_name/g), 0,
  'A3  carrier_name is still not persisted by the shipment owner — the fix is a projection, not a column');

// ==========================================================================================================
section('B  THE CANONICAL MASTER REACHES THE SHIPMENT READ');
// ==========================================================================================================
ok(/\{ name: 'carriers',\s+requiredCols: \['carrier_id'\] \}/.test(F57),
  'B1  57_ declares the carriers master as a BASE table, keyed on carrier_id');
ok(/\{ name: 'carriers',\s+requiredCols: \['carrier_id'\] \}/.test(F40),
  'B1a which is the same declaration 40_ already carries — one definition of the master, not two');
ok(/carriers: carriers,/.test(F57), 'B2  and emits it, raw, like every other master in this read');
eq(count(code(F57), /getOperationDb/g), 0,
  'B3  without reintroducing the whole-DB read — WHOLE_DB_READ_REINTRODUCED = NO');

// The adapter keeps "absent" and "empty" apart, which is the whole of §12's state truth.
ok(/data\.carriers === undefined \|\| data\.carriers === null/.test(ADAPTER),
  'B4  the adapter maps an ABSENT carriers key to null, not to []');
ok(/normalizeCarrierRecord/.test(ADAPTER) && /carriers: carriers/.test(ADAPTER),
  'B4a and normalizes present rows with the SAME normalizer the broad path uses');

mut('B1 would catch the master being dropped from the read', function () {
  var m = F57.replace("{ name: 'carriers',                      requiredCols: ['carrier_id'] },", '');
  return !/\{ name: 'carriers',\s+requiredCols: \['carrier_id'\] \}/.test(m);
});
mut('B3 would catch the whole-DB getter returning to this read', function () {
  var m = F57 + '\nfunction x_() { return io.getOperationDb(); }\n';
  return count(code(m), /getOperationDb/g) === 1;
});

// ==========================================================================================================
section('C  THE RESOLVER — four states, and none of them interchangeable');
// ==========================================================================================================
eq(D.carrierDisplay('CR-001', CARRIERS),
  { state: 'RESOLVED', text: 'Sinotrans', carrierId: 'CR-001', carrierName: 'Sinotrans' },
  'C1  §15.A a known carrier_id resolves to the canonical name');
eq(D.carrierDisplay('CR-002', CARRIERS).text, 'Yang Ming',
  'C1a and a second id resolves to ITS name, from the same one map — §15.C');

eq(D.carrierDisplay('CR-404', CARRIERS),
  { state: 'UNKNOWN', text: 'CR-404', carrierId: 'CR-404', carrierName: '' },
  'C2  §15.D an id with no master row keeps the ID on screen — identity is never hidden');
ok(D.carrierDisplay('CR-404', CARRIERS).text !== '' && D.carrierDisplay('CR-404', CARRIERS).state !== 'NONE',
  'C2a and is NOT turned into "no carrier" — the row has one, we just cannot name it');

eq(D.carrierDisplay('CR-001', null),
  { state: 'UNREAD', text: 'CR-001', carrierId: 'CR-001', carrierName: '' },
  'C3  §15.E an UNREAD master is its own state — never an authoritative "missing carrier"');
eq(D.carrierDisplay('CR-001', undefined).state, 'UNREAD',
  'C3a undefined reads the same way as null');
ok(D.carrierDisplay('CR-001', []).state === 'UNKNOWN',
  'C3b while an EMPTY master really is a lookup that failed — the two are distinguished');

eq(D.carrierDisplay('', CARRIERS).state, 'NONE', 'C4  no carrier id at all is NONE');
eq(D.carrierDisplay(null, CARRIERS).state, 'NONE', 'C4a and so is null');
eq(D.carrierDisplay('CR-003', CARRIERS).state, 'UNKNOWN',
  'C5  a master row with a BLANK name resolves UNKNOWN — an empty label is not an answer');
eq(D.carrierDisplay('CR-003', CARRIERS).text, 'CR-003', 'C5a so the id stays on screen');

// It must never answer with another carrier's name.
eq(D.carrierName('CR-002', CARRIERS), 'Yang Ming', 'C6  carrierName projects the SAME answer');
eq(D.carrierName('CR-404', CARRIERS), '', 'C6a and is empty when the name is genuinely not known');
var ids = ['CR-001', 'CR-002', 'CR-003', 'CR-404'];
eq(ids.map(function (i) { return D.carrierDisplay(i, CARRIERS).carrierName; }),
  ['Sinotrans', 'Yang Ming', '', ''],
  'C7  CARRIER_ID_NAME_MISMATCH_COUNT = 0 — every id maps to its own row and no other');

mut('C2 would catch an unknown id being collapsed to an empty label', function () {
  // The LAST return in the function is the not-found answer; collapsing it to NONE is the defect.
  var m = ADAPTER.replace(
    /return \{ state: 'UNKNOWN', text: id, carrierId: id, carrierName: '' \};(\s*\r?\n\s*\},)/,
    "return { state: 'NONE', text: '', carrierId: '', carrierName: '' };$1");
  return loadDisplay(m).carrierDisplay('CR-404', CARRIERS).state === 'NONE';
});
mut('C3 would catch an unread master being reported as a missing carrier', function () {
  var m = ADAPTER.replace(
    "            if (carriers === null || carriers === undefined) {",
    "            if (false) {");
  return loadDisplay(m).carrierDisplay('CR-001', null).state !== 'UNREAD';
});
mut('C7 would catch the resolver answering with the FIRST row rather than the matching one', function () {
  var m = ADAPTER.replace(
    "                if (String(c.carrierId || c.carrier_id || '').trim() !== id) continue;",
    "                if (false) continue;");
  return loadDisplay(m).carrierDisplay('CR-002', CARRIERS).carrierName === 'Sinotrans';
});
mut('C5 would catch a blank master name rendering as an empty carrier', function () {
  var m = ADAPTER.replace(
    "                if (!nm) return { state: 'UNKNOWN', text: id, carrierId: id, carrierName: '' };",
    '                ');
  return loadDisplay(m).carrierDisplay('CR-003', CARRIERS).text === '';
});

// ==========================================================================================================
section('D  ONE RESOLVER, ONE DATA PATH');
// ==========================================================================================================
eq(count(code(ADAPTER), /carrierDisplay: function/g), 1, 'D1  exactly one carrierDisplay definition');
eq(count(code(ADAPTER), /carrierName: function/g), 1, 'D1a and one carrierName, which delegates to it');
ok(/carrierName: function \(carrierId, carriers\) \{[\s\S]{0,160}carrierDisplay\(carrierId, carriers\)\.carrierName/
  .test(ADAPTER),
  'D1b CARRIER_DISPLAY_RESOLVER_COUNT = 1 — two shapes of one answer, never two data sources');

// No page may build its own id -> name lookup beside it.
[['shipping-history.js', SH], ['global-logistics-map.js', MAP]].forEach(function (p, i) {
  eq(count(code(p[1]), /carrier_name|carrierName\s*\|\|/g), 0,
    'D2.' + (i + 1) + ' ' + p[0] + ' builds no carrier-name lookup of its own');
  ok(/KM\.display\.carrierDisplay/.test(p[1]),
    'D2a.' + (i + 1) + ' it calls the shared resolver instead');
});
// Each page names the resolver twice and both are right: once in a typeof guard, once in the call. What
// must be unique is the CALL, so that is what is counted.
eq(count(code(SH), /KM\.display\.carrierDisplay\(/g), 1,
  'D3  shipping-history CALLS the resolver from one place, so its two renders cannot drift');
eq(count(code(MAP), /KM\.display\.carrierDisplay\(/g), 1,
  'D3a and the map likewise');

mut('D3 would catch a second, divergent call site appearing', function () {
  var m = SH + '\nvar x = window.KM.display.carrierDisplay(id, []);\n';
  return count(code(m), /KM\.display\.carrierDisplay\(/g) === 2;
});

// ==========================================================================================================
section('E  NO NEW REQUESTS — the master rides the slice that was already being read');
// ==========================================================================================================
eq(count(code(SH), /getWorkspace\('shipment'/g), 1,
  'E1  shipping-history still issues ONE shipment workspace read');
eq(count(code(SH), /fetch\s*\(/g), 0, 'E1a and no request of its own');
eq(count(code(SH), /KM\.DB\.getCarriers/g), 0,
  'E2  it does NOT fall back to the broad-cache carrier getter — that is the whole-DB path this round may '
  + 'not depend on');
ok(/function _shGetCarriers\(\) \{ return _shReadModel \? _shReadModel\.carriers : null; \}/.test(SH),
  'E2a the master comes from the held read model, or is honestly unread');

// §11: per-shipment and duplicate fetch counts, answered structurally.
eq(count(code(SH), /getWorkspace\(/g), 1,
  'E3  PER_SHIPMENT_CARRIER_REQUEST_COUNT = 0 — there is no per-row read to make one');
eq(count(code(MAP), /adaptShipmentWorkspace/g), 2,
  'E3a the map keeps exactly its two existing reads (full load + the bounded one-shipment refresh)');
ok(/carriers: carriersRm/.test(MAP) || /carriers: carriersRm,/.test(MAP),
  'E4  DUPLICATE_CARRIER_FETCH_COUNT = 0 — the map indexes the master once per rebuild, not per card');

// LAST-GOOD: the bounded single-shipment merge must not drop the master it already holds.
var mergeFn = /function _glmMergeShipment_\([\s\S]*?\n  \}/.exec(MAP)[0];
eq(count(code(mergeFn), /carriers/g), 0,
  'E5  LAST_GOOD_CARRIER_MAP_LOSS_COUNT = 0 — the merge never assigns carriers, so the held master survives '
  + 'a bounded refresh by construction rather than by remembering to copy it');

mut('E2 would catch the broad-cache getter being used as a fallback', function () {
  var m = SH.replace('return _shReadModel ? _shReadModel.carriers : null;',
    'return _shReadModel ? _shReadModel.carriers : window.KM.DB.getCarriers();');
  return count(code(m), /KM\.DB\.getCarriers/g) === 1;
});
mut('E5 would catch the bounded merge dropping the held carrier master', function () {
  var m = MAP.replace('_glmReadModel.shipmentLines = repl(_glmReadModel.shipmentLines, mini.shipmentLines);',
    '_glmReadModel.carriers = mini.carriers;\n    _glmReadModel.shipmentLines = repl(_glmReadModel.shipmentLines, mini.shipmentLines);');
  var f = /function _glmMergeShipment_\([\s\S]*?\n  \}/.exec(m)[0];
  return count(f, /carriers/g) > 0;
});

// ==========================================================================================================
section('F  THE SURFACES — name shown, identity kept, write payload untouched');
// ==========================================================================================================
// Draft: the read-only carrier field.
eq(count(code(SH), /roField\('Carrier \(from plan\)', s\.carrierId\)/g), 0,
  'F1  §15.G the Draft no longer prints the raw id as the whole field');
ok(/function carrierField\(\)/.test(SH) && /carrierField\(\) \+/.test(SH),
  'F1a it renders through the resolver instead');
ok(/'carrier list not loaded'/.test(SH) && /'not in the carrier master'/.test(SH),
  'F1b and says WHICH of the two unresolved states it is in, rather than showing a bare id twice');

// The write payload is the thing that must not move.
eq(count(code(SH), /carrier_name/g), 0,
  'F2  §7 DRAFT_CARRIER_NAME_WRITE_COUNT = 0 — no carrier_name is ever sent');
ok(/if \(!String\(payload\.carrier_id \|\| ''\)\.trim\(\)\) missing\.push\('Carrier'\);/.test(SH),
  'F2a DRAFT_CARRIER_WRITE_FIELD = carrier_id — the completeness gate still reads the id');

// Confirm summary.
ok(/var d = _shCarrierCell_\(payload\.carrier_id \|\| s\.carrierId\);/.test(SH),
  'F3  the Confirm summary resolves through the same helper');
ok(/return d\.carrierName \+ '  ·  ' \+ d\.carrierId;/.test(SH),
  'F3a and shows name AND id on the last screen before stock moves');

// Map.
ok(/carrier: s\.carrierId \|\| '', carrierLabel: glmCarrierLabel_/.test(MAP),
  'F4  the map view model keeps `carrier` as the ID and adds a separate label');
ok(/if \(f\.carrier && v\.carrier !== f\.carrier\) return false;/.test(MAP),
  'F4a so the Carrier FILTER still matches on identity, not on display text');
ok(/esc\(v\.carrierLabel \|\| '—'\)/.test(MAP), 'F4b the shipment card shows the label');
ok(/vm\.carrierLabel === vm\.carrier \? vm\.carrier : \(vm\.carrierLabel \+ '  ·  ' \+ vm\.carrier\)/.test(MAP),
  'F4c and the detail drawer shows name AND id, collapsing to one value when they are the same');

mut('F2 would catch carrier_name entering the Draft write payload', function () {
  var m = SH + '\nvar p = { carrier_id: s.carrierId, carrier_name: d.carrierName };\n';
  return count(code(m), /carrier_name/g) === 1;
});
mut('F4a would catch the filter being switched to match on the display label', function () {
  var m = MAP.replace('if (f.carrier && v.carrier !== f.carrier) return false;',
    'if (f.carrier && v.carrierLabel !== f.carrier) return false;');
  return !/if \(f\.carrier && v\.carrier !== f\.carrier\) return false;/.test(m);
});

// ==========================================================================================================
section('G  WHAT THIS ROUND DID NOT DO');
// ==========================================================================================================
// §15.H asked that the Weekly plan's "existing correct carrier name" be left unchanged. The premise is false
// and the finding is reported rather than quietly acted on: 40_ SERVES carrier { id, name } and the page
// reads only `.id` and prints it. What H really protects is that this round does not disturb it, and it does
// not — the assertion is pinned to the behaviour as found.
var SP = read('js/pages/shipping-plan.js');
ok(/carrierId: \(p\.carrier && p\.carrier\.id\) \|\| '',/.test(SP),
  'G1  the Weekly page still reads only carrier.id from a read model that also carries the name');
ok(/var cbCarrier = plan\.carrierId \? _spEsc\(plan\.carrierId\) : '--';/.test(SP),
  'G1a and still renders the raw id — UNCHANGED by this round, and a recorded finding, not a fix');
eq(count(code(SP), /KM\.display\.carrierDisplay/g), 0,
  'G1b the Weekly page was not touched: no resolver call was added to it');

// §13: nothing about selection, rate or quantity moved.
// shipment_qty was ALWAYS passed through here - 57_'s contract says so in as many words - so asserting its
// absence was a claim about the wrong tree. What this round must not have done is add a RATE or a COST.
eq(count(code(F57), /rate_card_id|estimated_freight_cost|carrier_unit_rate/g), 0,
  'G2  57_ gained no rate or cost field — RATE_SELECTION_CHANGED = NO');
ok(/shipment_qty \/ shipment_received_qty[\s\S]{0,80}passed through verbatim/.test(F57),
  'G2b and the quantity passthrough it always had is still described, and still a passthrough');
ok(/authors NO business logic/.test(F57),
  'G2a and still declares itself free of business logic');

// §20: the slices this round may not absorb.
// S7-R1 §5 SAID THESE PANELS DID NOT EXIST. THEY DO, AND THEY ALREADY SHARED A RENDERER.
//
// shDocumentPanelHtml is defined in shipping-history.js, exported on window, and called by BOTH that page
// and purchase-order-overview.js; each feeds it from its own workspace's `documents` include rather than
// from the document.list action. R1 searched for `KM.DB.listEntityDocuments` call sites, found none, and
// concluded the CAPABILITY was missing - but "this adapter method has no caller" and "this capability has
// no surface" are different claims, and only the first was tested.
//
// Pinned here so the correction cannot be lost, and so S7-R2B starts from the tree rather than from R1.
ok(/function shDocumentPanelHtml\(model\)/.test(SH),
  'G3  the shared Document Panel renderer exists, in shipping-history.js');
ok(/window\.shDocumentPanelHtml = shDocumentPanelHtml;/.test(SH),
  'G3a and is exported for other surfaces to reuse');
var PO = read('js/pages/purchase-order-overview.js');
ok(/window\.shDocumentPanelHtml\(\{/.test(PO),
  'G3b the Purchase Order workspace CALLS it — the PO Document Panel is built, not missing');
ok(/include: \{ documents: true \}/.test(PO) || /documents: true/.test(PO),
  'G3c and asks its own workspace for the documents projection that feeds it');
ok(/typeof db\.retryDocumentGeneration !== 'function'/.test(SH),
  'G3d retry is wired too — through a local db alias, which is why an R1 probe for KM.DB.<name> missed it');
// This round added none of that: it changed no document code path.
eq(count(code(SH), /shDocumentPanelHtml/g), 4,
  'G3e and this round left the panel exactly as it found it');

console.log('\n' + pass + ' passed / ' + fail + ' failed   ('
  + mutants + ' mutants, ' + survived + ' survived)');
process.exit(fail === 0 ? 0 : 1);
