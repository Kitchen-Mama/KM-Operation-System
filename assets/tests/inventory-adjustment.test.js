/* ============================================================================
 * inventory-adjustment.test.js — regression fixtures for the Inventory Adjustment
 * closed loop (Factory + Overseas). Locks the backend arithmetic + validation
 * contract used by handleAdjustFactoryInventory_ (21_factory_inventory_handlers.gs)
 * and handleAdjustOverseasInventory_ (05_overseas_inventory_handlers.gs).
 *
 * These are PURE re-implementations of the handler math (Apps Script cannot run
 * under Node). If a handler formula changes, update the reference below to match —
 * the acceptance cases (task section H) must always hold.
 *
 * Run:  node assets/tests/inventory-adjustment.test.js
 * (Pure Node — no browser/build. Exits non-zero on any failed assertion.)
 * ========================================================================== */

'use strict';

var failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error('  ✗ FAIL: ' + msg); } else { console.log('  ✓ ' + msg); } }
function eq(a, b, msg) { assert(a === b, msg + ' (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }

// ---- Reference: Factory adjustment (only Available is set; Reserved never changes) ----
// before_available   = before_current - before_reserved
// after_reserved     = before_reserved
// after_current      = new_available + before_reserved
// qty                = new_available - before_available   (= after_current - before_current)
// invariant          : after_current - after_reserved === new_available
function factoryAdjust(beforeCurrent, beforeReserved, newAvailable) {
  if (!Number.isInteger(newAvailable) || newAvailable < 0) throw new Error('new_available must be integer >= 0');
  var beforeAvailable = beforeCurrent - beforeReserved;
  if (newAvailable === beforeAvailable) throw new Error('no-op (new === current)');
  var afterReserved = beforeReserved;
  var afterCurrent = newAvailable + beforeReserved;
  var qty = newAvailable - beforeAvailable;
  return {
    qty: qty,
    before_current_stock: beforeCurrent,
    after_current_stock: afterCurrent,
    before_reserved_stock: beforeReserved,
    after_reserved_stock: afterReserved,
    before_available: beforeAvailable,
    after_available: newAvailable,
    invariant_ok: (afterCurrent - afterReserved) === newAvailable
  };
}

// ---- Reference: Overseas adjustment (only available bucket changes; reserved/physical unchanged) ----
// wh_quantity        = new_available - before_available
// reserved/physical  : recorded unchanged (before === after)
function overseasAdjust(beforeAvailable, beforeReserved, beforePhysical, newAvailable) {
  if (!Number.isInteger(newAvailable) || newAvailable < 0) throw new Error('new_available must be integer >= 0');
  if (newAvailable === beforeAvailable) throw new Error('no-op (new === current)');
  return {
    wh_quantity: newAvailable - beforeAvailable,
    wh_quantity_before: beforeAvailable,
    wh_quantity_after: newAvailable,
    wh_before_available_stock: beforeAvailable,
    wh_after_available_stock: newAvailable,
    wh_before_reserved_stock: beforeReserved,
    wh_after_reserved_stock: beforeReserved,
    wh_before_physical_stock: beforePhysical,
    wh_after_physical_stock: beforePhysical
  };
}

console.log('\n== H. Factory acceptance case (120/20 current/reserved, New Available = 75) ==');
var f = factoryAdjust(120, 20, 75);
eq(f.qty, -25, 'qty = -25');
eq(f.after_reserved_stock, 20, 'after_reserved_stock = 20 (unchanged)');
eq(f.after_current_stock, 95, 'after_current_stock = 95');
eq(f.after_available, 75, 'after_available = 75');
eq(f.invariant_ok, true, 'invariant after_current - after_reserved === new_available');

console.log('\n== H. Overseas acceptance case (available 300, New Available = 340) ==');
var o = overseasAdjust(300, 50, 400, 340);
eq(o.wh_quantity, 40, 'wh_quantity = +40');
eq(o.wh_quantity_before, 300, 'wh_quantity_before = 300');
eq(o.wh_quantity_after, 340, 'wh_quantity_after = 340');
eq(o.wh_before_reserved_stock, o.wh_after_reserved_stock, 'reserved unchanged');
eq(o.wh_before_physical_stock, o.wh_after_physical_stock, 'physical unchanged');

console.log('\n== Increase / decrease available (Factory) ==');
eq(factoryAdjust(100, 0, 130).qty, 30, 'increase: +30');
eq(factoryAdjust(100, 0, 70).qty, -30, 'decrease: -30');
eq(factoryAdjust(100, 40, 90).after_current_stock, 130, 'reserved 40 preserved: after_current = 90 + 40');

console.log('\n== Validation: negative / same / non-integer rejected ==');
function throws(fn, label) { try { fn(); assert(false, label + ' should throw'); } catch (e) { assert(true, label + ' rejected'); } }
throws(function () { factoryAdjust(120, 20, -5); }, 'negative new_available');
throws(function () { factoryAdjust(120, 20, 100); }, 'new === current (100) no-op');
throws(function () { factoryAdjust(120, 20, 12.5); }, 'non-integer new_available');
throws(function () { overseasAdjust(300, 0, 300, -1); }, 'overseas negative');
throws(function () { overseasAdjust(300, 0, 300, 300); }, 'overseas new === current no-op');

console.log('\n== Note requirement (contract) ==');
// Note is required by BOTH handlers; a blank/whitespace note is rejected before any write.
function noteOk(n) { return typeof n === 'string' && n.trim() !== ''; }
eq(noteOk(''), false, 'empty note rejected');
eq(noteOk('   '), false, 'whitespace-only note rejected');
eq(noteOk('cycle count'), true, 'real note accepted');

console.log('\n== Signed display helper (+N / -N) ==');
function signed(n) { var v = Number(n) || 0; return (v > 0 ? '+' : '') + v.toLocaleString(); }
eq(signed(40), '+40', '+40');
eq(signed(-25), '-25', '-25');
eq(signed(0), '0', '0');

if (failures) { console.error('\n' + failures + ' assertion(s) FAILED\n'); process.exit(1); }
console.log('\nAll inventory-adjustment assertions passed.\n');
