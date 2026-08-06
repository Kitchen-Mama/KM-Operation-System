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
