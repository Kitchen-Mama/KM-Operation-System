/**
 * 60_api_v1_inventory_replenishment_workspace.gs
 * Kitchen Mama Operation System — API v1 · Inventory Replenishment READ-ONLY Workspace (Phase API / F1-7I).
 *
 * SOURCE MIRROR / requires Apps Script sync. The scoped read owner for the active Inventory Replenishment page primary
 * render (inventory-replenishment.js `_getCloudReplenishmentData` main table). Action = "inventoryReplenishment.workspace.get"
 * (a body-carrying READ, no write).
 *
 * SCOPE — PRIMARY-RENDER READ MODEL / COMPOSER ONLY. Reads ONLY the table set the page's main-table assembly consumes
 * (the 19 tables `_getCloudReplenishmentData` reads via its local get()) — never getOperationDb. It is the LARGEST
 * workspace because the Inventory Replenishment main table is genuinely a broad read model; it still bounds the read to
 * exactly this page's tables (19) instead of the ~44-tab getOperationDb, and removes the page's global-cache dependency.
 *   marketplaces, marketplace_skus, sku_details, warehouses                         (identity / master / scope)
 *   amazon_inventory_snapshot, amazon_inventory_health_snapshot,
 *   amazon_daily_sales_snapshot, amazon_weekly_sales_snapshot                        (site stock + sales velocity + LTS)
 *   fc_regular_forecast, fc_target_rules, fc_special_events                          (forecast context)
 *   overseas_inventory_snapshot, factory_stock                                        (3PL + factory pools)
 *   shipments, shipment_lines, shipping_plans, shipping_plan_lines                    (incoming reconstruction + lineage)
 *   shipping_allocation_drafts, shipping_allocation_draft_lines                       (existing draft context in the row)
 *
 * NOT served here (they stay on their EXISTING separate scoped owners — this workspace does NOT duplicate them):
 *   Inventory Gap        → inventoryReplenishmentGap.get (43_/46_)      [canonical planning fact, read verbatim]
 *   Recommendation       → recommendation.workspace.get (42_)           [canonical planning fact]
 *   Allocation-draft SSOT→ getShippingAllocationDraftWorkspace (16_)    [scoped working-draft readback]
 *
 * AUTHORITY — reads only; authors NO business logic and NO write side effects. It runs NO Gap, NO Recommendation, NO
 * inventory allocation, NO Open-PO-Remaining, NO FIFO, NO PO shipped/remaining, and creates NO Request Order / Purchase
 * Order (FLOW-A boundary: Inventory Gap → Recommendation → Shipping Plan → Shipment, never Request Order). It does NOT
 * initialize Factory Stock (that stays with master-SKU creation) and does NOT change the marketplace-SKU trigger boundary.
 * The incoming-inventory reconstruction (MAX(0, shipment_qty − shipment_received_qty) + ETA bucketing + shipping-plan
 * lineage receiver attribution) stays PRESENTATION-SIDE over these raw rows (a documented deferred authority item,
 * INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED) — this workspace only transports the persisted rows verbatim.
 *
 * FULL-SET (NOT server-filtered) BY DESIGN — BEFORE == AFTER. The page derives its scope (Country + Marketplace →
 * Company) and filters/assembles per-SKU rows CLIENT-side; reproducing that scope filter server-side would risk drift.
 * So the workspace returns raw passthrough of the tables (bounded by a non-silent `capped` backstop) and the client
 * assembly runs unchanged. (Server-side scope reduction is a documented future optimization, not this transport round.)
 *
 * Testability: pure `sirWorkspaceBuild_` is a `function` declaration (extract+eval friendly). The impure orchestrator
 * `handleInventoryReplenishmentWorkspaceGet_(body, io)` takes an injectable `io` so it runs against fixtures with ZERO
 * SpreadsheetApp.
 */

// F1-7N-FC-1B-E3-R4-A1 §A1 — 60_ HAD NO BUILD STAMP, AND THAT IS NOW A REPORTABLE RISK.
//
// This file was pure passthrough until R4, so nothing depended on WHICH version answered. It does now: a
// deployment carrying the pre-R4-A1 60_ ignores `payload.recentWindow` and `payload.only` SILENTLY — it
// returns all twenty-one tables and reports no echo — while the browser believes it asked for two. That is
// precisely the shape of failure this round spent its evidence on, and it must be a named fault rather than a
// number someone has to notice is too large.
// S8-R4B-2D - R42. THIS FILE GAINED A REQUEST CONTRACT, SO A DEPLOYMENT THAT DOES NOT CARRY IT IS NOW A
// NAMED FAULT RATHER THAN A QUIET ONE. A pre-R42 60_ ignores `payload.siteScope` SILENTLY and returns every
// site's exposure rows while the browser believes it asked for one - the same shape of failure the R4-A1
// paragraph above was written for, and the reason that paragraph exists is that it already happened once.
// S8-R4D-C - R43. THE READ PATH NOW MAKES ONE RANGE READ PER TABLE INSTEAD OF TWO OR THREE. No request
// field, no response field and no business rule changed; the only observable difference is how long the
// handler takes and how many Spreadsheet calls the execution log shows. That makes a pre-R43 60_ a
// PERFORMANCE difference rather than a wrong answer - which is why this stamp matters for a DIFFERENT reason
// than R42's did: R42 told you a stale copy would lie to you, R43 tells you a stale copy is merely slow, and
// an acceptance that cannot tell the two deployments apart cannot attribute the measurement it just took.
var SIR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R45';

var SIR_WS_SEQ_ = 0;   // API diagnostic-layer server correlation counter (not business runtime)

// Structural masters fail-closed on missing schema; the data/snapshot/import tables are missing-safe ([] when absent —
// matching the browser's `_opDbCache.X || []` graceful-empty, so an unprovisioned import tab never spuriously errors).
var SIR_WORKSPACE_TABLES_ = [
  { name: 'marketplaces',                    requiredCols: ['marketplace_id'] },
  { name: 'marketplace_skus',                requiredCols: ['sku'] },
  { name: 'sku_details',                     requiredCols: ['sku'] },
  { name: 'warehouses',                      requiredCols: ['warehouse_id'] },
  { name: 'amazon_inventory_snapshot',        requiredCols: [], optional: true },
  { name: 'amazon_inventory_health_snapshot', requiredCols: [], optional: true },
  { name: 'amazon_daily_sales_snapshot',      requiredCols: [], optional: true },
  { name: 'amazon_weekly_sales_snapshot',     requiredCols: [], optional: true },
  { name: 'fc_regular_forecast',             requiredCols: [], optional: true },
  { name: 'fc_target_rules',                 requiredCols: [], optional: true },
  { name: 'fc_special_events',               requiredCols: [], optional: true },
  { name: 'overseas_inventory_snapshot',      requiredCols: [], optional: true },
  { name: 'factory_stock',                   requiredCols: [], optional: true },
  { name: 'shipments',                       requiredCols: [], optional: true },
  { name: 'shipment_lines',                  requiredCols: [], optional: true },
  { name: 'shipping_plans',                  requiredCols: [], optional: true },
  { name: 'shipping_plan_lines',             requiredCols: [], optional: true },
  { name: 'shipping_allocation_drafts',       requiredCols: [], optional: true },
  { name: 'shipping_allocation_draft_lines',  requiredCols: [], optional: true },
  // F1-7J-A2: carrier reference tables for the SECONDARY Execution-Plan panel (ETA + method options). INCLUDE-gated
  // ('carrierPlanning') + missing-safe — NOT read on the primary render (no read cost, base payload unchanged) unless
  // the caller sets include.carrierPlanning. Reference data only; the workspace authors NO carrier selection/booking.
  { name: 'carrier_lead_times', requiredCols: [], optional: true, include: 'carrierPlanning' },
  { name: 'carrier_rate_cards', requiredCols: [], optional: true, include: 'carrierPlanning' }
];

// Generous safety backstop. In real data these tables are well under this; the cap only guards a runaway payload and is
// reported via `capped` so truncation is NEVER silent (would break BEFORE==AFTER).
var SIR_WS_ROW_MAX_ = 80000;

// --------------------------------------------------------------------------------------------------------
// F1-7N-FC-1B-E3-R4 §C/§D — THE RECENT-PERIOD PROJECTION.
//
// THE MEASURED ROOT CAUSE OF THE FIRST-LOAD TIMEOUT IS THAT THIS READ HAS NO BOUND ON TIME.
//
// The request carries no scope and this handler has no scope parameter: every call reads twenty-one whole
// sheets and returns every row raw. Naming a company/country/marketplace/sku in the payload changes nothing.
// Two of those tables are the only ones that grow without limit — they gain rows every day forever — and
// they are the two whose consumers read only a recent tail:
//
//   * amazon_daily_sales_snapshot  -> IR.salesTrend7d, which uses exactly SEVEN calendar dates ending on the
//     LATEST date present for that scope. Everything older is read, transferred, parsed and discarded.
//   * amazon_weekly_sales_snapshot -> IR.avgSalesPerDay / IRCountry.weeklyUnits7d, which use the LATEST WEEK
//     row per market and nothing else.
//
// So this keeps, PER SCOPE KEY, that key's own most recent periods — fourteen dates and four weeks, both
// comfortably above the seven days and one week the consumers actually read. The window is per KEY, not an
// absolute date cut, and that is the whole reason the result is unchanged: salesTrend7d anchors on each
// scope's OWN latest date, so a site whose data stopped six months ago still gets its own seven days. An
// absolute cut would have silently emptied that chart, which is exactly the kind of quiet wrongness this
// must not trade for speed.
//
// EQUIVALENCE, stated so it can be checked rather than trusted: for any scope, the rows the consumers read
// are a subset of the last 7 dates / last 1 week of each contributing key, and 14 >= 7 and 4 >= 1. The EU
// roll-up sums member markets, each anchored on its own latest week, so per-key retention covers it too; a
// member whose latest date falls outside the union's seven-day window contributes nothing either way.
//
// IT IS OPT-IN AND IT IS REPORTED. A caller that does not ask for it gets today's payload byte for byte, and
// a caller that does gets `meta.recentWindow` naming the rows dropped per table. A reduction nobody can see
// is indistinguishable from data loss.
var SIR_WS_RECENT_WINDOW_ = {
  amazon_daily_sales_snapshot:  { keyCols: ['company', 'country', 'marketplace', 'sku'], periodCols: ['snapshot_date'], keep: 14 },
  amazon_weekly_sales_snapshot: { keyCols: ['company', 'country', 'marketplace', 'sku'], periodCols: ['week_end_date', 'snapshot_week'], keep: 4 }
};

// F1-7N-FC-1B-E3-R4-A1 §A1 — READ FEWER TABLES, NOT MERELY RETURN FEWER ROWS.
//
// The live evidence changed what the expensive thing is. R4 assumed payload size, because the fixture said
// 101 319 rows; production returns 13 107 and still spends THIRTY-ONE SECONDS of server time doing it. Thirteen
// thousand rows do not take thirty-one seconds to serialize. The cost is opening the spreadsheet and calling
// getDataRange().getValues() twenty-one times, and no amount of trimming the response reaches it.
//
// `only` lets a caller name the tables it actually needs. It is opt-in and it is INTERSECTED with the existing
// include gate rather than replacing it, so a caller cannot use it to reach an include-gated table it did not
// also ask for. An unknown table name is ignored rather than erroring: the caller gets fewer tables, never a
// different contract, and the echo says exactly which ones were honoured.
//
// The FIRST beneficiary is the carrier catalogue. F1-7J-A2 gated the two carrier tables off the primary read;
// FB-4G-A1-R1 then merged them back ON to it, because the alternative at the time was a SECOND read of all
// nineteen other tables to obtain two small ones. With `only` that alternative no longer exists: the catalogue
// is two sheets, not twenty-one, so the merge can be undone and the primary render stops paying for reference
// data a collapsed row never displays.
function sirWsOnlyList_(payload) {
  var raw = (payload && payload.only);
  if (!raw || Object.prototype.toString.call(raw) !== '[object Array]' || !raw.length) return null;
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var n = sirWsStr_(raw[i]);
    if (n && out.indexOf(n) === -1) out.push(n);
  }
  return out.length ? out : null;
}
function sirWsOnlySet_(payload) {
  var list = sirWsOnlyList_(payload);
  if (!list) return null;
  var m = {};
  for (var i = 0; i < list.length; i++) m[list[i]] = true;
  return m;
}

// --------------------------------------------------------------------------------------------------------
// S8-R4B-2D §2/§7 — THE SITE SCOPE. A PER-SITE CACHE KEY IN FRONT OF AN ALL-SITE READ IS NOT A PER-SITE READ.
//
// R4B-2B gave the browser a per-Site exposure cache and the request that filled it carried no scope at all,
// so every Site was served every Site's rows and then told to keep them under its own key. The cache was
// per-Site; the DATA was not. This is the contract that makes the second half true.
//
// THE IDENTITY IS THE TRIPLE, NOT THE ID. None of the six exposure tables stores marketplace_id — all six
// store company / country / marketplace — so scoping on the id would force this handler to open the
// marketplaces master to translate it: a SEVENTH sheet read, at the 0.8-1.3 s per-sheet floor R4B-2 measured,
// to learn a triple the browser already holds. The browser's CACHE KEY keeps marketplace_id, because a map
// key and a request identity are allowed to differ and conflating them buys that read for nothing.
var SIR_EXPOSURE_TABLES_ = ['shipments', 'shipment_lines', 'shipping_plans', 'shipping_plan_lines',
  'shipping_allocation_drafts', 'shipping_allocation_draft_lines'];
var SIR_SITE_SCOPE_FIELDS_ = ['company', 'country', 'marketplace'];

// ========================================================================================================
// S8-R4D-E2 - THE FIRST-LAYER BATCH READ. R44.
//
// WHAT CHANGED. The thirteen first-layer tables are read with TWO remote calls instead of thirteen:
// Sheets.Spreadsheets.get for existence and width, then Values.batchGet for the values. Measured in
// Production over five alternating pairs: 22,006 ms -> 2,265 ms, 5/5, zero semantic diffs. The cost was
// never the payload - batchGet moves the same bytes in a tenth of the time - it is the SpreadsheetApp range
// bridge, and the only way past it is to stop crossing it thirteen times.
//
// WHAT DID NOT CHANGE. No request field, no response shape, no business rule, no action. The other eight
// tables this handler can read (the exposure family and the two carrier tables) stay on the per-sheet
// reader in this same file. Every other workspace file has its own private readTable and is untouched.
//
// THE PART THAT CAN SILENTLY CORRUPT. Under UNFORMATTED_VALUE + SERIAL_NUMBER a date and a number are the
// SAME wire value. SpreadsheetApp could tell them apart because the Sheet told it; batchGet cannot. The
// benchmark scored zero date diffs only because it asked the OLD reader which columns were Dates - an
// oracle this code does not have. So the map below is DECLARED, per column, and never inferred.
// ========================================================================================================

// The thirteen. Not a copy of SIR_WORKSPACE_TABLES_ - a deliberate, reviewable subset of it, so adding a
// table to the workspace does not silently enrol it in a batch whose date columns nobody declared.
var SIR_B1_TABLES_ = ['marketplaces', 'marketplace_skus', 'sku_details', 'warehouses',
  'amazon_inventory_snapshot', 'amazon_inventory_health_snapshot', 'amazon_daily_sales_snapshot',
  'amazon_weekly_sales_snapshot', 'fc_regular_forecast', 'fc_target_rules', 'fc_special_events',
  'overseas_inventory_snapshot', 'factory_stock'];

// THE DECLARED DATE MAP. 46 columns: 41 observed populated in the live census, plus 5 declared columns that
// are entirely blank today and would arrive as bare serials the day they are filled. Over-declaring a blank
// column is safe BECAUSE the coercion is type-gated (see sirWsApplyDateMap_); under-declaring is not, which
// is why the blanks are in.
//
// THIS MAP IS NOT DERIVED AND MUST NOT BE. Three live counter-examples, each of which breaks one shortcut:
//   fc_special_events.event_month              number 11 in a column named _month  -> a NAME heuristic
//                                              would convert it to 1900-01-10 and destroy every FC window
//   amazon_weekly_sales_snapshot.snapshot_week string '2026-09-21~2026-09-27'      -> likewise
//   overseas_inventory_snapshot.snapshot_date  100% blank                          -> a VALUE heuristic
//                                              cannot see it at all
// And the writers are not an authority either: fcWriteTimestamp_ returns a STRING and the cell holds a Date,
// because Sheets parses date-shaped strings on write. The SHEET decides the type, which is exactly why this
// map is a copy of a truth living elsewhere - and why sirWsDateMapDrift_ exists to notice when it rots.
var SIR_B1_DATE_MAP_VERSION_ = 'B1-DATE-MAP-R44-1';
var SIR_B1_DATE_MAP_ = {
  marketplaces:                     ['created_at', 'updated_at'],
  marketplace_skus:                 ['launch_date', 'created_at', 'updated_at'],
  sku_details:                      ['created_at', 'updated_at'],
  warehouses:                       ['created_at', 'updated_at'],
  amazon_inventory_snapshot:        ['snapshot_date', 'synced_at', 'created_at', 'updated_at'],
  amazon_inventory_health_snapshot: ['snapshot_date', 'synced_at', 'created_at', 'updated_at'],
  amazon_daily_sales_snapshot:      ['snapshot_date', 'synced_at', 'created_at', 'updated_at',
                                     'data_window_start_date', 'data_window_end_date', 'latest_source_date'],
  amazon_weekly_sales_snapshot:     ['snapshot_month', 'week_start_date', 'week_end_date', 'synced_at',
                                     'created_at', 'updated_at'],
  fc_regular_forecast:              ['created_at', 'updated_at'],
  fc_target_rules:                  ['created_at', 'updated_at'],
  fc_special_events:                ['event_start_date', 'event_end_date', 'created_at', 'updated_at'],
  overseas_inventory_snapshot:      ['created_at', 'updated_at',
                                     'snapshot_date', 'wh_on_the_way_eta', 'last_movement_at'],
  factory_stock:                    ['created_at', 'updated_at', 'last_transaction_at']
};

// Declared NON-dates. Not decoration: these are the columns a careless map edit would add, and the drift
// detector fails if any of them ever appears in SIR_B1_DATE_MAP_.
var SIR_B1_NON_DATE_TRAPS_ = {
  fc_special_events:            ['event_month', 'event_period'],
  amazon_weekly_sales_snapshot: ['snapshot_week']
};

// §12 - the ONLY classes that may fall back, and they are all platform-transient. A 403 or a schema fault
// must NOT fall back: it would convert a deployment error into a permanent silent 22-second path, which is
// the failure mode the always-fallback option was rejected for.
var SIR_B1_FALLBACK_CLASSES_ = ['SHEETS_QUOTA_EXCEEDED', 'SHEETS_SERVICE_ERROR',
  'ADVANCED_SHEETS_SERVICE_UNAVAILABLE'];
var SIR_B1_MAX_FALLBACK_ = 1;

function sirWsIsB1Table_(name) {
  return Object.prototype.hasOwnProperty.call(SIR_B1_DATE_MAP_, String(name));
}
function sirWsColumnLetter_(n) {
  var out = '';
  while (n > 0) { var r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out || 'A';
}

// §8 - PAD BEFORE ANYTHING ELSE. batchGet omits trailing empty cells; getDataRange() does not. Without this
// the all-blank-row drop INVERTS, because String(undefined) is 'undefined', which is not empty - so blank
// rows would survive into the view model. Three of the thirteen end in an all-blank column today.
function sirWsPadRows_(values, width) {
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r] || [], copy = new Array(width);
    for (var c = 0; c < width; c++) copy[c] = (c < row.length && row[c] !== undefined && row[c] !== null) ? row[c] : '';
    out.push(copy);
  }
  return out;
}

// §5 - the serial -> Date conversion, proven against the live reader over 41 columns and 5 pairs with zero
// diffs. The timezone is the SPREADSHEET's, read at runtime - never a hard-coded offset, because the whole
// reason a date cell renders as ...T16:00:00.000Z is that Asia/Taipei midnight is the previous UTC day, and
// hard-coding that relationship is how it breaks the first time the sheet moves.
function sirWsSerialToDate_(serial, tz) {
  var ms = Math.round(Number(serial) * 86400000);
  var wall = new Date(Date.UTC(1899, 11, 30) + ms);
  var s = Utilities.formatDate(wall, 'UTC', 'yyyy-MM-dd HH:mm:ss');
  return Utilities.parseDate(s, tz, 'yyyy-MM-dd HH:mm:ss');
}

// ================================================================================================================
// R45 §B - THE SAME CONVERSION WITHOUT THE BRIDGE.
//
// R44 measured 74,621 ms of normalizationMs inside 83,465 ms of serverDurationMs: 89% of the server cost was
// this file, not the Sheets read (batchValuesMs was 3,110). The cause is arithmetic that is already pure
// wrapped in TWO Utilities.* calls per cell - 38,347 declared cells is 76,694 bridge crossings, and 70% of
// them are amazon_daily_sales_snapshot's seven date columns over 3,814 rows.
//
// sirWsSerialToDate_ above is UNCHANGED and stays the reference: everything below either reproduces it
// exactly or calls it. What formatDate(…,'UTC') -> parseDate(…,tz) computes is `wallMs - offset(tz)`, so when
// the offset is constant over the data's era the bridge buys nothing. When it is NOT constant the arithmetic
// is wrong, and Asia/Taipei is the proof rather than a hypothetical: it is +8h in 2026 and +9h in July 1979,
// because Taiwan observed DST until 1980. So the offset is PROBED, never assumed, and never hard-coded.
//
// THE BOUND THIS PROBE ACTUALLY CARRIES, stated rather than implied: fourteen samples per distinct year
// (the 15th of every month, plus the flanking December and January so a year's edges are covered by its own
// probe) detect any offset regime lasting a month or more. A regime shorter than one month would be missed.
// No such regime exists in tzdata for any era this product reads; if one ever did, the failure would be a
// wrong hour on cells inside it. That is the honest limit of sampling, and sampling is the only instrument
// Apps Script offers - there is no API that enumerates a zone's transitions.
//
// Cost: O(distinct years) bridge calls per request instead of O(date cells). Thirteen tables over a 2023-2028
// era is ~84 calls against 76,694.
function sirWsSerialWallMs_(serial) {
  return Date.UTC(1899, 11, 30) + Math.round(Number(serial) * 86400000);
}

// Memoized for the execution. Apps Script globals live exactly one execution, which IS the request-level
// bound the preflight asked for - no cross-request cache can go stale here because none survives.
var SIR_WS_TZ_YEAR_OFFSET_ = {};
var SIR_WS_TZ_PROBE_CALLS_ = 0;

// The offset at one instant, by the only route available: render the instant as wall-clock in the zone and
// subtract. Uses the SAME pattern sirWsSerialToDate_ already relies on, so it inherits its proven behaviour.
function sirWsTzOffsetMs_(tz, instantMs) {
  SIR_WS_TZ_PROBE_CALLS_++;
  var s = Utilities.formatDate(new Date(instantMs), tz, 'yyyy-MM-dd HH:mm:ss');
  var wallUtc = Date.UTC(Number(s.substring(0, 4)), Number(s.substring(5, 7)) - 1, Number(s.substring(8, 10)),
    Number(s.substring(11, 13)), Number(s.substring(14, 16)), Number(s.substring(17, 19)));
  return wallUtc - instantMs;
}

// { constant: bool, offsetMs: n }. constant:false is NOT an error and NOT a reason to approximate - it routes
// that year's cells, and only that year's cells, back through sirWsSerialToDate_.
function sirWsTzYearOffset_(tz, year) {
  var key = tz + '|' + year;
  if (Object.prototype.hasOwnProperty.call(SIR_WS_TZ_YEAR_OFFSET_, key)) return SIR_WS_TZ_YEAR_OFFSET_[key];
  var off = null, constant = true;
  for (var m = -1; m <= 12; m++) {
    var o = sirWsTzOffsetMs_(tz, Date.UTC(year, m, 15, 12, 0, 0));
    if (off === null) { off = o; } else if (o !== off) { constant = false; break; }
  }
  var result = { constant: constant, offsetMs: constant ? off : null };
  SIR_WS_TZ_YEAR_OFFSET_[key] = result;
  return result;
}

// ONE cell. Identical output to sirWsSerialToDate_ by construction when the guard holds, and literally
// sirWsSerialToDate_ when it does not.
function sirWsSerialToDateGuarded_(serial, tz, offsetByYear) {
  var wallMs = sirWsSerialWallMs_(serial);
  var g = offsetByYear[new Date(wallMs).getUTCFullYear()];
  if (!g || g.constant !== true) return sirWsSerialToDate_(serial, tz);
  return new Date(wallMs - g.offsetMs);
}

// THE COERCION IS TYPE-GATED, and that is load-bearing rather than defensive. It fires ONLY on a number. A
// string in a declared date column passes through untouched - not hypothetical: marketplace_skus.launch_date
// is written as String(...).trim() by both write paths while all 495 live rows hold Dates, so a string in
// that column is one upsert away. A blank stays blank.
function sirWsApplyDateMap_(name, values, tz) {
  var cols = SIR_B1_DATE_MAP_[name];
  if (!cols || !cols.length || !values || values.length < 2) return 0;
  var header = sirWsHeaderFromValues_(values);
  var idx = [];
  for (var c = 0; c < header.length; c++) { if (cols.indexOf(header[c]) !== -1) idx.push(c); }
  if (!idx.length) return 0;
  // R45 PASS 1 - which years are present, in pure JS. No bridge call, no conversion, nothing written. The
  // scan is over the SAME cells pass 2 visits, so it cannot see a value the conversion does not.
  var years = {};
  for (var r1 = 1; r1 < values.length; r1++) {
    for (var k1 = 0; k1 < idx.length; k1++) {
      var v1 = values[r1][idx[k1]];
      if (typeof v1 === 'number') { years[new Date(sirWsSerialWallMs_(v1)).getUTCFullYear()] = 1; }
    }
  }
  // R45 PASS 1b - ONE probe per distinct year rather than two bridge calls per cell.
  var offsetByYear = {};
  for (var y in years) { if (years.hasOwnProperty(y)) offsetByYear[y] = sirWsTzYearOffset_(tz, Number(y)); }
  // R45 PASS 2 - unchanged in every respect that a caller can observe: same cells, same type gate, same
  // returned count, same Date values. Only the route to the Date is different, and only where it is proven.
  var converted = 0;
  for (var r = 1; r < values.length; r++) {
    for (var k = 0; k < idx.length; k++) {
      var v = values[r][idx[k]];
      if (typeof v === 'number') { values[r][idx[k]] = sirWsSerialToDateGuarded_(v, tz, offsetByYear); converted++; }
    }
  }
  return converted;
}

// §12/§13 - the error CLASS, from the platform's own words. Deliberately conservative: anything this cannot
// positively identify as transient is NOT transient, so an unrecognised failure fails closed rather than
// quietly taking the slow path forever.
function sirWsClassifySheetsError_(e) {
  if (e && e.sirB1Class) return e.sirB1Class;
  var m = String((e && (e.message || e.details)) || e || '');
  if (/\b429\b|rate limit|quota exceeded|RESOURCE_EXHAUSTED/i.test(m)) return 'SHEETS_QUOTA_EXCEEDED';
  if (/\b(500|502|503|504)\b|backend error|UNAVAILABLE|INTERNAL/i.test(m)) return 'SHEETS_SERVICE_ERROR';
  if (/SERVICE_DISABLED|has not been used in project|accessNotConfigured/i.test(m)) return 'SHEETS_API_DISABLED';
  if (/\b403\b|PERMISSION_DENIED|forbidden/i.test(m)) return 'SHEETS_PERMISSION_DENIED';
  if (/\b400\b|INVALID_ARGUMENT|Unable to parse range/i.test(m)) return 'SHEETS_RANGE_REJECTED';
  return 'SHEETS_READ_FAILED';
}
function sirWsIsTransientClass_(token) {
  return SIR_B1_FALLBACK_CLASSES_.indexOf(String(token)) !== -1;
}
function sirWsB1Error_(token, table, detail) {
  var e = new Error('B1 read failed: ' + token + (table ? ' [' + table + ']' : ''));
  e.sirB1Class = token; e.schemaStatus = token; e.table = table || ''; e.detail = detail || null;
  return e;
}

// ========================================================================================================
// S8-R4D-E2 §6 - THE DATE-MAP DRIFT DETECTOR.
//
// The map is a COPY of a truth that lives in the spreadsheet, so it can rot. It rots in two directions and
// they need different evidence:
//
//   the MAP changed carelessly   -> comparable in the repository, every sweep, for free
//   the SHEET changed underneath -> needs physical evidence, and the physical evidence is the number format
//
// WHY numberFormat IS THE AUTHORITY. SpreadsheetApp returns a Date when a cell is numeric AND its effective
// number format type is DATE / DATE_TIME. Not when the writer meant a date: fcWriteTimestamp_ returns a
// STRING and the cell holds a Date, because Sheets parses date-shaped strings on write. The format is the
// mechanism that has always decided what this product sees.
//
// IT IS OUT OF THE READ PATH, AND IT ONLY DETECTS. Remapping on what it finds would be the runtime inference
// §4 forbids, arriving through the back door. A drift raises DATE_MAP_DRIFT and a human decides.
//
// TWO HONEST BLIND SPOTS, stated rather than designed around:
//   a column that is entirely blank AND never formatted carries no format to compare - the five declared
//     blanks can be shown not to have become something else, never confirmed positively;
//   a table with no data row has nothing to sample, so it reports UNDETECTABLE_NO_DATA and NEVER 'agrees'.
// ========================================================================================================
function sirWsDateMapDrift_(ss) {
  if (typeof Sheets === 'undefined' || !Sheets || !Sheets.Spreadsheets) {
    return { checked: false, verdict: 'ADVANCED_SHEETS_SERVICE_UNAVAILABLE', drift: [], undetectable: [] };
  }
  var id = ss.getId();
  var names = SIR_B1_TABLES_.slice();
  var ranges = names.map(function (n) { return "'" + String(n).replace(/'/g, "''") + "'!A2:2"; });
  var resp;
  try {
    resp = Sheets.Spreadsheets.get(id, { ranges: ranges,
      fields: 'sheets.properties.title,sheets.data.rowData.values.effectiveFormat.numberFormat.type' });
  } catch (e) {
    return { checked: false, verdict: sirWsClassifySheetsError_(e), drift: [], undetectable: [] };
  }
  // The HEADERS come from the same batch the reader uses, so the comparison is column-by-NAME and cannot
  // drift on position.
  var hdrResp;
  try {
    hdrResp = Sheets.Spreadsheets.Values.batchGet(id, { ranges: names.map(function (n) {
      return "'" + String(n).replace(/'/g, "''") + "'!1:1"; }), valueRenderOption: 'UNFORMATTED_VALUE' });
  } catch (e2) {
    return { checked: false, verdict: sirWsClassifySheetsError_(e2), drift: [], undetectable: [] };
  }
  var sheets = (resp && resp.sheets) || [], vrs = (hdrResp && hdrResp.valueRanges) || [];
  var byTitle = {};
  for (var i = 0; i < sheets.length; i++) {
    var t = ((sheets[i].properties || {}).title) || '';
    var data = (sheets[i].data && sheets[i].data[0]) || {};
    var rowData = (data.rowData && data.rowData[0] && data.rowData[0].values) || null;
    byTitle[t] = rowData;
  }
  var drift = [], undetectable = [];
  for (var k = 0; k < names.length; k++) {
    var name = names[k];
    var header = ((vrs[k] && vrs[k].values && vrs[k].values[0]) || []).map(function (h) { return String(h).trim(); });
    var formats = byTitle[name];
    if (!formats || !header.length) { undetectable.push({ table: name, reason: 'UNDETECTABLE_NO_DATA' }); continue; }
    var declared = SIR_B1_DATE_MAP_[name] || [];
    for (var c = 0; c < header.length; c++) {
      var col = header[c];
      if (col === '') continue;
      var fmt = (formats[c] && formats[c].effectiveFormat && formats[c].effectiveFormat.numberFormat
        && formats[c].effectiveFormat.numberFormat.type) || null;
      var physicalDate = (fmt === 'DATE' || fmt === 'DATE_TIME');
      var isDeclared = declared.indexOf(col) !== -1;
      if (physicalDate && !isDeclared) drift.push({ table: name, column: col, physical: fmt, declared: false });
      // A declared column with no format is the blind spot above, NOT a drift - it is reported separately so
      // the gap stays visible instead of being counted as agreement.
      else if (!physicalDate && isDeclared && fmt !== null) drift.push({ table: name, column: col, physical: fmt, declared: true });
      else if (!physicalDate && isDeclared) undetectable.push({ table: name, column: col, reason: 'DECLARED_BUT_UNFORMATTED' });
    }
  }
  return { checked: true, mapVersion: SIR_B1_DATE_MAP_VERSION_, drift: drift, undetectable: undetectable,
    verdict: drift.length ? 'DATE_MAP_DRIFT' : 'DATE_MAP_AGREES_WHERE_OBSERVABLE' };
}

// null          -> no scope was requested; the response is byte-for-byte what it was before this round.
// {ok:false}    -> a scope WAS requested and is incomplete. REFUSE. Never widen: a request that asked for one
//                  site and silently received every site is the exact defect this round exists to close, and
//                  it would be invisible from the browser because the extra rows all look like real data.
// {ok:true}     -> the three fields, trimmed.
function sirWsSiteScope_(payload) {
  var raw = (payload && payload.siteScope);
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Object.prototype.toString.call(raw) === '[object Array]') {
    return { ok: false, missing: SIR_SITE_SCOPE_FIELDS_.slice(), reason: 'NOT_AN_OBJECT' };
  }
  var scope = {}, missing = [];
  for (var i = 0; i < SIR_SITE_SCOPE_FIELDS_.length; i++) {
    var f = SIR_SITE_SCOPE_FIELDS_[i];
    var v = String(raw[f] === undefined || raw[f] === null ? '' : raw[f]).trim();
    if (!v) missing.push(f); else scope[f] = v;
  }
  if (missing.length) return { ok: false, missing: missing, reason: 'INCOMPLETE' };
  return { ok: true, scope: scope };
}

// §5 — THE SCOPE APPLIES TO THE EXPOSURE CONTRACT AND NOTHING ELSE. `only` is a generic mechanism with three
// shipped callers; redefining what it means for all of them to serve one page would be the silent kind of
// change. So a scoped request must name the exposure family and only the exposure family, and a scope
// arriving on any other request is REFUSED rather than ignored — ignoring it would widen it.
function sirWsScopeApplicable_(onlyList) {
  if (!onlyList || !onlyList.length) return false;
  for (var i = 0; i < onlyList.length; i++) {
    if (SIR_EXPOSURE_TABLES_.indexOf(onlyList[i]) === -1) return false;
  }
  return true;
}

// --------------------------------------------------------------------------------------------------------
// §7 — A REACHABILITY CLOSURE, NOT SIX ROW FILTERS. THIS IS THE LOAD-BEARING PART.
//
// The obvious implementation — filter all six tables on company/country/marketplace — is wrong in two ways
// that both LOSE QUANTITY SILENTLY, which is the failure mode the Qty-0 defect taught this page to fear.
//
//   1. FILTERING `shipments` ON ITS OWN MARKETPLACE DELETES EXACTLY THE MERGED HEADERS. A merged shipment
//      carries marketplace = MULTI by construction. Its lines belong to real sites and reach them through
//      frozen shipping_plan_line lineage — that lineage machinery exists for no other reason. A header
//      filter would drop every one of them and the Shipping card would show less incoming inventory than
//      exists, with nothing on screen saying so.
//   2. `shipping_plan_lines.marketplace` IS NOT THE SCOPE FIELD. It is the line's REAL marketplace, and the
//      shipped client deliberately attributes a line to its PARENT PLAN's triple instead
//      (_irBuildExposureIndexes_ builds lineReceiverById from planById, never from the line). Scoping on the
//      line's own column would be a SECOND business interpretation of shipment ownership.
//
// So the closure follows the shipped rule, which is reproduced here and not reinvented:
//
//   P  = shipping_plans                    whose OWN triple is this site AND is a SPECIFIC receiver
//   PL = shipping_plan_lines               whose shipping_plan_id is in P
//   SL = shipment_lines                    whose shipping_plan_line_id is in PL
//                                          OR whose lineage is BLANK and whose parent header is this site
//   S  = shipments                         named by SL, PLUS in-scope headers (MULTI headers are retained
//                                          through SL, which is the whole point)
//   D  = shipping_allocation_drafts        matching the client's own draft scope rule
//   DL = shipping_allocation_draft_lines   whose allocation_draft_id is in D
//
// A PRESENT-BUT-UNRESOLVABLE lineage FAILS CLOSED — dropped, never fallen back to the header — because that
// is what _irBuildShipmentRemainingByReceiver does, and a server that disagreed with the client about which
// shipment belongs to whom would be worse than one that does not scope at all.
//
// PURE. Raw snake_case rows in, raw snake_case rows out, unmodified: the adapter and the normalizers see
// exactly the rows they saw before, there are simply fewer of them.
function sirWsSiteScopeClosure_(tables, scope) {
  tables = tables || {}; scope = scope || {};
  function lo(v) { return String(v === undefined || v === null ? '' : v).trim().toLowerCase(); }
  function id(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  var S_CO = lo(scope.company), S_CY = lo(scope.country), S_MK = lo(scope.marketplace);
  // Mirrors the client's _irIsSpecificReceiver verbatim: company + country + a NON-merged marketplace.
  function specific(co, cy, mk) {
    var m = lo(mk);
    return lo(co).length > 0 && lo(cy).length > 0 && m.length > 0 && !/multi|merged|mixed|combined/.test(m);
  }
  function isScope(co, cy, mk) {
    return specific(co, cy, mk) && lo(co) === S_CO && lo(cy) === S_CY && lo(mk) === S_MK;
  }

  // P — the plans this site owns.
  var planIds = {}, plans = [];
  var srcP = tables.shipping_plans || [];
  for (var i = 0; i < srcP.length; i++) {
    var p = srcP[i] || {};
    if (!isScope(p.company, p.country, p.marketplace)) continue;
    plans.push(srcP[i]);
    var pid = id(p.shipping_plan_id);
    if (pid) planIds[pid] = true;
  }

  // PL — their lines. The line's own `marketplace` is READ BY NOBODY HERE, on purpose (see §7.2 above).
  var planLineIds = {}, planLines = [];
  var srcPL = tables.shipping_plan_lines || [];
  for (var j = 0; j < srcPL.length; j++) {
    var pl = srcPL[j] || {};
    if (!planIds[id(pl.shipping_plan_id)]) continue;
    planLines.push(srcPL[j]);
    var plid = id(pl.shipping_plan_line_id);
    if (plid) planLineIds[plid] = true;
  }

  // The shipment headers, by id — needed for the BLANK-lineage fallback before we know which to keep.
  var hdrById = {};
  var srcS = tables.shipments || [];
  for (var k = 0; k < srcS.length; k++) {
    var h = srcS[k] || {};
    var hid = id(h.shipment_id);
    if (hid && !hdrById[hid]) hdrById[hid] = h;
  }

  // SL — frozen lineage wins; blank lineage uses the header; present-but-unresolvable fails closed.
  var keepHdr = {}, shipLines = [];
  var srcSL = tables.shipment_lines || [];
  for (var m2 = 0; m2 < srcSL.length; m2++) {
    var ln = srcSL[m2] || {};
    var lineage = id(ln.shipping_plan_line_id);
    var keep;
    if (lineage) {
      keep = planLineIds[lineage] === true;          // not ours, or dangling -> dropped, never fallen back
    } else {
      var hb = hdrById[id(ln.shipment_id)];
      keep = !!hb && isScope(hb.company, hb.country, hb.marketplace);
    }
    if (!keep) continue;
    shipLines.push(srcSL[m2]);
    var sid = id(ln.shipment_id);
    if (sid) keepHdr[sid] = true;
  }

  // S — every header a kept line names (THIS is what retains a MULTI header), plus this site's own headers
  // even when they carry no line, so a scoped read can never return fewer headers than the site has.
  var shipments = [];
  for (var n = 0; n < srcS.length; n++) {
    var s2 = srcS[n] || {};
    if (keepHdr[id(s2.shipment_id)] || isScope(s2.company, s2.country, s2.marketplace)) shipments.push(srcS[n]);
  }

  // D — the client's OWN draft scope rule, reproduced rather than re-decided: country + marketplace must
  // match, and a draft row with a BLANK company is admitted (_shippingDraftLinesFor tolerates it). Status is
  // NOT read here: scope is a boundary, and dropping a cancelled draft server-side would be this handler
  // authoring business logic it is forbidden to author.
  var draftIds = {}, drafts = [];
  var srcD = tables.shipping_allocation_drafts || [];
  for (var q = 0; q < srcD.length; q++) {
    var d = srcD[q] || {};
    if (lo(d.country) !== S_CY || lo(d.marketplace) !== S_MK) continue;
    if (lo(d.company) && lo(d.company) !== S_CO) continue;
    drafts.push(srcD[q]);
    var did = id(d.allocation_draft_id);
    if (did) draftIds[did] = true;
  }
  var draftLines = [];
  var srcDL = tables.shipping_allocation_draft_lines || [];
  for (var r = 0; r < srcDL.length; r++) {
    var dl = srcDL[r] || {};
    if (draftIds[id(dl.allocation_draft_id)]) draftLines.push(srcDL[r]);
  }

  return {
    shipments: shipments, shipment_lines: shipLines,
    shipping_plans: plans, shipping_plan_lines: planLines,
    shipping_allocation_drafts: drafts, shipping_allocation_draft_lines: draftLines
  };
}

// PURE. Keeps, for each key, the rows whose period is among that key's `keep` most recent DISTINCT periods.
// A row with no readable period is ALWAYS kept: it cannot be placed in time, and dropping what we cannot
// order would be a guess. Returns the rows in their original order (the consumers sort for themselves, but
// order stability keeps BEFORE==AFTER checkable field by field).
function sirWsRecentWindow_(rows, spec) {
  rows = rows || [];
  if (!spec || !(spec.keep > 0) || !rows.length) return { rows: rows, before: rows.length, after: rows.length, dropped: 0 };
  var keyCols = spec.keyCols || [], periodCols = spec.periodCols || [];
  function keyOf(r) {
    var parts = [];
    for (var i = 0; i < keyCols.length; i++) parts.push(sirWsStr_(r[keyCols[i]]).toUpperCase());
    return parts.join('\u0001');
  }
  function periodOf(r) {
    for (var i = 0; i < periodCols.length; i++) {
      var v = r[periodCols[i]];
      // A Date cell must become the same comparable YYYY-MM-DD the sheet's text form would be, or two rows
      // written on the same day by different importers would sort into different periods.
      if (v instanceof Date && !isNaN(v.getTime())) {
        return v.getUTCFullYear() + '-' + ('0' + (v.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + v.getUTCDate()).slice(-2);
      }
      var s = sirWsStr_(v);
      if (s) return s;
    }
    return '';
  }
  // Pass 1: the distinct periods each key actually has.
  var seen = {};
  for (var i = 0; i < rows.length; i++) {
    var per = periodOf(rows[i]);
    if (!per) continue;
    var k = keyOf(rows[i]);
    if (!seen[k]) seen[k] = {};
    seen[k][per] = true;
  }
  // Pass 2: that key's most recent `keep` of them.
  var keepSet = {};
  for (var k2 in seen) {
    if (!Object.prototype.hasOwnProperty.call(seen, k2)) continue;
    var periods = Object.keys(seen[k2]).sort();
    var tail = periods.slice(Math.max(0, periods.length - spec.keep));
    var m = {};
    for (var t = 0; t < tail.length; t++) m[tail[t]] = true;
    keepSet[k2] = m;
  }
  // Pass 3: keep the rows in those periods, plus every row we could not place in time.
  var out = [];
  for (var j = 0; j < rows.length; j++) {
    var pj = periodOf(rows[j]);
    if (!pj) { out.push(rows[j]); continue; }
    var kj = keyOf(rows[j]);
    if (keepSet[kj] && keepSet[kj][pj]) out.push(rows[j]);
  }
  return { rows: out, before: rows.length, after: out.length, dropped: rows.length - out.length };
}

// --------------------------------------------------------------------------------------------------------
// PURE helpers
// --------------------------------------------------------------------------------------------------------
function sirWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function sirBuildEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: 'inventoryReplenishment.workspace.get', workspace: 'inventoryReplenishment', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}

function sirCap_(rows) {
  rows = rows || [];
  if (rows.length <= SIR_WS_ROW_MAX_) return { rows: rows, capped: false, total: rows.length };
  return { rows: rows.slice(0, SIR_WS_ROW_MAX_), capped: true, total: rows.length };
}

// The pure orchestrator: raw tables → ONE bounded View Model. Every array is RAW passthrough (each source row unmodified)
// so the page adapter reproduces the existing assembly byte-for-byte via the SAME db-api normalizers.
function sirWorkspaceBuild_(tables, payload) {
  tables = tables || {}; payload = payload || {};
  var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};
  var out = { summary: null, capped: {}, counts: {}, recentWindow: {} };
  var summary = {};
  // §C/SECTD - OPT-IN. Absent or false means the payload is byte-for-byte what it was before this round.
  var windowOn = (payload.recentWindow === true);
  // F1-7N-FC-1B-E3-R4-A1 §A1 — ECHO WHAT WAS ASKED FOR, ALWAYS, INCLUDING WHEN THE ANSWER IS "NOTHING".
  //
  // R4 reported `recentWindow` only when a projection actually ran, so "the caller did not ask" and "the
  // caller asked and the request never arrived" produced the identical null. That is exactly the ambiguity
  // the live log fell into. The REQUEST is now echoed separately from the RESULT, so a null result beside a
  // true request is a visible contradiction rather than a silent one.
  out.requestEcho = { recentWindow: (payload.recentWindow === true), only: null, siteScope: null };
  // §A1 — RESOLVED INLINE, ON PURPOSE. This function is documented PURE and four suites lift it BY
  // ITSELF, with no other function from this file in scope. Calling a sibling helper here broke every one of
  // them with a ReferenceError — not a wrong answer, but a harness that could no longer run at all. Six
  // lines of duplication are the price of a function that means what its docstring says; the orchestrator's
  // copy is checked against this one by test rather than kept in step by hope.
  var onlyRaw = (payload && payload.only), onlySet = null, onlyList = null;
  if (onlyRaw && Object.prototype.toString.call(onlyRaw) === '[object Array]' && onlyRaw.length) {
    onlyList = [];
    for (var oi = 0; oi < onlyRaw.length; oi++) {
      var on = sirWsStr_(onlyRaw[oi]);
      if (on && onlyList.indexOf(on) === -1) onlyList.push(on);
    }
    if (onlyList.length) { onlySet = {}; for (var oj = 0; oj < onlyList.length; oj++) onlySet[onlyList[oj]] = true; }
    else onlyList = null;
  }
  if (onlySet) out.requestEcho.only = onlyList;
  // S8-R4B-2D §4/§5/§7 — THE SITE SCOPE, APPLIED BEFORE ANYTHING IS COUNTED OR CAPPED.
  //
  // REACHED ONLY WHEN A SCOPE WAS ASKED FOR, and that guard is the contract, not a micro-optimisation. This
  // function is documented PURE and FOUR suites lift it ALONE — one of them with nothing in scope but
  // SIR_WORKSPACE_TABLES_, sirCap_ and SIR_WS_ROW_MAX_. Calling a sibling helper unconditionally is the
  // regression that once killed all four with a ReferenceError (T7b). An unscoped call must therefore never
  // reach sirWsSiteScope_ / sirWsSiteScopeClosure_ at all, which is exactly what `!= null` buys.
  var _scopeAsked = (payload.siteScope !== undefined && payload.siteScope !== null);
  if (_scopeAsked) {
    var _sc = sirWsSiteScope_(payload);
    // §4 — FAIL CLOSED. The orchestrator refuses an incomplete scope before a sheet is opened; this is the
    // SECOND of the two, and it is here rather than only there because a widened read is undetectable from
    // the browser. Both of them have to be removed to widen it, and no mutant removes two things.
    if (!_sc || !_sc.ok) {
      var _e1 = new Error('siteScope was supplied without ' + ((_sc && _sc.missing) || SIR_SITE_SCOPE_FIELDS_).join(' / ')
        + '. REFUSED rather than widened to every site.');
      _e1.apiCode = 'INVENTORY_REPLENISHMENT_SITE_SCOPE_INCOMPLETE';
      throw _e1;
    }
    // §5 — and it applies to the exposure contract alone. A scope on any other request is refused, because
    // the alternative to refusing it is ignoring it, and ignoring a scope IS widening it.
    if (!sirWsScopeApplicable_(onlyList)) {
      var _e2 = new Error('siteScope is defined for the exposure table family only. REFUSED.');
      _e2.apiCode = 'INVENTORY_REPLENISHMENT_SITE_SCOPE_NOT_APPLICABLE';
      throw _e2;
    }
    out.requestEcho.siteScope = { company: _sc.scope.company, country: _sc.scope.country, marketplace: _sc.scope.marketplace };
    var _proj = sirWsSiteScopeClosure_(tables, _sc.scope);
    // A reduction nobody can see is indistinguishable from data loss — the same rule recentWindow follows.
    var _scoped = {};
    for (var _si = 0; _si < SIR_EXPOSURE_TABLES_.length; _si++) {
      var _tn = SIR_EXPOSURE_TABLES_[_si];
      var _before = (tables[_tn] || []).length, _after = (_proj[_tn] || []).length;
      _scoped[_tn] = { before: _before, after: _after, dropped: _before - _after };
    }
    out.siteScope = { scope: out.requestEcho.siteScope, tables: _scoped };
    // Rebind the source tables for the loop below. Non-exposure tables are untouched — a scoped request
    // cannot ask for one (the applicability gate above), so there are none, but the copy says so.
    var _rebound = {};
    for (var _rk in tables) { if (Object.prototype.hasOwnProperty.call(tables, _rk)) _rebound[_rk] = tables[_rk]; }
    for (var _sj = 0; _sj < SIR_EXPOSURE_TABLES_.length; _sj++) _rebound[SIR_EXPOSURE_TABLES_[_sj]] = _proj[SIR_EXPOSURE_TABLES_[_sj]] || [];
    tables = _rebound;
  }
  for (var i = 0; i < SIR_WORKSPACE_TABLES_.length; i++) {
    var spec = SIR_WORKSPACE_TABLES_[i];
    var name = spec.name;
    if (onlySet && !onlySet[name]) continue;                // §A1: an explicit subset was requested
    if (spec.include && !include[spec.include]) continue;   // F1-7J-A2: skip un-requested include tables → base payload identical (BEFORE==AFTER)
    var src = tables[name] || [];
    // §C/§D - the recent-period projection, when the caller asked for it and this table has a window.
    if (windowOn && SIR_WS_RECENT_WINDOW_[name]) {
      var w = sirWsRecentWindow_(src, SIR_WS_RECENT_WINDOW_[name]);
      out.recentWindow[name] = { before: w.before, after: w.after, dropped: w.dropped, keep: SIR_WS_RECENT_WINDOW_[name].keep };
      src = w.rows;
    }
    var c = sirCap_(src);
    out[name] = c.rows;                 // raw passthrough, keyed by table name
    out.capped[name] = c.capped;
    out.counts[name] = c.total;
    summary[name] = c.total;
  }
  out.summary = (include.summary === false) ? null : summary;
  return out;
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb.
// --------------------------------------------------------------------------------------------------------
// ========================================================================================================
// S8-R4D-C §3 — ONE getValues() PER TABLE, BECAUSE data[0] IS THE HEADER ROW.
//
// R4D-B counted the calls this path actually makes and the number was not thirteen. `readTable` asked
// prodRequireSheet_ to validate the header, which reads row 1; for the four tables carrying requiredCols it
// then asked prodRequireColumns_, which reads row 1 AGAIN; and only then did sirWsRowsToObjects_ call
// getDataRange().getValues() — whose data[0] is that same header row, already fetched, twice.
//
//   13 header reads + 4 repeated header reads + 13 full-sheet reads = 30 range reads for 13 tables.
//
// The header is now taken from the ONE full-sheet read and passed to the SAME validators. Nothing is
// weakened: classifySchemaMismatch has always operated on a header ARRAY and never touched a Sheet, and the
// requiredCols check is the identical set comparison prodRequireColumns_ performs, run against the identical
// array. What is removed is the fetching, not the checking.
//
// WHY THIS IS LOCAL AND NOT A REFACTOR OF 29_. prodRequireSheet_ / prodRequireColumns_ have callers in more
// than twenty files, and every one of them reads a different way. Changing the shared guard to serve this
// path would put that blast radius behind a performance change. This handler owns its own `io`, so the fix
// lives entirely inside it and no other caller can observe it.
//
// WHAT IS DELIBERATELY NOT REMOVED. getLastRow / getLastColumn / getSheetByName / getId are metadata
// accessors, not range reads; HEADER_MISSING is still decided on sheet GEOMETRY exactly as prodRequireSheet_
// decided it, because a sheet with no rows and a sheet whose first row is blank are different faults and
// getDataRange() flattens them (an empty sheet answers [['']], not []).
// ========================================================================================================
function sirWsHeaderFromValues_(data) {
  if (!data || !data.length || !data[0]) return [];
  return data[0].map(function (h) { return String(h).trim(); });
}
// The row->object conversion, over values ALREADY fetched. Unchanged semantics: header from row 0, blank rows
// dropped, every column carried verbatim.
function sirWsRowsFromValues_(data) {
  if (!data || data.length < 2) return [];
  var headers = sirWsHeaderFromValues_(data);
  var out = [];
  for (var r = 1; r < data.length; r++) { var o = {}, blank = true; for (var c = 0; c < headers.length; c++) { o[headers[c]] = data[r][c]; if (String(data[r][c]).trim() !== '') blank = false; } if (!blank) out.push(o); }
  return out;
}
// Retained at its original signature and behaviour — it is the single-read form, and keeping it means the
// conversion has one owner whether the caller holds a Sheet or the values.
function sirWsRowsToObjects_(sheet) {
  return sirWsRowsFromValues_(sheet.getDataRange().getValues());
}

function sirWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { SIR_WS_SEQ_++; return SIR_WS_SEQ_; },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols, optional) {
      // §5 — ABSENCE IS DECIDED BEFORE ANY RANGE READ, and with ONE getSheetByName rather than two. An
      // optional table that is absent is [] (the browser's graceful-empty); a required one fails closed.
      var sheet = ss.getSheetByName(name);
      if (!sheet) {
        if (optional) return [];
        throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', name, null);
      }
      // The exact-Spreadsheet-ID gate prodRequireSheet_ ran per table, kept per table. Metadata only.
      prodAssertDbTarget_(ss, null);
      // HEADER_MISSING on geometry, as before — see the note above on why this is not folded into data[0].
      if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) throw prodSchemaError_('HEADER_MISSING', name, null);
      var data = sheet.getDataRange().getValues();            // THE ONE RANGE READ
      var header = sirWsHeaderFromValues_(data);
      // The SAME classifier, on the SAME header array prodRequireSheet_ used to fetch for itself.
      var report = prodSafetyBundle_().classifySchemaMismatch({ exists: true, actualHeaders: header,
        expectedHeaders: [], extraColumnsPolicy: 'ALLOW' });
      if (!report.valid) throw prodSchemaError_(report.schemaStatus, name, report);
      // §7 — requiredCols from that same array. prodRequireColumns_'s comparison, zero additional reads.
      if (requiredCols && requiredCols.length) {
        var have = {};
        for (var h = 0; h < header.length; h++) { if (header[h] !== '') have[header[h]] = 1; }
        var missing = [];
        for (var q = 0; q < requiredCols.length; q++) { if (!have[requiredCols[q]]) missing.push(requiredCols[q]); }
        if (missing.length) throw prodSchemaError_('MISSING_REQUIRED_HEADER', name, { missing: missing });
      }
      return sirWsRowsFromValues_(data);
    },

    // ====================================================================================================
    // S8-R4D-E2 §2/§3 - THE TWO-CALL FIRST-LAYER READ.
    //
    // It lives on `io` so it can be stubbed, and so a stub that does NOT provide it falls through to the
    // per-sheet reader above with readerMode saying so. That is not a silent degradation: every existing
    // fixture reports SPREADSHEETAPP, which is exactly what it is doing.
    // ====================================================================================================
    batchReadTables: function (ss, specs, tz) {
      if (typeof Sheets === 'undefined' || !Sheets || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
        throw sirWsB1Error_('ADVANCED_SHEETS_SERVICE_UNAVAILABLE', '',
          'The Sheets v4 advanced service does not resolve in this deployment.');
      }
      prodAssertDbTarget_(ss, null);
      var id = ss.getId();
      var out = {}, ranges = [], ordered = [], rowCounts = {};
      var t0 = Date.now();

      // CALL 1 - existence and width. The mask is the narrowest that answers both questions: no cell values,
      // no formats, no formulas. It is NOT range-filtered, and it cannot be: naming a sheet that does not
      // exist makes the call throw, which is precisely the state §10 requires us to detect. So it returns
      // titles and grid dimensions for every sheet in the file - metadata, never contents.
      var meta;
      try {
        meta = Sheets.Spreadsheets.get(id, { fields: 'sheets.properties(title,gridProperties(rowCount,columnCount))' });
      } catch (e) {
        throw sirWsB1Error_(sirWsClassifySheetsError_(e), '', String(e && e.message || e));
      }
      var metadataMs = Date.now() - t0;
      var width = {}, present = {};
      var sheets = (meta && meta.sheets) || [];
      for (var m = 0; m < sheets.length; m++) {
        var pr = sheets[m].properties || {};
        if (!pr.title) continue;
        present[String(pr.title)] = true;
        width[String(pr.title)] = Number((pr.gridProperties && pr.gridProperties.columnCount) || 0);
      }

      // §10 - only EXISTING sheets become ranges. An absent optional sheet is [] and is simply not asked
      // for; batchGet rejects the WHOLE request when a named range's sheet is missing, so naming it would
      // take the other twelve down with it.
      for (var i = 0; i < specs.length; i++) {
        var spec = specs[i], nm = spec.name;
        if (!present[nm]) {
          if (spec.optional) { out[nm] = []; rowCounts[nm] = 0; continue; }
          throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', nm, null);
        }
        var cols = width[nm] > 0 ? width[nm] : 1;
        // Column-bounded, ROW-OPEN. The width comes from metadata because the schema contract runs
        // extraColumnsPolicy ALLOW and a frozen literal would truncate column 43 of sku_details in silence.
        // The rows are left open on purpose: gridProperties.rowCount is the ALLOCATED grid (1000 on an empty
        // sheet), not the last row with content, so bounding on it would ask for a thousand empty rows and,
        // worse, would make an empty sheet indistinguishable from a full one.
        ranges.push("'" + String(nm).replace(/'/g, "''") + "'!A:" + sirWsColumnLetter_(cols));
        ordered.push(spec);
      }

      // CALL 2 - the values. UNFORMATTED_VALUE is required for IDENTITY as much as for arithmetic:
      // sku_details.sku and overseas_inventory_snapshot.sku are mixed number/string columns, and a FORMATTED
      // render would stringify them and change row identity.
      var t1 = Date.now(), resp = { valueRanges: [] };
      if (ranges.length) {
        try {
          resp = Sheets.Spreadsheets.Values.batchGet(id, { ranges: ranges,
            valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
        } catch (e2) {
          throw sirWsB1Error_(sirWsClassifySheetsError_(e2), '', String(e2 && e2.message || e2));
        }
      }
      var batchGetMs = Date.now() - t1;
      var vrs = (resp && resp.valueRanges) || [];

      // §13 - A MISSING valueRange IS NOT AN EMPTY TABLE. batchGet returns one entry per requested range, in
      // order; a range holding no data has no `values` KEY, which is a different thing from the ENTRY being
      // absent. Treating the first as [] is correct. Treating the second as [] fabricates an empty business
      // table out of a malformed response, and the two are one line apart.
      if (vrs.length !== ordered.length) {
        throw sirWsB1Error_('SHEETS_PARTIAL_RESPONSE', '',
          'requested ' + ordered.length + ' ranges, received ' + vrs.length);
      }

      var t2 = Date.now();
      // R45 §B - the two numbers that make the repair auditable in Production rather than asserted here.
      // dateCellsConverted is the work; tzProbeCalls is what it cost in bridge crossings. Under R44 the
      // second was exactly 2x the first. A ratio that climbs back toward 2 is the guard failing open.
      var probeCallsAtStart = SIR_WS_TZ_PROBE_CALLS_;
      var dateCellsConverted = 0;
      for (var k = 0; k < ordered.length; k++) {
        var sp = ordered[k], name = sp.name;
        var values = (vrs[k] && vrs[k].values) || null;

        // THE EMPTY CASE, AND WHY IT COSTS ONE METADATA ACCESSOR. R43 decides between HEADER_MISSING and
        // HEADER_BLANK on sheet GEOMETRY, and batchGet cannot: a sheet with no rows at all and a sheet whose
        // only row is blank BOTH come back without `values`. Collapsing them would change the token this
        // handler raises for fc_target_rules, which §11 requires to be identical. getLastRow/getLastColumn
        // are metadata accessors rather than range reads - the same ones R43 already ran per table - so the
        // exact token is bought for nothing, and only for tables that came back empty.
        if (!values || !values.length) {
          var probe = ss.getSheetByName(name);
          if (!probe) {
            if (sp.optional) { out[name] = []; rowCounts[name] = 0; continue; }
            throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', name, null);
          }
          if (probe.getLastRow() < 1 || probe.getLastColumn() < 1) throw prodSchemaError_('HEADER_MISSING', name, null);
          values = probe.getDataRange().getValues();   // non-empty geometry: let the SAME validator decide
        }

        var header = sirWsHeaderFromValues_(values);
        // THE SAME CLASSIFIER, on the same header array the per-sheet reader hands it. The benchmark used a
        // local re-implementation of these checks; the product must not, or the two readers would be
        // equivalent only to each other.
        var report = prodSafetyBundle_().classifySchemaMismatch({ exists: true, actualHeaders: header,
          expectedHeaders: [], extraColumnsPolicy: 'ALLOW' });
        if (!report.valid) throw prodSchemaError_(report.schemaStatus, name, report);
        if (sp.requiredCols && sp.requiredCols.length) {
          var have = {};
          for (var h = 0; h < header.length; h++) { if (header[h] !== '') have[header[h]] = 1; }
          var missing = [];
          for (var q = 0; q < sp.requiredCols.length; q++) { if (!have[sp.requiredCols[q]]) missing.push(sp.requiredCols[q]); }
          if (missing.length) throw prodSchemaError_('MISSING_REQUIRED_HEADER', name, { missing: missing });
        }
        // §8 then §4: pad to header width FIRST, then coerce declared date columns, then map to objects -
        // the order is the contract, because the blank-row rule reads every cell of the padded row.
        var padded = sirWsPadRows_(values, header.length);
        dateCellsConverted += sirWsApplyDateMap_(name, padded, tz);
        var rows = sirWsRowsFromValues_(padded);
        out[name] = rows;
        rowCounts[name] = rows.length;
      }
      var normalizationMs = Date.now() - t2;

      return { tables: out, metadataMs: metadataMs, batchGetMs: batchGetMs,
        normalizationMs: normalizationMs, rangeCount: ranges.length, remoteCalls: ranges.length ? 2 : 1,
        rowCounts: rowCounts, dateCellsConverted: dateCellsConverted,
        tzProbeCalls: SIR_WS_TZ_PROBE_CALLS_ - probeCallsAtStart };
    }
  };
}

// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R5 §3 — STAGE EVIDENCE, SO A TIMED-OUT READ CAN BE FOUND.
//
// This handler already timed itself and every table it read. What it could not say is WHEN it started in wall
// time, or how long the request waited between the router accepting it and this function beginning — and those
// are the two facts that separate "the read is slow" from "the read waited for a slot". Both readings were
// available for the live 60 s timeout and the telemetry could not choose between them.
//
// `stages` is a bounded list of named offsets from handler entry. It costs one Date.now() per boundary, is a
// few hundred bytes, and is emitted on SUCCESS as well as failure so a healthy read establishes the baseline a
// slow one is compared against.
//
// NOTHING IS PERSISTED. No sheet row, no CacheService, no PropertiesService. The correlation id travels in the
// response and the wall-clock entry time is what lets an operator locate this execution in the Apps Script
// execution list — which is a log that already exists and costs nothing to keep.
//
// NO LOCK IS TAKEN by this handler. That is reported as a fact (`lock: null`) rather than left unmentioned:
// lock contention is one of the enumerated reach classes, and "we did not look" and "there is no lock" are
// different answers.
// ================================================================================================================
function handleInventoryReplenishmentWorkspaceGet_(body, io) {
  io = io || sirWorkspaceDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = sirWsStr_(body && body.requestId) || ('REQ-S' + ('000000' + seq).slice(-6));
  var _stages = [];
  function _stage(name, startedMs) { _stages.push({ stage: name, started_ms: startedMs, elapsed_ms: io.now() - startedMs }); }
  var _entry = (typeof rtrEntryEvidence_ === 'function') ? rtrEntryEvidence_() : null;
  try {
    var payload = (body && body.payload) || {};
    var include = (payload && payload.include && typeof payload.include === 'object') ? payload.include : {};
    // S8-R4B-2D §4 — REFUSE BEFORE THE SPREADSHEET IS OPENED. A malformed scope costs zero sheet reads and
    // returns a TYPED failure the browser can classify, rather than an all-site payload it would believe.
    var scopeChk = (payload.siteScope !== undefined && payload.siteScope !== null) ? sirWsSiteScope_(payload) : null;
    if (scopeChk && !scopeChk.ok) {
      return sirBuildEnvelope_(false, null, [{ code: 'INVENTORY_REPLENISHMENT_SITE_SCOPE_INCOMPLETE',
        message: 'siteScope was supplied without ' + scopeChk.missing.join(' / ')
          + '. The request is REFUSED rather than widened to every site.',
        details: { missing: scopeChk.missing, required: SIR_SITE_SCOPE_FIELDS_.slice(), reason: scopeChk.reason } }],
        { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, entry: _entry, stages: _stages,
          siteScopeRequested: true, siteScopeApplied: null,
          handler: 'handleInventoryReplenishmentWorkspaceGet_', lock: null,
          serverBuild: (typeof SIR_BUILD_VERSION_ !== 'undefined') ? SIR_BUILD_VERSION_ : null });
    }
    if (scopeChk && scopeChk.ok && !sirWsScopeApplicable_(sirWsOnlyList_(payload))) {
      return sirBuildEnvelope_(false, null, [{ code: 'INVENTORY_REPLENISHMENT_SITE_SCOPE_NOT_APPLICABLE',
        message: 'siteScope is defined for the exposure table family only, and this request names other tables. REFUSED.',
        details: { exposureTables: SIR_EXPOSURE_TABLES_.slice(), onlyRequested: sirWsOnlyList_(payload) } }],
        { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, entry: _entry, stages: _stages,
          siteScopeRequested: true, siteScopeApplied: null,
          handler: 'handleInventoryReplenishmentWorkspaceGet_', lock: null,
          serverBuild: (typeof SIR_BUILD_VERSION_ !== 'undefined') ? SIR_BUILD_VERSION_ : null });
    }
    var tOpen = io.now();
    var ss = io.openTarget();
    var openMs = io.now() - tOpen;
    _stage('OPEN_SPREADSHEET', tOpen);
    var onlySet = sirWsOnlySet_(payload);
    var tables = {}, readCount = 0, tableMs = {};

    // S8-R4D-E2 §1 - THE PARTITION. The resolved request is split into the thirteen first-layer tables,
    // which go to the batch reader, and everything else, which stays on the per-sheet reader in this same
    // file. Two readers in one handler is a cost this round takes knowingly; the equality suite is what
    // keeps them honest, and the eight remaining tables were never part of the benchmarked set.
    var b1Specs = [], restSpecs = [];
    for (var i = 0; i < SIR_WORKSPACE_TABLES_.length; i++) {
      var spec = SIR_WORKSPACE_TABLES_[i];
      if (onlySet && !onlySet[spec.name]) continue;           // §A1: an explicit subset was requested
      if (spec.include && !include[spec.include]) continue;   // F1-7J-A2: skip un-requested include tables (no read cost)
      if (sirWsIsB1Table_(spec.name)) b1Specs.push(spec); else restSpecs.push(spec);
    }

    var readerMode = 'SPREADSHEETAPP', b1Profile = null;
    var fallbackUsed = false, fallbackReason = null, fallbackErrorClass = null, fallbackCount = 0;
    var canBatch = b1Specs.length > 0 && typeof io.batchReadTables === 'function';
    if (canBatch) {
      var tz = (ss && typeof ss.getSpreadsheetTimeZone === 'function') ? ss.getSpreadsheetTimeZone() : null;
      try {
        b1Profile = io.batchReadTables(ss, b1Specs, tz);
        for (var bt in b1Profile.tables) {
          if (Object.prototype.hasOwnProperty.call(b1Profile.tables, bt)) { tables[bt] = b1Profile.tables[bt]; readCount++; }
        }
        readerMode = 'SHEETS_API';
      } catch (b1err) {
        // §12/§13 - ONE bounded fallback, and ONLY for platform-transient classes. Anything else fails
        // closed: a 403 or a schema fault that fell back would turn a deployment error into a permanent
        // silent slow path, and nobody would be told. There is no retry loop - this is the whole budget.
        var cls = sirWsClassifySheetsError_(b1err);
        if (!sirWsIsTransientClass_(cls) || fallbackCount >= SIR_B1_MAX_FALLBACK_) throw b1err;
        fallbackUsed = true; fallbackCount = 1; fallbackErrorClass = cls;
        fallbackReason = String((b1err && b1err.message) || cls);
        for (var f = 0; f < b1Specs.length; f++) {
          var fs2 = b1Specs[f], tF = io.now();
          tables[fs2.name] = io.readTable(ss, fs2.name, fs2.requiredCols, fs2.optional === true);
          tableMs[fs2.name] = io.now() - tF;
          readCount++;
        }
        readerMode = 'SPREADSHEETAPP_FALLBACK';
      }
    } else {
      restSpecs = b1Specs.concat(restSpecs);   // no batch reader available: every table takes the old path
    }

    for (var j = 0; j < restSpecs.length; j++) {
      var rspec = restSpecs[j];
      // §A1 - TIME EACH SHEET. `serverDurationMs = 30833` names the total and nothing else, so the next
      // question ("which sheet") had no answer but a guess. Per-table timing is what turns one number into a
      // decision about which table to stop reading. It survives on this path, and CANNOT on the batch one.
      var tF2 = io.now();
      tables[rspec.name] = io.readTable(ss, rspec.name, rspec.requiredCols, rspec.optional === true);
      tableMs[rspec.name] = io.now() - tF2;
      readCount++;
    }
    _stage('READ_TABLES', tOpen);
    var tBuild = io.now();
    var vm = sirWorkspaceBuild_(tables, payload);
    _stage('BUILD_VIEW_MODEL', tBuild);
    // §B - serverDurationMs was ALREADY here and the client was reporting server execution time as null. It
    // is now carried through to the page's stage report, together with what the projection actually removed,
    // so "the read is slow" can be answered with a number from the side that did the work.
    var rowsOut = 0, wKeys = [];
    for (var t2 in vm.counts) { if (Object.prototype.hasOwnProperty.call(vm.counts, t2)) rowsOut += vm.counts[t2]; }
    for (var w2 in vm.recentWindow) { if (Object.prototype.hasOwnProperty.call(vm.recentWindow, w2)) wKeys.push(w2); }
    // §A1 - the slowest tables, named. Sorted descending and capped at five: enough to decide, small enough
    // that the meta never becomes a log of its own.
    var slow = [];
    for (var tn in tableMs) { if (Object.prototype.hasOwnProperty.call(tableMs, tn)) slow.push({ table: tn, ms: tableMs[tn], rows: (vm.counts[tn] || 0) }); }
    slow.sort(function (a, b) { return b.ms - a.ms; });
    // The `rows` half of slowestTables, preserved for every table however it was read. Per-table TIMING is
    // what the batch transport cannot produce; per-table ROW COUNTS it can, and dropping them too would lose
    // information for no reason.
    var perTableRows = {};
    for (var pr2 in vm.counts) { if (Object.prototype.hasOwnProperty.call(vm.counts, pr2)) perTableRows[pr2] = vm.counts[pr2]; }
    return sirBuildEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: readCount,
      rowsReturned: rowsOut, recentWindow: (wKeys.length ? vm.recentWindow : null),
      // §A1 - THE REQUEST CONTRACT, echoed. `recentWindowRequested` is what the caller asked for and
      // `recentWindowApplied` is what happened; a true beside a false means the request lost the field on the
      // way in, which is precisely the defect R4 shipped and this log would have caught on day one.
      recentWindowRequested: (vm.requestEcho && vm.requestEcho.recentWindow === true),
      recentWindowApplied: (wKeys.length > 0),
      onlyRequested: (vm.requestEcho && vm.requestEcho.only) || null,
      // S8-R4B-2D §4 — the same asked/applied pair the recentWindow contract already proved it needed. A
      // true beside a null means the field was dropped on the way in, which is precisely how R4 shipped a
      // projection nobody was running and nobody could see.
      siteScopeRequested: (vm.requestEcho && vm.requestEcho.siteScope) || null,
      siteScopeApplied: (vm.siteScope && vm.siteScope.tables) ? vm.siteScope.tables : null,
      openMs: openMs,
      // S8-R4D-E2 §15 - slowestTables STAYS AN ARRAY. The audit found three consumers; the one at
      // inventory-replenishment.js:10200 calls .forEach on whatever arrives and sits in no try/catch, so a
      // string or object sentinel would raise a TypeError on the page. Under the batch reader there is no
      // per-table timing to report - one batchGet has one duration - so the array is EMPTY BY TRANSPORT and
      // the typed marker lives beside it. Empty-because-batched and empty-because-nothing-was-read are
      // different facts, which is what timingMode is for.
      slowestTables: slow.slice(0, 5),
      readerMode: readerMode,
      timingMode: (readerMode === 'SHEETS_API') ? 'BATCH' : 'PER_TABLE',
      perTableTiming: (readerMode === 'SHEETS_API') ? 'UNAVAILABLE_IN_BATCH_MODE' : 'AVAILABLE',
      batchMetadataMs: b1Profile ? b1Profile.metadataMs : null,
      batchValuesMs: b1Profile ? b1Profile.batchGetMs : null,
      normalizationMs: b1Profile ? b1Profile.normalizationMs : null,
      // R45 §B - the work and its bridge cost, side by side. R44's ratio was exactly 2 calls per cell.
      dateCellsConverted: b1Profile ? b1Profile.dateCellsConverted : null,
      tzProbeCalls: b1Profile ? b1Profile.tzProbeCalls : null,
      rangeCount: b1Profile ? b1Profile.rangeCount : null,
      remoteCallCount: b1Profile ? b1Profile.remoteCalls : null,
      perTableRows: perTableRows,
      dateMapVersion: SIR_B1_DATE_MAP_VERSION_,
      // §14 - NO SILENT FALLBACK. An unreported fallback is indistinguishable from the feature working,
      // which is how a dependency outage hides until the day both readers fail at once.
      primaryReader: 'SHEETS_API',
      fallbackUsed: fallbackUsed,
      fallbackReason: fallbackReason,
      fallbackErrorClass: fallbackErrorClass,
      fallbackCount: fallbackCount,
      finalReader: (readerMode === 'SHEETS_API') ? 'SHEETS_API' : 'SPREADSHEET_APP',
      // R6-R5 §3 — the entry and stage evidence. `handlerExitAt` closes the interval, so the client can compare
      // (handlerExitAt - routerEntryAt) against its OWN elapsed time: a large difference is transport or queue,
      // a small one means the two clocks agree and the time was spent here.
      entry: _entry,
      stages: _stages.concat([{ stage: 'SERIALIZE_AND_EXIT', started_ms: t0, elapsed_ms: (io.now() - t0) }]),
      handlerEntryAt: (_entry && _entry.routerEntryAt !== null) ? (_entry.routerEntryAt + _entry.routerToHandlerMs) : null,
      handlerExitAt: Date.now(),
      // No lock is taken on this path. Stated, so "lock contention" is an answered question and not an
      // unexamined possibility.
      lock: null,
      handler: 'handleInventoryReplenishmentWorkspaceGet_',
      serverBuild: (typeof SIR_BUILD_VERSION_ !== 'undefined') ? SIR_BUILD_VERSION_ : null });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'INVENTORY_REPLENISHMENT_WORKSPACE_BUILD_FAILED';
    return sirBuildEnvelope_(false, null, [{ code: code, message: String(e && e.message || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0), entry: _entry, stages: _stages,
        handler: 'handleInventoryReplenishmentWorkspaceGet_', lock: null,
        serverBuild: (typeof SIR_BUILD_VERSION_ !== 'undefined') ? SIR_BUILD_VERSION_ : null });
  }
}
