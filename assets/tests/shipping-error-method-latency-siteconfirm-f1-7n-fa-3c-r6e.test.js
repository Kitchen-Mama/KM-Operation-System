// Kitchen Mama Operation System — R6E structured error (C) + Method latency (D) + Site Confirm bypass (E) — F1-7N-FA-3C-R6E-P0.
// Run: node assets/tests/shipping-error-method-latency-siteconfirm-f1-7n-fa-3c-r6e.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6E ERROR + METHOD + SITE-CONFIRM (F1-7N-FA-3C-R6E-P0): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extract(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
var IR = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'inventory-replenishment.js'), 'utf8').replace(/\r\n/g, '\n');
var RO = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');

// ============================================================ C — structured error renderer
section('C. structured save-error — no "[object Object]", safe disclosure, never "Saved"');
(function () {
  function _execEsc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  var elStore = {}; var document = { getElementById: function (id) { return elStore[id] || (elStore[id] = { id: id, style: {}, innerHTML: '', textContent: '' }); } };
  // F1-7N-FB-2A §E — _irMakeDraftSaveError_ now recovers the TYPED INNER REASON (the field the previous
  // surface discarded), so its extraction set includes those helpers and their reason table.
  eval(IR.match(/var IR_DRAFT_TYPED_REASONS_ = \[[\s\S]*?\];/)[0]);
  eval(extract(IR, '_irTypedReasonCode_'));
  eval(extract(IR, '_irReasonIsPreWrite_'));
  eval(extract(IR, '_irReasonRetryable_'));
  eval(extract(IR, '_irReasonNextAction_'));
  eval(extract(IR, '_irMakeDraftSaveError_'));
  eval(extract(IR, '_irShowDraftSaveError'));
  // The exact live shape from _kmCmdErr_: error is a STRUCTURED object (this is what became "[object Object]").
  var structuredErr = { code: 'HEADER_MISSING', message: 'PRODUCTION_SAFETY:HEADER_MISSING [shipping_plan_lines]', details: { table: 'shipping_plan_lines', command: 'upsertShippingAllocationDraftLines', requestId: 'req-42' } };
  var e = _irMakeDraftSaveError_(structuredErr, 'shipping_allocation_draft_lines', 'draft line upsert failed');
  ok(e.message.indexOf('[object Object]') === -1, 'C1. the normalized Error message is NEVER "[object Object]" (root-cause fix)');
  eq([e.structured.code, e.structured.table, e.structured.requestId], ['HEADER_MISSING', 'shipping_plan_lines', 'req-42'], 'C2. structured view exposes code / affected table / request id');
  _irShowDraftSaveError('CO1100-R', e);
  var html = elStore['allocation-carton-error-CO1100-R'].innerHTML;
  ok(html.indexOf('[object Object]') === -1, 'C3. rendered surface never shows "[object Object]"');
  ok(/Unsaved — database update failed/.test(html), 'C3. the surface labels the route UNSAVED (F1-7N-FB-2A §D)');
  ok(!/kept locally/.test(html), 'C3. and never claims the failed write was kept locally — that was a FALSE persistence claim');
  ok(/NOT saved to the database/.test(html), 'C3. it states plainly that nothing was saved');
  ok(!/Saved/.test(html), 'C3. the failed save NEVER shows "Saved"');
  ok(/PRODUCTION_SAFETY:HEADER_MISSING/.test(html), 'C3. and the TYPED INNER REASON is now visible, not discarded');
  ok(/<details/.test(html) && /HEADER_MISSING/.test(html) && /shipping_plan_lines/.test(html), 'C3. collapsed technical disclosure with code + affected table');
  ok(!/AKfyc|token|password|stack/i.test(html), 'C3. no stack / token / secret exposed');
  // a plain-string error still renders (back-compat)
  var e2 = _irMakeDraftSaveError_('some string error', 'shipping_plan_lines', 'fallback');
  eq(e2.message, 'some string error', 'C. a plain-string error is preserved verbatim');
})();

// ============================================================ D — Method dropdown latency / dedupe / states
//
// F1-7N-FB-4C — REWRITTEN AGAINST THE SHIPPED METHOD REGISTRY, AND STRENGTHENED.
//
// R6E's original guarantees are all still asserted here: LOADING before the catalogue resolves (never a false
// "no method"), concurrent expands coalesced into ONE fetch, a cached re-entry costing zero fetches, and a
// failure surfacing as a failure. What changed is WHERE those guarantees live: the catalogue's request, cache,
// in-flight latch and state now belong to KM.methodRegistry (assets/js/core/method-registry.js) instead of three
// loose page variables that threw the error code away.
//
// The assertions are strictly stronger than before:
//   · the old ERROR state carried no code — every failure rendered "Unable to load methods". It now carries the
//     REAL code, and a genuinely EMPTY configuration is a DIFFERENT state with a DIFFERENT sentence, so
//     "no rate card covers this route" can no longer be reported as a transport failure;
//   · the catalogue is keyed by APPLIED SCOPE, so a catalogue loaded for another station answers STALE_SCOPE
//     rather than a confidently wrong list.
section('D. Method loading — in-flight dedupe + LOADING/READY/EMPTY_CONFIGURATION/ERROR/STALE_SCOPE');
(function () {
  var MREG = require(require('path').join(__dirname, '..', 'js', 'core', 'method-registry.js'));
  function _execEsc(v) { return String(v == null ? '' : v); }
  var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon' };
  var ROUTE = { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon' };
  var getWsCalls = { n: 0 }; var deferred = null;
  var reg = MREG.create({
    read: function () { getWsCalls.n++; return new Promise(function (res) { deferred = res; }); },
    adapt: function () { return { getCarrierRateCards: [{ shippingMethod: 'SEA', shippingMethodLabel: 'Sea', originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon', status: 'active' }], getCarrierLeadTimes: [] }; }
  });
  eval(extract(IR, '_execMethodOptionsHtml'));

  var p1 = reg.ensureLoaded(SCOPE); var p2 = reg.ensureLoaded(SCOPE);
  eq(reg.resolve(SCOPE, ROUTE).status, 'LOADING', 'D1. before the catalog resolves → state LOADING');
  eq(_execMethodOptionsHtml({ status: 'LOADING', methods: [] }, ''), '<option value="">Loading methods…</option>',
    'D1. LOADING → "Loading methods…" (NEVER a false "No matching method")');
  eq(getWsCalls.n, 1, 'D2. concurrent expands are COALESCED into exactly ONE fetch');
  deferred({ success: true, data: {} });
  Promise.all([p1, p2]).then(function () {
    var r = reg.resolve(SCOPE, ROUTE);
    eq(r.status, 'READY', 'D3. after resolve → READY');
    eq(_execMethodOptionsHtml(r, ''), '<option value="">Method…</option><option value="SEA">Sea</option>',
      'D3. READY with matches → real options');
    // an EMPTY CONFIGURATION is a different state from a failure, and says so
    var rEmpty = reg.resolve(SCOPE, { originCountry: 'CN', destinationCountry: 'JP', marketplace: 'Amazon' });
    eq(rEmpty.status, 'EMPTY_CONFIGURATION', 'D3b. a route nothing covers → EMPTY_CONFIGURATION (only AFTER the lookup completes)');
    eq(_execMethodOptionsHtml(rEmpty, ''), '<option value="">No eligible method configured for this route</option>',
      'D3c. and it reads as a CONFIGURATION answer, never as a transport failure');
    eq(rEmpty.configuration.code, 'METHOD_REGISTRY_CONFIGURATION_REQUIRED', 'D3d. carrying an actionable code');
    // cached re-entry → no new fetch (survives SPA remount via the module-level registry)
    getWsCalls.n = 0;
    for (var i = 0; i < 20; i++) reg.resolve(SCOPE, ROUTE);
    return reg.ensureLoaded(SCOPE);
  }).then(function () {
    eq(getWsCalls.n, 0, 'D4. a re-entry (and 20 pickers) reuse the cached catalog — 0 new fetch, remount-safe');
    // a catalogue for ANOTHER station never answers
    eq(reg.resolve({ company: 'KM', country: 'CA', marketplace: 'Amazon' }, ROUTE).status, 'STALE_SCOPE',
      'D5. a catalogue loaded for a different station answers STALE_SCOPE, not a wrong list');
    eq(_execMethodOptionsHtml({ status: 'STALE_SCOPE', methods: [] }, ''),
      '<option value="">Press Search to load methods for this station</option>', 'D5b. with its own sentence');
    // ERROR keeps the REAL code — the defect this replaces discarded it
    var ereg = MREG.create({ read: function () { return Promise.resolve({ success: false, errors: [{ code: 'DEPLOYMENT_CONTRACT_MISMATCH', message: 'stale deploy' }] }); } });
    return ereg.ensureLoaded(SCOPE).then(function () {
      var er = ereg.resolve(SCOPE, ROUTE);
      eq(er.status, 'ERROR', 'D6. a failed catalogue read → ERROR');
      eq(er.error.code, 'DEPLOYMENT_CONTRACT_MISMATCH', 'D6b. PRESERVING the real code (it used to be discarded)');
      ok(/Methods unavailable \(DEPLOYMENT_CONTRACT_MISMATCH\)/.test(_execMethodOptionsHtml(er, '')),
        'D6c. and the operator SEES that code instead of one unactionable sentence');
      ok(IR.indexOf('Unable to load methods — Retry') === -1,
        'D6d. the old catch-all "Unable to load methods" is GONE from the page');
    });
  }).then(function () {
    // F1-7N-FB-2A §B moved the PRELOAD TRIGGER from mount to a confirmed Search, because the mount no longer
    // performs a primary read at all and a row can only be expanded AFTER a Search. R6E's guarantee is intact:
    // the catalog is warmed before any expand is possible, and the dedupe still collapses concurrent expands
    // into ONE fetch (proved by D2 above).
    ok(/_irLoadCarrierPlanning_\(\)/.test(IR), 'D. the catalog preload still exists');
    var applySearch = extract(IR, '_irApplySearch_');
    ok(/_irLoadCarrierPlanning_\(\)/.test(applySearch), 'D. and it is PRELOADED on a confirmed Search — warm before any row expand');
    ok(applySearch.indexOf('renderReplenishment()') < applySearch.indexOf('_irLoadCarrierPlanning_()'),
      'D. after the render, so it never blocks the primary table');
    ok(applySearch.indexOf('await _irLoadCarrierPlanning_') === -1, 'D. and is never awaited — it cannot block the first paint');
    runE();
  }).catch(function (err) { console.error('D ASYNC ERROR', err && err.stack || err); fail++; done(); });
})();

// ============================================================ E — Site Confirm temporary bypass + rollback
function runE() {
  section('E. Site Confirm flag — backend-owned, frontend mirror, reversible');
  var KMAPI = require(path.join(ROOT, 'js', 'api', 'km-api-foundation.js'));
  var inst = KMAPI.createDefault();
  eq(inst.requestOrderSiteConfirmRequired(), false, 'E(false). default this round = false (temporary bypass; Send not gated on Site Confirm)');
  eq(inst.setRequestOrderSiteConfirmRequired(true), true, 'E(rollback). setRequestOrderSiteConfirmRequired(true) restores the requirement');
  eq(inst.requestOrderSiteConfirmRequired(), true, 'E(rollback). after rollback the flag reads true → original Site Confirm gate restored');
  var instTrue = KMAPI.createApiFoundation({ requestOrderSiteConfirmRequired: true });
  eq(instTrue.requestOrderSiteConfirmRequired(), true, 'E. deps override honored (single-authority, no hardcoded divergent value)');

  // _roSiteConfirmRequired mirrors the KM.api flag; FAIL-SAFE true when the capability is unavailable.
  (function () {
    var window = { KM: { api: { requestOrderSiteConfirmRequired: function () { return false; } } } };
    var _roSiteConfirmRequired; eval(extract(RO, '_roSiteConfirmRequired') + '\n_roSiteConfirmRequired = _roSiteConfirmRequired;');
    eq(_roSiteConfirmRequired(), false, 'E(false). frontend mirrors backend flag = false');
    window.KM.api.requestOrderSiteConfirmRequired = function () { return true; };
    eq(_roSiteConfirmRequired(), true, 'E(true). frontend mirrors backend flag = true');
    var window2 = {}; var f2; eval('(function(){ var window = window2; ' + extract(RO, '_roSiteConfirmRequired') + '\n f2 = _roSiteConfirmRequired; })();');
    eq(f2(), true, 'E. FAIL-SAFE: capability unavailable → default TRUE (keep the strict original gate)');
  })();

  section('E. Send gating + status label are flag-driven (source)');
  ok(/if \(_roSiteConfirmRequired\(\)\) \{[\s\S]{0,600}confirm all site scopes/.test(RO), 'E(false). Gate 1 (site confirm) is enforced ONLY when _roSiteConfirmRequired()');
  // F1-7N-FB-3B §B: the Send universe is no longer built from _applyRequestOrderFilters at all — that is the
  // DISPLAY authority, and a display control must not truncate a comprehensive business command. The flag-driven
  // behaviour under test is unchanged and now lives in _roSendScopeRows_: the confirmation row-filter is applied
  // ONLY when Site Confirm is required, over the UNFILTERED row universe.
  var scopeRows = extract(RO, '_roSendScopeRows_');
  ok(/_roSiteConfirmRequired\(\) \? all\.filter\(_roIsRowConfirmed\) : all/.test(scopeRows),
    'E(false). the confirmation row-filter is dropped when Site Confirm is not required');
  ok(!/_applyRequestOrderFilters/.test(scopeRows.replace(/\/\/[^\n]*/g, '')),
    'E(false). and the Send universe never consults the DISPLAY filter authority');
  ok(/!_roSiteConfirmRequired\(\)\) \{[\s\S]{0,160}display = 'none'/.test(RO), 'E(false). "No site confirmed yet" label is hidden when Site Confirm is not required');
  // OTHER Send gates remain mandatory (unchanged, still present)
  // R6A1 reworded the empty-eligible message to NO_ELIGIBLE_SUBMITTED_DRAFTS (still proves the positive-line gate — it
  // requires a "positive Order Qty"); the submitted-status + optimistic-token gates are unchanged.
  // F1-7N-FB-3B: the submitted-status gate and the optimistic token both remain (the token now guards the
  // incremental quantity writes rather than a Send-time confirm), and the positive-tier gate moved to the server
  // workset builder, which is where the population is now decided.
  var G66 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '66_api_v1_request_order_send.gs'), 'utf8');
// F1-7N-FB-4E-R4B-R2 - RESTATED FROM THE ARGUMENT TO THE ROUTING. These pinned the exact value passed at
// the call site (a bare SKU). R4B-R2 proved a SKU is not a draft identity - at All level two companies
// share one - so the call sites now pass the full site reference (input.dataset / item). The ROUTING is
// what these lines defend, and it is unchanged; only the completeness of the reference improved.
  ok(/_roIsSubmittedSku_\(item(\.sku)?\)/.test(RO) && /expectedToken/.test(RO),
    'E. other Send gates (submitted-status, optimistic token) remain MANDATORY');
  ok(/tier_zero_or_blank_qty\+\+/.test(G66) && /status_submitted\+\+/.test(G66),
    'E. and the positive-tier + terminal-status gates are enforced server-side, as COUNTED exclusions');
  // backend flag of record exists with the config convention
  var CFG = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');
  ok(/var REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ = false;/.test(CFG) && /function requestOrderSiteConfirmRequired_\(\)/.test(CFG), 'E. backend owner-of-record flag REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ (+ getter) follows the 00_config convention');

  done();
}
