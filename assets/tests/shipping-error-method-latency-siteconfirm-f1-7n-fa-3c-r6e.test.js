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
  ok(/Could not save to the database/.test(html) && /kept locally/.test(html), 'C3. concise user message + kept-locally (retained plan)');
  ok(!/Saved/.test(html), 'C3. the failed save NEVER shows "Saved"');
  ok(/<details/.test(html) && /HEADER_MISSING/.test(html) && /shipping_plan_lines/.test(html), 'C3. collapsed technical disclosure with code + affected table');
  ok(!/AKfyc|token|password|stack/i.test(html), 'C3. no stack / token / secret exposed');
  // a plain-string error still renders (back-compat)
  var e2 = _irMakeDraftSaveError_('some string error', 'shipping_plan_lines', 'fallback');
  eq(e2.message, 'some string error', 'C. a plain-string error is preserved verbatim');
})();

// ============================================================ D — Method dropdown latency / dedupe / states
section('D. Method loading — in-flight dedupe + LOADING/EMPTY/ERROR states');
(function () {
  function _execEsc(v) { return String(v == null ? '' : v); }
  var _irEffectiveWorkspace = function () { return true; };
  var _irCarrierModel = null, _irCarrierSeq = 0, _irCarrierPending = null, _irCarrierStatus = 'IDLE';
  var getWsCalls = { n: 0 }; var deferred = null;
  var window = { KM: { api: { getWorkspace: function () { getWsCalls.n++; return new Promise(function (res) { deferred = res; }); } },
    DB: { adaptInventoryReplenishmentWorkspace: function () { return { getCarrierRateCards: [{ shippingMethod: 'SEA' }], getCarrierLeadTimes: [] }; } } } };
  eval(extract(IR, '_irMethodsState_'));
  eval(extract(IR, '_irLoadCarrierPlanning_'));
  eval(extract(IR, '_execMethodOptionsHtml'));

  eq(_irMethodsState_(), 'LOADING', 'D1. before the catalog resolves → state LOADING');
  eq(_execMethodOptionsHtml([], ''), '<option value="">Loading methods…</option>', 'D1. empty + LOADING → "Loading methods…" (NEVER a false "No matching method")');
  // dedupe: two concurrent loads → ONE getWorkspace
  var p1 = _irLoadCarrierPlanning_(); var p2 = _irLoadCarrierPlanning_();
  eq(getWsCalls.n, 1, 'D2. concurrent expands are COALESCED into exactly ONE getWorkspace fetch');
  deferred({ success: true, data: {} });
  Promise.all([p1, p2]).then(function () {
    eq(_irMethodsState_(), 'LOADED', 'D3. after resolve → LOADED');
    eq(_execMethodOptionsHtml([], ''), '<option value="">No matching method</option>', 'D3. empty + LOADED → "No matching method" (only AFTER the lookup completes)');
    eq(_execMethodOptionsHtml([{ value: 'SEA', label: 'Sea' }], ''), '<option value="">Method…</option><option value="SEA">Sea</option>', 'D3. LOADED with matches → real options');
    // cached re-entry → no new fetch (survives SPA remount via the module var)
    getWsCalls.n = 0; return _irLoadCarrierPlanning_();
  }).then(function () {
    eq(getWsCalls.n, 0, 'D4. a re-entry reuses the cached catalog (0 new fetch) — remount-safe');
    // ERROR state
    _irCarrierModel = null; _irCarrierStatus = 'ERROR';
    eq(_execMethodOptionsHtml([], ''), '<option value="">Unable to load methods — Retry</option>', 'D. ERROR → "Unable to load methods — Retry"');
    // source: mount preloads the catalog in parallel with the primary read
    ok(/_irLoadCarrierPlanning_\(\); \} catch \(e\) \{\} \}\s*\n\s*if \(_irEffectiveWorkspace\(\)\)/.test(IR), 'D. mount PRELOADS the catalog in parallel with the primary read (warm before any expand)');
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
  ok(/_roSiteConfirmRequired\(\)\s*\?\s*_applyRequestOrderFilters[\s\S]{0,120}filter\(_roIsRowConfirmed\)\s*:\s*_applyRequestOrderFilters/.test(RO), 'E(false). the confirmation row-filter is dropped when Site Confirm is not required');
  ok(/!_roSiteConfirmRequired\(\)\) \{[\s\S]{0,160}display = 'none'/.test(RO), 'E(false). "No site confirmed yet" label is hidden when Site Confirm is not required');
  // OTHER Send gates remain mandatory (unchanged, still present)
  ok(/_roIsSubmittedSku_\(item\.sku\)/.test(RO) && /No positive Order Qty/.test(RO) && /expectedToken/.test(RO), 'E. other Send gates (submitted-status, positive line, optimistic token) remain MANDATORY');
  // backend flag of record exists with the config convention
  var CFG = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');
  ok(/var REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ = false;/.test(CFG) && /function requestOrderSiteConfirmRequired_\(\)/.test(CFG), 'E. backend owner-of-record flag REQUEST_ORDER_SITE_CONFIRM_REQUIRED_ (+ getter) follows the 00_config convention');

  done();
}
