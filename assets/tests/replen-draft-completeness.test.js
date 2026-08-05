// System Repair 2 — Part A: Manual Execution Plan persistence contract.
// (1) Pure unit tests of the shared four-field completeness predicate (IRDraft.isRouteComplete) across
//     the §8 scenario matrix, and of the line-payload identity contract (duplicate prevention).
// (2) Source-scan guards over the page orchestration (inventory-replenishment.js) and the backend
//     handler (16_shipping_allocation_handlers.gs) — the DOM/Apps-Script code cannot execute in Node,
//     so these assert the exact structural contract the browser/live-DB path relies on
//     (BROWSER/LIVE-DB-UNVERIFIED). Pure Node, no DOM.
// Run: node assets/tests/replen-draft-completeness.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else console.log('ok   ' + l); }

var mod = require(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js'));
var IRDraft = mod.IRDraft;
var scope = { company: 'KM', country: 'US', marketplace: 'Amazon' };

// ---- Part 1: four-field completeness predicate (§4 / §8 matrix) ------------------------------------
console.log('\n-- isRouteComplete: §8 scenario matrix --');
var FROM = 'WH-KM-CN-FAC', TO = 'WH-KM-US-3PL', M = 'sea';
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM }), false, 'P1: only From → incomplete (no Header/Line)');
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: TO }), false, 'P2: From+To → incomplete');
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: TO, qty: 80 }), false, 'P3: From+To+Qty (no Method) → incomplete');
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: TO, qty: 80, shipping_method: M }), true, 'P4: From+To+Qty+Method → COMPLETE (Header+Line)');
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: TO, qty: 0, shipping_method: M }), false, 'P5: Qty 0 → incomplete');
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: TO, qty: -5, shipping_method: M }), false, 'P6: negative Qty → incomplete');
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: TO, qty: 80, shipping_method: 'No available methods' }), false, 'P7: "No available methods" sentinel is NOT a valid Method');
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: TO, qty: 80, shipping_method: '   ' }), false, 'P8: blank/whitespace Method → incomplete');
// Amazon logical destination is a valid To even though selected_destination_warehouse_id is null.
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: '', destination_type: 'MARKETPLACE_DESTINATION', destination_marketplace: 'Amazon', qty: 80, shipping_method: M }), true, 'P9: Amazon logical To → COMPLETE');
eq(IRDraft.isRouteComplete({ destination_warehouse_id: TO, qty: 80, shipping_method: M }), false, 'P10: missing From → incomplete');
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, qty: 80, shipping_method: M }), false, 'P11: missing To (no real, no logical) → incomplete');
eq(IRDraft.isRouteComplete({}), false, 'P12: empty route → incomplete');
// planned_qty is honored as the canonical qty when present.
eq(IRDraft.isRouteComplete({ source_warehouse_id: FROM, destination_warehouse_id: TO, planned_qty: 12, shipping_method: M }), true, 'P13: planned_qty>0 counts as Qty');

// ---- Part 2: line-payload identity contract (duplicate prevention, §6/§13) -------------------------
console.log('\n-- buildDraftLinePayload: stable identity vs manual add --');
var edit = IRDraft.buildDraftLinePayload('CO1100-S', { allocation_draft_line_id: 'SADL-KEEP01', qty: 80, source_warehouse_id: FROM, destination_warehouse_id: TO, shipping_method: M }, { scope: scope, system: false });
eq(edit.allocation_draft_line_id, 'SADL-KEEP01', 'P14: a provided line id is preserved → handler UPDATES the SAME line (no duplicate)');
eq('recommended_qty' in edit, false, 'P15: user edit does NOT send recommended_qty (snapshot protected)');
var add = IRDraft.buildDraftLinePayload('CO2600-B', { qty: 50, source_warehouse_id: FROM, destination_warehouse_id: TO, shipping_method: M }, { scope: scope, system: false });
eq(add.allocation_draft_line_id, undefined, 'P16: manual add omits id → handler assigns a fresh SADL- id');
eq(add.generation_type, 'user_created', 'P17: manual add is user_created');

// ---- Part 3: page orchestration source-scan (inventory-replenishment.js) ---------------------------
console.log('\n-- page persistence orchestration (source contract) --');
var js = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
var saveFn = (js.match(/function _saveAllocationDraftFromDom\(sku\)[\s\S]*?\n}/) || [''])[0];
ok(/_isRouteComplete\(row\)/.test(saveFn), 'P18: persistence is gated by the shared _isRouteComplete predicate (not a truthy OR check)');
ok(!/if \(method \|\| qty > 0 \|\| sourceWarehouseId/.test(saveFn), 'P19: the old truthy "any intent" gate is GONE (§4)');
ok(/getAttribute\('data-line-id'\)/.test(saveFn), 'P20: the persisted line identity (data-line-id) is read back on save (§6)');
ok(/_newDraftLineId\(\)/.test(saveFn) && /setAttribute\('data-line-id'/.test(saveFn), 'P21: a stable line id is assigned to a newly-complete route (idempotent upsert)');
ok(/_pendingDraftCancels\[sku\][\s\S]{0,40}push\(lineId\)/.test(saveFn) && /removeAttribute\('data-line-id'\)/.test(saveFn), 'P22: a route edited to incomplete queues a soft-cancel + drops its persisted identity (§5)');
ok(/_scheduleDraftDbPersist\(sku\)/.test(saveFn), 'P23: the DB write is debounced (§5.4 — no per-keystroke upsert)');
ok(/function _flushDraftDbPersist\(sku\)/.test(js) && /_draftDbInFlight\[sku\]/.test(js), 'P24: flush has an in-flight guard (no duplicate concurrent writes, §7)');
ok(/if \(!complete\.length\) \{ _cancelAllocationDraftHeader\(\)/.test(js), 'P25: when no valid line remains the empty Header is soft-cancelled (§5.3 — never an orphan header)');
ok(/function _cancelAllocationDraftHeader\(\)[\s\S]*?status: 'cancelled'/.test(js), 'P26: empty-header removal upserts status=cancelled (never a hard delete)');
var compat = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js'), 'utf8');
ok(/status: ctx\.status \|\| 'draft'/.test(compat), 'P27: header payload honors an optional cancel status (ctx.status)');

// ---- Part 4: backend completeness guard source-scan (16_shipping_allocation_handlers.gs) -----------
console.log('\n-- backend completeness guard (source contract) --');
var gs = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8');
ok(/function sadLineIsComplete_\(l\)/.test(gs), 'P28: backend has a sadLineIsComplete_ line guard (C2-D1R: SKU + Qty>0; route completeness is header-level via sadHeaderRouteIsComplete_)');
ok(/function sadHeaderRouteIsComplete_\(b\)/.test(gs), 'P28b: backend has a header-route completeness guard (From + To + Method)');
// C2-D1R: the up-front batch validation lives in the PRIVATE core sadUpsertLinesKeyedCore_ (the public
// handler only locks + terminal-guards + delegates). Earlier this scan targeted the public wrapper, so
// P29–P31 reported false failures; retargeting to the core verifies the real zero-mutation contract.
var handler = (gs.match(/function sadUpsertLinesKeyedCore_\(body\)[\s\S]*?\n}/) || [''])[0];
ok(/for \(var v = 0[\s\S]*?sadLineIsComplete_\(lv\)[\s\S]*?return jsonResponse_\(\{ success: false/.test(handler), 'P29: incomplete line rejected BEFORE any write → zero mutation (§8)');
ok(/for \(var m = 0[\s\S]*?sadApplyLineAliases_/.test(handler) && handler.indexOf('sadLineIsComplete_') < handler.indexOf('created++'), 'P30: batch is validated up-front, before the create/update loop');
ok(/line_status[\s\S]{0,60}=== 'cancelled'[\s\S]{0,80}skipped\+\+; continue/.test(handler), 'P31: a soft-cancel for a never-stored line does not append a spurious cancelled row');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
