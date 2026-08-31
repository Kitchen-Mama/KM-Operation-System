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
  // F1-7N-FB-4C — REWRITTEN. This section proved that the modal's OWN marketplace resolver preferred a scoped
  // reference read over the broad `_opDbCache`, and fell back to the broad getter when that read was empty,
  // rejected, or unavailable.
  //
  // That resolver is GONE, because the fallback chain was the live defect: on a cold session the broad getter
  // returns [], a rejection was swallowed into the same [], and filling the select from [] renders
  // "Select country…" and nothing else — AN EMPTY SELECT PRESENTED AS SUCCESS. The user could not tell "nothing
  // is configured" from "the read failed", which is precisely the reported symptom (a blank Country list in the
  // AI Plan modal while the main page's list was populated).
  //
  // The modal now shares the ONE canonical slim-registry authority with the Site Inventory filter row. The
  // replacement assertions are strictly stronger: no broad-cache fallback exists at all, and EMPTY and ERROR are
  // separate terminal states that cannot be mistaken for one another or for success.
  section('SINGLE CANONICAL SOURCE — the shared slim scope registry, with no broad-cache fallback');
  var SREG = require(require('path').join(__dirname, '..', 'js', 'core', 'scope-registry.js'));
  var MODAL_SRC = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'utils', 'scope-select-modal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  ok(typeof MOD._resolveMarketplacesAsync === 'undefined',
    'A1 the modal no longer owns a private marketplace resolver');
  ok(!/getMarketplaceReference/.test(MODAL_SRC), 'A2 it no longer issues a whole-table marketplaces read');
  ok(!/KM\.DB\.getMarketplaces/.test(MODAL_SRC), 'A3 and no longer seeds from the broad _opDbCache getter');
  ok(/KM\.scopeRegistry/.test(MODAL_SRC), 'A4 it reads the ONE shared slim registry instead');
  ok(typeof MOD._registry === 'function', 'A5 exposing that authority for inspection');

  // EMPTY and ERROR are distinct, and neither is success — proved by executing the shared authority.
  var sEmpty = await SREG.create({ read: function () { return Promise.resolve({ success: true, data: { marketplaces: [], empty: true } }); } }).ensureLoaded();
  ok(sEmpty.status === 'EMPTY', 'A6 an EMPTY registry resolves EMPTY — a real configuration answer');
  var sErr = await SREG.create({ read: function () { return Promise.resolve({ success: false, error: { code: 'DEPLOYMENT_CONTRACT_MISMATCH', message: 'stale' } }); } }).ensureLoaded();
  ok(sErr.status === 'ERROR' && sErr.error.code === 'DEPLOYMENT_CONTRACT_MISMATCH',
    'A7 a FAILED read resolves ERROR and KEEPS its code — it can never masquerade as "nothing configured"');
  var sRej = await SREG.create({ read: function () { return Promise.reject(new Error('net')); } }).ensureLoaded();
  ok(sRej.status === 'ERROR', 'A8 a REJECTION is ERROR too — never silently downgraded to an empty list');
  var sNone = await SREG.create({ read: function () { return Promise.resolve(null); } }).ensureLoaded();
  ok(sNone.status === 'ERROR', 'A9 and a missing response is ERROR — the promise still settles, never hangs');

  // ===============================================================================================================
  section('open() paints from the shared registry — zero requests when it is already loaded');
  ok(/_loadScopes\(prefill, false\)/.test(MC), 'B1 open() resolves its options through the shared registry');
  ok(/reg\.isReady\(\)/.test(MC), 'B2 and paints straight from the cache when it is already resolved (0 requests)');
  // The broad-cache "warm seed" is deliberately GONE: it is what let an unprimed cache render as an empty
  // Country list. The instant-populate benefit is preserved WITHOUT it, because the shared registry keeps its own
  // resolved model and the modal paints from that cache synchronously when it is ready.
  ok(!/getMarketplaces\(\)/.test(MC), 'B3 the broad-cache warm seed is gone — one source, no silent empty');
  ok(/_applyList\(\(snap0\.model && snap0\.model\.getMarketplaces\) \|\| \[\], prefill\)/.test(MC),
    'B3b instant populate is preserved by painting from the shared registry cache');
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
  ok(/scope-select-modal\.js\?v=fb4c-shared-registry-20260826/.test(INDEX), 'E2 index.html cache token bumped so the changed modal refetches');
  // F1-7N-FB-4E-R4B-R1 - a monotonic floor, not a pinned literal. R4B-R1 gave the modal an onCancel contract
  // (a dismissed modal is an OUTCOME and the caller had no way to learn about it), which is a real source change
  // and therefore a real version bump. Pinning the string made that bump read as a regression.
  var _MODAL_VERSIONS = ['f1-7n-fb-4c-shared-registry-r1', 'f1-7n-fb-4e-r4b-r1-cancel-reported'];
  var _MODAL_FLOOR = _MODAL_VERSIONS.indexOf('f1-7n-fb-4c-shared-registry-r1');
    ok(_MODAL_VERSIONS.indexOf(MOD._version) >= _MODAL_FLOOR,
    'E3 modal version tag is at or after the shared-registry round, and is a KNOWN version (' + MOD._version + ')');

  console.log('\n----------------------------------------');
  console.log('AI PLAN / RECALC SCOPE WIRING (F1-7N): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
