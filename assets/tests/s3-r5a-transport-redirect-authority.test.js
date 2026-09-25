// =================================================================================================================
// S3-R5A — TRANSPORT REDIRECT AUTHORITY, ENDPOINT STABILITY, AND THE CONCURRENCY COUNTER.
//
// WHAT THIS ROUND WAS RAISED TO FIND, AND DID NOT FIND.
//
// Production reported REDIRECT_TARGET_NOT_FOUND sixteen times in fifty requests, with HTTP 404 from
// script.googleusercontent.com/macros/echo and the source EXPIRED_USERCONTENT_REDIRECT. The hypothesis was the
// obvious one: something persists that single-use redirect target and re-requests it after it has expired.
//
// Driven through the REAL transport with an injected fetch, that hypothesis is false. Every attempt — first and
// recovery alike — is built from the canonical script.google.com/macros/s/<id>/exec. The googleusercontent host
// is never stored, never re-requested and never returned as a next target, and `classifyEndpoint` refuses it as
// an endpoint outright. The recovery is bounded to exactly one extra attempt. Section A proves each of those by
// executing the shipped code rather than by reading it, because a comment saying a URL is never reused is
// exactly the kind of claim that stops being true without anyone noticing.
//
// A NEGATIVE RESULT IS A RESULT. What it means is that the production 404 family is not a client endpoint-
// authority defect, so no amount of transport repair will remove it, and the next round must look at why the
// platform's redirect target is expiring before the browser can read it — which is a backend-pressure question,
// not a URL-authority one.
//
// WHAT WAS FOUND, AND IT IS THE INSTRUMENT.
//
// `peakConcurrentRequests()` counted only requests dispatched by km-transport's own `run()`. Everything that
// leaves through `_kmFetchBounded_` in the db-api — system.health, getTable, every gap read, every write — was
// invisible to it. Measured in a browser on a four-route navigation: four requests open at once, three
// reported. The production capture this round was raised on says peak_concurrent_requests = 7, and every
// acceptance criterion about bounded concurrency was going to be read against that number. Seven was a floor.
//
// The repair is a counter, not a behaviour: `openExternal()` in the transport, called by the one other
// dispatcher. Section E executes it. No request is shared, delayed, retried or cancelled by this round.
//
// WRITES ARE UNTOUCHED, and section D asserts that as an obligation rather than as a description: the
// production "Pricing Confirm reported 404 and the database had changed" case needs write identity and a
// receipt before any replay can be safe, and this round adds none.
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
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const TP = require(path.join(ROOT, 'assets/js/api/km-transport.js'));
const TPSRC = read('assets/js/api/km-transport.js');
const DBSRC = read('assets/js/api/operation-system-db-api.js');

const CANONICAL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTEST/exec';
const ECHO_HOST = 'https://script.googleusercontent.com/macros/echo?user_content_key=';

/** The platform's answer when the single-use echo target has already been consumed or has expired. */
function expiredRedirect(key) {
  return {
    status: 404, redirected: true, url: ECHO_HOST + key,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve('<!doctype html><html><head><title>Error 404 (Not Found)</title></head><body>'
      + '<h1>Sorry, unable to open the file at this time.</h1><p>Please check the address and try again.</p></body></html>')
  };
}
function jsonAnswer(body) {
  return {
    status: 200, redirected: true, url: ECHO_HOST + 'FRESH',
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body))
  };
}
const GOOD = { success: true, data: { rows: [] }, meta: {}, errors: [] };

/** One transport instance with a scripted backend and a virtual clock. Nothing here waits in real time. */
function world(script, factory) {
  const F = factory || TP;
  const seen = [];
  let t = 0;
  const tp = F.create({
    baseUrl: CANONICAL,
    frontendOrigin: 'https://example.github.io',
    now: () => t,
    random: () => 0.5,
    sleep: (ms) => { t += ms; return Promise.resolve(); },
    retryBaseMs: 400, retryCapMs: 2000, readTimeoutMs: 60000, writeTimeoutMs: 90000,
    fetch: (url, init) => {
      seen.push({ url: String(url), method: (init && init.method) || 'GET' });
      return script(seen.length, String(url));
    }
  });
  return { tp, seen, clock: { get t() { return t; }, add: (n) => { t += n; } } };
}
const hostsOf = (seen) => seen.map((s) => (/^https?:\/\/([^/]+)/.exec(s.url) || [])[1] || '(none)');

(async function () {

  // ===============================================================================================================
  section('A — EXECUTED: the expired redirect target is never the next request');
  // ===============================================================================================================
  {
    const w = world((n) => Promise.resolve(n === 1 ? expiredRedirect('AAA') : jsonAnswer(GOOD)));
    const res = await w.tp.request({ action: 'getTable', kind: 'read', requestId: 'REQ-A1', payload: { table: 'campaign_sku_lines' } });
    eq(w.seen.length, 2, 'A1  an expired redirect costs exactly TWO physical attempts — one recovery, not a loop');
    eq(hostsOf(w.seen), ['script.google.com', 'script.google.com'],
      'A2  and BOTH go to the canonical Web App host — the expired target is never re-requested');
    ok(w.seen.every((s) => s.url.indexOf(CANONICAL) === 0),
      'A2a every attempt is rebuilt from the canonical /exec, not from anything the response said');
    ok(res.success === true, 'A3  the recovery succeeds and the caller gets its data');
    const m = w.tp.metrics();
    eq([m.requests, m.retries, m.recoveries], [1, 1, 1],
      'A4  ONE logical request, ONE retry, ONE recovery — counted and nameable');
  }
  {
    // The production shape: the recovery lands on an expired target too. It must stop, not escalate.
    const w = world((n) => Promise.resolve(expiredRedirect(n === 1 ? 'AAA' : 'BBB')));
    const res = await w.tp.request({ action: 'getTable', kind: 'read', requestId: 'REQ-A5', payload: {} });
    eq(w.seen.length, 2, 'A5  a recovery that ALSO expires stops at two attempts — RECOVERY_STORM = 0');
    eq(res.code, 'REDIRECT_TARGET_NOT_FOUND', 'A6  and the caller is told the truth, not a laundered empty result');
    eq(res.details.html_source, 'EXPIRED_USERCONTENT_REDIRECT',
      'A7  with the SOURCE named, which is what separates this 404 from a business 404');
    ok(res.details.zero_write === true, 'A8  and stated to have written nothing');
  }
  {
    // §2 — the durable authority. A googleusercontent URL offered AS an endpoint is refused before the network.
    const c = TP.classifyEndpoint(ECHO_HOST + 'ZZZ', { frontendOrigin: 'https://example.github.io' });
    ok(c.ok === false, 'A9  classifyEndpoint REFUSES the echo host as an endpoint — it can never become authority');
    ok(/google/i.test(String(c.endpointClass)) || String(c.endpointClass).length > 0,
      'A9a and says which class it refused it as', c.endpointClass);
    ok(!/root\.KM\.transport\.setEndpoint|function setEndpoint|_endpointCache|_lastGoodEndpoint/.test(decomment(TPSRC)),
      'A10 there is NO endpoint cache, no last-good endpoint and no setter — the URL is derived every request');
  }

  // ===============================================================================================================
  section('B — the retry policy is bounded, and a timeout is not part of it');
  // ===============================================================================================================
  {
    ok(TP.isAutoRetryable({ kind: 'read', code: 'REDIRECT_TARGET_NOT_FOUND' }) === true,
      'B1  a redirect-target 404 is auto-retryable for a READ');
    ok(TP.isAutoRetryable({ kind: 'read', code: 'REQUEST_TIMEOUT' }) === false,
      'B2  a REQUEST_TIMEOUT is NOT — the bound already elapsed, so asking again only doubles the wait');
    ok(TP.isAutoRetryable({ kind: 'write', code: 'REDIRECT_TARGET_NOT_FOUND' }) === false,
      'B3  and a WRITE is never auto-retried, whatever the code');
  }
  {
    // §7 — a timeout costs the caller ONE budget, not two. Asserted by execution because the timer is created
    // per attempt, which is exactly the shape that would silently double if the code were ever made retryable.
    const w = world((n) => n === 1 ? new Promise(() => {}) : Promise.resolve(jsonAnswer(GOOD)));
    const p = w.tp.request({ action: 'skuDetails.workspace.get', kind: 'read', requestId: 'REQ-B4', payload: {} });
    const res = await p;
    eq(w.seen.length, 1, 'B4  an unanswered read is ONE physical attempt — the recovery never consumes a second budget');
    eq(res.code, 'REQUEST_TIMEOUT', 'B5  and settles as a timeout rather than hanging');
  }

  // ===============================================================================================================
  section('C — the recovery replaces the failed request, it does not run beside it');
  // ===============================================================================================================
  {
    const w = world((n) => Promise.resolve(n === 1 ? expiredRedirect('AAA') : jsonAnswer(GOOD)));
    const before = w.tp.peakConcurrentRequests();
    await w.tp.request({ action: 'getTable', kind: 'read', requestId: 'REQ-C1', payload: {} });
    eq(w.tp.peakConcurrentRequests(), Math.max(before, 1),
      'C1  a recovered request never has two attempts open at once — DUPLICATE_RECOVERY_REQUESTS = 0');
    eq(w.tp.openRequests(), 0, 'C2  and nothing is left open when it settles — no orphaned slot');
  }

  // ===============================================================================================================
  section('D — WRITE SAFETY FREEZE (§12): nothing here gained an automatic replay');
  // ===============================================================================================================
  {
    const w = world(() => Promise.resolve(expiredRedirect('AAA')));
    const res = await w.tp.request({ action: 'pricing.update', kind: 'write', requestId: 'REQ-D1', payload: {} });
    eq(w.seen.length, 1, 'D1  a WRITE that meets an expired redirect is dispatched exactly ONCE');
    ok(res.success === false, 'D2  and fails rather than being retried into a possible double commit');
    const bare = decomment(TPSRC);
    ok(/if \(str\(o\.kind\) === 'write'\) return false;/.test(bare),
      'D3  the no-write-replay rule is still the first thing isAutoRetryable checks');
    ok(/REQUEST_TIMEOUT_WRITE_INDETERMINATE/.test(bare),
      'D4  and a lost write answer is still reported as INDETERMINATE, never as zero-write');
  }
  {
    // The round must not have touched the pricing write path at all. Asserted on the files, not on intent.
    const pricingTouched = /pricing\.update|pricingResolveEffective_|fxReconcile/.test(
      read('assets/js/api/km-transport.js'));
    ok(pricingTouched === false,
      'D5  km-transport names no pricing action — PRICING_WRITE_TRUTHFULNESS_TOUCHED = NO');
  }

  // ===============================================================================================================
  section('E — EXECUTED: the concurrency counter now counts the other dispatcher');
  // ===============================================================================================================
  {
    const tp = TP.create({ baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      fetch: () => Promise.resolve(jsonAnswer(GOOD)) });
    ok(typeof tp.openExternal === 'function', 'E1  the transport exposes openExternal for a dispatcher it does not own');
    eq(tp.openRequests(), 0, 'E2  nothing is open to begin with');
    const a = tp.openExternal(), b = tp.openExternal(), c = tp.openExternal();
    eq(tp.openRequests(), 3, 'E3  three external requests in flight are three open requests');
    eq(tp.peakConcurrentRequests(), 3, 'E4  and the peak sees them — the number production reports was a FLOOR');
    a(); b(); c();
    eq(tp.openRequests(), 0, 'E5  closing returns the count to zero');
    a(); a();
    eq(tp.openRequests(), 0, 'E6  close() is idempotent — a double close cannot drive the count negative');
    eq(tp.peakConcurrentRequests(), 3, 'E7  and the peak is a high-water mark, not a live count');
  }
  {
    // The counter must not invent requests: openExternal records no sample.
    const tp = TP.create({ baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      fetch: () => Promise.resolve(jsonAnswer(GOOD)) });
    const close = tp.openExternal();
    eq(tp.metrics().requests, 0, 'E8  openExternal counts concurrency and NOT requests — no double counting');
    close();
  }
  {
    // beginExternal, which does record a sample, must hold the counter for exactly the life of the request.
    const tp = TP.create({ baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      now: (function () { let t = 0; return () => (t += 5); }()),
      fetch: () => Promise.resolve(jsonAnswer(GOOD)) });
    const done = tp.beginExternal('system.health', 'read');
    eq(tp.openRequests(), 1, 'E9  beginExternal opens the counter');
    done(null, 120);
    eq(tp.openRequests(), 0, 'E10 and its done() closes it');
    eq(tp.metrics().requests, 1, 'E11 recording exactly one sample, as it always did');
  }
  {
    // The other dispatcher is wired up. This is a source assertion and is labelled as one: the db-api is a
    // browser global script with no module boundary, so it cannot be instantiated here the way the transport can.
    const bare = decomment(DBSRC);
    const fb = bare.slice(bare.indexOf('async function _kmFetchBounded_'), bare.indexOf('async function _kmFetchBounded_') + 2200);
    ok(/openExternal/.test(fb), 'E12 _kmFetchBounded_ asks the shared transport to open the counter');
    ok(/finally \{[\s\S]{0,400}_closeOpen/.test(fb),
      'E13 and closes it in a finally, so an aborted or throwing request cannot leak a slot');
    ok(/typeof _tpOpen\.openExternal === 'function'/.test(fb),
      'E14 guarded on the function existing, so an older transport simply leaves the counter alone');
  }

  // ===============================================================================================================
  section('F — the health probe has ONE owner, and this round did not change it');
  // ===============================================================================================================
  // §5 says not to optimise a deliberate health check without proving duplication. Duplication was NOT proven:
  // measured in a browser, entering Weekly Shipping Plan twice issued one probe each time, sequentially. So the
  // owner count is asserted and nothing is deduplicated. If a later round proves concurrent duplication, the
  // transport's metadata latch already names system.health and is the place to do it.
  {
    const owners = (decomment(read('assets/js/pages/shipping-plan.js')).match(/checkPageDeploymentContract/g) || []).length;
    ok(owners >= 1, 'F1  Weekly Shipping Plan is a caller of the page deployment gate');
    const pages = fs.readdirSync(path.join(ROOT, 'assets/js/pages'))
      .filter((f) => f.endsWith('.js'))
      .filter((f) => /checkPageDeploymentContract|checkDeploymentContract/.test(decomment(read('assets/js/pages/' + f))));
    eq(pages, ['shipping-plan.js'],
      'F2  and the ONLY one — HEALTH_PROBE_OWNER_COUNT = 1, so 14 probes is 14 page reads, not a fan-out', pages);
    ok(/'system\.health': 1/.test(TPSRC),
      'F3  the transport metadata latch already names system.health, for the round that proves it needs it');
  }

  // ===============================================================================================================
  section('J — MUTANTS');
  // ===============================================================================================================
  // The probe returns TRUTHY when it OBSERVES the mutant's wrong behaviour. It is the detector, not the contract.
  {
    let caught = 0; const survived = [];
    /** Rebuild the transport module from mutated source, so a mutant is a real module and not a patched object. */
    function build(src) {
      // `{ exports: {} }`, NOT null. The module's UMD header assigns only `if (typeof module !== 'undefined'
      // && module.exports)`, so a null exports is falsy and every mutant came back as an empty object — which
      // this harness then reported as seven surviving mutants rather than as its own failure to build one.
      const shim = { exports: {} };
      // eslint-disable-next-line no-new-func
      new Function('module', 'window', src)(shim, undefined);
      return shim.exports;
    }
    async function mutant(id, why, anchor, repl, probe) {
      if (TPSRC.indexOf(anchor) === -1) { fail++; console.log('  FAIL ' + id + ' HARNESS ERROR — anchor not found'); return; }
      let saw = false;
      try { saw = !!(await probe(build(TPSRC.replace(anchor, repl)))); } catch (e) { saw = false; }
      if (saw) { caught++; pass++; console.log('  ok   ' + id + ' ' + why + ' (caught)'); }
      else { survived.push(id); fail++; console.log('  FAIL ' + id + ' ' + why + ' — MUTANT SURVIVED'); }
    }

    // J1 — the recovery starts from the URL the response came back on. This is the defect the round went
    //      looking for, planted deliberately so the suite can prove it would have been caught.
    await mutant('J1', 'the recovery re-requests the expired redirect target',
      '        return Promise.race([Promise.resolve().then(function () { return _fetch(url, init); }), expiry])',
      '        return Promise.race([Promise.resolve().then(function () { return _fetch(_lastFinalUrl || url, init); }), expiry])',
      async function (M) {
        // The mutant needs somewhere to have stashed the final URL; give it one, the way a careless fix would.
        const src2 = TPSRC
          .replace('    function request(opts) {', '    var _lastFinalUrl = null;\n    function request(opts) {')
          .replace('            var finalUrl = str(resp.url);', '            var finalUrl = str(resp.url); _lastFinalUrl = finalUrl;')
          .replace('        return Promise.race([Promise.resolve().then(function () { return _fetch(url, init); }), expiry])',
                   '        return Promise.race([Promise.resolve().then(function () { return _fetch(_lastFinalUrl || url, init); }), expiry])');
        const shim = { exports: {} };
        // eslint-disable-next-line no-new-func
        new Function('module', 'window', src2)(shim, undefined);
        const w = world((n) => Promise.resolve(n === 1 ? expiredRedirect('AAA') : jsonAnswer(GOOD)), shim.exports);
        await w.tp.request({ action: 'getTable', kind: 'read', requestId: 'REQ-J1', payload: {} });
        return hostsOf(w.seen).indexOf('script.googleusercontent.com') !== -1;
      });

    // J2 — the bounded recovery becomes unbounded. RECOVERY_STORM, planted.
    await mutant('J2', 'the read retry cap is lifted, so a repeating 404 becomes a storm',
      'var maxRetries = (kind === \'write\') ? 0 : ((typeof opts.maxRetries === \'number\') ? Math.max(0, Math.min(1, opts.maxRetries)) : 1);',
      'var maxRetries = (kind === \'write\') ? 0 : ((typeof opts.maxRetries === \'number\') ? opts.maxRetries : 12);',
      async function (M) {
        const w = world(() => Promise.resolve(expiredRedirect('AAA')), M);
        await w.tp.request({ action: 'getTable', kind: 'read', requestId: 'REQ-J2', payload: {} });
        return w.seen.length > 2;
      });

    // J3 — a WRITE becomes auto-retryable. The one mutation §12 exists to forbid.
    //
    // TWO LINES, because the ban is enforced twice and either one alone still blocks the replay: the policy
    // predicate refuses a write outright, and the dispatcher caps a write at zero retries. That redundancy is
    // the point — it is why a single careless edit cannot produce a double commit — so the mutant has to be
    // the careless edit that removes BOTH, which is what "make writes recover like reads" would look like.
    await mutant('J3', 'a write is automatically replayed after a redirect 404',
      "    if (str(o.kind) === 'write') return false;",
      '    if (false) return false;',
      async function (M0) {
        const src2 = TPSRC
          .replace("    if (str(o.kind) === 'write') return false;", '    if (false) return false;')
          .replace("var maxRetries = (kind === 'write') ? 0 :", "var maxRetries = (kind === 'write') ? 1 :");
        const shim = { exports: {} };
        // eslint-disable-next-line no-new-func
        new Function('module', 'window', src2)(shim, undefined);
        const w = world((n) => Promise.resolve(n === 1 ? expiredRedirect('AAA') : jsonAnswer(GOOD)), shim.exports);
        await w.tp.request({ action: 'pricing.update', kind: 'write', requestId: 'REQ-J3', payload: {} });
        return w.seen.length > 1;
      });

    // J4 — a timeout becomes auto-retryable, so one slow read costs the caller two full budgets.
    //
    // THE REFUSAL IS THE ONLY LINE THAT DECIDES, and finding that out took two wrong mutants. Deleting it
    // changes nothing, because the predicate ends in `return false`. Adding REQUEST_TIMEOUT to the allowlist
    // below it changes nothing either, because the refusal sits above and returns first. So the timeout rule is
    // guarded from both directions, and the single edit that actually flips it is turning the refusal into an
    // acceptance — which is exactly what "let a timeout retry, the page sometimes needs a second try" looks
    // like when someone writes it.
    await mutant('J4', 'the timeout refusal is turned into an acceptance',
      '    if (code === CODES.REQUEST_TIMEOUT) return false;',
      '    if (code === CODES.REQUEST_TIMEOUT) return true;',
      async function (M) {
        if (M.isAutoRetryable({ kind: 'read', code: 'REQUEST_TIMEOUT' }) !== true) return false;
        // And prove it costs a second budget rather than merely reporting differently.
        const w = world((n) => n === 1 ? new Promise(() => {}) : Promise.resolve(jsonAnswer(GOOD)), M);
        await w.tp.request({ action: 'getTable', kind: 'read', requestId: 'REQ-J4', payload: {} });
        return w.seen.length > 1;
      });

    // J5 — the external counter stops counting. The defect this round repaired, planted back.
    await mutant('J5', 'openExternal stops holding the counter, so the other dispatcher is invisible again',
      '        _openRequests += 1;\n        if (_openRequests > _peakConcurrent) _peakConcurrent = _openRequests;\n        var closed = false;',
      '        var closed = false;',
      async function (M) {
        const tp = M.create({ baseUrl: CANONICAL, frontendOrigin: 'https://x.github.io', fetch: () => Promise.resolve(jsonAnswer(GOOD)) });
        tp.openExternal(); tp.openExternal();
        return tp.peakConcurrentRequests() < 2;
      });

    // J6 — close() loses its idempotence, so a double close makes the open count negative and the next peak wrong.
    await mutant('J6', 'a double close drives the open count negative',
      '        return function close() { if (closed) return; closed = true; _openRequests -= 1; };',
      '        return function close() { _openRequests -= 1; };',
      async function (M) {
        const tp = M.create({ baseUrl: CANONICAL, frontendOrigin: 'https://x.github.io', fetch: () => Promise.resolve(jsonAnswer(GOOD)) });
        const c = tp.openExternal(); c(); c();
        return tp.openRequests() < 0;
      });

    // J7 — the echo host becomes an acceptable endpoint.
    //
    // Again not by deletion: with the branch gone the host simply fails the script.google.com test and lands on
    // FOREIGN_HOST, which still refuses. The mutation that matters is the one that says yes — "the redirect
    // target works, so let it be the endpoint", which is precisely the misunderstanding this round set out to
    // test for and did not find in the shipped code.
    await mutant('J7', 'the googleusercontent redirect target is classified as a usable endpoint',
      "      return out(ENDPOINT_CLASS.USERCONTENT_REDIRECT,",
      "      return out(ENDPOINT_CLASS.STABLE_EXEC, '') || out(ENDPOINT_CLASS.USERCONTENT_REDIRECT,",
      async function (M) {
        const c = M.classifyEndpoint(ECHO_HOST + 'ZZZ', { frontendOrigin: 'https://x.github.io' });
        return c.ok === true;
      });

    console.log('\n  mutants caught ' + caught + (survived.length ? '  SURVIVED: ' + survived.join(', ') : ''));
  }

  console.log('\n' + new Array(101).join('='));
  console.log('S3-R5A TRANSPORT REDIRECT AUTHORITY — passed ' + pass + '  failed ' + fail);
  console.log('USERCONTENT_REDIRECT_PERSISTED = NO · USERCONTENT_REDIRECT_REUSED = NO');
  console.log('EXPIRED_REDIRECT_REUSE_REACHABLE = NO · REDIRECT_RECOVERY_MAX_ATTEMPTS = 1');
  console.log('RECOVERY_STORM = 0 · DUPLICATE_RECOVERY_REQUESTS = 0 · WRITE_AUTOREPLAY_ADDED = NO');
  console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · DEPLOYMENTS=0');
  console.log(new Array(101).join('='));
  process.exit(fail ? 1 : 0);
}()).catch((e) => { console.log('HARNESS ERROR ' + ((e && e.stack) || e)); process.exit(1); });
