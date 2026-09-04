// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 00_config.gs — global constants / spreadsheet IDs / enums
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

var VALID_LIFECYCLES_ = ['Upcoming SKU', 'Running in the Market', 'Phasing Out', 'Closure', 'Other'];

var VALID_REPLENISHMENT_MODELS_ = ['sales_driven', 'forecast_driven'];
var VALID_MARKETPLACE_SKU_STATUSES_ = ['active', 'phasing_out', 'inactive', 'discontinued'];

var AMAZON_DESTINATION_SPREADSHEET_ID_ = '1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk';

// Production Safety Round S0 / S0.5 (RULE S0-5) — the ONE canonical bound-database Spreadsheet the active
// production Runtime (Shipping / Procurement / Inventory / Forecast-FC / Recommendation) is authorized to touch.
// Intentionally EMPTY: every gated entrypoint fails closed (WRONG_SPREADSHEET_TARGET) until this is set. The next
// verification round must paste the DUPLICATED verification-copy id here first (never Production) per the
// verification-copy plan — this gate is what makes "wrong spreadsheet" impossible. Amazon import keeps its own
// AMAZON_DESTINATION_SPREADSHEET_ID_ above (a proven-separate destination database, RULE S0-5 exception).
var PRODUCTION_DB_SPREADSHEET_ID_ = '1EMe9l6ow0-OZkNY9ZP6IxHk84YGs5bqD5nVKHOPt-Kk';

// Recommendation targets the same canonical bound database (S0.5 unifies the id — no separate per-domain ids).
var RECOMMENDATION_TARGET_SPREADSHEET_ID_ = PRODUCTION_DB_SPREADSHEET_ID_;

// F1-7N-FA-3C-R2b-2 / R6E1 — MONTHLY_ORDER flat V2 cutover flag. PERMANENTLY TRUE (production cutover COMPLETE). The
// USER-owned R4 cutover has provisioned the flat request_order_allocation_drafts schema (53 V2 headers) and deployed
// the R2b-3 frontend; this source mirror is aligned to the live posture. MONTHLY_ORDER generation + readback route
// through the KMRDV2/KMRDV2P flat SHAPE ADAPTER (ONE 53-col row per request order, no child lines) — the canonical
// authority table is request_order_allocation_drafts. This must NEVER revert to false / the legacy line-oriented
// authority during an unrelated deployment: a flip to false would silently point the runtime at the retired legacy
// engine against the live 53-column table. The flat path still fails closed against a non-V2 schema (defense in depth).
// WEEKLY_SHIPPING never reads this flag. R6E1 note: any frontend that must know the effective authority reads it via
// the getClientCapabilities transport (03_ handleGetClientCapabilities_ → KM.api) and FAILS CLOSED to FLAT_V2 if it cannot be
// determined — never silently selecting legacy against the canonical 53-column table.
var REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true;
function requestOrderDraftV2FlatCutoverEnabled_() { return REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ === true; }

// F1-7N-FA-3C-R6E-P0 — Request Order "Site Confirm required" feature flag (backend owner-of-record). DEFAULT-OF-RECORD
// is TRUE; temporarily FALSE this round (USER-authorized) so the Request Order Send push flow can be tested without a
// prior Site Confirm. The Site Confirm gate is currently enforced FRONTEND-side (request-order.js handleSendRequest);
// the frontend reads the MIRRORED capability KM.api.requestOrderSiteConfirmRequired() (km-api-foundation.js) — keep both
// in sync (ONE logical flag, same value). If a backend Send gate is later added it MUST read requestOrderSiteConfirmRequired_()
// so there is a single authority. Set back to true to restore the original Site Confirm requirement exactly. Reversible;
// affects Request Order ONLY — never Weekly Shipping Plan / shipping allocation / Shipment Draft / any other Submit rule.
var REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ = false;
function requestOrderSiteConfirmRequired_() { return REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ === true; }

// F1-7N-FA-3C-R6D1 — Inventory AI Plan DB-generation feature flag (backend owner-of-record). It gates ONE
// thing: whether the manual "Generate AI Plan" click may route to the canonical 61_ weeklyAiPlan.generate writer
// (shipping_allocation_drafts / _lines). It does NOT gate the route allocator — KMWRR computes the same
// recommendation either way — so with the flag OFF the recommendation half still runs and the execution half
// answers INVENTORY_AI_PLAN_DB_GENERATION_DISABLED with zero rows written.
//
// F1-7N-FC-1B-E3 §E.4 — set to TRUE, USER-AUTHORIZED. Everything downstream of the flag was already
// complete and Node-verified (route derivation and K2 partition via KMWRR, the atomic Header+Lines write through
// the SAME endpoint and identity a manual save uses, the readback hydrate, and the supersede/expire lifecycle).
//
// F1-7N-FC-1B-E3-R1 §H.3/§H.4 — **REVERTED TO FALSE.** The flag was not the last thing between the
// button and the write after all. A read-only census of the live scope answered
// HARVEST_NOT_READY: the canonical (company,country) fact harvest produces ZERO receivers, because every site
// is dropped for an incomplete regular-forecast basis, so there is nothing for the allocator to rank. E3-R1
// fixes the DIAGNOSIS of that refusal in four places — it does not and cannot fix the underlying facts,
// which live in the operator's data.
//
// §H.4 forbids releasing flag=true alongside HARVEST_NOT_READY, and flag=true is ALREADY on origin/main, so
// a report saying "do not deploy" would not have been enough on its own. false is also the more truthful of the
// two states today: with it true a Generate click reaches the server and returns HARVEST_NOT_READY; with it
// false the page states EXECUTION_MATERIALIZATION_NOT_ENABLED. Both are visible after E3; only one of them
// describes why no plan can be written.
//
// TO RE-ACTIVATE: re-run TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3 for the intended scope, confirm verdict
// PROCEED (which requires a complete route the allocator actually produced), set this back to true, and publish
// a NEW deployment version. Not before.
//
// §E.5 — THE FLAG IS NOT REMOVED, because it is the rollback switch. ROLLBACK IS TWO STEPS AND BOTH ARE
// THE USER'S: set this back to false, then publish a NEW Apps Script deployment version (an edited file that is
// not deployed changes nothing). No frontend change is needed to roll back — the page mirrors this value
// through KM.api.inventoryAiPlanDbGenerationEnabled() and states EXECUTION_MATERIALIZATION_NOT_ENABLED, visibly,
// when it reads false. The effective value is reportable at any time from system.health as
// `inventory_ai_plan_db_generation_enabled` (63_), so "is it on in the deployment that is actually answering"
// is a question with an answer instead of an inference from behaviour.
//
// The frontend MIRROR default stays fail-safe FALSE on purpose (km-api-foundation.js): if the capability
// transport cannot be read, the page must not offer a write it cannot confirm the server accepts. That is a
// deliberate asymmetry, not a drifted copy of this value.
var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;
function inventoryAiPlanDbGenerationEnabled_() { return INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ === true; }

// F1-7N-FC-1B-E3-R4-A2-R1 §9 — THE FLAG IS TOO BLUNT TO TURN ON.
//
// `INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_` is global. Flipping it to true does not enable a controlled
// single-scope trial; it enables materialization for EVERY company, country, marketplace and SKU at once, and
// the first controlled run and a 495-scope production write become the same gesture. That is not a risk worth
// taking to test one SKU.
//
// So activation is TWO conditions, not one: the flag must be true AND the scope must be named here. The
// allowlist is SERVER-OWNED config in the same file as the flag, which means a browser cannot widen it, a
// request payload cannot widen it, and widening it is a deployment with a diff. ALL_SITES is unreachable by
// construction: the entries are exact four-part scopes and there is no wildcard.
//
// An empty allowlist means NOTHING is enabled, even with the flag true. Fail-closed is the only safe default
// for a list whose purpose is to be narrow.
var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = [
  { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' }
];

// Exact, case-sensitive, four-part match. No wildcard, no prefix, no "ALL", no empty-means-any.
function inventoryAiPlanScopeEnabled_(company, country, marketplace, sku) {
  var c = String(company == null ? '' : company).trim();
  var k = String(country == null ? '' : country).trim();
  var m = String(marketplace == null ? '' : marketplace).trim();
  var s = String(sku == null ? '' : sku).trim();
  if (!c || !k || !m || !s) return false;                 // an incomplete scope is never enabled
  if (/^all(_sites)?$/i.test(m) || /^all(_sites)?$/i.test(s)) return false;   // ALL_SITES can never be enabled
  var list = INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ || [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    if (String(e.company) === c && String(e.country) === k
      && String(e.marketplace) === m && String(e.sku) === s) return true;
  }
  return false;
}

// The allowlist as reported by health/diagnostics: the SCOPES, which are business identifiers and not secrets,
// plus the count. No spreadsheet id, no url, no key.
function inventoryAiPlanActivationAllowlist_() {
  var out = [];
  var list = INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ || [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    out.push({ company: String(e.company || ''), country: String(e.country || ''),
      marketplace: String(e.marketplace || ''), sku: String(e.sku || '') });
  }
  return out;
}

// F1-7N-FC-1B-E3 §E.9 — 00_config.gs had no build stamp, so it was the ONE owner file whose sync state
// the deployment manifest could not report: a project still running the previous copy of this file would answer
// with the flag OFF while the repository said ON, and nothing would have named the difference. It is stamped and
// registered in 63_'s module manifest now, which makes a partial sync of the CONFIG a mixed_deployment fault
// like any other.
var CONFIG_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R1';
