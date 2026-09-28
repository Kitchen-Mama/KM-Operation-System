// S5-R1 — RECOMMENDATION / DECISION ENGINE CONTRACT FREEZE — drift guard.
//
// WHAT THIS IS. S5-R1 is a spec round: it changes no behaviour. A spec round's only real failure mode is that
// the document stops being true — someone edits the runtime and the freeze silently becomes a description of
// a system that no longer exists. So this suite does not check that the document says what it says. It checks
// that every FACT the document cites is still true of the shipped sources, and it MEASURES those facts rather
// than grepping for reassuring words.
//
// Owner document: docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md
//
// THE ONE THAT MATTERS MOST (§E). The monthly residual reads
//
//     residualOrderNeedQty = MAX(0, destinationGapQty - overseasCoveredQty - factoryCoveredQty)
//
// with both coverage terms pinned to literal 0 — because overseas and factory coverage were ALREADY consumed
// upstream, folded into KMTPP's opening supply. `destinationGapQty` is therefore already net of them.
// Substituting the real coverage values there reads exactly like fixing an obvious stub, and would subtract
// the same coverage twice. That is one line away at all times, so it is asserted from BOTH ends: the fold must
// exist, and the subtraction must not.
//
// COMMENTS ARE NOT CODE. Every source is comment-stripped before it is searched. Three earlier rounds in this
// repository lost time to a symbol found in a comment describing the behaviour that had just been removed.
//
// NO MUTATION OF ANY FILE. The nine planted defects are applied to in-memory copies. Nothing on disk is
// written, and the tree is as clean at the end as at the start.
//
// Run: node assets/tests/s5-r1-recommendation-contract-freeze.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
var CORE = 'assets/js/core/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

// Strip block and line comments. A "//" inside a string or a URL must survive, so a line comment only counts
// when the two slashes are not preceded by a colon.
function code(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

// Bounded extraction of ONE function body by brace matching. A fixed character slice runs past the end of the
// function into whatever follows it and then reports its neighbour's code as this function's — which is how a
// rule in the previous round came to assert something about a function it had never read.
function fnBody(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  var open = src.indexOf('{', i);
  if (open < 0) return null;
  var depth = 0;
  for (var j = open; j < src.length; j++) {
    var ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(open, j + 1); }
  }
  return null;
}

var DOC = 'docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md';

// ---------------------------------------------------------------------------------------------------------
section('A. The contract document exists and is anchored to owners that exist');

ok(exists(DOC), 'A1  the S5 contract document is in the tree');
var doc = read(DOC);

// Every runtime owner the document names by symbol must be findable in a non-generated source. The generated
// bundle is excluded deliberately: it is a build output, so finding a symbol only there would prove the
// document cites something no hand-maintained file owns.
var OWNERS = {
  'KMTPP.projectTimePhasedSupply': CORE + 'supply-planning-time-phased-projection.js',
  'KMMSA.allocateMarketplaceReceiverSupply': CORE + 'supply-planning-marketplace-supply-allocation.js',
  'KMFSR.reallocatePreallocatedFactorySupply': CORE + 'supply-planning-surplus-reallocation.js',
  'KMCALC.calculateSuggestedOrderQty': CORE + 'supply-planning-calculations.js',
  'KMOOR.projectOngoingIncomingForSku': CORE + 'supply-planning-ongoing-order-runtime.js',
  'flatV2': CORE + 'supply-planning-request-draft-v2.js'
};
Object.keys(OWNERS).forEach(function (k) {
  var rel = OWNERS[k];
  var sym = k.indexOf('.') > 0 ? k.split('.')[1] : null;
  var present = exists(rel) && (!sym || code(read(rel)).indexOf(sym) >= 0);
  ok(present, 'A2  owner present for ' + k + '  (' + rel.split('/').pop() + ')');
});

var LIVE = {
  gap: GS + '43_api_v1_gap_materialization.gs',
  workspace: GS + '42_api_v1_recommendation_workspace.gs',
  procurement: GS + '13_procurement_handlers.gs',
  send: GS + '66_api_v1_request_order_send.gs',
  shipPlan: GS + '11_shipping_plan_handlers.gs',
  shipment: GS + '12_shipment_handlers.gs',
  shipAlloc: GS + '16_shipping_allocation_handlers.gs',
  dispatch: GS + '22_shipment_dispatch_handlers.gs'
};
Object.keys(LIVE).forEach(function (k) { ok(exists(LIVE[k]), 'A3  live source present: ' + LIVE[k].split('/').pop()); });

// ---------------------------------------------------------------------------------------------------------
section('B. §2A — the two mainlines are separate decision authorities (measured)');

// The claim is about ARTIFACT CREATION, not about mention. The purchase mainline legitimately READS shipment
// status as supply evidence (§2A allows exactly that), and a shipment line legitimately carries a
// purchase_order_line_id for lineage. Asserting "these files never say the other word" would fail on both of
// those honest usages, so the measurement is narrower and means something: who may CALL a shipment creator,
// and who may name the other mainline's tables as TABLES.

var ORDERING = ['procurement', 'send'];
var SHIPPING = ['shipPlan', 'shipment', 'shipAlloc', 'dispatch'];
var SRC = {};
Object.keys(LIVE).forEach(function (k) { SRC[k] = code(read(LIVE[k])); });

// B1 — the shipment creator is called only from inside the shipping mainline.
var CREATOR = 'createShipmentFromApprovedPlan_';
ok(SRC.shipment.indexOf('function ' + CREATOR) >= 0, 'B1  ' + CREATOR + ' is defined in the shipment owner');

function callsCreator(src) {
  // a call, not the definition
  return src.replace('function ' + CREATOR, ' ').indexOf(CREATOR + '(') >= 0;
}
var creatorCallers = Object.keys(LIVE).filter(function (k) { return callsCreator(SRC[k]); }).sort();
eq(creatorCallers, ['shipPlan', 'shipment'], 'B2  only the shipping mainline calls the shipment creator');
ORDERING.forEach(function (k) {
  ok(!callsCreator(SRC[k]), 'B3  ordering file ' + LIVE[k].split('/').pop() + ' calls no shipment creator');
});

// B4 — the shipping mainline names neither ordering table as a table literal.
function namesTable(src, t) {
  return src.indexOf("'" + t + "'") >= 0 || src.indexOf('"' + t + '"') >= 0;
}
SHIPPING.forEach(function (k) {
  ['request_orders', 'purchase_orders'].forEach(function (t) {
    ok(!namesTable(SRC[k], t), 'B4  ' + LIVE[k].split('/').pop() + ' does not name table ' + t);
  });
});

// B5 — the PO creator's own scope statement is still true of it: it writes only the two PO tables.
var poFn = fnBody(SRC.procurement, 'handleCreatePurchaseOrderFromRequest_')
  || fnBody(SRC.procurement, 'createPurchaseOrderFromRequest_');
ok(poFn !== null, 'B5  the PO creation function body was located (not a fixed slice)');
if (poFn) {
  ok(!namesTable(poFn, 'shipments') && poFn.indexOf('createShipment') < 0,
    'B5a PO creation writes no shipment');
}

// ---------------------------------------------------------------------------------------------------------
section('C. §3 — the R9A ledger contract is carried unchanged');

var ledgers = code(read(CORE + 'supply-planning-ledgers.js'));

// C1 — demandKey excludes marketplace. Measured on the key EXPRESSIONS, not on the file: `marketplace` is a
// legitimate attribute on the emitted entry, so its presence in the module proves nothing either way.
var keyExprs = ledgers.match(/\[company,[^\]]*\]\.join\(SEP\)/g) || [];
ok(keyExprs.length >= 2, 'C1  found the demand/pool key expressions (' + keyExprs.length + ')');
keyExprs.forEach(function (e, i) {
  ok(e.indexOf('marketplace') < 0, 'C2  key expression ' + (i + 1) + ' excludes marketplace');
});

// C3 — the demand key composition, as a set (order is the module's business, membership is the contract).
var demandRegular = keyExprs.filter(function (e) { return e.indexOf('demandType') >= 0; })[0] || '';
var demandEvent = keyExprs.filter(function (e) { return e.indexOf('eventId') >= 0; })[0] || '';
function members(expr) {
  return (expr.replace(/^\[/, '').replace(/\]\.join\(SEP\)$/, '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean)).sort();
}
eq(members(demandRegular),
  ['company', 'demandType', 'destinationWarehouseId', 'masterSku', 'planningCycle', 'sourceRef'],
  'C3  regular demand key = company+destinationWarehouseId+masterSku+planningCycle+demandType+sourceRef');
eq(members(demandEvent),
  ['company', 'destinationWarehouseId', 'eventId', 'masterSku', 'planningCycle'],
  'C4  SPECIAL_EVENT demand key swaps demandType+sourceRef for eventId');

// C5 — pool key composition.
var poolExpr = (ledgers.match(/\[company, warehouseId, masterSku, poolType\]\.join\('\|'\)/) || [])[0]
  || (ledgers.match(/var poolKey = \[[^\]]*\]/) || [])[0] || '';
ok(poolExpr.indexOf('marketplace') < 0 && poolExpr.indexOf('poolType') >= 0 && poolExpr.indexOf('warehouseId') >= 0,
  'C5  pool key = company+warehouseId+masterSku+poolType, no marketplace');

// C6 — delivered-not-received is still its own bucket, distinct from received and current.
['DELIVERED_NOT_RECEIVED', 'RECEIVED_NOT_REFLECTED', 'CURRENT_STOCK'].forEach(function (b) {
  ok(ledgers.indexOf(b) >= 0, 'C6  lifecycle bucket present and distinct: ' + b);
});

// ---------------------------------------------------------------------------------------------------------
section('D. §4 — gap input authority');

var gap = SRC.gap;

// D1 — the gap key, read from the declaration rather than restated here.
var keyDecl = (gap.match(/var GAP_KEY_COLS_ = \[([^\]]*)\]/) || [])[1] || '';
var gapKey = keyDecl.split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); }).filter(Boolean);
eq(gapKey, ['company', 'country', 'marketplace', 'sku'], 'D1  GAP_KEY = company+country+marketplace+sku');

// D2 — the header set. Asserted as a SET containing the contract's required members, plus a floor on the
// three additive §41 transport columns. Not asserted as an exact ordered literal: this header is explicitly
// designed to be extended additively at the end, and freezing its spelling would ban the next additive column.
var hdrDecl = (gap.match(/var OP_GAP_HEADERS_ = \[([\s\S]*?)\];/) || [])[1] || '';
var headers = hdrDecl.split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); }).filter(Boolean);
ok(headers.length >= 24, 'D2  order_planning_gap carries at least 24 columns (' + headers.length + ')');
['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_month'].forEach(function (h) {
  ok(headers.indexOf(h) >= 0, 'D3  header present: ' + h);
});
[1, 2, 3, 4].forEach(function (n) {
  ['t' + n + '_month', 't' + n + '_gap_qty', 't' + n + '_suggested_qty'].forEach(function (h) {
    ok(headers.indexOf(h) >= 0, 'D4  tier header present: ' + h);
  });
});
['factory_available_qty_snapshot', 'reallocation_in_qty_snapshot', 'reallocation_out_qty_snapshot']
  .forEach(function (h) { ok(headers.indexOf(h) >= 0, 'D5  §41 transport column present: ' + h); });

// D6 — calculation_status is a closed two-value vocabulary and BLOCKED always carries a note.
// The two forms differ: the READY default is an object literal (`calculation_status: 'READY'`) and every
// BLOCKED is a later assignment (`base.calculation_status = 'BLOCKED'`). A pattern that allows no whitespace
// around the separator sees only the first and reports a one-value vocabulary.
var statuses = {};
(gap.match(/calculation_status\s*[:=]\s*'([A-Z_]+)'/g) || []).forEach(function (m) {
  statuses[m.replace(/[\s\S]*'([A-Z_]+)'[\s\S]*/, '$1')] = 1;
});
eq(Object.keys(statuses).sort(), ['BLOCKED', 'READY'], 'D6  calculation_status vocabulary = {BLOCKED, READY}');

// D7 — the gap materializer runs no forecast of its own: the contract says the recommendation consumes the
// materialized row and recomputes neither Forecast nor Gap.
ok(gap.indexOf('KMTPP') < 0 || gap.indexOf('projectTimePhasedSupply(') < 0,
  'D7  the gap materializer does not itself call the residual owner');

// ---------------------------------------------------------------------------------------------------------
section('E. §5 DC-1 — coverage is counted exactly once (the live one-line risk)');

var ws = SRC.workspace;

// E1 — the fold. Opening supply = site stock + allocated overseas + allocated factory.
var foldFn = fnBody(ws, 'recoWsComposeOpeningSupply_');
ok(foldFn !== null, 'E1  the opening-supply composer body was located');
if (foldFn) {
  var openingAssign = (foldFn.match(/opening = [^;]*/) || [])[0] || '';
  var addsThree = /site/.test(openingAssign) && /\bov\b/.test(openingAssign) && /\bfc\b/.test(openingAssign)
    && openingAssign.indexOf('+') >= 0;
  ok(addsThree, 'E2  overseas and factory coverage ARE folded into opening supply');
  ok(/site === null/.test(foldFn), 'E3  missing site stock yields null opening (missing is not zero)');
}

// E4 — the subtraction. Inside the monthly projection builder the two coverage terms must be locals pinned to
// literal 0, and the residual must subtract THOSE locals — not the allocation map.
var projFn = fnBody(ws, 'recoWsBuildMonthlyProjection_');
ok(projFn !== null, 'E4  the monthly projection builder body was located');
if (projFn) {
  var pinned = /var overseasCoveredQty = 0, ?factoryCoveredQty = 0/.test(projFn)
    || (/overseasCoveredQty = 0/.test(projFn) && /factoryCoveredQty = 0/.test(projFn));
  ok(pinned, 'E5  both coverage terms are pinned to literal 0 in the residual scope');

  var residual = (projFn.match(/residualOrderNeedQty = [^;]*/) || [])[0] || '';
  ok(residual.indexOf('destinationGapQty') >= 0, 'E6  the residual starts from destinationGapQty');
  ok(residual.indexOf('Math.max(0,') >= 0 || residual.indexOf('Math.max(0 ,') >= 0,
    'E7  the residual is floored at zero');
  ok(residual.indexOf('rAlloc') < 0 && residual.indexOf('composition.') < 0,
    'E8  DC-1: the residual does NOT re-subtract the allocation map (coverage counted once)');
}

// E9 — and the fold is what actually reaches the projection: the composer's output is the opening argument.
ok(/recoWsBuildMonthlyProjection_\(\s*months\s*,\s*composition\.openingSupplyQty/.test(ws),
  'E9  composition.openingSupplyQty is the opening supply passed to the projection');

// E10 — exactly one live residual owner (§44.4): sumRemainingShortages must not be on this path.
ok(ws.indexOf('sumRemainingShortages') < 0,
  'E10 the live monthly path does not call sumRemainingShortages (one residual owner)');

// ---------------------------------------------------------------------------------------------------------
section('F. §9 — the decision state vocabulary is the frozen flat-V2 one');

var v2 = code(read(CORE + 'supply-planning-request-draft-v2.js'));

function enumKeys(src, name) {
  var m = src.match(new RegExp('var ' + name + ' = \\{([^}]*)\\}'));
  if (!m) return null;
  return m[1].split(',').map(function (s) { return s.split(':')[0].trim(); }).filter(Boolean).sort();
}
eq(enumKeys(v2, 'TIER_STATUS'), ['cancelled', 'draft', 'submitted'],
  'F1  tier status = {draft, submitted, cancelled}');
eq(enumKeys(v2, 'HEADER_STATUS'), ['cancelled', 'draft', 'partially_submitted', 'submitted'],
  'F2  header status = {draft, partially_submitted, submitted, cancelled}');

// F3 — the proposed S5 vocabulary is NOT in the shipped schema. This is the claim §9 and D-S5-5 rest on; if a
// later round adopts it, this assertion is the thing that forces the document to be updated with it.
['PROPOSED', 'OVERRIDDEN', 'SUPERSEDED'].forEach(function (s) {
  ok(v2.indexOf(s) < 0, 'F3  proposed state "' + s + '" is absent from the frozen schema');
});

// F4 — tiers carry T1..T3 only; T4 is visibility-only and has no decision column.
var tiersDecl = (v2.match(/var TIERS = \[([^\]]*)\]/) || [])[1] || '';
var tiers = tiersDecl.split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); }).filter(Boolean);
eq(tiers, ['T1', 'T2', 'T3'], 'F4  decision tiers = T1..T3 (T4 is visibility-only)');

// F5 — the per-tier decision columns the contract's S5_OUTPUT_CONTRACT lists.
var tierColsFn = fnBody(v2, 'tierCols') || '';
['month', 'recommended_qty', 'order_qty', 'carton_qty', 'status', 'user_edited', 'note'].forEach(function (c) {
  ok(tierColsFn.indexOf("'" + c + "'") >= 0 || tierColsFn.indexOf("+ '" + c + "'") >= 0,
    'F5  tier column present: tN_' + c);
});

// F6 — a user quantity never back-fills the recommendation. Measured on the generator: order_qty defaults FROM
// recommended_qty, and never the other way round.
var projRow = fnBody(v2, 'projectFlatDraftRow') || '';
ok(/ord = \(f\.orderQty === undefined/.test(projRow) || /orderQty === undefined/.test(projRow),
  'F6  order_qty defaults to the recommendation at generation');
ok(!/recommended_qty['"\]]* = [^;]*order/i.test(projRow),
  'F7  recommended_qty is never assigned from an order quantity');

// ---------------------------------------------------------------------------------------------------------
section('G. §7 — there is no recommendation ACTION enum today (the gap S5 records)');

// The only recommendation_type in the system is the RUN type. If a later round adds an action enum, this
// assertion fails and the contract's §7 "does not exist" claim must be rewritten rather than quietly rot.
var runTypes = {};
[LIVE.gap, LIVE.workspace, CORE + 'supply-planning-request-draft-v2.js'].forEach(function (rel) {
  var s = code(read(rel));
  ['WEEKLY_SHIPPING', 'MONTHLY_ORDER'].forEach(function (t) { if (s.indexOf(t) >= 0) runTypes[t] = 1; });
});
ok(Object.keys(runTypes).length >= 1, 'G1  the run-type vocabulary is present (' + Object.keys(runTypes).sort().join(',') + ')');

// WHOLE TOKENS ONLY. A substring search reports `NEEDS_MANUAL_REVIEW` — the draft-id MIGRATION classification
// in the flat-V2 module, which says a legacy row needs a human before it is migrated — as evidence that a
// recommendation ACTION vocabulary exists. It is a different vocabulary answering a different question, and
// counting it would have turned §7's honest "this does not exist" into a false claim that it does.
var ACTION_TOKENS = ['USE_FACTORY_STOCK', 'USE_COMMITTED_PRODUCTION', 'NEW_ORDER', 'NO_ACTION', 'MANUAL_REVIEW'];
function hasWholeToken(s, t) { return new RegExp('(^|[^A-Za-z0-9_])' + t + '(?![A-Za-z0-9_])').test(s); }
var actionFound = [];
[LIVE.gap, LIVE.workspace, CORE + 'supply-planning-request-draft-v2.js', CORE + 'supply-planning-calculations.js']
  .forEach(function (rel) {
    var s = code(read(rel));
    ACTION_TOKENS.forEach(function (t) {
      if (hasWholeToken(s, t) && actionFound.indexOf(t) < 0) actionFound.push(t);
    });
  });
eq(actionFound.sort(), [], 'G2  no recommendation ACTION token exists in the live recommendation path');

// ---------------------------------------------------------------------------------------------------------
section('H. Mutation — nine planted defects, applied in memory (no file is written)');

// Each mutant is the realistic version of its defect, not a strawman. Every probe returns true only when the
// corresponding assertion above would have failed.

mut('H1 the residual re-subtracts the allocation map (DC-1, the one-line risk)', function () {
  var m = ws.replace('var overseasCoveredQty = 0, factoryCoveredQty = 0;',
    function () { return 'var overseasCoveredQty = rAlloc.overseasCoveredQty, factoryCoveredQty = rAlloc.factoryCoveredQty;'; });
  if (m === ws) throw new Error('anchor did not apply');
  var b = fnBody(m, 'recoWsBuildMonthlyProjection_') || '';
  var res = (b.match(/residualOrderNeedQty = [^;]*/) || [])[0] || '';
  var pinnedStill = /overseasCoveredQty = 0/.test(b) && /factoryCoveredQty = 0/.test(b);
  return pinnedStill === false || res.indexOf('rAlloc') >= 0;
});

mut('H2 opening supply stops folding factory coverage', function () {
  var m = ws.replace('var opening = (site === null) ? null : (site + ov + fc);',
    function () { return 'var opening = (site === null) ? null : (site + ov);'; });
  if (m === ws) throw new Error('anchor did not apply');
  var b = fnBody(m, 'recoWsComposeOpeningSupply_') || '';
  var a = (b.match(/opening = [^;]*/) || [])[0] || '';
  return !(/\bfc\b/.test(a));
});

mut('H3 marketplace enters the demand key', function () {
  var m = ledgers.replace('[company, destinationWarehouseId, masterSku, planningCycle, demandType, sourceRef]',
    function () { return '[company, marketplace, destinationWarehouseId, masterSku, planningCycle, demandType, sourceRef]'; });
  if (m === ledgers) throw new Error('anchor did not apply');
  var ex = m.match(/\[company,[^\]]*\]\.join\(SEP\)/g) || [];
  return ex.some(function (e) { return e.indexOf('marketplace') >= 0; });
});

mut('H4 marketplace enters the supply pool key', function () {
  var m = ledgers.replace("var poolKey = [company, warehouseId, masterSku, poolType].join('|');",
    function () { return "var poolKey = [company, marketplace, warehouseId, masterSku, poolType].join('|');"; });
  if (m === ledgers) throw new Error('anchor did not apply');
  var e = (m.match(/var poolKey = \[[^\]]*\]/) || [])[0] || '';
  return e.indexOf('marketplace') >= 0;
});

mut('H5 a gap key column is dropped', function () {
  var m = gap.replace("var GAP_KEY_COLS_ = ['company', 'country', 'marketplace', 'sku'];",
    function () { return "var GAP_KEY_COLS_ = ['company', 'country', 'sku'];"; });
  if (m === gap) throw new Error('anchor did not apply');
  var d = (m.match(/var GAP_KEY_COLS_ = \[([^\]]*)\]/) || [])[1] || '';
  var k = d.split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); }).filter(Boolean);
  return JSON.stringify(k) !== JSON.stringify(['company', 'country', 'marketplace', 'sku']);
});

mut('H6 a tier decision status is added to the frozen vocabulary', function () {
  var m = v2.replace('var TIER_STATUS = { draft: 1, submitted: 1, cancelled: 1 };',
    function () { return 'var TIER_STATUS = { draft: 1, submitted: 1, cancelled: 1, approved: 1 };'; });
  if (m === v2) throw new Error('anchor did not apply');
  return JSON.stringify(enumKeys(m, 'TIER_STATUS')) !== JSON.stringify(['cancelled', 'draft', 'submitted']);
});

mut('H7 the purchase mainline gains a shipment creator call', function () {
  var m = SRC.procurement + '\nfunction poSideEffect_(ss, p, a) { return createShipmentFromApprovedPlan_(ss, p, a); }\n';
  return callsCreator(m) === true && callsCreator(SRC.procurement) === false;
});

// H8 and H9 exist because D6 and G2 were BOTH repaired after first reporting a false failure — one pattern
// disallowed whitespace around `=`, the other matched a token as a substring of an unrelated one. A probe that
// was just loosened or tightened to make a run go green is the easiest place in a suite for a real defect to
// hide, so each repaired probe is required to still bite.

mut('H8 a recommendation ACTION enum appears in the live path', function () {
  var planted = code(read(LIVE.workspace)) + "\nvar RECO_ACTION_ = { NEW_ORDER: 1, NO_ACTION: 1 };\n";
  var before = ACTION_TOKENS.filter(function (t) { return hasWholeToken(code(read(LIVE.workspace)), t); });
  var after = ACTION_TOKENS.filter(function (t) { return hasWholeToken(planted, t); });
  // and the near-miss must STILL not count: a migration classification is not an action
  var nearMiss = hasWholeToken('var k = "NEEDS_MANUAL_REVIEW";', 'MANUAL_REVIEW');
  return before.length === 0 && after.length === 2 && nearMiss === false;
});

mut('H9 the gap materializer stops reporting BLOCKED', function () {
  var m = gap.replace(/calculation_status = 'BLOCKED'/g, function () { return "calculation_status = 'READY'"; });
  if (m === gap) throw new Error('anchor did not apply');
  var st = {};
  (m.match(/calculation_status\s*[:=]\s*'([A-Z_]+)'/g) || []).forEach(function (x) {
    st[x.replace(/[\s\S]*'([A-Z_]+)'[\s\S]*/, '$1')] = 1;
  });
  return JSON.stringify(Object.keys(st).sort()) !== JSON.stringify(['BLOCKED', 'READY']);
});

// ---------------------------------------------------------------------------------------------------------
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5-R1 CONTRACT DRIFT'); process.exit(1); }
console.log('S5_CONTRACT_FACTS_STILL_TRUE = YES');
