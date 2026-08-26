// Allocation Draft runtime completion — C2-D2 tests.
// Verifies the SAFE, authority-resolved runtime: centralized K3 resolver (0/1/>1 → NO_ACTIVE_DRAFT /
// ACTIVE_DRAFT_FOUND / BLOCKED_CONFLICT; key excludes draft_version + recommendation_group_no), the Phase-1
// multiple-route BLOCK, the C1-aligned Save/Cancel adapters + text-first targeted readback, the read-only
// readback handler (2 tables only), the whole-Draft Cancel (soft/idempotent/no-delete/submitted-blocked),
// the router actions, and that the Submit → Weekly-Plan handoff is documented as HALTed (unresolved authority).
// Run: node assets/tests/allocation-draft-runtime-c2d2.test.js
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GS = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var FREEZE = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'planning', 'ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

// F1-7N-FB-4C - the shipped guards now read the named terminal-status sets (which gained `expired`), so the
// eval list has to carry them. No assertion below changes.
eval(GS.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\];/)[0]);
eval(GS.match(/var SAD_TERMINAL_STATUSES_ = \{[\s\S]*?\};/)[0]);
eval(GS.match(/var SAD_TERMINAL_LINE_STATUSES_ = \{[\s\S]*?\};/)[0]);
eval(extractFn(GS, 'sadResolveActiveDraft_'));
var H = SHIPPING_ALLOCATION_DRAFTS_HEADERS_;
function draftRow(o) { var r = H.map(function () { return ''; }); Object.keys(o).forEach(function (k) { var i = H.indexOf(k); if (i >= 0) r[i] = o[k]; }); return r; }
function fakeSheet(rows) { return { getDataRange: function () { return { getValues: function () { return [H.slice()].concat(rows); } }; } }; }
var SCOPE = { planning_cycle: '2026-W32', company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment' };
function rowFor(over) { return draftRow(Object.assign({ planning_cycle: '2026-W32', company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment', status: 'draft', allocation_draft_id: 'SAD-1' }, over || {})); }

// =====================================================================================================
section('K3 resolver (§3): 0 / 1 / >1 (tests 6,7,8)');
ok(sadResolveActiveDraft_(fakeSheet([]), SCOPE).status === 'NO_ACTIVE_DRAFT', 'K1 no rows → NO_ACTIVE_DRAFT (→ CREATE)');
var r1 = sadResolveActiveDraft_(fakeSheet([rowFor({ allocation_draft_id: 'SAD-1' })]), SCOPE);
ok(r1.status === 'ACTIVE_DRAFT_FOUND' && r1.id === 'SAD-1', 'K2 one active → ACTIVE_DRAFT_FOUND (→ REUSE) with id');
var dup = sadResolveActiveDraft_(fakeSheet([rowFor({ allocation_draft_id: 'SAD-1' }), rowFor({ allocation_draft_id: 'SAD-2' })]), SCOPE);
ok(dup.status === 'BLOCKED_CONFLICT' && dup.conflictIds.length === 2 && dup.conflictIds.indexOf('SAD-2') >= 0, 'K3 >1 active → BLOCKED_CONFLICT with all conflicting ids');
ok(sadResolveActiveDraft_(fakeSheet([rowFor({ status: 'submitted' })]), SCOPE).status === 'NO_ACTIVE_DRAFT', 'K4 submitted is NOT active');
ok(sadResolveActiveDraft_(fakeSheet([rowFor({ status: 'cancelled' })]), SCOPE).status === 'NO_ACTIVE_DRAFT', 'K5 cancelled is NOT active');

section('K3 key excludes draft_version + recommendation_group_no (§3 tests 9,10)');
var dv = sadResolveActiveDraft_(fakeSheet([rowFor({ allocation_draft_id: 'SAD-1', draft_version: '1' }), rowFor({ allocation_draft_id: 'SAD-2', draft_version: '2' })]), SCOPE);
ok(dv.status === 'BLOCKED_CONFLICT', 'K6 different draft_version does NOT separate the scope (draft_version excluded from key)');
var gp = sadResolveActiveDraft_(fakeSheet([rowFor({ allocation_draft_id: 'SAD-1', recommendation_group_no: 'A' }), rowFor({ allocation_draft_id: 'SAD-2', recommendation_group_no: 'B' })]), SCOPE);
ok(gp.status === 'BLOCKED_CONFLICT', 'K7 different recommendation_group_no does NOT separate the scope (group_no excluded)');
var sp = sadResolveActiveDraft_(fakeSheet([rowFor({ allocation_draft_id: 'SAD-1' }), rowFor({ allocation_draft_id: 'SAD-2', source_page: 'other_page' })]), SCOPE);
ok(sp.status === 'ACTIVE_DRAFT_FOUND' && sp.id === 'SAD-1', 'K8 different source_page IS a distinct scope (source_page is IN the key)');

// =====================================================================================================
section('Multiple-route Phase-1 block (§4/§7, tests 12,13,14)');
var IRDraft = require(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js')).IRDraft;
function R(from, to, m) { return { source_warehouse_id: from, destination_warehouse_id: to, shipping_method: m, planned_qty: 5 }; }
ok(IRDraft.distinctRouteContexts([R('F', 'T', 'sea'), R('F', 'T', 'sea')]).length === 1, 'MR1 same From/To/Method → 1 route context (single route persists)');
ok(IRDraft.distinctRouteContexts([R('F', 'T', 'sea'), R('F', 'T', 'air')]).length === 2, 'MR2 different Method → 2 route contexts (BLOCK in Phase-1)');
ok(IRDraft.distinctRouteContexts([R('F', 'T1', 'sea'), R('F', 'T2', 'sea')]).length === 2, 'MR3 different To → 2 route contexts');
ok(IRDraft.distinctRouteContexts([R('F', 'T', 'sea'), { source_warehouse_id: 'F' }]).length === 1, 'MR4 incomplete routes ignored');
ok(IRDraft.distinctRouteContexts([{ source_warehouse_id: 'F', destination_type: 'MARKETPLACE_DESTINATION', destination_marketplace: 'Amazon', shipping_method: 'air', planned_qty: 3 }]).length === 1, 'MR5 Amazon logical route context keyed by marketplace');

// =====================================================================================================
section('C1 adapter alignment + text-first targeted readback (§9, §10, tests 23,24,25,27)');
ok(/upsertShippingAllocationDraft = function\(payload\) \{ return _kmWeeklyCommand_/.test(DBAPI), 'A1 Save adapter delegates to the C1 runner (ack decoupled, structured errors)');
ok(/cancelShippingAllocationDraft = function\(payload\) \{ return _kmWeeklyCommand_/.test(DBAPI), 'A2 Cancel adapter uses the C1 runner');
var wsAdapter = (DBAPI.match(/getShippingAllocationDraftWorkspace = async function[\s\S]*?\n};/) || [''])[0];
ok(/charCodeAt\(0\) !== 123/.test(wsAdapter) && /NON_JSON_RESPONSE/.test(wsAdapter) && /HTTP_TRANSPORT_ERROR/.test(wsAdapter), 'A3 readback adapter is text-first + classifies transport/non-JSON');
ok(wsAdapter.indexOf('loadOperationDb') < 0, 'A4 readback adapter never calls loadOperationDb');
var adapterBlock = DBAPI.slice(DBAPI.indexOf('upsertShippingAllocationDraft = function'), DBAPI.indexOf('getShippingAllocationDraftWorkspace = async'));
ok(adapterBlock.indexOf('loadOperationDb') < 0, 'A5 Save/Cancel/Submit adapters no longer force a whole-DB reload (no loadOperationDb)');

// =====================================================================================================
section('Targeted readback handler reads only the 2 draft tables (§9)');
var ws = extractFn(GS, 'handleGetShippingAllocationDraftWorkspace_');
ok(/shipping_allocation_drafts/.test(ws) && /shipping_allocation_draft_lines/.test(ws) && ws.indexOf('getOperationDb') < 0, 'RB1 readback reads only the 2 draft tables (never getOperationDb)');
ok(/NO_ACTIVE_DRAFT/.test(ws) && /ACTIVE_DRAFT_FOUND/.test(ws) && /BLOCKED_CONFLICT/.test(ws), 'RB2 readback returns the 3 required statuses');

// =====================================================================================================
section('Whole-Draft Cancel (§13, tests 30,31,32,33)');
var cancel = extractFn(GS, 'handleCancelShippingAllocationDraft_');
ok(/setCol\('status', 'cancelled'\)/.test(cancel) && /cancelled_by/.test(cancel) && /cancelled_at/.test(cancel) && /cancel_reason/.test(cancel), 'CX1 cancel sets cancelled status + audit fields (Header/Lines preserved)');
ok(/already_cancelled: true/.test(cancel), 'CX2 repeated cancel → benign already_cancelled (idempotent)');
ok(/IMMUTABLE_TERMINAL_STATUS:submitted/.test(cancel), 'CX3 submitted Draft cannot be cancelled (SC-1 not inferred)');
ok(cancel.indexOf('deleteRow') < 0 && cancel.indexOf('deleteRows') < 0, 'CX4 cancel never hard-deletes');

// =====================================================================================================
section('Router actions + BLOCKED_CONFLICT on Save (§20, §3)');
ok(/action === 'getShippingAllocationDraftWorkspace'/.test(ROUTER) && /action === 'cancelShippingAllocationDraft'/.test(ROUTER), 'RT1 new read/cancel actions routed');
ok(/sadResolveActiveDraft_\(sh, \{ planning_cycle/.test(GS) && /BLOCKED_CONFLICT — more than one Active Draft/.test(GS), 'RT2 header upsert uses the K3 resolver + BLOCKED_CONFLICT (zero mutation)');

// =====================================================================================================
section('Submit → Weekly-Plan handoff is HALTed + schema unchanged (§14-§19, §2)');
ok(/HALT|DEFER/i.test(FREEZE) && /(source[- ]availability|availability authority|L2)/i.test(FREEZE), 'SH1 freeze doc records the Submit HALT (unresolved source-availability / L2 authority)');
ok(/deterministic/i.test(FREEZE) && /(lineage|allocation_draft_id)/i.test(FREEZE), 'SH2 freeze doc records the non-deterministic downstream ID + missing lineage column');
ok(/\b30\b/.test(FREEZE) && /\b28\b/.test(FREEZE) && H.length === 30, 'SH3 approved 30/28 schema unchanged (header still 30 columns)');

console.log('\n----------------------------------------');
console.log('ALLOCATION DRAFT RUNTIME (C2-D2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
