// Kitchen Mama Operation System — F1-7M-B2-HOTFIX-OVERSEAS-IMPORT-IDENTITY-CONTRACT-R1
// Freezes ONE canonical persisted identity for overseas_inventory_snapshot (overseas_inventory_id) and proves the
// import path is compatible with the LIVE production schema:
//   - backend import header validation no longer requires a legacy snapshot_id header (it blocked every live import);
//   - identity is SERVER-generated (OISN-{uuid8}) and written to the canonical overseas_inventory_id column
//     (legacy snapshot_id column still accepted as a fallback — no second persisted identity added);
//   - frontend normalizer resolves snapshotId = overseas_inventory_id || legacy snapshot_id;
//   - warehouse_id + sku stay REQUIRED; site_sku never substitutes for sku; zero quantities are valid;
//   - CSV/xlsx template + upload validator remain identity-free (user provides warehouse_id+sku+quantities only);
//   - reader, warehouse/sku joins, B5 post-write bounded readback, cold-start scoped predicate, and the adjustment
//     writer are UNCHANGED.
// Run: node assets/tests/api-overseas-import-identity-contract-f1-7m-b2-r1.test.js
// NOTE: no 'use strict' — extracted pure fns are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}

var DBAPI = read('js/api/operation-system-db-api.js');
var OVS = read('specs/active/apps-script/05_overseas_inventory_handlers.gs');
var PAGE = read('js/pages/overseas-stock.js');

eval(extractFn(DBAPI, '_invPick'));
eval(extractFn(DBAPI, 'normalizeOverseasInventorySnapshotRecord'));
function normAndFilter(rows) { return rows.map(normalizeOverseasInventorySnapshotRecord).filter(function (r) { return r.warehouseId && r.sku; }); }
function prodRow(over) {
  return Object.assign({
    overseas_inventory_id: 'OISN-AAAA1111', snapshot_date: '2026-08-18', warehouse_id: 'WH-US-01', sku: 'KM-1001',
    site_sku: 'B0AAA', wh_physical_stock: '5', wh_available_stock: '5', wh_reserved_stock: '0', wh_damaged_stock: '0',
    wh_on_the_way_qty: '0', wh_on_the_way_eta: '', wh_on_the_way_bucket: '', last_movement_at: '', updated_by: 'imp',
    created_at: '2026-08-18', updated_at: '2026-08-18', note: ''
  }, over || {});
}

// ===================================================================================================================
console.log('\n== Phase 6 — frontend normalizer identity mapping (canonical + legacy fallback) ==');
var canon = normAndFilter([prodRow()])[0];
ok(canon && canon.snapshotId === 'OISN-AAAA1111', '1/2: overseas_inventory_id → snapshotId (canonical)');
var legacy = normAndFilter([{ snapshot_id: 'OISN-LEGACY9', warehouse_id: 'WH-US-9', sku: 'KM-9' }])[0];
ok(legacy && legacy.snapshotId === 'OISN-LEGACY9', '3: legacy snapshot_id-only row still resolves snapshotId (read compatibility)');
ok(/snapshotId: String\(r\.overseas_inventory_id \|\| r\.snapshot_id \|\| ''\)\.trim\(\)/.test(DBAPI), 'normalizer source: overseas_inventory_id first, snapshot_id fallback');

// ===================================================================================================================
console.log('\n== normalization validity (production 17-col) ==');
var rows = [
  prodRow(),                                                                              // valid
  prodRow({ overseas_inventory_id: 'OISN-Z', warehouse_id: 'WH-US-2', sku: 'KM-2', wh_available_stock: '0', wh_physical_stock: '0' }), // zero qty valid
  prodRow({ overseas_inventory_id: 'OISN-Y', warehouse_id: 'WH-US-3', sku: '', site_sku: 'B0CCC' }),  // blank sku
  prodRow({ overseas_inventory_id: 'OISN-X', warehouse_id: '', sku: 'KM-4' })              // blank warehouse_id
];
var kept = normAndFilter(rows);
ok(kept.length === 2, '4/5/6: valid rows survive; blank sku + blank warehouse_id rejected');
ok(kept.filter(function (r) { return r.sku === 'KM-2'; })[0].availableStock === 0, '7: zero-quantity valid row is retained (availableStock=0)');
ok(kept.filter(function (r) { return r.warehouseId === 'WH-US-3'; }).length === 0, 'blank sku row dropped — site_sku does NOT substitute for canonical sku');

// ===================================================================================================================
console.log('\n== Phase 4 — CSV/xlsx template + upload validator are identity-free and agree ==');
ok(/var OVERSEAS_IMPORT_HEADERS = \['warehouse_id', 'sku', 'available_stock'/.test(PAGE), '8: template headers are user facts (warehouse_id+sku+quantities), NO identity column');
ok(PAGE.indexOf("OVERSEAS_IMPORT_HEADERS = ['warehouse_id', 'sku', 'available_stock', 'reserved_stock', 'damaged_stock', 'on_the_way_qty', 'on_the_way_eta', 'note']") !== -1, 'template header list unchanged (no snapshot_id / overseas_inventory_id)');
ok(/idxOf\['warehouse_id'\] === -1/.test(PAGE), '8: upload validator requires warehouse_id (identity never required from the user)');
ok(PAGE.indexOf('snapshot_id') === -1 && PAGE.indexOf('overseas_inventory_id') === -1, 'frontend page carries no identity header in the import contract');

// ===================================================================================================================
console.log('\n== Phase 2/3/5 — backend import: server-generated identity, canonical column, no snapshot_id header req ==');
ok(!/plainReq = \['snapshot_id'/.test(OVS), '9: import header validation NO LONGER requires a legacy snapshot_id header');
ok(/var plainReq = \['warehouse_id', 'sku', 'site_sku', 'note', 'created_at', 'updated_at'\];/.test(OVS), 'plainReq leads with warehouse_id (identity validated separately)');
ok(/var snIdCol = function\(\) \{ var i = snapHeaders\.indexOf\('overseas_inventory_id'\); return i !== -1 \? i : snapHeaders\.indexOf\('snapshot_id'\); \};/.test(OVS), '12: identity resolver prefers overseas_inventory_id, legacy snapshot_id fallback');
ok(/if \(snIdCol\(\) === -1\) missingHeaders\.push\('overseas_inventory_snapshot\.overseas_inventory_id \(or legacy snapshot_id\)'\);/.test(OVS), 'identity column required under EITHER canonical or legacy name');
ok(/var sid = 'OISN-' \+ Utilities\.getUuid\(\)\.replace\(\/-\/g, ''\)\.substring\(0, 8\);/.test(OVS), '10/11: identity server-generated OISN-{uuid8} (existing convention, unique)');
ok(/if \(snIdCol\(\) !== -1\) newRow\[snIdCol\(\)\] = sid;/.test(OVS), '12: writer writes the generated id into the canonical identity column');
ok(/if \(!warehouseId\) miss\.push\('warehouse_id'\);\s*\n\s*if \(!sku\) miss\.push\('sku'\);/.test(OVS), '14/15: import writer rejects blank warehouse_id and blank sku (per-row)');
ok(OVS.indexOf('site_sku') !== -1 && !/sku = String\(row\.site_sku/.test(OVS), '16: site_sku is preserved but NEVER substituted for canonical sku on write');

// ===================================================================================================================
console.log('\n== Phase 5/6 preservation — reader, B5, cold-start, adjustment unchanged ==');
// Backend read filter unchanged (warehouse_id && sku).
ok(/case 'overseas_inventory_snapshot':\s*\n\s*return rows\.filter\(function\(r\) \{\s*\n\s*var hasWh = r\.warehouse_id/.test(read('specs/active/apps-script/02_core_sheet_db.gs')), '13/17: backend read filter (warehouse_id && sku) UNCHANGED — imported valid row is served');
// B5 bounded post-write readback intact.
var osAfter = extractFn(PAGE, '_osAfterWrite');
ok(/loadScopedTables\(_OS_MUTABLE_TABLES\)/.test(osAfter) && /Object\.assign\(\{\}, _osReadModel, \{ overseasInventorySnapshot: m\.overseasInventorySnapshot, overseasInventoryMovements: m\.overseasInventoryMovements \}\)/.test(osAfter), '15: B5 two-table bounded post-write merge preserved');
// Cold-start scoped predicate still routes through the shared helper.
ok(/isScopedReadEligible && window\.KM\.DB\.isScopedReadEligible\(\)/.test(extractFn(PAGE, '_osScopedActive')), '16: cold-start scoped predicate preserved (isScopedReadEligible)');
// Overseas adjustment handler NOT altered (available-stock authority + reserved/physical untouched).
ok(/adjusts ONLY the available_stock bucket \(wh_available_stock\)/.test(OVS), '20: Overseas Adjustment handler contract unchanged');
// Movement normalizer unchanged.
ok(/function normalizeOverseasInventoryMovementRecord/.test(DBAPI), '21: Movement Log normalizer present/unchanged');
// Factory read filter unchanged (no identity coupling).
ok(/case 'factory_stock':/.test(read('specs/active/apps-script/02_core_sheet_db.gs')), '18: Factory Stock filter unchanged');

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
