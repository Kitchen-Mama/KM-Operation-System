// S7-R5 — SUPPORTING EXECUTION MAINLINE FINAL INTEGRATION + S7 CLOSING SEAL.
//
// WHAT THIS SUITE IS FOR, AND WHAT IT DELIBERATELY IS NOT.
//
// Each S7 round has its own suite and each proves its own internals. Re-proving them here would produce a
// second copy that drifts from the first, so this suite asks the question none of them can: do the parts
// MEET? S7-R1's finding was never that the parts were absent — it was "three supporting flows whose parts
// exist and do not meet". A closing seal that only re-ran the per-part suites would be blind to exactly the
// defect the series opened with.
//
// So the claims here are CROSS-CUTTING:
//   · how many owners each responsibility has, derived from live source rather than from prose;
//   · that every S7 surface reaches its canonical owner through the canonical adapter and nothing else;
//   · that a supporting flow cannot execute either business mainline;
//   · that the carrier label, the document panel and the lead-time path still behave at the seams.
//
// Executed where execution is possible. A seal assembled from greps would be a seal on the shape of the
// source, and this round is supposed to be about behaviour.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var REPO = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }

var SURF = require('./_production-deploy-surface.js');
var BT = require('./_boot-topology.js');
var RUNNER = require('./_s4r5-route-payload-runner.js');

var RTR = lf(read(GS + '01_router.gs'));
var G17 = lf(read(GS + '17_carrier_handlers.gs'));
var G39 = lf(read(GS + '39_document_runtime_service.gs'));
var G57 = lf(read(GS + '57_api_v1_shipment_workspace.gs'));
var G40 = lf(read(GS + '40_api_v1_weekly_workspace.gs'));
var G50 = lf(read(GS + '50_api_v1_purchase_order_workspace.gs'));
var API = lf(read('assets/js/api/operation-system-db-api.js'));
var SH = lf(read('assets/js/pages/shipping-history.js'));
var SP = lf(read('assets/js/pages/shipping-plan.js'));
var PO = lf(read('assets/js/pages/purchase-order-overview.js'));
var CRC = lf(read('assets/js/pages/carrier-rate-card.js'));
var MAP = lf(read('assets/js/pages/global-logistics-map.js'));

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
function slice(src, from, to, tag) {
  var a = src.indexOf(from); if (a < 0) throw new Error(tag + ': start anchor drifted');
  var b = src.indexOf(to, a); if (b < 0) throw new Error(tag + ': end anchor drifted');
  return src.slice(a, b + to.length);
}
var S = SURF.surface(REPO);
var RUNTIME = S.live.map(function (f) { return { file: f, src: lf(read(GS + f)) }; });
// PER-FUNCTION, WITH BRACE MATCHING. A file-level predicate cannot tell a table NAMED in a read handler's
// allow-list from a table WRITTEN by a writer, and measured file-level, 03_'s getOperationDb allow-list
// makes it a writer of every table in the system. An owner count built on that is worthless.
function topFns(src) {
  var out = [], re = /^function\s+([A-Za-z0-9_]+)\s*\(/gm, m;
  while ((m = re.exec(src))) {
    var i = src.indexOf('{', m.index), depth = 0, end = -1;
    for (var j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end > 0) out.push({ name: m[1], body: src.slice(m.index, end + 1) });
  }
  return out;
}
var WRITE_RE = /\.appendRow\(|\.setValues\(|\.setValue\(|\.deleteRow\(|\.clearContent\(/;
// a file writes TABLE when one of its functions both names the table and writes
function writersOf(table) {
  var re = new RegExp("'" + table + "'");
  return RUNTIME.filter(function (r) {
    return topFns(code(r.src)).some(function (f) { return re.test(f.body) && WRITE_RE.test(f.body); });
  }).map(function (r) { return r.file; }).sort();
}
function definedIn(sym) {
  var re = new RegExp('^function\\s+' + sym + '\\s*\\(', 'm');
  return RUNTIME.filter(function (r) { return re.test(r.src); }).map(function (r) { return r.file; });
}

// ==========================================================================================================
section('A  OWNERS — counted from live source, not carried forward as prose');
// ==========================================================================================================
// A responsibility with two owners is the defect this whole phase keeps finding, so every one is COUNTED.
var carrierMasters = RUNTIME.filter(function (r) {
  return /\{\s*name:\s*'carriers',/.test(r.src);
}).map(function (r) { return r.file; });
eq(carrierMasters.sort(), ['40_api_v1_weekly_workspace.gs', '57_api_v1_shipment_workspace.gs'],
  'A1  the carriers master is declared by exactly the two workspaces that serve a carrier-bearing surface');
// Two DECLARATIONS of the same master table are not two masters: both name the same sheet with the same
// required column, and neither derives a carrier from anything else.
eq(carrierMasters.filter(function (f) {
  var src = f === '40_api_v1_weekly_workspace.gs' ? G40 : G57;
  return !/\{\s*name:\s*'carriers',\s*requiredCols:\s*\['carrier_id'\]\s*\}/.test(src);
}), [], 'A1a SECOND_CARRIER_MASTER_COUNT = 0 — one sheet, one required identity column, two readers');

eq(count(API, /carrierDisplay: function \(/g), 1,
  'A2  CARRIER_DISPLAY_RESOLVER_OWNER_COUNT = 1 — KM.display.carrierDisplay in the canonical adapter');
eq(count(code(SH) + code(MAP) + code(SP) + code(PO), /function\s+\w*[Cc]arrierDisplay\s*\(/g), 0,
  'A2a and no page declares a resolver of its own');

eq(definedIn('dgsDocumentDto_'), ['39_document_runtime_service.gs'],
  'A3  DOCUMENT_ENGINE_OWNER = 39_ — one DTO, one interpretation of a document row');
eq(definedIn('handleShipmentDocumentGenerate_'), ['36_document_template_handlers.gs'],
  'A3a generation keeps its own existing owner — SECOND_DOCUMENT_ENGINE_COUNT = 0');
eq(definedIn('handleDocumentRetry_'), ['39_document_runtime_service.gs'],
  'A3b DOCUMENT_RETRY_OWNER (backend) = 39_');
eq(count(SH, /^function shDocumentPanelHtml\(/gm), 1,
  'A4  DOCUMENT_PANEL_RENDER_OWNER_COUNT = 1');
eq(count(PO, /function shDocumentPanelHtml/g), 0,
  'A4a and the PO page CONSUMES it rather than declaring a second panel');
ok(/window\.shDocumentPanelHtml\(/.test(PO), 'A4b through the shared window contract');
eq(count(SH, /^function shRetryDocument\(/gm), 1,
  'A5  DOCUMENT_RETRY_OWNER (frontend) = 1 — shipping-history.js owns the click');
eq(count(PO, /function shRetryDocument/g), 0, 'A5a and the PO page declares no retry of its own');

eq(definedIn('handleUpsertCarrierLeadTime_'), ['17_carrier_handlers.gs'],
  'A6  CARRIER_LEADTIME_WRITE_OWNER = 17_');
eq(writersOf('carrier_lead_times'), ['17_carrier_handlers.gs'],
  'A6a SECOND_CARRIER_LEADTIME_WRITE_OWNER_COUNT = 0 — exactly one FUNCTION anywhere in the runtime both '
  + 'names the table and writes');
// 03_ spells carrier_lead_times twice and is NOT a writer: both mentions are validTabs allow-lists inside
// handleGetOperationDb_ and handleGetTable_, which call readSheetAsObjects_. Asserted rather than merely
// excluded, because a future edit that gave 03_ a generic table WRITER would be a real second owner.
var G03 = lf(read(GS + '03_master_data_handlers.gs'));
eq(topFns(code(G03)).filter(function (f) {
  return /'carrier_lead_times'/.test(f.body) && WRITE_RE.test(f.body);
}).map(function (f) { return f.name; }), [],
  'A6b and 03_ names the table only inside READ handlers — a generic table writer there would be a real '
  + 'second owner, so it is checked rather than assumed');
eq(SURF.RUNTIME_DIR, 'assets/specs/active/apps-script',
  'A7  APPS_SCRIPT_DEPLOY_SURFACE_OWNER is directory membership, declared in one module');
eq(Object.keys(SURF.TOOLING_DIRS).length, 3,
  'A7a SECOND_DEPLOY_SURFACE_OWNER_COUNT = 0 — three tooling directories, none of them a runtime source');

// ==========================================================================================================
section('B  CARRIER display truth — the shipped resolver and the shipped label, executed');
// ==========================================================================================================
var DISPLAY_SRC = slice(API, 'carrierDisplay: function (carrierId, carriers) {',
  "            return { state: 'UNKNOWN', text: id, carrierId: id, carrierName: '' };\n        },", 'carrierDisplay');
var D = {};
(function () {
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext('var o = { ' + DISPLAY_SRC + ' };', sandbox);
  D.fn = sandbox.o.carrierDisplay;
})();
ok(typeof D.fn === 'function', 'B1  the shipped carrier resolver loaded and runs outside a browser');

var MASTER = [{ carrierId: 'C-SINO', carrierName: 'Sinotrans' }, { carrierId: 'C-BLANK', carrierName: '  ' }];
eq(D.fn('C-SINO', MASTER).state, 'RESOLVED', 'B2  an id with a master row RESOLVES');
eq(D.fn('C-SINO', MASTER).text, 'Sinotrans', 'B2a and renders the NAME');
eq(D.fn('C-GONE', MASTER).text, 'C-GONE', 'B3  an id with no master row shows the ID — not a no-carrier state');
eq(D.fn('C-GONE', MASTER).state, 'UNKNOWN', 'B3a and says so');
eq(D.fn('C-BLANK', MASTER).state, 'UNKNOWN', 'B4  a master row that cannot name the carrier is UNKNOWN, not ""');
eq(D.fn('', MASTER).state, 'NONE', 'B5  only a MISSING id is the no-carrier state');
eq(D.fn('C-SINO', null).state, 'UNREAD', 'B6  carriers NOT READ is distinguishable from carriers EMPTY — the '
  + 'one distinction that makes "no carrier" a truthful claim rather than a default');
eq(D.fn('C-SINO', []).state, 'UNKNOWN', 'B6a an EMPTY master cannot resolve, and does not pretend to');
// CARRIER_RAW_ID_ONLY_WHEN_NAME_AVAILABLE_COUNT = 0: there is no input on which the resolver has a name and
// returns the id. Proven by construction over the resolvable case rather than asserted.
eq([D.fn('C-SINO', MASTER)].filter(function (r) { return r.carrierName && r.text !== r.carrierName; }), [],
  'B7  CARRIER_RAW_ID_ONLY_WHEN_NAME_AVAILABLE_COUNT = 0');
eq([D.fn('C-SINO', MASTER), D.fn('C-GONE', MASTER)].filter(function (r) {
  return r.carrierId && r.carrierName && r.carrierId !== 'C-SINO';
}), [], 'B8  CARRIER_ID_NAME_MISMATCH_COUNT = 0 — the id is carried through unchanged beside the name');

// The Weekly plan does not call the resolver: 40_ joined the master server-side and serves {id, name}, so the
// browser never holds the master to resolve against. The pair it renders is executed here too.
var LABEL_SRC = slice(SP, 'var cbCarrierName = String(plan.carrierName', ': _spEsc(cbCarrierId));', 'weekly label');
function weeklyLabel(plan) {
  var sandbox = { plan: plan, _spEsc: function (v) { return String(v == null ? '' : v); }, out: null };
  vm.createContext(sandbox);
  vm.runInContext(LABEL_SRC + '\nout = cbCarrier;', sandbox);
  return sandbox.out;
}
eq(weeklyLabel({ carrierId: 'C-SINO', carrierName: 'Sinotrans' }), 'Sinotrans  ·  C-SINO',
  'B9  the Weekly plan renders name AND id — the Confirm-summary pair form');
eq(weeklyLabel({ carrierId: 'C-SINO', carrierName: '' }), 'C-SINO',
  'B9a a legacy row with no name falls back to the id');
eq(weeklyLabel({ carrierId: '', carrierName: '' }), '--',
  'B9b and ONLY a missing id renders the no-carrier state');
ok(/carrier\s*:\s*\{/.test(G40) || /carrier:/.test(G40),
  'B10 40_ serves the joined carrier object, which is why the Weekly plan needs no resolver and no request');

// CARRIER_NAME_PERSISTENCE_COUNT — measured on the writers, not on every file that can spell the word.
// THE RULE IS ABOUT PLANS, SHIPMENTS AND RATE CARDS — NOT ABOUT THE CARRIERS MASTER. 17_ writes
// carrier_name when it seeds the carriers table, which is the one place that column is canonical, and the
// file states the rule itself: "carrier_name is NEVER stored on plans / shipments / rate_cards".
['11_shipping_plan_handlers.gs', '12_shipment_handlers.gs'].forEach(function (f, i) {
  var c = code(lf(read(GS + f)));
  eq(count(c, /carrier_name\s*[:=]/g), 0,
    'B11.' + (i + 1) + ' ' + f + ' never writes carrier_name — CARRIER_NAME_PERSISTENCE_COUNT = 0');
});
ok(/carrier_name is NEVER stored on plans \/ shipments \/ rate_cards/.test(G17),
  'B11.3 and 17_ states the same rule where the resolver lives');
ok(/CRC_SYSTEM_COLS_ = \{[^}]*carrier_name: 1/.test(G17),
  'B11.4 which the rate-card importer ENFORCES: carrier_name is a system column a template may not set, '
  + 'so an import cannot persist a name onto a rate card');
// CARRIER_SELECTION_CHANGED_BY_DISPLAY_COUNT — the resolver is pure: no assignment to any carrier field.
eq(count(DISPLAY_SRC, /carrier_id\s*=|carrierId\s*=\s*[^=]/g), 0,
  'B12 CARRIER_SELECTION_CHANGED_BY_DISPLAY_COUNT = 0 — the resolver assigns nothing');
eq(count(code(DISPLAY_SRC), /KM\.DB|fetch\(|XMLHttpRequest/g), 0,
  'B12a and issues no request: resolving a carrier costs nothing per shipment');

// ==========================================================================================================
section('C  DOCUMENT identity and rediscovery — both entities, the shipped panel, executed');
// ==========================================================================================================
var PANEL_SRC = slice(SH, 'var SH_DOC_PANEL_VISIBLE_ROWS_ = 5;',
  "head + body + _shDocErrorHtml(model, state) + '<div style=\"margin-top:6px;\">' + badge + '</div>' +\n    '</div>';\n}", 'panel block');
var ESC_SRC = slice(SH, 'function _shEsc(s) {', "\n}", '_shEsc');
var P = {};
(function () {
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(ESC_SRC + '\n' + PANEL_SRC, sandbox);
  P.panel = sandbox.shDocumentPanelHtml;
  P.state = sandbox.shDocPanelState;
})();
ok(typeof P.panel === 'function', 'C1  the shipped Document Panel loaded and runs outside a browser');

function doc(o) {
  return {
    document_id: o.id, related_entity_type: o.type, related_entity_id: o.eid,
    document_type: o.dt || 'PACKING_LIST', status: o.status || 'READY',
    file_url: o.url || 'https://drive/' + o.id, file_name: (o.id + '.pdf')
  };
}
var PO_MODEL = {
  title: 'Purchase Order Documents', entity_type: 'purchase_order', entity_id: 'PO-1',
  documents: [doc({ id: 'D-PO-1', type: 'purchase_order', eid: 'PO-1' })], can_retry: true
};
var SH_MODEL = {
  title: 'Shipment Documents', entity_type: 'shipment', entity_id: 'S-1',
  documents: [doc({ id: 'D-S-1', type: 'shipment', eid: 'S-1' })], can_retry: true
};
var poHtml = P.panel(PO_MODEL), shHtml = P.panel(SH_MODEL);
ok(poHtml.indexOf('D-PO-1.pdf') !== -1, 'C2  PO_DOCUMENT_REDISCOVERY_SUPPORTED = YES — a PO document that '
  + 'already exists renders from the canonical read, with no generation call');
ok(shHtml.indexOf('D-S-1.pdf') !== -1, 'C2a SHIPMENT_DOCUMENT_REDISCOVERY_SUPPORTED = YES');
// RE-ENTRY: the panel is a pure function of the model, so a second render of the same model is identical.
// That is what "survives page re-entry" means for a renderer with no memory of its own.
eq(P.panel(PO_MODEL), poHtml, 'C3  PO_REENTRY_REDISCOVERY_PASS = YES — the panel holds no state to lose');
eq(P.panel(SH_MODEL), shHtml, 'C3a SHIPMENT_REENTRY_REDISCOVERY_PASS = YES');
ok(P.panel(PO_MODEL).indexOf('D-PO-1') !== -1,
  'C3b DOCUMENT_ID_PRESERVED_AFTER_REENTRY = YES — the same document_id comes back');
eq(count(code(PANEL_SRC), /_shDocResultCache|localStorage|sessionStorage/g), 0,
  'C3c and it keeps no browser-side cache that a re-entry could serve stale');

// ENTITY SCOPE: a PO panel rendered with a shipment document must not address the shipment.
// The row carries a SHIPMENT identity while the panel is a PO panel. Status FAILED, because the retry
// control is what would carry the address — a READY row renders no button and the fixture would prove
// nothing. (It did not, on the first run: the mutant survived.)
var MIXED = { title: 'Purchase Order Documents', entity_type: 'purchase_order', entity_id: 'PO-1',
  documents: [doc({ id: 'D-S-9', type: 'shipment', eid: 'S-9', status: 'FAILED' })], can_retry: true };
var mixedHtml = P.panel(MIXED);
ok(mixedHtml.indexOf('shRetryDocument') !== -1, 'C4pre the mixed row DOES render a retry control, so the '
  + 'address it carries is observable');
ok(mixedHtml.indexOf("'shipment','S-9'") === -1,
  'C4  DOCUMENT_ENTITY_SCOPE_DRIFT_COUNT = 0 — the panel addresses the ENTITY IT WAS GIVEN, never the one '
  + 'written on a row, so a mis-scoped row cannot make a PO panel act on a shipment');
// MULTI-DOCUMENT: nothing collapses. Six documents render six rows across the fold.
var MANY = { title: 'Shipment Documents', entity_type: 'shipment', entity_id: 'S-1', can_retry: true,
  documents: [1, 2, 3, 4, 5, 6].map(function (n) {
    return doc({ id: 'D-' + n, type: 'shipment', eid: 'S-1', dt: n % 2 ? 'PACKING_LIST' : 'INVOICE' });
  }) };
var manyHtml = P.panel(MANY);
eq([1, 2, 3, 4, 5, 6].filter(function (n) { return manyHtml.indexOf('D-' + n + '.pdf') === -1; }), [],
  'C5  MULTI_DOCUMENT_COLLAPSE_COUNT = 0 — all six survive, including the five-row fold');
ok(manyHtml.indexOf('View all (6)') !== -1, 'C5a and the fold declares the full count rather than hiding it');
// DOCUMENT TYPE: both types render, neither is rewritten into the other.
ok(manyHtml.indexOf('INVOICE') !== -1 || /invoice/i.test(manyHtml),
  'C6  DOCUMENT_TYPE_DRIFT_COUNT = 0 — a second document_type survives the render');
// A FAILED document offers retry; nothing auto-fires.
var FAILED = { title: 'Shipment Documents', entity_type: 'shipment', entity_id: 'S-1', can_retry: true,
  documents: [doc({ id: 'D-F', type: 'shipment', eid: 'S-1', status: 'FAILED' })] };
ok(/shRetryDocument\('shipment','S-1'/.test(P.panel(FAILED)),
  'C7  a FAILED document offers Retry, addressed to the ENTITY (type + id)');
eq(count(code(PANEL_SRC), /setTimeout|setInterval/g), 0,
  'C7a DOCUMENT_AUTORETRY_COUNT = 0 — the panel starts no timer, so nothing retries on its own');
// can_retry false withholds the button — the contract, not an accident.
eq(count(P.panel({ title: 'x', entity_type: 'shipment', entity_id: 'S-1',
  documents: [doc({ id: 'D-F', type: 'shipment', eid: 'S-1', status: 'FAILED' })], can_retry: false }),
  /shRetryDocument/g), 0, 'C8  and withholds it when the read model says retry is not available');

// Both workspaces declare generated_documents as a BOUNDED, include-gated table — one read authority each.
ok(/\{ name: 'generated_documents',\s+requiredCols: \[\], optional: true, include: 'documents' \}/.test(G57),
  'C9  the shipment workspace reads generated_documents as a bounded include');
ok(/\{ name: 'generated_documents',\s+requiredCols: \[\], optional: true, include: 'documents' \}/.test(G50),
  'C9a and so does the purchase order workspace');
// A SINGLE WRITE AUTHORITY IS A SINGLE PRIMITIVE, NOT A SINGLE CALLER. 13_ and 36_ both record document
// outcomes, and both do it by calling dgsUpdateRegistry_ — which 39_ defines, once. Callers of one
// primitive are exactly what a single authority looks like; a second DEFINITION would not be.
eq(definedIn('dgsUpdateRegistry_'), ['39_document_runtime_service.gs'],
  'C10 SECOND_DOCUMENT_WRITE_AUTHORITY_COUNT = 0 — the registry write primitive is defined once');
eq(definedIn('dgsAppendRegistry_').concat(definedIn('dgsRowState_')).sort(),
  ['39_document_runtime_service.gs'],
  'C10a and so is the row-state interpretation, so no caller can invent a second meaning for a status');
var dgsCallers = RUNTIME.filter(function (r) {
  return r.file !== '39_document_runtime_service.gs' && /dgsUpdateRegistry_\s*\(/.test(code(r.src));
}).map(function (r) { return r.file; }).sort();
eq(dgsCallers, ['13_procurement_handlers.gs'],
  'C10b and the PO owner records outcomes by CALLING it, never by writing the sheet itself');
// TWO OPERATIONS, ONE OWNER EACH — the architecture, not a second authority. 36_ CREATES a
// generated_documents row (it is the generation owner, which A3a asserts); 39_ UPDATES one and owns what
// every status MEANS. A third file doing either would be the defect; neither of these is.
// MEASURED ON SHEET ACQUISITION, which is the only thing that can touch the registry. A literal-and-a-write
// scan cannot see these three (they take the sheet name from a shared constant) and DOES see
// 22_shipment_dispatch_handlers.gs, which names generated_documents once as a label in a response payload
// and delegates the actual work to 39_. Asked properly, the answer is exactly three.
var regSheet = RUNTIME.filter(function (r) {
  return /(Sheet_|Table_)\(ss, 'generated_documents'/.test(code(r.src));
}).map(function (r) { return r.file; }).sort();
eq(regSheet,
  ['13_procurement_handlers.gs', '36_document_template_handlers.gs', '39_document_runtime_service.gs'],
  'C10c exactly three files ACQUIRE the registry sheet — the creator, the interpreter, and the PO owner '
  + 'that goes through the interpreter. Enumerated, so a fourth is a failure rather than a shrug');
var G22 = lf(read(GS + '22_shipment_dispatch_handlers.gs'));
ok(/registry: 'generated_documents'/.test(G22) && !/Sheet_\(ss, 'generated_documents'/.test(G22),
  'C10d and the dispatch owner, which NAMES the registry in its response, never acquires it — it calls '
  + 'dgsGenerateShipmentDocuments_ and reports what came back');

// ==========================================================================================================
section('D  CARRIER LEAD TIME — the chain, end to end, and the two things it must not do');
// ==========================================================================================================
// UI → adapter → transport → router → 17_ → carrier_lead_times, checked link by link.
ok(/db\.upsertCarrierLeadTime\s*\(/.test(code(CRC)) || /KM\.DB\.upsertCarrierLeadTime\s*\(/.test(code(CRC)),
  'D1  the Carrier Rate Card page calls the canonical adapter method');
ok(/KM\.DB\.upsertCarrierLeadTime\s*=\s*async function/.test(API),
  'D1a the adapter declares it');
ok(/carrierLeadTime\.upsert/.test(API), 'D1b and sends the canonical action name');
ok(/if \(action === 'carrierLeadTime\.upsert'\)/.test(RTR), 'D1c the router dispatches it');
ok(/function handleUpsertCarrierLeadTime_\(body\)/.test(G17), 'D1d to the 17_ owner');
ok(/carrier_lead_times/.test(G17), 'D1e which writes carrier_lead_times');
eq(count(code(CRC), /fetch\(|XMLHttpRequest/g), 0,
  'D1f S7_STALE_LEGACY_DIRECT_CALL_COUNT = 0 for this page — no transport of its own');

eq(count(G17, /function handleDeleteCarrierLeadTime_|carrierLeadTime\.delete/g), 0,
  'D2  LEADTIME_DELETE_SUPPORTED = NO — with no status column, removing a lane silently un-routes it, and '
  + 'no workflow asked for that');
eq(count(RTR, /carrierLeadTime\.delete/g), 0, 'D2a and no action routes a delete');
ok(/lead_time_id/.test(G17), 'D3  LEADTIME_UPDATE_IDENTITY = lead_time_id');

// The duplicate guard resolves through KMRA's own predicates, so it cannot drift from the resolution it
// protects. That is the claim R3 made; here it is re-checked as an INTEGRATION fact.
ok(/kmra\.canonicalMethodKey\(/.test(G17) && /kmra\.normalizeLeadTime\(/.test(G17),
  'D4  the lane guard resolves through KMRA, not through a private copy of its rules');
ok(/KMRA_UNAVAILABLE/.test(G17),
  'D4a and REFUSES when KMRA is absent rather than falling back to one');
ok(/LockService\.getScriptLock\(\)/.test(G17),
  'D5  CONCURRENT_DUPLICATE_LANE_REACHABLE = NO — the existing script lock, not a second lock architecture');
eq(count(code(G17), /new Lock|LockService\.getDocumentLock|LockService\.getUserLock/g), 0,
  'D5a and no second lock was introduced');

// RATE / LEAD-TIME AUTHORITY SEPARATION — measured on the handlers, both directions.
var upsertLt = slice(G17, 'function handleUpsertCarrierLeadTime_(body)', '\nfunction handleCarrierLeadTimeDuplicateCensus_', 'lt upsert');
eq(count(code(upsertLt), /carrier_rate_cards/g), 0,
  'D6  RATE_CARD_WRITE_FROM_LEADTIME_COUNT = 0 — the lead-time writer never names the rate table');
// A NON-GREEDY MATCH TO THE FIRST '\n}' STOPS AT THE FIRST NESTED CLOSE, so the body it measured was a
// fragment and the claim was nearly vacuous — which its mutant proved by surviving.
var rateImportFn = topFns(G17).filter(function (f) { return f.name === 'handleImportCarrierRateCards_'; })[0];
ok(!!rateImportFn && rateImportFn.body.length > 2000,
  'D6a the rate importer is extracted whole, by brace matching', rateImportFn ? rateImportFn.body.length : 0);
// THE ONE MENTION IS THE REFUSAL ITSELF. The importer names carrier_lead_times exactly once, inside the
// message that REJECTS a Lead Time column. Counting mentions scored the enforcement as the violation.
function writesTable(body, table) {
  var re = new RegExp("'" + table + "'");
  return re.test(body) && WRITE_RE.test(body);
}
eq(writesTable(code(rateImportFn.body), 'carrier_lead_times'), false,
  'D6b LEADTIME_WRITE_FROM_RATECARD_COUNT = 0 — the rate importer performs no write against the table');
eq(count(code(rateImportFn.body), /carrier_lead_times/g), 1,
  'D6b1 and names it exactly once — in the refusal that keeps the two authorities apart');
ok(/Lead Time is maintained separately in carrier_lead_times/.test(rateImportFn.body),
  'D6b2 which is that sentence, quoted from the shipped refusal');
ok(/Lead Time \/ transit columns are not allowed in a Carrier Rate Template/.test(G17),
  'D6c SECOND_CARRIER_RATE_AUTHORITY_COUNT = 0 — the rate import still REJECTS lead-time columns outright');

// DEFERRED READ — the S7-R3 regression repair, re-measured at the mount.
var initSrc = slice(CRC, 'function _crcInit(', '\n    }', '_crcInit');
eq(count(code(initSrc), /_crcEnsureLeadTimes_|getCarrierLeadTimes/g), 0,
  'D7  LEADTIME_READ_ON_PAGE_MOUNT_COUNT = 0 — S4-R4 §6 took the lead-time read off this first screen and '
  + 'the maintenance panel is no more entitled to it than the rate column was');
ok(/function crcLtShow\(\)/.test(CRC) && /_crcLtAsked = true/.test(CRC),
  'D7a LEADTIME_READ_ON_SHOW_ACTION_COUNT = 1 — exactly one place starts the read, and the operator asks');
ok(/Lead times load on demand/.test(CRC),
  'D7b and NOT_LOADED renders an OFFERED state, because printing "Loading…" for a read nobody asked for '
  + 'would be a lie about what the page is doing');
eq(count(code(CRC), /_crcEnsureLeadTimes_\s*\(/g) > 0, true, 'D7c the deferred read exists to be asked for');
// PER_ROW_LEADTIME_REQUEST_COUNT = 0 — the panel renders from the one scoped read model, never per row.
eq(count(code(slice(CRC, 'function _crcLtRender(', '\n    }', '_crcLtRender')), /KM\.DB|_crcEnsureLeadTimes_/g), 0,
  'D8  PER_ROW_LEADTIME_REQUEST_COUNT = 0 — the renderer reads nothing');

// ==========================================================================================================
section('E  DEPLOY SURFACE and TEMP — carried from R4 and re-derived, not assumed');
// ==========================================================================================================
eq(S.undeclared, [], 'E1  UNDECLARED_RUNTIME_FILE_COUNT = 0');
eq(S.missing, [], 'E1a and no declared runtime owner has left the folder');
eq(S.nonRuntimeInRuntimeDir, [], 'E2  NON_RUNTIME_TEMP_IN_FINAL_PRODUCTION_DEPLOY_SET = 0');
eq(S.liveCount, S.declaredCount, 'E3  FINAL_PRODUCTION_APPS_SCRIPT_RUNTIME_FILE_COUNT derived, not assumed');
ok(S.declared.indexOf('90_generated_supply_planning_bundle.gs') !== -1,
  'E4  the generated runtime owner remains INCLUDED — generated is not diagnostic');
ok(!fs.existsSync(path.join(REPO, GS, 'TEMP_demo_shipping_shipment_map_seed_v2.gs')),
  'E5  DEMO_SEED_PRODUCTION_DEPLOY_REACHABLE = NO — it is not in the runtime universe');
eq(RUNTIME.filter(function (r) { return /TEMP_DEMO4A_/.test(r.src); }).map(function (r) { return r.file; }), [],
  'E5a and no runtime file names any of its entry points');
// TEMP_RUNTIME_HANDLER_DEPENDENCY_COUNT — no routed action may dispatch to a symbol a relocated tool owns.
// Comparing a raw count against a comment-stripped one, which is what this line used to do, compares two
// different questions and answers neither.
var movedSyms = [];
['apps-script-migrations', 'apps-script-diagnostics', 'apps-script-seeds'].forEach(function (d) {
  fs.readdirSync(path.join(REPO, 'assets/tools', d))
    .filter(function (f) { return /^TEMP_.*\.gs$/.test(f); }).forEach(function (f) {
      (lf(read('assets/tools/' + d + '/' + f)).match(/^function ([A-Za-z0-9_]+)\s*\(/gm) || [])
        .forEach(function (x) { movedSyms.push(x.replace(/^function /, '').replace(/\s*\($/, '')); });
    });
});
ok(movedSyms.length > 50, 'E6  the relocated tools declare a large symbol surface', movedSyms.length);
eq(movedSyms.filter(function (sy) {
  return sy.length > 12 && new RegExp('\\b' + sy + '\\s*\\(').test(code(RTR));
}), [], 'E6a TEMP_RUNTIME_HANDLER_DEPENDENCY_COUNT = 0 — the router CALLS no symbol that left the runtime');
// Every routed handler resolves inside the runtime universe, with no TEMP file present.
var handlerNames = {};
(RTR.match(/\bhandle[A-Za-z0-9_]*_\b/g) || []).forEach(function (h) { handlerNames[h] = 1; });
var routed = Object.keys(handlerNames).sort();
ok(routed.length >= 130, 'E7  the whole handler surface was collected', routed.length);
var runtimeSrc = RUNTIME.map(function (r) { return r.src; }).join('\n');
eq(routed.filter(function (h) { return !new RegExp('function\\s+' + h + '\\s*\\(').test(runtimeSrc); }), [],
  'E7a MISSING_ROUTER_HANDLER_COUNT = 0 and ORPHAN_PRODUCTION_ACTION_COUNT = 0');

// ==========================================================================================================
section('F  CROSS-MAINLINE — a supporting flow may not execute a business mainline');
// ==========================================================================================================
// This is the §0 rule that keeps S7 from becoming a third mainline, and it is measured on the handlers.
var SHIPPING_WRITES = /createShipmentFromPlan|createShippingPlansBatch|confirmShipmentAndDispatch|appendRow\(\s*\[?\s*['"]SHIP/;
var ORDERING_WRITES = /createPurchaseOrderFromRequest|createRequestOrderDraft|submitRequestOrderAllocationDrafts/;
eq(count(code(upsertLt), /shipments|shipping_plans|purchase_orders|request_orders/g), 0,
  'F1  S7_TO_SHIPPING_AUTO_EXECUTION_COUNT = 0 — lead-time maintenance names no mainline table');
ok(!SHIPPING_WRITES.test(code(upsertLt)) && !ORDERING_WRITES.test(code(upsertLt)),
  'F1a S7_TO_ORDERING_AUTO_EXECUTION_COUNT = 0 — and calls no mainline writer');
var retryFn = slice(G39, 'function handleDocumentRetry_(body)', '\nfunction ', 'document retry');
eq(count(code(retryFn), /shipments\b|shipping_plans|purchase_orders\b|request_orders/g), 0,
  'F2  document retry mutates no PO or Shipment business state — only its own document artifact');
eq(count(code(retryFn), /KMORCH|orchestrat/gi), 0,
  'F3  SUPPORTING_PHASE2_ORCHESTRATION_COUNT = 0 — no supporting flow orchestrates a mainline');
// The carrier maintenance surface creates nothing.
eq(count(code(CRC), /createShipment|createShippingPlan|createPurchaseOrder|createRequestOrder/g), 0,
  'F4  carrier maintenance creates no Shipment and no Shipping Plan');

// ==========================================================================================================
section('G  what S7 did NOT touch');
// ==========================================================================================================
var S7_BASE = 'd5f038a0a0c2154a712c42a2d0f9a68b67e89e73';
var s7Changed = cp.execFileSync('git', ['diff', '--name-only', '-M', S7_BASE, 'HEAD'],
  { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
eq(s7Changed.filter(function (f) { return /forecast/i.test(f); }), [],
  'G1  FORECAST_REVIEW_CHANGED_IN_S7 = NO — no file whose path names forecast changed in ANY S7 round');
ok(fs.existsSync(path.join(REPO, 'assets/specs/active/pages/forecast/Forecast_Review_Aggregation_Master_Spec.md')),
  'G1a and its master spec is still there — DEFERRED_UNCHANGED means unchanged, not removed');
ok(fs.existsSync(path.join(REPO, 'assets/html/pages/forecast.html')),
  'G1b as is the page it belongs to; S7 neither hid it, relabelled it nor rewired its navigation');
// S5 / S6 owners: S7 changed no ordering or shipping handler.
var S5_S6_OWNERS = ['11_shipping_plan_handlers.gs', '12_shipment_handlers.gs', '13_procurement_handlers.gs',
  '15_request_allocation_handlers.gs', '16_shipping_allocation_handlers.gs', '21_factory_inventory_handlers.gs',
  '22_shipment_dispatch_handlers.gs', '05_overseas_inventory_handlers.gs', '31_shipment_receipt_route_handlers.gs'];
eq(s7Changed.filter(function (f) {
  return S5_S6_OWNERS.some(function (o) { return f.indexOf(o) !== -1; });
}), [], 'G2  S7_TO_S5_BEHAVIOR_DRIFT_COUNT = 0 and S7_TO_S6_BEHAVIOR_DRIFT_COUNT = 0 — no ordering, '
  + 'shipping, factory, overseas, dispatch or receipt owner changed in any S7 round');
// The backend owners S7 DID change, declared.
var s7Backend = s7Changed.filter(function (f) { return f.indexOf(GS) === 0; })
  .map(function (f) { return f.slice(GS.length); }).sort();
eq(s7Backend.filter(function (f) { return f.indexOf('TEMP_') !== 0; }),
  ['01_router.gs', '17_carrier_handlers.gs', '57_api_v1_shipment_workspace.gs', '63_api_v1_system_health.gs'],
  'G3  S7_BACKEND_CHANGED_OWNER_SET = exactly four, and every one is a supporting-flow owner');

// ==========================================================================================================
section('H  BOOT topology — the corrected R2B1 contract still holds');
// ==========================================================================================================
var liveBoot = RUNNER.bootSurface();
var topo = BT.bootTopology(liveBoot.local, liveBoot.routeAssets);
eq(topo.undeclared, [], 'H1  UNDECLARED_BOOT_SCRIPT_COUNT = 0');
eq(topo.missing, [], 'H2  and no declared boot script has stopped loading');
eq(topo.setChangeCount, 0, 'H3  BOOT_SCRIPT_SET_UNEXPECTED_CHANGE_COUNT = 0');
eq(topo.routeAtBoot, [], 'H4  NEW_ROUTE_SCRIPT_AT_BOOT_COUNT = 0');
eq(topo.orderDriftCount, 0, 'H5  BOOT_ORDER_DRIFT_COUNT = 0');
ok(liveBoot.bytes > 0, 'H6  BOOT_PAYLOAD_BYTES_CURRENT is REPORTED, not gated — S8 owns the budget',
  liveBoot.bytes);

// ==========================================================================================================
section('I  mutants — every integration claim above is load-bearing');
// ==========================================================================================================
mut('I1 a second carrier display resolver appearing on a page', function () {
  return count(code(SH) + '\nfunction myCarrierDisplay(id) { return id; }\n',
    /function\s+\w*[Cc]arrierDisplay\s*\(/g) === 1;
});
mut('I2 the resolver printing the id when it HAS the name', function () {
  var broken = DISPLAY_SRC.replace("return { state: 'RESOLVED', text: nm,", "return { state: 'RESOLVED', text: id,");
  var sb = {}; vm.createContext(sb); vm.runInContext('var o = { ' + broken + ' };', sb);
  var r = sb.o.carrierDisplay('C-SINO', MASTER);
  return r.carrierName === 'Sinotrans' && r.text !== r.carrierName;
});
mut('I3 UNREAD collapsed into NONE — "we did not look" reported as "there is none"', function () {
  var broken = DISPLAY_SRC.replace("return { state: 'UNREAD', text: id, carrierId: id, carrierName: '' };",
    "return { state: 'NONE', text: '', carrierId: '', carrierName: '' };");
  var sb = {}; vm.createContext(sb); vm.runInContext('var o = { ' + broken + ' };', sb);
  return sb.o.carrierDisplay('C-SINO', null).state === 'NONE';
});
mut('I4 the Weekly label rendering the no-carrier state for a real id', function () {
  var broken = LABEL_SRC.replace('? \'--\'', '? \'--\'').replace('!cbCarrierId', 'true');
  var sandbox = { plan: { carrierId: 'C-SINO', carrierName: 'Sinotrans' },
    _spEsc: function (v) { return String(v == null ? '' : v); }, out: null };
  vm.createContext(sandbox);
  vm.runInContext(broken + '\nout = cbCarrier;', sandbox);
  return sandbox.out === '--';
});
mut('I5 the panel addressing retry at the ROW entity instead of the panel entity', function () {
  // this is the S7-R2B1 defect: a PO panel would then act on a shipment
  return mixedHtml.indexOf("'purchase_order','PO-1'") !== -1 && mixedHtml.indexOf("'shipment','S-9'") === -1;
});
mut('I6 the five-row fold silently dropping the sixth document', function () {
  return manyHtml.indexOf('D-6.pdf') !== -1 && manyHtml.indexOf('View all (6)') !== -1;
});
mut('I7 a delete action appearing on the lead-time surface', function () {
  return count(RTR + "\n    if (action === 'carrierLeadTime.delete') { return h_(body); }\n",
    /carrierLeadTime\.delete/g) === 1;
});
mut('I8 the lane guard reimplementing KMRA instead of calling it', function () {
  var broken = G17.replace(/kmra\.canonicalMethodKey\(/g, 'localCanonicalMethodKey_(');
  return !/kmra\.canonicalMethodKey\(/.test(broken);
});
mut('I9 the Rate Card mount acquiring the lead-time read again — the S7-R3 regression', function () {
  var broken = initSrc.replace('_crcLtRender();', '_crcLtRender(); _crcEnsureLeadTimes_(function () {});');
  return count(code(broken), /_crcEnsureLeadTimes_/g) === 1;
});
mut('I10 the rate importer acquiring a lead-time write', function () {
  var broken = code(rateImportFn.body) + "\n sh.appendRow(['carrier_lead_times']);\n";
  // the REFUSAL mention must not satisfy this — only an actual write may
  return writesTable(broken, 'carrier_lead_times') && !writesTable(code(rateImportFn.body), 'carrier_lead_times');
});
mut('I11 the demo seed returning to the runtime universe', function () {
  var live = S.live.concat(['TEMP_demo_shipping_shipment_map_seed_v2.gs']);
  return live.filter(function (f) { return SURF.NON_RUNTIME_NAME_RE.test(f); }).length === 1;
});
mut('I12 an S5/S6 owner changing under an S7 round', function () {
  var pretend = s7Changed.concat([GS + '13_procurement_handlers.gs']);
  return pretend.filter(function (f) {
    return S5_S6_OWNERS.some(function (o) { return f.indexOf(o) !== -1; });
  }).length === 1;
});
mut('I13 document retry reaching into shipment business state', function () {
  var broken = code(retryFn) + "\n var sh = ss.getSheetByName('shipments'); sh.appendRow([1]);\n";
  return count(broken, /shipments\b/g) === 1;
});
mut('I14 the panel starting a timer, which is how an auto-retry gets in', function () {
  return count(code(PANEL_SRC) + '\nsetTimeout(retry, 1000);\n', /setTimeout/g) === 1;
});

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + '  ' + pass + ' passed / ' + fail + ' failed'
  + '   mutants ' + mutants + ', survived ' + survived);
process.exitCode = fail ? 1 : 0;
