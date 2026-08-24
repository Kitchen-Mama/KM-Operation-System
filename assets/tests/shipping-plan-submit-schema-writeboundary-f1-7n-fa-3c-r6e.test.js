// Kitchen Mama Operation System — R6E Weekly Shipping Plan schema mismatch + Submit write-boundary — F1-7N-FA-3C-R6E-P0.
// Run: node assets/tests/shipping-plan-submit-schema-writeboundary-f1-7n-fa-3c-r6e.test.js
//
// Uses the REAL production-safety core (KMSAFE.classifySchemaMismatch — the exact gate handleCreateShippingPlansBatch_
// runs via 29_ prodRequireSheet_) + the REAL SHIPPING_PLAN_LINES_HEADERS_ / SHIPPING_PLANS_HEADERS_ authority arrays
// parsed out of 11_shipping_plan_handlers.gs, to (A) reproduce PRODUCTION_SAFETY:HEADER_MISSING [shipping_plan_lines]
// against the live 23-col schema and pin the exact missing headers, and (B) prove the Submit writer is fail-closed:
// both sheets validate up-front BEFORE any append, so a lines-schema failure writes ZERO rows (no orphan header).

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6E SHIPPING PLAN SCHEMA + WRITE-BOUNDARY (F1-7N-FA-3C-R6E-P0): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
var KMSAFE = require(path.join(ROOT, 'js', 'core', 'supply-planning-production-safety.js'));

// Parse the RUNTIME AUTHORITY arrays verbatim from the .gs (single source of truth) so the test tracks the real authority.
var GS = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '11_shipping_plan_handlers.gs'), 'utf8');
function parseHeaderArray(name) {
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\];').exec(GS);
  if (!m) throw new Error('authority array not found: ' + name);
  var body = m[1].replace(/\/\/[^\n]*/g, '');   // strip line comments inside the array
  var out = []; var re = /'([^']+)'/g, x; while ((x = re.exec(body))) out.push(x[1]);
  return out;
}
var LINES_AUTH = parseHeaderArray('SHIPPING_PLAN_LINES_HEADERS_');
var PLANS_AUTH = parseHeaderArray('SHIPPING_PLANS_HEADERS_');

// The LIVE schemas exactly as the task froze them (authority = live evidence).
var LIVE_LINES = ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'site_sku', 'marketplace_seperate',
  'requested_qty', 'approved_qty', 'plan_carton_qty', 'units_per_carton', 'carton_cbm', 'cbm', 'gross_weight', 'net_weight',
  'snapshot_avg_sales_source', 'snapshot_normal_days_count', 'snapshot_excluded_event_days_count', 'snapshot_avg_sales_warning',
  'source_page', 'source_reason', 'inventory_snapshot_date', 'note', 'created_at', 'updated_at'];
var LIVE_PLANS = ['shipping_plan_id', 'parent_shipping_plan_id', 'shipping_plan_no', 'plan_name', 'company', 'country', 'marketplace',
  'ship_from', 'source_warehouse_id', 'ship_from_type', 'destination', 'destination_warehouse_id', 'destination_type',
  'shipping_method', 'last_mile_delivery', 'customs_type', 'carrier_id', 'carrier_unit_rate', 'carrier_rate_type', 'import_duty_treatment',
  'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'currency', 'status', 'submit_batch_id',
  'batch_status', 'plan_version', 'created_by', 'created_at', 'cancelled_by', 'cancelled_at', 'submitted_by', 'submitted_at',
  'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejected_reason', 'rejected_comment', 'completed_by', 'completed_at',
  'note', 'source', 'updated_at', 'updated_by', 'transferred_to_shipment_at', 'transferred_shipment_id'];

// The real gate call (extraColumnsPolicy:'ALLOW', matching 29_ prodRequireSheet_).
function gate(actual, expected) { return KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: actual, expectedHeaders: expected, extraColumnsPolicy: 'ALLOW' }); }

section('A. reproduce HEADER_MISSING [shipping_plan_lines] against the LIVE schema');
var lineRep = gate(LIVE_LINES, LINES_AUTH);
eq(lineRep.schemaStatus, KMSAFE.SCHEMA_STATUS.HEADER_MISSING, 'A1. live shipping_plan_lines → HEADER_MISSING (reproduced; the exact Submit-Plan failure token)');
ok(!lineRep.valid, 'A1. gate is INVALID → fail-closed');
eq(lineRep.missingHeaders, ['marketplace', 'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply', 'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context'],
  'A2. exact missing headers = marketplace + the 7 retained snapshot_* columns (authority order)');
eq(lineRep.missingHeaders[0], 'marketplace', 'A2. FIRST rejected header = marketplace (authority col5; live has marketplace_seperate instead)');
eq(lineRep.unexpectedHeaders, ['marketplace_seperate'], 'A2. the extra LIVE header is marketplace_seperate (tolerated by ALLOW; does not itself fail)');
ok(LINES_AUTH.length === 30 && LIVE_LINES.length === 23, 'A2. authority=30 cols vs live=23 cols');

section('A. spelling vs the two candidate names (marketplace / marketplace_seperate / marketplace_separate)');
ok(LINES_AUTH.indexOf('marketplace') !== -1 && LINES_AUTH.indexOf('marketplace_seperate') === -1 && LINES_AUTH.indexOf('marketplace_separate') === -1,
  'A. runtime authority uses "marketplace" (NEITHER _seperate NOR _separate) — the mismatch is a 3-way authority ambiguity, not a simple seperate/separate typo');
ok(LIVE_LINES.indexOf('marketplace_seperate') !== -1, 'A. the LIVE canonical column is "marketplace_seperate" (misspelled but deployed) — do NOT rename without a controlled migration');

section('A. shipping_plans PASSES while only shipping_plan_lines fails (isolated failure)');
var planRep = gate(LIVE_PLANS, PLANS_AUTH);
eq(planRep.schemaStatus, KMSAFE.SCHEMA_STATUS.SCHEMA_VALID, 'A5. live shipping_plans matches its 49-col authority in order → SCHEMA_VALID (failure is isolated to _lines)');
ok(PLANS_AUTH.length === 49, 'A5. shipping_plans authority = 49 cols');

section('B. Submit writer is FAIL-CLOSED — both sheets validate up-front BEFORE any append (no orphan header)');
// Model the exact 11_ ordering: validate shipping_plans, validate shipping_plan_lines, THEN append. A gate throw at the
// lines validation must abort before the plan-header append → zero durable writes, no orphan shipping_plans row.
function submitWriterModel(planActual, lineActual, nLines) {
  var writes = { plans: 0, lines: 0 };
  // step 1: validate shipping_plans (11_:272)
  var r1 = gate(planActual, PLANS_AUTH); if (!r1.valid) throw { code: 'HEADER_MISSING', table: 'shipping_plans' };
  // step 2: validate shipping_plan_lines (11_:273) — THROWS here for the live schema, before any write
  var r2 = gate(lineActual, LINES_AUTH); if (!r2.valid) throw { code: r2.schemaStatus, table: 'shipping_plan_lines' };
  // step 3+: only now append (11_:342 header, :391 lines)
  writes.plans = 1; for (var i = 0; i < nLines; i++) writes.lines++;
  return writes;
}
var threw = null, writesOnFail = { plans: 0, lines: 0 };
try { writesOnFail = submitWriterModel(LIVE_PLANS, LIVE_LINES, 3); } catch (e) { threw = e; }
ok(threw && threw.code === 'HEADER_MISSING' && threw.table === 'shipping_plan_lines', 'B1. missing line header → throws HEADER_MISSING [shipping_plan_lines] before any write');
eq(writesOnFail, { plans: 0, lines: 0 }, 'B1. ZERO durable writes on the failed Submit — no orphan shipping_plans header, no partial lines');

section('B. valid schema → exactly one plan + N lines (control)');
// A hypothetical MIGRATED live schema (matches the authority) → the writer proceeds and writes 1 header + N lines.
var okWrites = submitWriterModel(PLANS_AUTH.slice(), LINES_AUTH.slice(), 3);
eq(okWrites, { plans: 1, lines: 3 }, 'B2. valid schema → 1 shipping_plans header + exactly 3 shipping_plan_lines');

section('B. idempotency is CLOSED + F1-7N-FA-4B compatibility cutover: ONE writer authority, wrapper delegates');
// F1-7N-FA-4B — the shipping_plans WRITE authority is the extracted lock-free core shippingPlanCommitFromLines_ (11_):
// it derives the batch, computes the canonical fingerprint, classifies find-or-reuse (REUSED / CONFLICT / DUPLICATE /
// COMMITTED_UNVERIFIED / RECONCILIATION_REQUIRED) and READBACK-verifies. The stable execution key + ScriptLock intake
// now live in the ONE canonical Submit authority handleSubmitAllocationDraftsToShippingPlans_ (16_), which re-reads the
// persisted allocation drafts and feeds the writer. createShippingPlansBatch is a DEPRECATED wrapper (delegates on
// allocation_draft_ids; refuses legacy frontend lines with SUBMIT_ROUTE_DEPRECATED — no independent writer).
var GS16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8');
ok(/function shippingPlanCommitFromLines_\(/.test(GS) && /ctx\.providedKey/.test(GS) && /shippingPlanClassifyBatch_\(/.test(GS),
  'B3/B4. the ONE shipping_plans writer core accepts an execution key + find-or-reuse (shippingPlanClassifyBatch_)');
ok(/SUBMIT_EXECUTION_DUPLICATE_CONFLICT/.test(GS) && /COMMITTED_UNVERIFIED/.test(GS) && /outcome: 'REUSED'/.test(GS),
  'B3/B4. the idempotency outcome tokens (REUSED / DUPLICATE_CONFLICT / COMMITTED_UNVERIFIED) remain in the writer core');
ok(/LockService\.getScriptLock\(\)/.test(GS16) && /IN_PROGRESS_SAME_EXECUTION_KEY/.test(GS16) && /shippingPlanCommitFromLines_\(/.test(GS16),
  'B3/B4. the canonical Submit authority (16_) holds the ScriptLock, types lock-contention (IN_PROGRESS_SAME_EXECUTION_KEY) + reaches the ONE writer');
ok(/SUBMIT_ROUTE_DEPRECATED/.test(GS) && /canonical_action: 'submitAllocationDraftsToShippingPlans'/.test(GS),
  'B3/B4. createShippingPlansBatch is a deprecated wrapper — legacy frontend-line writes are refused (one authority)');

section('B. downstream transfer untouched at Submit stage');
function fnBody(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
ok(!/createShipment|transferToShipment|handleTransfer|shipment_drafts|createShipmentDraft/.test(fnBody(GS, 'shippingPlanCommitFromLines_')),
  'B5. the shipping_plans writer core does not create a Shipment Draft / transfer record at Submit stage');
ok(!/createShipment|transferToShipment|createShipmentFromApprovedPlan_|shipment_lines/.test(fnBody(GS16, 'sadSubmitToShippingPlansCore_')),
  'B5. the canonical Submit authority (16_) creates NO shipment at Submit stage (Shipping Plan → Shipment is a later boundary)');

done();
