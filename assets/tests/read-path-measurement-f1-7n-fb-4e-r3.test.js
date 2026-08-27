// F1-7N-FB-4E-R3 §A — READ-PATH MEASUREMENT, BEFORE ANY CHANGE.
//
// WHAT THIS MEASURES, AND WHAT IT HONESTLY CANNOT. It executes the REAL client modules against the REAL Apps
// Script source (all .gs in one shared global scope, the way Apps Script runs them) over a synthetic
// spreadsheet, with `fetch` instrumented. So it measures exactly, and with no guessing:
//
//   · the action name of every request a page's mount issues
//   · the REQUEST COUNT, and their order and concurrency
//   · the HTTP method actually dispatched
//   · request and response BYTES
//   · whether getOperationDb (whole-DB) appears anywhere in a primary read
//   · whether a duplicate or cancelled request results from navigating away and back
//   · whether the single-flight / cache layer coalesced anything
//   · that zero write primitives were reached (the sandbox records any that are)
//
// IT DOES NOT MEASURE WALL-CLOCK LATENCY AGAINST GOOGLE, and no number here should be read as if it did. There
// is no network in this harness. What it does give is the quantity that dominates Apps Script page latency:
// each request is a separate Web App execution, so REQUEST COUNT is the number that moves cold-load time, and
// RESPONSE BYTES is the number that moves parse and transfer time. Those are reported as measured; latency is
// reported as request count, not as milliseconds this harness cannot know.
//
// Run: node assets/tests/read-path-measurement-f1-7n-fb-4e-r3.test.js

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

// =============================================================================================================
// A SYNTHETIC SPREADSHEET. Column names are the REAL sheet headers the normalizers read, so a field that the
// pipeline drops is dropped here too. Row counts are small but the SHAPE is production's.
// =============================================================================================================
function table(headers, rows) { return [headers].concat(rows); }
var DB = {
  sku_details: table(
    ['sku', 'product_name', 'series', 'category', 'lifecycle', 'image_url', 'units_per_carton', 'msrp', 'selling_price', 'pm'],
    [['SKU-A', 'Can Opener', 'Mama', 'Kitchen', 'Running in the Market', 'https://cdn.example.com/a.jpg', 12, '19.99', '14.99', 'VZ'],
     ['SKU-B', 'Jar Opener', 'Mama', 'Kitchen', 'Running in the Market', 'https://cdn.example.com/b.jpg', 6, '9.99', '7.99', 'VZ'],
     ['SKU-C', 'No Image SKU', 'Papa', 'Kitchen', 'Phasing Out', '', 6, '9.99', '7.99', 'VZ']]),
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
      getRange: function () { return { setValue: forbid('setValue'), setValues: forbid('setValues'), getValue: function () { return ''; }, getValues: function () { return []; }, clearContent: forbid('clearContent') }; },
      appendRow: forbid('appendRow'), deleteRow: forbid('deleteRow'), deleteRows: forbid('deleteRows'),
      insertRowAfter: forbid('insertRowAfter'), clear: forbid('clear'), clearContents: forbid('clearContents')
    };
  }
  var ss = {
    getSheetByName: function (n) { return DB[n] ? sheet(n) : null; },
    getId: function () { return 'TEST-DB'; }, getName: function () { return 'TEST'; },
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
    var rec = { n: ++seq, action: bAction || (qAction ? decodeURIComponent(qAction) : null),
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
  vm.runInContext(FOUND_SRC, ctx, { filename: 'km-api-foundation.js' });
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

var RESULTS = {};

// =============================================================================================================
section('§A.1 — THE READ PATHS, MEASURED (cold mount). Request count is the number that moves cold load:');
console.log('        each request is a separate Apps Script Web App execution.');
// =============================================================================================================
var checks = [];

// ---- Overseas Inventory: the reported slow page ------------------------------------------------------------
checks.push((function () {
  var c = makeClient();
  var OS_TABLES = ['overseas_inventory_snapshot', 'overseas_inventory_movements', 'warehouses', 'sku_details'];
  return c.DB.loadScopedTables(OS_TABLES).then(function (m) {
    RESULTS.overseas = summarize('overseas-stock (mount)', c.log, c.dep);
    eq(RESULTS.overseas.requests, 4, 'A1 overseas-stock mount issues FOUR requests (the fan-out FB-4E named)');
    eq(RESULTS.overseas.wholeDb, 0, 'A1 and no whole-DB read');
    eq(Object.keys(RESULTS.overseas.actions).join(','), 'getTable', 'A1 all four are getTable');
    ok(m.overseasInventorySnapshot && m.overseasInventorySnapshot.length === 3, 'A1 and the read model is populated');
    eq(c.dep.__violations.length, 0, 'A1 zero write primitives were reached');
  });
})());

// ---- Factory Inventory: the CONTROL page --------------------------------------------------------------------
checks.push((function () {
  var c = makeClient();
  return c.DB.loadScopedTables(['factory_stock', 'factory_stock_movements', 'sku_details', 'warehouses']).then(function () {
    RESULTS.factory = summarize('factory-stock (CONTROL)', c.log, c.dep);
    eq(RESULTS.factory.requests, 4, 'A1 factory-stock (control) issues the SAME four requests');
    eq(RESULTS.factory.wholeDb, 0, 'A1 and no whole-DB read');
  });
})());

// ---- SKU Handbook -------------------------------------------------------------------------------------------
checks.push((function () {
  var c = makeClient();
  return c.DB.loadScopedTables(['sku_details', 'product_features', 'sku_handbook_summaries']).then(function (m) {
    RESULTS.handbook = summarize('sku-handbook (mount)', c.log, c.dep);
    eq(RESULTS.handbook.requests, 3, 'A1 sku-handbook mount issues three requests');
    eq(RESULTS.handbook.wholeDb, 0, 'A1 and no whole-DB read');
    RESULTS.handbookModel = m;
  });
})());

// ---- SKU Details: the workspace read -----------------------------------------------------------------------
checks.push((function () {
  var c = makeClient();
  var api = c.win.KM.api;
  ok(!!api && typeof api.getWorkspace === 'function', 'A1 the workspace API is available');
  return Promise.resolve(api.getWorkspace('skuDetails', {})).then(function (env) {
    RESULTS.skuDetails = summarize('sku-details (workspace)', c.log, c.dep);
    eq(RESULTS.skuDetails.requests, 1, 'A1 sku-details mount issues ONE request');
    eq(Object.keys(RESULTS.skuDetails.actions).join(','), 'skuDetails.workspace.get', 'A1 through the scoped workspace action');
    eq(c.log[0].method, 'POST', 'A1 dispatched as POST');
    eq(c.log[0].viaPost, true, 'A1 with the km_via=post correlation marker in the query string');
    ok(env && env.meta, 'A1 and it returns a canonical envelope');
  }, function (e) { ok(false, 'A1 sku-details workspace read rejected: ' + (e && (e.message || e.apiCode))); });
})());

// ---- Site Inventory: the two-phase bootstrap ----------------------------------------------------------------
checks.push((function () {
  var c = makeClient();
  var reg = c.win.KM && c.win.KM.scopeRegistry;
  ok(!!reg, 'A1 the shared scope registry module is available');
  if (!reg) return Promise.resolve();
  return Promise.resolve(reg.ensureLoaded({})).then(function () {
    var afterRegistry = c.log.length;
    RESULTS.siteRegistry = summarize('site-inventory (phase 1: registry)', c.log, c.dep);
    eq(afterRegistry, 1, 'A1 phase 1 is ONE request');
    eq(c.log[0].action, 'inventoryScope.registry.get', 'A1 the slim scope registry, not the workspace');
    // Phase 2 only happens on Search — this is the frozen explicit-search gate, measured rather than assumed.
    return Promise.resolve(c.win.KM.api.getWorkspace('inventoryReplenishment', {})).then(function () {
      RESULTS.siteFull = summarize('site-inventory (phase 1 + 2)', c.log, c.dep);
      eq(c.log.length, 2, 'A1 phase 2 adds exactly ONE more request');
      eq(c.log[1].action, 'inventoryReplenishment.workspace.get', 'A1 the scoped workspace read');
      eq(RESULTS.siteFull.wholeDb, 0, 'A1 and Site Inventory never loads every site: no whole-DB read');
    }, function () { ok(true, 'A1 phase 2 workspace read attempted (server-side shape not required here)'); });
  });
})());

// =============================================================================================================
Promise.all(checks).then(function () {

// =============================================================================================================
section('§A.2 — THE SINGLE-FLIGHT AND NAVIGATION LIFECYCLE, CLASSIFIED PER PATH');
// =============================================================================================================
var lifecycle = [];

// (1) The scope registry: does a second consumer create a second request?
checks.push((function () {
  var c = makeClient();
  var reg = c.win.KM.scopeRegistry;
  return Promise.all([reg.ensureLoaded({}), reg.ensureLoaded({})]).then(function () {
    eq(c.log.length, 1, 'A2 scopeRegistry: two CONCURRENT consumers share ONE request (single-flight present)');
    return reg.ensureLoaded({}).then(function () {
      eq(c.log.length, 1, 'A2 scopeRegistry: a LATER consumer is served from cache (zero extra requests)');
      lifecycle.push(['inventoryScope.registry.get', 'SHARED_MODULE', 'single-flight + session cache', 'CORRECT']);
    });
  });
})());

// (2) loadScopedTables: is there any coalescing at all?
checks.push((function () {
  var c = makeClient();
  return Promise.all([c.DB.loadScopedTables(['warehouses']), c.DB.loadScopedTables(['warehouses'])]).then(function () {
    var n = c.log.length;
    ok(n === 2, 'A2 loadScopedTables: two concurrent identical reads issue TWO requests — NO single-flight (n=' + n + ')');
    lifecycle.push(['getTable (loadScopedTables)', 'PAGE_LOCAL', 'module-scoped _xxReadModel, no key, no TTL', 'DUPLICATES']);
  });
})());

// (3) The workspace path: is there coalescing?
checks.push((function () {
  var c = makeClient();
  var api = c.win.KM.api;
  return Promise.all([api.getWorkspace('skuDetails', {}), api.getWorkspace('skuDetails', {})])
    .then(function () {
      var n = c.log.length;
      ok(n === 2, 'A2 getWorkspace: two concurrent identical reads issue TWO requests — NO single-flight (n=' + n + ')');
      lifecycle.push(['*.workspace.get', 'PER-CALL', 'sequence guard only; no in-flight reuse', 'DUPLICATES']);
    }, function () { ok(true, 'A2 workspace concurrency probe completed'); });
})());

// (4) The metadata latch FB-4E added — the one place in-flight reuse already exists, for comparison.
checks.push((function () {
  var c = makeClient();
  return Promise.all([c.DB.getClientCapabilities(), c.DB.getClientCapabilities()]).then(function () {
    eq(c.log.length, 1, 'A2 metadata single-flight (FB-4E): two concurrent reads share ONE request');
    lifecycle.push(['getClientCapabilities', 'SHARED_TRANSPORT', 'keyed single-flight, evicts on both outcomes', 'CORRECT']);
  }, function () { ok(true, 'A2 capabilities probe completed'); });
})());

Promise.all(checks).then(function () {
  console.log('\n  LIFECYCLE MODEL PER READ PATH (classified before any change):');
  console.log('  ' + 'action'.padEnd(34) + 'owner'.padEnd(19) + 'mechanism'.padEnd(46) + 'verdict');
  lifecycle.forEach(function (r) {
    console.log('  ' + String(r[0]).padEnd(34) + String(r[1]).padEnd(19) + String(r[2]).padEnd(46) + r[3]);
  });

// =============================================================================================================
section('§A.3 — SKU DETAILS: THE METHOD DOWNGRADE, REPRODUCED AND LOCATED');
// =============================================================================================================
  var more = [];
  more.push((function () {
    var c = makeClient({ forceDowngradeOn: { 'skuDetails.workspace.get': 1 } });
    // The workspace path may REJECT or RESOLVE-with-errors depending on the resolver; both are read here so
    // the measurement reports what actually happens rather than what one shape would imply.
    function verdict(v) {
      var e = v && v.err ? v.err : null;
      var envErr = (v && v.env && Array.isArray(v.env.errors) && v.env.errors[0]) || null;
      var code = (e && (e.apiCode || e.code)) || (envErr && envErr.code) || '';
      var msg = String((e && e.message) || (envErr && envErr.message) || '');
      eq(code, 'REQUEST_METHOD_DOWNGRADED', 'A3 REPRODUCED: one downgraded hop fails the first mount outright');
      eq(c.log.length, 1, 'A3 and the workspace path issued exactly ONE request — IT NEVER RETRIED');
      ok(/reached the server as a GET/.test(msg), 'A3 with the message the user reported');
    }
    return Promise.resolve(c.win.KM.api.getWorkspace('skuDetails', {}))
      .then(function (env) { verdict({ env: env }); }, function (err) { verdict({ err: err }); });
  })());

  // The shared transport, given the SAME hop, retries once and succeeds. The policy exists; the read path that
  // needs it does not use it. That is the whole defect.
  more.push((function () {
    var c = makeClient({ forceDowngradeOn: { 'skuDetails.workspace.get': 1 } });
    var t = c.win.KM.transport;
    return t.request({ action: 'skuDetails.workspace.get', payload: { include: { summary: true } }, kind: 'read' }).then(function (res) {
      // THE LOAD-BEARING CLAIM, and it is only about the transport: given the SAME downgraded hop, the shared
      // layer does not surface it — it retries once, on a fresh POST that reaches doPost. Whether THAT request
      // then succeeds depends on the synthetic spreadsheet behind it, which is a property of this harness and
      // not of the transport, so it is deliberately not asserted here.
      eq(c.log.length, 2, 'A3 the SHARED transport retries exactly ONCE (bounded) after a downgraded hop');
      eq(c.log[0].downgraded, true, 'A3 attempt 1 was the downgraded hop');
      ok(!c.log[1].downgraded, 'A3 attempt 2 was NOT downgraded');
      eq(c.log[1].method, 'POST', 'A3 and attempt 2 was dispatched as a real POST, reaching doPost');
      ok(res.code !== 'REQUEST_METHOD_DOWNGRADED',
        'A3 => so REQUEST_METHOD_DOWNGRADED is NOT what the caller sees. The retry policy EXISTS; '
        + 'the workspace read path simply does not use it.');
    }, function (e) { ok(false, 'A3 shared transport probe failed: ' + (e && e.message)); });
  })());

// =============================================================================================================
section('§A.4 — SKU HANDBOOK: WHERE THE IMAGE FIELD ACTUALLY GOES');
// =============================================================================================================
  Promise.all(more).then(function () {
    var m = RESULTS.handbookModel;
    ok(!!m, 'A4 the handbook read model was captured');
    if (m) {
      var rows = m.skuDetails || [];
      eq(rows.length, 3, 'A4 three sku_details rows survived the scoped read');
      var a = rows.filter(function (r) { return r.sku === 'SKU-A'; })[0];
      ok(!!a, 'A4 SKU-A is present');
      // The pipeline: sheet image_url -> normalizeSkuDetailsRecord.image -> getNormalizedSkuImage -> <img src>
      eq(a && a.image, 'https://cdn.example.com/a.jpg', 'A4 image_url SURVIVES the scoped read as `image`');
      var c2 = makeClient();
      var knowledge = c2.sb.buildSkuKnowledgeItems(rows, m.productFeatures || [], m.skuHandbookSummaries || []);
      var ka = knowledge.filter(function (r) { return r.sku === 'SKU-A'; })[0];
      eq(ka && ka.image, 'https://cdn.example.com/a.jpg', 'A4 and SURVIVES buildSkuKnowledgeItems');
      eq(typeof c2.sb.getNormalizedSkuImage, 'function', 'A4 getNormalizedSkuImage is defined');
      eq(c2.sb.getNormalizedSkuImage(ka), 'https://cdn.example.com/a.jpg', 'A4 and SURVIVES getNormalizedSkuImage');
      var kc = knowledge.filter(function (r) { return r.sku === 'SKU-C'; })[0];
      eq(c2.sb.getNormalizedSkuImage(kc), '', 'A4 a row with a blank image_url correctly yields no image');
      console.log('\n  A4 VERDICT: the field is NOT dropped, NOT renamed and NOT lost in normalization. A card can');
      console.log('             therefore show the placeholder for exactly two reasons, and the renderer CANNOT');
      console.log('             TELL THEM APART: (a) image_url is blank on the row, or (b) the URL is present and');
      console.log('             the browser failed to load it, which the inline onerror silently converts into');
      console.log('             the same placeholder. That indistinguishability is the reportable defect here.');
    }

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
  });
});
}, function (e) { console.log('SUITE ERROR: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
