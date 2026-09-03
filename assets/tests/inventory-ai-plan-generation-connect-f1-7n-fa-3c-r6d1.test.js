// Kitchen Mama Operation System — R6D1 Inventory AI Plan generation connect (staged) — F1-7N-FA-3C-R6D1.
// Run: node assets/tests/inventory-ai-plan-generation-connect-f1-7n-fa-3c-r6d1.test.js
// Drives the REAL handleReplenAiPlan + generation helpers through a fake DB/DOM, proving: (B) the manual button routes to
// KM.DB.generateWeeklyAiPlanDraft ONCE with a concrete company+country scope ONLY WHEN the backend-owned flag is ON;
// default OFF → page-state only (zero DB write); (D) truthful result classification + manual-only popup; (E) post-
// generation DB readback hydration. Plus the REAL km-api-foundation flag mirror + the corrected run-authority/validator.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6D1 INVENTORY AI PLAN CONNECT (F1-7N-FA-3C-R6D1): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extract(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
var IR = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'inventory-replenishment.js'), 'utf8').replace(/\r\n/g, '\n');
var CFG = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');
var GS = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8');

// ---- harness ----
var flagOn = false, genCalls = { n: 0, last: null }, hydrateCalls = { n: 0 }, refreshCalls = { n: 0 }, renderCalls = { n: 0 };
var _timers = [];
function setTimeout2(fn) { _timers.push(fn); return _timers.length; } function flushT() { var t = _timers.slice(); _timers = []; t.forEach(function (f) { if (f) f(); }); }
var setTimeout = setTimeout2;
function tick() { flushT(); var p = Promise.resolve(); for (var k = 0; k < 12; k++) p = p.then(function () { flushT(); }); return p; }
var _els = {};
// F1-7N-FB-4E-R4B-R3 - createElement used to hard-code the id 'replen-ai-plan-result' and appendChild used to
// FILE every created element under that one key, so this harness could not tell two different elements apart.
// The page now creates a second, separate element (the AI Support notice, which has its own id precisely so it
// cannot race the AI Plan result panel), and the old stub reported it as the result popup. Elements are now
// filed under the id the page actually gives them.
function mkEl(id) {
  var cls = {}, attrs = {};
  return { id: id, hidden: false, disabled: false, style: {}, innerHTML: '', textContent: '', dataset: {},
    classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } },
    setAttribute: function (k, v) { attrs[k] = String(v); }, getAttribute: function (k) { return attrs[k] === undefined ? null : attrs[k]; },
    removeAttribute: function (k) { delete attrs[k]; }, appendChild: function () {} };
}
// F1-7N-FC-1B-E3 - the click now marks the Execution Plan area busy and writes a status line into it, both
// of which are querySelectorAll sweeps. There is no Execution Plan open in this harness, so the honest stub is
// an EMPTY list: the assertions below are about the generation transport, and a no-op sweep is exactly what a
// collapsed page produces. clearTimeout is added because the request is now raced against a timeout.
var document = {
  getElementById: function (id) { return _els[id] || null; },
  createElement: function () { return mkEl(''); },
  querySelectorAll: function () { return []; },
  body: { appendChild: function (el) { _els[el.id || '__anonymous__'] = el; } }
};
function clearTimeout(h) { if (h) _timers[h - 1] = null; }
function escapeReplenHtml(v) { return String(v == null ? '' : v); }
function renderReplenishment() { renderCalls.n++; }
function _replenSelectedScope() { return { company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MP1' }; }
function _hydrateAllocationDraftFromDb() { hydrateCalls.n++; return true; }
function isOperationDbApiConfigured() { return true; }
var _irMatState = { rows: [], bySku: {} }, _irRecoByKey = {};
var window = {
  KMREC: null,
  KM: {
    DB: {
      generateWeeklyAiPlanDraft: function (payload) { genCalls.n++; genCalls.last = payload; return Promise.resolve(genResponse); },
      refreshCacheTables: function () { refreshCalls.n++; return Promise.resolve(true); }
    },
    api: { inventoryAiPlanDbGenerationEnabled: function () { return flagOn; } }
  }
};
var genResponse = { success: true, data: { status: 'COMPLETED', marketplaceCount: 1, skuCount: 3, marketplaceResults: [{ marketplace: 'Amazon', success: true, status: 'CREATED', draftId: 'RD::WEEKLY_SHIPPING::RECO-2026-08::…', draftVersion: 1, lineCount: 3 }] }, errors: [] };
// extract the real functions — join + eval ONCE at top level (eval inside a forEach callback would scope them locally).
// F1-7N-FB-4E-R4B-R3 - handleReplenAiPlan now REPORTS its outcome (a click that ran and produced nothing used
// to look exactly like a click that did nothing), so the AI Support notice/trigger helpers it calls have to be
// extracted with it. The two module-scope vars cannot be pulled by extract(), which only understands function
// declarations, so they are mirrored here - and mirrored deliberately, not defaulted, so a rename fails loudly.
// F1-7N-FC-1B-E3 - `_irAiPlanRunning` joins the mirrored module vars, and for the same stated reason: it is
// the re-entry guard, and it replaced reading a hidden menu item's `disabled` attribute (which was re-enabled
// synchronously in the same task and therefore guarded nothing). Mirrored deliberately so a rename fails loud.
var _r6d1Vars = 'var _irAiSupportTriggerOwner = null; var _irAiPlanRunning = false;';   // _irRecoByKey is already declared by this harness
// The AI Plan click is now a PAIR: handleReplenAiPlan (guard + the visible busy state, in the click's own
// event-loop turn) and _irAiPlanRun_ (the work, one task later). Both halves and the surfaces they write to
// are extracted, because the shipped functions are what this suite drives.
var _r6d1Fns = [ '_replenCtx', '_irRecoNow_', '_irInventoryAiPlanDbGenerationEnabled_', '_irAiPlanDbGenEligible_', '_irClassifyGenerationResult_', '_irRunInventoryAiPlanGeneration_', '_irAiPlanReconcile_', '_irAiPlanWithTimeout_', '_irShowAiPlanResult_', '_irAiSupportTriggerEl_', '_irAiSupportTriggerBusy_', '_irAiSupportTriggerIdle_', '_irAiSupportNoticeEl_', '_irClearAiSupportNotice_', '_irAiSupportNotice_', '_irEscNotice_', '_irAiPlanDefer_', '_irAiPlanIsRunning_', '_irAiPlanTriggerBusy_', '_irAiPlanTriggerIdle_', '_irExecPlanAriaBusy_', '_irExecListSku_', '_irExecPlanStatusSet_', '_irAiPlanPhase_', '_irAiPlanTerminal_', '_irTouchedComposerSkus_', '_irPersistedManualRouteSkus_', 'handleReplenAiPlan', '_irAiPlanRun_' ].map(function (n) { return extract(IR, n); }).join('\n');
var _r6d1Phases = (IR.match(/var IR_AI_PLAN_PHASES = \{[\s\S]*?\};/) || [])[0] || '';
if (!_r6d1Phases) { console.error('IR_AI_PLAN_PHASES not found in the page'); process.exit(1); }
eval(_r6d1Vars + '\n' + _r6d1Phases + '\n' + _r6d1Fns);

(function run() {
  section('B. flag OFF (default) → page-state only, NO DB generation');
  _els['replen-ai-plan-btn'] = mkEl('replen-ai-plan-btn'); flagOn = false; genCalls.n = 0; delete _els['replen-ai-plan-result'];
  handleReplenAiPlan();
  tick().then(function () {
    eq(genCalls.n, 0, 'B(off). flag OFF → generateWeeklyAiPlanDraft NOT called (no DB write; existing page-state behavior)');
    ok(!_els['replen-ai-plan-result'], 'D(off). no result popup when flag OFF');

    section('B. flag ON → routes the MANUAL click to weeklyAiPlan.generate ONCE with company+country scope');
    _els['replen-ai-plan-btn'] = mkEl('replen-ai-plan-btn'); flagOn = true; genCalls.n = 0; hydrateCalls.n = 0; refreshCalls.n = 0; delete _els['replen-ai-plan-result'];
    genResponse = { success: true, data: { status: 'COMPLETED', marketplaceCount: 1, skuCount: 3, marketplaceResults: [{ marketplace: 'Amazon', success: true, status: 'CREATED', draftId: 'RD::x', draftVersion: 1, lineCount: 3 }] }, errors: [] };
    handleReplenAiPlan();
    return tick();
  }).then(function () {
    eq(genCalls.n, 1, 'B(on). exactly ONE generateWeeklyAiPlanDraft call');
    eq([genCalls.last.company, genCalls.last.country, genCalls.last.mode], ['ResUS', 'US', 'MANUAL_REGENERATE'], 'B(on). concrete company+country scope + MANUAL_REGENERATE mode (marketplace is readback context only)');
    ok(!('planningCycle' in genCalls.last) || !genCalls.last.planningCycle, 'B(on). no client planning_cycle sent → backend resolves the canonical nonblank cycle (deterministic reuse, blank-orphan never matched)');

    section('E. after success → DB readback hydration + atomic re-render + manual result popup');
    eq([refreshCalls.n, hydrateCalls.n], [1, 1], 'E. refreshCacheTables + _hydrateAllocationDraftFromDb run from the DB readback (not only the generation response)');
    ok(_els['replen-ai-plan-result'], 'D. manual dismissible result popup shown after a manual generation');
    ok(/AI Plan generated/.test(_els['replen-ai-plan-result'].innerHTML) && /Technical details/.test(_els['replen-ai-plan-result'].innerHTML), 'D. business-readable headline + collapsed Technical details disclosure');

    section('D. truthful result classification');
    eq(_irClassifyGenerationResult_({ success: true, data: { status: 'COMPLETED', marketplaceResults: [{ lineCount: 2 }] } }).ok, true, 'COMPLETED → ok');
    eq(_irClassifyGenerationResult_({ success: true, data: { status: 'PARTIAL', marketplaceResults: [] } }).ok, true, 'PARTIAL → ok');
    // F1-7N-FB-4C — a zero-result run is now a SUCCESS (§E): "nothing needs shipping this cycle" is a real answer
    // and must still supersede the previous proposal, so the classifier reports it as a zero-result success
    // rather than as a non-ok outcome. The reason text says so explicitly.
    var noDemand = _irClassifyGenerationResult_({ success: true, data: { status: 'NO_DEMAND', job_status: 'NO_DEMAND', zero_result: true, marketplaceResults: [] } });
    eq(noDemand.reason, 'no allocation needed this cycle', 'NO_DEMAND → "no allocation needed this cycle"');
    eq(noDemand.zeroResult, true, 'NO_DEMAND is classified as a ZERO-RESULT run');
    eq(noDemand.ok, true, 'and a zero-result run is a SUCCESS, so the page refreshes and the old plan is replaced');
    eq(_irClassifyGenerationResult_({ success: false, data: { status: 'FAILED', marketplaceResults: [] } }).ok, false,
      'a genuinely FAILED run is still not ok — a failure never refreshes or expires anything');
    eq(_irClassifyGenerationResult_({ success: false, data: { status: 'BLOCKED_INPUT', marketplaceResults: [] } }).ok, false, 'BLOCKED_INPUT → not ok');
    eq(_irClassifyGenerationResult_({ success: false, data: { status: 'FAILED', marketplaceResults: [{ status: 'BLOCKED_CONFLICT', success: false, draftId: 'RD::y' }] } }).blockedCount, 1, 'FAILED with a blocked marketplace → blockedCount, draftId preserved (never conceals committed rows)');

    section('B/D. background suppression — popup is manual-only (no non-manual caller)');
    var defCount = (IR.match(/function _irShowAiPlanResult_\(/g) || []).length;   // exclude the definition site
    var popupCallsAll = (IR.match(/_irShowAiPlanResult_\(/g) || []).length - defCount;
    var popupCallsInRun = (extract(IR, '_irRunInventoryAiPlanGeneration_').match(/_irShowAiPlanResult_\(/g) || []).length;
    ok(popupCallsInRun >= 1 && popupCallsAll === popupCallsInRun, 'the result popup is invoked ONLY from the manual generation helper (no background/resume call-site)');
    ok(!/(_irShowAiPlanResult_|_irRunInventoryAiPlanGeneration_|handleReplenAiPlan\()/.test(extract(IR, '_irResumeGapJobOnMount_')), 'the gap-job resume path never opens the popup / triggers generation (background silent)');

    section('E. flag mirror — REAL km-api-foundation (default OFF; reversible)');
    var KMAPI = require(path.join(ROOT, 'js', 'api', 'km-api-foundation.js'));
    var inst = KMAPI.createDefault();
    eq(inst.inventoryAiPlanDbGenerationEnabled(), false, 'flag mirror default OFF (staged; deploy changes no live behavior)');
    eq(inst.setInventoryAiPlanDbGenerationEnabled(true), true, 'setter enables it (reversible; for the controlled Stage-3 run)');
    eq(KMAPI.createApiFoundation({ inventoryAiPlanDbGenerationEnabled: true }).inventoryAiPlanDbGenerationEnabled(), true, 'deps override honored (single authority)');
    // RESTATED (F1-7N-FC-1B-E3): this pinned the flag's VALUE at the moment it was written, so it asserted
    // "the feature is still staged off" while claiming to assert "the flag exists and follows the
    // convention". §E.4 of E3 activates it, USER-authorized, which is the whole point of a flag. What is
    // durable, and what a rollback actually depends on, is that the flag REMAINS: one boolean of record in
    // 00_config.gs, read through one accessor, so setting it back to false is the entire rollback.
    ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = (true|false);/.test(CFG),
      'backend owner-of-record flag in 00_config.gs is a single boolean literal (either value: it is the rollback switch)');
    ok(/function inventoryAiPlanDbGenerationEnabled_\(\) \{ return INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ === true; \}/.test(CFG),
      'and exactly one accessor reads it, so every gate reads the same value');
    ok(/inventory_ai_plan_db_generation_enabled/.test(fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '63_api_v1_system_health.gs'), 'utf8')),
      '§E.6 the EFFECTIVE value is reportable from system.health, so the deployed posture is a fact and not an inference');

    section('I. corrected run authority + validator (source)');
    ok(/GAP_JOB_INVENTORY/.test(GS) && /\/\^GAP-INV-\/\.test/.test(GS), 'run-finder reads the GAP_JOB_INVENTORY script property + requires a GAP-INV-* run id');
    ok(/status: 'NOT_FOUND'/.test(GS) && /monthly_order_exclusion/.test(GS), 'NOT_FOUND when no GAP-INV run + explicit MONTHLY_ORDER exclusion proof (never reports a MONTHLY_ORDER run as Inventory)');
    ok(/function TEMP_R6D1_VALIDATE_INVENTORY_AI_PLAN_READY\(\)/.test(GS), 'validator entrypoint TEMP_R6D1_VALIDATE_INVENTORY_AI_PLAN_READY exists');
    ok(/EMPTY_ORPHAN_SAFE_TO_CANCEL/.test(GS) && /VALID_MANUAL_DRAFT_MISSING_CYCLE/.test(GS) && /LINKED_DRAFT_REQUIRES_RECONCILIATION/.test(GS) && /AMBIGUOUS_HALT/.test(GS), 'orphan classifier covers all four classes');
    ok(/AUTOMATIC_GENERATION_DEFERRED_SPEC_AUTHORITY_MISSING/.test(GS), 'G: automatic generation reported DEFERRED (spec authority missing)');
    ok(/R6D1_ZERO_WRITE_CONFIRMED/.test(GS) && !/\.(setValues|appendRow|setNumberFormat|insertSheet|setValue)\(/.test(extract(GS, 'TEMP_r6d1ValidateInventoryAiPlanReady_')), 'validator is read-only (zero-write; no mutation CALLS)');
    ok(/GENERATED_LINE_ID/.test(GS) && /HYDRATION_FIELD_MAP/.test(GS), 'I: the discovered generated-line reconciliation gaps are surfaced as controlled-run blockers');

    section('safety — no Submit/handoff/Request-Order-Draft-Line dependency added');
    ok(!/createShipmentDraft|submitShippingAllocationDrafts\(|request_order_allocation_draft_lines/.test(extract(IR, '_irRunInventoryAiPlanGeneration_')), '16/17. generation path adds no Submit/Shipment-handoff/Request-Order-Draft-Line dependency');

    done();
  }).catch(function (e) { console.error('ASYNC ERROR', e && e.stack || e); fail++; done(); });
})();
