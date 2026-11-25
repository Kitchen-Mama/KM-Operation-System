'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const text = fs.readFileSync('assets/js/pages/inventory-replenishment.js', 'utf8');
const c = {}; vm.createContext(c); vm.runInContext(text.slice(0, text.indexOf('// Read-only per-line reconciliation')), c);
const today = Date.UTC(2026, 10, 25), ships = [
 { shipmentId: 'FBA', company: 'KM', country: 'US', marketplace: 'Amazon', destinationWarehouseId: 'F', status: 'in_transit', eta: '2026-11-24' },
 { shipmentId: '3PL', company: 'KM', country: 'US', marketplace: 'Amazon', destinationWarehouseId: 'O', status: 'in_transit', eta: '2026-11-24' },
 { shipmentId: 'TODAY', company: 'KM', country: 'US', marketplace: 'Amazon', destinationWarehouseId: 'F', status: 'in_transit', eta: '2026-11-25' },
 { shipmentId: 'DONE', company: 'KM', country: 'US', marketplace: 'Amazon', destinationWarehouseId: 'F', status: 'received', eta: '2026-11-24' }
];
const lines = ships.map(s => ({ shipmentId: s.shipmentId, sku: 'SKU', shipmentQty: 100, shipmentReceivedQty: 25 }));
lines.push({ shipmentId: 'FBA', sku: 'SKU', shipmentQty: 20, shipmentReceivedQty: 10 });
const result = c._irBuildShipmentDisplayByReceiver(ships, lines, today, {}, { F: 'FBA', O: '3PL' })['km|us|amazon|sku'];
assert.equal(result.plat.overdue, 85); assert.equal(result.ovs.overdue, 75); assert.equal(result.plat.d0_18, 75);
assert.equal(result.plat.overdueIds.join(','), 'FBA'); assert.equal(result.ovs.overdueIds.join(','), '3PL'); assert.equal(result.overdue, 160);
console.log('INVENTORY_OVERDUE_IDS_PASS 6 offline');
