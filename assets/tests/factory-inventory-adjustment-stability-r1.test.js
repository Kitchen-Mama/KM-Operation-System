// Kitchen Mama Operation System — FACTORY-INVENTORY-ADJUSTMENT-STABILITY-R1
//
// THREE OPERATOR INCIDENTS, AND WHAT THIS SUITE PROVES ABOUT EACH.
//
//   A · "Missing or invalid action parameter…" / "Error: API returned 404" — while authoritative DB
//       inspection showed the adjustment HAD been applied. Both strings are this accessor's own, and the
//       first is 01_router.gs's doGet terminal. doPost had already run and committed; only the delivery of
//       its answer failed. Section E drives that shape and requires SUCCESS, not an error.
//   B · "Done" did not close the modal. It could not: "Done" WAS the Confirm button with its textContent
//       rewritten, still carrying onclick="confirmFactoryInventoryAdjustment()", left disabled by the
//       submit path. Section H proves Done is now a separate element that closes and writes nothing — and
//       section J proves the old re-arming path (typing in Reason after success) is dead.
//   C · One global SKU+Warehouse dropdown. Sections B/C/D replace it with Factory → SKU scoped by
//       warehouse_id, with the factory's friendly name carried as DISPLAY TEXT ONLY.
//
// WHAT IS EXECUTED VS ASSERTED FROM SOURCE. The page's real functions are extracted and RUN against a fake
// DOM and stubbed transport: selection, validity, submit, settlement, readback, Done and reopen are all
// measured, never matched as text. Source-text assertions are reserved for facts that are ABOUT the source
// — that the raw fetch is gone, that the backend arithmetic is untouched.
//
// THE CENTRAL SAFETY CLAIM, stated so it can fail: an HTTP/transport failure is never evidence that
// nothing was written. Every outcome below is settled by READING THE ROW, because the adjustment is an
// absolute set (the client sends new_available, never a delta) and the target state is therefore its own
// receipt. M1 plants the opposite rule and must be caught.
//
// NO PRODUCTION WRITE. No network, no sheet, no clock dependence.
// Run: node assets/tests/factory-inventory-adjustment-stability-r1.test.js
// NOTE: no 'use strict' — extracted fns eval into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l, x) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  ctx ' + JSON.stringify(x))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
async function mut(label, f) {
  var r;
  try { r = await f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
// Comments are not code.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}

var F_JS = read('js/pages/factory-stock.js');
var DB_JS = read('js/api/operation-system-db-api.js');
var HTML = read('html/pages/factory-stock.html');
var GS21 = read('specs/active/apps-script/21_factory_inventory_handlers.gs');

// ====================================================================================================
// FAKE DOM
// ====================================================================================================
var _els = {};
function fakeEl(id) {
  var cls = {};
  return {
    id: id, value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, style: {},
    classList: {
      add: function (c) { cls[c] = true; }, remove: function (c) { delete cls[c]; },
      contains: function (c) { return !!cls[c]; }
    },
    focus: function () {}
  };
}
function el(id) { if (!_els[id]) _els[id] = fakeEl(id); return _els[id]; }
function resetDom() { _els = {}; }
function optionsOf(id) {
  var html = el(id).innerHTML || '', out = [], re = /<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g, m;
  while ((m = re.exec(html))) out.push({ value: m[1], text: m[2] });
  return out;
}
function isOpen() { return el('factory-adjust-modal').classList.contains('is-open'); }
function resultHtml() { return el('factory-adjust-result').innerHTML || ''; }

global.document = {
  getElementById: function (id) { return el(id); },
  querySelector: function () { return null; },
  addEventListener: function () { domListeners++; }
};
var domListeners = 0;

// ====================================================================================================
// STUBS — counted, so "zero requests" is a measurement
// ====================================================================================================
var writeCalls = [], scopedReads = 0, targetedReads = 0, afterWriteCalls = 0, renderCalls = 0;
var _writeImpl = null;          // per-test transport behaviour
var _rowsNow = null;            // what a readback would see (null = use _rows)
var _rows = [];

function resetCounters() {
  writeCalls = []; scopedReads = 0; targetedReads = 0; afterWriteCalls = 0; renderCalls = 0;
  domListeners = 0; _rowsNow = null;
}

global.window = {
  KM: {
    DB: {
      adjustFactoryInventory: function (payload) {
        writeCalls.push(payload);
        return _writeImpl ? _writeImpl(payload, writeCalls.length) : Promise.resolve({ success: true, data: {} });
      },
      loadScopedTables: function (tables) {
        scopedReads++;
        return Promise.resolve({ factoryStock: (_rowsNow || _rows).slice() });
      },
      refreshFactoryStockTables: function () { targetedReads++; return Promise.resolve({ success: true }); }
    }
  }
};

// ---- page collaborators the adjustment flow calls -------------------------------------------------
var _fsReadModel = null;
var _factoryMovementSearched = false;
function _getDbFactoryStockData() { return (_rowsNow || _rows).slice(); }
function _fmvEscapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _fmvSignedQty(n) { var v = Number(n) || 0; return (v > 0 ? '+' : '') + v.toLocaleString(); }
function _fsScopedActive() { return true; }
function _fsAfterWrite(cb) { afterWriteCalls++; if (cb) cb(); }
function renderFactoryStockTable() { renderCalls++; }
function renderFactoryMovementTable() { renderCalls++; }

// ---- module-scope state the extracted functions own -----------------------------------------------
var _factoryAdjustRecords = [];
var _factoryAdjustByFactory = {};
var _factoryAdjustFactoryId = '';
var _factoryAdjustSelected = null;
var _factoryAdjustSubmitting = false;
var _factoryAdjustCommitted = false;
var _factoryAdjustKeyBound = false;

// ---- THE REAL FUNCTIONS ---------------------------------------------------------------------------
// One eval per statement, at MODULE level. Inside a forEach callback each function would be defined in
// that callback's scope and be gone before the first test ran.
eval(extractFn(F_JS, '_factoryAdjustClearSkuSelect'));
eval(extractFn(F_JS, 'openFactoryInventoryAdjustModal'));
eval(extractFn(F_JS, 'closeFactoryInventoryAdjustModal'));
eval(extractFn(F_JS, 'onFactoryAdjustFactoryChange'));
eval(extractFn(F_JS, 'onFactoryAdjustRecordChange'));
eval(extractFn(F_JS, '_factoryAdjustNewValue'));
eval(extractFn(F_JS, 'onFactoryAdjustQtyInput'));
eval(extractFn(F_JS, '_factoryAdjustUpdateValidity'));
eval(extractFn(F_JS, '_factoryAdjustTransportCode'));
eval(extractFn(F_JS, '_factoryAdjustReadbackAvailable'));
eval(extractFn(F_JS, '_factoryAdjustSettle'));
eval(extractFn(F_JS, 'confirmFactoryInventoryAdjustment'));

// ---- fixtures: the same SKU in two factories, which is the case the old dropdown blurred -----------
function mkRows() {
  return [
    { warehouseId: 'WH-CN-YX', factory: 'CN侻鑫', company: 'ResTW', country: 'CN', sku: 'CO1100-R', availableStock: 13000, reservedStock: 200 },
    { warehouseId: 'WH-CN-YX', factory: 'CN侻鑫', company: 'ResTW', country: 'CN', sku: 'CO1100-T', availableStock: 400, reservedStock: 0 },
    { warehouseId: 'WH-TW-KM', factory: 'TW Kitchen Mama', company: 'ResTW', country: 'TW', sku: 'CO1100-R', availableStock: 55, reservedStock: 5 },
    { warehouseId: 'WH-TW-KM', factory: 'TW Kitchen Mama', company: 'ResTW', country: 'TW', sku: 'CO2600-S', availableStock: 9, reservedStock: 0 }
  ];
}
function idxOf(rows, wid, sku) {
  for (var i = 0; i < rows.length; i++) if (rows[i].warehouseId === wid && rows[i].sku === sku) return i;
  return -1;
}
// Open the modal and select Factory + SKU through the REAL handlers.
function openAndSelect(wid, sku) {
  resetDom(); resetCounters();
  _rows = mkRows();
  openFactoryInventoryAdjustModal();
  if (wid) { el('factory-adjust-factory').value = wid; onFactoryAdjustFactoryChange(); }
  if (sku) { el('factory-adjust-record').value = String(idxOf(_rows, wid, sku)); onFactoryAdjustRecordChange(); }
}
function fillForm(newAvail, note) {
  el('factory-adjust-new').value = String(newAvail);
  el('factory-adjust-note').value = note === undefined ? 'cycle count' : note;
  onFactoryAdjustQtyInput();
}

async function main() {

// ====================================================================================================
section('A. §11 — the Factory selector, built from the model already in hand');
// ====================================================================================================
openAndSelect(null, null);
var fopts = optionsOf('factory-adjust-factory');
eq(fopts.map(function (o) { return o.value; }), ['', 'WH-CN-YX', 'WH-TW-KM'],
  'A1 the Factory selector offers each eligible factory warehouse ONCE, by warehouse_id (executed)');
eq([scopedReads, targetedReads], [0, 0],
  'A2 FACTORY_SELECTOR_NEW_REQUEST_COUNT = 0 — built from the loaded factory_stock model, nothing fetched');
ok(fopts[1].text.indexOf('CN侻鑫') === 0,
  'A3 the friendly factory name is the DISPLAY text…', fopts[1]);
ok(fopts[1].value !== fopts[1].text && fopts[1].value === 'WH-CN-YX',
  'A4 …and is NEVER the identity — the option value is the canonical warehouse_id (§10)');

// ====================================================================================================
section('B. §12 — SKU is disabled before a Factory is chosen, and says so truthfully');
// ====================================================================================================
ok(el('factory-adjust-record').disabled === true, 'B1 the SKU selector is DISABLED before Factory selection');
eq(optionsOf('factory-adjust-record').map(function (o) { return o.text; }), ['Select a Factory first'],
  'B2 and its empty state INSTRUCTS rather than claiming "No data found" (executed)');
ok(!/No data found/i.test(el('factory-adjust-record').innerHTML),
  'B3 the false claim about the database is nowhere in the control');

// ====================================================================================================
section('C/D/E. §12 — the SKU list is scoped to ONE warehouse_id');
// ====================================================================================================
openAndSelect('WH-CN-YX', null);
eq(optionsOf('factory-adjust-record').map(function (o) { return o.text; }), ['Select SKU…', 'CO1100-R', 'CO1100-T'],
  'C1 Factory A shows only A’s SKUs (executed)');
ok(el('factory-adjust-record').disabled === false, 'C2 and the selector is now enabled');
eq([scopedReads, targetedReads], [0, 0], 'C3 FACTORY_SELECTION_REQUEST_COUNT = 0');

openAndSelect('WH-TW-KM', null);
eq(optionsOf('factory-adjust-record').map(function (o) { return o.text; }), ['Select SKU…', 'CO1100-R', 'CO2600-S'],
  'D1 Factory B shows only B’s SKUs (executed)');

// CROSS_FACTORY_SKU_VISIBLE_COUNT, computed rather than asserted.
var crossVisible = optionsOf('factory-adjust-record').filter(function (o) {
  if (o.value === '') return false;
  return _rows[Number(o.value)].warehouseId !== 'WH-TW-KM';
}).length;
eq(crossVisible, 0, 'D2 CROSS_FACTORY_SKU_VISIBLE_COUNT = 0 (computed from the option values)');

// E — the same SKU under two factories is TWO records, and each resolves to its own row.
openAndSelect('WH-CN-YX', 'CO1100-R');
var recA = _factoryAdjustSelected;
openAndSelect('WH-TW-KM', 'CO1100-R');
var recB = _factoryAdjustSelected;
eq([recA.warehouseId, recA.availableStock, recB.warehouseId, recB.availableStock],
  ['WH-CN-YX', 13000, 'WH-TW-KM', 55],
  'E1 the SAME SKU code in two factories resolves to two DIFFERENT canonical records (executed)');
eq([scopedReads, targetedReads], [0, 0], 'E2 SKU_SELECTION_REQUEST_COUNT = 0 — selecting a SKU fetches nothing');

// ====================================================================================================
section('F. §13 — changing Factory clears the SKU');
// ====================================================================================================
openAndSelect('WH-CN-YX', 'CO1100-R');
ok(_factoryAdjustSelected && _factoryAdjustSelected.availableStock === 13000, 'F0 a record is selected under A');
el('factory-adjust-factory').value = 'WH-TW-KM';
onFactoryAdjustFactoryChange();
eq([_factoryAdjustSelected, el('factory-adjust-record').value], [null, ''],
  'F1 FACTORY_CHANGE_CLEARS_SKU = YES — the selection is dropped, not carried across (executed)');
eq(el('factory-adjust-current').textContent, '—', 'F2 and the Current Available readout is cleared with it');
ok(el('factory-adjust-new').disabled === true, 'F3 and New Available is re-disabled — nothing is adjustable without a record');

// THE REASON IT MATTERS: CO1100-R exists in BOTH, so a retained selection would look right and be wrong.
eq(optionsOf('factory-adjust-record').map(function (o) { return o.text; }), ['Select SKU…', 'CO1100-R', 'CO2600-S'],
  'F4 CO1100-R is offered again under B — as B’s record, requiring a fresh explicit choice');

// ====================================================================================================
section('G. §14/§15 — the form reads the canonical record, and the arithmetic is untouched');
// ====================================================================================================
openAndSelect('WH-CN-YX', 'CO1100-R');
eq([el('factory-adjust-sku').textContent, el('factory-adjust-warehouse').textContent,
  el('factory-adjust-company').textContent, el('factory-adjust-country').textContent],
  ['CO1100-R', 'CN侻鑫', 'ResTW', 'CN'],
  'G1 SKU / Warehouse / Company / Country come from the selected record (executed)');
eq(el('factory-adjust-current').textContent, (13000).toLocaleString(), 'G2 and Current Available with it');
fillForm(0);
eq(el('factory-adjust-delta').textContent, _fmvSignedQty(-13000),
  'G3 Adjustment Qty is still New Available − Current Available (executed)');
ok(el('factory-adjust-confirm-btn').disabled === false, 'G4 Confirm is armed once record + qty + note are valid');

// ====================================================================================================
section('H. §3/§8 — a clean commit, then Done');
// ====================================================================================================
_writeImpl = function () { return Promise.resolve({ success: true, data: { movement_id: 'FSMV-abc12345', reference_id: 'ADJ-20260930-AB12', before_available: 13000, after_available: 0, quantity: -13000 } }); };
openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
await confirmFactoryInventoryAdjustment();
eq(writeCalls.length, 1, 'H1 one user submit → ONE write request (executed)');
eq(writeCalls[0].new_available, 0, 'H1a carrying the ABSOLUTE target, not a delta — which is what makes it verifiable');
ok(/Adjustment applied\./.test(resultHtml()), 'H2 the committed outcome renders success');
ok(/FSMV-abc12345/.test(resultHtml()), 'H2a with the server’s movement id');
ok(!/Error:/.test(resultHtml()), 'H3 SUCCESS_AND_ERROR_VISIBLE_SIMULTANEOUSLY = NO');
eq([el('factory-adjust-confirm-btn').hidden, el('factory-adjust-done-btn').hidden], [true, false],
  'H4 Confirm LEAVES and Done ARRIVES — they are different elements (executed)');
eq([scopedReads, targetedReads], [0, 0], 'H5 RECEIPT_VERIFICATION_REQUEST_COUNT = 0 on a clean commit — no readback is needed');
eq(afterWriteCalls, 1, 'H6 POST_WRITE_REFRESH goes through the existing _fsAfterWrite owner, once');

var writesBeforeDone = writeCalls.length;
closeFactoryInventoryAdjustModal();
eq([isOpen(), writeCalls.length - writesBeforeDone], [false, 0],
  'H7 DONE_CLICK_CLOSE_COUNT = 1, DONE_CLICK_WRITE_REQUEST_COUNT = 0 (executed)');
closeFactoryInventoryAdjustModal();
eq([isOpen(), writeCalls.length - writesBeforeDone], [false, 0],
  'H8 a SECOND Done click closes nothing further and still writes nothing');

// ====================================================================================================
section('I. §2/§4 — INCIDENT A: committed, then the answer was lost');
// ====================================================================================================
// The two shapes the operator actually saw, both driven below. In BOTH, doPost had already run:
//   REDIRECT_TARGET_NOT_FOUND  the expired echo target — reported as "Error: API returned 404"
//   REQUEST_METHOD_DOWNGRADED  the redirect re-entering doGet — reported as the router's own prose

async function committedButLost(codeName) {
  _writeImpl = function () {
    return Promise.resolve({ success: false, error: 'lost', transport: { code: codeName, details: { zero_write: true } } });
  };
  openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
  // The row HAS been written; the readback is what discovers that.
  var after = mkRows(); after[idxOf(after, 'WH-CN-YX', 'CO1100-R')].availableStock = 0;
  _rowsNow = after;
  await confirmFactoryInventoryAdjustment();
}
await committedButLost('REDIRECT_TARGET_NOT_FOUND');
ok(/Adjustment applied\./.test(resultHtml()),
  'I1 a 404 AFTER a committed write shows SUCCESS — the row is read back and believed over the transport');
ok(!/Error:/.test(resultHtml()), 'I1a and no error is shown beside it');
eq(scopedReads, 1, 'I1b RECEIPT_READ_COUNT = 1 — one bounded read, through the existing scoped owner');
eq(writeCalls.length, 1, 'I1c AUTOMATIC_DUPLICATE_WRITE_COUNT = 0 — verification is a READ, never a resend');
ok(/confirmed by\s+reading the record back|reading the record back/.test(resultHtml()),
  'I1d and the receipt says HOW it was confirmed, since the movement id was lost with the answer');
ok(!/FSMV-/.test(resultHtml()), 'I1e no movement id is INVENTED to fill the gap');
eq([el('factory-adjust-confirm-btn').hidden, el('factory-adjust-done-btn').hidden], [true, false],
  'I1f and the dialog settles into the same Done state as a clean commit');

await committedButLost('REQUEST_METHOD_DOWNGRADED');
ok(/Adjustment applied\./.test(resultHtml()),
  'I2 the doGet-downgrade shape settles the same way — even though the router said zero_write, which was '
  + 'true of the GET leg and false of the operation');

// ====================================================================================================
section('J. §18 — NOT committed: no false success, and no false accusation either');
// ====================================================================================================
_writeImpl = function () { return Promise.resolve({ success: false, error: 'lost', transport: { code: 'REDIRECT_TARGET_NOT_FOUND', details: {} } }); };
openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
_rowsNow = mkRows();                      // still 13000 — the write did NOT land
await confirmFactoryInventoryAdjustment();
ok(!/Adjustment applied\./.test(resultHtml()), 'J1 no false success when the row still holds the old balance');
ok(/NOT applied/.test(resultHtml()) && /Nothing was written/.test(resultHtml()),
  'J2 CONFIRMED_NOT_STARTED is stated plainly, because the readback PROVED it');
eq([el('factory-adjust-confirm-btn').hidden, isOpen()], [false, true],
  'J3 the modal stays OPEN with Confirm available — this is a state the operator can act on');
eq(writeCalls.length, 1, 'J4 and nothing was resent on their behalf');

// A SERVER refusal is authoritative and needs no readback: 21_ validates before touching a cell.
_writeImpl = function () { return Promise.resolve({ success: false, error: 'Note is required', transport: { code: 'BACKEND_BUSINESS_REJECTION' } }); };
openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
await confirmFactoryInventoryAdjustment();
eq([scopedReads, targetedReads], [0, 0],
  'J5 a BUSINESS rejection is settled WITHOUT a readback — the server answered, and that is authoritative');
ok(/Note is required/.test(resultHtml()) && !/Adjustment applied/.test(resultHtml()),
  'J6 and the server’s own reason is what the operator is shown');
ok(isOpen(), 'J7 the modal stays open so it can be corrected');

// ====================================================================================================
section('K. §3 — OUTCOME_UNKNOWN says neither yes nor no, and never replays');
// ====================================================================================================
_writeImpl = function () { return Promise.resolve({ success: false, error: 'lost', transport: { code: 'REDIRECT_TARGET_NOT_FOUND', details: {} } }); };
openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
var third = mkRows(); third[idxOf(third, 'WH-CN-YX', 'CO1100-R')].availableStock = 7777;   // neither before nor target
_rowsNow = third;
await confirmFactoryInventoryAdjustment();
ok(!/Adjustment applied\./.test(resultHtml()), 'K1 UNKNOWN does not show success');
ok(!/Nothing was written/.test(resultHtml()),
  'K2 FALSE_NOT_WRITTEN_CLAIM_COUNT = 0 — and it does NOT claim nothing was written');
ok(/could not be confirmed/.test(resultHtml()) && /Do NOT submit it again yet/.test(resultHtml()),
  'K3 it states the uncertainty and gives the safe next action');
eq(writeCalls.length, 1, 'K4 AUTOREPLAY_ON_UNKNOWN = NO (executed)');

// A readback that itself fails is not a verdict.
_rowsNow = null;
window.KM.DB.loadScopedTables = function () { scopedReads++; return Promise.reject(new Error('read failed')); };
openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
await confirmFactoryInventoryAdjustment();
ok(!/Adjustment applied/.test(resultHtml()) && !/Nothing was written/.test(resultHtml()),
  'K5 a FAILED verification stays UNKNOWN — it never collapses into either verdict');
window.KM.DB.loadScopedTables = function () { scopedReads++; return Promise.resolve({ factoryStock: (_rowsNow || _rows).slice() }); };

// ====================================================================================================
section('L/M. §20 — double Confirm, and Confirm after commit');
// ====================================================================================================
var resolveWrite = null;
_writeImpl = function () { return new Promise(function (r) { resolveWrite = r; }); };
openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
var p1 = confirmFactoryInventoryAdjustment();
confirmFactoryInventoryAdjustment();          // the second click of a double-click
confirmFactoryInventoryAdjustment();
eq(writeCalls.length, 1, 'M1 DUPLICATE_SUBMIT_COUNT = 0 — a double Confirm sends ONE write (executed)');
ok(el('factory-adjust-confirm-btn').disabled === true, 'M1a and Confirm is disabled while the write is unresolved');
resolveWrite({ success: true, data: { movement_id: 'FSMV-1', before_available: 13000, after_available: 0, quantity: -13000 } });
await p1;
eq(writeCalls.length, 1, 'M2 DUPLICATE_MOVEMENT_FROM_ONE_USER_SUBMIT_COUNT = 0');

// THE OLD INCIDENT-B HAZARD, now dead: typing in Reason after success used to re-arm the button.
el('factory-adjust-note').value = 'typing after success';
onFactoryAdjustQtyInput();
ok(el('factory-adjust-confirm-btn').disabled === true,
  'M3 editing Reason AFTER a commit can no longer re-arm Confirm — the committed latch outranks validity');
await confirmFactoryInventoryAdjustment();
eq(writeCalls.length, 1, 'M3a and calling the submit handler directly after a commit writes NOTHING (executed)');

// ====================================================================================================
section('N/P. §16 — Done closes; reopening is clean');
// ====================================================================================================
ok(isOpen(), 'N0 the modal is still open on the success screen');
closeFactoryInventoryAdjustModal();
eq(isOpen(), false, 'N1 DONE_CLICK_CLOSE_COUNT = 1 (executed)');

// Reopen, with the committed value now in the model — the operator must see the NEW balance.
_rows = mkRows(); _rows[idxOf(_rows, 'WH-CN-YX', 'CO1100-R')].availableStock = 0;
var writesBeforeReopen = writeCalls.length;
openFactoryInventoryAdjustModal();
eq([el('factory-adjust-factory').value, el('factory-adjust-record').disabled], ['', true],
  'P1 reopening restores the initial state — no Factory, SKU disabled (executed)');
eq([resultHtml(), el('factory-adjust-note').value, el('factory-adjust-reference').value, el('factory-adjust-new').value],
  ['', '', '', ''], 'P2 no previous success text, movement id, reason, reference or New Available');
eq([el('factory-adjust-confirm-btn').hidden, el('factory-adjust-done-btn').hidden], [false, true],
  'P3 Confirm is back and Done is gone');
eq(_factoryAdjustCommitted, false, 'P4 and the committed latch is cleared, so the dialog is usable again');
el('factory-adjust-factory').value = 'WH-CN-YX'; onFactoryAdjustFactoryChange();
el('factory-adjust-record').value = String(idxOf(_rows, 'WH-CN-YX', 'CO1100-R')); onFactoryAdjustRecordChange();
eq(el('factory-adjust-current').textContent, (0).toLocaleString(),
  'P5 STALE_PREWRITE_QUANTITY_AFTER_SUCCESS = NO — Current Available is the COMMITTED balance, not 13,000');
eq(writeCalls.length - writesBeforeReopen, 0, 'P6 and reopening wrote nothing');

// ====================================================================================================
section('Q/R/S/T. §15/§19 — validation, listeners, and what was NOT touched');
// ====================================================================================================
openAndSelect('WH-CN-YX', 'CO1100-R');
fillForm(0, '');                                    // note missing
ok(el('factory-adjust-confirm-btn').disabled === true, 'Q1 a missing Reason keeps Confirm disabled');
await confirmFactoryInventoryAdjustment();
ok(isOpen(), 'Q2 and a validation failure keeps the modal OPEN');
fillForm(13000);                                    // equals current
ok(el('factory-adjust-confirm-btn').disabled === true, 'Q3 New Available equal to Current is refused client-side too');

// R — reopening does not accumulate document listeners.
var before = domListeners;
openFactoryInventoryAdjustModal(); openFactoryInventoryAdjustModal(); openFactoryInventoryAdjustModal();
eq(domListeners - before, 0, 'R1 LISTENER_DRIFT = 0 — reopening binds no further document listeners (executed)');
ok(/_factoryAdjustKeyBound/.test(code(F_JS)), 'R1a the Escape binding is latched, which is why');
// Every control is wired declaratively in the markup, so there is no per-render rebinding to drift.
var inline = (HTML.match(/onchange="onFactoryAdjust|onclick="(confirmFactoryInventoryAdjustment|closeFactoryInventoryAdjustModal)/g) || []).length;
ok(inline >= 5, 'R2 DUPLICATE_HANDLER_COUNT = 0 — handlers are inline attributes, bound once by the markup', inline);

// S/T — the round changed the dialog, not the domain.
ok(!/fac_reserved_stock/.test(code(extractFn(F_JS, 'confirmFactoryInventoryAdjustment'))),
  'S1 the submit path still never sends a reserved-stock value');
// The dialog's own hint SAYS "Reserved is never changed", so searching the body for the word proves the
// opposite of what it looks like. The claim is that no reserved CONTROL exists.
var modalBody = HTML.split('fia-modal-actions')[0].split('id="factory-adjust-title"')[1] || '';
var reservedControls = (modalBody.match(/<(input|select|textarea)[^>]*reserved[^>]*>/gi) || []);
eq(reservedControls, [],
  'T1 RESERVED_MANUAL_EDIT_ADDED = NO — the dialog contains no reserved input/select/textarea (computed)');
ok(/Reserved is never changed/.test(HTML), 'T1a while the standing promise to the operator is still printed');

// Drive a REAL write here; the Q section above resets the counters and its submits never reach the wire.
_writeImpl = function () { return Promise.resolve({ success: true, data: { movement_id: 'FSMV-t2' } }); };
openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
await confirmFactoryInventoryAdjustment();
eq(Object.keys(writeCalls[writeCalls.length - 1]).sort(),
  ['created_by', 'new_available', 'note', 'reference_id', 'sku', 'warehouse_id'],
  'T2 the write payload is UNCHANGED — same six fields the backend already accepts (executed)');
eq(writeCalls[writeCalls.length - 1].warehouse_id, 'WH-CN-YX',
  'T2a and it addresses the row by canonical warehouse_id + sku, never by the factory label');

// ====================================================================================================
section('U. source — the raw fetch is gone, and the backend is untouched');
// ====================================================================================================
var accSrc = code(DB_JS).split('window.KM.DB.adjustFactoryInventory = async function')[1] || '';
accSrc = accSrc.split('window.KM.DB.')[0];
ok(!/await fetch\(/.test(accSrc), 'U1 the adjustment accessor no longer calls fetch() directly');
ok(!/API returned/.test(accSrc), 'U2 and no longer turns an HTTP status into the write’s verdict');
ok(/_kmCanonicalWrite_\('adjustFactoryInventory'/.test(accSrc),
  'U3 it dispatches through the canonical write owner — the same one every other command uses');
// The action is REGISTERED. The operator's message came from doGet, which is a different question.
var R01 = read('specs/active/apps-script/01_router.gs');
ok(/if \(action === 'adjustFactoryInventory'\)/.test(code(R01)),
  'U4 REGISTERED_ACTION = adjustFactoryInventory — it IS in the POST router, so this was never a missing action');
ok(/Missing or invalid action parameter\. Use: getOperationDb, getTable, system\.health or inventoryScope\.registry\.get/.test(R01)
  && /handler: 'doGet'/.test(R01),
  'U5 and the operator’s message is doGet’s terminal — a GET-handler answer, not a verdict on a POST');
// The backend write owner is not part of this round.
ok(/after_current_stock\s*=\s*new_available \+ before_reserved_stock|newAvailable \+ beforeReserved/.test(GS21 + code(GS21)),
  'U6 INVENTORY_ARITHMETIC_CHANGED = NO — 21_ still derives after_current from new_available + reserved');
ok(/New Available equals Current Available/.test(GS21),
  'U7 and still refuses a no-op, which is what makes a re-send incapable of minting a second movement');

// ====================================================================================================
section('V. NEGATIVE CONTROLS — §25 M1..M10');
// ====================================================================================================

// M1 — the defect this whole round exists to remove: an HTTP/transport failure treated as a verdict
// on the write. The mutant is BUILT and run against the same fixture as the real settlement, and the two
// must disagree — otherwise the suite is not measuring the rule it claims to defend.
await mut('M1 settling from the transport code alone (HTTP 404 = rejected) is caught', async function () {
  function mutantSettle(result) {          // the rule this round replaced
    if (result && result.success) return Promise.resolve({ outcome: 'CONFIRMED_COMMITTED', data: result.data || {} });
    return Promise.resolve({ outcome: 'CONFIRMED_REJECTED', message: 'Adjustment failed.' });
  }
  var lost = { success: false, error: 'lost', transport: { code: 'REDIRECT_TARGET_NOT_FOUND', details: { zero_write: true } } };
  // The row HAS been adjusted; only the answer was lost.
  var after = mkRows(); after[idxOf(after, 'WH-CN-YX', 'CO1100-R')].availableStock = 0;
  _rows = mkRows(); _rowsNow = after;
  var mctx = { warehouseId: 'WH-CN-YX', sku: 'CO1100-R', before: 13000, target: 0 };
  var real = await _factoryAdjustSettle(lost, mctx);
  var mutated = await mutantSettle(lost);
  return real.outcome === 'CONFIRMED_COMMITTED' && mutated.outcome === 'CONFIRMED_REJECTED';
});

// M1a — and the converse: the readback must not rubber-stamp everything either. On a row that did NOT
// move, the same settlement returns a refusal, so CONFIRMED_COMMITTED is earned rather than default.
await mut('M1a a settlement that confirms a commit the row does not show is caught', async function () {
  var lost = { success: false, error: 'lost', transport: { code: 'REDIRECT_TARGET_NOT_FOUND', details: {} } };
  _rows = mkRows(); _rowsNow = mkRows();          // still 13000
  var r = await _factoryAdjustSettle(lost, { warehouseId: 'WH-CN-YX', sku: 'CO1100-R', before: 13000, target: 0 });
  return r.outcome === 'CONFIRMED_NOT_STARTED';
});

// M2 — automatic replay on an ambiguous outcome.
await mut('M2 an automatic replay on OUTCOME_UNKNOWN is caught', async function () {
  _writeImpl = function () { return Promise.resolve({ success: false, error: 'lost', transport: { code: 'REDIRECT_TARGET_NOT_FOUND', details: {} } }); };
  openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
  var third = mkRows(); third[idxOf(third, 'WH-CN-YX', 'CO1100-R')].availableStock = 7777;
  _rowsNow = third;
  await confirmFactoryInventoryAdjustment();
  return writeCalls.length === 1;          // a replay would make it 2
});

// M3 — Done wired to the submit handler (the SHIPPED bug before this round).
await mut('M3 a Done button wired to submit is caught', function () {
  var actions = HTML.split('fia-modal-actions')[1].split('</div>')[0];
  var doneBtn = /id="factory-adjust-done-btn"[^>]*onclick="([^"]+)"/.exec(actions);
  return !!doneBtn && doneBtn[1] === 'closeFactoryInventoryAdjustModal()'
    && !/id="factory-adjust-done-btn"[^>]*onclick="confirm/.test(actions);
});

// M4 — Done handler missing after the success rerender.
await mut('M4 a Done button that never appears after success is caught', async function () {
  _writeImpl = function () { return Promise.resolve({ success: true, data: { movement_id: 'FSMV-9' } }); };
  openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
  await confirmFactoryInventoryAdjustment();
  return el('factory-adjust-done-btn').hidden === false && el('factory-adjust-confirm-btn').hidden === true;
});

// M5 — the SKU list ignores warehouse_id.
await mut('M5 a SKU list that ignores warehouse_id is caught', function () {
  openAndSelect('WH-TW-KM', null);
  var scoped = optionsOf('factory-adjust-record').filter(function (o) { return o.value !== ''; });
  var all = _rows.length;
  return scoped.length === 2 && all === 4;      // a global list would show 4
});

// M6 — Factory change preserves a stale SKU.
await mut('M6 a Factory change that preserves the previous SKU is caught', function () {
  openAndSelect('WH-CN-YX', 'CO1100-R');
  var had = !!_factoryAdjustSelected;
  el('factory-adjust-factory').value = 'WH-TW-KM';
  onFactoryAdjustFactoryChange();
  return had === true && _factoryAdjustSelected === null;
});

// M7 — double Confirm sends two writes.
await mut('M7 a second write from a double Confirm is caught', async function () {
  var rel = null;
  _writeImpl = function () { return new Promise(function (r) { rel = r; }); };
  openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
  var p = confirmFactoryInventoryAdjustment();
  confirmFactoryInventoryAdjustment();
  var n = writeCalls.length;
  rel({ success: true, data: {} });
  await p;
  return n === 1;
});

// M8 — post-write refresh reads the stale pre-write row.
await mut('M8 a success screen showing the stale pre-write quantity is caught', async function () {
  _writeImpl = function () { return Promise.resolve({ success: true, data: { movement_id: 'F', before_available: 13000, after_available: 0, quantity: -13000 } }); };
  openAndSelect('WH-CN-YX', 'CO1100-R'); fillForm(0);
  await confirmFactoryInventoryAdjustment();
  closeFactoryInventoryAdjustModal();
  _rows = mkRows(); _rows[idxOf(_rows, 'WH-CN-YX', 'CO1100-R')].availableStock = 0;
  openFactoryInventoryAdjustModal();
  el('factory-adjust-factory').value = 'WH-CN-YX'; onFactoryAdjustFactoryChange();
  el('factory-adjust-record').value = String(idxOf(_rows, 'WH-CN-YX', 'CO1100-R')); onFactoryAdjustRecordChange();
  return el('factory-adjust-current').textContent === (0).toLocaleString();
});

// M9 — a listener registered again on each reopen.
await mut('M9 a document listener re-registered on reopen is caught', function () {
  var b = domListeners;
  openFactoryInventoryAdjustModal(); openFactoryInventoryAdjustModal();
  return (domListeners - b) === 0;
});

// M10 — display label used as identity instead of warehouse_id.
await mut('M10 a Factory option carrying its display label as the value is caught', function () {
  openAndSelect(null, null);
  var opts = optionsOf('factory-adjust-factory').filter(function (o) { return o.value !== ''; });
  return opts.length === 2 && opts.every(function (o) {
    return /^WH-/.test(o.value) && o.value !== o.text;
  });
});

// ====================================================================================================
console.log('\n=====================================================');
console.log('FACTORY-INVENTORY-ADJUSTMENT-STABILITY-R1');
console.log('FALSE_NOT_WRITTEN_CLAIM_COUNT = 0   FALSE_REJECTED_CLAIM_COUNT = 0');
console.log('AUTOREPLAY_ON_UNKNOWN = NO   AUTOMATIC_DUPLICATE_WRITE_COUNT = 0');
console.log('DONE_CLICK_WRITE_REQUEST_COUNT = 0   DONE_CLICK_CLOSE_COUNT = 1');
console.log('CROSS_FACTORY_SKU_VISIBLE_COUNT = 0   FACTORY_CHANGE_CLEARS_SKU = YES');
console.log('INVENTORY_ARITHMETIC_CHANGED = NO   PRODUCTION_ROWS_WRITTEN = 0');
console.log('=====================================================');
console.log((fail ? 'FAILED  ' : 'PASSED  ') + pass + ' passed, ' + fail + ' failed' +
  '   (negative controls: ' + neg.caught + ' caught, ' + neg.missed + ' missed)');
process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error('SUITE ERROR: ' + (e && e.stack || e)); process.exit(1); });
