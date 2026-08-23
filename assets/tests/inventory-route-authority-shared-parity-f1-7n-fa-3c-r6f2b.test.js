// F1-7N-FA-3C-DRAFT-MODEL-R6F2B — shared route-authority (KMRA) + Execution-Plan/AI parity + stage accounting +
// GAP_JOB_INVENTORY authority + user-edit ownership. Verifies the R6F2B mapping repair:
//   A  GAP job authority: the dry assembly reads GAP_JOB_INVENTORY (status/runId), requires DONE, excludes MONTHLY_ORDER.
//   B  ONE shared candidate authority (KMRA) — KMWRR delegates to it; the old strict lane no longer over-blocks.
//   D  explicit normalization + warehouse resolution priority (exact id → active code in company/country → alias → BLOCK).
//   E  reviewed, enumerated method-alias authority (no fuzzy).
//   F  stage accounting: resolved + blocked == incoming at every stage; the 176/5/171 leak is fixed.
//   G  Execution-Plan UI (_execRateCardMethods) and KMRA.eligibleMethods produce IDENTICAL method sets (parity).
//   H  buildDraftLinePayload user-edit ownership: qty-edit marks override; reset clears; note-only never marks.
// Pure modules run via require; the EP predicate + the .gs stage-accounting fn are extracted from source and eval'd.
// Run: node assets/tests/inventory-route-authority-shared-parity-f1-7n-fa-3c-r6f2b.test.js
'use strict';
var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var KMRA = require('../js/core/supply-planning-route-authority');
var KMWRR = require('../js/core/supply-planning-weekly-route-derivation');
var IRC = require('../js/utils/inventory-compat');
var IRDraft = IRC.IRDraft || IRC;   // inventory-compat exports the draft builders

var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

// balanced-brace extractor for a top-level `function NAME(` in source text
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('fn not found: ' + name);
  var i = src.indexOf('{', start), depth = 0, j = i;
  for (; j < src.length; j++) { var ch = src[j]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(start, j);
}

// =====================================================================================================
section('B/G — shared candidate authority: blank card axis = wildcard (EP parity), non-blank matched exactly');
var cards = [
  { origin_country: 'CN', destination_country: 'US', marketplace: '', shipping_method: 'Air', shipping_method_label: 'Air Freight', status: 'active' },
  { origin_country: 'CN', destination_country: 'US', marketplace: '', shipping_method: 'Sea', status: 'active' },
  { origin_country: 'CN', destination_country: 'US', marketplace: 'US Walmart', shipping_method: 'Courier', status: 'active' },   // marketplace-specific
  { origin_country: 'CN', destination_country: 'JP', marketplace: '', shipping_method: 'Air', status: 'inactive' }               // wrong dest + inactive
];
// query: CN→US, marketplace 'US Amazon' — the two blank-marketplace CN→US cards are wildcards (eligible); the
// US-Walmart-specific card is NOT (non-blank marketplace ≠ query); the JP/inactive card is excluded.
var elig = KMRA.eligibleMethods({ originCountry: 'CN', destinationCountry: 'US', marketplace: 'US Amazon' }, cards);
eq(elig.length, 2, 'B1 two country-level (blank-marketplace) methods eligible for a marketplace query');
ok(elig.some(function (m) { return m.value === 'Air' && m.label === 'Air Freight'; }), 'B2 label falls back to shipping_method_label');
ok(!elig.some(function (m) { return m.value === 'Courier'; }), 'B3 a marketplace-SPECIFIC card does not match a different marketplace (non-blank exact)');

// EP predicate extracted from the live page — asserts byte-identical eligible sets (G, no frontend/backend disagreement)
var PAGE = read('js/pages/inventory-replenishment.js');
var epFactory = eval('(function(){'
  + 'var _irCarrierFixture=[];'
  + 'function _irCarrierGet(){ return _irCarrierFixture; }'
  + extractFn(PAGE, '_execRateCardUsable') + '\n'
  + extractFn(PAGE, '_execRateCardMethods') + '\n'
  + 'return { methods: _execRateCardMethods, set: function(c){ _irCarrierFixture = c; } };'
  + '})');
var epScope = epFactory();
epScope._execRateCardMethods = epScope.methods;
epScope._set = epScope.set;
// the EP model uses camelCase; build the same fixture in camelCase and RAW snake_case for KMRA
function toCamel(rc) { return { originCountry: rc.origin_country, destinationCountry: rc.destination_country, marketplace: rc.marketplace, shippingMethod: rc.shipping_method, shippingMethodLabel: rc.shipping_method_label, status: rc.status }; }
var parityFixtures = [
  { q: { originCountry: 'CN', destinationCountry: 'US', marketplace: 'US Amazon' } },
  { q: { originCountry: '', destinationCountry: 'US', marketplace: 'US Walmart' } },
  { q: { originCountry: 'CN', destinationCountry: '', marketplace: '' } },
  { q: { originCountry: 'US', destinationCountry: 'JP', marketplace: '' } }
];
parityFixtures.forEach(function (f, i) {
  epScope._set(cards.map(toCamel));
  var epOut = epScope._execRateCardMethods(f.q.originCountry, f.q.destinationCountry, f.q.marketplace);
  var raOut = KMRA.eligibleMethods(f.q, cards, { asOfOrdinal: null });
  eq(JSON.stringify(raOut), JSON.stringify(epOut), 'G' + (i + 1) + ' KMRA.eligibleMethods == Execution-Plan _execRateCardMethods on shared fixture ' + i);
});

// =====================================================================================================
section('B — KMWRR now resolves a marketplace-destination route via the shared authority (the 171-block fix)');
var whById = { W1: { warehouse_id: 'W1', warehouse_code: 'CN1', company: 'KM', country: 'CN', is_active: true } };
var lts = [{ origin_country: 'CN', destination_country: 'US', shipping_method: 'Air', avg_days: '7' }, { origin_country: 'CN', destination_country: 'US', shipping_method: 'Sea', avg_days: '40' }];
var r = KMWRR.deriveRoute({ source: { warehouse_id: 'W1' }, destination: { kind: 'MARKETPLACE', marketplace: 'US Amazon', country: 'US' }, requiredByDate: '2026-09-30', shipDate: '2026-08-22', warehousesById: whById, rateCards: cards, leadTimes: lts });
ok(r.ok, 'B4 country-level (blank-marketplace) cards now route a MARKETPLACE destination (previously ROUTE_METHOD_UNRESOLVED)');
eq(r.route.recommended_shipping_method, 'Air', 'B5 on-time Air chosen over cheaper-but-late Sea');

// =====================================================================================================
section('E — reviewed, enumerated method-alias authority (no fuzzy)');
ok(Array.isArray(KMRA.METHOD_ALIAS_RULES) && KMRA.METHOD_ALIAS_RULES.length === 5, 'E1 five reviewed alias buckets (Air/Sea Express/Sea/Courier + R6F2D Truck)');
eq(KMRA.canonicalMethodKey('Air Freight'), 'Air', 'E2 Air');
eq(KMRA.canonicalMethodKey('Sea Express Lane'), 'Sea Express', 'E3 Sea Express before Sea');
eq(KMRA.canonicalMethodKey('Sea'), 'Sea', 'E4 Sea');
eq(KMRA.canonicalMethodKey('Courier Prime'), 'Courier', 'E5 Courier');
eq(KMRA.canonicalMethodKey('Rail'), '', 'E6 Rail is deliberately unmapped (fail-closed, never guessed)');
eq(KMRA.canonicalMethodKey('teleport'), '', 'E7 unknown label → unmapped (no nearest-text)');

// =====================================================================================================
section('D — warehouse resolution priority (exact id → active code in company/country → alias → BLOCK; multi → BLOCK)');
var whs = [
  { warehouse_id: 'W1', warehouse_code: 'CN1', company: 'KM', country: 'CN', is_active: true },
  { warehouse_id: 'W2', warehouse_code: 'DUP', company: 'KM', country: 'US', is_active: true },
  { warehouse_id: 'W3', warehouse_code: 'DUP', company: 'KM', country: 'US', is_active: true },
  { warehouse_id: 'W4', warehouse_code: 'OLD', company: 'KM', country: 'CN', is_active: false }
];
var idx = KMRA.indexWarehouses(whs);
eq(KMRA.resolveWarehouse({ id: 'W1' }, idx).matched_by, 'exact_id', 'D1 exact id wins');
eq(KMRA.resolveWarehouse({ id: 'W4' }, idx).block, 'WAREHOUSE_INACTIVE', 'D2 inactive id blocks');
eq(KMRA.resolveWarehouse({ id: 'ZZ' }, idx).block, 'WAREHOUSE_UNKNOWN', 'D3 unknown id blocks');
eq(KMRA.resolveWarehouse({ code: 'CN1', company: 'KM', country: 'CN' }, idx).warehouse_id, 'W1', 'D4 exact active code within company/country');
eq(KMRA.resolveWarehouse({ code: 'DUP', company: 'KM', country: 'US' }, idx).block, 'WAREHOUSE_AMBIGUOUS', 'D5 multiple code matches BLOCK (never first-row)');
eq(KMRA.resolveWarehouse({ code: 'ALIAS9' }, idx, { alias9: 'W1' }).matched_by, 'alias', 'D6 explicit reviewed alias resolves');
eq(KMRA.resolveWarehouse({ code: 'NOPE' }, idx).block, 'WAREHOUSE_UNKNOWN', 'D7 no code match + no alias BLOCK');

// =====================================================================================================
section('F — per-stage accounting: resolved + blocked == incoming at every stage (the 176/5/171 leak fixed)');
var stageFn = extractFn(read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs'), 'TEMP_r6f2bStageAccounting_');
var TEMP_r6f2bStageAccounting_ = eval('(' + stageFn + ')');
// R6F2C — the accounting now derives from the canonical per-line stage_tally (not a histogram). Live-reported shape:
// 176 positive, 5 source-blocked (multi-pool/unknown), 171 method-blocked, 0 fully routed.
var G = { positive_recommendation_count: 176, blocked_lines: 176, fully_routed_lines: 0,
  stage_tally: { source_incoming: 176, source_resolved: 171, source_blocked: 5,
    dest_incoming: 171, dest_concrete: 171, dest_logical: 0, dest_blocked: 0,
    method_incoming: 171, method_ai_ranked: 0, method_manual_only: 0, method_blocked: 171,
    last_mile_incoming: 0, last_mile_resolved: 0, last_mile_blocked: 0 } };
TEMP_r6f2bStageAccounting_(G);
eq(G.source_resolved, 171, 'F1 source_resolved is 171 (lines that PASSED the source stage) — not the R6F2A 0');
eq(G.source_unresolved, 5, 'F2 source_unresolved = 5 (the multi-pool null-source lines)');
eq(G.method_unresolved, 171, 'F3 method stage blocks 171');
ok(G.stage_accounting.source.identity_ok && G.stage_accounting.destination.identity_ok && G.stage_accounting.method.identity_ok && G.stage_accounting.last_mile.identity_ok, 'F4 resolved+blocked==incoming holds at every stage');
ok(G.stage_accounting.fully_routed_matches_last_mile_resolved, 'F5 fully_routed == last-mile-resolved (both 0 here)');
ok(G.stage_accounting_ok === true, 'F6 overall stage accounting reconciles');
eq(G.blocked_positive_lines, 176, 'F7 blocked_positive_lines populated (the verdict metric the R6F2A code never set)');
// a fully-clean scenario — 10 lines flow all the way through
var G2 = { positive_recommendation_count: 10, blocked_lines: 0, fully_routed_lines: 10,
  stage_tally: { source_incoming: 10, source_resolved: 10, source_blocked: 0,
    dest_incoming: 10, dest_concrete: 6, dest_logical: 4, dest_blocked: 0,
    method_incoming: 10, method_ai_ranked: 10, method_manual_only: 0, method_blocked: 0,
    last_mile_incoming: 10, last_mile_resolved: 10, last_mile_blocked: 0 } };
TEMP_r6f2bStageAccounting_(G2);
ok(G2.stage_accounting_ok === true && G2.source_resolved === 10 && G2.last_mile_resolved === 10, 'F8 clean scenario: all 10 flow through to fully routed');

// =====================================================================================================
section('A — GAP_JOB_INVENTORY authority: reader maps the real serialized shape + MONTHLY_ORDER exclusion');
var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
ok(/PropertiesService\.getScriptProperties\(\)\.getProperty\('GAP_JOB_INVENTORY'\)/.test(TEMP), 'A1 reads the GAP_JOB_INVENTORY script property');
ok(/\/\^GAP-INV-\/\.test\(String\(st\.runId/.test(TEMP), 'A2 requires a GAP-INV-* runId (never a MONTHLY_ORDER journal run)');
ok(/run_status:\s*TEMP_str_\(st\.status\)/.test(TEMP) && /calculation_date:\s*TEMP_str_\(st\.calculationDate\)/.test(TEMP), 'A3 maps the camelCase serialized fields (status/calculationDate/…)');
ok(/is_monthly_order_excluded/.test(TEMP), 'A4 proves the MONTHLY_ORDER exclusion');
// the dry assembly gates gapUsable on the REAL job status DONE (not gapCalcResolveContext_, which has no status)
ok(/TEMP_r6dLatestInventoryRun_\(\)/.test(TEMP) && /gapUsable = jobFound && runStatus === 'DONE'/.test(TEMP), 'A5 dry assembly gates on GAP_JOB_INVENTORY status===DONE (R6F2A read the pure date resolver → status null)');

// =====================================================================================================
section('H — buildDraftLinePayload user-edit ownership (override marker / reset / note-only / system snapshot)');
// qty edit away from recommendation → USER_EDITED_QTY
var pe = IRDraft.buildDraftLinePayload('SKU1', { allocation_draft_line_id: 'L1', planned_qty: 50, recommended_qty: 30 }, { system: false });
eq(pe.override_reason, 'USER_EDITED_QTY', 'H1 qty edited away from recommendation marks USER_EDITED_QTY');
ok(pe.recommended_qty === undefined, 'H2 a user edit never sends recommended_qty (protects the snapshot)');
// note-only edit (qty unchanged from recommendation) → NOT overridden
var pn = IRDraft.buildDraftLinePayload('SKU1', { allocation_draft_line_id: 'L1', planned_qty: 30, recommended_qty: 30, note: 'ship early' }, { system: false });
ok(pn.override_reason !== 'USER_EDITED_QTY', 'H3 note-only edit (qty == recommendation) does NOT mark the quantity overridden');
eq(pn.note, 'ship early', 'H4 note is user-owned (passed through)');
// explicit Reset to Recommendation → clears override + restores recommended qty
var pr = IRDraft.buildDraftLinePayload('SKU1', { allocation_draft_line_id: 'L1', planned_qty: 50, recommended_qty: 30, override_reason: 'USER_EDITED_QTY' }, { system: false, resetToRecommendation: true });
eq(pr.override_reason, '', 'H5 Reset to Recommendation clears the override');
eq(pr.planned_qty, 30, 'H6 Reset restores planned_qty = recommended_qty');
// system line carries recommended_qty and no override
var ps = IRDraft.buildDraftLinePayload('SKU1', { planned_qty: 30, recommended_qty: 30 }, { system: true });
eq(ps.recommended_qty, 30, 'H7 system line sends recommended_qty');
ok(ps.override_reason === undefined, 'H8 system line carries no user override');
// blank note stays blank (never backfilled) — no note key when the row carries none
var pb = IRDraft.buildDraftLinePayload('SKU1', { planned_qty: 5 }, { system: false });
ok(!('note' in pb), 'H9 a row with no note sends no note key (blank stays blank; never backfilled)');

console.log('\n----------------------------------------');
console.log('R6F2B SHARED ROUTE AUTHORITY + PARITY: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
