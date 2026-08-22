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

// F1-7N-FA-3C-R6D1 — Inventory AI Plan DB-generation feature flag (backend owner-of-record). DEFAULT OFF. When false
// (the R6D1 staged state), the Inventory "Generate AI Plan" button keeps its existing page-state-only behavior and
// performs NO DB write — deploying R6D1 changes NO live behavior. When true (set ONLY for the USER-owned controlled
// Stage-3 verification, after the generation→hydration reconciliation gaps are closed), the manual button routes to the
// canonical 61_ weeklyAiPlan.generate writer (shipping_allocation_drafts / _lines). The frontend mirrors this via
// KM.api.inventoryAiPlanDbGenerationEnabled() (km-api-foundation.js) — ONE logical flag, same value across layers.
// Reversible: set back to false to restore the page-state-only behavior exactly. Affects Inventory only.
var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;
function inventoryAiPlanDbGenerationEnabled_() { return INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ === true; }
