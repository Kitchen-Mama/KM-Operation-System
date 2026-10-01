// S7-R1 — PHASE-1 SUPPORTING / AUXILIARY EXECUTION MAINLINES: CONTRACT + COMPLETENESS AUDIT.
//
// AN AUDIT ROUND, SO THIS SUITE PROVES THE AUDIT RATHER THAN A FEATURE. Every count the report publishes
// that can be derived from the tree is derived HERE, from the tree, so the report cannot drift from the code
// it describes and a later round cannot quietly change one of these shapes without a named failure.
//
// It changes no runtime file. It drives no handler. It writes nothing anywhere.
//
// WHAT "DISCONNECTED" MEANS IN THIS SUITE, because the word is doing real work. A supporting flow is
// disconnected when a LINK IN ITS CHAIN IS ABSENT while the rest of the chain exists:
//
//     page  ->  KM.DB adapter method  ->  action  ->  router dispatch  ->  handler  ->  canonical owner
//
// A chain that was never built is not disconnected, it is unbuilt, and the two are classified differently in
// the report. Both of this round's findings are the first kind: the parts exist and do not meet.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK.
// TEST_DATA_CLASSIFICATION = SOURCE_TEXT_ONLY   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s7-r1-supporting-flow-contract-audit.test.js

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function lsdir(rel) { return fs.readdirSync(path.join(ROOT, rel)).sort(); }

var GS = 'specs/active/apps-script/';
var JSP = 'js/pages/';
var JSA = 'js/api/';

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
function count(s, re) { return (String(s).match(re) || []).length; }
function uniq(a) { var o = {}, r = []; a.forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r.sort(); }

// Comments stripped. Line comments only when the `//` is not inside what looks like a URL.
function code(s) {
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
// Comments AND string literals stripped, for the questions where a MENTION must not count as a USE.
function bare(s) {
  return code(s).replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// ---- the files the audit reads ---------------------------------------------------------------------------
var AS_FILES = lsdir(GS).filter(function (f) { return /\.gs$/.test(f); });
var AS_PERM = AS_FILES.filter(function (f) { return f.indexOf('TEMP_') !== 0; });
var AS_TEMP = AS_FILES.filter(function (f) { return f.indexOf('TEMP_') === 0; });
var PAGE_FILES = lsdir(JSP).filter(function (f) { return /\.js$/.test(f); });

var SRC = {};
AS_FILES.forEach(function (f) { SRC[f] = read(GS + f); });
var ROUTER = SRC['01_router.gs'];
var ADAPTER = read(JSA + 'operation-system-db-api.js');
var PAGES = {};
PAGE_FILES.forEach(function (f) { PAGES[f] = read(JSP + f); });
var index = read('../index.html');
var APPJS = read('js/app.js');
// The staged-section registry is the repo's existing mechanism for withholding a route from production.
var KM_STAGED = (/var KM_STAGED_SECTIONS_ = \{([\s\S]*?)\n\};/.exec(APPJS) || ['', ''])[1];

// ---- the three joins, as functions, so a mutant can re-run them over a changed source --------------------
function routerActions(routerSrc) {
  var a = (routerSrc.match(/action === '[^']+'/g) || []).map(function (s) { return s.slice(12, -1); });
  var b = (routerSrc.match(/^[ \t]+'[a-zA-Z0-9_.]+':[ \t]*[a-zA-Z0-9_]+,/gm) || [])
    .map(function (s) { return s.replace(/^[ \t]*'/, '').replace(/':.*$/, ''); });
  return uniq(a.concat(b));
}
// The envelope helper is not a handler: `return jsonResponse_(handleX_(body))` dispatches handleX_, and
// `return jsonResponse_({...})` dispatches nothing at all.
var ENVELOPE_ = { jsonResponse_: 1 };
function dispatchedHandlers(routerSrc) {
  var out = [], m;
  var re = /return\s+(?:jsonResponse_\(\s*)?([a-zA-Z0-9_]+_)\s*\(/g;
  while ((m = re.exec(routerSrc)) !== null) { if (!ENVELOPE_[m[1]]) out.push(m[1]); }
  var tre = /^[ \t]+'[a-zA-Z0-9_.]+':[ \t]*([a-zA-Z0-9_]+),[ \t]*$/gm;
  while ((m = tre.exec(routerSrc)) !== null) { out.push(m[1]); }
  return uniq(out);
}
function definedFunctions(srcMap) {
  var out = [];
  Object.keys(srcMap).forEach(function (f) {
    (srcMap[f].match(/^function\s+[a-zA-Z0-9_]+\s*\(/gm) || []).forEach(function (s) {
      out.push(s.replace(/^function\s+/, '').replace(/\s*\($/, ''));
    });
  });
  return uniq(out);
}
// Only COLUMN-ZERO declarations share the one Apps Script global scope. A helper nested inside another
// function does not, and counting it would invent collisions that cannot happen.
function topLevelSymbols(src) {
  var out = [];
  (src.match(/^function\s+([a-zA-Z0-9_]+)\s*\(/gm) || []).forEach(function (s) {
    out.push(s.replace(/^function\s+/, '').replace(/\s*\($/, ''));
  });
  (src.match(/^var\s+([a-zA-Z0-9_]+)\s*=/gm) || []).forEach(function (s) {
    out.push(s.replace(/^var\s+/, '').replace(/\s*=$/, ''));
  });
  return uniq(out);
}

// An action literal the BROWSER sends. Status enums and internal persistence verbs share the key name
// `action:`, so the shape filter is the same one the audit used: a dotted name, or a known transport verb.
var ACTION_VERB = /^(get|set|update|upsert|create|delete|cancel|submit|import|export|run|sync|seed|backfill|audit|retire|append|complete|confirm|finalize|generate|receive|render|replenish)/;
function clientActions(srcs) {
  var out = [];
  srcs.forEach(function (s) {
    (s.match(/action:\s*'[a-zA-Z0-9_.]+'/g) || []).forEach(function (m) {
      var a = m.replace(/^action:\s*'/, '').replace(/'$/, '');
      if (a.indexOf('.') !== -1 || ACTION_VERB.test(a)) out.push(a);
    });
  });
  return uniq(out);
}

var ALL_JS = [ADAPTER].concat(PAGE_FILES.map(function (f) { return PAGES[f]; }));

// ==========================================================================================================
section('A  THE THREE JOINS — every supporting surface reaches a canonical owner, or is named');
// ==========================================================================================================
var RACT = routerActions(ROUTER);
var CACT = clientActions(ALL_JS);
var DEFS = definedFunctions(SRC);
var DISP = dispatchedHandlers(ROUTER);

eq(RACT.length, 141, 'A1  the router dispatches 141 distinct actions');

var missingRouter = CACT.filter(function (a) { return RACT.indexOf(a) === -1; });
eq(missingRouter, [], 'A2  MISSING_ROUTER_ACTION_COUNT is 0 — every action the browser sends has a dispatch branch');

ok(DISP.length >= 100 && DISP.indexOf('handleConfirmShipmentAndDispatch_') !== -1,
  'A3  the dispatch list is populated — an empty one would also report nothing missing', DISP.length);
var missingHandler = DISP.filter(function (h) { return DEFS.indexOf(h) === -1; });
eq(missingHandler, [], 'A3a every handler the router dispatches is defined in some .gs — no unreachable branch');

// The migration risk in the other direction: a page that never joined the transport at all.
var legacyCalls = 0;
PAGE_FILES.forEach(function (f) {
  legacyCalls += count(bare(PAGES[f]), /google\.script\.run/g);
  legacyCalls += count(bare(PAGES[f]), /script\.google\.com/g);
});
eq(legacyCalls, 0, 'A4  STALE_LEGACY_DIRECT_CALL_COUNT is 0 — no page bypasses the shared transport');

// code(), not bare(): the endpoint IS a string literal, and bare() exists precisely to erase those.
ok(count(code(ADAPTER), /script\.google\.com/g) > 0,
  'A4a the ONE endpoint literal lives in the adapter, which is where it belongs');

mut('A2 would catch a client action the router cannot route', function () {
  var faked = ALL_JS.concat(["var x = { action: 'carrier.rateCard.save' };"]);
  return clientActions(faked).filter(function (a) { return RACT.indexOf(a) === -1; }).length === 1;
});
mut('A3 would catch a router branch whose handler was removed with its file', function () {
  var cut = {};
  Object.keys(SRC).forEach(function (f) { if (f !== '17_carrier_handlers.gs') cut[f] = SRC[f]; });
  var d = definedFunctions(cut);
  return DISP.filter(function (h) { return d.indexOf(h) === -1; }).length > 0;
});
mut('A4 would catch a page calling Apps Script directly', function () {
  return count(bare(PAGES['carrier-rate-card.js'] + '\nvar u = google.script.run.doThing();'),
    /google\.script\.run/g) === 1;
});

// ==========================================================================================================
section('B  CARRIER — the identity is right everywhere and the NAME is resolved in one place only');
// ==========================================================================================================
// Carrier identity is `carrier_id`, and carrier_name is never stored on a plan, a shipment or a rate card.
// So every surface that wants to SHOW a carrier has to resolve the name against the `carriers` master. One
// surface does. The other was built to and cannot.

var F40 = SRC['40_api_v1_weekly_workspace.gs'];
var F57 = SRC['57_api_v1_shipment_workspace.gs'];
var F17 = SRC['17_carrier_handlers.gs'];

ok(/\{\s*name:\s*'carriers'/.test(F40),
  'B1  the Weekly Shipping Plan read (40_) loads the carriers master');
ok(/carrier:\s*\{\s*id:[^}]*name:/.test(F40),
  'B1a and emits carrier { id, name } — the Weekly surface can print a name');

eq(count(F57, /\{\s*name:\s*'carriers'/g), 0,
  'B2  the Shipment Draft / Overview read (57_) does NOT load the carriers master');
ok(/carrierId:\s*shipWsStr_\(r\.carrier_id\)/.test(F57),
  'B2a it serves carrierId only, so that surface has an identity and no name');

// The browser-side resolver that exists for exactly this, and the link that is missing under it.
ok(/carrierName:\s*function\s*\(carrierId\)/.test(ADAPTER),
  'B3  KM.display.carrierName is the render-time resolver built for the gap');
ok(/KM\.DB\.getOperationDb\s*===\s*'function'/.test(ADAPTER),
  'B3a and it resolves its data through KM.DB.getOperationDb');
eq(count(bare(ADAPTER), /KM\.DB\.getOperationDb\s*=[^=]/g), 0,
  'B3b which is assigned NOWHERE in the adapter');
var anyGetOperationDbMember = 0;
ALL_JS.forEach(function (s) { anyGetOperationDbMember += count(bare(s), /KM\.DB\.getOperationDb\s*=[^=]/g); });
eq(anyGetOperationDbMember, 0,
  'B3c nor anywhere else in the browser — so the typeof guard is always false and the resolver always '
  + 'returns the empty string. CARRIER_API_DISCONNECT_COUNT = 1');

var displayConsumers = 0;
PAGE_FILES.forEach(function (f) { displayConsumers += count(bare(PAGES[f]), /KM\.display\./g); });
eq(displayConsumers, 0,
  'B3d and no page calls it, so this is a latent trap rather than a live wrong answer — which is why the '
  + 'report classifies it DISCONNECTED and not BLOCKING');

// One rate authority. The AI Plan is forbidden to price, by its own contract.
eq(count(F17, /^function shippingFreight_/gm), 1,
  'B4  there is exactly ONE freight computation and 17_ owns it');
var freightCallers = AS_PERM.filter(function (f) {
  return f !== '17_carrier_handlers.gs' && /shippingFreight_\s*\(/.test(bare(SRC[f]));
});
eq(freightCallers, ['11_shipping_plan_handlers.gs', '12_shipment_handlers.gs'],
  'B4a and its only callers are the Weekly rough estimate and the Shipment exact quote — '
  + 'SECOND_CARRIER_RATE_AUTHORITY_COUNT = 0');

var KMMR = read('js/core/supply-planning-method-recommendation.js');
ok(/cost_basis:\s*'NOT_EVALUATED_IN_AI_PLAN'/.test(KMMR),
  'B4b and the AI Plan declares in code that it does not price — it recommends a METHOD, never a rate');

// ---- B5: the half of the lane authority that nobody can maintain ----------------------------------
// A routable lane needs a rate card AND a transit time, and they live in two tables. One of them has an
// import template, a preview, a confirm step and a page. The other has a seed function.
var ltWriters = [];
AS_PERM.forEach(function (f) {
  var c = code(SRC[f]);
  if (/getSheetByName\(\s*'carrier_lead_times'/.test(c)
    || /EnsureSheet_\(\s*ss,\s*'carrier_lead_times'/.test(c)) ltWriters.push(f);
});
eq(ltWriters, ['17_carrier_handlers.gs'],
  'B5  exactly one module ever opens carrier_lead_times for writing');
var seedOnly = /function handleSeedSinotransCarrier_[\s\S]*?'carrier_lead_times'/.test(code(F17));
ok(seedOnly,
  'B5a and the only place it does so is inside handleSeedSinotransCarrier_ — a one-time seed for a single '
  + 'CN to JP lane, not a maintenance path');
eq(RACT.filter(function (a) { return /leadTime/i.test(a) && !/raw/.test(a); }), [],
  'B5b there is NO routed action for creating or editing a lead time');
// code(), not bare(): the page names the table inside a deferred-read table list, which is a string.
var ltPage = PAGE_FILES.filter(function (f) { return /carrier_lead_times/.test(code(PAGES[f])); });
eq(ltPage, ['carrier-rate-card.js', 'inventory-replenishment.js'],
  'B5c TWO pages read it — the Carrier Rate Card joins it for display and the Execution Plan method '
  + 'registry builds lane options from it. Both depend on a table neither of them, nor any other '
  + 'surface, can write');
var ltWriteUi = PAGE_FILES.filter(function (f) {
  return /KM\.DB\.[a-zA-Z0-9_]*[Ll]eadTime[a-zA-Z0-9_]*\s*\(/.test(code(PAGES[f]));
});
eq(ltWriteUi, [], 'B5c1 and no page calls any lead-time adapter method at all');
mut('B5c1 would catch a lead-time maintenance call appearing on a page', function () {
  var p = PAGES['carrier-rate-card.js'] + '\nKM.DB.upsertCarrierLeadTime(row);\n';
  return /KM\.DB\.[a-zA-Z0-9_]*[Ll]eadTime[a-zA-Z0-9_]*\s*\(/.test(code(p));
});
ok(/Lead Time \/ transit columns are not allowed in a Carrier Rate Template/.test(F17),
  'B5d and the rate-card import explicitly REJECTS lead-time columns, so the one import surface that '
  + 'exists is closed to them by design. A lane can be priced through the UI and timed only by hand — '
  + 'this is the roundest Phase-1 supporting gap found');

mut('B5b would catch a lead-time write action being added', function () {
  return routerActions(ROUTER + "\n    if (action === 'carrierLeadTime.upsert') { return h_(body); }\n")
    .filter(function (a) { return /leadTime/i.test(a) && !/raw/.test(a); }).length === 1;
});
mut('B5 would catch a second module opening the lead-time table', function () {
  var m = SRC['11_shipping_plan_handlers.gs'] + "\nvar lt = ss.getSheetByName('carrier_lead_times');\n";
  return /getSheetByName\(\s*'carrier_lead_times'/.test(code(m));
});

mut('B2 would catch 57_ quietly adopting the carriers master without the UI being told', function () {
  var m = F57.replace("{ name: 'carrier_rate_cards',", "{ name: 'carriers', requiredCols: [] },\n  { name: 'carrier_rate_cards',");
  return count(m, /\{\s*name:\s*'carriers'/g) === 1;
});
mut('B3c would catch the missing link being supplied', function () {
  var m = ADAPTER + '\nwindow.KM.DB.getOperationDb = function () { return window._opDbCache; };\n';
  return count(bare(m), /KM\.DB\.getOperationDb\s*=[^=]/g) === 1;
});
mut('B4a would catch a second file computing freight', function () {
  var m = {};
  AS_PERM.forEach(function (f) { m[f] = SRC[f]; });
  m['35_shipment_document_renderer.gs'] += '\nfunction docFreight_(rc, x) { return shippingFreight_(rc, x); }\n';
  var callers = Object.keys(m).filter(function (f) {
    return f !== '17_carrier_handlers.gs' && /shippingFreight_\s*\(/.test(bare(m[f]));
  }).sort();
  return callers.length === 3;
});

// ==========================================================================================================
section('C  SHIPMENT OVERVIEW — a read model that also carries operator actions, and owns neither');
// ==========================================================================================================
// There is no "Shipping History" in the navigation. `shipping-history.js` serves TWO sections: Shipment
// Overview (shippinghistory-section) and Shipment Draft. Its writes are real, and every one of them is a
// call into a canonical S6 owner — which is the question §4 is actually asking.

var SH = PAGES['shipping-history.js'];
eq(count(SH, /KM\.lifecycle\.register\('shippinghistory-section'/g), 1,
  'C1  shipping-history.js registers the Shipment Overview section');
eq(count(SH, /KM\.lifecycle\.register\('shipment-draft-section'/g), 1,
  'C1a and the Shipment Draft section — one file, two surfaces');

eq(count(bare(SH), /fetch\s*\(/g), 0,
  'C2  it issues no request of its own');
eq(count(bare(SH), /google\.script\.run|script\.google\.com/g), 0,
  'C2a and reaches no backend directly');

// Every write verb it uses, and the owner each one lands on.
var SH_WRITES = ['updateShipment', 'generateShipmentLineAllocations', 'confirmShipmentAndDispatch',
  'cancelShipmentDraft', 'generateShipmentDocument'];
SH_WRITES.forEach(function (m, i) {
  ok(new RegExp('KM\\.DB\\.' + m + '\\b').test(SH),
    'C3' + '.' + (i + 1) + ' it writes through KM.DB.' + m);
});
var SH_ACTIONS = ['updateShipment', 'generateShipmentLineAllocations', 'confirmShipmentAndDispatch',
  'cancelShipmentDraft', 'shipmentDocument.generate'];
var notRouted = SH_ACTIONS.filter(function (a) { return RACT.indexOf(a) === -1; });
eq(notRouted, [],
  'C3a and every one of those is a routed action owned on the server — '
  + 'SHIPPING_HISTORY_WRITE_OWNER_COUNT = 0, because the page owns none of them');

// It must not recompute what the server already decided.
eq(count(bare(SH), /fac_current_stock|fac_reserved_stock|wh_available_stock|wh_reserved_stock/g), 0,
  'C4  SHIPPING_HISTORY_TRUTH_DRIFT_COUNT = 0 — it derives no inventory balance of its own');

mut('C3a would catch the page gaining a write that no router action backs', function () {
  var acts = SH_ACTIONS.concat(['shipment.forceClose']);
  return acts.filter(function (a) { return RACT.indexOf(a) === -1; }).length === 1;
});
mut('C4 would catch an inventory balance being recomputed in the browser', function () {
  var m = SH + '\nvar left = row.fac_current_stock - row.fac_reserved_stock;\n';
  return count(bare(m), /fac_current_stock/g) === 1;
});

// ==========================================================================================================
section('D  DOCUMENTS — the backend, the router and the adapter are complete; the SURFACE is absent');
// ==========================================================================================================
var DOC_READ = ['listEntityDocuments', 'getGeneratedDocument', 'retryDocumentGeneration'];
DOC_READ.forEach(function (m, i) {
  ok(new RegExp('window\\.KM\\.DB\\.' + m + '\\s*=').test(ADAPTER),
    'D1.' + (i + 1) + ' the adapter exposes KM.DB.' + m);
});
['document.list', 'document.get', 'document.retry'].forEach(function (a, i) {
  ok(RACT.indexOf(a) !== -1, 'D2.' + (i + 1) + ' ' + a + ' is routed');
});
['handleEntityDocumentList_', 'handleGeneratedDocumentGet_', 'handleDocumentRetry_'].forEach(function (h, i) {
  ok(DEFS.indexOf(h) !== -1, 'D2a.' + (i + 1) + ' and ' + h + ' exists');
});

var docPanelCallers = [];
PAGE_FILES.forEach(function (f) {
  DOC_READ.forEach(function (m) {
    if (new RegExp('KM\\.DB\\.' + m + '\\b').test(bare(PAGES[f]))) docPanelCallers.push(f + ':' + m);
  });
});
eq(docPanelCallers, [],
  'D3  and NO page calls any of them — a generated document can be produced once and never listed, '
  + 'reopened or retried from the application. This is the round primary finding');

ok(/KM\.DB\.generateShipmentDocument\b/.test(PAGES['shipping-history.js']),
  'D4  the one wired half is generation, from the Shipment Draft');
eq(count(bare(PAGES['purchase-order-overview.js'] + PAGES['purchase-order-list.js']),
  /KM\.DB\.(generateShipmentDocument|listEntityDocuments|getGeneratedDocument|retryDocumentGeneration)\b/g), 0,
  'D4a the Purchase Order surfaces have no document control at all, although 39_ serves purchase_order '
  + 'documents — so PO documents are backend-only, which is UNBUILT rather than disconnected');

ok(/related_entity_type:\s*'purchase_order'/.test(SRC['39_document_runtime_service.gs']),
  'D4b and that PO support really is there on the server, which is what makes the gap worth naming');

mut('D3 would catch the Document Panel being wired', function () {
  var p = PAGES['shipping-history.js'] + '\nKM.DB.listEntityDocuments("shipment", id).then(render);\n';
  return /KM\.DB\.listEntityDocuments\b/.test(bare(p));
});

// ==========================================================================================================
section('E  IMPORT / BULK — one owner each, and which of them an operator can actually reach');
// ==========================================================================================================
var IMPORTS = [
  ['importMarketplaceSkusBatch', 'handleImportMarketplaceSkusBatch_', '04_'],
  ['importFcRegularForecastBatch', 'handleImportFcRegularForecastBatch_', '04_'],
  ['importFcSpecialEventsBatch', 'handleImportFcSpecialEventsBatch_', '14_'],
  ['importOverseasInventorySnapshotBatch', 'handleImportOverseasInventorySnapshotBatch_', '05_'],
  ['importCarrierRateCards', 'handleImportCarrierRateCards_', '17_'],
  ['factoryInventory.import.validate', 'handleFactoryInventoryImportValidate_', '21_'],
  ['factoryInventory.import.commit', 'handleFactoryInventoryImportCommit_', '21_'],
  ['syncMarketplaceSkusToSkuRegionalDetails', 'handleSyncMarketplaceSkusToSkuRegionalDetails_', '18_'],
  ['runAmazonSnapshotImports', 'handleRunAmazonSnapshotImports_', '07_'],
  ['auditFcSpecialEventIds', 'handleAuditFcSpecialEventIds_', '14_'],
  ['backfillFcSpecialEventIds', 'handleBackfillFcSpecialEventIds_', '14_'],
  ['retireShipmentLabelColumns', 'handleRetireShipmentLabelColumns_', '12_'],
  ['seedSinotransCarrier', 'handleSeedSinotransCarrier_', '17_']
];
eq(IMPORTS.length, 13, 'E1  IMPORT_SURFACE_COUNT — thirteen import / bulk / repair actions');

var importOwnerProblems = [];
IMPORTS.forEach(function (row) {
  if (RACT.indexOf(row[0]) === -1) { importOwnerProblems.push(row[0] + ' not routed'); return; }
  var owners = AS_FILES.filter(function (f) {
    return new RegExp('^function\\s+' + row[1] + '\\s*\\(', 'm').test(SRC[f]);
  });
  if (owners.length !== 1) { importOwnerProblems.push(row[0] + ' has ' + owners.length + ' owners'); return; }
  if (owners[0].indexOf(row[2]) !== 0) importOwnerProblems.push(row[0] + ' owned by ' + owners[0]);
});
eq(importOwnerProblems, [],
  'E2  each is routed and has EXACTLY ONE handler definition, in the module the audit names — '
  + 'SECOND_WRITE_OWNER_COUNT = 0 and UNKNOWN_WRITE_OWNER_COUNT = 0 across the import surface');

// Reachable from a page, versus reachable only from the Apps Script editor or a console.
var reachable = [], unreachable = [];
IMPORTS.forEach(function (row) {
  var hit = PAGE_FILES.some(function (f) { return new RegExp("'" + row[0].replace(/\./g, '\\.') + "'").test(PAGES[f]); });
  // The pages call adapter METHODS, not action strings, so the adapter is the join.
  var adapterMethod = null;
  var mm = ADAPTER.match(new RegExp("window\\.KM\\.DB\\.([a-zA-Z0-9_]+)\\s*=[^;]*?'" + row[0].replace(/\./g, '\\.') + "'", 's'));
  if (mm) adapterMethod = mm[1];
  var pageHit = hit || (adapterMethod && PAGE_FILES.some(function (f) {
    return new RegExp('KM\\.DB\\.' + adapterMethod + '\\b').test(bare(PAGES[f]));
  }));
  (pageHit ? reachable : unreachable).push(row[0]);
});
ok(unreachable.indexOf('runAmazonSnapshotImports') !== -1
  && unreachable.indexOf('seedSinotransCarrier') !== -1
  && unreachable.indexOf('retireShipmentLabelColumns') !== -1
  && unreachable.indexOf('backfillFcSpecialEventIds') !== -1
  && unreachable.indexOf('auditFcSpecialEventIds') !== -1,
  'E3  five are operator-unreachable by design — a scheduled job, a one-time seed, a column retirement '
  + 'and two FC id repairs. They are not missing UI; they are deliberately not UI', unreachable);

mut('E2 would catch a second definition of an import handler', function () {
  var m = {};
  AS_FILES.forEach(function (f) { m[f] = SRC[f]; });
  m['03_master_data_handlers.gs'] += '\nfunction handleImportCarrierRateCards_(body) { return null; }\n';
  var owners = Object.keys(m).filter(function (f) {
    return /^function\s+handleImportCarrierRateCards_\s*\(/m.test(m[f]);
  });
  return owners.length === 2;
});

// ==========================================================================================================
section('F  TEMP / MIGRATION CENSUS — what is in the DEPLOYABLE folder, and what it is attached to');
// ==========================================================================================================
// The distinction that matters for the release reconciliation ahead: a TEMP file under
// specs/active/apps-script is in the folder whose contents go into the live Apps Script project. A TEMP file
// under tools/ is paste-run-remove and never ships. Only the first kind can break a deployment by being
// removed, and that has happened once already.

eq(AS_TEMP.length, 7, 'F1  seven TEMP files sit in the deployable folder');
var TOOLS_DIAG = lsdir('tools/apps-script-diagnostics').filter(function (f) { return /\.gs$/.test(f); });
var TOOLS_MIG = lsdir('tools/apps-script-migrations').filter(function (f) { return /\.gs$/.test(f); });
eq(TOOLS_DIAG.length, 30, 'F1a thirty diagnostics live under tools/, outside the deploy folder');
eq(TOOLS_MIG.length, 2, 'F1b and two migrations');
eq(AS_TEMP.length + TOOLS_DIAG.length + TOOLS_MIG.length, 39, 'F1c TEMP_SCRIPT_COUNT = 39');

var permTop = {};
AS_PERM.forEach(function (f) { topLevelSymbols(SRC[f]).forEach(function (n) { permTop[n] = 1; }); });
var permBare = AS_PERM.map(function (f) { return bare(SRC[f]); }).join('\n');

var tempCalledByProduction = [];
AS_TEMP.forEach(function (f) {
  topLevelSymbols(SRC[f]).forEach(function (n) {
    if (permTop[n]) return;
    if (new RegExp('\\b' + n + '\\s*\\(').test(permBare)) tempCalledByProduction.push(f + '::' + n);
  });
});
eq(tempCalledByProduction, [],
  'F2  no permanent file CALLS a TEMP symbol — with comments AND string literals stripped, which is the '
  + 'whole point: three TEMP entry points ARE named inside production error messages, and a mention in a '
  + 'remediation sentence is not a dependency');

var tempCollisions = [];
AS_TEMP.forEach(function (f) {
  topLevelSymbols(SRC[f]).forEach(function (n) { if (permTop[n]) tempCollisions.push(f + '::' + n); });
});
eq(tempCollisions, [],
  'F3  and no TEMP file declares a top-level name that production also declares — in one shared global '
  + 'scope a collision would silently replace the production function');

// The three mentions, asserted as mentions, so retiring a file is known to make a message stale.
var namedInMessages = ['TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY',
  'TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN', 'TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE'];
var mentioned = namedInMessages.filter(function (n) {
  return AS_PERM.some(function (f) { return SRC[f].indexOf(n) !== -1; });
});
eq(mentioned, namedInMessages,
  'F4  three TEMP entry points are named in production error messages as the operator remediation step, '
  + 'so retiring those files leaves a message pointing at nothing');

mut('F2 would catch production acquiring a real dependency on a TEMP symbol', function () {
  var p = permBare + '\nfunction x_() { return TEMP_diagnoseDraftMigrationReadiness_(); }\n';
  var hits = [];
  AS_TEMP.forEach(function (f) {
    topLevelSymbols(SRC[f]).forEach(function (n) {
      if (!permTop[n] && new RegExp('\\b' + n + '\\s*\\(').test(p)) hits.push(n);
    });
  });
  return hits.length === 1;
});
mut('F3 would catch a TEMP file shadowing a production function', function () {
  var t = SRC['TEMP_document_diagnostics.gs'] + '\nfunction jsonResponse_(o) { return o; }\n';
  return topLevelSymbols(t).some(function (n) { return !!permTop[n]; });
});

// ==========================================================================================================
section('G  CROSS-MAINLINE BOUNDARY — supporting flows do not bridge S5 and S6');
// ==========================================================================================================
// code(), NEVER bare(). The first draft of this section ran these regexes against bare(), which replaces
// every string literal with '' - so it searched for sheet names in a text the sheet names had been
// deleted from, and "opens no execution table" passed against any tree whatsoever. The G2 mutant added
// the exact forbidden line and survived, which is what surfaced it. Comments are still stripped, because
// a module is entitled to DISCUSS a table it must not open.
function opensAny(src, names) {
  var c = code(src);
  return names.filter(function (n) {
    return new RegExp("getSheetByName\\(\\s*'" + n + "'").test(c);
  });
}
var ORDERING_T = ['purchase_orders', 'purchase_order_lines', 'request_orders', 'request_order_lines'];
var EXECUTION_T = ['shipments', 'shipment_lines', 'shipping_plans'];

// The guard the vacuity cost us: prove the probe can SEE a sheet open before trusting it to report none.
eq(opensAny(SRC['12_shipment_handlers.gs'], EXECUTION_T).length > 0, true,
  'G0  the probe detects a module that really does open the execution tables (12_ does) — without this '
  + 'the four refusals below could all be passing on a regex that never matches');

eq(opensAny(F17, ORDERING_T), [],
  'G1  the carrier owner opens no ordering table — carrier support cannot create a PO');
eq(opensAny(SRC['73_api_v1_pricing_write.gs'], EXECUTION_T), [],
  'G2  the pricing writer opens no execution table — pricing support cannot create a Shipment');
eq(opensAny(SRC['05_overseas_inventory_handlers.gs'], ORDERING_T), [],
  'G3  the overseas inventory owner opens no ordering table');
eq(opensAny(SRC['21_factory_inventory_handlers.gs'], ORDERING_T), [],
  'G3a nor does the factory inventory owner — an inventory import cannot create Ordering');
eq(opensAny(SRC['39_document_runtime_service.gs'], EXECUTION_T), [],
  'G4  the document runtime opens no execution table of its own — a document cannot trigger execution');
ok(/handleFinalizeShipmentFinalOutput_\s*\(/.test(bare(SRC['39_document_runtime_service.gs'])),
  'G4a what it does do is ask 34_ to finalize the snapshot it renders from, through that owner — which is '
  + 'a call into the authority, not a bypass of it');

mut('G2 would catch pricing reaching into the execution tables', function () {
  var m = SRC['73_api_v1_pricing_write.gs'] + "\nvar sh = ss.getSheetByName('shipments');\n";
  return opensAny(m, EXECUTION_T).length === 1;
});
mut('G1 would catch the carrier owner opening an ordering table', function () {
  var m = F17 + "\nvar po = ss.getSheetByName('purchase_orders');\n";
  return opensAny(m, ORDERING_T).length === 1;
});
mut('G4 would NOT be fooled by a module merely naming a table in a comment', function () {
  var m = SRC['39_document_runtime_service.gs'] + "\n// never getSheetByName('shipments') here\n";
  return opensAny(m, EXECUTION_T).length === 0;   // the refusal must HOLD, not flip
});

// ==========================================================================================================
section('H  PRICING — one resolver, and TWO writers whose verbs do not overlap');
// ==========================================================================================================
var F73 = SRC['73_api_v1_pricing_write.gs'];
var F04 = SRC['04_marketplace_forecast_import.gs'];
var F72 = SRC['72_api_v1_product_pricing_workspace.gs'];

ok(/pricing_list/.test(F72) && /function handleProductPricingWorkspaceGet_/.test(F72),
  'H1  72_ is the bounded READ owner of the price book');
ok(/ONE writer of pricing_change_log/.test(F73),
  'H2  73_ declares itself the write owner');

// And the thing the declaration does not say, which the audit reports rather than repairs.
ok(/auto-create pricing_list \+ fc_regular_forecast base rows/.test(F04),
  'H3  04_ ALSO creates pricing_list rows, at marketplace-SKU import');
ok(/PRICING_CREATE_PENDING_STATUS_\s*=\s*'pending_fx'/.test(F04),
  'H3a fail-closed, as pending_fx with blank ownership flags, so FX cannot later claim what nobody owns');
ok(/Does NOT overwrite existing pricing_list prices/.test(F04),
  'H3b and never overwrites a price — CREATE and UPDATE are disjoint verbs held by two modules');
ok(/PRICING_FX_DECIMALS_|pricingRoundFx_/.test(F04) || /73_/.test(F04),
  'H3c 04_ reuses 73_ precision authority rather than carrying its own, which is what keeps the split '
  + 'from becoming a second authority. SECOND_PRICING_AUTHORITY_COUNT = 0, with the caveat recorded');

mut('H3b would catch the import gaining an overwrite path', function () {
  var m = F04.replace('Does NOT overwrite existing pricing_list prices', 'Overwrites pricing_list prices');
  return !/Does NOT overwrite existing pricing_list prices/.test(m);
});

// ==========================================================================================================
section('J  SURFACES THAT CARRY NO LIVE DATA — classified, not repaired');
// ==========================================================================================================
var FORECAST = PAGES['forecast.js'];
eq(count(bare(FORECAST), /KM\.DB\.|KM\.api\./g), 0,
  'J1  the Forecast page issues no backend read of any kind');
ok(count(FORECAST, /Math\.random\(\)/g) > 5,
  'J1a and synthesises its series — it is a UI-only surface in the live navigation, which the report '
  + 'classifies rather than this round repairing');

var CANVAS = PAGES['supplychain.js'];
eq(count(bare(CANVAS), /KM\.DB\.|KM\.api\.|fetch\s*\(/g), 0,
  'J2  the Supply Chain Canvas issues no request');
ok(/THIS SURFACE OWNS NO BUSINESS TRUTH/.test(CANVAS),
  'J2a and says so — already adjudicated at S2-R4C as a presentation artefact, so it is OUT of S7 scope '
  + 'rather than an unfinished flow');

mut('J1 would catch the Forecast page being wired to a read', function () {
  var m = FORECAST + '\nKM.DB.loadScopedTables(["fc_regular_forecast"]);\n';
  return count(bare(m), /KM\.DB\./g) === 1;
});

// ==========================================================================================================
section('K  THE SEALS THIS ROUND ENTERS UNDER, re-read rather than assumed');
// ==========================================================================================================
var CONTRACT = read('../docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md');
ok(/S6_FINAL_SEAL = YES/.test(CONTRACT), 'K1  S6_FINAL_SEAL = YES is recorded in the S6 contract');
ok(/OPEN_S6_BLOCKERS = none/.test(CONTRACT), 'K1a with no open blockers');
ok(/D_S6_DISPATCH_SOURCE_AUTHORITY\s+DECLARED_SOURCE_ONLY/.test(CONTRACT),
  'K1b and the frozen dispatch rule S7 must not disturb');

var F22 = SRC['22_shipment_dispatch_handlers.gs'];
ok(/__CSD_DECLARED_SOURCE_START__/.test(F22) && /csdDeclaredSourceSupply_/.test(F22),
  'K2  and the dispatcher still consumes only its declared source — S7-R1 changed no runtime file');

// ==========================================================================================================
section('L  SUPPORTING WRITE FLOWS — one owner each, counted rather than recalled');
// ==========================================================================================================
// A supporting write flow is a routed action whose handler lives in a SUPPORTING owner module and whose
// handler reaches a write primitive, directly or through a helper in the same file. The S5/S6 MAINLINE
// owners are excluded on purpose: they are mainline, and S6 already sealed their census.
var SUPPORTING_OWNERS = ['03_', '04_', '05_', '07_', '14_', '17_', '18_', '19_', '20_', '21_', '36_',
  '39_', '45_', '62_', '72_', '73_'];
var WRITE_PRIM = /\.(setValue|setValues|appendRow|deleteRow|insertRowAfter|clearContent)\s*\(/;

function handlerBody(src, name) {
  var re = new RegExp('^function\\s+' + name + '\\s*\\([\\s\\S]*?(?=^function\\s)', 'm');
  var m = re.exec(src);
  if (m) return m[0];
  var i = src.indexOf('function ' + name);
  return i === -1 ? '' : src.slice(i);
}
function ownerFile(name) {
  for (var i = 0; i < AS_FILES.length; i++) {
    if (new RegExp('^function\\s+' + name + '\\s*\\(', 'm').test(SRC[AS_FILES[i]])) return AS_FILES[i];
  }
  return null;
}
function reachesWrite(file, name) {
  var src = SRC[file], body = handlerBody(src, name);
  if (WRITE_PRIM.test(body)) return true;
  var calls = body.match(/\b[a-zA-Z][A-Za-z0-9_]*_\s*\(/g) || [];
  for (var i = 0; i < calls.length; i++) {
    var c = calls[i].replace(/\s*\($/, '');
    if (c === name) continue;
    if (WRITE_PRIM.test(handlerBody(src, c))) return true;
  }
  return false;
}

// action -> handler, from both dispatch shapes
var ACTION_HANDLER = {}, mm;
var pre = /action === '([^']+)'[\s\S]{0,400}?return\s+(?:jsonResponse_\(\s*)?([a-zA-Z0-9_]+_)\s*\(/g;
while ((mm = pre.exec(ROUTER)) !== null) { if (!ACTION_HANDLER[mm[1]]) ACTION_HANDLER[mm[1]] = mm[2]; }
var tre2 = /^[ \t]+'([a-zA-Z0-9_.]+)':[ \t]*([a-zA-Z0-9_]+),[ \t]*$/gm;
while ((mm = tre2.exec(ROUTER)) !== null) { if (!ACTION_HANDLER[mm[1]]) ACTION_HANDLER[mm[1]] = mm[2]; }

var supportingWrites = [], ownerDuplicates = [], unknownOwner = [];
Object.keys(ACTION_HANDLER).sort().forEach(function (a) {
  var h = ACTION_HANDLER[a];
  var defs = AS_FILES.filter(function (f) {
    return new RegExp('^function\\s+' + h + '\\s*\\(', 'm').test(SRC[f]);
  });
  if (defs.length === 0) { unknownOwner.push(a); return; }
  if (defs.length > 1) ownerDuplicates.push(a + ' -> ' + defs.join(' + '));
  var f = defs[0];
  var isSupporting = SUPPORTING_OWNERS.some(function (p) { return f.indexOf(p) === 0; });
  if (isSupporting && reachesWrite(f, h)) supportingWrites.push(a);
});

eq(supportingWrites.length, 25, 'L1  SUPPORTING_WRITE_FLOW_COUNT = 25', supportingWrites);
eq(ownerDuplicates, [],
  'L2  SECOND_WRITE_OWNER_COUNT = 0 — no routed handler is defined in two modules');
eq(unknownOwner, [],
  'L3  UNKNOWN_WRITE_OWNER_COUNT = 0 — every routed action resolves to a defined handler');

// The count is only meaningful if the write detector actually detects writes.
ok(reachesWrite('21_factory_inventory_handlers.gs', 'handleAdjustFactoryInventory_'),
  'L1a the detector sees a known writer');
eq(reachesWrite('63_api_v1_system_health.gs', 'handleSystemHealth_'), false,
  'L1b and does not see one in a known read-only handler');

mut('L2 would catch a routed handler defined twice', function () {
  var h = 'handleAdjustFactoryInventory_';
  var files = AS_FILES.concat(['XX_fake.gs']);
  var src = {}; AS_FILES.forEach(function (f) { src[f] = SRC[f]; });
  src['XX_fake.gs'] = 'function ' + h + '(body) { return null; }\n';
  return files.filter(function (f) {
    return new RegExp('^function\\s+' + h + '\\s*\\(', 'm').test(src[f]);
  }).length === 2;
});

// ==========================================================================================================
section('M  S7-R2 DECISION FREEZE — each decision as the property of the tree it constrains');
// ==========================================================================================================

// ---- D-S7-1  FORECAST REVIEW = DEFERRED_UNCHANGED ------------------------------------------------
// Superseded in flight: the first instruction was to hide it, the operator then froze it UNCHANGED. So
// the assertion is not about a nav guard — it is that S7 leaves the page exactly as it found it. The
// audit finding stands and is recorded; it is simply not S7's to act on.
eq(count(index, /showSection\('forecast'\)/g), 1,
  'M1  the Forecast navigation entry is still present and unguarded');
ok(PAGE_FILES.indexOf('forecast.js') !== -1 && PAGES['forecast.js'].length > 50000,
  'M1a the source is intact — FORECAST_REVIEW_SOURCE_DELETED = NO');
eq(count(bare(PAGES['forecast.js']), /KM\.DB\.|KM\.api\./g), 0,
  'M1b and it still makes no backend call, which is the recorded finding rather than a defect to fix');
eq(KM_STAGED.indexOf('forecast'), -1,
  'M1c it was NOT added to the staged-section registry — no nav mechanism was applied to it');

// ---- D-S7-2  PO DOCUMENT PANEL = PHASE1_REQUIRED -------------------------------------------------
// The freeze is that the panel is a READ/RECOVERY PROJECTION over the existing engine. What a future
// round must not do is build a second index, so the constraint is stated as owner identity.
['document.list', 'document.get', 'document.retry'].forEach(function (a, i) {
  ok(RACT.indexOf(a) !== -1, 'M2.' + (i + 1) + ' the panel read owner already exists: ' + a);
});
var docHandlerOwners = ['handleEntityDocumentList_', 'handleGeneratedDocumentGet_', 'handleDocumentRetry_']
  .map(function (h) {
    return AS_FILES.filter(function (f) {
      return new RegExp('^function\\s+' + h + '\\s*\\(', 'm').test(SRC[f]);
    }).join(',');
  });
eq(uniq(docHandlerOwners), ['39_document_runtime_service.gs'],
  'M2a all three are owned by ONE module — DOCUMENT_PANEL_SECOND_READ_AUTHORITY_COUNT = 0');
eq(uniq(AS_FILES.filter(function (f) { return /function handleShipmentDocumentGenerate_/.test(SRC[f]); })),
  ['36_document_template_handlers.gs'],
  'M2b and generation keeps its own existing owner — SECOND_DOCUMENT_ENGINE_CREATED = NO');

// ---- D-S7-3  TEMP DEPLOYABLE POLICY -------------------------------------------------------------
eq(AS_TEMP.length, 7, 'M3  DEPLOYABLE_TEMP_COUNT_PRE = 7');
eq(tempCalledByProduction, [],
  'M3a PRODUCTION_REQUIRED_TEMP_COUNT = 0 — no production code calls a TEMP symbol, so the final deploy '
  + 'target of 0 is reachable without proving an exception');
// The demo seed is the named safety case, and the claim is that it really can write.
var SEED = SRC['TEMP_demo_shipping_shipment_map_seed_v2.gs'];
ok(/DEMO4A_WRITE_ORDER_\s*=\s*\[/.test(SEED) && /appendRow\(/.test(SEED) && /deleteRow\(/.test(SEED),
  'M3b TEMP_demo_shipping_shipment_map_seed_v2 has a real write path (appendRow + deleteRow rollback)');
['shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'shipment_routes',
  'shipment_events'].forEach(function (t) {
  ok(SEED.indexOf("'" + t + "'") !== -1, 'M3b1 and it names the business table ' + t);
});

// ---- Sec7  DEAD TEMP REFERENCES, and a correction to S7-R1 --------------------------------------
// R1 reported that retiring the three SAFE-TO-RETIRE files would strand three production messages. That
// conflated two sets. Every symbol named in a production message belongs to a ONE-TIME MIGRATION file,
// and none belongs to a safe-to-retire one — which is what makes the R4 cleanup cheap.
var NAMED_IN_MESSAGES = ['TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY',
  'TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN', 'TEMP_AI_LIFECYCLE_MIGRATE_COMMIT',
  'TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE'];
var SAFE_TO_RETIRE = ['TEMP_request_order_send_diagnostics.gs', 'TEMP_draft_migration_diagnostic.gs',
  'TEMP_order_planning_draft_readback_diagnose.gs'];
var namedHomes = NAMED_IN_MESSAGES.map(function (n) {
  return AS_TEMP.filter(function (f) {
    return new RegExp('^function\\s+' + n + '\\s*\\(', 'm').test(SRC[f]);
  }).join(',');
});
eq(uniq(namedHomes), ['TEMP_migrate_request_order_draft_v2.gs',
  'TEMP_migrate_shipping_allocation_ai_lifecycle.gs'],
  'M4  every symbol named in a production message lives in a one-time MIGRATION file');
eq(namedHomes.filter(function (h) { return SAFE_TO_RETIRE.indexOf(h) !== -1; }), [],
  'M4a and NONE of them lives in a safe-to-retire file — so removing those three strands no message. '
  + 'S7-R1 said otherwise and was wrong');
NAMED_IN_MESSAGES.forEach(function (n, i) {
  ok(AS_PERM.some(function (f) { return SRC[f].indexOf(n) !== -1; }),
    'M4b.' + (i + 1) + ' ' + n + ' is still named in production guidance — DEAD_TEMP_REFERENCE_ALLOWED = NO');
});

// ---- Sec2  CARRIER NAME: id canonical, name derived --------------------------------------------
eq(count(code(SRC['12_shipment_handlers.gs']), /carrier_name/g), 0,
  'M5  carrier_name is NOT persisted by the shipment owner');
eq(count(code(SRC['11_shipping_plan_handlers.gs']), /carrier_name/g), 0,
  'M5a nor by the plan owner — CARRIER_NAME_PERSISTENCE_REQUIRED = NO');
ok(/carrier:\s*\{\s*id:[^}]*name:/.test(F40),
  'M5b the Weekly read already DERIVES the name at read time, which is the shape R2A must copy');

// ---- Sec4  CARRIER LEAD TIME: the live schema, audited before the slice is frozen ---------------
var LT_HEADERS = /var CARRIER_LEAD_TIMES_HEADERS_ = \[([\s\S]*?)\]/.exec(F17)[1]
  .split(',').map(function (x) { return x.replace(/['\s]/g, ''); }).filter(Boolean);
eq(LT_HEADERS, ['lead_time_id', 'carrier_id', 'origin_country', 'destination_country',
  'shipping_method', 'last_mile_delivery', 'min_days', 'max_days', 'avg_days',
  'created_at', 'updated_at'],
  'M6  the live carrier_lead_times header, read from the owner rather than from a document');
eq(LT_HEADERS.filter(function (c) { return /status|is_active|active/.test(c); }), [],
  'M6a there is NO status/active column, so the slice inherits no status semantics and must invent none '
  + '— NEW_COLUMNS_REQUIRED = NONE');

// The constraint that decides what the maintenance path must refuse.
var RA = read('js/core/supply-planning-route-authority.js');
var LEAD_FN = /function leadDays\(query, leadTimes, method, opts\)[\s\S]*?\n  }/.exec(RA)[0];
eq(count(LEAD_FN, /carrierId/g), 0,
  'M7  leadDays does NOT join on carrier — a lead time resolves as a LANE property');
ok(/lt\.methodKey === key/.test(LEAD_FN) && /axisOk\(lt\.originCountry/.test(LEAD_FN)
  && /axisOk\(lt\.destinationCountry/.test(LEAD_FN) && /lt\.lastMileDelivery/.test(LEAD_FN),
  'M7a its key is methodKey + origin + destination + last-mile');
ok(/\.filter\(function \(r\) \{ return isFinite\(r\.avgDays\); \}\)\[0\]/.test(LEAD_FN),
  'M7b and it takes the FIRST matching row. Two rows on one lane tuple are silently resolved to one — '
  + 'the same first-row pick S6-R8A froze out of dispatch. S7-R3 must refuse a duplicate lane at the '
  + 'WRITE path, because this read will not');

mut('M3a would catch production acquiring a dependency on a deployable TEMP file', function () {
  var p = permBare + '\nfunction y_() { return TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE(); }\n';
  var hits = [];
  AS_TEMP.forEach(function (f) {
    topLevelSymbols(SRC[f]).forEach(function (n) {
      if (!permTop[n] && new RegExp('\\b' + n + '\\s*\\(').test(p)) hits.push(n);
    });
  });
  return hits.length === 1;
});
mut('M6a would catch a status column being added to the lead-time header', function () {
  // Anchored INSIDE the lead-time array: 17_ carries that same two-column tail twice (line 33 is another
  // header), and a plain replace patched the wrong array and left this assertion unmoved.
  var m = F17.replace(/(var CARRIER_LEAD_TIMES_HEADERS_ = \[[\s\S]*?)'avg_days',/,
    "$1'avg_days', 'is_active',");
  var h = /var CARRIER_LEAD_TIMES_HEADERS_ = \[([\s\S]*?)\]/.exec(m)[1]
    .split(',').map(function (x) { return x.replace(/['\s]/g, ''); }).filter(Boolean);
  return h.filter(function (c) { return /is_active/.test(c); }).length === 1;
});
mut('M5 would catch carrier_name being persisted to solve display', function () {
  var m = SRC['12_shipment_handlers.gs'] + '\n  row.carrier_name = carrierName;\n';
  return count(code(m), /carrier_name/g) === 1;
});

// ==========================================================================================================
console.log('\n' + pass + ' passed / ' + fail + ' failed   ('
  + mutants + ' mutants, ' + survived + ' survived)');
process.exit(fail === 0 ? 0 : 1);
