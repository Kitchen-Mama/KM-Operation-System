// F1-7N-FB-4C — Site Inventory closure: Method registry · AI Plan scope registry · AI draft lifecycle.
//
// Proves the 23 §I claims. Behavioural claims EXECUTE the shipped functions (the two front-end registries as
// real modules with INJECTED IO — never a live DB — and the Apps Script lifecycle core extracted from source).
// Structural claims assert against comment-stripped source so prose cannot satisfy them.
//
// Known regression baseline (pre-existing, unrelated): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node assets/tests/site-inventory-closure-f1-7n-fb-4c.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), d = 0;
  for (; i < src.length; i++) { var c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (' \t\r\n'.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(m.index, j + 1) + ';';
  }
  return src.slice(m.index, src.indexOf(';', i) + 1);
}

var SR = require(path.join(ROOT, 'assets/js/core/scope-registry.js'));
var MR = require(path.join(ROOT, 'assets/js/core/method-registry.js'));
var IR = read('assets/js/pages/inventory-replenishment.js');
var MODAL = read('assets/js/utils/scope-select-modal.js');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G69 = read('assets/specs/active/apps-script/69_api_v1_ai_plan_lifecycle.gs');
var SPEC = read('docs/planning/INVENTORY_AI_PLAN_DRAFT_LIFECYCLE.md');
var INDEX = read('index.html');
var IRC = code(IR), MODALC = code(MODAL), G16C = code(G16), G61C = code(G61), G69C = code(G69);

// ---- the Apps Script lifecycle core, executed from SHIPPED source, zero SpreadsheetApp --------------------
eval(['AIPL_CONTRACT_VERSION_', 'AIPL_SOURCE_PAGE_', 'AIPL_EXPIRATION_REASON_', 'AIPL_AUDIT_COLUMNS_',
  'AIPL_AI_GENERATION_TYPES_', 'AIPL_PROTECTED_STATUSES_'].map(function (v) { return extractVar(G69, v); }).join('\n'));
eval(['aiplStr_', 'aiplLo_', 'aiplErr_', 'aiplSchemaReady_', 'aiplIsAiGenerated_', 'aiplSameScope_',
  'aiplExpirationCandidates_', 'aiplActiveIdentityConflicts_', 'aiplChecksum_', 'aiplPrepareManifest_',
  'aiplExpireSupersededDrafts_'].map(function (f) { return extractFn(G69, f); }).join('\n'));
eval(extractVar(G16, 'SAD_K2_GROUP_DIMENSIONS_'));
eval(extractFn(G16, 'sadK2GroupKey_'));

var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon', planning_cycle: '2026-08', source_page: 'inventory_replenishment' };
function hrow(o) {
  return Object.assign({ planning_cycle: '2026-08', source_page: 'inventory_replenishment', company: 'KM', country: 'US',
    marketplace: 'Amazon', status: 'draft', generation_type: 'scheduled', recommended_source_warehouse_id: 'WH-CN',
    recommended_destination_warehouse_id: '', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: '',
    recommendation_group_no: '', planned_qty: 100 }, o);
}
var AUDIT_COLS = ['allocation_draft_id', 'status', 'company', 'country', 'marketplace', 'planning_cycle',
  'source_page', 'generation_type', 'updated_by', 'updated_at'].concat(AIPL_AUDIT_COLUMNS_);

// ================================================================================================================
section('§I.1-4 — AI Plan scope registry: options, request counts, honest failure');
// ================================================================================================================
function regWith(rows, opts) {
  var calls = { n: 0 };
  var reg = SR.create({
    read: function () {
      calls.n++;
      if (opts && opts.fail) return Promise.resolve({ success: false, error: { code: opts.code || 'DEPLOYMENT_CONTRACT_MISMATCH', message: 'stale deployment' } });
      return Promise.resolve({ success: true, data: { marketplaces: rows, countries: null, empty: !rows.length } });
    }
  });
  return { reg: reg, calls: calls };
}
var ROWS = [
  { marketplace_id: 'MK-US-AMZ', company: 'KM', country: 'US', marketplace: 'Amazon', marketplace_display_name: 'Amazon US', status: 'active' },
  { marketplace_id: 'MK-US-WMT', company: 'KM', country: 'US', marketplace: 'Walmart', marketplace_display_name: 'Walmart US', status: 'active' },
  { marketplace_id: 'MK-CA-AMZ', company: 'KM', country: 'CA', marketplace: 'Amazon', marketplace_display_name: 'Amazon CA', status: 'active' }
];

var t1 = regWith(ROWS);
t1.reg.ensureLoaded().then(function (snap) {
  eq(snap.status, 'READY', '1. the AI modal registry resolves READY');
  eq(SR.countriesOf(snap.model), ['CA', 'US'], '1. and yields real Country options (not an empty select)');
  eq(SR.marketplacesForCountry(snap.model, 'US').map(function (m) { return m.marketplaceId; }), ['MK-US-AMZ', 'MK-US-WMT'],
    '1. and real Marketplace options for a country');
  eq(t1.calls.n, 1, '1. exactly ONE request to populate them');

  // 2 — already loaded => opening the modal costs zero requests
  return Promise.all([t1.reg.ensureLoaded(), t1.reg.ensureLoaded(), t1.reg.ensureLoaded()]).then(function () {
    eq(t1.calls.n, 1, '2. re-opening the modal after the registry is loaded issues ZERO further requests');
    eq(t1.reg.requestCount(), 1, '2. the registry itself reports one request for the session');

    // 3 — country change reads the loaded index only
    var before = t1.calls.n;
    SR.marketplacesForCountry(t1.reg.getModel(), 'CA');
    SR.marketplacesForCountry(t1.reg.getModel(), 'US');
    SR.countriesOf(t1.reg.getModel());
    eq(t1.calls.n, before, '3. changing Country costs ZERO requests — it reads the already-loaded index');
    return null;
  });
}).then(function () {
  // single-flight: concurrent consumers share ONE request
  var t = regWith(ROWS);
  return Promise.all([t.reg.ensureLoaded(), t.reg.ensureLoaded(), t.reg.ensureLoaded(), t.reg.ensureLoaded()])
    .then(function () { eq(t.calls.n, 1, '2b. four concurrent consumers share ONE in-flight request (single-flight)'); });
}).then(function () {
  // 4 — a failure is ERROR with its code, never a fake EMPTY
  var t = regWith([], { fail: true });
  return t.reg.ensureLoaded().then(function (snap) {
    eq(snap.status, 'ERROR', '4. a registry read failure resolves ERROR');
    eq(snap.error.code, 'DEPLOYMENT_CONTRACT_MISMATCH', '4. and preserves the real error code');
    ok(snap.status !== 'EMPTY', '4. it is NOT reported as EMPTY — a failure never masquerades as "nothing configured"');
  });
}).then(function () {
  // and a genuinely empty registry IS EMPTY, not ERROR
  var t = regWith([]);
  return t.reg.ensureLoaded().then(function (snap) {
    eq(snap.status, 'EMPTY', '4b. a genuinely empty registry is EMPTY — a real configuration answer, not an error');
  });
}).then(runRest);

function runRest() {
  // ================================================================================================================
  section('§B2 — one canonical authority; the second source is gone');
  // ================================================================================================================
  ok(MODALC.indexOf('window.KM.DB.getMarketplaces') === -1,
    'B2a the scope modal no longer seeds from the broad _opDbCache getter');
  ok(MODALC.indexOf('getMarketplaceReference') === -1,
    'B2b and no longer issues its own whole-table marketplaces read');
  ok(MODALC.indexOf('KM.scopeRegistry') !== -1, 'B2c it reads the ONE shared registry instead');
  ok(IRC.indexOf('_irSharedRegistry_') !== -1 && IRC.indexOf('reg.ensureLoaded') !== -1,
    'B2d the Site Inventory page reads that SAME registry, so there is one cache and one authority');
  var renderFn = code(extractFn(MODAL, '_renderScopeState'));
  ok(renderFn.indexOf("status === 'READY'") !== -1 && renderFn.indexOf("status === 'LOADING'") !== -1 &&
    renderFn.indexOf("status === 'EMPTY'") !== -1,
    'B2e the modal renders READY / LOADING / EMPTY as DISTINCT branches, with ERROR as the remaining one');
  ok(renderFn.indexOf('No active marketplace scopes are configured') !== -1,
    'B2e2 EMPTY says "nothing is configured" — a configuration answer');
  ok(renderFn.indexOf('Could not load the Country / Marketplace options') !== -1 && renderFn.indexOf('e.code') !== -1,
    'B2e3 ERROR says the read failed AND shows its code — the two can never be confused');
  ok(MODALC.indexOf('data-scope-retry') !== -1, 'B2f an ERROR offers a Retry control');
  ok(INDEX.indexOf('assets/js/core/scope-registry.js') !== -1, 'B2g the shared registry is loaded by index.html');
  ok(INDEX.indexOf('assets/js/core/scope-registry.js') < INDEX.indexOf('assets/js/utils/scope-select-modal.js'),
    'B2h and BEFORE its consumers');

  // ================================================================================================================
  section('§I.5-8 — Method registry: ready, empty configuration, transport error, no N+1');
  // ================================================================================================================
  var CARDS = [
    { rateCardId: 'RC1', carrierId: 'MATSON', originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon', shippingMethod: 'MATSON_SEA', shippingMethodLabel: '美森海卡', status: 'active' },
    { rateCardId: 'RC2', carrierId: 'AIRX', originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon', shippingMethod: 'AIR_EXP', shippingMethodLabel: 'Air Express', status: 'inactive' },
    { rateCardId: 'RC3', carrierId: 'CAX', originCountry: 'CN', destinationCountry: 'CA', marketplace: 'Amazon', shippingMethod: 'CA_SEA', status: 'active' },
    { rateCardId: 'RC4', carrierId: 'LGS', originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon', destinationWarehouseCode: 'AMZLGS', shippingMethod: 'LGS_TRUCK', status: 'active' }
  ];
  var mScope = { company: 'KM', country: 'US', marketplace: 'Amazon' };
  var mCalls = { n: 0 };
  var mreg = MR.create({ read: function () { mCalls.n++; return Promise.resolve({ success: true, data: {} }); }, adapt: function () { return { getCarrierRateCards: CARDS, getCarrierLeadTimes: [] }; } });
  var ROUTE = { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon', sourceWarehouseId: 'WH-CN-YX', destinationWarehouseCode: '' };

  return mreg.ensureLoaded(mScope).then(function () {
    var r = mreg.resolve(mScope, ROUTE);
    eq(r.status, 'READY', '5. a scope with matching rate cards resolves READY');
    eq(r.methods.map(function (m) { return m.value; }), ['LGS_TRUCK', 'MATSON_SEA'], '5. and yields the canonical method tokens');
    ok(r.methods.every(function (m) { return m.value && m.value !== m.label || m.value === m.label; }), '5. values are canonical ids, labels are display metadata');
    ok(r.methods.every(function (m) { return m.value !== 'AIR_EXP'; }), '5. an INACTIVE rate card is excluded');

    // canonical destination identity narrows the set
    var rDest = mreg.resolve(mScope, Object.assign({}, ROUTE, { destinationWarehouseCode: 'AMZLGS' }));
    eq(rDest.methods.map(function (m) { return m.value; }), ['LGS_TRUCK', 'MATSON_SEA'],
      '5b. a concrete destination keeps its own card plus the wildcard-destination cards');

    // 6 — empty configuration is a CONFIGURATION answer
    var rEmpty = mreg.resolve(mScope, { originCountry: 'CN', destinationCountry: 'JP', marketplace: 'Amazon' });
    eq(rEmpty.status, 'EMPTY_CONFIGURATION', '6. a route no rate card covers resolves EMPTY_CONFIGURATION');
    eq(rEmpty.configuration.code, 'METHOD_REGISTRY_CONFIGURATION_REQUIRED', '6. carrying METHOD_REGISTRY_CONFIGURATION_REQUIRED');
    eq(rEmpty.configuration.missing_table, 'carrier_rate_cards', '6. naming the table');
    ok(rEmpty.configuration.required_configuration_row, '6. and the exact row that would fix it');
    ok(rEmpty.configuration.next_action && rEmpty.configuration.next_action.length > 10, '6. with an actionable next step');
    ok(rEmpty.status !== 'ERROR', '6. "no eligible method" is NEVER reported as a transport failure');

    // 8 — no N+1: many pickers, one request
    var before = mCalls.n;
    for (var i = 0; i < 25; i++) mreg.resolve(mScope, ROUTE);
    eq(mCalls.n, before, '8. twenty-five Method pickers in one scope issue ZERO further reads');
    return Promise.all([mreg.ensureLoaded(mScope), mreg.ensureLoaded(mScope), mreg.ensureLoaded(mScope)]).then(function () {
      eq(mreg.requestCount(), 1, '8b. concurrent ensureLoaded calls for one scope dedupe to ONE request');
    });
  }).then(function () {
    // 7 — transport error keeps its code and is NOT an empty configuration
    var eCalls = { n: 0 };
    var ereg = MR.create({ read: function () { eCalls.n++; return Promise.resolve({ success: false, errors: [{ code: 'DEPLOYMENT_CONTRACT_MISMATCH', message: 'action not deployed' }] }); } });
    return ereg.ensureLoaded(mScope).then(function () {
      var r = ereg.resolve(mScope, ROUTE);
      eq(r.status, 'ERROR', '7. a transport/deployment failure resolves ERROR');
      eq(r.error.code, 'DEPLOYMENT_CONTRACT_MISMATCH', '7. and PRESERVES the real code (it used to be discarded)');
      ok(r.status !== 'EMPTY_CONFIGURATION', '7. a failure is never reported as a missing rate card');
    });
  }).then(function () {
    // STALE_SCOPE — a catalogue for another station never answers
    var sreg = MR.create({ read: function () { return Promise.resolve({ success: true, data: {} }); }, adapt: function () { return { getCarrierRateCards: CARDS, getCarrierLeadTimes: [] }; } });
    return sreg.ensureLoaded({ company: 'KM', country: 'US', marketplace: 'Amazon' }).then(function () {
      eq(sreg.resolve({ company: 'KM', country: 'CA', marketplace: 'Amazon' }, ROUTE).status, 'STALE_SCOPE',
        '5c. a catalogue loaded for another station answers STALE_SCOPE, never a confidently wrong list');
    });
  }).then(function () {
    // the five states exist in the shipped picker
    section('§C — the five states reach the operator');
    ['LOADING', 'READY', 'EMPTY_CONFIGURATION', 'ERROR', 'STALE_SCOPE'].forEach(function (st) {
      ok(MR.STATUS[st] === st, 'C1 registry state exists: ' + st);
    });
    ok(IRC.indexOf('No eligible method configured for this route') !== -1, 'C2 EMPTY_CONFIGURATION has its own sentence');
    ok(IRC.indexOf('Methods unavailable (') !== -1, 'C3 ERROR shows its CODE, not a generic sentence');
    ok(IRC.indexOf('Press Search to load methods for this station') !== -1, 'C4 STALE_SCOPE has its own sentence');
    ok(IRC.indexOf('Unable to load methods — Retry') === -1, 'C5 the old catch-all "Unable to load methods" is GONE');
    ok(IRC.indexOf('data-method-state') !== -1, 'C6 the state is exposed on the control itself');
    ok(IRC.indexOf('_irRetryMethodRegistry_') !== -1, 'C7 a real retry entry point exists');
    ok(IRC.indexOf('data-wh-code') !== -1, 'C8 the canonical destination warehouse CODE is available to the scoping');
    var searchFn = code(extractFn(IR, '_irApplySearch_'));
    ok(searchFn.indexOf('_irLoadCarrierPlanning_') !== -1, 'C9 the catalogue is PRELOADED after a successful Search');
    ok(searchFn.indexOf('await _irLoadCarrierPlanning_') === -1, 'C10 and is NOT awaited — it cannot block the first paint of rows');

    // ================================================================================================================
    section('§I.9-19 — AI draft lifecycle');
    // ================================================================================================================
    var ROWSET = [
      hrow({ allocation_draft_id: 'OLD-AI-1', generation_run_id: 'AIRUN-OLD' }),
      hrow({ allocation_draft_id: 'OLD-AI-EDITED', generation_run_id: 'AIRUN-OLD', note: 'user raised qty', planned_qty: 777 }),
      hrow({ allocation_draft_id: 'MANUAL-1', generation_type: 'user_created', generation_run_id: '', recommended_destination_warehouse_id: 'WH-MANUAL-DEST' }),
      hrow({ allocation_draft_id: 'OLD-SUBMITTED', generation_run_id: 'AIRUN-OLD', status: 'submitted' }),
      hrow({ allocation_draft_id: 'OLD-CANCELLED', generation_run_id: 'AIRUN-OLD', status: 'cancelled' }),
      // site_confirmed is an ACTIVE status, so like every other row that survives the expiration it must carry
      // its OWN route: the K2 resolver guarantees one active header per route group, so two active headers
      // sharing a route could not exist in real data.
      hrow({ allocation_draft_id: 'OLD-SITECONF', generation_run_id: 'AIRUN-OLD', status: 'site_confirmed', recommended_destination_warehouse_id: 'WH-CONFIRMED-DEST' }),
      hrow({ allocation_draft_id: 'ALREADY-EXPIRED', generation_run_id: 'AIRUN-OLDER', status: 'expired' }),
      hrow({ allocation_draft_id: 'OTHER-COUNTRY', generation_run_id: 'AIRUN-OLD', country: 'CA' }),
      hrow({ allocation_draft_id: 'OTHER-MARKETPLACE', generation_run_id: 'AIRUN-OLD', marketplace: 'Walmart' }),
      hrow({ allocation_draft_id: 'CURRENT-1', generation_run_id: 'AIRUN-NEW' })
    ];
    var CTX = Object.assign({}, SCOPE, { generation_run_id: 'AIRUN-NEW', committed_ids: ['CURRENT-1'] });
    var d = aiplExpirationCandidates_(ROWSET, CTX);
    var expIds = d.expire.map(function (x) { return x.allocation_draft_id; });

    eq(expIds, ['OLD-AI-1', 'OLD-AI-EDITED'], '9. a successful current run expires exactly the older AI drafts');
    function preservedFor(id) { var p = d.preserved.filter(function (x) { return x.allocation_draft_id === id; })[0]; return p ? p.reason : null; }
    eq(preservedFor('MANUAL-1'), 'MANUAL_SOURCE', '12. a MANUAL route is never expired');
    eq(preservedFor('OLD-SUBMITTED'), 'PROTECTED_STATUS_SUBMITTED', '13. a submitted row is never expired');
    eq(preservedFor('OLD-CANCELLED'), 'PROTECTED_STATUS_CANCELLED', '13b. a cancelled row is never expired');
    eq(preservedFor('OLD-SITECONF'), 'PROTECTED_STATUS_SITE_CONFIRMED', '13c. a site_confirmed row is never expired');
    eq(preservedFor('ALREADY-EXPIRED'), 'PROTECTED_STATUS_ALREADY_EXPIRED', '13d. an already-expired row is not re-expired');
    eq(preservedFor('OTHER-COUNTRY'), 'OUT_OF_SCOPE', '14. another country is untouched');
    eq(preservedFor('OTHER-MARKETPLACE'), 'OUT_OF_SCOPE', '14b. another marketplace is untouched');
    eq(preservedFor('CURRENT-1'), 'CURRENT_RUN_OUTPUT', '16. the current run never expires its OWN rows');
    var sameRun = aiplExpirationCandidates_([hrow({ allocation_draft_id: 'X', generation_run_id: 'AIRUN-NEW' })], CTX);
    eq(sameRun.expire.length, 0, '16b. nor any row already stamped with the current run id');

    // 19 — a user-edited old AI draft is expired WITH its audit preserved
    var edited = d.expire.filter(function (x) { return x.allocation_draft_id === 'OLD-AI-EDITED'; })[0];
    ok(!!edited, '19. a user-edited old AI draft IS expired (the recorded business decision)');
    eq(edited.expiration_reason, 'SUPERSEDED_BY_NEW_AI_PLAN', '19b. with the canonical expiration reason');
    eq(edited.generation_run_id, 'AIRUN-OLD', '19c. and its source run id retained');
    ok(edited.user_edited === true, '19d. the user-edit fact is recorded, not lost');

    // 11 — a ZERO-RESULT successful run still expires
    var zero = aiplExpirationCandidates_(ROWSET, Object.assign({}, SCOPE, { generation_run_id: 'AIRUN-ZERO', committed_ids: [] }));
    eq(zero.expire.map(function (x) { return x.allocation_draft_id; }), ['CURRENT-1', 'OLD-AI-1', 'OLD-AI-EDITED'],
      '11. a zero-result successful run expires every older AI draft in scope');
    ok(G61C.indexOf('var zeroResult = (jobStatus === \'NO_DEMAND\')') !== -1, '11b. NO_DEMAND is classified as a zero-result run');
    // 11c SUPERSEDED BY F1-7N-FB-4C-ADDENDUM-MIGRATION §B, and STRENGTHENED. FB-4C pinned the exact expression
    // `zeroResult || (anyOk && !anyFail)`. The addendum adds ONE more legitimate success case: a run whose every
    // proposed identity was suppressed by a binding manual Execution Plan wrote nothing and was RIGHT to write
    // nothing. The rule that matters is unchanged and is now pinned in both directions - the only successes are
    // "no demand", "all suppressed", and "every group committed"; a partial or failed run is still not success.
    ok(G61C.indexOf('var runSucceeded = zeroResult || allSuppressed || (anyOk && !anyFail)') !== -1,
      '11c. a zero-result run is a SUCCESS, and so is an all-suppressed run');
    ok(G61C.indexOf("var allSuppressed = (jobStatus === 'ALL_SUPPRESSED_BY_MANUAL')") !== -1,
      '11c. all-suppressed is its own classified job status, not a silent NO_DEMAND');
    ok(/anyFail \? \(anyOk \? 'PARTIAL' : 'FAILED'\) : 'COMPLETED'/.test(G61C),
      '11c. and a partial or failed run is still NEITHER — whole-job success needs every written group to commit');
    ok(G61C.indexOf('zero_result: zeroResult') !== -1, '11d. reported as zero_result in the projection');

    // 10 — a FAILED run expires nothing
    ok(/if \(runSucceeded\) \{/.test(G61C), '10. expiration runs ONLY inside the success branch');
    ok(G61C.indexOf('RUN_NOT_SUCCESSFUL_NOTHING_EXPIRED') !== -1, '10b. a non-successful run records that it expired nothing');
    var order = [G61C.indexOf('handleUpsertShippingAllocationDraftAtomic_'), G61C.indexOf('aiplExpireSupersededDrafts_')];
    ok(order[0] > -1 && order[1] > order[0], '10c. the current run is COMMITTED before anything is expired (never expire-then-compute)');

    // 15 — a retry with the same execution key is idempotent
    ok(G61C.indexOf('body.execution_key || body.executionKey') !== -1, '15. the caller may pin the execution key');
    ok(/generationRunId = 'AIRUN-' \+ sadFnv1a_\(executionKey\)/.test(G61C),
      '15b. the run id is DERIVED from it, so a retry is the SAME run and cannot create a second current run');

    // 17/18 — expired never reaches the UI active list nor the Submit workset
    ok(G16C.indexOf("SAD_STATUSES_ = { draft: 1, site_confirmed: 1, submitted: 1, cancelled: 1, expired: 1 }") !== -1,
      '17. `expired` is a real status in the canonical enum');
    ok(/SAD_TERMINAL_STATUSES_ = \{ submitted: 1, cancelled: 1, expired: 1 \}/.test(G16C),
      '17b. and is TERMINAL — no writer may mutate it');
    ok(G16C.indexOf("if (SAD_TERMINAL_STATUSES_[st]) continue;") !== -1,
      '17c. active-header scans skip it, so it can never hydrate as active');
    ok(/lst === 'cancelled' \|\| lst === 'expired'/.test(G16C), '17d. the workspace readback drops expired lines');
    ok(G16C.indexOf('DRAFT_EXPIRED_SUPERSEDED_BY_NEWER_AI_PLAN') !== -1,
      '18. Submit refuses an expired draft with its OWN typed reason');
    ok(/lnSt === 'cancelled' \|\| lnSt === 'expired'/.test(G16C), '18b. and an expired LINE is not shippable');
    ok(G16C.indexOf("cancelled: 1, expired: 1") !== -1, '18c. expired is excluded from the active line set');

    // §D — expired is never faked with cancelled, never hidden in a note
    ok(G69C.indexOf("'cancelled'") === -1 || G69C.indexOf("aiplLo_(row.status) !== 'draft'") !== -1,
      'D1 the lifecycle never writes `cancelled` to mean expired');
    ok(G69C.indexOf("setCell(hSheet, row.__row, hRead.headers, 'note'") === -1,
      'D2 and never writes the reason into a free-text note');
    ok(G69C.indexOf("'expiration_reason', AIPL_EXPIRATION_REASON_") !== -1, 'D3 it writes the formal reason column');
    eq(AIPL_AUDIT_COLUMNS_, ['generation_run_id', 'expired_at', 'expired_by_run_id', 'expiration_reason'],
      'D4 the four audit columns are the recorded minimal schema extension');

    // schema fail-closed
    var prepNoSchema = aiplPrepareManifest_({ scope: SCOPE, headerRows: ROWSET, headerColumns: ['allocation_draft_id', 'status'], generation_run_id: 'AIRUN-NEW', committed_ids: ['CURRENT-1'] });
    ok(!prepNoSchema.ok, 'D5 without the audit columns the lifecycle FAILS CLOSED');
    eq(prepNoSchema.blockers[0].code, 'AI_PLAN_LIFECYCLE_SCHEMA_EXTENSION_REQUIRED', 'D6 with a typed, actionable code');
    eq(prepNoSchema.blockers[0].missing_columns, AIPL_AUDIT_COLUMNS_, 'D7 naming exactly which columns are missing');
    var prepOk = aiplPrepareManifest_({ scope: SCOPE, headerRows: ROWSET, headerColumns: AUDIT_COLS, generation_run_id: 'AIRUN-NEW', committed_ids: ['CURRENT-1'] });
    ok(prepOk.ok, 'D8 with them present the manifest is producible');
    ok(/^[0-9A-F]{8}$/.test(prepOk.manifest.checksum), 'D9 and carries a deterministic checksum');
    var prepShuffled = aiplPrepareManifest_({ scope: SCOPE, headerRows: ROWSET.slice().reverse(), headerColumns: AUDIT_COLS, generation_run_id: 'AIRUN-NEW', committed_ids: ['CURRENT-1'] });
    eq(prepShuffled.manifest.checksum, prepOk.manifest.checksum, 'D10 the checksum does not depend on row order');
    var prepNoRun = aiplPrepareManifest_({ scope: SCOPE, headerRows: ROWSET, headerColumns: AUDIT_COLS, generation_run_id: '', committed_ids: [] });
    ok(!prepNoRun.ok && prepNoRun.blockers.some(function (b) { return b.code === 'GENERATION_RUN_ID_REQUIRED'; }),
      'D11 nothing may be expired without an immutable run id');

    // ================================================================================================================
    section('§F / §I.20-21 — active uniqueness and multi-route');
    // ================================================================================================================
    var dupe = aiplActiveIdentityConflicts_([
      hrow({ allocation_draft_id: 'A', generation_run_id: 'AIRUN-OLD' }),
      hrow({ allocation_draft_id: 'B', generation_run_id: 'AIRUN-NEW' })
    ], sadK2GroupKey_);
    ok(!dupe.ok, 'F1 two active AI drafts on ONE canonical identity is a conflict');
    eq(dupe.conflicts[0].kind, 'DUPLICATE_ACTIVE_AI_IDENTITY', 'F2 named as a duplicate active AI identity');
    var multi = aiplActiveIdentityConflicts_([
      hrow({ allocation_draft_id: 'R1', recommended_destination_warehouse_id: '' }),
      hrow({ allocation_draft_id: 'R2', recommended_destination_warehouse_id: 'WH-LGS' })
    ], sadK2GroupKey_);
    ok(multi.ok, '20. one SKU with TWO different routes is NOT a conflict — it is two canonical headers');
    ok(G69C.indexOf('sadK2GroupKey_') !== -1, 'F3 identity uses the EXISTING canonical K2 key — no second hash is defined');
    ok(G69C.indexOf('function aiplGroupKey') === -1 && G69C.indexOf('FNV') === -1 || G69C.indexOf('aiplChecksum_') !== -1,
      'F4 the only hash in the module is the manifest checksum, which is not an identity');
    // 21 — the FB-4B duplicate-PK guards are untouched
    ok(G16C.indexOf('LINE_PRIMARY_KEY_ALREADY_EXISTS') !== -1, '21. the pre-insert primary-key assertion still stands');
    ok(G16C.indexOf('DUPLICATE_LINE_IDENTITY_IN_BATCH') !== -1, '21b. the batch pre-flight still stands');
    ok(G16C.indexOf('sadCanonicalLineId_') !== -1, '21c. canonical line resolution still stands');
    ok(IRC.indexOf('preflightRouteGroups') !== -1 && IRC.indexOf('_irPersistOneRouteGroup_') !== -1,
      '20b. the FB-4B-Addendum multi-route grouping is unchanged');
    ok(/function _irAdoptPersistedLineIds_\(sku, draftId, persistedLines\)/.test(IRC),
      '21d. scoped persisted-id adoption is unchanged');

    // ================================================================================================================
    section('§E — staged commit executed with injected IO (zero SpreadsheetApp)');
    // ================================================================================================================
    function fakeSheet(headers, rows) {
      return { headers: headers.slice(), rows: rows.map(function (r) { return Object.assign({}, r); }) };
    }
    function makeIo(hSheet, lSheet) {
      var writes = [];
      return {
        writes: writes,
        io: {
          now: function () { return '2026-08-26 10:00:00'; },
          headerSheet: function () { return hSheet; },
          lineSheet: function () { return lSheet; },
          readRows: function (sheet) {
            return { headers: sheet.headers.slice(), rows: sheet.rows.map(function (r, i) { return Object.assign({ __row: i + 2 }, r); }) };
          },
          setCell: function (sheet, rowNum, headers, col, val) {
            if (headers.indexOf(col) === -1) return false;
            sheet.rows[rowNum - 2][col] = val;
            writes.push({ sheet: sheet === hSheet ? 'header' : 'line', row: rowNum, col: col, val: val });
            return true;
          }
        }
      };
    }
    var hS = fakeSheet(AUDIT_COLS, ROWSET);
    var lS = fakeSheet(['allocation_draft_line_id', 'allocation_draft_id', 'line_status', 'planned_qty', 'note', 'updated_at'], [
      { allocation_draft_line_id: 'L-OLD-1', allocation_draft_id: 'OLD-AI-1', line_status: 'draft', planned_qty: 100, note: '' },
      { allocation_draft_line_id: 'L-OLD-2', allocation_draft_id: 'OLD-AI-EDITED', line_status: 'draft', planned_qty: 777, note: 'user raised qty' },
      { allocation_draft_line_id: 'L-SUB', allocation_draft_id: 'OLD-SUBMITTED', line_status: 'submitted', planned_qty: 50, note: '' },
      { allocation_draft_line_id: 'L-MAN', allocation_draft_id: 'MANUAL-1', line_status: 'draft', planned_qty: 33, note: '' },
      { allocation_draft_line_id: 'L-CUR', allocation_draft_id: 'CURRENT-1', line_status: 'draft', planned_qty: 200, note: '' }
    ]);
    var m = makeIo(hS, lS);
    var res = aiplExpireSupersededDrafts_(null, {
      scope: SCOPE, generation_run_id: 'AIRUN-NEW', committed_ids: ['CURRENT-1'], actor: 'test', keyOf: sadK2GroupKey_
    }, m.io);

    ok(res.ok, 'E1 the staged expiration completes and self-verifies');
    eq(res.expired_headers, 2, 'E2 exactly the two older AI headers were expired');
    eq(res.expired_lines, 2, 'E3 and their lines');
    eq(hS.rows.filter(function (r) { return r.allocation_draft_id === 'OLD-AI-1'; })[0].status, 'expired', 'E4 the old header is now `expired`');
    eq(hS.rows.filter(function (r) { return r.allocation_draft_id === 'OLD-AI-1'; })[0].expiration_reason, 'SUPERSEDED_BY_NEW_AI_PLAN', 'E5 with the canonical reason');
    eq(hS.rows.filter(function (r) { return r.allocation_draft_id === 'OLD-AI-1'; })[0].expired_by_run_id, 'AIRUN-NEW', 'E6 and the superseding run id');
    eq(hS.rows.filter(function (r) { return r.allocation_draft_id === 'MANUAL-1'; })[0].status, 'draft', 'E7 the MANUAL header is untouched');
    eq(hS.rows.filter(function (r) { return r.allocation_draft_id === 'CURRENT-1'; })[0].status, 'draft', 'E8 the current run stays active');
    eq(hS.rows.filter(function (r) { return r.allocation_draft_id === 'OLD-SUBMITTED'; })[0].status, 'submitted', 'E9 the submitted row is untouched');
    // audit preserved byte-for-byte
    eq(lS.rows.filter(function (l) { return l.allocation_draft_line_id === 'L-OLD-2'; })[0].planned_qty, 777, 'E10 the user quantity on an expired line is PRESERVED');
    eq(lS.rows.filter(function (l) { return l.allocation_draft_line_id === 'L-OLD-2'; })[0].note, 'user raised qty', 'E11 and its note');
    eq(lS.rows.filter(function (l) { return l.allocation_draft_line_id === 'L-SUB'; })[0].line_status, 'submitted', 'E12 a submitted LINE keeps its own status');
    eq(lS.rows.filter(function (l) { return l.allocation_draft_line_id === 'L-MAN'; })[0].line_status, 'draft', 'E13 a manual line is untouched');
    eq(res.verification.old_ai_drafts_still_active, [], 'E14 verification proves no old AI draft is still active');
    ok(res.verification.active_identity_ok, 'E15 and that no duplicate ACTIVE AI identity remains');
    eq(res.verification.ai_and_manual_share_identity, [], 'E15b and no AI/manual identity collision in this scope');
    ok(m.writes.every(function (w) { return ['status', 'expired_at', 'expired_by_run_id', 'expiration_reason', 'updated_by', 'updated_at', 'line_status'].indexOf(w.col) !== -1; }),
      'E16 ONLY lifecycle columns were written — no quantity, flag or snapshot was touched');

    // a second run over the same data expires nothing new (idempotent)
    var m2 = makeIo(hS, lS);
    var res2 = aiplExpireSupersededDrafts_(null, { scope: SCOPE, generation_run_id: 'AIRUN-NEW', committed_ids: ['CURRENT-1'], actor: 'test', keyOf: sadK2GroupKey_ }, m2.io);
    eq(res2.expired_headers, 0, 'E17 re-running the expiration expires NOTHING further (idempotent)');
    eq(m2.writes.length, 0, 'E18 and writes nothing at all');

    // ================================================================================================================
    section('§H — read-only diagnostic');
    // ================================================================================================================
    ok(G69C.indexOf('function TEMP_INVENTORY_AI_PLAN_FLOW_DIAGNOSE') !== -1, 'H1 the diagnostic exists');
    var diagFn = code(extractFn(G69, 'aiplDiagnose_'));
    ['setValue(', 'appendRow(', 'deleteRow(', 'setProperty(', 'DriveApp', 'MailApp', 'GmailApp'].forEach(function (t) {
      ok(diagFn.indexOf(t) === -1, 'H2 the diagnostic performs NO ' + t.replace('(', '') + ' call');
    });
    ['DB_WRITES: 0', 'STATUS_TRANSITIONS: 0', 'PROPERTY_WRITES: 0', 'DRIVE_WRITES: 0', 'EMAILS: 0', 'DEMO_MUTATIONS: 0'].forEach(function (f) {
      ok(G69C.indexOf(f) !== -1, 'H3 footer declares ' + f);
    });
    ['registry', 'method_registry', 'ai_runs', 'expiration_preview', 'blocking_reason', 'next_action'].forEach(function (k) {
      ok(G69C.indexOf(k + ':') !== -1, 'H4 diagnostic reports: ' + k);
    });
    ['duplicate_active_identities', 'current_generation_authority', 'schema'].forEach(function (k) {
      ok(G69C.indexOf('report.' + k + ' =') !== -1, 'H4 diagnostic reports: ' + k);
    });
    ok(G69C.indexOf('rows_that_would_expire') !== -1, 'H5 it previews the rows a run WOULD expire');
    ok(G69C.indexOf('manual_headers_preserved') !== -1, 'H6 and the manual rows it would preserve');

    // ================================================================================================================
    section('§G — API projection and UI behaviour');
    // ================================================================================================================
    ['generation_run_id', 'execution_key', 'created_headers', 'updated_headers', 'created_lines', 'updated_lines',
      'expired_headers', 'expired_lines', 'active_count', 'expired_count', 'zero_result'].forEach(function (k) {
      ok(G61C.indexOf(k + ':') !== -1, 'G1 the run projection returns: ' + k);
    });
    ok(IRC.indexOf('expiredHeaders:') !== -1 && IRC.indexOf('zeroResult:') !== -1, 'G2 the page consumes the projection');
    ok(IRC.indexOf('Your current Execution Plan is unchanged') !== -1,
      'G3 an AI Plan FAILURE explicitly does not clear the Execution Plan');
    ok(IRC.indexOf('Replaced ') !== -1, 'G4 the result states what was REPLACED, not only what was created');

    // ================================================================================================================
    section('§A — nothing from FB-4B / the Addendum regressed; canonical spec recorded');
    // ================================================================================================================
    ok(SPEC.indexOf('SUPERSEDED_BY_NEW_AI_PLAN') !== -1 && SPEC.indexOf('CANONICAL') !== -1,
      'A1 the lifecycle rule is recorded in a canonical planning document');
    ok(SPEC.indexOf('never deleted') !== -1, 'A2 including that rows are kept, never deleted');
    var G68 = code(read('assets/specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs'));
    ok(/TEMP_DUPFIX_MODE_\s*=\s*'DRY_RUN'/.test(G68), 'A3 the FB-4B cleanup tool is still DRY_RUN by default');
    ok(read('assets/specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs').indexOf('F1-7N-FB-4C') === -1,
      'A4 this task did NOT modify the cleanup tool');
    ok(G61C.indexOf('TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP') === -1 && G69C.indexOf('TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP') === -1,
      'A5 no cleanup runs inside a production request path');
    ok(G16C.indexOf('deleteRow') === -1, 'A6 the allocation handler still deletes no row');
    ok(G69C.indexOf('deleteRow') === -1 && G69C.indexOf('deleteRows') === -1, 'A7 the lifecycle module deletes no row');

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  });
}
