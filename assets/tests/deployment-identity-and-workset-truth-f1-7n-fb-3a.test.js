// F1-7N-FB-3A — deployment identity, registry transport, Send Request workset truth, PO document cause.
// Run: node assets/tests/deployment-identity-and-workset-truth-f1-7n-fb-3a.test.js
//
// The transport classifiers, the deployment-contract check and the workset counters are EXECUTED from the
// shipped sources against stubbed seams — never a mirrored copy. No network call, no Apps Script execution,
// no DB or Drive write, no email, no Demo mutation.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var API = read('js/api/operation-system-db-api.js');
var INV = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');
var POJS = read('js/pages/purchase-order-overview.js');
var RTR = read('specs/active/apps-script/01_router.gs');
var G13 = read('specs/active/apps-script/13_procurement_handlers.gs');
var G39 = read('specs/active/apps-script/39_document_runtime_service.gs');
var G63 = read('specs/active/apps-script/63_api_v1_system_health.gs');
var G64 = read('specs/active/apps-script/64_api_v1_scope_registry.gs');
var G65 = read('specs/active/apps-script/65_api_v1_flow_diagnostics.gs');
var TEMPDOC = read('specs/active/apps-script/TEMP_document_diagnostics.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var RE_PRECEDERS_ = '(,=:[!&|?{};+-*%<>~^';
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) start = src.indexOf(name + ' = function');
  if (start < 0) start = src.indexOf(name + ' = async function');
  if (start < 0) throw new Error('missing fn ' + name);
  var i = src.indexOf('{', start), depth = 0, prev = '';
  for (; i < src.length; i++) {
    var c = src[i], n2 = src.substr(i, 2);
    if (n2 === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (n2 === '/*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { var q = c; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } prev = q; continue; }
    if (c === '/' && RE_PRECEDERS_.indexOf(prev) !== -1) { i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === '[') { for (i++; i < src.length && src[i] !== ']'; i++) { if (src[i] === '\\') i++; } continue; } if (src[i] === '/') break; } prev = '/'; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('unbalanced ' + name);
}
function extractVar(src, decl) {
  var start = src.indexOf(decl);
  if (start < 0) throw new Error('missing var ' + decl);
  var open = src.indexOf('{', start), bracket = src.indexOf('[', start);
  if (bracket !== -1 && (open === -1 || bracket < open)) open = bracket;
  var openCh = src[open], closeCh = openCh === '{' ? '}' : ']', depth = 0;
  for (var i = open; i < src.length; i++) {
    if (src.substr(i, 2) === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (src[i] === '"' || src[i] === "'") { var q = src[i]; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } continue; }
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (!depth) { var j = src.indexOf(';', i); return src.slice(start, j + 1); } }
  }
  throw new Error('unbalanced ' + decl);
}
function code(src) {
  return src.split('\n').map(function (l) {
    var q = null, out = '';
    for (var i = 0; i < l.length; i++) {
      var c = l[i];
      if (q) { out += c; if (c === '\\') { out += l[++i] || ''; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
      if (c === '/' && l[i + 1] === '/') break;
      out += c;
    }
    return out;
  }).join('\n');
}

// =======================================================================================================
section('A. editor success cannot mask a stale deployed endpoint');

// The two facts the user reported are not in conflict — and the source says why.
var wrap64 = extractFn(G64, 'TEMP_INVENTORY_SCOPE_REGISTRY_CHECK');
ok(/handleInventoryScopeRegistryGet_\(\{\}\)/.test(wrap64),
  'A1. the editor wrapper calls the handler DIRECTLY — it never goes through /exec');
ok(/proves only that the code is saved|proves NOTHING about the deployed/.test(G64),
  'A2. and the source says so explicitly, so a green editor run is not read as a deployment proof');
ok(/DEPLOYMENT VERSION/.test(G64), 'A2. naming the publish step that is actually required');
// health's own self-referential warning
ok(/missing_actions_is_self_referential: true/.test(G63),
  'A3. system.health declares that an empty missing_actions list proves nothing');
ok(/SELF-REFERENTIAL/.test(G63), 'A3. and explains why: the list ships WITH the deployment it is describing');
ok(/running this wrapper in the EDITOR proves the code is SAVED/.test(G63),
  'A3. the health wrapper carries the same warning');

// =======================================================================================================
section('B. immutable deployment identity');

['build_id', 'contract_version', 'deployed_action_contract_version', 'inventory_registry_projection_version'].forEach(function (f) {
  ok(new RegExp('^\\s*' + f + ':', 'm').test(G63), 'B1. system.health exposes ' + f);
});
ok(/required_action_list_version:/.test(G63) && /required_action_count:/.test(G63),
  'B1. plus the required-action list version and size');
// the build marker was the field that failed, so it must now actually move
// F1-7N-FB-3B: the bump rule is asserted, not a frozen literal. FB-3B is a sync-visible backend change that
// ALSO adds router actions, so both constants must have moved past their FB-3A values. Pinning the exact string
// would make this suite fail on every legitimate future bump, which is the opposite of what it is guarding.
var _buildNow = (G63.match(/var SYS_BUILD_VERSION_ = '([^']+)';/) || [])[1];
ok(!!_buildNow && _buildNow !== 'F1-7N-FB-3A' && _buildNow !== 'F1-7N-FB-2',
  'B2. SYS_BUILD_VERSION_ is bumped past FB-3A for this change (now ' + _buildNow + ')');
ok(!/var SYS_BUILD_VERSION_ = 'F1-7N-FB-2';/.test(G63), 'B2. and no longer reports the FB-2 build it reported live');
var _acv = Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]);
ok(_acv >= 4, 'B2. the action contract version advanced when router actions were added (now v' + _acv + ')');
ok(/MUST be bumped in the same commit as any sync-visible backend change/.test(G63),
  'B2. with a written rule so it cannot silently go stale again');
// the registry projection version is sourced from 64_, not restated
ok(/inventory_registry_projection_version: \(typeof SCOPEREG_PROJECTION_VERSION_ !== 'undefined'\)/.test(G63),
  'B3. the projection version is read from its owner (64_), never duplicated');
ok(/var SCOPEREG_PROJECTION_VERSION_ = 'FB-3\.1';/.test(G64), 'B3. which declares it');

// required actions must cover the FB-3 surface
['inventoryScope.registry.get', 'system.shippingAllocationSchemaDiagnostic', 'system.requestOrderSendDiagnostic',
 'system.twoVerticalFlowsDiagnostic', 'system.requestOrderSendReconcile', 'upsertRequestOrderAllocationDraft',
 'createRequestOrderDraft', 'submitRequestOrderAllocationDrafts', 'upsertShippingAllocationDraft',
 'submitAllocationDraftsToShippingPlans', 'updatePurchaseOrderStatus'].forEach(function (a) {
  ok(new RegExp("action: '" + a.replace(/\./g, '\\.') + "'").test(G63), 'B4. required actions include ' + a);
  ok(RTR.indexOf("action === '" + a + "'") !== -1, 'B4. and the router registers ' + a);
});

// =======================================================================================================
section('C. a stale deployment is DEPLOYMENT_CONTRACT_MISMATCH, never GAP_READ_ERROR');

global.window = global.window || {};
global.window.KM = global.window.KM || {}; global.window.KM.DB = global.window.KM.DB || {};
var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 3, KM_EXPECTED_REGISTRY_PROJECTION_VERSION_ = 'FB-3.1';
eval(extractVar(API, 'var KM_UNKNOWN_ACTION_PATTERNS_ = ['));
eval(extractFn(API, '_kmIsUnknownActionResponse_'));
eval(extractFn(API, '_kmDeploymentMismatchError_'));

// the router's real terminal texts, both verbs
ok(_kmIsUnknownActionResponse_('Invalid POST action. Supported: updateSkuLifecycle, upsertSkuDetail, …'),
  'C1. the doPost unknown-action envelope is recognised');
ok(_kmIsUnknownActionResponse_('Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get'),
  'C1. and the doGet one');
// those exact strings really are what the router answers
ok(/error: 'Invalid POST action\. Supported:/.test(RTR), 'C1. proven against the shipped router text (POST)');
ok(/error: 'Missing or invalid action parameter\./.test(RTR), 'C1. and (GET)');
// a genuine business rejection must NOT be mistaken for a missing action
['PLAN_HEADER_INCOMPLETE — a Draft route requires From + To + Method',
 'PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [shipping_allocation_drafts]',
 'Could not acquire lock; please retry.',
 'Send PO blocked — the required Purchase Order document could not be produced.'].forEach(function (m) {
  ok(!_kmIsUnknownActionResponse_(m), 'C2. a real business reason is not misread as a missing action: ' + m.slice(0, 40));
});

var dm = _kmDeploymentMismatchError_('inventoryScope.registry.get');
eq(dm.code, 'DEPLOYMENT_CONTRACT_MISMATCH', 'C3. the typed code replaces GAP_READ_ERROR');
eq(dm.details.missing_action, 'inventoryScope.registry.get', 'C3. naming the action the caller asked for');
eq(dm.details.zero_write, true, 'C3. nothing was read or written');
eq(dm.details.retryable, false, 'C3. and retrying cannot publish a deployment, so it is not retryable');
ok(/NEW DEPLOYMENT VERSION/.test(dm.message), 'C3. the message states the actual remedy');
ok(!/Supported:/.test(dm.message), 'C3. and does not echo the router\'s stale supported-action list');

// both canonical runners classify it BEFORE their generic fallbacks
var gapRead = extractFn(API, '_kmGapRead_');
ok(/_kmIsUnknownActionResponse_\(json\.error\)\) return \{ success: false, error: _kmDeploymentMismatchError_\(action\) \}/.test(gapRead),
  'C4. the READ runner returns the typed error instead of GAP_READ_ERROR');
ok(gapRead.indexOf('_kmIsUnknownActionResponse_') < gapRead.indexOf("code: 'GAP_READ_ERROR'"),
  'C4. and does so BEFORE the generic fallback it used to hit');
var cmd = extractFn(API, '_kmWeeklyCommand_');
ok(/_kmIsUnknownActionResponse_\(json\.error\)\)/.test(cmd), 'C5. the COMMAND runner classifies it too');
ok(cmd.indexOf('_kmIsUnknownActionResponse_') < cmd.indexOf('_kmClassifyBusinessError_'),
  'C5. before the business classifier could flatten it to BUSINESS_COMMAND_ERROR');

// the contract check compares the frontend's pinned expectation against the deployment's own identity
var chk = extractFn(API, 'window.KM.DB.checkDeploymentContract');
ok(/deployed_action_contract_version == null/.test(chk),
  'C6. a deployment that cannot report its action contract is itself proof of being older');
ok(/< KM_EXPECTED_ACTION_CONTRACT_VERSION_/.test(chk), 'C6. and an older contract version is rejected');
ok(/DEPLOYMENT_CONTRACT_MISMATCH/.test(chk), 'C6. with the same named code');
ok(!/throw /.test(code(chk)), 'C6. it never throws — the caller always gets a verdict');

// =======================================================================================================
section('D. registry failure: PRE_SEARCH preserved, one Retry = one request, no navigation needed');

var regFn = extractFn(INV, '_irEnsureRegistryLoaded_');
ok(!/_irWorkspaceRefresh_/.test(code(regFn)), 'D1. a registry failure cannot start an inventory workspace read');
ok(!/_irSearch\.applied/.test(code(regFn)), 'D1. and never touches the table\'s applied filters');
ok(/table stays PRE_SEARCH/.test(regFn), 'D1. which the source states at the failure site');
ok(/if \(_irRegistryPending\) return _irRegistryPending;/.test(regFn), 'D2. single-flight');
eq((code(regFn).match(/getInventoryScopeRegistry\(\)/g) || []).length, 1,
  'D2. exactly ONE request per load — a Retry therefore issues exactly one');
ok(/function _irReloadScopeRegistry_\(\) \{ return _irEnsureRegistryLoaded_\(\{ force: true \}\); \}/.test(INV),
  'D2. and Retry is a single forced load, not a loop');
var regRender = extractFn(INV, '_irRenderRegistryState_');
ok(/DEPLOYMENT_CONTRACT_MISMATCH/.test(regRender), 'D3. the surface recognises a stale deployment specifically');
ok(/deployed Apps Script is out of date/.test(regRender), 'D3. and says so in plain language');
ok(/Re-check/.test(regRender), 'D3. relabelling Retry, since retrying cannot publish a deployment');
ok(/Nothing was read or written/.test(regRender), 'D3. and stating the zero-effect truthfully');
ok(!/reload the page|navigate/i.test(code(regRender)), 'D4. recovery never asks the user to navigate away');

// =======================================================================================================
section('E. schema READY must not be second-guessed');

// The live diagnostic returned READY with exact 30-column headers on both tables. Nothing in this change may
// introduce a migration, a header write, or a guessed repair.
var sch = extractFn(G65, 'handleShippingAllocationSchemaDiagnostic_');
ok(/prodRequireSheet_\(ss, table, expectedHeaders \|\| \[\]\)/.test(G65),
  'E1. readiness is still decided by the writer\'s own validate-only gate');
var exec65 = code(G65).replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""');
['prodMigrateCreateSheet_', 'prodMigrateAppendColumns_', 'sheetEnsureColumns_', 'setValues', 'appendRow',
 'insertSheet', 'setValue'].forEach(function (s) {
  ok(exec65.indexOf(s) === -1, 'E2. 65_ never executes ' + s + ' — no migration path exists here');
});
ok(/it is reported, never repaired automatically/.test(G65),
  'E3. and a schema problem is explicitly reported rather than repaired');

// =======================================================================================================
section('F. the origin of 234 — EXECUTING the shipped workset builder');

eval(extractVar(RO, 'var RO_SEND_UNITS_ = ['));
eval(extractFn(RO, '_roBuildWorkset_'));
eval(extractFn(RO, '_roSendConfirmSummary_'));

// Reproduce the reported shape: 495 rows on the page, 234 SKU rows carrying a positive tier qty.
var drafts = [];
for (var i = 0; i < 234; i++) {
  drafts.push({ item: { sku: 'SKU' + i, series: 'S' + (i % 7) },
    lines: [{ orderQty: 10 }, { orderQty: 5 }], isCanonical: (i % 10 === 0) });
}
var excluded = { rows_in_scope: 495, all_page_rows: 495, removed_by_display_filters: 0,
  already_submitted_sku: 40, no_positive_tier_qty: 221 };
var w = _roBuildWorkset_(drafts, ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'], excluded, 'All Request (T1+T2+T3)');

eq(w.sku_rows_with_positive_tier, 234, 'F1. 234 is the count of SKU ROWS carrying a positive tier quantity');
eq(w.tier_cells_with_positive_qty, 468, 'F2. the tier CELLS are a different number entirely (468 here)');
eq(w.distinct_skus, 234, 'F3. distinct SKUs is its own count');
eq(w.distinct_series, 7, 'F4. and distinct Series is its own count');
eq(w.canonical_persisted_drafts, 24, 'F5. already-persisted canonical drafts are counted SEPARATELY');
eq(w.manual_drafts_to_create, 210, 'F5. from the manual drafts this Send would create');
eq(w.expected_request_order_headers, 7, 'F6. expected Request Order headers = Series groups');
eq(w.expected_request_order_lines, 468, 'F6. expected Request Order lines = tier cells');
ok(w.canonical_persisted_drafts !== w.sku_rows_with_positive_tier,
  'F7. so "234" was NEVER a count of persisted request_order_allocation_drafts');

// the frozen workset cannot be mutated by a later phase
var before = w.sku_rows_with_positive_tier;
try { w.sku_rows_with_positive_tier = 1; } catch (e) { /* strict-mode throw is also acceptable */ }
eq(w.sku_rows_with_positive_tier, before, 'F8. the workset is FROZEN — no phase can change a denominator mid-run');

// F1-7N-FB-3B: the confirmation summary is now built from the SERVER's frozen plan, and it must keep the two
// unit families VISIBLY SEPARATE — page CANDIDATES (495 / 234 / 468) versus PERSISTED allocation drafts. That is
// the strictly stronger form of the FB-3A contract: FB-3A labelled the units, FB-3B also proves which of them is
// the send authority. _roWorksetSummary_ is superseded by _roSendConfirmSummary_ and no longer exists.
var serverPlan = { tier_scope: 'ALL', planning_cycle: '2026-08', workset_checksum: 'ROSCHK-DEADBEEF',
  counts: { active_persisted_drafts: 180, drafts_with_positive_selected_tier: 180, selected_tier_allocations: 540,
    positive_selected_tier_allocations: 360, distinct_skus: 180, distinct_series: 7,
    expected_request_order_headers: 7, expected_request_order_lines: 360, total_units: 99000 },
  excluded: { status_submitted: 40, status_cancelled: 0, tier_terminal_already_sent: 12,
    tier_zero_or_blank_qty: 168, tier_out_of_scope: 0 },
  quantity_verification: { asserted: 360, verified: 360, persisted_without_assertion: 0 } };
var sum = _roSendConfirmSummary_({ all_page_rows_loaded: 495, sku_rows_with_positive_tier: 234,
  tier_cells_with_positive_qty: 468 }, serverPlan, 'All Request (T1+T2+T3)');
['ON THIS PAGE (candidate counts', 'WILL BE SENT (server authority', 'AI Plan rows loaded',
 'SKU rows with a positive tier qty', 'Tier cells with a positive qty', 'Active persisted drafts in the cycle',
 'POSITIVE selected-tier allocations', 'Distinct SKUs', 'Distinct Series',
 'Request Orders to create (headers)', 'Request Order LINES to create', 'QUANTITY VERIFICATION',
 'Verified against the database', 'Page rows with NO persisted draft',
 'Already submitted (header terminal)', 'Tier already sent (tier terminal)'].forEach(function (label) {
  ok(sum.indexOf(label) !== -1, 'F9. the confirmation summary labels: ' + label);
});
ok(/NOT persisted allocation drafts/.test(sum), 'F9. and states the distinction the old label got wrong');
ok(sum.indexOf('495') !== -1 && sum.indexOf('234') !== -1 && sum.indexOf('468') !== -1,
  'F9. the page CANDIDATE counts 495 / 234 / 468 all appear, under the candidate heading');
ok(sum.indexOf('DISPLAY ONLY') !== -1 && /do NOT reduce this Send/.test(sum),
  'F9. and the dialog states that the display controls do not reduce the Send');
ok(sum.indexOf('Proceed?') !== -1, 'F9. it is a CONFIRMATION shown before anything is written');
ok(!/function _roWorksetSummary_/.test(RO), 'F9. the superseded single-block summary helper is removed');

// the old mislabelled progress helper is gone, and no phase may mix units
// scan the CODE: the comment recording the removal deliberately names the removed helper
ok(!/_roSendProgress_/.test(code(RO)), 'F10. the mislabelled FB-3 progress helper is removed from the code');
var send = extractFn(RO, 'handleSendRequest');
ok(!/'allocation drafts'/.test(send), 'F10. and no phase calls a SKU-row count "allocation drafts"');
// F1-7N-FB-3B: there is no per-SKU write loop left to report, so the FB-3A per-loop phase assertions are
// superseded by a STRICTLY STRONGER one — the phase denominator now comes from the SERVER's frozen plan, which
// the page cannot influence at all, and it still names its unit.
ok(/_roSendPhase_\('Sending to the server orchestration', 0, plan\.counts\.expected_request_order_headers, 'Series groups'\)/.test(send),
  'F11. the send phase takes its denominator from the SERVER plan and names its unit as Series groups');
var phaseFn = extractFn(RO, '_roSendPhase_');
ok(/unitLabel/.test(phaseFn), 'F11. every phase must pass an explicit unit label');
// the confirmation is shown BEFORE the latch and before the committing request
ok(send.indexOf('_roSendConfirmSummary_') < send.indexOf('_roSendState.busy = true'),
  'F12. the summary is confirmed before the latch is taken');
ok(send.indexOf('_roSendConfirmSummary_') < send.indexOf('DB.sendRequestOrderOrchestration(orchestrationPayload)'),
  'F12. and before the one committing orchestration request');
ok(send.indexOf('dry_run: true') < send.indexOf('_roSendConfirmSummary_'),
  'F12. and the numbers it shows come from a ZERO-WRITE dry run performed first');

// exclusions are counted, not silently dropped
ok(/_roExcluded\.already_submitted_sku\+\+/.test(send), 'F13. terminal-submitted SKUs are counted as an exclusion');
ok(/_roExcluded\.no_positive_tier_qty\+\+/.test(send), 'F13. so are rows with no positive tier qty');
// F1-7N-FB-3B §B: the FB-3A "surface the display-filter truncation" contract is REPLACED by the user-frozen
// decision that there must BE no truncation. The count survives as a 0-BY-CONSTRUCTION proof.
ok(/removed_by_display_filters: 0,/.test(send),
  'F13. and display-filter truncation is now 0 BY CONSTRUCTION, not merely surfaced');

// =======================================================================================================
section('G. interrupted-saga reconciliation before any retry');

ok(/function handleRequestOrderSendReconcile_\(body\)/.test(G65), 'G1. the reconciliation handler exists');
eq((G65.match(/function handleRequestOrderSendReconcile_\(/g) || []).length, 1, 'G1. exactly once');
ok(/function TEMP_REQUEST_ORDER_SEND_RECONCILE\(\)/.test(G65), 'G1. with an editor wrapper');
ok(RTR.indexOf("action === 'system.requestOrderSendReconcile'") !== -1, 'G1. routed');
ok(/action: 'system\.requestOrderSendReconcile'/.test(G63), 'G1. and health-covered');
var rec = extractFn(G65, 'handleRequestOrderSendReconcile_');
ok(/NEVER treated as a zero-write/.test(G65), 'G2. a stopped Send is never assumed to have written nothing');
['site_confirmed', 'submitted', 'duplicate_primary_keys', 'duplicate_execution_keys', 'headers_with_zero_lines',
 'advanced_with_no_lines', 'partial_states', 'safe_resume_point', 'retry_safe', 'user_action_required',
 'request_order_lines_total', 'request_order_line_sources_total'].forEach(function (f) {
  ok(rec.indexOf(f) !== -1, 'G3. the report includes ' + f);
});
['DRAFTS_CONFIRMED_WITHOUT_REQUEST_ORDER', 'REQUEST_ORDER_WITHOUT_SUBMITTED_DRAFTS',
 'REQUEST_ORDER_HEADER_WITHOUT_LINES', 'ADVANCED_DRAFT_WITHOUT_LINES',
 'DUPLICATE_ALLOCATION_DRAFT_PRIMARY_KEY', 'DUPLICATE_REQUEST_ORDER_EXECUTION_KEY'].forEach(function (s) {
  ok(rec.indexOf(s) !== -1, 'G4. it detects the partial state ' + s);
});
ok(/var unsafe = out\.allocation_drafts\.duplicate_primary_keys\.length > 0/.test(rec),
  'G5. retry safety is decided by duplicated identities, not by optimism');
ok(/Do NOT retry/.test(rec), 'G5. and an unsafe finding says so explicitly');
ok(/RE_RUN_SEND_FOR_THE_SAME_SCOPE/.test(rec), 'G5. a resumable finding names the safe resume point');
ok(/NOTHING_WAS_WRITTEN_FOR_THIS_SCOPE/.test(rec), 'G5. and a clean finding is distinguished from a partial one');
// the idempotency claims it relies on are real
ok(/roFindByExecutionKey_/.test(G13), 'G6. the Request Order execution-key reuse it relies on exists');
ok(/REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT/.test(G13), 'G6. with a fail-closed duplicate guard');
// read-only
var recExec = code(rec).replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""');
['appendRow', 'setValue', 'setValues', 'LockService', 'DriveApp', 'MailApp'].forEach(function (s) {
  ok(recExec.indexOf(s) === -1, 'G7. reconciliation never executes ' + s);
});

// =======================================================================================================
section('H. Send PO returns a structured document cause, and the PO stays Draft');

// the backend already sent the structured envelope
ok(/success: false, stage: 'document_generation', document_stage: stage/.test(G13),
  'H1. 13_ already answers a blocked document with stage + document_stage');
ok(/document_generation: res/.test(G13), 'H1. and the full document-generation result');
ok(/The PO remains Draft\. No status was written and no email was sent\./.test(G13),
  'H2. stating that the PO stays Draft with no status write and no email');
// the client threw it away — that was the defect
var upd = extractFn(API, 'window.KM.DB.updatePurchaseOrderStatus');
ok(/throw _kmWriterError_\(json, 'Update purchase order status failed'\)/.test(upd),
  'H3. the writer now throws WITH the envelope attached');
var werr = extractFn(API, '_kmWriterError_');
ok(/e\.envelope = json/.test(werr), 'H3. so the structured cause survives the rejection');
ok(/e\.code = \(json && \(json\.document_stage \|\| json\.stage\)\)/.test(werr), 'H3. along with its typed stage');
// and the page renders it from the REJECTION path, which is where it actually arrives
var poCatch = POJS.slice(POJS.indexOf(".catch(function (e) {\n                _poEndCmd(key, btn);"));
ok(/e && e\.envelope/.test(poCatch), 'H4. the page reads the envelope off the rejection');
ok(/env\.stage === 'document_generation'/.test(poCatch), 'H4. and recognises the document gate');
['Blocking stage', 'Reason code', 'Unresolved required field', 'Drive'].forEach(function (f) {
  ok(poCatch.indexOf(f) !== -1, 'H5. the message exposes ' + f);
});
ok(/CONFIGURATION problem/.test(poCatch), 'H5. classifying a configuration cause');
ok(/The PO remains Draft\. No status was written, no document row was created and no email was sent\./.test(poCatch),
  'H6. and states the zero-effect guarantee');
ok(/TEMP_DOCUMENT_DIAGNOSE_PURCHASE_ORDER/.test(poCatch), 'H7. pointing at the read-only diagnostic by its REAL name');
ok(/function TEMP_DOCUMENT_DIAGNOSE_PURCHASE_ORDER\(\)/.test(TEMPDOC), 'H7. which exists');
// the diagnostic already carries everything §I asks for
['db_status', 'template', 'template_error', 'field_completeness', 'required_missing', 'drive_readiness',
 'folder_preview', 'existing_documents', 'expected_registry_identity', 'system_payload_verdict',
 'drive_readiness_verdict', 'blocking_reasons', 'next_action'].forEach(function (f) {
  ok(G39.indexOf(f) !== -1, 'H8. the PO document diagnostic reports ' + f);
});
ok(/writes_performed: 0, folders_created: 0, files_created: 0/.test(G39), 'H8. and proves it wrote nothing');
// the hard gate is NOT weakened
ok(/blocks_transition: true/.test(G39), 'H9. the required PO document remains a hard gate');
ok(/authorizes_issue/.test(G13), 'H9. and issue is still authorized by the finalize stage, not assumed');

// =======================================================================================================
section('I. no local business success, no Demo mutation, no email');

ok(!/sessionStorage\.setItem/.test(code(send)), 'I1. Send Request writes no local substitute for a DB row');
ok(!/sessionStorage\.setItem|localStorage\.setItem/.test(code(poCatch)), 'I1. nor does the Send PO failure path');
['MailApp', 'GmailApp'].forEach(function (s) {
  ok(code(G64).indexOf(s) === -1, 'I2. 64_ sends no email (' + s + ')');
  ok(code(G65).replace(/'[^'\n]*'/g, "''").indexOf(s) === -1, 'I2. 65_ sends no email (' + s + ')');
});
ok(code(G64).indexOf('TEMP_demo') === -1 && code(G65).indexOf('TEMP_demo') === -1,
  'I3. neither new module touches the Demo seed');
ok(/_roUseDb\(\)/.test(send), 'I4. Demo remains an explicit branch in Send Request');

console.log('\n' + (fail ? 'FAILURES: ' + fail : 'ALL PASS') + '  (' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
