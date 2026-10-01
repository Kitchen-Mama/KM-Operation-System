// ==========================================================================================================
// BOOT TOPOLOGY — the declared boot script census, and the invariants that defend it.
// ==========================================================================================================
//
// S4-R5 moved two large route payloads off the boot path (Inventory Replenishment, 947 KB; the globe family,
// 809 KB across eight files) and wrote a gate to stop them coming back. That gate ended up defending the
// achievement's SIZE instead of its SHAPE, and the difference finally mattered:
//
//   · S4-R6 replaced `eq(live.bytes, recorded.bytes)` because it "FAILED THE FIRST TIME ANYBODY FIXED A
//     BUG", and promised the replacement meant "a bug fix changes neither" the script set nor the ceiling.
//   · The replacement was an aggregate historical floor: boot must stay 1.5 MB below the pre-S4-R5 total.
//     By S7-R2B that floor had 58 bytes of headroom, so the promise was false by 58 bytes and a two-line
//     repair to a blocking defect in a boot-loaded file could not land.
//   · Worse, the SET guard everyone believed in was not running. A1d reads
//     `M.boot.post.local ? <set comparison> : <count comparison>`, and S4-R5 never recorded `post.local`.
//     The live gate was `localCount === 67`: swapping one boot script for another passed.
//
// S7-R2B1 re-encodes the gate around topology. The claims below are about WHICH files boot and whether any
// route-owned file has crept back — not about how many bytes any approved owner happens to weigh. Boot
// payload SIZE remains a real concern and is reported by every caller, but it is S8's to budget:
// S8_BOOT_PAYLOAD_HEADROOM_AND_LOADING_ARCHITECTURE.
//
// TO UPDATE after a deliberate boot change (adding, removing or reordering a <script src> in index.html):
//   node -e "var R=require('./assets/tests/_s4r5-route-payload-runner.js');\
//            console.log(R.bootSurface().local.map(function(f){return f.file;}).join('\n'))"
// and paste the result below, IN INDEX ORDER. A census nobody recomputes is a census that drifts; a census
// that must be edited by hand is the point — the edit is the declaration.
// ==========================================================================================================

'use strict';

// The 67 local <script src> tags index.html loads at boot, in the order it loads them. ORDER IS PART OF THE
// CONTRACT: several suites depend on specific pairs loading in sequence (a consumer after its provider), and
// S4-R5's own A1d sorted both sides, so a reordering was invisible to it.
var BOOT_SCRIPTS = [
  "assets/js/core/namespace.js",
  "assets/js/core/lifecycle.js",
  "assets/js/core/state.js",
  "assets/js/core/partial-loader.js",
  "assets/js/core/script-loader.js",
  "assets/js/core/deferred-read.js",
  "assets/js/pages/home.js",
  "assets/js/core/sticky-header.js",
  "assets/js/utils/forecast-engine.js",
  "assets/js/utils/i18n.js",
  "assets/js/utils/km-repo-asset-manifest.js",
  "assets/js/utils/km-image-reference-policy.js",
  "assets/js/utils/sku-overrides.js",
  "assets/js/utils/data.js",
  "assets/js/utils/scroll-sync.js",
  "assets/js/utils/template-export.js",
  "assets/js/utils/resizable-columns.js",
  "assets/js/utils/dual-layer-resize.js",
  "assets/js/utils/tab-rail.js",
  "assets/js/utils/multi-select-filter.js",
  "assets/js/utils/inventory-compat.js",
  "assets/js/utils/gap-recalc-transport.js",
  "assets/js/core/scope-registry.js",
  "assets/js/core/boot-read-arbiter.js",
  "assets/js/core/method-registry.js",
  "assets/js/core/supply-planning-active-route-classification.js",
  "assets/js/utils/scope-select-modal.js",
  "assets/js/core/supply-planning-factory-site-allocation.js",
  "assets/js/core/supply-planning-forecast-share.js",
  "assets/js/core/supply-planning-calculations.js",
  "assets/js/core/supply-planning-planning-demand.js",
  "assets/js/core/supply-planning-recommendation-audit.js",
  "assets/js/core/supply-recommendation.js",
  "assets/js/core/supply-execution-handoff.js",
  "assets/js/api/km-transport.js",
  "assets/js/api/km-data-access.js",
  "assets/js/api/operation-system-db-api.js",
  "assets/js/api/km-loading-state.js",
  "assets/js/api/km-api-foundation.js",
  "assets/js/api/km-product-pricing-workspace.js",
  "assets/js/api/km-product-pricing-adapter.js",
  "assets/js/data/replenishment-mock-data.js",
  "assets/js/pages/factory-stock.js",
  "assets/js/pages/overseas-stock.js",
  "assets/js/pages/overseas-ops-preview.js",
  "assets/js/pages/overseas-inbound.js",
  "assets/js/pages/overseas-outbound.js",
  "assets/js/pages/fc-summary.js",
  "assets/js/pages/forecast.js",
  "assets/js/pages/request-order.js",
  "assets/js/pages/sku-details.js",
  "assets/js/pages/shipping-plan.js",
  "assets/js/pages/shipping-history.js",
  "assets/js/pages/supplychain.js",
  "assets/js/pages/sku-handbook.js",
  "assets/js/i18n/sku-handbook.js",
  "assets/js/pages/campaign-risk.js",
  "assets/js/pages/request-order-draft.js",
  "assets/js/pages/purchase-order-overview.js",
  "assets/js/pages/purchase-order-list.js",
  "assets/js/pages/carrier-rate-card.js",
  "assets/js/product-strategy/psb-views.js",
  "assets/js/pages/sku-regional-pricing.js",
  "assets/js/pages/sku-regional-details.js",
  "assets/js/data/world-land-110m.js",
  "assets/js/pages/automation-schedule.js",
  "assets/js/app.js"
];

// Derive the live topology from index.html + app.js and compare it to the declaration above. Pure: the
// caller supplies the sources and the file sizes, so this module reads nothing itself.
//   live        — [{ file, bytes, defer }] in index order, from _s4r5-route-payload-runner.bootSurface()
//   routeAssets — the files app.js declares as ROUTE assets (KM_ROUTE_ASSETS_)
function bootTopology(live, routeAssets) {
    var files = (live || []).map(function (x) { return x && x.file; });
    var declared = {}; BOOT_SCRIPTS.forEach(function (f) { declared[f] = 1; });
    var seen = {}; files.forEach(function (f) { seen[f] = 1; });
    // A boot script nobody declared. This is how a new file reaches every operator's first paint unnoticed.
    var undeclared = files.filter(function (f) { return !declared[f]; });
    // A declared boot script that is gone. Something the shell depends on may have stopped loading.
    var missing = BOOT_SCRIPTS.filter(function (f) { return !seen[f]; });
    // A ROUTE-owned file that is also at boot — the exact regression S4-R5 exists to prevent, checked
    // against the WHOLE route registry rather than against the nine files that round happened to move.
    var routeAtBoot = (routeAssets || []).filter(function (f) { return seen[f]; });
    // Order drift, reported as the first position where the live sequence leaves the declared one.
    var orderDrift = 0;
    if (!undeclared.length && !missing.length) {
        for (var i = 0; i < BOOT_SCRIPTS.length; i++) { if (files[i] !== BOOT_SCRIPTS[i]) { orderDrift++; } }
    }
    var bytes = 0;
    (live || []).forEach(function (x) { if (x && x.bytes > 0) bytes += x.bytes; });
    return {
        declaredCount: BOOT_SCRIPTS.length,
        liveCount: files.length,
        undeclared: undeclared,
        missing: missing,
        setChangeCount: undeclared.length + missing.length,
        routeAtBoot: routeAtBoot,
        orderDriftCount: orderDrift,
        bytes: bytes
    };
}

module.exports = { BOOT_SCRIPTS: BOOT_SCRIPTS, bootTopology: bootTopology };
