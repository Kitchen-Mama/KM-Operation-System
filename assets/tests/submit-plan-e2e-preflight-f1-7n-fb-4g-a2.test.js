// F1-7N-FB-4G-A2 — SUBMIT PLAN E2E PREFLIGHT + UNSAVED-CHANGE SAFETY.
//
// THREE FINDINGS, ALL MEASURED BY EXECUTION.
//
// (1) THE WRITER THAT TURNS A DRAFT INTO A DURABLE WEEKLY SHIPPING PLAN DID NOT READ THE CANONICAL
//     DESTINATION. Its derivation was `snapshot || destWhId || h.marketplace` — a truthy chain over three
//     columns that do not mean the same thing — and `destination_marketplace`, the column A0-R1 added and
//     A0-R2 made the SOLE destination authority, was not among them. Executed over the four live shapes:
//
//       dest_marketplace  dest_wh_id      code_snapshot  scope mkt  |  PRE destination  POST destination
//       'Amazon'          ''              ''             'Amazon'   |  'Amazon'         'Amazon'   (identical)
//       'Amazon'          ''              ''             'Walmart'  |  'Walmart'  <--   'Amazon'
//       ''                ''              'Amazon'       'Amazon'   |  'Amazon'   <--   REFUSED, zero write
//       ''                'WH-US-3PL-01'  'US3PL01'      'Amazon'   |  'US3PL01'        'US3PL01' (identical)
//
//     `destination` is a shipping-plan GROUPING dimension, so a wrong value decides which plan a line joins.
//     H4's corrected value is byte-identical, so its grouping, fingerprint and plan identity do not move.
//
// (2) THERE WAS NO CONFIRMATION AT ALL. submitReplenishmentPlans went from its gates straight into
//     _replenCanonicalSubmit, which issues the request. And _replenSubmitExecutionKey() both MINTS and
//     PERSISTS the submit execution key, so it was minted before anything could be cancelled.
//
// (3) THE DIRTY VERDICT HAD SIX OWNERS. _irUnsavedRoutes (save failures), _draftDbTimers (debounced writes not
//     yet sent), _draftDbInFlight, _draftDbDirty, _pendingDraftCancels and — since A1-R1 — the Execution
//     panel's reveal state. Nowhere could answer "is what the operator sees what the database holds?".
//
// Run: node assets/tests/submit-plan-e2e-preflight-f1-7n-fb-4g-a2.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CMPSRC = read('assets/js/utils/inventory-compat.js');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var G01 = read('assets/specs/active/apps-script/01_router.gs');
var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var TEMP = read('assets/tools/apps-script-diagnostics/TEMP_shipping_allocation_submit_plan_a2_dry_run.gs');
var INDEX = read('index.html');
var CMP = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var PF = CMP.IRSubmitPreflight;
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function mutateFn(src, name, find, replace) {
  var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  var eol = src.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;
  function fix(t) { return String(t).split(CR + LF).join(LF).split(LF).join(eol); }
  find = fix(find); replace = fix(replace);
  var body = extractFn(src, name);
  if (body.indexOf(find) < 0) throw new Error('mutation target absent in ' + name + ': ' + find);
  return src.replace(body, body.replace(find, replace));
}
function moduleFrom(src) { return new Function('var module = { exports: {} }; var window; ' + src + ' return module.exports;')(); }

// ================================================================================================================
// AN IN-MEMORY SPREADSHEET, faithful to the exact surface the submit core touches: getDataRange().getValues(),
// getLastColumn(), getRange(r,c,nr,nc).getValues() and getRange(r,c).setValue(v). Nothing else is offered, so a
// core that reached for anything else would throw rather than silently pass.
//
// WHAT IS REAL AND WHAT IS STUBBED, stated rather than implied:
//   REAL (lifted from the shipped sources) — sadSubmitToShippingPlansCore_ itself, procurementFindRow_,
//     sadRowToObject_, sadReadLinesForDraft_, sadFnv1a_, sadDestinationIdentity_, sadHeaderRouteIsComplete_,
//     sadStoredHeaderRouteIsComplete_. Every one of the fifteen validation gates therefore runs for real.
//   STUBBED — the sheet I/O above, and 11_'s shippingPlanCommitFromLines_ / shippingPlanReadObjects_ /
//     shippingPlanRollbackBatch_, replaced by a RECORDING writer. The recorder is what makes the proposed
//     mapping observable field by field, and it counts writes so DB_WRITES can be asserted rather than claimed.
// ================================================================================================================
function MemSheet(grid) {
  this.g = grid.map(function (r) { return r.slice(); });
  this.writes = 0;
}
MemSheet.prototype.getDataRange = function () {
  var self = this;
  return { getValues: function () { return self.g.map(function (r) { return r.slice(); }); } };
};
MemSheet.prototype.getLastColumn = function () { return this.g.length ? this.g[0].length : 0; };
MemSheet.prototype.getLastRow = function () { return this.g.length; };
MemSheet.prototype.getRange = function (r, c, nr, nc) {
  var self = this;
  nr = nr || 1; nc = nc || 1;
  return {
    getValues: function () {
      var out = [];
      for (var i = 0; i < nr; i++) {
        var row = self.g[r - 1 + i] || [];
        out.push(row.slice(c - 1, c - 1 + nc));
      }
      return out;
    },
    setValue: function (v) {
      if (!self.g[r - 1]) self.g[r - 1] = [];
      self.g[r - 1][c - 1] = v;
      self.writes++;
    }
  };
};
function gridFrom(headers, objs) {
  var g = [headers.slice()];
  objs.forEach(function (o) { g.push(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; })); });
  return g;
}

var SAD_H = ['allocation_draft_id', 'company', 'country', 'marketplace', 'status', 'generation_type', 'created_by',
  'created_at', 'planning_cycle', 'calculation_run_id', 'formula_version', 'draft_version',
  'recommended_source_warehouse_id', 'recommended_source_warehouse_code_snapshot',
  'recommended_destination_warehouse_id', 'recommended_destination_warehouse_code_snapshot',
  'destination_marketplace', 'recommended_shipping_method', 'recommended_last_mile_delivery',
  'source_page', 'source_data_as_of', 'submitted_by', 'submitted_at', 'updated_by', 'updated_at', 'note'];
var SAD_L = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code',
  'planned_qty', 'units_per_carton', 'source_warehouse_id', 'line_status'];

// ---- THE FOUR LIVE HEADERS, declared once. No assertion below restates a value that is not here. -----------
function H(o) {
  var base = {
    company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
    generation_type: 'user_created', created_by: 'operator', created_at: '2026-09-01 10:00:00',
    planning_cycle: '', calculation_run_id: '', formula_version: '', draft_version: '1',
    recommended_source_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN',
    recommended_source_warehouse_code_snapshot: 'CNYOUXIN',
    recommended_destination_warehouse_id: '', recommended_destination_warehouse_code_snapshot: '',
    destination_marketplace: '', recommended_shipping_method: 'sea', recommended_last_mile_delivery: '',
    source_page: 'inventory_replenishment', source_data_as_of: '',
    submitted_by: '', submitted_at: '', updated_by: '', updated_at: '', note: ''
  };
  for (var k in o) base[k] = o[k];
  return base;
}
function LN(o) {
  var base = { allocation_draft_line_id: 'SADL-K2-16F4E4F9', allocation_draft_id: 'SADH-K2-E7AF9242',
    sku: 'CO1100-R', site_sku: '', window_code: '', planned_qty: 800, units_per_carton: 20,
    source_warehouse_id: '', line_status: '' };
  for (var k in o) base[k] = o[k];
  return base;
}
var LIVE = {
  H1: H({ allocation_draft_id: 'SAD-C787D1B1-D', recommended_shipping_method: 'sea_express', destination_marketplace: 'Amazon' }),
  H2: H({ allocation_draft_id: 'SAD-27976058-2', recommended_shipping_method: 'air', destination_marketplace: 'Amazon' }),
  H3: H({ allocation_draft_id: 'SADH-K2-7F15DD7D', company: 'ResTW', country: 'JP', marketplace: 'Amazon',
          recommended_shipping_method: 'air', destination_marketplace: 'Amazon' }),
  H4: H({ allocation_draft_id: 'SADH-K2-E7AF9242', recommended_shipping_method: 'sea', destination_marketplace: 'Amazon' })
};
var LIVE_LINES = {
  H3: [1, 2, 3, 4, 5].map(function (i) { return LN({ allocation_draft_line_id: 'SADL-JP-' + i, allocation_draft_id: 'SADH-K2-7F15DD7D', sku: 'JP-SKU-' + i, planned_qty: 44 }); }),
  H4: [LN({})]
};

// ---- the harness: the REAL core over the in-memory sheets ---------------------------------------------------
function runCore(headers, lines, body, opts) {
  opts = opts || {};
  var hSh = new MemSheet(gridFrom(SAD_H, headers));
  var lSh = new MemSheet(gridFrom(SAD_L, lines));
  var planRows = (opts.existingPlans || []);
  var recorder = { commits: 0, lines: [], planWrites: 0, lineWrites: 0, rollbacks: 0, batchIds: [] };

  var src = [
    extractFn(G13, 'procurementFindRow_'),
    extractFn(G16, 'sadRowToObject_'),
    extractFn(G16, 'sadReadLinesForDraft_'),
    extractFn(G16, 'sadFnv1a_'),
    extractFn(G16, 'sadDestinationIdentity_'),
    extractFn(G16, 'sadHeaderRouteIsComplete_'),
    extractFn(G16, 'sadStoredHeaderRouteIsComplete_'),
    extractFn(G16, 'sadSubmitToShippingPlansCore_'),
    'OUT = sadSubmitToShippingPlansCore_;'
  ].join(String.fromCharCode(10));

  var core = new Function(
    'procurementEnsureSheet_', 'procurementTimestamp_', 'shippingPlanCommitFromLines_',
    'shippingPlanReadObjects_', 'shippingPlanRollbackBatch_', 'sadVerifyShippingPlanOutput_',
    'SpreadsheetApp', '__hSh', '__lSh',
    'SHIPPING_ALLOCATION_DRAFTS_HEADERS_', 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_',
    'var OUT;' + src + 'return OUT;'
  )(
    function (ss, name) { return name === 'shipping_allocation_drafts' ? hSh : lSh; },
    function () { return '2026-09-02 12:00:00'; },
    // THE RECORDING WRITER. It reports what a real commit WOULD write, and writes nothing anywhere.
    function (ss, submitLines, o) {
      recorder.commits++;
      recorder.lines = submitLines.slice();
      recorder.batchIds.push(String((o && o.providedKey) || ''));
      if (opts.commitFails) return { success: false, error: 'DOWNSTREAM_FAILED', code: 'DOWNSTREAM_FAILED', stage: 'plan_write', zero_write: true, data: {} };
      // Replay: an execution key already downstream reuses that plan and writes NO new rows.
      var reused = planRows.some(function (p) { return String(p.submit_batch_id || '') === String((o && o.providedKey) || ''); });
      if (!reused) { recorder.planWrites += 1; recorder.lineWrites += submitLines.length; }
      return { success: true, data: { outcome: reused ? 'REUSED' : 'CREATED', reused: reused,
        plans: reused ? [] : ['SP-A2-0001'], plan_count: reused ? 0 : 1, line_count: submitLines.length } };
    },
    function (sh) { return planRows.slice(); },
    function () { recorder.rollbacks++; return { ok: true }; },
    function () { return { ok: true, failures: [], verified_lines: recorder.lines.length, verified_qty: 0, plans_checked: 1, skipped: false }; },
    { flush: function () {}, getActiveSpreadsheet: function () { return null; } },
    hSh, lSh, SAD_H, SAD_L
  );

  var ss = { getSheetByName: function (n) {
    if (n === 'shipping_allocation_drafts') return hSh;
    if (n === 'shipping_allocation_draft_lines') return lSh;
    if (n === 'shipping_plans') return planRows.length ? new MemSheet([['submit_batch_id']]) : null;
    if (n === 'shipping_plan_lines') return new MemSheet([['shipping_plan_id']]);
    return null;
  } };
  var ids = (body && body.allocation_draft_ids) || [];
  var res = core(ss, body || {}, ids);
  return { res: res, recorder: recorder, headerWrites: hSh.writes, lineWrites: lSh.writes, hSh: hSh };
}

// ================================================================================================================
section('§3 — THE SUBMIT CALL CHAIN, LOCATED IN THE SHIPPED SOURCES');
// ================================================================================================================
(function () {
  ok(/onclick="submitReplenishmentPlans\(\)"/.test(read('assets/html/pages/inventory-replenishment.html')),
    'C1  the button calls submitReplenishmentPlans()');
  var sub = code(extractFn(PAGE, 'submitReplenishmentPlans'));
  // F1-7N-FB-4G-A2-R1 §2/§3 - REVERSED, and it is the reversal this round exists for. Measured, that flush
  // CLEARED each pending 400 ms debounce timer and called _flushDraftDbPersist immediately (two pending
  // routes -> two write requests), then polled for up to 6 s and CONTINUED THE SUBMIT BY ITSELF. So Submit
  // was a Save button, and the guard below decided on state the click had just created. Submit now REFUSES a
  // dirty plan and writes nothing; the function is gone from the whole file.
  ok(!/_irFlushPendingRouteWritesForSubmit_/.test(sub), 'C2  Submit does NOT flush, save or wait for a write');
  ok(!/_irFlushPendingRouteWritesForSubmit_|_flushDraftDbPersist|_scheduleDraftDbPersist/.test(sub),
    'C2a §3 and it reaches NO writer at all - the only thing it may do about a pending write is refuse');
  ok(/_irSubmitPreflight_\(\)/.test(sub), 'C3  then ONE preflight decides (§6)');
  // F1-7N-FB-4G-A2-R1 §6 - RESTATED for the OWNER. A2 took the submitted selection from
  // _replenActiveAllocationDraftIds(), which applies NONE of the candidate rules, so when it disagreed with
  // the preflight the request went out with NO confirmation over a rejected candidate set. The selection is
  // the preflight's candidate now, and that function is kept as the wider CROSS-CHECK it can honestly be.
  ok(/_pf\.candidate\.draftIds/.test(sub), 'C4  the payload selection IS the preflight candidate set');
  ok(/SELECTION_DISAGREEMENT/.test(sub) && /_replenActiveAllocationDraftIds\(\)/.test(sub),
    'C4a and the route collector remains as a subset cross-check that fails closed on disagreement');
  ok(/_irVerifyPersistedRouteQuantities_/.test(sub), 'C5  a read-after-write quantity verification runs before committing');
  ok(/_irConfirmSubmit_/.test(sub), 'C6  §7 a CONFIRMATION is required before the request');
  ok(/_replenCanonicalSubmit\(/.test(sub), 'C7  and only then the canonical submit issues the request');
  ok(/submitAllocationDraftsToShippingPlans/.test(code(extractFn(PAGE, '_replenCanonicalSubmit'))),
    'C8  which calls the action submitAllocationDraftsToShippingPlans');
  ok(/action: 'submitAllocationDraftsToShippingPlans'/.test(DBAPI), 'C9  the API layer sends exactly that action name');
  ok(/if \(action === 'submitAllocationDraftsToShippingPlans'\)/.test(G01), 'C10 the router dispatches it');
  ok(/handler: 'handleSubmitAllocationDraftsToShippingPlans_'/.test(G63), 'C11 the health manifest names its handler');
  ok(/sadSubmitToShippingPlansCore_\(SpreadsheetApp\.getActiveSpreadsheet\(\), body, ids\)/.test(code(extractFn(G16, 'handleSubmitAllocationDraftsToShippingPlans_'))),
    'C12 and the handler calls the ONE core');
  eq((G16.match(/function sadSubmitToShippingPlansCore_\(/g) || []).length, 1, 'C13 that core is defined exactly once');
  ok(/shippingPlanCommitFromLines_/.test(code(extractFn(G16, 'sadSubmitToShippingPlansCore_'))),
    'C14 the plan/line writer is 11_\'s single shipping_plans authority');
  ok(/setCol\('status', 'submitted'\)/.test(code(extractFn(G16, 'sadSubmitToShippingPlansCore_'))),
    'C15 the draft lifecycle transition happens in the core, AFTER the durable plan commit');
  ok(/data-ir-reveal="execution"/.test(code(extractFn(PAGE, '_irRevealSyncActionAvailability_'))),
    'C16 the disabled-state owner is A1-R1\'s panel readiness');
})();

// ================================================================================================================
section('§13.1–§13.4 / §5 — THE CANDIDATE SET (the live H1/H2/H3/H4 shape)');
// ================================================================================================================
var CLEAN_SNAPSHOT = {
  scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' },
  appliedScopeKey: 'resus|us|amazon',
  // F1-7N-FB-4G-A2-R1 §4 - this used to hold an UNSAVED second route and still be called CLEAN, which is
  // exactly the contradiction: an unsaved route is now a DIRTY SOURCE that blocks the whole Submit, so a
  // snapshot holding one is not clean and reaches no candidate set at all. The two shapes are separate now.
  routes: [
    { sku: 'CO1100-R', allocation_draft_id: 'SADH-K2-E7AF9242', allocation_draft_line_id: 'SADL-K2-16F4E4F9',
      qty: 800, complete: true, shipping_method: 'sea', destination_type: 'MARKETPLACE', destination_code: 'Amazon',
      scopeKey: 'resus|us|amazon' }
  ]
};
// The operator's second route, added with + Add Route and not yet in the database.
var DIRTY_SNAPSHOT = JSON.parse(JSON.stringify(CLEAN_SNAPSHOT));
DIRTY_SNAPSHOT.routes.push({ sku: 'CO1100-R', allocation_draft_id: '', allocation_draft_line_id: '', qty: 800,
  complete: true, shipping_method: 'sea', destination_type: 'MARKETPLACE', destination_code: 'Amazon',
  scopeKey: 'resus|us|amazon' });
(function () {
  var r = PF.evaluate(CLEAN_SNAPSHOT);
  eq([r.ok, r.code], [true, ''], 'D1  §13.1 a clean persisted H4 passes the preflight');
  eq(r.candidate.draftIds, ['SADH-K2-E7AF9242'], 'D2  §13.13 exactly ONE persisted draft id is selected');
  eq([r.candidate.routeCount, r.candidate.lineCount, r.candidate.totalQty], [1, 1, 800],
    'D3  §13.1/§13.12 proposed qty is 800 — the UNSAVED second route is NOT counted');
  // F1-7N-FB-4G-A2-R1 §4/§5 - REVERSED. A2 excluded the unsaved route and offered a confirmation that
  // NAMED the exclusion. That state is unreachable (an unsaved route trips a dirty map and returns before
  // the candidate set is built), and §5 forbids it outright: with an unsaved route present the confirmation
  // must not exist. The whole Submit is blocked, and the clean route beside it is NOT sent on its own.
  var d = PF.evaluate(DIRTY_SNAPSHOT);
  eq([d.ok, d.code], [false, 'UNSAVED_EXECUTION_PLAN_CHANGES'], 'D4  §4 an unsaved route BLOCKS THE WHOLE Submit');
  eq(d.candidate.draftIds, [], 'D4a §4 and the clean 800 beside it is NOT proposed on its own');
  eq(PF.buildConfirmation(d, {}), null, 'D4b §5 no confirmation can be built from a blocked verdict');
  ok(!PF.evaluate(DIRTY_SNAPSHOT).excluded.some(function (e) { return e.reason === 'UNSAVED_USER_ADDED_ROUTE'; }),
    'D4c §5 and "unsaved route excluded" is never reported as an exclusion, because it is a block');
  // The confirmation is built AFTER the read-back, from the candidate set, by its own step.
  var conf = PF.buildConfirmation(r, { verdict: 'MATCHED', checked: 1 });
  eq(conf.totalQty, 800, 'D5  §7 the confirmation totals come from the PERSISTED set');
  eq(conf.persistedOnly, true, 'D5a and it declares that only saved data is submitted');
  eq(conf.verification, { verdict: 'MATCHED', checked: 1 }, 'D5b and it carries the read-back verdict verbatim');
  eq(PF.buildConfirmation(r, {}).verification.verdict, 'UNVERIFIABLE',
    'D5c an inconclusive read is reported as inconclusive, never as a verification that happened');
})();
(function () {
  // H3 belongs to ResTW / JP / Amazon and must not be pulled into a ResUS / US / Amazon submit.
  var withH3 = JSON.parse(JSON.stringify(CLEAN_SNAPSHOT));
  withH3.routes.push({ sku: 'JP-SKU-1', allocation_draft_id: 'SADH-K2-7F15DD7D', allocation_draft_line_id: 'SADL-JP-1',
    qty: 44, complete: true, shipping_method: 'air', destination_type: 'MARKETPLACE', destination_code: 'Amazon',
    scopeKey: 'restw|jp|amazon' });
  var r = PF.evaluate(withH3);
  eq(r.candidate.draftIds, ['SADH-K2-E7AF9242'], 'D6  §13.4 the out-of-scope H3 header is NOT in the payload');
  ok(r.excluded.some(function (e) { return e.reason === 'OUT_OF_APPLIED_SCOPE'; }), 'D6a and the exclusion is named');
  eq(r.candidate.totalQty, 800, 'D6b so its 220 units cannot leak into the total');
})();
(function () {
  // H1/H2 hold no persisted line at all, so no route of theirs ever reaches the client's candidate set.
  var r = PF.evaluate(CLEAN_SNAPSHOT);
  ok(r.candidate.draftIds.indexOf('SAD-C787D1B1-D') === -1 && r.candidate.draftIds.indexOf('SAD-27976058-2') === -1,
    'D7  §13.2 the zero-line H1/H2 headers are not in the client payload — they own no route to contribute');
  var zl = PF.buildConfirmation(PF.evaluate(Object.assign({}, CLEAN_SNAPSHOT, { zeroLineHeaderCount: 2 })), {});
  ok(zl.excluded.some(function (e) { return e.reason === 'ZERO_LINE_HEADER' && e.count === 2; }),
    'D7a and when the count is known it is DISCLOSED in the confirmation (§7)');
})();
(function () {
  var terminal = JSON.parse(JSON.stringify(CLEAN_SNAPSHOT));
  terminal.routes[0].terminal = true;
  eq(PF.evaluate(terminal).code, 'NO_PERSISTED_CANDIDATE', 'D8  §5 a terminal-lifecycle route yields no candidate');
  var cancelled = JSON.parse(JSON.stringify(CLEAN_SNAPSHOT));
  cancelled.routes[0].lineCancelled = true;
  eq(PF.evaluate(cancelled).candidate.totalQty, 0, 'D9  §13.20 a cancelled line contributes no quantity');
  var zeroQty = JSON.parse(JSON.stringify(CLEAN_SNAPSHOT));
  zeroQty.routes[0].qty = 0;
  ok(PF.evaluate(zeroQty).excluded.some(function (e) { return e.reason === 'NO_POSITIVE_PLANNED_QTY'; }),
    'D10 §5 a zero-quantity route is excluded and named');
})();

// ================================================================================================================
section('§6 / §13.6–§13.9 — THE UNSAVED / DIRTY GUARD');
// ================================================================================================================
(function () {
  // F1-7N-FB-4G-A2-R1 §3 - RESTATED for the CODE, not the rule. Every one of these still blocks and still
  // names the route and its reason. A2 gave them all ONE code; they need opposite things from the operator
  // (waiting fixes an in-flight save and can never fix a failed one), so the code now says which.
  var cases = [
    ['pendingWrites', 'EDIT_NOT_YET_SAVED', 'UNSAVED_EXECUTION_PLAN_CHANGES', '§13.6 an edit not yet written'],
    ['inFlightWrites', 'SAVE_IN_PROGRESS', 'EXECUTION_PLAN_SAVE_IN_PROGRESS', '§13.8 a write still in the air'],
    ['dirtyAfterWrite', 'EDITED_DURING_SAVE', 'EXECUTION_PLAN_SAVE_IN_PROGRESS', '§6 an edit that landed during a write'],
    ['pendingCancels', 'DELETE_NOT_YET_PERSISTED', 'UNSAVED_EXECUTION_PLAN_CHANGES', '§6 a delete not yet persisted'],
    ['saveFailed', 'SAVE_FAILED', 'EXECUTION_PLAN_SAVE_FAILED', '§13.8 a save that failed']
  ];
  cases.forEach(function (c, i) {
    var snap = Object.assign({}, CLEAN_SNAPSHOT); snap[c[0]] = ['CO1100-R'];
    var r = PF.evaluate(snap);
    eq([r.ok, r.code], [false, c[2]], 'U' + (i + 1) + '  ' + c[3] + ' → ' + c[2]);
    eq(r.blocking.reasons[0], { sku: 'CO1100-R', reason: c[1] }, 'U' + (i + 1) + 'a and the route AND its reason are named');
    eq(PF.buildConfirmation(r, {}), null, 'U' + (i + 1) + 'b no confirmation can be built, so no request can follow');
  });
})();
(function () {
  var snap = Object.assign({}, CLEAN_SNAPSHOT, { panels: [{ sku: 'CO1100-R', execState: 'PENDING' }] });
  eq(PF.evaluate(snap).code, 'EXECUTION_PLAN_NOT_READY', 'U6  §13.9 an Execution panel still loading blocks Submit');
  var snapE = Object.assign({}, CLEAN_SNAPSHOT, { panels: [{ sku: 'CO1100-R', execState: 'ERROR' }] });
  eq(PF.evaluate(snapE).code, 'EXECUTION_PLAN_NOT_READY', 'U6a and so does one showing a named failure');
  var snapR = Object.assign({}, CLEAN_SNAPSHOT, { panels: [{ sku: 'CO1100-R', execState: 'READY' }] });
  eq(PF.evaluate(snapR).ok, true, 'U6b a READY panel does not block');
})();
(function () {
  var snap = Object.assign({}, CLEAN_SNAPSHOT, { routesMissingDestination: [{ sku: 'CO1100-R', qty: 800, destination_code: 'ROUTE_DESTINATION_MISSING' }] });
  eq(PF.evaluate(snap).code, 'ROUTE_DESTINATION_MISSING', 'U7  §13.5 a planned quantity with no saved destination blocks Submit');
  var dup = Object.assign({}, CLEAN_SNAPSHOT, { duplicateCorruption: [{ sku: 'CO1100-R', allocation_draft_line_id: 'X', physical_rows: 2 }] });
  eq(PF.evaluate(dup).code, 'DUPLICATE_LINE_IDENTITY', 'U8  §13.20 a duplicate stored identity blocks Submit');
})();
(function () {
  // §6 — the verdict must NOT be a count comparison. Two routes, equal in number to the stored rows, every
  // value different: a count check calls that clean.
  var pfSrc = code(extractFn(CMPSRC, 'submitPreflight'));
  ok(!/\.length\s*===\s*\w*[Cc]ount|domCount|rowCount\s*===/.test(pfSrc),
    'U9  §6 the dirty verdict is not a DOM-versus-DB count comparison');
  // F1-7N-FB-4G-A2-R1 §3 - the sixth source: a route the screen holds and the database does not. A2 tried
  // to express that as an EXCLUSION, which §5 forbids and which was unreachable anyway.
  var sources = PF.DIRTY_SOURCES.map(function (s) { return s.key; }).sort();
  eq(sources, ['dirtyAfterWrite', 'inFlightWrites', 'pendingCancels', 'pendingWrites', 'saveFailed', 'unpersistedRoutes'],
    'U9a it is derived from six NAMED state sources, gathered in one owner');
  ok(!/upsertShippingAllocationDraft|_flushDraftDbPersist|_scheduleDraftDbPersist/.test(pfSrc),
    'U10 §6 and the preflight NEVER saves on the operator\'s behalf');
})();
(function () {
  var snap = code(extractFn(PAGE, '_irSubmitStateSnapshot_'));
  ['_draftDbTimers', '_draftDbInFlight', '_draftDbDirty', '_pendingDraftCancels', '_irUnsavedSkus_'].forEach(function (n) {
    ok(new RegExp(n).test(snap), 'U11 the snapshot gathers ' + n + ' into the one owner');
  });
  ok(/data-ir-reveal="execution"/.test(snap), 'U11a and the Execution panel readiness with them');
  ok(/allocation_draft_line_id/.test(code(extractFn(CMPSRC, 'routeIsPersisted'))),
    'U12 §2 "persisted" is the presence of the STORED identities the server re-reads, not of a DOM row');
})();

// ================================================================================================================
section('§7 / §13.10–§13.11 — THE CONFIRMATION');
// ================================================================================================================
(function () {
  var conf = code(extractFn(PAGE, '_irConfirmSubmit_'));
  ok(/conf\.routeCount|conf\.totalQty/.test(conf) && !/querySelector|getElementById|exec-route-row/.test(conf),
    'F1  §7 the dialog reads the PERSISTED proposal, never the DOM');
  ok(/ONLY SAVED DATA IS SUBMITTED/.test(conf), 'F2  §7 it states explicitly that only saved data is submitted');
  ok(/Station: /.test(conf) && /Saved routes: /.test(conf) && /Total planned quantity: /.test(conf) &&
     /Destination: /.test(conf) && /Shipping method: /.test(conf) && /Not included: /.test(conf),
    'F3  §7 scope, route count, totals, destination, method and exclusions are all shown');
  var sub = code(extractFn(PAGE, 'submitReplenishmentPlans'));
  var iConf = sub.indexOf('_irConfirmSubmit_');
  var iKey = sub.indexOf('_replenSubmitExecutionKey()');
  var iSend = sub.indexOf('_replenCanonicalSubmit(');
  ok(iConf > -1 && iKey > iConf, 'F4  §7 the submit_batch_id / execution key is minted ONLY AFTER the confirmation');
  ok(iSend > iConf, 'F4a and the request is issued only after it too');
  // F1-7N-FB-4G-A2-R1 §5 - the confirmation is built by its own later step (after the read-back) and is
  // REQUIRED rather than conditional: A2 wrote `if (_pf.confirmation) { ... }`, so a null confirmation
  // SKIPPED the dialog and submitted anyway. Cancel still returns immediately.
  ok(/if \(!_irConfirmSubmit_\(_conf\)\) return;/.test(sub),
    'F5  §13.10 Cancel returns immediately — zero requests, and nothing minted or persisted');
  ok(/buildConfirmation\(_pf, _qv\)/.test(sub) && /if \(!_conf\) \{/.test(sub),
    'F5a §5 and a confirmation that cannot be built BLOCKS the submit instead of being skipped');
  ok(sub.indexOf('_irVerifyPersistedRouteQuantities_') < sub.indexOf('buildConfirmation'),
    'F5b §5/§6 the confirmation is built only AFTER the persisted read-back has run');
})();

// ================================================================================================================
section('§8 — SERVER VALIDATION, ON THE REAL CORE OVER IN-MEMORY SHEETS');
// ================================================================================================================
var BODY = { execution_key: 'EXEC-A2-1', submitted_by: 'inventory-replenishment',
  applied_scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' } };
(function () {
  var r = runCore([LIVE.H4], LIVE_LINES.H4, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }));
  eq([r.res.success, r.recorder.commits, r.recorder.lines.length], [true, 1, 1],
    'S1  §8.1 H4 alone is COMPLETE and reaches the plan proposal');
  eq(r.recorder.lines[0].requested_qty, 800, 'S1a with the operator\'s 800 carried verbatim');
  eq(r.res.data.submitted_drafts, ['SADH-K2-E7AF9242'], 'S1b and exactly that draft transitions');
})();
(function () {
  var r = runCore([LIVE.H4, LIVE.H1], LIVE_LINES.H4,
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242', 'SAD-C787D1B1-D'] }));
  eq([r.res.success, r.res.code, r.res.zero_write], [false, 'SUBMIT_VALIDATION_FAILED', true],
    'S2  §8.2 a zero-line header smuggled in fails the WHOLE batch with zero writes');
  eq((r.res.data.errors || []).map(function (e) { return e.reason; }), ['NO_LINES'], 'S2a named NO_LINES');
  eq([r.recorder.commits, r.headerWrites], [0, 0], 'S2b §8.10 no partial submit — the writer was never reached');
})();
(function () {
  var r = runCore([LIVE.H4, LIVE.H3], LIVE_LINES.H4.concat(LIVE_LINES.H3),
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242', 'SADH-K2-7F15DD7D'] }));
  eq([r.res.success, r.res.code, r.res.zero_write], [false, 'MIXED_SITE_PAYLOAD', true],
    'S3  §8.3 H3 smuggled in from another station is refused by the server, zero writes');
  eq(r.recorder.commits, 0, 'S3a and the plan writer was never reached');
})();
(function () {
  var noDest = H({ allocation_draft_id: 'SADH-NODEST', destination_marketplace: '' });
  var r = runCore([noDest], [LN({ allocation_draft_id: 'SADH-NODEST' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-NODEST'] }));
  eq((r.res.data.errors || []).map(function (e) { return e.reason; }), ['ROUTE_INCOMPLETE'],
    'S4  §8.4 a missing destination is refused with ROUTE_INCOMPLETE');
  eq([r.res.zero_write, r.recorder.commits], [true, 0], 'S4a zero write');
})();
(function () {
  var both = H({ allocation_draft_id: 'SADH-BOTH', destination_marketplace: 'Amazon', recommended_destination_warehouse_id: 'WH-US-3PL-01' });
  var r = runCore([both], [LN({ allocation_draft_id: 'SADH-BOTH' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-BOTH'] }));
  eq((r.res.data.errors || []).map(function (e) { return e.reason; }), ['ROUTE_INCOMPLETE'],
    'S5  §8.5 a BOTH destination is refused (ROUTE_DESTINATION_AMBIGUOUS via the canonical identity)');
  eq([r.res.zero_write, r.recorder.commits], [true, 0], 'S5a zero write');
})();
(function () {
  ['cancelled', 'expired'].forEach(function (st) {
    var t = H({ allocation_draft_id: 'SADH-T-' + st, status: st, destination_marketplace: 'Amazon' });
    var r = runCore([t], [LN({ allocation_draft_id: 'SADH-T-' + st })],
      Object.assign({}, BODY, { allocation_draft_ids: ['SADH-T-' + st] }));
    ok(r.res.success === false && r.res.zero_write === true && r.recorder.commits === 0,
      'S6  §8.6 a ' + st + ' draft is immutable — refused, zero write');
  });
})();
(function () {
  var r = runCore([LIVE.H4], [LN({ line_status: 'cancelled' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }));
  eq((r.res.data.errors || []).map(function (e) { return e.reason; }), ['NO_LINES'],
    'S7  §8.7 a cancelled line contributes nothing — the header then has no lines at all');
  eq(r.recorder.commits, 0, 'S7a zero write');
})();
(function () {
  var r = runCore([LIVE.H4], [LN({ allocation_draft_id: 'SADH-ORPHAN-PARENT' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }));
  eq((r.res.data.errors || []).map(function (e) { return e.reason; }), ['NO_LINES'],
    'S8  §8.8 an orphan line (FK naming another header) never counts toward this one');
})();
(function () {
  var r = runCore([LIVE.H4], [LN({}), LN({})],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }));
  var reasons = (r.res.data.errors || []).map(function (e) { return String(e.reason).split(':')[0]; });
  eq(reasons, ['DUPLICATE_LINE_ID'], 'S9  §8.9 a duplicate line identity is refused');
  eq([r.res.zero_write, r.recorder.commits], [true, 0], 'S9a zero write');
})();
(function () {
  var r = runCore([LIVE.H4], LIVE_LINES.H4,
    Object.assign({}, BODY, { applied_scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon' },
      allocation_draft_ids: ['SADH-K2-E7AF9242'] }));
  eq([r.res.code, r.res.zero_write], ['APPLIED_SCOPE_MISMATCH', true],
    'S10 §8.11 a stale selector is a NAMED refusal, not a write to whichever station the ids carried');
})();
(function () {
  // §8.12 — the client being bypassed entirely changes nothing: the server re-reads and refuses.
  var r = runCore([LIVE.H1, LIVE.H2], [],
    Object.assign({}, BODY, { allocation_draft_ids: ['SAD-C787D1B1-D', 'SAD-27976058-2'] }));
  eq([r.res.success, r.res.zero_write, r.recorder.commits], [false, true, 0],
    'S11 §8.12 a hand-crafted payload of only zero-line headers is refused with zero writes');
})();

// ================================================================================================================
section('§9 / §10 — THE PROPOSED MAPPING, AND WHAT IT CONSERVES');
// ================================================================================================================
(function () {
  var r = runCore([LIVE.H4], LIVE_LINES.H4, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }));
  var L = r.recorder.lines[0];
  eq([L.company, L.country, L.marketplace], ['ResUS', 'US', 'Amazon'], 'M1  §9 company/country/marketplace come from the persisted HEADER');
  eq([L.ship_from, L.source_warehouse_id, L.ship_from_type], ['CNYOUXIN', 'WH-TW-CN-FACTORY-YOUXIN', 'warehouse'],
    'M2  §9 the source identity is the header\'s id, displayed by its stored code');
  eq([L.destination, L.destination_warehouse_id, L.destination_type], ['Amazon', '', 'marketplace'],
    'M3  §9 the destination is the ROUTE\'s canonical marketplace — not the scope, not a snapshot');
  eq([L.sku, L.site_sku, L.requested_qty, L.units_per_carton], ['CO1100-R', '', 800, 20],
    'M4  §9 sku / site_sku / planned qty / units-per-carton pass through the LINE verbatim');
  eq(L.shipping_method, 'sea', 'M5  §13.18 the service is carried verbatim — sea is never widened to sea_express');
  ok(/allocation_draft:SADH-K2-E7AF9242\|/.test(L.source_reason) && /\|line:SADL-K2-16F4E4F9$/.test(L.source_reason),
    'M6  §9 lineage names the exact allocation header AND line — no invented lineage field');
  ok(!('expected_arrival' in L) && !('eta' in L), 'M7  §9 no UI-calculated ETA is passed off as a persisted one');
  // §10 quantity conservation, reported rather than asserted in prose.
  var qtyBefore = LIVE_LINES.H4.reduce(function (a, l) { return a + Number(l.planned_qty); }, 0);
  var qtyProposed = r.recorder.lines.reduce(function (a, l) { return a + Number(l.requested_qty); }, 0);
  eq({ qty_before: qtyBefore, qty_proposed: qtyProposed, qty_difference: qtyProposed - qtyBefore, matched_lines: r.recorder.lines.length },
     { qty_before: 800, qty_proposed: 800, qty_difference: 0, matched_lines: 1 },
    'M8  §10 quantity conservation: 800 in, 800 proposed, difference 0, one matched line');
})();
(function () {
  // §9 — the three forbidden substitutions, each executed.
  var walmartScope = H({ allocation_draft_id: 'SADH-WM', marketplace: 'Walmart', destination_marketplace: 'Amazon' });
  var r1 = runCore([walmartScope], [LN({ allocation_draft_id: 'SADH-WM' })],
    Object.assign({}, BODY, { applied_scope: { company: 'ResUS', country: 'US', marketplace: 'Walmart' }, allocation_draft_ids: ['SADH-WM'] }));
  eq(r1.recorder.lines[0].destination, 'Amazon',
    'M9  §9 the station\'s marketplace is NEVER used as the route destination (scope Walmart, destination Amazon)');
  var snapOnly = H({ allocation_draft_id: 'SADH-SNAP', recommended_destination_warehouse_code_snapshot: 'Amazon' });
  var r2 = runCore([snapOnly], [LN({ allocation_draft_id: 'SADH-SNAP' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-SNAP'] }));
  eq([r2.res.success, r2.recorder.commits], [false, 0],
    'M10 §9 a warehouse-code SNAPSHOT is never an identity — the row is refused instead of mapped');
  var wh = H({ allocation_draft_id: 'SADH-WH', recommended_destination_warehouse_id: 'WH-US-3PL-01',
    recommended_destination_warehouse_code_snapshot: 'US3PL01' });
  var r3 = runCore([wh], [LN({ allocation_draft_id: 'SADH-WH' })],
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-WH'] }));
  eq([r3.recorder.lines[0].destination, r3.recorder.lines[0].destination_warehouse_id, r3.recorder.lines[0].destination_type],
     ['US3PL01', 'WH-US-3PL-01', 'warehouse'],
    'M11 §9 a physical warehouse destination is unchanged — code for display, id for identity');
})();
(function () {
  // The corrected value is byte-identical for H4, so its plan GROUPING key does not move.
  function natKey(L) {
    return [L.company, L.country, L.ship_from, L.source_warehouse_id, L.destination, L.destination_warehouse_id,
      L.shipping_method, L.last_mile_delivery, L.planning_cycle].join('|');
  }
  var r = runCore([LIVE.H4], LIVE_LINES.H4, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }));
  eq(natKey(r.recorder.lines[0]), 'ResUS|US|CNYOUXIN|WH-TW-CN-FACTORY-YOUXIN|Amazon||sea||',
    'M12 §9 H4\'s proposed plan natural key — identical to what the previous mapping produced, so nothing re-keys');
})();

// ================================================================================================================
section('§11 / §13.14–§13.16, §13.21 — IDEMPOTENCY, DOUBLE CLICK, REPLAY');
// ================================================================================================================
(function () {
  var cs = code(extractFn(PAGE, '_replenCanonicalSubmit'));
  ok(/if \(_replenSubmitInFlight\[execKey\]\) return _replenSubmitInFlight\[execKey\];/.test(cs),
    'I1  §13.14 a second click SHARES the in-flight promise — one request, never a second mutation');
  ok(/_replenSetSubmitButtonDisabled\(true\)/.test(cs), 'I1a and the button is disabled for the duration');
  eq((code(PAGE).match(/function _newSubmitExecutionKey/g) || []).length, 1,
    'I2  §11 the submit execution key has exactly ONE generator');
})();
(function () {
  // Replay: the SAME execution key over already-submitted drafts reuses the existing plan and writes nothing new.
  var submitted = H({ allocation_draft_id: 'SADH-K2-E7AF9242', status: 'submitted', destination_marketplace: 'Amazon' });
  var r = runCore([submitted], LIVE_LINES.H4,
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }),
    { existingPlans: [{ submit_batch_id: 'EXEC-A2-1', company: 'ResUS' }] });
  eq([r.res.success, r.res.data.reused, r.recorder.planWrites, r.recorder.lineWrites], [true, true, 0, 0],
    'I3  §13.15 a replay under the SAME execution key creates NO second plan and NO second line');
  eq(r.res.data.already_submitted, ['SADH-K2-E7AF9242'], 'I3a and reports the draft as already submitted');
})();
(function () {
  // A NEW key over an already-submitted draft is a CONFLICT, not a second submit.
  var submitted = H({ allocation_draft_id: 'SADH-K2-E7AF9242', status: 'submitted', destination_marketplace: 'Amazon' });
  var r = runCore([submitted], LIVE_LINES.H4,
    Object.assign({}, BODY, { execution_key: 'EXEC-A2-DIFFERENT', allocation_draft_ids: ['SADH-K2-E7AF9242'] }),
    { existingPlans: [{ submit_batch_id: 'EXEC-A2-1' }] });
  eq([r.res.code, r.res.zero_write, r.recorder.commits], ['CONFLICT', true, 0],
    'I4  §11 a NEW key over an already-submitted draft is a CONFLICT — no double submit');
})();
(function () {
  // §13.21 — a lost response is safe: the same key replayed reaches the same terminal state.
  var r1 = runCore([LIVE.H4], LIVE_LINES.H4, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }));
  var submitted = H({ allocation_draft_id: 'SADH-K2-E7AF9242', status: 'submitted', destination_marketplace: 'Amazon' });
  var r2 = runCore([submitted], LIVE_LINES.H4, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }),
    { existingPlans: [{ submit_batch_id: 'EXEC-A2-1' }] });
  eq([r1.res.success, r2.res.success, r2.recorder.planWrites], [true, true, 0],
    'I5  §13.21 first attempt CREATES; a retry after a lost response REUSES and writes nothing');
})();
(function () {
  var cs = code(extractFn(PAGE, '_replenCanonicalSubmit'));
  ok(/_clearAllocationDraft\(\);/.test(cs), 'I6  §13.22 a confirmed terminal result clears the Working Draft + execution key');
  ok(!/setTimeout\(function \(\) \{ _replenCanonicalSubmit/.test(cs) && !/location\.reload/.test(cs),
    'I6a and success never re-sends or reloads the page');
  ok(/IN_PROGRESS_SAME_EXECUTION_KEY/.test(cs) && /NOT a blind retry/.test(extractFn(PAGE, '_replenCanonicalSubmit')),
    'I7  §11 a partial/in-progress response triggers a READ-BACK, never a client-side guess of success');
})();
(function () {
  var r = runCore([LIVE.H4], LIVE_LINES.H4, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }), { commitFails: true });
  eq([r.res.success, r.res.zero_write, r.headerWrites], [false, true, 0],
    'I8  §8.10 a downstream plan-write failure leaves every draft UNSUBMITTED — zero status transitions');
  eq(r.res.data.drafts_unsubmitted, ['SADH-K2-E7AF9242'], 'I8a and names them');
})();

// ================================================================================================================
section('§12 — SUCCESS LIFECYCLE (proposal only; no live transition)');
// ================================================================================================================
(function () {
  var core = code(extractFn(G16, 'sadSubmitToShippingPlansCore_'));
  ok(/setCol\('status', 'submitted'\)/.test(core), 'L1  the draft status becomes `submitted` — an existing lifecycle value');
  ok(/setCol\('submitted_by', submittedBy\)/.test(core) && /setCol\('submitted_at', now\)/.test(core),
    'L2  submitted_by / submitted_at are stamped from the request and the server clock');
  ok(/SUBMITTED @/.test(core), 'L3  and an audit note naming the plan and the execution key is appended');
  var idx = core.indexOf('shippingPlanCommitFromLines_');
  ok(idx > -1 && core.indexOf("setCol('status', 'submitted')") > idx,
    'L4  §12 the transition happens ONLY AFTER the durable plan commit');
  ok(/POSTCHECK_FAILED_ROLLED_BACK/.test(core) && /shippingPlanRollbackBatch_/.test(core),
    'L5  §12 a failed post-check restores the draft cells AND rolls back the inserted plan rows');
  ok(/_clearAllocationDraft\(\)/.test(code(extractFn(PAGE, '_replenCanonicalSubmit'))) &&
     /showSection\('shippingplan'\)/.test(code(extractFn(PAGE, '_replenCanonicalSubmit'))),
    'L6  §12 the client drops the Working Draft and navigates to the plan — no second submit');
})();

// ================================================================================================================
section('§4 — THE READ-ONLY CENSUS HELPER');
// ================================================================================================================
(function () {
  var T = code(TEMP);
  eq((TEMP.match(/^function TEMP_SHIPPING_ALLOCATION_SUBMIT_PLAN_A2_SUMMARY\(\)/gm) || []).length, 1,
    'T1  §4 exactly ONE public entry point, and it takes no parameters');
  ok(!/setValue|appendRow|insertColumns|insertRows|deleteRow|deleteColumn|clearContent|setValues/.test(T),
    'T2  §4 no mutator appears anywhere in it');
  ok(!/procurementEnsureSheet_|sheetEnsureColumns_|prodRequireSheet_/.test(T),
    'T2a and no ensure/create helper is reachable from it');
  ok(!/LockService|PropertiesService|DriveApp|MailApp|GmailApp|UrlFetchApp/.test(T),
    'T3  §4 it takes no lock, writes no property, creates no file and sends no mail');
  ok(!/submitAllocationDraftsToShippingPlans|sadSubmitToShippingPlansCore_|shippingPlanCommitFromLines_/.test(T),
    'T4  §4 it never calls the real Submit action or any core that writes');
  ok(/getDataRange\(\)\.getValues\(\)/.test(T) && (T.match(/function tempA2Read_/g) || []).length === 1,
    'T5  §4 every sheet is read through ONE façade that offers getDataRange().getValues() and nothing else');
  ok(/DB_WRITES=0/.test(TEMP) && /STATUS_TRANSITIONS=0/.test(TEMP) && /SHIPPING_PLANS_CREATED=0/.test(TEMP) &&
     /SHIPPING_PLAN_LINES_CREATED=0/.test(TEMP) && /ROWS_DELETED=0/.test(TEMP) && /EMAILS=0/.test(TEMP) &&
     /DRIVE_WRITES=0/.test(TEMP),
    'T6  §4 the footer carries every required zero');
  ok(/AUTHORITY_NOT_LOADED/.test(TEMP) && /sadDestinationIdentity_/.test(TEMP) && /sadStoredHeaderRouteIsComplete_/.test(TEMP),
    'T7  §4 it REQUIRES the production gates and carries no copy of them');
  ok(/BLOCKED/.test(TEMP), 'T8  §4 what it cannot safely judge prints BLOCKED rather than a guess');
  ok(/function tempA2Mask_/.test(TEMP) && /tempA2Mask_\(id\)/.test(TEMP), 'T9  §4 ids are masked in the output');
  ok(/shipping_allocation_drafts/.test(TEMP) && /shipping_allocation_draft_lines/.test(TEMP) &&
     /shipping_plans/.test(TEMP) && /shipping_plan_lines/.test(TEMP),
    'T10 §4 it reads the four tables the census needs, each justified in its header');
  ok(!/marketplace_skus|sku_details/.test(T), 'T10a and deliberately reads nothing that would let it re-derive a quantity');
})();

// ================================================================================================================
section('§1 / §14 / §15 — WHAT THIS ROUND DID NOT TOUCH, AND ITS DEPLOYMENT IDENTITY');
// ================================================================================================================
// F1-7N-FC-1A-R1 — at-or-after: A2 added no router action, but R1 does.
ok(Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]) >= 10,
  'V1  action contract is at or after 10 (A2 added no router action)');
// F1-7N-FB-4G-A2-R3 - RESTATED to a floor: an equality forbids every later round from adding an action.
ok(Number((G63.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1]) >= 9,
  'V2  required-action-list is at or after 9');
eq((G63.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1], '1', 'V3  transport contract still 1');
eq(CMP.IRWarehouse.destinationIdentity({ destination_warehouse_id: 'W', destination_marketplace: 'Amazon' }).code,
  'ROUTE_DESTINATION_AMBIGUOUS', 'V4  §10 the destination XOR authority is untouched');
eq(CMP.IRService.canonical('美森海卡'), 'sea_express', 'V5  §10 sea / sea_express are still distinct');
(function () {
  var stamp = (G16.match(/var SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1];
  // F1-7N-FB-4G-A2-R2 - RESTATED. A2 pinned its OWN stamp as an equality with the present: the NINTH
  // appearance of that shape, and false the first time a later round legitimately moves the server (A2-R2
  // does, for the route intent contract). The durable claim is the FLOOR - 16_ carries A2's change or
  // something after it.
  ok(RO.stampAtOrAfter(stamp, 'F1-7N-FB-4G-A2'),
    'V6  §15 the 16_ owner stamp is at or after A2 — this round changed the server, deliberately');
  eq((G63.match(/\{ file: '16_shipping_allocation_handlers\.gs', symbol: 'SAD_BUILD_VERSION_', expected: '([^']+)'/) || [])[1],
     stamp, 'V6a and 63_\'s manifest expects what the SOURCE declares, so a half-synced deployment is detectable');
  var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
  var touched = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).filter(function (f) {
    return /F1-7N-FB-4G-A2/.test(fs.readFileSync(path.join(GS_DIR, f), 'utf8'));
  }).sort();
  // F1-7N-FB-4G-A2-R4 §J — RESTATED to a SUPERSET. This equality said "the sync set is exactly the two files
  // MY round touched", so every later round with a legitimate Apps Script change breaks it. What A2 needs is
  // that ITS two owners are in the derived set; A2-R4 adds 66_ and the diagnostics file because a REQUIRED
  // action moved out of a TEMP owner, which is a correct addition, not a regression.
  ['16_shipping_allocation_handlers.gs', '63_api_v1_system_health.gs'].forEach(function (f) {
    ok(touched.indexOf(f) !== -1, 'V7  §15 the derived Apps Script sync set includes ' + f);
  });
  ok(touched.length >= 2, 'V7a and it is derived from the source rather than hand-listed (' + touched.length + ' files)');
})();
(function () {
  var APP = RO.currentAppToken();
  // RESTATED (F1-7N-FC-1A-R1-HF1): this was `=== 18`. The count is not the property — "rotated TOGETHER"
  // is — and the literal made a round that covers one more asset look like a half-updated deployment. Now
  // derived: no entry is left behind on a superseded application token. See _release-order.js staleAppTokenRefs.
  eq(RO.staleAppTokenRefs(INDEX).join(' | '), '',
    'V8  the application refs rotated together (' + RO.appTokenRefCount(INDEX) + ' on ' + APP + ')');
  ok(RO.tokenAtOrAfter(APP, 'fb4ga1r1-panelready-20260902'), 'V8a and it is after the published A1-R1 token');
  ok(INDEX.indexOf('fb4ga1r1-panelready-20260902') === -1, 'V8b which is fully retired');
})();
ok(!/DELETE FROM|deleteRow|removeSheet/.test(code(extractFn(PAGE, 'submitReplenishmentPlans'))),
  'V9  §14 nothing in the submit path deletes H1/H2 or edits H3/H4');

// ================================================================================================================
section('MUTATIONS — each applied for real, each caught');
// ================================================================================================================
// F1-7N-FB-4G-A2-R1 - RE-ANCHORED. Both X1 and X3 mutated the step-4 line that recorded
// UNSAVED_USER_ADDED_ROUTE as an exclusion. That line is gone: an unpersisted route is a DIRTY SOURCE now
// and returns long before step 4, so mutating step 4 would change nothing and the probes would have reported
// MUTANT SURVIVED against dead code. They are re-anchored on the source that actually decides.
// An unsaved route now needs TWO independent guards defeated to reach the payload - the derived dirty
// source (X3) and step 4's own refusal - so no single-line mutation can put one there. That is the point of
// the pair, and it is asserted directly rather than probed for: with the dirty source disabled, step 4 still
// keeps the route out of the candidate set.
(function () {
  var m = mutateFn(CMPSRC, 'submitPreflight',
    "unpersisted.push({ sku: sstr(r && r.sku), reason: (r && r.complete === true) ? 'ROUTE_NOT_SAVED' : 'ROUTE_NOT_SAVED_INCOMPLETE' });",
    'return;');
  var x = moduleFrom(m).IRSubmitPreflight.evaluate(DIRTY_SNAPSHOT);
  eq(x.candidate.totalQty, 800, 'X0  with the dirty source defeated, step 4 STILL refuses the unpersisted route');
})();

mut('X1  the submitted selection reverts to the route collector, which applies none of the candidate rules', function () {
  var m = mutateFn(PAGE, 'submitReplenishmentPlans',
    "var _draftIds = (_pf && _pf.candidate && _pf.candidate.draftIds) ? _pf.candidate.draftIds.slice() : [];",
    'var _draftIds = _replenActiveAllocationDraftIds();');
  var h = code(extractFn(PAGE, 'submitReplenishmentPlans'));
  var x = code(extractFn(m, 'submitReplenishmentPlans'));
  return /_pf\.candidate\.draftIds/.test(h) && !/_pf\.candidate\.draftIds/.test(x) &&
         /_draftIds = _replenActiveAllocationDraftIds\(\)/.test(x);
});

mut('X2  the dirty guard is removed', function () {
  var m = mutateFn(CMPSRC, 'submitPreflight',
    'if (out.blocking.skus.length) return out;', '');
  var M = moduleFrom(m).IRSubmitPreflight;
  var snap = Object.assign({}, CLEAN_SNAPSHOT, { saveFailed: ['CO1100-R'] });
  return PF.evaluate(snap).ok === false && M.evaluate(snap).ok === true;
});

mut('X3  only the clean route is submitted and the dirty one beside it is silently dropped', function () {
  var m = mutateFn(CMPSRC, 'submitPreflight',
    "unpersisted.push({ sku: sstr(r && r.sku), reason: (r && r.complete === true) ? 'ROUTE_NOT_SAVED' : 'ROUTE_NOT_SAVED_INCOMPLETE' });",
    'return;');
  var M = moduleFrom(m).IRSubmitPreflight;
  var h = PF.evaluate(DIRTY_SNAPSHOT), x = M.evaluate(DIRTY_SNAPSHOT);
  return h.ok === false && x.ok === true && x.candidate.totalQty === 800;
});

mut('X4  the confirmation totals are read from the DOM instead of the persisted proposal', function () {
  var m = mutateFn(PAGE, '_irConfirmSubmit_',
    "lines.push('Total planned quantity: ' + conf.totalQty);",
    "lines.push('Total planned quantity: ' + document.querySelectorAll('.exec-route-row').length);");
  var h = code(extractFn(PAGE, '_irConfirmSubmit_'));
  var x = code(extractFn(m, '_irConfirmSubmit_'));
  return !/querySelectorAll/.test(h) && /querySelectorAll/.test(x);
});

mut('X5  the double-click single-flight latch is released', function () {
  var m = mutateFn(PAGE, '_replenCanonicalSubmit',
    'if (_replenSubmitInFlight[execKey]) return _replenSubmitInFlight[execKey];', '');
  // A REAL promise: the latch is `_replenSubmitInFlight[execKey] = p`, so a stub whose chain yields undefined
  // stores a falsy value and the honest function issues a second request too - a probe that proves nothing.
  function calls(src) {
    var n = 0;
    var fn = new Function('_replenSubmitInFlight', '_replenSetSubmitButtonDisabled', '_irAppliedSubmitScope_',
      'window', 'NL2', 'showSection', 'renderShippingPlan', 'setTimeout', 'alert',
      extractFn(src, '_replenCanonicalSubmit') + ' return _replenCanonicalSubmit;')(
        {}, function () {}, function () { return null; },
        { KM: { DB: { submitAllocationDraftsToShippingPlans: function () { n++; return Promise.resolve({ success: false, code: 'STUB' }); } } } },
        '\n', function () {}, function () {}, function () {}, function () {});
    fn(['D1'], 'K1', 1); fn(['D1'], 'K1', 1);
    return n;
  }
  return calls(PAGE) === 1 && calls(m) === 2;
});

mut('X6  a replay CREATES a second plan instead of reusing', function () {
  var submitted = H({ allocation_draft_id: 'SADH-K2-E7AF9242', status: 'submitted', destination_marketplace: 'Amazon' });
  var honest = runCore([submitted], LIVE_LINES.H4, Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] }),
    { existingPlans: [{ submit_batch_id: 'EXEC-A2-1' }] });
  // The mutant is the server losing its already-submitted replay guard: it would commit again.
  var m = mutateFn(G16, 'sadSubmitToShippingPlansCore_',
    "if (!keyPlans0.length) return { success: false, error: 'SUBMIT_DRAFT_ALREADY_SUBMITTED', code: 'CONFLICT', stage: 'validation', zero_write: true, data: { execution_key: execKey, already_submitted: alreadySubmitted } };",
    '');
  var G16SAVE = G16; G16 = m;
  var mutant;
  try {
    mutant = runCore([submitted], LIVE_LINES.H4,
      Object.assign({}, BODY, { execution_key: 'EXEC-NEW', allocation_draft_ids: ['SADH-K2-E7AF9242'] }),
      { existingPlans: [{ submit_batch_id: 'EXEC-A2-1' }] });
  } finally { G16 = G16SAVE; }
  var honestNewKey = runCore([submitted], LIVE_LINES.H4,
    Object.assign({}, BODY, { execution_key: 'EXEC-NEW', allocation_draft_ids: ['SADH-K2-E7AF9242'] }),
    { existingPlans: [{ submit_batch_id: 'EXEC-A2-1' }] });
  return honest.recorder.planWrites === 0 && honestNewKey.res.code === 'CONFLICT' && mutant.recorder.planWrites === 1;
});

mut('X7  a partial write is allowed (one bad header does not fail the batch)', function () {
  var m = mutateFn(G16, 'sadSubmitToShippingPlansCore_',
    "if (errors.length) return { success: false, error: 'SUBMIT_VALIDATION_FAILED', code: 'SUBMIT_VALIDATION_FAILED', stage: 'validation', zero_write: true, data: { execution_key: execKey, errors: errors.slice(0, 25) } };\n\n  // already-submitted drafts may only be replayed",
    "\n\n  // already-submitted drafts may only be replayed");
  var G16SAVE = G16;
  var honest = runCore([LIVE.H4, LIVE.H1], LIVE_LINES.H4,
    Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242', 'SAD-C787D1B1-D'] }));
  G16 = m;
  var mutant;
  try {
    mutant = runCore([LIVE.H4, LIVE.H1], LIVE_LINES.H4,
      Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242', 'SAD-C787D1B1-D'] }));
  } finally { G16 = G16SAVE; }
  return honest.recorder.commits === 0 && mutant.recorder.commits === 1;
});

mut('X8  the server station scope filter is removed', function () {
  var m = mutateFn(G16, 'sadSubmitToShippingPlansCore_', 'if (stationList.length > 1) {', 'if (false) {');
  var G16SAVE = G16;
  var honest = runCore([LIVE.H4, LIVE.H3], LIVE_LINES.H4.concat(LIVE_LINES.H3),
    Object.assign({}, BODY, { applied_scope: null, allocation_draft_ids: ['SADH-K2-E7AF9242', 'SADH-K2-7F15DD7D'] }));
  G16 = m;
  var mutant;
  try {
    mutant = runCore([LIVE.H4, LIVE.H3], LIVE_LINES.H4.concat(LIVE_LINES.H3),
      Object.assign({}, BODY, { applied_scope: null, allocation_draft_ids: ['SADH-K2-E7AF9242', 'SADH-K2-7F15DD7D'] }));
  } finally { G16 = G16SAVE; }
  return honest.res.code === 'MIXED_SITE_PAYLOAD' && honest.recorder.commits === 0 && mutant.recorder.commits === 1;
});

mut('X9  the warehouse snapshot becomes a destination again', function () {
  var m = mutateFn(G16, 'sadSubmitToShippingPlansCore_',
    "var destination = (sadDst.type === 'WAREHOUSE')\n      ? String(h.recommended_destination_warehouse_code_snapshot || destWhId || '').trim()\n      : String(h.destination_marketplace || '').trim();",
    "var destination = String(h.recommended_destination_warehouse_code_snapshot || destWhId || h.marketplace || '').trim();");
  var walmart = H({ allocation_draft_id: 'SADH-WM', marketplace: 'Walmart', destination_marketplace: 'Amazon' });
  var b = Object.assign({}, BODY, { applied_scope: { company: 'ResUS', country: 'US', marketplace: 'Walmart' }, allocation_draft_ids: ['SADH-WM'] });
  var honest = runCore([walmart], [LN({ allocation_draft_id: 'SADH-WM' })], b);
  var G16SAVE = G16; G16 = m;
  var mutant;
  try { mutant = runCore([walmart], [LN({ allocation_draft_id: 'SADH-WM' })], b); }
  finally { G16 = G16SAVE; }
  return honest.recorder.lines[0].destination === 'Amazon' && mutant.recorder.lines[0].destination === 'Walmart';
});

mut('X10 the proposed quantity is recomputed instead of carried', function () {
  var m = mutateFn(G16, 'sadSubmitToShippingPlansCore_',
    'sku: ln.sku, site_sku: ln.site_sku, requested_qty: ln.planned_qty, units_per_carton: ln.units_per_carton,',
    'sku: ln.sku, site_sku: ln.site_sku, requested_qty: Math.ceil(Number(ln.planned_qty) / Number(ln.units_per_carton || 1)) * Number(ln.units_per_carton || 1) + 20, units_per_carton: ln.units_per_carton,');
  var b = Object.assign({}, BODY, { allocation_draft_ids: ['SADH-K2-E7AF9242'] });
  var honest = runCore([LIVE.H4], LIVE_LINES.H4, b);
  var G16SAVE = G16; G16 = m;
  var mutant;
  try { mutant = runCore([LIVE.H4], LIVE_LINES.H4, b); }
  finally { G16 = G16SAVE; }
  return honest.recorder.lines[0].requested_qty === 800 && mutant.recorder.lines[0].requested_qty !== 800;
});

// ================================================================================================================
console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ': ' + pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
console.log('diagnostic invariants: DB_WRITES=0 · STATUS_TRANSITIONS=0 · SHIPPING_PLANS_CREATED=0 · SHIPPING_PLAN_LINES_CREATED=0');
process.exit(fail ? 1 : 0);
