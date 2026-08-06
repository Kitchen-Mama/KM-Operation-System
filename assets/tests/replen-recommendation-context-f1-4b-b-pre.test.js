// Kitchen Mama Operation System — Inventory Replenishment Recommendation Context Input Authority (F1-4B-B-PRE).
// Run: node assets/tests/replen-recommendation-context-f1-4b-b-pre.test.js
// -----------------------------------------------------------------------------
// Proves the page now OWNS the three caller-owned recommendation-context inputs (destinationWarehouseId /
// calculationMonth / planningCycle) explicitly and truthfully — WITHOUT calling the Recommendation API,
// without inference, without a browser-clock default, and without fabricating an FBA warehouse identity.
// Behavioral: the pure window.IRContext module is extracted from the page source (between the __IRCTX_*
// markers) and eval'd with a fake window. Source-scan: the DOM wiring, HTML partial, and CSS honor the
// negative constraints (no API call, no write, blank starts, existing placeholders/filters preserved).
// No DOM render, no network, no live Spreadsheet.

'use strict';
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');
var HTML = read('html/pages/inventory-replenishment.html');
var CSS = read('css/pages/inventory-replenishment.css');
var KMAPI = require('../js/api/km-api-foundation.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// ---- extract + eval the pure IRContext module -------------------------------------------------------
var START = JS.indexOf('// __IRCTX_START__');
var END = JS.indexOf('// __IRCTX_END__');
ok(START > -1 && END > START, 'X0 IRContext extraction markers present');
var BLOCK = JS.slice(START, END);
// Fake window: IRCountry (UK ≡ GB alias) + the module assigns window.IRContext.
global.window = { IRCountry: { matches: function (a, b) {
  function up(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  var A = up(a), B = up(b); if (A === B) return true;
  var ukgb = { UK: 'GB', GB: 'GB' }; return (ukgb[A] || A) === (ukgb[B] || B);
} } };
(function () { var window = global.window; eval(BLOCK); })();
var IR = global.window.IRContext;
ok(IR && typeof IR.normalizeRecommendationContext === 'function', 'X1 IRContext eval exposes the pure API');

// ---- fixtures ---------------------------------------------------------------------------------------
var WHS = [
  { warehouseId: 'WH-US-3PL', warehouseCode: 'US3PL', warehouseName: 'US Third Party', warehouseType: '3PL', company: 'KM', country: 'US', isActive: true },
  { warehouseId: 'WH-US-INACTIVE', warehouseCode: 'USINA', warehouseName: 'US Closed', warehouseType: '3PL', company: 'KM', country: 'US', isActive: false },
  { warehouseId: 'WH-US-OTHERCO', warehouseCode: 'USOTH', warehouseName: 'Other Co US', warehouseType: '3PL', company: 'ResUS', country: 'US', isActive: true },
  { warehouseId: 'WH-CN-FACT', warehouseCode: 'CNFAC', warehouseName: 'CN Factory', warehouseType: 'FACTORY', company: 'KM', country: 'CN', isActive: true },
  { warehouseId: 'WH-UK-3PL', warehouseCode: 'UK3PL', warehouseName: 'UK Third Party', warehouseType: '3PL', company: 'KM', country: 'GB', isActive: true }
];
var US = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP-KM-US-AMZ', fulfillmentModel: 'self_fulfilled' };

// =====================================================================================================
section('A. Eligible destination warehouses (identity = warehouse_id; active + same company + country)');
(function () {
  var el = IR.eligibleDestinationWarehouses(WHS, US);
  var ids = el.map(function (w) { return w.warehouseId; });
  ok(ids.indexOf('WH-US-3PL') > -1, 'A1 active same-company same-country warehouse is eligible');
  ok(ids.indexOf('WH-US-INACTIVE') === -1, 'A2 inactive warehouse excluded');
  ok(ids.indexOf('WH-US-OTHERCO') === -1, 'A3 wrong-company warehouse excluded (no cross-company borrowing)');
  ok(ids.indexOf('WH-CN-FACT') === -1, 'A4 different-country (CN) warehouse excluded for a US scope');
  ok(el.length && has(el[0], 'warehouseId') && has(el[0], 'warehouseCode') && has(el[0], 'warehouseName'), 'A5 option carries id + code + name (display ≠ identity)');
  // UK ≡ GB alias: a GB warehouse is eligible for a UK-scoped destination
  var uk = IR.eligibleDestinationWarehouses(WHS, { company: 'KM', country: 'UK' });
  ok(uk.map(function (w) { return w.warehouseId; }).indexOf('WH-UK-3PL') > -1, 'A6 UK≡GB alias — GB warehouse eligible for UK scope');
  // deterministic sort
  var sorted = IR.eligibleDestinationWarehouses(WHS, { company: 'KM', country: 'US' });
  ok(JSON.stringify(sorted) === JSON.stringify(sorted.slice().sort(function (a, b) { var ka = a.warehouseCode || a.warehouseId, kb = b.warehouseCode || b.warehouseId; return ka < kb ? -1 : ka > kb ? 1 : 0; })), 'A7 deterministic sort by code/id');
})();

// =====================================================================================================
section('B. Destination selection — NO auto-select; explicit only');
(function () {
  var el = IR.eligibleDestinationWarehouses(WHS, US);
  ok(IR.destinationState(US, el, '').state === 'UNSELECTED', 'B1 non-empty options + no selection → UNSELECTED (never auto-picks first)');
  // single eligible option still requires explicit selection
  var one = [{ warehouseId: 'WH-ONLY', warehouseCode: 'ONLY', warehouseName: 'Only', warehouseType: '3PL' }];
  ok(IR.destinationState(US, one, '').state === 'UNSELECTED', 'B2 single eligible option still UNSELECTED until explicitly chosen');
  ok(IR.destinationState(US, el, 'WH-US-3PL').state === 'SELECTED_VALID', 'B3 explicit valid selection → SELECTED_VALID');
  ok(IR.destinationState(US, el, 'WH-US-3PL').destinationWarehouseId === 'WH-US-3PL', 'B4 selected id echoed (canonical warehouse_id)');
  ok(IR.destinationState(US, el, 'WH-GONE').state === 'SELECTED_INVALID', 'B5 selection not in eligible set → SELECTED_INVALID');
  ok(IR.destinationState(US, el, ['A', 'B']).state === 'DESTINATION_AUTHORITY_CONFLICT', 'B6 >1 distinct authority → DESTINATION_AUTHORITY_CONFLICT');
})();

// =====================================================================================================
section('C. Empty eligible set — FBA/platform vs generic no-destination (never fabricate an id)');
(function () {
  var platform = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', fulfillmentModel: 'platform_fulfilled' };
  ok(IR.destinationState(platform, [], '').state === 'PLATFORM_DESTINATION_IDENTITY_UNRESOLVED', 'C1 platform-fulfilled + no eligible warehouse → PLATFORM_DESTINATION_IDENTITY_UNRESOLVED');
  ok(IR.destinationState(platform, [], '').destinationWarehouseId === null, 'C2 no fabricated FBA warehouse id (null)');
  var selfFf = { company: 'KM', country: 'ZZ', marketplace: 'X', fulfillmentModel: 'self_fulfilled' };
  ok(IR.destinationState(selfFf, [], '').state === 'NO_ELIGIBLE_DESTINATION', 'C3 non-platform + no eligible warehouse → NO_ELIGIBLE_DESTINATION');
})();

// =====================================================================================================
section('D. Calculation Month — explicit YYYY-MM only; no browser clock');
(function () {
  ok(IR.validateCalculationMonth('').state === 'UNSELECTED', 'D1 blank → UNSELECTED (no default)');
  ok(IR.validateCalculationMonth('2026-08').state === 'VALID' && IR.validateCalculationMonth('2026-08').value === '2026-08', 'D2 valid YYYY-MM accepted');
  ok(IR.validateCalculationMonth('2026-13').state === 'INVALID_FORMAT', 'D3 month 13 rejected');
  ok(IR.validateCalculationMonth('2026/08').state === 'INVALID_FORMAT', 'D4 wrong separator rejected');
  ok(IR.validateCalculationMonth('Aug 2026').state === 'INVALID_FORMAT', 'D5 locale text rejected');
})();

// =====================================================================================================
section('E. Planning Cycle — explicit non-empty run identifier (no invented format, no auto-copy)');
(function () {
  ok(IR.validatePlanningCycle('').state === 'UNSELECTED', 'E1 blank → UNSELECTED');
  ok(IR.validatePlanningCycle('2026-W40').state === 'VALID', 'E2 explicit value accepted (ISO-week style)');
  ok(IR.validatePlanningCycle('2026-08').state === 'VALID', 'E3 explicit value accepted (month style)');
  ok(IR.validatePlanningCycle('  run  x ').value === 'run x', 'E4 whitespace normalized deterministically');
})();

// =====================================================================================================
section('F. Normalized context model + status truth');
(function () {
  var el = IR.eligibleDestinationWarehouses(WHS, US);
  function build(over) {
    var base = { scope: US, eligibleWarehouses: el, destinationSelectedId: 'WH-US-3PL', calculationMonthRaw: '2026-08', planningCycleRaw: '2026-W40' };
    if (over) for (var k in over) base[k] = over[k];
    return IR.normalizeRecommendationContext(base);
  }
  var ready = build();
  ok(ready.status === 'READY', 'F1 all six valid → READY');
  ok(ready.company === 'KM' && ready.country === 'US' && ready.marketplace === 'AMAZON_US', 'F2 scope (company/country/marketplace) carried into context');
  ok(build({ destinationSelectedId: '' }).status === 'NOT_READY', 'F3 missing destination → NOT_READY');
  ok(build({ calculationMonthRaw: '' }).status === 'NOT_READY', 'F4 missing month → NOT_READY');
  ok(build({ planningCycleRaw: '' }).status === 'NOT_READY', 'F5 missing planning cycle → NOT_READY');
  ok(build({ calculationMonthRaw: '2026-99' }).status === 'INVALID', 'F6 invalid month → INVALID');
  ok(build({ destinationSelectedId: 'WH-GONE' }).status === 'INVALID', 'F7 stale/invalid destination selection → INVALID');
  ok(build({ eligibleWarehouses: [], scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', fulfillmentModel: 'platform_fulfilled' } }).status === 'DESTINATION_BLOCKED', 'F8 platform + no eligible → DESTINATION_BLOCKED');
  var m = build({ destinationSelectedId: '', calculationMonthRaw: '' });
  ok(m.missing.indexOf('destinationWarehouseId') > -1 && m.missing.indexOf('calculationMonth') > -1, 'F9 missing[] lists the absent fields');
})();

// =====================================================================================================
section('G. Normalized DTO matches the F1-4B-A request contract');
(function () {
  var el = IR.eligibleDestinationWarehouses(WHS, US);
  var ready = IR.normalizeRecommendationContext({ scope: US, eligibleWarehouses: el, destinationSelectedId: 'WH-US-3PL', calculationMonthRaw: '2026-08', planningCycleRaw: '2026-W40' });
  var dto = IR.toRequestContext(ready);
  ok(dto && dto.company === 'KM' && dto.country === 'US' && dto.marketplace === 'AMAZON_US' && dto.destinationWarehouseId === 'WH-US-3PL' && dto.calculationMonth === '2026-08' && dto.planningCycle === '2026-W40', 'G1 toRequestContext returns the exact caller-owned fields');
  ok(IR.toRequestContext(IR.normalizeRecommendationContext({ scope: US, eligibleWarehouses: el, destinationSelectedId: '', calculationMonthRaw: '2026-08', planningCycleRaw: '2026-W40' })) === null, 'G2 not-ready context → null DTO (never partial/guessed)');
  // feed it into the real Foundation DTO builder — every mandatory field populates (no null)
  var api = KMAPI.createApiFoundation({});
  var payload = api.recommendation.buildRequestDTO({ scope: { company: dto.company, country: dto.country, marketplace: dto.marketplace }, destinationWarehouseId: dto.destinationWarehouseId, calculationMonth: dto.calculationMonth, planningCycle: dto.planningCycle }).payload;
  ok(payload.destinationWarehouseId === 'WH-US-3PL' && payload.calculationMonth === '2026-08' && payload.planningCycle === '2026-W40' && payload.scope.company === 'KM', 'G3 context drives a fully-populated recommendation.workspace.get DTO (no MISSING_* nulls)');
})();

// =====================================================================================================
section('H. Session restore — validated + scope-guarded (never restore an invalid/foreign value)');
(function () {
  var el = IR.eligibleDestinationWarehouses(WHS, US);
  var key = IR.contextScopeKey(US);
  var good = IR.restoreContextSelection({ scopeKey: key, destinationWarehouseId: 'WH-US-3PL', calculationMonth: '2026-08', planningCycle: '2026-W40' }, US, el);
  ok(good.destinationSelectedId === 'WH-US-3PL' && good.calculationMonthRaw === '2026-08' && good.planningCycleRaw === '2026-W40', 'H1 valid same-scope selection restored');
  var foreign = IR.restoreContextSelection({ scopeKey: 'KM|CA|MP-OTHER', destinationWarehouseId: 'WH-US-3PL', calculationMonth: '2026-08', planningCycle: 'x' }, US, el);
  ok(foreign.destinationSelectedId === '' && foreign.calculationMonthRaw === '2026-08', 'H2 foreign-scope destination dropped; scope-independent month kept');
  var stale = IR.restoreContextSelection({ scopeKey: key, destinationWarehouseId: 'WH-GONE', calculationMonth: 'bad', planningCycle: '' }, US, el);
  ok(stale.destinationSelectedId === '' && stale.calculationMonthRaw === '' && stale.planningCycleRaw === '', 'H3 no-longer-eligible destination + invalid month dropped');
})();

// =====================================================================================================
section('I. Source-scan — DOM wiring honors the negative constraints');
(function () {
  // Strip comments so negative scans test CODE, not the explanatory prose (which legitimately names
  // recommendation.workspace.get / getOperationDb when describing what the code must NOT do).
  function strip(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  var wireStart = JS.indexOf('F1-4B-B-PRE DOM wiring');
  var wireEnd = JS.indexOf('window.bindReplenRecoContextControls = bindReplenRecoContextControls;');
  ok(wireStart > -1 && wireEnd > wireStart, 'I0 DOM wiring block present + bounded');
  var wire = strip(JS.slice(wireStart, wireEnd + 120));
  var codeBlock = strip(BLOCK);
  var scan = codeBlock + '\n' + wire;
  // no Recommendation API / Foundation workspace call anywhere the context CODE lives
  ok(!/getWorkspace\s*\(/.test(scan), 'I1 no KM.api.getWorkspace call in context code');
  ok(!/\.workspace\.get/.test(scan) && !/executeCommand/.test(scan), 'I2 no workspace action / executeCommand in context code');
  ok(!/KM\.api\b/.test(scan), 'I3 no KM.api reference in context code');
  // no new Date() clock default for the calculation month
  ok(!/new Date\s*\(/.test(scan), 'I4 no new Date() in the context module/wiring (no browser-clock anchor)');
  // reads the existing cache only — no whole-DB reload / getOperationDb / fetch added
  ok(/getWarehouses\s*\(/.test(wire) && !/getOperationDb/.test(scan) && !/fetch\s*\(/.test(scan), 'I5 reads getWarehouses cache; no getOperationDb / fetch');
  // no DB write / no draft persistence in the context code (sessionStorage preference only)
  ok(!/upsert|appendRow|setValue|importMarketplaceSkusBatch|ShippingAllocationDraft|saveAllocation/i.test(scan), 'I6 no DB write / draft persistence in context code');
  ok(/sessionStorage\.setItem\(\s*REPLEN_RECO_CONTEXT_KEY/.test(wire) && !/localStorage/.test(scan), 'I7 explicit selection persisted to sessionStorage only (not localStorage)');
  // no runtime/formula import added to the page
  ok(!/require\(\s*['"]\.\.\/core\/supply-planning/.test(JS) && !/require\(\s*['"]\.\.\/api\/km-api-foundation/.test(JS), 'I8 no runtime/formula/Foundation module imported into the page');
  // destination option value is warehouse_id, never the marketplace / display name
  ok(/escapeReplenHtml\(w\.warehouseId\)/.test(wire), 'I9 destination <option> value = warehouse_id (identity)');
  ok(!/escapeReplenHtml\(w\.marketplace/.test(wire), 'I10 marketplace is never used as the destination value');
  // never auto-selects eligible[0]
  ok(/sel\.value = keep/.test(wire) && !/eligible\[0\]/.test(wire), 'I11 destination never auto-selects eligible[0] (explicit keep-only)');
})();

// =====================================================================================================
section('J. Source-scan — HTML controls, accessibility, existing filters + placeholders preserved');
(function () {
  ok(/id="replenRecoDestination"/.test(HTML) && /<select id="replenRecoDestination"/.test(HTML), 'J1 destination <select> present');
  ok(/id="replenRecoCalcMonth"[^>]*type="month"|type="month"[^>]*id="replenRecoCalcMonth"/.test(HTML), 'J2 calculation month uses <input type="month">');
  ok(/id="replenRecoPlanningCycle"/.test(HTML), 'J3 planning cycle control present');
  ok(!/id="replenRecoCalcMonth"[^>]*value=/.test(HTML) && !/id="replenRecoPlanningCycle"[^>]*value=/.test(HTML), 'J4 month + cycle start blank (no value= default)');
  ok(/role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/.test(HTML), 'J5 readiness indicator is role=status + aria-live=polite');
  ok(/<label for="replenRecoDestination">/.test(HTML) && /<label for="replenRecoCalcMonth">/.test(HTML) && /<label for="replenRecoPlanningCycle">/.test(HTML), 'J6 every control has an associated <label for>');
  ok((HTML.match(/id="replenRecoDestination"/g) || []).length === 1, 'J7 single destination control (one control set in the partial)');
  ok(/id="replenCountry"/.test(HTML) && /id="replenMarketplace"/.test(HTML) && /id="replenLTSFilter"/.test(HTML) && /id="replenTargetDays"/.test(HTML), 'J8 existing Country/Marketplace/LTS/TargetDays filters preserved');
  // controls are nested inside the page control panel, never a direct <body> child
  ok(/replen-control-panel[\s\S]*replen-reco-context/.test(HTML), 'J9 context block lives inside the page control panel (page-local)');
  // existing Recommendation Summary placeholders are NOT removed in this round
  ok(/No recommendation generated/.test(JS) && /AI Pending/.test(JS), 'J10 existing Recommendation Summary placeholders left unchanged');
})();

// =====================================================================================================
section('K. Source-scan — lifecycle hook + CSS');
(function () {
  ok(/initReplenRecoContext\(\)/.test(JS), 'K1 mount initializes the context inputs');
  ok(/onReplenRecoScopeChanged\(\)/.test(JS), 'K2 scope-change (country/marketplace) recomputes destination + context');
  ok(/\.replen-reco-context\b/.test(CSS) && /data-status="READY"/.test(CSS) && /data-status="DESTINATION_BLOCKED"/.test(CSS), 'K3 CSS styles the context block + readiness states');
})();

console.log('\n----------------------------------------');
console.log('REPLEN RECOMMENDATION CONTEXT (F1-4B-B-PRE): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
