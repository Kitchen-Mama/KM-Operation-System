// Kitchen Mama Operation System — F1-7G-FC-SUMMARY-WORKSPACE-AND-CUTOVER-R1
// Proves the scoped FC Summary workspace + page primary-render cutover WITHOUT changing business output:
//   - backend 58_ reads ONLY the FC Summary primary-render table set (fc_regular_forecast / fc_special_events /
//     fc_target_rules / marketplaces); never getOperationDb; returns RAW passthrough of the FULL tables (the page's
//     Year dropdown + non-cascading filter universes need the complete set); NO Target% adjustment, NO blending, NO
//     Gap/Recommendation; a non-silent `capped` backstop;
//   - the db-api adapter runs the SAME normalizers + per-array filters as normalizeOperationDb → arrays byte-identical
//     to the legacy getters (getFcRegularForecast / getFcSpecialEvents / getFcTargetRules / getMarketplaces);
//   - the ACTUAL browser render getters (_getDbFcRegularData / _getDbFcEventData / _getDbTargetRules) produce IDENTICAL
//     output from the Workspace read-model as from the Legacy broad-cache getters (BEFORE == AFTER, whole render shape);
//   - fcSummary activated CANONICAL; router dispatch present; the page sources its primary read from the workspace (no
//     getOperationDb/loadOperationDb/_opDbCache in the primary read path), fail-closed on error; SECONDARY builder modals
//     lazy-load the broad cache; the Special Event WRITE path (Event Assist) is UNCHANGED (deferred redesign).
// Run: node assets/tests/api-fc-summary-workspace-f1-7g-r1.test.js
// NOTE: no 'use strict' — extracted pure builders + browser fns are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
// Extract an assigned function expression (e.g. window.KM.DB.x = function(){...}) by balanced braces from the marker.
function extractAssignedFn(src, marker) {
  var i = src.indexOf(marker); if (i < 0) throw new Error('not found: ' + marker);
  var k = src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); } }
  throw new Error('unbalanced: ' + marker);
}

var GS58 = read('specs/active/apps-script/58_api_v1_fc_summary_workspace.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var FND = read('js/api/km-api-foundation.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var FC_JS = read('js/pages/fc-summary.js');

// module-scope stubs the eval'd browser fns reference
var window = { KM: { DB: {} } };
var _fcReadModel = null;

// eval the PURE builder block of 58_ (constants + pure functions; the impure io orchestrator is excluded)
eval(slice(GS58, 'var FCS_WS_SEQ_', '// --------------------------------------------------------------------------------------------------------\n// IMPURE'));

// eval the ACTUAL db-api FC normalizers + helpers (the adapter + legacy getters both use these)
eval(['_fcParseEventPeriodDates', 'normalizeMarketplaceRecord', 'normalizeFcRegularForecastRecord', 'normalizeFcSpecialEventRecord', 'normalizeFcTargetRuleRecord']
  .map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
// eval the ACTUAL adapter (assigns window.KM.DB.adaptFcSummaryWorkspace)
eval(extractAssignedFn(DBAPI, 'window.KM.DB.adaptFcSummaryWorkspace = function') + ';');

// eval the ACTUAL browser render getters + accessors + label resolver (they read _fcReadModel / window.KM.DB.getX)
eval(slice(FC_JS, "var _FC_MONTH_KEYS =", "function _getDbTargetRules"));  // pulls in the _FC_MONTH_KEYS const region
eval(['_fcGetRegularForecast', '_fcGetSpecialEvents', '_fcGetTargetRules', '_fcGetMarketplaces',
      '_getDbFcRegularData', '_getDbFcEventData', '_getDbTargetRules', '_fcMarketplaceLabel']
  .map(function (n) { return extractFn(FC_JS, n); }).join('\n'));

// -------------------------------------------------------------------------------------------------------------------
// Fixture — raw sheet rows (as read from the tabs). Includes a JUNK row per table to prove the filter parity.
// -------------------------------------------------------------------------------------------------------------------
var M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function regRow(o) { var r = {}; M.forEach(function (m, i) { r[m] = (o.months ? o.months[i] : 0); }); r.forecast_id = o.forecast_id; r.sku = o.sku; r.year = o.year; r.company = o.company; r.country = o.country; r.marketplace = o.marketplace; r.category = o.category; r.series = o.series; r.forecast_status = o.forecast_status || 'active'; r.fc_share = o.fc_share || ''; return r; }
var rawTables = {
  fc_regular_forecast: [
    regRow({ forecast_id: 'FC1', sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'amazon_us', category: 'Kitchen', series: 'Pro', months: [10, 20, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
    regRow({ forecast_id: 'FC2', sku: 'GA0451', year: '2026', company: 'ResTW', country: 'TW', marketplace: 'shopee_tw', category: 'Kitchen', series: 'Lite', months: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] }),
    regRow({ forecast_id: 'FC3', sku: 'GA0450', year: '2027', company: 'ResUS', country: 'US', marketplace: 'amazon_us', category: 'Kitchen', series: 'Pro', months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),  // zero-FC row (0 ≠ null)
    { forecast_id: '', sku: '', year: '2026', jan: 9 }   // JUNK — no forecast_id, no sku → filtered by normalizeOperationDb + adapter identically
  ],
  fc_special_events: [
    { event_fc_id: 'E1', campaign_id: 'C1', sku: 'GA0450', company: 'KM', country: 'US', marketplace: 'amazon_us', category: 'Kitchen', series: 'Pro', event: 'Prime Day', event_period: '2026-07-10 ~ 2026-07-12', fc_qty: 100, year: '2026', status: 'active' },
    { event_fc_id: 'E2', campaign_id: 'C2', sku: 'GA0451', company: 'ResTW', country: 'TW', marketplace: 'shopee_tw', event_name: 'Double 11', event_period: '', fc_qty: 50, year: '2026', status: 'active' },
    { event: '', sku: '', scope_id: '', fc_qty: 7 }   // JUNK — no event/sku/scopeId → filtered identically
  ],
  fc_target_rules: [
    { target_rule_id: 'T1', scope_type: 'Category', scope_id: 'Kitchen', year: '2026', marketplace: 'amazon_us', category: 'Kitchen', jan_pct: 110, feb_pct: 120, target_percentage: 110 },
    { target_rule_id: '', scope_id: '' }   // JUNK — no ruleId/scopeId → filtered identically
  ],
  marketplaces: [
    { marketplace_id: 'MK1', company: 'KM', country: 'US', marketplace: 'amazon_us', marketplace_display_name: 'Amazon US', status: 'active' },
    { marketplace_id: 'MK2', company: 'ResTW', country: 'TW', marketplace: 'shopee_tw', marketplace_display_name: 'Shopee TW', status: 'active' },
    { }   // JUNK — no marketplaceId/marketplace → filtered identically
  ]
};

// LEGACY arrays = exactly what normalizeOperationDb builds (map → same per-array filter).
var legacyRegular = rawTables.fc_regular_forecast.map(normalizeFcRegularForecastRecord).filter(function (r) { return r.forecastId || r.sku; });
var legacyEvents = rawTables.fc_special_events.map(normalizeFcSpecialEventRecord).filter(function (r) { return r.event || r.sku || r.scopeId; });
var legacyRules = rawTables.fc_target_rules.map(normalizeFcTargetRuleRecord).filter(function (r) { return r.scopeId || r.ruleId; });
var legacyMarkets = rawTables.marketplaces.map(normalizeMarketplaceRecord).filter(function (r) { return r.marketplaceId || r.marketplace; });

// -------------------------------------------------------------------------------------------------------------------
console.log('\n== fcsWorkspaceBuild_ View-Model: raw passthrough of the FULL primary-render tables ==');
var vm = fcsWorkspaceBuild_(rawTables, {});
eq(vm.fcRegularForecast.length, 4, 'regular passthrough keeps ALL raw rows (incl junk — the adapter filters, not the builder)');
eq(vm.fcSpecialEvents.length, 3, 'events raw passthrough (full set)');
eq(vm.fcTargetRules.length, 2, 'target rules raw passthrough (full set)');
eq(vm.marketplaces.length, 3, 'marketplaces raw passthrough (full set)');
ok(vm.fcRegularForecast[0].forecast_id === 'FC1' && vm.fcRegularForecast[0].jan === 10, 'regular rows are RAW (unmodified sheet rows)');
eq(vm.summary.years, ['2027', '2026'], 'summary.years = distinct fc_regular years, desc (informational; page derives its own)');
eq(vm.counts, { fcRegularForecast: 4, fcSpecialEvents: 3, fcTargetRules: 2, marketplaces: 3 }, 'counts reflect the raw set');
eq(vm.capped, { fcRegularForecast: false, fcSpecialEvents: false, fcTargetRules: false, marketplaces: false }, 'nothing capped under the backstop');
ok(fcsWorkspaceBuild_(rawTables, { include: { summary: false } }).summary === null, 'include.summary:false → summary omitted');
// empty / missing-safe
var vmEmpty = fcsWorkspaceBuild_({}, {});
eq(vmEmpty.fcRegularForecast.length, 0, 'empty tables → 0 regular (EMPTY ≠ ERROR)');
eq(vmEmpty.summary.years, [], 'empty → no years');

console.log('\n== non-silent cap backstop (FCS_WS_ROW_MAX_) ==');
var big = []; for (var i = 0; i < 50001; i++) big.push({ sku: 'S' + i });
var capd = fcsCap_(big);
ok(capd.capped === true && capd.rows.length === 50000 && capd.total === 50001, 'fcsCap_ truncates at 50000 and REPORTS capped=true + true total (never silent)');
ok(fcsCap_([{ sku: 'x' }]).capped === false, 'fcsCap_ under the cap → capped=false');

console.log('\n== db-api adapter == legacy getters (BEFORE == AFTER via SAME normalizers + SAME filters) ==');
var adapted = window.KM.DB.adaptFcSummaryWorkspace(vm);
eq(adapted.fcRegularForecast, legacyRegular, 'adapted fcRegularForecast === getFcRegularForecast() array (junk row dropped identically)');
eq(adapted.fcSpecialEvents, legacyEvents, 'adapted fcSpecialEvents === getFcSpecialEvents() array');
eq(adapted.fcTargetRules, legacyRules, 'adapted fcTargetRules === getFcTargetRules() array');
eq(adapted.marketplaces, legacyMarkets, 'adapted marketplaces === getMarketplaces() array');
eq(adapted.fcRegularForecast.length, 3, 'adapter drops the junk regular row (filter parity)');
eq(adapted.fcSpecialEvents.length, 2, 'adapter drops the junk event row');
ok(adapted.fcRegularForecast[0].raw && adapted.fcRegularForecast[0].raw.forecast_id === 'FC1', 'adapted record preserves .raw passthrough (the render getters read r.raw)');

console.log('\n== BEFORE == AFTER: ACTUAL browser render getters — Workspace read-model vs Legacy broad-cache ==');
// LEGACY render (broad cache): _fcReadModel = null; getters return the normalizeOperationDb arrays
_fcReadModel = null;
window.KM.DB.getFcRegularForecast = function () { return legacyRegular; };
window.KM.DB.getFcSpecialEvents = function () { return legacyEvents; };
window.KM.DB.getFcTargetRules = function () { return legacyRules; };
window.KM.DB.getMarketplaces = function () { return legacyMarkets; };
var legRegular = _getDbFcRegularData(), legEvent = _getDbFcEventData(), legRules = _getDbTargetRules();
var legLabel = _fcMarketplaceLabel('amazon_us', 'KM', 'US');
// WORKSPACE render: _fcReadModel = adapted DTO; getters MUST NOT be consulted
window.KM.DB.getFcRegularForecast = function () { throw new Error('primary render must not hit the broad-cache getter in Workspace mode'); };
window.KM.DB.getFcSpecialEvents = function () { throw new Error('no getter'); };
window.KM.DB.getFcTargetRules = function () { throw new Error('no getter'); };
window.KM.DB.getMarketplaces = function () { throw new Error('no getter'); };
_fcReadModel = adapted;
var wsRegular = _getDbFcRegularData(), wsEvent = _getDbFcEventData(), wsRules = _getDbTargetRules();
var wsLabel = _fcMarketplaceLabel('amazon_us', 'KM', 'US');
eq(wsRegular, legRegular, 'Regular Forecast render shape: Workspace == Legacy (whole array, incl months/company/category)');
eq(wsEvent, legEvent, 'Special Event render shape: Workspace == Legacy (incl r.raw-derived eventId/campaignId/eventName)');
eq(wsRules, legRules, 'Target Rules render shape: Workspace == Legacy (incl per-month pct fallback)');
eq(wsLabel, legLabel, 'marketplace label resolution: Workspace == Legacy'); ok(wsLabel === 'Amazon US', 'label resolves display name from the read-model marketplaces');
ok(wsRegular.length === 3 && wsRegular.some(function (r) { return r.company === 'KM'; }) && wsRegular.some(function (r) { return r.company === 'ResTW'; }) && wsRegular.some(function (r) { return r.company === 'ResUS'; }), 'multi-company (KM/ResTW/ResUS) passthrough — no company inference');
ok(wsRegular.filter(function (r) { return String(r.year) === '2027'; }).length === 1, 'year-crossing: 2027 row present (full set feeds the Year dropdown universe)');
var zeroRow = wsRegular.filter(function (r) { return r.sku === 'GA0450' && String(r.year) === '2027'; })[0];
ok(zeroRow && zeroRow.months.reduce(function (a, b) { return a + b; }, 0) === 0, 'zero-FC row renders as 0 (0 ≠ absent)');

console.log('\n== source guards: 58_ read-only, no getOperationDb, no Target%/blend/Gap/Recommendation authority ==');
var code58 = GS58.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code58), '58_ never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code58), '58_ writes nothing (read-only)');
ok(!/target_percentage|_pct\b|\*\s*\(1\s*\+|Math\.round|adjust|blend|allocat|recommend|calculateGap|order_planning_gap/i.test(code58), '58_ applies NO Target% / blending / allocation / Gap / Recommendation (raw forecast authority only)');
ok(/action === 'fcSummary\.workspace\.get'/.test(ROUTER) && /handleFcSummaryWorkspaceGet_\(body\)/.test(ROUTER), 'router dispatches fcSummary.workspace.get');
ok(/action: 'fcSummary\.workspace\.get'/.test(code58) && !/fcSummary\.raw\.get/.test(code58), '58_ code owns the .workspace.get action, distinct from the 53_ .raw.get owner');

console.log('\n== activation + registration ==');
ok(/WORKSPACE_CANONICAL = \{[^}]*fcSummary: true/.test(FND), 'fcSummary is CANONICAL');
ok(/WORKSPACE_ENABLED_DEFAULT = \{[^}]*fcSummary: true/.test(FND), 'fcSummary per-workspace flag defaults ON');
ok(/register\('fcSummary', \{[^}]*status: WORKSPACE_STATUS\.IMPLEMENTED, resolver: fcSummaryResolver/.test(FND), 'fcSummary registered IMPLEMENTED with resolver');
ok(/action: 'fcSummary\.workspace\.get'/.test(FND), 'foundation DTO targets fcSummary.workspace.get');
ok(/KM\.DB\.adaptFcSummaryWorkspace = function/.test(DBAPI), 'db-api exposes adaptFcSummaryWorkspace');

console.log('\n== page: workspace primary read, no broad DB in the read path, fail-closed, deferred Event Assist ==');
ok(/workspaceApiActive\('fcSummary'\)/.test(FC_JS), 'fc-summary: gates on canonical fcSummary workspace');
ok(/getWorkspace\('fcSummary'/.test(FC_JS) && /adaptFcSummaryWorkspace/.test(FC_JS), 'fc-summary: primary read via scoped workspace + adapter');
var refresh = extractFn(FC_JS, '_fcWorkspaceRefresh_');
ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(refresh), 'fc-summary: the scoped read path has NO getOperationDb/loadOperationDb/_opDbCache');
ok(/FC_SUMMARY_READ_FAILED|WORKSPACE_UNAVAILABLE/.test(FC_JS), 'fc-summary: fail-closed bounded read error');
var ensure = extractFn(FC_JS, '_fcSummaryEnsureDbAndRender');
ok(/_fcEffectiveWorkspace\(\)/.test(ensure) && ensure.indexOf('loadOperationDb') > ensure.indexOf('Legacy'), 'fc-summary: broad load lives ONLY in the Legacy branch (no silent fallback in the Workspace branch)');
ok(/KM\.loadState\.createRegion/.test(FC_JS), 'fc-summary: reuses KM.loadState (no new loading infra)');
ok(/function _fcAfterWrite/.test(FC_JS) && /_fcWorkspaceRefresh_\(\)\.then/.test(FC_JS), 'fc-summary: post-write does a SCOPED re-read (never a broad reload for the primary render)');
// scoped post-write is wired into the live write success paths (not left render-only)
ok(/_fcAfterWrite\(function \(\) \{\s*exitEditMode/.test(FC_JS), 'Base Forecast save → _fcAfterWrite (scoped refresh)');
ok(/_fcAfterWrite\(function \(\) \{\s*exitEventEditMode/.test(FC_JS), 'Special Event inline save → _fcAfterWrite');
ok((FC_JS.match(/_fcAfterWrite\(/g) || []).length >= 7, 'all 7 live write success paths reconcile via _fcAfterWrite');
// SECONDARY builder modals lazy-load the broad cache; primary render never depends on it
ok(/function _fcEnsureBroadCacheThen/.test(FC_JS), 'fc-summary: SECONDARY builder modals lazy-load the broad cache');
ok(/_fcEnsureBroadCacheThen\(openRegularUpdateModal\)/.test(FC_JS) && /_fcEnsureBroadCacheThen\(openEventModal\)/.test(FC_JS), 'Regular + Special-Event builders guard-lazy-load the broad cache on open');
// Event Assist WRITE authority UNCHANGED (deferred redesign) — still browser-computed + submitted verbatim
ok(/function _evtApplyForecastAssist/.test(FC_JS) && /Math\.round\(b \* \(1 \+ growth \/ 100\)\)/.test(FC_JS), 'Event Assist compute is UNCHANGED (browser-computed growth — flagged EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED, not touched)');
ok(/upsertFcSpecialEvent/.test(FC_JS), 'Special Event WRITE path (upsertFcSpecialEvent) is unchanged');

console.log('\n----------------------------------------');
console.log('API FC SUMMARY WORKSPACE (F1-7G-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
