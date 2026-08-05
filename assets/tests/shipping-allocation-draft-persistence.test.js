// Draft persistence contract — C2-D1R (reconciled to the approved 30-col header / 28-col line schema).
// Deterministic tests of the pure payload builders (IRDraft) + a MOCK adapter flow. Route context
// (From/To/Method/Last-mile) is HEADER-level (recommended_*); the 28-col line carries SKU + qty only
// (NO selected_*). Proves the header-route mapping, incremental upsert-by-line-id, planned-only edit,
// manual-add new identity, Amazon-logical destination on the header, and soft-cancel. Pure Node (no DOM/DB).
// Run: node assets/tests/shipping-allocation-draft-persistence.test.js
'use strict';
var path = require('path');
var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else console.log('ok   ' + l); }

var mod = require(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js'));
var IRDraft = mod.IRDraft;
var scope = { company: 'KM', country: 'US', marketplace: 'Amazon' };

console.log('\n-- header payload: route context is HEADER-level (C2-D1R §7) --');
var hMin = IRDraft.buildDraftHeaderPayload({ company: 'KM', country: 'US', marketplace: 'Amazon' });
eq([hMin.source_page, hMin.company, hMin.country, hMin.marketplace, hMin.status], ['inventory_replenishment', 'KM', 'US', 'Amazon', 'draft'], 'H-1: base header shape');
eq(hMin.allocation_draft_id, undefined, 'H-2: no id → handler idempotent-matches/creates');
ok(!('recommended_source_warehouse_id' in hMin), 'H-3: no route context provided → no recommended_* on header');
// A real-warehouse route maps From/To/Method onto the HEADER recommended_* fields.
var hRoute = IRDraft.buildDraftHeaderPayload({ company: 'KM', country: 'US', marketplace: 'Amazon',
  source_warehouse_id: 'WH-KM-CN-FAC', source_warehouse_code: 'CN-FAC', destination_warehouse_id: 'WH-KM-US-3PL', destination_warehouse_code: 'US-3PL', shipping_method: 'sea', last_mile_delivery: 'ground' });
eq(hRoute.recommended_source_warehouse_id, 'WH-KM-CN-FAC', 'H-4: From → recommended_source_warehouse_id (HEADER)');
eq(hRoute.recommended_destination_warehouse_id, 'WH-KM-US-3PL', 'H-5: To → recommended_destination_warehouse_id (HEADER)');
eq([hRoute.recommended_source_warehouse_code_snapshot, hRoute.recommended_destination_warehouse_code_snapshot], ['CN-FAC', 'US-3PL'], 'H-6: From/To code snapshots on the HEADER');
eq([hRoute.recommended_shipping_method, hRoute.recommended_last_mile_delivery], ['sea', 'ground'], 'H-7: Method + Last-mile → header recommended_shipping_method / recommended_last_mile_delivery');
// Amazon logical destination → header destination_marketplace, blank recommended_destination_warehouse_id.
var hAmz = IRDraft.buildDraftHeaderPayload({ company: 'KM', country: 'US', marketplace: 'Amazon',
  source_warehouse_id: 'WH-KM-CN-FAC', destination_warehouse_id: '', shipping_method: 'air', destination_marketplace: 'Amazon' });
eq([hAmz.recommended_destination_warehouse_id, hAmz.destination_marketplace], ['', 'Amazon'], 'H-8: Amazon logical To → blank recommended_destination_warehouse_id + destination_marketplace=Amazon');

console.log('\n-- line payload: SKU + qty grain (NO selected_*) --');
var userEdit = IRDraft.buildDraftLinePayload('CO1100-S', { allocation_draft_line_id: 'SADL-1', qty: 80, recommended_qty: 100, route_no: 'R1' }, { scope: scope, system: false });
eq(userEdit.allocation_draft_line_id, 'SADL-1', 'L-1: edit targets the SAME line id (not replace)');
eq(userEdit.planned_qty, 80, 'L-2: planned_qty updated to user value');
eq('recommended_qty' in userEdit, false, 'L-3: recommended_qty NOT sent on a user edit (snapshot protected)');
ok(!('selected_source_warehouse_id' in userEdit) && !('selected_destination_warehouse_id' in userEdit) && !('selected_shipping_method' in userEdit), 'L-4: NO selected_* on the 28-col line (route is HEADER-level)');
eq(userEdit.route_no, 'R1', 'L-5: route_no carried on the line');
// System-generated line: recommended_qty IS sent; generation_type system_generated.
var sysLine = IRDraft.buildDraftLinePayload('CO1100-S', { qty: 100, recommended_qty: 100, generation_type: 'system_generated' }, { scope: scope, system: true });
eq(sysLine.recommended_qty, 100, 'L-6: system line sends recommended_qty');
eq(sysLine.generation_type, 'system_generated', 'L-7: system generation_type');
eq(sysLine.allocation_draft_line_id, undefined, 'L-8: first insert omits id → handler assigns SADL-');
// Manual Add: no line id, user_created, recommended_qty absent.
var manual = IRDraft.buildDraftLinePayload('CO2600-B', { qty: 50 }, { scope: scope, system: false });
eq([manual.allocation_draft_line_id, manual.generation_type, manual.planned_qty, ('recommended_qty' in manual)], [undefined, 'user_created', 50, false], 'L-9: manual add → new id, user_created, planned only, no recommended');

console.log('\n-- soft cancel --');
var cancel = IRDraft.buildCancelLinePayload('SAD-1', 'SADL-1');
eq(cancel, { allocation_draft_id: 'SAD-1', lines: [{ allocation_draft_line_id: 'SADL-1', line_status: 'cancelled' }] }, 'C-1: soft cancel = line_status cancelled (single line; never hard delete/replace)');

console.log('\n-- MOCK adapter flow (header with route, then incremental lines; no REPLACE) --');
var calls = [];
var mockDB = {
  upsertShippingAllocationDraft: function (p) { calls.push(['header', p]); return Promise.resolve({ success: true, data: { allocation_draft_id: 'SAD-NEW' } }); },
  upsertShippingAllocationDraftLines: function (p) { calls.push(['lines', p]); return Promise.resolve({ success: true, data: { line_count: (p.lines || []).length, created: 1, updated: 0 } }); }
};
(function run() {
  var header = IRDraft.buildDraftHeaderPayload({ company: 'KM', country: 'US', marketplace: 'Amazon', source_warehouse_id: 'F', destination_marketplace: 'Amazon', shipping_method: 'air' });
  return mockDB.upsertShippingAllocationDraft(header).then(function (hres) {
    var draftId = hres.data.allocation_draft_id;
    var line = IRDraft.buildDraftLinePayload('CO1100-S', { qty: 80 }, { scope: scope });
    return mockDB.upsertShippingAllocationDraftLines({ allocation_draft_id: draftId, lines: [line] });
  }).then(function () {
    eq(calls.length, 2, 'M-1: exactly two calls (header, then lines)');
    eq(calls[0][0], 'header', 'M-2: header upserted first');
    eq([calls[0][1].recommended_source_warehouse_id, calls[0][1].recommended_shipping_method, calls[0][1].destination_marketplace], ['F', 'air', 'Amazon'], 'M-3: route context is carried on the HEADER payload');
    eq(calls[1][1].allocation_draft_id, 'SAD-NEW', 'M-4: lines upserted under returned draft id');
    eq(calls[1][1].lines.length, 1, 'M-5: incremental — one line sent (not a full REPLACE)');
    ok(!('selected_destination_warehouse_id' in calls[1][1].lines[0]), 'M-6: line payload carries NO selected_* (28-col grain)');
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
    process.exit(fail ? 1 : 0);
  });
})();
