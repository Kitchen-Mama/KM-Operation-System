// F1-7N-FB-4G-A1-R1 — PANEL-LOCAL LOADING + METHOD TIMEOUT RECOVERY.
//
// THREE PRODUCTION FINDINGS, THREE ROOT CAUSES, ALL MEASURED ON SHIPPED FUNCTIONS.
//
// (1) THE RECOMMENDATION SUMMARY WAITED SIXTY SECONDS FOR A PANEL IT DOES NOT DEPEND ON. A1 revealed both
//     decision panels in ONE frame. Run on the shipped A1 gate with production's own timings:
//           0:EXPAND      40:gap read settled      60000:carrier settled
//       60000:RECOMMENDATION_SUMMARY_VISIBLE   <- ready at 40 ms, shown at 60 000 ms
//     A1's rule — a panel appears once, complete, never corrected in view — was right; the SCOPE it was
//     applied at was not. The barrier is per panel now.
//
// (2) "Select a valid Country / Marketplace" WITH US / Amazon SELECTED. `_irRecoScopeRequest` preferred the
//     CACHED context model. That model is computed at mount, when the workspace read has not landed, so
//     `_irWsGet('getMarketplaces')` is [] and the selected marketplace_id cannot be resolved: company and
//     marketplace come out blank and the model is cached that way. Nothing recomputes it when the read
//     lands, so Search asks `toScopeRequest` about the MOUNT scope, gets null, and the panel reports
//     CONTEXT_NOT_READY. One recompute at that moment yields {ResUS, US, Amazon}. Both measured.
//
// (3) METHOD_CATALOGUE_ERROR · REQUEST_TIMEOUT. The registry's read is
//     getWorkspace('inventoryReplenishment', { include: { carrierPlanning: true } }) — the SAME action
//     Search already issued, differing only by the flag. The workspace is a FULL-SET raw passthrough of
//     nineteen tables, so obtaining two small carrier reference tables re-read and re-transferred all
//     nineteen a second time, and that second copy reached the transport's 60 000 ms read bound. The
//     include now rides on the read Search was already making, and the result seeds the registry: one
//     request instead of two, and the timeout path leaves the normal route to an Execution Plan entirely.
//
// Run: node assets/tests/panel-local-readiness-and-method-timeout-f1-7n-fb-4g-a1-r1.test.js

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
var MRSRC = read('assets/js/core/method-registry.js');
var CSS = read('assets/css/pages/inventory-replenishment.css');
var INDEX = read('index.html');
var G60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var CMP = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var MR = require(path.join(ROOT, 'assets/js/core/method-registry.js'));
var R = CMP.IRPlanningReveal;
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function sliceMarked(src, a, b) {
  var i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0) throw new Error('markers not found');
  return src.slice(i, j);
}
// Every mutant is anchored INSIDE one named function, and a mutation that does not apply THROWS.
function mutateFn(src, name, find, replace) {
  // A multi-line find string written with LF cannot match a CRLF source, and the throw that follows would then
  // name a target that IS present - a broken probe wearing the costume of a real finding. Both sides are
  // normalised to the source's own line ending so a mutation fails only for a reason worth reading.
  var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  var eol = src.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;
  function fix(t) { return String(t).split(CR + LF).join(LF).split(LF).join(eol); }
  find = fix(find); replace = fix(replace);
  var body = extractFn(src, name);
  if (body.indexOf(find) < 0) throw new Error('mutation target absent in ' + name + ': ' + find);
  return src.replace(body, body.replace(find, replace));
}
function moduleFrom(src) {
  return new Function('var module = { exports: {} }; var window; ' + src + ' return module.exports;')();
}

// ================================================================================================================
// THE DETERMINISTIC SCHEDULER. The queue is re-ordered on EVERY step, because reveal frames are queued during
// the run: sorting once and shifting would report a frame's time as the time of the last event instead of its
// own, which is a measurement artefact that silently weakens every timing assertion (A1 shipped that bug).
// ================================================================================================================
function Sched() {
  var q = [], t = 0, log = [], seq = 0;
  return {
    now: function () { return t; },
    at: function (w, fn) { q.push({ w: w, fn: fn, i: seq++ }); },
    run: function () {
      while (q.length) {
        var b = 0;
        for (var i = 1; i < q.length; i++) if ((q[i].w < q[b].w) || (q[i].w === q[b].w && q[i].i < q[b].i)) b = i;
        var j = q.splice(b, 1)[0]; t = Math.max(t, j.w); j.fn();
      }
    },
    mark: function (e) { log.push({ t: t, e: e }); },
    at_: function (e) { for (var i = 0; i < log.length; i++) if (log[i].e === e) return log[i].t; return null; },
    count: function (e) { var n = 0; for (var i = 0; i < log.length; i++) if (log[i].e === e) n++; return n; },
    events: function () { return log.map(function (x) { return x.t + ':' + x.e; }); }
  };
}

var CTX = { sku: 'CO1100-R', scopeKey: 'resus|us|amazon', searchGen: 7, rowGen: 3 };

// Two independent panel gates, driven with explicit settle times. Returns per-panel visible-at and render count.
function expand(opts, Rev) {
  Rev = Rev || R;
  var S = Sched();
  var out = { renders: { reco: 0, exec: 0 }, frames: { reco: 0, exec: 0 } };
  function gate(nm, key, ev) {
    return Rev.createPanelGate({
      name: nm,
      frame: function (cb) { S.at(S.now(), function () { out.frames[key]++; cb(); }); },
      now: S.now,
      onReveal: function (s) { out.renders[key]++; S.mark(ev); S.mark(ev + '=' + s.readiness.state + (s.readiness.code ? '/' + s.readiness.code : '')); }
    });
  }
  var rg = gate('recommendation', 'reco', 'RECO_VISIBLE');
  var eg = gate('execution', 'exec', 'EXEC_VISIBLE');
  S.mark('EXPAND');
  var g1 = rg.begin(CTX), g2 = eg.begin(CTX);
  rg.report(g1, Rev.recommendationReadiness({ mode: 'materialized', status: 'LOADING' }), CTX);
  eg.report(g2, Rev.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }), CTX);
  if (opts.recoAt != null) S.at(opts.recoAt, function () { S.mark('RECO_SETTLED'); rg.report(g1, Rev.recommendationReadiness(opts.recoInput || { mode: 'materialized', status: 'READY' }), CTX); });
  if (opts.execAt != null) S.at(opts.execAt, function () { S.mark('EXEC_SETTLED'); eg.report(g2, Rev.executionReadiness(opts.execInput || { readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: true }), CTX); });
  S.run();
  out.S = S; out.rg = rg; out.eg = eg;
  return out;
}

// ================================================================================================================
// A MINIMAL DOM — enough to run the shipped paints and the shipped Method rebuild for real.
// ================================================================================================================
function El(id, cls) {
  this.id = id || ''; this.className = cls || ''; this.innerHTML = ''; this.attrs = {};
  this.children = []; this.options = []; this.selectedIndex = -1; this.value = ''; this.disabled = false;
  this.parentNode = null;
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { this.children.push(c); c.parentNode = this; };
El.prototype.querySelector = function (sel) { var r = this.querySelectorAll(sel); return r.length ? r[0] : null; };
El.prototype.querySelectorAll = function (sel) {
  var out = [], m = /^\[data-field="([^"]+)"\]$/.exec(sel), c = /^\.([A-Za-z0-9_-]+)$/.exec(sel);
  var walk = function (n) {
    n.children.forEach(function (ch) {
      if (m && ch.getAttribute('data-field') === m[1]) out.push(ch);
      if (c && (' ' + ch.className + ' ').indexOf(' ' + c[1] + ' ') >= 0) out.push(ch);
      walk(ch);
    });
  };
  walk(this);
  return out;
};
function Doc() { this.byId = {}; this.all = []; }
Doc.prototype.add = function (id, cls) { var e = new El(id, cls); if (id) this.byId[id] = e; this.all.push(e); return e; };
Doc.prototype.getElementById = function (id) { return this.byId[id] || null; };
Doc.prototype.querySelector = function () { return null; };
Doc.prototype.querySelectorAll = function () { return []; };

// ================================================================================================================
section('§3 / §11.1–§11.3 — EACH PANEL ON ITS OWN CLOCK');
// ================================================================================================================
(function () {
  // The exact production case.
  var r = expand({ recoAt: 40, recoInput: { mode: 'materialized', status: 'READY' },
    execAt: 60000, execInput: { readModelReady: true, hydrationInFlight: false, catalogue: 'ERROR',
      error: { code: 'REQUEST_TIMEOUT', message: 'No answer arrived within 60s.' }, hasRoutes: true } });
  eq(r.S.at_('RECO_VISIBLE'), 40, 'A1  §11.1 recommendation ready at 40 ms is VISIBLE at 40 ms — not 60 000');
  eq(r.S.at_('EXEC_VISIBLE'), 60000, 'A2  and the Execution Plan settles on its own clock, at its own timeout');
  ok(r.S.at_('EXEC_VISIBLE=ERROR/REQUEST_TIMEOUT') === 60000,
    'A3  §3 the Execution Plan states a NAMED timeout — not an empty plan and not a permanent skeleton');
  eq([r.renders.reco, r.renders.exec], [1, 1], 'A4  each panel rendered exactly once');
  // The number this round exists for.
  eq(60000 - r.S.at_('RECO_VISIBLE'), 59960, 'A5  59 960 ms of avoidable wait removed from the Recommendation Summary');
})();
(function () {
  var r = expand({ recoAt: 2000, execAt: 300 });
  eq([r.S.at_('EXEC_VISIBLE'), r.S.at_('RECO_VISIBLE')], [300, 2000],
    'B1  §11.2 recommendation slow, execution fast — the Execution Plan does NOT wait for it');
  eq([r.renders.reco, r.renders.exec], [1, 1], 'B2  still one render each');
})();
(function () {
  var r = expand({ recoAt: 400, execAt: 900 });
  eq([r.S.at_('RECO_VISIBLE'), r.S.at_('EXEC_VISIBLE')], [400, 900], 'C1  §11.3 both succeed, each at its own ready time');
  eq([r.renders.reco, r.renders.exec, r.frames.reco, r.frames.exec], [1, 1, 1, 1],
    'C2  §11.3 one render and one frame per panel — no half-built paint followed by a correction');
})();
(function () {
  // reveal = readyAt + one frame, per panel, across an ordering matrix rather than once.
  var okAll = [[10, 200], [200, 10], [77, 77], [0, 0], [5, 60000]].every(function (c) {
    var r = expand({ recoAt: c[0], execAt: c[1] });
    return r.S.at_('RECO_VISIBLE') === c[0] && r.S.at_('EXEC_VISIBLE') === c[1];
  });
  ok(okAll, 'C3  §9 recommendationReadyAt / executionReadyAt each + one frame, in every ordering');
})();

// ================================================================================================================
section('§5 — THE SCOPE, MEASURED LAYER BY LAYER');
// ================================================================================================================
var SCOPE = (function () {
  var DOM = { replenCountry: { value: 'US' }, replenMarketplace: { value: 'MP-US-AMZ' } };
  var MPS = [{ marketplaceId: 'MP-US-AMZ', company: 'ResUS', country: 'US', marketplace: 'Amazon', fulfillmentModel: 'FBA' }];
  var loaded = { v: false };
  var src = [
    sliceMarked(PAGE, '// __IRCTX_START__', '// __IRCTX_END__'),
    extractFn(PAGE, '_replenSelectedScope'), extractFn(PAGE, '_irctxWarehouses'),
    extractFn(PAGE, '_irctxScope'), extractFn(PAGE, '_irctxEligible'),
    'var _irctxLastContext = null;',
    extractFn(PAGE, 'updateReplenRecoContext'), extractFn(PAGE, '_irRecoScopeRequest'),
    'OUT = { req: _irRecoScopeRequest, scope: _replenSelectedScope, update: updateReplenRecoContext };'
  ].join(String.fromCharCode(10));
  var api = new Function('document', 'window', '_replenDemoOn', '_irWsGet', '_irInternalContext',
    'var OUT;' + src + 'return OUT;')(
      { getElementById: function (id) { return DOM[id] || null; } }, {},
      function () { return false; },
      function (n) { return (!loaded.v) ? [] : (n === 'getMarketplaces' ? MPS : []); },
      { destinationWarehouseId: null, calculationMonth: null, planningCycle: null });
  return { api: api, loaded: loaded, DOM: DOM };
})();
(function () {
  // MOUNT: initReplenRecoContext() computes the context BEFORE the workspace read lands.
  SCOPE.loaded.v = false;
  SCOPE.api.update();
  eq(SCOPE.api.scope(), { company: '', country: 'US', marketplace: '', marketplaceId: 'MP-US-AMZ' },
    'S1  at mount the selected marketplace_id cannot be resolved — the read model is empty');
  // The workspace read lands. NOTHING recomputes the cached context.
  SCOPE.loaded.v = true;
  eq(SCOPE.api.scope(), { company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MP-US-AMZ' },
    'S2  once it lands the live scope IS {ResUS, US, Amazon} — the selectors were never wrong');
  eq(SCOPE.api.req(), { company: 'ResUS', country: 'US', marketplace: 'Amazon' },
    'S3  §5 and _irRecoScopeRequest now returns it — the stale mount-time cache is no longer preferred');
})();
(function () {
  // The pre-round shape, executed: preferring the cache returns null forever.
  var mutated = mutateFn(PAGE, '_irRecoScopeRequest',
    'var model = (typeof updateReplenRecoContext === \'function\') ? updateReplenRecoContext() : _irctxLastContext;',
    'var model = _irctxLastContext || ((typeof updateReplenRecoContext === \'function\') ? updateReplenRecoContext() : null);');
  var DOM = { replenCountry: { value: 'US' }, replenMarketplace: { value: 'MP-US-AMZ' } };
  var MPS = [{ marketplaceId: 'MP-US-AMZ', company: 'ResUS', country: 'US', marketplace: 'Amazon' }];
  var loaded = false;
  var src = [
    sliceMarked(PAGE, '// __IRCTX_START__', '// __IRCTX_END__'),
    extractFn(mutated, '_replenSelectedScope'), extractFn(mutated, '_irctxWarehouses'),
    extractFn(mutated, '_irctxScope'), extractFn(mutated, '_irctxEligible'),
    'var _irctxLastContext = null;',
    extractFn(mutated, 'updateReplenRecoContext'), extractFn(mutated, '_irRecoScopeRequest'),
    'OUT = { req: _irRecoScopeRequest, update: updateReplenRecoContext };'
  ].join(String.fromCharCode(10));
  var api = new Function('document', 'window', '_replenDemoOn', '_irWsGet', '_irInternalContext',
    'var OUT;' + src + 'return OUT;')(
      { getElementById: function (id) { return DOM[id] || null; } }, {},
      function () { return false; },
      function (n) { return (!loaded) ? [] : (n === 'getMarketplaces' ? MPS : []); },
      { destinationWarehouseId: null, calculationMonth: null, planningCycle: null });
  api.update();            // MOUNT
  loaded = true;           // the read lands; nothing recomputes
  eq(api.req(), null,
    'S4  §5 the PRE shape returns null even with US/Amazon selected — this is the exact cause of the message');
  eq(R.recommendationReadiness({ mode: 'materialized', status: 'CONTEXT_NOT_READY' }).code, 'INVALID_SCOPE',
    'S5  and a null scope is the ONLY thing that produces INVALID_SCOPE');
})();
(function () {
  // §5 — the six outcomes must stay six. A timeout is not a scope problem.
  var C = R.CODES;
  eq(R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'REQUEST_TIMEOUT' } }).code, C.REQUEST_TIMEOUT, 'S6  REQUEST_TIMEOUT stays REQUEST_TIMEOUT');
  eq(R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'BACKEND_BUSINESS_REJECTION' } }).code, C.BACKEND_BUSINESS_REJECTION, 'S7  a backend refusal stays a refusal');
  eq(R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'STALE_SCOPE_ANSWER' } }).code, C.STALE_SCOPE, 'S8  a stale answer stays stale');
  eq(R.recommendationReadiness({ mode: 'materialized', status: 'EMPTY' }).code, C.NO_DATA, 'S9  §11.5 a scope with no stored rows is TERMINAL no-data');
  eq(R.recommendationReadiness({ mode: 'materialized', status: 'CONTEXT_NOT_READY' }).code, C.INVALID_SCOPE, 'S10 an unresolvable scope is INVALID_SCOPE');
  var codes = ['REQUEST_TIMEOUT', 'BACKEND_BUSINESS_REJECTION', 'STALE_SCOPE_ANSWER', 'HTTP_TRANSPORT_ERROR'].map(function (c) {
    return R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: c } }).code;
  });
  ok(codes.indexOf('INVALID_SCOPE') === -1,
    'S11 §11.7 NO transport or backend failure is ever reported as "Select a valid Country / Marketplace"');
  ok(codes.every(function (c, i) { return i === 0 || c !== codes[0] || codes[0] === c; }) && codes[0] !== codes[1],
    'S12 and the failures keep their distinct kinds rather than collapsing into one sentence');
  var errs = R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'REQUEST_TIMEOUT', message: 'No answer arrived within 60s.' } });
  eq([errs.state, errs.error.code], ['ERROR', 'REQUEST_TIMEOUT'], 'S13 §5 and the typed error is CARRIED, never discarded');
})();
(function () {
  // §11.4 — a legitimate 0 is data. The owner is invariant to every quantity it could be handed.
  var bare = R.recommendationReadiness({ mode: 'materialized', status: 'READY' });
  eq([R.recommendationReadiness({ mode: 'materialized', status: 'READY', rows: [{ d90_suggested_qty: 0 }], total: 0, gapQty: 0 }),
      R.recommendationReadiness({ mode: 'materialized', status: 'READY', rows: [{ d90_suggested_qty: 800 }], total: 800, gapQty: 900 })],
     [bare, bare], 'S14 §11.4 the verdict is invariant to every quantity — a stored 0 cannot make it EMPTY');
  var matNum = new Function('return ' + extractFn(PAGE, '_irMatNum').replace('function _irMatNum', 'function') + ';')();
  eq([matNum(0), matNum(''), matNum(null), matNum(5)], [0, null, null, 5], 'S15 and a stored 0 survives the value path as 0');
})();

// ================================================================================================================
section('§6 — THE DUPLICATE WORKSPACE READ, AND THE TIMEOUT IT CAUSED');
// ================================================================================================================
(function () {
  // The evidence chain, asserted against the source rather than described.
  ok(/carrier_lead_times[^\n]*include: 'carrierPlanning'/.test(G60) && /carrier_rate_cards[^\n]*include: 'carrierPlanning'/.test(G60),
    'T1  the two carrier tables are INCLUDE-gated on the SAME workspace action the page already calls');
  var tables = (G60.match(/\{ name: '[a-z_]+'/g) || []).length;
  ok(tables >= 19, 'T2  and that action is a FULL-SET passthrough of ' + tables + ' tables — the page\'s most expensive read');
  var wsRefresh = code(extractFn(PAGE, '_irWorkspaceRefresh_'));
  // RESTATED (F1-7N-FC-1B-E3-R4): pinned verbatim, so an unrelated new payload field (`recentWindow`) broke an
  // assertion about the CARRIER include. What T3 means is that the include rides on the existing read and is
  // opt-in, which is a property of the conditional rather than of the literal's full contents.
  // RESTATED AGAIN (F1-7N-FC-1B-E3-R4-A1). T3 recorded a TRADE, and live measurement reversed which side is
  // cheaper. The include rode on the primary read because the alternative was a second full-table read; the
  // workspace now accepts a table subset, so the catalogue is two sheets and the screen stops waiting for it.
  // What T3 was really protecting — the Execution Plan's catalogue is never obtained by re-reading nineteen
  // unrelated tables — is now true by a stronger route, and that is what is checked.
  ok(!/carrierPlanning/.test(wsRefresh),
    'T3  §6 the read Search waits on no longer asks for carrier reference data at all');
  var _mreg2 = read('assets/js/core/method-registry.js');
  ok(/only: \['carrier_lead_times', 'carrier_rate_cards'\]/.test(_mreg2),
    'T3a and the catalogue read names its two tables, so it can never again be a full-set read');
  // RESTATED (A2-R1-R3): the primary read now also declares its dispatch owner, so the argument list is no
  // longer one frozen literal. What matters is that a PRIMARY read — not the readback — carries the include.
  ok(/_irWorkspaceRefresh_\(\{ carrier: true,[\s\S]{0,200}owner: '(SEARCH_CLICK|COALESCED_BOOTSTRAP|RESTORED_MOUNT_REVALIDATION)'/.test(code(PAGE)),
    'T3a and the PRIMARY read is the caller that asks for it');
  // NARROWED DELIBERATELY: the post-write readback keeps its exact previous payload, so the separate bounded-
  // readback deferral recorded by 7M-B / 7M-B2 is untouched by this round.
  ok(/function _irAfterWrite\(cb\)[\s\S]{0,600}_irWorkspaceRefresh_\(/.test(code(PAGE)) &&
     !/function _irAfterWrite\(cb\)[\s\S]{0,600}carrier:\s*true/.test(code(PAGE)),
    'T4  and the post-write readback deliberately does NOT ask — a readback reconciles a write, not reference data');
  var transport = read('assets/js/api/km-transport.js');
  ok(/readTimeoutMs > 0\) \? deps\.readTimeoutMs : 60000/.test(code(transport)),
    'T5  the 60 000 ms bound is the shared transport read timeout — the owner, located');
  ok(!/readTimeoutMs\s*[:=]\s*(1[2-9]|[2-9])\d{4,}/.test(code(PAGE)),
    'T6  §6 and it was NOT simply made longer — the page raises no timeout anywhere');
})();
(function () {
  // ADOPTION: a catalogue the page already holds costs ZERO requests.
  var reads = 0;
  var reg = MR.create({ read: function () { reads++; return Promise.resolve({ success: true, data: {} }); },
    adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
  var SC = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
  var adopted = reg.adopt(SC, { getCarrierRateCards: [{ shipping_method: 'sea' }], getCarrierLeadTimes: [{ shipping_method: 'Sea' }] });
  eq([adopted, reg.isLoaded(SC), reg.requestCount(), reads], [true, true, 0, 0],
    'T7  §6 adopt() seeds the catalogue from the workspace payload — ZERO requests, and requestCount stays 0');
  eq(reg.getRateCards(SC).length, 1, 'T7a and the adopted cards are the ones the picker then resolves against');
  return reg.ensureLoaded(SC).then(function () {
    eq([reg.requestCount(), reads], [0, 0], 'T8  §11.14 a later ensureLoaded on an adopted scope is a CACHE HIT — still zero');
  });
})();
ok(/_irReadModelHasCarrier/.test(code(extractFn(PAGE, '_irAdoptCarrierCatalogue_'))),
  'T9  adoption is gated on the read having ACTUALLY requested the include — an empty payload is never adopted as a catalogue');
(function () {
  var reg = MR.create({ read: function () { return Promise.resolve({ success: true, data: {} }); },
    adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
  eq(reg.adopt({ company: 'c' }, null), false, 'T9a and adopt(null) refuses rather than installing an empty catalogue');
})();

// ================================================================================================================
section('§6 / §11.10–§11.13 — TIMEOUT, THEN RETRY');
// ================================================================================================================
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'ERROR', error: { code: 'REQUEST_TIMEOUT' }, hasRoutes: true }),
   { state: 'ERROR', code: 'REQUEST_TIMEOUT', error: { code: 'REQUEST_TIMEOUT' } },
  'X1  §11.10 a catalogue timeout is a TERMINAL, typed Execution error');
(function () {
  var retry = code(extractFn(PAGE, 'retryExecutionMethods'));
  ok(/_irRetryMethodRegistry_/.test(retry), 'X2  §11.11 Retry Methods goes through the registry\'s own single retry');
  ok(!/_irWorkspaceRefresh_|getWorkspace|loadInventoryGap_|refreshInventoryGapAfterRecalc_|location\.reload/.test(retry),
    'X3  §11.12 it does NOT re-read the workspace and does NOT re-read the Recommendation');
  // The declaration line carries the function's own name, so a bare name search matched ITSELF - a probe
  // that can never fail. The body alone is what can contain a recursive call.
  var retryBody = retry.slice(retry.indexOf('{') + 1);
  ok(!/setTimeout|setInterval|requestIdleCallback/.test(retryBody) && !/retryExecutionMethods\s*\(/.test(retryBody),
    'X4  §11.13 and it schedules nothing and never re-enters itself — one request per click');
  ok(!/initializeShippingAllocation|_renderExecutionRoute|innerHTML\s*=/.test(retry),
    'X5  §7 it rebuilds no route and rewrites no panel — only the Method options and the ETAs are refreshed in place');
  var retryReco = code(extractFn(PAGE, 'retryRecommendationSummary'));
  ok(!/_irRetryMethodRegistry_|initializeShippingAllocation|shipping-methods-/.test(retryReco),
    'X6  and the Recommendation retry touches nothing in the Execution Plan');
})();
(function () {
  var reads = 0;
  var reg = MR.create({ read: function () { reads++; return Promise.resolve({ success: false, errors: [{ code: 'REQUEST_TIMEOUT', message: 'No answer arrived within 60s.' }] }); },
    adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
  var SC = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
  return reg.ensureLoaded(SC).then(function () {
    eq([reads, reg.getError(SC).code], [1, 'REQUEST_TIMEOUT'], 'X7  a failed catalogue keeps the REAL code');
    return reg.ensureLoaded(SC);
  }).then(function () {
    eq(reads, 1, 'X8  §11.13 and a failed scope does NOT retry itself — no automatic loop');
    return reg.retry(SC);
  }).then(function () {
    eq(reads, 2, 'X9  §11.11 an EXPLICIT retry issues exactly ONE further request');
    return reg.retry(SC);
  }).then(function () {
    eq(reads, 3, 'X9a and a second click issues exactly one more — never a burst');
  });
})();

// ================================================================================================================
section('§7 — THE OPERATOR\'S SECOND ROUTE IS NOT THIS ROUND\'S TO TOUCH');
// ================================================================================================================
(function () {
  // Route 1 persisted (CN侑鑫 -> Amazon, 800, sea). Route 2 added by the operator (800). Total 1600.
  var doc = new Doc();
  doc.add('ir-reveal-exec-CO1100-R');
  var card = doc.add('execution-plan-CO1100-R');
  var list = doc.add('shipping-methods-CO1100-R', 'exec-routes-list');
  var r1 = new El('', 'exec-route-row'); r1.setAttribute('data-line-id', 'SADL-K2-16F4E4F9');
  var r2 = new El('', 'exec-route-row');
  list.appendChild(r1); list.appendChild(r2);
  card.innerHTML = 'BUILT';
  var built = 0;
  var paint = new Function('document', '_irExecPlanCardInnerHtml_', '_irRevealErrorHtml_',
    'initializeShippingAllocation', '_irRevealSkuData_', '_irRevealSyncActionAvailability_', '_irUpdateHScrollGutter_',
    extractFn(PAGE, '_irExecRevealPaint_') + ' return _irExecRevealPaint_;')(
      doc, function () { return 'REBUILT'; }, function () { return ''; },
      function () { built++; }, function () { return {}; }, function () {}, function () {});
  paint({ sku: 'CO1100-R', readiness: { state: 'READY', code: '', error: null }, frameId: 2 });
  eq([card.innerHTML, built, list.children.length], ['BUILT', 0, 2],
    'P1  §7 a panel that already holds routes is NEVER rebuilt — both routes survive, and nothing is re-seeded');
  ok(/if \(document\.getElementById\('shipping-methods-' \+ sku\)\) return;/.test(code(extractFn(PAGE, '_irExecRevealPaint_'))),
    'P1a and that guard is explicit, not incidental');
  // The same paint on a panel that has NOT been built does build it, once.
  var doc2 = new Doc();
  doc2.add('ir-reveal-exec-CO1100-R'); var card2 = doc2.add('execution-plan-CO1100-R');
  var built2 = 0;
  var paint2 = new Function('document', '_irExecPlanCardInnerHtml_', '_irRevealErrorHtml_',
    'initializeShippingAllocation', '_irRevealSkuData_', '_irRevealSyncActionAvailability_', '_irUpdateHScrollGutter_',
    extractFn(PAGE, '_irExecRevealPaint_') + ' return _irExecRevealPaint_;')(
      doc2, function () { return 'REBUILT'; }, function () { return ''; },
      function () { built2++; }, function () { return {}; }, function () {}, function () {});
  paint2({ sku: 'CO1100-R', readiness: { state: 'READY', code: '', error: null }, frameId: 1 });
  eq([card2.innerHTML, built2], ['REBUILT', 1], 'P2  a panel that holds nothing yet IS built — exactly once');
})();
(function () {
  // §7 — the shipped Method rebuild preserves a route the operator edited, and does not touch its siblings.
  var doc = new Doc();
  var list = doc.add('shipping-methods-CO1100-R');
  function route(method, dirty) {
    var row = new El('', 'exec-route-row');
    var from = new El('', ''); from.setAttribute('data-field', 'source_warehouse_id'); from.value = 'WH-TW-CN-FACTORY-YOUXIN';
    from.options = [{ getAttribute: function (a) { return a === 'data-wh-country' ? 'CN' : ''; } }]; from.selectedIndex = 0;
    var to = new El('', ''); to.setAttribute('data-field', 'destination_warehouse_id');
    to.options = [{ getAttribute: function (a) { return a === 'data-wh-type' ? 'MARKETPLACE_DESTINATION' : ''; } }]; to.selectedIndex = 0;
    var qty = new El('', ''); qty.setAttribute('data-field', 'qty'); qty.value = '800';
    var m = new El('', ''); m.setAttribute('data-field', 'shipping_method'); m.value = method;
    row.setAttribute('data-method-persisted', 'sea');
    if (dirty) row.setAttribute('data-method-dirty', '1');
    [from, to, qty, m].forEach(function (e) { row.appendChild(e); });
    list.appendChild(row);
    return { row: row, m: m, qty: qty };
  }
  var persisted = route('sea', false);
  var added = route('air', true);          // the operator chose Air on the route they added
  var rebuild = new Function('document', '_replenSelectedScope', '_execResolveMethods', '_execMethodRouteCtx',
    '_execMethodOptionsHtml', 'window',
    extractFn(PAGE, '_execRebuildMethodOptions') + ' return _execRebuildMethodOptions;')(
      doc,
      function () { return { company: 'ResUS', country: 'US', marketplace: 'Amazon' }; },
      function () { return { status: 'READY', methods: [{ value: 'sea', label: 'S' }, { value: 'air', label: 'A' }] }; },
      function () { return {}; },
      function (res, sel) { return String(sel); },
      { IRService: CMP.IRService });
  rebuild('CO1100-R');
  eq([persisted.m.value, added.m.value], ['sea', 'air'],
    'P3  §11.21 a catalogue repaint keeps the persisted service AND the operator\'s own chosen method');
  eq([persisted.qty.value, added.qty.value, list.children.length], ['800', '800', 2],
    'P4  §11.18/§11.19 both routes survive with their quantities — Total stays 1600, nothing is merged');
  ok(!/dedup|distinct|uniqueBySku|bySku\[/.test(code(extractFn(PAGE, '_execRebuildMethodOptions'))),
    'P5  §7 no per-sku de-duplication rule exists on this path — two legitimate routes stay two');
})();
ok(!/DEDUPE_BY_SKU|dedupeRoutesBySku|uniqueRoutesBySku/.test(code(PAGE)),
  'P6  §7 and none was introduced anywhere on the page');

// ================================================================================================================
section('§4 / §11.8, §11.15–§11.17 — GENERATIONS');
// ================================================================================================================
(function () {
  var painted = [];
  var g = R.createPanelGate({ name: 'recommendation', frame: function (cb) { cb(); }, onReveal: function (s) { painted.push(s.sku); } });
  var g1 = g.begin({ sku: 'SKU-A', scopeKey: 's', searchGen: 1, rowGen: 1 });
  var g2 = g.begin({ sku: 'SKU-B', scopeKey: 's', searchGen: 1, rowGen: 2 });
  eq(g.report(g1, { state: 'READY' }, { sku: 'SKU-A' }), { accepted: false, reason: 'STALE_GENERATION' },
    'G1  §11.16 a response for the previous SKU is refused');
  g.report(g2, { state: 'READY' }, { sku: 'SKU-B' });
  eq(painted, ['SKU-B'], 'G1a and only the row actually open is painted');
})();
(function () {
  var g = R.createPanelGate({ name: 'execution', frame: function (cb) { cb(); }, onReveal: function () { n++; } });
  var n = 0;
  var gen = g.begin({ sku: 'CO1100-R', scopeKey: 'resus|us|amazon', searchGen: 7, rowGen: 3 });
  eq(g.report(gen, { state: 'READY' }, { sku: 'CO1100-R', scopeKey: 'restw|jp|amazon', searchGen: 7, rowGen: 3 }),
     { accepted: false, reason: 'STALE_SCOPE' }, 'G2  §11.17 an answer from a station the user has left is refused');
  eq(g.report(gen, { state: 'READY' }, { sku: 'CO1100-R', scopeKey: 'resus|us|amazon', searchGen: 8, rowGen: 3 }),
     { accepted: false, reason: 'STALE_SEARCH' }, 'G3  §11.8 an answer from a previous SEARCH is refused');
  eq(g.report(gen, { state: 'READY' }, { sku: 'CO1100-R', scopeKey: 'resus|us|amazon', searchGen: 7, rowGen: 4 }),
     { accepted: false, reason: 'STALE_ROW' }, 'G4  §4 and an answer from a previous expanded-row generation is refused');
  eq(n, 0, 'G4a none of them painted anything');
})();
(function () {
  var g = R.createPanelGate({ name: 'execution', frame: function (cb) { cb(); }, onReveal: function () { n++; } });
  var n = 0;
  var gen = g.begin({ sku: 'X', scopeKey: 's' });
  g.abandon();
  eq([g.report(gen, { state: 'READY' }, null).reason, g.state(), n], ['ABANDONED', 'ABANDONED', 0],
    'G5  §11.15 after a collapse a late response has no generation to land in — the row does not re-open');
})();
(function () {
  var deferred = null, n = 0;
  var g = R.createPanelGate({ name: 'execution', frame: function (cb) { deferred = cb; }, onReveal: function () { n++; } });
  var gen = g.begin({ sku: 'X', scopeKey: 's' });
  g.report(gen, { state: 'READY' }, null);
  g.abandon();
  deferred();
  eq(n, 0, 'G5a and a reveal already scheduled is dropped if the row closes before its frame runs');
})();
ok(/_irRowGen\+\+/.test(code(extractFn(PAGE, '_irRevealAbandon_'))) &&
   /rowGen: _irRowGen/.test(code(extractFn(PAGE, '_irRevealCtx_'))),
  'G6  §4 the expanded-row generation is bumped by every collapse and carried on every report');
ok(/searchGen: _irRevealSearchGen_\(\)/.test(code(extractFn(PAGE, '_irRevealCtx_'))),
  'G6a and the search generation travels with it');

// ================================================================================================================
section('§1 / §8 — THE PANELS ARE NOT COUPLED, AND NOTHING ELSE IS DELAYED');
// ================================================================================================================
(function () {
  var reco = code(extractFn(PAGE, '_irRecoReadinessInput_'));
  ok(!/methodRegistry|catalogue|_irDraftHydrateInFlight|_irReadModel|leadTime|Eta/i.test(reco),
    'D1  §1 the Recommendation\'s readiness reads NOTHING about hydration, warehouses, the catalogue, lead times or the plan');
  var pump = code(extractFn(PAGE, '_irRevealPumpReco_'));
  ok(!/_irExecGate_|execution/i.test(pump), 'D1a and its pump cannot consult the Execution gate — it holds no reference to it');
  var epump = code(extractFn(PAGE, '_irRevealPumpExec_'));
  ok(!/_irRecoGate_|recommendation/i.test(epump), 'D1b nor the Execution pump the Recommendation gate');
  ok(!/createGate\b/.test(code(CMPSRC)) && /createPanelGate/.test(code(CMPSRC)),
    'D2  §4 the joint cross-panel gate is GONE — there is no API left that requires two panels to be ready');
  var gateSrc = code(extractFn(CMPSRC, 'createPanelGate'));
  ok(!/partner|other|both/i.test(gateSrc), 'D2a a panel gate has no notion of a partner at all');
})();
(function () {
  var html = new Function('_irRevealRecoSkeletonHtml_', '_irExecPlanCardInnerHtml_',
    extractFn(PAGE, '_irDecisionAreaHtml_') + ' return _irDecisionAreaHtml_;')(
      function () { return '<div class="ir-skel ir-skel--table"></div>'; },
      function (sku, ready) { return ready ? 'READY' : '<div class="ir-skel ir-skel--routes"></div>'; })('CO1100-R');
  ok(/data-ir-reveal="recommendation"[^>]*data-reveal-state="pending"/.test(html) &&
     /data-ir-reveal="execution"[^>]*data-reveal-state="pending"/.test(html),
    'D3  §8 the two panels are SEPARATE reveal containers, each with its own state');
  ok(/ir-skel--table/.test(html) && /ir-skel--routes/.test(html), 'D3a each shows its own content-shaped skeleton immediately');
  ok(!/<select/.test(html) && !/<input/.test(html) && !/Loading methods/.test(html) && !/allocation-total-/.test(html),
    'D3b §8 and the pending Execution Plan shows no select, no input, no "Loading methods…" and no fabricated 0 total');
})();
(function () {
  var toggle = code(extractFn(PAGE, 'toggleReplenRow'));
  ok(/initSalesTrendChart/.test(toggle) && !/initSalesTrendChart/.test(code(extractFn(PAGE, '_irExecRevealPaint_')) + code(extractFn(PAGE, '_irRecoRevealPaint_'))),
    'D4  §8 Sales Trend is behind neither barrier');
  ok(/replen-card--stock/.test(PAGE) && !/replen-card--stock|replen-card--forecast|replen-card--upcoming|replen-card--achievement/.test(code(extractFn(PAGE, '_irDecisionAreaHtml_'))),
    'D4a Stock / Forecast / Upcoming Event / Monthly Achievement are outside both containers');
})();
(function () {
  var avail = code(extractFn(PAGE, '_irRevealSyncActionAvailability_'));
  ok(/data-ir-reveal="execution"\]\[data-reveal-state="pending"/.test(avail) &&
     /data-ir-reveal="execution"\]\[data-reveal-state="error"/.test(avail),
    'D5  §11.23 Submit Plan is disabled while the Execution Plan is a shell OR a named failure');
  ok(!/data-ir-reveal="recommendation"/.test(avail),
    'D5a and a RECOMMENDATION failure does not disable it — Submit has never read the Recommendation Summary');
})();

// ================================================================================================================
section('§9 — NO TIMER, NO POLL, NO SEQUENTIAL AWAIT, NO EXTRA ROUND TRIP');
// ================================================================================================================
(function () {
  var barrier = ['_irRevealBegin_', '_irRevealPumpReco_', '_irRevealPumpExec_', '_irRecoRevealPaint_',
    '_irExecRevealPaint_', '_irRevealFrame_', '_irRevealAbandon_', '_irAdoptCarrierCatalogue_']
    .map(function (n) { return code(extractFn(PAGE, n)); }).join('\n') + code(extractFn(CMPSRC, 'createPanelGate'));
  ok(!/setTimeout|setInterval|requestIdleCallback|while\s*\(/.test(barrier), 'N1  §9 no timer, no interval, no polling loop');
  ok(!/await\s/.test(barrier), 'N2  §9 and no sequential await — the two panels are never chained');
  ok(/requestAnimationFrame/.test(code(extractFn(PAGE, '_irRevealFrame_'))), 'N3  the reveal is scheduled on a render frame');
  ok(!/KM\.api|getWorkspace|fetch\(|XMLHttpRequest|getInventoryReplenishmentGap/.test(barrier),
    'N4  §9 nothing in either barrier issues a request of its own');
})();
(function () {
  var reads = 0;
  var reg = MR.create({ read: function () { reads++; return new Promise(function (r) { setTimeout(function () { r({ success: true, data: {} }); }, 1); }); },
    adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
  var SC = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
  var ps = []; for (var k = 0; k < 20; k++) ps.push(reg.ensureLoaded(SC));
  return Promise.all(ps).then(function () {
    eq([reads, reg.requestCount()], [1, 1], 'N5  §9 scope single-flight is intact — twenty concurrent expands share ONE request');
  });
})();
eq(/DB_WRITE|upsertShippingAllocationDraft|cancelShippingAllocationDraft|submitToShippingPlans/.test(
  code(extractFn(PAGE, '_irRevealBegin_')) + code(extractFn(PAGE, '_irExecRevealPaint_')) +
  code(extractFn(PAGE, '_irRecoRevealPaint_')) + code(extractFn(PAGE, 'retryExecutionMethods')) +
  code(extractFn(PAGE, 'retryRecommendationSummary'))), false,
  'N6  §11.24 DB_WRITES = 0 — no reveal and no retry path can reach a writer');

// ================================================================================================================
section('§10 / §12 — INVARIANTS AND DEPLOYMENT IDENTITY');
// ================================================================================================================
eq(CMP.IRWarehouse.destinationIdentity({ destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' }).code,
  'ROUTE_DESTINATION_AMBIGUOUS', 'V1  §10 the destination XOR authority is untouched');
eq(CMP.IRService.canonical('美森海卡'), 'sea_express', 'V2  §10 sea / sea_express are still distinct');
ok(/data-eta-persisted/.test(PAGE) && /data-method-persisted/.test(PAGE), 'V3  §10 the ETA and method persistence carriers are untouched');
// F1-7N-FB-4G-A2 — RESTATED. A1-R1 asserted that the owner stamp equals A0-R2, meaning "no server change in
// THIS round". That is a statement about a moment, and it becomes false the first time a later round changes
// the server for a good reason (A2 does). The durable form of A1-R1's claim is that A1-R1 ITSELF joined no sync
// set: no Apps Script file mentions it.
(function () {
  var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
  var touched = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).filter(function (f) {
    return /F1-7N-FB-4G-A1-R1|fb4ga1r1/.test(fs.readFileSync(path.join(GS_DIR, f), 'utf8'));
  });
  eq(touched, [], 'V4  §12 no Apps Script file mentions A1-R1 — that round joined no sync set');
})();
(function () {
  var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
  var touched = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).filter(function (f) {
    return /F1-7N-FB-4G-A1-R1|fb4ga1r1|createPanelGate|_irRevealPump/.test(fs.readFileSync(path.join(GS_DIR, f), 'utf8'));
  });
  eq(touched, [], 'V5  §12 no Apps Script file mentions this round — nothing joins the sync set');
})();
(function () {
  // F1-7N-FB-4G-A2 — RESTATED: the token is DERIVED from the append-only series, not restated as a literal
  // that any later round invalidates. The durable claims are that the whole application set moves together and
  // that it is at or after the round that introduced this file's changes.
  var APP = RO.currentAppToken();
  // RESTATED (F1-7N-FC-1A-R1-HF1): this was `=== 18`. The count is not the property — "rotated TOGETHER"
  // is — and the literal made a round that covers one more asset look like a half-updated deployment. Now
  // derived: no entry is left behind on a superseded application token. See _release-order.js staleAppTokenRefs.
  eq(RO.staleAppTokenRefs(INDEX).join(' | '), '',
    'V6  the application refs rotated together (' + RO.appTokenRefCount(INDEX) + ' on ' + APP + ')');
  ok(RO.tokenAtOrAfter(APP, 'fb4ga1r1-panelready-20260902'), 'V6a and it is at or after the round that changed these files');
  ok(INDEX.indexOf('fb4ga1-atomicreveal-20260902') === -1, 'V6b §12 the published A1 token is fully retired');
  // RESTATED (F1-7N-FC-1B-E3): this pinned `irpanelready-20260902`, the literal token A1-R1 minted - so it
  // asserted "the stylesheet has not changed since A1-R1" while reading as "the stylesheet rotated in its own
  // family". E3 rewrites that stylesheet (the Execution Plan control box, and the first rules
  // `.replen-ai-plan-result` has ever had), so it legitimately moves. The family now has a ledger, like the
  // map series, and the durable claims are the two below: A1-R1's token is a FLOOR in that series, and the
  // stylesheet's token is a member of it rather than of the application series.
  ok(RO.irCssTokenAtOrAfter(RO.currentIrCssToken(), 'irpanelready-20260902'),
    'V7  §12 the stylesheet is at or after the A1-R1 token in its OWN family (' + RO.currentIrCssToken() + ')');
  ok(new RegExp('inventory-replenishment\\.css\\?v=' + RO.currentIrCssToken()).test(INDEX),
    'V7a1 and index.html serves exactly that token');
  ok(!new RegExp('inventory-replenishment\\.css\\?v=' + APP).test(INDEX), 'V7a and the families are not crossed');
  // RESTATED (F1-7N-FC-1B-E3-R4-A1): this pinned A1-R1's literal token as "the current one" — the same defect
  // the stylesheet family already had a ledger for, in a family that had none. It now does, so the durable
  // claim is a FLOOR: A1-R1 minted its token, and the series has never moved behind it.
  ok(RO.methodRegistryTokenIndex('fb4ga1r1-method-registry-20260902') !== -1,
    'V8  §12 method-registry.js changed this round, so ITS own token family rotated too');
  ok(RO.methodRegistryTokenAtOrAfter(RO.currentMethodRegistryToken(), 'fb4ga1r1-method-registry-20260902'),
    'V8b and the series has not moved behind it (current: ' + RO.currentMethodRegistryToken() + ')');
  ok(new RegExp('method-registry\\.js\\?v=' + RO.currentMethodRegistryToken()).test(INDEX),
    'V8c and index.html serves exactly that token');
  ok(INDEX.indexOf('fb4c-method-registry-20260826') === -1, 'V8a and its previous token is retired');
})();

// ================================================================================================================
section('MUTATIONS — each applied for real, each caught');
// ================================================================================================================
mut('M1  the cross-panel barrier is re-created (a panel waits for its partner)', function () {
  // Two gates driven through ONE joint condition, which is exactly what A1 did.
  function joint() {
    var S = Sched(), st = { reco: 'LOADING', exec: 'LOADING' }, shown = 0;
    function maybe() { if (st.reco !== 'LOADING' && st.exec !== 'LOADING' && !shown) { shown = 1; S.mark('RECO_VISIBLE'); } }
    S.at(40, function () { st.reco = 'READY'; maybe(); });
    S.at(60000, function () { st.exec = 'ERROR'; maybe(); });
    S.run(); return S.at_('RECO_VISIBLE');
  }
  var honest = expand({ recoAt: 40, execAt: 60000,
    execInput: { readModelReady: true, hydrationInFlight: false, catalogue: 'ERROR', error: { code: 'REQUEST_TIMEOUT' }, hasRoutes: true } }).S.at_('RECO_VISIBLE');
  return honest === 40 && joint() === 60000;
});

mut('M2  the Recommendation is made to wait for the Execution Plan', function () {
  // The readiness owner is given the Execution Plan's catalogue as an input.
  var m = mutateFn(CMPSRC, 'recommendationReadiness',
    "if (input.mode === 'legacy') return mk(S.READY, '', null);",
    "if (input.mode === 'legacy') return mk(S.READY, '', null);\n    if (input.catalogue && input.catalogue !== 'READY') return mk(S.LOADING, '', null);");
  var M = moduleFrom(m).IRPlanningReveal;
  var h = R.recommendationReadiness({ mode: 'materialized', status: 'READY', catalogue: 'LOADING' }).state;
  var x = M.recommendationReadiness({ mode: 'materialized', status: 'READY', catalogue: 'LOADING' }).state;
  return h === 'READY' && x === 'LOADING';
});

mut('M3  a timeout is mis-reported as an invalid scope', function () {
  var m = mutateFn(CMPSRC, 'recommendationReadiness',
    "case 'READ_ERROR': return mk(S.ERROR, classifyReadFailure(input.error), input.error || { code: C.READ_FAILED });\n      // INVALID_SCOPE means exactly what it says. A timeout, a refusal or a stale answer must never arrive",
    "case 'READ_ERROR': return mk(S.EMPTY, C.INVALID_SCOPE, null);\n      //");
  var M = moduleFrom(m).IRPlanningReveal;
  var inp = { mode: 'materialized', status: 'READ_ERROR', error: { code: 'REQUEST_TIMEOUT' } };
  var h = R.recommendationReadiness(inp), x = M.recommendationReadiness(inp);
  return h.code === 'REQUEST_TIMEOUT' && h.state === 'ERROR' && x.code === 'INVALID_SCOPE';
});

mut('M4  the generation guard is removed (a stale response paints)', function () {
  var m = mutateFn(CMPSRC, 'createPanelGate', "if (g !== cur.gen) return 'STALE_GENERATION';", '');
  var M = moduleFrom(m).IRPlanningReveal;
  function run(Rev) {
    var painted = [];
    var g = Rev.createPanelGate({ name: 'r', frame: function (cb) { cb(); }, onReveal: function (s) { painted.push(s.sku); } });
    var g1 = g.begin({ sku: 'SKU-A', scopeKey: 's' });
    g.begin({ sku: 'SKU-B', scopeKey: 's' });
    g.report(g1, { state: 'READY' }, null);
    return painted.length;
  }
  return run(R) === 0 && run(M) === 1;
});

mut('M5  the Execution Plan renders before its catalogue settles', function () {
  var m = mutateFn(CMPSRC, 'executionReadiness', "if (cat !== 'READY') return mk(S.LOADING, '', null);", '');
  var M = moduleFrom(m).IRPlanningReveal;
  var inp = { readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true };
  return R.executionReadiness(inp).state === 'LOADING' && M.executionReadiness(inp).state === 'READY';
});

mut('M6  Retry Methods reloads the whole workspace', function () {
  var m = mutateFn(PAGE, 'retryExecutionMethods',
    "if (typeof _irRetryMethodRegistry_ !== 'function') return false;",
    "if (typeof _irWorkspaceRefresh_ === 'function') _irWorkspaceRefresh_();\n    if (typeof _irRetryMethodRegistry_ !== 'function') return false;");
  var honest = code(extractFn(PAGE, 'retryExecutionMethods'));
  var mutant = code(extractFn(m, 'retryExecutionMethods'));
  return !/_irWorkspaceRefresh_/.test(honest) && /_irWorkspaceRefresh_/.test(mutant);
});

mut('M7  Retry schedules another Retry (a loop)', function () {
  var m = mutateFn(PAGE, 'retryExecutionMethods',
    'if (typeof _irRevealSyncActionAvailability_ === \'function\') _irRevealSyncActionAvailability_();',
    'if (!ok) retryExecutionMethods(null, sku);\n        if (typeof _irRevealSyncActionAvailability_ === \'function\') _irRevealSyncActionAvailability_();');
  // Executed: the mutant re-enters itself while the catalogue keeps failing; the honest one runs once.
  function run(src) {
    var calls = 0, depth = 0, over = false;
    var reg = { isLoaded: function () { return false; }, getError: function () { return { code: 'REQUEST_TIMEOUT' }; } };
    var doc = { getElementById: function () { return { setAttribute: function () {} }; }, querySelector: function () { return null; } };
    var fn = new Function('document', 'window', '_irRetryMethodRegistry_', '_irUpdateRouteEtas', '_irMethodScope_',
      '_irRevealSyncActionAvailability_', 'GUARD',
      extractFn(src, 'retryExecutionMethods') + ' return retryExecutionMethods;')(
        doc, { KM: { methodRegistry: reg } },
        function () { calls++; return { then: function (cb) { if (depth < 6) { depth++; cb(); } else { over = true; } return { then: function () {} }; } }; },
        function () {}, function () { return {}; }, function () {}, null);
    fn(null, 'CO1100-R');
    return { calls: calls, over: over };
  }
  var h = run(PAGE), x = run(m);
  return h.calls === 1 && x.calls > 1;
});

mut('M8  Retry rebuilds the panel and destroys the user-added route', function () {
  var m = mutateFn(PAGE, '_irExecRevealPaint_', "if (document.getElementById('shipping-methods-' + sku)) return;   // already built - never rebuilt", '');
  function run(src) {
    var doc = new Doc();
    doc.add('ir-reveal-exec-CO1100-R');
    var card = doc.add('execution-plan-CO1100-R'); card.innerHTML = 'TWO ROUTES, TOTAL 1600';
    doc.add('shipping-methods-CO1100-R');
    var reseeded = 0;
    new Function('document', '_irExecPlanCardInnerHtml_', '_irRevealErrorHtml_', 'initializeShippingAllocation',
      '_irRevealSkuData_', '_irRevealSyncActionAvailability_', '_irUpdateHScrollGutter_',
      extractFn(src, '_irExecRevealPaint_') + ' return _irExecRevealPaint_;')(
        doc, function () { return 'DEFAULT EDITOR, TOTAL 800'; }, function () { return ''; },
        function () { reseeded++; }, function () { return {}; }, function () {}, function () {})
      ({ sku: 'CO1100-R', readiness: { state: 'READY', code: '', error: null }, frameId: 2 });
    return { html: card.innerHTML, reseeded: reseeded };
  }
  var h = run(PAGE), x = run(m);
  return h.html === 'TWO ROUTES, TOTAL 1600' && h.reseeded === 0 &&
         x.html === 'DEFAULT EDITOR, TOTAL 800' && x.reseeded === 1;
});

mut('M9  a catalogue repaint overwrites the method the operator chose', function () {
  var m = mutateFn(PAGE, '_execRebuildMethodOptions',
    "var current = methodEl.value || (userTouched ? '' : persistedMethod);",
    "var current = persistedMethod;");
  function run(src) {
    var doc = new Doc();
    var list = doc.add('shipping-methods-CO1100-R');
    var row = new El('', 'exec-route-row');
    var from = new El(); from.setAttribute('data-field', 'source_warehouse_id'); from.value = 'W';
    from.options = [{ getAttribute: function () { return ''; } }]; from.selectedIndex = 0;
    var to = new El(); to.setAttribute('data-field', 'destination_warehouse_id');
    to.options = [{ getAttribute: function () { return ''; } }]; to.selectedIndex = 0;
    var mEl = new El(); mEl.setAttribute('data-field', 'shipping_method'); mEl.value = 'air';
    row.setAttribute('data-method-persisted', 'sea'); row.setAttribute('data-method-dirty', '1');
    [from, to, mEl].forEach(function (e) { row.appendChild(e); });
    list.appendChild(row);
    new Function('document', '_replenSelectedScope', '_execResolveMethods', '_execMethodRouteCtx',
      '_execMethodOptionsHtml', 'window',
      extractFn(src, '_execRebuildMethodOptions') + ' return _execRebuildMethodOptions;')(
        doc, function () { return {}; },
        function () { return { status: 'READY', methods: [{ value: 'sea', label: 'S' }, { value: 'air', label: 'A' }] }; },
        function () { return {}; }, function (r, s2) { return String(s2); }, { IRService: CMP.IRService })('CO1100-R');
    return mEl.value;
  }
  return run(PAGE) === 'air' && run(m) === 'sea';
});

mut('M10 a cache hit issues a request anyway', function () {
  var m = mutateFn(MRSRC, 'ensureLoaded', 'if (!force && cache[key]) return Promise.resolve({ status: STATUS.READY, key: key });', '');
  var mod = moduleFrom(m);
  function probe(factory) {
    var reads = 0;
    var reg = factory.create({ read: function () { reads++; return Promise.resolve({ success: true, data: {} }); },
      adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
    var SC = { company: 'c', country: 'US', marketplace: 'Amazon' };
    reg.adopt(SC, { getCarrierRateCards: [], getCarrierLeadTimes: [] });
    reg.ensureLoaded(SC);
    return reads;
  }
  return probe(MR) === 0 && probe(mod) === 1;
});

// ================================================================================================================
var ASYNC = [];
Promise.all(ASYNC).then(function () {
  return new Promise(function (r) { setTimeout(r, 40); });
}).then(function () {
  console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ': ' + pass + ' passed, ' + fail + ' failed');
  console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
  process.exit(fail ? 1 : 0);
})['catch'](function (e) { console.error('SUITE ERROR: ' + (e && e.stack || e)); process.exit(1); });
