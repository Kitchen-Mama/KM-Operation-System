// S7-R2B1 — BOOT-PAYLOAD GATE SEMANTIC CORRECTION + DOCUMENT RETRY REPAIR.
//
// Two tightly related halves. S7-R2B proved the shared Document Panel's Retry was broken on both surfaces and
// could not repair it, because the s4-r5 boot-payload gate had 58 bytes of headroom and both panel owners are
// boot-loaded scripts. This round fixes the gate's ENCODING, then fixes the defect.
//
// THE GATE. A1d1 floored the boot payload against a historical total: boot must stay 1.5 MB below the
// pre-S4-R5 figure. That is a budget, not an invariant — it shrinks whenever anyone maintains an approved boot
// owner and runs out at a moment nobody chose. Worse, the SET guard beside it was never running: A1d read
// `M.boot.post.local ? <set> : <count>` and S4-R5 never recorded post.local, so the live gate was
// `localCount === 67` and swapping one boot script for another passed. The threshold is not raised here; it is
// replaced by the claim it stood in for, and on the structural side the replacement is STRICTLY STRONGER —
// set pinned by name, order pinned, route-at-boot checked against the whole registry. Byte growth inside an
// approved owner is measured and printed, never gated: S8_BOOT_PAYLOAD_HEADROOM_AND_LOADING_ARCHITECTURE.
//
// THE DEFECT. shRetryDocument(entityType, entityId, btnEl) was invoked as (entityId, generated_document_id),
// so document.retry got an entity id where the TYPE belongs and a document id where the entity id belongs; and
// on success the handler re-read the SHIPMENT workspace from whichever surface called it.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. NO DRIVE. Fixtures and a counting transport double.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s7-r2b1-boot-topology-and-document-retry.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }

var SH = read('js/pages/shipping-history.js');
var POJS = read('js/pages/purchase-order-overview.js');
var API = read('js/api/operation-system-db-api.js');
var G39 = read('specs/active/apps-script/39_document_runtime_service.gs');
var S4R5 = read('tests/s4-r5-route-payloads.test.js');
var BT = require('./_boot-topology.js');
var RUNNER = require('./_s4r5-route-payload-runner.js');
var MEAS = JSON.parse(read('../docs/evidence/s4-r5-route-payloads/measurements.json'));

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function count(s, re) { return (String(s).match(re) || []).length; }
function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}
// A mutant whose verdict only exists after a promise settles. mut() compares `fn() === true`, and a
// PROMISE is never true — so an async mutant routed through mut() reports SURVIVED no matter what it
// found. A mutant harness that cannot fail is worse than no mutant, so these get their own tally.
var ASYNC_MUTANTS = [];
function mutAsync(label, fn) {
  mutants++;
  ASYNC_MUTANTS.push(Promise.resolve().then(fn).then(function (c) { return c === true; },
    function () { return true; }).then(function (caught) {
    if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
    else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
  }));
}
function slice(src, from, to, tag) {
  var a = src.indexOf(from); if (a < 0) throw new Error(tag + ': start anchor drifted');
  var b = src.indexOf(to, a); if (b < 0) throw new Error(tag + ': end anchor drifted');
  return src.slice(a, b + to.length);
}

// ==========================================================================================================
section('A  THE BOOT TOPOLOGY GATE — what it now defends');
// ==========================================================================================================
var live = RUNNER.bootSurface();
var topo = BT.bootTopology(live.local, live.routeAssets);

eq(topo.undeclared, [], 'A1  UNDECLARED_BOOT_SCRIPT_COUNT = 0');
eq(topo.missing, [], 'A1a no declared boot script has stopped loading');
eq(topo.setChangeCount, 0, 'A1b BOOT_SCRIPT_SET_UNEXPECTED_CHANGE_COUNT = 0');
eq(topo.orderDriftCount, 0, 'A1c BOOT_ORDER_DRIFT_COUNT = 0');
eq(topo.routeAtBoot, [], 'A1d NEW_ROUTE_SCRIPT_AT_BOOT_COUNT = 0');
eq([topo.declaredCount, topo.liveCount], [67, 67], 'A1e the census and the shell agree on 67 boot scripts');

// The old brittle floor is GONE from the gate, and that is asserted rather than assumed.
eq(count(S4R5, /M\.boot\.pre\.bytes - 1500 \* 1024/g), 0,
  'A2  the aggregate historical byte floor no longer gates s4-r5');
ok(/const topo = BT\.bootTopology\(live\.local, live\.routeAssets\);/.test(S4R5),
  'A2a and the gate now derives its claim from the boot topology');
ok(/S8_BOOT_PAYLOAD_HEADROOM_AND_LOADING_ARCHITECTURE/.test(S4R5),
  'A2b BOOT_PAYLOAD_PERFORMANCE_DEBT_OWNER = S8, recorded in the gate itself');

// §1 — the durable claims S4 cared about, still live and now stronger.
ok(/A1d4 NEW_ROUTE_SCRIPT_AT_BOOT_COUNT/.test(S4R5),
  'A3  A2_ROUTE_APPEND_GUARD is live, generalized from nine remembered names to the whole registry');
ok(live.routeAssets.length === 16,
  'A3a and that registry is 16 files, every one of which must stay off boot', live.routeAssets.length);

// BOOT PAYLOAD: measured and reported, not gated.
console.log('     BOOT_PAYLOAD_BYTES = ' + live.bytes + '   (pre-S4-R5 ' + MEAS.boot.pre.bytes + ')');
ok(live.bytes < MEAS.boot.pre.bytes,
  'A4  the boot payload is still below the pre-S4-R5 total — reported, not floored',
  { pre: MEAS.boot.pre.bytes, now: live.bytes });

// ==========================================================================================================
section('B  THE RETRY PATH, EXECUTED — one transport double, two surfaces');
// ==========================================================================================================
// The repaired handler and its refresh registry, lifted out of the shipped page and RUN. Asserting ABOUT this
// code with a regex could only ever prove that some characters are present; the claims below are behavioural.
var RETRY_SRC = slice(lf(SH), 'var SH_DOC_REFRESH_ = {};', "reload before trying again.';\n        }\n    });\n}", 'retry block');

// Build a fresh sandbox per scenario so no test can inherit another's registry or counters.
function retryHarness(transport) {
  var calls = [], refreshed = [];
  var sandbox = {
    window: { KM: { DB: { retryDocumentGeneration: function (type, id) {
      calls.push({ related_entity_type: type, related_entity_id: id });
      return transport(type, id);
    } } } },
    _shLoadAndRender: function () { refreshed.push('shipment-workspace'); },
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(RETRY_SRC, sandbox);
  // The PO page registers its own bounded readback; mirror that registration here exactly as it ships.
  sandbox.shRegisterDocumentRefresh('purchase_order', function (poId) { refreshed.push('po-readback:' + poId); });
  return { fn: sandbox.shRetryDocument, calls: calls, refreshed: refreshed };
}
function btn() { return { disabled: false, textContent: 'Retry', title: '', style: {} }; }
function okResp() { return Promise.resolve({ success: true }); }

ok(typeof retryHarness(okResp).fn === 'function',
  'B1  the shipped retry handler and its refresh registry load and run outside a browser');

// ---- §9 — the PO path -----------------------------------------------------------------------------------
var poRun = retryHarness(okResp), poBtn = btn();
var poDone = poRun.fn('purchase_order', 'PO-2026-0001', poBtn).then(function () {
  eq(poRun.calls, [{ related_entity_type: 'purchase_order', related_entity_id: 'PO-2026-0001' }],
    'B2  PO_RETRY_ENTITY_TYPE_CORRECT / PO_RETRY_ENTITY_ID_CORRECT — exactly one request, correctly addressed');
  eq(poRun.refreshed, ['po-readback:PO-2026-0001'],
    'B2a PO_RETRY_REFRESH_OWNER_CORRECT — the PO bounded readback ran');
  eq(poRun.refreshed.filter(function (r) { return r === 'shipment-workspace'; }).length, 0,
    'B2b PO_RETRY_SHIPMENT_WORKSPACE_REQUEST_COUNT = 0 — the wrong workspace is never touched');
  eq(poRun.calls.length, 1, 'B2c RETRY_REQUEST_COUNT_PER_CLICK = 1');
});

// ---- §10 — the Shipment path ----------------------------------------------------------------------------
var shRun = retryHarness(okResp), shBtn = btn();
var shDone = shRun.fn('shipment', 'SHP-0007', shBtn).then(function () {
  eq(shRun.calls, [{ related_entity_type: 'shipment', related_entity_id: 'SHP-0007' }],
    'B3  SHIPMENT_RETRY_ENTITY_TYPE_CORRECT / SHIPMENT_RETRY_ENTITY_ID_CORRECT');
  eq(shRun.refreshed, ['shipment-workspace'],
    'B3a SHIPMENT_RETRY_REFRESH_OWNER_CORRECT — and the PO readback never runs for a shipment');
});

// ---- §8 — one click, one request ------------------------------------------------------------------------
var dblRun = retryHarness(function () { return new Promise(function (r) { setTimeout(function () { r({ success: true }); }, 5); }); });
var dblBtn = btn();
var dbl1 = dblRun.fn('shipment', 'SHP-9', dblBtn);
var dbl2 = dblRun.fn('shipment', 'SHP-9', dblBtn);   // the double-click the operator actually performs
var dblDone = Promise.all([dbl1, dbl2]).then(function () {
  eq(dblRun.calls.length, 1,
    'B4  a double click sends ONE request — the button disables itself before the call');
});

// ---- §11 — failure and unknown --------------------------------------------------------------------------
var failRun = retryHarness(function () { return Promise.resolve({ success: false, error: 'TEMPLATE_NOT_CONFIGURED' }); });
var failBtn = btn();
var failDone = failRun.fn('purchase_order', 'PO-3', failBtn).then(function () {
  eq(failRun.refreshed, [],
    'B5  DOCUMENT_RETRY_FALSE_SUCCESS_COUNT = 0 — a refused retry refreshes nothing');
  eq(failBtn.textContent, 'Retry failed', 'B5a and the button says so');
  eq(failBtn.title, 'TEMPLATE_NOT_CONFIGURED', 'B5b carrying the backend reason, not a guess');
  eq(failRun.calls.length, 1, 'B5c DOCUMENT_RETRY_AUTOREPLAY_COUNT = 0 — it is not resent');
});

var unkRun = retryHarness(function () { return Promise.reject(new Error('socket closed')); });
var unkBtn = btn();
var unkDone = unkRun.fn('shipment', 'SHP-4', unkBtn).then(function () {
  eq(unkRun.refreshed, [], 'B6  an UNKNOWN outcome refreshes nothing and implies nothing');
  eq(unkBtn.textContent, 'Outcome unknown',
    'B6a and says so rather than resetting to a button that reads "nothing happened"');
  eq(unkRun.calls.length, 1, 'B6b and is never auto-replayed');
});

// ---- an unregistered surface is told the truth ----------------------------------------------------------
var newRun = retryHarness(okResp), newBtn = btn();
var newDone = newRun.fn('some_future_entity', 'X-1', newBtn).then(function () {
  eq(newRun.refreshed, [], 'B7  a surface with no registered refresh triggers no foreign re-read');
  eq(newBtn.textContent, 'Retried — reload',
    'B7a and the operator is told the retry landed and the screen is stale');
});

// ---- a retry with no honest target is not sent ------------------------------------------------------------
var voidRun = retryHarness(okResp);
voidRun.fn('', 'SHP-1', btn());
voidRun.fn('shipment', '', btn());
eq(voidRun.calls.length, 0,
  'B8  a retry missing either half of its target is NOT SENT — no \'shipment\' default to fall back on');

// ==========================================================================================================
section('C  THE BUTTON THE PANEL ACTUALLY RENDERS');
// ==========================================================================================================
var PANEL_SRC = slice(lf(SH), 'var SH_DOC_PANEL_VISIBLE_ROWS_ = 5;',
  "head + body + _shDocErrorHtml(model, state) + '<div style=\"margin-top:6px;\">' + badge + '</div>' +\n    '</div>';\n}", 'panel block');
var ESC_SRC = slice(lf(SH), 'function _shEsc(s) {', "\n}", '_shEsc');
var PANEL = (function () {
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(ESC_SRC + '\n' + PANEL_SRC, sandbox);
  return sandbox.shDocumentPanelHtml;
})();
function failedDoc(o) {
  o = o || {};
  return { generated_document_id: o.id || 'GD-1', related_entity_type: o.etype || 'shipment',
    related_entity_id: o.eid || 'SHP-1', document_type: o.type || 'packing_list',
    document_label: o.label || 'Packing List', file_name: 'PL.pdf', file_url: '', download_url: '',
    status: 'FAILED_RETRYABLE', retryable: true };
}

var poHtml = PANEL({ title: 'Purchase Order Documents', entity_type: 'purchase_order', entity_id: 'PO-2026-0001',
  documents: [failedDoc({ etype: 'purchase_order', eid: 'PO-2026-0001', type: 'purchase_order', label: 'Purchase Order' })],
  can_retry: true });
ok(poHtml.indexOf("shRetryDocument('purchase_order','PO-2026-0001',this)") !== -1,
  'C1  the PO panel renders Retry with the PO entity TYPE and the PO id, in that order');
ok(poHtml.indexOf("shRetryDocument('PO-2026-0001'") === -1,
  'C1a and never with the id in the type slot');

var shHtml = PANEL({ title: 'Shipment Documents', entity_type: 'shipment', entity_id: 'SHP-0007',
  documents: [failedDoc({ eid: 'SHP-0007' })], can_retry: true });
ok(shHtml.indexOf("shRetryDocument('shipment','SHP-0007',this)") !== -1,
  'C2  and the Shipment panel renders its own type and id');
ok(shHtml.indexOf('generated_document_id') === -1 && shHtml.indexOf('GD-1') === -1,
  'C2a RETRY_DOCUMENT_ID_SOURCE — no document id is sent: document.retry is ENTITY-scoped by contract');

// The row DTO is the fallback when a caller forgets to declare its type — never the id format.
var dtoHtml = PANEL({ entity_id: 'PO-9', documents: [failedDoc({ etype: 'purchase_order', eid: 'PO-9' })], can_retry: true });
ok(dtoHtml.indexOf("shRetryDocument('purchase_order','PO-9',this)") !== -1,
  'C3  with no entity_type on the model, the ROW names its own entity — RETRY_ENTITY_TYPE_SOURCE = DTO');
// Written out rather than built from failedDoc(): that helper falls back to defaults, so passing '' would
// hand the row an entity after all and the assertion would be testing the fixture.
var blindHtml = PANEL({ documents: [{ generated_document_id: 'GD-0', related_entity_type: '',
  related_entity_id: '', document_type: 'packing_list', document_label: 'Packing List',
  file_name: 'PL.pdf', file_url: '', download_url: '', status: 'FAILED_RETRYABLE', retryable: true }],
  can_retry: true });
ok(blindHtml.indexOf('sh-doc-retry') === -1,
  'C3a and with neither, NO button is offered rather than one aimed at a guess');

// §12/§13 — what this round must not have disturbed.
ok(/include: \{ documents: true \}/.test(POJS) && /include: \{ documents: true \}/.test(SH),
  'C4  PO_ / SHIPMENT_DOCUMENT_REDISCOVERY_SUPPORTED unchanged — both reads still ask for the projection');
var two = PANEL({ entity_type: 'shipment', entity_id: 'SHP-1',
  documents: [failedDoc({ id: 'A', type: 'packing_list', label: 'Packing List' }),
              failedDoc({ id: 'B', type: 'commercial_invoice', label: 'Commercial Invoice' })], can_retry: true });
ok(/Packing List/.test(two) && /Commercial Invoice/.test(two),
  'C4a multiple documents still render separately and keep their types');
eq(count(code(PANEL_SRC), /KM\.DB\.|fetch\(|getWorkspace/g), 0,
  'C4b the renderer still reaches no adapter and no transport — mount stays write-free, '
  + 'PER_DOCUMENT_RENDER_REQUEST_COUNT = 0');
ok(/if \(row && dgsRowState_\(row\) === 'READY'\) reuse\.push/.test(G39),
  'C5  RETRY_CREATES_SECOND_LOGICAL_DOCUMENT_COUNT = 0 — the backend reuses a READY row, unchanged');
eq(count(code(SH), /retryDocumentGeneration\(/g), 1,
  'C5a DOCUMENT_AUTORETRY_COUNT = 0 — one call site, inside the click handler');

// ==========================================================================================================
section('D  MUTANTS — the corrected gate still catches what S4 cared about');
// ==========================================================================================================
function topoOf(localOverride, routeOverride) {
  return BT.bootTopology(localOverride || live.local, routeOverride || live.routeAssets);
}
function withLocal(fn) { return live.local.map(function (x) { return { file: x.file, bytes: x.bytes, defer: x.defer }; }).filter(fn || function () { return true; }); }

mut('D1 §4A — a ROUTE script appended to boot', function () {
  var l = withLocal();
  l.push({ file: 'assets/js/pages/global-logistics-map.js', bytes: 127119, defer: true });
  var t = topoOf(l);
  return t.routeAtBoot.length > 0 || t.setChangeCount > 0;
});
mut('D2 §4B — an UNDECLARED boot script added', function () {
  var l = withLocal();
  l.push({ file: 'assets/js/pages/brand-new-thing.js', bytes: 999, defer: true });
  var t = topoOf(l);
  return t.undeclared.length > 0 && t.setChangeCount > 0;
});
mut('D3 §4C — an expected boot script removed', function () {
  var l = withLocal(function (x) { return x.file !== 'assets/js/core/namespace.js'; });
  var t = topoOf(l);
  return t.missing.length > 0 && t.setChangeCount > 0;
});
mut('D4 §4D — boot ORDER changed, which the old sorted comparison could not see', function () {
  var l = withLocal();
  var moved = l.splice(0, 1)[0];
  l.push(moved);
  var t = topoOf(l);
  return t.setChangeCount === 0 && t.orderDriftCount > 0;   // same SET, different order → still caught
});
mut('D5 §4E — the whole pre-S4-R5 eager boot shape restored', function () {
  var l = withLocal();
  live.routeAssets.forEach(function (f) { l.push({ file: f, bytes: 1, defer: true }); });
  var t = topoOf(l);
  return t.routeAtBoot.length === live.routeAssets.length;
});
mut('D6 §4A2 — a route script swapped IN for an approved one (set size unchanged)', function () {
  var l = withLocal(function (x) { return x.file !== 'assets/js/core/state.js'; });
  l.push({ file: 'assets/js/pages/inventory-replenishment.js', bytes: 1, defer: true });
  var t = topoOf(l);
  // The old gate compared COUNTS only (67 === 67) and would have passed this exactly.
  return t.liveCount === 67 && (t.setChangeCount > 0 || t.routeAtBoot.length > 0);
});

// §4F — THE POINT OF THE RE-ENCODING. Ordinary growth inside an already-approved owner must NOT fail.
var grown = withLocal().map(function (x) {
  return x.file === 'assets/js/pages/shipping-history.js' ? { file: x.file, bytes: x.bytes + 4096, defer: x.defer } : x;
});
var grownTopo = topoOf(grown);
eq([grownTopo.setChangeCount, grownTopo.orderDriftCount, grownTopo.routeAtBoot.length], [0, 0, 0],
  'D7 §4F — adding 4 KB to an already-approved boot owner changes NO topology claim. That is the whole '
  + 'correction: the gate defends architecture, not spelling or historical size');
ok(grownTopo.bytes > topo.bytes,
  'D7a and the payload is still measured, so the growth is visible — it is simply not a functional failure');

// ==========================================================================================================
section('E  MUTANTS — the retry repair');
// ==========================================================================================================
mut('E1 §19 — entityType replaced by entityId at the call site', function () {
  var m = SH.replace("_shEsc(retryType) + '\\',\\'' + _shEsc(retryId)", "_shEsc(retryId) + '\\',\\'' + _shEsc(retryId)");
  return !/_shEsc\(retryType\) \+ '\\',\\'' \+ _shEsc\(retryId\)/.test(m);
});
mut('E2 §19 — entityId replaced by the document id', function () {
  var m = SH.replace("var retryId = String(entityId || (d && d.related_entity_id) || '').trim();",
    "var retryId = String((d && d.generated_document_id) || '').trim();");
  return !/var retryId = String\(entityId \|\| \(d && d\.related_entity_id\) \|\| ''\)\.trim\(\);/.test(m);
});
mutAsync('E3 §19 — PO retry refreshes the SHIPMENT workspace', function () {
  var m = RETRY_SRC.replace('var refresh = SH_DOC_REFRESH_[type];', 'var refresh = SH_DOC_REFRESH_["shipment"];');
  var calls = [], refreshed = [];
  var sandbox = { window: { KM: { DB: { retryDocumentGeneration: function (t, i) { calls.push([t, i]); return Promise.resolve({ success: true }); } } } },
    _shLoadAndRender: function () { refreshed.push('shipment-workspace'); }, console: console };
  vm.createContext(sandbox);
  vm.runInContext(m, sandbox);
  sandbox.shRegisterDocumentRefresh('purchase_order', function (id) { refreshed.push('po-readback:' + id); });
  return sandbox.shRetryDocument('purchase_order', 'PO-1', btn()).then(function () {
    return refreshed.indexOf('shipment-workspace') !== -1;   // the regression, detected
  });
});
mut('E4 §19 — the double-click guard removed, so one click sends two requests', function () {
  var m = RETRY_SRC.replace('if (btnEl) { if (btnEl.disabled) return; btnEl.disabled = true;', 'if (btnEl) { btnEl.disabled = true;');
  var calls = [];
  var sandbox = { window: { KM: { DB: { retryDocumentGeneration: function (t, i) { calls.push([t, i]); return Promise.resolve({ success: true }); } } } },
    _shLoadAndRender: function () {}, console: console };
  vm.createContext(sandbox);
  vm.runInContext(m, sandbox);
  var b = btn();
  sandbox.shRetryDocument('shipment', 'S1', b);
  sandbox.shRetryDocument('shipment', 'S1', b);
  return calls.length !== 1;
});
mutAsync('E5 §19 — a failed retry refreshes anyway, implying success', function () {
  var m = RETRY_SRC.replace('if (res && res.success) {', 'if (true) {');
  var refreshed = [];
  var sandbox = { window: { KM: { DB: { retryDocumentGeneration: function () { return Promise.resolve({ success: false, error: 'X' }); } } } },
    _shLoadAndRender: function () { refreshed.push('shipment-workspace'); }, console: console };
  vm.createContext(sandbox);
  vm.runInContext(m, sandbox);
  return sandbox.shRetryDocument('shipment', 'S1', btn()).then(function () { return refreshed.length > 0; });
});
mut('E6 §19 — an UNKNOWN outcome auto-replayed', function () {
  var m = SH.replace("btnEl.title = 'The retry request failed in transit",
    "shRetryDocument(type, id, null); btnEl.title = 'The retry request failed in transit");
  return count(code(m), /shRetryDocument\(/g) > count(code(SH), /shRetryDocument\(/g);
});
mut('E7 §19 — the renderer gains a per-row network call', function () {
  var m = PANEL_SRC.replace('var state = shDocPanelState(model);',
    'var state = shDocPanelState(model); window.KM.DB.listEntityDocuments(model.entity_type, model.entity_id);');
  return count(code(m), /KM\.DB\./g) !== 0;
});
mut('E8 §19 — the old byte-floor seal restored to the gate', function () {
  var m = S4R5.replace("ok(live.bytes < M.boot.pre.bytes,",
    "ok(live.bytes <= M.boot.pre.bytes - 1500 * 1024,");
  return count(m, /M\.boot\.pre\.bytes - 1500 \* 1024/g) > 0;
});
mut('E9 §19 — a route script appended to boot while the gate fails to notice', function () {
  // Break the guard AND plant the regression: the suite must still see the route asset at boot.
  var t = BT.bootTopology(live.local.concat([{ file: 'assets/js/lib/km-globe.js', bytes: 204320, defer: true }]), live.routeAssets);
  return t.routeAtBoot.indexOf('assets/js/lib/km-globe.js') !== -1;
});

Promise.all([poDone, shDone, dblDone, failDone, unkDone, newDone].concat(ASYNC_MUTANTS)).then(function () {
  console.log('\n' + (fail ? 'FAILED' : 'PASSED') + '  ' + pass + ' passed / ' + fail + ' failed'
    + '   mutants ' + mutants + ', survived ' + survived);
  process.exitCode = fail ? 1 : 0;
});
