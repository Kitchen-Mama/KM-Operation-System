// Kitchen Mama Operation System — R6F Inventory AI Plan shipment-group model + GENERATED_LINE_ID + HYDRATION_FIELD_MAP
// reconciliation — F1-7N-FA-3C-DRAFT-MODEL-R6F. Run: node assets/tests/inventory-ai-plan-group-model-lineid-hydration-f1-7n-fa-3c-r6f.test.js
//
// Exercises the REAL PURE 16_ helpers (sadLineNaturalKey_/sadFnv1a_/sadDeterministicLineId_/sadFindLineByNaturalKey_)
// extracted+eval'd, the REAL 30/31 schema constants, and source-structure assertions over 16_ + inventory-replenishment.js
// + 00_config + the design-freeze doc. NO live DB. Preserves the frozen three-flag posture + the landed K3 model.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6F GROUP-MODEL / LINE-ID / HYDRATION (F1-7N-FA-3C-R6F): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var IR = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'inventory-replenishment.js'), 'utf8').replace(/\r\n/g, '\n');
var CONFIG = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8');
var DOC = fs.readFileSync(path.join(ROOT, '..', 'docs', 'planning', 'REQUEST_ORDER_ALLOCATION_DRAFT_V2_FLATTEN_DESIGN_FREEZE.md'), 'utf8');

function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
eval(['sadLineNaturalKey_', 'sadFnv1a_', 'sadDeterministicLineId_', 'sadFindLineByNaturalKey_'].map(function (n) { return extractFn(G16, n); }).join('\n'));
// schema constants (regex eval, like allocation-draft-schema-audit)
eval(G16.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]);

section('A. canonical model + schema (30 header / 31 line; route on header; no selected_*)');
ok(SHIPPING_ALLOCATION_DRAFTS_HEADERS_.length === 30, 'A1. header schema = 30 cols');
ok(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.length === 30, 'A1. line schema = 30 cols (R6F1: canonical live schema; accidental R3C2 source_allocated_qty_snapshot removed)');
ok(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.indexOf('source_allocated_qty_snapshot') < 0, 'A1. accidental 31st field source_allocated_qty_snapshot removed');
['recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'].forEach(function (c) {
  ok(SHIPPING_ALLOCATION_DRAFTS_HEADERS_.indexOf(c) >= 0, 'A2. route/group dimension is a HEADER column: ' + c);
});
['sku', 'site_sku', 'window_code', 'route_no', 'planned_qty', 'recommended_qty', 'source_warehouse_id', 'allocation_draft_line_id', 'allocation_draft_id'].forEach(function (c) {
  ok(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.indexOf(c) >= 0, 'A3. line carries: ' + c);
});
['selected_source_warehouse_id', 'selected_destination_warehouse_id', 'selected_shipping_method', 'user_edited'].forEach(function (c) {
  ok(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.indexOf(c) < 0, 'A3. line has NO ' + c);
});

section('B1. deterministic + stable line id; natural-key reconciliation (no duplicate)');
var lA = { sku: 'SKU1', site_sku: 'SS1', window_code: 'W1', source_warehouse_id: 'WH-A', route_no: '1' };
var id1 = sadDeterministicLineId_('RD::WEEKLY_SHIPPING::RECO-2026-08::k', lA);
var id2 = sadDeterministicLineId_('RD::WEEKLY_SHIPPING::RECO-2026-08::k', { sku: 'SKU1', site_sku: 'SS1', window_code: 'W1', source_warehouse_id: 'WH-A', route_no: '1' });
ok(/^SADL-[0-9A-F]{8}$/.test(id1), 'B1. deterministic id shape SADL-<8 hex upper>, nonblank');
ok(id1 === id2, 'B1. same logical line → same id (stable / regeneration reuses)');
ok(sadDeterministicLineId_('RD::WEEKLY_SHIPPING::RECO-2026-08::k', { sku: 'SKU2', site_sku: 'SS1', window_code: 'W1', source_warehouse_id: 'WH-A', route_no: '1' }) !== id1, 'B1. different sku → different id');
ok(sadDeterministicLineId_('OTHER-DRAFT', lA) !== id1, 'B1. different draft → different id');
// natural-key finder against a fake sheet holding a GENERATED row (blank id) — an edit must find it (no duplicate)
function fakeSheet(headers, rows) { return { getDataRange: function () { return { getValues: function () { return [headers].concat(rows); } }; } }; }
var LH = SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.slice();
function rowFor(vals) { return LH.map(function (h) { return vals[h] == null ? '' : vals[h]; }); }
var genRow = rowFor({ allocation_draft_line_id: '', allocation_draft_id: 'D1', sku: 'SKU1', site_sku: 'SS1', window_code: 'W1', source_warehouse_id: 'WH-A', route_no: '1', planned_qty: 100 });
var sh = fakeSheet(LH, [genRow]);
var foundNk = sadFindLineByNaturalKey_(sh, 'D1', lA);
ok(foundNk && foundNk.row === 2, 'B1. blank-id generated row found by natural key → UPDATE (no duplicate append)');
ok(sadFindLineByNaturalKey_(sh, 'D1', { sku: 'SKU9', site_sku: 'SS1', window_code: 'W1', source_warehouse_id: 'WH-A', route_no: '1' }) === null, 'B1. non-matching natural key → null (would INSERT with deterministic id)');
ok(typeof foundNk.col === 'function' && foundNk.col('allocation_draft_id') === LH.indexOf('allocation_draft_id'), 'B1. finder returns a procurementFindRow_-shaped {row, col}');

section('B1. 16_ edit path structure (id-or-natural-key, heal blank id, deterministic insert, under lock)');
// F1-7N-FB-4B §B — STRICTLY STRONGER than the shape this pinned. "explicit id else natural key" is exactly what
// produced three physical rows under one primary key: a stale client-side id resolved to nothing, the natural-key
// scan was skipped because an id WAS supplied, and the code fell straight through to append. The resolution ladder
// is now explicit id (identity-checked) -> CANONICAL id -> natural key -> insert, with a pre-insert PK assertion.
ok(/var canonicalId = sadCanonicalLineId_\(isK2Draft, draftId, l\);/.test(G16), 'B1. every incoming line gets its CANONICAL identity');
ok(/var byCanonical = procurementFindRow_\(sh, 'allocation_draft_line_id', canonicalId\);/.test(G16), 'B1. the canonical id is looked up BEFORE any insert is considered');
ok(/var byNatural = sadFindLineByNaturalKey_\(sh, draftId, l\);/.test(G16), 'B1. the natural-key scan is still the last resolution step');
ok(/LINE_IDENTITY_CONFLICT/.test(G16), 'B1. an explicit id naming a DIFFERENT logical line fails closed');
// R6F2G: the heal now routes through the K2-aware sadNewLineId_ (a generic draft still heals to the SADL- id because
// sadNewLineId_(false, …) delegates to sadDeterministicLineId_; a stored SADH-K2- draft heals to the SADL-K2- id).
ok(/if \(!curId0\) sh\.getRange\(found\.row, cId0 \+ 1\)\.setValue\(sadNewLineId_\(isK2Draft, draftId, l\)\)/.test(G16), 'B1. blank generated-line id healed with the K2-aware deterministic id on edit');
ok(/function sadNewLineId_\(isK2, draftId, l\) \{ return isK2 \? sadK2DeterministicLineId_\(draftId, l\) : sadDeterministicLineId_\(draftId, l\); \}/.test(G16), 'B1. sadNewLineId_ delegates to sadDeterministicLineId_ for a generic (non-K2) draft (unchanged behavior)');
ok(/lineId = canonicalId;/.test(G16), 'B1. an INSERT always uses the CANONICAL deterministic id (no random UUID, no caller id)');
ok(/LINE_PRIMARY_KEY_ALREADY_EXISTS/.test(G16), 'B1. and an insert onto an existing primary key is refused outright');
ok(/LockService\.getScriptLock\(\)/.test(G16) && /tryLock\(30000\)/.test(G16), 'B1/D. the public lines handler wraps the check-and-write in a 30s ScriptLock');
var execBlock = G16.slice(G16.indexOf("var EXEC_FIELDS"), G16.indexOf("var EXEC_FIELDS") + 160);
ok(/planned_qty/.test(execBlock) && /note/.test(execBlock) && /route_no/.test(execBlock), 'D. planned_qty + note + route_no are user-editable EXEC fields (blank note = deliberate overwrite)');
// F1-7N-FB-4C — STRENGTHENED. The inline list became a NAMED set so `expired` could join it without four call
// sites drifting apart. The guarantee is unchanged and now covers one more terminal status.
ok(/SAD_TERMINAL_LINE_STATUSES_ = \{ submitted: 1, cancelled: 1, expired: 1, superseded: 1, superseded_user_review: 1 \}/.test(G16),
  'D. the terminal LINE statuses are a named set — submitted/cancelled/expired/superseded/superseded_user_review');
ok(/if \(SAD_TERMINAL_LINE_STATUSES_\[curLS\]\) \{ skipped\+\+; continue; \}/.test(G16),
  'D. terminal rows are never mutated (stale/terminal guard reads that set)');
ok(/SAD_TERMINAL_STATUSES_ = \{ submitted: 1, cancelled: 1, expired: 1 \}/.test(G16),
  'D. and the terminal HEADER statuses likewise — an expired header is immutable history');

section('B2. hydration reads header recommended_* + line source_warehouse_id; NO selected_*');
var hydb = IR.slice(IR.indexOf('function _hydrateAllocationDraftFromDb'), IR.indexOf('function _clearAllocationDraft'));
ok(/recommended_source_warehouse_id/.test(hydb) && /recommended_destination_warehouse_id/.test(hydb) && /recommended_shipping_method/.test(hydb) && /recommended_last_mile_delivery/.test(hydb), 'B2. hydration reads From/To/Method/Last-Mile from the header recommended_* columns');
ok(!/selected_source_warehouse_id|selected_destination_warehouse_id|selected_shipping_method/.test(hydb), 'B2. hydration no longer references any nonexistent selected_* line column');
ok(/raw\.source_warehouse_id/.test(hydb), 'B2. hydration reads the line-level source_warehouse_id (R3C2 per-source axis)');
ok(/site_sku: raw\.site_sku/.test(hydb) && /window_code: raw\.window_code/.test(hydb) && /route_no: raw\.route_no/.test(hydb), 'B2. hydration carries the natural-key fields so an edit reconciles the exact generated line');
ok(/planned_qty: Number\(raw\.planned_qty\)/.test(hydb) && /note: raw\.note/.test(hydb), 'B2. planned_qty + note restored from the line');

section('C. generation chain intact (deterministic id + lock + find-or-reuse; NOT run)');
var G61 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '61_api_v1_weekly_ai_plan.gs'), 'utf8');
ok(/function handleGenerateWeeklyAiPlanDraft_/.test(G61) && /LockService\.getScriptLock\(\)/.test(G61), 'C. 61_ generation owner present + ScriptLock in persistence deps');
var DBAPI = fs.readFileSync(path.join(ROOT, 'js', 'api', 'operation-system-db-api.js'), 'utf8');
ok(/generateWeeklyAiPlanDraft\s*=\s*function/.test(DBAPI) && /weeklyAiPlan\.generate/.test(DBAPI), 'C. KM.DB.generateWeeklyAiPlanDraft → weeklyAiPlan.generate adapter present');
// no Shipping Plan / Shipment write from the allocation-draft EDIT path (scope to the upsert core; 16_ only mentions
// createShippingPlansBatch in a deferred-handoff comment)
var editCore = extractFn(G16, 'sadUpsertLinesKeyedCore_');
ok(!/createShippingPlansBatch|createShipment|shipment_lines|shipping_plan/.test(editCore), 'C/E. the allocation-draft edit core writes NO shipping_plans / shipment (handoff deferred)');

section('E. downstream mapping table frozen (§43); handoff deferred');
ok(/43\. R6F/.test(DOC) && /shipping_allocation_draft/.test(DOC) && /shipping_plan_lines/.test(DOC), 'E. §43 documents the allocation→shipping_plan mapping table');
ok(/marketplace.*never.*marketplace_seperate|never.*marketplace_seperate/i.test(DOC), 'E. mapping writes canonical marketplace, never marketplace_seperate');
ok(/PHASE2_K2_SHIPMENT_GROUP_MODEL_DEFERRED|K2_SHIPMENT_GROUP_MODEL_DEFERRED|PHASE_2_DEFERRED/.test(DOC), 'E/HALT. K2 shipment-group activation documented as deferred');

section('F. validator present + zero-write');
ok(/function TEMP_R6F_VALIDATE_INVENTORY_AI_PLAN_GROUP_MODEL\(\)/.test(TEMP), 'F. TEMP_R6F_VALIDATE_INVENTORY_AI_PLAN_GROUP_MODEL present');
ok(/R6F_ZERO_WRITE_CONFIRMED/.test(TEMP) && /INVENTORY_AI_PLAN_NOT_READY|READY_FOR_CONTROLLED_INVENTORY_AI_PLAN/.test(TEMP), 'F. validator asserts zero-write + emits a verdict');
ok(/line_id_completeness/.test(TEMP) && /active_group_duplicate_count/.test(TEMP) && /orphan_line_count/.test(TEMP), 'F. validator reports line-id completeness + active-group duplicates + orphan lines');

section('G. flags frozen + no Shipment/Submit; blank orphan never reused');
ok(/var\s+REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=\s*true\s*;/.test(CONFIG), 'G. flat V2 cutover = true');
ok(/var\s+REQUEST_ORDER_SITE_CONFIRM_REQUIRED_\s*=\s*false\s*;/.test(CONFIG), 'G. site confirm = false');
ok(/var\s+INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false\s*;/.test(CONFIG), 'G. inventory generation = false (staged; no live gen)');
ok(/EMPTY_ORPHAN_SAFE_TO_CANCEL/.test(TEMP), 'G. blank-cycle orphan classified EMPTY_ORPHAN_SAFE_TO_CANCEL (never reused — literal nonblank-cycle scope)');

section('H. unified release token (R6F)');
var NS = fs.readFileSync(path.join(ROOT, 'js', 'core', 'namespace.js'), 'utf8');
ok(/RELEASE:\s*'r6a1-request-send-20260822'/.test(NS), 'H. KM.RELEASE = r6a1-request-send-20260822');
var INDEX = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/inventory-replenishment\.js\?v=r6a1-request-send-20260822/.test(INDEX), 'H. changed inventory-replenishment.js carries the R6F token (hydration fix cache-busts)');

done();
