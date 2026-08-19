// Kitchen Mama Operation System — F1-7N-AI-PLAN-AND-AUTOMATED-DRAFT-RUNTIME-WIRING-AUDIT-AND-HOTFIX-R1
// -----------------------------------------------------------------------------------------------------------------
// PROVEN WIRING FIX: the shared AI-Support scope modal populated Country/Marketplace from the BROAD cache getter
// (window.KM.DB.getMarketplaces → window._opDbCache.marketplaces), which is null/[] on a cold F1-7L zero-prime
// session → empty selectors. It now resolves the universe from the COLD-ELIGIBLE scoped reference owner
// window.KM.DB.getMarketplaceReference() (F1-7J-A2; bounded getTable('marketplaces'), never the broad cache), with the
// broad getter kept only as a warm seed / defensive fallback. "AI Plan" and "Recalculate Current Scope" also get
// distinct confirm labels so they read as different workflows (they already invoke distinct terminal handlers).
//
// HALT BOUNDARY (documented, NOT patched here): there is no canonical Recommendation→shipping_allocation_draft
// generation owner (AI_PLAN_ALLOCATION_AUTHORITY_NOT_DEFINED). This suite asserts AI Plan writes NO allocation draft
// and the modal invents NO allocation/formula/write, so the boundary is preserved.
// Run: node assets/tests/ai-plan-recalc-scope-wiring-f1-7n-r1.test.js

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var MOD = require('../js/utils/scope-select-modal.js');
var MODAL_SRC = read('js/utils/scope-select-modal.js');
var MC = code(MODAL_SRC);
var INV_JS = read('js/pages/inventory-replenishment.js');
var RO_JS = read('js/pages/request-order.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var INDEX = read(path.join('..', 'index.html'));

var REF = [{ marketplaceId: 'MP-US-AMZ', company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'active' }];
var BROAD_SENTINEL = [{ marketplaceId: 'MP-BROAD', company: 'KM', country: 'ZZ', marketplace: 'BROAD_ONLY', status: 'active' }];

// ---- helper to run the async resolver against a stubbed window ---------------------------------------------------
function withWindow(win, fn) {
  var had = Object.prototype.hasOwnProperty.call(global, 'window');
  var prev = global.window;
  global.window = win;
  return Promise.resolve().then(fn).then(function (v) { if (had) global.window = prev; else delete global.window; return v; },
    function (e) { if (had) global.window = prev; else delete global.window; throw e; });
}

(async function () {
  // ===============================================================================================================
  section('COLD-ELIGIBLE source — resolves from getMarketplaceReference (never the broad cache)');
  // (1) reference resolves non-empty → used verbatim; broad getter (sentinel) is NOT consulted.
  var r1 = await withWindow({ KM: { DB: {
    getMarketplaceReference: function () { return Promise.resolve(REF); },
    getMarketplaces: function () { return BROAD_SENTINEL; }
  } } }, function () { return MOD._resolveMarketplacesAsync(); });
  ok(JSON.stringify(r1) === JSON.stringify(REF), 'A1 cold: reference universe used verbatim (marketplaceId MP-US-AMZ)');
  ok(JSON.stringify(r1) !== JSON.stringify(BROAD_SENTINEL), 'A2 the broad _opDbCache getter is NOT the source when the reference resolves');

  // (2) reference resolves EMPTY → defensive fallback to the broad getter (warm-session parity).
  var r2 = await withWindow({ KM: { DB: {
    getMarketplaceReference: function () { return Promise.resolve([]); },
    getMarketplaces: function () { return BROAD_SENTINEL; }
  } } }, function () { return MOD._resolveMarketplacesAsync(); });
  ok(JSON.stringify(r2) === JSON.stringify(BROAD_SENTINEL), 'A3 reference empty → falls back to the broad getter (no hard failure)');

  // (3) reference REJECTS → fallback to broad (never throws to the caller).
  var r3 = await withWindow({ KM: { DB: {
    getMarketplaceReference: function () { return Promise.reject(new Error('net')); },
    getMarketplaces: function () { return BROAD_SENTINEL; }
  } } }, function () { return MOD._resolveMarketplacesAsync(); });
  ok(JSON.stringify(r3) === JSON.stringify(BROAD_SENTINEL), 'A4 reference rejection → fallback to broad (resolver never rejects)');

  // (4) reference owner ABSENT → broad getter.
  var r4 = await withWindow({ KM: { DB: { getMarketplaces: function () { return BROAD_SENTINEL; } } } },
    function () { return MOD._resolveMarketplacesAsync(); });
  ok(JSON.stringify(r4) === JSON.stringify(BROAD_SENTINEL), 'A5 no reference owner → defensive broad fallback');

  // (5) no window at all → resolves [] (never throws).
  var r5 = await withWindow(undefined, function () { return MOD._resolveMarketplacesAsync(); });
  ok(Array.isArray(r5) && r5.length === 0, 'A6 no window → resolves [] (defensive, no throw)');

  // ===============================================================================================================
  section('open() seeds sync then authoritatively refills from the cold-eligible reference');
  ok(/getMarketplacesAsync\(\)\.then\(/.test(MC), 'B1 open() refills from getMarketplacesAsync() (the cold-eligible source)');
  ok(/getMarketplaceReference/.test(MC), 'B2 modal references the scoped reference owner getMarketplaceReference');
  ok(/var seed = getMarketplaces\(\);/.test(MC), 'B3 warm-session sync seed retained (instant populate when the cache is warm)');
  ok(/Loading/.test(MODAL_SRC), 'B4 cold affordance: a Loading hint shows until the reference resolves');
  ok(/myToken !== _openToken/.test(MC), 'B5 stale-fill guard: a reopened modal drops a prior async fill');
  ok(/d\.confirm\.textContent = str\(opts\.confirmLabel\)/.test(MC), 'B6 per-action confirm label wired');
  // no broad-cache RESTORE, no getOperationDb, no write/formula introduced in the modal.
  ok(!/_opDbCache\s*=|getOperationDb\b|loadOperationDb/.test(MC), 'B7 modal never restores/loads the broad Operation DB');
  ok(!/KMREC|generate(Inventory|OrderPlanning)Recommendation|calculateGap|allocate[A-Z]|appendRow|setValues/.test(MC), 'B8 modal invents NO recommendation/gap/allocation/write (pure scope picker)');

  // ===============================================================================================================
  section('AI Plan vs Recalculate — distinct workflows (distinct labels + distinct terminal handlers)');
  ok(/confirmLabel: action === 'aiplan' \? 'Generate AI Plan' : 'Recalculate Scope'/.test(INV_JS), 'C1 Inventory: distinct confirm label per action');
  ok(/confirmLabel: action === 'aiplan' \? 'Generate AI Plan' : 'Recalculate Scope'/.test(RO_JS), 'C2 Order Planning: distinct confirm label per action');
  // terminal handlers remain distinct: aiplan → handleReplenAiPlan (KMREC display), recalc → CURRENT_SCOPE gap job.
  ok(/if \(action === 'aiplan'\)[\s\S]{0,120}handleReplenAiPlan\(scope\)/.test(INV_JS), 'C3 Inventory aiplan → handleReplenAiPlan (distinct from recalc)');
  ok(/handleRecalcAllInventoryGap\(\{ mode: 'CURRENT_SCOPE'/.test(INV_JS), 'C4 Inventory recalc → CURRENT_SCOPE gap job (distinct terminal action)');

  // ===============================================================================================================
  section('HALT boundary — AI Plan writes NO allocation draft (AI_PLAN_ALLOCATION_AUTHORITY_NOT_DEFINED preserved)');
  var aiStart = INV_JS.indexOf('function handleReplenAiPlan(');
  var aiEnd = INV_JS.indexOf('window.handleReplenAiPlan', aiStart);
  ok(aiStart !== -1 && aiEnd !== -1, 'D0 located handleReplenAiPlan body');
  var aiBody = INV_JS.slice(aiStart, aiEnd);
  ok(!/upsertShippingAllocationDraft|shipping_allocation_draft/.test(aiBody), 'D1 AI Plan writes NO shipping_allocation_draft (no invented allocation generation)');
  ok(!/createShippingPlansBatch|submitReplenishmentPlans|createShipment/.test(aiBody), 'D2 AI Plan creates NO shipping plan / shipment (no auto-apply)');
  ok(!/upsertRequestOrderAllocationDraft|request_order_allocation_draft/.test(aiBody), 'D3 Inventory AI Plan does NOT touch procurement (Request Order) draft tables (domain boundary held)');

  // ===============================================================================================================
  section('reference owner unchanged (BEFORE==AFTER universe) + cache token bumped');
  ok(/getMarketplaceReference = function\(\)/.test(DBAPI) && /getOperationDbTableFromSheet\('marketplaces'\)/.test(DBAPI), 'E1 getMarketplaceReference still the bounded getTable(marketplaces) owner (no new API/route)');
  ok(/scope-select-modal\.js\?v=f1-7n-cold-ref-20260819/.test(INDEX), 'E2 index.html cache token bumped so the changed modal refetches');
  ok(MOD._version === 'f1-7n-cold-ref-r1', 'E3 modal version tag bumped');

  console.log('\n----------------------------------------');
  console.log('AI PLAN / RECALC SCOPE WIRING (F1-7N): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
