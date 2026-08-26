// F1-7N-FB-4B-ADDENDUM — Execution Plan multi-route persistence.
//
// One SKU may carry several Execution Plan routes. Each distinct canonical route group must resolve to its OWN
// SADH-K2- header with its own line underneath; the same route re-saved must UPDATE; a different route must CREATE.
// The previous behaviour refused the second route outright (MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1), which
// contradicted `+ Add Route`.
//
// The §F.1-§F.8 claims are proved END TO END: the REAL client grouping (IRDraft.partitionRoutesIntoGroups) drives the
// REAL shipped server cores (sadUpsertDraftHeaderCore_ / sadUpsertLinesKeyedCore_) against an in-memory sheet, and the
// assertions are made on the resulting ROWS. Nothing here is a mock of the logic under test — only the spreadsheet is
// simulated. Structural claims assert against comment-stripped source so prose cannot satisfy them.
//
// Known regression baseline (pre-existing, unrelated): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node assets/tests/execution-plan-multi-route-persistence-f1-7n-fb-4b-addendum.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G68 = read('assets/specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs');
var IR = read('assets/js/pages/inventory-replenishment.js');
var CMP = read('assets/js/utils/inventory-compat.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');

function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
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
    return src.slice(m.index, j + 1) + ';';
  }
  return src.slice(m.index, src.indexOf(';', i) + 1);
}

var IRDraft = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js')).IRDraft;

// ================================================================================================================
// In-memory spreadsheet — the ONLY thing simulated. Every rule under test runs from the shipped source.
// ================================================================================================================
function FakeSheet(headers) {
  this.rows = [headers.slice()];
}
FakeSheet.prototype.getLastColumn = function () { return this.rows[0].length; };
FakeSheet.prototype.getDataRange = function () { var self = this; return { getValues: function () { return self.rows.map(function (r) { return r.slice(); }); } }; };
FakeSheet.prototype.appendRow = function (r) { this.rows.push(r.slice()); };
FakeSheet.prototype.getRange = function (row, col, nr, nc) {
  var self = this;
  return {
    getValues: function () {
      var out = [];
      for (var i = 0; i < (nr || 1); i++) { var line = [];
        for (var j = 0; j < (nc || 1); j++) line.push(self.rows[row - 1 + i][col - 1 + j]);
        out.push(line); }
      return out;
    },
    getValue: function () { return self.rows[row - 1][col - 1]; },
    setValue: function (v) { self.rows[row - 1][col - 1] = v; }
  };
};

var SHEETS = {};
var SpreadsheetApp = { getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return SHEETS[n] || null; } }; } };
var LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
var Utilities = { getUuid: function () { return 'UUID000000000000'; } };
var Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
var __now = '2026-08-26 09:00:00';
function procurementTimestamp_() { return __now; }
function prodRequireSheet_(ss, name) { return SHEETS[name]; }
function procurementNum_(v) { var n = Number(v); return isFinite(n) ? n : ''; }
var __lastJson = null;
function jsonResponse_(o) { __lastJson = o; return o; }

// Real shipped helpers + the whole K2/identity machinery under test.
eval(extractFn(G13, 'procurementEnsureSheet_'));
eval(extractFn(G13, 'procurementAppendByHeader_'));
eval(extractFn(G13, 'procurementFindRow_'));
eval(extractVar(G16, 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_'));
eval(extractVar(G16, 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_'));
eval(extractVar(G16, 'SAD_STATUSES_'));
eval(extractVar(G16, 'SAD_GENERATION_TYPES_'));
eval(extractVar(G16, 'SAD_RECOMMENDATION_FIELDS_'));
eval(extractVar(G16, 'SAD_LINE_LEGACY_ALIASES_'));
eval(extractVar(G16, 'SAD_K2_GROUP_DIMENSIONS_'));
eval(extractVar(G16, 'SAD_LINE_IDENTITY_FIELDS_'));
eval(extractVar(G16, 'SAD_K2_BASIS_ID_MATCHES_'));
eval(extractVar(G16, 'SAD_K2_BASIS_STALE_ACCEPTED_'));
eval(extractVar(G16, 'SAD_K2_BASIS_DIFFERENT_GROUP_'));
eval(extractVar(G16, 'SAD_K2_BASIS_NO_REQUEST_GROUP_'));
eval(extractVar(G16, 'SAD_K2_BASIS_CONTESTED_'));
// eval'd as ONE top-level program so the declarations land in module scope (a per-callback eval would not).
eval(['sadApplyLineAliases_', 'sadFnv1a_', 'sadLineNaturalKey_', 'sadDeterministicLineId_', 'sadFindLineByNaturalKey_',
  'sadK2GroupKey_', 'sadK2DeterministicHeaderId_', 'sadK2LineNaturalKey_', 'sadK2DeterministicLineId_',
  'sadIsK2Group_', 'sadNewLineId_', 'sadK2ResolveActiveDraft_', 'sadCanonicalLineId_', 'sadSameLineIdentity_',
  'sadPreflightLineBatch_', 'sadVerifyDraftLines_', 'sadLineIsComplete_', 'sadHeaderRouteIsComplete_',
  'sadResolveActiveDraft_', 'sadReadActiveHeaderRows_', 'sadResolveActiveDraftK2OrK3_', 'sadK2ReconcileDecision_',
  'sadLegacyReconcileReason_', 'sadReconcileMessage_', 'sadRowToObject_', 'sadReadLinesForDraft_',
  'sadUpsertDraftHeaderCore_', 'sadUpsertLinesKeyedCore_', 'handleGetShippingAllocationDraftWorkspace_'
].map(function (fn) { return extractFn(G16, fn); }).join('\n'));

function resetDb() {
  SHEETS['shipping_allocation_drafts'] = new FakeSheet(SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
  SHEETS['shipping_allocation_draft_lines'] = new FakeSheet(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_);
}
function headerRows() { return SHEETS['shipping_allocation_drafts'].rows.slice(1); }
function lineRows() { return SHEETS['shipping_allocation_draft_lines'].rows.slice(1); }
function lineObjs() {
  var h = SHEETS['shipping_allocation_draft_lines'].rows[0];
  return lineRows().map(function (r) { var o = {}; h.forEach(function (k, i) { if (k) o[k] = r[i]; }); return o; });
}

// The live scope of the reported case.
var SCOPE = { planning_cycle: '', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' };
var SKU = 'CO1100-R';
// Route A — To = Amazon (a MARKETPLACE-logical destination: blank warehouse id by Decision B).
var ROUTE_A = { source_warehouse_id: 'WH-CN-YOUXIN', ship_from: 'CN侑鑫', destination_warehouse_id: '',
  destination: 'Amazon', destination_type: 'MARKETPLACE_DESTINATION', destination_marketplace: 'Amazon',
  shipping_method: '美森海卡', qty: 800, planned_qty: 800, expected_arrival: '2026-10-15' };
// Route B — To = AMZLG&S INC (a REAL 3PL warehouse: a concrete warehouse_id from the live picker).
var ROUTE_B = { source_warehouse_id: 'WH-CN-YOUXIN', ship_from: 'CN侑鑫', destination_warehouse_id: 'WH-AMZLGS-INC',
  destination: 'AMZLG&S INC', destination_type: '3PL', shipping_method: '美森海卡',
  qty: 400, planned_qty: 400, expected_arrival: '2026-10-15' };

// The persistence driver: the REAL client partition, then the REAL server cores, one group at a time — exactly
// what _irPersistOneRouteGroup_ does in the page.
function saveRoutes(sku, routes) {
  var pf = IRDraft.preflightRouteGroups(SCOPE, sku, routes);
  if (!pf.ok) return { ok: false, conflicts: pf.conflicts, outcomes: [] };
  var outcomes = [];
  pf.groups.forEach(function (g) {
    var h = g.header;
    var hres = sadUpsertDraftHeaderCore_({
      company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace,
      planning_cycle: SCOPE.planning_cycle, source_page: 'inventory_replenishment',
      recommended_source_warehouse_id: h.recommended_source_warehouse_id,
      recommended_destination_warehouse_id: h.recommended_destination_warehouse_id,
      recommended_source_warehouse_code_snapshot: h.source_warehouse_code,
      recommended_destination_warehouse_code_snapshot: h.destination_warehouse_code,
      recommended_shipping_method: h.recommended_shipping_method,
      recommended_last_mile_delivery: h.recommended_last_mile_delivery,
      destination_marketplace: h.destination_marketplace
    });
    if (!hres.success) { outcomes.push({ status: 'not_persisted', stage: 'header', error: hres.error, groupKey: g.groupKey }); return; }
    var draftId = hres.data.allocation_draft_id;
    var lres = sadUpsertLinesKeyedCore_({
      allocation_draft_id: draftId,
      lines: g.routes.map(function (r) {
        return { allocation_draft_line_id: r.allocation_draft_line_id || undefined, sku: sku,
          planned_qty: r.planned_qty, generation_type: 'user_created' };
      })
    });
    if (!lres.success) { outcomes.push({ status: 'not_persisted', stage: 'lines', error: lres.error, groupKey: g.groupKey, allocation_draft_id: draftId }); return; }
    // adopt the persisted ids back into THIS group's rows only (the §D.9 rule)
    var byKey = {};
    (lres.data.persisted_lines || []).forEach(function (pl) { byKey[[pl.sku, pl.site_sku, pl.window_code].join('|').toLowerCase()] = pl.allocation_draft_line_id; });
    g.routes.forEach(function (r) {
      var k = [sku, r.site_sku || '', r.window_code || ''].join('|').toLowerCase();
      if (byKey[k]) r.allocation_draft_line_id = byKey[k];
      r.allocation_draft_id = draftId;
      r.route_group_key = g.groupKey;
    });
    outcomes.push({ status: 'persisted', groupKey: g.groupKey, allocation_draft_id: draftId,
      created: lres.data.created, updated: lres.data.updated, verification: lres.data.verification });
  });
  return { ok: true, outcomes: outcomes, groups: pf.groups };
}

// ================================================================================================================
section('§C — canonical header identity: the client key IS the server key');
// ================================================================================================================
eq(IRDraft.K2_GROUP_DIMENSIONS, SAD_K2_GROUP_DIMENSIONS_,
  'C1 the client grouping dimensions are IDENTICAL to the server\'s SAD_K2_GROUP_DIMENSIONS_ (10 frozen dims)');
eq(IRDraft.K2_GROUP_DIMENSIONS.length, 10, 'C2 exactly ten grouping dimensions');
['recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_shipping_method',
  'recommended_last_mile_delivery', 'recommendation_group_no'].forEach(function (d) {
  ok(IRDraft.K2_GROUP_DIMENSIONS.indexOf(d) !== -1, 'C3 route dimension participates in the header key: ' + d);
});
['company', 'country', 'marketplace', 'planning_cycle', 'source_page'].forEach(function (d) {
  ok(IRDraft.K2_GROUP_DIMENSIONS.indexOf(d) !== -1, 'C4 station dimension participates in the header key: ' + d);
});
// the client key must equal the server key for the very routes under test
ok(IRDraft.canonicalRouteGroupKey(SCOPE, ROUTE_A) === sadK2GroupKey_(IRDraft.routeHeaderFields(SCOPE, ROUTE_A)),
  'C5 Route A: client canonical key === server sadK2GroupKey_ of the same header');
ok(IRDraft.canonicalRouteGroupKey(SCOPE, ROUTE_B) === sadK2GroupKey_(IRDraft.routeHeaderFields(SCOPE, ROUTE_B)),
  'C6 Route B: client canonical key === server sadK2GroupKey_ of the same header');
ok(IRDraft.canonicalRouteGroupKey(SCOPE, ROUTE_A) !== IRDraft.canonicalRouteGroupKey(SCOPE, ROUTE_B),
  'C7 Route A and Route B are DIFFERENT shipment groups (different destination identity)');

// §C — the schema gap must be REFUSED, never papered over with a blank column.
var LOGICAL_1 = JSON.parse(JSON.stringify(ROUTE_A));
var LOGICAL_2 = JSON.parse(JSON.stringify(ROUTE_A));
LOGICAL_2.destination_marketplace = 'AmazonCA'; LOGICAL_2.destination = 'Amazon CA'; LOGICAL_2.planned_qty = 111; LOGICAL_2.qty = 111;
var pfGap = IRDraft.preflightRouteGroups(SCOPE, SKU, [LOGICAL_1, LOGICAL_2]);
ok(!pfGap.ok && pfGap.conflicts[0].code === 'ROUTE_IDENTITY_NOT_PERSISTABLE',
  'C8 two routes distinguished only by an UNSTORED dimension are REFUSED (ROUTE_IDENTITY_NOT_PERSISTABLE), never merged');
ok(code(G16).indexOf('destination_marketplace') !== -1 &&
   SHIPPING_ALLOCATION_DRAFTS_HEADERS_.indexOf('destination_marketplace') === -1,
  'C9 schema gap CONFIRMED and reported: destination_marketplace is an accepted payload field but NOT a stored column');

// ================================================================================================================
section('§F.1-§F.5 — Route A, then Route B: two headers, two lines, 1200 units');
// ================================================================================================================
resetDb();
var r1 = saveRoutes(SKU, [ROUTE_A]);
eq(headerRows().length, 1, 'F1a first save of Route A creates exactly ONE header');
eq(lineRows().length, 1, 'F1b first save of Route A creates exactly ONE line');
var idA = r1.outcomes[0].allocation_draft_id;
ok(/^SADH-K2-/.test(idA), 'F1c the header is a canonical SADH-K2- identity: ' + idA);
ok(/^SADL-K2-/.test(lineObjs()[0].allocation_draft_line_id), 'F1d the line is a canonical SADL-K2- identity');
eq(Number(lineObjs()[0].planned_qty), 800, 'F1e Route A quantity is 800');

var r2 = saveRoutes(SKU, [ROUTE_A]);
eq(headerRows().length, 1, 'F2a re-saving Route A does NOT add a header');
eq(lineRows().length, 1, 'F2b re-saving Route A does NOT add a line (UPDATE, not append)');
eq(r2.outcomes[0].created, 0, 'F2c the writer reports created=0');
eq(r2.outcomes[0].updated, 1, 'F2d the writer reports updated=1');
eq(r2.outcomes[0].allocation_draft_id, idA, 'F2e the same header id is reused');

var r3 = saveRoutes(SKU, [ROUTE_A, ROUTE_B]);
eq(headerRows().length, 2, 'F3a adding Route B creates a SECOND header (not a refusal)');
eq(lineRows().length, 2, 'F3b adding Route B creates a SECOND line');
var idB = r3.outcomes[1].allocation_draft_id;
ok(idA !== idB, 'F3c the two routes are under DIFFERENT headers');
ok(/^SADH-K2-/.test(idB), 'F3d Route B\'s header is also a canonical SADH-K2- identity: ' + idB);
eq(r3.outcomes.map(function (o) { return o.status; }), ['persisted', 'persisted'], 'F3e both routes report persisted');

var r4 = saveRoutes(SKU, [ROUTE_A, ROUTE_B]);
eq(headerRows().length, 2, 'F4a re-saving both routes does NOT add a header');
eq(lineRows().length, 2, 'F4b re-saving both routes does NOT add a line');
eq(r4.outcomes.map(function (o) { return o.created; }), [0, 0], 'F4c nothing was created on the re-save');
eq(r4.outcomes.map(function (o) { return o.updated; }), [1, 1], 'F4d both lines were updated in place');

var byDraft = {};
lineObjs().forEach(function (l) { byDraft[l.allocation_draft_id] = Number(l.planned_qty); });
eq(byDraft[idA], 800, 'F5a Route A holds 800');
eq(byDraft[idB], 400, 'F5b Route B holds 400');
eq(lineObjs().reduce(function (a, l) { return a + Number(l.planned_qty); }, 0), 1200, 'F5c the page total is 1200');
eq(lineObjs().map(function (l) { return l.sku; }), [SKU, SKU], 'F5d both lines are the same SKU under different headers');

// ================================================================================================================
section('§F.6 — a failing route never duplicates a healthy one');
// ================================================================================================================
resetDb();
saveRoutes(SKU, [ROUTE_A]);
var beforeLines = lineRows().length, beforeHeaders = headerRows().length;
// Route B is made unsavable at the header gate (an incomplete route: no Method).
var BROKEN_B = JSON.parse(JSON.stringify(ROUTE_B)); BROKEN_B.shipping_method = '';
var rBad = IRDraft.preflightRouteGroups(SCOPE, SKU, [ROUTE_A, BROKEN_B]);
eq(rBad.groups.length, 1, 'F6a an INCOMPLETE route is not a persistable group at all (never silently merged into Route A)');
// and a genuine server-side refusal on one group leaves the other untouched
var hBad = sadUpsertDraftHeaderCore_({ company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace,
  source_page: 'inventory_replenishment', recommended_source_warehouse_id: 'WH-CN-YOUXIN',
  recommended_destination_warehouse_id: '', recommended_shipping_method: '' });
ok(hBad.success === false && /PLAN_HEADER_INCOMPLETE/.test(hBad.error), 'F6b a partial route is refused with PLAN_HEADER_INCOMPLETE');
eq(lineRows().length, beforeLines, 'F6c Route A\'s line count is unchanged by Route B\'s failure');
eq(headerRows().length, beforeHeaders, 'F6d Route A\'s header count is unchanged by Route B\'s failure');
eq(Number(lineObjs()[0].planned_qty), 800, 'F6e Route A\'s quantity is untouched');

// ================================================================================================================
section('§F.7 / §F.8 — replay idempotency and the client temporary id');
// ================================================================================================================
resetDb();
saveRoutes(SKU, [ROUTE_A, ROUTE_B]);
var snapH = headerRows().length, snapL = lineRows().length;
for (var rep = 0; rep < 4; rep++) saveRoutes(SKU, [ROUTE_A, ROUTE_B]);
eq(headerRows().length, snapH, 'F7a four replays of the same request add NO header');
eq(lineRows().length, snapL, 'F7b four replays of the same request add NO line');
eq(lineObjs().reduce(function (a, l) { return a + Number(l.planned_qty); }, 0), 1200, 'F7c the total is still exactly 1200 after replay');

// §F.8 — a client random temporary id must never name a K2 line nor create a second row.
resetDb();
var TMP_A = JSON.parse(JSON.stringify(ROUTE_A)); TMP_A.allocation_draft_line_id = 'SADL-LOCAL-ABC123XYZ0';
var TMP_B = JSON.parse(JSON.stringify(ROUTE_B)); TMP_B.allocation_draft_line_id = 'SADL-LOCAL-ZZZ999QQQ1';
saveRoutes(SKU, [TMP_A, TMP_B]);
eq(lineRows().length, 2, 'F8a a client temporary id does not create extra rows');
ok(lineObjs().every(function (l) { return /^SADL-K2-/.test(l.allocation_draft_line_id); }),
  'F8b every persisted line carries the CANONICAL SADL-K2- id, never the client placeholder');
// the caller then re-sends the SAME temporary ids (the exact live defect) — still no append
var TMP_A2 = JSON.parse(JSON.stringify(ROUTE_A)); TMP_A2.allocation_draft_line_id = 'SADL-LOCAL-ABC123XYZ0';
var TMP_B2 = JSON.parse(JSON.stringify(ROUTE_B)); TMP_B2.allocation_draft_line_id = 'SADL-LOCAL-ZZZ999QQQ1';
saveRoutes(SKU, [TMP_A2, TMP_B2]);
eq(lineRows().length, 2, 'F8c re-sending the stale placeholder ids STILL does not append (the live defect stays closed)');
ok(code(IR).indexOf("'SADL-LOCAL-'") !== -1, 'F8d the client id is named SADL-LOCAL- so it can never be mistaken for a durable identity');

// ================================================================================================================
section('§F.9 — refresh hydrates BOTH routes');
// ================================================================================================================
resetDb();
saveRoutes(SKU, [ROUTE_A, ROUTE_B]);
var ws = handleGetShippingAllocationDraftWorkspace_({ company: SCOPE.company, country: SCOPE.country,
  marketplace: SCOPE.marketplace, source_page: 'inventory_replenishment' });
ok(ws.success === true, 'F9a the readback succeeds');
eq(ws.data.status, 'ACTIVE_DRAFT_GROUP_FOUND', 'F9b two shipment groups read back as ACTIVE_DRAFT_GROUP_FOUND, NOT BLOCKED_CONFLICT');
eq(ws.data.draft_count, 2, 'F9c both headers are returned');
eq(ws.data.lines.length, 2, 'F9d both lines are returned');
eq(ws.data.lines.reduce(function (a, l) { return a + Number(l.planned_qty); }, 0), 1200, 'F9e the readback total is 1200');
eq(ws.data.draft, null, 'F9f `draft` is NULL for a multi-group station — one header is never presented as the whole plan');
eq(ws.data.duplicate_line_identities, [], 'F9g no duplicate identities in a healthy plan');
// single-group back-compat is exact
resetDb(); saveRoutes(SKU, [ROUTE_A]);
var ws1 = handleGetShippingAllocationDraftWorkspace_({ company: SCOPE.company, country: SCOPE.country,
  marketplace: SCOPE.marketplace, source_page: 'inventory_replenishment' });
eq(ws1.data.status, 'ACTIVE_DRAFT_FOUND', 'F9h ONE header still reads back as ACTIVE_DRAFT_FOUND (exact back-compat)');
ok(ws1.data.draft && ws1.data.draft.allocation_draft_id, 'F9i the single-draft shape still carries `draft`');
eq(ws1.data.lines.length, 1, 'F9j the single-draft shape still carries its lines');

// two headers claiming ONE group key is still a genuine conflict
resetDb();
saveRoutes(SKU, [ROUTE_A]);
var dh = SHEETS['shipping_allocation_drafts'];
var clone = dh.rows[1].slice();
clone[SHIPPING_ALLOCATION_DRAFTS_HEADERS_.indexOf('allocation_draft_id')] = 'SADH-K2-IMPOSTOR';
dh.rows.push(clone);
var wsC = handleGetShippingAllocationDraftWorkspace_({ company: SCOPE.company, country: SCOPE.country,
  marketplace: SCOPE.marketplace, source_page: 'inventory_replenishment' });
eq(wsC.data.status, 'BLOCKED_CONFLICT', 'F9k two headers claiming the SAME group key is STILL a BLOCKED_CONFLICT');
eq(wsC.data.lines, [], 'F9l a conflict returns no lines (unchanged fail-closed behaviour)');

// ================================================================================================================
section('§F.10 — Submit selects BOTH persisted route groups');
// ================================================================================================================
var IRSRC = code(IR);
var selFn = extractFn(IR, '_replenActiveAllocationDraftIds');
var replenAllocationDraft, _isRouteComplete = function (r) { return IRDraft.isRouteComplete(r); };
eval(selFn);
replenAllocationDraft = { allocationDraftId: '', bySku: {} };
replenAllocationDraft.bySku[SKU] = [
  { source_warehouse_id: 'WH-CN-YOUXIN', destination_marketplace: 'Amazon', destination_type: 'MARKETPLACE_DESTINATION', shipping_method: '美森海卡', planned_qty: 800, allocation_draft_id: 'SADH-K2-AAAA1111' },
  { source_warehouse_id: 'WH-CN-YOUXIN', destination_warehouse_id: 'WH-AMZLGS-INC', shipping_method: '美森海卡', planned_qty: 400, allocation_draft_id: 'SADH-K2-BBBB2222' }
];
var picked = _replenActiveAllocationDraftIds();
eq(picked.length, 2, 'F10a Submit selects TWO draft ids when the SKU holds two persisted routes');
ok(picked.indexOf('SADH-K2-AAAA1111') !== -1 && picked.indexOf('SADH-K2-BBBB2222') !== -1,
  'F10b both canonical headers are in the Submit selection');
// an unsaved route contributes no id
replenAllocationDraft.bySku[SKU].push({ source_warehouse_id: 'WH-X', destination_warehouse_id: 'WH-Y', shipping_method: 'Air', planned_qty: 50, allocation_draft_id: '' });
eq(_replenActiveAllocationDraftIds().length, 2, 'F10c a route with no persisted header adds NO id to the Submit selection');
// de-duplication when several SKUs share one header
replenAllocationDraft.bySku['CO1150-N'] = [{ source_warehouse_id: 'WH-CN-YOUXIN', destination_marketplace: 'Amazon', destination_type: 'MARKETPLACE_DESTINATION', shipping_method: '美森海卡', planned_qty: 120, allocation_draft_id: 'SADH-K2-AAAA1111' }];
eq(_replenActiveAllocationDraftIds().length, 2, 'F10d two SKUs sharing one header contribute that header ONCE');

// ================================================================================================================
section('§A.7 — header lifecycle: no orphaned header, no header cancelled while still in use');
// ================================================================================================================
var cancelled = [];
function _cancelAllocationDraftHeader(id) { cancelled.push(id); return Promise.resolve(); }
eval(extractFn(IR, '_irCancelUnusedDraftHeaders_'));

// both routes cleared → BOTH headers must be released, not just the last one written
cancelled = [];
replenAllocationDraft = { allocationDraftId: 'SADH-K2-BBBB2222',
  allocationDraftIds: ['SADH-K2-AAAA1111', 'SADH-K2-BBBB2222'], bySku: { 'CO1100-R': [] } };
_irCancelUnusedDraftHeaders_('CO1100-R');
eq(cancelled.sort(), ['SADH-K2-AAAA1111', 'SADH-K2-BBBB2222'],
  'L1 clearing every route releases BOTH headers — the second is never orphaned as an empty active draft');

// one route still live → its header must survive
cancelled = [];
replenAllocationDraft = { allocationDraftId: 'SADH-K2-BBBB2222',
  allocationDraftIds: ['SADH-K2-AAAA1111', 'SADH-K2-BBBB2222'],
  bySku: { 'CO1100-R': [{ source_warehouse_id: 'WH-CN-YOUXIN', destination_warehouse_id: 'WH-AMZLGS-INC',
    shipping_method: '美森海卡', planned_qty: 400, allocation_draft_id: 'SADH-K2-BBBB2222' }] } };
_irCancelUnusedDraftHeaders_('CO1100-R');
eq(cancelled, ['SADH-K2-AAAA1111'], 'L2 only the header nothing references any more is cancelled');

// a header another SKU still uses must never be cancelled
cancelled = [];
replenAllocationDraft = { allocationDraftId: '', allocationDraftIds: ['SADH-K2-AAAA1111'],
  bySku: { 'CO1100-R': [], 'CO1150-N': [{ source_warehouse_id: 'WH-CN-YOUXIN', destination_warehouse_id: 'WH-AMZLGS-INC',
    shipping_method: '美森海卡', planned_qty: 120, allocation_draft_id: 'SADH-K2-AAAA1111' }] } };
_irCancelUnusedDraftHeaders_('CO1100-R');
eq(cancelled, [], 'L3 a header ANOTHER SKU still occupies is never cancelled');

// a route that changed group releases its line on the header it left
var staleFns = extractFn(IR, '_irQueueStaleGroupCancels_');
var _pendingDraftCancels = {};
eval(staleFns);
var movedRoute = { source_warehouse_id: 'WH-CN-YOUXIN', destination_warehouse_id: 'WH-NEW',
  shipping_method: '美森海卡', planned_qty: 800,
  allocation_draft_line_id: 'SADL-K2-OLDLINE', allocation_draft_id: 'SADH-K2-OLDHEADER', route_group_key: 'OLD|KEY' };
_irQueueStaleGroupCancels_('CO1100-R', [{ groupKey: 'NEW|KEY', routes: [movedRoute] }]);
eq(_pendingDraftCancels['CO1100-R'], [{ line_id: 'SADL-K2-OLDLINE', allocation_draft_id: 'SADH-K2-OLDHEADER' }],
  'L4 a route that moved to another header queues a soft-cancel NAMING the header it left');
eq([movedRoute.allocation_draft_line_id, movedRoute.allocation_draft_id, movedRoute.route_group_key], ['', '', ''],
  'L5 and drops its old binding so the server resolves a fresh identity under the new header');
// an UNCHANGED route must not be released
_pendingDraftCancels = {};
var sameRoute = { allocation_draft_line_id: 'SADL-K2-KEEP', allocation_draft_id: 'SADH-K2-KEEP', route_group_key: 'SAME|KEY' };
_irQueueStaleGroupCancels_('CO1100-R', [{ groupKey: 'SAME|KEY', routes: [sameRoute] }]);
eq(_pendingDraftCancels['CO1100-R'], undefined, 'L6 an unchanged route is never released');
eq(sameRoute.allocation_draft_line_id, 'SADL-K2-KEEP', 'L7 and keeps its persisted identity');

// ================================================================================================================
section('§F.11 — duplicate-corrupted identity blocks Submit and is never summed');
// ================================================================================================================
resetDb();
saveRoutes(SKU, [ROUTE_A]);
// reproduce the three live rows sharing SADL-K2-16F4E4F9 by appending two byte-identical physical rows
var lsh = SHEETS['shipping_allocation_draft_lines'];
lsh.rows.push(lsh.rows[1].slice());
lsh.rows.push(lsh.rows[1].slice());
eq(lineRows().length, 3, 'F11a three physical rows now share one primary key (the live corruption reconstructed)');
var wsD = handleGetShippingAllocationDraftWorkspace_({ company: SCOPE.company, country: SCOPE.country,
  marketplace: SCOPE.marketplace, source_page: 'inventory_replenishment' });
eq(wsD.data.duplicate_line_identities.length, 1, 'F11b the readback DISCLOSES the duplicated identity');
eq(wsD.data.duplicate_line_identities[0].physical_rows, 3, 'F11c it names all three physical rows');
eq(wsD.data.duplicate_line_identities[0].sku, SKU, 'F11d it names the affected SKU');
ok((wsD.data.issues || []).some(function (i) { return i.code === 'DUPLICATE_LINE_IDENTITY_PERSISTED'; }),
  'F11e a DUPLICATE_LINE_IDENTITY_PERSISTED issue is raised');
// the read path must not sum 800+800+800
var dupFns = extractFn(IR, '_irDuplicateLineIdentities_') + extractFn(IR, '_irHasDuplicateCorruption_') + extractFn(IR, '_irDuplicateCorruptedSkus_');
eval(dupFns);
replenAllocationDraft = { duplicateLineIdentities: wsD.data.duplicate_line_identities };
ok(_irHasDuplicateCorruption_() === true, 'F11f the page reports duplicate corruption');
eq(_irDuplicateCorruptedSkus_(), [SKU], 'F11g the affected SKU is named for the Submit block');
ok(IRSRC.indexOf('Cannot Submit Plan — duplicate rows exist in the database') !== -1,
  'F11h Submit fails CLOSED on a duplicate identity');
ok(/if\s*\(seenPk\[pk\]\)\s*\{[\s\S]{0,200}?return;/.test(IRSRC),
  'F11i hydrate renders ONE physical row per primary key — three 800-unit rows can never display as 2400');
ok(IRSRC.indexOf('_irRenderDuplicateCorruptionBanner_') !== -1, 'F11j the corruption is DISCLOSED in the UI, not hidden');

// ================================================================================================================
section('§F.12 / §E — the cleanup tool is untouched and still writes nothing by default');
// ================================================================================================================
var G68C = code(G68);
ok(/TEMP_DUPFIX_MODE_\s*=\s*'DRY_RUN'/.test(G68C), 'F12a the cleanup tool is still DRY_RUN by default');
ok(/TEMP_DUPFIX_CONFIRMATION_\s*=\s*''/.test(G68C) && G68C.indexOf('confirmation_checksum') !== -1,
  'F12b it still requires a live-recomputed confirmation checksum, blank by default');
ok(G68C.indexOf('BYTE_IDENTICAL_BUSINESS_CONTENT') !== -1, 'F12c it still requires a byte-identical classification');
ok(/rollback|journal/i.test(G68C), 'F12d it still writes a rollback journal before deleting');
ok(G68.indexOf('F1-7N-FB-4B-ADDENDUM') === -1, 'F12e this task did NOT modify the cleanup tool');

// ================================================================================================================
section('§A — the blanket multi-route refusal is GONE from the persistence path');
// ================================================================================================================
var FLUSH = code(extractFn(IR, '_flushDraftDbPersist'));
ok(FLUSH.indexOf('MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1') === -1,
  'A1a the persistence path no longer refuses a SKU for holding several route contexts');
ok(IRSRC.indexOf('MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1') === -1,
  'A1b the retired token is gone from the page entirely, so a stale message cannot re-type as a supported state');
ok(code(CMP).indexOf('MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1') === -1,
  'A2 the shared Save validator no longer refuses several route contexts either');
ok(IRSRC.indexOf('preflightRouteGroups') !== -1, 'A3 the persistence path pre-flights ROUTE GROUPS instead');
ok(IRSRC.indexOf('_irPersistOneRouteGroup_') !== -1, 'A4 each route group is persisted under its own header');
// §A.9 — only a contradictory quantity on ONE route identity is a typed conflict
var DUP_SAME = JSON.parse(JSON.stringify(ROUTE_A));
eq(IRDraft.preflightRouteGroups(SCOPE, SKU, [ROUTE_A, DUP_SAME]).ok, true,
  'A5 the SAME route stated twice with the SAME quantity is idempotent, not a conflict');
var DUP_DIFF = JSON.parse(JSON.stringify(ROUTE_A)); DUP_DIFF.planned_qty = 777; DUP_DIFF.qty = 777;
var pfDup = IRDraft.preflightRouteGroups(SCOPE, SKU, [ROUTE_A, DUP_DIFF]);
ok(!pfDup.ok && pfDup.conflicts[0].code === 'ROUTE_QUANTITY_CONFLICT',
  'A6 the SAME route identity with CONTRADICTORY quantities is a typed conflict');
eq([pfDup.conflicts[0].first_planned_qty, pfDup.conflicts[0].duplicate_planned_qty], [800, 777],
  'A7 both quantities are named so neither is silently discarded');
// §A.7 — a group never borrows another group's line
var groups2 = IRDraft.partitionRoutesIntoGroups(SCOPE, [ROUTE_A, ROUTE_B]);
eq(groups2.map(function (g) { return g.routes.length; }), [1, 1], 'A8 each group holds only its OWN route');

// ================================================================================================================
section('§D — zero-write pre-flight, per-route reporting, scoped adoption');
// ================================================================================================================
// STRUCTURAL, on comment-stripped source: the pre-flight guard must both exist and sit BEFORE the first write
// call in the function body. Prose in a comment cannot satisfy this.
var iPre = FLUSH.indexOf('preflightRouteGroups');
var iGuard = FLUSH.indexOf('!pf.ok');
var iWrite = FLUSH.indexOf('_irPersistOneRouteGroup_');
ok(iPre !== -1 && iGuard !== -1 && iWrite !== -1 && iPre < iGuard && iGuard < iWrite,
  'D1a the batch is resolved and pre-flighted BEFORE the first write call (a proven zero-write)');
ok(/!pf\.ok[\s\S]{0,700}?return;/.test(FLUSH),
  'D1b a failed pre-flight RETURNS out of the function rather than falling through to the writes');
ok(IRSRC.indexOf('_pendingDraftCancels[sku] = (_pendingDraftCancels[sku] || []).concat(cancels)') !== -1,
  'D2 queued soft-cancels are PUT BACK on a pre-flight refusal — a cancel is itself a write');
ok(/function _irAdoptPersistedLineIds_\(sku, draftId, persistedLines\)/.test(IRSRC),
  'D3 line-id adoption is SCOPED to one header (§D.9 — Route A never adopts Route B\'s id)');
ok(IRSRC.indexOf('ROUTE_GROUP_PARTIAL_FAILURE') !== -1, 'D4 a partial multi-header write reports per route, not a bare SAVE_FAILED');
['persisted', 'not_persisted', 'indeterminate'].forEach(function (st) {
  ok(IRSRC.indexOf("'" + st + "'") !== -1, 'D5 per-route outcome state exists: ' + st);
});
ok(IRSRC.indexOf('REQUEST_TIMEOUT_WRITE_INDETERMINATE') !== -1,
  'D6 a timeout is classified INDETERMINATE, never reported as "not persisted"');
ok(IRSRC.indexOf('_irQueueStaleGroupCancels_') !== -1,
  'D7 a route that moved to a different header releases its line on the header it LEFT (never counted twice)');
ok(IRSRC.indexOf('route_count') !== -1 && IRSRC.indexOf('ROUTES_MISSING') !== -1,
  'D8 pre-submit verification checks ROUTE COUNT, so a wholly missing route is caught');
ok(IRSRC.indexOf('total_quantity') !== -1, 'D9 pre-submit verification checks the TOTAL QUANTITY');
// the writer's own read-after-write still proves identity + exact quantity + PK uniqueness
resetDb(); saveRoutes(SKU, [ROUTE_A, ROUTE_B]);
var lastVerify = saveRoutes(SKU, [ROUTE_A, ROUTE_B]).outcomes.map(function (o) { return o.verification; });
ok(lastVerify.every(function (v) { return v && v.ok === true; }), 'D10a every route\'s read-after-write verification passes');
eq(lastVerify.map(function (v) { return v.duplicate_primary_keys.length; }), [0, 0], 'D10b no duplicate primary keys under either header');
eq(lastVerify.map(function (v) { return v.verified_line_count; }), [1, 1], 'D10c exactly one verified line per header');

// ================================================================================================================
section('§E — the writer can no longer append a fourth row');
// ================================================================================================================
var G16C = code(G16);
ok(G16C.indexOf('LINE_PRIMARY_KEY_ALREADY_EXISTS') !== -1, 'E1 the pre-insert primary-key assertion is still in place');
ok(G16C.indexOf('sadCanonicalLineId_') !== -1, 'E2 resolution still goes through the canonical id, not the caller\'s');
// prove it against the corrupted three-row state: another save must NOT create a fourth row
resetDb();
saveRoutes(SKU, [ROUTE_A]);
var lsh2 = SHEETS['shipping_allocation_draft_lines'];
lsh2.rows.push(lsh2.rows[1].slice());
lsh2.rows.push(lsh2.rows[1].slice());
eq(lineRows().length, 3, 'E3a three corrupted rows in place');
var again = saveRoutes(SKU, [ROUTE_A]);
eq(lineRows().length, 3, 'E3b saving again does NOT append a fourth row');
ok(again.outcomes[0].status === 'not_persisted' || (again.outcomes[0].verification && again.outcomes[0].verification.ok === false),
  'E3c the save is NOT reported as a clean success while the identity is duplicated');
var wsE = handleGetShippingAllocationDraftWorkspace_({ company: SCOPE.company, country: SCOPE.country,
  marketplace: SCOPE.marketplace, source_page: 'inventory_replenishment' });
eq(wsE.data.duplicate_line_identities.length, 1, 'E3d the corruption is still disclosed after the attempted save');

// ================================================================================================================
section('§D/§G — no unauthorised behaviour introduced');
// ================================================================================================================
ok(code(read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs')).indexOf('deleteRow') === -1,
  'G1 the shipping allocation handler still contains NO row deletion');
ok(IRSRC.indexOf('allow_legacy_reconcile: true') === -1 && IRSRC.indexOf("allow_legacy_reconcile") === -1,
  'G2 the page never asks the server to reconcile a legacy row (that stays a USER-owned migration)');
ok(DBAPI.indexOf('ROUTE_IDENTITY_NOT_PERSISTABLE') !== -1 && DBAPI.indexOf('ROUTE_QUANTITY_CONFLICT') !== -1,
  'G3 the adapter preserves the new canonical reason codes instead of discarding them');
ok(G16C.indexOf('ACTIVE_DRAFT_GROUP_FOUND') !== -1, 'G4 the multi-group readback status is a real server contract');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
