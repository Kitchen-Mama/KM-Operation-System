// ================================================================================================================
// F1-7N-FC-1B-E2 — MANUAL ROUTE COMPOSER + AI PLAN EXECUTION MATERIALIZATION
// ----------------------------------------------------------------------------------------------------------------
// TWO REPORTED PROBLEMS, AND THEY HAVE OPPOSITE CAUSES.
//
// (1) E1 WAS RIGHT ABOUT THE ROUTE AND WRONG ABOUT THE INPUT. Removing the Suggested-Qty phantom removed a row
//     that pretended to be a decision — and it also removed the only place an operator with no active route
//     could type one. The fix is not to put the phantom back. It is to distinguish the two things the one row
//     was doing: a COMPOSER is an input surface, an EXECUTION ROUTE is a decision. Every property that made the
//     phantom dangerous is addressed by name: the composer's Qty is BLANK (no number to mistake for a choice),
//     a PRISTINE composer carries no `.exec-route-row` class so the collector's own SELECTOR passes it by, it
//     is dropped from every preflight judgement, and it holds no identity until all four fields are legal.
//
// (2) AI PLAN'S SILENCE IS NOT A MISSING CONTRACT. Traced end to end and EXECUTED: the router action, the
//     browser adapter, the 61_ writer and the KMWRR route allocator are ALL present and complete. KMWRR
//     produced, from the live CO1100-R / ResUS / US / Amazon shape, a route with From WH-TW-CN-FACTORY-YOUXIN,
//     To marketplace Amazon, Qty 520, Method sea_express, last-mile DDP and an ETA — AI_RANKED, conserved.
//     What stops it reaching the screen is a FEATURE FLAG, INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false,
//     whose flip 00_config.gs itself records as USER-owned. So this round does not flip it; it stops the
//     message from implying that a plan ran, and names why execution materialization did not happen.
//
// Run: node assets/tests/manual-route-composer-and-ai-plan-materialization-f1-7n-fc-1b-e2.test.js
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
var PF = CMP.IRSubmitPreflight, RP = CMP.IRRouteProvenance, RC = CMP.IRRouteComposer;
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var INDEX = read('index.html');
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G01 = read('assets/specs/active/apps-script/01_router.gs');
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var KMRA = require(path.join(ROOT, 'assets/js/core/supply-planning-route-authority.js'));
var KMWRR = require(path.join(ROOT, 'assets/js/core/supply-planning-weekly-route-derivation.js'));

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
// The page is CRLF and this file is LF, so a literal multi-line anchor never matches. A missing anchor THROWS,
// so a mutation that has stopped applying is a loud PROBE ERROR rather than a surviving mutant.
function swap(src, find, repl) {
  var re = new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));
  if (!re.test(src)) throw new Error('swap anchor not found: ' + String(find).slice(0, 90));
  return src.replace(re, repl.replace(/\$/g, '$$$$'));
}

var CTX = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var SKU = 'CO1100-R';
var SUGGESTED = 520;
var UID = 0;

// ================================================================================================================
// THE HARNESS. Hand-built DOM objects — never an HTML parser — and the class list is modelled honestly, because
// "a pristine composer is invisible to the collector" is a claim about a SELECTOR and can only be measured if
// querySelectorAll actually discriminates on the class.
// ================================================================================================================
function makeRowEl(fields, attrs, className) {
  var f = {}, a = {};
  Object.keys(fields || {}).forEach(function (k) { f[k] = String(fields[k] == null ? '' : fields[k]); });
  Object.keys(attrs || {}).forEach(function (k) { a[k] = String(attrs[k] == null ? '' : attrs[k]); });
  var el = {
    className: className === undefined ? 'exec-route-row ir-exec-plan__grid' : className,
    _fields: f, _attr: a,
    getAttribute: function (k) { return a[k] === undefined ? null : a[k]; },
    setAttribute: function (k, v) { a[k] = String(v); },
    removeAttribute: function (k) { delete a[k]; },
    hasClass: function (c) { return String(el.className || '').split(/\s+/).indexOf(c) !== -1; },
    querySelector: function (sel) {
      var m = /\[data-field="([^"]+)"\]/.exec(sel);
      if (!m) return null;
      var name = m[1], cur = el._fields;
      if (!(name in cur)) return null;
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
        // the field element's own route row, which is how onExecutionComposerEdit finds what to promote
        closest: function (s) { return (s === '.ir-exec-plan__grid' || s === '.exec-route-row') ? el : null; },
        set value(v) { el._fields[name] = String(v); },
        get value() { return el._fields[name]; }
      };
    },
    parentNode: null
  };
  return el;
}

function makeList() {
  var self = {
    _html: '', _rows: [],
    set innerHTML(v) { self._html = String(v); self._rows = []; },
    get innerHTML() { return self._html; },
    // RESTATED (F1-7N-FC-1B-E2): appending used to CLEAR _html, which was harmless while nothing was ever
    // appended after the empty-plan message. E2 appends a composer BESIDE that message, and a real
    // container keeps both, so wiping it here would have modelled a DOM that does not exist.
    appendChild: function (el) { el.parentNode = self; self._rows.push(el); },
    removeChild: function (el) { var i = self._rows.indexOf(el); if (i >= 0) self._rows.splice(i, 1); return el; },
    _byClass: function (c) { return self._rows.filter(function (r) { return r.hasClass && r.hasClass(c); }); },
    querySelector: function (sel) {
      if (sel === '.exec-route-row') return self._byClass('exec-route-row')[0] || null;
      if (sel === '.exec-route-composer') return self._byClass('exec-route-composer')[0] || null;
      // F1-7N-FC-1B-E3 §A - the empty-plan MESSAGE is gone (the empty plan is one blank composer row now,
      // named by the column header above it), so this selector no longer exists in production.
      return null;
    },
    querySelectorAll: function (sel) {
      if (sel === '.exec-route-row') return self._byClass('exec-route-row');
      if (sel === '.exec-route-composer') return self._byClass('exec-route-composer');
      if (sel === 'input[data-field="qty"]') {
        // the shipped total sums EVERY qty input in the container, composer included — measured, not assumed
        return self._rows.map(function (r) { return { value: String(r._fields.qty || '') }; });
      }
      if (sel === '[data-route-instance]' || sel === '[data-line-id]') return self._rows.slice();
      return [];
    }
  };
  return self;
}

function makeWorld(opts) {
  opts = opts || {};
  var list = makeList();
  var w = {
    list: list,
    model: { context: CTX, allocationDraftId: '', allocationDraftIds: [], bySku: opts.bySku ? JSON.parse(JSON.stringify(opts.bySku)) : {}, targetDays: '' },
    counts: { persistScheduled: 0, touched: 0, sessionWrites: 0, totals: [], warnings: [], notices: [] },
    suggested: opts.suggested === undefined ? SUGGESTED : opts.suggested,
    // the warehouse/method catalogue the fixture offers. Empty by default so a composer starts with nothing
    // resolvable, which is the real state of a page whose operator has chosen no From yet.
    cand: opts.cand || { from: [], to: [], isAmazon: true },
    methods: opts.methods || { methods: [], status: 'EMPTY_CONFIGURATION' }
  };
  var win = { IRRouteProvenance: RP, IRRouteComposer: RC, IRDraft: CMP.IRDraft, IRWarehouse: CMP.IRWarehouse, KM: {} };
  w.win = win;

  var deps = {
    window: win,
    document: {
      getElementById: function (id) {
        if (id === 'shipping-methods-' + SKU) return list;
        if (id === 'allocation-total-' + SKU) return { textContent: '' };
        return null;
      },
      createElement: function () {
        var el = makeRowEl({ source_warehouse_id: '', destination_warehouse_id: '', qty: '',
          shipping_method: '', expected_arrival: '' }, {}, '');
        Object.defineProperty(el, 'innerHTML', {
          set: function (v) {
            // F1-7N-FC-1B-E3 §A.5 - the Qty input carries its own accessible label now, so `data-field="qty"`
          // and `value=` are no longer adjacent. Matching the ATTRIBUTES of the qty input rather than one
          // exact byte sequence is what the harness meant all along.
          var m = /data-field="qty"[^>]*?\svalue="([^"]*)"/.exec(String(v));
            el._fields.qty = m ? m[1] : '';
            el._methodDisabled = /data-field="shipping_method"[^>]*\sdisabled/.test(String(v));
            el._html = String(v);
          },
          get: function () { return el._html || ''; }
        });
        return el;
      }
    },
    getReplenishmentData: function () { return [{ sku: SKU, country: 'US', suggestedQty: w.suggested }]; },
    _replenSelectedScope: function () { return CTX; },
    _replenCtx: function () { return CTX; },
    _replenCtxEq: function (a, b) { return !!a && !!b && a.company === b.company && a.country === b.country && a.marketplace === b.marketplace; },
    _irRouteEtaFor: function () { return { available: false, date: '', text: '', source: '' }; },
    _execWarehouseCandidates: function () { return w.cand; },
    _execResolveIdByName: function () { return ''; },
    _execResolveMethods: function () { return w.methods; },
    _execMethodRouteCtx: function () { return {}; },
    _execMethodOptionsHtml: function () { return ''; },
    _execFromOptionsHtml: function () { return ''; },
    _execToOptionsHtml: function () { return ''; },
    _execEsc: function (v) { return String(v == null ? '' : v); },
    _irCanonicalDateOrBlank_: function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''; },
    _irMatState: { status: 'READY', bySku: (function () { var m = {}; m[SKU] = { calculation_status: 'READY', d90_suggested_qty: opts.suggested === undefined ? SUGGESTED : opts.suggested }; return m; })() },
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
    extractFn(PAGE, '_irComposerKind_'),
    extractFn(PAGE, '_irIsComposerEl_'),
    extractFn(PAGE, '_irPromoteComposerToTouched_'),
    extractFn(PAGE, 'onExecutionComposerEdit'),
    extractFn(PAGE, '_execRenderEmptyState_'),
    extractFn(PAGE, '_renderManualComposer_'),
    // F1-7N-FC-1B-E3 - `_execClearEmptyState_` is now `_execDropPristineComposers_`: same call site, same
    // reason (a plan holding a real route must not still show the empty plan's furniture), acting on the
    // composer instead of the deleted message.
    extractFn(PAGE, '_execDropPristineComposers_'),
    extractFn(PAGE, '_execSyncEmptyState_'),
    extractFn(PAGE, '_renderExecutionRoute'),
    extractFn(PAGE, '_allocationDraftRowsFor'),
    extractFn(PAGE, '_irSuggestedQtyState_'),
    extractFn(PAGE, '_irSuggestedQtyNumber_'),
    'function updateShippingAllocationTotal(sku){var el=document.getElementById("shipping-methods-"+sku);if(!el)return;' +
      'var t=0;el.querySelectorAll(\'input[data-field="qty"]\').forEach(function(i){t+=parseInt(i.value)||0;});' +
      '__totals.push(t);}',
    extractFn(PAGE, '_saveAllocationDraftFromDom'),
    extractFn(PAGE, 'onExecutionRouteEdit'),
    extractFn(PAGE, 'initializeShippingAllocation'),
    'return { init: initializeShippingAllocation, render: _renderExecutionRoute, composer: _renderManualComposer_,' +
      ' collect: _saveAllocationDraftFromDom, edit: onExecutionRouteEdit, composerEdit: onExecutionComposerEdit,' +
      ' sync: _execSyncEmptyState_, promote: _irPromoteComposerToTouched_, isComposerEl: _irIsComposerEl_,' +
      ' dropPristine: _execDropPristineComposers_ };'
  ].join('\n');

  w.api = new Function(names.concat(['replenAllocationDraft', '__totals']), src)
    .apply(null, names.map(function (n) { return deps[n]; }).concat([w.model, w.counts.totals]));
  w.deps = deps; w.src = src; w.names = names;
  return w;
}

function worldFrom(src, opts) {
  var w = makeWorld(opts || {});
  w.api = new Function(w.names.concat(['replenAllocationDraft', '__totals']), src)
    .apply(null, w.names.map(function (n) { return w.deps[n]; }).concat([w.model, w.counts.totals]));
  return w;
}

function composers(w) { return w.list._byClass('exec-route-composer'); }
function routeRows(w) { return w.list._byClass('exec-route-row'); }
function modelRows(w) { return (w.model.bySku && w.model.bySku[SKU]) || []; }
function lastTotal(w) { var t = w.counts.totals; return t.length ? t[t.length - 1] : null; }
// RESTATED (F1-7N-FC-1B-E3 §A): the empty-plan message is removed, so "the plan is empty" is observed as
// the shape the empty plan has: no execution route and exactly one pristine composer. Stricter than looking
// for a string - a missing composer, a second one, or a route all falsify it.
function isEmptyPlan(w) {
  return routeRows(w).length === 0 && composers(w).length === 1 &&
    String(composers(w)[0].getAttribute('data-composer-touched') || '') !== '1';
}

var SKUDATA = { sku: SKU, country: 'US', marketplace: 'Amazon', suggestedQty: SUGGESTED, plannedQty: 0 };

// A catalogue in which a real route CAN be composed, so completion is measured rather than assumed.
var CAND_FULL = {
  from: [{ warehouseId: 'WH-TW-CN-FACTORY-YOUXIN', warehouseCode: 'CNYOUXIN', country: 'CN' }],
  to: [{ warehouseId: 'MARKETPLACE_DESTINATION:Amazon', logicalDestination: true }],
  isAmazon: true
};
function fillComplete(rowEl) {
  rowEl._fields.source_warehouse_id = 'WH-TW-CN-FACTORY-YOUXIN';
  rowEl._fields.source_warehouse_id__name = 'CN Youxin';
  rowEl._fields.source_warehouse_id__type = 'FACTORY';
  rowEl._fields.source_warehouse_id__code = 'CNYOUXIN';
  rowEl._fields.destination_warehouse_id = 'MARKETPLACE_DESTINATION:Amazon';
  rowEl._fields.destination_warehouse_id__name = 'Amazon';
  rowEl._fields.destination_warehouse_id__type = 'MARKETPLACE_DESTINATION';
  rowEl._fields.qty = '520';
  rowEl._fields.shipping_method = 'sea_express';
}
function persistedRoute(over) {
  var r = {
    route_provenance: RP.SOURCES.PERSISTED_ACTIVE_DRAFT,
    allocation_draft_id: 'SADH-K2-LIVE-1', allocation_draft_line_id: 'SADL-K2-LIVE-1',
    sku: SKU, qty: 800, planned_qty: 800,
    source_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', ship_from: 'CN Youxin',
    destination_warehouse_id: '', destination_marketplace: 'Amazon', destination: 'Amazon',
    destination_type: 'MARKETPLACE_DESTINATION', destination_token: 'MARKETPLACE_DESTINATION:Amazon',
    shipping_method: 'sea_express', route_group_key: 'GK-1'
  };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
function pfInput(routes) {
  return { scope: CTX, appliedScopeKey: 'resus|us|amazon', panels: [{ sku: SKU, execState: 'READY' }],
    routes: routes, pendingWrites: [], inFlightWrites: [], dirtyAfterWrite: [], pendingCancels: [],
    saveFailed: [], routesMissingDestination: [], duplicateCorruption: [], zeroLineHeaderCount: 0 };
}

// ================================================================================================================
section('§A1 / §B — THE PRISTINE COMPOSER, EXECUTED');
// ================================================================================================================
var w1 = makeWorld({});
w1.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(composers(w1).length, 1, 'A1  with no active draft, EXACTLY ONE pristine composer is rendered');
eq(routeRows(w1).length, 0, 'A2  and ZERO execution routes — a composer is not a route');
// RESTATED (F1-7N-FC-1B-E3): this was a tautology (`x === false || true`), written when the message and the
// composer shared the container and neither was the point of A2. With the message removed there IS a real
// claim to make here, so it is made: an empty plan renders exactly ONE blank row and it is a composer.
ok(isEmptyPlan(w1), 'A2a an empty plan renders exactly one PRISTINE composer and no execution route');
var c1 = composers(w1)[0];
eq(c1._fields.qty, '', 'B1  its Qty is BLANK — never the Suggested Qty, and never 0');
eq(c1._fields.source_warehouse_id, '', 'B2  From is blank');
eq(c1._fields.destination_warehouse_id, '', 'B3  To is blank');
eq(c1._fields.shipping_method, '', 'B4  Method is blank');
eq(c1._methodDisabled, true, 'B5  and the Method select is DISABLED — there is no lane to resolve a carrier for');
eq(c1.getAttribute('data-route-kind'), 'manual-composer', 'B6  the row declares its KIND');
eq(c1.getAttribute('data-route-provenance'), null, 'B7  and carries NO provenance — it is not claiming to be a route');
eq(c1.getAttribute('data-line-id'), null, 'B8  no allocation_draft_line_id');
eq(c1.getAttribute('data-draft-id'), null, 'B8a no allocation_draft_id');
eq(c1.getAttribute('data-group-key'), null, 'B8b no route_group_key');
eq(c1.getAttribute('data-route-instance'), null, 'B9  and NO client_route_instance_id — a pure render mints nothing');
eq(c1.hasClass('exec-route-row'), false,
  'B10 it does NOT carry `.exec-route-row`, so the collector\'s own SELECTOR passes it by');
eq(lastTotal(w1), 0, 'B11 Total = 0');
eq(modelRows(w1).length, 0, 'B12 and the canonical model holds nothing');
eq([w1.counts.persistScheduled, w1.counts.touched, w1.counts.sessionWrites], [0, 0, 0],
  'B13 zero writes of every kind');

// §L.2 — a zero recommendation produces the same composer, because the composer never depended on the number.
var w0 = makeWorld({ suggested: 0 });
w0.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq([composers(w0).length, composers(w0)[0]._fields.qty], [1, ''],
  'B14 Suggested Qty 0 gives the identical blank composer — it was never seeded from the number');

// §B — repeated pure renders must not stack composers.
var wR = makeWorld({});
for (var i = 0; i < 5; i++) wR.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(composers(wR).length, 1, 'B15 five re-renders still leave EXACTLY ONE composer, never a stack of them');
eq(wR.counts.touched, 0, 'B15a and none of them marked anything dirty');

// ================================================================================================================
section('§C — THE COMPOSER STATE MACHINE');
// ================================================================================================================
eq(RC.STATES, { PRISTINE: 'PRISTINE_COMPOSER', TOUCHED_INCOMPLETE: 'TOUCHED_INCOMPLETE_COMPOSER', COMPLETE: 'COMPLETE_COMPOSER' },
  'C1  three states, named');
eq(RC.stateOf({ route_kind: 'manual-composer' }, false), 'PRISTINE_COMPOSER', 'C2  untouched → PRISTINE');
eq(RC.stateOf({ route_kind: 'manual-composer', composer_touched: true }, false), 'TOUCHED_INCOMPLETE_COMPOSER',
  'C3  touched and not yet legal → TOUCHED_INCOMPLETE');
eq(RC.stateOf({ route_kind: 'manual-composer', composer_touched: true }, true), 'COMPLETE_COMPOSER',
  'C4  all four fields legal → COMPLETE');
// §C.3 — completeness is the EXISTING four-field gate, not a non-empty check.
eq(CMP.IRDraft.isRouteComplete({ source_warehouse_id: 'WH-1', destination_marketplace: 'Amazon', qty: 520,
  shipping_method: 'no available method' }), false,
  'C5  a Method that is not an eligible value does NOT complete a route');
eq(CMP.IRDraft.isRouteComplete({ source_warehouse_id: 'WH-1', destination_marketplace: 'Amazon', qty: 0,
  shipping_method: 'sea_express' }), false, 'C5a nor does Qty 0');
eq(CMP.IRDraft.isRouteComplete({ source_warehouse_id: 'WH-1', destination_warehouse_id: 'WH-2',
  destination_marketplace: 'Amazon', qty: 520, shipping_method: 'sea_express' }), false,
  'C5b nor two contradictory destinations — the XOR still holds');
// §C.3 — the alias resolves to the ONE act, not to a fourth source.
eq(RP.SOURCES.USER_EXPLICIT_MANUAL_ROUTE, 'USER_EXPLICIT_ADD_ROUTE',
  'C6  USER_EXPLICIT_MANUAL_ROUTE is the SAME act as USER_EXPLICIT_ADD_ROUTE, aliased not duplicated');
eq(RP.LEGAL.length, 3, 'C6a so the legal provenance set is still THREE');

// ---- PRISTINE -> TOUCHED, executed on the shipped promotion path ----
var wT = makeWorld({});
wT.api.init(SKU, SKUDATA, { catalogueSettled: true });
var cT = composers(wT)[0];
eq(routeRows(wT).length, 0, 'C7  before the first edit the collector can see nothing');
wT.api.collect(SKU);
eq(modelRows(wT).length, 0, 'C7a and a collect run over a pristine composer puts NOTHING in the model');
eq(wT.counts.touched, 0, 'C7b queueing nothing to write');
// the operator types into From
cT._fields.source_warehouse_id = 'WH-TW-CN-FACTORY-YOUXIN';
cT._fields.source_warehouse_id__name = 'CN Youxin';
wT.api.composerEdit(SKU, cT.querySelector('[data-field="source_warehouse_id"]'));
eq(cT.getAttribute('data-composer-touched'), '1', 'C8  the first edit marks the composer TOUCHED');
eq(cT.hasClass('exec-route-row'), true, 'C8a and only now does it become visible to the collector');
eq(composers(wT).length, 1, 'C8b while still declaring itself a composer');
eq(modelRows(wT).length, 1, 'C9  the edit IS preserved in the model — it is not thrown away');
var mT = modelRows(wT)[0];
eq(mT.route_kind, 'manual-composer', 'C9a as a composer');
eq(mT.composer_touched, true, 'C9b in the TOUCHED state');
eq([mT.allocation_draft_id, mT.allocation_draft_line_id], ['', ''],
  'C10 with NO allocation ids minted — §C.2');
eq(mT.route_provenance, '', 'C10a and no provenance, because it is not yet a route');
eq(mT.route_intent, '', 'C10b and no CREATE/UPDATE intent');
eq(wT.counts.touched, 0, 'C11 nothing was queued to write — §C.2 zero DB write');

// §L.6/§L.7/§L.8 — From only, then From+To, then Qty without Method: still zero writes at every step.
eq(CMP.IRDraft.isRouteComplete(mT), false, 'C12 From alone does not complete a route');
cT._fields.destination_warehouse_id = 'MARKETPLACE_DESTINATION:Amazon';
cT._fields.destination_warehouse_id__type = 'MARKETPLACE_DESTINATION';
cT._fields.destination_warehouse_id__name = 'Amazon';
wT.api.composerEdit(SKU, cT.querySelector('[data-field="destination_warehouse_id"]'));
eq([modelRows(wT).length, CMP.IRDraft.isRouteComplete(modelRows(wT)[0])], [1, false],
  'C13 From + To does not complete it either');
eq(wT.counts.touched, 0, 'C13a still zero queued to write');
cT._fields.qty = '520';
wT.api.composerEdit(SKU, cT.querySelector('[data-field="qty"]'));
eq([modelRows(wT).length, CMP.IRDraft.isRouteComplete(modelRows(wT)[0])], [1, false],
  'C14 From + To + Qty with no Method does not complete it');
eq(wT.counts.touched, 0, 'C14a still zero queued to write — §L.8');
eq(modelRows(wT)[0].allocation_draft_line_id, '', 'C14b and still no line id has been minted');

// ---- TOUCHED -> COMPLETE ----
cT._fields.shipping_method = 'sea_express';
wT.api.composerEdit(SKU, cT.querySelector('[data-field="shipping_method"]'));
var mC = modelRows(wT)[0];
eq(modelRows(wT).length, 1, 'C15 completing it produces EXACTLY ONE route, not a second');
eq(mC.route_provenance, 'USER_EXPLICIT_ADD_ROUTE', 'C16 which graduates to USER_EXPLICIT_ADD_ROUTE');
eq(mC.route_intent, 'CREATE_NEW_ROUTE', 'C17 declared as CREATE_NEW_ROUTE');
ok(!!mC.allocation_draft_line_id, 'C18 and NOW mints a stable line id (' + mC.allocation_draft_line_id + ')');
ok(!!mC.client_route_instance_id, 'C18a and a stable client_route_instance_id');
eq(mC.route_kind, undefined, 'C19 it stops declaring itself a composer — it is a route now');
ok(wT.counts.touched > 0, 'C20 and only now is it queued to be written — §C.3');
eq(cT.getAttribute('data-route-kind'), null, 'C20a the DOM row drops its composer kind too');
eq(cT.getAttribute('data-route-provenance'), 'USER_EXPLICIT_ADD_ROUTE', 'C20b and carries the graduated provenance');

// §C.3 last clause / §L.11 — a later edit UPDATES the same ticket. (A2-R4's rule, unchanged.)
var wU = makeWorld({ bySku: (function () { var m = {}; m[SKU] = [persistedRoute()]; return m; })(), cand: CAND_FULL });
wU.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeRows(wU).length, 1, 'C21 a persisted route renders as a route, not a composer');
eq(composers(wU).length, 0, 'C21a and no composer is added beside it — §E.2');
var rU = routeRows(wU)[0];
fillComplete(rU); rU._fields.qty = '640';
wU.api.edit(SKU);
var mU = modelRows(wU)[0];
eq(mU.allocation_draft_line_id, 'SADL-K2-LIVE-1', 'C22 a Qty edit UPDATES the same line id — §L.11');
eq(mU.allocation_draft_id, 'SADH-K2-LIVE-1', 'C22a under the same header');
eq(mU.route_intent, 'UPDATE_EXISTING', 'C22b as UPDATE_EXISTING, never a replacement ticket');

// ================================================================================================================
section('§D — FIELD DEPENDENCY: no Method before there is a lane');
// ================================================================================================================
var renderSrc = code(extractFn(PAGE, '_renderExecutionRoute'));
ok(/_routeResolvable/.test(renderSrc), 'D1  the renderer has an explicit route-resolvable gate');
ok(/var methodDisabled = \(methods\.length && _routeResolvable\)/.test(renderSrc),
  'D2  and the Method select is disabled unless BOTH a lane and eligible methods exist');
// executed: a composer with From only still has Method disabled
var wD = makeWorld({ cand: CAND_FULL, methods: { methods: [{ value: 'sea_express', label: 'Sea Express' }], status: 'OK' } });
wD.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(composers(wD)[0]._methodDisabled, true,
  'D3  EXECUTED: even with eligible methods in the catalogue, a composer with no From/To has Method DISABLED');
// and a fully-known route enables it
var wD2 = makeWorld({ cand: CAND_FULL, methods: { methods: [{ value: 'sea_express', label: 'Sea Express' }], status: 'OK' },
  bySku: (function () { var m = {}; m[SKU] = [persistedRoute()]; return m; })() });
wD2.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeRows(wD2)[0]._methodDisabled, false,
  'D4  EXECUTED: a route whose From and To ARE known gets an enabled Method select');
// §D.4/§D.7 — the two "no method" answers are DIFFERENT answers, and the allocator keeps them apart.
ok(KMWRR.METHOD_UNRESOLVED_REASONS.indexOf('NO_CARRIER_CARD_FOR_LANE') !== -1,
  'D5  NO_CARRIER_CARD_FOR_LANE is a typed method-unresolved reason');
ok(KMWRR.BLOCK_TOKENS.indexOf('ROUTE_METHOD_UNRESOLVED') !== -1 &&
   KMWRR.BLOCK_TOKENS.indexOf('ROUTE_AUTO_RANKING_INSUFFICIENT') !== -1,
  'D6  and "no eligible method" is a DIFFERENT block from "cannot rank the ones there are"');
ok(/NO_ELIGIBLE_METHOD_CONFIGURED/.test(PAGE), 'D6a the page names NO_ELIGIBLE_METHOD_CONFIGURED');
ok(/NO_LEAD_TIME/.test(code(read('assets/js/core/supply-planning-weekly-route-derivation.js'))),
  'D7  §D.7 NO_LEAD_TIME stays a separate reason from NO_ELIGIBLE_METHOD — never merged');

// ================================================================================================================
section('§E — DEFAULT COMPOSER AND ADD ROUTE');
// ================================================================================================================
eq(composers(w1).length, 1, 'E1  active routes = 0 → exactly one pristine composer');
eq(composers(wU).length, 0, 'E2  active routes > 0 → no composer is auto-appended');
// §E.3 / §L.15 — one click, one composer.
var wA = makeWorld({ bySku: (function () { var m = {}; m[SKU] = [persistedRoute()]; return m; })(), cand: CAND_FULL });
wA.api.init(SKU, SKUDATA, { catalogueSettled: true });
var before = routeRows(wA).length + composers(wA).length;
wA.api.render(SKU, { route_provenance: RP.SOURCES.USER_EXPLICIT_ADD_ROUTE });
eq(routeRows(wA).length + composers(wA).length - before, 1,
  'E3  + Add Route once adds EXACTLY ONE row beside the persisted route');
// §E.5 / §L.14 — deleting the final persisted route leaves a BLANK pristine composer, never the old number.
var wDel = makeWorld({ bySku: (function () { var m = {}; m[SKU] = [persistedRoute()]; return m; })(), cand: CAND_FULL });
wDel.api.init(SKU, SKUDATA, { catalogueSettled: true });
eq(routeRows(wDel).length, 1, 'E4  one persisted route on screen');
wDel.list.removeChild(routeRows(wDel)[0]);
delete wDel.model.bySku[SKU];
wDel.api.edit(SKU);
eq(routeRows(wDel).length, 0, 'E5  after the explicit delete, zero execution routes');
eq(composers(wDel).length, 1, 'E5a and ONE fresh pristine composer takes the slot');
eq(composers(wDel)[0]._fields.qty, '',
  'E5b whose Qty is BLANK — not 800 (the deleted route) and not 520 (the suggestion)');
eq(lastTotal(wDel), 0, 'E5c Total = 0');
eq(modelRows(wDel).length, 0, 'E5d the model holds nothing');
eq(wDel.counts.touched, 0, 'E5e and nothing was queued to write');
// §E.7 — a composer never hydrates anything.
var composerFn = code(extractFn(PAGE, '_renderManualComposer_'));
ok(!/allocation_draft_id|allocation_draft_line_id|route_group_key/.test(composerFn),
  'E6  the composer builder names no allocation identity at all, so it cannot revive a cancelled draft');

// ================================================================================================================
section('§F — TOTAL AND SUBMIT');
// ================================================================================================================
var pristineRow = { sku: SKU, scopeKey: 'resus|us|amazon', route_kind: 'manual-composer', composer_touched: false,
  complete: false, missingFields: ['From', 'To', 'Qty', 'Method'], allocation_draft_id: '', allocation_draft_line_id: '' };
var touchedRow = Object.assign({}, pristineRow, { composer_touched: true, missingFields: ['To', 'Method'] });
var goodRow = { sku: SKU, scopeKey: 'resus|us|amazon', allocation_draft_id: 'SADH-1', allocation_draft_line_id: 'SADL-1',
  qty: 800, complete: true, missingFields: [], route_provenance: 'PERSISTED_ACTIVE_DRAFT',
  destination_type: 'MARKETPLACE', destination_code: 'Amazon', shipping_method: 'sea_express' };

var f1 = PF.evaluate(pfInput([pristineRow]));
eq([f1.ok, f1.code], [false, 'NO_EXECUTION_ROUTES'],
  'F1  a pristine composer alone is an EMPTY plan — NO_EXECUTION_ROUTES, not a complaint about the composer');
eq(f1.blocking.reasons.length, 0, 'F1a and it is not reported as a phantom or a stale route — §F.6');
var f2 = PF.evaluate(pfInput([touchedRow]));
eq([f2.ok, f2.code], [false, 'EXECUTION_PLAN_COMPOSER_INCOMPLETE'], 'F2  a TOUCHED incomplete composer BLOCKS');
eq(f2.blocking.reasons[0].missing, ['To', 'Method'], 'F2a naming exactly what is missing — §C.2');
var f3 = PF.evaluate(pfInput([goodRow, pristineRow]));
eq([f3.ok, f3.candidate.routeCount], [true, 1],
  'F3  §F.7 a default composer does NOT whole-batch block a route that is ready');
var f4 = PF.evaluate(pfInput([goodRow, touchedRow]));
eq([f4.ok, f4.code], [false, 'EXECUTION_PLAN_COMPOSER_INCOMPLETE'],
  'F4  but a STARTED one does — a half-typed route is a decision in progress');
eq(PF.evaluate(pfInput([goodRow])).candidate.totalQty, 800, 'F5  only persisted complete routes are candidates');
eq(PF.evaluate(pfInput([])).code, 'NO_EXECUTION_ROUTES', 'F6  and nothing at all is NO_EXECUTION_ROUTES');
// §F.1 — the Total. The container sums every qty input, and a pristine composer's is blank → contributes 0.
eq(lastTotal(w1), 0, 'F7  a pristine composer contributes 0 to the Total, because its Qty is blank');

// ================================================================================================================
section('§G / §A2 — THE AI PLAN CALL CHAIN, TRACED AND EXECUTED');
// ================================================================================================================
// Every link, asserted on the shipped source, in the order a click travels.
ok(/onclick="runReplenAiSupport\('aiplan'\)"/.test(read('assets/html/pages/inventory-replenishment.html')),
  'G1  the AI Plan menu item calls runReplenAiSupport(\'aiplan\')');
ok(/if \(kind === 'aiplan'\) return _openReplenScopeModal\('aiplan'\)/.test(code(extractFn(PAGE, 'runReplenAiSupport'))),
  'G2  which opens the scope modal');
var modalFn = code(extractFn(PAGE, '_openReplenScopeModal'));
ok(/confirmLabel: action === 'aiplan' \? 'Generate AI Plan'/.test(modalFn),
  'G3  whose confirm button is "Generate AI Plan"');
ok(/return handleReplenAiPlan\(scope\)/.test(modalFn), 'G4  and whose onConfirm hands the SELECTED SCOPE to handleReplenAiPlan');
// RESTATED (F1-7N-FC-1B-E3): the click is now a PAIR - handleReplenAiPlan sets the visible state in the
// click's own event-loop turn and _irAiPlanRun_ does the work one task later, because everything the run does
// is synchronous and a state set and cleared inside one task is never painted. Both halves are measured.
var aiFn = [code(extractFn(PAGE, 'handleReplenAiPlan')), code(extractFn(PAGE, '_irAiPlanRun_'))].join(' ; ');
ok(/window\._irAiPlanScope = scope/.test(aiFn), 'G5  the selected scope (Amazon US) is retained on the page');
ok(/_irRecoByKey\[String\(r\.sku\)\] = dto/.test(aiFn), 'G6  the RECOMMENDATION half runs: KMREC regenerates per SKU');
ok(/_irInventoryAiPlanDbGenerationEnabled_\(\) && _irAiPlanDbGenEligible_\(\)/.test(aiFn),
  'G7  and the EXECUTION half is gated on two conditions');
// THE BREAK POINT, named precisely.
//
// RESTATED (F1-7N-FC-1B-E3): E2's finding was that AI Plan's silence came from a FEATURE FLAG and not from a
// missing contract, and it recorded that finding by asserting the flag's then-current value, `false`. E3 acts
// on the finding: §E.4 sets the flag TRUE, USER-authorized. An assertion that a released feature is still
// unreleased cannot survive its own release, and it should not - a flag that may never be flipped is not a
// flag. What E2 actually established, and what stays asserted, is the SHAPE of the break point: ONE boolean
// of record in 00_config.gs, read through ONE accessor, which is simultaneously the release switch and the
// entire rollback. The value it currently holds is reported by system.health rather than pinned here, because
// the deployment's value and the repository's can legitimately differ (the deployment is published by hand).
var _flagLit = /var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = (\w+);/.exec(CFG);
ok(!!_flagLit && (_flagLit[1] === 'true' || _flagLit[1] === 'false'),
  'G8  THE BREAK POINT is ONE boolean of record in 00_config.gs (currently ' + (_flagLit && _flagLit[1]) + ')');
ok(/function inventoryAiPlanDbGenerationEnabled_\(\) \{ return INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ === true; \}/.test(CFG),
  'G8a1 read through exactly ONE accessor, so every gate agrees on the value');
ok(/inventory_ai_plan_db_generation_enabled/.test(read('assets/specs/active/apps-script/63_api_v1_system_health.gs')),
  'G8a and the EFFECTIVE value is reportable from system.health, so the deployed posture is a fact');
ok(/failSafeDefaults: \{[^}]*inventoryAiPlanDbGenerationEnabled: false/.test(read('assets/js/api/km-api-foundation.js')),
  'G8b with the client mirroring it fail-safe OFF');
// EVERYTHING ELSE IN THE CHAIN IS PRESENT — this is not a missing contract.
ok(/window\.KM\.DB\.generateWeeklyAiPlanDraft = function/.test(DBAPI), 'G9  the browser adapter EXISTS');
ok(/if \(action === 'weeklyAiPlan\.generate'\)/.test(code(G01)), 'G10 the router action EXISTS');
ok(/function handleGenerateWeeklyAiPlanDraft_/.test(G61), 'G11 the server handler EXISTS');
ok(/KMWRR\.buildK2GenerationPlan/.test(G61), 'G12 and it calls the authoritative route planner');
eq(/RECOMMENDATION|EXECUTION PLAN was not changed/.test(aiFn), true,
  'G13 so the click is category 3: it recalculates the RECOMMENDATION only');

// ================================================================================================================
section('§H — THE AUTHORITATIVE ALLOCATOR, EXECUTED (it exists, and it is a ranking policy)');
// ================================================================================================================
var WH = [{ warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', warehouse_code: 'CNYOUXIN', warehouse_name: 'CN Youxin', country: 'CN', warehouse_type: 'FACTORY', status: 'active' }];
var CARD = { carrier: 'CarrierA', shipping_method: 'sea_express', origin_country: 'CN', destination_country: 'US',
  destination_marketplace: 'Amazon', status: 'active', effective_from: '2026-01-01', effective_to: '2026-12-31',
  price_per_kg: 3.2, currency: 'USD', last_mile_delivery: 'DDP' };
var CARD2 = Object.assign({}, CARD, { carrier: 'CarrierB', shipping_method: 'air', price_per_kg: 8.9 });
// RESTATED (F1-7N-FC-1B-E3-R4-A2-R1-R5) — THIS FIXTURE WAS PASSING BECAUSE OF A DEFECT.
//
// `transit_days` is not a carrier_lead_times column: that table stores min_days / max_days / avg_days, and
// 17_ REJECTS transit columns from the rate template on purpose. So every day field here was ABSENT, and
// KMRA normalized each absence with `Number('')` — which is 0 and passes isFinite. The plan below therefore
// resolved on a transit time of ZERO DAYS, with an arrival of "today", and this suite called that a pass.
//
// R5 fixes the coercion (an absent figure is NaN; a genuine 0 is still 0), so the fixture now states the
// transit it always meant. The 25- and 7-day intents are preserved exactly.
var LEAD = { origin_country: 'CN', destination_country: 'US', shipping_method: 'sea_express', min_days: 25, max_days: 25, avg_days: 25, last_mile_delivery: 'DDP', status: 'active' };
var LEAD2 = { origin_country: 'CN', destination_country: 'US', shipping_method: 'air', min_days: 7, max_days: 7, avg_days: 7, last_mile_delivery: 'DDP', status: 'active' };
var ALLOC = [{ sku: SKU, site_sku: SKU, window_code: 'D90', window_start_date: '2026-09-03',
  window_end_date: '2026-12-02', required_by_date: '2026-11-01',
  source_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', source_warehouse_code_snapshot: 'CNYOUXIN',
  planned_qty: 520, recommended_qty: 520, units_per_carton: 20,
  destination: { kind: 'marketplace', marketplace: 'Amazon', country: 'US' } }];
function plan(over) {
  var input = { scope: { planning_cycle: '2026-W36', company: 'ResUS', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment' },
    allocatedLines: ALLOC, warehouses: WH, rateCards: [CARD], leadTimes: [LEAD], shipDate: '2026-09-03',
    authorizedBySkuWindow: { 'co1100-r|d90': 520 }, sourceCeilingById: {} };
  Object.keys(over || {}).forEach(function (k) { input[k] = over[k]; });
  return KMWRR.buildK2GenerationPlan(input);
}
var p1 = plan();
eq(p1.groups.length, 1, 'H1  EXECUTED: the allocator produces ONE complete route group for the live shape');
var h1 = p1.groups[0].header;
eq(h1.recommended_source_warehouse_id, 'WH-TW-CN-FACTORY-YOUXIN', 'H2  From is complete');
eq(h1.destination_marketplace, 'Amazon', 'H3  To is complete');
eq(p1.groups[0].lines[0].planned_qty, 520, 'H4  Qty is the allocated quantity');
eq(h1.recommended_shipping_method, 'sea_express', 'H5  Method is DERIVED — the "four blank dimensions" note is STALE');
eq(h1.recommended_last_mile_delivery, 'DDP', 'H5a as is last-mile');
eq(h1.recommendation_group_no, '1', 'H5b and the group number');
eq(p1.lineOutcomes[0].route_candidate_status, 'AI_RANKED', 'H6  the outcome is AI_RANKED');
ok(!!p1.lineOutcomes[0].expected_arrival, 'H7  with an Expected Arrival derived from the lead time');
eq(p1.conservation.conserved, true, 'H8  §H the allocator output is CONSERVED — no quantity invented or lost');
// §H.3/§H.4 — it does NOT simply pick the first card. Two materially different pairs that tie are REFUSED.
// RESTATED (F1-7N-FC-1B-E3-R4-A2-R1-R5): this tie existed only because BOTH lead times normalized to zero
// days under the blank-as-zero defect, so two services 18 days apart compared as equal. The CLAIM — two
// materially different route pairs that TIE are refused rather than first-row picked — is unchanged, and now
// needs a fixture that genuinely ties: same transit, and no comparable cost basis to separate them.
var LEAD2_TIE = { origin_country: 'CN', destination_country: 'US', shipping_method: 'air', min_days: 25, max_days: 25, avg_days: 25, last_mile_delivery: 'DDP', status: 'active' };
var p2 = plan({ rateCards: [CARD, CARD2], leadTimes: [LEAD, LEAD2_TIE] });
eq([p2.groups.length, p2.lineOutcomes[0].route_candidate_status], [0, 'AMBIGUOUS'],
  'H9  §H.3 two tying route pairs are NOT first-row picked — the allocator refuses and says AMBIGUOUS');
eq(p2.lineOutcomes[0].block, 'LAST_MILE_AMBIGUOUS', 'H9a under a typed block');
// §I's typed reasons are the allocator's own, not invented here.
// RESTATED (A2-R1-R5): the PRODUCT RULE changed — an empty rate-card set no longer removes the METHOD,
// because methods come from carrier_lead_times. "No authority for the lane" now means neither table covers
// it, and the typed reason names the TRANSIT table, which is the one an operator must act on.
var p3 = plan({ rateCards: [], leadTimes: [] });
eq([p3.groups.length, p3.lineOutcomes[0].block, p3.lineOutcomes[0].method_unresolved_reason],
  [0, 'ROUTE_METHOD_UNRESOLVED', 'NO_TRANSIT_AUTHORITY_FOR_LANE'],
  'H10 §I no authority for the lane → typed NO_TRANSIT_AUTHORITY_FOR_LANE, and ZERO half-routes');
var p4 = plan({ leadTimes: [] });
eq([p4.groups.length, p4.lineOutcomes[0].auto_ranking_insufficient_reason],
  [0, 'NO_LEAD_TIME'], 'H11 §D.7 a missing lead time is NO_LEAD_TIME — a different answer from a missing card');
eq(p4.lineOutcomes[0].manual_method_options.length, 1,
  'H11a and it still offers the method for MANUAL selection, because the card exists');

// ================================================================================================================
section('§I — AI PLAN OUTCOME VISIBILITY');
// ================================================================================================================
ok(/EXECUTION_MATERIALIZATION_NOT_ENABLED/.test(aiFn),
  'I1  the run names EXECUTION_MATERIALIZATION_NOT_ENABLED when the flag is off');
ok(/EXECUTION_MATERIALIZATION_UNAVAILABLE/.test(aiFn),
  'I1a and EXECUTION_MATERIALIZATION_UNAVAILABLE when the writer is not reachable at all');
// RESTATED (F1-7N-FC-1B-E3): "was not changed" became "was NOT changed" when the notice was promoted from
// 'info' to 'warn' - "your plan was not written" is not neutral news to someone who pressed Generate. The
// property is unchanged and is matched case-insensitively on the clause rather than on its capitalisation.
ok(/RECOMMENDATIONS regenerated/.test(aiFn) && /EXECUTION PLAN was not changed/i.test(aiFn),
  'I2  saying separately which half ran and which did not');
ok(/use \+ Add Route/.test(aiFn), 'I3  and telling the operator what they CAN do instead');
ok(!/Recommendations regenerated for ' \+ Object\.keys\(_irRecoByKey \|\| \{\}\)\.length \+ ' SKU\(s\) from the materialized gap already loaded\. Nothing was written to the database\.'/.test(aiFn),
  'I4  the old message, which read as "the plan ran and produced nothing", is gone');
// the paths that were already truthful stay truthful
ok(/Scope selection was cancelled/.test(modalFn), 'I5  a cancelled modal is still a stated outcome');
ok(/An AI Plan run is already in progress/.test(aiFn), 'I6  a double click is still refused out loud');
ok(/Recommendation generation failed/.test(aiFn), 'I7  a throw is still reported with its message');
var aiGen = code(extractFn(PAGE, '_irRunInventoryAiPlanGeneration_'));
ok(/if \(cls\.ok\)/.test(aiGen), 'I8  only a SUCCESSFUL generation re-hydrates');
ok(/AI_PLAN_EXPLICITLY_REQUESTED/.test(aiGen), 'I8a and its routes carry AI provenance');
ok(/no recommendation for this scope this cycle/.test(PAGE), 'I9  a zero-result run has its own typed message');
ok(/Your current Execution Plan is unchanged/.test(PAGE), 'I10 and a failure says the plan was left alone');

// ================================================================================================================
section('§J / §K — REPEATED AI PLAN AND PERSISTENCE IDENTITY');
// ================================================================================================================
ok(/execution_key \|\| body\.executionKey/.test(G61) && /generationRunId = 'AIRUN-'/.test(G61),
  'J1  §J.4 a retry derives the SAME generation run id, so a repeat REUSEs its committed rows');
ok(/confirmRegenerateOverUserEdits/.test(G61),
  'J2  §J.2 a regenerate over user edits requires an explicit confirmation flag — the policy exists');
ok(/BLOCKED_CONFLICT/.test(PAGE) || /BLOCKED_CONFLICT/.test(G61),
  'J2a and a conflict is a named per-marketplace outcome, never a silent overwrite');
ok(/PASS 1: compute every group\. ZERO WRITES\./.test(G61),
  'J3  §K.2 the plan is computed in full BEFORE any write, so a gate refusal cannot half-write');
ok(/lo\(d\.status\) !== 'cancelled'/.test(code(extractFn(PAGE, '_hydrateAllocationDraftFromDb'))),
  'J4  §J.6 and AI Plan cannot revive a cancelled draft — the hydrate excludes them');
ok(/sadK2DeterministicHeaderId_|SADH-K2-/.test(G16),
  'J5  §K.6 allocation identity stays the deterministic K2 header/line contract');

// ================================================================================================================
section('§L regression / §M release identity');
// ================================================================================================================
// E1's rule must remain impossible to break.
ok(!/qty:\s*suggested/.test(code(PAGE)), 'M1  §L the Suggested Qty still seeds no route anywhere');
ok(!/_renderExecutionRoute\(sku,\s*\{\s*ship_from:\s*''/.test(code(PAGE)),
  'M1a and the deleted seeding literal has not returned');
// RESTATED (F1-7N-FC-1B-E3): the FOURTH round in a row to pin its own token as "the current one" - written,
// once again, into a round that had just restated another suite for exactly this. E2's token is a FLOOR: it
// was minted, it sits strictly after E1's published one, and the series has not moved behind it.
ok(RO.tokenIndex('fc1b-e2-aiplancomposer-20260903') !== -1, 'M2  E2 minted its own cache token');
ok(RO.tokenIndex(RO.currentAppToken()) >= RO.tokenIndex('fc1b-e2-aiplancomposer-20260903'),
  'M2a and the series has not moved behind it (current: ' + RO.currentAppToken() + ')');
ok(RO.tokenIndex('fc1b-e2-aiplancomposer-20260903') > RO.tokenIndex('fc1b-executionintent-20260903'),
  'M2b strictly after E1\'s, which was published');
eq((INDEX.match(/\?v=fc1b-executionintent-20260903/g) || []).length, 0,
  'M3  zero production references remain on E1\'s token');
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '', 'M4  and nothing is left behind on a superseded token');
var idxT = RO.parseIndexTokens(INDEX);
eq(idxT['assets/js/pages/inventory-replenishment.js'], RO.currentAppToken(), 'M5  the page carries it');
eq(idxT['assets/js/utils/inventory-compat.js'], RO.currentAppToken(), 'M5a and so does the shared module');
// §M.1 — no Apps Script byte moved.
ok(!/E2|FC-1B-E2/.test(/var SAD_BUILD_VERSION_ = '([^']*)'/.exec(G16)[1]),
  'M6  §M.3 no Apps Script build stamp was churned by a frontend-only round');

// ================================================================================================================
section('§N — MUTATIONS');
// ================================================================================================================
mut('N1  the composer gets `.exec-route-row` while still pristine', function () {
  var m = worldFrom(swap(makeWorld({}).src,
    "row.className = _isComposer ? 'exec-route-composer ir-exec-plan__grid' : 'exec-route-row ir-exec-plan__grid';",
    "row.className = 'exec-route-row ir-exec-plan__grid';"));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  m.api.collect(SKU);
  // the pristine composer would now be swept into the canonical model — exactly the E1 phantom's mechanism
  return modelRows(m).length !== 0 || routeRows(m).length !== 0;
});

// RETARGETED while writing this suite: prefilling the route object handed to the builder changed NOTHING,
// because the builder blanks a composer's Qty itself. That is a stronger guarantee than the mutation assumed,
// so the mutation now attacks where the property actually lives.
mut('N2  the Suggested Qty prefilled into the default composer', function () {
  var m = worldFrom(swap(makeWorld({}).src,
    "var qty = _isComposer ? '' : (parseInt(route.qty) || 0);",
    "var qty = _isComposer ? _irSuggestedQtyNumber_({ sku: sku }) : (parseInt(route.qty) || 0);"));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  return String(composers(m)[0]._fields.qty) !== '';
});

mut('N3  an incomplete composer allowed to mint an identity and be queued', function () {
  var m = worldFrom(swap(makeWorld({}).src, '            if (!_isRouteComplete(row)) {', '            if (false) {'));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  var c = composers(m)[0];
  c._fields.source_warehouse_id = 'WH-1';
  m.api.composerEdit(SKU, c.querySelector('[data-field="source_warehouse_id"]'));
  var r = modelRows(m)[0];
  return !!(r && (r.allocation_draft_line_id || r.route_provenance || r.route_intent)) || m.counts.touched !== 0;
});

mut('N4  the Method select enabled before the route resolves', function () {
  var m = worldFrom(swap(makeWorld({ cand: CAND_FULL, methods: { methods: [{ value: 'sea_express' }], status: 'OK' } }).src,
    'var methodDisabled = (methods.length && _routeResolvable)', 'var methodDisabled = (methods.length)'),
    { cand: CAND_FULL, methods: { methods: [{ value: 'sea_express' }], status: 'OK' } });
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  return composers(m)[0]._methodDisabled === false;
});

mut('N5  a pristine composer allowed to block Submit', function () {
  var s = CMPSRC.replace(
    'var _judged = arr(input.routes).filter(function (r) {\r\n      return !(isComposerRow(r) && composerState(r, r.complete === true) === IR_COMPOSER_STATES.PRISTINE);\r\n    });',
    'var _judged = arr(input.routes);');
  if (s === CMPSRC) {
    s = CMPSRC.replace(
      'var _judged = arr(input.routes).filter(function (r) {\n      return !(isComposerRow(r) && composerState(r, r.complete === true) === IR_COMPOSER_STATES.PRISTINE);\n    });',
      'var _judged = arr(input.routes);');
  }
  if (s === CMPSRC) throw new Error('mutation did not apply to submitPreflight');
  var mod = { exports: {} };
  new Function('module', 'exports', s)(mod, mod.exports);
  var v = mod.exports.IRSubmitPreflight.evaluate(pfInput([goodRow, pristineRow]));
  return v.ok !== true;   // a ready route would be blocked by furniture
});

mut('N6  a touched incomplete composer allowed through Submit', function () {
  var s = CMPSRC.replace('    if (started.length) {', '    if (false) {');
  if (s === CMPSRC) throw new Error('mutation did not apply');
  var mod = { exports: {} };
  new Function('module', 'exports', s)(mod, mod.exports);
  var v = mod.exports.IRSubmitPreflight.evaluate(pfInput([touchedRow]));
  return v.code !== 'EXECUTION_PLAN_COMPOSER_INCOMPLETE';
});

mut('N7  the composer never graduates, so a completed route is never created', function () {
  var m = worldFrom(swap(makeWorld({}).src,
    "            row.route_provenance = (window.IRRouteProvenance && window.IRRouteProvenance.SOURCES.USER_EXPLICIT_ADD_ROUTE) ||\n                'USER_EXPLICIT_ADD_ROUTE';",
    "            row.route_provenance = '';"));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  var c = composers(m)[0];
  fillComplete(c);
  m.api.composerEdit(SKU, c.querySelector('[data-field="qty"]'));
  var r = modelRows(m)[0];
  return !r || r.route_provenance !== 'USER_EXPLICIT_ADD_ROUTE';
});

mut('N8  deleting the last route re-seeds the Suggested Qty instead of a blank composer', function () {
  var m = worldFrom(swap(makeWorld({}).src,
    "var qty = _isComposer ? '' : (parseInt(route.qty) || 0);",
    "var qty = _isComposer ? 520 : (parseInt(route.qty) || 0);"),
    { bySku: (function () { var o = {}; o[SKU] = [persistedRoute()]; return o; })(), cand: CAND_FULL });
  m.model.bySku[SKU] = [persistedRoute()];
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  m.list._rows.slice().forEach(function (r) { m.list.removeChild(r); });
  delete m.model.bySku[SKU];
  m.api.edit(SKU);
  return composers(m).length === 1 && String(composers(m)[0]._fields.qty) !== '';
});

mut('N9  the AI Plan click made a silent no-op again', function () {
  // RESTATED (F1-7N-FC-1B-E3), and this one is a caught defect in the test rather than in the page: the bare
  // token is no longer unique in the file, because E3's own explanation of the silent-AI-Plan defect NAMES it
  // in a comment. swap() takes the FIRST match, so the mutation had begun landing in that comment and the
  // mutant "survived" for a reason with nothing to do with the property. Anchored on the QUOTED string
  // literal, which only the code has - and asserted on the work half, where the reason now lives.
  var m = swap(PAGE, "'EXECUTION_MATERIALIZATION_NOT_ENABLED'", "'SILENT'");
  return !/EXECUTION_MATERIALIZATION_NOT_ENABLED/.test(code(extractFn(m, '_irAiPlanRun_')));
});

mut('N10 the allocator reduced to picking the first rate card', function () {
  // the shipped policy REFUSES a tie. A first-row picker would return a group instead.
  // RESTATED (A2-R1-R5): LEAD2 is a 7-day service and LEAD a 25-day one, so they only ever "tied" because
  // the blank-as-zero defect flattened both to zero. The tie fixture now genuinely ties.
  var tie = plan({ rateCards: [CARD, CARD2], leadTimes: [LEAD, LEAD2_TIE] });
  return tie.groups.length === 0 && tie.lineOutcomes[0].route_candidate_status === 'AMBIGUOUS';
});

mut('N11 a zero-result generation reported as a completed plan', function () {
  var cls = new Function('res', code(extractFn(PAGE, '_irClassifyGenerationResult_')) +
    ' return _irClassifyGenerationResult_(res);');
  var z = cls({ success: true, data: { status: 'NO_DEMAND', zero_result: true, marketplaceResults: [] } });
  return z.zeroResult === true && z.ok === true;   // a successful run that produced nothing, and it SAYS so
});

mut('N12 a cancelled draft reused by the hydrate', function () {
  var h = swap(PAGE, "lo(d.status) !== 'cancelled' && ", '');
  return !/lo\(d\.status\) !== 'cancelled'/.test(code(extractFn(h, '_hydrateAllocationDraftFromDb')));
});

mut('N13 the E1 rule broken: a route seeded from the Suggested Qty', function () {
  // anchored on the FOLLOWING line as well: `_execRenderEmptyState_(sku);` also appears inside
  // _execSyncEmptyState_, and swap() takes the first match. A mutation that quietly lands in another function
  // "survives" for a reason unrelated to the property under test, which is worse than a probe error.
  var m = worldFrom(swap(swap(makeWorld({}).src,
    '    _execRenderEmptyState_(sku);\n    updateShippingAllocationTotal(sku);',
    "    _renderExecutionRoute(sku, { qty: 520, route_provenance: 'SUGGESTED_QTY_PLACEHOLDER' });\n    updateShippingAllocationTotal(sku);"),
    '    if (!_isComposer && !_prov) {', '    if (false) {'));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  return routeRows(m).length !== 0;
});

mut('N14 the composer collected but its state discarded, so Submit cannot tell it from a route', function () {
  var m = worldFrom(swap(makeWorld({}).src, "            row.route_kind = _irComposerKind_();", "            ;"));
  m.api.init(SKU, SKUDATA, { catalogueSettled: true });
  var c = composers(m)[0];
  c._fields.source_warehouse_id = 'WH-1';
  m.api.composerEdit(SKU, c.querySelector('[data-field="source_warehouse_id"]'));
  var r = modelRows(m)[0];
  return !r || r.route_kind !== 'manual-composer';
});

// ================================================================================================================
console.log('\n---');
console.log(pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail) process.exitCode = 1;
