// Kitchen Mama Operation System — F1-7M-B2-HOTFIX-OVERSEAS-GETTABLE-RAW-VS-FILTERED-AUDIT-R1
// AUDIT-ONLY diagnostic fixture. Proves — deterministically, against the LIVE production 17-column
// overseas_inventory_snapshot schema — exactly where a snapshot row survives or is dropped across:
//   readSheetAsObjects_ (raw, lowercased headers)  →  backend filterRows_('overseas_inventory_snapshot')
//     →  frontend normalizeOverseasInventorySnapshotRecord  →  .filter(r => r.warehouseId && r.sku)
// getTable applies filterRows_ SERVER-SIDE, so the frontend never sees pre-filter rows; this fixture
// reconstructs both stages to locate the zero-drop condition without production access.
// It also documents the snapshot_id ↔ overseas_inventory_id mapping drift.
// Run: node assets/tests/audit-overseas-gettable-raw-vs-filtered-f1-7m-b2-r1.test.js
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

var GS = read('specs/active/apps-script/02_core_sheet_db.gs');
var DBAPI = read('js/api/operation-system-db-api.js');

// Backend row filter (pure) + frontend normalizer (pure, needs _invPick).
eval(extractFn(GS, 'filterRows_'));
eval(extractFn(DBAPI, '_invPick'));
eval(extractFn(DBAPI, 'normalizeOverseasInventorySnapshotRecord'));
function normalizeAndFilter(rawRows) {
  return rawRows.map(normalizeOverseasInventorySnapshotRecord).filter(function (r) { return r.warehouseId && r.sku; });
}

// ---- Production 17-column schema, as readSheetAsObjects_ yields it (headers lowercased, per-row objects) ----
// LIVE header: overseas_inventory_id (NOT snapshot_id), snapshot_date, warehouse_id, sku, site_sku, wh_physical_stock,
// wh_available_stock, wh_reserved_stock, wh_damaged_stock, wh_on_the_way_qty, wh_on_the_way_eta, wh_on_the_way_bucket,
// last_movement_at, updated_by, created_at, updated_at, note
function prodRow(over) {
  return Object.assign({
    overseas_inventory_id: 'OISN-0001', snapshot_date: '2026-08-18', warehouse_id: 'WH-US-01', sku: 'KM-1001',
    site_sku: 'B0AAA', wh_physical_stock: '5', wh_available_stock: '5', wh_reserved_stock: '0', wh_damaged_stock: '0',
    wh_on_the_way_qty: '0', wh_on_the_way_eta: '', wh_on_the_way_bucket: '', last_movement_at: '', updated_by: 'imp',
    created_at: '2026-08-18', updated_at: '2026-08-18', note: ''
  }, over || {});
}
var validRow   = prodRow();                                                            // warehouse_id + sku → survives
var zeroQtyRow = prodRow({ overseas_inventory_id: 'OISN-0002', warehouse_id: 'WH-US-02', sku: 'KM-1002', wh_physical_stock: '0', wh_available_stock: '0' }); // all-zero qty, still valid
var blankSkuRow = prodRow({ overseas_inventory_id: 'OISN-0003', warehouse_id: 'WH-US-03', sku: '', site_sku: 'B0CCC' });   // site_sku present, sku blank
var blankWhRow  = prodRow({ overseas_inventory_id: 'OISN-0004', warehouse_id: '', sku: 'KM-1004' });                       // warehouse_id blank
var raw = [validRow, zeroQtyRow, blankSkuRow, blankWhRow];

// ===================================================================================================================
console.log('\n== §1 backend filterRows_ contract on the production schema ==');
ok(/case 'overseas_inventory_snapshot':/.test(GS), 'filterRows_ HAS a table-specific rule for overseas_inventory_snapshot');
var filtered = filterRows_('overseas_inventory_snapshot', raw);
ok(raw.length === 4, 'RAW fixture row count = 4');
ok(filtered.length === 2, 'POST-filter valid-row count = 2 (drops blank sku + blank warehouse_id)');
ok(filtered.indexOf(validRow) !== -1 && filtered.indexOf(zeroQtyRow) !== -1, 'valid warehouse_id+sku rows survive (incl. all-zero quantities)');
ok(filtered.indexOf(blankSkuRow) === -1, 'blank sku rejected — site_sku does NOT substitute for canonical sku');
ok(filtered.indexOf(blankWhRow) === -1, 'blank warehouse_id rejected');

// ===================================================================================================================
console.log('\n== §2 frontend normalize+filter matches the backend contract (no frontend-unique drop) ==');
var normFromRaw = normalizeAndFilter(raw);
ok(normFromRaw.length === 2, 'frontend normalize+filter over RAW → 2 (identical to backend)');
// getTable ships POST-filter rows; frontend re-normalizing the already-filtered set keeps all of them.
var normFromFiltered = normalizeAndFilter(filtered);
ok(normFromFiltered.length === 2, 'frontend normalize over POST-filter rows keeps all (backend+frontend agree on warehouse_id+sku)');
var v = normFromFiltered.filter(function (r) { return r.sku === 'KM-1002'; })[0];
ok(v && v.availableStock === 0, 'zero-quantity valid row is retained with availableStock=0 (NOT treated as no-data)');

// ===================================================================================================================
console.log('\n== §5 snapshot_id ↔ overseas_inventory_id mapping drift (identity debt) ==');
ok(/snapshotId: String\(r\.snapshot_id \|\| ''\)\.trim\(\)/.test(DBAPI), 'normalizer reads r.snapshot_id (NOT overseas_inventory_id)');
ok(normFromFiltered[0].snapshotId === '', 'OVERSEAS_SNAPSHOT_ID_MAPPING_DEBT: live overseas_inventory_id → normalized snapshotId is BLANK');
ok(normFromFiltered[0].warehouseId === 'WH-US-01' && normFromFiltered[0].sku === 'KM-1001', 'row still survives despite blank snapshotId (id is NOT a filter field — read-neutral)');
// The import header-validation contract requires a snapshot_id header (writer side) — documents the writer drift.
var GS03 = 0; // (informational) writer validation lives in 05_; asserted separately below.
ok(/plainReq = \['snapshot_id'/.test(read('specs/active/apps-script/05_overseas_inventory_handlers.gs')), 'import header validation REQUIRES a snapshot_id header (would reject the live overseas_inventory_id header)');

// ===================================================================================================================
console.log('\n== VERDICT (audit) ==');
console.log('  CASE A (backend filter contract defect): RULED OUT — filter keeps every valid warehouse_id+sku row.');
console.log('  CASE B (frontend normalization defect):  RULED OUT — frontend matches backend exactly.');
console.log('  => A production zero implies CASE C (rows lack warehouse_id/sku) or CASE D (no data rows).');
console.log('     Decisive USER datum: open production overseas_inventory_snapshot — data-row count + whether');
console.log('     warehouse_id AND sku cells are populated.');

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
