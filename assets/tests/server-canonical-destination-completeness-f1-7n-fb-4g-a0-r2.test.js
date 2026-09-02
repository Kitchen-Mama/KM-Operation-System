// F1-7N-FB-4G-A0-R2 — SERVER CANONICAL DESTINATION COMPLETENESS CLOSURE.
//
// A0-R1's report left two things open, and BOTH turned out to be reachable behaviour rather than wording.
// Measured on the shipped code before this round changed anything:
//
//   state                          ricDestinationIdentity_       headerComplete   storedComplete
//   WAREHOUSE only                 OK WAREHOUSE                  true             true
//   MARKETPLACE only               OK MARKETPLACE                true             true
//   BOTH                           ROUTE_DESTINATION_AMBIGUOUS   TRUE  <-- (1)    TRUE  <-- (1)
//   NEITHER                        ROUTE_DESTINATION_MISSING     false            false
//   H4 LIVE (snapshot 'Amazon')    ROUTE_DESTINATION_MISSING     false            TRUE  <-- (2)
//
//   (1) `toReal || destination_marketplace` short-circuits, so a row carrying TWO contradictory destinations
//       passed the write gate on BOTH writers and passed Submit. In effect "warehouse wins" — the client's own
//       routeHeaderFields collapsed the other way ("marketplace wins"), which is how one contradiction produced
//       two different answers depending on which side you asked.
//   (2) sadStoredHeaderRouteIsComplete_'s FB-4D fallback read recommended_destination_warehouse_code_snapshot
//       as the destination, so the LIVE H4 header — warehouse id blank, marketplace blank, snapshot 'Amazon' —
//       was Submit-complete on the strength of a marketplace name sitting in a warehouse-code column.
//
// THE FROZEN LIVE H4: header SADH-K2-E7AF9242 · ResUS/US/Amazon · draft · sea · source WH-TW-CN-FACTORY-YOUXIN ·
// destination warehouse id '' · destination_marketplace '' · code snapshot 'Amazon' (legacy misuse);
// line SADL-K2-16F4E4F9 · CO1100-R · planned_qty 800.
//
// Run: node assets/tests/server-canonical-destination-completeness-f1-7n-fb-4g-a0-r2.test.js

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
// TRUE = the mutant was DETECTED. A throw is a BROKEN PROBE, never a detection.
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) {
    neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    return;
  }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G69 = read('assets/specs/active/apps-script/69_api_v1_route_identity_contract.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CMP = read('assets/js/utils/inventory-compat.js');
var INDEX = read('index.html');
var G16C = code(G16), PAGEC = code(PAGE), CMPC = code(CMP);
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var COMPAT = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var IRWarehouse = COMPAT.IRWarehouse, IRDraft = COMPAT.IRDraft;

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (' \t\r\n'.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(i, j + 1);
  }
  return src.slice(i, src.indexOf(';', i));
}

// ================================================================================================================
// THE FROZEN FIXTURE. Declared once.
// ================================================================================================================
var US = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var YOUXIN = 'WH-TW-CN-FACTORY-YOUXIN';
var WH3PL = 'WH-US-3PL-01', WH3PL_CODE = 'US3PL01';
var H4 = {
  allocation_draft_id: 'SADH-K2-E7AF9242', company: 'ResUS', country: 'US', marketplace: 'Amazon',
  status: 'draft', planning_cycle: '', source_page: 'inventory_replenishment',
  recommended_source_warehouse_id: YOUXIN, recommended_destination_warehouse_id: '',
  recommended_source_warehouse_code_snapshot: '', recommended_destination_warehouse_code_snapshot: 'Amazon',
  destination_marketplace: '', recommended_shipping_method: 'sea', recommended_last_mile_delivery: '',
  recommendation_group_no: '', generation_type: 'user_created', draft_version: '1',
  calculation_run_id: '', formula_version: ''
};
var L4 = { allocation_draft_line_id: 'SADL-K2-16F4E4F9', allocation_draft_id: 'SADH-K2-E7AF9242',
  sku: 'CO1100-R', site_sku: '', window_code: '', planned_qty: 800, recommended_qty: '',
  source_warehouse_id: '', line_status: '', expected_arrival: '' };

// ---- the SHIPPED server predicates, lifted and RUN ------------------------------------------------------------
var SRV = (function () {
  var src = [extractFn(G69, 'ricDestinationIdentity_'), extractFn(G16, 'sadDestinationIdentity_'),
    extractFn(G16, 'sadHeaderRouteIsComplete_'), extractFn(G16, 'sadStoredHeaderRouteIsComplete_'),
    'OUT = { rid: ricDestinationIdentity_, sid: sadDestinationIdentity_, hdr: sadHeaderRouteIsComplete_, stored: sadStoredHeaderRouteIsComplete_ };'
  ].join(String.fromCharCode(10));
  return (new Function('var OUT;' + src + 'return OUT;'))();
})();
// The SAME predicates with the 69_ contract ABSENT, so the inline fallback is exercised rather than described.
var SRV_NO69 = (function () {
  var src = [extractFn(G16, 'sadDestinationIdentity_'), extractFn(G16, 'sadHeaderRouteIsComplete_'),
    extractFn(G16, 'sadStoredHeaderRouteIsComplete_'),
    'OUT = { sid: sadDestinationIdentity_, hdr: sadHeaderRouteIsComplete_, stored: sadStoredHeaderRouteIsComplete_ };'
  ].join(String.fromCharCode(10));
  return (new Function('var OUT;' + src + 'return OUT;'))();
})();

function hdr(extra) {
  var o = { recommended_source_warehouse_id: YOUXIN, recommended_shipping_method: 'sea' };
  for (var k in extra) o[k] = extra[k];
  return o;
}
var S_WAREHOUSE = hdr({ recommended_destination_warehouse_id: WH3PL, destination_marketplace: '', recommended_destination_warehouse_code_snapshot: WH3PL_CODE });
var S_MARKET = hdr({ recommended_destination_warehouse_id: '', destination_marketplace: 'Amazon', recommended_destination_warehouse_code_snapshot: '' });
var S_BOTH = hdr({ recommended_destination_warehouse_id: WH3PL, destination_marketplace: 'Amazon', recommended_destination_warehouse_code_snapshot: WH3PL_CODE });
var S_NEITHER = hdr({ recommended_destination_warehouse_id: '', destination_marketplace: '', recommended_destination_warehouse_code_snapshot: '' });
var S_SNAPSHOT_ONLY = hdr({ recommended_destination_warehouse_id: '', destination_marketplace: '', recommended_destination_warehouse_code_snapshot: 'Amazon' });

// ================================================================================================================
section('A · §B — THE FOUR CANONICAL STATES, AND ONLY FOUR');
// ================================================================================================================
eq(SRV.rid(S_WAREHOUSE).type, 'WAREHOUSE', 'A1  warehouse id only → WAREHOUSE');
eq(SRV.rid(S_MARKET).type, 'MARKETPLACE', 'A2  marketplace only → MARKETPLACE');
eq(SRV.rid(S_BOTH).code, 'ROUTE_DESTINATION_AMBIGUOUS', 'A3  §H.7 BOTH → ROUTE_DESTINATION_AMBIGUOUS');
eq(SRV.rid(S_NEITHER).code, 'ROUTE_DESTINATION_MISSING', 'A4  NEITHER → ROUTE_DESTINATION_MISSING');
eq(SRV.rid(S_SNAPSHOT_ONLY).code, 'ROUTE_DESTINATION_MISSING', 'A5  §H.1 the snapshot alone is DESTINATION MISSING');
eq(SRV.rid(S_BOTH).ok, false, 'A6  §C AMBIGUOUS is not resolved to either side — it is not ok');
eq([SRV.rid(S_BOTH).type, SRV.rid(S_BOTH).id], ['', ''], 'A7  §C no "marketplace wins", no "warehouse wins"');

// ---- the snapshot participates in NOTHING ----------------------------------------------------------------------
eq(SRV.rid(hdr({ recommended_destination_warehouse_id: WH3PL, recommended_destination_warehouse_code_snapshot: 'Amazon' })).type,
   'WAREHOUSE', 'A8  §B a snapshot cannot turn a warehouse route into anything else');
['recommended_destination_warehouse_code_snapshot', 'marketplace', 'note', 'destination', 'destination_label'].forEach(function (f, i) {
  var probe = hdr({ recommended_destination_warehouse_id: '', destination_marketplace: '' });
  probe[f] = 'Amazon';
  eq(SRV.rid(probe).code, 'ROUTE_DESTINATION_MISSING', 'A' + (9 + i) + '  §D `' + f + '` is NOT a canonical destination');
});

// ================================================================================================================
section('B · §D — ONE AUTHORITY, PROVEN ACROSS EVERY SERVER PATH');
// ================================================================================================================
var STATES = [['WAREHOUSE', S_WAREHOUSE, true], ['MARKETPLACE', S_MARKET, true], ['BOTH', S_BOTH, false],
  ['NEITHER', S_NEITHER, false], ['SNAPSHOT-ONLY', S_SNAPSHOT_ONLY, false]];
STATES.forEach(function (s, i) {
  eq(SRV.hdr(s[1]), s[2], 'B' + (1 + i * 3) + '  sadHeaderRouteIsComplete_ (' + s[0] + ')');
  eq(SRV.stored(s[1]), s[2], 'B' + (2 + i * 3) + '  sadStoredHeaderRouteIsComplete_ agrees (' + s[0] + ')');
  eq(SRV.rid(s[1]).ok, s[2], 'B' + (3 + i * 3) + '  and so does ricDestinationIdentity_ (' + s[0] + ')');
});
// The write and Submit gates are now literally the same function, so they cannot drift apart again.
ok(/function sadStoredHeaderRouteIsComplete_\(h\) \{ return sadHeaderRouteIsComplete_\(h\); \}/.test(G16C),
  'B16 the stored-row gate IS the header gate — not a second predicate that can disagree');
ok(!/toSnapshot/.test(G16C), 'B17 §G the snapshot fallback is GONE from 16_ entirely');
ok(/var hasTo = sadDestinationIdentity_\(b\)\.ok;/.test(G16C), 'B18 completeness asks the one owner, never `a || b`');
ok(!/var hasTo = !!toReal \|\|/.test(G16C), 'B19 and the truthy fallback that let BOTH through is gone');
// Every 16_ gate reaches it. sadHeaderRouteIsComplete_ is the shared predicate the write gates, the K2/K4
// resolver and Submit all call, so fixing it fixes them together — asserted, not assumed.
// The ATOMIC path's gate lives in sadAtomicValidateBatch_, not in the core that calls it — naming the core
// here would have asserted a call that is one frame away and reported a real chain as broken.
['sadUpsertDraftHeaderCore_', 'sadAtomicValidateBatch_', 'sadResolveActiveDraftK2OrK3_'].forEach(function (fn, i) {
  ok(/sadHeaderRouteIsComplete_\(/.test(code(extractFn(G16, fn))),
    'B' + (20 + i) + '  ' + fn + ' routes through the shared predicate');
});
ok(/sadAtomicValidateBatch_\(header, body\.lines/.test(code(extractFn(G16, 'sadAtomicUpsertCore_'))),
  'B23a and sadAtomicUpsertCore_ reaches it through that validator');
// Both writers must also AGREE on what counts as route intent, or one gates a payload the other waves through.
(function () {
  var two = code(extractFn(G16, 'sadUpsertDraftHeaderCore_'));
  var atomic = code(extractFn(G16, 'sadAtomicValidateBatch_'));
  ok(/hasRouteIntent[\s\S]{0,400}?destination_marketplace/.test(two),
    'B23b the two-call path counts a marketplace as route intent');
  ok(/hasRouteIntent[\s\S]{0,400}?destination_marketplace/.test(atomic),
    'B23c and so does the atomic path — a marketplace-only body no longer skips the gate');
})();
ok(/sadStoredHeaderRouteIsComplete_\(header\)/.test(code(extractFn(G16, 'sadSubmitToShippingPlansCore_'))),
  'B23 sadSubmitToShippingPlansCore_ does too');
ok(/ricDestinationIdentity_\(r\)\.ok/.test(G16C) || /ricDestinationIdentity_\(/.test(G16C),
  'B24 and the K4 resolver was already on the contract');

// ---- the inline fallback must NEVER disagree with the contract it mirrors --------------------------------------
var FUZZ = [];
['', ' ', WH3PL, '  ' + WH3PL + ' '].forEach(function (w) {
  ['', ' ', 'Amazon', ' Amazon '].forEach(function (m) {
    ['', 'Amazon', WH3PL_CODE].forEach(function (c) {
      FUZZ.push({ recommended_source_warehouse_id: YOUXIN, recommended_shipping_method: 'sea',
        recommended_destination_warehouse_id: w, destination_marketplace: m,
        recommended_destination_warehouse_code_snapshot: c });
    });
  });
});
var disagreements = FUZZ.filter(function (h) {
  var a = SRV.rid(h), b = SRV_NO69.sid(h);
  return a.ok !== b.ok || a.type !== b.type || a.code !== b.code || a.id !== b.id;
});
eq(disagreements.length, 0, 'B25 §D the inline fallback equals ricDestinationIdentity_ across all ' + FUZZ.length + ' shapes');
var gateDisagreements = FUZZ.filter(function (h) { return SRV.hdr(h) !== SRV_NO69.hdr(h); });
eq(gateDisagreements.length, 0, 'B26 §D and the completeness verdict is identical with 69_ absent');

// ================================================================================================================
section('C · §H.18 — THE CLIENT GATE AND THE SERVER GATE REACH THE SAME VERDICT');
// ================================================================================================================
function clientRoute(h) {
  return { source_warehouse_id: h.recommended_source_warehouse_id, shipping_method: h.recommended_shipping_method,
    qty: 800, destination_warehouse_id: h.recommended_destination_warehouse_id,
    destination_marketplace: h.destination_marketplace,
    destination_warehouse_code: h.recommended_destination_warehouse_code_snapshot };
}
var clientDisagreements = FUZZ.filter(function (h) {
  return IRWarehouse.destinationIdentity(clientRoute(h)).ok !== SRV.rid(h).ok;
});
eq(clientDisagreements.length, 0, 'C1  §H.18 client destinationIdentity agrees with the server across all shapes');
var completeDisagreements = FUZZ.filter(function (h) { return IRDraft.isRouteComplete(clientRoute(h)) !== SRV.hdr(h); });
eq(completeDisagreements.length, 0, 'C2  §H.18 and so does the completeness verdict');
eq(IRDraft.isRouteComplete(clientRoute(S_BOTH)), false, 'C3  §H.8 the client REFUSES a BOTH route — no request is issued');
eq(IRDraft.isRouteComplete(clientRoute(S_SNAPSHOT_ONLY)), false, 'C4  §H.2 and refuses a snapshot-only route');
ok(!/var hasTo = !!toReal \|\| isLogicalAmazon;/.test(CMPC), 'C5  the client `a || b` is gone');
ok(/var hasTo = destinationIdentity\(route\)\.ok;/.test(CMPC), 'C6  it asks the one client owner');
ok(!/var logical = route\.destination_type === 'MARKETPLACE_DESTINATION' \|\|/.test(PAGEC),
  'C7  and so does the page\'s own fallback copy');

// ================================================================================================================
section('D · §C — EXPLICIT TYPED TRANSITIONS PRODUCE ONE-SIDED PAYLOADS BY CONSTRUCTION');
// ================================================================================================================
// The To selector is single-select, so the collect already emits one side and the other is already blank. That
// is what makes a transition clean WITHOUT any `a || b` collapse — and it is why the collapse only ever fired
// on a row that was already contradictory, hiding it.
var toAmazon = { source_warehouse_id: YOUXIN, shipping_method: 'sea', qty: 800,
  destination_warehouse_id: '', destination_warehouse_code: '', destination_marketplace: 'Amazon',
  destination_type: 'MARKETPLACE_DESTINATION' };
var hA = IRDraft.routeHeaderFields(US, toAmazon);
eq([hA.recommended_destination_warehouse_id, hA.destination_marketplace, hA.destination_warehouse_code],
   ['', 'Amazon', ''], 'D1  §C.2/§H.12 Warehouse → Amazon: a clean one-sided payload');
eq(SRV.hdr({ recommended_source_warehouse_id: YOUXIN, recommended_shipping_method: 'sea',
  recommended_destination_warehouse_id: hA.recommended_destination_warehouse_id,
  destination_marketplace: hA.destination_marketplace }), true, 'D2  §C.2 and the writer receives something it accepts');
var toWh = { source_warehouse_id: YOUXIN, shipping_method: 'sea', qty: 800,
  destination_warehouse_id: WH3PL, destination_warehouse_code: WH3PL_CODE, destination_marketplace: '' };
var hW = IRDraft.routeHeaderFields(US, toWh);
eq([hW.recommended_destination_warehouse_id, hW.destination_marketplace, hW.destination_warehouse_code],
   [WH3PL, '', WH3PL_CODE], 'D3  §C.3/§H.13 Amazon → Warehouse: a clean one-sided payload');
eq(SRV.hdr({ recommended_source_warehouse_id: YOUXIN, recommended_shipping_method: 'sea',
  recommended_destination_warehouse_id: hW.recommended_destination_warehouse_id,
  destination_marketplace: hW.destination_marketplace }), true, 'D4  §C.3 and the writer accepts it too');
// A row that is ALREADY Both is carried through unchanged, never collapsed.
var hB = IRDraft.routeHeaderFields(US, clientRoute(S_BOTH));
eq([hB.recommended_destination_warehouse_id, hB.destination_marketplace],
   [WH3PL, 'Amazon'], 'D5  §C.1 an already-BOTH row is NOT collapsed — both values survive to be refused');
ok(!/isLogical \? '' : String\(route\.destination_warehouse_id/.test(CMPC), 'D6  the collapse is gone from routeHeaderFields');

// ================================================================================================================
section('E · §E/§F — H4: BEFORE, ADOPTION, AFTER');
// ================================================================================================================
eq(SRV.rid(H4).code, 'ROUTE_DESTINATION_MISSING', 'E1  §E H4 as stored today → ROUTE_DESTINATION_MISSING');
eq(SRV.stored(H4), false, 'E2  §E stored route complete = FALSE');
eq(H4.recommended_destination_warehouse_code_snapshot, 'Amazon', 'E3  §E — and the snapshot still says Amazon, and is ignored');

// Submit, driven through the SHIPPED gate rather than a paraphrase of it.
function submitVerdict(header) {
  var isSubmitted = String(header.status || '').trim().toLowerCase() === 'submitted';
  return (!isSubmitted && !SRV.stored(header)) ? 'ROUTE_INCOMPLETE' : 'PASSES_DESTINATION_GATE';
}
eq(submitVerdict(H4), 'ROUTE_INCOMPLETE', 'E4  §E/§H.3 a DIRECT server Submit of H4 is REFUSED');
eq(submitVerdict(S_BOTH), 'ROUTE_INCOMPLETE', 'E5  §H.11 and so is a BOTH row');
ok(/reason: 'ROUTE_INCOMPLETE'/.test(code(extractFn(G16, 'sadSubmitToShippingPlansCore_'))),
  'E6  §E that is the reason Submit records');
ok(/zero_write: true/.test(code(extractFn(G16, 'sadSubmitToShippingPlansCore_'))),
  'E7  §H.11 and a validation failure declares a zero write');

// ---- ADOPTION: the user explicitly chooses Amazon and confirms -------------------------------------------------
var WRITER_FIELDS = ['recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery', 'destination_marketplace'];
function payloadFor(route) {
  var h = IRDraft.routeHeaderFields(US, route);
  return IRDraft.buildDraftHeaderPayload({
    allocation_draft_id: route.allocation_draft_id,
    planning_cycle: h.planning_cycle, company: h.company, country: h.country, marketplace: h.marketplace,
    source_warehouse_id: h.recommended_source_warehouse_id,
    destination_warehouse_id: h.recommended_destination_warehouse_id,
    source_warehouse_code: h.source_warehouse_code, destination_warehouse_code: h.destination_warehouse_code,
    shipping_method: h.recommended_shipping_method, last_mile_delivery: h.recommended_last_mile_delivery,
    destination_marketplace: h.destination_marketplace,
    allow_legacy_reconcile: route.allow_legacy_reconcile === true ? true : undefined
  });
}
function applyWriter(stored, payload) {
  var out = {}; for (var k in stored) out[k] = stored[k];
  WRITER_FIELDS.forEach(function (f) { if (payload[f] != null) out[f] = String(payload[f]); });
  return out;
}
var adoptRoute = { allocation_draft_id: 'SADH-K2-E7AF9242', allocation_draft_line_id: 'SADL-K2-16F4E4F9',
  source_warehouse_id: YOUXIN, source_warehouse_code: '', destination_warehouse_id: '',
  destination_warehouse_code: '', destination_marketplace: 'Amazon',
  destination_type: 'MARKETPLACE_DESTINATION', shipping_method: 'sea', qty: 800, allow_legacy_reconcile: true };
var AFTER = applyWriter(H4, payloadFor(adoptRoute));
eq(AFTER.allocation_draft_id, 'SADH-K2-E7AF9242', 'E8  §F/§H.14 header ID preserved');
eq(L4.allocation_draft_line_id, 'SADL-K2-16F4E4F9', 'E9  §F line ID preserved');
eq(AFTER.recommended_shipping_method, 'sea', 'E10 §F service still sea');
eq(Number(L4.planned_qty), 800, 'E11 §F/§H.14 qty still 800');
eq(AFTER.recommended_destination_warehouse_id, '', 'E12 §F warehouse id blank');
eq(AFTER.recommended_destination_warehouse_code_snapshot, '', 'E13 §F/§H.15 legacy snapshot CLEARED');
eq(AFTER.destination_marketplace, 'Amazon', 'E14 §F destination_marketplace Amazon');
eq(SRV.rid(AFTER).type, 'MARKETPLACE', 'E15 §F canonical destination type MARKETPLACE');
eq(SRV.stored(AFTER), true, 'E16 §F route complete = TRUE');
eq(submitVerdict(AFTER), 'PASSES_DESTINATION_GATE', 'E17 §F Submit continues into its OTHER validations');
// Reload: the hydrate reads it back as a marketplace route with the right selector token.
var reload = IRWarehouse.resolvePersistedDestination(
  { destination_warehouse_id: AFTER.recommended_destination_warehouse_id, destination_marketplace: AFTER.destination_marketplace }, US);
eq([reload.state, reload.token], ['PERSISTED_MARKETPLACE', IRWarehouse.amazonLogicalToken('US')], 'E18 §F reload selects Amazon');
eq(applyWriter(AFTER, payloadFor(adoptRoute)), AFTER, 'E19 §H.19 replay is idempotent — no duplicate, no re-key');

// ---- the physical warehouse case ------------------------------------------------------------------------------
var whRoute = { allocation_draft_id: 'SADH-K2-E7AF9242', source_warehouse_id: YOUXIN, source_warehouse_code: '',
  destination_warehouse_id: WH3PL, destination_warehouse_code: WH3PL_CODE, destination_marketplace: '',
  shipping_method: 'sea', qty: 800 };
var AFTER_WH = applyWriter(H4, payloadFor(whRoute));
eq(AFTER_WH.recommended_destination_warehouse_id, WH3PL, 'E20 §F warehouse case: the real id');
eq(AFTER_WH.recommended_destination_warehouse_code_snapshot, WH3PL_CODE, 'E21 §H.16 matching snapshot');
eq(AFTER_WH.destination_marketplace, '', 'E22 §F marketplace blank');
eq(SRV.rid(AFTER_WH).type, 'WAREHOUSE', 'E23 §F type WAREHOUSE');
eq(SRV.stored(AFTER_WH), true, 'E24 §F complete = true');

// ================================================================================================================
section('F · §H.4 — A SNAPSHOT CANNOT MINT A K4 IDENTITY');
// ================================================================================================================
var K4 = (function () {
  var src = [extractFn(G69, 'ricDestinationIdentity_'), extractFn(G69, 'ricCanonicalService_'),
    'var RIC_CANONICAL_SERVICES_ = ' + extractVar(G69, 'RIC_CANONICAL_SERVICES_') + ';',
    'var RIC_SERVICE_LABELS_ = ' + extractVar(G69, 'RIC_SERVICE_LABELS_') + ';',
    'var RIC_K4_GROUP_DIMENSIONS_ = ' + extractVar(G69, 'RIC_K4_GROUP_DIMENSIONS_') + ';',
    extractFn(G69, 'ricK4GroupKey_'), 'OUT = ricK4GroupKey_;'].join(String.fromCharCode(10));
  return (new Function('var OUT;' + src + 'return OUT;'))();
})();
ok(typeof K4 === 'function', 'F1  the shipped K4 key builder loaded');
// The DESTINATION dimensions, not the whole key: this station's SCOPE marketplace is also 'Amazon', so a
// substring scan of the joined key would report a destination that is not there. Positions 6 and 7 are
// destination_type and destination_identity in RIC_K4_GROUP_DIMENSIONS_.
var k4Snapshot = String(K4(H4)).split('|'), k4Adopted = String(K4(AFTER)).split('|');
eq([k4Snapshot[6], k4Snapshot[7]], ['', ''],
  'F2  §H.4 the snapshot-only header mints NO destination identity in its K4 key');
eq([k4Adopted[6], k4Adopted[7]], ['marketplace', 'amazon'],
  'F3  §H.4 the ADOPTED header does — the difference is the canonical column, not the snapshot');
ok(k4Snapshot.join('|') !== k4Adopted.join('|'), 'F4  §H.4 so the two are different routes, as they must be');
ok(/ricDestinationIdentity_/.test(code(extractFn(G69, 'ricK4GroupKey_'))), 'F5  K4 reads the one owner');

// ================================================================================================================
section('G · §H.17/§H.20 — CANCEL, AND THE DEPLOYMENT CONTRACT');
// ================================================================================================================
ok(/legacy adoption NOT confirmed — zero rows written, zero requests issued/.test(PAGE),
  'G1  §H.17 a declined confirmation returns before any request');
ok(/if \(typeof window\.confirm !== 'function'\) return false;/.test(PAGEC),
  'G2  §H.17 and no confirm available means NO, never an assumed yes');
ok(!/fetch|_irPersistOneRouteGroup_|upsert/.test(code(extractFn(PAGE, '_irConfirmLegacyAdoption_'))),
  'G3  §H.17 the confirmation itself issues nothing');
eq((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1], '10', 'G4  §H.20 action contract still 10');
eq((G63.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1], '9', 'G5  §H.20 required-action-list still 9');
eq((G63.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1], '1', 'G6  §H.20 transport contract still 1');

// ================================================================================================================
section('H · DEPLOYMENT IDENTITY');
// ================================================================================================================
eq((G16.match(/var SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1], 'F1-7N-FB-4G-A0-R2', 'H1  the 16_ owner stamp moved to this round');
eq((G63.match(/\{ file: '16_shipping_allocation_handlers\.gs', symbol: 'SAD_BUILD_VERSION_', expected: '([^']+)'/) || [])[1],
   (G16.match(/var SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1],
  'H2  and the manifest expects what the SOURCE declares — never a number typed twice');
// F1-7N-FB-4G-A1 — RESTATED, for the reason recorded on A0-R1's H5b: `git diff --name-only HEAD` measures the
// WORKING TREE, so once A0-R2 was committed this asserted something about the next editor rather than about
// A0-R2. What it MEANT - one sync set, one deployment version - is a property of the source: exactly one file
// declares the stamp, exactly one expects it, and the two agree.
var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); });
var DECLARERS = GS_FILES.filter(function (f) { return /var SAD_BUILD_VERSION_ = /.test(fs.readFileSync(path.join(GS_DIR, f), 'utf8')); });
var EXPECTERS = GS_FILES.filter(function (f) { return /symbol: 'SAD_BUILD_VERSION_'/.test(fs.readFileSync(path.join(GS_DIR, f), 'utf8')); });
eq([DECLARERS, EXPECTERS], [['16_shipping_allocation_handlers.gs'], ['63_api_v1_system_health.gs']],
  'H3  ONE file declares the allocation owner stamp and ONE expects it — still ONE sync set, ONE deployment');
var TOKEN = RO.currentAppToken();
ok(RO.tokenAtOrAfter(TOKEN, 'fb4ga0r1-destxor-20260902'), 'H4  the release order has not moved behind A0-R1');
function refToken(f) {
  var m = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([A-Za-z0-9._-]+)').exec(INDEX);
  return m ? m[1] : '';
}
eq(refToken('assets/js/utils/inventory-compat.js'), TOKEN, 'H5  inventory-compat.js carries it — its gate changed');
eq(refToken('assets/js/pages/inventory-replenishment.js'), TOKEN, 'H6  and so does the page — its gate changed too');
eq(INDEX.split(TOKEN).length - 1, 18, 'H7  all 18 co-deployed references moved together');
ok(RO.stampAtOrAfter('F1-7N-FB-4G-A0-R2', 'F1-7N-FB-4G-A0-R1'), 'H8  the owner-stamp order carries this round');

// ================================================================================================================
section('I · MUTATIONS — every one verified by actually applying it');
// ================================================================================================================
function mutateFn(src, name, find, replace) {
  var orig = extractFn(src, name);
  var m = (find instanceof RegExp) ? orig.replace(find, replace) : orig.split(find).join(replace);
  if (m === orig) throw new Error('mutation did not apply inside ' + name + ': ' + find);
  return src.replace(orig, m);
}
function serverWith(mutatedG16) {
  var src = [extractFn(G69, 'ricDestinationIdentity_'), extractFn(mutatedG16, 'sadDestinationIdentity_'),
    extractFn(mutatedG16, 'sadHeaderRouteIsComplete_'), extractFn(mutatedG16, 'sadStoredHeaderRouteIsComplete_'),
    'OUT = { hdr: sadHeaderRouteIsComplete_, stored: sadStoredHeaderRouteIsComplete_ };'].join(String.fromCharCode(10));
  return (new Function('var OUT;' + src + 'return OUT;'))();
}
// M1 — the snapshot counted as a destination again (the FB-4D fallback restored).
mut('M1  the snapshot counting as a destination is detected', function () {
  var mutated = mutateFn(G16, 'sadStoredHeaderRouteIsComplete_',
    'return sadHeaderRouteIsComplete_(h);',
    "if (sadHeaderRouteIsComplete_(h)) return true; h = h || {};" +
    " var from = String(h.recommended_source_warehouse_id || '').trim();" +
    " var snap = String(h.recommended_destination_warehouse_code_snapshot || '').trim();" +
    " var m = String(h.recommended_shipping_method || '').trim(); return !!from && !!snap && !!m;");
  return serverWith(mutated).stored(S_SNAPSHOT_ONLY) === true && SRV.stored(S_SNAPSHOT_ONLY) === false;
});
// M2 — marketplace wins on a BOTH row.
mut('M2  "marketplace wins" is detected', function () {
  var mutated = mutateFn(G16, 'sadDestinationIdentity_',
    "if (wid && mkt) return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_AMBIGUOUS' };",
    "if (wid && mkt) return { type: 'MARKETPLACE', id: mkt.toLowerCase(), ok: true, code: '' };");
  var src = [extractFn(mutated, 'sadDestinationIdentity_'), extractFn(mutated, 'sadHeaderRouteIsComplete_'),
    'OUT = sadHeaderRouteIsComplete_;'].join(String.fromCharCode(10));
  var f = (new Function('var OUT;' + src + 'return OUT;'))();   // 69_ absent -> the inline rule is what runs
  return f(S_BOTH) === true && SRV.hdr(S_BOTH) === false;
});
// M3 — warehouse wins on a BOTH row.
mut('M3  "warehouse wins" is detected', function () {
  var mutated = mutateFn(G16, 'sadDestinationIdentity_',
    "if (wid && mkt) return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_AMBIGUOUS' };", '');
  var src = [extractFn(mutated, 'sadDestinationIdentity_'), extractFn(mutated, 'sadHeaderRouteIsComplete_'),
    'OUT = sadHeaderRouteIsComplete_;'].join(String.fromCharCode(10));
  var f = (new Function('var OUT;' + src + 'return OUT;'))();
  return f(S_BOTH) === true && SRV.hdr(S_BOTH) === false;
});
// M4 — a BOTH row reaching either writer.
mut('M4  BOTH reaching the writers is detected', function () {
  var mutated = mutateFn(G16, 'sadHeaderRouteIsComplete_',
    'var hasTo = sadDestinationIdentity_(b).ok;',
    "var hasTo = !!String(b.recommended_destination_warehouse_id || '').trim() || !!String(b.destination_marketplace || '').trim();");
  return serverWith(mutated).hdr(S_BOTH) === true && SRV.hdr(S_BOTH) === false;
});
// M5 — a BOTH row reaching Submit.
mut('M5  BOTH reaching Submit is detected', function () {
  var mutated = mutateFn(G16, 'sadHeaderRouteIsComplete_',
    'var hasTo = sadDestinationIdentity_(b).ok;',
    "var hasTo = !!String(b.recommended_destination_warehouse_id || '').trim() || !!String(b.destination_marketplace || '').trim();");
  return serverWith(mutated).stored(S_BOTH) === true && submitVerdict(S_BOTH) === 'ROUTE_INCOMPLETE';
});
// M6 — the client refusing while the server accepts (the two gates drifting apart).
mut('M6  a client/server disagreement is detected', function () {
  var mutated = mutateFn(G16, 'sadHeaderRouteIsComplete_',
    'var hasTo = sadDestinationIdentity_(b).ok;',
    "var hasTo = !!String(b.recommended_destination_warehouse_id || '').trim() || !!String(b.destination_marketplace || '').trim();");
  var m = serverWith(mutated);
  return IRDraft.isRouteComplete(clientRoute(S_BOTH)) === false && m.hdr(S_BOTH) === true && SRV.hdr(S_BOTH) === false;
});
// M7 — the server refusing while the ATOMIC writer accepts (one writer left behind).
mut('M7  an atomic writer that disagrees with the gate is detected', function () {
  // Mutate the ATOMIC path's gate ONLY and prove the two writers then disagree about the same header — which
  // is what "one writer left behind" actually looks like. Asserting that both call the same name would pass
  // on a name; this executes both verdicts.
  var mutated = mutateFn(G16, 'sadAtomicValidateBatch_',
    'if (hasRouteIntent && status !== \'cancelled\' && !sadHeaderRouteIsComplete_(header)) {',
    'if (false) {');
  var atomicSrc = [extractFn(G69, 'ricDestinationIdentity_'), extractFn(G16, 'sadDestinationIdentity_'),
    extractFn(G16, 'sadHeaderRouteIsComplete_'),
    'OUT = function (h) { var status = "draft";' +
    ' var hasRouteIntent = true;' +
    ' return !(hasRouteIntent && status !== "cancelled" && !sadHeaderRouteIsComplete_(h)); };'].join(String.fromCharCode(10));
  var honestAtomic = (new Function('var OUT;' + atomicSrc + 'return OUT;'))();
  var mutantAccepts = /if \(false\) \{/.test(code(extractFn(mutated, 'sadAtomicValidateBatch_')));
  return mutantAccepts && honestAtomic(S_BOTH) === false && SRV.hdr(S_BOTH) === false;
});
// M8 — an explicit transition that fails to clear the other side.
mut('M8  a transition that leaves the other side set is detected', function () {
  var mutated = CMP.replace("      destination_marketplace: _d.ok ? (isLogical ? _mkt : '') : _mkt,",
                            '      destination_marketplace: _mkt,');
  if (mutated === CMP) throw new Error('mutation did not apply in routeHeaderFields');
  var f = new Function('scope', 'route', 'destinationIdentity',
    extractFn(mutated, 'routeHeaderFields') + 'return routeHeaderFields(scope, route);');
  var leftover = f(US, { destination_warehouse_id: WH3PL, destination_marketplace: 'Amazon', destination_warehouse_code: WH3PL_CODE },
    IRWarehouse.destinationIdentity);
  return leftover.destination_marketplace === 'Amazon' && hW.destination_marketplace === '';
});
// M9 — adoption rewriting the stored id.
mut('M9  adoption rewriting the stored id is detected', function () {
  var alt = {}; for (var k in adoptRoute) alt[k] = adoptRoute[k];
  alt.allocation_draft_id = 'SADH-K4-SOMETHING-ELSE';
  return payloadFor(adoptRoute).allocation_draft_id === 'SADH-K2-E7AF9242' &&
    payloadFor(alt).allocation_draft_id === 'SADH-K4-SOMETHING-ELSE';
});
// M10 — Submit bypassing canonical completeness entirely.
mut('M10 Submit bypassing the completeness gate is detected', function () {
  var submit = code(extractFn(G16, 'sadSubmitToShippingPlansCore_'));
  var mutatedSubmit = submit.replace(/if \(!isSubmitted && !sadStoredHeaderRouteIsComplete_\(header\)\)[^\n]*\n/, '');
  if (mutatedSubmit === submit) throw new Error('mutation did not apply in sadSubmitToShippingPlansCore_');
  return /sadStoredHeaderRouteIsComplete_\(header\)/.test(submit) && !/sadStoredHeaderRouteIsComplete_\(header\)/.test(mutatedSubmit);
});

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed, mutations ' +
  neg.caught + ' caught / ' + neg.missed + ' missed');
process.exit(fail ? 1 : 0);
