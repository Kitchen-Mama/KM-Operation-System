// Allocation Draft UI workflow — C2-D2A-UI tests.
// Drives the PURE, deps-injected persistence state machine + Save/Cancel/Load controller (IRDraftWorkspace,
// inventory-compat.js) with fake adapters — no DOM, no network, no live DB. Proves: truthful states, SAVED only
// after committed ack + targeted readback, committed/readback-failed is NOT a failure, BLOCKED_CONFLICT →
// CONFLICT (no guessed draft), multiple-route block, single readback, double-click guard, stale-load guard,
// local-recovery decision rules, cancel idempotency/history-preservation, and that no whole-DB reload / no
// DB-authoritative Submit is exposed. Plus page/source-contract scans.
// Run: node assets/tests/allocation-draft-ui-c2d2a.test.js
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var WS = require(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js')).IRDraftWorkspace;
var COMPAT = read('js/utils/inventory-compat.js');
var PAGE = read('js/pages/inventory-replenishment.js');
var FREEZE = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'planning', 'ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var okDraft = { status: 'ACTIVE_DRAFT_FOUND', draft: { status: 'draft', allocation_draft_id: 'SAD-1', updated_at: 'T1' }, lines: [{ allocation_draft_line_id: 'SADL-1', sku: 'CO1100-S', planned_qty: 5, recommended_qty: 7 }], issues: [] };
function res(data) { return { success: true, data: data, error: null }; }
function err(code, details) { return { success: false, data: null, error: { code: code, message: code, details: details || {} } }; }
function validPayload(over) {
  return Object.assign({
    scope: { planning_cycle: '2026-W32', company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment' },
    header: { recommended_source_warehouse_id: 'F', recommended_destination_warehouse_id: 'T', recommended_shipping_method: 'sea' },
    lines: [{ sku: 'CO1100-S', planned_qty: 5, recommended_qty: 7, allocation_draft_line_id: 'SADL-1' }],
    routes: [{ source_warehouse_id: 'F', destination_warehouse_id: 'T', shipping_method: 'sea', planned_qty: 5 }]
  }, over || {});
}
function makeWS(over) {
  over = over || {};
  var states = [], counts = { save: 0, saveLines: 0, cancel: 0, readback: 0 };
  function wrap(name, dflt) { var impl = over[name] || dflt; return function () { counts[name]++; if (name === 'saveLines') counts._lastLines = arguments[0] && arguments[0].lines; return impl.apply(null, arguments); }; }
  var deps = {
    readback: wrap('readback', function () { return Promise.resolve(res({ status: 'NO_ACTIVE_DRAFT', draft: null, lines: [], issues: [] })); }),
    save: wrap('save', function () { return Promise.resolve(res({ command: 'x', committed: true, allocation_draft_id: 'SAD-1' })); }),
    saveLines: wrap('saveLines', function () { return Promise.resolve(res({ command: 'x', committed: true, line_count: 1 })); }),
    cancel: wrap('cancel', function () { return Promise.resolve(res({ command: 'x', committed: true, status: 'cancelled', already_cancelled: false })); }),
    onState: over.onState || function (s) { states.push(s); },
    getLocalBuffer: over.getLocalBuffer || function () { return false; }
  };
  return { ws: WS.create(deps), states: states, counts: counts };
}

(async function main() {
  // ===================================================================================================
  section('State machine (§14 1-8)');
  var w = makeWS({ readback: function () { return Promise.resolve(res({ status: 'NO_ACTIVE_DRAFT' })); } });
  await w.ws.load({});
  ok(w.ws.getState().state === 'NOT_SAVED', 'T1 no DB Draft → NOT_SAVED');

  w = makeWS({ readback: function () { return Promise.resolve(res(okDraft)); } });
  var sr = await w.ws.save(validPayload());
  ok(w.states.map(function (s) { return s.state; }).indexOf('SAVING') >= 0, 'T2 Save start emits SAVING');
  ok(sr.ok === true && w.ws.getState().state === 'SAVED' && w.ws.getState().draft.allocation_draft_id === 'SAD-1', 'T3 committed + readback success → SAVED (with draft id)');

  w = makeWS({ save: function () { return Promise.resolve(err('BUSINESS_COMMAND_ERROR')); } });
  var f = await w.ws.save(validPayload());
  ok(f.ok === false && w.ws.getState().state === 'SAVE_FAILED', 'T4 pre-commit failure → SAVE_FAILED');

  w = makeWS({ readback: function () { return Promise.resolve(err('HTTP_TRANSPORT_ERROR')); } });
  var cr = await w.ws.save(validPayload());
  ok(cr.ok === true && cr.committed === true && w.ws.getState().state === 'SAVED' && w.ws.getState().code === 'WRITE_COMMITTED_READBACK_FAILED', 'T5 committed + readback FAILURE is NOT SAVE_FAILED (SAVED + WRITE_COMMITTED_READBACK_FAILED)');

  w = makeWS({ save: function () { return Promise.resolve(err('BLOCKED_CONFLICT', { conflictIds: ['SAD-1', 'SAD-2'] })); } });
  var cf = await w.ws.save(validPayload());
  ok(cf.code === 'BLOCKED_CONFLICT' && w.ws.getState().state === 'CONFLICT' && w.ws.getState().conflictIds.length === 2, 'T6 duplicate Active → CONFLICT with conflict ids');

  w = makeWS({ readback: function () { return Promise.resolve(res({ status: 'ACTIVE_DRAFT_FOUND', draft: { status: 'cancelled', allocation_draft_id: 'SAD-9' }, lines: [] })); } });
  await w.ws.load({});
  ok(w.ws.getState().state === 'CANCELLED', 'T7 cancelled readback → CANCELLED');

  w = makeWS({ readback: function () { return Promise.resolve(res({ status: 'ACTIVE_DRAFT_FOUND', draft: { status: 'submitted', allocation_draft_id: 'SAD-8' }, lines: [] })); } });
  await w.ws.load({});
  ok(w.ws.getState().state === 'SUBMITTED', 'T8 submitted readback → SUBMITTED');

  // ===================================================================================================
  section('Targeted load (§14 9-13)');
  var seenScope = null;
  w = makeWS({ readback: function (scope) { seenScope = scope; return Promise.resolve(res({ status: 'NO_ACTIVE_DRAFT' })); } });
  await w.ws.load({ planning_cycle: '2026-W32', company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment' });
  ok(seenScope && seenScope.planning_cycle === '2026-W32' && seenScope.source_page === 'inventory_replenishment', 'T9 load uses the exact K3 scope');
  ok(!/getOperationDb\s*\(/.test(COMPAT) && !/loadOperationDb\s*\(/.test(COMPAT), 'T10/T11 controller never CALLS getOperationDb / loadOperationDb');

  // stale-load guard: resolve the OLDER load last → it must be ignored
  var slots = [];
  w = makeWS({ readback: function (scope) { return new Promise(function (r) { slots.push({ scope: scope, r: r }); }); } });
  var pA = w.ws.load('A'); var pB = w.ws.load('B');
  slots[1].r(res({ status: 'ACTIVE_DRAFT_FOUND', draft: { status: 'draft', allocation_draft_id: 'SAD-B' }, lines: [] }));
  slots[0].r(res({ status: 'ACTIVE_DRAFT_FOUND', draft: { status: 'submitted', allocation_draft_id: 'SAD-A' }, lines: [] }));
  var rA = await pA; await pB;
  ok(rA.stale === true && w.ws.getState().draft.allocation_draft_id === 'SAD-B' && w.ws.getState().state === 'SAVED', 'T12 stale (older) load response is ignored');

  w = makeWS({ readback: function () { return Promise.resolve(res({ status: 'BLOCKED_CONFLICT', draft: null, lines: [], issues: [{ code: 'BLOCKED_CONFLICT', conflictIds: ['SAD-1', 'SAD-2'] }] })); } });
  await w.ws.load({});
  ok(w.ws.getState().state === 'CONFLICT' && w.ws.getState().draft === null && w.ws.getState().conflictIds.length === 2, 'T13 BLOCKED_CONFLICT → CONFLICT, no guessed Draft hydrated');

  // ===================================================================================================
  section('Save orchestration (§14 14-22)');
  w = makeWS();
  var ih = await w.ws.save(validPayload({ header: { recommended_source_warehouse_id: 'F', recommended_destination_warehouse_id: 'T' } }));   // no Method
  ok(ih.code === 'PLAN_HEADER_INCOMPLETE' && ih.issues[0].missing.indexOf('Method') >= 0 && w.counts.save === 0, 'T14 incomplete Header blocks (no adapter call), lists missing Method');

  w = makeWS();
  var il = await w.ws.save(validPayload({ lines: [{ sku: 'CO1100-S', planned_qty: 0 }] }));
  ok(il.code === 'PLAN_LINE_INCOMPLETE' && w.counts.save === 0, 'T15 incomplete Line (Qty 0) blocks');

  // F1-7N-FB-4B-ADDENDUM — REPLACED WITH THE STRONGER CONTRACT. Two routes that differ in Method are two K2
  // shipment groups and therefore two headers; refusing them contradicted `+ Add Route`. They must now be ACCEPTED.
  // What must still block is a batch that cannot be resolved into distinct groups at all, which is a strictly
  // narrower and better-targeted refusal than the old blanket one.
  w = makeWS();
  var mr = await w.ws.save(validPayload({ routes: [{ source_warehouse_id: 'F', destination_warehouse_id: 'T', shipping_method: 'sea', planned_qty: 5 }, { source_warehouse_id: 'F', destination_warehouse_id: 'T', shipping_method: 'air', planned_qty: 3 }] }));
  ok(mr.code !== 'MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1', 'T16a two distinct route contexts are NO LONGER refused (they are two shipment groups)');
  var grp = require(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js')).IRDraft.partitionRoutesIntoGroups({ company: 'KM', country: 'US', marketplace: 'Amazon' }, [
    { source_warehouse_id: 'F', destination_warehouse_id: 'T', shipping_method: 'sea', planned_qty: 5 },
    { source_warehouse_id: 'F', destination_warehouse_id: 'T', shipping_method: 'air', planned_qty: 3 }]);
  ok(grp.length === 2, 'T16b they partition into TWO canonical headers');
  w = makeWS();
  var qc = await w.ws.save(validPayload({ sku: 'CO1100-S', routes: [
    { sku: 'CO1100-S', source_warehouse_id: 'F', destination_warehouse_id: 'T', shipping_method: 'sea', planned_qty: 5 },
    { sku: 'CO1100-S', source_warehouse_id: 'F', destination_warehouse_id: 'T', shipping_method: 'sea', planned_qty: 9 }] }));
  ok(qc.code === 'ROUTE_QUANTITY_CONFLICT' && w.counts.save === 0, 'T16c ONE route identity with contradictory quantities still blocks with ZERO writes');

  w = makeWS({ readback: function () { return Promise.resolve(res(okDraft)); } });
  await w.ws.save(validPayload());
  ok(w.counts.save === 1 && w.counts.saveLines === 1, 'T17 one Save command (header + lines, one each)');
  ok(w.counts.readback === 1, 'T19 exactly one targeted readback after committed Save');
  ok(w.counts._lastLines[0].recommended_qty === 7 && w.counts._lastLines[0].allocation_draft_line_id === 'SADL-1', 'T20/T21 recommended_qty preserved + DB line id retained (payload passed through unmodified)');

  // double-click: second concurrent save blocked (in-flight)
  var gate; w = makeWS({ save: function () { return new Promise(function (r) { gate = r; }); }, readback: function () { return Promise.resolve(res(okDraft)); } });
  var p1 = w.ws.save(validPayload());
  var d2 = await w.ws.save(validPayload());
  ok(d2.blocked === true && d2.code === 'IN_FLIGHT' && w.counts.save === 1, 'T18 double-click → second Save blocked IN_FLIGHT (one command)');
  gate(res({ command: 'x', committed: true, allocation_draft_id: 'SAD-1' })); await p1;
  ok(!/loadOperationDb\s*\(/.test(COMPAT), 'T22 controller performs NO whole-DB reload (no loadOperationDb call)');

  // ===================================================================================================
  section('Local recovery decision (§14 23-27)');
  ok(WS.resolveLocalDecision('RESTORE_LOCAL', null).state === 'NOT_SAVED' && WS.resolveLocalDecision('RESTORE_LOCAL', null).restored === true, 'T23 local-only restore → NOT_SAVED');
  var useDb = WS.resolveLocalDecision('USE_DB', { status: 'draft' });
  ok(useDb.applied === true && useDb.restored === false, 'T24 Use DB Draft is the no-overwrite choice');
  ok(WS.compareLocalVsDb({ routeKey: 'F||T||sea||', lines: [{ sku: 'A', planned_qty: 5 }] }, { routeKey: 'F||T||air||', lines: [{ sku: 'A', planned_qty: 5 }] }) === 'DIFFERENT', 'T25 different local vs DB → DIFFERENT (requires explicit choice)');
  ok(WS.compareLocalVsDb({ routeKey: 'F||T||sea||', lines: [{ sku: 'A', planned_qty: 5 }] }, { routeKey: 'F||T||sea||', lines: [{ sku: 'A', planned_qty: 5 }] }) === 'IDENTICAL', 'T26 identical local vs DB → IDENTICAL (no merge needed)');
  ok(WS.resolveLocalDecision('RESTORE_LOCAL', { status: 'submitted' }).applied === false && WS.resolveLocalDecision('RESTORE_LOCAL', { status: 'cancelled' }).reason === 'DB_TERMINAL_LOCKED', 'T27 submitted/cancelled DB Draft cannot be overwritten by local restore');

  // ===================================================================================================
  section('Cancel (§14 28-34)');
  w = makeWS({ readback: function () { return Promise.resolve(res({ status: 'NO_ACTIVE_DRAFT' })); }, cancel: function () { return Promise.resolve(res({ status: 'cancelled', already_cancelled: false })); } });
  var cRes = await w.ws.cancel({ planning_cycle: '2026-W32', company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment' });
  ok(w.counts.cancel === 1, 'T29 Cancel sends exactly one command');
  ok(w.counts.readback === 1, 'T31 one targeted readback after Cancel');
  ok(w.ws.getState().state === 'CANCELLED' && cRes.ok === true, 'T32 cancel → CANCELLED');

  // history preservation: pre-cancel draft/lines are kept when the active readback returns NO_ACTIVE_DRAFT
  var seeded = makeWS({ readback: function () { return Promise.resolve(res(okDraft)); } });
  await seeded.ws.load({});                                   // now SAVED with a draft + lines
  seeded.counts.readback = 0;
  seeded.ws = seeded.ws; // keep ref
  // swap readback to NO_ACTIVE_DRAFT (cancelled excluded from active) via a fresh controller sharing state is not possible,
  // so assert on the controller that preserves history through its own cancel path:
  var hist = makeWS({ readback: (function () { var n = 0; return function () { n++; return Promise.resolve(n === 1 ? res(okDraft) : res({ status: 'NO_ACTIVE_DRAFT' })); }; })(), cancel: function () { return Promise.resolve(res({ status: 'cancelled', already_cancelled: false })); } });
  await hist.ws.load({});                                     // SAVED + draft/lines
  await hist.ws.cancel({});                                   // readback #2 = NO_ACTIVE_DRAFT
  ok(hist.ws.getState().state === 'CANCELLED' && hist.ws.getState().draft && hist.ws.getState().lines.length === 1, 'T32b cancelled Header/Lines remain visible as history');

  var idem = makeWS({ cancel: function () { return Promise.resolve(res({ status: 'cancelled', already_cancelled: true })); }, readback: function () { return Promise.resolve(res({ status: 'NO_ACTIVE_DRAFT' })); } });
  var ir = await idem.ws.cancel({});
  ok(ir.ok === true && ir.alreadyCancelled === true && idem.ws.getState().state === 'CANCELLED' && idem.ws.getState().code === 'ALREADY_CANCELLED', 'T33 repeated Cancel is benign (already_cancelled, not a failure)');
  ok(COMPAT.indexOf('.deleteRow') < 0, 'T34 controller uses no delete action for cancel');

  // ===================================================================================================
  section('Submit safety (§14 35-37) + page wiring (source contract)');
  ok(typeof WS.create === 'function' && Object.keys(WS).indexOf('submit') < 0, 'T35 the Draft workspace controller exposes NO submit (DB-authoritative Submit not falsely exposed)');
  ok(PAGE.indexOf('submitShippingAllocationDrafts') < 0, 'T37 the page never marks a Draft submitted from local UI (no submitShippingAllocationDrafts call)');
  ok(/IRDraftWorkspace/.test(PAGE), 'PW1 page wires the IRDraftWorkspace controller');
  ok(/getShippingAllocationDraftWorkspace/.test(PAGE), 'PW2 page uses the targeted readback (getShippingAllocationDraftWorkspace)');
  ok(/legacy|manual|not yet available/i.test(FREEZE) && /Submit/i.test(FREEZE), 'T36 legacy Submit-Plan disposition is documented');

  console.log('\n----------------------------------------');
  console.log('ALLOCATION DRAFT UI (C2-D2A-UI): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
