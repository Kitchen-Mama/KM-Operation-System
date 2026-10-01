// S7-R2B — EXISTING DOCUMENT PANEL COMPLETENESS + GENERATED-DOCUMENT REDISCOVERY CONFORMANCE.
//
// S7-R1 concluded the Document Panels did not exist. S7-R2A disproved that. This round starts from
// DOCUMENT_PANEL_EXISTS = YES and asks the only question left: is the panel that EXISTS complete enough for
// Phase-1 operator rediscovery and recovery.
//
// ANSWER: rediscovery is complete on both surfaces and was never the problem. RECOVERY is broken on both.
//
//   FINDING 1 (BLOCKING, both surfaces) — the Retry button's arguments are transposed against the function it
//   calls. shRetryDocument(entityType, entityId, btnEl) is invoked as (entityId, generated_document_id, this),
//   so document.retry receives related_entity_type = an entity ID and related_entity_id = a DOCUMENT id. The
//   backend lowercases the type, compares it against 'purchase_order', never matches, and runs the SHIPMENT
//   generator against an id that is not a shipment. Retry cannot work on either surface.
//
//   FINDING 2 (FUNCTIONAL, PO only) — on success the handler calls _shLoadAndRender() unconditionally, the
//   SHIPMENT page's re-read. From the PO panel that issues a shipment workspace request and leaves the panel
//   the operator is looking at untouched: a retry that landed looks like one that did nothing.
//
// NEITHER IS REPAIRED IN THIS COMMIT, and section P says why in a number: the s4-r5 boot-payload floor has 58
// bytes of headroom, and both panel owners are boot-loaded scripts. The smallest correct fix is ~2.2 KB. The
// assertions below therefore pin the defects AS FOUND — the same adjudication S7-R2A made for the Weekly
// carrier render — so that the repair round inherits a failing-shaped tree it must change, not a green one.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. NO DRIVE. Fixtures only.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s7-r2b-document-panel-audit.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }

var GS = 'specs/active/apps-script/';
var G39 = read(GS + '39_document_runtime_service.gs');
var G36 = read(GS + '36_document_template_handlers.gs');
var G50 = read(GS + '50_api_v1_purchase_order_workspace.gs');
var G57 = read(GS + '57_api_v1_shipment_workspace.gs');
var RTR = read(GS + '01_router.gs');
var SH = read('js/pages/shipping-history.js');
var POJS = read('js/pages/purchase-order-overview.js');
var API = read('js/api/operation-system-db-api.js');
var POL = read('js/pages/purchase-order-list.js');
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
function slice(src, from, to, tag) {
  var a = src.indexOf(from); if (a < 0) throw new Error(tag + ': start anchor drifted');
  var b = src.indexOf(to, a); if (b < 0) throw new Error(tag + ': end anchor drifted');
  return src.slice(a, b + to.length);
}

// ---- the SHIPPED pure backend, executed -------------------------------------------------------------------
// 39_ declares everything above __DGS_PURE_END__ pure — no DriveApp, no SpreadsheetApp, no clock, no router.
// Taking it at its word and RUNNING it is the only way to make a claim about what a status means.
// dgsDocumentDto_ and its label table sit BELOW the pure marker, but they read only the helpers above it
// — no Drive, no sheet, no clock. Appended so the DTO can be RUN rather than pattern-matched.
var PURE39 = slice(lf(G39), 'function dgsStr_(', '// __DGS_PURE_END__', 'G39 pure prelude')
  + '\n'
  + slice(lf(G39), 'function dgsDocumentDto_(row) {', '  return base;\n}', 'G39 DTO');
var B = {};
(function () {
  var sandbox = { GENERATED_DOCUMENTS_HEADERS_: [], Logger: { log: function () {} } };
  vm.createContext(sandbox);
  vm.runInContext(PURE39, sandbox);
  B.rowState = sandbox.dgsRowState_;
  B.batchState = sandbox.dgsBatchState_;
  B.dto = sandbox.dgsDocumentDto_;
})();
ok(typeof B.rowState === 'function' && typeof B.batchState === 'function' && typeof B.dto === 'function',
  'S1  the shipped 39_ pure prelude loaded and exposes the three interpretation owners');

// ---- the SHIPPED panel, executed --------------------------------------------------------------------------
var PANEL_SRC = slice(lf(SH), 'var SH_DOC_PANEL_VISIBLE_ROWS_ = 5;',
  "head + body + _shDocErrorHtml(model, state) + '<div style=\"margin-top:6px;\">' + badge + '</div>' +\n    '</div>';\n}", 'panel block');
var ESC_SRC = slice(lf(SH), 'function _shEsc(s) {', "\n}", '_shEsc');
var P = {};
(function () {
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(ESC_SRC + '\n' + PANEL_SRC, sandbox);
  P.panel = sandbox.shDocumentPanelHtml;
  P.state = sandbox.shDocPanelState;
  P.row = sandbox._shDocRowHtml;
})();
ok(typeof P.panel === 'function' && typeof P.state === 'function',
  'S2  the shipped Document Panel renderer loaded and runs outside a browser');

function doc(o) {
  o = o || {};
  return {
    generated_document_id: o.id || 'GD-1', related_entity_type: o.etype || 'shipment',
    related_entity_id: o.eid || 'SHP-1', document_type: o.type || 'packing_list',
    document_label: o.label || 'Packing List', file_name: o.file || 'PL.pdf',
    file_url: o.url === undefined ? 'https://example.invalid/f' : o.url,
    download_url: o.dl === undefined ? 'https://example.invalid/d' : o.dl,
    status: o.status || 'READY', retryable: o.retryable === true, generated_at: '2026-10-01T00:00'
  };
}

// ==========================================================================================================
section('A  OWNER MAP — one engine, one renderer, and the chain between them');
// ==========================================================================================================
ok(/function handleEntityDocumentList_\(body\)/.test(G39), 'A1  document.list owner is 39_');
ok(/function handleGeneratedDocumentGet_\(body\)/.test(G39), 'A1a document.get owner is 39_');
ok(/function handleDocumentRetry_\(body\)/.test(G39), 'A1b document.retry owner is 39_');
ok(/if \(action === 'document\.list'\)[\s\S]{0,80}handleEntityDocumentList_/.test(RTR)
  && /if \(action === 'document\.get'\)[\s\S]{0,80}handleGeneratedDocumentGet_/.test(RTR)
  && /if \(action === 'document\.retry'\)[\s\S]{0,80}handleDocumentRetry_/.test(RTR),
  'A1c and the router dispatches all three to them — MISSING_DOCUMENT_ROUTER_ACTION_COUNT = 0');

// DOCUMENT_ENGINE_OWNER_COUNT = 1, counted rather than asserted: no other module answers these actions.
var GS_FILES = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) { return /\.gs$/.test(f); });
var engineOwners = GS_FILES.filter(function (f) {
  return /function handleDocumentRetry_\(/.test(read(GS + f));
});
eq(engineOwners, ['39_document_runtime_service.gs'],
  'A2  DOCUMENT_ENGINE_OWNER_COUNT = 1 — one file owns the retry/generation runtime');

// DOCUMENT_PANEL_RENDER_OWNER_COUNT = 1, counted across the whole browser tree.
var JS_FILES = [];
(function walk(dir) {
  fs.readdirSync(path.join(ROOT, dir)).forEach(function (f) {
    var rel = dir + '/' + f;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) return walk(rel);
    if (/\.js$/.test(f)) JS_FILES.push(rel);
  });
})('js');
var renderOwners = JS_FILES.filter(function (f) { return /function shDocumentPanelHtml\(/.test(read(f)); });
eq(renderOwners, ['js/pages/shipping-history.js'],
  'A3  DOCUMENT_PANEL_RENDER_OWNER_COUNT = 1 — nobody built a second panel');
ok(/window\.shDocumentPanelHtml = shDocumentPanelHtml;/.test(SH),
  'A3a and it is exported for the other surface to reuse rather than copy');

// ==========================================================================================================
section('B  SURFACES — two, and they are NOT the same feature set');
// ==========================================================================================================
var callers = JS_FILES.filter(function (f) {
  var c = code(read(f));
  return /shDocumentPanelHtml\(\{/.test(c);
});
eq(callers.sort(), ['js/pages/purchase-order-overview.js', 'js/pages/shipping-history.js'],
  'B1  DOCUMENT_PANEL_SURFACE_COUNT = 2 — Purchase Order Overview and the Shipment pages');
ok(/entity_type: 'purchase_order', entity_id: m\.id/.test(POJS),
  'B1a the PO caller declares its entity type and id');
ok(/entity_type: 'shipment', entity_id: sid/.test(SH),
  'B1b the Shipment caller declares its entity type and id');

// §2: do not assume both surfaces provide the same feature set. They do not.
ok(/function _shDocActionsHtml\(sid\)/.test(SH) && /function shGenerateShipmentDoc\(/.test(SH),
  'B2  the Shipment page ALSO carries a Generate widget the PO page does not have');
eq(count(code(POJS), /shGenerateShipmentDoc|_shDocActionsHtml/g), 0,
  'B2a which the PO page neither calls nor reimplements — the asymmetry is real and is not a PO gap');
// That widget keeps a browser-only result cache. It is NOT a document read authority: it never feeds the
// panel, and the panel never reads it. It is recorded here so the distinction cannot be lost later.
ok(/var _shDocResultCache = \{\};/.test(SH),
  'B2b the Generate widget caches its own last result in memory, for its immediate Download link only');
eq(count(code(PANEL_SRC), /_shDocResultCache/g), 0,
  'B2c and the panel renderer never reads that cache — rediscovery does not depend on browser memory. The widget is a second PRESENTATION path, not a second read authority over the registry');

// ==========================================================================================================
section('C  CANONICAL IDENTITY + ENTITY SCOPE — no cross-entity bleed');
// ==========================================================================================================
ok(/'document_id', 'template_id', 'template_key', 'template_version', 'related_entity_type', 'related_entity_id', 'document_type'/.test(G36),
  'C1  the registry keys documents by document_id + related_entity_type + related_entity_id');
var d1 = B.dto({ document_id: 'GD-9', related_entity_type: 'Shipment', related_entity_id: 'SHP-7',
  document_type: 'packing_list', status: 'generated', file_id: 'F', file_url: 'u', note: '' });
eq([d1.generated_document_id, d1.related_entity_type, d1.related_entity_id, d1.status],
  ['GD-9', 'shipment', 'SHP-7', 'READY'],
  'C1a and the DTO carries all four fields, with the type normalized to lower case');

// The grouper is where scope is ENFORCED. Both workspaces run the identical guard.
ok(/if \(dgsLc_\(r\.related_entity_type\) !== entityType\) return;/.test(G57),
  'C2  the Shipment workspace drops every row whose entity type is not shipment');
ok(/if \(dgsLc_\(r\.related_entity_type\) !== entityType\) return;/.test(G50),
  'C2a and the PO workspace does the same for purchase_order');
ok(/poWsGroupDocuments_\(tables\.generated_documents \|\| \[\], 'purchase_order'\)/.test(G50),
  'C2b PO groups with the literal purchase_order, so a shipment document cannot reach a PO card');
ok(/shipWsGroupDocuments_\(tables\.generated_documents \|\| \[\], 'shipment'\)/.test(G57),
  'C2c and Shipment groups with the literal shipment — DOCUMENT_ENTITY_SCOPE_DRIFT_COUNT = 0');
ok(/if \(entityType !== 'shipment' && entityType !== 'purchase_order'\) return jsonResponse_\(\{ success: false, error: 'UNSUPPORTED_RELATED_ENTITY_TYPE'/.test(G39),
  'C2d and the direct document.list path refuses any other entity type outright');

// ==========================================================================================================
section('D  READ AUTHORITY — one, and the browser never enumerates Drive');
// ==========================================================================================================
ok(/\{ name: 'generated_documents',  requiredCols: \[\], optional: true, include: 'documents' \}/.test(G50),
  'D1  the PO workspace reads the registry as a bounded, include-gated table');
ok(/\{ name: 'generated_documents',           requiredCols: \[\], optional: true, include: 'documents' \}/.test(G57),
  'D1a and so does the Shipment workspace — DOCUMENT_PANEL_READ_AUTHORITY = generated_documents');
eq(count(code(SH) + code(POJS), /DriveApp|drive\.google\.com\/drive\/folders\/[^'"]*\+/g), 0,
  'D2  neither surface enumerates Drive — SECOND_DOCUMENT_READ_AUTHORITY_COUNT = 0');
eq(count(code(SH) + code(POJS), /\.name\.match\(|file_name\.split\(|parseFilename/g), 0,
  'D2a and neither derives a document from a FILENAME');
ok(/dgsDocumentDto_\(r\)/.test(G50) && /dgsDocumentDto_\(r\)/.test(G57),
  'D3  both workspaces project through the ONE canonical DTO owner, so they cannot disagree');

// ==========================================================================================================
section('E  REDISCOVERY — the Phase-1 requirement, on fresh entry and on re-entry');
// ==========================================================================================================
ok(/include: \{ documents: true \}/.test(POJS),
  'E1  PO_DOCUMENT_REDISCOVERY_SUPPORTED — the PO page asks for the registry projection on its main read');
ok(/include: \{ documents: true \}/.test(SH),
  'E1a SHIPMENT_DOCUMENT_REDISCOVERY_SUPPORTED — the Shipment page does the same');
ok(/filters: \{ purchaseOrderId: id \}, include: \{ summary: false, filterOptions: false, documents: true \}/.test(POJS),
  'E1b and the PO bounded post-write readback asks for it too, so a write never blanks the panel');

// RE-ENTRY. Both pages render from the read model their ONE canonical read produced; neither consults any
// generation result. Proven by running the panel against a model that could only have come from a fresh read.
var fresh = P.panel({ title: 'Shipment Documents', entity_type: 'shipment', entity_id: 'SHP-1',
  documents: [doc({ id: 'GD-77' })], can_retry: false });
ok(/Packing List/.test(fresh) && /PL\.pdf/.test(fresh),
  'E2  PO_REENTRY / SHIPMENT_REENTRY — a document present in canonical read data renders with no prior state');
ok(/data-doc-state="READY"/.test(fresh),
  'E2a GENERATED_DOCUMENT_REDISCOVERABLE = YES — and it reads READY, from the registry row alone');
ok(fresh.indexOf('https://example.invalid/f') !== -1,
  'E2b DOCUMENT_ID_PRESERVED_AFTER_REENTRY — the row keeps its own file reference across the boundary');
// The panel is a pure string builder: it cannot carry state between entries even if someone wanted it to.
eq(P.panel({ documents: [doc({ id: 'GD-77' })] }), P.panel({ documents: [doc({ id: 'GD-77' })] }),
  'E3  the renderer is pure — two calls with equal input give equal output, so re-entry cannot drift');

// ==========================================================================================================
section('F  OPEN — the list payload already carries the link, so document.get is not forced');
// ==========================================================================================================
ok(/download_url: dgsStr_\(row\.pdf_file_url\) \|\| dgsStr_\(row\.file_url\)/.test(G39),
  'F1  the DTO resolves a download reference server-side');
var openable = P.panel({ entity_type: 'shipment', entity_id: 'SHP-1', documents: [doc({})] });
ok(/>Open</.test(openable) && />Download</.test(openable),
  'F2  PO_ / SHIPMENT_DOCUMENT_OPEN_SUPPORTED — the row offers Open and Download from the list payload');
var noFile = P.panel({ entity_type: 'shipment', entity_id: 'SHP-1', documents: [doc({ url: '', dl: '' })] });
ok(!/>Open</.test(noFile) && !/>Download</.test(noFile),
  'F2a and offers NEITHER when no artifact exists — never a fabricated link');
// §6 says record truthfully rather than forcing document.get. KM.DB.getGeneratedDocument EXISTS and has no
// caller, because the panel never needs it. That is a capability without a current need, not a missing wire —
// the distinction S7-R1 §5 got wrong about this very subsystem.
ok(/window\.KM\.DB\.getGeneratedDocument = function\(documentId\)/.test(API),
  'F3  the document.get adapter action exists');
var getCallers = JS_FILES.filter(function (f) { return /KM\.DB\.getGeneratedDocument\(/.test(code(read(f))); });
eq(getCallers, [],
  'F3a and has no caller — DOCUMENT_GET_PATH_USED_WHEN_REQUIRED = not required, because the list carries the link');

// ==========================================================================================================
section('G  RETRY — FINDING 1 and FINDING 2, pinned AS FOUND');
// ==========================================================================================================
// The backend contract first, so the shape of the defect is unambiguous.
ok(/var entityType = dgsLc_\(body && \(body\.related_entity_type \|\| body\.entity_type\)\);/.test(G39),
  'G1  document.retry reads related_entity_type as the ENTITY TYPE');
ok(/var res = \(entityType === 'purchase_order'\)/.test(G39),
  'G1a and routes to the PO generator ONLY when that type is exactly purchase_order');
ok(/window\.KM\.DB\.retryDocumentGeneration = function\(entityType, entityId\)/.test(API)
  && /related_entity_type: entityType, related_entity_id: entityId/.test(API),
  'G1b the adapter passes its two arguments straight through in that order');
ok(/function shRetryDocument\(entityType, entityId, btnEl\)/.test(SH),
  'G1c and the handler declares (entityType, entityId, btnEl)');

// FINDING 1 — the call site. This is the defect, asserted as the tree stands.
ok(/onclick="shRetryDocument\(\\'' \+ _shEsc\(entityId\) \+ '\\',\\'' \+ _shEsc\(\(d && d\.generated_document_id\) \|\| ''\) \+ '\\',this\)"/.test(SH),
  'G2  FINDING 1 — the Retry button passes (entityId, generated_document_id): the entity id lands in the '
  + 'TYPE slot and a DOCUMENT id lands in the entity-id slot. BLOCKING, both surfaces');
// Arity, not absence: the declaration text also matches any call, so 'this string is missing' could never
// have passed. What is true is that the row renderer takes THREE parameters and no caller supplies a fourth.
ok(/function _shDocRowHtml\(d, canRetry, entityId\) \{/.test(SH),
  'G2a the row renderer takes three parameters — the entity TYPE is not among them');
eq(count(code(SH), /_shDocRowHtml\(d, model\.can_retry === true, model\.entity_id\)/g), 2,
  'G2b and both call sites stop at entity_id, which is why the button had nothing else to pass');
// What the backend would then do with it — run, not argued.
eq(('SHP-0001'.toLowerCase() === 'purchase_order'), false,
  'G2c so a PO retry can never reach the PO generator: the lowercased entity id is not purchase_order');

// FINDING 2 — the refresh. Also asserted as found.
ok(/if \(res && res\.success\) \{ _shLoadAndRender\(\); return; \}/.test(SH),
  'G3  FINDING 2 — on success the handler always re-reads the SHIPMENT workspace, from whichever surface '
  + 'invoked it. FUNCTIONAL, PO only');
eq(count(code(SH), /SH_DOC_REFRESH_|shRegisterDocumentRefresh/g), 0,
  'G3a there is no per-surface refresh hook yet — the repair round adds one');
ok(/db\.retryDocumentGeneration\(entityType \|\| 'shipment', entityId\)/.test(SH),
  "G3b and the 'shipment' default silently mislabels any surface that passes nothing");

// What is NOT wrong with retry: the backend never duplicates a logical document.
ok(/if \(row && dgsRowState_\(row\) === 'READY'\) reuse\.push/.test(G39),
  'G4  a READY document is REUSED by the retry planner, never re-rendered');
eq(B.rowState({ status: 'cancelled', note: '' }), 'SUPERSEDED',
  'G4a a superseded attempt resolves to SUPERSEDED');
ok(/live = rows\.filter\(function \(r\) \{ return dgsRowState_\(r\) !== 'SUPERSEDED'; \}\)/.test(G39),
  'G4b and the read path drops it, so one logical document shows ONE row — '
  + 'RETRY_CREATES_SECOND_LOGICAL_DOCUMENT_COUNT = 0');

// ==========================================================================================================
section('H  STATUS TRUTH — no false success, no false failure');
// ==========================================================================================================
eq(B.rowState({ status: 'generated', file_id: '', note: '' }), 'GENERATING',
  'H1  a generated row with NO file is GENERATING, not READY — DOCUMENT_FALSE_SUCCESS_COUNT = 0');
eq(B.rowState({ status: 'generated', file_id: 'F', note: '' }), 'READY',
  'H1a and READY only once a file exists');
eq(B.rowState({ status: 'failed', note: 'DGS_REASON=X; DGS_RETRYABLE=1;' }), 'FAILED_RETRYABLE',
  'H2  a failed row carries its retryability from the canonical note');
eq(B.rowState({ status: 'failed', note: 'DGS_REASON=X; DGS_RETRYABLE=0;' }), 'FAILED_TERMINAL',
  'H2a and a terminal failure is not offered as retryable');
eq(B.batchState([{ status: 'generated', file_id: 'F', note: '' }], { expected: 5 }), 'PARTIAL',
  'H3  one document of five expected is PARTIAL, never READY — the panel trusts the backend count');
eq(P.state({ generation_status: 'PARTIAL', documents: [doc({})] }), 'PARTIAL',
  'H3a and the panel defers to that backend verdict over its own row tally');
eq(P.state({ documents: [doc({ status: 'FAILED' }), doc({ id: 'GD-2' })] }), 'PARTIAL',
  'H3b with no backend verdict, ready + failed is PARTIAL');
eq(P.state({ documents: [doc({ status: 'FAILED' })] }), 'FAILED',
  'H3c and all-failed is FAILED — DOCUMENT_FALSE_FAILURE_COUNT = 0, DOCUMENT_STATUS_DRIFT_COUNT = 0');

// ==========================================================================================================
section('J  EMPTY / UNREAD / READ-FAILED');
// ==========================================================================================================
eq(P.state({ documents: [] }), 'NONE', 'J1  READY_EMPTY reads as NONE — "No documents generated yet"');
eq(P.state({ checking: true, documents: [] }), 'CHECKING', 'J1a the UNREAD input exists and is honoured');
eq(P.state({ pending: true, documents: [] }), 'PENDING', 'J1b and so does PENDING');
// But NOTHING SUPPLIES THEM. Recorded as a finding rather than claimed as coverage: the panel can express
// UNREAD, and no caller ever does. It is not a live false-empty, because both pages render cards only AFTER
// their canonical read resolves — the loading region owns the interval before that.
eq(count(code(SH) + code(POJS), /checking:/g), 0,
  'J2  FINDING 3 — no caller ever passes `checking`, so the UNREAD state is unreachable');
eq(count(code(SH) + code(POJS), /documentsPending/g), 2,
  'J2a and `pending` is read from documentsPending, which no adapter or backend ever produces');
eq(count(code(API), /documentsPending/g), 0,
  'J2b DOCUMENT_FALSE_EMPTY_COUNT = 0 all the same: the panel is not rendered before the read resolves');
// READ_FAILED is owned one level up, identically on both pages, and deliberately fails closed.
ok(/function _shRenderError_\(err\) \{\s*\n?\s*_shReadModel = null;/.test(lf(SH)),
  'J3  a failed Shipment read nulls the model and shows a typed banner + Retry');
ok(/function _poRenderError_\(err\) \{\s*\n?\s*_poReadModel = null;/.test(lf(POJS)),
  'J3a and the PO page does exactly the same — symmetric, and an S4-R7 decision, not a document behaviour');
eq(count(code(SH) + code(POJS), /setInterval|setTimeout\([^)]*retryDocument/g), 0,
  'J4  DOCUMENT_PERMANENT_LOADING_COUNT = 0 — no poller can leave a panel spinning for ever');

// ==========================================================================================================
section('K  REQUEST BUDGET + WRITE TRUTH');
// ==========================================================================================================
// The panel is a pure string builder. It cannot issue a request on render, which is stronger than counting.
var many = P.panel({ entity_type: 'shipment', entity_id: 'SHP-1',
  documents: [doc({ id: 'A' }), doc({ id: 'B' }), doc({ id: 'C' }), doc({ id: 'D' }), doc({ id: 'E' }), doc({ id: 'F' })] });
ok(typeof many === 'string' && many.length > 0,
  'K1  PER_DOCUMENT_RENDER_REQUEST_COUNT = 0 — six documents render with no transport of any kind available');
ok(/View all \(6\)/.test(many),
  'K1a MULTI_DOCUMENT_COLLAPSE_COUNT = 0 — six rows stay six, five shown and the rest behind View all');
var typed = P.panel({ entity_type: 'shipment', entity_id: 'SHP-1',
  documents: [doc({ id: 'A', type: 'packing_list', label: 'Packing List' }),
              doc({ id: 'B', type: 'commercial_invoice', label: 'Commercial Invoice' })] });
ok(/Packing List/.test(typed) && /Commercial Invoice/.test(typed),
  'K1b DOCUMENT_TYPE_DRIFT_COUNT = 0 — two types render as two types');
eq(count(code(SH), /KM\.DB\.listEntityDocuments\(/g) + count(code(POJS), /KM\.DB\.listEntityDocuments\(/g), 0,
  'K2  DOCUMENT_LIST_REQUEST_COUNT_COLD/WARM = 0 additional — the list rides each page\'s existing workspace '
  + 'read, so there is no separate document request to duplicate');
eq(count(code(POJS), /include: \{ documents: true \}/g), 1,
  'K2a DUPLICATE_DOCUMENT_LIST_REQUEST_COUNT = 0 on the PO main read');
ok(/if \(btnEl\) \{ if \(btnEl\.disabled\) return; btnEl\.disabled = true;/.test(SH),
  'K3  RETRY_REQUEST_COUNT_PER_CLICK = 1 — the button disables itself before the call');
// WRITE TRUTH. The only write the panel can reach is retry, and only from a click.
eq(count(code(PANEL_SRC), /KM\.DB\.|fetch\(|getWorkspace/g), 0,
  'K4  DOCUMENT_PANEL_MOUNT_WRITE_COUNT = 0 — the renderer reaches no adapter, no transport, nothing');
eq(count(code(SH), /retryDocumentGeneration\(/g), 1,
  'K4a DOCUMENT_AUTORETRY_COUNT = 0 — exactly one call site, inside the click handler');

// ==========================================================================================================
section('L  DOCUMENT FAMILIES + API MIGRATION');
// ==========================================================================================================
ok(/purchase_order: 'Purchase Order', shipment_detail: 'Shipment Detail',/.test(G39)
  && /commercial_invoice: 'Commercial Invoice', packing_list: 'Packing List', carrier_booking_form: 'Carrier Booking'/.test(G39),
  'L1  CURRENT_DOCUMENT_TYPE_SET = purchase_order · shipment_detail · commercial_invoice · packing_list · '
  + 'carrier_booking_form');
ok(/class_key: 'CARRIER_BOOKING'[\s\S]{0,240}renderer_available: false/.test(G39),
  'L1a and carrier_booking_form is declared with NO renderer — a class without a runtime, classified not built');
eq(count(code(SH) + code(POJS) + code(API), /google\.script\.run/g), 0,
  'L2  LEGACY_DOCUMENT_DIRECT_CALL_COUNT = 0 — nothing invokes Apps Script directly');
ok(/function _kmDocumentAction\(action, payload\)[\s\S]{0,400}fetch\(OP_DB_API_BASE_URL/.test(API),
  'L2a every document action goes through the one current transport');
['listEntityDocuments', 'getGeneratedDocument', 'retryDocumentGeneration'].forEach(function (n) {
  ok(new RegExp('window\\.KM\\.DB\\.' + n + ' = function').test(API),
    'L3  MISSING_DOCUMENT_ADAPTER_ACTION_COUNT = 0 — KM.DB.' + n + ' exists');
});

// ==========================================================================================================
section('P  WHY THE REPAIR IS NOT IN THIS COMMIT — the blocker, as a number');
// ==========================================================================================================
// s4-r5 A1d1 requires the boot payload to stay 1.5 MB below the S4-R1 baseline. Both Document Panel owners are
// boot-loaded <script defer> tags, so ANY edit to them spends that margin. S4-R6 replaced an exact-byte
// assertion here precisely because it "FAILED THE FIRST TIME ANYBODY FIXED A BUG", and wrote that a bug fix
// "changes neither" the script set nor the ceiling. That promise no longer holds, and this measures by how far.
var RUNNER = require('./_s4r5-route-payload-runner.js');
var MEAS = JSON.parse(read('../docs/evidence/s4-r5-route-payloads/measurements.json'));
var bootFloor = MEAS.boot.pre.bytes - 1500 * 1024;
var bootLive = RUNNER.bootSurface().bytes;
var margin = bootFloor - bootLive;
ok(margin >= 0, 'P1  the boot payload is under the s4-r5 floor at HEAD', { floor: bootFloor, live: bootLive });
ok(margin < 1024,
  'P2  FINDING 4 — and the margin is under 1 KB, so no bug fix fits in a boot-loaded file', margin + ' bytes');
ok(/<script src="assets\/js\/pages\/shipping-history\.js/.test(read('../index.html'))
  && /<script src="assets\/js\/pages\/purchase-order-overview\.js/.test(read('../index.html')),
  'P3  and both Document Panel owners are boot-loaded, which is why this round could not repair them');

// ==========================================================================================================
section('Q  MUTANTS');
// ==========================================================================================================
mut('Q1 would catch the PO workspace listing documents for the wrong entity type', function () {
  var m = G50.replace("poWsGroupDocuments_(tables.generated_documents || [], 'purchase_order')",
    "poWsGroupDocuments_(tables.generated_documents || [], 'shipment')");
  return !/poWsGroupDocuments_\(tables\.generated_documents \|\| \[\], 'purchase_order'\)/.test(m);
});
mut('Q2 would catch the entity-type scope guard being dropped from the grouper', function () {
  var m = G57.replace("    if (dgsLc_(r.related_entity_type) !== entityType) return;\r\n", '');
  return !/if \(dgsLc_\(r\.related_entity_type\) !== entityType\) return;/.test(m);
});
mut('Q3 would catch a failed document being shown as ready', function () {
  var sandbox = { GENERATED_DOCUMENTS_HEADERS_: [], Logger: { log: function () {} } };
  vm.createContext(sandbox);
  vm.runInContext(PURE39.replace("if (st === DGS_ROW_FAILED_) {", "if (false) {"), sandbox);
  return sandbox.dgsRowState_({ status: 'failed', note: 'DGS_REASON=X; DGS_RETRYABLE=1;' }) !== 'FAILED_RETRYABLE';
});
mut('Q4 would catch a generated row with no file being called READY', function () {
  var sandbox = { GENERATED_DOCUMENTS_HEADERS_: [], Logger: { log: function () {} } };
  vm.createContext(sandbox);
  vm.runInContext(PURE39.replace("return dgsStr_(row.file_id) ? 'READY' : 'GENERATING';", "return 'READY';"), sandbox);
  return sandbox.dgsRowState_({ status: 'generated', file_id: '', note: '' }) !== 'GENERATING';
});
mut('Q5 would catch an unread model being reported as empty', function () {
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(ESC_SRC + '\n' + PANEL_SRC.replace("    if (model.checking) return 'CHECKING';\n", ''), sandbox);
  return sandbox.shDocPanelState({ checking: true, documents: [] }) !== 'CHECKING';
});
mut('Q6 would catch a superseded attempt resurfacing as a second live document', function () {
  var sandbox = { GENERATED_DOCUMENTS_HEADERS_: [], Logger: { log: function () {} } };
  vm.createContext(sandbox);
  vm.runInContext(PURE39.replace("if (st === DGS_ROW_CANCELLED_ || st === 'archived') return 'SUPERSEDED';",
    "if (false) return 'SUPERSEDED';"), sandbox);
  return sandbox.dgsRowState_({ status: 'cancelled', note: '' }) !== 'SUPERSEDED';
});
mut('Q7 would catch an auto-retry being wired into the panel', function () {
  var m = SH.replace('function shDocViewAll(btnEl) {',
    'function shDocAuto() { window.KM.DB.retryDocumentGeneration("shipment", "X"); }\r\nfunction shDocViewAll(btnEl) {');
  return count(code(m), /retryDocumentGeneration\(/g) !== 1;
});
mut('Q8 would catch a per-document get request added on render', function () {
  var m = PANEL_SRC.replace('var state = shDocPanelState(model);',
    'var state = shDocPanelState(model); window.KM.DB.getGeneratedDocument(model.entity_id);');
  return count(code(m), /KM\.DB\./g) !== 0;
});
mut('Q9 would catch a Drive scan introduced as a second read authority', function () {
  var m = SH.replace('function shDocViewAll(btnEl) {',
    'function shDocScan() { return DriveApp.getFolderById("x").getFiles(); }\r\nfunction shDocViewAll(btnEl) {');
  return count(code(m), /DriveApp/g) !== 0;
});
mut('Q10 would catch a second Document Panel renderer appearing anywhere in the browser', function () {
  var n = 0;
  JS_FILES.forEach(function (f) {
    var src = read(f);
    if (f === 'js/pages/purchase-order-overview.js') src += '\r\nfunction shDocumentPanelHtml(m) { return ""; }';
    if (/function shDocumentPanelHtml\(/.test(src)) n++;
  });
  return n !== 1;
});
mut('Q11 would catch the Retry call site being quietly corrected without this suite noticing', function () {
  var m = SH.replace("_shEsc(entityId) + '\\',\\'' + _shEsc((d && d.generated_document_id) || '')",
    "_shEsc(entityType) + '\\',\\'' + _shEsc(entityId)");
  return !/onclick="shRetryDocument\(\\'' \+ _shEsc\(entityId\) \+ '\\',\\'' \+ _shEsc\(\(d && d\.generated_document_id\) \|\| ''\) \+ '\\',this\)"/.test(m);
});

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + '  ' + pass + ' passed / ' + fail + ' failed'
  + '   mutants ' + mutants + ', survived ' + survived);
process.exitCode = fail ? 1 : 0;
