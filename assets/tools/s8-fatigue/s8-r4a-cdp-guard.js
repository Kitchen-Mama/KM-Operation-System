// =============================================================================================================
// S8-R4A — CDP REQUEST GUARD
//
// The interception layer for browser / route-level read fatigue. It classifies every request Chrome is ABOUT TO
// SEND and either continues it or fails it at the socket. Nothing here opens a browser; this is the decision
// function plus the CDP wiring contract, so it can be reasoned about and tested without Production.
//
// WHY INTERCEPTION AND NOT A POLITE HARNESS. S8-R3B proved that Site Inventory's mount can reach
// gapJob.status.get — an action that, against a stale non-terminal job, persists STALLED, mutates Script
// Properties, deletes and creates triggers and resumes gap processing that WRITES both gap tables. A harness
// that asks the page nicely not to send it has no way to be sure. A guard that fails the request before the
// socket does.
//
// THE ORDERING PROPERTY THAT MATTERS. Fetch.enable with requestStage 'Request' pauses the request BEFORE it is
// issued. The decision is therefore taken on a request that has not been sent, and a refusal means nothing left
// the browser. `REQUEST_SENT_BEFORE_DECISION = NO` is a property of which CDP stage is used, and it is the one
// thing about this design that must never be quietly changed — so it is named in a constant, asserted by the
// suite, and the alternative stage is listed here as explicitly forbidden.
//
//   ALLOWED   Fetch.enable({ patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
//   FORBIDDEN Fetch.enable({ patterns: [{ ..., requestStage: 'Response' }] })   ← the request is already sent
//   FORBIDDEN Network.setRequestInterception / Network.requestWillBeSent alone  ← observation, not control
// =============================================================================================================

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.KMS8R4A = api; }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ROUND = 'S8-R4A';

  // The CDP contract, as data so the suite can assert it rather than read prose.
  var CDP = {
    layer: 'Fetch domain (Fetch.enable / Fetch.requestPaused / Fetch.failRequest / Fetch.continueRequest)',
    request_stage: 'Request',
    forbidden_stages: ['Response'],
    forbidden_domains: ['Network.setRequestInterception'],
    abort_method: 'Fetch.failRequest',
    abort_reason: 'BlockedByClient',
    request_sent_before_decision: false,
    deny_default: true
  };

  // ---------------------------------------------------------------------------------------------------------
  // §6 — TRAFFIC CLASSES. Every request Chrome makes falls in exactly one, and each has ONE policy.
  //
  // The failure this prevents is subtle: a guard narrow enough to be safe can also block the application's own
  // stylesheet, and a page that never rendered produces measurements that look like a performance finding.
  // ---------------------------------------------------------------------------------------------------------
  var CLASS = {
    STATIC_ASSET: 'A_STATIC_ASSET',
    APPROVED_READ: 'B_APPROVED_APPLICATION_READ',
    FORBIDDEN_ACTION: 'C_FORBIDDEN_APPLICATION_ACTION',
    THIRD_PARTY: 'D_THIRD_PARTY_OR_PLATFORM',
    UNKNOWN: 'E_UNKNOWN'
  };
  var POLICY = {
    A_STATIC_ASSET: 'CONTINUE — the application must be allowed to load. Counted, never blocked.',
    B_APPROVED_APPLICATION_READ: 'CONTINUE — on the frozen allowlist, correct verb. Counted and timed.',
    C_FORBIDDEN_APPLICATION_ACTION: 'ABORT at the socket. Counted. Never retried, never substituted.',
    D_THIRD_PARTY_OR_PLATFORM: 'CONTINUE, and RECORD the chain. A Google interstitial or redirect must stay ' +
      'observable; converting it to a success would erase the evidence S8-R3B F3 needs.',
    E_UNKNOWN: 'ABORT and REPORT. An application-shaped request nobody has classified is the case the ' +
      'standing gate rule 2 is about.'
  };

  // The application endpoint host. A request to it is an application request by definition; anything else that
  // is not a same-origin asset is third-party.
  var APP_HOST = 'script.google.com';
  var APP_ECHO_HOST = 'script.googleusercontent.com';   // the /exec 302 target — part of every answer
  var STATIC_EXT = /\.(?:html|css|js|mjs|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|map|txt|csv)(?:$|\?)/i;

  function str(v) { return (v === undefined || v === null) ? '' : String(v); }
  function hostOf(url) {
    var m = /^[a-z]+:\/\/([^/:?#]+)/i.exec(str(url));
    return m ? m[1].toLowerCase() : '';
  }

  // ---------------------------------------------------------------------------------------------------------
  // classify(req, ctx) — req = { url, method, postData, resourceType }
  //
  // ctx.decide  is the R3B allowlist's decide(); ctx.actionOf is its actionFromRequest(). They are INJECTED
  // rather than required here so there is exactly one allowlist in the system and this file cannot grow a
  // second opinion about which actions are approved.
  // ---------------------------------------------------------------------------------------------------------
  function classify(req, ctx) {
    req = req || {}; ctx = ctx || {};
    var url = str(req.url), method = str(req.method).toUpperCase() || 'GET';
    var host = hostOf(url);
    var pageHost = str(ctx.pageHost).toLowerCase();

    // data:/blob:/about: never reach the network.
    if (/^(?:data|blob|about|chrome|devtools):/i.test(url)) {
      return out(CLASS.STATIC_ASSET, true, 'NON_NETWORK_SCHEME', url, null);
    }

    // THE ACTION DECIDES FIRST, AND THE HOST ONLY AFTERWARDS.
    //
    // This ordering is the correction the local interception proof forced. The guard originally asked "is this
    // the application host?" and classified anything else as third-party — so a request CARRYING A FORBIDDEN
    // ACTION but pointed at any other host was waved straight through. The proof aimed both requests at a local
    // sink, and the sink recorded gapJob.status.get arriving. A guard whose refusal depends on the destination
    // is not refusing the action; it is refusing one address for it.
    //
    // A forbidden action is forbidden wherever it is pointed. So the action is extracted from EVERY request
    // first, and a recognised application action makes the request an application request by itself.
    var action = (typeof ctx.actionOf === 'function') ? ctx.actionOf(url, req.postData) : '';
    var known = action !== '' && typeof ctx.isKnownAction === 'function' ? ctx.isKnownAction(action) : (action !== '');
    var isApp = (host === APP_HOST || host === APP_ECHO_HOST) || known;

    if (!isApp) {
      // Same-origin (or file://) asset — the app's own HTML partials, scripts, styles, images.
      if (host === '' || host === pageHost || STATIC_EXT.test(url)) {
        return out(CLASS.STATIC_ASSET, true, 'STATIC_ASSET', url, null);
      }
      return out(CLASS.THIRD_PARTY, true, 'THIRD_PARTY', url, null);
    }

    if (action === '') {
      // An application-host request carrying no action. The /exec 302 target is one of these and must be let
      // through or no answer ever arrives; anything else at the application host is unclassified.
      if (host === APP_ECHO_HOST) return out(CLASS.THIRD_PARTY, true, 'EXEC_REDIRECT_TARGET', url, null);
      return out(CLASS.UNKNOWN, false, 'APPLICATION_REQUEST_WITH_NO_ACTION', url, null);
    }
    var d = (typeof ctx.decide === 'function')
      ? ctx.decide({ action: action, method: method, url: url })
      : { ok: false, code: 'NO_DECIDER_INJECTED' };
    if (d.ok) return out(CLASS.APPROVED_READ, true, 'ALLOWLISTED', url, action);
    if (d.code === 'ACTION_FORBIDDEN') return out(CLASS.FORBIDDEN_ACTION, false, d.code, url, action);
    // Everything else the allowlist refuses — unapproved action, wrong verb, wrong endpoint — is refused here
    // too, and carries the allowlist's own code so the report can say which rule fired.
    return out(CLASS.UNKNOWN, false, d.code || 'REFUSED', url, action);
  }
  function out(cls, allow, code, url, action) {
    return { cls: cls, allow: allow, code: code, action: action || null,
             policy: POLICY[cls], url_head: str(url).slice(0, 120) };
  }

  // ---------------------------------------------------------------------------------------------------------
  // The CDP command a decision becomes. Kept here so the wiring cannot drift from the decision: a classifier
  // that returns "abort" and a transport that calls continueRequest would be a silent failure of the whole
  // design, and this is the one place both are written down together.
  // ---------------------------------------------------------------------------------------------------------
  function commandFor(decision, requestId) {
    return decision.allow
      ? { method: 'Fetch.continueRequest', params: { requestId: requestId } }
      : { method: 'Fetch.failRequest', params: { requestId: requestId, errorReason: CDP.abort_reason } };
  }

  // A fresh counter set. The field names are the §12 measurement contract's, so a report cannot quietly
  // rename one.
  function newLedger() {
    return {
      REQUEST_COUNT_TOTAL: 0,
      APPLICATION_READ_REQUEST_COUNT: 0,
      STATIC_ASSET_REQUEST_COUNT: 0,
      THIRD_PARTY_REQUEST_COUNT: 0,
      FORBIDDEN_REQUEST_ABORT_COUNT: 0,
      UNKNOWN_REQUEST_ABORT_COUNT: 0,
      byAction: {},
      aborted: []
    };
  }
  function record(ledger, decision) {
    ledger.REQUEST_COUNT_TOTAL++;
    if (decision.cls === CLASS.APPROVED_READ) {
      ledger.APPLICATION_READ_REQUEST_COUNT++;
      ledger.byAction[decision.action] = (ledger.byAction[decision.action] || 0) + 1;
    } else if (decision.cls === CLASS.STATIC_ASSET) ledger.STATIC_ASSET_REQUEST_COUNT++;
    else if (decision.cls === CLASS.THIRD_PARTY) ledger.THIRD_PARTY_REQUEST_COUNT++;
    else if (decision.cls === CLASS.FORBIDDEN_ACTION) {
      ledger.FORBIDDEN_REQUEST_ABORT_COUNT++;
      ledger.aborted.push({ cls: decision.cls, action: decision.action, code: decision.code });
    } else {
      ledger.UNKNOWN_REQUEST_ABORT_COUNT++;
      ledger.aborted.push({ cls: decision.cls, action: decision.action, code: decision.code, url: decision.url_head });
    }
    return ledger;
  }

  // ---------------------------------------------------------------------------------------------------------
  // §13 — REQUEST AMPLIFICATION. Compare per-cycle request counts against the FIRST FULL cycle.
  //
  // Cycle 1 is excluded as the baseline and cycle 2 is excluded as well, because the first return is where
  // legitimately-cached assets stop being requested — a count that DROPS between cycle 1 and 2 is the cache
  // working, not a leak. From cycle 2 onward the count must be FLAT; any monotonic rise is the signature.
  // ---------------------------------------------------------------------------------------------------------
  function amplification(cycleCounts) {
    var c = (cycleCounts || []).slice();
    if (c.length < 4) return { verdict: 'INSUFFICIENT_CYCLES', cycles: c.length, needed: 4 };
    var base = c[1];                                   // cycle 2 — after first-return caching has settled
    var tail = c.slice(1);
    var rising = 0, maxDelta = 0;
    for (var i = 1; i < tail.length; i++) {
      if (tail[i] > tail[i - 1]) rising++;
      if (tail[i] - base > maxDelta) maxDelta = tail[i] - base;
    }
    var flat = tail.every(function (n) { return n === base; });
    if (flat) return { verdict: 'FLAT', base: base, cycles: c.length };
    // A monotonic rise over most of the tail is a leak; scattered variance is not.
    if (rising >= Math.ceil((tail.length - 1) * 0.6) && maxDelta > 0) {
      return { verdict: 'REQUEST_LEAK_CANDIDATE', base: base, max_delta: maxDelta,
               rising_steps: rising, of: tail.length - 1, cycles: c.length };
    }
    return { verdict: 'VARIABLE_NOT_MONOTONIC', base: base, max_delta: maxDelta,
             rising_steps: rising, of: tail.length - 1, cycles: c.length };
  }

  return {
    ROUND: ROUND, CDP: CDP, CLASS: CLASS, POLICY: POLICY,
    APP_HOST: APP_HOST, APP_ECHO_HOST: APP_ECHO_HOST,
    classify: classify, commandFor: commandFor,
    newLedger: newLedger, record: record, amplification: amplification
  };
}));
