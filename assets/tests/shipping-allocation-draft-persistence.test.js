// System Repair 1 (Round 4) — Draft persistence contract (Decision E).
// Deterministic tests of the pure payload builders (IRDraft) + a MOCK adapter flow proving the
// incremental upsert-by-line-id contract (NOT blanket REPLACE), planned-only edit, manual-add new
// identity, Amazon logical destination serialization, and soft-cancel. Pure Node (no DOM / DB).
// Run: node assets/tests/shipping-allocation-draft-persistence.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }

var mod = require(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js'));
var IRDraft = mod.IRDraft;
var scope = { company: 'KM', country: 'US', marketplace: 'Amazon' };

console.log('\n-- header payload --');
var h = IRDraft.buildDraftHeaderPayload({ company: 'KM', country: 'US', marketplace: 'Amazon' });
eq([h.source_page, h.company, h.country, h.marketplace, h.status], ['inventory_replenishment', 'KM', 'US', 'Amazon', 'draft'], 'H-1: header payload shape');
eq(h.allocation_draft_id, undefined, 'H-2: no id → handler idempotent-matches/creates');

console.log('\n-- line payload: user edit vs system vs manual add --');
// User edit of an existing system line: planned_qty updated; recommended_qty NOT sent (protected).
var userEdit = IRDraft.buildDraftLinePayload('CO1100-S', { allocation_draft_line_id: 'SADL-1', qty: 80, recommended_qty: 100, source_warehouse_id: 'WH-KM-CN-FAC', destination_warehouse_id: 'WH-KM-US-3PL', shipping_method: 'sea' }, { scope: scope, system: false });
eq(userEdit.allocation_draft_line_id, 'SADL-1', 'L-1: edit targets the SAME line id (not replace)');
eq(userEdit.planned_qty, 80, 'L-2: planned_qty updated to user value');
eq('recommended_qty' in userEdit, false, 'L-3: recommended_qty NOT sent on a user edit (snapshot protected)');
eq(userEdit.selected_source_warehouse_id, 'WH-KM-CN-FAC', 'L-4: selected source id');
eq(userEdit.selected_destination_warehouse_id, 'WH-KM-US-3PL', 'L-5: selected destination id (real 3PL)');
// System-generated line: recommended_qty IS sent; generation_type system_generated.
var sysLine = IRDraft.buildDraftLinePayload('CO1100-S', { qty: 100, recommended_qty: 100, generation_type: 'system_generated' }, { scope: scope, system: true });
eq(sysLine.recommended_qty, 100, 'L-6: system line sends recommended_qty');
eq(sysLine.generation_type, 'system_generated', 'L-7: system generation_type');
eq(sysLine.allocation_draft_line_id, undefined, 'L-8: first insert omits id → handler assigns SADL-');
// Manual Add: no line id, user_created, recommended_qty absent.
var manual = IRDraft.buildDraftLinePayload('CO2600-B', { qty: 50 }, { scope: scope, system: false });
eq([manual.allocation_draft_line_id, manual.generation_type, manual.planned_qty, ('recommended_qty' in manual)], [undefined, 'user_created', 50, false], 'L-9: manual add → new id, user_created, planned only, no recommended');

console.log('\n-- Amazon logical destination serialization --');
var amz = IRDraft.buildDraftLinePayload('CO1100-S', { qty: 30, destination_type: 'MARKETPLACE_DESTINATION', destination_country: 'US' }, { scope: scope, system: false });
eq(amz.selected_destination_warehouse_id, null, 'L-10: Amazon logical → selected_destination_warehouse_id = null');
eq(amz.destination_marketplace, 'Amazon', 'L-11: Amazon logical → marketplace=Amazon context');

console.log('\n-- soft cancel --');
var cancel = IRDraft.buildCancelLinePayload('SAD-1', 'SADL-1');
eq(cancel, { allocation_draft_id: 'SAD-1', lines: [{ allocation_draft_line_id: 'SADL-1', line_status: 'cancelled' }] }, 'C-1: soft cancel = line_status cancelled (single line; never hard delete/replace)');

console.log('\n-- MOCK adapter flow (header then incremental lines; no REPLACE) --');
var calls = [];
var mockDB = {
  upsertShippingAllocationDraft: function (p) { calls.push(['header', p]); return Promise.resolve({ success: true, data: { allocation_draft_id: 'SAD-NEW' } }); },
  upsertShippingAllocationDraftLines: function (p) { calls.push(['lines', p]); return Promise.resolve({ success: true, data: { line_count: (p.lines || []).length, created: 1, updated: 0 } }); }
};
// Simulate the persistence sequence the page performs.
(function run() {
  var header = IRDraft.buildDraftHeaderPayload(scope);
  return mockDB.upsertShippingAllocationDraft(header).then(function (hres) {
    var draftId = hres.data.allocation_draft_id;
    var line = IRDraft.buildDraftLinePayload('CO1100-S', { qty: 80, source_warehouse_id: 'F', destination_type: 'MARKETPLACE_DESTINATION', destination_country: 'US' }, { scope: scope });
    return mockDB.upsertShippingAllocationDraftLines({ allocation_draft_id: draftId, lines: [line] });
  }).then(function () {
    eq(calls.length, 2, 'M-1: exactly two calls (header, then lines)');
    eq(calls[0][0], 'header', 'M-2: header upserted first');
    eq(calls[1][0] === 'lines' && calls[1][1].allocation_draft_id, 'SAD-NEW', 'M-3: lines upserted under returned draft id');
    eq(calls[1][1].lines.length, 1, 'M-4: incremental — one line sent (not a full REPLACE of all lines)');
    eq(calls[1][1].lines[0].selected_destination_warehouse_id, null, 'M-5: Amazon logical persisted as null destination id');
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
    process.exit(fail ? 1 : 0);
  });
})();
