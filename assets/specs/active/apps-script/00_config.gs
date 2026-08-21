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

// F1-7N-FA-3C-R2b-2 — MONTHLY_ORDER flat V2 cutover flag. DEFAULT OFF. When false (the only supported state until
// the USER-owned R4 cutover has provisioned the 53-col flat request_order_allocation_drafts schema and deployed the
// R2b-3 frontend), MONTHLY_ORDER generation + readback stay on the EXISTING line-oriented engine — live behavior is
// unchanged even if this bundle is synced for an unrelated reason. When true (set ONLY at R4), MONTHLY_ORDER routes
// through the KMRDV2/KMRDV2P flat SHAPE ADAPTER (ONE 53-col row, no child lines). WEEKLY_SHIPPING is never affected
// either way (it never reads this flag). The flat path fails closed against a non-V2 schema, so an early flip never
// corrupts data — but the flag must remain OFF until R4 so users' MONTHLY AI Plan is never interrupted.
var REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = false;
function requestOrderDraftV2FlatCutoverEnabled_() { return REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ === true; }
