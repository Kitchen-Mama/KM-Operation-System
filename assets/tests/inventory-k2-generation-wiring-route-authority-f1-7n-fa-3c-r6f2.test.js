// R6F2 — K2 generation wiring + unified resolver + KMPC dedup + R6F2 diagnostics + K2 empty-header classifier.
// F1-7N-FA-3C-DRAFT-MODEL-R6F2. Run: node assets/tests/inventory-k2-generation-wiring-route-authority-f1-7n-fa-3c-r6f2.test.js
var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6F2 WIRING + RESOLVER + DEDUP + DIAGNOSTICS: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G61 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '61_api_v1_weekly_ai_plan.gs'), 'utf8').replace(/\r\n/g, '\n');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var PERS = fs.readFileSync(path.join(ROOT, 'js', 'core', 'supply-planning-persistence.js'), 'utf8').replace(/\r\n/g, '\n');

// ============================================================ A — KMPC planning_cycle dedup (#8)
section('A. KMPC activeKeyOf serializes planning_cycle EXACTLY once even if present in scope');
(function () {
  eval(extractFn(PERS, 'sortedScope'));
  eval(extractFn(PERS, 'scopeKey'));
  eval(extractFn(PERS, 'activeKeyOf'));
  var withCycleInScope = activeKeyOf('WEEKLY_SHIPPING', 'RECO-2026-08', { company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', planning_cycle: 'RECO-2026-08' });
  var without = activeKeyOf('WEEKLY_SHIPPING', 'RECO-2026-08', { company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv' });
  var occurrences = withCycleInScope.split('planning_cycle=').length - 1;
  ok(occurrences === 0, 'A1. scope-embedded planning_cycle is stripped (0 planning_cycle= segments; cycle rides the ::cycle:: prefix)');
  eq(withCycleInScope, without, 'A2. including planning_cycle in scope yields the SAME key as omitting it (no double-count)');
  ok(withCycleInScope.indexOf('::RECO-2026-08::') >= 0, 'A3. the cycle appears exactly once as the leading ::<cycle>:: segment');
})();

// ============================================================ B — unified K2-or-K3 active-draft resolver (16_)
section('B. sadResolveActiveDraftK2OrK3_ — route-complete → K2 (CREATE/REUSE/CONFLICT); no-route → K3');
(function () {
  eval(G16.match(/var SAD_STATUSES_ = \{[\s\S]*?\};/)[0]);
  eval(['sadFnv1a_', 'sadK2GroupKey_', 'sadK2DeterministicHeaderId_', 'sadK2ResolveActiveDraft_',
    'sadHeaderRouteIsComplete_', 'sadReadActiveHeaderRows_', 'sadResolveActiveDraft_', 'sadResolveActiveDraftK2OrK3_']
    .map(function (n) { return extractFn(G16, n); }).join('\n'));
  var HDR = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
    'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_source_warehouse_code_snapshot',
    'recommended_destination_warehouse_code_snapshot', 'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery'];
  function sheet(rows) { var data = [HDR].concat(rows.map(function (o) { return HDR.map(function (h) { return o[h] == null ? '' : o[h]; }); })); return { getDataRange: function () { return { getValues: function () { return data; } }; } }; }
  var routeHeader = { planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1' };
  // CREATE (no active rows) → K2 deterministic id
  var rC = sadResolveActiveDraftK2OrK3_(sheet([]), routeHeader);
  eq([rC.status, rC.k2], ['CREATE', true], 'B1. route-complete + no active → K2 CREATE');
  ok(/^SADH-K2-[0-9A-F]{8}$/.test(rC.id), 'B1. CREATE returns the deterministic SADH-K2- id');
  // REUSE (one active row with the SAME K2 key)
  var existing = { allocation_draft_id: rC.id, status: 'draft', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1' };
  var rR = sadResolveActiveDraftK2OrK3_(sheet([existing]), routeHeader);
  eq([rR.status, rR.id], ['REUSE', rC.id], 'B2. one active K2 match → REUSE that id');
  // CONFLICT (two active rows same K2 key)
  var e2 = JSON.parse(JSON.stringify(existing)); e2.allocation_draft_id = 'SADH-K2-DEADBEEF';
  var rX = sadResolveActiveDraftK2OrK3_(sheet([existing, e2]), routeHeader);
  eq(rX.status, 'CONFLICT', 'B3. >1 active K2 match → CONFLICT');
  ok(rX.conflictIds.length === 2, 'B3. conflict ids returned');
  // no-route scratchpad → K3
  var rK3 = sadResolveActiveDraftK2OrK3_(sheet([]), { planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv' });
  eq(rK3.k2, false, 'B4. no route intent → falls back to K3 resolution');
})();

// ============================================================ C — atomic core + manual core use the unified resolver
section('C. both the atomic core and the manual header core resolve via the unified K2-or-K3 resolver');
ok(/function sadAtomicUpsertCore_[\s\S]*?sadResolveActiveDraftK2OrK3_\(hSh, header/.test(G16), 'C1. atomic core uses sadResolveActiveDraftK2OrK3_');
var manualCore = extractFn(G16, 'sadUpsertDraftHeaderCore_');
ok(/sadResolveActiveDraftK2OrK3_\(sh, body/.test(manualCore), 'C2. manual header core uses the SAME unified resolver (generation + manual share K2 identity)');
ok(/else if \(res\.status === 'CREATE' && res\.id\)/.test(manualCore), 'C3. manual CREATE adopts the deterministic K2 id when present');

// ============================================================ D — 61_ generation wired to K2 (gated OFF)
section('D. 61_ generation: flag-gated OFF, routed to K2 route-group path via the atomic endpoint');
ok(/INVENTORY_AI_PLAN_DB_GENERATION_DISABLED/.test(G61) && /genEnabled\s*=\s*\(typeof inventoryAiPlanDbGenerationEnabled_/.test(G61), 'D1. entrypoint returns DISABLED (no generation) when the flag is false');
ok(/if \(!genEnabled\) \{[\s\S]{0,400}return jsonResponse_/.test(G61), 'D1. the flag gate returns BEFORE any generation (no K3, no K2 while OFF)');
ok(/return weeklyAiPlanGenerateK2_\(ss, mapped\.request, h, deps, body\)/.test(G61), 'D2. when enabled, generation routes to the K2 path (NOT the legacy K3 batch)');
ok(!/KMWRB\.generateWeeklyShippingRecommendationBatch/.test(G61), 'D2. the legacy K3 per-marketplace batch is no longer called by the entrypoint');
var genK2 = extractFn(G61, 'weeklyAiPlanGenerateK2_');
ok(/KMWRB\.buildWeeklySourceLines\(request\)/.test(genK2), 'D3. K2 path reuses the extracted per-source line production');
ok(/KMWRR\.buildK2GenerationPlan/.test(genK2), 'D3. K2 path derives routes + partitions via KMWRR');
// D4 SUPERSEDED, NOT WEAKENED. F1-7N-FB-4C-ADDENDUM-MIGRATION §A split this function into a pure compute pass
// and a write pass so the lifecycle schema gate can run BEFORE the first write, so the group being written is
// now `pl` (a planned group) rather than the loop-local `g`. What D4 exists to protect - the atomic endpoint and
// the K2 route guard being ON - is unchanged, and the split adds a guarantee D4 could not express: there is
// exactly ONE write site and it sits downstream of the gate.
ok(/handleUpsertShippingAllocationDraftAtomic_\(\{ header: pl\.header, lines: pl\.lines, enforce_k2_grouping: true \}\)/.test(genK2), 'D4. each K2 group is written via the ATOMIC endpoint with the K2 route guard ON');
ok((genK2.match(/handleUpsertShippingAllocationDraftAtomic_\(/g) || []).length === 1, 'D4. via exactly ONE write site, so no path can bypass the gate that precedes it');
ok(genK2.indexOf('if (!gate.ready)') < genK2.indexOf('handleUpsertShippingAllocationDraftAtomic_({ header: pl.header'), 'D4. and the schema gate refuses before it');
ok(/weeklyAiPlanReadCarrierAuthorities_/.test(G61) && /carrier_rate_cards/.test(G61) && /carrier_lead_times/.test(G61), 'D5. the K2 path harvests carrier_rate_cards + carrier_lead_times (absent from the legacy harvest)');

// ============================================================ E — K2 empty-header classifier (H) + diagnostics (I)
section('E. K2-aware empty-header classifier — DUPLICATE_ACTIVE_REVIEW / EMPTY_ORPHAN / FAILED_MANUAL / NOT_SAFE');
(function () {
  eval(extractFn(TEMP, 'TEMP_str_'));
  eval(extractFn(TEMP, 'TEMP_r5bHash_'));
  eval(extractFn(TEMP, 'TEMP_r5bIdFingerprint_'));
  eval(TEMP.match(/var TEMP_R6F2_ACTIVE_ = \{[\s\S]*?\};/)[0]);
  eval(TEMP.match(/var TEMP_R6F2_ROUTE_DIMS_ = \[[\s\S]*?\];/)[0]);
  eval(['TEMP_r6f2RouteComplete_', 'TEMP_r6f2RouteBlank_', 'TEMP_r6f2ClassifyEmptyHeadersK2_'].map(function (n) { return extractFn(TEMP, n); }).join('\n'));
  // the two live headers: blank cycle + blank route + no lines + both active + same collision key → DUPLICATE_ACTIVE_REVIEW
  var H2 = { rows: [
    { allocation_draft_id: 'A', status: 'draft', planning_cycle: '', company: '', country: '', marketplace: '', source_page: '' },
    { allocation_draft_id: 'B', status: 'draft', planning_cycle: '', company: '', country: '', marketplace: '', source_page: '' }
  ] };
  var c2 = TEMP_r6f2ClassifyEmptyHeadersK2_(H2, { rows: [] });
  eq(c2.headers.map(function (h) { return h.classification; }), ['DUPLICATE_ACTIVE_REVIEW', 'DUPLICATE_ACTIVE_REVIEW'], 'E1. two blank-everything active headers (same collision key) → both DUPLICATE_ACTIVE_REVIEW (matches live 8545b0ca posture)');
  // a UNIQUE blank-everything active header → EMPTY_ORPHAN_SAFE_TO_CANCEL
  var c1 = TEMP_r6f2ClassifyEmptyHeadersK2_({ rows: [{ allocation_draft_id: 'O', status: 'draft', planning_cycle: '', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv' }] }, { rows: [] });
  eq(c1.headers[0].classification, 'EMPTY_ORPHAN_SAFE_TO_CANCEL', 'E2. unique blank-cycle blank-route empty header → EMPTY_ORPHAN_SAFE_TO_CANCEL');
  // real cycle + COMPLETE route + no lines → FAILED_MANUAL_HEADER_SAFE_TO_CANCEL
  var cF = TEMP_r6f2ClassifyEmptyHeadersK2_({ rows: [{ allocation_draft_id: 'F', status: 'draft', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: 'SEA' }] }, { rows: [] });
  eq(cF.headers[0].classification, 'FAILED_MANUAL_HEADER_SAFE_TO_CANCEL', 'E3. real cycle + complete route + no lines → FAILED_MANUAL_HEADER_SAFE_TO_CANCEL');
  // real cycle but partial route (insufficient for K2) → NOT_SAFE
  var cN = TEMP_r6f2ClassifyEmptyHeadersK2_({ rows: [{ allocation_draft_id: 'N', status: 'draft', planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', recommended_source_warehouse_id: 'WH-CN' }] }, { rows: [] });
  eq(cN.headers[0].classification, 'NOT_SAFE', 'E4. partial route (insufficient K2 evidence) → NOT_SAFE (never guess)');
})();

section('F. R6F2 read-only diagnostics present + zero-write; freeze does not disclose raw values');
ok(/function TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY\(\)/.test(TEMP), 'F1. PREFLIGHT present');
ok(/function TEMP_R6F2_VALIDATE_INVENTORY_K2_PACKAGE\(frozen, opts\)/.test(TEMP), 'F2. package VALIDATE present (R6F2D: accepts a frozen-scope arg)');
ok(/function TEMP_R6F2_FREEZE_EMPTY_INVENTORY_HEADERS\(\)/.test(TEMP), 'F3. FREEZE present');
// R6F2E1 — the public preflight is now a thin quiet-capable delegator; the calculation body lives in the core.
var preflight = extractFn(TEMP, 'TEMP_r6f2ePreflightCore_');
ok(preflight.indexOf('.setValue(') < 0 && preflight.indexOf('appendRow(') < 0 && /READY_FOR_CONTROLLED_INVENTORY_AI_PLAN|HALT/.test(preflight), 'F1. PREFLIGHT is zero-write + emits a verdict');
ok(/carrier_rate_cards_active|NO_ACTIVE_CARRIER_RATE_CARDS/.test(preflight) && /line_schema_exact_30/.test(preflight), 'F1. PREFLIGHT reports route-authority availability + exact-30 schema');
var freeze = extractFn(TEMP, 'TEMP_R6F2_FREEZE_EMPTY_INVENTORY_HEADERS');
ok(freeze.indexOf('.setValue(') < 0 && /freeze_checksum/.test(freeze) && /row_number/.test(freeze), 'F3. FREEZE is read-only + captures row numbers + a checksum');
ok(!/raw business values/.test(freeze) || /no raw business values disclosed/.test(freeze), 'F3. FREEZE discloses type/blank/length/fingerprint, not raw values');

done();
