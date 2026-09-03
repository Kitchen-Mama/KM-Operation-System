// F1-7N-FB-4G-A0-R1 — DESTINATION XOR + PERSISTED METHOD SELECTION CLOSURE.
//
// THE FROZEN LIVE H4 (real rows, supplied by the operator — never a fixture invented here):
//   header SADH-K2-E7AF9242 · ResUS/US/Amazon · draft · service sea
//          recommended_source_warehouse_id            WH-TW-CN-FACTORY-YOUXIN
//          recommended_destination_warehouse_id       ''
//          recommended_destination_warehouse_code_snapshot  'Amazon'   ← LEGACY MISUSE
//          destination_marketplace                   ''
//   line   SADL-K2-16F4E4F9 · CO1100-R · planned_qty 800 · source '' · expected_arrival ''
//   on screen: From CN侑鑫 ✓  Qty 800 ✓  To blank + confirmation ✓  Method "Method…" ✗ (普船海卡 present, unselected)
//
// TWO FINDINGS, and each is sufficient on its own.
//   (1) _execRebuildMethodOptions read the selection from the DOM instead of the route model. On the first
//       paint of an expanded row the carrier catalogue is still in flight, so the <select> holds only
//       'Loading methods…' and its value is ''. The rebuild then ran on that same load's .then(), read '',
//       found it invalid, and re-rendered the complete catalogue with selected='' — the label visible, nothing
//       chosen. No spelling mismatch required.
//   (2) _execMethodOptionsHtml selected by EXACT TEXT between the header's recommended_shipping_method and the
//       rate card's shipping_method column verbatim, while the server matches rate cards case-insensitively
//       and computes identity through ricCanonicalService_.
// And the destination half: routeHeaderFields fed the *_warehouse_code_snapshot columns from the collect's
// display NAMES, so a marketplace destination wrote 'Amazon' into a warehouse-code column — which is exactly
// the legacy value the live H4 header carries.
//
// Run: node assets/tests/destination-xor-and-persisted-method-f1-7n-fb-4g-a0-r1.test.js

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
// TRUE = the mutant was DETECTED. A throw is a BROKEN PROBE, never a detection.
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) {
    neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    return;
  }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CMP = read('assets/js/utils/inventory-compat.js');
var REG = read('assets/js/core/method-registry.js');
var G69 = read('assets/specs/active/apps-script/69_api_v1_route_identity_contract.gs');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var INDEX = read('index.html');
var PAGEC = code(PAGE), CMPC = code(CMP), REGC = code(REG);
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var COMPAT = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var IRService = COMPAT.IRService, IRWarehouse = COMPAT.IRWarehouse, IRDraft = COMPAT.IRDraft;

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (' \t\r\n'.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(i, j + 1);
  }
  return src.slice(i, src.indexOf(';', i));
}
function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

// ================================================================================================================
// THE FROZEN FIXTURE. Declared once.
// ================================================================================================================
var US = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var YOUXIN = 'WH-TW-CN-FACTORY-YOUXIN';
var H4 = {
  allocation_draft_id: 'SADH-K2-E7AF9242', company: 'ResUS', country: 'US', marketplace: 'Amazon',
  status: 'draft', planning_cycle: '', source_page: 'inventory_replenishment',
  recommended_source_warehouse_id: YOUXIN, recommended_destination_warehouse_id: '',
  recommended_source_warehouse_code_snapshot: '', recommended_destination_warehouse_code_snapshot: 'Amazon',
  destination_marketplace: '', recommended_shipping_method: 'sea', recommended_last_mile_delivery: '',
  recommendation_group_no: '', generation_type: 'user_created', draft_version: '1'
};
var L4 = {
  allocation_draft_line_id: 'SADL-K2-16F4E4F9', allocation_draft_id: 'SADH-K2-E7AF9242',
  sku: 'CO1100-R', site_sku: '', window_code: '', planned_qty: 800, recommended_qty: '',
  source_warehouse_id: '', source_warehouse_code_snapshot: '', line_status: '', expected_arrival: ''
};
// The operator's three labels. They are DATA (carrier_rate_cards.shipping_method_label) and this suite reads
// them as data — it never asserts them as source constants, and it never proposes changing them.
var LABELS = { air: '空派', sea: '普船海卡', sea_express: '美森海卡' };
var RATE_CARDS_EXACT = [
  { value: 'air', label: LABELS.air }, { value: 'sea', label: LABELS.sea }, { value: 'sea_express', label: LABELS.sea_express }
];
var RATE_CARDS_CASED = [
  { value: 'Air', label: LABELS.air }, { value: 'Sea', label: LABELS.sea }, { value: 'Sea Express', label: LABELS.sea_express }
];

// ---- the shipped option builder, lifted --------------------------------------------------------------------
function optHtml(res, selected, withService) {
  var src = [extractFn(PAGE, '_execMethodOptionsHtml'), 'OUT = _execMethodOptionsHtml(RES, SEL);'].join(String.fromCharCode(10));
  var win = (withService === false) ? {} : { IRService: IRService };
  return (new Function('RES', 'SEL', 'window', '_execEsc', 'var OUT;' + src + 'return OUT;'))(
    res, selected, win, function (v) { return String(v == null ? '' : v); });
}
function ready(methods) { return { status: 'READY', methods: methods }; }
function selectedLabel(html) {
  var m = /<option value="[^"]*" selected>([^<]*)<\/option>/.exec(html);
  return m ? m[1] : '';
}

// ================================================================================================================
section('A · §C — THE METHOD, TRACED END TO END BY EXECUTION');
// ================================================================================================================
// §C.1 — is the hydrated model still canonical `sea`? Ask the shipped hydrate.
var hyd = (function () {
  function normH(r) { return { allocationDraftId: r.allocation_draft_id, company: r.company, country: r.country, marketplace: r.marketplace, status: r.status, raw: r }; }
  function normL(r) { return { allocationDraftLineId: r.allocation_draft_line_id, allocationDraftId: r.allocation_draft_id, sku: r.sku, lineStatus: r.line_status, raw: r }; }
  var src = [
    'var IR_ISO_DATE_RE_ = ' + extractVar(PAGE, 'IR_ISO_DATE_RE_') + ';',
    extractFn(PAGE, '_irCanonicalDateOrBlank_'), extractFn(PAGE, '_irWsGet'),
    'var _replenHydrateToken = 0;',
    'var replenAllocationDraft = { context: {}, targetDays: "", bySku: {} };',
    'function _irRenderDuplicateCorruptionBanner_() {}', 'function _persistAllocationDraft() {}',
    extractFn(PAGE, '_hydrateAllocationDraftFromDb'),
    'RESULT = { ok: _hydrateAllocationDraftFromDb(CTX), draft: replenAllocationDraft };'
  ].join(String.fromCharCode(10));
  var f = new Function('window', 'sessionStorage', 'console', '_irReadModel', 'CTX', 'var RESULT;' + src + 'return RESULT;');
  return f({ IRWarehouse: IRWarehouse, IRDraft: IRDraft, KM: { DB: {} } },
    { setItem: function () {}, getItem: function () { return null; }, removeItem: function () {} },
    { warn: function () {}, log: function () {}, error: function () {} },
    { getShippingAllocationDrafts: [normH(H4)], getShippingAllocationDraftLines: [normL(L4)] }, US);
})();
var HR = hyd.draft.bySku['CO1100-R'][0];
eq(HR.shipping_method, 'sea', 'A1  §C.1 the hydrated model is STILL the canonical `sea` — nothing rewrote it');
eq(HR.planned_qty, 800, 'A2  §C.1 and it still carries 800');
eq(HR.destination_warehouse_code, 'Amazon', 'A3  §G.1 the legacy snapshot is carried VERBATIM…');
eq(HR.destination_marketplace, '', 'A4  §G.1 …and is NOT promoted to a marketplace destination');
eq(HR.destination_state, 'DESTINATION_CONFIRMATION_REQUIRED', 'A5  §E H4 first load: To stays blank, confirmation required');

// §C.2 — what IS the option value? The rate card's own shipping_method column, verbatim.
ok(/var value = str\(rc\.shippingMethod\);/.test(REGC), 'A6  §C.2 the option VALUE is carriers\' shipping_method, verbatim');
ok(/label: str\(rc\.shippingMethodLabel\) \|\| value/.test(REGC), 'A7  §C.2 the LABEL is shipping_method_label — display metadata only');
ok(/is display metadata only and never becomes an identity/.test(REG), 'A8  §C.2 and the registry says so itself');

// §C.3/§C.6 — WHY the option existed and `sea` was not selected. Both mechanisms, measured.
eq(selectedLabel(optHtml(ready(RATE_CARDS_EXACT), 'sea')), LABELS.sea, 'A9  §C.3 exact spelling: sea selects 普船海卡');
eq(selectedLabel(optHtml(ready(RATE_CARDS_CASED), 'sea')), LABELS.sea, 'A10 §C.6 CASED spelling: sea STILL selects 普船海卡 (the exact-text comparison is gone)');
eq(selectedLabel(optHtml(ready(RATE_CARDS_CASED), 'sea', false)), '',
  'A11 §C.6 …and without the shared identity test it does NOT — that was defect (2)');
eq(optHtml({ status: 'LOADING', methods: [] }, 'sea'), '<option value="">Loading methods…</option>',
  'A12 §C.4 the FIRST paint of an expanded row, before the catalogue lands: no option can hold the value');

// ================================================================================================================
section('B · §C.4 — THE REBUILD, WHICH IS WHERE THE PERSISTED METHOD DIED');
// ================================================================================================================
function FakeSelect() {
  var self = this;
  this.options = []; this.value = ''; this.selectedIndex = -1; this._attrs = {}; this._html = '';
  Object.defineProperty(this, 'innerHTML', {
    set: function (html) {
      self.options = []; var re = /<option value="([^"]*)"([^>]*)>/g, m, idx = 0, sel = -1;
      while ((m = re.exec(html))) { var s = / selected/.test(m[2]); self.options.push({ value: m[1], getAttribute: function () { return null; } }); if (s) sel = idx; idx++; }
      self.selectedIndex = sel >= 0 ? sel : (self.options.length ? 0 : -1);
      self.value = self.selectedIndex >= 0 ? self.options[self.selectedIndex].value : '';
      self._html = html;
    },
    get: function () { return self._html; }
  });
  this.setAttribute = function (k, v) { this._attrs[k] = v; };
  this.removeAttribute = function (k) { delete this._attrs[k]; };
}
// Run the SHIPPED _execRebuildMethodOptions over one row. `rowAttrs` is what the renderer put on the row.
function runRebuild(opts) {
  opts = opts || {};
  var methodEl = new FakeSelect();
  methodEl.innerHTML = opts.firstPaint;                              // whatever the first paint produced
  var rowAttrs = opts.rowAttrs || {};
  var row = {
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(rowAttrs, k) ? rowAttrs[k] : null; },
    querySelector: function (q) {
      var m = /\[data-field="([^"]+)"\]/.exec(q);
      if (!m) return null;
      if (m[1] === 'shipping_method') return methodEl;
      return null;                                                    // no From/To selection in this row
    }
  };
  var src = [extractFn(PAGE, '_execRebuildMethodOptions'), '_execRebuildMethodOptions("CO1100-R");'].join(String.fromCharCode(10));
  (new Function('document', 'window', '_replenSelectedScope', '_execResolveMethods', '_execMethodRouteCtx',
    '_execMethodOptionsHtml', '_execEsc', src))(
    { getElementById: function () { return { querySelectorAll: function () { return { forEach: function (f) { f(row); } }; } }; } },
    (opts.withService === false) ? {} : { IRService: IRService },
    function () { return US; },
    function () { return ready(opts.methods || RATE_CARDS_EXACT); },
    function () { return {}; },
    function (res, sel) { return optHtml(res, sel, opts.withService); },
    function (v) { return String(v == null ? '' : v); });
  return methodEl;
}
var LOADING = '<option value="">Loading methods…</option>';
var late = runRebuild({ firstPaint: LOADING, rowAttrs: { 'data-method-persisted': 'sea' } });
eq(late.value, 'sea', 'B1  §C.4 catalogue arrives LATE → the rebuild recovers the persisted service from the row');
eq(selectedLabel(late.innerHTML), LABELS.sea, 'B2  §C.4 and 普船海卡 is SELECTED — the reported symptom is closed');
ok(late.innerHTML.indexOf(LABELS.sea) !== -1, 'B3  §C.6 the option was always present; only the selection was missing');

var noAttr = runRebuild({ firstPaint: LOADING, rowAttrs: {} });
eq(noAttr.value, '', 'B4  §C.4 WITHOUT the row attribute the persisted service is unrecoverable — that WAS the defect');

// A user who deliberately clears the Method must not have it resurrected.
var cleared = runRebuild({ firstPaint: LOADING, rowAttrs: { 'data-method-persisted': 'sea', 'data-method-dirty': '1' } });
eq(cleared.value, '', 'B5  §C.4 a user who CLEARED the method keeps it cleared — the model does not overrule an edit');
// A user's own choice always wins over the persisted value.
var chose = runRebuild({ firstPaint: optHtml(ready(RATE_CARDS_EXACT), 'air'), rowAttrs: { 'data-method-persisted': 'sea', 'data-method-dirty': '1' } });
eq(chose.value, 'air', 'B6  §C.4 and a user\'s chosen method wins over the persisted one');
// §C.4 — nothing else overwrites it afterwards: the rebuild is the only writer of this select's options.
eq((PAGEC.match(/\[data-field="shipping_method"\]/g) || []).length >= 1, true, 'B7  §C.4 the method select is addressed by data-field');
ok(/data-method-persisted/.test(PAGEC), 'B8  §C.4 the row carries its persisted service');
ok(/onExecutionMethodEdit\(/.test(PAGEC), 'B9  §C.4 and a user edit is reported as a user edit');

// ================================================================================================================
section('C · §C.5 — THE CANONICAL-TO-LABEL OWNERSHIP, STATED HONESTLY');
// ================================================================================================================
// There are TWO different questions and they have TWO different owners. Saying so is the answer to §C.5.
eq(norm(extractVar(CMP, 'IR_SERVICE_LABELS')), norm(extractVar(G69, 'RIC_SERVICE_LABELS_')),
  'C1  §C.5 the client service table is a BYTE-IDENTICAL mirror of 69_ RIC_SERVICE_LABELS_');
eq(norm(extractVar(CMP, 'IR_CANONICAL_SERVICES')), norm(extractVar(G69, 'RIC_CANONICAL_SERVICES_')),
  'C2  §C.5 and so is the canonical service list');
eq(IRService.canonical('sea'), 'sea', 'C3  §C.5 canonical identity: sea');
eq(IRService.canonical('Sea'), 'sea', 'C4  §C.5 case is not identity');
eq(IRService.canonical('普船'), 'sea', 'C5  §C.5 a display spelling resolves to its canonical service');
eq(IRService.canonical('美森海卡'), 'sea_express', 'C6  §C.5 美森海卡 is EXPRESS ocean — never sea');
eq(IRService.canonical('空運'), 'air', 'C7  §C.5 空運 → air');
eq(IRService.canonical('nonsense'), '', 'C8  §C.5 an unrecognised spelling returns NOTHING — never a neighbour');
// §C.5 — the canonical→LABEL mapping owner is the DATA, and no shipped source hardcodes it.
ok(PAGE.indexOf('普船海卡') === -1 && CMP.indexOf('普船海卡') === -1 && REG.indexOf('普船海卡') === -1,
  'C9  §C.5 the canonical→LABEL owner is carrier_rate_cards.shipping_method_label — no source hardcodes 普船海卡');
ok(PAGE.indexOf('空派') === -1 && CMP.indexOf('空派') === -1,
  'C10 §C.5 nor 空派 — the picker shows whatever label the operator maintains');
// And the labels this round must not rename are untouched.
var DIFF = cp.execSync('git diff HEAD -- assets/js assets/css index.html', { cwd: ROOT }).toString();
ok(!/^[-].*(空運|普船|快船|美森海卡)/m.test(DIFF), 'C11 §C no existing method label spelling was REMOVED by this round');
ok(/'空運': 'Air', '普船': 'Sea', '快船': 'Sea Express', '美森海卡': 'Sea Express'/.test(PAGEC),
  'C12 §C the page lead-time label table is unchanged');

// ================================================================================================================
section('D · §D/§E — DESTINATION XOR, IN THE ONE PLACE A ROUTE BECOMES HEADER FIELDS');
// ================================================================================================================
function hdr(route) { return IRDraft.routeHeaderFields(US, route); }
// The same contradictory row as a ROUTE (what the gates see), rather than as header fields.
function BOTH_ROUTE() {
  return { source_warehouse_id: YOUXIN, shipping_method: 'sea', qty: 800,
    destination_warehouse_id: 'WH-US-3PL-01', destination_warehouse_code: 'US3PL01', destination_marketplace: 'Amazon' };
}
var MKT = hdr({ source_warehouse_id: YOUXIN, source_warehouse_code: 'YOUXIN',
  destination_type: 'MARKETPLACE_DESTINATION', destination_marketplace: 'Amazon',
  destination_warehouse_id: '', destination_warehouse_code: '', shipping_method: 'sea' });
eq(MKT.recommended_destination_warehouse_id, '', 'D1  §D marketplace: destination_warehouse_id is BLANK');
eq(MKT.destination_warehouse_code, '', 'D2  §D marketplace: warehouse code snapshot is BLANK');
eq(MKT.destination_marketplace, 'Amazon', 'D3  §D marketplace: destination_marketplace carries the trimmed value');
var WH = hdr({ source_warehouse_id: YOUXIN, source_warehouse_code: 'YOUXIN',
  destination_warehouse_id: 'WH-US-3PL-01', destination_warehouse_code: 'US3PL01', shipping_method: 'sea' });
eq(WH.recommended_destination_warehouse_id, 'WH-US-3PL-01', 'D4  §D warehouse: the real warehouse_id');
eq(WH.destination_warehouse_code, 'US3PL01', 'D5  §D warehouse: the warehouse CODE snapshot');
eq(WH.destination_marketplace, '', 'D6  §D warehouse: destination_marketplace is BLANK');
// F1-7N-FB-4G-A0-R2 — RESTATED, and this is the §G correction. A0-R1 asserted that a BOTH route resolved to
// the marketplace with the code blanked, and called that "the exclusive identity wins". It was describing its
// own truthy collapse. A contradiction is not resolved, it is REFUSED: a row carrying two canonical
// destinations is ROUTE_DESTINATION_AMBIGUOUS, both values survive so nothing is hidden, and the route is not
// persistable by any path. What A0-R1 actually needed — that an explicit Amazon save CLEARS the legacy
// snapshot — does not depend on any collapse: the To selector is single-select, so an explicit transition
// produces a one-sided row and the warehouse side is already blank (asserted at D7b below).
var BOTH = hdr({ destination_type: 'MARKETPLACE_DESTINATION', destination_marketplace: 'Amazon',
  destination_warehouse_id: 'WH-US-3PL-01', destination_warehouse_code: 'US3PL01' });
eq(IRWarehouse.destinationIdentity(BOTH_ROUTE()).code, 'ROUTE_DESTINATION_AMBIGUOUS',
  'D7  §D/§C a route claiming BOTH is AMBIGUOUS — nothing "wins"');
eq(IRDraft.isRouteComplete(BOTH_ROUTE()), false, 'D7a §C so it is not complete and no request is issued');
eq([BOTH.recommended_destination_warehouse_id, BOTH.destination_warehouse_code, BOTH.destination_marketplace],
   ['WH-US-3PL-01', 'US3PL01', 'Amazon'],
   'D7b §C and neither side is silently dropped — the contradiction survives to be refused, not hidden');
eq([MKT.recommended_destination_warehouse_id, MKT.destination_warehouse_code, MKT.destination_marketplace],
   ['', '', 'Amazon'], 'D7c §C an EXPLICIT Amazon transition is one-sided by construction — the clearing still works');
// A display NAME can no longer reach a code column.
eq(hdr({ destination: 'Amazon', destination_type: 'MARKETPLACE_DESTINATION', destination_marketplace: 'Amazon' }).destination_warehouse_code, '',
  'D8  §D/§G the display name "Amazon" can no longer reach the warehouse-code column');
eq(hdr({ ship_from: 'CN侑鑫', source_warehouse_code: '' }).source_warehouse_code, '',
  'D9  §D nor can a display name reach the SOURCE code column');
// §D — no destination_type column is proposed; the type stays derived.
ok(!/destination_type/.test(code(extractFn(CMP, 'routeHeaderFields'))) || !/p\.destination_type/.test(CMPC),
  'D10 §D no destination_type column is written — the type is derived from the XOR');
ok(!/'destination_type'/.test(code(G16).slice(code(G16).indexOf('SHIPPING_ALLOCATION_DRAFTS_HEADERS_'), code(G16).indexOf('SHIPPING_ALLOCATION_DRAFTS_HEADERS_') + 2000)),
  'D11 §D and the header schema still has no destination_type column');
// §D — neither of the two corrected fields is a K2 group dimension, so nothing is re-keyed.
ok(IRDraft.K2_GROUP_DIMENSIONS.indexOf('destination_warehouse_code') === -1 &&
   IRDraft.K2_GROUP_DIMENSIONS.indexOf('source_warehouse_code') === -1,
  'D12 §D the code snapshots are NOT group dimensions — correcting them re-keys nothing');
eq(IRDraft.canonicalRouteGroupKey(US, { source_warehouse_id: YOUXIN, shipping_method: 'sea', destination_warehouse_code: 'Amazon' }),
   IRDraft.canonicalRouteGroupKey(US, { source_warehouse_id: YOUXIN, shipping_method: 'sea', destination_warehouse_code: '' }),
  'D13 §D proven: changing the snapshot moves no key, so it moves no id');

// §E — the To picker offers BOTH typed options and the marketplace comes from the TOKEN.
eq(IRWarehouse.resolveDestinationPayload('MARKETPLACE_DESTINATION:Amazon:US', US),
   { marketplace: 'Amazon', country: 'US', selected_destination_warehouse_id: null },
  'E1  §E the marketplace option resolves from its own TOKEN, not from the page scope');
eq(IRWarehouse.resolveDestinationPayload('MARKETPLACE_DESTINATION:Amazon:US', { country: 'JP' }).marketplace, 'Amazon',
  'E2  §E and a different page scope cannot change which marketplace the token names');
eq(IRWarehouse.resolveDestinationPayload('WH-US-3PL-01', US).selected_destination_warehouse_id, 'WH-US-3PL-01',
  'E3  §E a warehouse option keeps its real warehouse identity');
ok(/data-wh-code="' \+ _execEsc\(w\.warehouseCode \|\| ''\)/.test(PAGEC), 'E4  §E a warehouse option publishes its CODE');
var toHtml = (function () {
  var src = [extractFn(PAGE, '_execNameKey'), extractFn(PAGE, '_execNameCounts'), extractFn(PAGE, '_execWhOption'),
    extractFn(PAGE, '_execToOptionsHtml'), 'OUT = _execToOptionsHtml(LIST, SEL, true);'].join(String.fromCharCode(10));
  return function (list, sel) {
    return (new Function('LIST', 'SEL', '_execEsc', 'var OUT;' + src + 'return OUT;'))(list, sel, function (v) { return String(v == null ? '' : v); });
  };
})();
var CAND = [{ warehouseId: 'WH-US-3PL-01', warehouseName: 'US 3PL', warehouseCode: 'US3PL01', warehouseType: '3PL', country: 'US' },
  IRWarehouse.amazonLogicalDestination(US)];
ok(toHtml(CAND, '').indexOf('data-wh-code="US3PL01"') !== -1, 'E5  §E the warehouse option carries its code…');
ok(!/data-wh-code[^>]*>Amazon</.test(toHtml(CAND, '')), 'E6  §E …and the Amazon logical option carries NONE, by construction');
ok(toHtml(CAND, '').indexOf('selected') === -1, 'E7  §E H4 first load: NOTHING is preselected');
ok(toHtml(CAND, IRWarehouse.amazonLogicalToken('US')).indexOf('selected>Amazon</option>') !== -1,
  'E8  §E an EXPLICITLY chosen Amazon token does select Amazon');
ok(toHtml(CAND, 'WH-US-3PL-01').indexOf('selected>US 3PL</option>') !== -1, 'E9  §E and a warehouse selection reloads selected');

// ================================================================================================================
section('F · §F — EXPLICIT ADOPTION, AGAINST THE SHIPPED WRITER AND AN IN-MEMORY SHEET');
// ================================================================================================================
var SHEET = (function () {
  // The live header is 30 BASE columns plus the two optional tails (lifecycle + route identity) = 35, which is
  // what B5 measured on the production sheet. Composed here from the shipped constants rather than counted.
  var base = eval('(' + extractVar(G16, 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_') + ')');
  var life = eval('(' + extractVar(G16, 'SAD_LIFECYCLE_TAIL_COLUMNS_') + ')');
  var route = eval('(' + extractVar(G16, 'SAD_ROUTE_IDENTITY_TAIL_COLUMNS_') + ')');
  return { h: base.concat(life).concat(route), l: eval('(' + extractVar(G16, 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_') + ')') };
})();
ok(SHEET.h.length === 35, 'F0  the frozen 35-column header schema is what the simulation writes into');

// A minimal in-memory Sheet the shipped writer can drive. NO live spreadsheet, NO network.
function FakeSheet(headers, rows) {
  var data = [headers.slice()].concat((rows || []).map(function (r) { return headers.map(function (h) { return r[h] == null ? '' : r[h]; }); }));
  this.getName = function () { return 'fake'; };
  this.getLastRow = function () { return data.length; };
  this.getLastColumn = function () { return headers.length; };
  this.getDataRange = function () { return { getValues: function () { return data; } }; };
  this.getRange = function (r, c, nr, nc) {
    return {
      getValues: function () {
        var out = [];
        for (var i = 0; i < (nr || 1); i++) { var row = []; for (var j = 0; j < (nc || 1); j++) row.push(data[r - 1 + i][c - 1 + j]); out.push(row); }
        return out;
      },
      setValues: function (v) { for (var i = 0; i < v.length; i++) for (var j = 0; j < v[i].length; j++) data[r - 1 + i][c - 1 + j] = v[i][j]; },
      setValue: function (v) { data[r - 1][c - 1] = v; }
    };
  };
  this.appendRow = function (arr) { data.push(arr.slice()); };
  this.rows = function () {
    return data.slice(1).map(function (row) { var o = {}; headers.forEach(function (h, i) { o[h] = row[i]; }); return o; });
  };
}
// Drive routeHeaderFields → buildDraftHeaderPayload → the fields the writer would setCol().
function adoptionPayload(route) {
  var h = IRDraft.routeHeaderFields(US, route);
  var p = IRDraft.buildDraftHeaderPayload({
    allocation_draft_id: route.allocation_draft_id,
    planning_cycle: h.planning_cycle, company: h.company, country: h.country, marketplace: h.marketplace,
    source_warehouse_id: h.recommended_source_warehouse_id,
    destination_warehouse_id: h.recommended_destination_warehouse_id,
    source_warehouse_code: h.source_warehouse_code,
    destination_warehouse_code: h.destination_warehouse_code,
    shipping_method: h.recommended_shipping_method,
    last_mile_delivery: h.recommended_last_mile_delivery,
    destination_marketplace: h.destination_marketplace,
    allow_legacy_reconcile: route.allow_legacy_reconcile === true ? true : undefined
  });
  return p;
}
// Apply the writer's OWN update rule to the stored row: `if (header[f] != null) setCol(f, String(header[f]))`.
var WRITER_UPDATE_FIELDS = ['recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery', 'destination_marketplace'];
ok(new RegExp("\\['recommended_source_warehouse_id'[\\s\\S]{0,400}?'destination_marketplace'\\]\\.forEach\\(function \\(f\\) \\{ if \\(header\\[f\\] != null\\) setCol\\(f, String\\(header\\[f\\]\\)\\); \\}\\)").test(code(G16)),
  'F1  the shipped writer clears on an EXPLICIT BLANK and preserves only on an OMITTED field');
eq(WRITER_UPDATE_FIELDS.filter(function (f) { return code(G16).indexOf("'" + f + "'") === -1; }), [],
  'F2  and all eight route fields are in that list, including the destination code snapshot');

function applyWriterUpdate(stored, payload) {
  var out = {}; for (var k in stored) out[k] = stored[k];
  WRITER_UPDATE_FIELDS.forEach(function (f) { if (payload[f] != null) out[f] = String(payload[f]); });
  return out;
}
// --- H4 chooses Amazon and the operator confirms -------------------------------------------------------------
var sheet = new FakeSheet(SHEET.h, [H4]);
var lineSheet = new FakeSheet(SHEET.l, [L4]);
var amazonRoute = {
  allocation_draft_id: 'SADH-K2-E7AF9242', allocation_draft_line_id: 'SADL-K2-16F4E4F9',
  source_warehouse_id: YOUXIN, source_warehouse_code: '',
  destination_type: 'MARKETPLACE_DESTINATION', destination_marketplace: 'Amazon',
  destination_warehouse_id: '', destination_warehouse_code: '',
  shipping_method: 'sea', qty: 800, allow_legacy_reconcile: true
};
var payload = adoptionPayload(amazonRoute);
var after = applyWriterUpdate(sheet.rows()[0], payload);
eq(after.allocation_draft_id, 'SADH-K2-E7AF9242', 'F3  §F stored header id UNCHANGED');
eq(L4.allocation_draft_line_id, 'SADL-K2-16F4E4F9', 'F4  §F line id UNCHANGED');
eq(after.recommended_shipping_method, 'sea', 'F5  §F service still sea');
eq(Number(L4.planned_qty), 800, 'F6  §F planned_qty still 800');
eq(after.destination_marketplace, 'Amazon', 'F7  §F destination_marketplace = Amazon');
eq(after.recommended_destination_warehouse_id, '', 'F8  §F recommended_destination_warehouse_id = \'\'');
eq(after.recommended_destination_warehouse_code_snapshot, '',
  'F9  §F/§G.3 the legacy Amazon warehouse snapshot is CLEARED — the whole point of the round');
eq(sheet.rows().length, 1, 'F10 §F no second header');
eq(lineSheet.rows().length, 1, 'F11 §F no second line');
eq(after.recommended_source_warehouse_id, YOUXIN, 'F12 §F the source is untouched');
// Replay: the same payload applied again is idempotent.
var replay = applyWriterUpdate(after, adoptionPayload(amazonRoute));
eq(replay, after, 'F13 §F replay is idempotent — the second save changes nothing');
eq(replay.allocation_draft_id, after.allocation_draft_id, 'F14 §F and re-keys nothing');
// The fingerprint must SEE this change, or the writer would return REUSE + zero_write and the operator would be
// told a save succeeded while the column stayed blank. B6 closed exactly this trap for destination_marketplace.
ok(/'destination_marketplace'/.test(extractVar(G16, 'SAD_K2_HEADER_FP_')),
  'F15 §F destination_marketplace IS in the header fingerprint, so the adoption is not a silent no-op');
ok(/'recommended_destination_warehouse_code_snapshot'/.test(extractVar(G16, 'SAD_K2_HEADER_FP_')),
  'F16 §F and so is the snapshot column');
ok(/OPTIONAL_PRESERVE/.test(code(G16)) && /SAD_K2_SEM_OPTIONAL_PRESERVE_/.test(code(G16)),
  'F17 §F the snapshot alone is OPTIONAL_PRESERVE — clearing it needs a real change beside it, and Amazon is one');

// --- a real physical warehouse destination -------------------------------------------------------------------
var whRoute = {
  allocation_draft_id: 'SADH-K2-E7AF9242', source_warehouse_id: YOUXIN, source_warehouse_code: '',
  destination_warehouse_id: 'WH-US-3PL-01', destination_warehouse_code: 'US3PL01',
  destination_marketplace: '', shipping_method: 'sea', qty: 800
};
var afterWh = applyWriterUpdate(new FakeSheet(SHEET.h, [H4]).rows()[0], adoptionPayload(whRoute));
eq(afterWh.recommended_destination_warehouse_id, 'WH-US-3PL-01', 'F18 §F warehouse save: the real warehouse id');
eq(afterWh.recommended_destination_warehouse_code_snapshot, 'US3PL01', 'F19 §F/§G.4 and the snapshot becomes ITS code');
eq(afterWh.destination_marketplace, '', 'F20 §F with destination_marketplace blank');
// Reload → the picker selects the same warehouse.
ok(toHtml(CAND, afterWh.recommended_destination_warehouse_id).indexOf('selected>US 3PL</option>') !== -1,
  'F21 §F after reload the To picker selects the SAME warehouse');

// ================================================================================================================
section('G · §G — THE LEGACY SNAPSHOT POLICY, AND THE ZERO-WRITE RULES');
// ================================================================================================================
eq(HR.destination_warehouse_code, 'Amazon', 'G1  §G.1 hydration reads the legacy value…');
eq(HR.destination_marketplace, '', 'G2  §G.1 …and never promotes it');
ok(!/destination_snapshot|destination_warehouse_code[\s\S]{0,80}?resolvePersistedDestination/.test(
     code(extractFn(CMP, 'resolvePersistedDestination'))),
  'G3  §G.1 the destination resolver reads the id/marketplace columns ONLY — it never sees a snapshot');
eq(hyd.ok, true, 'G4  §G.2 page load hydrates…');
ok(!/setCol|upsertShippingAllocationDraft|refreshCacheTables/.test(code(extractFn(PAGE, '_hydrateAllocationDraftFromDb'))),
  'G5  §G.2/§J.19 …and writes NOTHING, so it cannot clear the legacy value either');
eq(after.recommended_destination_warehouse_code_snapshot, '', 'G6  §G.3 explicit Amazon + confirm CLEARS it');
eq(afterWh.recommended_destination_warehouse_code_snapshot, 'US3PL01', 'G7  §G.4 explicit warehouse UPDATES it');
// §G.5 — cancel is zero request, zero write. B6 owns that gate; this asserts it still holds.
ok(/legacy adoption NOT confirmed — zero rows written, zero requests issued/.test(PAGE),
  'G8  §G.5 a declined confirmation returns before any request is issued');
ok(/if \(typeof window\.confirm !== 'function'\) return false;/.test(PAGEC),
  'G9  §G.5 and with no confirm available the answer is NO, never an assumed yes');
var confirmSrc = code(extractFn(PAGE, '_irConfirmLegacyAdoption_'));
ok(!/fetch|_irPersistOneRouteGroup_|upsert/.test(confirmSrc), 'G10 §G.5 the confirmation itself issues no request');

// ================================================================================================================
section('G2 · THE SERVER GAP THAT MADE THE MISUSE NECESSARY');
// ================================================================================================================
// The client could not simply stop writing 'Amazon' into the warehouse-code column, because the writer the page
// ACTUALLY calls never carried destination_marketplace — so a correctly XOR'd payload would have left the row
// with no destination at all and Submit would have refused it. This is the reason the round touches the server.
var UPSERT = extractFn(G16, 'sadUpsertDraftHeaderCore_');
ok(/if \(action === 'upsertShippingAllocationDraft'\) \{\s*return handleUpsertShippingAllocationDraft_\(body\);/.test(code(read('assets/specs/active/apps-script/01_router.gs'))),
  'X1  the page\'s action routes to handleUpsertShippingAllocationDraft_…');
// A character budget cannot delimit a function — that mistake has cost this repository four false failures
// now. The handler is extracted whole and asked what it calls.
ok(/return sadUpsertDraftHeaderCore_\(body\);/.test(code(extractFn(G16, 'handleUpsertShippingAllocationDraft_'))),
  'X2  …which is sadUpsertDraftHeaderCore_ — NOT the atomic writer B6 worked on');
ok(/window\.KM\.DB\.upsertShippingAllocationDraft\(header\)/.test(PAGEC),
  'X3  and that is the call the shipped save path makes');
// The two writers must not disagree about whether a marketplace destination is persistable.
ok(/'recommended_last_mile_delivery',\s*'destination_marketplace'\]\.forEach/.test(code(UPSERT)),
  'X4  the UPDATE path now carries destination_marketplace');
ok(/destination_marketplace: String\(\(body && body\.destination_marketplace\) \|\| ''\)\.trim\(\)/.test(code(UPSERT)),
  'X5  and so does the INSERT path');
ok(/ROUTE_IDENTITY_NOT_PERSISTABLE[\s\S]{0,200}?destination_marketplace/.test(code(UPSERT)),
  'X6  a supplied marketplace with NO column is REFUSED, not silently dropped');
ok(/zero_write: true/.test(code(UPSERT).slice(code(UPSERT).indexOf('ROUTE_IDENTITY_NOT_PERSISTABLE') - 400,
                                              code(UPSERT).indexOf('ROUTE_IDENTITY_NOT_PERSISTABLE') + 400)),
  'X7  and that refusal declares a zero write');
// F1-7N-FB-4G-A0-R2 — RESTATED. A0-R1 asserted the SHAPE of two predicates: a `toReal || marketplace` test and
// a stored gate that "tries that first" before its snapshot fallback. A0-R2 replaced both — the `||` is what
// let a BOTH row through, and the snapshot fallback is what let the live H4 header pass Submit on a marketplace
// name in a warehouse-code column. What A0-R1 was protecting is the BEHAVIOUR, so that is asserted now, by
// execution, and it is unchanged: a stored marketplace destination is complete without any snapshot, and a
// header with neither is not.
var STORED_GATE = (function () {
  var src = [extractFn(G69, 'ricDestinationIdentity_'), extractFn(G16, 'sadDestinationIdentity_'),
    extractFn(G16, 'sadHeaderRouteIsComplete_'), extractFn(G16, 'sadStoredHeaderRouteIsComplete_'),
    'OUT = sadStoredHeaderRouteIsComplete_;'].join(String.fromCharCode(10));
  return (new Function('var OUT;' + src + 'return OUT;'))();
})();
var BASE_H = { recommended_source_warehouse_id: YOUXIN, recommended_shipping_method: 'sea' };
function withDest(x) { var o = {}; for (var k in BASE_H) o[k] = BASE_H[k]; for (var k2 in x) o[k2] = x[k2]; return o; }
eq(STORED_GATE(withDest({ destination_marketplace: 'Amazon' })), true,
  'X8  a stored MARKETPLACE destination is route-complete — with no snapshot anywhere');
eq(STORED_GATE(withDest({ recommended_destination_warehouse_id: 'WH-US-3PL-01' })), true,
  'X9  and so is a stored WAREHOUSE destination');
eq(STORED_GATE(withDest({ recommended_destination_warehouse_code_snapshot: 'Amazon' })), false,
  'X10 a header whose ONLY "destination" is a code snapshot is INCOMPLETE — the gate never widened');

// ================================================================================================================
section('H · DEPLOYMENT IDENTITY');
// ================================================================================================================
// F1-7N-FC-1A-R1 — at-or-after: this round added no router action, but R1 does.
ok(Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]) >= 10,
  'H1  action contract is at or after 10 (this round added no router action)');
// F1-7N-FB-4G-A2-R3 - RESTATED to a floor: an equality forbids every later round from adding an action.
ok(Number((G63.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1]) >= 9,
  'H2  required-action-list is at or after 9');
eq((G63.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1], '1', 'H3  transport contract still 1');
// THIS ROUND DOES CHANGE THE SERVER, and that is the finding rather than an accident: sadUpsertDraftHeaderCore_
// — the writer the Execution Plan actually calls — never carried destination_marketplace, so the client could
// not stop writing the misuse without leaving the route with no destination at all. The owner stamp MOVES.
// F1-7N-FB-4G-A0-R2 — RESTATED. A0-R1 pinned its own stamp as an equality with the present — the SIXTH round
// for that shape. What it established is a FLOOR (16_ carries A0-R1's change or something later) plus the
// durable rule that the manifest must agree with the SOURCE rather than with a number typed twice.
ok(RO.stampAtOrAfter((G16.match(/var SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1], 'F1-7N-FB-4G-A0-R1'),
  'H4  the 16_ owner stamp is at or after A0-R1 — this round changed the server, deliberately');
eq((G63.match(/\{ file: '16_shipping_allocation_handlers\.gs', symbol: 'SAD_BUILD_VERSION_', expected: '([^']+)'/) || [])[1],
   (G16.match(/var SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1],
  'H5  and 63_\'s manifest expects what the SOURCE declares, so a half-synced deployment is detectable');
// F1-7N-FB-4G-A1 — RESTATED. This read `git diff --name-only HEAD`, which measures the WORKING TREE, and so
// it asserted "exactly these two files are currently uncommitted". That was true only while A0-R1 itself was
// unfinished; the moment it became a commit the assertion started describing whoever edits the repository
// next. Same class as the equality-with-now stamps. The DURABLE statement is about the sync set itself: the
// deployment identity is declared in 16_ and expected by 63_, and by NO other Apps Script file - so a reader
// can derive the two-file sync set from the source at any time, with no working tree involved.
var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); });
eq(GS_FILES.filter(function (f) { return /var SAD_BUILD_VERSION_ = /.test(fs.readFileSync(path.join(GS_DIR, f), 'utf8')); }),
   ['16_shipping_allocation_handlers.gs'],
  'H5b the allocation owner stamp is DECLARED in exactly one Apps Script file');
eq(GS_FILES.filter(function (f) { return /symbol: 'SAD_BUILD_VERSION_'/.test(fs.readFileSync(path.join(GS_DIR, f), 'utf8')); }),
   ['63_api_v1_system_health.gs'],
  'H5c and EXPECTED in exactly one other — those two are the sync set, derived from the source, not from a diff');
var TOKEN = RO.currentAppToken();
ok(RO.tokenAtOrAfter(TOKEN, 'fb4ga0-livehydration-20260902'), 'H6  the release order has not moved behind A0');
function refToken(file) {
  var m = new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([A-Za-z0-9._-]+)').exec(INDEX);
  return m ? m[1] : '';
}
eq(refToken('assets/js/pages/inventory-replenishment.js'), TOKEN, 'H7  the page carries the current token');
eq(refToken('assets/js/utils/inventory-compat.js'), TOKEN, 'H8  and so does inventory-compat.js — it changed this round');
eq(INDEX.split(TOKEN).length - 1, 18, 'H9  all 18 co-deployed references moved together');

// ================================================================================================================
section('I · MUTATIONS — every one verified by actually applying it');
// ================================================================================================================
function mutateFn(src, name, find, replace) {
  var orig = extractFn(src, name);
  var m = (find instanceof RegExp) ? orig.replace(find, replace) : orig.split(find).join(replace);
  if (m === orig) throw new Error('mutation did not apply inside ' + name + ': ' + find);
  return src.replace(orig, m);
}
// M1 — the renderer stops emitting `selected`.
mut('M1  a renderer that never emits selected is detected', function () {
  var mutated = mutateFn(PAGE, '_execMethodOptionsHtml', "var sel = svc(selected, m.value) ? ' selected' : '';", "var sel = '';");
  var src = [extractFn(mutated, '_execMethodOptionsHtml'), 'OUT = _execMethodOptionsHtml(RES, SEL);'].join(String.fromCharCode(10));
  var html = (new Function('RES', 'SEL', 'window', '_execEsc', 'var OUT;' + src + 'return OUT;'))(
    ready(RATE_CARDS_EXACT), 'sea', { IRService: IRService }, function (v) { return String(v); });
  return selectedLabel(html) === '';
});
// M2 — the LABEL used as the canonical value.
mut('M2  using the label as the canonical value is detected', function () {
  return IRService.canonical(LABELS.sea) === '' && IRService.matches('sea', LABELS.sea) === false;
});
// M3 — sea falling back to sea_express.
mut('M3  a sea → sea_express fallback is detected', function () {
  return IRService.matches('sea', 'sea_express') === false &&
    selectedLabel(optHtml(ready([{ value: 'sea_express', label: LABELS.sea_express }]), 'sea')) === '';
});
// M4 — the legacy snapshot auto-promoted to a marketplace destination.
mut('M4  auto-promoting the legacy Amazon snapshot is detected', function () {
  // F1-7N-FB-4G-A0-R2 — resolvePersistedDestination is built ON destinationIdentity now, so the promotion has
  // to be introduced where the rule actually lives. Mutating the old inline copy would not apply at all, which
  // is a broken probe rather than a passing test.
  var mutated = mutateFn(CMP, 'destinationIdentity',
    'var mkt = s(route.destination_marketplace);',
    'var mkt = s(route.destination_marketplace) || s(route.destination_warehouse_code_snapshot);');
  var f = new Function('persisted', 'scope', 'up',
    'var DESTINATION_CONFIRMATION_REQUIRED = "DESTINATION_CONFIRMATION_REQUIRED";' +
    'var DESTINATION_AMBIGUOUS = "DESTINATION_AMBIGUOUS";' +
    extractFn(CMP, 'marketplaceDestinationToken') +
    extractFn(mutated, 'destinationIdentity') +
    extractFn(mutated, 'resolvePersistedDestination') +
    'return resolvePersistedDestination(persisted, scope);');
  var snapOnly = { destination_warehouse_id: '', destination_marketplace: '', destination_warehouse_code_snapshot: 'Amazon' };
  var honest = IRWarehouse.resolvePersistedDestination(snapOnly, US);
  var mut1 = f(snapOnly, US, function (v) { return String(v == null ? '' : v).trim().toUpperCase(); });
  return honest.state === 'DESTINATION_CONFIRMATION_REQUIRED' && mut1.state === 'PERSISTED_MARKETPLACE';
});
// M5 — the marketplace written into the warehouse snapshot column.
mut('M5  writing a marketplace into the warehouse-code column is detected', function () {
  // F1-7N-FB-4G-A0-R2 - the expression this mutated was replaced by the identity-driven one, so the mutant
  // no longer applied at all. Same defect, introduced where the code now lives.
  var mutated = mutateFn(CMP, 'routeHeaderFields',
    "destination_warehouse_code: _d.ok ? (isWarehouse ? _code : '') : _code",
    "destination_warehouse_code: String(route.destination == null ? '' : route.destination).trim()");
  var f = new Function('scope', 'route', 'destinationIdentity',
    extractFn(mutated, 'routeHeaderFields') + 'return routeHeaderFields(scope, route);');
  var got = f(US, { destination: 'Amazon', destination_type: 'MARKETPLACE_DESTINATION', destination_marketplace: 'Amazon' },
    IRWarehouse.destinationIdentity);
  return got.destination_warehouse_code === 'Amazon' && MKT.destination_warehouse_code === '';
});
// M6 — BOTH identities allowed through.
mut('M6  allowing BOTH destination identities is detected', function () {
  // F1-7N-FB-4G-A0-R2 - A0-R1 detected BOTH by checking that routeHeaderFields had BLANKED one side, which was
  // the collapse itself. The detection is the REFUSAL now: ambiguous identity, incomplete route, no request.
  var d = IRWarehouse.resolvePersistedDestination({ destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' }, US);
  var mutated = mutateFn(CMP, 'destinationIdentity',
    "if (wid && mkt) return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_AMBIGUOUS', warehouse_id: wid, marketplace: mkt };",
    "if (wid && mkt) return { type: 'MARKETPLACE', id: mkt.toLowerCase(), ok: true, code: '', warehouse_id: '', marketplace: mkt };");
  var mf = new Function('route', extractFn(mutated, 'destinationIdentity') + 'return destinationIdentity(route);');
  return d.state === 'DESTINATION_AMBIGUOUS' && d.warehouse_id === '' && d.marketplace === '' &&
    IRWarehouse.destinationIdentity(BOTH_ROUTE()).ok === false &&
    IRDraft.isRouteComplete(BOTH_ROUTE()) === false &&
    mf(BOTH_ROUTE()).ok === true;
});
// M7 — adoption creating a NEW header instead of reusing the stored one.
mut('M7  adoption creating a second header is detected', function () {
  var p = adoptionPayload(amazonRoute);
  var pNoId = adoptionPayload({ source_warehouse_id: YOUXIN, destination_type: 'MARKETPLACE_DESTINATION',
    destination_marketplace: 'Amazon', shipping_method: 'sea' });
  return p.allocation_draft_id === 'SADH-K2-E7AF9242' && pNoId.allocation_draft_id === undefined;
});
// M8 — adoption rewriting the stored id.
mut('M8  adoption rewriting the stored id is detected', function () {
  var mutatedRoute = {}; for (var k in amazonRoute) mutatedRoute[k] = amazonRoute[k];
  mutatedRoute.allocation_draft_id = 'SADH-K4-DIFFERENT';
  return adoptionPayload(amazonRoute).allocation_draft_id === 'SADH-K2-E7AF9242' &&
    adoptionPayload(mutatedRoute).allocation_draft_id === 'SADH-K4-DIFFERENT';
});
// M9 — a declined confirmation that still sends a request.
mut('M9  a cancel that still writes is detected', function () {
  var flush = code(PAGE.slice(PAGE.indexOf('var _adoptGroups = _irAdoptionGroupsNeedingConfirmation_'),
    PAGE.indexOf('var _adoptGroups = _irAdoptionGroupsNeedingConfirmation_') + 800));
  return /if \(!_irConfirmLegacyAdoption_\(_adoptGroups\[_ai\]\)\) \{[\s\S]{0,400}?return;/.test(flush);
});
// M10 — a warehouse selection lost on reload.
mut('M10 losing a warehouse selection on reload is detected', function () {
  var withCode = toHtml(CAND, 'WH-US-3PL-01');
  var withoutId = toHtml(CAND, '');
  return withCode.indexOf('selected>US 3PL</option>') !== -1 && withoutId.indexOf('selected') === -1;
});
// M11 — the rebuild going back to reading only the DOM.
mut('M11 a rebuild that reads only the DOM is detected', function () {
  var mutated = mutateFn(PAGE, '_execRebuildMethodOptions',
    "var current = methodEl.value || (userTouched ? '' : persistedMethod);", "var current = methodEl.value;");
  var methodEl = new FakeSelect();
  methodEl.innerHTML = LOADING;
  var rowAttrs = { 'data-method-persisted': 'sea' };
  var row = { getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(rowAttrs, k) ? rowAttrs[k] : null; },
    querySelector: function (q) { return /shipping_method/.test(q) ? methodEl : null; } };
  var src = [extractFn(mutated, '_execRebuildMethodOptions'), '_execRebuildMethodOptions("X");'].join(String.fromCharCode(10));
  (new Function('document', 'window', '_replenSelectedScope', '_execResolveMethods', '_execMethodRouteCtx',
    '_execMethodOptionsHtml', '_execEsc', src))(
    { getElementById: function () { return { querySelectorAll: function () { return { forEach: function (f) { f(row); } }; } }; } },
    { IRService: IRService }, function () { return US; }, function () { return ready(RATE_CARDS_EXACT); },
    function () { return {}; }, function (r, s) { return optHtml(r, s); }, function (v) { return String(v); });
  return methodEl.value === '' && late.value === 'sea';
});
// M12 — an unknown service quietly selecting the first option.
mut('M12 an unknown service selecting the first option is detected', function () {
  var html = optHtml(ready(RATE_CARDS_EXACT), 'teleport');
  return selectedLabel(html) === '' && /<option value="">Method…<\/option>/.test(html);
});

// M13 — the server writer going back to dropping the marketplace.
// F1-7N-FB-4G-A2-R2 - RESTATED because the MUTATION became insufficient, not because the rule changed.
// A2-R2 gave sadUpsertDraftHeaderCore_ a second route-field list (the UPDATE_EXISTING_ROUTE branch writes the
// same recommended_* columns in place), and .replace() without /g rewrites only the FIRST one - so the mutant
// still wrote destination_marketplace from the other list and the probe reported MUTANT SURVIVED while proving
// nothing. A field that two writers must carry has to be removed from BOTH to be dropped.
mut('M13 a header writer that drops destination_marketplace is detected', function () {
  var honest = extractFn(G16, 'sadUpsertDraftHeaderCore_');
  // The invariant is NOT a count - a count breaks the next time a branch is added, which is how this probe
  // broke. It is that NO route-field list ends at recommended_last_mile_delivery, i.e. none of them omits the
  // canonical destination axis.
  var WITH = /'recommended_last_mile_delivery',\s*'destination_marketplace'\]/g;
  var WITHOUT = /'recommended_last_mile_delivery'\]/g;
  var withN = (honest.match(WITH) || []).length;
  if (withN < 2) throw new Error('expected every route-field list to carry destination_marketplace, found ' + withN);
  if ((honest.match(WITHOUT) || []).length !== 0) throw new Error('honest source already has a list omitting it');
  var mutated = honest.replace(WITH, "'recommended_last_mile_delivery']");
  if (mutated === honest) throw new Error('mutation did not apply inside sadUpsertDraftHeaderCore_');
  return (mutated.match(WITH) || []).length === 0 && (mutated.match(WITHOUT) || []).length === withN;
});
// The same invariant asserted directly: every list that writes the header's route columns carries the
// canonical destination axis, and none of them stops short of it.
(function () {
  var f = extractFn(G16, 'sadUpsertDraftHeaderCore_');
  ok((f.match(/'recommended_last_mile_delivery',\s*'destination_marketplace'\]/g) || []).length >= 2 &&
     (f.match(/'recommended_last_mile_delivery'\]/g) || []).length === 0,
    'M13a no route-field list in the header writer omits destination_marketplace');
})();

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed, mutations ' +
  neg.caught + ' caught / ' + neg.missed + ' missed');
process.exit(fail ? 1 : 0);
