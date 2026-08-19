// Kitchen Mama Operation System — F1-7N-C0 WEEKLY_SHIPPING Active-Draft key reconciliation guard.
// Run: node assets/tests/weekly-shipping-active-key-reconciliation-f1-7n-c0-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// C0 FINDING (source-proven): the WEEKLY_SHIPPING Phase-1 Active-Draft / Submit key is CANONICALLY **K3**
//   recommendation_type + planning_cycle + company + country + marketplace + source_page
// — recommendation_group_no is a stored HEADER column but is NOT part of the Phase-1 Active identity. The amendment's
// §2.1 K2 model (… + recommendation_group_no + draft_version) and any air/sea multi-Draft-Header split are
// explicitly PHASE_2_DEFERRED by the owner-of-record `docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md`
// (D-C2-1 / D-C2-2 / D-C2-4 / §3) and §Persist-Orch PO-5/PO-6. So NO "add group_no" change is made this round —
// this guard LOCKS the reconciled K3 contract and will FAIL any future C1 that silently adds recommendation_group_no
// (or a carrier/rate/lead-time/ETA/cost field) to the WEEKLY Active key, or changes the MONTHLY key. Promoting the
// deferred K2 (multi-group coexistence) is a SEPARATE authorized Phase-2 slice — see the completion report.

var fs = require('fs'), path = require('path');
var R = require('../js/core/supply-planning-persistence-repository.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var REPO_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-persistence-repository.js'), 'utf8');
var K3 = ['planning_cycle', 'company', 'country', 'marketplace', 'source_page'];
var MONTHLY_SCOPE = ['planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku'];
var FORBIDDEN_KEY_FIELDS = ['recommendation_group_no', 'carrier_id', 'rate_card_id', 'lead_time_id', 'selected_carrier_id', 'selected_rate_card_id', 'selected_lead_time_id', 'expected_arrival', 'eta', 'estimated_cost', 'freight', 'duty', 'tax', 'draft_version'];

// fake sheet-set builder (the repo consumes { headers:[], rows:[[]] })
var SHIP_HEADERS = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status', 'recommendation_group_no', 'draft_version'];
function shipSheet(rows) { return { shipping_allocation_drafts: { headers: SHIP_HEADERS, rows: rows || [] } }; }
function shipRow(o) { return SHIP_HEADERS.map(function (h) { return o[h] === undefined ? '' : o[h]; }); }
var MON_HEADERS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku', 'status', 'draft_version'];
function monSheet(rows) { return { request_order_allocation_drafts: { headers: MON_HEADERS, rows: rows || [] } }; }
function monRow(o) { return MON_HEADERS.map(function (h) { return o[h] === undefined ? '' : o[h]; }); }
function wq(scope) { return { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W37', businessScope: scope }; }
var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'inventory_replenishment' };

// =================================================================================================================
section('Reconciled contract: WEEKLY Active key = K3 (recommendation_group_no NOT in the key)');
eq(R.TABLES.WEEKLY_SHIPPING.scope, K3, 'WEEKLY_SHIPPING scope config = K3 (planning_cycle+company+country+marketplace+source_page)');
ok(R.TABLES.WEEKLY_SHIPPING.scope.indexOf('recommendation_group_no') === -1, 'WEEKLY scope EXCLUDES recommendation_group_no (Phase-2-deferred K2)');
ok(R.TABLES.WEEKLY_SHIPPING.scope.indexOf('draft_version') === -1, 'WEEKLY scope EXCLUDES draft_version (version/concurrency, not a natural key)');
FORBIDDEN_KEY_FIELDS.forEach(function (f) { ok(R.TABLES.WEEKLY_SHIPPING.scope.indexOf(f) === -1, 'WEEKLY scope EXCLUDES logistics/decision field: ' + f); });

section('MONTHLY_ORDER key UNCHANGED (independent of this reconciliation)');
eq(R.TABLES.MONTHLY_ORDER.scope, MONTHLY_SCOPE, 'MONTHLY_ORDER scope config unchanged (…+ draft_purpose + sku; no source_page)');
ok(R.TABLES.MONTHLY_ORDER.scope.indexOf('recommendation_group_no') === -1, 'MONTHLY scope also excludes recommendation_group_no');
ok(R.TABLES.MONTHLY_ORDER.scope.indexOf('source_page') === -1, 'MONTHLY scope is NOT the WEEKLY K3 (distinct grain preserved)');

// =================================================================================================================
section('Behavioral (task scenarios B/C/D) — group_no is NOT an Active identity axis under Phase-1 K3');
// D — draft_version does not create two Active identities: one active draft (any draft_version) → REUSE.
eq(R.loadActiveDraftContext(shipSheet([shipRow({ allocation_draft_id: 'SAD-1', planning_cycle: '2026-W37', source_page: 'inventory_replenishment', company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'draft', recommendation_group_no: '1', draft_version: 3 })]), wq(WSCOPE)).status, 'REUSE', 'D one active (draft_version=3) → REUSE (draft_version not in the key)');
// B — 0 active → CREATE.
eq(R.loadActiveDraftContext(shipSheet([]), wq(WSCOPE)).status, 'CREATE', 'B 0 active → CREATE');
// C — 2 active, SAME K3 scope, DIFFERENT recommendation_group_no → BLOCKED_CONFLICT (group_no is NOT identity).
var twoGroups = shipSheet([
  shipRow({ allocation_draft_id: 'SAD-1', planning_cycle: '2026-W37', source_page: 'inventory_replenishment', company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'draft', recommendation_group_no: '1', draft_version: 1 }),
  shipRow({ allocation_draft_id: 'SAD-2', planning_cycle: '2026-W37', source_page: 'inventory_replenishment', company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'draft', recommendation_group_no: '2', draft_version: 1 })
]);
var res = R.loadActiveDraftContext(twoGroups, wq(WSCOPE));
eq(res.status, 'BLOCKED_CONFLICT', 'C two active drafts differing ONLY by recommendation_group_no → BLOCKED_CONFLICT (Phase-1 does NOT let groups coexist; that is PHASE_2_DEFERRED K2)');
eq(res.matchCount, 2, 'C both group rows resolve to the SAME K3 Active key (proves group_no is not an identity axis)');
eq(res.activeKey, 'WEEKLY_SHIPPING::planning_cycle=2026-W37|company=KM|country=US|marketplace=AMAZON_US|source_page=inventory_replenishment', 'C the resolved Active key is exactly K3 (no recommendation_group_no / draft_version component)');

section('Behavioral (task scenario E) — MONTHLY drafts differing by draft_purpose coexist (key includes draft_purpose)');
var monTwoPurpose = monSheet([
  monRow({ request_allocation_draft_id: 'RAD-1', planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450', status: 'draft', draft_version: 1 }),
  monRow({ request_allocation_draft_id: 'RAD-2', planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'emergency', sku: 'GA0450', status: 'draft', draft_version: 1 })
]);
eq(R.loadActiveDraftContext(monTwoPurpose, { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-08', businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450' } }).status, 'REUSE', 'E MONTHLY differing by draft_purpose are distinct identities → REUSE the matching one (key unchanged)');

// =================================================================================================================
section('Source lock — a future C1 that adds group_no to the WEEKLY key must update this guard + the freeze doc');
// The WEEKLY scope array literal in source must be exactly K3 (no recommendation_group_no). This FAILS loudly if a
// C1 edit silently activates the Phase-2 K2 key without an explicit authorized freeze-doc update.
ok(/WEEKLY_SHIPPING:[\s\S]{0,400}scope:\s*\['planning_cycle',\s*'company',\s*'country',\s*'marketplace',\s*'source_page'\]/.test(REPO_SRC), 'SOURCE: WEEKLY_SHIPPING scope literal is exactly K3 (no recommendation_group_no)');
// The §Persist-Orch contract still states the K3 scope (no group_no) for WEEKLY_SHIPPING.
var RRIS = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'planning', 'RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md'), 'utf8');
ok(/WEEKLY_SHIPPING:\*\*\s*`planning_cycle`[^\n]*`source_page`/.test(RRIS), 'CONTRACT: §Persist-Orch PO-5 WEEKLY_SHIPPING scope = K3 (…+ source_page)');
ok(/recommendation_group_no[\s\S]{0,80}(PHASE_2|Phase-2|deferred)/i.test(RRIS) || /F1-7N-C0/.test(RRIS), 'CONTRACT: RRIS records recommendation_group_no as Phase-2-deferred / C0 reconciliation present');

console.log('\n----------------------------------------');
console.log('WEEKLY ACTIVE-KEY RECONCILIATION (F1-7N-C0): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
