// Kitchen Mama Operation System — F1-7B-API-SHARED-INFRA-AND-WEEKLY-SHIPPING-CUTOVER-R1
// Proves the bounded transport/loading migration for Weekly Shipping WITHOUT changing business output:
//   - shared KM.loadState contract (pure state machine)
//   - weeklyShipping activated as a CANONICAL workspace (primary read; master-flag-independent; kill-switch)
//   - primary render + post-write refresh no longer require the broad Operation DB (no getOperationDb/loadOperationDb)
//   - NO silent broad-DB fallback (fail closed)
//   - _spLineDisplay is DISPLAY_ONLY in Workspace mode (live=null → snapshot-only; derivation is legacy-fallback only)
//   - Workspace adapter records == legacy record shape (BEFORE == AFTER for the same underlying rows)
// Run: node assets/tests/api-weekly-shipping-cutover-f1-7b-r1.test.js
// NOTE: no 'use strict' — extracted pure helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }        // relative to assets/
function readRoot(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); } // relative to repo root
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var SP = read('js/pages/shipping-plan.js');
var FND = read('js/api/km-api-foundation.js');
var IDX = readRoot('index.html');

// ---- §4 shared loading-state contract (pure) ----
var LS = require('../js/api/km-loading-state.js');
console.log('\n== §4 KM.loadState pure state machine ==');
ok(LS.STATES.INITIAL_LOADING && LS.STATES.READY && LS.STATES.REFRESHING && LS.STATES.EMPTY && LS.STATES.ERROR, 'five states present');
ok(LS.canTransition(null, 'INITIAL_LOADING'), 'null -> INITIAL_LOADING legal');
ok(LS.canTransition('INITIAL_LOADING', 'READY') && LS.canTransition('INITIAL_LOADING', 'EMPTY') && LS.canTransition('INITIAL_LOADING', 'ERROR'), 'INITIAL_LOADING -> READY/EMPTY/ERROR legal');
ok(LS.canTransition('READY', 'REFRESHING') && LS.canTransition('REFRESHING', 'READY'), 'READY <-> REFRESHING legal');
ok(!LS.canTransition('INITIAL_LOADING', 'REFRESHING'), 'INITIAL_LOADING -> REFRESHING illegal (no content yet)');
ok(!LS.canTransition('READY', 'BOGUS'), 'unknown target rejected');
eq(LS.loadEntryState(false), 'INITIAL_LOADING', 'no content -> INITIAL_LOADING');
eq(LS.loadEntryState(true), 'REFRESHING', 'has content -> REFRESHING');
ok(LS.isLoadingState('INITIAL_LOADING') && LS.isLoadingState('REFRESHING') && !LS.isLoadingState('READY'), 'isLoadingState');
// createRegion: legal transitions apply + fire render; illegal ignored
var seen = [];
var region = LS.createRegion({ render: function (s) { seen.push(s); } });
ok(region.beginLoad(false) === true && region.get() === 'INITIAL_LOADING', 'beginLoad(false) -> INITIAL_LOADING');
ok(region.set('READY') === true && region.get() === 'READY', 'INITIAL_LOADING -> READY applied');
ok(region.set('REFRESHING') === true && region.get() === 'REFRESHING', 'READY -> REFRESHING applied');
ok(region.set('BOGUS') === false && region.get() === 'REFRESHING', 'illegal transition ignored (state unchanged)');
eq(seen, ['INITIAL_LOADING', 'READY', 'REFRESHING'], 'render fired once per legal transition only');

// ---- §2/§3 activation: weeklyShipping is CANONICAL + default-enabled ----
console.log('\n== weeklyShipping activated as canonical workspace ==');
ok(/var WORKSPACE_CANONICAL = \{ recommendation: true, weeklyShipping: true \}/.test(FND), 'weeklyShipping is CANONICAL (master-flag-independent)');
ok(/WORKSPACE_ENABLED_DEFAULT = \{ weeklyShipping: true,/.test(FND), 'weeklyShipping per-workspace flag defaults ON');
ok(/function setWorkspaceEnabled/.test(FND), 'kill switch setWorkspaceEnabled present');
// canonical gate: workspaceApiActive returns wsEnabled[n] for a canonical+implemented workspace (source-proven)
ok(/if \(WORKSPACE_CANONICAL\[n\] === true\) return wsEnabled\[n\] === true;/.test(FND), 'canonical gate = per-workspace flag only (no master dependency)');
ok(/register\('weeklyShipping', \{[^}]*status: WORKSPACE_STATUS\.IMPLEMENTED, resolver: weeklyShippingResolver/.test(FND), 'weeklyShipping is IMPLEMENTED with a resolver');

// ---- §6/§10 primary render needs NO broad Operation DB ----
console.log('\n== §6/§10 Workspace primary read requires no broad Operation DB ==');
var mount = slice(SP, "KM.lifecycle.register('shippingplan-section'", 'unmount()');
ok(/if \(_spEffectiveWorkspace\(\)\) \{\s*renderShippingPlan\(\);/.test(mount), 'mount: Workspace mode renders directly (no loadOperationDb)');
ok(/else if \(_spUseDb\(\) && !window\._opDbCache && window\.KM\.DB\.loadOperationDb\)/.test(mount), 'mount: broad load kept ONLY for the Legacy branch');
var readModel = slice(SP, 'function loadWeeklyShippingReadModel_', 'function _spRenderReadError_');
var wsBranch = slice(readModel, 'if (_spEffectiveWorkspace())', 'var maps = _spBuildLegacyLiveMaps_');
ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(wsBranch), '§7 Workspace read branch never touches getOperationDb/loadOperationDb/_opDbCache');
ok(/getWorkspace\('weeklyShipping'/.test(wsBranch), 'Workspace branch reads via the scoped weeklyShipping workspace');
ok(/WORKSPACE_UNAVAILABLE|WORKSPACE_ERROR/.test(wsBranch), '§7 fail-closed: Workspace unavailable/error surfaces an error (no silent legacy fallback)');

// ---- §5/§8 post-write refresh is scoped (no full-DB reload in Workspace mode) ----
console.log('\n== §5/§8 post-write refresh scoped in Workspace mode ==');
var readback = slice(SP, 'function _spReadbackAfterWrite_', 'function _spHandleCommandResult_');
var rbWs = slice(readback, 'if (_spEffectiveWorkspace())', 'if (window.KM && window.KM.DB && window.KM.DB.loadOperationDb)');
ok(/renderShippingPlan\(\)/.test(rbWs) && !/loadOperationDb/.test(rbWs), 'Workspace readback re-reads the scoped workspace, NOT loadOperationDb');
ok(/loadOperationDb/.test(readback.slice(readback.indexOf('if (window.KM && window.KM.DB && window.KM.DB.loadOperationDb)'))), 'full-DB reload remains ONLY on the Legacy branch');

// ---- §15 shared loading helper is wired into the page + included in index.html ----
ok(/km-loading-state\.js/.test(IDX), 'index.html includes km-loading-state.js');
ok(/window\.KM\.loadState\.bindElement/.test(SP), 'shipping-plan binds the shared loading region');

// ---- §9 _spLineDisplay is DISPLAY_ONLY in Workspace mode; equivalence with Legacy when snapshot present ----
console.log('\n== §9 _spLineDisplay: Workspace = DISPLAY_ONLY; BEFORE == AFTER when snapshot present ==');
eval(slice(SP, 'function _spEsc', 'function loadWeeklyShippingReadModel_'));   // _spNum,_spHasRaw,_spLatestMap,_spLookup,workspace mappers
eval(slice(SP, 'function _spLineDisplay', 'function _spRenderDbSection'));       // _spLineDisplay

var plan = { country: 'US', marketplace: 'amazon' };
// a persisted line WITH a decision snapshot (the canonical case) — built through the real workspace adapter
var wsLine = _spWorkspaceLineRecord({ lineId: 'SPL-1', sku: 'GA0450', requestedQty: 800, approvedQty: 800, cartonQty: 40, unitsPerCarton: 20,
    raw: { snapshot_current_stock: 1234, snapshot_avg_sales_per_day: 20, snapshot_days_of_supply: 61.7, snapshot_target_days: 90, cbm: 3.2, gross_weight: 500, net_weight: 450 } }, 'SP-1');
// Legacy live enrichment maps (would derive stock/avg/dos IF the snapshot were absent)
var live = { inv: _spLatestMap([{ country: 'US', marketplace: 'amazon', sku: 'GA0450', availableQty: 999, fcTransferQty: 1, fcProcessingQty: 0, snapshotDate: '2026-08-01' }]),
    weekly: _spLatestMap([{ country: 'US', marketplace: 'amazon', sku: 'GA0450', salesUnits7d: 700, snapshotDate: '2026-08-01' }]), mpCompany: {} };
var wsDisp = _spLineDisplay(wsLine, plan, null);      // Workspace mode: live = null
var lgDisp = _spLineDisplay(wsLine, plan, live);      // Legacy mode: live present
eq(wsDisp, lgDisp, 'snapshot present → Workspace(live=null) output IDENTICAL to Legacy(live=maps)');
eq(wsDisp.currentStock, 1234, 'currentStock = frozen snapshot (not the live 1000 derivation)');
eq(wsDisp.avgSales, '20.0', 'avgSales = frozen snapshot');
eq(wsDisp.daysOfSupply, 61.7, 'daysOfSupply = frozen snapshot');

// Workspace mode NEVER derives: snapshot absent + live=null → 0 / '0.0' / '--' (pure display, no business math)
var bareLine = _spWorkspaceLineRecord({ lineId: 'SPL-2', sku: 'GA0450', approvedQty: 10, cartonQty: 1, unitsPerCarton: 10, raw: {} }, 'SP-1');
var wsBare = _spLineDisplay(bareLine, plan, null);
eq(wsBare, { currentStock: 0, avgSales: '0.0', daysOfSupply: '--' }, 'Workspace snapshot-absent → 0/0.0/-- (NO client derivation)');
// the derivation branch is LEGACY-ONLY: same bare line WITH live maps derives (proves the risk lives only in the legacy fallback path)
var lgBare = _spLineDisplay(bareLine, plan, live);
ok(lgBare.currentStock === 1000 && lgBare.avgSales === '100.0', 'derivation exists ONLY on the Legacy live-fallback path (bypassed in Workspace mode)');

// ---- equivalence: workspace adapter → same record shape the render consumes ----
console.log('\n== adapter equivalence: workspace DTO → canonical record ==');
var adapted = _spAdaptWorkspaceToRecords({
    plans: [{ planId: 'SP-1', planNo: 'WSP-1', company: 'KM', country: 'US', marketplace: 'amazon', status: 'draft', planVersion: 1,
        shippingMethod: 'sea', carrier: { id: '' }, raw: { created_at: '2026-08-10' } }],
    detailsByPlanId: { 'SP-1': { lines: [{ lineId: 'SPL-1', planId: 'SP-1', sku: 'GA0450', approvedQty: 800, cartonQty: 40, unitsPerCarton: 20, raw: { cbm: 3.2, gross_weight: 500, net_weight: 450 } }] } }
});
eq(adapted.plans.length, 1, 'one plan adapted');
eq(adapted.lines.length, 1, 'one line adapted');
eq(adapted.plans[0].shippingPlanId, 'SP-1', 'plan id mapped');
eq(adapted.lines[0].approvedQty, 800, 'approvedQty (physical decision qty) preserved');
eq(adapted.lines[0].cartonQty, 40, 'cartonQty preserved');
eq(adapted.lines[0].cbm, 3.2, 'logistics snapshot cbm preserved');

// ---- no business authority moved to frontend (Weekly page never computes gap/FIFO/recommendation/shipment) ----
console.log('\n== no frontend business authority ==');
var spCode = SP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/generateShipmentLineAllocations\s*\(|slaFifoCompare_|calculateGap|generateOrderPlanningRecommendation|KMREC\./.test(spCode), 'no FIFO/Gap/Recommendation/allocation authority in the Weekly page');

console.log('\n----------------------------------------');
console.log('API WEEKLY SHIPPING CUTOVER (F1-7B-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
