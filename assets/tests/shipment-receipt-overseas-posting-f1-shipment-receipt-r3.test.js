// F1-SHIPMENT-RECEIPT-R3-REVISED — Shipment receipt → managed-Overseas inventory posting.
// Evals the PURE block of 31_ (posting decision + ledger-reconciled exactly-once helpers) and drives the
// §15 fixtures, plus source-scan guards for the frozen rules and the on-the-way HALT.
// Run: node assets/tests/shipment-receipt-overseas-posting-f1-shipment-receipt-r3.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var GS = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var SRC31 = fs.readFileSync(path.join(GS, '31_shipment_receipt_route_handlers.gs'), 'utf8');
var SRC12 = fs.readFileSync(path.join(GS, '12_shipment_handlers.gs'), 'utf8');
var SRC01 = fs.readFileSync(path.join(GS, '01_router.gs'), 'utf8');
var SRC05 = fs.readFileSync(path.join(GS, '05_overseas_inventory_handlers.gs'), 'utf8');

var pure = SRC31.split('__SHIP_RECEIPT_PURE_START__')[1].split('__SHIP_RECEIPT_PURE_END__')[0];
pure = pure.slice(pure.indexOf('\n') + 1);
eval('var SHIP_RECEIPT_PARTIAL_="partially_received"; var SHIP_RECEIPT_FULL_="received";\n' + pure);

// ---- movement reference identity (§7) ----
eq(shipReceiptMovementRef_('SHL-1', 500), 'SHL-1:500', 'ref = shipment_line_id:cumulative');
eq(shipReceiptMovementRef_('SHL-1', 500.0), 'SHL-1:500', 'ref rounds cumulative');
eq(shipReceiptMovementRef_('SHL-2', '300'), 'SHL-2:300', 'ref accepts string cumulative');

// ---- posting decision (platform / factory / overseas) ----
eq(shipReceiptPostingDecision_('WH-X', null), 'POST', 'eligible overseas → POST');
eq(shipReceiptPostingDecision_('', null), 'SKIP_NO_DESTINATION', 'blank destination → SKIP (platform/none, not error)');
eq(shipReceiptPostingDecision_('WH-FBA', 'WAREHOUSE_NOT_FOUND'), 'SKIP_NOT_MANAGED', 'platform (not a warehouses row) → SKIP');
eq(shipReceiptPostingDecision_('WH-FAC', 'WAREHOUSE_NOT_OVERSEAS'), 'SKIP_FACTORY', 'factory destination → SKIP (never credit factory)');
eq(shipReceiptPostingDecision_('WH-OLD', 'WAREHOUSE_INACTIVE'), 'SKIP_INACTIVE', 'inactive → SKIP');

// ---- ledger-reconciled post amount (exactly-once across retries) ----
eq(shipReceiptLastPostedCumulative_([], 'SHL-1'), 0, 'no prior movement → lastPosted 0');
eq(shipReceiptLastPostedCumulative_(['SHL-1:300'], 'SHL-1'), 300, 'one prior → 300');
eq(shipReceiptLastPostedCumulative_(['SHL-1:300', 'SHL-1:500', 'SHL-2:800'], 'SHL-1'), 500, 'max cumulative for the line');
eq(shipReceiptLastPostedCumulative_(['SHL-1:300', 'SHL-2:800'], 'SHL-9'), 0, 'other lines ignored');

// Fixture C — partial 0→300 → post +300
eq(shipReceiptPostAmount_(300, shipReceiptLastPostedCumulative_([], 'SHL-1')), 300, 'C: 0→300 posts +300');
// Fixture D — 300→500 → post only +200
eq(shipReceiptPostAmount_(500, shipReceiptLastPostedCumulative_(['SHL-1:300'], 'SHL-1')), 200, 'D: 300→500 posts +200 (not +500)');
// Fixture E — 500→600 → post only +100
eq(shipReceiptPostAmount_(600, shipReceiptLastPostedCumulative_(['SHL-1:300', 'SHL-1:500'], 'SHL-1')), 100, 'E: 500→600 posts +100');
// Fixture F — retry 500→500 → post 0
eq(shipReceiptPostAmount_(500, shipReceiptLastPostedCumulative_(['SHL-1:300', 'SHL-1:500'], 'SHL-1')), 0, 'F: retry at 500 posts 0');
// Fixture G — crash after movement written before receipt persistence → retry sees ledger 500, posts 0 (no double)
eq(shipReceiptPostAmount_(500, shipReceiptLastPostedCumulative_(['SHL-1:500'], 'SHL-1')), 0, 'G: ledger-present retry posts 0 (no double credit)');
// never post cumulative total: 0→300→500 total posted = 300 + 200 = 500 (never 300+500)
ok((shipReceiptPostAmount_(300, 0) + shipReceiptPostAmount_(500, 300)) === 500, 'sum of ledger deltas = final cumulative (never cumulative-as-delta)');

// =========================================================
// Source-scan guards — frozen rules & HALTed sub-slice
// =========================================================
// posting is folded INTO the receipt handler (one lock; §6 — no second frontend API / no second writer).
ok(/shipReceiptPostToOverseas_\(ss, shipmentId/.test(SRC31), 'posting runs inside the receipt handler (one transaction)');
ok(/posting: posting/.test(SRC31), 'receipt response returns the posting summary');
// canonical owner reuse — overseas snapshot + movements; NO new table.
ok(/overseas_inventory_snapshot/.test(SRC31) && /overseas_inventory_movements/.test(SRC31), 'reuses overseas snapshot + movements');
ok(!/CREATE TABLE|receipt_ledger|new inventory table|route_state/i.test(SRC31), 'no new table created');
// exactly-once idempotency key (§7).
ok(/reference_type: 'shipment_receipt'/.test(SRC31) && /reference_id: ref/.test(SRC31), 'movement idempotency key: reference_type shipment_receipt + reference_id SL:cumulative');
ok(/source_module: 'shipment_receipt'/.test(SRC31), 'movement source_module = shipment_receipt');
// posts the AVAILABLE bucket only.
ok(/wh_after_available_stock: after/.test(SRC31) && /movement_scope: 'available_stock'/.test(SRC31), 'posts wh_available_stock (available bucket)');
// on-the-way is NOT incremented/decremented by receipt (OVERSEAS_ON_THE_WAY_DOUBLE_COUNT_RISK HALT).
ok(!/on_the_way[\s\S]{0,24}(\+=|-=)/.test(SRC31), 'receipt never does on-the-way arithmetic (halted sub-slice)');
ok(!/wh_on_the_way_qty[\s\S]{0,8}(\+=|-=)/.test(SRC31), 'no wh_on_the_way_qty increment/decrement');
// factory + amazon inventory never touched (§13 / §0.B / fixtures M,N).
ok(!/factory_stock|factory_stock_movements/.test(SRC31), 'M: factory stock never touched by receipt');
ok(!/amazon_inventory_snapshot/.test(SRC31), 'N: amazon_inventory_snapshot never mutated by receipt');
// platform / non-eligible destination returns before any inventory mutation (§0.B/§9).
ok(/if \(decision !== 'POST'\) return posting;/.test(SRC31), 'platform/factory/blank destination → early return, no posting');
// missing-row creation is canonical (§0.D): create with available = delta, defaults 0, no invented site_sku.
ok(/wh_available_stock: after/.test(SRC31) && /wh_reserved_stock: 0/.test(SRC31), 'H: missing row created with available=delta, defaults 0');
ok(!/site_sku:/.test(SRC31), 'row creation does not invent site_sku');
// destination identity via destination_warehouse_id (never warehouse_code); reuses canonical eligibility.
ok(/destination_warehouse_id/.test(SRC31) && !/['"]warehouse_code['"]/.test(SRC31), 'destination via destination_warehouse_id (never joins by warehouse_code)');
ok(/overseasImportWarehouseIssue_/.test(SRC31), 'reuses existing canonical Overseas eligibility (no new warehouse-type model)');
// compensation on ledger-append failure (revert balance) — retry-safe.
ok(/catch \(movErr\)/.test(SRC31) && /POSTING_ERROR/.test(SRC31), 'movement-append failure reverts balance → retry-safe');
// R1B contract intact (§12): shipment_received_qty still in the header contract.
ok(/SHIPMENT_LINES_HEADERS_[\s\S]*shipment_received_qty/.test(SRC12), 'R1B contract intact: shipment_received_qty in SHIPMENT_LINES_HEADERS_');
// the overseas movement header we mirror matches 05_ canonical (no drift on reused ledger).
ok(/wh_after_available_stock/.test(SRC05) && /reference_type/.test(SRC05), 'overseas movement ledger schema exists in 05_ (reused, not forked)');
// router unchanged for receipt (no new action needed — posting folded in).
ok(/shipment\.receipt\.update/.test(SRC01), 'receipt action unchanged (posting folded into existing command)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
