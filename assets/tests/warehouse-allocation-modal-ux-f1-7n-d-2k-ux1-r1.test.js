// Kitchen Mama Operation System — F1-7N-D-2k-UX1-R1 Warehouse Allocation modal dismiss + platform-scope guard.
// Run: node assets/tests/warehouse-allocation-modal-ux-f1-7n-d-2k-ux1-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// UX-ONLY round. Proves (pure): the applicability classifier keys off the CANONICAL fulfillment_model (never a
// marketplace name) — self/hybrid apply, platform fails soft with a notice, unknown fails closed; and the scoped
// fulfillment lookup reuses the already-loaded getMarketplaces read-model (no new API / no broad DB read). Proves
// (source-order/wiring): platform/unknown scopes short-circuit BEFORE any warehouseAllocation.get call; the modal
// shows an immediate Loading shell before the async hydrate; backdrop + Escape dismiss are wired, inside-click is
// protected, and a save-in-flight suppresses dismiss; hybrid self-lane wording is preserved. NO 'use strict'.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
function section(n) { console.log('\n== ' + n + ' =='); }

var IR_JS = read('js/pages/inventory-replenishment.js');
var IR_HTML = read('html/pages/inventory-replenishment.html');

eval(extractFn(IR_JS, '_replenDarFulfillmentOf'));
eval(extractFn(IR_JS, '_replenDarApplicability'));

var OPEN = extractFn(IR_JS, 'openReplenDemandAllocationModal');
var CLOSE = extractFn(IR_JS, 'closeReplenDemandAllocationModal');
var BIND = extractFn(IR_JS, '_replenDarBindDismiss');
var SAVE = extractFn(IR_JS, 'saveReplenDemandAllocation');

// =================================================================================================================
section('A/M classifier — self_fulfilled & hybrid APPLY (editor opens)');
ok(_replenDarApplicability('self_fulfilled').applicable === true && _replenDarApplicability('self_fulfilled').kind === 'self_fulfilled', 'A self_fulfilled applicable');
ok(_replenDarApplicability('hybrid').applicable === true && _replenDarApplicability('hybrid').kind === 'hybrid', 'M hybrid applicable');
ok(_replenDarApplicability('SELF_FULFILLED').applicable === true, 'A case-insensitive (canonical value, not name)');

section('I/J classifier — platform_fulfilled NOT applicable + informational notice');
var plat = _replenDarApplicability('platform_fulfilled');
ok(plat.applicable === false && plat.kind === 'platform_fulfilled', 'I platform not applicable');
ok(/not required for this marketplace/.test(plat.message) && /planned to the marketplace directly/.test(plat.message) && /shipment execution/.test(plat.message), 'J platform notice copy present');

section('P classifier — unknown/blank fulfillment FAILS CLOSED');
ok(_replenDarApplicability('').applicable === false && _replenDarApplicability('').kind === 'unknown', 'P blank fails closed');
ok(_replenDarApplicability('something_else').applicable === false && _replenDarApplicability('something_else').kind === 'unknown', 'P unknown value fails closed');
ok(/Fulfillment configuration unavailable/.test(_replenDarApplicability('').message), 'P fail-closed notice copy present');

section('R fulfillment lookup reuses the getMarketplaces read-model (no name inference, no new API)');
var MPS = [
  { marketplaceId: 'M-SHOP', marketplace: 'Shopify', fulfillmentModel: 'self_fulfilled' },
  { marketplaceId: 'M-AMZN', marketplace: 'Amazon', fulfillmentModel: 'platform_fulfilled' },
  { marketplaceId: 'M-WMT', marketplace: 'Walmart', fulfillmentModel: 'hybrid' },
  { marketplaceId: 'M-NOFF', marketplace: 'MysteryMkt', fulfillmentModel: '' }
];
eq(_replenDarFulfillmentOf(MPS, 'M-AMZN'), 'platform_fulfilled', 'R Amazon → platform_fulfilled (by id, from model — not the name)');
eq(_replenDarFulfillmentOf(MPS, 'M-WMT'), 'hybrid', 'R Walmart → hybrid (by canonical model)');
eq(_replenDarFulfillmentOf(MPS, 'M-NOFF'), '', 'R blank model → "" (→ fail closed)');
eq(_replenDarFulfillmentOf(MPS, 'M-MISSING'), '', 'R absent marketplace → "" (→ fail closed)');
eq(_replenDarFulfillmentOf(MPS, ''), '', 'R no marketplace id → ""');

section('K/I open — platform/unknown short-circuits BEFORE warehouseAllocation.get');
ok(OPEN.indexOf('_replenDarApplicability') !== -1 && OPEN.indexOf('if (!app.applicable)') !== -1, 'open classifies applicability');
ok(OPEN.indexOf('if (!app.applicable)') < OPEN.indexOf('_replenDarReadRules'), 'K guard + return precede the config read (no warehouseAllocation.get for platform/unknown)');
ok(_replenDarFulfillmentOf && OPEN.indexOf('_replenDarReadMarketplaces()') !== -1, 'open resolves the model from the read-model');
ok(OPEN.indexOf('getOperationDb(') === -1, 'R no broad DB read (getOperationDb call) introduced in open');

section('Q async — immediate Loading shell BEFORE the async hydrate');
ok(OPEN.indexOf('_replenDarShowLoading()') !== -1 && OPEN.indexOf("classList.add('is-open')") !== -1, 'open shows the modal shell + Loading');
ok(OPEN.indexOf('_replenDarShowLoading()') < OPEN.indexOf('await _replenDarReadRules'), 'Q Loading shell shown before await (immediate click feedback)');
ok(/function _replenDarShowLoading\(\)/.test(IR_JS) && IR_JS.indexOf('Loading…') !== -1, 'Q Loading affordance exists');

section('C/D backdrop dismiss + inside-click protection');
ok(BIND.indexOf("addEventListener('click'") !== -1 && BIND.indexOf('closeReplenDemandAllocationModal()') !== -1, 'C overlay backdrop click closes the modal');
ok(BIND.indexOf('ev.target === e.overlay') !== -1, 'D inside-click protected — only the overlay target dismisses');

section('F Escape closes; E/H save-in-flight suppresses dismiss');
ok(BIND.indexOf("ev.key === 'Escape'") !== -1 && BIND.indexOf('!_replenDarSaving') !== -1, 'F Escape closes; guarded by save-in-flight');
ok(BIND.indexOf('if (_replenDarSaving) return;') !== -1, 'E backdrop suppressed while saving');
ok(CLOSE.indexOf('if (_replenDarSaving) return;') !== -1, 'H close() is a no-op mid-write');
ok(SAVE.indexOf('_replenDarSetSaving(true)') !== -1 && /_replenDarSetSaving\(false\)/.test(SAVE), 'H save toggles the in-flight lock (set true, reset on settle)');
ok(/save\.disabled = !!on/.test(IR_JS) && /cancel\.disabled = !!on/.test(IR_JS), 'H Cancel + Save disabled while saving');

section('close unbinds listeners (no cross-modal leak); Cancel wired');
ok(CLOSE.indexOf('_replenDarUnbindDismiss()') !== -1, 'close removes the backdrop + Escape listeners');
ok(/id="replen-dar-cancel-btn"[^>]*onclick="closeReplenDemandAllocationModal\(\)"/.test(IR_HTML), 'E Cancel button closes the modal');

section('N hybrid self-lane wording preserved; G/L persistence path unchanged (frontend-only)');
ok(IR_HTML.indexOf('Self-Fulfilled Warehouse Allocation') !== -1 && IR_HTML.indexOf('Platform (FBA) lanes are unaffected') !== -1, 'N hybrid self-lane label retained');
ok(IR_JS.indexOf("action: 'replenishmentDemandAllocation.save'") === -1 && /saveReplenishmentDemandAllocationRules\(payload\)/.test(SAVE), 'G/L save still uses the SAME writer (no persistence/authority change)');

console.log('\n----------------------------------------');
console.log('WAREHOUSE ALLOCATION MODAL UX (F1-7N-D-2k-UX1-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
