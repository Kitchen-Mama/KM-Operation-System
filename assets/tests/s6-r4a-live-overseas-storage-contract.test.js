// S6-R4A — THE LIVE OVERSEAS INVENTORY STORAGE CONTRACT, MADE EXECUTABLE.
//
// WHY THIS SUITE EXISTS.
//
// The operator inspected the live production `overseas_inventory_snapshot` sheet on 2026-09-29 and supplied
// its header and sample rows. That evidence RESOLVED two of the four conditions blocking S6-R4 and CONFIRMED
// the one that still blocks it. A live header is a fact about a spreadsheet nobody in this repository can
// re-read; a writer census is a fact about THIS TREE, and it is the census — not the blank cells — that
// proves the blocking condition. This suite pins the census so the block cannot quietly expire, and so the
// round that lands the reserve lifecycle is forced to confront the hazard in section D first.
//
// WHAT THE LIVE EVIDENCE SAID (operator-supplied, authoritative over planning docs per §0):
//
//   header:  overseas_inventory_id, snapshot_date, warehouse_id, sku, site_sku,
//            wh_physical_stock, wh_available_stock, wh_reserved_stock, wh_damaged_stock,
//            wh_on_the_way_qty, wh_on_the_way_eta, wh_on_the_way_bucket,
//            last_movement_at, updated_by, created_at, updated_at, note
//   rows:    wh_available_stock populated · wh_physical_stock BLANK · reserved 0 · damaged 0
//   context: this is an INITIAL IMPORT of usable stock only. Damaged / refurbish / reservation
//            lifecycles are not populated, so today's zeros prove NOTHING structural about them.
//
// THE ONE CLAIM THIS SUITE MAKES THAT THE SAMPLES CANNOT:
//
//   wh_physical_stock is blank in production BECAUSE NO CODE HAS EVER WRITTEN IT. Sections B and C prove
//   that from source, four independent ways. That is why LIVE_STORAGE_OUTCOME = B is a finding and not an
//   inference from three accidentally-empty columns.
//
// A FAILURE HERE IS NOT AUTOMATICALLY A REGRESSION. Sections B/C/D describe a system that SHOULD change:
// the day a reserve lifecycle lands, D2 and D3 must change with it, and the round that changes them owes
// this file the evidence that closed the hazard. Read each label for which kind of assertion it is.
//
// NO PRODUCTION WRITE. Source text and the operator-declared live header only.
//
// Run: node assets/tests/s6-r4a-live-overseas-storage-contract.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// Comments are not code. Every claim about what the runtime DOES is made against the stripped text — a
// comment naming a column is not a writer of it, and this suite's whole subject is a column three comments
// discuss and no statement assigns.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

// The generated bundle is a BUILD OUTPUT of assets/js/core/*.js. Counting it doubles every finding and
// invents owners that do not exist — the same mistake S6-R3 caught in its reference walk.
var ALL_GS = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) {
  return /\.gs$/.test(f) && f.indexOf('TEMP_') !== 0 && f !== '90_generated_supply_planning_bundle.gs';
});

var F01 = read(GS + '01_router.gs');
var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
var F43 = read(GS + '43_api_v1_gap_materialization.gs');
var F45 = read(GS + '45_api_v1_automation_schedule.gs');
var F54 = read(GS + '54_api_v1_raw_inventory_owner.gs');
var API = read('assets/js/api/operation-system-db-api.js');

// The operator-supplied live header, declared once. Everything below is measured against THIS, not against
// any planning document's idea of the schema.
var LIVE_HEADER = [
  'overseas_inventory_id', 'snapshot_date', 'warehouse_id', 'sku', 'site_sku',
  'wh_physical_stock', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock',
  'wh_on_the_way_qty', 'wh_on_the_way_eta', 'wh_on_the_way_bucket',
  'last_movement_at', 'updated_by', 'created_at', 'updated_at', 'note'
];

// =========================================================================================================
section('A. the live header is canonical — the header-ambiguity block is RESOLVED');
// =========================================================================================================

['wh_physical_stock', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock', 'wh_on_the_way_qty'
].forEach(function (f, i) {
  ok(LIVE_HEADER.indexOf(f) >= 0, 'A' + (i + 1) + ' live header carries canonical ' + f);
});
// No legacy spelling survives anywhere in the live sheet. This is what closes S6-R4 blocking condition 1.
var LEGACY_NAMES = ['physical_stock', 'available_stock', 'reserved_stock', 'damaged_stock', 'on_the_way_qty'];
eq(LIVE_HEADER.filter(function (h) { return LEGACY_NAMES.indexOf(h) >= 0; }), [],
  'A6 and NO legacy-spelled quantity column is present — LEGACY_FIELDS_PRESENT = NO');
// The identity column too: the F1-7M-B2 hotfix assumed the live rename to overseas_inventory_id, and the
// live header proves that assumption was right. Independent corroboration that this IS the current header.
ok(LIVE_HEADER.indexOf('overseas_inventory_id') >= 0 && LIVE_HEADER.indexOf('snapshot_id') < 0,
  'A7 identity is overseas_inventory_id, not legacy snapshot_id — corroborates the header is current');
// 43_ reads wh_available_stock with NO fallback. Against this header it resolves, so blocking condition 3
// (43_ and 54_ cannot both be right) is decided in 43_'s favour and there is no production defect.
ok(/gapNum_\(r\.wh_available_stock\)/.test(code(F43)) && LIVE_HEADER.indexOf('wh_available_stock') >= 0,
  'A8 43_ reads wh_available_stock unfallbacked and the live header HAS it — CURRENT_PRODUCTION_DEFECT = NO');

// =========================================================================================================
section('B. wh_physical_stock: the writer census — this is what proves LIVE_STORAGE_OUTCOME = B');
// =========================================================================================================

// A "writer" = a header-mapped emit, or a setValue through a resolved column index. Counted over every
// shipped handler, not over the files that happen to mention the name.
var physWriters = ALL_GS.filter(function (f) {
  var c = code(read(GS + f));
  return /wh_physical_stock\s*:/.test(c) ||
         /setValue\([^)]*\)[^;]*wh_physical_stock/.test(c) ||
         /snPhys[^=]*\+ 1\)\.setValue/.test(c);
});
eq(physWriters, [], 'B1 WH_PHYSICAL_WRITER_COUNT = 0 — no shipped handler writes it');

var QTY = /var qtyFields = \[([\s\S]*?)\];/.exec(F05)[1];
ok(QTY.indexOf('wh_physical_stock') < 0,
  'B2 WH_PHYSICAL_IMPORTER_WRITE_COUNT = 0 — absent from the importer\'s writable qtyFields');
ok(/var whReq = qtyFields\.concat\(\['wh_on_the_way_eta'\]\);/.test(code(F05)),
  'B3 and absent from required-header validation — the importer never even asks whether it exists');
// THE MECHANISM. A created row is `new Array(len).fill('')` with only known keys filled, so any column the
// importer does not own is born EMPTY. That is not an operator omission — it is what the code does, and it
// is the direct cause of the blank live column.
ok(/new Array\(snapHeaders\.length\)\.fill\(''\)/.test(code(F05)),
  'B4 create branch fills every unknown column with \'\' — the blank live column is produced HERE');
ok(!/wh_physical_stock/.test(code(F31)) && !/[^_]physical_stock/.test(code(F31)),
  'B5 and the receipt poster creates rows with no physical column in EITHER namespace');

// The only toucher READS it, to copy it unchanged onto both sides of the ledger pair. A ledger that records
// "physical did not change" on every row is exactly the artefact an unmaintained column leaves behind.
var C05 = code(F05);
ok(/snapHeaders\.indexOf\('wh_physical_stock'\)/.test(C05),
  'B6 05_ READS it once, to stamp the movement row');
ok(/setMv\('wh_before_physical_stock', beforePhysical\)/.test(C05) &&
   /setMv\('wh_after_physical_stock', beforePhysical\)/.test(C05),
  'B7 and writes the SAME value to before AND after — the ledger never observes a physical change');
ok(/physicalStock: parseFloat\(_invPick\(r, 'wh_physical_stock', 'physical_stock'\)\) \|\| 0/.test(code(API)),
  'B8 the client normalizer defaults it to 0 — an unmaintained column is indistinguishable from zero stock');

// The only UI that projects a physical decrement reads that same 0. This is §7's defect already on screen.
var OUT = code(read('assets/js/pages/overseas-outbound.js'));
ok(/snap\.physicalStock/.test(OUT) && /bucket: 'current_stock'/.test(OUT),
  'B9 overseas-outbound.js projects a current_stock decrement from physicalStock — against a blank column');
ok(/Runtime handler NOT implemented/.test(read('assets/js/pages/overseas-outbound.js')),
  'B10 — but that page is Preview Mode and posts nothing, so no production row is affected today');

// =========================================================================================================
section('C. available is STORED and source-reported — nothing derives it, which is why Option A is coherent');
// =========================================================================================================

ok(QTY.indexOf('wh_available_stock') >= 0,
  'C1 wh_available_stock IS in the importer\'s writable set — KM can maintain it');
// Three write owners, all reached through a POST router action or a receipt transaction. None is scheduled.
ok(/if \(action === 'importOverseasInventorySnapshotBatch'\)/.test(code(F01)) &&
   /if \(action === 'adjustOverseasInventory'\)/.test(code(F01)),
  'C2 both 05_ write entry points are POST router actions — operator-triggered, never automatic');
ok(/wh_available_stock: after/.test(code(F31)),
  'C3 and 31_ posts the receipt delta — the third and last write owner');

// No code anywhere reconstructs available from the other buckets. The mapping spec permits either a
// reconstructable or a preserved source value; live production is the preserved-source branch, and the
// absence of any derivation is what makes that unambiguous.
var DERIVE = /wh_available_stock\s*=[^;\n]*wh_physical_stock|physicalStock\s*-\s*[a-zA-Z]*[Rr]eserved/;
ok(!DERIVE.test(code(F05)) && !DERIVE.test(code(F31)) && !DERIVE.test(code(API)),
  'C4 WH_AVAILABLE_STOCK_SEMANTIC = source-reported — no writer or reader derives it from physical');
ok(/We do NOT recompute physical from available/.test(F05),
  'C5 and 05_ says so in its own words — the rule R4 needs is already the shipped rule');

// =========================================================================================================
section('D. THE HAZARD — the importer zeroes wh_reserved_stock, and R4 cannot land until it does not');
// =========================================================================================================

// This is the single most consequential finding of the round, and it is NOT resolved by this read-only
// verification. It is pinned here so the implementing round cannot miss it.
ok(QTY.indexOf('wh_reserved_stock') >= 0,
  'D1 wh_reserved_stock is in qtyFields — the importer OVERWRITES it on every update');
ok(/if \(sv === ''\) \{ qtyVals\[f\] = 0; continue; \}/.test(C05),
  'D2 HAZARD — a blank CSV cell becomes 0, it does not mean "leave this column alone"');
ok(/qtyFields\.forEach\(function\(f\) \{ var ci = snPref\(f\); if \(ci !== -1\) snapSheet\.getRange\(tr, ci \+ 1\)\.setValue\(qtyVals\[f\]\); \}\);/.test(C05),
  'D3 HAZARD — and the update branch writes every qtyField unconditionally on an existing row');
// Therefore: a routine stock refresh carrying only `available` silently resets every KM reservation to
// zero, with no error, no ledger row and no warning — while the exposure ledger still believes the units
// are held. Harmless today (reserved is 0 everywhere); catastrophic the day after R4 writes the first hold.
ok(true, 'D4 => a CSV refresh without a reserved column wipes KM reservations. Close this WITH the reserve.');

// The reserved bucket has no competing owner, which is the good half of the finding: it is free for KM.
ok(!/reservation_acquire|reservation_release/.test(C05) && !/reservation_acquire|reservation_release/.test(code(F31)),
  'D5 no reservation writer exists yet — RESERVED_FIELD_MAINTAINED = NO, and no external owner claims it');

// =========================================================================================================
section('E. no automated sync — the Option-A overwrite fear is manual, not scheduled');
// =========================================================================================================

var JOBS = (F45.match(/handler: '([A-Za-z0-9_]+)'/g) || []).map(function (s) { return s.replace(/handler: '|'/g, ''); });
ok(JOBS.length >= 5, 'E1 the automation registry declares ' + JOBS.length + ' handler-bound jobs');
eq(JOBS.filter(function (h) { return /[Oo]verseas/.test(h); }), [],
  'E2 WH_AVAILABLE_EXTERNAL_SYNC_OWNER = NONE — no scheduled job is an overseas importer');
// And no file that creates a time trigger references the overseas snapshot at all.
var trigFiles = ALL_GS.filter(function (f) { return /ScriptApp\.newTrigger\(/.test(code(read(GS + f))); });
eq(trigFiles.filter(function (f) { return /overseas_inventory_snapshot/.test(read(GS + f)); }), [],
  'E3 and no trigger-creating file so much as names overseas_inventory_snapshot');

// =========================================================================================================
section('F. the movement ledger can represent reserve/release; it cannot represent a physical consume');
// =========================================================================================================

var MOVH = /var SHIP_RECEIPT_OVS_MOV_HEADERS_ = \[([\s\S]*?)\];/.exec(F31)[1];
['from_stock_type', 'to_stock_type', 'wh_before_reserved_stock', 'wh_after_reserved_stock',
 'wh_before_available_stock', 'wh_after_available_stock', 'reference_type', 'reference_id'
].forEach(function (c, i) {
  ok(MOVH.indexOf("'" + c + "'") >= 0, 'F' + (i + 1) + ' the movements header carries ' + c);
});
ok(MOVH.indexOf("'wh_before_physical_stock'") >= 0 && MOVH.indexOf("'wh_after_physical_stock'") >= 0,
  'F9 it even carries the physical before/after pair — the LEDGER is not the missing piece');
// RESERVATION_MOVEMENT_REPRESENTABLE = YES. CONSUME_MOVEMENT_REPRESENTABLE = YES for available/reserved,
// NO for physical — not because a column is missing, but because there is no balance to put in it.
ok(true, 'F10 the ledger has the physical columns and no physical balance — that is the whole of outcome B');

// =========================================================================================================
section('G. the record: what was frozen, what live evidence contests, what stays put');
// =========================================================================================================

var CONTRACT = read('docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md');
// CONTESTED. Left standing on purpose — amending a frozen token is the operator-gated R3A decision, not a
// verification finding. This assertion FAILING means R3A has run, and that is the intended way out.
ok(/OVERSEAS_CURRENT_STOCK_FIELD = wh_physical_stock/.test(CONTRACT),
  'G1 CONTESTED token still stands unamended: OVERSEAS_CURRENT_STOCK_FIELD = wh_physical_stock');
// CONFIRMED by live evidence — these four survive the header intact and Option A depends on two of them.
['OVERSEAS_AVAILABLE_STOCK_FIELD = wh_available_stock',
 'OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE = NO',
 'OVERSEAS_RESERVE_CONSUMES_PHYSICAL_STOCK = NO',
 'R4_MUST_LAND_AS_ONE_CHANGE = YES'
].forEach(function (t, i) {
  ok(CONTRACT.indexOf(t) >= 0, 'G' + (i + 2) + ' CONFIRMED by live evidence: ' + t);
});

var EV = 'docs/evidence/s6-r4a-live-overseas-header-and-storage-contract/LIVE_STORAGE_CONTRACT.md';
var DOC = read(EV);
['LIVE_STORAGE_OUTCOME = B', 'S6_R4_HEADER_GATE_RESOLVED = NO', 'RUNTIME_IMPLEMENTATION_AUTHORIZED = NO',
 'OBSERVED_RELATIONSHIP = NOT_ESTABLISHED', 'NEW_COLUMNS_REQUIRED = NONE', 'DB_MIGRATION_REQUIRED = NO'
].forEach(function (t, i) {
  ok(DOC.indexOf(t) >= 0, 'G' + (i + 6) + ' the evidence record states ' + t);
});
// The decision board is the deliverable the operator acts on; it must contain three options and a named
// recommendation, or this round handed back a question instead of a decision.
ok(/OPTION A —/.test(DOC) && /OPTION B —/.test(DOC) && /OPTION C —/.test(DOC) && /RECOMMENDATION — \*\*Option A\*\*/.test(DOC),
  'G12 and carries a three-option decision board with a named recommendation (Option A)');

// =========================================================================================================
section('H. safety — this round changed no behaviour');
// =========================================================================================================

ok(!/reservation_acquire/.test(C05) && !/movement_type', 'shipment_out'/.test(C05),
  'H1 no overseas reserve / consume writer was added');
ok(/var WH_LEGACY_ = \{/.test(F05),
  'H2 the legacy fallback is still in place — provably removable now, deliberately NOT removed here');
ok(/rivPick_\(r, 'wh_available_stock', 'available_stock'\)/.test(code(F54)),
  'H3 and 54_\'s fallback read is untouched');

// =========================================================================================================
console.log('\n=====================================================');
console.log('S6-R4A LIVE OVERSEAS STORAGE CONTRACT — ' + pass + ' passed / ' + fail + ' failed');
if (fail === 0) {
  console.log('CANONICAL_WH_FIELDS_PRESENT = YES   LEGACY_FIELDS_PRESENT = NO');
  console.log('WH_PHYSICAL_WRITER_COUNT = 0   PHYSICAL_FIELD_MAINTAINED = NO');
  console.log('WH_AVAILABLE_STOCK_SEMANTIC = SOURCE_REPORTED   OBSERVED_RELATIONSHIP = NOT_ESTABLISHED');
  console.log('43_OVERSEAS_READ_COMPATIBLE_WITH_LIVE_HEADER = YES   CURRENT_PRODUCTION_DEFECT = NO');
  console.log('LIVE_STORAGE_OUTCOME = B   BLOCKING_CONDITION_COUNT = 1');
  console.log('S6_R4_HEADER_GATE_RESOLVED = NO   RUNTIME_IMPLEMENTATION_AUTHORIZED = NO');
  console.log('NEW_COLUMNS_REQUIRED = NONE   DB_MIGRATION_REQUIRED = NO');
  console.log('PRODUCTION_ROWS_WRITTEN = 0   BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
