// ================================================================================================================
// F1-7N-FC-1B-E1 — EXECUTION PLAN EXPLICIT INTENT / EMPTY STATE / ROUTE PROVENANCE
// ----------------------------------------------------------------------------------------------------------------
// RECOMMENDATION IS NOT EXECUTION, and until this round the page did not agree.
//
// THE SHIPPED DEFECT, MEASURED BY EXECUTING initializeShippingAllocation. It had two branches: rebuild from the
// working draft, or — failing that — seed ONE blank Execution Route carrying the Suggested Qty. On the live
// CO1100-R / ResUS / US / Amazon station with ZERO active allocation drafts, cancelled historical drafts, AI
// Plan never clicked and + Add Route never pressed:
//
//     routes.length = 1 | From '' | To '' | Method '' | Qty 520 | no allocation_draft_id | no line id | Total 520
//
// It was documented as a "default preview" that "writes nothing". The second half was true — and only until
// the next collect. _saveAllocationDraftFromDom rebuilds the canonical model from EVERY .exec-route-row in the
// DOM, so the first edit anywhere in that SKU's panel swept the phantom in, minted it a
// client_route_instance_id, stamped route_intent CREATE_NEW_ROUTE and put it in the model Submit reads.
// Pressing + Add Route to enter a real route is that first edit, which makes this the everyday path, not a
// corner. The phantom could not be SAVED (the flush writes only complete routes) so it did the other thing:
// it BLOCKED Submit for the WHOLE batch as an unsaved incomplete route. A quantity nobody had committed to
// stopped plans that were ready.
//
// AND IT WAS NEVER REALLY "SEEDED FROM THE SUGGESTED QTY". With the recommendation at 0 the same blank row
// appeared carrying Qty 0. It was an unconditional default row that borrowed the suggestion's number.
//
// WHAT THIS SUITE PROVES. It executes the shipped functions — the real initializeShippingAllocation, the real
// _renderExecutionRoute, the real _saveAllocationDraftFromDom, the real IRSubmitPreflight.evaluate — over
// hand-built DOM objects, and counts. "No route is created" and "nothing is written" are not readable
// properties of source; they are counts, so they are counted.
//
// Run: node assets/tests/execution-plan-explicit-intent-f1-7n-fc-1b-e1.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
// A mutation must APPLY and be CAUGHT. A probe that cannot find its target is a PROBE ERROR, never a pass.
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
var CMP = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var PF = CMP.IRSubmitPreflight;
var RP = CMP.IRRouteProvenance;
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var INDEX = read('index.html');

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
// The shipped page is CRLF and this file is LF, so a literal multi-line anchor NEVER matches it. Every
// rewrite below goes through here: newlines become \r?\n and a missing anchor THROWS, so a mutation that has
// stopped applying is a loud PROBE ERROR rather than a quietly surviving mutant.
function swap(src, find, repl) {
  var re = new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));
  if (!re.test(src)) throw new Error('swap anchor not found: ' + String(find).slice(0, 90));
  return src.replace(re, repl.replace(/\$/g, '$$$$'));
}

var CTX = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var SKU = 'CO1100-R';
var SUGGESTED = 520, GAP = 519;

// ================================================================================================================
// THE HARNESS. Hand-built DOM objects — never an HTML parser — so every field a row reports is a value this
// fixture set on purpose, and a row that appears in a count is a row something actually created.
// ================================================================================================================
var UID = 0;

function makeRowEl(fields, attrs) {
  var f = {}, a = {};
  Object.keys(fields || {}).forEach(function (k) { f[k] = String(fields[k] == null ? '' : fields[k]); });
  Object.keys(attrs || {}).forEach(function (k) { a[k] = String(attrs[k] == null ? '' : attrs[k]); });
  var el = {
    className: 'exec-route-row ir-exec-plan__grid',
    _fields: f, _attr: a, _removed: false,
    getAttribute: function (k) { return a[k] === undefined ? null : a[k]; },
    setAttribute: function (k, v) { a[k] = String(v); },
    // Reads el._fields at CALL time, never a closure over the initial object: filling a row in after it was
    // created is what typing into it does, and a harness that could not model that would have tested a row
    // nobody can edit.
    querySelector: function (sel) {
      var m = /\[data-field="([^"]+)"\]/.exec(sel);
      if (!m) return null;
      var name = m[1];
      var cur = el._fields;
      if (!(name in cur)) return null;
      // A warehouse picker reports its selection through the SELECTED <option>, which is where the display
      // name, the warehouse type and the code snapshot live. Modelled, because the collect reads all three.
      function opt(k) {
        if (k === 'data-wh-name') return cur[name + '__name'] || '';
        if (k === 'data-wh-type') return cur[name + '__type'] || '';
        if (k === 'data-wh-code') return cur[name + '__code'] || '';
        return '';
      }
      return {
        options: [{ getAttribute: opt }],
        selectedIndex: cur[name] ? 0 : -1,
        getAttribute: function (k) { return (name === 'expected_arrival') ? (cur['eta__' + k] || '') : opt(k); },
        set value(v) { el._fields[name] = String(v); },
        get value() { return el._fields[name]; }
      };
    },
    parentNode: null
  };
  return el;
}

// RESTATED (F1-7N-FC-1B-E2): this returned EVERY row for `.exec-route-row`, which was harmless while the only
// row that existed was an execution route. E2 adds the MANUAL COMPOSER, whose entire guarantee is that a
// `.exec-route-row` selector passes it by, so a harness that ignores the class can no longer measure E1's
// claim — it would count an input surface as a decision, which is precisely the conflation E1 removed.
function makeList() {
  var self = {
    _html: '', _rows: [],
    _byClass: function (c) {
      return self._rows.filter(function (r) { return String(r.className || '').split(/\s+/).indexOf(c) !== -1; });
    },
    set innerHTML(v) { self._html = String(v); self._rows = []; },
    get innerHTML() { return self._html; },
    // RESTATED (F1-7N-FC-1B-E2): appending used to CLEAR _html, which was harmless while nothing was ever
    // appended after the empty-plan message. E2 appends a composer BESIDE that message, and a real
    // container keeps both, so wiping it here would have modelled a DOM that does not exist.
    appendChild: function (el) { el.parentNode = self; self._rows.push(el); },
    removeChild: function (el) {
      var i = self._rows.indexOf(el);
      if (i >= 0) { self._rows.splice(i, 1); el._removed = true; }
      return el;
    },
    querySelector: function (sel) {
      if (sel === '.exec-route-row') return self._byClass('exec-route-row')[0] || null;
      if (sel === '.exec-route-composer') return self._byClass('exec-route-composer')[0] || null;
      // F1-7N-FC-1B-E3 §A - `[data-ir-exec-empty]` was the empty-plan MESSAGE, and the message is gone
      // (the empty plan is one blank composer row now, which the column header above it names). Modelling a
      // selector production no longer uses would be a harness pretending to describe the page.
      return null;
    },
    querySelectorAll: function (sel) {
      if (sel === '.exec-route-row') return self._byClass('exec-route-row');
      if (sel === '.exec-route-composer') return self._byClass('exec-route-composer');
      if (sel === 'input[data-field="qty"]') {
        return self._rows.map(function (r) { return { value: String(r._fields.qty || 0) }; });
      }
      if (sel === '[data-route-instance]' || sel === '[data-line-id]') return self._rows.slice();
      return [];
    }
  };
  return self;
}

// One world: the DOM container, the canonical model, and every write channel counted.
function makeWorld(opts) {
  opts = opts || {};
  var list = makeList();
  var w = {
    list: list,
    model: { context: CTX, allocationDraftId: '', allocationDraftIds: [], bySku: opts.bySku ? JSON.parse(JSON.stringify(opts.bySku)) : {}, targetDays: '' },
    counts: { persistScheduled: 0, touched: 0, sessionWrites: 0, totals: [], warnings: [], dbWrites: 0, aiPlanCalls: 0 },
    suggested: opts.suggested === undefined ? SUGGESTED : opts.suggested
  };
  var win = { IRRouteProvenance: RP, IRDraft: CMP.IRDraft, IRWarehouse: CMP.IRWarehouse, KM: {} };
  w.win = win;

  var deps = {
    window: win,
    document: {
      getElementById: function (id) {
        if (id === 'shipping-methods-' + SKU) return list;
        if (id === 'allocation-total-' + SKU) return { textContent: '' };
        return null;
      },
      // The real _renderExecutionRoute builds its row with createElement + innerHTML, so the harness returns
      // the SAME kind of row object the fixtures build by hand - one object shape, so a rendered row and a
      // hand-built stale row are indistinguishable to the collect, which is the point of §H.3.
      createElement: function () {
        var el = makeRowEl({ source_warehouse_id: '', destination_warehouse_id: '', qty: '0',
          shipping_method: '', expected_arrival: '' }, {});
        el.className = '';   // the renderer assigns it, and which class it assigns is the property under test
        Object.defineProperty(el, 'innerHTML', {
          // RESTATED (F1-7N-FC-1B-E2): `(\d+)` could not match a composer's BLANK Qty and fell back to '0',
          // reporting a 0 where the shipped renderer had written nothing. Any value, including empty.
          set: function (v) { // F1-7N-FC-1B-E3 §A.5 - the Qty input carries its own accessible label now, so `data-field="qty"`
          // and `value=` are no longer adjacent. Matching the ATTRIBUTES of the qty input rather than one
          // exact byte sequence is what the harness meant all along.
          var m = /data-field="qty"[^>]*?\svalue="([^"]*)"/.exec(String(v)); el._fields.qty = m ? m[1] : ''; },
          get: function () { return ''; }
        });
        return el;
      }
    },
    getReplenishmentData: function () { return [{ sku: SKU, country: 'US', suggestedQty: w.suggested }]; },
    _replenSelectedScope: function () { return CTX; },
    _replenCtx: function () { return CTX; },
    _replenCtxEq: function (a, b) { return !!a && !!b && a.company === b.company && a.country === b.country && a.marketplace === b.marketplace; },
    _irRouteEtaFor: function () { return { available: false, date: '', text: '', source: '' }; },
    _execWarehouseCandidates: function () { return { from: [], to: [], isAmazon: true }; },
    _execResolveIdByName: function () { return ''; },
    _execResolveMethods: function () { return { methods: [], status: 'EMPTY_CONFIGURATION' }; },
    _execMethodRouteCtx: function () { return {}; },
    _execMethodOptionsHtml: function () { return ''; },
    _execFromOptionsHtml: function () { return ''; },
    _execToOptionsHtml: function () { return ''; },
    _execEsc: function (v) { return String(v == null ? '' : v); },
    _irCanonicalDateOrBlank_: function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''; },
    _irMatState: { status: 'READY', bySku: (function () { var m = {}; m[SKU] = { calculation_status: 'READY', d90_suggested_qty: opts.suggested === undefined ? SUGGESTED : opts.suggested, d90_gap_qty: GAP }; return m; })() },
    _irUseMaterializedGapRead: function () { return true; },
    _irMatNum: function (v) { var n = parseInt(v, 10); return isFinite(n) ? n : null; },
    _irRecommendationWorkspaceEnabled: function () { return true; },
    _irLoadCarrierPlanning_: undefined,
    _execRebuildMethodOptions: function () {},
    _irUpdateRouteEtas: function () {},
    _execEnforceDistinctWarehouses: function () {},
    validateAllocationCartons: function () {},
    REPLEN_TARGET_DAYS: '90',
    _newDraftLineId: function () { return 'SADL-NEW-' + (++UID); },
    _newRouteInstanceId: function () { return 'CRI-' + (++UID); },
    _persistAllocationDraft: function () { w.counts.sessionWrites++; },
    _irRouteSignature_: function (r) { return JSON.stringify([r && r.source_warehouse_id, r && r.destination_warehouse_id, r && r.destination_marketplace, r && r.shipping_method, r && r.qty]); },
    _irMarkRouteTouched_: function () { w.counts.touched++; },
    _scheduleDraftDbPersist: function () { w.counts.persistScheduled++; },
    _isRouteComplete: function (r) { return CMP.IRDraft.isRouteComplete(r); },
    console: { warn: function (m) { w.counts.warnings.push(String(m)); }, log: function () {}, error: function () {} },
    sessionStorage: { setItem: function () {}, getItem: function () { return null; } }
  };

  var names = Object.keys(deps);
  var src = [
    extractFn(PAGE, '_irRouteProvenanceOf_'),
    // F1-7N-FC-1B-E2 — the collect now classifies a manual composer rather than adopting it as a route, so
    // these two are lifted into the executed scope. E1's own assertions are unaffected: with no composer in
    // the fixture every one of them answers exactly as before.
    extractFn(PAGE, '_irComposerKind_'),
    extractFn(PAGE, '_irIsComposerEl_'),
    extractFn(PAGE, '_execRenderEmptyState_'),
    // F1-7N-FC-1B-E2 — the empty state now also paints ONE pristine composer, so its builder is lifted too.
    // E1's claims are about EXECUTION ROUTES and are unaffected: a composer is not one, carries no
    //  class while pristine, and enters no count E1 makes.
    extractFn(PAGE, '_renderManualComposer_'),
    // F1-7N-FC-1B-E3 - `_execClearEmptyState_` became `_execDropPristineComposers_`: at the same call site,
    // for the same reason (a plan holding a real route must not still show the empty plan's furniture), on the
    // composer instead of the deleted message.
    extractFn(PAGE, '_execDropPristineComposers_'),
    extractFn(PAGE, '_execSyncEmptyState_'),
    extractFn(PAGE, '_renderExecutionRoute'),
    extractFn(PAGE, '_allocationDraftRowsFor'),
    extractFn(PAGE, '_irSuggestedQtyState_'),
    extractFn(PAGE, '_irSuggestedQtyNumber_'),
    // The real total sums input[data-field="qty"] inside this container; the container models that selector,
    // so this is the shipped arithmetic over the shipped selector with the DOM-only cosmetics removed.
    'function updateShippingAllocationTotal(sku){var el=document.getElementById("shipping-methods-"+sku);if(!el)return;' +
      'var t=0;el.querySelectorAll(\'input[data-field="qty"]\').forEach(function(i){t+=parseInt(i.value)||0;});' +
      '__totals.push(t);}',
    extractFn(PAGE, '_saveAllocationDraftFromDom'),
    extractFn(PAGE, 'onExecutionRouteEdit'),
    extractFn(PAGE, 'initializeShippingAllocation'),
    'return { init: initializeShippingAllocation, render: _renderExecutionRoute, collect: _saveAllocationDraftFromDom,' +
      ' edit: onExecutionRouteEdit, sync: _execSyncEmptyState_, provOf: _irRouteProvenanceOf_,' +
      ' dropPristine: _execDropPristineComposers_ };'
  ].join('\n');

  w.api = new Function(names.concat(['replenAllocationDraft', '__totals']), src)
    .apply(null, names.map(function (n) { return deps[n]; }).concat([w.model, w.counts.totals]));
  w.deps = deps;
  w.src = src;
  w.names = names;
  return w;
}

// RESTATED (F1-7N-FC-1B-E3): "the plan is empty" used to be observable as a SENTENCE in the container. §A
// removes that sentence, so the same fact is observed as the shape the empty plan actually has now: ZERO
// execution routes and EXACTLY ONE pristine composer. Every call site below meant "nothing has been planned",
// and that is what this still answers - more strictly than before, because a missing composer, a second one,
// or a route now all falsify it, where the old predicate only looked for a string.
function isEmptyState(w) {
  return routeCount(w) === 0 && composerCount(w) === 1;
}
// EXECUTION ROUTES only. A manual composer (F1-7N-FC-1B-E2) is an input surface, not a route, and every claim
// in this suite is about routes: "the Suggested Qty creates no route", "no identity is minted", "nothing is
// written". Those hold unchanged — what changed is that the plan is no longer visually empty, because an
// operator with no active route now has somewhere to type.
function routeCount(w) { return w.list._byClass('exec-route-row').length; }
function composerCount(w) { return w.list._byClass('exec-route-composer').length; }
function lastTotal(w) { var t = w.counts.totals; return t.length ? t[t.length - 1] : null; }
function modelRows(w) { return (w.model.bySku && w.model.bySku[SKU]) || []; }

var SKUDATA = { sku: SKU, country: 'US', marketplace: 'Amazon', suggestedQty: SUGGESTED, plannedQty: 0 };

// A complete, persisted route as the hydrate produces one.
function persistedRoute(over) {
  var r = {
    route_provenance: RP.SOURCES.PERSISTED_ACTIVE_DRAFT,
    allocation_draft_id: 'SAD-K2-LIVE-1', allocation_draft_line_id: 'SADL-K2-LIVE-1',
    sku: SKU, qty: 800, planned_qty: 800,
    source_warehouse_id: 'WH-CN-KMF-01', ship_from: 'KM Factory CN',
    destination_warehouse_id: '', destination_marketplace: 'Amazon', destination: 'Amazon',
    destination_type: 'MARKETPLACE_DESTINATION', destination_token: 'MARKETPLACE_DESTINATION:Amazon',
    shipping_method: 'Sea Express', route_group_key: 'GK-1'
  };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}

// ================================================================================================================
section('§A — THE DEFECT, AND ITS REMOVAL, ON THE SAME EXECUTED FUNCTION');
// ================================================================================================================
// The PRE state is reconstructed by putting the deleted branch back into the shipped source and executing THAT,
// so the "before" is the real code rather than a description of it. This is the only honest way to claim a fix:
// the same fixture, the same function, one branch different.
var PRE_BRANCH =
  '    var suggested = (typeof _irSuggestedQtyNumber_ === \'function\') ? _irSuggestedQtyNumber_(skuData) : (parseInt(skuData.suggestedQty) || 0); ' +
  '_renderExecutionRoute(sku, { ship_from: \'\', destination: \'\', shipping_method: \'\', qty: suggested, route_provenance: \'SUGGESTED_QTY_PLACEHOLDER\' });';

// The seeding branch, put BACK into the shipped source, with the provenance gate neutralised — which is
// exactly the state this code was in before this round: there was no gate.
function reseed(src) {
  // F1-7N-FC-1B-E2 restated BOTH anchors, and each for its own reason.
  //
  // The provenance gate now reads `if (!_isComposer && !_prov)`, because E2 exempts a COMPOSER from it: a
  // composer does not claim to be an execution route. The mutation is unchanged in meaning — neutralise the
  // gate so the reseeded phantom can paint.
  //
  // And `_execRenderEmptyState_(sku);` is no longer unique in the extracted source: it appears inside
  // _execSyncEmptyState_ as well, and swap() takes the FIRST match. An anchor that silently relocates to
  // another function yields a mutant that applies somewhere harmless and then "survives" for a reason that
  // has nothing to do with the property under test — which is worse than a probe error, because it is quiet.
  // Anchored on the line that FOLLOWS it, which only the initializeShippingAllocation call site has.
  return swap(swap(src,
    '    _execRenderEmptyState_(sku);\n    updateShippingAllocationTotal(sku);',
    PRE_BRANCH + '\n    updateShippingAllocationTotal(sku);'),
    '    if (!_isComposer && !_prov) {', '    if (false) {');
}
function makePreWorld() {
  var w = makeWorld({});
  w.api = new Function(w.names.concat(['replenAllocationDraft', '__totals']), reseed(w.src))
    .apply(null, w.names.map(function (n) { return w.deps[n]; }).concat([w.model, w.counts.totals]));
  return w;
}

var pre = makePreWorld();
pre.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeCount(pre), 1, 'A1  PRE (executed): one Execution Route materialised with no user action at all');
eq(pre.list._rows[0]._fields.qty, '520', 'A2  PRE: its Qty is the Suggested Qty — 520');
eq(pre.list._rows[0].getAttribute('data-line-id'), null, 'A3  PRE: and it carries NO persisted line identity');
eq(pre.list._rows[0].getAttribute('data-draft-id'), null, 'A3a PRE: nor any header identity');
eq(lastTotal(pre), 520, 'A4  PRE: the Execution Plan Total reads 520 — a quantity nobody committed to');
ok(!isEmptyState(pre), 'A5  PRE: no empty state, because the state was unreachable');

var post = makeWorld({});
post.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeCount(post), 0, 'A6  POST: zero Execution Routes');
eq(lastTotal(post), 0, 'A7  POST: Total = 0');
// RESTATED (F1-7N-FC-1B-E2): the empty-plan MESSAGE is now painted together with one pristine manual
// composer, so the container is not literally empty. The property E1 established is untouched and is what is
// measured above and below: zero execution ROUTES, Total 0, an empty model, zero writes. E2's composer is
// asserted in its own suite; here it is only confirmed that it is not a route.
eq(composerCount(post), 1, 'A8  POST: one pristine COMPOSER is offered instead of a seeded route');
eq(post.list._byClass('exec-route-composer')[0].getAttribute('data-route-provenance'), null,
  'A8a which claims no provenance, because it is not an execution route');
eq(modelRows(post).length, 0, 'A9  POST: and the canonical model holds nothing for this SKU');
eq([post.counts.persistScheduled, post.counts.touched], [0, 0],
  'A10 POST: no persistence scheduled and no route marked dirty by a render');

// ================================================================================================================
section('§B — SUGGESTED QTY IS A NUMBER, NOT A DECISION');
// ================================================================================================================
// §B.1 — the recommendation itself is untouched. The Suggested Qty authority still answers 520 for this
// station; what changed is that nothing turns its answer into a route.
var sugW = makeWorld({});
var sugFn = new Function(sugW.names, [extractFn(PAGE, '_irSuggestedQtyState_'), extractFn(PAGE, '_irSuggestedQtyNumber_'),
  'return _irSuggestedQtyNumber_;'].join('\n')).apply(null, sugW.names.map(function (n) { return sugW.deps[n]; }));
eq(sugFn(SKUDATA), 520, 'B1  the Suggested Qty authority still answers 520 — the recommendation is not removed');

// §B.2 — each forbidden consequence, counted.
var b2 = makeWorld({});
b2.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeCount(b2), 0, 'B2a Suggested Qty pushes no route object');
eq(b2.list._byClass('exec-route-composer')[0]._fields.qty, '',
  'B2a1 and the composer offered in its place has a BLANK Qty — the number is not substituted into it');
eq(Object.keys(b2.model.bySku).length, 0, 'B2b it does not initialise a routes array in the model');
eq(b2.list._rows.filter(function (r) { return r.getAttribute('data-route-instance'); }).length, 0,
  'B2c it fabricates no client_route_instance_id');
eq(b2.list._rows.filter(function (r) { return r.getAttribute('data-draft-id'); }).length, 0,
  'B2d it fabricates no allocation_draft_id');
eq(b2.counts.touched, 0, 'B2e it marks nothing dirty');
eq(b2.counts.persistScheduled, 0, 'B2f it schedules no persistence');
eq(b2.counts.sessionWrites, 0, 'B2g and it writes no recovery cache either');

// §B.3 — the render is idempotent across every repaint the page performs.
var b3 = makeWorld({});
for (var i = 0; i < 5; i++) b3.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeCount(b3), 0, 'B3  five re-renders (Search, expand, recommendation render, retry, filter change) create no ROUTE');
eq(composerCount(b3), 1, 'B3a and still exactly ONE composer, never a stack of them');
eq(b3.counts.persistScheduled, 0, 'B3b with zero writes across all five');

// §B.4 — THE COMPLETE INVENTORY OF ROUTE CREATORS. `.exec-route-row` is created in exactly one function, so
// the list of ways a route can come into being is the list of that function's call sites — three, all explicit.
var renderCalls = (code(PAGE).match(/_renderExecutionRoute\(/g) || []).length;
// RESTATED (F1-7N-FC-1B-E2): E2 adds a THIRD call site, _renderManualComposer_, and it is the reason the
// count is a poor way to state this. What matters is that the row creator is still ONE function and that
// every one of its callers is an explicit act or an input surface — never a seeded decision.
eq(renderCalls, 4, 'B4  _renderExecutionRoute is named 4 times: its definition + exactly THREE call sites');
eq((code(extractFn(PAGE, '_renderManualComposer_')).match(/_renderExecutionRoute\(/g) || []).length, 1,
  'B4a1 call site 3 of 3: the manual composer, which is an INPUT SURFACE and not a route');
// Three legal SOURCES, two call sites: the hydrate render serves both PERSISTED_ACTIVE_DRAFT and
// AI_PLAN_EXPLICITLY_REQUESTED, because the AI half appears by being read back from the database like any
// other persisted route. That is why adding AI provenance needed no third painter - and why the removed
// fallback was the only call site that was not an explicit act.
eq((code(extractFn(PAGE, 'addExecutionRoute')).match(/_renderExecutionRoute\(/g) || []).length, 1,
  'B4a call site 1 of 2: + Add Route');
eq((code(extractFn(PAGE, 'initializeShippingAllocation')).match(/_renderExecutionRoute\(/g) || []).length, 1,
  'B4b call site 2 of 2: the hydrated-rows loop, and NOTHING else in that function');
ok(/function _renderExecutionRoute/.test(PAGE), 'B4c and it is the only creator of an .exec-route-row');
ok(!/qty:\s*suggested/.test(code(PAGE)), 'B4d no call site seeds a route from the Suggested Qty any more');
ok(!/_renderExecutionRoute\(sku,\s*\{\s*ship_from:\s*''/.test(code(PAGE)),
  'B4e and the blank-route literal the seeding branch used is gone');

// §B.5 — the empty state is NOT A ROUTE. That was the whole of B5, and it is unchanged.
//
// RESTATED (F1-7N-FC-1B-E3): B5 read the empty state out of an HTML STRING, because the empty state WAS a
// string. It is a rendered row now, so the same three properties are asserted on the rendered thing - which
// is what the collect and the Total actually see. B5a is the one that changed shape and NOT meaning: there is
// an input now (that is the point of a composer), and what mattered was that the Total finds nothing to add,
// so the Total is asserted directly instead of the absence of the element. A hidden row is still refused: a
// hidden row is a row to every querySelectorAll on this page, including the collect's, which is exactly the
// mechanism that made the phantom dangerous.
var _emptyRow = post.list._byClass('exec-route-composer')[0] || null;
ok(!!_emptyRow, 'B5  the empty plan renders exactly one row, and it is a COMPOSER');
ok(!/exec-route-row/.test(String(_emptyRow && _emptyRow.className || '')),
  'B5a  ...which is not an .exec-route-row, so the collector\'s selector passes it by');
eq(lastTotal(post), 0, 'B5b and the Total is 0, because its Qty is BLANK - not because there is no input');
ok(!/display\s*:\s*none/i.test(JSON.stringify(_emptyRow && _emptyRow.style || {})) && _emptyRow.hidden !== true,
  'B5c and it is not a hidden row pretending to be an empty state');

// ================================================================================================================
section('§C — CANONICAL ROUTE PROVENANCE');
// ================================================================================================================
eq(RP.LEGAL, ['PERSISTED_ACTIVE_DRAFT', 'AI_PLAN_EXPLICITLY_REQUESTED', 'USER_EXPLICIT_ADD_ROUTE'],
  'C1  exactly three legal sources, and no fourth');
RP.FORBIDDEN.forEach(function (f) {
  eq(RP.isLegal(f), false, 'C2  ' + f + ' is not a legal provenance');
  ok(!new RegExp("route_provenance:\\s*'" + f + "'").test(code(PAGE)),
    'C2a and no shipped call site declares ' + f);
});
eq(RP.isLegal(''), false, 'C3  an absent provenance is not legal — it fails closed');
eq(RP.isLegal('anything_else'), false, 'C3a and neither is an unrecognised one');

// §C.6 — provenance is DECLARED, never inferred from shape, Qty or a group key. The one permitted derivation
// is the stored identity pair, which is not a shape: it is what those columns MEAN.
var provOf = post.api.provOf;
eq(provOf({ qty: 520 }), '', 'C4  a Qty alone yields NO provenance');
eq(provOf({ qty: 520, route_group_key: 'GK-1' }), '', 'C4a nor does a group key');
eq(provOf({ qty: 520, source_warehouse_id: 'WH-1', destination_marketplace: 'Amazon', shipping_method: 'Sea Express' }), '',
  'C4b nor does a COMPLETE route with no identity and no declaration');
eq(provOf({ allocation_draft_id: 'SAD-1', allocation_draft_line_id: 'SADL-1' }), 'PERSISTED_ACTIVE_DRAFT',
  'C5  a route carrying BOTH stored identities is a persisted active draft');
eq(provOf({ allocation_draft_id: 'SAD-1' }), '', 'C5a a header id alone is not enough — an orphan is not a route');
eq(provOf({ route_provenance: 'USER_EXPLICIT_ADD_ROUTE' }), 'USER_EXPLICIT_ADD_ROUTE',
  'C6  a declared legal provenance is honoured');
eq(provOf({ route_provenance: 'SUGGESTED_QTY_PLACEHOLDER', qty: 520 }), '',
  'C6a a declared FORBIDDEN provenance is refused, not trusted');

// §C.7 — provenance does not replace allocation identity.
var pr = persistedRoute();
ok(pr.allocation_draft_id && pr.allocation_draft_line_id,
  'C7  a persisted route still carries its own header + line identity beside its provenance');
ok(!/route_provenance/.test(code(extractFn(PAGE, '_saveAllocationDraftFromDom')).split('row.allocation_draft_line_id = lineId')[0].slice(-400)) ||
  /row\.allocation_draft_line_id = lineId/.test(code(PAGE)),
  'C7a and the line identity is still assigned from the stored/DOM id, not from provenance');

// §C.1/C.2/C.3 — the hydrate's own filters, read from the shipped source because they are what decides which
// rows exist at all.
var hyd = code(extractFn(PAGE, '_hydrateAllocationDraftFromDb'));
ok(/lo\(d\.status\) !== 'cancelled'/.test(hyd), 'C8  a cancelled header is excluded from the hydrate');
ok(/lo\(d\.status\) !== 'submitted'/.test(hyd), 'C8a as is a submitted one');
ok(/lo\(l\.lineStatus \|\| l\.line_status\) !== 'cancelled'/.test(hyd), 'C9  and every cancelled LINE is excluded');
ok(/route_provenance: _prov/.test(hyd), 'C10 every hydrated row is stamped with the provenance its caller declared');
ok(/opts && opts\.provenance/.test(hyd) && /'PERSISTED_ACTIVE_DRAFT'/.test(hyd),
  'C10a defaulting to PERSISTED_ACTIVE_DRAFT for an ordinary Search');

// ================================================================================================================
section('§D — THE EMPTY STATE');
// ================================================================================================================
// RESTATED (F1-7N-FC-1B-E3 §A): D1 asserted the WORDING of an empty-plan message, and E3 REMOVES that
// message on purpose. It is the one restatement here that reverses an assertion rather than re-observing it,
// so the reason is stated plainly: E1 needed the sentence because the empty plan held nothing else, and E2
// then put a row under it - a row nobody could read as a form, because every control style in the stylesheet
// was scoped to `.exec-route-row`, which a pristine composer deliberately does not carry. The fix for "the
// operator cannot tell this row is a form" was the LAYOUT, not more prose.
//
// What D1 protected - that an empty plan is HONEST about being empty and says what to do - is protected by
// three things now, all asserted: no route is shown, exactly one blank row IS shown, and the column header
// above it plus each control's own accessible label name the four fields. Nothing the sentence said is unsaid.
ok(!/No execution route yet/.test(PAGE) && !/Nothing is saved until all four are set/.test(PAGE),
  'D1  the empty-plan helper copy is GONE from production, not shortened (§A.1)');
ok(!/exec-routes-empty|data-ir-exec-empty/.test(PAGE),
  'D1a and so is the element that carried it - no empty container, no reserved blank height (§A.2)');
ok(/<span>From<\/span><span>To<\/span>/.test(PAGE) && /<span>Method<\/span>/.test(PAGE),
  'D1b the column header still names every field directly above the row (§A.3)');
ok(/aria-label="From"/.test(PAGE) && /aria-label="To"/.test(PAGE) && /aria-label="Qty"/.test(PAGE) &&
  /aria-label="Method"/.test(PAGE),
  'D1c and each control carries its own accessible label, on the control (§A.5)');
eq(lastTotal(post), 0, 'D2  Total = 0');
// RESTATED (F1-7N-FC-1B-E2): E1 asserted that NO input row is shown, and E2 reverses exactly that half —
// an operator with no active route needs somewhere to type. What must remain true, and is asserted here, is
// that the row shown is not a ROUTE: no provenance, no identity, blank Qty, and invisible to the collector.
eq(routeCount(post), 0, 'D3  no execution ROUTE row is shown...');
eq(composerCount(post), 1, 'D3a ...and the one row that is shown is a composer');
eq(post.list._byClass('exec-route-composer')[0].getAttribute('data-line-id'), null,
  'D3b holding no line identity');
var pfEmpty = PF.evaluate({ scope: CTX, appliedScopeKey: 'resus|us|amazon',
  panels: [{ sku: SKU, execState: 'READY' }], routes: [], pendingWrites: [], inFlightWrites: [],
  dirtyAfterWrite: [], pendingCancels: [], saveFailed: [], routesMissingDestination: [],
  duplicateCorruption: [], zeroLineHeaderCount: 0 });
eq(pfEmpty.ok, false, 'D4  Submit is refused when there are no routes');
eq(pfEmpty.code, 'NO_EXECUTION_ROUTES', 'D4a with the typed code NO_EXECUTION_ROUTES');
eq(post.counts.touched, 0, 'D5  the empty state marks nothing dirty');
eq([post.counts.persistScheduled, post.counts.sessionWrites], [0, 0], 'D6  and sends no write request of any kind');

// ================================================================================================================
section('§E — EXPLICIT AI PLAN');
// ================================================================================================================
// §E.1 — AI Plan not clicked. Measured above: zero routes, zero writes. Restated here against the AI owner
// itself, because the DEFAULT AI Plan path on this page produces no execution route at all — it regenerates
// the RECOMMENDATION and re-renders. That is exactly why the phantom was so misleading: the blank 520 row
// looked like the output of a plan that had never produced a route.
// RESTATED (F1-7N-FC-1B-E3): the AI Plan click is now a PAIR of functions - handleReplenAiPlan (the click's
// own event-loop turn: the re-entry guard and the visible busy state) and _irAiPlanRun_ (the work, one task
// later). That split is not cosmetic: everything the flag-off path does is synchronous, so setting a busy
// state and clearing it around it gave the browser no frame in which to paint either, which is one of the
// five reasons the button looked dead. Every property below is asserted over BOTH halves, which is stricter
// than over one: a later round that moves an operation into either half is still caught.
var aiFn = [code(extractFn(PAGE, 'handleReplenAiPlan')), code(extractFn(PAGE, '_irAiPlanRun_'))].join(' ; ');
ok(/_irRecoByKey/.test(aiFn), 'E1  the default AI Plan path regenerates the RECOMMENDATION');
ok(!/_renderExecutionRoute/.test(aiFn), 'E1a and creates no execution route itself');
// RESTATED (F1-7N-FC-1B-E2): the notice was rewritten because it read as "the plan ran and produced
// nothing". The property E1 wanted — the operator is TOLD that nothing was written — is stronger now: the
// message separates the recommendation half from the execution half and names why the second did not run.
ok(/NOTHING was written to the database/.test(aiFn), 'E1b saying so to the operator...');
ok(/EXECUTION_MATERIALIZATION_NOT_ENABLED/.test(aiFn), 'E1b1 ...and naming why execution did not materialize');
var aiGen = code(extractFn(PAGE, '_irRunInventoryAiPlanGeneration_'));
ok(/if \(cls\.ok\)/.test(aiGen), 'E2  only a SUCCESSFUL generation re-hydrates the Execution Plan');
ok(/AI_PLAN_EXPLICITLY_REQUESTED/.test(aiGen),
  'E2a and the routes it produces are stamped AI_PLAN_EXPLICITLY_REQUESTED');
ok(/_hydrateAllocationDraftFromDb\(_replenCtx\(\), \{/.test(aiGen),
  'E2b through the canonical hydrate, so From/To/Qty/Method come from the persisted route, never from a default');
// §E.3 — a successful run that returns nothing legitimately leaves the plan empty.
var aiZero = makeWorld({ bySku: {} });
aiZero.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeCount(aiZero), 0, 'E3  a zero-result AI Plan leaves the Execution Plan empty');
ok(isEmptyState(aiZero), 'E3a showing the empty-plan message...');
eq(composerCount(aiZero), 1, 'E3a1 ...beside one blank composer, and never a Qty-only placeholder');
ok(/zeroResult/.test(code(PAGE)) && /no recommendation for this scope this cycle/.test(PAGE),
  'E3b and the result popup states the zero outcome as its own typed reason');
// §E.4 — a failure keeps what is on screen and adds nothing.
ok(/an AI Plan FAILURE must never clear the current Execution Plan/.test(PAGE),
  'E4  a failure never clears the current Execution Plan');
ok(/Your current Execution Plan is unchanged/.test(PAGE), 'E4a and says so');
var aiFailBranch = aiGen.slice(aiGen.indexOf('_irShowAiPlanResult_(cls);'));
ok(!/_renderExecutionRoute|_hydrateAllocationDraftFromDb/.test(aiFailBranch),
  'E4b the failure branch neither re-hydrates nor renders a fallback route');
// §E.5
ok(!/520/.test(code(aiFn)), 'E5  no Suggested Qty figure appears in the AI Plan path');

// ================================================================================================================
section('§F — EXPLICIT ADD ROUTE');
// ================================================================================================================
var addFn = code(extractFn(PAGE, 'addExecutionRoute'));
ok(/USER_EXPLICIT_ADD_ROUTE/.test(addFn), 'F1  + Add Route declares USER_EXPLICIT_ADD_ROUTE');
eq((addFn.match(/_renderExecutionRoute\(/g) || []).length, 1, 'F2  one click renders exactly one row');

// Executed: the click, then the collect that the click triggers.
var addW = makeWorld({});
addW.api.init(SKU, SKUDATA, { catalogueSettled: true });
ok(isEmptyState(addW), 'F3  the plan starts empty');
var added = addW.api.render(SKU, { route_provenance: RP.SOURCES.USER_EXPLICIT_ADD_ROUTE });
eq(added, true, 'F3a the explicit add is accepted');
eq(routeCount(addW), 1, 'F3b one ROUTE row exists');
ok(!isEmptyState(addW), 'F3c and the empty-plan message is gone, because the plan now holds a route');
// RESTATED (F1-7N-FC-1B-E2): index 0 is now the pristine COMPOSER the empty plan offers, so these must
// address the route explicitly. The claim is unchanged: the row + Add Route created carries its provenance.
var addRowEl = addW.list._byClass('exec-route-row')[0];
eq(addRowEl.getAttribute('data-route-provenance'), 'USER_EXPLICIT_ADD_ROUTE',
  'F4  the row carries its provenance in the DOM, so a collect never has to guess');
// An INCOMPLETE explicit route: kept in the model, written nowhere.
addRowEl._fields = { source_warehouse_id: '', destination_warehouse_id: '', qty: '0', shipping_method: '', expected_arrival: '' };
addW.api.collect(SKU);
eq(modelRows(addW).length, 1, 'F5  an incomplete explicit route stays in the model (the edit is not lost)');
eq(modelRows(addW)[0].route_provenance, 'USER_EXPLICIT_ADD_ROUTE', 'F5a with its provenance carried into the model');
eq(modelRows(addW)[0].allocation_draft_line_id, '', 'F5b and NO line identity, because nothing was persisted');
// `touched` marks "this event changed this route" and fires for a newly added row by design (A2-R2 §3): the
// row IS new. What decides whether anything reaches the database is COMPLETENESS, so that is what is
// measured - asserting touched===0 here would have been testing the wrong gate.
eq(CMP.IRDraft.isRouteComplete(modelRows(addW)[0]), false,
  'F6  the incomplete explicit route is not persistable...');
ok(/var complete = _scoped\.filter\(_isRouteComplete\);/.test(code(PAGE)),
  'F6a ...and the flush writes ONLY complete routes, so an incomplete one is zero DB write');
ok(/_incomplete\.forEach/.test(code(PAGE)) && /NOT_SAVED/.test(code(PAGE)),
  'F6b while still being NAMED as not saved rather than dropped in silence (A2-R4 §G.8)');
// Completed: now it is a CREATE.
addRowEl._fields = {
  source_warehouse_id: 'WH-CN-KMF-01', source_warehouse_id__name: 'KM Factory CN', source_warehouse_id__type: 'FACTORY', source_warehouse_id__code: 'KMFCN',
  destination_warehouse_id: 'MARKETPLACE_DESTINATION:Amazon', destination_warehouse_id__name: 'Amazon', destination_warehouse_id__type: 'MARKETPLACE_DESTINATION',
  qty: '520', shipping_method: 'Sea Express', expected_arrival: ''
};
addW.api.collect(SKU);
var addRow = modelRows(addW)[0];
eq(modelRows(addW).length, 1, 'F7  completing it produces exactly ONE route, not a second');
eq(addRow.route_intent, 'CREATE_NEW_ROUTE', 'F7a declared as CREATE_NEW_ROUTE');
ok(!!addRow.allocation_draft_line_id, 'F7b now holding a stable line id so every later edit updates the same row');
ok(addW.counts.touched > 0, 'F7c and it is marked for writing');
eq(addRow.route_provenance, 'USER_EXPLICIT_ADD_ROUTE', 'F7d provenance unchanged by completion');
var addInst = addRow.client_route_instance_id;
ok(!!addInst, 'F8  it received a NEW client_route_instance_id');

// §F.4 — Add Route cannot revive a cancelled draft: the row it creates holds no header identity at all.
eq(String(modelRows(addW)[0].allocation_draft_id || ''), '',
  'F9  the row + Add Route created is bound to NO existing header — it cannot resurrect a cancelled one');

// ================================================================================================================
section('§G — CANCEL / REMOVE LIFECYCLE');
// ================================================================================================================
// hydrate one persisted active route, remove it explicitly, then run every repaint the page can perform.
var g = makeWorld({ bySku: (function () { var m = {}; m[SKU] = [persistedRoute()]; return m; })() });
g.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeCount(g), 1, 'G1  a persisted active route hydrates and renders');
eq(lastTotal(g), 800, 'G1a with its stored quantity');
ok(!isEmptyState(g), 'G1b so no empty state');
// the explicit removal: the DOM row goes, the model is rebuilt from what is left
g.list.removeChild(g.list._rows[0]);
delete g.model.bySku[SKU];
g.api.edit(SKU);
eq(routeCount(g), 0, 'G2  after an explicit remove, zero routes');
eq(modelRows(g).length, 0, 'G3  and the model holds none');
ok(isEmptyState(g), 'G4  the plan shows the empty-plan message...');
eq([composerCount(g), g.list._byClass('exec-route-composer')[0]._fields.qty], [1, ''],
  'G4a ...and one BLANK composer takes the slot — never the cancelled route\'s quantity, never the suggestion');
eq(lastTotal(g), 0, 'G5  Total = 0');
// the Suggested Qty is STILL 520 for this station — and nothing acts on it
eq(sugFn(SKUDATA), 520, 'G6  the Suggested Qty is still 520');
var gWrites = g.counts.persistScheduled;
for (var gi = 0; gi < 4; gi++) g.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeCount(g), 0, 'G7  four repaints (render / re-render / Search / reload) leave it empty');
ok(isEmptyState(g), 'G7a still the empty-plan message');
eq(composerCount(g), 1, 'G7a1 and still exactly ONE composer after four repaints');
eq(lastTotal(g), 0, 'G7b Total still 0 — no 520 placeholder returned');
eq(g.counts.persistScheduled, gWrites, 'G8  and no second write was sent by any of them');
eq(g.counts.aiPlanCalls, 0, 'G9  nothing called AI Plan on the page\'s behalf');

// ================================================================================================================
section('§H — SUBMIT SAFETY');
// ================================================================================================================
function pfInput(routes) {
  return { scope: CTX, appliedScopeKey: 'resus|us|amazon', panels: [{ sku: SKU, execState: 'READY' }],
    routes: routes, pendingWrites: [], inFlightWrites: [], dirtyAfterWrite: [], pendingCancels: [],
    saveFailed: [], routesMissingDestination: [], duplicateCorruption: [], zeroLineHeaderCount: 0 };
}
var h1 = PF.evaluate(pfInput([]));
eq([h1.ok, h1.code], [false, 'NO_EXECUTION_ROUTES'], 'H1  zero routes cannot build a Weekly Shipping Plan');
// §H.2/H.3 — the Qty-only placeholder, exactly as the old collect would have produced it.
var phantom = { sku: SKU, scopeKey: 'resus|us|amazon', allocation_draft_id: '', allocation_draft_line_id: '',
  qty: 520, complete: false, missingFields: ['From', 'To', 'Method'], routeLabel: '(blank)', route_provenance: '' };
var h2 = PF.evaluate(pfInput([phantom]));
eq([h2.ok, h2.code], [false, 'ROUTE_PROVENANCE_UNKNOWN'],
  'H2  a Qty-only placeholder is refused for what it IS, not advised on for what it lacks');
eq(h2.candidate.routeCount, 0, 'H2a and it never enters the submit candidate collection');
eq(h2.candidate.draftIds.length, 0, 'H2b contributing no draft id');
// beside a perfectly good route, the placeholder still blocks — and names itself as the reason
var good = { sku: SKU, scopeKey: 'resus|us|amazon', allocation_draft_id: 'SAD-1', allocation_draft_line_id: 'SADL-1',
  qty: 800, complete: true, missingFields: [], route_provenance: 'PERSISTED_ACTIVE_DRAFT',
  destination_type: 'MARKETPLACE', destination_code: 'Amazon', shipping_method: 'Sea Express' };
var h3 = PF.evaluate(pfInput([good, phantom]));
eq(h3.code, 'ROUTE_PROVENANCE_UNKNOWN', 'H3  a stale placeholder beside a valid route blocks the submit');
eq(h3.blocking.reasons.map(function (r) { return r.reason; }), ['ROUTE_PROVENANCE_UNKNOWN'],
  'H3a naming the placeholder, and only it');
// §H.4 — a legal-provenance complete route submits.
var h4 = PF.evaluate(pfInput([good]));
eq([h4.ok, h4.code], [true, ''], 'H4  a complete route of legal provenance is a valid candidate');
eq(h4.candidate.routeCount, 1, 'H4a counted once');
eq(h4.candidate.totalQty, 800, 'H4b at its own stored quantity');
// §H.5 — an implicit route with no draft identity is not treated as an Add Route.
var h5 = PF.evaluate(pfInput([{ sku: SKU, scopeKey: 'resus|us|amazon', allocation_draft_id: '', allocation_draft_line_id: '',
  qty: 520, complete: true, missingFields: [], route_provenance: '', shipping_method: 'Sea Express',
  destination_type: 'MARKETPLACE', destination_code: 'Amazon' }]));
eq(h5.code, 'ROUTE_PROVENANCE_UNKNOWN',
  'H5  a COMPLETE route with no provenance is still refused — completeness is not consent');
// §H.6 — A3's whole-batch incomplete blocking is untouched.
var h6 = PF.evaluate(pfInput([good, { sku: 'OTHER-SKU', scopeKey: 'resus|us|amazon', allocation_draft_id: 'SAD-2',
  allocation_draft_line_id: 'SADL-2', qty: 100, complete: false, missingFields: ['Method'],
  route_provenance: 'PERSISTED_ACTIVE_DRAFT', routeLabel: 'TW->Amazon' }]));
eq(h6.code, 'EXECUTION_PLAN_ROUTE_INCOMPLETE', 'H6  A3 whole-batch incomplete blocking is unchanged');
eq(h6.ok, false, 'H6a and it still blocks the whole batch, never submitting the routes beside it');
eq(h6.candidate.routeCount, 0, 'H6b with no partial candidate built');
// the snapshot actually supplies the field the gate reads
ok(/route_provenance: _irRouteProvenanceOf_\(r\)/.test(code(PAGE)),
  'H7  the submit snapshot supplies each route\'s EFFECTIVE provenance, so the gate is live and not hand-fed');
// THE TRANSITION HAZARD, found by running the existing A2 submit suite against the new gate and fixed rather
// than papered over: a model row restored from a pre-E1 recovery cache carries no provenance field but DOES
// carry its stored identities. Refusing to submit a route the database demonstrably holds would have been a
// worse failure than the phantom this round removes.
eq(PF.evaluate(pfInput([{ sku: SKU, scopeKey: 'resus|us|amazon', allocation_draft_id: 'SAD-1',
  allocation_draft_line_id: 'SADL-1', qty: 800, complete: true, missingFields: [],
  destination_type: 'MARKETPLACE', destination_code: 'Amazon', shipping_method: 'Sea Express' }])).ok, true,
  'H8  a pre-E1 cached route with BOTH stored identities and no provenance field still submits');
eq(RP.of({ allocation_draft_id: 'SAD-1', allocation_draft_line_id: 'SADL-1' }), 'PERSISTED_ACTIVE_DRAFT',
  'H8a because the identity pair IS the declaration — the one derivation §C.6 permits');
eq(RP.of({ qty: 520 }), '', 'H8b and nothing else stands in for one');

// ================================================================================================================
section('§I — SCOPE AUDIT: every flow that could rebuild a placeholder');
// ================================================================================================================
// Each of these is the same executed question — after this flow, how many routes exist and how many writes
// were sent — because "which flow reseeds it" is only answerable by running them.
// The write measure is ROUTES MARKED FOR WRITING. The sessionStorage recovery cache is deliberately not
// counted: it is not a write to the database, and an edit-driven flow (a removal, a flush) legitimately
// refreshes it. What must be zero is any route queued to be written, because that is the only thing that can
// reach shipping_allocation_drafts.
function flowResult(label, fn) {
  var w = makeWorld({});
  w.api.init(SKU, SKUDATA, { catalogueSettled: true });
  var touched0 = w.counts.touched;
  fn(w);
  eq([routeCount(w), isEmptyState(w), modelRows(w).length, w.counts.touched - touched0], [0, true, 0, 0],
    'I  ' + label + ' → 0 routes, empty state, 0 model rows, 0 routes queued to write');
  return w;
}
flowResult('initial Search', function () {});
flowResult('SKU row expand', function (w) { w.api.init(SKU, SKUDATA, { catalogueSettled: true }); });
flowResult('Recommendation render', function (w) { w.api.sync(SKU); });
flowResult('AI Plan open/cancel (no generation)', function (w) { w.api.init(SKU, SKUDATA, { catalogueSettled: true }); });
flowResult('AI Plan zero result', function (w) { w.model.bySku = {}; w.api.init(SKU, SKUDATA, { catalogueSettled: true }); });
flowResult('AI Plan failure (plan left as it was)', function (w) { w.api.sync(SKU); });
flowResult('draft hydration with no active draft', function (w) { w.api.init(SKU, SKUDATA, {}); });
flowResult('all routes cancelled', function (w) { delete w.model.bySku[SKU]; w.api.edit(SKU); });
flowResult('filter change', function (w) { w.api.init(SKU, SKUDATA, { catalogueSettled: true }); });
flowResult('Retry Search', function (w) { w.api.init(SKU, SKUDATA, { catalogueSettled: true }); });
flowResult('hard reload', function (w) { var w2 = makeWorld({}); w2.api.init(SKU, SKUDATA, { catalogueSettled: true }); });
flowResult('DOM re-render', function (w) { w.api.init(SKU, SKUDATA, { catalogueSettled: true }); w.api.sync(SKU); });
flowResult('coalesced save flush (nothing to flush)', function (w) { w.api.collect(SKU); });

// route removal is measured on a world that HAS a route (covered in §G); asserted here for the audit list
eq([routeCount(g), isEmptyState(g)], [0, true], 'I  route removal → 0 routes, empty state');

// THE STALE PLACEHOLDER, EXECUTED: a row from an older cached build, adopted by the collect before this round.
var stale = makeWorld({});
stale.api.init(SKU, SKUDATA, { catalogueSettled: true });
stale.list.appendChild(makeRowEl({ source_warehouse_id: '', destination_warehouse_id: '', qty: '520',
  shipping_method: '', expected_arrival: '' }, {}));
eq(routeCount(stale), 1, 'I1  a stale Qty-520 row is present in the DOM');
stale.api.collect(SKU);
eq(modelRows(stale).length, 0, 'I2  the collect refuses to adopt it into the canonical model');
eq(routeCount(stale), 0, 'I3  and drops the row rather than leaving a phantom on screen');
ok(isEmptyState(stale), 'I4  restoring the empty state');
ok(/STALE_EXECUTION_ROUTE_DROPPED/.test(stale.counts.warnings.join(' ')),
  'I5  saying so — a row that vanishes with no explanation is this round\'s own failure mode');
eq(stale.counts.touched, 0, 'I6  nothing was marked for writing');

// ================================================================================================================
section('§K — RELEASE IDENTITY');
// ================================================================================================================
// RESTATED (F1-7N-FC-1B-E2): `currentAppToken() === 'fc1b-executionintent-20260903'` is the equality-with-now
// AGAIN — written into the very round that had just restated eleven other suites for exactly it. E2
// legitimately mints its own token, so all of §K failed while describing a correct tree. E1's token is a
// FLOOR: it was MINTED, the series has not moved behind it, and nothing may ever be served from HF1's
// published token again. None of those can be falsified by a later round doing the right thing.
ok(RO.tokenIndex('fc1b-executionintent-20260903') !== -1, 'K1  E1 minted its own cache token');
ok(RO.tokenIndex(RO.currentAppToken()) >= RO.tokenIndex('fc1b-executionintent-20260903'),
  'K1a and the series has not moved behind it (current: ' + RO.currentAppToken() + ')');
ok(RO.tokenIndex('fc1b-executionintent-20260903') > RO.tokenIndex('fc1ar1-cancelrelease-20260903'),
  'K1b strictly after HF1\'s, which was published');
eq((INDEX.match(/\?v=fc1ar1-cancelrelease-20260903/g) || []).length, 0,
  'K2  zero production references remain on HF1\'s published token');
ok(RO.appTokenRefCount(INDEX) >= 19, 'K3  and the application set carries ONE current token (' + RO.appTokenRefCount(INDEX) + ' refs)');
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '', 'K4  nothing is left behind on a superseded application token');
var idxT = RO.parseIndexTokens(INDEX);
eq(idxT['assets/js/pages/inventory-replenishment.js'], RO.currentAppToken(),
  'K5  the page this round changed carries the CURRENT token');
eq(idxT['assets/js/utils/inventory-compat.js'], RO.currentAppToken(),
  'K5a and so does the shared module it changed with it — they cannot be served from different rounds');

// ================================================================================================================
section('§N — MUTATIONS: every defect this round removed, reintroduced');
// ================================================================================================================
function worldFrom(src) {
  var w = makeWorld({});
  w.api = new Function(w.names.concat(['replenAllocationDraft', '__totals']), src)
    .apply(null, w.names.map(function (n) { return w.deps[n]; }).concat([w.model, w.counts.totals]));
  return w;
}

mut('N1  the suggestedQty fallback reintroduced into initializeShippingAllocation', function () {
  var m = worldFrom(reseed(makeWorld({}).src));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  return routeCount(m) !== 0 || isEmptyState(m) === false;
});

mut('N2  a default empty route pushed instead of the empty state', function () {
  var m = worldFrom(swap(makeWorld({}).src,
    '    _execRenderEmptyState_(sku);\n    updateShippingAllocationTotal(sku);',
    "    _renderExecutionRoute(sku, { qty: 0, route_provenance: 'USER_EXPLICIT_ADD_ROUTE' });\n    updateShippingAllocationTotal(sku);"));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  return routeCount(m) !== 0;
});

mut('N3  a missing identity treated as an implicit create', function () {
  // the collect adopts a provenance-less row instead of dropping it
  var m = worldFrom(swap(makeWorld({}).src, 'if (!row.route_provenance) {', 'if (false) {'));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  m.list.appendChild(makeRowEl({ source_warehouse_id: '', destination_warehouse_id: '', qty: '520', shipping_method: '', expected_arrival: '' }, {}));
  m.api.collect(SKU);
  return modelRows(m).length !== 0;
});

mut('N4  a cancelled header hydrated', function () {
  var h = swap(PAGE, "lo(d.status) !== 'cancelled' && ", '');
  return !/lo\(d\.status\) !== 'cancelled'/.test(code(extractFn(h, '_hydrateAllocationDraftFromDb')));
});

mut('N5  an orphan / zero-active-line header hydrated as a route', function () {
  var h = swap(PAGE, "lo(l.lineStatus || l.line_status) !== 'cancelled'", 'true');
  return !/lo\(l\.lineStatus \|\| l\.line_status\) !== 'cancelled'/.test(code(extractFn(h, '_hydrateAllocationDraftFromDb')));
});

mut('N6  a zero-provenance route allowed into the submit candidate set', function () {
  // F1-7N-FC-1B-E2 restated the anchor: the gate reads `_judged`, which is input.routes minus PRISTINE
  // composers. The mutant and the property are unchanged.
  var evalSrc = CMPSRC.replace(
    'var noProv = _judged.filter(function (r) { return !routeProvenanceOf(r); });',
    'var noProv = [];');
  if (evalSrc === CMPSRC) throw new Error('mutation did not apply to submitPreflight');
  var mod = { exports: {} };
  new Function('module', 'exports', evalSrc)(mod, mod.exports);
  var v = mod.exports.IRSubmitPreflight.evaluate(pfInput([phantom]));
  return v.code !== 'ROUTE_PROVENANCE_UNKNOWN';
});

// THE RESEED THIS ROUND EXISTS TO PREVENT, at the exact place it happened: the operator empties the plan and
// the next pure re-render fills the slot again with the Suggested Qty. That is the live cancel sequence.
mut('N7  the plan reseeded after the final cancel', function () {
  var bySku = {}; bySku[SKU] = [persistedRoute()];
  var m = worldFrom(reseed(makeWorld({ bySku: bySku }).src));
  m.model.bySku = JSON.parse(JSON.stringify(bySku));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  m.list._rows.slice().forEach(function (r) { m.list.removeChild(r); });
  delete m.model.bySku[SKU];
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });   // the pure re-render after the cancel
  return routeCount(m) !== 0;
});

mut('N8  the empty state marked dirty', function () {
  var m = worldFrom(swap(makeWorld({}).src,
    '    _execRenderEmptyState_(sku);\n    updateShippingAllocationTotal(sku);',
    '    _execRenderEmptyState_(sku); _irMarkRouteTouched_(sku, "EMPTY");\n    updateShippingAllocationTotal(sku);'));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  return m.counts.touched !== 0;
});

mut('N9  persistence called from the recommendation render', function () {
  var m = worldFrom(swap(makeWorld({}).src,
    '    _execRenderEmptyState_(sku);\n    updateShippingAllocationTotal(sku);',
    '    _execRenderEmptyState_(sku); _scheduleDraftDbPersist(sku);\n    updateShippingAllocationTotal(sku);'));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  return m.counts.persistScheduled !== 0;
});

mut('N10 the provenance gate removed from the only row creator', function () {
  var m = worldFrom(swap(makeWorld({}).src, '    if (!_isComposer && !_prov) {', '    if (false) {'));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  var painted = m.api.render(SKU, { qty: 520 });
  return painted !== false || routeCount(m) !== 0;
});

mut('N11 a forbidden provenance name accepted as legal', function () {
  var s = CMPSRC.replace("var IR_FORBIDDEN_ROUTE_PROVENANCE = ['SUGGESTED_QTY_PLACEHOLDER'",
    "var IR_FORBIDDEN_ROUTE_PROVENANCE = ['__NONE__'").replace(
    'var IR_LEGAL_PROVENANCE_LIST = [IR_ROUTE_PROVENANCE.PERSISTED_ACTIVE_DRAFT,',
    "var IR_LEGAL_PROVENANCE_LIST = ['SUGGESTED_QTY_PLACEHOLDER', IR_ROUTE_PROVENANCE.PERSISTED_ACTIVE_DRAFT,");
  if (s === CMPSRC) throw new Error('mutation did not apply');
  var mod = { exports: {} };
  new Function('module', 'exports', s)(mod, mod.exports);
  return mod.exports.IRRouteProvenance.isLegal('SUGGESTED_QTY_PLACEHOLDER') === true;
});

mut('N12 the zero-route Submit refusal removed', function () {
  // F1-7N-FC-1B-E2 restated the anchor: the zero-route check now reads the JUDGED set, so a screen holding
  // only a pristine composer still answers NO_EXECUTION_ROUTES. The mutant is unchanged.
  var s = CMPSRC.replace("      out.code = C.NO_EXECUTION_ROUTES; return out;", '');
  if (s === CMPSRC) throw new Error('mutation did not apply');
  var mod = { exports: {} };
  new Function('module', 'exports', s)(mod, mod.exports);
  var v = mod.exports.IRSubmitPreflight.evaluate(pfInput([]));
  return v.code !== 'NO_EXECUTION_ROUTES';
});

mut('N13 A2-R4 regression: an incomplete route stripped of its persisted identity', function () {
  var w = makeWorld({});
  w.api.init(SKU, SKUDATA, { catalogueSettled: true });
  // a hydrated route that has gone briefly incomplete must KEEP its ids (A2-R4 §F.5/§F.6)
  w.list.appendChild(makeRowEl({ source_warehouse_id: 'WH-CN-KMF-01', source_warehouse_id__name: 'KM Factory CN',
    destination_warehouse_id: 'MARKETPLACE_DESTINATION:Amazon', destination_warehouse_id__type: 'MARKETPLACE_DESTINATION',
    qty: '800', shipping_method: '', expected_arrival: '' },
    { 'data-line-id': 'SADL-K2-LIVE-1', 'data-draft-id': 'SAD-K2-LIVE-1',
      'data-route-provenance': 'PERSISTED_ACTIVE_DRAFT', 'data-route-instance': 'CRI-KEEP' }));
  w.api.collect(SKU);
  var r = modelRows(w)[0];
  // the CORRECT result: identity kept, intent still UPDATE_EXISTING. The mutation is the historical bug.
  // The A2-R4 invariant is the BASELINE here, so if the shipped collect has stopped honouring it that is a
  // real regression and must not be reported as a caught mutant.
  if (!(r && r.allocation_draft_line_id === 'SADL-K2-LIVE-1' && r.route_intent === 'UPDATE_EXISTING')) {
    throw new Error('A2-R4 BASELINE BROKEN: a briefly-incomplete route lost its identity (line=' +
      (r && r.allocation_draft_line_id) + ', intent=' + (r && r.route_intent) + ')');
  }
  var m = worldFrom(swap(makeWorld({}).src,
    "row.allocation_draft_line_id = lineId;      // '' only if it was never persisted",
    "row.allocation_draft_line_id = ''; row.allocation_draft_id = '';"));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  m.list.appendChild(makeRowEl({ source_warehouse_id: 'WH-CN-KMF-01', source_warehouse_id__name: 'KM Factory CN',
    destination_warehouse_id: 'MARKETPLACE_DESTINATION:Amazon', destination_warehouse_id__type: 'MARKETPLACE_DESTINATION',
    qty: '800', shipping_method: '', expected_arrival: '' },
    { 'data-line-id': 'SADL-K2-LIVE-1', 'data-draft-id': 'SAD-K2-LIVE-1',
      'data-route-provenance': 'PERSISTED_ACTIVE_DRAFT', 'data-route-instance': 'CRI-KEEP' }));
  m.api.collect(SKU);
  var mr = modelRows(m)[0];
  return !mr || mr.allocation_draft_line_id !== 'SADL-K2-LIVE-1';
});

// ================================================================================================================
console.log('\n---');
console.log(pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail) process.exitCode = 1;
