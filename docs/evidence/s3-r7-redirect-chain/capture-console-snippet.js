/* =================================================================================================================
   S3-R7 §2/§4/§5/§6/§9 — REDIRECT CHAIN + BROWSER CACHE CAPTURE.  READ ONLY.

   WHY THIS EXISTS
   ---------------
   S3-R5A proved that no APPLICATION code persists or re-requests an expired googleusercontent redirect target.
   That is a real result and it stands. It is also not the same claim as "the BROWSER is not reusing one", and
   this round refuses to let the first be quoted as the second. The layers are separate and are measured
   separately here:

       APPLICATION CACHE        already disproven (S3-R5A) — re-asserted from source, not re-measured here
       BROWSER HTTP CACHE       scenario matrix below
       FETCH CACHE MODE         scenario matrix below
       SERVICE WORKER           env() below
       GOOGLE REDIRECT LIFETIME key identity across attempts, below

   WHAT IT DOES, AND WHAT IT WILL NOT DO
   -------------------------------------
   · ZERO writes. Every request it issues is a GET, and every action it names is on the read registry.
   · It does NOT introduce a second transport contract. Canonical URLs come from KM.transport.readUrl(), and
     every answer is classified by the SHIPPED classifier — KM.transport.fingerprintHtml() and codeForHtml() —
     so a 404 counted here is a 404 by the same definition production uses. Raw fetch is used for one reason
     only: to VARY the cache mode, which is the independent variable §4 asks about and which no shipped
     dispatcher exposes.
   · It never prints a user_content_key. Keys are reported as an 8-hex-character identity hash and a length,
     which is everything an equality question needs and nothing a secret would leak.
   · It never invents a field. Anything the browser does not expose prints NOT_AVAILABLE or NOT_EXPOSED_BY_CORS,
     and the two are different: the first means nobody measured it, the second means the browser measured it and
     is refusing to hand it over.

   THE PROTOCOL
   ------------
   Run the whole thing TWICE, because scenario A and scenario B differ by a DevTools setting and not by code:

       PASS 1   DevTools → Network → "Disable cache" UNCHECKED   (browser cache enabled)
       PASS 2   DevTools → Network → "Disable cache" CHECKED     (browser cache disabled)

   In each pass, from the production site with the console open:

       __kmS3R7.env()                  // service worker / cache storage / fetch wrapper ownership
       await __kmS3R7.chain()          // one canonical read, traced hop by hop
       await __kmS3R7.matrix(2)        // the 2 x 4 scenario matrix, 2 repetitions
       __kmS3R7.report()               // the filled field block — paste this back

   Paste back all four blocks from BOTH passes, and say which pass was which.

   HOW LONG IT TAKES
   -----------------
   matrix(2) issues 16 requests sequentially: 2 actions x 4 scenarios x 2 repetitions. The cheap action answers
   in well under a second. The expensive one is a whole-table read and is currently failing in production, so
   budget up to the per-request bound (45 s) for each of its eight. Worst case is roughly six minutes per pass.
   Sequential is deliberate: a concurrent matrix would measure contention and call it cache behaviour.

   WHAT THE MATRIX IS ACTUALLY TESTING
   -----------------------------------
   A note on payloads: the cheap probe sends an EMPTY km_body, where a real page read sends its include and
   filter parameters. That is deliberate — this measures the redirect chain, not a workspace payload — and it
   means a row here is a transport outcome and never a statement about business data.

   Two variables, crossed on purpose:

       CACHE MODE   default (whatever the browser would do) | no-store | reload | unique-URL nonce
       READ COST    system.health (touches no sheet) | getTable (reads a whole sheet)

   If REDIRECT_TARGET_NOT_FOUND tracks the cache mode, the browser cache is the root cause and §8 authorises a
   fix. If it tracks the read COST instead — cheap reads fine, expensive reads failing, in every cache mode
   alike — then the cache is not the mechanism and §9 sends the investigation downstream. The second variable is
   what makes this capture able to answer the question rather than merely fail to reject it.
   ================================================================================================================= */
(function (root) {
  'use strict';

  var NA = 'NOT_AVAILABLE';
  var NOT_EXPOSED = 'NOT_EXPOSED_BY_CORS';
  var PROBE_TIMEOUT_MS = 45000;

  var _rows = [];          // every probe this session has issued
  var _keys = [];          // every user_content_key identity seen, in order

  function tp() { try { return (root.KM && root.KM.transport) || null; } catch (e) { return null; } }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  /* An identity, not a secret. djb2 over the key, printed as 8 hex characters. Two attempts that received the
     same key produce the same hash; that is the only question §6 asks of a key. */
  function idHash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function hostOf(u) {
    try { return new root.URL(u).host; } catch (e) { return NA; }
  }

  /* The redirect target's identity, from the final URL the browser actually landed on. */
  function keyOf(u) {
    var s = String(u || '');
    var at = s.indexOf('user_content_key=');
    if (at < 0) return { present: false, hash: NA, length: NA };
    var v = s.slice(at + 'user_content_key='.length);
    var amp = v.indexOf('&');
    if (amp >= 0) v = v.slice(0, amp);
    return { present: true, hash: idHash(v), length: v.length };
  }

  /* Only the CORS-safelisted response headers are readable on a cross-origin response. The rest are not missing
     — the browser has them and is refusing to expose them, because Apps Script sends no
     Access-Control-Expose-Headers. Saying NOT_EXPOSED_BY_CORS rather than NOT_AVAILABLE keeps that distinction,
     which matters: "we could not read Age" is not evidence that there was no Age. */
  var SAFELISTED = ['cache-control', 'content-language', 'content-length', 'content-type', 'expires',
    'last-modified', 'pragma'];
  var WANTED = ['cache-control', 'expires', 'last-modified', 'pragma', 'content-type',
    'age', 'etag', 'location', 'via', 'x-cache'];

  function headersOf(resp) {
    var out = {};
    WANTED.forEach(function (h) {
      var safelisted = SAFELISTED.indexOf(h) >= 0;
      var v = null;
      try { if (resp && resp.headers && typeof resp.headers.get === 'function') v = resp.headers.get(h); }
      catch (e) { v = null; }
      out[h] = (v != null && v !== '') ? v : (safelisted ? NA : NOT_EXPOSED);
    });
    return out;
  }

  /* Resource Timing, when the browser will give it up. Cross-origin entries without Timing-Allow-Origin report
     zero for every phase, and a zero here is a refusal rather than an instant response — so it is reported as
     such instead of being copied into a table as though it were a measurement. */
  function timingOf(url) {
    try {
      var es = root.performance.getEntriesByType('resource')
        .filter(function (e) { return e.name && e.name.indexOf(url.split('?')[0]) === 0; });
      if (!es.length) return { available: false, reason: 'no resource entry matched' };
      var e = es[es.length - 1];
      var opaque = (e.redirectStart === 0 && e.requestStart === 0 && e.responseStart === 0);
      if (opaque) {
        return { available: false,
          reason: 'cross-origin entry with no Timing-Allow-Origin — every phase reads 0, which is a refusal, not a duration',
          duration_ms: Math.round(e.duration) };
      }
      return { available: true,
        redirect_ms: Math.round(e.redirectEnd - e.redirectStart),
        request_to_response_ms: Math.round(e.responseStart - e.requestStart),
        response_ms: Math.round(e.responseEnd - e.responseStart),
        duration_ms: Math.round(e.duration) };
    } catch (err) { return { available: false, reason: String(err && err.message || err) }; }
  }

  /* THE SHIPPED CLASSIFIER, CALLED — not a second one written here. A code counted by this tool is the same
     code production would have recorded for the same answer. */
  function classify(resp, text, requestedUrl) {
    var t = tp();
    var status = (resp && typeof resp.status === 'number') ? resp.status : null;
    var ctype = '';
    try { if (resp && resp.headers) ctype = resp.headers.get('content-type') || ''; } catch (e) { ctype = ''; }
    var finalUrl = (resp && resp.url) || '';
    var looksHtml = text === '' || /^<(!doctype|html|\?xml|head|body)/i.test(text)
      || (/text\/html/i.test(ctype) && text.charAt(0) !== '{');
    if (looksHtml && t && typeof t.fingerprintHtml === 'function' && typeof t.codeForHtml === 'function') {
      var fp = t.fingerprintHtml({ body: text, status: status, contentType: ctype, finalUrl: finalUrl,
        requestedUrl: requestedUrl, redirected: resp && resp.redirected === true,
        frontendOrigin: root.location && root.location.origin });
      return { code: t.codeForHtml(fp), html_source: fp.source || NA };
    }
    if (looksHtml) return { code: 'HTML_RESPONSE_CLASSIFIER_UNAVAILABLE', html_source: NA };
    if (status !== null && !(status >= 200 && status < 300)) return { code: 'HTTP_TRANSPORT_ERROR', html_source: null };
    try { JSON.parse(text); } catch (pe) { return { code: 'TRANSPORT_NON_JSON_RESPONSE', html_source: null }; }
    // SUCCESS here means the TRANSPORT delivered parseable JSON from the API — not that the action itself
    // returned success:true. That is the right granularity for this round, whose whole question is whether a
    // request reached the API at all or died on an expired redirect, but it is stated rather than assumed so
    // that a row reading SUCCESS is never quoted as 'the read worked'.
    return { code: 'SUCCESS', html_source: null };
  }

  /* One probe. Bounded, aborted on expiry, and recorded whether it succeeds or fails — a failure here is the
     measurement, not an interruption of it. */
  function probe(scenario, action, url, init) {
    var ctl = null;
    try { ctl = (typeof AbortController === 'function') ? new AbortController() : null; } catch (e) { ctl = null; }
    var opts = {}; for (var k in init) if (Object.prototype.hasOwnProperty.call(init, k)) opts[k] = init[k];
    if (ctl) opts.signal = ctl.signal;

    var t0 = now();
    var wall = new Date().toISOString();
    var timedOut = false, timer = null;
    var expiry = new Promise(function (_r, rej) {
      timer = setTimeout(function () {
        timedOut = true;
        try { if (ctl) ctl.abort(); } catch (e2) {}
        rej(new Error('REQUEST_TIMEOUT'));
      }, PROBE_TIMEOUT_MS);
    });

    function row(extra) {
      var base = {
        scenario: scenario, action: action, cache_mode: init.cache || 'BROWSER_DEFAULT',
        dispatched_at: wall, requested_host: hostOf(url),
        requested_url_chars: url.length
      };
      for (var p in extra) if (Object.prototype.hasOwnProperty.call(extra, p)) base[p] = extra[p];
      _rows.push(base);
      return base;
    }

    return Promise.race([Promise.resolve().then(function () { return fetch(url, opts); }), expiry])
      .then(function (resp) {
        if (timer) clearTimeout(timer);
        var tHeaders = now() - t0;
        return Promise.resolve(resp.text()).then(function (text) {
          var tBody = now() - t0;
          var cls = classify(resp, String(text || ''), url);
          var key = keyOf(resp.url || '');
          if (key.present) _keys.push({ scenario: scenario, action: action, hash: key.hash, at: wall });
          return row({
            result: cls.code, html_source: cls.html_source,
            http_status: (typeof resp.status === 'number') ? resp.status : NA,
            redirected: resp.redirected === true,
            final_host: hostOf(resp.url || ''),
            usercontent_key_hash: key.present ? key.hash : NA,
            usercontent_key_length: key.present ? key.length : NA,
            to_headers_ms: Math.round(tHeaders), to_body_ms: Math.round(tBody),
            completed_at: new Date().toISOString(),
            response_bytes: String(text == null ? '' : text).length,
            response_headers: headersOf(resp),
            resource_timing: timingOf(url)
          });
        });
      }, function (err) {
        if (timer) clearTimeout(timer);
        return row({
          result: timedOut ? 'REQUEST_TIMEOUT' : 'HTTP_TRANSPORT_ERROR',
          html_source: null, http_status: NA, redirected: NA, final_host: NA,
          usercontent_key_hash: NA, usercontent_key_length: NA,
          to_headers_ms: Math.round(now() - t0), to_body_ms: NA,
          completed_at: new Date().toISOString(), response_bytes: NA,
          response_headers: NA, resource_timing: timingOf(url),
          error: String((err && err.message) || err).slice(0, 120)
        });
      });
  }

  /* ---- the two canonical READ URLs this tool probes --------------------------------------------------------
     CHEAP  system.health   — on the GET read registry, touches no sheet, and is the control.
     COSTLY getTable        — on the operator's own failing-action list, reads a whole sheet, and is the only
                              shipped read whose exact URL shape can be reproduced here without guessing at a
                              workspace payload and accidentally measuring a business rejection instead.
     Both are reads. Neither can mutate anything. */
  function execBase() {
    var t = tp();
    if (t && typeof t.endpoint === 'function') {
      var ep = t.endpoint();
      if (ep && ep.ok && ep.url) return ep.url;
      throw { code: 'ENDPOINT_NOT_AVAILABLE', detail: (ep && ep.reason) || NA };
    }
    if (root.KM && root.KM.DB && typeof root.KM.DB.getApiBaseUrl === 'function') return root.KM.DB.getApiBaseUrl();
    throw { code: 'ENDPOINT_NOT_AVAILABLE', detail: 'no transport and no KM.DB.getApiBaseUrl' };
  }

  function nonce() { return 'S3R7-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }

  /* Canonical, via the transport's own URL builder wherever it can build it — so the URL under test is the URL
     production dispatches, character for character, and not a reconstruction of it. */
  function urlFor(which, unique) {
    var t = tp();
    var base = execBase();
    if (which === 'cheap') {
      if (t && typeof t.readUrl === 'function') {
        // With unique=false the request id is omitted, which is what makes the URL repeat exactly. That is the
        // control condition for §7: two reads that genuinely share a URL.
        return t.readUrl('system.health', {}, unique ? ('REQ-' + nonce()) : '');
      }
      return base + '?action=system.health&km_via=get' + (unique ? '&km_probe_nonce=' + nonce() : '');
    }
    // getTable's shipped URL shape, from operation-system-db-api.js, minus the _ts it normally always carries —
    // so that "identical URL" is actually reachable as a control rather than assumed away.
    return base + '?action=getTable&table=sku_details'
      + (unique ? ('&_ts=' + Date.now() + '&km_probe_nonce=' + nonce()) : '');
  }

  var SCENARIOS = [
    { id: 'A_BROWSER_DEFAULT', init: {}, unique: false,
      note: 'no cache option given — whatever the browser would do on its own' },
    { id: 'C_NO_STORE', init: { cache: 'no-store' }, unique: false,
      note: "cache:'no-store' — what every shipped read already sends" },
    { id: 'B_RELOAD', init: { cache: 'reload' }, unique: false,
      note: "cache:'reload' — bypass the cache for reading AND revalidate; the in-page equivalent of DevTools 'Disable cache'" },
    { id: 'D_UNIQUE_URL', init: { cache: 'no-store' }, unique: true,
      note: 'a URL no cache can ever have seen before, on top of no-store' }
  ];

  var API = {

    /* ---- §5 — WHO ELSE COULD BE ANSWERING A REQUEST ------------------------------------------------------- */
    env: function () {
      var out = {
        SERVICE_WORKER_API_PRESENT: !!(root.navigator && root.navigator.serviceWorker),
        SERVICE_WORKER_CONTROLS_PAGE: NA,
        SERVICE_WORKER_REGISTERED: NA,
        SERVICE_WORKER_SCOPES: NA,
        CACHE_STORAGE_API_PRESENT: !!root.caches,
        CACHE_STORAGE_ENTRIES: NA,
        APP_LEVEL_FETCH_WRAPPER: NA,
        page_origin: (root.location && root.location.origin) || NA
      };

      // A wrapped fetch is detectable: a native one stringifies to "function fetch() { [native code] }".
      try {
        var src = String(root.fetch);
        out.APP_LEVEL_FETCH_WRAPPER = (src.indexOf('[native code]') >= 0) ? 'NONE — window.fetch is native'
          : 'PRESENT — window.fetch has been replaced; source head: ' + src.slice(0, 120);
      } catch (e) { out.APP_LEVEL_FETCH_WRAPPER = NA; }

      try {
        out.SERVICE_WORKER_CONTROLS_PAGE = !!(root.navigator && root.navigator.serviceWorker
          && root.navigator.serviceWorker.controller);
      } catch (e2) {}

      var jobs = [];
      if (root.navigator && root.navigator.serviceWorker && root.navigator.serviceWorker.getRegistrations) {
        jobs.push(root.navigator.serviceWorker.getRegistrations().then(function (rs) {
          out.SERVICE_WORKER_REGISTERED = rs.length > 0;
          out.SERVICE_WORKER_SCOPES = rs.length ? rs.map(function (r) { return r.scope; }) : 'NONE';
        }, function (e) { out.SERVICE_WORKER_REGISTERED = 'QUERY_FAILED: ' + e; }));
      } else { out.SERVICE_WORKER_REGISTERED = 'NONE — no serviceWorker API'; }

      if (root.caches && root.caches.keys) {
        jobs.push(root.caches.keys().then(function (ks) {
          out.CACHE_STORAGE_ENTRIES = ks.length ? ks : 'NONE';
        }, function (e) { out.CACHE_STORAGE_ENTRIES = 'QUERY_FAILED: ' + e; }));
      } else { out.CACHE_STORAGE_ENTRIES = 'NONE — no CacheStorage API'; }

      return Promise.all(jobs).then(function () {
        var text = '=== S3-R7 ENV @ ' + new Date().toISOString() + ' ===\n' + JSON.stringify(out, null, 1);
        root.console.log(text);
        return text;
      });
    },

    /* ---- §2 — ONE CANONICAL READ, TRACED --------------------------------------------------------------- */
    chain: function (which) {
      which = which || 'cheap';
      var url;
      try { url = urlFor(which, false); }
      catch (e) { root.console.log('=== S3-R7 CHAIN FAILED === ' + JSON.stringify(e)); return Promise.resolve(''); }
      return probe('CHAIN', which, url, { cache: 'no-store' }).then(function (r) {
        var out = {
          INITIAL_URL: 'masked — host + path only: ' + r.requested_host,
          INITIAL_HOST: r.requested_host,
          INITIAL_HTTP_STATUS: 'NOT_OBSERVABLE — fetch() follows redirects internally and exposes only the FINAL '
            + 'response. The 302 itself is never surfaced to script. redirected=' + r.redirected
            + ' proves at least one hop occurred.',
          REDIRECT_COUNT: (r.redirected === true) ? 'AT_LEAST_1 (exact count not exposed by fetch)' : '0',
          FINAL_HOST: r.final_host,
          FINAL_STATUS: r.http_status,
          FINAL_RESULT: r.result,
          HTML_SOURCE: r.html_source,
          USERCONTENT_KEY_HASH: r.usercontent_key_hash,
          USERCONTENT_KEY_LENGTH: r.usercontent_key_length,
          TO_HEADERS_MS: r.to_headers_ms, TO_BODY_MS: r.to_body_ms,
          DISPATCHED_AT: r.dispatched_at, COMPLETED_AT: r.completed_at,
          RESPONSE_HEADERS: r.response_headers,
          RESOURCE_TIMING: r.resource_timing
        };
        var text = '=== S3-R7 CHAIN (' + which + ') @ ' + new Date().toISOString() + ' ===\n'
          + JSON.stringify(out, null, 1)
          + '\nNOTE NOT_EXPOSED_BY_CORS means the browser HAS the header and will not hand it to script, because'
          + '\n     Apps Script sends no Access-Control-Expose-Headers. It is not evidence the header was absent.';
        root.console.log(text);
        return text;
      });
    },

    /* ---- §4/§6 — THE SCENARIO MATRIX ------------------------------------------------------------------- */
    matrix: function (reps) {
      reps = Math.max(1, Number(reps) || 2);
      var plan = [];
      ['cheap', 'costly'].forEach(function (which) {
        SCENARIOS.forEach(function (sc) {
          for (var i = 0; i < reps; i++) plan.push({ which: which, sc: sc, rep: i + 1 });
        });
      });

      var chain = Promise.resolve();
      plan.forEach(function (step) {
        chain = chain.then(function () {
          var url;
          try { url = urlFor(step.which, step.sc.unique); }
          catch (e) { root.console.log('SKIPPED ' + step.sc.id + ' — ' + JSON.stringify(e)); return null; }
          root.console.log('… ' + step.sc.id + ' / ' + step.which + ' rep ' + step.rep);
          return probe(step.sc.id, step.which, url, step.sc.init);
        });
      });

      return chain.then(function () {
        root.console.log('=== S3-R7 MATRIX DONE — now run __kmS3R7.report() ===');
        return API.report();
      });
    },

    /* ---- §16 — THE FIELD BLOCK, FILLED FROM WHAT WAS OBSERVED ------------------------------------------ */
    report: function () {
      var byScenario = {};
      _rows.forEach(function (r) {
        if (r.scenario === 'CHAIN') return;
        var k = r.scenario + ' / ' + r.action;
        var b = byScenario[k] || (byScenario[k] = { requests: 0, SUCCESS: 0, REDIRECT_404: 0, TIMEOUT: 0,
          OTHER: 0, final_hosts: {}, key_hashes: [] });
        b.requests++;
        if (r.result === 'SUCCESS') b.SUCCESS++;
        else if (r.result === 'REDIRECT_TARGET_NOT_FOUND') b.REDIRECT_404++;
        else if (r.result === 'REQUEST_TIMEOUT') b.TIMEOUT++;
        else b.OTHER++;
        if (r.final_host && r.final_host !== NA) b.final_hosts[r.final_host] = (b.final_hosts[r.final_host] || 0) + 1;
        if (r.usercontent_key_hash && r.usercontent_key_hash !== NA) b.key_hashes.push(r.usercontent_key_hash);
      });

      function count404(prefix) {
        var n = 0, seen = 0;
        Object.keys(byScenario).forEach(function (k) {
          if (k.indexOf(prefix) === 0) { n += byScenario[k].REDIRECT_404; seen += byScenario[k].requests; }
        });
        return seen === 0 ? NA : (n + ' of ' + seen);
      }

      var allHashes = _keys.map(function (k) { return k.hash; });
      var uniqueHashes = allHashes.filter(function (h, i) { return allHashes.indexOf(h) === i; });
      var keyVerdict = allHashes.length < 2 ? 'INSUFFICIENT_SAMPLES (' + allHashes.length + ' key(s) observed)'
        : (uniqueHashes.length === allHashes.length ? 'YES — every observed key was distinct'
          : 'NO — ' + (allHashes.length - uniqueHashes.length) + ' repeat(s) across ' + allHashes.length + ' keys');

      var out = {
        samples: _rows.length,
        per_scenario: byScenario,
        CACHE_ENABLED_REDIRECT_404: 'depends on the DevTools pass — record this run as pass 1 or pass 2',
        BROWSER_DEFAULT_REDIRECT_404: count404('A_BROWSER_DEFAULT'),
        NO_STORE_REDIRECT_404: count404('C_NO_STORE'),
        RELOAD_REDIRECT_404: count404('B_RELOAD'),
        UNIQUE_URL_REDIRECT_404: count404('D_UNIQUE_URL'),
        CHEAP_REDIRECT_404: (function () {
          var n = 0, s = 0;
          Object.keys(byScenario).forEach(function (k) {
            if (k.indexOf('cheap') > 0) { n += byScenario[k].REDIRECT_404; s += byScenario[k].requests; }
          });
          return s === 0 ? NA : (n + ' of ' + s);
        }()),
        COSTLY_REDIRECT_404: (function () {
          var n = 0, s = 0;
          Object.keys(byScenario).forEach(function (k) {
            if (k.indexOf('costly') > 0) { n += byScenario[k].REDIRECT_404; s += byScenario[k].requests; }
          });
          return s === 0 ? NA : (n + ' of ' + s);
        }()),
        USERCONTENT_KEY_CHANGES_PER_REQUEST: keyVerdict,
        SAME_EXPIRED_KEY_REAPPEARS: allHashes.length < 2 ? NA
          : (uniqueHashes.length === allHashes.length ? 'NO' : 'YES'),
        key_identities_in_order: _keys,
        HOW_TO_READ_THIS:
          'If the 404 rate tracks the CACHE MODE rows, the browser cache is implicated and S3-R7 §8 authorises a '
          + 'fix. If it tracks CHEAP vs COSTLY instead — flat across all four cache modes — the cache is not the '
          + 'mechanism and §9 applies. Both numbers are printed above so the comparison is made rather than assumed.'
      };
      var text = '=== S3-R7 REPORT @ ' + new Date().toISOString() + ' ===\n' + JSON.stringify(out, null, 1);
      root.console.log(text);
      return text;
    },

    /* Raw rows, if the summary above hides something worth seeing. */
    rows: function () { return _rows.slice(); },
    reset: function () { _rows = []; _keys = []; root.console.log('S3-R7 probe rows cleared'); },

    contract: {
      writes: 0, locks: 0, sheetMutations: 0, businessLogicChanges: 0,
      methods: ['GET'],
      actions: ['system.health', 'getTable'],
      classifierReused: 'KM.transport.fingerprintHtml + codeForHtml',
      urlBuilderReused: 'KM.transport.readUrl / KM.transport.endpoint',
      rawFetchUsedOnlyTo: 'vary the cache mode, which no shipped dispatcher exposes',
      printsSecrets: false,
      sequential: true
    }
  };

  root.__kmS3R7 = API;
  if (root.console) root.console.log('__kmS3R7 ready — see the header of this file for the two-pass protocol.');
}(typeof window !== 'undefined' ? window : this));
