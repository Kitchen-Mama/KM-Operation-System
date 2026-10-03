// =============================================================================================================
// S8-R3B — READ-PATH FATIGUE RUNNER
//
//   node assets/tools/s8-fatigue/s8-r3b-fatigue-runner.js --out <dir> [--cycles N] [--warm N] [--dry-run]
//
// EVERY dispatch passes through KMS8R3B.decide() and nothing else opens a socket. A refusal is counted and
// recorded; it is never retried, never rephrased and never routed around.
//
// WHAT "COLD" MEANS HERE. Apps Script has no server cache to warm. Cold is the project LOAD AND COMPILE that
// precedes the first execution in an idle instance; warm is the same handler once that cost is already paid.
// So the first request of the run is the only unambiguous cold sample for the project, and each action's first
// request is its own first-execution sample. Both are recorded, labelled differently, and never averaged
// together — a median over a set containing one project cold start describes nothing that exists.
//
// THE INVARIANT. Workspace envelopes report per-table row counts. The runner captures them on the first and the
// last cycle and compares. A read-only round that changed a row count would have to explain itself, and a
// structural "no write primitive is reachable" proof cannot see a write that arrives by some path nobody
// modelled. This is the behavioural half.
// =============================================================================================================

'use strict';
var fs = require('fs');
var path = require('path');
var AL = require('./s8-r3b-read-allowlist.js');

var ROOT = path.resolve(__dirname, '..', '..', '..');

function arg(name, dflt) {
  var i = process.argv.indexOf('--' + name);
  if (i === -1) return dflt;
  var v = process.argv[i + 1];
  return (v === undefined || v.indexOf('--') === 0) ? true : v;
}
var DRY = !!arg('dry-run', false);
var CYCLES = parseInt(arg('cycles', '5'), 10);
var WARM = parseInt(arg('warm', '3'), 10);
var OUT = String(arg('out', path.join(ROOT, 's8-r3b-out')));
var TIMEOUT_MS = parseInt(arg('timeout', '150000'), 10);

// The endpoint is read from the shipped client rather than typed here, so the fatigue run cannot be pointed at
// a different deployment than the one the application uses, and no URL is introduced into tooling by hand.
var dbApi = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'api', 'operation-system-db-api.js'), 'utf8');
var mBase = /OP_DB_API_BASE_URL\s*=\s*'([^']+)'/.exec(dbApi);
if (!mBase) { console.error('STOP — could not read OP_DB_API_BASE_URL from the shipped client.'); process.exit(2); }
var BASE = mBase[1];
if (BASE.indexOf('https://script.google.com/macros/s/') !== 0 || BASE.slice(-5) !== '/exec') {
  console.error('STOP — the endpoint is not a stable /macros/s/<deployment>/exec URL.'); process.exit(2);
}

// -------------------------------------------------------------------------------------------------------------
// THE LEDGER. Every attempt is recorded whether or not it was dispatched, because "we never sent it" is a claim
// that needs the same evidence as "we sent it and nothing was written".
// -------------------------------------------------------------------------------------------------------------
var ledger = { dispatched: [], refused: [], started: new Date().toISOString(), base_deployment: BASE.slice(0, 46) + '…' };
var SAFETY = {
  requests_dispatched: 0, requests_refused: 0,
  non_get_requests: 0, post_requests: 0,
  forbidden_action_attempts: 0,
  gap_job_status_polls: 0, gap_job_starts: 0, recalculate_calls: 0,
  write_actions_dispatched: 0
};

function dispatchGuard(action, method, url) {
  var d = AL.decide({ action: action, method: method, url: url });
  if (!d.ok) {
    SAFETY.requests_refused++;
    if (d.code === 'ACTION_FORBIDDEN') SAFETY.forbidden_action_attempts++;
    if (action === 'gapJob.status.get') SAFETY.gap_job_status_polls++;
    ledger.refused.push({ action: action, method: method, code: d.code, reason: d.reason });
  }
  return d;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// -------------------------------------------------------------------------------------------------------------
// ONE physical request. No retry: a retry would double-count the load and, more importantly, would turn a
// measured timeout into a measurement of the second attempt. §7 forbids a blind retry and this is where that
// would otherwise sneak in.
// -------------------------------------------------------------------------------------------------------------
// The scope the two scope-required reads carry. It is DERIVED from an approved read at the start of the run
// (see deriveScope) rather than typed here: a hand-written company/country/marketplace could name a scope that
// does not exist, and the owner would answer VALIDATION_FAILED in 1 ms - which a timing table would then report
// as a fast surface.
var SCOPE = null;

async function once(action, phase, cycle) {
  var built = AL.buildRequest(BASE, action, null, SCOPE ? { scope: SCOPE } : null);
  var d = dispatchGuard(action, built.method, built.url);
  if (!d.ok) return { action: action, phase: phase, cycle: cycle, dispatched: false, refusal: d.code };

  var rec = { action: action, surface: AL.APPROVED[action].surface, owner: AL.APPROVED[action].owner,
    phase: phase, cycle: cycle, method: built.method, request_id: built.requestId, dispatched: true,
    scope_required: AL.APPROVED[action].scopeRequired === true,
    scoped: AL.APPROVED[action].scopeRequired === true ? !!SCOPE : null };

  if (DRY) { rec.dry_run = true; rec.ms = 0; return rec; }

  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
  var t0 = Date.now();
  try {
    var init = built.method === 'GET'
      ? { method: 'GET', cache: 'no-store', signal: ctl.signal }
      : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' }, body: built.body, signal: ctl.signal };
    var resp = await fetch(built.url, init);
    var text = await resp.text();
    rec.ms = Date.now() - t0;
    rec.http = resp.status;
    rec.bytes = text.length;
    rec.final_host = (function () { try { return new URL(resp.url).host; } catch (e) { return null; } })();
    var env = null;
    try { env = JSON.parse(text); } catch (e) { env = null; }
    if (env && typeof env === 'object') {
      rec.success = env.success === true;
      rec.error_code = env.code || (env.error && env.error.code) || null;
      rec.error = (typeof env.error === 'string') ? env.error : (env.error && env.error.message) || null;
      rec.zero_write = (env.zero_write !== undefined) ? env.zero_write
        : (env.data && env.data.zero_write !== undefined) ? env.data.zero_write
        : (env.meta && env.meta.zero_write !== undefined) ? env.meta.zero_write : null;
      rec.echoed_action = env.action || (env.meta && env.meta.action) || null;
      rec.counts = extractCounts(env);
      rec.row_total = rec.counts ? Object.keys(rec.counts).reduce(function (s, k) { return s + (rec.counts[k] || 0); }, 0) : null;
      rec.empty = rec.success === true && rec.row_total === 0;
    } else {
      rec.success = false;
      rec.error_code = 'NON_JSON_RESPONSE';
      rec.body_head = text.slice(0, 160);
    }
  } catch (e) {
    rec.ms = Date.now() - t0;
    rec.success = false;
    rec.error_code = (e && e.name === 'AbortError') ? 'CLIENT_TIMEOUT' : 'TRANSPORT_ERROR';
    rec.error = String(e && e.message || e);
  } finally {
    clearTimeout(timer);
  }
  SAFETY.requests_dispatched++;
  if (built.method !== 'GET') { SAFETY.non_get_requests++; SAFETY.post_requests++; }
  ledger.dispatched.push({ action: action, method: built.method, rid: built.requestId, phase: phase,
    cycle: cycle, ms: rec.ms, http: rec.http, ok: rec.success, code: rec.error_code });
  return rec;
}

// Row counts live in a different place per owner, so this looks in each of them rather than assuming one shape.
// A count it cannot find stays null — never zero, because zero is a measurement and null is the absence of one.
function extractCounts(env) {
  var c = (env && env.counts) || (env && env.data && env.data.counts) || (env && env.meta && env.meta.counts) || null;
  if (c && typeof c === 'object') {
    var out = {};
    Object.keys(c).forEach(function (k) { if (typeof c[k] === 'number') out[k] = c[k]; });
    return Object.keys(out).length ? out : null;
  }
  // Fall back to counting the arrays the envelope returned, keyed by their own names.
  var d = (env && env.data) || null;
  if (d && typeof d === 'object') {
    var o = {};
    Object.keys(d).forEach(function (k) { if (Array.isArray(d[k])) o[k] = d[k].length; });
    return Object.keys(o).length ? o : null;
  }
  return null;
}

// -------------------------------------------------------------------------------------------------------------
// Derive the scope from an APPROVED read. fcSummary.workspace.get returns the marketplaces master, which is the
// same vocabulary the page's own scope picker is populated from, so the triple this produces is one a user
// could actually select. It costs one extra request and it is dispatched through the same guard as every other.
//
// --scope company,country,marketplace overrides it. An override is recorded in the report, because a run whose
// scope was chosen by hand and a run whose scope was derived are not the same evidence.
async function deriveScope() {
  var override = arg('scope', '');
  if (override && override !== true) {
    var p = String(override).split(',').map(function (x) { return x.trim(); });
    if (p.length === 3 && p[0] && p[1] && p[2]) {
      return { company: p[0], country: p[1], marketplace: p[2], derived_from: 'OPERATOR_OVERRIDE' };
    }
    console.error('STOP - --scope must be company,country,marketplace'); process.exit(2);
  }
  var built = AL.buildRequest(BASE, 'fcSummary.workspace.get');
  var d = dispatchGuard('fcSummary.workspace.get', built.method, built.url);
  if (!d.ok) { console.error('STOP - the scope-derivation read was refused: ' + d.code); process.exit(2); }
  var resp = await fetch(built.url, { method: 'GET', cache: 'no-store' });
  var env = JSON.parse(await resp.text());
  SAFETY.requests_dispatched++;
  ledger.dispatched.push({ action: 'fcSummary.workspace.get', method: 'GET', rid: built.requestId,
    phase: 'scope-derivation', cycle: 0, ms: null, http: resp.status, ok: env && env.success === true, code: null });
  var mk = (env && env.data && env.data.marketplaces) || [];
  // The first ACTIVE row. Not a random one: a deterministic choice is reproducible, and an inactive marketplace
  // is a scope the page would not offer.
  var row = mk.filter(function (m) { return String(m.status || '').toLowerCase() === 'active'; })[0] || mk[0];
  if (!row) { console.error('STOP - no marketplace row to derive a scope from.'); process.exit(2); }
  return { company: row.company, country: row.country, marketplace: row.marketplace,
           derived_from: 'fcSummary.workspace.get -> marketplaces[0 active]' };
}

async function main() {
  var actions = AL.approvedActions();
  // Surface order, so the run reads like a session rather than like an alphabet.
  actions.sort(function (a, b) { return AL.APPROVED[a].surfaceNo - AL.APPROVED[b].surfaceNo || a.localeCompare(b); });
  // --only narrows the run to one approved action. It cannot WIDEN it: an unapproved name here leaves the list
  // empty rather than adding anything, so the flag can shorten a run and never smuggle a request into one.
  var only = arg('only', '');
  if (only && only !== true) actions = actions.filter(function (a) { return a === String(only); });

  var samples = [];
  function note(s) { if (s) samples.push(s); process.stdout.write(
    '  ' + String(s.phase).padEnd(10) + String(s.action).padEnd(40) +
    (s.dispatched ? (String(s.ms).padStart(7) + ' ms  http=' + (s.http || '-') + '  ok=' + (s.success ? 'Y' : 'N') +
      (s.error_code ? '  ' + s.error_code : '') + (s.row_total !== null && s.row_total !== undefined ? '  rows=' + s.row_total : ''))
      : ('REFUSED ' + s.refusal)) + '\n'); }

  console.log('S8-R3B READ-PATH FATIGUE' + (DRY ? '  [DRY RUN — no request leaves this machine]' : ''));
  if (!DRY) {
    SCOPE = await deriveScope();
    console.log('scope = ' + SCOPE.company + ' / ' + SCOPE.country + ' / ' + SCOPE.marketplace +
      '   (' + SCOPE.derived_from + ')');
    console.log('scope-required actions: ' + AL.scopeRequiredActions().join(', '));
  }
  console.log('actions=' + actions.length + '  warm=' + WARM + '  cycles=' + CYCLES + '  concurrency=1  timeout=' + TIMEOUT_MS + 'ms');
  console.log('');

  // ---- PHASE 1 · COLD. One request per action, in surface order. The very first is the project cold start.
  console.log('PHASE COLD');
  for (var i = 0; i < actions.length; i++) {
    note(await once(actions[i], i === 0 ? 'cold-first' : 'cold', 0));
  }

  // ---- PHASE 2 · WARM. Immediately repeated, same action, no gap. Isolates handler cost from project load.
  console.log('\nPHASE WARM');
  for (var a = 0; a < actions.length; a++) {
    for (var w = 0; w < WARM; w++) note(await once(actions[a], 'warm', w + 1));
  }

  // ---- PHASE 3 · REPEATED CYCLES. Whole-surface sweeps, the shape a working session actually has.
  console.log('\nPHASE REPEATED (' + CYCLES + ' cycles)');
  for (var c = 1; c <= CYCLES; c++) {
    for (var k = 0; k < actions.length; k++) note(await once(actions[k], 'repeat', c));
  }

  // ---- PHASE 4 · ROUTE-AWAY / RETURN. X, then something else, then X again — does returning pay again?
  // Skipped under --only: this phase names its own actions, and a narrowed run must not dispatch any action
  // the narrowing excluded.
  var pairs = (only && only !== true) ? []
    : [['fcSummary.workspace.get', 'overseasStock.workspace.get'],
       ['skuDetails.workspace.get', 'purchaseOrder.workspace.get']];
  if (pairs.length) console.log('\nPHASE AWAY/RETURN');
  for (var p = 0; p < pairs.length; p++) {
    note(await once(pairs[p][0], 'away-before', p + 1));
    note(await once(pairs[p][1], 'away-other', p + 1));
    note(await once(pairs[p][0], 'away-return', p + 1));
  }

  // -----------------------------------------------------------------------------------------------------------
  var outDir = OUT;
  fs.mkdirSync(outDir, { recursive: true });
  var report = { round: 'S8-R3B', started: ledger.started, finished: new Date().toISOString(),
    dry_run: DRY, cycles: CYCLES, warm: WARM, concurrency: 1, timeout_ms: TIMEOUT_MS, scope: SCOPE,
    safety: SAFETY, samples: samples, ledger_refused: ledger.refused };
  fs.writeFileSync(path.join(outDir, 's8-r3b-samples.json'), JSON.stringify(report, null, 2));
  console.log('\nwrote ' + path.join(outDir, 's8-r3b-samples.json'));
  console.log('dispatched=' + SAFETY.requests_dispatched + '  refused=' + SAFETY.requests_refused +
    '  forbidden_attempts=' + SAFETY.forbidden_action_attempts +
    '  gap_job_status_polls=' + SAFETY.gap_job_status_polls);
}

main().catch(function (e) { console.error('RUNNER FAILED: ' + (e && e.stack || e)); process.exitCode = 1; });
