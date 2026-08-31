// F1-7N-FB-4E-R4A — SCOPED SINGLE-FLIGHT REQUEST CORRELATION.
//
// THE DEFECT THIS SUITE EXISTS FOR, STATED AS THE RULE IT BROKE:
//
//     A REQUEST ID BELONGS TO ONE PHYSICAL WIRE REQUEST, NOT TO EVERY CONSUMER ATTACHED TO ITS PROMISE.
//
// R3 §E made one physical workspace read serve several equivalent consumers (action + canonical scope). But the
// sharing boundary was placed BEFORE correlation was checked: `_workspaceInvoke` shared the RAW server envelope,
// and each consumer then ran `normalizeWorkspaceEnvelope(serverEnv, ITS OWN dto, seq)` — comparing the echoed
// request id against an id THAT CONSUMER NEVER SENT. The physical sender matched; every attached consumer got
// RESPONSE_REQUEST_ID_MISMATCH and discarded a perfectly valid answer.
//
// That is exactly the live report: a workspace page shows the correlation error, and switching away and back
// "fixes" it — because the second visit is no longer racing the first and becomes the physical sender itself.
//
// WHAT THIS SUITE PROVES, AGAINST THE REAL CODE AND THE REAL ROUTER:
//   §1  the PRE-FIX SOURCE, loaded from the actual commit, reproduces the mismatch for the attached consumer
//   §2  the CURRENT source serves both consumers from one physical request, both successful
//   §3  a GENUINE wire mismatch — and a FORGED echo — are still blocked, for every consumer
//   §4  the coalescing rules: same scope shares, different scope/action does not, signals and post-write do not
//   §5  the six named read paths, executed end to end, with their correlation mechanism classified
//   §6  the deployment contract is untouched (9 / 9 / 1) and no Apps Script contract moved
//   §7  zero duplicate wire requests, zero whole-DB reads, zero writes
//
// The pre-fix half is not a description of the old behaviour: it EXECUTES `git show <PRE>:km-api-foundation.js`
// in the same harness against the same router. If that source cannot be loaded the suite FAILS rather than
// quietly skipping, because a reproduction that cannot run is not evidence.
//
// Run: node assets/tests/scoped-single-flight-request-correlation-f1-7n-fb-4e-r4a.test.js

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
    LockService: { getScriptLock: function () { violations.push('getScriptLock'); return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
    DriveApp: { createFile: forbid('DriveApp.createFile') }, UrlFetchApp: {},
    MailApp: { sendEmail: forbid('MailApp.sendEmail') }, GmailApp: {}, HtmlService: {},
    ScriptApp: { newTrigger: forbid('ScriptApp.newTrigger') }
  };
  sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  GS_FILES.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(GS_DIR, f), 'utf8'), ctx, { filename: f }); });
  sb.__violations = violations;
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

function makeClient(opts) {
  opts = opts || {};
  delete require.cache[require.resolve(TP_PATH)];
  var TP = require(TP_PATH);
  var log = [];
  var dep = opts.deployment || makeDeployment();
  var seq = 0;

  function instrumentedFetch(url, init) {
    var u = String(url);
    var method = (init && init.method) || 'GET';
    var body = (init && init.body) ? String(init.body) : '';
    var qAction = (/[?&]action=([^&]*)/.exec(u) || [])[1];
    var bAction = null;
    try { bAction = body ? (JSON.parse(body).action || null) : null; } catch (e) { bAction = null; }
    var sentRid = null;
    try { sentRid = body ? (JSON.parse(body).requestId || null) : null; } catch (e) { sentRid = null; }
    if (!sentRid) { var qr = /[?&]km_rid=([^&]*)/.exec(u); if (qr) sentRid = decodeURIComponent(qr[1]); }
    var rec = { n: ++seq, action: bAction || (qAction ? decodeURIComponent(qAction) : null), sentRequestId: sentRid,
      method: method, requestBytes: body.length, viaPost: /km_via=post/.test(u),
      aborted: false, responseBytes: 0, code: null, started: seq };
    log.push(rec);

    // An external abort must be observable, because §E depends on it.
    var sig = init && init.signal;
    if (sig && sig.aborted) { rec.aborted = true; var ea = new Error('aborted'); ea.name = 'AbortError'; return Promise.reject(ea); }

    var answer;
    if (opts.forceDowngradeOn && opts.forceDowngradeOn[rec.action] > 0) {
      // Simulate the Apps Script 302->GET body-dropping hop: the request lands at doGet with only the query.
      opts.forceDowngradeOn[rec.action] -= 1;
      rec.downgraded = true;
      var qs = {};
      String(u.split('?')[1] || '').split('&').forEach(function (kv) {
        var i = kv.indexOf('='); if (i > 0) qs[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
      });
      answer = dep.doGet({ parameter: qs }).getContent();
    } else if (method === 'GET') {
      var qs2 = {};
      String(u.split('?')[1] || '').split('&').forEach(function (kv) {
        var i = kv.indexOf('='); if (i > 0) qs2[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
      });
      answer = dep.doGet({ parameter: qs2 }).getContent();
    } else {
      answer = dep.doPost({ postData: { contents: body, type: 'text/plain' }, parameter: { action: rec.action } }).getContent();
    }
    rec.responseBytes = answer.length;
    try { var j = JSON.parse(answer); rec.success = j.success === true; rec.code = j.code || null; } catch (e) { rec.success = false; }

    return Promise.resolve({
      ok: true, status: 200, statusText: 'OK', redirected: false, type: 'basic', url: u,
      headers: { get: function (h) { return String(h).toLowerCase() === 'content-type' ? 'application/json' : null; } },
      text: function () { return Promise.resolve(answer); },
      json: function () { return Promise.resolve(JSON.parse(answer)); }
    });
  }

  // km-transport.js line 39 creates window.KM.transport at script load when a global root exists. Required
  // here explicitly, because `require` runs in Node's context and would attach the instance to Node's global
  // instead of this sandbox's window — and without it the FB-4E metadata single-flight is simply absent.
  var win = { KM: { transportFactory: TP }, location: { origin: 'https://viczhou-glitch.github.io', hash: '' },
    addEventListener: function () {}, removeEventListener: function () {} };
  win.KM.transport = TP.create({ fetch: function (u, i) { return instrumentedFetch(u, i); },
    baseUrl: EXEC_URL, frontendOrigin: 'https://viczhou-glitch.github.io',
    now: function () { return 0; }, random: function () { return 0; }, sleep: function () { return Promise.resolve(); } });
  var store = {};
  var sb = {
    console: console, window: win, JSON: JSON, Math: Math, Date: Date, Promise: Promise,
    Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
    Set: Set, Map: Map, isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, clearInterval: function () {},
    AbortController: AbortController, performance: { now: function () { return 0; } },
    document: { addEventListener: function () {}, removeEventListener: function () {}, readyState: 'complete',
      getElementById: function () { return null; }, querySelector: function () { return null; },
      querySelectorAll: function () { return []; }, createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} }, appendChild: function () {} }; } },
    localStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    fetch: instrumentedFetch
  };
  sb.globalThis = sb; sb.self = sb;
  var ctx = vm.createContext(sb);
  vm.runInContext(DBAPI_SRC, ctx, { filename: 'operation-system-db-api.js' });
  vm.runInContext(opts.foundationSrc || FOUND_SRC, ctx, { filename: 'km-api-foundation.js' });
  vm.runInContext(SCOPEREG_SRC, ctx, { filename: 'scope-registry.js' });
  vm.runInContext(OVERRIDES_SRC, ctx, { filename: 'sku-overrides.js' });
  return { sb: sb, win: win, DB: win.KM.DB, log: log, dep: dep, store: store };
}

function summarize(label, log, dep) {
  var actions = {};
  log.forEach(function (r) { actions[r.action || '(none)'] = (actions[r.action || '(none)'] || 0) + 1; });
  var bytes = log.reduce(function (a, r) { return a + r.responseBytes; }, 0);
  var wholeDb = log.filter(function (r) { return r.action === 'getOperationDb'; }).length;
  console.log('  ' + (label + '                              ').slice(0, 30)
    + ' requests=' + log.length
    + '  methods=' + log.map(function (r) { return r.method[0]; }).join('')
    + '  bytes=' + bytes
    + '  wholeDB=' + wholeDb
    + '  writes=' + ((dep && dep.__violations) ? dep.__violations.length : 0));
  console.log('     actions: ' + Object.keys(actions).map(function (k) { return k + '×' + actions[k]; }).join(', '));
  return { requests: log.length, bytes: bytes, wholeDb: wholeDb, actions: actions };
}

// =============================================================================================================
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
// this same harness, against this same executed router. If the blob cannot be read the suite FAILS: a
// reproduction that cannot run proves nothing, and silently skipping it would leave §2 asserting a fix for a
// defect nobody demonstrated.
// =============================================================================================================
var PRE_SHA = '8d42ca1';
var PRE_FOUND_SRC = null, PRE_LOAD_ERROR = null;
try {
  PRE_FOUND_SRC = require('child_process').execFileSync(
    'git', ['show', PRE_SHA + ':assets/js/api/km-api-foundation.js'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) { PRE_LOAD_ERROR = String((e && e.message) || e); }

// A wire-level forgery hook: rewrite the request id the SERVER echoes, without touching a line of code under
// test. This is how §3 proves that a genuinely uncorrelated answer is still refused — the marker the fix relies
// on is derived from the request we SENT, so nothing the response says can manufacture a match.
function forgeEcho(client, forgedId) {
  var dep = client.dep;
  ['doGet', 'doPost'].forEach(function (fn) {
    var orig = dep[fn];
    dep[fn] = function (ev) {
      var out = orig(ev);
      var txt = out.getContent();
      try {
        var j = JSON.parse(txt);
        if (j && j.meta) j.meta.requestId = forgedId;
        if (j && j.request_id) j.request_id = forgedId;
        txt = JSON.stringify(j);
      } catch (e) { /* not JSON: leave it exactly as the router produced it */ }
      return { getContent: function () { return txt; }, setMimeType: function () { return this; } };
    };
  });
}

function corr(env) { return env && env.meta ? env.meta.requestIdCorrelation : '(no meta)'; }
function codeOf(env) {
  if (!env) return '(no envelope)';
  if (env.success === true) return 'OK';
  return (env.errors && env.errors[0] && env.errors[0].code) || '(no code)';
}

var checks = [];
var RESULT = {};

// =============================================================================================================
// §1 — REPRODUCTION AGAINST THE PRE-FIX SOURCE.
//
// Two concurrent equivalent workspace reads: same action, same canonical scope, DISTINCT caller invocations.
// One physical fetch. The server echoes the id of the physical request, because that is the only id it was
// given. The attached consumer then compares that echo against ITS OWN id — which never left the browser.
// =============================================================================================================
checks.push((function () {
  section('§1 — THE DEFECT, REPRODUCED BY EXECUTING THE PRE-FIX SOURCE (' + PRE_SHA + ')');
  ok(PRE_LOAD_ERROR === null, '1.0 the pre-fix source loads from git (' + (PRE_LOAD_ERROR || 'loaded') + ')');
  if (!PRE_FOUND_SRC) return Promise.resolve();
  var c = makeClient({ foundationSrc: PRE_FOUND_SRC });
  var api = c.win.KM.api;
  return Promise.all([api.getWorkspace('skuDetails', {}), api.getWorkspace('skuDetails', {})])
    .then(function (r) {
      var a = r[0], b = r[1];
      eq(c.log.length, 1, '1.1 ONE physical request served both consumers (the coalescing itself was correct)');
      var codes = [codeOf(a), codeOf(b)].sort().join(' + ');
      console.log('    consumer outcomes: ' + codeOf(a) + ' / ' + codeOf(b)
        + '   correlation: ' + corr(a) + ' / ' + corr(b));
      // THE DEFECT: exactly one consumer — the physical sender — succeeded.
      eq(codes, 'OK + RESPONSE_REQUEST_ID_MISMATCH',
        '1.2 PRE-FIX: the attached consumer is told the answer belongs to another request');
      var bad = (codeOf(a) === 'OK') ? b : a;
      eq(corr(bad), 'MISMATCH', '1.3 PRE-FIX: its correlation verdict is MISMATCH');
      var det = bad.errors[0].details || {};
      ok(String(det.request_id || '') !== String(det.answered_request_id || ''),
        '1.4 PRE-FIX: the two ids differ — and the one it "sent" was never on the wire');
      // And the id the server echoed IS the id the physical request actually carried. That is the whole
      // finding: the response was correct and the comparison was wrong.
      var sentIds = [];
      c.log.forEach(function (rec) { if (rec.sentRequestId) sentIds.push(rec.sentRequestId); });
      eq(sentIds.length, 1, '1.5 exactly one request id ever reached the wire');
      eq(String(det.answered_request_id || ''), sentIds[0],
        '1.6 PRE-FIX: the echo matched the PHYSICAL id exactly — the answer was valid and was discarded');
      RESULT.pre = { requests: c.log.length, outcomes: codes };
    }, function (e) { ok(false, '1.x pre-fix reproduction threw: ' + (e && (e.message || e.apiCode))); });
})());

// =============================================================================================================
// §2 — THE SAME TWO CONSUMERS, AGAINST THE CURRENT SOURCE.
// =============================================================================================================
checks.push((function () {
  section('§2 — THE FIX: ONE PHYSICAL REQUEST, BOTH CONSUMERS SERVED');
  var c = makeClient();
  var api = c.win.KM.api;
  return Promise.all([api.getWorkspace('skuDetails', {}), api.getWorkspace('skuDetails', {})])
    .then(function (r) {
      var a = r[0], b = r[1];
      eq(c.log.length, 1, '2.1 still ONE physical request (the fix did not disable coalescing)');
      eq(codeOf(a), 'OK', '2.2 consumer A succeeds');
      eq(codeOf(b), 'OK', '2.3 consumer B succeeds');
      eq(a.success, true, '2.4 consumer A carries data');
      eq(b.success, true, '2.5 consumer B carries data');
      eq(corr(a), 'MATCH', '2.6 consumer A correlation MATCH');
      eq(corr(b), 'MATCH', '2.7 consumer B correlation MATCH');
      // Both consumers see the SAME physical id, and each still knows its own handle. Neither fact is invented:
      // the physical id is the one the request carried, the consumer id is the one the caller was given.
      var pa = a.meta.physicalRequestId, pb = b.meta.physicalRequestId;
      ok(!!pa && pa === pb, '2.8 both consumers report the SAME physical request id (' + pa + ')');
      eq(c.log[0].sentRequestId, pa, '2.9 and that id is the one actually put on the wire');
      var coalescedCount = (a.meta.coalesced === true ? 1 : 0) + (b.meta.coalesced === true ? 1 : 0);
      eq(coalescedCount, 1, '2.10 exactly one of the two is reported as ATTACHED, not both and not neither');
      // The data is shared, not re-fetched, and it is the same payload — a shared answer that differed would be
      // a correctness fault hiding behind a passing request count.
      eq(JSON.stringify(a.data) === JSON.stringify(b.data), true, '2.11 both consumers received identical data');
      RESULT.post = { requests: c.log.length, outcomes: codeOf(a) + ' + ' + codeOf(b) };
    }, function (e) { ok(false, '2.x threw: ' + (e && (e.message || e.apiCode))); });
})());

// =============================================================================================================
// §3 — A GENUINE MISMATCH IS STILL A MISMATCH, FOR EVERY CONSUMER.
//
// This is the assertion that makes §2 worth anything. The fix widens what counts as "the id we sent" from the
// consumer's local id to the PHYSICAL request's id — and not one step further. An answer carrying an id that
// was never sent by anyone is still refused, and refused for BOTH consumers rather than for the unlucky one.
// =============================================================================================================
checks.push((function () {
  section('§3 — A FORGED OR GENUINELY UNCORRELATED ECHO IS STILL REFUSED');
  var c = makeClient();
  forgeEcho(c, 'REQ-FORGED-999');
  var api = c.win.KM.api;
  return Promise.all([api.getWorkspace('skuDetails', {}), api.getWorkspace('skuDetails', {})])
    .then(function (r) {
      eq(c.log.length, 1, '3.1 one physical request');
      eq(codeOf(r[0]), 'RESPONSE_REQUEST_ID_MISMATCH', '3.2 consumer A refuses the forged echo');
      eq(codeOf(r[1]), 'RESPONSE_REQUEST_ID_MISMATCH', '3.3 consumer B refuses it too — no consumer is served');
      eq(corr(r[0]), 'MISMATCH', '3.4 verdict MISMATCH for A');
      eq(corr(r[1]), 'MISMATCH', '3.5 verdict MISMATCH for B');
      eq(r[0].success, false, '3.6 nothing was read (A)');
      eq(r[1].success, false, '3.7 nothing was read (B)');
      // Guarded: when this assertion is the one failing, the run must still report every other
      // assertion rather than dying on a missing errors[] and hiding them.
      var d = (r[1].errors && r[1].errors[0] && r[1].errors[0].details) || {};
      eq(String(d.answered_request_id), 'REQ-FORGED-999', '3.8 the error names the id the server actually echoed');
      eq(d.zero_write, true, '3.9 and states that nothing was written');
      ok(String(d.request_id || '') === c.log[0].sentRequestId,
        '3.10 the error names the PHYSICAL id as the one sent, not a consumer-local id it never dispatched');
    }, function (e) { ok(false, '3.x threw: ' + (e && (e.message || e.apiCode))); });
})());

// A forgery that echoes the OTHER consumer's id must also fail. This is the specific attack the marker design
// has to survive: the record is built from the DTO that was dispatched, so a response cannot nominate itself.
checks.push((function () {
  var c = makeClient();
  var api = c.win.KM.api;
  // Take one real id from a first read, then forge THAT id onto a later, unrelated physical request.
  return Promise.resolve(api.getWorkspace('skuDetails', {})).then(function (first) {
    var stolen = first.meta.physicalRequestId || first.meta.requestId;
    forgeEcho(c, stolen);
    return Promise.all([api.getWorkspace('purchaseOrder', {}), api.getWorkspace('purchaseOrder', {})]);
  }).then(function (r) {
    eq(codeOf(r[0]), 'RESPONSE_REQUEST_ID_MISMATCH', '3.11 an echo carrying ANOTHER request\'s real id is refused (A)');
    eq(codeOf(r[1]), 'RESPONSE_REQUEST_ID_MISMATCH', '3.12 ... and refused for the attached consumer too (B)');
  }, function (e) { ok(false, '3.1x threw: ' + (e && (e.message || e.apiCode))); });
})());

// =============================================================================================================
// §4 — THE COALESCING RULES, EACH PROVED RATHER THAN RESTATED.
// =============================================================================================================
checks.push((function () {
  section('§4 — THE COALESCING RULES');
  var c = makeClient();
  var api = c.win.KM.api;
  // same action + same scope -> one fetch, both consumers succeed
  return Promise.all([api.getWorkspace('skuDetails', {}), api.getWorkspace('skuDetails', {})]).then(function (r) {
    eq(c.log.length, 1, '4.1 same action + same canonical scope = ONE fetch');
    eq(codeOf(r[0]) + '/' + codeOf(r[1]), 'OK/OK', '4.2 ... and BOTH consumers succeed');
    // same action + DIFFERENT scope -> two fetches
    var c2 = makeClient(), a2 = c2.win.KM.api;
    return Promise.all([a2.getWorkspace('skuDetails', { include: { summary: true } }),
                        a2.getWorkspace('skuDetails', { include: { summary: false } })]).then(function (rr) {
      eq(c2.log.length, 2, '4.3 same action + DIFFERENT scope = TWO fetches (no cross-scope reuse)');
      eq(codeOf(rr[0]) + '/' + codeOf(rr[1]), 'OK/OK', '4.4 ... and both are correlated to their own request');
      var ids = c2.log.map(function (x) { return x.sentRequestId; });
      ok(ids[0] !== ids[1], '4.5 two physical requests carry two distinct ids');
      // different action -> two fetches
      var c3 = makeClient(), a3 = c3.win.KM.api;
      return Promise.all([a3.getWorkspace('skuDetails', {}), a3.getWorkspace('purchaseOrder', {})]).then(function (r3) {
        eq(c3.log.length, 2, '4.6 different action = TWO fetches');
        eq(corr(r3[0]) + '/' + corr(r3[1]), 'MATCH/MATCH', '4.7 ... each correlated to its own physical request');
        // a signal-bearing call is never shared (the frozen rule: one caller's abort must not cancel another's read)
        var c4 = makeClient(), a4 = c4.win.KM.api;
        var ac = new AbortController();
        return Promise.all([a4.getWorkspace('skuDetails', {}), a4.getWorkspace('skuDetails', {}, { signal: ac.signal })])
          .then(function () {
            eq(c4.log.length, 2, '4.8 a signal-bearing call is NOT shared — the frozen rule holds');
            // rejected requests are evicted: a failing read must not poison the next one
            var c5 = makeClient(), a5 = c5.win.KM.api;
            var tp5 = c5.win.KM.transport;
            return Promise.resolve(a5.getWorkspace('skuDetails', {})).then(function () {
              eq(tp5.scopedInflightKeys().length, 0, '4.9 nothing is retained after settlement (no completed-result cache)');
              return Promise.resolve(a5.getWorkspace('skuDetails', {})).then(function (again) {
                eq(c5.log.length, 2, '4.10 a SEQUENTIAL second read issues its own request (an open request is shared, a finished one is not)');
                eq(codeOf(again), 'OK', '4.11 ... and succeeds on its own id');
              });
            });
          });
      });
    });
  }, function (e) { ok(false, '4.x threw: ' + (e && (e.message || e.apiCode))); });
})());

// getTable sharing: the R3 path that was ALREADY structurally correct, and the post-write refresh that must
// stay unshared. Included because the fix must not have moved either of them.
checks.push((function () {
  var c = makeClient();
  var TB = ['warehouses', 'sku_details'];
  return Promise.all([c.DB.loadScopedTables(TB), c.DB.loadScopedTables(TB)]).then(function () {
    eq(c.log.length, 2, '4.12 two concurrent scoped table reads share one request PER TABLE (2, not 4)');
    var src = read('assets/js/api/operation-system-db-api.js');
    ok(/_kmRefreshCacheTables_[\s\S]{0,600}?_kmReadTablesBounded_\(names\);/.test(src),
      '4.13 post-write refresh still calls the reader WITHOUT share:true — a refresh must never attach to a pre-write read');
    ok(/loadScopedTables[\s\S]{0,600}?_kmReadTablesBounded_\(names, \{ share: true \}\)/.test(src),
      '4.14 ... while the mount read does share');
  }, function (e) { ok(false, '4.1x threw: ' + (e && (e.message || e.apiCode))); });
})());

// Navigation away and back DURING the same in-flight read: the returning consumer attaches, and is served.
checks.push((function () {
  var c = makeClient();
  var api = c.win.KM.api;
  var first = api.getWorkspace('inventoryReplenishment', {});      // page mounts, read starts
  var second = api.getWorkspace('inventoryReplenishment', {});     // user left and came back mid-read
  return Promise.all([first, second]).then(function (r) {
    eq(c.log.length, 1, '4.15 leave-and-return during an in-flight read attaches to it (ONE request)');
    eq(corr(r[0]) + '/' + corr(r[1]), 'MATCH/MATCH', '4.16 ... and the returning consumer is SERVED, not told the answer is not its own');
    ok(r[0].success === r[1].success, '4.17 both consumers reach the same outcome');
  }, function (e) { ok(false, '4.1y threw: ' + (e && (e.message || e.apiCode))); });
})());

// =============================================================================================================
// §5 — THE SIX NAMED READ PATHS, EXECUTED, WITH THEIR CORRELATION MECHANISM CLASSIFIED.
//
// Two concurrent equivalent reads of each. What is asserted is the property this round owns: no consumer is
// ever told a valid shared answer belongs to someone else. Business DTOs and write flows are untouched.
// =============================================================================================================
var PAGES = [
  { label: 'FC Summary', kind: 'workspace', name: 'fcSummary' },
  { label: 'SKU Details', kind: 'workspace', name: 'skuDetails' },
  { label: 'Purchase Order Workspace', kind: 'workspace', name: 'purchaseOrder' },
  { label: 'Request Order Draft', kind: 'workspace', name: 'requestOrder' },
  { label: 'Site Inventory', kind: 'workspace', name: 'inventoryReplenishment' },
  { label: 'Automation Schedule', kind: 'transport', call: function (c) { return c.DB.getAutomationSchedule(); } }
];
var PAGE_ROWS = [];
checks.push((function () {
  section('§5 — THE SIX READ PATHS, EXECUTED END TO END');
  return PAGES.reduce(function (chain, p) {
    return chain.then(function () {
      var c = makeClient();
      var two = (p.kind === 'workspace')
        ? [c.win.KM.api.getWorkspace(p.name, {}), c.win.KM.api.getWorkspace(p.name, {})]
        : [p.call(c), p.call(c)];
      return Promise.all(two.map(function (pr) {
        return Promise.resolve(pr).then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; });
      })).then(function (r) {
        var shared = c.log.length === 1;
        var verdicts = r.map(function (x) {
          if (!x.ok) return 'REJECTED:' + ((x.e && (x.e.apiCode || x.e.code)) || 'unknown');
          if (p.kind === 'transport') return x.v && x.v.success === true ? 'OK' : ('FAIL:' + ((x.v && x.v.code) || '?'));
          return codeOf(x.v);
        });
        // The one thing every path must satisfy, shared or not.
        verdicts.forEach(function (v, i) {
          ok(v.indexOf('RESPONSE_REQUEST_ID_MISMATCH') === -1,
            '5.' + p.label + ' consumer ' + (i + 1) + ' is not refused for a correlation it never asked for (' + v + ')');
        });
        PAGE_ROWS.push([p.label, (p.kind === 'workspace' ? 'workspace choke point' : 'shared transport'),
          c.log.length, shared ? 'COALESCED' : 'INDEPENDENT', verdicts.join(' / '),
          (c.dep.__violations || []).length]);
        eq((c.dep.__violations || []).length, 0, '5.' + p.label + ' zero DB writes');
        eq(c.log.filter(function (x) { return x.action === 'getOperationDb'; }).length, 0,
          '5.' + p.label + ' zero whole-DB read');
      });
    });
  }, Promise.resolve());
})());

// =============================================================================================================
// §6 — THE DEPLOYMENT CONTRACT DID NOT MOVE. R4A is a FRONTEND correlation repair.
// =============================================================================================================
checks.push((function () {
  section('§6 — THE CONTRACT IS UNTOUCHED (a client-side boundary fix must not need a publish)');
  var health = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  function num(sym) { var m = new RegExp('var ' + sym + ' = (\\d+)').exec(health); return m ? Number(m[1]) : null; }
  // F1-7N-FB-4E-R4A1 - RESTATED FROM "STAYS 9" TO WHAT THIS SECTION ACTUALLY DEFENDS.
  //
  // R4A's claim was that ITS OWN change needed no publish. That is still true and still asserted, but as a fact
  // about R4A's commit range (see section 8), not as a claim that the world stays at 9 forever. R4A1 legitimately
  // moved the action contract to 10 because the router now serves read actions on a verb it did not serve before,
  // and a suite that reads that as a regression is wrong about the axis rather than protective of it.
  var ACT9 = num('SYS_DEPLOYED_ACTION_CONTRACT_VERSION_');
  ok(ACT9 >= 9, '6.1 the action contract is at or above R4A\'s floor of 9 (' + ACT9 + ')');
  ok(num('SYS_REQUIRED_ACTION_LIST_VERSION_') >= 9, '6.2 the required action list is at or above 9');
  eq(num('SYS_TRANSPORT_CONTRACT_VERSION_'), 1, '6.3 transport contract stays 1');
  var pin = /var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(read('assets/js/api/operation-system-db-api.js'));
  eq(pin && Number(pin[1]), ACT9,
    '6.4 the client pin AGREES with the deployment - no version was moved on one side only');
  ok(pin && Number(pin[1]) >= 9, '6.5 ... and it is raised, never lowered');
  // And the deployment contract still reaches OK against the executed router.
  var c = makeClient();
  return Promise.resolve(c.DB.checkDeploymentContract()).then(function (res) {
    eq(res && res.code, 'DEPLOYMENT_CONTRACT_OK', '6.5 checkDeploymentContract() = DEPLOYMENT_CONTRACT_OK');
    eq(res.identity && res.identity.transport_contract_version, 1, '6.6 transport_contract_version = 1 as reported live');
    eq(res.identity && res.identity.deployed_action_contract_version, ACT9,
      '6.7 the reported action contract equals what 63_ declares (' + ACT9 + ')');
  }, function (e) { ok(false, '6.x contract probe threw: ' + (e && (e.message || e.apiCode))); });
})());

// =============================================================================================================
// §7 — THE INVARIANTS, AND THE SOURCE-LEVEL RULES THAT KEEP THE FIX FROM BEING UNDONE.
// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('§7 — INVARIANTS AND ANTI-REGRESSION RULES');
  var f = read('assets/js/api/km-api-foundation.js');

  // The request id must NOT be part of the single-flight key. That would "fix" the symptom by destroying the
  // coalescing, and it is explicitly forbidden.
  var keyLine = /canonicalScope\(\{([^}]*)\}\)/.exec(f);
  ok(keyLine && !/requestId/.test(keyLine[1]),
    '7.1 the scope key does NOT include the request id (coalescing is not disabled to pass a test)');

  // Correlation validation still exists, and still fails closed.
  ok(/RESPONSE_REQUEST_ID_MISMATCH/.test(f), '7.2 the correlation error code still exists');
  ok(/MISMATCH[\s\S]{0,400}?success: false/.test(f), '7.3 a mismatch still returns success:false');

  // The physical record is built from the DISPATCHED DTO, never from the response. This is what makes the
  // forgery in §3 impossible to satisfy, and it is a property of the source, not of one test's luck.
  ok(/recordPhysicalRequest\(/.test(f), '7.4 a physical-request record is created at the dispatch boundary');
  ok(/physical[\s\S]{0,200}dto\.requestId/.test(f) || /dto\.requestId[\s\S]{0,200}physical/.test(f),
    '7.5 ... from the DTO that was sent');
  ok(!/physicalRequestId\s*=\s*[^;]*serverEnv/.test(f),
    '7.6 ... and never adopted from the server envelope');

  // The record must live in a side channel the server cannot write to. A key on the envelope itself could be
  // supplied by the response JSON and would defeat the whole check.
  ok(/new WeakMap\(\)/.test(f), '7.7 the record is held in a WeakMap, so a response cannot forge one');
  // Checked against CODE, not prose: the previous form of this assertion matched the comment that NAMES the
  // rejected design, which made it satisfiable by writing about it. Comments are stripped first, and the
  // behavioural half of the same claim is §7.14 below.
  var code = f.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/serverEnv\s*(\.__km|\[\s*['"]__km)/.test(code), '7.8 no code stamps a marker onto the parsed envelope');

  // Both request-id comparisons had the same defect, so both must be fixed. The downgrade proof is the second
  // one, and a coalesced consumer whose proof failed to correlate would have its real error misreported.
  var proofCalls = (f.match(/[^n] downgradeProof\(serverEnv, [^)]+\)/g) || [])
    .filter(function (m) { return m.indexOf('function') === -1; });
  eq(proofCalls.length, 2, '7.9 both downgradeProof CALL sites are accounted for (the declaration is not one)');
  ok(proofCalls.every(function (s) { return !/dto\.requestId\)/.test(s); }),
    '7.10 neither passes a consumer-local id any more — both use the id actually sent');

  // No completed-result cache was introduced (explicitly out of scope for R4A).
  ok(!/completedCache|_resultCache/.test(f), '7.11 no completed-result cache was added (R4B scope)');

  // The frozen rules R3 established are still asserted here rather than assumed elsewhere.
  ok(/!signal/.test(f), '7.12 signal-bearing calls are still excluded from sharing');
  var tp = read('assets/js/api/km-transport.js');
  ok(/METADATA_KEYS/.test(tp) && /function scopedSingleFlight/.test(tp),
    '7.13 the metadata latch and the scoped facility remain separate mechanisms');
}));

// 7.14 — THE ATTACK SURFACE ITSELF. The record the fix trusts is built from the DTO this client dispatched, so
// a response must not be able to declare itself correlated. Here the server echoes a WRONG id and, at the same
// time, stamps every marker name it could plausibly use to claim a match. If any of them were honoured — a
// field on the envelope, a field in meta — this read would be accepted. It is refused, for both consumers.
checks.push((function () {
  var c = makeClient();
  var dep = c.dep;
  ['doGet', 'doPost'].forEach(function (fn) {
    var orig = dep[fn];
    dep[fn] = function (ev) {
      var txt = orig(ev).getContent();
      try {
        var j = JSON.parse(txt);
        var claim = 'REQ-C000001';                       // the id a consumer plausibly holds
        if (j && j.meta) { j.meta.requestId = 'REQ-NOT-YOURS'; j.meta.physicalRequestId = claim; j.meta.coalesced = true; }
        j.request_id = 'REQ-NOT-YOURS';
        j.__km_physical_request_id = claim;
        j.__km_physical = { requestId: claim };
        j.physicalRequestId = claim;
        txt = JSON.stringify(j);
      } catch (e) {}
      return { getContent: function () { return txt; }, setMimeType: function () { return this; } };
    };
  });
  var api = c.win.KM.api;
  return Promise.all([api.getWorkspace('skuDetails', {}), api.getWorkspace('skuDetails', {})]).then(function (r) {
    eq(codeOf(r[0]), 'RESPONSE_REQUEST_ID_MISMATCH', '7.14 a response that stamps its own correlation marker is still refused (A)');
    eq(codeOf(r[1]), 'RESPONSE_REQUEST_ID_MISMATCH', '7.15 ... and for the attached consumer (B)');
    eq(r[0].meta.physicalRequestId, c.log[0].sentRequestId,
      '7.16 the reported physical id is the one WE sent, not the one the response claimed');
  }, function (e) { ok(false, '7.1x threw: ' + (e && (e.message || e.apiCode))); });
})());

// =============================================================================================================
// §8 -- THE DEPLOYMENT SURFACE OF THIS ROUND, ASSERTED RATHER THAN DESCRIBED.
//
// R4A is a correlation-boundary repair in ONE client file. "No Apps Script sync is required" is worth nothing as
// prose, so it is checked: if any .gs file differs from the round's starting commit this fails, and the
// completion report's manifest is wrong rather than merely optimistic.
// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('§8 -- DEPLOYMENT SURFACE');
  // F1-7N-FB-4E-R4A1 - A ROUND'S CLAIM IS ABOUT ITS OWN COMMIT RANGE, NOT ABOUT "SINCE THEN".
  //
  // These compared PRE_SHA against the WORKING TREE, so every later round's files were attributed to R4A and the
  // assertion broke the moment anything else shipped. This is the third time that shape has bitten this line
  // (FB-4E-R2 section 8, R3 G9, here), so the range is now closed at R4A's own POST commit: the claim becomes
  // permanently true and stays meaningful.
  var cp = require('child_process');
  var POST_SHA = '47c5e8b';
  function changedUnder(pathspec) {
    try {
      var out = cp.execSync('git diff --name-only ' + PRE_SHA + ' ' + POST_SHA + ' -- "' + pathspec + '"', { cwd: ROOT, encoding: 'utf8' });
      return out.trim() ? out.trim().split(String.fromCharCode(10)).map(function (x) { return x.trim(); }).filter(Boolean).sort() : [];
    } catch (e) { return ['GIT_ERROR:' + (e && e.message)]; }
  }
  eq(changedUnder('assets/specs/active/apps-script').join(','), '',
    '8.1 R4A changed NO Apps Script file in ' + PRE_SHA + '..' + POST_SHA + ' - its sync manifest was genuinely NONE');
  var runtime = changedUnder('assets/js').concat(changedUnder('assets/css'));
  eq(runtime.join(','), 'assets/js/api/km-api-foundation.js',
    '8.2 R4A changed exactly one runtime asset, and it is the file that owns the boundary');
  // The coupled read-path group moves on ONE token, so a browser can never pair a new foundation with an old
  // transport. The two halves of the coalescing contract have to arrive together, which is why the token is
  // bumped for the whole group and not only for the one file whose bytes changed.
  var HTML = read('index.html');
  var GROUP = ['assets/js/api/km-transport.js', 'assets/js/api/km-api-foundation.js',
    'assets/js/api/operation-system-db-api.js', 'assets/js/core/scope-registry.js'];
  var toks = [];
  GROUP.forEach(function (a) {
    var m = new RegExp('src="' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[?]v=([^"]+)"').exec(HTML);
    ok(!!m, '8.3 ' + a + ' carries a cache-bust token');
    if (m && toks.indexOf(m[1]) === -1) toks.push(m[1]);
  });
  eq(toks.length, 1, '8.4 the coupled read-path group shares ONE token, so it cannot deploy out of step');
  // F1-7N-FB-4E-R4A1 - not pinned to R4A's literal: a later round that moves the token forward is correct, and
  // pinning the literal is what made three earlier assertions in this line fail on a correct change. The rule is
  // that the group is in lockstep on a KNOWN release token, at or after this round's position in the order.
  var KNOWN_TOKENS = ['fb4er3-lifecycle-20260827', 'fb4er4a-correlation-20260827', 'fb4er4a1-readtransport-20260827',
    'fb4er4b-readback-20260831'];
  ok(KNOWN_TOKENS.indexOf(toks[0]) !== -1, '8.5 and it is a known release token (' + toks[0] + ')');
  ok(KNOWN_TOKENS.indexOf(toks[0]) >= KNOWN_TOKENS.indexOf('fb4er4a-correlation-20260827'),
    '8.6 at or after R4A in the release order - a monotonic floor');
}));

Promise.all(checks).then(function () {
  console.log('\n  §5 — READ PATH x CORRELATION MECHANISM');
  console.log('  ' + 'page'.padEnd(28) + 'boundary'.padEnd(24) + 'reqs'.padEnd(6) + 'sharing'.padEnd(13) + 'consumers'.padEnd(24) + 'writes');
  PAGE_ROWS.forEach(function (r) {
    console.log('  ' + String(r[0]).padEnd(28) + String(r[1]).padEnd(24) + String(r[2]).padEnd(6)
      + String(r[3]).padEnd(13) + String(r[4]).padEnd(24) + String(r[5]));
  });
  console.log('\n  BEFORE/AFTER (two concurrent equivalent workspace reads):');
  console.log('    PRE  ' + PRE_SHA + ': requests=' + (RESULT.pre ? RESULT.pre.requests : '?')
    + '  consumers=' + (RESULT.pre ? RESULT.pre.outcomes : '?'));
  console.log('    POST      : requests=' + (RESULT.post ? RESULT.post.requests : '?')
    + '  consumers=' + (RESULT.post ? RESULT.post.outcomes : '?'));
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}, function (e) {
  console.log('SUITE ERROR ' + (e && (e.stack || e.message || e)));
  process.exit(1);
});
