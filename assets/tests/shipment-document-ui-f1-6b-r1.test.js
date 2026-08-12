// Kitchen Mama Operation System — F1-6B-PHASE1-E2E-PRE-CLOSURE-R1 Part B
// Shipment Document (Shipping Detail / Packing List) last-mile UI.
// Run: node assets/tests/shipment-document-ui-f1-6b-r1.test.js
// -----------------------------------------------------------------------------
// Proves the compact Generate/Download group on the dispatched-shipment overview card calls the canonical R3C backend
// and stays THIN — executing the real handler against a DOM/KM.DB shim (B1-B5, B8-B11) and source-scanning the card +
// adapter for the negative constraints (only SHIPDETAIL/PL; no Customs; no frontend placeholder/totals/FIFO/master/
// file build; dispatch logic untouched; responsive/no-overflow).
// NOTE: no 'use strict' — extracted functions are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var SH = read('js/pages/shipping-history.js');
var API = read('js/api/operation-system-db-api.js');
var CARD = extractFn(SH, '_shRenderDbCard');

// ---- shims + eval the Part B functions into module scope ------------------------------------------------------
function _shEsc(s) { return String(s == null ? '' : s); }
var SH_DOC_TYPES = { SHIPDETAIL: 'Shipping Detail', PL: 'Packing List' };
var _shDocResultCache = {};
var lastGenPayload = null, genCalls = 0, openCalls = [];
var genResultQueue = [];
var els = {};
function fakeEl() { return { disabled: false, textContent: '', innerHTML: '', style: {} }; }
var document = { getElementById: function (id) { if (!els[id]) els[id] = fakeEl(); return els[id]; } };
var window = { KM: { DB: {
  generateShipmentDocument: function (payload) { genCalls++; lastGenPayload = payload; return Promise.resolve(genResultQueue.length ? genResultQueue.shift() : { success: false, error: 'NO_RESULT' }); },
  openGeneratedDocument: function (res) { openCalls.push(res); return true; }
} } };

eval(extractFn(SH, '_shDocActionsHtml'));
eval(extractFn(SH, '_shDocErrLabel'));
eval(extractFn(SH, 'shGenerateShipmentDoc'));
eval(extractFn(SH, 'shOpenShipmentDoc'));
ok(typeof shGenerateShipmentDoc === 'function' && typeof _shDocActionsHtml === 'function', 'X1 Part B functions eval OK');

// =============================================================================
section('B0 — the action group HTML (only SHIPDETAIL + PL; Generate buttons + status spans)');
(function () {
  var html = _shDocActionsHtml('SH1');
  ok(/Shipping Detail/.test(html) && /Packing List/.test(html), 'B0a both document rows rendered');
  ok(/shGenerateShipmentDoc\('SH1','SHIPDETAIL',this\)/.test(html) && /shGenerateShipmentDoc\('SH1','PL',this\)/.test(html), 'B1/B2 Generate buttons wired for SHIPDETAIL + PL');
  ok(/id="sh-doc-SH1-SHIPDETAIL-status"/.test(html) && /id="sh-doc-SH1-PL-status"/.test(html), 'B4 per-doc status/download slot present');
  ok(!/Customs|Commercial Invoice|Booking|CI\b/i.test(html), 'B13 Customs / CI / Booking are NOT exposed');
  ok(/flex-wrap:wrap/.test(html), 'B12 rows flex-wrap (narrow screens do not overflow)');
})();

// =============================================================================
// async behavioral fixtures (run sequentially, then print the summary)
function run() {
  return Promise.resolve()
    .then(function () {
      section('B3 — Generate sends the thin canonical payload; one backend call');
      genCalls = 0; lastGenPayload = null;
      genResultQueue = [{ success: true, document_id: 'GD1', download_url: 'https://drive/pdf1' }];
      return shGenerateShipmentDoc('SH2', 'SHIPDETAIL', document.getElementById('sh-doc-SH2-SHIPDETAIL-gen')).then(function () {
        eq(lastGenPayload, { shipment_id: 'SH2', document_type: 'SHIPDETAIL', generate_file: true }, 'B3 sends only { shipment_id, document_type, generate_file:true }');
        ok(genCalls === 1, 'B1 exactly one canonical backend call');
      });
    })
    .then(function () {
      section('B4/B5 — success surfaces Download/Open; the result is cached for open');
      genResultQueue = [{ success: true, document_id: 'GD2', pdf_file_url: 'https://drive/pdf2' }];
      var btn = fakeEl();
      return shGenerateShipmentDoc('SH3', 'PL', btn).then(function () {
        var st = document.getElementById('sh-doc-SH3-PL-status');
        ok(/Download \/ Open/.test(st.innerHTML) && /Generated/.test(st.innerHTML), 'B4 success → "Generated · Download/Open" shown');
        ok(btn.textContent === 'Regenerate' && btn.disabled === false, 'B4b button re-enabled + becomes Regenerate');
        openCalls = [];
        shOpenShipmentDoc('SH3', 'PL');
        eq(openCalls, [{ success: true, document_id: 'GD2', pdf_file_url: 'https://drive/pdf2' }], 'B5 Download/Open opens the cached generated-document result');
      });
    })
    .then(function () {
      section('B4c — reused generation shows "Ready" (idempotent reuse-by-key, no duplicate)');
      genResultQueue = [{ success: true, document_id: 'GD1', reused: true, download_url: 'https://drive/pdf1' }];
      return shGenerateShipmentDoc('SH2', 'SHIPDETAIL', fakeEl()).then(function () {
        var st = document.getElementById('sh-doc-SH2-SHIPDETAIL-status');
        ok(/Ready/.test(st.innerHTML), 'B4c reused → "Ready · Download/Open" (no new document)');
      });
    })
    .then(function () {
      section('B6/B7 — blocked readiness + backend error are visible (never faked ready)');
      genResultQueue = [{ success: false, error: 'DOCUMENT_TEMPLATE_ASSET_MISSING' }];
      return shGenerateShipmentDoc('SH4', 'SHIPDETAIL', fakeEl()).then(function () {
        var st = document.getElementById('sh-doc-SH4-SHIPDETAIL-status');
        ok(/Template not configured/.test(st.textContent) && st.style.color === '#DC2626', 'B7 template-missing surfaced (fail-closed, red)');
        eq([_shDocErrLabel('FINAL_OUTPUT_REQUIRED_FIELD_GAP'), _shDocErrLabel('DOCUMENT_TEMPLATE_ASSET_TYPE_UNSUPPORTED')], ['Not ready', 'Template type unsupported'], 'B6 readiness/unsupported labels are truthful');
      });
    })
    .then(function () {
      section('B11 — double-click does NOT create a duplicate document (button guard)');
      genCalls = 0;
      genResultQueue = [{ success: true, document_id: 'GD5', download_url: 'https://drive/pdf5' }];
      var btn = fakeEl();
      var p1 = shGenerateShipmentDoc('SH5', 'PL', btn);   // first call disables the button
      var p2 = shGenerateShipmentDoc('SH5', 'PL', btn);   // second (disabled) must early-return, no 2nd backend call
      return Promise.all([p1, p2]).then(function () {
        ok(genCalls === 1, 'B11 second click short-circuits (one backend call); backend is also idempotent');
      });
    })
    .then(function () {
      // =========================================================================
      section('SOURCE — card gate + no frontend business logic + dispatch untouched');
      ok(/SH_DOC_READY_STATUSES\[status\]\)\s*actionsHtml \+= _shDocActionsHtml\(sid\)/.test(CARD), 'card renders the doc group only for dispatched (SH_DOC_READY_STATUSES) shipments');
      ok(/SH_DOC_READY_STATUSES = \{ in_transit: 1, arrived: 1, received: 1, closed: 1 \}/.test(SH), 'B13 doc group gated to post-dispatch statuses (snapshot exists); never on draft/ready_to_ship');
      var handler = extractFn(SH, 'shGenerateShipmentDoc');
      ok(!/units_per_carton|carton|cbm|totalQty|placeholder|template_file|FIFO|allocation|forEach.*line|reduce\(/i.test(handler), 'B8/B9/B10 handler does NO totals / placeholder mapping / template / FIFO / file build');
      ok(/generate_file: true/.test(handler) && /generateShipmentDocument/.test(handler), 'B3 handler only forwards the thin payload to the canonical backend');
      ok(/confirmShipmentAndDispatch/.test(SH), 'B14 the dispatch action (confirmShipmentAndDispatch) is still present + untouched by this change');
      // adapter contract (R3C, reused not modified for behavior)
      ok(/action: 'shipmentDocument\.generate'/.test(API) && /window\.KM\.DB\.generateShipmentDocument/.test(API), 'adapter posts the canonical shipmentDocument.generate action');
      ok(/window\.KM\.DB\.openGeneratedDocument/.test(API) && /download_url \|\| res\.pdf_file_url \|\| res\.file_url/.test(API), 'open contract reads download_url (PDF preferred)');
    })
    .then(function () {
      console.log('\n----------------------------------------');
      console.log('SHIPMENT DOCUMENT UI (F1-6B Part B): ' + pass + ' passed, ' + fail + ' failed');
      if (fail > 0) process.exitCode = 1;
    });
}
run();
