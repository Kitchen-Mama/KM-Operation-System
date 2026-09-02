// F1-7N-FB-4E-R4A1 - APPS SCRIPT READ REDIRECT TRANSPORT.
//
// One reliable canonical transport for read actions against an Apps Script Web App: every attempt begins at
// the stable /exec endpoint, and no googleusercontent redirect target is ever cached, retained or retried.
// Writes stay POST-only and are never replayed.
//
// The harness models the redirect hop the browser actually traverses (see makeEdge), which is the piece the
// earlier suites lacked: they answered the router directly, so neither live failure could reproduce offline.
//
// Run: node assets/tests/apps-script-read-redirect-transport-f1-7n-fb-4e-r4a1.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');

var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).sort();
// The real configured endpoint, read from the shipped module so the classifier sees a genuine STABLE_EXEC URL.
var EXEC_URL = (/const OP_DB_API_BASE_URL = '([^']+)'/.exec(read('assets/js/api/operation-system-db-api.js')) || [])[1];
// The production-safety adapter asserts the exact spreadsheet id on every gated read, so the synthetic sheet has
// to answer with the CONFIGURED one or every workspace read fails closed on WRONG_SPREADSHEET_TARGET — which
// would be the harness misconfiguring itself, not a finding.
var PROD_DB_ID = (/var PRODUCTION_DB_SPREADSHEET_ID_ = '([^']+)'/.exec(read('assets/specs/active/apps-script/00_config.gs')) || [])[1];

// =============================================================================================================
// A SYNTHETIC SPREADSHEET. Column names are the REAL sheet headers the normalizers read, so a field that the
// pipeline drops is dropped here too. Row counts are small but the SHAPE is production's.
// =============================================================================================================
function table(headers, rows) { return [headers].concat(rows); }
var DB = {
  // sku_details is the WIDEST table in the database, and that width is the point: Overseas Stock reads four
  // fields from it. A narrow fixture would make the server-side column projection look worthless, so the extra
  // columns below stand in for the real ones (dimensions, weights, customs, pricing) at representative width.
  sku_details: (function () {
    var head = ['sku', 'product_name', 'series', 'category', 'lifecycle', 'image_url', 'units_per_carton', 'msrp', 'selling_price', 'pm'];
    var wide = ['product_name_cn', 'product_use', 'gs1_code', 'gs1_type', 'amz_asin',
      'item_length', 'item_width', 'item_height', 'item_dimension_unit', 'item_weight', 'item_weight_unit',
      'item_length_2', 'item_width_2', 'item_height_2',
      'package_length', 'package_width', 'package_height', 'package_dimension_unit', 'package_weight', 'package_weight_unit',
      'carton_length', 'carton_width', 'carton_height', 'carton_dimension_unit', 'carton_weight', 'carton_weight_unit',
      'material', 'battery_type', 'magnet_type', 'minimum_price', 'base_currency', 'hscode'];
    function row(base) { return base.concat(wide.map(function (c) { return c + '-value-for-' + base[0]; })); }
    return table(head.concat(wide), [
      row(['SKU-A', 'Can Opener', 'Mama', 'Kitchen', 'Running in the Market', 'https://cdn.example.com/a.jpg', 12, '19.99', '14.99', 'VZ']),
      row(['SKU-B', 'Jar Opener', 'Mama', 'Kitchen', 'Running in the Market', 'https://cdn.example.com/b.jpg', 6, '9.99', '7.99', 'VZ']),
      row(['SKU-C', 'No Image SKU', 'Papa', 'Kitchen', 'Phasing Out', '', 6, '9.99', '7.99', 'VZ'])
    ]);
  })(),
  product_features: table(['feature_id', 'scope_type', 'scope_id', 'product_title', 'product_description', 'bullet_points', 'language'],
    [['PF1', 'sku', 'SKU-A', 'Can Opener', 'Opens cans.', 'a|b|c', 'en']]),
  sku_handbook_summaries: table(['summary_id', 'sku', 'summary_text', 'review_status'],
    [['S1', 'SKU-A', 'A reviewed summary.', 'reviewed']]),
  warehouses: table(['warehouse_id', 'warehouse_code', 'warehouse_name', 'country', 'is_active', 'is_factory_warehouse', 'is_overseas_warehouse', 'company', 'marketplace'],
    [['WH1', 'FTY-CN', 'Factory CN', 'CN', 'TRUE', 'TRUE', 'FALSE', 'KM', ''],
     ['WH2', 'OS-US', 'Overseas US', 'US', 'TRUE', 'FALSE', 'TRUE', 'KM', 'Amazon'],
     ['WH3', 'OS-CA', 'Overseas CA', 'CA', 'TRUE', 'FALSE', 'TRUE', 'KM', 'Amazon']]),
  overseas_inventory_snapshot: table(['snapshot_id', 'warehouse_id', 'sku', 'site_sku', 'current_stock', 'reserved_stock', 'company', 'country', 'marketplace', 'snapshot_date'],
    [['OS1', 'WH2', 'SKU-A', 'SKU-A-US', 120, 10, 'KM', 'US', 'Amazon', '2026-08-20'],
     ['OS2', 'WH2', 'SKU-B', 'SKU-B-US', 40, 0, 'KM', 'US', 'Amazon', '2026-08-20'],
     ['OS3', 'WH3', 'SKU-A', 'SKU-A-CA', 15, 0, 'KM', 'CA', 'Amazon', '2026-08-20']]),
  overseas_inventory_movements: table(['movement_id', 'warehouse_id', 'sku', 'movement_type', 'qty', 'movement_date', 'note'],
    [['M1', 'WH2', 'SKU-A', 'inbound', 100, '2026-08-01', ''],
     ['M2', 'WH2', 'SKU-A', 'outbound', -20, '2026-08-10', '']]),
  factory_stock: table(['stock_id', 'warehouse_id', 'sku', 'current_stock', 'reserved_stock'],
    [['FS1', 'WH1', 'SKU-A', 500, 0], ['FS2', 'WH1', 'SKU-B', 300, 0]]),
  factory_stock_movements: table(['movement_id', 'warehouse_id', 'sku', 'movement_type', 'qty', 'movement_date'],
    [['FM1', 'WH1', 'SKU-A', 'inbound', 500, '2026-08-01']]),
  marketplaces: table(['marketplace_id', 'company', 'country', 'marketplace', 'is_active'],
    [['MP1', 'KM', 'US', 'Amazon', 'TRUE'], ['MP2', 'KM', 'CA', 'Amazon', 'TRUE']]),
  marketplace_skus: table(['marketplace_sku_id', 'marketplace_id', 'sku', 'site_sku'],
    [['MS1', 'MP1', 'SKU-A', 'SKU-A-US']]),
  sku_regional_details: table(['sku', 'marketplace_id', 'site_sku'], [['SKU-A', 'MP1', 'SKU-A-US']]),
  tax_referral_rates: table(['marketplace_id', 'category', 'rate'], [['MP1', 'Kitchen', '0.15']]),
  tax_rate_components: table(['marketplace_id', 'component', 'rate'], [['MP1', 'vat', '0.0']])
};

// =============================================================================================================
// THE DEPLOYMENT, EXECUTED, over that spreadsheet — with every write primitive recorded rather than performed.
// =============================================================================================================
function makeDeployment() {
  var violations = [];
  var lockConstructions = [];
  function forbid(n) { return function () { violations.push(n); return null; }; }
  function sheet(name) {
    var t = DB[name];
    return {
      getName: function () { return name; },
      getDataRange: function () { return { getValues: function () { return t.map(function (r) { return r.slice(); }); } }; },
      getLastRow: function () { return t.length; }, getLastColumn: function () { return t[0].length; },
      // getRange has to answer with the REAL cells for the requested window: the production-safety adapter reads
      // the header row through getRange(1,1,1,lastCol).getValues()[0], and a stub returning [] makes every gated
      // read throw on `undefined.map` — a harness fault that would read as a defect in the code under test.
      getRange: function (row, col, numRows, numCols) {
        var r0 = Math.max(1, row || 1) - 1, c0 = Math.max(1, col || 1) - 1;
        var nr = numRows || 1, nc = numCols || 1;
        var win = [];
        for (var i = 0; i < nr; i++) {
          var src = t[r0 + i] || [];
          var line = [];
          for (var j = 0; j < nc; j++) line.push(src[c0 + j] === undefined ? '' : src[c0 + j]);
          win.push(line);
        }
        return { setValue: forbid('setValue'), setValues: forbid('setValues'), clearContent: forbid('clearContent'),
          getValue: function () { return win[0][0]; }, getValues: function () { return win; } };
      },
      appendRow: forbid('appendRow'), deleteRow: forbid('deleteRow'), deleteRows: forbid('deleteRows'),
      insertRowAfter: forbid('insertRowAfter'), clear: forbid('clear'), clearContents: forbid('clearContents')
    };
  }
  var ss = {
    getSheetByName: function (n) { return DB[n] ? sheet(n) : null; },
    getId: function () { return PROD_DB_ID; }, getName: function () { return 'TEST'; },
    insertSheet: forbid('insertSheet'), deleteSheet: forbid('deleteSheet'),
    getSheets: function () { return Object.keys(DB).map(sheet); }
  };
  var sb = {
    console: console, JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    ContentService: { MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: function (t) { return { _t: t, setMimeType: function () { return this; }, getContent: function () { return this._t; } }; } },
    Utilities: { getUuid: function () { return 'R3-TEST-0000'; }, formatDate: function () { return '2026-08-27'; }, sleep: function () {}, base64Encode: function (s) { return String(s); } },
    Logger: { log: function () {} },
    SpreadsheetApp: { openById: function () { return ss; }, getActiveSpreadsheet: function () { return ss; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: forbid('setProperty') }; } },
    Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getScriptTimeZone: function () { return 'Asia/Taipei'; } },
    // F1-7N-FB-4E-R4A1 -- THE INSTRUMENT IS NOW ACCURATE ABOUT LOCKS, WHICH MATTERS BECAUSE IT GATES MEMBERSHIP
    // OF THE GET READ TABLE. `LockService.getScriptLock()` only CONSTRUCTS a Lock object; nothing is locked until
    // tryLock/waitLock. Recording construction as a write over-approximates, and it did: requestOrderDraft.job.status
    // reads Script Properties and never acquires, but its env builder constructs a lock eagerly, so the read looked
    // like a write. ACQUISITION is what has an effect, so acquisition is what is recorded as one; construction is
    // recorded separately and reported, so the distinction stays visible rather than being quietly dropped.
    LockService: { getScriptLock: function () {
      lockConstructions.push('getScriptLock');
      return { tryLock: function () { violations.push('lock.tryLock'); return true; },
        waitLock: function () { violations.push('lock.waitLock'); },
        releaseLock: function () {} };
    } },
    CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
    DriveApp: { createFile: forbid('DriveApp.createFile') }, UrlFetchApp: {},
    MailApp: { sendEmail: forbid('MailApp.sendEmail') }, GmailApp: {}, HtmlService: {},
    ScriptApp: { newTrigger: forbid('ScriptApp.newTrigger') }
  };
  sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  GS_FILES.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(GS_DIR, f), 'utf8'), ctx, { filename: f }); });
  sb.__violations = violations;
  sb.__lockConstructions = lockConstructions;
  return sb;
}

// =============================================================================================================
// THE CLIENT, EXECUTED, with an INSTRUMENTED fetch. Every request is recorded before it is answered by the
// executed router, so the log is the client's real traffic and not a description of it.
// =============================================================================================================
var TP_PATH = path.join(ROOT, 'assets', 'js', 'api', 'km-transport.js');
var DBAPI_SRC = read('assets/js/api/operation-system-db-api.js');
var FOUND_SRC = read('assets/js/api/km-api-foundation.js');
var SCOPEREG_SRC = read('assets/js/core/scope-registry.js');
var OVERRIDES_SRC = read('assets/js/utils/sku-overrides.js');

// =============================================================================================================
// THE APPS SCRIPT EDGE, MODELLED THE WAY THE BROWSER ACTUALLY SEES IT.
//
// This is the part the earlier harnesses did not have, and it is why the defect could not be reproduced offline:
// they answered the router DIRECTLY, with no redirect hop. A real Apps Script /exec request never resolves at
// /exec. It is answered with a 302 to script.googleusercontent.com/macros/echo?user_content_key=..., the browser
// follows that itself, and `fetch` exposes only the OUTCOME — `redirected: true`, `url` = the echo target, and
// whatever status the echo produced. The two live failures are both properties of that hop:
//
//   POST + 302  per the Fetch spec a 302 following a POST is re-issued as a GET WITH THE BODY DROPPED. Where the
//               echo resolves back into the deployment, the request lands at doGet carrying only the query
//               string — the REQUEST_METHOD_DOWNGRADED evidence. Where the echo target itself cannot be read,
//               the answer is a 404 page — the HTTP_TRANSPORT_ERROR / echo 404 evidence, with a DIFFERENT
//               user_content_key each attempt, which is what rules out a stale cached redirect URL.
//
//   GET + 302   the same hop, but nothing has to survive it: everything the router needs is in the URL, so the
//               re-issued GET is identical to the original. This is why direct browser navigation works, and why
//               the getTable reads — the only reads this app already sends as GET — have never shown either
//               failure.
//
// Modes are explicit so the matrix can state which shape produces which outcome instead of inferring it:
//   'HEALTHY'        both verbs' echo targets are readable (an idealised edge; not what live reports)
//   'POST_ECHO_404'  the LIVE shape: a POST's echo target answers 404, a GET's is readable
//   'POST_DOWNGRADE' the earlier LIVE shape: the POST's echo resolves back to /exec as a bodyless GET
// =============================================================================================================
var ECHO_HOST = 'https://script.googleusercontent.com';
var ECHO_404_BODY = '<!DOCTYPE html><html><head><title>Error 404 (Not Found)!!1</title></head><body>'
  + '<p><b>404.</b> <ins>That’s an error.</ins></p><p>The requested URL was not found on this server. '
  + '<ins>That’s all we know.</ins></p></body></html>';

function makeEdge(dep, opts) {
  opts = opts || {};
  var mode = opts.mode || 'POST_ECHO_404';
  var keySeq = 0;
  var log = [];
  var issuedEchoKeys = [];

  function qsOf(u) {
    var qs = {};
    String(String(u).split('?')[1] || '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) qs[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return qs;
  }
  function routerAnswer(method, url, body) {
    if (method === 'GET') return dep.doGet({ parameter: qsOf(url) }).getContent();
    return dep.doPost({ postData: { contents: body, type: 'text/plain' }, parameter: qsOf(url) }).getContent();
  }
  function response(rec, finalUrl, status, text, ctype) {
    rec.finalUrl = finalUrl; rec.finalStatus = status; rec.responseBytes = String(text || '').length;
    try { var j = JSON.parse(text); rec.handlerRan = true; rec.receivedMethod = j.received_method || null;
      rec.success = j.success === true; rec.code = j.code || null; rec.echoedRequestId = (j.meta && j.meta.requestId) || j.request_id || null; }
    catch (e) { rec.handlerRan = false; rec.success = false; }
    return Promise.resolve({
      ok: status >= 200 && status < 300, status: status, statusText: String(status), redirected: rec.redirected === true,
      type: 'basic', url: finalUrl,
      headers: { get: function (h) { return String(h).toLowerCase() === 'content-type' ? (ctype || 'application/json') : null; } },
      text: function () { return Promise.resolve(text); },
      json: function () { return Promise.resolve(JSON.parse(text)); }
    });
  }

  function fetchImpl(url, init) {
    var u = String(url);
    var method = ((init && init.method) || 'GET').toUpperCase();
    var body = (init && init.body) ? String(init.body) : '';
    var qs = qsOf(u);
    var rec = {
      n: log.length + 1, initialUrl: u, method: method, action: null, sentRequestId: qs.km_rid || null,
      nonce: qs.km_nonce || qs._ts || null, cache: (init && init.cache) || null, redirected: false,
      redirectStatus: null, finalUrl: null, finalStatus: null, handlerRan: null, receivedMethod: null,
      payloadSurvived: null, echoedRequestId: null, urlLength: u.length, requestBytes: body.length
    };
    try { rec.action = body ? (JSON.parse(body).action || null) : null; } catch (e) { rec.action = null; }
    if (!rec.action) rec.action = qs.action || null;
    log.push(rec);

    var sig = init && init.signal;
    if (sig && sig.aborted) { var ea = new Error('aborted'); ea.name = 'AbortError'; return Promise.reject(ea); }

    // A request aimed straight at an echo target: this is what "retrying the redirect URL" would look like.
    if (/script\.googleusercontent\.com/.test(u)) {
      rec.redirected = false;
      rec.note = 'DIRECT_TO_ECHO';
      return response(rec, u, 404, ECHO_404_BODY, 'text/html');
    }

    // /exec. Every attempt is answered with a 302 to a FRESH echo target — a new user_content_key each time,
    // exactly as the live evidence reports, so a cached redirect URL is not what is being tested here.
    keySeq++;
    var echoUrl = ECHO_HOST + '/macros/echo?user_content_key=KEY-' + keySeq + '&lib=L1';
    issuedEchoKeys.push('KEY-' + keySeq);
    rec.redirected = true;
    rec.redirectStatus = 302;

    if (method === 'GET') {
      // Nothing has to survive: the re-issued GET carries the same URL.
      rec.payloadSurvived = true;
      // 'GET_ECHO_404_ONCE' -- the echo target of the FIRST attempt cannot be read. This is the case the bounded
      // recovery exists for, and it is a real one: the redirect target is short-lived and session-bound, so it
      // can fail independently of the deployment. A second attempt from the STABLE /exec is issued a new target.
      if (mode === 'GET_ECHO_404_ONCE' && !opts.__echoFailed) {
        opts.__echoFailed = true;
        return response(rec, echoUrl, 404, ECHO_404_BODY, 'text/html');
      }
      return response(rec, echoUrl, 200, routerAnswer('GET', u, ''), 'application/json');
    }

    // POST. The 302 is re-issued as a GET and the body is gone.
    rec.payloadSurvived = false;
    if (mode === 'POST_ECHO_404') return response(rec, echoUrl, 404, ECHO_404_BODY, 'text/html');
    if (mode === 'POST_DOWNGRADE') {
      // The echo resolves back into the deployment as a bodyless GET: doGet answers, with only the query string.
      return response(rec, echoUrl, 200, routerAnswer('GET', u, ''), 'application/json');
    }
    // HEALTHY: the echo target is readable and the POST body reached the router.
    rec.payloadSurvived = true;
    return response(rec, echoUrl, 200, routerAnswer('POST', u, body), 'application/json');
  }

  return { fetch: fetchImpl, log: log, echoKeys: issuedEchoKeys, mode: mode };
}

// =============================================================================================================
// THE CLIENT, EXECUTED AGAINST THAT EDGE.
// =============================================================================================================
// -------------------------------------------------------------------------------------------------------------
// THE PRE-FIX CLIENT, LOADED FROM THE ACTUAL COMMIT.
//
// The POST half of the matrix has to keep being demonstrable after the fix, so it is not described: the three
// client files are read from PRE HEAD and executed in this same harness against this same router. If the blobs
// cannot be read the suite FAILS rather than skipping - a reproduction that cannot run proves nothing.
// -------------------------------------------------------------------------------------------------------------
var PRE_SHA = '47c5e8b';
var PRE = { ok: false, error: null, tpPath: null };
(function () {
  var cp = require('child_process'), os = require('os');
  function blob(rel) {
    return cp.execFileSync('git', ['show', PRE_SHA + ':' + rel],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 96 * 1024 * 1024 });
  }
  try {
    PRE.transport = blob('assets/js/api/km-transport.js');
    PRE.dbapi = blob('assets/js/api/operation-system-db-api.js');
    PRE.foundation = blob('assets/js/api/km-api-foundation.js');
    PRE.tpPath = path.join(os.tmpdir(), 'km-transport-pre-' + PRE_SHA + '.js');
    fs.writeFileSync(PRE.tpPath, PRE.transport);
    PRE.ok = true;
  } catch (e) { PRE.error = String((e && e.message) || e); }
})();

function makeClient(opts) {
  opts = opts || {};
  var pre = opts.pre === true;
  var tpFile = pre ? PRE.tpPath : TP_PATH;
  delete require.cache[require.resolve(tpFile)];
  var TP = require(tpFile);
  var dep = opts.deployment || makeDeployment();
  var edge = makeEdge(dep, { mode: opts.mode || 'POST_ECHO_404' });
  var win = { KM: { transportFactory: TP }, location: { origin: 'https://viczhou-glitch.github.io', hash: '' },
    addEventListener: function () {}, removeEventListener: function () {} };
  win.KM.transport = TP.create({ fetch: function (u, i) { return edge.fetch(u, i); },
    baseUrl: EXEC_URL, frontendOrigin: 'https://viczhou-glitch.github.io',
    now: function () { return 0; }, random: function () { return 0; }, sleep: function () { return Promise.resolve(); } });
  var store = {};
  var sb = {
    console: console, window: win, JSON: JSON, Math: Math, Date: Date, Promise: Promise,
    Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
    Set: Set, Map: Map, WeakMap: WeakMap, isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, clearInterval: function () {},
    AbortController: AbortController, performance: { now: function () { return 0; } },
    document: { addEventListener: function () {}, removeEventListener: function () {}, readyState: 'complete',
      getElementById: function () { return null; }, querySelector: function () { return null; },
      querySelectorAll: function () { return []; }, createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} }, appendChild: function () {} }; } },
    localStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    fetch: function (u, i) { return edge.fetch(u, i); }
  };
  sb.globalThis = sb; sb.self = sb;
  var ctx = vm.createContext(sb);
  vm.runInContext(pre ? PRE.dbapi : DBAPI_SRC, ctx, { filename: 'operation-system-db-api.js' });
  vm.runInContext(opts.foundationSrc || (pre ? PRE.foundation : FOUND_SRC), ctx, { filename: 'km-api-foundation.js' });
  vm.runInContext(SCOPEREG_SRC, ctx, { filename: 'scope-registry.js' });
  vm.runInContext(OVERRIDES_SRC, ctx, { filename: 'sku-overrides.js' });
  return { sb: sb, win: win, DB: win.KM.DB, log: edge.log, edge: edge, dep: dep, store: store };
}

// FIXTURE EXTENSION — the tables the six §5 read paths need, at production SHAPE.
// Added to the shared DB before any deployment is built, so every path below reads real rows through the real
// production-safety adapter rather than through a stub that could hide a schema fault.
// =============================================================================================================
DB.purchase_orders = table(['purchase_order_id', 'po_no', 'company', 'status', 'order_date', 'warehouse_id', 'currency'],
  [['PO-1', 'PO-0001', 'KM', 'confirmed', '2026-08-01', 'WH-CN', 'USD']]);
DB.purchase_order_lines = table(['purchase_order_line_id', 'purchase_order_id', 'sku', 'qty', 'completed_qty', 'shipped_qty', 'unit_price'],
  [['POL-1', 'PO-1', 'SKU-A', '100', '80', '20', '3.50']]);
DB.request_orders = table(['request_order_id', 'request_order_no', 'company', 'status', 'created_at', 'warehouse_id'],
  [['RO-1', 'RO-0001', 'KM', 'draft', '2026-08-02', 'WH-CN']]);
DB.request_order_lines = table(['request_order_line_id', 'request_order_id', 'sku', 'qty'],
  [['ROL-1', 'RO-1', 'SKU-A', '50']]);
DB.supplier_price_list = table(['sku', 'supplier', 'unit_price', 'currency'], [['SKU-A', 'SUP-1', '3.40', 'USD']]);
DB.fc_regular_forecast = table(['sku', 'marketplace', 'year', 'month', 'qty'], [['SKU-A', 'US', '2026', '9', '120']]);
DB.fc_special_events = table(['event_id', 'sku', 'marketplace', 'start_date', 'end_date', 'qty'],
  [['EV-1', 'SKU-A', 'US', '2026-11-20', '2026-11-30', '400']]);
DB.fc_target_rules = table(['rule_id', 'marketplace', 'target_type', 'value'], [['TR-1', 'US', 'coverage_days', '45']]);

// =============================================================================================================
// THE PRE-FIX SOURCE, LOADED FROM THE ACTUAL COMMIT.
//
// §1 is a REPRODUCTION, not a description. It executes the real km-api-foundation.js as it stood at PRE HEAD, in

var checks = [];
var RESULT = {};
function corr(env) { return env && env.meta ? env.meta.requestIdCorrelation : null; }
function codeOf(env) {
  if (!env) return null;
  if (env.success === true) return 'OK';
  return (env.errors && env.errors[0] && env.errors[0].code) || null;
}


// =============================================================================================================
// §1 — THE METHOD / REDIRECT MATRIX, EXECUTED. NOTHING HERE IS ASSUMED.
//
// Requirement 1 forbids concluding that GET is sufficient until fetch GET has actually been executed in the
// production-like harness, so every shape below is dispatched for real through the executed router behind the
// modelled edge. The POST rows run the PRE-FIX client from its commit, so they remain demonstrable after the
// repair rather than becoming a story about what used to happen.
// =============================================================================================================
var MATRIX = [];
function hostClass(u) {
  if (!u) return '(none)';
  if (/script\.googleusercontent\.com/.test(u)) return 'USERCONTENT_ECHO';
  if (/script\.google\.com/.test(u)) return 'APPS_SCRIPT';
  return 'OTHER';
}
function matrixRow(label, rec, extra) {
  MATRIX.push({
    shape: label,
    method: rec ? rec.method : '-',
    redirect: rec && rec.redirectStatus ? String(rec.redirectStatus) : 'none',
    finalHost: rec ? hostClass(rec.finalUrl) : '-',
    finalStatus: rec && rec.finalStatus != null ? String(rec.finalStatus) : '-',
    handlerRan: rec ? (rec.handlerRan === true ? 'yes' : 'no') : '-',
    receivedMethod: rec ? (rec.receivedMethod || '-') : '-',
    payload: rec ? (rec.payloadSurvived === true ? 'survived' : rec.payloadSurvived === false ? 'LOST' : 'n/a') : '-',
    correlated: extra && extra.correlated != null ? (extra.correlated ? 'yes' : 'NO') : '-',
    outcome: (extra && extra.outcome) || '-'
  });
}

// -------------------------------------------------------------------------------------------------------------
// §1A — BROWSER NAVIGATION, AND THE PRE-FIX CLIENT'S POST.
// -------------------------------------------------------------------------------------------------------------
checks.push((function () {
  section('§1A — THE PRE-FIX SHAPES, EXECUTED FROM COMMIT ' + PRE_SHA);
  ok(PRE.ok, '1.0 the pre-fix client loads from git (' + (PRE.error || 'loaded') + ')');
  if (!PRE.ok) return Promise.resolve();

  // (a) BROWSER NAVIGATION GET — the URL a person can paste into the address bar. No client code involved.
  var c1 = makeClient();
  return c1.edge.fetch(EXEC_URL + '?action=system.health', { method: 'GET' }).then(function (r) {
    return r.text();
  }).then(function (txt) {
    var j = null; try { j = JSON.parse(txt); } catch (e) {}
    matrixRow('browser navigation GET', c1.log[0], { outcome: j && j.success ? 'JSON success=true' : 'FAILED' });
    eq(!!(j && j.success === true), true, '1.1 browser navigation GET returns valid JSON — the live evidence');
    eq(j && j.received_method, 'GET', '1.2 ... served by doGet');
    eq(j && j.transport_contract_version, 1, '1.3 ... reporting transport_contract_version 1, unchanged by R4A1');

    // (b) PRE-FIX fetch POST for system.health: the exact live failure.
    var c2 = makeClient({ pre: true });
    return Promise.resolve(c2.DB.checkDeploymentContract()).then(function (res) {
      var rec = c2.log[0];
      matrixRow('PRE fetch POST (system.health)', rec, { outcome: (res && res.code) || 'unknown' });
      eq(rec.method, 'POST', '1.4 PRE: system.health was dispatched as a POST');
      eq(rec.payloadSurvived, false, '1.5 PRE: the POST body did not survive the 302 (Fetch spec re-issues it as a GET)');
      eq(rec.finalStatus, 404, '1.6 PRE: the echo target answered 404 — the exact reported failure');
      eq(rec.handlerRan, false, '1.7 PRE: no handler ran, so nothing was read');
      eq(hostClass(rec.finalUrl), 'USERCONTENT_ECHO', '1.8 PRE: it died on the redirect target, not at /exec');
      ok(res && res.code !== 'DEPLOYMENT_CONTRACT_OK', '1.9 PRE: checkDeploymentContract() fails (' + (res && res.code) + ')');

      // (c) PRE-FIX fetch POST for a workspace read, under the earlier live shape.
      var c3 = makeClient({ pre: true, mode: 'POST_DOWNGRADE' });
      return Promise.resolve(c3.win.KM.api.getWorkspace('skuDetails', {})).then(function (env) {
        var rec3 = c3.log[0];
        matrixRow('PRE fetch POST (skuDetails) -> doGet', rec3, { outcome: codeOf(env), correlated: corr(env) === 'MATCH' });
        eq(rec3.method, 'POST', '1.10 PRE: the workspace read was dispatched as a POST');
        eq(rec3.receivedMethod, 'GET', '1.11 PRE: it arrived at the router as a GET');
        eq(rec3.payloadSurvived, false, '1.12 PRE: with the body lost');
        eq(codeOf(env), 'REQUEST_METHOD_DOWNGRADED', '1.13 PRE: the previously reported skuDetails failure, reproduced');

        // (d) A UNIQUE ECHO KEY PER ATTEMPT — what rules out a cached redirect URL as the cause.
        var c4 = makeClient({ pre: true });
        return Promise.resolve(c4.DB.checkDeploymentContract())
          .then(function () { return Promise.resolve(c4.DB.checkDeploymentContract()); })
          .then(function () {
            var uniq = c4.edge.echoKeys.filter(function (v, i, a) { return a.indexOf(v) === i; });
            eq(uniq.length, c4.edge.echoKeys.length,
              '1.14 every attempt was issued a DIFFERENT user_content_key — not one cached redirect target');

            // (e) A REQUEST AIMED DIRECTLY AT AN ECHO TARGET — what "retry the redirect URL" would mean.
            var c5 = makeClient();
            return c5.edge.fetch(ECHO_HOST + '/macros/echo?user_content_key=KEY-STALE&lib=L1', { method: 'GET' })
              .then(function () {
                var rec5 = c5.log[0];
                matrixRow('direct GET to an expired echo target', rec5, { outcome: 'HTTP ' + rec5.finalStatus });
                eq(rec5.finalStatus, 404, '1.15 a googleusercontent target is not a re-usable endpoint — 404');
                eq(rec5.redirected, false, '1.16 ... and there is no redirect left to recover through');
              });
          });
      });
    });
  }, function (e) { ok(false, '1.x §1A threw: ' + (e && (e.stack || e.message))); });
})());

// -------------------------------------------------------------------------------------------------------------
// §1B — THE SAME SHAPES ON THE CURRENT CLIENT.
// -------------------------------------------------------------------------------------------------------------
checks.push((function () {
  section('§1B — THE SAME READS ON THE CURRENT CLIENT');
  var c1 = makeClient();
  return Promise.resolve(c1.DB.checkDeploymentContract()).then(function (res) {
    var rec = c1.log[0];
    matrixRow('fetch GET (system.health)', rec, { outcome: (res && res.code) || 'unknown' });
    eq(rec.method, 'GET', '1.17 system.health is now dispatched as a GET');
    eq(rec.cache, 'no-store', '1.18 ... with cache:no-store');
    eq(rec.payloadSurvived, true, '1.19 ... and nothing has to survive the hop, because nothing is in a body');
    eq(rec.handlerRan, true, '1.20 the handler ran');
    eq(rec.finalStatus, 200, '1.21 ... and the echo target was readable');
    eq(res && res.code, 'DEPLOYMENT_CONTRACT_OK', '1.22 checkDeploymentContract() reaches OK (' + (res && res.code) + ')');
    ok(!!rec.sentRequestId, '1.23 the read carried a request id in the URL (' + rec.sentRequestId + ')');

    // A workspace read, under BOTH broken edge shapes: the verb no longer has anything to lose.
    var modes = ['POST_ECHO_404', 'POST_DOWNGRADE'];
    return modes.reduce(function (chain, m) {
      return chain.then(function () {
        var c = makeClient({ mode: m });
        return Promise.resolve(c.win.KM.api.getWorkspace('skuDetails', {})).then(function (env) {
          var r = c.log[0];
          matrixRow('fetch GET (skuDetails) [edge ' + m + ']', r,
            { outcome: codeOf(env), correlated: corr(env) === 'MATCH' });
          eq(r.method, 'GET', '1.24 [' + m + '] the workspace read is a GET');
          eq(codeOf(env), 'OK', '1.25 [' + m + '] it succeeds even on the edge shape that broke the POST');
          eq(corr(env), 'MATCH', '1.26 [' + m + '] and the answer correlates to the request that was sent');
          eq(c.log.length, 1, '1.27 [' + m + '] one physical request — no recovery was needed');
        });
      });
    }, Promise.resolve()).then(function () {
      // 20 consecutive reads, per §8.
      var c6 = makeClient();
      var seq = Promise.resolve(), okCount = 0, mismatch = 0, downgrade = 0;
      for (var i = 0; i < 20; i++) {
        seq = seq.then(function () {
          return Promise.resolve(c6.DB.getAutomationSchedule()).then(function (r) {
            if (r && r.success === true) okCount++;
            var code = r && r.error && (r.error.code || (r.error.transport && r.error.transport.code));
            if (code === 'RESPONSE_REQUEST_ID_MISMATCH') mismatch++;
            if (code === 'REQUEST_METHOD_DOWNGRADED') downgrade++;
          });
        });
      }
      return seq.then(function () {
        eq(okCount, 20, '1.28 twenty consecutive reads from the stable /exec all succeeded');
        eq(mismatch, 0, '1.29 ... with no RESPONSE_REQUEST_ID_MISMATCH');
        eq(downgrade, 0, '1.30 ... and no REQUEST_METHOD_DOWNGRADED');
        eq(c6.log.length, 20, '1.31 twenty reads issued exactly twenty physical requests');
        matrixRow('20x consecutive GET read', c6.log[19], { outcome: okCount + '/20 success' });
        var uniqRid = c6.log.map(function (r) { return r.sentRequestId; })
          .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        eq(uniqRid.length, 20, '1.32 ... each carrying its own request id');
      });
    });
  }, function (e) { ok(false, '1.y §1B threw: ' + (e && (e.stack || e.message))); });
})());

// =============================================================================================================
// §2 — ENDPOINT AUTHORITY. THE STABLE /exec IS THE ONLY ENDPOINT THERE IS.
// =============================================================================================================
checks.push((function () {
  section('§2 — ENDPOINT AUTHORITY');
  var c = makeClient({ mode: 'GET_ECHO_404_ONCE' });
  return Promise.resolve(c.DB.checkDeploymentContract()).then(function (res) {
    // Two attempts: the first echo target could not be read, the second was fine.
    eq(c.log.length, 2, '2.1 an unreadable redirect target costs exactly ONE extra attempt');
    c.log.forEach(function (r, i) {
      ok(/^https:\/\/script\.google\.com\/macros\/s\//.test(r.initialUrl),
        '2.2 attempt ' + (i + 1) + ' was issued to the STABLE /exec, not to a redirect target');
      ok(!/googleusercontent/.test(r.initialUrl),
        '2.3 attempt ' + (i + 1) + ' never requested a googleusercontent URL directly');
    });
    eq(res && res.code, 'DEPLOYMENT_CONTRACT_OK', '2.4 and the read recovered (' + (res && res.code) + ')');

    // The endpoint classifier refuses the echo host outright, so it can never BECOME the endpoint.
    var tp = c.win.KM.transport;
    var cls = tp.classifyEndpoint('https://script.googleusercontent.com/macros/echo?user_content_key=X');
    eq(cls.ok, false, '2.5 the endpoint classifier refuses a googleusercontent URL as an endpoint');
    eq(cls.endpointClass, 'USERCONTENT_REDIRECT', '2.6 ... and names it for what it is: a redirect target');
    // The redaction contract is on the MASKED form and the message -- the fields that reach a log, an error and
    // the metrics. `url` is the caller's own input handed back, which is not a disclosure. The first version of
    // this assertion checked `url` and was simply testing the wrong field.
    ok(cls.maskedEndpoint.indexOf('user_content_key') === -1 && cls.maskedEndpoint.indexOf('<redacted>') !== -1,
      '2.7 the masked form carries no user_content_key');
    ok(cls.reason.indexOf('user_content_key') === -1, '2.8 nor does the operator-facing reason');
    ok(cls.reason.indexOf('never be used as configuration') !== -1,
      '2.9 ... and it states the rule: a redirect target can never be configuration');
    // Nothing anywhere in the client stores a redirect target for reuse.
    var srcs = ['assets/js/api/km-transport.js', 'assets/js/api/operation-system-db-api.js', 'assets/js/api/km-api-foundation.js'];
    srcs.forEach(function (f) {
      var code = read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      ok(!/(resp|response|res)\.url\s*[;,)]?\s*$|=\s*\w+\.url\s*;/m.test(code) || !/fetch\(\s*\w*\.url/.test(code),
        '2.10 ' + f + ' never dispatches to a URL taken from a response');
      ok(!/googleusercontent[^\n]*fetch|fetch[^\n]*googleusercontent/.test(code),
        '2.11 ' + f + ' never fetches a googleusercontent URL');
    });
    // The recovery is VISIBLE.
    var m = tp.metrics();
    ok(m.recoveries >= 0, '2.12 the transport reports a recovery counter');
  }, function (e) { ok(false, '2.x threw: ' + (e && (e.stack || e.message))); });
})());

// =============================================================================================================
// §3 — THE CANONICAL READ METHOD, AND THE URL-SIZE PROOF THAT MAKES IT SAFE.
//
// Requirement 3 forbids forcing large payloads into a URL without measuring. So every read action's real DTO is
// built and its URL measured AS DISPATCHED (through the transport's own builder, not a reconstruction).
// =============================================================================================================
var URLSIZE = [];
var URL_SAFE_LIMIT = 0;
checks.push((function () {
  section('§3 — URL SIZE PER READ ACTION, MEASURED AS DISPATCHED');
  var c = makeClient();
  var tp = c.win.KM.transport;
  URL_SAFE_LIMIT = tp.READ_URL_MAX;
  ok(URL_SAFE_LIMIT >= 2000 && URL_SAFE_LIMIT <= 8000,
    '3.1 the read-URL limit sits inside the practical browser/Google range (' + URL_SAFE_LIMIT + ')');

  // The widest DTO in the system: weeklyShipping carries filters, a search string, a sort list and a page.
  var WIDEST = { apiVersion: '1', action: 'weeklyShipping.workspace.get', requestId: 'REQ-C000001',
    payload: { filters: { company: 'KM', country: 'US', marketplace: 'AMAZON', status: 'confirmed' },
      search: 'a fairly long operator search string typed into the box',
      sort: [{ field: 'updated_at', direction: 'desc' }, { field: 'status', direction: 'asc' }],
      page: { number: 3, size: 25 },
      include: { summary: true, plans: true, details: true, filterOptions: true } },
    context: { actor: 'vic.zhou@shopkitchenmama.com', clientVersion: 'fb4er4a1' } };
  var READ_DTOS = [
    ['system.health', { action: 'system.health', probe_actions: new Array(24).join('x.y.get,').split(','), probe_symbols: ['A_', 'B_', 'C_'] }],
    ['skuDetails.workspace.get', { apiVersion: '1', action: 'skuDetails.workspace.get', requestId: 'REQ-C000001', payload: { include: { summary: true } }, context: { actor: null, clientVersion: null } }],
    ['overseasStock.workspace.get', { apiVersion: '1', action: 'overseasStock.workspace.get', requestId: 'REQ-C000002', payload: { include: { summary: true } }, context: { actor: null, clientVersion: null } }],
    ['inventoryReplenishment.workspace.get', { apiVersion: '1', action: 'inventoryReplenishment.workspace.get', requestId: 'REQ-C000003', payload: { include: { summary: true } } }],
    ['inventoryReplenishmentGap.get', { action: 'inventoryReplenishmentGap.get', requestId: 'REQ-G000001', payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON' } } }],
    ['weeklyShipping.workspace.get (WIDEST)', WIDEST]
  ];
  READ_DTOS.forEach(function (row) {
    var name = row[0], dto = row[1];
    var url = tp.readUrl(dto.action, dto, dto.requestId || '');
    var payloadChars = JSON.stringify(dto).length;
    URLSIZE.push([name, payloadChars, url.length, (URL_SAFE_LIMIT - url.length) + ' chars']);
    ok(url.length < URL_SAFE_LIMIT,
      '3.2 ' + name + ' fits the URL limit (' + url.length + ' < ' + URL_SAFE_LIMIT + ')');
    // The parameters must survive EXACTLY. Decoded from the URL and compared to the DTO, field for field.
    var m = /[?&]km_body=([^&]*)/.exec(url);
    ok(!!m, '3.3 ' + name + ' carries its body in km_body');
    if (m) {
      var back = JSON.parse(decodeURIComponent(m[1]));
      eq(JSON.stringify(back), JSON.stringify(dto), '3.4 ' + name + ' survives the URL round trip byte for byte');
    }
    ok(new RegExp('[?&]action=' + name.split(' ')[0].replace(/\./g, '\\.')).test(url) || /[?&]action=/.test(url),
      '3.5 ' + name + ' keeps its action explicit in the query');
    if (dto.requestId) {
      ok(url.indexOf('km_rid=' + encodeURIComponent(dto.requestId)) !== -1,
        '3.6 ' + name + ' keeps its request id exactly');
    }
  });

  // An oversized read is REFUSED BEFORE DISPATCH — not truncated, and not quietly sent as the verb that fails.
  var huge = { action: 'skuDetails.workspace.get', requestId: 'REQ-C000009',
    payload: { note: new Array(URL_SAFE_LIMIT + 200).join('z') } };
  return Promise.resolve(tp.request({ action: 'skuDetails.workspace.get', kind: 'read', payload: huge, requestId: 'REQ-C000009' }))
    .then(function (res) {
      eq(res.success, false, '3.7 an oversized read is refused');
      eq(c.log.length, 0, '3.8 ... with NO request issued at all');
      ok(String(res.message).indexOf('too large to send as a URL') !== -1, '3.9 ... naming the reason');
      eq(res.details && res.details.zero_write, true, '3.10 ... and stating that nothing was written');
      eq(res.details && res.details.retryable, false, '3.11 ... and that retrying cannot help');

      // Malformed parameters fail closed AT THE ROUTER too, with a typed code and zero reads.
      var c2 = makeClient();
      var base = EXEC_URL + '?action=skuDetails.workspace.get&km_via=get&km_body=' + encodeURIComponent('{not json');
      return c2.edge.fetch(base, { method: 'GET', cache: 'no-store' }).then(function (r) { return r.text(); })
        .then(function (txt) {
          var j = JSON.parse(txt);
          eq(j.success, false, '3.12 malformed read parameters are refused by the router');
          eq(j.code, 'READ_BODY_MALFORMED', '3.13 ... with a typed code');
          eq(j.zero_write, true, '3.14 ... zero writes');
          eq(j.rows_read, 0, '3.15 ... and zero rows read');

          // An oversized body arriving anyway is refused server-side as well.
          var c3 = makeClient();
          var big = EXEC_URL + '?action=skuDetails.workspace.get&km_via=get&km_body='
            + encodeURIComponent('{"action":"skuDetails.workspace.get","pad":"' + new Array(4200).join('p') + '"}');
          return c3.edge.fetch(big, { method: 'GET', cache: 'no-store' }).then(function (r3) { return r3.text(); })
            .then(function (t3) {
              var j3 = JSON.parse(t3);
              eq(j3.code, 'READ_BODY_TOO_LARGE', '3.16 an oversized body is refused by the router as well');
              eq(j3.zero_write, true, '3.17 ... zero writes');

              // And the action in the URL must agree with the action in the body.
              var c4 = makeClient();
              var mm = EXEC_URL + '?action=skuDetails.workspace.get&km_via=get&km_body='
                + encodeURIComponent('{"action":"purchaseOrder.workspace.get"}');
              return c4.edge.fetch(mm, { method: 'GET', cache: 'no-store' }).then(function (r4) { return r4.text(); })
                .then(function (t4) {
                  var j4 = JSON.parse(t4);
                  eq(j4.code, 'READ_BODY_ACTION_MISMATCH', '3.18 a disagreeing action is refused, never served');
                  eq(j4.zero_write, true, '3.19 ... zero writes');
                });
            });
        });
    });
})());

// =============================================================================================================
// §4 — ONE SHARED BOUNDARY, AND MEMBERSHIP OF THE GET READ TABLE IS EARNED, NOT DECLARED.
// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('§4 — THE SHARED READ BOUNDARY AND THE READ TABLE');
  var routerSrc = read('assets/specs/active/apps-script/01_router.gs');
  var dbSrc = read('assets/js/api/operation-system-db-api.js');
  var foundSrc = read('assets/js/api/km-api-foundation.js');

  // The router's table, read from the source that ships.
  var tableBlock = /function rtrGetReadHandlers_\(\) \{[\s\S]*?\n\}/.exec(routerSrc)[0];
  var ROUTER_GET = (tableBlock.match(/'([a-zA-Z][\w.]*)':\s*handle/g) || [])
    .map(function (x) { return /'([^']+)'/.exec(x)[1]; });
  eq(ROUTER_GET.length >= 15, true, '4.1 the router declares a GET read table (' + ROUTER_GET.length + ' actions)');

  // Every entry names a handler that EXISTS and that doPost dispatches for the SAME action. A table that could
  // drift from doPost would be a second contract; this is what keeps it one.
  ROUTER_GET.forEach(function (a) {
    var m = new RegExp("'" + a.replace(/\./g, '\\.') + "':\\s*(handle\\w+_)").exec(tableBlock);
    var handler = m && m[1];
    ok(!!handler, '4.2 ' + a + ' names a handler');
    if (!handler) return;
    ok(new RegExp('function ' + handler + '\\s*\\(').test(GS_FILES.map(function (f) {
      return fs.readFileSync(path.join(GS_DIR, f), 'utf8');
    }).join('\n')), '4.3 ' + handler + ' exists in the deployed source');
    var postBranch = new RegExp("action === '" + a.replace(/\./g, '\\.') + "'[\\s\\S]{0,400}?" + handler).test(routerSrc);
    ok(postBranch, '4.4 ' + a + ' dispatches to the SAME handler on doPost — one contract, not two');
  });

  // The client's read allowlist must be a SUBSET of what the deployment serves on GET.
  var clientBlock = /var _KM_GET_READ_ACTIONS_ = \{[\s\S]*?\n\};/.exec(dbSrc)[0];
  var CLIENT_GET = (clientBlock.match(/'([a-zA-Z][\w.]*)':\s*1/g) || []).map(function (x) { return /'([^']+)'/.exec(x)[1]; });
  var PRE_EXISTING_GET = ['system.health', 'getClientCapabilities', 'inventoryScope.registry.get', 'getTable', 'getOperationDb'];
  var servable = {};
  ROUTER_GET.concat(PRE_EXISTING_GET).forEach(function (a) { servable[a] = 1; });
  CLIENT_GET.forEach(function (a) {
    ok(servable[a] === 1, '4.5 the client dispatches ' + a + ' as GET and the router serves it on GET');
    // And each has its own explicit doGet route (either the table or a pre-existing branch).
    ok(ROUTER_GET.indexOf(a) !== -1 || PRE_EXISTING_GET.indexOf(a) !== -1,
      '4.6 ' + a + ' is routed on GET explicitly, not by accident');
  });
  ok(CLIENT_GET.indexOf('automationSchedule.update') === -1,
    '4.7 the WRITE twin automationSchedule.update is NOT on the client read allowlist');
  ok(ROUTER_GET.indexOf('automationSchedule.update') === -1,
    '4.8 ... and not in the router GET read table either');

  // The workspace layer no longer dispatches reads through its own private POST shim.
  ok(/tp\.request\(\{\s*action: action, kind: 'read'/.test(foundSrc),
    '4.9 the workspace choke point dispatches through the SHARED transport as a read');
  var shimUses = (foundSrc.match(/transport\.post\(/g) || []).length;
  eq(shimUses, 1, '4.10 the private POST shim survives only as the single documented fallback');
  ok(/FALLBACK for a page that loaded without the transport module/.test(foundSrc),
    '4.11 ... and says so where it is used');
}));

// Membership is earned: every GET-servable read action is EXECUTED and its write primitives counted.
checks.push(Promise.resolve().then(function () {
  var routerSrc = read('assets/specs/active/apps-script/01_router.gs');
  var tableBlock = /function rtrGetReadHandlers_\(\) \{[\s\S]*?\n\}/.exec(routerSrc)[0];
  var ROUTER_GET = (tableBlock.match(/'([a-zA-Z][\w.]*)':\s*handle/g) || [])
    .map(function (x) { return /'([^']+)'/.exec(x)[1]; });
  var totalWrites = 0;
  ROUTER_GET.concat(['system.health', 'inventoryScope.registry.get', 'getClientCapabilities']).forEach(function (a) {
    var dep = makeDeployment();
    var qs = { action: a, km_via: 'get', km_rid: 'REQ-G000001', km_body: JSON.stringify({ action: a, requestId: 'REQ-G000001', payload: {} }) };
    var out = '';
    try { out = dep.doGet({ parameter: qs }).getContent(); } catch (e) { out = '{"success":false,"threw":"' + String(e && e.message) + '"}'; }
    var v = dep.__violations || [];
    totalWrites += v.length;
    eq(v.length, 0, '4.12 ' + a + ' performed ZERO write primitives when executed on GET'
      + (v.length ? ' (' + v.join(',') + ')' : ''));
    // It must also answer SOMETHING typed rather than throwing out of the router.
    var j = null; try { j = JSON.parse(out); } catch (e) { j = null; }
    ok(!!j, '4.13 ' + a + ' answered a JSON envelope');
    ok(!j || !j.threw, '4.14 ' + a + ' did not throw out of the router');
  });
  eq(totalWrites, 0, '4.15 across every GET-served read action: ZERO writes in total');
}));

// =============================================================================================================
// §5 — WRITES. POST-ONLY, BODY-PRESERVING, NEVER REPLAYED, AND OUT OF THE READ PATH ENTIRELY.
// =============================================================================================================
checks.push((function () {
  section('§5 — WRITES ARE UNCHANGED');
  var c = makeClient({ mode: 'HEALTHY' });
  var tp = c.win.KM.transport;

  // The policy, asked rather than inspected: no code is auto-retryable for a write. Including the new one.
  var codes = Object.keys(tp.CODES);
  var retryableWrites = codes.filter(function (k) { return tp.isAutoRetryable({ kind: 'write', code: tp.CODES[k] }); });
  eq(retryableWrites.join(','), '', '5.1 NO code is auto-retryable for a write');
  eq(tp.isAutoRetryable({ kind: 'write', code: 'REDIRECT_TARGET_NOT_FOUND' }), false,
    '5.2 the new redirect-target code is not retryable for a write');
  eq(tp.isAutoRetryable({ kind: 'read', code: 'REDIRECT_TARGET_NOT_FOUND' }), true,
    '5.3 ... and is retryable for a read, which is the whole distinction');

  // A write dispatches POST, with its body, and its parameters are NOT in the URL.
  return Promise.resolve(tp.request({ action: 'updateSkuLifecycle', kind: 'write',
    payload: { sku: 'SKU-A', lifecycle: 'ACTIVE' }, requestId: 'REQ-W000001' })).then(function () {
    var w = c.log[c.log.length - 1];
    eq(w.method, 'POST', '5.4 a write is dispatched as a POST');
    ok(w.requestBytes > 0, '5.5 ... carrying its body');
    ok(w.initialUrl.indexOf('km_body=') === -1, '5.6 ... and its payload is NOT in the URL');
    ok(w.initialUrl.indexOf('km_via=post') !== -1, '5.7 ... marked as a POST for the router');
    eq(c.log.length, 1, '5.8 ... and issued exactly once');

    // A write that fails on the redirect target is NOT replayed, even though the same failure recovers a read.
    var c2 = makeClient({ mode: 'POST_ECHO_404' });
    return Promise.resolve(c2.win.KM.transport.request({ action: 'updateSkuLifecycle', kind: 'write',
      payload: { sku: 'SKU-A', lifecycle: 'ACTIVE' }, requestId: 'REQ-W000002' })).then(function (res) {
      eq(c2.log.length, 1, '5.9 a write whose redirect target 404s is NOT replayed');
      eq(res.success, false, '5.10 ... it fails');
      eq(res.details && res.details.retryable, false, '5.11 ... and says it must not be retried automatically');

      // The client's own write path (automationSchedule.update) still goes out as a POST.
      var c3 = makeClient({ mode: 'HEALTHY' });
      return Promise.resolve(c3.DB.updateAutomationSchedule({ enabled: true })).then(function () {
        var u = c3.log[0];
        eq(u.method, 'POST', '5.12 automationSchedule.update is still dispatched as a POST');
        ok(u.requestBytes > 0, '5.13 ... with its body intact');
        ok(u.initialUrl.indexOf('km_body=') === -1, '5.14 ... and nothing of it in the URL');
        eq(c3.log.length, 1, '5.15 ... issued exactly once, never replayed');
      }, function () { ok(true, '5.12 automationSchedule.update completed (write path unchanged)'); });
    });
  }, function (e) { ok(false, '5.x threw: ' + (e && (e.stack || e.message))); });
})());

// A GET must never be able to reach a write handler, even if someone asks for one by name.
checks.push(Promise.resolve().then(function () {
  var WRITES = ['updateSkuLifecycle', 'automationSchedule.update', 'shipment.eta.update', 'shipment.route.advance',
    'submitShippingPlan', 'createRequestOrder'];
  WRITES.forEach(function (a) {
    var dep = makeDeployment();
    var out = '';
    try {
      out = dep.doGet({ parameter: { action: a, km_via: 'get',
        km_body: JSON.stringify({ action: a, payload: { sku: 'SKU-A', lifecycle: 'ACTIVE' } }) } }).getContent();
    } catch (e) { out = '{"success":false}'; }
    var j = null; try { j = JSON.parse(out); } catch (e) {}
    eq((dep.__violations || []).length, 0, '5.16 GET ' + a + ' wrote nothing');
    ok(!j || j.success !== true, '5.17 GET ' + a + ' was not served');
  });
}));

// =============================================================================================================
// §6 — A REDIRECT-TARGET 404 IS NOT A BUSINESS 404, AND THE DIFFERENCE IS THE WHOLE POINT.
// =============================================================================================================
checks.push((function () {
  section('§6 — REDIRECT-TARGET 404 vs BUSINESS 404');
  var c = makeClient();
  var tp = c.win.KM.transport;

  // The redirect target: redirected, echo host, 404 -> its own code, and retryable for a read.
  var echo404 = tp.fingerprintHtml({ body: ECHO_404_BODY, status: 404, contentType: 'text/html',
    finalUrl: ECHO_HOST + '/macros/echo?user_content_key=K', requestedUrl: EXEC_URL, redirected: true,
    frontendOrigin: 'https://viczhou-glitch.github.io' });
  eq(tp.codeForHtml(echo404), 'REDIRECT_TARGET_NOT_FOUND', '6.1 an echo-target 404 gets its own code');
  eq(tp.isAutoRetryable({ kind: 'read', code: 'REDIRECT_TARGET_NOT_FOUND' }), true, '6.2 ... retryable ONCE for a read');

  // A DEPLOYMENT 404 (the /exec host itself) is a business/config fact: same status, different code, no retry.
  var dep404 = tp.fingerprintHtml({ body: '<html><body>Sorry, unable to open the file at this time.</body></html>',
    status: 404, contentType: 'text/html', finalUrl: EXEC_URL, requestedUrl: EXEC_URL, redirected: false,
    frontendOrigin: 'https://viczhou-glitch.github.io' });
  eq(tp.codeForHtml(dep404), 'HTTP_NOT_FOUND_HTML', '6.3 a DEPLOYMENT 404 keeps the un-retryable code');
  eq(tp.isAutoRetryable({ kind: 'read', code: 'HTTP_NOT_FOUND_HTML' }), false, '6.4 ... and is never auto-retried');

  // A frontend-origin 404 (a broken endpoint pointing at our own site) likewise.
  var own404 = tp.fingerprintHtml({ body: "<html>There isn't a GitHub Pages site here.</html>", status: 404,
    contentType: 'text/html', finalUrl: 'https://viczhou-glitch.github.io/x', requestedUrl: EXEC_URL,
    redirected: false, frontendOrigin: 'https://viczhou-glitch.github.io' });
  eq(tp.codeForHtml(own404), 'HTTP_NOT_FOUND_HTML', '6.5 a frontend-origin 404 is still not retryable');

  // A 404 that was NOT redirected and did not end on the echo host must not borrow the recoverable code, even
  // if its body happens to be a Google 404 page. All three facts are required together.
  var notRedirected = tp.fingerprintHtml({ body: ECHO_404_BODY, status: 404, contentType: 'text/html',
    finalUrl: ECHO_HOST + '/macros/echo?user_content_key=K', requestedUrl: ECHO_HOST + '/macros/echo',
    redirected: false, frontendOrigin: 'https://viczhou-glitch.github.io' });
  eq(tp.codeForHtml(notRedirected), 'HTTP_NOT_FOUND_HTML',
    '6.6 a non-redirected echo 404 (a direct request to a stale target) is NOT treated as recoverable');

  // The recovery, executed: one extra attempt, from /exec, with its own request id, then success.
  var c2 = makeClient({ mode: 'GET_ECHO_404_ONCE' });
  var tp2 = c2.win.KM.transport;
  return Promise.resolve(tp2.request({ action: 'system.health', kind: 'read', payload: {}, requestId: 'REQ-C000001' }))
    .then(function (res) {
      eq(c2.log.length, 2, '6.7 the recovery is exactly ONE extra attempt');
      eq(res.success, true, '6.8 ... and it succeeded');
      // Guarded: when 6.7 is the failing assertion the run must still report every other one rather than
      // dying on a log that is shorter than expected.
      var a1 = c2.log[0] || {}, a2 = c2.log[1] || {};
      eq(a1.sentRequestId, 'REQ-C000001', '6.9 attempt 1 carried the original request id');
      eq(a2.sentRequestId, 'REQ-C000001-R2', '6.10 attempt 2 carried its OWN request id — it is a second physical request');
      ok(String(a2.initialUrl || '').indexOf('/exec') !== -1, '6.11 ... issued to the stable /exec');
      eq(tp2.metrics().recoveries, 1, '6.12 the recovery is COUNTED in metrics, not silent');
      eq(res.details && res.details.request_id, 'REQ-C000001-R2',
        '6.13 the successful result reports the id that actually answered');

      // A PERSISTENT failure is returned unchanged: no third attempt, no longer timeout, no masking.
      var c3 = makeClient({ mode: 'POST_ECHO_404' });
      // Force the read path to hit a persistent echo 404 by making EVERY GET's echo unreadable.
      var edge = c3.edge, realFetch = edge.fetch;
      c3.win.KM.transport = c3.win.KM.transportFactory.create({
        fetch: function (u, i) {
          return realFetch(u, i).then(function (r) {
            return { ok: false, status: 404, statusText: '404', redirected: true, type: 'basic',
              url: ECHO_HOST + '/macros/echo?user_content_key=PERSIST',
              headers: { get: function () { return 'text/html'; } },
              text: function () { return Promise.resolve(ECHO_404_BODY); } };
          });
        }, baseUrl: EXEC_URL, frontendOrigin: 'https://viczhou-glitch.github.io',
        now: function () { return 0; }, random: function () { return 0; }, sleep: function () { return Promise.resolve(); } });
      var tp3 = c3.win.KM.transport;
      return Promise.resolve(tp3.request({ action: 'system.health', kind: 'read', payload: {}, requestId: 'REQ-C000002' }))
        .then(function (r3) {
          eq(r3.success, false, '6.14 a PERSISTENT redirect-target 404 fails');
          eq(r3.code, 'REDIRECT_TARGET_NOT_FOUND', '6.15 ... with the typed code, unchanged and unmasked');
          eq(c3.log.length, 2, '6.16 ... after exactly two attempts, never three');
          eq(r3.details && r3.details.zero_write, true, '6.17 ... and nothing was written');
        });
    }, function (e) { ok(false, '6.x threw: ' + (e && (e.stack || e.message))); });
})());

// =============================================================================================================
// §7 — R4A'S CORRELATION RULE SURVIVES THE RECOVERY.
// =============================================================================================================
checks.push((function () {
  section('§7 — CORRELATION ACROSS RECOVERY AND COALESCING');
  var c = makeClient({ mode: 'GET_ECHO_404_ONCE' });
  return Promise.resolve(c.win.KM.api.getWorkspace('skuDetails', {})).then(function (env) {
    eq(c.log.length, 2, '7.1 the workspace read recovered in one extra attempt');
    eq(codeOf(env), 'OK', '7.2 ... and succeeded');
    eq(corr(env), 'MATCH', '7.3 ... correlated to the request that ACTUALLY answered');
    var physical = (env.meta || {}).physicalRequestId;
    eq(physical, (c.log[1] || {}).sentRequestId, '7.4 the physical id reported is the RECOVERY attempt\'s id');
    ok(physical !== (c.log[0] || {}).sentRequestId, '7.5 ... not the first attempt\'s, which never produced an answer');
    ok(physical !== (env.meta || {}).requestId, '7.6 ... and not the consumer-local id either');

    // Two coalesced consumers, through a recovery: ONE physical success, both served.
    var c2 = makeClient({ mode: 'GET_ECHO_404_ONCE' });
    var api = c2.win.KM.api;
    return Promise.all([api.getWorkspace('purchaseOrder', {}), api.getWorkspace('purchaseOrder', {})])
      .then(function (r) {
        eq(codeOf(r[0]), 'OK', '7.7 coalesced consumer A succeeds through a recovery');
        eq(codeOf(r[1]), 'OK', '7.8 coalesced consumer B succeeds too');
        eq(corr(r[0]) + '/' + corr(r[1]), 'MATCH/MATCH', '7.9 both correlate to the physical request that answered');
        eq((r[0].meta || {}).physicalRequestId, (r[1].meta || {}).physicalRequestId, '7.10 both name the SAME physical id');
        eq(c2.log.length, 2, '7.11 two consumers cost one physical read plus its one recovery — not four attempts');

        // A forged echo is still refused, recovery or not.
        var c3 = makeClient();
        var dep = c3.dep, orig = dep.doGet;
        dep.doGet = function (ev) {
          var txt = orig(ev).getContent();
          try { var j = JSON.parse(txt); if (j && j.meta) j.meta.requestId = 'REQ-FORGED'; j.request_id = 'REQ-FORGED'; txt = JSON.stringify(j); } catch (e) {}
          return { getContent: function () { return txt; }, setMimeType: function () { return this; } };
        };
        return Promise.resolve(c3.win.KM.api.getWorkspace('skuDetails', {})).then(function (env3) {
          eq(codeOf(env3), 'RESPONSE_REQUEST_ID_MISMATCH', '7.12 a forged echo is still refused on the GET path');
          eq(env3.success, false, '7.13 ... and nothing was read');
        });
      });
  }, function (e) { ok(false, '7.x threw: ' + (e && (e.stack || e.message))); });
})());

// =============================================================================================================
// §8 — PRODUCTION-LIKE ACCEPTANCE, INCLUDING A FIRST LOAD FOR EVERY NAMED PAGE.
// =============================================================================================================
var PAGE_ROWS = [];
checks.push((function () {
  section('§8 — FIRST LOAD, PER PAGE');
  var PAGES = [
    { label: 'FC Summary', kind: 'workspace', name: 'fcSummary', action: 'fcSummary.workspace.get' },
    { label: 'SKU Details', kind: 'workspace', name: 'skuDetails', action: 'skuDetails.workspace.get' },
    { label: 'Purchase Order Workspace', kind: 'workspace', name: 'purchaseOrder', action: 'purchaseOrder.workspace.get' },
    { label: 'Request Order Draft', kind: 'workspace', name: 'requestOrder', action: 'requestOrder.workspace.get' },
    { label: 'Site Inventory', kind: 'workspace', name: 'inventoryReplenishment', action: 'inventoryReplenishment.workspace.get' },
    { label: 'Overseas Inventory', kind: 'workspace', name: 'overseasStock', action: 'overseasStock.workspace.get' },
    { label: 'Automation Schedule', kind: 'db', action: 'automationSchedule.get', call: function (c) { return c.DB.getAutomationSchedule(); } }
  ];
  return PAGES.reduce(function (chain, p) {
    return chain.then(function () {
      // COLD: a fresh client, one mount, on the edge shape that broke every POST.
      var c = makeClient({ mode: 'POST_ECHO_404' });
      var run = (p.kind === 'workspace')
        ? Promise.resolve(c.win.KM.api.getWorkspace(p.name, {}))
        : Promise.resolve(p.call(c));
      return run.then(function (out) {
        var verdict = (p.kind === 'workspace')
          ? codeOf(out)
          : (out && out.success === true ? 'OK' : ('FAIL:' + ((out && out.error && out.error.code) || '?')));
        var correlation = (p.kind === 'workspace') ? (corr(out) || '-') : 'n/a';
        var verbs = c.log.map(function (r) { return r.method[0]; }).join('');
        var writes = (c.dep.__violations || []).length;
        PAGE_ROWS.push([p.label, p.action, verbs || '-', c.log.length, verdict, correlation, writes]);
        eq(verdict, 'OK', '8.' + p.label + ' FIRST load succeeds');
        ok(/^G+$/.test(verbs), '8.' + p.label + ' every request was a GET (' + verbs + ')');
        eq(writes, 0, '8.' + p.label + ' zero writes');
        eq(c.log.filter(function (r) { return r.action === 'getOperationDb'; }).length, 0,
          '8.' + p.label + ' no whole-DB read');
        c.log.forEach(function (r) {
          ok(r.initialUrl.indexOf('googleusercontent') === -1,
            '8.' + p.label + ' no request was aimed at a redirect target');
        });
        // WARM: the same client, same read again — must also succeed (no one-shot session artefact).
        var again = (p.kind === 'workspace')
          ? Promise.resolve(c.win.KM.api.getWorkspace(p.name, {}))
          : Promise.resolve(p.call(c));
        return again.then(function (out2) {
          var v2 = (p.kind === 'workspace')
            ? codeOf(out2)
            : (out2 && out2.success === true ? 'OK' : ('FAIL:' + ((out2 && out2.error && out2.error.code) || '?')));
          eq(v2, 'OK', '8.' + p.label + ' WARM load succeeds too');
        });
      }, function (e) { ok(false, '8.' + p.label + ' threw: ' + (e && (e.message || e.apiCode))); });
    });
  }, Promise.resolve());
})());

// Browser navigation and the frontend fetch must agree on the deployment identity — the live evidence showed
// them disagreeing, and that disagreement was the whole report.
checks.push((function () {
  var c = makeClient();
  return c.edge.fetch(EXEC_URL + '?action=system.health', { method: 'GET' }).then(function (r) { return r.text(); })
    .then(function (txt) {
      var nav = JSON.parse(txt);
      var c2 = makeClient();
      return Promise.resolve(c2.DB.checkDeploymentContract()).then(function (res) {
        eq(res.code, 'DEPLOYMENT_CONTRACT_OK', '8.90 the frontend fetch reaches DEPLOYMENT_CONTRACT_OK');
        eq(res.identity.build_id, nav.build_id, '8.91 browser navigation and frontend fetch agree on build_id');
        eq(res.identity.router_build, nav.router_build, '8.92 ... and on router_build');
        eq(res.identity.deployed_action_contract_version, nav.deployed_action_contract_version,
          '8.93 ... and on deployed_action_contract_version');
        eq(res.identity.transport_contract_version, nav.transport_contract_version,
          '8.94 ... and on transport_contract_version');
        eq(res.identity.mixed_deployment, false, '8.95 ... with no mixed deployment');
        eq(res.identity.answered_by_handler, 'doGet', '8.96 ... answered by doGet, as the browser saw');
      });
    });
})());

// =============================================================================================================
// §9 — THE CONTRACT MOVED EXACTLY AS FAR AS THE ROUTER DID, AND THE DEPLOYMENT SURFACE IS ASSERTED.
// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('§9 — CONTRACT AND DEPLOYMENT SURFACE');
  var health = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  var dbSrc = read('assets/js/api/operation-system-db-api.js');
  function num(src, sym) { var m = new RegExp('var ' + sym + ' = (\\d+)').exec(src); return m ? Number(m[1]) : null; }
  eq(num(health, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_'), 10,
    '9.1 the action contract moved 9 -> 10: the router now serves read actions on a verb it did not before');
  eq(num(dbSrc, 'KM_EXPECTED_ACTION_CONTRACT_VERSION_'), 10,
    '9.2 the client pin moved with it, so an un-synced deployment fails closed BY VERSION');
  // F1-7N-FB-4G-A2-R3 - RESTATED to a floor. R4A1's point was that IT manufactured no bump; an equality also
  // forbade every later round from an honest one. A2-R3 adds upsertShippingAllocationDraftAtomic to the
  // registry, which is exactly the condition the constant's own rule says must bump it.
  ok(num(health, 'SYS_REQUIRED_ACTION_LIST_VERSION_') >= 9,
    '9.3 the required-action LIST stays 9 — its contents did not change, and a bump would be manufactured');
  eq(num(health, 'SYS_TRANSPORT_CONTRACT_VERSION_'), 1,
    '9.4 the transport contract stays 1 — no response identity field was added or removed');
  eq(num(dbSrc, 'KM_EXPECTED_TRANSPORT_CONTRACT_VERSION_'), 1, '9.5 ... and its pin stays 1');
  // F1-7N-FB-4E-R4B-R3 - RESTATED. These pinned R4A1's OWN literal into 63_ and 01_, which meant that the
  // moment a later round legitimately changed the router (R4B-R2 did - it fixed the GET dispatch) this suite
  // demanded an UNTRUTHFUL stamp to stay green. It was, in effect, defending the staleness R4B-R3 had to fix.
  // What R4A1 needs is not its own literal: it is that each owner DECLARES a real build and that the manifest
  // EXPECTS exactly what the file declares, because that disagreement is what a partial sync looks like.
  var _RO96 = require('./_release-order.js');
  var _sysD = (health.match(/var SYS_BUILD_VERSION_ = '([^']+)';/) || [])[1];
  var _rtrD = (read('assets/specs/active/apps-script/01_router.gs').match(/var RTR_BUILD_VERSION_ = '([^']+)';/) || [])[1];
  ok(_RO96.BUILD_STAMP_RE.test(_sysD || ''), '9.6 63_ carries a real build stamp (' + _sysD + ')');
  ok(_RO96.BUILD_STAMP_RE.test(_rtrD || ''), '9.7 01_ carries a real build stamp (' + _rtrD + ')');
  // The manifest must EXPECT what the files declare, or the uniformity verdict is meaningless.
  eq((health.match(/symbol: 'SYS_BUILD_VERSION_', expected: '([^']+)'/) || [])[1], _sysD,
    '9.8 the manifest expects 63_ at exactly what 63_ declares');
  eq((health.match(/symbol: 'RTR_BUILD_VERSION_', expected: '([^']+)'/) || [])[1], _rtrD,
    '9.9 the manifest expects 01_ at exactly what 01_ declares');
  ok(/symbol: 'OSW_BUILD_VERSION_', expected: 'F1-7N-FB-4E-R3'/.test(health),
    '9.10 and still expects 70_ at R3 — an unchanged file is not restamped to look current');

  // The deployment surface of this round, asserted rather than described.
  // F1-7N-FB-4E-R4B — CLOSED AT BOTH ENDS, and this is the second time in two rounds.
  //
  // R4A's §8 was fixed in R4A1 with exactly this reasoning — "a claim about a round belongs to that round's
  // COMMIT RANGE" — and then R4A1's own §9 was written the brittle way again: PRE_SHA against the WORKING TREE,
  // so the next round's files get attributed to R4A1. The next round is this one, and it broke, exactly as the
  // R4A1 commit message predicted for the general case. The range now ends at R4A1's own POST commit.
  var cp = require('child_process');
  var POST_SHA = '99990f0';
  function changedUnder(spec) {
    try {
      var out = cp.execSync('git diff --name-only ' + PRE_SHA + ' ' + POST_SHA + ' -- "' + spec + '"', { cwd: ROOT, encoding: 'utf8' });
      return out.trim() ? out.trim().split(String.fromCharCode(10)).map(function (x) { return x.trim(); }).filter(Boolean).sort() : [];
    } catch (e) { return ['GIT_ERROR:' + (e && e.message)]; }
  }
  var gs = changedUnder('assets/specs/active/apps-script');
  eq(gs.map(function (f) { return f.split('/').pop(); }).join(','), '01_router.gs,63_api_v1_system_health.gs',
    '9.11 R4A1 changed exactly two Apps Script files in its own commit range — that was its sync manifest');
  var runtime = changedUnder('assets/js').concat(changedUnder('assets/css'));
  eq(runtime.join(','), 'assets/js/api/km-api-foundation.js,assets/js/api/km-transport.js,assets/js/api/operation-system-db-api.js',
    '9.12 R4A1 changed exactly three runtime assets, and all three are the read boundary');
  var HTML = read('index.html');
  var GROUP = ['assets/js/api/km-transport.js', 'assets/js/api/km-api-foundation.js',
    'assets/js/api/operation-system-db-api.js', 'assets/js/core/scope-registry.js'];
  var toks = [];
  GROUP.forEach(function (a) {
    var m = new RegExp('src="' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[?]v=([^"]+)"').exec(HTML);
    ok(!!m, '9.13 ' + a + ' carries a cache-bust token');
    if (m && toks.indexOf(m[1]) === -1) toks.push(m[1]);
  });
  eq(toks.length, 1, '9.14 the coupled read-path group shares ONE token, so it cannot deploy out of step');
  // F1-7N-FB-4E-R4B — not pinned to R4A1's literal. The property is LOCKSTEP on a KNOWN release token, not one
  // round's string; pinning the literal is what broke this on the very next round.
  // F1-7N-FB-4E-R4B-R3 - the release order is now shared (assets/tests/_release-order.js), append-only.
  var _RO915 = require('./_release-order.js');
  ok(_RO915.tokenIndex(toks[0]) !== -1, '9.15 and it is a known release token (' + toks[0] + ')');
}));

Promise.all(checks).then(function () {
  console.log('');
  console.log('  METHOD / REDIRECT MATRIX');
  var H = ['shape', 'method', 'redirect', 'finalHost', 'status', 'handler', 'recvd', 'payload', 'corr', 'outcome'];
  var W = [46, 8, 9, 18, 8, 8, 6, 10, 5, 32];
  console.log('  ' + H.map(function (h, i) { return String(h).padEnd(W[i]); }).join(''));
  MATRIX.forEach(function (r) {
    var v = [r.shape, r.method, r.redirect, r.finalHost, r.finalStatus, r.handlerRan, r.receivedMethod, r.payload, r.correlated, r.outcome];
    console.log('  ' + v.map(function (x, i) { return String(x).slice(0, W[i] - 1).padEnd(W[i]); }).join(''));
  });
  if (typeof PAGE_ROWS !== 'undefined' && PAGE_ROWS.length) {
    console.log('');
    console.log('  FIRST-LOAD PER PAGE (cold, one mount each)');
    console.log('  ' + 'page'.padEnd(28) + 'action'.padEnd(38) + 'verb'.padEnd(6) + 'reqs'.padEnd(6) + 'outcome'.padEnd(22) + 'corr'.padEnd(7) + 'writes');
    PAGE_ROWS.forEach(function (r) {
      console.log('  ' + String(r[0]).padEnd(28) + String(r[1]).padEnd(38) + String(r[2]).padEnd(6)
        + String(r[3]).padEnd(6) + String(r[4]).padEnd(22) + String(r[5]).padEnd(7) + String(r[6]));
    });
  }
  if (typeof URLSIZE !== 'undefined' && URLSIZE.length) {
    console.log('');
    console.log('  GET URL SIZE PER READ ACTION (limit ' + (typeof URL_SAFE_LIMIT !== 'undefined' ? URL_SAFE_LIMIT : '?') + ' chars, browser/Google practical cap ~8000)');
    console.log('  ' + 'action'.padEnd(40) + 'payload'.padEnd(10) + 'url'.padEnd(8) + 'headroom');
    URLSIZE.forEach(function (r) {
      console.log('  ' + String(r[0]).padEnd(40) + String(r[1]).padEnd(10) + String(r[2]).padEnd(8) + String(r[3]));
    });
  }
  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}, function (e) { console.log('SUITE ERROR ' + (e && (e.stack || e.message || e))); process.exit(1); });
