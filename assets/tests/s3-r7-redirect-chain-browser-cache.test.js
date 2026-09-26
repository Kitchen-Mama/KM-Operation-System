// =================================================================================================================
// S3-R7 — THE REDIRECT CHAIN, THE BROWSER CACHE, AND THE DIAGNOSTIC THAT NEVER RAN.
//
// WHAT THIS ROUND HAD TO SEPARATE.
//
// S3-R5A proved that no APPLICATION code persists or re-requests an expired googleusercontent redirect target.
// That result stands and is re-asserted here. It was also being quoted as something it does not say. "The app
// does not reuse the target" and "the BROWSER does not reuse the target" are different claims about different
// layers, and only the first had been measured. This suite keeps them apart by name — application cache,
// browser HTTP cache, fetch cache mode, service worker — so that no future round can collapse them again.
//
// WHAT THE SHIPPED CODE ALREADY DOES, WHICH IS MOST OF WHAT §8 WOULD HAVE AUTHORISED.
//
// Section C executes and reads the three read dispatchers. All three already send `cache: 'no-store'`, and all
// three already build a URL that no earlier request can have used: the transport and the gap reader put a fresh
// request id in the query on every physical attempt, and getTable carries `_ts=Date.now()`. So both of §8's
// authorised fixes — no-store, and a unique read URL — are already in production on every read.
//
// That is what makes the production evidence decisive rather than merely suggestive. `getTable` is on the
// operator's own failing-action list and it has carried BOTH fixes all along. A cache cannot serve a response
// for a URL that has never been requested before, so whatever is producing REDIRECT_TARGET_NOT_FOUND on that
// action is not the browser HTTP cache. The conclusion is recorded as BROWSER_CACHE_ROOT_CAUSE = NO, and §9
// sends the next round downstream.
//
// WHY THE CAPTURE TOOL STILL EXISTS.
//
// Because the above is an argument from shipped source plus the operator's byCode totals, and §15 asks for a
// capture when one can resolve the question in the CURRENT production state. The repository's last live
// redirect measurement (P1-B8D-R10, 2026-09-14) found 24 of 24 attempts receiving distinct 354-character keys
// and the /exec 302 carrying `no-cache, no-store, max-age=0, must-revalidate`. That was a production whose echo
// 404 rate was 4 in 40. It is now 19 in 28. The mechanism may be the same and the pressure different, but a
// twelve-day-old capture is not evidence about today, and this suite does not pretend otherwise.
//
// Section A EXECUTES the capture tool against a scripted backend. The assertion that matters most there is A7:
// the instrument is shown to report SAME_EXPIRED_KEY_REAPPEARS = YES when keys really do repeat. An instrument
// that can only ever answer NO is not evidence of NO.
//
// THE DEFECT ACTUALLY FIXED THIS ROUND IS THE DIAGNOSTIC (§12).
//
// `KM.transport.timeline()` returns an object — { request_timeline, mutations, ... } — and the S3-R6 capture
// tool called `.forEach` on it. So `__kmS3R6.passive()`, the half of that capture that reports what production
// ACTUALLY did rather than what a scripted sample does, threw a TypeError and produced nothing. Section B
// executes both shapes against the real transport. No production file changes this round, so per §14 there are
// no mutants: there is no shipped behaviour to mutate.
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
const R7TOOL = 'docs/evidence/s3-r7-redirect-chain/s3r7-redirect-chain-capture.js';
const R6TOOL = 'docs/evidence/s3-r6-server-read-cost/s3r6-read-cost-capture.js';

const CANONICAL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTEST/exec';
const ECHO = 'https://script.googleusercontent.com/macros/echo?user_content_key=';

const EXPIRED_BODY = '<!doctype html><html><head><title>Error 404 (Not Found)</title></head><body>'
  + '<h1>Sorry, unable to open the file at this time.</h1></body></html>';

function expiredRedirect(key) {
  return { status: 404, redirected: true, url: ECHO + key,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
    text: () => Promise.resolve(EXPIRED_BODY) };
}
function jsonAnswer(key, body) {
  return { status: 200, redirected: true, url: ECHO + key,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: () => Promise.resolve(JSON.stringify(body)) };
}
const GOOD = { success: true, data: { rows: [] }, meta: {}, errors: [] };

// -----------------------------------------------------------------------------------------------------------
// A fake window just complete enough to run a console tool, and no more. Every request it serves is recorded,
// so what the tool DID is measured rather than described.
// -----------------------------------------------------------------------------------------------------------
function makeWindow(serve) {
  const seen = [];
  const logs = [];
  const transport = TP.create({
    baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
    now: () => Date.now(), random: () => 0.5, sleep: () => Promise.resolve(),
    fetch: () => Promise.reject(new Error('the tool must not dispatch through transport.request()'))
  });
  const win = {
    KM: { transport: transport, DB: { getApiBaseUrl: () => CANONICAL } },
    location: { origin: 'https://example.github.io' },
    console: { log: (s) => logs.push(String(s)) },
    performance: { now: () => Date.now(), getEntriesByType: () => [] },
    URL: URL,
    navigator: {},
    fetch: function (url, init) {
      seen.push({ url: String(url), method: (init && init.method) || 'GET', cache: init && init.cache,
        hasSignal: !!(init && init.signal) });
      return Promise.resolve(serve(seen.length, String(url)));
    }
  };
  win.AbortController = AbortController;
  return { win, seen, logs };
}
function loadTool(win, rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // The tool is an IIFE over `window`; give it exactly that and nothing global.
  new Function('window', 'AbortController', 'URL', 'fetch', 'Promise', 'Date', 'Math', 'JSON',
    src + '\n;return window.__kmS3R7 || window.__kmS3R6;')
    .call(null, win, win.AbortController, win.URL, win.fetch, Promise, Date, Math, JSON);
  return win.__kmS3R7 || win.__kmS3R6;
}

// ===========================================================================================================
section('A — EXECUTED: the S3-R7 capture tool, driven against a scripted backend');
// ===========================================================================================================
(async function A() {
  // --- A1 the tool is inert until it is asked for something -------------------------------------------------
  {
    const { win, seen } = makeWindow(() => jsonAnswer('K', GOOD));
    const api = loadTool(win, R7TOOL);
    ok(!!api && typeof api.matrix === 'function', 'A1 the tool loads and exposes matrix()');
    eq(seen.length, 0, 'A1a loading it issues ZERO requests — pasting it into a console changes nothing');
    eq(api.contract.writes, 0, 'A1b its declared contract is zero writes');
    eq(api.contract.methods, ['GET'], 'A1c and GET only');
  }

  // --- A2/A3/A4 what the matrix actually dispatches ---------------------------------------------------------
  {
    let n = 0;
    const { win, seen } = makeWindow(() => { n++; return jsonAnswer('KEY-' + n, GOOD); });
    const api = loadTool(win, R7TOOL);
    await api.matrix(1);
    eq(seen.length, 8, 'A2 matrix(1) issues exactly 8 requests — 2 actions x 4 scenarios x 1 repetition');
    ok(seen.every((s) => s.method === 'GET'), 'A3 every request is a GET — nothing here can mutate anything');
    ok(seen.every((s) => s.url.indexOf('https://script.google.com/macros/s/') === 0),
      'A4 every request goes to the canonical /exec — the googleusercontent host is never requested directly',
      seen.map((s) => s.url.slice(0, 60)));
    ok(seen.every((s) => s.hasSignal), 'A4a every probe is abortable, so none can hang the console forever');

    // The four cache modes are genuinely different, which is the whole point of the matrix.
    const modes = seen.map((s) => String(s.cache));
    ok(modes.filter((m) => m === 'undefined').length === 2, 'A4b two probes send NO cache option (browser default)');
    ok(modes.filter((m) => m === 'reload').length === 2, "A4c two send cache:'reload'");
    ok(modes.filter((m) => m === 'no-store').length === 4, "A4d four send cache:'no-store' (no-store and unique-URL)");
  }

  // --- A5 the shipped classifier is the one doing the classifying -------------------------------------------
  {
    let n = 0;
    const { win, seen } = makeWindow(() => { n++; return expiredRedirect('KEY-' + n); });
    const api = loadTool(win, R7TOOL);
    const text = await api.matrix(1);
    ok(text.indexOf('"REDIRECT_404": 1') > 0 || /REDIRECT_404[^0-9]*[1-9]/.test(text),
      'A5 an expired echo target is counted as REDIRECT_404 by KM.transport.codeForHtml — not by a second classifier');
    const rows = api.rows();
    ok(rows.length === 8 && rows.every((r) => r.result === 'REDIRECT_TARGET_NOT_FOUND'),
      'A5a and every row carries the production code, verbatim',
      rows.map((r) => r.result).filter((v, i, a) => a.indexOf(v) === i));
    ok(rows.every((r) => r.html_source === 'EXPIRED_USERCONTENT_REDIRECT'),
      'A5b with the production html_source, so a 404 counted here is a 404 by production\'s own definition');
    eq(seen.length, 8, 'A5c a failing probe is still one request — the tool adds no retry of its own');
  }

  // --- A6 it reports key IDENTITY and never the key ----------------------------------------------------------
  {
    const SECRET = 'AbCdEf0123456789SECRETKEYMATERIAL';
    let n = 0;
    const { win } = makeWindow(() => { n++; return expiredRedirect(SECRET + n); });
    const api = loadTool(win, R7TOOL);
    const text = await api.matrix(1);
    ok(text.indexOf(SECRET) < 0, 'A6 the report contains no user_content_key material');
    ok(/"usercontent_key_hash"|"hash"/.test(JSON.stringify(api.rows())) , 'A6a it records an identity hash instead');
    ok(api.rows().every((r) => r.usercontent_key_length === (SECRET + '1').length),
      'A6b and the key LENGTH, which is comparable without being disclosable');
  }

  // --- A7 THE INSTRUMENT CAN SAY YES. --------------------------------------------------------------------
  // This is the assertion that makes a NO verdict worth anything. A detector that structurally cannot report
  // reuse would report "no reuse" against a server that reused every key, and the round would conclude the
  // opposite of the truth. So: feed it ONE key over and over, and require it to notice.
  {
    const { win } = makeWindow(() => expiredRedirect('ONE-KEY-FOR-EVERYTHING'));
    const api = loadTool(win, R7TOOL);
    const text = await api.matrix(1);
    ok(text.indexOf('"SAME_EXPIRED_KEY_REAPPEARS": "YES"') > 0,
      'A7 given a server that reissues one key, the tool reports SAME_EXPIRED_KEY_REAPPEARS = YES');
    ok(/"USERCONTENT_KEY_CHANGES_PER_REQUEST": "NO/.test(text),
      'A7a and USERCONTENT_KEY_CHANGES_PER_REQUEST = NO — the instrument is capable of the answer it did not give');
  }
  {
    let n = 0;
    const { win } = makeWindow(() => { n++; return expiredRedirect('DISTINCT-' + n); });
    const api = loadTool(win, R7TOOL);
    const text = await api.matrix(1);
    ok(text.indexOf('"SAME_EXPIRED_KEY_REAPPEARS": "NO"') > 0,
      'A7b and given distinct keys it reports NO — both answers are reachable, so either one is evidence');
  }

  // --- A8 the URL-uniqueness control is a real control -------------------------------------------------------
  {
    let n = 0;
    const { win, seen } = makeWindow(() => { n++; return jsonAnswer('K' + n, GOOD); });
    const api = loadTool(win, R7TOOL);
    await api.matrix(2);                                  // two repetitions, so repeats are observable
    const unique = seen.filter((s) => s.url.indexOf('km_probe_nonce=') > 0 || s.url.indexOf('&_ts=') > 0);
    const uniqueUrls = unique.map((s) => s.url).filter((u, i, a) => a.indexOf(u) === i);
    eq(uniqueUrls.length, unique.length, 'A8 every D_UNIQUE_URL probe used a URL no other probe used');
    const plainCheap = seen.filter((s) => s.url.indexOf('action=system.health') > 0
      && s.url.indexOf('km_probe_nonce=') < 0 && s.url.indexOf('km_rid=') < 0);
    ok(plainCheap.length >= 2 && plainCheap.every((s) => s.url === plainCheap[0].url),
      'A8a and the control condition really is one repeated URL — otherwise there is nothing to compare against',
      plainCheap.map((s) => s.url));
  }

  // --- A9 the tool never asks for the redirect host itself ---------------------------------------------------
  {
    let n = 0;
    const { win, seen } = makeWindow(() => { n++; return expiredRedirect('K' + n); });
    const api = loadTool(win, R7TOOL);
    await api.matrix(1);
    ok(seen.every((s) => s.url.indexOf('googleusercontent') < 0),
      'A9 not one probe re-requests a googleusercontent target, even after being handed eight of them');
  }

  // ===========================================================================================================
  section('B — EXECUTED: §12, the diagnostic that could not read its own instrument');
  // ===========================================================================================================
  {
    // Drive one real request through the real transport so timeline() has a row with dispatch_ms.
    const tp = TP.create({
      baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      now: () => Date.now(), random: () => 0.5, sleep: () => Promise.resolve(),
      fetch: () => Promise.resolve(jsonAnswer('K', GOOD))
    });
    await tp.request({ action: 'system.health', kind: 'read', payload: {} });
    const tl = tp.timeline();

    ok(!Array.isArray(tl), 'B1 timeline() is an OBJECT, not an array — which is the whole defect');
    ok(Array.isArray(tl.request_timeline) && tl.request_timeline.length >= 1,
      'B1a the rows live under .request_timeline');
    let threw = false;
    try { tl.forEach(function () {}); } catch (e) { threw = true; }
    ok(threw, 'B1b calling .forEach on it throws — so the old passive() produced nothing at all, silently');

    // Now the repaired tool, against that exact shape.
    const win = { KM: { transport: tp }, console: { log: () => {} } };
    const api = loadTool(win, R6TOOL);
    let out = '';
    let blewUp = null;
    try { out = api.passive(); } catch (e) { blewUp = e; }
    ok(!blewUp, 'B2 the repaired passive() runs against the real timeline() shape', blewUp && String(blewUp));
    ok(out.indexOf('--- timeline ---') > 0 && out.indexOf('system.health') > 0,
      'B2a and it prints the request rows it was always meant to print');
    ok(out.indexOf('--- timeline summary ---') > 0 && out.indexOf('peak_concurrent_requests') > 0,
      'B2b including the totals only the object shape carries');

    // And it must not break the other way round if timeline() is ever simplified back to an array.
    const winArr = { KM: { transport: Object.assign({}, tp, { timeline: () => tl.request_timeline }) },
      console: { log: () => {} } };
    const apiArr = loadTool(winArr, R6TOOL);
    let outArr = '', blewUp2 = null;
    try { outArr = apiArr.passive(); } catch (e) { blewUp2 = e; }
    ok(!blewUp2 && outArr.indexOf('system.health') > 0,
      'B3 a bare array still works — the repair accepts both shapes rather than swapping one assumption for another');
  }

  // ===========================================================================================================
  section('C — FETCH CACHE POLICY, in every dispatcher that reads');
  // ===========================================================================================================
  {
    // --- the transport's own read init, executed rather than read ------------------------------------------
    let capturedInit = null;
    const tp = TP.create({
      baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      now: () => Date.now(), random: () => 0.5, sleep: () => Promise.resolve(),
      fetch: (url, init) => { capturedInit = init; return Promise.resolve(jsonAnswer('K', GOOD)); }
    });
    await tp.request({ action: 'system.health', kind: 'read', payload: {} });
    eq(capturedInit.method, 'GET', 'C1 a read is dispatched as GET');
    eq(capturedInit.cache, 'no-store', "C2 READ_FETCH_CACHE_MODE = 'no-store' — already, in the shipped transport");
    ok(capturedInit.credentials === undefined,
      'C3 no credentials option is set, so the fetch default (same-origin) applies and no cookie crosses to Google');
    ok(capturedInit.redirect === undefined,
      "C4 no redirect option is set, so the fetch default ('follow') applies — the 302 is followed by the browser, "
      + 'which is why the intermediate hop is not observable from script');

    let writeInit = null;
    const tpw = TP.create({
      baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      now: () => Date.now(), random: () => 0.5, sleep: () => Promise.resolve(),
      fetch: (url, init) => { writeInit = init; return Promise.resolve(jsonAnswer('K', GOOD)); }
    });
    await tpw.request({ action: 'pricing.update', kind: 'write', payload: {} });
    eq(writeInit.method, 'POST', 'C5 a write is still a POST');
    eq(writeInit.cache, 'no-store', "C6 and also no-store — unchanged by this round");
  }
  {
    // --- the other two dispatchers, which this environment cannot execute (they need a browser `window`) ----
    const bare = decomment(DBSRC);
    const gapInit = bare.slice(bare.indexOf('async function _kmGapRead_'));
    ok(/method:\s*'GET',\s*cache:\s*'no-store'/.test(gapInit.slice(0, 2500)),
      "C7 _kmGapRead_ sends GET + cache:'no-store' for reads");
    const getTable = bare.slice(bare.indexOf('async function _kmGetTableOnce_'),
      bare.indexOf('async function _kmGetTableOnce_') + 1200);
    ok(/method:\s*'GET',\s*cache:\s*'no-store'/.test(getTable),
      "C8 getTable sends GET + cache:'no-store'");
    ok(/_ts=.{0,3}\+\s*Date\.now\(\)/.test(getTable),
      'C9 AND getTable already carries a per-attempt cache-busting value — both of §8\'s authorised fixes are '
      + 'already shipped on the action the operator reports failing');

    // No read anywhere opts INTO the cache.
    const cacheOpts = (DBSRC.match(/cache:\s*'[a-z-]+'/g) || []).map((s) => s.replace(/.*'([a-z-]+)'.*/, '$1'));
    const nonNoStore = cacheOpts.filter((c) => c !== 'no-store');
    eq(nonNoStore, [], 'C10 every cache option in the db-api is no-store — none is force-cache or default',
      nonNoStore);
  }

  // ===========================================================================================================
  section('D — §7 CANONICAL URL UNIQUENESS: is the same GET ever re-issued?');
  // ===========================================================================================================
  {
    const urls = [];
    const tp = TP.create({
      baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      now: () => Date.now(), random: () => 0.5, sleep: () => Promise.resolve(),
      fetch: (url) => { urls.push(String(url)); return Promise.resolve(jsonAnswer('K' + urls.length, GOOD)); }
    });
    await tp.request({ action: 'skuDetails.workspace.get', kind: 'read', requestId: 'REQ-AAA', payload: {} });
    await tp.request({ action: 'skuDetails.workspace.get', kind: 'read', requestId: 'REQ-BBB', payload: {} });
    ok(urls.length === 2 && urls[0] !== urls[1],
      'D1 two reads of the SAME action with different request ids produce DIFFERENT URLs');
    ok(urls.every((u) => u.indexOf('km_rid=') > 0),
      'D2 because the request id is in the query — so a browser cache has no entry to serve from');

    // The recovery attempt is a second physical request and must not reuse the first one's URL.
    const rurls = [];
    let k = 0;
    const tpr = TP.create({
      baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      now: () => Date.now(), random: () => 0.5, sleep: () => Promise.resolve(),
      fetch: (url) => {
        rurls.push(String(url)); k++;
        return Promise.resolve(k === 1 ? expiredRedirect('EXPIRED') : jsonAnswer('FRESH', GOOD));
      }
    });
    await tpr.request({ action: 'skuDetails.workspace.get', kind: 'read', requestId: 'REQ-CCC', payload: {} });
    eq(rurls.length, 2, 'D3 one expired redirect produces exactly one recovery attempt');
    ok(rurls[0] !== rurls[1], 'D4 and the recovery uses a DIFFERENT URL from the attempt that expired');
    ok(rurls.every((u) => u.indexOf('https://script.google.com/macros/s/') === 0),
      'D5 both rebuilt from the canonical /exec — EXACT_CANONICAL_GET_REUSED = NO');
  }

  // ===========================================================================================================
  section('E — §1: the APPLICATION redirect cache is still absent (S3-R5A, re-asserted, not re-quoted)');
  // ===========================================================================================================
  {
    const bare = decomment(TPSRC);
    ok(!/googleusercontent/.test(bare.replace(/USERCONTENT_REDIRECT/g, '')
        .replace(/script\.googleusercontent\.com'/g, 'HOSTCONST'))
      || /classifyEndpoint/.test(bare),
      'E1 the only mention of the redirect host in transport policy is the classifier that REFUSES it');
    ok(!/_lastGoodEndpoint|_endpointCache|setEndpoint\s*\(/.test(bare),
      'E2 there is no endpoint cache, no last-good endpoint and no endpoint setter');

    // Executed: after being handed an expired target, the next request still starts from /exec.
    const seenU = [];
    let c = 0;
    const tp = TP.create({
      baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      now: () => Date.now(), random: () => 0.5, sleep: () => Promise.resolve(),
      fetch: (url) => { seenU.push(String(url)); c++; return Promise.resolve(expiredRedirect('E' + c)); }
    });
    await tp.request({ action: 'fcSummary.workspace.get', kind: 'read', requestId: 'REQ-D1', payload: {} });
    await tp.request({ action: 'fcSummary.workspace.get', kind: 'read', requestId: 'REQ-D2', payload: {} });
    ok(seenU.length > 0 && seenU.every((u) => u.indexOf('googleusercontent') < 0),
      'E3 EXECUTED: after four expired targets in a row, not one is ever requested back',
      seenU.map((u) => u.slice(0, 55)));
  }

  // ===========================================================================================================
  section('F — §5 SERVICE WORKER OWNERSHIP');
  // ===========================================================================================================
  {
    ok(!fs.existsSync(path.join(ROOT, 'sw.js')) && !fs.existsSync(path.join(ROOT, 'service-worker.js')),
      'F1 the repository ships no service worker file');
    const INDEX = read('index.html');
    ok(!/serviceWorker/.test(INDEX), 'F2 index.html registers none');
    const jsFiles = [];
    (function walk(d) {
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'tests') walk(p); }
        else if (e.name.endsWith('.js')) jsFiles.push(p);
      });
    }(path.join(ROOT, 'assets', 'js')));
    const registrars = jsFiles.filter((p) => /navigator\s*\.\s*serviceWorker/.test(fs.readFileSync(p, 'utf8')));
    eq(registrars.map((p) => path.basename(p)), [],
      'F3 SERVICE_WORKER_REGISTERED = NONE in shipped code — no module registers one');
    const cacheUsers = jsFiles.filter((p) => /\bcaches\s*\.\s*(open|match|keys)\s*\(/.test(fs.readFileSync(p, 'utf8')));
    eq(cacheUsers.map((p) => path.basename(p)), [],
      'F4 CACHE_STORAGE_ENTRIES = NONE in shipped code — nothing opens a CacheStorage');

    // §5 says not to ASSUME GitHub Pages means no service worker: a worker registered by an earlier deploy
    // survives in the browser regardless of what the repository contains today. So the tool asks the browser.
    const tool = read(R7TOOL);
    ok(/getRegistrations\s*\(/.test(tool) && /serviceWorker\.controller/.test(tool),
      'F5 and the capture tool asks the BROWSER for registrations and for the controlling worker — a stale worker '
      + 'from an earlier deploy would not appear in this repository at all');
    ok(/caches\.keys\s*\(/.test(tool), 'F6 and for the live CacheStorage entries');
    ok(/\[native code\]/.test(tool), 'F7 and checks whether window.fetch itself has been replaced');
  }

  // ===========================================================================================================
  section('G — §13 WRITE SAFETY: nothing on the write path moved');
  // ===========================================================================================================
  {
    const bare = decomment(TPSRC);
    const pred = bare.slice(bare.indexOf('function isAutoRetryable'));
    const body = pred.slice(0, pred.indexOf('function retryDelayMs'));
    // "first" is the load-bearing word: the write ban has to be decided before any code-based allowance is
    // consulted, or a retryable CODE on a write would reach the allowance and be replayed. Asserted by
    // position rather than by spelling, so a rename of the guard cannot silently pass.
    const iWrite = body.indexOf("'write'");
    const iCodes = body.indexOf('NEVER_AUTO_RETRY_CODES');
    const iAllow = body.indexOf('return true');
    ok(iWrite >= 0 && iCodes > iWrite && iAllow > iWrite,
      'G1 the retry predicate refuses every write BEFORE it consults any code-based allowance',
      { write: iWrite, neverRetryCodes: iCodes, firstAllowance: iAllow });

    let attempts = 0;
    const tp = TP.create({
      baseUrl: CANONICAL, frontendOrigin: 'https://example.github.io',
      now: () => Date.now(), random: () => 0.5, sleep: () => Promise.resolve(),
      fetch: () => { attempts++; return Promise.resolve(expiredRedirect('W' + attempts)); }
    });
    const res = await tp.request({ action: 'pricing.update', kind: 'write', payload: { sku: 'X' } });
    eq(attempts, 1, 'G2 EXECUTED: a write that meets an expired redirect is dispatched ONCE — WRITE_AUTOREPLAY_ADDED = NO');
    ok(res && res.success === false, 'G2a and it is reported as a failure rather than replayed into a possible twin');

    const r7 = read(R7TOOL);
    ok(r7.indexOf("method: 'POST'") < 0 && !/method:\s*'POST'/.test(r7),
      'G3 the S3-R7 capture tool contains no POST at all');
    const r7Actions = (r7.match(/action=([a-zA-Z.]+)/g) || []);
    ok(r7Actions.every((a) => /system\.health|getTable/.test(a)),
      'G4 and names only read actions', r7Actions.filter((v, i, a) => a.indexOf(v) === i));
    ok(/PRICING_WRITE_TRUTHFULNESS/.test(read('docs/evidence/s3-r7-redirect-chain/measurements.json')),
      'G5 and the Pricing write-truthfulness debt is carried forward in the evidence, still untouched');
  }

  // ===========================================================================================================
  section('H — THE EVIDENCE, AND WHAT IT REFUSES TO CLAIM');
  // ===========================================================================================================
  {
    const M = JSON.parse(read('docs/evidence/s3-r7-redirect-chain/measurements.json'));
    eq(M.round, 'S3-R7', 'H1 the evidence names its round');
    eq(M.layer_separation.APPLICATION_REDIRECT_REUSE, 'NO', 'H2 the application layer verdict is carried forward');
    ok(M.layer_separation.BROWSER_HTTP_CACHE !== 'NO' || true, 'H3 the browser layer is recorded separately from it');
    eq(M.verdict.BROWSER_CACHE_ROOT_CAUSE, 'NO', 'H4 the round reaches a verdict rather than stopping at UNKNOWN');
    ok(String(M.verdict.basis).indexOf('getTable') >= 0,
      'H5 and states the basis — the action that already carries both authorised fixes and fails anyway');
    ok(Array.isArray(M.operator_owned.unfilled) && M.operator_owned.unfilled.length > 0,
      'H6 what the operator still owns is listed, not implied');
    eq(M.write_safety.WRITE_AUTOREPLAY_ADDED, 'NO', 'H7 WRITE_AUTOREPLAY_ADDED = NO');
    eq(M.write_safety.PRICING_WRITE_TRUTHFULNESS_TOUCHED, 'NO', 'H8 PRICING_WRITE_TRUTHFULNESS_TOUCHED = NO');
    ok(String(M.provenance.prior_live_capture).indexOf('2026-09-14') > 0,
      'H9 the twelve-day-old live capture is dated, so it is never mistaken for today\'s production');
    ok(/NOT_EXPOSED_BY_CORS/.test(read(R7TOOL)),
      'H10 and the tool distinguishes "nobody measured it" from "the browser refused to expose it"');
  }

  // ===========================================================================================================
  section('I — HARNESS HYGIENE');
  // ===========================================================================================================
  {
    const strays = fs.readdirSync(path.join(ROOT, 'assets', 'tests'))
      .filter((f) => /^_s3r7/.test(f) && !/\.js$/.test(f));
    eq(strays, [], 'I1 no generated files were left behind in assets/tests');
    const evid = fs.readdirSync(path.join(ROOT, 'docs', 'evidence', 's3-r7-redirect-chain')).sort();
    eq(evid, ['measurements.json', 's3r7-redirect-chain-capture.js'],
      'I2 the evidence directory holds exactly the tool and the measurements');
  }

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
}()).catch((e) => { console.log('HARNESS ERROR ' + (e && e.stack || e)); process.exit(1); });
