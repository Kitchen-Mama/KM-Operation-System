// F1-5B-SHIP-R3A — canonical PO → FIFO → shipment_line allocation foundation.
// Proves the deterministic FIFO allocator: eligibility = sku + company + factory (all independent; factory SHARED
// across companies), FIFO = order_date→po_no→purchase_order_line_id, capacity = completed−shipped−other-draft
// reservations, 1 shipment line → N PO lines, fail-closed PO_CAPACITY_INSUFFICIENT (no partial), row-order
// irrelevant, physical shipment_qty never rewritten, shipped_qty never mutated in R3A. Pure helpers eval'd; the
// persistence handler is source-guarded.
// Run: node assets/tests/shipment-fifo-allocation-f1-5b-ship-r3a.test.js
// NOTE: no 'use strict' — extracted pure helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var GS = read('specs/active/apps-script/32_shipment_line_allocation_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');

// ---- eval the pure block (constants + helpers) ----
eval('var SLA_ELIGIBLE_PO_STATUS_ = { issued: 1, confirmed: 1, in_production: 1, ready_to_ship: 1, completed: 1 };');
eval(slice(GS, '// __SLA_PURE_START__', '// __SLA_PURE_END__'));

// helpers to build PO lines + scope
var _n = 0;
function po(o) { _n++; return { purchase_order_line_id: o.pol || ('POL-' + _n), purchase_order_id: o.po || ('PO-' + _n),
  po_no: o.po_no || o.po || ('PO-' + _n), order_date: o.date == null ? '2026-01-01' : o.date, order_status: o.status || 'issued',
  sku: o.sku || 'GA0450', company: o.company || 'KM', factory_id: o.factory || 'FAC-A',
  completed_qty: o.completed == null ? 0 : o.completed, shipped_qty: o.shipped || 0 }; }
function scope(o) { return { shipment_line_id: o.line || 'SL-1', sku: o.sku || 'GA0450', company: o.company || 'KM',
  factory_id: o.factory || 'FAC-A', shipment_qty: o.qty }; }
function alloc(r) { return r.allocations.map(function (a) { return [a.purchase_order_line_id, a.allocated_qty]; }); }

console.log('\n== A single PO ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 600 }), [po({ pol: 'P1', completed: 1000 })], []);
  ok(r.ok && r.allocated_total === 600, 'A shipment 600 vs PO 1000 → allocated 600');
  eq(alloc(r), [['P1', 600]], 'A single allocation P1=600'); })();

console.log('\n== B two-PO FIFO ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 600 }), [
    po({ pol: 'P1', po_no: 'PO-1', date: '2026-01-01', completed: 300 }),
    po({ pol: 'P2', po_no: 'PO-2', date: '2026-01-02', completed: 500 })], []);
  eq(alloc(r), [['P1', 300], ['P2', 300]], 'B FIFO: P1=300 then P2=300'); })();

console.log('\n== C three-PO FIFO ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 1000 }), [
    po({ pol: 'P1', po_no: 'PO-1', date: '2026-01-01', completed: 300 }),
    po({ pol: 'P2', po_no: 'PO-2', date: '2026-01-02', completed: 500 }),
    po({ pol: 'P3', po_no: 'PO-3', date: '2026-01-03', completed: 700 })], []);
  eq(alloc(r), [['P1', 300], ['P2', 500], ['P3', 200]], 'C 300+500+200'); })();

console.log('\n== D insufficient capacity → fail closed ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 900 }), [
    po({ pol: 'P1', completed: 300 }), po({ pol: 'P2', date: '2026-01-02', completed: 500 })], []);
  ok(!r.ok && r.error === 'PO_CAPACITY_INSUFFICIENT', 'D fails closed PO_CAPACITY_INSUFFICIENT');
  ok(r.available_capacity === 800 && r.shortage_qty === 100, 'D diagnostics: available 800, shortage 100');
  ok(r.allocations === undefined, 'D no partial allocation set returned'); })();

console.log('\n== E FIFO tie → po_no then line-id ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 400 }), [
    po({ pol: 'B', po_no: 'PO-2', date: '2026-01-01', completed: 300 }),
    po({ pol: 'A', po_no: 'PO-1', date: '2026-01-01', completed: 300 })], []);
  eq(alloc(r), [['A', 300], ['B', 100]], 'E same date → po_no ASC (PO-1 before PO-2)'); })();
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 400 }), [
    po({ pol: 'Z', po_no: 'PO-1', date: '2026-01-01', completed: 300 }),
    po({ pol: 'A', po_no: 'PO-1', date: '2026-01-01', completed: 300 })], []);
  eq(alloc(r), [['A', 300], ['Z', 100]], 'E same date+po_no → purchase_order_line_id ASC'); })();

console.log('\n== F wrong company never eligible ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 100, company: 'KM' }), [
    po({ pol: 'P1', company: 'ResTW', factory: 'FAC-A', completed: 500 })], []);
  ok(!r.ok && r.error === 'PO_CAPACITY_INSUFFICIENT' && r.available_capacity === 0, 'F same sku+factory but company ResTW → not eligible for KM'); })();

console.log('\n== G shared factory: company scopes capacity, NOT factory ==');
(function () {
  var poLines = [ po({ pol: 'KM', company: 'KM', factory: 'FAC-A', completed: 500 }),
    po({ pol: 'TW', company: 'ResTW', factory: 'FAC-A', completed: 500 }),
    po({ pol: 'US', company: 'ResUS', factory: 'FAC-A', completed: 500 }) ];
  var rKM = slaAllocateShipmentLine_(scope({ qty: 400, company: 'KM', factory: 'FAC-A' }), poLines, []);
  eq(alloc(rKM), [['KM', 400]], 'G KM shipment on shared Factory A consumes ONLY the KM PO');
  var rTW = slaAllocateShipmentLine_(scope({ line: 'SL-2', qty: 400, company: 'ResTW', factory: 'FAC-A' }), poLines, []);
  eq(alloc(rTW), [['TW', 400]], 'G ResTW shipment on the SAME factory consumes ONLY the ResTW PO'); })();

console.log('\n== H same company, wrong factory never eligible ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 100, factory: 'FAC-A' }), [
    po({ pol: 'P1', company: 'KM', factory: 'FAC-B', completed: 500 })], []);
  ok(!r.ok && r.available_capacity === 0, 'H KM/FAC-A shipment cannot consume a KM/FAC-B PO'); })();

console.log('\n== I blank order_date never eligible ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 100 }), [po({ pol: 'P1', date: '', completed: 500 })], []);
  ok(!r.ok && r.available_capacity === 0, 'I blank order_date PO is never FIFO-eligible (no created_at fallback)'); })();

console.log('\n== J pre-issue PO never eligible ==');
(function () { ['draft', 'pending_approval'].forEach(function (st) {
    var r = slaAllocateShipmentLine_(scope({ qty: 100 }), [po({ pol: 'P1', status: st, completed: 500 })], []);
    ok(!r.ok && r.available_capacity === 0, 'J pre-issue PO status "' + st + '" excluded'); }); })();

console.log('\n== K two shipment drafts contend for same capacity ==');
(function () {
  var poLines = [po({ pol: 'P1', completed: 1000 })];
  var existing = [{ shipment_line_id: 'SL-A', purchase_order_line_id: 'P1', allocated_qty: 700, allocation_status: 'draft' }];
  var r = slaAllocateShipmentLine_(scope({ line: 'SL-B', qty: 500 }), poLines, existing);
  ok(!r.ok && r.error === 'PO_CAPACITY_INSUFFICIENT', 'K B sees only 300 → fails closed');
  ok(r.available_capacity === 300 && r.shortage_qty === 200, 'K available 300, shortage 200 (no 700+500 over-reserve)'); })();

console.log('\n== L current-line edit releases self, no double-count ==');
(function () {
  var poLines = [po({ pol: 'P1', completed: 1000 })];
  var existing = [{ shipment_line_id: 'SL-A', purchase_order_line_id: 'P1', allocated_qty: 700, allocation_status: 'draft' }];
  var r = slaAllocateShipmentLine_(scope({ line: 'SL-A', qty: 400 }), poLines, existing);
  eq(alloc(r), [['P1', 400]], 'L editing SL-A 700→400 recomputes to 400 (self released; not 700−400 delta)');
  ok(r.allocated_total === 400, 'L final total = 400, freeing 600 for others'); })();

console.log('\n== M source-row shuffle → identical result ==');
(function () {
  var a = [po({ pol: 'P1', po_no: 'PO-1', date: '2026-01-01', completed: 300 }),
    po({ pol: 'P2', po_no: 'PO-2', date: '2026-01-02', completed: 500 }),
    po({ pol: 'P3', po_no: 'PO-3', date: '2026-01-03', completed: 700 })];
  var b = [a[2], a[0], a[1]];   // shuffled
  eq(alloc(slaAllocateShipmentLine_(scope({ qty: 1000 }), b, [])), [['P1', 300], ['P2', 500], ['P3', 200]], 'M shuffled PO rows → identical FIFO allocation'); })();

console.log('\n== N conservation Σ allocation = shipment_qty ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 750 }), [
    po({ pol: 'P1', date: '2026-01-01', completed: 300 }), po({ pol: 'P2', date: '2026-01-02', completed: 600 })], []);
  ok(r.ok && r.allocated_total === 750, 'N Σ allocated_qty === shipment_qty (750)'); })();

console.log('\n== P capacity = completed − shipped (not ordered) ==');
(function () { var r = slaAllocateShipmentLine_(scope({ qty: 900 }), [po({ pol: 'P1', completed: 600, shipped: 100 })], []);
  ok(!r.ok && r.available_capacity === 500, 'P completed 600 − shipped 100 = 500 available (never 900 on ordered)'); })();

console.log('\n== Q executed shipped + other draft reservation ==');
(function () {
  var poLines = [po({ pol: 'P1', completed: 1000, shipped: 300 })];
  var existing = [{ shipment_line_id: 'SL-X', purchase_order_line_id: 'P1', allocated_qty: 400, allocation_status: 'draft' }];
  var r = slaAllocateShipmentLine_(scope({ line: 'SL-Y', qty: 400 }), poLines, existing);
  ok(!r.ok && r.available_capacity === 300, 'Q available = 1000 − 300 shipped − 400 other-draft = 300'); })();

console.log('\n== R company/factory independence (multi-line plan on shared factory) ==');
(function () {
  var poLines = [ po({ pol: 'KM', company: 'KM', factory: 'FAC-A', completed: 500 }),
    po({ pol: 'TW', company: 'ResTW', factory: 'FAC-A', completed: 500 }) ];
  // two shipment lines, different companies, SAME factory, SAME sku — must not cross-consume.
  var plan = slaBuildPlan_([ scope({ line: 'L1', qty: 500, company: 'KM', factory: 'FAC-A' }),
    scope({ line: 'L2', qty: 500, company: 'ResTW', factory: 'FAC-A' }) ], poLines, []);
  ok(plan.ok, 'R both KM + ResTW lines allocate on shared Factory A');
  eq(alloc(plan.results[0]), [['KM', 500]], 'R KM line → KM PO only');
  eq(alloc(plan.results[1]), [['TW', 500]], 'R ResTW line → ResTW PO only (factory_id never inferred company)'); })();

console.log('\n== O physical truth: allocator returns lineage only, never shipment_qty ==');
(function () { var A = extractFn(GS, 'slaAllocateShipmentLine_');
  ok(/allocated_qty: take/.test(A) && !/shipment_lines/.test(A) && !/setValue/.test(A), 'O pure allocator emits allocation lineage (allocated_qty) and never writes shipment_lines / shipment_qty');
  var H = extractFn(GS, 'handleGenerateShipmentLineAllocations_');
  ok(!/lineSheet\.getRange[\s\S]{0,60}setValue|shipment_lines'\)[\s\S]{0,400}setValue/.test(H), 'O handler reads shipment_lines for physical qty but never rewrites it'); })();

console.log('\n== multi-SKU independence (§24 I) ==');
(function () {
  var poLines = [ po({ pol: 'A1', sku: 'AA', completed: 500 }), po({ pol: 'B1', sku: 'BB', completed: 500 }) ];
  var plan = slaBuildPlan_([ scope({ line: 'L1', sku: 'AA', qty: 300 }), scope({ line: 'L2', sku: 'BB', qty: 300 }) ], poLines, []);
  eq(alloc(plan.results[0]), [['A1', 300]], 'multi-SKU: line AA → PO AA');
  eq(alloc(plan.results[1]), [['B1', 300]], 'multi-SKU: line BB → PO BB (independent capacity)'); })();

console.log('\n== source guards — handler / schema / safety ==');
var handler = extractFn(GS, 'handleGenerateShipmentLineAllocations_');
ok(/LockService\.getScriptLock/.test(handler) && /tryLock\(30000\)/.test(handler), 'handler runs under the canonical ScriptLock');
ok(/SHIPMENT_LINE_ALLOCATIONS_SCHEMA_MISSING/.test(handler) && /getSheetByName\('shipment_line_allocations'\)/.test(handler), '§25 fail-closed when the allocations table is absent (never auto-create)');
ok(/SHIPMENT_FACTORY_ATTRIBUTION_GAP/.test(handler) && /SHIPMENT_COMPANY_AUTHORITY_GAP/.test(handler), '§29 fail-closed on factory/company attribution gaps');
ok(/shipped_qty_changed: false/.test(handler) && !/shipped_qty['"]?\s*[:=]/.test(handler.replace(/shipped_qty_changed/g, '')), '§20 handler does NOT mutate purchase_order_lines.shipped_qty');
ok(/allocation_status: 'draft'/.test(handler) && !/'executed'/.test(handler), '§13 R3A persists DRAFT allocations only (no executed)');
ok(/slaResolveShipmentFactory_/.test(handler) && /procurementResolveFactoryId_/.test(GS), '§6/§7 reuses the existing canonical warehouse→factory resolver (no second resolver)');
ok(/company = slaStr_\(ship\.company\)/.test(handler), '§5 shipment business company = persisted shipments.company (never inferred)');
ok(!/factory[\s\S]{0,40}company|company[\s\S]{0,40}=[\s\S]{0,20}factory_id/.test(extractFn(GS, 'slaIsEligible_')), '§0B eligibility never infers company from factory or vice-versa');
ok(/generateShipmentLineAllocations/.test(ROUTER) && /handleGenerateShipmentLineAllocations_/.test(ROUTER), 'router wires the canonical action (single owner)');
ok(/var SHIPMENT_LINE_ALLOCATIONS_HEADERS_ = \[/.test(GS) && /'allocation_status'/.test(GS) && /'fifo_rank'/.test(GS) && /'purchase_order_line_id'/.test(GS), '§9 canonical schema declared (status + fifo_rank + PO-line FK)');

console.log('\n----------------------------------------');
console.log('SHIPMENT FIFO ALLOCATION (F1-5B-SHIP-R3A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
