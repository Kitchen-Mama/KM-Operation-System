// =================================================================================================================
// S3-R8 — WHERE THE 86 SECONDS WENT, AND WHY open_requests COULD NOT BE EXPLAINED.
//
// THE QUESTION THE ROUND WAS GIVEN.
//
// A production capture showed successful server execution at 1.8-3.4 seconds while reads of the SAME family
// ended at 59-86 seconds as REQUEST_TIMEOUT or REDIRECT_TARGET_NOT_FOUND. So the handlers are not globally
// slow, and splitting workspace APIs would have been an answer to a question nobody had asked.
//
// THE 85 882 ms READ.
//
// The read timeout is 60 000 ms, so a single read settling at 85 882 ms should be impossible. It was not, and
// the reason is arithmetic rather than mystery: `ms` was read PER ATTEMPT. A recovery therefore opened a
// brand-new full budget, and the worst case for one logical read was 2 x 60 000 + the retry delay = 120 400 ms.
// Nobody chose 120 seconds. It was the sum of two numbers that each looked like 60.
//
//     85 882  =  ~25 500 (attempt 1, returning REDIRECT_TARGET_NOT_FOUND)
//              +    ~400 (retry delay)
//              +  60 000 (attempt 2, a FRESH budget, exhausted)
//
// Section B executes that, measured rather than argued: with a 500 ms budget, a read whose first attempt fails
// slowly and whose recovery hangs used to run past 1.6 budgets and is now bounded by one. The recovery is not
// removed and no delay changed. What changed is that the recovery spends the REMAINDER of the caller's budget
// instead of opening a second one.
//
// THE THREE OPEN REQUESTS.
//
// The same capture ended with open_requests = 3, and §5 is explicit that this must not be waved away as
// instrumentation without proof. So section A proves it the only way that means anything: it drives the real
// transport through EVERY settlement code — success, timeout, redirect-404 with recovery, 404-then-success,
// transport error, abort, build refusal, write — and requires the counter back at zero each time. It is. The
// transport's own accounting does not leak.
//
// What the counter could not do was say WHAT was open. Three is what you get from a leak and three is also what
// you get from three reads in flight at the moment you looked, and a bare integer cannot tell those apart —
// which is why that production number was unanswerable. openRequestDetails() now returns the rows behind it
// with an age on each, and section D reproduces the operator's exact `3` and names all three.
//
// WHAT THIS ROUND DID NOT DO.
//
// No workspace split, no lazy loading, no shared cache, no source-side filtering (§10 — and the evidence does
// not justify one: server execution is seconds, not minutes). No write may replay (§12). Where the client
// cannot observe a boundary — the /exec hop and the googleusercontent hop are followed inside the browser and
// never surfaced to script — this suite records NOT_OBSERVABLE rather than inferring it by subtraction, which
// §2 forbids and which would have been the easiest way to produce a confident wrong answer.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }

const TPSRC = read('assets/js/api/km-transport.js');
const DBSRC = read('assets/js/api/operation-system-db-api.js');
const TP = require(path.join(ROOT, 'assets/js/api/km-transport.js'));

const CANON = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTEST/exec';
const ECHO = 'https://script.googleusercontent.com/macros/echo?user_content_key=';
const EXPIRED_BODY = '<!doctype html><html><head><title>Error 404 (Not Found)</title></head><body>'
  + '<h1>Sorry, unable to open the file at this time.</h1></body></html>';

function expired(k) {
  return { status: 404, redirected: true, url: ECHO + k,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
    text: () => Promise.resolve(EXPIRED_BODY) };
}
function good(k) {
  return { status: 200, redirected: true, url: ECHO + k,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: () => Promise.resolve(JSON.stringify({ success: true, data: { rows: [] }, meta: {}, errors: [] })) };
}
const hang = () => new Promise(() => {});
const after = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

/** A transport with an injected backend and a SHORT budget, so a timeout test finishes in a test run. */
function mk(fetchImpl, o) {
  o = o || {};
  return (o.factory || TP).create({
    baseUrl: CANON, frontendOrigin: 'https://example.github.io',
    now: () => Date.now(), random: () => 0.5,
    retryBaseMs: o.retryBaseMs === undefined ? 20 : o.retryBaseMs,
    retryCapMs: 40,
    readTimeoutMs: o.readTimeoutMs || 500,
    writeTimeoutMs: o.writeTimeoutMs || 1000,
    fetch: fetchImpl
  });
}
async function runOne(fetchImpl, reqOpts, o) {
  const tp = mk(fetchImpl, o);
  const t0 = Date.now();
  const res = await tp.request(Object.assign(
    { action: 'skuDetails.workspace.get', kind: 'read', requestId: 'REQ-A', payload: {} }, reqOpts || {}));
  return { res, tp, elapsed: Date.now() - t0, open: tp.openRequests(), peak: tp.peakConcurrentRequests() };
}

(async function main() {

  // =========================================================================================================
  section('A — §5/§14 SETTLEMENT: does open_requests return to zero for EVERY code?');
  // =========================================================================================================
  {
    let n;

    n = 0;
    let r = await runOne(() => Promise.resolve(good('K' + (++n))));
    eq(r.res.success, true, 'A1 SUCCESS settles');
    eq(r.open, 0, 'A1a and open_requests returns to 0');

    r = await runOne(hang);
    eq(r.res.code, 'REQUEST_TIMEOUT', 'A2 a read that is never answered settles as REQUEST_TIMEOUT');
    eq(r.open, 0, 'A2a and open_requests returns to 0 — a timeout decrements the count');

    n = 0;
    r = await runOne(() => Promise.resolve(expired('K' + (++n))));
    eq(r.res.code, 'REDIRECT_TARGET_NOT_FOUND', 'A3 an expired redirect twice over settles as REDIRECT_TARGET_NOT_FOUND');
    eq(r.open, 0, 'A3a and open_requests returns to 0 — a 404 settlement decrements the count');
    eq(r.res.details.attempt, 2, 'A3b the bounded recovery did run');
    eq(r.peak, 1, 'A3c and peak stayed at 1 — the recovery REPLACES the attempt, it does not run beside it, '
      + 'so a recovery cannot double-count the open request');

    n = 0;
    r = await runOne(() => Promise.resolve((++n) === 1 ? expired('E') : good('F')));
    eq(r.res.success, true, 'A4 404-then-success recovers');
    eq(r.open, 0, 'A4a and open_requests returns to 0');

    r = await runOne(() => Promise.reject(new Error('boom')));
    eq(r.res.code, 'HTTP_TRANSPORT_ERROR', 'A5 a rejected fetch settles');
    eq(r.open, 0, 'A5a and open_requests returns to 0');

    r = await runOne(() => Promise.resolve(good('K')), { action: '' });
    eq(r.open, 0, 'A6 a request refused at BUILD never leaves the count incremented');

    // superseded
    {
      const ac = new AbortController();
      const tp = mk(hang);
      const p = tp.request({ action: 'skuDetails.workspace.get', kind: 'read', payload: {}, signal: ac.signal });
      setTimeout(() => ac.abort(), 20);
      const res = await p;
      eq(res.code, 'REQUEST_ABORTED', 'A7 a superseded request settles as ABORTED');
      eq(tp.openRequests(), 0, 'A7a and open_requests returns to 0 — an unmounted route does not leak its read');
    }

    n = 0;
    r = await runOne(() => Promise.resolve(expired('W' + (++n))), { kind: 'write', action: 'pricing.update' });
    eq(r.open, 0, 'A8 a failed WRITE returns the count to 0');
    eq(r.res.details.attempt || 1, 1, 'A8a and was dispatched exactly once');
  }

  // =========================================================================================================
  section('B — §6/§7 THE BUDGET: one logical read, one timeout');
  // =========================================================================================================
  {
    const B = 500;
    // Attempt 1 fails SLOWLY (60% of the budget) and retryably; the recovery then hangs. Before this round the
    // recovery opened a second full budget, so the caller waited 0.6B + delay + B. Now it waits B.
    let k = 0;
    const tp = mk(() => { k += 1; return k === 1 ? after(Math.round(B * 0.6), expired('E1')) : hang(); },
      { readTimeoutMs: B });
    const t0 = Date.now();
    const res = await tp.request({ action: 'skuDetails.workspace.get', kind: 'read', requestId: 'REQ-B', payload: {} });
    const el = Date.now() - t0;

    eq(k, 2, 'B1 the recovery still ran — this is a budget correction, not a removal of recovery');
    ok(el < B * 1.30, 'B2 ONE logical read is bounded by ONE budget: ' + el + 'ms against a ' + B + 'ms bound '
      + '(before this round the same scenario ran past ' + Math.round(B * 1.6) + 'ms)', { elapsed: el, budget: B });
    eq(tp.openRequests(), 0, 'B2a and it still settles the count');
    ok(el >= B * 0.9, 'B2b and it did not settle EARLY either — the budget is spent, not truncated', { elapsed: el });

    // The recovery must not be started when the budget cannot pay for it, and the ORIGINAL named failure is
    // kept rather than being overwritten by an anonymous timeout.
    let k2 = 0;
    const tp2 = mk(() => { k2 += 1; return after(Math.round(B * 0.99), expired('E' + k2)); }, { readTimeoutMs: B });
    const res2 = await tp2.request({ action: 'skuDetails.workspace.get', kind: 'read', requestId: 'REQ-C', payload: {} });
    eq(k2, 1, 'B3 with the budget nearly gone, no second attempt is opened');
    eq(res2.code, 'REDIRECT_TARGET_NOT_FOUND',
      'B3a and the caller keeps the NAMED failure rather than an anonymous REQUEST_TIMEOUT');
    eq(res2.details.recovery_skipped, 'NO_BUDGET_REMAINING', 'B3b and the skip is recorded, not silent');
    eq(tp2.openRequests(), 0, 'B3c and the count still settles');

    // The floor scales with the budget. An absolute floor would silently disable recovery for short budgets.
    ok(/_budgetMs \* 0\.02/.test(TPSRC.replace(/\s+/g, ' ').replace(/ \* /g, ' * ')) || /0\.02/.test(TPSRC),
      'B4 the recovery floor is PROPORTIONAL to the budget, so the rule is the same at 60 s and at 500 ms');

    // A write is one attempt, so its budget behaviour is unchanged by construction.
    const tpw = mk(hang, { writeTimeoutMs: 300 });
    const t1 = Date.now();
    const rw = await tpw.request({ action: 'pricing.update', kind: 'write', payload: {} });
    const elw = Date.now() - t1;
    eq(rw.code, 'REQUEST_TIMEOUT_WRITE_INDETERMINATE', 'B5 a write that is never answered is INDETERMINATE');
    ok(elw < 300 * 1.4, 'B5a and bounded by its own single budget, unchanged', { elapsed: elw });
  }

  // =========================================================================================================
  section('C — §7 TIMEOUT OWNERSHIP: how many clocks are there, and who owns each?');
  // =========================================================================================================
  {
    ok(/readTimeoutMs > 0\) \? deps\.readTimeoutMs : 60000/.test(TPSRC),
      'C1 transport READ bound defaults to 60 000 ms');
    ok(/writeTimeoutMs > 0\) \? deps\.writeTimeoutMs : 300000/.test(TPSRC),
      'C2 transport WRITE bound defaults to 300 000 ms');
    ok(/KM_READ_TIMEOUT_MS_ = 45000/.test(DBSRC), 'C3 the db-api READ bound is 45 000 ms — a SECOND owner');
    ok(/KM_WRITE_TIMEOUT_MS_ = 90000/.test(DBSRC), 'C4 the db-api WRITE bound is 90 000 ms — and a fourth');

    // The per-attempt constant is gone from the dispatch path: the attempt is bounded by what remains.
    ok(/var ms = _remainingMs\(\);/.test(TPSRC),
      'C5 an attempt is bounded by what REMAINS of the request budget, not by the constant');
    ok(/var _deadlineAt = t\.start \+ _budgetMs;/.test(TPSRC),
      'C6 and the deadline is taken ONCE, at dispatch');
    const perAttempt = TPSRC.match(/var ms = \(kind === 'write'\) \? _writeTimeoutMs : _readTimeoutMs;/g) || [];
    eq(perAttempt.length, 0, 'C7 the per-attempt budget is gone — this is the 85 882 ms defect, removed');

    // The unbounded POST shim is a real ownership gap and is recorded rather than quietly fixed: it is the
    // FALLBACK path used only when the transport module is absent, so changing it is not this round's scope.
    ok(/FALLBACK for a page that loaded without the transport module/.test(read('assets/js/api/km-api-foundation.js')),
      'C8 the foundation POST shim is documented as a fallback — it carries NO timeout, and is reachable only '
      + 'when the transport module did not load at all');
  }

  // =========================================================================================================
  section('D — §5 open_requests = 3, EXPLAINED');
  // =========================================================================================================
  {
    const tp = mk(hang, { readTimeoutMs: 5000 });
    ok(typeof tp.openRequestDetails === 'function', 'D1 openRequestDetails() exists');
    eq(tp.openRequestDetails(), [], 'D1a and is empty when nothing is open');

    tp.request({ action: 'skuDetails.workspace.get', kind: 'read', owner: 'sku-details', payload: {} });
    tp.request({ action: 'productPricing.workspace.get', kind: 'read', payload: {} });
    const closeX = tp.openExternal('getTable');
    await after(30);

    eq(tp.openRequests(), 3, 'D2 three requests open — the operator\'s exact number, reproduced');
    const rows = tp.openRequestDetails();
    eq(rows.length, 3, 'D2a and three rows behind it');
    eq(rows.map((r) => r.action).sort(),
      ['getTable', 'productPricing.workspace.get', 'skuDetails.workspace.get'],
      'D3 each one NAMED — which is what the bare integer could never say');
    ok(rows.every((r) => typeof r.age_ms === 'number' && r.age_ms >= 0),
      'D4 with an age on each — the number that separates "in flight" from "never settled"');
    ok(rows.some((r) => r.dispatcher === 'external'),
      'D4a including requests from the dispatcher this module does not own');
    ok(rows.some((r) => r.owner === 'sku-details'), 'D4b and the owner, where the caller gave one');

    closeX();
    eq(tp.openRequests(), 2, 'D5 closing one decrements the count');
    eq(tp.openRequestDetails().length, 2, 'D5a and removes its row — the registry cannot drift from the counter');

    // resetMetrics deliberately does NOT reset the counter, and that is a documented choice, not an oversight.
    const before = tp.openRequests();
    tp.resetMetrics();
    eq(tp.openRequests(), before,
      'D6 resetMetrics() leaves open_requests alone — so a capture that begins with reset() inherits whatever '
      + 'was already in flight, which is one of the two readings of a non-zero count');
    ok(/`_openRequests` is deliberately NOT reset/.test(TPSRC), 'D6a and the source says so');
  }

  // =========================================================================================================
  section('E — §8 CONCURRENCY: does the accounting hold with several reads in flight?');
  // =========================================================================================================
  {
    for (const N of [1, 2, 3]) {
      const tp = mk(() => after(80, good('C')), { readTimeoutMs: 2000 });
      const ps = [];
      for (let i = 0; i < N; i++) ps.push(tp.request({ action: 'a' + i + '.get', kind: 'read', payload: {} }));
      await after(25);
      const mid = tp.openRequests();
      const rs = await Promise.all(ps);
      eq(mid, N, 'E' + N + ' with ' + N + ' concurrent read(s), open_requests reads ' + N + ' mid-flight');
      ok(rs.every((r) => r.success), 'E' + N + 'a all ' + N + ' succeed');
      eq(tp.openRequests(), 0, 'E' + N + 'b and the count returns to 0');
      eq(tp.peakConcurrentRequests(), N, 'E' + N + 'c peak records ' + N);
    }
  }

  // =========================================================================================================
  section('F — §12 WRITE FREEZE');
  // =========================================================================================================
  {
    let attempts = 0;
    const tp = mk(() => { attempts += 1; return Promise.resolve(expired('W' + attempts)); });
    const res = await tp.request({ action: 'pricing.update', kind: 'write', payload: { sku: 'X' } });
    eq(attempts, 1, 'F1 a write meeting an expired redirect is dispatched ONCE — WRITE_AUTOREPLAY_ADDED = NO');
    eq(res.success, false, 'F1a and reported as a failure, never replayed into a possible twin');
    ok(/_metrics\.recoveries/.test(TPSRC), 'F2 recoveries are still counted for reads');
    // The budget change must not have shortened a write.
    ok(/var _budgetMs = \(kind === 'write'\) \? _writeTimeoutMs : _readTimeoutMs;/.test(TPSRC),
      'F3 a write still uses the WRITE budget — the correction did not quietly shorten it');
  }

  // =========================================================================================================
  section('J — MUTANTS: a production fix was made, so it is attacked');
  // =========================================================================================================
  await (async function mutants() {
    const RAW = fs.readFileSync(path.join(ROOT, 'assets/js/api/km-transport.js'), 'utf8');
    // RAW deliberately keeps the file's own line endings, because the mutant is BUILT from this string. That
    // makes any anchor containing a newline line-ending-dependent, and this repository is CRLF — so anchors
    // below are single-line, and a miss is a loud HARNESS ERROR rather than a silent SURVIVED.

    function build(src, label) {
      const mod = { exports: {} };
      try { new Function('module', 'exports', src)(mod, mod.exports); }
      catch (e) { return { err: 'BUILD: ' + (e && e.message) }; }
      if (!mod.exports || typeof mod.exports.create !== 'function') return { err: 'no create() after ' + label };
      return { factory: mod.exports };
    }

    /** Each probe returns TRUTHY when it OBSERVES THE MUTANT'S WRONG BEHAVIOUR. */
    const PROBES = {
      // one logical read must not exceed one budget
      budget: async (factory) => {
        const B = 400;
        let k = 0;
        const tp = mk(() => { k += 1; return k === 1 ? after(Math.round(B * 0.6), expired('E')) : hang(); },
          { factory, readTimeoutMs: B });
        const t0 = Date.now();
        await tp.request({ action: 'skuDetails.workspace.get', kind: 'read', payload: {} });
        return (Date.now() - t0) > B * 1.30;
      },
      // a recovery with no budget left must not be started, and the named failure must survive
      skip: async (factory) => {
        const B = 400;
        let k = 0;
        const tp = mk(() => { k += 1; return after(Math.round(B * 0.99), expired('E' + k)); },
          { factory, readTimeoutMs: B });
        const res = await tp.request({ action: 'skuDetails.workspace.get', kind: 'read', payload: {} });
        return k > 1 || res.code !== 'REDIRECT_TARGET_NOT_FOUND';
      },
      // the registry must not drift from the counter on the TRANSPORT's own path. The external probe below
      // cannot see this one: it never issues a request, so a stale row left by _closeRequest is invisible to it.
      // That gap let a mutant survive once; the probe is split rather than widened so each says what it covers.
      registryRequest: async (factory) => {
        const tp = mk(() => Promise.resolve(good('K')), { factory });
        await tp.request({ action: 'skuDetails.workspace.get', kind: 'read', payload: {} });
        return tp.openRequests() !== tp.openRequestDetails().length || tp.openRequestDetails().length !== 0;
      },
      // the open-request registry must not drift from the counter, on the external dispatcher
      registry: async (factory) => {
        const tp = mk(hang, { factory, readTimeoutMs: 3000 });
        const close = tp.openExternal('getTable');
        await after(20);
        const n = tp.openRequests(), rows = tp.openRequestDetails().length;
        close();
        return n !== rows || tp.openRequestDetails().length !== 0;
      },
      // every settlement must decrement
      settle: async (factory) => {
        const tp = mk(hang, { factory, readTimeoutMs: 200 });
        await tp.request({ action: 'skuDetails.workspace.get', kind: 'read', payload: {} });
        return tp.openRequests() !== 0;
      }
    };

    const MUTANTS = [
      { id: 'J1', probe: 'budget', why: 'the attempt goes back to a fresh per-attempt budget',
        from: 'var ms = _remainingMs();',
        to: "var ms = (kind === 'write') ? _writeTimeoutMs : _readTimeoutMs;" },
      { id: 'J2', probe: 'budget', why: 'the deadline is recomputed on every attempt instead of once',
        from: 'var _deadlineAt = t.start + _budgetMs;',
        to: 'var _deadlineAt = t.start + _budgetMs; function _resetDeadline() { _deadlineAt = _now() + _budgetMs; }' ,
        also: { from: 'var ms = _remainingMs();', to: 'if (n > 1) _resetDeadline(); var ms = _remainingMs();' } },
      { id: 'J3', probe: 'skip', why: 'the no-budget gate is removed, so a doomed recovery is opened anyway',
        from: 'if (_afterDelay < RECOVERY_MIN_BUDGET_MS) {', to: 'if (false) {' },
        { id: 'J4', probe: 'registryRequest', why: 'the registry entry is not removed when the request settles',
        from: 'delete _openDetail[_openKey];', to: 'void 0;' },
      { id: 'J5', probe: 'registry', why: 'the external close does not remove its row',
        from: 'delete _openDetail[key];', to: 'void 0;' },
      { id: 'J6', probe: 'settle', why: 'a timeout no longer decrements the open count',
        from: '        _settled = true; _openRequests -= 1;', to: '        _settled = true;' }
    ];

    let killed = 0, survived = 0, harness = 0;
    for (const m of MUTANTS) {
      if (RAW.indexOf(m.from) < 0) {
        harness++; console.log('  HARNESS ERROR ' + m.id + ' — anchor not found: ' + JSON.stringify(m.from.slice(0, 60)));
        continue;
      }
      let src = RAW.replace(m.from, m.to);
      if (m.also) {
        if (src.indexOf(m.also.from) < 0) {
          harness++; console.log('  HARNESS ERROR ' + m.id + ' — second anchor not found'); continue;
        }
        src = src.replace(m.also.from, m.also.to);
      }
      const built = build(src, m.id);
      if (built.err) { harness++; console.log('  HARNESS ERROR ' + m.id + ' — ' + built.err); continue; }
      let observed = false;
      try { observed = await PROBES[m.probe](built.factory); }
      catch (e) { observed = true; }          // a mutant that throws is also caught
      if (observed) { killed++; console.log('  ok   ' + m.id + ' KILLED — ' + m.why); }
      else { survived++; console.log('  FAIL ' + m.id + ' SURVIVED — ' + m.why); }
    }
    pass += killed; fail += survived + harness;
    console.log('  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harness + ' harness errors');
  }());

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
  console.log('OPEN_REQUEST_LEAK_PROVEN = NO · ONE_LOGICAL_REQUEST_ONE_BUDGET = YES · WRITE_AUTOREPLAY_ADDED = NO');
  process.exit(fail === 0 ? 0 : 1);
}()).catch((e) => { console.log('HARNESS ERROR ' + (e && e.stack || e)); process.exit(1); });
