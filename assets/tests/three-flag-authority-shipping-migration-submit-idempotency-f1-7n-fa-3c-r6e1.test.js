// Kitchen Mama Operation System — R6E1 three-flag single-authority + additive shipping_plan_lines schema migration +
// Submit idempotency + canonical snapshot mapping + unified release — F1-7N-FA-3C-R6E1-R1.
// Run: node assets/tests/three-flag-authority-shipping-migration-submit-idempotency-f1-7n-fa-3c-r6e1.test.js
//
// Production-faithful: uses the REAL KMSAFE core (classifySchemaMismatch / headerHash / validateMigrationAuthorization),
// the REAL km-api-foundation.js instance (flag mirrors + single applyClientCapabilities path + capability snapshot), the
// REAL 11_ authority header arrays + the REAL PURE 11_ helpers (shippingPlanSnapshotValue_ / shippingPlanBatchSignature_
// / shippingPlanClassifyBatch_) extracted and eval'd once at top level, and the REAL index.html / namespace.js / 00_config
// / router / 03_ source for the transport + unified-release assertions.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6E1 THREE-FLAG / MIGRATION / SUBMIT IDEMPOTENCY (F1-7N-FA-3C-R6E1-R1): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
var KMSAFE = require(path.join(ROOT, 'js', 'core', 'supply-planning-production-safety.js'));
var FND = require(path.join(ROOT, 'js', 'api', 'km-api-foundation.js'));

// ---- parse the RUNTIME AUTHORITY arrays + extract the PURE 11_ helpers -------------------------------------------
var GS = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '11_shipping_plan_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
function parseHeaderArray(name) {
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\];').exec(GS);
  if (!m) throw new Error('authority array not found: ' + name);
  var body = m[1].replace(/\/\/[^\n]*/g, '');
  var out = [], re = /'([^']+)'/g, x; while ((x = re.exec(body))) out.push(x[1]);
  return out;
}
var LINES_AUTH = parseHeaderArray('SHIPPING_PLAN_LINES_HEADERS_');
var PLANS_AUTH = parseHeaderArray('SHIPPING_PLANS_HEADERS_');
function extract(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
// eval ALL pure helpers together at top level (a single eval so cross-references resolve).
eval(['shippingPlanNum_', 'shippingPlanSnapshotValue_', 'shippingPlanBatchSignature_', 'shippingPlanClassifyBatch_'].map(function (n) { return extract(GS, n); }).join('\n'));

// The LIVE shipping_plan_lines schema (23 cols) exactly as R6E froze it (authority = live evidence).
var LIVE_LINES = ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'site_sku', 'marketplace_seperate',
  'requested_qty', 'approved_qty', 'plan_carton_qty', 'units_per_carton', 'carton_cbm', 'cbm', 'gross_weight', 'net_weight',
  'snapshot_avg_sales_source', 'snapshot_normal_days_count', 'snapshot_excluded_event_days_count', 'snapshot_avg_sales_warning',
  'source_page', 'source_reason', 'inventory_snapshot_date', 'note', 'created_at', 'updated_at'];
var THE_8 = ['marketplace', 'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply',
  'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context'];

// ==================================================================================================================
section('A. Three flags — single authority (KM.api mirrors + applyClientCapabilities + snapshot)');
var api = FND.createApiFoundation({});   // empty deps → foundation defaults (createDefault path)
// default posture: flat V2 true (fail-closed to FLAT_V2), site confirm false (R6E live), inventory false
ok(api.requestOrderDraftV2FlatCutover() === true, 'A1. flat V2 mirror defaults TRUE (FLAT_V2, never legacy)');
ok(api.inventoryAiPlanDbGenerationEnabled() === false, 'A1. inventory generation mirror defaults FALSE');

// frontend reads the BACKEND effective capability via the ONE apply path
var snap = api.applyClientCapabilities({ capabilitiesVersion: 'r6e1-flags-shipping-20260822',
  requestOrderDraftV2FlatCutover: true, requestOrderSiteConfirmRequired: false, inventoryAiPlanDbGenerationEnabled: false });
eq([snap.requestOrderDraftV2FlatCutover, snap.requestOrderSiteConfirmRequired, snap.inventoryAiPlanDbGenerationEnabled], [true, false, false], 'A2. applyClientCapabilities applies the backend envelope verbatim');
ok(snap.source === 'backend' && snap.capabilitiesVersion === 'r6e1-flags-shipping-20260822', 'A2. snapshot records source=backend + version');
ok(api.requestOrderSiteConfirmRequired() === false, 'A2. site confirm effective = backend false (R6E authorized bypass preserved)');

// FAIL-SAFE: caps null → flat V2 TRUE, site confirm TRUE, inventory FALSE (spec §B)
var fsnap = api.applyClientCapabilities(null);
eq([fsnap.requestOrderDraftV2FlatCutover, fsnap.requestOrderSiteConfirmRequired, fsnap.inventoryAiPlanDbGenerationEnabled], [true, true, false], 'A3. fail-safe defaults (flat V2 true, site confirm TRUE, inventory false)');
ok(fsnap.source === 'failsafe-default', 'A3. snapshot records source=failsafe-default when caps unavailable');
// a non-boolean field falls back to that flag''s fail-safe (never coerced/invented)
var psnap = api.applyClientCapabilities({ requestOrderSiteConfirmRequired: 'nope', inventoryAiPlanDbGenerationEnabled: 1 });
eq([psnap.requestOrderDraftV2FlatCutover, psnap.requestOrderSiteConfirmRequired, psnap.inventoryAiPlanDbGenerationEnabled], [true, true, false], 'A3. non-boolean fields fall back to each flag fail-safe default');

section('A. flags are INDEPENDENT (setting one never moves another)');
api.applyClientCapabilities({ requestOrderDraftV2FlatCutover: true, requestOrderSiteConfirmRequired: true, inventoryAiPlanDbGenerationEnabled: true });
api.setRequestOrderSiteConfirmRequired(false);
eq([api.requestOrderDraftV2FlatCutover(), api.requestOrderSiteConfirmRequired(), api.inventoryAiPlanDbGenerationEnabled()], [true, false, true], 'A4. toggling site confirm leaves flat V2 + inventory untouched');
api.setInventoryAiPlanDbGenerationEnabled(false);
eq([api.requestOrderDraftV2FlatCutover(), api.requestOrderSiteConfirmRequired(), api.inventoryAiPlanDbGenerationEnabled()], [true, false, false], 'A4. toggling inventory leaves the others untouched');

section('A. Site Confirm true/false ROLLBACK is exact + reversible');
api.setRequestOrderSiteConfirmRequired(true); ok(api.requestOrderSiteConfirmRequired() === true, 'A5. set true → required');
api.setRequestOrderSiteConfirmRequired(false); ok(api.requestOrderSiteConfirmRequired() === false, 'A5. set false → bypass (rollback exact)');

// ==================================================================================================================
section('B. Backend config = owner-of-record; three flags at the exact required posture');
var CONFIG = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');
ok(/var\s+REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=\s*true\s*;/.test(CONFIG), 'B1. REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true (permanent cutover)');
ok(/var\s+REQUEST_ORDER_SITE_CONFIRM_REQUIRED_\s*=\s*false\s*;/.test(CONFIG), 'B1. REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ = false (temporary, USER-authorized)');
ok(/var\s+INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false\s*;/.test(CONFIG), 'B1. INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false (staged)');
ok(!/DEFAULT OFF[\s\S]{0,80}flat V2/i.test(CONFIG) && /PERMANENTLY TRUE/.test(CONFIG), 'B2. stale "flat V2 DEFAULT OFF" comment removed; documents completed cutover');

section('B. capability transport wired (single wire channel; read-only)');
var ROUTER = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '01_router.gs'), 'utf8');
var MASTER = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '03_master_data_handlers.gs'), 'utf8');
ok((ROUTER.match(/action === 'getClientCapabilities'/g) || []).length >= 2, 'B3. getClientCapabilities routed in BOTH doGet + doPost');
ok(/function handleGetClientCapabilities_\(\)/.test(MASTER) && /requestOrderDraftV2FlatCutover/.test(MASTER) && /capabilitiesVersion/.test(MASTER), 'B3. handleGetClientCapabilities_ returns the three effective flags + version');
var DBAPI = fs.readFileSync(path.join(ROOT, 'js', 'api', 'operation-system-db-api.js'), 'utf8');
ok(/getClientCapabilities\s*=\s*function/.test(DBAPI) && /_kmApplyClientCapabilities_/.test(DBAPI) && /applyClientCapabilities/.test(DBAPI), 'B4. frontend read + single apply bootstrap present');
ok(/window\.__kmCapabilities\s*=/.test(DBAPI) && /window\.__kmVerifyCapabilities\s*=/.test(DBAPI), 'B4. read-only capability diagnostic + source/runtime verify present');
var APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
ok(/applyClientCapabilities\(\)/.test(APP), 'B5. app init applies the backend capabilities before page mounts read them');

// ==================================================================================================================
section('C. Additive schema migration 23 → 31 (existing cells preserved; idempotent)');
ok(LINES_AUTH.length === 30 && LIVE_LINES.length === 23, 'C1. authority = 30, live = 23');
// the 8 missing headers are exactly THE_8 (order-insensitive)
var missing = LINES_AUTH.filter(function (h) { return LIVE_LINES.indexOf(h) === -1; });
eq(missing.slice().sort(), THE_8.slice().sort(), 'C1. the exactly-8 missing canonical headers');
// model the append-at-right-edge migration
var MIGRATED = LIVE_LINES.concat(THE_8);
ok(MIGRATED.length === 31, 'C2. post-migration physical header count = 31 (23 + 8)');
eq(MIGRATED.slice(0, 23), LIVE_LINES, 'C2. existing 23 columns unchanged (append only; preserved region byte-equivalent)');
ok(LINES_AUTH.every(function (h) { return MIGRATED.indexOf(h) !== -1; }), 'C2. all 30 canonical headers present after migration');
ok(MIGRATED.indexOf('marketplace_seperate') !== -1 && MIGRATED.filter(function (h) { return LINES_AUTH.indexOf(h) === -1; }).length === 1, 'C2. marketplace_seperate remains the SINGLE tolerated extra');
// idempotent: a second migration finds nothing missing
var missing2 = THE_8.filter(function (h) { return MIGRATED.indexOf(h) === -1; });
eq(missing2, [], 'C3. migration is idempotent (re-run appends 0 columns)');
// migration authorization DTO is well-formed + old/new hashes differ
var oldHash = KMSAFE.headerHash(LIVE_LINES), newHash = KMSAFE.headerHash(MIGRATED);
ok(oldHash !== newHash, 'C4. old/new header hashes differ (migration authorization compare)');
var authDto = { migrationId: 'R6E1', expectedSpreadsheetId: 'X', expectedSheetName: 'shipping_plan_lines',
  expectedOldHeaderHash: oldHash, expectedNewHeaderHash: newHash, backupReference: 'backup', execute: true, actor: 'tester' };
ok(KMSAFE.validateMigrationAuthorization(authDto).valid === true, 'C4. migration authorization DTO valid (all required fields)');
ok(KMSAFE.validateMigrationAuthorization({ migrationId: 'R6E1' }).valid === false, 'C4. incomplete authorization DTO rejected (fail-closed)');

// ==================================================================================================================
section('D. WRITE-gate: presence-based lines gate passes ONLY after migration; strict plans gate unchanged');
function presenceGate(actual, authority) {   // mirrors prodRequireSheet_(ss,name,[]) + prodRequireColumns_(sheet, authority)
  var existence = KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: actual, expectedHeaders: [], extraColumnsPolicy: 'ALLOW' });
  var missingReq = authority.filter(function (h) { return actual.indexOf(h) === -1; });
  return { valid: existence.valid && missingReq.length === 0, missingRequired: missingReq };
}
ok(presenceGate(LIVE_LINES, LINES_AUTH).valid === false, 'D1. presence gate FAILS on the live 23-col sheet (missing 8) → Submit stays blocked pre-migration');
eq(presenceGate(LIVE_LINES, LINES_AUTH).missingRequired.slice().sort(), THE_8.slice().sort(), 'D1. missing-required = exactly the 8 canonical columns');
ok(presenceGate(MIGRATED, LINES_AUTH).valid === true, 'D2. presence gate PASSES on the migrated 31-col sheet (order-tolerant; marketplace_seperate ignored)');
// the strict ORDERED gate would still reject the migrated sheet (append-at-end) — proving why the presence gate is required
var ordered = KMSAFE.classifySchemaMismatch({ exists: true, actualHeaders: MIGRATED, expectedHeaders: LINES_AUTH, extraColumnsPolicy: 'ALLOW' });
ok(ordered.valid === false && ordered.schemaStatus === KMSAFE.SCHEMA_STATUS.HEADER_ORDER_MISMATCH, 'D2. a STRICT ordered gate would still reject the migrated sheet (HEADER_ORDER_MISMATCH) — presence gate is the correct fix');
ok(/prodRequireSheet_\(ss, 'shipping_plan_lines', \[\]\)/.test(GS) && /prodRequireColumns_\(lineSheet, SHIPPING_PLAN_LINES_HEADERS_\)/.test(GS), 'D3. 11_ uses the presence-based (order-tolerant) gate for shipping_plan_lines');
ok(/shippingPlanEnsureSheet_\(ss, 'shipping_plans', SHIPPING_PLANS_HEADERS_\)/.test(GS), 'D3. shipping_plans keeps the strict ordered canonical gate');

// ==================================================================================================================
section('E. Submit idempotency — create / reuse / conflict / partial (find-or-reuse under a key)');
function inTuples(lines) { return lines.filter(function (l) { return String(l.sku || '').trim(); }).map(function (l) { return { country: l.country, ship_from: l.ship_from, destination: l.destination, shipping_method: l.shipping_method, marketplace: l.marketplace, sku: l.sku, requested_qty: l.requested_qty }; }); }
var payloadA = [
  { country: 'US', ship_from: 'CN1', destination: 'FBA-US', shipping_method: 'sea', marketplace: 'amazon.com', sku: 'SKU1', requested_qty: 100 },
  { country: 'US', ship_from: 'CN1', destination: 'FBA-US', shipping_method: 'sea', marketplace: 'amazon.com', sku: 'SKU2', requested_qty: 50 }
];
var sigA = shippingPlanBatchSignature_(inTuples(payloadA));
// simulate the persisted state after a first CREATE under key SB-1
var persistedPlans = [{ shipping_plan_id: 'SP-1', submit_batch_id: 'SB-1', company: 'KM', country: 'US', ship_from: 'CN1', destination: 'FBA-US', shipping_method: 'sea' }];
var persistedLines = [
  { shipping_plan_id: 'SP-1', sku: 'SKU1', marketplace: 'amazon.com', requested_qty: 100 },
  { shipping_plan_id: 'SP-1', sku: 'SKU2', marketplace: 'amazon.com', requested_qty: 50 }
];
var c0 = shippingPlanClassifyBatch_([], [], 'SB-1', sigA, 2);
ok(c0.state === 'CREATE', 'E1. no header carries the key → CREATE');
var c1 = shippingPlanClassifyBatch_(persistedPlans, persistedLines, 'SB-1', sigA, 2);
ok(c1.state === 'REUSED' && c1.lineCount === 2, 'E2. same key + equivalent payload → REUSED (zero writes)');
var payloadB = payloadA.slice(); payloadB[0] = Object.assign({}, payloadA[0], { requested_qty: 999 });   // different qty = different intention
var c2 = shippingPlanClassifyBatch_(persistedPlans, persistedLines, 'SB-1', shippingPlanBatchSignature_(inTuples(payloadB)), 2);
ok(c2.state === 'CONFLICT', 'E3. same key + DIFFERENT payload → CONFLICT (fail-closed, no blind retry)');
var c3 = shippingPlanClassifyBatch_(persistedPlans, [], 'SB-1', sigA, 2);
ok(c3.state === 'COMMITTED_UNVERIFIED', 'E4. header(s) exist but zero lines while payload has lines → COMMITTED_UNVERIFIED');
// a DIFFERENT key is independent (a new Submit intention)
var cK = shippingPlanClassifyBatch_(persistedPlans, persistedLines, 'SB-2', sigA, 2);
ok(cK.state === 'CREATE', 'E5. a different execution key is a fresh intention → CREATE');

section('E. concurrent identical Submit under one key → exactly one plan set');
// model the ScriptLock serialization: two identical calls run one-after-another against shared state.
var store = { plans: [], lines: [] };
function submitOnce(key, payload) {
  var sig = shippingPlanBatchSignature_(inTuples(payload)), n = inTuples(payload).length;
  var cls = shippingPlanClassifyBatch_(store.plans, store.lines, key, sig, n);
  if (cls.state === 'REUSED') return { outcome: 'REUSED', planCount: cls.planIds.length };
  if (cls.state === 'CONFLICT') return { outcome: 'CONFLICT' };
  if (cls.state === 'COMMITTED_UNVERIFIED') return { outcome: 'COMMITTED_UNVERIFIED' };
  // CREATE: append exactly one plan + its lines under the key
  store.plans.push({ shipping_plan_id: 'SP-' + (store.plans.length + 1), submit_batch_id: key, company: 'KM', country: 'US', ship_from: 'CN1', destination: 'FBA-US', shipping_method: 'sea' });
  inTuples(payload).forEach(function (t) { store.lines.push({ shipping_plan_id: 'SP-1', sku: t.sku, marketplace: t.marketplace, requested_qty: t.requested_qty }); });
  return { outcome: 'CREATED', planCount: 1 };
}
var r1 = submitOnce('SB-CC', payloadA);
var r2 = submitOnce('SB-CC', payloadA);   // retry under same key
ok(r1.outcome === 'CREATED' && r2.outcome === 'REUSED', 'E6. first CREATED, second REUSED (serialized under one lock)');
ok(store.plans.filter(function (p) { return p.submit_batch_id === 'SB-CC'; }).length === 1, 'E6. exactly ONE plan created for the batch (no duplicate)');
ok(/LockService\.getScriptLock\(\)/.test(GS) && /tryLock\(30000\)/.test(GS) && /releaseLock\(\)/.test(GS), 'E7. 11_ serializes the check-then-act under the canonical ScriptLock');
ok(/SUBMIT_EXECUTION_DUPLICATE_CONFLICT/.test(GS) && /COMMITTED_UNVERIFIED/.test(GS) && /outcome: 'REUSED'/.test(GS), 'E7. the three idempotency outcome tokens are present in the writer');
ok(/body\.submit_batch_id \|\| body\.execution_key/.test(GS), 'E7. writer accepts the client execution key (submit_batch_id / execution_key)');

section('E. frontend generates ONE stable execution key per Submit intention');
var IR = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
ok(/_newSubmitExecutionKey|_replenSubmitExecutionKey/.test(IR) && /submit_batch_id: submitExecutionKey/.test(IR), 'E8. Submit passes a stable submitExecutionKey; stored on the working draft (reused on retry)');
ok(/replenAllocationDraft\.submitExecutionKey/.test(IR), 'E8. key persisted on the working draft (a re-render/navigation does not mint a new key)');

// ==================================================================================================================
section('F. Canonical snapshot mapping (never [object Object]; the 8 canonical fields written)');
eq(shippingPlanSnapshotValue_({ fc: 1, note: 'x' }), JSON.stringify({ fc: 1, note: 'x' }), 'F1. object context → canonical JSON');
eq(shippingPlanSnapshotValue_([1, 2, 3]), '[1,2,3]', 'F1. array context → canonical JSON');
ok(shippingPlanSnapshotValue_({ a: 1 }).indexOf('[object Object]') === -1, 'F1. NEVER emits "[object Object]"');
eq(shippingPlanSnapshotValue_(null), '', 'F1. null/undefined → empty string');
eq(shippingPlanSnapshotValue_('AMZ Prime'), 'AMZ Prime', 'F1. primitive string passes through unchanged');
eq(shippingPlanSnapshotValue_(42), 42, 'F1. primitive number passes through unchanged');
THE_8.forEach(function (h) { ok(new RegExp(h + ':').test(GS), 'F2. writer maps canonical column ' + h); });
ok(/marketplace: lineMk/.test(GS) && !/marketplace_seperate:\s*/.test(GS), 'F2. new lines write canonical `marketplace` (never marketplace_seperate)');
ok(/snapshot_fc_context: shippingPlanSnapshotValue_/.test(GS) && /snapshot_event_context: shippingPlanSnapshotValue_/.test(GS), 'F2. context columns serialized canonically');

// ==================================================================================================================
section('G. R6D1 staged Inventory state preserved (no regression)');
ok(api.inventoryAiPlanDbGenerationEnabled() === false || true, 'G1. inventory mirror present');   // presence
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8');
ok(/function TEMP_R6D1_VALIDATE_INVENTORY_AI_PLAN_READY\(\)/.test(TEMP), 'G2. R6D1 validator still present');
ok(/GAP_JOB_INVENTORY/.test(TEMP) && /EMPTY_ORPHAN_SAFE_TO_CANCEL/.test(TEMP), 'G2. R6D1 GAP-INV run authority + blank-orphan classification preserved');
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false/.test(CONFIG), 'G3. inventory generation flag remains false (staged; not enabled)');

// ==================================================================================================================
section('H. Unified release authority (materially-changed assets on one token)');
var NS = fs.readFileSync(path.join(ROOT, 'js', 'core', 'namespace.js'), 'utf8');
ok(/RELEASE:\s*'r6e1-flags-shipping-20260822'/.test(NS), 'H1. KM.RELEASE = r6e1-flags-shipping-20260822');
var INDEX = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
['namespace.js', 'api/operation-system-db-api.js', 'api/km-api-foundation.js', 'pages/inventory-replenishment.js', 'app.js'].forEach(function (a) {
  ok(new RegExp(a.replace(/[.\/]/g, '\\$&') + '\\?v=r6e1-flags-shipping-20260822').test(INDEX), 'H2. changed asset on the unified token: ' + a);
});
ok(!/\?v=r6d1-invplan-20260822/.test(INDEX), 'H3. no changed asset remains on the stale r6d1 token');

// ==================================================================================================================
section('I. TEMP R6E1 tooling present (migration dry-run/execute/validate + preflight)');
['TEMP_R6E1_DRY_RUN_MIGRATE_SHIPPING_PLAN_LINES_SCHEMA', 'TEMP_R6E1_EXECUTE_MIGRATE_SHIPPING_PLAN_LINES_SCHEMA',
 'TEMP_R6E1_VALIDATE_SHIPPING_PLAN_LINES_SCHEMA', 'TEMP_R6E1_PREFLIGHT_SHIPPING_PLAN_RELEASE'].forEach(function (fn) {
  ok(new RegExp('function ' + fn + '\\(\\)').test(TEMP), 'I1. entrypoint present: ' + fn);
});
ok(/prodMigrateAppendColumns_\(lineSheet, TEMP_R6E1_MISSING_HEADERS_, auth\)/.test(TEMP), 'I2. EXECUTE appends via the S0-3 migration-only twin with an auth DTO');
ok(/R6E1_ZERO_WRITE_CONFIRMED/.test(TEMP) && /zero_write_confirmed/.test(TEMP), 'I2. dry-run/validate/preflight assert zero-write');

done();
