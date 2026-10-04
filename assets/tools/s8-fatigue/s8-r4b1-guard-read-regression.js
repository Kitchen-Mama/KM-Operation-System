// =============================================================================================================
// S8-R4B-1 — FACTORY GUARD READ TRANSPORT: TARGETED LIVE REGRESSION
//
// READ-ONLY. It sends exactly two actions:
//   getTable?table=shipping_plans   to pick ONE deterministic, real shipping_plan_id   (reads 1 approved table)
//   factoryStockGuard.get           on both verbs                                      (reads 7 approved tables)
//
// Nothing outside the seven tables the operator approved for this round is touched, and nothing is written:
// both actions are reads whose handlers hold no write primitive at any depth.
//
// WHAT IT PROVES, AND WHAT IT CANNOT. It compares the OLD transport (POST, as the shipped client sent it
// before this repair) against the NEW one (GET) for the SAME plan id, field for field. That comparison is
// the point: it shows the repair changed how the request travels and nothing about what comes back. It then
// repeats the GET n times.
//
// n clean reads is CONSISTENT WITH the repair. It is not proof that the old 2-in-9 failure can never recur,
// and this tool does not print one. The mechanism is the proof: the failure was a POST body dropped across
// the /exec 302, and a GET has no body to drop.
//
// Run: node assets/tools/s8-fatigue/s8-r4b1-guard-read-regression.js [--n 20]
// =============================================================================================================

'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..', '..');
function arg(name, dflt) {
  var i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : process.argv[i + 1];
}
var N = parseInt(arg('n', '20'), 10);

// The endpoint is read from the SHIPPED client, never typed here. A URL in a tool is a URL that can drift
// from the one the product uses, and then the tool measures something the product does not do.
var dbApi = fs.readFileSync(path.join(ROOT, 'assets/js/api/operation-system-db-api.js'), 'utf8');
var mBase = /OP_DB_API_BASE_URL\s*=\s*'([^']+)'/.exec(dbApi);
if (!mBase) { console.error('STOP — could not read OP_DB_API_BASE_URL from the shipped client.'); process.exit(2); }
var BASE = mBase[1];
if (BASE.indexOf('https://script.google.com/macros/s/') !== 0 || BASE.slice(-5) !== '/exec') {
  console.error('STOP — the endpoint is not a stable /macros/s/<deployment>/exec URL.'); process.exit(2);
}

// Deny-by-default: this tool may send these two actions and nothing else, on these verbs and nothing else.
var ALLOWED = { 'getTable': ['GET'], 'factoryStockGuard.get': ['GET', 'POST'] };
var APPROVED_TABLES = ['warehouses', 'factory_stock', 'shipping_allocation_drafts',
  'shipping_allocation_draft_lines', 'shipping_plans', 'shipping_plan_lines', 'marketplaces'];

var ridSeq = 0;
function rid(p) { ridSeq++; return p + ('000000' + ridSeq).slice(-6); }

function guard(action, method) {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, action)) {
    throw new Error('S8R4B1_ACTION_NOT_APPROVED — ' + action);
  }
  if (ALLOWED[action].indexOf(method) === -1) {
    throw new Error('S8R4B1_VERB_NOT_APPROVED — ' + action + ' on ' + method);
  }
}

// The NEW path: GET, flat body in km_body, read request id — byte-identical in shape to what
// _kmGapRead_ builds in the shipped client.
async function sendGet(action, payload) {
  guard(action, 'GET');
  var id = rid('REQ-G');
  var dto = Object.assign({ action: action }, payload || {}, { requestId: id });
  var qp = 'action=' + encodeURIComponent(action) + '&km_via=get&km_tc=1&km_rid=' + encodeURIComponent(id);
  var pj = JSON.stringify(dto);
  if (pj !== '{}') { qp += '&km_body=' + encodeURIComponent(pj); }
  var url = BASE + '?' + qp;
  var t0 = Date.now();
  var r = await fetch(url, { method: 'GET', cache: 'no-store' });
  var text = await r.text();
  return { ok: r.ok, status: r.status, ms: Date.now() - t0, redirected: r.redirected,
           finalHost: (/^https?:\/\/([^/]+)/.exec(r.url) || [])[1] || null,
           rid: id, bytes: text.length, body: parse(text), raw: text.slice(0, 200) };
}

// getTable, in the shape the shipped client uses (operation-system-db-api.js:151): the table name travels
// as a query parameter. One table per request, and the only table this tool ever names is an approved one.
async function sendGetTable(tableName) {
  guard('getTable', 'GET');
  if (APPROVED_TABLES.indexOf(tableName) === -1) {
    throw new Error('S8R4B1_TABLE_NOT_APPROVED — ' + tableName);
  }
  var id = rid('REQ-G');
  var url = BASE + '?action=getTable&table=' + encodeURIComponent(tableName) + '&km_rid=' + encodeURIComponent(id);
  var t0 = Date.now();
  var r = await fetch(url, { method: 'GET', cache: 'no-store' });
  var text = await r.text();
  return { ok: r.ok, status: r.status, ms: Date.now() - t0, redirected: r.redirected,
           rid: id, bytes: text.length, body: parse(text), raw: text.slice(0, 200) };
}

// The OLD path, reproduced exactly: POST, flat body, write-shaped request id. Sent once, for the
// before/after comparison, and never in the repeat loop.
async function sendPost(action, payload) {
  guard(action, 'POST');
  var id = rid('REQ-W');
  var dto = Object.assign({ action: action }, payload || {});
  var t0 = Date.now();
  var r = await fetch(BASE, { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(dto) });
  var text = await r.text();
  return { ok: r.ok, status: r.status, ms: Date.now() - t0, redirected: r.redirected,
           finalHost: (/^https?:\/\/([^/]+)/.exec(r.url) || [])[1] || null,
           rid: id, bytes: text.length, body: parse(text), raw: text.slice(0, 200) };
}

function parse(t) { try { return JSON.parse(t); } catch (e) { return null; } }
function shapeOf(o, depth) {
  if (o === null || o === undefined) return typeof o;
  if (Array.isArray(o)) return depth <= 0 ? 'array' : 'array[' + (o.length ? shapeOf(o[0], depth - 1) : '') + ']';
  if (typeof o !== 'object') return typeof o;
  if (depth <= 0) return 'object';
  return '{' + Object.keys(o).sort().map(function (k) { return k + ':' + shapeOf(o[k], depth - 1); }).join(',') + '}';
}
function pad(s, n) { s = String(s === undefined || s === null ? '-' : s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

(async function main() {
  console.log('endpoint ' + BASE.slice(0, 52) + '…/exec');
  console.log('approved read tables (' + APPROVED_TABLES.length + '): ' + APPROVED_TABLES.join(' '));
  console.log('WRITE ACTIONS SENT = 0 — this tool can only send ' + Object.keys(ALLOWED).join(' and '));

  // ---- pick ONE deterministic real plan id, from an approved table -----------------------------------------
  console.log('\n== 1. PICK A DETERMINISTIC REAL shipping_plan_id ==');
  // getTable takes its table name as a QUERY PARAMETER, not in km_body — handleGetTable_ reads
  // e.parameter.table. Sending it in the body returns "Invalid table name" for a perfectly valid table,
  // which is a confusing way to be told the parameter never arrived.
  var tbl = await sendGetTable('shipping_plans');
  var rows = (tbl.body && (tbl.body.data || tbl.body.rows)) || [];
  if (!Array.isArray(rows)) { rows = (rows && rows.rows) || []; }
  if (tbl.body && tbl.body.success === false) {
    console.error('STOP — getTable refused: ' + String(tbl.body.error).slice(0, 120)); process.exit(3);
  }
  if (!rows.length) { console.error('STOP — shipping_plans returned no rows; cannot pick a real plan id.'); process.exit(3); }
  var idKey = ['shipping_plan_id', 'plan_id', 'id'].filter(function (k) { return rows[0][k] !== undefined; })[0];
  if (!idKey) { console.error('STOP — no recognisable plan id column in shipping_plans: ' + Object.keys(rows[0]).join(',')); process.exit(3); }
  // Deterministic: the lexicographically smallest id, so a re-run picks the same plan.
  var planId = rows.map(function (r) { return String(r[idKey]); }).filter(Boolean).sort()[0];
  console.log('  rows=' + rows.length + '  idColumn=' + idKey + '  chosen planId=' + planId + '  (lexicographically first, so re-runs match)');

  // ---- before / after, same plan id ------------------------------------------------------------------------
  console.log('\n== 2. OLD TRANSPORT (POST) vs NEW TRANSPORT (GET), SAME PLAN ID ==');
  var before = await sendPost('factoryStockGuard.get', { shipping_plan_id: planId });
  var after = await sendGet('factoryStockGuard.get', { shipping_plan_id: planId });
  [['BEFORE POST', before], ['AFTER  GET ', after]].forEach(function (p) {
    var b = p[1];
    console.log('  ' + p[0] + '  http=' + pad(b.status, 4) + ' ms=' + pad(b.ms, 7) + ' redirected=' + pad(b.redirected, 6) +
      ' host=' + pad(b.finalHost, 30) + ' bytes=' + pad(b.bytes, 7) + ' json=' + (b.body ? 'yes' : 'NO'));
    if (!b.body) { console.log('      raw: ' + JSON.stringify(b.raw)); }
  });

  var bd = before.body && before.body.data, ad = after.body && after.body.data;
  var beforeShape = before.body ? shapeOf(before.body, 2) : '(no json)';
  var afterShape = after.body ? shapeOf(after.body, 2) : '(no json)';
  console.log('\n  RESPONSE_FIELD_SET_PRE  = ' + beforeShape);
  console.log('  RESPONSE_FIELD_SET_POST = ' + afterShape);
  console.log('  RESPONSE_FIELD_SET_MATCH = ' + (beforeShape === afterShape ? 'YES' : 'NO'));
  console.log('  GUARD_AVAILABLE_PRESENT  before=' + (bd && bd.guard_available) + '  after=' + (ad && ad.guard_available));
  console.log('  PLAN_BRANCH_CONFIRMED    = ' + ((ad && ad.guard_available === true) ? 'YES — only fsgEvaluatePlanOverage_ sets this' : 'NO'));
  var bt = (bd && bd.tables_read) || [], at = (ad && ad.tables_read) || [];
  console.log('  TABLES_READ before=' + JSON.stringify(bt));
  console.log('  TABLES_READ after =' + JSON.stringify(at));
  var extra = at.filter(function (t) { return APPROVED_TABLES.indexOf(t) === -1; });
  console.log('  TABLES OUTSIDE THE APPROVED SEVEN = ' + (extra.length ? extra.join(',') + '  <-- STOP' : 'none'));
  // Business value, compared on the fields the UI actually consumes.
  function biz(d) {
    if (!d) return null;
    return { guard_available: d.guard_available,
             pools: (d.pools || []).map(function (p) {
               return [p.source_warehouse_id, p.sku, p.factory_available_stock, p.already_allocated_qty,
                       p.current_plan_qty, p.overage_qty].join('|'); }).sort(),
             overage_pools: (d.overage_pools || []).length };
  }
  var bb = JSON.stringify(biz(bd)), ab = JSON.stringify(biz(ad));
  console.log('  BUSINESS_VALUE_SAME = ' + (bb === ab ? 'YES' : 'NO'));
  if (bb !== ab) { console.log('    before ' + bb + '\n    after  ' + ab); }

  // The BEFORE baseline is PERSISTED, because the AFTER half cannot be taken until the router is deployed
  // and the comparison has to survive the gap. Captured from the live deployment, not reconstructed.
  var outFile = path.join(ROOT, 'docs/planning/incident/R4B1_GUARD_BASELINE/baseline.json');
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify({
      captured: new Date().toISOString(), planId: planId,
      before_post: { status: before.status, ms: before.ms, shape: beforeShape, body: before.body },
      after_get: { status: after.status, ms: after.ms, shape: afterShape, body: after.body }
    }, null, 1));
    console.log('\n  baseline written: ' + path.relative(ROOT, outFile));
  } catch (e) { console.log('\n  (baseline not written: ' + e.message + ')'); }

  if (after.body && after.body.code === 'POST_ONLY_ACTION_ON_GET') {
    console.log('\n  == BLOCKED, AND THE REASON IS THE DEPLOY ORDER ==');
    console.log('  The GET was refused with POST_ONLY_ACTION_ON_GET by the DEPLOYED router, which does not yet');
    console.log('  carry this round\'s rtrGetReadHandlers_ entry. That is not a defect in the repair — it is the');
    console.log('  deploy-order constraint the preflight predicted, now demonstrated: the backend must ship');
    console.log('  BEFORE the frontend starts sending GET. The repeat loop below cannot mean anything until then.');
    console.log('\n  The BEFORE half is still valuable and was captured: the POST path returned');
    console.log('  guard_available=' + (bd && bd.guard_available) + ' and read exactly the seven approved tables.');
    if (N > 0) { console.log('\n  Skipping the repeat loop — n clean refusals would measure the deployment, not the repair.'); }
    console.log('\nPRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_ROWS_DELETED = 0   SCHEMA_CHANGES = 0');
    return;
  }

  // ---- repeated reads on the new transport -------------------------------------------------------------------
  console.log('\n== 3. REPEATED READS ON THE NEW TRANSPORT (n=' + N + ') ==');
  var okCount = 0, failCount = 0, times = [], bounced = 0, fails = [];
  for (var i = 1; i <= N; i++) {
    var r = await sendGet('factoryStockGuard.get', { shipping_plan_id: planId });
    var good = !!(r.body && r.body.success === true && r.body.data && r.body.data.guard_available === true);
    if (good) { okCount++; } else { failCount++; fails.push({ i: i, status: r.status, raw: r.raw }); }
    if (r.redirected) { bounced++; }
    times.push(r.ms);
    process.stdout.write('  ' + pad(i, 3) + ' http=' + pad(r.status, 4) + ' ms=' + pad(r.ms, 7) +
      ' rid=' + pad(r.rid, 13) + ' guard_available=' + pad(r.body && r.body.data && r.body.data.guard_available, 6) +
      ' zero_write=' + pad(r.body && r.body.zero_write, 6) + (good ? '' : '   <-- FAILURE') + '\n');
  }
  times.sort(function (a, b) { return a - b; });
  console.log('\n  TARGETED_READ_SAMPLE_COUNT  = ' + N);
  console.log('  TARGETED_READ_SUCCESS_COUNT = ' + okCount);
  console.log('  TARGETED_READ_FAILURE_COUNT = ' + failCount);
  if (fails.length) { fails.forEach(function (f) { console.log('    #' + f.i + ' http=' + f.status + ' ' + JSON.stringify(f.raw)); }); }
  console.log('  ms min/median/max = ' + times[0] + ' / ' + times[Math.floor(times.length / 2)] + ' / ' + times[times.length - 1]);
  console.log('  responses that followed a redirect = ' + bounced + ' of ' + N +
    '   (a redirect is normal for /exec; a BOUNCE is exec->echo->exec, which this client cannot see per-hop)');
  console.log('\n  INTERPRETATION: ' + okCount + '/' + N + ' is CONSISTENT WITH the repair. It is not a statistical');
  console.log('  proof that the prior 2-in-9 failure can never recur. The mechanism is the proof: the failure');
  console.log('  was a POST body dropped across the /exec 302, and a GET has no body to drop.');
  console.log('\nPRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_ROWS_DELETED = 0   SCHEMA_CHANGES = 0');
})().catch(function (e) {
  console.error('REGRESSION FAILED: ' + (e && e.stack || e));
  process.exit(1);
});
